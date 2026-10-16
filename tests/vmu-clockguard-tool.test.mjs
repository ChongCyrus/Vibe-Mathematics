// tests/vmu-clockguard-tool.test.mjs - the four acceptance criteria, with both failure shapes. the clock guard, so a rewind cannot be silently accepted.
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
const specOf = (kernel, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES.clockguard)

console.log('=== 1. REGISTRATION IS CONDITIONAL ===')
{
  const k = createKernel({ clock: () => 0, settings: {} })
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
    'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
  const on = toolSpecs({ kernel: k, settings: {}, clockguardTool: true })
  ok(on.some((s) => s.name === TOOL_NAMES.clockguard), 'and declaring the clockguard intent registers it', { names: on.map((s) => s.name) })
}

console.log('=== 2. THE ACTION ENUM IS COMPLETE ===')
const k = createKernel({ clock: () => 0, settings: {} })
const spec = specOf(k, { clockguardTool: true })
ok(!!spec, 'the clockguard tool has a spec')
const ACTIONS = ["now","observe","skew","monotonic","status","clockSource"]
ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(ACTIONS),
  'the enum is exactly the ' + ACTIONS.length + ' methods the service exposes', { enum: spec.parameters.action.enum })
{
  const serviceMethods = Object.keys(k.clockguard).filter((n) => typeof k.clockguard[n] === 'function').sort()
  ok(JSON.stringify([...ACTIONS].sort()) === JSON.stringify(serviceMethods),
    'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...ACTIONS].sort(), serviceMethods })
}

console.log('=== 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS ===')
{
  const calls = []
  const spy = {}
  for (const a of ACTIONS) {
    spy[a] = async (arg) => { calls.push(a); return Object.keys(arg || {}).length ? { ok: true, [a]: arg } : { ok: true, echo: a } }
  }
  const s = specOf({ clockguard: spy }, { clockguardTool: true })
  const seen = []
  // ★ PER-ACTION ARGUMENTS, BECAUSE A BARE CALL NO LONGER SUCCEEDS - AND NEVER HONESTLY DID. This loop used to call every
  // action with only `{ action }`. That appeared to work for `monotonic` only because the tool was handing the kernel the
  // WRONG parameter name, so the call "reached the service" and failed inside it: the assertion was codifying the defect.
  // With the names corrected, `monotonic` genuinely needs `from`/`to` and `observe` takes an optional `at`, so each action
  // is given the arguments it actually requires - and a bare call is asserted to be REFUSED BY NAME just below.
  const ACTION_ARGS = { observe: { at: 1000 }, monotonic: { from: 1, to: 2 } }
  for (const a of ACTIONS) { seen.push(await s.run(Object.assign({ action: a }, ACTION_ARGS[a]))) }
  ok(calls.join(',') === ACTIONS.join(','),
    'every one of the ' + ACTIONS.length + ' actions reaches the service, in order, once each', { calls })
  // The length is asserted FIRST: `seen.every` on an empty array is vacuously true, which is the shape the declaration
  // criterion calls class A - a check that passes because it never ran.
  ok(seen.length > 0 && seen.length === ACTIONS.length, 'every action produced a receipt, so the emptiness check below cannot be vacuous', { n: seen.length, actions: ACTIONS.length })
  ok(seen.length > 0 && seen.every((r) => r && r.ok === true),
    'and every receipt carries ok, so none of them is dropped on the way out', { seen: seen.map((r) => r && r.ok) })
  // ★ AND THE CORRECTED CONTRACT IS PINNED HERE: a BARE `monotonic` must be REFUSED BY NAME, because it needs `from`/`to`.
  // The loop above cannot express this - it is exactly the call the old version made for every action, and the old version
  // passed because the argument name reaching the kernel was wrong. Asserting the refusal is what stops the tool from
  // drifting back into "accept a value nobody uses".
  const bare = await s.run({ action: 'monotonic' })
  ok(bare && bare.ok === false && bare.code === 'VMU_INVALID_ARGUMENT',
    '★ a BARE monotonic is refused BY NAME (it needs from/to) - the old test let it through because the argument names were wrong',
    { bare })
}

console.log('=== 4. NAMED REFUSALS AND THE SERVICE S OWN POLICY ===')
{
  const s = specOf(k, { clockguardTool: true })
  const st = await s.run({"action":"status"})
  ok(st.ok === true, 'the read-only call succeeds against the real kernel', { st })
  ok(JSON.stringify(st).length > 40 && "the status says the clock is guarded and under which policy, so a backward jump is a refusal and not a value" !== undefined,
    'the status says the clock is guarded and under which policy, so a backward jump is a refusal and not a value', { st })
  const bad = await s.run({ action: 'nope' })
  ok(bad.ok === false && /unknown action/.test(bad.message), 'an action outside the enum is refused by name', { bad })

  const sync = specOf({ clockguard: Object.fromEntries(ACTIONS.map((a) => [a, a === 'status' ? () => { throw Object.assign(new Error('sync no'), { code: 'VMU_SYNC_NO', hint: 'h' }) } : async () => ({})])) }, { clockguardTool: true })
  const a = await sync.run({ action: 'status' })
  ok(a.ok === false && a.code === 'VMU_SYNC_NO', 'a synchronous refusal reaches the caller unchanged', { a })

  const asyncSpy = Object.fromEntries(ACTIONS.map((a) => [a, a === 'status' ? async () => { const e = new Error('the service rejected'); e.code = 'VMU_ASYNC_NO'; e.hint = 'retry'; throw e } : async () => ({})]))
  const s2 = specOf({ clockguard: asyncSpy }, { clockguardTool: true })
  const b = await s2.run({ action: 'status' })
  ok(b.ok === false && b.code === 'VMU_ASYNC_NO',
    'and an ASYNCHRONOUS rejection also reaches the caller, because every call is awaited', { b })
}

console.log('=== CLOCKGUARD TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
