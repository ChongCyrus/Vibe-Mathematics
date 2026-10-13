// tests/vmu-mathtools-tool.test.mjs - the four acceptance criteria, with both failure shapes.
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.mathtools)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, mathtoolsTool: true })
  ok(on.some((s) => s.name === TOOL_NAMES.mathtools), 'and declaring the math-tools intent registers it', { names: on.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO SEVENTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { mathtoolsTool: true })
ok(!!spec, 'the math tool has a spec')
const ACTIONS = ['plan', 'run', 'cacheMarkCorrupt', 'cacheView', 'receiptsView', 'status']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the six methods the service exposes', { enum: spec.parameters.action.enum })
{
  const serviceMethods = Object.keys(k.mathtools).filter((n) => typeof k.mathtools[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    plan: async (a) => { calls.push('plan'); return { ok: true, plan: { op: a.op, args: a.args } } },
    run: async (a) => { calls.push('run'); return { ok: true, ran: true, op: a.op } },
    cacheMarkCorrupt: (a) => { calls.push('cacheMarkCorrupt'); return { ok: true, cacheKey: a.cacheKey } },
    cacheView: () => { calls.push('cacheView'); return { ok: true, count: 2 } },
    receiptsView: () => { calls.push('receiptsView'); return { ok: true, count: 3 } },
    status: () => { calls.push('status'); return { ok: true, apiVersion: 1 } },
  }
  const s = specOf({ mathtools: spy }, { mathtoolsTool: true })
  const r1 = await s.run({ action: 'plan', op: 'optim/minimize', args: { x: 1 } })
  const r2 = await s.run({ action: 'run', op: 'optim/minimize' })
  await s.run({ action: 'cacheMarkCorrupt', cacheKey: 'k-1' })
  const r4 = await s.run({ action: 'cacheView' })
  const r5 = await s.run({ action: 'receiptsView' })
  const r6 = await s.run({ action: 'status' })
  ok(calls.join(',') === 'plan,run,cacheMarkCorrupt,cacheView,receiptsView,status',
    'every one of the six actions reaches the service, in order, once each', { calls })
  ok(r1.plan.op === 'optim/minimize' && r1.plan.args.x === 1 && r2.ran === true,
    'and the receipts carry the service s values, forwarded rather than recomputed', { r1, r2 })
  ok(r4.count === 2 && r5.count === 3 && r6.apiVersion === 1, 'including the three read-only views', { r4, r5, r6 })
}

console.log('=== 4. NAMED REFUSALS PASS THROUGH - BOTH SHAPES ===')
{
  const s = specOf(k, { mathtoolsTool: true })
  const r = await s.run({ action: 'plan' })
  ok(r.ok === false && r.code === 'VMU_MATH_INVALID_INPUT',
    'the real kernel refuses a plan with no op, by name', { r })
  ok(typeof r.hint === 'string' && /optim\/minimize/.test(r.hint),
    'and its hint shows a working call shape, which is what makes it actionable', { r })
  const c = await s.run({ action: 'cacheMarkCorrupt' })
  ok(c.ok === false && /cacheKey/.test(String(c.message)),
    'and a missing cache key is refused with the field named', { c })

  const sync = specOf({ mathtools: { plan: async () => ({}), run: async () => ({}), cacheMarkCorrupt: () => { throw Object.assign(new Error('sync no'), { code: 'VMU_SYNC_NO', hint: 'h' }) }, cacheView: () => ({}), receiptsView: () => ({}), status: () => ({}) } }, { mathtoolsTool: true })
  const a = await sync.run({ action: 'cacheMarkCorrupt', cacheKey: 'k' })
  ok(a.ok === false && a.code === 'VMU_SYNC_NO', 'a synchronous refusal reaches the caller unchanged', { a })

  const asyncSpy = { plan: async () => { const e = new Error('the solver is unavailable'); e.code = 'VMU_ASYNC_NO'; e.hint = 'retry'; throw e }, run: async () => ({}), cacheMarkCorrupt: () => ({}), cacheView: () => ({}), receiptsView: () => ({}), status: () => ({}) }
  const s2 = specOf({ mathtools: asyncSpy }, { mathtoolsTool: true })
  const b = await s2.run({ action: 'plan', op: 'x' })
  ok(b.ok === false && b.code === 'VMU_ASYNC_NO',
    'and an ASYNCHRONOUS rejection also reaches the caller, because every call is awaited', { b })

  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
}

console.log('=== MATHTools TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
