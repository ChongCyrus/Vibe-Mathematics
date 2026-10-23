# Lane rows-B — phase 12 台账「待核」第二批（A1 / A4 / B2–B5 / B7 / B9 / B10 / B11a / B11b）

> 填写人：`v5r-reader-b`　轮次：phase 12 第 2 轮（只读深查）　日期：2026-10-23
> 任务来源：Lead 派发 —— 台账 `docs/acceptance/phase12-v5r-rules-conformance.md` 中标的 11 条待核（Lead 写作 11 条：A1、A4、B2、B3、B4、B5、B7、B9、B10、B11；因 B11 规则本身分成员侧/院士侧两半，本文件拆成 B11a / B11b 两行 = 11 行结论）。
> 纪律：**只读代码**；唯一改动是本文件。所有行号是 **2026-10-23 16:40–17:00 工作树的快照**（`packs/v5r/tools.js`、`packs/v5r/prompts/**` 正被并行改写，引用的行号可能漂移，函数名/字面量稳定）。

## §0 判定口径（沿用台账与 lane-bgroup，不另立口径）

- **✅ 已实现**＝机制（哪个函数/轨道/工具）＋ 消费者（从插件入口可达的装配里谁真读它/拦它）＋ 门禁（机器能失败的断言）三级全中。
- **⚠️ 部分**＝机制在但只有一半的面（例如写侧有、读侧无；或声明有、消费者 0）。
- **❌ 缺口**＝规则要求的机制**不存在**（"只是一段提示词"或"只是一个路径约定"本身算缺口，不是待核）。
- 判定纪律（台账 §0 原文）：**「提示词里写了」不等于「机制存在」**；**「工具声明了参数」不等于「参数被消费」**。
- 与 `docs/acceptance/conformance/lane-bgroup.md`（`vmu-verify` R16）的关系：该文件已对 B1–B11 判过一轮（具备 7 / 部分 2 / 缺失 2）。本文件对重叠条目**复核并补它没查的面**（尤其是 A1/A4 不在它范围内、B3 的门禁行号、B4/B5 的读面死角、B10 的"能跑不能跑"）；不一致处显式标「与 lane-bgroup 不一致」。

---

## A1 所办＝主代理（用户助手 / 有进展自动唤起汇报 / 用户与所的媒介 / 自然语言设参数控制进程）

**1. 规则原意**：所办是"所"对用户的那张脸：它是用户的助手；所里有进展时它被自动唤起去汇报；用户与研究所之间的消息由它传递；用户可以用自然语言让它改设置、启停进程。

**2. 机制（分四个动作）**

| 动作 | 真实机制 | 位置 |
|---|---|---|
| 自动汇报（触发/聚合/投递） | 内核 primitive `createReport({clock,log,settings,deliver,audit,describeSetting,feedback})`：读 `vmu.report.*`，按 `period`/`event`/`threshold` 三类触发，聚合正文后调 `deliver()`；无 transport ⇒ **具名拒** `VMU_REPORT_NO_TRANSPORT`（`report.js:44`），参数越权 ⇒ `VMU_REPORT_PARAM_NOT_ALLOWED`（`:55`） | `vibe-math-vmu/kernel/report.js:100`（工厂）、`:113-126`（读 enabled/params/whoMayChange）、`:372`（真投递）、`:364-372`（无 transport 分支）、`:567-569`（whoMayChange 闸） |
| 自动汇报的**策略**（pack 侧，已声明且 enabled） | 三条 report：①`period everyMs=900000 → ['office'] channel 'digest'` ②`event 'meeting-closed' → office/'inbox'` ③`threshold metric 'artifacts' gte 5 → office/'inbox'`；`vmu.report.enabled:true`、`vmu.report.params` 八个键、`vmu.report.whoMayChange:['office']` | `vibe-math-vmu/packs/v5r/prompts/v5r-core.js:150-195` |
| 「有进展时**自动唤起**」的那一拍 | 入口在 report 面被 published 时把 `kernel.report.tick({event:'turn-end', metrics:kernel.metricValues()})` 挂到 `agent/turn-stopping`（turn 结束即评估），异常吞掉不破 turn | `vibe-math-vmu/vibe-math-vmu.js:767-790`（`attachReportTick`）、`:1095`/`:1147`（装完后重挂，F5） |
| 设参数 / 控制进程（自然语言 → 工具调用） | `vibe_v5_configure`（institute/problem/params）、`vibe_v5_set`（key/value/why）**只写声明过的键**：`applyDeclaredSetting` 对未知键 ⇒ `VMU_INVALID_ARGUMENT`、`hot:'H3'` ⇒ `VMU_NOT_PERMITTED`、`by` 取 `def.who`（routing），回执带 `hot/who/appliedBy/effective/receipt`；启停＝`vibe_v5_start`（`researcherCount` 默认 3、域 0..50）/`vibe_v5_stop`/`vibe_v5_pause`/`vibe_v5_resume` | `packs/v5r/tools.js:1152-1175`（`applyDeclaredSetting`）、`:1176-1195`（configure）、`:1198-1205`（set）、`:1026-1055`（start）、stop/pause/resume 同批 handler |
| 传信（用户↔所） | 出：`vibe_v5_message` 以 `'office'` 身份 `kernel.mailbox.send('office', payload)`（`kit/handlers.js:246`）；入：成员→所办**只有** report/digest 一条路（需 transport），mailbox 没有 `'office'` 收件人 | `kit/handlers.js:224-247`；`kernel/mailbox.js` 收件人集合里无 office |

