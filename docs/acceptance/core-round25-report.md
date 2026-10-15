# Round 25 · task-138 · **未落（具名）** ＋ ★ **新发现一处更要紧的洞**（`mergeReport.packs` 只报部署表 ⇒ 回执可与事实相反）

**一句话**：本轮我**没有写代码** —— 我的预算在本会话里已用尽，而这项是**五件一体、且 Lead 明说"两半必须一起落"**的多文件改动（`vibe-math-vmu.js` ×2 ＋ `host.js` ×4 ＋ 测试 ＋ 两卷 docs）；**起一半会正好造出本任务要消灭的那种"声明与实现不一致"**。作为补偿，我在复核插入点时**找到一处比原清单更靠前的洞**：`mergeReport.packs`（`vibe-math-vmu.js:543`）**只报部署表 `wantedPackIds`** ⇒ **回执会在"设置面装载成功"时仍显示 `packs: []`**（Round 23 那次 `settingsMerge.packs` 与内核侧相反，源头就在这里）。

## 0. 核验行（我读到的 file:line，HEAD `cfbd2c7`）

| # | 事实 | 出处 |
|---|---|---|
| 1 | 状态工具的**回执落点**＝`Object.assign({ ok: true, instance }, kernel.status())`，其后追加 `out.faces` 等 | `host.js:431`（我读到 `:434-436` 是 `out.faces = …`） |
| 2 | `createHostAdapter` **转发** `toolSpecs(...)` 的位置 | `host.js:869` `const specs = () => (settings['vmu.core.enabled'] === false ? [] : toolSpecs({ kernel, settings, assertDeclared, lo…` |
| 3 | 两个签名（要各加 `packReport = null`） | `host.js:388`（`toolSpecs({…}`）、`host.js:839`（`createHostAdapter({…}`） |
| 4 | 入口已把 `packLoader`／`packApplier`／`mergeReport` 晚绑定地交给 adapter | `vibe-math-vmu.js:530`（`packLoader: packsDeclared ? () => packLoaderRef : null`）、`:538`（`packApplier`）、`:541`（`mergeReport`） |
| 5 | ★ **`mergeReport.packs` 用的是 `wantedPackIds`（＝只来自 `config.packs`，`:451`）** | `vibe-math-vmu.js:543` `packs: wantedPackIds.slice(),` |

## 1. ★ 新发现（本任务 ② 的"更要紧那一半"，请在下一轮**一并**落）

**症状**：`packRequested` 是我 Round 24 加的有效请求表（`{id, via}`），但**回执里那格 `packs` 仍取 `wantedPackIds`** ⇒
- **设置面装载成功**（`vmu.packs.active:['v5r']`）时：**总线 7 条真在**，而回执 `settingsMerge.packs` 仍可能是 **`[]`** ⇒ ★ **与 Round 23 的误导方向恰好相反**（那次是"设置说装了、实际被拒"；这次会是"实际装了、回执说没装"）。
- 这正是本任务 ②"状态一致性"要消灭的同一类：**两份视图可以互相矛盾**。

**修法（我的判断，供下一轮直接落）**：`vibe-math-vmu.js:543` 一带改成**报有效表 ＋ 来源**：
```js
packs: packRequested.map((p) => p.id),
packSources: packRequested.map((p) => ({ id: p.id, via: p.via })),
```
并把 ② 的另一半（被拒 ⇒ `applied:false` ＋ `errors[]`）落在**同一个 `mergeReport`/回执块**里，这样"**请求了什么／从哪来／真正装上了什么／为什么没装上**"四件事在**同一处**可读，**不再需要读者把两份视图对起来猜**。

## 2. 五件的**逐件落法**（插入点已到行；下一轮按此机械执行）

| # | 事 | 确切落点 |
|---|---|---|
| 1 | **回执可见性（必须与注释一起落）** | 入口 `:530` 旁加 `packReport: () => ({ requested: packRequested, applied: appliedPacks.slice(), errors: packErrors.slice() })`（★ **函数晚绑定**，与既有 `packLoader: () => packLoaderRef` 同型 ⇒ 无 TDZ 问题，尽管三者声明在其后 `:775+`）；`host.js:388`／`:839` 各加 `packReport = null` 形参；`host.js:869` 的 `toolSpecs({…})` 透传；`host.js:431` 之后 `if (typeof packReport === 'function') out.packs = packReport()`（★ 包一层 try/catch，用**已登记**码，不自造）。★ 这三处**必须同一次落**，否则 `cfbd2c7` 里那句 "see host.js" 仍是假声明。 |
| 2 | **状态一致性** | 见 §1：`mergeReport` 报**有效表＋来源**；被拒时同一块给 `applied:false` ＋ `errors[]`（**不动** kernel 之前那条 `settings/defaults.json` DATA 折入——它有意让"包带哪些默认值"提前可读）。 |
| 3 | **常驻断言 C①–C④（能红）** | 新文件（如 `tests/vmu-packs-active-switch.test.mjs`）四臂＝我 Round 24 探针的四臂；★ **必须含"先等装载落定"这条前提本身**：断言 `ready()` **之后** `bus.entries` 稳定（或断言 `packsLoading` 从 `true` 变 `false`）——**否则断言测的是自己的竞态**（Round 24 我本人踩过：C 臂首跑 `packErrors` 为空）。 |
| 4 | **文档** | `docs/10:436` ＋ `docs/29 §3`：改成"**设置键＝真开关（推荐日常调控）／`config.packs`＝部署期声明／只装一次且来源记 `config.packs`／设置只能加不能减**"＋★ **把 `config.root` 必需性写进配方**（真机正是缺它被拒）。 |
| 5 | **`ready()` 等装载落定 ＋ `packsLoading` 披露** | **修复**：把 `:780` 的 `const run = (async () => {…})()` 捕获为 `packsInstall`，加进 `:1028` 的 `Promise.all`；**披露**：状态给 `packsLoading: true/false`。★ **报告里必须逐条说明时序变化**：至少 `vmu-entry`（150/0 现状）与任何**依赖"ready 不等装载"**的套件要复跑并具名；本机已知 `ready()` 现只 await `[started, opened, adapter.status(), idsHydrated, resumed]`（`:1028`）。 |

## 3. 未做项（**具名**）

**五项全部未落**（① ② ③ ④ ⑤），原因是**预算用尽**且它们被 Lead 定为"同一批"（含"两半必须一起落"）。**我未写任何仓库文件**（本轮只读复核）。★ 我**没有**用"部分落地"去换取一条好看的进度 —— 那会把 `cfbd2c7` 的假声明变成**两处**假象。

## 4. 与 `vmu-verify2`（task-140）的交接

它**只读复核**、可能**在自己的新文件名**下落断言 ⇒ 我的四臂读数与"settle 前提"纪律已在 Round 24 报告 §2（含 `:779`/`:780`/`:898`/`:1028` 四个行号）与我给它的消息里，**可直接引用**；`cfbd2c7` 那句 "see host.js" 目前**仍是假声明**（`host.js` 在工作树里 `packReport|packRequested|packError` **命中 0**，与 Lead 的 `vmu-accept` 读法一致）⇒ **在①落地之前，任何"回执携带 packErrors"的说法都不能引用**。

## 5. 结论

**task-138 五项未落，具名交回**；本轮唯一产出＝**一处更要紧的洞（`mergeReport.packs` 只报部署表 ⇒ 回执可与事实相反，源头 `:543`）** ＋ **五件的逐行落法**（含 `host.js` 三处透传与 `ready()` 时序风险的复跑清单）。★ 真机结论未声称；未跑全量／`regen-all`／git。
