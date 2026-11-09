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
  const failures = []
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

  // TB-2643: a coverage debt is closed by WALKING THE REAL PATH, not by declaring an exemption. `fid` above stays a
  // soft measurement (it records absence for the report); `requireFields` is the HARD half: a live field that the
  // harvested receipts carry but this receipt does not is a coverage failure, so the scenario returns a non-empty
  // `failures` and run.mjs goes red. That difference matters: without it, deleting a step would silently turn the
  // measurement into "0 missing, because 0 measured".
  const requireFields = (stepName, out, keys, means) => {
    const missing = (out && typeof out === 'object') ? keys.filter((k) => !Object.prototype.hasOwnProperty.call(out, k)) : keys.slice()
    if (missing.length > 0) {
      failures.push({
        code: 'SIM_FIDELITY_FIELD_MISSING',
        step: stepName,
        missing,
        receiptCode: (out && out.code) || null,
        message: 'this receipt does not carry ' + missing.join(', ') + ' - the live runs read it, so the real path that publishes it must have been skipped or refused',
        means: means,
      })
    }
    return missing
  }


  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G1. THE INSTITUTE — the seats every later section acts through
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const started = await step('G1/institute/start', () => h.call('vibe_v5_start', {
    problem: '保真仿真：把真机读过、仿真没产出的字段逐条真调出来（只压机制，不压数学）。',
    researcherCount: 2,
  }))
  highlights.start = pick(started, ['ok', 'institution', 'members', 'roster', 'chair', 'code'])
  // TB-2643 cleanup: this used to declare `vibe_v5_start:VMU_STATE` as an expected refusal, but a second
  // `vibe_v5_start` on the same store is NOT refused - it hires into the existing institute and answers ok:true (probe
  // `D:/_tmp/sim/probe-unfired.mjs`: start2 `{ok:true, hired:…, rosterBefore:…}`, keys carry no `code`). A declaration
  // that can never fire makes the ledger look safer than the engine is, so it is gone rather than pinned.
  notes.secondStartNotRefused = 'a repeated vibe_v5_start is idempotent-for-hiring, not VMU_STATE; no refusal exists to declare'

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G1b. `vibe_vmu_human` — `recover` publishes the `plan`/`recovery` pair (the two keys the live runs read). The
  //     read-back half of the same face is sampled at the very END (G10), because a drift needs a write in between.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const humanRecover = await step('G1b/human/recover', () => h.call('vibe_vmu_human', { action: 'recover', reason: '保真仿真：读 plan/recovery 形状' }))
  fid('vibe_vmu_human', 'G1b/human/recover', humanRecover, ['plan', 'recovery', 'code', 'message', 'hint'])
  if (humanRecover && humanRecover.ok === false) expect('vibe_vmu_human', humanRecover.code, 'recover 未完全成功时按名拒收并列出失败的步骤')
  highlights.humanRecover = pick(humanRecover, ['ok', 'action', 'plan', 'recovery', 'code'])

  // TB-2643 / G13. `vibe_vmu_turn.at` is published ONLY on `op:"abandon"` when there was NOTHING to abandon. This is
  // the one moment in the scenario where that is true: no round has been driven yet, no prompt is parked, and no
  // turn id is passed. It has to run on the MAIN handle - a receipt from a second kernel lives in that kernel's
  // ledger and never reaches this corpus, which is exactly how the field stayed uncovered while looking covered.
  const abandonAt = await step('G13/turn/abandon-at', () => h.call('vibe_vmu_turn', {
    op: 'abandon', why: '保真仿真：此刻没有 in-flight 回合可关，读 at 这一行',
  }))
  fid('vibe_vmu_turn', 'G13/turn/abandon-at', abandonAt, ['abandoned', 'at', 'means'])
  highlights.turnAbandonAt = pick(abandonAt, ['ok', 'abandoned', 'at', 'means', 'code'])

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
  // TB-2637 fixture (#6): the LIVE side expanded a filed RULING card (head.kind=proposition, head.status=ruling),
  // while the step above expands a seat-appended state card (head.status=open). Same action, same comparator
  // branch — the readings differed only by the object's lifecycle, which the args cannot show. Re-expand the card
  // the debate's own verdict filed (G7/verdict/r-1 → `ruling-<meeting>-<card>-r-1`) so both sides read a ruling.
  const rulingId = (v1 && v1.submission && v1.submission.id) || null
  const recExpandRuling = await step('G8/records/expand-ruling', () => h.call('vibe_vmu_records', {
    action: 'expand', id: rulingId || 'no-such-ruling',
  }, as('r-acad')))
  fid('vibe_vmu_records', 'G8/records/expand-ruling', recExpandRuling, ['expandedFrom', 'head', 'row', 'code'])
  if (recExpandRuling && recExpandRuling.ok === false) expect('vibe_vmu_records', recExpandRuling.code, '裁决卡在库中应可 expand；拒收时必须具名（expandedFrom/code）')
  // hard fixture check: the step must have produced the live reading (head.status=ruling), not merely been called
  if (recExpandRuling && recExpandRuling.ok === true) {
    const head = recExpandRuling.head || (recExpandRuling.row && recExpandRuling.row.head)
    const st = head && head.status
    if (st !== 'ruling') throw new Error('G8/records/expand-ruling: expected head.status=ruling (live reading), got ' + JSON.stringify(st))
  }

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
    expandRuling: pick(recExpandRuling, ['ok', 'row', 'code']),
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
  //      • read-back drift does NOT require a second writer: the delegated kernel boots on `h.root + "-delegated"`
  //        (its own store), yet the MAIN kernel's read-back still names a `meetings` drift (expected `411f4dd9:54224`
  //        vs actual `a7ee8aae:54347`, `writesBetween:44`). A minimal probe (boot -> start -> convene -> attend ->
  //        readBack, `D:/_tmp/sim/probe-drift2.mjs`) does not reproduce it, so the expectation refresh misses one late
  //        write path. That is a PRODUCT reading, tracked as TB-2647 for state-lane; this scenario only records the
  //        drift it sees (and asserts the drift receipt carries no `failedSteps` - see G14's note below).
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
    // TB-2643 cleanup: this used to declare `vibe_vmu_turn:VMU_ENGINE_UNAVAILABLE` as an expected refusal. That code
    // is real (probe `D:/_tmp/sim/probe-deleg.mjs`: `drive.failures[0].code === "VMU_ENGINE_UNAVAILABLE"`, message
    // `the host exposes no subagents service at all`), but it lives on the DELEGATED kernel: its ledger holds only
    // `start`+`drive` as ok receipts and the failed round rides inside `drive.receipts[0]`, so no refusal ever reaches
    // THIS corpus. A declaration the ledger can never see is not evidence, so the measurement stays (`fid` below) and
    // the declaration goes.
    notes.delegatedRoundCode = turnDelegated && Array.isArray(turnDelegated.failures)
      ? (turnDelegated.failures[0] || {}).code || null
      : null
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

  // TB-2643 / G14 — TWO DIFFERENT REFUSAL PATHS, and the live corpus keeps them apart (run-lane cross-check,
  // `D:/_tmp/slv-phase5/run75-g11-g14-verify.md`):
  //   (a) `failedSteps` belongs to `vibe_vmu_human {action:"recover"}` when a recovery does NOT succeed. The live
  //       receipts that carry it are `code:"VMU_STATE"` (real-receipts.jsonl:17271 and :17394; real-fields.jsonl:17179
  //       and :17301 render the value `["ledgers","readback"]`).
  //   (b) `VMU_RESUME_READBACK_DRIFT` is the `action:"readBack"` refusal. Those live receipts (real-receipts.jsonl:11161,
  //       :11222, :17273, :17414) carry NO `failedSteps` field at all.
  // An earlier version of this section merged the two: it read `failedSteps` off a recovery triggered by the drift
  // above, which made the coverage number better while covering a path the live runs never take. The split is the
  // point — the drift receipt below is asserted to lack the field, and G14's own recovery (which walks the
  // `VMU_STATE` route) is driven later, after the ledger-poisoning step that makes the ledgers step fail.
  if (humanReadBack && humanReadBack.ok === false && humanReadBack.code === 'VMU_RESUME_READBACK_DRIFT') {
    if (Object.prototype.hasOwnProperty.call(humanReadBack, 'failedSteps')) {
      failures.push({
        code: 'SIM_FIDELITY_PATH_WRONG',
        step: 'G10/human/read-back-drift',
        message: 'the drift refusal carried failedSteps=' + JSON.stringify(humanReadBack.failedSteps) + ' - the live drift receipts do NOT have this field',
        means: 'failedSteps is the recover face s field (VMU_STATE); merging it into the readBack drift path would cover a refusal shape the live runs never produce',
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G11-G14. TB-2643 — the FOUR live fields the 15:00 harvest exposed as coverage debt:
  //     `vibe_v5_record_proposition.p1GateSkipped(-Means)`, `vibe_vmu_meeting.{approver,decidedAtMeans,requests,undecidedRequests}`,
  //     `vibe_vmu_turn.at`, `vibe_vmu_human.failedSteps`. Every one is produced by walking the real path, and every
  //     one is HARD through `requireFields` (a missing field or a skipped path is a failure, never a declaration).
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

  // G11. The p1 EVIDENCE GATE is skipped when a writer rewrites an existing card with the SAME p it already carries;
  //      the receipt says which route was taken (`p1GateSkipped:"p-unchanged"`). Two writes: the card, then the card
  //      again over a different body at the same p. Read `packs/v5r/tools.js` (pUnchanged) — not a fixture.
  const skipCard = await step('G11/record_proposition/p1-gate-skipped', async () => {
    const first = await h.call('vibe_v5_record_proposition', {
      statement: '保真仿真占位：p 闸跳过路径的底卡（不声称已证明）', value: '占位', p: 0.9,
      motive: '保真仿真：先写一张 p=0.9 的卡，给下一次同 p 重写做底', member: 'r-1',
    }, as('r-1'))
    if (!first || !first.recordId) return first
    return h.call('vibe_v5_record_proposition', {
      id: first.recordId,
      statement: '保真仿真占位：p 闸跳过路径的重写（同一个 p，改正文）', value: '占位', p: 0.9,
      motive: '保真仿真：同一个 p 重写旧卡 ⇒ p1 证据闸应报 p-unchanged', member: 'r-1',
    }, as('r-1'))
  })
  fid('vibe_v5_record_proposition', 'G11/record_proposition/p1-gate-skipped', skipCard, ['p1GateSkipped', 'p1GateSkippedMeans'])
  const skipMissing = requireFields('G11/record_proposition/p1-gate-skipped', skipCard, ['p1GateSkipped', 'p1GateSkippedMeans'],
    'the live runs read p1GateSkipped when an existing card is rewritten at the same p; without it a reader cannot tell a skipped gate from a passed one')
  if (skipMissing.length === 0 && skipCard.p1GateSkipped !== 'p-unchanged') {
    failures.push({
      code: 'SIM_FIDELITY_PATH_WRONG',
      step: 'G11/record_proposition/p1-gate-skipped',
      message: 'p1GateSkipped answered ' + String(skipCard.p1GateSkipped) + ' instead of p-unchanged: the second write did not reuse the p the card already carried',
      means: 'the field is present but the path read it wrong, so the simulation would be proving the wrong route',
    })
  }
  highlights.p1GateSkipped = pick(skipCard, ['ok', 'updated', 'rev', 'p1GateSkipped', 'p1GateSkippedMeans', 'code'])

  // G12. LEAVE CONTROLS are SERVICE rails: only a meeting convened through the pack has a leave roster. Ask, list,
  //      approve — `requests`/`undecidedRequests`/`decidedAtMeans`/`approver` are published on that face.
  const leaveMeeting = await step('G12/meeting/convene', () => h.call('vibe_v5_meeting', {
    agenda: '保真仿真：请假与批准面（只压机制）。', title: '保真请假会', type: 'debate', member: 'r-acad',
    subject: 'Shared/Protocol.md', subject_evidence: { file: { readable: true, bytes: 10, name: 'Shared/Protocol.md' } },
  }))
  const leaveId = leaveMeeting && leaveMeeting.meeting
  if (!leaveId) {
    failures.push({
      code: 'SIM_FIDELITY_PATH_MISSING',
      step: 'G12/meeting/convene',
      message: 'the debate meeting did not open (' + String(leaveMeeting && leaveMeeting.code) + '), so the leave face cannot publish requests/undecidedRequests/decidedAtMeans/approver',
      means: 'without a service meeting the whole leave rail is unreachable and its four live fields stay uncovered',
    })
  }
  if (leaveId) {
    for (const s of ['r-acad', 'r-1', 'r-2']) {
      await step('G12/meeting/attend/' + s, () => h.call('vibe_vmu_meeting', { action: 'attend', id: leaveId, member: s }, as(s)))
    }
  }
  const leaveAsk = leaveId ? await step('G12/meeting/leave-request', () => h.call('vibe_vmu_meeting', {
    action: 'leaverequest', id: leaveId, member: 'r-1', reason: '保真仿真：把请假面走一遍（不离开任何人）',
  }, as('r-1'))) : null
  fid('vibe_vmu_meeting', 'G12/meeting/leave-request', leaveAsk, ['approver', 'at'])
  requireFields('G12/meeting/leave-request', leaveAsk, ['approver', 'at'],
    'a leave request names who may decide it (approver) and when it was asked (at); both were read by live runs')
  const leaveList = leaveId ? await step('G12/meeting/leave-requests', () => h.call('vibe_vmu_meeting', {
    action: 'leaverequests', id: leaveId,
  }, as('r-acad'))) : null
  fid('vibe_vmu_meeting', 'G12/meeting/leave-requests', leaveList, ['requests', 'decidedAtMeans', 'undecidedRequests', 'approver'])
  requireFields('G12/meeting/leave-requests', leaveList, ['requests', 'decidedAtMeans', 'undecidedRequests', 'approver'],
    'the undecided list is the only place a reader learns that a request is still open; decidedAtMeans explains the null decidedAt')
  // SIM-ONLY: 真机 0 张 leaveapprove 回执（real-fields.jsonl 全量）——这一步存在的唯一目的是把状态推到「已批准」，
  // 让下面的 LIST 面（真机确有此形状：4 行 approver、requests/decidedAtMeans/undecidedRequests 都在 list 面）
  // 能断言 undecidedRequests===0 且 decidedAt 非空。所以本步的 requireFields 只钉 simulate 自己的决定面，
  // 不算「已覆盖真机路径」；真机侧的证据只有 leaverequests 两张 list 回执。
  const leaveApprove = leaveId ? await step('G12/meeting/leave-approve', () => h.call('vibe_vmu_meeting', {
    action: 'leaveapprove', id: leaveId, member: 'r-1', by: 'r-acad', reason: '保真仿真：批准这次请假请求，让未决计数归零',
  }, as('r-acad'))) : null
  fid('vibe_vmu_meeting', 'G12/meeting/leave-approve', leaveApprove, ['state', 'decidedBy', 'approver'])
  requireFields('G12/meeting/leave-approve', leaveApprove, ['state', 'decidedBy', 'approver'],
    'SIM-ONLY 决定面：the approving receipt names the decision (state/decidedBy) and the person allowed to make it (approver); 真机没有这张回执，这条只钉仿真自己的形状')
  // the DECISION is only visible on the LIST face: read it again to see the pending count go to zero and the row
  // carry the instant it was decided (the list is where `undecidedRequests` and `requests[].decidedAt` are published)
  const leaveListAfter = leaveId ? await step('G12/meeting/leave-requests/after-approve', () => h.call('vibe_vmu_meeting', {
    action: 'leaverequests', id: leaveId,
  }, as('r-acad'))) : null
  fid('vibe_vmu_meeting', 'G12/meeting/leave-requests/after-approve', leaveListAfter, ['requests', 'decidedAtMeans', 'undecidedRequests', 'approver'])
  const afterMissing = requireFields('G12/meeting/leave-requests/after-approve', leaveListAfter, ['requests', 'undecidedRequests', 'decidedAtMeans', 'approver'],
    'the undecided count after a decision is the field a reader uses to know nothing is left open')
  if (afterMissing.length === 0) {
    const row = Array.isArray(leaveListAfter.requests) ? leaveListAfter.requests[0] : null
    if (leaveListAfter.undecidedRequests !== 0 || !row || row.decidedAt === null || row.decidedAt === undefined) {
      failures.push({
        code: 'SIM_FIDELITY_PATH_WRONG',
        step: 'G12/meeting/leave-requests/after-approve',
        message: 'after an approval the list answered undecidedRequests=' + String(leaveListAfter.undecidedRequests) + ' and decidedAt=' + JSON.stringify(row && row.decidedAt),
        means: 'the decision was approved but the read face still shows an open request, or a decided row without its instant',
      })
    }
  }
  highlights.leave = {
    meeting: leaveId || null,
    ask: pick(leaveAsk, ['ok', 'action', 'approver', 'at', 'code']),
    list: pick(leaveList, ['ok', 'undecidedRequests', 'requests', 'code']),
    approve: pick(leaveApprove, ['ok', 'state', 'decidedBy', 'code']),
    listAfter: pick(leaveListAfter, ['ok', 'undecidedRequests', 'code']),
  }

  // G14a — the `VMU_STATE` recovery failure, driven on the MAIN handle (a second kernel's receipt would never reach
  //   the corpus). The ledgers step fails on a durable value that is NOT a projection envelope: a legacy workspace
  //   leaves plain task rows where the kernel expects one, and `hydrate()` refuses that value by name
  //   (`VMU_RESUME_PROJECTION_GAP`; the caller sees "the recovery did not fully succeed: ledgers"). The readback step
  //   fails too, because the drift named above is still on disk. The live receipt for this exact path is
  //   `code:"VMU_STATE"`, `failedSteps:["ledgers","readback"]` (`real-fields.jsonl:17179`/`:17301`,
  //   `real-receipts.jsonl:17271`/`:17394`) - which is why the assertion below names BOTH steps, not just "non-empty".
  const recoverFailed = await step('G14/human/recover-failed-steps', async () => {
    if (h.kernel && h.kernel.store && typeof h.kernel.store.write === 'function') {
      await h.kernel.store.write('tasks', [{ id: 'fid-legacy-1', subject: '保真仿真：旧工作区留下的裸任务行（不是投影信封）', status: 'open' }])
    }
    return h.call('vibe_vmu_human', { action: 'recover', reason: '保真仿真：旧工作区的裸任务行让 ledgers 无法 hydrate，配合上面的漂移读出 failedSteps' })
  })
  if (recoverFailed && recoverFailed.ok === false) expect('vibe_vmu_human', 'VMU_STATE', '恢复不完全成功时按名拒收并列 failedSteps/code/message/hint（真机同形状见 real-receipts.jsonl:17271/:17394）')
  fid('vibe_vmu_human', 'G14/human/recover-failed-steps', recoverFailed, ['code', 'message', 'hint', 'failedSteps'])
  highlights.recoverFailed = pick(recoverFailed, ['ok', 'action', 'code', 'message', 'failedSteps'])

  // G13 / G14 assertions. The two CALLS are driven on the MAIN handle elsewhere in this scenario (G13 right after
  // the institute comes up, G14 after the drift is on disk) so that their receipts are the ones the corpus and the
  // audit read; these lines are the hard half that makes a skipped path red.
  const atMissing = requireFields('G13/turn/abandon-at', abandonAt, ['abandoned', 'at', 'means'],
    'the live runs read at on the nothing-to-abandon branch; it is the only receipt that carries a timestamp for a no-op')
  if (atMissing.length === 0) {
    if (abandonAt.abandoned !== false) {
      failures.push({
        code: 'SIM_FIDELITY_PATH_WRONG', step: 'G13/turn/abandon-at',
        message: 'abandoned answered ' + String(abandonAt.abandoned) + ' instead of false: something WAS closed, so this is not the quiet branch',
        means: 'the timestamp on a real close means something else; the path must be the no-op one',
      })
    }
    if (typeof abandonAt.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(abandonAt.at)) {
      failures.push({
        code: 'SIM_FIDELITY_PATH_WRONG', step: 'G13/turn/abandon-at',
        message: 'at is not an ISO instant: ' + JSON.stringify(abandonAt.at),
        means: 'a reader stamps decisions from this value; a non-ISO stamp cannot be ordered against the transcript',
      })
    }
  }
  const failedMissing = requireFields('G14/human/recover-failed-steps', recoverFailed, ['code', 'message', 'hint', 'failedSteps'],
    'a failing recovery must name the steps that failed; that is the field the live runs read and the only next move a caller gets')
  if (failedMissing.length === 0) {
    if (recoverFailed.code !== 'VMU_STATE') {
      failures.push({
        code: 'SIM_FIDELITY_PATH_WRONG', step: 'G14/human/recover-failed-steps',
        message: 'the recovery refused with code ' + JSON.stringify(recoverFailed.code) + ' instead of VMU_STATE',
        means: 'the live receipts that carry failedSteps are code VMU_STATE; another code would mean this path is a different refusal wearing the same field',
      })
    }
    const named = Array.isArray(recoverFailed.failedSteps) ? recoverFailed.failedSteps : null
    const expectedSteps = ['ledgers', 'readback']
    const missingSteps = named === null
      ? expectedSteps.slice()
      : expectedSteps.filter((s) => named.indexOf(s) === -1)
    if (named === null || named.length === 0 || missingSteps.length > 0) {
      failures.push({
        code: 'SIM_FIDELITY_PATH_WRONG', step: 'G14/human/recover-failed-steps',
        message: 'failedSteps answered ' + JSON.stringify(recoverFailed.failedSteps) + ' - the live value for this path is ["ledgers","readback"] (missing: ' + missingSteps.join(', ') + ')',
        means: 'the ledgers step fails on the legacy durable value and the readback step fails on the drift above; a recovery that names only one of them is not the path the live runs took',
      })
    }
  }
  // the NEGATIVE half: the drift receipt must NOT carry failedSteps (a live drift receipt has no such field), and it
  // must come from `action:"readBack"` - the refusal that names drift is not the recovery that names failed steps
  if (humanReadBack && humanReadBack.code === 'VMU_RESUME_READBACK_DRIFT') {
    const keys = Object.keys(humanReadBack)
    if (keys.includes('failedSteps')) {
      failures.push({
        code: 'SIM_FIDELITY_PATH_WRONG', step: 'G10/human/read-back-drift',
        message: 'the drift refusal carries failedSteps=' + JSON.stringify(humanReadBack.failedSteps),
        means: 'the live drift receipts (real-receipts.jsonl:11161/:11222/:17273/:17414) have no failedSteps; that field is the recover face s, published only with code VMU_STATE',
      })
    }
    if (humanReadBack.action !== 'readBack') {
      failures.push({
        code: 'SIM_FIDELITY_PATH_WRONG', step: 'G10/human/read-back-drift',
        message: 'the drift refusal came from action ' + JSON.stringify(humanReadBack.action) + ' instead of readBack',
        means: 'VMU_RESUME_READBACK_DRIFT is the readBack face refusal in the live corpus; recover is the face that publishes failedSteps',
      })
    }
    notes.driftReceiptKeys = keys.slice().sort()
  }

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
    failures,
  }
}

export default scenario
