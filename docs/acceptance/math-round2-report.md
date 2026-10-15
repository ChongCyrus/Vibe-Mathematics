# 目标 5 · 数学引擎深度（Round 2）— `task-12` 交账

**负责人**：`v5r-reader-b`。**判据来源**：`03-v5r-full-inventory.md` 分片 B §5（数学面 ＋ 6 条缺口对照表）、Lead 的 Round 2 派单（A 专用适配／B 作业持久化·断点续算／C 参数进 schema／D 文档）、`00-decisions.md` D-10。
**硬约束遵守**：未跑全量 sweep、未 `regen-all`、未 `git`；临时文件只在 `D:\_tmp`；未改任何不在我名下的文件（共享 `math-computation.js`／`math-engines.js` **未动**，见 §4）。

---

## 1. 逐项交付

### A. numpy / scipy / pandas / sympy **专用适配面** ✓

**新增** `kernel/mathadapters.js`（工厂 `createMathAdapters`；导出 `ADAPTER_LIBS`／`SCIENTIFIC_LIBS`／`SHAPE_KINDS`／`RESULT_ENVELOPE`／`WIRED_KEYS`／`buildHarness`／`probeBody`／`exprBody`／`codeBody`／`callBody`／`fingerprint`／`refuse`）。

| 要求 | 落点 |
|---|---|
| **结果形状契约** | 统一信封 `{ok,lib,version,kind,…payload,truncated{droppedElements,droppedBytes},enforced[],receipt{…},isRefutation:false}`；`kind ∈ scalar｜array｜frame｜expr｜result｜mapping`（`SHAPE_KINDS`）。归一在**子进程**里做（只有它拿得到对象）：ndarray→`array`（values/shape/dtype）、numpy 标量→`scalar`、DataFrame/Series→`frame`（columns/index/dtypes/rows）、sympy.Basic→`expr`（srepr **可比对** ＋latex＋freeSymbols）、`OptimizeResult`/`OdeResult`/`RootResults`/`TtestResult`→`result`（类名判据；ndarray 字段由 `_vmu_jsonable` 递归转列表）、dict→`mapping`；**无法归类 ⇒ `VMU_MATH_SHAPE_UNKNOWN` 具名拒**（不 stringify 成"看起来像数据"）。`shapeContract()` 把契约当数据回给调用方（`schema:'vmu/math-adapter-result@1'`）。 |
| **会话级解释器/环境绑定** | 解释器：**显式 `vmu.math.adapters.python` 只用它**（解析不到 ⇒ `VMU_MATH_LIB_UNAVAILABLE` ＋ hint 点名该键，**绝不回退猜测**）→ 否则 `python3`→`python`→`py`（PATH，经注入 `resolveExecutable`）。绑定内容：`{interpreter,via,libs:{name:{installed,version}},missing[],at}`；缓存口径 `probeCache` = `session`（默认）｜`call`，`refresh:true` 强制重探；`status()` 回显绑定并给 `seam:{resolveExecutable,spawn}`。 |
| **探测与调用可注入接缝** | `resolveExecutable(cmd)` 与 `spawn({engine,argv,stdin,timeoutMs,env})` **全部注入**；缺失 ⇒ `probe/run` 具名拒 `VMU_EXTERNAL_UNAVAILABLE`，`plan()` 仍回答（`argvTemplate`/`needs`/`caps`/`enforced`）。测试**不含"本机有没有 X"这个前提**（`tests/vmu-math-adapters.test.mjs` 全程假接缝）。 |
| **未装 ⇒ 具名拒 ＋ next** | `probe()` 逐库报 `installed/version`，缺库给 `next:{kind:'agent-install',packages,command,interpreter}`；`run()` 对缺库 ⇒ `VMU_MATH_LIB_UNAVAILABLE` ＋ `next.command`（`python -m pip install --user <lib>`），且**缺库时不发起运行**（测试断言）。**本面永不安装**。 |
| 可调控（C 的适配侧） | `vmu.math.adapters.enabled`｜`.libs`（缺省＝四库；**显式 `[]` ⇒ "声明零库"具名拒**）｜`.python`｜`.packageAllowlist`（非空即强制，hint 点名键）｜`.probeCache`｜`.maxArrayElements`（叶子元素上限，**计数**截断）｜`.maxStringBytes`（字节上限，**计数**截断）｜另读 `vmu.math.engines`。全部经 `readKey` 字面量读取 ⇒ 每次调用现读（**热改即刻生效**）、`keysUsed()` 与真读一致、生成器 `generate-wired-schema.mjs` 的 `readKeysFor`/`readKey('vmu…')` 扫描能看见（不会变成"声明了没人读"）。 |
| 失败语义（不越界） | `MATH_TIMEOUT`（保留 partial stdout/stderr ＋ `droppedBytes`）／`MATH_NONZERO_EXIT`（退出码＋stderr 尾部）／`VMU_MATH_HARNESS_FAILED`（被调用代码报错）／`VMU_MATH_RESULT_UNPARSEABLE`（无信封或非 JSON；**会把 harness 的 error 一并回显**）／`VMU_MATH_SEED_REQUIRED`／`VMU_MATH_LIB_UNAVAILABLE`／`VMU_MATH_LIB_NOT_DECLARED`／`VMU_MATH_ADAPTER_OP_UNKNOWN`／`VMU_MATH_EXPR_REQUIRED`／`VMU_MATH_INVALID_INPUT`。**全部 `isRefutation:false`**。 |

