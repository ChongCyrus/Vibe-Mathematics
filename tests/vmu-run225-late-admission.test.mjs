#!/usr/bin/env node
/**
 * tests/vmu-run225-late-admission.test.mjs — RUN 225-B: 迟到入席是「本会的政策」，不是一句静默的 yes。
 *
 * WHAT THIS PROVES (each assertion is paired with the premise it needs, per RULE E):
 *  §1 every meeting DECLARES a late-admission policy — default `open`, unknown word refused BY NAME with the legal
 *     list printed, and the read faces carry the declared policy back;
 *  §2 the policy actually decides what `attend()` does with a LATE arrival, on a STARTED meeting and on a SCHEDULED
 *     one (a scheduled meeting seats early arrivals under every policy: policy bites only when the arrival is late);
 *  ...   open   => seated, `late:true`, `lateAdmission:"open"`, `pendingLate:false`;
 *  ...   chair  => NOT seated, `pendingLate:true`, a row on the meeting own `pendingLate` list (with `decidedAt:null`
 *                 until the chair decides), repeat attend does not duplicate the row;
 *  ...   refuse => `VMU_LATE_ADMISSION_REFUSED`, hint gives the TWO repairs (chair admit, or next meeting) and says a
 *                 retry of attend() is useless; the refused member is NOT seated and NOT held at the door;
 *  §3 `admit()` is the chair-only door: it names the missing actor, refuses a non-chair actor, refuses a member that
 *     was never held at the door, refuses a member who is already seated, refuses a meeting that declares NO chair,
 *     and on success seats the member with `admittedBy`/`admittedAt` + the REMAINING door list, recorded in
 *     `lateAdmissions` and in the minutes;
 *  §4 `waitStates[]` / `waitRecommended` / `waitRecommendedWhy` are the same fact on `meetingView` and `summary`, and
 *     they say out loud that a member is NOT a resident process (a turn ends and hands back to the chair);
 *  §5 the TOOL face: `admit` is in the action enum and in SERVICE_CROSSING_ACTIONS, the pack boot registers it, and
 *     `status`/`summary` return the new read block through the service registry.
 *
 * Run: node tests/vmu-run225-late-admission.test.mjs   (targeted only — never the full T1 suite)
 */
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs' // fs-purpose: temp kernel roots + the docs contract line
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { makeMeetingSpec, SERVICE_CROSSING_ACTIONS } from '../vibe-math-vmu/tools/meeting.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(HERE)
const VMU = join(REPO, 'vibe-math-vmu')
const TMP = join(tmpdir(), 'vmu-run225-late-admission')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) }
  else { failed++; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const attempt = (fn) => { try { return { ok: true, value: fn() } } catch (e) { return { ok: false, error: e } } }
const errOf = (fn) => { const r = attempt(fn); return r.ok ? null : r.error }
const codeOf = (fn) => { const e = errOf(fn); return e ? (e.code || 'no-code') : 'NO-THROW' }
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, typeof text === 'string' ? text.slice(0, 240) : text)

/* ── kernel harness: same shape tests/vmu-meetings.test.mjs uses ─────────────────────────────────────────── */

let NOW = 1000
const rec = (vals) => ({ get: (k) => (vals || {})[k] })
const mk = (settings = {}) => {
  NOW = 1000
  return createMeetings({
    clock: () => NOW,
    settings: rec(Object.assign({ 'vmu.meetings.quorumCap': 0, 'vmu.meetings.lateAfterMs': 100 }, settings)),
    log: () => {},
  })
}
const MEET = { type: 'ordinary', chair: 'acad', roster: ['acad', 'r-1', 'r-2'] }

