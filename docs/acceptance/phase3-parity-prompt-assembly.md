# Phase 3 · 验收 · 提示词装配 parity（Phase 1a-ii）

> 任务：`task-200`。**只问一件事**：新版是否复现原版的**装配逻辑**，以及**有没有把原版派生出来的值写成常量**。
> **★ 不比较段落文字本身**（另有任务负责）。
> 对照物：原版 `Vibe-Mathematics/vibe-math-v5r/**`；新版 `vibe-math-vmu/kernel/prompt/**` ＋ 入口 `vibe-math-vmu/vibe-math-vmu.js` 的提示词路径 ＋ `vibe-math-vmu/packs/v5r/prompts/*`；段策略层 `vibe-math-vmu/packs/v5r/middleware/prompt-switches.js`。
> 纪律：每条带 **file+line**；**「读过」与「推测」分开标注**；「没核」单独一节；**不改代码**；不跑 T1／全量门禁。

**状态：完成（本文件按"边查边写盘"逐段落地；§2 缺陷清单／§3 硬编码清单／§4 没核／§5 命令台账／§6 已读清单均已填）。** ★ 编号约定：缺陷用 **`P#`**、硬编码用 **`H#`**、已核不成立用 **`N-#`**（刻意避开 `[CDFG]\d` 形状，以免被 claim-id 正则读成引用）。

---

## 1. 装配逻辑对照表（方面｜原行为｜新行为｜是否一致｜判定）

