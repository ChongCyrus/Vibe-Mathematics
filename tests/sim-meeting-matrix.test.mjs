// tests/sim-meeting-matrix.test.mjs — the T1 gate for TB-2603, the meeting AGENDA matrix.
//
// The matrix lives in scripts/sim/scenarios/meeting-matrix.mjs: it runs the real kernel in process (0 tokens, no
// network, no xelatex) and records one CELL per behaviour with input, expectation, measured keys and a verdict. This
// test does three things a green scenario alone cannot:
//
//   1. EVERY DIMENSION IS PRESENT, BY NAME. A matrix that quietly drops the late-refuse counterexample would still
//      "pass" as a scenario; here the required cell ids are listed, and a missing one fails the test by id.
//   2. EVERY CELL IS GREEN. Two cells used to be allow-listed product defects — F-MX-01 (extendlimit refused while
//      WAITING) and F-MX-02 (the [新到的消息] line missing type/agenda/seat). RUN 256 (TB-2619) fixed both, so the
//      allow-list is RETIRED (empty). It stays an empty object on purpose: if either defect returns, its cell fails here
//      and the retired-F-MX-* assertions below name it by its original defect id instead of "some cell went red".
//   3. THE UNHAPPY PATH IS STILL A REFUSAL. Every refused receipt in the run must be declared in the scenario's
//      expectedRefusals; an undeclared refusal means the matrix accidentally exercised a path it does not understand and
//      must not pass quietly.
//
// The counterexamples are re-derived from the CELLS (not just trusted from cell.pass) as four invariants: a held late
// arrival is not seated, only the chair admits, refuse is final, and proceed() is the waiting exit only. The wait
// negative cell is checked the same way: the wrong event must fire nobody.

import { boot, tmpRoot } from '../scripts/sim/harness.mjs'
import { meetingMatrix, settings } from '../scripts/sim/scenarios/meeting-matrix.mjs'

// Empty BY INTENT since RUN 256: the two measured defects are fixed. Adding an entry here re-opens a known-defect
// exemption and is only allowed with a new measured defect + a removal plan (the header rule).
const KNOWN_DEFECTS = {}

const REQUIRED = [
  // attendance scale
  'A1-scale-2', 'A2-scale-3', 'A3-scale-attend-denied',
  // arrival shapes
  'B1-arrival-all', 'B2-arrival-missing-1', 'B3-arrival-below-floor', 'B4-arrival-none',
  // opening paths
  'C1-open-wait-all', 'C2-open-quorum-floor', 'C3-open-proceed-override', 'C3b-proceed-on-open-refused',
  'C4-extendlimit-on-waiting', 'C4b-extendlimit-on-open', 'C4c-extendlimit-over-ceiling', 'C4d-speech-extend',
  // late admission, all three policies plus counterexamples
  'D1-late-open-auto-seat', 'D2-late-chair-hold', 'D2b-late-chair-nonchair-admit-refused', 'D2c-late-chair-chair-admit',
  'D3-late-refuse-never-seats', 'D3b-late-refuse-retry-still-refused', 'D3c-late-refuse-chair-admit',
  // in-meeting waits
  'E1-wait-speak-fired', 'E2-wait-vote-fired', 'E3-wait-hand-fired', 'E4-wait-attend-all-fired',
  'E5-wait-deadline-expired', 'E6-wait-not-fired-on-wrong-event',
  // appointment notice
  'F1-appointment-mail-four-elements', 'F2-appointment-notice-block', 'F3-appointment-notice-missing-elements',
]

const fails = []
const ok = (name, why) => { console.log('PASS  ' + name + (why ? '  — ' + why : '')) }
const bad = (name, why) => { fails.push(name + ': ' + why); console.log('FAIL  ' + name + '  — ' + why) }
const expect = (name, cond, why) => { if (cond) ok(name); else bad(name, why) }

const root = tmpRoot('t1-meeting-matrix-')
const h = await boot({ root, settings })
let result
try {
  result = await meetingMatrix(h, { log: () => {} })
} finally {
  try {
    const cleanups = h.handle && Array.isArray(h.handle.cleanups) ? h.handle.cleanups : []
    await Promise.all(cleanups.map(async (c) => { try { return await c() } catch { return null } }))
  } catch { /* teardown must not turn the verdict red by itself */ }
}

const cells = (result.highlights && result.highlights.matrix && result.highlights.matrix.cells) || []
const byId = new Map(cells.map((c) => [c.id, c]))
const ids = cells.map((c) => c.id)

// ① every required cell exists by name; a missing corpus cell is named, not silently skipped
for (const id of REQUIRED) expect('cell-present ' + id, byId.has(id), 'the matrix did not produce this cell')
expect('cell-count', cells.length >= REQUIRED.length, 'expected at least ' + REQUIRED.length + ' matrix cells, got ' + cells.length)

