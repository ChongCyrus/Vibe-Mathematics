# Lane: 会议家族（D1–D11、D14）— Phase 12 运行规则一致性

依据台账：`docs/acceptance/phase12-v5r-rules-conformance.md` §0 读法与状态词。
**本轮只写本文件**：不改源码、不改台账、不跑全量闸门；只跑单套件取门禁证据。
纪律：每条指到 `文件:行` 或命令输出；「提示词里写了」≠「机制存在」；「工具声明了参数」≠「参数被消费」；
**「声明了键」≠「键被消费」**——本轮专列「无消费者参数」一族（§13.4）。

## §0.1 复核快照（本轮全部事实以此为准）

- HEAD：`5afd40ae`（`feat(phase12): … meeting TYPE and debate SUBJECT …`，17 文件 +1086/−20）。
- **工作树正在被并发修改（不是我）**，`git status --short`：`M kernel/index.js`、`M kernel/meetings.js`、`M packs/v5r/settings/defaults.json`、`M packs/v5r/tools.js`、`M settings/schema.js`、`M tools/meeting.js`、`M docs/acceptance/conformance/lane-claims-paper.md`、`?? docs/acceptance/conformance/lane-members.md`；`git diff --stat` = 7 文件 +458/−93。
- mtime：`kernel/meetings.js` `13:49:37`、`packs/v5r/settings/defaults.json` `13:51:38`（快照时刻 `2026-10-23T13:52:04+08:00`）。
- ⇒ 每条分两栏：**已提交（HEAD）** 与 **工作树未提交（正在落）**。标「未提交」的条目**没有测试、随时会变，不给 ✅ 结论**。
- 命令与出口码（本轮实跑）：
  - `node tests/vmu-meeting-types.test.mjs` → **exit 1（红）**：前 22 条断言通过后抛 `VMU_NOT_PERMITTED`，抛点 `tests/vmu-meeting-types.test.mjs:121` 的 `kernel.meetings.open({ type:'debate', chair:'r-acad', roster, materials, subject })` —— **新闸 `vmu.meetings.conveneRequiresChair` 已在 pack 里声明 true，而该测试没给 `actor`**。HEAD 上此套件是 46/0，当前红是**声明跑在测试前面**，不是能力错。修法见 §2 残留②。
  - `node tests/vmu-meetings.test.mjs` → `VMU MEETINGS: 195 passed, 0 failed`，exit 0。

## §0.2 判定汇总

| ID | 规则要点（短） | 判定 | 依据状态 | 门禁 |
|---|---|---|---|---|
| D1 | 只有院士能预约会议（可设预约时间；人未齐等待；超时院士自决） | **❌ 缺口**（内核承载已落，席位闸/预约/等待态仍缺） | 半提交：内核闸未提交 + pack 声明未提交 | 无 |
| D2 | 院士召开/关闭/延长时长上界；院士主持 | **⚠️ 部分 → 已落未提交** | 工作树未提交，**无测试** | 待补测试 |
| D3 | 院士设标题/类型/内容事项/邀请成员/时长上界 | **⚠️ 部分**（类型✓ subject✓；邀请成员✗；逐会时长上界✗） | 已提交 + 未提交 | `vmu-meeting-types`（当前红） |
| D4 | 院士用命令自组织、决策会议中一切内容/控制/活动 | **⚠️ 部分**（有 5 处具名闸，其余动作不校验 actor） | 已提交 + 未提交 | `vmu-meetings` 195/0 |
| D5 | 特殊类型会议框架给院士推荐流程骨架（采纳与否自定） | **✅ 已实现**（`binding:'recommendation'`；未实现步骤进 `pendingSteps`） | 已提交 `5afd40ae` | `vmu-meeting-types` §2 |
| D6 | 一次性设置连续展开的多个会议 | **❌ 缺口** | — | 无 |
| D7 | 成员命令/工具按会议类型**和身份**有差异 | **⚠️ 部分**（身份✓；类型差异仍无） | 已提交 | `vmu-meetings` |
| D8 | 会议类型：正常/学术交流/辩论/结题/论文交流/规划… | **✅ 已实现**（目录六值 + 内核白名单真绑） | 已提交 `5afd40ae` | `vmu-meeting-types` §1–§3 |
| D9 | 举手/邀请发言/批量按顺序发言/单次发言版群聊/权限区分 | **⚠️ 部分**（邀请面真机 100% 被拒；批量无数组入参） | 已提交 | `vmu-meeting-parity` 206/0 |
| D10 | 投票板／任务板设置与认领交派／群聊管理 | **✅ 已实现**（保留项见 §10） | 已提交 | `vmu-ballotbox` 16/0、`vmu-chat` 79/0、`vmu-tasks` 42/0 |
| D11 | 辩论会额外字段：辩论对象或对象文件引用 | **✅ 已实现**（`subject`，辩论缺对象具名拒；三读面回读） | 已提交 `5afd40ae` | `vmu-meeting-types` §3 |
| D14 | 辩论推荐流程（先各自单次发言给概率+理由→轮流/举手/邀请→轮数院士定） | **⚠️ 部分**（骨架四步✓；第①步无执行体、第④步聚合未实现） | 已提交 `5afd40ae` | `vmu-meeting-types` §2 |

