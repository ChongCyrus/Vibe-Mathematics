// tests/vmu-run254e-attendance-notice.test.mjs — RUN 254-E (live run 73, build 013b4c65 + RUN 254-A): the meeting
// chain still disagreed with itself about WHO the attendance rule waits for, and two receipts still described a
// meeting that had not started.
//
// THE FOUR DEFECTS THIS PINS (all MEASURED in the run, never inferred):
//   · F-73-03 (HIGH, "人齐不开门"): `arrived()` was `roster.every(...)`, but the roster contains seats that
//     `vmu.meetings.attendDeniedSeats` forbids to attend. Such a member can never join `present`, so the rule was
//     STRUCTURALLY false: the due-time sweep parked the meeting in `waiting`, every remaining eligible member
//     attended, and it still never opened — while `requiresChairProceedMeans` said "more members can still attend,
//     and the touch that completes the rule opens the meeting". Two sentences, one receipt, mutually exclusive.
//     FIX: one predicate (`attendanceScopeOf`) now answers "who does this meeting wait for" for BOTH the quorum
//     reading and the opening rule; `arrived()` judges the ELECTORATE (roster minus denied seats). The receipt
//     prints BOTH readings by name (`arrival.rosterPresent/rosterSize`, `arrival.electoratePresent/electorateSize`),
//     names which one opens the meeting (`opensOn`), and `requiresChairProceedMeans` is BUILT FROM that same reading.
//   · F-73-04 (MEDIUM): an act refused because the meeting is still SCHEDULED carried `code:"VMU_STATE"` — the
//     generic state code — although the receipt and its hint said, at length, that the START TIME is what blocks it.
//     FIX: the code is now `VMU_MEETING_NOT_STARTED`; the message keeps the START TIME sentence and the hint keeps
//     "beat() is the clock" and "the institution rule is not what blocks this act either".
//   · F-73-05 (MEDIUM): the appointment notice went to the whole roster minus the chair — including the temp seat the
//     same deployment forbids to attend. The mail itself carries an attend() call that the service would refuse.
//     FIX: recipients are the ELECTORATE minus the chair, and the receipt NAMES who was left out and why
//     (`skipped:{attendDenied,attendDeniedSeats,count}` + means), so "r-temp got no mail" is a stated fact.
//   · F-73-06 (MEDIUM-LOW): on a SCHEDULED meeting, `attend` read `lateReads.openedAt` as `scheduledFor` — a FUTURE
//     instant — and then a lateness arithmetic over it. FIX: `openedAt`/`pastOpenedAt` are null until the meeting
//     actually started (`started === true`), so the "not judged yet" sentence cannot be built on a future instant.
//
// WHAT IT DOES NOT PROVE: it drives the `vmu.meetings` SERVICE, not a live model; it says nothing about whether a
// model reads `arrival`. It proves the readings are truthful and same-sourced.
//
// RULE E: every `.every(...)` / `.filter(...).length === 0` / loop below is preceded by an explicit NON-EMPTY
// assertion on the SAME receiver, and deep comparisons live in helpers that contain no `ok(`/`assert(` call.
//
// Run: node tests/vmu-run254e-attendance-notice.test.mjs
//   (last line: === VMU RUN 254-E ATTENDANCE AND NOTICE: N passed, M failed ===)
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const NOW = 1777777777000
const HOUR = 3600000
const rec = (over) => {
  const vals = Object.assign({}, over || {})
  return { get: (k) => vals[k], has: (k) => Object.prototype.hasOwnProperty.call(vals, k), all: () => Object.assign({}, vals), vals }
}
const nonEmptyString = (v) => typeof v === 'string' && v.length > 0
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])

// RULE E helper: a non-empty array guard AND a membership check, in one call the audit reads by name.
const nonEmpty = (arr, label) => ok(Array.isArray(arr) && arr.length > 0, label + ' (RULE E: the assertion below is not vacuous)', arr)
const noMember = (arr, name) => Array.isArray(arr) && !arr.includes(name)

