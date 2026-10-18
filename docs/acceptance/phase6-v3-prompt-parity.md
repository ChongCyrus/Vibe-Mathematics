# Phase 6 · 目标 2 · **v3 提示词逐条对账**（P1-6 输入）

> **本文件的唯一用途**：把原 `vibe-math-v3` 的**提示词全量**（含根会话面、子代理面、动态注入族、通知族、工具面文案）逐条落到 `文件:行`，
> 再与 **`vibe-math-vmu/packs/v5r/prompts/**`（vmu 侧已有什么）** 和 **`packs/v3/**`（当前已落什么）** 对照，给出 P1-6 的差集与落段建议。
>
> **验收口径（目标 2 原文，逐字）**：*"保证所有运行逻辑、功能、**提示词交互及提示词内容**等保持一致或者更优"* ⇒ 提示词要**逐条对账**，不是"看起来在运行"。
>
> **本文件的边界**：★ **只盘点、只给建议**，没有改任何代码、没有跑 git、没有动 `packs/`。
> ★ 不引用 `docs/acceptance/phase6-v3-replication-blueprint.md`（编码事故毁损，本文件所有 v3 侧证据都从 `vibe-math-v3/` 源码重新取）。
> ★ 数字一律用命令派生（见 §0.2），不手抄。
>
> 关联：`docs/acceptance/phase6-v3-p0-build-checklist.md`（P0 施工卡）、`docs/26-turn-orchestration.md`（回合编排与 prompt 段的重建记录）、`docs/10-packs.md`（pack 声明层）。

---

## §0 方法、口径与派生数字

### 0.1 我实际读了什么（只读范围）

| 读了 | 用途 |
|---|---|
| `vibe-math-v3/vibe-math-v3.js`（6,284 行） | 主文件；全部子代理提示词构造器、简报、Lean/数学注入、通知、工具面文案 |
| `vibe-math-v3/agent.cordis.yml`（424 行） | 根会话 persona（`prefix`/`text`/`suffix`）＋ plan-mode 段 |
| `vibe-math-v3/math-computation.js`（1,481 行，只核导出常量与 `mathAvailabilityLine`） | 数学计算注入族与工具描述 |
| `vibe-math-v3/实现方案.md` §12/§15（按需检索，非通读） | 提示词设计意图（不是运行时来源） |
| `vibe-math-vmu/packs/v5r/prompts/**`（8 个文件）＋ `vibe-math-vmu/packs/v5r/middleware/prompt-switches.js` ＋ `vibe-math-vmu/packs/v5r/notices.js` | "vmu 侧已有什么" |
| `vibe-math-vmu/packs/v3/**`（4 个文件） | "当前已落什么"（结论：**没有 `prompts/`**） |
| `vibe-math-vmu/packs/v3-core/index.js`、`packs/example-data/prompts/sections.json` | 互斥包与纯数据 pack 的形状参照 |
| `vibe-math-vmu/kernel/prompt/index.js`（784 行）、`kernel/turn/index.js`（节选）、`kernel/pack.js`（节选）、`vibe-math-vmu.js`（节选） | 管线能力、装配调用点、pack 数据读取点 |
| `vibe-math-vmu/docs/26-turn-orchestration.md` §2/§3.7–§3.20/§3.26–§3.31、`docs/10-packs.md` §4.1/§9.2/§9.5 | 提示词章节（用户点名） |

**没读**：`docs/acceptance/phase6-v3-replication-blueprint.md`（禁读）；`vibe-math-v3/math-engines.js`（引擎表，非提示词）；v5r 原版源码（只读 vmu 侧的 v5r pack）。

### 0.2 派生数字（命令产出，不手抄）

| 量 | 值 | 怎么来的 |
|---|---|---|
| v3 主文件 | **6,284 行 / 483,990 字节** | `Get-Content` 行数 + 文件长度 |
| v3 子代理提示词构造区 | **`1679–1919`（241 行 / 28,404 源码字节）** | 行区间切片后计数 |
| 其中 `*Prompt` / `formalPromptBlock` 构造器 | **9 个** | `Select-String 'function [A-Za-z]+Prompt\|function formalPromptBlock'` |
| 其中 `kc*` 知识上下文片段函数 | **8 个** | `Select-String 'function kc[A-Z][A-Za-z]+\(\)'` |
| `TOOL_DESC` | **36 条 / 7,622 源码字节（`5996–6036`）** | 行区间 + 逐行 `name:` 计数（35 个 `vibe_math_*` + `math_computation`） |
| `PARAM_SCHEMA` | **64 条（`12–78`）**；`PARAM_PROPS_KEYS` **63 键（`:81`）** | 逐行 `{ name:` 计数 ／ 拆分键表 |
| `agent.cordis.yml` persona `prefix` | **`10–139`，11,479 字节** | 行区间切片 |
| 同 `text` | **`141–264`，11,372 字节** | 行区间切片 |
| 同 plan-mode 段 | **`322–333`，2,442 字节** | 行区间切片 |
| v5r 章程块 | **58 块**（shared 30 / role 6 / phase 17 / leader-conditional 5），**orders 690–820**，组装文本 **14,672 字** | `node` 直接 import `v5r-charter.js` 计数 |
| v5r 章程绑定 | **46 条**（role 18 / phase 23 / member 5） | 同上 |
| v5r 每轮回合段 | **1 段**（`v5r-report-duty`，order 608，**449 字**） | import `v5r-assistant.js` |
| v5r 根 persona 段 | **3 段**（orders 605–607，**1,449 字**）＋`bindings: []` | `assistant.json` JSON 解析 |
| v5r persona 采集块（**非运行时**） | **11 段 / 6,292 字（选中文本）／20 条绑定** | import `v5r-persona.js` |
| v5r 语料 | **67 条 / 31 种 kind / 79,138 字**（生成文件头自述） | `v5r-prompts.js:10-14` |
| `packs/v3/prompts/` | **不存在**（0 文件） | `Get-ChildItem -Recurse` |

> 口径：表中"**字**"= `String.length` 的**字符数**（不是渲染后的模型 token 数）；"**B**"= 源码**字节数**（含引号/转义/缩进，是体量代理，不是渲染长度）。两者都**不是**一次真实装配的长度（§5-U12）。

---

## §1 原 v3 的提示词构件全表

**口径**：一行 = 一个**可独立定位、可独立改**的文本构件。
**"时机"** = 它被拼进哪一次模型调用的提示。v3 有三条提示通道：**① 根会话系统提示**（agent preset）／**② 子代理提示**（`spawnChild`/`followupChild` 的 user 消息）／**③ 工具面文案**（模型通过 tools 列表看到）。
**"字数"** 一律是**源码字节**或**行区间**（长文本是运行时拼接，渲染长度依赖插值，见 §5-U12）；**首尾引文**只用来定位，不作为"逐字全文"。
**插值变量**只列**运行时可变**的名字；常量字符串不列。

### §1.1 根会话面（通道 ①，`agent.cordis.yml`）

| # | 构件 | 位置 | 时机 | 首 / 尾 与字数 | 插值变量 |
|---|---|---|---|---|---|
| A1 | **主系统提示 · `prefix`**：`You are a coding agent powered by the {{model}} model.` → 工具目录（**38 个 `- vibe_math_*` 条目**的一句话说明，另有 4 个 math 条目）→ 数据布局 → 收口规则 → LEAN 段 → DISCLOSURES | `agent.cordis.yml:10-139` | 每次根会话系统提示装配时（preset 的 `persona` 行） | 首：`You are a coding agent powered by the {{model}} model.`；尾：`…（missing packages are reported with an install plan only）`；**11,479 B** | `{{model}}`；正文另有多处 `{{cwd}}` 语义的"session working directory"说明 |
| A2 | **主系统提示 · `text`**：与 A1 同构的**第二份全文**（同一条 `persona` 行的 `text:` 键） | `agent.cordis.yml:141-264` | 同上（**谁生效取决于宿主 persona 插件**，见 §5-U1） | 首：`You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.`；尾：与 A1 同 | `{{model}}`、`{{cwd}}` |
| A3 | **主系统提示 · `suffix`**：`Your working directory is {{cwd}}.` | `agent.cordis.yml:140` | 同上 | 文本 **34 B** | `{{cwd}}` |
| A4 | **plan-mode 段**（宿主 plan-mode 插件的 `section`）：`You are in plan mode…` | `agent.cordis.yml:322-333` | 会话进入 plan mode 时 | 首：`You are in plan mode. Stay in plan mode until exit_plan_mode succeeds…`；尾：`…ask the user to switch modes manually; do not proceed with implementation.`；**2,442 B** | 无 |

> 注：A1/A2 里**内嵌**的数学计算规则（`agent.cordis.yml:71-73`）与 `math-computation.js` 的 `MATH_PERSONA_TOOL_LINE`（`:84-85`）、`MATH_ARCHIVE_WORKFLOW_LINE`（`:90-94`）、`MATH_SUBSTITUTION_RULE_LINE`（`:102`）**同源**。主文件把这三个常量 import 进来（`vibe-math-v3.js:271-274`），但**根 persona 是静态 YAML、不读它们**（grep `MATH_PERSONA_TOOL_LINE` 只命中 import 行）⇒ 同一段文本在仓里有**两份**（YAML 一份、共享模块一份），改一处不会同步另一处。⇒ 复刻时**不要**复制这两份中的任何一份，应从共享模块生成（§4.2）。另见 §5-U9："`formalVerify=off` 时子代理面真的零提及，但根 persona 仍然提 Lean/数学"。

### §1.2 工具 / 命令面（通道 ③，模型可见）