## §1 D1 只有院士能预约会议

判定：**❌ 缺口**。内核承载已落（未提交），但"只有院士"这条策略仍不成立；预约、等待两个子句仍无机制。

**已提交（HEAD）时的三条开会路径都没有席位闸**：pack `vibe_v5_meeting` 用 `requireSeat`（任意在册成员，`packs/v5r/tools.js:495`）→ `kernel.meetings.open({type,chair:member,…})`；内核工具面 `{action:'open'}`（`tools/meeting.js:123-127`）无 actor；服务 `open()` 无 actor、chair 只是记录字段。

**工作树正在落的部分（未提交）**：
- 新键 `vmu.meetings.conveneRequiresChair`（`settings/schema.js:1318`，`def:false`＝零机制）；消费者 `kernel/meetings.js:422-434`：`actor` 为空 ⇒ `VMU_NOT_PERMITTED`「convening needs the chair to name itself」；`actor != chair` ⇒ 拒绝「替别人开会正是这条闸拒绝的事」；两路都 `mark(enforced)` 该键。
- `open()` 形参新增 `actor`、会议记 `openedBy`、回执带 `openedBy`（`kernel/meetings.js:469`、`:489`）。
- pack 声明 `true`（`packs/v5r/settings/defaults.json:33`）并在开会时传 `chair: member, actor: member`（`packs/v5r/tools.js:539`）⇒ **匿名开会 / 代他人开会**已成机器事实。

**残留（要修）**：
1. **「只有院士」仍不成立**：pack 仍调 `requireSeat`（`:495`），而同文件已有 `requireChairSeat`（`:473-481`，投票用它）。于是任意成员调用即"自己当主席、actor==chair"，闸必然放行。**修法在 pack，一行**：改用 `requireChairSeat(..., 'meeting')`；机制侧不需要再改内核。
2. **可设预约时间**：无。`kernel/meetings.js` 搜 `schedul|series|nextMeeting|batch` 零命中；`settings/schema.js` 的 `vmu.meetings.*` 无预约键；`open()` 立即生效（`openedAt`/`wallStartMs`＝调用时刻，`:469`）。
3. **人未齐等待态**：有度量无状态。法定数 `quorumMin/quorumRatio`、`attendanceMode`、迟到 `lateAfterMs`、失法定数 `quorumLossPolicy: suspend|continue|recess`、复点 `quorumRecountMs` 都在；但 `open()` 直接把会推到 `state:'open'`，没有"已召集、等法定数到齐才开会"。
4. **超时由院士自决**：兜底在（`hardLimitMs`；`kernel/meetinglapse.js:150-195` `lapse`/`revokeLapse`），但 `:172` 仍不校验调用者（`by` 仅记录）。

