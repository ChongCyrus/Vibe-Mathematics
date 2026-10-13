// tests/vmu-script-and-protocol.test.mjs — round 567. The last enumerated dimension, 脚本与协议, had only ever been LOCATED, never
// driven. This drives it: an unbound seam must refuse by name, a bound seam must actually reach the subprocess, and every run must
// be recorded.
import { createScriptBridge } from '../vibe-math-vmu/kernel/script-bridge.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

console.log('=== 1. AN UNBOUND SEAM REFUSES BY NAME ===')
{
  const b = createScriptBridge({})
  const st = await b.status({})
  ok(st && st.hasSpawnSeam === false, 'status reports that no subprocess seam is bound, so the state is visible and not implied', { st })
  let refused = null
  try { await b.run({ id: 'p', file: 'node', args: ['-e', '1'] }) } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_ENGINE_UNAVAILABLE',
    'and running without a seam is REFUSED BY NAME rather than silently doing nothing - the same discipline the formal engine uses for its own spawn',
    { code: refused && refused.code, message: refused && String(refused.message).slice(0, 70) })
}

console.log('=== 2. A BOUND SEAM ACTUALLY REACHES THE SUBPROCESS ===')
{
  const calls = []
  const spawn = (req) => { calls.push(req); return { status: 0, stdout: '{"ok":true,"summary":"ran"}', stderr: '' } }
  const b = createScriptBridge({ spawn, clock: () => 'T' })
  const st = await b.status({})
  ok(st && st.hasSpawnSeam === true, 'status reports the seam IS bound', { hasSpawnSeam: st && st.hasSpawnSeam })
  await b.run({ id: 'p', file: 'node', args: ['-e', 'x'] })
  ok(calls.length === 1, 'and run calls the seam exactly once, so the script really is executed rather than merely planned', { calls: calls.length })
  const req = calls[0] || {}
  ok(req && req.file === 'node', 'and the request reaches it with the file the caller asked for', { file: req && req.file })
  ok(req && Number.isFinite(req.timeoutMs) && req.timeoutMs > 0, 'with a timeout applied, so a hung script cannot hang the institution', { timeoutMs: req && req.timeoutMs })
}

console.log('=== 3. EVERY RUN IS RECORDED ===')
{
  const spawn = () => ({ status: 0, stdout: '{}', stderr: '' })
  const b = createScriptBridge({ spawn, clock: () => 'T' })
  const before = (await b.history({})).length
  await b.run({ id: 'p', file: 'node', args: ['-e', 'x'] })
  const after = await b.history({})
  ok(after.length > before, 'a run appends to the history, so what a script did is auditable afterwards', { before, after: after.length })
}

console.log('=== 4. THE PLANNER IS SEPARATE FROM THE RUNNER ===')
{
  const b = createScriptBridge({})
  const plan = await b.plan({ file: 'node', args: ['-e', '1'] })
  ok(plan && (plan.ok === true || plan.plan), 'plan works without a seam, because planning is not running', { plan: plan && Object.keys(plan).slice(0, 5) })
}

console.log('=== SCRIPT AND PROTOCOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
