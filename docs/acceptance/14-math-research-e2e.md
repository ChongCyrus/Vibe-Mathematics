# 一次真实的小型数学研究：端到端剧本（Round 10 · `task-79`）

**研究问题（自选，真小题）**：验证恒等式
`Σ_{k=1..n} k³ = (n(n+1)/2)²`（对一切 n），以及它的连续类比 `∫₀^a x³ dx = a⁴/4` 与高斯积分 `∫₀^∞ e^{-x²} dx = √π/2`
（这样 numpy / scipy / sympy **各有一个真实任务**），再取一个 **Lean 可机器检查的实例**、归档成记录/卡片，并在**中途杀掉内核进程**证明断点续算。

**驱动**：`node D:\_tmp\r10-research.mjs` ⇒ **`=== R10 DONE: 18/18 steps walked (spawns=5) ===`** **EXIT=0**（脚本已删；读数存档 `D:\_tmp\r10-summary.json`）。
**红线**：`math-computation.js`／`math-engines.js` **一字未动**。所有数值/符号结果都来自**真机**（Python 3.12.10 ＋ numpy 2.5.3／scipy 1.18.1／sympy 1.14.0；Lean 4.34.0）。

---

## 0. 剧本一览（18 步全走通）

| # | 面 | 步骤 | 真实读数 |
|---|---|---|---|
| 1–3 | `tasks` | 建三个带依赖的任务 | `t-1`（数值验证）→ `t-2`（符号闭式，deps `[t-1]`）→ `t-3`（形式化，deps `[t-2]`）；`state:"assigned"`、`deps` 如实回显 |
| 4 | `tasks` | **依赖门禁**（T3 在 T2 完成前就做） | **具名拒** `VMU_STATE :: unmet dependencies for t-3: t-2` |
| 5 | `tasks` | `assigned → doing → done` | T1/T2/T3 全部走完；非法跳步也被拒（实测 `illegal transition assigned -> done`） |
| 6 | `mathjobs` · **numpy** | `Σk³`，n=2000（int64 精确） | `jobId:res-numpy`、`exitCode:0`、`lhs = rhs = 4004001000000`、`equal:true`、`inputFingerprint:fp:f209043`、`outputFingerprint:fp:d9d1032d`、镜像 `settled` |
| 7 | `mathjobs` · **scipy** | `∫₀^a x³ dx` vs `a⁴/4`，a∈{0.5,1,3,7.5} | `jobId:res-scipy`、`kind:"array"`、`elementKind:"mapping"`；四行 `absErr` = `0 / 0 / 3.55e-15 / 0` |
| 8 | `mathjobs` · **sympy** | `summation(k³)` 闭式 ＋ `simplify(S − (n(n+1)/2)²)` ＋ 高斯积分 | `jobId:res-sympy`、`difference:"0"`、`identityHolds:true`、闭式 `n²(n+1)²/4`、`gauss = √π/2`（latex `\frac{\sqrt{\pi}}{2}`） |
| 9 | `lean` | 真实编译 `theorem sum_cubes_10 : 4 * S 10 = 10^2 * (10+1)^2 := by decide` | `jobId:res-lean10`、`state:"settled"`、**`passed:true`**、`exitCode:0`、`hashUnchanged:true`、`attempts:1`、镜像 `settled` |
| 10 | `formal` | **一般命题**（∀n）＋ `sorry` | **具名拒** `VMU_FORMAL_SORRY_FOUND :: 检出 sorry（1 处）：1:61`（＋ `enforcedScope:'evaluated-so-far'`） |
| 11 | `records` | 把发现写进实验室笔记（`put`） | `id:r-1`、`fingerprint:ece11e50…`、`bytes:174`；**同内容再写一次 ⇒ 同一个 `r-1`、`deduplicated:true`** |
| 12 | `library` | 归档成命题卡片 | `id:k-1-n-k-n-n-1-2-b1164d03`、`fingerprint:b1164d03f…`；同内容再归档 ⇒ 同 id；`indexHealth {read:1,deferred:0,unreadable:[],missingId:[]}` |
| 13 | `resume` | 会话投影：记录 4 个作业状态 → 取 `envelope()` → **新投影 `adopt(env)`** | `entries:4`、`seq:4`、`adopted:true`、`restoredEntries:4`、`replayable:true` |
| 14 | `paper` | 起稿（章节＋归属＋编辑） | `paperId:paper-1`、`sections:1`、`editor:"reader-b"`、`outstanding:[{name:"Result",owner:"reader-b"}]` |
| 15 | **重启** | 另一个内核进程拥有重活（sympy 8 个积分）→ **SIGKILL 那个进程** → 新实例 `recover()` | 见 §2 |
| 16–18 | （收尾） | 任务转 done、汇总、判据全绿 | 18/18 |