// The roster of the run-73 instance: a chair, two ordinary members, and a TEMP seat the deployment forbids to attend.
const ROSTER = [
  { id: 'acad', slot: 'chair' },
  { id: 'r-1', slot: 'member' },
  { id: 'r-2', slot: 'member' },
  { id: 'r-temp', slot: 'temp' },
]
const seats = () => ROSTER.map((r) => ({ id: r.id, slot: r.slot }))
const sent = []
const mail = {
  send: (from, draft) => { sent.push({ from, to: draft && (draft.to || draft.member) }); return { ok: true, ids: ['mail-' + sent.length] } },
}
const mk = (clock, over) => createMeetings({
  clock,
  settings: rec(Object.assign({ 'vmu.meetings.attendDeniedSeats': ['temp'], 'vmu.meetings.quorumMin': 1 }, over || {})),
  log: () => {},
  bus: { emit: () => {} },
  members: { roster: seats },
  mail,
})
const schedAt = (svc, roster) => svc.open({ chair: 'acad', actor: 'acad', roster, materials: 'x', at: NOW + HOUR })

// ── §1: F-73-03 — the meeting now opens on its ELECTORATE, while the roster reading stays honest ────────────────────
{
  const now = { t: NOW }
  const svc = mk(() => now.t, {})

  const sched = schedAt(svc, ['acad', 'r-1', 'r-2', 'r-temp'])
  ok(sched.state === 'scheduled' && sched.meeting,
    '§1a. the meeting really is scheduled (non-vacuous precondition for the attendance chain below)', { state: sched.state, meeting: sched.meeting })

  // the temp seat is refused by the SAME declaration the delivery rule subtracts — named, not silently dropped
  let tempCode = null
  try { svc.attend({ meeting: sched.meeting, member: 'r-temp' }) } catch (e) { tempCode = e && e.code }
  ok(tempCode === 'VMU_NOT_PERMITTED',
    '§1b. ★ the temp seat cannot attend: attend() refuses it by name (this is the member the opening rule must NOT wait for)', tempCode)

  now.t = NOW + HOUR + 1
  svc.sweepDue()
  const waitView = svc.meetingView({ meeting: sched.meeting })
  ok(waitView.state === 'waiting',
    '§1c. at the due time the sweep parks the meeting in `waiting` (electorate incomplete: only the chair is present)', waitView.state)

  const arrival = waitView.arrival || null
  ok(arrival !== null && typeof arrival === 'object',
    '§1d. ★★★ the waiting view carries the arrival reading (the fix is a READ, not just a wider predicate)', arrival && Object.keys(arrival))
  ok(arrival && arrival.rosterSize === 4 && arrival.rosterPresent === 1,
    '§1e. ★★ reading 1 — the ROSTER, by name: 1 of 4 present (acad seated by open())', arrival && { rosterPresent: arrival.rosterPresent, rosterSize: arrival.rosterSize })
  ok(arrival && arrival.electorateSize === 3 && arrival.electoratePresent === 1,
    '§1f. ★★★ reading 2 — the ELECTORATE: 3 members this meeting actually waits for (roster minus the temp seat), 1 present', arrival && { electoratePresent: arrival.electoratePresent, electorateSize: arrival.electorateSize })
  ok(arrival && sameList(arrival.attendDenied, ['r-temp']) && sameList(arrival.attendDeniedSeats, ['temp']),
    '§1g. ★★ and it NAMES who it subtracted, with the seat that caused it: a silent subtraction would be a second truth', arrival && { attendDenied: arrival.attendDenied, attendDeniedSeats: arrival.attendDeniedSeats })
  ok(arrival && sameList(arrival.missing, ['r-1', 'r-2']),
    '§1h. ★★★ `missing` lists only ELIGIBLE members still absent — r-temp is NOT in it (that is the impossibility the old rule waited on)', arrival && arrival.missing)
  ok(arrival && arrival.opensOn === 'electorate' && !arrival.allPresent,
    '§1i. ★★ `opensOn` says WHICH reading opens the meeting: the electorate, and it is not complete yet', arrival && { opensOn: arrival.opensOn, allPresent: arrival.allPresent })

  // the sentence about "who has to act" must be built from that same reading — not from a second judgement
  const rcpMeans = String(waitView.requiresChairProceedMeans || '')
  ok(waitView.requiresChairProceed === true && rcpMeans.includes('ELECTORATE'),
    '§1j. ★★★ requiresChairProceedMeans is built from the SAME predicate: it speaks of the ELECTORATE, not of "the attendance rule" in the abstract', rcpMeans.slice(0, 160))
  ok(rcpMeans.includes('1 of 3 present') && rcpMeans.includes('r-1') && rcpMeans.includes('r-2'),
    '§1k. ★★★ and it prints the actual count and NAMES the two missing members — the run-73 receipt said "more members can still attend" while no member could', rcpMeans.slice(0, 220))
  ok(!rcpMeans.includes('no amount of waiting opens it'),
    '§1l. ★★★ the old contradictory half ("the quorum IS met … no amount of waiting opens it") is gone from this branch: one receipt may not carry both "wait" and "waiting cannot help"', rcpMeans.slice(0, 160))

  const a1 = svc.attend({ meeting: sched.meeting, member: 'r-1' })
  ok(a1.state === 'waiting' && a1.settled === null,
    '§1m. r-1 attends: still `waiting` (one eligible member short), and the receipt says so', { state: a1.state, settled: a1.settled })
  ok(a1.arrival && a1.arrival.electoratePresent === 2 && sameList(a1.arrival.missing, ['r-2']),
    '§1n. ★★ the attend receipt carries the SAME post-settle reading: 2 of 3 electorate present, only r-2 missing', a1.arrival && { electoratePresent: a1.arrival.electoratePresent, missing: a1.arrival.missing })

  const a2 = svc.attend({ meeting: sched.meeting, member: 'r-2' })
  ok(a2.state === 'open' && a2.settled === 'started',
    '§1o. ★★★ F-73-03 FIXED END-TO-END: the last ELIGIBLE member attending OPENS the meeting by itself — the run-73 defect was that this touch did nothing, forever', { state: a2.state, settled: a2.settled })
  const opened = svc.meetingView({ meeting: sched.meeting })
  ok(opened.state === 'open' && opened.started === true,
    '§1p. and the reading agrees: the meeting is open and started', { state: opened.state, started: opened.started })
  ok(opened.arrival && opened.arrival.rosterAllPresent === false && opened.arrival.electorateAllPresent === true,
    '§1q. ★★★ THE CRUX: the meeting opened while the ROSTER was NOT complete (r-temp absent) — because the rule judges the electorate. The two readings disagree on purpose and both are printed', opened.arrival && { rosterAllPresent: opened.arrival.rosterAllPresent, electorateAllPresent: opened.arrival.electorateAllPresent, rosterPresent: opened.arrival.rosterPresent, rosterSize: opened.arrival.rosterSize })

  // the two sentences of one receipt can never contradict each other (the run-73 complaint, stated as an invariant)
  const views = [waitView, opened]
  ok(views.length === 2, '§1r. RULE E guard: two receipts to check for the contradiction invariant', views.length)
  const contradictory = views.filter((v) => v.requiresChairProceed === false && v.waitingFor === 'chair-proceed')
  ok(contradictory.length === 0,
    '§1s. ★★★ INVARIANT: no receipt says "the chair must proceed" AND "the chair does not have to proceed" at once (`requiresChairProceed===false` ⇒ `waitingFor!=="chair-proceed"`)', contradictory.map((v) => ({ waitingFor: v.waitingFor, requiresChairProceed: v.requiresChairProceed })))
  ok(waitView.requiresChairProceed === true && waitView.waitingFor === 'chair-proceed',
    '§1t. and the waiting receipt is the positive half of that invariant: blocked, with the chair named as one way out', { waitingFor: waitView.waitingFor, requiresChairProceed: waitView.requiresChairProceed })
}