**3. 消费者**：report 的消费者是**部署注入的 transport**（`config.deliver`）：`vibe-math-vmu.js:559` `deliver: typeof config.deliver === 'function' ? config.deliver : null`，不注入时 `status().seams.deliver=false`、报告只落 trace 且被 `VMU_REPORT_NO_TRANSPORT` 具名拒（`report.js:364-372`）。设参/控制的消费者是**根代理（用户侧那张会话）**：`v5r-core.js` 的"所办"不是名册席位（`slots` 只有 `chair/member/temp`，`packs/v5r/prompts/v5r-core.js:214-218`），它由用户的 root agent 承担，root face 不受 `toolFaces` 收窄 ⇒ 这些工具真能调到。成员→所办方向**无消费者**（mailbox 无 office 收件人）。

**4. 门禁**：有 —— `tests/vmu-assistant-report.test.mjs`、`tests/vmu-reportfeedback-delivery.test.mjs`（`vmu.report` 的配置→回执→投递链）、`tests/b1prime-feedback-gate.test.mjs`（delivery 真的到达，防"329 绿但没投递"回归）；设参面在 `tests/vmu-v5r-tools.test.mjs` 有声明键正例 + 未知键/H3 反例。

**5. 建议状态**：**⚠️ 部分**。理由：自动汇报的 primitive+策略+tick 是真的、有门禁；但**"自动唤起"依赖部署注入 `deliver`**，仓内默认 null（真机走不完闭环），且传信是单向的（所→成员），"用户与所的媒介"只实现了半条；"所办"也没有额外面（用 root agent 代替）。

**6. 一击致命实验**（5 行，只读/便宜）：不注入 `config.deliver` 起 entry，把 report 的 `period` 设为 1ms、跑一次 turn-stopping ⇒ 断言 `kernel.status().seams.deliver===false` 且 trace 里是 `VMU_REPORT_NO_TRANSPORT`。若这条成立，"自动汇报"在真机上就是"记了个账但没人收到"。

---

## A4 临时工（无表决权 / 默认不参会 / 可雇佣可解雇）

**1. 规则原意**：院士或常驻研究员可以雇临时工干特殊/临时任务；临时工没有表决权；默认不进会议；可以被雇、也可以被解雇。

**2. 机制**

| 要求 | 机制 | 位置 |
|---|---|---|
| 雇佣 | `vibe_v5_hire` → `members.hire({id, slot:'temp'})` ＋ `tasks.create({owner})` 记初始任务；`purpose`/`initial_task`/`to` 三个必填缺一即 `VMU_INVALID_ARGUMENT` | `packs/v5r/tools.js:160-175` |
| 解雇 | `vibe_v5_fire` → `members.end(id, reason)` ＋ 该成员未完成任务 `tasks.transition(..., 'cancelled')`，回执带 `ended/cancelledTasks` | `packs/v5r/tools.js:308-329` |
| **无表决权** | ①会议投票：`vote()` 里 `vmu.meetings.eligibleSeats` 非空时不在册 ⇒ `VMU_NOT_PERMITTED`（消息里点名 `declared voter seats are chair / member`）；②法定人数分母：`quorum roster` 与 eligibleSeats 求交（注释 `:350` 明写 temp 不在册）；③席位权限：`temp` 席位只声明 `speak`（`packs/v5r/prompts/v5r-core.js:217`），闭会票权限 `vmu.turn.closureVotePermission:'vote'` 走 `members.may()` | `kernel/meetings.js:921-930`（投票门）、`:132`（读键）、`:356-363`（分母求交）、`kernel/members.js:219-223`（`may`）、`kernel/index.js:2549-2552`（闭会票权限） |
| **默认不参会** | **没有机器门**：`attend()` 只校验"是本实例成员"＋非 recess（`kernel/meetings.js:614-650`），临时工在册就能 attend；"默认不参加"靠流程约定（院士 `invite` 才入会）＋ `meetings.js` 注释里"临时工无票"的提示，不是拒绝路径 | `kernel/meetings.js:614-650` |
| 上限 | `vmu.members.maxTempPerMember`（schema def 3，`settings/schema.js:1112`）的真正消费者是 **`kernel/recruit.js` 的 `accept()`**（试用期成员按接纳人计），不是 `vibe_v5_hire` 走的 `members.hire` | `kernel/recruit.js:62,66,189-206` |

