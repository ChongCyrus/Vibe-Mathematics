/**
 * 会议**类型**目录与**推荐**流程骨架 —— 机构政策，属于 pack，不属于内核（D5 / 规则「特殊类型会议」）。
 *
 * 三条历史缺陷（本文件存在的原因，逐条都有 file:line 级的旧行为为证）：
 *   ① 类型词汇在 pack 里被校验完就丢掉，内核永远只看到 `type:'ordinary'`；
 *   ② `type` 之后 `target`（议题对象）没有任何消费者；
 *   ③ 没有任何「流程骨架」—— 院士开完会没有任何议程建议。
 * 今天的形状：`MEETING_TYPES` 是 pack 自己的词汇（内核不认识这六个 id，`tests/vmu-meeting-types.test.mjs`
 * 会真的去 `kernel/meetings.js` 里 grep 它们，确认「换机构＝换 pack」这条第一原则没被破坏）。
 *
 * ★ D5 + 用户裁定（2026-10-24）：**每一类都有决议，但不是每一类都有骨架**。规则只点名给了辩论会议的骨架，
 * 而「规则没给骨架」不等于「框架可以静默返回 null」；所以最初六类各配一套骨架。用户随后裁定「普通会议不需要
 * 推荐流程骨架，只有一些特殊类型会议比如辩论才推荐」⇒ ordinary 改成一个**具名的「不给」**
 * （`ORDINARY_NO_SKELETON_REASON`），其余五类保留骨架。每一步都带 `tool:` 字段点名**真实存在**的工具
 * （`tests/vmu-meeting-procedures-catalog.test.mjs` 会拿
 *
 * 语义边界（必须一直被说清）：
 *   · `binding:'recommendation'` 是**机器可读**的承诺：骨架不是门禁。院士可以只做其中一步、改顺序、
 *     或完全不用；框架不检查、不阻断、不记录偏离。
 *   · 骨架里的 `status:'yes'` 之类的"实现状态"不要编：只有 `'supported'` 与 `'pending'(+pendingReason)`
 *     两种，`pendingSteps` 由 `status !== 'supported'` 派生，空的就真的是空。
 */

/** 六个类型（顺序即展示顺序）。`subjectRequired` 只有辩论为真 —— 规则只点名辩论需要「命题对象」。 */
export const MEETING_TYPES = Object.freeze([
  Object.freeze({ id: 'ordinary', label: '正常会议', purpose: '例行同步：本所/小组的进展、分工、阻塞与下一步。', subjectRequired: false }),
  Object.freeze({ id: 'academic', label: '学术交流', purpose: '围绕研究方向互相报告与提问，把要追的线索落到记录上。', subjectRequired: false }),
  Object.freeze({ id: 'debate', label: '辩论', purpose: '围绕一个命题（命题卡/文件/一句话）辩论，以最终裁决给出布尔概率。', subjectRequired: true }),
  Object.freeze({ id: 'closure', label: '结题', purpose: '确认目标是否达成、缺什么，并对"是否达标"表决与归档。', subjectRequired: false }),
  Object.freeze({ id: 'paper', label: '论文交流', purpose: '围绕一篇论文稿的提交、互审、修订与定稿。', subjectRequired: false }),
  Object.freeze({ id: 'planning', label: '未来规划/策划', purpose: '基于现状与约束，给出备选路线与阶段计划。', subjectRequired: false }),
])

export const MEETING_TYPE_IDS = Object.freeze(MEETING_TYPES.map((t) => t.id))
const BY_ID = new Map(MEETING_TYPES.map((t) => [t.id, t]))

