# Phase 12 — v5r 运行规则一致性台账（逐条核查 vmu + v5r pack）

本台账是用户 2026-10-23 给出的《v5r pack 的运行规则》的**逐条对照表**。它不是设计文档，是**证据表**：
每一条规则都要能指到 `文件:行` 或命令输出，否则记「待核」，不得记「没问题」。

## §0 读法与状态词

| 状态 | 含义 |
|---|---|
| ✅ 已实现 | 有机制、有读点、有门禁/断言，且能指到位置 |
| ⚠️ 部分 | 机制在但不完整，或缺门禁，或只在一部分面上生效 |
| ❌ 缺口 | 规则要求的机制**不存在**（"没有机制"本身是缺口，不是待核） |
| 待核 | 本轮还没查到这里；**不得**当成通过 |

★ 判定纪律：**「提示词里写了」不等于「机制存在」**；**「工具声明了参数」不等于「参数被消费」**。
本台账的「门禁」列指**机器可失败的检查**（测试/审计脚本/schema 校验），没有门禁的规则只能算"靠自觉"。

## §1 成员（A）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| A1 | 所办＝主代理：用户助手；有进展时自动唤起汇报；是用户与研究所的媒介/传信者；支持用户用自然语言让所办设参数、控制进程 | ⚠️ **部分**（`lane-rows-b.md` A1）：机制真存在——汇报原语 `kernel/report.js:100`、`:372` 真投递、`:44` 无 transport 时**具名拒** `VMU_REPORT_NO_TRANSPORT`；pack 三条策略＋enabled `packs/v5r/prompts/v5r-core.js:150-195`；tick 挂在 `agent/turn-stopping`（`vibe-math-vmu.js:767-790`）；设参/控制面 `packs/v5r/tools.js:1152-1205`（只许声明键，start/stop/pause/resume 是真工具）。**两处断点**：① `config.deliver` 是部署缝、默认 null ⇒ 仓内闭环走不完；② **传信是单向的**——mailbox 没有 `'office'` 收件人，所办也不是席位（`v5r-core.js:214-218` 只有 chair/member/temp）⇒ "用户与研究所的媒介"只有"所→用户"，没有"用户→所"。★ 未判定：自动唤起的真机效果取决于部署侧 `deliver` 实现 | `tests/vmu-*report*`（如有）＋上述行号；**缺口无门禁** | ⚠️ 部分 |
| A2 | 院士：主席席位，主持/决策会议 | ✅ **机制＋消费者，两向已测**：主席席拒绝（`packs/v5r/tools.js` `toolOverview`，座位判定 `:198-201`，**以函数名定位、行号只作快照**——该文件正被并行改写）、会议主席动作轨 `requireChairSeat` `:482-488`，以及本轮刚落的三条院士权轨（只有主席能召开／关闭／延长，见 §8）；表决席位是**声明值** `vmu.meetings.eligibleSeats`（`settings/schema.js:1101` 声明、`kernel/meetings.js:132,350-363` 消费、空列表回落全名册）＋ `chairNeutral` 禁止主席对自己动议投赞成 | `tests/vmu-a2a3-seats-and-bounds.test.mjs` **17/0**（chair⇒ok／非 chair⇒`VMU_NOT_PERMITTED` 点名主席／未知成员⇒具名拒且 hint 所指替代读点存在） | ✅ 已实现 |
| A3 | 常驻研究员 | ✅ **机制＋消费者，四向已测**：`vibe_v5_start` = `toolStart`（`:1050`）的 `researcherCount` 默认 3（`:1051`）、域 `0..50` 越界具名拒 `VMU_INVALID_ARGUMENT`（`:1052`，带 hint、零副作用）；省略⇒3／`0`⇒合法且真坐 0 人／`51`、`-1`⇒具名拒 | 同上（`tests/vmu-a2a3-seats-and-bounds.test.mjs` 17/0，含「0 合法」与「越界零副作用」两向） | ✅ 已实现 |
| A4 | 临时工：被院士/常驻研究员雇佣做特殊/临时任务；**无表决权**；**默认不参与会议**；可雇佣/解雇 | ⚠️ **部分**（`lane-rows-b.md` A4，**并更正原文**）：雇佣 `packs/v5r/tools.js:160-175`／解雇 `:308-329` 有门禁；**无表决权是真门**（`kernel/meetings.js:921-930` ＋ quorum 分母求交 `:356-363`，`tests/vmu-meetings.test.mjs:766-767,795-802`）；★ **但"默认不参会"没有机器门**：`attend()`（`kernel/meetings.js:614-650`）只查在册，temp 也能到场。**原文写"由 `vmu.meetings.eligibleSeats` 表达"是错的**——该键只表达**投票权**（vote 门 ＋ 分母），不表达入会；已改为"默认不参会＝流程约定（无门禁）" ⇒ 这是一条**已确认缺口** | 雇佣/解雇与投票权有两向断言；**入会无门禁** | ⚠️ 部分 |

## §2 文件与归档（B）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| B1 | **公共 Verified 文件夹**：只有布尔概率＝1 的命题（或参考文献中的命题）可加入；**只有辩论能把概率改成 1**，否则只能∈(0,1) | ★ 实测 `grep -rn "Verified" --include=*.js vibe-math-vmu/ \| wc -l` ＝ **85 条 / 15 个文件**（原写"只命中 auditchain"是**假阴性**，已更正：`grep -rln` 列出 15 文件）——但逐文件看：v5r 侧命中**全在 5 个提示词文件**（`prompts/v5r-assistant|blocks-a|blocks-b|core|persona|prompts.js`，是文字），代码侧命中是 `kernel/auditchain.js`(anchorVerified，无关)、`kernel/crypto.js`、`kernel/records.js`、`kit/paper.js` 与 **v3 pack**（`packs/v3/index.js`、`middleware/dataplane.js` 的 promoteVerified…＝v3 真的做过）。⇒ **v5r pack 没有 verified 轨/kind/字段**（`packs/v5r/settings/defaults.json` 十条轨无 verified；`kernel/records.js:457` 只有 `settled`），★ **本轮补齐（此前是 ❌）：机制已落地，提示词未跟上**。承载＝公共轨 `verified`（`packs/v5r/verified.js`：`VERIFIED_TRACK/KIND`、单写入器 `promoteVerified`、`parseVerified`；轨/kind 由 pack 在 `settings/defaults.json` 声明）；闸＝`packs/v5r/verification-gates.js` 四条纯谓词已各自接到真实调用点（`p1Intent`→三个记卡 handler、`debateSubjectGate`→辩论开会、`singleWriter`→促升、`fidelityAsked`→裁决前），`vibe_v5_verified_promote` 是唯一促升入口。**仍缺**：提示词里没有任何一段告诉成员"verified 轨存在、p=1 只能来自辩论"（F5 一并重写）；且没有真机验证过 | `tests/vmu-verified-track.test.mjs` **72/0**、`tests/vmu-verified-gates.test.mjs` **95/0**、`tests/vmu-v5r-tools.test.mjs` **339/0** | ⚠️ 部分 |
| B2 | **公共蓝图**：实现总目标的完整技术路线设计/策划；按时更新；院士+常驻研究员共同设计；**最终编辑权归院士** | ❌ **缺口**（`lane-rows-b.md` B2）：`vmu.turn.protocolPath`（`settings/schema.js:212`，pack 默认 `Shared/Protocol.md`，`defaults.json:12`）全仓**只有两处提示词插值**消费者（`v5r-blocks-b.js:236,584`），**没有任何编辑权闸**，middleware 五个文件里零写权规则 ⇒ 这是**路径约定，不是机制**（台账纪律：提示词里写了 ≠ 机制存在） | 无 | ❌ 缺口 |
| B3 | 各自 progress | ✅ **机制＋消费者**（`lane-rows-b.md` B3）：`vibe_v5_record_progress`（`packs/v5r/tools.js:1415` → `kit/handlers.js:96-135`）、轨 `defaults.json:19`、turn 自动写（`kernel/turn/index.js:50-60`）、读者＝`read_library` 四轨含 progress（`kit/handlers.js:264`） | `tests/vmu-v5r-tools.test.mjs:122-131` | ✅ 已实现 |
| B4 | 已尝试路线/方法及进度 | ⚠️ **部分**（`lane-rows-b.md` B4）：`methods` 全链 ✅（`kit/tools.js:22` ＋ read_library）；**`routes` 写得进去但读不出来**——`kit/handlers.js:264` 硬编码四轨（不含 routes），而 `kernel/records.js:582` 的 `records.list({track})` 本身支持任意已声明轨。★★ 更糟的是 `host.js:836` 的 hint 写着"先按 track 收窄"，而 `vibe_vmu_records` 面**没有 track 参数**（`host.js:805-812`）⇒ **假 hint**（比不写更误导） | methods 有断言；routes 无读面无门禁 | ⚠️ 部分 |
| B5 | 遇障路线/方法/障碍及原因归档 | ⚠️ **部分**（`lane-rows-b.md` B5）：`obstacles`／`rejected` 与 B4 同族——**写有读无**（`read_library` 四轨不含它们） | 无 | ⚠️ 部分 |
| B6 | 命题库：完整定义＋布尔概率∈[0,1]＋进度；证明过程平时只写「证明/证伪**尝试**」字段；真会证了才写正式证明/证伪；**只有含正式证明（写完）的命题卡才能用于辩论**；概率＝1 要标记 verified | track `propositions` + `vibe_v5_record_proposition`（必填 statement/value/motive/p）；"正式证明"字段是**成员文件** `Members/<id>/Propos/<pid>.md` 的 `## 证明尝试/## 证伪尝试`；★「只有正式证明写完才能进辩论」的**机器闸**未找到 | 无 | ⚠️ 部分 |
| B7 | 方法库（一般化/推广/抽象出工具、理论框架） | ✅ **机制＋消费者**（`lane-rows-b.md` B7）：`vibe_v5_record_method`（`packs/v5r/tools.js:1427`）＋ `methods` 轨 ＋ `read_library` 可读 ＋ 轨校验 | `tests/vmu-v5r-tools.test.mjs` 记卡正向组 | ✅ 已实现 |
| B8 | Lean 代码＋编译结果归档；**lean 通过 ⇒ 辩论只查描述/定义符合性 ⇒ 符合即概率＝1 且可入 verified**；参数可开「鼓励形式化」开关 | `vibe_v5_lean_run/job/lib/read/archive`；`vmu.math.leanJobsMaxParallel`；★ lean-pass → 概率＝1 的联动**未找到** | 无 | ❌ 缺口（联动） |
| B9 | 分派后各自负责部分的论文 | ✅ **机制＋消费者**（`lane-rows-b.md` B9）：政策壳 `packs/v5r/paper.js` ＋ 真流程 `kit/paper.js`（start `:346`、recordPart `:372`、环形互审 `:416-424`、deliverable 是**真布尔**判断 `:399-412`、全员 true 才 awaiting-editor、`recordFinal` 仅主席 `:461`、九节由 parts 按 id＋指纹重组 `:526`）；工具面 `packs/v5r/tools.js:1667` 含 `consult`／`consult_state` | `tests/vmu-v5r-tools.test.mjs` 论文正反组 ＋ `tests/vmu-paper-office-consult.test.mjs` 65/0 | ✅ 已实现 |
| B10 | 脚本文件 | ⚠️ **部分**（`lane-rows-b.md` B10，口径由 Lead 裁定＝「脚本作为所级产物应可归档／复核」才算实现）：**能写**——成员用基座 write 面写脚本文件；**临时跑被真规则拒**（`packs/v5r/prompts/v5r-core.js:224-241`，码 `VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS`，`tests/vmu-entry.test.mjs:392`）；**但"脚本声明／归档／复算"面不存在**，而规则 hint 里写着"归档/复算流程" ⇒ **承诺无落点**（与 B4 的假 hint 同类） | 禁用临时脚本有断言；归档/复算无面 | ⚠️ 部分 |
| B11 | 自反馈库：问题/冗余/障碍/可优化点与方案；**院士另含对各阶段（平时/会议/辩论）流程与组织协作的自反馈优化** | ⚠️ **部分**（`lane-rows-b.md` B11，成员侧 a／院士侧 b 分开判）：**a 成员侧 ⚠️** — `vibe_v5_feedback`（`packs/v5r/tools.js:404-440`）三 op、路由必填、interpersonal assessment `:402,:422-425`、`feedback` 轨 `defaults.json:19`、提示行 `v5r-blocks-b.js:89-108`、门禁 `tests/b1prime-feedback-gate.test.mjs`；**但** `read_library` 四轨不含 feedback ⇒ **他人读不到自己之外的反馈**；且 `v5r-blocks-b.js:105`「未闭环条目会出现在汇报与总览的计数里」经复核**确为假承诺**（`packs/v5r/tools.js:177-193` report 与 `:196-215` overview 的 counts 都没有 feedback）。**b 院士侧 ❌** — `grep -rEn "复盘|阶段自|流程优化|组织协作" packs/v5r/` **零命中**，category 是自由串、无阶段维度、无院士专属面/读面/门禁 | a 有门禁；b 无 | ⚠️ 部分 |

