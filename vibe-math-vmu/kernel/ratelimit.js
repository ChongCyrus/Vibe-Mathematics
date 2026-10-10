// vmu kernel ratelimit — token bucket with an INJECTED clock, explicit backpressure, honest degradation.
// Spec: docs/11 (resources and limits) and docs/08 (control flow / budget) are REFERENCED, not redefined.
// Invariants: the bucket only ever reads the injected clock (never real time); exceeding the limit is a
// NAMED refusal carrying `retryAfterMs` (nothing is silently dropped); `onLimited='queue'` has a bounded
// queue and degrades to a named refusal WITH a counter; `degrade` always self-reports `degraded:true`;
// `reset` requires a reason and leaves a trace; key eviction is counted; zero-mechanism passes everything
// through and SAYS SO ("unlimited") instead of pretending to protect; reads never mutate.
// Codes: VMU_RATE_LIMITED / VMU_RESOURCE_BUDGET / VMU_INVALID_ARGUMENT (03-§8).

export const apiVersion = 1

/** Backpressure modes. `refuse` is the default (fail closed). */
export const ON_LIMITED = Object.freeze(['refuse', 'queue', 'degrade'])

export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  err.hint = hint
  if (extra) Object.assign(err, extra)
  return err
}

const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const numOr = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d)

