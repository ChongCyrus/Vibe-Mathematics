// vmu library — records, cards, content identity and the head list (docs/07 §4).
//
// This is the capability the v5r line paid the most to learn, so the four lessons are structural here:
//   1. CONTENT IDENTITY IS COMPUTED IN ONE PLACE (`fingerprint`) over the substantive parts only
//      (statement + proof, NOT the display head: title, id, recorder, time). Changing a label must not
//      change identity; changing the statement must;
//   2. `list()` returns the HEAD LIST ONLY (seven fields, no body) and is rebuilt from disk on every
//      call, so "the catalogue is always resident, the body is fetched on demand";
//   3. a dangling id is refused BY NAME (`VMU_NO_SUCH_OBJECT`) and never answered with an empty body or
//      an approximation;
//   4. every truncation carries a notice in the text AND a counted record in `truncationReport()`.
// Storage is plain files under the workspace (docs/07 §6), and the fingerprints are persisted WITH the
// record: reads read the stored value back rather than recomputing it, so the writer and the reader can
// never disagree (the v5r PR#16 lesson).

import { mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** The seven head-list fields (docs/07 §4.3). The body is never part of this shape. */
export const HEAD_FIELDS = Object.freeze(['id', 'kind', 'title', 'fingerprint', 'status', 'owner', 'updatedAt'])

/** The three card kinds (docs/07 §4.1) and where they live. */
export const KINDS = Object.freeze({ proposition: 'Propos', method: 'Methods', subproblem: 'Subproblems' })

/** Default byte cap for one expanded body (overridable per call); truncation is always reported. */
export const BODY_CAP_BYTES = 32 * 1024

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  return err
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
const nowIso = (clock) => clock()

/**
 * Create a library over one workspace root. `tracks` come from the resolved settings
 * (`vmu.records.tracks`), `headListAt` from `vmu.records.headListAt`, `truncateMode` from
 * `vmu.records.truncateMode`, and `fingerprintPolicy` from `vmu.records.fingerprintPolicy`.
 */
export function createLibrary({
  root,
  tracks = ['progress', 'routes', 'obstacles', 'rejected', 'state'],
  headListAt = 7,
  truncateMode = 'keepChars',
  fingerprintPolicy = 'content-only',
  bodyCapBytes = BODY_CAP_BYTES,
  clock = () => new Date().toISOString(),
} = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw refuse('VMU_INVALID_ARGUMENT', 'createLibrary needs a workspace root', 'pass { root }')
  }
  const truncation = []
  const index = new Map() // id -> { id, kind, dir, file, head }

  const memberDir = (member) => join(root, 'Members', member)
  const progressFile = (member, track) => join(memberDir(member), 'Progress', track + '.md')
  const cardDir = (member, kind) => join(memberDir(member), KINDS[kind])

  /**
   * The ONLY place content identity is computed (docs/07 §4.2). `parts` are the substantive parts; the
   * display head is deliberately excluded when `fingerprintPolicy` is the default `content-only`.
   */
  function fingerprint(kind, parts) {
    if (!Object.prototype.hasOwnProperty.call(KINDS, kind)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'unknown record kind: ' + String(kind), 'one of ' + Object.keys(KINDS).join(', '))
    }
    if (!parts || typeof parts !== 'object') {
      throw refuse('VMU_INVALID_ARGUMENT', 'fingerprint needs the substantive parts', 'pass { statement, proof? }')
    }
    const statement = String(parts.statement === undefined ? '' : parts.statement)
    if (statement.trim().length === 0) {
      throw refuse('VMU_INVALID_ARGUMENT', 'a fingerprint needs a non-empty statement')
    }
    const substantive = [kind, statement]
    if (parts.proof !== undefined && parts.proof !== null) substantive.push(String(parts.proof))
    if (fingerprintPolicy === 'content+display') {
      substantive.push(String(parts.title === undefined ? '' : parts.title))
      if (parts.recorder !== undefined) substantive.push(String(parts.recorder))
    }
    return createHash('sha256').update(substantive.join('\u0000'), 'utf8').digest('hex')
  }

  const truncate = (text, cap, what) => {
    if (text.length <= cap) return text
    const dropped = text.length - cap
    let kept
    if (truncateMode === 'keepHeadTail') {
      const head = Math.floor(cap / 2)
      kept = text.slice(0, head) + '\n…\n' + text.slice(text.length - (cap - head))
    } else if (truncateMode === 'dropMiddle') {
      const each = Math.floor(cap / 2)
      kept = text.slice(0, each) + '\n…\n' + text.slice(text.length - each)
    } else {
      kept = text.slice(text.length - cap)
    }
    truncation.push({ path: what, kept: kept.length, dropped, mode: truncateMode })
    return '（已省略更早 ' + dropped + ' 字符 · kept ' + kept.length + '）\n' + kept
  }

  const head = (rec) => {
    const out = {}
    for (const f of HEAD_FIELDS) out[f] = rec[f] === undefined ? null : rec[f]
    return out
  }

  /** Rebuild the head list from disk (docs/07 §4.3): never cached, never carrying a body. */
  async function rebuildIndex() {
    index.clear()
    let members = []
    try { members = await readdir(join(root, 'Members')) } catch { members = [] }
    for (const member of members) {
      for (const [kind, dir] of Object.entries(KINDS)) {
        let files = []
        try { files = await readdir(join(root, 'Members', member, dir)) } catch { continue }
        for (const f of files) {
          if (!f.endsWith('.md')) continue
          const file = join(root, 'Members', member, dir, f)
          const raw = await readFile(file, 'utf8')
          const meta = parseRecord(raw)
          const id = meta.id || f.replace(/\.md$/, '')
          index.set(id, {
            id, kind, member, file,
            title: meta.title || id, status: meta.status || 'open',
            owner: meta.owner || member,
            fingerprint: meta.fingerprint || null, // READ BACK, never recomputed (docs/07 §4.2)
            updatedAt: meta.updatedAt || null,
          })
        }
      }
    }
    return index
  }

  function parseRecord(raw) {
    const meta = {}
    const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw)
    if (m) {
      for (const line of m[1].split('\n')) {
        const kv = /^([a-zA-Z]+):\s?(.*)$/.exec(line.trim())
        if (kv) meta[kv[1]] = kv[2].trim()
      }
    }
    return meta
  }

  const render = (meta, body) => {
    const lines = Object.entries(meta).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => k + ': ' + v)
    return '---\n' + lines.join('\n') + '\n---\n\n' + body.replace(/\s*$/, '') + '\n'
  }

  return {
    get root() { return root },

    fingerprint,

    /** Append a card. Same substantive content twice => same id (idempotent), never a silent duplicate. */
    async append(record = {}, opts = {}) {
      const kind = record.kind
      const fp = fingerprint(kind, record)
      await rebuildIndex()
      const existing = [...index.values()].find((r) => r.kind === kind && r.fingerprint === fp)
      if (existing) {
        return { ok: true, id: existing.id, fingerprint: fp, deduplicated: true, file: existing.file }
      }
      const member = record.owner || opts.member || 'shared'
      const dir = cardDir(member, kind)
      await mkdir(dir, { recursive: true })
      const id = (record.id ? slug(record.id) : slug((record.title || record.statement).slice(0, 40))) + '-' + fp.slice(0, 8)
      const file = join(dir, id + '.md')
      const meta = {
        id, kind, fingerprint: fp,
        title: record.title || record.statement.slice(0, 60),
        status: record.status || 'open',
        owner: member,
        updatedAt: nowIso(clock),
      }
      await writeFile(file, render(meta, String(record.statement) + (record.proof ? '\n\n' + record.proof : '')), 'utf8')
      index.set(id, Object.assign({ file }, meta))
      return { ok: true, id, fingerprint: fp, deduplicated: false, file }
    },

    /** Append a progress line to one track. An unknown track is refused by name (docs/07 §4.1). */
    async record(member, track, text) {
      if (!tracks.includes(track)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'unknown record track: ' + String(track),
          'declared tracks: ' + tracks.join(', ') + ' (vmu.records.tracks)')
      }
      const file = progressFile(member, track)
      await mkdir(join(memberDir(member), 'Progress'), { recursive: true })
      let prev = ''
      try { prev = await readFile(file, 'utf8') } catch { prev = '# ' + track + '\n' }
      const line = '- ' + nowIso(clock) + ' ' + String(text).replace(/\s*\n\s*/g, ' ') + '\n'
      await writeFile(file, prev.replace(/\s*$/, '\n') + line, 'utf8')
      return { ok: true, file, track, member }
    },

    /** The head list: seven fields, no body, rebuilt from disk (docs/07 §4.3, item 2). */
    async list(filter = {}) {
      await rebuildIndex()
      const rows = [...index.values()].filter((r) =>
        (filter.kind === undefined || r.kind === filter.kind) &&
        (filter.member === undefined || r.member === filter.member))
      rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      return rows.slice(0, Math.max(1, headListAt === 0 ? rows.length : Math.max(headListAt, rows.length))).map(head)
    },

    /** Expand one record by id. A dangling id is refused by name - never an empty body (docs/07 §4.3). */
    async expand(id, { capBytes = bodyCapBytes } = {}) {
      await rebuildIndex()
      const rec = index.get(id)
      if (!rec) {
        throw refuse('VMU_NO_SUCH_OBJECT', 'no record with id ' + String(id),
          'call list() for the head list; ids are never guessed or approximated')
      }
      const raw = await readFile(rec.file, 'utf8')
      const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/^\s+/, '')
      const kept = truncate(body, capBytes, rec.file)
      return { ok: true, head: head(rec), body: kept, truncated: kept !== body, path: rec.file }
    },

    /** Counted truncations (docs/07 §4.4). Reading it does not clear it: the surface stays auditable. */
    truncationReport() {
      return truncation.map((t) => Object.assign({}, t))
    },

    /** One record's persisted metadata, for gates that need the stored fingerprint (never recomputed). */
    async storedFingerprint(id) {
      await rebuildIndex()
      const rec = index.get(id)
      if (!rec) throw refuse('VMU_NO_SUCH_OBJECT', 'no record with id ' + String(id))
      return { ok: true, id, fingerprint: rec.fingerprint }
    },

    async status() {
      await rebuildIndex()
      return {
        root,
        tracks: tracks.slice(),
        headListAt,
        fingerprintPolicy,
        truncateMode,
        records: index.size,
        kinds: [...index.values()].reduce((acc, r) => { acc[r.kind] = (acc[r.kind] || 0) + 1; return acc }, {}),
        truncation: truncationReport(),
      }
    },
  }
}

/** Small helper so a caller can tell "record file" from "progress file" without importing path logic twice. */
export async function exists(p) {
  try { await stat(p); return true } catch { return false }
}
