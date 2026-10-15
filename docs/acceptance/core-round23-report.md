# Round 23 · task-134 · **未修（具名）**：定位已复核并收窄到**一次已存在的读取**（`status().packErrors`）——我不在预算不足时盲改

**一句话**：真机那半 `settingsMerge.packs:["v5r"]` 已成立，**内核侧全空**（`registrations/packs/bus.entries` 皆 `[]`）这条卡点我**复核了代码定位并纠正/收窄了它**：剩下的分叉只差**同一份回执里的一行 `packErrors`**（入口早就把它收集并可读了），拿到它就能把修点钉到**一处**。**本轮我没有改任何文件**——因为"先复现再改"这条在本轮已两次救了我们，而我的预算不足以跑完复现＋修＋断言。

## 0. 核验行

| 项 | 值 |
|---|---|
| HEAD | `5b15562`（Lead 已提交，T1 316/316） |
| task-134 | `claimed`（`in_progress`，我的名字） |
| 我本轮**改了**的文件 | **无**（只读复核；探针/报告在 `D:\_tmp` 与 `_handoff`） |
| 未碰 | `vibe-math-vmu.js`、`kernel/loader.js`、`kernel/pack.js`、`host.js`、`tests/**`、`package.json` |

## 1. 复核结果（我读到的 file:line；逐条与你的定位对照）

| # | 事实 | 出处 |
|---|---|---|
| 1 | 入口的 `PACK_RUNTIME` 只折 **`sectionPolicy`/`noticeBlock`/`phases`** ⇒ 与"设置进了、`middleware` 没进"相容 | `vibe-math-vmu.js:448-460`（`v5r:` 键在 `:449`） |
| 2 | **设置另有独立路径**：入口在 kernel 存在之前就直接读 `packs/<name>/settings/defaults.json` 当 **DATA** 折入 ⇒ ★ **"设置进了"并不证明 `apply()` 成功**（这一点很重要：它让"半装"有了**第二种**解释） | `vibe-math-vmu.js:297-330` 一带 |
| 3 | `middleware: [` 数组在 **`v5r-core.js`**（含 `v5r.stall-meeting`／`v5r.motion-box`／★ **`v5r.artifact-counter`**） | `packs/v5r/prompts/v5r-core.js:195`、`:251` |
| 4 | `packs/v5r/index.js` 导出的是 **`V5R_PACK`**（**没有** `middleware` 数组），且 `:56` 注释逐字："**naming this one `PACK` silently replaced the real manifest and the roster disappeared**" ⇒ 入口取 `loaded.PACK` 时命中的应是 **v5r-core 的 `PACK`**（真 manifest） | `packs/v5r/index.js:62-83`、`:54-56` |
| 5 | ★ **"loader 不可用"这条排除**：`kernel.loader` **在门面上**（`loader,`）⇒ `kernel.loader.toBusEntries` 可用 | `kernel/index.js:1660` |
| 6 | 入口**有** `packApplier`，且**收集** `packErrors` 并**暴露**（`packErrors: () => packErrors.slice()`） | `vibe-math-vmu.js:497`/`:538`、`:777`、`:891`、`:982` |

## 2. ★ 剩余分叉收窄成**一次已存在的读取**（不需要新真机）

真机回执里已有 `registrations/packs/bus.entries` 三个空视图，但**没有** `packErrors`。它恰好是二选一的判别式：

- **若 `packErrors` 非空** ⇒ **`apply()` 抛了**，而设置由第 1 行 #2 的**独立 DATA 路径**照旧折入 ⇒ **完美解释"半装"**，且真机上应当（或应当有）一行 `vmu: pack v5r was not applied: <code> <message>`；修点＝**按 `packErrors[].code/message` 定位的那一处失败**（候选：`validatePack` 拒某字段／`toBusEntries` 拒某条目／promptPolicies 缺 consumer）。
- **若 `packErrors` 为空** ⇒ **`apply()` 成功但 `middleware` 没进总线** ⇒ 修点＝**`kernel/pack.js` 的 middleware 循环**（`isModuleShape` 判据或 `toBusEntries` 的返回未被 `kernel.bus.add`）。

