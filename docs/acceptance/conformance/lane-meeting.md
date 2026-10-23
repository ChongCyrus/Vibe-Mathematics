# Lane: 会议家族（D1–D15）— Phase 12 运行规则一致性

依据台账：`docs/acceptance/phase12-v5r-rules-conformance.md` §0 读法与状态词。
**本轮只写本文件**：不改源码、不改台账、不跑全量闸门；只跑单套件取门禁证据。
纪律：每条指到 `文件:行` 或命令输出；「提示词里写了」≠「机制存在」；「工具声明了参数」≠「参数被消费」；「声明了键」≠「键被消费」。
**★ 本文件已用当前工作树重写过一轮（上版行号与「未提交」结论全部作废）**；所有行号本轮现场 `grep -n` 取得。

## §0.1 复核快照（本轮全部事实以此为准）

- HEAD：`fb237c95`；本轮开始计时该树为 **0 行改动**（干净）。审计过程中出现了并行 lane 的改动，如实记录于本节末条。
- 本轮实跑的命令与出口码：
  - `node tests/vmu-meeting-types.test.mjs` → `=== VMU MEETING TYPES: 65 passed, 0 failed ===`，**exit 0**（65 = 该文件 `grep -c "ok("` 计数）。
  - `node tests/vmu-meetings.test.mjs` → `=== VMU MEETINGS: 195 passed, 0 failed ===`，**exit 0**。
  - 其余套件（`vmu-ballotbox` / `vmu-chat` / `vmu-tasks` / `vmu-meeting-parity`）**本轮未跑**，凡引用只写「套件存在」，不当门禁证据用。
- **工作树漂移（复核期间观察到的，如实记录）**：HEAD 仍是 `fb237c95`，但在写本文件前后 `git status --short` 里出现了本 lane 之外的**未跟踪**文件：
  ```
   M docs/acceptance/conformance/lane-meeting.md   ← 本文件（本轮唯一可写）
   M vibe-math-vmu/kernel/bus.js
  ?? docs/acceptance/conformance/lane-verified-design.md
  ?? vibe-math-vmu/kernel/meetingverdict.js
  ```
  `vibe-math-vmu/kernel/meetingverdict.js`（325 行；导出 `aggregateVerdicts` / `rulePropositionProbability` / `createMeetingVerdict`）看起来是**并行 lane 正在落 D15 的裁定闭环**，但它 `grep -rn "meetingverdict"` 在其他文件 **0 命中**（既没进 `kernel/index.js`，也没有任何工具引用）⇒ 按纪律「声明≠生效、未挂载≠能力」，**本轮判定仍以 HEAD 现状为准，它只记作 in-flight，不计入任何 ✅**。

## §0.2 判定汇总

| ID | 规则要点（短） | 判定 | 一句话 |
|---|---|---|---|
| D1 | 只有院士能**预约**会议（可设预约时间；人未齐进入等待；超时院士自决） | **⚠️ 部分** | 召开权真落了双锁；**预约时间 0 键、等待阶段无状态** |
| D2 | 院士召开/关闭/延长时长上界；院士主持 | **✅ 已实现** | 三条都在内核且有断言；`extendlimit` 可达（可发现性缺陷见 §16.2） |
| D3 | 院士设标题/类型/内容事项/邀请成员/时长上界 | **⚠️ 部分** | 类型/对象/议程/成员/上界全通；**标题无独立字段** |
| D4 | 院士用命令自组织、决策会议中一切内容/控制/活动 | **⚠️ 部分** | 命令面齐全；**主席专属动作的 actor 门槛只覆盖 3 处** |
| D5 | 特殊类型会议框架给院士推荐流程骨架（采纳与否自定） | **✅ 已实现** | `binding:'recommendation'`，未实现步骤进 `pendingSteps` |
| D6 | 一次性设置**连续展开的多个会议** | **❌ 缺口** | 无会议序列/批开载体 |
| D7 | 成员命令/工具按会议**类型和身份**有差异 | **⚠️ 部分** | 身份✓；**类型在活路径上不改变任何命令** |
| D8 | 会议类型含：正常/学术交流/辩论/结题/论文交流/规划… | **✅ 已实现** | 目录六值 + 内核白名单真读 |
| D9 | 举手/邀请发言/**批量按顺序发言**/单次发言版群聊/权限区分 | **⚠️ 部分** | 单次发言与顺序机制✓；**pack 建的会议上 hand/invite 不可达**、无批量入参 |
| D10 | 投票板／任务板设置与认领交派／群聊管理 | **✅ 已实现** | 三个面都在（保留项 §10） |
| D11 | 辩论会额外字段：辩论对象或对象文件引用 | **✅ 已实现** | `subject`，三读面回读，辩论缺对象具名拒 |
| D12 | 辩论/结题表决人数下限 ≥ **min(用户设置, 院士+常驻研究员)** | **⚠️ 部分** | 有 quorum 闸，但**口径不是规则那条 min**，且无「常驻」概念 |
| D13 | lean 已通过但概率非 1 的命题：辩论聚焦**描述符合性** | **❌ 缺口** | 无闸、提示词亦无该句 |
| D14 | 辩论推荐流程（各自单次发言给概率+理由 → 轮流/举手/邀请 → 轮数院士定） | **⚠️ 部分** | 四步骨架✓；第②步工具在活路径不可达、第④步聚合缺 |
| D15 | 辩论结束机制：收最终裁决、一致取该值否则均值、**通知命题卡持有者改概率** | **❌ 缺口** | 收票面✓；**聚合与通知都不存在** |

计数：**✅ 5 / ⚠️ 7 / ❌ 3**（共 15）。

---

## §1 D1 只有院士能预约会议

**① 现状：⚠️ 部分。**「只有院士能召开/关闭」已是机器事实（内核 + pack 双锁）；但规则的另外两个子句——「可设置预约时间」「到点人未齐进入等待阶段」——**没有任何承载**：会议只能「现在开」，等待态不是一个状态。

