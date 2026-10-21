// tests/vmu-turn-vote-survives-refusal.test.mjs — ROUND 86. A MEMBER'S JUDGEMENT SURVIVES A REFUSAL OF THE REST OF THE REPLY.
//
// THE DEFECT THIS PINS, MEASURED ON A REAL MACHINE AND REPRODUCED THROUGH THESE SAME TOOL FACES. In `apply`, the DISPATCH
// loop ran first and the bookkeeping loop ran after it. A reply carries several fields; when a face REFUSED one of them
// (VMU_NO_OPEN_MEETING - the meeting had closed), the dispatch loop threw, `apply` never reached the bookkeeping loop, and
// the member's own `vote_solved` was never recorded. On the real run that looked like this: eighteen replies supplied,
// twelve of them carrying "vote_solved": true, and `closureVoteRecorded: {}` - the institute could not close however many
// times it voted, and the receipt still named the member who had just answered.
//
// THE ORDER IS THE FIX, AND THE ASSERTION IS THE ORDER'S CONSEQUENCE. A judgement is bookkeeping, not a dispatch: it must
// not depend on whether some OTHER part of the same reply was accepted. So the test supplies a vote in a round that the
// framework REFUSES for a different reason, and requires the vote to be recorded anyway.
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { deliverByReturning } from '../vibe-math-vmu/kernel/turn/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const setup = () => {
  const seam = deliverByReturning()
  const kernel = createKernel({
    clock: () => 1000, settings: {}, deliverTurn: seam,
    slots: [{ id: 'member', capacity: 0, permissions: ['speak', 'vote'] }, { id: 'chair', capacity: 1, permissions: ['convene'] }],
  })
  const specs = toolSpecs({ kernel, settings: {}, turnTool: true, meetingTool: true, controlTool: true })
  return { seam, kernel, spec: (n) => specs.find((s) => s.name === n) }
}
const recorded = (kernel) => kernel.status({ detail: 'summary' }).closureVoteRecorded

console.log('=== 1. THE SEATS ARE REAL: two members hold the closure vote ===')
const { seam, kernel, spec } = setup()
await spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm1', slot: 'member', institution: 'I' })
await spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm2', slot: 'member', institution: 'I' })
{
  const st = kernel.status({ detail: 'summary' })
  ok(JSON.stringify(st.closureVote.eligible) === JSON.stringify(['m1', 'm2']),
    'both members are enfranchised, so a closure vote can be counted at all', { eligible: st.closureVote.eligible })
  ok(JSON.stringify(recorded(kernel)) === '{}', 'and nothing has been recorded yet', { recorded: recorded(kernel) })
}

console.log('=== 2. ★ A REFUSED ROUND STILL RECORDS THE JUDGEMENT THE MEMBER EXPRESSED ===')
{
  // NO MEETING IS OPENED, deliberately: applying a reply needs one, so this round is refused for a reason that has
  // nothing to do with the vote.
  const handed = await spec(TOOL_NAMES.turn).run({ op: 'step', phase: 'founding' })
  ok(handed.ok === true && handed.awaiting === true,
    'the round hands the member prompt back (the caller-played route)', { awaiting: handed.awaiting })
  const reply = JSON.stringify({ say: '占位命题已解决', progress: '投 true', vote_solved: true })
  seam.supply(reply)
  const refused = await spec(TOOL_NAMES.turn).run({ op: 'step', phase: 'founding', reply })
  // ★ PHASE 9 / round 7 (INTENTIONAL SEMANTIC CHANGE, not a relaxation): the turn now wraps the meeting error in a code that
  // names what actually went wrong - the reply carried a field that no tool in this turn could produce - and keeps the meeting
  // error inside the message. Both halves are asserted, so the wrapper adds precision instead of hiding the original reason.
  // ★ And the code is called NOT_APPLICABLE rather than NOT_CALLED because the member DID send the field: an unhelpful name
  // would send the caller looking for a missing call that was never missing.
  const msg = String((refused && refused.message) || '')
  ok(refused.ok === false && refused.code === 'VMU_TURN_FIELD_NOT_APPLICABLE' && /no meeting is open/.test(msg),
    'the round IS refused, for a reason unrelated to the vote - the code names "no tool here could produce that field" AND the message still carries the meeting cause',
    { code: refused.code, message: msg.slice(0, 160) })
  ok(recorded(kernel).m1 === true,
    '★★★ AND THE VOTE IS RECORDED ANYWAY: a judgement is bookkeeping, not a dispatch, so refusing another field of the same reply cannot discard it',
    { recorded: recorded(kernel) })
  const st = kernel.status({ detail: 'summary' })
  ok(JSON.stringify(st.closureVote.missing) === JSON.stringify(['m2']),
    'and the receipt now names only the member who has NOT answered - the one who did is no longer reported as silent',
    { missing: st.closureVote.missing })
  ok(st.closureVote.cast === false,
    'unanimity still does NOT hold with one of two members heard, so the vote is counted rather than the closure faked',
    { cast: st.closureVote.cast })
}

console.log('=== 3. AND THE COUNT IS A JUDGEMENT, NOT A TRUTHINESS TEST ===')
{
  const { seam: s2, kernel: k2, spec: sp2 } = setup()
  await sp2(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm1', slot: 'member', institution: 'I' })
  await sp2(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm2', slot: 'member', institution: 'I' })
  await sp2(TOOL_NAMES.turn).run({ op: 'step', phase: 'founding' })
  const reply = JSON.stringify({ say: 'no', vote_solved: 'FALSE' })
  s2.supply(reply)
  await sp2(TOOL_NAMES.turn).run({ op: 'step', phase: 'founding', reply })
  ok(recorded(k2).m1 === false,
    'a member who answers with the WORD false is recorded as a NO - not coerced into a yes by truthiness',
    { recorded: recorded(k2) })
}

console.log('=== TURN VOTE SURVIVES REFUSAL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
