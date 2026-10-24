// tests/vmu-roster-liveness.test.mjs — LIVE RUN 26's three serious defects, all in the roster's notion of "who is here".
//
// WHAT RUN 26 REPORTED (the institute's own acceptance report, `full-1024-203958.jsonl`):
//  1. `vibe_vmu_control { action:"hire", slot:"chair", institution:… }` with NO `member_id` was ACCEPTED and seated a
//     member whose id is the LITERAL TEXT "undefined" — `String(undefined)` — which then appeared in the roster, in the
//     closure electorate and in a vote receipt (`for:["undefined",…]`). The face's own contract says it never invents an id.
//  2. `fire` correctly marked the member `state:"ended"`, but the SLOT still counted it: the next `hire` into `chair` was
//     refused `VMU_RESOURCE_BUDGET role slot chair is full: 1/1` while the roster showed that member as ended. The chair
//     seat became unusable for the rest of the session.
//  3. The departed member stayed in the closure ELECTORATE: closure was blocked by its silence and then "unblocked" by
//     voting on its behalf, so the run's `cast:true` was reached with a vote from someone who had left. `[在册]` listed two
//     members while `[表决] 法定票数 m = 3`.
//
// WHAT THIS SUITE PROVES: those three behaviours, through the same faces a real run calls. It cannot prove what a live
// model will do; it proves the accounting and the doors.
//
// Run: node tests/vmu-roster-liveness.test.mjs   (last line: === VMU ROSTER LIVENESS: N passed, M failed ===)

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createHostAdapter } from '../vibe-math-vmu/host.js'
import { deliverByReturning } from '../vibe-math-vmu/kernel/turn/index.js'
import { PACK } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

// The faces are installed the way a deployment installs them (adapter → registered specs), so the assertions run through
// the SAME spec objects the host calls - not through kernel methods the live run cannot reach.
const unwrap = (r) => {
  if (r && typeof r === 'object' && Array.isArray(r.content)) {
    const first = r.content[0]
    const text = first && typeof first.text === 'string' ? first.text : null
    if (text) { try { return JSON.parse(text) } catch { return { raw: text } } }
  }
  if (typeof r === 'string') { try { return JSON.parse(r) } catch { return { raw: r } } }
  return r
}

const boot = async () => {
  const kernel = createKernel({
    clock: () => 0,
    settings: {},
    slots: PACK.slots,
    deliver: deliverByReturning(),
    pack: { slots: PACK.slots, promptSections: PACK.sections, bindings: PACK.bindings },
  })
  const reg = []
  const ctx = { tools: { register: async (s) => { reg.push(s); return () => {} } }, effect: null }
  const adapter = createHostAdapter({ ctx, kernel, settings: {}, instance: 'probe', controlTool: true, voteTool: true })
  await adapter.install()
  const byName = new Map(reg.map((s) => [s.name, s]))
  const call = async (face, args) => {
    const name = face === 'control' ? 'vibe_vmu_control' : face === 'vote' ? 'vibe_vmu_vote' : null
    const spec = byName.get(name)
    if (!spec) throw new Error('the adapter did not register ' + name + ' (registered: ' + [...byName.keys()].join(',') + ')')
    return unwrap(await spec.execute(args))
  }
  return { kernel, call, reg }
}

console.log('=== 1. A HIRE MUST NAME ITS MEMBER (run 26 defect 1) ===')
{
  const { kernel, call } = await boot()
  const noId = await call('control', { action: 'hire', slot: 'chair', institution: 'acceptance-institute' })
  ok(noId.ok === false && noId.code === 'VMU_INVALID_ARGUMENT',
    '★★★ hire without member_id is REFUSED by name (it used to be accepted)', { code: noId.code })
  ok(typeof noId.message === 'string' && /MEMBER ID/i.test(noId.message),
    '★ and the refusal names the missing argument (an actionable sentence, not a treasure hunt)', noId.message)
  ok(typeof noId.hint === 'string' && noId.hint.includes('undefined'),
    '★ the hint records the measured shape it replaces (a coercion into the literal "undefined")', noId.hint)
  const roster = await call('control', { action: 'roster' })
  const ids = (roster.members || roster.roster || []).map((m) => String(m.id))
  ok(!ids.includes('undefined'), '★★ and no member with the literal id "undefined" exists afterwards', ids)

  const noIdFire = await call('control', { action: 'fire' })
  ok(noIdFire.ok === false && noIdFire.code === 'VMU_INVALID_ARGUMENT',
    '★ fire without member_id is refused too (it used to "succeed" at firing a member that never existed)', noIdFire.code)
}

