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
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
export const CORE_HEAD_FIELDS = Object.freeze(['id', 'track', 'kind', 'status', 'updatedAt', 'fingerprint'])

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
  [K.headFields]: ['id', 'track', 'kind', 'title', 'slug', 'status', 'owner', 'updatedAt', 'fingerprint'],
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
const DEFAULT_LIST_CAP = 200

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

/**
 * createRecords — the record-track projection. `store`/`library` are optional seams (persistence stays with
 * them, 07): this module owns the KNOBS and the accounting, never the durable layer.
 */
export function createRecords({ clock = () => 0, log = null, settings = {}, bus = null, exists = null, onProgress = null } = {}) {
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
  const unwired = new Map()
  const declaredTopics = new Set()
  const counters = {
    put: 0, deduplicated: 0, slugConflicts: 0, slugTruncated: 0, bodyTruncated: 0, bodyDroppedBytes: 0,
    versions: 0, versionsPruned: 0, compacted: 0, trashed: 0, purged: 0, restored: 0, tieredCold: 0,
    chunked: 0, lazyExpanded: 0, lists: 0, listTruncated: 0, listSuppressed: 0, headFieldTrimmed: 0, externalAttached: 0, externalVerified: 0,
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
    trashAdopted: 0, trashRestored: 0, tombstonesSeen: 0, staleTombstones: 0,
    lastWhy: null, lastDetail: null, lastPullAt: null, lastSyncAt: null,
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
  const view = (rec, { withBody = false, at = now(), count = false } = {}) => {
    const base = {
      id: rec.id, track: rec.track, kind: rec.kind, title: rec.title, slug: rec.slug, status: rec.state,
      owner: rec.by, updatedAt: rec.updatedAt, createdAt: rec.createdAt, rev: rec.rev, fingerprint: rec.fingerprint,
      bytes: rec.bytes, tags: rec.tags.slice(), tier: tierOf(rec, at), permanent: isPermanent(rec),
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
    datasetRegister({ track, title, path = null, fingerprint = null, parent = null, version = null, body = '', tags = [], settled = false, by = null } = {}) {
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
      const rec = this.put({ track, kind: 'dataset', title, body: body || meta, tags, settled, by })
      return Object.assign({}, rec, { dataset: { path, fingerprint, parent: parent === null ? null : String(parent), version: v, scheme },
        enforced: [...enforced, K.allowedKinds], enforcedScope: 'evaluated-so-far' })
    },

    /**
     * ROUND 278 (volume 16 §L166-168): file a rebuttal - one entry per review comment, pairing the comment with the response and the
     * change it caused. `vmu.review.rebuttalRequired` (default true) refuses an entry that files a comment without a response.
     */
    rebuttal({ track, title, comment = null, response = null, changeRef = null, body = '', tags = [], settled = false, by = null } = {}) {
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
      const rec = this.put({ track, kind: 'rebuttal', title, body: body || (String(comment) + '\n=> ' + String(response || '-') + '\n' + meta), tags, settled, by })
      return Object.assign({}, rec, { rebuttal: { comment: String(comment), response: hasResponse ? String(response) : null,
        changeRef: changeRef === null ? null : String(changeRef), responseRequired: required },
        enforced: [...enforced, K.allowedKinds], enforcedScope: 'evaluated-so-far' })
    },

    /** Create a record. Every cap is a NAMED refusal with 现值/上限; duplicates are COUNTED, never re-added. */
    put({ id: requestedId = null, track, kind, title, body = '', tags = [], settled = false, permanent = false, by = null } = {}) {
      // ★ ROUND 36: fold the fold BEFORE writing, because the write-through snapshot (kernel/index.js) replaces the
      // WHOLE `records` array with THIS instance's view. Without this, instance A's put would overwrite instance B's
      // rows - a lost update that no read-path fix could repair (the rows would be gone from the durable file).
      synchronize('put')
      const enforced = []
      const fired = []
      mark(enforced, K.tracks)
      if (!tracks.includes(track)) {
        mark(fired, K.tracks)
        throw deny('VMU_INVALID_ARGUMENT', 'unknown record track: ' + String(track) + ' (' + liveTrackNames().join('/') + ')',
          'vmu.records.tracks declares the tracks; a new track must be declared before it can hold records (vmu.records.tracks)', [K.tracks], 'put')
      }
      mark(enforced, K.requireSettled)
      if (requireSettled && settled !== true) {
        mark(fired, K.requireSettled)
        throw deny('VMU_STATE', 'track "' + track + '" only accepts SETTLED records (vmu.records.requireSettledRecords=true)',
          'pass settled: true once the record is final, or set vmu.records.requireSettledRecords=false (vmu.records.requireSettledRecords)', [K.tracks, K.requireSettled], 'put')
      }
      mark(enforced, K.allowedKinds)
      if (!allowedKinds.includes(kind)) {
        mark(fired, K.allowedKinds)
        throw deny('VMU_INVALID_ARGUMENT', 'kind "' + String(kind) + '" is not allowed (vmu.records.allowedKinds)',
          'allowed kinds: ' + allowedKinds.join(', ') + ' (vmu.records.allowedKinds)', [K.tracks, K.requireSettled, K.allowedKinds], 'put')
      }
      // ★ RUN 165 (measured): a put that UPDATEs an existing row of the same track does not add a row, so the head cap
      // does not apply to it. Before this, `paper start` (one state row, written twice: mint, then fold the id in) was
      // refused on its SECOND write whenever the track was exactly one below its cap — and the refusal left the minted
      // state row behind as a ghost that then held the free slot: the very repair (prune) the refusal recommends became
      // unactionable on the next call. An update is now recognised by id+track+live and exempted from the ADD caps.
      const existingRow = (requestedId === null || requestedId === undefined) ? null : (records.get(String(requestedId)) || null)
      const isUpdate = !!(existingRow && existingRow.state === 'live' && existingRow.track === track)
      mark(enforced, K.headMaxItems)
      const headMaxItems = headMaxItemsNow()
      if (!isUpdate && headMaxItems > 0 && liveIds(track).length >= headMaxItems) {
        mark(fired, K.headMaxItems)
        throw deny('VMU_QUOTA_EXCEEDED', 'track "' + track + '" is full: ' + liveIds(track).length + '/' + headMaxItems + ' live records (vmu.records.head.maxItems)',
          'this track is full. TWO reachable repairs: (1) call vibe_vmu_records {action:"prune", track:"<this track>", keep:<how many newest rows to keep>, why:"why these rows may go"} — the OLDEST rows move to the TRASH (restorable until purgeAt, vmu.records.trash.retainDays), and the ledger never evicts silently; (2) this limit is read at WRITE time, so raising it with vibe_v5_set {key:"vmu.records.head.maxItems", value:<bigger>, why:"why this track needs room"} takes effect on the NEXT put (no restart; the office is the writer of every vmu.records setting)', [K.tracks, K.requireSettled, K.allowedKinds, K.headMaxItems], 'put')
      }
      const bodyText = String(body === undefined || body === null ? '' : body)
      const bytes = bytesOf(bodyText)
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
      const slugged = slugify(title === undefined || title === null ? kind : title, slugPolicy, slugMaxLength)
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
      const candidate = { track, kind, title: title === undefined ? null : String(title), slug, body: bodyText, tags: listOf(tags, []), }
      const fp = fingerprintOf(candidate)
      const fpIndex = byFingerprint.get(track) || new Map()
      byFingerprint.set(track, fpIndex)
      if (fpIndex.has(fp)) {
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
      const rec = {
        id, track, kind: String(kind), title: candidate.title, slug, body: bodyText, tags: candidate.tags, bytes,
        fingerprint: fp, permanent: permanent === true, state: 'live', rev: 1, createdAt: at, updatedAt: at,
        by: by === null || by === undefined ? null : String(by), versions: [], trashedAt: null, purgeAt: null,
      }
      records.set(id, rec)
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
        try { onProgress({ id, track, kind, at, by: by === undefined ? null : by }) } catch { /* reported, never fatal */ }
      }
      return { ok: true, deduplicated: false, id, slug, fingerprint: fp, bytes, tier: tierOf(rec, at), enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired), at }
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
      return Object.assign({ ok: true, expanded: !head, mode: includeBody ? out.bodyMode : 'head', fingerprintOk, fingerprintRecomputed: recomputed, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired), at }, out)
    },

    /** READ a track's HEAD LIST — the default information channel (07 §4.4; `pointerPropagation` can mute it). */
    list({ track = null, limit = null, fields = null } = {}) {
      synchronize('list')   // ★ ROUND 36: the head list is the DEFAULT channel, so it must carry the whole root, not one instance
      const enforced = [K.tracks, K.headSort, K.headListAt, K.pointerPropagation, K.headFields]
      const fired = []
      const at = now()
      if (track !== null && !tracks.includes(track)) {
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
      let live = ids.map((i) => records.get(i)).filter((r) => r && r.state === 'live')
      live.sort((a, b) => headSort === 'title' ? String(a.title || '').localeCompare(String(b.title || '')) : (headSort === 'createdAt' ? a.createdAt - b.createdAt : a.updatedAt - b.updatedAt) || (a.id < b.id ? -1 : 1))
      const capWanted = Number.isInteger(limit) && limit >= 0 ? limit : headListAt
      if (!pointerPropagation) {
        mark(fired, K.pointerPropagation)
        return { ok: true, items: [], heads: [], count: 0, available: live.length, dropped: live.length, truncated: live.length > 0, suppressed: true, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired), at, note: 'vmu.records.pointerPropagation=false: the head list is muted (zero injection, the caller falls back verbatim)' }
      }
      const cap = capWanted === 0 ? live.length : capWanted
      const kept = live.slice(0, cap)
      const dropped = live.length - kept.length
      if (dropped > 0) mark(fired, K.headListAt)
      const items = kept.map((r) => projectView(r, chosen, at))
      return { ok: true, items, heads: items.map((x) => x.id), count: items.length, available: live.length, dropped, truncated: dropped > 0, suppressed: false, fields: chosen, sort: headSort, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired), at, note: 'the head list is the default information channel (docs/07 §4.4); truncation is COUNTED, never silent' }
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
          by: rec.by, state: 'trashed', trashedAt: rec.trashedAt, purgeAt: rec.purgeAt })
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
      rec.rev += 1
      rec.updatedAt = now()
      const fpIndex = byFingerprint.get(rec.track) || new Map()
      byFingerprint.set(rec.track, fpIndex)
      fpIndex.delete(rec.fingerprint)
      rec.fingerprint = fingerprintOf(rec)
      fpIndex.set(rec.fingerprint, rec.id)
      record_({ type: 'records/superseded', id: rec.id, rev: rec.rev, why: reason, mode: historyStoreMode })
      fire('records/superseded', { id: rec.id, rev: rec.rev, mode: historyStoreMode })
      return { ok: true, id: rec.id, rev: rec.rev, mode: historyStoreMode, changedKeys: Object.keys(changed), fingerprint: rec.fingerprint, enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired) }
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
          bytesByTrack: Object.fromEntries(tracks.map((t) => [t, trackBytes(t)])),
        },
        refusals: objOf(refusals), refusalsTotal: sumOf(refusals),
        unwired: objOf(unwired), unwiredTotal: sumOf(unwired),
        historyRows: historyRows.length, historyRingDropped: historyDropped.n,
        // ★ ROUND 36: the seam is part of the self-report, so "why did this instance see nothing?" is answerable from
        // status() alone (attached / pulls / pulled / refused + lastWhy), instead of only from a live failure.
        shared: sharedView(),
        at: now(),
        note: 'every key in `wired` changes an observable result (asserted by tests/vmu-records.test.mjs); `enforced[]` on a receipt lists the keys whose rule was EVALUATED for that call and `fired[]` the ones that changed its outcome — reading a key without changing behaviour would be a lie, so all 24 are wired here',
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
   * Fold the durable fold into this instance, INCREMENTALLY, before a read answers. Three rules make it safe to call
   * on every read:
   *   · it NEVER overwrites or deletes a row this instance already has (`records.has(id) ⇒ skip`): a local write that
   *     has not been snapshotted yet must not be lost to somebody else's older snapshot;
   *   · it NEVER writes: the durable snapshot stays the mutating instance's job;
   *   · it is CHEAP when nothing changed: the fold's row-id signature is compared first, so an unchanged fold costs one
   *     read of an already-open fold and ZERO `put` calls (the freshness check of docs/07 §1-(5)).
   * A store that is not open is a DEGRADED instance (it opens asynchronously and kernel/index.js retries hydration), so
   * the failure is COUNTED and ATTRIBUTED, never thrown and never silent.
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
          // a RESTORE elsewhere is the reverse statement: the fold says the row is live again, so this copy rejoins.
          held.state = 'live'
          held.trashedAt = null
          held.purgeAt = null
          const fpIdx = byFingerprint.get(held.track)
          if (fpIdx && held.fingerprint) fpIdx.set(held.fingerprint, held.id)
          const slugIdx = bySlug.get(held.track)
          if (slugIdx && held.slug) slugIdx.set(held.slug, held.id)
          shared.trashRestored += 1
          continue
        }
        // ★ LIVE RUN 129 (F-129a): A BODY REWRITE IS A CHANGE. The signature used to be the SET of row ids, so a row
        // another kernel REWROTE (supersede keeps the id) never reached this loop: the office's adopt read the draft as
        // it stood when this instance first saw it, so the co-design author the member kernel had just added was absent
        // from `authors` and adopt refused the very draft the run had just built together. The stored rows are HEADS with
        // no stamp, so the comparison is on CONTENT: a differing row is a rewrite this instance has not seen, and the
        // fold is the shared copy every instance pushes into.
        if (rowContentStamp(row) !== rowContentStamp(held)) {
          const prevFp = held.fingerprint
          const fpIndex = byFingerprint.get(held.track)
          if (fpIndex && prevFp) fpIndex.delete(prevFp)
          held.title = row.title !== undefined && row.title !== null ? String(row.title) : held.title
          held.body = String(row.body)
          held.bytes = bytesOf(held.body)
          if (Array.isArray(row.tags)) held.tags = listOf(row.tags, held.tags)
          if (Number.isInteger(row.rev) && row.rev > held.rev) held.rev = row.rev
          // The stored row is a HEAD (id/track/kind/title/body/tags/by): it carries no stamp, so the fold cannot tell us
          // WHEN it was rewritten — only THAT its content differs. The fold is the shared copy every instance pushes
          // into, so a differing content is a rewrite this instance has not seen; the local copy is updated now and the
          // local stamp moves with it (a reader asking "when did I last see this change" must not read the old time).
          held.updatedAt = now()
          const writer = row.by !== undefined && row.by !== null ? row.by : (row.owner !== undefined && row.owner !== null ? row.owner : null)
          if (writer !== null) held.by = String(writer)
          held.fingerprint = fingerprintOf(held)
          if (fpIndex) fpIndex.set(held.fingerprint, held.id)
          refreshed += 1
        }
        continue                                            // ★ never DELETE what this instance knows; a newer body is adopted above
      }
      if (row.state === 'trashed') {
        // ★★ RUN 166: a TOMBSTONE is not a record to adopt — it says a row this instance does not hold is (still) not
        // live. Adopting it as a live row would be the very resurrection the tombstone exists to prevent; adopting it as
        // a local trash row would invent an object this instance never had. It is COUNTED and skipped.
        shared.tombstonesSeen += 1
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
        putInternal.call(api, { id, track: row.track, kind: row.kind, title: row.title, body: row.body, tags: row.tags, settled: true,
          // the writer is carried by `by` on the row; `owner` is accepted as well because that is the name the VIEW
          // exposes it under (a snapshot that copies the view - kernel/index.js does - can only carry `owner`).
          by: writer === null ? null : String(writer) })
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
   * The fold's visible change signature: the SET of row ids. The writer replaces the whole array, so the id set changes
   * exactly when the rows do; a body-only rewrite of a row that this instance ALREADY has is deliberately not adopted
   * (rule 1 above: this instance's copy wins for ids it already holds).
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
      refreshedMeans: 'rows THIS instance already held whose stored copy was rewritten by another kernel and was newer: the local copy is replaced by the newer body (a supersede keeps the id, so an id-set signature could never see it). Read a decision that depends on the CURRENT body (blueprint adopt, card gates) after this count moves, instead of trusting the row this instance first loaded',
      scope: 'this-kernel-instance',
      scopeMeans: 'these counters belong to THIS kernel: they count the folds THIS process has performed. Another kernel over the same store folds its own copy, so two kernels may legitimately report different `pulls`/`adoptedWithoutAuthor` for the same durable ledger — the shared fact is the store key, not this number',
      adoptedWithoutAuthor: shared.adoptedNoAuthor,
      adoptedWithoutAuthorMeans: 'rows adopted from the durable fold whose row did not name its writer: their `owner` reads null because the ROW did not say, not because nobody wrote it. This counter is the difference between that reading and no adoption at all',
      trashAdopted: shared.trashAdopted,
      trashAdoptedMeans: 'rows THIS instance was holding live that another kernel moved to the TRASH: the tombstone travelled in the fold and this copy stopped counting them as live (pruning in one member turn frees the slot in every other turn)',
      trashRestored: shared.trashRestored,
      trashRestoredMeans: 'rows THIS instance was holding trashed that another kernel RESTORED: the fold said live again and this copy rejoined',
      tombstonesSeen: shared.tombstonesSeen,
      tombstonesSeenMeans: 'tombstones for ids this instance never held: counted so a reader can tell "nothing was pruned" from "nothing I know about was pruned"',
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