/** 一步骨架。`tool` 是**唯一主工具名**（机器可核对的字段），`tools` 是给人读的完整调用示例。 */
function step(n, phase, tool, what, tools) {
  return Object.freeze({ n, phase, tool, what, tools: Object.freeze(tools), status: 'supported' })
}

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
    step(1, 'independent-estimates', 'vibe_v5_say',
      '各成员各自独立表态：给出该命题当前的布尔概率([0,1])、理由、以及证明/证伪进展。先不互相反驳、不互相引用（「独立」是**尽力而为的约定**，不是内核保证的隔离 —— 见 notes）。',
      ['vibe_vmu_meeting { action: "speak" }', 'vibe_v5_say']),
    step(2, 'debate', 'vibe_vmu_meeting',
      '展开辩论：轮流发言 / 举手后发言 / 主席邀请发言。★ 轮数由院士自行决定，框架不设默认轮数、也不在轮数用尽时拒绝任何调用。',
      ['vibe_vmu_meeting { action: "hand" }', 'vibe_vmu_meeting { action: "invite" }', 'vibe_vmu_meeting { action: "speak" }']),
    step(3, 'final-verdicts', 'vibe_v5_verdict',
      '会议结束前，每位参加辩论的成员给出最终裁决：「布尔概率([0,1])，理由」。主席先开一个 live 票（target = 辩论对象），成员再各自写入自己的概率。',
      ['vibe_vmu_meeting { action: "ballot", ballotId: "<自定 id>", target: "<辩论对象>" }',
        'vibe_v5_verdict { verdict: <0..1>, target: "<ballotId>", member: "<你>" }']),
    step(4, 'aggregate-and-notify', 'vibe_v5_verdict_final',
      '框架裁定并通知：若全部一致为 1（或一致为 0）则最终概率取该值，否则取所有裁决的平均值；随后通知该命题卡的持有者把卡片概率改为该值。',
      ['vibe_v5_verdict_final { meeting: "<本会议>", proposition_id: "<命题卡>", verdicts: [{ member, p, reason }], fidelity?: "conform" | "defect" }']),
  ]),
  notes: Object.freeze([
    '本骨架是**推荐**：院士可以只做其中一步、改变顺序、或完全不用。框架不检查、不阻断、不记录偏离。',
    '「单次发言版群聊」在本框架里就是「每人各说一次、互不打断」：会议内用 `vibe_vmu_meeting { action:"speak" }`（进会议记录），群聊形态用 `vibe_v5_say`。★ 但「独立」只是**尽力而为的约定**，两条事实要一起看：(a) 框架没有并发，轮次是**顺序**推进的（`kernel/turn` 的 drive 一个成员接一个成员跑），caller 交付模式下更是一格一回合（交回一份提示词、等一份回复，同一时刻只有一个待回回合），提示词装配也**不注入**别人的发言；(b) **即使顺序化、即使不注入前文，读房间仍然可能** —— `vibe_vmu_chat` 走 `chat.list`，内核的聊天读面**不按调用者过滤**，任何成员都能读到整个房间，包括同一轮里别人刚说的话。所以第 1 步的「独立」不是隔离保证：要隔离请用会议发言（进会议记录，工具面没有会议记录的读面）；靠群聊就只能靠这条约定。',
    '发言楼层（谁先说话）是另一套机制：`vibe_vmu_meeting { action:"flow" }`（open/hands/round_robin/call_on）。骨架管议程，flow 管顺序，两者互不替代。',
    '第 4 步不是自动的：`vibe_v5_verdict_final` 由**主席**显式调用（裁决必须有签名人），内核面 `vmu.meetingverdict` 只做算术与校验，通知走既有 mailbox 面 —— 本 pack **没有**在 `meetings.close` 上挂任何自动聚合钩子（"会议关了就把数算出来"会把一次显式裁定变成一次静默推断）。',
  ]),
})

/**
 * ★ 为什么 ordinary 没有骨架（**具名决定**，机器可读）—— 用户裁定（2026-10-24）：「普通会议不需要推荐给院士
 * 流程骨架，只有一些特殊类型会议比如辩论才推荐给院士流程骨架」。这不是遗漏：普通会议就是例行同步，议程与顺序
 * 完全由院士决定，框架再给一套三步脚本反而是替院士做决定。
 *
 * 保留一条硬约束：**没有骨架也必须说得出来为什么**。`MEETING_PROCEDURE_DECISIONS` 里 ordinary 的
 * `hasProcedure:false` 与这句 reason 是同一个决定的两面，工具面回执里 `procedure:null` 旁边就跟着这句。
 */
export const ORDINARY_NO_SKELETON_REASON = Object.freeze(
  '本类型不给推荐骨架：正常会议（例行同步）的议程与顺序完全由院士自行编排（用户裁定 2026-10-24；这一条是具名决定，不是遗漏）。')

