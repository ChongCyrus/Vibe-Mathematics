# Phase 12 — v5r 运行规则一致性台账（逐条核查 vmu + v5r pack）||| **两个维度都成形**：① 身份维＝活的可见工具表（`host.js:1681-1691`/`:1722-1729`）＋内核运行期具名拒（`requireChairSeat`/`chairNeutral`/`closeRequiresChair`）；② **类型维＝`packs/v5r/meeting-tool-face.js`**（`MEETING_TYPE_TOOL_FACES` `:21`：debate 收窄 20 项，其余五类 `narrowed:false`＋具名 reason）＋新工具 `vibe_v5_meeting_round`（`tools.js:1166`/`:1868-1876`）：allow＝`kernel.toolsView({member})`∩策略表，**只收窄**；身份面读不到 ⇒ `VMU_ENGINE_UNAVAILABLE`（不猜 allow）、交集空 ⇒ `VMU_STATE`；`applyMeetingTypeFace()` `:107` 两阶段避免 override 残影；override 一轮即清 | `tests/vmu-meeting-type-tools.test.mjs` 51/0（辩论期 `vibe_v5_paper` 不在 allow／正常会议零 override／主席永不被收窄）＋ §5a–§5d 身份拒法 | ✅ 已实现 

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
| B2 | **公共蓝图**：实现总目标的完整技术路线设计/策划；按时更新；院士+常驻研究员共同设计；**最终编辑权归院士** | ✅ **机制＋消费者**（本轮补齐，此前 ❌）：`vibe-math-vmu/packs/v5r/blueprint.js`（335 行）—— 轨声明 `BLUEPRINT_TRACK='blueprint'`（:38）并在**装配期**登记（`packs/v5r/settings/defaults.json` 的 `vmu.records.tracks`/`allowedKinds`；`kernel/records.js:189-221` 的轨集合是构造期快照，运行时临时 put 会静默落默认轨）；提案 `proposeBlueprint`（:200，任何在册成员）／落成 `adoptBlueprint`（:244，**仅 chair 席**，`BLUEPRINT_ADOPT_SLOT` :45）／读面 `listBlueprints`（:117）·`blueprintState`（:141）·`readBlueprint`（:187）；工具面 `vibe_v5_blueprint{action:state\|propose\|adopt\|read}`（`packs/v5r/tools.js:1417`，注册 :2196），路径缺省取 `vmu.turn.protocolPath` 并在回执写 `pathSource`。三处语义纪律：**"在生效"是派生的**（取 current 行最高 revision，不另存一份事实）／**草案只增不改**（重复落成只查 current 行的 `proposalId`）／**stale 是提示不是拒绝**（`ageMs`/`staleAfterMs`/`staleNote` 全可读，阈值 30 天 :47）。读面不新造：`vibe_v5_read_library{track:'blueprint'}` 靠 `declaredTracks(kernel)` 天然可读（`kit/handlers.js:365-413`）。**仍缺**：提示词没有一段教"蓝图怎么用"（工具 description 自述 ⇒ 属可发现性，不是机制缺口） | `tests/vmu-blueprint.test.mjs` **54/0** | ✅ 已实现 |
| B3 | 各自 progress | ✅ **机制＋消费者**（`lane-rows-b.md` B3）：`vibe_v5_record_progress`（`packs/v5r/tools.js:1415` → `kit/handlers.js:96-135`）、轨 `defaults.json:19`、turn 自动写（`kernel/turn/index.js:50-60`）、读者＝`read_library` 四轨含 progress（`kit/handlers.js:264`） | `tests/vmu-v5r-tools.test.mjs:122-131` | ✅ 已实现 |
| B4 | 已尝试路线/方法及进度 | ⚠️ **部分**（`lane-rows-b.md` B4）：`methods` 全链 ✅（`kit/tools.js:22` ＋ read_library）；**`routes` 写得进去但读不出来**——`kit/handlers.js:264` 硬编码四轨（不含 routes），而 `kernel/records.js:582` 的 `records.list({track})` 本身支持任意已声明轨。★★ 更糟的是 `host.js:836` 的 hint 写着"先按 track 收窄"，而 `vibe_vmu_records` 面**没有 track 参数**（`host.js:805-812`）⇒ **假 hint**（比不写更误导） | methods 有断言；routes 无读面无门禁 | ⚠️ 部分 |
| B5 | 遇障路线/方法/障碍及原因归档 | ⚠️ **部分**（`lane-rows-b.md` B5）：`obstacles`／`rejected` 与 B4 同族——**写有读无**（`read_library` 四轨不含它们） | 无 | ⚠️ 部分 |
| B6 | 命题库：完整定义＋布尔概率∈[0,1]＋进度；证明过程平时只写「证明/证伪**尝试**」字段；真会证了才写正式证明/证伪；**只有含正式证明（写完）的命题卡才能用于辩论**；概率＝1 要标记 verified | track `propositions` + `vibe_v5_record_proposition`（必填 statement/value/motive/p）；"正式证明"字段是**成员文件** `Members/<id>/Propos/<pid>.md` 的 `## 证明尝试/## 证伪尝试`；★「只有正式证明写完才能进辩论」的**机器闸**未找到 | 无 | ⚠️ 部分 |
| B7 | 方法库（一般化/推广/抽象出工具、理论框架） | ✅ **机制＋消费者**（`lane-rows-b.md` B7）：`vibe_v5_record_method`（`packs/v5r/tools.js:1427`）＋ `methods` 轨 ＋ `read_library` 可读 ＋ 轨校验 | `tests/vmu-v5r-tools.test.mjs` 记卡正向组 | ✅ 已实现 |
| B8 | Lean 代码＋编译结果归档；**lean 通过 ⇒ 辩论只查描述/定义符合性 ⇒ 符合即概率＝1 且可入 verified**；参数可开「鼓励形式化」开关 | ✅ **机制＋消费者**（本轮补齐，此前 ❌「联动」）：`vibe_v5_fidelity_conclude`（`packs/v5r/tools.js:926` 起）——`fidelity:'conform'` ⇒ 走**同一条** `gatedCardHandler` 写 p=1（证据＝这次 Lean 作业 ＋ `lean_conformance:'conform'`），再 `singleWriter` 复核 ＋ `promoteVerified({warrant:{id:lean_job,kind:'lean-conformance',subject:cardId}})`（唯一促升入口）；`fidelity:'defect'` ⇒ `kernel.fidelity.declareDefect`（原因必填）；缺作业／面不认识／作业未通过 ⇒ `VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED`（消息区分"面不认识该作业"与"作业没通过（点名 state）"）。★ 施工时按**真实服务面方法名/返回形状**核对，抓出三条"真机上永不命中"的静默机制并已修：`passedWithdrawnFor(id) === true` 与返回的标记对象形状不符（`kernel/fidelity.js:150-158`）、`leanPassedOf` 探 `lean.job` 而面方法名是 `status`（`kernel/lean.js:977`）⇒ **Lean 证据链此前整条是死的**。这也是 `kernel/fidelity`/`kernel/lean` 第一次有 pack 消费者。**仍缺**：「参数可开鼓励形式化开关」的门禁联动（`vmu.math.requireFormal`/`encourageFormal` 当前零消费者，另记） | `tests/vmu-fidelity-conclude.test.mjs` **69/0**；`tests/vmu-debate-subject-proof.test.mjs` **39/0** | ✅ 已实现 |
| B9 | 分派后各自负责部分的论文 | ✅ **机制＋消费者**（`lane-rows-b.md` B9）：政策壳 `packs/v5r/paper.js` ＋ 真流程 `kit/paper.js`（start `:346`、recordPart `:372`、环形互审 `:416-424`、deliverable 是**真布尔**判断 `:399-412`、全员 true 才 awaiting-editor、`recordFinal` 仅主席 `:461`、九节由 parts 按 id＋指纹重组 `:526`）；工具面 `packs/v5r/tools.js:1667` 含 `consult`／`consult_state` | `tests/vmu-v5r-tools.test.mjs` 论文正反组 ＋ `tests/vmu-paper-office-consult.test.mjs` 65/0 | ✅ 已实现 |
| B10 | 脚本文件 | ⚠️ **部分**（`lane-rows-b.md` B10，口径由 Lead 裁定＝「脚本作为所级产物应可归档／复核」才算实现）：**能写**——成员用基座 write 面写脚本文件；**临时跑被真规则拒**（`packs/v5r/prompts/v5r-core.js:224-241`，码 `VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS`，`tests/vmu-entry.test.mjs:392`）；**但"脚本声明／归档／复算"面不存在**，而规则 hint 里写着"归档/复算流程" ⇒ **承诺无落点**（与 B4 的假 hint 同类） ★ **本轮已修**：`vibe_v5_script{op:archive|read|list}` 落地（`packs/v5r/tools.js:556-660`、`:1726-1733`）：脚本落 `scripts` 轨、`kind:'dataset'`（不新增 kind）、指纹由 `records.put` 算、正文逐字返回；轨未声明 ⇒ `VMU_INVALID_ARGUMENT`(declared/missingTrack)，找不到 ⇒ `VMU_NO_SUCH_OBJECT` ⇒ 「写脚本没有归档/复核落点」这句不再成立（`tests/vmu-phase12-closures.test.mjs` 覆盖） | 禁用临时脚本有断言；归档/复算无面 | ✅ 已实现 |
| B11 | 自反馈库：问题/冗余/障碍/可优化点与方案；**院士另含对各阶段（平时/会议/辩论）流程与组织协作的自反馈优化** | ⚠️ **部分**（`lane-rows-b.md` B11，成员侧 a／院士侧 b 分开判）：**a 成员侧 ⚠️** — `vibe_v5_feedback`（`packs/v5r/tools.js:404-440`）三 op、路由必填、interpersonal assessment `:402,:422-425`、`feedback` 轨 `defaults.json:19`、提示行 `v5r-blocks-b.js:89-108`、门禁 `tests/b1prime-feedback-gate.test.mjs`；**但** `read_library` 四轨不含 feedback ⇒ **他人读不到自己之外的反馈**；且 `v5r-blocks-b.js:105`「未闭环条目会出现在汇报与总览的计数里」经复核**确为假承诺**（`packs/v5r/tools.js:177-193` report 与 `:196-215` overview 的 counts 都没有 feedback）。**b 院士侧 ❌** — `grep -rEn "复盘|阶段自|流程优化|组织协作" packs/v5r/` **零命中**，category 是自由串、无阶段维度、无院士专属面/读面/门禁 | a 有门禁；b 无 | ⚠️ 部分 |