门禁：无。`vmu-meetings` 195/0 恰好证明**没有**"非院士召集必须被拒"的断言。

## §2 D2 院士召开/关闭/延长时长上界；院士主持

判定：**工作树已落三条闸，但按纪律不给 ✅** —— 该批改动**没有一行测试**，且当场让 `vmu-meeting-types` 变红（§0.1）。

- **关闭只能由主席**（未提交）：`vmu.meetings.closeRequiresChair`（`settings/schema.js:1314`，`def:false`）→ `kernel/meetings.js:1119-1128`：会议无 chair ⇒ `VMU_ENGINE_UNAVAILABLE`（"内核从不发明权限"）；`actor` 缺/不等主席 ⇒ `VMU_NOT_PERMITTED` 并指名主席是谁；键进 `enforced`。pack 声明 `true`（`defaults.json:32`）；工具面把 `actor` 透传（`tools/meeting.js` 的 close 分支：`svc.close({ meeting, actor })`）。
- **会议级延长 + 天花板**（未提交）：`kernel/meetings.js:1212-1250` 新 `extend({meeting, ms, actor, why})`——`extendRequiresChair`（`schema.js:1324`，`def:true`）要求主席且必须给步长；越过 `extendCeilingMs`（`schema.js:1323`，`def:14400000`，钳 `[300000, 86400000]`）具名拒（`mark(enforced,'vmu.meetings.extendCeilingMs')`）。`open()` 冻结 `wallLimitMs = hardLimitMs`（`:469`），`wallLimitOf(m)`（`:201`）读会议自己的界；超限提示（`:609`）明写"延长受 `extendCeilingMs` 上限约束，硬界没有关掉开关"。
- **两个 `extend` 不是一件事**（这点做对了）：`tools/meeting.js` 新 `action:'extendlimit'` = 会议墙钟上界；`action:'extend'` = **单人发言**延长（`kernel/meetinglapse.js:197-218`，读 `speechExtendMs/Max/MaxMs`）。面侧对原语会议调 `extendlimit` 会具名拒并指路。
- **主持**：chair 专属现在 5 处且都具名——`call_on` 的 `queueGate`（`kernel/meetingmarker.js:411-424`）、`flow`/`overrideorder`（`:430`，具名 actor→本会主席→声明）、poll_open/poll_close（`packs/v5r/tools.js:578/:631`）、close、extend（后两者未提交）。
- **残留**：①整批改动无测试 ⇒ 需补：`open` 需 actor、`close` 需主席、`extend` 需主席+步长、越 `extendCeilingMs` 具名拒、`wallLimitMs` 冻结后 `speak` 按会议自己的界判。②`tests/vmu-meeting-types.test.mjs:121` 及全文件其它直接 `meetings.open(` 调用要补 `actor`（否则永久红）。③`lapse`/`revokeLapse`（`meetinglapse.js:162-195`）仍不校验调用者。

## §3 D3 院士设标题/类型/内容事项/邀请成员/时长上界

判定：**⚠️ 部分**。`5afd40ae` 补了**类型**与**辩论对象**；**邀请成员**与**逐会时长上界**仍缺。

