# task-32 Round 4 · F15 定时器清理复核 ＋ F16 trampoline ＋ falsify 范式推广（`vmu-activity` 交付报告）

> 判据：`_handoff/vmu/05-framework-strength-evidence.md` §2（F15/F16 两行；该文件归 `vmu-verify`，我**不改**）。
> 工作目录 `D:\wd\vibemath开发`；仓库 `Vibe-Mathematics`（Round 3 已由 Lead 提交，本轮工作区改动：`kernel/scheduler.js` ＋ 3 个新测试文件）。
> 纪律：未跑全量 sweep、未 `regen-all`、未 git；临时文件 `D:\_tmp`（scratch 已删）；内容型改写只用 Node。

---

## 1. 交付物

| # | 交付物 | 位置 |
|---|---|---|
| A/B | **F15＋F16 加固** | `Vibe-Mathematics/vibe-math-vmu/kernel/scheduler.js` —— 定时器分支释放 `:491-515`（`onFire`）、状态读数 `:135-136,570`、trampoline `:138,248`（`tickPass`）、守卫与延迟回执 `:400-410`、聚合与多趟 `:411-440` |
| A/B | F15/F16 探针 | `tests/vmu-activity-timers.test.mjs`（**36/0**，5 节：全仓定时器清单／调度器释放／trampoline／bus 预算／两条已修复项的回归守卫 ＋ 一条仍开放项） |
| C | **falsify 最小范式** | `tests/_lib/falsify.mjs`（可复用库）＋ 可跑示例 `tests/vmu-activity-falsify-lib.test.mjs`（**17/0**：范式自证 8 条 ＋ 复现 Round 3 ＋ 证明 Round 4 三处修复"拆掉就红"） |
| D | 结论（发给 vmu-verify） | 见 §6；F15/F16 行的建议文本原样给出 |
| — | 本报告 | `_handoff/vmu/activity-round4-report.md` |

---

## 2. A · F15：全仓定时器逐点判定

**扫描口径（可复核）**：对 `vibe-math-vmu/**/*.js` 用仓库自带的 `tests/_lib/strip-comments.mjs`（`{strings:true}`）**只扫代码**，再用 `(?<![\w$.])setTimeout\s*\(` 只认**全局**定时器（`timer.setTimeout(...)` 是 seam 分发，不是定时器站点）。清单由测试 `vmu-activity-timers.test.mjs §1` **推导**：任何新出现的定时器站点若不在分类表里 ⇒ 红；表里声明的站点数若与实测不符 ⇒ 红。

| 文件 | 站点 | 判定 | 证据 |
|---|---|---|---|
| `kernel/bus.js` | `setTimeout` 1／`clearTimeout` 1 | **✅ 每分支都清** | `bus.js:382-384` 的 `finally { clearTimeout(timer) }`；探针 §4 用 `process.getActiveResourcesInfo()` 实测：**成功分支**（快钩子）与**超时分支**（永不返回的钩子）后 armed Timeout 数都**不变** |
| `kernel/activity.js` | `setTimeout` 1／`clearTimeout` 1 | **✅ 每分支都清** | 平台回退经唯一 `cleanup()`；成功/超时/abort/arming 失败/同步触发五条路都过它（`tests/vmu-activity-kernel.test.mjs` §1/§2/§5/§7；falsify 里"关掉 disposer ⇒ 红"） |
| `kernel/scheduler.js` | 全局 0（只有 seam） | **✅（本轮修好）** | 见 §3：**fire 分支原先不释放**，现已修 |
| `kernel/mathjobs.js` | `setTimeout` 1／`clearTimeout` 2 | **✅ 已由主人修复**（Round 4，reader-b） | 原缺陷：`mathjobs.js:118` 默认 seam 返回 **Timeout 对象而非 disposer**，`:170` 的 `timerDisposer()` 抛错被 `catch { already settled }` 吞掉 ⇒ 默认部署从不清理（我实测结算后 armed Timeout +1）。**现修**：默认 seam 返回 `() => clearTimeout(h)`（`:125-126`）＋ `disposeTimer` 也能清裸 Timeout（`:132-133`）＋ `cleanupFailed`/`timer-cleanup-failed` 具名上报。**探针已翻面**为回归守卫（成功分支 `after === before`；超时分支仍**真的开火** ⇒ 非空转） |
| `host-spawn.js` | `setTimeout` 2／`clearTimeout` 1 | **✅ 已由主人修复**（Round 4，reader-b） | 原缺陷：预算 `delay` 在进程先结算时从不取消（我实测 +1）。**现修**：默认 delay 走自带句柄的定时器并 `unref()`（`:49,191`），结算路径在 `finally` 里 `clearTimeout`，清不掉时具名上报 `VMU_SPAWN_TIMER_CLEANUP`（`:216-224`）。**探针已翻面**为回归守卫（成功分支 `after === before`；`done` 永不结算时仍**真的超时** ⇒ 非空转） |
| `math-computation.js` | `setTimeout` 2／`clearTimeout` 0 | **✗ 具名（仍开放，不在我写范围）** | `:617,728` 是 `await new Promise((resolve) => setTimeout(resolve, 250 + i*400))`：**句柄没有绑定**，任何 abort/取消路径都无法释放（最长 ~数秒的假引擎延迟） |
| 全仓 `setInterval` | **0** | ✅ | 最难清理的那一类在框架里**不存在**（断言为 0） |

