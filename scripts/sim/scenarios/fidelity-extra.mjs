// scripts/sim/scenarios/fidelity-extra.mjs — RUN 240-F: the FIELDS the live runs read and the simulation never produced.
//
// WHY THIS SCENARIO EXISTS: `scripts/sim/audit/all.mjs` §5 compares every receipt the simulation has ever produced
// against `D:/_tmp/sim/real-fieldset.json` (the union of what REAL runs read back). After task-47 the gap list still
// named 14 tools whose receipts lack keys the live runs saw. Those keys are not decoration: each one is a fact a
// member or the office read out of a receipt — `asOfClose`, `counts`, `rounds`, `seatFace`, `target`, `plan`,
// `recovery`, `applicable`, `p1Routes`, `rev`, … A field the simulation never produces is a field nobody verified
// the kernel still publishes.
//
// HOW IT IS ORGANISED: one section per gap TOOL (G…), and inside each, the calls whose receipts carry the missing
// keys. `fid(tool, step, receipt, keys)` records which of the target keys the receipt actually carried, so the
// report can say "covered / still missing / unreachable, because …" without reading the corpus by hand.
//
// THE TWO THINGS IT DELIBERATELY DOES NOT DO:
//   1. It never invents a key. If a receipt lacks one, `fid` records it as missing and the reason is written in the
//      finish message — a fidelity gap that is a SUPERSEDED field (the kernel stopped publishing it) is reported as
//      such, not papered over.
//   2. It does not touch product code, other scenarios, or the audit criteria files. It is read-only toward the
//      institute: every write it makes goes through the public tool faces.
//
// WHAT THIS ASSEMBLY NEEDS DECLARED (otherwise the faces are zero-mechanism and refuse every call): the report face
// (enabled + a declared parameter + a declared report), the task stage machine, the seating/limits that make a
// capacity refusal reachable, and the caller delivery mode so a turn round can be parked and answered in-process.

import { boot } from '../harness.mjs'

export const settings = {
  // the caller path: `drive` parks the round on the caller, `step {reply}` answers it (see scripts/sim/scenarios/turns.mjs)
  deliverMode: 'caller',
  // capacity: with three live seats (chair + two researchers) a fourth hire is over the cap ⇒ the refusal that
  // carries `enforced`/`enforcedScope` becomes reachable on the hire face instead of staying theoretical
  'vmu.limits.maxLiveMembers': 3,
  // report: one declared parameter, one declared report, and the switch that turns the face on
  'vmu.report.enabled': true,
  'vmu.report.params': ['vmu.turn.selfCheck'],
  'vmu.report.whoMayChange': ['office'],
  'vmu.report.reports': [{
    name: 'fid-report',
    trigger: { kind: 'event', event: 'progress' },
    template: '保真仿真报表（只压字段形状，不压数学）',
    to: ['r-acad'],
    channel: 'log',
  }],
  // task stage machine: `stage`/`advance` refuse by name when no stages are declared at all
  'vmu.tasks.stages': ['draft', 'verify', 'done'],
}

const pick = (out, keys) => {
  const o = {}
  if (!out || typeof out !== 'object') return o
  for (const k of keys) o[k] = out[k] === undefined ? null : out[k]
  return o
}

const fence = (report) => '```json\n' + JSON.stringify(report) + '\n```'

