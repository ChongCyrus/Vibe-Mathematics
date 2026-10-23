# Phase 12 规则一致性核查 — 成员 / 交流通道 / 归档轨（lane-members）

范围：台账 `docs/acceptance/phase12-v5r-rules-conformance.md` 的 A1–A4、B3、B4、B5、B10、B11、C2、C3，共 11 条。
方式：只读审计（grep / read / 一个探针脚本），未改任何 vmu 代码或测试；探针只写 `D:\_tmp`。
判定纪律沿用台账 §0：区分 **(a) 提示词里写了**、**(b) 机制存在且可达**、**(c) 有机器可失败的门禁**；三者分列，不互相顶替。

## 判定表

| ID | 状态 | 机制可达（b） | 门禁（c） | 缺什么 |
|---|---|---|---|---|
| A1 | ✅ 已实现 | 所办声音／自动汇报／设参／进程控制／人类在环面全在 | 有（4 处） | —（附注：`office` 是伪 id 与声音，不是独立席位） |
| A2 | ⚠️ 部分 | 主席席位、决策闸、表决席位闸都在 | 有（3 处） | 「主持」无席位闸：谁调 `vibe_v5_meeting` 谁成为 chair |
| A3 | ✅ 已实现 | `vibe_v5_start` 的 `researcherCount` 落成 member 席位（无限额） | 有 | — |
| A4 | ⚠️ 部分 | 雇佣／解雇／限额／无表决权都在 | 有（雇佣、解雇、投票、限额） | **「默认不参与会议」无机制**：入会名单＝全部 live 成员，含临时工 |
| B3 | ✅ 已实现 | track `progress` + `vibe_v5_record_progress` | 有 | — |
| B4 | ⚠️ 部分 | `routes` 轨与 `methods` 轨都在 | 部分（methods 有；routes 无轨级用例） | `routes` 无用例断言，删除该轨不会变红 |
| B5 | ⚠️ 部分 | `obstacles`／`rejected` 轨在，提示词教了分流 | 无轨级用例 | `obstacles`／`rejected` 无用例断言；分流只靠提示词 |
| B10 | ❌ 缺口 | 宿主有此面但本部署不发布；且 pack 规则显式拒绝 | 有（拒绝规则，但「拒绝」不是「提供」） | 无脚本文件轨／面／教学；台账「脚本文件」在 pack 层没有落点 |
| B11 | ⚠️ 部分 | 通用自反馈库在（5 必填字段） | 有（通用部分） | 院士专属「各阶段流程与组织协作自反馈优化」无字段、无角色分支、无提示词、无门禁 |
| C2 | ⚠️ 部分 | 群聊／私信／邮箱三通道都在，数据上语义分明 | 有（三通道 + urgent 参数） | pack 教学路径不能让成员发「紧急私信」：`vibe_v5_say` 不传 urgent，只有未教学的 kernel 面能传 |
| C3 | ⚠️ 部分 | 写自己（`state` 轨）与读他人（records 面）都可达 | **无闸** | 四个必需内容（总任务／规划／各任务完成状态／当前小任务）无字段校验；读他人状态版的面未教学 |

## 逐条证据

### A1 所办＝主代理：用户助手／自动唤起汇报／用户↔研究所媒介／自然语言设参 → ✅

- **(a) 提示词**：`packs/v5r/prompts/v5r-core.js:576` 教「以『所办/人类』的口吻给所内转达消息」；`:639` 明说转达所办口吻的消息是院士的职责。三份角色清单里只有院士席出现 `vibe_v5_message`（`tests/vmu-v5r-tools.test.mjs:975` 断言）。
- **(b) 机制**：
  - 所办声音：`kit/handlers.js:246` 固定以 `'office'` 为发件人投递（`vibe_v5_message`）。
  - 自动地盘唤起汇报：`v5r-core.js:155-178` 声明 `vmu.report.enabled:true` + 三条汇报（节奏／事件 `meeting-closed`／阈值 `artifacts>=5`），收件人全是 `['office']`；执行在 `kernel/report.js:354-378`（fire → deliver）。
  - 设参：`packs/v5r/tools.js:813`（`vibe_v5_configure`）与 `:834`（`vibe_v5_set`），仅接受 schema 声明过的键，越权写被具名拒（`:757-775` 的 `applyDeclaredSetting`）。
  - 进程控制：`tools.js:728/748/753/771`（start/stop/pause/resume，全部走内核控制态）。
  - 用户侧入口：`vibe_vmu_human` 面在本部署**已发布**（探针输出 `"vibe_vmu_human":true`），动作含 `dashboard|queue|gate|decide|veto|liftVeto|recover`（`tools/human.js:28`）。
