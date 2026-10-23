# Lane: 会议家族（D1–D11、D14）— Phase 12 运行规则一致性

依据台账：`docs/acceptance/phase12-v5r-rules-conformance.md` §0 读法与状态词。
**本轮只写本文件**：不改源码、不改台账、不跑全量闸门；只跑单套件取门禁证据。
纪律：每条指到 `文件:行` 或命令输出；「提示词里写了」≠「机制存在」；「工具声明了参数」≠「参数被消费」。

## §0 本轮判定汇总

| ID | 规则要点（短） | 判定 | 门禁 |
|---|---|---|---|
| D1 | 只有院士能预约会议（可设预约时间；人未齐等待；超时院士自决） | **❌ 缺口** | 无（若存在"非院士召集被拒"断言则必红） |
| D2 | 院士召开/关闭/延长时长上界；院士主持 | **⚠️ 部分** | `tests/vmu-meeting-parity.test.mjs`（流/序/兜底） |
| D3 | 院士设标题/类型/内容事项/邀请成员/时长上界 | **⚠️ 部分** | 类型：无；议程必填：`vmu.meetings.materialsRequired` |
| D4 | 院士用命令自组织、决策会议中一切内容/控制/活动 | **⚠️ 部分** | `tests/vmu-meetings.test.mjs`（命令面） |
| D5 | 特殊类型会议框架给院士推荐流程骨架（采纳与否自定） | **❌ 缺口** | 无 |
| D6 | 一次性设置连续展开的多个会议 | **❌ 缺口** | 无 |
| D7 | 成员命令/工具按会议类型**和身份**有差异 | **⚠️ 部分**（身份✓ 类型✗） | `tests/vmu-meetings.test.mjs`（票权/席别） |
| D8 | 会议类型：正常/学术交流/辩论/结题/论文交流/规划… | **❌ 缺口** | 无 |
| D9 | 举手/邀请发言/批量按顺序发言/单次发言版群聊/权限区分 | **⚠️ 部分** | `tests/vmu-meeting-parity.test.mjs`（flow/order） |
| D10 | 投票板（选项＋最多/最少选几项）／任务板设置与认领交派／群聊管理 | **✅ 已实现**（见 §10 的保留项） | `vmu-ballotbox` 16/0、`vmu-chat` 79/0、`vmu-tasks` 42/0 |
| D11 | 辩论会额外字段：辩论对象或对象文件引用 | **❌ 缺口** | 无 |
| D14 | 辩论推荐流程：先各自单次发言给(概率,理由)→再轮流/举手/邀请→轮数院士定 | **❌ 缺口** | 无 |

命令与出口码（本轮实跑）：
- `node tests/vmu-meetings.test.mjs` → `195 passed, 0 failed`，exit 0
- `node tests/vmu-meeting-parity.test.mjs` → `206 passed, 0 failed`，exit 0
- `node tests/vmu-ballotbox.test.mjs` → `16 passed, 0 failed`，exit 0
- `node tests/vmu-chat.test.mjs` → `79 passed, 0 failed`，exit 0
- `node tests/vmu-tasks.test.mjs` → `42 passed, 0 failed`，exit 0

## §1 D1 只有院士能预约会议

判定：**❌ 缺口**。开会路径三条，**没有一条校验"只有院士"**。

| 路径 | 证据 | 后果 |
|---|---|---|
| pack 工具 `vibe_v5_meeting` | `packs/v5r/tools.js:495` 用 `requireSeat`（任意在册成员）；`:513` 调 `kernel.meetings.open({type:'ordinary', chair: member, …})` | 任意成员开、并把**自己**写成 chair |
| 内核工具面 `vibe_vmu_meeting {action:'open'}` | `tools/meeting.js:123-127` → `kernel.meeting(…)` + `meeting.convene(agenda)`；无 actor 参数 | 谁调谁开 |
| 服务 `kernel.meetings.open()` | `kernel/meetings.js:383-436`：参数无 actor；`chair` 只是被记录字段（`:417`） | 无权限判定 |

对照：同文件 **有** 主席闸但**没用在开会**上 —— `packs/v5r/tools.js:469-476 requireChairSeat` 只被 `:578 poll_open`、`:631 poll_close` 调用。

唯一的内置召集闸是"人数"而非"席位"：`kernel/meeting.js:39-45 defaultCanConvene`＝`roster.length >= 2`（注释明说"the pack decides the real rule"）；`kernel/index.js:2060-2065` 只在宿主显式传 `canConvene` 时才换掉它，而全仓 `canConvene` 的其它出现仅 `kernel/meeting.js:60`（默认参数）——**pack 没有覆盖**。

