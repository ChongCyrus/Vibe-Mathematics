// tests/vmu-bridge-tool.test.mjs - the four acceptance criteria, plus the one this round proved was missing from the family:
// a spy that REJECTS ASYNCHRONOUSLY. The first nine tools used spies that throw synchronously, so none of them could have caught
// the bridge bug - the tool awaited nothing, Object.assign received a promise, and the tool reported {ok:true} for a failed run.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.bridge)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, bridgeTool: true })
  ok(on.length === 2 && on.some((s) => s.name === TOOL_NAMES.bridge),
    'and declaring the script-bridge intent registers the bridge tool', { n: on.length, names: on.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO SIXTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { bridgeTool: true })
ok(!!spec, 'the bridge tool has a spec')
const ACTIONS = ['validate', 'plan', 'run', 'status', 'history']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the five methods the service exposes', { enum: spec.parameters.action.enum })
ok(spec.parameters.action.required === true, 'and action is required')
{
  const serviceMethods = Object.keys(k.bridge).filter((n) => typeof k.bridge[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}
{
  ok(Object.prototype.hasOwnProperty.call(spec.parameters, 'request'),
    'and the tool exposes the service request as ONE object parameter, so the tool never interprets its fields', Object.keys(spec.parameters))
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    validate: (r) => { calls.push('validate'); return ['one problem'] },
    plan: (r) => { calls.push('plan'); return { ok: true, runs: false, plan: { argv: r } } },
    run: async (r) => { calls.push('run'); return { ok: true, ran: true, argv: r } },
    status: () => { calls.push('status'); return { ok: true, dryRun: false } },
    history: () => { calls.push('history'); return [{ at: 1 }] },
  }
  const s = specOf({ bridge: spy }, { bridgeTool: true })
  const r1 = await s.run({ action: 'validate', request: { inline: 'echo' } })
  const r2 = await s.run({ action: 'plan', request: { inline: 'echo' } })
  const r3 = await s.run({ action: 'run', request: { inline: 'echo' } })
  await s.run({ action: 'status' })
  const r5 = await s.run({ action: 'history' })
  ok(calls.join(',') === 'validate,plan,run,status,history',
    'every one of the five actions reaches the service, in order, once each', { calls })
  ok(JSON.stringify(r1.problems) === JSON.stringify(['one problem']),
    'validate returns the service s problem LIST under its own key', { r1 })
  ok(r2.runs === false && r3.ran === true && r5.history.length === 1,
    'and the other receipts carry the service s values, forwarded rather than recomputed', { r2, r3, r5 })
  ok(r3.ran === true && r3.action === 'run', 'and the envelope names the action while the body stays the service s own', { r3 })
  ok(JSON.stringify(r3.argv) === JSON.stringify({ inline: 'echo' }), 'and the request object arrives at the service INTACT, which is what forwarding means', { argv: r3.argv })
}

console.log('=== 4. NAMED REFUSALS PASS THROUGH - INCLUDING AN ASYNCHRONOUS ONE ===')
{
  // synchronous refusal
  const sync = specOf({ bridge: { validate: () => [], plan: () => { throw Object.assign(new Error('sync no'), { code: 'VMU_SYNC_NO', hint: 'sync hint' }) }, run: () => ({}), status: () => ({}), history: () => [] } }, { bridgeTool: true })
  const a = await sync.run({ action: 'plan', request: {} })
  ok(a.ok === false && a.code === 'VMU_SYNC_NO', 'a synchronous refusal reaches the caller unchanged', { a })

  // THE CASE THE FAMILY WAS MISSING: a promise that REJECTS
  const asyncSpy = {
    validate: () => [],
    plan: () => ({ ok: true }),
    run: async () => { throw Object.assign(new Error('no subprocess seam is bound'), { code: 'VMU_ENGINE_UNAVAILABLE', hint: 'inject { spawn }' }) },
    status: () => ({}),
    history: () => [],
  }
  const s2 = specOf({ bridge: asyncSpy }, { bridgeTool: true })
  const b = await s2.run({ action: 'run', request: { inline: 'echo' } })
  ok(b.ok === false && b.code === 'VMU_ENGINE_UNAVAILABLE',
    'an ASYNCHRONOUS refusal also reaches the caller - awaiting is what makes a rejecting service call visible', { b })
  ok(typeof b.hint === 'string' && b.hint.includes('spawn'),
    'and its hint arrives, which is how a caller learns what to inject', { b })

  // and against the REAL kernel, where no seam is bound
  const real = specOf(k, { bridgeTool: true })
  const c = await real.run({ action: 'run', request: { inline: 'echo hi' } })
  ok(c.ok === false && c.code === 'VMU_ENGINE_UNAVAILABLE',
    'and the real kernel refuses the same way, so a tool that reported success here would be lying', { c })
  const d = await real.run({ action: 'validate', request: { file: 'a.sh', inline: 'echo' } })
  ok(d.ok === true && d.problems.length === 1 && /mutually exclusive/.test(d.problems[0]),
    'while validate passes the service s own mutual-exclusion rule through as a problem list', { d })
}

console.log('=== BRIDGE TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