// ── §2: F-73-04 — a scheduled start is its OWN refusal code, not the generic state code ─────────────────────────────
{
  const now = { t: NOW }
  const svc = mk(() => now.t, {})
  const sched = schedAt(svc, ['acad', 'r-1', 'r-2'])
  let err = null
  try { svc.speak({ meeting: sched.meeting, member: 'acad', text: 'too early' }) } catch (e) { err = e }
  ok(err !== null && err.code === 'VMU_MEETING_NOT_STARTED',
    '§2a. ★★★ speaking in a SCHEDULED meeting is refused with the named code `VMU_MEETING_NOT_STARTED` (run-73 read the generic `VMU_STATE`)', err && err.code)
  const msg = String(err && err.message || '')
  const hint = String(err && err.hint || '')
  ok(msg.includes('the START TIME is what blocks this'),
    '§2b. the message still says WHICH thing blocks the act (the start time), not "bad state"', msg.slice(0, 140))
  ok(hint.includes('beat() is the clock'),
    '§2c. and the hint still names the calls that move it ("beat() is the clock")', hint.slice(0, 140))
  ok(hint.includes('the institution rule is not'),
    '§2d. ★★★ and the hint still separates the CLOCK from the INSTITUTION ("the institution rule is not what blocks this act either") — the sentence an earlier cold run pinned, kept verbatim', hint.slice(0, 200))
}

