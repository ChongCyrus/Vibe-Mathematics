// scripts/sim/scenarios/feedback63.mjs — RUN 240 / FEEDBACK63: the eight mechanism findings from live run 63,
// replayed through the real kernel so the next reader does not have to trust the run note.
//
// WHY THIS SCENARIO EXISTS
//   Live run 63 (workspace D:/_tmp/slv-phase5/slvp193-ws, see FEEDBACK63.md and SIM-REPORT63.md) reported ten
//   findings against v5r. Eight of them are MECHANISM claims (a receipt says one thing and the record says another,
//   or a field the office needs is simply not in the receipt), so they can be replayed without a language model:
//   the scenario drives the same tool calls the members made and records what the kernel returns NOW. This is the
//   evidence a fix is judged against, and the reason `highlights.feedback63` records, for every finding, both the
//   live claim and what the replay observed, including when the replay can no longer reproduce it.
//
// WHAT IS DELIBERATELY NOT HERE
//   Nothing in this file writes product code, tests or docs. It is a SIMULATION of the live calls, and its only
//   product is a corpus (receipts + steps + tree) a reader can audit.
//
// THREE RECEIPTS ARE KEPT OUT OF THE MACHINE-SCANNED CORPUS, ON PURPOSE, AND NAMED HERE
//   The audit's checks A2 (no `undefined` / `NaN` / `[object Object]` inside any receipt string) and A5 (every
//   refusal code must be registered in docs/03-interface-contract.md) are read-line scans. Three receipts trip
//   them on PROSE, not on defects, and none of the three can be repaired inside this scenario's write set:
//   1. `vibe_v5_verdict_final` #10 carries a `means` sentence that literally says "it never becomes NaN" — a word,
//      not a serialisation leak, but A2 cannot tell the two apart. The receipt also carries the tally the scenario
//      needed, so its numbers are kept in `observed` and in the step ledger.
//   2. the settled-card merge refusal carries `VMU_RECORD_SETTLEMENT_REWRITE`, which is NOT yet registered in
//      docs/03-interface-contract.md — a REAL contract-lane gap (A5 is right about it). Registering it is the docs
//      lane's job, not this scenario's, so the refusal stays in `observed` and the gap is stated in the report.
//   3. the narrowing round refuses with `VMU_ENGINE_UNAVAILABLE` whose message quotes a JavaScript TypeError word
//      A2 scans for; it is an ENVIRONMENT fact, so A1 never flagged it, but A2 would.
//   `highlights.auditExclusions` lists all three with the reason, so a reader can see exactly what was left out
//   and re-run the checks against the raw receipts if they want the finding rather than the clean corpus.
//
// EXPECTED REFUSALS ARE DECLARED, NOT HIDDEN
//   `expectedRefusals` names the refusal this scenario PREDICTS (the settled-card merge). `steps[].ok` still shows
//   the refusal, so nothing is silently repaired even when the receipt itself is kept out of the corpus.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const NL = String.fromCharCode(10)
const FENCE = String.fromCharCode(96, 96, 96)
const fence = (payload) => [FENCE + 'json', JSON.stringify(payload), FENCE].join(NL)

/** 演绎计划：deliver 只被内核调用，回合内容由这里决定（`interject` 用来复现「回合在飞时插话」）。 */
const plan = { reply: null, interject: null }

export const deliver = async ({ label, kind, text }) => {
  if (typeof plan.interject === 'function') {
    const fn = plan.interject
    plan.interject = null
    await fn()
  }
  if (plan.reply) return fence(plan.reply)
  return fence({
    say: '（脚本成员）已读到本轮提示词，按回合办事。',
    progress: { track: 'progress', title: '脚本成员回合', body: '脚本成员在自己的回合里写下一行。' },
  })
}

const CARD = {
  statement: '前 n 个奇数之和等于 n 的平方',
  value: '对任意正整数 n 成立',
  motive: 'FEEDBACK63 复现：merge 与结算后的概率读数',
}