## §3 平时研究推进（C）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| C1 | 平时推进的完整流程（从目标到产出） | ✅ **机制＋消费者**（`lane-rows-c.md` C1）：任务板（`vibe_v5_task_*`）→ 记卡四轨 → `read_library` 读回 → 论文阶段的 parts 组装，全链有工具面与门禁 | `tests/vmu-v5r-tools.test.mjs`、`tests/vmu-task-*` | ✅ 已实现 |
| C2 | 成员之间可以互相通信；紧急情况可私信 | ⚠️ **部分**（`lane-rows-c.md` C2）：三通道机制齐（`say`／`message`／`inbox`），通知文本真机验过；**但"紧急私信"对成员不可达**——`vibe_v5_say` 的 DM 分支没有 `urgent`（`kit/handlers.js:204-210`），紧急只能走**没被教过**的 `vibe_vmu_mailbox`；`inbox` 行 8 个字段里也没有 `urgent` ⇒ 机制在、入口不在成员的可见面里 ★ **本轮已修**：`vibe_v5_say` 私信分支接受 `urgent:true`（透传 `kernel.mailbox.send` 的 urgent 语义），会议发言/群聊带 urgent ⇒ `VMU_INVALID_ARGUMENT`（点名「没有收件人可唤醒」）；`inbox` 行字段 8→9（加 `urgent`）。★ 仍留一条内核缺口：`kernel/mailbox.js` 的 `listRow`/`openView` 丢 `urgent`，已派 vmu-core 补两行 | 通道有断言；紧急面**无门禁** | ✅ 已实现 |
| C3 | 状态面板：写自己 / 看他人 / 时间戳 | ⚠️ **部分**（`lane-rows-c.md` C3）：写自己（`track=state`）、看他人（`vibe_vmu_records`）、时间戳都在；**但四个必需内容零闸**，提示词里连"状态版"都没有，且被教的 `vibe_v5_read_library` 硬编码四条轨、**读不到 state**（`kit/handlers.js:264`） ★ **本轮已修**：`state` 轨四要素成闸：缺任一 ⇒ `VMU_INVALID_ARGUMENT` ＋ `missing:[…]`/`required:[…]`；嵌套/平铺两种写法都认，`content` 不能替代四要素，未知要素不静默丢；`read_library` 改为从 `vmu.records.tracks` 派生（state/obstacles/rejected/feedback 都读得到） | 无 | ✅ 已实现 |

## §4 会议（D）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| D1 | **只有院士**能预约会议（可设预约时间；到点人未齐可进等待；超时未齐由院士自决） | **四半都落了**：① 召开权 `open()` 的 `vmu.meetings.conveneRequiresChair`（装配主席必须自报 actor 且等于该主席：不能替别人开、不能匿名开）；② **预约时间** `open({at})` ⇒ `state:'scheduled'` + `scheduledFor`，`vmu.meetings.scheduleAllowed:false` 时具名拒；③ **等待阶段** 到点人未齐 ⇒ `state:'waiting'` + `waitStartedAt` + `waitDecisionDue`，`vmu.meetings.waitOnDueMs` 决定何时催；④ **超时自决** `proceed({meeting, actor, decision:'start'|'lapse'})`，`vmu.meetings.waitDecisionRequiresChair`（v5r=true）⇒ 非主席具名拒；到点人齐 `syncMeeting` 自动 `started` 并记 `startedLate` | `tests/vmu-meeting-types.test.mjs` §5a/§6（含"设了值≠生效了"的 scheduleAllowed=false 反例、人齐自动开、等待态、非主席 proceed 被拒、无轨时 proceed 具名不可用） | ✅ 已实现 |
| D2 | 院士召开、关闭、**延长时长上界**；院士主持 | **三条都有了**：`open()` chair 轨；`close()` 的 `vmu.meetings.closeRequiresChair`（须 actor＝本会主席，否则具名拒）；`extendWall({meeting, ms, actor, why})`＝**会议级**延长（正步长校验、`vmu.meetings.extendCeilingMs` 天花板 4h、越过具名拒、回执带 before/after/actor/why，且**延长后的界真的被 speak 消费**）。主持＝`chairNeutral`/`order`/`interrupt`/`recess`/`queueGate` | `tests/vmu-meeting-types.test.mjs` §5b/⑤c（8 断言，含"延长是假的就会红"的两条）＋ 内核面 `extendlimit` 可达性 | ✅ 已实现 |
| D3 | 院士设：标题、**类型**、内容事项、邀请成员、时长上界 | **五个字段都可设且都可读回**：标题＝`open({title})`（**新加的独立承载字段**：非字符串具名拒、空白归一 null，回执/`summary()`/`meetingView()`/`meetings/opened` 全能读到）；类型＝`type`（`vmu.meetings.typeCatalog` 六值，未知具名拒并列合法值）；内容事项＝`materials`（★ 原来**只用于 `materialsRequired` 校验然后被丢弃**，`m.materials` 零读者 ⇒ 现在作为指针承载并在两个读面回吐，非字符串具名拒）；邀请成员＝`roster`；时长上界＝`hardLimitMs`（可 `extendWall` 延长） | `tests/vmu-meeting-types.test.mjs` §1–§4 + §3b（标题/议程各 6 条，含"同议程不同标题 ⇒ 不同标题"证明不是派生） | ✅ 已实现 |
| D4 | 院士通过命令自组织、决策会议中一切内容/控制/活动 | **✅ 命令面齐备且在 41+21 个活工具里**：内核面 `vibe_vmu_meeting` 的 action 枚举（`tools/meeting.js:26`）含 `open/speak/silent/hand/hands/refuse/invite/invitedspeak/end/agendaclose/agendaitems/leaverequest/leaveapprove/leaverequests/aggregation/complete/phase/status/summary/snapshot/close/extend/extendlimit/lapse/revokelapse/ballot/vote/tally/reopen/freeze/unfreeze/boxopen/boxcast/boxclose/boxreopen/boxlapse/boxrevokelapse/second/withdraw/flow/overrideorder`；主席专属约束是**运行期具名拒**而非命令缺失（`chairNeutral`/`closeRequiresChair`/`conveneRequiresChair`/`extendWall`）。★ 注意：pack 面 `vibe_v5_meeting` 是**单用途 open**（D1 收口），主持动作走内核面 | 上面的枚举行号＋`tests/vmu-meeting-types.test.mjs` §5a–§5d；内核面 `extendlimit`/`proceed`/`attend` 可达性各 1 断言 | ✅ 已实现 |
| D5 | **特殊类型会议下框架初始给院士推荐流程骨架**，实施/是否遵循完全由院士决定 | `packs/v5r/meeting-procedures.js`（140→265 行）：`step()` `:37` 给每步加**可机器核对**的 `tool:` 字段；六套骨架 `MEETING_PROCEDURES` `:196`（`DEBATE_PROCEDURE` `:48` 四步文本逐字未动）；**`MEETING_PROCEDURE_DECISIONS` `:209`** 要求六类各有决议（不给骨架须写具名 reason）；`procedureFor()` `:246`；每套 `binding:"recommendation"`，回执 `procedureNote` 写明"推荐不是门禁" | `tests/vmu-meeting-procedures-catalog.test.mjs` 38/0（用真机 `state.specs` / `kernel.packTools()` 核对每个 `tool:`，含"篡改副本必须被抓"控制组）＋ `tests/vmu-meeting-types.test.mjs` 126/0（六类各有骨架、每步有 what、`tool:` ∈ 派生工具集、decisions 全覆盖） | ✅ 已实现 |
| D6 | 允许一次性设置**连续展开的多个会议** | `open({sequence:[…]})`：每个后续会议的描述符**在任何事发生前**就校验（错在第 3 个当场拒，不是等三个会议之后）；描述符不许自带 chair/actor（否则是绕过召开权轨的第二条召开路径）；`advanceSequence` 在当前会议 `close()` 时把下一个转成 `scheduled` 并继承主席；`seqInfo` 在 `summary()`/`meetingView()` 报告 `{index,total,next}`；整串超出 `extendCeilingMs` ⇒ 具名拒 | `tests/vmu-meeting-types.test.mjs` §8（序列开 2 个、描述符非法当场拒、关一个自动启下一个、越界拒） | ✅ 已实现 |
| D7 | 成员可用命令/工具**按会议类型和身份**有差异 | **两个维度都成形**：① 身份维＝活的可见工具表（`host.js:1681-1691` / `:1722-1729`）＋内核运行期具名拒（`requireChairSeat` / `chairNeutral` / `closeRequiresChair`）；② **类型维＝`packs/v5r/meeting-tool-face.js`**（`MEETING_TYPE_TOOL_FACES` `:21`：debate 收窄 20 项 allow，其余五类 `narrowed:false` ＋具名 reason）＋新工具 `vibe_v5_meeting_round`（`tools.js:1166` / `:1868-1876`）：allow＝`kernel.toolsView({member})` ∩ 策略表，**只收窄**；身份面读不到 ⇒ `VMU_ENGINE_UNAVAILABLE`（不猜 allow）、交集空 ⇒ `VMU_STATE`；`applyMeetingTypeFace()` `:107` 两阶段应用避免 override 残影；override 只活一轮，`finally` 清 | `tests/vmu-meeting-type-tools.test.mjs` 51/0（辩论期 `vibe_v5_paper` 不在 allow ／正常会议零 override／主席永不被收窄）＋ §5a–§5d 的身份拒法 | ✅ 已实现 |
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
| F4 | 功能尽量通过**代理可执行命令（工具）**实现，而非每轮结束输出 JSON | ⚠️ **部分（本轮把口径纠正了）**：替代通道是**已存在的工具**——`vibe_vmu_turn {op:'reply', reply, reply_for?}`（`vibe-math-vmu/tools/turn.js:87-134` 调 `kernel.turn.supplyMemberReply`；内核侧 `supplyStructuredReply` 在 `kernel/turn/index.js:1005-1063`，两个真值源冲突 ⇒ `VMU_TURN_REPLY_CONFLICT`，`mergeReplyChannels` `:228-260`）；回执里的 `closureVote` 是**机器字段**（不是让人手写）。★ **更正我上一版台账写错的话**：这里曾写「`vibe_v5_reply`（别称 `vibe_v5_verdict`）」——**`vibe_v5_reply` 这个工具不存在**（`packs/v5r/tools.js` 只声明 `vibe_v5_verdict` 与 `vibe_v5_verdict_final`），是 vmu-pack 的静态门禁 `audit-prompt-tool-params` 按「参数键 ⊆ 真工具表」把它抓出来的。★ 教训：写给模型的花名一旦是幽灵，比不具名更糟（模型会照它调用，然后必拒）。**仍缺**：提示词仍教每轮手写 JSON 围栏（见 F5；现由附加的更正段抵消，但旧句仍在） | `tests/vmu-turn-reply-tool.test.mjs` 32/0、`tests/vmu-turn.test.mjs` 191/0 | ⚠️ 部分 |
| F5 | **提示词与规则完全相符自洽**：删除「m 票机制」「每轮结束返回 JSON 机制」等不再适用的内容 | ⚠️ **部分（旧措辞一条没删，只加了「更正段」）**：新 `vibe-math-vmu/packs/v5r/prompts/v5r-corrections.js`（order **890/891/892/893**，在 `PACK.sections` **无条件注册**）四段分别更正：① 手写 json 围栏 ⇒ `vibe_vmu_turn{op:"reply"}`（351 字）② `vibe_v5_tool_help({"tool":…})` ⇒ 真实签名只有 `{member}`（186 字）③ `end_verify`/`formal_proof` ⇒ `formal:{decision,file,note}`（230 字）④「凑够 m 票」⇒ `quorumRule`+`defaultTally` 一致判定（250 字）。★ 踩坑已记录：初版放 900-903 会被派生成 `override` 区间而**在装配里静默消失**（`pack` 区间是 `[600,899]`）。装配实测 **25164 字符**，四段位于 24086/24459/24664/24913，**都排在全部旧措辞之后**；`tests/vmu-prompt-corrections.test.mjs` **68/0**（含「真实装配里更正句晚于旧措辞」＋TEETH），`tests/audit-prompt-tool-params.test.mjs` **77/0**（参数键 ⊆ `kernel.packTools()` 的 `parameters`，工具表不硬编码；账本 shrink-only）。★ **为什么还不算完**：规则要求的是**删除**，四段是**追加更正**——旧句仍在装配里（`m 票`×3、`法定票数`×1、围栏、`end_verify`/`formal_proof`）；`v5r-persona.js`/`v5r-prompts.js` 是 GENERATED（`scripts/generate-pack-prompts.mjs` 从 `prompt-corpus-v5.json` 生成 + sha 断言）⇒ 删旧措辞必须走 generator，不能手改。`vibe_v5_tool_help` 的 `tool` 键（`v5r-blocks-b.js:235` + 46 处生成副本）现记在 `tests/_lib/prompt-mechanism-whitelist.mjs` PART 2 `PROMPT_PARAM_DIVERGENCES`（cap=1，shrink-only） | `tests/vmu-prompt-corrections.test.mjs` 68/0、`tests/audit-prompt-tool-params.test.mjs` 77/0、`tests/vmu-prompt-mechanism-parity.test.mjs` 64/64 | ⚠️ 部分 |

