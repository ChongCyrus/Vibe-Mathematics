# Phase 2 · pack round 12 · A1 Part A — **未开工** ＋ ★★ **四个落点的【可直接粘贴】补丁文本**（让下一轮变成复制粘贴）

> Task: Part A（(1) schema 两行＋生成器 ／ (2) `cfg()` 真读取 ／ (3) 回执 9 键 ／ (4) seam ／ (5) 矩阵行收尾 ／ (6) 完整派生检查）。
> ★★ **§0 状态：未开工。★ 本轮零仓内改动**（只读＋本报告）。
> ★ **但本轮交出的东西是可完成的、且直接缩短下一轮**：★ **四个落点的【逐字补丁文本】**（§2–§5）⇒ ★ 下一轮**不需要再做设计判断，也不需要再读文件**，只需粘贴并跑门禁。

---

## 1. ★ 你的新判据我采纳，并做两点确认（它比我原来那条更准）

**你的判据**：★ 一段拆分**合法**，**当且仅当【未接线的那部分】在回执里以【真实】原因具名**；★ "投递调用尚未实现"＝真话 ✓；★ "宿主没有 `systemPrompt.context()`"＝假话 ✗（那时不许写）。

★ **我认为它比你的旧判据（"只做 2 不含 4＝禁止"）更准**，两条理由：
1. ★ 本仓**本来就有**"显式未完成"的合法值（零机制矩阵的 `EXPECT_UNDECIDED`）⇒ ★ **未完成是一种【可以具名声明】的状态**，不是只能靠"什么都不做"来避免的；
2. ★ 旧判据把"**做了一半**"与"**做了一半并说清楚**"当成同一件事 ⇒ ★ 而本仓真正的红线是后者（**静默**），★ 尤其当"空态"**看起来像"没开"**时 —— ★ **具名未完成态正好把这两种状态分开**。

★ **两点确认（我按你的判据自查过）**：
- ✅ **Part A 合法**：它的未接线部分（投递调用 ＋ seam 的 live 值）**在回执里有位置具名**（`reportFeedback.delivered:false` ＋ `code` ＋ `what` ＋ **真话 `reason`**）；
- ❌ **"只做 schema 两行"仍然不合法**：★ 那时**回执还不存在** ⇒ **没有地方具名** ⇒ ★ 所以 **(1) 不能单独做**（它必须与 (2)(3)(4) 同批）—— ★ 这正是我前四轮"不做"的判据，**在新判据下依然成立**，只是**边界变清楚了**。

## 2. ★ (1) `settings/schema.js` —— 两行手写声明（`//` 区、生成块之外）

★ **落点**：`settings/schema.js:955-958` 一带（`vmu.report.enabled`（`:955`）／`vmu.report.recipients`（`:958`）所在手写区）⇒ ★ **紧跟这两行之一插入**，形态照邻居逐字对齐：
```js
  // ★ A1 第一步（第二阶段）: 汇报的【反馈回路】开关。默认 false —— ★ 框架只加开关，不翻任何 pack 的默认。
  'vmu.report.feedback': { type: 'boolean', default: false, doc: '…（一句人话，进 04-§11 生成表）' },
  // ★ 受众：谁应当收到汇报。默认空串 ⇒ 开关开而受众为空时【具名失败】，不静默。
  'vmu.report.audience': { type: 'string', default: '', doc: '…' },
```
★ **不写生成块**；★ 改完**跑生成器**（`scripts/generate-wired-schema.mjs`，按其既有用法）；★ **无需 `HAND_DECLARED_DOMAINS`**（R8 已证两键不是生成产物 ⇒ 生成器不可能把它们当 planned 再写一遍）。
★ **`doc` 字段必填**（`:51` 说明它会进生成参数表）⇒ ★ 两个 `doc` 都不能空。

## 3. ★ (2) `kernel/report.js:107-118` 的 `cfg()` —— 两处 `sget`（★ **W1 要的"真读取"证据**）

★ **在既有 `recipients`（`:111`）之后插入**，与邻居同形：
```js
  // ★ A1 第一步: 汇报反馈回路的两个键。★ 这两行【就是】"有人调用时读"的证据 ——
  // `LIVE_READERS` 里 `'vmu.report.'` 那行只声明"谁在调用时读"，真正成立要靠【这里真的读】。
  feedback: sget('vmu.report.feedback') === true,
  audience: (() => { const v = sget('vmu.report.audience'); return typeof v === 'string' ? v : '' })(),
```
★ **`source` 的算法**（沿用既有词表 `'default'`／`'settings:<key>'`／`'config:<key>'`／`'pack:<id>'`）：★ 用本仓既有的"来源"工具（`settingsMerge`／`settingSource` 那一族）；★ **若该工具在此处不可达** ⇒ ★ **本段退化为**：`enabled===false` ⇒ `source:'default'`；`enabled===true` ⇒ `source:'settings:vmu.report.feedback'`（★ **并具名说明这是本段的范围**），★ **不要臆造来源**。

