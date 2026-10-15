# Round 4 · `task-26` 交账（F17 可终止 · F43–F47 收口 · admission 一致性）

**负责人**：`v5r-reader-b`。**判据**：`05-framework-strength-evidence.md` 的 F17 行（:51）与 F43–F47 组（:98–108）。
**纪律**：未跑全量 sweep、未 `regen-all`、未 `git`；临时文件只在 `D:\_tmp`（已删）；内容型批量改写只用 Node。
**开场核对（模型额度中断后）**：`node --check` 两文件 exit 0；`vmu-lean-jobs`/`vmu-mathjobs`/`vmu-mathjobs-persist` 复跑确认中断未留半改（当时 lean 两条红是我自己的半成品所致，见 §A.4“中断恢复”）。

---

## A. F17 子进程**真的可终止** —— **不是宿主能力缺口，是 vmu 的接缝形状缺口**（已落地 ✓）

### A.1 先查运行时（不猜）
Host Inspect `Service.listService{service:'subprocess'}` 的**原文契约**：

- `spawn(spec): SubprocessHandle` —— **同步返回活句柄**（不是 promise）；
- `SubprocessHandle` 含 **`terminate()`**、`waitForExit(signal?)`、`done: Promise<SubprocessOutcome>`、`collected.{stdout,stderr}`（`readFrom(fromByte)` **非消耗式**、截断时给 `lossy` ＋ `spillPath`）；
- `SubprocessSpawnSpec` 含 `argv/cwd/stdio/graceMs/signal?/env?`；输出用 `SubprocessCollect{maxBytes}`。

⇒ **宿主本来就给 handle**，`graceMs` 也只是"请求"。evidence 里"无 handle ⇒ 无法 terminate"说的是**我们把它当 promise 用**这件事。

### A.2 唯一原语（新增，三面共用）
`kernel/mathjobs.js` 导出 **`createChildBudget({ timer, onNote })`**（`mathjobs.js:117`），返回
`runWithBudget({ call, timeoutMs, label })`，**自动识别三种形状**：

| 形状 | 行为 |
|---|---|
| ① 宿主原生 handle（`spawn` 同步返回、有 `done`） | 用它的 `done` 与 `collected.*.readFrom(0)`；到点调用 **`terminate()`** ⇒ `terminated:true`（事实） |
| ② 显式 `spawnHandle(spec, onHandle)` | 同上（seam 必须同步 `onHandle(h)`） |
| ③ 旧 promise 接缝 | 预算照样到点 ⇒ **绝不挂死**，但诚实返回 `terminated:false`/`hadHandle:false` |

- **`graceMs`**：作为**请求**随 spec 传给宿主（`graceMs === timeoutMs`），约束力来自本地预算。
- **本地预算**：`timer` seam（`(cb,ms)=>disposer`）可注入；**默认返回真 disposer**（见 §A.4 的 F15 修复）。
- **返回**：`{ result, timedOut, terminated, hadHandle, cleanupFailed }`。

**接线（四个面）**：
- `kernel/lean.js`：`runOne` 走预算；`commandFor` 结果加 `graceMs`；作业/镜像新增 `terminated`/`hadHandle`/`outputDroppedBytes`/`outputLossy`/`outputSpill`；timeout 回执文案分"已 terminate / 无法 terminate"。
- `kernel/mathjobs.js`：`execute` 走预算；`receipt.terminated/hadHandle/hostLossy/spillPath`；超时码文案同口径。
- `kernel/mathadapters.js`：`runChild` 走预算；`status().subprocess` 如实回显。
- `kernel/script-bridge.js`：原先**无条件**说 "was terminated"（**谎**）⇒ 现在只有真终止才这么说，否则具名"could NOT be terminated"，错误上带 `terminated`/`hadHandle`，`stats` 新增 `terminated`/`notTerminated`。

