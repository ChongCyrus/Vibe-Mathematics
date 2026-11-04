// scripts/sim/scenarios/meetings.mjs — the MEETING lifecycle, driven by a SCRIPT, not by a language model.
//
// WHY THIS SCENARIO EXISTS. The meeting surface is the part of v5r that the institution actually transacts in: a chair
// convenes a session, seats are counted, the floor is handed out, a late arrival is admitted or refused, the session is
// closed, and the record (minutes / closure reading) is read back afterwards. Each of those is a mechanism with its own
// named refusals and its own receipt fields, and every one of them is easy to break without any unit test noticing:
// a schedule that never settles, a queue that hands the floor to nobody, a close that cannot say what the institute
// decided. This scenario walks that lifecycle against the REAL kernel and records every receipt, so the audit in
// ../audit/receipts.mjs can ask its questions (refused steps, serialisation leaks, writes with an empty tree, refusals
// without a hint, codes the contract does not register) on evidence instead of prose.
//
// WHAT THE RULES FILE ASKS FOR (宏观层面v5r运行规则.md, the institution rules this exercises):
//   L43  only the chair convenes; a session may carry a scheduled time; seats that are not there yet put the session in
//        waiting, and an expired wait is the chair's decision (proceed / lapse / recess). Convening, closing and the
//        wall-clock ceiling are the chair's acts.
//   L45  which commands are allowed depends on the meeting TYPE and on the caller's seat.
//   L47-48 the six types: ordinary, academic exchange, debate, closure, paper exchange, planning.
//   L50  the common commands: hand, invitation to speak, a batch of speakers in order, the single-speech group chat.
//   L55-56 a debate carries its own extra field: the debate object (a card id or a file reference).
//   L58  the closure vote needs at least min(the configured floor, chair + permanent researchers).
//   L62-64 the debate flow and the final ruling (the ruling itself is exercised by the verdict scenario; here the
//        debate TYPE and its subject gate are what this scenario covers).
//
// ★ THE CLOCK IS FIXED. run.mjs boots the harness with `clock: () => 1_800_000_000_000`, so this scenario must be
// written against THAT instant, never against the wall clock. Where a mechanism needs time to pass (a scheduled start,
// an expired wait), the scenario advances the SWEEP itself (`kernel.meetings.sweepDue({at})`) — the same synchronous
// pass `beat()` runs, driven with an explicit instant. Receipts that need a real advance of the kernel clock cannot be
// produced here, and the scenario says so where it matters instead of pretending otherwise.
//
// ★ EXPECTED REFUSALS ARE DECLARED, NOT HIDDEN. run.mjs exits non-zero when a receipt carries an UNEXPECTED mechanism
// refusal, and that number is the scenario's own signal ("the scenario hit a wall it did not predict"). A scenario that
// is ABOUT a refusal says so in its return value (`expectedRefusals: [{ tool, code }]`): the runner then records the
// refusal as evidence (REPORT.md prints its code/message/hint) without counting it as a defect. This scenario declares
// exactly two: a late arrival under lateAdmission:"refuse", and a non-chair admit(). (RUN 230 made extend() on a service
// meeting succeed instead of hitting the registry boundary, so that step now reads the extension back.)
// Everything it does NOT declare still fails the run.

// The DEPLOYMENT setting this scenario needs. `vmu.meetings.lateAfterMs` is snapshotted by createMeetings() at
// construction (kernel/meetings.js:539), so a running kernel cannot be told about it (vibe_v5_set answers
// requiresRestart:true) — the declaration has to reach boot(), which is what run.mjs does with this export
// (entry.apply(ctx, { vmu: settings }), the same path a real deployment's config.vmu takes). 1 ms means "seated more
// than 1 ms after openedAt is late"; 0 would switch the late test off.
export const settings = { 'vmu.meetings.lateAfterMs': 1 }

/**
 * @param {{ call: Function, kernel: any, receipts: Array, prompts: any, specOf: Function, tree: Function }} h
 * @param {{ log?: Function }} [opts]
 */
