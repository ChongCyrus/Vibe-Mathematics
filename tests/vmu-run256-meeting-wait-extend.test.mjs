// tests/vmu-run256-meeting-wait-extend.test.mjs — RUN 256 / TB-2619 (F-MX-01/02/03).
//
// The three defects this suite pins, written down BEFORE the fix (measured on HEAD 67fb601a):
//   F-MX-01  `extendlimit` on a WAITING meeting answered `VMU_STATE` ("only an open (or recessed) meeting can be
//            extended"), so a chair whose room is still filling had no way to move the DECLARED wait — only proceed()
//            (the wrong tool: it starts the meeting without the people the chair was waiting for).
//   F-MX-02  the appointment notice line carried chair/title/time/attend but not the type, the agenda or the seat,
//            while the mail body carried all four: a member reading only the [新到的消息] line could not tell what the
//            meeting is about, nor whether the invitation is for their own seat.
//   F-MX-03  `waitedMs` was `now - waitStartedAt` verbatim, so a chair who called proceed() BEFORE the declared wait
//            started got `waitedMs: -60001` — one field answering two questions ("how long did the chair wait" and
//            "how early was it"), with a negative duration as the answer to the first.
//
// The assertions below are the acceptance shape: one wait-extension receipt that moves the DEADLINE (not the wall
// clock), a notice line whose four elements are the SAME strings the body carries, and a proceed receipt where
// `waitedMs >= 0` and `earlyByMs` answers the earliness, each with its own Means.

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
  // non-vacuous precondition: two empty values compare equal without proving anything, so this guard runs FIRST.
  const bothEmpty = isEmptyish(actual) && isEmptyish(expected)
  ok(!bothEmpty, name + ' (precondition: non-vacuous comparison)', 'both sides empty: ' + JSON.stringify(actual))
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual))
}

const step = async (name, fn) => {
  try { return await fn() } catch (e) { return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) } }
}