console.log('\n=== 1. THE PER-MEETING POLICY: declared, defaulted, validated BY NAME ===')
{
  const t = mk()
  const o = t.open(Object.assign({}, MEET, { at: 500 }))
  ok(o.ok === true && typeof o.meeting === 'string', 'premise: a service meeting opens', o)
  // RUN 255 / TB-2610: the DEFAULT late-admission policy is now "chair" (a late arrival is a request to be seated,
  // so the chair decides it). The permissive policy stays available - section 2c below proves an explicit "open" still
  // seats a late arrival - so this block only pins what a caller who says NOTHING gets.
  ok(o.lateAdmission === 'chair', 'the DEFAULT late admission policy is chair (a late arrival must be admitted by the chair)', o.lateAdmission)
  ok(Array.isArray(o.pendingLate) && o.pendingLate.length === 0 && o.pendingLateCount === 0,
    'a freshly opened meeting holds nobody at the door', { pendingLate: o.pendingLate, n: o.pendingLateCount })
  has(o.lateAdmissionMeans, 'open', 'the open receipt explains the three words (open)')
  has(o.lateAdmissionMeans, 'chair', 'the open receipt explains the three words (chair)')
  has(o.lateAdmissionMeans, 'refuse', 'the open receipt explains the three words (refuse)')
  has(o.lateAdmissionMeans, 'THE DEFAULT IS "chair"', 'the open receipt says OUT LOUD which of the three is the default')
  const view = t.meetingView({ meeting: o.meeting })
  ok(view && view.lateAdmission === 'chair', 'the READ face carries the policy back (meetingView)', view && view.lateAdmission)
  ok(view && typeof view.lateAdmissionMeans === 'string' && view.lateAdmissionMeans.length > 40,
    'the read face also carries the meaning of the words', view && view.lateAdmissionMeans)
  const sum = t.summary({ meeting: o.meeting })
  ok(sum && sum.lateAdmission === 'chair', 'the SUMMARY face carries the same policy', sum && sum.lateAdmission)
}

for (const bad of ['maybe', 1]) {
  const e = errOf(() => mk().open({ type: 'ordinary', lateAdmission: bad }))
  ok(e && e.code === 'VMU_INVALID_ARGUMENT', 'an unknown late admission word is refused by name (' + JSON.stringify(bad) + ')', e && e.code)
  has(e && e.message, JSON.stringify(bad), 'the refusal NAMES the word it refused (' + JSON.stringify(bad) + ')')
  has(e && e.hint, 'open | chair | refuse', 'the refusal prints the LEGAL values (' + JSON.stringify(bad) + ')')
}
{
  const t = mk()
  const e = errOf(() => t.open({ type: 'ordinary', chair: 'acad', roster: MEET.roster, at: 500, lateAdmission: 'chair' }))
  ok(e === null, 'premise: a LEGAL word is accepted (chair)', e && e.code)
  const o = t.open({ type: 'ordinary', chair: 'acad', roster: MEET.roster, at: 5000 })
  ok(o.state === 'scheduled' && o.scheduledFor === 5000, 'premise: at in the FUTURE opens a SCHEDULED meeting', { state: o.state, scheduledFor: o.scheduledFor })
  const past = t.open({ type: 'ordinary', chair: 'acad', roster: MEET.roster, at: 500 })
  ok(past.state === 'open' && past.scheduledFor === null, 'premise: at in the PAST opens a STARTED meeting', { state: past.state, scheduledFor: past.scheduledFor })
}