**② 证据（当前树）：**
- 召开权（内核）：`vibe-math-vmu/kernel/meetings.js:130` `conveneRequiresChair: sget('vmu.meetings.conveneRequiresChair') === true`；拦截在 `kernel/meetings.js:442-453`（匿名开 ⇒ `:448` 具名拒；替人开 ⇒ `:453` 具名拒，code `VMU_NOT_PERMITTED`）。
- 召开权（pack）：`vibe-math-vmu/packs/v5r/tools.js:472-478` `requireChairSeat`（席位 ≠ `'chair'` ⇒ 具名拒），调用点 `packs/v5r/tools.js:504`；`open` 传 `actor: member`（`packs/v5r/tools.js:545`）。
- 制度声明：`vibe-math-vmu/packs/v5r/settings/defaults.json:59` `"vmu.meetings.conveneRequiresChair": true`。
- **预约时间：不存在。** `grep -rn "schedule" vibe-math-vmu/kernel/meetings.js` → **0 行**；`grep -c "vmu.meetings.schedule" vibe-math-vmu/settings/schema.js` → **0**。schema 里 `:576-597` 命中的 `vmu.schedule.*` 是**调度器家族**（triggerVia/maxPending/timeSource/…，`settings/schema.js:579-597`），与会期预约无关。`open()` 签名 `kernel/meetings.js:418` 只有 `at`（=本次开会时刻，不是预约时刻）。
- **等待阶段：不存在。** 无 `waiting` 状态；`grep -n "wait" vibe-math-vmu/kernel/meetings.js` 只命中 `:1357` 的一句文案（meetingView 的 note），不是状态机。能表达的近似物：迟到者可增量出席（`attend()` `kernel/meetings.js:515`）、未达 quorum 可见（`quorum()` `kernel/meetings.js:1286`、`quorumOf` `:284-300`）、超时兜底是 `lapse/lapseDue/revokeLapse`（导出在 `kernel/meetings.js:1470` 起；F28 有界可撤销）。

**③ 还缺什么：** ① 预约时间字段 + 键（如 `vmu.meetings.scheduleAt`，或把 `open({at})` 的语义拆成「预约时刻/开会时刻」两参）；② `waiting` 状态与「到点人未齐 ⇒ 进等待 / 到上限 ⇒ 院士自决」的状态迁移；③ 「只能院士预约」的 actor 门槛（现有轨只管召开那一刻）。

**④ 该由谁做：** 内核（状态机 + 新键的读取点）；pack（声明默认值与制度值）。

---

## §2 D2 院士召开、关闭、延长时长上界；院士主持

**① 现状：✅ 已实现。** 四条都有真实承载，且「延长是真的」不是回执字段。

**② 证据：**
- 召开：D1 的两把锁（`kernel/meetings.js:442-453`、`packs/v5r/tools.js:504`）。
- 关闭：`close()` `kernel/meetings.js:1137`；主席轨 `:1144`（`K.closeRequiresChair`，`:1144-1175` 区段：取 `actor` 与本会 `chair` 比对，无主席的会议不适用该轨——避免造出关不掉的记录）；制度值 `packs/v5r/settings/defaults.json:60`。
- 延长**会议墙钟上界**：`extendWall({meeting, ms, at, actor, why})` `kernel/meetings.js:1239`；正步长校验 `:1267`；天花板 `:1271-1274`（`vmu.meetings.extendCeilingMs`，默认 4h，钳制 `[3000000, 86400000]` 见 `kernel/meetings.js:136`）；**真正被消费**：`speak()` 用 `wallLimitOf(m)` 而非常量 —— `kernel/meetings.js:623-631`。
- 主持：主持人可移席 `transferChair()` `kernel/meetings.js:876`、打断 `interrupt()` `:659`、休会 `recess()` `:904`、排发言序 `queue()` `:684`、发言序/地面 `flow`/`overrideOrder`（`kernel/meetingmarker.js:322` modes、`:350` 返回面 `{flow, overrideOrder, effective, orderFor, floorOf, queueGate, view, ORDER_KEY}`）。
- **`extendlimit` 从 `vibe_vmu_meeting` 真的可达**：action 在 enum 里（`vibe-math-vmu/tools/meeting.js:26`），实现在 `tools/meeting.js:241-253`：`svc.extendWall(...)` 当且仅当服务注册表持有该 id（`serviceHas(pid)`），否则原语会议得到具名 hint（`tools/meeting.js:249-252`）。pack 建的会议**就是**服务记录（`packs/v5r/tools.js:545` 只调 `kernel.meetings.open`）⇒ 活路径可达。
- 门禁（本轮实跑）：`node tests/vmu-meeting-types.test.mjs` → 65/0 exit 0，其中含「延长是假的就会红」的两条（越过原界仍可用 / 越过延长后的界被拒且文案说「extended」）与「内核面真的提供 extendlimit」一条。

**③ 还缺什么：** 功能无缺；**可发现性缺陷**（不降级，记 §16.2）：服务会议的 `extend` 拒绝文案列出的跨注册表动作是 `list/speak/summary/close`（`tools/meeting.js:80`），**没有 `extendlimit`**；pack 回执的指路清单同样只写 `extend`（`packs/v5r/tools.js:555`）。真机会把「延长会议」误使到 `extend`（那是发言延长）上。

**④ 该由谁做：** 内核（把 `extendlimit` 加进两处 hint/note 的枚举；纯文案，零机制）。

---

## §3 D3 院士设标题、类型、内容事项、邀请成员、时长上界

**① 现状：⚠️ 部分。** 五项里四项已落；**「标题」没有独立字段**（`materials` 兼作议程/标题，`id` 由内核 mint）。

