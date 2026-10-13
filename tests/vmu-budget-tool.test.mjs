// tests/vmu-budget-tool.test.mjs - the four acceptance criteria, written before the code and now executed.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.budget)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, budgetTool: true })
  ok(on.length === 2 && on.some((s) => s.name === TOOL_NAMES.budget),
    'and declaring the budget intent registers the budget tool', { n: on.length, names: on.map((s) => s.name) })
  const three = toolSpecs({ kernel: k, settings: {}, minutesTool: true, boardTool: true, budgetTool: true })
  ok(three.length === 4, 'and three declared intents register exactly four tools, so no tool appears without one', { names: three.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO NINTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { budgetTool: true })
ok(!!spec, 'the budget tool has a spec')
const ACTIONS = ['open', 'charge', 'reserve', 'remaining', 'status', 'list', 'totals', 'perTaskShare']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the eight methods the service exposes', { enum: spec.parameters.action.enum })
ok(spec.parameters.action.required === true, 'and action is required')
{
  const serviceMethods = Object.keys(k.budget).filter((n) => typeof k.budget[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    open: (a) => { calls.push('open'); return { ok: true, scope: a.scope } },
    charge: (a) => { calls.push('charge'); return { ok: true, scope: a.scope, kind: a.kind, amount: a.amount } },
    reserve: (a) => { calls.push('reserve'); return { ok: true, ratio: a.ratio } },
    remaining: (a) => { calls.push('remaining'); return { ok: true, scope: a.scope, left: 42 } },
    status: () => { calls.push('status'); return { ok: true, scopes: 1 } },
    list: () => { calls.push('list'); return { ok: true, items: [{ scope: 'meeting:mt-1' }], total: 1 } },
    totals: () => { calls.push('totals'); return { tokens: 100 } },
    perTaskShare: () => { calls.push('perTaskShare'); return 0.25 },
  }
  const s = specOf({ budget: spy }, { budgetTool: true })
  await s.run({ action: 'open', scope: 'meeting:mt-1', limits: { tokens: 100 } })
  const r2 = await s.run({ action: 'charge', scope: 'meeting:mt-1', kind: 'tokens', amount: 5 })
  await s.run({ action: 'reserve', scope: 'meeting:mt-1', ratio: 0.2 })
  const r4 = await s.run({ action: 'remaining', scope: 'meeting:mt-1', kind: 'tokens' })
  await s.run({ action: 'status' })
  await s.run({ action: 'list' })
  const r7 = await s.run({ action: 'totals' })
  const r8 = await s.run({ action: 'perTaskShare' })
  ok(calls.join(',') === 'open,charge,reserve,remaining,status,list,totals,perTaskShare',
    'every one of the eight actions reaches the service, in order, once each', { calls })
  ok(r2.amount === 5 && r4.left === 42 && r8.perTaskShare === 0.25,
    'and the receipts carry the service s values, forwarded rather than recomputed', { r2, r4, r8 })
  ok(r7.totals && r7.totals.tokens === 100, 'and a bare value comes back under the action s own key', { r7 })
}

console.log('=== 4. NAMED REFUSALS PASS THROUGH UNCHANGED ===')
{
  const s = specOf(k, { budgetTool: true })
  const open = await s.run({ action: 'open' })
  ok(open.ok === false && open.code === 'VMU_BUDGET_SCOPE_UNKNOWN' && /needs a string scope/.test(open.message),
    'the service s own code and message survive the tool boundary - the kernel face owns the policy', { open })
  ok(typeof open.hint === 'string' && open.hint.includes('meeting:mt-1'),
    'and its hint arrives intact, which is what tells a caller how to fix the call', { open })
  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
  const charged = await s.run({ action: 'charge', scope: 'never-opened', kind: 'tokens', amount: 1 })
  ok(charged.ok === false && charged.code === 'VMU_BUDGET_SCOPE_UNKNOWN',
    'and a charge to an unknown scope is the service refusing, not the tool guessing', { charged })
}

console.log('=== BUDGET TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