### A.3 `maxBytes`（同轮核 ✓）
- `kernel/lean.js` 新增读取 **`vmu.math.captureStdoutBytes`**（与计算面**同一个键**，默认 65536；0/缺省 ⇒ 常量 `LEAN_OUTPUT_MAX_BYTES = 64*1024`）；本地截断用 **`tailBytes()`** 且**计数**（`receipt.stdoutDroppedBytes`/`stderrDroppedBytes`）。
- 宿主自己的截断报告**原样带进回执**：`hostLossy` ＋ **`spillPath`**（`SubprocessOutputReader` 的 `lossy`/`spillPath`）——这同时是"大结果可达引用"目前能拿到的那一半。
- **这是 `tests/vmu-kernel.test.mjs` 12→13 的唯一原因**（新读者＝`vmu.math.captureStdoutBytes`，理由：一个含义一个旋钮；该测试归 vmu-verify，我未改动）。`LEAN_KEYS` 由 12 → 13，`keysUsed()` 与实现一致（测试按 `LEAN_KEYS.length` 派生）。

### A.4 同族的 F15（peer 报的两条，都在我名下）
1. **`createChildBudget` 默认 seam 返回 `Timeout` 而非 disposer**（peer 读数：armed +1、注入真 disposer 则不变）⇒ **已修**：默认 seam 返回 `() => clearTimeout(h)`；注入 seam 若返回平台 `Timeout` 对象则**显式 `clearTimeout`**；**清理失败具名上报**（`cleanupFailed` ＋ `onNote('timer-cleanup-failed', …)`），不再被 `catch` 吞掉。
   我的实测（`process.getActiveResourcesInfo()` 计 `Timeout`）：默认 seam `before=0 → after=0`（delta 0）、`cleanupFailed=null`；注入 disposer 同样 delta 0。
2. **`math-computation.js` 两处无句柄 sleep**（`:616` 与 `:727`：版本探测/包预检的**退避重试**，≤3 次、250/650ms、合计 ≈1.8 s/引擎，不持锁不持进程）⇒ **具名豁免**（不是漏改）：共享模块的宿主契约**没有 timer seam**，且它是**四份逐字节相同副本**之一（D-10）⇒ 加 seam 属跨预设接口变更、超出本面写范围；要加就下一轮与 4 份副本一起改。已写进 `docs/09 §4.3`。
3. ⚠️ **`tests/vmu-activity-timers.test.mjs` 仍有 2 条红，且都在其 owner 的**清单/断言**里**（我未改该文件）：
   - §1 `site count matches for kernel/mathjobs.js`：它声明 `{timers:1, clears:0, verdict:'NAMED-FINDING-disposer-shape'}`，**实测现在是 `{timers:1, clears:2}`** ⇒ 需要把 verdict 改成"cleanup-on-every-branch"（修复已落地，声明是旧的）。
   - §5 `★ F15 FINDING (mathjobs.js:118/170)`：该断言当前是"证明 bug 存在"（期望 armed 增加），套件自己的提示就是 *flip to `after === before` when the default returns a real disposer*；实测已是 `before=0, after=0`。
   ⇒ 请转给 **vmu-activity**：我这边**行为已修**，它那边只需翻声明与断言（我已给出读数）。

### A.5 验收证据
`tests/vmu-lean-killable.test.mjs`（新增，7/0）：宿主 handle 形状被使用／到点**真的 terminate**／promise 接缝**不挂死且具名**／`graceMs` 传递／输出计数截断＋host lossy·spill／F44 公告／F45 去重（详见 §B）。
`tests/vmu-script-bridge.test.mjs` 34/0（旧 promise 接缝的路径逐字保留）。

---

## B. F43–F47 两条"部分"逐条判定