**3. 消费者**：`vibe_v5_hire`/`vibe_v5_fire` 是 41 面里的活工具（`packs/v5r/tools.js` 的 `V5R_PACK_TOOLS`）；无表决权由会议面在每次 `vote()`/`quorumOf()` 真读 `vmu.meetings.eligibleSeats` ⇒ 有消费者；「默认不参会」无消费者（没有读这个概念的代码）。

**4. 门禁**：有 —— `tests/vmu-meetings.test.mjs:766-767`（temp 投票 ⇒ `VMU_NOT_PERMITTED` + `/declared voter seats/` + `/temp/`）、`:795-802`（**不声明席位时 temp 能投票** ⇒ 证明是声明决定而非硬编码，且回执 `enforced` 含 `vmu.meetings.eligibleSeats`）、`tests/vmu-v5r-tools.test.mjs:365`（`vibe_v5_poll_vote` 由 temp 发起 ⇒ 具名拒）、`:1120`（temp 有记录权≠表决权）。**「默认不参会」无门禁**（没有断言"temp 不在 roster/不能 attend"）。

**5. 建议状态**：**⚠️ 部分**。三条半中"无表决权""可雇可解雇"是 ✅（机制+消费者+门禁），"默认不参会"是 ❌（无机制，只有流程约定）。
> **与台账措辞不一致（提示 Lead 更正）**：台账 A4 写"**无表决权/不入会由 `vmu.meetings.eligibleSeats` 表达**"。复核结果：`eligibleSeats` 只表达**投票权**（`vote()` 门 + quorum 分母），**不表达"入会"**（`attend()` 不读它，也没人校验邀请名单）。建议把"默认不参会"改成"无机器门（流程约定）"。

**6. 一击致命实验**：hire 一个 temp，然后**不邀请**它，直接 `kernel.meetings.attend({meeting, member: tempId})` ⇒ 若 `ok:true` 且 `present` 增长，则"默认不参会"没有机制（预期：确会成功）。

---

## B2 公共蓝图（路径约定 + 按时更新 + 共同设计 + 最终编辑权归院士）

**1. 规则原意**：所里有一份公共的"总技术路线设计/策划"，院士与常驻研究员一起写、按时更新，最后拍板/定稿的人是院士。

**2. 机制**：**只有声明，没有机制**。`vmu.turn.protocolPath`（`settings/schema.js:212`，type string，def `Shared/Protocol.md`，`who:'office'`）＋ pack 默认值（`packs/v5r/settings/defaults.json:12`）；全仓 `protocolPath` 的消费者只有**两处提示词插值**（`packs/v5r/prompts/v5r-blocks-b.js:236`、`:584`，都是叫成员"按需读这个路径"）。没有任何代码读这个路径、没有创建/更新/校验、没有"谁可写"的闸（`packs/v5r/middleware/` 五个文件里没有任何针对 `Shared/` 或写文件的规则）。

**3. 消费者**：**无消费者**（只有提示词文字）。写"蓝图"实际靠成员用基座 `write` 工具写文件——那是**通用文件面**，不是"公共蓝图"机制：没有归属、没有更新契约、没有编辑权。

**4. 门禁**：无。

**5. 建议状态**：**❌ 缺口**。路径约定不是机制；"最终编辑权归院士"零落点。（与 lane-bgroup 判定一致：`lane-bgroup.md:31,115` 同判缺失 + 零消费者。）

**6. 一击致命实验**：以 `member` 席位身份用基座 `write` 覆盖 `Shared/Protocol.md` ⇒ 没有任何拒绝（预期：写成功）。若真要做到"编辑权归院士"，闸必须在内核（写文件的 owner 校验）或 pack 的 `tools/pre-execute` 规则里，而不是提示词。

---

## B3 各自 progress

**1. 规则原意**：每个成员各自维护自己的研究进展记录（按成员分账，不是全所一本流水账）。

**2. 机制**：`vibe_v5_record_progress`（`packs/v5r/tools.js:1415` spec）→ `kit/handlers.js:96-135` 的 `toolRecordProgress`：写 `records.put({track:'progress', kind:'progress', settled:true, by:<成员>})`，`track` 参数必须落在声明轨里（`kit/handlers.js:102`），正文经一个序列化器（回执带 `receiptMeta`）。轨声明：`packs/v5r/settings/defaults.json:19`（`progress`）＋ `v5r-core.js:221`（VALUE 层五轨）＋ 提示行 `v5r-core.js:571`。另有**自动写**：turn 循环把每轮 JSON 答复里的 `progress` 字段按 `FIELD_OWNERS` 落档（`kernel/turn/index.js:50-60` 附近，`progress → {face:'vmu.records', op:'put'}`）。"各自"由记录的 `by`/`owner` 字段承担。