⇒ **请给我那一行**（同一份回执，或允许我再开一轮跑本地探针 `apply(ctx,{packs:['v5r']})` + 读 `status().packErrors`／`bus.status().entries`）——这比再跑一次真机便宜，而且能把修点钉到一处。

## 2ter. ★ `vmu-verify2` 的**独立复核**（同一结论）＋ 我的两处**引法更正** ＋ 一条可用性发现

**① 它在【进程内真入口】上独立拿到同一读数**：`packs:['v5r']` ⇒ **`handle.packErrors() === []`** 且总线上有 **3 条 `v5r.artifact-counter::*`**（`tools/result`／`math/job-settled`／`lean/job-settled`）⇒ **两叉都被排除**（既没抛、middleware 也真的进了总线）⇒ ★ **"半装"在当前树上不可复现**。★ **它同时给了正确的限定**：这与**陈旧 payload**（`r17-home` 那份：无 `artifact-counter.js`、无 R20 接线、`v5r-core.js` 也不同）**完全相容**，但 `r18-home` 的 payload 在 **17:13:49 被就地刷新** ⇒ **会话时刻的状态不可回溯** ⇒ 它**只声称"当前树不可复现 ＋ 与快照预测相容"，不声称"已证是快照造成"**。**我采纳这个更强的限定**（比"版本差异"那种写法负责得多）。

**② 我对 §1 表的两处引法更正（它核出，我接受）**：
- 第 2 行：入口那条 `settings/defaults.json` **DATA 折入**的**首次出现是 `L274`**（我原写"`:297-330` 一带"）⇒ **方向结论不变**，行号以 **274** 为准；
- 第 3 行：`v5r-core.js` 里 `artifact-counter` **首次出现在 `:39`**（我引的 `:251` 是 **manifest 条目**处）⇒ **结论不变，引法更正**。
- 第 4 行那句引文**我 grep 复证**：短语 "silently replaced the real manifest" 在 **`packs/v5r/index.js:40` 与 `:56`** 各命中一次，`:56` 的逐字为 "// naming this one `PACK` silently replaced the real manifest and the roster disappeared - a lesson kept in the name." ⇒ **引文无误**（verify2 未能匹配是**检索串**差异，不是我的引法错）——我已把这两行号给它，供它补齐记录。

**③ ★ 一条可用性发现（它先说白找了一趟，值得进文档/回执）**：`packErrors`／`appliedPacks`／`packMerge`／`packLoader` 是**入口句柄（`handle.*`）的访问器**，**`kernel.status()` 的键里没有 pack 相关字段** ⇒ 正确读法是 `handle.packErrors()`。**建议**（不在我写范围）：把这两个字段写进**真机回执**，此后这个分叉**永远可从日志判定**，不必再烧会话。

**④ 共同的两条边界**：它与我**都不是真机读数**（证的是**当前树的进程内真装配**）；`vmu.packs.active` 不是真开关（R21 的洞）**属另一条装载线**，与本次"半装"**不合并**。

---

## 2bis. ★★ 本机三联探针：**前提不成立**（两条路线**已经一致**，`packErrors` 为空）

**`node D:\_tmp\r23-fork-probe.mjs`**（只读仓内模块、只写 `%TEMP%`；**未改任何仓库文件**）：
```
§0 index.js 同时导出 PACK 与 V5R_PACK；v5r-core.js 也导出 PACK
   loaded.PACK 的 middleware ids = ["v5r-core-settled-records-only","v5r.stall-meeting","v5r.motion-box","v5r.artifact-counter"]
§1 进程内（createKernel + createPackLoader + loader.apply(manifest)）：
   apply 不抛 ⇒ bus entries = 7 条，含 ★[v5r.artifact-counter :: tools/result]
§2 入口路线（apply(ctx, { packs:['v5r'], vmu:{…} })）：
   apply 不抛、**packErrors = []**、activePacks = []、**bus entries = 与 §1 完全相同的 7 条**（含 ★ 那条 tools/result 订阅）
```
⇒ **① "两条路线读数一致" 在这棵树上【已经成立】（7 ＝ 7）**；② **上一节那个二选一分叉的两支都不适用**（`packErrors` 空 ⇒ 不是"apply 抛"；而 middleware **确实进了总线** ⇒ 也不是"没进总线"）⇒ **task-134 的前提（"pack 只半装、middleware 没进总线"）在本机入口路线上不成立**。