- 标题/内容事项 ✓：`agenda` 必填（`packs/v5r/tools.js:494`）→ `materials`；内核 `materialsRequired` 闸（`kernel/meetings.js:404-412`）。
- **类型 ✓（本轮新）**：`packs/v5r/tools.js:504` `meetingTypeOf(...)`；未知类型具名拒并列合法值（`:505-508`）；`const type = typeInfo.type`（`:509`）；`open({ type, … })`（`:539`）。内核侧 `vmu.meetings.typeCatalog` 白名单（`kernel/meetings.js:394-400`，未声明值 ⇒ `VMU_NO_SUCH_OBJECT` + 列合法值），pack 在 `defaults.json:43-50` 声明六值 ⇒ **白名单真绑上**（测试 §1 第 7 条「零机制：五个机构类型 id 未硬编码进内核」通过）。
- **邀请成员 ✗**：`roster = 全体 live 成员`（`packs/v5r/tools.js:499`），模型无法指定子集，也没有排除参数（临时工因此默认在册，与台账 A4 的"temp 不在册"不符）。
- **时长上界 ⚠️**：会议级 `extendCeilingMs` 是"延长后总上界"的天花板（未提交，见 §2），但**开会时不能逐会指定**；仍是全局 `hardLimitMs`（`settings/schema.js:153`）+ 委员会规模 `committeeMax`（`meetings.js:400-403`）。

## §4 D4 院士用命令自组织、决策会议内一切内容/控制/活动

判定：**⚠️ 部分**。

- 命令面 42 个 action（`tools/meeting.js:26` enum，本轮新增 `extendlimit`）：`list open speak silent hand hands refuse invite invitedspeak end agendaclose agendaitems leaverequest leaveapprove leaverequests aggregation complete phase status summary snapshot close extend extendlimit lapse revokelapse ballot vote tally reopen freeze unfreeze boxopen boxcast boxclose boxreopen boxlapse boxrevokelapse second withdraw flow overrideorder`。
- 服务面另有 `warn/expel/quote/fileAppeal/transferChair/confirmMinutes`（`kernel/meetings.js:846-990` 段）。
- 决策面齐：动议/附议/表决（`meetings.js:621/690/729`）、逐会票箱（`kernel/ballotbox.js`）、决议案（`kernel/minutes.js: resolve/resolutions/supersede`）。
- **"由院士"只有 5 处**：`flow`/`overrideorder`、`call_on` 的 `queueGate`、poll_open/poll_close、close（未提交）、extend（未提交）。`speak/queue/motion/vote/tally/freeze` 仍不校验 actor —— 要不要逐动作加闸需 lead 定口径（内核已有三键的样式可直接复制）。

## §5 D5 特殊类型会议下框架给院士推荐流程骨架

判定：**✅ 已实现**（`5afd40ae`）。骨架存在、按类型给、且**机器可读地标为推荐**。

- `packs/v5r/meeting-procedures.js`：`MEETING_TYPES`（ordinary/academic/debate/closure/paper/planning，**只有 debate 的 `subjectRequired`**）、`DEBATE_PROCEDURE`（四步）、`MEETING_PROCEDURE_GAPS`（`verdict-aggregation`、`min-voters`，均 `not-implemented`）、`meetingTypeOf()`、`procedureFor()`；`binding:'recommendation'`。
- 回执带 `procedure/procedureBinding/procedureNote/pendingSteps`（`packs/v5r/tools.js:542-545`）；未实现步骤进 `pendingSteps` 而不是假装实现。
- 非辩论类型不发明骨架并说明原因（测试 §2「五个其它类型报告无骨架且各说原因」通过）。
- 骨架**不接线到任何闸**（这正是规则要的"采纳与否自定"）。

## §6 D6 一次性设置连续展开的多个会议

判定：**❌ 缺口**。无会议序列/预约：`kernel/meetings.js` 搜 `series|schedul|nextMeeting|batch` 零命中；`open()` 无"下一场"字段；无对应设置键；`tools/meeting.js` 无 `series/schedule` action。`vmu.meetings.liveCap`（`meetings.js:396-399`）只是并发上限。

## §7 D7 成员命令/工具按会议类型和身份有差异

判定：**⚠️ 部分**（身份✓；类型差异仍无）。