**② 证据：**
- 类型：pack 校验 `packs/v5r/tools.js:510-513`（未知类型具名拒并列合法值）；内核二次校验 `kernel/meetings.js:424-428`（`vmu.meetings.typeCatalog` 真读，`mark(enforced,…)`）；声明 `packs/v5r/settings/defaults.json:57`。
- 辩论对象（见 D11）：`open({subject})` `kernel/meetings.js:418`。
- 内容事项：`materials`（`open` `:418`）+ 议程项/关闭（原语面 `tools/meeting.js:166-169`）。
- 邀请成员：`open({roster})` `:418`，迟到者 `attend()` `:515`。
- 时长上界：`hardLimitMs` 在 `open` 冻结为 `wallLimitMs`（`kernel/meetings.js:491`）+ D2 的 `extendWall`。
- **标题**：`grep -n "title" vibe-math-vmu/kernel/meetings.js` → **0 行**；读面 `summary()`（`:1323-1346`）与 `meetingView()`（`:1347-1360`）只有 `type/subject/kind/materials`。

**③ 还缺什么：** 一个独立 `title`（存储 + 三读面 + pack 参数透传）；否则「设标题」只能借 `materials`，且 `subject` 已被辩论对象占用（同一字段两种语义，正是本仓反复出错的形状）。

**④ 该由谁做：** 内核（字段 + 读面）为主；pack 补参数与默认（`title` 缺省可回落 `materials`，但回落必须写在回执里）。

---

## §4 D4 院士通过命令自组织、决策会议中一切内容/控制/活动

**① 现状：⚠️ 部分。** 命令面非常宽（服务 36 个方法 + 内核工具 43 个 action），但「由院士决策」的权力只落到 3 处 `actor` 轨；其余会议控制动作只校验「是成员」，不校验「是主席」。

**② 证据：**
- 服务方法清单一览（`kernel/meetings.js`）：`open:418`、`attend:515`、`leave:537`、`speak:573`、`interrupt:659`、`queue:684`、`motion:700`、`second:769`、`withdraw:789`、`vote:808`、`transferChair:876`、`recess:904`、`resume:929`、`warn:951`、`expel:984`、`quote:1008`、`fileAppeal:1023`、`confirmMinutes:1052`、`minutes:1064`、`verbatim:1080`、`wake:1096`、`close:1137`、`extendWall:1239`、`quorum:1286`、`receiptsView:1297`、`eligibleVoterIds:1309`、`summary:1323`、`meetingView:1347`、`status:1361`、`snapshot:1406`、`restore:1423`。
- 工具面 action enum（43 项）：`vibe-math-vmu/tools/meeting.js:26`。
- **actor 轨只有 3 条**：`conveneRequiresChair`（`:442`）、`closeRequiresChair`（`:1144`）、`extendWall` 的 actor 记录（`:1279` 起，存 actor/why 但不拒非主席）。反例：`interrupt()`（`:659`）只查 `isMember`；`recess()`（`:904`）要求 `by` 是成员（`:907-912`）但不要求主席；`warn:951`/`expel:984`/`transferChair:876` 同理。
- 会议内「内容」编辑：只有原语面 `agendaclose/agendaitems`（`tools/meeting.js:166-169`，走 `live()` = 原语注册表），**服务会议无议程命令**。

**③ 还缺什么：** ① 主席专属动作的 actor 门槛（若制度要；中断/休会/警告/驱逐/移席当前谁都能做）；② 服务面的议程编辑（增/删/改议题项）。

**④ 该由谁做：** 内核（`interruptRequiresChair` 一类的轨 + 服务面议程方法）；pack 声明是否采纳（默认 false＝零机制）。

---

## §5 D5 特殊类型会议，框架初始给院士推荐流程骨架

**① 现状：✅ 已实现，且「推荐≠门禁」是机器可读的。**

**② 证据：**
- 骨架单一来源：`vibe-math-vmu/packs/v5r/meeting-procedures.js:44-87`（辩论四步）；`binding: 'recommendation'` `:46`；四步 `:48-81`，其中第④步 `status:'pending'` + `pendingReason`（`:73-80`）。
- 只有规则点名的类型才有骨架：`MEETING_PROCEDURES` `:90`（`{ debate: … }`），其余类型 `procedure:null` + 具名理由（`procedureFor` `:126-144`，缺口清单 `MEETING_PROCEDURE_GAPS` `:93-108`）。
- 送达院士：`vibe_v5_meeting` 回执带 `procedure/procedureBinding/procedureNote/pendingSteps`（`packs/v5r/tools.js:550-555`）。
- 不是闸：无任何调用因「未按骨架」被拒（骨架只出现在回执里；`packs/v5r/tools.js:555` 的 note 明确「skipping/reordering allowed and unchecked」，`meeting-procedures.js:16-17` 同义）。
- 门禁（本轮实跑）：`tests/vmu-meeting-types.test.mjs` → 65/0 exit 0；该套件自述（文件头 `:15-17`）含「骨架里每个工具名都真的在 41 个工具里」的反查。

**③ 还缺什么：** 骨架本身无缺。**可达性折扣**：第②步引用的 `{action:'hand'}`/`{action:'invite'}` 在 pack 建的服务会议上会被拒（见 D9）——松散地说这不影响「给不给骨架」，但真机会让院士按骨架走时撞墙。

**④ 该由谁做：** 内核（补服务面 hand/invite，见 D9）。

---

## §6 D6 允许一次性设置连续展开的多个会议

**① 现状：❌ 缺口。** 没有任何「会议序列」载体。

**② 证据：**
- `open()` 签名 `kernel/meetings.js:418` 无批量参数（无 `count`/`list`/`sequence`）。
- `grep -rn "meetingSequence|sequenceOfMeetings|batchConvene" vibe-math-vmu/` → **0 命中**。
- `queue()`（`kernel/meetings.js:684`）是**发言队列**，不是会议队列（其语义见 `kernel/meetingmarker.js:282-291`）。

**③ 还缺什么：** ① 一个「会议序列/批开」对象（N 个会议 + 顺序 + 间隔）；② 与 D1 的预约时间天然耦合（序列 = 未来 N 个会期）。

