# Round 8 · `task-63` 交账（目标 5 端到端演练）

**负责人**：`v5r-reader-b`。**主交付**：`_handoff/vmu/13-goal5-e2e.md`（剧本＋逐步读数＋证明了什么/没证明什么）。
**红线**：`math-computation.js`／`math-engines.js` **一字未动**。未跑全量 sweep、未 `regen-all`、未 git；临时文件只在 `D:\_tmp`（演练脚本已删）；内容型批量改写只用 Node。

---

## 0. 一句话
**端到端跑通了，并且在跑通过程中抓出、修掉两个真缺陷**：① `cancel()` 会被"临死的子进程"的 close 事件**改写成 `settled`/`failed`**（取消不是终态）；② 被信号杀掉的子进程因 `Number(null) === 0` 被记成 **`settled / exit 0`**。两者都不是脚本问题，是生产语义缺陷——Round 6 的取消测试看不见它们，因为那套测试用的假句柄 `done` **永不结算**，执行路径根本不会继续。

## 1. 演练结果（`node D:\_tmp\r8-e2e.mjs` ⇒ **ALL ASSERTIONS PASSED (spawns=20, mirrors=13)** EXIT=0）

| 阶段 | 读数（四库一致） |
|---|---|
| **B** 四库真机长任务 | `live kind/elementKind` ≡ `durable envelope kind/elementKind`：numpy `array/numeric`、scipy `array/numeric`、pandas `frame`、sympy `array/symbolic`；作业 `exit=0` |
| **A1** 异步长作业 → `cancel` 中途取消 | `terminated=true`、**子进程确已死亡**、镜像 `cancelled`；新实例 `kept/cancelled`、**0 重跑** |
| **A2** **杀掉内核进程**（独立 worker 进程被 SIGKILL）→ 新实例恢复 | 镜像仍 `running(attempts=1)` → `interrupted-then-requeued` → **真的重跑到 `settled`**（`attempts=2`、`spawns+1`）；`kind/elementKind` 不变 |
| **A3** 同一批镜像给全新实例 | **采纳 8**（4 一次跑完 + 4 续算完成）、`requeued=0`、`interrupted=0`、**0 spawn**、第二轴一致 |
| **A4** 两实例竞同一 `jobId` | 一赢一 `VMU_MATH_JOB_ID_TAKEN`；不覆盖赢家镜像 |

**状态**：镜像 13 个 ⇒ `cancelled:5`／`settled:8`；状态全集实测＝计算面七态、Lean 面六态（与文档一致）。

## 2. 两个缺陷的修法（都带回归测试）
1. **取消粘住**：`kernel/mathjobs.js` 的 `executeInner` 在预算返回后先判 `job.cancelled === true || job.state === 'cancelled'` ⇒ 保持 `cancelled`、回执 `VMU_JOB_CANCELLED`、落镜像后直接返回；`kernel/lean.js` 的 `runOne` 同形（`interrupted`＋`reason:'cancelled'` 粘住、`passed=false`）。
2. **信号死亡 ≠ exit 0**：区分"没有退出码"与"退出 0"——前者记 `failed`、具名拒 `VMU_MATH_HARNESS_FAILED`（消息带 `signal=SIGKILL`）、回执 `exitCode:null` **并新增 `signal` 字段**。

回归测试（`tests/vmu-job-cancel.test.mjs` **9/0**）：新增"cancel is STICKY（真 kill 语义）"与"no exit code ⇒ failed, never settled/exit-0"。

> 一次自我修正过程值得记录：我第一版"粘住"守卫用了 `r.stdout`，而 `const r = out || {}` 在同块更后面 ⇒ **TDZ ReferenceError** 被 `catch` 吞成 `failed`（磁盘从 `settled` 变成 `failed`，看起来像"守卫没生效"）。改成 `out && out.stdout` 后实测通过——**症状（failed）不等于根因（守卫取 TDZ 变量）**，这正是端到端比单测更难、也更值钱的地方。

## 3. 文档/实现同步
- `docs/09 §4.3`：新增"取消是终态（R8 端到端抓出的缺陷①）"与"被信号杀掉的子进程不算 settled（缺陷②）"两条。
- `docs/15 §14.4`：同两条写实（含 `signal` 字段与 `VMU_MATH_HARNESS_FAILED`）。

## 4. 原样命令 ＋ 退出码（全绿）
```
node D:\_tmp\r8-e2e.mjs                        → ALL ASSERTIONS PASSED (spawns=20, mirrors=13)  EXIT=0
node tests/vmu-job-cancel.test.mjs             → === VMU JOB CANCEL: 9 passed, 0 failed ===     EXIT=0
node tests/vmu-mathjobs.test.mjs               → 10 passed, 0 failed                            EXIT=0
node tests/vmu-mathjobs-persist.test.mjs       → 17 passed, 0 failed                            EXIT=0
node tests/vmu-mathjobs-exclusive.test.mjs     → 5 passed, 0 failed                             EXIT=0
node tests/vmu-lean.test.mjs                   → ALL GREEN (13, 0)                             EXIT=0
node tests/vmu-lean-jobs.test.mjs              → 13 passed, 0 failed                            EXIT=0
node tests/vmu-lean-killable.test.mjs          → 7 passed, 0 failed                             EXIT=0
node tests/vmu-subprocess-admission.test.mjs   → 5 passed, 0 failed                             EXIT=0
node tests/audit-enforced-consistency.test.mjs → 355 passed, 0 failed                           EXIT=0
node scripts/check-docs.mjs                    → DOC LINT: PASS                                 EXIT=0
```

## 5. 未做项（与 `13-goal5-e2e.md` §3 同一套）
| # | 未证明 | 说明 / closed-by |
|---|---|---|
| 1 | 真正的跨机崩溃 | 本轮 worker 与恢复实例同机同 fs；跨机依赖 fs 语义相同（`wx` 原子性在 NTFS 上成立） |
| 2 | 分支 ①（`queued` 未开始即崩）与 ③（指纹不一致）在端到端里未命中 | 单测覆盖（`vmu-mathjobs-persist` 17/0、`vmu-lean-jobs` 13/0），但没走两个真进程 |
| 3 | **孤儿进程**：worker 被 SIGKILL 时其 python 子进程可能短时成为孤儿 | **宿主边界**：DSH `subprocess` 在服务 dispose 时终止托管进程；服务被 SIGKILL 时 OS 不保证（具名） |
| 4 | Lean 面的"杀内核进程"演练 | 未做（本轮为数学面七态）；Lean 六态有 R2 的真机证据（重启 adopted=1、改文件 ⇒ `file-changed-since-run`） |
| 5 | "续算"＝**重跑整段**，非中间检查点 | 作业粒度就是一次子进程；真正的 checkpoint 需引擎侧支持（未实现、未声称） |
| 6 | 同 jobId 的**后续覆写**仍 last-writer-wins | A4 只证明**占号**（`writeTextExclusive`），不证明全程互斥 |