| # | 方面 | 原行为（v5r） | 新行为（vmu） | 是否一致 | 判定 |
|---|---|---|---|---|---|
| 1 | 顺序与 order 号 | **没有 order 号这个概念**：每次唤醒一个**专用构造函数**，函数体里按固定次序 `L.push(...)`，末尾 `L.join('\n')`（`vibe-math-v5r.js:4054-4082` initial／`:4084-4106` normal／`:4108-4126` checkpoint／`:4128-…` meeting／`:4177-…` verify）；段落顺序＝**代码书写顺序**；`stateBlock`＝`briefBlock`（`:4051-4053`） | **声明式 order ＋ 保留区间**：`ORDER_RANGES`（`kernel/prompt/index.js:24-30`）；缺省 order＝**600**（`:291`）；`range` 由 order 派生（`:241-246`）；`state` 固定 order **0**（`:496`）；装配排序＝`order ↑`，同 order 用 **name 字典序**（`:538`）；运行时实际声明的是**手写 charter**（`order 690–796`，`v5r-blocks-a.js:17…`、`v5r-blocks-b.js:13…` ＋ `v5r-charter.js:72-80` 直接取 `b.order`） | **否（机制不同）** | ★ **不等价但可辩护**：docs/14:488 实测原版**没有任何节装配机制**（`systemPrompt`/`assemble`/`sectionPolicy`/`promptSections`/`composePrompt`/`renderSection` **全 0 命中**）⇒ 两者是"每类一个函数" vs "节流水线"。★ **但本任务只问逻辑，所以下面两条是要害**：见 **P1（顺序倒置）** 与 **P5（order 是手写常量）** |
| 2 | 分隔符／拼接方式 | `L.join('\n')`（**单个 `\n`**）；段间空行靠**显式 `L.push('')`**；分隔线是**字面量 `'------------'`**（`:4077`／`:4080`／`:4101`／`:4104`／`:4121-4124`）；标题是**内联字面量**`'【第 N 轮 —— …】'`（`:4086`） | `parts.join('\n\n')`（`:649`），每部件 `'# ' + name + '\n' + text`（`:594`／`:635`／`:642`），末尾 `trimTrailing`（`:64`） | **否（机制不同）** | 见 **P7**：`trimTrailing` 会把**段内** 3+ 连续换行压成 2（`:64`）——原版对空行没有这种归一化 |
| 3 | 选择条件（角色／阶段／任务绑定、覆盖） | 由**调用方选函数**（wake 类型 → `initialPrompt`/`normalPrompt`/…），函数内 `if` 分支：`member.kind === 'academician' && params.academicianLeads`（`:4090`）、`leanDailyOn()`（`:4095`／`:4116`）、`invited`（`:4135`）、`others.length`（`:4141`／`:4145`） | **四维 scope ＋ 绑定**：`scopeMatches`（`:369-378`）＋ `matchingBindings`（`:381-395`，role<phase<member<task，最具体者胜，同级并列 ⇒ `VMU_PROMPT_BINDING_CONFLICT` `:617-621`）；绑定**替换**段文本（`:604-628`）；覆盖次序 语言级→调用方→声明（`:199-209`）；`state` 不可覆盖（`:591-597`）；`disable`＝零注入（`:589-590`） | **否（机制不同；语义可对上）** | 原版的分支在 vmu 里变成：**charter 块的 `kind`**（`role`／`phase`／`leader-conditional`，`v5r-charter.js:40-60`）＋ **`sectionPolicy` 开关**（`prompt-switches.js:65-115`）。★ 逐维对照见 §1.2 |
| 4 | 段策略层 `prompt-switches.js` ↔ 原版开关映射 | 开关条件**硬编码在回合循环里**（policy 文件头 `prompt-switches.js:5-10` 自陈："The framework's turn loop used to contain, hard-coded, the policy of which prompt sections…"） | **纯函数 `decideSections`**：3 个关断键（`v5r-pointer-contract`／`v5r-turn-resources`／`v5r-feedback-line`，`:25-29`）＋ **恰好一个**回复目录（`:77-80`，默认 `compact`，只有 `'full'` 才切）＋ **恰好一个**会议发言态（`:89-99`，**必须由调用方点名**，缺省＝三个都不注入）＋ **恰好一个**形式化状态行（`:102-112`，默认 `none`，**总是显示**） | **否（机制不同）** | ★ **投递路径已实测存在**：`vibe-math-vmu.js:20` 导入 → `:478` `v5r: { sectionPolicy: V5R_DECIDE_SECTIONS, … }` → `kernel/turn/index.js:386-390` 真调用；`on:` 名字 = 宿主公布的 `prompt/assemble`（`prompt-switches.js:123-128`，含 R544 的"曾用 `turn.assemble` ⇒ 真机上惰性"记录）。★ **两处需注意**：**P6**（原版**没有**这三/二/三/四类开关的一一对应证据，只有"块"）与 **P4**（缺省不点名会议态 ⇒ 三个会议段都不注入，而原版 `meetingPrompt` 必有一个分支） |
| 5 | 快照／版本行为 | 无快照机制；提示词**每次现场构造**（每个 builder 现算） | `snapshot(scopes)` **逐字节**（`:691-695`）；装配是**纯函数**（同输入⇒同字节，`:4`／`:10`／`:503`）；宿主接缝 `bindToHost`（`:701-711`，缺件具名拒 `VMU_ENGINE_UNAVAILABLE`）；`apiVersion=1`（`:21`）；时间来自注入 `clock`（`:81`，回执 `at` `:663`） | **否（新增能力）** | vmu **多出**快照/审计面（原版没有），属**增益**不是缺口；★ 但快照的是**装配结果**，不是原版那样"每类一函数"的代码路径 |
| 6 | 硬编码（原版派生 → 新版常量） | — | **运行时声明集：未发现**派生值被写成常量（literal `轮次 N`=0、literal `m=N`=0、literal `有表决权者 N 人`=0；`{{ round }}`=1、`{{ quorum }}`=3）；**语料快照集：66+66 处冻结值仍在**，但**该集未进运行时声明**（见 §3 的 H1／H2） | 见 §3 | 见 §3 逐条 |

### 1.1 原版 ↔ 新版 逐维对照（★ 全部「读过」）