console.log('\n=== 2. THE POLICY DECIDES WHAT A LATE ATTEND DOES ===')
{
  // 2a: a SCHEDULED meeting seats an EARLY arrival under EVERY policy - the policy only bites when the arrival is late.
  for (const policy of ['open', 'chair', 'refuse']) {
    const t = mk()
    const o = t.open(Object.assign({}, MEET, { at: 5000, lateAdmission: policy }))
    const r = attempt(() => t.attend({ meeting: o.meeting, member: 'r-1' })).value
    ok(r && r.ok === true && r.late === false && r.pendingLate === false,
      'policy ' + policy + ': an EARLY arrival is not late, so it is seated (no door, no refusal)', r && { late: r.late, pendingLate: r.pendingLate, code: r.code })
    ok(r && r.lateAdmission === policy, 'policy ' + policy + ': the attend receipt still names the policy in force', r && r.lateAdmission)
    ok(t.meetingView({ meeting: o.meeting }).present.includes('r-1'), 'policy ' + policy + ': the early arrival really is in the present set')
  }
  // 2b: ON TIME is not late either (lateAfterMs is strict: 100 > 100 is false).
  const tb = mk()
  const ob = tb.open(Object.assign({}, MEET, { at: 900, lateAdmission: 'refuse' }))
  const onTime = attempt(() => tb.attend({ meeting: ob.meeting, member: 'r-1' })).value
  ok(onTime && onTime.ok === true && onTime.late === false, 'ON TIME under refuse is seated: the boundary is not late', onTime && onTime.late)
  ok(tb.meetingView({ meeting: ob.meeting }).present.includes('r-1'), 'ON TIME under refuse: the member is present')
}
{
  // 2c: open - the late arrival is seated and flagged.
  const t = mk()
  const o = t.open(Object.assign({}, MEET, { at: 500, lateAdmission: 'open' }))
  const r = attempt(() => t.attend({ meeting: o.meeting, member: 'r-1' })).value
  ok(r && r.ok === true && r.late === true, 'open: a LATE arrival is accepted and flagged late:true', r && { ok: r.ok, late: r.late })
  ok(r && r.lateAdmission === 'open' && r.pendingLate === false, 'open: the receipt says the policy was open and nobody is at the door', r && { p: r.lateAdmission, door: r.pendingLate })
  ok(r && r.alreadyPresent === false, 'open: this call is what put the member in the present set', r && r.alreadyPresent)
  const view = t.meetingView({ meeting: o.meeting })
  ok(view.present.includes('r-1'), 'open: the late member IS in the present set')
  ok(Array.isArray(view.pendingLate) && view.pendingLate.length === 0, 'open: nothing is held at the door')
}
{
  // 2d: chair - the late arrival waits at the door, not in the house.
  const t = mk()
  const o = t.open(Object.assign({}, MEET, { at: 500, lateAdmission: 'chair' }))
  const r = attempt(() => t.attend({ meeting: o.meeting, member: 'r-1' })).value
  ok(r && r.ok === true && r.late === true && r.pendingLate === true, 'chair: a LATE arrival is NOT seated; it is held at the door', r && { ok: r.ok, late: r.late, door: r.pendingLate })
  ok(r && r.alreadyPresent === false, 'chair: the receipt says the member is not present')
  has(r && r.alreadyPresentMeans, 'NOT seated', 'chair: the receipt says OUT LOUD that the member is not seated')
  ok(r && Array.isArray(r.pendingLateMembers) && r.pendingLateMembers.includes('r-1') && r.pendingLateCount === 1,
    'chair: the receipt returns the door list with the member on it', r && r.pendingLateMembers)
  const view = t.meetingView({ meeting: o.meeting })
  ok(!view.present.includes('r-1'), 'chair: the late member is NOT in the present set')
  ok(Array.isArray(view.pendingLate) && view.pendingLate.length === 1, 'chair: the meeting own pendingLate list holds exactly one row', view.pendingLate)
  const row = view.pendingLate[0]
  ok(row && row.member === 'r-1' && row.late === true && row.askedBy === 'r-1',
    'chair: the door row names who asked, and that the ask was LATE', row)
  ok(row && row.decidedAt === null && row.decidedBy === null, 'chair: nobody has decided yet (an ask is not a decision)', row)
  ok(view.waitStates.filter((x) => x.member === 'r-1')[0].waitState === 'awaiting', 'chair: the same fact reads as waitState "awaiting"')
  const again = attempt(() => t.attend({ meeting: o.meeting, member: 'r-1' })).value
  ok(again && again.ok === true && again.pendingLate === true && again.alreadyPending === true && again.pendingLateCount === 1,
    'chair: asking twice does not duplicate the door row', again && { pending: again.alreadyPending, n: again.pendingLateCount })
}
{
  // 2e: refuse - the late arrival is refused by name, with the two repairs.
  const t = mk()
  const o = t.open(Object.assign({}, MEET, { at: 500, lateAdmission: 'refuse' }))
  const e = errOf(() => t.attend({ meeting: o.meeting, member: 'r-1' }))
  ok(e && e.code === 'VMU_LATE_ADMISSION_REFUSED', 'refuse: a LATE arrival is refused by name', e && e.code)
  has(e && e.message, 'lateAdmission is "refuse"', 'refuse: the message names the policy that refused it')
  has(e && e.message, '500ms past openedAt', 'refuse: the message says HOW late the arrival was')
  has(e && e.hint, 'admit(', 'refuse: repair one is the chair calling admit()')
  has(e && e.hint, 'NEXT meeting', 'refuse: repair two is joining the next meeting')
  has(e && e.hint, 'Retrying attend()', 'refuse: the hint says a retry of attend() will refuse again')
  const view = t.meetingView({ meeting: o.meeting })
  ok(!view.present.includes('r-1'), 'refuse: the refused member is NOT seated')
  ok(view.pendingLate.length === 0, 'refuse: the refused member is NOT held at the door either')
  ok(view.roster.includes('r-1'), 'refuse: a refused arrival is not silently removed from the roster')
  ok(view.waitStates.filter((x) => x.member === 'r-1')[0].waitState === 'absent',
    'refuse: it reads as absent, not as awaiting (it is not at the door)')
}