| # | 构件 | 位置 | 时机 | 首 / 尾 与字数 | 插值变量 |
|---|---|---|---|---|---|
| B1 | **`TOOL_DESC`：36 个工具的模型可见描述**（35 个 `vibe_math_*` + `math_computation`） | `vibe-math-v3.js:5996-6036` | 每次会话工具目录装配 | 首：`Start (or restart) the Vibe Math V3 scheduler…`；尾：`…Only state=settled with exitCode=0 (same content hash AND same build context) counts as passed.`；**7,622 B / 36 条** | 无（纯静态；`math_computation` 一条来自 `math-computation.js:74-82`） |
| B2 | **`PARAM_SCHEMA`：64 条参数描述**（`vibe_math_set_params`/`vibe_math_setup` 的 schema 与引导面） | `vibe-math-v3.js:12-78` | 工具 schema 装配 / `/vibe setup` 输出 | 首（`:13`）：`auto = 无人值守自动通过关键节点；manual = 关键节点挂起人工决策`；尾（`:77`）：`mathInstallScope … system 只对当次显式调用生效、永不记忆（不会写进状态文件）`；**64 条** | 无 |
| B3 | **`/vibe` 命令面**：description + input.hint + 未知子命令 usage | `vibe-math-v3.js:5511-5513`（注册）、`:5399`（usage） | 模型看到 slash 命令目录 / 调错时 | 首：`control the Vibe Math V3 solver (start/pause/projects/setup…`；尾（usage）：`…decisions \| agents \| paper [lang=zh\|en] [format=both\|md\|tex] [force]` | 无 |

### §1.3 子代理提示词的**公共段**（通道 ②；知识上下文族）

> 这些段**不单独成文**：它们由 §1.4 的组合器按角色拼起来，再进 §1.5 的角色提示词。**全部在构造提示词的那一刻现算**（`knowledgeContextText()` 在每次 `*Prompt()` 里被调用），不是"入职时冻结"。

| # | 构件 | 位置 | 时机 | 首 / 尾 与字数 | 插值变量 |
|---|---|---|---|---|---|
| C1 | **可信分层**（最高优先规则）：Verified/ 绝对可信、Propos 已验证可信、其余经验参考、概率语义 | `vibe-math-v3.js:1680-1686` | 每个子代理提示的知识上下文第 1 段 | 首：`1) TRUST LAYERS — the single most important rule:`；尾：`…0 与 1 之间 = 未定论/待验证。`；**379 B** | 无 |
| C2 | **对象模型**（问题卡/命题卡/方法卡锚点＋"价值/关键性"晋升语义＋证明/证伪段语义＋收口规则） | `:1687-1695` | 第 2 段 | 首：`2) OBJECT MODELS（md 卡片，软规范：头部锚点行 + 正文自由叙述）`；尾：`…属性/概率锚点由调度器改写）`；**1,140 B** | 无 |
| C3 | **目录地图**（Problems/Progress/Propos/Methods/Verified/Reliable/Notes/Logs/State） | `:1696-1698` | 第 3 段 | 首：`3) FOLDERS：Problems/ 问题清单；Progress/ 研究日志…`；尾：`…State/ 调度器私有——不要读也不要改。`；**252 B** | 无 |
| C4 | **方法库规则**：先查 Methods/、用后上报 `methods_used`、新发明上报 `new_inventions`、"不得把方法名当 id" | `:1699-1701` | 研究类角色的第 5 段 | 首：`5) METHOD LIBRARY RULES：开工前先查 Methods/…`；尾：`…千万不要把方法名/标题文字当 id 填进 methods_used。`；**468 B** | 无 |
| C5 | **输出质量规则**：完整性/不断章取义/引用出处/临时假设必须写成"若…则…"/只输出 JSON 围栏 | `:1702-1704` | 知识上下文末段 | 首：`4) OUTPUT QUALITY RULES：完整性、不断章取义…`；尾：`…不要当作聊天气泡输出。`；**284 B** | 无 |
| C6 | **写 md 工作流**（写锁 claim/release、写完 `sync_meta` 上报、分类一致性、文件工具不可用时的 `__writes` 回退） | `:1706-1712` | **solver / method-keeper** 专属 | 首：`WRITE-INTO-MD WORKFLOW（优先推荐）：把研究内容直接写进你的归属 Markdown 文件…`；尾：`…两种方式二选一，不要重复。`；**710 B** | 无 |
| C7 | **求解器归属文件**（Progress/&lt;qid&gt;/&lt;dir&gt;.md、Propos/&lt;分类&gt;/&lt;pid&gt;.md 锚点与 `### 证明 1｜…`） | `:1714-1718` | **solver** 专属 | 首：`你的归属文件：- 求解器：把该方向的完整叙述…`；尾：`…别省。`；**390 B** | 无 |
| C8 | **方法整理代理归属文件**（`Methods/<m-id>.md` 锚点与三段） | `:1720-1723` | **method-keeper** 专属 | 首：`你的归属文件：- 方法整理代理：写 Methods/<m-id>.md…`；尾：`…## 改进历史`。；**159 B** | 无 |
| C9 | **能力与权限**：网络/脚本开关、每轮工具调用上限、可读 Verified/、基线引用纪律、读取方式（先粗扫锚点再细读）、按角色的输出纪律 | `:1743-1768` | 每个子代理提示（verifier 也用，只是措辞分支不同） | 首：`YOUR PERMISSIONS / CAPABILITIES:`；尾：`…read the full card for 陈述/证明/证伪/解法/核心内容 sections.`；**2,715 B** | `params.solverMaxToolCalls`、`params.verifierMaxToolCalls`、`params.solverAllowNetwork`、`params.verifierAllowNetwork`、`params.solverAllowScripts`、`params.verifierAllowScripts`；分支键 `role` |
| C10 | **方法库索引**：`AVAILABLE METHODS (Methods/, 含全局, 前 N 条; 完整列表见 Methods/ 目录)` + 行 | `:1769-1776` | 研究类角色（explorer/rederive/solver） | 首：`AVAILABLE METHODS (Methods/, 含全局, 前 `；尾：`…完整列表见 Methods/ 目录):` + 行列表；**输出 ≤ 20 行**，源码 **587 B** | 运行期 `methods`/`globalMethods` 集合（**动态**），`shown.length` |

### §1.4 知识上下文的**组合器**（角色 → 段集合）

| # | 构件 | 位置 | 时机 | 组合规则 | 插值变量 |
|---|---|---|---|---|---|
| D1 | `coreKnowledgeContext()` | `:1725-1728` | 所有子代理 | `C1+C2+C3+C5`，前缀行 `KNOWLEDGE BASE & DATA MODEL (definition contract you MUST follow):` | 无 |
| D2 | `researchKnowledgeContext()` | `:1730` | explorer / solver / method-keeper | `D1 + C4` | 无 |
| D3 | `verifierKnowledgeContext()` | `:1732` | **verifier** | **只有 `D1`**（不给方法库规则/写文件规则） | 无 |
| D4 | `solverKnowledgeContext()` | `:1733` | solver | `D2 + C6 + C7` | 无 |
| D5 | `methodKeeperKnowledgeContext()` | `:1734` | method-keeper | `D2 + C6 + C8` | 无 |
| D6 | `knowledgeContextText(role)` | `:1735-1742` | 每次 `*Prompt()` 内 | **`params.knowledgeContext` 非空 ⇒ 整体覆盖，D2–D5 全部不生效**；否则按 `role` 选 D2–D5；空串则整段不注入 | `params.knowledgeContext`、`role` |

> **互斥要点**：D6 是**三选一之上的再覆盖**——(a) 用户自定义知识上下文 / (b) 四个内置组合之一 / (c) 不注入。

### §1.5 角色提示词（通道 ②；8 个构造器）

> 每个构造器都是**定序字符串拼接**；下表"首/尾"取各构造器里**不变的字面部分**，"字数"是构造器源码字节。

