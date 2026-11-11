// vmu kernel · records — the record-track knob surface. It READS the `vmu.records.*` knobs so that every one of
// them CHANGES AN OBSERVABLE RESULT (docs/07-durability-library.md §4/§12 parameter table, docs/21 for ops).
//
// WHY THIS FILE EXISTS: docs 07 declares 24 `vmu.records.*` keys and 16 more are registered in
// `settings/schema.js`, yet the kernel had NO record-track surface at all — the knobs were documented but inert,
// which is the worst wiring gap (a reader believes the knob works). This module follows the accepted standard of
// `kernel/mathtools.js`: (1) every wired key changes behaviour; (2) every receipt carries `enforced[]` (the keys
// whose rule was EVALUATED for that call) and `fired[]` (the keys that materially changed the outcome) — so
// "read" and "took effect" are distinguishable; (3) the keys that are NOT wired are named with a reason and the
// partition is asserted (24 = wired + unwired, disjoint); (4) positive AND negative cases per key; (5) every
// refusal is counted by code; (6) the only time source is the injected clock; (7) READ paths never mutate.
//
// WHAT IT IS NOT: it does not redefine 07's library, 20's retention or the audit trail. It references them:
// the permanent marker and `VMU_RETENTION_CONFLICT` keep exactly the meaning kernel/library.js gives them, the
// fingerprint policy keeps 07 §4.2's names (`content-only` / `content+display`), and persistence stays with
// `kernel/store.js` (this module is an in-memory projection whose records can be handed to it).
//
// SETTINGS are read as PLAIN LITERALS (the settings table and the docs audit discover wired keys by scanning
// file text). `WIRED_KEYS` = the 24 documented keys; `EXTRA_WIRED_KEYS` = the registered core keys this module
// also honours (reported separately so the "24 = wired + unwired" partition stays exact).
import { createHash } from 'node:crypto'
// fs-purpose: audit — this module is the md INDEX face (RUN 225-A): it reads the md files that carry the truth and
// writes the atomic replacement when a caller asks it to. Recorded in tests/audit-fs-purpose.test.mjs.
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mint } from './ids.js'   // ROUND 2 (task-14): ids never restart from 0 (kernel/ids.js)

export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** The 24 keys docs/07 §12 declares (the partition the standard requires). */
export const DECLARED_KEYS = Object.freeze([
  'vmu.records.allowedKinds', 'vmu.records.headFields', 'vmu.records.bodyCapBytes', 'vmu.records.expandThreshold',
  'vmu.records.head.maxItems', 'vmu.records.head.sort', 'vmu.records.body.noticeStyle', 'vmu.records.body.chunkedReturn',
  'vmu.records.naming.slugPolicy', 'vmu.records.naming.maxLength', 'vmu.records.naming.conflictSuffix',
  'vmu.records.retention.keepEvery', 'vmu.records.retention.permanentMarker', 'vmu.records.retention.maxBytes',
  'vmu.records.retention.tierThreshold', 'vmu.records.trash.retainDays', 'vmu.records.trash.autoPurge',
  'vmu.records.trash.countInQuota', 'vmu.records.history.depth', 'vmu.records.history.storeMode',
  'vmu.records.chunk.thresholdBytes', 'vmu.records.chunk.chunkBytes',
  'vmu.records.external.allowedSchemes', 'vmu.records.external.verifyExists',
])

/** Every documented key this module actually honours (each one changes an observable result — see the test). */
export const WIRED_KEYS = Object.freeze(DECLARED_KEYS.slice())

/** Per-key reasons for the documented keys NOT wired yet. Empty ⇒ all 24 are wired (stated, not implied). */
export const UNWIRED_REASONS = Object.freeze({})

/** Registered core keys (settings/schema.js) this module ALSO honours. Kept separate: they are not among the 24. */
export const EXTRA_WIRED_KEYS = Object.freeze([
  'vmu.records.tracks', 'vmu.records.headListAt', 'vmu.records.truncateMode', 'vmu.records.fingerprintPolicy',
  'vmu.records.requireSettledRecords', 'vmu.records.pointerPropagation', 'vmu.records.meetingKeepEvery',
])

/** Head fields that can never be trimmed from a list projection (`vmu.records.headFields` trims the rest). */
/**
 * ★★★ RUN 256 / TB-2623: a temp FILE NAME is not a fact about time, so it must not read the clock either: a wall-
 * clock suffix made two otherwise identical corpus runs differ in file names. pid + in-process sequence + random
 * suffix is unique within a run and across concurrent processes without consulting any clock.
 */
let mdTmpSeq = 0
export const CORE_HEAD_FIELDS = Object.freeze(['id', 'track', 'kind', 'status', 'updatedAt', 'fingerprint'])

/**
 * ★★★ RUN 240 (live run 63 / FEEDBACK63 ①1 + ①10, MEASURED): THREE NAMES, ONE ROW, NO DEFINITIONS ANYWHERE.
 * r-acad merged one line into a card r-1 owned; the receipt counted `fieldsReplaced:["body","by"]` and never said
 * `writer`, and a later `records expand` read `owner:"r-1", writer:"r-1"` — the writer had moved in the row but not in
 * any reading of it, and no page defined what the three words mean relative to each other. The three names are NOT
 * aliases: `owner` is who the row BELONGS to, `writer` is who wrote the revision a reader is looking at, and `by` is
 * the write face's name for that same writer. This table is the one place the words are defined, and every write/read
 * receipt in this module carries them (`ownerMeans`/`writerMeans`/`byMeans`/`threeNames`), so a caller never has to
 * guess which of the three moved.
 */
export const THREE_NAMES_MEANS = Object.freeze({
  owner: 'owner = WHO THE ROW BELONGS TO: the author of its first version; a later correction keeps it (ownership is not authorship)',
  writer: 'writer = WHO WROTE THE REVISION THIS READ RETURNS: it moves on every write that names a writer, so correcting someone else\'s card shows you as writer and leaves the owner alone; two kernels over one workspace keep their own projections, so compare `fingerprint`/`updatedAt` across kernels rather than `rev` (RUN 238 `revSource`: rev counts the writes THIS kernel folded)',
  by: 'by = the WRITE FACE\'s name for the writer: a write passes `by` (the card tools pass the acting `member` as this) and the row records that person as the writer of this revision',
  threeNames: 'owner, writer and `by` are two facts under three names: owner = whose row it is, writer = who wrote this revision, `by` = the write face\'s spelling of writer — so ONE correction moves writer/`by` and leaves owner where it was',
})

/**
 * ★★★ RUN 259 / P1-3: THE IDENTITY IS A CHECK, NOT A TAUTOLOGY.
 *
 * Before this, `totalUniverse` was BUILT from `live.length` and `holds` then compared `items + dropped + excluded`
 * against that same number: two expressions of one arithmetic, so `holds:false` was unreachable by construction - a
 * criterion that can never fail is not a criterion. Now the caller passes `universeCounted`, a count from ANOTHER
 * path (a traversal of the index ids plus the external rows it was handed), and `holds` is `accounted === counted`.
 * If any row vanishes without a named bucket, the two disagree and `holds:false` says so.
 *
 * The negative case is executable (the suite injects `page:1, universeCounted:2` and gets `holds:false`), which is
 * what makes this a testable identity rather than prose.
 */
export function identityHoldsOf({ page = 0, pageDropped = 0, excluded = 0, mutedDropped = 0, questionDropped = 0, indexMissing = 0, indexNonLive = 0, mergeDuplicates = 0, universeCounted = 0 } = {}) {
  const accounted = page + pageDropped + excluded + mutedDropped + questionDropped + indexMissing + indexNonLive + mergeDuplicates
  return { accounted, universeCounted: universeCounted, holds: accounted === universeCounted }
}

/** The three names + their definitions, in the shape every receipt and read face carries them. */
const identityEcho = (owner, by) => ({
  owner: owner === undefined ? null : owner,
  writer: by === undefined ? null : by,
  by: by === undefined ? null : by,
  ownerMeans: THREE_NAMES_MEANS.owner,
  writerMeans: THREE_NAMES_MEANS.writer,
  byMeans: THREE_NAMES_MEANS.by,
  threeNames: THREE_NAMES_MEANS.threeNames,
})

const K = Object.freeze({
  allowedKinds: 'vmu.records.allowedKinds',
  // ROUND 261 (volume 16 §L9/L10): the dataset declarations.
  dataRequireParent: 'vmu.data.requireParent',
  dataVersionScheme: 'vmu.data.versionScheme',
  // ROUND 278 (volume 16 §L169): the rebuttal declaration.
  rebuttalRequired: 'vmu.review.rebuttalRequired',
  headFields: 'vmu.records.headFields',
  bodyCapBytes: 'vmu.records.bodyCapBytes',
  expandThreshold: 'vmu.records.expandThreshold',
  headMaxItems: 'vmu.records.head.maxItems',
  headSort: 'vmu.records.head.sort',
  noticeStyle: 'vmu.records.body.noticeStyle',
  chunkedReturn: 'vmu.records.body.chunkedReturn',
  slugPolicy: 'vmu.records.naming.slugPolicy',
  slugMaxLength: 'vmu.records.naming.maxLength',
  conflictSuffix: 'vmu.records.naming.conflictSuffix',
  keepEvery: 'vmu.records.retention.keepEvery',
  permanentMarker: 'vmu.records.retention.permanentMarker',
  retentionMaxBytes: 'vmu.records.retention.maxBytes',
  tierThreshold: 'vmu.records.retention.tierThreshold',
  trashRetainDays: 'vmu.records.trash.retainDays',
  trashAutoPurge: 'vmu.records.trash.autoPurge',
  trashCountInQuota: 'vmu.records.trash.countInQuota',
  historyDepth: 'vmu.records.history.depth',
  historyStoreMode: 'vmu.records.history.storeMode',
  chunkThreshold: 'vmu.records.chunk.thresholdBytes',
  chunkBytes: 'vmu.records.chunk.chunkBytes',
  allowedSchemes: 'vmu.records.external.allowedSchemes',
  verifyExists: 'vmu.records.external.verifyExists',
  // registered core keys
  tracks: 'vmu.records.tracks',
  headListAt: 'vmu.records.headListAt',
  truncateMode: 'vmu.records.truncateMode',
  fingerprintPolicy: 'vmu.records.fingerprintPolicy',
  requireSettled: 'vmu.records.requireSettledRecords',
  pointerPropagation: 'vmu.records.pointerPropagation',
  meetingKeepEvery: 'vmu.records.meetingKeepEvery',
})

const DEFAULTS = Object.freeze({
  // ROUND 261: `dataset` is a kind of RECORD, which is what volume 16 §L129 says a dataset is.
  // ROUND 278 (volume 16 §L166-168): a rebuttal is a RECORD - the volume names the kind and says one entry per comment.
  [K.allowedKinds]: ['progress', 'route', 'decision', 'finding', 'lesson', 'state', 'dataset', 'rebuttal'],
  [K.dataRequireParent]: false,
  [K.dataVersionScheme]: 'semver',
  // ROUND 278: §L169. When on (the default), a rebuttal entry must PAIR a comment with a response.
  [K.rebuttalRequired]: true,
  // ★★ RUN 240: `writer` travels with `owner` in the head row. The list face used to carry the owner and not the
  // writer, so a row rewritten by someone else listed as unchanged-by-anyone: `list` now names BOTH facts.
  [K.headFields]: ['id', 'track', 'kind', 'title', 'slug', 'status', 'owner', 'writer', 'updatedAt', 'fingerprint'],
  [K.bodyCapBytes]: 32768,
  [K.expandThreshold]: 4096,
  [K.headMaxItems]: 200,
  [K.headSort]: 'updatedAt',
  [K.noticeStyle]: 'detailed',
  [K.chunkedReturn]: false,
  [K.slugPolicy]: 'cjk-keep',
  [K.slugMaxLength]: 80,
  [K.conflictSuffix]: '-2',
  [K.keepEvery]: 10,
  [K.permanentMarker]: 'permanent',
  [K.retentionMaxBytes]: 0,
  [K.tierThreshold]: 0,
  [K.trashRetainDays]: 30,
  [K.trashAutoPurge]: false,
  [K.trashCountInQuota]: true,
  // NOTE: settings/schema.js registers 0 (= keep all) while docs/07 §12's table prints 20; the SETTINGS layer is
  // authoritative at runtime, so the fallback follows the registry and the divergence is reported, not hidden.
  [K.historyDepth]: 0,
  [K.historyStoreMode]: 'diff',
  [K.chunkThreshold]: 1048576,
  [K.chunkBytes]: 262144,
  [K.allowedSchemes]: ['file', 'http', 'https'],
  [K.verifyExists]: true,
  [K.tracks]: ['progress', 'routes', 'obstacles', 'rejected', 'state'],
  [K.headListAt]: 7,
  [K.truncateMode]: 'keepChars',
  [K.fingerprintPolicy]: 'content-only',
  [K.requireSettled]: true,
  [K.pointerPropagation]: true,
  [K.meetingKeepEvery]: 5,
})

const HEAD_SORTS = Object.freeze(['updatedAt', 'createdAt', 'title'])
const NOTICE_STYLES = Object.freeze(['short', 'detailed'])
const TRUNCATE_MODES = Object.freeze(['keepChars', 'keepHeadTail', 'dropMiddle'])
const FINGERPRINT_POLICIES = Object.freeze(['content-only', 'content+display'])
// ROUND 236 / M4: how an UPDATE writes the body of the row it names. `replace` swaps it whole (the previous body
// stays readable in the record's history); `append` keeps the old body and writes this text after it. Naming no
// body at all KEEPS the body — the measured defect was an update that silently dropped fields the caller never named.
const BODY_MODES = Object.freeze(['replace', 'append', 'merge'])
const DEFAULT_LIST_CAP = 200
/**
 * RUN 239 (live run 62 / FEEDBACK62 #2, MEASURED): A DEFAULT REPLACE DELETED A SETTLEMENT AND NOBODY WAS TOLD.
 * The card had p=1, settled:true and a `- debateRuling：` line; the next `vibe_v5_record_proposition` named only a new
 * value, the body was REPLACED, and `debateRuling` / `p1Evidence` / `proofRef` disappeared while `settled` fell back to
 * false. The receipt did report `bodyLinesDropped` - but the write had already happened, and a card is not a scratch pad.
 * So a body MODE that keeps what a write does not name is part of the mechanism, not a caller's discipline: `merge`
 * overrides the lines this write NAMES (by their `- key：` label) and keeps every other line, in place.
 */
const cardLineKeyOf = (line) => {
  const m = /^-\s*([^\s:：]+)\s*[:：]/.exec(String(line === undefined || line === null ? '' : line).trim())
  return m === null ? null : m[1]
}
const cardLinesOf = (text) => {
  const keys = []
  for (const line of String(text === undefined || text === null ? '' : text).split('\n')) {
    const key = cardLineKeyOf(line)
    if (key !== null && keys.indexOf(key) === -1) keys.push(key)
  }
  return keys
}
const mergeCardText = (oldText, newText) => {
  const oldLines = String(oldText === undefined || oldText === null ? '' : oldText).split('\n')
  const newLines = String(newText === undefined || newText === null ? '' : newText).split('\n')
  const named = new Map()
  const loose = []
  for (const line of newLines) {
    const key = cardLineKeyOf(line)
    if (key === null) { if (line.trim() !== '') loose.push(line); continue }
    named.set(key, line)
  }
  const used = new Set()
  const out = []
  for (const line of oldLines) {
    const key = cardLineKeyOf(line)
    if (key !== null && named.has(key)) { out.push(named.get(key)); used.add(key); continue }
    out.push(line)
  }
  for (const [key, line] of named) if (!used.has(key)) out.push(line)
  for (const line of loose) out.push(line)
  return out.join('\n')
}
const SETTLEMENT_LINES = Object.freeze(['debateRuling', 'p1Evidence', 'proofRef'])

/** Deterministic slug: `ascii` strips to [a-z0-9-], `cjk-keep` keeps CJK (docs/07 §12 `naming.slugPolicy`). */
export function slugify(title, policy = 'cjk-keep', maxLength = 80) {
  const raw = String(title === undefined || title === null ? '' : title).trim().toLowerCase()
  const kept = policy === 'ascii'
    ? raw.replace(/[^a-z0-9]+/g, '-')
    : raw.replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}a-z0-9]+/gu, '-')
  const trimmed = kept.replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-')
  const out = trimmed || 'record'
  return { slug: out.length > maxLength ? out.slice(0, maxLength) : out, truncated: out.length > maxLength, full: out }
}

/** Split a body into deterministic chunks (docs/07 §12 `chunk.*`). */
export function chunkBody(body, chunkBytes) {
  const text = String(body === undefined || body === null ? '' : body)
  const size = Number.isInteger(chunkBytes) && chunkBytes > 0 ? chunkBytes : 262144
  const chunks = []
  for (let i = 0; i < text.length; i += size) chunks.push({ index: chunks.length, bytes: Math.min(size, text.length - i), text: text.slice(i, i + size) })
  return chunks.length ? chunks : [{ index: 0, bytes: 0, text: '' }]
}

// ── THE MD FACE (RUN 225-A): the md file is the truth, the record row is an INDEX of it ───────────────────
// THE PROBLEM THIS SOLVES: a blueprint / protocol lives in a record row (a JSON string in `<root>/vmu/state.json`),
// so the document a human opens on disk and the document the tools answer from were two different things — editing
// the md changed nothing, and a row could claim a revision no file ever carried. THE RULE NOW: every revision is
// written to its md ATOMICALLY (temp file + rename), the row stores the md sha256 (`mdFingerprint`), and the read
// faces compare the two so "the file was edited outside the tools" is a disclosed fact, not a silent lie.
// THREE OPERATIONS, no more: compose/parse the md shape (pure), write a md atomically, and RECONCILE the index
// against the disk (`mdReindex`). Reconciliation only moves FORWARD: it adds a row, appends a version, or names a
// missing file — it never deletes a history row (a reindex that erased history would be a second truth).
export const MD_FORMAT = 'vmu-md/1'
export const MD_MARKER_KEY = 'vmuMd'
export const MD_TEXT_SECTION = '正文'
export const MD_SEP = '：'
export const MD_REBUILT_KEY = 'mdFingerprint'
// ★★★ RUN 248: the header key that makes ONE row own its OWN file. A draft revision is ABOUT `Shared/Protocol.md` but is
// WRITTEN to `Shared/Drafts/Protocol-r<N>.md`, so the body `path` cannot be the file a draft row indexes: `mdPath` is.
// Rows whose `mdPath` equals their `path` (adopted documents) keep exactly the old behaviour.
export const MD_PATH_KEY = 'mdPath'
const MD_MAX_DEPTH = 8

/** md text of any value (never the string "undefined"). */
function mdStr(v) { return v === undefined || v === null ? '' : String(v) }

/** The sha256 a row stores for the md it was indexed from. Content bytes only: the file prints no fingerprint of itself (no self-reference). */
export function mdFingerprintOf(content) {
  return 'sha256:' + createHash('sha256').update(mdStr(content), 'utf8').digest('hex')
}

/**
 * Compose the md text of one document. The SHAPE is deliberate: a human title first, then the SAME `- key：value`
 * lines the record body carries (so an index row and its md can be compared field by field), then the verbatim
 * section. `fields` is the caller's own header (blueprint: path/status/revision/authors/...); the reserved keys
 * (`vmuMd`, track, kind, title) are written once, by this function, and skipped if the caller passes them.
 */
export function mdComposeText({ title = '', track = null, kind = null, fields = null, text = '' } = {}) {
  const lines = []
  const t = mdStr(title).trim()
  if (t !== '') lines.push('# ' + t)
  lines.push('- ' + MD_MARKER_KEY + MD_SEP + MD_FORMAT)
  if (mdStr(track) !== '') lines.push('- track' + MD_SEP + mdStr(track))
  if (mdStr(kind) !== '') lines.push('- kind' + MD_SEP + mdStr(kind))
  if (t !== '') lines.push('- title' + MD_SEP + t)
  const src = fields && typeof fields === 'object' ? fields : {}
  for (const key of Object.keys(src)) {
    if (key === MD_MARKER_KEY || key === 'track' || key === 'kind' || key === 'title') continue
    const value = src[key]
    if (value === undefined || value === null || mdStr(value) === '') continue
    lines.push('- ' + key + MD_SEP + mdStr(value))
  }
  lines.push('## ' + MD_TEXT_SECTION)
  const body = mdStr(text)
  if (body !== '') lines.push(body)
  return lines.join('\n')
}

/**
 * Parse a md file into `{ok, format, title, track, kind, fields, fieldOrder, text, why, problems}`.
 * A file WITHOUT the `vmuMd` marker is `ok:false` with a reason — it is never mistaken for a blueprint, and the
 * caller keeps the file (reindex reports it as skipped rather than overwriting somebody's notes).
 */