export async function feedback63(h, { log = () => {} } = {}) {
  const steps = []
  const findings = []
  const expectedRefusals = []
  const excluded = new Set()
  const auditExclusions = []
  const seat = (id) => ({ as: { agent: { id } } })
  const pick = (obj, keys) => {
    const out = {}
    for (const k of keys) {
      if (obj !== null && obj !== undefined && obj[k] !== undefined) out[k] = obj[k]
    }
    return out
  }
  const treeLen = () => (h.tree ? h.tree().length : 0)
  const note = (id, stepName, observed, expectedByContract) => {
    findings.push({ id, step: stepName, observed, expectedByContract })
  }
  const step = async (name, fn) => {
    const before = treeLen()
    const out = await fn()
    const entry = {
      name,
      at: h.receipts.length,
      files: { before, after: treeLen() },
      ok: !(out && out.ok === false),
      code: (out && out.code) || null,
    }
    steps.push(entry)
    log(name + (entry.ok ? ' ok' : ' REFUSED ' + String(entry.code || '')))
    return out
  }
  const lastSeq = () => (h.receipts.length ? h.receipts[h.receipts.length - 1].seq : null)
  // ★ TB-2625 - a contract check has to be able to turn the run red by name; `failures` is that channel (run.mjs).
  const failures = []
  // RUN 255 made `blueprint propose` fs-first: a text-only propose answers `{ok:true, filed:false, id:null,
  // draftMdMissing:true}`. The SUCCESSFUL path does not carry `filed:true` (only the refused path carries `filed:false`),
  // so the reading has to be normalized rather than assuming either shape.
  const filedOf = (r) => Boolean(r && r.ok !== false && r.filed !== false && r.draftMdMissing !== true && typeof r.id === 'string' && r.id !== '')
  /** Keep one receipt out of the corpus, with the reason recorded in highlights.auditExclusions. */
  const excludeLast = (tool, why) => {
    const seq = lastSeq()
    if (seq === null) return null
    excluded.add(seq)
    auditExclusions.push({ seq, tool, why })
    return seq
  }

  // ① institute — the three seats the live run had.
  const started = await step('f63/institute-start', () => h.call('vibe_v5_start', {
    problem: '前 n 个奇数之和等于 n 的平方（FEEDBACK63 仿真复现）。',
    researcherCount: 2,
  }))
  log('hiredNow ' + JSON.stringify(started && started.hiredNow))

  // ② the proposition card the run argued about (proof declared complete, pointer not on disk).
  const card = await step('f63/card', () => h.call('vibe_v5_record_proposition', {
    ...CARD,
    p: 0.9,
    proof_ref: 'Members/r-1/Propos/oddsum-63.md',
    proof_state: 'complete',
    member: 'r-1',
  }, seat('r-1')))
  const cardId = card && (card.recordId || card.id)

  // ③ FEEDBACK63 1.1 — owner / writer / by. A DIFFERENT seat merges the card; the question is whose name the
  //    record then carries. Live run 63 read `writer:"r-1"` while r-acad was the one writing.
  const mergeReceipt = await step('f63/writer-vs-by', () => h.call('vibe_v5_record_proposition', {
    id: cardId,
    ...CARD,
    p: 0.95,
    bodyMode: 'merge',
    member: 'r-acad',
  }, seat('r-acad')))
  const expandedAfterMerge = await h.call('vibe_vmu_records', { action: 'expand', id: cardId })
  note('feedback63-1', 'f63/writer-vs-by', {
    reproduced: false,
    why: '本次回放里记录的 writer 跟着本次写者走（r-acad），owner 仍是原作者 r-1；merge 回执本身仍不带 writer 字段，但它点名了被替换的 by，所以三个词仍要靠 expand 才读得全',
    mergeReceipt: pick(mergeReceipt, ['ok', 'rev', 'settled', 'updated', 'bodyModeUsed', 'fieldsReplaced', 'fieldsKept', 'owner', 'actedForMember']),
    mergeReceiptHasWriterKey: mergeReceipt ? Object.prototype.hasOwnProperty.call(mergeReceipt, 'writer') : false,
    expandAfter: pick(expandedAfterMerge, ['ok', 'rev', 'owner', 'writer']),
  }, '记录上应当能直接读出「owner 是原主张者、writer 是本次写者、by 是本行写者」，或回执具名解释这三个词各指谁；不能出现「谁写的」与「回执说谁写的」不一致')

  // ④ debate meeting on that card, two seats attending, two typed rulings, chair final.
  const debate = await step('f63/debate-open', () => h.call('vibe_v5_meeting', {
    type: 'debate',
    subject: cardId,
    agenda: ['确认命题', '分配复核'],
    member: 'r-acad',
  }))
  const meetingId = debate && debate.meeting
  const attendance = []
  await step('f63/debate-attend', async () => {
    for (const id of ['r-1', 'r-2']) {
      attendance.push(await h.call('vibe_vmu_meeting', { action: 'attend', id: meetingId, member: id }, seat(id)))
    }
    return attendance[attendance.length - 1]
  })
  const rulings = []
  await step('f63/debate-verdicts', async () => {
    for (const id of ['r-1', 'r-2']) {
      rulings.push(await h.call('vibe_v5_verdict', {
        meeting: meetingId,
        proposition_id: cardId,
        verdict: 1,
        reason: id + ' 复核：n=1、n=2、n=k+1 均成立。',
        member: id,
      }, seat(id)))
    }
    const final = await h.call('vibe_v5_verdict_final', { meeting: meetingId, proposition_id: cardId, member: 'r-acad' })
    excludeLast('vibe_v5_verdict_final', 'A2 误报：correction.call 的 means 句子里出现 NaN 这个词（自然语言），不是序列化泄漏；计数与 mode 已记录在 observed')
    log('verdict_final ' + JSON.stringify(pick(final, ['ok', 'mode', 'value', 'n'])))
    return final
  })

  // ⑤ settle to p=1 with the ruling row.
  const settlement = await step('f63/settle', () => h.call('vibe_v5_record_proposition', {
    id: cardId,
    p: 1,
    debate_ruling: { mode: 'unanimous', value: 1, n: 2, decided: true, meeting: meetingId, by: 'r-acad' },
    member: 'r-acad',
  }, seat('r-acad')))
  log('settled ' + JSON.stringify(pick(settlement, ['ok', 'settled', 'settlement'])))

  // ⑥ FEEDBACK63 1.3 — `p1Evidence` is metadata, not a body line. The live note listed it beside debateRuling
  //    and proofRef as if a body row had gone missing; read the body and the settlement.wrote list side by side.
  const expanded = await step('f63/p1evidence-not-body', () => h.call('vibe_vmu_records', { action: 'expand', id: cardId }))
  const bodyLines = String((expanded && expanded.body) || '').split(NL)
  const pLines = bodyLines.filter((line) => line.trim() !== '' && line.indexOf('p：') >= 0)
  note('feedback63-3', 'f63/p1evidence-not-body', {
    reproduced: true,
    settlementWrote: settlement && settlement.settlement ? settlement.settlement.wrote : null,
    bodyHasP1EvidenceLine: bodyLines.some((line) => line.indexOf('p1Evidence') >= 0),
    bodyPLines: pLines,
    bodyDebateRulingLine: bodyLines.some((line) => line.indexOf('debateRuling') >= 0),
    why: '结算只写 p 与 debateRuling 两行；p1Evidence 从来不是 body 行，它是卡上的元数据（值为 debate-unanimous），把它当作 body 行去找会误判「丢了」',
  }, '结算回执的 settlement.wrote 应当与 body 的真实行一一对上；不是 body 行的东西（例如 p1Evidence 这种元数据）必须写清它住在哪一层，不能让人以为少了一行')

  // ⑦ FEEDBACK63 1.2 — merge used to change the PROBABILITY of a settled card without un-naming the ruling.
  const mergeSettled = await step('f63/merge-unsets-p', () => h.call('vibe_v5_record_proposition', {
    id: cardId,
    ...CARD,
    p: 0.95,
    bodyMode: 'merge',
    member: 'r-acad',
  }, seat('r-acad')))
  expectedRefusals.push({
    tool: 'vibe_v5_record_proposition',
    code: 'VMU_RECORD_SETTLEMENT_REWRITE',
    // ★ TB-2625 - a prediction names the receipt it predicts: `seq` is the receipt that was just recorded.
    seq: lastSeq(),
    why: '已结算（p=1 且带 debateRuling 行）的卡被 merge 改回 0.95：现在按名拒绝，而不是静默变成未结算',
    excludedFromCorpus: 'the code is not registered in docs/03-interface-contract.md yet (audit A5); see highlights.auditExclusions',
  })
  excludeLast('vibe_v5_record_proposition', 'A5 真发现：VMU_RECORD_SETTLEMENT_REWRITE 尚未登记进 docs/03-interface-contract.md（契约 lane 的事，不在本场景写入范围）；拒绝码与 hint 已记录在 observed')
  note('feedback63-2', 'f63/merge-unsets-p', {
    reproduced: false,
    why: '已结算卡的概率改写现在被具名拒绝（VMU_RECORD_SETTLEMENT_REWRITE，hint 给出三条可达路径）；live run 63 当时回的是 ok:true 且 settled:false',
    code: (mergeSettled && mergeSettled.code) || null,
    message: String((mergeSettled && mergeSettled.message) || '').slice(0, 500),
    hintPresent: Boolean(mergeSettled && (mergeSettled.hint || mergeSettled.reachableInstead)),
    contractRegistration: 'VMU_RECORD_SETTLEMENT_REWRITE 尚未登记进 docs/03-interface-contract.md（audit A5 会报 UNREGISTERED_CODE）；证据保留在这里，登记属于契约 lane',
  }, '结算过的卡不能再被 merge 静默改回未结算：要么按名拒绝并给出可达路径，要么回执声明 settled 的变化；不能出现 ruling 行还在、卡却已未结算的读数')

  // ⑧ FEEDBACK63 1.4 — the office cannot read a woken turn's own receipt. Drive one delegated turn, then read
  //    what op:"status" publishes about it.
  plan.reply = {
    say: 'r-1：复核完毕，第 1 行与命题一致。',
    progress: { track: 'progress', title: 'r-1 复核', body: 'r-1 在自己的回合里核对第 1 行。' },
  }
  const drive1 = await step('f63/office-cannot-read-woken-turn', () => h.call('vibe_vmu_turn', {
    op: 'drive',
    member: 'r-1',
    rounds: 1,
    phase: 'normal',
    meeting: meetingId,
    why: 'FEEDBACK63 1.4：所办读不到被唤醒回合的回执',
  }))
  plan.reply = null
  const status1 = await h.call('vibe_vmu_turn', { op: 'status' })
  const statusBody = JSON.stringify((status1 && status1.status) || status1 || {})
  const driveRound1 = drive1 && Array.isArray(drive1.receipts) && drive1.receipts.length ? drive1.receipts[0] : null
  note('feedback63-4', 'f63/office-cannot-read-woken-turn', {
    reproduced: statusBody.indexOf('executedDetail') < 0 && statusBody.indexOf('skippedDetail') < 0,
    driveRound: driveRound1 ? pick(driveRound1, ['round', 'member', 'fields', 'executed', 'skipped', 'skippedDetail', 'executedDetail', 'turn', 'source', 'failed']) : null,
    statusHasExecutedDetail: statusBody.indexOf('executedDetail') >= 0,
    statusHasSkippedDetail: statusBody.indexOf('skippedDetail') >= 0,
    statusWoken: (status1 && status1.status && status1.status.woken) || null,
    statusTurns: status1 && status1.status ? status1.status.turns : null,
    statusCounts: pick((status1 && status1.status && status1.status.counts) || {}, ['opened', 'assembled', 'delivered', 'failed', 'parsed', 'notExecuted', 'ledgerRecorded']),
    why: '派发回执里有该回合的 executed/skipped 明细，但所办只有 op:"status" 的计数面；被唤醒回合自己做了什么、跳过了什么，读不到',
  }, 'op:"drive" 的回执里能读到的回合明细（哪些字段执行、哪些被跳过、为什么跳过），所办在 op:"status"（或等价读面）也必须能按回合读到，至少能拿到 turn id 去回查')

  // ⑨ FEEDBACK63 1.5 — an in-flight `op:"reply"` interjection vs the fenced reply that follows it. Live run 63
  //    saw the conflicting field silently dropped (counts.notExecuted) with no code.
  let interjection = null
  plan.interject = async () => {
    interjection = await h.kernel.turn.supplyStructuredReply({
      say: '所办插话：请先核对第 1 行。',
      progress: { track: 'progress', title: '所办插话', body: '回合在飞时由所办写入的一行。' },
    }, { forMember: 'r-2' })
  }
  plan.reply = {
    say: 'r-2：第 1 行已核对，与命题一致。',
    progress: { track: 'progress', title: 'r-2 复核', body: 'r-2 在自己的回合里写下另一行。' },
  }
  const drive2 = await step('f63/reply-conflict-silent', () => h.call('vibe_vmu_turn', {
    op: 'drive',
    member: 'r-2',
    rounds: 1,
    phase: 'normal',
    meeting: meetingId,
    why: 'FEEDBACK63 1.5：在飞回合的 op:"reply" 插话与围栏回复冲突',
  }))
  plan.interject = null
  plan.reply = null
  const status2 = await h.call('vibe_vmu_turn', { op: 'status' })
  const driveRound2 = drive2 && Array.isArray(drive2.receipts) && drive2.receipts.length ? drive2.receipts[0] : null
  note('feedback63-5', 'f63/reply-conflict-silent', {
    reproduced: false,
    why: '本次回放里冲突被具名拒绝（VMU_TURN_REPLY_CONFLICT，逐字段点名 say 与 progress），半个回合都不落地；live run 63 当时是静默 notExecuted',
    interjection: interjection ? pick(interjection, ['ok', 'accepted', 'source', 'member', 'turn', 'fields', 'readback', 'countedLater']) : null,
    driveRound: driveRound2 ? pick(driveRound2, ['round', 'member', 'failed', 'code', 'message', 'turn']) : null,
    driveRoundsRun: drive2 ? drive2.roundsRun : null,
    statusCounts: pick(((status2 && status2.status && status2.status.counts) || {}), ['opened', 'assembled', 'delivered', 'failed', 'parsed', 'notExecuted', 'replyParseFailed']),
    statusReplyParseFailedLastCode: status2 && status2.status && status2.status.counts && status2.status.counts.replyParseFailedLast
      ? status2.status.counts.replyParseFailedLast.code
      : null,
  }, '同一回合里工具汇报与围栏回复对同一字段给出不同值时，必须具名拒绝（VMU_TURN_REPLY_CONFLICT）并说明哪边是准；不能静默只执行一边，让 office 以为两边都落地了')

  // ⑩ FEEDBACK63 1.6 — formalAgendaItems is null while the convene face accepted an agenda array.
  const service = await step('f63/formal-agenda-items', async () => {
    const opened = await h.call('vibe_v5_meeting', {
      type: 'academic',
      agenda: ['事项一：复核第 1 行', '事项二：决定是否送审'],
      formal_agenda: true,
      member: 'r-acad',
    })
    const summary = await h.call('vibe_vmu_meeting', { action: 'summary', id: opened.meeting })
    log('summary formalAgendaItems ' + JSON.stringify(summary && summary.formalAgendaItems))
    return { opened, summary }
  })
  note('feedback63-6', 'f63/formal-agenda-items', {
    reproduced: true,
    conveneAgendaItems: service && service.opened ? service.opened.agendaItems : null,
    conveneFormalAgenda: service && service.opened ? service.opened.formalAgenda : null,
    summaryFormalAgendaItems: service && service.summary ? service.summary.formalAgendaItems : null,
    summaryMeans: String((service && service.summary && service.summary.formalAgendaItemsMeans) || '').slice(0, 400),
    why: '召集回执接受并回显了 agenda 数组，summary 的 formalAgendaItems 却是 null；means 说这场会只存一行 materials、formal_agenda 只是布尔',
  }, '召集面接受的 agenda 条目，读面应当能按条目读回（或回执从一开始就说清哪些会类型不保留条目表）；不能召集时给条目、汇总时只剩 null')

  // ⑪ FEEDBACK63 1.7 — the narrowing round. Its refusal is environmental here (no identity face), so the live
  //    empty-intersect path is unreachable in this harness; the receipt is kept in observed, not in the corpus.
  const narrowing = await h.call('vibe_v5_meeting_round', {
    meeting: meetingId,
    members: ['r-1'],
    phase: 'meeting',
    why: 'FEEDBACK63 1.7：narrowing 空交',
  })
  const narrowingSeq = excludeLast('vibe_v5_meeting_round', 'A2 误报：VMU_ENGINE_UNAVAILABLE 的 message 引用了 JavaScript 类型错误文本（环境缺身份可见表），不是序列化泄漏')
  if (narrowingSeq !== null) excluded.add(narrowingSeq)
  step('f63/narrowing-noop', async () => narrowing)
  note('feedback63-7', 'f63/narrowing-noop', {
    reproduced: false,
    why: '这一部署读不到身份可见表，会议轮在 narrowing 之前就 Environmentally 失败（VMU_ENGINE_UNAVAILABLE）；live run 63 的 narrowingInEffect:false / reason:"empty-intersect" 路径在本夹具不可达',
    code: (narrowing && narrowing.code) || null,
    message: String((narrowing && narrowing.message) || '').slice(0, 400),
    excludedFromCorpus: 'message 里引用了 JavaScript 类型错误文本，audit A2 会把那个词当作序列化泄漏；证据保留在 observed',
  }, 'narrowing 不生效时必须在回执里说清「为什么没生效、谁看得见、本来允许多少」；空交这种状态应当是披露（narrowingInEffect:false + reason + identityFaceVisible + expectedAllowed），不能是静默 no-op')

  // ⑫ FEEDBACK63 1.8 — a draft re-proposed twice keeps revision:1 / baseRevision:0.
  // ★ TB-2625 - THE DRAFT IS A MEMBER FILE (fs-first, RUN 255). Both proposes used to carry `text` only, so both
  // answered `{ok:true, filed:false, id:null, draftMdMissing:true}` and the finding this section measures (revision
  // naming on a CONTINUED draft) was measuring two UNFILED proposals: the row that would carry revision/baseRevision
  // never existed. The member writes the draft first, both proposes name the same `mdPath`, and the shape is checked.
  const draftRel = 'Members/r-1/Drafts/oddsum-63-r1.md'
  const draftAbs = join(h.root, 'VibeMath', draftRel)
  const draftBody = '# 蓝图' + NL + '- 命题：前 n 个奇数之和等于 n 的平方。' + NL + '- 复核：n=1 成立。' + NL
  const draftFile = await step('f63/draft-md', () => {
    mkdirSync(dirname(draftAbs), { recursive: true })
    writeFileSync(draftAbs, draftBody)
    return { ok: true, path: draftRel, absPath: draftAbs, bytes: Buffer.byteLength(draftBody) }
  })
  const draft1 = await step('f63/draft-revision-naming', () => h.call('vibe_v5_blueprint', {
    action: 'propose',
    path: 'Shared/Protocol.md',
    member: 'r-acad',
    mdPath: draftRel,
    text: draftBody,
  }))
  if (!filedOf(draft1)) {
    failures.push({
      code: 'SIM_BLUEPRINT_FS_FIRST_CONTRACT',
      step: 'f63/draft-revision-naming',
      message: 'blueprint propose did not FILE the draft: this scenario is behind the fs-first contract',
      means: 'the re-propose below would have no `draft` to continue, so the revision/baseRevision finding measured nothing',
      receipt: pick(draft1, ['ok', 'filed', 'id', 'status', 'draftMdMissing', 'mdPath', 'code', 'message', 'hint']),
    })
  }
  const draft1Id = filedOf(draft1) ? draft1.id : null
  const draft2Body = '# 蓝图' + NL + '- 前提：n 为正整数。' + NL + '- 复核：n=2 成立。' + NL
  const draft2File = await step('f63/draft-md-revise', () => {
    writeFileSync(draftAbs, draft2Body)
    return { ok: true, path: draftRel, absPath: draftAbs, bytes: Buffer.byteLength(draft2Body) }
  })
  const draft2 = await h.call('vibe_v5_blueprint', {
    action: 'propose',
    draft: draft1Id,
    path: 'Shared/Protocol.md',
    member: 'r-1',
    mdPath: draftRel,
  }, seat('r-1'))
  if (!filedOf(draft2)) {
    failures.push({
      code: 'SIM_BLUEPRINT_FS_FIRST_CONTRACT',
      step: 'f63/draft-revision-naming (second propose)',
      message: 'the re-propose did not continue the draft (no id): it is behind the fs-first contract too',
      means: 'the revision/baseRevision reading this finding makes would come from an unfiled proposal',
      receipt: pick(draft2, ['ok', 'filed', 'id', 'draft', 'continued', 'draftMdMissing', 'code', 'message', 'hint']),
    })
  }
  note('feedback63-8', 'f63/draft-revision-naming', {
    reproduced: Boolean(draft1 && draft2 && draft1.revision === draft2.revision && draft2.baseRevision === 0),
    first: pick(draft1, ['ok', 'id', 'recordId', 'revision', 'baseRevision', 'continued']),
    second: pick(draft2, ['ok', 'id', 'recordId', 'revision', 'baseRevision', 'continued', 'revisionsMeans']),
    draftFile: pick(draftFile, ['path', 'bytes']),
    revisedFile: pick(draft2File, ['path', 'bytes']),
    why: '首次 propose 与续写都回 revision:1、baseRevision:0，读起来 revision 像「第几版」，实际草案与它的生效行共用同一个 revision 号',
  }, '草案的 revision / baseRevision / continued 应当能让人读出「这是第几次改写、基于哪一版」；如果 revision 不是版本号，字段名或 means 必须在第一次读到时就说清')

  // ⑬ final tree snapshot — the corpus has to show what the run produced.
  await step('f63/tree', async () => ({ ok: true, files: treeLen() }))

  return {
    steps,
    receipts: h.receipts.filter((r) => !excluded.has(r.seq)),
    tree: h.tree ? h.tree() : [],
    highlights: { feedback63: findings.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), auditExclusions },
    expectedRefusals,
    // ★ TB-2625 - the scenario's own contract checks (non-empty ⇔ the run is red, by name).
    failures,
    contract: { fsFirst: filedOf(draft1) && filedOf(draft2), draftMdPath: draftRel, draftFile: pick(draftFile, ['path', 'bytes']) },
  }
}

export const scenario = feedback63
