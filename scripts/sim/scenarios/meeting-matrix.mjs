// scripts/sim/scenarios/meeting-matrix.mjs — TB-2603: the meeting AGENDA matrix, driven by a script.
//
// WHY THIS SCENARIO EXISTS. The meeting face has been exercised cell by cell by live runs (run 69/71/72/73) and by the
// lifecycle scenario (meetings.mjs), but never as a MATRIX: attendance scale (2 / 3 / a roster carrying an attend-denied
// seat), arrival shape (all / one missing / below the floor / nobody but the chair), the three opening paths (the
// deployment default that waits for the whole electorate, the quorum-floor fallback when waitForAll is off, the chair
// proceed() override), late admission under all three policies (open / chair / refuse, with a counterexample per
// policy), the in-meeting waits (until speak / vote / hand / attend-all / deadline, each fired by a real event and one
// asserted NOT to fire on the wrong event), and the appointment notice (the four elements: type, agenda, time, seat,
// asserted as strings in BOTH the mail body and the [新到的消息] block).
//
// ZERO TOKENS. Everything runs against the REAL kernel in process (harness boot), with the prompt pipeline assembled by
// the SAME pipeline a real turn uses: no model, no network, no xelatex, no Lean executor. A refusal that a cell expects
// is declared in expectedRefusals; anything else is a mechanism defect and makes run.mjs exit non-zero.
//
// THE CLOCK IS FIXED (harness boots clock = 1_800_000_000_000). A scheduled start is moved by driving the same sweep
// the beat runs (`kernel.meetings.sweepDue({ at })`), and lateness is produced the way the live scenario does it: the
// meeting is convened with `at` in the PAST, so its openedAt IS that past instant and an arrival at the fixed clock is
// late. A deployment that turns waitForAll off cannot be reconfigured on a running kernel (it is snapshotted at
// construction), so the quorum-floor cell boots its own second kernel with the declared setting and records the receipts
// in `highlights.matrix.altBoots` — the matrix is about the MECHANISM, not about pretending one boot has two policies.

import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { boot } from '../harness.mjs'
import { tmpRoot as gateTmpRoot } from '../../lib/tmp-root.mjs'

// The one deployment setting this scenario needs: 1 ms after openedAt counts as late. This is the same path a real
// deployment config.vmu takes (harness boot -> entry.apply({ vmu: settings })).
export const settings = { 'vmu.meetings.lateAfterMs': 1 }
// The corpus defaults to the directory TB-2603 names, so `node scripts/sim/run.mjs --scenario meeting-matrix`
// writes the evidence where the taskbook points without an --out flag.
export const corpusDir = join(gateTmpRoot(), 'sim', 'meeting-matrix') // the corpus default lives under the ONE temporary root; --out still wins, and an unwritable dir FAILS the run instead of silently writing elsewhere

