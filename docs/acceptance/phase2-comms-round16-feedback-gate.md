# Phase 2 · comms · Round 16 · ★★ 缺席的常驻断言：**配置 → 回执 → 投递** 这条链

> ★ 交付：`tests/b1prime-feedback-gate.test.mjs` ⇒ **8 passed / 0 failed**（真入口 `entry.apply`，不手搓内核）。
> ★ **反例（重演回归，副本制）**：把入口的 provider 改成**返回空对象**（＝ ca531db 那个闭环的形态）⇒ ★ **MUTANT gate exit=1（红）**，CONTROL（同一副本未变异）**8/0 绿**，**真树 hash 前后一致**。
> ★ **一处必须说清的差别**（见 §3）：我的重演**在机制上**是那个闭环，但**输出的形状**与原始回归不完全一样 ⇒ 我**把差别写明**，不当作等价重演。

## 1. 断言钉的是什么（口径，已写进文件头注释）

★ **它钉"CONFIG → RECEIPT → DELIVERY 这条链是通的"**；★ **不钉"投递内容正确"**（内容由模块自己的断言管）。

## 2. 真入口 ＋ 非空前置（照 `tests/vmu-entry.test.mjs` 的 `fakeCtx` 形态）

- **真入口**：`entry.apply(ctx, { clock, vmu: { 'vmu.report.feedback': true, 'vmu.report.audience': 'm1' } })` ⇒ ★ **不手搓内核**（本次回归**恰在装配层**，手搓会绕过它）。
- `fakeCtx` 提供 **带 `.context` 且计数**的 `systemPrompt`（`state.contextCalls`），以及 `tools.register` / `effect` / `on`。
- **回执的取法**：**按形状**在 `handle.kernel.status()/report()/snapshot()` 里**递归查找**那个 9 键对象（`enabled/delivered/code/stack` 同时存在）⇒ **不猜 `status()` 的具体挂载路径**。
- ★ **非空前置**：**`context()` 计数 ≥ 1** —— 否则断言可能在没有投递的路径上"通过"。

## 3. 断言内容与读数

| # | 断言 | 意图 |
|---|---|---|
| 1 | 面**暴露了**回执（按形状找到） | 可读性前提 |
| 2 | **配置开 ⇒ `enabled:true`** | 开关至少能被读到 |
| 3 | ★★ **前置：`context()` 真的被调过（≥1）** | 证明**走到了投递** |
| 4 | ★★ **`enabled:true` ⇒ `delivered:true`** | ★ **这就是 329 套件全绿时缺的那条** |
| 5 | ★★ **`context()` 恰好 1 次**（不是 0、不是 2） | 不重复投递 |
| 6-8 | ★ **反向臂（配置关）**：`enabled:false`、`delivered:false`、**`context()` 0 次** | ★ **零机制**：关掉就是真的关掉 |

**实测（真树）**：`=== B1PRIME FEEDBACK GATE: 8 passed, 0 failed ===`

## 4. ★ 当天副本制反例（重演回归，target-addressed）

**回归的活线**（我定位到的）：`vibe-math-vmu.js:497` `reportFeedback: () => Object.assign({}, reportFeedbackState)` —— ★ 回执的 provider **读的是投递状态**，而投递状态由投递（`:853 deliverReportFeedbackFrom(...)`）写回 ⇒ **闭环**。
**变异（只改副本）**：把该行改成 `reportFeedback: () => ({})`（投递读到空 ⇒ 判"关" ⇒ 写回"关"）⇒ **落地证明**＝原锚点消失。
```
CONTROL (copy as-is): exit=0 (green ✓) === B1PRIME FEEDBACK GATE: 8 passed, 0 failed ===
MUTATION LANDED ✓ (provider now returns an empty object; original anchor gone)
MUTANT gate: exit=1 (red ✓) === B1PRIME FEEDBACK GATE: 3 passed, 5 failed ===
  FAIL ★ the face exposes the feedback receipt … [null]
  FAIL ★ config ON ⇒ the receipt says enabled:true … [null]
  FAIL ★★ CONFIG → RECEIPT → DELIVERY: enabled:true ⇒ delivered:true [null]
  FAIL ★ reverse arm: config OFF ⇒ enabled:false [null]
★ 红在"配置→回执→投递"那条链上=YES ✓      REAL TREE UNTOUCHED ✓
```
★ **所以这条断言【能红】，不是没牙**（★ 这正是你要求的判定："如果这条反例不能红 ⇒ 报你"；**它红了**）。

## 5. ★ 必须说清的差别（诚实口径，不当作等价重演）

- **机制上**我的变异**就是**那个闭环（provider 读状态 → 投递写状态）；
- ★ **但输出形状不同**：原始回归里回执是**完整的 9 键、值为 `false/default/null`**（真机与进程内复核者都这样读到）；我的变异让 provider **直接返回 `{}`** ⇒ 我的**按形状查找**找不到回执 ⇒ FAIL 详情是 `[null]`（**"回执不见了"**），而不是 `enabled:false`。
- ⇒ ★ **结论**：断言**能红**（要求达成），但**"以原始形状重演"这一更强的证明我没做** ⇒ ★ **记「未取得」**：下一轮把变异改为"provider 返回**完整 9 键、`enabled:false`**"（更贴近真机读数，FAIL 详情应显示 `[false]`），那才是**逐形状**的重演。
- ★ 顺带：我也**没有**让这次反例走**真机**（本轮只做进程内副本），真机面由复核者负责。

## 6. 纪律 / 登记 / 没核

- ★ **纪律 33**：**新测试文件 ⇒ 派生计数会变** ⇒ 若 `--check` 变 STALE **请你 `--write`**（我不自行 `regen-all`、不 git）；★ 本轮**未跑门禁**（若下轮要跑，会先提醒你 `git add`）。
- ★ **写者隔离**：新文件 `tests/b1prime-feedback-gate.test.mjs`（★ 按你的"新文件用你的族名"要求）；★ **未改** `vibe-math-vmu.js`／`kernel/**`／`report.js`／`reportfeedback.js`（只在**副本**里变异）。
- **没核**：逐形状重演（§5）；真机面；`audit-package-membership` 未独立复跑（R5 已按你的实测解除）。
- **仓内改动**：新测试 ＋ 本报告；**无半截状态**；**未改** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`。