**F15 结论**：6 个文件、8 个站点全部判定完毕；**1 处我修好**（scheduler 的 fire 分支）、**2 处由主人修好并被我的回归探针接管**（mathjobs／host-spawn）、**1 处仍具名开放**（math-computation，附修法）、**2 处本就正确**（bus/activity 有探针）、**0 处 setInterval**。
> **Round 4 收尾更新**（Lead 指出的两条小项）：① `mathjobs`／`host-spawn` 的声明与 verdict 已随主人修复更新（`disposer-default-FIXED` / `budget-FIXED`），§5 的两条断言按其自身提示**翻面**为回归守卫并各加一条"超时分支仍真的开火"的非空转断言；② RULE E 指纹 `A:for:known`（per-row `ok()` 空转）已消除：改成**累计 mismatches ＋ 表非空**的单条断言；`audit-declaration-criterion` 复跑 RULE E `current=67 baseline=67`，**我的文件已不在 hits 列表**。套件读数 36/0。

### 2.1 具名的集成缺口（F15 的"卸载"路径没有对象）
**全仓没有任何生产调用者 `scheduler.arm()/tick()/disarm()`**（推导扫描：除 `kernel/scheduler.js` 自身外零命中；`tools/control.js` 的 9 个动作里没有 scheduler 动作）。⇒ 定时器纪律与 trampoline **是真的、但没有任何生产驱动**：目前只有 `tests/vmu-scheduler.test.mjs` 与本套件在推进它。这不是"假能力"（API 真在、真能跑），而是**未接线的能力**，已按纪律具名登记（`vmu-activity-timers.test.mjs §5(c)` 有断言）。

---

## 3. B · F16：trampoline 复核（复核后**加固**）

### 3.1 复核发现（改之前，实测）
`tick()` 之前**没有任何重入守卫**。真实触发形状：某个 hook handler 在 `fire()` 内部**同步**回调 `tick()`（`bus.emit` 是 async 所以真总线不会这样，但 seam/同步 stub/宿主回调都可能）。此时：
- 外层 pass 尚未推进条目（`it.runs`/`it.atMs`/`state` 都在 `fire` **返回之后**才写，`:325-355`），内层 tick 于是看到**同一个仍 pending 的条目** ⇒ **重复触发**；一次性的还会被内层判 `completed`、外层再判一次；
- 实测（把守卫拆掉的变异体）：嵌套调用**递归到栈溢出**（探针捕获 `RangeError`），即"防重入"当时**只是"没有调用者"的巧合**，不是机制。

