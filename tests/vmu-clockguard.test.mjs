// tests/vmu-clockguard.test.mjs — 独立可跑：kernel/clockguard.js 的六条不变式（N3 回拨）。
import { createClockGuard, POLICIES, apiVersion } from '../vibe-math-vmu/kernel/clockguard.js'

let passed = 0, failed = 0
const ok = (c, label) => { if (c) { passed++; console.log('  ok - ' + label) } else { failed++; console.error('  FAIL - ' + label) } }
const refuses = (fn, code, needles, label) => {
  const list = Array.isArray(needles) ? needles : (needles ? [needles] : [])
  try { fn(); failed++; console.error('  FAIL - ' + label + ' (no refusal)') } catch (e) {
    const good = e && e.code === code && list.every((n) => String(e.message).includes(n) || String(e.hint).includes(n) || String(e.from).includes(n) || String(e.last).includes(n)) && typeof e.hint === 'string' && e.hint.length > 0
    if (good) { passed++; console.log('  ok - ' + label + ' :: ' + e.code + ' :: ' + e.message.slice(0, 90)) }
    else { failed++; console.error('  FAIL - ' + label + ' :: code=' + (e && e.code) + ' msg=' + String(e && e.message).slice(0, 110)) }
  }
}
const ticker = (seq) => { let i = 0; return () => seq[Math.min(i++, seq.length - 1)] }

console.log('-- 0) 模块面 --')
ok(apiVersion === 1 && POLICIES.join('|') === 'clamp|refuse|warn', 'module surface: apiVersion=1 and the three policies')

console.log('-- ③ 零机制：必须自曝 guarded:false（且不读真实时间）--')
const z = createClockGuard({})
ok(z.status().guarded === false && /UNGUARDED/.test(z.status().note), 'with no injected clock, status() self-exposes guarded=false')
ok(Number.isFinite(z.now()) && z.status().guarded === false, 'zero-mechanism serves a replaceable default base clock while self-exposing guarded=false')

console.log('-- ① clamp（默认）：单调不减 ＋ 自曝 clamped:true --')
const a = createClockGuard({ now: ticker([1000, 900, 1100]) })
ok(a.now() === 1000, 'the first read initialises the guarded clock (1000)')
ok(a.now() === 1000, 'a backward read is CLAMPED: it does not go back (still 1000)')
ok(a.status().clamped === true && a.status().lastAction === 'clamp', 'the clamp self-exposes clamped:true / lastAction="clamp" (never silent)')
ok(a.now() === 1100, 'a forward read passes through (1100)')
ok(a.status().counts.backward === 1 && a.status().counts.clamped === 1, 'the backward event is counted (backward=1 clamped=1)')

console.log('-- ① refuse：具名拒并给两个值 --')
const b = createClockGuard({ now: ticker([5000, 4000]), onBackward: 'refuse' })
b.now()
refuses(() => b.now(), 'VMU_CLOCK_BACKWARD', ['4000', '5000'], 'policy "refuse" throws a named refusal carrying from/last')
ok(b.status().value === 5000 && b.status().counts.refused === 1, 'a refused backward read does not move the guarded value (still 5000)')

console.log('-- ① warn：值可回退但必须自曝 --')
const c = createClockGuard({ now: ticker([2000, 1500]), onBackward: 'warn' })
ok(c.now() === 2000, 'warn: the first read is normal')
ok(c.now() === 1500, 'warn: the value MAY go back (1500) — but never silently')
ok(c.status().counts.warned === 1 && c.status().skews.some((s) => s.action === 'warn' && s.selfExposed === true), 'warn self-exposes: counted (warned=1) AND recorded as a skew with selfExposed:true')
ok(c.status().skews.length === 1, 'exactly one skew record was written for the event')

console.log('-- ② 回拨/异常前跳绝不被静默吞掉 --')
const d = createClockGuard({ now: ticker([100, 9000, 50]), settings: { 'vmu.clock.forwardJumpMs': 1000 } })
d.now(); d.now()
ok(d.status().counts.forward === 1 && d.status().skews.some((s) => s.action === 'suspect' && s.jumpMs === 8900), 'an abnormal forward jump is recorded as a SUSPECT skew (jumpMs=' + (d.status().skews.find((s) => s.action === 'suspect') || {}).jumpMs + ')')
d.now()
ok(d.status().skews.length === 2 && d.status().counts.backward === 1, 'the later backward read is recorded too (skews=' + d.status().skews.length + ')')

console.log('-- ⑤ observe() 只观察不改状态 --')
const e = createClockGuard({ now: ticker([10, 5]) })
e.now(); e.now()
const before = e.status()
e.observe(); e.observe(); e.observe()
const after = e.status()
ok(after.counts.calls === before.counts.calls && after.skewCount === before.skewCount && after.counts.observes === 3, 'observe() never calls the ticker nor writes a skew (calls/skews unchanged, observes=3)')
ok(e.observe().guarded === true && e.observe().clamped === true, 'observe() exposes the guard facts read-only (guarded/clamped)')

console.log('-- ⑥ 截断必计数 --')
const f = createClockGuard({ now: ticker([100, 90, 80, 70]), settings: { 'vmu.clock.maxSkews': 2 } })
f.now(); f.now(); f.now(); f.now()
ok(f.status().skewCount === 2 && f.status().dropped.skews === 1, 'the skew log is capped and the drop count is reported (dropped=' + f.status().dropped.skews + ')')

console.log('-- 确定性 ＋ 注入时钟 --')
const g1 = createClockGuard({ now: ticker([1, 0, 2]) })
const g2 = createClockGuard({ now: ticker([1, 0, 2]) })
const seq = (g) => [g.now(), g.now(), g.now()]
ok(JSON.stringify(seq(g1)) === JSON.stringify(seq(g2)), 'two guards over the same ticker sequence behave identically (' + JSON.stringify(seq(g1)) + ')')
ok(g1.status().policy.policies.length === 3, 'the policy set is stated in status() (no real-time read anywhere in the module)')

console.log('-- 新增面：skew() / monotonic() / maxBackwardMs 容忍 / clock 参数 --')
const sk = e.skew()
ok(sk.ok === true && sk.count === sk.skews.length && sk.dropped.skews === 0, 'skew() lists the recorded events with the drop count (count=' + sk.count + ')')
const mo2 = e.monotonic({ from: 20, to: 10 })
ok(e.monotonic({ from: 10, to: 20 }).monotonic === true && mo2.monotonic === false && mo2.backwardMs === 10, 'monotonic() judges a pair of instants (backwardMs=' + mo2.backwardMs + ')')
ok(e.monotonic({ from: 0, to: 1 }).toleranceMs === 0, 'the tolerance is stated (default maxBackwardMs=0)')
const tol = createClockGuard({ clock: ticker([1000, 990, 1010]), settings: { 'vmu.clock.maxBackwardMs': 50 } })
tol.now()
ok(tol.now() === 990 && tol.status().counts.backward === 0 && tol.status().skewCount === 0, 'a backward read WITHIN maxBackwardMs is tolerated and not recorded as a skew')
ok(typeof createClockGuard({ clock: ticker([1]) }).clockSource === 'function', 'the task-book constructor name { clock } is accepted (clockSource exposed)')
console.log('')
console.log('=== VMU CLOCKGUARD: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)
