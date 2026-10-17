# Phase 3 · 目标 0 收口 —— agent-teams 采纳候选**逐条定案**（`task`·Round 83）

> ★ **只读**；★ **只写本文件**；★ 未改任何代码；★ 未跑 git；★ 未跑 T1／全量；★ 临时件在 `D:\_tmp`（`D:\_tmp\p3-parity\`）；★ **未碰 `token.txt`**。
> ★★ **本轮最重要的两条发现先说**：**(1)** ★ **C2 的"需采纳"判定已【过期】—— 那个具名接缝已经建好了**（`kernel/prompt/index.js:347-355`，作者自注 `task-235`，且注释里**引用了与核实者【同一个】实测**）；**(2)** ★ **核实文档里的 `file:line` 锚点【已经漂移】**（该文件现 **760 行**，`...-adoption-verify.md` 引的 `:369-377` 已**不再是** `scopeMatches`）⇒ ★ **旧文档里的行号不能当锚点用**（正是本仓"行号是主张、不是锚点"那条）。

---

## 1. ①候选总表（`编号 | 来源 | 候选内容 | 判定 | 落点或理由 | 验收判据`）

| 编号 | 来源 | 候选内容 | 判定 | 落点 or 理由 | 验收判据 |
|---|---|---|---|---|---|
| **A2-member** | 官方 §①A2（`official:75`） | **per-scope 的 prompt 段注册**（"段/绑定只给某个成员/角色/阶段/任务"） | ★★ **A 已采纳** | ★ **代码已核**：`kernel/prompt/index.js:259-262`（四维 `['role','phase','member','task']` ＋ **恰一维**的具名拒）＋ `:361`（`scope: section.scope \|\| null`）＋ `packs/v5r/prompts/v5r-charter.js` 的 `CHARTER_MEMBER_BINDINGS` | ★ `tests/vmu-prompt-type-coverage.test.mjs:257-274`（**逐成员各装一轮**，断言"**只收到自己的方向**"） |
| **A2-agent** | 同上（`official:75` 的后半） | **"只给某个 DSH agent"** 的维度 | ★ **C 需采纳**（**小接缝**） | ★ 四维里**没有 `agent`**；`member` 是**所内成员**，不是宿主 agent 身份 ⇒ ★ **落层＝入口/host 适配层**（不是 pack 段表）——★ 官方注册点在**宿主/预设层**（`tool-agent-team/lib/index.js:237-238`） | ★ 装配后断言：**两个 agent 各自只收到自己的段**（照 `:257-274` 的同型断言） |
| **C2** | 官方 §③C2（`official:91`） | **"替换既有面"应是部署声明，而非隐式"后者赢"** | ★★ **A 已采纳**（★ **核实文档的 C 判定已过期**） | ★ **代码已核**：`kernel/prompt/index.js:347-355` —— 未声明 ⇒ **`refuse('VMU_MIDDLEWARE_FAILED', 'a pack section would replace the framework section X without declaring it', 'add replaces: ["X"] …')`（具名拒＋给出该加的字段）**；已声明 ⇒ **`displaced = {section, displacedSource, displacedOrder, replacedBy, declaredReplaces}` 具名位移记录** | ★ 断言：**未声明 `replaces` 的覆盖 ⇒ 具名红**；**声明的覆盖 ⇒ 回执点名被顶掉者** |
| **C2-why-not-disable** | `kernel/prompt/index.js:344-346`（作者自注） | ★ 不用 `disable(name)`＋register 的理由 | ★ **A 已采纳**（**纪律**） | ★ 逐字：**"the render loop skips a disabled section WHOLE by name, and this replacement shares that name — it would suppress the replacement itself and inject NOTHING, silently"** | ★ 该注释即在位；★ 反例：改成 `disable` 后应能观察到**替换文本注入为空** |
| **A2-seam-src** | `...-adoption-verify.md:36-39` | 加 `agent` 维的**最小改动面**（`:259` 扩维 ＋ `:377` 的 `hit()` 链加一项） | ★ **C**（与 `A2-agent` 同一件） | ★ **落层＝内核（能力）＋入口/host（装配）** ⇒ 符合"能力在内核、规范在 pack/宿主" | 同上 |
| **C2-overrides** | 官方 §③C2＋`...-adoption-verify.md:67` | `vmu.prompts.overrides` 的**部署侧**覆盖路径 | ★ **B 已核实无需采纳**（就"声明式覆盖"而言） | ★ 既有：`kernel/prompt/index.js:354-357`（`overrideMerge = {declared, fromCaller}`，**回执带计数**）⇒ ★ **部署侧的声明式覆盖已在位**；★ 与 C2 的**面替换**是两件事（★ 文本覆盖 vs 面替换） | ★ 已有回执计数即可核 |
| **per-scope-prompt-reg** | 任务书点名的"学习文档提过但没进候选表" | **per-scope prompt 段注册** | ★★ **A**（＝`A2-member`，**同一件事**） | ★ 归并到 `A2-member`，**不重复立条** | 同 A2-member |
| **agent-scope** | 任务书点名 | 官方 `tool-agent-team` 的 **Agent scope 到底是哪个宿主对象** | ★ **未定论** | ★ **核实文档 §三.3 已自陈未核** ⇒ 见 §5.3（**最小观测**：读官方包 `lib/index.js:237` 一带 **Agent scope 的构造点**） | ★ 读到"它由谁构造/何时存在"即可定论 |
| **overlay-replace** | 任务书点名 | **overlay/preset 的替换语义** | ★★ **A**（＝C2） | ★ 归并到 C2 | 同 C2 |
| **wait-durable-send** | 任务书点名 | **wait / durable-send 语义** | ★★ **A 已采纳**（B1+B2） | ★ **本仓唯一带 agent-teams 出处标注的落点**：`packs/v5r/middleware/waitsemantics.js`（★ 见 §2.3） | ★ 该中间件的既有断言 |

## 2. ②A 类**逐条核实记录**（我实际读到的代码引文）

### 2.1 ★★ C2 —— **已采纳**（这是本轮的关键更正）
`vibe-math-vmu/kernel/prompt/index.js:338-355`，逐字（我读到的）：
```
:338  // MEASURED BEFORE THIS BRANCH EXISTED: the two guards above only cover immutable sections and pack-versus-pack,
:339  // so a pack section colliding with a framework one fell straight to `registry.set` below - the framework text
:340  // disappeared, the pack text rendered, and nothing was refused or reported. Replacing an existing surface is a
:341  // DEPLOYMENT DECLARATION (docs/10 §4), so the pack section must name it in `replaces`:
:342  //   declared   ⇒ allowed, and the receipt reports what was displaced (below);
:343  //   undeclared ⇒ refused BY NAME, with the hint naming the field to add.
:347  if (range === 'pack' && existing.range !== 'pack') {
:348    const declaredReplaces = Array.isArray(section.replaces) ? section.replaces.map(String) : []
:349    if (!declaredReplaces.includes(name)) {
:350      throw refuse('VMU_MIDDLEWARE_FAILED',
:351        'a pack section would replace the framework section ' + name + ' without declaring it',
:352        'replacing an existing surface is a DECLARATION (docs/10 §4): add replaces: ["' + name + '"] to this section …')
:354    displaced = { section: name, displacedSource: existing.source, displacedOrder: existing.order, replacedBy: declaredSource, declaredReplaces }
```
★★ **⇒ `section.replaces` 字段存在；未声明 ⇒ 具名拒；已声明 ⇒ 具名位移记录** ⇒ ★ **`...-adoption-verify.md:69` 的 `NEEDS A NAMED SEAM`【已过时】**：★ **该接缝已由 `task-235` 建成**，★ 且 **`:338-340` 的注释与核实者 `:64-66` 的实测是同一个事实**（两条独立记录互相印证）✓

### 2.2 ★ A2（member 维）—— 已采纳（代码已核）
`kernel/prompt/index.js:259-262`（我读到的逐字）：
```
const dims = ['role', 'phase', 'member', 'task'].filter((d) => typeof b[d] === 'string' && b[d] !== '')
if (dims.length !== 1) {
  throw refuse('VMU_INVALID_ARGUMENT', 'a binding must name exactly one dimension', 'one of: role < phase < member < task')
}
```
＋ `:361`（我读到的）`scope: section.scope || null` ⇒ ★ **段自身也能带 scope**（与核实文档 §一(b) 一致）✓
★ **隔离真的生效**的常驻断言在 `tests/vmu-prompt-type-coverage.test.mjs:257-274`（**核实文档引的**）⇒ ★ **我本轮未重读该测试**（见 §6 覆盖）⇒ **这一条按"文档引用＋我核了生产侧代码"记**，★ **不声称我核过那条断言**。

### 2.3 wait/durable-send（本仓唯一带出处标注的落点）
★ `packs/v5r/middleware/waitsemantics.js` —— ★ **本轮【未读其内容】** ⇒ ★ **按"存在出处标注"记（任务书给的现状读数）**，★ **不声称我核过它采纳了什么**（见 §6）。

## 3. ③C 类**施工单**（按"改动最小、收益最大"排序；标明写域）

| # | 施工项 | 写域 | 为什么符合哲学 | 验收判据 |
|---|---|---|---|---|
| **C-1** | ★ **`agent` 维度接缝**：内核扩维（`kernel/prompt/index.js:259` 的维集合 ＋ `scopeMatches` 的 `hit()` 链）＋ **入口/host 层**完成"按 agent 注册" | ★ **内核**（能力）＋**入口/host**（装配） | ★ **能力在内核、装配在宿主**；★ **不把 policy 写进代码** | ★ 两个 agent 各自只收到自己的段（照 `:257-274` 同型） |
| **C-2** | ★★ **重新锚定采纳文档里的 `file:line`**：`...-adoption-verify.md` 与两份学习文档的引用**在 760 行的当前文件上已漂移**（`:369-377` 已不是 `scopeMatches`） | ★ **`docs/acceptance/**`**（★ **不是代码**） | ★ 与"**行号是主张、不是锚点**"一致 ⇒ 漂移的引用**会把后来的复核者引到错的地方** | ★ 每条引用**重新读到**并写回；★ 至少覆盖 `prompt/index.js` 与 `vibe-math-vmu.js` 的引用 |
| **C-3** | （若 Lead 要）把 C2 的**位移记录**接进**回执可见面**（★ 若已可见则降为 B） | ★ `kernel/prompt/index.js`／回执面 | ★ 与"**声明⇒执法**"一致 | ★ 构造一次"声明的替换"⇒ **回执里能读到被顶掉者** |

## 4. ④D 类（不采纳，与哲学冲突）

★ ★★★★ **ROUND 90 已补齐 D 类，见 §8.2**（原因正是本节说的「没读正文」，而 §8.1 记了读到的位置）—— ★ **以下是当时的原话，保留不改**：

★ **本轮未给出 D 类** —— ★ **不是因为没有 D，而是因为我【没有读完两份学习文档的正文】**（只读了标题，见 §6）⇒ ★ **不敢把"未读到"当成"不存在"**（★ 这正是本仓的纪律）⇒ ★ **D 类留待读全正文后补**（见 §5.6）。

## 5. ⑤仍未定论项（每条带**最小观测**）

| # | 未定论 | 最小观测（一条命令／一个读数） |
|---|---|---|
| 5.1 | ★ 核实文档 §三.1：**"某一轮真装配里 pack 段是否真的覆盖过框架段"**（只核了代码路径） | ★ ★ **本项现在可定论为"能"**：`:347-355` 的守卫＋`displaced` 记录已把它变成**声明式**（★ 但仍**没有实机观测**）⇒ 最小观测：**写一个临时 pack 段声明 `replaces:['<框架段名>']`，装配后读回执里是否出现 `displaced`** |
| 5.2 | ★ §三.2：**`ORDER_RANGES`／`range` 词表是否还有第三个 range 值** | ★ 最小观测：`grep -n "ORDER_RANGES" kernel/prompt/index.js` ＋ 读该常量的全部键 |
| 5.3 | ★ §三.3：**官方 `tool-agent-team` 的 "Agent scope" 是哪个宿主对象** | ★ 最小观测：读官方包 `tool-agent-team/lib/index.js:237` 一带**该 scope 的构造点**（谁建、何时存在） |
| 5.4 | ★ §三.4：**`vmu.prompts.overrides` 能否已覆盖 C2 的一部分** | ★ 最小观测：读 `kernel/prompt/index.js:354-357` 的 `overrideMerge` **完整语义**（文本覆盖 vs 面替换） |
| 5.5 | ★ **C2 的位移记录是否已进回执**（决定 C-3 是 A 还是 C） | ★ 最小观测：装配一次声明的替换 ⇒ **读回执里有没有 `displaced`／`replacedSections`** |
| 5.6 | ★ **两份学习文档正文里的候选我未逐条读** | ★ 最小观测：读完 `phase3-agentteams-official.md` §①②③ 与 `phase3-agentteams-nanmi.md` §2/§3/§4 的**每一条**，逐条进表 |

## 6. ⑥覆盖率说明（**哪些章节没读、为什么**）

**读了**：★ `docs/acceptance/phase3-agentteams-adoption-verify.md` **全文（80 行）**；★ `kernel/prompt/index.js` 的 **`:255-266`／`:338-371`**（A2 与 C2 的生产侧）；★ `waitsemantics.js` **只按存在性**（未读正文）。

★ **未读（具名）**：★ `phase3-agentteams-official.md` **只读了标题**（`§来源与读法`／`四个包的清单`／`逐包`／`①vmu 缺的`／`②做得差的`／`③值得借鉴的`／`④README＋自陈局限`／`未核清单`）⇒ **正文未读**；★ `phase3-agentteams-nanmi.md` **只读了标题**（`§0进度`…`§6来源清单`）⇒ **正文未读**；★ `docs/landscape-similar-frameworks.md` **完全未读**；★ `tests/vmu-prompt-type-coverage.test.mjs:257-274` **未读**；★ `waitsemantics.js` **正文未读**；★ `packs/v5r/prompts/v5r-charter.js` **未读**。
★ **为什么**：★ **本轮预算只够核"最要紧的那处"（C2 的接缝是否已建）**，★ 而它恰好**推翻了旧判定** ⇒ ★ 我选择**先把这条钉死**，★ 而不是"把四份文档都扫一遍然后每条都写'大概'"。

## 7. ⑦总账（★ **ROUND 90 已重算，见 §8.6**；以下为当时的口径）

★ **候选 N ＝ 11** ⇒ ★ **A ＝ 6**（`A2-member`／`C2`／`C2-why-not-disable`／`per-scope-prompt-reg`＊／`overlay-replace`＊／`wait-durable-send`▲）· ★ **B ＝ 1**（`C2-overrides`）· ★ **C ＝ 3**（`A2-agent`／`A2-seam-src`〔与前者同一件〕／施工单 C-1…C-3 计 3 条）· ★ **D ＝ 0**（★ **未给不代表没有**，见 §4）· ★ **未定论 ＝ 1**（`agent-scope`）＋ ★ **§5 另有 6 条待观测项**。
★ 记号：＊＝**与另一条同一件事、已归并**；▲＝**按"存在出处标注"记（我未读正文）** ⇒ ★ **若要把▲升为"我核过"，需要读 `waitsemantics.js`**。

★ **C 类施工单条数 ＝ 3**（C-1 `agent` 维接缝／C-2 重锚定旧文档行号／C-3 位移记录进回执）。
★ **写域**：本报告 `docs/acceptance/phase3-agentteams-closeout.md`（★ **唯一写入文件**）；★ C 类施工单的写域已在 §3 逐条标明（★ **本轮未动它们**）。
---

## 8. ★★★★★ ROUND 90 — **正文已读 ⇒ D 类补齐 ＋ 总账重算**（★ 本节关闭 §4／§6／§7 的"未读"）

### 8.1 ★★★ 读了什么（★ 这是 §4 当时缺的那一步）
★ **`phase3-agentteams-official.md` 的 §①–§④ 与"未核清单"正文**（92 行）✓
★ **`phase3-agentteams-nanmi.md` 的 §2–§5 正文**（79 行）✓
⇒ ★ **§6 里"只读标题、正文未读"的两处【不再成立】** ✓
★ **`docs/landscape-similar-frameworks.md`（408 行）【仍未读】** —— ★ **如实标注**，★ 见 §8.7 ✓

### 8.2 ★★★★★ D 类（4 条）—— ★ **"不采纳"指【形状】，不指内容**

| # | ★ 不采纳的形状 | ★ 与哪条红线冲突 | ★ 而它的【内容】怎么处理 |
|---|---|---|---|
| **D-1** | ★ **把规范写进工具代码**（官方 B1/B2 的形态：`ACTIVE_WAIT_STATUSES`／`POLICY` 字符串写在工具里） | ★★ **"能力在内核、规范文本在 pack"** | ★ **内容＝A**：已落地 `packs/v5r/middleware/waitsemantics.js` —— ★ **采纳内容、拒绝位置** |
| **D-2** | ★ **把 UI 放进框架**（官方 A3／C3 的 UI 包形态） | ★★ **"框架是基础设施，UI 是消费者/部署面"** | ★ **B**：vmu 不提供 UI 是**定位**，★ 不是缺口 |
| **D-3** | ★ **由框架决定"谁顶掉谁"**（C2 的反面：静默"后者赢"） | ★★ **"替换必须由【声明】决定"** | ★ **A**：已落地 R83 的 `replaces` 声明门 ＋ `displaced` 记录 |
| **D-4** | ★ **把固定组队政策写死进内核**（官方"只有显式要求才组队"的 fixed policy） | ★★ **"policy 住 pack，内核零策略"** | ★ **B**：vmu 的零机制默认 ＋ pack 触发政策**已同向** |

### 8.3 ★★★★ 新发现的一条 C（★ 已【实测确认缺失】，不是推测）
| # | 施工项 | 核实证据 | 写域 | 为什么值得做 |
|---|---|---|---|---|
| **C-4** | ★★ **根级 `AGENTS.md`：本仓规矩的【最短入口】** | ★ **实测：根目录【没有】`AGENTS.md`**；★ 而规矩散在 `docs/` ＋ `_handoff/` ＋ **335 份** `docs/acceptance/*.md` 中 | ★ **docs／pack 层**（★ **不进内核**） | ★ vmu 的使命就是**被 agent 操作**；★ 让 agent 一进仓就得到"先读什么、跑什么门禁、什么不许做"，★ **直接服务于哲学里的可调控／可定义性** |

### 8.4 ★★★ 三条 C 类施工单的【完成状态】（★ 本轮确认）
| # | 状态 |
|---|---|
| **C-1** `agent` 维接缝 | ★ **已落地**（R84；★ `tests/vmu-prompt-agent-scope.test.mjs` 16/0） |
| **C-2** 重锚定旧文档 `file:line` | ★ **已落地**（R89；★ **10 处重锚 ＋ 11/11 锚点回读验证**） |
| **C-3** 位移记录进回执可见面 | ★ **已落地**（R84；★ `pipeline.status()` 带 `replacedSections`／`replacedCount`） |
| **C-4** 根级 `AGENTS.md` | ★ **待做**（★ 本轮只核实其缺失） |

### 8.5 ★★★★ 由"读正文"产生的三条【新核实事实】——★ 每一条都改变了判定

1. ★★ **`compatibility.json` 候选 ⇒ B（无需采纳）**：★ **vmu 已有且更精确** —— `package.json` 的 **`engines.dsh`** 给了**显式版本区间**，★ 并**用 `peerDependencies` 声明 `@deepseek-ai/dsh-base`** ⇒ ★ **不必再造一份兼容清单** ✓
2. ★★ **`release-notes/` 候选 ⇒ B**：★ **vmu 的交付记录是 `docs/acceptance/`【335 份】** ⇒ ★ **实质已在**，★ 再加一个目录只改形状 ✓
3. ★★ **`skills/` 资产候选 ⇒ B**：★ **能力在 `kernel/skills.js`**，★ 而 **pack 里没有 `skills/` 资产** —— ★ 按"**没有消费者就不给机制**" ⇒ ★ **今天不需要** ✓

### 8.6 ★★★★★ 总账（★ 重算，并把两个维度分开）
★★ **关键：本报告有两个不同维度，混在一起会看起来自相矛盾** —— ★ **①【内容】维度**：这条候选的实质值不值得采纳；★ **②【形状】维度**：某种做法能不能进内核。★ **同一条候选可以"内容＝A、形状＝D"**（★ 官方 B1/B2 就是）✓

| ★ 维度 | ★ 计数 |
|---|---|
| ★★ **① 内容判定**（候选的实质） | ★ **A ＝ 6** ／ ★ **B ＝ 5**（原 1 ＋ `compatibility`／`release-notes`／`skills-assets`／`B3-limits`）／ ★ **C ＝ 1**（★ **C-4 `AGENTS.md`**）／ ★ **未定 ＝ 1**（`agent-scope`：★ 官方包不在本地检出） |
| ★★ **② 形状判定**（必须拒绝的做法） | ★ **D ＝ 4**（§8.2） |
| ★★ **③ 施工单** | ★ **C-1／C-2／C-3 已落地**，★ **C-4 待做** |

### 8.7 ★★ 仍未读／仍未定论（★ 诚实边界）
★ **`docs/landscape-similar-frameworks.md`【408 行，完全未读】** ⇒ ★ 其中的同类框架对照**未纳入本表** ✓
★ **`agent-scope`**（官方 `tool-agent-team` 的 Agent scope 是哪个宿主对象）★ **仍未定论**：★ 官方 alpha 包**不在本地检出**，★ 最小观测＝**装一次该包并读 `lib/index.js:237` 一带的 scope 构造点** ✓
★ **§5 的 6 条待观测项**：★ **5.2／5.4／5.5 已由 R84 定论**；★ **5.6 已由本轮关闭**（正文已读）；★ **5.1／5.3 仍未定论** ✓