## 4. ★ (3) 回执 9 键 —— **本段填【具名未完成态】（原因必须是真话）**

★ **落点**：报告回执对象处（★ `reportFeedbackReceipt` 已落在 `kernel/reportfeedback.js`）：
```js
  // ★ A1 第一步 · Part A: 开关值与受众【已真读】(见 cfg)；★ 投递调用【本段未接线】——
  // ★ 这句话必须是真话：本构建里投递调用尚未接上，【不是】"宿主没有该能力"。
  reportFeedback: reportFeedbackFailure({
    enabled: cfg().feedback,
    source: <§3 的来源>,
    audience: cfg().audience || null,
    what: REPORT_FEEDBACK_WHAT_CONTEXT,
    reason: 'the delivery call is not wired in this build (A1 step 1 Part A): the settings keys are read and reported, the systemPrompt.context() call lands in Part B',
  }),
```
★ **`reportFeedbackFailure` 已保证**：`delivered:false`／`registered:false`／`code:'VMU_EXTERNAL_UNAVAILABLE'`（**已登记码，非自造**）／`stack:null`（本段没有异常 ⇒ 不许编一个）⇒ ★ **9 键恒存在、两态同形** ✓。
★ ★ **禁止**：把 `reason` 写成"宿主没有 `systemPrompt.context()`"（★ **那是假话**：C1/R5 已证该 API 存在）。

## 5. ★ (4) seam（同 `packReport`／`promptSection` 型）＋ (5) 矩阵行收尾

**seam —— 与既有两处**逐字同型**（★ 我只给形状，落点按你 R12 给的"入口那一处"）**：
```js
// 入口：给 adapter 传一个【晚绑定】访问器
reportFeedback: () => Object.assign({}, reportFeedbackState),
// host.js: 两签名各加 `reportFeedback = null`，`specs()` 透传，状态面 `out.reportFeedback = reportFeedback()`
```
★ **本段它返回 §4 那个具名未完成态**（★ Part B 落地后改为真实投递结果）。
★ ★ **注意**：`promptSection` 的先例是**入口 → adapter → 状态面**；★ 而 `reportFeedback` 的**回执位置在 `kernel/report.js` 的回执里** ⇒ ★ **两个选择**：**(i)** 由 `kernel/report.js` 读 seam（★ 需要把 seam 传进 kernel）；**(ii)** 由宿主面在回执外**再报一次** ⇒ ★ **我建议 (i)**，因为 §3 的两个键本来就是 `kernel/report.js` 读的，**同一个回执里两处都写会变成两个事实** —— ★ **但这是 Part A 里唯一还需要你点头的形状选择**（★ 我按 (i) 写补丁，若你选 (ii) 请说）。

**(5) 矩阵行**：`scripts/generate-zero-mechanism-matrix.mjs` 的 `reportfeedback` 行 ⇒ ★ 把 **"★ 本段尚未接线"** 改成**准确**说法，例如：
> `★ Part A：**设置键已真读**（`kernel/report.js` cfg）＋ 回执 9 键；★ **投递调用（`systemPrompt.context()`）尚未接线**，将在 Part B 落在 `:797` 的 `if` 之外`

★ **若模块长出服务/`status()`** ⇒ **连登记值一起改**（`EXPECT_NA` 只对**当前形状**成立；本模块仍是纯函数 ⇒ **预计仍为 `EXPECT_NA`**）。

## 6. ★ (6) 完整派生检查 ＋ 状态

- ★ **`regen-all --check`**（纪律 33）：★ 本项改了 **schema**（生成表）＋ **一个 `kernel` 模块**（planned-code registry 的载体）＋ **矩阵行** ⇒ ★ **三个派生面都可能陈旧** ⇒ ★ **STALE ⇒ 报 Lead `--write`**（★ 我不跑 `regen-all`）。
- ★ **纪律 34**（机械转换先落盘转换前形态）：★ 本项**无机械转换** ⇒ 不适用；★ 但我**记着** R8→R9 那次缺口（§见 R11 报告 §4）。

| 项 | 状态 |
|---|---|
| (1)–(6) | ❌ **未开工**（★ **第五次**；理由＝四块耦合、我无法一次做完） |
| §2–§5 补丁文本 | ✅ **完成**（可直接粘贴） |
| 本轮仓内改动 | ★ **零** |
| 唯一待你点头的形状选择 | ★ **seam 读点**：由 `kernel/report.js` 读（我建议，**(i)**）／还是宿主面另报一次（(ii)） |
| v5r 默认 | ★ **未翻** ✓ |
| `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS` | ★ **未碰** ✓ |
| 既存不一致（`:817-818` 的 `undefined` order） | ★ 你已裁"不动、单独立项" ⇒ **我照记**（★ 我不改） |