## §3 平时研究推进（C）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| C1 | 平时推进的完整流程（从目标到产出） | ✅ **机制＋消费者**（`lane-rows-c.md` C1）：任务板（`vibe_v5_task_*`）→ 记卡四轨 → `read_library` 读回 → 论文阶段的 parts 组装，全链有工具面与门禁 | `tests/vmu-v5r-tools.test.mjs`、`tests/vmu-task-*` | ✅ 已实现 |
| C2 | 成员之间可以互相通信；紧急情况可私信 | ⚠️ **部分**（`lane-rows-c.md` C2）：三通道机制齐（`say`／`message`／`inbox`），通知文本真机验过；**但"紧急私信"对成员不可达**——`vibe_v5_say` 的 DM 分支没有 `urgent`（`kit/handlers.js:204-210`），紧急只能走**没被教过**的 `vibe_vmu_mailbox`；`inbox` 行 8 个字段里也没有 `urgent` ⇒ 机制在、入口不在成员的可见面里 | 通道有断言；紧急面**无门禁** | ⚠️ 部分 |
| C3 | 状态面板：写自己 / 看他人 / 时间戳 | ⚠️ **部分**（`lane-rows-c.md` C3）：写自己（`track=state`）、看他人（`vibe_vmu_records`）、时间戳都在；**但四个必需内容零闸**，提示词里连"状态版"都没有，且被教的 `vibe_v5_read_library` 硬编码四条轨、**读不到 state**（`kit/handlers.js:264`） | 无 | ⚠️ 部分 |