| # | 构件 | 位置 | 时机（谁被派、什么时候） | 首 / 尾 与字数 | 插值变量 |
|---|---|---|---|---|---|
| E1 | **explorer 提示**（首阶段元认知 brainstorm → 3–6 个互异方向 → 方向 JSON 契约） | `:1777-1789`；派遣 `:2484`、`:2572` | 问题**没有任何方向**或方向全死时（`dirs.length === 0`） | 首：`You are a research mathematician orchestrating strategy for one problem.`；尾：数学行 + `formalDailySection()`；**1,809 B** | `explorerPersona`、`q.id`、`q.陈述`、方法索引、能力开关、math/formal 行 |
| E2 | **重派生提示 rederive**（带 `PRIOR DIRECTIONS (with blockers)`：历史进展/阻塞/可行性衰减 → 1–3 条全新方向） | `:1790-1804`；派遣 `:2484`/`:2572` 的另一支 | **已有方向**但全部停滞/死路时（`dirs.length > 0`） | 首：`You are a research mathematician re-deriving strategy for a problem whose prior directions stalled or failed.`；尾：同 E1；**1,760 B** | `explorerPersona`、`q.id`、`q.陈述`、`prog[]`、math/formal 行 |
| E3 | **solver 提示**（PROBLEM/DIRECTION/ROUND → 历史进展 → 知识上下文 → 目标/上报清单 → q_sub 规则 → 概率规则 → 完整解法自检 → 状态语义 → 引理规则 → 输出契约 A/B → 数学/形式化行） | `:1823-1853`；派遣 `:2495`/`:2586`、续跑 `:2677`/`:2693` | 某**活跃方向**需要求解一轮时 | 首：`You are a dedicated solver agent working ONE solution direction of a math problem (agent_self_iteration).`；尾：`…并把 solution_text 写进 meta。` + math/formal 行；**6,046 B（最大一块）** | `solverPersona`、`q.id`、`q.陈述`、`dir.title/method/core_assumption`、`round`、`params.solverMaxRounds`、`progressText`、math/formal 行 |
| E4 | **verifier 初审提示**（TARGET → 知识上下文 → Result 语义/校准/Reason 必填/引用纪律 → [Lean 段] → JSON 契约） | `:1859-1873`；派遣 `:2252` | 出现**待验证对象**且投票数不足时 | 首：`You are a STRICT peer reviewer verifying one mathematical object. Check it multiple times.`；尾：`{"Result":0.5,"Reason":"<MANDATORY, non-empty…>"…formal…}`；**2,003 B** | `verifierPersona`、`r.kind/pId/qid/概述/side/process`、`params.verifierMaxToolCalls` 等、`formalOn()` |
| E5 | **verifier 辩论提示**（同一对象的"交流群"：完整辩论史 → 回应/改票要写理由 → 校准纪律 → [Lean 段] → JSON 契约） | `:1874-1887`；续跑 `:4215` | 初审后需要**多轮辩论**时（同一子代理 followup，**不是**新提示词） | 首：`You are one reviewer in a DEBATE ("交流群") about this object.`；尾：`{"Result":0.5,"Reason":"…","changed":"…"…formal…}`；**1,514 B** | 同上 + `transcript` |
| E6 | **planner 提示**（调度器人格 → **CURRENT STATE BRIEF (JSON)** → 动作词表 9 项（6 接受/3 仅告示）→ HARD RULES → 计划 JSON 契约） | `:1888-1904`；派遣 `:2342` | `plannerEnabled` 且**有可调度工作**且冷却已过且无在途 planner | 首：`You are the SCHEDULING PLANNER of a multi-agent mathematical research system.`；尾：`{"summary":"one-line plan rationale","plan":[…]}`；**3,145 B** | `plannerPersona`、`params.planningHorizon`、`brief`（§1.7 G1） |
| E7 | **method-keeper 提示**（提炼理论/框架/工具/方法/思想 → RECENT WORK DIGEST → 合并/建卡判断 → [数学行 + 顺手形式化 + 方法沉淀×Lean] → 输出契约 A/B） | `:1905-1919`；派遣 `:2840` | `methodKeepDue()`（interval 或 pending≥every） | 首：`You are the METHOD KEEPER of a mathematical research system.`；尾：`{"__writes":[{"path":"Methods/<m-id>.md",…}],"meta":{…}}`；**2,217 B** | `methodKeeperPersona`、`digest`（G2）、math/formal 行 |
| E8 | **paper-writer 提示**（单作者模式 → HARD RULES → 9 节骨架 → 无证据句 → md 子集 → LaTeX 缺失四步指引 → 输出契约 → **MATERIAL**） | `:4548-4563`；派遣 `:4694` | 收口判定成立（`finalPaper` 且无未决对象）时派"论文撰写"子代理 | 首：`You are the DEDICATED PAPER WRITER (single-author mode) of a math research run that has just CONVERGED.`；尾：`MATERIAL (evidence only — do not add anything beyond it):` + digest；**2,479 B** | `o.lang`、`PAPER_SKELETON`、`PAPER_NO_EVIDENCE`、`digest`（G3） |

> **E3/E4/E5 的互斥**：E4 与 E5 是**同一对象的两个阶段**（初审 → 辩论），同一子代理不同轮；E1 与 E2 是同一条派遣分支的**两支**（`dirs.length > 0` 决定），永不并存。
> **E8 的特殊性**：它**没有** persona 槽、没有知识上下文、没有能力段、没有 math/formal 行——是 v3 里**唯一**一个"只给材料与骨架"的子代理提示。

### §1.6 插值片段（不单独成文，被上面的构造器消费）

| # | 构件 | 位置 | 时机 | 首 / 尾 与字数 | 插值变量 |
|---|---|---|---|---|---|
| F1 | `personaText(key)`：把 5 个人设参数之一变成"人设 + 空行"前缀；空 = 不注入 | `:1679` | 每次角色提示的最前面 | 首：`params[key] ? (String(params[key]) + '\n\n') : ''`；**不产生固定文本** | `solverPersona`/`verifierPersona`/`explorerPersona`/`plannerPersona`/`methodKeeperPersona`（**五槽，按构造器各取其一**） |
| F2 | `directionSummary(d)`：`id …「title」method=… round= status= survival= [lemmas] [routes] [lessons] [blockers]` | `:1805-1812` | solver 第 2 轮起的"历史进展" | 首：`id ' + d.id + '「' + d.title + '」method=`；**661 B 源码** | `d.id/title/method/round/status/survival/lemmas/routes/lessons/blockers` |
| F3 | `buildSolverContext(all, own, round, perSolver)`：本轮带几个方向摘要（第 1 轮只带自己；第 2 轮起自己 + 其他活跃方向） | `:1813-1822` | solver 每轮 | 首：`const n = Math.max(1, Number(perSolver) \|\| 1)`；**456 B** | `params.directionsPerSolver`、`all`、`own`、`round` |
| F4 | `verifierTargetText(r)`：按 `r.kind`（proposition/prop-proof/problem）给 TARGET 文本 | `:1854-1858` | 初审/辩论 | 首：`PROPOSITION (id: `；尾：`SOLUTION TO CHECK:`；**347 B** | `r.kind`、`r.pId/qid`、`r.概述`、`r.side`、`r.process` |

### §1.7 简报 / 摘要构造器（喂给 planner 与 method-keeper 与 paper-writer）

| # | 构件 | 位置 | 时机 | 首 / 尾 与字数 | 插值变量 |
|---|---|---|---|---|---|
| G1 | **`buildBrief()` 任务简报 JSON**：`at/horizon/free_slots/maxParallelThreshold/problems[]/verify_candidates[≤10]/active_agents[]/methods[≤20]/pending_inventions/last_plan/recent_events[8]` | `:2288-2315` | 每次 `callPlanner()`（`:2337`） | 首：`{ at, horizon: params.planningHorizon`；尾：`recent_events: activityLog.slice(-8)`；**1,900 B** | 全量调度状态（**每个 tick 都变**） |
| G2 | **`buildMethodDigest()`**：待沉淀发明（≤16 条标题/类型/来源 + 60 字摘要）＋最近命题（≤6）＋最近方向教训 | `:2844-2860` | 每次起 method-keeper | 首：`- 待沉淀发明 `；尾：`- 最近方向教训（摘要）：` + 行；**1,019 B** | `methodLog.pendingInventions`、`allPropos()`、`dirState`（**动态**） |
| G3 | **`buildPaperDigest()` 论文材料**：PRESET/PROJECT → `[ORIGINAL PROBLEMS]` → `[PROPOSITIONS]` → `[METHODS / ARTEFACTS]` → `[STILL UNVERIFIED]` → `[UNRESOLVED / REFUTED]` → `[EVIDENCE INDEX]` | `:4484-4545` | 每次派 paper-writer | 首：`PRESET: vibe-math-v3 (single-author)`；尾：`- ` + 证据文件行；**3,812 B** | 问题/命题/方法/未决对象/证据索引（**动态**）；`formalOn()` 决定是否写形式化字段（`:4467`、`:4477`、`:4508`） |
| G4 | `PAPER_PATH_NOTE`：成员文件工具按**会话 cwd** 解析、计算产物要用 `receipt.scriptAbs` 等 | `:4465` | G3 的 `[PROPOSITIONS]` 与 `[METHODS]` 两处（`:4504`、`:4515`） | 首：`（路径说明：成员/子代理的文件工具按**会话 cwd** 解析相对路径…`；尾：`…把 receipt.cwd 与 receipt.scriptPath 拼起来。）`；**常量** | 无 |
| G5 | `PAPER_SKELETON`：**固定 9 节**（摘要/引言与问题背景/原问题的完整解法/已检验通过的命题/已解决的子问题与中间成果/创造或发现的有价值之物/规律总结/讨论、局限与展望/附录：证据与文件索引） | `:5617-5627` | E8 的骨架段（`:4556`）＋md/tex 生成（`:4652`、`:4666`） | 首：`{ key: '摘要', spec: '1 标题、作者、日期、摘要（原问题 + 主要结论）' }`；尾：`{ key: '附录：证据与文件索引', spec: '9 Verified/、Logs/、关键卡片路径' }`；**9 条** | 无 |
| G6 | `PAPER_NO_EVIDENCE`：`（本节暂无证据支持的内容——不编造。）` | `:5628` | E8（`:4557`） | **19 字** | 无 |

### §1.8 形式化 / Lean 注入族（**全部在构造提示词那一刻现算**）