/** 学术交流：报告 + 交叉提问 + 把线索落库。 */
export const ACADEMIC_PROCEDURE = Object.freeze({
  title: '学术交流 · 推荐流程骨架',
  binding: 'recommendation',
  subject: null,
  steps: Object.freeze([
    step(1, 'report-directions', 'vibe_v5_record_progress',
      '各方向报告当前状态：已有结论、正在试的路、卡住的点。能落卡的结论要落卡（记录面才是机构记忆）。',
      ['vibe_v5_record_progress { ... }', 'vibe_v5_say { text: "<报告>" }']),
    step(2, 'cross-questions', 'vibe_vmu_meeting',
      '交叉提问与追问：举手/邀请发言后由本人回答。重点是"这一步为什么成立"，不是"做没做"。',
      ['vibe_vmu_meeting { action: "hand" }', 'vibe_vmu_meeting { action: "speak" }']),
    step(3, 'file-the-leads', 'vibe_v5_task_create',
      '把要追的线索与待验证的猜想落成任务/子问题卡，散会后再也不会"没人记得"。',
      ['vibe_v5_task_create { ... }', 'vibe_v5_record_subproblem { ... }']),
  ]),
  notes: Object.freeze([
    '本骨架是**推荐**，不是门禁：可以跳过、改序、完全不用。',
    '「交流」不需要投票：需要定论的时候才用辩论会议，别把交流会开成表决会。',
  ]),
})

/** 结题：清点 + 点名缺口 + 表决 + 归档。 */
export const CLOSURE_PROCEDURE = Object.freeze({
  title: '结题 · 推荐流程骨架',
  binding: 'recommendation',
  subject: null,
  steps: Object.freeze([
    step(1, 'inventory-what-is-done', 'vibe_v5_overview',
      '清点已完成的东西：目标逐条对照，只有能指到产物/记录的才算完成。',
      ['vibe_v5_overview { ... }', 'vibe_v5_task_list { ... }']),
    step(2, 'name-the-gaps', 'vibe_v5_task_create',
      '点名缺口：缺什么、为什么缺、补它需要什么。不许用"基本完成"略过。',
      ['vibe_v5_task_create { ... }', 'vibe_v5_record_progress { ... }']),
    step(3, 'take-the-vote', 'vibe_v5_poll_open',
      '对「是否达标」表决：先开票，再由有资格者各自投，最后取票。人数下限**已实现**：`kernel/meetings.js` 的 `quorumOf` 计算 m = min(所设上限, 在册有表决权人数)，`vibe_v5_verdict_final` 的 floor 与会议关闭栏读同一个函数。',
      ['vibe_v5_poll_open { ... }', 'vibe_v5_poll_vote { ... }', 'vibe_v5_poll_close { ... }']),
    step(4, 'archive-the-verdict', 'vibe_v5_report',
      '把结题结论归档：结论、依据、遗留项各一段，交给机构记录而不是留在会议记录里。',
      ['vibe_v5_report { ... }']),
  ]),
  notes: Object.freeze([
    '本骨架是**推荐**，不是门禁：可以只做一步、改顺序、完全不用。',
    '表决的结果必须能被读回（票箱/裁决面），「大家都没意见」不是结论。',
  ]),
})

/** 论文交流：提交 + 互审 + 修订定稿（定稿受所办咨询闸约束）。 */
export const PAPER_PROCEDURE = Object.freeze({
  title: '论文交流 · 推荐流程骨架',
  binding: 'recommendation',
  subject: null,
  steps: Object.freeze([
    step(1, 'submit-and-announce', 'vibe_v5_paper',
      '稿件的当前版本先落到论文子系统（start/sections/status 都可读回），再在会上公示版本与变化。',
      ['vibe_v5_paper { action: "start", target: "<论文 id>" }', 'vibe_v5_paper { action: "sections", target: "<论文 id>" }']),
    step(2, 'cross-review', 'vibe_v5_paper',
      '交叉互审：每位评审给出"可交付 / 需修改"的判定与理由；判定要落进论文子系统的 review 面。',
      ['vibe_v5_paper { action: "review", target: "<论文 id>", deliverable: true|false, notes: "<理由>" }']),
    step(3, 'revise-and-finalize', 'vibe_v5_paper',
      '按评审意见修订后推进状态；定稿要过所办咨询闸（`vmu.paper.officeConsult`），所办用 `consult` 答复后才放行。',
      ['vibe_v5_paper { action: "advance", target: "<论文 id>" }',
        'vibe_v5_paper { action: "consult", target: "<论文 id>", member: "<所办>", answer: "<意见>" }',
        'vibe_v5_paper { action: "final", target: "<论文 id>", member: "<院士>", deliverable: true }']),
  ]),
  notes: Object.freeze([
    '本骨架是**推荐**，不是门禁：可以跳过互审直接定稿（但咨询闸是内核/系列化策略，不在本骨架的裁量范围内）。',
    '所办咨询闸是**策略**：`vmu.paper.officeConsult` 由部署声明；本骨架只说明"定稿可能被拒、拒了怎么答复"。',
  ]),
})