## §4 会议（D）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| D1 | **只有院士**能预约会议（可设预约时间；到点人未齐可进等待；超时未齐由院士自决） | **四半都落了**：① 召开权 `open()` 的 `vmu.meetings.conveneRequiresChair`（装配主席必须自报 actor 且等于该主席：不能替别人开、不能匿名开）；② **预约时间** `open({at})` ⇒ `state:'scheduled'` + `scheduledFor`，`vmu.meetings.scheduleAllowed:false` 时具名拒；③ **等待阶段** 到点人未齐 ⇒ `state:'waiting'` + `waitStartedAt` + `waitDecisionDue`，`vmu.meetings.waitOnDueMs` 决定何时催；④ **超时自决** `proceed({meeting, actor, decision:'start'|'lapse'})`，`vmu.meetings.waitDecisionRequiresChair`（v5r=true）⇒ 非主席具名拒；到点人齐 `syncMeeting` 自动 `started` 并记 `startedLate` | `tests/vmu-meeting-types.test.mjs` §5a/§6（含"设了值≠生效了"的 scheduleAllowed=false 反例、人齐自动开、等待态、非主席 proceed 被拒、无轨时 proceed 具名不可用） | ✅ 已实现 |
| D2 | 院士召开、关闭、**延长时长上界**；院士主持 | **三条都有了**：`open()` chair 轨；`close()` 的 `vmu.meetings.closeRequiresChair`（须 actor＝本会主席，否则具名拒）；`extendWall({meeting, ms, actor, why})`＝**会议级**延长（正步长校验、`vmu.meetings.extendCeilingMs` 天花板 4h、越过具名拒、回执带 before/after/actor/why，且**延长后的界真的被 speak 消费**）。主持＝`chairNeutral`/`order`/`interrupt`/`recess`/`queueGate` | `tests/vmu-meeting-types.test.mjs` §5b/⑤c（8 断言，含"延长是假的就会红"的两条）＋ 内核面 `extendlimit` 可达性 | ✅ 已实现 |
| D3 | 院士设：标题、**类型**、内容事项、邀请成员、时长上界 | **五个字段都可设且都可读回**：标题＝`open({title})`（**新加的独立承载字段**：非字符串具名拒、空白归一 null，回执/`summary()`/`meetingView()`/`meetings/opened` 全能读到）；类型＝`type`（`vmu.meetings.typeCatalog` 六值，未知具名拒并列合法值）；内容事项＝`materials`（★ 原来**只用于 `materialsRequired` 校验然后被丢弃**，`m.materials` 零读者 ⇒ 现在作为指针承载并在两个读面回吐，非字符串具名拒）；邀请成员＝`roster`；时长上界＝`hardLimitMs`（可 `extendWall` 延长） | `tests/vmu-meeting-types.test.mjs` §1–§4 + §3b（标题/议程各 6 条，含"同议程不同标题 ⇒ 不同标题"证明不是派生） | ✅ 已实现 |
| D4 | 院士通过命令自组织、决策会议中一切内容/控制/活动 | **✅ 命令面齐备且在 41+21 个活工具里**：内核面 `vibe_vmu_meeting` 的 action 枚举（`tools/meeting.js:26`）含 `open/speak/silent/hand/hands/refuse/invite/invitedspeak/end/agendaclose/agendaitems/leaverequest/leaveapprove/leaverequests/aggregation/complete/phase/status/summary/snapshot/close/extend/extendlimit/lapse/revokelapse/ballot/vote/tally/reopen/freeze/unfreeze/boxopen/boxcast/boxclose/boxreopen/boxlapse/boxrevokelapse/second/withdraw/flow/overrideorder`；主席专属约束是**运行期具名拒**而非命令缺失（`chairNeutral`/`closeRequiresChair`/`conveneRequiresChair`/`extendWall`）。★ 注意：pack 面 `vibe_v5_meeting` 是**单用途 open**（D1 收口），主持动作走内核面 | 上面的枚举行号＋`tests/vmu-meeting-types.test.mjs` §5a–§5d；内核面 `extendlimit`/`proceed`/`attend` 可达性各 1 断言 | ✅ 已实现 |
| D5 | **特殊类型会议下框架初始给院士推荐流程骨架**，实施/是否遵循完全由院士决定 | `packs/v5r/meeting-procedures.js`：`MEETING_PROCEDURES.debate` 四步骨架（①各成员同时独立发表 布尔概率+理由 ②轮流/举手/邀请展开、轮数由院士定 ③结束前各自最终裁决 ④聚合），每步只写**真实存在的工具**，第④步未实现⇒回执 `pendingSteps` 具名；明确 `binding:'recommendation'`（骨架不是闸，采纳与否完全由院士定）；其余五型 `procedure:null`＋具名理由（不发明流程） | `tests/vmu-meeting-types.test.mjs` §2–§3（含"骨架里每个工具名都真的在 41 个工具里"的反查） | ⚠️ 部分 |
| D6 | 允许一次性设置**连续展开的多个会议** | `open({sequence:[…]})`：每个后续会议的描述符**在任何事发生前**就校验（错在第 3 个当场拒，不是等三个会议之后）；描述符不许自带 chair/actor（否则是绕过召开权轨的第二条召开路径）；`advanceSequence` 在当前会议 `close()` 时把下一个转成 `scheduled` 并继承主席；`seqInfo` 在 `summary()`/`meetingView()` 报告 `{index,total,next}`；整串超出 `extendCeilingMs` ⇒ 具名拒 | `tests/vmu-meeting-types.test.mjs` §8（序列开 2 个、描述符非法当场拒、关一个自动启下一个、越界拒） | ✅ 已实现 |
| D7 | 成员可用命令/工具**按会议类型和身份**有差异 | **机制有；差异用「拒绝」实现，不是「看不见」**：① 可见工具表按成员是活的（`host.js:1681-1691` `turn.setVisibleToolsProvider` 返回该成员 Agent 的真实工具表；`:1722-1729` `visibleToolsOf` 无 live Agent ⇒ 具名拒；`vibe_vmu_tools` 可读回）；② 但 v5r pack **没有按席位/按类型裁剪的工具面**——41 个工具对所有成员同名同量（`packs/v5r/middleware/` 只有 artifact-counter / motion-box / paper-dispatch / prompt-switches / stall-meeting，无 toolfilter；对照 v3 有 `packs/v3/middleware/toolfilter.js`）；③ 身份差异落在**内核轨**：主持专属动作由 `requireChairSeat` / `chairNeutral` / `closeRequiresChair` 等**运行期具名拒**（§5a–§5d）；④ 类型差异只到回执里的 `procedure` 骨架（`packs/v5r/meeting-procedures.js`），不改变任何命令是否可用 | `tests/vmu-meeting-types.test.mjs` §5a–§5d（拒法逐条钉死）＋ 上面 4 处 `file:line` | ⚠️ 部分（**按类型零差异**：类型不改变可用命令，只附带骨架文案） |
| D8 | 会议类型含：正常、学术交流、辩论、结题、论文交流、未来规划/策划… | `MEETING_TYPES` 六值（normal/academic/debate/final/paper/planning）＋ v5r 声明 `vmu.meetings.typeCatalog` ⇒ 类型**不再是死字段**：存储、回读、白名单、按类型取骨架（`procedureFor`）、内核 `committee` 结题报告轨都按它走 | 同上（未知类型具名拒；回读 summary/meetingView 都有 type） | ✅ 已实现 |
| D9 | 常见命令：举手发言、邀请发言、**批量指定成员按顺序发言**、单次发言版群聊（权限区分，部分仅主持） | vmu-pack D9 lane 交付（67 断言）：`hand`(举手)、`invite`(邀请，具名 why，主席/秘书轨)、`queue`+`order`(排序＝批量指定顺序)、`invitedspeak`(仅主持)、`vibe_v5_say`(群聊)＋`attend`(入场，原来没有入口)；pack 面新增 `vibe_v5_meeting{action:'hand'|'hands'|'invite'|'attend'}`。★ 回执字段 `meeting_hand`/`meeting_invite` 已被内核标为 `noReplyShape`（回执里没有会议引用，派发只会得到 "no such meeting: undefined"；`invite→attend` 还会让邀请人自出席） | `tests/vmu-meeting-invite.test.mjs` / `tests/vmu-turn.test.mjs` T16c–T16g | ✅ 已实现 |
| D10 | 特殊活动：投票板（选项＋最多/最少选几项机制）、任务板设置与认领/交派、群聊式交流（院士为群管，可设权限/发言次数/禁言） | ⚠️ **部分**（`lane-d10-members.md` 四个子项逐条）：**投票板 ✅** —— 规则校验 `kernel/ballotbox.js:169,178-200`，越限**具名拒** `:271-277`（`VMU_BALLOT_CHOICE_COUNT`），pack 面把 `min/max/mode/min_votes/allow_revote` 翻译进 rules 并回报 applied/unapplied（`packs/v5r/tools.js:636-648`）；**群聊 ✅** —— 六键声明并接线 `kernel/chat.js:31-35,40-42`，非管理员具名拒 `:280-290`（`VMU_CHAT_NOT_ADMIN`）、禁言具名拒 `:341-343`（`VMU_CHAT_MUTED` 带解除时刻）、配额具名拒 `:349-357`（`VMU_CHAT_QUOTA_EXCEEDED` 带 used/limit/窗口）；**两套机制不重复** —— 群聊侧 `chat.js:31-35` 与会议侧 `meetings.js:179-182` 地址的是**不同对象**（会话发言 vs 会议发言），非同一件事双口径；**任务板认领/交派 ⚠️** —— 面覆盖全（`kit/extras.js:96-129` 七动作＋真交派 `packs/v5r/tools.js:258-290`），**但 claim/assign 的审计事实没有 `by`**：`kernel/tasks.js:302` 只记 `who`，`kit/extras.js:100-111` 也不收 `by`（同一模块的 `setPriority` 记了 `by`：`kernel/tasks.js:278`）⇒ 事后无法区分"自己认领"与"被院士交派" | 投票板/群聊门禁见左；任务板审计面未记操作者 | ⚠️ 部分 |
| D11 | **辩论类型会议有额外字段：辩论的对象或对象文件引用** | `open({subject})`＝字符串引用（卡 id / 文件路径 / 一行陈述）；非字符串⇒`VMU_INVALID_ARGUMENT`（带 typeof），空白⇒归一 `null`；辩论会议缺 `subject`⇒pack 具名拒；`vibe_v5_meeting` 的 `target` 是它的**活别名**（原来声明了没人读）；回执/`summary()`/`meetingView()`/`meetings/opened` 全能读回 | 同上 | ✅ 已实现 |
| D12 | 辩论/结题**表决人数下限** ≥ min(用户设置数, 院士+常驻研究员数) | **两个面都满足，且第二个面有证明**：① 表决面＝`quorumOf()` 第三项由「在场人数」换成「**可投票成员数**（名册∩`eligibleSeats`，临时席位 `temp` 不计）」⇒ `need = min(quorumMin/Ratio, quorumCap, 可投票成员数)`，`vote()` 上可观测；② 结题面＝`closureVoteOf` 的全一致性**在数学上包含下限**：`floor = min(setting, universe) ≤ universe = 全一致性所需票数`，所以"沉默阻塞结题"这条既有纪律本身就强于规则要求的下限；用户设置数在结题路径不是"不生效"，而是**被更强的约束支配**（这一条是本次改台账时补的证明，不是推断） | `tests/vmu-meetings.test.mjs` 6 条 + 上面的包含关系 | ✅ 已实现 |
| D13 | lean 已通过但概率非 1 的命题：辩论聚焦 **lean 代码中命题/定义的描述符合性** | ✅ **闸已落地并接线**：`packs/v5r/verification-gates.js:281-300` `fidelityAsked({cardId,leanPassed,p,withdrawnFor,answered})` —— lean 通过且 p≠1 时**必须先回答**「代码中的命题/定义是否符合所需」，未回答 ⇒ `VMU_PACK_V5R_FIDELITY_ASK_REQUIRED`（带问题原文与 `conform`/`defect` 两个选项，不是一句 forbidden）；`defect` 撤回情形 ⇒ `resolved`，不再追问；接线点 `packs/v5r/tools.js:726-737`（`vibe_v5_verdict_final` **落数之前**调闸，先问后算）；卡的 `p=1` 走另一条：`p1Intent` 要求 `debate`/`lean`/`verified` 三种定论来源之一 | `tests/vmu-v5r-verdict-final.test.mjs`（④ 正/反）＋ `tests/vmu-verified-gates.test.mjs` 93/0 | ✅ 已实现 |
| D14 | **辩论推荐流程**：先各成员「单次发言版群聊」独立给（概率,理由）；再轮流/举手/邀请展开；轮数由院士定 | ✅ **骨架四步全在**（`packs/v5r/meeting-procedures.js` `DEBATE_PROCEDURE`，`binding:'recommendation'`）：① 同时独立给「概率+理由」（`speak`/`vibe_v5_say`）② 轮流/举手/邀请展开，**轮数由院士决定**且框架无默认轮数 ③ 各自给最终裁决（`ballot` + `vibe_v5_verdict`）④ 聚合+通知（见 D15）。★ 骨架是推荐不是门禁：框架不检查不阻断；且 `flow`（发言楼层）与 `procedure`（议程）在回执里**分开报告**，不会被混淆 | `tests/vmu-meeting-types.test.mjs` §2（四步 status 全 `supported`、工具名逐条是真工具）＋ `tests/vmu-v5r-verdict-final.test.mjs` | ⚠️ 部分 |
| （D14 的 ⚠️ 判据，`conformance/lane-solo-speech.md` 实测六条）**第①步的"同时/独立"只有一半是真机制**：轮次**顺序**推进（`kernel/turn/index.js:1374-1382` 注释自述 + `:1387` 的 for-await；caller 模式 `:1403` 的 `awaiting` 直接结束这一批，实测一次 `drive` 只交回 r-1 的提示词）；且"独立"在**房间通道不成立**（`kernel/chat.js:486-500` 的 `list()` 不按调用者过滤，`tools/chat.js:57-60` 无闸 ⇒ 任何成员读得回别人刚说的话，探针实测成功）。会议发言的隔离成立但靠"没有读者"（`minutes()` 滤 `ms:0` 且 `minutes`/`verbatim` 无工具面）。⇒ 骨架给的"同时独立发表"是**尽力而为的约定**，不能写成保证；与会者要独立发表请走会议发言，不要走房间广播。 | — | ⚠️ 部分 |
| D15 | **辩论结束机制**：收各成员最终裁决（概率,理由）；全一致 1（或 0）⇒ 取该值，否则取均值；**通知命题卡持有者改概率** | ✅ **两个面都齐了**：内核 `kernel/meetingverdict.js`（416 行）`aggregateVerdicts`（空集/非有限数/全一致/均值 6 位小数/`valueSource`）＋ `rulePropositionProbability`（按命题桶：多命题混一起/部分标注/目标不一致/非字符串 id 全部**具名拒**）＋ `createMeetingVerdict`；**pack 触发面** `vibe_v5_verdict_final`（`packs/v5r/tools.js:682-760`）：解析主席当 `from`（点不出主席⇒具名拒，不匿名签发）→ 先过 D13 符合性闸 → 调聚合 → 用既有 `vmu.mailbox` **通知卡片持有者**（通知可从 `vibe_v5_inbox` 读回）。★ 明确**不在 `meetings.close` 上挂钩子**：裁决必须有签名人，关会自动算＝把显式裁定变成静默推断 | `tests/vmu-meeting-verdict.test.mjs` 37/0 ＋ `tests/vmu-v5r-verdict-final.test.mjs` 63/0（含「关会不自动聚合」反证） | ✅ 已实现 |

