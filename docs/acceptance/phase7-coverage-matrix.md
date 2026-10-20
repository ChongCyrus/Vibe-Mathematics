# PHASE 7 / 覆盖矩阵与 v5r 移植备料

本卷只记录**派生事实**与**未覆盖路径**，不修改代码。派生来源：`vibe-math-vmu/tools/*.js`、`vibe-math-vmu/host.js` 的 `TOOL_NAMES`、`vibe-math-vmu/packs/v3/tools.js`、`vibe-math-vmu/packs/v5r/**`、原始 `vibe-math-v5r/vibe-math-v5r.js`，以及 `D:\_tmp\slv-v3\out` 下 66 个 SLV run 的 jsonl。

## 0. 派生计数（先给数，再解释口径）

- `vibe-math-vmu/tools/` 下工具面模块：**48 个**（`activity, admission, arbitration, audit, auditchain, bidding, board, bridge, budget, capacity, charter, chat, citations, clockguard, collab, conference, control, custody, discipline, explain, external, fairness, fidelity, formal, governance, handover, human, idempotency, ip, mailbox, mathadapters, mathjobs, mathtools, meeting, minutes, notify, panel, projmigrate, publication, ratelimit, recruit, report, retention, reviewers, task, topology, transaction, turn`）。
- `host.js` 的 `TOOL_NAMES` 条目：**54**（含别名与条件发布；实际发布数由装配的 faces 决定）。创始人所述“47 个面”与本次派生的 48 个模块文件相差 1，**此处按派生值记 48，并保留这一差异**，不把它抹平。
- v3 pack 声明工具：**10 个**（`vibe_math_start / pause / status / report / list_decisions / decide / plan / list_agents / method_list / add_problem`）。
- v5r pack 声明工具：**0 个**（`packs/v5r` 下没有 `tools.js`）。
- 原始 `vibe-math-v5r.js` 中的 `vibe_v5_*` 名字：**57 个**（去重后，另有一个 `vibe_v5_record_` 是文本前缀碎片，不计入）。

## 1. v3 覆盖矩阵

| 工具/命令 | 内核有这个面吗 | pack 声明了吗 | 成员能发现吗 | 真机实测过吗（哪个 run） |
|---|---|---|---|---|
| `vibe_math_start` | 是（v3 pack 工具） | 是 | 否：成员角色段没有引用；只有 root 任务模板调用 | 是：19527（root） |
| `vibe_math_status` | 是 | 是 | 否：成员不引用 | 是：19527 等 |
| `vibe_math_report` | 是 | 是 | 否 | 是：19527 |
| `vibe_math_add_problem` | 是 | 是 | 否 | 是：19527 |
| `vibe_math_plan` | 是 | 是 | 否（planner 由 tick 驱动，不靠成员工具发现） | 是：通过 planner tick |
| `vibe_math_list_agents / list_decisions / method_list / decide / pause` | 是 | 是 | 否：成员角色段不引用 | 部分：root 调过 status/report；其余无真机调用记录 |
| 48 个 `vibe_vmu_*` 内核面 | 是（宿主发布，条件面） | **否**：v3 `tools.js` 只声明 10 个 v3 工具 | 否：v3 成员段没有工具清单/引用 | 部分：root 用过 admission/status/report/control/turn/meeting/chat/records/mailbox/panel；**成员回合因夹具“不调用工具”而全部未实测** |
| `read / grep / glob / web_search / pwsh`（宿主工具） | 宿主提供 | 不属于 pack | 成员段未引用，且夹具禁止调用 | root 用过；**成员未用过** |
| Lean 五工具 | 内核无同名五工具；数学面是 `mathtools / mathjobs / mathadapters` 的 op 级能力 | 否 | 否 | **只在 mock/单测层验证过，真机从未跑过** |

v3 的三种情形（按“当前 pack 是否声明/提示词是否引用”派生）：

- **（甲）内核有面、pack 没声明**：**48 项**（48 个 `vibe_vmu_*` 面都没有被 v3 `tools.js` 声明；宿主是否对成员暴露取决于装配的 faces 与夹具）。
- **（乙）pack 声明了、成员发现不了**：**10 项**（10 个 `vibe_math_*` 工具在成员角色段中无引用；root 模板知道它们）。
- **（丙）成员根本没有工具**：**0 项**（v3 的 10 个工具确实存在；核心 48 面也由宿主发布）。

## 2. v5r 覆盖矩阵