### B. 作业持久化 / 断点续算 ✓

**扩展** `kernel/mathjobs.js`（工厂名与既有 API **不变**；新增形参 `fs`／`root`／`recover`）。

- **镜像**：`<root>/<vmu.math.jobs.dir || 'Math/Jobs'>/<jobId>.json`，`schema:'vmu/math-job@1'`，含 `state/attempts/enqueuedAt/startedAt/settledAt/exitCode/timedOut/interrupted/cancelled/seed/random/argvHash/inputHash/**request{engine,argv,stdin,timeoutMs,seed,random}**/run/receipt/reason`。写点：**提交、结算、取消、恢复转移** —— 每次状态变化都写；写失败**计数**（`mirrorFailures`）并具名报告。目录不安全 ⇒ `VMU_MATH_JOBS_DIR_UNSAFE`（**不静默换目录**）。
- **状态全集**：`queued｜running｜settled｜failed｜timeout｜interrupted｜cancelled`（`JOB_STATES`）。**本面不存在 `passed`**（`TERMINAL_STATES` 亦无）：`settled` ＝"进程干净退出且输入指纹未变"的**工具事实**；`submit()` 命中成功路径返回 `{ok:true, settled:true, isRefutation:false}`。
- **恢复四分支**（`recover()`；`vmu.math.jobs.recover` = `on-load`｜`manual`｜`off`）：①`queued` ⇒ 重排并**真的重跑**；②`running`＋请求指纹一致 ⇒ 标 `interrupted` 后重排（**attempts+1**）；③`running`＋指纹不一致 ⇒ **只标 interrupted，不自动重排**（具名 `fingerprint-mismatch`）；④`settled`＋exit 0＋指纹一致＋**带回执** ⇒ **采纳**；其余（含 `settled` 但无回执）⇒ 原样保留＋具名 `why`。返回逐类计数 `{scanned,requeued,adopted,interrupted,left,corrupt,results}`。
- **jobId 级查询/取消**：`status({jobId})`（内存→镜像回退）、`cancel({jobId,reason})`（只对 `running`；**取消也落镜像** ⇒ 恢复不会"静默复活"已取消作业）、`list()`／`mirrors()`／`listMirrors()`。
- **跨进程／保留如实标注**：`admission()` ⇒ `{persist,fileMirror,jobsDir,keepMirrors,removeText,retention,recoverMode,exclusiveCreate:false,crossProcess:'not-enforced',mirrors,droppedMirrors,mirrorSkipped,mirrorFailures,lastRecovery,notes,next}`。有 `fs.removeText` ⇒ **淘汰最旧＋`droppedMirrors` 计数**；无 ⇒ **到 `keepMirrors` 停写＋`mirrorSkipped` 计数**（不无界增长、不假装淘汰）。独占创建未获宿主原语 ⇒ **不假装**。
- **总线事件**：`math/job-submitted`／`-settled`／`-failed`／`-timeout`／`-cancelled`／`-recovered`，`math/adapters-probed`／`-ran`（payload 见 §5 给 vmu-pack 的工单）。
- **顺手修的 R1 真缺陷**：原 `emit({type:'math.submit'})` 是**单对象**调用，而 `bus.emit` 只接受 `(name,payload)` 字符串名 ⇒ 该事件**每次都被 try/catch 静默吞掉**（从未有人收到）。现已全部 `emit('math/…', payload)`，并加"NAME-first"防回归断言。