console.log('=== 2. CAPACITY COUNTS THE LIVING, NOT THE EVER-SEATED (run 26 defect 2) ===')
{
  const { kernel, call } = await boot()
  const chairCap = (kernel.members.roles() || []).find((r) => r.id === 'chair') || {}
  ok(Number(chairCap.capacity) > 0, 'precondition: the chair slot has a FINITE capacity (otherwise this section proves nothing)', chairCap)
  const first = await call('control', { action: 'hire', slot: 'chair', member_id: 'chair-1', institution: 'acceptance-institute' })
  ok(first.ok === true && first.id === 'chair-1', 'the chair is seated with an id we chose', { id: first.id })
  const occupiedBefore = (kernel.members.roles() || []).find((r) => r.id === 'chair').occupied
  ok(occupiedBefore === 1, 'occupancy reads 1/… while the member is live', occupiedBefore)
  const fired = await call('control', { action: 'fire', member_id: 'chair-1', reason: 'measured' })
  ok(fired.ok === true && fired.unseated === true, 'fire reports unseated:true', fired)
  const row = (kernel.members.roster() || []).find((m) => m.id === 'chair-1') || {}
  ok(row.state === 'ended', 'the roster records the member as ended', row.state)
  const occupiedAfter = (kernel.members.roles() || []).find((r) => r.id === 'chair').occupied
  ok(occupiedAfter === 0, '★★★ OCCUPANCY DROPS TO 0 — an ended member no longer holds the seat (this was the live defect)', occupiedAfter)
  const second = await call('control', { action: 'hire', slot: 'chair', member_id: 'chair-2', institution: 'acceptance-institute' })
  ok(second.ok === true, '★★ and the chair slot can be filled again (it used to be permanently full)', { code: second.code, message: second.message })
}

console.log('=== 3. THE ELECTORATE IS THE LIVE ROSTER (run 26 defect 3) ===')
{
  const { kernel, call } = await boot()
  await call('control', { action: 'hire', slot: 'member', member_id: 'member-1', institution: 'institution' })
  await call('control', { action: 'hire', slot: 'member', member_id: 'member-2', institution: 'institution' })
  await call('control', { action: 'hire', slot: 'chair', member_id: 'chair-1', institution: 'institution' })
  const before = kernel.closureVoteView()
  ok(Array.isArray(before.eligible) && before.eligible.includes('chair-1'),
    'precondition: a live chair is enfranchised (R6: the academician is in the rule\'s universe)', before.eligible)
  const eligibleBefore = before.eligible.length

  await call('control', { action: 'fire', member_id: 'chair-1', reason: 'left' })
  const after = kernel.closureVoteView()
  ok(after.eligible.length === eligibleBefore - 1,
    '★★★ the DEPARTED member leaves the electorate (its silence can no longer block, and its vote can no longer count)',
    { before: before.eligible, after: after.eligible })
  ok(!after.eligible.includes('chair-1'), '★ and it is not silently kept as an eligible id', after.eligible)

  const unknownVote = await call('vote', { member: 'nobody', solved: true })
  ok(unknownVote.ok === false && unknownVote.code === 'VMU_NO_SUCH_OBJECT',
    '★ a vote from an id that is not on the roster is refused as unknown', { code: unknownVote.code })
  ok(typeof unknownVote.hint === 'string' && unknownVote.hint.includes('member-1'),
    '★ and the hint lists who IS enrolled, so the caller can correct the id', unknownVote.hint)
  const departedVote = await call('vote', { member: 'chair-1', solved: true })
  ok(departedVote.ok === false && departedVote.code === 'VMU_STATE',
    '★★★ a vote from a DEPARTED member is refused by name (the live run counted one, and that is how cast:true was reached)',
    { code: departedVote.code, message: departedVote.message })
  ok(String(departedVote.message).includes('ended'), '★ the refusal says why (state: ended)', departedVote.message)

  const v1 = await call('vote', { member: 'member-1', solved: true })
  ok(v1.ok === true, 'a live member\'s vote is still accepted (the gate did not break the legitimate path)', v1.code)
  const mid = kernel.closureVoteView()
  ok(mid.cast === false && Array.isArray(mid.missing) && mid.missing.includes('member-2') && !mid.missing.includes('chair-1'),
    '★★ the missing list names a LIVE member and never the departed one', { missing: mid.missing, cast: mid.cast })
  await call('vote', { member: 'member-2', solved: true })
  const done = kernel.closureVoteView()
  ok(done.cast === true && done.votesCast === 2,
    '★★ closure is reached by the TWO live members alone — no vote from a departed member is needed', { cast: done.cast, votesCast: done.votesCast, for: done.for })
}

