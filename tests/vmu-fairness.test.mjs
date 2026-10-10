// tests/vmu-fairness.test.mjs — 独立可跑：kernel/fairness.js 的四条硬不变式＋零机制＋确定性。
import { createFairness, POLICIES, FORBIDDEN_WEIGHT_FIELDS, apiVersion } from '../vibe-math-vmu/kernel/fairness.js'

let passed = 0, failed = 0
const ok = (c, label) => { if (c) { passed++; console.log('  ok - ' + label) } else { failed++; console.error('  FAIL - ' + label) } }
const refuses = (fn, code, needle, label) => {
  try { fn(); failed++; console.error('  FAIL - ' + label + ' (no refusal)') } catch (e) {
    const good = e && e.code === code && (!needle || String(e.message).includes(needle)) && typeof e.hint === 'string' && e.hint.length > 0
    if (good) { passed++; console.log('  ok - ' + label + ' :: ' + e.code + ' :: ' + e.message.slice(0, 90)) }
    else { failed++; console.error('  FAIL - ' + label + ' :: code=' + (e && e.code) + ' hint=' + (e && e.hint)) }
  }
}
const mk = (settings = {}) => createFairness({ clock: () => '2026-03-04T05:06:07.000Z', settings })

console.log('-- 0) 模块面 --')
ok(apiVersion === 1 && POLICIES.length === 4 && POLICIES.includes('equal') && POLICIES.includes('reserve'), 'module surface: apiVersion=1 and 4 policies')
ok(FORBIDDEN_WEIGHT_FIELDS.includes('reputation') && FORBIDDEN_WEIGHT_FIELDS.includes('trust'), 'reputation/trust are declared forbidden weight fields')

console.log('-- ① 守恒（含余数）且可复算 --')
const a = mk()
const r1 = a.allocation({ pool: 10, claimants: ['c', 'a', 'b'] })
ok(r1.sum === 10 && r1.shares.reduce((x, s) => x + s.share, 0) === 10 && r1.unallocated === 0, 'equal split conserves the pool exactly: shares=' + JSON.stringify(r1.shares.map((s) => s.id + ':' + s.share)) + ' sum=' + r1.sum)
ok(r1.shares[0].id === 'a' && r1.shares[0].share === 4, 'the remainder goes by the deterministic lexicographic rotation (a gets the extra unit)')
const r2 = a.allocation({ pool: 10, claimants: ['c', 'a', 'b'] })
ok(JSON.stringify(r1.shares) === JSON.stringify(r2.shares), 'same input ⇒ same output (reproducible)')

console.log('-- ② maxShare 硬顶（且不可能时具名拒）--')
const b = mk({ 'vmu.fairness.maxShare': 0.6 })
const rb = b.allocation({ pool: 10, claimants: ['a', 'b'] })
ok(rb.shares.every((s) => s.share <= 6) && rb.sum === 10, 'maxShare=0.6 caps each at 6 while still conserving: ' + JSON.stringify(rb.shares.map((s) => s.id + ':' + s.share)))
const c = mk({ 'vmu.fairness.maxShare': 0.4 })
refuses(() => c.allocation({ pool: 10, claimants: ['a', 'b'] }), 'VMU_FAIRNESS_QUOTA', 'caps every claimant', 'an impossible cap (0.4×2 < 1) is refused by name instead of breaking conservation')
ok(c.status().items.length === 0, 'the refused allocation left no record behind (nothing was allocated)')

console.log('-- ③ 声誉/信任不得当权重 --')
const d = mk()
refuses(() => d.allocation({ pool: 10, claimants: [{ id: 'r-1', reputation: 9 }, 'r-2'] }), 'VMU_FAIRNESS_DENIED', 'reputation', 'a reputation field on a claimant is refused by name')
refuses(() => d.allocation({ pool: 10, claimants: [{ id: 'r-1', trust: 0.9 }] }), 'VMU_FAIRNESS_DENIED', 'trust', 'a trust field is refused by name')
refuses(() => d.allocation({ pool: 10, claimants: ['r-1', 'r-2'], policy: 'priority' }), 'VMU_FAIRNESS_DENIED', 'declared weights', 'priority without declared weights is refused (no implicit scoring)')
const e = mk({ 'vmu.fairness.priorityWeights': { 'r-1': 3, 'r-2': 1 } })
const re = e.allocation({ pool: 10, claimants: ['r-1', 'r-2'], policy: 'priority' })
ok(re.sum === 10 && re.shares.find((s) => s.id === 'r-1').share > re.shares.find((s) => s.id === 'r-2').share, 'declared weights drive priority and still conserve: ' + JSON.stringify(re.shares.map((s) => s.id + ':' + s.share)))
refuses(() => d.allocation({ pool: 10, claimants: ['a'], policy: 'tyranny' }), 'VMU_FAIRNESS_DENIED', 'unknown fairness policy', 'an unknown policy is refused (definitions live in 08 §12.5)')

console.log('-- ④ 可解释 --')
const ex = a.explain({ allocationId: r1.allocationId })
ok(ex.items.length === 3 && ex.items.every((i) => typeof i.why === 'string' && i.why.length > 10), 'explain() gives a reason per claimant (n=' + ex.items.length + ')')
ok(ex.items.some((i) => /lexicographic|weight/.test(i.why)), 'the reason names the rule actually used: ' + ex.items[0].why.slice(0, 70))
refuses(() => a.explain({ allocationId: 'fa-404' }), 'VMU_NO_SUCH_OBJECT', 'no such allocation', 'explain on an unknown id is refused by name')

console.log('-- ⑤ 审计与再平衡（只读面不改状态）--')
const au = a.audit()
ok(au.allocations >= 2 && au.maxShare >= au.minShare && au.deviation === au.maxShare - au.minShare, 'audit reports max/min/deviation: ' + JSON.stringify({ max: au.maxShare, min: au.minShare, dev: au.deviation }))
ok(au.determinism.reproducible === true && au.determinism.tieBreak === 'lexicographic', 'audit states the deterministic tie-break (' + au.determinism.tieBreak + ')')
const reb = a.rebalance({ allocationId: r1.allocationId })
ok(reb.sustainable === true && reb.changed === 0, 'rebalance with the same input is a no-op (deterministic, sustainable)')

console.log('-- ⑥ 注入时钟 + ⑦ 零机制 + 只读不改状态 --')
const z = mk()
const rz = z.allocation({ pool: 10, claimants: [] })
ok(rz.sum === 0 && rz.unallocated === 10 && rz.shares.length === 0, 'zero-mechanism: no claimants ⇒ an empty allocation that conserves (unallocated=' + rz.unallocated + ')')
ok(z.status().mechanism.clockInjected === true, 'status says the clock is injected (no real time is read)')
const w0 = z.status().counts.writes
z.status(); z.status()
ok(z.status().counts.writes === w0, 'read-only calls do not increase the write counter (writes=' + w0 + ')')
const g1 = mk(), g2 = mk()
const s1 = g1.allocation({ pool: 7, claimants: ['a', 'b', 'c'] }), s2 = g2.allocation({ pool: 7, claimants: ['a', 'b', 'c'] })
ok(JSON.stringify(s1.shares) === JSON.stringify(s2.shares) && s1.sum === s2.sum, 'two instances with the same clock agree exactly (determinism)')

console.log('')
console.log('=== VMU FAIRNESS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)
