# Phase 2 · `vmu-accept` · Round 11：并入 R10（派单落点错误 ＋ 崩溃谓词两条新缺口 ＋ 纪律 34 成立／新纪律 35）

> **交付物**：① 总账 `docs/acceptance/17-objective-status.md`；② 本报告。★ **本报告未跟踪**（`git ls-files` 门禁此刻看不见它 —— §5.9-24 的自指现场）。
> **纪律**：**只读**（侦察＋两条崩溃实验）＋ **只写**总账与本报告；★ **未跑全量（T0/T1 归 Lead）／未跑 `regen-all`（明令禁止）／未做任何 git 写**。

## 0. 哪一次运行、哪一版文件（★ 本轮的**重点**就是版本）

| 项 | 值 |
|---|---|
| HEAD | **`a79efa9`**（*docs(acceptance): correct a plan that named an impossible edit site, and record two more real holes in the crash-path predicate*；★ **4 files, +218/−2，只有 docs／报告**） |
| ★★ 工作树 | **不 clean**：**` M scripts/generate-wiring-index.mjs`**（**R11 在飞修复 `+25/−5`**）＋ 我自己的两处写入 ⇒ ★ **我核过：committed blob【修复前】（只有 `if (c.detail) …`），工作树【修复后】** ⇒ ★ **§0.3f 明确分"HEAD 版／工作树版"两种读数** |
| 我的窗口 | 2026-10-16 **10:1x – 10:3x** |

## 1. ★★ ① 我核了那处【派单错误】（第一手 grep）

- ★ **`vibe-math-vmu/kernel/**` 里没有 `systemPrompt` 服务**：我全量 grep 该目录的 `*.js` ⇒ `systemPrompt` **只出现在 `reportfeedback.js` 自己的注释/常量**：`:31`（注释）／`:43`（注释：我们传给 `systemPrompt.context({name,order,text})` 的顺序）／**`:54 export const REPORT_FEEDBACK_WHAT_CONTEXT = 'systemPrompt.context'`** ⇒ ★ **kernel 里没有持有者**。
- ★ **唯一持有者是入口** `vibe-math-vmu/vibe-math-vmu.js`：**:798 `let systemPrompt = null`**／**:800** 取值／**:802** 具名降级态／**:804** stderr 提示／**:806** 守卫（`typeof systemPrompt.section === 'function'`）／`:820/825/830-831`（Lead 给的坐标族）⇒ ★ **"在 `kernel/report.js` 里调 `context()`"这个编辑点【写不出来】成立**。
- ⇒ ★ **正确分工**（已入总账）：**kernel 只做 `sget` 两处 ＋ 算 `enabled`/`source`/`audience`**；**入口**执行 `context()` ＋ 具名失败；回执另 6 字段来自**入口那次调用** ⇒ ★★ **必须新增 `reportFeedback` late-bound seam**（与 `packReport`／`promptSection` 同型），否则那 6 字段**只能填空态、而空态会被误读成"没开"**。
- ★ **新纪律 §5.9-35**：**"计划的落点必须先核【谁手里有那个能力】"**（★ 与 1／20／31 同族）。

## 2. ★★ ② 崩溃谓词两条缺口：**我做了两条第一手测量**

### 2.1 缺口 A（**字段集合随失败形态变化**）—— 代码读数（决定性）

★ **HEAD/committed blob `:344`** ＝ `if (c.detail) console.error('    诊断: ' + c.detail)`，★ **没有 `else`** ⇒ ★ **子进程"非零退出但零输出"时，父进程【没有 `诊断:` 行】** ⇒ ★ **报告携带的字段集合随失败形态变化** ⇒ ★ **正是 `receiptMeta`（R32/R33）拒绝过的形状**（§5.9-7「有条件的键本身就是形状变化」）。
★ **工作树的修法＝改【形状】**：`:347 else console.error('    诊断: （子进程无输出）status=' + c.status + ' signal=' + String(c.signal))` ⇒ **那一行恒在场** ✓。
★ 我**没有**独立构造"零输出非零退出"的子进程（★ **该项＝代码读数，不是复现**）；★ 现有常驻断言也抓不到（其崩溃前置用"路径不存在" ⇒ 子进程**总会打 ENOENT**）。

### 2.2 缺口 B（`FATAL ERROR:`／OOM）—— ★★ **我复现了**

