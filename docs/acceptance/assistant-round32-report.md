# Round 32 · `task-155`（**只做 B：docs 值域跟改**）—— A（真机升档）**延后**

> 负责人：`vmu-assistant2`｜交付：`docs/08-primitives-meeting-ballot-workflow.md`（§19.1 八行 + 一处 R32 更正）、本报告。
> ★★ **真机复核延后，原因＝在飞写者污染读数（我 R31 的发现）。** 本轮树又在飞：`package.json`／`scripts/generate-wired-schema.mjs`／`vibe-math-vmu/host.js` **未提交** ＋ 未跟踪的 `tests/vmu-receipt-truncation.test.mjs` ⇒ 真机会跑在**未提交中途态**上，正是 R31 我实测到"同一分钟读数翻红翻绿"的那种情形 ⇒ **等它们停、Lead 提交完（树稳定）再跑**（Lead 已同意，且会备好 overlay／驱动／哈希核验）。
> 硬约束：**未跑真机**／未跑全量／未 `regen-all`／未 git 写／**未改代码·测试**；临时文件全在 `D:\_tmp`。

---

## 0. 结论（四句）
1. **`docs/04` 这一半【无需我改】**：HEAD **`1f0fb1d`**（R31 提交）里那 9 行的类型已从 `string` 变成 **`enum`＋正确域**，读者列也已指向 `kernel/meetingdomain.js` ✓ —— **是 R31 那次提交做的，不是我**（我 R31 只动了 §6.1）。我**逐键核过**（§1）⇒ **0 处改动，且不是"没查"**。
2. **`docs/08 §19.1` 这一半【已按 R17 `orderMode` 先例改完】**：**8 行**的"默认/取值域"单元格换成**实测值**（逐字取自 `kernel/meetingdomain.js`，与 `schema.js` 逐元素相同），**计划值保留在同行说明**（§2）。
3. **`minutesDetail` 有个真实分歧，我按证据更正、并把它具名上报**：docs/08 原写"`vmu.meetings.minutesDetail` **作废**"——**不成立**（它已被声明且真被读）；**两个名字是两个不同的旋钮**（§3）。
4. **★ 独立复核了 R17 先例的那条隐含前提**：我改了 8 行的"取值域/默认"单元格，**`vmu-planned-settings` 仍 ALL GREEN（planned=111, docs=28, 39/0）** ⇒ **没有任何生成器解析这些单元格**（计划键计数未动）✓。

## 1. 逐键核验：9 键在代码里的**确切值域**（引用前先落一行）
| 键 | `type` | `domain`（读取侧＝唯一真相） | 默认 | `schema.js` 行 | `meetingdomain.js` 行 |
|---|---|---|---|---|---|
| `vmu.meetings.attendanceMode` | enum | `roster`／`signin`／`quorum-only` | `roster` | **:1058** | :21 |
| `vmu.meetings.quorumLossPolicy` | enum | `suspend`／`continue`／`recess` | `suspend` | **:1059** | :22 |
| `vmu.meetings.budgetOnExceed` | enum | `refuse`／`warn`／`extend` | `refuse` | **:1060** | :23 |
| `vmu.meetings.leaveEarlyPolicy` | enum | `allow`／`note`／`deny` | `allow` | **:1061** | :24 |
| `vmu.meetings.minutesDetail` | enum | `brief`／`full` | `brief` | **:1062** | :25 |
| `vmu.meetings.appealScope` | enum | `all`／`procedural`／`none` | `all` | **:1063** | :26 |
| `vmu.meetings.confidentialityDefault` | enum | `public`／`internal`／`restricted` | `internal` | **:1064** | :28 |
| `vmu.meetings.confidentialityQuotePolicy` | enum | `allow`／`redact`／`deny` | `allow` | **:1065** | :29 |
| `vmu.meetings.wakeFailurePolicy` | enum | `refuse`／`skip`／`retry` | `refuse` | **:1066** | :30 |
★ **域的确切成员来自【读取侧那一份】**（`kernel/meetingdomain.js` 的 `MEETING_DOMAINS[key].values`），**没有另抄一份、没有凭记忆写**；该文件自陈其不变量＝"`tests/vmu-meeting-domain.test.mjs` 断言它与 `settings/schema.js` 的 `domain` **逐元素相等**" ✓（该断言把 11 个键一起钉住，含 `tier`／`leaveApprover`）。

