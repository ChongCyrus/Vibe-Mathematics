# Round 10 · `task-79` 交账（一次真实小型数学研究的端到端剧本）

**负责人**：`v5r-reader-b`。**主交付**：`_handoff/vmu/14-math-research-e2e.md`（剧本＋逐步读数＋证明了什么/没证明什么）。
**红线**：`math-computation.js`／`math-engines.js` **一字未动**；未跑全量 sweep、未 `regen-all`、未 git；临时文件只在 `D:\_tmp`（脚本已删）；**没有把"没走的面"写成已走**。

---

## 0. 一句话
**18/18 步走通**（`node D:\_tmp\r10-research.mjs` ⇒ `=== R10 DONE: 18/18 steps walked (spawns=5) ===` **EXIT=0**）：从**任务与依赖**到**三引擎真机计算**、**Lean 机器检查的实例**、**一般命题的具名拒**、**成果归档（幂等）**、**杀掉内核进程后续算到 settled**、**论文起稿**，全部由框架自己的面完成，每步都有 jobId／engine／指纹／分支／计数。

## 1. 研究问题的真实读数
- **numpy（精确）**：`res-numpy`，`Σ_{k=1..2000} k³ = 4004001000000 = (2000·2001/2)²`，`equal:true`，`exitCode:0`，`inFp:fp:f209043`／`outFp:fp:d9d1032d`，镜像 `settled`。
- **scipy（数值）**：`res-scipy`，`∫₀^a x³ dx` vs `a⁴/4`：`absErr = 0 / 0 / 3.55e-15 / 0`，`kind:"array"`＋`elementKind:"mapping"`。
- **sympy（符号）**：`res-sympy`，闭式 `n²(n+1)²/4`、`simplify(S − closed) == 0`（`difference:"0"`、`identityHolds:true`）、高斯积分 `= √π/2`（latex `\frac{\sqrt{\pi}}{2}`）。
- **Lean（实例）**：`res-lean10`，`4 * S 10 = 10²·11²` 由 `by decide` 通过 ⇒ `settled`／**`passed:true`**／`exitCode:0`／`hashUnchanged:true`／`attempts:1`。
- **formal（一般命题）**：**具名拒** `VMU_FORMAL_SORRY_FOUND :: 检出 sorry（1 处）：1:61`（**没有**伪装成"已证明"）。

## 2. 各面走过/未走（诚实清单）
| 面 | 状态 | 读数 |
|---|---|---|
| `tasks` | **走过** | `t-1/t-2/t-3` 建卡＋依赖；门禁拒 `VMU_STATE unmet dependencies for t-3: t-2`；`assigned→doing→done` 全走 |
| `mathjobs`（numpy/scipy/sympy） | **走过** | 三个真机作业，含指纹/镜像状态 |
| `lean` | **走过** | 真实 Lean 4.34.0 编译，`settled`＋`passed`＋一次性公告 |
| `formal` | **走过（拒绝路径）** | 一般命题 ⇒ `VMU_FORMAL_SORRY_FOUND`（具名） |
| `records` | **走过** | `r-1`／`ece11e50…`；同内容再写 ⇒ 同 id、`deduplicated:true` |
| `library` | **走过** | `k-1-n-k-n-n-1-2-b1164d03`／`b1164d03f…`；`indexHealth {read:1,…}` |
| `resume`（会话投影） | **走过** | `entries 4 → envelope(seq 4) → adopt ⇒ restoredEntries 4, replayable:true` |
| `paper` | **走过（起稿）** | `paper-1`、`sections:1`、`editor:reader-b`、`outstanding:[{name:"Result",owner:"reader-b"}]` |
| 崩溃续算 | **走过** | 见 §3 |
| **多智能体协作** | **未走** | 同一剧本是**单智能体**（无第二成员/投票/会议/委托/并发写者）——**不作任何声称** |
| `mathadapters` 面 | **未走** | 三作业走的是作业面；适配面由 R7 单独证明 |
| `paper` 完整生命周期 | **未走** | 只走 `start`；`contribute/revise/finalize/consult` 未走 |

## 3. 中途重启（断点续算）
另一内核进程（`r10-worker.mjs`）持有重活 `res-heavy`（sympy 8 个积分）⇒ **SIGKILL 该进程** ⇒ 镜像未被改写（`running/attempts=1`）⇒ 新实例 `recover()`：
`{action:"interrupted-then-requeued", attempts:2, lease:"acquired"}` ⇒ `final {state:"settled", attempts:2, exitCode:0, kind:"array", elementKind:"symbolic", first:"sqrt(pi)*exp(-1/4)/2"}`；
`admission().recoveryLease = "enforced-by-exclusive-create (TTL = max(120000ms, job budget + 30s); stale leases are stolen)"`，`leases {acquired:1,heldByOther:0,stolenStale:0,unenforced:0}`。

## 4. 未做项（具名）
| # | 项 | 说明 |
|---|---|---|
| 1 | **多智能体协作**（第二成员／投票／会议／委托／并发写者） | 本剧本**未走**；建议下一轮用 `ballotbox`＋`meetings`＋`delegation` 对同一道题做一个"反例者 vs 证明者"的协作剧本 |
| 2 | **真中间检查点** | 续算仍是整段重跑（`resumeFrom` 只携带不透明令牌；语义属引擎，R9 已具名＋代价） |
| 3 | **一般定理的形式化** | 只机器检查 n=10 实例（自写递归 `S`，非 `Finset.sum`）；Mathlib 不在本机 ⇒ 一般命题走具名拒 |
| 4 | **引擎探测/候选顺序** | 本剧本 argv 由注入接缝映射到真 python；未走内核的引擎探测（共享模块，R6 单测已覆盖） |
| 5 | **`paper` 完整生命周期、`records` 阅读面（list/history/supersede）** | 未走（`library` 侧读了 `indexHealth`） |
| 6 | **跨机/持久卷** | 同机同 fs、本地临时镜像目录 |

## 5. 原样命令 ＋ 退出码
```
node D:\_tmp\r10-research.mjs   → === R10 DONE: 18/18 steps walked (spawns=5) ===   EXIT=0
```
（脚本与 worker 已删；完整逐步日志与 `r10-summary.json` 的读数已抄进 `14-math-research-e2e.md`。）
未跑全量 sweep；本轮**没有**改任何 kernel/docs 文件（只新增两份 handoff 文档 + 临时脚本）。
