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

import { mkdir, readdir, readFile, writeFile, stat, rename, unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { guardWrite } from './guard.js'
import { createLibraryPolicy } from './library-policy.js'   // ROUND 235: the extracted policy checkers
import { readSetting } from './settings-defaults.js'        // PHASE 6 / P0: the ONE declared-default reader

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
  settings = {},
  tracks = ['progress', 'routes', 'obstacles', 'rejected', 'state'],
  headListAt = 7,
  truncateMode = 'keepChars',
  fingerprintPolicy = 'content-only',
  bodyCapBytes = BODY_CAP_BYTES,
  // ROUND 496: OPTIONAL, so every existing caller keeps working. It exists so the archival write can announce itself to
  // middleware BEFORE anything is created on disk - the point of a `before` hook, and the shape the volume promises.
  bus = null,
  // ROUND 228: the fingerprint family (`vmu.fingerprint.*`), read here because this face computes content identity.
  fingerprintAlgo = (settings && settings['vmu.fingerprint.algo']) || 'sha256',
  fingerprintTruncate = (() => { const v = Number(settings && settings['vmu.fingerprint.truncate']); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0 })(),
  fingerprintIncludeMeta = (settings && settings['vmu.fingerprint.includeMeta']) === true,
  // P1-9: optional read-only lookup of the CURRENT defect truth (`passedWithdrawn`). History rows keep the old body
  // (a historical fact); the export's `currentDefect` is the current truth. Absent ⇒ null (zero mechanism).
  defectLookup = null,
  // ROUND 230: the tags family (`vmu.tags.*`).
  tagsControlled = (settings && settings['vmu.tags.controlled']) === true,
  tagsMaxDepth = (() => { const v = Number(settings && settings['vmu.tags.maxDepth']); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 3 })(),
  tagsAliasTable = (settings && settings['vmu.tags.aliasTable']) || '',
  // ROUND 231: refs and dedupe.
  refsRequireTarget = (settings && settings['vmu.refs.requireTarget']) !== false,
  refsDanglingPolicy = (settings && settings['vmu.refs.danglingPolicy']) === 'reject' ? 'reject' : 'list',
  refsBacklinkDepth = (() => { const v = Number(settings && settings['vmu.refs.backlinkDepth']); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 1 })(),
  dedupeWider = (settings && settings['vmu.dedupe.enabled']) === true,
  dedupeScope = (settings && settings['vmu.dedupe.scope']) === 'segment' ? 'segment' : 'full',
  dedupeCrossWorkspace = (settings && settings['vmu.dedupe.crossWorkspace']) === true,
  // ROUND 237: the naming conflict policy.
  namingConflictPolicy = (settings && settings['vmu.naming.conflictPolicy']) === 'suffix' ? 'suffix' : 'refuse',
  // ROUND 236: the search family.
  searchAnalyzer = ['simple', 'cjk', 'bigram'].includes(settings && settings['vmu.search.analyzer'])
    ? settings['vmu.search.analyzer'] : 'bigram',
  searchMaxResults = (() => { const v = Number(settings && settings['vmu.search.maxResults']); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 50 })(),
  searchSnippetLen = (() => { const v = Number(settings && settings['vmu.search.snippetLen']); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 200 })(),
  // ROUND 234: visibility and export.
  visibilityDefault = (settings && settings['vmu.visibility.default']) === 'public' ? 'public' : 'internal',
  exportFormat = ['json', 'md', 'package'].includes(settings && settings['vmu.export.format'])
    ? settings['vmu.export.format'] : 'json',
  exportIncludeHistory = (settings && settings['vmu.export.includeHistory']) === true,
    // ROUND 293 (volume 07 §L615-§L618): the PACKAGE export - container and contents. `export.format` says what SHAPE the export
    // has; these say what the package carries when that shape IS a package. DESTRUCTURING defaults, like their siblings.
    packContainer = (['tar', 'zip'].includes(settings && settings['vmu.pack.format']) ? settings['vmu.pack.format'] : 'tar'),
    packIncludeBody = (settings && settings['vmu.pack.includeBody']) !== false,
    packIncludeTrash = (settings && settings['vmu.pack.includeTrash']) === true,
  // ROUND 233: the index family.
  indexRebuildBatch = (() => { const v = Number(settings && settings['vmu.index.rebuildBatch']); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 500 })(),
  indexVerifyChecksum = (settings && settings['vmu.index.verifyChecksum']) !== false,
  indexStaleTolerance = (settings && settings['vmu.index.staleTolerance']) === 'tolerate' ? 'tolerate' : 'rebuild',
  // ROUND 232: metadata and provenance.
  metadataCustomPrefix = (settings && typeof settings['vmu.metadata.customPrefix'] === 'string' && settings['vmu.metadata.customPrefix'])
    ? settings['vmu.metadata.customPrefix'] : 'x-',
  metadataStrictness = ['strict', 'warn', 'loose'].includes(settings && settings['vmu.metadata.strictness'])
    ? settings['vmu.metadata.strictness'] : 'warn',
  provenanceDepth = (() => { const v = Number(settings && settings['vmu.provenance.depth']); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0 })(),
  provenanceInputFingerprint = (settings && settings['vmu.provenance.recordInputFingerprint']) !== false,
  clock = () => new Date().toISOString(),
  // PHASE 6 / P0 (goal-3 audit R2): the declared default is `diff` (settings/schema.js); this read used to fall back
  // to `full`, so a default deployment kept full history and lost the diff-mode BASELINE protection. One reader now.
  storeMode = readSetting(settings, 'vmu.records.history.storeMode'),
} = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw refuse('VMU_INVALID_ARGUMENT', 'createLibrary needs a workspace root', 'pass { root }')
  }
  // Enforcement point: every library write is decided by the resolved path policy.
  const gate = (target, kind) => guardWrite({ settings, root, target, kind })
  const truncation = []
  // ROUND 230: the controlled vocabulary and its aliases, registered by the caller (this face reads no tag files itself).
  // ROUND 235: the six policy checkers moved VERBATIM into `kernel/library-policy.js` - `createLibrary` had grown to 620
  // lines, which the bounded editor of this project measures and refuses to edit. The index is injected lazily because it is
  // declared just below, and nothing about the behaviour changes: the same refusals, in the same order, with the same text.
  const libraryPolicy = createLibraryPolicy({
    refuse,
    getIndex: () => index,
    cfg: {
      tagsControlled, tagsAliasTable, tagsMaxDepth,
      metadataCustomPrefix, metadataStrictness,
      provenanceDepth, provenanceInputFingerprint,
      refsRequireTarget, refsDanglingPolicy, refsBacklinkDepth,
    },
  })
  const { registerVocabulary, checkMetadata, provenanceOf, checkReferences, backlinks, checkTags } = libraryPolicy
  const index = new Map() // id -> { id, kind, dir, file, head }
  let lastIndexHealth = null

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
    // ROUND 228: the algorithm is DECLARED. A declared algorithm this runtime cannot provide is refused by name here, where
    // the caller can act on it, rather than surfacing as an opaque throw from node's crypto.
    let hash
    try { hash = createHash(fingerprintAlgo) }
    catch (e) {
      throw refuse('VMU_INVALID_ARGUMENT', 'vmu.fingerprint.algo names a digest this runtime does not have: ' + String(fingerprintAlgo),
        'node provides sha256/sha512; use one of those, or add a blake3 implementation deliberately (vmu.fingerprint.algo)')
    }
    const meta = []
    if (fingerprintIncludeMeta) {
      // The metadata that `content-only` excludes: who recorded it, and when it was recorded.
      if (parts.recorder !== undefined) meta.push(String(parts.recorder))
      if (parts.at !== undefined) meta.push(String(parts.at))
    }
    const hex = hash.update(substantive.concat(meta).join('\u0000'), 'utf8').digest('hex')
    if (fingerprintTruncate > 0 && hex.length > fingerprintTruncate) {
      truncation.push({ what: 'fingerprint', dropped: hex.length - fingerprintTruncate, at: clock() })
      return hex.slice(0, fingerprintTruncate)
    }
    return hex
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
  const health = { read: 0, deferred: 0, unreadable: [], missingId: [], limit: indexRebuildBatch }
    let members = []
    try { members = await readdir(join(root, 'Members')) } catch { members = [] }
    for (const member of members) {
      for (const [kind, dir] of Object.entries(KINDS)) {
        let files = []
        try { files = await readdir(join(root, 'Members', member, dir)) } catch { continue }
        for (const f of files) {
          if (!f.endsWith('.md')) continue
          const file = join(root, 'Members', member, dir, f)
          // ROUND 233: vmu.index.rebuildBatch bounds ONE pass; the remainder is DEFERRED and counted, never silently dropped.
          if (health.read >= indexRebuildBatch) { health.deferred += 1; continue }
          health.read += 1
          let raw = null
          try { raw = await readFile(file, 'utf8') } catch (e) {
            // vmu.index.verifyChecksum: an unreadable file is REPORTED rather than vanishing from the index without a word.
            if (indexVerifyChecksum) health.unreadable.push(file)
            continue
          }
          const meta = parseRecord(raw)
          if (!meta.id && indexVerifyChecksum) health.missingId.push(file)   // ROUND 233: reported, then indexed
          const id = meta.id || f.replace(/\.md$/, '')
          index.set(id, {
            id, kind, member, file,
            title: meta.title || id, status: meta.status || 'open',
            owner: meta.owner || member,
            fingerprint: meta.fingerprint || null, // READ BACK, never recomputed (docs/07 §4.2)
        references: meta.references ? String(meta.references).split(',').filter(Boolean) : [],   // ROUND 231
        visibility: meta.visibility || visibilityDefault,   // ROUND 234: READ BACK, and the declaration fills the gap
      statement: meta.statement === undefined || meta.statement === 'null' ? undefined : String(meta.statement),   // ROUND 231
            updatedAt: meta.updatedAt || null,
          })
        }
      }
    }
    lastIndexHealth = health   // ROUND 233: kept so indexHealth() can report what happened
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

  /**
   * Deletion-contract helpers (task-81). The trash is a `.trash/` subdirectory of the card directory:
   * `rebuildIndex()` ignores it (it only reads `*.md` directly inside the card dir), so trashed records
   * disappear from the head list without any index surgery.
   */
  const TRASH_DIR = '.trash'
  const isPermanent = (meta) => !!(meta && (meta.permanent === 'true' || meta.status === 'permanent'))
  const trashDirOf = (file) => join(dirname(file), TRASH_DIR)
  const bodyOf = (raw) => raw.replace(/^---\n[\s\S]*?\n---\n?/, '')

  /**
   * Revision helpers (task-87). Revisions live beside the record as `<id>@<rev>.md`; rev numbers are
   * POSITIVE integers, monotonic and never reused. In `storeMode='diff'` the BASELINE revision (the
   * lowest one) is never pruned, matching the retention contract.
   */
  const REV_RE = /@(\d+)\.md$/
  const revisionFiles = async (dir, id) => {
    let files = []
    try { files = await readdir(dir) } catch { return [] }
    return files.filter((f) => f.startsWith(id + '@') && REV_RE.test(f)).map((f) => ({ rev: Number(REV_RE.exec(f)[1]), file: join(dir, f) })).sort((a, b) => a.rev - b.rev)
  }
  const highWaterPath = (dir, id) => join(dir, '.' + id + '.rev')
  const readHighWater = async (dir, id) => {
    try { const n = Number(String(await readFile(highWaterPath(dir, id), 'utf8')).trim()); return Number.isInteger(n) && n > 0 ? n : 0 } catch { return 0 }
  }
  // monotonic ACROSS pruning: a freed rev number is never handed out again (high-water mark on disk)
  const nextRev = async (dir, id) => {
    const revs = await revisionFiles(dir, id)
    const maxFile = revs.length ? revs[revs.length - 1].rev : 0
    const hw = await readHighWater(dir, id)
    return Math.max(maxFile, hw) + 1
  }
  const readTrash = async () => {
    const out = []
    let members = []
    try { members = await readdir(join(root, 'Members')) } catch { return out }
    for (const member of members) {
      for (const [kind, dir] of Object.entries(KINDS)) {
        let files = []
        try { files = await readdir(join(root, 'Members', member, dir, TRASH_DIR)) } catch { continue }
        for (const f of files) {
          if (!f.endsWith('.md')) continue
          const file = join(root, 'Members', member, dir, TRASH_DIR, f)
          const meta = parseRecord(await readFile(file, 'utf8'))
          out.push({
            id: meta.id || f.replace(/\.md$/, ''), kind, member, file,
            title: meta.title || null, fingerprint: meta.fingerprint || null,
            status: meta.status || 'open', owner: meta.owner || member,
            updatedAt: meta.updatedAt || null, trashedAt: meta.trashedAt || null, reason: meta.reason || null,
          })
        }
      }
    }
    return out
  }

  return {
    get root() { return root },

    fingerprint,
    registerVocabulary,
    checkTags,
    checkReferences,
    backlinks,
    checkMetadata,
    provenanceOf,
    indexHealth: () => lastIndexHealth,

    /** Append a card. Same substantive content twice => same id (idempotent), never a silent duplicate. */
    async append(record = {}, opts = {}) {
      // ROUND 496: `record/append-before` was frozen WITH a default policy and nothing emitted it. It fires HERE, before any
      // validator runs and before anything touches disk, so a middleware can refuse an archival write by name.
      if (bus && typeof bus.emit === 'function') {
        const seen = await bus.emit('record/append-before', { kind: record && record.kind, track: record && record.track, member: (opts && opts.member) || null }, { member: (opts && opts.member) || undefined })
        if (seen && seen.ok === false) throw refuse((seen.refused && seen.refused.code) || 'VMU_MIDDLEWARE_FAILED', (seen.refused && seen.refused.message) || 'a middleware refused record/append-before', (seen.refused && seen.refused.hint) || null)
      }
      if (record.tags !== undefined) checkTags({ tags: record.tags })   // ROUND 230: a validator nobody calls is inert
    const refCheck = record.references !== undefined ? checkReferences({ references: record.references }) : null   // ROUND 231
    const metaCheck = checkMetadata({ record })   // ROUND 232: a custom field must be prefixed, and the strictness decides what
    // ROUND 238: the provenance chain. `provenanceOf` existed and was exported, but NOTHING called it - so the two provenance
    // keys were read into a function no path reached. A record may declare `inputs`, and the chain is bounded by the depth.
    const provCheck = record.inputs !== undefined ? provenanceOf({ inputs: record.inputs }) : null
                                                  // happens to one that is not - refused, reported, or accepted (default: reported)
      const kind = record.kind
      const fp = fingerprint(kind, record)
      await rebuildIndex()
      // ROUND 231: EXACT-IDENTITY dedupe is the face INVARIANT and is not tunable - vmu.dedupe.enabled defaults to false,
      // and reading it as "dedupe off" would destroy the documented "same content twice => same id" lesson.
      const existing = [...index.values()].find((r) => r.kind === kind && r.fingerprint === fp)
      if (existing) {
        return { ok: true, id: existing.id, fingerprint: fp, deduplicated: true, deduplicatedBy: 'identity', file: existing.file, references: refCheck ? refCheck.references : [], dangling: refCheck ? refCheck.dangling : [] }
      }
      // The OPTIONAL wider layer, which is what vmu.dedupe.* governs. Off by default, so nothing above changes.
      if (dedupeWider) {
        if (dedupeCrossWorkspace && !opts.workspaceScope) {
          throw refuse('VMU_INVALID_ARGUMENT', 'vmu.dedupe.crossWorkspace=true needs an explicit workspace scope',
            'pass opts.workspaceScope (a list of workspace ids); this face does not scan other roots by itself')
        }
        const scope = Array.isArray(opts.workspaceScope) ? new Set(opts.workspaceScope.map(String)) : null
        const wider = [...index.values()].find((r) => {
          if (r.kind !== kind) return false
          if (scope && !scope.has(String(r.member || 'shared'))) return false
          if (dedupeScope === 'segment') return r.statement !== undefined && String(r.statement) === String(record.statement)
          return false
        })
        if (wider) {
          return { ok: true, id: wider.id, fingerprint: fp, deduplicated: true, deduplicatedBy: dedupeScope, file: wider.file,
            scope: dedupeScope, references: refCheck ? refCheck.references : [], dangling: refCheck ? refCheck.dangling : [] }
        }
      }
      const member = record.owner || opts.member || 'shared'
      const dir = cardDir(member, kind)
      const id = (record.id ? slug(record.id) : slug((record.title || record.statement).slice(0, 40))) + '-' + fp.slice(0, 8)
      const file = join(dir, id + '.md')
    // ROUND 237: `vmu.naming.conflictPolicy` decides what happens when a DIFFERENT record already owns that name. The
    // declared default is `refuse`: two records may share content (that is the dedupe above) but must not silently share a
    // name. `suffix` is the deliberate alternative, and the receipt says which suffix it used.
    let nameConflict = null
    // A file name cannot collide - it ends with the fingerprint - but the HUMAN name can: it is the slug prefix. That is the
    // name `vmu.naming.conflictPolicy` governs, so the check looks for a different record whose id carries the same prefix.
    const slugPrefix = (record.id ? slug(record.id) : slug((record.title || record.statement).slice(0, 40)))
    // ONLY an explicitly requested name is a claim on that name. A name derived from a title is not: two records may share a
    // title with different content, which is exactly what content identity means here, so the declared default must not
    // refuse that. This is the same trap the dedupe switch set, and the same answer: the default protects the guarantee.
    const explicitName = typeof record.id === 'string' && record.id.trim() !== ''
    const taken = explicitName
      ? [...index.values()].find((r) => r.kind === kind && r.id !== id && r.id.indexOf(slugPrefix + '-') === 0)
      : undefined
    if (taken) {
      if (namingConflictPolicy === 'refuse') {
        throw refuse('VMU_CONFLICT', 'another record already owns the name ' + slugPrefix + ': ' + taken.id,
          'pass a different record.id or title, or set vmu.naming.conflictPolicy=suffix deliberately')
      }
      let n = 2
      while (index.has(slugPrefix + '-' + n) || await exists(join(dir, slugPrefix + '-' + n + '.md')).catch(() => false)) n += 1
      nameConflict = { policy: 'suffix', tried: slugPrefix, used: slugPrefix + '-' + n }
    }
      // GATE FIRST, THEN TOUCH THE FILESYSTEM. Independent verification (task-34) proved that `mkdir` used to
      // run BEFORE the gate, so an out-of-policy write was refused only AFTER its directory had been created -
      // a refusal with a side effect. A refused write must leave the disk untouched.
      gate(file, 'library write')
      await mkdir(dir, { recursive: true })
      const meta = {
        id, kind, fingerprint: fp,
          visibility: (record.visibility === 'public' || record.visibility === 'internal') ? record.visibility : visibilityDefault,   // ROUND 234
      references: refCheck && refCheck.references.length ? refCheck.references.join(',') : null,   // ROUND 231
          statement: record.statement === undefined ? null : String(record.statement),   // ROUND 231: segment-scope dedupe needs it
      inputs: provCheck && provCheck.kept.length ? provCheck.kept.join(',') : null,   // ROUND 238: the bounded provenance chain
        title: record.title || record.statement.slice(0, 60),
        status: record.status || 'open',
        owner: member,
        updatedAt: nowIso(clock),
      }
      await writeFile(file, render(meta, String(record.statement) + (record.proof ? '\n\n' + record.proof : '')), 'utf8')
      index.set(id, Object.assign({ file }, meta))
      return { ok: true, id: nameConflict ? nameConflict.used : id, fingerprint: fp, deduplicated: false, file: nameConflict ? join(dir, nameConflict.used + '.md') : file,
        provenance: provCheck ? { depth: provCheck.depth, kept: provCheck.kept.length, dropped: provCheck.dropped, droppedIsCounted: provCheck.droppedIsCounted, inputFingerprint: provCheck.inputFingerprint } : null,
        nameConflict,
        references: refCheck ? refCheck.references : [], dangling: refCheck ? refCheck.dangling : [] }
    },

    /** Append a progress line to one track. An unknown track is refused by name (docs/07 §4.1). */
    async record(member, track, text) {
      // ★★★ LIVE RUN 18 (the institute's own report, 「本轮无实质残余：否」 item 3): a member's reply carried
      // `record: { track: {...} }` — the TRACK slot held the payload object — and the refusal answered
      // `unknown record track: [object Object]`. That names neither the real problem (a SHAPE error, not an unknown
      // name) nor the fix, so the member could not act on it and had to be told by a human. `String(x)` on an object
      // is always `[object Object]`, which is the diagnostic equivalent of saying nothing.
      if (typeof track !== 'string' || track.trim() === '') {
        const shape = track === null ? 'null'
          : track === undefined ? 'undefined'
            : Array.isArray(track) ? 'array[' + track.length + ']'
              : typeof track === 'object' ? 'object{' + Object.keys(track).slice(0, 6).join(', ') + '}'
                : typeof track + ' ' + JSON.stringify(track)
        throw refuse('VMU_RECORD_SHAPE', 'record needs a track NAME (a string); the track slot holds ' + shape,
          'send { record: { track: "<one of: ' + tracks.join(' | ') + '>", text: "<one line>" } } — the track is the NAME of the list, never the payload object')
      }
      if (!tracks.includes(track)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'unknown record track: ' + String(track),
          'declared tracks: ' + tracks.join(', ') + ' (vmu.records.tracks)')
      }
      const file = progressFile(member, track)
      // Same rule as append(): the gate runs BEFORE anything is created on disk.
      gate(file, 'library write')
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
      // Trashed records are invisible by default (rebuildIndex never sees them); `includeTrash` opts in.
      if (filter.includeTrash) { const tr = await readTrash(); for (const t of tr) rows.push(t) }
      // A ROW CAP, and it is COUNTED when it bites (docs/07 §4.4: truncation is never silent). The previous
      // bound was `Math.max(headListAt, rows.length)`, which always resolved to rows.length - so the knob had
      // NO observable effect at all (found by the 2026-10-09 docs-vs-code audit, its finding #35). `0` = all.
      const heads = rows.map(head)
      if (!(headListAt > 0) || heads.length <= headListAt) return heads
      const kept = heads.slice(0, headListAt)
      truncation.push({ path: 'head-list', kept: kept.length, dropped: heads.length - kept.length, mode: 'head-list-at' })
      return kept
    },

    /**
   * ROUND 236: search the head list. `vmu.search.analyzer` decides HOW text is compared - `simple` by word, `cjk` per
   * character, `bigram` by adjacent pairs (the declared default) - and the analyzer really changes what matches, which is what
   * makes it a setting rather than decoration. `vmu.search.maxResults` caps the hits and the cap is COUNTED when it bites, and
   * `vmu.search.snippetLen` bounds the excerpt, marked with an ellipsis rather than silently cut.
   */
  async search({ text = '', filter = {}, analyzer = searchAnalyzer, maxResults = searchMaxResults, snippetLen = searchSnippetLen } = {}) {
    if (!['simple', 'cjk', 'bigram'].includes(analyzer)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'unknown search analyzer: ' + String(analyzer), 'vmu.search.analyzer is one of simple/cjk/bigram')
    }
    const needle = String(text === null || text === undefined ? '' : text)
    const analyse = (s) => {
      const low = String(s).toLowerCase()
      if (analyzer === 'cjk') return [...low]
      if (analyzer === 'simple') return low.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
      const grams = []
      for (let i = 0; i + 2 <= low.length; i += 1) grams.push(low.slice(i, i + 2))
      return grams
    }
    const wanted = new Set(analyse(needle))
    await rebuildIndex()
    const src = [...index.values()].filter((r) =>
      (filter.kind === undefined || r.kind === filter.kind) && (filter.member === undefined || r.member === filter.member))
    const hits = []
    for (const r of src) {
      const hay = String(r.title || '') + ' ' + String(r.statement === undefined ? '' : r.statement)
      const terms = analyse(hay)
      const score = wanted.size === 0 ? 0 : terms.reduce((n, g) => n + (wanted.has(g) ? 1 : 0), 0)
      if (wanted.size > 0 && score === 0) continue
      const at = hay.toLowerCase().indexOf(needle.toLowerCase())
      const from = at < 0 ? 0 : at
      const cut = hay.slice(from, from + snippetLen)
      hits.push(Object.assign(head(r), {
        score,
        snippet: cut.length < hay.length - from ? cut + '...' : cut,
        snippetTruncated: cut.length < hay.length - from,
      }))
    }
    hits.sort((a, b) => (b.score - a.score) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    const capped = hits.slice(0, maxResults)
    if (capped.length < hits.length) truncation.push({ path: 'search', kept: capped.length, dropped: hits.length - capped.length, mode: 'max-results' })
    return { ok: true, analyzer, query: needle, hits: capped, total: hits.length, dropped: hits.length - capped.length, snippetLen, enforced: ['vmu.search.analyzer', 'vmu.search.maxResults', 'vmu.search.snippetLen'], fired: hits.length ? ['vmu.search.analyzer'] : [] }
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
    /**
   * ROUND 234: export one record in the declared format.
   * `vmu.visibility.default` is `internal`, and an internal record does NOT leave without `allowInternal` - a default that
   * could be bypassed by simply asking would not be a default. `vmu.export.includeHistory` decides whether the revisions travel
   * with it, and how many were included is REPORTED.
   */
  async exportRecord(id, { format = exportFormat, includeHistory = exportIncludeHistory, allowInternal = false,
    container: askedContainer = null, includeBody: askedBody = null, includeTrash: askedTrash = null } = {}) {
    // ROUND 293: the package declarations govern a PACKAGE export only. Supplying one for another shape is refused BY NAME
    // rather than silently ignored, and an explicit container must be one the declaration allows.
    const packOptionsGiven = askedContainer !== null || askedBody !== null || askedTrash !== null
    if (format !== 'package' && packOptionsGiven) {
      throw refuse('VMU_INVALID_ARGUMENT', 'package options were given for a ' + String(format) + ' export',
        'pass format: package, or drop them (vmu.pack.* governs the package export)')
    }
    const containerFinal = askedContainer === null ? packContainer : (['tar', 'zip'].includes(askedContainer) ? askedContainer : null)
    if (askedContainer !== null && containerFinal === null) {
      throw refuse('VMU_INVALID_ARGUMENT', 'unknown package container: ' + String(askedContainer),
        'declared containers: tar/zip (vmu.pack.format)')
    }
    const bodyFinal = askedBody === null ? packIncludeBody : askedBody === true
    const trashFinal = askedTrash === null ? packIncludeTrash : askedTrash === true
    const rec = index.get(String(id))
    if (!rec) throw refuse('VMU_INVALID_ARGUMENT', 'no such record: ' + String(id), 'list() shows the ids that exist')
    if (!['json', 'md', 'package'].includes(format)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'unknown export format: ' + String(format), 'vmu.export.format is one of json/md/package')
    }
    const visibility = rec.visibility || visibilityDefault
    if (visibility !== 'public' && !allowInternal) {
      throw refuse('VMU_NOT_PERMITTED', 'the record is ' + visibility + ' and exportRecord was not told to allow it',
        'pass { allowInternal: true } deliberately, or set vmu.visibility.default=public (it is internal by default)')
    }
    const expanded = await this.expand(rec.id, {})   // ROUND 234: a sibling method, not a lexical name
    const revs = includeHistory ? await revisionFiles(rec.file) : []
    // P1-9: history rows are FACTS about the past; `currentDefect` is the CURRENT truth. The verified track's defect
    // marker (`fidelity.passedWithdrawn`) is looked up for the card's logical `- ID:` anchor, never guessed from a title.
    const idAnchor = /(?:^|\n)- ID:\s*(.+)/.exec(String(expanded.body || ''))
    // Missing anchor is NAMED, not guessed: a record id is not the defect key (the marker is keyed by the card ID).
    const currentDefect = !idAnchor
      ? { ok: false, code: 'VMU_PACK_V3_DEFECT_TARGET_UNRESOLVED', unresolved: true, withdrawn: false,
          message: 'the exported record has no `- ID:` anchor, so the current defect truth cannot be resolved',
          hint: 'the defect marker is keyed by the card ID; add the anchor or read the verified track directly' }
      : (typeof defectLookup === 'function' ? defectLookup(idAnchor[1].trim()) : null)
    const body = {
      id: rec.id, kind: rec.kind, title: rec.title, status: rec.status, owner: rec.owner,
      fingerprint: rec.fingerprint, visibility, updatedAt: rec.updatedAt,
      references: rec.references || [], statement: rec.statement,
      // P1-9: a reader that wants "current proof" must use this; `history[]` is explicitly historical.
      currentDefect,
    }
    const historyIncluded = { asked: includeHistory === true, count: revs.length }
    if (format === 'json') return { ok: true, format, visibility, history: historyIncluded, currentDefect, text: JSON.stringify({ head: body, body: expanded.body, history: revs }, null, 2) }
    if (format === 'md') {
      // ★ (a) machine-readable: the defect truth goes into the YAML frontmatter as a field. The blockquote form was
      // prepended BEFORE `---`, which broke the one invariant every markdown/frontmatter parser relies on
      // (frontmatter must start at character 0). The object field is removed from the meta view and replaced by a
      // compact scalar; nothing human-facing is injected into the body.
      const mdMeta = Object.assign({}, body)
      delete mdMeta.currentDefect
      if (currentDefect && currentDefect.withdrawn === true) mdMeta.current_defect = 'withdrawn (' + String(currentDefect.markerId || '') + ')'
      else if (currentDefect && currentDefect.unresolved === true) mdMeta.current_defect = 'unresolved (' + String(currentDefect.code || '') + ')'
      return { ok: true, format, visibility, history: historyIncluded, currentDefect, text: render(mdMeta, expanded.body) }
    }
    return { ok: true, format, visibility, history: historyIncluded, currentDefect, manifest: body, text: expanded.body,
      package: { container: containerFinal, includeBody: bodyFinal, includeTrash: trashFinal } }
  },

  async storedFingerprint(id) {
      await rebuildIndex()
      const rec = index.get(id)
      if (!rec) throw refuse('VMU_NO_SUCH_OBJECT', 'no record with id ' + String(id))
      return { ok: true, id, fingerprint: rec.fingerprint }
    },

    /**
     * === Deletion contract (task-81) ===
     * `kernel/retention.js` calls remove/removeRevision/moveToTrash/restore; before this they did not
     * exist, so retention could delete nothing (it counted `skippedUnsupported`). Every path here runs
     * through the SAME `gate()` as writes, so the path policy is never bypassed.
     */
    async moveToTrash({ id, reason = null } = {}) {
      await rebuildIndex()
      const rec = index.get(id)
      if (!rec) throw refuse('VMU_NO_SUCH_OBJECT', 'no record with id ' + String(id), 'call list() for the head list; ids are never guessed')
      const meta = parseRecord(await readFile(rec.file, 'utf8'))
      if (isPermanent(meta)) throw refuse('VMU_RETENTION_CONFLICT', 'record ' + id + ' is marked permanent and cannot be deleted', 'permanent records are protected (docs/20 §6); clear the marker first')
      const dir = trashDirOf(rec.file)
      gate(dir, 'library delete')
      const at = nowIso(clock)
      try { await mkdir(dir, { recursive: true }) } catch (e) { throw refuse('VMU_IO_FAILED', 'trash move failed at step mkdir: ' + String((e && e.message) || e), 'step=mkdir') }
      const to = join(dir, id + '.md')
      try { await rename(rec.file, to) } catch (e) { throw refuse('VMU_IO_FAILED', 'trash move failed at step rename: ' + String((e && e.message) || e), 'step=rename') }
      // Tombstone: the trash copy carries WHY and WHEN, so the deletion is traceable on disk.
      try {
        const tomb = { ...meta, trashedAt: at, reason: reason === null ? '' : String(reason) }
        await writeFile(to, render(tomb, bodyOf(await readFile(to, 'utf8'))), 'utf8')
      } catch (e) { throw refuse('VMU_IO_FAILED', 'trash move failed at step tombstone: ' + String((e && e.message) || e), 'step=tombstone') }
      index.delete(id)
      return { ok: true, id, kind: rec.kind, fingerprint: rec.fingerprint, reason: reason === null ? null : String(reason), at, from: rec.file, to, step: 'done' }
    },

    async remove({ id, reason = null } = {}) {
      await rebuildIndex()
      const rec = index.get(id)
      if (!rec) throw refuse('VMU_NO_SUCH_OBJECT', 'no record with id ' + String(id), 'call list() for the head list; ids are never guessed')
      const meta = parseRecord(await readFile(rec.file, 'utf8'))
      if (isPermanent(meta)) throw refuse('VMU_RETENTION_CONFLICT', 'record ' + id + ' is marked permanent and cannot be deleted', 'permanent records are protected (docs/20 §6); clear the marker first')
      gate(rec.file, 'library delete')
      const at = nowIso(clock)
      try { await unlink(rec.file) } catch (e) { throw refuse('VMU_IO_FAILED', 'remove failed at step unlink: ' + String((e && e.message) || e), 'step=unlink') }
      index.delete(id)
      return { ok: true, id, kind: rec.kind, fingerprint: rec.fingerprint, reason: reason === null ? null : String(reason), at, path: rec.file, step: 'done' }
    },

    /** Revisions live beside the record as `<id>@<rev>.md`; a missing one is refused by name. */
    async removeRevision({ id, rev, reason = null } = {}) {
      await rebuildIndex()
      const rec = index.get(id)
      if (!rec) throw refuse('VMU_NO_SUCH_OBJECT', 'no record with id ' + String(id), 'call list() for the head list; ids are never guessed')
      if (rev === undefined || rev === null || String(rev).length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'removeRevision needs rev', 'pass rev:<n>; use remove({id}) to delete the whole record')
      const file = join(dirname(rec.file), id + '@' + String(rev) + '.md')
      if (!(await exists(file))) throw refuse('VMU_NO_SUCH_OBJECT', 'no revision ' + String(rev) + ' for ' + id, 'revisions are stored as <id>@<rev>.md next to the record')
      const meta = parseRecord(await readFile(file, 'utf8'))
      // task-87: in diff store mode the BASELINE revision (lowest rev) is never pruned.
      if (storeMode === 'diff') {
        const all = await revisionFiles(dirname(rec.file), id)
        if (all.length && all[0].rev === Number(rev)) throw refuse('VMU_RETENTION_CONFLICT', 'revision ' + String(rev) + ' of ' + id + ' is the baseline and cannot be pruned while storeMode=diff', 'baseline revisions are protected (vmu.records.history.storeMode)')
      }
      if (isPermanent(meta)) throw refuse('VMU_RETENTION_CONFLICT', 'revision ' + String(rev) + ' of ' + id + ' is marked permanent', 'permanent records are protected (docs/20 §6)')
      gate(file, 'library delete')
      const at = nowIso(clock)
      try { await unlink(file) } catch (e) { throw refuse('VMU_IO_FAILED', 'removeRevision failed at step unlink: ' + String((e && e.message) || e), 'step=unlink') }
      return { ok: true, id, rev: String(rev), reason: reason === null ? null : String(reason), at, path: file, step: 'done' }
    },

    /** Restore a trashed record: same id, same stored fingerprint, back in its original directory. */
    async restore({ id } = {}) {
      const trashed = await readTrash()
      const t = trashed.find((r) => r.id === id)
      if (!t) throw refuse('VMU_NO_SUCH_OBJECT', 'nothing trashed with id ' + String(id), 'listTrash() shows what can be restored')
      const dir = KINDS[t.kind] ? join(root, 'Members', t.member, KINDS[t.kind]) : dirname(t.file)
      const to = join(dir, id + '.md')
      gate(to, 'library write')
      const at = nowIso(clock)
      try { await mkdir(dir, { recursive: true }) } catch (e) { throw refuse('VMU_IO_FAILED', 'restore failed at step mkdir: ' + String((e && e.message) || e), 'step=mkdir') }
      try { await rename(t.file, to) } catch (e) { throw refuse('VMU_IO_FAILED', 'restore failed at step rename: ' + String((e && e.message) || e), 'step=rename') }
      await rebuildIndex()
      const back = index.get(id)
      return { ok: true, id, kind: t.kind, fingerprint: back ? back.fingerprint : t.fingerprint, at, path: to, step: 'done' }
    },

    /** Read-only view of the trash (head-list shape plus WHY/WHEN). */
    async listTrash() {
      const rows = await readTrash()
      return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, fingerprint: r.fingerprint, status: r.status, owner: r.owner, updatedAt: r.updatedAt, trashedAt: r.trashedAt, reason: r.reason }))
    },

    /**
     * === Revision write path (task-87) ===
     * Freeze the current record as `<id>@<rev>.md`. Every commit is traceable (who/when/why) and the rev
     * number is monotonic and never reused. The write goes through the SAME gate as every other write.
     */
    async commitRevision({ id, by = null, reason = null } = {}) {
      await rebuildIndex()
      const rec = index.get(id)
      if (!rec) throw refuse('VMU_NO_SUCH_OBJECT', 'no record with id ' + String(id), 'call list() for the head list; ids are never guessed')
      if (!by) throw refuse('VMU_INVALID_ARGUMENT', 'commitRevision needs by (who freezes this revision)', 'pass by:<member>; the trace must name who committed')
      const dir = dirname(rec.file)
      const rev = await nextRev(dir, id)
      const file = join(dir, id + '@' + rev + '.md')
      gate(file, 'library write')
      const raw = await readFile(rec.file, 'utf8')
      const at = nowIso(clock)
      const meta = { ...parseRecord(raw), rev, by: String(by), reason: reason === null ? '' : String(reason), at, baseline: rev === 1 ? 'true' : 'false' }
      let body
      try { body = bodyOf(raw) } catch (e) { throw refuse('VMU_IO_FAILED', 'commitRevision failed at step read-body: ' + String((e && e.message) || e), 'step=read-body') }
      try { await writeFile(file, render(meta, body), 'utf8') } catch (e) { throw refuse('VMU_IO_FAILED', 'commitRevision failed at step write-revision: ' + String((e && e.message) || e), 'step=write-revision') }
      // High-water mark: survives pruning, so a freed rev number is never reused (monotonic contract).
      try { await writeFile(highWaterPath(dir, id), String(rev), 'utf8') } catch (e) { throw refuse('VMU_IO_FAILED', 'commitRevision failed at step write-highwater: ' + String((e && e.message) || e), 'step=write-highwater') }
      return { ok: true, id, rev, by: String(by), reason: reason === null ? null : String(reason), at, path: file, fingerprint: rec.fingerprint, step: 'done' }
    },

    /** Read one frozen revision (read-only). */
    async revision({ id, rev } = {}) {
      await rebuildIndex()
      const rec = index.get(id)
      if (!rec) throw refuse('VMU_NO_SUCH_OBJECT', 'no record with id ' + String(id), 'call list() for the head list')
      if (rev === undefined || rev === null) throw refuse('VMU_INVALID_ARGUMENT', 'revision needs rev', 'pass rev:<n>; use revisions({id}) to list them')
      const file = join(dirname(rec.file), id + '@' + String(rev) + '.md')
      if (!(await exists(file))) throw refuse('VMU_NO_SUCH_OBJECT', 'no revision ' + String(rev) + ' for ' + id, 'revisions() lists the frozen versions')
      const raw = await readFile(file, 'utf8')
      const meta = parseRecord(raw)
      return { ok: true, id, rev: Number(rev), by: meta.by || null, reason: meta.reason || null, at: meta.at || null, baseline: meta.baseline === 'true', fingerprint: meta.fingerprint || null, body: bodyOf(raw) }
    },

    /** List frozen revisions (read-only, counted truncation like every other list). */
    async revisions({ id, limit = 0 } = {}) {
      await rebuildIndex()
      const rec = index.get(id)
      if (!rec) throw refuse('VMU_NO_SUCH_OBJECT', 'no record with id ' + String(id), 'call list() for the head list')
      const all = await revisionFiles(dirname(rec.file), id)
      const items = all.map((r) => ({ rev: r.rev, path: r.file }))
      if (!(limit > 0) || items.length <= limit) return { id, items, total: items.length, dropped: 0, storeMode }
      const kept = items.slice(0, limit)
      truncation.push({ path: 'revisions:' + id, kept: kept.length, dropped: items.length - kept.length, mode: 'revision-limit' })
      return { id, items: kept, total: items.length, dropped: items.length - kept.length, storeMode }
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
        truncation: truncation.map((t) => Object.assign({}, t)),
      }
    },
  }
}

/** Small helper so a caller can tell "record file" from "progress file" without importing path logic twice. */
export async function exists(p) {
  try { await stat(p); return true } catch { return false }
}
