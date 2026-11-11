# 提示词时机图（TB-2615 轮 B）

**这张图回答什么**：提示词里每一句「你会看到…」「这时该…」都属于某个**事件点**。同一句话出现在错误的事件点，等于教成员在错误的时候等一个东西（RUN 249 的 F-11：`[新到的消息]` 块从未渲染，而提示词四处承诺「下一回合会在最上方看到它」）。本图把时机断言收敛成 **13 行事件点 × 块 × 出现条件**，每行都有机器探针（`tests/vmu-run256-prompt-timing.test.mjs`），正向断言「该出现时出现」、反向断言「别处不出现」。

**探针分两层**（第三列注明）：**装配层**＝用 `scripts/sim/harness.mjs` 的真内核装配一个席位在此事件点会读到的提示词；**决策层**＝`decideSections`（`vibe-math-vmu/packs/v5r/middleware/prompt-switches.js:135`）对该回合的 section 决策——因为会议发言人状态与形式化状态是**回合声明**（`turn.meetingState`/`turn.formalStatus`），装配入口不暴露它们，只能在这一层验。

| # | 事件点 | 相位 / 触发 | 块（section / 渲染） | 该出现（必须 true） | 不该出现（必须 false） | 探针层 |
|---|---|---|---|---|---|---|
| T1 | 开所后第一个普通回合 | normal，round 1 | 回合标题 `v5r-turn-heading` | `heading.round1` | `heading.meeting`、`heading.heartbeat`、`section.chamber` | 装配层 |
| T2 | 普通回合，无未读通知 | normal，邮箱空 | `[新到的消息]` 块（`packs/v5r/notices.js:102`）；`v5r-brief-status` | `section.briefStatus` | `notice.block`（空邮箱也渲染具名空块头，不是通知丢了） | 装配层 |
| T3 | 收到私信后的下一回合 | normal，`mailbox.send` 产生一行 | `[新到的消息]` 块首行 `【邮件·<from>】<主题>；读后 mailbox ack <id>` | `notice.block`、`notice.ackLine`、`notice.idAligned` | — | 装配层 |
| T4 | 读完并 ack 之后 | normal，`mailbox.ack` 结算 | —— | `section.briefStatus`（回合照常） | `notice.block`（ack 是唯一结算：open 只标已读） | 装配层 |
| T5 | 积压超过上限 | normal，10 条未 ack | 只渲染最新 8 行、最新在前（`MAILBOX_NOTICE_LINES_MAX = 8`，`kernel/mailbox.js:57`） | `notice.capped8`、`notice.newestFirst` | — | 装配层 |
| T6 | 会议回合 | meeting，绑定会议 id | `v5r-turn-meeting-chamber`、`v5r-turn-meeting-agenda` | `section.chamber`、`section.agenda` | `heading.round1`（会议标题不是「第 N 轮」） | 装配层 |
| T7 | 会中别人在发言 | meeting，`meetingState:"others"` | `v5r-meeting-others`（转述他人发言并自带状态块） | `state.others`、`state.briefOff` | `state.invited`、`state.first` | 决策层 |
| T8 | 你是首位发言人 | meeting，`meetingState:"first"` | `v5r-meeting-first` | `state.first` | `state.others`、`state.invited`、`state.noneOutsideMeeting` | 决策层 |
| T9 | 验证轮 | verify | 标题 `【验证轮 —— …`、`v5r-verify-core` | `heading.verify`、`section.verifyCore` | `heading.round1` | 装配层 |
| T10 | 心跳检查 | checkpoint | 标题 `【心跳检查 —— …` | `heading.heartbeat` | `heading.round1` | 装配层 |
| T11 | 每个回合的形式化状态行 | normal / verify / checkpoint（`formalStatus` 缺省 none） | `v5r-formal-status-*`（passed / blocked / attempted / none）恰好一条 | `status.exactlyOne`、`status.defaultNone` | `status.passedShown` | 装配层 + 决策层 |
| T12 | 临时工回合 | normal，role=temp | `v5r-charter-roster-temp*`（角色专属块只给该角色） | `section.rosterTemp` | `section.rosterTempChair` | 装配层 |
| T13 | 论文/蓝图/结题已有真实状态之后 | normal；账本里有 `paper-state` 行（蓝图同理看 `blueprint` 行） | 状态板 live 三组 `[论文]`/`[蓝图]`/`[结题]`（`renderLiveStatus`，`kernel/turn/index.js`） | `status.paperLine` | `status.paperLineEarly`（没有持久行就不渲染空行——不是「没读」，来源与 why 仍在回执） | 装配层 |