export async function meetings(h, { log = () => {} } = {}) {
  const steps = []
  const highlights = {}
  const NOW = 1_800_000_000_000 // the fixed clock harness.mjs boots with (its default `clock`)
  const as = (id) => ({ as: { agent: { id } } })
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const pick = (o, keys) => {
    const out = {}
    if (!o || typeof o !== 'object') return out
    for (const k of keys) if (o[k] !== undefined) out[k] = o[k]
    return out
  }
  const files = () => (h.tree ? h.tree().length : 0)
  const step = async (name, fn) => {
    const before = files()
    const out = await fn()
    steps.push({ name, at: h.receipts.length, files: { before, after: files() }, ok: !(out && out.ok === false), code: out && out.code ? out.code : null })
    log(name + (out && out.ok === false ? '  [' + (out.code || 'refused') + ']' : ''))
    return out
  }

  // ── ① THE INSTITUTE EXISTS (a chair plus two permanent researchers: the roster every meeting reads) ──────────────
  const started = await step('institute/start', () => h.call('vibe_v5_start', {
    problem: '会议机制剧本：六种会议类型、预约/等待、迟到入席、发言序、关会与关会后读面（占位题，不压数学）。',
    researcherCount: 2,
  }))
  const seats = ['r-acad', 'r-1', 'r-2']
  highlights.start = pick(started, ['ok', 'hired', 'hiredNow', 'rosterBefore'])
  // The TYPE VOCABULARY a member must obey is readable from the seat that must obey it (the catalogue lives in
  // settings; the primitive face reports the declaration, it does not invent one).
  const catalogue = await step('types/catalogue', () => h.call('vibe_vmu_meeting', { action: 'types' }))
  highlights.typeCatalogue = pick(catalogue, ['ok', 'declaredMeetingTypes', 'declaredSource', 'ballotKinds', 'meetingTypeOwner'])

  // ── ② SIX MEETING TYPES (L47-48). Each convene answers with the type, the recommended procedure and its binding.
  //      A type whose procedure is null is NOT a gap: ordinary has no recommended skeleton by decision (L45-46).
  const types = {}
  for (const type of ['ordinary', 'academic', 'closure', 'paper', 'planning']) {
    const r = await step('types/' + type, () => h.call('vibe_v5_meeting', {
      agenda: type + ' 议程：只压机制，不做数学。',
      title: type + ' 会议',
      type,
      member: 'r-acad',
    }))
    types[type] = pick(r, ['ok', 'meeting', 'type', 'state', 'procedureBinding', 'pendingSteps', 'kind', 'kindIsLabelOnly'])
    if (r && r.procedure && Array.isArray(r.procedure.steps)) types[type].procedureSteps = r.procedure.steps.map((s) => s.phase)
  }
  // A DEBATE carries its own extra field (L55-56): the debate object. A one-line proposition has no addressable proof
  // carrier, so the only shape that passes the gate without a provenance row is a FILE reference with evidence
  // (`subject_evidence.file` — the gate checks the caller-reported `readable` / `bytes` and says `evidenceSource`).
  const debate = await step('types/debate', () => h.call('vibe_v5_meeting', {
    agenda: '辩论：所选文件中的结论是否与代码描述一致（L60 的焦点）。',
    title: '辩论会议',
    type: 'debate',
    member: 'r-acad',
    subject: 'Shared/Protocol.md',
    subject_evidence: { file: { readable: true, bytes: 1024, name: 'Shared/Protocol.md' } },
  }))
  types.debate = Object.assign(pick(debate, ['ok', 'meeting', 'type', 'state', 'subject', 'procedureBinding', 'evidenceSource', 'proofContentChecked']), {
    procedureSteps: debate && debate.procedure && Array.isArray(debate.procedure.steps) ? debate.procedure.steps.map((s) => s.phase) : null,
    subjectGate: pick(debate && debate.subjectGate, ['ok', 'basis', 'form', 'code']),
  })
  highlights.types = types

  // ── ③ SCHEDULED SESSION, ABSOLUTE `at` (L43: a meeting may carry a scheduled time). A future instant puts the
  //      meeting in `scheduled`; the session is READABLE at once and seats may sign in early (attend is the one act
  //      the kernel exempts before the start — the receipt of open() says so in `scheduleNote`).
  const schedIso = new Date(NOW + 60_000).toISOString()
  const sched = await step('schedule/absolute-iso', () => h.call('vibe_v5_meeting', {
    agenda: '预约会议（绝对时间）：到点结算。',
    title: '预约会议 · ISO',
    member: 'r-acad',
    at: schedIso,
  }))
  const schedId = sched && (sched.meeting || sched.id) || null
  const schedFor = num(sched && sched.scheduledFor)
  const schedStatus = await step('schedule/status-before-start', () => h.call('vibe_vmu_meeting', { action: 'status', id: schedId }))
  highlights.schedule = {
    at: schedIso,
    state: sched && sched.state,
    scheduledFor: schedFor,
    scheduleNote: sched && sched.scheduleNote,
    readBeforeStart: pick(schedStatus, ['ok', 'state', 'scheduledFor', 'waitRecommended', 'waitRecommendedWhy', 'lateAdmission', 'pendingLate']),
    waitStates: schedStatus && schedStatus.waitStates,
  }
  // A SECOND scheduled session, by RELATIVE OFFSET (L43: "a time", not a timestamp the caller must compute).
  const relAt = '+60s'
  const schedRel = await step('schedule/relative-offset', () => h.call('vibe_v5_meeting', {
    agenda: '预约会议（相对偏移）：内核解析 +60s。',
    title: '预约会议 · 相对',
    member: 'r-acad',
    at: relAt,
  }))
  // ★ MEASURED LIMITATION, recorded rather than papered over: kernel/meetings.js:355 resolves a relative offset with
  // `Date.now() + delta`, NOT with the kernel clock, although the refusal hint says "the kernel adds it to its own
  // clock". Under this scenario the kernel clock is 2027-01-15 and the wall clock is earlier, so "+60s" lands in the
  // PAST: the meeting opens at once (state open, scheduledFor null) instead of being scheduled. The receipt is honest
  // about the instants it prints; what it cannot do is schedule against the clock the scenario runs on.
  highlights.schedule.relativeOffset = Object.assign(
    pick(schedRel, ['ok', 'code', 'meeting', 'state', 'scheduledFor', 'at', 'scheduleNote']),
    { means: 'a relative offset is resolved with Date.now() (wall clock), not the kernel clock; with this scenario fixed clock the offset lands in the past and the session opens immediately' },
  )
  // Early sign-in, then the sweep at the start instant: the same syncMeeting the beat runs, driven with `at`.
  const schedAttend = []
  for (const seat of ['r-1', 'r-2']) {
    schedAttend.push(await step('schedule/attend-before-start/' + seat, () => h.call('vibe_vmu_meeting', { action: 'attend', id: schedId, member: seat }, as(seat))))
  }
  const beat = await step('schedule/beat', () => h.call('vibe_vmu_control', { action: 'beat' }))
  // The sweep whose instant IS the start. `beat` runs this same pass at the kernel clock, and under a fixed clock that
  // instant is BEFORE the start, so the beat cannot settle a future session — the scenario says that in
  // `settlementMeans` and advances the sweep itself.
  let schedSettle = null
  if (schedFor !== null) {
    schedSettle = h.kernel.meetings.sweepDue({ at: schedFor + 1_000 })
  }
  const schedAfter = await step('schedule/status-after-settle', () => h.call('vibe_vmu_meeting', { action: 'status', id: schedId }))
  highlights.schedule.settlement = {
    beatSweep: beat && beat.meetings && beat.meetings.sweep,
    sweepDue: schedSettle,
    settlementMeans: 'beat() runs the meetings sweep at the kernel clock; this scenario clock is FIXED, so a start later than the clock cannot settle at the beat instant. The same pass is driven here with its own `at` (kernel.meetings.sweepDue({at}) — the one beat calls), which is what produces the scheduled → open transition below.',
    after: pick(schedAfter, ['ok', 'state', 'startedLate', 'activatedAt', 'waitStartedAt', 'waitDecisionDue', 'present', 'waitRecommended']),
  }

  // ── ④ WAITING (L43): seats missing at the start put the session in `waiting`; an expired wait is the chair's
  //      decision, and the framework names that decision (`waitDecisionDue`) instead of deciding for the chair.
  const schedWait = await step('waiting/schedule', () => h.call('vibe_v5_meeting', {
    agenda: '预约会议（只到主席）：进入等待，超时由主席决定。',
    title: '预约会议 · 等待',
    member: 'r-acad',
    at: new Date(NOW + 120_000).toISOString(),
  }))
  const waitId = schedWait && (schedWait.meeting || schedWait.id) || null
  const waitFor = num(schedWait && schedWait.scheduledFor)
  const waitSweep1 = waitFor === null ? null : h.kernel.meetings.sweepDue({ at: waitFor + 1_000 })
  const waitStatus1 = await step('waiting/status', () => h.call('vibe_vmu_meeting', { action: 'status', id: waitId }))
  // The wait deadline is its own declared budget (`vmu.meetings.waitOnDueMs`, default 10 minutes); sweep past it.
  const waitSweep2 = waitFor === null ? null : h.kernel.meetings.sweepDue({ at: waitFor + 10 * 60_000 })
  const waitStatus2 = await step('waiting/status-expired', () => h.call('vibe_vmu_meeting', { action: 'status', id: waitId }))
  const waitProceed = await step('waiting/proceed', () => h.call('vibe_vmu_meeting', { action: 'proceed', meeting: waitId, actor: 'r-acad', by: 'r-acad', reason: '到点的等待由主席决定：用已到的席位开会。' }))
  highlights.waiting = {
    scheduledFor: waitFor,
    transitions: [waitSweep1, waitSweep2].map((s) => (s ? pick(s, ['at', 'swept', 'transitions', 'note']) : null)),
    beforeDecision: pick(waitStatus1, ['ok', 'state', 'waitStartedAt', 'waitDecisionDue', 'waitRecommended', 'waitRecommendedWhy']),
    expired: pick(waitStatus2, ['ok', 'state', 'waitDecisionDue', 'waitRecommended', 'note', 'reason']),
    proceed: pick(waitProceed, ['ok', 'state', 'decision', 'from', 'to']),
  }

  // ── ⑤ ATTEND TO QUORUM. `present` = the chair (seated by open(), so the house can transact at all) plus whoever
  //      attended; the floor question (`met`) and the institution rule (`unanimity`) are reported separately — with
  //      this deployment rule (m-unanimous) the house is unanimous only when every seat has arrived (L58).
  const quorumMeeting = await step('quorum/open', () => h.call('vibe_v5_meeting', {
    agenda: '法定人数：三席到齐后才成立（m-unanimous）。',
    title: '法定人数会议',
    member: 'r-acad',
  }))
  const quorumId = quorumMeeting && (quorumMeeting.meeting || quorumMeeting.id) || null
  const quorumAttend = []
  for (const seat of ['r-1', 'r-2']) {
    quorumAttend.push(await step('quorum/attend/' + seat, () => h.call('vibe_vmu_meeting', { action: 'attend', id: quorumId, member: seat }, as(seat))))
  }
  const quorumStatus = await step('quorum/status', () => h.call('vibe_vmu_meeting', { action: 'status', id: quorumId }))
  highlights.quorum = {
    attend: quorumAttend.map((r) => pick(r, ['ok', 'member', 'late', 'alreadyPresent', 'state'])),
    last: pick(quorumAttend[quorumAttend.length - 1] && quorumAttend[quorumAttend.length - 1].quorum, ['present', 'roster', 'required', 'met', 'rule', 'unanimity', 'maxUniverse']),
    status: pick(quorumStatus, ['ok', 'state', 'present', 'presentCount', 'waitRecommended', 'waitRecommendedWhy', 'lateAdmission', 'pendingLate']),
  }

  // ── ⑥ LATE ADMISSION (L43 + the late-admission policy added in RUN 225-B). The late test is
  //      `vmu.meetings.lateAfterMs` measured against `openedAt`; the setting is snapshotted by createMeetings() at
  //      CONSTRUCTION, so this scenario DECLARES it for the whole run (`export const settings` above) instead of
  //      setting it at run time — `vibe_v5_set` on it can only answer `requiresRestart:true`. A meeting convened with
  //      `at` in the PAST opens AT that instant (openedAt = atMs(at)), so a call at the fixed clock is 120 s late: that
  //      is what makes all three policies reachable here:
  //        · open   — the late arrival is SEATED, and the receipt says late:true;
  //        · chair  — the late arrival is HELD at the door (pendingLate:true) until the CHAIR calls admit(), which
  //                   records admittedBy/admittedAt and turns up in summary.lateAdmissions;
  //        · refuse — the late arrival is refused BY NAME (VMU_LATE_ADMISSION_REFUSED, two repairs in the hint).
  //      The refuse receipt is a DECLARED expected refusal (see `expectedRefusals` in the return value): showing it is
  //      the point of the step, so it is evidence, not a defect of the run.
  const pastAt = NOW - 120_000
  const lateOpen = await step('late/policy-open', () => h.call('vibe_v5_meeting', {
    agenda: '迟到政策 open：迟到照进。',
    title: '迟到 · open',
    member: 'r-acad',
    at: pastAt,
    lateAdmission: 'open',
  }))
  const lateOpenId = lateOpen && (lateOpen.meeting || lateOpen.id) || null
  const lateOpenAttend = await step('late/attend-open', () => h.call('vibe_vmu_meeting', { action: 'attend', id: lateOpenId, member: 'r-1' }, as('r-1')))
  const lateChair = await step('late/policy-chair', () => h.call('vibe_v5_meeting', {
    agenda: '迟到政策 chair：迟到者停在门口，等主席 admit。',
    title: '迟到 · chair',
    member: 'r-acad',
    at: pastAt,
    lateAdmission: 'chair',
  }))
  const lateChairId = lateChair && (lateChair.meeting || lateChair.id) || null
  const lateChairAttend = await step('late/attend-chair', () => h.call('vibe_vmu_meeting', { action: 'attend', id: lateChairId, member: 'r-2' }, as('r-2')))
  // The chair branch needs the arrival to be HELD. It is, with the declared setting; if somebody reruns this scenario
  // with a command-line override that switches the late test off (`--vmu vmu.meetings.lateAfterMs=0`), the door never
  // engages and the scenario says so instead of calling admit() on a member who is already seated.
  const heldAtDoor = !!(lateChairAttend && lateChairAttend.pendingLate === true)
  let admitByMember = null
  let admitted = null
  let lateSummary = null
  if (heldAtDoor) {
    // A member attempting the chair's door is refused by name (the held arrival is NOT seated on its own word).
    admitByMember = await step('late/admit-by-member', () => h.call('vibe_vmu_meeting', { action: 'admit', id: lateChairId, member: 'r-2', actor: 'r-1', reason: '我替他签到。' }, as('r-1')))
    admitted = await step('late/admit-chair', () => h.call('vibe_vmu_meeting', { action: 'admit', id: lateChairId, member: 'r-2', actor: 'r-acad', reason: '路上耽误，主席放行。' }, as('r-acad')))
    lateSummary = await step('late/summary', () => h.call('vibe_vmu_meeting', { action: 'summary', id: lateChairId }))
  }
  highlights.lateAdmission = {
    settings: { 'vmu.meetings.lateAfterMs': 1 },
    policies: {
      open: pick(lateOpen, ['ok', 'meeting', 'state', 'lateAdmission', 'lateAdmissionMeans', 'pendingLate', 'pendingLateCount']),
      chair: pick(lateChair, ['ok', 'meeting', 'state', 'lateAdmission', 'lateAdmissionMeans', 'pendingLate', 'pendingLateCount']),
    },
    openAttend: pick(lateOpenAttend, ['ok', 'late', 'lateAdmission', 'pendingLate', 'alreadyPresent', 'alreadyPresentMeans']),
    chairAttend: pick(lateChairAttend, ['ok', 'late', 'lateAdmission', 'pendingLate', 'pendingLateMembers', 'pendingLateCount', 'alreadyPresentMeans']),
    admitByMember: admitByMember ? pick(admitByMember, ['ok', 'code', 'message', 'hint']) : { ok: null, means: 'not exercised: the arrival was not held at the door, so there was no door for a non-chair to try' },
    admit: admitted ? pick(admitted, ['ok', 'admitted', 'admittedBy', 'admittedAt', 'late', 'lateAdmission', 'pendingLate', 'pendingLateCount', 'quorum', 'state']) : { ok: null, means: 'not exercised: pendingLate was empty (the late test is off), so there was nothing for the chair to admit' },
    summary: lateSummary ? pick(lateSummary, ['ok', 'lateAdmissions', 'pendingLate', 'pendingLateCount', 'waitStates']) : null,
    means: 'lateAfterMs is a DEPLOYMENT setting snapshotted at construction, so it is declared by this scenario and reaches boot() the same way config.vmu reaches a real deployment. openedAt for a meeting convened with a past `at` IS that past instant, so arrivals at the fixed clock are 120 s late and the three policies have something to act on.',
  }
  // The REFUSE policy: a normal call, declared as an expected refusal (see the header). The receipt is recorded like
  // every other and shows the code plus the two repairs in the hint.
  const lateRefuse = await step('late/policy-refuse', () => h.call('vibe_v5_meeting', {
    agenda: '迟到政策 refuse：迟到者被本会政策拒绝，回执给两条补救。',
    title: '迟到 · refuse',
    member: 'r-acad',
    at: pastAt,
    lateAdmission: 'refuse',
  }))
  const lateRefuseId = lateRefuse && (lateRefuse.meeting || lateRefuse.id) || null
  const refuseAttend = await step('late/attend-refuse', () => h.call('vibe_vmu_meeting', { action: 'attend', id: lateRefuseId, member: 'r-1' }, as('r-1')))
  highlights.lateAdmission.refuse = Object.assign(
    pick(lateRefuse, ['ok', 'meeting', 'state', 'lateAdmission', 'lateAdmissionMeans']),
    pick(refuseAttend, ['ok', 'code', 'late', 'lateAdmission', 'pendingLate', 'message', 'hint']),
  )

  // ── ⑦ THE FLOOR (L50): raise a hand, get invited, then speak in the order the queue handed out. `order` is the
  //      read face of the queue: it answers who is first and whether the queue is open, and it does not fake presence.
  const floorMeeting = await step('floor/open', () => h.call('vibe_v5_meeting', {
    agenda: '发言序：举手、邀请、按序发言。',
    title: '发言序会议',
    member: 'r-acad',
  }))
  const floorId = floorMeeting && (floorMeeting.meeting || floorMeeting.id) || null
  for (const seat of ['r-1', 'r-2']) {
    await step('floor/attend/' + seat, () => h.call('vibe_vmu_meeting', { action: 'attend', id: floorId, member: seat }, as(seat)))
  }
  const floorHand = await step('floor/hand', () => h.call('vibe_vmu_meeting', { action: 'hand', id: floorId, member: 'r-1' }, as('r-1')))
  const floorOrder1 = await step('floor/order-after-hand', () => h.call('vibe_vmu_meeting', { action: 'order', id: floorId }))
  const floorInvite = await step('floor/invite', () => h.call('vibe_vmu_meeting', { action: 'invite', id: floorId, members: ['r-2'], by: 'r-acad', why: '邀请第二位发言人（批量按序指定发言）。' }))
  const floorOrder2 = await step('floor/order-after-invite', () => h.call('vibe_vmu_meeting', { action: 'order', id: floorId }))
  const floorSpeak1 = await step('floor/invitedspeak/r-1', () => h.call('vibe_vmu_meeting', { action: 'invitedspeak', id: floorId, member: 'r-1', text: '先给结论：机制可跑通，剩下的是读数。', ms: 30_000 }, as('r-1')))
  const floorSpeak2 = await step('floor/invitedspeak/r-2', () => h.call('vibe_vmu_meeting', { action: 'invitedspeak', id: floorId, member: 'r-2', text: '补充一条：队列按邀请顺序发放，不按身份。', ms: 30_000 }, as('r-2')))
  const floorOrder3 = await step('floor/order-after-speech', () => h.call('vibe_vmu_meeting', { action: 'order', id: floorId }))
  // The seats that spoke are no longer "present but unheard": the wait block distinguishes present / spoke / absent.
  const floorStatus = await step('floor/status-after-speech', () => h.call('vibe_vmu_meeting', { action: 'status', id: floorId }))
  highlights.floor = {
    hand: pick(floorHand, ['ok', 'order', 'member', 'registry']),
    orderAfterHand: pick(floorOrder1, ['ok', 'mode', 'source', 'order', 'queueOpen', 'registry']),
    invite: pick(floorInvite, ['ok', 'order', 'invited', 'member']),
    orderAfterInvite: pick(floorOrder2, ['ok', 'mode', 'order']),
    speeches: [pick(floorSpeak1, ['ok', 'member', 'speechMs', 'order']), pick(floorSpeak2, ['ok', 'member', 'speechMs', 'order'])],
    orderAfterSpeech: pick(floorOrder3, ['ok', 'mode', 'order', 'queueOpen']),
    waitStatesAfterSpeech: floorStatus && floorStatus.waitStates
      ? floorStatus.waitStates.map((w) => ({ member: w.member, waitState: w.waitState, present: w.present, spoke: w.spoke, owes: w.owes }))
      : null,
    waitRecommendedAfterSpeech: pick(floorStatus, ['waitRecommended', 'waitRecommendedWhy']),
  }

  // ── ⑧ TWO CLOCKS, TWO COMMANDS (L43): `extend` is the SPEECH extension (how long this speaker may hold the floor) and
  //      it now crosses into the service registry — RUN 230 wired the dispatcher to `meetings.extend`, so the receipt says
  //      `registry:"service"` and the extension count comes back. `extendlimit` is the MEETING wall clock; it moves this
  //      meeting own ceiling and reads the new limit back. Both are chair acts, and the two receipts must not be
  //      confused: the speech ceiling stays `speechMaxMs`/`speechExtendMax`, the wall stays `wallLimitMs`.
  const extendService = await step('extend/service', () => h.call('vibe_vmu_meeting', { action: 'extend', id: floorId, member: 'r-acad', by: 'r-acad', ms: 60_000 }))
  const extendLimit = await step('extendlimit', () => h.call('vibe_vmu_meeting', { action: 'extendlimit', id: floorId, member: 'r-acad', by: 'r-acad', ms: 60 * 60_000 }))
  highlights.wall = {
    extendService: pick(extendService, ['ok', 'code', 'registry', 'member', 'ms', 'extensions', 'max', 'extendMeans']),
    extendlimit: pick(extendLimit, ['ok', 'wallLimitMs', 'extendedMs', 'wallLimitMsSource', 'extensions']),
  }

  // ── ⑨ CLOSE (L58 + the closure reading): the closure vote is the INSTITUTE-level judgement (`vibe_vmu_vote`), and
  //      `close` answers with the reading AT THE INSTANT OF THE CLOSE (`closureVoteFrozen`) beside the current one
  //      (`closureVote`), which is the distinction a later reader needs.
  const closureVotes = []
  for (const seat of seats) {
    closureVotes.push(await step('close/vote/' + seat, () => h.call('vibe_vmu_vote', { member: seat, solved: true, why: '机制剧本：本场会议把要展示的机制都跑到了。' }, as(seat))))
  }
  const motion = await step('close/motion', () => h.call('vibe_v5_motion', { meeting: quorumId, kind: 'resolution', text: '本场会议通过会议机制清单。', member: 'r-acad' }, as('r-acad')))
  const motionId = motion && (motion.motion || motion.id) || null
  const second = await step('close/second', () => h.call('vibe_v5_second', { meeting: quorumId, motion_id: motionId, member: 'r-1' }, as('r-1')))
  const motionVotes = []
  for (const seat of ['r-1', 'r-2']) {
    motionVotes.push(await step('close/motion-vote/' + seat, () => h.call('vibe_vmu_meeting', { action: 'vote', meeting: quorumId, motion: motionId, member: seat, value: 1 }, as(seat))))
  }
  const closed = await step('close/close', () => h.call('vibe_vmu_meeting', { action: 'close', id: quorumId, member: 'r-acad', by: 'r-acad', reason: '议程完成，主席关会。' }))
  highlights.close = {
    closureVotes: closureVotes.map((r) => pick(r, ['ok', 'member', 'solved', 'persistedToFold', 'foldKey'])),
    motion: pick(motion, ['ok', 'meeting', 'motion', 'motionQualified', 'status']),
    second: pick(second, ['ok', 'meeting', 'motion', 'status', 'secondedBy']),
    votes: motionVotes.map((r) => pick(r, ['ok', 'counted', 'value', 'tally'])),
    closureVote: closed && closed.closureVote ? pick(closed.closureVote, ['cast', 'confirmed', 'votesCast', 'votesFor', 'votesAgainst', 'votesTotal', 'missing', 'eligible', 'permission', 'reason']) : null,
    closureVoteAsOf: num(closed && closed.closureVoteAsOf),
    closureVoteFrozen: pick(closed && closed.closureVoteFrozen, ['ok', 'recordId', 'frozenAt', 'votesCast', 'cast', 'confirmed', 'missing', 'window', 'meeting']),
  }

  // ── ⑩ AFTER THE CLOSE: the record is archival (L43 + the read faces). `minutes` is the structured record, `verbatim`
  //      the transcript (its own setting); both still answer for a closed meeting, and `status` says archived.
  const minutesAfter = await step('after-close/minutes', () => h.call('vibe_vmu_meeting', { action: 'minutes', id: quorumId }))
  const verbatimAfter = await step('after-close/verbatim', () => h.call('vibe_vmu_meeting', { action: 'verbatim', id: quorumId }))
  const statusAfter = await step('after-close/status', () => h.call('vibe_vmu_meeting', { action: 'status', id: quorumId }))
  const summaryAfter = await step('after-close/summary', () => h.call('vibe_vmu_meeting', { action: 'summary', id: quorumId }))
  // The floor meeting was the one with SPEECHES in it, so its minutes are where the record of the words lives (the
  // close above only had motions and votes to record).
  const minutesFloor = await step('after-close/minutes-floor', () => h.call('vibe_vmu_meeting', { action: 'minutes', id: floorId }))
  // Live vs archived: a closed record leaves the live union and stays readable through `summary` / `archivedMeetings`.
  const listAfter = await step('after-close/list', () => h.call('vibe_vmu_meeting', { action: 'list' }))
  highlights.afterClose = {
    minutes: Object.assign(pick(minutesAfter, ['ok', 'archived', 'note']), {
      kinds: minutesAfter && Array.isArray(minutesAfter.entries) ? minutesAfter.entries.map((e) => e.kind) : null,
      actionCount: minutesAfter && Array.isArray(minutesAfter.actions) ? minutesAfter.actions.length : null,
    }),
    verbatim: pick(verbatimAfter, ['ok', 'enabled', 'count', 'retentionMs', 'dropped', 'note']),
    status: pick(statusAfter, ['ok', 'state', 'archived', 'archivedMeans', 'summaryAvailable']),
    summary: pick(summaryAfter, ['ok', 'state', 'closedAt', 'votes', 'votesSource', 'waitRecommended', 'pendingLateCount']),
    floorMinutes: Object.assign(pick(minutesFloor, ['ok', 'archived']), {
      kinds: minutesFloor && Array.isArray(minutesFloor.entries) ? minutesFloor.entries.map((e) => e.kind) : null,
      speakers: minutesFloor && Array.isArray(minutesFloor.entries)
        ? minutesFloor.entries.filter((e) => e.kind === 'speech').map((e) => e.member)
        : null,
    }),
    list: pick(listAfter, ['ok', 'registry', 'archivedMeetings', 'unionMeetingsIncludesArchived']),
  }

  // ── ⑪ WHAT THE SEATS WOULD HAVE BEEN TOLD (prompt capture: the corpus carries the text, not just the size) ──────
  const promptChars = {}
  if (h.prompts && typeof h.prompts.assembleFor === 'function') {
    for (const seat of ['chair', 'member']) {
      const text = await h.prompts.assembleFor({ seat, phase: 'normal' })
      promptChars[seat] = text.length
    }
  }

  // The two refusals this scenario is ABOUT (see the header): each is still recorded with its code and hint, but
  // none of them is a mechanism defect of the run. An UNDECLARED refusal stays a failure. The declaration is copied
  // into the corpus highlights as well, so a reader of the corpus (and an audit that learns to honour it) can tell a
  // predicted refusal from an unforeseen one without re-running the scenario.
  const expectedRefusals = [
    { tool: 'vibe_vmu_meeting', code: 'VMU_LATE_ADMISSION_REFUSED' },
    { tool: 'vibe_vmu_meeting', code: 'VMU_NOT_PERMITTED' },
  ]
  highlights.expectedRefusals = expectedRefusals

  return {
    steps,
    receipts: h.receipts,
    promptChars,
    tree: h.tree ? h.tree() : [],
    highlights,
    expectedRefusals,
  }
}