子句逐项：

- **可设预约时间**：无。`kernel/meetings.js` 搜 `schedul|series|nextMeeting|batch` 零命中；`settings/schema.js` 的 59 个 `vmu.meetings.*` 键里没有"预约时间"键；`open()` 立即生效（`openedAt`/`wallStartMs` = 调用时刻，`:432`）。
- **到点人未齐可进等待**：有"人未齐"的度量，**无"等待"状态**。法定数 `quorumMin/quorumRatio`（`meetings.js:257-268`，`:1144`）、出席模式 `attendanceMode`、迟到 `lateAfterMs`（`:453-463` 允许/记录/拒）、失法定数 `quorumLossPolicy: suspend|continue|recess`、复点 `quorumRecountMs`（`:498-505`、`:770-773`）。会议一旦 open 就 `state:'open'`，没有"已召集、等法定数到齐才开会"的状态。
- **超时未齐由院士自决**：兜底机制在（硬界 `hardLimitMs` `meetings.js:562-568`；`lapse`/`revokelapse` `kernel/meetinglapse.js:150-195`），但 **lapse 不校验调用者**（`meetinglapse.js:162-172` 只 `requireMeeting`，`by` 仅作记录字段）。

门禁：无专门断言。`node tests/vmu-meetings.test.mjs` 195/0 与 `node tests/vmu-meeting-parity.test.mjs` 206/0 均通过 —— 因为有"非院士召集必须被拒"的断言就会红。

## §2 D2 院士召开/关闭/延长时长上界；院士主持

判定：**⚠️ 部分**。

- **召开**：无 chair 闸（同 D1）。
- **关闭**：`kernel/meetings.js:1073-1136 close()` 签名 `{meeting, report, actions, at}` —— **没有 actor，也没有 chair 校验**；只受 `tier`（`:1080-1083`）、`confirmPreviousMinutes`（`:1090-1096`）、`committeeReportRequired`（`:1097-1102`）、`minutesActionsRequired`（`:1104-1110`）、`minutesRetentionMs`（`:1124-1129`）五条策略限制。⇒ 任意成员可关会。
- **延长"时长上界"**：**不存在会议级延长**。`hardLimitMs` 是唯一墙钟硬界（`schema.js:153`，钳制 `[300000, 7200000]`，文档明写"不存在无界"），`wallStartMs` 只在开会时写一次（`meetings.js:432`），关闭时只读算 `wallMs`（`:1115`）——**全程无改写点**。唯一的 `extend` 是**单人发言**延长：`kernel/meetinglapse.js:197-217`（读 `speechExtendMs/speechExtendMax/speechMaxMs`，按人计 `extensions`），工具面 `tools/meeting.js:233-235` 也只路由 `live().extend({member, ms})`。软预算侧有 `budgetWallMs` + `budgetOnExceed: refuse|warn|extend`（`kernel/meetingmarker.js:178-183`），那是"超预算动作"，不是"延长上界"。
- **主持**：chair 专属**真的存在但只覆盖地面/发言序** —— `kernel/meetingmarker.js:411-424`（`call_on` 只有主席可放人，且无主席注册时具名拒）、`:430`（`flow`/`overrideOrder` 的授权轨：具名 actor → 本会主席 → 声明）。speak/queue/vote/close 不要求 chair。
- 门禁：`tests/vmu-meeting-parity.test.mjs` 覆盖 F28 兜底与 B③/B④ 流/序（本轮 206/0）。

## §3 D3 院士设标题/类型/内容事项/邀请成员/时长上界

判定：**⚠️ 部分**（标题+事项 ✓；**类型 ✗、邀请成员 ✗**；时长只有全局上界）。

- **标题/内容事项** ✓：`agenda` 为必填（`packs/v5r/tools.js:494`）→ `materials`（`:513`）；服务侧 `materialsRequired` 闸（`meetings.js:404-407`）具名拒；primitive 侧还有结构化议程项（`kernel/meeting.js:139-149`：每项 `{id,text,owner,timebox,state}`，可 `agendaclose`）。
- **类型** ✗：`packs/v5r/tools.js:513` **硬编码 `type:'ordinary'`**。模型给的 `kind` 只在 pack 侧白名单（`:497-501`，`sync|division|verify-request|solve-vote`）校验后**仅回显**（`:514-516`），`open(...)` 调用里**没传 kind** ⇒ 不进内核状态。内核侧 `open({type})` 有目录校验（`meetings.js:389-395`）但目录默认空（`schema.js:1340` `def: []`）、pack 也未声明（全仓 `typeCatalog` 只出现在 `settings/schema.js`、`kernel/*`、`docs/`）。
- **邀请成员** ✗：`packs/v5r/tools.js:496` `roster = 全体 live 成员`，模型**无法指定子集**；`vibe_v5_meeting` 参数表（`:1098`）没有成员清单参数。另：`:1098` 声明的 `target` 参数在函数体（`:493-517`）**从未被读取** —— 又一个"声明≠消费"。
- **时长上界** ⚠️：全局 `vmu.meetings.hardLimitMs`（`schema.js:153`）＋ 委员会规模 `committeeMax`（`meetings.js:400-403`）；**没有逐会可设的时长参数**。

