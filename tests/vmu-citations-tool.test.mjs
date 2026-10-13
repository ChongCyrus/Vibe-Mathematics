// tests/vmu-citations-tool.test.mjs - the four acceptance criteria, written before the code and now executed.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.citations)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, citationsTool: true })
  ok(on.length === 2 && on.some((s) => s.name === TOOL_NAMES.citations),
    'and declaring the citations intent registers the citations tool', { n: on.length, names: on.map((s) => s.name) })
  const four = toolSpecs({ kernel: k, settings: {}, minutesTool: true, boardTool: true, budgetTool: true, citationsTool: true })
  ok(four.length === 5, 'and four declared intents register exactly five tools, so no tool appears without one', { names: four.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO FIFTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { citationsTool: true })
ok(!!spec, 'the citations tool has a spec')
const ACTIONS = ['identify', 'validate', 'render', 'status']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the four methods the service exposes', { enum: spec.parameters.action.enum })
ok(spec.parameters.action.required === true, 'and action is required')
{
  const serviceMethods = Object.keys(k.citations).filter((n) => typeof k.citations[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    identify: (a) => { calls.push('identify'); return { ok: true, id: 'doi:10.1/x', idType: 'doi', seen: a.ids } },
    validate: (a) => { calls.push('validate'); return { ok: true, entry: { title: a.title } } },
    render: (a) => { calls.push('render'); return { ok: true, style: a.style, text: '@article{x}' } },
    status: () => { calls.push('status'); return { ok: true, entries: 3 } },
  }
  const s = specOf({ citations: spy }, { citationsTool: true })
  const r1 = await s.run({ action: 'identify', ids: { doi: '10.1/x' } })
  await s.run({ action: 'validate', title: 'T', authors: ['A'], year: 2024 })
  const r3 = await s.run({ action: 'render', title: 'T', authors: ['A'], year: 2024, style: 'bibtex' })
  const r4 = await s.run({ action: 'status' })
  ok(calls.join(',') === 'identify,validate,render,status',
    'every one of the four actions reaches the service, in order, once each', { calls })
  ok(r1.id === 'doi:10.1/x' && r3.text === '@article{x}' && r4.entries === 3,
    'and the receipts carry the service s values, forwarded rather than recomputed', { r1, r3, r4 })
  ok(r1.seen && r1.seen.doi === '10.1/x', 'and the parameters arrive as the service declares them', { r1 })
}

console.log('=== 4. NAMED REFUSALS PASS THROUGH UNCHANGED ===')
{
  const s = specOf(k, { citationsTool: true })
  const missing = await s.run({ action: 'validate' })
  ok(missing.ok === false && missing.code === 'VMU_CITATIONS_FIELD_MISSING',
    'the service s own code survives the tool boundary - the kernel face owns the policy', { missing })
  ok(typeof missing.hint === 'string' && missing.hint.includes('vmu.citations.requiredFields'),
    'and its hint names the setting that decided it, so a caller can change the policy rather than guess', { missing })
  const noId = await s.run({ action: 'render', title: 'T', authors: ['A'], year: 2024, style: 'bibtex' })
  ok(noId.ok === false && noId.code === 'VMU_CITATIONS_IDENTIFIER_MISSING',
    'and a complete entry with no identifier is refused THE SAME WAY the service refuses it, which is the tool copying no policy of its own', { noId })
  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
}

console.log('=== CITATIONS TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