### C. 参数进 settings schema（热改 ＋ 留痕）✓（**键由 vmu-core 落**）

- 我读的 **9 个新键**（完整 `{key,type,def,hot,who,doc}` 已发 vmu-core）：
  `vmu.math.adapters.enabled`（boolean/true/H2）｜`adapters.libs`（stringList/四库/H2）｜`adapters.python`（string/''/H1）｜`adapters.packageAllowlist`（stringList/[]/H1）｜`adapters.probeCache`（enum session|call/session/H2）｜`adapters.maxArrayElements`（natural/10000/H1）｜`adapters.maxStringBytes`（natural/65536/H1）｜`jobs.recover`（enum on-load|manual|off/on-load/H1）｜`jobs.keepMirrors`（natural/200/H1）。
- **既有键的语义扩展/固定**（请 core 同步 doc 文本）：`vmu.math.jobs.persist`（⇒"写 `Math/Jobs` 镜像并允许恢复"，仍是超集）｜`vmu.math.jobs.dir`（⇒镜像目录，空＝`Math/Jobs`）｜`vmu.math.jobs.logMax`（事件轨迹上限，新增消费）。
- **热改**：所有键都在每次调用时经 `readKey` 字面量现读（无构造期快照 ⇒ 改键同回合生效）。
- **留痕**：`trail()`（`math.submit`／`math.timeout`／`math.nonzero`／`math.done`／`math.cancel`／`math.mirror.*`／`math.recover.*`，超出 `logMax` **计数**丢弃）＋ 两条 `bus` 事件族 ＋ `admission()`／`status()`／`statusAll()` 的计数（`droppedReceipts`／`droppedLog`／`droppedMirrors`／`mirrorSkipped`／`mirrorFailures`）。
- **注意（已告知 core／pack）**：`vmu.math.maxParallel`（mathjobs 读）与 `vmu.math.jobs.maxParallel`（mathtools 读）是**同义双键**，R1 现状我不改，已具名登记。

### D. 文档 ✓

- `docs/15-math-computation-toolbox.md`：§14.4 改写（持久化由 ⛔→✓，保留"大结果/跨进程"⛔）；**新增 §14.9 科学计算库专用适配面**（绑定/形状表/接缝/失败语义/恢复四分支/真机实测）；§21.6 键表 ＋9 行（14→23）＋三个既有键的语义说明；§21.7 ＋10 个新码；§21.8 内核服务（`mathjobs.js` ✓、`mathadapters.js` ✓）与库适配器行（numpy/scipy/pandas/sympy 由 ⛔→✓ 适配/◐ 计算）＋两个新形状。
- `docs/09-math-formalization.md`：§4 的"持久化 ⛔"改为**计算面 ✓ ＋ Lean 面仍 ⛔（具名登记）**，新增 **§4.1 作业镜像与恢复四分支**（含 `MathJobMirror` schema 与能力边界）；附录 A 由 14 键→**23 键**（A15–A23 逐键表）。