## §4 D4 院士用命令自组织、决策会议内一切内容/控制/活动

判定：**⚠️ 部分**（能力面很全，**权限面不覆盖**）。

- 命令面：`tools/meeting.js:26` 的 `action` enum 共 41 个：`list open speak silent hand hands refuse invite invitedspeak end agendaclose agendaitems leaverequest leaveapprove leaverequests aggregation complete phase status summary snapshot close extend lapse revokelapse ballot vote tally reopen freeze unfreeze boxopen boxcast boxclose boxreopen boxlapse boxrevokelapse second withdraw flow overrideorder`。
- 服务面另有：`kernel/meetings.js` 的 `open(:383) speak(:497) interrupt(:580) queue(:605) motion(:621) second(:690) vote(:729) recess(:825) close(:1058) quorum(:1140)`，以及纪律/主持转移 `warn/expel/quote/fileAppeal/transferChair/confirmMinutes`（`:846-990` 段）。
- 决策面：动议/附议/表决（`:621/:690/:729`）、逐会票箱（`kernel/ballotbox.js`）、决议案（`kernel/minutes.js` 的 `resolve/resolutions/supersede`）。
- 但"由院士"只有三处：`flow`/`overrideOrder`（`meetingmarker.js:430`）、`call_on` 的 `queueGate`（`:411-424`）、poll_open/poll_close（`tools.js:578/:631`）。**close/speak/queue/motion/vote/tally/freeze 都不校验 actor**。

## §5 D5 特殊类型会议下框架给院士推荐流程骨架

判定：**❌ 缺口**。

- 类型恒为 `ordinary`（见 D3）⇒ **没有"特殊类型"这个输入**，谈不上按类型给骨架。
- `settings/schema.js` 的 `vmu.meetings.*` 键里**没有任何**"流程骨架/推荐流程/类型流程"键（59 键全列在 `schema.js:145-157, 1090-1101, 1307-1343`）。
- 唯一的"辩论流程"文本是语料库样例 `packs/v5r/prompts/v5r-prompts.js:80-82`（`verify-debate#1..#3`），全仓其它位置对 `verify-debate` **零引用** ⇒ 运行时不注入。
- 会议期提示词只按"发言者状态"分三支：`packs/v5r/middleware/prompt-switches.js:37-39`（`first`/`invited`/`others`），**不按会议类型**。
- 门禁：无。

## §6 D6 一次性设置连续展开的多个会议

判定：**❌ 缺口**。

- 无会议序列/预约机制：`kernel/meetings.js` 搜 `series|schedul|nextMeeting|batch` **零命中**；`open()` 无"下一场"字段；`settings/schema.js` 无相应键；`tools/meeting.js` 无 `series/schedule` action。
- 只有"同时多场存活"的并发上限 `vmu.meetings.liveCap`（`meetings.js:396-399`）——**并发上限 ≠ 一次设置、依次展开**。
- 门禁：无。

## §7 D7 成员命令/工具按会议类型和身份有差异

判定：**⚠️ 部分**（**身份差异是真的，类型差异不存在**）。

身份差异（有机制、有具名拒）：
- 票权按声明席位：`meetings.js:743` 具名拒"列席/受邀/临时工无票权，授权也不能转移票权"；`eligibleSeats` 默认空＝零策略（`schema.js:1101`）；pack 侧 `requireVoter`（`packs/v5r/tools.js:478-486`）。
- 主席专属动作：`requireChairSeat`（`:469-476`）→ `:578`/`:631`；`meetingmarker.js:411-430`。
- 受邀发言**只记纪要、不计票、不阻塞收束**：`kernel/meeting.js:104-109` 注释 + `invited` 表；工具面 `invite`/`invitedspeak`（`tools/meeting.js:159-160`）。
- 迟到/请假：`lateAfterMs`（`meetings.js:453-463`）、`leaverequest`/`leaveapprove`（`tools/meeting.js:226-232`，批准人由 `vmu.meetings.leaveApprover` 声明，`schema.js:1100`）。