## §7 汇总

| 组 | 条数 | 已实现 | 部分 | 缺口 | 待核 |
|---|---|---|---|---|---|
| A 成员 | 4 | 2 | 2 | 0 | 0 |
| B 文件与归档 | 11 | 4 | 5 | 2 | 0 |
| C 平时推进 | 3 | 3 | 0 | 0 | 0 |
| D 会议 | 15 | 11 | 4 | 0 | 0 |
| E 论文 | 4 | 1 | 3 | 0 | 0 |
| F 额外要求 | 5 | 2 | 3 | 0 | 0 |
| **合计** | **42** | **23** | **17** | **2** | **0** |

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
| F4 | 回复不再是手写 JSON 的**唯一**路径：`vibe_vmu_turn{op:'reply'}`（`tools/turn.js:87-134`）＋回执里的机器字段 `closureVote`＋`noReplyShape`（该字段要会议却没给会议 ⇒ 具名 `notApplicable`，不拼 `undefined`）。★ 更正：曾写作 `vibe_v5_reply`，**该工具不存在** | `tests/vmu-turn-reply-tool.test.mjs` 32/0、`vmu-turn` 191/0 |

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
`§7` = **49 条 = 32 已实现 / 17 部分 / 0 缺口 / 0 待核**（本轮 B2 蓝图机制、B8 lean⇒辩论联动 两条 ❌ 翻 ✅；表从 42 行扩到 49 行——原 D 组按"预约/关闭/延长/序列/类型/邀请"拆细后逐条自查，行数增加而结论不变：**没有任何一行还停在"待核"**）。

### 5. 本批交给三条 lane 的（尚未回收）
- `vmu-pack`：F5 更正段 ×4（JSON 围栏／tool_help 参数／`end_verify` 与 `formal_proof`／`m 票` 的真实机制）＋ 静态门禁"提示词教的参数必须 ⊆ 工具 schema"。
- `vmu-core`：feedback 计数、紧急私信入口（C2）、状态面板四要素闸（C3）、脚本归档面（B10）、`verification-gates` 的两条谓词接线（B8）。
- `vmu-verify`：F1「引擎为何声明了却不物化」与 D7「会议类型 ⇒ 工具面差异」两张只读施工单。

---

## §13 第五批：F4/F5 收口 · 三条翻「已实现」· 两条内核/宿主缺口

**范围**：本批把 §6 表里的 D10、B10、C2、C3、F4、F5 六行全部重判，其中四条改状态；两处框架级缺口（邮件读面、宿主归属）在现场先红后绿修掉；派生面统一重生成后 `regen-all --check` **16/16**。

### 13.1 F4 —— 口径纠正：我上一版台账写了一个**不存在的工具名**
上一版 §9 的 F4 行写「`vibe_v5_reply`（别称 `vibe_v5_verdict`）」。**`vibe_v5_reply` 这个工具不存在**（`packs/v5r/tools.js` 只声明 `vibe_v5_verdict` 与 `vibe_v5_verdict_final`）。它由 `tests/audit-prompt-tool-params.test.mjs`（参数键 ⊆ `kernel.packTools()` 的 `parameters`）抓出——**是 vmu-pack 的静态门禁抓住了 Lead 写错的台账**，不是人复核。

真实通道：`vibe_vmu_turn {op:'reply', reply, reply_for?}`（`vibe-math-vmu/tools/turn.js:87-134` → `kernel.turn.supplyMemberReply`；内核 `supplyStructuredReply` 在 `kernel/turn/index.js:1005-1063`，两个真值源冲突 ⇒ `VMU_TURN_REPLY_CONFLICT`，`mergeReplyChannels` `:228-260`）。`noReplyShape`（要会议却没给会议 ⇒ 具名 `notApplicable`，不拼 `undefined`）在 `kernel/turn/index.js:70-73`、`:1213`。

**教训（写进 lessons 候选）**：写给模型的花名一旦是**幽灵**，比不具名更糟——模型会照它调用，然后必拒。台账里出现工具名时，必须以 `kernel.packTools()` 为唯一来源，且由门禁校验。

### 13.2 F5 —— 四个更正段落地，但「删除」仍未做（所以是部分，不是已实现）
新 `vibe-math-vmu/packs/v5r/prompts/v5r-corrections.js`，order **890/891/892/893**，注册进 `PACK.sections` 后**无条件**出现在装配里。四段：
1. 手写 json 围栏 ⇒ `vibe_vmu_turn{op:"reply"}`（351 字）
2. `vibe_v5_tool_help({"tool":…})` ⇒ 真实签名只有 `{member}`（186 字）
3. `end_verify`/`formal_proof` ⇒ `formal:{decision,file,note}`（230 字）
4. 「凑够 m 票」⇒ `quorumRule` + `defaultTally` 的一致判定（250 字）

**踩坑（已记录）**：初版把四段放 order 900-903，会在派生时落进 `override` 区间而**在装配里静默消失**——`pack` 区间是 `[600,899]`（`kernel/prompt/index.js:24-30`）。是「装配实测里找不到更正句」抓出来的，不是读代码。

装配实测 **25164 字符**，四段位于 24086 / 24459 / 24664 / 24913，**都排在全部旧措辞之后**；`tests/vmu-prompt-corrections.test.mjs` **74/0**（含「真实装配里更正句晚于旧措辞」+ TEETH），`tests/audit-prompt-tool-params.test.mjs` **79/0**（工具表不硬编码；发现账本 shrink-only）。

**为什么还不算已实现**：规则要的是**删除**旧措辞；四段是**追加更正**，旧句仍在装配里（`m 票`×3、`法定票数`×1、json 围栏、`end_verify`/`formal_proof`）。`v5r-persona.js` / `v5r-prompts.js` 是 GENERATED（`scripts/generate-pack-prompts.mjs` 从 `prompt-corpus-v5.json` 生成 + sha 断言）⇒ 删旧措辞**必须走 generator**，不能手改。

### 13.3 B10 / C2 / C3 —— 三条从「部分」翻「已实现」
- **B10 脚本文件**：`vibe_v5_script {op: archive|read|list}`（`packs/v5r/tools.js:556-660`、`:1726-1733`）：脚本落 `scripts` 轨、`kind:'dataset'`（不新增 kind）、内容指纹由 `records.put` 算、正文逐字返回；轨未声明 ⇒ `VMU_INVALID_ARGUMENT(declared/missingTrack)`，找不到 ⇒ `VMU_NO_SUCH_OBJECT`。
- **C2 私信**：`vibe_v5_say` 接受 `urgent:true` 并透传给 `kernel.mailbox.send`；会议发言/群聊带 urgent ⇒ `VMU_INVALID_ARGUMENT`（点名「没有收件人可唤醒」）；`inbox` 行字段 8→9（加 `urgent`）。
- **C3 状态面板**：`state` 轨四要素成闸（缺任一 ⇒ `VMU_INVALID_ARGUMENT` + `missing[]`/`required[]`），嵌套与平铺两种写法都认，`content` 不能替代四要素，未知要素不静默丢；`read_library` 改为从 `vmu.records.tracks` 派生（`state`/`obstacles`/`rejected`/`feedback` 都读得到）。

### 13.4 两条框架级缺口（先红后绿，均由 vmu-core 落地）
1. **邮件读面丢 `urgent`**：`kernel/mailbox.js` 新增 `urgentOfEntry(e)`（布尔透传；只有条目真无此字段才 `null`，不发明 `false`），`listRow` 8→**9**、`openView` 6→**7** 字段。`vmu-mailbox` **73/0**、`vmu-mailbox-falsify` 10/0。
2. **宿主丢被抛拒绝的归属字段**：`host.js` 新增 `refusalAttribution(e)`，错误回执同样带 `enforced`/`enforcedScope`/`settingValues`，再走 `boundedToolResult`（拒绝与成功同一物种）；口径：`enforced` 须数组且去空串、`enforcedScope` 非空、`settingValues` 普通对象；**没设置就不出现**（不造 `enforced:[]`）、非数组不透传。新 `tests/vmu-host-refusal-attribution.test.mjs` **改前 6/4 红 → 改后 10/0**。
`docs/03-interface-contract.md` §7.1 已登记这两条**破坏性变更**（邮件读面字段数 8→9 / 6→7；宿主归属字段）。