- 身份 ✓：票权按声明席位（`kernel/meetings.js:800` 具名拒"列席/受邀/临时工永不投票，授权也不能转移票权"；`vmu.meetings.eligibleSeats` 默认空＝零策略，`defaults.json:56` 声明 `["chair","member"]`）；pack `requireVoter`（`packs/v5r/tools.js:479-487`）；受邀发言只记纪要、不计票、不阻塞（`kernel/meeting.js:104-109`）；迟到/请假（`meetings.js:453-463`、`tools/meeting.js:226-232`、`vmu.meetings.leaveApprover`）。
- **类型差异 ✗**：类型现在是真数据（存了、回读了、有白名单），但**没有一处行为按 `m.type` 分派**。唯一沾类型的行为是 pack 侧辩论必填 `subject`（`packs/v5r/tools.js:524-527`）与推荐骨架（不强制）。规则说"不同会议下成员的命令/工具不同"⇒ 除辩论对象外无差异。
- `kind` 仍不产生差异：被校验后被丢弃（§13.4）。

## §8 D8 会议类型目录（正常/学术交流/辩论/结题/论文交流/规划…）

判定：**✅ 已实现**（`5afd40ae`）。

- 目录声明：`packs/v5r/settings/defaults.json:43-50` `vmu.meetings.typeCatalog = ["ordinary","academic","debate","closure","paper","planning"]`；内核白名单 `kernel/meetings.js:394-400` **真绑**（未声明类型 ⇒ `VMU_NO_SUCH_OBJECT` + 列合法值，`enforced` 带键）；pack 侧另有同词汇表 + 具名拒（`packs/v5r/tools.js:504-509`）。
- 类型是真数据：会议存 `type`（`:442`）、回执/`summary()`/`meetingView()` 三读面回读（`:447/:1196/:1211`）。
- 保留：**类型不是等级**。`vmu.meetings.tier`（`formal|light`，判定 `meetings.js:295-305` 的 `truthWriteRefusal`）是另一根轴；`defaults.json:54-55` 声明 `tier:"formal"`、`allowLight:false`。

## §9 D9 举手/邀请发言/批量按顺序/单次发言版群聊/权限区分

判定：**⚠️ 部分**。

- 举手 ✓：primitive `hand`（`tools/meeting.js:157`）＋服务 `flow:'hands'`（`kernel/meetingmarker.js:322`，`FLOW_ORDER :328`）。
- **邀请发言 ✗（真机逐跳结论）**：pack 的 `vibe_v5_meeting` 只开**服务**会议（`packs/v5r/tools.js:539` → `kernel.meetings.open`）。院士说"邀请 X 参加/发言"在真机上只有一条路：`vibe_vmu_meeting { action:'invite'|'invitedspeak' }`（`tools/meeting.js:159-160`）→ `live()`（`:64`）→ `kernel.liveMeeting(id)` **只查原语注册表** → 该 id 在服务表 ⇒ 抛 `VMU_NO_SUCH_OBJECT`，hint 原文：「meeting &lt;id&gt; lives in the SERVICE registry: list/speak/summary/close cross registries, but invite addresses the primitive registry only」→ 面 catch（`tools/meeting.js:357-359`）转成 `{ok:false, code, message, hint}`。**⇒ 院士的邀请请求 100% 被拒，没有一条路径能成功**；`invite` 只对 `vibe_vmu_meeting {action:'open'}` 造的原语会议有效，而 pack 不提供那条路。修法二选一：服务表加 `invite/invitedspeak`，或 pack 开会改原语（后者会丢掉 resolutions/close 等服务能力）。
- 批量按顺序 ✗：无"一次给一串成员+顺序"的入参；只有模式 `flow`（open|hands|round_robin|call_on，`meetingmarker.js:322`）、`overrideOrder`（fifo|round-robin|chair|random，`:301`）、单人 `queue`（`meetings.js:605`，`orderFor :614`）。放 N 人需调 N 次。
- 单次发言版群聊 ⚠️：会议并无"每人限一次"；最接近的是群聊配额 `vmu.chat.speakQuota/speakQuotaWindowMs`（`settings/schema.js:981-982`，超限 `VMU_CHAT_QUOTA_EXCEEDED`）——**群聊配额 ≠ 辩论单轮发言**。
- 权限区分 ✓（部分）：poll_open/close 主席（`packs/v5r/tools.js:578/:631`）、flow/overrideorder 主席+必给 reason、`hands` 管理（`tools/meeting.js:221-224`）、close/extend 主席（未提交）。