| 维度 | 原版 v5r（file:line） | 新版 vmu（file:line） |
|---|---|---|
| 角色（kind）→ 展示名 | `kindLabel(k)`（`vibe-math-v5r.js:3422`）：`academician→院士`、`researcher→常驻研究员`、否则`临时工` | 变量 `roleLabel`（`kernel/prompt/index.js:50` 白名单）＋ 由**调用方**传入（`kernel/turn/index.js:391`）；★ 语料里 `{{ roleLabel }}` 出现 **0** 次，因为**载入时**才把标题里的 `{{ role }}` 改写成 `{{ roleLabel }}`（`v5r-core.js:60-61`、`:68`） |
| 起步方向（per-member） | `member.direction`（入职时写入；`initialPrompt` `:4072` 用 `member.direction`） | **按成员 id 的绑定表** `CHARTER_MEMBER_BINDINGS`（`v5r-charter.js:49-55`，键＝`acad`／`r-1`／`r-2`／`r-3`／`t-1`）⇒ **P3／H4** |
| 资源/自检行 | `resourceBlock()`（`initialPrompt:4073`、`normalPrompt:4096`） | 段 `v5r-turn-resources`（`v5r-blocks-b.js:30-31`），由 `vmu.turn.selfCheck` 关断（`prompt-switches.js:27`） |
| 数学可用行 | `mathPushLine(L)`（`:4074`／`:4097`／`:4117`） | **已核，不是缺口**：`v5r-blocks-b.js:263`／`:266`（`math_computation` 指引）、`:581`（"计算证据请引用回执路径…" 含 `{{ setting:vmu.turn.protocolPath }}`） |
| 论文行 | `paperPushLine(L)`（`:4075`／`:4098`／`:4118`） | **已核，不是缺口**：`LATEX_ENGINE_NOTE`（定义 `v5r-blocks-a.js:1`）由 `v5r-blocks-b.js:436`／`:500` 展开 |
| 反馈行 | `feedbackPushLine(L)`（`:4076`／`:4099`／`:4119`） | 段 `v5r-feedback-line`（`v5r-blocks-b.js:94-95`），由 `vmu.turn.feedback` 关断（`prompt-switches.js:28`） |
| 指针契约 | `pointerContractBlock()`（`:4078`／`:4102`／`:4122`） | 段 `v5r-pointer-contract`（`v5r-blocks-b.js:72-73`，order **721**），由 `vmu.pointer.propagation` 关断（`prompt-switches.js:26`） |
| 状态块 | `stateBlock(member)`＝`briefBlock`（`:4079`／`:4103`／`:4123`；定义 `:3376-3421`） | 段 `v5r-brief-status`（`v5r-blocks-a.js:503-504`，order **720**）＋ `{{ statusBlock }}` 由回合循环注入（`kernel/turn/index.js:391`；charter 里的引用见 `v5r-blocks-a.js:508`） |
| 回复目录 | `replySpec(member.kind)`（`:4081`／`:4105`／`:4125`） | 段 `v5r-reply-spec`（order **795**）／`v5r-reply-formal`（**796**）／`v5r-reply-compact`（`prompt-switches.js:32`） |
| order 值来源 | 无 | `CHARTER_SECTIONS` 取 `b.order`（`v5r-charter.js:74`），**手写常量**；语料段另用 `600 + i`（`v5r-core.js:65`） |

---


### 1.2 已读细节（★ 全部为「读过」，带 file:line）

**(3) 选择条件**
- `scopeMatches`（`index.js:369-378`）：scope 四维 `member`／`role`／`phase`／`task`；`'*'`＝任意；数组＝`includes`；`undefined`＝任意。
- `bind`（`:254-265`）：一条绑定**必须且只能**声明一个维度（`:259-262`，否则 `VMU_INVALID_ARGUMENT`）；段名必须 kebab-case（`:256`）。
- `matchingBindings`（`:381-395`）：每条绑定**取第一个命中的维度**，判定顺序写作 `task → member → phase → role`（`:388-391`）；`priority = BINDING_PRIORITY.indexOf(dim)`（`:392`），`BINDING_PRIORITY = ['role','phase','member','task']`（`:53`）⇒ **role 最低、task 最高**；按 `(priority, 声明序)` 升序排（`:394`）。
- 装配时（`:612-628`）：取该段全部匹配绑定中 **priority 最高者**（`:615`），**同级并列 ⇒ 具名拒** `VMU_PROMPT_BINDING_CONFLICT`（`:617-621`）；**绑定是「替换」段自身文本**，不是追加（`:604-611` 注释记录了旧实现「把每条绑定都追加」的真实缺陷：一名研究员同时收到 3 个身份、3 个 quorum）。
- 覆盖优先级（`:199-209`）：**语言级 `overridesByLang` → 调用方 `overrides` → 声明于 settings 的 `vmu.prompts.overrides`**；三者都**实时读**（`:186-189`）。
- 不变量：`state`／`mutable:false` 段**忽略一切覆盖、绑定、追加**（`:591-597`）；`disabled` 段**整段跳过（含标题）**＝「零注入」（`:589-590`，`:274-283`）；中间件 `appendPrompt` 追加（`:517-531`、`:629-633`）；**追加到一个不存在的段名 ⇒ 自成一段**（`:640-644`）。