| 条目 | v1 判定 | 本轮判定 | 依据（file:line / 证据） |
|---|---|---|---|
| **F43** settle 三元组 | 具备 | **具备（复核）** | `kernel/lean.js` `runOne`：`passed = exitCode===0 && hashUnchanged===true`；镜像 `contextHash` 参与恢复采纳；`settled` 是状态、`passed` 是结论 |
| **F44** 一键公告＋长期查询 | 部分 | **具备（本面）** | 新增 `pushNotice/takeNoticesFor/noticesView`（`kernel/lean.js`）：结算即 push 一条，`takeNoticesFor(member)` **取一次就没了**，上限 `LEAN_NOTICE_MAX=20`、丢弃计数 `droppedNotices`；**长期查询**＝`status(jobId)` ／ `mirrors()` ／磁盘 `Formal/Jobs/<jobId>.json`。**residual（具名 closed-by）**：把公告**注入下一次提示词**属转回合管线（core `kernel/turn/**`），本面只提供可取的队列 |
| **F45** 去重与 settle 同源 | 部分 | **具备（形式化面）＋具名差异（计算面）** | `dedupeKey = sha256(内容哈希|构建上下文)`，与 settle 复核的 `hashUnchanged`/`contextHash` **同一函数**产出；同 key 且已有 `passed` ⇒ 新作业 `deduped:true`＋`dedupedOf` 落定、**不重编译**；改内容/改上下文即重跑（测试逐条证）。计算面**故意不去重**（每次运行要有自己的回执）＝具名差异 |
| **F46** 外部工具解析顺序可观测 | 具备 | **具备（复核，无改动）** | `kernel/mathadapters.js`：`PY_CANDIDATES=['python3','python','py']` 顺序显式；解析全靠注入 `resolveExecutable`（不猜） |
| **F47** 能力探测＋两步安装＋审计 | 具备 | **具备（复核，无改动）** | 共享模块 `op:'probe'` ⇒ `op:'run'`；`mathadapters.plan()` 给安装命令与 `next`；设置键可被审计发现 |

---

## C. `admission()` 与实现的一致性（新增实测 ✓）

新增 `tests/vmu-subprocess-admission.test.mjs`（5/0）逐条对齐：

| 场景 | 断言 |
|---|---|
| 无任何可选接缝 | `exclusiveCreate:false`／`crossProcess:'not-enforced'`／`canTerminateChild:false`／`subprocess.lastSpawnHadHandle:null`（**没跑过就是 null，不是 false**——不许猜） |
| 注入 `writeTextExclusive` | `exclusiveCreate:true` **且** `crossProcess:'enforced-by-exclusive-create'`（两字段必须同时翻，不许半翻） |
| 注入 `spawnHandle`（声明式） | 未跑过也能说 `canTerminateChild:true`（`declaredKillableSeam:true`） |
| 宿主原生 handle | 跑**之前** `false`；跑过之后 `lastSpawnHadHandle:true` ⇒ `canTerminateChild:true`（**承诺跟着事实翻**） |
| 行为反证 | handle 接缝 ⇒ 真的 `terminate()`；promise 接缝 ⇒ 结算为 timeout、`terminated:false`、`canTerminateChild:false` |

---

## D. 文档同步 ✓
- `docs/09` 新增 **§4.3 子进程真的可终止（F17）**：宿主契约原文要点、`createChildBudget` 三形状、`graceMs`、`maxBytes`（`vmu.math.captureStdoutBytes`＋`tailBytes`＋host `lossy`/`spillPath`）、`admission().subprocess` 字段、F44/F45、**F15 定时器可清理**、**共享模块两处 sleep 的具名豁免**；§4 的"持久化"条目改为指向 §4.3。
- `docs/15` §14.4：删除"Lean 子进程无法 terminate ⛔"，改为"子进程真的可终止 ✓（F17）"段（含 `createChildBudget`、输出上限、admission 回显），并把"大结果引用"的 ⛔ 措辞收紧为"宿主 `lossy`/`spillPath` 只覆盖一半"。

---

## E. 原样命令 + 退出码

