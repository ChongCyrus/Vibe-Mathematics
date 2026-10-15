# Round 6 · `task-45` 交账（目标 5 终判：数学引擎深度）

**负责人**：`v5r-reader-b`。**主交付**：`_handoff/vmu/07-goal5-verdict.md`（总判定＋逐条表＋四库真机读数＋未做项）。
**纪律**：未跑全量 sweep、未 `regen-all`、未 git；临时文件只在 `D:\_tmp`（下方脚本已删）；内容型批量改写只用 Node。

---

## 0. 一句话结论
**"补上了，而且两半都不低于 v5r"**：① 引擎适配＝**共享模块原样复用（与 v5r 同级）＋ 四库专用适配面（v5r 完全没有）**，**四库真机全通**；② 作业持久化/断点续算＝**超过 v5r**（v5r 计算面完全没有持久化；vmu 两面共用镜像＋七态/六态＋恢复四分支＋jobId 级取消＋跨进程独占占号＋去重）。**两处"部分"是接线/语汇层，不是能力缺失**（Lean 面镜像未接线＝core 一行；面层"是我杀的吗"与宿主 graceMs 的实际终止差一层语汇），改判条件已逐条写进判定书 §5。

---

## A. 对照基线（先做的核查）
- 任务给的安装副本 `C:\Users\admin\.dsh\profiles\web\node_modules\dsh-vibe-math\vibe-math-v5r\` 在本机**不存在**（`Test-Path` 假）⇒ 基线取自**仓内 v5r 副本**（与安装副本同源），行号沿用 Round 1 盘点 `03-v5r-full-inventory.md` §5。
- 逐条机制（引擎候选顺序/发现顺序/许可探测/失败码/参数默认/超时/输出上限；镜像/状态/恢复四分支/取消/去重/保留/公告/并发/接线）＝判定书 §1、§2 两张表，每条都有 v5r 行号 ↔ vmu `file:line` ↔ 判定。

## B. 四库真机（硬证据；真实 python 3.12.10 ＋ 真实子进程接缝，无 fake）
```
node D:\_tmp\goal5-smoke.mjs numpy   → EXIT=0
node D:\_tmp\goal5-smoke.mjs scipy   → EXIT=0
node D:\_tmp\goal5-smoke.mjs pandas  → EXIT=0
node D:\_tmp\goal5-smoke.mjs sympy   → EXIT=0
```
| 库 | 版本 | 真实读数（片段） |
|---|---|---|
| numpy | 2.5.3 | `det` ⇒ `scalar -2.0000000000000004`（float64）；`arange(6).reshape(2,3)` ⇒ `array shape[2,3] int64` |
| scipy | 1.18.1 | `optimize.minimize` ⇒ `result`（`success:true`、`x:[1.9999999820005778]`、`jac:[-2.11e-8]`、`hess_inv:[[0.5]]`、`fun:3.24e-16`）；`integrate.quad(exp(-t²),0,∞)` ⇒ `scalar 0.8862269254527579` |
| pandas | 3.0.6 | `DataFrame` ⇒ `frame columns[a,b] rows[[1,3.5],[2,4.5]]`；`Series.describe()` ⇒ `frame` |
| sympy | 1.14.0 | `simplify(sqrt(8))` ⇒ `expr`（`Mul(Integer(2),Pow(Integer(2),Rational(1,2)))`；`latex "2 \sqrt{2}"`）；`solve(x²=4)` ⇒ `array ["-2","2"]` |

每次调用都带回执（`jobId/engine/ms/inputFingerprint/outputFingerprint`、`isRefutation:false`）。**一处诚实说明**：符号列表被归为 `array`（元素字符串化）⇒ `kind` 不能区分"符号解列表"与"数值数组"（判定书 §5 第 4 条给了改判条件）。

## C. 本轮"能补就补"（**全部已落地并有测试**）
1. **`cancel({jobId})` 真取消（两面）**：`createChildBudget` 新增 **per-call `onHandle`**（`kernel/mathjobs.js`）；计算面 `execute` 与 Lean `runOne` 把活句柄挂到作业上 ⇒ 有 handle ⇒ **`terminate()`**（`terminated:true`＋计数），无 handle ⇒ 作业标终态并**具名**"无法 terminate"。
2. **Lean 新增 `cancel`**（v5r 的 Lean 面**没有**取消）：映射为 `interrupted`＋`reason:'cancelled'`（**不新增状态**，保住与 v5r 的状态集一致），落镜像、发一次性公告、恢复扫描**不重排**（不静默复活）。
3. **`dispose()` 升级**：能杀就杀并**计数 `killed`**（旧实现无条件写 `killed:0`）；`canTerminateChild` 由"声明 seam 或运行时见过句柄"决定。
4. **`queued` 也能取消**，且被取消的排队作业**一次都不会被 spawn**（`executeInner` 前置状态守卫）。
5. **`submit({async:true})`**：入队即返回（默认仍阻塞，旧行为不变）⇒ 运行中作业可见/可取消（取消在生产路径可达的前提）。
6. **并发上限精确化（真实缺陷）**：`running() > maxParallel` → **`>=`**（旧式在上限 1 时**会同时跑 2 个**，测试用峰值并发实测），并把 `await Promise.resolve()` 自旋改为真等待（`slotWaiters`）。
7. **输出上限默认对齐**：`captureStdoutBytes` 本地缺席值 20000 → **65536**（＝schema `def` ＝ Lean 常量）。

## D. 文档同步
- `docs/15 §14.4`：新增"jobId 级取消是真取消（R6）"与"`submit({async:true})` ＋ 并发上限精确（R6）"两条。
- `docs/09 §4.3`：新增"jobId 级取消（R6 ✓；v5r 无取消）"（含状态映射、落镜像、dispose 计数、复用码）。

## E. 原样命令 ＋ 退出码

```
node tests/vmu-job-cancel.test.mjs            → === VMU JOB CANCEL: 7 passed, 0 failed ===              EXIT=0
node tests/vmu-mathjobs.test.mjs              → === VMU MATHJOBS: 10 passed, 0 failed ===              EXIT=0
node tests/vmu-mathjobs-persist.test.mjs      → === VMU MATHJOBS PERSIST: 17 passed, 0 failed ===      EXIT=0
node tests/vmu-mathjobs-exclusive.test.mjs    → === VMU MATHJOBS EXCLUSIVE: 5 passed, 0 failed ===      EXIT=0
node tests/vmu-lean.test.mjs                  → ALL GREEN (passed=13, failed=0)                         EXIT=0
node tests/vmu-lean-jobs.test.mjs             → === VMU LEAN JOBS: 13 passed, 0 failed ===              EXIT=0
node tests/vmu-lean-killable.test.mjs         → === VMU LEAN KILLABLE: 7 passed, 0 failed ===           EXIT=0
node tests/vmu-subprocess-admission.test.mjs  → === VMU SUBPROCESS ADMISSION: 5 passed, 0 failed ===    EXIT=0
node tests/vmu-mathtools.test.mjs             → === VMU MATHTOOLS: 208 passed, 0 failed ===             EXIT=0
node tests/vmu-mathtools-tool.test.mjs        → === MATHTools TOOL: 14 passed, 0 failed ===             EXIT=0
node tests/audit-vmu-orphan-methods.test.mjs  → === VMU ORPHAN-METHOD AUDIT: 4 passed, 0 failed ===     EXIT=0
node tests/audit-enforced-consistency.test.mjs→ === VMU ENFORCED CONSISTENCY: 355 passed, 0 failed ===  EXIT=0
node D:\_tmp\goal5-smoke.mjs numpy|scipy|pandas|sympy → 均 EXIT=0（§B）
```

## F. 未做项（与判定书 §5 同一套；具名＋改判条件）
| # | 项 | closed-by / 改判条件 |
|---|---|---|
| 1 | **Lean 面镜像未接线**（`kernel/index.js:567` 未传 `fs`）⇒ 生产路径 `admission().fileMirror=false` | core 一行：`createLeanFace({…, fs: host, ids, timer})`；接线后 `vmu-lean-jobs` 的跨实例采纳即成端到端证据 |
| 2 | F17 终止在生产路径差一层语汇（kernel 的 `spawn` 来自 `host-spawn.js`：promise 形状 ＋ `graceMs` 交宿主 ⇒ **进程会被杀**，但面层 `terminated:false`） | 把宿主原生 `spawn`／`spawnHandle` 传给 `index.js:567/698/713` ⇒ 面层 `terminated:true`、`cancel` 立即生效 |
| 3 | 大结果内容寻址引用（`Math/Results/<sha256>`） | 需先定截断阈值/保留策略/跨机可达性（pack 层） |
| 4 | 符号列表 vs 数值数组的 `kind` 区分 | 加 `kind:'exprList'` 或 `elementKind`（接口变更，需与 verify 语义对照同改） |
| 5 | 共享模块两处退避 sleep 的可取消接缝 | 已具名豁免 `docs/11 §11.ap`；四份副本一起加 seam ＋ 快照刷新（下一轮协调项） |
| 6 | 计算面内容去重 | **有意不做**（每次运行需自己的回执） |
| 7 | 公告注入下一次提示词 | core 转回合管线消费 `takeNoticesFor(member)` |
