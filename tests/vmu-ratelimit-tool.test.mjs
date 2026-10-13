// tests/vmu-ratelimit-tool.test.mjs - the four acceptance criteria, written before the code and now executed.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.ratelimit)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, ratelimitTool: true })
  ok(on.length === 2 && on.some((s) => s.name === TOOL_NAMES.ratelimit),
    'and declaring the ratelimit intent registers the ratelimit tool', { n: on.length, names: on.map((s) => s.name) })
  const seven = toolSpecs({ kernel: k, settings: {}, minutesTool: true, boardTool: true, budgetTool: true, citationsTool: true, disciplineTool: true, governanceTool: true, ratelimitTool: true })
  ok(seven.length === 8, 'and seven declared intents register exactly eight tools, so no tool appears without one', { names: seven.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO SIXTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { ratelimitTool: true })
ok(!!spec, 'the ratelimit tool has a spec')
const ACTIONS = ['take', 'peek', 'reset', 'bucket', 'status']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the five methods the service exposes', { enum: spec.parameters.action.enum })
ok(spec.parameters.action.required === true, 'and action is required')
{
  const serviceMethods = Object.keys(k.ratelimit).filter((n) => typeof k.ratelimit[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    take: (a) => { calls.push('take'); return { ok: true, key: a.key, cost: a.cost, allowed: true } },
    peek: (a) => { calls.push('peek'); return { ok: true, items: [], total: 0, key: a.key } },
    reset: (a) => { calls.push('reset'); return { ok: true, key: a.key, reason: a.reason } },
    bucket: () => { calls.push('bucket'); return { ok: true, items: [], total: 0 } },
    status: () => { calls.push('status'); return { ok: true, enabled: false } },
  }
  const s = specOf({ ratelimit: spy }, { ratelimitTool: true })
  const r1 = await s.run({ action: 'take', key: 'math-job', cost: 3 })
  await s.run({ action: 'peek', key: 'math-job' })
  const r3 = await s.run({ action: 'reset', key: 'math-job', reason: 'operator decided' })
  await s.run({ action: 'bucket' })
  const r5 = await s.run({ action: 'status' })
  ok(calls.join(',') === 'take,peek,reset,bucket,status',
    'every one of the five actions reaches the service, in order, once each', { calls })
  ok(r1.cost === 3 && r3.reason === 'operator decided' && r5.enabled === false,
    'and the receipts carry the service s values, forwarded rather than recomputed', { r1, r3, r5 })
}

console.log('=== 4. NAMED REFUSALS PASS THROUGH UNCHANGED ===')
{
  const s = specOf(k, { ratelimitTool: true })
  const r = await s.run({ action: 'reset' })
  ok(r.ok === false && r.code === 'VMU_INVALID_ARGUMENT' && /needs a reason/.test(r.message),
    'the service s own refusal survives the tool boundary - the kernel face owns the policy', { r })
  ok(typeof r.hint === 'string' && r.hint.includes('reason'),
    'and its hint tells the caller what the kernel requires', { r })
  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
  const take = await s.run({ action: 'take' })
  ok(take.ok === true && take.unlimited === true && /NOT limited/.test(String(take.note)),
    'and in the zero-configuration case the tool carries the service s own warning that this call was NOT limited, so the receipt cannot be mistaken for protection', { take })
}

console.log('=== RATELIMIT TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
