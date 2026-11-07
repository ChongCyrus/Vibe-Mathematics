// tests/vmu-run252-meeting-open-receipt.test.mjs — RUN 252 (run-72 C4, build 0a9e9783): the RECEIPT that opens a
// meeting described two different instants at once, and `activatedAt` carried two different meanings.
//
// THE DEFECTS THIS PINS (all MEASURED in the run / reproduced against the real module, not inferred):
//   · A: `attend()` was the touch that opened a waiting meeting, and its receipt said `state:"open"`,
//     `settled:"started"` — together with `started:false`, `startedAt:null`, `startsInMs:-134918`,
//     `waitingFor:"quorum"` and `lateMeans:"NOT JUDGED YET…"`. The window readings were snapshotted BEFORE
//     `syncMeeting()` settled the schedule, so one receipt mixed the pre-call and post-call meeting. Now the
//     readings are a closure recomputed after the settle: one receipt, one instant.
//   · B: `activatedAt` means "when the meeting actually became runnable" (it is the base of `elapsedSinceMs`, and
//     the row's own field note says "null while scheduled"). `syncMeetingInner` wrote it at the DUE-TIME
//     settlement (before knowing whether the meeting would open at all) and never corrected it when a latecomer
//     opened the meeting later — so the run read `elapsedSinceMs:8918` counted from the beat, not from the attend
//     that opened the meeting. It is now written only when the meeting opens; `waitStartedAt` keeps the settlement
//     instant, so the two instants stay distinguishable without a new field.
//   · B(附帶): the "N ms past openedAt" number in `lateMeans` reused `elapsedSinceMs` (measured from
//     `activatedAt`), while the lateness verdict is measured from `openedAt`: on a scheduled meeting those differ by
//     the whole wait, so the sentence under-reported lateness. It now uses `ms - openedAt`.
//   · C: the SCHEDULED-start refusal only said "is SCHEDULED … and has not started", so a reader could not tell
//     whether attendance was the blocker. It now names the CLOCK as the blocker — deliberately NOT the `waiting`
//     branch's sentence ("the floor is not the blocker; the institution rule is not:"), because in `scheduled` the
//     attendance rule has not been evaluated at all and copying that sentence would invert the conclusion.
//
// WHAT IT DOES NOT PROVE (named so nobody reads more into it): it drives the meeting SERVICE, not a live model, so
// it says nothing about whether a model plans around `activatedAt`; it proves the receipts are internally consistent
// and same-sourced.
//
// RULE E: every `.every(...)` / loop below is preceded by an explicit NON-EMPTY assertion.
//
// Run: node tests/vmu-run252-meeting-open-receipt.test.mjs
//   (last line: === VMU RUN 252 MEETING OPEN RECEIPT: N passed, M failed ===)
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
const rec = (over) => {
  const vals = Object.assign({}, over || {})
  return { get: (k) => vals[k], has: (k) => Object.prototype.hasOwnProperty.call(vals, k), all: () => Object.assign({}, vals), vals }
}
const mk = (clock, over) => createMeetings({ clock, settings: rec(over), log: () => {}, bus: { emit: () => {} } })
const errOf = (fn) => { try { fn(); return null } catch (e) { return e } }
const nonEmptyString = (v) => typeof v === 'string' && v.length > 0

