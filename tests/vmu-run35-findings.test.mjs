// tests/vmu-run35-findings.test.mjs — ★ PHASE 12 / live run 35, item ② (one defect, two halves).
//
// WHAT THE INSTITUTE MEASURED (transcript `_oneoff/vm-slv/full-1025-002929.jsonl`, build `0cfdc35c`):
//   1. The prompt offers `say` as the minimal receipt: `· {"say":"已经在群里说过的一句话"}（已经用 vibe_v5_say 说过时，
//      回执里可只留一句说明）`. In a turn with NO meeting bound the member wrote it, and the kernel threw
//      `VMU_NO_SUCH_OBJECT "no such meeting: undefined"` - because `FIELD_OWNERS.say` maps to `vmu.meetings.speak`.
//   2. That throw CONSUMED the held turn. The member's next `op:"reply"` for the same turn read
//      `VMU_TURN_NO_PENDING_MEMBER` ("no member turn is open, so there is nothing for this report to answer"), i.e.
//      following the prompt's own example cost them the turn, and nothing recorded WHY it went away.
//
// WHAT THIS GATE PINS
//   (a) `dispatchSkipReason` names the reachable-without-a-meeting case and returns null for everything else, so the
//       dispatch loop skips `say` BY NAME (`reason:'no-meeting-bound'`) instead of throwing inside the meeting service;
//   (b) a turn WITH a meeting still dispatches (additivity: the fix must not disable the real speech path);
//   (c) `lostTurnState` names the consumed turn (`consumed:true`, `reopened:false`, member and turn id), and each helper
//       has exactly ONE caller in the orchestrator (a helper nobody consumes is the "mechanism without consumer" defect).
//
// WHAT THIS GATE DOES NOT PROVE: it does not assemble a live prompt, so it cannot prove the prompt's example is reachable
// end to end - the transcript above is that evidence. It also does not prove that a failed apply left the earlier
// recorded effects intact; the note says they survive, and `apply`'s order is that they are recorded before dispatch.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dispatchSkipReason, hasMeetingRef, lostTurnState } from '../vibe-math-vmu/kernel/turn/index.js'

const passed = { n: 0 }
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed.n += 1; return }
  failures.push(detail === undefined ? label : label + ' :: ' + JSON.stringify(detail))
}
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = readFileSync(ROOT + 'vibe-math-vmu/kernel/turn/index.js', 'utf8')

// ---------------------------------------------------------------- (a) the skip decision, four ways
{
  const skip = dispatchSkipReason({ field: 'say', face: 'vmu.meetings', op: 'speak', payload: { say: '一句话' } })
  ok(skip !== null, 'a) a say with NO meeting gets a skip decision', skip)
  ok(skip && skip.reason === 'no-meeting-bound', 'a) the skip reason is the literal `no-meeting-bound`', skip && skip.reason)
  ok(skip && typeof skip.note === 'string' && skip.note.indexOf('nothing to attach to') !== -1,
    'a) the skip explains why a speech has nowhere to go', skip && skip.note)

  const withMeeting = dispatchSkipReason({ field: 'say', face: 'vmu.meetings', op: 'speak', payload: { say: '一句话', meeting: 'm-1' } })
  ok(withMeeting === null, 'a) ★ the SAME field WITH a meeting is NOT skipped (the real path stays reachable)', withMeeting)

  const otherOp = dispatchSkipReason({ field: 'say', face: 'vmu.meetings', op: 'attend', payload: { member: 'm' } })
  ok(otherOp === null, 'a) a different op on the same face is not affected by this guard', otherOp)

  const otherFace = dispatchSkipReason({ field: 'task', face: 'vmu.tasks', op: 'claim', payload: {} })
  ok(otherFace === null, 'a) another face is not affected by this guard', otherFace)

  ok(dispatchSkipReason(null) === null && dispatchSkipReason(undefined) === null && dispatchSkipReason('x') === null,
    'a) a non-decision is never a skip (no falsy object ever becomes a reason)')

  ok(hasMeetingRef({ meeting: 'm-1' }) === true && hasMeetingRef({ meeting: '' }) === false &&
     hasMeetingRef({ meeting: null }) === false && hasMeetingRef({}) === false && hasMeetingRef(null) === false,
    'a) `hasMeetingRef` treats empty string / null / absent as NO meeting')
}

// ---------------------------------------------------------------- (c) the lost-turn record
{
  const state = lostTurnState({ id: 't-7', member: 'member-2' })
  ok(state.consumed === true, 'c) the record says the turn was consumed', state)
  ok(state.reopened === false, 'c) ★ and that it was NOT re-opened (re-running a partial reply would be worse)', state)
  ok(state.member === 'member-2' && state.turnId === 't-7', 'c) the member and turn id are named', state)
  ok(typeof state.note === 'string' && state.note.indexOf('NOT re-opened') !== -1,
    'c) the note explains the consequence for the next reply', state && state.note)
  const fallback = lostTurnState({ turnId: 't-9', member: 'm' })
  ok(fallback.turnId === 't-9', 'c) the fallback id field is honoured when `id` is absent', fallback)
  const none = lostTurnState(null)
  ok(none.turnId === null && none.member === '', 'c) an unknown turn yields nulls, never an invented id', none)
}

// ---------------------------------------------------------------- (b) wiring: one consumer each, in the dispatcher
{
  ok(/export const dispatchSkipReason = /.test(SRC), 'b) `dispatchSkipReason` is DECLARED and exported')
  ok(SRC.split('dispatchSkipReason(d)').length - 1 === 1, 'b) and has exactly ONE consumer (a helper nobody calls is the defect this phase keeps finding)', SRC.split('dispatchSkipReason(d)').length - 1)
  ok(/const skipReason = dispatchSkipReason\(d\)/.test(SRC), 'b) the dispatcher calls it on the dispatch entry it is about to run')
  ok(/if \(skipReason !== null\)[\s\S]{0,240}?continue/.test(SRC), 'b) and a skip CONTINUES past the face lookup (no face is touched)')
  // the guard must sit BEFORE the face lookup, or a face would already have been chosen for a field that never runs
  const skipAt = SRC.indexOf('const skipReason = dispatchSkipReason(d)')
  const faceAt = SRC.indexOf('const face = map[d.face]', skipAt < 0 ? 0 : skipAt)
  ok(skipAt > 0 && faceAt > skipAt, 'b) the guard runs BEFORE `const face = map[d.face]`', { skipAt, faceAt })
  ok(/export const lostTurnState = /.test(SRC), 'b) `lostTurnState` is DECLARED and exported')
  ok(SRC.split('lostTurnState(turn)').length - 1 === 1, 'b) and has exactly ONE consumer', SRC.split('lostTurnState(turn)').length - 1)
  ok(/e\.turnState = lostTurnState\(turn\)/.test(SRC), 'b) the throwing apply attaches the record to the refusal it rethrows')
}

const total = passed.n + failures.length
if (failures.length === 0) {
  console.log('=== VMU RUN35 FINDINGS: ' + passed.n + ' passed, 0 failed ===')
  process.exit(0)
}
for (const f of failures) console.log('  FAIL ' + f)
console.log('=== VMU RUN35 FINDINGS: ' + passed.n + ' passed, ' + failures.length + ' failed (of ' + total + ') ===')
process.exit(1)