**④ 该由谁做：** 内核（序列对象或 `openBatch`）；pack（键与制度值）。

---

## §7 D7 成员可用命令/工具按会议类型和身份有差异

**① 现状：⚠️ 部分。** 身份差异真实存在；**类型在活路径上不改变任何成员命令**。

**② 证据：**
- 身份差异：投票席白名单 `kernel/meetings.js:808-825`（`vmu.meetings.eligibleSeats`，`:815-821` 具名拒）；`eligibleVoterIds()` `:1309-1320`；pack 侧 `requireChairSeat`（`packs/v5r/tools.js:472-478`）与 `requireVoter`（`:480-491`）；`call_on` 地面下「只有主席能指定发言人」`kernel/meetingmarker.js:410-428`（`queueGate`）。
- **类型差异**：全内核唯一按 `type` 分支的是 `kernel/meetings.js:1186` `if (m.type === 'committee' && !report)`（结题报告轨）；而 pack 声明的合法类型是 `ordinary/academic/debate/closure/paper/planning`（`packs/v5r/settings/defaults.json:57`、`packs/v5r/meeting-procedures.js:25-32`）——**`committee` 不在活路径的类型集合里**（`typeCatalog` 一被声明，内核 `:424-428` 就拒绝非白名单类型）⇒ 按类型分派的权限/命令在活路径上等于不存在。
- pack 侧的 `procedureFor` 是「给院士的推荐文本」，不是「成员命令差异」。

**③ 还缺什么：** 按类型分派的命令/权限（例：debate 类型才有「最终裁决」写入面并对成员开放；closure 类型才有结题报告）。类型是机构词汇，分派表应放 pack。

**④ 该由谁做：** pack 为主（分派表 + 声明），内核只提供 seam（`tier/type` 是 `status()` 可读的，`kernel/meetings.js:1361-1400`）。

---

## §8 D8 会议类型目录（正常/学术交流/辩论/结题/论文交流/规划…）

**① 现状：✅ 已实现。** 类型是活字段：可设、可校验、可回读、可用于取骨架。

**② 证据：**
- 目录：`packs/v5r/meeting-procedures.js:25-34`（六个 id：`ordinary/academic/debate/closure/paper/planning`）。
- 制度声明：`packs/v5r/settings/defaults.json:57`（`vmu.meetings.typeCatalog` 六值）。
- 内核真读（不是声明即生效）：`kernel/meetings.js:424-428`，非白名单 ⇒ `VMU_NO_SUCH_OBJECT` + 合法值列表，并 `mark(enforced,'vmu.meetings.typeCatalog')`。
- 存储与回读：`open()` `:418` → 会议对象；`summary()` `:1323-1346` 回 `type`；`meetingView()` `:1347-1360` 回 `type`；`snapshot()` `:1406-1419` 序列化整个会议对象（故 `type` 也随快照过重启）。
- 按类型取骨架：`meeting-procedures.js:121-140`。
- 门禁（本轮实跑）：`tests/vmu-meeting-types.test.mjs` 65/0 exit 0（含 §1–§3 的类型/回读/未知类型拒）。
- ★ 台账 `docs/acceptance/phase12-v5r-rules-conformance.md` §4 D8 行把 id 写成 `normal/final`，实际是 `ordinary/closure`——台账措辞过期，不影响判定，但引用时别抄。

**③ 还缺什么：** 无（D8 范围）。

**④ 该由谁做：** —

---

## §9 D9 常见命令：举手发言、邀请发言、批量指定成员按顺序发言、单次发言版群聊（权限区分，部分仅主持）

**① 现状：⚠️ 部分，且本轮的**核心发现**在这里：这些命令分成两套注册表，pack 建的会议只落在服务侧，而 hand/invite 只在原语侧。**

**② 证据（逐子句）：**
- **两个注册表**：`vibe_v5_meeting` 只调 `kernel.meetings.open`（`packs/v5r/tools.js:545`）⇒ 会议记录进 `kernel/meetings.js` 的服务表；`vibe_vmu_meeting{action:'open'}` 造的是原语会议（`tools/meeting.js:126-145`）。跨表动作只有 4 个（源码注释与 hint 自述：`tools/meeting.js:91-95`、`:80`）：`list`、`speak`、`summary`、`close`（另 `status` `:173-188`、`extendlimit` `:241-253`、`flow/overrideorder` `:365-372` 也打服务表）。
- **单次发言版群聊：✅** 服务会议的 `speak` 可跨注册表调用（`tools/meeting.js:146-158`，回执带 `registry:'service'`）；群聊形态走 `vibe_v5_say`（41 工具之列，见 §16.4 清单）。「每人只一次」无闸——由院士/提示词自觉（规则原文亦未给硬闸）。
- **举手发言：❌ 在服务会议上不可用**：`tools/meeting.js:160` `live().handUp(...)`，`live()`（`:64-85`）只查 `kernel.liveMeeting`；服务 id 落空 ⇒ `VMU_NO_SUCH_OBJECT`，hint 明说「list/speak/summary/close cross registries, but hand addresses the primitive registry only」（`:80`）。服务面无 `handUp`（`grep -n "handUp" kernel/meetings.js` → 0 命中）。
- **邀请发言：❌ 在服务会议上不可用**：`invite`/`invitedspeak` 同样只走原语（`tools/meeting.js:162-163`）；服务面**根本没有 invite 方法**（`grep -n "invit" kernel/meetings.js` 只命中 `:822` 的一句投票权注释）。
- **批量指定成员按顺序发言：⚠️ 顺序机制有、批量入参没有**。顺序/地面：`kernel/meetingmarker.js:322` `FLOW_MODES = ['open','hands','round_robin','call_on']`，语义 `:282-291`，`orderFor` `:391`，`queueGate` `:410-428`；命令面 `flow`/`overrideorder` 打服务记录（`tools/meeting.js:365-372`）。但 `flow` 只接受「模式」，`queue()`（`kernel/meetings.js:684`）一次一个成员 ⇒ **没有「给一串成员并按该顺序发言」的入参**。
- **权限区分（部分仅主持）：⚠️ 部分**：`call_on` 地面下指定发言人只有主席（`meetingmarker.js:410-428`）；`flow`/`overrideorder` 有共用 authority 轨（`meetingmarker.js:430` 起）。但 `hand`/`invite` 在原语面无主持限制（任意成员可调，`tools/meeting.js:160-163`）。