---

## 2. 原样命令与退出码（定向单跑）

```
node tests/vmu-mathjobs.test.mjs          → === VMU MATHJOBS: 10 passed, 0 failed ===        EXIT=0
node tests/vmu-mathjobs-persist.test.mjs  → === VMU MATHJOBS PERSIST: 17 passed, 0 failed === EXIT=0
node tests/vmu-math-adapters.test.mjs     → === VMU MATH ADAPTERS: 20 passed, 0 failed ===    EXIT=0
node tests/vmu-math.test.mjs              → === VMU MATH: 27 passed, 0 failed ===             EXIT=0
node tests/vmu-mathtools.test.mjs         → === VMU MATHTOOLS: 208 passed, 0 failed ===      EXIT=0   （未改动的既有面，确认没被我打红）
node scripts/check-docs.mjs               → vmu doc-lint: docs=29 issues=0 notes=24 / DOC LINT: PASS  EXIT=0
```
- **首次** `check-docs` 曾报 `DOC LINT: FAIL`（EXIT=1）；输出里**没有任何** §09/§15 卷的 issue 行，且**未做任何改动**立即复跑即 PASS（`issues=0`）——疑与同轮其它队友并行写文件有关；如实记录两次观测。复跑命令与输出见上。
- **真机 smoke（临时脚本已删，配方可重建）**：`D:\_tmp\vmu-adapters-smoke.mjs`（真实 `child_process` 接缝 ＋ 真实解释器路径 `C:\Users\admin\AppData\Local\Programs\Python\Python312\python.exe`）。结果：`probe.ok=true`；`numpy 2.5.3`／`scipy 1.18.1`／`pandas 3.0.6`／`sympy 1.14.0`；`det([[1,2],[3,4]])=-2.0000000000000004`（scalar）／`arange(6).reshape(2,3)`（array int64）／`DataFrame`（frame，columns a,b）／`simplify(sqrt(8))`（expr，latex `2 \sqrt{2}`）／`optimize.minimize`（result，`success:true`，`x=[1.99999998]`）。SMOKE EXIT=0。
- 本轮真机 smoke 期间**发现并修掉 3 个真实缺陷**（都只会在真机上暴露，假接缝掩盖）：
  1. `probeBody` 用了裸 `json.loads` 而非 `_json.loads` ⇒ 真实 python `NameError`（现由测试断言"harness 里不得出现裸 `json.*`"守住）；
  2. `buildHarness` 直接把 `'numpy as np'` 拼进源码 ⇒ `SyntaxError`（缺 `import` 关键字；现在自动补 `import `，并接受完整 `from … import …` 语句）；
  3. 存储的 `binding` 没有 `ok:true`，`run()` 读它时会把"探测成功"当成拒绝（=静默不跑）；同时 `OptimizeResult` 是 dict 子类，原先被归到 `mapping`（现按类名归 `result`，ndarray 字段递归转列表）。

---

## 3. 已验证的"非空过"要点（供 vmu-verify 复核）

- 恢复四分支**各自独立断言**：分支①断言"重排后 `spawn` 真的又跑了一次"；分支②断言 `attempts===2` 且落盘 state=sentinel；分支③断言 `requeued===0` **且 `spawn` 调用数不增**；分支④断言**新实例**能读回同一 `outputFingerprint`；并另有一条"`settled` 但**无回执** ⇒ 不采纳"。
- **永不静默 passed**：`JOB_STATES` 无 `passed`；成功返回带 `settled:true,isRefutation:false`；适配面全部返回 `isRefutation:false`；`docs/09 §4.1` 明写"`settled` 只是工具事实"。
- 形状契约六型逐一断言 payload；未知形状具名拒；截断两类（元素/字节）都断言计数 > 0；缺库时断言"**没有**发起运行"。
- 总线"NAME-first"两条断言（否则单对象调用会被静默吞掉——R1 的真实状态）。

