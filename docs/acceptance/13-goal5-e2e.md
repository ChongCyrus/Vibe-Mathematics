# 目标 5 · 端到端演练：提交 → 中断 → 恢复 → 续算（Round 8 · `task-63`）

**一句话**：四库各起一个**真实长作业**（python 3.12 真机），**中途取消**与**杀掉内核进程**各走一遍，**新内核实例**只读同一 `Math/Jobs/*.json` 就完成了"终态保持、分支 ② 真的续算、已完成不重跑、跨进程占号"，并且 **`kind`/`elementKind` 在恢复后逐字段一致**。演练**顺带抓出并修掉两个真缺陷**（取消被改写、被信号杀掉的子进程被记成 `settled/exit 0`）。
**红线**：`math-computation.js`／`math-engines.js` **一字未动**。

---

## 0. 剧本（`node D:\_tmp\r8-e2e.mjs` ⇒ `=== R8 E2E :: ALL ASSERTIONS PASSED (spawns=20, mirrors=13) ===` EXIT=0）

| 阶段 | 做什么 | 读数 |
|---|---|---|
| **B** | 四库各跑一个**真实长任务**（numpy 1500² matmul／scipy `expm(260²)`／pandas 300 万行 groupby／sympy 6 个符号积分），**再把这同一个 harness 的 argv 原样当耐久作业跑一遍** | 四库 `live kind/elementKind` ≡ `durable envelope kind/elementKind`，作业 `exit=0` |
| **A1** | `submit({async:true})` 起长作业 → `cancel({jobId})` **中途取消** → 新实例 `recover()` | 四库：`terminated=true`、**子进程真的死了**、镜像 `cancelled`、新实例 `kept/cancelled`、**0 次重跑** |
| **A2** | **另起一个内核进程**拥有该作业（`D:\_tmp\r8-worker.mjs`）→ 作业 running 后**把那个进程 SIGKILL** → 新实例 `recover()` | 四库：镜像仍 `running(attempts=1)` → 新实例 `interrupted-then-requeued` → **真的重跑并 settled**（`attempts=2`、`spawns+1`）、`kind/elementKind` 不变 |
| **A3** | **同一批镜像**再给一个全新实例扫 | **采纳 8 个**（4 个一次跑完的 + 4 个续算完成的）、`requeued=0`/`interrupted=0`、**0 次 spawn**、第二轴一致 |
| **A4** | 两个实例**同时**对同一 `jobId` 提交（fs 有 `writeTextExclusive`） | **一个赢**、一个具名拒 `VMU_MATH_JOB_ID_TAKEN`；镜像里是赢家的 |

**状态读数（镜像目录 `D:/_tmp/r8-root/Math/Jobs`）**：13 个镜像 ⇒ `cancelled: 5`（4 个 A1 + 1 个竞态清理）、`settled: 8`（4 个 B + 4 个续算后）。状态全集实测＝
`queued|running|settled|failed|timeout|interrupted|cancelled`（**七态**，计算面）与 `queued|running|settled|failed|timeout|interrupted`（**六态**，Lean 面，`LEAN_JOB_STATES`）。

### B（四库真机；命令与退出码）
```
node D:\_tmp\r8-e2e.mjs   →  ALL ASSERTIONS PASSED (spawns=20, mirrors=13)   EXIT=0
```
| 库 | 真实长任务（片段） | `kind` / `elementKind` | 耐久作业 |
|---|---|---|---|
| numpy | `A(1500²)@A` ⇒ 取 `B[:4,:4]` | `array` / **`numeric`** | `exit=0`、envelope `array/numeric` |
| scipy | `linalg.expm(A/10)`（260²）⇒ `[:4,:4]` | `array` / **`numeric`** | `exit=0`、envelope `array/numeric` |
| pandas | 300 万行 `groupby.agg(['mean','std']).head(3)` | `frame` / —（frame 无第二轴） | `exit=0`、envelope `frame` |
| sympy | `∫₀^∞ e^{-x²}cos(kx)dx, k=1..6` | `array` / **`symbolic`** | `exit=0`、envelope `array/symbolic` |

