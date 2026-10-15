# Round 30 · vmu-pack（`task-151`）交付报告 —— D1 id 映射显式化 ＋ D2 工具名级 `registered`（**③④ 未落，具名**）

> 任务：`task-151`（四条回执收口）。★ **本轮交付 2 条（D1／D2），具名未做 2 条（③ 截断自述／④ `promptSection` 进回执）** —— 见 §3。
> 纪律：原子编辑；`vibe-math-vmu.js` ＋ `host.js` 一动即重跑 `vmu-host`／`vmu-host-hooks`／`vmu-entry`／`audit-status-report-fields`／`audit-enforced-consistency` ✓（**全绿**）；**未自造公开码**；变异只在 `D:\_tmp`、**逐字节复原并核 md5**；未跑全量／`regen-all`／git 写。
> **★ 读的是哪一版**：起点 HEAD = **`2d39d591f95dcd7b50cc92fd2af905cab7a2e0a5`**；起点 `vibe-math-vmu.js` md5 `e0a7455d4f8b96433cd55beb155900c3`／`host.js` `1cbf685e52078ad7906125b935585bd0`。
> ★ **报告路径**：任务正文写 `assistant-round30-report.md`，**Lead 的口头指令写 `pack-round30-report.md`** ⇒ 按 Lead 的**最新**指令 ＋ 我的一贯命名用 **`pack-round30-report.md`**（已在消息里点名，避免找不到）。

---

## 0. 结论速览

| 条 | 状态 |
|---|---|
| **D1 id 映射显式化** | ✅ **已落**：`packReport.applied` ＝ **`[{requestId, manifestId}]`** ＋ 同帧 **`idMap`** ＋ 保留 `appliedPacks`（manifest id 视图）⇒ ★ **两套 id 不并、可机检** |
| **D2 工具名级 `registered`** | ✅ **已落**：`faces.registeredTools`（工具名，与 `publishedDetail` 对称）＋ `registeredToolDetail` |
| **③ 回执自述截断** | ❌ **未落（具名）**：设计已给（§3.1）—— 需在我们这侧按尺寸上限收口 ＋ `truncated:true` ＋ 主动列省略区间；★ **宿主事后插入的省略是【宿主边界】，我们不声称** |
| **④ `promptSection` 进回执** | ❌ **未落（具名）**：设计已给（§3.2）—— 与 `packReport` 同型的 seam |
| **断言 ＋ 当天反例** | ✅ D1／D2 各 5 条断言（F1–F5）＋ **当天种反例**：M-D1 ⇒ **30/2 红**（F1/F2）、M-D2 ⇒ **30/2 红**（F4/F5），**均无 SyntaxError**、复原 md5 相同 |

---

## 1. D1 · 两套 id 的映射写进回执（可机检）

**问题**：包**按请求 id**（`v5r`）装载、**按 manifest id**（`v5r-core`）应用 ⇒ 我 R25 给的那条交叉核对 `packReport.applied ⊆ status().packs` **按字面 id 不成立**，只在**同帧靠人眼**。

**落法（不许并成一套）**：
- 在**manifest id 首次可知**的执行点记录映射（`vibe-math-vmu.js` 装载循环里 `res = await packLoader.apply(manifest)` **之后**）：`appliedIdMap.push({ requestId, manifestId })`；
- `packReport`：
  - ★ **`applied: [{requestId, manifestId}]`**（**两个 id 都带**，不是合并后的一套）；
  - ★ **`idMap: { '<requestId>': '<manifestId>' }`**（同帧的第二种表示）；
  - ★ **保留 `appliedPacks: [manifestId…]`**（既有语义的名字视图，**不改既有字段含义**）。

**实测（真装配）**：`applied=[{"requestId":"v5r","manifestId":"v5r-core"}]`、`idMap={"v5r":"v5r-core"}`、`status().packs=["v5r-core"]` ⇒ ★ **`applied[].manifestId ⊆ status().packs` 按映射成立**（可机检）。

