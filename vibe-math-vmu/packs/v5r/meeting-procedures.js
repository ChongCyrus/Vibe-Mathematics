// vibe-math-vmu/packs/v5r — 会议类型目录与「推荐流程骨架」（hand-written：没有任何生成器读它）
//
// ★ WHY THIS FILE EXISTS. 研究所规则说：院士可以设置会议的**类型**；某些特殊类型下，框架在开会时**推荐**一套流程骨架，
//   但「具体实施、决定、是否要遵循完全由院士自己决定」。三条能力以前都不存在：
//     · `vibe_v5_meeting` 的 `kind` 是**校完就丢**的参数，并且它把 `type:'ordinary'` **硬编码**传给内核 —— 院士根本无法设置类型；
//     · 声明过的 `target`（辩论对象/文件引用）**没有任何消费者**；
//     · 没有任何东西携带「推荐流程」。
//   本文件是这三条的 pack 侧唯一来源：类型目录、骨架文本、以及**明确登记的缺口**。
//
// ★ WHY IT IS NOT CALLED `flow`. 内核已经有一个 `flow`（`kernel/meetingmarker.js` `createOrderControls` ⇒
//   `{ flow, overrideOrder, effective, orderFor, floorOf, queueGate, view, ORDER_KEY }`），它管的是**发言楼层/顺序**
//   （`open` / `hands` / `round_robin` / `call_on`），是「谁先说话」的机制。本文件管的是**议程顺序**（先干什么、后干什么）。
//   两个东西都被叫成「流程」就会让人以为设了 `flow` 就等于设了议程 —— 所以这里一律写 `procedure`，
//   并且 `vibe_v5_meeting` 的返回里两者分开报告（`flow` 由内核面负责，`procedure` 由本文件负责）。
//
// ★ RECOMMENDATION, NOT REQUIREMENT. `binding: 'recommendation'` 是机器可读的：任何读取方都不许把骨架当成门禁。
//   框架不推进议程、不检查院士是否照做、也不因为偏离而拒绝任何调用 —— 这正是规则要的「完全由院士自己决定」。
//
// ★ THE HONEST HALF. 规则里有两件事目前**框架没有实现**，它们以 `status:'pending'` 出现在骨架里、并以
//   `MEETING_PROCEDURE_GAPS` 具名导出（每个缺口写明规则原文、现状、以及它该由哪一面实现）。
//   宁可让院士看到「这一步还没实现」，也不要给一个看起来跑通了的假流程。

/** 会议类型目录。规则原文：「正常会议，学术交流，辩论，结题，论文交流，未来规划/策划，...」——
 *  最后的「...」是允许扩展：设置 `vmu.meetings.typeCatalog` 可以收紧或放宽，内核按声明校验。 */
export const MEETING_TYPES = Object.freeze([
  Object.freeze({ id: 'ordinary', label: '正常会议', purpose: '临时起意的一般议事：同步进展、定分工、处理突发。', subjectRequired: false }),
  Object.freeze({ id: 'academic', label: '学术交流', purpose: '交换各自方向的进展与想法，不裁决任何命题。', subjectRequired: false }),
  Object.freeze({ id: 'debate', label: '辩论', purpose: '围绕一个命题（或一篇论文/一段 Lean）的**真伪**展开辩论，并以最终裁决给出布尔概率。', subjectRequired: true }),
  Object.freeze({ id: 'closure', label: '结题', purpose: '对一个课题的收尾：确认已完成、尚缺什么、是否达标。', subjectRequired: false }),
  Object.freeze({ id: 'paper', label: '论文交流', purpose: '交叉互审与定稿讨论（面向读者的正确性与系统性）。', subjectRequired: false }),
  Object.freeze({ id: 'planning', label: '未来规划/策划', purpose: '设计/调整技术路线蓝图与后续阶段安排。', subjectRequired: false }),
])

export const MEETING_TYPE_IDS = Object.freeze(MEETING_TYPES.map((t) => t.id))
const BY_ID = new Map(MEETING_TYPES.map((t) => [t.id, t]))

/**
 * 辩论会议的推荐流程骨架 —— 逐条对应规则原文，不增不减：
 *   ① 先各成员**同时**「单次发言版群聊」独立发表「布尔概率([0,1])，理由，...」；
 *   ② 再进行轮流发言 / 各自举手发言 / 邀请发言来展开辩论，**轮数由院士自己决策**；
 *   ③ 待辩论会议结束，各辩论成员给出**最终裁决**「布尔概率([0,1])，理由，...」；
 *   ④ 若全部一致为 1（或一致为 0）则最终概率取该值，否则取平均值，并**通知该命题卡的持有者**把概率改为该值。
 */
