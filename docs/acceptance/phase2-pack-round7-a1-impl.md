# Phase 2 · pack round 7 · A1 step 1 — **`NOT STARTED`（停在第 0 层，且这一点【不是半截】）** ＋ 三个接线点已钉死

> Task: 按 R6 §3 机械落地 A1 第一步（三层：键 → 消费者 → 回执）。
> ★★ **§0 状态：`NOT STARTED`。★ 本轮零仓内改动（只写本报告）。** ★ 理由与"为什么这不是半截"见 §1；★ 本轮把预算换成了**下一轮的确定性**（§2，三个接线点全部实读）。
> ★ **未翻 v5r 默认** ✓；★ **未碰** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS` ✓；★ 无仓内写入 ⇒ **`--check` 不会 STALE** ✓。

---

## 1. ★★ 我停在哪、为什么它**不是半截**

**★ 我停在【第一次写入之前】—— 第 0 层。** 依据是**你自己的裁定**：★ 你列的三种"看起来绿"的停点里，**第 1 种正是"落了模块但没落键"＝声明无消费者**。★ 以我本轮剩余的预算，**我能保证完成的最多是第 1 层（那个新模块）**，而
> ★★ **第 1 层单独存在，恰好就是你禁止的第 1 种半截。**

⇒ ★ **所以"先把第 1 层做了"不是进步，而是把一个【禁止的停点】写进仓库**（而且工作树会变脏、下一轮要在脏树上继续）。★ **唯一不构成半截的选择是：不开始，并说清为什么。** ★ 这就是本轮。
★ **注意这与 R6 不同**：R6 我停在同一位置是因为"三层一轮做不完"；★ **本轮停在这里是因为"我能做完的那一层本身就是半截"** —— ★ 这是**更强**的理由，不是同一个理由重复一次。

★ **我没有把预算浪费掉**：剩下的一次读取被用来**消除下一轮的全部不确定性**（§2），其中**含一处能显著缩小工作量的发现**（§2.1）。

---

## 2. ★ 三个接线点已实读（下一轮可机械执行，无需再判断）

### 2.1 ★★ W1：`LIVE_READERS` **已经有 `vmu.report.`** ⇒ 消费者登记是 **NO-OP**（发现，缩小工作量）

`vibe-math-vmu/kernel/index.js:183-189`（实读，逐字）：
```js
export const LIVE_READERS = Object.freeze({
  'vmu.prompts.': 'kernel/prompt (assembled per turn; the D-13 live reads)',
  'vmu.report.': 'kernel/report (settings.get on every call)',      // ★ 已有
  'vmu.resume.': 'kernel/resume (per call)',
  'vmu.ids.': 'kernel/ids (per mint)',
  'vmu.turn.': 'kernel/prompt via a {{ setting:<key> }} variable (per assembly)',
})
```
＋ `:190` `const liveReadersOf = (key) => Object.entries(LIVE_READERS).filter(([p]) => String(key).startsWith(p)).map(([, who]) => who)`

⇒ ★★ **两条结论**：
1. ★ **`vmu.report.feedback` 与 `vmu.report.audience` 会被前缀匹配【自动覆盖】** ⇒ ★ **回执 `liveReadBy` 将给出 `'kernel/report (settings.get on every call)'`** ⇒ ★ **任务第 3 步（`LIVE_READERS` 登记）不需要改任何代码** ✓；
2. ★★ **前提是 `kernel/report.js` 真的用 `sget` 读这两个键**（§2.3）—— ★ **"有登记"不等于"有读取"**：`LIVE_READERS` 只声明"谁在调用时读"，**真正的执法证据是读取本身** ⇒ ★ **下一轮必须两边都成立，且断言要量【读取】**（不是量表里有没有那一行）。

### 2.2 W2：schema 的**手写区**在哪（模式已定，★ 一处未核已具名）

- `vibe-math-vmu/settings/schema.js:54`：★ **"The HAND-WRITTEN core table. `SETTING_DEFS` below composes it with the GENERATED planned keys"**；
- `:1040`：★ **"`vmu.meetings.orderMode` is HAND-DECLARED here, OUTSIDE the generated block below, because …"** ⇒ ★ **这正是加两张手写声明的模式**；
- `:1046`／`:1056`：`HAND_DECLARED_DOMAINS`（在 `scripts/generate-wired-schema.mjs`）列出**生成器要跳过的键**；
- ★ **未核（下一轮第一件事）**：`vmu.report.feedback`／`vmu.report.audience` **是否已经出现在 `planned.js` 的生成集合里** ⇒ ★ 若在，**必须**按 `:1056` 的模式把它们加进 **`HAND_DECLARED_DOMAINS`**，否则生成器会**再写一遍**（这正是 `:1046` 那句警告的场景）。

### 2.3 W3：`kernel/report.js` 的**消费者落点**（实读，含 R5 更正后的行号）

`:107-118` 就是那个按调用读设置的 `cfg()`：
```js
const cfg = () => ({
  enabled: sget('vmu.report.enabled') === true,
  reports: (() => { const v = sget('vmu.report.reports'); ... })(),
  channels: (() => { const v = listOf(sget('vmu.report.channels')); return v.length ? v : ['inbox', 'digest', 'log'] })(),   // :110
  recipients: listOf(sget('vmu.report.recipients')),                                                                           // :111
  minIntervalMs: intOr(sget('vmu.report.minIntervalMs'), 60000),
  ...
})
```
⇒ ★ **两个新键的读取就加在这里**（`sget('vmu.report.feedback')`／`sget('vmu.report.audience')`）⇒ ★ **这同时让 §2.1 的 `LIVE_READERS` 声明成为真的**；★ 并且 `:211`（`const channel = str(raw.channel) || 'log'`）与 `:217-219`（`noRecipients`）**是同一条路径**——★ **开关 ON 时的"受众/投递"要与这一段对齐**（不要再造第二套 channel 语义）。

---

## 3. ★ 下一轮的执行顺序（已缩小的版本，且**先做能最早暴露接线问题的两步**）

1. ★ **先核 §2.2 的未核项**（`planned.js` 里有没有这两个键）⇒ 决定是否需要 `HAND_DECLARED_DOMAINS`；
2. **`settings/schema.js`** 两张手写声明（**生成块之外**）＋ 跑生成器 ⇒ ★ 若 `--check` STALE ⇒ **报 Lead `--write`**；
3. **`kernel/reportfeedback.js`**（`REPORT_FEEDBACK_MAX_BYTES = 65536` 宿主先例／`REPORT_FEEDBACK_CONTEXT_ORDER = 5000` 显式有限数字／`assertFiniteOrder()`／9 键构造／`boundFeedback`）；
4. **`kernel/report.js`**：`cfg()` 里读两键（§2.3）＋ 回执写 **9 键** ＋ 开关 ON 时调 `systemPrompt.context({name, order: 5000, text})`（宿主 `:266-268`）＋ **具名失败**（`VMU_EXTERNAL_UNAVAILABLE` ＋ `what`／`reason`／`stack` ＋ stderr）；
5. **四臂测试**（ON／OFF／具名失败／order 校验；★ OFF 臂：**9 键集合与 ON 逐字相同**；★ 每条带非空前置）＋ **双登记**；
6. **当天副本反例 ＋ target-addressed 自检**（M1 `context()` 改 no-op ⇒ 必红；M2 读键恒 `false` ⇒ ON 臂必红）；
7. **零机制矩阵** `EXPECT_NA`（**闭集挑词**，`:30`）＋ 核 note **不含手写键数**（R36 假正例教训）。

★ **工作量比 R6 估计更小**：★ **`kernel/index.js` 不需要改**（§2.1）⇒ 少一个 `KNOWN`/行数风险面。

---

## 4. 状态表

| 项 | 状态 |
|---|---|
| 三层实现 | ❌ **`NOT STARTED`**（停在第 0 层，★ **不是半截**，理由见 §1） |
| 仓内改动 | ★ **零**（只写本报告） |
| 三个接线点 | ✅ **已实读**（§2）＋ ★ **一处未核已具名**（§2.2 的 `planned.js`） |
| `LIVE_READERS` | ✅ ★ **发现已有 `vmu.report.`** ⇒ **登记步骤是 NO-OP**（§2.1） |
| v5r 默认 | ★ **未翻** ✓ |
| `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS` | ★ **未碰** ✓ |