### 13.5 F1 —— 引擎「声明了却未物化」被修掉
`packs/v5r/settings/defaults.json` 一行声明 8 个引擎（子集约束，白名单在 `mathadapters.js` ACTUAL_ENGINES；python 是否需要可选标记仍未判定，已写明）；`mathadapters.js:466` 注释更正；`docs/04` §8.1；门禁 `tests/audit-engine-materialization.test.mjs` **17/17**（红先 6/17）。
冷探活实测（`D:\_tmp\f1-engine-probe-timing.mjs`，真 fs + 真 spawn 接缝）：459 ms / 463 ms，各 2 次 spawn，`available=true`。**局限已写进设计单**：本机 8 个候选只有 2 个可解析，故这是「2 次版本探活」成本而非 8 个的上界；`runtimeRoots` 接缝传 `[]`，DSH 自带 runtime 的发现路径未覆盖。测量踩坑也记了：生产接缝返回 `exit`、`probeVersion` 判 `r.exit === 0`，第一版探针只返回 `code` ⇒ 全判「不可用」，**是测量 bug 不是引擎结论**。

### 13.6 我自己犯的三处缺陷（都被门禁/实测抓住）
1. `host.js` 的 records 面**缺 `track` 参数**——而 `docs/03` 与规则集都说「list 可按 track 过滤」⇒ **文档比代码诚实**。已加 `track`（可 `string` 或 `stringList`，未知轨具名拒）。
2. 文档行号引用漂移（旧引用写在 `meeting-procedures.js` 的 `:126` 起、止行超出该文件长度 → 实际 `:121-140`），由 `audit-doc-line-refs` 抓出。
3. 仓库里出现 `<repo>/vmu/state.json` 与 `audit/1970-01-01.jsonl`（探针未显式注入 root ⇒ 按 cwd 建根）⇒ 新增 `tests/audit-repo-leftovers.test.mjs`（**4/0**）：`vmu/`、`audit/`、`Members/`、`Propos/` 这些运行期产物不得出现在仓库根；根目录还出现业务目录时，同时给出「是不是探针按 cwd 建根」的提示。

### 13.7 §7 汇总重算（**派生，不是手抄**）
脚本从 §6 表**逐行读状态列**（末两竖线之间的单元格）统计：`49 条 = 32 已实现 / 17 部分 / 0 缺口 / 0 待核`；A 2/2 · B 6/5 · C 3/0 · D 18/2 · E 1/4 · F 2/4（每组 `✅/⚠️`）。
分组：A 4=(2/2/0/0)｜B 11=(4/5/2/0)｜C 3=(3/0/0/0)｜D 15=(11/4/0/0)｜E 4=(1/3/0/0)｜F 5=(2/3/0/0)。
两缺口：**B2 蓝图机制**（pack 侧未实现）、**B8 lean 通过 ⇒ 辩论联动**。

### 13.8 本批门禁读数
`vmu-meetings` 201/0｜`vmu-meeting-parity` 204/0｜`vmu-v5r-tools` 339/0｜`vmu-planned-settings` ALL GREEN（planned=113，docs=28）｜`vmu-prompt-corrections` 74/0｜`audit-prompt-tool-params` 79/0｜`vmu-phase12-closures` 49/0｜`vmu-mailbox` 73/0｜`vmu-host` 196/0｜`vmu-kernel` 260/0｜`vmu-resume-e2e` 108/0｜`audit-vmu-services` 49/0（83 registered）｜`audit-enforced-consistency` 344/0｜`audit-vmu-docs` 103/0｜`check-docs` PASS｜`regen-all --check` **16/16 in sync**。

### 13.9 仍未完成（按规则原文，不按"看起来差不多"）
| 项 | 状态 | 缺什么 |
|---|---|---|
| B2 蓝图机制 | ❌ | pack 侧「写蓝图 → 按图施工 → 偏差回写」的载体与工具面 |
| B8 lean 通过 ⇒ 辩论联动 | ❌ | lean pass 与「该命题取得公认」之间的具名联动 |
| F5 删旧措辞 | ⚠️ | 必须走 `generate-pack-prompts.mjs` 的语料重生成（含 sha 断言） |
| F4 提示词不再教手写 JSON | ⚠️ | 同 F5（更正段已抵消，但旧句仍在） |
| D7 会议类型 ⇒ 可用工具差异 | ⚠️ | 设计已批准（`lane-verify-r16-design.md` §F），待接线；`turn.step({tools})` 今天零生产者 |
| 真机 SLV 全流程 | 待跑 | 本批全部改动尚未上真机（判据见 §5 开工时那份：`cast:true` + 0 RED + 四类诊断 0） |

## §14 第五批：十二个「永远绿不了」的探针 + 三个「假门禁」—— 归档搬家的路径债收口

**触发**：本批全量 T1 扫出 14 个红。第一层原因是我自己造成的并发事故（见本节末），**第二层是历史债**：
11 个 mutant 探针与 `tests/formal-verify-v4.test.mjs` N6 从 `5077d8e3`（G4 把五个 legacy preset 搬进
`archive/legacy-presets/`）之后**一直红**，形状是 `ENOENT …\vibe-math-vN\vibe-math-vN.js`。

**判定方法（不靠推理）**：在 `D:\_tmp\wt-head` 建 `478b342a` 的纯净 worktree 逐族跑 ⇒ 同样 ENOENT ⇒
**不是本批引入的**，是结构性历史债。一个永远绿不了的探针＝不是门禁；假红和假绿一样坏。

**根因**：`tests/_lib/legacy-presets.mjs` 是唯一路径接缝（`legacyDir()`/`legacyFile()`，默认
`archive/legacy-presets`），搬家那轮改掉了**大部分**测试，漏了 12 个文件。

**已修（12 个文件，全部改走接缝，不改行为）**：
`e2e-identity-a6.mutants` · `formal-verify-v3.mutants` · `formal-verify-v4.mutants` ·
`math-computation-v4.mutants` · `selfdrive-v5.mutants` · `temp-hygiene.mutants` · `v2v3-interrupt.mutants` ·
`v2-fix-probes.mutants` · `v3-fix-probes.mutants` · `v4-final-paper.mutants` · `formal-verify-v4.test`
（前 11 个是 `join(REPO, PRESET, file)`；第十二个是 T1 才抓到的**循环变量**形状
`for (const d of PRESETS) cpSync(join(REPO, d), …)`，字面量正则看不见）。
另有 4 处「把整棵仓库树 copy 到临时目录」的探针也改成按接缝取 archive 文件：
`audit-math-computation-contract.mutants`（`copyTree`）、`audit-path-discipline.mutants`
（`join(repo, f.preset, …)`）、`v2-list-agents-and-next-step.mutants`（`cpSync(join(REPO, d))`）。

**新增门禁 `tests/audit-legacy-path-seam.test.mjs`（26 断言 / 0 失败 / 扫 515 文件）**：
1. 接缝指向 `archive/legacy-presets`；五个归档 preset 都在；**仓库根没有残留副本**（有副本门禁就是摆设）；
2. `tests/`＋`scripts/` 里任何文件都不得从仓库根解 legacy preset：`join(REPO, <legacy 字面量>)`、
   `join(REPO, PRESET|preset)`、`resolve(REPO, <legacy 字面量>)`、`cpSync(join(REPO, d))`；
   `'../vibe-math-vN/'` 只在**该文件没 import 接缝**时算违规（`verify-fixes.test.mjs` 的 `load()` 是接缝感知的）；
3. **假门禁自己要有牙**：12 条样本双向断言（命中 5 种违规写法；不误报 `legacyFile`/`legacyDir`/
   `join(REPO, preset.suite)`——那是**仓内相对**的 suite 路径；不误报注释里的文件名；不误报 `vibe-math-vmu`）；
   非空守卫 `scanned > 200`。

**同类的第三个假门禁（★ 本批最值得记的一条）**：`tests/audit-math-computation-contract.mutants.mjs`
修好路径后**仍全绿**——三个家族都报 `no named red (exit=0)`。根因不在路径，而在被测审计自己：
`tests/audit-math-computation-contract.mjs:51` 的 `read(rel)` 对 legacy preset **无条件走接缝**，
于是 mutant 传给它的 `MC_CONTRACT_ROOT=<变异副本>` 被完全忽略 ⇒ **变异副本里的改动从来没被读过**，
家族「咬不动」却一直算绿。已改成 `ROOT`（当它不等于真仓时）优先。修后
`ALL MUTANTS RED AS REQUIRED`（三个家族分别 230/209/281 ms）。
⇒ 这是「假绿比红更危险」的教科书例子：**变异探针的绿必须证明它读的是变异副本**。

**第四个假门禁（断言编码了缺陷本身）**：`tests/accept-v5r-contrast-behaviour.test.mjs` 曾断言
`quorumCap=2, quorumMin=3` 时 `required === 1`，名字写「exactly as v5r words it」。它绿的原因正是 D12 的缺陷
——旧公式第三项是 `present.size`，`open()` 后只有主席在场 ＝ 1，于是「上限看起来生效了」。
v5r 的说法是 `m = min(cap, |voters|)`：4 名投票人 ⇒ 2。已把期望改成 2，并补一条**双向钉死**
「成员到场不改变 required」（旧公式会改变）。修后 63/0。

**★ 第五个发现（环境耦合，不是本批引入）**：`tests/v4-final-paper.test.mjs` 修好路径后裸跑仍是
`90/3`，三条都栽在「本机没装 LaTeX」的前提上——本机确实装了 TeX Live 2025（`D:/texlive/2025/bin/windows`）。
归档 v4 preset 里有成文沙箱接缝 `V4_TEX_ROOTS_SANDBOX`（task-29 注释：UNSET = identity），而
`tests/run-tests.mjs:158` 全量跑时**会设**它 ⇒ **同一个套件「走 T1 绿、裸跑红」**。带沙箱复跑 `93/0`。
⇒ 结论：legacy TeX 场景的「无 LaTeX」前提只在 runner 里成立，裸跑报的是假红。要不要把 pin 下沉到
`tests/_lib/` 让裸跑也自洽，记为待办（不影响门禁）。