| 臂 | 命令 | 我的读数 |
|---|---|---|
| **子进程** | `NODE_OPTIONS=--max-old-space-size=16 node scripts/generate-vmu-settings-table.mjs` | **EXIT=134**／**23 行**／含 **`FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`**／★ **无 `^\s*Error:` 行**／**末行 `15: 000001E9800D9B5A`**（裸地址帧）✓ |
| **父进程（工作树＝修复后）** | 同上 env ＋ `node scripts/generate-wiring-index.mjs --check` | **EXIT=2**；★ 末行 ＝ **`诊断: FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`** ⇒ ★ **修复把有用那行抬出来了** |
| **对照：HEAD（修复前）** | 我核 committed blob | ★ **无 `FATAL ERROR` 谓词、无"无输出"分支** ⇒ ★ **Lead 的 B 读数（父报裸地址帧）属于 HEAD** ✓ |

★ **修法的两条轴**：**① 谓词**（`:173 const fatal = detailLines.find((l) => /^\s*(FATAL ERROR|Assertion)/.test(l))`）＋ **② 形状**（`诊断:` 恒在场）⇒ ★ **正好对应 §5.9-7 与 §5.9-30 两条既有纪律**。
★ **分支 2／3**（多条 `Error:` 取第一条可能非根因；SIGKILL 无 `诊断:`／`process.abort()` ⇒ `诊断: 2: run (…:561:25)`；Windows `process.kill` ⇒ `code=1`／`signal=null`；三者非零码 **1／134／134 都 exit 2**）＝★ **只读转述 Lead 的构造实验**（我未复现）。

## 3. ★ ③ 纪律 34：成立，且【三步可核判据】我跑了前两步

| 步 | 命令 | 我的读数 |
|---|---|---|
| 1 | `git log --all --oneline -- vibe-math-vmu/kernel/reportfeedback.js` | ★ **只有 `31fd3cd` 一笔** ⇒ 原形从未进 git |
| 2（★ 决定性） | `git cat-file -e AC62832C513E8744` | ★ **`fatal: Not a valid object name`，exit 128** ⇒ **转换前字节不是 git 对象** ✓ |
| 3 | 仓外副本带哈希？ | ★ 我算的快照全量 sha256 ＝ **`ac62832c513e87449b3acc1c3ec0277fe8f7b28f5c24542c159800a3362190db`**（**7,367 B**）＝ 与 Lead 的 `ac62832c…190db` **一致** ✓ |

★★ **边界（已入总账）**：★ **若临时副本被清 ⇒ 退化成"不可复核"（不是"假"）**；★ 我只能证"**那份仓外快照与提交版正文一致**"，★ **不能证"那份快照就是当初被转换的字节"** —— ★ **这正是 34 要防的**。

## 4. ④⑤⑥ 归族、A1、门禁（归属分开）

- ★ **④ 三处仪器失误已在 §5.9 归族**（1 → §5.9-1；2 → §5.9-31，★ **含我自己那一次**；3 → §5.9-12 家族＋"选择器要窄到只命中目标那张表"）。
- ★ **⑤ A1**：**步骤 2／4 连续【四】轮未开工**（判据原子性＋预算）⇒ **"不开始＋说明"＝唯一不构成半截的选择、零仓内改动**；★ **R11 已按更正后的落点派它做（含新增的 seam）**。
- ★ **⑥ 门禁**：**Lead 实跑（转述）** T0 **25/25**、`regen-all --check` **15/15**、★ **T1 未重跑且不需要**（零个代码文件与 T1 通过那个提交不同）；**复核者实跑（转述）** `generate-kernel-index --check`（`99 modules, 0 headerless`）／`audit-kernel-index` **6/0**／`regen-all` **15/15**／`host.js` **1167 ≤1200**／`run-tests.mjs` blob 未变；★ **我实跑**：`audit-table-integrity` **0** ＋ §1 的 grep ＋ §2.2 两条崩溃实验 ＋ §3 的前两步。

## 5. 诚实边界

1. ★ **未做 git 写**；★ **未跑 T0/T1/`regen-all`**（`regen-all` 属明令禁止）。
2. ★★ **我的崩溃测量打在【工作树（修复后）】**，★ **Lead 的读数打在【HEAD（修复前）】** ⇒ ★ **两个都真、版本不同**（★ 我在总账里明写这一句）—— ★ 这也是本轮最容易写错的地方。
3. ★ **缺口 A 是代码读数，不是复现**；★ **分支 2／3 是转述**。
4. ★ **本报告未跟踪** ⇒ 提交前请 **先 `git add`**；★ 并按 **§5.9-32**：**先收口提交、再派下一轮**（★ 我读到时 `phase2-pack-round11-a1-wire.md` **已在落地**）。
