// tests/vmu-ratelimit.test.mjs — kernel/ratelimit.js (K2).
// Scenarios: refill from the injected clock; over-limit named refusal with retryAfterMs (never silent);
// bounded queue degrading to a named refusal + counters; degrade self-reports; reset needs a reason and
// leaves a trace; key eviction is counted; zero-mechanism says "unlimited"; determinism; read-only views.
import { createRateLimit, ON_LIMITED } from '../vibe-math-vmu/kernel/ratelimit.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const rejects = (fn) => { try { fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, retryAfterMs: e && e.retryAfterMs, hint: e && e.hint, degraded: e && e.degraded, reason: e && e.reason, queueDepth: e && e.queueDepth } } }

let now = 0
const mk = (settings = {}, opts = {}) => createRateLimit({ clock: () => now, settings, listCap: 100, ...opts })

// 1) zero-mechanism: everything passes AND it says it is unlimited (no fake protection)
{
  const rl = mk()
  const r = rl.take({ key: 'a' })
  ok(r.ok === true && r.allowed === true && r.unlimited === true && /NOT limited/.test(String(r.note)), 'zero-mechanism passes through and self-reports unlimited')
  ok(rl.status().unlimited === true && /NOT protection/.test(String(rl.status().note)), 'status says unlimited (not pretending)')
  ok(rl.peek({ key: 'a' }).present === false, 'no bucket is created when unlimited')
}

// 2) refill strictly from the injected clock (no real time)
{
  const rl = mk({ 'vmu.ratelimit.ratePerSec': 10, 'vmu.ratelimit.burst': 5 })
  for (let i = 0; i < 5; i++) ok(rl.take({ key: 'b' }).allowed === true, 'burst token ' + i)
  now = 0
  const limited = rejects(() => rl.take({ key: 'b' }))
  ok(limited.threw && limited.code === 'VMU_RATE_LIMITED' && limited.retryAfterMs === 100, 'over limit ⇒ named refusal with retryAfterMs (10/s ⇒ 100ms)')
  now = 100                                   // exactly one token refilled
  ok(rl.take({ key: 'b' }).allowed === true, 'one token after 100ms')
  now = 0
  // never reads real time: replaying the same clock sequence gives the same answer
  const rl2 = mk({ 'vmu.ratelimit.ratePerSec': 10, 'vmu.ratelimit.burst': 5 })
  for (let i = 0; i < 5; i++) rl2.take({ key: 'b' })
  ok(rejects(() => rl2.take({ key: 'b' })).retryAfterMs === 100, 'deterministic under the injected clock')
}

// 3) nothing is silently dropped: every over-limit take is either refused, queued or degraded
{
  const rl = mk({ 'vmu.ratelimit.ratePerSec': 1, 'vmu.ratelimit.burst': 1 })
  ok(rl.take({ key: 'c' }).allowed === true, 'first take allowed')
  const r = rejects(() => rl.take({ key: 'c' }))
  ok(r.threw && r.code === 'VMU_RATE_LIMITED', 'second take refused by name')
  ok(rl.status().limitedTotal === 1, 'the refusal is counted')
  ok(rl.peek({ key: 'c' }).limited === 1, 'per-bucket counter too')
}

// 4) onLimited=queue: bounded; overflow degrades to a named refusal WITH counters
{
  const rl = mk({ 'vmu.ratelimit.ratePerSec': 1, 'vmu.ratelimit.burst': 1, 'vmu.ratelimit.onLimited': 'queue', 'vmu.ratelimit.queueMax': 2 })
  rl.take({ key: 'q' })
  const q1 = rl.take({ key: 'q' })
  const q2 = rl.take({ key: 'q' })
  ok(q1.queued === true && q1.allowed === false && q2.queued === true, 'queue accepts up to queueMax')
  const over = rejects(() => rl.take({ key: 'q' }))
  ok(over.threw && over.code === 'VMU_RATE_LIMITED' && over.reason === 'queue-overflow', 'queue overflow is a named refusal (degraded)')
  ok(over.degraded === true && over.queueDepth === 2, 'overflow reports degraded:true and the depth')
  ok(rl.status().queuedTotal === 2, 'queued count is exact')
}