**③ 还缺什么：** ① 服务面补 `handUp`/`invite`/`speakInvited`（或让 pack 开会时同时登记原语会议——两种设计二选一，别两套并行）；② 批量按序入参（如 `queue({members:[a,b,c]})` 或 `flow({mode:'call_on', order:[...]})`）；③「单次发言」上限闸（若要机器保证）。

**④ 该由谁做：** 内核（服务面方法）为主；批量入参内核可做，pack 只透传。

---

## §10 D10 特殊活动：投票板／任务板／群聊式交流（院士为群管、可设权限/发言次数/禁言）

**① 现状：✅ 已实现。** 三个面各自都有真机制与套件。

**② 证据：**
- 投票板（选项 + 最多/最少选几项）：`kernel/ballotbox.js` 规则校验 `:169-182`（`minVotes/allowRevote/maxChoices/minChoices/mode`），默认键 `:129-130`；重开门槛 `vmu.ballot.reopenFloor`（`packs/v5r/settings/defaults.json:61`；实现在 `kernel/ballotbox.js` 的 `reopen`）；pack 面 `vibe_v5_poll_open` `packs/v5r/tools.js:602-632`（主席闸 `:617`，选项 <2 具名拒 `:616`）。
- 任务板（设置/认领/交派）：tasks 面 `create/assign/transition/setDependencies/list`（`packs/v5r/tools.js:139` 注释与 `:1070` 的 action 枚举含 `claim|reassign|assign|transition|complete|reopen|set_dependencies`，带 revision CAS）。
- 群聊管理（群管/权限/发言次数/禁言）：`packs/v5r/settings/defaults.json:29-31`（`vmu.chat.admins:["acad"]`、`speakQuota:0`、`muteDefaultMs:0`）；机制在 `kernel/chat.js`（admins/quota/mute 三族键）。
- 门禁：`tests/vmu-ballotbox.test.mjs`、`tests/vmu-chat.test.mjs`、`tests/vmu-tasks.test.mjs` **套件存在；本轮未跑**（不作为本轮证据）。

**③ 还缺什么：** 无（D10 范围）。保留项：`speakQuota:0`/`muteDefaultMs:0` 是**零机制默认**——「可设」成立，「已设」需要机构声明；`admins:["acad"]` 的 `acad` 是成员 id 约定，roster 由宿主 seam 提供（`packs/v5r/index.js:67` 只有 pack id `v5r`，成员 id 不在 pack 源里），真机需确认该 id 与 roster 一致。

**④ 该由谁做：** pack（把制度值写进 defaults）；内核无缺。

---

## §11 D11 辩论类型会议有额外字段：辩论的对象或对象文件引用

**① 现状：✅ 已实现。**

**② 证据：**
- 承载：`open({subject})` `kernel/meetings.js:418`；`summary()` `:1323-1346` 与 `meetingView()` `:1347-1360` 都回 `subject`（`null` 归一也在）；`snapshot()` `:1406-1419` 随会议对象过重启。
- pack 面：`subject` 与 `target` 都是活参数（`packs/v5r/tools.js:529`），辩论类型缺 subject ⇒ 具名拒（`:530-533`），透传 `:545-546`。
- 「声明了参数≠被消费」这条历史缺陷已修：`target` 现在是 `subject` 的别名（同一个 `args.target` 读取点 `:529`），不再是死参数。
- 门禁（本轮实跑）：`tests/vmu-meeting-types.test.mjs` 65/0 exit 0（含「非字符串 subject 具名拒」「三读面回读」断言）。

**③ 还缺什么：** 无。

**④ 该由谁做：** —

---

## §12 D12 辩论/结题表决人数下限 ≥ min(用户设置, 院士+常驻研究员数)

**① 现状：⚠️ 部分。** 有 quorum 闸且可失败，但**口径不是规则要求的那条 min**，且「常驻研究员」这个集合在内核与 pack 都不存在。

**② 证据：**
- `quorumOf` `kernel/meetings.js:284-300`：`needUncapped = max(quorumMin, ceil(quorumRatio × roster.length))`，`need = quorumCap > 0 ? min(needUncapped, quorumCap, present.size) : needUncapped`（`:291-293`）；`quorumCap` 读取 `:118-125`；读面 `quorum()` `:1286`。
- 规则要的 `min(用户设置, 院士+常驻研究员数)`：`grep -rn "resident|常驻" kernel/meetings.js packs/v5r/settings/defaults.json` → **0 命中**；也没有任何地方把「用户设置数」与「席位人数」取 min。
- 另：`packs/v5r/meeting-procedures.js:101-107` 已把这条登记为缺口 `min-voters`（owner 写的是「kernel 透传 minEligible + pack 计算下限」），与本轮读码一致。

**③ 还缺什么：** ① pack 声明「常驻/院士席位集合」；② 内核 quorum 口径接一个 `min(userSetting, seatsCount)` 的键（或 pack 直接算出下限并透传 `minEligible`）；③ 辩论/结题类型专用下限（按类型分派，见 D7）。

**④ 该由谁做：** pack 计算 + 内核透传（与缺口登记一致）。

---

## §13 D13 lean 已通过但概率非 1 的命题：辩论聚焦 lean 代码中命题/定义的描述符合性

**① 现状：❌ 缺口。** 无闸，也没有提示词依据（比台账原判更差：台账写「只在语料/提示词层面」，实际提示词里也没有这句）。