// ── §A: the attend that OPENS a waiting meeting returns ONE instant, not two ───────────────────────────────────────
{
  const now = { t: NOW }
  const svc = mk(() => now.t, {})
  const sched = svc.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1', 'r-2'], materials: 'x', at: NOW + 1000 })
  svc.attend({ meeting: sched.meeting, member: 'r-1' })
  now.t = NOW + 2000
  const swept = svc.sweepDue()
  const waiting = svc.meetingView({ meeting: sched.meeting })
  ok(waiting.state === 'waiting' && waiting.activatedAt === null,
    '§A0. setup, stated so the assertions below are not vacuous: the due-time sweep parked the meeting in waiting and it is NOT runnable yet (activatedAt:null)', { state: waiting.state, activatedAt: waiting.activatedAt })
  ok(Array.isArray(swept) || swept !== undefined,
    '§A0b. the sweep ran (a helper result, kept only so the setup is visible)', typeof swept)

  const att = svc.attend({ meeting: sched.meeting, member: 'r-2' })
  ok(att.ok === true && att.state === 'open' && att.settled === 'started',
    '§A1. ★★★ the latecomer attend is what OPENS the meeting (state:open, settled:started)', { state: att.state, settled: att.settled })
  ok(att.started === true,
    '§A2. ★★★ and the window reading agrees: started:true — the run-72 receipt said started:false beside state:open', att.started)
  ok(att.startedAt === now.t,
    '§A3. ★★★ startedAt is THIS call\'s clock (the moment it opened), not null and not the earlier beat', { startedAt: att.startedAt, now: now.t })
  ok(att.startsInMs === null && att.elapsedSinceMs === 0 && att.elapsedMs === 0,
    '§A4. ★★ the two window fields switched roles with the state: startsInMs null, elapsedSinceMs 0, elapsedMs 0 — no negative, no leftover countdown', { startsInMs: att.startsInMs, elapsedSinceMs: att.elapsedSinceMs, elapsedMs: att.elapsedMs })
  ok(att.waitingFor === null && att.requiresChairProceed === false,
    '§A5. ★★ and nothing still claims the meeting is waiting for a quorum or for the chair', { waitingFor: att.waitingFor, requiresChairProceed: att.requiresChairProceed })
  ok(att.receipt && att.receipt.state === att.state && att.receipt.settled === att.settled,
    '§A6. the receipt envelope describes the same state as the return value (one instant, two views)', att.receipt && { state: att.receipt.state, settled: att.receipt.settled })
  ok(att.receipt && att.receipt.lateReads && att.receipt.lateReads.started === true && att.receipt.lateReads.elapsedSinceMs === 0,
    '§A7. ★★★ the envelope\'s window readings are the SAME source as the top level (lateReads.started:true, elapsedSinceMs:0)', att.receipt && att.receipt.lateReads)
  ok(att.receipt && att.receipt.lateReads && att.receipt.lateReads.startedAt === att.startedAt && att.receipt.lateReads.startsInMs === att.startsInMs,
    '§A8. ★ and every window field matches field by field (startedAt / startsInMs), so a reader cannot get two answers from one call', att.receipt && att.receipt.lateReads)
  ok(nonEmptyString(att.lateMeans) && !att.lateMeans.includes('NOT JUDGED YET'),
    '§A9. ★★★ the lateness sentence no longer says "NOT JUDGED YET" about a meeting that just opened', String(att.lateMeans).slice(0, 140))

  const after = svc.meetingView({ meeting: sched.meeting })
  ok(after.state === 'open' && after.activatedAt === now.t,
    '§A10. the read face confirms the same opening instant (activatedAt = this attend)', { state: after.state, activatedAt: after.activatedAt })
}

// ── §B: `activatedAt` has ONE meaning (the opening instant); `waitStartedAt` keeps the settlement instant ──────────
{
  const now = { t: NOW }
  const svc = mk(() => now.t, { 'vmu.meetings.lateAfterMs': 500 })
  const sched = svc.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1', 'r-2'], materials: 'x', at: NOW + 1000 })
  svc.attend({ meeting: sched.meeting, member: 'r-1' })

  const beatMs = NOW + 2000
  now.t = beatMs
  svc.sweepDue()
  const w = svc.meetingView({ meeting: sched.meeting })
  ok(w.state === 'waiting' && w.activatedAt === null,
    '§B1. ★★★ a WAITING meeting is not runnable, so it must not claim an activation instant (the old code wrote the beat here)', { state: w.state, activatedAt: w.activatedAt })
  ok(w.waitStartedAt === beatMs && w.elapsedSinceMs === null,
    '§B2. ★★ the settlement instant lives in waitStartedAt (its own field), and elapsedSinceMs stays null while not started', { waitStartedAt: w.waitStartedAt, elapsedSinceMs: w.elapsedSinceMs })

  const attendMs = NOW + 3000
  now.t = attendMs
  const att = svc.attend({ meeting: sched.meeting, member: 'r-2' })
  const v = svc.meetingView({ meeting: sched.meeting })
  ok(att.state === 'open' && v.state === 'open',
    '§B3. the latecomer opens it (setup for the two assertions that carry the defect)', { state: v.state })
  ok(v.activatedAt === attendMs && v.startedAt === attendMs,
    '§B4. ★★★ activatedAt/startedAt are the ATTEND that opened it, not the earlier beat', { activatedAt: v.activatedAt, startedAt: v.startedAt, attendMs })
  ok(v.activatedAt !== beatMs,
    '§B5. ★★★ explicit counter-example: activatedAt is NOT the due-time settlement instant (that is exactly what run 72 read)', { activatedAt: v.activatedAt, beatMs })
  ok(v.waitStartedAt === beatMs,
    '§B6. ★ and the settlement instant is still readable in waitStartedAt — the two moments stay distinguishable without a new field', v.waitStartedAt)

  ok(att.late === true,
    '§B7. setup: with lateAfterMs=500 and openedAt=NOW+1000, this arrival 2s later is LATE (so the sentence below has a number to carry)', { late: att.late })
  ok(nonEmptyString(att.lateMeans) && att.lateMeans.includes(String(attendMs - (NOW + 1000)) + ' ms past openedAt'),
    '§B8. ★★★ the lateness sentence measures from openedAt (ms - openedAt = 2000 ms), not from activatedAt (elapsedSinceMs would be 0)', String(att.lateMeans).slice(0, 170))
  ok(Number.isFinite(att.elapsedSinceMs) && att.elapsedSinceMs >= 0 && (attendMs - (NOW + 1000)) >= att.elapsedSinceMs,
    '§B9. ★★ the lateness measured from openedAt is never SMALLER than the elapsed-since-activation reading (the under-report this fix removes)', { pastOpenedAt: attendMs - (NOW + 1000), elapsedSinceMs: att.elapsedSinceMs })

  now.t = attendMs + 5000
  const later = svc.meetingView({ meeting: sched.meeting })
  ok(later.elapsedSinceMs === 5000 && later.activatedAt === attendMs,
    '§B10. ★ elapsedSinceMs counts from the opening instant (5s later reads 5000) and the instant itself does not drift', { elapsedSinceMs: later.elapsedSinceMs, activatedAt: later.activatedAt })
}