**3. 消费者**：`vibe_v5_read_library`（读任何人：`member` 过滤 + 轨清单含 `progress`，`kit/handlers.js:256-283`，轨集合在 `:264`）；通用面 `vibe_vmu_records` 的 list/expand 也能看（`host.js:800-856`）。

**4. 门禁**：有 —— `tests/vmu-v5r-tools.test.mjs:122-131`（`record_progress` 真的落在 `progress` 轨、走唯一序列化器、轨计数 +1）。**缺口**：没有断言"r-1 的 progress 与 r-2 的互不覆盖"（机制上按记录分条，无覆盖风险，但"各自"没有专门断言）。

**5. 建议状态**：**✅ 已实现**（台账原为待核，本轮升级）。理由：写侧工具+轨声明+提示行+自动写，读侧有"读任何人"的面，门禁卡在存在性与落点；"各自"由每条记录的 owner 承担，不需第二条机制。

**6. 一击致命实验**：r-1 写两条 progress，r-2 写一条，`vibe_v5_read_library({member:'r-1'})` ⇒ 若返回 3 条则作者过滤是假的（预期：2 条）。

---

## B4 已尝试路线 / 方法及进度

**1. 规则原意**：把"试过哪些路线/方法、进展如何"留档，便于复盘与避免重复劳动。

**2. 机制**：同一条写工具的两个轨——`record_progress` 的 `track:'routes'`（`kit/handlers.js:96-135`，轨声明 `defaults.json:19`、提示行 `v5r-core.js:571`/`:625` 明写"track 可选 progress/routes/obstacles/rejected/state"）；方法走 `vibe_v5_record_method`（`packs/v5r/tools.js:1427`）→ `kit/tools.js:22` 的 `methods` 轨卡片（必填 content/value/motive/p）。

**3. 消费者（这是本行的裂缝）**：
- `methods`：**有**——`vibe_v5_read_library` 的轨清单包含 `methods`（`kit/handlers.js:264`）。
- `routes`：**没有专用读面**——同一行 `:264` 的轨集合是硬编码 `['propositions','methods','problems','progress']`，**不含 routes**；`vibe_vmu_records` 的 list 也没有 `track` 参数（参数只有 `action/id/limit/kind/statement/proof`，`vibe-math-vmu/host.js:805-812`），而它的 hint 却写"先按 track 收窄"（`:836`）——**hint 指向一个不存在的参数**（内核 `records.list({track})` 支持，`kernel/records.js:582`，但面没暴露）。所以 routes 卡片只能靠 list 的**全轨头部**被看见，或已知 id 时 expand。

**4. 门禁**：`methods` 有（`tests/vmu-v5r-tools.test.mjs` record_method 组）；`routes` **无读侧门禁**。

**5. 建议状态**：**⚠️ 部分**（与 lane-bgroup 判"部分"一致，本行补它没写清的死角：不是"读侧缺"这么笼统，而是 `read_library` 硬编码四轨 + records 面没有 track 参数 + hint 假）。

**6. 一击致命实验**：写一条 `track:'routes'` 卡片，然后只用 `vibe_v5_read_library({})` 去读 ⇒ 读不到（预期）。再传 `track` 给 `vibe_vmu_records` ⇒ 参数不存在（预期被忽略或拒）。

---

## B5 遇障路线/方法/障碍及原因归档

**1. 规则原意**：走不通的路线、方法、遇到的障碍以及**原因**要归档（负面知识要留档）。

**2. 机制**：写侧两条轨——`obstacles`（障碍）与 `rejected`（被否证的路线，提示行 `v5r-core.js:571` 明写"证伪的路走 rejected，阻塞走 obstacles"）；都经 `record_progress` 的 `track` 参数落档，轨声明 `packs/v5r/settings/defaults.json:19`。"原因"由卡片正文（`content`）承载；是否 `settled` 由 handler 决定（`kit/handlers.js:118` 附近）。

**3. 消费者**：**没有专用读面**——`vibe_v5_read_library` 的四轨集合不含 `obstacles`/`rejected`（`kit/handlers.js:264`）；`vibe_vmu_records` 同样没有 track 参数（`host.js:805-812`）。⇒ 归档确实耐久落盘（records 内核 + 指纹 + head 列表），但**按轨检索的路被堵住**，只有全轨头部与按 id expand 两条缝。

**4. 门禁**：写侧有（同 B3 的轨计数/回执断言族）；读侧无。