### 3.2 加固（`kernel/scheduler.js`）
1. **`tickPass(when)`**（`:248`）：把原 `tick()` 的函数体原样抽成"一趟"，本身**从不自调用**。
2. **`tick()` 变成真 trampoline**（`:396-440`）：`if (ticking) { rerunRequested = true; reentrantDeferred += 1; return <延迟回执> }`；外层 `do { rerunRequested = false; last = tickPass(when) } while (rerunRequested)`。
   - 重入调用**不嵌套、不递归**，返回 `{ deferred:true, passes:0, note:'…DEFERRED to the next pass…' }`；
   - 错过的触发**由下一趟补上**（同一个 `when`，确定性）；
   - 一趟内的**多个**重入请求折叠成**一趟额外 pass**（布尔标志，不是队列）⇒ 工作有界；
   - 每份回执与 `status()` 都报 `passes` / `reentrantDeferred` / `tickPasses`（"never silent"）。
3. 单趟回执形状**保持不变**（聚合 1 趟 = 原值）：`fired/reported/dropped/skipped/firedCount/.../note` 一字不改；`tests/vmu-scheduler.test.mjs` **111/0** 仍绿。

### 3.3 证据（实测读数）
| 场景 | 读数 |
|---|---|
| 同步 hook handler 内调用一次 `tick()` | `passes=2, reentrantDeferred=1, firedCount=1, runs=1`（不递归、不双触发、下一趟服务了它） |
| 一趟内调用 **3** 次 | `passes=2, reentrantDeferred=3, firedCount=1`（折叠成一趟，全部计数） |
| 普通 tick（无人重入） | `passes=1`（不额外跑趟） |
| 拆掉守卫的变异体 | 嵌套调用不再被延迟（探针捕获栈溢出） |
| 拆掉 `rerunRequested = true` 的变异体 | `passes=1` ⇒ **错过的触发不再被下一趟补上** |

---

## 4. A · F15 在 scheduler 的修复（fire 分支原先只"半清"）

**改前**：`arm()` 把回调写成 `() => api.tick(...)`，**fire 分支既不 `clear` 也不从 `handles` 删除**。实测后果两条（都在探针里钉住）：
1. `status().timerHandles` / `items.armed` **永远**把已触发的句柄算作"在役"；
2. `arm()` 只挑 `!handles.has(it.id)` 的条目 ⇒ **周期性条目触发一次后再也不会被重新武装**（`every()` 在 host-timer 下退化成一次性）。

**改后**（`scheduler.js:491-515`）：回调先 `timerClear(handle)` ＋ `handles.delete(it.id)` ＋ `firedByTimer += 1` ＋ 审计行 `schedule/timer-fired`，**再** `api.tick()`；"arming 期间就同步触发"的病态 seam 也计数并跳过（不会留下一个已不存在的 armed 句柄）。`status()` 新增 `timerFired`。
**证据**：fire 后 `timerHandles === 0`、`timerFired === 1`、seam 被要求释放 1 次、周期条目 `runs === 1` 且**能被重新 arm**；cancel/disarm(全部) 两条既有分支仍释放；`tests/vmu-scheduler.test.mjs` 111/0。

---

## 5. C · falsify 范式（`tests/_lib/falsify.mjs`，可复用）

**范式**：把真模块复制到 `D:\_tmp` → 注入一处文本缺陷 → **导入副本** → 用**同一个探针**跑真模块（必须绿）与变异体（必须红）→ 读数不同才算证伪。

**库的五个"不许自欺"守卫**（各自是一等拒绝码，示例测试 §1 逐条自证）：
| 守卫 | 码 | 为什么 |
|---|---|---|
| 变异必须真的落到锚点上（`find` 出现次数必须等于声明值） | `MUTATION-NOT-APPLIED` | 锚点改名后"探针无法变红"会被误读成"门禁失效" |
| 副本必须能导入（先导入再探测） | `MUTANT-UNIMPORTABLE` | 语法错误的副本会以**错误的理由**变红 |
| 真模块必须在该探针上为绿 | `REAL-MODULE-NOT-GREEN` | 否则坏的是探针，不是变异体 |
| 两者读数必须**不同** | `PROBE-DOES-NOT-DISCRIMINATE` | 空转的变异体最像"成功证伪" |
| 副本只能写在 `_tmp` 且必须删除（`finally`＋残留上报） | `UNSAFE-TMP-DIR` / `TEMP-NOT-CLEANED` | 变异体写进仓库会被门禁捡走；临时文件是纪律 |