## 2. `docs/08 §19.1` 改了什么（**逐键、按 `orderMode` 先例**）
**先例原文**（同一张表，L882，R17/R14 立的）：`| vmu.meetings.orderMode | enum | `fifo` | `fifo｜round-robin｜chair｜random` | … | 发言顺序模式 ★ **R14 起以实测值域为准**（本行原计划的 `hands｜round-robin｜seat｜weighted｜unspoken-first` **从未实现**…）|`
⇒ 我按同一形状改了 **8 行**（单元格＝实测值；计划值留在说明里）：
| 行 | 原（计划）默认／域 | 改后（实测）默认／域 |
|---|---|---|
| `quorumLossPolicy` | `undecided` / `recess｜defer｜lower｜undecided` | **`suspend` / `suspend｜continue｜recess`** |
| `attendanceMode` | `auto` / `manual｜auto` | **`roster` / `roster｜signin｜quorum-only`** |
| `leaveEarlyPolicy` | `excused` / `absent｜excused` | **`allow` / `allow｜note｜deny`** |
| `wakeFailurePolicy` | `unreached` / `unreached｜absent` | **`refuse` / `refuse｜skip｜retry`** |
| `budgetOnExceed` | `broadcast` / `broadcast｜refuse｜pause` | **`refuse` / `refuse｜warn｜extend`** |
| `confidentialityDefault` | `open` / `open｜closed｜sealed` | **`internal` / `public｜internal｜restricted`** |
| `confidentialityQuotePolicy` | `fold` / `allow｜fold｜deny` | **`allow` / `allow｜redact｜deny`** |
| `appealScope` | `procedural` / `procedural｜all｜off` | **`all` / `all｜procedural｜none`** |
每行说明里都写明：**R32 起以实测值域为准**、**原计划（值＋默认）从未实现**、**实测值域＝`kernel/meetingdomain.js` 且与 `settings/schema.js:<行>` 逐元素相同**、**实测默认**＝上表右列 ✅（★ 原计划值**没有删除**，留在说明里 —— 与 `orderMode` 先例同形）。
★ **没动的**：类型格（本来就是 `enum`）、谁可改、热改、以及**其它 30+ 行**（逐键改、不整卷替换）✓。

## 3. ★ `minutesDetail`：一处**真实的 docs↔code 分歧**（我按证据更正，并具名上报）
**原句**（docs/08 L911，`vmu.minutes.detail` 行）：*"…原拟名 `vmu.meetings.minutesDetail` **作废** ✗ —— 独立批评者指出'同一旋钮两个名字' ✗，此处按**已接线的那一个**统一 ✓"*
**实测（读码）**：★ **"作废"不再成立** ——
| 键 | 声明 | 真读它的地方 | 域 |
|---|---|---|---|
| `vmu.minutes.detail` | `schema.js:251` `enum`，域 `brief｜normal｜full`，默认 `normal` | `kernel/minutes.js:28`（`detail: 'vmu.minutes.detail'`） | 三值 |
| `vmu.meetings.minutesDetail` | `schema.js:1062` `enum`，域 `brief｜full`，默认 `brief` | `kernel/meetings.js:59/87/925`（`K.minutesDetail`）；域表 `kernel/meetingdomain.js:25` | 两值 |
⇒ **两个名字是两个不同的旋钮**（不是同一旋钮的两个名）。**我做的更正**：在原句后**追加**一条 **R32 更正（含上述四条证据＋行号）**，并写明"**两者的接线状态以 `docs/04 §11` 的'接线'列为准**（该列由设置表维护），**不要按本行的历史叙述推断**" —— **原句保留为历史**，不删除 ✓。
★ **留给 Lead 的两点**（我**没有**替它裁）：① 两个旋钮**是否应合并**（代码决定，不属我写范围）；② `docs/04 §11` 里 `vmu.meetings.minutesDetail` 的"接线"列标着 `⚠️ 未接线（改了不会有行为变化）`，而 `kernel/meetings.js:925` **读** `K.minutesDetail` —— **这两者是否同一口径**请由维护该列的管线裁定（我**未改**该列）。

