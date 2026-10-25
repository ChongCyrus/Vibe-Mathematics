// tests/vmu-turn-delivery-partial.test.mjs — LIVE RUN 51 residue 2: A DEADLINE MUST NOT THROW AWAY THE CHILD'S WORK.
//
// The institute's own report said, in effect: "the turn was reported as VMU_TURN_DELIVERY_TIMEOUT with receipt:null
// while the sub-agent was still running and had already written Formal/p1.lean — so the work was discarded and I was
// told nothing happened." The window itself is correct (an unbounded one-shot delivery stalls the serial queue); what
// was missing is that the refusal carried NOTHING about the turn in flight.
//
// Why this is asserted at the source level and not end-to-end: the timeout only fires when a real child misses a real
// deadline, and forcing that inside a suite would mean a sleep longer than the deadline in a unit test — the value is
// the SHAPE of the two edges, and both edges are visible in the source. The runtime half (the seam attaching `partial`
// to the error) is a live-only reading and is recorded as such in the ledger; it is NOT claimed as verified here.
//
// What this file does NOT prove: that a real child's files are collected afterwards (an agent-level behaviour), nor
// that the deadline value is right for any deployment.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1 }
  else { failed += 1; failures.push({ name, detail }); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const src = (rel) => readFileSync(path.join(REPO, rel), 'utf8')

// ---- 1. THE SEAM: the timeout error carries the partial reading ----
const deliver = src('vibe-math-vmu/host-deliver.js')
ok(/err\.partial = \{/.test(deliver), '1a the delivery timeout attaches a `partial` record to the error')
const partialBlock = deliver.slice(deliver.indexOf('err.partial = {'), deliver.indexOf('err.partial = {') + 900)
for (const key of ['turnId', 'member', 'elapsedMs', 'requestSent', 'lastPhase', 'childId', 'childIdMeans']) {
  ok(partialBlock.includes(key + ':') || partialBlock.includes(key + ' :'), '1b partial carries `' + key + '`')
}
ok(/elapsedMs: waitedMs/.test(partialBlock), '1c the elapsed time is the measured wait, not a placeholder')
ok(/err\.stillRunning = true/.test(deliver), '1d the error says the child was NOT cancelled by the deadline')
ok(/err\.stillRunningMeans = '.*bounded THIS CALL, not the child session/s.test(deliver), '1e and it says exactly which window it bounded')
ok(/err\.workspaceHint = /.test(deliver), '1f and it points the reader at the child\'s own files before concluding "nothing happened"')
ok(/childId: null/.test(partialBlock) && /does not learn the child session id unless the delivery settles/.test(partialBlock),
  '1g childId stays honestly null instead of being invented (the settled receipt is where it appears)')

// ---- 2. THE FACE: a refusal must not drop the partial reading ----
const face = src('vibe-math-vmu/tools/turn.js')
ok(/catch \(e\) \{[\s\S]{0,240}if \(!e \|\| !e\.partial\) throw e/.test(face),
  '2a the turn face re-throws errors WITHOUT a partial reading, so ordinary refusals are unchanged')
ok(/partial: e\.partial/.test(face), '2b a delivery timeout reaches the caller as a refusal that STILL carries `partial`')
for (const key of ['stillRunning', 'stillRunningMeans', 'workspaceHint', 'waitedMs', 'deliveryTimeoutMs', 'round', 'roundConsumed', 'roundCompleted']) {
  ok(face.includes(key + ':'), '2c the refusal carries `' + key + '`')
}
ok(/code: e\.code \|\| 'VMU_TURN_DELIVERY_TIMEOUT'/.test(face), '2d the code survives (a named refusal, not a generic failure)')

// ---- 3. NON-VACUITY: the two files really are the ones the seam and the face read ----
ok(/VMU_TURN_DELIVERY_TIMEOUT/.test(deliver) && /VMU_TURN_DELIVERY_TIMEOUT/.test(face),
  '3a both files name the refusal this test is about')
ok(deliver.length > 8000 && face.length > 8000, '3b the sources are the real modules, not stubs', { deliver: deliver.length, face: face.length })

console.log('')
console.log('=== VMU TURN DELIVERY PARTIAL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  for (const f of failures) console.log('   - ' + f.name)
  process.exit(1)
}