**API**：`falsify({ name, module, mutations[], probe, expectGreen?, expectRed?, tmpDir?, keepOnFailure? }) → { ok, real, results[], problems[], leftovers[] }`，`formatReport(report)` 直接可塞进 `ok(...)` 的 detail。另有 `selfContainedSource`（相对 import → 绝对 `file://` URL，使副本自洽）、`mutateOnce`、`assertSafeTempRoot`、`writeMutant`。零依赖、导入无副作用；不碰任何他人测试。
**示例测试**（`tests/vmu-activity-falsify-lib.test.mjs`，17/0）三节：① 范式自证 8 条（含"锚点缺失""歧义锚点""仓库内 tmp 被拒""不可导入的变异体""空转变异体"）；② **复现 Round 3** 的 activity future-only 证伪（真模块 `{wokeOnHistory:false}`、变异体 `true`）；③ **证明 Round 4 三处修复可证伪**：拆掉 fire 释放 ⇒ `handlesAfterFire=1` 且 `rearmed=0`；拆掉 trampoline 守卫 ⇒ 嵌套不再被延迟；拆掉 `rerunRequested` ⇒ `passes=1`（错过的触发不再被补）。

---

## 6. D · 给 `vmu-verify` 的 F15/F16 行文本（该文件归它）

已 `send_message` 发出；建议替换为：

- **F15 可注销定时器（每个分支都清理）｜具备（3 处具名未修）｜`kernel/bus.js:382-384`、`kernel/activity.js:120,386-402`、`kernel/scheduler.js:491-515`、`kernel/mathjobs.js:118,155,170`、`host-spawn.js:66,180`、`math-computation.js:617,728`｜推导清单（`tests/vmu-activity-timers.test.mjs §1`，6 文件 8 站点，`setInterval` 0）：bus 的预算定时器在 `finally` 清（成功/超时两分支实测 armed Timeout 不变）；activity 五条路都过唯一 `cleanup()`；**scheduler 的 fire 分支本轮修好**（原先不释放 ⇒ 周期性条目触发一次后无法再 arm，实测）；**3 处具名未修**：`mathjobs.js` 默认 seam 返回 Timeout 而非 disposer（`:170` 的 `timerDisposer()` 抛错被 `catch` 当"已结算"吞掉 ⇒ 默认部署从不清理）、`host-spawn.js:180` 的预算 delay 在进程先结算时从不取消、`math-computation.js:617,728` 两个无句柄 sleep；**集成缺口**：全仓无 `scheduler.arm()/tick()/disarm()` 调用者（工具面无 scheduler 动作）⇒ 定时器路径无生产驱动。**
- **F16 调度 trampoline｜具备（本轮由"等价形态"升级为真 trampoline）｜`kernel/scheduler.js:248,396-440`｜`tickPass` 是唯一一趟；`tick()` 用 `ticking/rerunRequested` 把**重入**变成**下一趟**：实测重入一次 ⇒ `passes=2, deferred=1, fired=1, runs=1`（不递归、不双触发、错过的不丢）；一趟内 3 次重入折叠成 1 趟；普通 tick 仍 `passes=1`；`passes/reentrantDeferred/tickPasses` 由每份回执与 `status()` 上报。改前实测：无守卫时同步重入会**递归到栈溢出**，故"防重入"原先只是"没有调用者"的巧合。**
- **收尾更正（发给 verify 的补正）**：上面 F15 行里 `mathjobs.js` 与 `host-spawn.js` 两条**已被主人（reader-b）在 Round 4 内修好**，最新 file:line 与判据改为：`kernel/mathjobs.js:125-126,132-133`（默认 seam 返回真 disposer ＋ `disposeTimer` 清裸 Timeout；`cleanupFailed` 具名上报）与 `host-spawn.js:49,191,216-224`（默认 delay 自带句柄 ＋ `unref` ＋ `finally` 清理 ＋ `VMU_SPAWN_TIMER_CLEANUP` 具名）；两者在我的套件里已转为**回归守卫**（成功分支零残留 ＋ 超时分支仍真的开火）。**仍开放**：`math-computation.js:617,728`。集成缺口不变（无 `scheduler.arm()/tick()/disarm()` 生产调用者）。

