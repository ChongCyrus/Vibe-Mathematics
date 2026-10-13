// tests/vmu-projmigrate-tool.test.mjs - the four acceptance criteria, written before the code and now executed.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.projmigrate)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, projmigrateTool: true })
  ok(on.length === 2 && on.some((s) => s.name === TOOL_NAMES.projmigrate),
    'and declaring the migration intent registers the migration tool', { n: on.length, names: on.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO FIFTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { projmigrateTool: true })
ok(!!spec, 'the migration tool has a spec')
const ACTIONS = ['register', 'read', 'upgrade', 'status']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the four methods the service exposes', { enum: spec.parameters.action.enum })
ok(spec.parameters.action.required === true, 'and action is required')
{
  const serviceMethods = Object.keys(k.projmigrate).filter((n) => typeof k.projmigrate[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    register: (a) => { calls.push('register'); return { ok: true, kind: a.kind, version: a.version } },
    read: (a) => { calls.push('read'); return { ok: true, kind: a.kind, doc: a.doc } },
    upgrade: (a) => { calls.push('upgrade'); return { ok: true, kind: a.kind, to: a.to } },
    status: () => { calls.push('status'); return { ok: true, kinds: [], migrationsAreExplicit: true } },
  }
  const s = specOf({ projmigrate: spy }, { projmigrateTool: true })
  const r1 = await s.run({ action: 'register', kind: 'idempotency', version: 2, migrate: [] })
  const r2 = await s.run({ action: 'read', kind: 'idempotency', doc: { v: 1 } })
  const r3 = await s.run({ action: 'upgrade', kind: 'idempotency', doc: { v: 1 }, to: 2 })
  const r4 = await s.run({ action: 'status' })
  ok(calls.join(',') === 'register,read,upgrade,status',
    'every one of the four actions reaches the service, in order, once each', { calls })
  ok(r1.kind === 'idempotency' && r2.doc.v === 1 && r3.to === 2 && r4.migrationsAreExplicit === true,
    'and the receipts carry the service s values, forwarded rather than recomputed', { r1, r2, r3, r4 })
}

console.log('=== 4. NAMED REFUSALS PASS THROUGH UNCHANGED ===')
{
  const s = specOf(k, { projmigrateTool: true })
  const r = await s.run({ action: 'register' })
  ok(r.ok === false && r.code === 'VMU_INVALID_ARGUMENT' && /needs a kind/.test(r.message),
    'the service s own refusal survives the tool boundary - the kernel face owns the policy', { r })
  ok(typeof r.hint === 'string' && r.hint.includes('kind'),
    'and its hint shows the exact call shape, which is what makes the refusal actionable', { r })
  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
  const st = await s.run({ action: 'status' })
  ok(st.ok === true && st.unknownVersionRefused === true && st.unknownKindRefused === true,
    'and the status receipt carries the service s own invariants, so a caller can see that unknown versions are refused', { st })
}

console.log('=== PROJMIGRATE TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