export function createRateLimit({ clock = () => Date.now(), log = () => {}, settings = {}, bus = null, listCap = 100 } = {}) {
  const buckets = new Map()   // key -> { key, tokens, last, at, hits, limited, queued }
  const resets = []           // append-only trace of resets
  let dropped = 0             // evicted keys
  let queuedTotal = 0
  let limitedTotal = 0

  const cfg = () => {
    const perSec = numOr(settings['vmu.ratelimit.ratePerSec'], 0)
    return {
      enabled: perSec > 0,
      ratePerSec: perSec,
      burst: intOr(settings['vmu.ratelimit.burst'], perSec > 0 ? Math.max(1, Math.ceil(perSec)) : 0),
      scopeDefault: settings['vmu.ratelimit.scopeDefault'] || 'global',
      onLimited: ON_LIMITED.includes(settings['vmu.ratelimit.onLimited']) ? settings['vmu.ratelimit.onLimited'] : 'refuse',
      retryAfterMs: intOr(settings['vmu.ratelimit.retryAfterMs'], 0),
      maxKeys: intOr(settings['vmu.ratelimit.maxKeys'], 1000),
      queueMax: intOr(settings['vmu.ratelimit.queueMax'], 0),
      perScope: (settings['vmu.ratelimit.perScope'] && typeof settings['vmu.ratelimit.perScope'] === 'object') ? settings['vmu.ratelimit.perScope'] : {},
    }
  }
  const limitsFor = (scope, c) => {
    const s = c.perScope[scope] || {}
    return { ratePerSec: numOr(s.ratePerSec, c.ratePerSec), burst: intOr(s.burst, c.burst) }
  }

  /** Refill from the injected clock only. Pure: same inputs ⇒ same tokens. */
  const refill = (b, ratePerSec, burst, at) => {
    const elapsed = Math.max(0, at - b.last)
    b.tokens = Math.min(burst, b.tokens + (elapsed / 1000) * ratePerSec)
    b.last = at
    return b
  }
  const retryAfterFor = (b, ratePerSec, cost, c) => {
    if (c.retryAfterMs > 0) return c.retryAfterMs
    const need = cost - b.tokens
    return Math.max(1, Math.ceil((need / ratePerSec) * 1000))
  }
  const evictIfNeeded = (c) => {
    while (buckets.size > c.maxKeys && c.maxKeys > 0) {
      const oldest = [...buckets.values()].sort((a, z) => a.at - z.at)[0]
      if (!oldest) break
      buckets.delete(oldest.key)
      dropped += 1
    }
  }

  /** take(): the single admission point. */
  function take({ key = null, cost = 1, scope = null } = {}) {
    const c = cfg()
    const k = key === null || key === undefined ? (scope || c.scopeDefault) : String(key)
    const sc = scope || (key === null || key === undefined ? c.scopeDefault : String(key))
    const rawCost = cost === undefined || cost === null ? 1 : cost
    if (typeof rawCost !== 'number' || !Number.isFinite(rawCost) || rawCost <= 0) {
      throw refuse('VMU_INVALID_ARGUMENT', 'cost must be a finite number > 0, got ' + String(cost), 'pass cost:<number>', { key: k, cost })
    }
    const amount = rawCost
    const at = clock()

    // (7) zero-mechanism: pass through and SAY that nothing is limited.
    if (!c.enabled) {
      return { ok: true, key: k, allowed: true, unlimited: true, note: 'no rate limit configured (vmu.ratelimit.ratePerSec=0): this call was NOT limited', tokens: null, degraded: false }
    }

    const l = limitsFor(sc, c)
    let b = buckets.get(k)
    if (!b) { b = { key: k, tokens: l.burst, last: at, at, hits: 0, limited: 0, queued: 0 }; buckets.set(k, b); evictIfNeeded(c) }
    b.at = at
    refill(b, l.ratePerSec, l.burst, at)

    if (b.tokens >= amount) {
      b.tokens -= amount
      b.hits += 1
      return { ok: true, key: k, allowed: true, tokens: b.tokens, unlimited: false, degraded: false, at }
    }

    // Over the limit: never a silent drop.
    const retryAfterMs = retryAfterFor(b, l.ratePerSec, amount, c)
    b.limited += 1
    limitedTotal += 1
    if (c.onLimited === 'queue') {
      if (b.queued < c.queueMax) {                        // bounded queue
        b.queued += 1
        queuedTotal += 1
        if (bus && typeof bus.emit === 'function') bus.emit('ratelimit/queued', { key: k, retryAfterMs, queued: b.queued })
        return { ok: true, key: k, allowed: false, queued: true, retryAfterMs, queueDepth: b.queued, queueMax: c.queueMax, tokens: b.tokens, degraded: false, at }
      }
      // queue full ⇒ degrade to a NAMED refusal, still counted
      dropped += 0
      throw refuse('VMU_RATE_LIMITED', 'rate limited and the queue is full for ' + k + ' (queued=' + b.queued + ' max=' + c.queueMax + ')',
        'retry after ' + retryAfterMs + 'ms; queue overflow is refused by name, never silently dropped',
        { key: k, retryAfterMs, queueDepth: b.queued, queueMax: c.queueMax, scope: sc, degraded: true, reason: 'queue-overflow' })
    }
    if (c.onLimited === 'degrade') {
      // (4) degradation must be visible: the caller sees degraded:true and why.
      if (bus && typeof bus.emit === 'function') bus.emit('ratelimit/degraded', { key: k, retryAfterMs })
      log('ratelimit: DEGRADED for ' + k + ' (retryAfter=' + retryAfterMs + 'ms)')
      return { ok: true, key: k, allowed: true, degraded: true, degradeReason: 'rate-limited-degraded', retryAfterMs, tokens: 0, unlimited: false, at }
    }
    throw refuse('VMU_RATE_LIMITED', 'rate limited: ' + k + ' has ' + b.tokens.toFixed(3) + ' token(s), needs ' + amount,
      'retry after ' + retryAfterMs + 'ms (vmu.ratelimit.ratePerSec=' + l.ratePerSec + ', burst=' + l.burst + ')',
      { key: k, retryAfterMs, tokens: b.tokens, cost: amount, scope: sc, degraded: false, reason: 'over-limit' })
  }

  /** reset(): requires a reason and leaves a trace (who/why/when). */
  function reset({ key = null, reason = '', by = null } = {}) {
    if (!String(reason || '').trim()) throw refuse('VMU_INVALID_ARGUMENT', 'reset needs a reason', 'pass reason:"…" so the trace can explain the reset', { key })
    const c = cfg()
    if (key === null || key === undefined) {
      const n = buckets.size
      buckets.clear()
      resets.push({ key: null, reason: String(reason), by, at: clock(), cleared: n })
      return { ok: true, cleared: n, reason: String(reason), at: clock() }
    }
    const k = String(key)
    const had = buckets.delete(k)
    resets.push({ key: k, reason: String(reason), by, at: clock(), cleared: had ? 1 : 0 })
    return { ok: true, cleared: had ? 1 : 0, key: k, reason: String(reason), at: clock() }
  }

  /** Read-only views (never mutate; counted truncation). */
  const peek = ({ key = null } = {}) => {
    const c = cfg()
    if (key === null || key === undefined) {
      const all = [...buckets.values()].map((b) => ({ key: b.key, tokens: b.tokens, hits: b.hits, limited: b.limited, queued: b.queued, at: b.at }))
      if (all.length <= listCap) return { items: all, total: all.length, dropped }
      return { items: all.slice(0, listCap), total: all.length, dropped }
    }
    const b = buckets.get(String(key))
    if (!b) return { key: String(key), present: false, tokens: null, limited: c.enabled === false ? 'unlimited' : 0 }
    return { key: b.key, present: true, tokens: b.tokens, hits: b.hits, limited: b.limited, queued: b.queued, at: b.at }
  }
  const bucket = ({ key } = {}) => peek({ key })
  const status = () => ({
    enabled: cfg().enabled,
    unlimited: !cfg().enabled,
    note: cfg().enabled ? null : 'no rate limit configured: every take() passes through (this is NOT protection)',
    keys: buckets.size, dropped, limitedTotal, queuedTotal,
    resets: resets.length, policy: cfg(), modes: ON_LIMITED.slice(), lastReset: resets.length ? resets[resets.length - 1] : null,
  })

  return { apiVersion, take, peek, reset, bucket, status }
}