类型差异（无）：全仓唯一读 `m.type` 的行为是 `meetings.js:1099`（`type==='committee'` 时关闭必须带报告），而 pack 永远开 `ordinary`（`tools.js:513`）⇒ 实际不可达。

## §8 D8 会议类型目录（正常/学术交流/辩论/结题/论文交流/规划…）

判定：**❌ 缺口**。

- 字段与校验都在：`open({type, kind})`（`meetings.js:383`）＋ `typeCatalog` 白名单（`:389-395`，含 `enforced` 标记）。
- 但：目录默认空（`schema.js:1340` `def: []` ⇒ "传什么都放行"）；pack **未声明任何目录**；pack 侧**硬编码 `ordinary`**（`tools.js:513`）且 `kind` 不进内核。⇒ 事实上只有一种类型。
- 用户要的 6 类（正常/学术交流/辩论/结题/论文交流/规划）**没有一处载体**：既无目录值，也无按类型分派的行为。
- 易混：现存的 `vmu.meetings.tier`（`formal|light`，`schema.js:1090`；判定点 `meetings.js:388`、`:1080-1083` 的 `truthWriteRefusal`）是**会议级别**，不是"会议类型"，不能替代本条。
- `docs/24-v5r-containment.md:53,396` 声称"简流程 resolution 被拒后出口是 `formal_agenda:true`"，但 `formal_agenda` 只被回显（`packs/v5r/tools.js:515` `formalAgenda: args.formal_agenda === true`），**全仓无消费点** —— 该出口是**假出口**（文档与代码不一致，列为待修）。

## §9 D9 举手/邀请发言/批量按顺序/单次发言版群聊/权限区分

判定：**⚠️ 部分**。

- **举手** ✓：primitive `handUp`（`tools/meeting.js:157` `action:'hand'`）＋服务地面 `flow:'hands'`（`meetingmarker.js:322`，`FLOW_ORDER` `:328` hands→fifo）。
- **邀请发言** ⚠️：`invite`/`invitedspeak` 在 primitive 面（`tools/meeting.js:159-160`），**服务面（`kernel.meetings`）没有 invite/invitedspeak**。而 pack 开的正是服务会议（`packs/v5r/tools.js:513`）⇒ 真机上 `invite` 会落到 `tools/meeting.js:61-81` 的注册表提示（"该动作只寻址 primitive 注册表"）而失败。**能力在、面不通**。
- **批量按顺序发言** ⚠️：**没有"一次给一串成员+顺序"的 API**。有的是模式与单人操作：`flow` 四模式（`open|hands|round_robin|call_on`，`meetingmarker.js:322`）、`overrideOrder` 四模式（`fifo|round-robin|chair|random`，`:301`）、`queue` 单人入队（`meetings.js:605`，`:614` `orderFor` 出有序表）。主席要放 N 人得调 N 次 `queue`（`call_on` 下每次都要过 `queueGate`）。
- **单次发言版群聊** ⚠️：会议侧无"每人限一次"的闸；最接近的是群聊配额 `vmu.chat.speakQuota`/`speakQuotaWindowMs`（`schema.js:981-982`，0＝不限；超限具名拒 `VMU_CHAT_QUOTA_EXCEEDED`）。它是**群聊配额**，不是"辩论第一轮的单次发言回合"。
- **权限区分（部分仅主持）** ✓：poll_open/poll_close 主席专属（`packs/v5r/tools.js:578/:631`）、flow/overrideOrder 主席专属＋必给理由（`meetingmarker.js:430`、`:469-508`）、举手队列管理 `hands`（`tools/meeting.js:221-224`，`op: grant|revoke|clear|list`）。

## §10 D10 投票板／任务板／群聊管理

判定：**✅ 已实现**（三面都有机制＋各自套件门禁）。保留项见末尾"⚠️"。