// ── §3: F-73-05 — the appointment notice goes to the ELECTORATE, and the receipt NAMES the excluded seat ────────────
{
  sent.length = 0
  const now = { t: NOW }
  const svc = mk(() => now.t, {})
  const sched = schedAt(svc, ['acad', 'r-1', 'r-2', 'r-temp'])

  ok(Array.isArray(sched.notified) && sched.notified.length === 2,
    '§3a. ★★★ the appointment notice reached exactly the two ELIGIBLE members (not the temp seat)', sched.notified)
  ok(sameList(sched.notified, ['r-1', 'r-2']),
    '§3b. ★★★ and by NAME: r-1 and r-2, never r-temp', sched.notified)
  ok(noMember(sched.notified, 'r-temp'),
    '§3c. ★★★ the temp seat got no mail — the mail carries an attend() call the same deployment refuses', sched.notified)
  ok(sched.skipped && sameList(sched.skipped.attendDenied, ['r-temp']) && sched.skipped.count === 1,
    '§3d. ★★★ and "who was left out" is a STATED fact (`skipped.attendDenied`), not a silent subtraction', sched.skipped)
  ok(sched.skipped && sameList(sched.skipped.attendDeniedSeats, ['temp']),
    '§3e. ★★ with the seat that caused it, so a reader can check the declaration', sched.skipped && sched.skipped.attendDeniedSeats)
  ok(sameList(sched.targets, ['r-1', 'r-2']),
    '§3f. ★★ `targets` is the electorate minus the chair — the set the notices were actually addressed to', sched.targets)
  ok(nonEmptyString(sched.skippedMeans) && sched.skippedMeans.includes('attendDeniedSeats'),
    '§3g. ★★★ and the means names the declaration that removed the member ("no appointment mail was sent to them, because … vmu.meetings.attendDeniedSeats")', String(sched.skippedMeans).slice(0, 200))

  const rows = Array.isArray(sched.notifyRows) ? sched.notifyRows : []
  ok(rows.length === 2, '§3h. RULE E guard + one delivery row per notified member', rows.map((r) => r && r.member))
  ok(rows.every((r) => r && r.member !== 'r-temp'),
    '§3i. ★★ every delivery row is an eligible member: the mailbox seam never saw the temp seat', rows.map((r) => r && r.member))
  ok(sent.length === 2 && sent.every((s) => s.to !== 'r-temp'),
    '§3j. ★★★ the MAIL SEAM itself (the durable mailbox behind the receipt) received exactly two mails, neither to r-temp', sent)

  // the same facts must be on the recorded receipt, not only on the returned one: a reader of the ledger sees them too
  const ledger = sched.receipt || null
  ok(ledger && ledger.skipped && sameList(ledger.skipped.attendDenied, ['r-temp']),
    '§3k. ★★ the RECORDED receipt carries the same `skipped` (echoed, never recomputed)', ledger && ledger.skipped)
  ok(ledger && sameList(ledger.targets, ['r-1', 'r-2']),
    '§3l. and the same `targets`, so the ledger and the return value cannot disagree', ledger && ledger.targets)
}