---

## 4. 未做项 / 边界（如实登记）

| # | 未做 | 原因与去处 |
|---|---|---|
| N1 | **共享 `math-computation.js`／`math-engines.js` 一字未改** | 遵守 D-10(1) 与 vmu-verify 的对齐（它正把 canonical 快照 vendored 进仓并重定义为语义级对照）；适配面因此落在内核新模块，不改共享接口 ⇒ **本轮 parity 无风险**。 |
| N2 | ~~**Lean 作业仍只活在会话内存**~~ ⇒ **Round 2 已收掉，见 §6.1**（`kernel/lean.js` 接上 `createJobMirror`；`Formal/Jobs/<jobId>.json`；六态＋恢复四分支；id 经 `kernel/ids.js`） | 剩余的**具名限制**：宿主无独占创建原语（`crossProcess:'not-enforced'`）与 **Lean 子进程无法 terminate**（promise 接缝无 handle ⇒ `dispose()` 只标 `interrupted`，`canTerminateChild:false`）。 |
| N3 | `kernel/mathtools.js` 未改 | 它是已验收的 45 键策略层（208/208）；新能力不需要改它。若 core 希望 `status()` 里一并显示作业/适配面摘要，我再补（一行级改动）。 |
| N4 | 工具动作与 on-load 恢复**未接线** | 属 vmu-core：`vibe_vmu_mathtools` 增 9 个 action；构造 `mathjobs` 后按 `vmu.math.jobs.recover` 调一次 `recover()`；`createMathAdapters` → 新服务 `vmu.mathadapters`。接线单已发（含两条修正）。 |
| N5 | 跨进程独占创建、大结果内容寻址引用 | 需要宿主原语（前者）/新子系统（后者）⇒ `admission()` 具名声明未强制，`docs/15 §14.4` 保留 ⛔。 |
| N6 | 文档计数口径 | `docs/09 附录A`／`docs/15 §21.6` 已按 23 键更新；README 等**生成物**的计数按 D-11 由 Lead 跑 `update-doc-counts` 统一刷新（**我未跑**）。 |

## 5. 同轮协作记录（已发出的接口）
- → **vmu-verify**：D-10(1) 对齐（本轮不动共享模块；语义级对照锚点：导出名/失败码**集合**/schema 键集/引擎键集/三条逐字提示词/13 个 `next.reason`）；两个新测试默认进 vmu 作用域。它回报的 **RULE E 两条空洞指纹已修**（见 §6.2）。
- → **vmu-core**：接线单（模块/服务/seam/工具动作/9 键/10 新码/耐久路径/形状契约）＋两条修正（`recover()` 需构造后显式调用；fs 需可选 `removeText`）；N2 后追加：Lean 面需 `fs` ＋ `ids` 两个形参。
- → **vmu-pack**：真读键清单（含"缺省＝四库、显式 `[]`＝声明零库"）＋8 个钩子名与 payload ＋ R1 `emit` 单对象缺陷＋同义双键（`vmu.math.maxParallel` vs `vmu.math.jobs.maxParallel`）提醒；N2 后追加 `lean/…` 6 个钩子名。

---

## 6. 追加项（Lead 指令，仍在目标 5 内）

### 6.1 N2 收掉：Lean 作业接上**同一套**持久化原语 ✓

**改动的文件**：`kernel/lean.js`（重写作业段）、`kernel/mathjobs.js`（**抽出** `createJobMirror` 并被两面共用；同时把 `mj-` 号改由 `kernel/ids.js` 铸）、`kernel/formal.js`（同类的 `emit` 单对象缺陷 ＋ `fm-` 计数器也改经 `kernel/ids.js`）、`tests/vmu-lean.test.mjs`（`keysUsed` 的硬编码 8 → 派生断言）、**新增** `tests/vmu-lean-jobs.test.mjs`。