**★ 由此最可疑的三条（都不是"入口丢 middleware"）**
1. **回执的视图与"装 pack 的那个实例/阶段"不同步**：入口在 packs/modules 之后会**重装**（`adapter.install()` 再跑、`attachReportTick` 幂等）；若 `bus.status()/registrations/packs` 取自**重建后的内核**或装配早期，就会是空表 —— 这与同一份回执里 `settingsMerge.packs` 非空**并不矛盾**（设置来自 kernel 之前那条独立 **DATA** 路径）。
2. **真机的配置形状与本探针不同**：真机是**预设 overlay 行**（顶层 `packs:` ＋ 嵌套 `vmu:{}`），我用的是 `apply(ctx, {...})` 合成配置（我的 `settingsMerge.packs` 是 **null**，真机是 `["v5r"]`）⇒ ★ **我不能声称"真机路线 ≡ 本机路线"**，这条限定必须保留。
3. ~~版本/时长差异~~ → **★ 已更正：那是【口径】差异，不是版本差异**（Lead 更正，我采纳）：`vmu-verify2` 说的是"**3 条 `v5r.artifact-counter::*` 总线条目**"＝**该模块自己**的 3 条（`tools/result`／`math/job-settled`／`lean/job-settled`，我的 §1 输出里正是这 3 条），而我量的 **7 条**＝**全部模块合计**（另有 `v5r-core-settled-records-only`、`v5r-core-no-adhoc-scripts`、`v5r.stall-meeting`、`v5r.motion-box`，其中 motion-box 展开为 `meeting/motion`）。⇒ **3 与 7 是"每模块 vs 合计"，不是 1→4 的改动**；按**口径**记账，**不要**去找不存在的版本变化。（我先前的"版本限定"写法已作废——避免后人被引去查一个不存在的改动。）

**⇒ 建议下一步**：① 真机回执**再取一次同一会话稍后时刻的 `vibe_vmu_status`**（判"视图与实例不同步"）；② 把该会话的 **overlay 原文**给我 ⇒ 我把探针配置换成**同一份**（消除第 2 条差异）；③ 若两者之后真机仍 7→0，才是真缺陷、才落修。★ **我在前提未立时不改代码。**

---

## 2quater. ★★ 真根因（`vmu-assistant2` 的真机 stderr **全文 1190 B**，Lead 定位）：**不是"middleware 没折进总线"，是 `apply()` 被前置条件具名拒**

**真机 stderr 最后一行（逐字）**：
```
vmu: pack v5r was not applied: VMU_ENGINE_UNAVAILABLE this kernel has no library root
```
同一段 sibling 是 **`"store":null,"library":null`** ⇒ 逐字自洽 ⇒ **`apply()` 被具名拒 ⇒ 什么都没装** ⇒ `bus.entries: []` / `registrations: []` / `packs: []` **都是它的后果，不是"折入逻辑坏了"**。★ **我本机的 7 条与它不冲突——我的合成配置带了 durable root，真机那份 overlay 没有**（入口取 durable root 的键是 **`config.root`**，`vibe-math-vmu.js:147`）⇒ 真机 `root = null`。

**⇒ 等价性才有资格声称**：必须用 **`D:\_tmp\r131-A-overlay.yml`（sha256 `73217CFC2D912686`）的形状**复跑我的探针：**不加 `root` ⇒ 应当复现"具名拒 ＋ 空总线"；加 `root` ⇒ 应当变 7 条**。**我本轮预算用尽，未跑这一对照**（这正是我 §2bis/§2ter 那两条限定要求的"同一配置形状"实验）。

**`task-134` 收窄后的三条（都不动 middleware 折入逻辑——它本来就是对的），我已把**插入点**钉出来了**：