| 工具/命令 | 内核有这个面吗 | pack 声明了吗 | 成员能发现吗 | 真机实测过吗（哪个 run） |
|---|---|---|---|---|
| 57 个 `vibe_v5_*` 原工具 | **否**（vmu 内核没有这些同名工具） | **否**（v5r 无 `tools.js`） | **是：提示词在教它们**（见下） | **否**：v5r 真机从未调到这些名字 |
| 48 个 `vibe_vmu_*` 内核面 | 是 | 否 | 否：v5r 提示词只教 `vibe_v5_*`，不教 `vibe_vmu_*` | 部分：19611/19612 的 root 用过 control/turn/status/meeting；**成员未用工具** |
| `read / grep / glob / web_search / pwsh` | 宿主提供 | 不属于 pack | 成员段未引用；19611 夹具禁止成员调用 | root 用过；**成员未用过** |
| Lean 五工具（`vibe_v5_lean_*`） | 否（同名工具不存在；数学面只有 op 级） | 否 | 提示词引用 `vibe_v5_lean_archive/lib/read/run` | **否：真机从未跑过** |
| 论文工具（`vibe_v5_paper` / `vibe_v5_finalize_paper`） | **否**（vmu 没有 paper 子系统；v3 的 paper-close 是 v3 pack 策略，不跨 pack） | 否 | 提示词引用 | **否：v5r 无 paper 路径** |

v5r 的三种情形：

- **（甲）内核有面、pack 没声明**：**48 项**（48 个 `vibe_vmu_*` 面都存在，但 v5r 没有声明任何工具；成员只能靠提示词/宿主发现）。
- **（乙）pack 声明了、成员发现不了**：**0 项**（v5r 声明 0 个工具）。
- **（丙）成员根本没有工具**：**17 项**——v5r 提示词引用的 `vibe_v5_assign / fire / hire / nudge / overview / prioritize / record_method / record_progress / record_proposition / record_subproblem / feedback / lean_archive / lean_lib / lean_read / lean_run / read_library / tool_help` 在当前 pack 里**一个都没有声明**（其中 `vibe_v5_tool_help` 连原工具清单里都没有，是提示词自己发明的名字）。

**最刺眼的一条**：v5r 的提示词在教成员调用 **17 个 `vibe_v5_*` 工具**，而 v5r pack **声明了 0 个工具**——成员按提示词调用时，所有名字都不可发现/不可执行。

### 2.1 v5r 提示词与工具面的不一致（原文定位）

- `v5r-blocks-a.js` 教：`vibe_v5_record_progress / proposition / method / subproblem`、`vibe_v5_hire / fire / assign / prioritize / nudge / overview`。
- `v5r-blocks-b.js` 教：`vibe_v5_feedback / lean_archive / lean_lib / lean_read / lean_run / read_library / tool_help`。
- 这些都不在 `packs/v5r` 的声明里；`vibe_v5_tool_help` 在原始 57 个工具里也不存在。

## 3. v5r 57 个原工具 → vmu 面映射

图例：**直接**＝vmu 现有面/op 可直接承载；**需 handler**＝面存在但要写参数/返回/幂等适配；**无对应**＝vmu 没有该能力。

