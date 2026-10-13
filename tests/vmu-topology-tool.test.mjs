// tests/vmu-topology-tool.test.mjs - the four acceptance criteria, with both failure shapes. This is the AGENT
// SELF-ORGANISATION face, so the test also asserts that the organisation kinds are real rather than a stub list.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.topology)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, topologyTool: true })
  ok(on.some((s) => s.name === TOOL_NAMES.topology), 'and declaring the topology intent registers it', { names: on.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO SEVENTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { topologyTool: true })
ok(!!spec, 'the topology tool has a spec')
const ACTIONS = ['select', 'describe', 'route', 'assert', 'list', 'status']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the six methods the service exposes', { enum: spec.parameters.action.enum })
{
  const serviceMethods = Object.keys(k.topology).filter((n) => typeof k.topology[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    select: async (a) => { calls.push('select'); return { ok: true, kind: a.kind } },
    describe: async (a) => { calls.push('describe'); return { ok: true, kind: a.kind, edges: 2 } },
    route: async (a) => { calls.push('route'); return { ok: true, path: [a.from, a.to] } },
    assert: async (a) => { calls.push('assert'); return { ok: true, subject: a.subject } },
    list: async () => { calls.push('list'); return { ok: true, kinds: ['flat', 'star'] } },
    status: async () => { calls.push('status'); return { ok: true, mode: 'flat' } },
  }
  const s = specOf({ topology: spy }, { topologyTool: true })
  const r1 = await s.run({ action: 'select', kind: 'star' })
  await s.run({ action: 'describe', kind: 'star' })
  const r3 = await s.run({ action: 'route', from: 'a', to: 'b' })
  await s.run({ action: 'assert', subject: 's' })
  const r5 = await s.run({ action: 'list' })
  const r6 = await s.run({ action: 'status' })
  ok(calls.join(',') === 'select,describe,route,assert,list,status',
    'every one of the six actions reaches the service, in order, once each', { calls })
  ok(r1.kind === 'star' && r3.path.join('/') === 'a/b' && r5.kinds.length === 2 && r6.mode === 'flat',
    'and the receipts carry the service s values, forwarded rather than recomputed', { r1, r3, r5, r6 })
}

console.log('=== 4. THE ORGANISATION KINDS ARE REAL, AND REFUSALS PASS THROUGH ===')
{
  const s = specOf(k, { topologyTool: true })
  const st = await s.run({ action: 'status' })
  ok(st.ok === true && st.zeroMechanism === true,
    'against the real kernel the status reports zeroMechanism, so an undeclared topology is visibly absent rather than assumed', { st })
  ok(Array.isArray(st.kinds) && st.kinds.length >= 5,
    'and it names the organisation kinds the service can select, rather than a stub list', { kinds: st.kinds })
  ok(st.kinds.includes('flat') && st.kinds.includes('committee'),
    'including a flat one and a committee one, which are the two the rest of the framework speaks about', { kinds: st.kinds })
  const l = await s.run({ action: 'list' })
  ok(l.ok === true && Array.isArray(l.kinds), 'and list returns them too, so a caller can enumerate before selecting', { l })

  const u = await s.run({ action: 'describe', kind: 'no-such-kind' })
  ok(u.ok === false, 'and an unknown kind is refused rather than silently defaulted', { u })

  const sync = specOf({ topology: { select: async () => ({}), describe: async () => ({}), route: () => { throw Object.assign(new Error('sync no'), { code: 'VMU_SYNC_NO', hint: 'h' }) }, assert: async () => ({}), list: async () => ({}), status: async () => ({}) } }, { topologyTool: true })
  const a = await sync.run({ action: 'route', from: 'a', to: 'b' })
  ok(a.ok === false && a.code === 'VMU_SYNC_NO', 'a synchronous refusal reaches the caller unchanged', { a })

  const asyncSpy = { select: async () => { const e = new Error('the topology lock is held'); e.code = 'VMU_ASYNC_NO'; e.hint = 'release'; throw e }, describe: async () => ({}), route: async () => ({}), assert: async () => ({}), list: async () => ({}), status: async () => ({}) }
  const s2 = specOf({ topology: asyncSpy }, { topologyTool: true })
  const b = await s2.run({ action: 'select', kind: 'star' })
  ok(b.ok === false && b.code === 'VMU_ASYNC_NO',
    'and an ASYNCHRONOUS rejection also reaches the caller, because every call is awaited', { b })

  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
}

console.log('=== TOPOLOGY TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