**这张图的边界**：① 装配层探针只覆盖 `assembleFor` 暴露的输入（phase/meeting/member）；会议发言人状态见第三列。② 投递失败（`mailbox/notice-lines-failed`）**不进本图**：它的可见形态是回执里的 `notifyFailed`/`deliveryFailed`，下一回合不产生新行；提示侧的正确教学是「别把约过当通知到、失败名单才要补发」，已由 §11/§12 与轮 A 事实表覆盖，轮 D 再补回执级同源断言。③ 行内 `出现/不出现` 单元格是探针键名（非文本片段）：键在 `tests/vmu-run256-prompt-timing.test.mjs` 的测量表里必须存在，改名或增行而不同步 ⇒ 红。

## TB-2717 补记：三个「时机点」口径（无新探针行，判据在 `tests/vmu-run77-prompt-phase-and-votes.test.mjs`）

- **派回合时**（normal）：`phase` 是**闭集四个全名** `heartbeat`／`paper-write`／`paper-review`／`paper-final`；`review`／`write`／`final` 是论文流程里的**动作词**，不是相位名——写成它们发生在「派回合」这个事件点，回执是 `VMU_INVALID_ARGUMENT unknown phase`（RUN 76 真机：成员写 `phase:"review"`）。`paper-review` 回合的产物是**评审票**，不是结题票。
- **会议里表决时**（meeting）：结题票在三个层各有一个名字——**动作**走会议骨架 `vibe_vmu_vote`，**reply 字段**是 `vote_solved`，`set_solved` 不存在（旧任务书写法）。三者不是同义词替换题，混用发生在「会议回合决定要不要结题」这个时点。
- **round 递增之后**（advance 的分歧 bounce，或 `final{revise}` 退回重写）：上一轮评审票**全部作废**，即使正文一字未改也要在本轮重投；回执 `stale` 点名的成员是**还没在本轮投的人**（不是拒绝、不是已投过）。这是 RUN 76 里 r-1 反复投旧票被 `stale` 打回的事件点，教学放在 `v5r-paper-review` 段（`paper-review` 相位装配时可见）。

## TB-2725 补记：RUN 77 六处「照提示词做会做错」的更正（判据在 `tests/vmu-run77-prompt-corrections.test.mjs`）

| # | 事件点 | 旧句（会误导） | 新句 | 为什么（真机证据） |
| --- | --- | --- | --- | --- |
| 6 | 会议回合投结题票 | 「结题表决用 `{"vote_solved": true\|false}`（只有它计结题票）」 | 「结题票用 `vibe_vmu_vote`（唯一入口，计 `vote_solved`）；只有它不可见时才写回执 `{"vote_solved": true\|false}`（可见时被静默忽略 `kept:false`）」 | `kernel/turn/index.js:4191-4198`：工具可见时 reply 的 `vote_solved` 记 `kept:false` 静默忽略——照旧句写会白投且不自知（RUN 77 四席恰好都用了工具才没暴露） |
| 4 | 写回执时 | 「四个字段就够」与「29 个见 `replyCatalogue=full`」并存；`say` 三去处未说 | 字段以【回执字段目录】为准、最小集四字段；`say`：绑会→发言；未绑→留 `notes`；错会→跳过 | 两处口径并存会让读者在「背副本」与「查目录」之间摇摆；`say` 的三种投递结果决定句子是否真的送达 |
| 5 | `advance` 后准备 `final` | 只说被 `VMU_OFFICE_CONSULT_REQUIRED` 拦时怎么办，未预告会在哪一步撞门 | chair 论文流程行补「（advance 后可能撞门：先问所办）」；paper-final 段的重复问询门 bullet 删除，只留 core 唯一权威句 | 主席一回合跑到 `final` 才发现要人、白跑一轮（RUN 77 t-7）；同一教学两处并存还会漂移 |
| 7 | 临时工参会 | convene 段与 hiring 段各写一次「不参会/无表决权」 | 「临时工：可读可群聊（`vibe_v5_say`），不入会、不投票」只留一处 | 同一事实两处措辞不同，读者无法判断哪句是权威 |
| 8 | 主席 `close` 前 | 只说 closeRequiresChair，未说未到场者会让 close 失败 | 补「有 roster 未到场者时，`close` 前先问 `status.present`」 | 主席一回合把 m1/m2/m3 全 close，r-1 `attend` 得 `VMU_NO_SUCH_OBJECT`（RUN 77） |
| 9 | park 之后 | 只说先答→abandon→再派，未说解析失败会释放 park | 补「解析失败会释放 park（下条 `step` 开新回合）」 | RUN 77 t-9 `VMU_TURN_NO_FENCE` 后 park 被释放、下一条 step 开了 t-10，读者以为还在同一个 park |