// 5) onLimited=degrade: self-reports degraded:true with a reason (never pretends full speed)
{
  const events = []
  const rl = mk({ 'vmu.ratelimit.ratePerSec': 1, 'vmu.ratelimit.burst': 1, 'vmu.ratelimit.onLimited': 'degrade' }, { bus: { emit: (t) => events.push(t) } })
  rl.take({ key: 'd' })
  const r = rl.take({ key: 'd' })
  ok(r.ok === true && r.degraded === true && r.degradeReason === 'rate-limited-degraded', 'degrade returns degraded:true + reason')
  ok(r.allowed === true && r.retryAfterMs > 0, 'degrade still allows the call but carries retryAfterMs')
  ok(events.includes('ratelimit/degraded'), 'degrade announces itself on the bus')
  ok(ON_LIMITED.join('|') === 'refuse|queue|degrade', 'the three modes are the declared set')
}

// 6) perScope overrides + scopeDefault
{
  const rl = mk({ 'vmu.ratelimit.ratePerSec': 1, 'vmu.ratelimit.burst': 1, 'vmu.ratelimit.scopeDefault': 'global', 'vmu.ratelimit.perScope': { fast: { ratePerSec: 100, burst: 10 } } })
  let allowed = 0
  for (let i = 0; i < 10; i++) if (rl.take({ key: 'x', scope: 'fast' }).allowed) allowed++
  ok(allowed === 10, 'per-scope burst (10) applies while the global burst is 1')
  const blocked = rejects(() => rl.take({ key: 'x', scope: 'fast' }))
  ok(blocked.threw && blocked.retryAfterMs === 10, 'per-scope refill rate is applied (100/s ⇒ 10ms)')
  const def = mk({ 'vmu.ratelimit.ratePerSec': 1, 'vmu.ratelimit.burst': 1 })
  ok(def.take({}).key === 'global', 'scopeDefault is used when no key is given')
  ok(rejects(() => def.take({ cost: 0 })).code === 'VMU_INVALID_ARGUMENT', 'cost must be > 0')
}

// 7) reset needs a reason and leaves a trace
{
  const rl = mk({ 'vmu.ratelimit.ratePerSec': 1, 'vmu.ratelimit.burst': 1 })
  rl.take({ key: 'r' })
  const bad = rejects(() => rl.reset({ key: 'r' }))
  ok(bad.threw && bad.code === 'VMU_INVALID_ARGUMENT', 'reasonless reset refused')
  const good = rl.reset({ key: 'r', reason: 'operator approved burst', by: 'admin' })
  ok(good.ok === true && good.cleared === 1, 'reset clears the bucket')
  const st = rl.status()
  ok(st.lastReset && st.lastReset.reason === 'operator approved burst' && st.lastReset.by === 'admin' && typeof st.lastReset.at === 'number', 'reset trace carries who/why/when')
  ok(rl.take({ key: 'r' }).allowed === true, 'after reset the bucket starts full again')
}

// 8) key eviction is counted
{
  const rl = mk({ 'vmu.ratelimit.ratePerSec': 10, 'vmu.ratelimit.burst': 10, 'vmu.ratelimit.maxKeys': 3 })
  for (const k of ['k1', 'k2', 'k3', 'k4', 'k5']) { now += 1000; rl.take({ key: k }) }
  const st = rl.status()
  ok(st.keys <= 3, 'bucket map respects maxKeys')
  ok(st.dropped === 2, 'evictions are counted (dropped=2)')
}

// 9) read-only views never mutate; counted truncation on peek()
{
  const rl = createRateLimit({ clock: () => now, settings: { 'vmu.ratelimit.ratePerSec': 10, 'vmu.ratelimit.burst': 10 }, listCap: 2 })
  for (const k of ['a', 'b', 'c', 'd']) rl.take({ key: k })
  const p = rl.peek()
  ok(p.items.length === 2 && p.total === 4, 'peek() truncates to listCap')
  ok(p.dropped === rl.status().dropped, 'peek() reports counted drops')
  const before = JSON.stringify({ p: rl.peek(), s: rl.status(), b: rl.bucket({ key: 'a' }) })
  rl.peek(); rl.status(); rl.bucket({ key: 'a' })
  ok(JSON.stringify({ p: rl.peek(), s: rl.status(), b: rl.bucket({ key: 'a' }) }) === before, 'reads are side-effect free')
  ok(rl.bucket({ key: 'missing' }).present === false, 'bucket() on an unknown key is safe')
}

console.log('=== VMU RATELIMIT: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)