- **(c) 门禁**：
  - `tests/vmu-assistant-e2e.test.mjs:332-392`：真实宿主回合边界上三条汇报 `delivered:true`、`status().delivered` 与 `failures` 计数一致，坏运输层 `delivered:false` 且 `failures:1`。
  - `tests/vmu-v5r-tools.test.mjs:399-412`：`set` 正例（H1 键「立即生效」措辞）＋未声明键具名拒；`configure` 混合热级与「空参数具名拒」。
  - `tests/vmu-assistant-report.test.mjs:247-281` + `tests/vmu-assistant-e2e.test.mjs:226-261`：参数域就是 `vmu.report.params`，越出 `whoMayChange` 的调用者按名字被拒。
  - 真机佐证：`kernel/report.js:136` 注释记载一次真机运行返回 `delivered:true`（本轮未复跑真机）。
- **附注（措辞更正，不降级）**：`office` 不是席位。`v5r-core.js:214-218` 的 slots 只有 `chair/member/temp`，`vibe_v5_hire` 也只接受这三类。所办是**伪 id ＋ 汇报收件人 ＋ 消息口吻 ＋ 设参/控制入口**，用户侧主代理身份由部署层 root 会话承担（在本 pack 里 root 同时坐 chair 席）。若规则要求「所办」是独立的可寻址成员，则这是缺口——需要裁决，不是实现能单方面补的。

### A2 院士：主席席位，主持/决策会议 → ⚠️

- **(b) 机制**：主席席位存在（`v5r-core.js:215`，capacity 1）；决策类动作有席位检查 `tools.js:472-476`（`requireChairSeat`），用在 `poll_open`（`:608`）与 `poll_close`（`:661`）；所内全局视图仅主席席（`tools.js:186-191`）；决议类动议只有主席或秘书可动（`kernel/meetings.js:650-658`）；主持中立轨 `kernel/meetings.js:110`、投票时执行（`:780-786`）；有投票权的席位由 `packs/v5r/settings/defaults.json:56` 声明为 `chair/member`。
- **(c) 门禁**：`tests/vmu-v5r-tools.test.mjs:224-230`（member 席调 overview 具名拒、chair 席通过）、`:343-353`（poll_open 仅主席）、`:357-359`（临时席投票被具名拒）。
- **缺什么**：**「主持」没有席位闸**。`vibe_v5_meeting` 先 `requireSeat`（任意席位，`tools.js:498`），然后直接把调用者写成 `chair`（`:536`）——member 或 temp 调用即自任主席并主持。这不是提示词问题，是机制缺一道闸；「只有院士能预约会议」属台账 D1，但 A2 的「主持」同样没有落点。

### A3 常驻研究员 → ✅

- **(b) 机制**：`vibe_v5_start` 的 `researcherCount`（默认 3，允许 0–50）把常驻研究员落成 `member` 席位（`tools.js:728-739`）；`member` 席位容量 0＝不限（`v5r-core.js:216`），与 `temp`（容量 12，`v5r-core.js:217`）区分；初始任务面另有 `vibe_v5_task_*`。
- **(c) 门禁**：`tests/vmu-v5r-tools.test.mjs:389-394`（`researcherCount:2` ⇒ `hired.length===2` 且内核 `start()` 成功；第二次占椅被具名拒）。
- 附注：除 `member`／`temp` 的席位区分外没有更细的「资深/普通研究员」层级——规则只要求常驻，足够。

### A4 临时工：被雇、无表决权、默认不参会、可雇可解 → ⚠️

