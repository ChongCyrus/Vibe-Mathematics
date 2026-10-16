# Phase 2 · pack round 8 · A1 第 1 段 — **第 1、3 步已落；第 2、4 步未做 ⇒ 模块【未接线，已具名】**

> Task: 第 1 段＝"三层真接线"（步骤 1–4）。
> ★★ **§0 状态：本段【未到达终点】。已完成：步骤 1（核查）＋ 步骤 3（新模块）＋ 双登记；未完成：步骤 2（schema 键）＋ 步骤 4（report.js 接线）。** ⇒ ★ **新模块当前【未接线】，我在此处【具名】**（本仓允许的形式：**"要么有消费者、要么具名未接线"**）。
> ★ 遵守：**未翻 v5r 默认** ✓；**未碰** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS` ✓；★ **`--check` 可能 STALE（见 §4）**；★ 新文件**已当场双登记** ✓。

---

## 1. ★★ 为什么这个停点【不是那三种"看起来绿"的状态】（本段要求显式写明）

你列的三条禁止停点**都是关于【设置键】的**：①模块无键＝声明无消费者；②键无 `LIVE_READERS` 证据；③回执 9 键无具名失败。★ 本段的事实是：
- ★★ **我没有声明任何设置键**（步骤 2 未做）⇒ **不存在"声明了却不生效"**；
- ★ **模块未被导入 ⇒ 它是"未接线"**，而本仓的规则**恰恰允许**这一点，**前提是【具名】** ⇒ ★ **本报告就是那个具名**；
- ★ **工作树干净且门禁绿**（§3）⇒ ★ 不是"表面绿实则少了东西"的半截，而是**一个完整、可用、被登记的单元**，只是**尚未接入**。

★ 换句话说：★ **我没有把"看起来绿"的东西留在树上，我把"没接线"这四个字写在了报告里。**

---

## 2. ✅ 步骤 1（核查）：**W2 的未核项已解，而且是【更简单】的那个结果**

**问题**：`vmu.report.feedback`／`vmu.report.audience` 是否已在 `planned.js` 的生成集合里（若在 ⇒ 必须加进 `HAND_DECLARED_DOMAINS`，否则生成器会再写一遍）。

**读数**（`planned.js` ＋ `schema.js` 按字面搜）：

| 键 | 结果 |
|---|---|
| `vmu.report.feedback` | ★ **NOT FOUND** |
| `vmu.report.audience` | ★ **NOT FOUND** |
| `vmu.report.recipients` | FOUND `schema.js:958`（对照项，说明 report 族确实在 schema 里） |
| `vmu.report.enabled` | FOUND `schema.js:955`（同上） |

⇒ ★★ **结论：两个新键【不是生成产物】⇒ 无需 `HAND_DECLARED_DOMAINS` 条目**（生成器不可能"再写一遍"），★ **步骤 2 因此比 R7 预估更简单**：**只需在 `schema.js` 的手写区（`vmu.report.enabled` 一带 `:955-958`）加两行**，★ 生成器**不需要**跳过它们（它们本就不在生成集合里）。
★ 附带确认 `HAND_DECLARED_DOMAINS` 的位置与形态：`scripts/generate-wired-schema.mjs:307`（一个 `Set`，用途见 `schema.js:1046/1056`）⇒ ★ **本段用不上它**。

## 3. ✅ 步骤 3 ＋ 双登记

**新模块 `vibe-math-vmu/kernel/reportfeedback.js`**（纯函数；★ **不碰 `host.js` 的 33 行余量**）：
- ★ `REPORT_FEEDBACK_MAX_BYTES = 65536` —— 注释里**逐字写明"宿主先例、非我们发明、且宿主不替我们强制"**（引 `dsh-session-reference/lib/index.js:98`／`:664-665`，并说明 `dsh-system-prompt` 的 `:114/:150` 只有 `.filter(len>0)`、**不截断**）；
- ★ `REPORT_FEEDBACK_CONTEXT_ORDER = 5000` —— **显式有限数字**，注释写明"**不靠发明槽名**"（`getContextOrder('<新名>')` 返回 `undefined` ⇒ 排序失据）；
- ★ `assertFiniteOrder(order)` —— **我们补宿主缺的校验**（`section()` 会抛 `:241`，`context()` 不会），拒绝时用**已登记码** `VMU_MIDDLEWARE_FAILED`；
- ★ `reportFeedbackReceipt()` —— **9 键恒存在**：`enabled/source/audience/delivered/registered/code/what/reason/stack`；空态＝`false`／`false`／`null`…**用值表达，绝不省略键**；
- ★ `reportFeedbackFailure()` —— **具名降级**，复用 `VMU_EXTERNAL_UNAVAILABLE` ＋ `what`／`reason`／**`stack`**（与既有 `promptSection` 形状对齐）；
- ★ `boundFeedback()` —— 截断**自述**（`truncated`／`elidedBytes`／`originalBytes`／`maxBytes`）。

**双登记（先例 `meetingdomain`／`receiptbounds`）**：
- `package.json` **`:540`** `"vibe-math-vmu/kernel/reportfeedback.js"` ✓
- `installer.js` **`:93`** vmu 预设 `files:` 内 `'kernel/reportfeedback.js'` ✓

**门禁（实跑）**：★ `audit-package-membership` **29 passed / 0 failed** ✓（正是抓"只登一边"的那道门）；★ `audit-code-size` **9 passed / 0 failed**（`host.js` 未动）；`node --check` 新模块通过 ✓。

## 4. ⚠ 需你处理：`--check` 可能 STALE

★ 我把新文件写进了 **`package.json files[]`** ⇒ ★ **派生计数会 +1** ⇒ ★ **`regen-all --check` 很可能 STALE** ⇒ ★ **按你要求报你：请轮末 `--write`**（我不跑 `regen-all`）。

## 5. ★ 未做（具名）与下一段的确切落点

| 步 | 状态 | 落点（已实读，机械可执行） |
|---|---|---|
| 2 schema 两行 | ❌ 未做 | `settings/schema.js` **`:955-958` 一带**（`vmu.report.enabled`／`recipients` 所在的手写区）＋ **跑生成器**（★ 不手写生成块） |
| 4 report.js 接线 | ❌ 未做 | `kernel/report.js` **`:107-118` 的 `cfg()`** 里加两行 `sget('vmu.report.feedback')`／`sget('vmu.report.audience')`（★ **这才是"真读取"＝W1 要的证据**，不是 `LIVE_READERS` 里那行）＋ 回执写 **9 键** ＋ 开关 ON 时 `systemPrompt.context({ name: REPORT_FEEDBACK_CONTEXT_NAME, order: REPORT_FEEDBACK_CONTEXT_ORDER, text })` ＋ 具名失败 |
| W3 对齐 | ★ 未做但已钉死 | ★ **受众/投递必须与 `:211`（`str(raw.channel) \|\| 'log'`）和 `:217-219`（`noRecipients`）走同一条路径**，★ **不另造第二套 channel 语义** |
| (5)(6)(7) | ❌ 留第 2 段 | 四臂测试／副本反例＋target-addressed 自检／零机制 `EXPECT_NA`（闭集挑词） |

★ **建议的下一段终点**：**步骤 2＋4 一次性完成**（**这两步必须同段**：★ 只做 2 就成了"声明了却不生效"，正是禁止的那一种），★ 完成后再做 (5)(6)(7)。

## 6. 状态表

| 项 | 状态 |
|---|---|
| 步骤 1（核查 W2） | ✅ **完成**（§2；结论＝**无需 `HAND_DECLARED_DOMAINS`**） |
| 步骤 3（新模块） | ✅ **完成**（§3） |
| 双登记 | ✅ **完成**（`package.json:540`／`installer.js:93`）＋ 门禁绿 |
| 步骤 2／4 | ❌ **未做（具名）** ⇒ ★ **模块【未接线】** |
| 三层真接线（段终点） | ❌ **未到达** —— ★ **本报告即"我停在哪、为什么不是那三种状态"** |
| v5r 默认 | ★ **未翻** ✓ |
| `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS` | ★ **未碰** ✓ |