| `vibe_v5_*` | 它做什么 | vmu 对应面（面/op） | 判定 |
|---|---|---|---|
| `record_progress` | 记录研究进展 | `vibe_vmu_records`（append/put，track `progress`） | 需 handler |
| `record_proposition` | 记录命题 | `vibe_vmu_records` append(kind=proposition) | 直接 |
| `record_method` | 记录方法 | `vibe_vmu_records` append(kind=method) | 直接 |
| `record_subproblem` | 记录子问题 | `vibe_vmu_records` append(kind=subproblem) | 直接 |
| `say` | 发言/引用 | `vibe_vmu_meeting` speak；`vibe_vmu_chat` | 需 handler（引用/补记形状） |
| `message` | 给成员发消息 | `vibe_vmu_chat` / `vibe_vmu_mailbox` | 直接 |
| `meeting` | 开会/会议动作 | `vibe_vmu_meeting`（open/speak/silent/hand/refuse/end…） | 需 handler |
| `motion` | 动议 | `vibe_vmu_meeting` ballot/flow（需新 op） | 需 handler |
| `second` | 附议 | `vibe_vmu_meeting`（需新 op） | 需 handler |
| `poll_open` | 开投票 | `vibe_vmu_meeting` ballot / `vibe_vmu_board` | 需 handler |
| `poll_close` | 关投票 | `vibe_vmu_meeting` boxclose | 需 handler |
| `poll_vote` | 投票 | `vibe_vmu_meeting` vote/boxcast | 需 handler |
| `verdict` | 裁决 | `vibe_vmu_meeting` tally / governance | 需 handler |
| `propose_verify` | 提议验证 | v3 verify 的 propos/candidates 是 v3 pack；vmu 无通用面 | 需 handler/无对应 |
| `end_verify` | 结束验证 | 同上 | 需 handler/无对应 |
| `read_library` | 读同事成果库 | `vibe_vmu_records` expand/list | 直接 |
| `task_create` | 建任务 | `vibe_vmu_task` create | 直接 |
| `task_get` | 取任务 | `vibe_vmu_task` get | 直接 |
| `task_list` | 列任务 | `vibe_vmu_task` list | 直接 |
| `task_update` | 更新任务 | `vibe_vmu_task` update | 直接 |
| `task_prioritize` | 任务优先级 | `vibe_vmu_task` update/priority | 直接 |
| `hire` | 雇人 | `vibe_vmu_control` hire | 直接 |
| `fire` | 解雇 | `vibe_vmu_control` fire | 直接 |
| `add_researcher` | 加研究员 | `vibe_vmu_recruit` / control hire | 需 handler |
| `remove_researcher` | 移除研究员 | `vibe_vmu_control` fire | 直接 |
| `assign` | 派活 | `vibe_vmu_task` update/assign + `vibe_vmu_control` | 需 handler |
| `prioritize` | 定优先级 | `vibe_vmu_task` / control tune | 需 handler |
| `grant` | 授权 | `vibe_vmu_control` tune / governance | 需 handler |
| `revoke` | 撤权 | `vibe_vmu_control` tune / governance | 需 handler |
| `configure` | 配置 | `vibe_vmu_set` | 直接 |
| `set` | 设置 | `vibe_vmu_set` | 直接 |
| `start` | 启动 | `vibe_vmu_control` start | 直接 |
| `pause` | 暂停 | `vibe_vmu_control` pause | 直接 |
| `resume` | 恢复 | `vibe_vmu_control` resume | 直接 |
| `stop` | 停止 | `vibe_vmu_control` stop | 直接 |
| `status` | 状态 | `vibe_vmu_status` | 直接 |
| `overview` | 概览 | `vibe_vmu_status` | 直接 |
| `members` | 名册 | `vibe_vmu_control` roster | 直接 |
| `minutes` | 纪要 | `vibe_vmu_minutes` | 直接 |
| `report` | 汇报 | `vibe_vmu_report` | 直接 |
| `nudge` | 提醒 | `vibe_vmu_notify` / `vibe_vmu_activity` | 需 handler |
| `wait` | 等待 | `vibe_vmu_wait` | 直接 |
| `feedback` | 反馈 | `vibe_vmu_reviewers` / notify | 需 handler |
| `self_report` | 自报 | `vibe_vmu_activity` selfReport（需公开 op） | 需 handler |
| `secretary` | 所办代表 | `vibe_vmu_control` / charter | 需 handler |
| `chair_proxy` | 主席代理 | `vibe_vmu_meeting` flow/overrideorder | 需 handler |
| `procedural_objection` | 程序异议 | `vibe_vmu_meeting` refuse/arbitration | 需 handler |
| `reconsider` | 复议 | `vibe_vmu_arbitration` / meeting reopen | 需 handler |
| `resolutions` | 决议 | `vibe_vmu_meeting` / governance | 需 handler |
| `result_record` | 结果记录 | `vibe_vmu_records` put | 直接 |
| `paper` | 论文动作 | **无**（vmu 无 paper 子系统） | 无对应 |
| `finalize_paper` | 定稿论文 | **无** | 无对应 |
| `lean_archive` | Lean 归档 | `vibe_vmu_mathtools`（op 待映射） | 需 handler |
| `lean_job` | Lean 作业 | `vibe_vmu_mathjobs`（job 类型） | 需 handler |
| `lean_lib` | Lean 库 | `vibe_vmu_mathtools`（op 待映射） | 需 handler |
| `lean_read` | 读 Lean 结果 | `vibe_vmu_mathtools` cacheView/receiptsView | 需 handler |
| `lean_run` | 跑 Lean | `vibe_vmu_mathjobs` / mathtools run | 需 handler |

**计数（57 个唯一名）**：直接 **26**；需新 handler **29**；无对应 **2**（`paper`、`finalize_paper`）。
**必须新建内核能力**：`paper` / `finalize_paper`（论文子系统及其 PDF 编译）；其余都可在现有面之上以 pack handler 或新 op 实现。

## 4. 论文子系统 13 个函数

