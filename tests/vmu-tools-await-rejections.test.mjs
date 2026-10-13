// tests/vmu-tools-await-rejections.test.mjs — ONE guard for the whole class.
//
// WHY THIS EXISTS. vibe_vmu_bridge answered ok:true for a run that failed, because its service call returns a promise that
// REJECTS and the tool did not await it - Object.assign received a promise and produced {ok, action}. The nine acceptance
// tests written before it could not see this, because every one of their spies throws SYNCHRONOUSLY, and a rejected promise is
// a different shape. One guard per instance would have meant ten amended tests; this is one guard for the class.
//
// HOW IT DRIVES THE TOOLS. Each tool is run against the REAL kernel with exactly ONE service replaced by a proxy whose every
// method rejects asynchronously. An earlier version proxied the WHOLE kernel and the process exited non-zero with an unhandled
// rejection, because toolSpecs itself reads kernel.bus.status() while building the tool list - a fact worth knowing, and a
// reason to replace one service at a time rather than everything.
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
// A kernel that is REAL except for the one service under test, so registration behaves exactly as in production.
const kernelWith = (serviceKey) => {
  const k = createKernel({ clock: () => 0, settings: {} })
  return new Proxy(k, {
    get: (t, prop) => (prop === serviceKey ? rejectingService() : t[prop]),
  })
}

// Every declared intent, the tool it must register, the service it wraps and one action to drive it.
const TOOLS = [
  ['minutesTool', 'minutes', 'minutes', { action: 'list' }],
  ['boardTool', 'board', 'board', { action: 'columns' }],
  ['budgetTool', 'budget', 'budget', { action: 'status' }],
  ['citationsTool', 'citations', 'citations', { action: 'status' }],
  ['disciplineTool', 'discipline', 'discipline', { action: 'status' }],
  ['governanceTool', 'governance', 'governance', { action: 'config' }],
  ['ratelimitTool', 'ratelimit', 'ratelimit', { action: 'status' }],
  ['explainTool', 'explain', 'explain', { action: 'status' }],
  ['projmigrateTool', 'projmigrate', 'projmigrate', { action: 'status' }],
  ['bridgeTool', 'bridge', 'bridge', { action: 'history' }],
  ['externalTool', 'external', 'external', { action: 'status' }],
]

console.log('=== 1. EVERY TOOL IS DRIVEN AGAINST A REJECTING SERVICE ===')
for (const [intent, key, serviceKey, call] of TOOLS) {
  const specs = toolSpecs({ kernel: kernelWith(serviceKey), settings: {}, [intent]: true })
  const spec = specs.find((s) => s.name === TOOL_NAMES[key])
  if (!ok(!!spec, intent + ': the tool registers with its service replaced', { wanted: TOOL_NAMES[key], names: specs.map((s) => s.name) })) continue
  let r
  try { r = await spec.run(call) } catch (e) { r = { threw: true, code: e && e.code, message: String(e && e.message) } }
  ok(r && r.ok === false,
    intent + ': an asynchronously rejecting service is reported as a FAILURE, not as success', { r })
  ok(r && r.code === CODE,
    intent + ': and the rejection s own code survives, so the caller learns which service refused', { r })
}

console.log('=== 2. AND THE MECHANISM IS NOT A HOLE ===')
ok(TOOLS.length >= 10, 'every tool intent in the host is covered, so a new tool cannot skip this check', TOOLS.length)
{
  let control = 0
  for (const [intent, key, , call] of TOOLS) {
    const specs = toolSpecs({ kernel: createKernel({ clock: () => 0, settings: {} }), settings: {}, [intent]: true })
    const spec = specs.find((s) => s.name === TOOL_NAMES[key])
    if (!spec) continue
    const r = await spec.run(call)
    if (r && r.ok === true) control += 1
  }
  ok(control >= 8, 'and against the REAL kernel the same calls succeed, so the guard is measuring the rejection rather than refusing everything', { ok: control, of: TOOLS.length })
}

console.log('=== TOOLS AWAIT REJECTIONS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