// ── §4: F-73-06 — a scheduled meeting has no `openedAt`, so no lateness is invented from the future ────────────────
{
  const now = { t: NOW }
  const svc = mk(() => now.t, {})
  const sched = schedAt(svc, ['acad', 'r-1', 'r-2', 'r-3'])
  const att = svc.attend({ meeting: sched.meeting, member: 'r-1' })
  const lateReads = (att.receipt && att.receipt.lateReads) || att.lateReads || null
  ok(lateReads !== null && typeof lateReads === 'object',
    '§4a. the scheduled attend receipt carries the lateness window (non-vacuous precondition)', lateReads && Object.keys(lateReads))
  ok(lateReads && lateReads.started === false,
    '§4b. the meeting really has not started (so "late" cannot be measured)', lateReads && lateReads.started)
  ok(lateReads && lateReads.openedAt === null,
    '§4c. ★★★ and `openedAt` is NULL — before the fix it was `scheduledFor`, a FUTURE instant, and the lateness arithmetic ran over it', lateReads && lateReads.openedAt)
  ok(lateReads && lateReads.openedAt === null && att.pastOpenedAt === undefined,
    '§4d. ★★ and there is no top-level `pastOpenedAt` at all: nothing can read "the time since it opened" from a meeting that has not opened', { openedAt: lateReads && lateReads.openedAt, pastOpenedAt: att.pastOpenedAt })
  const lateMeans = String(att.lateMeans || '')
  ok(lateMeans.includes('NOT JUDGED YET'),
    '§4e. ★★★ and the verdict says WHY it is not judged instead of computing a negative/future lateness', lateMeans.slice(0, 140))
  ok(!lateMeans.includes('past the openedAt'),
    '§4f. ★★ the "N ms past the openedAt" sentence (the one that needs a real openedAt) does not appear before the meeting starts', lateMeans.slice(0, 140))

  // once it really starts, the same field becomes a real instant — the null above is "not yet", not "never"
  const now2 = { t: NOW }
  const svc2 = mk(() => now2.t, {})
  const openedNow = svc2.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1', 'r-2'], materials: 'x' })
  ok(openedNow.state === 'open', '§4g. a second meeting is opened IMMEDIATELY (non-vacuous precondition for §4h)', openedNow.state)
  now2.t = NOW + 5000
  const late2 = svc2.attend({ meeting: openedNow.meeting, member: 'r-1' })
  const view2 = svc2.meetingView({ meeting: openedNow.meeting })
  ok(Number.isFinite(view2.startedAt), '§4h. the open meeting has a real startedAt', view2.startedAt)
  ok(Number.isFinite(late2.openedAt) && late2.openedAt === view2.startedAt,
    '§4i. ★★★ after it opened, `openedAt` is the REAL opening instant (startedAt), not the scheduled time', { openedAt: late2.openedAt, startedAt: view2.startedAt })
  const late2Reads = (late2.receipt && late2.receipt.lateReads) || null
  ok(late2Reads && late2Reads.elapsedSinceMs === 5000 && late2Reads.openedAt === view2.startedAt,
    '§4j. ★★★ and the lateness window is measured FROM that instant (elapsedSinceMs = 5000 = NOW+5000 minus startedAt), never from scheduledFor', late2Reads && { elapsedSinceMs: late2Reads.elapsedSinceMs, openedAt: late2Reads.openedAt })
}

