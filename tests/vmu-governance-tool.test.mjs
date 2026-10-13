// tests/vmu-governance-tool.test.mjs - the four acceptance criteria, written before the code and now executed.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.governance)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, governanceTool: true })
  ok(on.length === 2 && on.some((s) => s.name === TOOL_NAMES.governance),
    'and declaring the governance intent registers the governance tool', { n: on.length, names: on.map((s) => s.name) })
  const six = toolSpecs({ kernel: k, settings: {}, minutesTool: true, boardTool: true, budgetTool: true, citationsTool: true, disciplineTool: true, governanceTool: true })
  ok(six.length === 7, 'and six declared intents register exactly seven tools, so no tool appears without one', { names: six.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO FOURTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { governanceTool: true })
ok(!!spec, 'the governance tool has a spec')
const ACTIONS = ['keysUsed', 'config', 'droppedEvents']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the three methods the service exposes', { enum: spec.parameters.action.enum })
ok(spec.parameters.action.required === true, 'and action is required')
{
  const serviceMethods = Object.keys(k.governance).filter((n) => typeof k.governance[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    keysUsed: () => { calls.push('keysUsed'); return ['vmu.agenda.maxItems'] },
    config: () => { calls.push('config'); return { maxItems: 7 } },
    droppedEvents: () => { calls.push('droppedEvents'); return 3 },
  }
  const s = specOf({ governance: spy }, { governanceTool: true })
  const r1 = await s.run({ action: 'keysUsed' })
  const r2 = await s.run({ action: 'config' })
  const r3 = await s.run({ action: 'droppedEvents' })
  ok(calls.join(',') === 'keysUsed,config,droppedEvents',
    'every one of the three actions reaches the service, in order, once each', { calls })
  ok(r1.keysUsed[0] === 'vmu.agenda.maxItems' && r2.config.maxItems === 7 && r3.droppedEvents === 3,
    'and the receipts carry the service s values, forwarded rather than recomputed', { r1, r2, r3 })
}

console.log('=== 4. NAMED REFUSALS PASS THROUGH UNCHANGED ===')
{
  const spy = { keysUsed: () => [], config: () => ({}), droppedEvents: () => { const e = new Error('the counter is closed'); e.code = 'VMU_GOVERNANCE_CLOSED'; e.hint = 'read it before the seal'; throw e } }
  const s = specOf({ governance: spy }, { governanceTool: true })
  const r = await s.run({ action: 'droppedEvents' })
  ok(r.ok === false && r.code === 'VMU_GOVERNANCE_CLOSED',
    'the service s own code survives the tool boundary - the kernel face owns the refusal', { r })
  ok(typeof r.hint === 'string' && r.hint.length > 0, 'and so does its hint', { r })
  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
}

console.log('=== GOVERNANCE TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