## TB-2732 补记：RUN 78 七处「照提示词做会做错」的更正（判据在 `tests/vmu-run78-prompt-corrections.test.mjs`）

| # | 事件点 | 旧句（会误导） | 新句 | 为什么（真机证据） |
| --- | --- | --- | --- | --- |
| D4 | 找记录本库根时 | 「看回执的 `libraryRoot`」 | 「看回执 `roots.libraryRoot`」 | 回执顶层键是 `roots.libraryRoot`；r-1 按旧句把 proof_ref 写错位置、rec-4 作废（RUN 78） |
| D5 | 会议回合投结题票 | 「工具可见时回执的 `vote_solved` 被静默忽略（`kept:false`）」 | 「结题票用 `vibe_vmu_vote`（唯一入口，计 `vote_solved`）；回执写 `{"vote_solved": true|false}` 只在**可证该回合没挂投票工具**（`keptWhy:"tool-not-mounted"`）时计票，否则 `kept:false`——看 `keptWhy` 改渠道」 | TB-2730 已落地：**可证空表**才是唯一计票态；其余四值均不计票（TB-2732 先删旧承诺，TB-2730 落地后写回真实条件） |
| D6 | 会议结题判定 | 「表决人数达到法定人数 m = min(…) 且无人投反对」 | 「全体有表决权者一律投 true；m 是辩论裁决下限，不是结题分母」 | `closureVote.castMeaning`：4/4 才 `cast:true`；m=3 只是裁决 floor——旧句会让主席在 3/4 时就以为能结题 |
| D7 | 交回执时 | 一处「不要调用 `op:"reply"`」、一处「用一次 `op:"reply"` 交回」 | 按投递路径分流：activation ⇒ 只写围栏；caller 代转 ⇒ `vibe_vmu_turn { op:"reply", report:{…} }`（或 `op:"step"` 带 reply） | 两条路径的应答通道不同，同一句笼统禁令会让 caller 派发的席位不知道该怎么交回 |
| C7 | 论文 `final` 撞问询门 | 只在 paper-final 相位教 `VMU_OFFICE_CONSULT_REQUIRED` | chair **normal** 可读段保留该码与 `consult` 出口教学（唯一一处） | 相位限定段的「等于没教」；parity S4b/S5a 也依赖 normal 文本命中 |
| C9 | 所办职责 | fixture-tools / seat-act-boundary / charter-org / report-duty 各写一遍「只派回合与转达」 | 只留 fixture-tools 一句权威句，charter-org 删「立所、雇佣」复述 | 同一事实四处措辞不同，读者无法判断权威；重复也挤占预算 |
| C10 | 成员/临时工拿 `vibe_vmu_turn` | 工具面挂了它，暗示成员能自己 step | 「成员/临时工：`vibe_vmu_turn` 只有 `op:"status"` 有意义（step/drive/abandon 是所办/主席的动作）」 | 成员跑不了 step（产品侧归 TB-2733）；提示词不再暗示 |

## TB-2730 补记：D5 方向写回 + 成员面 `op:"reply"` 限定（判据在 `tests/vmu-run78-prompt-corrections.test.mjs` §2/§4）

- **D5 的正确方向是「可证空表才计票」，RUN 78 的缺陷是把「不可证」读成了「可证空表」**（`kernel/turn/index.js:4304-4329`：`tool-not-mounted` ⇒ `kept:true` + recordClosureVote；`tool-visible`/`tool-used-this-turn`/`tool-visibility-unprovable`/`legacy-row` ⇒ `kept:false`）。提示词现在只说这条事实与五个 `keptWhy` 值，不再承诺笼统的静默忽略。
- 成员/临时工面：`op:"reply"` 的教法从「唯一应答通道」改为**显式禁止**（所办代转才用；成员调用会被 `VMU_NOT_PERMITTED` 拒），caller 句加「（所办代转时）」限定——配合 TB-2733/P1 把成员 `vibe_vmu_turn` 动作集收窄到 `{op:"status"}`。