| 要求 | 落点 |
|---|---|
| 同一套原语 | `kernel/mathjobs.js` 导出 `createJobMirror({fs,dir,keep,clock,schema,onNote})`（write/read/list/remove/status）；`mathjobs` 与 `lean` 都只用它 ⇒ 保留策略/损坏判定/淘汰计数**只有一份实现** |
| 镜像语义对齐 v5r | `Formal/Jobs/<jobId>.json`，`schema:'vmu/lean-job@1'`，含 `jobId/statement/file/state/attempts/enqueuedAt/startedAt/settledAt/exitCode/hashBefore/hashAfter/hashUnchanged/passed/contextHash/receipt/reason` |
| 状态 | `queued｜running｜settled｜failed｜timeout｜interrupted`（**没有 `passed` 状态**；`passed` 是"exit 0 且哈希未变"的**结论**）；`settle()` 接受**全部终态**（因此超时也能被读回，而不是只能空等） |
| 恢复四分支 | ①`queued` ⇒ 重排并**真的重跑**（attempts 不变：0 ⇒ 第 1 次）；②`running` ＋ 文件内容哈希**仍等于**记录值 ⇒ 标 `interrupted`（先落盘）后**重排**（attempts+1）；③`running` ＋ 哈希不一致/文件读不到 ⇒ **只标 interrupted，不重跑旧内容**（具名 `hash-mismatch`/`file-unreadable`）；④`settled` ＋ exit 0 ＋ `hashUnchanged` ＋ **带回执** ＋ **构建上下文一致** ＋ 当前文件哈希仍等于记录值 ⇒ **采纳**，否则 `left` 并具名 `why`（`settled-without-receipt`/`build-context-changed`/`file-changed-since-run`/`hash-not-clean`） |
| **永不静默 passed** | ① `mk()` **不再从镜像继承 `passed`**（`passed:false` 为默认，只有采纳分支能置 true）；② 若镜像自称 `passed:true` 而证据不成立，**内存与磁盘同时降级**（写回 `passed:false`）——这两点是被**测试逼出来**的真缺陷（原实现会把 `passed` 从镜像复活） |
| id 计数器（D-15） | `kernel/ids.js` 唯一铸号者：`lean-`／`mj-`／`fm-` 前缀保留；`recover()`/`listMirrors()` 里 `observe(...)` 既有 id ⇒ 计数 **max+1**；模块内 `let seq` 全部删除 |
| 能力边界 | `admission()`：`exclusiveCreate:false`、`crossProcess:'not-enforced'`、**`canTerminateChild:false`**（promise 接缝无 handle ⇒ `dispose()` 只能标 `interrupted`，**不假装 kill 了子进程**）；保留上限同计算面（有 `removeText` 淘汰＋计数，无则停写＋计数） |
| 钩子 | `lean/job-submitted`、`lean/job-settled`、`lean/job-failed`、`lean/job-timeout`、`lean/job-recovered`、`lean/jobs-disposed`（NAME-first） |

### 6.2 原样命令与退出码（N2 后）

