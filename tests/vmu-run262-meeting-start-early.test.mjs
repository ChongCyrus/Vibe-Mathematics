// tests/vmu-run262-meeting-start-early.test.mjs — RUN 262 / TB-2661: a SCHEDULED meeting must be startable NOW.
//
// THE DEFECT (measured by prompt-lane while writing the v5r hints, handed to the kernel): a meeting that had been
// `scheduled` had NO exit that starts it before its appointed time. proceed() accepted only `waiting`
// (VMU_STATE: "proceed() only applies to a meeting WAITING for its scheduled start"), beat() only touches the sweep,
// and there was no reschedule/advance. So a chair whose four people had all arrived one hour early could not open the
// meeting it had appointed — the only way in was to wait for a clock somebody else holds.
//
// THE PROMISE THAT HAD NO MECHANISM: startBlockOf() nextActions for state `scheduled` already advertised
// { action: 'proceed', why: 'the chair may open it early ...' }. This suite pins the mechanism behind that promise:
//   §1  the chair starts it early; the receipt carries startsEarly / earlyByMs / scheduledFor / startedAt / attendance
//       / atSource, and the meeting is OPEN.
//   §2  the attendance rule is the ONE predicate attendanceRuleMet: unmet => named refusal, attendance.missing lists
//       the members who have not attended (kernel face AND tool face), the meeting stays scheduled.
//   §3  only the chair may jump the appointment (VMU_NOT_PERMITTED, an existing code).
//   §4  an already-open meeting keeps the EXISTING refusal (VMU_STATE), not a new one, and its start is not re-stamped.
//   §5  ANTI-FALSE-GREEN: beat() is only a touch — startsInMs is byte-identical before and after, so "startable early"
//       cannot be achieved by letting the beat move the clock.
//   §6  the VMU_MEETING_NOT_STARTED hint names proceed NOW (it used to say proceed in `scheduled` is refused), and
//       names attendance.missing.
//
// Red-before evidence (pre-fix, captured before editing the kernel): D:/_tmp/tb2661-red.txt — §1 answered
// `ok:false, code:"VMU_STATE", message:"proceed() only applies to a meeting WAITING for its scheduled start: ... is
// scheduled"`, and §6 hint contained "proceed ... 在 scheduled 态会被拒成 VMU_STATE".

import { boot, tmpRoot } from '../scripts/sim/harness.mjs'

const NOW = 1_800_000_000_000 // harness.mjs boots the clock at this instant
const ISO = (ms) => new Date(ms).toISOString()
const as = (id) => ({ as: { agent: { id } } })

let passed = 0
const fails = []
const ok = (name, cond, why) => {
  if (cond) { passed += 1; console.log('PASS  ' + name) } else { fails.push(name + ': ' + (why || '')); console.log('FAIL  ' + name + (why ? '  — ' + why : '')) }
}
const isEmptyish = (v) => v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
const eq = (name, actual, expected) => {
  const bothEmpty = isEmptyish(actual) && isEmptyish(expected)
  ok(!bothEmpty, name + ' (precondition: non-vacuous comparison)', 'both sides empty: ' + JSON.stringify(actual))
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual))
}

