// tests/vmu-explain-tool.test.mjs - the four acceptance criteria, written before the code and now executed.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.explain)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, explainTool: true })
  ok(on.length === 2 && on.some((s) => s.name === TOOL_NAMES.explain),
    'and declaring the explain intent registers the explain tool', { n: on.length, names: on.map((s) => s.name) })
  const eight = toolSpecs({ kernel: k, settings: {}, minutesTool: true, boardTool: true, budgetTool: true, citationsTool: true, disciplineTool: true, governanceTool: true, ratelimitTool: true, explainTool: true })
  ok(eight.length === 9, 'and eight declared intents register exactly nine tools, so no tool appears without one', { names: eight.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO SIXTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { explainTool: true })
ok(!!spec, 'the explain tool has a spec')
const ACTIONS = ['checkReason', 'correlate', 'build', 'render', 'status']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the five methods the service exposes', { enum: spec.parameters.action.enum })
ok(spec.parameters.action.required === true, 'and action is required')
{
  const serviceMethods = Object.keys(k.explain).filter((n) => typeof k.explain[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}
{
  ok(Object.prototype.hasOwnProperty.call(spec.parameters, 'targetAction'),
    'and the tool names the service s action parameter targetAction, because the tool s own action is the dispatcher', Object.keys(spec.parameters))
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    checkReason: (a) => { calls.push('checkReason'); return { ok: true, reason: a.reason, action: a.action } },
    correlate: (a) => { calls.push('correlate'); return { ok: true, traceId: a.traceId } },
    build: (a) => { calls.push('build'); return { ok: true, report: { id: 'r-1', forAction: a.action } } },
    render: (a) => { calls.push('render'); return { ok: true, text: 'rendered', format: a.format } },
    status: () => { calls.push('status'); return { ok: true, reports: 4 } },
  }
  const s = specOf({ explain: spy }, { explainTool: true })
  const r1 = await s.run({ action: 'checkReason', reason: 'because the lemma fails', targetAction: 'submit' })
  await s.run({ action: 'correlate', traceId: 't-9' })
  const r3 = await s.run({ action: 'build', reason: 'trace it', targetAction: 'publish' })
  const r4 = await s.run({ action: 'render', report: { id: 'r-1' }, format: 'text' })
  const r5 = await s.run({ action: 'status' })
  ok(calls.join(',') === 'checkReason,correlate,build,render,status',
    'every one of the five actions reaches the service, in order, once each', { calls })
  ok(r1.reason === 'because the lemma fails' && r1.action === 'submit',
    'and targetAction arrives as the service s own action parameter', { r1 })
  ok(r3.report.forAction === 'publish' && r4.format === 'text' && r5.reports === 4,
    'and the receipts carry the service s values, forwarded rather than recomputed', { r3, r4, r5 })
}

console.log('=== 4. NAMED REFUSALS PASS THROUGH UNCHANGED ===')
{
  const s = specOf(k, { explainTool: true })
  const r = await s.run({ action: 'checkReason' })
  ok(r.ok === false && r.code === 'VMU_EXPLAIN_REASON_REQUIRED',
    'the service s own refusal survives the tool boundary - the kernel face owns the policy', { r })
  ok(typeof r.hint === 'string' && /reason/.test(r.hint), 'and its hint tells the caller what is required', { r })
  const c = await s.run({ action: 'correlate' })
  ok(c.ok === false && c.code === 'VMU_EXPLAIN_CORRELATION_UNKNOWN',
    'and a missing correlation key is refused with the code that names the setting that decided it', { c })
  ok(typeof c.hint === 'string' && c.hint.includes('traceId'), 'and a hint that says which one was expected', { c })
  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
}

console.log('=== EXPLAIN TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