## 4. ★ 我顺带**独立复核**了 R17 先例的前提（这次是实测，不是引述）
R17 先例声称"计划表**无任何生成器解析'值域'单元格**"。我这轮**动了 8 行的取值域＋默认单元格**后：`vmu-planned-settings` ＝ **ALL GREEN（planned=111, docs=28, passed=39, failed=0）** ⇒ **计划键计数与集合都没变** ⇒ **该前提成立** ✓（这也意味着：**以后改这类单元格不会动到生成链**）。

## 5. ★ R31 归因的**再确认**（同一现象、反向验证）
R31 我报的 `audit-vmu-docs` 红（真仓 exit=1，要求重生成设置表）被我归因为"**写者未提交的中途态**"（隔离实验：纯 `c12556e` 副本 99/0、＋我的两卷仍 99/0）。**现在 HEAD 含 R31（`1f0fb1d`）**，同一门在真仓 **99/0 PASS** ⇒ **与该归因一致** ✓（不是我的文本、也不是已提交代码）。

## 6. 门禁读数（★ 2026-10-15 **21:12:54** 同一次运行；绑定 HEAD `1f0fb1d` ＋ 我的 docs diff）
| 门 | 读数 |
|---|---|
| `scripts/check-docs.mjs` | **PASS** |
| `tests/audit-doc-index.test.mjs` | **5 / 0** |
| `tests/audit-vmu-docs.test.mjs` | **99 / 0** |
| `tests/audit-doc-vs-code-tables.test.mjs` | **17 / 0** |
| `tests/audit-claim-traceability.test.mjs` | **5 / 0** |
| `tests/vmu-planned-settings.test.mjs` | **ALL GREEN（planned=111, docs=28, 39/0）** |
★ **调用形纪律**：新增文字里服务方法一律调用形（`setSettingsValue(...)` 等），键名按原样；**未裸写三段点号名**。

## 7. 改前/改后哈希（★ BEFORE 用 `git cat-file blob HEAD:` **二进制**取）
| 卷 | BEFORE（= HEAD `1f0fb1d`） | AFTER（工作树） | 改动 |
|---|---|---|---|
| `docs/08-primitives-meeting-ballot-workflow.md` | sha256 **`93E519816D6D41A9`**（224666 B） | sha256 **`EE4839C3CF152533`**（227253 B） | §19.1 **8 行**（默认＋取值域→实测值；计划值留说明）＋ L911 **R32 更正**（追加，不删历史） |
| `docs/04-settings.md` | — | — | ★ **0 处改动**：HEAD 已是 `enum`＋正确域＋读者 `kernel/meetingdomain.js`（§1 逐键核过） |
| `docs/02-architecture.md` | — | — | R31 已改（本轮未动） |

## 8. 未做 / 遗留（具名）
- ★★ **A（真机升档）本轮未做** —— 原因是**在飞写者污染读数**（我 R31 的发现；当前 `package.json`／`generate-wired-schema.mjs`／`host.js` 未提交 ＋ 未跟踪 `tests/vmu-receipt-truncation.test.mjs`）⇒ **`task-155` 保持 `in_progress`**，等 Lead 叫；届时按 R29 两臂配方＋**跑前/跑后核 payload blob**＋多帧解码读五项（三执行点／`settingsRejected`＋`settingsUnenforced`／`promptSection`／`null` 非域外值／D1 映射）；
- **未跑全量／未 `regen-all`／未 git 写／未改代码·测试**；
- ★ **遗留 1**：`minutesDetail` 两个旋钮是否合并（代码决定）＋ `docs/04 §11` 的"接线"列与 `meetings.js:925` 的口径是否一致 —— **两条都请 Lead 裁**，我未擅自改；
- ★ **遗留 2**：`docs/08 §19.1` 里**其它**仍是"计划值域"的行（本轮未在 B 的 9 键范围内）**未被处理** —— 若 Lead 要把"计划域 vs 实测域"的做法推广到整张表，请另派（那会是一次逐行核 40+ 行的活）。

---

# 9. ★ Lead 两条裁定的落地（本轮追加，范围极小）