export function mdParseText(content) {
  const lines = mdStr(content).split(/\r?\n/)
  const fields = {}
  const fieldOrder = []
  const problems = []
  let title = ''
  let textLines = null
  for (const line of lines) {
    if (textLines !== null) { textLines.push(line); continue }
    if (line.trim() === '## ' + MD_TEXT_SECTION) { textLines = []; continue }
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) { if (title === '' && /^#\s+/.test(line)) title = heading[1].trim(); continue }
    const m = /^-\s*([^：:]+?)\s*[：:]\s*(.*)$/.exec(line)
    if (m) {
      const key = m[1].trim()
      if (!Object.prototype.hasOwnProperty.call(fields, key)) { fields[key] = m[2].trim(); fieldOrder.push(key) }
      continue
    }
    if (line.trim() !== '') problems.push('unrecognised line before the text section: ' + line.slice(0, 80))
  }
  const doc = { ok: false, format: null, title, track: null, kind: null, fields, fieldOrder, text: '', why: null, problems }
  const parsedTitle = mdStr(fields.title) !== '' ? fields.title : title
  doc.title = parsedTitle
  doc.format = mdStr(fields[MD_MARKER_KEY]) !== '' ? fields[MD_MARKER_KEY] : null
  doc.track = mdStr(fields.track) !== '' ? fields.track : null
  doc.kind = mdStr(fields.kind) !== '' ? fields.kind : null
  if (textLines === null) { doc.why = 'no "## ' + MD_TEXT_SECTION + '" section marker'; return doc }
  doc.text = textLines.join('\n').replace(/[ \t\r\n]+$/, '')
  if (doc.format !== MD_FORMAT) {
    doc.why = 'not a vmu md (' + MD_MARKER_KEY + ' must be ' + MD_FORMAT + ', saw ' + String(doc.format === null ? '(none)' : doc.format) + ')'
    return doc
  }
  doc.ok = true
  return doc
}

/** The value of a `- key：value` header line inside a RECORD body (null when the key is absent). */
export function mdFieldOf(body, key) {
  const wanted = mdStr(key).trim()
  if (wanted === '') return null
  const lines = mdStr(body).split(/\r?\n/)
  for (const line of lines) {
    const m = /^-\s*([^：:]+?)\s*[：:]\s*(.*)$/.exec(line)
    if (m && m[1].trim() === wanted) return m[2].trim()
  }
  return null
}

/**
 * Rebuild a RECORD body from a md, so the reconstructed row is byte-identical to the row the writer produced:
 * the md header fields in their md order (minus the reserved keys), then the `mdFingerprint` of the md, then the
 * verbatim text section. `mdReindex` adopts/changes rows with exactly this function — one shape, two callers.
 */
export function mdRowBodyOf(doc, fingerprint) {
  const lines = []
  for (const key of (doc && doc.fieldOrder) || []) {
    if (key === MD_MARKER_KEY || key === 'track' || key === 'kind' || key === 'title' || key === MD_REBUILT_KEY) continue
    const value = doc.fields[key]
    if (value === undefined || value === null || mdStr(value) === '') continue
    lines.push('- ' + key + MD_SEP + value)
  }
  lines.push('- ' + MD_REBUILT_KEY + MD_SEP + mdStr(fingerprint))
  lines.push('## ' + MD_TEXT_SECTION)
  if (doc && mdStr(doc.text) !== '') lines.push(doc.text)
  return lines.join('\n')
}

/**
 * createRecords — the record-track projection. `store`/`library` are optional seams (persistence stays with
 * them, 07): this module owns the KNOBS and the accounting, never the durable layer.
 */
export function createRecords({ clock = () => 0, log = null, settings = {}, bus = null, exists = null, onProgress = null } = {}) {
  // ★★★ RUN 2697 / TB-2697 — the ids THIS instance has written whose durable fold write is not acknowledged yet. The
  // acknowledgement is never PASSED IN: the durable snapshot is queued asynchronously, so a records face cannot be told
  // when it landed. Instead a fold row that matches the pending (rev, updatedAt) proves the write is in the fold, and a
  // fold row that is STRICTLY NEWER than the pending write proves a later writer already moved past it — either way the
  // entry is retired. Until that proof arrives, a differing fold row for a pending id is not adopted (see synchronize).

  // ★ AUDIT A2 — 「有进展时自动唤起所办汇报」. The institute's own rule says a PROGRESS ROW rings the office's bell; the
  // reporting face (`kernel/report.js`) has always understood `event:'progress'`, but NOTHING emitted that event — the
  // only automatic trigger measured in the tree was `turn-end`. The hook is injected (this module must not import the
  // reporting face) and it is called only AFTER a row is committed, inside a try/catch: a bell that fails must never
  // fail the write that rang it.
  if (typeof clock !== 'function') {
    const e = refuse('VMU_INVALID_ARGUMENT', 'createRecords needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
    e.enforced = []   // rule ①: a thrown refusal ALWAYS carries an array (possibly empty), never undefined
    throw e
  }
  const sget = (key) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? DEFAULTS[key] : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return DEFAULTS[key]
  }
  const say = (event) => { if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* logging must not break the ledger */ } } }

  // ── the knobs, snapshotted once (settings are read declaratively; hot-reload is not part of this slice) ──
  const allowedKinds = listOf(sget(K.allowedKinds), DEFAULTS[K.allowedKinds])
  const headFields = listOf(sget(K.headFields), DEFAULTS[K.headFields])
  const bodyCapBytes = nat(sget(K.bodyCapBytes), DEFAULTS[K.bodyCapBytes])
  const expandThreshold = nat(sget(K.expandThreshold), DEFAULTS[K.expandThreshold])
  // ★★ RUN 163 / live-run-11 card rec-298: `headMaxItems` was read ONCE at construction, so `vibe_v5_set
  // {key:"vmu.records.head.maxItems"}` answered `applied:"immediate"` and the next `put` still refused with
  // 200/200 — the paper subsystem stayed dead for the rest of the run. The value is a WRITE-TIME policy (it decides
  // whether the next put is admitted), not an identity of this face, so it is read at the moment it is enforced.
  // `headMaxItemsAtStart` keeps the snapshot visible for readers who need to know what this kernel started with.
  const headMaxItemsNow = () => nat(sget(K.headMaxItems), DEFAULTS[K.headMaxItems])
  const headMaxItemsAtStart = headMaxItemsNow()
  const headSortRaw = sget(K.headSort)
  const headSort = HEAD_SORTS.includes(headSortRaw) ? headSortRaw : DEFAULTS[K.headSort]
  const noticeStyle = NOTICE_STYLES.includes(sget(K.noticeStyle)) ? sget(K.noticeStyle) : DEFAULTS[K.noticeStyle]
  const chunkedReturn = sget(K.chunkedReturn) === true
  const slugPolicy = sget(K.slugPolicy) === 'ascii' ? 'ascii' : 'cjk-keep'
  const slugMaxLength = nat(sget(K.slugMaxLength), DEFAULTS[K.slugMaxLength])
  const conflictSuffix = String(sget(K.conflictSuffix) === undefined || sget(K.conflictSuffix) === null ? DEFAULTS[K.conflictSuffix] : sget(K.conflictSuffix))
  const keepEvery = nat(sget(K.keepEvery), DEFAULTS[K.keepEvery])
  const permanentMarker = String(sget(K.permanentMarker) === undefined ? DEFAULTS[K.permanentMarker] : sget(K.permanentMarker))
  const retentionMaxBytes = nat(sget(K.retentionMaxBytes), DEFAULTS[K.retentionMaxBytes])
  const tierThreshold = nat(sget(K.tierThreshold), DEFAULTS[K.tierThreshold])
  const trashRetainDays = nat(sget(K.trashRetainDays), DEFAULTS[K.trashRetainDays])
  const trashAutoPurge = sget(K.trashAutoPurge) === true
  const trashCountInQuota = sget(K.trashCountInQuota) !== false
  const historyDepth = nat(sget(K.historyDepth), DEFAULTS[K.historyDepth])
  const historyStoreMode = sget(K.historyStoreMode) === 'full' ? 'full' : 'diff'
  const chunkThreshold = nat(sget(K.chunkThreshold), DEFAULTS[K.chunkThreshold])
  const chunkBytes = nat(sget(K.chunkBytes), DEFAULTS[K.chunkBytes])
  const allowedSchemes = listOf(sget(K.allowedSchemes), DEFAULTS[K.allowedSchemes])
  const verifyExists = sget(K.verifyExists) !== false
  // ★ RUN 256 / TB-2618: the track whitelist is no longer a CONSTRUCTION-TIME snapshot. A pack that declares
  //   `recordTracks` after the kernel exists lands here through `records.declareTracks(list)`, so the later
  //   declaration is EFFECTIVE (put/list see it) instead of merely recorded. Closed set + refusal by name are kept.
  const declaredExtraTracks = new Set()
  // ★ The BASE is still the construction-time snapshot (a later `vibe_v5_set` of vmu.records.tracks must NOT silently
  //   widen what this handle accepts — the ledger has always refused that as a mid-flight contract change). What is
  //   new is `declaredExtraTracks`: kernel.declareTracks()/a pack's recordTracks declaration extends THIS list, so a
  //   post-construction declaration is effective without turning the snapshot into a live settings read.
  const liveTracks = () => {
    const base = tracks.slice()
    const seen = new Set(base)
    for (const extra of declaredExtraTracks) {
      if (!seen.has(String(extra))) { seen.add(String(extra)); base.push(String(extra)) }
    }
    return base
  }
  const tracks = listOf(sget(K.tracks), DEFAULTS[K.tracks])
  const headListAt = nat(sget(K.headListAt), DEFAULTS[K.headListAt])
  const truncateModeRaw = sget(K.truncateMode)
  const truncateMode = TRUNCATE_MODES.includes(truncateModeRaw) ? truncateModeRaw : DEFAULTS[K.truncateMode]
  const fingerprintPolicy = FINGERPRINT_POLICIES.includes(sget(K.fingerprintPolicy)) ? sget(K.fingerprintPolicy) : DEFAULTS[K.fingerprintPolicy]
  const requireSettled = sget(K.requireSettled) !== false
  const pointerPropagation = sget(K.pointerPropagation) !== false
  const meetingKeepEvery = nat(sget(K.meetingKeepEvery), DEFAULTS[K.meetingKeepEvery])

  const DAY_MS = 86400000

  // ── state ─────────────────────────────────────────────────────────────────────────────────────────
  const records = new Map()        // id -> record
  const order = []                 // ids, insertion order (deterministic)
  const byTrack = new Map()        // track -> ids
  const bySlug = new Map()         // track -> Map(slug -> id)
  const byFingerprint = new Map()  // track -> Map(fingerprint -> id)
  const externalRefs = new Map()   // id -> [ref]
  const historyRows = []
  const historyDropped = { n: 0 }
  const refusals = new Map()
  // ★★ RUN 175 (run 20 FEEDBACK20 ⑬): `refusalsTotal` counted refusals but could not say WHICH one — a reader holding
  // `refusalsTotal:1` had no way to learn what had been refused, when, or by which operation. The last one is now kept
  // (code + instant + op + a bounded message) and named on the status view; the COUNT stays the aggregate.
  let lastRefusal = null
  const unwired = new Map()
  const declaredTopics = new Set()
  const counters = {
    put: 0, deduplicated: 0, slugConflicts: 0, slugTruncated: 0, bodyTruncated: 0, bodyDroppedBytes: 0,
    versions: 0, versionsPruned: 0, compacted: 0, trashed: 0, purged: 0, restored: 0, tieredCold: 0,
    chunked: 0, lazyExpanded: 0, lists: 0, listTruncated: 0, listSuppressed: 0, headFieldTrimmed: 0, externalAttached: 0, externalVerified: 0,
    // ★★ RUN 174 (run 19 F3/F10): an id that moved to another track but kept its OLD index row, so one id answered two
    // `list({track})` calls and the durable snapshot wrote it twice. Counted so "the index is clean" is a reading, not a hope.
    retracked: 0, indexHealed: 0,
  }

  // ── ROUND 36 (task-26): the SHARED seam's state ───────────────────────────────────────────────────
  // ONE state.json is mounted by SEVERAL kernels (docs/02), and the hydration that wires this projection to the fold
  // lives in kernel/index.js and runs ONCE per instance (`recordsHydrated`). So an instance that booted FIRST served
  // its whole session from the map it had at its first read: run 36 answered `VMU_NO_SUCH_OBJECT … known ids: (none)`
  // for cards that were sitting in the fold, because the members' child kernels wrote them AFTER the office hydrated.
  // `attachStore` hands the durable port in after construction (the kernel builds this projection BEFORE its store
  // exists), and every public READ consults it: the fold is the only place several kernels can meet.
  const SHARED_STORE_KEY = 'records'   // the store.PUBLIC_KEYS name this projection snapshots
  const shared = {
    attached: false, store: null, stamp: null, signature: null,
    pulls: 0, pulled: 0, refreshed: 0, refused: 0, skipped: 0,
    // ★ ROUND 68 (F-61): how many rows this instance adopted from the durable fold WITHOUT the row saying who wrote it.
    // The count exists so "owner is null" can be distinguished from "this instance never adopted the row at all".
    adoptedNoAuthor: 0,
    // ★★ RUN 166 (real machine, run 14 / FEEDBACK14 F1+F3+F4 — THE PRUNE ONLY ONE KERNEL COULD SEE): the fold used to
    // carry LIVE rows only, because the snapshot was computed from `list()` (state === 'live'). A prune therefore moved
    // rows to the trash in ONE instance and left every other instance convinced they were still live: the office saw
    // paper 20/200 while a member session saw 200/200 and got `VMU_QUOTA_EXCEEDED`, and — worse — the pruned names stayed
    // occupied in the member's world, so a freshly minted `paper-p1` collided with a paper the office had just trashed
    // (F4) and a minted `m33` resolved to an archived meeting (F3). The fold now carries the row's STATE: a tombstone is
    // a row with `state:'trashed'` + `trashedAt`/`purgeAt`, so a trash made anywhere is learned everywhere on the next
    // read. These counters keep the adoption visible instead of silent.
    trashAdopted: 0, trashRestored: 0, tombstonesSeen: 0, tombstonesAdopted: 0, staleTombstones: 0, staleLiveRows: 0,
    lastWhy: null, lastDetail: null, lastPullAt: null, lastSyncAt: null,
    // ★★★ RUN 2697 / TB-2697 (the read path rolled a row back): `foldPending` maps id → { rev, updatedAt } for rows
    // THIS instance wrote whose fold write is still in flight. Until the kernel acknowledges the patch, the durable
    // fold can be OLDER than our memory — so a differing fold row must never be adopted for a pending id. The two
    // counters make the decision visible: `heldBack` = rows skipped because we still hold an unconfirmed write,
    // `staleRows` = differing fold rows refused because they are NOT strictly newer (the shape of the defect).
    foldPending: new Map(),
    heldBack: 0, staleRows: 0,
  }

  /**
   * THE ONE WAY A KEY ENTERS `enforced`/`fired`: check-before-insert. Duplicates are structurally impossible,
   * so a receipt never has to be cleaned up at the boundary (the same idiom as kernel/meetings.js).
   */
  const mark = (list, key) => { if (key && !list.includes(key)) list.push(key); return list }
  const markAll = (list, keys) => { for (const k of keys) mark(list, k); return list }
  /**
   * EVALUATION SCOPE (D3): `enforced` is BY DESIGN the set of keys evaluated SO FAR on this call — a refusal
   * that happens early lists only what was consulted before it. `enforcedScope` says that out loud so a reader
   * cannot mistake a "so far" list for the operation's full key set, and `wouldEvaluate` (refusals) gives that
   * full set per operation. This is a documented shape, not an omission.
   */
  const ENFORCED_SCOPE = 'evaluated-so-far'
  /** The full key set each operation would consult when it runs to completion (used for `wouldEvaluate`). */
  const OP_WOULD = Object.freeze({
    put: [K.tracks, K.requireSettled, K.allowedKinds, K.headMaxItems, K.bodyCapBytes, K.retentionMaxBytes, K.trashCountInQuota, K.slugPolicy, K.slugMaxLength, K.conflictSuffix, K.fingerprintPolicy, K.tierThreshold],
    get: [K.expandThreshold, K.fingerprintPolicy, K.bodyCapBytes, K.chunkedReturn, K.chunkThreshold, K.chunkBytes, K.headFields],
    list: [K.tracks, K.headSort, K.headListAt, K.pointerPropagation, K.headFields],
    supersede: [K.historyStoreMode, K.historyDepth],
    history: [K.historyStoreMode, K.historyDepth],
    remove: [K.permanentMarker, K.trashRetainDays, K.trashAutoPurge, K.trashCountInQuota],
    purge: [K.trashRetainDays, K.trashCountInQuota, K.permanentMarker],
    restore: [],
    compact: [K.keepEvery, K.meetingKeepEvery, K.permanentMarker],
    attachExternal: [K.allowedSchemes, K.verifyExists],
    externals: [],
  })
  const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by)
  const objOf = (map) => { const o = {}; for (const k of [...map.keys()].sort()) o[k] = map.get(k); return o }
  const sumOf = (map) => [...map.values()].reduce((a, b) => a + b, 0)
  const now = () => clock()

  function nat(v, def) { return Number.isInteger(v) && v >= 0 ? v : def }
  function listOf(v, def) { return Array.isArray(v) && v.length ? v.filter((x) => typeof x === 'string' && x) : def }

  /** The conflict-suffix template: "-2" ⇒ -2/-3/…; a template without digits ⇒ suffix + counter. */
  function suffixFor(n) {
    const m = conflictSuffix.match(/^(.*?)(\d+)$/)
    if (m) return m[1] + String(Number(m[2]) + (n - 2))
    return conflictSuffix + (n > 2 ? String(n - 1) : '')
  }
  /**
   * Refuse BY NAME and report which keys were EVALUATED on the way (rule ②: the evaluation points ARE the
   * enumeration points). The list is always an array — empty when nothing had been evaluated yet — and it is
   * deduplicated, so "read" (enforced) and "took effect" (fired) stay distinguishable on the REFUSAL path too.
   */
  const deny = (code, message, hint, enforced = [], op = null) => {
    const list = uniq(Array.isArray(enforced) ? enforced : [])
    const full = op && OP_WOULD[op] ? uniq(OP_WOULD[op].slice()) : list.slice()
    lastRefusal = { code: String(code), at: now(), op: op === null || op === undefined ? null : String(op), message: String(message).slice(0, 200) }
    bump(refusals, code, 1)
    say({ type: 'records/refused', at: now(), code, message, enforced: list, enforcedScope: ENFORCED_SCOPE, op })
    const e = refuse(code, message, hint)
    e.enforced = list                      // "evaluated SO FAR" — read `enforcedScope` before treating it as the whole set
    e.enforcedScope = ENFORCED_SCOPE       // 'evaluated-so-far' (D3: the口径 is part of the refusal itself)
    e.wouldEvaluate = full                 // the operation's full key set, so the reader gets both facts
    e.op = op
    return e
  }
  const record_ = (row) => {
    historyRows.push(Object.assign({ at: now() }, row))
    while (historyRows.length > DEFAULT_LIST_CAP) { historyRows.shift(); historyDropped.n += 1 }
  }
  const fire = (hook, payload) => {
    if (!bus || typeof bus.emit !== 'function') { bump(unwired, 'bus:' + hook, 1); return false }
    try {
      if (!declaredTopics.has(hook) && typeof bus.declareTopic === 'function') { bus.declareTopic(hook); declaredTopics.add(hook) }
      bus.emit(hook, Object.assign({ at: now() }, payload))
      declaredTopics.add(hook)
      return true
    } catch (e) { bump(unwired, 'bus:' + hook, 1); say({ type: 'records/hook-unwired', at: now(), hook, why: String((e && e.message) || e) }); return false }
  }
  const trackList = (track) => { if (!byTrack.has(track)) byTrack.set(track, []); return byTrack.get(track) }
  const fingerprintOf = (rec) => {
    const parts = fingerprintPolicy === 'content+display'
      ? [rec.track, rec.kind, rec.title, rec.slug, rec.body, rec.tags.join(',')]
      : [rec.kind, rec.body, rec.tags.join(',')]
    return createHash('sha256').update(parts.join('\u0000'), 'utf8').digest('hex')
  }
  const bytesOf = (body) => Buffer.byteLength(String(body === undefined || body === null ? '' : body), 'utf8')
  const liveIds = (track) => trackList(track).filter((id) => records.get(id).state === 'live')
  const trackBytes = (track) => trackList(track)
    .filter((id) => { const r = records.get(id); return r.state === 'live' || (trashCountInQuota && r.state === 'trashed') })
    .reduce((sum, id) => sum + records.get(id).bytes, 0)
  const isPermanent = (rec) => rec.permanent === true || rec.tags.includes(permanentMarker)
  const isMeetingTrack = (track) => /meeting/i.test(track)
  const tierOf = (rec, at = now()) => (tierThreshold > 0 && at - rec.updatedAt >= tierThreshold) ? 'cold' : 'hot'
  // ★★★ RUN 254 / P0-2 (L1): ONE RESOLVER FOR "WHO WROTE THIS ROW". `owner`/`writer`/`by` answer three different
  // questions (whose card / who wrote this revision / what the write face called that person), and a filter that reads
  // only ONE of them silently drops rows whose shape is legal but spelled differently. `by` is the canonical field on a
  // records row (RUN 240: the durable fold stores the writer under `by`); `writer` is the read-face name for the same
  // fact, and `owner` is only a last-resort fallback for a row written by a face that had no seat (never a substitute
  // for `by` when both exist). The SOURCE travels with the answer so a caller can see which field answered.
  const writerOf = (row) => {
    if (!row || typeof row !== 'object') return { writer: null, writerSource: null }
    for (const field of ['by', 'writer', 'owner']) {
      const v = row[field]
      if (v !== undefined && v !== null && String(v).trim() !== '') return { writer: String(v), writerSource: field }
    }
    return { writer: null, writerSource: null }
  }
  // ★★★ TB-2691 / F75-11 (MEASURED in run 75): two rows that look identical in the ledger can be VERY different acts.
  // The office writing a card NAMING member r-1 (`rec-7`) and r-1 writing its own card in its own turn (`rec-5`) stored
  // the same `by/owner/writer = r-1`, so neither read face could tell a relayed write from an own-turn write. The
  // provenance of the ACT is not a property of the row text — it is known only at dispatch time, so it is recorded when
  // the row is written (`writtenFrom`) and every read face DEFAULT carries it. A caller can ask for it to be omitted
  // with `withWriter:false`, and then the receipt answers `writtenFromOmitted:true` instead of simply dropping a fact.
  // This key is DELIBERATELY not named `writerSource`: `writerSource` on a library head already answers a different
  // question (which FIELD answered the writer question — `by`/`writer`/`owner`), and one name answering two questions
  // is the disease this round exists to kill (Lead ruling 2026-11-10; see docs/03 §3.1g).
  const WRITTEN_FROM_VALUES = Object.freeze(['own-turn', 'relayed', 'unknown'])
  const WRITTEN_FROM_MEANS = 'writtenFrom = HOW THE WRITE THAT MADE THIS REVISION GOT HERE. own-turn = the named seat ran it in its own delivered turn; relayed = the office (or another seat) named this seat, but the seat did not run the write; unknown = the call carried no caller and named no seat, or the row was written before this reading existed. This is provenance of the ACT; the different question "which field answered the writer" is `writerSource` on the library head and is unchanged.'
  const writtenFromOf = (row) => {
    const v = row && typeof row === 'object' ? row.writtenFrom : null
    return WRITTEN_FROM_VALUES.indexOf(v) === -1 ? 'unknown' : v
  }
  /**
   * The provenance a WRITE cannot know from its arguments alone: the dispatch layer knows who is running (the seat of
   * this very call), the row text does not. `host-pack-tools.js#makePackToolSpec.run` opens this for the duration of one
   * pack-tool dispatch (try/finally) — the SAME criterion the seat-face gate and the disclosure use — so `put` records
   * a fact the caller already possesses instead of inventing one at read time.
   */
  let ambientTurnCaller = null
  /**
   * ★★★ RUN 77 / TB-2723 (F77-1): THE TURN'S DELIVERY FACTS, NOT ONLY ITS CALLER. The reply channel writes rows through
   * the `vmu.records` face (a field like `progress` is dispatched to `put`), and it never went through the tool-call
   * seam above, so `ambientTurnCaller` was null there and every row written by a DELIVERED turn said `relayed`. The
   * turn receipt said the opposite (`deliveryPath:"activation"`, `memberActed:true`, memberWorkShare.memberActs:8) -
   * one fact, two readings, contradicting each other. The delivery routine knows the answer before the write happens:
   * `activation`/`continuation` mean the seat's own kernel session played the turn, `caller` means the calling session
   * did. `beginTurnDelivery` carries that fact across the SAME seam as `beginTurnCaller` (prev/restore, returns the
   * release), and `put` prefers it over the caller identity when deriving `writtenFrom`.
   */
  let ambientTurnDelivery = null

  /**
   * One time resolver for EVERY field, not just `updatedAt`. RUN 259 / P1-4: the sort comparator did
   * `a.createdAt - b.createdAt` on ISO STRINGS, which is `NaN`, so a `headSort:"createdAt"` page was ordered by the
   * comparator default (input order) while the receipt claimed a sort - a silent misorder, not a crash. A raw value
   * this function cannot read returns `null` (never `NaN`, never 0): the caller NAMES those rows in `orderUnknown`
   * instead of pretending their instant is the epoch and sorting them first.
   */
  const timeMsOf = (raw) => {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
    if (typeof raw === 'string' && raw.trim() !== '') { const n = Number(raw); if (Number.isFinite(n)) return n; const p = Date.parse(raw); return Number.isFinite(p) ? p : null }
    return null
  }
  /** The last-write instant of a row as epoch ms, or null when the row carries no usable time (never NaN by accident). */
  const updatedMsOf = (row) => (row && typeof row === 'object') ? timeMsOf(row.updatedAt) : null
  /** The `excluded` block is only useful if it says WHY it is non-empty; this sentence is its only wording. */
  // ★★★★★★★ RUN 255 / TB-2606-A (run 74 / FEEDBACK74 #7, MEASURED): ONE BLOCK, TWO SHAPES.
  //
  // `excluded` grew piecemeal and ended up asymmetric: `shapeMismatch` was a COUNT while `noWriter`/`timeUnknown` were ID
  // LISTS, so a reader could not write one loop over the block and could not answer "how many rows were dropped, and
  // which" without knowing which key happened to be which kind. Run 74 read it exactly that way. The three original keys
  // keep their names and meanings (compatibility: existing assertions read `noWriter` as a list), and the block is now
  // SYMMETRIC next to them: each list has a `...Count`, the count has an id list (`shapeMismatchIds`). Every number and
  // its ids are produced from the SAME loop that drops the rows, so they cannot disagree.
  const excludedMeansOf = (ex) => {
    const clean = !ex || (ex.shapeMismatch === 0 && ex.noWriter.length === 0 && ex.timeUnknown.length === 0)
    if (clean) return 'no row was dropped for a shape reason: every live row carried the writer and the time this question filtered on (an EMPTY result here means the filter matched nothing, not that rows were unreadable)'
    return 'these rows WERE dropped because a filter could not read the fact it asked for. The block is SYMMETRIC: `shapeMismatch` is a COUNT and `shapeMismatchIds` is the SAME count as ids; `noWriter` is an ID LIST and `noWriterCount` is its count; `timeUnknown` is an ID LIST and `timeUnknownCount` is its count. `noWriter` names rows with no writer under `by`/`writer`/`owner`; `timeUnknown` names rows whose `updatedAt` is not a usable instant. A row dropped by more than one filter appears once per filter it was dropped by, so every count and its ids agree. They are named so "nothing matched" and "rows were thrown away" stay different answers'
  }
  const view = (rec, { withBody = false, at = now(), count = false } = {}) => {
    const base = {
      id: rec.id, track: rec.track, kind: rec.kind, title: rec.title, slug: rec.slug, status: rec.state,
      owner: rec.owner === undefined || rec.owner === null ? rec.by : rec.owner,
      writer: rec.by,
      // ★★ RUN 240: the WRITE face's name for the writer travels with the read row too, so a reader who has only ever
      // seen `by` on a write receipt can match it to the same person without a glossary. `owner`/`writer`/`by` are
      // defined in THREE_NAMES_MEANS above and spelled out in every write receipt and in `get()`/`list()`.
      by: rec.by === undefined ? null : rec.by, updatedAt: rec.updatedAt, createdAt: rec.createdAt, rev: rec.rev, fingerprint: rec.fingerprint,
      bytes: rec.bytes, tags: rec.tags.slice(), tier: tierOf(rec, at), permanent: isPermanent(rec),
      // ★★ RUN 168 (FEEDBACK15 F15-1): `restoredAt` is the durable proof that a live row got here by RESTORE. Without it
      // the snapshot could not tell a genuine restore from the stale live copy the fold still carries right after a prune
      // (both are `status:'live'`), so the prune was undone one read later and the receipt's liveAfter was never true.
      restoredAt: rec.restoredAt === undefined ? null : rec.restoredAt,
      // ★ TB-2691 / F75-11: `writtenFrom` on a ROW is the PROVENANCE of the act that wrote it (own-turn / relayed /
      // unknown), recorded at write time. It is NOT `writerSource`: that name already means "which field answered the
      // writer question" (`by`/`writer`/`owner`) on the library head, and is deliberately left with that one meaning.
      // Both read faces offer `writtenFrom` by default; `list({withWriter:false})` omits it and says so.
      writtenFrom: writtenFromOf(rec),
      writtenFromMeans: WRITTEN_FROM_MEANS,
    }
    if (!withBody) return base
    const cap = truncateTo(rec.body, { count })
    return Object.assign(base, {
      body: cap.body, bodyTruncated: cap.truncated, bodyDroppedBytes: cap.droppedBytes, bodyNotice: cap.notice,
      bodyChunks: cap.chunks, bodyMode: cap.mode,
    })
  }
  /** Body shaping: cap + truncate mode + notice style + chunked return + lazy expansion (all documented knobs). */
  const truncateTo = (body, { count = false } = {}) => {
    const text = String(body === undefined || body === null ? '' : body)
    const bytes = bytesOf(text)
    const overCap = bytes > bodyCapBytes
    let kept = text
    let truncated = false
    if (overCap) {
      truncated = true
      if (count) counters.bodyTruncated += 1
      if (truncateMode === 'keepChars') kept = String(body).slice(0, bodyCapBytes)
      else if (truncateMode === 'keepHeadTail') {
        const half = Math.floor(bodyCapBytes / 2)
        kept = String(body).slice(0, half) + String(body).slice(-half)
      } else {
        const half = Math.floor(bodyCapBytes / 2)
        kept = String(body).slice(0, half) + String(body).slice(-half)
      }
    }
    const droppedBytes = bytes - bytesOf(kept)
    if (count) counters.bodyDroppedBytes += droppedBytes
    if (truncated && count) fire('records/body-truncated', { bytes, cap: bodyCapBytes, droppedBytes, mode: truncateMode })
    const chunks = chunkedReturn && bytes > chunkThreshold ? chunkBody(kept, chunkBytes) : null
    if (chunks && count) counters.chunked += 1
    return {
      body: chunks ? null : kept, truncated, droppedBytes, chunks,
      mode: chunks ? 'chunked' : (truncated ? 'truncated' : 'inline'),
      notice: truncated
        ? (noticeStyle === 'short'
          ? 'body truncated: ' + droppedBytes + ' bytes dropped (' + bytes + ' > ' + bodyCapBytes + ')'
          : 'body truncated: kept ' + bytesOf(kept) + ' of ' + bytes + ' bytes, dropped ' + droppedBytes + ' bytes, mode=' + truncateMode + ' (vmu.records.bodyCapBytes=' + bodyCapBytes + ')')
        : null,
    }
  }
  const pushVersion = (rec, { by, reason, changed }) => {
    const row = { rev: rec.rev, at: now(), by: by === null || by === undefined ? null : String(by), reason: reason === null || reason === undefined ? null : String(reason) }
    if (historyStoreMode === 'full') row.snapshot = { title: rec.title, body: rec.body, tags: rec.tags.slice(), slug: rec.slug }
    else { row.mode = 'diff'; row.changed = changed || {} }
    rec.versions.push(row)
    counters.versions += 1
    if (historyDepth > 0 && rec.versions.length > historyDepth) {
      const dropped = rec.versions.length - historyDepth
      rec.versions.splice(0, dropped)
      counters.versionsPruned += dropped
      fire('records/retention-truncated', { id: rec.id, dropped, depth: historyDepth })
    }
  }

  const api = {
    /**
     * RUN 269 / TB-2697: the write is durable, so it is no longer in flight (see `acknowledgeFoldWrite` above). The
     * kernel calls this the moment its snapshot patch RESOLVES; the pending mark exists only to cover the window
     * between the mutation and that resolution. Returns how many marks this call cleared, so a receipt can say it.
     */
    acknowledgeFoldWrite,
    /**
     * RUN 256 / TB-2618: a pack's POST-CONSTRUCTION `recordTracks` declaration. It extends the live whitelist for
     * THIS handle (put/list read `liveTracks()`), so "declared after boot" is effective, not a no-op. The
     * construction-time settings snapshot (`vmu.records.tracks`) is NOT rewritten: the fold in kernel/pack.js owns
     * the durable spelling, and a retraction returns to it.
     */
    declareTracks(list = []) {
      const wanted = listOf(list, [])
      const fired = []
      const seen = new Set(liveTracks())
      for (const track of wanted) {
        const name = String(track)
        if (name === '') continue
        if (!seen.has(name)) { seen.add(name); fired.push(name) }
        declaredExtraTracks.add(name)
      }
      return {
        ok: true,
        enforced: [K.tracks], enforcedScope: ENFORCED_SCOPE,
        fired,
        tracks: liveTracks(),
        declared: wanted.map(String),
      }
    },
    /**
     * TB-2691 / F75-11: open the dispatch caller for the duration of ONE tool call and return the release. The kernel
     * face (host-pack-tools `makePackToolSpec.run`) already resolves `callerMember`; kit handlers ignore it, so the
     * resolved caller travels through this seam into `put`, which records `writtenFrom` on the row. Without the seam
     * the row can only say "somebody wrote it", which is exactly the defect: a relayed write looked like an own turn.
     */
    beginTurnCaller(member) {
      const prev = ambientTurnCaller
      const text = member === null || member === undefined ? '' : String(member).trim()
      ambientTurnCaller = text === '' ? null : text
      return () => { ambientTurnCaller = prev }
    },
    /**
     * ★★★ RUN 77 / TB-2723 (F77-1): open the DELIVERY facts for the duration of one reply dispatch and return the
     * release. `path` is the turn receipt's own word (`activation` / `continuation` / `caller` / null); `turnId` and
     * `member` travel with it so a reader can line the row up with the turn row that carried it. A caller that has no
     * delivery fact passes nothing and the old derivation applies unchanged - the seam is additive, never required.
     */
    beginTurnDelivery(delivery = {}) {
      const prev = ambientTurnDelivery
      const path = delivery && typeof delivery.path === 'string' && delivery.path !== '' ? delivery.path : null
      const turnId = delivery && delivery.turnId !== null && delivery.turnId !== undefined && String(delivery.turnId).trim() !== '' ? String(delivery.turnId).trim() : null
      const member = delivery && delivery.member !== null && delivery.member !== undefined && String(delivery.member).trim() !== '' ? String(delivery.member).trim() : null
      ambientTurnDelivery = path === null && turnId === null && member === null ? null : { path, turnId, member }
      return () => { ambientTurnDelivery = prev }
    },
    apiVersion,

    /**
     * ROUND 36 (task-26): hand the durable port in AFTER construction, so a READ can see rows another kernel wrote.
     * DUCK-TYPED ON PURPOSE: the seam needs `read(key)` (and `stats()` for the stamp, when the port has it). A caller
     * without a store simply never calls this, and a face built by hand in a unit test is untouched. It never THROWS:
     * an unusable seam is a NAMED result, because a boot path must not crash over an optional port.
     */
    attachStore(store) {
      if (!store || typeof store.read !== 'function') {
        return { ok: false, reason: 'not-a-store', hint: 'attachStore needs the durable port (`store.read(key)`); the projection will not guess a storage shape (docs/07 §1)', enforced: [], fired: [] }
      }
      shared.store = store
      shared.attached = true
      shared.signature = null    // the next read folds the fold as it stands, whatever happened before the attach
      shared.stamp = null
      return { ok: true, reason: null, attached: true, key: SHARED_STORE_KEY, enforced: [], fired: [] }
    },

    /**
     * ROUND 261 (volume 16 §L9/L10): register a DATASET - a record with kind `dataset`, carrying path, fingerprint and parent, and
     * referenceable by version. The two declarations are honoured here and nowhere else, so there is exactly one dataset path.
     */
    datasetRegister({ track, title, path = null, fingerprint = null, parent = null, version = null, body = '', tags = [], finalAck = undefined, settled = undefined, by = null } = {}) {
      const enforced = []
      mark(enforced, K.dataRequireParent)
      const needParent = sget(K.dataRequireParent) === true
      // §L128: a dataset is path + fingerprint + parameters + parent. A missing fingerprint is a named refusal, never a silent null.
      if (!fingerprint) {
        throw deny('VMU_INVALID_ARGUMENT', 'a dataset needs a fingerprint (volume 16 §L128: 路径＋指纹＋参数＋parent)',
          'compute it with the declared algorithm vmu.fingerprint.algo, or pass fingerprint explicitly', [K.dataRequireParent], 'datasetRegister')
      }
      if (needParent && !parent) {
        throw deny('VMU_INVALID_ARGUMENT', 'vmu.data.requireParent=true and this dataset declares no parent',
          'set parent to the id of the record it came from (or to an external origin), or set vmu.data.requireParent=false', [K.dataRequireParent], 'datasetRegister')
      }
      mark(enforced, K.dataVersionScheme)
      const scheme = String(sget(K.dataVersionScheme) || 'semver')
      const v = version === null || version === undefined ? null : String(version)
      if (scheme === 'semver') {
        if (v !== null && !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(v)) {
          throw deny('VMU_INVALID_ARGUMENT', 'vmu.data.versionScheme=semver but the version is not one: ' + JSON.stringify(v),
            'use MAJOR.MINOR.PATCH (optionally with a pre-release or build suffix)', [K.dataVersionScheme], 'datasetRegister')
        }
      } else if (v !== null && v.trim() === '') {
        throw deny('VMU_INVALID_ARGUMENT', 'versionScheme=' + scheme + ' and the version is empty',
          'declare a non-empty version, or leave it out for an unversioned dataset', [K.dataVersionScheme], 'datasetRegister')
      }
      const meta = ['dataset', 'path=' + String(path), 'fingerprint=' + String(fingerprint), 'parent=' + (parent === null ? '-' : String(parent)),
        'version=' + (v === null ? '-' : v), 'scheme=' + scheme].join(' ')
      const rec = this.put({ track, kind: 'dataset', title, body: body || meta, tags, finalAck, settled, by })
      return Object.assign({}, rec, { dataset: { path, fingerprint, parent: parent === null ? null : String(parent), version: v, scheme },
        enforced: [...enforced, K.allowedKinds], enforcedScope: 'evaluated-so-far' })
    },

    /**
     * ROUND 278 (volume 16 §L166-168): file a rebuttal - one entry per review comment, pairing the comment with the response and the
     * change it caused. `vmu.review.rebuttalRequired` (default true) refuses an entry that files a comment without a response.
     */
    rebuttal({ track, title, comment = null, response = null, changeRef = null, body = '', tags = [], finalAck = undefined, settled = undefined, by = null } = {}) {
      const enforced = []
      mark(enforced, K.rebuttalRequired)
      // ROUND 280: read by LITERAL - the shape generate-wired-schema.mjs recognises (see the file header's four accessor
      // shapes). Read through the name map it was invisible to that generator, so the key sat in the planned registry.
      const required = sget('vmu.review.rebuttalRequired', true) !== false
      const hasComment = typeof comment === 'string' && comment.trim() !== ''
      const hasResponse = typeof response === 'string' && response.trim() !== ''
      if (!hasComment) {
        throw deny('VMU_INVALID_ARGUMENT', 'a rebuttal needs the review comment it answers',
          'pass comment:<the reviewer\'s point> (volume 16 §L168: one entry per comment)', [K.rebuttalRequired], 'rebuttal')
      }
      if (required && !hasResponse) {
        throw deny('VMU_INVALID_ARGUMENT', 'vmu.review.rebuttalRequired=true and this entry files a comment with no response',
          'pass response:<what changed, or why not>, or set vmu.review.rebuttalRequired=false', [K.rebuttalRequired], 'rebuttal')
      }
      const meta = ['rebuttal', 'changeRef=' + (changeRef === null ? '-' : String(changeRef)), 'response=' + (hasResponse ? 'yes' : 'no')].join(' ')
      const rec = this.put({ track, kind: 'rebuttal', title, body: body || (String(comment) + '\n=> ' + String(response || '-') + '\n' + meta), tags, finalAck, settled, by })
      return Object.assign({}, rec, { rebuttal: { comment: String(comment), response: hasResponse ? String(response) : null,
        changeRef: changeRef === null ? null : String(changeRef), responseRequired: required },
        enforced: [...enforced, K.allowedKinds], enforcedScope: 'evaluated-so-far' })
    },

    /** Create a record. Every cap is a NAMED refusal with 现值/上限; duplicates are COUNTED, never re-added. */
    put({ id: requestedId = null, track, kind, title, body = undefined, tags = undefined, finalAck = undefined, finalAckSource = null, settled = undefined, permanent = undefined, by = null, owner = undefined, bodyMode = null, confirmDestructive = false, writtenFrom = null } = {}) {
      // ★ ROUND 36: fold the fold BEFORE writing, because the write-through snapshot (kernel/index.js) replaces the
      // WHOLE `records` array with THIS instance's view. Without this, instance A's put would overwrite instance B's
      // rows - a lost update that no read-path fix could repair (the rows would be gone from the durable file).
      synchronize('put')
      const enforced = []
      const fired = []
      mark(enforced, K.tracks)
      if (!liveTracks().includes(track)) {
        mark(fired, K.tracks)
        throw deny('VMU_INVALID_ARGUMENT', 'unknown record track: ' + String(track) + ' (' + liveTrackNames().join('/') + ')',
          'vmu.records.tracks declares the tracks; a new track must be declared before it can hold records (vmu.records.tracks)', [K.tracks], 'put')
      }
      // ★★★ ROUND 236 / M4 (measured, FEEDBACK60 §M4): an UPDATE used to REBUILD the row from what THIS call named, so
      // every field the caller did not name was reset and the previous body was destroyed while the receipt said
      // `ok:true`. A member's CORRECTION therefore renamed its card to its own id ("rec-6"), reverted its value and
      // dropped a whole `- debateRuling：` line — nobody was told. An update now MERGES BY FIELD: what this write names
      // wins, what it does not name is KEPT, the row's identity (id/slug/createdAt) survives, the previous state goes
      // into `versions` (readable, not destroyed), and the receipt says which fields were kept and how the body was
      // written (`bodyModeUsed`). Read the merge inputs BEFORE the checks, because the checks must judge the values
      // that will actually land (an omitted kind keeps the row's kind instead of refusing "kind undefined").
      const existingRow = (requestedId === null || requestedId === undefined) ? null : (records.get(String(requestedId)) || null)
      const isUpdate = !!(existingRow && existingRow.state === 'live' && existingRow.track === track)
      const updating = isUpdate ? existingRow : null
      const bodyModeRaw = bodyMode === null || bodyMode === undefined ? 'replace' : String(bodyMode)
      if (BODY_MODES.indexOf(bodyModeRaw) === -1) {
        throw deny('VMU_INVALID_ARGUMENT', 'unknown bodyMode: ' + JSON.stringify(bodyMode) + ' (allowed: ' + BODY_MODES.join(', ') + ')',
          'bodyMode:"replace" swaps the body of the named row (the write is listed in records.history); bodyMode:"append" keeps the old body and adds this text after it', [], 'put')
      }
      if (!updating && bodyMode !== null && bodyMode !== undefined) {
        throw deny('VMU_INVALID_ARGUMENT', 'bodyMode:' + JSON.stringify(bodyMode) + ' was named for a write that MINTS a new record',
          'bodyMode only means something on an UPDATE of an existing row (an add has no previous body); drop bodyMode, or name an existing id', [], 'put')
      }
      const titleGiven = title !== undefined && title !== null && String(title).trim() !== ''
      // ★ an ID is not a NAME. The card path hands `title = <the row's own id>` when the caller named no title
      // (kit/handlers.js titleOfCard: explicit title -> id -> claim -> kindWord), and taking that literally renamed the
      // card to "rec-6" — the measured M4 shape. A supplied title that IS the row's own id is not a title.
      const titleIsOwnId = !!(updating && titleGiven && String(title) === String(updating.id))
      const kindGiven = kind !== undefined && kind !== null && String(kind).trim() !== ''
      const tagsGiven = tags !== undefined && tags !== null
      const permanentGiven = permanent !== undefined
      const bodyGiven = body !== undefined
      const byGiven = by !== undefined && by !== null && String(by).trim() !== ''
      const mergedKind = updating ? (kindGiven ? String(kind) : updating.kind) : kind
      const mergedTitle = updating ? (titleGiven && !titleIsOwnId ? String(title) : updating.title)
        : (title === undefined || title === null ? null : String(title))
      const mergedTags = updating ? (tagsGiven ? listOf(tags, []) : updating.tags) : listOf(tags, [])
      const mergedPermanent = updating ? (permanentGiven ? permanent === true : updating.permanent === true) : permanent === true
      const mergedBy = updating ? (byGiven ? String(by) : (updating.by === undefined ? null : updating.by)) : (by === null || by === undefined ? null : String(by))
      // ★★★ RUN 239 (live run 62 / FEEDBACK62 #3, MEASURED): AN UPDATE RENAMED THE CARD'S OWNER TO ITS WRITER.
      // `- owner` was not a field at all: the view derived it from `by`, so rec-3 (owner r-1) became owner r-acad the
      // moment the chair corrected one line, and the receipt counted that under `fieldsReplaced`. Ownership is who the
      // card BELONGS to; `by` is who WROTE this revision. Two facts, two fields. An update keeps the owner it found
      // unless this write names one, and the view falls back to the writer only for rows written before this change.
      const ownerGiven = owner !== undefined && owner !== null && String(owner).trim() !== ''
      const mergedOwner = updating
        ? (ownerGiven ? String(owner) : (updating.owner !== undefined && updating.owner !== null ? String(updating.owner) : (updating.by === undefined ? null : updating.by)))
        : (ownerGiven ? String(owner) : mergedBy)
      // ★★★ TB-2691 / F75-11: the provenance of THIS write lands on the row (see WRITTEN_FROM_MEANS). A named, valid
      // value wins; otherwise it is derived from the dispatch caller (ambientTurnCaller) and the writer this write names:
      // no caller + a named writer = relayed (the office named a seat but did not run as it), caller + same/absent name =
      // own-turn, no caller + no name = unknown. Never guessed from the row text.
      const writtenFromGiven = writtenFrom !== undefined && writtenFrom !== null && String(writtenFrom).trim() !== ''
      if (writtenFromGiven && WRITTEN_FROM_VALUES.indexOf(String(writtenFrom).trim()) === -1) {
        throw deny('VMU_INVALID_ARGUMENT', 'writtenFrom is not a provenance this kernel records: ' + JSON.stringify(writtenFrom),
          'allowed: ' + WRITTEN_FROM_VALUES.join(' / ') + ' (own-turn = the seat ran it in its own turn; relayed = named but not run by the seat; unknown = neither could be established)', [], 'put')
      }
      const namedWriter = mergedBy === null || mergedBy === undefined || String(mergedBy).trim() === '' ? null : String(mergedBy)
      // ★★★ RUN 77 / TB-2723 (F77-1): THE DELIVERY ROUTE OUTRANKS THE CALLER IDENTITY. A reply-channel write has no
      // `ambientTurnCaller` (that seam was opened only around a tool call), so a row written by a turn the seat itself
      // played said `relayed` while its own turn receipt said `deliveryPath:"activation"` + `memberActed:true`. The
      // delivery routine now states the route before the write: activation/continuation = the seat ran it, caller = the
      // calling session played the turn. When there is no delivery fact the caller-based derivation below is unchanged.
      const deliveryPath = ambientTurnDelivery && typeof ambientTurnDelivery.path === 'string' && ambientTurnDelivery.path !== '' ? ambientTurnDelivery.path : null
      const deliveryMember = ambientTurnDelivery && typeof ambientTurnDelivery.member === 'string' && ambientTurnDelivery.member !== '' ? ambientTurnDelivery.member : null
      // Any route the delivery seam names OTHER THAN `caller` means the seat's own session (or a host subagent running
      // as that seat) played the turn — the same classifier `memberWorkShare` uses on the turn row. `caller` is the one
      // route where the calling session played the member, and that is exactly the relayed case. No route at all falls
      // back to the caller identity (legacy behaviour).
      const deliveredOwnTurn = deliveryPath !== null && deliveryPath !== 'caller'
      const derivedWrittenFrom = deliveryPath === 'caller'
        ? 'relayed'
        : (deliveredOwnTurn
          ? (namedWriter === null || deliveryMember === null || namedWriter === deliveryMember ? 'own-turn' : 'relayed')
          : (ambientTurnCaller === null
            ? (namedWriter === null ? 'unknown' : 'relayed')
            : (namedWriter === null || namedWriter === ambientTurnCaller ? 'own-turn' : 'relayed')))
      const mergedWrittenFrom = writtenFromGiven ? String(writtenFrom).trim()
        : (updating && WRITTEN_FROM_VALUES.indexOf(updating.writtenFrom) !== -1 && ambientTurnCaller === null && deliveryPath === null ? updating.writtenFrom : derivedWrittenFrom)

      const bodyNew = body === undefined || body === null ? '' : String(body)
      const bodyModeUsed = !updating ? 'replace' : (!bodyGiven ? 'kept' : bodyModeRaw)
      const oldText = updating ? String(updating.body === undefined || updating.body === null ? '' : updating.body) : ''
      const mergedBody = !updating ? bodyNew
        : (!bodyGiven ? oldText
          : (bodyModeRaw === 'append' ? (bodyNew === '' ? oldText : (oldText === '' ? bodyNew : oldText + '\n' + bodyNew)) : (bodyModeRaw === 'merge' ? mergeCardText(oldText, bodyNew) : bodyNew)))
      if (finalAck !== undefined && settled !== undefined && finalAck !== settled) {
        throw deny('VMU_INVALID_ARGUMENT', 'finalAck and settled name DIFFERENT answers for the same write (finalAck=' + String(finalAck) + ', settled=' + String(settled) + '); the old word is a deprecated alias, so naming both with different values is refused instead of guessed',
          'send finalAck:true (or nothing) for a final write; do NOT pass settled in new code - it is accepted only as the legacy alias for callers that have not migrated', [K.requireSettled], 'put')
      }
      const admitted = finalAck === true || settled === true
      const admissionSource = finalAck === true ? (settled === true ? 'final-ack' : String(finalAckSource || 'caller')) : (settled === true ? 'legacy-settled' : null)
      mark(enforced, K.requireSettled)
      if (requireSettled && !admitted) {
        mark(fired, K.requireSettled)
        throw deny('VMU_STATE', 'track "' + track + '" admits only writes whose caller ACKNOWLEDGES the record is final (vmu.records.requireSettledRecords=true): pass finalAck:true - this is a WRITE ADMISSION, not a stored state',
          'pass finalAck:true once this write is final, or set vmu.records.requireSettledRecords=false (vmu.records.requireSettledRecords) - the flag is consumed at the gate and never persisted: no row carries it', [K.tracks, K.requireSettled], 'put')
      }
      mark(enforced, K.allowedKinds)
      if (!allowedKinds.includes(mergedKind)) {
        mark(fired, K.allowedKinds)
        throw deny('VMU_INVALID_ARGUMENT', 'kind "' + String(mergedKind) + '" is not allowed (vmu.records.allowedKinds)',
          'allowed kinds: ' + allowedKinds.join(', ') + ' (vmu.records.allowedKinds)', [K.tracks, K.requireSettled, K.allowedKinds], 'put')
      }
      // ★ RUN 165 (measured): a put that UPDATEs an existing row of the same track does not add a row, so the head cap
      // does not apply to it. Before this, `paper start` (one state row, written twice: mint, then fold the id in) was
      // refused on its SECOND write whenever the track was exactly one below its cap — and the refusal left the minted
      // state row behind as a ghost that then held the free slot: the very repair (prune) the refusal recommends became
      // unactionable on the next call. An update is now recognised by id+track+live and exempted from the ADD caps.
      // (`existingRow` / `isUpdate` are resolved above, with the merge inputs.)
      mark(enforced, K.headMaxItems)
      const headMaxItems = headMaxItemsNow()
      if (!isUpdate && headMaxItems > 0 && liveIds(track).length >= headMaxItems) {
        mark(fired, K.headMaxItems)
        throw deny('VMU_QUOTA_EXCEEDED', 'track "' + track + '" is full: ' + liveIds(track).length + '/' + headMaxItems + ' live records (vmu.records.head.maxItems)',
          'this track is full. TWO reachable repairs: (1) call vibe_vmu_records {action:"prune", track:"<this track>", keep:<how many newest rows to keep>, why:"why these rows may go"} — the OLDEST rows move to the TRASH (restorable until purgeAt, vmu.records.trash.retainDays), and the ledger never evicts silently; (2) this limit is read at WRITE time, so raising it with vibe_v5_set {key:"vmu.records.head.maxItems", value:<bigger>, why:"why this track needs room"} takes effect on the NEXT put (no restart; the office is the writer of every vmu.records setting)', [K.tracks, K.requireSettled, K.allowedKinds, K.headMaxItems], 'put')
      }
      // ★★ RUN 241 (FEEDBACK64 M10, MEASURED): a card body carried `- id：rec-4` — a line repeating the row's OWN id.
      // The id is the ROW, not a field of its body; a reader who sees it must not think the id is content that can drift,
      // and a MERGE receipt reported it as `bodyLinesAdded:["id"]` ("a body line was added") when nothing was added by
      // the caller. Dropped here, at the ONE place a body is stored, so both the stored card and `bodyLinesAdded` agree.
      const ownIdForBody = updating
        ? String(updating.id)
        : (requestedId === null || requestedId === undefined ? null : String(requestedId))
      let bodyText = mergedBody
      let bodyOwnIdLineDropped = false
      if (ownIdForBody !== null) {
        const NL = String.fromCharCode(10)
        const kept = []
        for (const line of String(bodyText === null || bodyText === undefined ? '' : bodyText).split(NL)) {
          const m = /^-\s*id\s*[：:]\s*(.*?)\s*$/.exec(line)
          if (m && String(m[1]) === ownIdForBody) { bodyOwnIdLineDropped = true; continue }
          kept.push(line)
        }
        if (bodyOwnIdLineDropped) bodyText = kept.join(NL)
      }
      const bytes = bytesOf(bodyText)
      // ★★★ RUN 239 (live run 62 / FEEDBACK62 #2, MEASURED): a replace that DELETES a settlement line is refused by
      // name instead of being reported after the fact. The receipt already said `bodyLinesDropped`, but a receipt after
      // the destruction is an epitaph: the settled probability was gone and the card read as undecided. The two honest
      // ways forward are named in the refusal - `bodyMode:"merge"` (what this write names wins, every other line
      // survives) or `confirmDestructive:true` when the deletion IS the intent.
      if (updating && bodyGiven && bodyModeUsed === 'replace' && confirmDestructive !== true) {
        const beforeKeys = cardLinesOf(oldText)
        const afterKeys = cardLinesOf(bodyText)
        const lost = SETTLEMENT_LINES.filter((k) => beforeKeys.indexOf(k) !== -1 && afterKeys.indexOf(k) === -1)
        if (lost.length > 0) {
          mark(fired, K.bodyCapBytes)
          throw deny('VMU_RECORD_DESTRUCTIVE_WRITE', 'this replace would delete the settlement-bearing line(s) ' + lost.join(', ') + ' from record ' + String(updating.id) + ': the card would read as undecided after the write',
            'pass bodyMode:"merge" so the lines this write does NOT name survive (a correction changes named fields, it does not re-create the card), or pass confirmDestructive:true when deleting them is what you mean', [K.bodyCapBytes], 'put')
        }
      }
      mark(enforced, K.bodyCapBytes)
      if (bytes > bodyCapBytes) { mark(fired, K.bodyCapBytes); counters.bodyTruncated += 1; fire('records/body-truncated', { at: now(), bytes, cap: bodyCapBytes, mode: truncateMode }) }
      mark(enforced, K.retentionMaxBytes)
      // an update REPLACES the bytes of the row it rewrites, so the budget is billed on the delta, not on the sum
      const billedBytes = isUpdate ? (trackBytes(track) - existingRow.bytes + bytes) : (trackBytes(track) + bytes)
      if (retentionMaxBytes > 0 && billedBytes > retentionMaxBytes) {
        mark(fired, K.retentionMaxBytes)
        if (trashCountInQuota) mark(enforced, K.trashCountInQuota)
        throw deny('VMU_QUOTA_EXCEEDED', 'track "' + track + '" would exceed its size budget: ' + billedBytes + '/' + retentionMaxBytes + ' bytes (vmu.records.retention.maxBytes)',
          'TWO reachable repairs: (1) call vibe_vmu_records {action:"prune", track:"<this track>", keep:<how many newest rows to keep>, why:"why these rows may go"} — the OLDEST rows move to the TRASH (restorable until purgeAt); (2) raise vmu.records.retention.maxBytes with vibe_v5_set {key:"vmu.records.retention.maxBytes", value:<bigger>, why:"why this track needs room"} — the ledger never drops a row silently' + (trashCountInQuota ? ' (trashed records count: vmu.records.trash.countInQuota=true)' : ' (trashed records do not count: vmu.records.trash.countInQuota=false)'), [K.tracks, K.requireSettled, K.allowedKinds, K.headMaxItems, K.bodyCapBytes, K.retentionMaxBytes], 'put')
      }
      // **去重**（同一键不得出现两次 ✗✓）：`slugMaxLength` 已在上一行整体 push ⇒ 截断时只标 `fired`（不重复进 enforced ✓）
      markAll(enforced, [K.slugPolicy, K.slugMaxLength, K.conflictSuffix])
      const slugged = slugify(mergedTitle === undefined || mergedTitle === null ? mergedKind : mergedTitle, slugPolicy, slugMaxLength)
      if (slugged.truncated) { counters.slugTruncated += 1; mark(fired, K.slugMaxLength) }
      if (slugged.truncated && enforced.indexOf(K.slugMaxLength) === -1) mark(enforced, K.slugMaxLength)
      const slugIndex = bySlug.get(track) || new Map()
      bySlug.set(track, slugIndex)
      // ★ RUN 165: an UPDATE keeps its own slug free — otherwise re-putting the SAME row bumped the conflict suffix
      // (`q165-x` → `q165-x-2` → `q165-x-3` …) on every write, because the index still held the row's previous slug.
      // A paper state row is rewritten on every action, so this was unbounded churn in a field callers read.
      if (isUpdate && existingRow.slug && slugIndex.get(existingRow.slug) === existingRow.id) slugIndex.delete(existingRow.slug)
      let slug = slugged.slug
      if (slugIndex.has(slug)) {
        counters.slugConflicts += 1
        mark(fired, K.conflictSuffix)
        const base = slug
        let n = 2
        do { slug = base + suffixFor(n); n += 1 } while (slugIndex.has(slug) && n < 1000)
      }
      mark(enforced, K.fingerprintPolicy)
      const candidate = { track, kind: mergedKind, title: mergedTitle, slug, body: bodyText, tags: mergedTags, }
      const fp = fingerprintOf(candidate)
      const fpIndex = byFingerprint.get(track) || new Map()
      byFingerprint.set(track, fpIndex)
      // ★★★ RUN 178 (run 22, FEEDBACK22 D1 follow-on — MEASURED): an UPDATE that restores an EARLIER body was silently
      // deduplicated against its OWN STALE fingerprint and the write vanished. `put` never refreshed `byFingerprint` when
      // it rewrote a row, so after the state row went awaiting-editor → finalized, the index still mapped the OLD body's
      // fingerprint to that same id; the rollback (which writes the old body back, since a restored-but-undefined `final`
      // serialises away) then hit `fpIndex.has(fp)`, got `{deduplicated:true}`, RETURNED the existing row — and the row on
      // disk stayed `finalized`. The receipt said "not finalised", `status` said "finalized": two truths, one record.
      // An update names the row it rewrites, so it must be WRITTEN: dedupe is about ADDING content, never about replacing
      // it. The stale self-fingerprint is dropped here so the index answers the body that is actually on disk.
      if (isUpdate && existingRow && existingRow.fingerprint && fpIndex.get(existingRow.fingerprint) === existingRow.id) fpIndex.delete(existingRow.fingerprint)
      if (!isUpdate && fpIndex.has(fp)) {
        counters.deduplicated += 1
        mark(fired, K.fingerprintPolicy)
        const existing = records.get(fpIndex.get(fp))
        record_({ type: 'records/deduplicated', id: existing.id, track, fingerprint: fp })
        say({ type: 'records/deduplicated', at: now(), id: existing.id, track, fingerprint: fp })
        fire('records/deduplicated', { id: existing.id, track, fingerprint: fp })
        return { ok: true, deduplicated: true, id: existing.id, slug: existing.slug, fingerprint: fp, bytes: existing.bytes, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired), note: 'the same content is already recorded in this track (fingerprintPolicy=' + fingerprintPolicy + '): nothing was added, the duplicate is COUNTED' }
      }
      // ★★★ A MINTED ID MUST BE FREE, AND `mint()` ALONE DOES NOT GUARANTEE THAT. `kernel/ids.js` promises strictly increasing
      // numbers, which prevents reuse BY THE MINTER - but a record can also be written with an EXPLICIT id (the paper-part path does
      // exactly that), and the minter has no idea that number is taken. Measured on a full live run: `records list` returned the same
      // id nine times and `total` counted it nine times. The chain was: mint hands out an id an explicit write already owns ->
      // `records.set` overwrites the map entry -> `order.push` and the track push append a SECOND index row for it. So the count
      // grew while the data was destroyed, and neither the write nor the read said anything.
      // ★ Loop until free. This is the fix at the ROOT: no collision means no overwrite and no duplicate index row.
      let id
      if (requestedId === null || requestedId === undefined) {
        // ★ ROUND 42 / F-13: the prefix is `rec-`, NOT `r-`. The roster mints its own ids from the same `ids`
        //    counter family with the `r-` shape (`r-acad`, `r-1`, `r-2` in a live run), so a record id and a
        //    member id were the same string: `vibe_v5_read_library{ id: "r-1" }` could not tell a reader from a
        //    record, and a record id handed to `member:` (or the reverse) was accepted as "unknown object" with no
        //    way to see the mistake. One namespace per noun: rows are `rec-<n>`, people are `r-<n>`. OLD `r-` ids
        //    stay readable (an id is a name; history is not migrated), they are just no longer MINTED.
        do { id = mint('record', 'rec-') } while (records.has(id))
      } else {
        id = String(requestedId)
      }
      const at = now()
      let rec
      let fieldsReplaced = []
      if (updating) {
        // ── ROUND 236 / M4: an UPDATE is a CORRECTION, not a re-creation ────────────────────────────────────────
        // What this write NAMED wins; what it did not name is KEPT (title/kind/tags/permanent/by/body); the identity
        // (id/slug/createdAt) survives; the previous state is PUSHED into `versions`, so a replaced body is readable
        // in `records.history` instead of destroyed; and the receipt names exactly which fields moved (`fieldsReplaced`)
        // and which were kept (`fieldsKept`). The receipt is where a caller learns what its write did — M4's write said
        // `ok:true` and lost a whole `- debateRuling：` line without a word.
        const changed = {}
        if (mergedTitle !== updating.title) changed.title = [updating.title, mergedTitle]
        if (bodyText !== oldText) changed.body = [updating.bytes, bytes]
        if (mergedKind !== updating.kind) changed.kind = [updating.kind, mergedKind]
        if (JSON.stringify(mergedTags) !== JSON.stringify(updating.tags)) changed.tags = [updating.tags.slice(), mergedTags]
        if (mergedPermanent !== (updating.permanent === true)) changed.permanent = [updating.permanent === true, mergedPermanent]
        if (mergedBy !== (updating.by === undefined ? null : updating.by)) changed.by = [updating.by === undefined ? null : updating.by, mergedBy]
        const ownerBefore = updating.owner === undefined || updating.owner === null ? (updating.by === undefined ? null : updating.by) : updating.owner
        if (mergedOwner !== ownerBefore) changed.owner = [ownerBefore, mergedOwner]
        markAll(enforced, [K.historyStoreMode, K.historyDepth])
        if (Object.keys(changed).length === 0) mark(fired, K.historyStoreMode)
        pushVersion(updating, { by: mergedBy, reason: 'put-update (' + bodyModeUsed + ')', changed })
        updating.kind = mergedKind
        updating.title = mergedTitle
        updating.slug = slug
        updating.body = bodyText
        updating.tags = mergedTags
        updating.bytes = bytes
        updating.fingerprint = fp
        updating.permanent = mergedPermanent
        updating.rev = (Number.isInteger(updating.rev) ? updating.rev : 1) + 1
        updating.updatedAt = at
        updating.by = mergedBy
        updating.owner = mergedOwner
        updating.writtenFrom = mergedWrittenFrom
        updating.state = 'live'
        rec = updating
        fieldsReplaced = Object.keys(changed)
      } else {
        rec = {
          id, track, kind: String(mergedKind), title: mergedTitle, slug, body: bodyText, tags: mergedTags, bytes,
          fingerprint: fp, permanent: mergedPermanent, state: 'live', rev: 1, createdAt: at, updatedAt: at,
          by: mergedBy, owner: mergedOwner, versions: [], trashedAt: null, purgeAt: null,
          writtenFrom: mergedWrittenFrom,
        }
      }
      // ★★ RUN 174 (run 19 F3/F10 — AN ID LIVES IN EXACTLY ONE TRACK): a put that names an EXISTING id while naming a
      // DIFFERENT track used to push the new index row and leave the old one behind. One id then answered TWO
      // `list({track})` calls — `list({track:"paper"})` returned a row whose own `track` still said "propositions" — and
      // because the durable snapshot walks the track lists (kernel/index.js snapshotRecords), the SAME row was written to
      // the fold twice. Measured in run 19: `prune {track:"paper", keep:0, dryRun:true}` listed rec-495 (a propositions
      // card) among the paper rows, and the ledger carried two identical live rows for it while a fresh kernel folded the
      // duplicates away (so the durable file looked clean afterwards and the leak hid). Moving the index is a mutation like
      // any other: it is COUNTED and REPORTED (`retrackedFrom`), never silent.
      let retrackedFrom = null
      if (existingRow && existingRow.track !== track) {
        retrackedFrom = String(existingRow.track)
        const oldArr = trackList(retrackedFrom)
        const oldIdx = oldArr.indexOf(id)
        if (oldIdx >= 0) oldArr.splice(oldIdx, 1)
        const oldSlug = bySlug.get(retrackedFrom)
        if (oldSlug && oldSlug.get(existingRow.slug) === id) oldSlug.delete(existingRow.slug)
        const oldFp = byFingerprint.get(retrackedFrom)
        if (oldFp && oldFp.get(existingRow.fingerprint) === id) oldFp.delete(existingRow.fingerprint)
        counters.retracked += 1
      }
      records.set(id, rec)
      noteLocalWrite(rec)
      // ★ Defense in depth: an explicit re-put under the SAME id is LEGITIMATE (the paper tamper test relies on it), so the map is
      // overwritten on purpose - but the INDEX arrays must never gain a second row for one id, because a duplicate there carries no
      // information and only makes a later read count the record twice.
      if (!order.includes(id)) order.push(id)
      const trackArr = trackList(track)
      if (!trackArr.includes(id)) trackArr.push(id)
      slugIndex.set(slug, id)
      fpIndex.set(fp, id)
      counters.put += 1
      if (tierThreshold > 0) mark(enforced, K.tierThreshold)
      record_({ type: 'records/put', id, track, kind: rec.kind, slug, bytes, fingerprint: fp })
      say({ type: 'records/put', at, id, track, fingerprint: fp })
      fire('records/put', { id, track, fingerprint: fp })
      if (typeof onProgress === 'function' && track === 'progress') {
        // the event must carry the values that LANDED (an update may name neither kind nor by; the row keeps them)
        try { onProgress({ id, track, kind: mergedKind, at, by: mergedBy }) } catch { /* reported, never fatal */ }
      }
      // ── the receipt: an UPDATE speaks about what it KEPT and what it REPLACED (M4: `ok:true` alone let a silent
      // field loss read as a successful correction) ───────────────────────────────────────────────────────────────
      const fieldsKept = []
      if (updating) {
        if (!titleGiven || titleIsOwnId) fieldsKept.push('title')
        if (!kindGiven) fieldsKept.push('kind')
        if (!tagsGiven) fieldsKept.push('tags')
        if (!permanentGiven) fieldsKept.push('permanent')
        if (!bodyGiven) fieldsKept.push('body')
        if (!byGiven) fieldsKept.push('by')
        fieldsKept.push('id', 'createdAt', 'versions')
      }
      const bodyModeMeans = !updating ? null
        : (bodyModeUsed === 'kept'
          ? 'this write named no body, so the row KEPT its body (' + bytesOf(oldText) + ' bytes): an update is a correction, not a re-creation'
          : (bodyModeUsed === 'append'
            ? 'the previous body was KEPT and this text was added after it (' + bytes + ' bytes now); pass bodyMode:"replace" to swap the whole body'
            : (bodyModeUsed === 'merge'
              ? 'the body was MERGED: the lines this write named replaced their counterparts and every other line survived (' + bytes + ' bytes now); the previous text is listed in records.history'
              : 'the body was REPLACED by this write (' + bytes + ' bytes); the write is listed in records.history as a version (vmu.records.history.storeMode:"full" keeps the whole previous text, "diff" names the changed fields and their sizes), so it is reported, not silent')))
      // ★★★ RUN 238 (run 61 / FEEDBACK61 B, MEASURED): `bodyModeUsed:"replace"` said the body was replaced and left it at
      // that, so a caller reading `updated:true` + `fieldsKept` concluded "this was an incremental update" while the CARD's
      // own lines (proofRef / proofState / debateRuling) were gone. A replace is a rewrite of the content, and the receipt
      // must name what the rewrite dropped — the difference between "the row kept its fields" and "the card kept its
      // lines" is the whole defect.
      const bodyLinesOf = (text) => {
        const NL = String.fromCharCode(10)
        const keys = []
        for (const line of String(text === null || text === undefined ? '' : text).split(NL)) {
          const m = /^-\s*([^\s：:]+)\s*[：:]/.exec(line)
          if (m && keys.indexOf(m[1]) < 0) keys.push(m[1])
        }
        return keys
      }
      const bodyLinesBefore = updating ? bodyLinesOf(oldText) : []
      const bodyLinesAfter = bodyLinesOf(bodyText)
      const bodyLinesDropped = bodyLinesBefore.filter((k) => bodyLinesAfter.indexOf(k) < 0)
      const bodyLinesAdded = bodyLinesAfter.filter((k) => bodyLinesBefore.indexOf(k) < 0)
      // ★★ RUN 240 (FEEDBACK63 ①1): the write receipt carried NO writer at all — `fieldsReplaced:["body","by"]` was the
      // only mention that authorship had moved, and a reader had to reverse-engineer the row to learn who wrote it. The
      // three names and their definitions travel on the receipt itself, create and update alike.
      const receipt = { ok: true, deduplicated: false, id, slug, fingerprint: fp, bytes, tier: tierOf(rec, at), retrackedFrom,
        retrackedFromMeans: retrackedFrom === null ? 'this row did not change track' : 'this id was on the "' + retrackedFrom + '" track and MOVED here: the old index row was removed, so one id answers exactly one `list({track})`',
        enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired), at,
        // ★ RUN 241 (FEEDBACK64 M10): whether this write dropped a body line that only repeated the row's own id.
        bodyOwnIdLineDropped,
        bodyOwnIdLineMeans: bodyOwnIdLineDropped
          ? 'this write NAMED a body line `- id：<this row\'s own id>`; the id is the ROW itself, not a field of its body, so the line was dropped before the body was stored (it carried no information the row does not already have, and counting it as an added body line would have said the caller added something)'
          : 'no body line named this row\'s own id, so that rule dropped nothing here - reported as false rather than omitted, so "the rule did not fire" and "the rule was not implemented" do not look the same (RUN 242 / FEEDBACK65 1.6)',
        ...identityEcho(mergedOwner, mergedBy),
        // ★ TB-2691 / F75-11: the write receipt names WHICH KIND OF ACT this was, so the same fact is readable at the
        // moment of writing and not only afterwards on the row.
        writtenFrom: mergedWrittenFrom,
        writtenFromMeans: WRITTEN_FROM_MEANS,
        // ★ TB-2700: the write-admission declaration and WHO made it travel on the receipt; the flag is consumed by the
        // gate and never stored, so a reader asks the receipt, never the row.
        finalAck: admitted,
        finalAckSource: admissionSource,
        finalAckBy: mergedBy,
        finalAckMeans: 'finalAck:true means the CALLER declared this write final at the gate (a write admission, not a stored state); finalAckSource names where the declaration came from (caller / rehydrate / reindex-adopt / final-ack when both words were named / legacy-settled = the deprecated alias for the old settled:true word, accepted for compatibility, to be removed after callers migrate), finalAckBy names who declared it',
      }
      if (!updating) return Object.assign(receipt, { updated: false })
      const out = Object.assign(receipt, {
        updated: true, rev: rec.rev, versionsCount: rec.versions.length,
        fieldsKept, fieldsReplaced, bodyModeUsed, bodyModeMeans,
        // ★ RUN 238: what the rewrite did to the CARD's own lines (empty on create, on `kept`, and on an append).
        bodyLinesDropped, bodyLinesAdded,
        bodyLinesMeans: bodyModeUsed !== 'replace'
          ? 'the body was not replaced by this write, so no card line could be dropped by it'
          : (bodyLinesDropped.length === 0
            ? 'the body was REPLACED and no line the card carried before is missing from the new body: the rewrite was a change of text, not a loss of fields'
            : 'the body was REPLACED and these card lines did NOT survive it: ' + bodyLinesDropped.join(', ')
              + ' — the previous body is in records.history, and a card that must keep a line has to be MERGED into (pass bodyMode:"append", or write through a tool that edits one line) rather than replaced'),
      })
      if (titleIsOwnId) out.fieldsKeptWhy = { title: 'the supplied title was this row\'s own id (' + updating.id + ') — an id is not a name, so the row kept its title' }
      // ★ RUN 238 / FEEDBACK61 E: two kernels each hold their own projection, so `rev` is comparable only WITHIN one
      // kernel. The receipt says where the number came from instead of letting a reader conclude that one of the two
      // readings is stale.
      out.revSource = 'this-kernel'
      out.revMeans = 'rev counts the writes THIS kernel has folded into this row; another kernel over the same workspace keeps its own projection, so two live readings can differ by a version without either being wrong — compare `fingerprint`/`updatedAt` across kernels, not `rev`'
      return out
    },

    /** READ a record (head + shaped body). The fingerprint is RECOMPUTED and compared (07 §4.2 spirit). */
    get({ id, includeBody = true } = {}) {
      synchronize('get')   // ★ ROUND 36: a row another kernel wrote after our one-shot hydrate lives in the fold
      const rec = records.get(id)
      if (!rec) throw deny('VMU_NO_SUCH_OBJECT', 'unknown record: ' + String(id), 'known ids: ' + (order.join(', ') || '(none)'), [], 'get')
      const enforced = []
      const fired = []
      const at = now()
      const out = view(rec, { withBody: includeBody, at, count: false })
      const head = rec.bytes <= expandThreshold
      mark(enforced, K.expandThreshold)
      if (!head) mark(fired, K.expandThreshold)
      mark(enforced, K.fingerprintPolicy)
      const recomputed = fingerprintOf(rec)
      const fingerprintOk = recomputed === rec.fingerprint
      if (!fingerprintOk) mark(fired, K.fingerprintPolicy)
      if (includeBody && rec.bytes > bodyCapBytes) mark(enforced, K.bodyCapBytes)
      if (includeBody && chunkedReturn && rec.bytes > chunkThreshold) markAll(enforced, [K.chunkedReturn, K.chunkThreshold, K.chunkBytes])
      if (headFields.some((f) => !(f in out))) mark(enforced, K.headFields)
      // ★★ RUN 240: `expand`/`get` is the read face where run 63 saw `owner:"r-1", writer:"r-1"` after r-acad had
      // rewritten the card — the row was right and the reading had no word for the writer. The three names, their
      // definitions, and the writer itself now travel with every read.
      return Object.assign({ ok: true, expanded: !head, mode: includeBody ? out.bodyMode : 'head', fingerprintOk, fingerprintRecomputed: recomputed, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired), at }, out,
        { ownerMeans: THREE_NAMES_MEANS.owner, writerMeans: THREE_NAMES_MEANS.writer, byMeans: THREE_NAMES_MEANS.by, threeNames: THREE_NAMES_MEANS.threeNames })
    },

    /** READ a track's HEAD LIST — the default information channel (07 §4.4; `pointerPropagation` can mute it). */
    list({ track = null, limit = null, fields = null, by = null, since = null, until = null, external = null, externalSource = null, kind = null, includeUntracked = false, withWriter = true } = {}) {
      // RUN 243 (FEEDBACK65 1.8, MEASURED): a receipt told the reader to "read the records written by `by` between
      // `from` and `to`" - and this list had no such filter, so the hint pointed at a wall that did not exist (the
      // same defect class as RUN 165's quota refusal (which named two repair verbs no face had) and RUN 176's prune
      // track). A WRITER filter and a time window are the two facts that question needs; both are applied BEFORE the
      // page cap so `available` counts the set the question covers (RUN 164b: a filter the caller passed must be
      // APPLIED, and `total` is the size of the filtered set, never the page size).
      synchronize('list')   // ★ ROUND 36: the head list is the DEFAULT channel, so it must carry the whole root, not one instance
      const enforced = [K.tracks, K.headSort, K.headListAt, K.pointerPropagation, K.headFields]
      const fired = []
      const at = now()
      // ★ TB-2691 / F75-11: provenance is on by default on BOTH read faces (`writtenFrom` per row); `withWriter:false`
      // omits it and the receipt carries `writtenFromOmitted:true`, so the omission is itself answered.
      const withWriterOn = withWriter !== false
      if (track !== null && !liveTracks().includes(track)) {
        mark(fired, K.tracks)
        throw deny('VMU_INVALID_ARGUMENT', 'unknown record track: ' + String(track), 'vmu.records.tracks declares the tracks: ' + tracks.join(', '), [K.tracks], 'list')
      }
      if (fields !== null) {
        // headFields may TRIM optional fields; the core head fields are immutable (docs/07 §12).
        const missing = CORE_HEAD_FIELDS.filter((f) => !fields.includes(f))
        if (missing.length) {
          mark(fired, K.headFields)
          throw deny('VMU_HEAD_FIELD_IMMUTABLE', 'core head fields cannot be trimmed: ' + missing.join(', '),
            'vmu.records.headFields may only add/remove OPTIONAL fields; core: ' + CORE_HEAD_FIELDS.join(', '), [K.tracks, K.headFields], 'list')
        }
      }
      const chosen = fields === null ? headFields.slice() : fields.slice()
      const trimmed = headFields.filter((f) => !chosen.includes(f))
      if (trimmed.length) mark(fired, K.headFields)
      // ★ Deduped on read too, so an index written by the OLD code (which could hold a duplicate per collision) heals.
      const ids = [...new Set(track === null ? order.slice() : trackList(track).slice())]
      // ★★ RUN 174 (run 19 F3): the READ repairs the index it found broken. An id sitting in a track list while its own
      // record says another track is not a row of this track — including it inflated `available`, made `prune` (which walks
      // `list({track})`) move a row of a DIFFERENT track, and made the durable snapshot write the row twice. Skip it, drop
      // the stale index row, and count the repair (`indexHealed`), so a contaminated fold heals on first read instead of
      // being copied forward.
      if (track !== null) {
        const before = ids.length
        const arr = trackList(track)
        for (let i = ids.length - 1; i >= 0; i -= 1) {
          const rec = records.get(ids[i])
          if (rec && rec.track !== track) {
            ids.splice(i, 1)
            const at2 = arr.indexOf(rec.id); if (at2 >= 0) arr.splice(at2, 1)
            counters.indexHealed += 1
          }
        }
        void before
      }
      // ★ RUN 259 / P1-3: the index ids are the FIRST count source. Rows the index names but this kernel cannot
      // produce are NAMED (`indexMissing` / `indexNonLive`) instead of disappearing in a `.filter` - that silent drop
      // used to make the identity's two sides the same arithmetic.
      const indexCounted = ids.length
      const indexMissingIds = []
      const indexNonLiveIds = []
      let live = []
      for (const i of ids) {
        const rec = records.get(i)
        if (!rec) { indexMissingIds.push(String(i)); continue }
        if (rec.state !== 'live') { indexNonLiveIds.push(String(i)); continue }
        live.push(rec)
      }
      // by/since/until: the reader's question ("what did THIS seat write in THAT window") is answered here, not by
      // paging a whole track and eyeballing the by column.
      const msOfArg = (v) => {
        if (v === null || v === undefined || v === '') return null
        if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
        const parsed = Date.parse(String(v))
        return Number.isFinite(parsed) ? parsed : NaN
      }
      const byArg = (typeof by === 'string' && by.trim() !== '') ? by.trim() : null
      const sinceMs = msOfArg(since)
      const untilMs = msOfArg(until)
      if (Number.isNaN(sinceMs)) {
        throw deny('VMU_INVALID_ARGUMENT', 'since is not a time: ' + String(since),
          'pass the ISO stamp exactly as a receipt prints it (for example writesWindow.from) or epoch milliseconds', [K.headSort], 'list')
      }
      if (Number.isNaN(untilMs)) {
        throw deny('VMU_INVALID_ARGUMENT', 'until is not a time: ' + String(until),
          'pass the ISO stamp exactly as a receipt prints it (for example writesWindow.to) or epoch milliseconds', [K.headSort], 'list')
      }
      // ★★★ RUN 254 / P0-2 (L1): A FILTER MUST NEVER DROP A LEGAL ROW IN SILENCE. Before this, `by` compared one
      // spelling of the writer (`r.by`) and `since`/`until` did `Number(r.updatedAt) >= since` - a row whose time was an
      // ISO string became NaN and fell out with no reading at all, which is how a real row answered `total:0` while the
      // same row was visible in an unfiltered list. Every row a filter DROPS for a shape reason is now NAMED in
      // `excluded`, so "no rows matched" and "rows were thrown away because I could not read them" are different answers.
      const excluded = { shapeMismatch: 0, noWriter: [], timeUnknown: [], untracked: 0, untrackedIds: [] }
      // ★ RUN 259 / P1-3: rows that were READABLE but did not answer this question (another writer, outside the
      // time window, another kind) are a legitimate non-answer, not a loss - but for the identity to be checkable
      // they must be counted somewhere, or "asked a narrower question" and "quietly dropped a row" look identical.
      let questionDropped = 0
      // ★ RUN 255 / TB-2606-A (FEEDBACK74 #7): the ids behind `shapeMismatch`, filled by the SAME three drop branches that
      // increment the count, so the count and the list cannot disagree (see excludedMeansOf).
      const shapeMismatchIds = []
      if (byArg !== null) {
        const keptByWriter = []
        for (const r of live) {
          const w = writerOf(r)
          if (w.writer === null) { excluded.shapeMismatch += 1; shapeMismatchIds.push(String(r.id)); excluded.noWriter.push(String(r.id)); continue }
          if (w.writer === byArg) keptByWriter.push(r)
          else questionDropped += 1
        }
        live = keptByWriter
      }
      if (sinceMs !== null) {
        live = live.filter((r) => {
          const t = updatedMsOf(r)
          if (t === null) { excluded.shapeMismatch += 1; shapeMismatchIds.push(String(r.id)); excluded.timeUnknown.push(String(r.id)); return false }
          if (t >= sinceMs) return true
          questionDropped += 1
          return false
        })
      }
      if (untilMs !== null) {
        live = live.filter((r) => {
          const t = updatedMsOf(r)
          if (t === null) { excluded.shapeMismatch += 1; shapeMismatchIds.push(String(r.id)); excluded.timeUnknown.push(String(r.id)); return false }
          if (t <= untilMs) return true
          questionDropped += 1
          return false
        })
      }
      // The symmetric block: the three original keys keep their names/meanings, and the counts/ids that complete the
      // symmetry are attached beside them (one place, so both return branches below carry the same shape).
      excluded.shapeMismatchIds = shapeMismatchIds.slice()
      excluded.noWriterCount = excluded.noWriter.length
      excluded.timeUnknownCount = excluded.timeUnknown.length
      const sinceIso = sinceMs === null ? null : new Date(sinceMs).toISOString()
      const untilIso = untilMs === null ? null : new Date(untilMs).toISOString()
      const noFilter = byArg === null && sinceMs === null && untilMs === null
      // ★★★ RUN 256 / TB-2617 (P0-3): ONE FACE, ONE ARITHMETIC SITE.
      // The tool face used to read the ledger here and the pack library in `host.js`, then compute its own
      // `excluded`/`total` from only one side: the same query answered "1 row was dropped" from the ledger and
      // "nothing was dropped" from the tool. The merge, the filters, the exclusion naming, the page cap and the
      // identity are now computed HERE, once. `external` rows are another store's rows (the pack library heads);
      // the caller does not filter them and never re-counts them.
      const kindArg = (typeof kind === 'string' && kind.trim() !== '') ? kind.trim() : null
      const externalRows = Array.isArray(external) ? external : []
      const externalLabel = externalSource === null || externalSource === undefined ? null : String(externalSource)
      const untrackedIds = []
      const seenAll = new Set(live.map((r) => String(r && r.id)))
      const externalKept = []
      let externalCounted = 0
      let mergeDuplicates = 0
      for (const r of externalRows) {
        if (!r || typeof r !== 'object') continue
        externalCounted += 1
        const rid = String(r.id === undefined || r.id === null ? '(no id)' : r.id)
        if (seenAll.has(rid)) { mergeDuplicates += 1; continue }
        seenAll.add(rid)
        // A row with no `track` cannot answer a track question; it is named as `untracked` in the bare-list road,
        // and for an explicit track query it is simply not part of that store's answer.
        if (track !== null) { questionDropped += 1; continue }
        const w = writerOf(r)
        if (byArg !== null) {
          if (w.writer === null) { excluded.shapeMismatch += 1; shapeMismatchIds.push(rid); excluded.noWriter.push(rid); continue }
          if (w.writer !== byArg) { questionDropped += 1; continue }
        }
        if (sinceMs !== null || untilMs !== null) {
          const t = updatedMsOf(r)
          if (t === null) { excluded.shapeMismatch += 1; shapeMismatchIds.push(rid); excluded.timeUnknown.push(rid); continue }
          if (sinceMs !== null && t < sinceMs) { questionDropped += 1; continue }
          if (untilMs !== null && t > untilMs) { questionDropped += 1; continue }
        }
        // An external row is another store's projection (a pack library head): it has no `tags`/`rev`/`state`
        // fields. Normalise the SHAPE here once, so `view()` does not have to know which store a row came from.
        const normExternal = Object.assign({ tags: [] }, r, { writer: w.writer })
        // A library head's `writerSource` is the OLD published meaning ("which field answered": by/writer/owner) and is
        // kept verbatim here — TB-2691 does NOT redefine it. The row-level `writtenFrom` (provenance of the act) is
        // supplied by the decoration below, so the two facts never share one name.
        externalKept.push(normExternal)
      }
      let merged = live.concat(externalKept)
      if (kindArg !== null) {
        const beforeKind = merged.length
        merged = merged.filter((r) => r && typeof r.kind === 'string' && r.kind === kindArg)
        questionDropped += beforeKind - merged.length
      }
      const includeUntrackedArg = includeUntracked === true
      const untrackedScope = (byArg !== null || sinceMs !== null || untilMs !== null || kindArg !== null || track !== null) ? 'query' : 'bare-list'
      if (untrackedScope === 'bare-list' && !includeUntrackedArg) {
        const keptByTrack = []
        for (const r of merged) {
          const hasTrack = r && typeof r.track === 'string' && r.track.trim() !== ''
          if (hasTrack) { keptByTrack.push(r); continue }
          excluded.untracked += 1
          untrackedIds.push(String((r && r.id) || '(no id)'))
        }
        merged = keptByTrack
      }
      const externalKeptIds = new Set(externalKept.map((r) => String(r && r.id)))
      // RUN 164 pins that the receipt counts each SOURCE separately: a library head that the bare-list road
      // excluded as untracked was still READ (that is why it can be named), so it counts in `library`.
      const rowsFromLibrary = externalKept.length
      const rowsFromRecords = merged.filter((r) => !externalKeptIds.has(String(r && r.id))).length
      excluded.shapeMismatchIds = shapeMismatchIds.slice()
      excluded.noWriterCount = excluded.noWriter.length
      excluded.timeUnknownCount = excluded.timeUnknown.length
      excluded.untrackedIds = untrackedIds.slice()
      excluded.untrackedScope = untrackedScope
      excluded.untrackedScopeMeans = 'which untracked road this page took: "bare-list" = the call asked no row-selecting question (a stocktake), so rows whose `track` is undefined are excluded by default and counted in `untracked`/`untrackedIds` (`includeUntracked:true` pages them too); "query" = the call asked a writer/time/kind/track question, so matching library heads are part of the answer and `untracked` stays 0'
      live = merged
      // ★★★ RUN 259 / P1-3: THE IDENTITY NOW HAS TWO INDEPENDENT SOURCES. `universeCounted` is how many rows this
      // query STARTED with across both stores: every index id the track names, plus every external row handed in. The
      // page arithmetic below is the other side. Before this, `totalUniverse` was BUILT from `live.length` and `holds`
      // compared against that same number - a tautology no input could falsify. Rows the index names but this kernel
      // cannot produce are now in `indexMissing`/`indexNonLive`; rows a filter legitimately declines are in
      // `questionDropped`; so a vanished row shows up as `holds:false` instead of hiding inside a subtraction.
      const universeCounted = indexCounted + externalCounted
      // ★★★ RUN 259 / P1-4: ORDER BY INSTANT, AND NAME WHAT CANNOT BE ORDERED. The old comparator subtracted raw
      // `createdAt`/`updatedAt` values, so ISO strings produced NaN and Array#sort left the input order - a silent
      // misorder while the receipt claimed `sort: "updatedAt"`. A row whose stamp is missing/unreadable is pushed to
      // the BACK and named in `orderUnknown` (never treated as the epoch and sorted first).
      const orderUnknown = []
      let ordered = live
      if (headSort === 'title') {
        ordered = live.slice().sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)))
      } else {
        const field = headSort === 'createdAt' ? 'createdAt' : 'updatedAt'
        const known = []
        const unknownRows = []
        for (const r of live) {
          const raw = r ? r[field] : undefined
          const ms = timeMsOf(raw)
          if (ms === null) {
            unknownRows.push(r)
            orderUnknown.push({ id: String(r && r.id), field, value: raw === undefined ? null : raw, why: raw === undefined || raw === null || raw === '' ? 'missing' : 'unreadable' })
            continue
          }
          known.push(r)
        }
        known.sort((a, b) => (timeMsOf(a[field]) - timeMsOf(b[field])) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)))
        unknownRows.sort((a, b) => (String(a && a.id) < String(b && b.id) ? -1 : 1))
        ordered = known.concat(unknownRows)
      }
      live = ordered
      const filteredTotal = live.length
      const totalUniverse = filteredTotal + excluded.shapeMismatch + excluded.untracked
      // ONE IDENTITY, CHECKED: page + pageDropped + excluded(shapeMismatch + untracked) + the rows the question
      // declined + the rows the index could not produce + merged duplicates === the independently counted universe.
      // `noWriter`/`timeUnknown` are SUBSETS of `shapeMismatch`, so they are never summed again.
      const identityOf = (page, pageDropped, mutedDropped, universe) => {
        const pageExcluded = excluded.shapeMismatch + excluded.untracked
        const check = identityHoldsOf({ page, pageDropped, excluded: pageExcluded, mutedDropped, questionDropped, indexMissing: indexMissingIds.length, indexNonLive: indexNonLiveIds.length, mergeDuplicates, universeCounted })
        return { page, pageDropped, excluded: pageExcluded, mutedDropped, questionDropped, questionDroppedMeans: 'rows this store could read but that did not answer the question (another writer, outside the time window, another kind, a track query meeting an untracked external row); a narrower question is a legitimate non-answer, not a loss',
          indexMissing: indexMissingIds.length, indexMissingIds: indexMissingIds.slice(), indexNonLive: indexNonLiveIds.length, indexNonLiveIds: indexNonLiveIds.slice(), mergeDuplicates, totalUniverse: universe,
          accounted: check.accounted, universeCounted: check.universeCounted, orderUnknown: orderUnknown.slice(), holds: check.holds,
          means: 'accounted (page + pageDropped + excluded + mutedDropped + questionDropped + indexMissing + indexNonLive + mergeDuplicates) === universeCounted (index ids traversed + external rows handed in): two paths, so `holds` can be FALSE when a row vanishes unnamed; noWriter/timeUnknown are subsets of shapeMismatch and are never added twice; orderUnknown names rows that could not be ordered and they are placed last' }
      }
      // ★★★ RUN 254 / P1-2 (L2): a `limit` the caller PASSED is answered or refused - never silently replaced by the
      // default page size. `limit:0` keeps its documented meaning (every row, no page cap); anything that is not a
      // non-negative integer is a refusal that names the value, so a caller cannot believe it asked for a page and be
      // handed another one. When no limit is passed, the receipt says which default was used (`limitUsed`/`limitSource`).
      let limitUsed = headListAt
      let limitSource = 'default (vmu.records.headListAt)'
      if (limit !== null && limit !== undefined) {
        if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0) {
          mark(fired, K.headListAt)
          throw deny('VMU_INVALID_ARGUMENT', 'limit is not a usable page size: ' + JSON.stringify(limit),
            'pass a non-negative integer (0 = every row, 1..n = page size), or omit `limit` to use vmu.records.headListAt (' + headListAt + ')', [K.headListAt], 'list')
        }
        limitUsed = limit
        limitSource = limit === 0 ? 'caller (0 = every row)' : 'caller'
      }
      const capWanted = limitUsed
      if (!pointerPropagation) {
        mark(fired, K.pointerPropagation)
        // RUN 256 / TB-2617 | identity must HOLD on the muted road too: the rows the query WOULD have answered are
        // not a page cap (`pageDropped`) and not a shape exclusion - they are named `mutedDropped`, one field, so
        // `page + pageDropped + shapeMismatch + untracked + mutedDropped === totalUniverse` stays true even when the
        // mute holds back every row. `totalUniverse` is the DENOMINATOR of the question and is never muted.
        const mutedDropped = live.length
        const mutedUniverse = live.length + excluded.shapeMismatch + excluded.untracked
        return { ok: true, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired), at,
          items: [], heads: [], count: 0, available: live.length, total: live.length, totalUniverse: mutedUniverse, mutedDropped,
          identity: identityOf(0, 0, mutedDropped, mutedUniverse),
          orderUnknown, orderUnknownMeans: 'rows this page could not place in time order because their stamp is missing or unreadable; they are named here and placed LAST, never silently treated as the epoch',
          dropped: live.length, truncated: live.length > 0, suppressed: true, excluded, excludedMeans: excludedMeansOf(excluded), limitUsed, limitSource,
          withWriter: withWriterOn,
          writtenFromOmitted: !withWriterOn,
          withWriterMeans: withWriterOn
            ? 'no rows are returned on this muted road, so `writtenFrom` has nothing to decorate; the fact is on by default (withWriter:true) as on the normal road'
            : 'the caller asked withWriter:false and the head list is muted: no rows and no writtenFrom; `writtenFromOmitted:true` says why the field is absent',
          limitMeans: 'this page is MUTED (vmu.records.pointerPropagation=false): no rows are returned, so the page size did not apply; `available` counts the set the filter covers', note: 'vmu.records.pointerPropagation=false: the head list is muted (zero injection, the caller falls back verbatim)',
          ownerMeans: THREE_NAMES_MEANS.owner, writerMeans: THREE_NAMES_MEANS.writer, byMeans: THREE_NAMES_MEANS.by, threeNames: THREE_NAMES_MEANS.threeNames }
      }
      const cap = capWanted === 0 ? live.length : capWanted
      const kept = live.slice(0, cap)
      const dropped = live.length - kept.length
      if (dropped > 0) mark(fired, K.headListAt)
      // ★ TB-2691 / F75-11: provenance is decorated AFTER the projection — `projectView` keeps only the configured
      // head fields, so injecting it earlier would be silently dropped (the very defect class: a fact measured and
      // then not said). Every row says which KIND of act wrote it; `withWriter:false` says nothing per row and names
      // the omission on the receipt instead.
      const items = kept.map((r) => {
        const projected = projectView(r, chosen, at)
        if (!withWriterOn) return projected
        return Object.assign(projected, {
          writtenFrom: writtenFromOf(r),
          writtenFromMeans: WRITTEN_FROM_MEANS,
        })
      })
      // ★★ RUN 240: the head row names BOTH facts now — `owner` (whose row) and `writer` (who wrote this revision) —
      // and the list result carries the same three-name glossary the write receipt does, so `list` and `expand` teach
      // the same vocabulary.
      // ★ RUN 254 cold-T1 fix (audit-receipt-fields): the enforcement triplet stays in the FIRST lines of the receipt.
      // It used to sit at the very end of this object; the P0-2/P1-2 readings inserted in front of it pushed it out of
      // the audit's window, so the gate could no longer SEE that this receipt carries `enforced` (the fact was there,
      // the reading was not readable). Position in the object is not the semantics — the window is.
      return { ok: true, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired), at,
        items, heads: items.map((x) => x.id), count: items.length, available: live.length, total: live.length,
        // ★★★ RUN 256 / TB-2617: the universe this page covers, plus the RUN 259 identity that CAN be falsified:
        // one side is the page arithmetic, the other is an independent traversal of the index ids + external rows.
        totalUniverse, mutedDropped: 0,
        identity: identityOf(items.length, dropped, 0, totalUniverse),
        orderUnknown, orderUnknownMeans: 'rows this page could not place in time order because their stamp is missing or unreadable; they are named here and placed LAST, never silently treated as the epoch; sortNamesBy is the field the ordering used',
        rowsFrom: { records: rowsFromRecords, library: rowsFromLibrary }, externalSource: externalLabel, externalRows: externalRows.length,
        dropped, truncated: dropped > 0, suppressed: false, fields: chosen, sort: headSort,
        filter: { by: byArg, since: sinceIso, until: untilIso },
        // ★★★ RUN 254 (P0-2 L1 + P1-2 L2): the page and the filter now answer their own questions. `excluded` names the
        // rows a filter dropped for a shape reason (never a silent zero), and `limitUsed`/`limitSource` say which page
        // size actually applied (a caller can no longer pass a limit and be handed the default without being told).
        excluded, excludedMeans: excludedMeansOf(excluded),
        // ★ TB-2691 / F75-11: the by-default fact is stated on the receipt too, and an omission is ANSWERED rather
        // than silent (the same rule as `limitUsed`/`excluded`).
        withWriter: withWriterOn,
        withWriterMeans: withWriterOn
          ? 'every row carries `writtenFrom`: own-turn = the seat named on the row ran this write in its own turn; relayed = the row names a seat but the call ran from the office or another seat; unknown = neither could be established. It is deliberately NOT called writerSource, which keeps its old meaning on the library head (which FIELD answered: by/writer/owner)'
          : 'the caller asked withWriter:false, so `writtenFrom` is omitted from every row on purpose — this receipt carries `writtenFromOmitted:true` instead of leaving a reader to guess that the rows are old or that the field was dropped',
        writtenFromOmitted: !withWriterOn,
        limitUsed, limitSource,
        limitMeans: limitSource === 'caller'
          ? 'the page size is the one this call asked for (' + limitUsed + '); `dropped` counts the rows the page cap held back'
          : (limitSource === 'caller (0 = every row)'
            ? 'the caller asked for limit:0, which means EVERY row: no page cap was applied'
            : 'no `limit` was passed, so vmu.records.headListAt (' + headListAt + ') decided the page size; pass a non-negative integer (0 = every row) to choose it yourself'),
        filterMeans: noFilter
          ? 'no writer/time filter was given: these are the live rows of the whole ' + (track === null ? 'ledger' : 'track ' + JSON.stringify(track))
          : 'these rows are the ones whose OWN writer is ' + (byArg === null ? 'any seat' : JSON.stringify(byArg))
            + ' and whose last write landed in [' + (sinceIso === null ? 'the beginning' : sinceIso) + ', ' + (untilIso === null ? 'now' : untilIso) + '] - filtered BEFORE the page cap, so available counts the set this question covers', note: 'the head list is the default information channel (docs/07 §4.4); truncation is COUNTED, never silent',
        ownerMeans: THREE_NAMES_MEANS.owner, writerMeans: THREE_NAMES_MEANS.writer, byMeans: THREE_NAMES_MEANS.by, threeNames: THREE_NAMES_MEANS.threeNames }
    },

    /**
     * ★★ RUN 166 (FEEDBACK14 F1/F3/F4): THE TRASH AS ROWS THE FOLD CAN CARRY. A trash used to live only in the instance
     * that performed it (`records.list` returns live rows, so the durable snapshot never mentioned the trashed ones). One
     * `state.json` is mounted by SEVERAL kernels (docs/02), so that made the trash instance-local: the office pruned the
     * paper track to 20 and a member kernel still answered `200/200` with `VMU_QUOTA_EXCEEDED`, and the names of the rows
     * the office had just trashed stayed occupied in the member's world (a minted `paper-p1` landed on an old paper, a
     * minted `m33` resolved to an archived meeting). These rows travel with the snapshot: `state:'trashed'` plus
     * `trashedAt`/`purgeAt`, so every kernel learns the same trash on its next read. They are NOT live records: a reader
     * that wants count/佔用 asks `list()`/`status()`, and an adopter never turns a tombstone into a live row.
     */
    trashRows({ track = null } = {}) {
      synchronize('trash-rows')
      const out = []
      for (const id of [...new Set(order)]) {
        const rec = records.get(id)
        if (!rec || rec.state !== 'trashed') continue
        if (track !== null && rec.track !== track) continue
        out.push({ id: rec.id, track: rec.track, kind: rec.kind, title: rec.title, body: rec.body, tags: rec.tags.slice(),
          // ★★ RUN 240: a tombstone carries the SAME two facts as a live row (by = writer, owner = whose row), so a
          // restore cannot silently promote the writer to owner.
          by: rec.by, owner: rec.owner === undefined || rec.owner === null ? rec.by : rec.owner, state: 'trashed', trashedAt: rec.trashedAt, purgeAt: rec.purgeAt })
      }
      return out
    },

    /** Supersede (a new revision). A reason is mandatory; the versioning knobs shape what is stored. */
    supersede({ id, reason = null, by = null, title = null, body = null, tags = null } = {}) {
      synchronize('supersede')   // ★ ROUND 36: same reason as put — this one is snapshotted too, so its view must be the root's
      const rec = records.get(id)
      if (!rec) throw deny('VMU_NO_SUCH_OBJECT', 'unknown record: ' + String(id), 'known ids: ' + (order.join(', ') || '(none)'), [K.historyStoreMode, K.historyDepth], 'supersede')
      const enforced = [K.historyStoreMode, K.historyDepth]
      const fired = []
      if (typeof reason !== 'string' || !reason.trim()) throw deny('VMU_REASON_REQUIRED', 'superseding ' + rec.id + ' requires a reason', 'the reason is part of the record history (07 §4)', [K.historyStoreMode, K.historyDepth], 'supersede')
      const changed = {}
      if (title !== null && String(title) !== rec.title) changed.title = [rec.title, String(title)]
      if (body !== null && String(body) !== rec.body) changed.body = [rec.bytes, bytesOf(body)]
      if (tags !== null) changed.tags = [rec.tags.slice(), listOf(tags, [])]
      pushVersion(rec, { by, reason, changed })
      if (Object.keys(changed).length === 0) mark(fired, K.historyStoreMode)
      if (title !== null) rec.title = String(title)
      if (body !== null) { rec.body = String(body); rec.bytes = bytesOf(body) }
      if (tags !== null) rec.tags = listOf(tags, rec.tags)
      // ★★ RUN 240 (FEEDBACK63 ①1/①10): a supersede that NAMES a writer moves the writer, exactly like a put that names
      // `by`. Before this the version row recorded the author and the row itself kept the old one, so the next `expand`
      // named the previous writer as the author of THIS revision — the write said who and the read disagreed.
      if (by !== null && by !== undefined && String(by).trim() !== '') rec.by = String(by)
      rec.rev += 1
      rec.updatedAt = now()
      const fpIndex = byFingerprint.get(rec.track) || new Map()
      byFingerprint.set(rec.track, fpIndex)
      fpIndex.delete(rec.fingerprint)
      rec.fingerprint = fingerprintOf(rec)
      fpIndex.set(rec.fingerprint, rec.id)
      noteLocalWrite(rec)
      record_({ type: 'records/superseded', id: rec.id, rev: rec.rev, why: reason, mode: historyStoreMode })
      fire('records/superseded', { id: rec.id, rev: rec.rev, mode: historyStoreMode })
      return { ok: true, id: rec.id, rev: rec.rev, mode: historyStoreMode, changedKeys: Object.keys(changed), fingerprint: rec.fingerprint, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired),
        ...identityEcho(rec.owner === undefined || rec.owner === null ? (rec.by === undefined ? null : rec.by) : rec.owner, rec.by === undefined ? null : rec.by) }
    },

    /** READ the version history (bounded; drops are COUNTED). */
    history({ id = null, limit = DEFAULT_LIST_CAP } = {}) {
      synchronize('history')   // ★ ROUND 36: history is a read of the same rows (a pulled row has a version trail too)
      const enforced = [K.historyStoreMode, K.historyDepth]
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const all = []
      for (const rid of (id === null ? order : [id])) {
        const rec = records.get(rid)
        if (!rec) continue
        for (const v of rec.versions) all.push({ id: rid, rev: v.rev, at: v.at, by: v.by, reason: v.reason, mode: v.mode || 'full', changed: v.changed || null, snapshot: v.snapshot || null, tier: tierOf(rec) })
      }
      const kept = all.slice(Math.max(0, all.length - cap))
      return { ok: true, versions: kept, count: kept.length, available: all.length, dropped: all.length - kept.length, truncated: all.length > kept.length, retainedDepth: historyDepth, storeMode: historyStoreMode, ringDropped: historyDropped.n, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: [] }
    },

    /** Move a record to the trash. A permanent record CANNOT be removed (`VMU_RETENTION_CONFLICT`, 20 §6). */
    remove({ id, reason = null, by = null } = {}) {
      const rec = records.get(id)
      if (!rec) throw deny('VMU_NO_SUCH_OBJECT', 'unknown record: ' + String(id), 'known ids: ' + (order.join(', ') || '(none)'), [K.permanentMarker, K.trashRetainDays], 'remove')
      const enforced = [K.permanentMarker, K.trashRetainDays]
      const fired = []
      if (isPermanent(rec)) {
        mark(fired, K.permanentMarker)
        throw deny('VMU_RETENTION_CONFLICT', 'record ' + rec.id + ' is marked "' + permanentMarker + '" and cannot be removed',
          'permanent records are protected (docs/20 §6) — clear the marker deliberately first', [K.permanentMarker, K.trashRetainDays], 'remove')
      }
      if (rec.state === 'trashed') return { ok: true, id: rec.id, already: true, state: 'trashed', purgeAt: rec.purgeAt, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired) }
      if (typeof by !== 'string' || !by.trim()) throw deny('VMU_INVALID_ARGUMENT', 'removing ' + rec.id + ' needs a non-empty `by`', 'a removal is audited: who removed it and why it is recoverable', [K.permanentMarker, K.trashRetainDays], 'remove')
      rec.state = 'trashed'
      rec.trashedAt = now()
      rec.purgeAt = rec.trashedAt + trashRetainDays * DAY_MS
      rec.restoredAt = null
      counters.trashed += 1
      record_({ type: 'records/trashed', id: rec.id, purgeAt: rec.purgeAt, why: reason, by })
      fire('records/trashed', { id: rec.id, purgeAt: rec.purgeAt })
      let purged = null
      if (trashAutoPurge) { mark(enforced, K.trashAutoPurge); mark(fired, K.trashAutoPurge); purged = api.purge({}) }
      const autoPurgedCount = purged ? purged.purgedCount : 0
      if (trashCountInQuota) mark(enforced, K.trashCountInQuota)
      return { ok: true, id: rec.id, state: 'trashed', purgeAt: rec.purgeAt, retainDays: trashRetainDays, autoPurged: autoPurgedCount, autoPurgedIds: purged ? purged.purged.map((x) => x.id) : [], enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired) }
    },

    /** Purge expired trash. Expiry uses the injected clock; every purge is COUNTED (`VMU_TRASH_EXPIRED`). */
    purge({ at = null } = {}) {
      const when = at === null ? now() : at
      if (!Number.isFinite(when)) throw deny('VMU_INVALID_ARGUMENT', 'purge `at` must be milliseconds', 'omit it to use the injected clock', [K.trashRetainDays, K.trashCountInQuota], 'purge')
      const enforced = [K.trashRetainDays, K.trashCountInQuota]
      const fired = []
      const purged = []
      for (const id of order.slice()) {
        const rec = records.get(id)
        if (!rec || rec.state !== 'trashed' || rec.purgeAt === null || rec.purgeAt > when) continue
        if (isPermanent(rec)) { mark(fired, K.permanentMarker); mark(enforced, K.permanentMarker); continue }
        records.delete(id)
        const idx = order.indexOf(id); if (idx >= 0) order.splice(idx, 1)
        const t = trackList(rec.track); const ti = t.indexOf(id); if (ti >= 0) t.splice(ti, 1)
        const si = bySlug.get(rec.track); if (si) si.delete(rec.slug)
        const fi = byFingerprint.get(rec.track); if (fi) fi.delete(rec.fingerprint)
        externalRefs.delete(id)
        markAll(purged, [{ id, bytes: rec.bytes, trashedAt: rec.trashedAt, expiredAt: rec.purgeAt }])
        counters.purged += 1
        record_({ type: 'records/purged', id, bytes: rec.bytes, expiredAt: rec.purgeAt })
      }
      if (purged.length) { mark(fired, K.trashRetainDays); fire('records/trash-expired', { ids: purged.map((p) => p.id), retainDays: trashRetainDays }) }
      return { ok: true, at: when, purged, purgedCount: purged.length, retainDays: trashRetainDays, autoPurge: trashAutoPurge, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired), note: purged.length ? 'expired trash was purged (COUNTED, never silent)' : 'nothing was purged' }
    },

    /** Restore a trashed record. */
    restore({ id, by = null } = {}) {
      const rec = records.get(id)
      if (!rec) throw deny('VMU_NO_SUCH_OBJECT', 'unknown record: ' + String(id), 'known ids: ' + (order.join(', ') || '(none)'), [], 'restore')
      if (rec.state !== 'trashed') throw deny('VMU_STATE', 'record ' + rec.id + ' is ' + rec.state + ', not trashed', 'only trashed records can be restored', [], 'restore')
      rec.state = 'live'
      rec.trashedAt = null
      rec.purgeAt = null
      rec.restoredAt = now()
      // ★★ RUN 172 (FEEDBACK17 P2): a row ADOPTED from another kernel's trash carried the synthetic fingerprint
      // `tombstone:<id>` (that is how the adoption knew it held no content). Restoring it left the marker in place, so
      // two kernels disagreed about the same record: the one that owned the content reported the recomputed hash and
      // `fingerprintOk:true`, the one that adopted-and-restored reported `fingerprintOk:false` — and both were reading
      // the same row. A restored row has content again, so its fingerprint must be the content's again.
      if (String(rec.fingerprint || '').startsWith('tombstone:')) rec.fingerprint = fingerprintOf(rec)
      // ★★ RUN 166: A RESTORE HAS TO REJOIN THE INDEXES IT LEFT. `remove` only flips the state, but ADOPTING a trash from
      // the durable fold deletes the `bySlug`/`byFingerprint` entries, and a listing walks `order`/`trackList`. Before
      // this, a restored row was live in the map and absent from every listing: `restore` returned
      // `{ok:true, state:'live'}` while `list` still counted one row — a receipt that described an object no reader could
      // reach. Idempotent by construction (`includes`/`Map.set`), so a double restore is harmless.
      if (!order.includes(rec.id)) order.push(rec.id)
      const trackArr = trackList(rec.track)
      if (!trackArr.includes(rec.id)) trackArr.push(rec.id)
      let slugIdx = bySlug.get(rec.track)
      if (!slugIdx) { slugIdx = new Map(); bySlug.set(rec.track, slugIdx) }
      if (rec.slug) slugIdx.set(rec.slug, rec.id)
      let fpIdx = byFingerprint.get(rec.track)
      if (!fpIdx) { fpIdx = new Map(); byFingerprint.set(rec.track, fpIdx) }
      if (rec.fingerprint) fpIdx.set(rec.fingerprint, rec.id)
      counters.restored += 1
      record_({ type: 'records/restored', id: rec.id, by, restoredAt: rec.restoredAt })
      return { ok: true, id: rec.id, state: 'live', restoredAt: rec.restoredAt, enforced: [], enforcedScope: ENFORCED_SCOPE, fired: [] }
    },

    /**
     * Compaction. retention.keepEvery prunes VERSIONS (keep every Nth); a meeting track keeps every Nth
     * RECORD as the archive (meetingKeepEvery). Permanent records are never pruned and every drop is COUNTED.
     */
    compact({ track = null, keepEvery: keepEveryOverride = null } = {}) {
      const enforced = [K.keepEvery, K.meetingKeepEvery, K.permanentMarker]
      const fired = []
      const targets = track === null ? tracks.slice() : [track]
      const prunedVersions = []
      const archived = []
      for (const t of targets) {
        if (!tracks.includes(t)) throw deny('VMU_INVALID_ARGUMENT', 'unknown record track: ' + String(t), 'vmu.records.tracks declares the tracks: ' + tracks.join(', '), [K.keepEvery, K.meetingKeepEvery, K.permanentMarker], 'compact')
        const isMeeting = isMeetingTrack(t)
        const every = Number.isInteger(keepEveryOverride) && keepEveryOverride >= 0 ? keepEveryOverride : (isMeeting ? meetingKeepEvery : keepEvery)
        if (every <= 1) continue
        if (isMeeting && keepEveryOverride === null) mark(fired, K.meetingKeepEvery)
        else mark(fired, K.keepEvery)
        for (const id of trackList(t).slice()) {
          const rec = records.get(id)
          if (!rec) continue
          if (isPermanent(rec)) { mark(enforced, K.permanentMarker); mark(fired, K.permanentMarker); continue }
          const kept = []
          rec.versions.forEach((v, i) => { if (i % every === 0) kept.push(v); else markAll(prunedVersions, [{ id, track: t, rev: v.rev }]) })
          if (kept.length !== rec.versions.length) { counters.versionsPruned += rec.versions.length - kept.length; rec.versions = kept }
        }
        if (isMeeting) {
          const ids = trackList(t).slice().sort((a, b) => (records.get(a).updatedAt - records.get(b).updatedAt) || (a < b ? -1 : 1))
          ids.forEach((id, index) => {
            const rec = records.get(id)
            if (!rec || rec.state !== 'live') return
            if (isPermanent(rec)) { mark(fired, K.permanentMarker); return }
            if (index % every === 0) return
            markAll(archived, [{ id, track: t, rev: rec.rev, keepEvery: every }])
            records.delete(id)
            const oi = order.indexOf(id); if (oi >= 0) order.splice(oi, 1)
            const ti = trackList(t).indexOf(id); if (ti >= 0) trackList(t).splice(ti, 1)
            const si = bySlug.get(t); if (si) si.delete(rec.slug)
            const fi = byFingerprint.get(t); if (fi) fi.delete(rec.fingerprint)
            counters.compacted += 1
          })
        }
      }
      if (prunedVersions.length || archived.length) {
        fire('records/retention-truncated', { versions: prunedVersions.length, records: archived.length, ids: archived.map((d) => d.id) })
        record_({ type: 'records/compacted', versions: prunedVersions.length, records: archived.length })
      }
      return {
        ok: true, prunedVersions, prunedVersionCount: prunedVersions.length, archived, archivedCount: archived.length,
        keepEvery, meetingKeepEvery, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired),
        note: (prunedVersions.length || archived.length)
          ? 'compaction dropped ' + prunedVersions.length + ' version(s) and ' + archived.length + ' archived record(s) — COUNTED, never silent'
          : 'nothing to compact',
      }
    },

    /** Attach an external reference: the scheme allowlist and existence verification are both knobs. */
    attachExternal({ id, uri, by = null } = {}) {
      const rec = records.get(id)
      if (!rec) throw deny('VMU_NO_SUCH_OBJECT', 'unknown record: ' + String(id), 'known ids: ' + (order.join(', ') || '(none)'), [K.allowedSchemes, K.verifyExists], 'attachExternal')
      const enforced = [K.allowedSchemes, K.verifyExists]
      const fired = []
      const text = String(uri === undefined || uri === null ? '' : uri)
      const scheme = (text.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/) || [])[1]
      if (!scheme) {
        throw deny('VMU_EXTERNAL_QUERY_INVALID', 'the external reference needs a scheme: ' + text, 'e.g. file:///… , http://… — allowed schemes: ' + allowedSchemes.join(', '), [K.allowedSchemes, K.verifyExists], 'attachExternal')
      }
      if (!allowedSchemes.includes(scheme.toLowerCase())) {
        mark(fired, K.allowedSchemes)
        throw deny('VMU_EXTERNAL_DISABLED', 'scheme "' + scheme + '" is not allowed (vmu.records.external.allowedSchemes)',
          'allowed schemes: ' + allowedSchemes.join(', '), [K.allowedSchemes, K.verifyExists], 'attachExternal')
      }
      let verified = null
      if (verifyExists) {
        if (typeof exists === 'function') {
          let present
          try { present = exists(text) === true } catch (e) { bump(unwired, 'external-seam', 1); say({ type: 'records/external-unwired', at: now(), why: String((e && e.message) || e) }); present = null }
          if (present === false) {
            mark(fired, K.verifyExists)
            throw deny('VMU_EXTERNAL_UNAVAILABLE', 'the external reference does not exist: ' + text, 'vmu.records.external.verifyExists=true makes an unverifiable reference an error', [K.allowedSchemes, K.verifyExists], 'attachExternal')
          }
          if (present === true) { verified = true; counters.externalVerified += 1 }
        } else {
          bump(unwired, 'external-seam', 1)
          say({ type: 'records/external-unwired', at: now(), why: 'no exists() seam was injected: verification is NOT possible (verified=null)' })
        }
      } else { mark(fired, K.verifyExists) }
      const list = externalRefs.get(rec.id) || []
      list.push({ uri: text, scheme: scheme.toLowerCase(), verified, at: now(), by: by === null ? null : String(by) })
      externalRefs.set(rec.id, list)
      counters.externalAttached += 1
      record_({ type: 'records/external-attached', id: rec.id, uri: text, verified })
      return { ok: true, id: rec.id, uri: text, scheme: scheme.toLowerCase(), verified, count: list.length, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired), note: verified === null ? 'verification was NOT possible (no exists() seam) — disclosed, not pretended' : 'verified=' + verified }
    },

    /** READ the external references of a record. */
    externals({ id } = {}) {
      synchronize('externals')   // ★ ROUND 36: an external reference is attached to a row, so the row must be findable first
      const rec = records.get(id)
      if (!rec) throw deny('VMU_NO_SUCH_OBJECT', 'unknown record: ' + String(id), 'known ids: ' + (order.join(', ') || '(none)'), [], 'externals')
      const list = (externalRefs.get(rec.id) || []).map((x) => Object.assign({}, x))
      return { ok: true, id: rec.id, refs: list, count: list.length, enforced: [], enforcedScope: ENFORCED_SCOPE, fired: [] }
    },

    /** READ-ONLY self-report: the 24-key partition, the extra wired keys, caps, counters and hot spots. */
    status() {
      // ★★ RUN 171 (FEEDBACK16 F16-4): A COUNT IS AS OLD AS THE LAST FOLD. `prune` in one kernel used to be invisible to
      // another kernel's `status` until some unrelated read happened to pull: run 16 had a member turn read `paper:193`
      // twenty seconds after the office pruned to 151, then 151 later, with nothing in the receipt naming the lag. The
      // read now pulls first (cheap: one already-open fold read, zero writes when nothing changed) and says WHEN it
      // looked, so "this kernel has not folded yet" can never be mistaken for "nothing changed".
      synchronize('status')
      const universe = declaredUniverse()
      const wired = WIRED_KEYS.slice()
      const unwiredKeysList = DECLARED_KEYS.filter((k) => !wired.includes(k))
      const extraWired = EXTRA_WIRED_KEYS.slice()
      return {
        ok: true, apiVersion,
        declaredKeys: DECLARED_KEYS.slice(), declaredCount: DECLARED_KEYS.length,
        wired, wiredCount: wired.length,
        unwiredKeys: unwiredKeysList, unwiredCount: unwiredKeysList.length,
        unwiredReasons: Object.fromEntries(unwiredKeysList.map((k) => [k, UNWIRED_REASONS[k] || '尚未接线（本批未覆盖）'])),
        extraWired, extraWiredCount: extraWired.length,
        partitionOk: wired.length + unwiredKeysList.length === DECLARED_KEYS.length,
        complementOk: wired.every((k) => !unwiredKeysList.includes(k)) && wired.length + unwiredKeysList.length === DECLARED_KEYS.length,
        registry: universe,
        caps: {
          tracks: tracks.slice(), allowedKinds: allowedKinds.slice(), headFields: headFields.slice(), bodyCapBytes, expandThreshold,
          headMaxItems: headMaxItemsNow(), headMaxItemsAtStart,
          headMaxItemsMeans: 'headMaxItems is read at WRITE time (raise it with vibe_v5_set and the NEXT put sees the new number); headMaxItemsAtStart is what this kernel was constructed with, for comparison',
          headListAt, headSort, noticeStyle, chunkedReturn, slugPolicy, slugMaxLength, conflictSuffix,
          keepEvery, meetingKeepEvery, permanentMarker, retentionMaxBytes, tierThreshold, trashRetainDays, trashAutoPurge,
          trashCountInQuota, historyDepth, historyStoreMode, chunkThreshold, chunkBytes, allowedSchemes, verifyExists,
          fingerprintPolicy, requireSettledRecords: requireSettled, pointerPropagation, truncateMode,
        },
        counters: Object.assign({}, counters),
        records: {
          total: records.size,
          live: order.map((id) => records.get(id)).filter((r) => r && r.state === 'live').length,
          trashed: order.map((id) => records.get(id)).filter((r) => r && r.state === 'trashed').length,
          permanent: order.map((id) => records.get(id)).filter((r) => r && isPermanent(r)).length,
          cold: order.map((id) => records.get(id)).filter((r) => r && tierOf(r) === 'cold').length,
          byTrack: Object.fromEntries(tracks.map((t) => [t, liveIds(t).length])),
          // ★★ RUN 170 (FEEDBACK16 F16-3): `prune`'s receipt said "action status counts them under records.trashed"; the
          // per-track trash count had to exist for that sentence to have a referent.
          trashedByTrack: Object.fromEntries(tracks.map((t) => [t, order.map((id) => records.get(id)).filter((r) => r && r.state === 'trashed' && r.track === t).length])),
          bytesByTrack: Object.fromEntries(tracks.map((t) => [t, trackBytes(t)])),
        },
        refusals: objOf(refusals), refusalsTotal: sumOf(refusals),
        // ★★ RUN 175 (run 20 FEEDBACK20 ⑬): see `lastRefusal` above — the most recent refusal BY NAME, so the count can
        // be traced to one act instead of being a number with no referent.
        lastRefusal,
        lastRefusalMeans: lastRefusal === null
          ? 'this instance has refused nothing yet (the refusal counters are empty, so there is no last refusal to name)'
          : 'the MOST RECENT refusal this instance raised: `code` is the named refusal, `at` its instant, `op` the operation that refused (null = an operation the face did not name) and `message` its first 200 characters. Earlier refusals are only counted (see `refusals`), not listed',
        unwired: objOf(unwired), unwiredTotal: sumOf(unwired),
        historyRows: historyRows.length, historyRingDropped: historyDropped.n,
        // ★ ROUND 36: the seam is part of the self-report, so "why did this instance see nothing?" is answerable from
        // status() alone (attached / pulls / pulled / refused + lastWhy), instead of only from a live failure.
        shared: sharedView(),
        // ★★ RUN 171 (FEEDBACK16 F16-4): the moment of the statement. `foldPullAt` is when THIS instance last read the
        // durable fold (null = no store attached, so the counts are only this process's); `viewAt` is when the numbers
        // were computed. Two kernels that disagree should compare these two stamps before suspecting each other.
        asOf: { viewAt: now(), foldPullAt: shared.lastPullAt, foldSyncAt: shared.lastSyncAt, foldStamp: shared.stamp },
        asOfMeans: shared.store
          ? 'status() pulls the durable fold before counting, so a prune or restore another kernel finished is reflected here on the next read; foldPullAt is that read, viewAt is the count. If two kernels report different numbers, compare foldPullAt: an older pull is an older statement, not a contradiction'
          : 'this assembly has no durable store: there is no fold to pull, so foldPullAt is null and the counts describe this process alone',
        at: now(),
        note: 'every key in `wired` changes an observable result (asserted by tests/vmu-records.test.mjs); `enforced[]` on a receipt lists the keys whose rule was EVALUATED for that call and `fired[]` the ones that changed its outcome — reading a key without changing behaviour would be a lie, so all 24 are wired here',
      }
    },

    // ── THE MD FACE (RUN 225-A) — the md is the truth, rows are its index ────────────────────────────────
    /**
     * The workspace root, derived from the durable port's OWN file (`<root>/vmu/state.json` → `<root>`), or null when
     * this instance is not attached to a store. The root is never guessed: an unattached face answers
     * `available:false` instead of writing to a path nobody can name.
     */
    workspaceRoot() {
      const st = shared.store
      if (!st || typeof st.stats !== 'function') return null
      let file = null
      try { const s = st.stats(); file = s && typeof s.file === 'string' ? s.file : null } catch (e) { return null }
      if (file === null || file === '') return null
      return dirname(dirname(file))
    },

    /** Where plain document paths land: `<root>/VibeMath` (the Lean session root), unless the root IS that folder. */
    mdRoot() {
      const root = api.workspaceRoot()
      if (root === null) return null
      return basename(root) === 'VibeMath' ? root : join(root, 'VibeMath')
    },

    /**
     * The path a document path lands on. Accepts an absolute path verbatim, a path already rooted at `VibeMath/`, and
     * a plain `Shared/Protocol.md` (which lands under `<root>/VibeMath/`). Returns null when the root cannot be named.
     */
    mdPathOf(relPath) {
      const rel = mdStr(relPath).trim()
      if (rel === '') return null
      if (isAbsolute(rel)) return rel
      const root = api.workspaceRoot()
      if (root === null) return null
      let clean = rel.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
      if (basename(root) === 'VibeMath') {
        if (clean === 'VibeMath') return root
        if (clean.startsWith('VibeMath/')) clean = clean.slice('VibeMath/'.length)
        return join(root, clean)
      }
      if (clean === 'VibeMath' || clean.startsWith('VibeMath/')) return join(root, clean)
      return join(root, 'VibeMath', clean)
    },

    /** The display path of an absolute md path: relative to `<root>/VibeMath`, forward slashes (stable across OSes). */
    mdRelOf(absPath) {
      const abs = mdStr(absPath).trim()
      if (abs === '') return ''
      const root = api.mdRoot()
      if (root === null) return abs.replace(/\\/g, '/')
      try { return relative(root, abs).replace(/\\/g, '/') } catch (e) { return abs.replace(/\\/g, '/') }
    },

    /** Compose the md text (pure delegation: one shape for the writer and the index rebuild). */
    mdCompose({ title = '', track = null, kind = null, fields = null, text = '' } = {}) {
      const content = mdComposeText({ title, track, kind, fields, text })
      return { ok: true, enforced: [], content, fingerprint: mdFingerprintOf(content), bytes: Buffer.byteLength(content, 'utf8'), format: MD_FORMAT }
    },

    /** Parse md text (pure delegation). */
    mdParse(content) { return mdParseText(content) },

    /** Read the md at a document path. `exists:false` is a FACT, not an error. */
    mdRead({ path = null } = {}) {
      const wanted = mdStr(path).trim()
      const absPath = api.mdPathOf(wanted)
      const unavailable = () => ({ ok: true, enforced: [], available: false, exists: false, path: wanted, absPath: null, fingerprint: null, doc: null, content: null, bytes: 0, means: 'this records instance is not attached to a durable store, so it cannot name the workspace root and will not guess where a document lives' })
      if (absPath === null) return unavailable()
      if (!existsSync(absPath)) return { ok: true, enforced: [], available: true, exists: false, path: api.mdRelOf(absPath), absPath, fingerprint: null, doc: null, content: null, bytes: 0, means: 'no md at this path yet: a revision has not been written to disk (or the file was removed) — the index is the only holder until reindex reports it' }
      let content = ''
      try { content = readFileSync(absPath, 'utf8') } catch (e) {
        return { ok: false, enforced: [], available: true, exists: true, path: api.mdRelOf(absPath), absPath, fingerprint: null, doc: null, content: null, bytes: 0, error: { code: (e && e.code) || 'VMU_MD_READ_FAILED', message: String((e && e.message) || e) }, means: 'the md exists but could not be read: this read makes NO claim about its content' }
      }
      const doc = mdParseText(content)
      // ★★★ RUN 248: `content`/`bytes` are the RAW bytes — a caller that must treat a member-written plain md (no
      // `- vmuMd：` marker) as the document itself cannot rebuild it from `doc` (which only describes a vmu md).
      return { ok: true, enforced: [], available: true, exists: true, path: api.mdRelOf(absPath), absPath, fingerprint: mdFingerprintOf(content), doc, content, bytes: Buffer.byteLength(content, 'utf8'), means: 'the file on disk as bytes; `doc` is its parsed shape (a file without the ' + MD_MARKER_KEY + ' marker is disclosed, never taken for a blueprint), and `content` is those bytes verbatim so a plain md can be adopted as itself' }
    },

    /**
     * ★ THE COMPARISON THE READ FACES NEED: the md fingerprint on disk vs the one the index row stored. Three
     * outcomes, each named: the file is missing, the file was changed since the index (`mdChangedSinceIndex:true` —
     * the repair is `reindex`, not a silent re-read), or they agree. It never writes.
     */
    mdDigest({ path = null, indexFingerprint = null } = {}) {
      const read = api.mdRead({ path })
      const idx = indexFingerprint === undefined || indexFingerprint === null || mdStr(indexFingerprint) === '' ? null : String(indexFingerprint)
      const mdFp = read.fingerprint === undefined ? null : read.fingerprint
      const doc = read.doc || null
      const changed = read.available === true && read.exists === true && mdFp !== null && mdFp !== idx
      return {
        ok: read.ok !== false, available: read.available === true, exists: read.exists === true,
        path: read.path, absPath: read.absPath === undefined ? null : read.absPath,
        mdFingerprint: mdFp, indexFingerprint: idx, mdChangedSinceIndex: changed,
        mdRevision: doc && doc.fields && doc.fields.revision !== undefined ? doc.fields.revision : null,
        mdStatus: doc && doc.fields && doc.fields.status !== undefined ? doc.fields.status : null,
        means: read.available !== true
          ? read.means
          : (read.exists !== true
            ? 'the index has a row for this path but the md is NOT on disk: the file is the truth and it is missing, so this comparison makes no claim about a body'
            : (changed
              ? 'the md was changed outside the tools (its sha256 is not the one the index row recorded): the repair is vibe_vmu_records { action:"reindex" } — the row does not get a new body from this read'
              : 'the md and the index agree (same sha256): the index row and the file describe the same revision')),
      }
    },

    /**
     * Write one md ATOMICALLY: the full text goes to a temp file in the SAME directory, then `rename` replaces the
     * target — a reader never sees half a document, and a failed write leaves the old file intact. The receipt carries
     * the sha256 of what was written, which the caller stores in its row so a later edit is detectable.
     */
    mdWrite({ path = null, title = '', track = null, kind = null, fields = null, text = '' } = {}) {
      const wanted = mdStr(path).trim()
      const absPath = api.mdPathOf(wanted)
      if (absPath === null) {
        return { ok: true, enforced: [], available: false, written: false, path: wanted, absPath: null, fingerprint: null, bytes: 0, atomic: null, means: 'this records instance is not attached to a durable store: it will not guess where a document lives, so nothing was written and no row should claim a md' }
      }
      const content = mdComposeText({ title, track, kind, fields, text })
      const fingerprint = mdFingerprintOf(content)
      const replaced = existsSync(absPath)
      const tmp = absPath + '.tmp-' + String(process.pid) + '-' + String(mdTmpSeq += 1) + '-' + Math.random().toString(16).slice(2, 10)
      try {
        mkdirSync(dirname(absPath), { recursive: true })
        writeFileSync(tmp, content, 'utf8')
        renameSync(tmp, absPath)
      } catch (e) {
        try { if (existsSync(tmp)) unlinkSync(tmp) } catch (e2) { /* a temp file must not outlive a failed write */ }
        return {
          ok: false, enforced: [], available: true, written: false, path: api.mdRelOf(absPath), absPath, fingerprint: null, bytes: 0, atomic: 'temp+rename',
          error: { code: (e && e.code) || 'VMU_MD_WRITE_FAILED', message: String((e && e.message) || e) },
          means: 'the md write FAILED, so the caller must not write an index row claiming this revision: a row that names a file nobody wrote is the exact lie this face exists to prevent',
        }
      }
      return {
        ok: true, enforced: [], available: true, written: true, path: api.mdRelOf(absPath), absPath, fingerprint,
        bytes: Buffer.byteLength(content, 'utf8'), atomic: 'temp+rename', replaced,
        means: 'the FULL revision body is on disk in its own md (temp file + rename, so no reader saw a partial file); the row stores this sha256, so an external edit is detectable',
      }
    },

    /**
     * ★★ RUN 225-A: RECONCILE THE INDEX AGAINST THE DISK. The md is the truth; this operation makes the rows admit
     * what the files say. Four findings, each named and each repaired FORWARD-ONLY:
     *   · `untracked` — a md no row covers (reported; adopted when not dryRun, i.e. a row is built from the md)
     *   · `changed`   — a row whose stored sha256 differs from the file (the row gets the file body as a new VERSION;
     *                   the old body stays in `history`, and no row is deleted)
     *   · `missing`   — a row whose md is gone (named with its ids; the row is NOT deleted: absence is a fact)
     *   · `unchanged` — fingerprints agree (nothing written)
     * `dryRun:true` reports everything and writes nothing.
     */
    mdReindex({ dryRun = false, by = 'reindex', track: onlyTrack = null } = {}) {
      synchronize('md-reindex')
      const caller = mdStr(by).trim() === '' ? 'reindex' : mdStr(by).trim()
      const dry = dryRun === true
      const filter = onlyTrack === undefined || onlyTrack === null || mdStr(onlyTrack).trim() === '' ? null : mdStr(onlyTrack).trim()
      const root = api.mdRoot()
      const means = {
        scanned: 'md 文件数：这次真正对账的 md（`track` 给定时只数该轨的 md）；扫描本身始终递归整棵 <root>/VibeMath（跳过隐藏目录、node_modules 与 vmu 状态目录）',
        adopted: '磁盘上有这一版、索引里没有活行：按 md 重建了一行索引（md 是唯一真相）；dryRun 时只报告不写',
        changed: '索引行记的 ' + MD_REBUILT_KEY + ' 与磁盘 md 的 sha256 不同（md 被外部改过）：把该行换成 md 的正文快照，旧正文进该行版本历史，不删任何历史行',
        missing: '索引里有行、磁盘上没有对应的 md：具名报告；不删行（文件缺失是事实，不是拿索引冒充正文的理由）',
        untracked: '磁盘上有 md、索引里还没有对应活行（dryRun 时就是「不写的话会保持 untracked」的那些）',
        unchanged: 'md 指纹与索引行一致：没有写任何东西',
        blocked: '这次 reindex 没能收进来的文件：每条带 path + why + reachableInstead；非空时回执 ok 为 false（RUN 259 / AUDIT-14：ok:true 曾经在什么都没做时也成立，提示词照做会进死循环）',
        skipped: '读不动、不是 vmu md、或 track 未声明：计数并具名，绝不静默丢；每条带 `whyClass`（unreadable / not-a-vmu-md / undeclared-track / write-refused），所以「有一堆坏文件」与「这堆文件根本不是我这类文档」不再混成一个数',
        skippedByClass: '按 whyClass 分类的跳过计数：not-a-vmu-md 是别人写的 md（不带 `- ' + MD_MARKER_KEY + '：` 头），不是坏索引行',
      }
      if (root === null) {
        return {
          ok: true, action: 'reindex', available: false, dryRun: dry, root: null,
          scanned: 0, paths: [], adopted: [], changed: [], missing: [], untracked: [], unchanged: 0, skipped: [],
          counts: { walked: 0, scanned: 0, unchanged: 0, adopted: 0, changed: 0, missing: 0, untracked: 0, skipped: 0, skippedByClass: { unreadable: 0, 'not-a-vmu-md': 0, 'undeclared-track': 0, 'write-refused': 0 } },
          code: null, hint: null, blocked: [], partial: false, blockedMeans: 'no workspace was scanned, so nothing could be blocked',
          means: Object.assign({ root: 'this instance is not attached to a durable store, so there is no workspace to scan and nothing was written' }, means),
          historyKept: true, at: now(),
        }
      }
      const files = []
      const walk = (dir, depth) => {
        if (depth > MD_MAX_DEPTH) return
        let entries = []
        try { entries = readdirSync(dir, { withFileTypes: true }) } catch (e) { return }
        for (const entry of entries) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'vmu') continue
            walk(full, depth + 1)
          } else if (entry.isFile() && /\.md$/i.test(entry.name)) files.push(full)
        }
      }
      walk(root, 0)

      const seenPaths = []
      const skipped = []
      // ★★ RUN 237 (MEASURED, FEEDBACK60 M6): one bucket called `skipped` mixed three different facts — a file
      // that could not be read, a file whose bytes are not a vmu document at all (a member's own notes), and a
      // card whose track this kernel does not declare. Reported as one list, the second kind reads like "there are
      // a pile of broken files". Each skip now carries `whyClass` and the counts are split.
      const skippedByClass = { unreadable: 0, 'not-a-vmu-md': 0, 'undeclared-track': 0, 'write-refused': 0, 'orphan-draft-md': 0 }
      const noteSkip = (item) => {
        const cls = item && item.whyClass ? item.whyClass : 'unreadable'
        skippedByClass[cls] = (skippedByClass[cls] || 0) + 1
        skipped.push(item)
      }
      const mdByKey = new Map()
      // ★★★ RUN 248: md files keyed by their OWN rel path (every walked file, vmu or not) plus the set of rel paths that
      // exist at all — a draft row is accounted against the file its `mdPath` names, which need not be a vmu md.
      const mdByRel = new Map()
      const walkedRels = new Set()
      // a vmu md that declares `mdPath` different from its `path` is a DRAFT revision file, never the document in force
      const draftRels = new Set()
      for (const file of files) {
        const rel = api.mdRelOf(file)
        walkedRels.add(rel)
        let content = ''
        try { content = readFileSync(file, 'utf8') } catch (e) {
          noteSkip({ path: rel, whyClass: 'unreadable', why: 'unreadable: ' + String((e && e.code) || (e && e.message) || e) })
          continue
        }
        const doc = mdParseText(content)
        if (doc.ok !== true) {
          // ★ is this file OURS at all? A md with no `- vmuMd：` header line is somebody else's document that happens
          // to live under the library root (a member's notes, a proposal draft). Calling that "unreadable" or
          // "broken" is a false accusation; it is simply not a row this index can own.
          const declaresMarker = new RegExp('^-\\s*' + MD_MARKER_KEY + '\\s*[：:]', 'm').test(mdStr(content))
          noteSkip({
            path: rel,
            whyClass: 'not-a-vmu-md',
            why: declaresMarker
              ? (doc.why || 'not a vmu md')
              : 'not a vmu document (no `- ' + MD_MARKER_KEY + '：` header line): left exactly as it is — a md this index cannot own, and saying so is not an accusation that anything is wrong with it',
          })
          continue
        }
        if (filter !== null && doc.track !== filter) continue
        const declared = mdStr(doc.fields && doc.fields.path).trim()
        const declaredMdPath = mdStr(doc.fields && doc.fields[MD_PATH_KEY]).trim()
        const key = declared === '' ? rel : declared
        const entry = { rel, doc, fingerprint: mdFingerprintOf(content) }
        seenPaths.push(rel)
        mdByRel.set(rel, entry)
        // ★★★ RUN 248 (MEASURED): a DRAFT md names the path its revision is ABOUT (`path：Shared/Protocol.md`) and ITSELF
        // as `mdPath`. It is not the document in force, so it must never win the declared-path index: indexed here it
        // would be adopted as an extra row (breaking "one adoption = exactly one row") and could hide external edits to
        // the real document. Draft files are only ever accounted against the ROW that claims them via `mdPath`.
        const isDraftFile = declaredMdPath !== '' && declaredMdPath !== declared
        if (isDraftFile) {
          entry.draftOf = declaredMdPath
          draftRels.add(rel)
          continue
        }
        const previousEntry = mdByKey.get(key)
        if (previousEntry === undefined || rel === key) mdByKey.set(key, entry)
      }

      // the index: every live row of every declared track, grouped track → path → rows
      const trackIds = filter !== null ? (tracks.includes(filter) ? [filter] : []) : tracks.slice()
      const indexByTrack = new Map()
      for (const trackName of trackIds) {
        const byPath = new Map()
        indexByTrack.set(trackName, byPath)
        for (const id of liveIds(trackName)) {
          const rec = records.get(id)
          if (!rec) continue
          const bodyPath = mdFieldOf(rec.body, 'path')
          if (bodyPath === null || bodyPath === '') continue
          const row = {
            id: rec.id, title: rec.title, track: rec.track,
            revision: Number(mdFieldOf(rec.body, 'revision')),
            status: mdFieldOf(rec.body, 'status'),
            mdFingerprint: mdFieldOf(rec.body, MD_REBUILT_KEY),
            // ★★★ RUN 248: the file THIS row owns, when it is not the path its body names (a draft revision).
            mdPath: mdFieldOf(rec.body, MD_PATH_KEY),
            updatedAt: Number(rec.updatedAt) || 0,
          }
          const list = byPath.get(bodyPath) || []
          list.push(row)
          byPath.set(bodyPath, list)
        }
      }

      // ★★★ RUN 248 (MEASURED, task-64): A DRAFT ROW OWNS ITS OWN FILE, NOT THE PATH ITS BODY NAMES. A draft md declares
      // `path：Shared/Protocol.md` (the revision it is about) while its row carries
      // `mdPath：Shared/Drafts/Protocol-r<N>.md`. Keyed by the declared path alone, the draft file is invisible below and
      // its row is reported `missing` while its md sits on disk. So: every row whose `mdPath` differs from its body
      // `path` is taken out of the path group BEFORE the mdByKey loop (the loop deletes whole groups; a claimed row left
      // in a group would be dropped with it and never accounted), and is then accounted against ITS file below (never
      // double-counted, never "missing").
      const claimed = []
      for (const [trackName, byPath] of indexByTrack) {
        for (const [pathKey, rows] of byPath) {
          const remaining = []
          for (const row of rows) {
            const owned = mdStr(row.mdPath).trim()
            if (owned !== '' && owned !== pathKey) {
              claimed.push({ trackName, pathKey, row, owned })
              continue
            }
            remaining.push(row)
          }
          if (remaining.length === 0) byPath.delete(pathKey)
          else byPath.set(pathKey, remaining)
        }
      }

      const adopted = []
      const changed = []
      const untracked = []
      const unchangedList = []
      for (const [key, entry] of mdByKey) {
        const doc = entry.doc
        const fp = entry.fingerprint
        const byPath = indexByTrack.get(doc.track)
        const rows = byPath ? (byPath.get(key) || []) : []
        if (rows.length === 0) {
          const item = { path: key, rel: entry.rel, revision: doc.fields.revision, status: doc.fields.status, mdFingerprint: fp }
          if (doc.track === null || doc.track === '') {
            untracked.push(Object.assign({}, item, { why: 'the md declares no track, so no index row could own it' }))
            continue
          }
          if (!tracks.includes(doc.track)) {
            noteSkip({ path: key, whyClass: 'undeclared-track', why: 'track "' + doc.track + '" is not declared by vmu.records.tracks, so no row can be adopted from this md' })
            continue
          }
          untracked.push(item)
          if (dry) continue
          try {
            const wrote = api.put({
              track: doc.track, kind: doc.kind || doc.track, title: mdStr(doc.title) === '' ? key : doc.title,
              body: mdRowBodyOf(doc, fp), finalAck: doc.fields.status === 'current', finalAckSource: 'reindex-adopt', by: caller,
            })
            let wroteId = wrote.id
            // ★★ RUN 225-A (MEASURED): after the index rows are WIPED (trashed), the md still describes the same bytes as
            // the tombstone, so `put` deduplicates against the tombstone and adds NOTHING — reindex then reported an
            // adoption whose id no `list` could reach (a receipt describing an object no reader can see). The tombstone
            // must be RESTORED instead (its versions survive, which is what "md is the truth, history is kept" means).
            if (wrote && wrote.deduplicated === true && wroteId) {
              const dup = records.get(wroteId)
              if (dup && dup.state !== 'live') {
                const back = api.restore({ id: wroteId, by: caller })
                if (back && back.ok) wroteId = back.id
              }
            }
            adopted.push(Object.assign({}, item, { id: wroteId, means: 'index 里本来没有这一版的活行：按 md 重建了一行（md 是唯一真相）' }))
          } catch (e) {
            noteSkip({ path: key, whyClass: 'write-refused', why: 'adopt refused: ' + String((e && e.code) || 'VMU_UNKNOWN') + ' ' + String((e && e.message) || e) })
          }
          continue
        }
        byPath.delete(key)
        // ★★ RUN 225-A (MEASURED on the first live reindex): a path can hold TWO live rows of the SAME revision — the
        // draft that proposed it and the current row that adopted it — and they carry different fingerprints. Comparing
        // only against `updatedAt` picked the DRAFT (the tie broke by array order), so reindex rewrote the draft row and
        // the row actually in force stayed disagreeing with the file. Three rules, in order: (1) if ANY row already
        // carries the file fingerprint, nothing is written; (2) among the rest, the row that matches the md's own
        // `status` + `revision` is the row this document is about (a current md edits the current row); (3) only then
        // fall back to newest revision, newest write.
        const docRevision = Number.isFinite(Number(doc.fields.revision)) ? Number(doc.fields.revision) : null
        const docStatus = mdStr(doc.fields.status)
        const matchedRows = rows.filter((r) => r.mdFingerprint !== null && r.mdFingerprint === fp)
        if (matchedRows.length > 0) {
          unchangedList.push({ path: key, id: matchedRows[0].id, mdFingerprint: fp })
          continue
        }
        const sameRevision = docRevision === null ? [] : rows.filter((r) => r.revision === docRevision)
        const sameStatus = sameRevision.filter((r) => docStatus === '' || mdStr(r.status) === docStatus)
        const pool = sameStatus.length > 0 ? sameStatus : (sameRevision.length > 0 ? sameRevision : rows)
        const latest = pool.slice().sort((a, b) => (b.revision - a.revision) || (b.updatedAt - a.updatedAt))[0]
        const rowChoice = sameStatus.length > 0 ? 'status+revision' : (sameRevision.length > 0 ? 'revision' : 'newest')
        const item = {
          path: key, rel: entry.rel, id: latest.id, rowChoice,
          revisionMd: doc.fields.revision, revisionIndex: Number.isFinite(latest.revision) ? latest.revision : null,
          mdFingerprint: fp, indexFingerprint: latest.mdFingerprint,
        }
        if (dry) { changed.push(item); continue }
        try {
          api.supersede({
            id: latest.id, title: mdStr(doc.title) === '' ? latest.title : doc.title, body: mdRowBodyOf(doc, fp), by: caller,
            reason: 'md 被外部改过：reindex 用磁盘上的正文重写这一行（旧正文留在该行版本历史里，旧行不删）',
          })
          changed.push(Object.assign({}, item, { means: '索引行换成 md 的快照：新正文是这一行的最新版本，旧正文仍在 history 里，历史行一条没少' }))
        } catch (e) {
          noteSkip({ path: key, whyClass: 'write-refused', why: 'reindex supersede refused: ' + String((e && e.code) || 'VMU_UNKNOWN') + ' ' + String((e && e.message) || e) })
        }
      }

      const missing = []
      const claimedRels = new Set()
      for (const item of claimed) {
        const row = item.row
        claimedRels.add(item.owned)
        if (!walkedRels.has(item.owned)) {
          missing.push({
            track: item.trackName, path: item.owned, ids: [row.id], revisions: [row.revision], kind: 'draft-md',
            means: '索引行记的草案 md ' + item.owned + ' 不在磁盘上：具名报告，不删行（文件缺失是事实，索引不是正文的替代品）',
          })
          continue
        }
        const entry = mdByRel.get(item.owned)
        if (entry === undefined) {
          // the file exists but is NOT a vmu md (a member's plain markdown draft): the row IS its index — nothing to
          // rebuild, and saying so is not an accusation that the file is broken
          unchangedList.push({
            path: item.owned, id: row.id, kind: 'member-plain-md', mdFingerprint: row.mdFingerprint === undefined ? null : row.mdFingerprint,
            means: '这份草案 md 不是 vmu 文档（没有 `- ' + MD_MARKER_KEY + '：` 头）：索引行是它的唯一索引，reindex 不改写它',
          })
          continue
        }
        const fp = entry.fingerprint
        if (row.mdFingerprint !== null && row.mdFingerprint === fp) {
          unchangedList.push({ path: item.owned, id: row.id, kind: 'draft-md', mdFingerprint: fp })
          continue
        }
        const draftChanged = {
          path: item.owned, rel: entry.rel, id: row.id, rowChoice: 'mdPath', kind: 'draft-md',
          revisionMd: entry.doc.fields.revision, revisionIndex: Number.isFinite(row.revision) ? row.revision : null,
          mdFingerprint: fp, indexFingerprint: row.mdFingerprint,
        }
        if (dry) { changed.push(draftChanged); continue }
        try {
          api.supersede({
            id: row.id, title: mdStr(entry.doc.title) === '' ? row.title : entry.doc.title, body: mdRowBodyOf(entry.doc, fp), by: caller,
            reason: '草案 md 被外部改过：reindex 用磁盘上的正文重写这一行（旧正文留在该行版本历史里，旧行不删）',
          })
          changed.push(Object.assign({}, draftChanged, { means: '草案行换成它自己 md 的快照：`' + MD_PATH_KEY + '` 让它认回自己的文件，而不是被当成缺文件' }))
        } catch (e) {
          noteSkip({ path: item.owned, whyClass: 'write-refused', why: 'draft reindex supersede refused: ' + String((e && e.code) || 'VMU_UNKNOWN') + ' ' + String((e && e.message) || e) })
        }
      }
      // ★★★ RUN 248: a draft md file that NO live row claims is a revision file whose row moved on (e.g. the draft was
      // adopted and its `mdPath` now names the canonical document). It is history on disk, not a document to adopt: named
      // here, never turned into an extra index row and never silently dropped.
      for (const rel of draftRels) {
        if (claimedRels.has(rel)) continue
        const entry = mdByRel.get(rel)
        noteSkip({
          path: rel,
          whyClass: 'orphan-draft-md',
          why: '这份草案 md 声明的是 ' + mdStr(entry && entry.draftOf) + '，但它没有活行认领（草案已被采纳，行的 mdPath 已指向 ' + mdStr(entry && entry.draftOf) + '）：它是磁盘上的历史，不是要收进来的文档',
        })
      }
      for (const [trackName, byPath] of indexByTrack) {
        for (const [pathKey, rows] of byPath) {
          missing.push({
            track: trackName, path: pathKey, ids: rows.map((r) => r.id), revisions: rows.map((r) => r.revision),
            means: '索引里有行、磁盘上没有这个 md：具名报告，不删行、不静默丢历史（md 是唯一真相，文件缺失是事实）',
          })
        }
      }

      // ★★★ RUN 259 / AUDIT-14 P0-3 (MEASURED, real machine): `reindex` used to answer ok:true for EVERY outcome, including
      // the files it could not index at all. The hint of VMU_PACK_V5R_BLUEPRINT_MD_DRIFT told a member to run reindex and
      // then adopt; reindex answered ok:true, wrote nothing (the draft file is a plain markdown the index cannot own), and
      // the next adopt refused with the SAME code. A receipt that says ok while the cure did nothing is how a hint becomes
      // a loop. So: every file this call DROPPED is named in `blocked` with the reason and one reachable repair, and `ok`
      // is false whenever that list is non-empty (`skipped` stays for counting, but it is no longer evidence of success).
      // `orphan-draft-md` is NOT blocking: it is the expected history of an adopted draft, not a file the caller can fix.
      const BLOCKING_SKIP_CLASSES = ['unreadable', 'not-a-vmu-md', 'undeclared-track', 'write-refused']
      const BLOCKED_REACHABLE = {
        unreadable: 'check the file is readable UTF-8 text (permissions/encoding), then run reindex again — the index cannot own bytes it could not read',
        'not-a-vmu-md': 'this index can only own a vmu md (`- vmuMd：vmu-md/1` header + `## 正文`): if the file should be a blueprint draft, rewrite it as a vmu md (or call vibe_v5_blueprint {action:"propose", …, materialize:true} so the kernel writes it), then reindex; if it is a member own note, it needs no reindex — but a BP adopt that DRIFTED on such a file cannot be cured by reindex: adopt the file bytes explicitly with vibe_v5_blueprint {action:"adopt", …, refreshFingerprint:true}',
        'undeclared-track': 'the md declares a track this kernel does not declare: fix its `- track：` line, or declare the track in vmu.records.tracks, then reindex again — no row can be adopted from it before that',
        'write-refused': 'the index tried to write this row and was refused: read the named code in `why` and fix that cause, then reindex again — nothing was changed silently',
      }
      const blocked = skipped
        .filter((item) => item && BLOCKING_SKIP_CLASSES.indexOf(item.whyClass) >= 0)
        .map((item) => ({
          path: item.path,
          whyClass: item.whyClass,
          why: item.why,
          reachableInstead: BLOCKED_REACHABLE[item.whyClass] || 'fix the named cause, then run reindex again',
        }))
      const counts = { walked: files.length, scanned: seenPaths.length, unchanged: unchangedList.length, adopted: adopted.length, changed: changed.length, missing: missing.length, untracked: untracked.length, skipped: skipped.length, skippedByClass: Object.assign({}, skippedByClass), blocked: blocked.length }
      // ★★★ RUN 259 / TB-2650 (sim gate, MEASURED): a refusal has to be NAMEABLE. `ok:false` with no `code` cannot be
      // branched on by a caller, cannot be declared as expected by the simulator ledger, and cannot be registered in the
      // docs/03 §8 code table — the receipt audit reports it as a finding. One named code, one named list, one hint.
      const reindexHint = blocked.length === 0
        ? null
        : 'reindex 拒绝是这条码的意思：有 ' + String(blocked.length) + ' 个 md 文件这次收不进索引。每条 blocked[] 自带 reachableInstead：按它的 whyClass 修完（文件/权限/track 声明），然后**再调一次 reindex**（修好后这一条会消失）；如果 blocked 里的文件是 adopt 漂移的草案（whyClass=not-a-vmu-md），reindex 永远收不了它——直接 vibe_v5_blueprint {action:"adopt", path:"<path>", member:"<chair id>", draft:"<draft id>", refreshFingerprint:true} 认下当前字节。REACHABLE INSTEAD: ① 读 blocked[].reachableInstead 并逐条修，再 vibe_vmu_records {action:"reindex"}（修好的条目不再出现）；② 漂移草案走 vibe_v5_blueprint {action:"adopt", draft, refreshFingerprint:true}（这一步才改得动指纹）；③ 纯成员笔记不需要 reindex，也不该出现在 blocked 里'
      return {
        ok: blocked.length === 0,
        code: blocked.length === 0 ? null : 'VMU_RECORDS_REINDEX_BLOCKED',
        action: 'reindex', available: true, hint: reindexHint, dryRun: dry, root, rootMeans: 'the scanned document root (<root>/VibeMath): the index rows are compared against the md files under it',
        blocked,
        blockedMeans: blocked.length === 0
          ? 'nothing was blocked: every md file this call met was either indexed, already in step, or is the named history of an adopted draft'
          : 'this call could NOT index ' + String(blocked.length) + ' file(s) and says so by NAME (path + why + reachableInstead): ok is false and the refusal carries the code VMU_RECORDS_REINDEX_BLOCKED, because a reindex that leaves files unindexed is not a successful reindex and a refusal without a name cannot be branched on or declared as expected. `skipped`/`skippedByClass` count the same files but are no longer evidence that the call succeeded; missing/untracked describe files the index never had, blocked describes files it could not take',
        walked: counts.walked,
        scanScope: {
          root,
          recursive: true,
          trackFilter: filter,
          trackNarrows: filter === null ? 'nothing: every declared track is accounted' : 'only WHICH md files are accounted (the walk still covers the whole root)',
          walked: counts.walked,
          accounted: counts.scanned,
        },
        skippedByClass: Object.assign({}, skippedByClass),
        partial: blocked.length > 0,
        scanned: counts.scanned, paths: seenPaths,
        adopted, changed, missing, untracked, unchanged: counts.unchanged, skipped, counts, means,
        historyKept: true,
        historyMeans: 'reindex 只前进：匹配的行追加一个版本、没有行的新增、缺文件只报告；它不 trash、不 purge、不删除任何一行，所以历史不会被一次 reindex 抹掉',
        at: now(), by: caller,
      }
    },
  }

  // ── ROUND 36 (task-26): the shared seam — how a READ folds what OTHER kernels wrote ─────────────────
  // ★ THE ORDER THAT MAKES THIS WORK: `putInternal` is captured HERE, while `api.put` is still this module's own
  // function. kernel/index.js wraps `records.put` afterwards (write-through snapshot) and the approval gate wraps it
  // again; a restore must call the INNER put, or every restored row would trigger a full `store.write('records', …)`.
  // A read that rewrites the file is a second writer, and N restored rows would mean N writes on the first read.
  const putInternal = api.put

  /**
   * ★★ RUN 170 (real machine, run 16 / FEEDBACK16 F16-1+F16-4+F16-5): ADOPT A TOMBSTONE THE INSTANCE NEVER HELD.
   * A row trashed by another kernel travels in the fold as `{state:'trashed', trashedAt, purgeAt, …}`. This instance
   * never had it live, so there is nothing to "stop counting" — but the row still OCCUPIES ITS NAMES until purgeAt, and
   * a mint that cannot see it reuses an id that a restorable record still answers to. Measured in run 16: a freshly
   * booted office kernel minted `paper-p1` on top of an existing `paper-p1` (one name, two papers) and the trash was
   * invisible to `trashRows()` in every instance that had not performed the prune.
   * The row is installed as a TRASH row only: it is not in the live track list (a reader asking for papers does not get
   * it), it counts under `records.trashed`, `restore` can bring it back (restore rebuilds every index), and `remove` on
   * it answers `already:'trashed'`. It is a tombstone, never a resurrection.
   */
  function adoptTombstoneRow(id, row) {
    if (records.has(id)) return false
    const at = Number(row.trashedAt) || now()
    const body = row.body === undefined || row.body === null ? '' : String(row.body)
    const rec = {
      id, track: String(row.track), kind: String(row.kind), title: row.title === undefined || row.title === null ? '' : String(row.title),
      slug: String(id), body, tags: Array.isArray(row.tags) ? listOf(row.tags, []) : [], bytes: bytesOf(body),
      fingerprint: 'tombstone:' + id, permanent: false, state: 'trashed', rev: 0, createdAt: at, updatedAt: at,
      by: row.by === undefined || row.by === null ? null : String(row.by),
      // ★★ RUN 240: a tombstone keeps the row's OWNER apart from its writer, exactly like a live row.
      owner: row.owner === undefined || row.owner === null ? (row.by === undefined || row.by === null ? null : String(row.by)) : String(row.owner),
      versions: [], trashedAt: at,
      purgeAt: Number(row.purgeAt) || (at + trashRetainDays * DAY_MS), restoredAt: null,
    }
    records.set(id, rec)
    // the id joins `order` (the durable row order every reader walks) but NOT the live track list: a trashed row is not
    // a live record, and `list()`/`liveIds()` must keep answering with live rows only.
    if (!order.includes(id)) order.push(id)
    record_({ type: 'records/tombstone-adopted', id, track: rec.track, kind: rec.kind, purgeAt: rec.purgeAt })
    fire('records/tombstone-adopted', { id, track: rec.track, purgeAt: rec.purgeAt })
    return true
  }
  /**
   * ★★★ RUN 2697 / TB-2697: REMEMBER A LOCAL WRITE UNTIL ITS FOLD WRITE IS ACKNOWLEDGED. The durable snapshot is queued
   * AFTER the mutation (kernel/index.js snapshotRecords), so between the two the fold can still be the `before` picture.
   * While an id is pending, synchronize() must not adopt a differing fold row for it: that row may be our own older
   * snapshot, and adopting it would silently roll the row back (the defect measured in TB-2697). The kernel deletes the
   * entry when the patch resolves; this face deletes it when a fold row proves to carry exactly our (rev, updatedAt).
   */
  function noteLocalWrite(rec) {
    if (!shared.foldPending || !rec || rec.id === undefined || rec.id === null) return
    shared.foldPending.set(String(rec.id), { rev: rec.rev, updatedAt: rec.updatedAt })
  }
  /**
   * ★★★ RUN 269 / TB-2697 (the missing half of the same fix): THE WRITE IS DURABLE, SO IT IS NO LONGER IN FLIGHT.
   * `noteLocalWrite` marks a row pending so a read cannot adopt the pre-write snapshot; the intended exit was always
   * "the kernel deletes the entry when the patch resolves", but only the second exit (a fold row proving to carry our
   * exact (rev, updatedAt)) was wired. With a clock that does not advance between the two writes — every simulator run
   * uses a frozen clock, and two kernels writing in the same millisecond is exactly what a cross-kernel co-design does —
   * that proof never arrives: another kernel rewriting the SAME row keeps `updatedAt` equal and bumps `rev`, so `landed`
   * stays false forever and the row is skipped on every read (measured live in run 129: `pulled:0 / skipped:22`, the
   * member's co-design author never reached the office's adopt). Clearing here is not a relaxation of the ordering rule:
   * the patch has RESOLVED, so the fold already carries our write, and a fold row that differs afterwards is a real
   * rewrite by another kernel, which the strictly-newer rule then judges on its merits.
   */
  function acknowledgeFoldWrite() {
    if (!shared.foldPending) return 0
    const n = shared.foldPending.size
    shared.foldPending.clear()
    return n
  }
  /**
   * Fold the durable fold into this instance, INCREMENTALLY, before a read answers. Three rules make it safe to call on
   * every read:
   *   · A ROW THIS INSTANCE ALREADY HOLDS IS ONLY REPLACED BY A STRICTLY NEWER FOLD ROW — never by an older snapshot.
   *     The fold write is queued AFTER the mutation it describes, so between the two the durable copy can be OLDER than
   *     local memory; adopting it as if it were news is what rolled a row back in TB-2697 (writer r-1 / fingerprint
   *     dd599433… / updatedAt +61s on a row r-acad had already rewritten, from a read that wrote nothing). "Newer" is
   *     (updatedAt, then rev): `rev` counts the writes THIS kernel folded (see revMeans), so across kernels the instant
   *     is the comparable fact and rev only breaks a same-millisecond tie.
   *   · AN ID WHOSE LOCAL FOLD WRITE IS NOT ACKNOWLEDGED YET (`shared.foldPending`) IS SKIPPED ENTIRELY: our own write may
   *     not be in the fold yet, so a differing row may be the picture from BEFORE it. Skipped and COUNTED (`heldBack`).
   *   · it NEVER writes: the durable snapshot stays the mutating instance's job; and it is CHEAP when nothing changed (the
   *     fold's row signature is compared first, so an unchanged fold costs one read of an already-open fold and ZERO
   *     `put` calls — the freshness check of docs/07 §1-(5)).
   * Every refused row is COUNTED (`staleRows`), never silent and never written back. A store that is not open is a
   * DEGRADED instance (it opens asynchronously and kernel/index.js retries hydration), so the failure is COUNTED and
   * ATTRIBUTED, never thrown and never silent.
   */
  function synchronize(why) {
    if (!shared.store) return { synced: false, why: 'no-store', op: why }
    shared.lastSyncAt = now()
    let raw
    try { raw = shared.store.read(SHARED_STORE_KEY) }
    catch (e) {
      shared.refused += 1
      shared.lastWhy = String((e && e.code) || 'VMU_STORE_FAILED')
      shared.lastDetail = String((e && e.message) || e)
      return { synced: false, why: 'store-unavailable', op: why }
    }
    if (raw === undefined || raw === null) raw = []   // the key was never written: an empty fold is not a lie
    if (!Array.isArray(raw)) {
      // A projection ENVELOPE (`{mode:'state', …}`) belongs to another module; adopting it would invent records.
      shared.refused += 1
      shared.lastWhy = 'not-a-row-array'
      shared.lastDetail = 'the durable "' + SHARED_STORE_KEY + '" key is not an array (' + typeof raw + ')'
      return { synced: false, why: 'not-a-row-array', op: why }
    }
    shared.pulls += 1
    shared.lastPullAt = now()
    try {
      const st = typeof shared.store.stats === 'function' ? shared.store.stats() : null
      shared.stamp = st && typeof st.stamp === 'string' ? st.stamp : null
    } catch (e) { shared.stamp = null }
    const signature = sharedSignature(raw)
    if (signature === shared.signature) {
      shared.skipped += 1
      return { synced: false, why: 'unchanged', op: why, stamp: shared.stamp }
    }
    shared.signature = signature
    let added = 0
    let refreshed = 0
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue
      const id = row.id === undefined || row.id === null ? null : String(row.id)
      if (!id || !row.track || !row.kind) continue         // a malformed row is skipped, never invented into a record
      const held = records.get(id)
      if (held) {
        // ★★ RUN 166 (FEEDBACK14 F1/F3/F4): A TRASH MADE ELSEWHERE IS A CHANGE THIS INSTANCE MUST LEARN. The fold is the
        // only meeting point of several kernels, so a tombstone in it is the ONE durable statement that a row stopped
        // being live. Before this, the local copy stayed 'live' forever: the member kernel kept counting 200/200 paper
        // rows after the office had pruned to 20, and the name of a trashed row stayed taken in that instance — which is
        // how a freshly minted `paper-p1` landed on an old paper and a minted `m33` resolved to an archived meeting.
        const rowTrashed = row.state === 'trashed'
        const heldTrashed = held.state === 'trashed'
        if (rowTrashed && !heldTrashed) {
          // ★★ RUN 166: A STALE TOMBSTONE MUST NOT UNDO A REPAIR. The fold is written asynchronously, so a read that
          // happens right after `restore` can still see the trash note the prune wrote. Adopting it re-trashed the row
          // the caller had just restored and the receipt had just called live — the repair silently reversed itself.
          // The local `restoredAt` is the newer statement, so a tombstone older than it is skipped and COUNTED.
          const restoredAt = Number(held.restoredAt || 0)
          const trashedAt = Number(row.trashedAt || 0)
          if (restoredAt > 0 && trashedAt > 0 && trashedAt <= restoredAt) {
            shared.staleTombstones += 1
            continue
          }
          const fpIdx = byFingerprint.get(held.track)
          if (fpIdx && held.fingerprint) fpIdx.delete(held.fingerprint)
          const slugIdx = bySlug.get(held.track)
          if (slugIdx && held.slug) slugIdx.delete(held.slug)
          held.state = 'trashed'
          held.trashedAt = Number.isFinite(Number(row.trashedAt)) ? Number(row.trashedAt) : now()
          held.purgeAt = Number.isFinite(Number(row.purgeAt)) ? Number(row.purgeAt) : null
          held.by = row.by !== undefined && row.by !== null ? String(row.by) : held.by
          shared.trashAdopted += 1
          continue
        }
        if (!rowTrashed && heldTrashed) {
          // ★★ RUN 168 (FEEDBACK15 F15-1 — THE PRUNE THAT UNDID ITSELF): the stale-tombstone guard above only protected the
          // trash-vs-trash direction. The fold is written asynchronously, so a read that happens right after `prune` still
          // carries the LIVE copy the snapshot captured BEFORE the prune, and this branch adopted it as a restore: the
          // office pruned to 170, the next `status` said 200/200 again and the receipt's `liveAfter:170` was never true.
          // Measured on the real machine (run 15): prune{keep:170} answered liveBefore 200 / liveAfter 170, the very next
          // status/fold answered paper:200, and a second prune{keep:190} reported liveBefore 203 — the agent read that as a
          // cross-kernel tombstone bug and re-diagnosed twice. A REAL restore is a local act, and the snapshotted live row
          // carries its `restoredAt`; a live row with NO restore stamp, or one stamped BEFORE this instance's own trash,
          // is the OLD copy and must not revive anything. A stamp EQUAL to the trash is NOT old: a restore in the same
          // clock tick is still a legitimate later statement (the run-166 fixture restores on a fixed clock, and a stale
          // snapshot never carries a restore stamp at all — the pre-fix rows had no such key). Skipped and COUNTED, so
          // the reader can tell "nothing was pruned" from "something refused to stay pruned".
          const restoredAtFold = Number(row.restoredAt || 0)
          const trashedHere = Number(held.trashedAt || 0)
          const staleLive = restoredAtFold <= 0 || (trashedHere > 0 && restoredAtFold < trashedHere)
          if (staleLive) {
            shared.staleLiveRows += 1
            continue
          }
          // a RESTORE elsewhere is the reverse statement: the fold says the row is live again, so this copy rejoins.
          held.state = 'live'
          held.restoredAt = restoredAtFold
          held.trashedAt = null
          held.purgeAt = null
          const fpIdx = byFingerprint.get(held.track)
          if (fpIdx && held.fingerprint) fpIdx.set(held.fingerprint, held.id)
          const slugIdx = bySlug.get(held.track)
          if (slugIdx && held.slug) slugIdx.set(held.slug, held.id)
          shared.trashRestored += 1
          continue
        }
        // ★★★ RUN 2697 / TB-2697: ONE COMPARISON, TWO REFUSALS. A held row changes only when the fold row is STRICTLY
        // NEWER by (updatedAt, then rev for the same millisecond): rev alone cannot order two kernels (it counts only the
        // writes THIS instance folded — see revMeans), so updatedAt is the primary key. Everything that is not strictly
        // newer is the OLD picture, and refusing it is the whole fix: adopting it is what moved rec-2 back one revision
        // on a read that wrote nothing (TB-2697). Refusals are COUNTED so "nothing changed" and "an old row was refused"
        // are different readings (staleRows below, heldBack when the row is also pending).
        const foldAt = timeMsOf(row.updatedAt)
        const foldRev = Number.isInteger(row.rev) ? row.rev : null
        const heldAt = timeMsOf(held.updatedAt)
        const heldRev = Number.isInteger(held.rev) ? held.rev : 0
        const strictlyNewer = foldAt !== null
          && (heldAt === null || foldAt > heldAt || (foldAt === heldAt && foldRev !== null && foldRev > heldRev))
        // ★★★ RUN 2697 / TB-2697: AN UNACKNOWLEDGED LOCAL WRITE OUTRANKS THE FOLD. `noteLocalWrite` recorded every row
        // this instance just wrote; until the kernel acknowledges the snapshot patch, the fold may still hold the version
        // from BEFORE that write — or another kernel may have rewritten the row in between, which we cannot tell apart
        // from our own stale snapshot. A fold row that EQUALS our pending (updatedAt, rev) proves the write landed, so the
        // id stops being pending; anything else is skipped outright while the write is in flight (COUNTED as heldBack).
        // Adopting it here was the defect: a read with no write of its own moved the row back one revision.
        const pending = shared.foldPending.get(id)
        if (pending) {
          const pendingAt = timeMsOf(pending.updatedAt)
          const landed = foldAt !== null && pendingAt !== null && foldAt === pendingAt
            && foldRev !== null && foldRev === pending.rev
          if (!landed) { shared.heldBack += 1; continue }
          shared.foldPending.delete(id)
        }
        // ★ LIVE RUN 129 (F-129a): A BODY REWRITE IS A CHANGE — and it still is, for a row this instance is NOT pending
        // on. The co-design author the member kernel added must reach the office's adopt. What changed in TB-2697 is the
        // BAR: differing content is a rewrite only when the fold row is STRICTLY NEWER than the row this instance holds;
        // an older snapshot is refused and counted, never applied.
        if (rowContentStamp(row) !== rowContentStamp(held)) {
          if (!strictlyNewer) {
            shared.staleRows += 1
            continue
          }
          const prevFp = held.fingerprint
          const fpIndex = byFingerprint.get(held.track)
          if (fpIndex && prevFp) fpIndex.delete(prevFp)
          held.title = row.title !== undefined && row.title !== null ? String(row.title) : held.title
          held.body = String(row.body)
          held.bytes = bytesOf(held.body)
          if (Array.isArray(row.tags)) held.tags = listOf(row.tags, held.tags)
          if (Number.isInteger(row.rev) && row.rev > held.rev) held.rev = row.rev
          // ★★★ RUN 2697 / TB-2697: THE ROW KEEPS THE FOLD'S OWN STAMP, NOT `now()`. The old code stamped an adopted
          // rewrite with the READ's clock, so a stale snapshot became "a change observed at this instant": updatedAt
          // moved forward by +61s in the measured flip and re-reading could not tell an old row from a new one. An
          // adopted row now carries the instant it was WRITTEN, which is exactly the fact the next comparison needs.
          held.updatedAt = foldAt
          const writer = row.by !== undefined && row.by !== null ? row.by : (row.owner !== undefined && row.owner !== null ? row.owner : null)
          if (writer !== null) held.by = String(writer)
          // ★★ RUN 240: ownership and authorship are TWO facts, so a rewritten fold row restores BOTH. The fold used to
          // carry one name (the owner, under `by`), so every rewrite read back as "the owner wrote it" — run 63's
          // `expand` said `writer:"r-1"` for a card r-acad had just corrected.
          const ownerOfRow = row.owner !== undefined && row.owner !== null ? row.owner : writer
          if (ownerOfRow !== null) held.owner = String(ownerOfRow)
          // ★★★ RUN 2739 / TB-2739 (RUN 79 V1): PROVENANCE IS PART OF THE ROW, LIKE `by` AND `owner`. An adopted rewrite
          // used to restore title/body/tags/rev/updatedAt/by/owner and then let this instance DERIVE `writtenFrom` again
          // from "a named writer and no caller" -> `relayed`, so a row a seat wrote inside its own delivered turn read
          // back as relayed through the office (31 relayed rows against 8 real member turns). The provenance cannot be
          // re-derived here: THIS instance did not dispatch that write, so the fold row is the only witness. Invalid
          // values are ignored rather than coerced, because a fold written before this key existed says nothing.
          const provenanceOfRow = WRITTEN_FROM_VALUES.indexOf(row.writtenFrom) === -1 ? null : row.writtenFrom
          if (provenanceOfRow !== null) held.writtenFrom = provenanceOfRow
          held.fingerprint = fingerprintOf(held)
          if (fpIndex) fpIndex.set(held.fingerprint, held.id)
          refreshed += 1
        }
        continue                                            // ★ never DELETE what this instance knows; a newer body is adopted above
      }
      if (row.state === 'trashed') {
        // ★★ RUN 166: a TOMBSTONE is not a record to adopt as LIVE — adopting it as a live row would be the very
        // resurrection the tombstone exists to prevent.
        // ★★ RUN 170 (real machine, run 16 / FEEDBACK16 F16-1+F16-4+F16-5 — THE TRASH NOBODY WAS EVER TOLD ABOUT): it is
        // also not nothing. This branch used to COUNT the tombstone and DROP it, so an instance that never held the row
        // learned only "a row I did not know about is not live": the names in the trash stayed free in its world (a
        // freshly booted office minted `paper-p1` on top of `paper-p1`, F16-5) and its own prune bookkeeping could not
        // name what had gone. A tombstone IS the object (id/track/kind/title/body/trashedAt/purgeAt travel in the fold),
        // so it is adopted AS A TRASH ROW: reserved, counted under `records.trashed`, restorable, and never listed as
        // live. `tombstonesSeen` still counts every tombstone the fold carried; `tombstonesAdopted` counts the ones this
        // instance did not already know.
        shared.tombstonesSeen += 1
        if (adoptTombstoneRow(id, row)) shared.tombstonesAdopted += 1
        continue
      }
      try {
        // ★ ROUND 68 (F-61): AN UNKNOWN AUTHOR IS NOT A NAME. This used to fall back to the literal `'restore'`, so an
        // adopted row reported `owner:"restore"` — a writer that never existed — and the same row read `owner:null`
        // through the instance that wrote it. Two readers, one row, two answers, and the wrong one looked specific.
        // The row is accepted with `by:null`; `shared.adoptedNoAuthor` counts how often that happened so a reader can
        // tell "the row did not say" from "nothing was ever adopted".
        const writer = row.by !== undefined && row.by !== null ? row.by : (row.owner !== undefined && row.owner !== null ? row.owner : null)
        if (writer === null) shared.adoptedNoAuthor += 1
        // ★★★ RUN 2739 / TB-2739 (RUN 79 V1): a row adopted from the fold has no dispatch here, so `put` would derive
        // its provenance from "a named writer and no caller". The fold row already carries the answer — hand it over.
        const provenanceOfRow = WRITTEN_FROM_VALUES.indexOf(row.writtenFrom) === -1 ? null : row.writtenFrom
        // ★★ RUN 240: `by` is the WRITER, `owner` is whose row it is — the fold now carries BOTH, and an adopted row
        // keeps the two apart. A fold written before this change carries only one name under `by`; it is adopted as
        // both, which is the only shaper that row's history allows (and `owner` then equals `writer`, truthfully).
        const ownerOfRow = row.owner !== undefined && row.owner !== null ? row.owner : writer
        putInternal.call(api, { id, track: row.track, kind: row.kind, title: row.title, body: row.body, tags: row.tags, finalAck: true, finalAckSource: 'rehydrate',
          // the writer is carried by `by` on the row; `owner` is accepted as well because that is the name the VIEW
          // exposes it under (a snapshot that copies the view - kernel/index.js does - can only carry `owner`).
          by: writer === null ? null : String(writer),
          owner: ownerOfRow === null ? undefined : String(ownerOfRow),
          ...(provenanceOfRow === null ? {} : { writtenFrom: provenanceOfRow }) })
        added += 1
      } catch (e) {
        shared.refused += 1
        shared.lastWhy = String((e && e.code) || 'row-refused')   // a refused ROW is not a new refusal CODE: name it as such
        shared.lastDetail = 'row ' + id + ': ' + String((e && e.message) || e)
      }
    }
    shared.pulled += added
    shared.refreshed += refreshed
    return { synced: added > 0 || refreshed > 0, why: added > 0 ? 'newer-on-disk' : (refreshed > 0 ? 'rewritten-on-disk' : 'nothing-new'), op: why, added, refreshed, stamp: shared.stamp }
  }

  /**
   * The fold's cheap change signature: row IDs AND what each row says. The writer replaces the whole array, so an
   * unchanged fold skips the loop entirely; when a row's body is rewritten (supersede keeps the id) the signature still
   * changes, which is how RUN 129's cross-kernel authors reach a reader. Signature equality is only a fast path — adoption
   * is still decided row by row against the strict-newer rule above.
   */
  /** What a stored row SAYS (a supersede keeps id AND rev: only the content tells a rewrite from the row it replaced). */
  function rowContentStamp(row) {
    const parts = [row && row.track, row && row.kind, row && row.title, row && row.body, row && row.by,
      Array.isArray(row && row.tags) ? (row.tags.join('')) : (row && row.tags),
      // ★★ RUN 166: the row's STATE travels in the fold, so it is part of what "the stored row says". Without it a row
      // trashed by another kernel looked unchanged (same title/body/by) and the adoption loop above could never fire.
      row && row.state, row && row.trashedAt, row && row.purgeAt]
    return parts.map((v) => (v === undefined || v === null ? '' : String(v))).join('')
  }

  function sharedSignature(rows) {
    let out = String(rows.length)
    for (const row of rows) out += ',' + (row && row.id !== undefined && row.id !== null ? String(row.id) : '?') + '#' + rowContentStamp(row)
    return out
  }

  /** `status()`'s READ-ONLY view of the seam. The store object itself is not exposed (it is a port, not data). */
  function sharedView() {
    return {
      attached: shared.attached, key: SHARED_STORE_KEY, stamp: shared.stamp,
      pulls: shared.pulls, pulled: shared.pulled, refreshed: shared.refreshed, refused: shared.refused, skipped: shared.skipped,
      refreshedMeans: 'rows THIS instance already held whose stored copy was rewritten by another kernel AND was STRICTLY newer (updatedAt, then rev): the local copy is replaced by the newer body (a supersede keeps the id, so an id-set signature could never see it). An older stored copy is REFUSED and counted under staleRows instead — a read never rolls a row back (RUN 2697 / TB-2697). Read a decision that depends on the CURRENT body (blueprint adopt, card gates) after this count moves, instead of trusting the row this instance first loaded',
      staleRows: shared.staleRows,
      staleRowsMeans: 'differing rows in the durable fold REFUSED because they were NOT strictly newer than the row this instance holds: this is the shape of the TB-2697 defect (a queued snapshot from before a local write was read back as if it were news and rolled the row one revision back). Counted here, never written over the local row',
      heldBack: shared.heldBack,
      heldBackMeans: 'fold rows skipped because this instance STILL HOLDS AN UNACKNOWLEDGED WRITE for that id (its snapshot patch has not resolved): the differing row may be our own older picture, so it is neither adopted nor counted as stale. The kernel removes the pending entry when the patch resolves; this face removes it when a fold row proves to carry exactly our (rev, updatedAt)',
      scope: 'this-kernel-instance',
      scopeMeans: 'these counters belong to THIS kernel: they count the folds THIS process has performed. Another kernel over the same store folds its own copy, so two kernels may legitimately report different `pulls`/`adoptedWithoutAuthor` for the same durable ledger — the shared fact is the store key, not this number',
      adoptedWithoutAuthor: shared.adoptedNoAuthor,
      adoptedWithoutAuthorMeans: 'rows adopted from the durable fold whose row did not name its writer: their `owner` reads null because the ROW did not say, not because nobody wrote it. This counter is the difference between that reading and no adoption at all',
      trashAdopted: shared.trashAdopted,
      trashAdoptedMeans: 'rows THIS instance was holding live that another kernel moved to the TRASH: the tombstone travelled in the fold and this copy stopped counting them as live (pruning in one member turn frees the slot in every other turn)',
      trashRestored: shared.trashRestored,
      trashRestoredMeans: 'rows THIS instance was holding trashed that another kernel RESTORED: the fold said live again and this copy rejoined',
      tombstonesSeen: shared.tombstonesSeen,
      tombstonesSeenMeans: 'tombstones the fold carried: counted so a reader can tell "nothing was pruned" from "nothing I know about was pruned"',
      tombstonesAdopted: shared.tombstonesAdopted,
      tombstonesAdoptedMeans: 'tombstones for ids this instance NEVER held, now installed as TRASH rows: the id/title are reserved until purgeAt (a mint steps past them) and the row counts under records.trashed, but it is never listed as live and never resurrects on its own',
      staleLiveRows: shared.staleLiveRows,
      staleLiveRowsMeans: 'LIVE rows in the fold OLDER than this instance own trash of the same row: skipped, because the snapshot was written before the prune and adopting it would undo the prune (the receipt that said liveAfter:170 would stop being true one read later)',
      staleTombstones: shared.staleTombstones,
      staleTombstonesMeans: 'tombstones OLDER than this instance own restore of the same row: skipped, because undoing a repair the caller just made is not learning, it is losing the repair',
      lastWhy: shared.lastWhy, lastDetail: shared.lastDetail, lastPullAt: shared.lastPullAt, lastSyncAt: shared.lastSyncAt,
    }
  }

  // ── helpers that keep the surface honest ───────────────────────────────────────────────────────────
  // ORDER CONVENTION (round 30, unified across the knob-bearing modules): INSERTION order - the order in which
  // the keys were first evaluated. It used to sort, which made this the only module whose array order differed
  // from its siblings, and the order carries information (which guard ran first) that sorting discarded.
  // De-duplication stays; only the sort is gone.
  function uniq(arr) { return arr.filter((v, i) => arr.indexOf(v) === i) }
  function liveTrackNames() { return tracks.slice() }
  function projectView(rec, fields, at) {
    const full = view(rec, { at })
    const out = {}
    for (const f of Object.keys(full)) if (fields.includes(f)) out[f] = full[f]
    for (const f of CORE_HEAD_FIELDS) if (!(f in out)) out[f] = full[f]
    return out
  }
  /** The declared `vmu.records.*` universe, read from the generated registry (read-only; never guessed). */
  function declaredUniverse() {
    try {
      const here = dirname(fileURLToPath(import.meta.url))
      const p = join(here, '..', 'settings', 'planned.js')
      const q = join(here, '..', 'settings', 'schema.js')
      const keys = new Set()
      if (existsSync(p)) for (const m of readFileSync(p, 'utf8').matchAll(/key: "(vmu\.records\.[^"]+)"/g)) keys.add(m[1])
      if (existsSync(q)) for (const m of readFileSync(q, 'utf8').matchAll(/'(vmu\.records\.[A-Za-z0-9_.]+)'/g)) keys.add(m[1])
      const all = [...keys].sort()
      return { source: 'settings/planned.js + settings/schema.js', declaredRecordsKeys: all.length, undocumented: all.filter((k) => !DECLARED_KEYS.includes(k)) }
    } catch (e) {
      return { source: 'error:' + String((e && e.message) || e), declaredRecordsKeys: DECLARED_KEYS.length, undocumented: [] }
    }
  }
  return api
}
