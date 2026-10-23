// tests/vmu-meeting-quorum-floor.test.mjs — R3 与 R7 of the phase-12 live run.
//
// THE RULE (《v5r pack 运行规则》，逐字): 「辩论与结题表决人数下限 = min(用户设置数, 院士+常驻研究员数)」.
//
// R3 (measured): every meeting's quorum block read `{min:0, required:0, ratio:0, met:true}` because the framework's
// default floor is 0, so 「到点人未齐 ⇒ 进入等待阶段」 could never become true — the `waiting` state was unreachable, and
// with it the whole rule 「未到齐超时由院士自决」 was a mechanism with no consumer. The conflation was between TWO
// different questions: "may we VOTE yet" (the floor) and "has everyone ARRIVED" (attendance). The rule's waiting
// clause asks the second one.
//
// R7 (measured): the floor existed only inside the refusal `VMU_BALLOT_MIN_VOTES_NOT_MET`; a ballot that CLEARED the
// floor could not report which floor it cleared (`tally` showed `{decisive:0, eligible:2}` and nothing else).
//
// WHAT THIS SUITE PINS: both readings, in both directions, with the negative case present. It cannot prove what a live
// model will do; it proves that the two numbers exist and move for the documented reason.
//
// Run: node tests/vmu-meeting-quorum-floor.test.mjs   (last line: === VMU QUORUM FLOOR: N passed, M failed ===)

import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { createBallotBox } from '../vibe-math-vmu/kernel/ballotbox.js'
import { SETTING_DEFS } from '../vibe-math-vmu/settings/schema.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 240) + ']')) }
}
const serr = (fn) => { try { fn(); return null } catch (e) { return { code: e.code || null, message: String(e.message), hint: e.hint || null } } }

const NOW = 1777777777000
const HOUR = 3600000
const rec = (over) => {
  const vals = Object.assign({}, over || {})
  return { get: (k) => vals[k], has: (k) => Object.prototype.hasOwnProperty.call(vals, k), all: () => Object.assign({}, vals), vals }
}
const mt = (over) => createMeetings({ clock: () => NOW, settings: rec(over), log: () => {}, bus: { emit: () => {} } })

// ── R3-A: the DEFAULT keeps 「未到齐 ⇒ 等待」 reachable, and it is attendance, not the vote floor, that decides ─────
{
  let now = NOW
  const events = []
  const t = createMeetings({ clock: () => now, settings: rec({}), log: { append: (e) => events.push(e) }, bus: { emit: () => {} } })
  const opened = t.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1'], materials: '到点人未齐', at: NOW + HOUR })
  ok(opened.state === 'scheduled' && Number.isFinite(opened.scheduledFor),
    'R3-1. a future start is SCHEDULED, with the requested moment on the record', { state: opened.state, scheduledFor: opened.scheduledFor })
  now = NOW + HOUR + 1000
  const atDue = t.meetingView({ meeting: opened.meeting })
  ok(atDue.state === 'waiting',
    'R3-2. ★★★ at the due moment with a roster member absent the meeting WAITS — the state the rule needs is reachable (before: `required:0 ⇒ met:true` made it impossible)', { state: atDue.state, quorum: atDue.quorum })
  const waitingEvent = events.find((e) => e && e.type === 'meetings/waiting')
  ok(!!waitingEvent && waitingEvent.quorum && waitingEvent.quorum.met === true && JSON.stringify(waitingEvent.absent) === '["r-1"]',
    'R3-3. ★★★ and it is NOT a contradiction: the FLOOR was met while the ATTENDANCE was not — the event carries both numbers and names who was missing', waitingEvent && { quorumMet: waitingEvent.quorum.met, present: waitingEvent.present, rosterSize: waitingEvent.rosterSize, absent: waitingEvent.absent })
  ok(atDue.waitDecisionDue === false,
    'R3-4. the wait has not expired yet, so the chair has no decision to make (no silent auto-decision)', { waitDecisionDue: atDue.waitDecisionDue })
  now = NOW + HOUR + 1000 + 300000 + 1
  const due = t.meetingView({ meeting: opened.meeting })
  ok(due.waitDecisionDue === true && due.state === 'waiting',
    'R3-5. ★★ when the declared wait expires the state STAYS waiting and only the deadline flag flips — the framework makes the decision visible instead of making it', { due: due.waitDecisionDue, state: due.state })
  const st = t.status()
  ok(Array.isArray(st.waitDecisionDue) && st.waitDecisionDue.includes(opened.meeting),
    'R3-6. the actionable half is on the operator\'s list (a deadline nobody can see is the same as no deadline)', st.waitDecisionDue)
  const late = t.attend({ meeting: opened.meeting, member: 'r-1' })
  ok(late.settled === 'started' && late.state === 'open',
    'R3-7. ★★★ the latecomer completes the roster and the meeting STARTS on that touch — the wait is satisfiable, not a dead end', { settled: late.settled, state: late.state })
}