**5. 建议状态**：**⚠️ 部分**（lane-bgroup 同判"部分"）。归档机制存在、检索面缺，属"写侧中、读侧缺"。

**6. 一击致命实验**：写 `track:'rejected'` 一条，再 `vibe_v5_read_library({kind:'rejected'})` ⇒ 返回空（预期），因为轨不在硬编码清单里而 `kind` 只做二次过滤（`kit/handlers.js:276`）。

---

## B7 方法库（一般化/推广/抽象出工具、理论框架）

**1. 规则原意**：所里积累"方法"——把具体解法一般化/推广成工具、理论框架，形成可复用的方法库。

**2. 机制**：`vibe_v5_record_method`（spec `packs/v5r/tools.js:1427`）→ `kit/tools.js:22` 的 `KIT_CARD_CONFIG`（track `methods`、kind `method`、必填 `content/value/motive/p`），经 `kit/handlers.js` 的卡片写入器落 `records`；轨声明 `defaults.json:19`、VALUE 层 `v5r-core.js:221`、提示行 `v5r-core.js:571` 同族。

**3. 消费者**：`vibe_v5_read_library`（`methods` 在轨清单里，`kit/handlers.js:264`）＋ `vibe_vmu_records` 的 list/expand。

**4. 门禁**：有 —— `tests/vmu-v5r-tools.test.mjs` 的 record_method 组（必填缺项具名拒、落在 methods 轨）；`tests/vmu-verified-track.test.mjs` 之外另有 `audit-declaration-criterion` 覆盖卡面形状。

**5. 建议状态**：**✅ 已实现**（台账待核 → 升级；lane-bgroup 同判"具备"）。

**6. 一击致命实验**：`vibe_v5_read_library({kind:'method'})` 应能读到刚写的卡；若读不到则读面断（预期能读到）。

---

## B9 分派后各自负责部分的论文

**1. 规则原意**：任务分派后，各成员负责自己的部分，最终**合作成文**；论文由所里统一装配（不是各写各的散文件）。

**2. 机制（真流程，不是提示词）**：`packs/v5r/paper.js`（政策壳：九节 `PAPER_SECTIONS` `:29-39`、节→字段映射 `:85-88`、`editorDefault:'academician'` `:88`、`finalizerSlot:'chair'` `:89`、所办问询角色 `PAPER_CONSULT_ROLES` `:65`）→ `kit/paper.js` 的 `createPaperFlow`：`start({participants})`（`:346`）、`recordPart`（每人一份，指纹校验，`:372`）、`advance` 进入互审并生成**环形互审** `reviewOf[i]=participants[(i+1)%n]`（`:416-424`）、`recordReview` 要求 `deliverable` 是真布尔（`:399-412`，未表态即 `VMU_INVALID_ARGUMENT`）、全员 true 才进 `awaiting-editor` 否则退回轮次（上限 `PAPER_MAX_ROUNDS=3`，`:427-435`）、`recordFinal` 只有 `state.editor===editorDefault`（chair/院士）能定稿（`:461`）。系统合并＝`PaperMd` 从各成员 parts 重组九节（`:526` 起，按 id+指纹读取，阴止替稿）。工具面 `vibe_v5_paper`（`packs/v5r/tools.js:1667`）动作含 `start|part|review|advance|final|render|status|compile|sections|consult|consult_state`——**含 E4 的所办答复面**（`tools.js:505-540` 的注释如实说明"这个面曾是机制有消费者 0 的缺陷，已补"）。

**3. 消费者**：chair（定稿/推进）与 participants（part/review）都是名册成员，走同一个 `vibe_v5_paper` 面；论文落 `Paper/` 前缀、track `paper`。

**4. 门禁**：有 —— `tests/vmu-v5r-tools.test.mjs` 论文组（重复 start ⇒ `VMU_PACK_V5R_CORE_PAPER_STATE`；writing 阶段 review ⇒ 同码；非参与成员 recordPart ⇒ `VMU_NO_SUCH_OBJECT`；`deliverable` 非布尔 ⇒ `VMU_INVALID_ARGUMENT`；一票 false ⇒ 退回 round 2；全 true ⇒ `awaiting-editor`；非 chair 定稿 ⇒ `VMU_NOT_PERMITTED`；文件被背后改动 ⇒ `FINGERPRINT_MISMATCH`）＋ `tests/vmu-paper*.test.mjs` 系列（含所办问询超时/答复）。

**5. 建议状态**：**✅ 已实现**（台账待核 → 升级；lane-bgroup 同判"具备"）。理由：机制（kit 流程）、消费者（chair+participants 的真工具）、门禁（正/反成对，且断言到"这是不是真流程"的骨头）三级全中。