console.log('\n=== 3. admit() IS THE CHAIR-ONLY DOOR ===')
{
  const t = mk()
  const o = t.open(Object.assign({}, MEET, { at: 500, lateAdmission: 'chair' }))
  t.attend({ meeting: o.meeting, member: 'r-1' })
  const noActor = errOf(() => t.admit({ meeting: o.meeting, member: 'r-1' }))
  ok(noActor && noActor.code === 'VMU_NOT_PERMITTED', 'admit without an actor is refused (the chair must name itself)', noActor && noActor.code)
  has(noActor && noActor.message, 'chair to name itself', 'the refusal says WHY: the chair must name itself')
  has(noActor && noActor.hint, 'pass { actor: "acad" }', 'the refusal names the exact argument to pass')
  const wrongActor = errOf(() => t.admit({ meeting: o.meeting, member: 'r-1', actor: 'r-2' }))
  ok(wrongActor && wrongActor.code === 'VMU_NOT_PERMITTED', 'a non-chair actor is refused', wrongActor && wrongActor.code)
  has(wrongActor && wrongActor.message, 'only the meeting chair may admit', 'the refusal says the door is the chair own')
  const neverAsked = errOf(() => t.admit({ meeting: o.meeting, member: 'r-2', actor: 'acad' }))
  ok(neverAsked && neverAsked.code === 'VMU_STATE', 'admitting a member that never asked is refused', neverAsked && neverAsked.code)
  has(neverAsked && neverAsked.message, 'no pendingLate row', 'the refusal says there is no door row for that member')
  has(neverAsked && neverAsked.hint, 'attend() first', 'the refusal names the call that puts a member at the door')
  const alreadySeated = errOf(() => t.admit({ meeting: o.meeting, member: 'acad', actor: 'acad' }))
  ok(alreadySeated && alreadySeated.code === 'VMU_STATE', 'admitting the already-seated chair is refused', alreadySeated && alreadySeated.code)
  has(alreadySeated && alreadySeated.message, 'ALREADY present', 'the refusal says the member is already present (not a silent no-op)')

  const good = attempt(() => t.admit({ meeting: o.meeting, member: 'r-1', actor: 'acad', why: 'travel delay' })).value
  ok(good && good.ok === true && good.admitted === true, 'the CHAIR admit() succeeds', good)
  ok(good && good.admittedBy === 'acad' && good.admittedAt === 1000, 'the receipt records WHO admitted and WHEN', good && { by: good.admittedBy, at: good.admittedAt })
  ok(good && good.late === true && good.lateAdmission === 'chair', 'the receipt says this was a LATE admission under the chair policy')
  ok(good && good.why === 'travel delay', 'the chair reason is carried through (an auditable decision)', good && good.why)
  ok(good && Array.isArray(good.pendingLate) && good.pendingLate.length === 0 && good.pendingLateCount === 0,
    'the receipt returns the REMAINING door list (now empty)', good && good.pendingLate)

  const view = t.meetingView({ meeting: o.meeting })
  ok(view.present.includes('r-1'), 'after admit() the member IS in the present set')
  ok(view.pendingLate.length === 0, 'after admit() the door list is empty')
  ok(view.waitStates.filter((x) => x.member === 'r-1')[0].waitState === 'present',
    'after admit() the same fact reads as waitState "present"')
  const sum = t.summary({ meeting: o.meeting })
  ok(Array.isArray(sum.lateAdmissions) && sum.lateAdmissions.length === 1, 'the admission is recorded in lateAdmissions', sum && sum.lateAdmissions)
  const row = (sum.lateAdmissions || [])[0]
  ok(row && row.member === 'r-1' && row.by === 'acad' && row.at === 1000 && row.why === 'travel delay',
    'the recorded admission carries member/by/at/why', row)
  const twice = errOf(() => t.admit({ meeting: o.meeting, member: 'r-1', actor: 'acad' }))
  ok(twice && twice.code === 'VMU_STATE', 'admitting the SAME member twice is refused (seating is not repeatable)', twice && twice.code)
}
{
  // A meeting that declares NO chair has no one who may open the door - the kernel never invents an authority.
  const t = mk()
  const o = t.open({ type: 'ordinary', roster: ['r-1', 'r-2'], at: 500, lateAdmission: 'chair' })
  const held = attempt(() => t.attend({ meeting: o.meeting, member: 'r-1' })).value
  ok(held && held.ok === true && held.pendingLate === true, 'premise: the late member is held at the door', held && held.pendingLate)
  const e = errOf(() => t.admit({ meeting: o.meeting, member: 'r-1', actor: 'r-1' }))
  ok(e && e.code === 'VMU_ENGINE_UNAVAILABLE', 'a meeting with NO declared chair has nobody who may admit', e && e.code)
  has(e && e.message, 'declares no chair', 'the refusal says the meeting declares no chair')
  has(e && e.hint, 'chair:', 'the refusal names the repair: convene with a chair')
}
{
  // refuse is enforced even when the meeting has no chair (the policy does not depend on an authority to relax it).
  const t = mk()
  const o = t.open({ type: 'ordinary', roster: ['r-1', 'r-2'], at: 500, lateAdmission: 'refuse' })
  ok(codeOf(() => t.attend({ meeting: o.meeting, member: 'r-1' })) === 'VMU_LATE_ADMISSION_REFUSED',
    'refuse bites with no chair declared too (a house rule is not conditional on an authority)')
}