// ── R3-B: the NEGATIVE case — a deployment that does not want to wait can say so, and the knob is what decides ─────
{
  let now = NOW
  const events2 = []
  const t = createMeetings({ clock: () => now, settings: rec({ 'vmu.meetings.waitForAll': false }), log: { append: (e) => events2.push(e) }, bus: { emit: () => {} } })
  const opened = t.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1'], materials: '不等齐', at: NOW + HOUR })
  now = NOW + HOUR + 1000
  const atDue = t.meetingView({ meeting: opened.meeting })
  ok(atDue.state === 'open',
    'R3-8. ★★★ with waitForAll=false the SAME scenario opens at the due moment — the state is decided by a declared setting, not by our preference', { state: atDue.state })
  ok(events2.some((e) => e && e.type === 'meetings/started') && !events2.some((e) => e && e.type === 'meetings/waiting'),
    'R3-9. ★★ and it went straight to STARTED with no waiting event at all — the knob removes the wait, it does not merely hide it', events2.map((e) => e && e.type))
  const def = SETTING_DEFS.find((d) => d.key === 'vmu.meetings.waitForAll')
  ok(!!def && def.def === true && def.hot !== undefined && def.who === 'office',
    'R3-10. ★ the key is DECLARED in the schema with def:true, a hot tier and an owner (a behaviour-bearing knob cannot be an undeclared literal)', def && { def: def.def, hot: def.hot, who: def.who })
  ok(!!def && /未到齐|等待/.test(String(def.doc)) && /quorumMin|法定人数/.test(String(def.doc)),
    'R3-11. ★ and its doc names the rule it implements AND the other number it must not be confused with', def && def.doc)
}

// ── R7: the floor must be readable on a PASSING ballot, not only inside a refusal ────────────────────────────────
{
  const mkBox = (over) => {
    const vals = Object.assign({}, over || {})
    return createBallotBox({ settings: { get: (k) => vals[k] }, clock: () => NOW, log: () => {}, bus: { emit: () => {} } })
  }
  const b = mkBox({ 'vmu.ballot.minVotes': 1 })
  const opened = b.open({ question: '命题 p 成立吗？', options: ['yes', 'no'], eligible: ['acad', 'r-1', 'r-2'] })
  ok(opened.ok === true && opened.ruleFloor,
    'R7-1. ★★★ the box reports `ruleFloor` the moment it opens — the reading exists BEFORE anyone votes', opened.ruleFloor)
  ok(opened.ruleFloor.setting === 1 && opened.ruleFloor.eligible === 3 && opened.ruleFloor.required === 1,
    'R7-2. ★★★ required = min(设置数 1, 有表决权人数 3) = 1, and all three numbers are on the receipt', opened.ruleFloor)
  ok(opened.ruleFloor.boundBy === 'vmu.ballot.minVotes' && opened.ruleFloor.met === false,
    'R7-3. ★★ it names WHICH term bound the floor, and says a floor of 1 is not yet met by 0 votes', opened.ruleFloor)
  b.cast({ boxId: opened.boxId, by: 'acad', choice: 'yes' })
  const after = b.status({ boxId: opened.boxId })
  ok(after.ruleFloor.cast === 1 && after.ruleFloor.met === true,
    'R7-4. ★★★ after one vote the SAME reading moves to met:true — a passing ballot can now answer "which floor did I clear"', after.ruleFloor)

  // the other term binding: no setting declared ⇒ the rule's "min(用户设置, 院士+常驻)" is bound by the head count
  const b2 = mkBox({})
  const o2 = b2.open({ question: '不设下限的票', options: ['yes', 'no'], eligible: ['acad', 'r-1'] })
  ok(o2.ruleFloor.setting === 0 && o2.ruleFloor.required === 2 && o2.ruleFloor.boundBy === 'eligible',
    'R7-5. ★★★ with no declared floor the required number is the ELECTORATE itself (min(∞, n) = n), and `boundBy` says so instead of pretending a setting did it', o2.ruleFloor)
  ok(o2.ruleFloor.rule === 'min(设置数, 有表决权人数)',
    'R7-6. ★ the receipt carries the rule it implements, so a reader does not have to infer the formula from three numbers', o2.ruleFloor.rule)

  // a box opened WITHOUT an eligible list must not invent one
  const b3 = mkBox({ 'vmu.ballot.minVotes': 2 })
  const o3 = b3.open({ question: '没有名册的票', options: ['yes', 'no'] })
  ok(o3.ruleFloor.eligible === null && o3.ruleFloor.required === 2,
    'R7-7. ★★ no eligible list ⇒ `eligible:null` and the declared floor stands alone — "unknown" is reported as unknown, never as 0', o3.ruleFloor)
}

console.log('\n=== VMU QUORUM FLOOR: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
process.exit(failed ? 1 : 0)