| # | 构件 | 位置 | 时机 | 首 / 尾 与字数 | 插值变量 |
|---|---|---|---|---|---|
| H1 | **`formalPromptBlock(target)`**：验证轮形式化段。三分支——(a) `passed` ⇒ **审查对象变成"忠实性"**、偏差**不投 0** 而给弃权值 + `decision:'defect'` 出口、`require` 才"不定论"/`encourage` 明说"本档没有门禁，请务必给弃权值"；(b) `blocked` ⇒ 复核阻塞判断；(c) 未形式化 ⇒ 判难度、工具清单、工作目录、三条筛选判据、先查库再写、没把握记 blocked、异步"落地前不得当已通过"、无工具链/无 subprocess 也算显式阻塞 | `:3168-3218` | **只在 verifier 的 E4/E5 里**、且 `formalOn()`；末尾拼 `leanNoticeSection()` + `mathWorkLine()`（`:3217`） | 首：`【Lean 形式化验证（鼓励/强制模式）】`；尾：`…定论门禁可以据此放行。`；**3,353 B** | `params.formalVerify`（off/encourage/require）、`formalOf(target).status/proof/file/note`、`vibeRoot()`、`leanNoticeSection()`、`mathWorkLine()` |
| H2 | **`formalWorkLine()`**：日常"顺手形式化"一行（含主动档/普通档、三条筛选判据、先查再写、没把握记 blocked、异步纪律），并**顺带取走一次性 Lean 公告** | `:3220-3248` | solver / explorer / rederive / method-keeper（经 H3） | 首：`【顺手形式化（鼓励/强制/仅主动性）】`；尾：`…**在作业落地为通过之前，不得把该对象当成已通过。**` + 公告行；**2,035 B** | `params.leanInitiative`（off/normal/eager）、`params.formalVerify`、`vibeRoot()`、`leanNoticeSection()` |
| H3 | **`formalDailySection()`**：`H2 + formalReplyNote()`；两者都空则整段不注入 | `:3255-3260` | 每轮工作类提示末尾（E1/E2/E3/E7） | 首：`const line = formalWorkLine()`；**202 B** | `params.formalVerify`、`params.leanInitiative` |
| H4 | **`formalJsonField(target)`**：回执里的 `"formal":{target,decision:used\|blocked\|defect,file,note}` | `:3262-3266` | `formalOn()` 时拼进 E4/E5 的 JSON 契约 | 首：`,"formal":{"target":"`；尾：`note":"难度判断/阻塞原因/具体偏差"}`；**271 B** | `target`、`formalOn()` |
| H5 | **`formalReplyNote()`**：工作轮回执契约里**再给一遍** formal 字段说明（含 defect 语义） | `:3272-3279` | `formalOn()` 时经 H3 注入 | 首：`形式化回执（本模式）：若你本轮对某个对象做了形式化难度判断…`；尾：`…把对象放回形式化待办）。`；**426 B** | `formalOn()` |
| H6 | **`leanNoticeSection()` + `leanSettleNotice()` + 会话卸载公告**：一次性公告块（取走即清空，**≤20 条**）；四种结局（中断/超时/通过/失败）＋两种"已变"（文件哈希/构建上下文不一致）＋恢复时的重新入队/补写 passed 公告 | `:3436-3440`（取）、`:3467-3475`（措辞）、`:3434`（入队、上限 20）、`:3589-3642`（恢复/卸载时推入） | 被 H1/H2 取走，进入**下一轮**提示 | 首：`【形式化结果】`；尾（失败）：`：失败（exit N，见 stderr 尾部）`；**203 B（取）+ 818 B（措辞）** | `leanPendingNotices[]`（jobId/kind/target/exitCode/ms/archive） |

> **三轴互斥（v3 的 `formalVerify` 与 `leanInitiative` 是两根独立的轴，源码注释 `:3221-3224` 明写）**：
> - `formalVerify=off` ⇒ H1/H4/H5 全空（验证阶段零 Lean 文本）；但 `leanInitiative=eager` 时 H2 **仍然注入**（日常主动性 ≠ 验证要求强度）。
> - `leanInitiative=off` ⇒ H2 空；`formalVerify` 非 off 时 H1/H4/H5 仍工作。
> - 两者都 off ⇒ 子代理提示里**一个 Lean 字都没有**。

### §1.9 数学计算注入族

| # | 构件 | 位置 | 时机 | 首 / 尾 与字数 | 插值变量 |
|---|---|---|---|---|---|
| I1 | **`mathWorkLine()`**：每轮可用性行；`mathComputation=off` 或**还没探测过** ⇒ 空串（真零注入）；否则 = `mathAvailabilityLine(probe,'zh',mathMode)` | `vibe-math-v3.js:780-784`；模块 `math-computation.js:1467-1481` | E1/E2/E3/E7 末尾、H1 末尾 | 首：`- math_computation：可用引擎 `；尾（typed+shell 多一行）：`…shell 无回执、无超时/输出上限保证）`；**动态** | `params.mathComputation`、`mathProbe.engines[]`、`params.mathMode` |
| I2 | **数学规则常量族**（被 I1 组装）：① archive→edit→re-run 长段（`数学计算：先用 op:'probe'`…）② 替代必须声明（诚实性）③ 5 条 `MATH_RULE_LINES`（先 probe 再 run／复核 re-run／归档即引用／判断三标准／不得当已证明）④ shell 兜底标注（**只在 typed+shell 档**） | `math-computation.js:74-82`（工具描述）、`:84-85`（persona 行）、`:90-94`（archive 工作流）、`:102`（替代声明）、`:106-113`（5 条规则）、`:119`（shell 兜底） | 随 I1 进入子代理提示；工具描述 B1 另走通道 ③ | 首：`- 归档→编辑→重跑（**回执＝一次 math_computation 调用的 JSON 结果**…`；尾：`…shell 兜底不算归档。`；**各常量源码合计约 3 KB** | engine 列表、`mathMode` |

### §1.10 根会话通知 / 推送族

| # | 构件 | 位置 | 时机 | 首 / 尾 与字数 | 插值变量 |
|---|---|---|---|---|---|
| J1 | **进度推送**（`reportMode` = push/both 且到期）：`[Vibe Math V3] 进度更新：项目 "…" 运行中=…，问题 x/y 已解决…请调用 vibe_math_report …再用人话简要汇报（不打断用户，简短即可）。` | `:1523-1544`（文案 `:1532-1535`） | 周期性/脏标记时，作为 **rootAgent.followup 的 user 消息**注入根会话 | 首：`[Vibe Math V3] 进度更新：项目 "`；尾：`…再用人话简要汇报（不打断用户，简短即可）。`；**1,437 B 源码** | `currentProject`、`report.running/problems/propositions/activeCount/pendingDecisions/queuedPlanActions` |
| J2 | **人读报告文件**（`Logs/报告.md` / `Progress_Logs/report.json`） | `:1486-1521`（叙事）／`:1460-1476`（json） | `reportIntervalMs`/脏标记 | **是文件，不是提示词**（列入本表只为划清边界：复刻时不要误当提示词段搬） | 全调度状态 |

### §1.11 工具面 / 参数面的**另一半**（v3 独有、vmu 不需要逐字复刻）

| # | 构件 | 位置 | 说明 |
|---|---|---|---|
| K1 | `vibe_math_claim_write` / `vibe_math_release_write` 的**写锁语义**（租约续期、持有者消失后过期、返回可写展示路径） | `:6026-6027`、`:6028` 附近的 `sync_meta` 契约 | 这组**不只是文案**：C6 的写工作流段直接依赖它们存在 |
| K2 | `vibe_math_sync_meta` 的 6 种 `meta.kind` 字段契约（directions/solver/methods/…） | `:6028` | 与 E1/E3/E7 的 JSON 契约**逐字耦合**；改一处必须改另一处 |
| K3 | `vibe_math_set_params` 的 Lean/论文/数学三族参数说明（一段超长描述） | `:6006` | 与 B2（PARAM_SCHEMA）**同语义两份文本** |

**§1 合计：表格行 54 行 = 提示词文本构件 50 条 + 边界行 1 条 + 工具语义行 3 条。**

- **50 条提示词文本构件**：A 4 + B 3 + C 10 + D 6 + E 8 + F 4 + G 6 + H 6 + I 2 + J1 1（J1 是注入根会话的提示文本）。
- **边界行 1 条**：J2（`Logs/报告.md`／`report.json`）是**文件**，不是提示词——列入仅为划清边界。
- **工具语义行 3 条**：K1–K3 是工具契约/锁定语义，不是提示词文本。
- 口径说明：B1 的 **36 个**工具描述、B2 的 **64 条**参数描述各算 **1 行**；若逐条拆开计，条目数 ≥ 150。

（派生：`^\| (A|B|…|K)[0-9]+ \|` 匹配 54 行，其中 A=4、B=3、C=10、D=6、E=8、F=4、G=6、H=6、I=2、J=2（含 J2）、K=3。）

---

## §2 v3 的提示词装配顺序（"提示词交互"的核心）

### 2.1 根会话（通道 ①）

```
[宿主基础系统提示]
  → persona.prefix（A1）            （或 persona.text（A2），二者取一 —— 由宿主 persona 插件决定，§5-U1）
  → persona.suffix（A3）
  → [plan mode 时] plan-mode 段（A4）
[工具目录]  ← B1（36 条）+ B2（set_params/setup 的 schema 描述）+ B3（/vibe 命令面）
```

★ 根会话面是**静态 YAML**：它**不随参数热切换**（`formalVerify`/`mathComputation` 改成 off 也不会让 A1/A2 里的 Lean/数学文案消失），这与子代理面的"构造期现算"是两套纪律（§5-U9）。

### 2.2 子代理（通道 ②）

**通用骨架（v3 的定序，任何角色都遵循）：**

```
1. 人设前缀            personaText(<role>Persona)        空则整段消失
2. 角色抬头 / 目标      固定字面 + 问题/对象插值
3. [历史进展]          仅 solver(第2轮起) / rederive / debate 有
4. 知识上下文          knowledgeContextText(role)   ← C1→C2→C3→C5 (+C4) (+C6,+C7/C8)
5. 方法库索引          methodsIndexText()          ≤20 行；无方法则整段空
6. 能力与权限          capabilitiesText(role)
7. 角色任务/回执契约    各构造器主体
8. 数学可用性行        mathWorkLine()              off/未探测 ⇒ 空
9. 顺手形式化日线      formalDailySection()        = formalWorkLine + formalReplyNote
```

**八个具体序列（逐段编号，便于 P1-6 逐段落 sections）：**