// ── §5: the SAME denominator on the WAITER side — `until:"attend-all"` must fire on the electorate, not the roster ──
// The consistency patch (RUN 254-E, found by the read-only review): `waiterFiresOn` still compared the raw roster,
// so on a roster holding an attend-denied seat the waiter was armed FOREVER — the F-73-03 defect, still live for the
// wake. These assertions drive the real service and read the receipts (no source-text reading).
{
  const now = { t: NOW }
  const svc = mk(() => now.t, {})
  const opened = svc.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1', 'r-2', 'r-temp'], materials: 'x' })
  ok(opened.state === 'open' && opened.meeting,
    '§5a. the meeting is open (non-vacuous precondition for the waiter chain)', { state: opened.state, meeting: opened.meeting })

  const armed = svc.wait({ meeting: opened.meeting, member: 'r-1', until: 'attend-all' })
  ok(armed.ok === true && armed.armed === true && armed.until === 'attend-all',
    '§5b. r-1 really armed a durable `until:"attend-all"` waiter', { ok: armed.ok, until: armed.until, waiter: armed.waiter })
  const waiterId = armed.waiter && armed.waiter.id

  const half = svc.attend({ meeting: opened.meeting, member: 'r-1' })
  const halfFired = Array.isArray(half.receipt && half.receipt.firedWaiters) ? half.receipt.firedWaiters : null
  ok(halfFired !== null,
    '§5c. the attend receipt carries the waiter settlement (non-vacuous precondition for §5d)', halfFired)
  ok(halfFired && halfFired.length === 0,
    '§5d. ★★★ the waiter does NOT fire while an ELIGIBLE member (r-2) is still missing', halfFired && halfFired.map((f) => f.member))
  const missingHalf = half.arrival && half.arrival.missing
  ok(nonEmpty(missingHalf, '§5e. the receipt exposes who is still missing (the "还需等谁" list an operator reads)') && sameList(missingHalf, ['r-2']),
    '§5f. ★★★ and that list is ELECTORATE-shaped: r-2 and only r-2 — the attend-denied temp seat is NOT in "still missing"', missingHalf)
  ok(noMember(missingHalf, 'r-temp'),
    '§5g. ★★★ the excluded seat is named in `arrival.attendDenied`, never in `missing`', { missing: missingHalf, attendDenied: half.arrival && half.arrival.attendDenied })

  const all = svc.attend({ meeting: opened.meeting, member: 'r-2' })
  const fired = Array.isArray(all.receipt && all.receipt.firedWaiters) ? all.receipt.firedWaiters : null
  ok(fired !== null, '§5h. RULE E guard: the settling receipt carries a list', fired)
  ok(fired && fired.length === 1,
    '§5i. ★★★ DEFECT GATE: the last ELIGIBLE member attending FIRES the waiter — the old roster-based predicate could never fire on this roster (r-temp can never be present)', fired && fired.length)
  ok(fired && fired[0] && fired[0].member === 'r-1' && fired[0].until === 'attend-all' && fired[0].id === waiterId,
    '§5j. ★★ with the same row that was armed (member, until, waiter id) — the waiter was settled, not a new one invented', fired && fired[0] && { member: fired[0].member, until: fired[0].until, id: fired[0].id, armedId: waiterId })
  ok(fired && fired[0] && fired[0].wake && fired[0].wake.delivered === false && fired[0].wake.via === 'none',
    '§5k. and the wake is reported as attempted-but-undelivered (no seam here) — fired is a DELIVERY fact, not "the member acted"', fired && fired[0] && fired[0].wake)

  // (3) the reverse control: with `vmu.meetings.waitForAll` OFF the waiter must follow the QUORUM FLOOR, the same
  // judgement `arrived()` makes — otherwise the two would agree on one deployment and disagree on the other.
  const mkFloor = (clock, over) => mk(clock, Object.assign({ 'vmu.meetings.waitForAll': false, 'vmu.meetings.quorumMin': 3 }, over || {}))
  const svcF = mkFloor(() => now.t, {})
  const openF = svcF.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1', 'r-2', 'r-temp'], materials: 'y' })
  svcF.wait({ meeting: openF.meeting, member: 'r-1', until: 'attend-all' })
  const floorShort = svcF.attend({ meeting: openF.meeting, member: 'r-1' })
  ok(floorShort.quorum && floorShort.quorum.met === false,
    '§5l. control: with waitForAll off and quorumMin 3, acad+r-1 leaves the floor one short (non-vacuous precondition)', floorShort.quorum && { met: floorShort.quorum.met, present: floorShort.quorum.present, required: floorShort.quorum.required })
  ok(Array.isArray(floorShort.receipt.firedWaiters) && floorShort.receipt.firedWaiters.length === 0,
    '§5m. ★★ and the waiter does NOT fire while the floor is short', floorShort.receipt.firedWaiters && floorShort.receipt.firedWaiters.length)
  const floorMet = svcF.attend({ meeting: openF.meeting, member: 'r-2' })
  ok(floorMet.quorum && floorMet.quorum.met === true,
    '§5n. control: the next eligible attendance meets the floor', floorMet.quorum && { met: floorMet.quorum.met, present: floorMet.quorum.present })
  const floorFired = Array.isArray(floorMet.receipt.firedWaiters) ? floorMet.receipt.firedWaiters : null
  ok(floorFired !== null && floorFired.length === 1 && floorFired[0].until === 'attend-all',
    '§5o. ★★★ so the waiter fires at EXACTLY the instant the quorum floor is met — the same predicate the opening door uses (`arrived()`), one truth for both deployments', floorFired && floorFired.map((f) => f.until))
}

console.log('')
console.log('=== VMU RUN 254-E ATTENDANCE AND NOTICE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  · ' + f)
  process.exitCode = 1
}