console.log('\n=== 4. waitStates / waitRecommended: the READ state of waiting ===')
{
  const t = mk()
  // RUN 255: the default is "chair" now, so this block - which is about SEATED late arrivals - must ask for "open"
  // explicitly. That keeps the section measuring waitStates and owes-votes, not the house default.
  const o = t.open(Object.assign({}, MEET, { at: 500, lateAdmission: 'open' }))
  t.attend({ meeting: o.meeting, member: 'r-1' })
  const v1 = t.meetingView({ meeting: o.meeting })
  ok(Array.isArray(v1.waitStates) && v1.waitStates.length === 3, 'one row per person the meeting concerns (roster + present)', v1.waitStates && v1.waitStates.length)
  const row = (view, id) => view.waitStates.filter((x) => x.member === id)[0]
  ok(row(v1, 'acad').waitState === 'present' && row(v1, 'r-1').waitState === 'present' && row(v1, 'r-2').waitState === 'absent',
    'seated-but-silent reads "present"; a roster member who never came reads "absent"',
    v1.waitStates.map((x) => [x.member, x.waitState]))
  ok(v1.waitRecommended === true, 'the chair is told to drive a turn: the house arrived and nobody spoke yet', v1.waitRecommended)
  has(v1.waitRecommendedWhy, 'chair has not opened the floor', 'the recommendation says WHY (the chair has not opened the floor)')
  has(v1.waitStatesMeans, 'NOT resident', 'the read block says OUT LOUD that a member is not a resident process')
  has(v1.waitStatesMeans, 'HANDS BACK', 'the read block says the turn ends and hands back to the chair')

  const spoke = attempt(() => t.speak({ meeting: o.meeting, member: 'acad', text: 'the floor is open' }))
  ok(spoke.ok === true, 'premise: the chair speaks', spoke.error && spoke.error.code)
  const v2 = t.meetingView({ meeting: o.meeting })
  ok(v2.waitRecommended === false, 'after the chair opened the floor nothing is waiting on the chair', v2.waitRecommendedWhy)
  has(v2.waitRecommendedWhy, 'no member is waiting', 'the second state says WHY there is nothing to wait for')
  ok(row(v2, 'acad').waitState === 'spoke' && row(v2, 'r-1').waitState === 'present',
    'a recorded speech reads "spoke"; a silent seated member still reads "present"',
    v2.waitStates.map((x) => [x.member, x.waitState]))

  const mo = attempt(() => t.motion({ meeting: o.meeting, member: 'acad', text: 'adopt the plan' }))
  ok(mo.ok === true, 'premise: a motion is moved', mo.error && mo.error.code)
  const sec = attempt(() => t.second({ meeting: o.meeting, member: 'r-2', motion: mo.value.motion }))
  ok(sec.ok === true, 'premise: another member seconds it', sec.error && sec.error.code)
  const v3 = t.meetingView({ meeting: o.meeting })
  ok(row(v3, 'r-1').owes === true && row(v3, 'r-1').owesWhat === 'mo1',
    'a SEATED member who has not voted on a seconded motion owes a vote (owesWhat names it)', row(v3, 'r-1'))
  ok(row(v3, 'acad').owes === true, 'the proposer owes a vote too (it is seated and has not voted)', row(v3, 'acad'))
  ok(row(v3, 'r-2').owes === false, 'a member who is NOT present cannot owe a vote', row(v3, 'r-2'))
  const s3 = t.summary({ meeting: o.meeting })
  ok(Array.isArray(s3.waitStates) && s3.waitStates.filter((x) => x.member === 'r-1')[0].owes === true,
    'summary carries the SAME owes reading as meetingView')
}
{
  // The door state is the third reason waitRecommended can be true.
  const t = mk()
  const o = t.open(Object.assign({}, MEET, { at: 500, lateAdmission: 'chair' }))
  t.attend({ meeting: o.meeting, member: 'r-1' })
  const v = t.meetingView({ meeting: o.meeting })
  ok(v.waitRecommended === true, 'someone is at the door: the chair is told to drive the admit decision', v.waitRecommended)
  has(v.waitRecommendedWhy, 'held at the door', 'the recommendation says the member is held at the door')
  has(v.waitRecommendedWhy, 'admit()', 'the recommendation names admit() as the decision to make')
  ok(v.waitStates.filter((x) => x.member === 'r-1')[0].waitState === 'awaiting', 'and reads "awaiting" for that member')
}