| 角色 | 序列 |
|---|---|
| explorer（E1） | 人设 → 角色抬头/问题 → **知识上下文(D2)** → 方法索引 → 能力 → brainstorm 任务 → 方向 JSON 契约 → 数学行 → 日线 |
| rederive（E2） | 人设 → 抬头/问题 → **PRIOR DIRECTIONS** → 知识上下文(D2) → 方法索引 → 能力 → 重派生任务 → 方向 JSON 契约 → 数学行 → 日线 |
| solver（E3） | 人设 → 抬头(PROBLEM/DIRECTION/ROUND) → [第2轮起：历史进展] → 知识上下文(**D4**) → 方法索引 → 能力 → 目标/上报清单 → q_sub 规则 → 概率规则 → 完整解法自检 → 状态语义 → 引理规则 → 输出契约 A/B → 数学行 → 日线 |
| verifier 初审（E4） | 人设 → TARGET → 知识上下文(**D3**) → 能力 → Result/校准/Reason/引用 → **[formalPromptBlock（内含 Lean 公告 + 数学行）]** → JSON 契约(+formal 字段) |
| verifier 辩论（E5） | 人设 → TARGET → 知识上下文(D3) → 能力 → 辩论史 → 回应/校准 → Reason 必填 → **[formalPromptBlock]** → JSON 契约(+changed+formal) |
| planner（E6） | 人设 → 调度器职责 + horizon → **CURRENT STATE BRIEF JSON** → 动作词表（6 接受 + 3 仅告示）→ HARD RULES → 计划 JSON 契约 |
| method-keeper（E7） | 人设 → 知识上下文(**D5**) → RECENT WORK DIGEST → 合并/建卡判断 → 数学行 → 日线 + [方法沉淀×Lean 行] → 输出契约 A/B |
| paper-writer（E8） | 角色抬头 + 语言 → HARD RULES → **9 节骨架** → 无证据句 → md 子集 → **LaTeX 缺失四步指引** → 输出契约 → **MATERIAL** |

### 2.3 段与段的**互斥关系**（复刻时最容易丢的东西）

| # | 互斥对 | 谁决定 | 证据 |
|---|---|---|---|
| X1 | **5 个人设槽**（solver/verifier/explorer/planner/methodKeeperPersona）：每次只取一个；全空 ⇒ 无前缀 | 构造器参数 | `:1679` + 各 `*Prompt()` 第一句 |
| X2 | **explorer vs rederive**：方向为空取 explorer，否则取 rederive | 调度器 | `:2484`、`:2572`（`dirs.length > 0 ? rederivePrompt : explorerPrompt`） |
| X3 | **内置知识上下文 4 组合**（verifier=core／explorer=core+method／solver=+write+solverFiles／keeper=+write+keeperFiles） | `role` | `:1735-1742` |
| X4 | **用户 knowledgeContext vs 4 内置**：前者非空 ⇒ 全盘覆盖 | `params.knowledgeContext` | `:1736` |
| X5 | **初审 vs 辩论**：同一对象的两个阶段，**不在同一提示里** | 验证流程 | `:2252` 建初审判；`:4215` 辩论轮 followup |
| X6 | **数学行**：`off` ⇒ 空；`typed` ⇒ 无 shell 兜底句；未探测 ⇒ 空 | `mathComputation`/`mathMode` | `:780-784`、`math-computation.js:1479` |
| X7 | **形式化两轴**：`formalVerify`（验证强度，H1/H4/H5）与 `leanInitiative`（日常主动性，H2）独立 | 两参数 | `:3221-3224` |
| X8 | **流程独占**：planner 仅 `plannerEnabled`；method-keeper 仅到期；paper-writer 仅收口 | 调度器 | `:2316-2335`、`:2824-2832`、`:4690-4694` |
| X9 | **planner 不拿知识上下文/能力/数学/形式化**：它只拿简报 + 动作词表 | 构造器 | `:1888-1904`（对照 E1–E5/E7 都带 C/D 段） |
| X10 | **方法索引条数上限 20**（防提示词膨胀），其余"读 Methods/ 目录" | 代码常量 | `:1773-1775` |

---

## §3 vmu 侧已有什么

### 3.1 `packs/v5r/prompts/**` 提供的段 / 绑定 / 角色

| 通道 | 文件 | 内容 | 关键行 |
|---|---|---|---|
| **根会话面**（宿主 system prompt） | `packs/v5r/prompts/assistant.json` | **3 段**（`hostPrompt: true`）：`v5r-assistant-identity`(605) 所办身份界线 / `v5r-assistant-reporting`(606) 汇报第一职责 / `v5r-assistant-parameters`(607) 参数面边界；**`bindings: []`**；合计 **1,449 字** | 文件 `:5-31`；读取端 `vibe-math-vmu.js:233-257`（**只认 `hostPrompt === true`**，`:247`），注册端 `:792-832` |
| **每轮回合面**（管线段） | `packs/v5r/prompts/v5r-charter.js` + `v5r-blocks-a.js` + `v5r-blocks-b.js` | **58 块**（shared 30／role 6／phase 17／leader-conditional 5），orders **690–820**，组装文本 **14,672 字**；`CHARTER_BINDINGS` **46 条**（role 18／phase 23／member 5）；leader-conditional 有 with-leader/leaderless 两变体，缺 leaderless 变体时**具名占位**（`CHARTER_LEADERLESS_MISSING_TEXT`），不静默省略 | `v5r-charter.js:37`（拼块）、`:40-45`（role/phase 绑定）、`:62-79`（member 方向绑定）、`:82-83`（变体表）、`:98-101`（缺变体名单）、`:108-120`（sections 生成）、`:131`（默认 leader-assuming） |
| **每轮**（1 段） | `packs/v5r/prompts/v5r-assistant.js` | `v5r-report-duty`（order 608，**449 字**）：汇报是成员义务／对外出口是所办／参数入口属所办／汇报≠结论 | `:20-35`、`:38` |
| **persona 采集块**（**内容证据，不是运行时**） | `packs/v5r/prompts/v5r-persona.js` | **11 段**（opening/roster/rules/formats/duties/thresholds/rhythm/hiring/taskboard/discipline/stopping，orders 610–620）＋**20 条绑定**；含 perRole/leaderless 变体 | `:21`、`:102`、`:206`；**未进 `PACK.sections`**（见下） |
| **语料**（对比基线，**不是模板**） | `packs/v5r/prompts/v5r-prompts.js` | **67 条**交付提示词（31 种 kind），带 source sha256 与门禁断言 | `:8-14`（元数据）、`:50-120`（`PROMPTS`） |
| **段开关策略**（纯函数） | `packs/v5r/middleware/prompt-switches.js` | 3 个 off 开关（指针契约/资源自检/反馈行）／2 个回复目录二选一（compact \| full）／**3 个会议态互斥**／**4 个形式化状态行互斥且必显一**；不认识的状态**具名拒**不猜 | `:25-29`、`:32-33`、`:35-39`、`:42-47`、`:65-120`、`:128-133` |
| **通知块** | `packs/v5r/notices.js` | 4 种通知形状（分派/督办/群聊/所办通知）＋ `[新到的消息]` 收件箱块（每条缩进 2 格）＋ 未知 kind 具名拒 | `:46-78`、`:99-106`、`:109-116` |

**v5r manifest 如何声明这些段**：`PACK.sections` / `PACK.bindings` 是 **getter**（`v5r-core.js:269-288`）→ 组装 `[...CHARTER_SECTIONS, v5rRoleSection, ...V5R_ASSISTANT_TURN_SECTIONS]`（`:344`）；`assertRuntimeSafeSections()`（`:400-423`）是**"采集快照不得当运行时段"的具名门**（拒绝 `轮次 N`/`有表决权者 N 人`/绝对路径），且**同时检查 sections 与 bindings**。

### 3.2 `kernel/prompt/index.js` 的管线支持什么

| 能力 | 语义 | 证据 |
|---|---|---|
| **段的形状** | `{ name(kebab), order, range(由 order 派生), scope, mutable, source, lang, terms, text/template/file, vars, truncate, replaces }`；`range` 声明必须与 order 落区**一致**，否则拒；**pack 段不得占 facts 区** | `:24-30`（`ORDER_RANGES`：facts 0–199／charter 200–399／contract 400–599／**pack 600–899**／override 900–9999）、`:308-393` |
| **变量白名单（固定）** | `member/role/roleLabel/phase/time/pack/task/roster/round/quorum/statusBlock` + 带参 `setting:`/`count:`；**未注册变量具名拒**；值里的模板语法被转义（值不能注入占位符） | `:50`、`:477-505` |
| **绑定四维＋固定优先级** | `BINDING_PRIORITY = ['role','phase','member','task','agent']`（低→高，**最具体者胜**）；**一段一赢家**（binding **替换**段文本，不是追加）；同维度平票 ⇒ **具名拒** `VMU_PROMPT_BINDING_CONFLICT`；绑定指向不存在的段 ⇒ 拒 | `:53`、`:270-289`、`:405-411`、`:425-439`、`:649-673` |
| **`overrides`** | 声明式覆盖（`vmu.prompts.overrides`）+ 调用方 map + `overridesDir/<name>.md`；`whoMayOverride` 校验；**`state`/`mutable:false` 段不可覆盖**（`VMU_NOT_PERMITTED`） | `:163-229`、`:718-733`、`:534-545` |
| **段开关** | `disable(name)`/`enable(name)`：关 ⇒ **整段跳过（标题也不出现）= 真零注入**；开关不是单向门；关不存在的段 ⇒ 具名拒 | `:291-299`、`:634-635` |
| **作用域过滤** | `scope: {member\|role\|phase\|task\|agent}` 决定**是否纳入本次装配**（不是替换） | `:413-421` |
| **中间件追加** | `prompt/section-assembled` 钩子可返回 `appendPrompt`（一段或数组），在**本次装配内**叠加；append 到不存在的段 ⇒ 自成一段 | `:551-576`、`:674-689` |
| **确定性** | 同一输入 ⇒ 同一字节（trim/换行固定）；返回 `sources` 溯源与 `truncation` 记录 | `:64`、`:631-695`、`:699-716` |
| **截断不静默** | 超限时把"（已省略更早 N 字符 · kept M）"**写进文本**并计数 | `:506-525` |
| **locale** | 同名段按语言取一份；缺语言按 `onMissing` warn/refuse | `:207-256`、`:453-468` |
| ** compaction / glossary** | 上下文压缩指令前缀；术语表 off/warn/enforce | `:99-160`、`:586-630` |
| **宿主适配** | 无宿主 import；`assemble()` 之后由宿主 systemPrompt 适配器接（缺失⇒`VMU_ENGINE_UNAVAILABLE`，不假拼） | `:17-18`、`:740-770` |

