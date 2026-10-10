// vmu kernel · idempotency — the K6 ledger: a replayed or retried request must not take effect twice.
//
// Design source: docs/07-durability-library.md §4.2 (content identity is computed in ONE place, and the stored
// fingerprint is read back rather than recomputed) and 03-§8 (`VMU_IDEMPOTENCY_KEY_REUSED`). This module does
// NOT redefine the library's record fingerprint: it computes a REQUEST fingerprint (canonical JSON of the
// payload) which is a different concern — 07 identifies *content*, this identifies *a request*.
//
// FOUR HARD INVARIANTS (each one a refusal or an explicit state — never a pretence):
//   ① SAME KEY + DIFFERENT PAYLOAD ⇒ `VMU_IDEMPOTENCY_KEY_REUSED`, and the refusal CARRIES BOTH FINGERPRINTS
//      plus where the two canonical payloads diverge (first differing byte, lengths, changed top-level keys).
//   ② SAME KEY + SAME PAYLOAD ⇒ the EXISTING result is returned (`deduplicated:true`); nothing is executed.
//   ③ A PENDING KEY IS NEVER A SUCCESS: `lookup()` answers `pending | committed | aborted | absent`, and only
//      `committed` carries `settled:true`. `begin()` on a pending key says "still in flight — do not execute".
//   ④ `abort()` NEEDS A REASON and is audited; `reap()` reports `reaped` (TTL) and `dropped` (stale pending)
//      separately — an entry is never discarded silently.
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
const K_MAX_PAYLOAD = 'vmu.idempotency.maxPayloadBytes'
const K_KEY_SCOPE = 'vmu.workflow.idempotencyKeyScope'   // the 08-doc spelling, read as a scope fallback

const STATES = Object.freeze(['pending', 'committed', 'aborted'])
const DEFAULT_LIST_CAP = 200
const PREVIEW_CAP = 400

/** Canonical JSON: keys sorted at every depth, so two logically equal payloads fingerprint identically. */
export function canonicalize(value) {
  const walk = (v) => {
    if (v === null) return 'null'
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    if (typeof v === 'string') return JSON.stringify(v)
    if (Array.isArray(v)) return '[' + v.map(walk).join(',') + ']'
    if (typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + walk(v[k])).join(',') + '}'
    return JSON.stringify(String(v))
  }
  return walk(value === undefined ? null : value)
}

/**
 * createIdempotency — the K6 ledger. In-memory by design (a durable projection is a separate slice; see the
 * report): the ledger answers "was this request already done?", and refuses to pretend when it cannot tell.
 */