export const DEBATE_PROCEDURE = Object.freeze({
  title: '辩论会议 · 推荐流程骨架',
  binding: 'recommendation',
  subject: '辩论对象：命题卡 id、一个文件引用（如 Members/<成员>/Propos/<id>.md 或 Lean 文件），或一句话命题。lean 已通过但概率仍非 1 的命题，辩论焦点是「代码中的命题与定义是否符合原意」。',
  steps: Object.freeze([
    Object.freeze({
      n: 1,
      phase: 'independent-estimates',
      what: '各成员同时、独立发言，各自给出该命题当前的布尔概率([0,1])、理由、以及证明/证伪进展。先不互相反驳、不互相引用。',
      tools: Object.freeze(['vibe_vmu_meeting { action: "speak" }', 'vibe_v5_say']),
      status: 'supported',
    }),
    Object.freeze({
      n: 2,
      phase: 'debate',
      what: '展开辩论：轮流发言 / 举手后发言 / 主席邀请发言。★ 轮数由院士自行决定，框架不设默认轮数、也不在轮数用尽时拒绝任何调用。',
      tools: Object.freeze(['vibe_vmu_meeting { action: "hand" }', 'vibe_vmu_meeting { action: "invite" }', 'vibe_vmu_meeting { action: "speak" }']),
      status: 'supported',
    }),
    Object.freeze({
      n: 3,
      phase: 'final-verdicts',
      what: '会议结束前，每位参加辩论的成员给出最终裁决：「布尔概率([0,1])，理由」。主席先开一个 live 票（target = 辩论对象），成员再各自写入自己的概率。',
      tools: Object.freeze([
        'vibe_vmu_meeting { action: "ballot", ballotId: "<自定 id>", target: "<辩论对象>" }',
        'vibe_v5_verdict { verdict: <0..1>, target: "<ballotId>", member: "<你>" }',
      ]),
      status: 'supported',
    }),
    Object.freeze({
      n: 4,
      phase: 'aggregate-and-notify',
      what: '框架裁定并通知：若全部一致为 1（或一致为 0）则最终概率取该值，否则取所有裁决的平均值；随后通知该命题卡的持有者把卡片概率改为该值。',
      tools: Object.freeze([]),
      status: 'pending',
      pendingReason: '聚合规则（一致⇒该值 / 否则平均）与「通知命题卡持有者」都还没有工具面。票面能收概率（vibe_v5_verdict），消息面能发消息（vibe_v5_message），但**没有东西把票变成结论、更没有人去通知持有者** —— 需要调用方自己算。已登记为缺口 verdict-aggregation（见 MEETING_PROCEDURE_GAPS）。',
    }),
  ]),
  notes: Object.freeze([
    '本骨架是**推荐**：院士可以只做其中一步、改变顺序、或完全不用。框架不检查、不阻断、不记录偏离。',
    '「单次发言版群聊」在本框架里就是「每人各说一次、互不打断」：会议内用 `vibe_vmu_meeting { action:"speak" }`（进会议记录），群聊形态用 `vibe_v5_say`。',
    '发言楼层（谁先说话）是另一套机制：`vibe_vmu_meeting { action:"flow" }`（open/hands/round_robin/call_on）。骨架管议程，flow 管顺序，两者互不替代。',
  ]),
})

/** 只有规则点名给了骨架的类型才有骨架。其余类型**不发明**流程 —— 返回 null 并说明，而不是给一套看起来专业的假流程。 */
export const MEETING_PROCEDURES = Object.freeze({ debate: DEBATE_PROCEDURE })

/** 规则里写明、而框架**尚未实现**的两件事。机器可读，供工具面与文档共同引用（单一来源）。 */
export const MEETING_PROCEDURE_GAPS = Object.freeze([
  Object.freeze({
    id: 'verdict-aggregation',
    rule: '待辩论会议结束，各成员给出最终裁决「布尔概率([0,1])，理由，...」；若全部一致为 1（或一致为 0）则最终概率为该值，否则取平均值；并通知该命题卡持有者改概率。',
    now: '票面（kernel 的 ballot 原语 + vibe_v5_verdict）能收每个成员的概率；但聚合规则与「通知持有者」都没有实现：内核的 defaultTally 只处理 for/against 布尔票，estimate 只被计数、从不参与任何平均值计算。',
    owner: 'pack（聚合规则是机构政策）；通知走 kernel 的 mailbox 面',
    status: 'not-implemented',
  }),
  Object.freeze({
    id: 'min-voters',
    rule: '辩论、结题表决的人数至少为某一定数量，这个数量取「用户设置的数量」和「院士+常驻研究员 的数量」的最小值。',
    now: 'ballot 原语已有 minEligible 门槛（人数不足时 VMU_STATE 具名拒），但没有任何调用方给它传值：既是内核的 ballot 工具面没有透传，也没有任何地方计算 min(用户设置, 院士+常驻研究员)。',
    owner: 'kernel 透传 minEligible + pack 计算下限',
    status: 'not-implemented',
  }),
])

/** 一个类型的完整描述（未知类型返回 known:false 与合法取值，绝不返回一个静默的空对象）。 */
export function meetingTypeOf(type) {
  const id = String(type === null || type === undefined ? '' : type).trim()
  const row = BY_ID.get(id) || null
  return {
    type: id || null,
    known: !!row,
    label: row ? row.label : null,
    purpose: row ? row.purpose : null,
    subjectRequired: row ? row.subjectRequired : false,
    legal: MEETING_TYPE_IDS,
    note: row ? null : 'not a declared meeting type; legal: ' + MEETING_TYPE_IDS.join(', '),
  }
}

/** `procedureFor(type)` ⇒ 该类型的骨架或 null，以及**为什么**没有骨架。给工具面直接嵌进回执用。 */
export function procedureFor(type) {
  const row = meetingTypeOf(type)
  const procedure = row.known ? (MEETING_PROCEDURES[row.type] || null) : null
  return {
    type: row.type,
    known: row.known,
    label: row.label,
    subjectRequired: row.subjectRequired,
    hasProcedure: !!procedure,
    procedure,
    binding: procedure ? procedure.binding : null,
    note: !row.known
      ? row.note
      : (procedure
        ? '这套骨架是**推荐**，不是门禁：院士可以跳过、改序或完全不用，框架不检查也不阻断。'
        : '本类型没有推荐流程骨架（规则只点名给了辩论会议）：框架只提供它的通用会议原语，议程由院士自行编排。'),
    // 有骨架时把该骨架里尚未实现的步骤一并报出来，调用方不必去读源码才知道哪一步是空的。
    pendingSteps: procedure ? procedure.steps.filter((s) => s.status !== 'supported').map((s) => ({ n: s.n, phase: s.phase, reason: s.pendingReason })) : [],
  }
}