**回合循环怎么调用它**：`kernel/turn/index.js` 先跑 `sectionPolicy({settings,turn})`，逐条 `setSectionEnabled(name, enabled)`（`:710-714`），再 `prompt.assemble({member, role, roleLabel, phase, task, roster, quorum, statusBlock, round, settings})`（`:715`）；通知块在装配结果**前面**拼（`:699-703`、`:720`）。**相位集合**：内核 7 个 `founding/normal/checkpoint/verify/verify-debate/meeting/resume`（`:156`）＋ pack 声明的额外相位（v5r 加了 `heartbeat/paper-write/paper-review/paper-final`，`packs/v5r/index.js:51`）。

### 3.3 pack 的**两条提示词数据通道**（复刻 v3 必须选对）

| 通道 | 文件 | 谁读、什么时候 | 能表达什么 | 证据 |
|---|---|---|---|---|
| **纯数据·根会话** | `packs/<id>/prompts/assistant.json` | 插件**在建内核前**按 `config.packs` 里的 id 读；只有 `hostPrompt:true` 的段进宿主 system prompt | `{name, order, text}`（**无变量渲染、无绑定**） | `vibe-math-vmu.js:233-257`、`:792-832`；注意 **`:818` 是 `effectivePrompts.map(s=>s.text).join('\n\n')`，不做 `{{ }}` 渲染** |
| **纯数据·回合段** | `packs/<id>/prompts/sections.json` | 同上，`config.packs` 里的 id；读后并入内核 `sections/bindings` | `{sections:[{name,order,range?,text}], bindings:[{section,role\|phase\|member\|task,text}]}` — **只读这 4 个维度**，`scope/vars/truncate/replaces` **会被丢弃** | `vibe-math-vmu.js:317-351`（读）、`:520`（并入）；形状见 `packs/example-data/prompts/sections.json:3-21`、`docs/10-packs.md:484-489` |
| **JS manifest·段/绑定/策略** | `packs/<id>/index.js`（可指向 `prompts/*.js`） | **装载后**由 pack loader 注册/apply | 全字段（含 `scope`/`vars`/`replaces`）、`promptPolicies`、`phases`、`sections`/`bindings` getter | `kernel/pack.js:142`、`:177-178`、`:350-357`、`:552-567`；v5r 实例 `v5r-core.js:269-288` |

★ **两处硬约束（会直接卡住 P1-6）**：
1. **只有 `config.packs` 里的 id 才会被读**；只写 `vmu.packs.active` 的包拿不到 `assistant.json`/`sections.json`（`vibe-math-vmu.js:241-242`、`:328`）。
2. **pack 专属的 `sectionPolicy`/`noticeBlock`/`extraPhases` 目前登记在装配层的 `PACK_RUNTIME` 硬编码表里**（`vibe-math-vmu.js:447-459`），键是 pack id（现有仅 `v5r`）；**新 pack 要用"按轮关段/通知块/新相位"就必须改这一处装配**。manifest 里的 `promptPolicies` 只被 loader 收进 `onPromptPolicy` sink 并上报（`:460`、`:854`、`:1157-1159`），我**没有找到**把它回灌进 `turn.sectionPolicy` 的代码路径（§5-U4）。

### 3.4 `packs/v3/**` 当前落了什么（决定差集的分母）

| 文件 | 内容 | 提示词相关 |
|---|---|---|
| `packs/v3/index.js`（59 行） | `PACK`：`id:'v3'`、`settings:{}`（空）、`rules:[]`、1 个 middleware（`v3-tick`）；文件头明写 **"还没有落的东西…prompts/sections.json、slots（v3 的 planner/solver/verifier）…"** | **无**（`:16-18`） |
| `packs/v3/settings/defaults.json` | 构造期读的值（schedule 四键 + tickIntervalMs + records.tracks） | 无 |
| `packs/v3/middleware/tick.js` | `v3/tick` → 写一条 journal 记录 | 无 |
| `packs/v3/README.md` | 诚实边界：**"本轮没有任何提示词段、槽位、tracks、M1 规则"** | **无**（`:34-37`） |

⇒ **`packs/v3/prompts/` 目录不存在；差值就是"v3 的全部提示词"。**

---

## §4 差集与施工建议（给 P1-6）

### 4.1 差集总表

> "落段"一列的段名是我建议的 **kebab-case 名**（管线要求，`kernel/prompt/index.js:311-313`）；order 建议落在 **600–899**（pack 区）。
> "复用 v5r？"= 能否直接拿 `packs/v5r/prompts/**` 的段文本；理由见 §4.2。

| # | v3 侧构件（§1 编号） | vmu 现状 | 落段建议（`packs/v3/prompts/…`） | 复用 v5r？ |
|---|---|---|---|---|
| 1 | **根 persona A1/A2**（工具目录 + 数据模型 + 收口规则 + Lean + DISCLOSURES，11K 字） | 无 | **`assistant.json`（hostPrompt）拆 4 段**：`v3-root-toolkit`(600)/`v3-root-kb-rules`(601)/`v3-root-lean`(602)/`v3-root-disclosures`(603) | ✗ 新写（v5r-assistant 是"所办"身份，语义不同；但"分节 + hostPrompt"的**形状**可照抄） |
| 2 | **根 persona 的 `{{cwd}}`/`{{model}}`** | `assistant.json` 通道**不渲染变量**（`:818`） | 改写为静态措辞（"当前会话工作目录"），或把需要项目根的路径交给 `vibe_math_*` 工具回执／段内由工具输出提供 | —— |
| 3 | **plan-mode 段 A4** | 宿主 plan-mode 插件（`agent.cordis.yml:322-333`）自带 | **不复刻**（属宿主装配，不是 pack 提示词） | —— |
| 4 | **知识上下文 C1–C5**（可信分层/对象模型/目录/方法库/输出质量） | 无 | `v3-kb-trust-layers`(600)、`v3-kb-object-models`(601)、`v3-kb-folders`(602)、`v3-kb-output-quality`(603)、`v3-kb-method-library`(604) | ✗ 新写（v5r 没有"可信分层/卡片模型"这一族） |
| 5 | **写 md 工作流 C6**（claim_write/lease/sync_meta/`__writes` 回退） | **vmu 没有文件写锁面**（只有 `write_scopes` advisory，`docs/10-packs.md:135`） | `v3-write-workflow`(605)，但**必须重写"怎么写"**：v3 的两个锁工具名不能出现；改成"先读后写／冲突具名上报／`write_scopes` 声明" | ✗ 必须**改写**（照抄 = 提示词让模型调不存在的工具） |
| 6 | **solver/keeper 归属文件 C7/C8** | 无 | `v3-role-files-solver`(606) / `v3-role-files-keeper`(607) | ✗ 新写 |
| 7 | **能力与权限 C9**（网络/脚本开关、调用上限、读取方式） | 无 | `v3-capabilities`(608)：用 `{{ setting:vmu.v3.solverAllowNetwork }}` 等 + 角色绑定 | ✗ 新写（可借 v5r `v5r-turn-resources`(693) 的"资源块由 setting 决定"**范式**） |
| 8 | **方法库索引 C10**（动态 ≤20 行） | 无 | **不能进 `sections.json`**（装载期静态纯数据）；落 `v3-methods-index`(609) 的"标题/说明"由数据段承担，**列表本体由 M2 模块在装配时 `appendPrompt` 追加**（`kernel/prompt/index.js:562-576`） | ✗ 新写 + 新机制 |
| 9 | **8 个角色提示词 E1–E8** | vmu 回合按**相位**装配，没有"角色提示词"这一层；且 `role` 维是**成员种类**（kernel 不内置角色，`kernel/index.js:1416`），v3 pack 还**没声明 slots** | 用 **phase + task** 表达（推荐）或 sectionPolicy 关段：<br>`v3-role-explorer`(700, phase=normal, task=explorer)、`v3-role-solver`(701, phase=normal, task=solver)、`v3-role-method-keeper`(702, phase=normal, task=method-keeper)、`v3-role-planner`(703, phase=normal, task=planner)、`v3-role-verifier-review`(704, phase=verify)、`v3-role-verifier-debate`(705, phase=verify-debate)、`v3-role-paper-writer`(750, phase=paper-write) | ✗ 全部新写（v5r 的 role 块是院士/研究员/临时工，**语义不同**） |
| 10 | **两道验证规则**（Result 语义/0.5 校准/Reason 必填/只引 Verified） | vmu 有 `v5r-verify-core`(805)、`v5r-verify-reconsider`(819) | `v3-verify-rules`(706, phase=verify/verify-debate) | **可复用语料骨架**（同源自 v5r，docs/26 §3.18），但要按 v3 的字段名（`Result` 不是 `verdict`）改；diff 后复用 |
| 11 | **formal 族 H1–H5** | vmu 有：`v5r-formal-status-passed/blocked/attempted/none`(780–783)、`v5r-formal-work`(750)、`v5r-formal-work-rendered`(809)、`v5r-verify-formal-addendum`(808) | `v3-formal-status-*`(770–773) 可由 v5r 四段**复用名/换前缀**；`v3-formal-review`(774) 需把"passed ⇒ 忠实性 + defect 出口 + encourage 无门禁"写全（v3 独有 3 条） | **部分复用**（4 个状态段 + addendum + work 块），**passed 分支必须新写** |
| 12 | **Lean 通知 H6**（【形式化结果】四结局） | vmu 有通知通道：`noticeSource`（`kernel/index.js:1338`）＋ `noticeBlock`（`kernel/turn/index.js:699-703`）＋ v5r 的 `inboxBlock` 形状 | 作为 **v3 pack 的 notices 模块**（函数，不是 JSON 数据）：模板 `【形式化结果】…` 新写；通道复用 | 通道 ✓ / 措辞 ✗ 新写 |
| 13 | **数学族 I1/I2** | vmu 有同名工具 `math_computation`（`kernel/index.js:1565` 注册同名工具面）＋同一共享模块（`math-computation.js`）；v5r 已有 `v5r-math-rules`(699) | `v3-math-rules`(660，固定 4 条，可从 `MATH_RULE_LINES`+`MATH_SUBSTITUTION_RULE_LINE` 生成)＋**可用引擎 head 走 `appendPrompt`**（动态） | **固定规则可复用**（v5r-math-rules 的 3 条就是 `MATH_RULE_LINES` 逐字，`:264-267`）；动态 head ✗ 新机制 |
| 14 | **planner 简报 G1 + 动作词表 E6** | 无（v5r 没有 planner） | `v3-planner-rules`(703 内) 静态词表/硬规则；**brief JSON 动态 → `appendPrompt`** | ✗ 新写 |
| 15 | **method digest G2 / paper digest G3 / PATH_NOTE G4** | 无 | digest 走 `appendPrompt`；PATH_NOTE 可转 static 段（`v3-paper-paths`(752)） | ✗ 新写 |
| 16 | **论文 9 节骨架 G5/G6 + E8 契约** | vmu 有 `v5r-paper-write`(810)/`paper-review`(811)/`paper-final`(813) | `v3-paper-skeleton`(751)＋`v3-paper-contract`(753)：**单作者 9 节 + JSON sections 契约**，v5r 是"每人写一段+互审+定稿"，**不可整段复用** | **骨架 ✗**；**LaTeX 指引 ✓ 可复用**（`LATEX_ENGINE_NOTE`，`v5r-blocks-a.js:1-4`，与 E8 的四步三边界同源） |
| 17 | **根推送 J1** | vmu 有 `vmu.report` 原语（`kernel/report.js`）+ v5r pack 已用 `vmu.report.reports` 声明三种触发（`v5r-core.js:124-...`） | **不复刻文案**：用 `vmu.report.*` 声明（这是 vmu 的"更优"方向：汇报是声明驱动，不是硬编码 followup 文案） | ✓ **用声明，不搬文案** |
| 18 | **工具/参数面 B1/B2/B3** | vmu 工具面是 `vibe_vmu_*`（`host.js` 的 `TOOL_NAMES`，P0-10 建议只保留 10 个） | **不复刻 36 条**；但**角色段里提到的工具名必须改成 vmu 真名**（否则提示词教模型调不存在的工具） | ✗ |

