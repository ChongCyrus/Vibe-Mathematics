// vmu kernel · idempotency — the K6 ledger: a replayed or retried request must not take effect twice.
//
// Design source: docs/07-durability-library.md §4.2 (content identity is computed in ONE place, and the stored
// fingerprint is read back rather than recomputed) and 03-§8 (`VMU_IDEMPOTENCY_KEY_REUSED`). This module does
// NOT redefine the library's record fingerprint: it computes a REQUEST fingerprint (a TYPE-TAGGED canonical
// encoding of the payload) which is a different concern — 07 identifies *content*, this identifies *a request*.
//
// ── ROUND 8 FIXES (three measured bypasses) ─────────────────────────────────────────────────────────────
//   B1 TYPE-TAGGED CANONICAL ENCODING (canonicalVersion 2): `NaN`, `null`, `Infinity`, `undefined`, `-0`,
//      bigint and strings can no longer collide (`{x:NaN}` ≠ `{x:null}`, `undefined` ≠ `"undefined"`,
//      `-0` ≠ `0`, `10n` ≠ `"10"`). Payloads that are NOT JSON-safe (functions, symbols, cyclic graphs,
//      class instances, Map/Set/Date, …) are refused BY NAME instead of being silently flattened.
//   B2 SCOPE IS PART OF THE IDENTITY: the ledger key is `scope + '\u0000' + key`, so `meeting:A/close` and
//      `meeting:B/close` are DIFFERENT entries (before the fix they collided and falsely reported
//      `VMU_IDEMPOTENCY_KEY_REUSED`). When a bare `key` is ambiguous across scopes the call is refused with
//      the candidate scopes listed — no silent guess.
//   B3 THE ABORT→RETRY PAYLOAD RULE IS EXPLICIT: invariant ① (a reused key with another payload is refused)
//      applies to COMMITTED keys. For an ABORTED key the default `retrySamePayloadOnly=true` demands the
//      SAME payload (a different one ⇒ `VMU_IDEMPOTENCY_KEY_REUSED`); setting it to false makes the retry a
//      NEW attempt, which is then self-disclosed as `retryIsNewAttempt:true` (+ `payloadChanged` in the audit).
//
// ── N2 PERSISTENCE PROJECTION (optional injected store seam) ─────────────────────────────────────────────
//   With a `store` (kernel/store.js, the 07 durability layer) the ledger is persisted under one key and
//   reloaded lazily: the same payload replayed AFTER A RESTART still deduplicates. `status().durable` says
//   plainly whether that is actually true (true = the seam is wired and the last write succeeded; false =
//   memory-only, with `durableReason`). A broken seam degrades to memory and is COUNTED — it never crashes
//   and never pretends to be durable.
//
// Invariants shared with the rest of the kernel:
//   · every refusal is NAMED (VMU_* + hint) — never a bare exception
//   · every upper bound reports how many items were DROPPED — never silent (list/history/reap)
//   · zero mechanism: with no keys used, every READ answers empty and nothing throws
//   · the only time source is the injected `clock`; the only digest is node:crypto sha256 (no randomness)
//   · READ paths (lookup/list/history/status/fingerprintOf) never mutate the ledger
// SETTINGS READ CONVENTION (kernel/guard.js): every key is read as a PLAIN LITERAL — the settings table and the
// docs audit both discover "wired" keys by scanning file text for the literal.
import { createHash } from 'node:crypto'

export const apiVersion = 1
/** Version of the canonical encoding. It is part of every fingerprint, so v1 and v2 can never be confused. */
export const CANONICAL_VERSION = 2
/** The durable projection key inside the injected store (docs/07 §6 layout). */
export const LEDGER_KEY = 'idempotency'

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

const K_MAX_ENTRIES = 'vmu.idempotency.maxEntries'
const K_TTL = 'vmu.idempotency.ttlMs'
const K_PENDING_TIMEOUT = 'vmu.idempotency.pendingTimeoutMs'
const K_SCOPE_DEFAULT = 'vmu.idempotency.scopeDefault'
const K_ABORT_REASON = 'vmu.idempotency.abortNeedsReason'
const K_RETRY_AFTER_ABORT = 'vmu.idempotency.retryAfterAbort'
const K_RETRY_SAME_PAYLOAD = 'vmu.idempotency.retrySamePayloadOnly'
const K_MAX_PAYLOAD = 'vmu.idempotency.maxPayloadBytes'
const K_KEY_SCOPE = 'vmu.workflow.idempotencyKeyScope'   // the 08-doc spelling, read as a scope fallback

/** A stable content checksum for a projection (round 9 / M3: an unverifiable document is never loaded). */
export function checksumOf(value) {
  return createHash('sha256').update(canonicalize(value === undefined ? null : value), 'utf8').digest('hex')
}

const STATES = Object.freeze(['pending', 'committed', 'aborted'])
const DEFAULT_LIST_CAP = 200
const PREVIEW_CAP = 400
const IDENTITY_RULE = 'len(scope):scope len(key):key'

/**
 * The TYPE-TAGGED canonical encoding (B1). Every value carries its kind, so two different values can never
 * produce the same string:
 *   undefined → `u`        null → `z`         true/false → `t`/`f`
 *   number    → `n:<repr>` (`n:nan`, `n:inf`, `n:-inf`, `n:-0`, else shortest round-trip `String(v)`)
 *   bigint    → `g:<digits>`
 *   string    → `s:` + JSON.stringify(v)
 *   array     → `a:[…]`    plain object → `o:{s:"k":…,…}` (keys sorted)
 * A payload that is NOT JSON-safe (function, symbol, cyclic graph, class instance, Map/Set/Date/RegExp …) is
 * REFUSED by name: a ledger that silently flattened such a payload is exactly how a false "same request" is born.
 */