**6. 一击致命实验**：非 chair 成员调 `vibe_v5_paper({action:'final'})` ⇒ 必须 `VMU_NOT_PERMITTED`；若成功则编辑权声明是假的。

---

## B10 脚本文件

**1. 规则原意**：所里可以留脚本文件（研究用的计算/实验脚本），作为可复核的产物。

**2. 机制**：
- **写**：代码/脚本文件靠**基座文件面**（`write`/`edit`/`read`/`pwsh` 等，见 `vibe-math-vmu/host.js` 的 `TOOL_NAMES` 与真机 26 面清单），v5r 的 41+21 个工具里**没有专门的脚本面**。
- **跑**：`vibe_vmu_script`（基座 M3 面，`host.js:862-900`：`action=list|run`，只对**部署声明**的 `config.scripts` 生效），v5r pack **一条脚本都没声明**；同时 pack 有一条真规则把**临时跑脚本**拒掉：`v5r-core-no-adhoc-scripts`（`packs/v5r/prompts/v5r-core.js:224-241`，`when:{tool:['vibe_vmu_script']}` ⇒ `deny.code='VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS'`，hint"请走归档/复算流程"）。

**3. 消费者**：规则消费者＝`tools/pre-execute` 中间件（真门禁，`tests/vmu-entry.test.mjs:392` 断言 `scriptDecision.refused.code` 就是该码）；脚本面的消费者＝部署（`config.scripts`），v5r 不提供 ⇒ 本 pack 内**脚本是"能写、不能临时跑、无声明式归档面"**。规则 hint 里的"归档/复算流程"在本 pack 内**不存在**（没有归档脚本的轨/工具；成员只能用 `write` + 记卡）。

**4. 门禁**：有（拒绝临跑的规则被测试钉住）——但钉的是"禁止"，不是"脚本可归档可复核"。

**5. 建议状态**：**⚠️ 部分**（与 lane-bgroup 判"具备"**不一致**：它按"基座 write 面在真机发布清单里"判具备；本行按规则语义"脚本文件是所里的产物、可复核"判部分——文件能写，但"脚本"这一类没有声明/归档/复算机制，且临时执行被规则禁止）。
> 请 Lead 裁决口径：若 B10 只要求"成员能产出脚本文件"，则 ✅；若要求"脚本作为所级产物可归档复核"，则 ⚠️。

**6. 一击致命实验**：成员跑 `vibe_vmu_script({action:'run', id:'x'})` ⇒ 必被 `VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS` 拒（预期）；成员用 `write` 写 `Scripts/a.py` ⇒ 成功且无任何登记（预期）——两条合起来就是"写得了、跑不了、没归档"。

---

## B11a 自反馈库（成员侧）

**1. 规则原意**：成员把工作中遇到的问题、冗余、障碍、可优化点与自己的方案记进一个反馈库（方法论层，不是研究结论）。

**2. 机制**：`vibe_v5_feedback`（`packs/v5r/tools.js:404-440` handler，spec `:1529`）三种 op：`add`（必填 `category/route/phenomenon/impact/action`，`FEEDBACK_ADD_REQUIRED` `:402`；`interpersonal` 路由额外必填 `assessment` `:422-425`）、`update`（回填 `status/outcome/note` 闭环）、`list`（未闭环条目）；落轨 `feedback`（`defaults.json:19`），`records.put({track:'feedback', kind:'feedback', settled:false, by:...})`（`:432`）与 `settled: status==='closed'`（`:439`）。提示行 `packs/v5r/prompts/v5r-blocks-b.js:89-108`（三条路由：self/team 无需审批、interpersonal 需缜密评估+事后回填）。

**3. 消费者**：`op:'list'`（写者/任何人调工具即读）真读 records 轨；**但** `vibe_v5_read_library` 的四轨清单**不含 feedback**（`kit/handlers.js:264`），`vibe_vmu_records` 也无 track 参数 ⇒ **他人无法通过"读库面"浏览反馈库**，只能调 `vibe_v5_feedback op:list`（返回全所未闭环项，`tools.js:414-417`）。

**4. 门禁**：有 —— `tests/b1prime-feedback-gate.test.mjs`（C ONFIG→RECEIPT→DELIVERY 链真到达）；另有 `tests/b1prime-reportfeedback-shape-pin.test.mjs` 钉形状。

**5. 建议状态**：**⚠️ 部分**。机制（写/改/列/路由校验/闭环）齐全且有门禁；但"库"作为可检索物在通用读面上不可见（read_library 硬编码四轨），且**提示词自带一处假承诺**：`v5r-blocks-b.js:105` 写"未闭环条目会出现在汇报与总览的计数里"，而 `vibe_v5_report`（`tools.js:177-193`）与 `vibe_v5_overview`（`tools.js:196-215`）的 counts 里**都没有 feedback**（只有 roster/live/tasks/openTasks/openMeetings）。lane-bgroup `:40` 已点出该假承诺，本轮复核为**真**（行号更新为 `:105` / `tools.js:177-193,196-215`）。