**(5) 快照／版本**
- `snapshot(scopes)`（`:691-695`）：对每个 scope 跑同一 `assemble()`，**逐字节**取 `text`（注释：byte-exact snapshots for the corpus gate, docs/06 §8 item 1）。
- 确定性声明（`:4`、`:10`、`:503`）：同输入 ⇒ 同字节；排序/拼接/末尾换行固定。
- 宿主接缝 `bindToHost(adapter)`（`:701-711`）：需要 `registerSection`＋`onAssemble`，缺失/不完整 ⇒ **具名拒** `VMU_ENGINE_UNAVAILABLE`；**本模块不 import 宿主**（`:16-18`）。
- 模块版本：`apiVersion = 1`（`:21`）。`assemble()` 回执带 `at: clock()`（`:663`）—— `clock` 为注入接缝（`:81`），非硬编码时间。

---

## 2. 排序后的缺陷清单（每条 file+line）

> 判定口径：本任务**只问装配逻辑是否一致 + 有没有硬编码**。★ 顺序差异（P1）我只报**相对次序**，**不比较文字**（另有任务）。

| 排名 | 编号 | 缺陷／差异 | 原版（file:line） | 新版（file:line） | 判定 |
|---|---|---|---|---|---|
| 1 | **P1** | **三段的相对次序被反转**：原版 `normalPrompt` 的次序是 **反馈行 → 指针契约 → 状态块**；新 charter 的 order 是 **状态块(720) → 指针契约(721) → 反馈行(722)** | `vibe-math-v5r.js:4099`（feedbackPushLine）→ `:4102`（pointerContractBlock）→ `:4103`（stateBlock） | `v5r-blocks-a.js:503-504`（`v5r-brief-status` order **720**）／`v5r-blocks-b.js:72-73`（`v5r-pointer-contract` **721**）／`v5r-blocks-b.js:94-95`（`v5r-feedback-line` **722**） | **真差异**（机制重写时未对齐次序）。★ 是否升级为缺陷由 Lead 定；我给出双侧 file:line 与 order 号 |
| 2 | **P2** | **`CHARTER_LEADER_VARIANTS` 声明了但没有消费者** ⇒ `leader-conditional` 块**永远取 `with-leader`**，"本所没有院士"那一支**不可达** | 原版 `charterFor` 按 `acadId` 是否存在选整套句子（docs/audit/source-prompt-coverage.md:33/35 记原版 `:3185-3188`、`:3202-3207`） | 定义 `v5r-charter.js:59-60`；**全仓 `vibe-math-vmu`＋`tests`＋`scripts` 除文档外 0 处引用**；默认解析 `v5r-charter.js:79` `b.texts['with-leader'] \|\| b.texts.researcher` | **真缺口**（且与 `docs/audit/source-prompt-coverage.md` 的"YES (leader-conditional)"**声明不一致**——本仓抓过的同类） |
| 3 | **P3** | **起步方向按字面成员 id 绑定**：换一套编制 id 就静默拿不到起步方向 | 原版用 `member.direction`（入职时写入）：`vibe-math-v5r.js:4072` | `v5r-charter.js:49-55`（键＝`acad`／`r-1`／`r-2`／`r-3`／`t-1`）⇒ 非匹配者落到默认分支 `v5r-charter.js:79` | **真硬编码**（原版派生 / 新版常量） |
| 4 | **P4** | **会议发言态缺省＝三个段都不注入**，而原版必有一个分支 | `vibe-math-v5r.js:4145`（else 分支＝"你是本次会议的第一位发言者"）；`:4135`（受邀分支） | `prompt-switches.js:89`（`turn.meetingState === undefined ⇒ null`）＋ `:97-99`（三段全 `enabled:false`）；★ 文件自己的注释承认 "the plugin does not"（`:88`） | **真差异**：新版缺省 ≠ 原版必选分支 |
| 5 | **P5** | **order 号是手写常量、无派生依据**：语料段用 `600+i`（可复算），**charter 段取人手写的 `b.order`**（690–796） | 原版**没有 order 概念** | `v5r-charter.js:74`（`order: b.order`）；值散落于 `v5r-blocks-a.js:18/48/68/101/115/135/153/170/215/296/315/369/391/430/445/466/483/504/523/633/651/664`、`v5r-blocks-b.js:14/31/49/73/95/116/136/148` | **新引入的手写常量**（不是"派生值写成常量"）⇒ 风险＝P1 那一类只能靠人眼发现 |
| 6 | **P6** | **段策略层是"按语义重建"而非逐条对照**：四组开关里只有 3 个关断键能对上段名 | 原版**代码证据**我只核到：`formalStatusLine`（`:4353`）＋ `formalOn()` 守卫（`:7001`）＋ `meetingPrompt` 的 `invited`／`others` 分支（`:4135`／`:4141`／`:4145`） | `prompt-switches.js:25-29`（3 关断）／`:32`（2 目录）／`:35-39`（3 会议态）／`:42-47`（4 形式化） | **映射不可逐条证实**（原版没有"节"这个概念）⇒ 记为**未核清的映射**，不是缺陷 |
| 7 | **P7** | 段内空行被归一化 | 原版只 `join('\n')`，空行靠显式 `L.push('')` | `kernel/prompt/index.js:64` `trimTrailing`（逐行去尾空白 ＋ **3+ 连续换行→2**） | **低风险差异**（只影响捕获文本的二次加工） |