## §5 论文阶段（E）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| E1 | 分派后各自负责部分的论文 | ⚠️ **部分**（`lane-rows-c.md` E1，附实测）：协作论文能走到 `awaiting-editor`，但 `PaperMd` 的 `emptySections` 实测为 `['1:引言与问题背景','3:已检验通过的命题','4:已解决的子问题 / 中间成果']`（`D:\_tmp\probe15-e1-sections.mjs`，两成员互审全 true 后）——这三节的 `sectionFields` 是空串，**永远只有标题**；且 `kit/paper.js` 全文不读 propositions/verified 轨 ⇒ "所有有价值产物"不会从库里涌现 | 论文流程有门禁；**产出物内容无闸** | ⚠️ 部分 |
| E2 | 互审（review） | ✅ **机制＋门禁，但台账的落点原先写错了**（`lane-rows-c.md` E2 更正）：真实机制是 `kit/paper.js` 的环形互审环——非参与成员不许写、非布尔 `deliverable` 具名拒、一条 false 退回 writing round2 并带 refusers、全 true 才进 `awaiting-editor`。★ 更正：`vmu.paper.maxRounds` 只被**不可达**的 `kernel/paper.js` 读（`scripts/lib/reachability.mjs:36-48`），v5r 的 `defaults.json:68` 设的 3 是惰性声明，**真实上限是 pack 常量 `PAPER_MAX_ROUNDS=3`**；`vmu.review.mode`／`vmu.reviewers.maxLoad` 的消费者是评审人市场面（`vibe_vmu_reviewers`），不是论文互审环 | `tests/vmu-v5r-tools.test.mjs` 论文正反组、`tests/vmu-paper*` | ✅ 已实现 |
| E3 | 论文合规（证据/引用/不得编造） | ⚠️ **部分**（`lane-rows-c.md` E3，并更正 `lane-claims-paper.md` 的说法）：**文本合同级门禁是有的**——`tests/vmu-v5r-tools.test.mjs:553-597` 断言证据规则、不得编造、`deliverable` 语义、所办"未接线"声明、数字与引擎顺序来自 paper.js，另有三阶段正反隔离（write 阶段只带撰写段，normal 阶段三段都不带）。判 ⚠️ 的原因：论文**产出物**没有质量闸（编造在文本层面被禁止，但没有任何机器检查产出内容与证据的对应） | 见左（文本合同级） | ⚠️ 部分 |
| E4 | 最后讨论、检查无误后定稿 | ✅ **本轮补齐（此前是 ❌ 缺口）**：闸现在长在**在册路径**上 —— `packs/v5r/paper.js` → `kit/paper.js:124-149` 的 `CONSULT_KEYS`（`vmu.paper.officeConsult` / `…On` / `…TimeoutMs` / `…OnTimeout` / `…ExemptRoles` 五个键由 kit 真读）；策略仍在 pack（谁答复、哪些角色豁免以参数传入，kit 只拥有状态迁移、耐久台账与具名拒）。★ 历史事实保留：这些键的读取者曾是 `kernel/paper.js`，而 `createPaper(` 只在测试/脚本里被调用 ⇒ 装配时不加载，设置表却给它们打 `✅ 已接线`（**假绿**，由 `scripts/generate-vmu-settings-table.mjs` 的第四档 `⚠️ 未接线（读取者不可达）` 与 `tests/vmu-kernel-reachability.test.mjs` 钉住） | `tests/vmu-kernel-reachability.test.mjs`（8/0：paper.js 仍不可达 ＋ **kit/paper.js 必须读 consult 族**，方向已从"断言缺口"翻成"断言闸在位"）＋ `tests/vmu-paper-office-consult.test.mjs`。★★ **但本轮复核发现状态应为「部分」**：闸长在了在册路径上，**可所办没有任何工具面入口能答复**（`vibe_v5_paper` 的 action 表只有 start/part/review/advance/final/render/status/compile/sections，`recordConsult` 只能由 pack/宿主代码调）⇒ 真实会话里咨询只能一路超时，「提醒后得到确认」这条**走不完**。已派 vmu-pack 加 `consult` action（含未知 requestId 具名拒、答复人须为所办席位） | `tests/vmu-paper-office-consult.test.mjs` **65/0**（答复路径用例直接调 kit API，**这正是它没能发现「无工具面」的原因**：测试与代码用了同一个假设） | ⚠️ 部分 |

