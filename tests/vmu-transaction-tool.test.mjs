// tests/vmu-transaction-tool.test.mjs - the four acceptance criteria, with both failure shapes.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.transaction)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, transactionTool: true })
  ok(on.some((s) => s.name === TOOL_NAMES.transaction), 'and declaring the transaction intent registers it', { names: on.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO SEVENTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { transactionTool: true })
ok(!!spec, 'the transaction tool has a spec')
const ACTIONS = ['begin', 'run', 'status', 'list', 'history', 'compensate']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the six methods the service exposes', { enum: spec.parameters.action.enum })
{
  const serviceMethods = Object.keys(k.transaction).filter((n) => typeof k.transaction[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    begin: async (a) => { calls.push('begin'); return { ok: true, id: a.id, steps: (a.steps || []).length } },
    run: async (a) => { calls.push('run'); return { ok: true, id: a.id, committed: true } },
    status: async () => { calls.push('status'); return { ok: true, configured: false } },
    list: async () => { calls.push('list'); return { ok: true, count: 0 } },
    history: async () => { calls.push('history'); return { ok: true, count: 0 } },
    compensate: async (a) => { calls.push('compensate'); return { ok: true, id: a.id, compensated: true } },
  }
  const s = specOf({ transaction: spy }, { transactionTool: true })
  const r1 = await s.run({ action: 'begin', id: 'tx-1', steps: [{ service: 'tasks' }] })
  const r2 = await s.run({ action: 'run', id: 'tx-1' })
  await s.run({ action: 'status' })
  await s.run({ action: 'list' })
  await s.run({ action: 'history' })
  const r6 = await s.run({ action: 'compensate', id: 'tx-1' })
  ok(calls.join(',') === 'begin,run,status,list,history,compensate',
    'every one of the six actions reaches the service, in order, once each', { calls })
  ok(r1.id === 'tx-1' && r1.steps === 1 && r2.committed === true && r6.compensated === true,
    'and the receipts carry the service s values, forwarded rather than recomputed', { r1, r2, r6 })
}

console.log('=== 4. NAMED REFUSALS PASS THROUGH - BOTH SHAPES ===')
{
  const s = specOf(k, { transactionTool: true })
  const b = await s.run({ action: 'begin' })
  ok(b.ok === false && b.code === 'VMU_INVALID_ARGUMENT' && /non-empty transaction id/.test(b.message),
    'the real kernel refuses a begin with no id, by name', { b })
  ok(typeof b.hint === 'string' && b.hint.includes('steps'),
    'and its hint shows the full step shape, which is what makes the refusal actionable', { b })
  const r = await s.run({ action: 'run', id: 'tx-none' })
  ok(r.ok === false && r.code === 'VMU_NO_SUCH_OBJECT' && /known: \(none\)/.test(String(r.hint)),
    'and running an unknown transaction says so AND reports which ones are known', { r })

  const sync = specOf({ transaction: { begin: async () => ({}), run: async () => ({}), status: async () => ({}), list: async () => ({}), history: async () => { throw Object.assign(new Error('sync no'), { code: 'VMU_SYNC_NO', hint: 'h' }) }, compensate: async () => ({}) } }, { transactionTool: true })
  const a = await sync.run({ action: 'history' })
  ok(a.ok === false && a.code === 'VMU_SYNC_NO', 'a synchronous refusal reaches the caller unchanged', { a })

  const asyncSpy = { begin: async () => ({}), run: async () => { const e = new Error('a step failed and compensation is pending'); e.code = 'VMU_ASYNC_NO'; e.hint = 'compensate'; throw e }, status: async () => ({}), list: async () => ({}), history: async () => ({}), compensate: async () => ({}) }
  const s2 = specOf({ transaction: asyncSpy }, { transactionTool: true })
  const c = await s2.run({ action: 'run', id: 'tx-2' })
  ok(c.ok === false && c.code === 'VMU_ASYNC_NO',
    'and an ASYNCHRONOUS rejection also reaches the caller, because every call is awaited', { c })

  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
}

console.log('=== TRANSACTION TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