// ② verdicts: every cell green (the allow-list is empty since RUN 256; a known-defect entry would demand the cell be red)
for (const c of cells) {
  if (KNOWN_DEFECTS[c.id]) {
    expect('known-defect-still-fails ' + c.id, c.pass === false, 'this defect appears FIXED — remove the allow-list entry and close ' + KNOWN_DEFECTS[c.id])
  } else {
    expect('cell-green ' + c.id, c.pass === true, 'cell failed: ' + JSON.stringify(c.actual))
  }
}

// ②b THE TWO RETIRED DEFECTS ARE PINNED POSITIVELY, by their own names. Deleting the allow-list alone would let a
// regression show up as a generic "cell-green" failure; these two assertions keep the original defect id in the message
// so the next reader knows which product behaviour went backwards.
const c4 = byId.get('C4-extendlimit-on-waiting')
expect('retired-F-MX-01', !!c4 && c4.pass === true && !!c4.actual && c4.actual.ok === true,
  'F-MX-01 came back: extendlimit on a WAITING meeting must be ACCEPTED and reported ok:true — ' + JSON.stringify(c4 && c4.actual))
const f3 = byId.get('F3-appointment-notice-missing-elements')
expect('retired-F-MX-02', !!f3 && f3.pass === true && !!f3.actual && f3.actual.hasType === true && f3.actual.hasAgenda === true && f3.actual.hasSeat === true,
  'F-MX-02 came back: the [新到的消息] appointment line must carry type/agenda/seat, and they must come from the same fields as the mail body — ' + JSON.stringify(f3 && f3.actual))

// ③ the four counterexample invariants, re-derived from the cells rather than trusted
const d2 = byId.get('D2-late-chair-hold')
expect('invariant-held-not-seated', !!d2 && d2.actual.pendingLate === true && Array.isArray(d2.actual.present) && !d2.actual.present.includes('r-2'),
  'a chair-policy late arrival was seated or left unrecorded: ' + JSON.stringify(d2 && d2.actual))
const d2b = byId.get('D2b-late-chair-nonchair-admit-refused')
expect('invariant-only-chair-admits', !!d2b && d2b.actual.code === 'VMU_NOT_PERMITTED', 'a non-chair admit was not refused: ' + JSON.stringify(d2b && d2b.actual))
const d3 = byId.get('D3-late-refuse-never-seats')
const d3b = byId.get('D3b-late-refuse-retry-still-refused')
expect('invariant-refuse-is-final', !!d3 && d3.actual.code === 'VMU_LATE_ADMISSION_REFUSED' && !!d3b && d3b.actual.code === 'VMU_LATE_ADMISSION_REFUSED',
  'a refuse-policy arrival seated, or a retry behaved differently: ' + JSON.stringify([d3 && d3.actual, d3b && d3b.actual]))
const c3b = byId.get('C3b-proceed-on-open-refused')
expect('invariant-proceed-only-from-waiting', !!c3b && c3b.actual.code === 'VMU_STATE', 'proceed() on an open meeting was not refused: ' + JSON.stringify(c3b && c3b.actual))
const e6 = byId.get('E6-wait-not-fired-on-wrong-event')
expect('invariant-wrong-event-fires-nobody', !!e6 && Array.isArray(e6.actual.handFired) && e6.actual.handFired.length === 0 && e6.actual.cancelled === true,
  'a hand woke a speak waiter, or unwait did not cancel: ' + JSON.stringify(e6 && e6.actual))

// ④ no refusal may be swallowed: each refused receipt must be declared in expectedRefusals (by tool+code)
const declared = new Set(((result.expectedRefusals) || []).map((r) => r.tool + ' ' + r.code))
const refused = (result.receipts || []).filter((r) => r && r.receipt && r.receipt.ok === false)
const undeclared = refused.filter((r) => !declared.has(r.tool + ' ' + r.receipt.code))
expect('refusals-declared', undeclared.length === 0,
  'undeclared refusal(s): ' + undeclared.slice(0, 5).map((r) => r.tool + ' -> ' + r.receipt.code).join('; '))

// ⑤ the corpus the lead reads must describe the matrix it claims
const groups = (result.highlights && result.highlights.matrix && result.highlights.matrix.groups) || {}
expect('groups-present', Object.keys(groups).length === 6, 'expected six matrix groups (scale, arrival, opening, late, wait, notice), got ' + Object.keys(groups).join(','))
expect('alt-boot-recorded', Array.isArray(result.highlights.matrix.altBoots) && result.highlights.matrix.altBoots.length === 1, 'the quorum-floor kernel boot (waitForAll=false) was not recorded')

const summary = fails.length === 0
  ? 'meeting-matrix: ALL PASS (' + cells.length + ' cells, ' + refused.length + ' declared refusals)'
  : 'meeting-matrix: ' + fails.length + ' FAILURE(S)\n  ' + fails.join('\n  ')
console.log('\n' + summary)
process.exitCode = fails.length === 0 ? 0 : 1
