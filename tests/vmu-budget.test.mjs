// tests/vmu-budget.test.mjs — independent test for kernel/budget.js (batch-1 slice 4).
// Scenarios: every named refusal + boundaries (==limit / +1) + reserve exhaustion + warnAtRatio warns
// without refusing + counted truncation + zero-config + determinism (injected clock) + read-only views.
import { createBudget, BUDGET_KINDS, refuse } from '../vibe-math-vmu/kernel/budget.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const throws = (fn, code) => { try { fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, msg: String(e && e.message), hint: e && e.hint, limit: e && e.limit, used: e && e.used, reserved: e && e.reserved } } }

const logs = []
const mk = (settings = {}, cap = 200) => createBudget({ clock: () => 1000, log: (m) => logs.push(m), settings, listCap: cap })

// 1) zero-config: unlimited, never throws, no mutation on reads
{
  const b = mk()
  b.open({ scope: 's0' })
  b.charge({ scope: 's0', kind: 'tokens', amount: 10 ** 9 })
  ok(b.remaining({ scope: 's0' }).tokens === Infinity, 'zero-config unlimited')
  const st = JSON.stringify(b.status()); b.status(); b.list(); b.remaining({ scope: 's0' })
  ok(JSON.stringify(b.status()) === st, 'read-only views do not mutate')
}

// 2) unknown scope ⇒ named refusal with hint
{
  const b = mk()
  const r = throws(() => b.charge({ scope: 'nope', kind: 'tokens', amount: 1 }), 'VMU_BUDGET_SCOPE_UNKNOWN')
  ok(r.threw && r.code === 'VMU_BUDGET_SCOPE_UNKNOWN' && !!r.hint, 'unknown scope named refusal + hint')
  const r2 = throws(() => b.remaining({ scope: 'nope' }), 'VMU_BUDGET_SCOPE_UNKNOWN')
  ok(r2.threw && r2.code === 'VMU_BUDGET_SCOPE_UNKNOWN', 'remaining on unknown scope refuses')
}

// 3) boundary: exactly at limit OK; +1 ⇒ VMU_RESOURCE_BUDGET carrying used and limit
{
  const b = mk({ 'vmu.budget.warnAtRatio': 1 })
  b.open({ scope: 's1', limits: { tokens: 10 } })
  b.charge({ scope: 's1', kind: 'tokens', amount: 10 })
  ok(b.remaining({ scope: 's1' }).tokens === 0, '== limit accepted')
  const r = throws(() => b.charge({ scope: 's1', kind: 'tokens', amount: 1 }), 'VMU_RESOURCE_BUDGET')
  ok(r.threw && r.code === 'VMU_RESOURCE_BUDGET' && r.used === 11 && r.limit === 10, 'over by 1 ⇒ named refusal with used/limit')
}

// 4) unknown kind ⇒ named refusal
{
  const b = mk(); b.open({ scope: 's2' })
  const r = throws(() => b.charge({ scope: 's2', kind: 'bananas', amount: 1 }), 'VMU_RESOURCE_BUDGET')
  ok(r.threw && r.code === 'VMU_RESOURCE_BUDGET', 'unknown kind refuses by name')
}

// 5) reserve: spendable shrinks; spending into reserve ⇒ VMU_BUDGET_RESERVE_EXHAUSTED
{
  const b = mk()
  b.open({ scope: 's3', limits: { tokens: 100 } })
  b.reserve({ scope: 's3', ratio: 0.3 })
  b.charge({ scope: 's3', kind: 'tokens', amount: 70 })
  const r = throws(() => b.charge({ scope: 's3', kind: 'tokens', amount: 1 }), 'VMU_BUDGET_RESERVE_EXHAUSTED')
  ok(r.threw && r.code === 'VMU_BUDGET_RESERVE_EXHAUSTED' && r.limit === 100 && r.reserved === 30, 'reserve exhaustion named + values')
}

// 6) onExceed=warn: warns, does not refuse, counts a warning
{
  const b = mk({ 'vmu.budget.onExceed': 'warn' })
  b.open({ scope: 's4', limits: { turns: 1 } })
  b.charge({ scope: 's4', kind: 'turns', amount: 5 })
  const st = b.list().items.find((x) => x.scope === 's4')
  ok(st.used.turns === 5 && st.warnings >= 1, 'onExceed=warn allows and warns')
}

// 7) onExceed=pause: refuses by name and marks paused in status
{
  const b = mk({ 'vmu.budget.onExceed': 'pause' })
  b.open({ scope: 's5', limits: { subagents: 1 } })
  b.charge({ scope: 's5', kind: 'subagents', amount: 1 })
  const r = throws(() => b.charge({ scope: 's5', kind: 'subagents', amount: 1 }), 'VMU_RESOURCE_BUDGET')
  ok(r.threw && b.status().paused.includes('s5'), 'onExceed=pause refuses and marks paused')
}

// 8) warnAtRatio: warns without refusing
{
  const b = mk({ 'vmu.budget.warnAtRatio': 0.5 })
  b.open({ scope: 's6', limits: { toolCalls: 10 } })
  b.charge({ scope: 's6', kind: 'toolCalls', amount: 5 })
  ok(b.remaining({ scope: 's6' }).toolCalls === 5 && logs.some((m) => m.includes('warnAtRatio')), 'warnAtRatio warns only')
}

// 9) counted truncation on list()
{
  const b = mk({}, 2)
  for (const s of ['a', 'b', 'c', 'd']) b.open({ scope: s })
  const l = b.list()
  ok(l.items.length === 2 && l.total === 4 && l.dropped === 2, 'list() reports dropped count')
}

// 10) determinism: injected clock drives openedAt (no real time)
{
  const b = mk(); b.open({ scope: 's7' })
  ok(b.list().items[0].openedAt === 1000, 'openedAt comes from injected clock')
}

// 11) negative amount ⇒ named refusal
{
  const b = mk(); b.open({ scope: 's8' })
  const r = throws(() => b.charge({ scope: 's8', kind: 'tokens', amount: -1 }), 'VMU_RESOURCE_BUDGET')
  ok(r.threw && r.code === 'VMU_RESOURCE_BUDGET', 'negative amount refuses')
}

// 12) four kinds exist
ok(BUDGET_KINDS.length === 4 && BUDGET_KINDS.includes('tokens') && BUDGET_KINDS.includes('subagents'), 'four quota kinds')

console.log('=== VMU BUDGET: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)