**断言（F1–F3，`tests/vmu-pack-defaults-named.test.mjs`）**：F1 每条**同时**带 `requestId`／`manifestId`（★ 非空前置在同一表达式）；F2 按 `manifestId` 的交叉核对成立；F3 `idMap` 与数组**不漂**。
★ **当天反例**：把 `applied` 退回纯 manifest id 名表 ⇒ **`30 passed / 2 failed`**，**F1／F2 红**（且我**先定位到那两处重复行**：见 §4）。

---

## 2. D2 · 工具名级 `registered`

**问题**：真机回执里 `"registered"` **只出现 1 次** ＝ `guards.registered` 的 **4 个守卫名** ⇒ **`published − registered` 在回执里根本不可算**（只能从一份守卫名单**误推**）。

**落法**：`host.js` 状态面新增 **`faces.registeredTools`**（工具名数组，**与 `publishedDetail` 对称**）＋ **`registeredToolDetail`**（`[{name, face, reason}]`，与 `publishedDetail` 同源同形）。★ 字段名**自己说明是哪一张名单**，不再与 `guards.registered` 混名。

**实测**：`registeredTools=15`、`published=15`（相等）、且**每一项都匹配 `^vibe_vmu_`**（**是工具名，不是守卫名**）✓。

**断言（F4–F5）**：F4 是**工具名**（不是守卫名）；F5 与 `published` 一致 ⇒ `published − registered` **可算**。
★ **当天反例**：去掉 `registeredTools` ⇒ **`30 passed / 2 failed`**，**F4／F5 红**。

---

## 3. 未落两条（**具名**）＋ 设计

### 3.1 ③ 回执自述截断 —— **未落**
**已知事实（`vmu-assistant2` 的 raw 证据，Lead 已确认）**：省略标记是**插进 JSON 文本中间**的（两臂 position **24846** 逐字 `…"source":"default"\n\n[...]\n\n":744,…`）⇒ **省略发生在【我们序列化之后】**（宿主渲染 tool result 时做的）。
**因此**：★ **我们这侧未必"知道"自己被省略** ⇒ 两条分开处置：
1. **可行落法（我们的责任）**：**先按尺寸上限收口** —— 我们自己序列化时若超限，返回 `truncated:true` ＋ **主动列出省略区间/字节数**；★ **判据可红**：种一个超限反例（回执大于上限）必须红。
2. ★ **宿主事后插入的省略**：记为 **【宿主边界】**，**我们不声称能自述**（与 `systemPrompt` 那条同形）—— **明写在文档/报告里**，而不是假装覆盖。
**为什么本轮未落**：该项需要一个**尺寸策略**（上限取值、按字段还是整体、是否分片）＝**设计决定**，且要动序列化路径；我在预算内选择**先把有确定判据的 D1/D2 做扎实**，**不做半截**（半截会把"省略不可见"换成"自述了但不对"）。

### 3.2 ④ `promptSection` 进回执 —— **未落**
**现状**：`promptSectionState`（`vibe-math-vmu.js:785` 声明，`:791`／`:814` 两处降级写入）**只在 stderr 一行**（`:793`／`:816`），回执里没有该字段。
**设计（与 `packReport` 同型，小）**：入口 adapter 参数加 **`promptSection: () => Object.assign({}, promptSectionState)`**（**函数晚绑定**）⇒ `host.js` 两个签名各加 `promptSection = null` ＋ `:869` 透传 ⇒ 状态工具里 `out.promptSection = …`（包 try/catch、用**已登记码**）。★ 判据：`VMU_EXTERNAL_UNAVAILABLE` 降级发生时，回执里**能读到** `{registered:false, code, what}`（**不再只有 stderr**）。
**为什么本轮未落**：预算；★ 但它**与已落的 `packReport` seam 完全同形**，下一轮可直接照抄（**约 6 行**）。

---

## 4. ★ 我自己的一条工具级教训（本轮第 6 条量具问题，已自陈）