const root = tmpRoot('t1-meeting-wait-')
const h = await boot({ root, settings: { 'vmu.meetings.lateAfterMs': 1 } })
let suiteError = null
try {
  await step('start', () => h.call('vibe_v5_start', { problem: 'TB-2619 等待期延长/通知行四要素/waitedMs 单义', researcherCount: 4 }, as('r-acad')))
  const call = (tool, args, who) => h.call(tool, args, who === undefined ? undefined : as(who))

  // ── §1 F-MX-01: a WAITING meeting's declared wait is extendable, by name, and the DEADLINE moves.
  const sch = await step('schedule', () => call('vibe_v5_meeting', { action: 'schedule', agenda: '等待期延长：主席把声明的等待再推十分钟', title: '延长等待', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 60000), members: ['r-1', 'r-2'], lateAdmission: 'chair' }, 'r-acad'))
  ok('§1 schedule produced a meeting id', typeof sch.meeting === 'string' && sch.meeting !== '', JSON.stringify(sch).slice(0, 200))
  h.kernel.meetings.sweepDue({ at: NOW + 60001 })
  const stBefore = await step('status-waiting', () => call('vibe_vmu_meeting', { action: 'status', id: sch.meeting }, 'r-acad'))
  eq('§1 the meeting is WAITING (the room is not full)', stBefore.state, 'waiting')
  ok('§1 the waiting deadline is readable before the extension', typeof stBefore.waitDueAt === 'number', JSON.stringify({ waitStartedAt: stBefore.waitStartedAt, waitDueAt: stBefore.waitDueAt }))
  const dueBefore = stBefore.waitDueAt

  const ext = await step('extend-waiting', () => call('vibe_vmu_meeting', { action: 'extendlimit', id: sch.meeting, ms: 600000, actor: 'r-acad' }, 'r-acad'))
  ok('§1 F-MX-01: extendlimit on a WAITING meeting is ACCEPTED (was VMU_STATE)', ext.ok === true, 'code=' + ext.code + ' message=' + String(ext.message || '').slice(0, 200))
  eq('§1 the receipt says WHICH bound it moved', ext.kind, 'wait')
  eq('§1 extendedByMs names the step', ext.extendedByMs, 600000)
  eq('§1 extensionsUsed counts this extension', ext.extensionsUsed, 1)
  ok('§1 extensionsLeft is the remaining room under extendCeilingMs', typeof ext.extensionsLeft === 'number' && ext.extensionsLeft > 0, JSON.stringify({ extensionsLeft: ext.extensionsLeft }))
  ok('§1 before.waitDeadlineIso is the OLD deadline', typeof ext.before === 'object' && ext.before !== null && typeof ext.before.waitDeadlineIso === 'string' && Date.parse(ext.before.waitDeadlineIso) === dueBefore, JSON.stringify(ext.before))
  ok('§1 after.waitDeadlineIso is the OLD deadline + the step', typeof ext.after === 'object' && ext.after !== null && Date.parse(ext.after.waitDeadlineIso) === dueBefore + 600000, JSON.stringify(ext.after))
  // LEAD'S MARKER (TB-2619): what must GROW is the wait itself. `startsInMs` is the distance to the SCHEDULED start and
  // the appointment is fixed, so it must NOT move (moving it would silently reschedule the meeting); the readable
  // "how much longer may the room fill" is `waitRemainingMs`, and it must grow by exactly the step.
  ok('§1 the reason the extension is real: waitRemainingMs grows by the step', typeof ext.before === 'object' && ext.before !== null && typeof ext.before.waitRemainingMs === 'number' && typeof ext.after.waitRemainingMs === 'number' && ext.after.waitRemainingMs === ext.before.waitRemainingMs + 600000, JSON.stringify({ before: ext.before.waitRemainingMs, after: ext.after.waitRemainingMs }))
  eq('§1 the SCHEDULED start does NOT move (the extension is not a reschedule)', ext.after.startsInMs, ext.before.startsInMs)
  // LEAD'S SECOND MARKER (TB-2619): extending the WAIT is not moving the APPOINTMENT. `scheduledFor`/
  // `scheduledForIso` are the instant the organizer DECLARED; a future "helpful" extension that silently reschedules
  // the meeting would break the promise made to every invitee, so both readings must be byte-identical afterwards.
  const schedAfter = await step('status-scheduled-after-extend', () => call('vibe_vmu_meeting', { action: 'status', id: sch.meeting }, 'r-acad'))
  // The status face carries the numeric instant (not the ISO spelling); the ISO the organizer was shown is the one the
  // SCHEDULE receipt printed. Byte equality is therefore: the same epoch ms before and after, rendering to the same ISO.
  ok('§1 the APPOINTMENT instant is unchanged by the extension (scheduledFor is the same epoch ms, rendering byte-identical)',
    typeof sch.scheduledFor === 'number' && typeof stBefore.scheduledFor === 'number' && typeof schedAfter.scheduledFor === 'number' &&
    schedAfter.scheduledFor === stBefore.scheduledFor && schedAfter.scheduledFor === sch.scheduledFor &&
    new Date(schedAfter.scheduledFor).toISOString() === sch.scheduledForIso,
    JSON.stringify({ before: stBefore.scheduledFor, after: schedAfter.scheduledFor, scheduleReceipt: sch.scheduledFor, scheduleReceiptIso: sch.scheduledForIso }))
  ok('§1 the extension receipt keeps the scheduled start where it was (before.startsInMs === after.startsInMs === the original)',
    ext.before && ext.after && ext.before.startsInMs === ext.after.startsInMs && ext.after.startsInMs === sch.startsInMs,
    JSON.stringify({ before: ext.before && ext.before.startsInMs, after: ext.after && ext.after.startsInMs, scheduleReceipt: sch.startsInMs }))
  ok('§1 the WALL bound did not move (extendlimit-wait is not the wall clock)', ext.wallLimitMs === undefined || ext.wallLimitMs === null, JSON.stringify({ wallLimitMs: ext.wallLimitMs }))
  const stAfter = await step('status-after', () => call('vibe_vmu_meeting', { action: 'status', id: sch.meeting }, 'r-acad'))
  ok('§1 the next status read reports the NEW deadline', stAfter.waitDueAt === dueBefore + 600000, JSON.stringify({ before: dueBefore, after: stAfter.waitDueAt }))
  eq('§1 the meeting is still waiting (extension does not start it)', stAfter.state, 'waiting')

  // the extension is REAL: the old deadline passing must NOT make the wait due, the new one must.
  h.kernel.meetings.sweepDue({ at: dueBefore + 1 })
  const stOld = await step('status-old-deadline', () => call('vibe_vmu_meeting', { action: 'status', id: sch.meeting }, 'r-acad'))
  eq('§1 the OLD deadline is inert after the extension (waitDecisionDue stays false)', stOld.waitDecisionDue, false)
  h.kernel.meetings.sweepDue({ at: dueBefore + 600000 + 1 })
  const stNew = await step('status-new-deadline', () => call('vibe_vmu_meeting', { action: 'status', id: sch.meeting }, 'r-acad'))
  eq('§1 the NEW deadline is the one that fires', stNew.waitDecisionDue, true)
  // LEAD'S THIRD MARKER (TB-2619): reaching the (extended) deadline only makes the chair's DECISION due — the framework
  // still opens nothing on its own, so the meeting must STILL be waiting and proceed() stays the exit.
  eq('§1 the (extended) deadline fires the decision but does NOT open the meeting by itself (proceed is still the exit)', stNew.state, 'waiting')

  // ceiling: refused BY NAME, and the deadline does not move.
  const dueNow = stNew.waitDueAt
  const cap = await step('extend-over-ceiling', () => call('vibe_vmu_meeting', { action: 'extendlimit', id: sch.meeting, ms: 999999999, actor: 'r-acad' }, 'r-acad'))
  eq('§1 an over-ceiling wait extension is refused as VMU_EXTEND_CEILING (not VMU_STATE/VMU_RESOURCE_BUDGET)', cap.code, 'VMU_EXTEND_CEILING')
  const stCap = await step('status-after-cap', () => call('vibe_vmu_meeting', { action: 'status', id: sch.meeting }, 'r-acad'))
  ok('§1 a refused extension changes nothing', stCap.waitDueAt === dueNow, JSON.stringify({ before: dueNow, after: stCap.waitDueAt }))

  // authority is unchanged: only the chair may extend.
  const sch2 = await step('schedule-2', () => call('vibe_v5_meeting', { action: 'schedule', agenda: '等待期延长权限', title: '延长权限', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 60000), members: ['r-1'] }, 'r-acad'))
  h.kernel.meetings.sweepDue({ at: NOW + 60001 })
  const nonChair = await step('extend-waiting-nonchair', () => call('vibe_vmu_meeting', { action: 'extendlimit', id: sch2.meeting, ms: 60000, actor: 'r-1' }, 'r-1'))
  eq('§1 a non-chair wait extension is still refused as VMU_NOT_PERMITTED', nonChair.code, 'VMU_NOT_PERMITTED')

  // ── §2 F-MX-03: waitedMs >= 0 and earlyByMs names the earliness, in BOTH the receipt and the override record.
  const sch3 = await step('schedule-3', () => call('vibe_v5_meeting', { action: 'schedule', agenda: '提前 proceed 的时长读数', title: '提前强开', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 60000), members: ['r-1', 'r-2'] }, 'r-acad'))
  h.kernel.meetings.sweepDue({ at: NOW + 60001 }) // waitStartedAt = NOW+60001, i.e. in the FUTURE relative to the call below
  const pr = await step('proceed-early', () => call('vibe_vmu_meeting', { action: 'proceed', id: sch3.meeting, actor: 'r-acad' }, 'r-acad'))
  eq('§2 the early proceed still succeeds (proceed is the waiting exit)', pr.ok, true)
  ok('§2 waitedMs is never negative (0 when the wait has not run yet)', pr.waitedMs === 0, 'waitedMs=' + JSON.stringify(pr.waitedMs))
  ok('§2 earlyByMs names how early the override was', pr.earlyByMs === 60001, 'earlyByMs=' + JSON.stringify(pr.earlyByMs))
  ok('§2 waitedMs and earlyByMs each carry a Means sentence', typeof pr.waitedMsMeans === 'string' && pr.waitedMsMeans.length > 20 && typeof pr.earlyByMsMeans === 'string' && pr.earlyByMsMeans.length > 20, JSON.stringify({ waitedMsMeans: pr.waitedMsMeans, earlyByMsMeans: pr.earlyByMsMeans }))
  ok('§2 the override record carries the same two readings (one field one meaning)', !!pr.overrodeQuorum && pr.overrodeQuorum.waitedMs === 0 && pr.overrodeQuorum.earlyByMs === 60001, JSON.stringify(pr.overrodeQuorum || null))
  const mins = await step('minutes', () => call('vibe_vmu_meeting', { action: 'minutes', id: sch3.meeting }, 'r-acad'))
  const proceeded = (mins.entries || []).filter((e) => e && e.kind === 'proceeded')[0] || null
  ok('§2 the minutes entry carries the same two readings', !!proceeded && proceeded.waitedMs === 0 && proceeded.earlyByMs === 60001, JSON.stringify(proceeded || null))

  // ── §3 F-MX-02: the notice line carries the SAME four elements as the mail body — same strings, same source.
  const appt = await step('appoint', () => call('vibe_v5_meeting', { action: 'schedule', agenda: '议题：四要素同源校验（类型/议题/时间/席位）', title: '四要素同源', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 120000), members: ['r-1', 'r-2'], lateAdmission: 'chair' }, 'r-acad'))
  const listed = await step('inbox-list', () => call('vibe_v5_inbox', { action: 'list', member: 'r-1' }, 'r-1'))
  const rows = Array.isArray(listed.rows) ? listed.rows : (Array.isArray(listed.records) ? listed.records : [])
  const apptRow = rows.filter((r) => r && r.kind === 'meeting-appointment' && String(r.subject || '').indexOf('四要素同源') !== -1)[0] || null
  ok('§3 the appointment mail exists in r-1 mailbox', apptRow !== null, JSON.stringify(listed).slice(0, 300))
  const body = apptRow ? await step('inbox-open', () => call('vibe_v5_inbox', { action: 'open', member: 'r-1', id: apptRow.id }, 'r-1')) : null
  const bodyText = body && body.message && typeof body.message.text === 'string' ? body.message.text : ''
  const agendaLine = bodyText.split('\n').filter((l) => l.indexOf('议题：') === 0)[0] || ''
  const seatLine = bodyText.split('\n').filter((l) => l.indexOf('主席：') === 0)[0] || ''
  const typeToken = (bodyText.match(/（type [^）]+）/) || [''])[0]
  const seatToken = (seatLine.match(/你的席位：(.*?)。/) || [null, ''])[1]
  ok('§3 the MAIL body carries all four elements', agendaLine !== '' && typeToken !== '' && seatToken !== '' && bodyText.indexOf(ISO(NOW + 120000)) !== -1, JSON.stringify({ agendaLine, typeToken, seatToken }))
  const prompt = await step('assemble', () => h.prompts.assembleFor({ seat: 'member', member: 'r-1', phase: 'normal' }))
  const promptText = typeof prompt === 'string' ? prompt : ''
  const blockStart = promptText.indexOf('[新到的消息]')
  const noticeLine = blockStart === -1 ? '' : (promptText.slice(blockStart).split('\n').find((l) => l.indexOf('【会议预约·r-acad】') !== -1) || '')
  ok('§3 the notice block renders the appointment line', noticeLine !== '', promptText.slice(0, 200))
  ok('§3 F-MX-02 a: the notice line carries the type', noticeLine.indexOf('type ordinary') !== -1, noticeLine.slice(0, 240))
  ok('§3 F-MX-02 b: the notice line carries the agenda, the SAME string the body carries', agendaLine !== '' && noticeLine.indexOf(agendaLine) !== -1, JSON.stringify({ agendaLine, noticeLine }))
  ok('§3 F-MX-02 c: the notice line carries the seat, the SAME string the body carries', seatToken !== '' && noticeLine.indexOf('席位：' + seatToken) !== -1, JSON.stringify({ seatToken, noticeLine }))
  ok('§3 the notice line still carries the title and the attend call (RUN 248 shape kept)', noticeLine.indexOf('四要素同源') !== -1 && noticeLine.indexOf('attend') !== -1, noticeLine.slice(0, 240))
} catch (e) {
  suiteError = e
} finally {
  try {
    const cleanups = h.handle && Array.isArray(h.handle.cleanups) ? h.handle.cleanups : []
    await Promise.all(cleanups.map(async (c) => { try { return await c() } catch { return null } }))
  } catch { /* teardown must not change the verdict */ }
}

if (suiteError) { console.log('SUITE ERROR: ' + String((suiteError && suiteError.message) || suiteError)); fails.push('suite error') }
const summary = fails.length === 0
  ? 'meeting wait/extend/notice: ALL PASS (' + passed + ' assertions)'
  : 'meeting wait/extend/notice: ' + fails.length + ' FAILURE(S)\n  ' + fails.join('\n  ')
console.log('\n=== RUN-256 MEETING WAIT EXTEND: ' + passed + ' passed, ' + fails.length + ' failed ===')
process.exitCode = fails.length === 0 ? 0 : 1
