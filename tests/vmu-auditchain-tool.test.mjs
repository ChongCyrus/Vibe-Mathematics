// tests/vmu-auditchain-tool.test.mjs - the four acceptance criteria, with both failure shapes.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.auditchain)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, auditchainTool: true })
  ok(on.some((s) => s.name === TOOL_NAMES.auditchain), 'and declaring the audit-chain intent registers it', { names: on.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO SEVENTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { auditchainTool: true })
ok(!!spec, 'the audit-chain tool has a spec')
const ACTIONS = ['append', 'verifyChain', 'link', 'checkpoint', 'status', 'refresh']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the six methods the service exposes', { enum: spec.parameters.action.enum })
{
  const serviceMethods = Object.keys(k.auditchain).filter((n) => typeof k.auditchain[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    append: async (a) => { calls.push('append'); return { ok: true, hash: 'h1', entry: a.entry } },
    verifyChain: async () => { calls.push('verifyChain'); return { ok: true, verified: 3, total: 3 } },
    link: (a) => { calls.push('link'); return [{ seq: a.seq }] },
    checkpoint: async (a) => { calls.push('checkpoint'); return { ok: true, seq: a.seq, note: a.note } },
    status: () => { calls.push('status'); return { ok: true, chainable: true } },
    refresh: async (a) => { calls.push('refresh'); return { cleared: true, key: a.key } },
  }
  const s = specOf({ auditchain: spy }, { auditchainTool: true })
  const r1 = await s.run({ action: 'append', entry: { what: 'x' } })
  const r2 = await s.run({ action: 'verifyChain' })
  const r3 = await s.run({ action: 'link', seq: 7 })
  const r4 = await s.run({ action: 'checkpoint', seq: 7, note: 'n' })
  const r5 = await s.run({ action: 'status' })
  const r6 = await s.run({ action: 'refresh', key: 'k' })
  ok(calls.join(',') === 'append,verifyChain,link,checkpoint,status,refresh',
    'every one of the six actions reaches the service, in order, once each', { calls })
  ok(r1.hash === 'h1' && r1.entry.what === 'x' && r2.verified === 3,
    'and the receipts carry the service s values, forwarded rather than recomputed', { r1, r2 })
  ok(Array.isArray(r3.link) && r3.link[0].seq === 7, 'and a bare array comes back under the action s own key', { r3 })
  ok(r4.note === 'n' && r5.chainable === true && r6.cleared === true, 'and the rest arrive intact too', { r4, r5, r6 })
}

console.log('=== 4. NAMED REFUSALS AND A REAL CHAIN ===')
{
  const s = specOf(k, { auditchainTool: true })
  const st = await s.run({ action: 'status' })
  ok(st.ok === true && typeof st.hasher === 'string',
    'against the real kernel the status names the hasher, so the chain s mechanism is visible', { st })
  const ap = await s.run({ action: 'append' })
  ok(ap.ok === true && ap.prevHash === 'GENESIS' && /^[0-9a-f]{16,}$/.test(String(ap.hash)),
    'and an append yields a REAL hash chained to the genesis marker, not a placeholder', { ap })
  const vc = await s.run({ action: 'verifyChain' })
  ok(vc.ok === true && vc.genesis === 'GENESIS', 'and verifyChain reports against the same genesis', { vc })
  ok(!('verified' in vc) || typeof vc.verified === 'number', 'with a numeric count rather than a truthy guess', { vc })

  const sync = specOf({ auditchain: { append: async () => ({}), verifyChain: async () => ({}), link: () => [], checkpoint: async () => { throw Object.assign(new Error('sync no'), { code: 'VMU_SYNC_NO', hint: 'h' }) }, status: () => ({}), refresh: async () => ({}) } }, { auditchainTool: true })
  const a = await sync.run({ action: 'checkpoint' })
  ok(a.ok === false && a.code === 'VMU_SYNC_NO', 'a synchronous refusal reaches the caller unchanged', { a })

  const asyncSpy = { append: async () => { const e = new Error('the chain is sealed'); e.code = 'VMU_ASYNC_NO'; e.hint = 'unseal first'; throw e }, verifyChain: async () => ({}), link: () => [], checkpoint: async () => ({}), status: () => ({}), refresh: async () => ({}) }
  const s2 = specOf({ auditchain: asyncSpy }, { auditchainTool: true })
  const b = await s2.run({ action: 'append' })
  ok(b.ok === false && b.code === 'VMU_ASYNC_NO',
    'and an ASYNCHRONOUS rejection also reaches the caller, because every call is awaited', { b })

  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
}

console.log('=== AUDITCHAIN TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