**并发事故（我自己的，记下来别再犯）**：T1 还在跑时我并行跑了 7 个 mutant 家族与两次 v3/v4 套件 ⇒
`audit-declaration-criterion`（180s）、`audit-generators-current`（300s）、`vmu-wiring-index`（180s）、
`b1prime-c3-computed-guard`（180s）、`b1prime-staleness-report`（180s）、`vmu-assistant-systemprompt`
（`ENOTEMPTY` 清理竞态）全部因**资源争用**报红。这些必须在「无其它 lane、无其它命令」时重跑才有意义。
另：`vmu-verify` 用 PowerShell `Get-Content -Raw`+`-replace`+`WriteAllText` 改 `package.json` ⇒
76,118 → 40,342 字节、GBK↔UTF-8 双向损坏（`JSON.parse: Bad control character`）。已从 HEAD 恢复 + Node
重放 9 行 ASCII 登记，`git diff --numstat package.json` ＝ `9 0`。**lane 写盘一律走 Node。**
## §15 第六批：D5 六类推荐骨架 + D7 类型维度的工具面 —— 两条 ⚠️ 变 ✅

**D5（框架初始给院士推荐流程）**：原来只有 `debate` 一套骨架，其余五型 `procedure:null`。
现在（`vibe-math-vmu/packs/v5r/meeting-procedures.js` 140→265 行）：
- `step()` 构造器 `:37` 让每步带**机器可核对的 `tool:` 字段**（`tools[]` 只作给人读的示例）；
  `DEBATE_PROCEDURE` `:48` 四步文本**逐字未动**，只换成构造器并补 `tool:`；
- 新增 `ORDINARY/ACADEMIC/CLOSURE/PAPER/PLANNING` 五套骨架；`MEETING_PROCEDURES` `:196` 六键全量；
- **`MEETING_PROCEDURE_DECISIONS` `:209`**：六类都有决议，"不给骨架"也必须写 `reason`
  —— 「没有决定」不再是合法状态（否则 `null` 会冒充实现）；
- 门禁 `tests/vmu-meeting-procedures-catalog.test.mjs` **38/0**：用**真机工具目录**
  （`state.specs` 与 `kernel.packTools()`）核对每个 `tool:`，并带一节「篡改副本必须被抓」的控制组；
- `tests/vmu-meeting-types.test.mjs`：原三条「其余五类必须没有骨架」的断言是**钉旧行为的**，已改判
  （现在钉：六类各有骨架、每步有 `what`、`tool:` ∈ **派生**的已发布工具集（不再手写白名单）、
  回执写明"推荐不是门禁"、`MEETING_PROCEDURE_DECISIONS` 覆盖全部类型）；该套件 126/0。

**D7 第二句（按会议类型有差异）**：原来"类型只改回执里的骨架文案，不改变任何命令是否可用"。
现在（新文件 `vibe-math-vmu/packs/v5r/meeting-tool-face.js` 143 行 + 新工具）：
- `MEETING_TYPE_TOOL_FACES` `:21`：`debate` 收窄到 20 项 allow；其余五类 `narrowed:false` + 各自 `reason`
  （不收窄也要**具名**，不是沉默）；未声明类型有具名默认；
- `applyMeetingTypeFace()` `:107` **两阶段**：先把每个成员的交集全算出来，再统一设 override
  —— 一边算一边设会在"第二个成员读不到身份面"时把第一个人的 override 留成**扩权残影**；
- 新工具 `vibe_v5_meeting_round`（`tools.js:1166`，注册 `:1868-1876`）：**只能收窄**
  （allow ＝ `kernel.toolsView({member})` ∩ 策略表）；读不到身份面 ⇒ `VMU_ENGINE_UNAVAILABLE`
  （**猜一张 allow 就是扩权**）；交集为空 ⇒ `VMU_STATE`（不静默空集）；override 只活一轮，`finally` 清；
- 门禁 `tests/vmu-meeting-type-tools.test.mjs` **51/0**：辩论期间 `vibe_v5_paper` 不在 allow、
  正常会议**一个 override 都不设**、主席永不被收窄。
- ★ 为什么 enforcing 生产者是新工具面而不是"开会时自动收窄"：`tools/turn.js:136-177` 的 `{tools}` 是
  **调用者**给的一次性形状，`vibe_vmu_turn` 不接受外部策略；中间件拿不到 kernel root（只有面）；
  服务会议只 emit `meeting/motion|second|withdrawn`，**没有 open/close 钩子**，`HOOK_REGISTRY` 也没有
  `tool/*` 钩子 ⇒ 框架**没有**"开会即收窄"的接缝。pack 工具 handler 拿得到 composition root
  （`host-pack-tools.js:189/202`），所以做成显式工具面 —— 记录为**已知形状缺口**，没有假装有。

**同批落地的其它读数**：`V5R TOOLS` 339/0（工具 44→45 已同步所有计数面）、`MEETING TYPE TOOLS` 51/0、
`MEETING PROCEDURES CATALOG` 38/0、`INSTALLER POLICY` 90/0、`MEETING INVITE` 67/0、`PAPER CONSULT TOOL` 66/0、
`package.json#files` 788→791、`installer.js` PRESETS 262→263。

**★ 记账事故（记下来别再犯）**：我第一次改这两行是用 `node -e "…"`（**双引号**）内嵌带反引号的 Markdown
——bash 把反引号当**命令替换**执行掉，替换成空串，那次写入根本没落地，而脚本末尾还打印了「已写入」。
教训与 R16 的 `package.json` 事故同族（**同一类：把内容塞进会被 shell 二次解释的引号里**）：
凡是带反引号/`$`/换行的内容，一律**写脚本文件**再 `node <file>`，写完**读回断言行级状态**，
不许只信脚本自己打印的成功行。已用 `D:\_tmp\patch-d5d7.mjs`（带读回断言）重做，读回 `D5/D7 = ✅ 已实现`。

## §16 第七批：一条"默认未物化"的裁决 ＋ 辩论对象的**分层**拒绝 ＋ F5 的层界更正

### 16.1 F1"计算工具"：**裁决＝默认物化**，不是文档化缺口

现象（实测）：`vmu.math.engines` 在 schema 里声明 8 个引擎、`defaults.json` 里是空列表
⇒ 真机上 `vibe_v5_lean_run`/计算面走到适配器解析时抛 `VMU_MATH_UNSUPPORTED_OP`，
**出厂默认即不可用**；而文档把"没装引擎"写成用户环境问题。

裁决理由（与规则"院士可设置并发上限、且计算能力默认可用"对齐）：
- 空列表是**抑制机制**，抑制机制的默认必须是"不抑制"（红线⑤：该有的默认要真的成立）；
- 声明 8 个而默认 0 个，是"声明了却不生效"的同族（L27）；
- 正确做法不是把 8 个硬编码进 schema（红线②禁止可派生硬编码），而是让 **pack 的声明值**
  `vmu.math.engines` 与**适配器注册表派生集合**在装配期对齐，并给一条门禁钉住。

落地：
- `vibe-math-vmu/packs/v5r/settings/defaults.json` 的 `vmu.math.engines` 由空列表改为
  **8 个声明值**（`lean4,sympy,z3,sage,mathematica,matlab,python,lean` —— 与
  `packs/v5r/math-computation.js` / `kernel/mathadapters.js` 的引擎表同一份派生源核对）；
- 新门禁 `tests/audit-engine-materialization.test.mjs` **17/0**：① 断言每个引擎名在
  适配器表里**存在**（拼错即红）；② 断言 `defaults.json` 的声明集合 == 适配器表的派生集合
  （不是手写副本，两边都从同一处读出后比）；③ 每条带反向控制组（临时改动声明 → 必须被抓）；
  ④ 断言"未物化时被具名拒绝"这条**旧行为**仍然可表达（不是删掉解释，而是让它成为非默认路径）。
- `vibe-math-vmu/docs/04-settings.md` §8.1 补一段：出厂默认物化了哪些引擎、未物化时**为什么**会被
  具名拒（`VMU_MATH_UNSUPPORTED_OP` 的 hint 指向"院士设置 `vmu.math.engines`"）。

### 16.2 B6"辩论对象"：**两种缺失，两个码**

原实现把"没有证明"和"自述写了但没证据"合并成一条拒绝，模型无法据此决定下一步。
现在（`vibe-math-vmu/packs/v5r/verification-gates.js` 的 `debateSubjectGate`）：
- `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF` —— 连自述都没有（`proofRef` 空 / 无 `verified` 行 / Lean 未通过
  / 文件不可读 / 一句话命题无承载）；
- `VMU_PACK_V5R_DEBATE_SUBJECT_UNPROVEN` —— `proofRef`＋`proofState=complete` 写了，但**无机器证据**
  （无 Lean passed 且无 `verified` 轨定论行）⇒ 拒绝文案点名实收值并给两条合法路径；
- 反向路径保留：有机器证据时 `proofVia` 记 `'lean-passed'` / `'verified-row'`，且未声明
  `proofState` 时 note 明说"放行依据是机器证据，不是自报"。
- 两个码都已登记在 `vibe-math-vmu/docs/03-interface-contract.md` §8 手写表（成对：码 + 触发条件 + 现场 + 齿）。
- 门禁：`tests/vmu-debate-subject-proof.test.mjs` 六节 + `tests/vmu-verified-gates.test.mjs` 双向（96/0 → 更新后 98/0）。

### 16.3 F5 的**层界更正**（我错了一次，记下来）

我最初给 `promptpolicies-fix` 的口径是"手写段可改、生成段不可改"。**这个切分是错的**：
`tests/vmu-turn.test.mjs` 的 T71 把**源派生的 charter 散文行**钉死为"历史逐字"，
所以「手写 charter」同样属于 **capture 层**。正确的切分是：

| 层 | 内容 | 可否改 |
|---|---|---|
| capture 层 | 手写 charter/blocks、GENERATED persona/corpus（有 sha256 与 parity 断言） | **冻结**（改了 T71 就红） |
| 声明层 | `vibe-math-vmu/packs/v5r/prompts/v5r-corrections.js`（orders 890/891/892/893） | 唯一可作者处 |
| 派生面 | docs/04 §11 settings 表、kernel index、counts | 只能由脚本生成 |

结论：退役机制（每轮 JSON 回复、自算 `m 票`、幻影工具 `end_verify`/`formal_proof`、
`Verified/` 落盘路径）**只通过 corrections 的作废声明收口**，capture 层一字不改。
判据改为「装配文本里每类退役机制都有对应作废声明 ⇒ ✅；旧措辞留在 capture 层不判红（历史记录不是教程）」。
- 新门禁 `tests/audit-prompt-retired-mechanisms.test.mjs` **58/0**：配对表（退役机制 id → 声明所在行）、
  更正段名"旧+新"成对、`order ∈ [600,899]`（越界会静默变 `override` 不进装配，本阶段实测过的坑）、
  声明里出现的工具名必须**真实存在**（幻影工具名在此拦）。