**★ 已核但**不成立**的两个怀疑（诚实记录，避免误报）**：
- **N-1 数学/论文行缺失？⇒ 不成立**：`v5r-blocks-b.js:263/266`（`math_computation` 指引）、`:581`（"计算证据请引用回执路径…" 含 `{{ setting:vmu.turn.protocolPath }}`）、`:436`／`:500`（`LATEX_ENGINE_NOTE`）均在**运行时声明集**内。
- **N-2 `v5r-charter-roster-snapshot`（order 703）是冻结名单？⇒ 不成立**：其文本是 `'{{ roster }}'`（`v5r-blocks-a.js:105-109`），**活变量**，且自己声明"权威名单以每轮状态块为准"。

---

## 3. 硬编码清单（★ 原版【派生】、新版写成**常量**的值：名字／id／日期／路径／计数／order 号）

| # | 值 | 新版写在哪（file:line） | 原版怎么派生的（file:line） | 判定 |
|---|---|---|---|---|
| H1 | 语料 **66×** 字面 `轮次 N`（例 `轮次 6`／`轮次 10`／`轮次 12`） | `packs/v5r/prompts/v5r-prompts.js:51`（`轮次 6`）、`:52`（`轮次 10`）、`:53`（`轮次 12`）、`:54`（`轮次 11`）、`:55`（`轮次 9`）… 共 **66** 处 | `rounds.get(member.id)`（`vibe-math-v5r.js:3382`） | ★ **非运行时**：该集**未进** `PACK.sections`（`v5r-core.js:281` 取 `v5rCharterSectionsGlobal()`，`:339`；ROUND 374 注释 `:273-278`／`:324-326` 明说捕获快照不得作为运行时节）⇒ **记录型**，不算活硬编码。**但** `v5r-core.js:369-370` 仍导出 `v5rTurnSections` 作为"host 应交给管线的集合" ⇒ **接口一旦被接上，66 个冻结轮次会立即泄漏** |
| H2 | 语料 **66×** 字面 `有表决权者 N 人` | 同上各条 | `voterCount()`（`vibe-math-v5r.js:3383`） | 同 H1（非运行时） |
| H3 | 语料元数据 `charterChars`（797／799／794／795／746…）与 `owner`（`acad`／`r-1`／`t-1`…） | `v5r-prompts.js:50` 起每条 | 原版现场派生 | `git grep charterChars` 只命中**生成器／审计／文档** ⇒ 运行时未读；`owner` 未穷尽（见 §4） |
| H4 | `CHARTER_MEMBER_BINDINGS` 的 **5 个字面成员 id** | `v5r-charter.js:49-55` | `member.direction`（`vibe-math-v5r.js:4072`） | ★ **真硬编码**（＝P3） |
| H5 | charter 段的 **order 号**（690–796，含 `600+i` 之外的**全部**） | `v5r-charter.js:74` ＋ blocks 各条 | 原版无 order | ★ **新引入的手写常量**（＝P5）；语料段用 `600+i` 是**可复算**的，charter 段不是 |
| H6 | 5 处字面 `"r-2"` | `v5r-blocks-a.js:531`／`:564`／`:573`／`:575`／`:601` | — | **示例常量**（JSON 回执样例 `{"to":"r-2","text":"…"}`）⇒ 可接受，**不是**派生值 |
| H7 | `V5R_PHASES` 四阶段字面量 `['heartbeat','paper-write','paper-review','paper-final']` | `packs/v5r/index.js:51` | 原版阶段词表 | pack 自有词汇（框架不该认识 `heartbeat`，注释如此声明）；★ 与原版**阶段集合是否一致未核**（§4） |
| H8 | glossary 缺省路径 `'vibe-math-vmu/glossary.json'` | `kernel/prompt/index.js:174` | 原版无此概念 | **框架层缺省**，可被 `vmu.prompts.glossary.ontology` 覆盖 ⇒ 记录，不判缺陷 |
| H9 | locale 缺省链 `['zh-Hans','zh','en']` | `kernel/prompt/index.js:96` | 原版无 | **框架层缺省**，可被 `vmu.prompts.locale.fallbackChain` 覆盖 ⇒ 记录 |
| H10 | compaction 缺省 **66**／**8** ＋ `COMPACT_WAKES=['normal','checkpoint']` | `kernel/prompt/index.js:123`／`:134`／`:108` | **注释显式给出出处**：v5r `:449`／`:1079`／`:3899-3901` | ★ **有出处的 parity 常量**（不是无据硬编码）——按本仓纪律这是**正确**做法（把"不知道的常量"标出处） |
| H11 | 本模块杂项缺省：`whoMayOverride=['office']`（`:75`）、`source:'kernel'`（`:302`／`:337`）、段名缺省 `'middleware-append'`（`:526`） | `kernel/prompt/index.js` | 原版无 | 框架缺省，**可覆盖**；记录 |