export function canonicalize(value) {
  const seen = new Set()
  const unsafe = (why, path) => refuse('VMU_INVALID_ARGUMENT', 'the payload could not be read at ' + path + ': ' + why,
    'the idempotency fingerprint must READ the whole request — an object whose getter/Proxy throws cannot be fingerprinted; pass plain data')
  const walk = (v, path) => {
    if (v === undefined) return 'u'
    if (v === null) return 'z'
    const t = typeof v
    if (t === 'boolean') return v ? 't' : 'f'
    if (t === 'number') {
      if (Number.isNaN(v)) return 'n:nan'
      if (v === Infinity) return 'n:inf'
      if (v === -Infinity) return 'n:-inf'
      if (Object.is(v, -0)) return 'n:-0'
      return 'n:' + String(v)
    }
    if (t === 'bigint') return 'g:' + v.toString()
    if (t === 'string') return 's:' + JSON.stringify(v)
    if (t === 'function' || t === 'symbol') {
      throw refuse('VMU_INVALID_ARGUMENT', 'the payload is not JSON-safe: ' + t + ' at ' + path,
        'an idempotency fingerprint must represent the REQUEST faithfully — pass the serialisable data, or a stable id for the rest')
    }
    if (Array.isArray(v)) {
      if (seen.has(v)) throw refuse('VMU_INVALID_ARGUMENT', 'the payload contains a cycle at ' + path, 'an idempotency fingerprint cannot encode a cyclic structure')
      seen.add(v)
      // Every read is wrapped: a throwing getter or Proxy trap becomes a NAMED refusal that says WHERE it
      // happened — a bare `boom` must never escape the ledger (round 9).
      let items
      try { items = v.map((x, i) => walk(x, path + '[' + i + ']')) } catch (e) { if (e && e.code) throw e; throw unsafe(String((e && e.message) || e), path) }
      seen.delete(v)
      return 'a:[' + items.join(',') + ']'
    }
    if (t === 'object') {
      let proto
      try { proto = Object.getPrototypeOf(v) } catch (e) { throw unsafe(String((e && e.message) || e), path) }
      if (proto !== Object.prototype && proto !== null) {
        let name = 'unknown'
        try { name = (v.constructor && v.constructor.name) || 'unknown' } catch (e) { name = 'unknown' }
        throw refuse('VMU_INVALID_ARGUMENT', 'the payload is not JSON-safe: ' + name + ' instance at ' + path,
          'only plain objects/arrays/primitives/bigint are accepted — serialise ' + name + ' first (e.g. toISOString(), [...map])')
      }
      if (seen.has(v)) throw refuse('VMU_INVALID_ARGUMENT', 'the payload contains a cycle at ' + path, 'an idempotency fingerprint cannot encode a cyclic structure')
      seen.add(v)
      let keys
      try { keys = Object.keys(v) } catch (e) { throw unsafe(String((e && e.message) || e), path) }
      const parts = []
      for (const k of keys.sort()) {
        let child
        try { child = v[k] } catch (e) { throw unsafe(String((e && e.message) || e), path + '.' + k) }
        parts.push('s:' + JSON.stringify(k) + ':' + walk(child, path + '.' + k))
      }
      seen.delete(v)
      return 'o:{' + parts.join(',') + '}'
    }
    throw refuse('VMU_INVALID_ARGUMENT', 'the payload holds an unsupported value (' + t + ') at ' + path, 'pass JSON-safe data')
  }
  try {
    return 'v' + CANONICAL_VERSION + '|' + walk(value, '$')
  } catch (e) {
    if (e && e.code) throw e
    throw unsafe(String((e && e.message) || e), '$')
  }
}

/**
 * createIdempotency — the K6 ledger. `store` (kernel/store.js) is an OPTIONAL durability seam: with it the
 * ledger survives a restart; without it the ledger is memory-only and says so (`status().durable === false`).
 */