## §10 D10 投票板／任务板／群聊管理

判定：**✅ 已实现**。门禁：`vmu-ballotbox` 16/0、`vmu-chat` 79/0、`vmu-tasks` 42/0（exit 0）。

- 投票板 ✓：`kernel/ballotbox.js:167-200` 读 `rules.{minVotes,allowRevote,maxChoices,minChoices,mode}`，`mode:'single'`⇒`maxChoices=1`；选票计数闸 `:271-281`（`VMU_BALLOT_CHOICE_COUNT`，少/多都具名拒并给可用选项）；`options>=2`（`:211-212`）；pack 面参数 `mode/max/min/min_votes`（`packs/v5r/tools.js:1114-1117`）+ 主席闸（`:578`）。
- 任务板 ✓：五态+迁移表（`kernel/tasks.js:28-35`）；`assign` 交派（`:285-300`）；**认领 = `transition{to:'doing'}`**（`:32` 允许 `open→doing`，`:371` 查依赖）——语义等价，但**没有独立 `claim` 动词**（工具面 action 表无 `claim`）。此口径待 lead 定。
- 群聊管理 ✓：`vmu.chat.admins/speakQuota/speakQuotaWindowMs/muteDefaultMs/freezeExemptAdmins/historyCap`（`settings/schema.js:980-985`）+ `kernel/chat.js` 全部管理动作；未授权管理动作具名拒 `VMU_CHAT_NOT_ADMIN`。

## §11 D11 辩论会额外字段：辩论对象 / 对象文件引用

判定：**✅ 已实现**（`5afd40ae`）。

- 字段：`subject`。pack 取 `args.subject ?? args.target`（`packs/v5r/tools.js:523`，**`target` 从"声明了没人读"变成活别名**）；辩论类型缺对象 ⇒ 具名拒（`:524-527`），提示承载卡片 id／文件引用／一行命题。
- 内核：`open()` 收 `subject`，非字符串 ⇒ `VMU_INVALID_ARGUMENT`，空白 ⇒ 归一 `null`（`kernel/meetings.js:404-408`）；存 `:442`；回执/`summary()`/`meetingView()` 三读面回读（`:447/:1196/:1211`）。测试 §3 三条断言覆盖。
- 保留：只做"非空"校验，**不校验引用可解析**（不查命题卡是否存在、是不是 Lean 文件）；"对象文件引用"与"对象 id"共用一个字符串字段，靠 advisor 自觉。

## §12 D14 辩论推荐流程

判定：**⚠️ 部分**（推荐骨架到位；第①步"同时单次发言"无执行体；第④步聚合自认未实现）。

- 骨架（`packs/v5r/meeting-procedures.js`，`DEBATE_PROCEDURE`）：①独立同时估计（布尔概率+理由）②轮数由院士决定 ③最终裁决轮 ④聚合+通知持卡人；`binding:'recommendation'`（规则原文：是否遵循完全由院士自己决定）。
- 缺 ①执行体：内核没有"同时/单次"机制；最接近的 `vmu.chat.speakQuota` 是群聊配额。原版靠提示词的 `m` 票与每轮 JSON（F5 已裁定：该机制还活着，先建承载再改文字 ⇒ **本轮不动提示词**）。
- 缺 ④：`pendingSteps` 自报 `verdict-aggregation`、`min-voters` 未实现（不假装）。

## §13 跨条共性发现（供 lead 归并）

