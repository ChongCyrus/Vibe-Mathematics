// tests/vmu-turn-dispatch-k2.test.mjs — PHASE 6 / K2: the turn loop becomes callable by a DECLARED module, safely.
//
// THE GAP THIS CLOSES. `vmu.turn` was already PUBLISHED to the M4 registry (kernel/index.js ~1466) and completely absent
// from the M2 capability-gated catalogue, so a pack could DECLARE `requires: ['vmu.turn']` and be checked while a module
// could not actually call it. That is what blocks v3's planning/scheduling loop: a declared policy that wants to WAKE a
// member has no verb to do it with. The consumer audit had already judged this a mistake (its D12/W-06), and the founder's
// corrected rule (§1.4.1) is explicit - a runtime builder who wants to drive turns from their own policy HAS a consumer.
//
// THE HAZARD IT CREATES, AND WHY THE FIX IS A NAMED REFUSAL RATHER THAN SILENCE. The catalogue sits behind the loader's
// `trigger-workflow` capability, so a module running on a `turn/*` hook can now call `run()` INSIDE a turn. This loop
// keeps SINGLE-TURN state the caller cannot see - `lastAttribution`, `lastReplyForMember`, the per-member notice queue -
// and a nested turn would overwrite them under the outer turn's feet. So the framework does not forbid the legitimate use;
// it refuses the OVERLAP by name (`VMU_TURN_REENTRANT`) and leaves one obvious move: let the in-flight turn settle.
//
// WHAT IS PINNED:
//   · a second `run()` WHILE one is in flight is refused BY NAME (not nested, not silently queued);
//   · the refusal names the single-turn state that justifies it, so the reader does not have to guess;
//   · the guard CLEARS: after the in-flight turn settles, the very next `run()` works - a guard that wedged the loop
//     would be worse than the bug;
//   · a long sequential sequence still works (drive()/step() loop through run(), so they must not trip it);
//   · and the M2 catalogue really lists `vmu.turn` (a wiring assertion at the source, because the catalogue is a lazy
//     closure inside the kernel and the behavioural path to it needs a full module entry).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'

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

const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })
const mkHeld = () => {
  let release = null
  const held = new Promise((r) => { release = r })
  const t = createTurnOrchestrator({
    sectionPolicy: DECIDE_SECTIONS,
    prompt: pipeline(),
    // The seam parks the first turn until we release it, which is how a REAL long turn behaves while a hook runs.
    deliver: () => held.then(() => '```json\n{}\n```'),
  })
  return { t, release }
}

console.log('=== 1. A SECOND run() WHILE ONE IS IN FLIGHT IS REFUSED BY NAME ===')
{
  const { t, release } = mkHeld()
  const first = t.run({ member: 'r-1', phase: 'normal', round: 1 })
  // let the first run reach its await on the delivery seam
  await new Promise((r) => setImmediate(r))
  let refusal = null
  try { await t.run({ member: 'r-1', phase: 'normal', round: 2 }) } catch (e) { refusal = e }
  ok(refusal !== null, 'the nested run() was refused rather than started', { got: refusal && refusal.code })
  ok(refusal && refusal.code === 'VMU_TURN_REENTRANT', 'and it is a NAMED refusal, not a generic failure', refusal && refusal.code)
  ok(refusal && /single-turn state|attribution|notice/i.test(String(refusal.hint || '') + String(refusal.message || '')),
    'the refusal names the reason (single-turn state), so a reader does not have to guess', refusal && String(refusal.message).slice(0, 100))

  console.log('=== 2. THE GUARD CLEARS ONCE THE TURN SETTLES (a guard that wedges the loop is worse than the bug) ===')
  release()
  const firstReceipt = await first
  ok(firstReceipt && firstReceipt.ok === true, 'the in-flight turn completed normally', firstReceipt && firstReceipt.ok)
  const again = await t.run({ member: 'r-1', phase: 'normal', round: 3 })
  ok(again && again.ok === true, 'and the very next run() is accepted, so the guard does not stick', again && again.ok)
}

console.log('=== 3. SEQUENTIAL TURNS ARE UNAFFECTED (drive()/step() loop through run()) ===')
{
  const t = createTurnOrchestrator({
    sectionPolicy: DECIDE_SECTIONS,
    prompt: pipeline(),
    deliver: () => '```json\n{}\n```',
  })
  let allOk = true
  for (let i = 1; i <= 5; i++) {
    const r = await t.run({ member: 'r-1', phase: 'normal', round: i })
    if (!r || r.ok !== true) allOk = false
  }
  ok(allOk, 'five SEQUENTIAL turns all succeed - the guard only rejects overlap, never repetition', {})
}

console.log('=== 4. WIRING: THE M2 CATALOGUE REALLY LISTS vmu.turn ===')
{
  const kernelSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  ok(/'vmu\.turn':\s*turn/.test(kernelSrc),
    "the capability-gated catalogue maps 'vmu.turn' to the turn face, so a declared module can reach it", {})
  ok(/'vmu\.turn'[\s\S]{0,40}registry\.register/.test(kernelSrc) || /registry\.register\('vmu\.turn'/.test(kernelSrc),
    'and it was already published to the M4 registry (the two doors must agree: declared AND reachable)', {})
  const turnSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
  ok(/VMU_TURN_REENTRANT/.test(turnSrc), 'and the re-entrancy refusal is declared in the turn loop itself', {})
  ok(/try \{ return await runOne\(spec\) \} finally \{ turnInFlight = false \}/.test(turnSrc),
    'the guard is released in a finally block, so a THROWING turn cannot leave the loop wedged', {})
}

console.log('')
console.log('=== TURN DISPATCH (K2): ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