**D1 的两处编辑点也是"同一行出现两次"**（`packReport` 在**adapter seam** 与**出口访问器**里各一份）⇒ 我第一次 `edit` 用单处 `old_string` **被工具拒绝（matched 2 times）**，随后**改用 `replace_all`**；★ 与 R27 那次（`String.replace` 静默只改第一处、导致**有效断言被误记成"没牙"**）是**同一族**：**面对重复行，必须显式选择"全部"或"按偏移定位"**，否则要么静默漏改、要么改错一边。★ 本轮**工具挡住了**（`edit` 报 `matched 2 times` 而不是静默改第一处），这正是"**宁可报错不可静默**"的价值 —— 我把它记下来，作为 R27 那条的**正面对照**。

---

## 5. 原样命令 ＋ 退出码

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/vmu-pack-defaults-named.test.mjs` | **`32 passed, 0 failed`**（新增 F1–F5） | **0** |
| `node tests/vmu-packs-active-switch.test.mjs` | **`24 passed, 0 failed`**（★ B7 已按 D1 改写，见下） | **0** |
| `node tests/vmu-host.test.mjs` | `107 passed, 0 failed` | **0** |
| `node tests/vmu-host-hooks.test.mjs` | `22 passed, 0 failed` | **0** |
| `node tests/vmu-entry.test.mjs` | `150 passed, 0 failed` | **0** |
| `node tests/audit-status-report-fields.mjs` | `19 passed, 0 failed` | **0** |
| `node tests/audit-enforced-consistency.test.mjs` | `358 passed, 0 failed` | **0** |
| `node D:\_tmp\vmu-pack14\r30-counterexamples.mjs` | CONTROL **32/0** ⇒ M-D1 **30/2**、M-D2 **30/2**（**均无 SyntaxError**）⇒ 复原 md5 相同、回 32/0 | 0 |

★ **我自己的既有断言被 D1 改变形状，被套件当场抓到**：`vmu-packs-active-switch` 的 **B7** 原来把 `packReport.applied` 当**字符串**用（`applied.every(id => status.packs.includes(id))`）⇒ D1 后它**红**（`23/1`）。★ 我把它**改成按显式映射核对**（`applied[].manifestId ⊆ status().packs` ∧ 每条都有 `requestId`）⇒ 回 **24/0**。★ 这条正是"**改了字段形状就要跑消费它的断言**"的现场实例 —— **是套件抓到的，不是我想到的**。

---

## 6. 交回 Lead／`vmu-verify2`

1. **D1 已落并可机检**：`applied:[{requestId,manifestId}]` ＋ `idMap` ＋ 保留 `appliedPacks`；**两套 id 未并**。断言 F1–F3 ＋ **当天反例 30/2 红**。
2. **D2 已落**：`faces.registeredTools`（工具名，非守卫名）＋ `registeredToolDetail`；`published − registered` 现**可算**。断言 F4–F5 ＋ **当天反例 30/2 红**。
3. **③／④ 未落，具名 ＋ 设计已给**（§3）：③ 需一个**尺寸策略**决定（我**不做半截**），并把**宿主事后省略记为宿主边界**；④ 与 `packReport` 同型、约 6 行。★ 二者**都不影响已落两条的自洽**。
4. **★ 写者隔离的口径冲突（请裁）**：`task-151` **正文**写"与 `vmu-core2`（`task-149`）协调：它下一轮在动 … ＋ **`vibe-math-vmu.js`**"；而 **Lead 的口头指令**写"**`vibe-math-vmu.js`／`host.js` 归你**，`task-149` 归 `vmu-comms2`（`settings/schema.js`／`kernel/**`）"。⇒ ★ **我按 Lead 的最新指令执行**（本轮确实改了 `vibe-math-vmu.js`）。**若 comms2 也在改它 ⇒ 同文件两个写者的风险**，请据此裁（我**未**碰 `settings/schema.js`／`kernel/**`）。
5. **边界**：`kernel/meetings.js` 未碰；`package.json` **未改**（未新增文件 ⇒ **计数不增**）；**未自造公开码**；探针与变异全在 `_tmp`。
