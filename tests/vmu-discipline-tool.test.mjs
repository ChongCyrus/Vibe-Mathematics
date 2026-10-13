// tests/vmu-discipline-tool.test.mjs - the four acceptance criteria, written before the code and now executed.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.discipline)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, disciplineTool: true })
  ok(on.length === 2 && on.some((s) => s.name === TOOL_NAMES.discipline),
    'and declaring the discipline intent registers the discipline tool', { n: on.length, names: on.map((s) => s.name) })
  const five = toolSpecs({ kernel: k, settings: {}, minutesTool: true, boardTool: true, budgetTool: true, citationsTool: true, disciplineTool: true })
  ok(five.length === 6, 'and five declared intents register exactly six tools, so no tool appears without one', { names: five.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO SIXTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { disciplineTool: true })
ok(!!spec, 'the discipline tool has a spec')
const ACTIONS = ['recordFailure', 'mayAct', 'suspend', 'restore', 'status']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the five methods the service exposes', { enum: spec.parameters.action.enum })
ok(spec.parameters.action.required === true, 'and action is required')
{
  const serviceMethods = Object.keys(k.discipline).filter((n) => typeof k.discipline[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    recordFailure: (a) => { calls.push('recordFailure'); return { ok: true, subject: a.subject, failures: 1 } },
    mayAct: (a) => { calls.push('mayAct'); return { ok: true, subject: a.subject, state: 'off' } },
    suspend: (a) => { calls.push('suspend'); return { ok: true, subject: a.subject, ms: a.ms } },
    restore: (a) => { calls.push('restore'); return { ok: true, subject: a.subject, byHuman: a.byHuman } },
    status: () => { calls.push('status'); return { ok: true, subjects: 2 } },
  }
  const s = specOf({ discipline: spy }, { disciplineTool: true })
  await s.run({ action: 'recordFailure', subject: 'm-1', kind: 'timeout', detail: 'x' })
  const r2 = await s.run({ action: 'mayAct', subject: 'm-1' })
  const r3 = await s.run({ action: 'suspend', subject: 'm-1', ms: 60000, reason: 'r' })
  const r4 = await s.run({ action: 'restore', subject: 'm-1', byHuman: true })
  const r5 = await s.run({ action: 'status' })
  ok(calls.join(',') === 'recordFailure,mayAct,suspend,restore,status',
    'every one of the five actions reaches the service, in order, once each', { calls })
  ok(r2.subject === 'm-1' && r3.ms === 60000 && r4.byHuman === true && r5.subjects === 2,
    'and the receipts carry the service s values, forwarded rather than recomputed', { r2, r3, r4, r5 })
}

console.log('=== 4. NAMED REFUSALS PASS THROUGH UNCHANGED ===')
{
  const s = specOf(k, { disciplineTool: true })
  const r = await s.run({ action: 'restore', subject: 'm-1' })
  ok(r.ok === false && r.code === 'VMU_DISCIPLINE_RESTORE_NEEDS_HUMAN',
    'a restore the kernel will not allow is refused by the KERNEL, with its own code - the tool cannot decide this', { r })
  ok(typeof r.hint === 'string' && r.hint.includes('byHuman'),
    'and its hint tells the caller what the kernel requires, which is the whole reason the refusal is named', { r })
  const withoutHuman = await s.run({ action: 'restore', subject: 'm-1', byHuman: false })
  ok(withoutHuman.ok === false && withoutHuman.code === 'VMU_DISCIPLINE_RESTORE_NEEDS_HUMAN',
    'and passing byHuman:false is refused too, so the tool neither blocks nor grants the restore itself', { withoutHuman })
  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
}

console.log('=== DISCIPLINE TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