真实输出片段（numpy 耐久作业的镜像回执）：`[[46.35432485792093, -38.262193197724145, …]]`；sympy：`["sqrt(pi)*exp(-1/4)/2","sqrt(pi)*exp(-1)/2",…]`。
**第二轴的证据**：每个库 live 与"恢复后从镜像回执重新解析"的 `kind`/`elementKind` **完全相同** ⇒ 第二轴**不因恢复而丢**（它是 payload 的函数，而 payload 就在耐久回执里）。

---

## 1. 本轮抓出的两个**真缺陷**（都已修 + 有回归测试）

### 缺陷 ①：取消被"临死的子进程"改写（last writer wins）
- **现象（A1 第一次跑）**：`cancel()` 返回 `terminated:true`、内存状态 `cancelled`，但 400 ms 后**磁盘上说 `settled`**（后来一度是 `failed`）。
- **根因**：`cancel()` 只是写 `cancelled`；被 `terminate()` 杀掉的子进程随后触发 `close` 事件，**同一条执行路径继续往下走**并再次 `writeMirror`，把状态改写成 `settled`/`failed`。
  之前 Round 6 的取消测试**看不见**它：那套测试的假句柄 `done` **永不结算**，所以执行路径永远不会继续。
- **修法**：`kernel/mathjobs.js` 的 `executeInner` 在预算返回后**先看取消**——`job.cancelled === true || job.state === 'cancelled'` ⇒ 保持 `cancelled`、回执写 `VMU_JOB_CANCELLED`、落镜像、**直接返回**（不让执行路径再改状态）；`kernel/lean.js` 的 `runOne` 同形处理（`interrupted` ＋ `reason:'cancelled'` 粘住，`passed=false`）。
- **回归测试**：`vmu-job-cancel.test.mjs` 新增"**cancel is STICKY**"（真 kill 语义：`terminate()` 让 `done` 以信号结算）⇒ 断言 30 ms 后内存与磁盘都仍是 `cancelled`，回执码为 `VMU_JOB_CANCELLED`。

### 缺陷 ②：被信号杀掉的子进程被记成 `settled / exit 0`
- **现象（A2 第一次跑）**：直接杀掉子进程后，镜像写成 **`settled`**。
- **根因**：`const exitCode = timedOut ? null : Number(r.exitCode)`，而被信号终止的子进程 `exitCode === null` ⇒ **`Number(null) === 0`** ⇒ 走"退出 0 ⇒ settled"分支。
- **修法**：区分"没有退出码"（`exitCode === null/undefined` 或带 `signal`）与"退出 0"——前者记 **`failed`**、具名拒 `VMU_MATH_HARNESS_FAILED`（消息里带 `signal=SIGKILL`）、回执 `exitCode:null` 并**新增 `signal` 字段**；`timedOut` 分支仍优先。
- **回归测试**：`vmu-job-cancel.test.mjs` 新增"a child with NO exit code … is failed, never settled/exit-0"。

> 这两个都不是"演练脚本的问题"：它们分别是**生产语义**的缺陷（取消不是终态、信号死亡被当成成功）。端到端之所以值得做，正是因为它把 Round 6/7 的"挂起式假句柄"换成了**真 kill**。

---

## 2. 恢复分支对照（本轮实测命中的是哪些）