| 函数/概念 | 输入 | 输出 | 状态机位置 | 放哪一层 |
|---|---|---|---|---|
| `paperWritePrompt` | member、paper 记录 | 写作提示词 | drafting | v5r pack（提示词段） |
| `paperReviewPrompt` | member、paper、ofId | 评审提示词 | review | v5r pack |
| `paperAdvance` | paper、active | 下一阶段 | drafting→review→final | pack middleware（读 records 状态机） |
| `paperPass` | 当前 paper | 推进/阻塞结果 | 阶段推进 | pack middleware |
| `paperStep` | 无 | 一步状态推进 | 调度 | pack middleware（tick） |
| `paperRecordPart` | memberId、raw | 写“部分”产物 | drafting | pack（`vibe_vmu_records`） |
| `paperRecordReview` | memberId、raw | 写评审产物 | review | pack（`vibe_vmu_records`） |
| `paperRecordFinal` | memberId、raw | 写定稿产物 | final | pack（`vibe_vmu_records`） |
| `paperCompilePdf` | md/tex | PDF 或具名阻塞 | finalize | **内核能力/特殊脚本插件**（LaTeX 子进程；不是 pack 纯函数） |
| `paperLatexCommand` | 配置串 | 选定引擎命令 | finalize | 设置项（`vmu.paper.*`） |
| `PaperMd` | 论文正文 | md 产物 | 产物 | pack（journal 标题 `v3-paper｜…｜md` 形） |
| `PaperTex` | 论文正文 | tex 产物 | 产物 | pack |
| `PaperArtifacts` / `paperSections` | 论文对象 | 四件产物/章节 | 产物与校验 | pack |

**结论**：13 项里 **11 项可在 v5r pack 内实现**（提示词、状态机、records 写入、产物记录）；**只有 `paperCompilePdf` 必须动内核能力**（LaTeX 子进程/引擎探测，按哲学属于“特殊脚本或插件”，不是 pack 纯策略）；`paperLatexCommand` 是设置项。

## 5. 回执 4 个顶层字段：对应面与“代执行”去留

| 字段 | 对应面/op | 该 op 是否已作为工具发布 | 改走工具调用需要什么 | 建议 |
|---|---|---|---|---|
| `say` | `vibe_vmu_meeting` speak（或 chat） | 是（meeting 面已发布 speak） | 参数 member/text/id；返回值 meeting 回执；幂等需 `idempotency` | 保留代执行，并提供显式工具路径 |
| `progress` | `vibe_vmu_records` append/put | 部分（append 只收 proposition/method/subproblem；通用 track 需扩） | 参数 track/kind/title/body；返回 recordId/指纹；幂等靠 content 指纹 | 保留代执行；扩 records 通用 track |
| `solved` | 内核 solved 标记/verification 结算 | **否**（没有独立工具） | 需新 op（turn/verify settlement）；返回结算回执；幂等按对象/轮次 | 保留代执行，新增显式 op |
| `vote_solved` | 闭题票（closure vote） | **否**（只是回执字段；meeting ballot 不承载该语义） | 需新 op（vote_solved 或 closure poll 工具）；参数 target/round；返回票箱状态 | 保留代执行，新增显式 op |

**“保留还是删代执行”**：建议 **保留**。
- 现有消费者明确存在：v3/v5r 的提示词回执契约、内核的 `turn/reply-parsed`、闭题与验证结算、测试；删掉会破坏这些消费者（红线 4）。
- 两条路**不冗余**：代执行是“成员只输出回执”的适配层，显式工具是“成员主动调用”的审计层；两者共享同一个 service 与同一个 audit 入口。建议在文档里把它们的关系写成“**同一 service 的两个入口**”，而不是两条独立实现。

## 6. SLV 真机从未跑过的路径（如实列出）

- **成员在回合内调用任何工具**：两个包的成员段都被夹具约束为“不调用工具、只输出 JSON 回执”；v5r 的 subagent 成员一旦调用工具会触发 180 秒交付超时（19604 实测）。
- **Lean 五工具**：只在 mock/单测层验证过；真机从未跑过。
- **`mathtools` 面**：只有 root 用过（v3 run 的工具调用记录）；成员未用过。
- **v5r 的 57 个原工具**：真机从未调到；当前 pack 也没有声明它们。
- **v5r 的 paper 子系统**：vmu 里不存在；v5r 真机未跑过。
- **meeting/send**：19612 已跑正反例（空 member 具名拒、真 member-a 通过并落记录），但**只在 v5r 上跑过**；v3 未跑。

## 7. 结论（给 PHASE 7 的备料）

1. **v5r 的核心问题不是“少一个工具”，而是“提示词教 17 个工具、pack 声明 0 个”**——成员发现面与工具面不一致。
2. **57→vmu 面（48 个工具面模块）的映射里，只有 2 个（`paper` / `finalize_paper`）真的需要新内核能力**；其余可在现有面之上以 pack handler / 新 op 实现。
3. **论文子系统 11/13 可在 v5r pack 内实现；`paperCompilePdf` 必须进内核/插件**（LaTeX 子进程）。
4. **回执 4 字段的代执行路径建议保留**（现有消费者明确），但需为 `progress`/`solved`/`vote_solved` 补显式工具 op，避免“只有回执、没有工具面”的长期缺口。