export function createIdempotency({ clock = () => 0, log = null, settings = {}, bus = null } = {}) {
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
  const maxPayloadBytes = nonNegInt(sget(K_MAX_PAYLOAD, 0), 0)

  function nonNegInt(v, def) { return Number.isInteger(v) && v >= 0 ? v : def }

  // ── state (mutated only by begin/commit/abort/reap) ────────────────────────────────────────────────
  const entries = new Map()
  const order = []
  const historyRows = []
  const droppedHistory = { n: 0 }
  const refusals = new Map()
  const unwired = new Map()
  const declaredTopics = new Set()
  const counts = { begun: 0, committed: 0, aborted: 0, deduplicated: 0, reaped: 0, dropped: 0, refusedAtCap: 0 }

  const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by)
  const objOf = (map) => { const o = {}; for (const k of [...map.keys()].sort()) o[k] = map.get(k); return o }
  const sumOf = (map) => [...map.values()].reduce((a, b) => a + b, 0)
  const now = () => clock()
  const findByKey = (key) => entries.get(key) || null
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
  const view = (e, at = now()) => ({
    key: e.key, scope: e.scope, state: e.state,
    settled: e.state === 'committed',
    payloadFingerprint: e.payloadFingerprint, attempts: e.attempts,
    startedAt: e.startedAt, committedAt: e.committedAt, abortedAt: e.abortedAt, abortReason: e.abortReason,
    expiresAt: e.expiresAt, expired: isExpired(e, at), stalePending: isStalePending(e, at),
    result: e.state === 'committed' ? e.result : null,
  })
  /** Compare two canonical payloads and say WHERE they differ (invariant ① must be diagnosable). */
  const payloadDiff = (aCanon, bCanon) => {
    const n = Math.min(aCanon.length, bCanon.length)
    let firstDiffAt = -1
    for (let i = 0; i < n; i++) if (aCanon[i] !== bCanon[i]) { firstDiffAt = i; break }
    if (firstDiffAt === -1 && aCanon.length !== bCanon.length) firstDiffAt = n
    let changedKeys = []
    try {
      const a = JSON.parse(aCanon)
      const b = JSON.parse(bCanon)
      if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
        const keys = [...new Set(Object.keys(a).concat(Object.keys(b)))].sort()
        changedKeys = keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      }
    } catch (e) { /* not both objects: the byte-level diff above is the answer */ }
    return {
      firstDiffAt,
      lengths: [aCanon.length, bCanon.length],
      changedKeys,
      expected: aCanon.length > PREVIEW_CAP ? aCanon.slice(0, PREVIEW_CAP) + '…' : aCanon,
      actual: bCanon.length > PREVIEW_CAP ? bCanon.slice(0, PREVIEW_CAP) + '…' : bCanon,
      truncated: aCanon.length > PREVIEW_CAP || bCanon.length > PREVIEW_CAP,
    }
  }
  const fingerprint = (canon) => createHash('sha256').update(canon, 'utf8').digest('hex')

  const api = {
    apiVersion,

    /** Start (or observe) a request under `key`. Same key + same payload ⇒ the existing result, never a rerun. */
    begin({ key, scope = null, payload = null, by = null } = {}) {
      if (typeof key !== 'string' || !key.trim()) throw deny('VMU_INVALID_ARGUMENT', 'begin needs a non-empty string `key`', 'the key is the idempotency identity: e.g. { key: "task-create:t-3" }')
      const canon = canonicalize(payload)
      if (maxPayloadBytes > 0 && canon.length > maxPayloadBytes) {
        throw deny('VMU_INVALID_ARGUMENT', 'the payload is too large for an idempotency fingerprint: ' + canon.length + '/' + maxPayloadBytes + ' bytes (vmu.idempotency.maxPayloadBytes)',
          'fingerprint a digest or an id instead of the whole payload, or raise vmu.idempotency.maxPayloadBytes')
      }
      const fp = fingerprint(canon)
      const existing = findByKey(key)
      if (existing) {
        if (existing.state === 'pending') {
          // INVARIANT ③: a pending key is NOT a success and must not start a second execution.
          say({ type: 'idempotency/in-flight', at: now(), key, state: 'pending' })
          return {
            ok: true, key, state: 'pending', reused: true, inFlight: true, deduplicated: false, settled: false,
            payloadFingerprint: fp, startedAt: existing.startedAt, attempts: existing.attempts,
            note: 'the same key is still IN FLIGHT: do not execute — a pending key is not a success (K6)',
          }
        }
        if (existing.state === 'committed') {
          if (existing.payloadFingerprint === fp) {
            // INVARIANT ②: same key + same payload ⇒ return the stored result, execute nothing.
            counts.deduplicated += 1
            record_({ type: 'idempotency/deduplicated', key, fingerprint: fp })
            say({ type: 'idempotency/deduplicated', at: now(), key, fingerprint: fp })
            fire('idempotency/deduplicated', { key, fingerprint: fp })
            return {
              ok: true, key, state: 'committed', reused: true, deduplicated: true, settled: true,
              payloadFingerprint: fp, result: existing.result, committedAt: existing.committedAt,
              note: 'this request was already committed: the stored result is returned and nothing is executed',
            }
          }
          // INVARIANT ①: same key + DIFFERENT payload ⇒ named refusal that carries both fingerprints + the diff.
          const diff = payloadDiff(existing.payloadCanon, canon)
          throw deny('VMU_IDEMPOTENCY_KEY_REUSED',
            'key "' + key + '" was already committed with a DIFFERENT payload: expected ' + existing.payloadFingerprint + ' but got ' + fp,
            'first difference at byte ' + diff.firstDiffAt + ' (lengths ' + diff.lengths[0] + '/' + diff.lengths[1] + ')' +
            (diff.changedKeys.length ? ', changed keys: ' + diff.changedKeys.join(', ') : '') +
            ' — a reused key with a new payload is a bug in the caller, not a retry')
        }
        if (existing.state === 'aborted') {
          if (!retryAfterAbort) {
            throw deny('VMU_STATE', 'key "' + key + '" was aborted and vmu.idempotency.retryAfterAbort=false: it may not be retried',
              'use a fresh key, or set vmu.idempotency.retryAfterAbort=true')
          }
          existing.attempts += 1
          existing.state = 'pending'
          existing.payloadFingerprint = fp
          existing.payloadCanon = canon
          existing.startedAt = now()
          existing.expiresAt = ttlMs > 0 ? now() + ttlMs : null
          existing.by = by === null || by === undefined ? existing.by : String(by)
          counts.begun += 1
          record_({ type: 'idempotency/retried', key, attempt: existing.attempts, fingerprint: fp, why: existing.abortReason })
          say({ type: 'idempotency/retried', at: now(), key, attempt: existing.attempts })
          return { ok: true, key, state: 'pending', reused: true, retried: true, inFlight: true, settled: false, attempt: existing.attempts, payloadFingerprint: fp, note: 'the previously aborted key is retried (attempt ' + existing.attempts + ')' }
        }
      }
      if (maxEntries > 0 && entries.size >= maxEntries) {
        counts.refusedAtCap += 1
        throw deny('VMU_RESOURCE_BUDGET', 'the idempotency ledger is full: ' + entries.size + '/' + maxEntries + ' keys (vmu.idempotency.maxEntries)',
          'reap() settled keys (they are kept for replay, not forever), or raise vmu.idempotency.maxEntries — the ledger never evicts silently')
      }
      const e = {
        key: String(key), scope: scope === null ? scopeDefault : String(scope),
        state: 'pending', payloadFingerprint: fp, payloadCanon: canon,
        attempts: 1, startedAt: now(), expiresAt: ttlMs > 0 ? now() + ttlMs : null,
        committedAt: null, result: null, abortedAt: null, abortReason: null,
        by: by === null || by === undefined ? null : String(by),
      }
      entries.set(e.key, e)
      order.push(e.key)
      counts.begun += 1
      record_({ type: 'idempotency/begun', key: e.key, scope: e.scope, fingerprint: fp, attempt: 1 })
      say({ type: 'idempotency/begun', at: e.startedAt, key: e.key, fingerprint: fp })
      return { ok: true, key: e.key, state: 'pending', reused: false, inFlight: true, settled: false, payloadFingerprint: fp, startedAt: e.startedAt, attempt: 1, now: now() }
    },

    /** Commit the result of a pending key. A committed key cannot be committed twice with a different result. */
    commit({ key, result = null, by = null } = {}) {
      if (typeof key !== 'string' || !key.trim()) throw deny('VMU_INVALID_ARGUMENT', 'commit needs a non-empty string `key`', 'e.g. { key: "task-create:t-3", result: { id: "t-3" } }')
      const e = findByKey(key)
      if (!e) throw deny('VMU_NO_SUCH_OBJECT', 'unknown idempotency key: ' + key, 'no begin() was recorded for it — a commit without a begin is a bug (K6)')
      if (e.state === 'committed') {
        const same = canonicalize(result) === canonicalize(e.result)
        if (same) return { ok: true, key, state: 'committed', already: true, settled: true, result: e.result, committedAt: e.committedAt }
        throw deny('VMU_STATE', 'key "' + key + '" is already committed with a DIFFERENT result',
          'a second commit with another result means two executions happened — investigate before overwriting')
      }
      if (e.state === 'aborted') throw deny('VMU_STATE', 'key "' + key + '" was aborted and cannot be committed', 'begin() it again (retry) if the work should be redone')
      e.state = 'committed'
      e.result = result === undefined ? null : result
      e.committedAt = now()
      e.by = by === null || by === undefined ? e.by : String(by)
      if (ttlMs > 0) e.expiresAt = e.committedAt + ttlMs
      counts.committed += 1
      record_({ type: 'idempotency/committed', key: e.key, fingerprint: e.payloadFingerprint, attempt: e.attempts })
      say({ type: 'idempotency/committed', at: e.committedAt, key: e.key })
      fire('idempotency/committed', { key: e.key, fingerprint: e.payloadFingerprint })
      return { ok: true, key: e.key, state: 'committed', settled: true, result: e.result, committedAt: e.committedAt, attempts: e.attempts }
    },

    /** Abort a pending key. Needs a reason (audited) — an abort is the only sanctioned way to un-settle a key. */
    abort({ key, reason = null, by = null } = {}) {
      if (typeof key !== 'string' || !key.trim()) throw deny('VMU_INVALID_ARGUMENT', 'abort needs a non-empty string `key`', 'e.g. { key: "task-create:t-3", reason: "engine refused" }')
      const e = findByKey(key)
      if (!e) throw deny('VMU_NO_SUCH_OBJECT', 'unknown idempotency key: ' + key, 'known: ' + (order.join(', ') || '(none)'))
      if (abortNeedsReason && (typeof reason !== 'string' || !reason.trim())) {
        throw deny('VMU_REASON_REQUIRED', 'aborting ' + key + ' requires a reason (vmu.idempotency.abortNeedsReason)',
          'say why the attempt was given up — an unexplained abort hides a retry storm (K6)')
      }
      if (e.state === 'committed') throw deny('VMU_STATE', 'key "' + key + '" is committed: an abort cannot undo a settled result', 'if it must be re-done, use a NEW key (a new request)')
      if (e.state === 'aborted') return { ok: true, key, state: 'aborted', already: true, abortedAt: e.abortedAt, reason: e.abortReason }
      e.state = 'aborted'
      e.abortedAt = now()
      e.abortReason = reason === null ? null : String(reason)
      e.by = by === null || by === undefined ? e.by : String(by)
      counts.aborted += 1
      record_({ type: 'idempotency/aborted', key: e.key, why: e.abortReason, by: e.by, attempt: e.attempts })
      say({ type: 'idempotency/aborted', at: e.abortedAt, key: e.key, why: e.abortReason, by: e.by, attempt: e.attempts })
      fire('idempotency/aborted', { key: e.key, why: e.abortReason, by: e.by })
      return { ok: true, key: e.key, state: 'aborted', abortedAt: e.abortedAt, reason: e.abortReason, attempts: e.attempts, retryable: retryAfterAbort }
    },

    /** READ-ONLY three-state lookup (plus `absent`). Only `committed` reports `settled:true`. */
    lookup({ key } = {}) {
      if (typeof key !== 'string' || !key.trim()) throw deny('VMU_INVALID_ARGUMENT', 'lookup needs a non-empty string `key`', 'e.g. { key: "task-create:t-3" }')
      const e = findByKey(key)
      if (!e) return { ok: true, key, found: false, state: 'absent', settled: false, result: null, note: 'no attempt is recorded under this key' }
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
      const canon = canonicalize(payload)
      return { ok: true, fingerprint: fingerprint(canon), bytes: canon.length, canonical: canon.length > PREVIEW_CAP ? canon.slice(0, PREVIEW_CAP) + '…' : canon, truncated: canon.length > PREVIEW_CAP }
    },

    /** Reap settled/expired keys. Reports `reaped` (TTL) and `dropped` (STALE PENDING) SEPARATELY. */
    reap({ at = null } = {}) {
      const when = at === null ? now() : at
      if (typeof when !== 'number' || !Number.isFinite(when)) throw deny('VMU_INVALID_ARGUMENT', 'reap `at` must be milliseconds', 'omit it to use the injected clock')
      const reaped = []
      const dropped = []
      for (const key of order.slice()) {
        const e = entries.get(key)
        if (!e) continue
        if (isStalePending(e, when)) {
          // A pending attempt that never settled: the work may or may not have happened — that is exactly why
          // it is DROPPED with a reason and counted, instead of quietly disappearing or being called a success.
          entries.delete(key)
          dropped.push({ key, why: 'stale-pending', state: 'pending', ageMs: when - e.startedAt, attempts: e.attempts })
          counts.dropped += 1
          record_({ type: 'idempotency/dropped', key, why: 'stale-pending', ageMs: when - e.startedAt, at: when })
          say({ type: 'idempotency/dropped', at: when, key, why: 'stale-pending', attempts: e.attempts })
          continue
        }
        if (isExpired(e, when)) {
          entries.delete(key)
          reaped.push({ key, why: 'ttl', state: e.state, ageMs: when - (e.committedAt === null ? e.startedAt : e.committedAt) })
          counts.reaped += 1
          record_({ type: 'idempotency/reaped', key, why: 'ttl', state: e.state, at: when })
          continue
        }
      }
      const kept = [...entries.keys()]
      return {
        ok: true, at: when, reaped, dropped, reapedCount: reaped.length, droppedCount: dropped.length,
        kept: kept.length, byState: { pending: kept.filter((k) => entries.get(k).state === 'pending').length, committed: kept.filter((k) => entries.get(k).state === 'committed').length, aborted: kept.filter((k) => entries.get(k).state === 'aborted').length },
        note: dropped.length
          ? 'stale pending attempts were DROPPED (counted + audited): their outcome is unknown, so they are never reported as success'
          : 'nothing was dropped; only settled/expired entries were reaped',
      }
    },

    /** READ-ONLY. Bounded: a `limit` below what is available reports the DROPPED count (never silent). */
    list({ limit = DEFAULT_LIST_CAP, state = null } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const at = now()
      let all = order.map((k) => entries.get(k)).filter(Boolean)
      if (typeof state === 'string' && state) all = all.filter((e) => e.state === state)
      const kept = all.slice(0, cap).map((e) => view(e, at))
      return { ok: true, entries: kept, count: kept.length, available: all.length, dropped: all.length - kept.length, truncated: all.length > kept.length, configured: order.length > 0 }
    },

    /** READ-ONLY: the audit trail (a capped ring; drops are counted). */
    history({ key = null, limit = DEFAULT_LIST_CAP } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const rows = historyRows.filter((r) => key === null || r.key === key)
      const kept = rows.slice(Math.max(0, rows.length - cap)).map((r) => Object.assign({}, r))
      return { ok: true, rows: kept, count: kept.length, available: rows.length, dropped: rows.length - kept.length, truncated: rows.length > kept.length, ringDropped: droppedHistory.n }
    },

    /** READ-ONLY self-report. */
    status() {
      const at = now()
      const all = order.map((k) => entries.get(k)).filter(Boolean)
      return {
        ok: true,
        configured: all.length > 0,
        maxEntries, ttlMs, pendingTimeoutMs, scopeDefault, abortNeedsReason, retryAfterAbort, maxPayloadBytes,
        entries: {
          total: all.length,
          pending: all.filter((e) => e.state === 'pending').length,
          committed: all.filter((e) => e.state === 'committed').length,
          aborted: all.filter((e) => e.state === 'aborted').length,
          expired: all.filter((e) => isExpired(e, at)).length,
          stalePending: all.filter((e) => isStalePending(e, at)).length,
        },
        counters: Object.assign({}, counts),
        listCap: DEFAULT_LIST_CAP,
        historyRows: historyRows.length,
        historyDropped: droppedHistory.n,
        refusals: objOf(refusals),
        refusalsTotal: sumOf(refusals),
        unwired: objOf(unwired),
        unwiredTotal: sumOf(unwired),
        at,
        note: 'K6: a replayed request returns the stored result; a reused key with a new payload is refused by name; a pending key is never a success',
      }
    },
  }

  return api
}