## §6 额外要求（F）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| F1 | 工具：Python 等计算工具可用；工具并发上限 | ⚠️ **部分**（`lane-rows-c.md` F1）：**并发上限这一半 ✅**（键在、office 独占、别角色写被具名拒 `r-1 may not set vmu.math.maxParallel (declared owner: office)`、真值进 `mathjobs.config()`）；**但"Python 等计算工具"默认不可用**：schema 声明 8 个默认引擎，运行时 `config.engines=[]`，`submit({engine:'python'})` ⇒ `VMU_MATH_UNSUPPORTED_OP 未声明任何引擎（vmu.math.engines 为空）`；部署脚本也只注入少数 vmu 键 ⇒ 真机同样为空。★ 未判定：python 真跑（探针无宿主 spawn 接缝，准入层就拒；真机只跑过 Lean） | 并发键有门禁；引擎面**无门禁** | ⚠️ 部分 |
| F2 | 断点续跑 | ✅ **机制＋门禁**（`lane-rows-c.md` F2）：`tests/vmu-resume-e2e.test.mjs:231` 覆盖续跑；★ 未判定：**真机**断点续跑（phase 12 只读不跑真机） | `tests/vmu-resume-e2e.test.mjs` 108/0 | ✅ 已实现 |
| F3 | 特殊权限/请求可经报告所办向用户询问 | ✅ **本轮补齐（此前是 ⚠️ 一半）**：报告面（`vibe_v5_report`）＋ 咨询闸（`kit/paper.js` 的 consult 族，E4 同一实现）两条路都在册。★ 历史事实保留：此前 `vmu.paper.officeConsult` 的读取者装配不加载 ⇒ 只剩报告一条路 | `tests/vmu-paper-office-consult.test.mjs` ＋ 同 E4 的 `tests/vmu-kernel-reachability.test.mjs` | ✅ 已实现 |
| F4 | 功能尽量通过**代理可执行命令（工具）**实现，而非每轮结束输出 JSON | ❌ **实测缺口（本轮量出）**：结构化回复通道 `supplyStructuredReply(fields,{forMember})`（`kernel/turn/index.js:1005-1063`，导出 `:1865-1870`）**全仓没有任何工具调用它** —— repo-wide grep 只命中该文件自身；成员唯一可达的是根会话面 `vibe_vmu_turn {op:'step', reply:'<文本>'}`（`tools/turn.js:75-79`，schema `:183-193`）⇒ **每轮手写 JSON 围栏仍然是成员唯一能用的结构化上报方式**。两真值规则已实现（`mergeReplyChannels` `kernel/turn/index.js:228-260`，异值⇒`VMU_TURN_REPLY_CONFLICT`），缺的是"给它一个工具名" ★ **本轮补齐了一半**：替代机制已经是工具——`vibe_v5_reply`（`packs/v5r/tools.js`，别称 `vibe_v5_verdict`，写入走 `tools/turn.js` 的 reply 通道，`noReplyShape` 让"需要会议却没给会议"的字段具名报错而不是拼出 `undefined`），回执里 `closureVote` 也是机器字段（不是让人手写 JSON）。**仍缺**：提示词仍在教每轮输出 `{json}` 围栏（F5），所以"实际运行时还被要求写 JSON"这件事没变 | `tests/vmu-turn-reply-tool.test.mjs` **32/0**、`tests/vmu-turn.test.mjs` **191/0** | ⚠️ 部分 |
| F5 | **提示词与规则完全相符自洽**：删除「m 票机制」「每轮结束返回 JSON 机制」等不再适用的内容 | ❌ **实测缺口（本轮量出，逐条带行号）**：① `v5r-reply-compact`（`packs/v5r/prompts/v5r-blocks-b.js:235`）教 `vibe_v5_tool_help({"tool":"工具名称"})`，而该工具**只收 `member`**（`packs/v5r/tools.js:243-265`，缺则 `VMU_INVALID_ARGUMENT: tool_help needs the member id`）⇒ **照做必拒**，同句在 GENERATED `v5r-prompts.js` 出现 46 次；② `end_verify` + `formal_proof`（`v5r-blocks-a.js:196`、GENERATED `v5r-persona.js:41`）**机制不存在**（kernel/tools 全仓 0 命中，真实字段是 `formal:{decision,file,note}`）；③ 手写 JSON 围栏仍被教：`v5r-reply-spec`（`v5r-blocks-a.js:558-667`，围栏 `:564/:597/:634`）、`v5r-reply-compact`（`v5r-blocks-b.js:220-240`）、`v5r-core.js:465/:472`、`v5r-blocks-b.js:622`；装配实测（`D:\_tmp\f5-probe.mjs`，76 段全开 ⇒ 23494 字符）：`m 票`×3、`法定票数`×1、` ```json `×2、`围栏`×4、`end_verify`×1、`formal_proof`×1 | 待建：先补 F4 的工具面，再重写提示词（persona/prompts 是 GENERATED ⇒ 走 generator） | ❌ 缺口 |

## §7 汇总

| 组 | 条数 | 已实现 | 部分 | 缺口 | 待核 |
|---|---|---|---|---|---|
| A 成员 | 4 | 2 | 2 | 0 | 0 |
| B 文件与归档 | 11 | 3 | 6 | 2 | 0 |
| C 平时推进 | 3 | 1 | 2 | 0 | 0 |
| D 会议 | 15 | 11 | 4 | 0 | 0 |
| E 论文 | 4 | 1 | 2 | 1 | 0 |
| F 额外要求 | 5 | 1 | 3 | 1 | 0 |
| **合计** | **42** | **19** | **19** | **4** | **0** |

★ 这张表第一次写出来的时候 **9 条已确认缺口、31 条待核**——即"待核"是绝大多数，任何"已完成"的说法都必须先把待核清零。

★ 台账会滞后：D3/D6/D9/D12 的"已实现"是**本轮之后**才成立的（D6 此前一直被记 ❌）。每次改状态必须同时改"证据"列里的 `file:line`／断言号，**不许只改状态**。

### 已确认的 9 条缺口（按影响排序）

1. **B1 Verified 目录 + "概率＝1 只能来自辩论"的闸** — 整个机制不存在。
2. **D3/D8/D11 会议类型是死字段** — 院士设了类型等于没设；也没有辩论对象字段。
3. **D5/D14 特殊类型会议的推荐流程骨架不存在** — "辩论该怎么走"没有任何框架给出的骨架。
4. **D15 辩论结束的裁定与通知闭环** — 需核 `vibe_v5_verdict` 是否就是最终裁决面，以及"通知改概率"是否存在。
5. **D13 lean 通过 ⇒ 辩论只查描述符合性** — 无闸。
6. **D6 连续多会议** — 无机制。
7. **B8 lean 通过 ⇒ 概率＝1 且可入 verified** — 无联动。
8. **B6 「只有含正式证明的命题卡才能用于辩论」** — 无机器闸。
9. **B2 蓝图的最终编辑权归院士** — 只有路径约定，无编辑权闸。

### 下一步（本轮内）

- 清空 31 条「待核」：按 A/B/C/D/E/F 六组分路核查，每条给出可失败的证据。
- 缺口按"机制缺口（要加能力/门禁）"与"提示词缺口（要改文本）"分流。
- 全部落定后再谈真机实测（用户要求最后跑完整真机，并明确告知代理这是一次模拟、把规则当核验对象）。

---

## 分片审计报告（本轮，只读，各自一个文件）

| 分片 | 文件 | 覆盖 | 结论摘要 |
|---|---|---|---|
| lane-meeting | `conformance/lane-meeting.md` | D 组 15 行中的 D1–D11、D14 | D1 ❌ D2 ⚠️ D3 ⚠️ D4 ⚠️ D5 ❌ D6 ❌ D7 ⚠️ D8 ❌ D9 ⚠️ D10 ✅ D11 ❌ D14 ❌ |
| lane-extra | `conformance/lane-extra.md` | 42 行中的 9 行（B1 B2 B9 B10 F1 F2 F3 F4 F5） | B9 ✅ F1 ✅ F2 ✅ · B10/F3/F4 ⚠️ · B1/B2/F5 ❌ |
| lane-claims-paper | `conformance/lane-claims-paper.md` | 命题/论文相关行 | 见文件 |
| lane-rules-consumers | `conformance/lane-rules-consumers.md` | D3/D13/D14/D15 + 四道闸接线 + 两个新工具面 | 全部 ✅（报告 §7.2 含 `file:line` 与门禁；契约表已登记） |

★ **两份报告都是在「本轮改动落地之前」读的代码**：lane-meeting 的 D3「`packs/v5r/tools.js:513` 硬编码 `type:'ordinary'`」、D8「没有类型载体」、`target` 无消费者 —— 这三条**本轮已修**（见下），必须在下一轮用当前工作树复核后才算清账。lane-extra 报的 B1 台账假阴性已在本文件 §B1 行更正（85 命中 / 15 文件）。

### 本轮已落地的能力（会议类型 · 辩论对象 · 推荐流程骨架）

- `vibe-math-vmu/kernel/meetings.js`：`open()` 增加 `subject`（辩论对象/文件引用，非字符串具名拒 `VMU_INVALID_ARGUMENT`，空白归一为 `null`）；meeting 对象保存 `subject`；`open()` 回执、`summary()`、`meetingView()`、`meetings/opened` 事件都带 `type` 与 `subject`；`open()` 顶层也返回这两个（读回不用猜回执信封）。
- 新 `vibe-math-vmu/packs/v5r/meeting-procedures.js`：六种会议类型词汇 + **辩论**的推荐骨架（①同时发表 `poll_*` 独立表态 ②轮流/举手/邀请展开，轮数由院士定 ③结束前各自最终裁决 ④聚合），骨架只允许写"真实存在的工具"，未实现的步骤在回执里**具名 pendingSteps**；另五种类型 `procedure:null` + 具名理由（不发明流程）。
- `packs/v5r/tools.js` 的 `vibe_v5_meeting`：接受 `type`（默认 `ordinary`）、`subject`（`target` 为活别名，原来声明了没人读）、辩论缺对象具名拒；回执带 `type/subject/procedure/procedureBinding/procedureNote/pendingSteps`。
- `packs/v5r/settings/defaults.json`：声明 `vmu.meetings.typeCatalog` 六值 ⇒ 内核的 `typeCatalog` 白名单在 v5r 里真的绑上（未声明类型被具名拒并列出合法值）。
- `package.json#files` + `installer.js` PRESETS 双登记新模块（否则装完 MODULE_NOT_FOUND）。
- 新测试 `tests/vmu-meeting-types.test.mjs` **46 passed / 0 failed**；邻接套件 meetings 195/0、v5r-tools 334/0、motion-box 37/0、pack-prompts 24/0；`regen-all` 16/16。

### 下一批（按 lane 报告的证据排序）

1. **D1 只有院士能开会**：`packs/v5r/tools.js:495` 只 `requireSeat` 任意席位，`kernel/meetings.js:383-436` 不校验 actor ⇒ 加院士/主持闸（并在内核里给出可复用的 chair 校验，别在 pack 里造第二套）。
2. **D2/D4 关闭与延长**：`close()` 无主席校验（`meetings.js:1073-1136`）；**没有会议级 `extend`**（`wallStartMs` 只写一次 `:432`、读 `:1115`；只有发言级 `meetinglapse.js:197-217`）⇒ 补会议级延长上界，这是用户规则明写的。
3. **D9 邀请面真机不通**：pack 开的是 service 会议，`invite/invitedspeak` 只在原语注册表（`tools/meeting.js:61-81,159-160`）⇒ 要么把 invite 接进 service，要么让 pack 的 meeting 面指向原语面。
4. **FALSE EXIT 修正**：`docs/24-v5r-containment.md:53,396` 教院士用 `formal_agenda:true` 转正式会议，但该参数只被回显（`packs/v5r/tools.js:515`）⇒ 要么实现消费，要么改文档（本轮不动提示词，见 F5 的顺序约束）。
5. **F5 顺序约束（重要）**：m 票机制（`vmu.meetings.quorumRule='m-unanimous'`/`quorumCap` 是内核机制）与每轮 JSON 答复（`kernel/turn/index.js:863-878`）**都还活着** ⇒ 只删提示词文字会更不自洽。正确顺序：先建 B1 的 verified 承载与 p=1 门，再改机制，最后删文字。

---