export function createIdempotency({ clock = () => 0, log = null, settings = {}, bus = null, store = null } = {}) {
  if (typeof clock !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createIdempotency needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
  }

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (event) => {
    if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* logging must never break the ledger it records */ } }
  }

  const maxEntries = nonNegInt(sget(K_MAX_ENTRIES, 1000), 1000)
  const ttlMs = nonNegInt(sget(K_TTL, 0), 0)
  const pendingTimeoutMs = nonNegInt(sget(K_PENDING_TIMEOUT, 0), 0)
  const scopeDefaultRaw = sget(K_SCOPE_DEFAULT, null)
  const keyScope = sget(K_KEY_SCOPE, 'session')
  const scopeDefault = typeof scopeDefaultRaw === 'string' && scopeDefaultRaw
    ? scopeDefaultRaw
    : (typeof keyScope === 'string' && keyScope ? keyScope : 'session')
  const abortNeedsReason = sget(K_ABORT_REASON, true) !== false
  const retryAfterAbort = sget(K_RETRY_AFTER_ABORT, true) !== false
  // B3: the default demands the SAME payload on a retry; setting it to false makes the retry a NEW attempt,
  // which is then disclosed as `retryIsNewAttempt:true` (and audited as `payloadChanged`).
  const retrySamePayloadOnly = sget(K_RETRY_SAME_PAYLOAD, true) !== false
  const maxPayloadBytes = nonNegInt(sget(K_MAX_PAYLOAD, 0), 0)

  function nonNegInt(v, def) { return Number.isInteger(v) && v >= 0 ? v : def }

  // ── state (mutated only by begin/commit/abort/reap) ────────────────────────────────────────────────
  const entries = new Map()   // IDENT (scope \0 key) -> entry  ← B2: scope is part of the identity
  const order = []            // idents in insertion order
  const historyRows = []
  const droppedHistory = { n: 0 }
  const refusals = new Map()
  const unwired = new Map()
  const declaredTopics = new Set()
  const counts = { begun: 0, committed: 0, aborted: 0, deduplicated: 0, reaped: 0, dropped: 0, refusedAtCap: 0, retried: 0, retriedWithNewPayload: 0 }
  const ident = (scope, key) => String(scope).length + ':' + String(scope) + String(key).length + ':' + String(key)
  let loaded = false
  let loadOk = false          // did the LAST full read succeed?
  let loadAttempted = false
  let lastPatchOk = null      // null = never attempted, true/false = the LAST write
  let durableDegraded = false // STICKY: cleared only by a complete read+write cycle (round 9 / M3)
  let durableReason = store && typeof store.read === 'function' ? 'not loaded yet' : 'no store seam was injected'
  let lastPersistAt = null
  let lastPersistError = null
  let loadError = null

  const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by)
  const objOf = (map) => { const o = {}; for (const k of [...map.keys()].sort()) o[k] = map.get(k); return o }
  const sumOf = (map) => [...map.values()].reduce((a, b) => a + b, 0)
  const now = () => clock()
  const isExpired = (e, at = now()) => typeof e.expiresAt === 'number' && at >= e.expiresAt
  const isStalePending = (e, at = now()) => e.state === 'pending' && pendingTimeoutMs > 0 && at - e.startedAt >= pendingTimeoutMs

  const deny = (code, message, hint) => {
    bump(refusals, code, 1)
    say({ type: 'idempotency/refused', at: now(), code, message })
    return refuse(code, message, hint)
  }
  const record_ = (row) => {
    historyRows.push(Object.assign({ at: now() }, row))
    while (historyRows.length > DEFAULT_LIST_CAP) { historyRows.shift(); droppedHistory.n += 1 }
  }
  const fire = (hook, payload) => {
    if (!bus || typeof bus.emit !== 'function') { bump(unwired, 'bus:' + hook, 1); return }
    try {
      if (!declaredTopics.has(hook) && typeof bus.declareTopic === 'function') { bus.declareTopic(hook); declaredTopics.add(hook) }
      bus.emit(hook, Object.assign({ at: now() }, payload))
      declaredTopics.add(hook)
    } catch (e) {
      bump(unwired, 'bus:' + hook, 1)
      say({ type: 'idempotency/hook-unwired', at: now(), hook, why: String((e && e.message) || e) })
    }
  }

  // ── N2: the durability projection (optional store seam) ────────────────────────────────────────────
  const rows = () => order.map((i) => entries.get(i)).filter(Boolean).map((e) => ({
    scope: e.scope, key: e.key, state: e.state, payloadFingerprint: e.payloadFingerprint, payloadCanon: e.payloadCanon,
    attempts: e.attempts, startedAt: e.startedAt, expiresAt: e.expiresAt, committedAt: e.committedAt,
    result: e.result === undefined ? null : e.result, abortedAt: e.abortedAt, abortReason: e.abortReason, by: e.by,
  }))
  const projection = () => ({ version: CANONICAL_VERSION, savedAt: now(), checksum: checksumOf(rows()), entries: rows() })
  const persist = () => {
    if (!store || typeof store.patch !== 'function') {
      durableReason = 'no store seam was injected (the ledger is memory-only)'
      return { ok: true, durable: false, reason: durableReason, rows: rows().length }
    }
    try {
      store.patch(LEDGER_KEY, () => projection())
      lastPersistAt = now()
      lastPersistError = null
      lastPatchOk = true
      // M3: a successful WRITE alone must never be read as "we have durability" — the degraded verdict is
      // cleared ONLY when the store has also been read back successfully in this lifetime (loadOk).
      if (loadOk) {
        durableDegraded = false
        durableReason = 'persisted and verified through the injected store'
      } else {
        durableReason = 'the write succeeded, but the store was never read back successfully'
          + (loadError ? ' (' + loadError + ')' : '') + ' — durability is NOT established'
      }
      return { ok: true, durable: isDurable(), rows: rows().length, at: lastPersistAt }
    } catch (e) {
      durableDegraded = true
      lastPatchOk = false
      lastPersistError = String((e && e.message) || e)
      durableReason = 'the store refused the projection: ' + lastPersistError
      bump(unwired, 'store-seam', 1)
      say({ type: 'idempotency/store-unwired', at: now(), why: lastPersistError })
      return { ok: false, durable: false, error: lastPersistError, rows: rows().length }
    }
  }
  /** The ONE truthful durability verdict: seam wired + read verified + last write ok + not degraded. */
  const isDurable = () => !!(store && typeof store.read === 'function' && typeof store.patch === 'function' && loadOk && loadAttempted && lastPatchOk === true && !durableDegraded)
  /** Read the projection back. `force` re-reads (this is how a repaired store clears a degraded verdict). */
  const load = ({ force = false } = {}) => {
    if (loaded && !force) return { ok: loadOk, skipped: true }
    loaded = true
    loadAttempted = true
    if (!store || typeof store.read !== 'function') { durableReason = 'no store seam was injected (the ledger is memory-only)'; return { ok: false, noSeam: true } }
    let doc = null
    try {
      doc = store.read(LEDGER_KEY)
      loadOk = true
      loadError = null
    } catch (e) {
      loadOk = false
      loadError = String((e && e.message) || e)
      durableDegraded = true
      durableReason = 'the store could not be read: ' + loadError
      bump(unwired, 'store-seam', 1)
      say({ type: 'idempotency/store-unwired', at: now(), why: durableReason })
      return { ok: false, error: loadError }
    }
    // A projection must be VERSIONED and CHECKSUMMED: an unverifiable document is not loaded into a safety
    // ledger (it is counted and the ledger stays degraded) — silent half-loading is exactly what M3 warned about.
    if (doc === null || doc === undefined) { durableReason = 'the store is empty (nothing to replay)'; durableDegraded = true; return { ok: true, empty: true } }
    let entries_ = null
    if (Array.isArray(doc)) {
      entries_ = doc
      bump(unwired, 'store-no-checksum', 1)
      durableReason = 'the stored projection had no version/checksum: it was NOT loaded (unverifiable)'
      durableDegraded = true
      say({ type: 'idempotency/store-unwired', at: now(), why: durableReason })
      return { ok: false, unverifiable: true }
    }
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.entries)) {
      bump(unwired, 'store-corrupt-doc', 1)
      durableReason = 'the store held an unrecognised projection shape'
      durableDegraded = true
      say({ type: 'idempotency/store-unwired', at: now(), why: durableReason })
      return { ok: false, corrupt: true }
    }
    if (doc.version !== CANONICAL_VERSION) {
      bump(unwired, 'store-version-mismatch', 1)
      durableReason = 'the stored projection is version ' + String(doc.version) + ' but this ledger writes version ' + CANONICAL_VERSION + ': NOT loaded'
      durableDegraded = true
      say({ type: 'idempotency/store-unwired', at: now(), why: durableReason })
      return { ok: false, versionMismatch: true }
    }
    const sum = checksumOf(doc.entries)
    if (typeof doc.checksum !== 'string' || doc.checksum !== sum) {
      bump(unwired, 'store-checksum-mismatch', 1)
      durableReason = 'the stored projection failed its checksum (' + String(doc.checksum) + ' != ' + sum + '): NOT loaded'
      durableDegraded = true
      say({ type: 'idempotency/store-unwired', at: now(), why: durableReason })
      return { ok: false, checksumMismatch: true }
    }
    const persisted = doc.entries
    let skipped = 0
    const seenInDoc = new Set()
    for (const row of persisted) {
      if (!row || typeof row.key !== 'string' || typeof row.scope !== 'string' || typeof row.state !== 'string' || !STATES.includes(row.state)) { skipped += 1; continue }
      const i = ident(row.scope, row.key)
      if (seenInDoc.has(i)) { skipped += 1; continue }   // a duplicate INSIDE the document is corruption
      seenInDoc.add(i)
      if (entries.has(i)) continue                       // a re-read of data we already hold is not corruption
      entries.set(i, {
        key: row.key, scope: row.scope, state: row.state,
        payloadFingerprint: typeof row.payloadFingerprint === 'string' ? row.payloadFingerprint : null,
        payloadCanon: typeof row.payloadCanon === 'string' ? row.payloadCanon : null,
        attempts: Number.isInteger(row.attempts) ? row.attempts : 1,
        startedAt: Number.isFinite(row.startedAt) ? row.startedAt : now(),
        expiresAt: Number.isFinite(row.expiresAt) ? row.expiresAt : null,
        committedAt: Number.isFinite(row.committedAt) ? row.committedAt : null,
        result: row.result === undefined ? null : row.result,
        abortedAt: Number.isFinite(row.abortedAt) ? row.abortedAt : null,
        abortReason: row.abortReason === undefined ? null : row.abortReason,
        by: row.by === undefined ? null : row.by,
      })
      order.push(i)
    }
    if (skipped) {
      bump(unwired, 'store-corrupt-row', skipped)
      durableReason = 'loaded ' + order.length + ' entries; ' + skipped + ' malformed row(s) were SKIPPED and counted'
      durableDegraded = true   // a partially readable projection is NOT a healthy one
      say({ type: 'idempotency/store-unwired', at: now(), why: durableReason })
      return { ok: false, skipped }
    }
    durableReason = 'loaded ' + order.length + ' verified entries from the store'
    say({ type: 'idempotency/loaded', at: now(), entries: order.length, skipped: 0 })
    return { ok: true, entries: order.length }
  }
  /** Lazy load: a restart with the same store replays the settled keys (this is the whole point of N2). */
  const ensureLoaded = () => { if (!loaded) load() }
  /** Resolve an entry by (scope, key). B2: a bare key that is ambiguous across scopes is REFUSED, not guessed. */
  const resolve = (scope, key, { required = false } = {}) => {
    if (typeof key !== 'string' || !key.trim()) throw deny('VMU_INVALID_ARGUMENT', 'a non-empty string `key` is required', 'the key is the idempotency identity: e.g. { key: "task-create:t-3" }')
    if (scope !== null && scope !== undefined && scope !== '') return entries.get(ident(scope, key)) || null
    const matches = order.map((i) => entries.get(i)).filter((e) => e && e.key === key)
    if (matches.length === 0) return null
    if (matches.length === 1) return matches[0]
    throw deny('VMU_INVALID_ARGUMENT', 'the key "' + key + '" exists in several scopes: ' + matches.map((e) => e.scope).sort().join(', '),
      'pass `scope` to say which one you mean — the ledger identity is scope+key (a bare key that matches more than one scope is refused, never guessed)')
  }
  const view = (e, at = now()) => ({
    ref: e.scope + '/' + e.key, key: e.key, scope: e.scope, state: e.state,
    settled: e.state === 'committed',
    payloadFingerprint: e.payloadFingerprint, attempts: e.attempts,
    startedAt: e.startedAt, committedAt: e.committedAt, abortedAt: e.abortedAt, abortReason: e.abortReason,
    expiresAt: e.expiresAt, expired: isExpired(e, at), stalePending: isStalePending(e, at),
    result: e.state === 'committed' ? e.result : null,
  })
  /** Compare two canonical payloads and say WHERE they differ (invariant ① must be diagnosable). */
  const payloadDiff = (aCanon, bCanon) => {
    const a = typeof aCanon === 'string' ? aCanon : ''
    const b = typeof bCanon === 'string' ? bCanon : ''
    const n = Math.min(a.length, b.length)
    let firstDiffAt = -1
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) { firstDiffAt = i; break }
    if (firstDiffAt === -1 && a.length !== b.length) firstDiffAt = n
    let changedKeys = []
    try {
      const wa = a.split('|')[1] || ''
      const wb = b.split('|')[1] || ''
      const keysOf = (t) => [...new Set([...t.matchAll(/s:"([^"]+)":/g)].map((m) => m[1]))].sort()
      const ka = keysOf(wa); const kb = keysOf(wb)
      changedKeys = [...new Set(ka.concat(kb))].sort().filter((k) => {
        const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const va = (wa.match(new RegExp('s:"' + esc + '":([^,}]*)')) || [])[1]
        const vb = (wb.match(new RegExp('s:"' + esc + '":([^,}]*)')) || [])[1]
        return va !== vb
      })
    } catch (e) { /* the byte-level diff above is always available */ }
    return {
      firstDiffAt, lengths: [a.length, b.length], changedKeys,
      expected: a.length > PREVIEW_CAP ? a.slice(0, PREVIEW_CAP) + '…' : a,
      actual: b.length > PREVIEW_CAP ? b.slice(0, PREVIEW_CAP) + '…' : b,
      truncated: a.length > PREVIEW_CAP || b.length > PREVIEW_CAP,
    }
  }
  const fingerprint = (canon) => createHash('sha256').update(canon, 'utf8').digest('hex')
  const canonicalOf = (payload) => {
    let canon
    try { canon = canonicalize(payload) } catch (e) { throw deny(e.code || 'VMU_INVALID_ARGUMENT', e.message, e.hint) }
    if (maxPayloadBytes > 0 && canon.length > maxPayloadBytes) {
      throw deny('VMU_INVALID_ARGUMENT', 'the payload is too large for an idempotency fingerprint: ' + canon.length + '/' + maxPayloadBytes + ' bytes (vmu.idempotency.maxPayloadBytes)',
        'fingerprint a digest or an id instead of the whole payload, or raise vmu.idempotency.maxPayloadBytes')
    }
    return canon
  }
  const refuseReused = (e, canon, fp, where) => {
    const diff = payloadDiff(e.payloadCanon, canon)
    return deny('VMU_IDEMPOTENCY_KEY_REUSED',
      'key "' + (e.scope + '/' + e.key) + '" was already ' + where + ' with a DIFFERENT payload: expected ' + e.payloadFingerprint + ' but got ' + fp,
      'first difference at byte ' + diff.firstDiffAt + ' (lengths ' + diff.lengths[0] + '/' + diff.lengths[1] + ')' +
      (diff.changedKeys.length ? ', changed keys: ' + diff.changedKeys.join(', ') : '') +
      ' — a reused key with a new payload is a bug in the caller, not a retry')
  }

  const api = {
    apiVersion,

    /**
     * Whether the projection is durable RIGHT NOW. Three separate facts are exposed (round 9 / M3):
     * `durable` (the verdict), `loaded` (the last full read), `lastPatchOk` (the last write) — a successful
     * write after a failed load must never be reported as durability.
     */
    durable() {
      ensureLoaded()
      return {
        ok: true, durable: isDurable(), loaded: loadOk, loadAttempted, lastPatchOk,
        degraded: durableDegraded, reason: durableReason, loadError,
        lastWriteAt: lastPersistAt, lastError: lastPersistError, at: now(),
      }
    },

    /** Explicitly write the projection (also happens automatically after every mutation). */
    persist() { ensureLoaded(); return persist() },

    /** Re-read the projection. A degraded verdict clears only after a successful re-read AND a write. */
    reload() { const r = load({ force: true }); return Object.assign({ ok: r.ok !== false, durable: isDurable(), loaded: loadOk, loadAttempted, lastPatchOk, degraded: durableDegraded, reason: durableReason, loadError }, r) },

    /** Start (or observe) a request under `key` inside `scope`. Same identity + same payload ⇒ the stored result. */
    begin({ key, scope = null, payload = null, by = null } = {}) {
      ensureLoaded()
      const sc = scope === null || scope === undefined || scope === '' ? scopeDefault : String(scope)
      const canon = canonicalOf(payload)
      const fp = fingerprint(canon)
      const existing = resolve(sc, key)
      if (existing) {
        if (existing.state === 'pending') {
          say({ type: 'idempotency/in-flight', at: now(), key: existing.key, scope: existing.scope, state: 'pending' })
          return {
            ok: true, ref: existing.scope + '/' + existing.key, key: existing.key, scope: existing.scope,
            state: 'pending', reused: true, inFlight: true, deduplicated: false, settled: false,
            payloadFingerprint: fp, startedAt: existing.startedAt, attempts: existing.attempts,
            note: 'the same key is still IN FLIGHT: do not execute — a pending key is not a success (K6)',
          }
        }
        if (existing.state === 'committed') {
          if (existing.payloadFingerprint === fp) {
            counts.deduplicated += 1
            record_({ type: 'idempotency/deduplicated', key: existing.key, scope: existing.scope, fingerprint: fp })
            say({ type: 'idempotency/deduplicated', at: now(), key: existing.key, scope: existing.scope, fingerprint: fp })
            fire('idempotency/deduplicated', { key: existing.key, scope: existing.scope, fingerprint: fp })
            return {
              ok: true, ref: existing.scope + '/' + existing.key, key: existing.key, scope: existing.scope,
              state: 'committed', reused: true, deduplicated: true, settled: true,
              payloadFingerprint: fp, result: existing.result, committedAt: existing.committedAt,
              note: 'this request was already committed: the stored result is returned and nothing is executed',
            }
          }
          throw refuseReused(existing, canon, fp, 'committed')
        }
        if (existing.state === 'aborted') {
          if (!retryAfterAbort) {
            throw deny('VMU_STATE', 'key "' + existing.scope + '/' + existing.key + '" was aborted and vmu.idempotency.retryAfterAbort=false: it may not be retried',
              'use a fresh key, or set vmu.idempotency.retryAfterAbort=true')
          }
          // B3: the payload rule for a retry is EXPLICIT (same payload by default).
          const payloadChanged = existing.payloadFingerprint !== fp
          if (payloadChanged && retrySamePayloadOnly) throw refuseReused(existing, canon, fp, 'aborted')
          existing.attempts += 1
          existing.state = 'pending'
          existing.payloadFingerprint = fp
          existing.payloadCanon = canon
          existing.startedAt = now()
          existing.expiresAt = ttlMs > 0 ? now() + ttlMs : null
          existing.by = by === null || by === undefined ? existing.by : String(by)
          counts.begun += 1
          counts.retried += 1
          if (payloadChanged) counts.retriedWithNewPayload += 1
          record_({ type: 'idempotency/retried', key: existing.key, scope: existing.scope, attempt: existing.attempts, fingerprint: fp, payloadChanged, why: existing.abortReason })
          say({ type: 'idempotency/retried', at: now(), key: existing.key, scope: existing.scope, attempt: existing.attempts, payloadChanged })
          persist()
          return {
            ok: true, ref: existing.scope + '/' + existing.key, key: existing.key, scope: existing.scope,
            state: 'pending', reused: true, retried: true, inFlight: true, settled: false,
            attempt: existing.attempts, payloadFingerprint: fp, payloadChanged,
            retryIsNewAttempt: !retrySamePayloadOnly || payloadChanged,
            retrySamePayloadOnly,
            note: 'the previously aborted key is retried (attempt ' + existing.attempts + ')' +
              (payloadChanged ? ' — THE PAYLOAD CHANGED: this is a NEW attempt, not a replay (vmu.idempotency.retrySamePayloadOnly=false)' : ''),
          }
        }
      }
      if (maxEntries > 0 && entries.size >= maxEntries) {
        counts.refusedAtCap += 1
        throw deny('VMU_RESOURCE_BUDGET', 'the idempotency ledger is full: ' + entries.size + '/' + maxEntries + ' keys (vmu.idempotency.maxEntries)',
          'reap() settled keys (they are kept for replay, not forever), or raise vmu.idempotency.maxEntries — the ledger never evicts silently')
      }
      const e = {
        key: String(key), scope: sc,
        state: 'pending', payloadFingerprint: fp, payloadCanon: canon,
        attempts: 1, startedAt: now(), expiresAt: ttlMs > 0 ? now() + ttlMs : null,
        committedAt: null, result: null, abortedAt: null, abortReason: null,
        by: by === null || by === undefined ? null : String(by),
      }
      const i = ident(sc, e.key)
      entries.set(i, e)
      order.push(i)
      counts.begun += 1
      record_({ type: 'idempotency/begun', key: e.key, scope: e.scope, fingerprint: fp, attempt: 1 })
      say({ type: 'idempotency/begun', at: e.startedAt, key: e.key, scope: e.scope, fingerprint: fp })
      persist()
      return { ok: true, ref: e.scope + '/' + e.key, key: e.key, scope: e.scope, state: 'pending', reused: false, inFlight: true, settled: false, payloadFingerprint: fp, startedAt: e.startedAt, attempt: 1, now: now() }
    },

    /** Commit the result of a pending key. A committed key cannot be committed twice with a different result. */
    commit({ key, scope = null, result = null, by = null } = {}) {
      ensureLoaded()
      const e = resolve(scope, key)
      if (!e) throw deny('VMU_NO_SUCH_OBJECT', 'unknown idempotency key: ' + String(key), 'no begin() was recorded for it — a commit without a begin is a bug (K6)')
      if (e.state === 'committed') {
        let same = false
        try { same = canonicalize(result) === canonicalize(e.result) } catch (err) { same = false }
        if (same) return { ok: true, ref: e.scope + '/' + e.key, key: e.key, scope: e.scope, state: 'committed', already: true, settled: true, result: e.result, committedAt: e.committedAt }
        throw deny('VMU_STATE', 'key "' + e.scope + '/' + e.key + '" is already committed with a DIFFERENT result',
          'a second commit with another result means two executions happened — investigate before overwriting')
      }
      if (e.state === 'aborted') throw deny('VMU_STATE', 'key "' + e.scope + '/' + e.key + '" was aborted and cannot be committed', 'begin() it again (retry) if the work should be redone')
      e.state = 'committed'
      e.result = result === undefined ? null : result
      e.committedAt = now()
      e.by = by === null || by === undefined ? e.by : String(by)
      if (ttlMs > 0) e.expiresAt = e.committedAt + ttlMs
      counts.committed += 1
      record_({ type: 'idempotency/committed', key: e.key, scope: e.scope, fingerprint: e.payloadFingerprint, attempt: e.attempts })
      say({ type: 'idempotency/committed', at: e.committedAt, key: e.key, scope: e.scope })
      fire('idempotency/committed', { key: e.key, scope: e.scope, fingerprint: e.payloadFingerprint })
      persist()
      return { ok: true, ref: e.scope + '/' + e.key, key: e.key, scope: e.scope, state: 'committed', settled: true, result: e.result, committedAt: e.committedAt, attempts: e.attempts }
    },

    /** Abort a pending key. Needs a reason (audited) — an abort is the only sanctioned way to un-settle a key. */
    abort({ key, scope = null, reason = null, by = null } = {}) {
      ensureLoaded()
      const e = resolve(scope, key)
      if (!e) throw deny('VMU_NO_SUCH_OBJECT', 'unknown idempotency key: ' + String(key), 'known: ' + (order.map((i) => entries.get(i).scope + '/' + entries.get(i).key).join(', ') || '(none)'))
      if (abortNeedsReason && (typeof reason !== 'string' || !reason.trim())) {
        throw deny('VMU_REASON_REQUIRED', 'aborting ' + e.scope + '/' + e.key + ' requires a reason (vmu.idempotency.abortNeedsReason)',
          'say why the attempt was given up — an unexplained abort hides a retry storm (K6)')
      }
      if (e.state === 'committed') throw deny('VMU_STATE', 'key "' + e.scope + '/' + e.key + '" is committed: an abort cannot undo a settled result', 'if it must be re-done, use a NEW key (a new request)')
      if (e.state === 'aborted') return { ok: true, ref: e.scope + '/' + e.key, key: e.key, scope: e.scope, state: 'aborted', already: true, abortedAt: e.abortedAt, reason: e.abortReason }
      e.state = 'aborted'
      e.abortedAt = now()
      e.abortReason = reason === null ? null : String(reason)
      e.by = by === null || by === undefined ? e.by : String(by)
      counts.aborted += 1
      record_({ type: 'idempotency/aborted', key: e.key, scope: e.scope, why: e.abortReason, by: e.by, attempt: e.attempts })
      say({ type: 'idempotency/aborted', at: e.abortedAt, key: e.key, scope: e.scope, why: e.abortReason, by: e.by, attempt: e.attempts })
      fire('idempotency/aborted', { key: e.key, scope: e.scope, why: e.abortReason, by: e.by })
      persist()
      return { ok: true, ref: e.scope + '/' + e.key, key: e.key, scope: e.scope, state: 'aborted', abortedAt: e.abortedAt, reason: e.abortReason, attempts: e.attempts, retryable: retryAfterAbort, retrySamePayloadOnly }
    },

    /** READ-ONLY three-state lookup (plus `absent`). Only `committed` reports `settled:true`. */
    lookup({ key, scope = null } = {}) {
      ensureLoaded()
      const e = resolve(scope, key)
      if (!e) return { ok: true, key, scope: scope === null || scope === undefined ? scopeDefault : String(scope), found: false, state: 'absent', settled: false, result: null, note: 'no attempt is recorded under this key' }
      const v = view(e)
      return Object.assign({ ok: true, found: true }, v, {
        note: v.state === 'pending'
          ? 'PENDING: an attempt is in flight — this is NOT a success (do not treat it as done)'
          : v.state === 'aborted'
            ? 'ABORTED: the attempt was given up (' + v.abortReason + ') — it is not a success either'
            : 'COMMITTED: the stored result is replayable without re-executing',
      })
    },

    /** READ-ONLY: the canonical fingerprint of a payload (so a caller can log what it is about to begin). */
    fingerprintOf({ payload = null } = {}) {
      const canon = canonicalOf(payload)
      return { ok: true, canonicalVersion: CANONICAL_VERSION, fingerprint: fingerprint(canon), bytes: canon.length, canonical: canon.length > PREVIEW_CAP ? canon.slice(0, PREVIEW_CAP) + '…' : canon, truncated: canon.length > PREVIEW_CAP }
    },

    /** Reap settled/expired keys. Reports `reaped` (TTL) and `dropped` (STALE PENDING) SEPARATELY. */
    reap({ at = null } = {}) {
      ensureLoaded()
      const when = at === null ? now() : at
      if (typeof when !== 'number' || !Number.isFinite(when)) throw deny('VMU_INVALID_ARGUMENT', 'reap `at` must be milliseconds', 'omit it to use the injected clock')
      const reaped = []
      const dropped = []
      for (const i of order.slice()) {
        const e = entries.get(i)
        if (!e) continue
        if (isStalePending(e, when)) {
          entries.delete(i)
          dropped.push({ ref: e.scope + '/' + e.key, key: e.key, scope: e.scope, why: 'stale-pending', state: 'pending', ageMs: when - e.startedAt, attempts: e.attempts })
          counts.dropped += 1
          record_({ type: 'idempotency/dropped', key: e.key, scope: e.scope, why: 'stale-pending', ageMs: when - e.startedAt, at: when })
          say({ type: 'idempotency/dropped', at: when, key: e.key, scope: e.scope, why: 'stale-pending', attempts: e.attempts })
          continue
        }
        if (isExpired(e, when)) {
          entries.delete(i)
          reaped.push({ ref: e.scope + '/' + e.key, key: e.key, scope: e.scope, why: 'ttl', state: e.state, ageMs: when - (e.committedAt === null ? e.startedAt : e.committedAt) })
          counts.reaped += 1
          record_({ type: 'idempotency/reaped', key: e.key, scope: e.scope, why: 'ttl', state: e.state, at: when })
          continue
        }
      }
      const kept = [...entries.keys()]
      if (reaped.length || dropped.length) persist()
      return {
        ok: true, at: when, reaped, dropped, reapedCount: reaped.length, droppedCount: dropped.length,
        kept: kept.length, byState: { pending: kept.filter((i) => entries.get(i).state === 'pending').length, committed: kept.filter((i) => entries.get(i).state === 'committed').length, aborted: kept.filter((i) => entries.get(i).state === 'aborted').length },
        note: dropped.length
          ? 'stale pending attempts were DROPPED (counted + audited): their outcome is unknown, so they are never reported as success'
          : 'nothing was dropped; only settled/expired entries were reaped',
      }
    },

    /** READ-ONLY. Bounded: a `limit` below what is available reports the DROPPED count (never silent). */
    list({ limit = DEFAULT_LIST_CAP, state = null, scope = null } = {}) {
      ensureLoaded()
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const at = now()
      let all = order.map((i) => entries.get(i)).filter(Boolean)
      if (typeof state === 'string' && state) all = all.filter((e) => e.state === state)
      if (typeof scope === 'string' && scope) all = all.filter((e) => e.scope === scope)
      const kept = all.slice(0, cap).map((e) => view(e, at))
      return { ok: true, entries: kept, count: kept.length, available: all.length, dropped: all.length - kept.length, truncated: all.length > kept.length, configured: order.length > 0 }
    },

    /** READ-ONLY: the audit trail (a capped ring; drops are counted). */
    history({ key = null, scope = null, limit = DEFAULT_LIST_CAP } = {}) {
      ensureLoaded()
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const rows_ = historyRows.filter((r) => (key === null || r.key === key) && (scope === null || r.scope === scope))
      const kept = rows_.slice(Math.max(0, rows_.length - cap)).map((r) => Object.assign({}, r))
      return { ok: true, rows: kept, count: kept.length, available: rows_.length, dropped: rows_.length - kept.length, truncated: rows_.length > kept.length, ringDropped: droppedHistory.n }
    },

    /** READ-ONLY self-report — including whether the ledger is ACTUALLY durable (N2). */
    status() {
      ensureLoaded()
      const at = now()
      const all = order.map((i) => entries.get(i)).filter(Boolean)
      const durableNow = isDurable()
      return {
        ok: true,
        configured: all.length > 0,
        maxEntries, ttlMs, pendingTimeoutMs, scopeDefault, abortNeedsReason, retryAfterAbort, retrySamePayloadOnly, maxPayloadBytes,
        canonicalVersion: CANONICAL_VERSION,
        identity: IDENTITY_RULE,
        scopeIsPartOfIdentity: true,
        retryIsNewAttempt: !retrySamePayloadOnly,
        durable: durableNow,
        loaded: loadOk,
        loadAttempted,
        lastPatchOk,
        durableBackend: store ? 'store' : null,
        durableLoaded: loadOk,
        durableDegraded,
        durableReason,
        durableLoadError: loadError,
        durableLastWriteAt: lastPersistAt,
        durableLastError: lastPersistError,
        ledgerKey: LEDGER_KEY,
        entries: {
          total: all.length,
          pending: all.filter((e) => e.state === 'pending').length,
          committed: all.filter((e) => e.state === 'committed').length,
          aborted: all.filter((e) => e.state === 'aborted').length,
          expired: all.filter((e) => isExpired(e, at)).length,
          stalePending: all.filter((e) => isStalePending(e, at)).length,
        },
        scopes: [...new Set(all.map((e) => e.scope))].sort(),
        counters: Object.assign({}, counts),
        listCap: DEFAULT_LIST_CAP,
        historyRows: historyRows.length,
        historyDropped: droppedHistory.n,
        refusals: objOf(refusals),
        refusalsTotal: sumOf(refusals),
        unwired: objOf(unwired),
        unwiredTotal: sumOf(unwired),
        at,
        note: durableNow
          ? 'K6 with a durability projection: a replay AFTER A RESTART still deduplicates (status().durable=true)'
          : 'K6 in MEMORY ONLY (status().durable=false: ' + durableReason + ') — a replay after a restart cannot be recognised',
      }
    },
  }

  return api
}