### 4.2 可以直接复用 v5r 的段（及为什么可以）

| v5r 段 | 位置 | 为什么可以复用 |
|---|---|---|
| `v5r-math-rules`（先 probe 再 run／复核 re-run／替代必须声明） | `v5r-blocks-b.js:254-270`（order 699） | 这 3 条**逐字取自 `MATH_RULE_LINES`/`MATH_SUBSTITUTION_RULE_LINE`**（同一共享模块），v3 的 `mathWorkLine()` 用的是**同一个** `mathAvailabilityLine()`（`math-computation.js:1467-1481`）⇒ 复用不会产生第二份会漂移的文案；且"归档→编辑→重跑"长段可从同一模块常量生成（`math-computation.js:90-94`） |
| `v5r-formal-status-passed/blocked/attempted/none`（四分支，**总显示一条**） | `v5r-blocks-b.js:194-252`（orders 780–783）＋策略 `prompt-switches.js:42-47` | v3 的 `formalStatusLine()`（`:3005-3011`）语义同构（passed 要求"跑绿"、blocked 带原因、attempted、默认"未尝试"）；四段 + 一个"总是命中"的策略正是 v3 的行为 |
| `v5r-verify-formal-addendum`（回执 formal 字段，含 `defect`） | `v5r-blocks-b.js:280-291`（order 808） | v3 的 `formalJsonField()`（`:3262-3266`）字段集合完全相同（target/decision/file/note，decision ∈ used\|blocked\|defect） |
| `v5r-formal-work-rendered`（鼓励模式工作块：三条筛选判据/先查再写/不得提前声称通过） | `v5r-blocks-b.js:292-311`（order 809） | v3 的 `formalWorkLine()`（`:3229-3247`）与 `formalPromptBlock()` 未形式化分支（`:3196-3214`）写的是同一套纪律（同源自 v5r 源码，docs/26 §3.18） |
| `LATEX_ENGINE_NOTE`（有界四步 + 三条硬边界 + "仅论文阶段适用"包装） | `v5r-blocks-a.js:1-4` | v3 的 `paperWriterPrompt` 的 `LATEX-MISSING GUIDANCE`（`:4559`）是同一段（v3 原文只差"上报所办/群聊"的措辞）；v5r 版本多了"这段仅在论文阶段适用"的包装（docs/26 §3.17 的 UX 纪律）⇒ 复用是**更优** |
| `v5r-pointer-contract`（"刚才读过 ≠ 还在上下文"/按 id+指纹拉取/不一致就重取） | `v5r-blocks-b.js:72-93`（order 721） | v3 没有等价段，但 v3 的 `kcOutputQuality`（`:1702-1704`）与 `PAPER_PATH_NOTE`（`:4465`）是同一精神；**建议作为"更优"候选叠加**，但要在文档里标为"新增，不是复刻" |
| `v5r-turn-resources`（资源数字全部来自 setting） | `v5r-blocks-a.js:30-47`（order 693） | v3 的 `capabilitiesText` 也是"按参数现算"；照它的**范式**（值在 settings、段是数据）改写 C9，比把数字写死更优 |

### 4.3 必须新写的（不能"抄"的来源）

1. **v3 根 persona 四段**：工具目录、数据模型、收口规则、DISCLOSURES 都是 v3 专有；且路径/变量写法必须适配 vmu 的"成员 cwd"与 `vibe_math_*`/`vibe_vmu_*` 真名。
2. **6–8 个角色段**：explorer/rederive/solver/verifier-review/verifier-debate/planner/method-keeper/paper-writer——v3 的**问题/方向/对象**是 v5r 没有的概念（v5r 是"成员 + 命题 + 会议"）。
3. **`v3-verify-rules` 与 `v3-formal-review` 的 passed 分支**：字段名 `Result`（不是 `verdict`）、"偏差不投 0 + defect 出口"、"encourage 无门禁所以必须给弃权值"——这三条是 v3 行为的关键（`实现方案.md:572-576` 明列为"提示词硬要求"）。
4. **`v3-write-workflow`**：vmu 没有写锁工具面，必须换成 vmu 的真实机制（`write_scopes` + 先读后写 + 具名上报）。
5. **`v3-paper-skeleton` / `v3-paper-contract`**：单作者 9 节 + `{title,abstract,sections[]}` 契约，v5r 是多人分段。
6. **动态注入的三条通道**（不是段文本，是接线）：方法库索引、planner 简报、数学可用引擎 head——见 §4.4。
7. **`v3` notices 模块**（【形式化结果】四结局 + 恢复/卸载公告的措辞），通道可复用、措辞必须新写。

### 4.4 三条"动态 → 静态"的接线建议（最容易踩的一步）

v3 的提示词里，有四类文本**每次构造时现算**：`methodsIndexText()`、`buildBrief()`/`buildMethodDigest()`、`mathWorkLine()`（可用引擎）、`formalPromptBlock()`（对象状态）。vmu 的两条数据通道都是**装载期读的纯数据**，写进去就是"冻结"。

**建议落法（按优先级）**：
1. **M2 模块 `appendPrompt`**（`prompt/section-assembled` 钩子，`kernel/prompt/index.js:562-576`）：装配时按 turn 计算文本并追加到同名段。这是 vmu 已有的、最贴近 v3"构造期现算"的机制。注意：该钩子在**每次装配**都跑（`:551-576`），且 `vmu.middleware.dryRun` 只影响是否落地，不影响是否调用。
2. **`{{ setting:… }}` 变量**：只适合"改配置就改提示词"的少量值（如 `vmu.v3.maxRounds`），不适合列表/JSON（白名单只有 `setting:`/`count:` 带参，且值会被转义）。
3. **`override`**：只适合"人编辑一段文本"，不适合按轮变化。

**不要做**：把某一轮渲染出来的 `AVAILABLE METHODS…` / `{at, horizon, free_slots…}` / `可用引擎 python 3.12…` 直接粘进 `sections.json`（见 §4.5）。

### 4.5 ★★ 最容易在提示词上做错的一件事

> **把 v3 里"互斥"的角色/阶段提示词，落成"并列"的多个段。**

**判断**：这是最容易、也最难被发现的一种错。