## 9.1 ① `docs/04 §11` 那一行已改（**判据＋证据一并写入**）
- **改前（接线格）**：`⚠️ 未接线（改了不会有行为变化）`
- **改后（接线格）**：**`✅ 已接线（消费者 kernel/meetings.js:925）`**
- **说明格追加**：*判据＝"有无消费者"；证据＝`kernel/meetings.js:925` 读 `K.minutesDetail`（`K` 由设置构出；同一键还在 `:59` 键表与 `:87` 默认表、并由 `kernel/meetingmarker.js:232` 镜像），且它是 R31 那 11 个键之一（读取侧有具名拒＋域表 `kernel/meetingdomain.js:25`）⇒ **它已接线*** ✓（**不是只改格子**）

## 9.2 ② 该列普查（**范围 ＋ 残差**口径）
- **范围**：`docs/04 §11` **全部 1226 行**（解析器＝以 `| \`vmu.*\` |` 开头的行）；其中"接线"格含 `未接线` 的 **119 行**（改前 120，**差的就是我刚裁的那一行**）。★ 口径提示：裸 grep `⚠️ 未接线` 得 123 处 ⇒ **按"行"算是 119 行**，两个数字差在"同串出现在别处"；我采**按行**口径。
- **残差 A ＝ 16 行**（判据＝"该键**字面量出现在运行时源码**里"，**不加**生成器的"声明行"过滤）：
  `vmu.turn.objective`／`vmu.turn.selfCheck`／`vmu.turn.protocolPath`／`vmu.turn.feedback`／`vmu.pointer.propagation`／`vmu.turn.instituteName`／`vmu.meetings.budgetOnExceed`／`vmu.ballot.freezeMeetingLinked`／`vmu.ballot.freezeMode`／`vmu.ballot.reopenInitiatorScope`／`vmu.ballot.reopenSameMeetingOnly`／`vmu.math.network`／`vmu.math.proof`／`vmu.paper.retentionMs`／`vmu.teaching.blindMappingRetentionMs`／`vmu.teaching.maxUnits`
  ★ **这 16 行未必都错**：其字面量多出现在"声明样"位置（数组元素／对象键），"未接线"**可能成立**；但它们**值得人眼复核**，我**没有**逐行判定。
- **残差 B ＝ 1 行**（字面量**连生成器自己的"声明行"过滤都通过**、行仍标未接线）⇒ **`vmu.turn.selfCheck`**（载体格＝`packs/v5r/middleware/prompt-switches.js`）⇒ **本轮最硬的一处不符**。
- ★ **我【没核】的部分（照实写）**：**"靠派生名消费"这一类，我的机械判据看不见**（如 `K.minutesDetail`）⇒ 这一类我**只逐一手核过两行**：9.1 那行（已裁）与 **`vmu.meetings.budgetOnExceed`**（同形：`K.budgetOnExceed` 在 `kernel/meetingmarker.js:162/163/227`）；**其余凡属此类者，一律【没核】**。
- ★ 按裁定：**除 9.1 那一行外，我一行都没改** ✓。

## 9.3 ★★ 这次手改的**直接后果（必须上报）**：`audit-vmu-docs` 变红
| 门 | 读数（2026-10-15 **21:20:35**） |
|---|---|
| `audit-vmu-docs` | **exit=1**，末行提示 **`run: node scripts/generate-vmu-settings-table.mjs --write`** |
| 其余五门 | `check-docs` **PASS**／`audit-doc-index` **5/0**／`audit-doc-vs-code-tables` **17/0**／`audit-claim-traceability` **5/0**／`vmu-planned-settings` **ALL GREEN（111/28, 39/0）** |
**原因（已定位）**：`docs/04 §11` 的**表体是生成产物**（`scripts/generate-vmu-settings-table.mjs` 只认表头行、**整段替换**表体），而 `audit-vmu-docs` 跑的正是它的 `--check` ⇒ **手改格子 ⇒ 与生成产物不一致 ⇒ 红**。
**两条出路（请裁；`scripts/**` 不在我写范围，我未碰）**：① **保留**更正格 ⇒ 须在**生成器判据**上修（把"派生名消费"纳入判据，并定夺 16 行残差／`vmu.turn.selfCheck`）—— 修好前该门持续红；② **回退**我这一格 ⇒ 门回绿但**表里继续错**。
★ **我的建议**：**先别回退**（错的是表，不是门），把"判据修正＋残差"并成一单派给生成器写者；要我回退说一句即可。

