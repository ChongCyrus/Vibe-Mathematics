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
  [K.allowedKinds]: ['progress', 'route', 'decision', 'finding', 'lesson', 'state'],
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
export function createRecords({ clock = () => 0, log = null, settings = {}, bus = null, exists = null } = {}) {
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
  const headMaxItems = nat(sget(K.headMaxItems), DEFAULTS[K.headMaxItems])
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
  let seq = 0
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

    /** Create a record. Every cap is a NAMED refusal with 现值/上限; duplicates are COUNTED, never re-added. */
    put({ track, kind, title, body = '', tags = [], settled = false, permanent = false, by = null } = {}) {
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
      mark(enforced, K.headMaxItems)
      if (headMaxItems > 0 && liveIds(track).length >= headMaxItems) {
        mark(fired, K.headMaxItems)
        throw deny('VMU_QUOTA_EXCEEDED', 'track "' + track + '" is full: ' + liveIds(track).length + '/' + headMaxItems + ' live records (vmu.records.head.maxItems)',
          'compact or remove records, or raise vmu.records.head.maxItems — the ledger never evicts silently (vmu.records.head.maxItems)', [K.tracks, K.requireSettled, K.allowedKinds, K.headMaxItems], 'put')
      }
      const bodyText = String(body === undefined || body === null ? '' : body)
      const bytes = bytesOf(bodyText)
      mark(enforced, K.bodyCapBytes)
      if (bytes > bodyCapBytes) { mark(fired, K.bodyCapBytes); counters.bodyTruncated += 1; fire('records/body-truncated', { at: now(), bytes, cap: bodyCapBytes, mode: truncateMode }) }
      mark(enforced, K.retentionMaxBytes)
      if (retentionMaxBytes > 0 && trackBytes(track) + bytes > retentionMaxBytes) {
        mark(fired, K.retentionMaxBytes)
        if (trashCountInQuota) mark(enforced, K.trashCountInQuota)
        throw deny('VMU_QUOTA_EXCEEDED', 'track "' + track + '" would exceed its size budget: ' + (trackBytes(track) + bytes) + '/' + retentionMaxBytes + ' bytes (vmu.records.retention.maxBytes)',
          'compact/remove records, or raise vmu.records.retention.maxBytes — nothing is dropped silently' + (trashCountInQuota ? ' (trashed records count: vmu.records.trash.countInQuota=true)' : ' (trashed records do not count: vmu.records.trash.countInQuota=false)'), [K.tracks, K.requireSettled, K.allowedKinds, K.headMaxItems, K.bodyCapBytes, K.retentionMaxBytes], 'put')
      }
      // **去重**（同一键不得出现两次 ✗✓）：`slugMaxLength` 已在上一行整体 push ⇒ 截断时只标 `fired`（不重复进 enforced ✓）
      markAll(enforced, [K.slugPolicy, K.slugMaxLength, K.conflictSuffix])
      const slugged = slugify(title === undefined || title === null ? kind : title, slugPolicy, slugMaxLength)
      if (slugged.truncated) { counters.slugTruncated += 1; mark(fired, K.slugMaxLength) }
      if (slugged.truncated && enforced.indexOf(K.slugMaxLength) === -1) mark(enforced, K.slugMaxLength)
      const slugIndex = bySlug.get(track) || new Map()
      bySlug.set(track, slugIndex)
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
      const id = 'r-' + (++seq)
      const at = now()
      const rec = {
        id, track, kind: String(kind), title: candidate.title, slug, body: bodyText, tags: candidate.tags, bytes,
        fingerprint: fp, permanent: permanent === true, state: 'live', rev: 1, createdAt: at, updatedAt: at,
        by: by === null || by === undefined ? null : String(by), versions: [], trashedAt: null, purgeAt: null,
      }
      records.set(id, rec)
      order.push(id)
      trackList(track).push(id)
      slugIndex.set(slug, id)
      fpIndex.set(fp, id)
      counters.put += 1
      if (tierThreshold > 0) mark(enforced, K.tierThreshold)
      record_({ type: 'records/put', id, track, kind: rec.kind, slug, bytes, fingerprint: fp })
      say({ type: 'records/put', at, id, track, fingerprint: fp })
      fire('records/put', { id, track, fingerprint: fp })
      return { ok: true, deduplicated: false, id, slug, fingerprint: fp, bytes, tier: tierOf(rec, at), enforced: uniq(enforced), enforcedScope: ENFORCED_SCOPE, fired: uniq(fired), at }
    },

    /** READ a record (head + shaped body). The fingerprint is RECOMPUTED and compared (07 §4.2 spirit). */
    get({ id, includeBody = true } = {}) {
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
      const ids = track === null ? order.slice() : trackList(track).slice()
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

    /** Supersede (a new revision). A reason is mandatory; the versioning knobs shape what is stored. */
    supersede({ id, reason = null, by = null, title = null, body = null, tags = null } = {}) {
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
      counters.restored += 1
      record_({ type: 'records/restored', id: rec.id, by })
      return { ok: true, id: rec.id, state: 'live', enforced: [], enforcedScope: ENFORCED_SCOPE, fired: [] }
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
          headMaxItems, headListAt, headSort, noticeStyle, chunkedReturn, slugPolicy, slugMaxLength, conflictSuffix,
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
        at: now(),
        note: 'every key in `wired` changes an observable result (asserted by tests/vmu-records.test.mjs); `enforced[]` on a receipt lists the keys whose rule was EVALUATED for that call and `fired[]` the ones that changed its outcome — reading a key without changing behaviour would be a lie, so all 24 are wired here',
      }
    },
  }

  // ── helpers that keep the surface honest ───────────────────────────────────────────────────────────
  function uniq(arr) { return [...new Set(arr)].sort() }
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