/** 未来规划/策划：读现状 + 列备选 + 排阶段 + 确认。 */
export const PLANNING_PROCEDURE = Object.freeze({
  title: '未来规划/策划 · 推荐流程骨架',
  binding: 'recommendation',
  subject: null,
  steps: Object.freeze([
    step(1, 'read-the-state', 'vibe_v5_overview',
      '先把现状与约束摊开：目标、已完成、已知阻塞、外部限制。没有现状的规划是许愿。',
      ['vibe_v5_overview { ... }', 'vibe_v5_read_library { ... }']),
    step(2, 'lay-out-routes', 'vibe_v5_record_method',
      '列备选路线（至少两条），每条写清代价、风险、可验证的里程碑；方法/路线落卡，别只存在于发言里。',
      ['vibe_v5_record_method { ... }', 'vibe_v5_record_proposition { ... }']),
    step(3, 'plan-the-phases', 'vibe_v5_task_create',
      '把选定路线拆成阶段任务，标出优先级与依赖；先做哪一步、什么条件下改路线要写下来。',
      ['vibe_v5_task_create { ... }', 'vibe_v5_prioritize { ... }']),
    step(4, 'confirm-plan', 'vibe_v5_poll_close',
      '确认阶段计划：要形成机构决定就表决，并把结果记录（谁赞成、谁保留、什么条件下重议）。',
      ['vibe_v5_poll_open { ... }', 'vibe_v5_poll_vote { ... }', 'vibe_v5_poll_close { ... }']),
  ]),
  notes: Object.freeze([
    '本骨架是**推荐**，不是门禁：规划会议尤其可以不按骨架走 —— 但"没有备选路线"与"没有里程碑"通常意味着还没规划。',
  ]),
})

/**
 * 五个类型 ⇒ 五套骨架，**ordinary 一个具名的「不给」**（`ORDINARY_NO_SKELETON_REASON`）。没有静默 null：
 * `MEETING_PROCEDURE_DECISIONS` 是机器可读的决议台账，新增类型若既没配骨架也没写理由，
 * `tests/vmu-meeting-procedures-catalog.test.mjs` 会红
 */
export const MEETING_PROCEDURES = Object.freeze({
  academic: ACADEMIC_PROCEDURE,
  debate: DEBATE_PROCEDURE,
  closure: CLOSURE_PROCEDURE,
  paper: PAPER_PROCEDURE,
  planning: PLANNING_PROCEDURE,
})

/**
 * 决议台账：每个类型要么有骨架，要么**具名**说明"本类型不给骨架，原因：X"。今天六个都有骨架，
 * 但形状保留 —— 一个能被机器检查的"没有"，胜过一个静默的 null。
 */
export const MEETING_PROCEDURE_DECISIONS = Object.freeze(MEETING_TYPES.map((t) => {
  const procedure = MEETING_PROCEDURES[t.id] || null
  return Object.freeze({
    type: t.id,
    label: t.label,
    hasProcedure: !!procedure,
    reason: procedure ? null : (t.id === 'ordinary' ? ORDINARY_NO_SKELETON_REASON : '本类型不给推荐骨架：' + t.label + ' 的议程完全由院士自行编排（这一条是具名决定，不是遗漏）。'),
  })
}))

/** 规则里写明、而框架**尚未实现**的事。机器可读，供工具面与文档共同引用（单一来源）。 */
export const MEETING_PROCEDURE_GAPS = Object.freeze([
  Object.freeze({
    id: 'min-voters',
    rule: '辩论、结题表决的人数至少为某一定数量，这个数量取「用户设置的数量」和「院士+常驻研究员 的数量」的最小值。',
    now: '已实现：m = min(所设上限, 在册有表决权人数) 由 kernel/meetings.js 的 quorumOf 计算（v5r: quorumFloorSource "universe"、quorumCap 3、eligibleSeats [chair, member]），vibe_v5_verdict_final 的 floor 与关闭栏都读它；poll 的门槛由 ballot 原语的 minEligible 执行，poll_open 已透传 min_votes/min。',
    owner: 'kernel 透传 minEligible + pack 计算下限',
    status: 'implemented',
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
        : '本类型没有推荐流程骨架（这是具名决定，不是遗漏）：框架只提供它的通用会议原语，议程由院士自行编排。'),
    // 有骨架时把该骨架里尚未实现的步骤一并报出来，调用方不必去读源码才知道哪一步是空的。
    pendingSteps: procedure ? procedure.steps.filter((s) => s.status !== 'supported').map((s) => ({ n: s.n, phase: s.phase, reason: s.pendingReason })) : [],
  }
}