**理由（三条，都能在代码里核）**：
1. **v3 的互斥写在【代码路径】里**：每次 `spawnChild` 只调**一个** `*Prompt()`（派遣点 `:2252`/`:2342`/`:2484`/`:2495`/`:2572`/`:2586`/`:2840`/`:4694`），explorer vs rederive 由 `dirs.length > 0` 二选一（`:2484`、`:2572`），verifier 初审/辩论是同一子代理的两轮（`:2252`、`:4215`）。**"互斥"是调用图的性质，不是文本的性质。**
2. **vmu 的段是【默认全装配】**：`assemble()` 把**注册表里每个段**按 order 拼起来（`kernel/prompt/index.js:579-583` `picked = [...new Set(...)]`），只有 `disabled`/`scope`/`override` 能改变；而 **binding 的语义是"同一段内选一个赢家替换文本"**（`:649-673`），**不是"多段选一"**。⇒ 把 8 个角色段**分别注册**，结果是**每个成员/每一步都同时收到 8 套人设、8 套回执契约**——提示词变长、字段名冲突（`Result` vs `meta.kind` vs `plan`），模型会挑错一套执行。
3. **这类错不会被"装配成功"的测试抓到**：管线会 `ok:true`、字节确定、无缺值；只有**内容断言**（"同一次装配里只能出现一个角色抬头 / 只能有一份回执契约"）才会红。v5r 已经为一类**同族**错误付过学费：绑定被写成"追加"时，一名研究员在 18,528 字里同时是院士、r-1、r-2、r-3，`m` 同时等于 1/2/3（`docs/26-turn-orchestration.md:421-430` 的 §3.20 ②）。那次是"同名段内追加"，这次是"不同名段并列"，**更难从单段文本上看出来**。

**正确做法**（P1-6 可直接照做）：
- **互斥 → 用 `phase` 绑定 + `task` 绑定**（管线四维之一，`kernel/prompt/index.js:53`），或
- **互斥 → 用 `sectionPolicy` 关段**（`kernel/turn/index.js:710-714`；v5r 的 `prompt-switches.js:65-120` 就是模板：`decisions:[{name,enabled}]`，同维度平票/未知值具名拒），或
- **互斥 → 用 `scope`**（若走 JS manifest 通道；注意 `sections.json` **不支持 `scope`**，`vibe-math-vmu.js:332-335` 只拷贝 name/order/range/source/text），
- 并**同时**写一条内容断言：`ok('一次装配只有一个角色', 角色抬头出现次数 === 1)`。

**紧邻的第二名（同一类、同样别做）**：把**动态文本**（方法索引/brief/可用引擎/对象形式化状态）写成静态段——这与 v5r 已经用 `assertRuntimeSafeSections()` 立门的那条纪律同源（`v5r-core.js:400-423`、docs/26 §3.20 ①），只是 v3 的动态源不是"某次捕获"，而是"每次构造"。

---

## §5 我没核到的（如实；不把"没读到"写成"没问题"）

| # | 未核项 | 为什么没核 / 影响 |
|---|---|---|
| U1 | **`persona` 的 `prefix`/`text`/`suffix` 三者谁生效** | 由宿主插件 `@deepseek-ai/dsh-persona` 决定，实现不在本仓；我只看到 `agent.cordis.yml` **同时**给了 `prefix`（11,479 B）与 `text`（11,372 B）。若两者都注入，v3 根 persona 就是**双份**；若只有 `text` 生效，`prefix` 是死文本。**这直接影响 §4 第 1 项的字数预算** |
| U2 | **`prefix`/`text` 差 107 字节是否是有意的** | 两段几乎逐字相同，`text` 开头多一句 `Your working directory is {{cwd}}.`；我**没有**判断这是历史残留还是刻意变体 |
| U3 | **`assistant.json` 的 `text` 是否会被宿主渲染 `{{ }}`** | 插件侧只做 `join`（`vibe-math-vmu.js:818`，不渲染）；宿主 systemPrompt 侧是否渲染，我没核。⇒ v3 根 persona 的 `{{model}}`/`{{cwd}}` 能否保留，取决于这个未核事实 |
| U4 | **manifest `promptPolicies` 是否真的回灌到 `turn.sectionPolicy`** | 我只读到 sink（`vibe-math-vmu.js:460`、`:854`）与上报（`:1157`、`:1159`）；`kernel/` 内 grep `promptPolicies` 只命中 `kernel/pack.js:142/350/556-567/592`（装载与上报）。**没有找到回灌点**，但也没做运行时实验 ⇒ 结论只能是"疑似缺口"，不是"确认缺陷" |
| U5 | **`agent.cordis.yml:322-333` 的 plan-mode 段是否在 v3 会话里实际注入** | 取决于宿主 plan-mode 插件的 `section` 语义；本仓看不到 |
| U6 | **v3 `math-computation.js` 是否还有别的模型可见文案** | 我只核了导出常量与 `mathAvailabilityLine`（`:74-119`、`:1467-1481`），**没有逐函数通读 1,481 行**；`MATH_TOOL_SCHEMA` 的 enum 描述等未逐条核 |
| U7 | **v3 `实现方案.md` 是否定义了未落地的提示词段** | 只读 §12/§15 与 grep 命中；它提到"后生问题规则"（`:594`）等设计要求，**是否全部落在代码里我没逐条核** |
| U8 | **`packs/v3` 的 slots/角色计划** | `packs/v3/index.js:16-18` 只写"属于 P0-2…P0-10"；**v3 的 planner/solver/verifier 会以什么"成员种类"进 `role` 维，仓内还没有定义** ⇒ §4 的 role/phase 映射是建议，不是既有事实 |
| U9 | **v3 根 persona 的"off 档零提及"是否真的成立** | 子代理面做到了（`mathWorkLine`/`formalOn` 返回空串）；但根 persona（A1/A2）是**静态 YAML**，里面**始终**有 LEAN 段与 math_computation 行（`:71`、`:92-113`）⇒ `formalVerify=off` 时根提示仍会提 Lean。**我判断这是与 v3 自己声明的纪律不一致**，但没有实测一轮来证明，故列在此 |
| U10 | **`TOOL_DESC` 与两条注册路径是否逐字一致；根 persona 的工具条目与它是否一一对应** | 注释（`:5990-5994`）声称"全部 33 个工具都从此表取描述"并由 `tests/audit-v3-registration-parity.mjs` 比对；我**没有跑那条测试**。只核了：`TOOL_DESC` 自身实际 **36** 条（注释里的 33 已陈旧）；根 persona（A1/A2）里是 **38 个 `- vibe_math_*` 条目 + 4 个 math 条目**，与 `TOOL_DESC` 的 36 条**是否一一对应我没核** |
| U11 | **`PARAM_SCHEMA`(64) vs `PARAM_PROPS_KEYS`(63) 的漂移** | `fileLockTimeoutMs` 在 schema（`:57`）却不在键表（`:81`）⇒ `paramProps()` 不会把它放进 `set_params` 的 schema。属**参数面**问题、不属提示词，**我只记录未深究影响** |
| U12 | **所有"字数"都不是渲染长度** | §1/§0.2 的字数是**源码字节**与**行区间**；渲染后的提示词长度依赖运行时插值（方向数/方法条数/简报大小），**我没有测量任何一次真实装配的字节数** |
| U13 | **没有跑任何门禁/测试** | 本文件是**只读盘点**：§3 的"vmu 能装配"是**读码结论**，不是实测；§4 的"可复用"是**段文本比对**结论，没有做过"装进 v3 pack 再装配一轮"的验证 |
| U14 | **没有核 v4/v5/v5r 的原版源码** | "可复用 v5r 的段"里的 v5r 指的是 **`packs/v5r/prompts/**` 这份 vmu 侧的重建**；它与 v5r 原版是否逐字一致，我没有回原版核（那是 v5r 侧对账的事） |
| U15 | **P1-6 的编号定义** | 仓内 `phase6-v3-p0-build-checklist.md` 只有 **P0-1…P0-10**；`phase6-rounds.md` 里的 **P1** 指"消费者误读"清单（`W-01…W-08`），**不是**提示词卡。⇒ 我按"提示词复刻卡"理解本任务，**没有找到 P1-6 的正式验收条目** |
| U16 | **v5r 段与 v3 段的逐字 diff** | §4.2 的"可复用"是**语义/来源**判断（同源共享模块、同构分支）；我**没有**对每一对做逐字 diff（例如 `v5r-formal-status-passed` 的措辞是否与 v3 `formalStatusLine` 完全一致），P1-6 落地前必须补 |

---

## §6 一句话结论（给 Lead 的 5 行）

1. **v3 的提示词文本构件约 50 条**（根面 4＋工具/命令面 3＋知识上下文 10＋组合器 6＋角色 8＋插值片段 4＋简报 6＋形式化 6＋数学 2＋推送 1 = **50**；另有 1 条边界行（报告文件）与 3 条工具语义行，见 §1 合计）。
2. **装配顺序一句话**：子代理提示一律是 *人设（可空）→ 角色抬头/目标 → [历史进展] → 知识上下文（4 组合按角色选一）→ 方法库索引（≤20）→ 能力与权限 → 角色任务/回执契约 → 数学可用性行 → 顺手形式化日线*；验证器在契约前多插一段 Lean，规划器则**只有**简报 + 动作词表。
3. **最关键的 3 条差集**：① 根 persona 通道（`assistant.json` 不渲染变量）；② 8 类角色在 vmu 没有 `role` 维可绑（要用 phase+task 或 sectionPolicy）；③ 四类动态文本（方法索引/简报/数学可用引擎/对象形式化状态）不能进 `sections.json`，要走 M2 `appendPrompt`。
4. **最容易做错的一件事**：把 v3 的**互斥**角色/阶段提示词落成**并列**段（v3 的互斥在调用图里，vmu 的段默认全装配；v5r 已因同族错误在 18,528 字里塞了三个身份）。
5. **没核到的**：§5 的 U1–U16（其中 U1/U3/U4 影响最大：根 persona 谁生效、变量是否渲染、manifest `promptPolicies` 是否被消费）；**本文件不含任何实测**。