## §8 第二批：D1/D2/D4 的院士权轨 —— 三条闸 + 两条被红测试抓出来的 bug

规则的原文是三个动词：**会议只能由院士「预约/召开」和「关闭」**、**院士可以「延长会议时长上界」**。本轮把三个动词各做成一条可失败的闸，并**每条闸都双向断言**（拒错的人 ＆ 收对的人——只拒不收的闸不是闸）。

### 落了什么

| 能力 | 位置 | 语义 |
|---|---|---|
| 召开权 | `kernel/meetings.js` `open()` + `vmu.meetings.conveneRequiresChair` | 装配了主席的会议必须自报 `actor` 且 `actor === chair`：**匿名开会被拒**（`must name that chair as its actor`）、**替别人开会被拒**（`only the member who takes the chair`）。回执带 `openedBy` |
| 关闭权 | `close()` + `vmu.meetings.closeRequiresChair` | 须 `actor === 本会主席`，否则 `VMU_NOT_PERMITTED`；回执带 `closedBy` |
| 延长权 | `extendWall({meeting, ms, actor, why})` + `vmu.meetings.extendRequiresChair`（默认 true）＋ `extendCeilingMs`（默认 4h） | 新能力无老调用方 ⇒ 默认开。非正步长⇒`VMU_INVALID_ARGUMENT`("extend it a bit" 不是数量)；越天花板⇒`VMU_RESOURCE_BUDGET`（hint 点名 `extendCeilingMs`）；回执带 `before/after/actor/why` |
| pack 侧 | `packs/v5r/tools.js` `vibe_v5_meeting` | 只对 **chair 席位**开放（`requireSeat` → `requireChairSeat`）并传 `actor: member`；`defaults.json` 声明 `conveneRequiresChair/closeRequiresChair: true` |
| 内核面 | `kernel/index.js` attach 表 + `tools/meeting.js` 新动作 `extendlimit` | 会议级延长有可达的命令面（`extend` 仍是**发言级**延长，两者不是同一权限） |

### ★ 两条被红测试抓出来的 bug（都不是读代码能发现的）

1. **同名遮蔽**：我先把会议级延长命名 `extend`，而同一工厂里 `const extend = (a) => withScope(controls.extend(a))`（**发言级**延长，`kernel/meetinglapse.js`）在返回对象里覆盖了它 ⇒ 测试打到的根本不是新方法（`extend needs { member }`）。改名 `extendWall`，命令面同步 `extendlimit`。教训：**同词双义**不是命名品味问题，是一个方法被另一个方法静默吃掉。
2. **推不出的默认值**：`extendCeilingMs` 第一版把默认写进 IIFE（`raw === undefined ? 14400000 : n(raw)`），`generate-wired-schema --check` 立刻红：**收集器读不出 IIFE 的默认值** ⇒ 会把这个数值键写成 `type:'object'`（"声明与自己的默认值矛盾"）。修法是**把默认值写到可读的位置**（新增 `msOr(key, def)` 两参助手），不是给它登记一个 `OBJECT_FALLBACKS` 名字——类型在这里是可知的，声称不可知会藏起一个事实。

### 边界（写下来，因为它是一个真实的取舍）

**无主席的会议不受 chair 轨约束**：`v5r.stall-meeting` 在 `control/idle` 里用 `open({kind:'stall'})` 开会，没有主席可校验，内核也无法区分"工作流"与"成员"⇒ 内核**不假装能区分**（chairless ⇒ `openedBy: null`，有专门断言），而「只有院士能召开」在线下**席位可知**的地方执行：`vibe_v5_meeting` 只对 chair 席位开放（有断言）。两条断言放在一起，边界就是文档化的而不是漏洞。

### 门禁与不变式

- `tests/vmu-meeting-types.test.mjs`：46 → **65 passed / 0 failed**（新增 §5 十四断言：匿名/伪造/正确召开、chairless 边界、匿名/非主席/正确关闭、匿名/非主席/坏步长/正确延长、越天花板、**延长被真正消费**（原界之后仍可用、延长界之后被拒且消息说"extended from"）、pack 拒绝非主席、`extendlimit` 可达）。
- 邻接套件：`vmu-meetings` 195/0、`vmu-motion-box` 37/0、`vmu-resume-e2e` 108/0、`vmu-undefined-refusals` 15/0、`vmu-kernel` 260/0。
- 派生面：`regen-all --write` → `--check` **16/16 in sync**；`generate-wired-schema --check` → `INVARIANTS ok (326 emitted, 5 service surfaces, 6 honest null defaults)`；`check-docs` PASS；`audit-vmu-docs` 103/0。
- 新增 4 个设置键（schema 手写表 + v5r `defaults.json` 只声明属于**本所制度**的两条；`extendRequiresChair/extendCeilingMs` 采纳内核默认，不重述——重述一个框架默认等于把它抄进价值层）。

### 下一步（按缺口影响排序，已确认未做）

1. **D4/D9 邀请面真机不通**：pack 开的是 service 会议，`invite/invitedspeak` 只在原语注册表 ⇒ 要么接进 service，要么让 pack 面指向原语面。
2. **D1 剩余**：预约时间（`vmu.meetings.schedule*` 0 键）与"到点人未齐进入等待态"的显式状态。
3. **D15 聚合闭环**：最终裁决（概率,理由）→ 全一致取值/否则均值 → 通知命题卡持有者改概率。
4. **B1 Verified 目录 + "p=1 只能来自辩论"的闸**（F5 的顺序约束：先建承载，再改机制，最后删提示词里的 m 票/JSON）。

---

## §9 第三批：D12 表决人数下限 —— 把「下限」做成真的下限（并记录两个未闭合面）

规则原文（D12）：**辩论/结题表决人数下限 ≥ min(用户设置数, 院士+常驻研究员数)**。

### 旧实现为什么不符合

`kernel/meetings.js` 的 `quorumOf()` 原文是

```js
const need = K.quorumCap > 0 ? Math.min(needUncapped, K.quorumCap, m.present.size) : needUncapped
```

第三项 `m.present.size` 把「下限」变成了**同义反复**：`required ≤ 已在场人数` ⇒ `met` 恒为真（凡是来人就够），于是「下限」既不可能是下限，`vmu.meetings.quorumCap` 这个用户设置也**永远不会咬住**。实测（改前）：roster 4 / cap 3 / 1 人在场 ⇒ `required 1`、`met true`；roster 2 / cap 3 / 1 人在场 ⇒ 也是 `1`。

### 现在的算法（`kernel/meetings.js` `quorumOf()`）

```js
const capUniverse = /* 名册 ∩ vmu.meetings.eligibleSeats，解析不到的 id 计入而不是剔除 */
const need = K.quorumCap > 0 ? Math.min(needUncapped, K.quorumCap, capUniverse.n) : needUncapped
```

- min 的右项从「在场人数」换成「**可投票成员数**」——即 v5r 的「院士+常驻研究员」：`eligibleSeats:['chair','member']`，而临时席位是 `temp`（`packs/v5r/tools.js` `hire` 写死 `slot:'temp'`），所以临时成员既不投票、也不再虚增会议必须达到的人数。
- **解析不到的 id 计入分母**（`source:'seats + unresolved roster ids'`）：降分母会让会议更容易结题，这是不能猜的那一侧。
- 回执新增 `cap / capUniverse / capUniverseSource / capPolicy` 四个字段——一个凭空出现的 `2` 配上 roster `3` 是不可读的，数字必须自己带出处。

### 断言（`tests/vmu-meetings.test.mjs`，4 条新的 + 2 条改写的旧契约）

| 断言 | 证的是 |
|---|---|
| `min(cap 2, eligible 4) = 2` 且 `met false`（1 人在场） | ★ 下限不再被在场人数吃掉（改前这里是 `required 1 / met true`） |
| `capUniverseSource === 'seats'` / 无席位声明时回落 `roster` | 数字带出处 |
| `vote()` ⇒ `VMU_MEETING_QUORUM_LOST`，message `quorum is not met: 1/2`、hint `现值=1, 需要=2` | ★ 下限在**真正要执行的动作**上可观测（不是只在一个只读视图里） |
| `attend` 第二位合格成员 ⇒ `met true`、同一个 `vote()` 这次 `counted` | 闸是**可满足的**，不是永久死锁 |
| roster 3（含 `temp`）/ universe 2 | 临时席位不虚增人数 |

### 两个**没有闭合**的面（写在这里，因为它们是结论的一部分）

1. **`close()` 根本没有 quorum 轨**。它查 `closeRequiresChair`、结题报告、纪要、行动项，然后直接 `markState('closed')`。也就是说「1 人在场也能把会议关掉」——D12 只作用在 `vote()` 与 `quorum()` 上。要么给 `close()` 加一条（`vmu.meetings.closeRequiresQuorum`，默认关以不动老调用方），要么明确「结题必须走表决而不是走 close」并写进文档。**本轮没做，因为它是新政策开关，不是修 bug。**
2. **结题表决（turn 环）用的是全票，不是 min**。`kernel/turn/index.js:78` `closureVoteOf()` 的 `cast = missing.length === 0 && against.length === 0`，即「全体有票者都必须投且都赞成」。这**满足**下限（参与人数 = 全体 ≥ min），但让「用户设置数」在结题路径上**永远不起作用**（设置只影响会议法定数，不影响结题）。这是规则语义问题而不是 bug：需要裁定「结题 = 全票」还是「结题 = 达到 min 且无反对」。**本轮只记录，不擅自改**——按 F5「先机制后文字」，它也不是提示词能修的。