```
node tests/vmu-lean-killable.test.mjs          → === VMU LEAN KILLABLE: 7 passed, 0 failed ===          EXIT=0
node tests/vmu-subprocess-admission.test.mjs   → === VMU SUBPROCESS ADMISSION: 5 passed, 0 failed ===   EXIT=0
node tests/vmu-lean.test.mjs                   → ALL GREEN  (passed=13, failed=0)                       EXIT=0
node tests/vmu-lean-jobs.test.mjs              → === VMU LEAN JOBS: 13 passed, 0 failed ===             EXIT=0
node tests/vmu-mathjobs.test.mjs               → === VMU MATHJOBS: 10 passed, 0 failed ===              EXIT=0
node tests/vmu-mathjobs-persist.test.mjs       → === VMU MATHJOBS PERSIST: 17 passed, 0 failed ===      EXIT=0
node tests/vmu-mathjobs-exclusive.test.mjs     → === VMU MATHJOBS EXCLUSIVE: 5 passed, 0 failed ===      EXIT=0
node tests/vmu-math-adapters.test.mjs          → === VMU MATH ADAPTERS: 20 passed, 0 failed ===         EXIT=0
node tests/vmu-script-bridge.test.mjs          → === VMU SCRIPT BRIDGE: 34 passed, 0 failed ===         EXIT=0
node tests/vmu-fidelity-abstention.test.mjs    → === VMU FIDELITY ABSTENTION: 8 passed, 0 failed ===    EXIT=0
node tests/audit-enforced-consistency.test.mjs → === VMU ENFORCED CONSISTENCY: 355 passed, 0 failed === EXIT=0
node tests/audit-declaration-criterion.test.mjs→ RULE E fingerprints 67=67（我文件零新增）             EXIT=1（余红为他人项，见 §F）
node tests/vmu-activity-timers.test.mjs        → 36 passed, 2 failed（两条均需 owner 翻声明/断言）      EXIT=1
node scripts/check-docs.mjs                    → vmu doc-lint: docs=29 issues=0 / DOC LINT: PASS       EXIT=0
node scripts/generate-kernel-index.mjs         → kernel-index: docs/02 is STALE（**报告模式，未写**）      EXIT=1
```

---

## F. 未做项 / 需他人接手（具名）

| # | 项 | 状态与去处 |
|---|---|---|
| 1 | `tests/vmu-activity-timers.test.mjs` 的 2 条红 | **归 vmu-activity**：我的行为已修（默认 seam 真 disposer、失败具名上报），它那边 §1 声明 `clears:0 → 2`／verdict 改 `cleanup-on-every-branch`，§5 断言按其自身提示 `flip to after === before`（读数：`before=0, after=0`）。 |
| 2 | `audit-module-coverage` 的 `lean(3)` / `mathjobs(1)` | **生成物漂移，不是文档缺口**：`docs/02-architecture.md` 的内核索引是 `scripts/generate-kernel-index.mjs` **生成块**（`<!-- BEGIN GENERATED: kernel-index -->`），报告模式现在就说 `docs/02 is STALE`（exit 1）。四个新导出（`LEAN_NOTICE_MAX`/`LEAN_OUTPUT_MAX_BYTES`/`tailBytes`/`createChildBudget`）**已在我写的卷里逐一点名**（`docs/09 §4.3`，`createChildBudget` 另在 `docs/15 §14.4`）；`docs/02` 的那一块**必须由 Lead 的 `regen-all`（或单跑该生成器）刷新**——按纪律我**未**改生成块、也**未**跑 `regen-all`。（同一门新出现的 `bus (3 unnamed)` 不是我的模块。） |
| 3 | `tests/vmu-kernel.test.mjs` 期望 12、实际 13 | **归 vmu-verify**：新增读者＝`vmu.math.captureStdoutBytes`（F17 的 per-stream 输出上限，与计算面同一个键）。我未改该测试。 |
| 4 | `audit-declaration-criterion` 余红 | 复核：RULE E 指纹 **67=67、我名下文件零新增**；余红为 `paper.js`/`regen-all --check` 等他人项（本报告不代为处理）。 |
| 5 | 公告注入下一次提示词（F44 的 residual） | **closed-by**：core 的转回合管线消费 `takeNoticesFor(member)`；本面不实现提示词注入（不越界）。 |
| 6 | 计算面内容去重 | **有意不做**（每次运行需要自己的回执）；已写进 `docs/09 §4.3` 作为与 Lean 面的**具名差异**。 |
| 7 | 共享模块两处 sleep 的可取消化 | **具名豁免**（D-10：四份逐字节副本；代价上界 ≈1.8 s、无资源泄漏）。要做得与 4 份副本一起改。 |
| 8 | 大结果内容寻址引用（F19） | 仍 ⛔（Round 3 已具名）；本轮只把宿主 `lossy`/`spillPath` 带进回执，覆盖"宿主截断且有 spill"这一半。 |