- **(b) 机制**：
  - 雇佣：`tools.js:149-162`（`members.hire({slot:'temp'})` + 初始任务）。
  - 解雇：`tools.js:299-318`（`members.end` + 名下未完成任务转 `cancelled`）。
  - 无表决权：投票内核闸 `kernel/meetings.js:748-758`（「本席无票……列席、受邀、临时工永不投票」）＋ `eligibleSeats` 只声 `chair/member`（`defaults.json:56`）。
  - 限额：`kernel/recruit.js:189-206` 的 `maxTempPerMember` 逐成员封顶（`defaults.json` 声明为 3）。
- **(c) 门禁**：`tests/vmu-v5r-tools.test.mjs:214-219`（temp 真落席＋初始任务）、`:304-308`（解雇后成员结束且任务转 cancelled）、`:357-359`（temp 投票 `VMU_NOT_PERMITTED` 且码含 `V5_NOT_VOTER`）、`tests/audit-enforced-consistency.test.mjs:668-675`（`maxTempPerMember` 的强制一致性审计）。
- **缺什么**：**「默认不参与会议」没有机制，且默认行为相反**。`vibe_v5_meeting` 的入会名单是「全部 live 成员」（`tools.js:499`），无排除参数；内核 `open()` 原样收下这份 roster（`kernel/meetings.js:388` 形参、`:431` 存 `roster`）。临时工因此默认在册。提示词侧临时工段确实没有会议工具（`v5r-core.js:660-691`），但那只是「没工具可用」，不是「不入会」，也无法防止被点名／被邀请。台账 A4 行写「temp 不在册」与实测不符，需更正。

### B3 各自 progress → ✅

- **(b)**：`defaults.json:19` 声明 `progress` 轨；`kit/handlers.js:96-132` 写入（必填 `content`，轨只取声明集，越轨具名拒）。
- **(c)**：`tests/vmu-v5r-tools.test.mjs:121-128`（写一条 ⇒ `track==='progress'` 且该轨计数恰 +1，带 `receiptMeta`）。

### B4 已尝试路线/方法及进度 → ⚠️

- **(a)**：`v5r-core.js:571`／`:625` 的教学行写了「track 可选 progress/routes/obstacles/rejected/state」。
- **(b)**：`routes` 轨在 `defaults.json:19`；`methods` 轨有专门工具 `vibe_v5_record_method`（`kit/handlers.js:139` 的共用卡片处理器）。
- **(c)**：`methods` 有门禁（`tests/vmu-v5r-tools.test.mjs:145-147`）；**`routes` 无轨级门禁**——通用「声明轨可写」用例拿 `feedback` 当探针（`:136-142`），把 `routes` 从声明里删掉不会有任何用例变红。
- **缺什么**：一条 `routes` 轨的写入断言（写一条并计数），否则该轨是「声明了但没人守」。

### B5 遇障路线/方法/障碍及原因归档 → ⚠️

- **(a)**：`v5r-core.js:571` 明写「证伪的路走 rejected，阻塞走 obstacles」。
- **(b)**：两轨都在 `defaults.json:19`，走与 B3/B4 同一写入路径（`handlers.js:102-107` 只查声明集）。
- **(c)**：**无用例**。全仓 `tests/` 中不含 `obstacles`／`rejected` 的轨级断言（grep 只命中无关词句）。
- **缺什么**：两轨各一条写入断言；另外「什么算 rejected、什么算 obstacles」只有提示词一句话，没有 kind／字段约束（`record_progress` 写死 `kind:'progress'`，`handlers.js:112`），归档粒度靠自觉。

### B10 脚本文件 → ❌

