# Phase 2 · comms · Round 19 · 三态可区分：`what`/`reason` 拆分断言（复核者 R18 提的两条）

> ★ 交付：`tests/b1prime-state-split.test.mjs` ⇒ **8 passed / 0 failed**（真入口 `entry.apply`，不手搓内核）。
> ★ **反例（副本制，target-addressed）**：把交付模块里 3 个裸 `'systemPrompt'` 记号**改写**成 `'systemPrompt.context'`（＝让两态共用一个 `what`）⇒ ★ **MUTANT exit=1、7/1，唯一的 FAIL 就是 `PIN 1a`**；★ **CONTROL（同副本未变异）8/0 绿**；★ **真树 hash 前后一致**。
> ★ **回答你的问题：没有依赖旧 `reason` 字符串**（见 §0）。

## 0. ★ 回答："那 8 条里有没有依赖旧 `reason` 字符串的？"

- **没有**。`grep reason tests/b1prime-feedback-gate.test.mjs` ⇒ **零命中** ⇒ ★ **8 条断言全部只钉结构量**（`enabled` / `delivered` / `context()` 调用次数 / 回执的存在），**没有一条引用任何 `reason` 文本**。
- ⇒ ★ **所以你这次改措辞而它没红，是设计使然**（它钉**链路**，不钉文本），**不是漏网**。★ 我**也不会**在新断言里钉 `reason` 文本（见 §1 口径），理由同源：**文本会漂**。

## 1. 口径（已写进文件头注释）

★ 这些断言钉的是 **"这些宿主状态在【回执】里可区分"**；★ **不钉"这些状态在宿主里互斥"**；★ **也刻意不钉任何 `reason` 文本** ⇒ **改措辞不会红它，但状态【碰撞】会红它**。
★ **为什么"可区分"是红线**：拆分前"**没有提供服务**"与"**提供了但不带 `.context`**"**逐字同句**；若两者读起来一样，**同一宿主状态**有时会被报成"NOT reachable"、有时被报成"宿主没有 `.context` 方法" ⇒ ★ **一句关于宿主的假话**（具名但不真）—— 与"**不许把能力缺失说成假话**"同一条红线。

## 2. 四条宿主状态（都是真入口构造）

| 态 | 构造（只变 `ctx.get` / `systemPrompt`） |
|---|---|
| ① **无服务** | `ctx.get` ⇒ `undefined` |
| ② **有服务但无 `.context`** | `ctx.get` ⇒ `{ section: () => () => {} }` |
| ③ **取用抛** | `ctx.get` ⇒ **throw** |
| ④ **调用被拒** | `ctx.get` ⇒ `{ context: () => { throw … } }` |

## 3. 断言（8 条）与**非空前置**

| # | 断言 | 前置 |
|---|---|---|
| 1 | ★ 态① 产出回执且 **`delivered:false`** | 真的是"未投递"的回执 |
| 2 | ★ 态② 产出回执且 **`delivered:false`** | 同上 |
| 3 | ★★ **PIN 1a：态①与态②的 `what` 必须不同** | 两态都真的走到各自分支（由 1/2 保证） |
| 4 | ★★ **PIN 1b：态①与态②的 `reason` 也必须不同** | 同上 |
| 5 | ★ 态③/④ 都产出回执 | 两态都到达 |
| 6 | ★★ **PIN 2a：态③与态④的 `reason` 不同** | 同上 |
| 7 | ★★ **PIN 2b：态③与态④【都带 stack】** | 同上 |
| 8 | ★ 四态**都不得声称 `delivered:true`** | 回执不过度声称 |

**实测**：`=== B1PRIME STATE SPLIT: 8 passed, 0 failed ===`

## 4. ★ 当天副本制反例（target-addressed）

`D:\_tmp\v54\counter.mjs`：拷 tree ⇒ **只变异副本的 `kernel/reportfeedbackdelivery.js`**：把**所有**裸 `'systemPrompt'` 记号改写成 `'systemPrompt.context'`（**锚点无关**的改写 ⇒ 两态共用同一个 `what`）；★ **落地证明**＝该文件里裸 `'systemPrompt'` 记号数**归零**（实改写 3 处）。
```
CONTROL (copy as-is): exit=0 (green ✓) 8/0            ← "红"来自变异而非拷贝
MUTATION LANDED=✓ (rewrote 3 bare 'systemPrompt' token(s) onto the .context form)
MUTANT: exit=1 (red ✓) === 7 passed, 1 failed ===
  FAIL ★★ PIN 1a: "no service" and "service without .context" report DIFFERENT `what` …
★ 红在 PIN 1a（两态 what 必须不同）上 = YES ✓        REAL TREE UNTOUCHED ✓
```
⇒ ★ **判据有牙且落点在目标上**（唯一 FAIL 就是那条"两态必须不同"的断言）。

## 5. 纪律 / 登记 / 没核

- ★ **纪律 33**：**新测试文件 ⇒ 派生计数会变** ⇒ 若 `--check` 变 STALE **请你 `--write`**（我不自行 `regen-all`、不 git）；★ 本轮**未跑门禁**（若下一轮跑，会先提醒你 `git add`）。
- ★ **写者隔离**：新文件 `tests/b1prime-state-split.test.mjs`（我的族名）；★ **未改** `vibe-math-vmu.js`／`kernel/**`／`package.json`（只在**副本**里变异）。
- **没核**：真机面（本轮只做进程内）；`audit-package-membership` 未独立复跑（R5 已按你的实测解除）。
- **仓内改动**：新测试 ＋ 本报告；**无半截状态**；**未改** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`。