**6. 一击致命实验**：`vibe_v5_feedback({op:'add', ...})` 写一条未闭环，再调 `vibe_v5_report` ⇒ counts 里没有 feedback 字段（预期）⇒ 假承诺成立。

---

## B11b 自反馈库（院士侧：对各阶段流程与组织协作的优化）

**1. 规则原意**：除成员侧外，**院士另有一类自反馈**：针对"各阶段（平时/会议/辩论）的流程与组织协作"做优化建议——即它是**按阶段、面向流程**的形状，不只是普通条目。

**2. 机制**：**不存在**。`packs/v5r` 全目录对 `复盘|阶段自|流程优化|组织协作` **0 命中**（本轮复核：`grep -rEn` 无输出）；`vibe_v5_feedback` 的 `category` 是自由字符串、没有枚举/阶段维度，也没有"院士专属"的校验或读面（toolOverview 只看名册/任务/会议）。理论上院士能用同一个 `vibe_v5_feedback` 写一条 category="阶段流程" 的自由文本——但那是**自由文本能力**，不是规则要求的"形状"。

**3. 消费者**：无（没有读"阶段流程反馈"的面、没有按阶段聚合的逻辑）。

**4. 门禁**：无。

**5. 建议状态**：**❌ 缺口**（lane-bgroup 同判"院士侧缺失"）。缺的是"阶段维度 + 院士专属形状"；建议实现位置：pack 侧新增一个 `vibe_v5_stage_feedback`（category 枚举 `平时/会议/辩论` × `流程/组织协作`，写 `feedback` 轨并带 `stage` 字段），内核不需要新能力（records 已够）。

**6. 一击致命实验**：`grep -rEn "复盘|阶段自|流程优化|组织协作" packs/v5r/` ⇒ 空（已实测空）。

---

## §1 建议状态汇总

| 行 | 建议状态 | 一句话理由 | 与台账/其他 lane 的关系 |
|---|---|---|---|
| A1 | ⚠️ 部分 | report primitive+策略+tick 有门禁，但 transport 是部署缝（仓内默认 null）、传信单向、所办非席位 | 台账只列了 notices/configure/set，漏了 report 机制；本行补齐 |
| A4 | ⚠️ 部分 | 无表决权/可雇可解雇 ✅（有门禁）；"默认不参会" ❌ 无机制 | **推翻台账措辞**：`eligibleSeats` 只表达投票权，不表达"入会" |
| B2 | ❌ 缺口 | `protocolPath` 只有两处提示词引用，无消费者、无编辑权闸 | 与 lane-bgroup 一致 |
| B3 | ✅ 已实现 | 写工具+轨+自动写+读任何人+门禁（存在性） | 台账待核 → 升级 |
| B4 | ⚠️ 部分 | `methods` 全链 ✅，`routes` 写有读无；records 面 hint 指向不存在的 track 参数 | 与 lane-bgroup 同判，补死角证据 |
| B5 | ⚠️ 部分 | `obstacles`/`rejected` 归档耐久，但无按轨读面 | 与 lane-bgroup 同判 |
| B7 | ✅ 已实现 | 卡面+methods 轨+read_library+门禁 | 台账待核 → 升级 |
| B9 | ✅ 已实现 | kit 真流程（互审/轮次/编辑权）+ 真工具 + 正反门禁 | 台账待核 → 升级 |
| B10 | ⚠️ 部分 | 能写脚本文件、临时执行被真规则禁；但无声明/归档/复算面 | **与 lane-bgroup 不一致**（它判具备），请 Lead 裁决口径 |
| B11a | ⚠️ 部分 | add/update/list+路由校验+门禁；但通用读面看不到、且 `:105` 假承诺 | 复核 lane-bgroup 的假承诺为真 |
| B11b | ❌ 缺口 | 阶段维度/院士形状零命中，无读面无门禁 | 与 lane-bgroup 一致 |

**推翻/更正台账的条目**：A4（"入会由 eligibleSeats 表达"不成立）；B3/B7/B9（待核 → ✅）。
**与其它 lane 不一致的条目**：B10（lane-bgroup 判具备，本行判部分，理由见该节）。

## §2 未判定（证据不足，不凑结论）