| # | 事 | 我定位到的插入点 / 判据 |
|---|---|---|
| 1 | `packErrors` ＋ `appliedPacks` 进**真机可见的状态/回执** | 入口**已有**句柄访问器：`appliedPacks: () => appliedPacks.slice()`（`vibe-math-vmu.js:981`）、`packErrors: () => packErrors.slice()`（`:982`，收集 `:777`／push `:891/898/906`）；**`kernel.status()` 里没有** ⇒ 入口 `createHostAdapter(...)` 调用点在 **`:525`**，可新增 `packReport: () => ({ applied, errors })`；**回执落点＝`host.js:431`**（`const out = Object.assign({ ok: true, instance }, kernel.status())`，即 `vibe_vmu_status` 那份视图）⇒ 把 `packReport()` 并进 `out`。 |
| 2 | ★ **状态一致性（"回执说一件事、事实是另一件"）** | 现状：`apply()` 被拒时 **`settingsMerge.packs` 仍显示 `["v5r"]`**（设置走 kernel **之前**的独立 DATA 路径）⇒ 呈现误导。**我的判断（供裁）**：**不要**去动那条 DATA 折入（它是**有意**的：让"包带了哪些默认值"在 kernel 之前就可读）；正解是**让两份视图可对账** —— 在回执的 `packs` 段里给出 **`applied:false`** ＋ **`errors:[{id,code,message}]`**，并让 `settingsMerge` 侧**带一个 `applied:false` 的标记**（或状态里显式写"这些设置来自被拒的 pack，**未被应用**"）。⇒ **"被拒却显示为已合并"必须被消除或具名。** |
| 3 | **"两条路线读数一致（7＝7）"防回归断言** ＋ **`root` 必需性写进 `docs/10:436` 的装载配方** | 断言：进程内 `loader.apply(manifest)` 与入口 `config.packs` 两条路的 `bus.status().entries` **逐条相等**（我实测 **7＝7**，含 `v5r.artifact-counter::tools/result`）＋ 反例（无 pack ⇒ 空）。`docs/10:436` 那条配方**漏了 `config.root`**（真机正是因此被拒）⇒ **属 docs 属主**（不在我写范围）⇒ **具名转出**。 |

**★ 不改**：`vmu.packs.active` 不是真开关（R21 的洞）——**与本次两件事都不合并**（Lead 与 verify2 均同意）。

---

## 3. 未做项（**具名**，无半成品）

1. **A 复现**：**本机三联探针已跑**（`node D:\_tmp\r23-fork-probe.mjs`，读数见 §2bis）⇒ **结论是"前提不成立"，不是"已复现缺口"**；**真机口径的复现仍未做**（我没有真机，且**不能**用合成配置等价替代真机 overlay —— 见 §2bis 第 2 条限定）。
2. **B 修**：未做 —— **因为分叉未收敛**（见 §2：两类修法在**不同文件**，一份在 `kernel/pack.js`/`vibe-math-vmu.js`，另一份在 manifest 字段层）。**按错的那一支去改，正是本轮之前两次踩过的坑。**
3. **C 断言**：未做（含你特别点名的"★ **两条路线读数一致**"）。
4. **D 复测**：未到；**真机结论我不声称**（我对本轮的唯一真机陈述是"我读了别人给的读数"）。

## 4. 我的建议（按代价排序）

1. **最便宜的下一步（0 真机）**：回执里的 **`packErrors`** 一行 ⇒ 我按 `code` 直接改一处。
2. 若不便取：让我**再开一轮**跑本地三联探针（入口路线：`activePacks` / `packErrors` / `bus.status().entries`）⇒ 同样能定分叉，且**同时**能产出 C 的第 ①③ 条断言的形状。
3. 之后按你给的修法方向（`middleware` 经 `kernel/loader.toBusEntries()`、`kind:'module'` 要拿到 `api`）落 **B**，并把"两条路线读数一致"写成断言（进程内 26/0／3 条总线条目 ↔ 入口路线）。

★ 我在本任务里**一个字都没改**，树保持你提交时的样子。