| 分支 | 触发条件 | 本轮命中 | 读数 |
|---|---|---|---|
| ① `queued` ⇒ 重排 + 真跑（attempts 不变） | 镜像 `queued` | 未命中（本轮没有"提交后立刻崩溃"的窗口） | — |
| ② `running` ＋ 请求指纹一致 ⇒ `interrupted` 后重排（attempts+1）＋ 真跑 | 镜像 `running` | **A2 四库全部命中** | `interrupted-then-requeued` → `settled`，`attempts 1→2`，`spawns+1` |
| ③ `running` ＋ 指纹不一致 ⇒ 只标 `interrupted`，不重排 | 镜像被改过 | 未命中（需要人为篡改镜像） | — |
| ④ `settled` ＋ exit 0 ＋ 指纹一致 ＋ 带回执 ⇒ **采纳** | 一次跑完 | **A3 命中 8 个** | `adopted=8`、`requeued=0`、`spawns+0` |
| 其余（`failed`/`timeout`/`interrupted`/`cancelled`）⇒ 原样保留 | 终态 | **A1 命中 4 个 `cancelled`** | `action:kept`、`state:cancelled` |

---

## 3. 证明了什么 / **没**证明什么

**证明了**
1. **`submit({async:true})` 的作业在运行中可见、可取消**，且 `cancel` 在宿主 handle 形状下**真的 `terminate()`**（子进程确已死亡，非自述）。
2. **取消是终态且落在磁盘上**：新实例只读镜像 ⇒ `kept/cancelled`、**绝不重跑**（"静默复活"防线成立）。
3. **崩溃后可续算**：内核进程被 SIGKILL 后镜像停在 `running`，新实例走 **分支 ②**、`attempts` 递增、**真的重新执行到 `settled`** —— 且恢复所需的全部信息（engine/argv/stdin/timeout）**只来自镜像**（worker 与恢复实例是两个进程）。
4. **已完成不重跑**：8 个 `settled` 镜像全部被**采纳**，零 spawn、零重排。
5. **跨进程独占占号有效**：同 `jobId` 竞争 ⇒ 一成功、一 `VMU_MATH_JOB_ID_TAKEN`，**不覆盖**赢家的镜像。
6. **第二轴不因恢复而丢**：`kind`/`elementKind` 在 live 与恢复后逐字段一致（四库）。
7. **七态/六态**：计算面七态全集与 Lean 面六态全集与文档一致；本轮实测只出现 `running/settled/cancelled` 三态（其余由单测覆盖）。

**没证明（诚实边界）**
1. **真正的"多机/多操作系统"崩溃**：worker 与恢复实例都在**同一台 Windows 机器**、同一文件系统；跨机依赖 fs 语义相同（含 `wx` 独占创建的跨机原子性——本机 NTFS 上成立）。
2. **分支 ① 与 ③**：R8 的四库演练**未命中**（当时需要人为篡改镜像）；**R9 的 Lean 演练已把 ① 与 ③ 都真机命中**（见 §5.1：① 用"并发 1 时排在后面的 `queued` 作业"，③ 用"崩溃后改文件"）。
3. **孤儿进程**：worker 被 SIGKILL 时，它的 python 子进程在本机**可能短时成为孤儿**（本轮任务会在几秒内自行结束）。真正的监管需要进程组/job object 级 teardown；DSH 的 `subprocess` 服务在**服务 dispose** 时会终止其托管的进程，但**服务本身被 SIGKILL** 时操作系统不做这个保证 —— 这是**宿主的**边界，已具名。
4. **Lean 面**：R8 **未**做；**R9 已补**（§5.1，真实 Lean 4.34.0，六态 + 四个分支）。
5. **长作业的"续算"**：R8 时是**重跑整段**；**R9 已落"携带层"**（`resumeFrom` 不透明令牌：request → env → 镜像 → 恢复重发），但**检查点语义仍未实现**（属引擎）——裁决与代价见 §5.3。
6. **镜像的并发写**：R8 只证了"占号"；**R9 已把"占号之后的覆写"写实**（后续写是普通覆写、跨进程不被禁止、last-writer-wins），并**落了恢复租约**把"两个实例同时恢复同一个崩溃作业 ⇒ 双跑"挡掉（实测 2 pids vs 修前 3 pids）——见 §5.2。

---