**② 证据：**
- `grep -rn "描述符合|符合性" vibe-math-vmu/packs/v5r/prompts/*.js` → **0 命中**。
- 提示词里与辩论相关的只有「辩论/验证的开启与辩论对象的选择由院士决定」与「只有含正式证明的命题能被作为辩论命题」（`packs/v5r/prompts/v5r-blocks-a.js:192-195`），没有「lean 通过 ⇒ 焦点转为描述符合性」。
- 内核侧无 lean 状态参与会议/辩论的记录（`grep -rn "lean" kernel/meetings.js` 无命中）。

**③ 还缺什么：** ① 一个「命题卡已 lean 通过」的可读状态（若本来有，需指到 `file:line`——本轮没找到）；② 类型/骨架里对 debate 的焦点分支（描述符合性），以及 P=1 的判定路径（与 D15 的裁定闭环相连）。

**④ 该由谁做：** pack/prompt（文本与分支）＋ 内核（若需 lean 状态的 seam）。

---

## §14 D14 辩论推荐流程（先各自单次发言给概率+理由 → 轮流/举手/邀请 → 轮数院士定）

**① 现状：⚠️ 部分。** 四步骨架齐；第②步的工具在活路径上不可达；第④步聚合未实现。

**② 证据：**
- 四步：`packs/v5r/meeting-procedures.js:48-81`；第①步 `:49-55`（`speak`/`vibe_v5_say`，`status:'supported'`）、第②步 `:56-62`（`hand`/`invite`/`speak`）、第③步 `:63-72`（`ballot` + `vibe_v5_verdict`）、第④步 `:73-80`（`status:'pending'`，`tools: []`）。
- 「轮数由院士定」：骨架文本 `:59` + 框架无默认轮数上限（无计数拒）。
- 第②步可达性：见 D9 —— `hand`/`invite` 只走原语注册表（`tools/meeting.js:160-163`），pack 建的是服务会议（`packs/v5r/tools.js:545`）⇒ 真机按骨架第②步调用会得到 `VMU_NO_SUCH_OBJECT`。
- 第④步：`pendingReason` `meeting-procedures.js:79` + 缺口登记 `:95-100`（`verdict-aggregation`）；代码侧确认 `kernel/ballot.js:34-49`（`estimate` 只校验范围）、`:549`（`byKind` 只计数）。
- 门禁（本轮实跑）：`tests/vmu-meeting-types.test.mjs` 65/0 exit 0（含 `pendingSteps` 上报断言）。

**③ 还缺什么：** ① 第②步工具在服务会议可用（D9 修则 D14 的第②步自然通）；② 第④步聚合 + 通知（D15）。

**④ 该由谁做：** 内核（服务面 hand/invite）；pack（聚合规则，制度政策）＋ mailbox（通知）。

---

## §15 D15 辩论结束机制：收最终裁决；一致取该值否则均值；通知命题卡持有者改概率

**① 现状：❌ 缺口（收票面有，裁定闭环没有）。**

**② 证据：**
- 收票面：`packs/v5r/tools.js:694-720` `vibe_v5_verdict` → `ballot.cast(member, v, { kind: v===1||v===0 ? 'decisive' : 'estimate' })`（`:714-716`）。
- 聚合：`kernel/ballot.js:34-49` 只定义 `estimate` 的合法性与范围；`:549` 的 `byKind` 只把 `estimate` 计数。`grep -rn "平均" vibe-math-vmu/kernel/*.js vibe-math-vmu/packs/v5r/*.js` 只命中 `packs/v5r/meeting-procedures.js:42/:76/:79/:96/:97` 的**文案**，代码里 0 处计算均值或「一致⇒该值」。
- 通知持有者：无任何实现（`vibe_v5_message` 能发消息，但没有「谁持有该命题卡」的解析，也没有把票变结论再通知的路径）；pack 已登记缺口 `packs/v5r/meeting-procedures.js:95-100`。
- 门禁：无（缺口无套件）。
- **in-flight，不计入判定**（见 §0.1 漂移说明）：`vibe-math-vmu/kernel/meetingverdict.js`（325 行，未跟踪、未挂载）里已有 `aggregateVerdicts({verdicts})`（`:78`）与 `rulePropositionProbability({verdicts, propositionId, owner, at, template})`（`:189`）、`createMeetingVerdict({clock,log,bus,send})`（`:253`），`DEFAULT_RULING_TEMPLATE`/`TEMPLATE_FIELDS`（`:167-173`）已覆盖「一致⇒该值/否则均值」与通知模板。**但**：① `grep -rn "meetingverdict"` 在其他文件 0 命中（未进 `kernel/index.js`，无工具/面调用）；② 无套件断言。⇒ 若该 lane 提交并挂载，D15 可升为 ⚠️/✅，届时需用当前树复核，本行判定不预先给分。

**③ 还缺什么：** ① 聚合命令（一致⇒该值 / 否则均值，需声明票种 `estimate` 的参与规则）；② 命题卡持有者解析（卡 id → 成员）；③ 改概率的写入 + 通知（mailbox 或 chat）+ 回执具名「改了哪张卡、从多少到多少」。

**④ 该由谁做：** pack（聚合与解析是机构政策）＋ mailbox（通知）＋ 内核（若需 `vibe_v5_record_proposition` 的 P 写入面，它已存在）。

---

## §16 五条特别复核（lead 指定，逐条结论）

### §16.1 D1「预约时间」与「等待阶段」是否有任何承载？