// ── §C: the SCHEDULED refusal names the CLOCK; the WAITING refusal keeps its own (different) reason ────────────────
{
  const now = { t: NOW }
  const svc = mk(() => now.t, {})
  const sched = svc.open({ chair: 'acad', actor: 'acad', roster: ['acad', 'r-1', 'r-2'], materials: 'x', at: NOW + 3600000 })
  const sAct = errOf(() => svc.speak({ meeting: sched.meeting, member: 'acad', text: 'too early' }))

  ok(!!sAct && sAct.code === 'VMU_MEETING_NOT_STARTED',
    '§C1. acting in a scheduled meeting is refused by a code that NAMES the cause (VMU_MEETING_NOT_STARTED, RUN 254-E / F-73-04: it used to be the generic VMU_STATE)', sAct && sAct.code)
  ok(!!sAct && /the START TIME is what blocks this, not the attendance rule/.test(String(sAct.message)),
    '§C2. ★★★ the message now names the CLOCK as the blocker instead of leaving the reader to guess attendance', sAct && String(sAct.message).slice(-180))
  ok(!!sAct && /nothing about attendance has been judged yet/.test(String(sAct.message)),
    '§C3. ★★ and says that the attendance rule has NOT been evaluated — the fact that makes copying the waiting sentence wrong', sAct && String(sAct.message).slice(-180))
  ok(!!sAct && /the institution rule is not what blocks this act either/.test(String(sAct.hint)),
    '§C4. ★★★ the hint names the institution rule too (same shape as the waiting branch: "X is not the blocker"), but about the CLOCK, not about attendance', sAct && String(sAct.hint).slice(0, 180))
  ok(!!sAct && /it does NOT start by itself/.test(String(sAct.hint)) && /reads \(status\/summary\/meetingView\/quorum\) work now/.test(String(sAct.hint)),
    '§C5. the pre-existing contracts survive: "it does NOT start by itself" and the lowercase "reads … work now" (vmu-meeting-types pin)', sAct && String(sAct.hint).slice(0, 120))
  ok(!!sAct && !/quorum requires \d+ — /.test(String(sAct.message)),
    '§C6. ★ and the scheduled message does NOT borrow the waiting branch\'s floor sentence (run 13\'s reverse pin stays true)', sAct && String(sAct.message).slice(-160))

  now.t = NOW + 3600001
  svc.sweepDue()
  const wAct = errOf(() => svc.speak({ meeting: sched.meeting, member: 'acad', text: 'still early' }))
  ok(!!wAct && wAct.code === 'VMU_STATE',
    '§C7. setup: the same act on the now-WAITING meeting is refused too (so the two messages can be compared)', wAct && wAct.code)
  ok(!!wAct && /the floor \(quorum\) requires \d+ and IS met/.test(String(wAct.message)) && /the institution rule is not:/.test(String(wAct.message)),
    '§C8. ★★★ the WAITING branch keeps its own, different reason sentence — the scheduled wording did not bleed into it (run 13 pins)', wAct && String(wAct.message).slice(0, 200))
  ok(!!wAct && /the three names for the actor are the same thing/.test(String(wAct.hint)),
    '§C9. and its usability contract (the three actor spellings) is untouched (run 17 pin)', wAct && String(wAct.hint).slice(0, 140))
}

console.log('')
console.log('=== VMU RUN 252 MEETING OPEN RECEIPT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
}