console.log('\n=== 5. THE TOOL FACE: admit in the enum, and the read block through the service registry ===')
{
  const param = (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra)
  const refused = (code, message, hint) => ({ ok: false, code, message, hint })
  const stub = makeMeetingSpec({ param, refused, TOOL_NAMES: { meeting: 'vibe_vmu_meeting' }, kernel: {} })
  ok(stub && stub.parameters && stub.parameters.action && Array.isArray(stub.parameters.action.enum),
    'premise: the tool spec declares an action enum')
  ok(stub.parameters.action.enum.includes('admit'), 'the tool action enum advertises admit')
  ok(SERVICE_CROSSING_ACTIONS.includes('admit'), 'admit crosses the service forwarding whitelist (SERVICE_CROSSING_ACTIONS)')
  const DOC = readFileSync(join(VMU, 'docs', '03-interface-contract.md'), 'utf8')
  const meetingRow = DOC.split('\n').filter((line) => {
    if (!line.startsWith('|')) return false
    // the FIRST cell must be the tool name: other rows merely MENTION the tool in a later column
    return String((line.split('|')[1] || '')).includes('vibe_vmu_meeting')
  })[0] || ''
  ok(meetingRow.length > 0, 'premise: the interface contract has a meeting tool row')
  has(meetingRow, 'admit', 'the interface contract registers admit on that row')
  has(DOC, 'VMU_LATE_ADMISSION_REFUSED', 'the refusal code is registered in the interface contract')
}