- ★ 诚实边界：这属**声明层**收口，不是物理删除；live 文本仍是"旧段 + 后置作废声明"，
  依赖模型遵守后置声明。台账按"已收口（声明层）"记，不写"已删除"。

### 16.4 同批：写作通道纪律进 docs（R16 事故的可核对版本）

`vibe-math-vmu/docs/11-gates-and-development.md` §4.2 第五条后 +9 行（`:141-148`）：
`Get-Content -Raw` → `-replace` → `WriteAllText` 在本机 GBK 控制台把 UTF-8 的 `package.json`
写成 **76,118 → 40,342 字节**、`JSON.parse` 抛 `Bad control character`；恢复＝`git checkout` ＋ Node
重放 ASCII 登记行。四条：① 写盘通道一律 Node（`readFileSync`→替换→`writeFileSync`）；
② 改共享 JSON/Markdown 前 `git status --porcelain -- <file>` 查并发写者；③ 写前确认非生成区；
④ 带反引号/`$`/换行的内容一律写脚本文件再 `node`，写完**读回断言**。
★ 同族第二次事故：我改 §15 的 D5/D7 两行时用 `node -e "…"`（双引号），bash 把 Markdown 反引号当
**命令替换**吃掉，写入根本没落地而脚本仍打印"已写入"。两次都是同一类：内容进了会被 shell 二次解释的引号。

### 16.5 本案读数

`ENGINE MATERIALIZATION` 17/0 · `VERIFIED GATES` 98/0 · `DEBATE SUBJECT PROOF` 6/0 ·
`PROMPT RETIRED MECHANISMS` 58/0 · `DOC VS CODE TABLES` 17/0 · `DOC ACTIONS` 61/0 ·
`DOC LINT: PASS` · `audit-vmu-docs` 仅余 settings 表 STALE（合并期统一 regen）。
未提交（本批仍在合并期）；本批结束后统一 `regen-all --write` → 全量 T1（**无并发**）→ 单次 commit。

### 16.6 B8 带出的两条"真机上永不命中"的静默机制

B8（忠实性收口链路）施工时，按**真实面方法名**核对证据链，发现两条"代码里有分支、真机永不走到"的缺陷：

| # | 缺陷 | 位置 | 为什么单测看不出来 |
|---|---|---|---|
| 1 | `fidelity.passedWithdrawnFor(id) === true` 与返回形状不符 —— 内核返回**标记对象** `{ok,target,withdrawn:true,...}` | `packs/v5r/verified.js` `findVerified`/`promoteVerified`；内核 `kernel/fidelity.js:150-158` | mock/单测里"对象 === true"就是 false，测试只能构造出"不命中"的世界；真机同样不命中，于是**两边一起错**（假绿） |
| 2 | `leanPassedOf` 探 `kernel.lean.job(...)`，而面方法名是 `status(id)` | `packs/v5r/tools.js`；内核 `kernel/lean.js:977` | mock 里写什么方法名都"存在"；真机上 `job` 是 `undefined` ⇒ 分支被"面不存在"路径吃掉，**Lean 证据链整条是死的** |

修法：`withdrawnBy(fidelity,id)` 认两种形状；`leanPassedOf` 以 `status` 为主、兼容 `job`，并**如实区分**
"面不存在（零机制正常态）"与"作业没通过（点名 state）"——后者才是拒绝。

★ 教训（并入 R16 家族）：**"代码里有分支" ≠ "真机会走到那个分支"**。证据链的每一环都要按
**真实服务面的方法名**核对一次，不能靠 mock；mock 会跟着代码一起错。
★ 同批还带出第三条：B8 的新工具让 `kernel/fidelity` 第一次有了 pack 消费者——它此前是 E4/F3 那条
"无消费者的内核面"清单里的成员，现在从"无消费者"变成"有消费者但只有一条"。

## §17 第八批：B6/B8/B2 收口 —— 两个 ❌ 变 ✅，四类"没有写者的路径"补上写者

### 17.1 B6 命题卡与辩论的**证据层**
- `packs/v5r/verification-gates.js` 的 `debateSubjectGate` 增加**证据层优先**：`proofRef`＋`proofState` 是**声明**，`lean-passed` / `verified` 轨定论行是**证据**；声明"已写完"但无证据 ⇒ `VMU_PACK_V5R_DEBATE_SUBJECT_UNPROVEN`，连声明都没有 ⇒ `..._NO_PROOF`。
- `packs/v5r/tools.js` 的命题卡声明层补 `proof_ref` / `proof_state`（此前模型只能把"我证完了"写进自由文本）。
- 门禁 `tests/vmu-debate-subject-proof.test.mjs` **39/0**（六节：三种 subject 形态 × 声明/证据四象限）。

### 17.2 B8 lean 通过 ⇒ 符合性收口（新增唯一促升入口的正式用法）
- 新工具 `vibe_v5_fidelity_conclude`（`packs/v5r/tools.js:926` 起）：`fidelity:'conform'` ⇒ 走**同一条** `gatedCardHandler` 写 p=1（证据＝这次 Lean 作业 ＋ `lean_conformance:'conform'`），再 `singleWriter` 复核 ＋ `promoteVerified({warrant:{…,kind:'lean-conformance'}})`；`fidelity:'defect'` ⇒ `kernel.fidelity.declareDefect`（原因必填，留下撤回标记）。
- 缺/未知/未通过 ⇒ `VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED`（message 区分"面不认识该作业"与"作业没通过（点名 state）"）。
- 门禁 `tests/vmu-fidelity-conclude.test.mjs` **69/0**。`kernel/fidelity`、`kernel/lean` 第一次有 pack 消费者。
- ★ 本节带出的三条静默机制见 §16.6（`=== true` 对对象、`lean.job` vs `lean.status`、`verified.js` 同族两处）。

### 17.3 B2 公共蓝图：把"路径约定"变成"有闸的轨"
- 新模块 `packs/v5r/blueprint.js`（335 行）：`BLUEPRINT_TRACK='blueprint'`(:38)、`BLUEPRINT_ADOPT_SLOT='chair'`(:45)、`BLUEPRINT_STALE_AFTER_MS`=30 天(:47)；`proposeBlueprint`(:200 任何在册成员) / `adoptBlueprint`(:244 **仅 chair 席**) / `listBlueprints`(:117) · `blueprintState`(:141) · `readBlueprint`(:187)。
- **装配期登记**：`packs/v5r/settings/defaults.json` 的 `vmu.records.tracks` ＋ `allowedKinds`（★ `kernel/records.js:189-221` 的轨集合是**构造期快照**；运行时临时 put 一个未声明轨会静默落默认轨）。
- 工具面 `vibe_v5_blueprint{action:state|propose|adopt|read}`（`packs/v5r/tools.js:1417`，注册 :2196）。
- 三条语义纪律（写进文件头）：**"在生效"是派生的**（current 行最高 revision，不另存一份事实）、**草案只增不改**（重复落成只查 current 行 `proposalId`）、**stale 是提示不是拒绝**（`ageMs`/`staleAfterMs`/`staleNote` 全可读）。
- 读面不新造：`vibe_v5_read_library{track:'blueprint'}` 靠 `declaredTracks(kernel)` 天然可读。
- 门禁 `tests/vmu-blueprint.test.mjs` **54/0**。
- **仍缺**：提示词没有一段教"蓝图怎么用"（工具 description 自述）——记在台账与 `docs/14`，不假称已收口。

### 17.4 本批的登记债（三条，都是"能被装、但装了会坏"）

| 问题 | 现象 | 修法 |
|---|---|---|
| 新测试未登记 | 8 个新 `.test.mjs` 不在 `package.json#files`（该字段是**显式清单**，不是 glob） | `node` 脚本按序插入并**读回断言**（files 795→802） |
| 新模块未进 installer | `installer.js` PRESETS 的 `files` 是**相对 `src:'vibe-math-vmu'` 的路径** | 第一版误写成 `'vibe-math-vmu/packs/v5r/blueprint.js'` ⇒ `audit-installer-policy` 直接 `ENOENT` 崩在 `vibe-math-vmu/vibe-math-vmu/`；改成 `'packs/v5r/blueprint.js'` ⇒ 90/0 ALL GREEN |
| 新码未进 docs/03 §8 | `audit-vmu-docs` 红 | 手写表补 `DEBATE_SUBJECT_UNPROVEN`、`FIDELITY_LEAN_NOT_PASSED` 两行（成对：触发条件＋现场＋齿） |

★ 教训：`package.json#files` 与 `installer.js` 的路径**基准不同**（仓库根 vs preset 根），新增运行文件必须两处都写且各自按自己的基准写；写错时 `audit-installer-policy` 会以 **ENOENT 崩**而不是报一条可读的红。

### 17.5 F5 的层界落进代码注释（防下一个人重犯）
`packs/v5r/prompts/v5r-core.js` 的 correction 接线注释原来写"900..903"——**错的**：`ORDER_RANGES.pack` = [600,899]，900 会静默变 `override` 而不进装配。已改为 890..893，并把这条坑写进注释本身。

### 17.6 本批读数
`BLUEPRINT` 54/0 · `FIDELITY CONCLUDE` 69/0 · `DEBATE SUBJECT PROOF` 39/0 · `V5R TOOLS` 339/0（工具 47）· `VERIFIED GATES` 98/0 · `RECORDS` 269/0 · `LIBRARY` 126/0 · `MEETING TYPES` 126/0 · `SETTINGS` 47/0 · `INSTALLER POLICY` 90/0 ALL GREEN · `PACKAGE MEMBERSHIP` 29/0 · `DOC VS CODE TABLES` 17/0 · `DOC ACTIONS` 61/0 · `DOC LINE REFS` 9/0 · `DOC LINT: PASS`。

`§7` 重算（脚本逐行读末列）：**49 条 = 32 ✅ / 17 ⚠️ / 0 ❌ / 0 待核**（A 2/2 · B 6/5 · C 3/0 · D 18/2 · E 1/4 · F 2/4）。仍未提交；本批末统一 `regen-all --write` → 全量 T1（无并发）→ 单 commit。

## §19 批次后的全量 T1：7 条红逐个归因（4 真缺陷 + 3 条预算过时）

提交 `e0bba243` 后第一次安静全量 T1（`node tests/run-tests.mjs`，无并发、无 lane 在跑）：**495 PASS / 7 FAIL**。七条全部逐条跑出根因，无一条"因为忙所以红"的原谅。

### 19.1 四条真红（都已修，全部改的是"闸本身"而不是被闸的东西）