- **(a) 提示词**：无任何脚本教学；相反 `v5r-core.js:226-239` 给了一条 M1 规则，对 `vibe_vmu_script` 直接拒绝（码 `VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS`，提示「请走归档/复算流程」）。
- **(b) 机制**：宿主确有该面（`host.js:93` 的 `script:'vibe_vmu_script'`；`docs/18-command-and-protocol-reference.md:135-142` 记其参数与前置：脚本必须在配置里**声明**才出现）。但**本部署不发布它**：探针实测 60 个已发布工具里 `vibe_vmu_script:false`。成员只能借宿主自身的 shell／写文件工具，pack 层没有「脚本文件」轨、面或提示词。
- **(c) 门禁**：`tests/vmu-entry.test.mjs:387-392`（规则真的拒绝该工具）、`tests/vmu-pack-plan-rule-validate.test.mjs:258-259`（plan/apply 路径同样开火）。注意：这是「拒绝」的门禁，不是「提供能力」的门禁。
- **缺什么**：规则要的是「脚本文件」这一归档物。二选一需要裁决：① 在 v5r 加一个脚本文件轨／面（并配提示词与断言）；② 明确「脚本文件由宿主 shell 工具承担、pack 不提供」，那台账应改判而不是留 ❌。

### B11 自反馈库（含院士对各阶段流程与组织协作的自反馈优化）→ ⚠️

- **(b) 通用部分**：`tools.js:389-430` 的 `vibe_v5_feedback`（`op=add|update|list`），add 必填五字段 `category/route/phenomenon/impact/action`（`:389`），人际路线额外要 `assessment`；写 `feedback` 轨（`defaults.json:19`）。
- **(c) 通用部分门禁**：`tests/vmu-v5r-tools.test.mjs:283-292`（缺字段具名拒、正例、人际路线缺 `assessment` 具名拒、list）。
- **缺什么（院士专属那一半）**：没有角色分支（函数体内无 chair 检查）、没有阶段／组织协作专属字段（五字段是通用的）、提示词只有两条通用 bullet（`v5r-core.js:585`／`:632`），全仓 grep「组织协作／自反馈／优化点」在提示词中 0 命中，也没有门禁。规则里「院士另含对各阶段（平时/会议/辩论）流程与组织协作的自反馈优化」目前只落在通用库上，属未实现。

### C2 交流通道：邮箱（非紧急）／私信（希望尽早回复）／群聊（非紧急）→ ⚠️

- **(a) 提示词**：`v5r-core.js:575`／`:629`／`:669` 教了 `vibe_v5_say`（省略 to＝群聊，`to`＝私信）与 `vibe_v5_message`（所办口吻）；`:603-605`（及 `:645-647`、`:679-681`）三处写明「紧急只表示希望对方及时/在线回复，不代表内容更重要、也不代表必须中断」，并说「除这种情况外一律走非紧急留言（默认）」。
- **(b) 机制**：群聊 `kit/handlers.js:212-216`（`chat.send(member,text,{kind:'chat'})`，无 urgent 概念）；私信 `:204-210`（`mailbox.send(member,{to,text,kind:'dm'})`）；所办邮箱 `:227-250`（`urgent` 归一化后 `kind:'notice'`，正文带 `urgent:true`）。核心里 `urgent` 是显式发送方意图，`MAILBOX_URGENT_KINDS` 默认为空（`kernel/mailbox.js:31`、`:319`）；信箱列表行是 8 字段不含正文（`:216`），「紧急」只出现在投递通知的标题前缀里。
- **(c) 门禁**：`tests/vmu-v5r-tools.test.mjs:175-181`（群聊 `via:'chat'`、私信 `via:'mailbox'`、所办消息 `from:'office'`，三通道各自被断言）；`:1479-1535`（`vibe_v5_message` 的 `subject/urgent` 参数在**已部署 schema** 里存在；缺省非紧急且 `kind:'note'`；字符串 `"true"` 归一；显式 false 保持非紧急）。
- **缺什么**：**「私信＝希望尽早回复」在成员可用的教学面上不可达**。`vibe_v5_say` 的处理器只传 `{to,text,kind:'dm'}`（`handlers.js:204-210`），没有 urgent 参数；要发紧急私信，成员得调用**提示词没教**的 kernel 面 `vibe_vmu_mailbox {action:'send', from, to, text, urgent:true}`（探针实测该面已发布且 `urgent:true` 生效）。语义链是通的，教学链断了：要么给 `vibe_v5_say`／`vibe_v5_message` 一个成员可达的「紧急私信」入口并写进 bullet，要么在提示词里点名 kernel 面（但那会破坏「只教 pack 工具」的现有纪律，需要裁决）。