★ **运行时声明集的实测计数（读过）**：`v5r-charter.js`＝literalRound 0／`{{quorum}}` 1；`v5r-blocks-a.js`＝literalRound 0／`{{round}}` 1／`{{quorum}}` 2；`v5r-blocks-b.js`＝0／0／0；`v5r-assistant.js`＝0／0／0；**literalVoterCount 全 0** ⇒ **运行时声明集没有把派生值写成常量** ✓

---

## 4. 「没核」（明确未验证的部分）

1. **顺序的逐字对齐**：P1 只证明**三段相对次序**不同；整份顺序是否逐项对齐**未核**（且属"比文字"的任务）。
2. 原版 `paperWritePrompt`／`paperReviewPrompt`／`paperFinalPrompt`（docs/14:488 记 `:4576`／`:4604`／`:4627`）**我未读**；`V5R_PHASES` 是否与之对应**未核**。
3. 原版 `meetingPrompt` 我只读到 `:4159`（`:4160+` 未读）；`verifyPrompt`（`:4177`起）只读了前几行。
4. `v5r-persona.js` 的 6 处字面 `r-N` **只计数、未逐条读**（该集未进运行时声明，故优先级低）。
5. `owner`／`toolFilter` 是否有运行读者：`toolFilter` 只命中生成器／测试／驱动；`owner` **未穷尽**。
6. 原版**开关的完整集合**：除 `formalOn()`／`formalStatusLine` 与 `meetingPrompt` 分支外，其余门控（如 `pointer`／`selfCheck`／`feedback`／`replyCatalogue` 在原版的对应物）**未定位到原版代码证据** ⇒ P6 只到"未核清"。
7. `noticeBlock`＝`packs/v5r/notices.js`（`vibe-math-vmu.js:21` → `:478`）注入的**通知块**不属于"节装配"，**未核**。
8. 语料计数（66／66）是**文本命中计数**，不是"语料条目数"（条目数＝`COUNTS.total` **67**，`v5r-prompts.js:10-14`）；两者关系**未逐条核对**。

---