mkdirSync(TMP, { recursive: true })
const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
const specs = []
const root = mkdtempSync(join(TMP, 'k-'))
const ctx = {
  effect: (fn) => fn(),
  on: () => () => {},
  tools: { register: async (spec) => { specs.push(spec); return () => {} } },
}
const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root, vmu: { 'vmu.meetings.lateAfterMs': 100 } })
await handle.ready()
await handle.kernel.store.open()
const specOf = (n) => specs.filter((s) => s && s.name === n)[0] || null
const call = async (name, args = {}) => {
  const spec = specOf(name)
  if (!spec) return { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered', hint: null }
  try {
    const raw = await spec.execute(args, { kernel: handle.kernel })
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed && typeof parsed === 'object' ? parsed : { ok: false, code: 'VMU_TEST_NO_RECEIPT', message: String(raw), hint: null }
  } catch (e) {
    return { ok: false, code: (e && (e.code || (e.cause && e.cause.code))) || 'VMU_TEST_THROWN', message: String((e && e.message) || e), hint: (e && e.hint) || null }
  }
}

{
  ok(specOf('vibe_vmu_meeting') !== null, 'premise: the v5r boot registers the meeting tool')
  const booted = specOf('vibe_vmu_meeting')
  const props = (booted.parameters && booted.parameters.properties) || {}
  const enumVals = (props.action && Array.isArray(props.action.enum)) ? props.action.enum : []
  ok(enumVals.length > 0, 'premise: the REGISTERED spec carries its action enum', enumVals.length)
  ok(enumVals.includes('admit'), 'the REGISTERED tool enum contains admit (the door is advertised, not hidden)')
  const started = await call('vibe_v5_start', { problem: '前 n 个奇数之和等于 n 的平方', researcherCount: 2 })
  ok(started.ok === true, 'premise: the pack boot hires members (r-acad, r-1)', started)

  const opened = handle.kernel.meetings.open({ type: 'ordinary', chair: 'r-acad', roster: ['r-acad', 'r-1', 'r-2'], at: 500, lateAdmission: 'chair', actor: 'r-acad' })
  ok(opened.ok === true && opened.lateAdmission === 'chair', 'premise: a chair-policy service meeting is open', opened && { ok: opened.ok, policy: opened.lateAdmission })
  const mid = opened.meeting

  const st0 = await call('vibe_vmu_meeting', { action: 'status', id: mid })
  ok(st0.ok === true && st0.registry === 'service', 'premise: tool status addresses the service meeting', st0 && st0.registry)
  ok(st0.lateAdmission === 'chair' && Array.isArray(st0.pendingLate) && st0.pendingLate.length === 0,
    'tool status carries lateAdmission + the empty door list', st0 && { policy: st0.lateAdmission, door: st0.pendingLate })
  ok(Array.isArray(st0.waitStates) && st0.waitStates.length === 3, 'tool status returns waitStates', st0.waitStates && st0.waitStates.length)

  const att = await call('vibe_vmu_meeting', { action: 'attend', id: mid, member: 'r-1' })
  ok(att.ok === true && att.late === true && att.pendingLate === true, 'the TOOL attend holds a late member at the door', att)
  ok(att.registry === 'service', 'the attend receipt names the service registry', att.registry)

  const st1 = await call('vibe_vmu_meeting', { action: 'status', id: mid })
  ok(st1.ok === true && st1.pendingLate.length === 1 && st1.pendingLateMembers.includes('r-1'),
    'tool status shows the door row after the late attend', st1 && st1.pendingLate)
  ok(st1.waitRecommended === true, 'tool status tells the chair to drive the admit decision', st1.waitRecommended)
  ok(st1.waitStates.filter((x) => x.member === 'r-1')[0].waitState === 'awaiting', 'and the member reads "awaiting"')

  const noActor = await call('vibe_vmu_meeting', { action: 'admit', id: mid, member: 'r-1' })
  ok(noActor.ok === false && noActor.code === 'VMU_NOT_PERMITTED', 'the TOOL admit without an actor is refused', noActor && noActor.code)
  has(noActor.hint, 'pass { actor:', 'the tool refusal names the argument to pass')
  const self = await call('vibe_vmu_meeting', { action: 'admit', id: mid, member: 'r-1', actor: 'r-1' })
  ok(self.ok === false && self.code === 'VMU_NOT_PERMITTED', 'a member cannot admit itself through the tool', self && self.code)

  const adm = await call('vibe_vmu_meeting', { action: 'admit', id: mid, member: 'r-1', actor: 'r-acad', reason: 'travel delay' })
  ok(adm.ok === true && adm.admitted === true, 'the CHAIR admits through the tool', adm)
  ok(adm.admittedBy === 'r-acad' && adm.admittedAt === 1000, 'the tool receipt records admittedBy/admittedAt', adm && { by: adm.admittedBy, at: adm.admittedAt })
  ok(adm.why === 'travel delay', 'the reason travels with the admission', adm && adm.why)
  ok(Array.isArray(adm.pendingLate) && adm.pendingLate.length === 0, 'the tool receipt returns the remaining door list', adm && adm.pendingLate)
  ok(adm.registry === 'service', 'the admit receipt names the service registry', adm.registry)

  const st2 = await call('vibe_vmu_meeting', { action: 'status', id: mid })
  ok(st2.present.includes('r-1') && st2.pendingLate.length === 0, 'tool status shows the member seated and the door empty')
  const sum = await call('vibe_vmu_meeting', { action: 'summary', id: mid })
  ok(sum.ok === true && Array.isArray(sum.waitStates) && sum.waitStates.length === 3, 'tool summary carries waitStates', sum && sum.waitStates && sum.waitStates.length)
  ok(Array.isArray(sum.lateAdmissions) && sum.lateAdmissions.length === 1 && sum.lateAdmissions[0].member === 'r-1',
    'tool summary carries the recorded admission', sum && sum.lateAdmissions)

  const unknown = await call('vibe_vmu_meeting', { action: 'admit', id: 'm-nope', member: 'r-1', actor: 'r-acad' })
  ok(unknown.ok === false && unknown.code === 'VMU_NO_SUCH_OBJECT', 'the tool admit on an unknown id is refused by name', unknown && unknown.code)

  const refusedOpen = handle.kernel.meetings.open({ type: 'ordinary', chair: 'r-acad', roster: ['r-acad', 'r-1'], at: 500, lateAdmission: 'refuse', actor: 'r-acad' })
  ok(refusedOpen.ok === true, 'premise: a refuse-policy meeting is open', refusedOpen && refusedOpen.code)
  const lateRefused = await call('vibe_vmu_meeting', { action: 'attend', id: refusedOpen.meeting, member: 'r-1' })
  ok(lateRefused.ok === false && lateRefused.code === 'VMU_LATE_ADMISSION_REFUSED', 'the TOOL attend under refuse returns the named refusal', lateRefused && lateRefused.code)
  has(lateRefused.hint, 'admit(', 'the tool refusal carries the chair repair in its hint')
}

console.log('\n=== VMU RUN 225-B (late admission + waitStates): ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL - ' + f)
process.exit(failed ? 1 : 0)
