// tests/vmu-external-tool.test.mjs - the four acceptance criteria, with the failure shapes this round learned to cover: a
// synchronous throw AND an asynchronous rejection.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.external)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, externalTool: true })
  ok(on.some((s) => s.name === TOOL_NAMES.external), 'and declaring the external intent registers the external tool', { names: on.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO SEVENTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { externalTool: true })
ok(!!spec, 'the external tool has a spec')
const ACTIONS = ['fetchOne', 'fetchMany', 'normalize', 'cache', 'receipts', 'status']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the six methods the service exposes', { enum: spec.parameters.action.enum })
{
  const serviceMethods = Object.keys(k.external).filter((n) => typeof k.external[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    fetchOne: async (a) => { calls.push('fetchOne'); return { ok: true, source: a.source, id: a.id } },
    fetchMany: async (a) => { calls.push('fetchMany'); return { ok: true, fetches: (a.refs || []).length } },
    normalize: (a) => { calls.push('normalize'); return { ok: true, source: a.source } },
    cache: (a) => { calls.push('cache'); return { ok: true, items: [] } },
    receipts: (a) => { calls.push('receipts'); return { ok: true, items: [] } },
    status: () => { calls.push('status'); return { ok: true, enabled: false } },
  }
  const s = specOf({ external: spy }, { externalTool: true })
  const r1 = await s.run({ action: 'fetchOne', source: 'arxiv', id: '2401.1' })
  const r2 = await s.run({ action: 'fetchMany', refs: [{ source: 'arxiv' }, { source: 'crossref' }] })
  await s.run({ action: 'normalize', source: 'arxiv' })
  await s.run({ action: 'cache', source: 'arxiv' })
  await s.run({ action: 'receipts', source: 'arxiv' })
  const r6 = await s.run({ action: 'status' })
  ok(calls.join(',') === 'fetchOne,fetchMany,normalize,cache,receipts,status',
    'every one of the six actions reaches the service, in order, once each', { calls })
  ok(r1.source === 'arxiv' && r1.id === '2401.1' && r2.fetches === 2 && r6.enabled === false,
    'and the receipts carry the service s values, including the two ASYNC ones', { r1, r2, r6 })
}

console.log('=== 4. NAMED REFUSALS PASS THROUGH - BOTH SHAPES ===')
{
  const s = specOf(k, { externalTool: true })
  const r = await s.run({ action: 'fetchOne' })
  ok(r.ok === false && r.code === 'VMU_EXTERNAL_UNAVAILABLE',
    'the real kernel refuses a fetch with no source, by name', { r })
  ok(typeof r.hint === 'string' && r.hint.includes('declared sources'),
    'and its hint reports which sources ARE declared, which is what makes it actionable', { r })

  // synchronous throw
  const sync = specOf({ external: { fetchOne: async () => ({}), fetchMany: async () => ({}), normalize: () => { throw Object.assign(new Error('sync no'), { code: 'VMU_SYNC_NO', hint: 'h' }) }, cache: () => ({}), receipts: () => ({}), status: () => ({}) } }, { externalTool: true })
  const a = await sync.run({ action: 'normalize' })
  ok(a.ok === false && a.code === 'VMU_SYNC_NO', 'a synchronous refusal reaches the caller unchanged', { a })

  // asynchronous rejection - the shape the first ten tests could not see
  const asyncSpy = { fetchOne: async () => ({}), fetchMany: async () => { const e = new Error('the upstream is unreachable'); e.code = 'VMU_ASYNC_NO'; e.hint = 'retry later'; throw e }, normalize: () => ({}), cache: () => ({}), receipts: () => ({}), status: () => ({}) }
  const s2 = specOf({ external: asyncSpy }, { externalTool: true })
  const b = await s2.run({ action: 'fetchMany', refs: [{ source: 'x' }] })
  ok(b.ok === false && b.code === 'VMU_ASYNC_NO',
    'and an ASYNCHRONOUS rejection also reaches the caller, because every call is awaited', { b })
  ok(typeof b.hint === 'string' && b.hint === 'retry later', 'with its hint intact', { b })

  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
}

console.log('=== EXTERNAL TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