const root = tmpRoot('t1-meeting-start-early-')
const h = await boot({ root, settings: { 'vmu.meetings.waitForAll': true } })
const call = (tool, args, who) => h.call(tool, args, who === undefined ? undefined : as(who))
let suiteError = null
try {
  await call('vibe_v5_start', { problem: 'TB-2661 预约的会议必须能被现在开始', researcherCount: 4 }, as('r-acad'))

  // ── §0 source pins: the mechanism is where the receipt claims it is.
  {
    const { readFileSync } = await import('node:fs')
    const SRC = readFileSync('vibe-math-vmu/kernel/meetings.js', 'utf8')
    const TOOL = readFileSync('vibe-math-vmu/tools/meeting.js', 'utf8')
    ok('§0 the early-start authority is its own named marker', SRC.includes('vmu.meetings.startEarlyRequiresChair'))
    ok('§0 the scheduled path carries its OWN earliness sentence (no second meaning for earlyByMs)', SRC.includes('SCHEDULED_EARLY_MS_MEANS'))
    ok('§0 proceed accepts the scheduled state (the gate names both states)', SRC.includes("m.state !== 'waiting' && m.state !== 'scheduled'"))
    ok('§0 the gate is the ONE attendance predicate', SRC.includes('attendanceRuleMet(m) === true'))
    ok('§0 the old false sentence is gone: it said proceed is refused in scheduled', !SRC.includes('proceed 在 scheduled 态会被拒成 VMU_STATE'))
    ok('§0 the old false promise (startedLate:true on the scheduled nextAction) is gone', !SRC.includes('startedLate:true)'))
    ok('§0 the nextAction now promises the real receipt shape', SRC.includes('startsEarly:true with earlyByMs'))
    ok('§0 the tool face forwards the named refusal fact', TOOL.includes("'boundaryOnly', 'attendance'"))
  }

  // ── §1 the chair starts a SCHEDULED meeting early: accepted, and every required reading is present.
  const sch = await call('vibe_v5_meeting', { action: 'schedule', agenda: '提前开始：人齐了就不用等预约时刻', title: '提前开始', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 3600000), members: ['r-acad', 'r-1', 'r-2', 'r-3'] }, 'r-acad')
  ok('§1 the appointment exists', typeof sch.meeting === 'string' && sch.meeting !== '', JSON.stringify(sch).slice(0, 240))
  eq('§1 the appointment is one hour out', sch.scheduledFor, NOW + 3600000)
  eq('§1 startsInMs reads the hour', sch.startsInMs, 3600000)
  for (const m of ['r-acad', 'r-1', 'r-2', 'r-3']) {
    const at = await call('vibe_vmu_meeting', { action: 'attend', id: sch.meeting, member: m }, m)
    ok('§1 attend accepted for ' + m, at.ok === true, JSON.stringify(at).slice(0, 200))
  }
  const stSched = await call('vibe_vmu_meeting', { action: 'status', id: sch.meeting }, 'r-acad')
  eq('§1 all four are present and the meeting is STILL scheduled (attendance does not start it)', stSched.state, 'scheduled')
  eq('§1 the scheduled start did not move while people attended', stSched.startsInMs, 3600000)
  const pr = await call('vibe_vmu_meeting', { action: 'proceed', id: sch.meeting, member: 'r-acad' }, 'r-acad')
  ok('§1 TB-2661: proceed in `scheduled` is ACCEPTED (was VMU_STATE)', pr.ok === true, 'code=' + pr.code + ' message=' + String(pr.message || '').slice(0, 240))
  eq('§1 the meeting is OPEN', pr.state, 'open')
  eq('§1 startsEarly is true', pr.startsEarly, true)
  eq('§1 earlyByMs is the whole hour the chair jumped', pr.earlyByMs, 3600000)
  eq('§1 scheduledFor is still the appointment', pr.scheduledFor, NOW + 3600000)
  eq('§1 startedAt is the instant the chair started it', pr.startedAt, NOW)
  eq('§1 an early start is NOT a late start', pr.startedLate, false)
  eq('§1 atSource names the clock that produced the instant', pr.atSource, 'kernel-clock')
  ok('§1 atSourceMeans explains the clock contract', typeof pr.atSourceMeans === 'string' && pr.atSourceMeans.includes('kernel-clock'), JSON.stringify(pr.atSourceMeans))
  eq('§1 attendance.met is true', pr.attendance && pr.attendance.met, true)
  eq('§1 attendance.missing is empty (the precondition for startsEarly)', pr.attendance && pr.attendance.missing, [])
  ok('§1 the earliness has its OWN means sentence (scheduledFor, not the declared wait)',
    typeof pr.earlyByMsMeans === 'string' && pr.earlyByMsMeans.includes('scheduledFor') && pr.earlyByMsMeans.includes('startsEarly'),
    JSON.stringify(pr.earlyByMsMeans))
  ok('§1 waitedMs is 0 on the scheduled path (nothing waited)', pr.waitedMs === 0, JSON.stringify({ waitedMs: pr.waitedMs }))
  const mins = await call('vibe_vmu_meeting', { action: 'minutes', id: sch.meeting }, 'r-acad')
  const proceeded = (mins.entries || []).filter((e) => e && e.kind === 'proceeded')[0] || null
  ok('§1 the minutes entry records the authority decision, not just a start',
    !!proceeded && proceeded.startsEarly === true && proceeded.earlyByMs === 3600000 && proceeded.by === 'r-acad',
    JSON.stringify(proceeded || null).slice(0, 300))

  // ── §2 the attendance rule is the gate, and its refusal NAMES who is missing.
  const sch2 = await call('vibe_v5_meeting', { action: 'schedule', agenda: '缺席时不能提前开', title: '缺席拒绝', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 7200000), members: ['r-acad', 'r-1', 'r-2', 'r-3'] }, 'r-acad')
  await call('vibe_vmu_meeting', { action: 'attend', id: sch2.meeting, member: 'r-acad' }, 'r-acad')
  await call('vibe_vmu_meeting', { action: 'attend', id: sch2.meeting, member: 'r-1' }, 'r-1')
  const pr2 = await call('vibe_vmu_meeting', { action: 'proceed', id: sch2.meeting, member: 'r-acad' }, 'r-acad')
  ok('§2 an unmet attendance rule refuses the early start', pr2.ok === false, JSON.stringify(pr2).slice(0, 240))
  eq('§2 the refusal reuses the existing state code', pr2.code, 'VMU_STATE')
  ok('§2 the message names the missing count and the members',
    String(pr2.message || '').includes('2 of 4') && String(pr2.message || '').includes('r-2') && String(pr2.message || '').includes('r-3'),
    String(pr2.message || ''))
  eq('§2 the refusal carries attendance.missing by name (tool face)', pr2.attendance && pr2.attendance.missing, ['r-2', 'r-3'])
  eq('§2 the refusal says the rule is the reason', pr2.attendance && pr2.attendance.met, false)
  ok('§2 the hint names the attend call and the reason it refuses',
    typeof pr2.hint === 'string' && pr2.hint.includes('attend') && pr2.hint.includes('attendance.missing'), JSON.stringify(pr2.hint))
  const st2 = await call('vibe_vmu_meeting', { action: 'status', id: sch2.meeting }, 'r-acad')
  eq('§2 a refused early start leaves the meeting scheduled', st2.state, 'scheduled')
  eq('§2 and does not move the appointment', st2.startsInMs, 7200000)
  // the kernel face carries the SAME named list (one producer for the fact)
  let kernelErr = null
  try { h.kernel.meetings.proceed({ meeting: sch2.meeting, actor: 'r-acad' }) } catch (e) { kernelErr = e }
  ok('§2 the kernel error carries the same named list',
    !!kernelErr && kernelErr.attendance && JSON.stringify(kernelErr.attendance.missing) === JSON.stringify(['r-2', 'r-3']),
    JSON.stringify(kernelErr && kernelErr.attendance || null))

  // ── §3 only the chair may jump the appointment.
  const pr3 = await call('vibe_vmu_meeting', { action: 'proceed', id: sch2.meeting, member: 'r-1' }, 'r-1')
  ok('§3 a non-chair early start is refused', pr3.ok === false, JSON.stringify(pr3).slice(0, 240))
  eq('§3 the refusal reuses the existing authority code', pr3.code, 'VMU_NOT_PERMITTED')
  ok('§3 the message names the chair it wants', String(pr3.message || '').includes('r-acad'), String(pr3.message || ''))
  const st3 = await call('vibe_vmu_meeting', { action: 'status', id: sch2.meeting }, 'r-acad')
  eq('§3 the meeting is still scheduled after the refused attempt', st3.state, 'scheduled')

  // ── §4 an already-open meeting keeps the EXISTING semantics (no new code, no re-stamp).
  const pr4 = await call('vibe_vmu_meeting', { action: 'proceed', id: sch.meeting, member: 'r-acad' }, 'r-acad')
  ok('§4 proceeding an OPEN meeting is refused', pr4.ok === false, JSON.stringify(pr4).slice(0, 240))
  eq('§4 the refusal is the pre-existing state code', pr4.code, 'VMU_STATE')
  ok('§4 the hint says to act in the running meeting', typeof pr4.hint === 'string' && pr4.hint.includes('already running'), JSON.stringify(pr4.hint))
  const st4 = await call('vibe_vmu_meeting', { action: 'status', id: sch.meeting }, 'r-acad')
  eq('§4 the meeting is still open', st4.state, 'open')
  eq('§4 the open meeting was not re-stamped by the refused call', st4.startedAt, NOW)

  // ── §5 ANTI-FALSE-GREEN: beat() is only a touch; it must not move the clock or the start distance.
  const sch5 = await call('vibe_v5_meeting', { action: 'schedule', agenda: 'beat 不动钟', title: 'beat 不动钟', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 1800000), members: ['r-acad', 'r-1'] }, 'r-acad')
  const st5a = await call('vibe_vmu_meeting', { action: 'status', id: sch5.meeting }, 'r-acad')
  eq('§5 the appointment is half an hour out', st5a.startsInMs, 1800000)
  const beat = await call('vibe_vmu_control', { action: 'beat' })
  ok('§5 the beat ran', beat.ok === true, JSON.stringify(beat).slice(0, 200))
  const st5b = await call('vibe_vmu_meeting', { action: 'status', id: sch5.meeting }, 'r-acad')
  eq('§5 beat does NOT move startsInMs (the clock is the caller hold)', st5b.startsInMs, st5a.startsInMs)
  eq('§5 beat does not start the meeting either', st5b.state, 'scheduled')
  ok('§5 the beat receipt reports a sweep that changed NOTHING (it cannot dress a clock move as a start)',
    !!beat.meetings && !!beat.meetings.sweep && beat.meetings.sweep.swept === 0 &&
    Array.isArray(beat.meetings.sweep.transitions) && beat.meetings.sweep.transitions.length === 0 &&
    beat.startedAt === undefined && beat.state === undefined,
    JSON.stringify(beat.meetings || null).slice(0, 400))

  // ── §6 the act-before-start refusal now names the REAL exit.
  const sp = await call('vibe_vmu_meeting', { action: 'speak', id: sch5.meeting, member: 'r-1', text: '早到发言' }, 'r-1')
  ok('§6 speaking in a scheduled meeting is still refused by name', sp.ok === false, JSON.stringify(sp).slice(0, 200))
  eq('§6 the code is unchanged', sp.code, 'VMU_MEETING_NOT_STARTED')
  ok('§6 the hint names proceed as available NOW in scheduled', typeof sp.hint === 'string' && sp.hint.includes('action:"proceed"') && !sp.hint.includes('会被拒成 VMU_STATE'), JSON.stringify(sp.hint))
  ok('§6 the hint names attendance.missing for the unmet rule', typeof sp.hint === 'string' && sp.hint.includes('attendance.missing'), JSON.stringify(sp.hint))
  ok('§6 the hint names the real meeting id', typeof sp.hint === 'string' && sp.hint.includes(sch5.meeting), JSON.stringify((sp.hint || '').slice(0, 200)))
} catch (e) {
  suiteError = e
}

if (suiteError) {
  console.log('FAIL  suite threw: ' + String(suiteError && suiteError.stack || suiteError))
  fails.push('suite threw: ' + String(suiteError && suiteError.message || suiteError))
}
console.log('\n=== RUN-262 MEETING START EARLY: ' + passed + ' passed, ' + fails.length + ' failed ===')
if (fails.length) { for (const f of fails) console.log('  FAILED: ' + f); process.exitCode = 1 }
