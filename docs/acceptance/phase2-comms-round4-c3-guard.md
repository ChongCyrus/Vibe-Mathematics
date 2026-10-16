# Phase 2 · comms · Round 4 · C3（计算属性访问守卫）＋ 一处约定一致性

> ★ 两项都完成：**① C3 守卫已落并【被证明会响】**（本树 0 处 ⇒ 只能靠夹具证明；具名点名 `kernel/zzcomputed.js:3` ＋ 非零退出）；**② `tests/b1prime-staleness-report.test.mjs` 的 `process.cwd()` 已改为同族的 `fileURLToPath(import.meta.url)` 口径**（并从**两个不同 cwd** 复跑证明）。
> 真树只读（hash 前后一致 ✓）；副本制；未跑全量／`regen-all`／git；**无半截状态**。

## 1. ① C3 守卫（`scripts/generate-vmu-settings-table.mjs`）

**做什么**：在命名空间那一遍里，对每个绑定 `nsBinding`（来自 `import * as NS` 或 `const X = (await) import(…)`）**额外扫 `<nsBinding>[`**；**任何命中 ⇒ 逐条打印 `file:line ＋ 绑定名 ＋ 该行`，并设 `process.exitCode = 1`** ⇒ ★ **"出现即被告知"，不再静默忽略**。
**★ 它【不是】在断言某个键的接线**：下标名**静态不可解析** ⇒ 文案明说"**这不是'没人读'：下标名静态不可解析 ⇒ 必须人工看**"。★ **残差（具名）**：**字面量常量键**（`const K='vmu.x'; NS[K]`）**不做常量表解析 ⇒ 不猜**；它**同样落在这个"响"的桶里**（而不是落进"没人读"），所以**不会被静默吞掉**。

**读数（真树，`--json`）**：`{wired:1108, undetermined:5, notWired:113, stale:false}`、**exit=0、守卫不响** ✓ ⇒ ★ **`--check` 仍 up to date，不需要你 `--write`**。

## 2. ★ 守卫【会响】的证明（当天副本制，target-addressed）

本树 0 处 ⇒ 守卫**只能靠夹具证明**（这正是本轮的核心要求）。`D:\_tmp\v48\c3.mjs`：拷 `scripts/`＋`vibe-math-vmu/` 到 `_tmp\v48\copy`，**真树只读**。
| 臂 | 构造 | 读数 |
|---|---|---|
| **CONTROL** | 只有副本（不加夹具） | **exit=0、守卫不响** ✓（证明它不是"恒响"） |
| **FIXTURE** | 副本里加 `kernel/zzcomputed.js`：`import * as NS from './store.js'`＋`return NS[key]`（第 3 行） | ★ **exit=1**，并**具名**：`· kernel/zzcomputed.js:3  NS[ … ]  return NS[key]` ✓ |
```
FIXTURE LANDED ✓ kernel/zzcomputed.js  (contains `NS[key]` at its line 3)
真实/对照/夹具 三行读数见上；★ 守卫会响（具名＋非零退出）= true
REAL TREE UNTOUCHED: 403479a1efc6b426 -> 403479a1efc6b426 OK (read-only ✓)
```
★ **target-addressed**：守卫打印的**行号 3** 与夹具里 `NS[key]` 的**真实行号一致**（落点在目标上，不是"随便响了"）；★ **夹具落地**也先证明（文件存在且非空）。

## 3. ② 约定一致性（不是缺陷）：`process.cwd()` → 文件 URL 口径

- **改法**：`const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')`，与本仓同族测试（`audit-claim-traceability`／`audit-code-size`／`audit-table-integrity`…）一致。
- ★ **定性（按你要求说明）**：**这是"约定一致性"，不是缺陷** —— 旧写法在 **runner 设了 cwd** 时是对的（所以一直绿），但**换个 cwd 就会以奇怪的方式失败**（它会去 `cwd` 下拷贝 `scripts/`）。
- **实测（两个 cwd 都跑）**：
```
real-cwd  EXIT=0  === B1PRIME STALENESS REPORT: 8 passed, 0 failed ===
other-cwd EXIT=0  === B1PRIME STALENESS REPORT: 8 passed, 0 failed ===   ← 从 D:\ 跑（就是这次要修的场景）
```
⇒ ★ **改前那种"奇怪失败"的路径已被证实可跑通**（旧写法我没再复现，故不给"改前从别处失败"的实测读数 —— **没核**，只给"改后两处都过"）。

## 4. 状态 / 没核 / 欠账

- **跑了/核了**：真树守卫静默＋计数不变（1108/5/113、`stale:false`、exit=0）；CONTROL／FIXTURE 两臂＋落地证明＋行号命中；测试从两个 cwd 各 8/0；真树 hash 前后一致。
- ★ **欠账（具名，连续第二轮）**：**`tests/b1prime-staleness-report.test.mjs` 仍未登记进 `package.json files[]`**（本轮预算用尽）；★ C3 目前**只有副本反例作证**，**未写常驻断言**（若要常驻：把 `D:\_tmp\v48\c3.mjs` 的 FIXTURE 臂搬进 `tests/`，并配"CONTROL 必须静默"的非空对照 ⇒ 我可在下一轮补，**登记与它一起做**）。
- **没核**：旧写法在非 runner cwd 下的**失败形态实测**（只给了改后通过）；`const K='x'; NS[K]` 的常量表解析（**明确不猜**，见 §1 残差）。
- **纪律**：★ **先 `git add` 再跑门禁** —— 我本轮**不跑门禁、不 git**；下一轮若跑，会先提醒你 `git add`（我不自行 git）。
- **仓内改动**：`scripts/generate-vmu-settings-table.mjs`（C3 守卫）＋ `tests/b1prime-staleness-report.test.mjs`（cwd 口径）＋本报告；**无半截状态**。