## 5. 读数与命令台账（★ 写明读的是哪一次运行；本次全部为只读命令）

| 运行 | 原样命令 | 退出码 | 关键读数 |
|---|---|---|---|
| R1 | `git grep -c systemPrompt -- vibe-math-v5r` | 1 | **0 命中** ⇒ 原版无 `systemPrompt` 键 |
| R2 | `git grep -n "v5r-pointer-contract\|v5r-turn-resources\|v5r-reply-compact" -- vibe-math-v5r` | 1 | **0 命中** ⇒ 新版的段名在原版**不存在**（段名是新版词汇） |
| R3 | `git grep -n "briefBlock\|initialPrompt\|normalPrompt\|checkpointPrompt\|meetingPrompt\|verifyPrompt" -- vibe-math-v5r/vibe-math-v5r.js` | 0 | 定位原版"每类一个函数"的装配实现（`:3376`／`:4054`／`:4084`／`:4108`／`:4128`／`:4177`） |
| R4 | 计数脚本（`Select-String -AllMatches`）on `v5r-prompts.js` | 0 | `轮次 \d+`＝**66**、`第 {{ round }} 轮`＝**24**、`{{ statusBlock }}`＝**0**、`有表决权者 \d+ 人`＝**66**、`m={{ quorum }}`＝**66**、`{{ roster }}`＝**66** |
| R5 | 同一计数 on 运行时声明集（`v5r-charter.js`／`blocks-a`／`blocks-b`／`v5r-assistant.js`） | 0 | literalRound／literalM／literalVoterCount **全 0**；`{{round}}`＝1、`{{quorum}}`＝3 |
| R6 | `git grep -n "CHARTER_LEADER_VARIANTS\|leader-conditional" -- vibe-math-vmu tests scripts` | 0 | 命中**仅**文档 ＋ 定义（`v5r-charter.js:59-60`）＋ blocks 的 `kind:` ⇒ **无消费者** |
| R7 | `git grep -n "setSectionEnabled" -- vibe-math-vmu` | 0 | 唯一调用点 `kernel/turn/index.js:389`（策略→管线） |
| R8 | `git grep -n "sectionPolicy" -- vibe-math-vmu` | 0 | 投递链 `vibe-math-vmu.js:20` → `:478` → `kernel/turn/index.js:386-390` |

---

## 6. 已读文件清单（★「读过」＝用 read 工具看过原文；「推测」＝从别处推断，未读原文）

| 文件 | 状态 | 说明 |
|---|---|---|
| `vibe-math-vmu/kernel/prompt/index.js`（728 行） | **读过（全文）** | 装配核心；§1／§2 的全部新版 file:line 出自此 |
| `vibe-math-vmu/packs/v5r/middleware/prompt-switches.js`（128 行） | **读过（全文）** | 段策略层 |
| `vibe-math-vmu/packs/v5r/prompts/v5r-prompts.js` | **读过（1–60 行）** | 生成语料；66／66 计数为全文统计 |
| `vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | **读过（40–94／299–346 行）** | 语料→节桥、`PACK.sections` getter |
| `vibe-math-vmu/packs/v5r/prompts/v5r-charter.js`（80 行） | **读过（30–80 行）** | 绑定与 `CHARTER_SECTIONS` |
| `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js` | **读过（96–131／500–521 行）** | order 号与 brief-status |
| `vibe-math-v5r/vibe-math-v5r.js` | **读过（3374–3427／4040–4159 行）** | 原版装配函数族 |
| `vibe-math-vmu/kernel/turn/index.js` | **读过（530–604 行）** ＋ grep | 策略应用点 |
| `vibe-math-vmu/vibe-math-vmu.js` | **读过（169–214 行）** ＋ grep | 入口的提示词路径 |
| `vibe-math-vmu/packs/v5r/index.js` | **读过（1–60 行）** | pack 入口 |
| `vibe-math-v5r/vibe-math-v5r.js` 其余 11 000+ 行 | **未读** | 只按 grep 定位 |
| `vibe-math-vmu/packs/v5r/prompts/v5r-persona.js` | **只计数** | 未逐条读 |
| `vibe-math-v5r/agent.cordis.yml` | **只按 grep 看过 `persona`／`agent-instructions` 行号** | 未读完 |

