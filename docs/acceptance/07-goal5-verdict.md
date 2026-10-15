# 目标 5 终判：数学引擎深度（numpy/scipy/pandas/sympy ＋ 作业持久化/断点续算）

**判定人**：`v5r-reader-b`（`task-45`，Round 6）。**回答的问题**（用户原话）："补上数学引擎深度（numpy/scipy/pandas/sympy 的专用适配 ＋ 作业持久化/断点续算）——是否已经补上、够不够深？"

**基线**：`Vibe-Mathematics/vibe-math-v5r/`（`math-computation.js`、`math-engines.js`、`vibe-math-v5r.js`，HEAD `6d0164e`）＋ 我在 Round 1 的逐段盘点 `_handoff/vmu/03-v5r-full-inventory.md`（分片 B §5）。
**关于任务里给的安装副本**：`C:\Users\admin\.dsh\profiles\web\node_modules\dsh-vibe-math\vibe-math-v5r\` 在本机**不存在**（实测 `Test-Path` 为假）⇒ 基线取自**仓内 v5r 副本**（与安装副本同源；行号沿用 Round 1 盘点）。

---

## 0. 总判定（一句话）

**"专用适配"这一半：vmu 从"没有"做到了"有且真机四库全通"，判为 `具备（并为 v5r 之上的净增）`。**
**"作业持久化/断点续算"这一半：能力齐备并超过 v5r（计算面从"完全无持久化"到有镜像＋七态＋恢复四分支＋取消＋跨进程占号），但生产接线有一处**未接**（Lean 面镜像），判为 `具备（计算面）/ 部分（Lean 面接线）`。**

| 半 | v5r | vmu | 判定 |
|---|---|---|---|
| 四库专用适配 | **无**（只有通用包存在性探测；`03-v5r-full-inventory.md` §5.8） | 新面 `kernel/mathadapters.js`：六型结果契约、会话级环境绑定、可注入接缝、具名拒＋`next`、计数截断；**四库真机全通**（§3） | **具备（净增）** |
| 作业持久化/断点续算 | Lean 面**有**（`Formal/Jobs/*.json`＋四分支恢复）；计算面**完全没有**（`op:'run'` 同步 await） | 两面**共用** `createJobMirror`；计算面七态（含 `cancelled`）＋`recover()` 四分支＋`cancel`＋跨进程独占占号；Lean 六态＋四分支＋去重 | **具备（计算面为净增）；Lean 面"代码具备、生产未接线"** |

---

## 1. 引擎适配：v5r 机制 vs vmu（逐条）

| # | v5r 机制（基线行号） | vmu 侧（`file:line` ＋ 实测） | 判定 |
|---|---|---|---|
| 1 | **引擎集合与候选顺序**：`MATH_ENGINE_ORDER`（8 个：python/r/octave/julia/matlab/maple/wolfram/cli）＋ `MATH_ENGINES[].candidates`（`math-engines.js:12,19-171`） | **同一份共享模块原样复用**：`vibe-math-vmu/math-computation.js`、`math-engines.js`（逐字节同源；vmu 未改） | **具备（同一实现）** |
| 2 | **发现顺序**：PATH → DSH 自带运行时（`runtimeRoots`）→ 各 OS 已知安装目录（`mathInstallRoots`）；`probeCwd` 可注入 | 同上（共享）＋ vmu 的宿主接缝把 `runtimeRoots` 指向 `DSH_HOME`/`~/.dsh`（`vibe-math-v5r.js` 对照：`mathSessionHost` 等价物在 `host-math.js`；适配面另有解释器顺序 `PY_CANDIDATES=['python3','python','py']` `kernel/mathadapters.js:139`，显式配置优先且失败即具名拒 `:396-404`） | **具备** |
| 3 | **版本/许可探测**：`probeVersion`＋重试、商业引擎只探测永不安装（`math-engines.js` 描述符 `license`） | 共享模块（未改） | **具备** |
| 4 | **失败码**：11 个 `MATH_*` ＋ `next.kind` 7 种 ＋ `next.reason` 13 种（`math-computation.js:43-55`、`docs/math-computation.md §3`） | 共享模块原样；vmu 侧另有适配/作业码（`VMU_MATH_LIB_UNAVAILABLE`、`VMU_MATH_SHAPE_UNKNOWN`、`VMU_MATH_HARNESS_FAILED`、`VMU_MATH_RESULT_UNPARSEABLE`、`VMU_MATH_EXPR_REQUIRED`、`VMU_MATH_ADAPTER_OP_UNKNOWN`、`VMU_MATH_JOB_ID_TAKEN`、`VMU_MATH_JOBS_MIRROR_UNWIRED/DIR_UNSAFE`…）**均已登记 `docs/03 §8`** | **具备** |
| 5 | **参数默认**：六参数（`MATH_PARAM_DEFAULTS`）＋ `mathTimeoutMs=60000`、`MATH_CAPS={64KB,64KB,4MB}`（`:34-57`） | vmu 设置面：`vmu.math.computation/mode/engines/timeoutMs/packages/installScope`（`settings/schema.js`）＋ `host-math.js` 的 `MATH_PARAM_MAP`（6 键 → 模块参数）；**两个读者、一个默认**的 `vmu.math.captureStdoutBytes`（`mathjobs.js:363` ＋ `lean.js:166`，缺席值 65536＝schema `def`） | **具备** |
| 6 | **超时**：单次预算 `mathTimeoutMs`；v5r 侧在宿主接缝里用 `Promise.race`＋`handle.terminate()`（`vibe-math-v5r.js:5084-5151` 一带） | 计算面/适配面/Lean/脚本桥共用 **`createChildBudget`**（`kernel/mathjobs.js:117-190`）：本地 timer 到点 ⇒ 宿主 handle ⇒ **真 `terminate()`**；promise 接缝 ⇒ 结算为 timeout（**不挂死**）但**具名** `terminated:false`；`graceMs` 作为请求传给宿主 | **具备（Round 4 补齐）** |
| 7 | **输出上限**：`MATH_CAPS.stdout/stderr=64KB`、`file=4MB`，截断**计数** | 共享模块（未改）＋ 面层二次保护：`tailBytes()`（`lean.js:96-103`）／`tail()`（`mathjobs.js:232-239`）都**计数** `droppedBytes`；宿主自己的 `lossy`/`spillPath` 也带进回执 | **具备** |
| 8 | **四库专用适配**：**v5r 无**（只有通用 `packages[]` 存在性探测；`03-v5r-full-inventory.md` §5.8 实测） | **`kernel/mathadapters.js`（新）**：① 六型结果契约（`scalar/array/frame/expr/result/mapping`，`SHAPE_KINDS`）；② 会话级解释器/环境绑定（显式 → `python3/python/py`，`probeCache` session/call）；③ **探测与执行全注入接缝**（`resolveExecutable`/`spawn`；缺 ⇒ `VMU_EXTERNAL_UNAVAILABLE`，`plan()` 仍可答）；④ 未装 ⇒ `VMU_MATH_LIB_UNAVAILABLE` ＋ `next.kind:'agent-install'` ＋ 命令；⑤ 未知形状 ⇒ `VMU_MATH_SHAPE_UNKNOWN`（不 stringify 成"看起来像数据"）；⑥ 截断两类都计数；⑦ `enforced[]`/`enforcedScope` 全带 | **具备（v5r 之上净增）** |

**结论（引擎适配）**：与 v5r **同级或更强**。同级＝共享模块（候选顺序/探测/失败码/默认/超时/上限）原样复用；更强＝**专用适配面**（v5r 完全没有）＋ 超时可真终止＋输出上限有宿主级 `lossy`/`spillPath` 证据。

---

## 2. 作业持久化/断点续算：v5r 机制 vs vmu（逐条）

| # | v5r 机制（基线行号） | vmu 侧（`file:line`） | 判定 |
|---|---|---|---|
| 1 | **镜像**：Lean `Formal/Jobs/<jobId>.json`（`vibe-math-v5r.js:4603-4610`）；**计算面无镜像**（`op:'run'` 一次调用内同步 await） | 两面共用 **`createJobMirror`**（`kernel/mathjobs.js:112-218`）：计算面 `Math/Jobs/<id>.json`（`schema:'vmu/math-job@1'`）、Lean `Formal/Jobs/<id>.json`（`vmu/lean-job@1`，与 v5r 同拼写）；写点＝提交/结算/取消/恢复转移；写失败计数 | **具备（计算面为净增）** |
| 2 | **状态**：Lean 四态 `settled/failed/timeout/interrupted`（＋在飞 queued/running），**无 `passed` 状态** | 计算面七态 `queued/running/settled/failed/timeout/interrupted/cancelled`；Lean 六态（同 v5r）；**两面都无 `passed` 状态**（`passed` 是"exit 0 且哈希未变"的结论） | **具备（计算面更细）** |
| 3 | **恢复四分支**（`recoverLeanJobs` `:4915-4966`）：queued 重排／running＋hash 匹配 ⇒ interrupted 后重排（attempts+1）／不匹配 ⇒ 只 interrupted 不重排／settled＋匹配 ⇒ 补写归档与 passed | `recover()`：计算面（`mathjobs.js:600-700` 一带）与 Lean（`lean.js:588-670`）同形；**采纳要求"exit 0 ＋ 指纹/哈希一致 ＋ 带回执 ＋（Lean）构建上下文一致 ＋ 当前内容仍匹配"**，其余原样保留＋具名 `why`；**绝不把 `passed` 从镜像里复活**（`lean.js` `mk()` 强制 `passed:false` 起步，仅采纳分支置真） | **具备，且比 v5r 更严**（v5r 的 `settled` 补写只需"匹配"，vmu 另外要求回执在位且内容未再变） |
| 4 | **jobId 级查询**：`lean_job {jobId}`、`waitMs` 轮询（`:4984-5003`）；**无取消**（`disposeLeanJobs` 只标 interrupted） | 计算面 `status({jobId})`＋**`cancel({jobId})`**（取消落镜像）＋`submit({async:true})`（运行中可见）；Lean `status(jobId)`／`mirrors()`／**`cancel(jobId)`**（R6 新增）；`dispose()` 能杀就杀并计数。**两面 `cancel` 在拿到 handle 时真的 `terminate()`**（§4） | **具备（v5r 无取消）** |
| 5 | **去重**：`leanLibArchivedOk(name,sha)`（内容＋构建上下文＋镜像 settled，`:4614-4629`） | Lean：`dedupeKey`＝内容哈希＋构建上下文，**与 settle 复核同源**（`lean.js:300-309` 产出，`:351-370` 使用）；同 key 且已 passed ⇒ `deduped:true` 不重编译。计算面**故意不去重**（每次运行要有自己的回执），只有同 id 跨进程占号 ⇒ `VMU_MATH_JOB_ID_TAKEN` | **具备（形式化面）＋具名差异（计算面）** |
| 6 | **保留策略**：`MATH_ARCHIVE_MAX_ATTEMPTS_PER_RUN=20`／`MAX_RUNS=200` **只告警不删**（`math-computation.js:63-65`） | 镜像 `keepMirrors`：有 `removeText` ⇒ **淘汰最旧＋计数**；无 ⇒ **到上限停写＋计数**（`mathjobs.js` mirror `status()`；`admission().retention`） | **具备（比 v5r 更实）** |
| 7 | **跨进程独占创建**：**完全没有**（v5r 注释自认"跨进程并发仍需宿主独占创建原语"） | fs 接缝 `writeTextExclusive`（宿主 `host-math.js:135` `{flag:'wx'}`）⇒ 首次占号原子；同号 ⇒ `VMU_MATH_JOB_ID_TAKEN`＋**绝不覆盖**别人镜像；`admission().exclusiveCreate/crossProcess` 如实回显 | **具备（净增）** |
| 8 | **一次性公告**：`takeLeanNoticesFor(member)`（`:4857-4871`，上限 20，剪掉非 active） | `pushNotice/takeNoticesFor/noticesView`（`lean.js:215/219/227`，上限 `LEAN_NOTICE_MAX=20`，丢弃计数）；长期查询＝`status(jobId)`／`mirrors()`／镜像文件 | **具备**；残余：**注入下一次提示词**归 core 转回合管线（closed-by） |
| 9 | **并发**：`leanJobsMaxParallel`（默认 1＝串行） | `vmu.math.maxParallel`（R4 收敛为唯一规范名；v5r pack 值＝1）＋ 计算面 `maxParallel`／`maxJobs`；`leanJobsMaxParallel` 同理。**R6 修**:并发上限在计算面**精确**（旧 `running() > maxParallel` 在上限 1 时会同时跑 2 个；见 §4.4） | **具备** |
| 10 | **接线**（v5r 是单文件自洽，无"接线"问题） | **计算面已接线**：`kernel/index.js:698-709` 传 `fs: host`（host 有 `writeText/readText/listDir/exists/removeText`）＋ `on-load` 时显式调一次 `recover()`。**Lean 面未接线**：`kernel/index.js:567` 只传 `{settings,spawn,root,clock,log}` ⇒ **`admission().fileMirror=false`，镜像/恢复在生产路径上未启用**；`spawnHandle`/`ids`/`timer` 同样未传（宿主原生 handle 仍会被预算自动识别） | **部分（改判条件见 §5）** |

---

## 3. 四库真机读数（**硬证据**；本机真实 python ＋ 真实子进程接缝，无 fake）

**环境**：`C:/Users/admin/AppData/Local/Programs/Python/Python312/python.exe`（Python 3.12.10）；numpy 2.5.3／scipy 1.18.1／pandas 3.0.6／sympy 1.14.0。
**驱动**：临时脚本 `D:\_tmp\goal5-smoke.mjs`（**已删**；用 `createMathAdapters` ＋ 真 `child_process` 接缝 ＋ 真 `resolveExecutable`），**一个库一次调用**，命令与退出码如下：

```
node D:\_tmp\goal5-smoke.mjs numpy   → EXIT=0
node D:\_tmp\goal5-smoke.mjs scipy   → EXIT=0
node D:\_tmp\goal5-smoke.mjs pandas  → EXIT=0
node D:\_tmp\goal5-smoke.mjs sympy   → EXIT=0
```

| 库 | probe（版本/解释器） | 真实调用 1（片段） | 真实调用 2（片段） |
|---|---|---|---|
| **numpy** | `2.5.3`，`missing:[]` | `np.linalg.det([[1,2],[3,4]])` ⇒ `kind:scalar`、`value:-2.0000000000000004`、`dtype:float64`、`exitCode:0`、`ms:323`、`truncated:{0,0}` | `np.arange(6).reshape(2,3)` ⇒ `kind:array`、`shape:[2,3]`、`dtype:int64`、`values:[[0,1,2],[3,4,5]]`、`ms:318` |
| **scipy** | `1.18.1` | `optimize.minimize(...)` ⇒ `kind:result`、`fields.success:true`、`x:[1.9999999820005778]`、`jac:[-2.10976831560572e-8]`、`hess_inv:[[0.49999999550014446]]`、`fun:3.24e-16`、`ms:2961` | `integrate.quad(exp(-t²),0,∞)` ⇒ `kind:scalar`、`value:0.8862269254527579`、`ms:2627` |
| **pandas** | `3.0.6` | `DataFrame({'a':[1,2],'b':[3.5,4.5]})` ⇒ `kind:frame`、`columns:["a","b"]`、`rows:[[1,3.5],[2,4.5]]`、`ms:756` | `Series([10,20,30],name='s').describe()` ⇒ `kind:frame`、`columns:["s"]`、8 行统计、`ms:1138` |
| **sympy** | `1.14.0` | `simplify(sqrt(8))` ⇒ `kind:expr`、`sympy:"Mul(Integer(2), Pow(Integer(2), Rational(1, 2)))"`、`latex:"2 \\sqrt{2}"`、`freeSymbols:[]`、`ms:1775` | `solve(Eq(x**2,4),x)` ⇒ `kind:array`、`values:["-2","2"]`（列表被归为 array，元素按可 JSON 化规则转成字符串）、`ms:1923` |

**每次调用都带回执**：`{jobId:'ad-N', engine:'adapters-python', ms, inputFingerprint, outputFingerprint}`，且 `isRefutation:false`。
**一处诚实的形状说明（Round 7 已收口 ✓）**：`sympy.solve` 返回的是 Python `list` ⇒ 归 `array`（元素经 `_vmu_jsonable` 字符串化）。这仍是契约内的合法归一，但**"符号表达式列表"与"数值数组"现在在第二轴上可区分**：`kind:"array"` ＋ **`elementKind`**（`numeric | symbolic | mapping | text | mixed | unknown`）——`solve(x²=4)` ⇒ `elementKind:"symbolic"`、`numpy.arange` ⇒ `"numeric"`（真机读数见 `math-round7-report.md`；契约见 `docs/15 §14.9`）。

---

## 4. 本轮"能补就补"补了什么

1. **jobId 级取消变成"真取消"（两面）**：`createChildBudget` 新增 **per-call `onHandle`** 回传（`kernel/mathjobs.js`），执行面把活句柄挂到作业上（计算面 `execute`、Lean `runOne`），于是 `cancel({jobId})` 在**有 handle** 时调用 `terminate()`（`terminated:true`、`childrenTerminated` 计数），**没有 handle** 时把作业标 `cancelled` 并**具名**写明"无法 terminate，进程最多活到单次预算"；终态作业取消 ⇒ 具名拒（`VMU_JOB_CANCELLED`）。取消**落镜像**（防"崩溃恢复把已取消作业复活"）。Lean 面同步新增 `cancel`（映射为 `interrupted`＋`reason:'cancelled'`，**不新增状态**以保持与 v5r 状态集一致），`dispose()` 由"无条件 `killed:0`"升级为"能杀就杀并计数"。
2. **`queued` 也能取消，且被取消的排队作业一次都不会被 spawn**（实测 spawn 次数）；`queued` 作业在席位释放后**不会启动**（`executeInner` 的前置状态守卫）。
3. **`submit({async:true})`**：入队即返回（默认仍阻塞，旧调用行为不变）⇒ 运行中的作业**可见、可取消**（这是取消在生产路径上真正可达的前提）。
4. **并发上限精确化（真实缺陷修复）**：等待席位从 `await Promise.resolve()` **自旋**改为真等待（`slotWaiters`），比较式从 `running() > maxParallel` 改为 **`>=`**——旧式在 `maxParallel=1` 时**会同时跑 2 个**子进程（测试用峰值并发实测）。
5. **一处默认值不一致修掉**：`kernel/mathjobs.js` 的 `captureStdoutBytes` 本地缺席值 20000 → **65536**（＝schema `def` ＝ Lean 侧 `LEAN_OUTPUT_MAX_BYTES`），一个键一个默认。

（测试与命令见 `_handoff/vmu/math-round6-report.md`。）

---

## 5. 未做项 ＋ **改判条件**

| # | 未做/部分 | 缺了会怎样、谁需要 | **改判为"具备"的条件** |
|---|---|---|---|
| 1 | **Lean 面镜像未接线**（`kernel/index.js:567` 未传 `fs`） | Lean 的作业镜像/断点续算在**生产路径**上不生效（`admission().fileMirror=false`）：重启后 Lean 作业仍是内存态、公告不落盘。谁需要：要在重启后继续编译作业的部署 | **core 一行**：`createLeanFace({ settings, spawn, root, clock, log, fs: host, ids, timer })`（`fs` 有 `writeText/readText/listDir/removeText` 即可；`ids` 让 `lean-` 号水合 max+1）。接线后 `admission().fileMirror` 应变 true，`tests/vmu-lean-jobs.test.mjs` 的"跨实例采纳"即成为端到端证据 |
| 2 | **F17 终止在生产路径上差一层语汇**：kernel 的 `spawn` 来自 `host-spawn.js`（promise 形状，自己带预算 ＋ 把 `graceMs` 交给宿主 ⇒ **进程会被宿主杀**），我的面**看不到 handle** ⇒ `terminated:false`、`canTerminateChild:false` | 进程确实会被终止（宿主 graceMs），但**回执里说不清"是我杀的吗"**；需要"面层可主动取消"的部署 | 把宿主原生 `spawn`（同步返回 `SubprocessHandle`）或其 `spawnHandle` 传给三个面（`index.js:698/713` 与 `:567`）⇒ 面层 `terminated:true`、`cancel` 立即生效 |
| 3 | **大结果内容寻址引用**（`Math/Results/<sha256>`） | 被截断的完整输出只能靠宿主 `spillPath`（仅在宿主截断时有）；跨机复核需要内容寻址令牌 | 定下"截断阈值/保留策略/跨机可达性"三条策略（pack 层）后实现引用面 |
| 4 | **符号列表 vs 数值数组的形状区分**（§3 说明） | ~~消费方无法从 `kind` 区分~~ ⇒ **Round 7 已用 `elementKind` 落地 ✓**（`docs/15 §14.9`；`ELEMENT_KINDS = numeric|symbolic|mapping|text|mixed|unknown`，**加法式**、`kind` 仍为 `array`）：`solve(x²=4)` ⇒ `symbolic`、`numpy.arange` ⇒ `numeric`、`solve(...,dict=True)` ⇒ `mapping`、字符串 `Index` ⇒ `text`（四库真机 21 次调用全绿，见 `math-round7-report.md`）。**命名依据（保留）**：先核 v5r 的 `math-computation.js` —— 它的 `next.kind` 集是 `agent-install|enable|engine-override|note|reason|user-install|vendor`，**与结果形状无关**、该模块**没有结果形状契约** ⇒ `elementKind` 及其词表**不与基线冲突**（是本品自身的第二轴，与既有 `SHAPE_KINDS` 同性质）。 | **已具备**（不再是缺口） |
| 5 | **共享模块两处退避 sleep 的可取消接缝** | 见 `docs/11 §11.ap`：有界（≤3 次/单站点 ≤650ms）、不持锁不持进程 ⇒ **具名豁免** | 四份逐字节副本一起加 timer seam ＋ canonical 快照刷新（跨预设协调项） |
| 6 | **计算面内容去重** | **有意不做**：每次运行必须有自己的回执（证据独立性） | 不打算改判（除非有"同内容复用回执"的明确需求） |
| 7 | **公告注入下一次提示词** | 成员不会在下一轮自动看到作业结果（需自己查 `status`/镜像） | core 转回合管线消费 `takeNoticesFor(member)`（queue → prompt 一段） |

---

## 6. 结论（给目标 5 的最终话术）

> **补上了，而且两半都补到了"不低于 v5r"**：引擎适配面**与 v5r 同级**（共享模块原样复用）**并为 v5r 之上新增了四库专用适配**（六型结果契约＋会话级环境绑定＋可注入接缝＋具名拒），**四库真机全通**（§3，4 条命令全 EXIT=0）；作业持久化/断点续算**超过 v5r**（v5r 的计算面完全没有持久化，vmu 两面共用镜像＋七态/六态＋恢复四分支＋jobId 级取消＋跨进程独占占号＋内容去重）。**两处"部分"都是接线与语汇层面、不是能力缺失**：① Lean 面镜像未接线（core 一行）；② 面层的"是我不 terminate"与宿主 graceMs 的实际终止差一层语汇。**改判条件已逐条写明**（§5）。