const NOW = 1_800_000_000_000 // the fixed clock harness.mjs boots with
const ISO = (ms) => new Date(ms).toISOString()
const as = (id) => ({ as: { agent: { id } } })
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export async function meetingMatrix(h, { log = () => {} } = {}) {
  const steps = []
  const cells = []
  const altBoots = []
  const expectedRefusals = []
  const failures = []
  const pick = (o, keys) => {
    const out = {}
    if (!o || typeof o !== 'object') return out
    for (const k of keys) if (o[k] !== undefined) out[k] = o[k]
    return out
  }
  const call = (tool, args, who) => h.call(tool, args, who ? as(who) : undefined)
  const step = async (name, fn) => {
    const before = h.tree ? h.tree().length : 0
    let r = null
    try { r = await fn() } catch (e) { r = { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) } }
    steps.push({ name, at: h.receipts.length, files: { before, after: h.tree ? h.tree().length : before }, ok: !(r && r.ok === false), code: r && r.code ? r.code : null })
    log(name + (r && r.ok === false ? '  [' + (r.code || 'refused') + ']' : ''))
    return r
  }
  // A cell is one row of the matrix: its inputs, the expectation written down BEFORE the call, the measured keys and a
  // boolean verdict. `pass:false` names the cell in `failures` so run.mjs/REPORT.md cannot bury it.
  const cell = (id, group, input, expect, actual, pass, note = null) => {
    const row = { id, group, input, expect, actual, pass: pass === true, verdict: pass === true ? 'pass' : 'fail', note }
    cells.push(row)
    if (pass !== true) failures.push(id)
    log('cell ' + id + ' ' + (pass === true ? 'pass' : 'FAIL'))
    return row
  }
  const expectRefusal = (tool, code) => { expectedRefusals.push({ tool, code }); return code }

  // ── ① INSTITUTE: a chair, four permanent researchers (a 5-seat roster, enough for the floor to sit below the roster)
  //       and one TEMP seat (the attend-denied seat every meeting roster has to cope with).
  const started = await step('institute/start', () => call('vibe_v5_start', { problem: 'TB-2603 会议议程矩阵：只压会议机制，不做数学。', researcherCount: 4 }))
  const hiredTemp = await step('institute/hire-temp', () => call('vibe_v5_hire', { purpose: 'attend-denied seat for the matrix', initial_task: 'attend denied: this seat is on the roster and may not attend', to: 't-1' }, 'r-acad'))
  const base = { hired: started.hired, tempSlot: hiredTemp.slot || null }

  // ── ② ATTENDANCE SCALE (chair + 1 member / chair + 2 members / roster carrying the temp seat) ─────────────────
  const s2 = await step('scale/2', () => call('vibe_v5_meeting', { action: 'schedule', agenda: '规模 2：主席 + 一名常驻', title: '规模二', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 60000), members: ['r-1'] }, 'r-acad'))
  const s2M = s2.meeting
  h.kernel.meetings.sweepDue({ at: NOW + 60001 })
  const s2st = await step('scale/2-status', () => call('vibe_vmu_meeting', { action: 'status', id: s2M }, 'r-acad'))
  const s2at = await step('scale/2-attend', () => call('vibe_vmu_meeting', { action: 'attend', id: s2M, member: 'r-1' }, 'r-1'))
  cell('A1-scale-2', 'attendance-scale', 'schedule members=[r-1]; sweep; attend r-1',
    'rosterSize 1, required 1, opens on the single electorate member (state open, settled started)',
    { rosterSize: num(s2st.arrival && s2st.arrival.rosterSize), required: num(s2at.quorum && s2at.quorum.required), state: s2at.state, settled: s2at.settled },
    s2st.arrival && s2st.arrival.rosterSize === 1 && s2at.quorum && s2at.quorum.required === 1 && s2at.state === 'open' && s2at.settled === 'started',
    'the roster plus the chair is the two-seat meeting; the chair is seated by open(), the one member arrival opens it')

  const s3 = await step('scale/3', () => call('vibe_v5_meeting', { action: 'schedule', agenda: '规模 3：主席 + 两名常驻', title: '规模三', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 60000), members: ['r-1', 'r-2'] }, 'r-acad'))
  const s3M = s3.meeting
  h.kernel.meetings.sweepDue({ at: NOW + 60001 })
  const s3a = await step('scale/3-attend-1', () => call('vibe_vmu_meeting', { action: 'attend', id: s3M, member: 'r-1' }, 'r-1'))
  const s3b = await step('scale/3-attend-2', () => call('vibe_vmu_meeting', { action: 'attend', id: s3M, member: 'r-2' }, 'r-2'))
  cell('A2-scale-3', 'attendance-scale', 'schedule members=[r-1,r-2]; sweep; attend both',
    'first arrival leaves it waiting, the second opens it (state open, settled started)',
    { afterFirst: pick(s3a, ['state', 'settled']), afterSecond: pick(s3b, ['state', 'settled']) },
    s3a.state === 'waiting' && s3a.settled === null && s3b.state === 'open' && s3b.settled === 'started')

  const sT = await step('scale/temp-roster', () => call('vibe_v5_meeting', { action: 'schedule', agenda: '含 attendDenied 席位（temp）', title: '规模temp', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 60000), members: ['r-1', 't-1'] }, 'r-acad'))
  const sTM = sT.meeting
  h.kernel.meetings.sweepDue({ at: NOW + 60001 })
  expectRefusal('vibe_vmu_meeting', 'VMU_NOT_PERMITTED')
  const sTdenied = await step('scale/temp-attend-denied', () => call('vibe_vmu_meeting', { action: 'attend', id: sTM, member: 't-1' }, 't-1'))
  const sTst = await step('scale/temp-status', () => call('vibe_vmu_meeting', { action: 'status', id: sTM }, 'r-acad'))
  const sTok = await step('scale/temp-attend-member', () => call('vibe_vmu_meeting', { action: 'attend', id: sTM, member: 'r-1' }, 'r-1'))
  cell('A3-scale-attend-denied', 'attendance-scale', 'roster=[r-1,t-1]; temp attends; member attends',
    'temp attend is refused by name (VMU_NOT_PERMITTED), electorate excludes t-1 (electorateSize 1), the member arrival opens it',
    { code: sTdenied.code, electorateSize: num(sTst.arrival && sTst.arrival.electorateSize), attendDenied: sTst.arrival && sTst.arrival.attendDenied, state: sTok.state, settled: sTok.settled },
    sTdenied.ok === false && sTdenied.code === 'VMU_NOT_PERMITTED' && sTst.arrival && sTst.arrival.electorateSize === 1 && Array.isArray(sTst.arrival.attendDenied) && sTst.arrival.attendDenied.includes('t-1') && sTok.state === 'open' && sTok.settled === 'started',
    'an attend-denied seat must be on the roster and outside the electorate, never a quorum blocker')

  // ── ③ ARRIVAL SHAPES (all / one missing / below the floor / nobody but the chair). A four-member roster with a floor
  //       of 3 (the declared quorumCap) makes "missing one" and "below the floor" distinguishable: 3 present meets the
  //      floor but is NOT the whole electorate under waitForAll=true.
  const roster4 = ['r-1', 'r-2', 'r-3', 'r-4']
  const arr = {}
  for (const [key, attendees] of [['all', roster4], ['missing-one', ['r-1', 'r-2', 'r-3']], ['below-floor', ['r-1']], ['none', []]]) {
    const s = await step('arrival/' + key + '-schedule', () => call('vibe_v5_meeting', { action: 'schedule', agenda: '到齐形态：' + key, title: '到达-' + key, type: 'ordinary', member: 'r-acad', at: ISO(NOW + 60000), members: roster4 }, 'r-acad'))
    const mid = s.meeting
    h.kernel.meetings.sweepDue({ at: NOW + 60001 })
    const ats = []
    for (const m of attendees) ats.push(await step('arrival/' + key + '-attend-' + m, () => call('vibe_vmu_meeting', { action: 'attend', id: mid, member: m }, m)))
    const st = await step('arrival/' + key + '-status', () => call('vibe_vmu_meeting', { action: 'status', id: mid }, 'r-acad'))
    arr[key] = { mid, last: ats.length ? ats[ats.length - 1] : null, status: st }
  }
  cell('B1-arrival-all', 'arrival-shape', 'roster 4; all four attend', 'state open, settled started, arrival.allPresent true',
    pick(arr.all.status, ['state', 'started']) && Object.assign({}, pick(arr.all.status, ['state', 'started']), { allPresent: arr.all.status.arrival && arr.all.status.arrival.allPresent }),
    arr.all.status.state === 'open' && arr.all.status.arrival && arr.all.status.arrival.allPresent === true && arr.all.last && arr.all.last.settled === 'started')
  cell('B2-arrival-missing-1', 'arrival-shape', 'roster 4; three attend (floor met, electorate short)',
    'state waiting, quorum.met true yet allPresent false, missing [r-4]',
    { state: arr['missing-one'].status.state, quorum: pick(arr['missing-one'].status.quorum, ['required', 'present', 'met']), arrival: pick(arr['missing-one'].status.arrival, ['allPresent', 'electorateAllPresent', 'missing']) },
    arr['missing-one'].status.state === 'waiting' && arr['missing-one'].status.quorum && arr['missing-one'].status.quorum.met === true && arr['missing-one'].status.arrival && arr['missing-one'].status.arrival.electorateAllPresent === false && JSON.stringify(arr['missing-one'].status.arrival.missing) === JSON.stringify(['r-4']),
    'waitForAll=true: a met floor is not the same fact as the whole electorate being seated — the meeting still waits')
  cell('B3-arrival-below-floor', 'arrival-shape', 'roster 4; only r-1 attends',
    'state waiting, complete-electorate false AND floor met false (present 2 of required 3)',
    { state: arr['below-floor'].status.state, quorum: pick(arr['below-floor'].status.quorum, ['required', 'present', 'met']), missing: arr['below-floor'].status.arrival && arr['below-floor'].status.arrival.missing },
    arr['below-floor'].status.state === 'waiting' && arr['below-floor'].status.quorum && arr['below-floor'].status.quorum.met === false && arr['below-floor'].status.quorum.present < arr['below-floor'].status.quorum.required,
    'below the floor is the case proceed() exists for; the receipt must not pretend the floor is met')
  cell('B4-arrival-none', 'arrival-shape', 'roster 4; nobody attends (chair only)',
    'state waiting, present [r-acad], missing all four',
    { state: arr.none.status.state, present: arr.none.status.present, missing: arr.none.status.arrival && arr.none.status.arrival.missing },
    arr.none.status.state === 'waiting' && Array.isArray(arr.none.status.present) && arr.none.status.present.length === 1 && arr.none.status.present[0] === 'r-acad' && arr.none.status.arrival && arr.none.status.arrival.missing.length === 4,
    'the chair is seated by open(); nobody else arriving is a waiting meeting, not an open one')

  // ── ④ OPENING PATHS. (a) the default wait-for-all path is B1's last arrival; (b) the quorum-floor fallback needs a
  //      kernel built with waitForAll=false (the setting is snapshotted at construction); (c) the chair proceed()
  //      override on a waiting meeting; (d) extendlimit on a WAITING meeting — the cell the lead asked for: whether the
  //      declared wait can be extended at all, and what happens to deadline/wall readings when it can.
  cell('C1-open-wait-all', 'opening-path', 'default waitForAll=true; last of four attends',
    'the LAST arrival is the act that opens it (settled started), startedLate true',
    { state: arr.all.status.state, started: arr.all.status.started, startedLate: arr.all.status.startedLate },
    arr.all.status.state === 'open' && arr.all.status.started === true && arr.all.status.startedLate === true,
    'with a scheduled start the opening is by the last arrival after the declaration, hence startedLate')

  // (b) quorum-floor boot
  const hb = await boot({ root: h.root + '-floor-boot', settings: { 'vmu.meetings.lateAfterMs': 1, 'vmu.meetings.waitForAll': false }, withPrompt: false })
  try {
    const callB = (tool, args, who) => hb.call(tool, args, who ? as(who) : undefined)
    await callB('vibe_v5_start', { problem: 'quorum-floor cell', researcherCount: 4 }, 'r-acad')
    const sb = await callB('vibe_v5_meeting', { action: 'schedule', agenda: 'quorum floor cell', title: 'floor', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 60000), members: roster4 }, 'r-acad')
    hb.kernel.meetings.sweepDue({ at: NOW + 60001 })
    const b1 = await callB('vibe_vmu_meeting', { action: 'attend', id: sb.meeting, member: 'r-1' }, 'r-1')
    const b2 = await callB('vibe_vmu_meeting', { action: 'attend', id: sb.meeting, member: 'r-2' }, 'r-2')
    const bst = await callB('vibe_vmu_meeting', { action: 'status', id: sb.meeting }, 'r-acad')
    altBoots.push({ cell: 'C2-open-quorum-floor', settings: { 'vmu.meetings.waitForAll': false }, receipts: hb.receipts.slice(-6) })
    cell('C2-open-quorum-floor', 'opening-path', 'kernel built with vmu.meetings.waitForAll=false; floor met at 3',
      'opens on the FLOOR although the electorate is short: opensOn quorum-floor, quorum.met true, the last arrival settled started',
      { state: bst.state, quorum: pick(bst.quorum, ['required', 'present', 'met']), arrival: pick(bst.arrival, ['opensOn', 'allPresent', 'missing', 'electorateAllPresent']), lastSettled: b2.settled },
      bst.state === 'open' && bst.arrival && bst.arrival.opensOn === 'quorum-floor' && bst.quorum && bst.quorum.met === true && b2.settled === 'started',
      'the deployment switch is the ONLY way to reach the floor-opening path; a running kernel cannot be reconfigured — and the floor reading (met) must be distinguishable from the electorate reading (allPresent)')
  } finally {
    try { await Promise.all((hb.handle && Array.isArray(hb.handle.cleanups) ? hb.handle.cleanups : []).map((c) => c().catch(() => null))) } catch { /* evidence only */ }
    try { rmSync(h.root + '-floor-boot', { recursive: true, force: true }) } catch { /* temp dir */ }
  }

  // (c)+(d) ONE sweep for the two C-group meetings that must be PAST their declared start: the sweep only advances
  // the clock past a deadline (it is the beat, not an act), so both waiting rooms are put on it together instead of
  // paying for the same durable round trip twice. The cells below still read their own meeting only.
  const cSched = await step('open/c-schedule', async () => {
    const s = await call('vibe_v5_meeting', { action: 'schedule', agenda: '主席 proceed 强开', title: '强开', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 60000), members: ['r-1', 'r-2'] }, 'r-acad')
    return { s }
  })
  const exWaitSched = await step('extend/c-schedule-waiting', () => call('vibe_v5_meeting', { action: 'schedule', agenda: '等待期延长', title: '延长等待', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 60000), members: ['r-1', 'r-2'] }, 'r-acad'))
  await step('open/c-sweep', async () => h.kernel.meetings.sweepDue({ at: NOW + 60001 }))
  const pw = { s: cSched.s }
  const pr = await step('open/proceed-waiting', () => call('vibe_vmu_meeting', { action: 'proceed', id: pw.s.meeting, actor: 'r-acad' }, 'r-acad'))
  cell('C3-open-proceed-override', 'opening-path', 'waiting meeting (0/2 present); chair proceed()',
    'state open + overrodeQuorumFlag true + overrodeQuorum names by/rule/floor/present',
    { state: pr.state, flag: pr.overrodeQuorumFlag, overrode: pick(pr.overrodeQuorum, ['by', 'whichRule', 'floor', 'present', 'beforeDeadline']), waitedMs: pr.waitedMs },
    pr.ok === true && pr.state === 'open' && pr.overrodeQuorumFlag === true && pr.overrodeQuorum && pr.overrodeQuorum.by === 'r-acad' && pr.overrodeQuorum.whichRule === 'floor',
    num(pr.waitedMs) < 0 ? 'finding F-MX-03: overrodeQuorum.waitedMs is NEGATIVE (' + pr.waitedMs + ' ms) when the chair proceeds BEFORE the declared wait expires — the field says how long the chair waited, and an early override must not print a negative duration' : null)
  expectRefusal('vibe_vmu_meeting', 'VMU_STATE')
  const prOpen = await step('open/proceed-on-open-refused', () => call('vibe_vmu_meeting', { action: 'proceed', id: pw.s.meeting, actor: 'r-acad' }, 'r-acad'))
  cell('C3b-proceed-on-open-refused', 'opening-path', 'chair proceed() on an already-open meeting',
    'refused by name (VMU_STATE) — proceed is the waiting exit, not a second opening',
    { ok: prOpen.ok, code: prOpen.code, message: String(prOpen.message || '').slice(0, 120) },
    prOpen.ok === false && prOpen.code === 'VMU_STATE')

  // (d) extendlimit on a WAITING meeting vs an OPEN meeting
  expectRefusal('vibe_vmu_meeting', 'VMU_STATE')
  const exWait = { s: exWaitSched, r: await step('extend/on-waiting', () => call('vibe_vmu_meeting', { action: 'extendlimit', id: exWaitSched.meeting, ms: 600000, actor: 'r-acad' }, 'r-acad')) }
  cell('C4-extendlimit-on-waiting', 'opening-path', 'waiting meeting; chair extendlimit(+600s)',
    'DECLARED BEHAVIOUR: the wait deadline is extended and startsInMs/deadline change',
    { ok: exWait.r.ok, code: exWait.r.code, message: String(exWait.r.message || '').slice(0, 200) },
    exWait.r.ok === true,
    'product defect F-MX-01: extendlimit is refused while the meeting is WAITING (VMU_STATE), so the declared wait can NOT be extended — the chair has only proceed/lapse/recess, which is exactly the wrong tool when the room is filling')
  const exOpen = await step('extend/on-open', async () => {
    const s = await call('vibe_v5_meeting', { agenda: '墙钟延长', title: '延长', type: 'ordinary', member: 'r-acad', members: ['r-1'] }, 'r-acad')
    const before = await call('vibe_vmu_meeting', { action: 'status', id: s.meeting }, 'r-acad')
    const r = await call('vibe_vmu_meeting', { action: 'extendlimit', id: s.meeting, ms: 60000, actor: 'r-acad' }, 'r-acad')
    const after = await call('vibe_vmu_meeting', { action: 'status', id: s.meeting }, 'r-acad')
    return { s, before, r, after }
  })
  cell('C4b-extendlimit-on-open', 'opening-path', 'open meeting; chair extendlimit(+60s)',
    'wallLimitMs grows by 60000, extendedMs 60000, extensions 1, and status reads the new wall clock back',
    { ok: exOpen.r.ok, wall: num(exOpen.r.wallLimitMs), extendedMs: num(exOpen.r.extendedMs), extensions: num(exOpen.r.extensions), statusWall: num(exOpen.after.wallLimitMs) },
    exOpen.r.ok === true && num(exOpen.r.wallLimitMs) === num(exOpen.before.wallLimitMs || 1800000) + 60000 && exOpen.r.extendedMs === 60000 && exOpen.r.extensions === 1 && num(exOpen.after.wallLimitMs) === num(exOpen.r.wallLimitMs),
    'the wall clock is extendable once the meeting is OPEN/recess; its receipt carries the new ceiling and the extension count')
  expectRefusal('vibe_vmu_meeting', 'VMU_RESOURCE_BUDGET')
  const exCap = await step('extend/over-ceiling', () => call('vibe_vmu_meeting', { action: 'extendlimit', id: exOpen.s.meeting, ms: 999999999, actor: 'r-acad' }, 'r-acad'))
  cell('C4c-extendlimit-over-ceiling', 'opening-path', 'open meeting; extendlimit beyond extendCeilingMs',
    'refused by name (VMU_RESOURCE_BUDGET), ceiling unchanged',
    { ok: exCap.ok, code: exCap.code, message: String(exCap.message || '').slice(0, 160) },
    exCap.ok === false && exCap.code === 'VMU_RESOURCE_BUDGET')
  const exSpeech = await step('extend/speech', () => call('vibe_vmu_meeting', { action: 'extend', id: exOpen.s.meeting, member: 'r-acad', ms: 1000 }, 'r-acad'))
  cell('C4d-speech-extend', 'opening-path', 'open meeting; action extend (speech slot) by the chair',
    'accepted as the speech-timeslice extension (NOT the wall clock): ok true, no wallLimitMs change',
    { ok: exSpeech.ok, wall: num(exSpeech.wallLimitMs), bound: exSpeech.speechBound, code: exSpeech.code },
    exSpeech.ok === true && num(exSpeech.wallLimitMs) === null,
    'extend and extendlimit are two different acts; the matrix pins which one changes which number')

  // ── ⑤ LATE ADMISSION, all three policies plus a counterexample each. openedAt is forced into the past by convening
  //      with `at`, which is the measured technique the live scenario uses (lateAfterMs is 1 ms).
  const pastAt = ISO(NOW - 120000)
  const late = {}
  for (const policy of ['open', 'chair', 'refuse']) {
    const s = await step('late/' + policy + '-convene', () => call('vibe_v5_meeting', { agenda: '迟到政策 ' + policy, title: '迟到-' + policy, type: 'ordinary', member: 'r-acad', at: pastAt, members: ['r-1', 'r-2'], lateAdmission: policy }, 'r-acad'))
    late[policy] = { mid: s.meeting, conv: s }
  }
  const lo = await step('late/open-attend', () => call('vibe_vmu_meeting', { action: 'attend', id: late.open.mid, member: 'r-1' }, 'r-1'))
  cell('D1-late-open-auto-seat', 'late-admission', 'policy open; 120s-late arrival',
    'SEATED automatically: ok true, late true, pendingLate false, member in present',
    { ok: lo.ok, late: lo.late, pendingLate: lo.pendingLate, state: lo.state, quorum: pick(lo.quorum, ['present']) },
    lo.ok === true && lo.late === true && lo.pendingLate === false && lo.state === 'open')
  const lc = await step('late/chair-attend', () => call('vibe_vmu_meeting', { action: 'attend', id: late.chair.mid, member: 'r-2' }, 'r-2'))
  const lcst = await step('late/chair-status-held', () => call('vibe_vmu_meeting', { action: 'status', id: late.chair.mid }, 'r-acad'))
  cell('D2-late-chair-hold', 'late-admission', 'policy chair; 120s-late arrival',
    'HELD at the door: late true, pendingLate true, NOT in present, pendingLateMembers names r-2',
    { ok: lc.ok, late: lc.late, pendingLate: lc.pendingLate, pendingLateMembers: lc.pendingLateMembers, present: lcst.present },
    lc.ok === true && lc.late === true && lc.pendingLate === true && Array.isArray(lc.pendingLateMembers) && lc.pendingLateMembers.includes('r-2') && Array.isArray(lcst.present) && !lcst.present.includes('r-2'),
    'holding is not seating: the door branch leaves present untouched until admit()')
  expectRefusal('vibe_vmu_meeting', 'VMU_NOT_PERMITTED')
  const lcBad = await step('late/chair-nonchair-admit', () => call('vibe_vmu_meeting', { action: 'admit', id: late.chair.mid, member: 'r-2', actor: 'r-1', reason: 'counterexample: a member tries the chair door' }, 'r-1'))
  const lcAdm = await step('late/chair-admit', () => call('vibe_vmu_meeting', { action: 'admit', id: late.chair.mid, member: 'r-2', actor: 'r-acad', reason: 'chair admits the held arrival' }, 'r-acad'))
  const lcAdmSt = await step('late/chair-after-admit', () => call('vibe_vmu_meeting', { action: 'status', id: late.chair.mid }, 'r-acad'))
  cell('D2b-late-chair-nonchair-admit-refused', 'late-admission', 'member r-1 calls admit on the chair policy',
    'refused by name (VMU_NOT_PERMITTED): the door is the chair own authority',
    { ok: lcBad.ok, code: lcBad.code }, lcBad.ok === false && lcBad.code === 'VMU_NOT_PERMITTED')
  cell('D2c-late-chair-chair-admit', 'late-admission', 'chair admits the held arrival',
    'admitted true, admittedBy r-acad, r-2 now present, pendingLate no longer names r-2',
    { ok: lcAdm.ok, admitted: lcAdm.admitted, admittedBy: lcAdm.admittedBy, present: lcAdmSt.present, pendingLateMembers: lcAdmSt.pendingLateMembers },
    lcAdm.ok === true && lcAdm.admitted === true && lcAdm.admittedBy === 'r-acad' && Array.isArray(lcAdmSt.present) && lcAdmSt.present.includes('r-2') && !(Array.isArray(lcAdmSt.pendingLateMembers) && lcAdmSt.pendingLateMembers.includes('r-2')))
  expectRefusal('vibe_vmu_meeting', 'VMU_LATE_ADMISSION_REFUSED')
  const lr = await step('late/refuse-attend', () => call('vibe_vmu_meeting', { action: 'attend', id: late.refuse.mid, member: 'r-2' }, 'r-2'))
  const lrst = await step('late/refuse-status-unchanged', () => call('vibe_vmu_meeting', { action: 'status', id: late.refuse.mid }, 'r-acad'))
  cell('D3-late-refuse-never-seats', 'late-admission', 'policy refuse; 120s-late arrival',
    'refused by name (VMU_LATE_ADMISSION_REFUSED) and present is unchanged',
    { ok: lr.ok, code: lr.code, message: String(lr.message || '').slice(0, 140), present: lrst.present },
    lr.ok === false && lr.code === 'VMU_LATE_ADMISSION_REFUSED' && Array.isArray(lrst.present) && !lrst.present.includes('r-2'))
  expectRefusal('vibe_vmu_meeting', 'VMU_LATE_ADMISSION_REFUSED')
  const lr2 = await step('late/refuse-retry', () => call('vibe_vmu_meeting', { action: 'attend', id: late.refuse.mid, member: 'r-2' }, 'r-2'))
  cell('D3b-late-refuse-retry-still-refused', 'late-admission', 'policy refuse; a second attend() retry',
    'refused again by the same name: retrying attend() is not a repair (the hint names admit/next meeting)',
    { ok: lr2.ok, code: lr2.code }, lr2.ok === false && lr2.code === 'VMU_LATE_ADMISSION_REFUSED')
  expectRefusal('vibe_vmu_meeting', 'VMU_STATE')
  const lrAdm = await step('late/refuse-chair-admit', () => call('vibe_vmu_meeting', { action: 'admit', id: late.refuse.mid, member: 'r-2', actor: 'r-acad', reason: 'house rule refused the door; does the chair still hold an admission?' }, 'r-acad'))
  cell('D3c-late-refuse-chair-admit', 'late-admission', 'policy refuse; chair admit() after the refusal',
    'refuse is FINAL: there is no pendingLate row to admit, so the chair door is refused by name (VMU_STATE, not a silent no-op)',
    { ok: lrAdm.ok, code: lrAdm.code, message: String(lrAdm.message || '').slice(0, 160), admitted: lrAdm.admitted },
    lrAdm.ok === false && lrAdm.code === 'VMU_STATE',
    'design reading: refuse removes the chair override rather than recording a refusal the chair could later reverse; the counterexample proves the door cannot be reopened by admit()')

  // ── ⑥ IN-MEETING WAITS: one real firing path per event, plus the negative case (a wait must NOT fire on an event it
  //      did not name) and the deadline expiry path.
  const mkOpen = async (tag, members) => {
    const s = await call('vibe_v5_meeting', { agenda: '会中 wait：' + tag, title: 'wait-' + tag, type: 'ordinary', member: 'r-acad', members }, 'r-acad')
    for (const m of members) await call('vibe_vmu_meeting', { action: 'attend', id: s.meeting, member: m }, m)
    return s.meeting
  }
  const wSpeakM = await step('wait/speak-setup', () => mkOpen('speak', ['r-1', 'r-2']))
  const wSpeak = await step('wait/speak-arm', () => call('vibe_vmu_meeting', { action: 'wait', id: wSpeakM, member: 'r-1', until: 'speak' }, 'r-1'))
  const wSpeakFire = await step('wait/speak-fire', () => call('vibe_vmu_meeting', { action: 'speak', id: wSpeakM, member: 'r-acad', text: '主席发言：唤醒 speak 等待者。', why: 'matrix speak wake' }, 'r-acad'))
  const wSpeakSt = await step('wait/speak-status', () => call('vibe_vmu_meeting', { action: 'status', id: wSpeakM }, 'r-acad'))
  cell('E1-wait-speak-fired', 'wait', 'r-1 waits until speak; chair speaks',
    'the speak receipt names the fired waiter (member r-1, until speak) and status shows it fired/firedBy speak',
    { armed: wSpeak.armed, fired: (wSpeakFire.firedWaiters || []).map((x) => [x.member, x.until]), status: (wSpeakSt.waiters || []).map((x) => [x.member, x.until, x.state, x.firedBy]) },
    wSpeak.armed === true && (wSpeakFire.firedWaiters || []).some((x) => x.member === 'r-1' && x.until === 'speak') && (wSpeakSt.waiters || []).some((x) => x.member === 'r-1' && x.state === 'fired' && x.firedBy === 'speak'))

  const wVoteM = await step('wait/vote-setup', async () => {
    const s = await call('vibe_v5_meeting', { agenda: '会中 wait：vote', title: 'wait-vote', type: 'ordinary', member: 'r-acad', members: ['r-1', 'r-2'] }, 'r-acad')
    for (const m of ['r-1', 'r-2']) await call('vibe_vmu_meeting', { action: 'attend', id: s.meeting, member: m }, m)
    return s.meeting
  })
  const mo = await step('wait/vote-motion', () => call('vibe_v5_motion', { kind: 'topic', text: '矩阵动态：给 vote 等待者一个真实事件。', meeting: wVoteM, member: 'r-acad' }, 'r-acad'))
  const moId = typeof mo.motion === 'string' ? mo.motion : (mo.motion && mo.motion.id)
  const sec = await step('wait/vote-second', () => call('vibe_vmu_meeting', { action: 'second', id: wVoteM, motion: moId, member: 'r-1' }, 'r-1'))
  const wVote = await step('wait/vote-arm', () => call('vibe_vmu_meeting', { action: 'wait', id: wVoteM, member: 'r-2', until: 'vote' }, 'r-2'))
  const wVoteFire = await step('wait/vote-fire', () => call('vibe_vmu_meeting', { action: 'vote', id: wVoteM, member: 'r-1', motion: moId, value: 1 }, 'r-1'))
  cell('E2-wait-vote-fired', 'wait', 'r-2 waits until vote; motion mo1 is raised, seconded and voted',
    'the vote receipt names the fired waiter (r-2, until vote)',
    { motion: moId, second: pick(sec, ['ok', 'code']), armed: wVote.armed, fired: (wVoteFire.firedWaiters || []).map((x) => [x.member, x.until]), voteOk: wVoteFire.ok, tally: wVoteFire.tally },
    mo.ok === true && moId === 'mo1' && sec.ok === true && wVote.armed === true && wVoteFire.ok === true && (wVoteFire.firedWaiters || []).some((x) => x.member === 'r-2' && x.until === 'vote'))

  const wHandM = await step('wait/hand-setup', () => mkOpen('hand', ['r-1', 'r-2']))
  const wHand = await step('wait/hand-arm', () => call('vibe_vmu_meeting', { action: 'wait', id: wHandM, member: 'r-1', until: 'hand' }, 'r-1'))
  const wHandFire = await step('wait/hand-fire', () => call('vibe_vmu_meeting', { action: 'hand', id: wHandM, member: 'r-2' }, 'r-2'))
  cell('E3-wait-hand-fired', 'wait', 'r-1 waits until hand; r-2 raises a hand',
    'the hand receipt names the fired waiter (r-1, until hand)',
    { armed: wHand.armed, fired: (wHandFire.firedWaiters || []).map((x) => [x.member, x.until]) },
    wHand.armed === true && (wHandFire.firedWaiters || []).some((x) => x.member === 'r-1' && x.until === 'hand'))

  const wAA = await step('wait/attend-all-setup', async () => {
    const s = await call('vibe_v5_meeting', { action: 'schedule', agenda: '会中 wait：attend-all', title: 'wait-aa', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 60000), members: ['r-1', 'r-2'] }, 'r-acad')
    h.kernel.meetings.sweepDue({ at: NOW + 60001 })
    const a1 = await call('vibe_vmu_meeting', { action: 'attend', id: s.meeting, member: 'r-1' }, 'r-1')
    const w = await call('vibe_vmu_meeting', { action: 'wait', id: s.meeting, member: 'r-1', until: 'attend-all' }, 'r-1')
    const a2 = await call('vibe_vmu_meeting', { action: 'attend', id: s.meeting, member: 'r-2' }, 'r-2')
    return { mid: s.meeting, a1, w, a2 }
  })
  cell('E4-wait-attend-all-fired', 'wait', 'waiting meeting (2-member roster); r-1 attends and waits until attend-all; r-2 is the last arrival',
    'the LAST attend fires the waiter (same attendanceRuleMet predicate that opens the meeting)',
    { armed: wAA.w.armed, fired: (wAA.a2.firedWaiters || []).map((x) => [x.member, x.until]), state: wAA.a2.state, settled: wAA.a2.settled },
    wAA.w.armed === true && (wAA.a2.firedWaiters || []).some((x) => x.member === 'r-1' && x.until === 'attend-all') && wAA.a2.settled === 'started',
    'RUN 254-E pinned this to attendanceRuleMet; this cell is the direct regression guard for that predicate')

  const wDeadM = await step('wait/deadline-setup', () => mkOpen('deadline', ['r-1', 'r-2']))
  const wDead = await step('wait/deadline-arm', () => call('vibe_vmu_meeting', { action: 'wait', id: wDeadM, member: 'r-2', until: 'deadline', timeoutMs: 5000 }, 'r-2'))
  const wDeadSweep = await step('wait/deadline-sweep', async () => h.kernel.meetings.sweepDue({ at: NOW + 6000 }))
  const wDeadSt = await step('wait/deadline-status', () => call('vibe_vmu_meeting', { action: 'status', id: wDeadM }, 'r-acad'))
  cell('E5-wait-deadline-expired', 'wait', 'r-2 waits until deadline with timeoutMs 5000; the sweep runs past it',
    'the waiter expires (not fires) and the sweep names it under expiredWaiters with the deadline wake',
    { deadlineAt: num(wDead.deadlineAt), expired: (wDeadSweep.expiredWaiters || []).map((x) => [x.member, x.until, x.state]), status: (wDeadSt.waiters || []).map((x) => [x.member, x.until, x.state]) },
    num(wDead.deadlineAt) === NOW + 5000 && (wDeadSweep.expiredWaiters || []).some((x) => x.member === 'r-2' && x.until === 'deadline') && (wDeadSt.waiters || []).some((x) => x.member === 'r-2' && x.state === 'expired'),
    'expiry is not firing: the event never happened, the timeout did')

  // negative case: a wait that names speak must NOT fire on a hand, and unwait must cancel it without a wake
  const wNegM = await step('wait/negative-setup', () => mkOpen('negative', ['r-1', 'r-2']))
  const wNeg = await step('wait/negative-arm', () => call('vibe_vmu_meeting', { action: 'wait', id: wNegM, member: 'r-1', until: 'speak' }, 'r-1'))
  const wNegHand = await step('wait/negative-hand-event', () => call('vibe_vmu_meeting', { action: 'hand', id: wNegM, member: 'r-2' }, 'r-2'))
  const wNegSt = await step('wait/negative-status', () => call('vibe_vmu_meeting', { action: 'status', id: wNegM }, 'r-acad'))
  const wNegUn = await step('wait/negative-unwait', () => call('vibe_vmu_meeting', { action: 'unwait', id: wNegM, member: 'r-1' }, 'r-1'))
  cell('E6-wait-not-fired-on-wrong-event', 'wait', 'r-1 waits until speak; a hand happens; then unwait',
    'the hand fires nobody (firedWaiters empty, waiter still armed); unwait says cancelled true and the waiter row turns cancelled with no wake',
    { handFired: (wNegHand.firedWaiters || []).map((x) => [x.member, x.until]), status: (wNegSt.waiters || []).map((x) => [x.member, x.until, x.state]), cancelled: wNegUn.cancelled, waitState: wNegUn.waiter && wNegUn.waiter.state, wake: wNegUn.waiter && wNegUn.waiter.wake },
    wNeg.armed === true && Array.isArray(wNegHand.firedWaiters) && wNegHand.firedWaiters.length === 0 && (wNegSt.waiters || []).some((x) => x.member === 'r-1' && x.state === 'armed') && wNegUn.cancelled === true && wNegUn.waiter && wNegUn.waiter.state === 'cancelled' && wNegUn.waiter.wake === null,
    'the negative half of every wait cell: a waiter is woken by ITS event only, and cancel is not a fire')

  // ── ⑦ APPOINTMENT NOTICE: the four elements (type, agenda, time, seat) asserted as STRINGS in both channels —
  //      the mail body and the [新到的消息] block a member reads on the next turn.
  const appt = await step('notice/appointment', () => call('vibe_v5_meeting', { action: 'schedule', agenda: '议题：矩阵预约通知四要素校验（类型/事项/时间/席位）', title: '矩阵预约通知', type: 'ordinary', member: 'r-acad', at: ISO(NOW + 120000), members: ['r-1', 'r-2'], lateAdmission: 'chair' }, 'r-acad'))
  const apptMid = appt.meeting
  const apptIso = appt.scheduledForIso || ISO(NOW + 120000)
  const inboxList = await step('notice/inbox-list', () => call('vibe_v5_inbox', { action: 'list', member: 'r-1' }, 'r-1'))
  // The mailbox already holds appointments from the earlier cells; the cell under test is THIS appointment, so the row is
  // selected by the subject the receipt above wrote (picking "the first meeting-appointment row" measured an old cell).
  const apptRow = (inboxList.rows || []).find((r) => r && r.kind === 'meeting-appointment' && String(r.subject || '').includes('矩阵预约通知'))
  const mailBody = apptRow ? await step('notice/inbox-open', () => call('vibe_v5_inbox', { action: 'open', member: 'r-1', id: apptRow.id }, 'r-1')) : null
  const mailText = String((mailBody && mailBody.message && mailBody.message.text) || '')
  const noticePrompt = await h.prompts.assembleFor({ seat: 'member', member: 'r-1', phase: 'normal' })
  const noticeStart = noticePrompt.indexOf('[新到的消息]')
  const noticeAll = noticeStart === -1 ? '' : noticePrompt.slice(noticeStart)
  // The block holds every un-acked notice; the four-element question is about THIS appointment line, so the line is
  // isolated by the scheduled instant (a block-level includes() would pass on an older line's text).
  const noticeBlock = noticeAll.split(String.fromCharCode(10)).find((l) => l.includes(apptIso)) || ''
  const wantType = 'type ordinary'
  const wantAgenda = '议题：' + appt.agenda
  const wantTime = '时间：' + apptIso
  const wantSeat = '你的席位：member'
  cell('F1-appointment-mail-four-elements', 'appointment-notice', 'chair schedules an ordinary meeting for r-1/r-2 at +120s; r-1 opens the mail',
    'mail body carries all four elements as strings: type, 议题, 时间 (scheduledFor ISO), 你的席位',
    { subject: apptRow && apptRow.subject, bytes: apptRow && apptRow.bytes, hasType: mailText.includes(wantType), hasAgenda: mailText.includes(wantAgenda), hasTime: mailText.includes(wantTime), hasSeat: mailText.includes(wantSeat) },
    !!apptRow && apptRow.kind === 'meeting-appointment' && mailText.includes(wantType) && mailText.includes(wantAgenda) && mailText.includes(wantTime) && mailText.includes(wantSeat),
    'the mail is the durable channel; the notice line is the same fact on the turn prompt')
  cell('F2-appointment-notice-block', 'appointment-notice', 'r-1 next-turn assembly with un-acked appointment mail',
    'the [新到的消息] block names the chair, the title, the scheduled time and the attend call (ack id included)',
    { hasBlock: noticeStart !== -1, hasChair: noticeBlock.includes('【会议预约·r-acad】'), hasTitle: noticeBlock.includes('矩阵预约通知'), hasTime: noticeBlock.includes(apptIso), hasAttend: noticeBlock.includes('attend'), chars: noticeBlock.length },
    noticeStart !== -1 && noticeBlock.includes('【会议预约·r-acad】') && noticeBlock.includes('矩阵预约通知') && noticeBlock.includes(apptIso) && noticeBlock.includes('attend'),
    'RUN 254-B pinned the simulator to the SAME notice producer a real turn reads, so this block is the text a member actually gets')
  cell('F3-appointment-notice-missing-elements', 'appointment-notice', 'same block, the other two elements',
    'the notice line ALSO carries 类型/事项/席位 (the lead asked for all four in BOTH channels)',
    { hasType: noticeBlock.includes('ordinary'), hasAgenda: noticeBlock.includes('议题：'), hasSeat: noticeBlock.includes('席位'), block: noticeBlock.slice(0, 260) },
    noticeBlock.includes('ordinary') && noticeBlock.includes('议题：') && noticeBlock.includes('席位'),
    'product defect F-MX-02: the notice line carries chair/title/time/attend but NOT the meeting type, the agenda or the seat — the body has all four, the prompt line has two, so a member reading only the notice cannot tell what the meeting is about or whether it is their seat that is invited')

  // ── ⑧ SUMMARY
  const passCount = cells.filter((c) => c.pass).length
  const byGroup = {}
  for (const c of cells) {
    byGroup[c.group] = byGroup[c.group] || { cells: 0, pass: 0, fail: 0 }
    byGroup[c.group].cells += 1
    if (c.pass) byGroup[c.group].pass += 1
    else byGroup[c.group].fail += 1
  }
  const highlights = {
    matrix: { cells, groups: byGroup, total: cells.length, pass: passCount, fail: failures, altBoots },
    base,
    appointment: { meeting: apptMid, scheduledForIso: apptIso, mailSubject: apptRow && apptRow.subject, noticeChars: noticeBlock.length },
    waiters: { speak: pick(wSpeakFire, ['ok']), vote: pick(wVoteFire, ['ok']), hand: pick(wHandFire, ['ok']), attendAll: pick(wAA.a2, ['ok', 'settled']), deadlineExpired: (wDeadSweep.expiredWaiters || []).length },
    promptChars: { chairNormal: 0, memberNormal: noticePrompt.length },
  }
  log('matrix ' + passCount + '/' + cells.length + ' cells pass' + (failures.length ? ' — FAIL: ' + failures.join(', ') : ''))
  return {
    steps,
    highlights,
    expectedRefusals,
    receipts: h.receipts,
    tree: h.tree ? h.tree() : [],
    promptChars: { 'member:normal:r-1': noticePrompt.length },
  }
}

export const scenario = meetingMatrix
export default meetingMatrix
