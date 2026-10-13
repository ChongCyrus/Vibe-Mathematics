// tests/vmu-formal-tool.test.mjs - the four acceptance criteria, with both failure shapes. This is the FORMALISATION face, so
// the test also asserts the service's honesty invariants are visible through the tool rather than flattened by it.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.formal)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, formalTool: true })
  ok(on.some((s) => s.name === TOOL_NAMES.formal), 'and declaring the formal intent registers it', { names: on.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO ELEVENTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { formalTool: true })
ok(!!spec, 'the formal tool has a spec')
const ACTIONS = ['check', 'axioms', 'sorryReport', 'artifacts', 'reproduce', 'list', 'status', 'keysUsed', 'config', 'trail']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the ten methods the service exposes', { enum: spec.parameters.action.enum })
{
  const serviceMethods = Object.keys(k.formal).filter((n) => typeof k.formal[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    check: async (a) => { calls.push('check'); return { ok: true, id: 'f1', verdict: a.verdict } },
    axioms: async (q) => { calls.push('axioms'); return { ok: true, axioms: ['propext'] } },
    sorryReport: async () => { calls.push('sorryReport'); return { ok: true, sory: 0, found: [] } },
    artifacts: async (id) => { calls.push('artifacts'); return { ok: true, id } },
    reproduce: async (id) => { calls.push('reproduce'); return { ok: true, id, reproduced: true } },
    list: async () => { calls.push('list'); return { ok: true, count: 1 } },
    status: async () => { calls.push('status'); return { ok: true, allowSorry: false } },
    keysUsed: async () => { calls.push('keysUsed'); return ['vmu.formal.allowSorry'] },
    config: async () => { calls.push('config'); return { ok: true, allowSorry: false } },
    trail: async () => { calls.push('trail'); return [{ at: 0 }] },
  }
  const s = specOf({ formal: spy }, { formalTool: true })
  const r1 = await s.run({ action: 'check', request: { statement: 'x', proof: 'y', verdict: 'undecided' } })
  const r2 = await s.run({ action: 'axioms', query: { src: 'z' } })
  const r3 = await s.run({ action: 'sorryReport' })
  const r4 = await s.run({ action: 'artifacts', id: 'f1' })
  const r5 = await s.run({ action: 'reproduce', id: 'f1' })
  const r6 = await s.run({ action: 'list' })
  await s.run({ action: 'status' })
  const r8 = await s.run({ action: 'keysUsed' })
  await s.run({ action: 'config' })
  const r10 = await s.run({ action: 'trail' })
  ok(calls.join(',') === 'check,axioms,sorryReport,artifacts,reproduce,list,status,keysUsed,config,trail',
    'every one of the ten actions reaches the service, in order, once each', { calls })
  ok(r1.verdict === 'undecided' && r2.axioms[0] === 'propext' && r5.reproduced === true,
    'and the receipts carry the service s values, forwarded rather than recomputed', { r1, r2, r5 })
  ok(Array.isArray(r8.keysUsed) && r8.keysUsed.length === 1 && Array.isArray(r10.trail),
    'including the two that return bare arrays, which the tool names rather than dropping', { r8, r10 })
  ok(r4.id === 'f1' && r6.count === 1, 'and the id-taking reads pass the id through', { r4, r6 })
}

console.log('=== 4. THE SERVICE S HONESTY IS VISIBLE THROUGH THE TOOL ===')
{
  const s = specOf(k, { formalTool: true })
  const st = await s.run({ action: 'status' })
  ok(st.ok === true && st.allowSorry === false,
    'against the real kernel the status reports that sorry is refused by default, so a caller cannot mistake a gap for a proof', { st })
  ok(Array.isArray(st.axiomWhitelist) && st.axiomWhitelist.includes('propext'),
    'and the axiom whitelist is visible, so a caller can see WHICH axioms are trusted', { st })
  const c = await s.run({ action: 'check' })
  ok(c.ok === false && c.code === 'VMU_MATH_INVALID_INPUT',
    'and a check with no request is refused, by name, rather than pretended', { c })
  const sr = await s.run({ action: 'sorryReport' })
  ok(sr.ok === false && sr.code === 'VMU_FORMAL_NOT_FOUND' && /check\(\)/.test(String(sr.hint)),
    'and a sorry report on nothing says how to produce one, which is what makes the refusal actionable', { sr })

  const sync = specOf({ formal: { check: async () => ({}), axioms: async () => ({}), sorryReport: () => { throw Object.assign(new Error('sync no'), { code: 'VMU_SYNC_NO', hint: 'h' }) }, artifacts: async () => ({}), reproduce: async () => ({}), list: async () => ({}), status: async () => ({}), keysUsed: async () => [], config: async () => ({}), trail: async () => [] } }, { formalTool: true })
  const a = await sync.run({ action: 'sorryReport' })
  ok(a.ok === false && a.code === 'VMU_SYNC_NO', 'a synchronous refusal reaches the caller unchanged', { a })

  const asyncSpy = { check: async () => { const e = new Error('the compiler is not bound'); e.code = 'VMU_ASYNC_NO'; e.hint = 'bind a spawn seam'; throw e }, axioms: async () => ({}), sorryReport: async () => ({}), artifacts: async () => ({}), reproduce: async () => ({}), list: async () => ({}), status: async () => ({}), keysUsed: async () => [], config: async () => ({}), trail: async () => [] }
  const s2 = specOf({ formal: asyncSpy }, { formalTool: true })
  const b = await s2.run({ action: 'check', request: {} })
  ok(b.ok === false && b.code === 'VMU_ASYNC_NO',
    'and an ASYNCHRONOUS rejection also reaches the caller, because every call is awaited', { b })

  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
}

console.log('=== FORMAL TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