console.log('=== 4. AN UNDECLARED PARAMETER IS REFUSED BY NAME, NOT IGNORED (run 27 residual 1) ===')
{
  const { kernel, call } = await boot()
  await call('control', { action: 'hire', slot: 'chair', member_id: 'chair-1', institution: 'acceptance-institute' })
  const withValue = await call('vote', { member: 'chair-1', value: 1, reason: 'the run-27 call shape' })
  ok(withValue.ok === false, '★ the vote face refuses a call it cannot interpret instead of answering the wrong question', withValue)
  ok(withValue.code === 'VMU_INVALID_ARGUMENT', '★★ the refusal is VMU_INVALID_ARGUMENT (a call-shape error, not a state error)', withValue.code)
  ok(/no parameter named "value"/.test(withValue.message || '') && /"reason"/.test(withValue.message || ''),
    '★★★ it names BOTH undeclared parameters — the run dropped them silently', withValue.message)
  ok(/NOT applied/.test(withValue.message || ''), '★ it says the call was NOT applied (nothing was half-counted)', withValue.message)
  ok(/declared parameters are member, solved, why/.test(withValue.hint || ''), '★ the hint lists the declared set from the SAME object the schema uses', withValue.hint)
  const legit = await call('vote', { member: 'chair-1', solved: true })
  ok(legit.ok === true, '★ and a declared call still votes', legit)
  ok(kernel.closureVoteView().votesCast === 1, '★★ exactly one judgement was recorded — the refused call contributed nothing', kernel.closureVoteView().votesCast)
}

console.log('=== 5. THE ROSTER FACE SAYS WHETHER A SEAT IS FREE (run 27 residual 3) ===')
{
  const { call } = await boot()
  const empty = await call('control', { action: 'roster' })
  ok(Array.isArray(empty.slots), '★ roster carries a per-slot occupancy view (it used to carry member rows only)', Object.keys(empty))
  const chairRow = (empty.slots || []).find((s) => s && s.id === 'chair') || null
  ok(chairRow !== null, '★ the chair slot is listed', (empty.slots || []).map((s) => s && s.id))
  ok(chairRow && chairRow.occupied === 0 && chairRow.capacity === 1, '★★ it starts empty with a finite capacity, so the reading can move', chairRow)
  await call('control', { action: 'hire', slot: 'chair', member_id: 'chair-1', institution: 'acceptance-institute' })
  const seated = await call('control', { action: 'roster' })
  const seatedRow = (seated.slots || []).find((s) => s && s.id === 'chair') || null
  ok(seatedRow && seatedRow.occupied === 1, '★★ hiring moves the SAME number the roster reports (no second truth)', seatedRow)
  await call('control', { action: 'fire', member_id: 'chair-1', reason: 'acceptance' })
  const freed = await call('control', { action: 'roster' })
  const freedRow = (freed.slots || []).find((s) => s && s.id === 'chair') || null
  ok(freedRow && freedRow.occupied === 0, '★★★ firing frees the seat, read from the roster face (the run could see it only on the fire receipt)', freedRow)
  ok(/LIVING only/.test(freed.slotsMeans || ''), '★ the face explains the count is over the living, so "used:0" beside an ended member is not a contradiction', freed.slotsMeans)
}

console.log('')
console.log(failed === 0
  ? '=== VMU ROSTER LIVENESS: ' + passed + ' passed, 0 failed ==='
  : '=== VMU ROSTER LIVENESS: ' + passed + ' passed, ' + failed + ' failed ===\n' + failures.join('\n'))
process.exit(failed ? 1 : 0)