1. **A1 的"自动唤起"真机效果**：仓内只能证明 tick + 报告 + `deliver` 缝存在；`deliver` 的实现在部署里（DSH 侧），仓内无法判定"用户真的被唤起"。缺：部署侧 `config.deliver` 的实装证据。
2. **A4 的 `vmu.members.maxTempPerMember` 是否应管 v5r 雇工路径**：它的消费者是 `kernel/recruit.js` 的 `accept()`，而 `vibe_v5_hire` 走 `members.hire`；两条路径的意图（谁是权威）仓内没有文字裁定。缺：设计裁定。
3. **B10 的"脚本归档/复算流程"是否在别处存在**（例如 host 的 script-bridge 或 docs/06）：本轮只读 pack 与工具面，未穷举宿主侧文档；缺口若被证伪，B10 可升为 ✅。
4. **B11a 的反馈库是否有其它读面**（human face / grant 面 / 报告 digest）：未逐一核。

---

## §3 B11b（院士侧阶段自反馈）最小设计 —— 只设计，不实现

**结论（3–5 行）**：机制长在 **pack 侧**，不新造第二套反馈：在 `packs/v5r/tools.js` 增加一个**只对 chair 席开放**的薄工具 `vibe_v5_stage_feedback`，写同一条 `feedback` 轨（`defaults.json:19`），只多两个**必填维度**——`stage: 平时|会议|辩论` 与 `domain: 流程|组织协作`，`category` 固定为 `阶段自反馈`（其余字段复用现有 `phenomenon/impact/action/assessment/outcome`）；读面复用 `vibe_v5_feedback {op:'list'}` 并加 `stage` 过滤，不动 `read_library` 的四轨硬编码（另一条 lane 的缺口，不在这里顺手改）。**写者**：只有 `chair` 席（用现有 `requireChairSeat`-同族的席位判定，具名拒 `VMU_NOT_PERMITTED` 并点名席位）；**读者**：全所（`op:'list'`），院士自己额外能按 `stage` 聚合。**门禁**：`tests/vmu-*` 新增一组正/反——非 chair 写 ⇒ 具名拒且零写入；`stage`/`domain` 不在枚举 ⇒ 具名拒并列合法值；`stage` 缺失 ⇒ 拒（不许自由文本绕过阶段维度）；`op:'list'` 按 stage 过滤后条数与写入一致（正反各一条）。**复用声明**：`feedback` 轨/`records` 内核零改动 ⇒ 不需要新能力、不需要新 error code（沿用 `VMU_INVALID_ARGUMENT`/`VMU_NOT_PERMITTED`）。
**落点建议**：`packs/v5r/tools.js`（新工具 + `V5R_PACK_TOOLS` 一项 + 提示行 `prompts/v5r-blocks-b.js` 的 feedback 段补一句"院士另记阶段流程自反馈"）；`settings/defaults.json` 无需改（轨已声明）；门禁测试新增一组。
**若决定不做**（也可接受的理由）：规则集不强制"院士专属形状"，院士本就能用 `vibe_v5_feedback` 的自由 `category` 写下阶段流程的观察——此时应把台账 B11 院士侧从"缺口"降级为"非目标"，并在 `lane-bgroup.md`/本文件的判定口径里写明"这一半不要求机制"，否则"缺口"会长期挂账而无验收物。

## §4 本批附加：把「假承诺/假 hint」变成断言（`tests/vmu-doc-claims-vs-code.test.mjs`）

新建 `tests/vmu-doc-claims-vs-code.test.mjs`：三条 claim 各查两面 —— ①`CLAIM-PRESENT`（那句话确实在文件里）②`CLAIM-HONOURED`（它声称的机制在源码里可证）。**当前实测：12 条断言 9 过 3 红（EXIT=1）**，三条 honoured 全红：
- `records-face-track-hint`：`vibe-math-vmu/host.js` 的 hint「或先按 track 收窄」 vs `vibe_vmu_records` 的 `parameters` 无 `track`、`run()` 未解构 `track`（内核 `kernel/records.js:582` 的 `list({track})` 本来支持）。
- `feedback-in-report-counts`：`packs/v5r/prompts/v5r-blocks-b.js:105`「未闭环条目会出现在汇报与总览的计数里」 vs `toolReport` 的 `counts` 键=[roster, live, tasks, openTasks, openMeetings]、`toolOverview` 返回体也没有 feedback。
- `script-archive-recompute-flow`：`packs/v5r/prompts/v5r-core.js:235`「请走归档/复算流程」 vs 43 个 pack 工具无 script/recompute 名、`tracks` 无脚本轨、manifest 未声明 `scripts`。
`node tests/vmu-doc-claims-vs-code.test.mjs --prove-live` **6/6 绿（EXIT=0）**：在内存里把文本删掉 ⇒ PRESENT 转红、把机制加上 ⇒ HONOURED 转绿，逐条证明断言不是空过（**没有改动任何源码**，源码只读 + 内存变更；写锁不允许我碰 `host.js`/`packs/**`）。**红是结论，不是事故**：三条都由文本/机制的所有者决定往哪边改，本套件不许靠改措辞变绿。