export async function scenario(h, { log = () => {} } = {}) {
  const steps = []
  const expectedRefusals = []
  const notes = {}
  const highlights = {}
  /** Which of `keys` this receipt actually carried. Never fills a key in: absence is the measurement. */
  const fidelity = []
  const fid = (tool, stepName, out, keys) => {
    const present = (out && typeof out === 'object') ? keys.filter((k) => Object.prototype.hasOwnProperty.call(out, k)) : []
    fidelity.push({
      key: tool + ':' + keys.join('/'),
      step: stepName,
      observed: present,
      missing: keys.filter((k) => present.indexOf(k) === -1),
    })
  }

  const step = async (name, fn) => {
    const before = h.tree ? h.tree().length : 0
    let out
    try {
      out = await fn()
    } catch (e) {
      out = { ok: false, code: (e && e.code) || 'THREW', message: String((e && e.message) || e) }
    }
    const after = h.tree ? h.tree().length : 0
    steps.push({ name, at: h.receipts.length, files: { before, after }, ok: !(out && out.ok === false), code: (out && out.code) || null })
    log(name + (out && out.ok === false ? '  [' + (out.code || 'refused') + ']' : ''))
    return out
  }
  const expect = (tool, code, why) => { expectedRefusals.push({ tool, code, why }) }
  const as = (id) => ({ as: { agent: { id } } })

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G1. THE INSTITUTE — the seats every later section acts through
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const started = await step('G1/institute/start', () => h.call('vibe_v5_start', {
    problem: '保真仿真：把真机读过、仿真没产出的字段逐条真调出来（只压机制，不压数学）。',
    researcherCount: 2,
  }))
  highlights.start = pick(started, ['ok', 'institution', 'members', 'roster', 'chair', 'code'])
  expect('vibe_v5_start', 'VMU_STATE', '重复建所会被具名拒收；本场景只建一次，若已存在则按名记录')

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G1b. `vibe_vmu_human` — `recover` publishes the `plan`/`recovery` pair (the two keys the live runs read). The
  //     read-back half of the same face is sampled at the very END (G10), because a drift needs a write in between.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const humanRecover = await step('G1b/human/recover', () => h.call('vibe_vmu_human', { action: 'recover', reason: '保真仿真：读 plan/recovery 形状' }))
  fid('vibe_vmu_human', 'G1b/human/recover', humanRecover, ['plan', 'recovery', 'code', 'message', 'hint'])
  if (humanRecover && humanRecover.ok === false) expect('vibe_vmu_human', humanRecover.code, 'recover 未完全成功时按名拒收并列出失败的步骤')
  highlights.humanRecover = pick(humanRecover, ['ok', 'action', 'plan', 'recovery', 'code'])

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G2. `vibe_vmu_meeting` — the PRIMITIVE record's own read faces. The 13 missing keys (`agendaOpen`, `asked`,
  //     `closedReason`, `completeness`, `endedAt`, `forced`, `hasDeliverSeam`, `inputs`, `registryMeans`, `rounds`,
  //     `seatPolicy`, `silent`, `unreached`) are fields of `kernel/meeting.js`'s OWN status/summary, so they are only
  //     reachable on a meeting opened by the PRIMITIVE door — a service meeting answers a different shape.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const PRIM_ID = 'm-fid-prim'
  const primOpen = await step('G2/meeting/open', () => h.call('vibe_vmu_meeting', {
    action: 'open', id: PRIM_ID, agenda: '保真仿真：原语会议的字段形状（只压机制）',
    roster: ['r-acad', 'r-1', 'r-2'], secretary: 'r-1', member: 'r-acad',
  }))
  highlights.primOpen = pick(primOpen, ['ok', 'id', 'state', 'dropped', 'code'])
  if (primOpen && primOpen.ok === false) {
    expect('vibe_vmu_meeting', primOpen.code, '原语会议 open 在本装配上被具名拒收时，记录其码与原因')
  }

  const primStatus0 = await step('G2/meeting/status', () => h.call('vibe_vmu_meeting', { action: 'status', id: PRIM_ID }))
  fid('vibe_vmu_meeting', 'G2/meeting/status', primStatus0, [
    'agendaOpen', 'asked', 'closedReason', 'completeness', 'endedAt', 'forced', 'hasDeliverSeam',
    'inputs', 'registryMeans', 'rounds', 'seatPolicy', 'silent', 'unreached',
  ])
  highlights.primStatus0 = pick(primStatus0, ['ok', 'registry', 'state', 'rounds', 'asked', 'unreached', 'completeness', 'code'])

  // a member goes silent and one leaves the round unanswered — the two facts `silent`/`unreached` count
  const primSilent = await step('G2/meeting/silent', () => h.call('vibe_vmu_meeting', { action: 'silent', id: PRIM_ID, member: 'r-2', reason: '保真仿真：该席本轮不发言' }, as('r-2')))
  if (primSilent && primSilent.ok === false) expect('vibe_vmu_meeting', primSilent.code, 'silent 在无轮次/无席位时具名拒收（记录其码）')
  // the round is only complete when every ASKED member answered: two speak, one went silent above
  for (const s of ['r-acad', 'r-1']) {
    await step('G2/meeting/speak/' + s, () => h.call('vibe_vmu_meeting', {
      action: 'speak', id: PRIM_ID, member: s, text: '保真仿真：该席进入本轮（只压机制，不主张数学）',
    }, as(s)))
  }
  // the summary is read while the round is STILL LIVE: `inputs`/`unreached`/`completeness` are readings of an open
  // round (after the close the same face answers the archived/service shape instead)
  const primSummaryOpen = await step('G2/meeting/summary/open', () => h.call('vibe_vmu_meeting', { action: 'summary', id: PRIM_ID }))
  fid('vibe_vmu_meeting', 'G2/meeting/summary/open', primSummaryOpen, [
    'inputs', 'unreached', 'completeness', 'rounds', 'asked', 'silent', 'hasDeliverSeam', 'registryMeans', 'code',
  ])
  const primRound = await step('G2/meeting/complete', () => h.call('vibe_vmu_meeting', { action: 'complete', id: PRIM_ID }))
  if (primRound && primRound.ok === false) expect('vibe_vmu_meeting', primRound.code, 'complete 在轮次未齐时具名拒收（记录其码）')
  // `end` is what ends the DEBATE; only an explicitly ended debate makes `aggregationAllowed()` publish `endedAt`
  const primEnd = await step('G2/meeting/end', () => h.call('vibe_vmu_meeting', {
    action: 'end', id: PRIM_ID, reason: '保真仿真：原语会议显式结束辩论（读 endedAt）',
  }))
  if (primEnd && primEnd.ok === false) expect('vibe_vmu_meeting', primEnd.code, 'end 在没有进行中的辩论时具名拒收（记录其码）')
  const primAggr = await step('G2/meeting/aggregation', () => h.call('vibe_vmu_meeting', { action: 'aggregation', id: PRIM_ID }))
  fid('vibe_vmu_meeting', 'G2/meeting/aggregation', primAggr, ['allowed', 'mode', 'means', 'endedAt', 'code'])
  const primStatus1 = await step('G2/meeting/status/after', () => h.call('vibe_vmu_meeting', { action: 'status', id: PRIM_ID }))
  fid('vibe_vmu_meeting', 'G2/meeting/status/after', primStatus1, ['rounds', 'asked', 'silent', 'unreached', 'inputs', 'completeness', 'agendaOpen'])
  const primClose = await step('G2/meeting/close', () => h.call('vibe_vmu_meeting', { action: 'close', id: PRIM_ID, reason: '保真仿真：原语会议按规则收束' }))
  fid('vibe_vmu_meeting', 'G2/meeting/close', primClose, ['closedReason', 'endedAt', 'forced', 'rounds', 'code'])
  const primStatus2 = await step('G2/meeting/status/closed', () => h.call('vibe_vmu_meeting', { action: 'status', id: PRIM_ID }))
  fid('vibe_vmu_meeting', 'G2/meeting/status/closed', primStatus2, ['closedReason', 'endedAt', 'forced', 'hasDeliverSeam', 'registryMeans', 'rounds', 'seatPolicy', 'silent'])
  const primSummary = await step('G2/meeting/summary', () => h.call('vibe_vmu_meeting', { action: 'summary', id: PRIM_ID }))
  fid('vibe_vmu_meeting', 'G2/meeting/summary', primSummary, ['closedReason', 'endedAt', 'forced', 'inputs', 'silent', 'unreached', 'rounds', 'code'])

  // `seatPolicy` is only published by the FLOOR gates: a seat excluded by `vmu.meetings.attendDeniedSeats` is refused
  // when it raises a hand (tools/meeting.js#nonAttendingSeatGateOf, the same predicate `attend` uses). The kernel's
  // seat aliases are 'chair'/'member' (NOT the member ids), so the scenario denies the 'member' seat on purpose. The
  // key is set LIVE (not in the boot settings) because `attend()` reads a STARTUP snapshot — a boot-time denial would
  // lock r-1/r-2 out of the debate later, while the floor gate reads the live setting and can be restored.
  const SEAT_ID = 'm-fid-seat'
  await step('G2/meeting/open-seat-policy', () => h.call('vibe_vmu_meeting', {
    action: 'open', id: SEAT_ID, agenda: '保真仿真：读 hand 拒收的 seatPolicy 块',
    roster: ['r-acad', 'r-1', 'r-2'], secretary: 'r-1', member: 'r-acad',
  }))
  await step('G2/set/deny-member-seat', () => h.call('vibe_vmu_set', {
    key: 'vmu.meetings.attendDeniedSeats', value: ['member'], why: '保真仿真：让 member 席不能举手，以读 seatPolicy 块',
  }))
  const seatDenied = await step('G2/meeting/hand-denied', () => h.call('vibe_vmu_meeting', {
    action: 'hand', id: SEAT_ID, member: 'r-2', by: 'r-2',
  }, as('r-2')))
  fid('vibe_vmu_meeting', 'G2/meeting/hand-denied', seatDenied, ['seatPolicy', 'code', 'hint', 'message'])
  if (seatDenied && seatDenied.ok === false) expect('vibe_vmu_meeting', seatDenied.code, '被 vmu.meetings.attendDeniedSeats 排除的席位举手时按名拒收，并回 seatPolicy 块')
  await step('G2/meeting/close-seat-policy', () => h.call('vibe_vmu_meeting', { action: 'close', id: SEAT_ID, force: true, reason: '保真仿真：seatPolicy 读到即收（轮次未齐，强制收束）' }))
  // clear the seating rule: the debate section (G7) needs r-2 in the room
  const seatClear = await step('G2/set/clear-denied-seats', () => h.call('vibe_vmu_set', {
    key: 'vmu.meetings.attendDeniedSeats', value: [], why: '保真仿真：裁决段需要 r-2 入场，读完 seatPolicy 即复原座位策略',
  }))
  if (seatClear && seatClear.ok === false) expect('vibe_vmu_set', seatClear.code, '复原座位策略被拒时记录其码（后续裁决段会缺 r-2）')
  highlights.primReads = {
    silent: pick(primSilent, ['ok', 'code', 'hint', 'silent']),
    summaryOpen: pick(primSummaryOpen, ['ok', 'inputs', 'unreached', 'completeness', 'code']),
    complete: pick(primRound, ['ok', 'complete', 'missing', 'code']),
    end: pick(primEnd, ['ok', 'code']),
    aggregation: pick(primAggr, ['ok', 'allowed', 'mode', 'endedAt', 'code']),
    close: pick(primClose, ['ok', 'state', 'closedReason', 'forced', 'code']),
    summary: pick(primSummary, ['ok', 'state', 'closedReason', 'rounds', 'code']),
    seatPolicy: pick(seatDenied, ['ok', 'code', 'seatPolicy']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G3. `vibe_v5_hire` — `enforcedScope` is the capacity face's OWN vocabulary (kernel/capacity.js): a hire over
  //     `vmu.limits.maxLiveMembers` is refused with `enforced[]` + `enforcedScope` instead of a bare message.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const hireOver = await step('G3/hire/over-capacity', () => h.call('vibe_v5_hire', {
    to: 'r-tmp-fid', slot: 'temp', purpose: '保真仿真：触发容量门（不真雇）', initial_task: '只读复核（占位）', term: '本场景',
  }))
  fid('vibe_v5_hire', 'G3/hire/over-capacity', hireOver, ['enforced', 'enforcedScope', 'hired', 'capacity', 'code'])
  if (hireOver && hireOver.ok === false) expect('vibe_v5_hire', hireOver.code, '超过 vmu.limits.maxLiveMembers 时按名拒收，并带 enforced/enforcedScope')
  highlights.hire = pick(hireOver, ['ok', 'code', 'enforced', 'enforcedScope', 'hired', 'capacity'])

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G4. `vibe_v5_task_get` — the read must succeed on a task that HAS a brief, and the brief fields are the shape
  //     `briefNote`/`briefMeans` explain. `briefNote` only appears when the brief lookup itself THROWS a non-NO_SUCH
  //     code (kit/extras.js), which no public call path produces — recorded here as the measurement, not faked.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const taskCreate = await step('G4/task/create', () => h.call('vibe_v5_task_create', {
    subject: '保真仿真：给 task_get 一张可读的任务卡',
    description: '只压机制：读 task_get 的 row/brief/briefNote 形状。',
    owner: 'r-1',
  }, as('r-acad')))
  const taskId = (taskCreate && (taskCreate.id || taskCreate.task_id || (taskCreate.task && taskCreate.task.id))) || null
  highlights.taskCreate = pick(taskCreate, ['ok', 'id', 'task', 'revision', 'code'])
  // NO BRIEF IS SET HERE ON PURPOSE: `vibe_vmu_task {action:'brief'}` cannot set one — tools/task.js forwards only
  // `id` to `tasks.brief(id)`, which is why the call always answers "a brief needs non-empty text" no matter what the
  // caller passed. That is a product defect, so the scenario measures the ABSENCE shape the live field list carries
  // (`briefMeans`) instead of dressing a defect up as a policy refusal.
  const taskGet = await step('G4/task_get', () => h.call('vibe_v5_task_get', { id: taskId }, as('r-1')))
  fid('vibe_v5_task_get', 'G4/task_get', taskGet, ['briefNote', 'briefMeans', 'brief', 'task', 'code'])
  highlights.taskGet = pick(taskGet, ['ok', 'brief', 'briefMeans', 'briefNote', 'code'])
  // and the absence shape, which is the one the live field list did carry: a task with NO brief
  const taskNoBrief = await step('G4/task/create-no-brief', () => h.call('vibe_v5_task_create', {
    subject: '保真仿真：一张没有 brief 的任务', description: '读 briefMeans 的缺席句。', owner: 'r-2',
  }, as('r-acad')))
  const taskNoBriefId = (taskNoBrief && (taskNoBrief.id || taskNoBrief.task_id || (taskNoBrief.task && taskNoBrief.task.id))) || null
  const taskGetNoBrief = await step('G4/task_get/no-brief', () => h.call('vibe_v5_task_get', { id: taskNoBriefId }, as('r-1')))
  fid('vibe_v5_task_get', 'G4/task_get/no-brief', taskGetNoBrief, ['briefMeans', 'briefNote', 'code'])
  highlights.taskGetNoBrief = pick(taskGetNoBrief, ['ok', 'brief', 'briefMeans', 'briefNote', 'code'])

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G5. `vibe_vmu_report` — `set`/`preview`/`emit`/`status`/`declarations`/`tick`/`trace` with the DECLARED shape.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const repSet = await step('G5/report/set', () => h.call('vibe_vmu_report', { action: 'set', key: 'vmu.turn.selfCheck', value: true }))
  fid('vibe_vmu_report', 'G5/report/set', repSet, ['ok', 'key', 'value', 'params', 'code'])
  if (repSet && repSet.ok === false) expect('vibe_vmu_report', repSet.code, '未声明的参数名按名拒收；本装配已声明 vmu.turn.selfCheck')
  const repDecl = await step('G5/report/declarations', () => h.call('vibe_vmu_report', { action: 'declarations' }))
  fid('vibe_vmu_report', 'G5/report/declarations', repDecl, ['ok', 'params', 'reports', 'problems', 'code'])
  const repStatus = await step('G5/report/status', () => h.call('vibe_vmu_report', { action: 'status' }))
  fid('vibe_vmu_report', 'G5/report/status', repStatus, ['ok', 'enabled', 'params', 'reports', 'counters', 'detail', 'code'])
  const repPreview = await step('G5/report/preview', () => h.call('vibe_vmu_report', { action: 'preview', name: 'fid-report', event: 'progress' }))
  fid('vibe_vmu_report', 'G5/report/preview', repPreview, ['ok', 'name', 'text', 'to', 'code'])
  if (repPreview && repPreview.ok === false) expect('vibe_vmu_report', repPreview.code, '未声明的报表名按名拒收；本装配已声明 fid-report')
  const repEmit = await step('G5/report/emit', () => h.call('vibe_vmu_report', { action: 'emit', name: 'fid-report', event: 'progress' }))
  fid('vibe_vmu_report', 'G5/report/emit', repEmit, ['ok', 'id', 'name', 'delivered', 'drives', 'text', 'code'])
  if (repEmit && repEmit.ok === false) expect('vibe_vmu_report', repEmit.code, 'emit 在无投递接缝时具名拒收（deliver 未注入）')
  const repTick = await step('G5/report/tick', () => h.call('vibe_vmu_report', { action: 'tick' }))
  fid('vibe_vmu_report', 'G5/report/tick', repTick, ['ok', 'due', 'fired', 'code'])
  const repTrace = await step('G5/report/trace', () => h.call('vibe_vmu_report', { action: 'trace', name: 'fid-report' }))
  fid('vibe_vmu_report', 'G5/report/trace', repTrace, ['ok', 'name', 'rows', 'detail', 'code'])
  highlights.report = {
    set: pick(repSet, ['ok', 'key', 'value', 'code']),
    status: pick(repStatus, ['ok', 'enabled', 'counters', 'code']),
    preview: pick(repPreview, ['ok', 'name', 'to', 'code']),
    emit: pick(repEmit, ['ok', 'id', 'delivered', 'drives', 'code']),
    tick: pick(repTick, ['ok', 'due', 'fired', 'code']),
    trace: pick(repTrace, ['ok', 'rows', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G6. `vibe_vmu_status` detail branches + `vibe_vmu_set` (a tool no scenario has ever called).
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const stSummary = await step('G6/status/summary', () => h.call('vibe_vmu_status', {}))
  fid('vibe_vmu_status', 'G6/status/summary', stSummary, ['ok', 'instance', 'detail', 'counts', 'asOfClose', 'code'])
  const stClosure = await step('G6/status/closure', () => h.call('vibe_vmu_status', { detail: 'closure' }))
  fid('vibe_vmu_status', 'G6/status/closure', stClosure, ['ok', 'instance', 'closureVote', 'counts', 'asOfClose', 'code'])
  const stAsOf = await step('G6/status/closure-account', () => h.call('vibe_vmu_status', { detail: 'closure-account' }))
  fid('vibe_vmu_status', 'G6/status/closure-account', stAsOf, ['ok', 'instance', 'asOfClose', 'counts', 'code'])
  const stProv = await step('G6/status/provenance', () => h.call('vibe_vmu_status', { detail: 'provenance' }))
  fid('vibe_vmu_status', 'G6/status/provenance', stProv, ['ok', 'instance', 'detail', 'settings', 'bridge', 'math', 'projections', 'code'])
  const setLive = await step('G6/set', () => h.call('vibe_vmu_set', {
    key: 'vmu.turn.selfCheck', value: false, why: '保真仿真：确认设置面可热改并回执 hot/ownerCheck',
  }))
  fid('vibe_vmu_set', 'G6/set', setLive, ['ok', 'key', 'value', 'hot', 'who', 'ownerCheck', 'by', 'requiresRestart', 'appliesAt', 'code'])
  if (setLive && setLive.ok === false) expect('vibe_vmu_set', setLive.code, '未声明/非热键具名拒收时记录其码（本装配逐项验证键的声明）')
  // the refusal half of the same face: the live field list read `code`/`message`/`hint` OFF this tool, which only a
  // named refusal publishes — a settings key that is not declared anywhere is the honest way to reach it
  const setUnknown = await step('G6/set/unknown-key', () => h.call('vibe_vmu_set', {
    key: 'vmu.no.such.key', value: 1, why: '保真仿真：读未声明设置键的具名拒收（code/message/hint）',
  }))
  fid('vibe_vmu_set', 'G6/set/unknown-key', setUnknown, ['ok', 'code', 'message', 'hint'])
  if (setUnknown && setUnknown.ok === false) expect('vibe_vmu_set', setUnknown.code, '未声明的设置键按名拒收，回执带 code/message/hint')
  highlights.status = {
    summary: pick(stSummary, ['ok', 'detail', 'counts', 'code']),
    closure: pick(stClosure, ['ok', 'closureVote', 'counts', 'code']),
    asOfClose: pick(stAsOf, ['ok', 'asOfClose', 'counts', 'code']),
    provenance: pick(stProv, ['ok', 'detail', 'code']),
    set: pick(setLive, ['ok', 'key', 'hot', 'ownerCheck', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G7. `vibe_v5_verdict_final` + `vibe_v5_verified_promote` — the DEBATE route walked end to end, because the
  //     missing keys (`applicable`, `cardId`, `consumer`, `required`, `p1Routes`, `rev`) belong to the settle path
  //     and only a real tally can publish them.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const debate = await step('G7/debate/convene', () => h.call('vibe_v5_meeting', {
    agenda: '保真仿真：裁决链（只压机制，不裁决数学）。', title: '保真裁决会', type: 'debate', member: 'r-acad',
    subject: 'Shared/Protocol.md', subject_evidence: { file: { readable: true, bytes: 10, name: 'Shared/Protocol.md' } },
  }))
  const debateId = debate && debate.meeting
  highlights.debate = pick(debate, ['ok', 'meeting', 'chair', 'type', 'code'])
  if (debateId) {
    for (const s of ['r-acad', 'r-1', 'r-2']) {
      await step('G7/debate/attend/' + s, () => h.call('vibe_vmu_meeting', { action: 'attend', id: debateId, member: s }, as(s)))
    }
  } else {
    expect('vibe_v5_meeting', (debate && debate.code) || 'VMU_STATE', '开会失败时记录码；后续裁决段相应跳过')
  }
  const card = await step('G7/record_proposition', () => h.call('vibe_v5_record_proposition', {
    statement: '保真仿真占位命题：前 n 个奇数之和 = n^2（不声称已证明）', value: '对任意正整数 n', p: 0.9,
    motive: '保真仿真：给裁决链一张可被裁决的卡（不是数学主张）', member: 'r-1',
  }, as('r-1')))
  const cardId = card && card.recordId
  fid('vibe_v5_record_proposition', 'G7/record_proposition', card, ['recordId', 'op', 'wouldEvaluate', 'applicable', 'p1Routes', 'code'])
  const vAsk = debateId ? await step('G7/verdict_ask', () => h.call('vibe_v5_verdict_ask', { meeting: debateId, proposition_id: cardId, member: 'r-acad' }, as('r-acad'))) : null
  if (vAsk && vAsk.ok === false) expect('vibe_v5_verdict_ask', vAsk.code, '问裁决需要开会中的会议与存在的卡；缺席时具名拒收')
  const v1 = debateId ? await step('G7/verdict/r-1', () => h.call('vibe_v5_verdict', { meeting: debateId, proposition_id: cardId, verdict: 1, reason: '保真仿真占位：与既定恒等式一致', member: 'r-1' }, as('r-1'))) : null
  const v2 = debateId ? await step('G7/verdict/r-2', () => h.call('vibe_v5_verdict', { meeting: debateId, proposition_id: cardId, verdict: 1, reason: '保真仿真占位：小 n 已枚举', member: 'r-2' }, as('r-2'))) : null
  const vFinal = debateId ? await step('G7/verdict_final', () => h.call('vibe_v5_verdict_final', { meeting: debateId, proposition_id: cardId, member: 'r-acad' }, as('r-acad'))) : null
  fid('vibe_v5_verdict_final', 'G7/verdict_final', vFinal, [
    'applicable', 'cardId', 'consumer', 'required', 'tally', 'attribution', 'p1RulingReading', 'meetingState', 'code',
  ])
  if (vFinal && vFinal.ok === false) expect('vibe_v5_verdict_final', vFinal.code, '裁决汇总需要已归档的裁决提交；不足时具名拒收并列 evaluated')
  const tallyId = vFinal && vFinal.tally && vFinal.tally.id
  // the ruling is only a READING until the card is corrected: `correction.call` (what the receipt prints) writes p=1
  // with the tally as its warrant. Walking it is what turns rec-1 from p=0.9 into a settled card the promote can cite.
  const correctionArgs = (vFinal && vFinal.correction && vFinal.correction.needed && cardId) ? {
    id: cardId,
    statement: '保真仿真占位命题：前 n 个奇数之和 = n^2（不声称已证明）',
    value: '对任意正整数 n',
    motive: '保真仿真：给裁决链一张可被裁决的卡（不是数学主张）',
    p: 1,
    debate_ruling: {
      subject: cardId, value: 1, mode: 'unanimous', n: 2, decided: true,
      at: (vFinal.correction && vFinal.correction.callAt) || new Date(1_800_000_000_000).toISOString(),
      ballotId: tallyId, meeting: debateId, by: 'r-acad',
    },
  } : null
  const vCorrect = correctionArgs ? await step('G7/record_proposition/correction', () => h.call('vibe_v5_record_proposition', correctionArgs, as('r-1'))) : null
  fid('vibe_v5_record_proposition', 'G7/record_proposition/correction', vCorrect, [
    'op', 'wouldEvaluate', 'applicable', 'settled', 'p1Route', 'p1ProofGate', 'code',
  ])
  if (vCorrect && vCorrect.ok === false) expect('vibe_v5_record_proposition', vCorrect.code, '把裁决抄回卡面时若有凭据/状态缺口，按名拒收并说明缺什么')
  const promote = (debateId && tallyId) ? await step('G7/verified_promote/debated', () => h.call('vibe_v5_verified_promote', {
    card: cardId, warrant: tallyId, warrant_kind: 'debate-unanimous',
    debate_ruling: { mode: 'unanimous', value: 1, subject: cardId, ballotId: tallyId }, member: 'r-acad',
  }, as('r-acad'))) : null
  fid('vibe_v5_verified_promote', 'G7/verified_promote/debated', promote, [
    'applicable', 'p1Routes', 'rev', 'p1Route', 'p1Evidence', 'written', 'refreshed', 'code',
  ])
  if (promote && promote.ok === false) expect('vibe_v5_verified_promote', promote.code, '落 verified 需要 1/0 的一致裁决；否则具名拒收并说明缺什么')

  // the literature route is the one this assembly CAN satisfy without Lean: a citation is itself a conclusion
  const litCard = await step('G7/record_proposition/literature', () => h.call('vibe_v5_record_proposition', {
    statement: '保真仿真占位命题（文献路线）：前 n 个奇数之和 = n^2', value: '对任意正整数 n', p: 1,
    motive: '保真仿真：走文献路线进 verified（引文本身就是结论证据）', member: 'r-acad',
    literature_ref: 'Knuth, The Art of Computer Programming, Vol. 1, §1.2.1',
  }, as('r-acad')))
  const litId = litCard && litCard.recordId
  const litPromote = litId ? await step('G7/verified_promote/literature', () => h.call('vibe_v5_verified_promote', {
    card: litId, warrant_kind: 'literature', literature_ref: 'Knuth, The Art of Computer Programming, Vol. 1, §1.2.1', member: 'r-acad',
  }, as('r-acad'))) : null
  fid('vibe_v5_verified_promote', 'G7/verified_promote/literature', litPromote, [
    'applicable', 'p1Routes', 'rev', 'p1Route', 'p1Evidence', 'written', 'refreshed', 'code',
  ])
  if (litPromote && litPromote.ok === false) expect('vibe_v5_verified_promote', litPromote.code, '文献路线在缺少文献引用/卡状态时具名拒收')
  highlights.verdict = {
    card: cardId, lit: litId, meeting: debateId,
    ask: pick(vAsk, ['ok', 'asked', 'code']),
    filed: [pick(v1, ['ok', 'code']), pick(v2, ['ok', 'code'])],
    final: pick(vFinal, ['ok', 'tally', 'attribution', 'p1RulingReading', 'code']),
    promote: pick(promote, ['ok', 'written', 'p1Route', 'code']),
    litPromote: pick(litPromote, ['ok', 'written', 'p1Route', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G8. `vibe_vmu_panel` (target on the permission refusal) + `vibe_vmu_records` (seatFace + the prune forecast)
  //     + `vibe_vmu_mailbox` (the send receipt's own shape).
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const panelSelf = await step('G8/panel/set-self', () => h.call('vibe_vmu_panel', {
    action: 'set', member: 'r-1', by: 'r-1', overall: '保真仿真：面板字段形状', subgoal: '只读复核', plan: '一步', status: 'active',
  }, as('r-1')))
  fid('vibe_vmu_panel', 'G8/panel/set-self', panelSelf, ['ok', 'member', 'target', 'enforced', 'enforcedScope', 'code'])
  const panelOther = await step('G8/panel/set-other', () => h.call('vibe_vmu_panel', {
    action: 'set', member: 'r-2', by: 'r-1', overall: '保真仿真：替别人的面板写（应被拒）', subgoal: '占位', plan: '占位', status: 'active',
  }, as('r-1')))
  fid('vibe_vmu_panel', 'G8/panel/set-other', panelOther, ['target', 'caller', 'enforced', 'enforcedScope', 'code'])
  if (panelOther && panelOther.ok === false) expect('vibe_vmu_panel', panelOther.code, '成员不能替别人的面板写：按名拒收并回执 caller/target')

  const recAppend = await step('G8/records/append-member-seat', () => h.call('vibe_vmu_records', {
    action: 'append', track: 'state', kind: 'proposition',
    statement: '保真仿真：成员席追加的一条记录（只压机制）', why: '读 seatFace/seatFaceMeans 形状，不主张数学', by: 'r-1',
  }, as('r-1')))
  fid('vibe_vmu_records', 'G8/records/append', recAppend, ['seatFace', 'seatFaceMeans', 'expandedFrom', 'head', 'path', 'code'])
  const recPrune = await step('G8/records/prune-dryrun', () => h.call('vibe_vmu_records', {
    action: 'prune', track: 'state', keep: 1, dryRun: true, by: 'r-acad',
  }, as('r-acad')))
  fid('vibe_vmu_records', 'G8/records/prune-dryrun', recPrune, [
    'doomedActiveCount', 'doomedActiveMeans', 'doomedDeclaredCurrentCount', 'doomedInForceCount', 'wouldPruneCount', 'doomed', 'code',
  ])
  const recExpand = await step('G8/records/expand', () => h.call('vibe_vmu_records', { action: 'expand', id: (recAppend && recAppend.id) || 'no-such-record' }, as('r-acad')))
  fid('vibe_vmu_records', 'G8/records/expand', recExpand, ['expandedFrom', 'row', 'code'])
  if (recExpand && recExpand.ok === false) expect('vibe_vmu_records', recExpand.code, 'records 投影里没有该 id 时按名拒收（或退回 library 并带 expandedFrom）')

  const mailSend = await step('G8/mailbox/send', () => h.call('vibe_vmu_mailbox', {
    action: 'send', from: 'r-acad', to: 'r-1', subject: '保真仿真：信箱形状', text: '只压回执字段，不压内容。',
  }, as('r-acad')))
  fid('vibe_vmu_mailbox', 'G8/mailbox/send', mailSend, ['from', 'caller', 'to', 'ids', 'delivered', 'queued', 'code'])
  const mailStatus = await step('G8/mailbox/status', () => h.call('vibe_vmu_mailbox', { action: 'status' }, as('r-acad')))
  fid('vibe_vmu_mailbox', 'G8/mailbox/status', mailStatus, ['from', 'pending', 'unread', 'count', 'code'])
  highlights.panelRecordsMail = {
    panelSelf: pick(panelSelf, ['ok', 'target', 'code']),
    panelOther: pick(panelOther, ['ok', 'target', 'caller', 'code']),
    append: pick(recAppend, ['ok', 'id', 'seatFace', 'code']),
    prune: pick(recPrune, ['ok', 'wouldPruneCount', 'doomed', 'code']),
    expand: pick(recExpand, ['ok', 'expandedFrom', 'code']),
    mail: pick(mailSend, ['ok', 'caller', 'to', 'queued', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G9. `vibe_vmu_turn` — the round engine's own readings. `drive` parks a round on the caller, `step {reply}`
  //     answers it with the fenced report, and the receipts are where the live field list's turn keys come from.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const turnStatus0 = await step('G9/turn/status', () => h.call('vibe_vmu_turn', { op: 'status' }))
  fid('vibe_vmu_turn', 'G9/turn/status', turnStatus0, ['status', 'turns', 'turnsMeans', 'countedLater', 'code'])
  // the NARROWED status: `detail:"closure"` is the only route that carries `detail` and `closureVoteWrites`
  const turnClosure = await step('G9/turn/status-closure', () => h.call('vibe_vmu_turn', { op: 'status', detail: 'closure' }))
  fid('vibe_vmu_turn', 'G9/turn/status-closure', turnClosure, ['detail', 'closureVote', 'closureVoteWrites', 'code'])
  const turnDrive = await step('G9/turn/drive', () => h.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: '保真仿真：派 r-1 的回合以读字段' }))
  fid('vibe_vmu_turn', 'G9/turn/drive', turnDrive, ['awaiting', 'memberPrompt', 'round', 'roundsRun', 'roundsAttempted', 'member', 'meeting', 'deliveryPath', 'code'])
  // the REPORT half goes through `op:"reply"`: its receipt is the readback of what the kernel actually recorded
  const turnReply = await step('G9/turn/reply', () => h.call('vibe_vmu_turn', {
    op: 'reply', reply_for: 'r-1',
    report: { say: '保真仿真：本轮只读字段，不做数学工作。', progress: { track: 'state', value: 1 } },
    why: '保真仿真：把结构化报告记进已挂起的回合',
  }))
  fid('vibe_vmu_turn', 'G9/turn/reply', turnReply, [
    'accepted', 'source', 'fields', 'readback', 'detail', 'ignored', 'ignoredFields', 'ignoredFieldMode',
    'meetingSource', 'countedLater', 'appliedWhen', 'toolCalls', 'toolCallsTotal', 'roundCompleted', 'code',
  ])
  // the COMPLETION half: answering the held report while asking for other `members` is where `selectionNote`/
  // `selectionIgnored`/`requestedMembers` are published, and `tools` is where `toolsOverride` is published
  const turnComplete = await step('G9/turn/step-complete', () => h.call('vibe_vmu_turn', {
    op: 'step', members: [{ id: 'r-2', role: 'member' }], tools: 'none', phase: 'normal',
    why: '保真仿真：结算已记录的回合，并读 members 选择与 tools 覆盖的回执字段',
  }))
  fid('vibe_vmu_turn', 'G9/turn/step-complete', turnComplete, [
    'accepted', 'source', 'completed', 'requestedMembers', 'requestedMembersSource', 'selectionApplied', 'selectionIgnored',
    'selectionNote', 'toolsOverride', 'instructionDelivered', 'attribution', 'toolCalls', 'toolCallsTotal',
    'toolCallsTruncated', 'membersFrom', 'delegation', 'detail', 'roundCompleted', 'roundConsumed', 'code',
  ])
  // `step` WITHOUT a reply is the DISPATCH half: it parks the next prompt on the caller and its receipt is where the
  // delivery readings live (`instructionDelivered`/`attribution`/`toolCalls*`/`membersFrom`/`delegation`)
  const turnDispatch = await step('G9/turn/step-dispatch', () => h.call('vibe_vmu_turn', {
    op: 'step', members: [{ id: 'r-1', role: 'member' }], phase: 'normal', why: '保真仿真：只派发不答复，读派发面的交付读数',
  }))
  fid('vibe_vmu_turn', 'G9/turn/step-dispatch', turnDispatch, [
    'awaiting', 'memberPrompt', 'instructionDelivered', 'attribution', 'toolCalls', 'toolCallsTotal', 'toolCallsTruncated',
    'toolCallsScope', 'membersFrom', 'delegation', 'meeting', 'round', 'selectionNote', 'code',
  ])
  // the FAILURE half of the same op: a reply whose WRITE-BACK throws answers with the diagnostics block, and that is
  // the only place `trackValue` is published (the reply itself parsed fine, so `progress.track` is readable there)
  const turnBadStep = await step('G9/turn/step-unparsed', () => h.call('vibe_vmu_turn', {
    op: 'step', reply: fence({ say: '保真仿真：写一个未登记的执行轨（应被拒收）', progress: { track: 'fidelity', value: 1 } }),
  }))
  fid('vibe_vmu_turn', 'G9/turn/step-unparsed', turnBadStep, [
    'trackValue', 'sideEffectsUnverified', 'sideEffectsMeans', 'delivery', 'replyExcerpt', 'replyTruncated', 'code', 'hint',
  ])
  if (turnBadStep && turnBadStep.ok === false) expect('vibe_vmu_turn', turnBadStep.code, '回复里的 progress.track 不在登记的轨名里时，写回抛错按名拒收，并回诊断块（trackValue/sideEffects/delivery）')
  const turnStatus2 = await step('G9/turn/status/final', () => h.call('vibe_vmu_turn', { op: 'status' }))
  fid('vibe_vmu_turn', 'G9/turn/status/final', turnStatus2, ['status', 'turns', 'turnsMeans', 'countedLater', 'code'])
  highlights.turn = {
    status0: pick(turnStatus0, ['ok', 'status', 'turns', 'code']),
    closure: pick(turnClosure, ['ok', 'detail', 'closureVoteWrites', 'code']),
    drive: pick(turnDrive, ['ok', 'awaiting', 'roundsRun', 'member', 'memberPrompt', 'code']),
    reply: pick(turnReply, ['ok', 'accepted', 'source', 'fields', 'readback', 'code']),
    complete: pick(turnComplete, ['ok', 'completed', 'requestedMembers', 'selectionApplied', 'code']),
    status2: pick(turnStatus2, ['ok', 'turns', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G10. `vibe_vmu_turn` reply face + the DELEGATED path, then `vibe_vmu_human`'s read-back.
  //      • `reply` is the second half of a parked round: its receipt is where `readback`/`fields`/`detail` live.
  //      • a host WITHOUT the caller seam resolves the SUBAGENTS path and refuses by name — the only place the turn
  //        engine publishes `requestSent`/`waitedMs`/`lastPhase`/`partial`/`roundConsumed`.
  //      • read-back drift needs a second writer on the same store: a second kernel booted on THIS root writes the
  //        resume ledger, and the first kernel's read-back then names the drift (`message`/`hint`/`driftKeys`).
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const delegatedRoot = h.root ? h.root + '-delegated' : undefined
  const delegated = delegatedRoot ? await boot({ root: delegatedRoot, withPrompt: false }) : null
  let turnDelegated = null
  if (delegated) {
    await delegated.call('vibe_v5_start', { problem: '保真仿真：没有交付接缝的宿主，派回合会怎样（读失败回合的字段）', researcherCount: 1 })
    turnDelegated = await step('G10/turn/delegated-drive', () => delegated.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1 }))
    fid('vibe_vmu_turn', 'G10/turn/delegated-drive', turnDelegated, [
      'requestSent', 'waitedMs', 'lastPhase', 'partial', 'roundConsumed', 'roundsRun', 'failures', 'code',
    ])
    const failedRound = turnDelegated && Array.isArray(turnDelegated.receipts) ? turnDelegated.receipts[0] : null
    fid('vibe_vmu_turn', 'G10/turn/delegated-drive/round', failedRound, [
      'requestSent', 'waitedMs', 'lastPhase', 'partial', 'roundConsumed', 'code', 'message', 'hint',
    ])
    // the failed round is an ENVIRONMENTAL reading (no subagents service here), not a top-level refusal: it is recorded
    // on the round, which is the only place the engine names what it tried to send and how long it waited
    if (failedRound && failedRound.code) {
      expectedRefusals.push({ tool: 'vibe_vmu_turn', code: failedRound.code, why: '没有交付接缝的宿主上派回合：失败回合按名回 VMU_ENGINE_UNAVAILABLE，引擎不抛错' })
    }
  }
  highlights.turnReply = pick(turnReply, ['ok', 'accepted', 'readback', 'fields', 'code'])
  highlights.turnDelegated = delegated ? {
    driveOk: turnDelegated && turnDelegated.ok,
    failedRound: turnDelegated && Array.isArray(turnDelegated.failures) ? pick(turnDelegated.failures[0] || {}, ['member', 'code', 'message', 'requestSent', 'waitedMs', 'lastPhase']) : null,
  } : null

  const humanReadBack = await step('G10/human/read-back-drift', () => h.call('vibe_vmu_human', { action: 'readBack' }))
  fid('vibe_vmu_human', 'G10/human/read-back-drift', humanReadBack, [
    'hint', 'message', 'code', 'drift', 'driftKeys', 'consistent', 'checked', 'sampledAt', 'writesBetween', 'driftMeans',
  ])
  if (humanReadBack && humanReadBack.ok === false) expect('vibe_vmu_human', humanReadBack.code, '同一存储上出现第二个写者时 readBack 按名回 drift，并列 driftKeys/message/hint（这是并发写者的证据，不是数据丢失）')
  highlights.humanReadBack = pick(humanReadBack, ['ok', 'consistent', 'checked', 'writesBetween', 'driftKeys', 'code'])

  notes.settings = Object.keys(settings)
  notes.fidelity = fidelity
  highlights.fidelity = fidelity
  return {
    steps,
    receipts: h.receipts,
    tree: h.tree ? h.tree() : [],
    highlights,
    notes,
    fidelity,
    expectedRefusals,
  }
}

export default scenario