- **投票板（选项＋最多/最少选几项）** ✓：逐票箱规则 `kernel/ballotbox.js:167-200` 读 `rules.{minVotes,allowRevote,maxChoices,minChoices,mode}`，`mode:'single'` ⇒ `maxChoices=1`（`:200`）；选票计数闸 `:271-281`（`VMU_BALLOT_CHOICE_COUNT`：少于 `minChoices`／多于 `maxChoices` 具名拒并给可用选项）；`question`＋`options.length>=2` 校验 `:211-212`；pack 面 `vibe_v5_poll_open` 参数 `mode/max/min/min_votes`（`packs/v5r/tools.js:1114-1117`），并**真的**用 `requireChairSeat`（`:578`）。
- **任务板** ✓：`kernel/tasks.js:28-35` 五态 `open|assigned|doing|done|cancelled` ＋ 迁移表（`open→assigned|doing|cancelled` 等）；`create/assign/transition/set_dependencies`（`tools/task.js:12-13`，`:32-33`）。**交派**= `assign`（`tasks.js:285-300`，记录 `transitions`）；**认领**＝ `transition{to:'doing'}`（`tasks.js:32` 允许 `open→doing`；`:371` 开工查依赖）——语义等价但**没有独立 `claim` 动词**（工具面 action 表无 `claim`）。
- **群聊管理** ✓：`vmu.chat.admins`（`schema.js:980`，未列者管理动作具名拒 `VMU_CHAT_NOT_ADMIN`）、`speakQuota`/`speakQuotaWindowMs`（`:981-982`）、`muteDefaultMs`（`:983`）、`freezeExemptAdmins`（`:984`）、`historyCap`（`:985`）；实现 `kernel/chat.js`（`send/list/policy/mute/unmute/setQuota/grantAdmin/revokeAdmin/maySpeak/status`）。
- 门禁：`vmu-ballotbox` 16/0、`vmu-chat` 79/0、`vmu-tasks` 42/0（exit 0，本轮实跑）。

## §11 D11 辩论会额外字段：辩论对象 / 对象文件引用

判定：**❌ 缺口**。

- 没有"辩论类型"（D8）⇒ 没有类型专属字段。泛化指针 `materials`（`meetings.js:383`；`materialsRequired` 门 `:404-407`）与 `motion({materials})`（`:621`）**能装**"文件引用"，但**不绑定"辩论对象"语义**：无字段名、无类型闸、无"该指针必须指向命题卡/Lean 文件"的校验。
- `packs/v5r/tools.js:1098` 声明了 `target` 参数（本可承载"辩论对象"），但 `:493-517` 函数体**从未读取** ⇒ 声明≠消费。
- 语料里确有 `对象：p-lemma-a（类型：命题）` 的字样（`packs/v5r/prompts/v5r-prompts.js:80-82`），是**示例文本**，不注入、不解析。

## §12 D14 辩论推荐流程

判定：**❌ 缺口**。

- 无"辩论"阶段机：既无 `phase`（会议级 `phase` 只有 primitive 的回合阶段 `tools/meeting.js:169`），也无"先独立给(概率,理由) → 再展开 → 轮数由院士定"的流程对象。
- 零件不全：`flow` 只决定**谁先说话**（`meetingmarker.js:322`）；`vote`（`meetings.js:729`）是表决；`vmu.meetings.verdictMaxRounds`（`schema.js:152`，默认 3）是"同一对象复算轮次上限"，**不是辩论轮数**。
- 唯一相关文本：`packs/v5r/prompts/v5r-prompts.js:80-82`（`verify-debate` 三例）——语料，不注入（见 D5）。
- 门禁：无。

## §13 跨条共性发现（供 lead 归并）

1. **两套会议注册表**：primitive `kernel/meeting.js`（有 `hand/invite/invitedspeak/end/agendaItems`）与服务 `kernel/meetings.js`（有 motion/vote/close/resolutions）。pack 的 `vibe_v5_meeting` 只开**服务**会议（`packs/v5r/tools.js:513`），于是 D9 的邀请面在真机上**不通**；工具面已具名提示（`tools/meeting.js:61-81`），但功能仍缺。
2. **权限风格不一致**：同一个 pack 文件里，`poll_open/poll_close` 有主席闸（`:469/:578/:631`），而 `vibe_v5_meeting` 没有（`:495/:513`）。
3. **类型轴缺失**：`type` 恒 `ordinary`＋`typeCatalog` 空；`tier`(formal/light) 是另一轴，不能替代 D8 的 6 类。
4. **"假出口"**：`docs/24-v5r-containment.md:396` 让院士用 `formal_agenda:true` 转正式会议，但该参数全仓只被回显（`packs/v5r/tools.js:515`），无消费点。
5. **声明≠消费**（工具面）：`vibe_v5_meeting` 的 `target` 参数（`packs/v5r/tools.js:1098`）无读取点。

## §14 本轮未核（如实标注，不算通过）

- D1 的"院士自决"在**真机**上的实际路径（是否由所办/宿主代为 lapse）——需真机跑，本轮只读代码。
- D2 关闭是否应由主席发起：代码允许任何人关；这是"设计意图 vs 实现"的判断，需 lead 定口径。
- D10 任务板"认领"是否要求 lead 认"`transition{to:'doing'}` 即认领"的口径。
- 其余 lane（A/B/C/E/F 及各 GAP-MTG 剩余项）不在本文件范围。