## 9.4 哈希（★ BEFORE ＝ HEAD `1f0fb1d` 的字节，`git cat-file blob` **二进制**取）
| 卷 | BEFORE | AFTER | 本轮改动 |
|---|---|---|---|
| `docs/04-settings.md` | **`BDFBDD89C220196A`**（290538 B） | **`55895EFC613731E9`**（291226 B） | §11 `vmu.meetings.minutesDetail` **一行**（接线格＋说明格） |
| `docs/08-…workflow.md` | **`93E519816D6D41A9`**（224666 B） | **`EE4839C3CF152533`**（227253 B） | §19.1 八行 ＋ L911 R32 更正（**本轮未再动**，照 ③ 保持） |
★ 在飞状态（与 ④ 的延后理由一致）：HEAD 仍 `1f0fb1d`；未提交 `package.json`／`scripts/generate-wired-schema.mjs`／`host.js` ＋ 未跟踪 `tests/generate-wired-schema-fallback.test.mjs` ⇒ **真机那半继续延后** ✓。

---

# 10. ★ 追加（`vmu-pack2` 转来的 docs 活，R32 裁定 (b)）：**回执省略的"我们这侧 vs 宿主那侧"已落 `docs/21 §20.7`**

**为什么归我**：`docs/**` 不在 pack2 写范围（它本轮未碰、也不会碰）⇒ 由我落。
**落了什么**（`docs/21-observability-and-operations.md` 新增 **§20.7**）：
1. **事实（宿主那侧）**：宿主渲染 tool result 时**往我们序列化【之后】的 JSON 文本中间**插 `\n\n[...]\n\n` —— **我 R29 的真机逐字证据**：位置 **24846**（两臂皆然，`…"source":"default"` + `\n\n[...]\n\n` + `":744,…`）⇒ **发生在我们序列化之后** ✓；★ 并**明确写下"`24846` 是一次测量、不是契约常量"**（可作证据、不可当保证）✓。
2. **边界定性**：**宿主边界** —— 我们**看不到、也不声称能消除**（与 `systemPrompt` 同形）；★ **与我们自己那侧的省略分开写、不可混**（并引 `host.js:953` 原话 `hostElision:'possible'` is reported SEPARATELY, never conflated）✓；口径一句：**"回执可能被宿主进一步省略；我们这侧只能保证【我们自己省略时会自述】"** ✓。
3. **我们这侧现在能保证的三条**（实现 `host.js:975 boundedToolResult()`；契约注释 `:964-974`；**我逐行核过**）：
   - 超预算 ⇒ **结构内、路径级**省略（最长字符串叶子就地缩短）＋ **`elided:[{path,from,to,bytes}]`** ＋ `truncated:true`／`originalBytes`／`hostElision`；常量 **`MAX_TOOL_RESULT_BYTES=12000`**（`:958`）／**`MAX_STRING_LEAF=2000`**（`:960`）；
   - ★ **不动键、不动数组长度** ⇒ `packs`／`faces`／`settings` **两种负载下结构都保留**（`vmu-entry` 的 `st.packs` 必须照常可读）；
   - ★ **未超预算 ⇒ 逐字节原样且【无 `truncated` 键】**（`:972-973`）＝反向断言；
   - 附 **`elided` 可复算**（`bytes === to - from`，`path` 指回原对象；`:969-971`）✓。
**下一轮的预告我没有写**（`receiptMeta` 恒存在形态属**独立契约变更**，等 pack2 把最终字段表发我再**与字段同批落**）✓ —— 遵守"本轮只需 1–3 那一段"。

**哈希**：`docs/21` **`23462A76FD6CEC71`**（53197 B）→ **`83B969B2F7317D32`**（55797 B）（BEFORE 用 `git cat-file blob HEAD:` 二进制取）。
**门禁（2026-10-15 21:26:01）**：`check-docs` **PASS**／`audit-doc-index` **5/0**／`audit-doc-vs-code-tables` **17/0**／`audit-claim-traceability` **5/0**／`vmu-planned-settings` **ALL GREEN（111/28, 39/0）**；`audit-vmu-docs` **仍 exit=1** —— ★ **归属明确：那是 §9.3 的 `docs/04 §11` 手改格所致**（末行提示正是 `generate-vmu-settings-table.mjs --write`，与 `docs/21` 无关）。