## 5. Round 9 增补：Lean 面"杀内核"演练 ＋ 同号覆写 ＋ 中间检查点裁决

### 5.1 A · Lean 面杀内核（真实 Lean 4.34.0；`node D:\_tmp\r9-lean-e2e.mjs` ⇒ **ALL ASSERTIONS PASSED (spawns=3, mirrors=4)** EXIT=0）
剧本与四库同形：worker 进程拥有 Lean 作业 → **SIGKILL 那个进程** → 新实例只读 `Formal/Jobs/*.json`。

| 分支 | 实测读数 |
|---|---|
| **②** 崩溃中（`running`，4000 条 theorem，**真机编译 ~12.6 s**） | 镜像停在 `running(attempts=1)` ⇒ 新实例 `interrupted-then-requeued` ⇒ **真的重新编译到 `settled`**：`passed=true`、`exitCode=0`、`hashUnchanged=true`、`attempts=2` |
| **①** 从未开始（并发 1 ⇒ 第二个作业镜像停在 `queued`） | 新实例 `requeued` ⇒ **真的跑完**（`settled`） |
| **③** 崩溃后**改了文件** | `interrupted-no-rerun`／`why:'hash-mismatch'` ⇒ 状态 `interrupted`、**0 spawn**（绝不拿旧内容重跑） |
| **④** 一次跑完的作业 | 新实例 `adopted`（`passed` 恢复）且 **0 spawn**；**改了构建上下文**（不同 `leanArgs`）⇒ `kept`／`why:'build-context-changed'`（**拒绝**继承 `passed`） |

**六态**：`LEAN_JOB_STATES` ＝ `queued|running|settled|failed|timeout|interrupted`（n=6）；镜像普查 `{interrupted:1, settled:3}` ⊆ 六态 ✓。

**★ 第三个真缺陷（Lean 端到端才暴露）**：`runOne` 原先**先写 `running` 镜像、后读内容哈希** ⇒ 磁盘上的 `running` 记录 `hashBefore: null` ⇒ 崩溃后"当前内容 vs null"永远不匹配 ⇒ **恒走分支 ③，Lean 的崩溃续算实际上是坏的**。修法：**先读哈希、再写 `running` 镜像**（`kernel/lean.js`）。这也解释了为什么四库演练看不出它：计算面的恢复依据是**请求指纹**（argv/stdin/seed，一直在镜像里），不是文件哈希。

### 5.2 C · "占号之后的覆写"（实测）
- **占号**：`writeTextExclusive` 只用于**每个 jobId 的第一次写**；第二个进程用同一 id ⇒ `VMU_MATH_JOB_ID_TAKEN`、**不写任何东西**。
- **占号之后**：同一实例的后续更新是**普通覆写**（`writeText`）；**跨进程的后续写同样不被禁止** ⇒ **last-writer-wins**。实测：伪造 `running` 镜像后让**两个实例同时 `recover()`** ⇒ 两边都重排、**同一作业跑了 2 次**（`distinct pids: 3`），镜像最后是后写者的。
- **本轮落地的最小修复：恢复租约**（`createJobMirror.takeLease/releaseLease`）。重排**之前**用同一独占原语取 `<jobId>.lease`：**未过期** ⇒ 本实例让位（具名 `lease-held`）；**陈旧**可抢（死实例不永久阻塞恢复）；恢复完即**释放**。TTL ＝ `max(120 s, 作业预算 + 30 s)` ⇒ **正在跑**的恢复不会被抢。
  **实测：修前 `distinct pids: 3`（双跑）→ 修后 `distinct pids: 2`（1 原始 ＋ 恰好 1 次恢复）**，另一个实例报 `lease-held`（`enforced:true`）。
  **诚实边界**：这不是共识锁（TTL 是时钟猜测；**没有** `writeTextExclusive` 时无法排他，按具名 `unenforced` 返回）；恢复者自己崩溃仍是"至少一次" —— **崩溃恢复天生至少一次**，租约只挡住常见的双跑。
