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
  // ROUND 228: the fingerprint family (`vmu.fingerprint.*`), read here because this face computes content identity.
  fingerprintAlgo = (settings && settings['vmu.fingerprint.algo']) || 'sha256',
  fingerprintTruncate = (() => { const v = Number(settings && settings['vmu.fingerprint.truncate']); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0 })(),
  fingerprintIncludeMeta = (settings && settings['vmu.fingerprint.includeMeta']) === true,
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
  storeMode = (settings && settings['vmu.records.history.storeMode']) || 'full',
} = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw refuse('VMU_INVALID_ARGUMENT', 'createLibrary needs a workspace root', 'pass { root }')
  }
  // Enforcement point: every library write is decided by the resolved path policy.
  const gate = (target, kind) => guardWrite({ settings, root, target, kind })
  const truncation = []
  // ROUND 230: the controlled vocabulary and its aliases, registered by the caller (this face reads no tag files itself).
  const vocabulary = new Set()
  const aliases = new Set()
  const registerVocabulary = ({ tags = null, aliasTags = null } = {}) => {
    if (Array.isArray(tags)) for (const x of tags) if (typeof x === 'string' && x.trim()) vocabulary.add(x.trim())
    if (Array.isArray(aliasTags)) for (const x of aliasTags) if (typeof x === 'string' && x.trim()) aliases.add(x.trim())
    return { ok: true, vocabulary: vocabulary.size, aliases: aliases.size, controlled: tagsControlled,
      aliasTable: tagsAliasTable || null, enforced: ['vmu.tags.controlled', 'vmu.tags.aliasTable'], fired: [] }
  }
  // ROUND 232: the fields this face knows. A field outside this set must be prefixed (metadata.customPrefix) or it falls
  // under metadata.strictness, whose declared default is `warn` - reported, not refused, and never silently dropped.
  const KNOWN_FIELDS = new Set(['id', 'kind', 'title', 'status', 'owner', 'updatedAt', 'fingerprint', 'references', 'statement',
    'tags', 'provenance', 'inputFingerprint'])
  const checkMetadata = ({ record = {} } = {}) => {
    const enforced = ['vmu.metadata.strictness', 'vmu.metadata.customPrefix']
    const customs = []
    const unknown = []
    for (const k of Object.keys(record)) {
      if (KNOWN_FIELDS.has(k)) continue
      if (k.startsWith(metadataCustomPrefix)) { customs.push(k); continue }
      unknown.push(k)
    }
    const fired = unknown.length || customs.length ? ['vmu.metadata.strictness'] : []
    if (unknown.length && metadataStrictness === 'strict') {
      throw refuse('VMU_INVALID_ARGUMENT', 'field(s) neither known nor prefixed with ' + metadataCustomPrefix + ': ' + unknown.join(', '),
        'prefix custom fields with ' + metadataCustomPrefix + ', or set vmu.metadata.strictness to warn/loose deliberately',
        { unknown, customPrefix: metadataCustomPrefix })
    }
    return { ok: true, strictness: metadataStrictness, customPrefix: metadataCustomPrefix, custom: customs,
      unknown, reported: unknown.slice(), enforced, fired }
  }
  /** Provenance: the chain of inputs, bounded by vmu.provenance.depth (0 = all). */
  const provenanceOf = ({ inputs = null } = {}) => {
    const enforced = ['vmu.provenance.depth', 'vmu.provenance.recordInputFingerprint']
    const chain = Array.isArray(inputs) ? inputs : []
    const kept = provenanceDepth > 0 ? chain.slice(-provenanceDepth) : chain.slice()
    const dropped = chain.length - kept.length
    return { ok: true, depth: provenanceDepth, kept, dropped, droppedIsCounted: true,
      inputFingerprint: provenanceInputFingerprint ? (kept.length ? String(kept[kept.length - 1]) : null) : null,
      enforced, fired: chain.length ? ['vmu.provenance.depth'] : [] }
  }
  /**
   * ROUND 231: check a record's `references` against the declaration.
   * `vmu.refs.requireTarget` (default true) makes a reference to an UNKNOWN id a refusal; `vmu.refs.danglingPolicy` then
   * decides whether that refusal stands (`reject`) or whether the dangling reference is merely LISTED in the receipt
   * (`list`, the declared default). A dangling reference is never silent under either setting.
   */
  const checkReferences = ({ references = null, known = null } = {}) => {
    const enforced = ['vmu.refs.requireTarget', 'vmu.refs.danglingPolicy']
    const list = Array.isArray(references) ? references.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []
    const ids = known instanceof Set ? known : new Set(index.keys())
    const dangling = list.filter((r) => !ids.has(r))
    const fired = dangling.length ? ['vmu.refs.requireTarget'] : []
    if (dangling.length && refsRequireTarget && refsDanglingPolicy === 'reject') {
      throw refuse('VMU_INVALID_ARGUMENT', 'reference target does not exist and vmu.refs.danglingPolicy=reject: ' + dangling.join(', '),
        'create the target first, or set vmu.refs.danglingPolicy=list to have dangling references reported instead',
        { dangling, policy: refsDanglingPolicy })
    }
    return { ok: true, references: list, dangling, reported: dangling.slice(), enforced, fired,
      requireTarget: refsRequireTarget, policy: refsDanglingPolicy }
  }
  /** Backlinks up to `vmu.refs.backlinkDepth`, breadth-first over the index. */
  const backlinks = (id, depth = refsBacklinkDepth) => {
    const levels = []
    let frontier = [String(id)]
    const seen = new Set(frontier)
    for (let d = 0; d < Math.max(0, depth); d += 1) {
      const next = []
      for (const rec of index.values()) {
        if (frontier.includes(rec.id)) continue
        if (next.includes(rec.id)) continue
        if (frontier.some((f) => (rec.references || []).includes(f))) next.push(rec.id)
      }
      if (!next.length) break
      for (const n of next) seen.add(n)
      levels.push(next)
      frontier = next
    }
    return { ok: true, id: String(id), depth, levels, backlinks: levels.flat(), enforced: ['vmu.refs.backlinkDepth'], fired: levels.length ? ['vmu.refs.backlinkDepth'] : [] }
  }
  /** Check a tag list against the declaration. Depth first, then the vocabulary, then the alias rule. */
  const checkTags = ({ tags = null } = {}) => {
    const enforced = ['vmu.tags.maxDepth', 'vmu.tags.controlled', 'vmu.tags.aliasTable']
    const fired = []
    const list = Array.isArray(tags) ? tags.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []
    const tooDeep = tagsMaxDepth > 0 ? list.filter((x) => x.split('/').filter(Boolean).length > tagsMaxDepth) : []
    if (tooDeep.length) {
      fired.push('vmu.tags.maxDepth')
      throw refuse('VMU_INVALID_ARGUMENT', 'tag path deeper than vmu.tags.maxDepth=' + tagsMaxDepth + ': ' + tooDeep.join(', '),
        'flatten the tag, or raise vmu.tags.maxDepth deliberately', { tooDeep, maxDepth: tagsMaxDepth })
    }
    if (tagsControlled) {
      fired.push('vmu.tags.controlled')
      const unknown = list.filter((x) => !vocabulary.has(x))
      if (unknown.length) {
        // The alias rule lives here: an alias may pass ONLY when it was registered as one AND the declaration names a table;
        // otherwise the refusal points at the table that the caller has to supply.
        const notAlias = tagsAliasTable ? unknown.filter((x) => !aliases.has(x)) : unknown
        if (notAlias.length) {
          throw refuse('VMU_INVALID_ARGUMENT', 'tag(s) outside the controlled vocabulary: ' + notAlias.join(', '),
            tagsAliasTable
              ? 'register them as aliases via the declared alias table (' + tagsAliasTable + '), or use a vocabulary term'
              : 'register a vocabulary with registerVocabulary({tags}), or set vmu.tags.controlled=false deliberately',
            { notAlias, vocabulary: [...vocabulary].slice(0, 8) })
        }
      }
    }
    return { ok: true, tags: list.slice(), controlled: tagsControlled, maxDepth: tagsMaxDepth, aliasTable: tagsAliasTable || null, enforced, fired }
  }
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
      if (record.tags !== undefined) checkTags({ tags: record.tags })   // ROUND 230: a validator nobody calls is inert
    const refCheck = record.references !== undefined ? checkReferences({ references: record.references }) : null   // ROUND 231
    const metaCheck = checkMetadata({ record })   // ROUND 232: a custom field must be prefixed, and the strictness decides what
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
      // GATE FIRST, THEN TOUCH THE FILESYSTEM. Independent verification (task-34) proved that `mkdir` used to
      // run BEFORE the gate, so an out-of-policy write was refused only AFTER its directory had been created -
      // a refusal with a side effect. A refused write must leave the disk untouched.
      gate(file, 'library write')
      await mkdir(dir, { recursive: true })
      const meta = {
        id, kind, fingerprint: fp,
          references: refCheck && refCheck.references.length ? refCheck.references.join(',') : null,   // ROUND 231
          statement: record.statement === undefined ? null : String(record.statement),   // ROUND 231: segment-scope dedupe needs it
        title: record.title || record.statement.slice(0, 60),
        status: record.status || 'open',
        owner: member,
        updatedAt: nowIso(clock),
      }
      await writeFile(file, render(meta, String(record.statement) + (record.proof ? '\n\n' + record.proof : '')), 'utf8')
      index.set(id, Object.assign({ file }, meta))
      return { ok: true, id, fingerprint: fp, deduplicated: false, file,
        references: refCheck ? refCheck.references : [], dangling: refCheck ? refCheck.dangling : [] }
    },

    /** Append a progress line to one track. An unknown track is refused by name (docs/07 §4.1). */
    async record(member, track, text) {
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