---

## G. 追加（Lead 指令）：并发上限收敛到**规范名** ✓

**改动**：`kernel/mathtools.js` 的四处读点从旧名 `vmu.math.jobs.maxParallel` 改为**规范名 `vmu.math.maxParallel`**：
`WIRED_KEYS`（:56 一带）、`DEFAULTS`（:124 一带）、`cfg().maxParallel`（:202）、`keysSnapshot()`（:306）、强制点
`evalKey(...)` ＋ `capRefusal(..., key, ...)`（:572-574）。语义不变：仍是**策略层 active-runs 上限**，超限仍
`VMU_RESOURCE_BUDGET`，`enforced[]` 现在列规范名。

**因此**：`vmu.math.maxParallel` 现在有**两个读者**（`kernel/mathjobs.js` 的作业服务 ＋ `kernel/mathtools.js` 的策略层），
旧名 `vmu.math.jobs.maxParallel` 只剩"兼容旧名"作用——值由**内核在设置边界镜像**（`vibe-math-vmu.js:290-303` 的
`alias-of:` 记账，双向：谁被声明就镜像给另一个）。要限并发只需设规范名。

**测试同步（必须改，否则断言测的是旧名）**：`tests/vmu-mathtools.test.mjs` 的 4 处场景/断言改读规范名
（:65/:68 的 cap 1 与 cap 3、:370 的 `enforced.includes`、:425 的"always-evaluated"存在性），标签从
`jobs.maxParallel` 改 `maxParallel` 并注明"旧名由内核镜像"。**文档**：`docs/15 §14.4` 新增"并发上限只有一个名字（Round 4 收敛 ✓）"。

```
node tests/vmu-mathtools.test.mjs              → === VMU MATHTOOLS: 208 passed, 0 failed ===       EXIT=0
node tests/vmu-mathtools-tool.test.mjs         → === MATHTools TOOL: 14 passed, 0 failed ===       EXIT=0
node tests/vmu-mathjobs.test.mjs               → === VMU MATHJOBS: 10 passed, 0 failed ===         EXIT=0
node tests/vmu-ten-faces-tunable.test.mjs      → === TEN FACES TUNABLE: 16 passed, 0 failed ===    EXIT=0
node tests/audit-enforced-consistency.test.mjs → === VMU ENFORCED CONSISTENCY: 355 passed, 0 failed === EXIT=0
node tests/vmu-settings.test.mjs               → 46 passed, 1 failed（红＝`vmu.ballot.openMaxMs`，非我） EXIT=1
node tests/vmu-planned-settings.test.mjs       → RED 32/7（`settings/planned.js` STALE ＋ `vmu.meetings.stepMaxMs`/`vmu.ballot.openMaxMs`，非我） EXIT=1
```
（仓内**没有** `vmu-plain-settings` 套件，故未跑；最近似的 settings 面就是上面两条。）