```
node tests/vmu-lean.test.mjs          → ALL GREEN  (passed=13, failed=0)                        EXIT=0
node tests/vmu-lean-jobs.test.mjs     → === VMU LEAN JOBS: 13 passed, 0 failed ===              EXIT=0
node tests/vmu-mathjobs.test.mjs      → === VMU MATHJOBS: 10 passed, 0 failed ===               EXIT=0
node tests/vmu-mathjobs-persist.test.mjs → === VMU MATHJOBS PERSIST: 17 passed, 0 failed ===    EXIT=0
node tests/vmu-math-adapters.test.mjs → === VMU MATH ADAPTERS: 20 passed, 0 failed ===          EXIT=0
node tests/vmu-formal.test.mjs        → === VMU FORMAL: 10 passed, 0 failed ===                 EXIT=0
node tests/vmu-formal-tool.test.mjs   → === FORMAL TOOL: 16 passed, 0 failed ===                EXIT=0
node tests/vmu-formal-pipeline.test.mjs → === FORMAL PIPELINE: 14 passed, 0 failed ===          EXIT=0
node tests/vmu-math.test.mjs          → === VMU MATH: 27 passed, 0 failed ===                   EXIT=0
node tests/vmu-mathtools.test.mjs     → === VMU MATHTOOLS: 208 passed, 0 failed ===             EXIT=0
node tests/audit-declaration-criterion.test.mjs → RULE E: fingerprints current=67 baseline=67（**我两文件零命中**）；该套件整体 RED=5 项**均非我引入**（regen-all --check 未跑 / RULE C 表盲点 / RULE D `vibe_vmu_grant` / RULE F chat.js·mailbox.js），如实记录  EXIT=1
node scripts/check-docs.mjs           → vmu doc-lint: docs=29 issues=0 notes=24 / DOC LINT: PASS   EXIT=0
```
- `vmu-mathtools` 与 `vmu-math` 未被我改动，用作回归对照（208/27 全绿）。
- **RULE E 两条空洞指纹已修**（不用 `EMPTY_ALLOWED`）：`vmu-math-adapters.test.mjs` 在遍历 `WIRED_KEYS` 前加 `assert.ok(WIRED_KEYS.length > 0, …)`；`vmu-mathjobs-persist.test.mjs` 在遍历 `bus.calls` 前加 `assert.ok(bus.calls.length > 0, …)`；两处都**打印计数**。复跑 `audit-declaration-criterion` 确认 fingerprint 集合**未增长**。
- 两处**派生断言修正**：`vmu-mathjobs`／`vmu-formal` 的"确定性"用例原先直接比整份回执（含 id）——id 现在由 `kernel/ids.js` 唯一化（D-15 的**目的**），故改为"剥离 id 后逐字相等 ＋ **断言 id 不同**（绝不复用）"，比原来更强。

### 6.3 真机验证（Lean 4.34.0 **本机已装**，非伪造）✓

`D:\.elan\bin\lean.exe`（Lean (version 4.34.0, commit 293d5d0c…)）；临时脚本（已删）用**真实 subprocess ＋ 真实文件 ＋ 真实 fs 接缝**（无任何假实现）跑出：

| 场景 | 实测结果 |
|---|---|
| 真编译通过（`theorem vmu_smoke : True := trivial`） | `state=settled`、`passed=true`、`exitCode=0`、`hashUnchanged=true`；镜像 `Formal/Jobs/lean-1.json` 存在且 `state=settled` |
| 真编译失败（`:= nonsense`） | `state=failed`、`passed=false`、`code=VMU_LEAN_EXIT_NONZERO` |
| **重启**（同一目录上换新 face 实例）`recover()` | `scanned=2, adopted=1, left=1, requeued=0, corrupt=0`；被采纳作业 `passed` 恢复为 `true` |
| 采纳后**编辑源文件**再 `recover()` | `adopted=0`、`left=2`、该作业 `passed=false`、`why='file-changed-since-run'` ⇒ **真机上"永不静默 passed"成立** |
| `admission()` | `persist=true, fileMirror=true, jobsDir='Formal/Jobs', removeText=true, retention='evict-oldest-counted', exclusiveCreate=false, crossProcess='not-enforced', canTerminateChild=false` |

**具名说明（无法真机验证的一条）**：分支 ②/③（`running` 崩溃态）无法由"真机崩溃"直接制造——它们由**同一份镜像目录上的状态改写 + 新 face 实例**复现（`tests/vmu-lean-jobs.test.mjs` 分支 1–3），这是"崩溃形状"的忠实模拟，而不是跳过：真实进程被杀时留在盘上的正是该形状的镜像。真机 smoke 覆盖的是**分支 ④ 与"失败/超时终态"**这两条真实可造的分支。