---

## 1. 每一步的原样证据（含 jobId/engine/指纹）

```
node D:\_tmp\r10-research.mjs   →  18/18 steps walked (spawns=5)   EXIT=0
```
- **tasks**：`t-1 {id:"t-1",state:"assigned",deps:[],writeScopes:["Math/Jobs"]}`；`t-3 {deps:["t-2"]}`；门禁 `{"refused":true,"code":"VMU_STATE","message":"unmet dependencies for t-3: t-2"}`。
- **numpy**：`{"ok":true,"exitCode":0,"jobId":"res-numpy","engine":"python","inFp":"fp:f209043","outFp":"fp:d9d1032d","lhs":4004001000000,"rhs":4004001000000,"equal":true,"mirrorState":"settled"}`
  （`S(2000) = 4 004 001 000 000`，与 `(2000·2001/2)²` 逐位相等。）
- **scipy**：`rows=[{a:0.5,quad:0.015625,closed:0.015625,absErr:0},{a:1,…0},{a:3,quad:20.249999999999996,closed:20.25,absErr:3.55e-15},{a:7.5,quad:791.015625,closed:791.015625,absErr:0}]`，`kind:"array"`＋`elementKind:"mapping"`。
- **sympy**：`{"sumClosed":"Mul(Rational(1,4), Pow(n,2), Pow(n+1,2))","difference":"0","identityHolds":true,"gauss":"Mul(Rational(1,2), Pow(pi, Rational(1,2)))","gaussLatex":"\\frac{\\sqrt{\\pi}}{2}"}` ⇒ **闭式与高斯积分都由 CAS 给出，且差式化简为 0**。
- **Lean**：`{"state":"settled","passed":true,"exitCode":0,"hashUnchanged":true,"attempts":1,"mirrorState":"settled"}`，一次性公告：`【形式化结果】res-lean10：通过（exit 0，哈希未变）`。
  `.lean` 文件只有**核心 + decide**（本机无 Mathlib）：`def S : Nat -> Nat | 0 => 0 | n+1 => S n + (n+1)^3`，`theorem sum_cubes_10 : 4 * S 10 = 10^2 * (10+1)^2 := by decide`。
- **formal（一般命题）**：`{"ok":false,"code":"VMU_FORMAL_SORRY_FOUND","message":"检出 sorry（1 处）：1:61"}` —— **不是"已形式化"**，而是框架**具名**说"这里有个 sorry"。
- **records / library**：`records.put` ⇒ `r-1 / ece11e50…`（同内容再写 ⇒ 同 id、`deduplicated:true`）；`library.append` ⇒ `k-1-n-k-n-n-1-2-b1164d03 / b1164d03f…`（同内容再归档 ⇒ 同 id）。
- **resume 投影**：`entries 4 → envelope(seq 4) → 新投影 adopt ⇒ restoredEntries 4, replayable:true`。
- **paper**：`paper-1`，1 个章节、编辑 `reader-b`、`outstanding:[{name:"Result",owner:"reader-b"}]`（**该面真的走起来了**，不是"能跑就行"的空调用）。

---

## 2. 中途重启（断点续算）——本剧本最关键的一步

- **谁拥有作业**：另起一个 **Node 进程**（`D:\_tmp\r10-worker.mjs`）持有 `res-heavy`（sympy 8 个符号积分，真机约数秒）。
- **读数**：`crashedMirror {state:"running", attempts:1}` → **SIGKILL 该进程** → `leftAfterKill {state:"running", attempts:1}`（镜像**未被改写**）→
  新内核实例 `recover()` ⇒ **恢复分支 ②**：`{action:"interrupted-then-requeued", attempts:2, lease:"acquired"}` ⇒ **真的重跑到 `settled`**：
  `final {state:"settled", attempts:2, exitCode:0, kind:"array", elementKind:"symbolic", first:"sqrt(pi)*exp(-1/4)/2"}`