---

## 7. 原样命令与退出码（定向单跑）

```
node tests/vmu-activity-timers.test.mjs      -> === VMU TIMERS F15/F16: 36 passed, 0 failed ===      exit=0  (1.8s；收尾更新后)
node tests/vmu-activity-falsify-lib.test.mjs -> === VMU FALSIFY LIB: 17 passed, 0 failed ===          exit=0
node tests/vmu-scheduler.test.mjs            -> === VMU SCHEDULER: 111 passed, 0 failed ===           exit=0   (既有契约未变)
node tests/vmu-activity-kernel.test.mjs      -> === VMU ACTIVITY: 141 passed, 0 failed ===            exit=0
node tests/vmu-activity-falsify.test.mjs     -> === VMU ACTIVITY FALSIFICATION: 14 passed, 0 failed === exit=0
node tests/vmu-activity-tool.test.mjs        -> === VMU ACTIVITY TOOL: 58 passed, 0 failed ===        exit=0
node tests/audit-enforced-consistency.test.mjs -> 355 passed, 0 failed                                exit=0   (activity 场景由 verify 已补，scheduler 不在 enforced 名单)
node tests/audit-dependency-cycles.test.mjs  -> 5 passed, 0 failed                                    exit=0
node tests/audit-hook-coverage.test.mjs      -> 4 passed, 0 failed                                    exit=0
node tests/audit-vmu-orphan-methods.test.mjs -> 4 passed, 0 failed                                    exit=0
node tests/audit-scope-classification.test.mjs -> 38 passed, 0 failed                                 exit=0
node tests/audit-service-coverage.test.mjs   -> 0 failed                                              exit=0
node tests/audit-doc-api-coverage.test.mjs   -> 0 failed                                              exit=0
```

**两条红，都不属于本任务**（如实报）：
1. `node tests/audit-code-size.test.mjs` ⇒ **exit=1**：`vibe-math-vmu/kernel/meetings.js` 超过 1200 行且不在 `KNOWN` 名单里（`over=4, known=3`）——**他人文件**，请 Lead/meetings 的主人处置（要么拆文件，要么按 docs/02 的既定流程登记）。
2. `node tests/audit-vmu-docs.test.mjs` ⇒ **exit=1**：`docs/04 §11` 的设置表**过期**（schema 1218 键 vs 文档），需 `node scripts/generate-vmu-settings-table.mjs --write` —— **生成物，按纪律由 Lead 的 regen 步骤统一跑**（本轮新增键来自其他任务）。
3. `node tests/audit-module-coverage.test.mjs` ⇒ exit=1：`gaps=["lean (3 unnamed)","mathjobs (1 unnamed)"]` —— 他人的文档小节未插入（**scheduler/activity 都不在列**）。

---

## 8. 未做项（有意）

1. **F15 具名项**：`mathjobs.js` 与 `host-spawn.js` **已由主人（reader-b）修好**，我的套件改为**回归守卫**（成功分支零残留 ＋ 超时分支仍真的开火，防"永远不开火所以不泄漏"的空转）；**仍开放 1 处**：`math-computation.js:617,728` 的两个无句柄 sleep（不在我写范围，修法见 §2）。
2. **scheduler 的自动重武装/自动驱动**：未做。`arm()` 是显式 API（文档已定"tick() 是唯一推进点"）；让 tick 自己 arm 会改变既有契约并可能与宿主 timer 语义冲突。**集成缺口**已具名（§2.1）。
3. **`kernel/lifecycle.js`**：在写范围内但**实测无任何定时器/调度站点**（`setTimeout`/`setInterval`/`timer` 零命中）⇒ 无需改动，已在 §2 的推导扫描里覆盖（它不在 6 个文件里）。
4. **未跑**：全量 sweep、`regen-all`、`git`（Lead 统一）。
5. **临时文件**：`D:\_tmp\vmu-f15f16-scratch.mjs`（我的测量 scratch）**已删**；falsify 库与示例测试的变异体都写在 `D:\_tmp` 并在 `finally` 删除（示例测试里有"残留为 0"的断言）。