| 红 | 根因 | 修法 |
|---|---|---|
| `audit-assembly-reachability-snapshot` 15/1 | 可达集合多了三个**本批新增**的 pack 模块（`blueprint.js`／`meeting-tool-face.js`／`paper-quality.js`），基线没跟着动 | `--write` 重新生成（先看 diff：只有 3 个 added、0 removed），再跑 16/0 |
| `audit-planned-names` 13/1 | `docs/08:1335` 那行"临时授权（已移除）"里写着 `vibe_vmu_grant`，而 `grant` **确实还是** `chat` 工具的 `op` 之一 ⇒ 闸要求该行说出"其能力＝grant" | 把行改成"⛔ 已移除（其能力＝原 `grant` 动作；与 `chat` 工具的 `op:"grant"` 同名不同事，别混）"；14/0 |
| `audit-scanner-selfproof` | 新门禁 `audit-prompt-retired-mechanisms.test` 既无自证也未登记 ⇒ 正反两条都红（`proven 62 + exempt 67 ≠ total 130`） | 登记进具名债务 `UNPROVEN`（提交说明里写明理由：它的"0 findings"暂时无法与死谓词区分）；4/0 |
| `audit-declaration-criterion` 86/3 | ★ **RULE E：我自己新写的 13 条断言是"可空真"** —— `x.every(...)`／`for..of`／`JSON.stringify(a)===JSON.stringify(b)` 在空集合上恒真 | 12 处加非空前置（`x.length > 0 && x.every(...)`、循环前一行 `ok(x.length > 0, ...)`），1 处形状 B 加 `a.length > 0 && a.length === b.length`；两处**刻意允许空集**的用 `// EMPTY_ALLOWED` 写明理由（"六个类型今天都有骨架"是规则演进的结果，不是缺陷）；最终 89/0 |

★ 19.1 的最后一格是本批**最有价值的一条**：我新加的断言里有一半是"集合为空时也通过"。这正是本阶段反复记的"假绿比红危险"——只是这次假绿长在我自己的新测试里，是 RULE E 抓出来的，不是我读出来的。

### 19.2 三条超时的归因：不是并发，是预算本来就不够（并且方法可复核）

| 套件 | 旧预算 | 本机单独实测 | 判据 |
|---|---|---|---|
| `audit-generators-current` | 300 s（注释写"MEASURED 136.8 s · 2026-10-22 · 2.19x"） | **320.8 s**（23/0，exit 0） | 2 天里成本翻倍（本批加了 3 个 pack 模块 + 1 个测试文件），旧 300 s **单独跑就会杀**，不是被别的 lane 挤死 |
| `b1prime-staleness-report` | 180 s（默认） | **219.0 s**（16/0，exit 0） | 它自己 spawn 四路独立生成器并扫 30 卷，早就超过默认 |
| `vmu-wiring-index` | 180 s（默认） | **228.0 s** 本树／**225.1 s** 纯 `478b342a` worktree | ★ 两个读数几乎相同 ⇒ **这条超时与本批无关**（若是本批造成的，纯 HEAD 树应显著更快）；旧 180 s 在本批之前就不够 |

三条都按仓库既定规矩改预算（`tests/run-tests.mjs` 的 `TIMEOUT_OVERRIDES`，只动预算不动断言，2x 规则 + 注释写清实测时间与来源日期）：700 s／480 s／500 s。

★ 方法本身值得留档：**"这条超时是不是我造成的"有一个可复核的判据 —— 在纯 HEAD worktree 上量同一个套件，两次读数接近 ⇒ 与本批无关。** 这比我上一轮凭"忙"猜要硬。

### 19.3 复跑读数
- `audit-declaration-criterion` 89/0、`audit-planned-names` 14/0、`audit-scanner-selfproof` 4/0、`audit-assembly-reachability-snapshot` 16/0、`vmu-meeting-procedures-catalog` 46/0、`vmu-meeting-type-tools` 51/0、`vmu-meeting-types` 126/0、`vmu-verified-gates` 99/0、`audit-prompt-retired-mechanisms` 64/0。
- `regen-all --check` **16/16 in sync**；`check-docs` **DOC LINT: PASS**；`audit-doc-line-refs` 9/0。
- 全量 T1 待本轮收尾时安静重跑一次，目标 0 FAIL。

### 19.4 未变的事实（不许被这轮"绿灯"盖过去）
- 规则台账仍是 **49 条 = 32 ✅ / 17 ⚠️ / 0 ❌ / 0 待核**；17 条 ⚠️ 的名单在 §7。**"T1 绿"只证明没有回归，不证明规则全实现。**
- 真机端到端**仍未跑**。`D:\_tmp\slv-phase5\slv-p12-run.ps1` + `task-p12.txt` 已备好（任务文件开头就写明这是**模拟运行**、具名拒是验收产物、只能调 vmu 工具面）。

## §20 第五批：真机端到端跑通了（当前 dsh ＋ opencode-go），并交出 12 条实测不符项

本节记录**第一次在【当前 dsh 0.2.1-rc.2 ＋ opencode-go】上跑通完整 SLV** 的读数，以及该次运行对《v5r 运行规则》的逐条实测结论。运行之前，本阶段所有"真机实测"都还是欠账。

### §20.1 判据达成读数（机械读出，不是转述）

| 判据 | 读数 | 来源 |
|---|---|---|
| `cast:true` | **true**（`for:["member-2"], against:[], missing:[]`，reason「every enfranchised member judged the question solved」） | `full-1024-021750.jsonl`，6 份 turn 回执 |
| `slv-inspect` 0 RED | **1 session, 0 with RED checks** | 运行器第 7 步 |
| `NO_FENCE` | **0** | 同上第 6 步 |
| `FIELD_NOT_APPLICABLE` | **0** | 同上 |
| `BAD_JSON` | **0** | 同上 |
| `UNKNOWN_FIELD` | **2**，两处都是**任务文本里提到** `VMU_TURN_UNKNOWN_FIELD` 这个码名（`grep` 上下文为提示词原文），**不是**运行时拒绝 | 逐条抄上下文核对 |
| 规模 | 43 次工具调用、436 s、243 万 tokens（cap 600 万未触顶）、transcriptEvents 221 | `{"step":"done",...}` |

### §20.2 为什么之前一直 `NO_ADAPTER`（两个独立原因，各自都能单独致死）

1. **插件被当文件夹复制，缺自己的依赖闭包。** 服务端 stderr（`slvp12-ws/srv.err`）明写：`opencode-go (dsh-opencode-go): failed to import: ERR_MODULE_NOT_FOUND: Cannot find package 'opencode-go-pi-ai' imported from …/node_modules/dsh-opencode-go/lib/index.js`。插件里 `package.json` 的 `dependencies` 含 `opencode-go-pi-ai: npm:@earendil-works/pi-ai@0.87.1`，只 `Copy-Item` 主包不会带它。改为 `npm install --legacy-peer-deps dsh-opencode-go@0.1.21`（拉全闭包）。
2. **provider id 用错。** 插件注册的是 `PROVIDER_ID = "dsh-opencode-go"`（`lib/index.js:1119`，`:2267` `ctx.llm.registerAdapter([PROVIDER_ID], adapter)`）；`opencode-go` 只是**模型描述里的 SDK provider 字段**（`:1121` `SDK_PROVIDER_ID`）。模型行必须写 `provider: dsh-opencode-go`。

★ 诊断纪律（已写进运行器）：**先读服务端自己的 stderr，再读驱动的 jsonl**。驱动只会告诉你 `NO_ADAPTER`；"为什么没注册"只写在 stderr 里，而 stderr 之前被 PowerShell 的 `NativeCommandError` 吃掉大半。现在运行器在起服之后、跑驱动之前插了一道 **failed-import 闸**：stderr 一旦出现 `failed to import` 就直接 `exit 3`，不再烧掉 1900 s 的超时。

### §20.3 实测**达到**的部分（逐条对得上规则）

| 规则 | 实测证据 |
|---|---|
| 会议类型可设 | `vibe_v5_meeting {type:"debate"}` ⇒ `type:"debate"`、`procedure` 4 步骨架、`procedureBinding:"recommendation"` |
| 辩论会议额外对象字段 | `subject:"…state.json"` ＋ `subject_evidence:{file:{readable:true,bytes:4096}}` ⇒ `subjectGate.allowed:true` |
| 对象闸认**证据**不认自述 | 传自述"已证明"的卡 `r-1` ⇒ `VMU_PACK_V5R_DEBATE_SUBJECT_UNPROVEN`，message 点名"声明层是作者自述，不构成证明" |
| 缺对象具名拒 | `type:"debate"` 无 `subject` ⇒ `VMU_INVALID_ARGUMENT`「a debate meeting needs a subject」 |
| 预约/到点推进 | `at` ⇒ `state:"scheduled"`、`scheduledFor`、到点前动作被具名拒；到点后被触碰 ⇒ `state:"open"`、`activatedAt`、`startedLate:true` |
| 邀请＋到场＋发言分离 | `invite` ⇒ 入队 `order:["member-2"]`（note 明说"邀请不标到场、不影响 quorum"）；`attend` ⇒ `quorum.present:2/2`；未到场先发言 ⇒ `VMU_NOT_MEMBER`「speaker is not present」 |
| 最终裁决聚合＋通知 | 0.8/0.4 ⇒ `mode:"mean"`、`value:0.6`、`exact:0.6000000000000001`、`notified:["member-2"]`、`delivery:{via:"send-port",ok:true}`；持有者 `inbox` 见 `ml-1` 未读 |
| 只有主席签发裁决 | 非主席调用 ⇒ `VMU_NOT_PERMITTED`「only the meeting CHAIR signs the final ruling: the chair of m1 is "member-1", and you passed "member-2"」＋正确 hint |
| 结题票 ≥ 全体一致才 cast | 两名有权限者，一人投 true、一人未投 ⇒ `cast:false, missing:["member-2"]`；补投后 `cast:true` |
| 默认零汇报 | 未声明 `reports` ⇒ `vibe_vmu_report` 零汇报（符合"没声明就什么都不报"） |

### §20.4 实测**不符**的 12 条（本次运行的真正产出；每条都能指向回执字段）

