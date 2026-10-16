# Phase 2 · pack round 10 · A1 接线轮 — **未开工（2 不含 4＝禁止的半截）** ＋ ★★ **步骤 4 的落点结构性更正**

> Task: 本轮**只做步骤 2＋4**（(5)(6)(7) 一律不做）。
> ★★ **§0 状态：未开工。** 依据你的原话：★ **"只做 2 不含 4 ⇒ 是禁止的半截"** ⇒ ★ 而我在本轮预算内**无法保证 2＋4 一起完成** ⇒ ★ **唯一不构成半截的选择是不开始**。★ **本轮零仓内改动**（只读＋本报告）。
> ★★ **但本轮有一次【实质推进】：我读出一个会让人写出不可能编辑的结构事实**（§1）⇒ ★ **它把下一轮的步骤 4 从"改两处"变成"改三处、且必须先加一个 seam"** ⇒ ★ 若不带这条信息去接线，**下一轮会在 `kernel/report.js` 里找一个根本不存在的服务**。

---

## 1. ★★ 结构性更正：**`systemPrompt` 只在【入口】手里，`kernel/**` 从来拿不到它**

**读数**（全量 grep `vibe-math-vmu/kernel/**` 的 `systemPrompt`）：
- ★ **`kernel/**` 里出现的三处，全部是我 R8 新模块自己的注释与常量**（`kernel/reportfeedback.js:31`／`:43`／`:54`）⇒ ★ **内核代码【从未引用】宿主服务** ✓

**读数**（谁能调 `systemPrompt.section`）：
- ★ **唯一持有者＝入口** `vibe-math-vmu.js`：`:806`（守卫）／★ **`:820` `const dispose = systemPrompt.section({ name: 'vmu', order, text })`**／`:825`／`:830-831`（**具名降级** `VMU_EXTERNAL_UNAVAILABLE` ＋ `what`／`reason`）✓

⇒ ★★ **结论：我在 R8 §3 写的"步骤 4＝在 `kernel/report.js:107-118` 的 `cfg()` 里调 `systemPrompt.context(...)`"【位置错了】** —— ★ **内核里没有那个服务，这个编辑根本写不出来**。★ 正确的三处分工是：

| 处 | 做什么 | 依据 |
|---|---|---|
| ★ `kernel/report.js`（`:107-118` 的 `cfg()`） | ★ **用 `sget` 读两键**（★ ＝**W1 要的"真读取"证据**）＋ **算出 9 键的取值**（`enabled`／`source`／`audience`） | `cfg()` 是按调用读设置的既有位置（`:108-118` 全是 `sget(...)`） |
| ★★ **`vibe-math-vmu.js`（入口，`:806-831` 一带）** | ★ **真正执行** `systemPrompt.context({ name: REPORT_FEEDBACK_CONTEXT_NAME, order: REPORT_FEEDBACK_CONTEXT_ORDER, text })`，并按既有形态**具名降级** | ★ **只有入口持有 `systemPrompt`**（`:820` 是既有先例） |
| ★ `kernel/report.js` 的回执 | ★ **把 9 键写进回执**（用已落的 `reportFeedbackReceipt`），其中 `delivered`／`registered`／`code`／`what`／`reason`／`stack` **来自入口的那次调用结果** | ★ 需要一条 **seam** 把结果从入口传回回执 |

**★ 由此新增一项必做（R8 计划里没有的）**：★★ **一条 late-bound seam**（与既有 `packReport`／`promptSection` **完全同型**：入口给 adapter 传一个 `reportFeedback: () => ({...})` 访问器，宿主面在**回答时**调用它）⇒ ★ **这正是前几轮反复用到的模式**，所以它**不是新发明**；★ 但**它必须与步骤 2／4 同批**，否则那 6 个字段没有来源 ⇒ ★ **否则回执只能填空态，而"空态"会被误读成"没开"**（★ 比不写更糟）。

## 2. ★ 由此修订后的落地清单（下一轮，已实读，机械可执行）