**结论：两者都没有承载。** 命令输出（当前树）：
```
$ grep -rn "schedule" vibe-math-vmu/settings/schema.js vibe-math-vmu/kernel/meetings.js
vibe-math-vmu/settings/schema.js:576: … // batch-1 slice 10 (scheduler). INTEGRATOR RULING: `vmu.schedule.*` is the canonical family …
…（:579-597 全部是 vmu.schedule.triggerVia / maxPending / timeSource / actionsAllowed / triggers / overdueGraceMs /
    coalesceMissed / autoArm / maxRecurrences / defaultTimezone / recurrenceEnabled / dstPolicy / minIntervalMs / maxHorizonMs）
$ grep -c "vmu.meetings.schedule" vibe-math-vmu/settings/schema.js   → 0
$ grep -c "schedule" vibe-math-vmu/kernel/meetings.js                → 0
```
`vmu.schedule.*` 是**调度器家族**（docs/08 §12.4 的 schedule 面），与「会议预约」不是同一件事；会议侧 0 键 0 读取。
等待阶段：无 `waiting` 状态；`grep -n "wait" kernel/meetings.js` 仅 `:1357` 文案。可表达的近似物只有 `attend():515`（增量出席）、`quorum():1286`（未达可见）、`lapse/lapseDue`（`:1470` 起导出，F28 有界兜底）——**没有「进入等待 → 到点看人齐 → 院士决定等/散」这个状态机**。

### §16.2 D2 三条是否真可执行；`extendlimit` 从 `vibe_vmu_meeting` 是否可达？

**结论：都真可执行；`extendlimit` 可达但不可发现。**
- 关闭：`close()` `kernel/meetings.js:1137` + 主席轨 `:1144`（`closeRequiresChair`）。
- 延长：`extendWall()` `:1239`，天花板 `:1271-1274`，`speak()` 真消费 `:623-631`。
- 主持：`transferChair:876`/`interrupt:659`/`recess:904`/`queue:684`/`flow`(meetingmarker `:322`)。
- `extendlimit`：enum `tools/meeting.js:26`，实现 `:241-253`（服务表 `svc.extendWall`）；pack 会议是服务记录（`packs/v5r/tools.js:545`）⇒ 活路径**确实可达**；测试有对应断言（`vmu-meeting-types` 末条「the kernel face really offers extendlimit」，本轮 65/0）。
- **缺陷（可发现性）**：① `live()` 的跨表 hint 只列 `list/speak/summary/close`（`tools/meeting.js:80`），不含 `extendlimit`；② pack 回执的指路清单写的是 `extend`（`packs/v5r/tools.js:555`），而服务会议的 `extend` 打到原语 ⇒ 会得到「extend addresses the primitive registry only」。**一个想延长会议墙钟的代理，按现有两处提示会走错门。**

### §16.3 D3 `type`/`subject` 能否从各读面读回；「标题」有没有独立字段？

**结论：`type`/`subject` 三读面全通；「标题」没有独立字段。**
- `summary()` `kernel/meetings.js:1323-1346`：返回体含 `type`、`subject`、`kind`、`chair`、`secretary`、`motions`。
- `meetingView()` `:1347-1360`：含 `type`、`subject`、`state`、`loop/note`（自述这是会议自身的 ask/answer 循环，不是 `vibe_vmu_turn` 的循环）。
- `status()` `:1361-1400`：**服务级自述**（wired/planned keys、liveMeetings、lapsedMeetings、tier/allowLight、counters、refusals），**不含逐会 `type/subject`**——这不是缺口，逐会读面是 `summary/meetingView`。
- `snapshot()` `:1406-1419`：`data:{live, archive, receipts}` 是整个会议对象的 Map/Set 感知序列化 ⇒ `type/subject`（以及 `wallLimitMs/openedBy/extendedMs`）过重启保住；`restore()` `:1423-1470` 冲突/版本/面名都具名拒。
- **标题**：`grep -n "title" vibe-math-vmu/kernel/meetings.js` → **0 行**；pack 的 `title` 是任务参数（`packs/v5r/tools.js:280` `tasks.create({ title: … })`），不是会议标题。⇒ 会议无独立标题字段，`materials` 兼作议程/标题。

### §16.4 D5/D14 骨架每一步是否只引用真实存在的工具名（41 工具 × action enum 逐一核对）

**结论：没有不存在的名字；但有 4 个名字在活路径上不可达/语义不同。**
- pack 41 个工具名（`grep "^\s*name: 'vibe_" packs/v5r/tools.js`，去重排序）：
  `assign configure feedback fire hire inbox lean_archive lean_job lean_lib lean_read lean_run meeting message motion nudge overview paper pause poll_close poll_open poll_vote prioritize read_library record_method record_progress record_proposition record_subproblem report resume say second set start stop task_create task_get task_list task_update tool_help verdict wait`（前缀均为 `vibe_v5_`，共 41）。
- 骨架引用：`vibe_vmu_meeting{speak|hand|invite|ballot|flow}`（内核工具，action 在 `tools/meeting.js:26` 的 43 项 enum 中：`speak/hand/invite/ballot/flow` 全部存在）、`vibe_v5_say`（41 中有）、`vibe_v5_verdict`（41 中有，实现 `packs/v5r/tools.js:694-720`）、`vibe_v5_message`（41 中有）。
- **不存在名字：0 个。** 但两个折扣：① `hand`/`invite` 在 pack 建的服务会议上拒（§9）；② 骨架第①步说「**同时**独立发表」，机制上只有顺序 `speak`（无并发/屏障语义）——「同时」是流程建议的说法，不是机器保证；③ 第④步 `tools: []` 是**有意留空**并 `pendingSteps` 具名，不算假名字。

### §16.5 D9 在 **pack 开的 service 会议** 上，邀请发言/批量按序/单次发言版群聊是否可用？

