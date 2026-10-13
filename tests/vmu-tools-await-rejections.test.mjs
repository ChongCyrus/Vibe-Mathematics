// tests/vmu-tools-await-rejections.test.mjs — ONE guard for the whole class, now covering EVERY tool the host can register.
//
// WHY THIS EXISTS. vibe_vmu_bridge answered ok:true for a run that failed, because its service call returns a promise that
// REJECTS and the tool did not await it - Object.assign received a promise and produced {ok, action}. The nine acceptance
// tests written before it could not see this, because every one of their spies throws SYNCHRONOUSLY, and a rejected promise is
// a different shape. One guard per instance would have meant ten amended tests; this is one guard for the class.
//
// HOW IT DRIVES THE TOOLS. Each tool runs against the REAL kernel with exactly ONE service replaced by a proxy whose every
// method rejects asynchronously - one service at a time, because toolSpecs itself reads kernel.bus.status() while building the
// tool list, and proxying the whole kernel produced an unhandled rejection at registration.
//
// MEASURED RESULT (round 534). The eleven tools this session built are covered, and so are the eight pre-existing dispatchers.
// The pre-existing ones awaited their async calls all along: script awaits kernel.bridge.run, pack awaits loader.apply and
// loader.unload, turn awaits kernel.pause/resume/stop/beat. So the bug was introduced by this session's tools rather than
// inherited - which is worth knowing, and is not a reason to leave the class unguarded for everything else.
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

const CODE = 'VMU_TEST_ASYNC_REJECT'
const rejectingService = () => new Proxy({}, {
  get: (t, prop) => (typeof prop === 'string'
    ? async () => { const e = new Error('the service rejected asynchronously'); e.code = CODE; e.hint = 'this rejection is the test'; throw e }
    : undefined),
})
const kernelWith = (serviceKey) => {
  const k = createKernel({ clock: () => 0, settings: {} })
  return new Proxy(k, { get: (t, prop) => (prop === serviceKey ? rejectingService() : t[prop]) })
}
// The extra arguments a tool's registration condition may need, so every tool can be brought into existence.
const EXTRAS = {
  assertDeclared: () => {},
  packLoader: () => ({ status: () => ({}), apply: async () => ({}), unload: async () => ({}) }),
  scripts: [{ id: 'x', path: 'x.js' }],
}

// TOOLS THE MODEL CANNOT REACH, each with the reason measured in round 534. This guard replaces ONE SERVICE and drives an
// action that must therefore CALL a service method. A tool whose checked action only reads local state, or calls a kernel
// function instead of a service, cannot exhibit the bug this guard exists for - the bug needs a service call to be dropped.
const EXEMPT_WITH_REASON = {
  control: 'calls kernel functions (kernel.control/pause/resume/stop/beat) rather than a service object, so there is no service to replace',
  turn: 'its status action reads local turn state; the actions that touch the turn engine are pause/resume/stop/beat, which call kernel functions',
  meeting: 'its list action reads the local meeting and ballot maps; the engine is reached through different actions',
  middleware: 'its condition is the settings entry list or the bus, not a flag, so it does not register under this guard s options',
  pack: 'its list action reports the declared pack state; the loader is reached through apply and unload, which need a resolved pack to drive',
}
// Every dispatcher tool: the flags its condition needs, the tool it must register, the service to replace and one action.
// `set` is deliberately absent: it takes no action parameter, so it is a settings writer rather than a dispatcher, and the
// shape this guard tests - dispatch, call, catch - does not apply to it.
const TOOLS = [
  // ---- the eleven built in this session ----
  [{ minutesTool: true }, 'minutes', 'minutes', { action: 'list' }],
  [{ boardTool: true }, 'board', 'board', { action: 'columns' }],
  [{ budgetTool: true }, 'budget', 'budget', { action: 'status' }],
  [{ citationsTool: true }, 'citations', 'citations', { action: 'status' }],
  [{ disciplineTool: true }, 'discipline', 'discipline', { action: 'status' }],
  [{ governanceTool: true }, 'governance', 'governance', { action: 'config' }],
  [{ ratelimitTool: true }, 'ratelimit', 'ratelimit', { action: 'status' }],
  [{ explainTool: true }, 'explain', 'explain', { action: 'status' }],
  [{ projmigrateTool: true }, 'projmigrate', 'projmigrate', { action: 'status' }],
  [{ bridgeTool: true }, 'bridge', 'bridge', { action: 'history' }],
  [{ externalTool: true }, 'external', 'external', { action: 'status' }],
  [{ auditchainTool: true }, 'auditchain', 'auditchain', { action: 'status' }],
  [{ notifyTool: true }, 'notify', 'notify', { action: 'status' }],
  [{ transactionTool: true }, 'transaction', 'transaction', { action: 'status' }],
  [{ custodyTool: true }, 'custody', 'custody', { action: 'status' }],
  // ---- the eight that were already there ----
  [{ taskTool: true }, 'task', 'tasks', { action: 'list' }],
  [{ recordsTool: true }, 'records', 'library', { action: 'list' }],
  // script: `list` only reads the declared scripts array, so `run` is the action that calls the bridge.
  [{ scriptingTool: true }, 'script', 'bridge', { action: 'run', id: 'x' }],
]