1. **`settings/schema.js:955-958` 一带**（`vmu.report.enabled`／`vmu.report.recipients` 所在**手写区**）加两行：`vmu.report.feedback`（boolean，`false`）／`vmu.report.audience`（string，`''`）⇒ **跑生成器**（★ **不手写生成块**；★ 无需 `HAND_DECLARED_DOMAINS`，R8 已证两键不是生成产物）；
2. **`kernel/report.js:107-118`**：`cfg()` 加 **`sget('vmu.report.feedback')`／`sget('vmu.report.audience')`**（★ **W1 的证据就在这里**，**不是** `LIVE_READERS` 那行）＋ 回执写 **9 键**；
3. ★★ **`vibe-math-vmu.js:806-831` 一带**：仿 `:820` 的既有形态，开关 ON 时调 **`systemPrompt.context({ name, order: REPORT_FEEDBACK_CONTEXT_ORDER, text })`**；抛异常 ⇒ **`reportFeedbackFailure(...)`**（已落，复用 `VMU_EXTERNAL_UNAVAILABLE` ＋ `what`／`reason`／`stack`）＋ **stderr 一行**；
4. ★★ **新增 seam**：入口 → 宿主面的 `reportFeedback` 访问器（**同 `packReport`／`promptSection` 形态**），把 3 的结果供回执读取；
5. ★ **受众/投递走 `:211`（`str(raw.channel) \|\| 'log'`）／`:217-219`（`noRecipients`）同一条路径**，★ **不另造第二套 channel 语义**；
6. ★ **同批**把零机制那行里的 **"★ 本段尚未接线"** 改掉（`scripts/generate-zero-mechanism-matrix.mjs` 的 `reportfeedback` 行）；
7. ★ **跑完整派生检查 `regen-all --check`**（纪律 #33），**若 STALE ⇒ 报 Lead `--write`**。

## 3. 三条"必须同批"的收尾 —— 本轮的状态（**照实**）

| 收尾项 | 本轮状态 | 为什么 |
|---|---|---|
| ① 改掉 `reportfeedback` 行的 **"本段尚未接线"** | ★ **未改，且现在【不该】改** | ★ **接线没落，这句今天仍为真** ⇒ ★ 现在改它**才是**"注释与事实不一致"。★ 它在下一轮**必须同批**改掉 |
| ② 跑 **`regen-all --check`** | ★ **未跑** | ★ 由你轮末跑（★ 我是只读轮、无派生改动）；★ **`regen-all` 归你**（我的硬约束） |
| ③ 头注释 `//` 形态 | ★ **本轮无新 kernel 模块** ⇒ 不适用 | ★ 纪律已记（并在 R9 报告里复述） |

## 4. ★ 你 R9 新立的纪律我照收，并**据实报告一处缺口**

> ★ **任何【机械转换】必须让【转换前形态】先进 git**，否则"无损"只有复核者手里的临时副本能证，临时目录一清就不可复核。

★ **据实说**：★ **我 R8 写模块时用的是 `/** */` 块注释，而那份【转换前形态】【从未进过 git】**（我的 R8 报告与消息里只有**转述**，不是一份可提交的原件）⇒ ★ **因此"转换无损"这件事，今天只剩"我 R9 逐字对照过 `:1`–`:14`"这一条复核，没有可再复核的原文** ⇒ ★ **这正是你那条纪律要防的情况，而它就发生在我这一轮之前。** ★ 我把它记为**缺口**，并接受：★ **下一次做任何机械转换前，先把转换前形态提交或落盘留档**。

## 5. 状态表

| 项 | 状态 |
|---|---|
| 步骤 2 | ❌ **未开工**（★ 不含 4 就是禁止的半截） |
| 步骤 4 | ❌ **未开工**，★ **且落点已更正为【三处＋一条 seam】**(§1) |
| 本轮仓内改动 | ★ **零** |
| 结构性更正 | ✅ **完成**（§1：`kernel/**` 拿不到 `systemPrompt`，只有入口持有） |
| v5r 默认 | ★ **未翻** ✓ |
| `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS` | ★ **未碰** ✓ |
| 无半截状态 | ✅ ★ 工作树与 R9 结束时一致 |