| # | 不符项 | 证据（回执字段） | 性质 |
|---|---|---|---|
| R1 | 普通会议**也有** 3 步流程骨架（验收预期 `procedure:null`） | `m2`: `type:"ordinary"` ＋ 3 步「正常会议 · 推荐流程骨架」 | 实物 vs 验收预期不一致，需裁定 |
| R2 | `at` 的两种"合法"写法都不按预期：epoch 毫秒**字符串**被拒；不带时区偏移的 ISO 被按进程本地 +08:00 解析 ⇒ 落到过去、直接 `state:"open"` | `VMU_INVALID_ARGUMENT at is not a usable time: "1792779800000"`；`m3`: `state:"open", scheduledFor:null` | **缺陷** |
| R3 | "未到齐进等待"**不可达** ⇒ "超时自决"永不成立 | 三个会议的 quorum 块全为 `min:0, required:0, ratio:0, median:"met":true`；m4 到点后 `scheduled ⇒ open`，从未 `waiting` | **缺陷（机制无消费者）** |
| R4 | 到点推进**不是时间驱动，是触碰驱动** | 到点后 `status` 仍 `scheduled`（`waitStartedAt:null`），必须有一次动作才推进；`scheduleNote` 自述"没有定时器" | 已知设计，叙述需对齐 |
| R5 | `proceed` 的"只有主席"**不可观测**：状态闸先短路，主席/非主席拒绝**逐字相同** | 两条 `VMU_STATE` 完全相同；对照 `verdict_final` 的席位闸是 `VMU_NOT_PERMITTED` | **缺陷（权威闸被状态闸遮蔽）** |
| R6 | 结题票**有权限者不含院士**，与规则 m＝院士＋常驻冲突 | `closureVote.eligible:["member-2"]`，`chair` 永不在内；框架自述「the v5r pack grants it to `member` but NOT to `chair` or `temp`」 | **缺陷（pack 授权口径）** |
| R7 | "表决人数下限＝min(设置, 院士+常驻)"**任何回执都查不到** | `ballot` 只有 `eligible`；`tally` 只有 `{decisive:0, eligible:2}`；无 `min_votes`/`floor` | **缺陷（读数缺失）** |
| R8 | 最终裁决与票箱**脱耦**：票箱 `undecided`，裁决照签且 notice 是祈使句 | `tally: outcome:"undecided", decisive:0` vs `verdict_final: value:0.6, decided:false, enforceable:false` ＋「请把命题卡改为 0.6」 | **缺陷（语义被文案越过）** |
| R9 | "发言有预算"没有生效对象 | `speak`: `ms:0, turns:1, tokens:0, budget:null` | 机制在、默认关，需 pack 给预算或文档说明 |
| R10 | 成员提示词里两个状态块**始终是占位符** | `memberPrompt.text` 含 `〔未提供：setting:vmu.turn.instituteName〕`、`leaderId`、`〔未提供：roster〕`、`〔未提供：quorum〕`；"本轮你实际能调用的工具"段原文未替换 | ✅ **已修（§21）**：三类根因分别落在 `kernel/prompt/index.js`+`kernel/index.js`（声明默认值通道）、`kernel/turn/index.js`+`kernel/index.js`（`turnFacts` seam）、`packs/v5r/middleware/prompt-switches.js`（宿主专用段零注入）；门禁 `tests/vmu-prompt-live-facts.test.mjs` 13/0。⚠️ 真机复验待下一次活跑 |
| R11 | `step` 结算读数自相矛盾（`executed:0` 却完成结题计票） | `receipt:{executed:0, fields:["vote_solved"], turn:null}` ＋ 同一回执 `closureVote.cast:true` | 读数不清（`executed` 只数"字段动作"，`vote_solved` 走结题窗） |
| R12 | 诊断接缝溢出预算却不裁剪 | `vibe_vmu_status {detail:"quorum"}` ⇒ `originalBytes:223591`（上限 12000 的 18 倍），`note:"NOTHING was elided by us"` | **缺陷（只读诊断能塞 220 KB 进上下文）** |

### §20.5 下一批的处置计划（按"是否让规则变假"排序）

1. **R3/R5/R6/R7**（会议权威与表决口径）：给 pack 声明会议法定人数下限使其真正生效；`proceed` 把**席位闸放到状态闸之前**；结题票授权补上 `chair`；`ballot`/`tally` 回执补 `min_votes`/`floor` 读数。
2. **R10**（提示词占位符）：查 `deliverMode:"caller"` 下变量为何为空 —— 这是"设了值 ≠ 生效了"的又一例，且它让 `v5r-charter-voting` 的"以 m 为准"落空。
3. **R2/R8/R12**：`at` 接受数字字符串并拒绝无偏移 ISO（或明确写出解析时区）；裁决 notice 在 `decided:false` 时改成非祈使句；诊断面按同一预算裁剪并计数。
4. **R1/R9/R11**：R1 需裁定（普通会议要不要骨架）；R9 由 pack 给预算或文档说明；R11 让 `executed` 的语义在回执里自述。
5. 运行器侧（非 vmu）：把 `vmu.control.idleAfterMs`/`vmu.v5r.fixtureMode` 写进 `vmu.packs.activeOverrides`，消掉 4 次 `VMU_PACK_CONFLICT` 噪音（O4 的具名冲突提示本身是正确行为）。

### §20.6 诚实边界

- 这一次跑通的是**当前 dsh（0.2.1-rc.2）＋ 当前仓库 HEAD（`d08c5ab7`）＋ opencode-go**；出包方式是 `git archive HEAD` → `npm pack`，所以**工作树里未提交的东西没有进包**，读数只对 `d08c5ab7` 成立。
- `UNKNOWN_FIELD=2` 的两次命中都在**任务文本**里（码名被引用），不是运行时拒绝；若只看正则计数会误判成红线，必须逐条看上下文 —— 这与本阶段早先"提示词文本提到码名≠运行时错误"是同一类。
- 本次运行 43 次工具调用、243 万 tokens，**没有**覆盖规则全表（例如 Lean 作业、论文三阶段、断点续跑只做了单测级验证）；§20.4 的 12 条是"跑了这一遍看到的不符"，不是"规则全表已验完"。

---

## §21 R10 闭合：活跑实测到的“空洞”三类根因（一条也不靠猜）

§20.4 的 **R10** 记的是现象：接受态成员提示词里出现 `〔未提供：setting:vmu.turn.instituteName〕`、`〔未提供：setting:vmu.turn.leaderId〕`、`〔未提供：roster〕`、`〔未提供：quorum〕`，以及一段**自称“替换没有发生”**的 `# v5r-effective-tools-chair`。本节是根因与落点：三类，彼此独立，缺一条都还在坏。

### 21.1 根因一：`{{ setting:... }}` 无视**声明默认值**

- 真实行为（修前）：`kernel/prompt/index.js` 的 `renderVariables` 只查 `ctx.settings[k]`；而内核**故意**不把 schema 的 `def` 物化进 settings（契约写在 `kernel/settings-defaults.js`）。没配东西的部署 = 空表 ⇒ **每一个未配置槽位都渲染成“缺失”**，即使该键的默认值是“存在的”。
- 实测伤点：`vmu.turn.instituteName` 的 `def` 是 `'institute'`，被渲染成「未提供」；charter 里所有 `m = …` 句子与在册快照同理。
- 落点：`kernel/prompt/index.js` 新增可选 `settingFallback`（缺省 null ⇒ 旧行为逐字不变）；内核在 `kernel/index.js` 注入 `readSetting(settingsView, key)` —— 即“配置值否则声明值”的**唯一读者**，模板通道不再自开门。**三态**：配置值 > 声明默认值 > 真缺失（仍记 `variableMisses`，仍受 `vmu.prompts.missingVariable` 管辖，未知键照旧报缺失）。

### 21.2 根因二：`{{ roster }}` / `{{ quorum }}` 有合同、**无生产者**

- 合同：`packs/v5r/prompts/v5r-charter.js` 头注释逐字写明 `quorumM() -> {{ quorum }}`、`rosterLine(member) -> {{ roster }}`；`kernel/turn/index.js` 的 `open()` 也早就接受并转交这两个字段（`assemble({roster, quorum})`）。
- 缺口：`step()`/`drive()` **从没**传过它们 ⇒ 真回合里两个洞。这正是本阶段反复遇到的“声明了、也有读者、但调用链上没有生产者”。
- 落点：`kernel/turn/index.js` 新增 `turnFacts` seam（`createTurnOrchestrator({ turnFacts })`，在 `runOne` 里并入 spec）；`kernel/index.js` 注入实现：活动成员名册 + “合格人数按 `vmu.meetings.quorumCap` 封顶”（与会议座位的 m **同一条规则**，复用 `closureVoteOf` 的唯一闭包票计算）。
- 三条边界，都在门禁里：**未注入 ⇒ 槽位如实报缺失**（框架不编造部署事实）；**seam 抛错 ⇒ 具名拒 `VMU_ENGINE_UNAVAILABLE`**（半张名册比洞更危险）；**quorum 是数字、roster 是文本块**（charter 两种用法各自直接可用）。

### 21.3 根因三：宿主专用占位段被 turn 管线当成普通段注入

- `v5r-effective-tools-{chair,member,temp}` 的唯一生产者是**宿主**（`host.js` 在 `system-prompt/assemble` 上把真实清单覆盖进这三段）。turn 管线只装配、不替换 ⇒ 注入的正是那段「你读到了原文，说明替换没有发生」。
- 落点：段**仍然声明**（宿主才找得到替换目标），但 pack 的段策略新增 `HOST_ONLY_SECTIONS`（`packs/v5r/middleware/prompt-switches.js`），在**每次 turn 装配**里把三者全部关闭 ⇒ **零注入**，不是“disabled 说明”。
- 判别形状（写给下一个读者）：**一段若其唯一生产者不在本管线里，它的正确归宿是“声明但本管线不注入”，而不是“注入一段解释自己为什么没生效”的话。**

### 21.4 门禁与读数

| 门 | 读数 |
|---|---|
| 新增 `tests/vmu-prompt-live-facts.test.mjs` | **13 passed / 0 failed**（F1–F5 默认值通道含真内核；F6–F10 seam 三态；F11–F13 占位段零注入）|
| `vmu-turn` / `vmu-meeting-types` / `vmu-v5r-tools` / `vmu-kernel` / `vmu-pack-prompts` / `vmu-charter-contracts` / `vmu-meeting-verdict` | 191／126／339／260／24／22／37 全 0 failed |
| `regen-all` | `--write` ⇒ 16/16 written；再 `--check` ⇒ **16/16 in sync** |
| `check-docs` / `audit-vmu-docs` / `audit-doc-line-refs` | DOC LINT PASS／103 passed／9 passed |

### 21.5 诚实边界

- 本节证明的是**框架与 pack 的这一半**：默认值到文本、seam 到文本、turn 管线零占位段。**宿主对占位段的替换**（`host.js` 那条路径）不在本组断言内，它由宿主自己的套件守着 —— 所以 R10 的关闭是“三类根因已修 + 有门禁”，**不是“真机已复验”**；真机复验要等下一次完整活跑。
- R10 之外的 R1–R12 仍在 §20.4 待办里；本次只闭合 R10。
