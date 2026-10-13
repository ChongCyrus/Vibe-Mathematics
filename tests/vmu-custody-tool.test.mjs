// tests/vmu-custody-tool.test.mjs - the four acceptance criteria, with both failure shapes.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.custody)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, custodyTool: true })
  ok(on.some((s) => s.name === TOOL_NAMES.custody), 'and declaring the custody intent registers it', { names: on.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE, WITH NO SEVENTH ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { custodyTool: true })
ok(!!spec, 'the custody tool has a spec')
const ACTIONS = ['registerEntry', 'transfer', 'storageCycle', 'destroy', 'chainOf', 'status']
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the six methods the service exposes', { enum: spec.parameters.action.enum })
{
  const serviceMethods = Object.keys(k.custody).filter((n) => typeof k.custody[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {
    registerEntry: async (a) => { calls.push('registerEntry'); return { ok: true, pseudonym: a.pseudonym } },
    transfer: async (a) => { calls.push('transfer'); return { ok: true, entry: a.entry, to: a.to } },
    storageCycle: async (a) => { calls.push('storageCycle'); return { ok: true, entry: a.entry, cycles: 2 } },
    destroy: async (a) => { calls.push('destroy'); return { ok: true, entry: a.entry, destroyed: true } },
    chainOf: async (a) => { calls.push('chainOf'); return { ok: true, chain: [{ entry: a.entry }] } },
    status: async () => { calls.push('status'); return { ok: true, entries: 3 } },
  }
  const s = specOf({ custody: spy }, { custodyTool: true })
  const r1 = await s.run({ action: 'registerEntry', pseudonym: 'anon-1' })
  const r2 = await s.run({ action: 'transfer', entry: 'e-1', to: 'anon-2' })
  await s.run({ action: 'storageCycle', entry: 'e-1' })
  await s.run({ action: 'destroy', entry: 'e-1' })
  const r5 = await s.run({ action: 'chainOf', entry: 'e-1' })
  const r6 = await s.run({ action: 'status' })
  ok(calls.join(',') === 'registerEntry,transfer,storageCycle,destroy,chainOf,status',
    'every one of the six actions reaches the service, in order, once each', { calls })
  ok(r1.pseudonym === 'anon-1' && r2.to === 'anon-2' && r5.chain[0].entry === 'e-1' && r6.entries === 3,
    'and the receipts carry the service s values, forwarded rather than recomputed', { r1, r2, r5, r6 })
}

console.log('=== 4. NAMED REFUSALS AND THE SERVICE S OWN POLICY ===')
{
  const s = specOf(k, { custodyTool: true })
  const st = await s.run({ action: 'status' })
  ok(st.ok === true && st.policy && st.policy.requireChain === true,
    'against the real kernel the status exposes the service s policy, so a caller can see the chain is mandatory', { st })
  ok(typeof st.policy.ledgerDir === 'string' && st.policy.ledgerDir.length > 0,
    'including where the ledger is kept, which is what makes the record findable', { st })
  const r = await s.run({ action: 'registerEntry' })
  ok(r.ok === false && r.code === 'VMU_INVALID_ARGUMENT' && /needs a pseudonym/.test(r.message),
    'and registering without a pseudonym is refused by the service, by name - the service accepts only pseudonyms', { r })
  const u = await s.run({ action: 'chainOf', entry: 'nope' })
  ok(u.ok === false && /VMU_CUSTODY/.test(String(u.code)),
    'and an unknown entry is refused with the custody family s own code', { u })

  const sync = specOf({ custody: { registerEntry: async () => ({}), transfer: async () => ({}), storageCycle: async () => ({}), destroy: async () => ({}), chainOf: () => { throw Object.assign(new Error('sync no'), { code: 'VMU_SYNC_NO', hint: 'h' }) }, status: async () => ({}) } }, { custodyTool: true })
  const a = await sync.run({ action: 'chainOf', entry: 'e' })
  ok(a.ok === false && a.code === 'VMU_SYNC_NO', 'a synchronous refusal reaches the caller unchanged', { a })

  const asyncSpy = { registerEntry: async () => { const e = new Error('the ledger is sealed'); e.code = 'VMU_ASYNC_NO'; e.hint = 'unseal'; throw e }, transfer: async () => ({}), storageCycle: async () => ({}), destroy: async () => ({}), chainOf: async () => ({}), status: async () => ({}) }
  const s2 = specOf({ custody: asyncSpy }, { custodyTool: true })
  const b = await s2.run({ action: 'registerEntry', pseudonym: 'x' })
  ok(b.ok === false && b.code === 'VMU_ASYNC_NO',
    'and an ASYNCHRONOUS rejection also reaches the caller, because every call is awaited', { b })

  const unknown = await s.run({ action: 'nope' })
  ok(unknown.ok === false && /unknown action/.test(unknown.message), 'and an action outside the enum is refused by name', { unknown })
}

console.log('=== CUSTODY TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