1. **两套会议注册表**：primitive `kernel/meeting.js`（hand/invite/invitedspeak/end/agendaItems）vs service `kernel/meetings.js`（motion/vote/close/extend/resolutions）。pack 只开服务 ⇒ D9 邀请面真机不通（§9 有逐跳结论）。**唯一跨注册表的只有 4 个动作：list/speak/summary/close**（`tools/meeting.js:64-81` 的 hint 原文）。
2. **权限风格正在统一**：`vmu.meetings.convene/close/extendRequiresChair` 三键（未提交）把"谁可以"变成可声明的机制，默认全零机制、pack 声明 true。这套样式可直接复制到 `speak/queue/motion/vote/tally/freeze`（若 lead 认为需要）。
3. **类型轴已通、类型差异仍空**：`type` 是真数据且有六值白名单（D8 ✅），但除辩论必填 `subject` 外**无行为按类型分派**（D7 的"类型差异"仍未落）。
4. **「无消费者参数」族（本轮新查，回答 lead 第 4 问）**：
   - `formal_agenda`：`packs/v5r/tools.js:1128` 仍声明，`:545` **只在回执里回显** `formalAgenda: args.formal_agenda === true`，`open()` 收不到任何 level/tier 参数 ⇒ **惰性参数**。而 `vibe-math-vmu/docs/24-v5r-containment.md:53,396,398` 仍把它教成"简流程→正式会议的出口"（`:398` 还写了 `parked:true` 的回执）⇒ **文档教了一个没有消费者的参数**，须修文档或接线。真正的杠杆是设置键 `vmu.meetings.tier`（拒绝提示让主席改设置，不是传参）；且 pack 已声明 `tier:"formal"`+`allowLight:false`，`formal_agenda:false` 也降不了级。原版有真消费者：`archive/legacy-presets/vibe-math-v5r/vibe-math-v5r.js:2229` `if (mn.formalAgenda === true) return 'formal'`。
   - `kind`：`packs/v5r/tools.js:510-514` 校验 `['sync','division','verify-request','solve-vote']` 后**不传给** `open()`（`:539` 只有 type/chair/actor/roster/materials/secretary/subject）⇒ 内核 `kind` 字段恒 null，只有回执回显。
   - `vibe_v5_motion.reason`：`:1134` 声明，`toolMotion`（`:553-580`）全函数无 `args.reason` ⇒ 未读。
   - **扫描器的教训（自证失败，如实记录）**：`D:\_tmp\probe-param-consumers.mjs` 报 41 工具/205 参数/33 个"无消费者"，但**判据不成立**：①多数 handler 定义在别的模块（`toolSay`/`kitCardHandler`/`toolRecordProgress` 不在 `tools.js`）⇒ 33 条几乎全是假阳性；②`formal_agenda` 被判"已消费"只因回执里回显了它 ⇒ **回显 ≠ 消费，本判据无法区分**。⇒ 该探针不可作证据；上述三条是**逐函数读出来的**。
5. **声明跑在测试前面（本轮实况）**：`conveneRequiresChair` 一落地就让 `tests/vmu-meeting-types.test.mjs` 变红（§0.1）——这是"声明必须真生效"的正向证据，但也说明新增政策键必须同批补测试，否则 T1 会红。

## §14 本轮未核（如实标注，不算通过）

- 工作树那批 D1/D2 改动归属谁、是否有意提交：我只读不碰；本文件对它们一律标"未提交"。
- D2「关闭应由主席发起」的口径：机制已可声明但**默认 false**，pack 是否应恒 true 需 lead 定。
- D9 邀请面走哪条修法（服务表加 invite vs pack 改原语会议）需 lead 定。
- D10「认领」是否认 `transition{to:'doing'}` 的口径。
- D14 第①步"同时单次发言"要等 m 票承载（F5：先建承载，本轮不动提示词）。
- 其余 lane 不在本文件范围。