- **能力自述**：`admission().recoveryLease = "enforced-by-exclusive-create (TTL = max(120000ms, job budget + 30s); stale leases are stolen)"`，`admission().leases = {acquired:1, heldByOther:0, stolenStale:0, unenforced:0}`。
- **要点**：续算所需的**全部**信息（engine／argv／stdin／timeout）只来自镜像；恢复后**符号结果的 `kind`/`elementKind` 未丢**（`array`/`symbolic`），第一个值 `√π·e^{-1/4}/2` 与 `∫₀^∞ e^{-x²}cos(x)dx` 的闭式一致。

---

## 3. 这条剧本证明了什么

1. **"用这套框架真的做一道数学题"是可行的**：从**建任务（含依赖门禁）**到**真机计算**、**形式化**、**记成果**、**重启续算**、**起稿**，18 个动作全部由框架自己的面完成，且每一步都有可核读数（jobId／engine／指纹／分支／计数）。
2. **多引擎真跑**：numpy 给出**精确整数**相等、scipy 给出**数值收敛**（误差 3.55e-15）、sympy 给出**符号闭式且差式为 0** —— 三种证据互相独立。
3. **"证明了"的语义没被偷换**：Lean 只对**可判定的实例**给 `passed:true`；一般命题走 `formal.check` 时**被具名拒**（`VMU_FORMAL_SORRY_FOUND`），**没有**被包装成"已证明"。
4. **成果可归档且幂等**：records 与 library 对**同内容**给**同一个 id**（`deduplicated:true`），不是静默重复。
5. **断点续算是真的**：内核进程被 SIGKILL 后，新实例只凭镜像把作业**跑到 `settled`**（`attempts 1→2`、分支②、租约 `acquired`），且**符号载荷的第二轴没丢**。
6. **会话投影可重放**：`envelope()` → 新投影 `adopt()` ⇒ 4 条记录、`replayable:true`。

## 4. 这条剧本**没**证明什么（具名边界）

| # | 没证明 | 说明 |
|---|---|---|
| 1 | **多智能体协作** | **未走**。全程是**单智能体**（`owner:"reader-b"` 只是把归属写进任务/记录/论文面）；没有第二个成员、没有投票/会议/委托、没有并发写者。用户项目的"多智能体协作"这一层**本剧本没有覆盖**。 |
| 2 | **真中间检查点** | 续算是**整段重跑**（`attempts+1`）。`resumeFrom` 只把不透明令牌**携带**到子进程/镜像/恢复（R9 落地），检查点语义属引擎，**未实现**。 |
| 3 | **一般定理的形式化** | 只机器检查了 **n=10 实例**；一般命题需要非线性算术的证明手段（Mathlib 的 `ring`／手写归纳引理），本机无 Mathlib ⇒ 走的是**具名拒**。`S` 是自写递归函数（非 `Finset.sum`），所以这里的实例证明**不**等价于"标准库意义下的 Σ 恒等式"。 |
| 4 | **缺失的通用性** | 引擎 argv 由**我注入的接缝**映射到真 python（`engine:'python'`）；我没有走内核的引擎**探测/候选顺序**（那是共享模块的能力，R6 已单测）。 |
| 5 | **`mathadapters` 面** | 本剧本没有走适配面（六型/`elementKind` 由 R7 单独证明）；三个计算作业走的是**作业面**。 |
| 6 | **论文面的完整生命周期** | 只走了 `start`（起稿＋章节归属）；`contribute/revise/finalize/consult` **未走**。 |
| 7 | **跨机/持久卷** | 同机同 fs；镜像目录是本地临时目录，**没有**跨机或崩溃一致性证明。 |
| 8 | **`records` 的阅读面** | `put`／去重走过；`list/history/supersede` 等**未走**（library 侧读了 `indexHealth`）。 |

---

## 5. 附：把这一步接到"用户用途"上

用户要的是"为数学研究／多智能体协作数学研究提供底层框架与基础设施"。本剧本证明**基础设施的单智能体主干成立**：
`任务与依赖 → 真机多引擎计算（带回执/指纹）→ 形式化（能则机器检查、不能则具名）→ 成果归档（幂等）→ 崩溃后自动续算 → 会话可重放 → 论文起稿`。
**下一步最有价值的一件事**（超出本任务）：把同一道题交给**两个成员**（例如一个出反例、一个做证明），用 `ballotbox`/`meetings`/`delegation` 走一遍 —— 那才是"多智能体协作"的端到端证据；本剧本**没有**做，故不作任何声称。