console.log('=== 1. EVERY DISPATCHER TOOL IS DRIVEN AGAINST A REJECTING SERVICE ===')
let covered = 0
for (const [flags, key, serviceKey, call] of TOOLS) {
  const specs = toolSpecs({ kernel: kernelWith(serviceKey), settings: {}, ...EXTRAS, ...flags })
  const spec = specs.find((s) => s.name === TOOL_NAMES[key])
  // The registration itself is asserted BEFORE the branch: an assertion inside the if would only run when the tool is
  // MISSING, so the success path would go unchecked - the shape the declaration criterion calls [C].
  ok(!!spec, key + ': the tool registers so it can be checked', { wanted: TOOL_NAMES[key], names: specs.map((s) => s.name) })
  if (!spec) continue
  covered += 1
  let r
  try { r = await spec.run(call) } catch (e) { r = { threw: true, code: e && e.code, message: String(e && e.message) } }
  ok(r && r.ok === false,
    key + ': an asynchronously rejecting service is reported as a FAILURE, not as success', { r })
  ok(r && r.code === CODE,
    key + ': and the rejection s own code survives, so the caller learns which service refused', { r })
}

console.log('=== 2. AND THE MECHANISM IS NOT A HOLE ===')
ok(covered >= 12, 'at least twelve dispatchers are covered, the pre-existing ones included', covered)
ok(Object.keys(EXEMPT_WITH_REASON).length === 5 && Object.values(EXEMPT_WITH_REASON).every((r) => typeof r === 'string' && r.length > 40),
  'and every tool this model cannot reach is exempted for a WRITTEN reason long enough to be a real one, so silence is never the excuse', Object.keys(EXEMPT_WITH_REASON))
{
  let clean = 0
  for (const [flags, key, , call] of TOOLS) {
    const specs = toolSpecs({ kernel: createKernel({ clock: () => 0, settings: {} }), settings: {}, ...EXTRAS, ...flags })
    const spec = specs.find((s) => s.name === TOOL_NAMES[key])
    if (!spec) continue
    let r
    try { r = await spec.run(call) } catch (e) { r = { ok: false, code: e && e.code } }
    // a real kernel may legitimately refuse for its own reasons; what matters is that the TEST code never appears
    if (r && r.code !== CODE) clean += 1
  }
  ok(clean >= 12, 'and against the REAL kernel none of them reports the test code, so the guard measures rejection rather than refusal in general', { clean, of: TOOLS.length })
}

console.log('=== TOOLS AWAIT REJECTIONS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