### 门禁

`node tests/vmu-meetings.test.mjs` ⇒ **201 passed, 0 failed**；`tests/vmu-meeting-types.test.mjs` 92/0、`vmu-motion-box` 37/0、`vmu-resume-e2e` 108/0、`vmu-kernel` 260/0、`vmu-meeting-verdict` 37/0、`vmu-record` 269/0、`audit-vmu-services` 49/0。


## §10 第四批：一条**设置表面**的系统性缺陷 —— "读取者不可达"（以及它带出来的两条规则结论）

### 怎么发现的
在做 D3/会议序列收尾时给 `host.js` 补一个 `packToolFaces` 的现实核对，顺手写了一个小不变量：**每个 `kernel/*.js` 都必须能从插件入口被 import 到**。第一次跑就红了两条（`kernel/paper.js`、`kernel/grant.js`）。这不是洁癖问题，而是它把**两条规则结论**直接推翻了：

| 模块 | 规模 | 它拥有的设置键 | 装配里谁 import 它 | 后果 |
|---|---|---|---|---|
| `kernel/paper.js` | 585 行，`installer.js` 里在册 | 10 个 `vmu.paper.*`（`officeConsult` / `officeConsultOn` / `officeConsultTimeoutMs` / `officeConsultOnTimeout` / `officeConsultExemptRoles` / `finalizer` / `finalPaper` / `format` / `language` / `compilePdf`）+ 3 个节数闸 | **零**（`createPaper(` 只在 tests/scripts） | E4/F3 的「定稿前必须问所办」**从不执行**；设置表却写着 `✅ 已接线` |
| `kernel/grant.js` | 临时/范围/单次授权面 | 4 个 `vmu.grant.*` | **零**（`createGrant(` 只在一个测试文件） | 4 个键同样是"改了什么都不会发生"，且 v5r 规则集**不要求** grants ⇒ 属"没有消费者的能力" |

### 为什么这是**系统性**缺陷而不是两个孤立文件
设置表的"接线"列判据是「运行时代码里有没有这个键的字面量读取」。**这是必要条件，不是充分条件**：一个永不被加载的模块也满足它。所以任何被孤立/未挂载的内核文件，都会把自己的键**虚报成已接线** —— 而"接线＝现在改就有效"正是这张表对使用者的承诺。这正是本项目最贵的那条教训（**设了值 ≠ 生效了**）出现在**文档面**上：照着表设 `vmu.paper.officeConsult='required'` 的人，会以为定稿被一道具名拒守着。

### 落了什么
1. **共用可达图** `scripts/lib/reachability.mjs`（`walkAssembly` / `unreachableKernelModules` / `KNOWN_UNMOUNTED`）。**一份实现、两个消费者**，避免两处漂移。
2. **新门禁** `tests/vmu-kernel-reachability.test.mjs`（**8/0**）：① 每个 kernel 模块必须从插件入口可达，**或**列进 `KNOWN_UNMOUNTED` 并写明"为什么不可达 + 怎么测出来的"；② 豁免表**只减不增**（模块重新可达后必须删条目）；③ 豁免理由不得是裸文件名；④ 钉住两个实测案例本身（paper.js 不可达且拥有 consult 键；`kit/paper.js` 不读 consult；grant.js 不可达且拥有 `vmu.grant.enabled`）。
3. **生成器按同一张图判"接线"**（`scripts/generate-vmu-settings-table.mjs`）：不可达 kernel 模块里的读取**不再算消费者**，并新增**第四档** `⚠️ 未接线（读取者不可达：该模块装配时不加载）`，载体列仍点名那个模块（好让判断可查，不必被相信）。
   - 实测变化：`wired 1172 → 1155`，**恰好 17 行** `wired → 未接线（读取者不可达）`，逐行 diff 确认**没有任何其它行的状态变化**。
   - ★ 一个必须记下的教训：第一版把 `hasConsumer` 改成"逐文件扫原文"，结果 8 个 `planned` 键（`vmu.ballot.freezeMode` 等，它们的键名在 `WIRED_KEYS` **声明数组**里）被误报成 `已接线` —— 因为原文里数组元素也算字面量。**这是"设了值≠生效了"的镜像：声明也算字面量**。修正＝逐文件保留**已剔除声明行**的视图（`filtered`），并实测确认 17 行的变化集不含任何多余行。
4. **文档面**：`vibe-math-vmu/docs/04-settings.md` §6 末尾从「三档判读」改为**四档判读**，并新增一段「判『接线』之前先判『可达』」把两个反例与门禁写在使用者读得到的地方。

### 两条规则结论的修正（这是本轮真正的产出）
- **E4 ❌**：定稿前问所办 —— 不在册。
- **F3 ⚠️**：经报告所办询问 —— 只有报告一条路；咨询闸不在册。

### 未闭合面（写下原因，不留白）
1. **`kernel/grant.js` 该删还是该挂**：v5r 规则集不要求 grants，它现在是"打包了、测试过、装配里没有消费者"的能力。按红线④（无消费者不给机制）应当**挂上或删掉**，但删一个有测试的内核面需要独立决定 ⇒ 本轮只在 `KNOWN_UNMOUNTED` 里具名登记，并把"删/挂"留作显式待办。
2. **`kernel/paper.js` 的 office-consult 闸要不要移植到在册路径**：`kit/paper.js` 是真正跑的论文流水线。若要满足 E4，闸必须长在**那条**上（而不是让 paper.js 复活成第二个论文子系统）。
3. **可达性只覆盖 `kernel/`**：pack 模块由 pack loader 按配置在运行时解析，静态图看不见 ⇒ 对 `packs/` 用同一判据会**误报**。这是口径边界，不隐瞒。

### 门禁
`node tests/vmu-kernel-reachability.test.mjs` ⇒ **8 passed, 0 failed**；`node tests/audit-enforced-consistency.test.mjs` ⇒ **358/0**；`node scripts/check-docs.mjs` ⇒ `DOC LINT: PASS`；`node scripts/generate-vmu-settings-table.mjs --check` ⇒ 与 schema 一致（1267 keys）。

## §11 第五批：九行规则落地 ＋ 三个新内核闸 ＋ 两条系统性发现（提交 `b70a69ec`）

这一批把 §3–§6 里"机制不存在"的行大幅缩短：**合计 17 已实现 / 13 部分 / 3 缺口 / 9 待核**（§7 的表与本节的逐行一致；改动一律连"证据"列一起改）。★ 其中 11 行（A1/A4/B2–B5/B7/B9/B10/B11）是 `v5r-reader-b` 的只读深查（`lane-rows-b.md`）给出的判定，我逐条复核后落表；**它推翻了台账一处错的表述**：A4 原写"不入会由 `vmu.meetings.eligibleSeats` 表达"，实测该键只表达**投票权**（vote 门＋quorum 分母），`attend()` 不读它 ⇒ "默认不参会"是流程约定、无门禁。

### 落地的能力（按规则行）

| 行 | 这一批让它变成什么 | 证据 |
|---|---|---|
| A2/A3 | 院士席＝主席，三条**只有主席**能做的动作（召开／关闭／延长）；常驻研究员人数＝`vibe_v5_start` 的 `researcherCount`（默认 3、域 0..50、越界具名拒零副作用） | `tests/vmu-a2a3-seats-and-bounds.test.mjs` 17/0、`tests/vmu-meeting-types.test.mjs` 122/0 |
| D1 | 预约（`scheduleAllowed`／`scheduledFor`）、未到齐进 `waiting`（`waitOnDueMs`）、到期由主席自决 `proceed`（`waitDecisionRequiresChair`）；`at` 现在同时收 epoch 毫秒与 ISO 串，认不出就具名拒（改前会 `new Date(object)` ⇒ 静默变 NaN） | `kernel/meetings.js` 的 `atMs`/`syncMeeting`/`proceed`；`tests/vmu-meeting-types.test.mjs` §6/§7 |
| D2/D4 | 主席权轨三条（见上），并修掉一个**同词两义**的真 bug：会议级"延长"原本叫 `extend`，与"延长发言"（`createLapseControls().extend`）在同一工厂里重名 ⇒ 后定义覆盖前者，测试用"不存在的 id"证明调用跑到了错的那支，改名 `extendWall` 后通过 | `kernel/meetings.js` `extendWall`、`tools/meeting.js` `extendlimit`；§8 |
| D3/D8/D11 | 会议**类型**不再是死字段：`vibe_v5_meeting` 收 `type`（默认 `ordinary`，按 pack 声明的 catalog 校验，非法值列出合法集），辩论必须给 `subject`（辩论对象：卡 id／文件路径／一句话），`title` 与 `materials` 分开存（**materials 此前是"校验完就丢"**），读面（`summary`/`meetingView`）都能读回 | `packs/v5r/meeting-procedures.js`、`packs/v5r/tools.js`、`tests/vmu-meeting-types.test.mjs` |
| D6 | 一次调用开一串会：`sequence` ＋ `advanceSequence`，把 receipt 里的"下一场"变成真的 | 同上 |
| D9 | 邀请/举手/发言序：pack 侧 `invite`/`interacted speak` 跨注册表落地，`attend` 有了入口（改前 pack 开的 service 会议里**除主席外没有任何人能发言**，因为没有任何 `attend` 路径，`meetings.speak` 一律 `VMU_NOT_MEMBER "attend() first"`） | `tools/meeting.js`、`tests/vmu-meeting-invite.test.mjs` 67/0 |
| D12 | 表决人数下限变成真的下限：第三项从 `m.present.size` 换成"可达席位∩名册"，并把这些事实报出来（`capUniverse`/`capUniverseSource`/`capPolicy`）；此前只要在场人数够，`quorumCap` 永远绑不住 | `kernel/meetings.js` `quorumOf`；`tests/vmu-meetings.test.mjs` 201/0 |
| D15 | 裁决聚合：`kernel/meetingverdict.js` 命题感知（行可标命题；混命题／半标／裁决所指与目标不符都具名拒，**绝不裁错卡**），6 位小数是声明常量；`vibe_v5_verdict_final` 由主席签发，`from`＝主席 member id，通知走既有 mailbox | `tests/vmu-meeting-verdict.test.mjs` 37/0、`tests/vmu-v5r-verdict-final.test.mjs` 63/0 |
| E4 | 咨询闸从**不可达**的 `kernel/paper.js` 搬到在册路径 `kit/paper.js`，"谁答复"作为机构政策由 pack 声明；超时两分岔（`hold` 保留提问／`refuse` 作废重开）**都不放行** | `tests/vmu-paper-office-consult.test.mjs` 65/0 |
| F4 | 回复不再是手写 JSON：`vibe_v5_reply`（别称 `vibe_v5_verdict`）＋回执里的机器字段 `closureVote`＋`noReplyShape`（"这字段要会议"就具名报错，不拼 `undefined`） | `tests/vmu-turn-reply-tool.test.mjs` 32/0、`vmu-turn` 191/0 |

