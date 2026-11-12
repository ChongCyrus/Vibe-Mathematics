/**
 * v5r CHARTER BLOCKS, part B of 2 — split out of `v5r-charter.js` in round 470.
 *
 * WHY THIS FILE MAY BE SPLIT BY HAND AND THE OTHER THREE OVER-LIMIT ONES MAY NOT: no generator reads it textually and
 * it carries no markers, so the only contract is the import its two readers use. `settings/schema.js` is input to five
 * generators, `math-computation.js` is byte-compared against a second copy, and `kernel/index.js` is read textually by
 * fifty-seven files. This one is data with a name.
 */
import { LATEX_ENGINE_NOTE } from './v5r-blocks-a.js'
import { replyCatalogueLines, replyChannelLines } from './v5r-reply-channel.js'

// ★★★ RUN 206 (run 44 / FEEDBACK43 1.7, MEASURED): the mainline block used to give the three seats THREE bodies, so a
// member asked to quote the mainline back produced a different paragraph per seat and nobody could compare them. The
// core text is now declared ONCE here and every seat appends only its own duty ('your share'), with a version marker
// so a paraphrase can be detected instead of argued about.
const MAINLINE_VERSION = 'mainline-v2'
const MAINLINE_CORE = [
  '【核心推进方向（主线）】',
  // ★★★ RUN 209 (run 46 / FEEDBACK45 2.1, MEASURED): this line promised 「三席共用同一段正文…抄回时应逐字一致」 while the
  // block also appends a PER-SEAT duty line and a per-seat 【蓝图】 paragraph — so a member quoting the block back verbatim
  // could not match the next seat's text, and run 46 reported the promise as false. The promise now names exactly what is
  // shared (this 主线段) and what is not (the dot line that follows, and the 蓝图 section below).
  '  · 版本：' + MAINLINE_VERSION + '（**共享正文**＝本段这 4 条：**在册各席逐字一致**（三类同文，可抄回比对）；紧接着的「· 你的担子」一行**按席不同**，其后的【蓝图】一节**按席位能力不同**——这两处不属于共享正文，不算不一致）',
  '  · 一条主线＝**原问题的实现蓝图的策划、细化、调整，以及由粗到细的构建、扩张、推进与实现**；不是零散任务清单，每一步都要能说清在蓝图上推进了什么。',
  '  · **每回合三问**：①这回合推进或扩张蓝图的哪个节点？②该节点的信息更新了没有（当下评价 / 初始计划与启发 / 相关计划 / 可行性及原因 / 价值性及原因 / 结论与经验 / 障碍与方案 / 过去经验）？③**以前是否处理过类似问题**——先查蓝图与归档，能迁移复用就复用，别重复探索。',
  '  · 持续积累与主线推进、改进、调整相关的认知与有价值反馈；据实践反馈调整、细化蓝图并更新节点信息；吸取经验持续改进，把经验一般化、迁移到新问题。',
].join('\n')
const MAINLINE_SEAT = {
  academician: '  · 你的担子：把主线写成蓝图（`vibe_v5_blueprint` propose/adopt/state），每次推进后更新节点信息，评审下属每一步都先问这三问；蓝图见紧接着的【蓝图】一节。',
  researcher: '  · 你的担子：这一回合要能说清推进了蓝图上的哪个节点，并把结论、命题、经验反馈与障碍解决经验写进节点信息，让下一个人不必重走。',
  temp: '  · 你的担子：临时任务也要说明它指向蓝图的哪个节点，先查旧经验，能复用就复用。',
}
export const CHARTER_BLOCKS_B = Object.freeze([
  {
    name: 'v5r-turn-acad-leads',
    order: 692,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '作为院士，除了做研究，你还要**统筹全所**：用 vibe_v5_overview 看清谁在做什么、',
        '哪里是瓶颈；把工作拆成任务并用 vibe_v5_assign 分派；必要时用 vibe_v5_nudge 督办。',
      ].join('\n'),
    },
  },
  // ── THE RESOURCE DISCIPLINE (source `resourceBlock`, L2069-2085) ────────────────────────────────────────────
  // Every number in the source's block is a runtime parameter, so the values arrive through settings and only the
  // wording lives here (docs/26 section 3.14). The switch is the loop's job: when self-checks are off the block is not
  // included at all, which is ZERO injection - the source is explicit that injecting a "disabled" notice instead
  // would change the prompt's words, while omitting it returns the prompt to what it was before the feature.
  {
    name: 'v5r-turn-resources',
    order: 693,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '【资源】本机可能资源紧张，请自觉控本回合开销：',
        '  · 并发：框架每轮最多同时唤醒 {{ setting:vmu.turn.maxParallel }} 名成员（`vmu.turn.maxParallel`，是**唤醒人数**不是算力并发）；引擎/计算侧并发上限是 `vmu.math.maxParallel`（默认 1，**所办可设**），超限具名拒。**不要**为了提速一次性铺开大量子代理。',
        '  · 工具预算：本回合工具调用上限 = {{ setting:vmu.turn.toolCallsPerTurnCap }} 次（`vmu.turn.toolCallsPerTurnCap`，由所办设置；0 表示不额外限制）——该用就用，别为省次数跳过必要的读取与核对。',
        '  · 自监测：内存阈值 = {{ setting:vmu.turn.memoryCeilingMb }} MB（0 表示不监测），接近它时**先让出**：停新子代理、走轻量路径、把任务切小，并在回执里写明"因资源让出、剩余工作是什么"。',
        '  · 取舍：**正确性优先于产出量**；紧张时宁可少做一步并说明，也不要冒险拖垮本机（OOM 会丢掉全部未落盘工作）。',
      ].join('\n'),
    },
  },
  // ── THE STATUS BOARD AND ITS ONE SOURCE PER ROW (the four fields must HAVE a source) ───────────────────────
  // WHY THIS SECTION EXISTS. The acceptance ledger's P3 was「状态板四字段无来源」: the charter told every member to read
  // 总任务/规划/各任务完成状态/当前小任务 and nothing produced them, so a model had to invent them. The kernel now
  // composes the block (`kernel/turn/index.js#composeStatusBlock` → `renderStatusBoard`) from the task board and the
  // records track, and every row with an unreadable source prints 「该来源未提供：<原因>」 instead of disappearing.
  // Teaching a field that has a source is not the same as teaching one that has none: the wording points at the four
  // labels and at the single source of each, and says what the gap line means. It is prose about DATA the loop hands
  // over, so it names no tool as the way to "get" the board - the board is in the prompt already.
  {
    name: 'v5r-turn-board',
    order: 694,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        "【状态板】每轮提示里有一段 `[状态板]`（**由内核注入**，不是你要写的块），四个字段各有**唯一来源**，请直接引用它，不要自己另立一套：",
        "  · `[总任务]` 来自设置键 `vmu.turn.objective`（未设定时由任务板汇总）；`[规划]` 来自任务板的依赖与顺序；",
        "  · `[各任务完成状态]` 来自任务板（`vibe_v5_task_list`，或按 id 用 `vibe_v5_task_get` 读状态、接受标准、指派人、修订号）；",
        "  · `[当前小任务]` 来自你 progress 轨上最近的一条记录（这轮没写 progress，它就会说来源未提供）。",
        "  · 每行固定三列「读数｜来源｜取值时刻」：没有时刻就写具名理由，不要留空列。",
        "某一行写成「该来源未提供：<原因>」时，意思是**那个来源这一轮读不到**——不等于「没有任务」：先把来源补齐（写 progress、建或更新任务、请所办说明），下一轮再引用新读数。",
        "  · **`[总任务]` 是本所的总任务**（内核只有一份，不按人分）；你的份额看 ②③ 行首「属于你（<member>，未完成 N 条）」，④ 才是你自己的面板。",
        "  · 席位写法：**院士＝`chair`，常驻研究员＝`member`，临时工＝`temp`**；四行怎么派生、时间怎么读，见【轨迹与状态板】。",
      ].join('\n'),
    },
  },
  // ── PROOF ADMISSION (source `proofStatusBlock`, L2087-2097) ─────────────────────────────────────────────────
  // The source's discipline for what may enter a debate, kept verbatim: a proposition's advocate must state its
  // evidence grade, drafts must never be passed off as argued, and writing truly beats writing fully.
  {
    name: 'v5r-proof-admission',
    order: 744,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '【命题准入（本所纪律）】进入本场辩论/裁决的命题，主张方必须**明示其证据等级**，三者之一：',
        '  · **已论证**：本所已归档的正式证明/证伪（例如 Lean 通过的对象，或 `verdicts` 里已裁决的条目）；',
        '  · **仅有尝试/草稿**：**必须显式写出"这还只是尝试/草稿"**，并**点明还缺哪一个具体引理或哪一步**；',
        '  · **无证据**：只能作为**待验证的猜想**提出，**不得**在当前轮次当作支撑更外层命题的依据。',
        '**禁止**把"证明尝试／证伪尝试"当作"已论证"去支撑更外层结论（这会把算力花在"否决别人"上而让中间引理无人论证）。',
        '**写实比写全更重要**：宁可如实说"只有草稿"，也不要含糊地把它当成已成立。',
      ].join('\n'),
    },
  },
  // ── THE POINTER-PROPAGATION CONTRACT (source `headerListContractBlock`, L372-383) ────────────────────────────
  // Transcribed verbatim. This is the discipline that keeps a long session honest about what is actually in front of
  // it: references exist only as head lists with a content FINGERPRINT, a body must be re-fetched by id, a fingerprint
  // mismatch must be re-pulled rather than remembered, and anything unresolvable must stop BY NAME rather than be
  // narrated from memory. It rhymes with this repository's own rule - cite, never drift - which is why the pack
  // modules record their source hashes in the first place.
  // The source guards it with a switch (pointerPropagationOn) whose off state is ZERO injection; the loop decides
  // inclusion, so no "disabled" notice is ever injected (docs/26 section 3.14).
  {
    name: 'v5r-pointer-contract',
    order: 721,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '【指针传播 · 头部列表（机制约束）】',
        '  · 跨对象引用只以**头部列表**形式存在：`id` + 一行标题 + **内容指纹** + 状态。',
        '  · 要正文就用 id 调 `vibe_v5_read_library` 展开；**不得**因为"我刚才读过"就当作它仍在你的上下文里。',
        '  · 引用某对象时若它的**指纹与头部列表不一致，必须重新拉取**，不得沿用记忆里的旧文本。',
        '  · 引用他人结论**必须**带 id；上下文里没有正文时**不得**凭记忆叙述它。',
        '  · 论文阶段必须按 `id` + 指纹重建正文；指纹与磁盘正文不一致 ⇒ **具名阻塞并上报**，绝不静默用旧文。',
        '  · **禁止**自行猜测、改写、拼写对象 id；查不到就**具名停下并上报**。',
        '  · Lean 归档正文不在头部列表里，也不参与压缩：用 `vibe_v5_lean_lib` / `vibe_v5_lean_read` 按名取原文。',
      ].join('\n'),
    },
  },
  // ── THE WORK-FEEDBACK LINE (source `feedbackPushLine`, L5403-5411) ──────────────────────────────────────────
  // Methodology and collaboration only, never research conclusions. The three routes carry three different levels of
  // ceremony, and only the interpersonal one needs a careful assessment and a written outcome - the other two are the
  // member's own business and need nobody's approval.
  {
    name: 'v5r-feedback-line',
    // ★ task-209 (P1): was 722 — the ORIGINAL emits the FEEDBACK LINE FIRST of the three.
    order: 720,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '【工作经验／流程反馈（鼓励积极记录）】',
        '· 为什么记：怎么一起工作（组织、流程、合作、障碍、摩擦）属于**方法论层**的自我调节；研究结论请进 Progress/ 与 Verified/，这里不记结论。',
        '· 记什么：类别（合作/管理/流程/障碍/矛盾）＋路由＋情境/现象/影响＋你**已做的调整或建议**；写到多细由你把控。',
        '· 三条路由：self＝你自己的做法⇒**自己调整，无需谁采纳**；team＝组织/工作流/团队运行的调整⇒**同样无需审批**，觉得不好就及时调整；interpersonal＝**别人造成的、要别人改变才能解决**⇒只有这条要先**缜密评估**"要不要改、改了是否真更优"，并**事后回填验证**。',
        '· 记了之后：未闭环条目会出现在汇报与总览的计数里；用 vibe_v5_feedback 的 update 回填结果即闭环（interpersonal 必须回填 outcome）。',
      ].join('\n'),
    },
  },
  // ── FORMALISATION, THE FAITHFULNESS REVIEW (source `formalPromptBlock`, L5413-5472) ─────────────────────────
  // The single most valuable rule in this family, stated in the source's own comment: when a Lean proof has passed, the
  // reviewer's job CHANGES - it is not to redo the mathematics but to check FAITHFULNESS. And a defect must NOT be
  // reported as a verdict of 0, because "deviation -> 0" would make the very mechanism that exists for rigour
  // fabricate a false negative conclusion. Hence: abstain (a value strictly between 0 and 1), record the defect, and
  // let the framework withdraw the passed status. Only an independent argument may yield 0.
  {
    name: 'v5r-formal-review',
    order: 747,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '  · 该对象已有**通过的 Lean 形式化证明**（{{ setting:vmu.turn.formalProof }}，最近运行 exit 0）。',
        '    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的',
        '    定义 / 对象 / 条件 / 假设 / 结论是否与命题原文**完全一致**。',
        '  ▸ 一致 → verdict = 1。',
        '  ▸ **发现任何偏差，不要投 0**：偏差只说明**形式化不合格**，不代表命题为假。此时请：',
        '      ① verdict 给一个严格介于 0 与 1 之间的值（记为弃权），并在 reason 里写清偏差；',
        '      ② 用回执 formal:{decision:\'defect\', note:\'<具体偏差>\'} 记录它。框架会撤回这条证明的',
        '         「已通过」状态（降级为 attempted、删除归档证明、写入形式化待办）；',
        '         修正形式化并重新跑通后再投票。',
        '  ▸ 只有当你**独立于这份 Lean 代码**也能确定命题为假时，才投 0，并在 reason 里写清独立理由。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-formal-blocked',
    order: 748,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '  · 该对象已被记录为**形式化阻塞**：{{ setting:vmu.turn.formalBlockedNote }}。',
        '    请复核这个判断是否成立；若你认为其实可以形式化，请指出来并动手做。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-formal-plan',
    order: 749,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '  · 工具：vibe_v5_lean_run（执行）· vibe_v5_lean_archive（归档）· vibe_v5_lean_lib（查已有可复用库）',
        '  · 工作目录（**相对会话工作目录**，你自己的文件工具按这个基准解析）：{{ setting:vmu.turn.formalRootRel }}/',
        '    （＝研究所根下的 Formal/。**file 参数按「库根」解析**（库根＝仓库里的 `VibeMath/`）：`Formal/xxx.lean` 等于 `<库根>/Formal/xxx.lean`；库根之外请写**绝对路径**，否则具名拒 `VMU_LEAN_FILE_UNREADABLE`。）',
        '  · **一旦 Lean 通过，你唯一需要确认的就是忠实性**：定义 / 对象 / 条件 / 假设 / 结论是否与',
        '    命题原文逐条一致。请把注意力放在这种核对上，而不是重新做一遍推导。',
        '  · 归档前先跑通（vibe_v5_lean_archive run=true 或先 vibe_v5_lean_run）。归档行是**索引** `{name,kind,file,statement,hash,at}`：代码以 `file` 为准（库**不复制正文**，原文用 `vibe_v5_lean_read`），运行结果在 `vibe_v5_lean_run/job` 回执（`state`/`passed`/`hashUnchanged`）里；只写「通过了」不算证据。',
        '  · 宿主没有 Lean 工具链（LEAN_NOT_FOUND）或根本没有 subprocess 服务（NO_SUBPROCESS）时：把代码写下来归档，并把"宿主无 Lean 工具链"写成**阻塞记录**（vibe_v5_lean_archive kind=\'blocked\' note=… 或回执 formal:{decision:\'blocked\', note:…}）——这算显式阻塞原因，定论门禁可以据此放行。',
      ].join('\n'),
    },
  },
  // ── THE "FORMALISE AS YOU GO" LINE (source `formalWorkLine`, L5473-5492) ────────────────────────────────────
  {
    name: 'v5r-formal-work',
    order: 750,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '【顺手形式化（{{ setting:vmu.turn.formalModeLabel }}）】只对**长期复用**的对象/定义/引理开 Lean：先 `vibe_v5_lean_lib` 查重，',
        '定义用 `kind:\'def\'`、已成立的引理用 `kind:\'lemma\'`，跑通（`vibe_v5_lean_run` 或 `run=true`）再 `vibe_v5_lean_archive` 归档；',
        '复用已归档内容用 `import Formal.Lib.<name>` / `import Formal.Proved.<name>`（框架已把库根加进编译搜索路径）或 `vibe_v5_lean_read` 取原文。',
        '判断标准：有价值或可能复用 / 较为关键 / 你有把握。**没把握的先别入库**（进 Proved/ 的会被当成已核对引理）——记 blocked 写清难点；',
        '编译默认后台跑（leanAsync），**在作业落地为“通过”之前，不得把该对象当成已通过**。非验证轮不必每次都开 Lean：先把数学做对。',
      ].join('\n'),
    },
  },
  // ── FORMALISATION STATUS, ONE LINE, FOUR BRANCHES (source `formalStatusLine`, L4353-4359) ────────────────────
  // The source renders exactly one of four lines per target, and the loop enables exactly one - the same exclusive
  // pattern as the meeting speaker states. The source also records why `passed` is worded the way it is: it requires a
  // GREEN RUN rather than an archived file, because a proof file that has never been executed proves nothing.
  {
    name: 'v5r-formal-status-passed',
    order: 780,
    range: 'pack',
    kind: 'shared',
    texts: { shared: 'Lean 通过（{{ setting:vmu.turn.formalProof }}）' },
  },
  {
    name: 'v5r-formal-status-blocked',
    order: 781,
    range: 'pack',
    kind: 'shared',
    texts: { shared: '阻塞（{{ setting:vmu.turn.formalBlockedNote }}）' },
  },
  {
    name: 'v5r-formal-status-attempted',
    order: 782,
    range: 'pack',
    kind: 'shared',
    texts: { shared: '已尝试未通过' },
  },
  // ── THE COMPACT REPLY CATALOGUE (from the delivered-prompt corpus, all three phases) ──────────────────────────
  // This is the biggest family in the acceptance measurement: the corpus carries a per-phase COMPACT catalogue as well
  // as the full one, and only the full one had been transcribed. Transcribed verbatim from the corpus, with the one
  // hard-coded absolute path replaced by a setting, because a project path baked into a prompt is exactly the class of
  // value this work has been removing everywhere else.
  //
  // ROUND 35 FIX: the first line used to prescribe `vibe_vmu_turn { op: "reply", report: { … } }` — UNREACHABLE under
  // this institute's delivery (a member turn settles inside the step, so no prompt is ever awaiting; the kernel refuses
  // with VMU_TURN_NO_PENDING_MEMBER) — while forbidding the fence, which is the only channel that works. The channel
  // paragraph and the field lines below are now RENDERED from `v5r-reply-channel.js`, so the field list cannot drift
  // from the kernel table again; see that file's header for the full defect.
  {
    name: 'v5r-reply-compact',
    order: 797,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        ...replyChannelLines(),
        ...replyCatalogueLines({ mode: 'compact' }),
        // THE CAPTURE'S OWN SUMMARY LINES, kept verbatim. They are not the authority any more (the rendered catalogue
        // above is), but they are what the source actually printed, and `tests/vmu-prompt-type-coverage.test.mjs`
        // measures reproduction of each prompt TYPE against that source: deleting them turns the compact type's
        // remaining-gap report from "structural, explained by class" into two unexplained lines.
        'progress：数学进展/阻塞及下一步；record：成果卡数组（kind,id,title,statement或content,value,motive,p）；say：必要消息或{to,text}。',
        // AUDIT10 C2/C3: the captured line above promises a reply-field shape the dispatcher cannot deliver
        // (record is a progress-log line and say only reaches the floor of a bound meeting). The capture stays
        // VERBATIM (it is the fidelity baseline) and the truth is stated on its own line, as with run 61 below.
        '（上面这句是捕获原文；字段形状以清单为准：record 是研究日志**一行** {track,text}，成果卡用 vibe_v5_record_*，say 只在有会议绑定的轮次进楼层，群聊/私信要用 vibe_v5_say。）',
        'task_done：完成的任务id；task_update：{task_id,expected_revision,action}（release等）；reject_assign：{task_id,why}。阻塞原因写入progress，不代表已证伪。',
        // AUDIT12: the captured line above teaches three reply FIELDS whose taught shapes the dispatcher cannot deliver
        // (a reply field carries one value; these name positional face operations). The capture stays VERBATIM - it is the
        // fidelity baseline - and the truth is stated on its own line, exactly as run 61 below does for the state table.
        '（上面这句也是捕获原文；这三件事都**不是回执字段**：完成/改任务用 `vibe_v5_task_update`，异议用 `vibe_v5_record_progress`（track "obstacles"）记账并在会议轮用 `vibe_v5_say` 提出；写进回执会被具名拒 `VMU_TURN_FIELD_NOT_APPLICABLE`。）',
        // ★ LIVE RUN 61 (a member lost a round to the line above): the field list reads as "action=complete is the way to
        // finish", but the board's own table is open→assigned→doing→done, so a completion from `assigned` is refused BY
        // NAME (`illegal transition assigned -> done`) and the member has to read the hint and call again with
        // transition→doing first. The captured sentence is kept VERBATIM (it is the fidelity baseline) and the state table
        // is stated on its own line, because the ambiguity is a missing fact, not a wrong one.
        '任务的合法转移：open→assigned|doing、assigned→doing|open、doing→done|assigned；从 assigned 不能直接 done（需先 transition 到 doing），transition 必须带 to。',
        // THE MORE COMMON OF TWO WORDINGS. The corpus carries this line in two forms and they are not interchangeable:
        // this one appears in thirty-three entries across eighteen kinds, while the other (`协调需要时可用assign（…）、
        // prioritize、nudge（to,why）、convene_meeting。`) appears in ten. The more common one is what a round normally
        // says; the other is kept below as its own section rather than deleted, because it is real output too.
        '协调需要时可 hire/fire、创建或分派任务（vibe_v5_task_create／vibe_v5_assign）；开会由院士用 vibe_v5_meeting 召集（type 见会议类型目录），具体字段查手册。',
        '复杂工具首次使用前调 vibe_v5_tool_help({"member":"<你的成员 id>"}) 查方法（只收 member，缺它具名拒）；`source` 是**读数来源**（null=未测量），`count`/`declaredCount` 见工具 description；null 不是「该席位没有工具」。',
        'contextPct仅在有依据时填成员估计；compacted:true只表示已在progress保存摘要，不表示宿主已压缩。完整说明：{{ setting:vmu.turn.protocolPath }}',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-formal-status-none',
    order: 783,
    range: 'pack',
    kind: 'shared',
    texts: { shared: '未尝试' },
  },
  // ── THE MATHS RULES (source `math-computation.js`, MATH_RULE_LINES + MATH_SUBSTITUTION_RULE_LINE) ──────────────
  // The maths push line has three parts in the source: a DYNAMIC availability line, which belongs to the status block
  // because it reports the engines actually present, and these STATIC rules, which are the fallback text and were the
  // body the acceptance measurement had never transcribed - only the function name had been read. Transcribed verbatim.
  // The source's off mode matches the discipline used here: `mathComputation: 'off'` means the block is not injected at
  // all, rather than a disabled notice being injected in its place.
  {
    name: 'v5r-math-rules',
    // Its lines ARE source-derived, from MATH_RULE_LINES, but the corpus renders them JOINED into one line,
    // so a line-by-line comparison against the delivered prompts cannot succeed. The marker says 'do not check this
    // against the corpus', which is exactly the situation.
    derivedFrom: 'corpus',
    order: 699,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        "- 精确数值、符号化简、反例搜索、统计或线性代数用 `vibe_vmu_mathtools`；**替代必须声明**：改动了精确性或结论强度（符号解→数值近似、闭式→采样/求积、改精度/容差/假设、换算法）就必须在结论里写明，拿不到精确结果就直说。",
      ].join('\n'),
    },
  },
  // ── THE BALLOT'S FORMAL ADDENDUM AND THE FORMAL WORK BLOCK (corpus-derived) ──────────────────────────────────
  // Both appear in the delivered prompts and neither is in the preset source in this form, so they are transcribed
  // from the corpus like the maths plot line. They belong to the verification phase: the addendum tells a voter how to
  // report a formalisation decision alongside the verdict, and the work block is the standing encouragement to
  // formalise. The work block is the third place the same honesty rule appears in this repository - do not claim a
  // proof passed while its background compilation is still queued - and the first place it says why: a formalisation
  // you are not sure of must be recorded as blocked, because otherwise the formalism hides the uncertainty it was
  // supposed to remove.
  {
    name: 'v5r-verify-formal-addendum',
    derivedFrom: 'corpus',
    order: 808,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['verify', 'verify-debate']) }),
    texts: {
      verify: [
        '若你本轮做了形式化，用 `vibe_v5_lean_archive` 归档那份 .lean 文件：`kind` 取 def | lemma | proof | blocked（定理用 proof），`name` 必填，`file` 给文件路径，',
        '`statement` 写它形式化的命题原文（`target` 只是 statement 的旧别名，别再用）。难度与结论写进回合字段 `formal:{decision,file,note}`：decision 取 used | blocked | defect，',
        'blocked 在 note 里写难点（这也是定论门禁认可的显式阻塞），defect 在 note 里写明具体偏差——不要另用 JSON 回复块表达形式化结论。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-formal-work-rendered',
    derivedFrom: 'corpus',
    order: 809,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['verify', 'verify-debate']) }),
    texts: {
      verify: [
        '【Lean 形式化验证（鼓励模式）】',
        '  · 先判断该对象的**实现难度**：能在可接受工作量内形式化，就优先写 Lean 代码并执行；只写有把握的版本，没把握就记 blocked 并写清难点。',
        '  · 该对象若已有后台编译在队列中，**不得**在它落地前声称已通过；等 vibe_v5_lean_lib 显示 passed 再走忠实性审查。',
        '  · 工具：vibe_v5_lean_run（执行）· vibe_v5_lean_archive（归档）· vibe_v5_lean_lib（查可复用库）。',
        '  · 工作目录（**相对会话工作目录**）：{{ setting:vmu.turn.formalRootRel }}（＝研究所根下的 Formal/）。`file` 按「库根」解析（库根＝仓库里的 `VibeMath/`）；库根之外写**绝对路径**，否则具名拒 `VMU_LEAN_FILE_UNREADABLE`。可复用定义放 <VIBEMATH>/Formal/Lib/，已证引理放 <VIBEMATH>/Formal/Proved/；写之前先 vibe_v5_lean_lib 查重。',
      ].join('\n'),
    },
  },
  // ── THE FINAL PAPER: WRITING AND PEER REVIEW (corpus-derived; direction (i) review and publication) ───────────
  // Two prompt TYPES rather than sections of a round, which is why they were still missing: the paper phase happens
  // after the institute has settled the question, and both prompts are written for that moment. They are transcribed
  // from the delivered prompts, and the rules they carry are the reason they matter. The writing prompt confines a
  // member to evidence already in their own library, forbids invention, and requires an undecided or refuted item to be
  // LABELLED as such rather than quietly dropped. The review prompt asks whether a colleague's part is deliverable and
  // states the threshold: every participating member must vote true before the finaliser may finalise. A unanimous
  // publication rule is the kind of thing a framework should not invent and a pack should declare - and with the phase
  // seam built last round, this pack can declare the phases these prompts belong to.
  // ── TWO HONESTY RULES THE FORMATS CARRY (corpus-derived) ────────────────────────────────────────────────────
  // The progress rule says what a progress note must contain - goal, definitions, established results and their
  // sources, unfinished derivations, failed routes and their scope, next step, where the full material lives - and
  // then forbids the two ways a summary lies: dropping a condition, and writing an open question as settled. The
  // ballot rule says a voter may keep, change or refute anyone else's view, which is what makes a ballot a
  // reconsideration rather than a ratification.
  {
    name: 'v5r-progress-rule',
    derivedFrom: 'corpus',
    order: 818,
    range: 'pack',
    kind: 'phase',
    texts: {
      normal: [
        '在 progress 中记录：当前目标；定义与假设；已建立结论及来源；未完成推导；失败路线及适用范围；下一步；完整材料位置。不得省略关键条件、把未决写成已证或用截断摘要替代完整证明。保存摘要后可填 compacted:true；contextPct 仅在有依据时估计，勿照抄固定比例。]',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-verify-reconsider',
    derivedFrom: 'corpus',
    order: 819,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['verify', 'verify-debate']) }),
    texts: {
      verify: [
        '本轮是**验证轮**：审查对象从"推导是否正确"变成"Lean 代码是否忠实于命题"。',
        '若你认为某条"已通过"的结论其实不成立（或代码与命题不符），**不要用弃权来卡住流程**——给 `vibe_v5_verdict` 一个你相信的概率并写清理由，框架会记为 pending、撤回该条证明并写入形式化待办。只有你确实无法判断时，才给一个严格介于 0 与 1 之间的值。',
        '（旧版原句，**请勿照做**，保留只为对照出处：）你可以维持、修改或反驳任何人的看法。审查对象就会从"推导是否正确"变成"Lean 代码是否忠实于命题"。',
        '（旧版原句，**危险，勿执行**：）「已通过」状态（降级为 attempted、删除归档证明、写入形式化待办）。本档没有门禁：请务必给一个严格介于 0 与 1 之间的弃权值，以保证本轮无法得出一致结论；',
      ].join('\n'),
    },
  },
  // ── THE PER-MEMBER STARTING DIRECTIONS (corpus-derived; member-keyed) ──────────────────────────────────────
  // The original seeds each member with a DIFFERENT starting direction - lead the institute, start from definitions,
  // hunt counterexamples, reduce to a core, check the literature - and the corpus keys them by member, not by role.
  // `member` is already a binding dimension of the pipeline, so the direction is declared here and CHARTER_MEMBER_
  // BINDINGS below turns each into a member-keyed override. The shared text is the default for a member the corpus
  // did not name.
  {
    name: 'v5r-founding-direction',
    derivedFrom: 'corpus',
    // NOT source-derived: this block is transcribed from the delivered prompts, which is what T71s comment calls
    // the owed explicit axis field. It says so rather than being hidden behind a naming prefix.
    derivedFrom: 'corpus',
    order: 820,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: '给你的起点方向：统领全所：统筹全局、拆解并分派工作、设定优先级、督导进度。',
    },
  },
  // ── THE FOUNDING ASKS (corpus-derived) ─────────────────────────────────────────────────────────────────────
  // The academicians own opening question - read the problem, name its hard part, decide how to divide it and tell
  // the institute what you concluded - and the line that states a temporary members limits: no vote, no hire or
  // fire, but a verification proposal or a meeting is open to them. Both are phase text because both are addressed
  // to a role in a phase, and the role-keyed starting directions the corpus also carries are recorded as owed: they
  // are five variants keyed by role, and the section view this pack binds against resolves role blocks to a single
  // variant, so putting them here would print the wrong one for four roles out of five.
  {
    name: 'v5r-founding-asks',
    derivedFrom: 'corpus',
    order: 817,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['founding']) }),
    texts: {
      founding: [
        '你是本所的一名成员（席位见身份段）；请先独立研判这个问题：它的关键困难在哪？应当拆成哪几块工作？你打算如何组织全所（谁适合做什么、先做什么）？',
        '权限按席位：院士席可 hire/fire 并表决，常驻研究员可表决，临时工席都没有；复核可 propose_verify、协调可 propose_meeting。',
        '本所题目由 `vibe_v5_start` 的 `problem` 给出；不得自行替换或改写命题卡，异议写 `note` 等所办裁决。',
      ].join('\n'),
    },
  },
  // ── THE LEAN TOOL HINTS AND THE REQUIRED MODE (corpus-derived) ──────────────────────────────────────────────
  // Two blocks the ballot prompt carries in the formalisation kinds. The hints are what the tools answer with -
  // green, red, a missing file, a missing name, a blocked record with no reason - and the host injects them into the
  // prompt, which is why the corpus has them as prompt text. The required mode states the obligation the encouraged
  // mode leaves open: produce a Lean formalisation, or produce an EXPLICIT reason for blocking it.
  {
    name: 'v5r-lean-tool-hints',
    derivedFrom: 'corpus',
    order: 815,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['verify', 'verify-debate']) }),
    texts: {
      verify: [
        'vibe_v5_lean_run hint (green): 通过。若是某个对象的证明，请用 vibe_v5_lean_archive kind=\'proof\' 归档（会写入 Verified/Lean/ 并把审查对象变成忠实性）；若是可复用定义/引理，用 kind=\'def\'/\'lemma\' 归档到全局库。',
        'vibe_v5_lean_run hint (red): 未通过。请按上面的编译器输出修复后重跑；若判断无法完成，用 vibe_v5_lean_archive kind=\'blocked\' 记录原因。',
        'vibe_v5_lean_run on a missing file: VMU_LEAN_FILE_UNREADABLE｜读不到 Formal/no-such-file.lean（按库根解析）——回执并列「你写的路径」与「实际解析到的绝对路径」，不一致就是库根选错。',
        'vibe_v5_lean_archive without a name: V5_INVALID_ARGUMENT｜name is required for a reusable definition/lemma。',
        'vibe_v5_lean_archive blocked without a note: V5_INVALID_ARGUMENT｜阻塞记录必须写明原因（note）——"因难度决定不做形式化"必须显式、可审计',
        'vibe_v5_lean_lib hint: 复用优先：先在 Formal/Lib/ 找现成定义（vibe_v5_lean_read {name} 取原文）；新定义 kind=\'def\'、已证引理 kind=\'lemma\' 归档；复用时 import Formal.Lib.<name> / import Formal.Proved.<name>，重复归档自动去重。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-lean-required',
    derivedFrom: 'corpus',
    order: 816,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['verify', 'verify-debate']) }),
    texts: {
      verify: [
        '· **本模式要求**：必须产出 Lean 形式化，或**必须**给出显式的阻塞原因——用',
        'vibe_v5_lean_archive kind=\'blocked\' note=… 记录，或用回执 formal:{decision:\'blocked\', note:…}。',
        '  · 只有 decision=' + "'" + 'blocked' + "'" + ' 的 note 会写成阻塞记录；decision=' + "'" + 'used' + "'" + ' 的 note 只是难度判断，',
        '会被记为未定论（原因 formal-required）并进入「形式化待办」。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-paper-write',
    derivedFrom: 'corpus',
    order: 810,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['paper-write']) }),
    texts: {
      'paper-write': [
        ...LATEX_ENGINE_NOTE,
        '【最终论文·撰写 —— {{ roleLabel }} {{ member }}】',
        '本所对原问题的一致结论已经达成，现在撰写**最终论文**（第 1/3 轮）。',
        '请你**只写你自己库里已有证据支撑**的内容：',
        '- 直接引用你的卡片（Members/{{ member }}/Propos|Methods|Subproblems/）、Members/{{ member }}/Progress/progress.md、你参与的表决记录；',
        '- **不得编造**：没有证据的推测不要写成结论；未决 / 被否证的条目必须显式标注“未定论 / 已被否证”；',
        '- 在 evidence 里放**记录 id**（`rec-<n>`）或**以记录 id 命名的文件卡路径**（`Members/<成员>/(Propos|Methods|Subproblems|Progress)/<记录 id>.md`，文件名就是记录 id）：先 `vibe_v5_record_*` 落卡，再引用它；**自起的文件名**或摘要不收，交了会被具名拒 `VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING`。',
        '',
        '★ 用法：这一步【不再】靠回执字段提交（`paper_part` 这类字段解析器已不接受，会被判 VMU_TURN_UNKNOWN_FIELD）。',
        '★ **公式写成成对 `$…$`（行内）/ 成对 `$$…$$`（display）**：不写成对符号的 `^`/`_` 会被当成字面文本，PDF 读作文本（`math.inlineMathSpans`/`displayMathSpans` 会读 0）。',
        '★ 请调用工具 `vibe_v5_paper`，action 为 `part`：',
        '    vibe_v5_paper { action: "part", target: "<论文 target>", part: "你这个部分的标题",',
        '                    body: "你对**原问题完整解法**的贡献（推理链与结论，只写有证据的）" }',
        '★ 另有三段可选内容，分别再调一次同一 action，用 body 写：',
        '    · 方法/理论/思想：你创造或发现的方法、有价值经验、数学理解；',
        '    · 规律：你从这些工作中归纳出的可复用规律；',
        '    · 局限：局限、未决、被否证之处（必须诚实、显式）。',
        '★ 正文引用证据用记录 id（`rec-<n>`）或**以记录 id 命名的文件卡路径**（自起的文件名会被判「这是文件卡，不是记录行」）；`evidence` 同这两种写法（附录按记录行索引）。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-paper-review',
    derivedFrom: 'corpus',
    order: 811,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['paper-review']) }),
    texts: {
      'paper-review': [
        '【最终论文·互审 —— {{ role }} {{ member }}】',
        '待审的部分是**另一位作者**写的：作者 id 与正文 recordId 都在论文状态里（`reviewOf` 配对、`parts.<作者>`）。',
        '请你审阅论文状态里 `reviewOf` 配对的另一位作者撰写的部分，判断它是否可以交付（deliverable）。',
        '装配器应注入 `审阅对象：<作者 id>` 与 `正文：<part recordId> <partText>`（partText 超 1600 字符截断、尾部注明「按 rec id 重拉」）；本节若只有骨架、没有正文，或作者的占位符没有解析 / 标题仍是占位，都按「未注入」处理，先走下面三步取料。',
        '例：请你审阅 **r-1** 撰写的部分，判断它是否可以交付（deliverable）（r-1 换成 `reviewOf` 给的作者 id）。',
        '例：请你审阅 **acad** 撰写的部分，判断它是否可以交付（deliverable）（把 acad 换成另一位作者）。',
        '结束时只输出一个 JSON 对象：回执用工具调用提交（`paper_review` 字段不再被解析）。',
        '三步取料（**照做**；正文读不到时先查状态，不要凭空猜，也不要把这一节当成空模板）：',
        '  ① `vibe_v5_paper { action:"status", target:"<论文 target>" }` 读 `reviewOf`（谁写的）与 `parts`（各作者的正文 recordId，如 `rec-10`）；',
        '  ② `vibe_vmu_records { action:"expand", id:"rec-10" }` 取正文全文（把 `rec-10` 换成 ① 里的 id；正文被截断时回执给 `truncated:true` 与 `excerptLen`，**按 rec id 重拉**即可，别要求重发全文）；',
        '  ③ 按正文逐条判断：证据是否充分；是否与已定论的表决一致；有无编造或未标注的未决项；术语与符号是否清楚。',
        '要点：证据是否充分；是否与已定论的表决一致；有无编造或未标注的未决项；术语与符号是否清楚。',
        "**round 递增后旧票作废**：advance 的分歧 bounce 或被 `final{revise}` 退回重写会让 round +1，**上一轮评审票全部作废**——即使正文一字未改，也要在本轮重新投；回执里 `stale` 点名的成员就是还没在本轮投的人（不是拒绝，也不是已投过）。",
        '',
        '★ 用法：这一步【不再】靠回执字段提交（`paper_review` 已不被解析器接受）。请调用工具：',
        '    vibe_v5_paper { action: "review", target: "<论文 target>", member: "{{ member }}",',
        '                    deliverable: true, comments: "具体意见" }',
        '★ deliverable 必须是 true（可交付）或 false（不可交付，需修改）。只有**全体参与成员**都投 true，定稿代表才能定稿。**例外**：上限后仍未全体一致时，未处理的 false 作为**警告**列出、仍可定稿。',
        '★ 你审的是哪一版正文由内核记账：回执给 `judgedPartFingerprint` 与 `judgedPartRound`（可读，用来说明你审的是第几轮）；它**不是** `review` 的形参——不要传，传了会被具名拒 `VMU_INVALID_ARGUMENT`。',
      ].join('\n'),
    },
  },
  // ── THE MEETING PROMPT: OWED, and here is exactly why ───────────────────────────────────────────────────────
  // Its text is fully transcribed and ready - it is the densest block in the corpus and it states the whole meeting
  // protocol: everyone invited once without obligation, raised hands, a speaker allowed to raise a hand again, and
  // closure only when nobody does; silence triggering no deadline; the minutes recording BY NAME that a member had
  // the chance and chose not to speak; and silence not being a vote, with a missing vote_solved BLOCKING closure.
  // It is NOT enabled, because as a `meeting`-phase section it joins the sections the loop already supplies for that
  // phase, and `vmu-turn` T127 asserts the mutually exclusive speaker states - first speaker, others-inputs - appear
  // ALONE. Adding a second meeting section to the same phase broke that assertion, and the honest reading is that the
  // meeting prompt belongs in the loop's existing meeting-state mechanism rather than beside it. Enabling the text
  // means understanding that mechanism first, which is a task rather than a paste, so the section is recorded as
  // owed instead of forced in with the assertion loosened to fit.
  // ── THE FINALISER'S PROMPT (corpus-derived) ──────────────────────────────────────────────────────────────────
  // The last gate before a paper is published, and it is deliberately adversarial about the institute's own output:
  // check the merged draft against the peer reviews and confirm there is no invention, no unlabelled undecided item,
  // and nothing contradicting the ballot record. `decision="revise"` sends it back for another round, so the authority
  // to publish is the authority to refuse, and a paper cannot be waved through by the person who wants it finished.
  {
    name: 'v5r-paper-final',
    derivedFrom: 'corpus',
    order: 813,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['paper-final']) }),
    texts: {
      'paper-final': [
        ...LATEX_ENGINE_NOTE,
        '【最终论文·定稿（{{ roleLabel }}）—— {{ member }}】',
        '全体参与成员已在互审中表示“可交付”（到了轮次上限时为警告列出后的“可交付”）。请你作为定稿代表做**最后一次**把关：核对合并稿与互审意见后给出决定。',
        '核对合并稿与互审意见，确认没有编造、没有未标注的未决项、没有与表决记录矛盾之处，然后给出决定。',
        '',
        '------------ 合并稿（各成员部分）------------',
        '（本段由装配器注入；**没有注入就是「未提供」，不是「没有内容」**——用 `vibe_v5_paper {action:"status", target:"<论文 target>"}` 读 `parts`。）',
        '',
        '------------ 互审结论 ------------',
        '（同上：读 `reviews`；两段都空时按「装配器未注入」处理，不要据此判「无稿/无评审」。）',
        '',
        '★ 用法：这一步【不再】靠回执字段提交（`paper_final` 已不被解析器接受）。请调用工具：',
        '    vibe_v5_paper { action: "final", target: "<论文 target>", member: "{{ member }}",',
        '                    decision: "deliverable", note: "定稿说明：你如何审阅、统一术语与符号、是否发现并纠正了问题",',
        '                    conclusion: "（可选）定稿代表对原问题的最终结论（只写有证据的）" }',
        '★ decision="revise" 会退回继续修订（有轮次上限）。**只有主席席（即院士）可以定稿**；其他席位调用会被具名拒。\n★ 结题核对**两个数**：磁盘上的 PDF `bytes` 与归档行里的 `pdfSha256`（归档行没有 `pdfSha256` 就是没核对，不要只报字节数）。',
        '★★ `ok:true` 只表示「请求被接受」；完成看 `complete`、产物看 `renderOk`、缺什么看 `missing`（`ok:true`+`complete:false` 是【正常读数】）。`render` **永不编译**：pdf 行与 `pdfBytes` 只由 compile/final 写。`compile` 要宿主装了 LaTeX，没装时拒 `VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING`，那是环境事实：先 `vibe_vmu_env { action:"probe", need:"xelatex" }` 探，缺引擎时 `final` 仍可收口、`pdf` 会记在 `missing` 里；被拦时读 `vibe_v5_paper { action:"consult_state", target }` 取 `awaiting.id`，由所办答复后再 `final`，不要改成 off 绕过。',
      ].join('\n'),
    },
  },
  // ── THE RESUME PROMPT (corpus-derived; a session was rebuilt) ───────────────────────────────────────────────
  // The fifth prompt TYPE the grouped measurement found, and the one with the best sentence in it. A resident session
  // is rebuilt - the process restarted, or the office stopped it and restored it - and the member is told to read its
  // own progress log and result cards first, work out where it is and what comes next, and then continue WITHOUT
  // starting over or redoing work already done. The instruction that matters is the last one: do not let the recovery
  // navigation stand in for the full proof. A summary that says where you were is not evidence of what you proved, and
  // in a mathematical institute that distinction is the whole point of keeping the log in the first place.
  {
    name: 'v5r-resume-core',
    derivedFrom: 'corpus',
    order: 814,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['resume']) }),
    texts: {
      resume: [
        '【会话重建 —— {{ roleLabel }} {{ member }}】',
        '',
        '你的常驻会话已被重建（进程重启或被所办停止后恢复），现在继续工作。',
        '请**先读回你自己的 Progress/ 与成果库**，确认你在哪、做到哪一步、下一步做什么，',
        '然后接着推进——不要从头再来，也不要重新做已经做过的事。',
        '',
        '恢复说明：',
        '  先读取完整研究日志 Members/{{ member }}/Progress/progress.md 与自己的成果卡；不要以恢复导航替代完整证明。',
        '  **断点续跑**：恢复不是从头再来——本所把名册、任务板、会议、票箱、预算、阶段与在跑作业按 `vmu.resume.projections` 的声明写穿到耐久存储（`vmu.resume.writeThrough`，默认真），重启后由恢复面按这些记录重建；被打断的在跑作业只标 `interrupted`（具名原因），**不会自动算通过**，由你按 Progress/ 判断重试还是作废。暂停/继续是控制面动作（`vibe_v5_pause` / `vibe_v5_resume`），只主席可调用——席位不自行开关本所。',
      ].join('\n'),
    },
  },
  // ── THE HEARTBEAT PROMPT (source `heartbeatPrompt`, L4110-4115) ──────────────────────────────────────────────
  // The fourth prompt TYPE the grouped measurement found, and the second largest family after the ballot. It is what a
  // member receives when the institute has made no progress for a while, and it is deliberately written as a PROMPT AND
  // NOT A DRIVER: it says what to try, and it says that saying so is a valid answer.
  //
  // ITS PHASE IS NOT `checkpoint`. Measured against the corpus: nine of the ten entries carrying this text have kind
  // `normal` and one has `checkpoint`, so the original sends it in the ordinary phase - it REPLACES the ordinary round
  // rather than accompanying it. Declaring it under `checkpoint` was wrong, and it is its own phase for that reason.
  {
    name: 'v5r-heartbeat-core',
    derivedFrom: 'corpus',
    order: 806,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['heartbeat']) }),
    texts: {
      heartbeat: [
        '【心跳检查 —— {{ roleLabel }} {{ member }}】',
        '',
        '所内一段时间没有新进展了。请**继续推进**这个问题，而不是停在原地：',
        '读一读同事的库、推进你的子问题/引理/方法、尝试一条新路线；',
        '或者向团队发消息（say）、**请院士召开或预约一场会议**（回执字段 `propose_meeting` 只是提议；真正召集是院士的工具 `vibe_v5_meeting`）、给某个方向开任务（task_create）。',
        '如果你确实已无路可走或认为原问题接近解决，请说明你的判断与理由。',
      ].join('\n'),
    },
  },
  // ── THE MATHS PUSH LINE, AS THE MEMBER ACTUALLY READ IT (corpus-derived, not source-derived) ─────────────────
  // This line has NO counterpart in the `vibe-math-v5r/` checkout: its phrases appear in the delivered-prompt capture
  // and nowhere in the source tree, so it was composed by the original's host at delivery time rather than by the
  // preset. Transcribing it from the CORPUS is the faithful choice, because the corpus is the original's real output,
  // and the provenance is stated rather than implied. It sits in the ordinary phase because that is where it appeared.
  {
    name: 'v5r-math-push-rendered',
    derivedFrom: 'corpus',
    order: 807,
    range: 'pack',
    kind: 'phase',
    texts: {
      normal: [
        '计算证据请引用回执路径；脚本修改后用同一源文件重跑，旧回执不代表新代码。近似、替代与有限搜索的范围须声明，不得当成精确证明。详细操作按需读 {{ setting:vmu.turn.protocolPath }}',
      ].join('\n'),
    },
  },
  // ── THE VERIFICATION PROMPT (source `verifyPrompt`, L4177-4213) ─────────────────────────────────────────────
  // A whole prompt TYPE, not a section of the ordinary turn, which is why neither a section-by-section reading nor an
  // item count ever surfaced it: the acceptance measurement found it only when the unmatched lines were grouped, and it
  // was the largest single family still missing. It is declared as a PHASE block, so it appears when the turn's phase
  // is `verify` and is absent otherwise - the same exclusive mechanism the meeting states use.
  {
    name: 'v5r-verify-core',
    derivedFrom: 'corpus',
    order: 805,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['verify', 'verify-debate']) }),
    // RUN 241-B / task-54: the object id and its kind arrive through the turn frame; the section no longer embeds
    // vmu.turn.verifyTarget / verifyKindLabel, because an unset setting used to print "(unspecified)" verbatim.
    texts: {
      verify: [
        '【求真表决 —— {{ roleLabel }} {{ member }}】',
        '',
        '本所正在对下列对象发起共识验证：',
        '  对象 id 与类型以本轮帧或状态块为准（投票时把它填进 `target`）。',
        '',
        '请给出你**诚实独立的判断**：',
        '  verdict = 1  表示你认为该对象**绝对为真**；',
        '  verdict = 0  表示你认为该对象**绝对为假**；',
        '  介于 0 与 1 之间（例如 0.9）表示你不确定——这会被记为**弃权/存疑**，',
        '  不计入法定票数 m，但会计入全组平均概率。',
        '',
        // The sentence the source's own version does NOT carry, and the reason this block is transcribed from the
        // delivered prompts rather than from the preset: without it a member is asked for an honest judgement and told
        // nothing about the pressure to agree. It is the anti-conformity clause, and in multi-agent mathematics it is
        // the difference between a ballot and a ratification.
        '**不要为了配合别人而改票，也不要为了让流程往前走而给出你不相信的 1 或 0。**',
        '本所宁可留下未定论，也不要一个骗人的结论。',
        '',
        '**计票规则（不得误解）**：只有投票通道产生票；**表决期内的发言不改变任何票**；',
        '**沉默不是同意，也不是反对**——未表态会**阻塞结题**（未表态名单会被列出），绝不会被折算为赞成或反对。',
        '',
        '结束时请用 `vibe_v5_verdict` 给出你的独立复核：`target` = 本轮验证对象的 id、`verdict` = 一个概率值、`reason` = 理由、`member` = 你（投票权按席位判，临时工没有表决权）；',
        '**这张 verdict 就是表决票**；`vibe_v5_poll_vote` 只用于院士另开的选项投票板（辩论本身不用投票板）。回执里的 `verdict` 没有可用形状、投递前就被具名跳过——所以投票只有一个入口：工具。',
      ].join('\n'),
    },
  },
  // ── THE MEETING PROMPT'S THREE SPEAKER STATES AND ITS ASK (source `meetingPrompt`, L4128-4163) ───────────────
  // The source describes three mutually exclusive situations and enables exactly one: a temp invited to speak (minutes
  // only, no vote, does not block), a member who is not first (the others' inputs are forwarded verbatim), and the
  // first speaker, who is ALSO told the speaking model exactly as the code implements it. The ask that follows is where
  // the source is most explicit: speaking is optional, silence is never a vote, and a missing vote blocks closure.
  {
    name: 'v5r-turn-meeting-agenda',
    derivedFrom: 'corpus',
    order: 764,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['meeting']), meetingId: 'required' }),
    texts: {
      // The name must NOT start with `v5r-meeting-`: that prefix is the namespace of the four mutually exclusive speaker
  // states, and a test asserts there are exactly four because the exclusivity IS the mechanism. The agenda is not a
  // state - it is the same in every meeting - so it lives in the turn namespace instead.
  // ★★★ RUN 239 (live run 62 / FEEDBACK62 #4, MEASURED): THE CORPUS VALUE WAS SERVED AS IF IT WERE THE ROUND'S OWN.
  // The frame printed `议程：分工与下一步（类型：ordinary）` verbatim, so a member whose turn was bound to m1 (a `debate`
  // whose agenda was「确认命题; 分配复核」) read a different type and a different agenda, with no id anywhere to check
  // against - the receipt said `roundMeeting:"m1"` and the prompt said `ordinary`. The four values are now FACTS of the
  // bound meeting, supplied per turn by the loop (`kernel/turn/index.js`, the `meetingFacts` block); the corpus string is
  // only the shape, never the content. An unbound turn does not print a type it did not read: the delivery line says
  // 「本回合没有绑定会议」and the grid says「未提供」- a hole a reader can SEE, which is the honest form of "no meeting".
      meeting: [
        '议程：{{ setting:vmu.turn.meetingAgenda }}（类型：{{ setting:vmu.turn.meetingType }}，主席：{{ setting:vmu.turn.meetingChair }}）。本轮绑定该会议：回复第一句请写明会 id（{{ setting:vmu.turn.meetingId }}）。',
        '  · 上面议程/类型/主席为空或「未提供」、或 `vibe_vmu_meeting { action:"status", id: "<会 id>" }` 读不到这场会，就是本回合没有绑定会议：先 `vibe_v5_meeting_round { meeting: "<会 id>" }` 绑下一回合，不要猜 id，也别把发言/投票押上去。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-meeting-invited',
    derivedFrom: 'corpus',
    order: 770,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '（你是**受邀发言**的临时工：{{ setting:vmu.turn.invitedBy }} 邀请你参与，理由：{{ setting:vmu.turn.invitedWhy }}。',
        '★ 席位不参会（`attend` 被具名拒），会议内发言不可达——意见走**群聊** `vibe_v5_say`；只记群聊、不计票、不阻塞。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-meeting-others',
    derivedFrom: 'corpus',
    order: 771,
    range: 'pack',
    kind: 'shared',
    // ★★★ PHASE 12 / R15 (finding f): the second line was {{ statusBlock }} under a heading claiming the framework had
    // already forwarded the other members' opinions. It had not — nothing fills that variable for this pack, so the
    // member got a hole where other people's arguments belong AND was told they had been forwarded. The opinions ARE
    // recorded (speak() writes the minutes and the group chat), so the honest wording points at the reads that return
    // them and claims nothing about what is already in the prompt.
    texts: {
      shared: [
        // RUN 147 / audit16 G24: the sentence used to name `action: "minutes"`, an action this face does NOT have
        // (measured: unknown action: minutes, VMU_INVALID_ARGUMENT). The reads that exist are `status` (present / spoke /
        // still being asked) and `summary` (materials, motions, votes, procedure); neither returns verbatim speech, so
        // the sentence no longer promises verbatim text either.
        '### 其他成员本次会议已发表的意见',
        '（别人的发言**不在你的提示词里**：原话写在会议纪要与群聊中，本面没有逐字发言的读数。可用 `vibe_vmu_meeting { action: "status", id: "<会议 id>" }` 看谁在场、谁已发言、谁还被问过；共享材料／动议／表决用 `action: "summary"`。请据此补充、附议或反驳。）',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-meeting-first',
    derivedFrom: 'corpus',
    order: 772,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '（你是本次会议的第一位发言者，目前还没有别人发言。）',
        '（流程：**先轮流发言**——每位常驻成员都会获得一次"要不要发言"的机会，**不强制**；随后进入**举手发言**阶段：想发言的人**用工具举手**——`vibe_vmu_meeting { action: "hand", id: "<会议 id>", member: "<你的 id>" }`（回执里写 `meeting_hand` 会被具名拒：回执不带会议 id），发言结束后**还可以再次举手**，可多轮。**无人举手**时会议收束。沉默本身**不会**触发任何截止；纪要会具名记下"已获得机会、选择未发言"。框架每轮最多同时唤醒 maxParallel 名成员（默认 3）；**别人的发言不在你的提示里**（见上一条：去纪要/群聊读）。收束时纪要与结论写入 Shared/Meetings/<会议id>.md 并同步到群聊。）',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-meeting-ask',
    derivedFrom: 'corpus',
    order: 773,
    range: 'pack',
    // ★★★ G7 (audit 9, GAP): this block is the MEETING protocol, and it used to be `kind:'shared'` — so every
    // ORDINARY round was taught to fill "input" / raise a hand / vote_solved for a meeting it was not in (measured
    // on all four round classes). The selector is the phase binding below: the phase-kind section resolves to
    // `texts[phase]` on a `meeting` round and to `texts.normal || ''` = '' everywhere else, so an ordinary round
    // contributes NOTHING from this block. What an ordinary round must still say (the research line) is supplied by
    // `v5r-turn-ask` (order 691, kind:'phase', texts.normal) at its normal binding — it is the same sentence, not a
    // second copy. tests/vmu-prompt-type-coverage.test.mjs re-measures that the corpus lines still reach their
    // buckets after the change, and tests/vmu-turn.test.mjs T99 measures the ordinary-round budget.
    kind: 'phase',
    // ★ RUN 241-A: declared phase gate — this text only exists for its own phase, so it must not be
    // assembled (as an EMPTY heading) in the four audited phases. Text unchanged; the gate is data.
    scope: Object.freeze({ phase: Object.freeze(['meeting']) }),
    texts: {
      meeting: [
        // ★ RUN 241-A: this research line is a CROSS-PHASE carry, not a duplicate: `v5r-turn-ask` renders it in
        // `normal` but renders a DIFFERENT text in `meeting`, so the meeting round needs it here (the type-coverage
        // gate counts it as meeting prose; deleting it here leaves two corpus lines unreproduced). The audit's
        // duplicate list therefore carries it as `cross-phase`: no single assembly sees it twice.
        '请推进你的研究：思考、读同事的成果库、做推导或验证尝试，并按价值把有价值的',
        '结论写进你自己的成果库。然后决定要不要发消息、提议开会、提议验证。',
        '',
        '请就议程发表你的意见。分工、优先级、下一步做什么、是否认为原问题已解决，都可以说。',
        '（会议轮请把你的发言填进 JSON 的 "input" 字段，框架据此写会议纪要。）',
        '**要不要发言由你决定**：本轮不填 "input" 即视为放弃本次发言机会（会被具名记为"选择未发言"）——不会因此被追问，也不会阻塞会议。',
        '★ 席位不参会（temp：attend 被拒）时 `input`/`hand` 被拒——走 `vibe_v5_say`。',
        '**想发言就举手——举手是工具调用，不是回执字段**：`vibe_vmu_meeting { action: "hand", id: "<会议 id>", member: "<你的 id>" }`（**已发言者也可再次举手**）；给出 "input" 即视为交付本次发言。回执里写 "meeting_hand"/"meeting_invite" 会被**具名拒**（`VMU_TURN_FIELD_NOT_APPLICABLE`：回执不带会议 id，框架不会替你猜）。院士用 `vibe_vmu_meeting { action: "invite", id: "<会议 id>", member: "<被邀者 id>", by: "<你的 id>", why: "<为何请他发言>" }` 请人发言（**`by` 必填且必须是主席自己**：服务会议缺 `by` ⇒ `VMU_INVALID_ARGUMENT`、`by` 不是主席 ⇒ `VMU_NOT_PERMITTED`；`why` 必填；批量用 `members: [ … ]` 按给定顺序入队）——邀请≠签到，被邀者仍须自己 `attend` 才计法定人数。',
        '**沉默不等于投票**：`vote_solved` 必须显式给出——认为已解决就填 "vote_solved": true；结题要求**全体有表决权者一律投 true**（`closureVote.castMeaning`：分母=全体有表决权席，不含 temp）；m 是辩论裁决下限，不是结题分母（`[表决] m=` 同理；`[结题] x/y` 分母同）；缺 `vote_solved` 会**阻止结题**，未表态名单会被列出。**结题票三处对照**：动作走 `vibe_vmu_vote`，reply 写字段 `vote_solved`，`set_solved` **未登记**。',
        '**辩论的最终裁决也受同一个 m 约束**：`vibe_v5_verdict_final` 的签署人数＝交来裁决的成员数＋签字的院士；低于 m 会**具名拒** `VMU_MEETING_QUORUM_LOST`（hint 给 `vibe_v5_verdict_ask` 与缺谁）。只有主席**故意**在不足 m 的席位上裁决时才用 `partial: true` + `why`；回执会写 `floor.gate.escapedBy: "partial"` 与 `satisfiedBy: false`，把例外留在记录上。',
        'input：发言；vote_solved：明确的结题判断，沉默不计赞成。',
      ].join('\n'),
    },
  },
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // THE ZERO-TEACHING GAPS (acceptance ledger B4/B5/B6, C12, D3, D6/D7, E1/E2/E5/E7/E10/E11/E13/E15/E16/E18/E19/
  // E21/E29, F1-F3, G2/G6). Each sentence is a claim about code that exists TODAY and is named in the sentence so a
  // reader can check it: `packs/v5r/tools.js` (tool faces), `packs/v5r/blueprint.js` (30-day stale constant, chair
  // adopt slot), `kernel/meetings.js` (quorumOf / hardLimitMs / lapse), `packs/v5r/meeting-procedures.js` (six types,
  // ORDINARY_NO_SKELETON_REASON), `kernel/records.js` (the five default tracks), `kernel/chat.js` (six wired keys).
  // Chair-only material is `kind: 'role'` + `academician`, so the member prompt does not pay for it (T99 cap 30000).
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // THE MAINLINE (user decision this round): the five phases of the institute are not the point — the POINT is the
  // blueprint of the original problem: planning, refining, adjusting, building it out coarse-to-fine, and driving it
  // to completion. This block is `kind: 'role'` and lives in the always-on list, so every seat reads it EVERY round
  // (that is what makes "do not forget the mainline" a mechanism rather than a wish). Kept short on purpose: it is a
  // reminder, not a manual — the manual is `vibe-math-vmu/docs/16-research-lifecycle.md` section 10.
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  {
    name: 'v5r-turn-mainline',
    order: 829,
    range: 'pack',
    kind: 'role',
    texts: {
      academician: [MAINLINE_CORE, MAINLINE_SEAT.academician].join('\n'),
      researcher: [MAINLINE_CORE, MAINLINE_SEAT.researcher].join('\n'),
      temp: [MAINLINE_CORE, MAINLINE_SEAT.temp].join('\n'),
    },
  },
  {
    name: 'v5r-turn-blueprint',
    order: 830,
    range: 'pack',
    kind: 'role',
    texts: {
      academician: [
        '【蓝图（全所长期方案）】',
        '  · 任何**在册成员**都能提交草稿（propose）：草稿**不生效**，只是排队等采纳。',
        '  · **只有院士席（chair）**能采纳（adopt）：采纳后成为唯一生效版本，并取代上一版。别的席位调用会被具名拒。',
        '  · **共同设计**：草稿须院士席与常驻研究员席各一人署名才可采纳（缺一席具名拒 `VMU_PACK_V5R_BLUEPRINT_NEEDS_CODESIGN`）。',
        '  · **按时更新**：`state` 的 `freshness` 给年龄与逾期（逾期采纳回执 `overdueUpdate`），同时给出生效版本、采纳时间与草稿队列；蓝图行也能用 `vibe_v5_read_library` 读。',
        // ★★★ RUN 239 (live run 62 / FEEDBACK62 #2, MEASURED) said: a proposal registers an INDEX ROW only and ONLY
        // adopting writes `Shared/Protocol.md` (an unadopted draft must not displace the document in force). ★★★ RUN 248
        // (user ruling m37456: drafts MUST be on disk, members manage md with fs) REVERSED the storage half: a draft now
        // has its own file, and the member that writes it and passes `mdPath` keeps authorship. ★★★ RUN 255 / TB-2613
        // flipped the DEFAULT writer: a propose without `mdPath` writes NOTHING (no file, no row) and answers `filed:false`
        // + `draftMdMissing:true`; the kernel materializes only when asked by name (`materialize:true`). What did NOT
        // change: a draft cannot displace the document in force; adopting is the only promotion, and it verifies
        // row-vs-file sha first (`VMU_PACK_V5R_BLUEPRINT_MD_DRIFT` / `VMU_PACK_V5R_BLUEPRINT_MD_MISSING`).
        '· **草案落盘、adopt 只晋升**：默认**什么都不写**——不带 `mdPath` 的 propose 回 `filed:false`+`draftMdMissing:true`；正常路径：**先用 fs 写 `Shared/Drafts/<stem>-r<N>.md`，再带同一 `mdPath` propose**（`writtenBy:"member-file"`，作者可考）；旧行为须显式 `materialize:true`（`writtenBy:"kernel-materialized"`）。md 是唯一真相、行只登索引：改过 md 读面给 `mdChangedSinceIndex:true`，`reindex` 按 md 重建。adopt 只校验 sha 后晋升 `Shared/Protocol.md`：缺文件 `VMU_PACK_V5R_BLUEPRINT_MD_MISSING`、被改 `VMU_PACK_V5R_BLUEPRINT_MD_DRIFT`、同字节 `alreadyWritten:true`。',
      ].join('\n'),
      temp: [
        // ★★★ RUN 239 / FEEDBACK62 #2 said a draft is an INDEX ROW with no file; ★★★ RUN 248 reversed that (drafts are
        // files) and ★★★ RUN 255 flipped the default writer to the member (fs-first): the kernel writes a draft file only
        // when `materialize:true` is asked for. The temp needs both facts: its propose writes nothing by default, and
        // only the chair adopt promotes.
        '【蓝图】长期方案只由院士席采纳；你可 propose 草稿，`state` 读版本。草案是**你自己的文件**：先用 fs 写到 `Shared/Drafts/<stem>-r<N>.md`、再带同一 `mdPath` 提交；不带 `mdPath` 的 propose 不写文件、回 `filed:false`+`draftMdMissing:true`（要内核代写传 `materialize:true`）；md 改过先 `reindex`，采纳只由 chair 校验 sha 晋升（漂移 `VMU_PACK_V5R_BLUEPRINT_MD_DRIFT`）。',
      ].join('\n'),
      researcher: [
        // ★★★ RUN 239 / FEEDBACK62 #2: the researcher is the codesigner who hands a draft to the chair. ★★★ RUN 248
        // reversed the storage half (the draft is a FILE you may own) and ★★★ RUN 255 made it YOUR file by default:
        // write it with fs and propose with `mdPath`; the kernel materializes only if you pass `materialize:true`. The
        // adopt that promotes it into `Shared/Protocol.md` belongs to the chair — who cannot promote a file you edited
        // after proposing (`VMU_PACK_V5R_BLUEPRINT_MD_DRIFT`).
        '【蓝图】长期方案写在蓝图里：提交草稿（propose，仅院士席可 adopt）；`state` 读生效版本与 `freshness`。**共同设计**：草稿要院士席与你各署名。草案是**你自己的文件**——先用 fs 写好 `Shared/Drafts/<stem>-r<N>.md` 再带同一 `mdPath` 提交（不带 `mdPath` 的 propose 不写文件、只回 `filed:false`+`draftMdMissing:true`；要内核代写传 `materialize:true`）；md 是唯一真相、行只登索引（改过给 `mdChangedSinceIndex:true`，`reindex` 收编）；采纳时 chair 校验 sha 后晋升（改过 `VMU_PACK_V5R_BLUEPRINT_MD_DRIFT` 拦）。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-turn-convene',
    order: 828,
    range: 'pack',
    kind: 'role',
    // ★ RUN 241-A: the chair's meeting MANUAL (order 831, gated to `meeting` below) is only actionable once a meeting
    // exists. A REGULAR round still needs the convening contract, and that is this section: `at` offsets, `sequence`,
    // `lateAdmission`, `durationMs` — facts the chair's `vibe_v5_meeting` bullet line does not spell out — plus, for the
    // other seats, what an invitation obliges them to do. Phase-gated AWAY from meeting/verify so it does not repeat
    // the manual where the manual is present.
    scope: Object.freeze({ phase: Object.freeze(['founding', 'normal', 'checkpoint', 'heartbeat', 'resume', 'paper-write', 'paper-review', 'paper-final']) }),
    texts: {
      academician: [
        '【召集与预约（非会议回合）】只有 chair 能召集/关闭（其它席位具名拒 `VMU_NOT_PERMITTED`）。`at` 给 epoch ms／ISO-8601／相对偏移（如 "+120s"）即预约；一旦成立 status/summary 立刻可读、开始前的治理动作被具名拒；`sequence` 逐场召集、逐场也可各自 `at`；`durationMs` 定墙钟上界；迟到入席看 `lateAdmission`（`refuse` ⇒ `VMU_LATE_ADMISSION_REFUSED`）。邀请≠签到：被邀者仍须自己 `attend`。会中手册见会议回合。',
      ].join('\n'),
      researcher: [
        '【参会与预约（非会议回合）】被召集/预约时内核给每位被邀者投一条**耐久预约邮件**（`kind:"meeting-appointment"`）：你的**下一回合提示最上方**会出现 `[新到的消息]` 块，其中一行 `【会议预约·<主席>】<标题> @ <开始时间> — <可直接照抄的入席调用>；读后 mailbox ack {id}`。那行不是提醒而是**未结算的邮件**：ack 之前每个回合都会再来一次（块内最新在前、最多 8 行；更多用 `vibe_v5_inbox {action:"list", member}`）。三步结算：① `vibe_v5_inbox {action:"open", id:"<邮件 id>", member:"<你>"}` 读正文（会议类型/议题/时间/你的席位/确切入席调用）；② 会议开始后 `vibe_v5_meeting {op:"attend", id:"<会 id>", member:"<你>"}`（邀请≠签到，不 attend 不计法定人数；预约状态下 attend 只登记座位、不会提前开会）；③ `vibe_vmu_mailbox {action:"ack", member:"<你>", ids:["<邮件 id>"]}` 结算（pack 面 `vibe_v5_inbox` 只有 list/open/mark，ack 在内核邮箱面 `vibe_vmu_mailbox`，框架面不由 pack 收窄）。没有实时唤醒缝时你不会被叫醒，只在自己的回合看到它；预约会在 `at` 到点前只许座位登记，治理动作被具名拒。会议类型与迟到入席规则见会议回合。',
      ].join('\n'),
      temp: [
        '【参会与预约】临时工：可读可群聊（`vibe_v5_say`），不入会、不投票。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-turn-meeting-schedule',
    order: 831,
    range: 'pack',
    kind: 'role',
    // ★ RUN 241-A: phase-gated — the manual is only actionable once a meeting exists. A regular round reads
    // `v5r-turn-convene` (order 828) instead; the manual keeps the in-meeting protocol.
    scope: Object.freeze({ phase: Object.freeze(['meeting']) }),
    texts: {
      academician: [
        '【开会与预约：按事件时机的顺序（你的手册）】会议类型六种：`ordinary`｜`academic`｜`debate`（**必须**给 `subject`）｜`closure`｜`paper`｜`planning`；`sync` 不是会议类型；动议 kind 为 topic/procedural/resolution；**可用的命令随类型与身份不同**。辩论须先给 `subject`，结题/辩论表决用 `vote_solved`，论文交流走 `vibe_v5_paper`，临时工无表决权；上面这些动词只是常用手段，不是穷举。**会议进行中的一切内容、控制、活动都由你的命令决定**——但每个成员的动作（发言、投票、签到）仍由成员自己在其回合做完，你编排的是顺序与时机。',
        '  · ① 先定议程：`agenda` 是会议议程文本（`open` 时给）；`agendaitems` 读议程条目、`agendaclose` 按 `target` 关闭一个条目（必须给 `reason`）——`agendaitems`/`agendaclose` 这两个动词只认**内核原语会**（`vibe_vmu_meeting { action:"open" }` 开的）；用 `vibe_v5_meeting` 开的**服务会**要用 `status`/`summary` 读议程。`title` 是**可选**的独立名称（非字符串会被具名拒）。`open` 回执里的 `procedureNote` 是**建议**（`procedure` 同源，`meeting-procedures.js` 的 `binding:"recommendation"`），不是闸：`ordinary` 类型**故意不给推荐骨架**，其余五种的步骤只是**建议**，可跳过、可重排，是否遵循由你决定。　★ **正式议程要条目就给数组**：`formal_agenda` 传 `["条目", {title:"条目2", kind:"review"}]` 才逐条落库（`formalAgendaItems` 读得到）；传 `true` 只是**声明**（`formalAgendaDeclared:true`、`formalAgendaItems:null` ＋ `formalAgendaItemsWhy`），读者一条都看不到（真机 P-04 正因如此只剩这个布尔。）',
        '  · ② 召集即发邀请：`vibe_v5_meeting` 的召集只对 chair 席开放（`vmu.meetings.conveneRequiresChair`）；关闭也只有 chair 能调（`closeRequiresChair`，其他席位会被具名拒 `VMU_NOT_PERMITTED` 并指出该由谁做；有 roster 未到场者时，`close` 前先问 `status.present`）。召集成功会对除主席外每位在册者发出 `meeting-appointment` **耐久邮件**（`channel:"mail"`，每个被邀者一条，含议题/时间/你的席位/可照抄的入席调用）：回执 `invitation.delivered`＝已投递——对方**下个回合提示最上方的 `[新到的消息]` 块**里会出现一行 `【会议预约·<你>】…`，在其 `mailbox ack` 之前每回合都在（也可用 `vibe_v5_inbox` 读），`woken` 空＝无实时唤醒缝，`unreachable`＝邮件没发出、会议仍成立——用 `vibe_v5_message`/`wake` 补，**绝不重复召集**。预约/召集的回执还直接给内核投递三数组：`notified`（真拿到行的成员）、`notifyRows`（每人 mailId）、`notifyFailed`（逐人具名原因，附 `noticesMeans`）——`notifyFailed` 里的人才是你要补发的，别把「约过」当「通知到」。不必逐个私信催：没投出去的人会具名出现在 `unreachable`／open 回执的 `notifyFailed` 里，只有他们需要补消息；被邀者迟迟不 attend 是他自己回合的事，不是你没通知到。邀请≠签到：被邀者仍须自己 `attend` 才计入法定人数。',
        '  · ③ 预约与会前：`vibe_v5_meeting { type, agenda, at: <epoch ms / ISO-8601 / 相对偏移如 "+120s"> }`（可写相对偏移——**你没有自己的钟**，由内核换算）→ 会议进入 `scheduled`；`status`/`summary` 可读，开始前的治理动作都被具名拒；例外：`attend` 可提前签到（不开会）、主席可 `proceed` 提前开（记 `startsEarly`/`earlyByMs`，提前开不是迟到）。**到点不会自己开会**：到点后的下一次 touch 只结算一次考勤——那一刻人已齐才直接开（`startedLate:true`），否则落 `waiting`，并给 `waitingFor`（`"quorum"`＝人没齐；`"chair-proceed"`＝人齐了等你）。`waiting` 期间迟到者 `attend` 让考勤满足时那次 touch 仍会开；等待到期只把 `waitDecisionDue` 置真（提醒，不开会）；其余只有 `proceed` 能开（`lapse` 弃会、`recess` 体会是两个出口）。`requiresChairProceed:true` 的准确含义是「开会不是框架按钟自己决定的」：需要一个动作把它推过去（你 `proceed`，或考勤在等待期间被补齐）。没有定时器：靠 `beat()` 的 sweep 与 touch 结算；回执 `nextActions` 列出此刻能接的动作——出现 `proceed` 就是你开（可提前开，记 `startedLate:true`），出现 `attend`＝还要有人签到，出现 `beat` 说明只差一次 touch。迟到入席看每会 `lateAdmission`（open|chair|refuse，缺省 chair）决定：`open` 直接入座记 `late:true`；`chair` 挡在门口（`pendingLate:true`），只有主席 `vibe_vmu_meeting { action:"admit", id, member, actor }` 放行；`refuse` 具名拒 `VMU_LATE_ADMISSION_REFUSED`；「迟到」由 `lateAfterMs` 对 `openedAt` 判定（缺省 0）。',
        '  · ⑦ 一次连排多场：给 `sequence` 数组即可一次召集（逐项校验，回执给 `sequence.index/total/next`）；也可以给每场各自的 `at` **逐场召集**。',
        '  · ⑧ 面别记错：`vibe_v5_meeting` 只**召集/预约**；`close`/`attend`/`hand`/`admit`/`status`/`summary` 走 `vibe_vmu_meeting { action, id, member?, actor? }`，拿错面会被具名拒 `VMU_INVALID_ARGUMENT`。',
        '  · ⑨ 以**主席名义**的动作（召集、裁决、放行迟到）不能代做：先 `vibe_vmu_turn { op:"drive", member: "<院士 id>" }` 给院士派一回合，否则具名拒 `VMU_CHAIR_ACT_NOT_DELEGATED`。辩论的 `subject` 必须是**证明已完成**的命题卡（`proofRef`+`proofState:"complete"`、已进 verified，或跑通的 Lean 结果）或 `subject_evidence.file`；一句话命题会被具名拒 `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF`。',
      ].join('\n'),
      temp: [
        '【会议类型与预约】六种类型（ordinary/academic/debate/closure/paper/planning）；动议 kind 为 topic/procedural/resolution；被邀请不等于签到——临时工席位不参会：`attend` 被具名拒（`vmu.meetings.attendDeniedSeats`），无表决权。',
      ].join('\n'),
      researcher: [
        '【会议类型与预约】六种：`ordinary`︱`academic`︱`debate`（须 `subject`）︱`closure`︱`paper`︱`planning`；动议 kind 为 topic/procedural/resolution。命令随类型与身份不同（辩论须先 `subject`、结题表决 `vote_solved`、论文交流走 `vibe_v5_paper`）。`at` 预约会开始前拒**治理动作**（例外：`attend` 可提前签到、主席可 `proceed` 提前开），到点不会自己开（`requiresChairProceed:true`）：`waitingFor` 给原因——`"quorum"`＝人没齐、`"chair-proceed"`＝人齐了等主席 `proceed`；你能做的是 `attend`（考勤满足的那次 touch 仍可能开），`nextActions` 里只剩 `proceed`/`lapse`/`recess` 时＝在等主席，别催；被邀请≠签到。迟到入席看每会 `lateAdmission`：`open` 直接入座（`late:true`）、`chair` 你会停在门口（`pendingLate:true`，等主席 `admit`）——`refuse` 则具名拒。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-turn-meeting-chamber',
    order: 841,
    range: 'pack',
    kind: 'role',
    // ★ RUN 226 / A3: the on-floor manual (speaking order, extension/wall clock, advancing member rounds)
    // used to ride in every round inside v5r-turn-meeting-schedule. It is only actionable once a meeting is
    // OPEN, so it lives in its own section and the prompt-switch middleware renders it on phase=meeting only.
    // Only the chair gets a text: for the other seats the section resolves to the empty string (zero injection).
    // ★★ RUN 242 (A7 root cause): a meeting-phase turn that is bound to NO meeting gets no on-floor manual — the
    // manual's every fact (speaking order, wall clock, member rounds) is about a meeting nobody named.
    scope: Object.freeze({ meetingId: 'required' }),
    texts: {
      academician: [
        '【会议进行中：会中手册（编号沿用上一节的 ④⑤⑥，只在会议回合出现）】',
        '  · ④ 会上发言序：`hand` 是成员自荐入队；`invite` 由你调用，`member` 邀一人或 `members` 按数组顺序批量入队（`why` 必填）；`invitedspeak` 让被邀者走服务发言面（**没签到**会被具名拒，先 `attend`）；`order` 不带 `members` 时只读队列；带 `members` 是**重排**（必须给 `by`=你自己，非本会出席者具名拒）。`flow`（open/hands/round_robin/call_on）与 `overrideorder` 只由主席做、必须给 reason，寻址的是**服务会议记录**；基线顺序就是**入队顺序**。`vmu.meetings.orderMode` 与 `overrideorder` 在**本部署未声明**，调用会被具名拒 `VMU_ENGINE_UNAVAILABLE`（工具说明里写明这条边界）。　★ **`action:"hands"` 不是服务会议的门**：真机第 69 次（L39）在服务会议上调 `hands { op:"list" }` 被具名拒 `VMU_REGISTRY_BOUNDARY`——`hands` 的 grant/revoke/clear/list 只写内核**原语会**的楼层，服务会议的楼层是**队列**：看队列用 `order`（不带 `members` 只读），重排也用它（带 `members` 且 `by`=你自己、非出席者具名拒）；把人按序排进队列用 `invite`（`member` 一人或 `members` 数组，`why` 必填）。上面 `flow` 里的 `hands` 只是**模式名**，与 `action:"hands"` 不是一回事。',
        '  · ⑤ 时长与兜底：`extend` 是**发言延长**（ms，缺省读 `speechExtendMs`，仍 0 则具名拒）；`extendlimit` 是**会议墙钟上界延长**（★ `extend` 现在跨注册表：SERVICE 会议走服务面，回执 `registry:"service"` 并给 `speechUsed`/`speechExtendMs`；`silent`/`end`/`hands` 仍是 primitive 原语，服务会议上具名拒 `VMU_REGISTRY_BOUNDARY`，发言界读 `vibe_v5_say` 回执的 `speechBound`）；墙钟硬界 `vmu.meetings.hardLimitMs`（默认 1800000ms，钳制 300000–7200000，**没有"无界"**）。**你自己就能给这一场定上界**：`vibe_v5_meeting { durationMs: 900000 }`（整数 ms，30 分钟–2 小时），回执读回 `wallLimitMs`/`wallLimitMsSource`（`convene` 表示你定的，`vmu.meetings.hardLimitMs` 表示部署默认）。只有超过硬界才能用 `lapse` 具名收束，恢复用 `revokelapse`（必须给理由）；`at` 预约、还没开始的会没有墙钟在走，`extendlimit` 要等会议真正开始后才能用。',
        '  · ⑥ 推进成员回合：`vibe_v5_meeting_round { meeting, members?, phase? }` 按序各跑一回合（members 缺省＝除主席外全体在册）；`phase` 取值以工具声明为准（辩论轮可直接写 `debate`，回执会说明它按 `verify-debate` 跑），写错具名拒；回执 `ok:false`+`turnFailed:true`＝这轮没发生，别当成功；`close`/`extendlimit` 要带 `actor`（主席本人）；回执 `roundMeeting` 说明这轮绑定了哪场会（成员回复据此入纪要）；`action:"convene"` 与直接召集等价。',
        '  · 对全体发言即推送（只有主席的发言会推送）：你在会中 `speak`/`say` **不带 `to`**（对全体）且发言人正是主席时，内核给**每个在席成员（除你）**投一条 `channel:"group"` 耐久行：摘要 ≤800 字符 + 全文指针 `<会 id>/minutes#<第几条>`；回执给 `deliveredTo`（真投到的人）、`deliveredRows`、`broadcastFailed`（没投到的具名原因，绝不静默丢）、`broadcastMeans`。普通成员的发言**只进纪要、不推送**（否则每句话变成 N-1 封邮件）；只想让某人看见就用 `to:"<成员>"`。他们无需轮询：下一回合通知块里会看到【主席发言·<你> @ <会 id>】那行，读完 ack 才消失。',
        // ★ RUN 239-D (follow-up): a member with nothing to do used to either stay silent forever or burn turns
        // asking "has anybody spoken yet". The kernel now keeps a DURABLE waiter row and REALLY wakes the seat when
        // the event fires, so the manual must teach the door that exists: `vibe_vmu_meeting { action:"wait" }` on the
        // KERNEL face (the pack face `vibe_v5_meeting` only convenes). The words after `until:` are the kernel's own
        // WAIT_UNTIL_MODES, and a wake is a DELIVERED TURN (a real activation in a live deployment), never a
        // synchronous answer — a manual that promises "an answer" would be the next measured lie.
        '  · 等待与唤醒：等会里的事用 `vibe_vmu_meeting { action:"wait", id:"<会 id>", member:"<你>", until:"speak|vote|motion|poll|phase|attend-all|hand|meeting-closed|deadline", timeoutMs:<可选毫秒>, reason:"<可选>" }`：登记是**耐久**的，不是挂起——本回合照样交回；事件发生（发言／动议或附议／投票／相位变更／点名／结会／到点）时内核**唤醒你＝投递一个回合**（真机走激活，回执可能先给 `pending:true`、之后原地结算 `woken`），不是随叫随到的解答。**一次只等一件事**（再登记会替换旧的），别轮询；改主意用 `vibe_vmu_meeting { action:"unwait", id, member }`。',
      ].join('\n'),
      researcher: [
        '【会议进行中：你的会中动作（只在会议回合出现）】在服务会议上发言前先 `vibe_vmu_meeting { action:"attend", id, member }`（签到是座位登记；★ RUN 239-D：`vibe_v5_meeting` 只召集、不派发动作，派发动作都在内核面 `vibe_vmu_meeting`）；想发言用 `hand` 自荐入队，被主席 `invite` 后按队列序；`vibe_v5_say` 回执的 `speechBound` 是你的发言界（`extend` 是主席动作，你自报身份会被拒；`silent`/`end` 在服务会议上具名拒）；等会里的事（发言／动议／投票／结会／到点）用 `vibe_vmu_meeting { action:"wait", id, member, until:"speak|vote|motion|poll|phase|attend-all|hand|meeting-closed|deadline", timeoutMs:<可选> }`——耐久登记，事件发生才唤醒并投递一个回合，别轮询；改主意用 `action:"unwait"`。等**信**才用 `vibe_v5_wait`。主席对全体发言会推送到你：不用轮询，下一回合提示最上方的 `[新到的消息]` 块里有一行【主席发言·<speaker> @ <会 id>】+ 摘要；全文用 `vibe_v5_meeting {op:"minutes", id:"<会 id>"}` 读纪要第 N 条，读完用 `vibe_vmu_mailbox {action:"ack", member:"<你>", ids:["<邮件 id>"]}` 结算才消失；普通成员的发言只进纪要、不推送。',
      ].join('\n'),
      temp: [
        '【会议进行中：临时席的会中动作（只在会议回合出现）】临时工不是表决者，投票会被具名拒；发言前先 `vibe_vmu_meeting { action:"attend", id, member }`（签到是座位登记，派发动作在内核面 `vibe_vmu_meeting`，`vibe_v5_meeting` 只召集）；被主席 `invite` 邀入队后按顺序发言；等会里的事用 `vibe_vmu_meeting { action:"wait", id, member, until:"speak|vote|motion|poll|phase|attend-all|hand|meeting-closed|deadline", timeoutMs:<可选> }`（耐久登记，事件发生才唤醒并投递一个回合，别轮询；改主意用 `action:"unwait"`）。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-turn-polls',
    order: 832,
    range: 'pack',
    kind: 'role',
    texts: {
      academician: [
        '【投票板（只有你能立）】`vibe_v5_poll_open`：`min_votes` 是**投票成立**的门槛（缺省取 `vmu.ballot.minVotes`），**不是法定人数 m**；`secret`/`allow_abstain` 可传但内核没有单场规则（属部署层策略）：回执 `unapplied` 会逐条说明，别指望它们改变结果口径。只有 chair/member 席有票权，临时工投票会被具名拒；`vibe_v5_poll_close` 未达 `min_votes` 会被具名拒——那次投票**不成立**。',
        '  · **辩论不用投票板**：辩论是各自发言 + `vibe_v5_verdict_final` 裁决，不靠选项投票。',
      ].join('\n'),
      temp: [
        '【投票板】临时工不是表决者，投票会被具名拒；辩论不走投票板——辩论是各自发言 + 最终裁决。',
      ].join('\n'),
      researcher: [
        '【投票板】`vibe_v5_poll_vote`；临时工投票会被具名拒。辩论不走投票板——辩论是各自发言 + 最终裁决。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-turn-chat-admin',
    order: 833,
    range: 'pack',
    kind: 'role',
    texts: {
      academician: [
        '  · **单次发言版群聊**两法：`speakQuota:1`（每人每窗口一条，超了 `VMU_CHAT_QUOTA_EXCEEDED`）或 `vibe_v5_say` 带 `round:"<id>"`（**照抄本回合 id**，不要自造；同轮第二次 `VMU_CHAT_ALREADY_SPOKE`；不带 text 是读本轮还欠谁）；两者都是**机制**，不等于并行隔离。',
        '【群聊管理（你是管理员）】`vibe_vmu_chat`：mute（0/缺省用 `vmu.chat.muteDefaultMs`，仍 0 则**不过期**）、quota（`speakQuota`＝每窗口条数，0=不限）、setpolicy 只改已声明键；管理动作须带 `by`。冻结时群聊随票箱冻结，`freezeExemptAdmins` 决定管理员豁免；撞上具名拒 `VMU_CHAT_NOT_ADMIN`／`VMU_CHAT_MUTED`／`VMU_CHAT_QUOTA_EXCEEDED`。',
      ].join('\n'),
      temp: [
        '【群聊规则由院士定】禁言与发言配额由群管理员（院士）设定；撞上会得到具名拒（`VMU_CHAT_MUTED`／`VMU_CHAT_QUOTA_EXCEEDED`）。',
      ].join('\n'),
      researcher: [
        '【群聊规则由院士定】谁能发言、每窗口几条、谁被禁言由群管理员（院士）定；撞上具名拒（`VMU_CHAT_MUTED`／`VMU_CHAT_QUOTA_EXCEEDED`）。单次发言轮：同 `round` 第二次被拒 `VMU_CHAT_ALREADY_SPOKE`，换新 round id 再说。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-turn-channels',
    order: 834,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '【三通道的紧急语义】`vibe_v5_say` 三种去处：不给 `to`＝**群聊**（非紧急）；给 `to`＝**私信**（希望尽早回复，只有它能带 `urgent: true`）；给 `meeting`＝会议发言。邮箱**非紧急**：留收件箱等对方查；群聊/会议发言带 `urgent` 具名拒。判据：要对方**这一轮就看到**→私信；只留记录→邮箱；全所该知道→群聊。**投递**：私信与群聊全体发言各投一条**耐久邮件行**，出现在**下一回合提示最上方的 `[新到的消息]` 块**（最新在前、≤8行；私信 `【邮件·<from>】<主题>`、群聊 `【群聊·<from>】<摘要>`＋全文指针）。`deliveredTo` 是真投到的名单、`deliveryFailed` 是没投到；`ack` 是**唯一**结算：`open` 只标 `read`，行不会因被读消失；`acked`／`ackRequired`／`settledBy:"ack"` 是具名读数；`unackedRows` 是旧称。无未结算行时块头**仍渲染**具名空 `[新到的消息] （无未结算行）`（不是通知丢失）；装配回执 `notices` 的 `lines`／`rendered`／`blockChars` 是小节读数；`rendered:false` 却以为有人写过信，先 `vibe_v5_inbox {action:"list", member}` 查。**证据比正文活得久**：回复正文超 `vmu.turn.replyLimitChars`（默认 2000 字符）只留摘录——权威键是 `truncated`（被切了）与 `excerptLen`（摘录字符数）；`replyTruncated`/`replyExcerpt` 只是它的旧称，仅存在于回合回执，台账行不复制这两个键。**仅当 `truncated:true`（正文被切）时**内核才把全文写到 `Members/<你>/Turns/<turn>.md`，写完立即回读并校验 sha256——只有校验通过，回执才给 `replyFullPath`／`replyFullSha256`／`replyFullBytes`（三个一起、**只覆盖正文**；核整文件请自己 `sha256sum <replyFullPath>`）；回执 `archiveMissing:true` 时 `replyArchiveWhy` 会具名说明「写了但读不回」，此时**不许**把不存在的路径当作已归档；正文没被切（`truncated:false`）则回执不给这三个键，也不要去找文件；`emptyReply` 只说**文本通道**：true＝这一回合的回复文本 0 字符（空白也算），写了一个字就是 false（哪怕只回 `{"solved":false}`、哪怕这段散文没解析出任何字段）——它**不等于**「没做」：工具通道是另一条通道，`source`／`fields`／`executed`／`writes` 才是做没做的证据。要留证据就把结论写进 `progress`／成果卡并把 `rec-<n>` 写进回复。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-turn-formal-verify',
    order: 835,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        "【形式化开关 `vmu.math.formalVerify` 三档】`off`＝零策略（默认）｜`encourage`＝鼓励（做了就归档，没做就在回执 `formal` 写明难度判断）｜`require`＝强制（缺 Lean 结果或 blocked 记录则裁定**不生效**，对象留原轨进待办）。这个键由**所办**改；`leanInitiative` 只是回显。",
      ].join('\n'),
    },
  },
  {
    name: 'v5r-turn-tracks',
    order: 836,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        "【轨迹与状态板】轨迹五种（`vmu.records.tracks`）：`progress`（默认）｜`routes`（尝试过的路线）｜`obstacles`（阻塞与原因）｜`rejected`（已证伪的路）｜`state`（状态板）。`track:\"state\"` 时 progress/obstacles/next/help **四项必填**，缺一具名拒。",
        "**派回合的 `phase` 是闭集，只有四个全名**：`heartbeat`／`paper-write`／`paper-review`／`paper-final`——`review`／`write`／`final` 是流程词不是 phase（旧任务书简写），写成它们会得到 `VMU_INVALID_ARGUMENT unknown phase`（派回合面；`vibe_v5_meeting_round` 的 phase 以工具声明为准，不属于本面）；`paper-review` 回合的产物是**评审票**，结题票 `vote_solved` 不用于评审。",
        "· 五类各有一等机制：`routes`/`obstacles` 即上两条轨；Lean = `vibe_v5_lean_run`→`lean_job`→`lean_archive`，库 `lean_lib`（编译过≠命题真）；论文 = `vibe_v5_paper` 的 part 阶段；脚本 = `scripts` 轨（所办归档）；自反馈 = `vibe_v5_feedback`（feedback 轨）。方法库卡：`vibe_v5_record_method`。",
        "  · `[状态板]` 四行是**派生读数**，且四行都带**时间等基础信息**：要么带内容时间（`（读于 …）`），要么具名说「时间未提供：为什么」。state 面板自己写：**成员席位只能改自己的**，**所办/人类代笔**可代写这几行**读数**并回执 `panelOwner`（仅读数）；**不在名册**的 id 具名拒。**归属口径**：`memberWorkShare = memberActs/(memberActs+officeRelayedActs)`（`unknownActs` 不进分母）；**代笔回执**带 `memberActed:false`、`actedForMember`、`ranInOwnTurn:false`，落盘行带 `writtenFrom`（`own-turn`｜`relayed`｜`unknown`，问的是「这次写是怎么到这个席位的」）。`[结题]` 票数读 `closureVote.votesCast`/`votesTotal`（分母=有表决权席，不含 temp），别自己数人头。**`[蓝图]` 行由内核注入**：有就读（无现行版写「无现行版（rev 0，md 未落盘）」）；读不到用 `vibe_vmu_turn{op:\"status\",detail:\"board\"}` 的 `liveReadings.blueprint`，**不会因为**缺块当没有。",
        "  · 读别人的板：`vibe_v5_read_library`（`member`、`track`）；走不通的路写 `rejected`（别把证伪当进展）。",
        "  · **临时工不进成果库**：卡片面对临时工**具名拒**，产出由临时工自己写进回执（指派者只核对、不代写）；过程记录写在回执的 `progress` 字段。",
      ].join('\n'),
    },
  },
  {
    name: 'v5r-turn-tool-receipt',
    order: 837,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '【工具做事，回执汇报】开会/举手/邀请/投票/改任务/写轨迹的主路都是**工具调用**。每轮末尾的 fenced JSON 是**便捷桥**：只写回执字段目录里的字段，带属主的会**真的派发**到目录写的那个面，`face:null` 的只记账；`executed` 是派发计数，不是你要写的字段；无会议 id，举手/邀请走工具面。工具是主路，围栏不能替代工具。',
        '  · id 照读面抄，自造 id 拒 `VMU_NO_SUCH_OBJECT`；hint 里的 REACHABLE INSTEAD：先 `vibe_v5_overview {member:"<你的 id>"}`，再 `vibe_v5_inbox {action:"list", member:"<roster id>"}`。',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-turn-loop-stuck',
    order: 838,
    range: 'pack',
    kind: 'phase',
    // ★ RUN 242 / task-55 E6: the turn loop's own fact - "a turn is in flight and the lock has not come back" -
    // had no prompt line anywhere. A reader saw inFlight:true, retried, and collected VMU_TURN_REENTRANT (live run
    // 64 read pending:0 on the durable side while the lock was held, and both readings were true). The fix is the
    // named abandon, not a retry; the wording below is transcribed from kernel/turn/index.js (:4011, :4742, :4864).
    // Phase-gated to a REGULAR round: this is the one place the loop advances on its own, and the meeting/verify
    // manuals already carry their own timing. The gate is data (see v5r-turn-convene), not a middleware flag.
    scope: Object.freeze({ phase: Object.freeze(['normal']) }),
    texts: {
      normal: [
        '【回合循环卡住了怎么办】读 `vibe_vmu_turn { op:"status" }.turnLoop`：`inFlight` 是本内核的**单轮锁**、不是账本承诺（`turnInFlightMeans`：`human.recover` 读耐久账，可与锁并存）；`inFlightTurn`/`inFlightMember`/`inFlightOpenedBy`/`inFlightForMs`＝哪轮/谁开/锁时，`abandonAfterMs`＝上限，`wakeQueue`/`recentAbandonments`＝排队/最近关的轮。',
        '  · 连续两次 `VMU_TURN_REENTRANT` 就**不要第三次重试**：用 `vibe_vmu_turn` 的 `op:"abandon"`（`turn` 给 inFlightTurn、`why` 必填）按名关掉：该行变 `status:"abandoned"` + `VMU_TURN_ABANDONED`、释放锁、报告**不应用**；给错 id 读 `status:"open"` 的行或 `inFlightTurn`。',
        '  · 只关抱锁那一轮；关完读 status 确认 `inFlight:false`。',
        '  · parked 时再派同席＝`VMU_TURN_ALREADY_PARKED`（先答）；reply 无 parked＝`VMU_TURN_PARKED_NEEDS_OWNER`（丢弃）。先答→abandon→再派。解析失败会释放 park（下条 `step` 开新回合）',
      ].join('\n'),
    },
  },
  {
    name: 'v5r-turn-hiring',
    order: 840,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        '【临时工】临时工是**特殊/临时任务**用的，不是常设席位：雇佣用 `vibe_v5_hire { purpose, initial_task, to }`（三项必填，缺一具名拒）；只开 temp 席；',
        '产出由临时工在回执里交回（指派者只核对、不代写）。所办**开所**用 `vibe_v5_start`：它坐好院士席并记为 `vmu.turn.leaderId`（已有则不覆盖）。',
      ].join('\n'),
    },
  },
  Object.freeze({
    name: 'v5r-turn-scripts',
    order: 838,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        // ★★★ RUN 239 (live run 62 / FEEDBACK62 #3, MEASURED): THE SENTENCE SAID NO SEAT HOLDS THE SCRIPT FACE. Rule C14
        // was implemented in RUN 236 (the academician's institutional act, `vibe_v5_script { op: "archive" }`), and a
        // member/temp that reads "三个席位的 ACL 都不开放它" stops asking the one seat that can file the script. The
        // archive is a COPY, not execution evidence: what makes a recompute credible is re-running the archived text
        // and comparing fingerprints, never the archived note itself.
        '【脚本归档】脚本要留档：**归档是院士席（chair）的面** `vibe_v5_script` 的 `op: "archive"`；member/temp 具名拒 `VMU_NOT_PERMITTED`（把脚本交给主席）；归档是**副本**不是执行证据；临时脚本**不能** ad-hoc（具名拒 `VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS`）。',
      ].join('\n'),
    },
  }),
  Object.freeze({
    name: 'v5r-turn-compute',
    order: 839,
    range: 'pack',
    kind: 'shared',
    texts: {
      shared: [
        "【计算与引擎】`vibe_vmu_mathtools`（plan/run/…）与 `vibe_vmu_mathjobs`；**引擎由宿主注入**，接缝缺失时具名拒 `VMU_ENGINE_UNAVAILABLE`，不假装算过。回执都有 `value`/`valueMissing`：`mode:\"expr\"` 是**求值并打印**：`value` 是引擎打印文本，没打印时回执 `value:null` + `valueMissing:\"stdout-empty\"`（**不会**读成 0），要值就在 `code` 里写 print。引擎两条通道：有宿主 `subprocess` 服务走宿主，否则声明过 `vmu.math.*` 的部署走适配层（`status.math.spawnSeamKind` 说明哪条）；都没有才具名拒。要新包/引擎写进进展与请示。",
        "  · 先 plan 看计划与沙箱上限，再 run 执行；复核同一脚本（cacheKey 相同）重跑，或 receiptsView 读历史回执；脚本与输出必须归档成可复核回执，shell 兜底不算归档。",
      ].join('\n'),
    },
  }),
])