**结论：单次发言版群聊 ✅；邀请发言 ❌；批量按序 ⚠️（顺序机制有、批量入参无）。**
- **service vs primitive 解析**：`tools/meeting.js:64-85` `live()` 只查 `kernel.liveMeeting`（原语）；`:96-114` `svcOf()/serviceHas()` 是跨表判断器；跨表动作白名单写在 hint 里（`:80`）＝`list/speak/summary/close`（另有 `status` `:173-188`、`extendlimit` `:241-253`、`flow/overrideorder` `:365-372`）。
- `createOrderControls` 提供什么（`kernel/meetingmarker.js:350`）：`{ flow, overrideOrder, effective, orderFor, floorOf, queueGate, view, ORDER_KEY }`——**是「谁先说话」的顺序/地面机制**（`FLOW_MODES` `:322`），不是「批量让一串人依次发言」的命令；`queue()` 一次一个成员（`kernel/meetings.js:684`），`call_on` 下只有主席能指定（`meetingmarker.js:410-428`）。
- 服务面缺失清单（`grep` 验证）：`handUp`/`invite`/`speakInvited`/`endDebate` 在 `kernel/meetings.js` **0 命中**；`invit` 只命中 `:822` 的投票权注释。

---

## §17 「声明未生效 / 无消费者参数」专项（本轮核查结果）

本轮逐条查了台账最容易被重复误报的四类，**结论：没有新的「声明即算生效」项**：

| 声明 | 是否真被消费 | 证据 |
|---|---|---|
| `vmu.meetings.typeCatalog` | ✅ 真读、真拒 | `kernel/meetings.js:424-428` + `mark(enforced,…)` |
| `vmu.meetings.conveneRequiresChair` | ✅ 真拒 | `kernel/meetings.js:442-453` |
| `vmu.meetings.closeRequiresChair` | ✅ 真拒 | `kernel/meetings.js:1144` |
| `vibe_v5_meeting` 的 `target` | ✅ 活别名 → `subject` | `packs/v5r/tools.js:529`、`545-546` |
| `vmu.meetings.extendCeilingMs` | ✅ 真拒且 `speak()` 消费新界 | `kernel/meetings.js:1271-1274`、`:623-631` |
| `vmu.ballot.reopenFloor` | ✅（本轮未跑套件，仅读码）| `kernel/ballotbox.js` reopen 路径 + `defaults.json:61` |

**唯一的新缺陷不是「没消费者」而是「消费者找不到门」**：`extendlimit`（`tools/meeting.js:241-253`）在两处指路文案里都没出现（`tools/meeting.js:80`、`packs/v5r/tools.js:555`）。

---

## §18 剩余缺口表（按影响排序，只保留当前树上仍成立的）

| # | 缺口 | 影响 | 证据 | 该谁做 |
|---|---|---|---|---|
| 1 | **D1 预约时间 + 等待阶段** | 规则第一句不可执行：会议只能「现在开」，人未齐既不能预约也不能等 | `grep "schedule" kernel/meetings.js` → 0；无 `waiting` 状态（`:1357` 仅文案） | 内核（状态机+键）＋pack（制度值） |
| 2 | **D15 辩论裁定闭环**（聚合 + 通知持有者改概率） | 辩论类型「结束了也出不了结论」，规则最实质的一步缺失；另有并行 lane 的 `kernel/meetingverdict.js` 未挂载 in-flight（不计入判定） | `ballot.js:34-49/:549` 只计数；`grep 平均` 在代码 0 处；缺口登记 `meeting-procedures.js:95-100` | pack（聚合规则）＋mailbox（通知） |
| 3 | **D9 服务会议的 hand/invite 不可达** | 骨架第②步（轮流/举手/邀请）在真机路径上直接拒 ⇒ D14 一并受损 | `tools/meeting.js:160-163` 只走 `live()`；`:80` hint；服务面 0 命中 | 内核（服务面补方法，或 pack 双登记） |
| 4 | **D6 连续多会议** | 「一次性设置连续展开的多个会议」无载体 | `open()` `:418` 无批量参；序列名 0 命中 | 内核＋pack |
| 5 | **D13 lean 通过 ⇒ 辩论聚焦描述符合性** | 无闸、提示词也无此句（比台账原判更差） | `grep 描述符合\|符合性 prompts/*.js` → 0 | pack/prompt（＋内核 lean 状态 seam） |
| 6 | **D7 类型不改变成员命令** | 类型只剩「目录 + 骨架 + 白名单」，不改变谁能用什么 | 唯一 type 分支 `:1186` 的 `committee` 不在活路径类型集（`defaults.json:57`） | pack（分派表） |
| 7 | **D12 quorum 口径非规则 min** | 表决下限可能与规则不一致（min(用户设置, 院士+常驻)） | `quorumOf` `:284-300`；无「常驻」概念（0 命中） | pack＋内核（透传） |
| 8 | **D3 会议标题无独立字段** | 「设标题」只能借 `materials`，且 `subject` 已被辩论对象占用 | `grep title kernel/meetings.js` → 0 | 内核（字段）＋pack（参数） |
| 9 | **D4 主席专属动作无 actor 门槛** | 中断/休会/警告/驱逐/移席任何成员可做（制度若要求则不符） | `interrupt:659`、`recess:907-912`、`warn:951`、`expel:984`、`transferChair:876` 只验成员 | 内核（轨）＋pack（声明） |
| 10 | **D9 批量按序入参缺失** | 「批量指定成员按顺序发言」只能一次一个人 | `flow` 只接受模式（`tools/meeting.js:365-372`）；`queue:684` 单人 | 内核/pack |
| 11 | **D2/D9 指路文案不含 `extendlimit`** | 延长会议墙钟会走错门（`extend` 是发言延长） | `tools/meeting.js:80`、`packs/v5r/tools.js:555` | 内核（文案，零机制） |
| 12 | **D14 第①步「同时」无机制** | 骨架说「同时独立发表」，机器只有顺序发言 | `meeting-procedures.js:52` vs `speak` 顺序 | pack/prompt（措辞）或内核（屏障，成本高，建议只改措辞） |

**未判定项（缺证据，不猜）：** 无。本轮所有 15 条都给出了现状与 `file:line` 依据；仅 D10 的 `chat.admins:["acad"]` 与真实 roster 的一致性属真机问题（`packs/v5r/index.js:67` 只有 pack id，成员 id 由宿主 seam 提供），不列为判定依据。