- **断言**：`tests/vmu-mathjobs-persist.test.mjs` 新增 3 条（并发恢复 ⇒ 恰好一个重跑、**只有 1 个子进程**、另一个 `lease-held`；陈旧租约被抢；无独占原语 ⇒ `unenforced`）。

### 5.3 B · 中间检查点：裁决（**落"携带"，不落"解释"**）
**裁决**：不把"真中间检查点"落进内核，但把**最小形状的携带层**落地（本轮已完成）：
- **已落**：`submit({resumeFrom})` 的**不透明令牌**被携带 —— request → 子进程 **env `VMU_RESUME_FROM`** → 镜像 → **恢复时原样重发**；回执新增 `resumedFrom`；令牌进**请求指纹**（换令牌 ⇒ 旧镜像不匹配 ⇒ 分支 ③，**绝不静默按新令牌续算**）。`admission().checkpointing` **具名**："not-implemented: … CARRIED but never interpreted"。
- **未落**：检查点语义（分段提交、运行中读流抓检查点、写 `checkpoint:{token,at}`、按检查点裁剪重跑范围）。

**为什么这样裁**：① **语义属引擎**——内核无法验证"该令牌意味着计算可从这里继续"；声称能续算而引擎不支持，就是把重跑包装成续算（本仓红线）。② **成本**：需要子进程输出协议＋运行中读流（宿主契约已有 `readFrom(offset)`，本面现在只在结束后读）＋镜像 `checkpoint` 字段＋恢复分段重发＋**每引擎各自**的"可续"证明；粗估 **60–100 行内核 ＋ 每引擎一个 demo ＋ 一组"续算 ≡ 一次算完"的对照测试**。③ **可调控性**：携带层已把策略钩子放好，引擎/pack 的 harness 可自行产出与消费令牌。

**改判条件**：出现**真实可续引擎**（长 sympy/数值积分分段、或外部求解器自带 restart 文件）且**单个作业时长 ≥ 作业预算量级**（重跑代价不可接受）时，按上述四件套一次做完并配对照断言；**在那之前，重跑整段更诚实也更便宜**。

---


---

## 4. 产物与命令

| 产物 | 说明 |
|---|---|
| `D:\_tmp\r8-e2e.mjs` | 演练主脚本（已删；读数保存在本文与 `math-round8-report.md`） |
| `D:\_tmp\r8-worker.mjs` | 被 SIGKILL 的"内核进程"（已删） |
| 镜像目录 | `D:/_tmp/r8-root/Math/Jobs/`（13 个镜像；演练读数见 §0） |

```
node D:\_tmp\r8-e2e.mjs                      → ALL ASSERTIONS PASSED (spawns=20, mirrors=13)   EXIT=0
node tests/vmu-job-cancel.test.mjs           → === VMU JOB CANCEL: 9 passed, 0 failed ===      EXIT=0   （+2 回归）
node tests/vmu-mathjobs.test.mjs             → 10 passed, 0 failed                             EXIT=0
node tests/vmu-mathjobs-persist.test.mjs     → 17 passed, 0 failed                             EXIT=0
node tests/vmu-mathjobs-exclusive.test.mjs   → 5 passed, 0 failed                              EXIT=0
node tests/vmu-lean.test.mjs                 → ALL GREEN (13, 0)                              EXIT=0
node tests/vmu-lean-jobs.test.mjs            → 13 passed, 0 failed                             EXIT=0
node tests/vmu-lean-killable.test.mjs        → 7 passed, 0 failed                              EXIT=0
node tests/vmu-subprocess-admission.test.mjs → 5 passed, 0 failed                              EXIT=0
node tests/audit-enforced-consistency.test.mjs → 355 passed, 0 failed                          EXIT=0
node scripts/check-docs.mjs                  → DOC LINT: PASS                                  EXIT=0
```