### 两条系统性发现（都已做成门禁，不是"记一笔"）

1. **可达性**：`scripts/lib/reachability.mjs` 从 8 个插件入口走装配图。它证明 `kernel/paper.js` 与 `kernel/grant.js` **没有任何装配会加载**，而这正是设置表把 17 个键印成 `✅ 已接线` 的原因（"读者存在"≠"读者会跑"）。生成器现在共用同一份图并按第四档 `⚠️ 未接线（读取者不可达）` 出表；`tests/vmu-kernel-reachability.test.mjs`（8/0）逐模块断言"可达或声明在 `KNOWN_UNMOUNTED` 且写明理由"，列表**只减不增**。★ 顺带修掉第二个"声明即字面"的假绿：键的消费者原来在**含声明行**的原文里数，8 个 `planned` 键因此变成"已接线"；改成在剔除声明行后的文本里数。
2. **所办咨询的应答面无入口**（本轮复核 E4 时发现，已派工）：闸在位、测试全绿，但 `vibe_v5_paper` 的 action 表里没有"答复咨询"这一项 ⇒ 真机会话里咨询只能超时。**这正是"测试与代码用了同一个假设"造成的假绿**：测试直接调 `kit/paper.js` 的 `recordConsult`，于是永远发现不了"没人能调到它"。E4 因此从 ✅ 降为 ⚠️。

### 这一批同时改判的

- `B1` ❌→⚠️（承载＋四闸已落地，提示词未跟上，未真机验证）；
- `F4` ❌→⚠️（替代机制已存在，提示词仍教 JSON 围栏 ⇒ F5 未做前"实际运行"没变）；
- `E4` ✅→⚠️（见上，答复无工具面）。

### 未闭合（带责任人）

1. **F5 提示词重写**（vmu-pack 先出"谁生成它"的表，防止被 regen 覆盖；GENERATED 的 persona/prompts 必须走生成器）；
2. **`vibe_v5_paper` 加 `consult` action**（vmu-pack，含未知 `requestId` 具名拒、答复人须为所办席位）；
3. **`kernel/grant.js` 删除**（vmu-core，`createGrant` 零调用者、4 键已标不可达、规则集不要求；级联＝模块＋schema 4 键＋bus producer＋两条打包清单＋`KNOWN_UNMOUNTED` 减一条＋三份说明改判）；
4. **`kernel/paper.js` 的同类裁定**（它仍有 8 个 `vmu.paper.*` 键不可达；删除级联比 grant 大，留到下一轮，按 grant 的模板做）；
5. **19 条"待核"**（reader-b 11 条／reader-a 8 条并行深查，产物 `lane-rows-b.md`／`lane-rows-c.md`）；
6. **真机实测**（最高优先，只有它能证伪以上全部）：跑完整 SLV，明确告知代理这是模拟、核验对象是规则集本身。

### 门禁读数（本轮实跑）

`vmu-meeting-types` 122/0 · `vmu-meeting-invite` 67/0 · `vmu-meeting-verdict` 37/0 · `vmu-v5r-tools` 339/0 · `vmu-v5r-verdict-final` 63/0 · `vmu-verified-gates` 95/0 · `vmu-verified-track` 72/0 · `vmu-member-face` 46/0 · `vmu-turn` 191/0 · `vmu-turn-reply-tool` 32/0 · `vmu-paper-office-consult` 65/0 · `vmu-meetings` 201/0 · `vmu-kernel` 260/0 · `vmu-resume-e2e` 108/0 · `vmu-a2a3-seats-and-bounds` 17/0 · `vmu-kernel-reachability` 8/0 · `clean-temp-root-guard` 15/0 · `audit-generators-current` 23/0 · `audit-package-membership` 29/0 · `audit-vmu-docs` 103/0 · `regen-all --check` **16/16** · `check-docs` PASS。

## §12 第六批：42 行全部有判定 ＋ 删掉不可达的 grant 面 ＋ 两条"深度审计纠正台账"的记录（提交 `1963b940`）

这一批没有新增"能力"，做的是**把账算清**和**把假的关掉**：

### 1. 最后 9 行"待核"由两条只读深查补齐，其中两条**推翻了台账自己的判断**
- `lane-rows-b.md`（11 行）：A1/A4/B2–B5/B7/B9/B10/B11。**推翻**：A4 原写"临时工默认不入会由 `vmu.meetings.eligibleSeats` 表达"——实测该键只表达**投票权**（vote 门 + quorum 分母），`attend()` 完全不读它 ⇒ "默认不参会"是流程约定、无门禁；B10 的"归档/复算"也没有落点。
- `lane-rows-c.md`（8 行：C1–C3/E1–E3/F1–F2）。**推翻**：E2 原写落点是 `vmu.paper.maxRounds`/`vmu.review.mode`/`vmu.reviewers.maxLoad`——前者的读者是**不可达**的 `kernel/paper.js`（`scripts/lib/reachability.mjs:36-48` 的 KNOWN_UNMOUNTED），v5r 论文路径的真实上限是 pack 常量 `PAPER_MAX_ROUNDS=3`；后两者属评审人市场面、与论文互审环无关。同一份报告还纠正 `lane-claims-paper.md` 的"E3 只断言关键词"——实际有文本合同级门禁（`tests/vmu-v5r-tools.test.mjs:553-597`）＋三阶段正反隔离。
- 结论：**"结论也要有读者"**。两条被推翻的判断都是"机制存在 ⇒ 这个键就是它的消费者"的推断，而实测显示存在≠被这条路径消费。

### 2. `kernel/grant.js` 从"待裁定"变成"删除"（`1963b940`）
可达性闸把它列为**未被任何装配入口 import** 的模块 ⇒ 它的 4 个 `vmu.grant.*` 键被设置表登成 `✅ 已接线`，而跑起来的装配里没有读者。两个选项（挂上去 / 删掉）中选删除，理由：它是上一代授权面的遗留，没有任何 pack 或规则条目需要它；删除同时也关掉了设置表的假绿。`tests/vmu-grant.test.mjs` 随之删除，`audit-kernel-claims-16`/`04-parity-matrix` 的对应声明同步改。

### 3. 三条新的门禁（针对"说了但没有"这一族）
| 门禁 | 它抓什么 | 读数 |
|---|---|---|
| `tests/vmu-kernel-reachability.test.mjs` | 一个内核模块是否被**装配入口可达**；豁免表只许缩 | 8/0 |
| `scripts/generate-vmu-settings-table.mjs` 的第四档 | `⚠️ 未接线（读取者不可达）`：读者在，但装配不加载它 | 17 键从 ✅ 改判 |
| `tests/vmu-doc-claims-vs-code.test.mjs`（`v5r-reader-b`，**当前 2 红**） | 代码内 hint／提示词里的一句承诺，其声称的机制能否从源码证出来 | 10 passed / 2 failed |

第 3 条的两处红是**真结论**，不是测试缺陷，已派给 `vmu-core` 本轮修（①汇报/总览计数缺 feedback；②B10 的"归档/复算流程"没有落点）；修完它才转绿——**先红后绿**，不许把断言删掉。

### 4. 台账字数与读数
`§7` = **42 条 = 19 已实现 / 19 部分 / 4 缺口 / 0 待核**（4 缺口＝B2 蓝图、B8 lean⇒辩论联动、F5 提示词自洽，及 B10 正被修）。

### 5. 本批交给三条 lane 的（尚未回收）
- `vmu-pack`：F5 更正段 ×4（JSON 围栏／tool_help 参数／`end_verify` 与 `formal_proof`／`m 票` 的真实机制）＋ 静态门禁"提示词教的参数必须 ⊆ 工具 schema"。
- `vmu-core`：feedback 计数、紧急私信入口（C2）、状态面板四要素闸（C3）、脚本归档面（B10）、`verification-gates` 的两条谓词接线（B8）。
- `vmu-verify`：F1「引擎为何声明了却不物化」与 D7「会议类型 ⇒ 工具面差异」两张只读施工单。