### C3 状态版：可查看他人、可改自己、四个必需内容＋时间信息 → ⚠️

- **(b) 改自己**：`vibe_v5_record_progress` 可路由到 `state` 轨（`handlers.js:102-107` 用声明集，`defaults.json:19` 含 `state`），提示词 `v5r-core.js:571`／`:625` 列了 state。
- **(b) 看他人**：`vibe_vmu_records` 面在本部署**已发布**（探针 `"vibe_vmu_records":true`），`action:'list'` 给头部行（含 track/作者/时间，不含正文）、`action:'expand'` 按 id 取正文（`docs/18-command-and-protocol-reference.md:127-133`）；探针里两成员写下的两条 state 记录可被同一次 `list` 读到（`count:2`）。
- **(b) 时间信息**：记录行由内核盖 `at`（`kernel/mailbox.js:216` 的同类行形状即含 `at`；records 行同样带时间），不靠作者手写。
- **(c) 门禁**：**没有**。库里没有任何 state 轨的用例；四个必需内容只是自由文本，探针用一句话的 body 直接写入成功（无字段校验、无模板、无必填项）。
- **缺什么**：① 一个「状态版四要素」的机器闸（要么在 `record_progress` 的 state 分支校验/补全四个字段，要么加一个专门的 state 面并在用例里钉住）；② 读他人状态版的教学入口——`vibe_v5_read_library` 硬编码只读 `propositions/methods/problems/progress` 四轨（`handlers.js:264`），**不含 state**，所以成员要看别人的状态版必须用未被教学的 records 面。提示词里也没有「状态版」三个字。

## 本轮实测记录（命令与输出摘要）

探针：`D:\_tmp\probe12-lane-members.mjs`（真实入口 `vibe-math-vmu/vibe-math-vmu.js`，`packs:['v5r']`，`root:D:/_tmp/probe12-lane-members`，`deliver` 接缝注入）。
命令：`node D:/_tmp/probe12-lane-members.mjs` ⇒ exit 0。关键输出：

- 已发布工具 60 个；`vibe_vmu_records/chat/mailbox/report/panel/human` = true；**`vibe_vmu_script` = false**。
- 群聊 `{via:'chat', kind:'chat'}`；私信 `{kind:'dm', urgent:false}`；显式紧急私信 `{urgent:true}`；只给 `kind:'notice'` 不再自动紧急 `{urgent:false}`（与第 9 轮的修正一致）。
- 收件人列表行：`from/kind/subject/at` 可见，**无正文、无 urgent 字段**。
- 汇报：`enabled:true`，tick 后真实投递一条 `{name:'v5r-artifact-threshold', to:['office'], channel:'inbox'}`。
- 状态轨：一句话 body 直接被接受（无字段闸）；两个成员的两条 state 记录可被一次 `list` 读到。
- 注：探针里对汇报参数域调用的方法名写错了（`rep.changeParam is not a function`），那一项**不算实测结论**；参数域证据取自上面列出的四条测试（它们用的是面/适配器入口，不是 kernel 内部方法名）。

## 未核 / 下一步

1. **A2 主持闸**与**D1「只有院士能预约」**是同一处缺口的两半，建议合并裁决，不要两边各写一遍。
2. **A4 入会名单**：需确认部署时是否另有 `vmu.meetings.eligibleSeats` 之外的过滤（本轮只读到 `tools.js:499` 一处构造名单）；若确认没有，台账 A4 行「temp 不在册」应更正为「temp 在册但无票」。
3. **B10** 需要一次范围裁决（补面 vs 改判），否则会长期挂在 ❌。
4. **C2 紧急私信入口**与**C3 状态版闸**都涉及「放不放 kernel 面进提示词」的既有纪律，属设计裁决。
5. 本 lane 未跑任何长门禁（按要求只用 grep/read/一个探针），因此以上「门禁」均为源代码级证据（测试文件存在且断言目标明确），**没有实跑 T1**。
