# 目标 5 收尾 ＋ C-45（Round 3 · `task-19`）— 交账

**负责人**：`v5r-reader-b`。**判据**：`_handoff/vmu/round3-plan.md` 第 12 行（math 面 N3/N5）＋ `04-parity-matrix.md:181,254`（C-45）。
**纪律**：未跑全量 sweep、未 `regen-all`、未 `git`；临时文件只在 `D:\_tmp`（已删）；内容型批量改写只用 Node；只改我名下文件。

---

## A. N3 `kernel/mathtools.js`：**已对齐，只需两处补齐**（原报告"mathtools 未改"作废）

**实测结论**：`mathtools.js` **本来**就是 `enforced[]` 口徑最早的出处 —— 它定义 `ENFORCED_SCOPE = 'evaluated-so-far'`（:152），`deny()`（:265）对**每个**具名拒都带上 `enforced`（真的求值过的键，空集也明确是 `[]`）、`enforcedScope` 与 `evaluated`，成功面也带 `enforced`。**键面无需改动**（它与 `mathadapters`/`mathjobs` 读同一批 `vmu.math.*` 键，各键都有真读取者）。

本轮只补了两处遗漏：
1. `export function refuse(code,message,hint)`（构造期守卫用的 Error 工厂）也带 `enforced: []` ＋ `enforcedScope`；
2. **缓存命中**的成功回执补 `enforcedScope`（:603）。

验证：`node tests/vmu-mathtools.test.mjs` → `=== VMU MATHTOOLS: 208 passed, 0 failed ===` **EXIT=0**；`node tests/vmu-mathtools-tool.test.mjs` → 14/0 **EXIT=0**；`audit-enforced-consistency` 里 `mathtools.plan(requireSeed)` 场景仍是 `thrown:enforced[]` ✓。

---

## B. N5 跨进程独占创建：**真实现（宿主可降级）**；大结果引用**具名登记为缺**

### B.1 独占创建 ✓
- **接缝**：fs 接缝新增**可选** `writeTextExclusive(rel, text)`（宿主以 `{flag:'wx'}` / `O_EXCL` 实现；Windows 语义＝`CREATE_NEW`，文件已存在即 `EEXIST`）。
- **强制点**：`createJobMirror.write()` 在**首次**写一个 jobId 时走独占创建；`EEXIST` ⇒ `{ok:false, code:'VMU_MATH_JOB_ID_TAKEN', reason:'exclusive-create-refused'}`。两个面都在 **submit** 里把这一拒**上抛**（`mathjobs`／`lean`）：具名拒 ＋ `enforced:['vmu.math.jobs.persist','vmu.math.jobs.dir']` ＋ `enforcedScope`，并把刚建的内存作业**删掉**（不留半成品）。同一进程内的后续更新仍走普通覆写（独占只占第一次）。
- **能力自述**：`admission()` ⇒ `exclusiveCreate`（有接缝＝true）、`crossProcess:'enforced-by-exclusive-create'`（否则 `'not-enforced'`），并在 `notes` 里写清**两种情形**的后果与"谁需要它"（多进程/多会话共用一个研究所目录）。
- **为什么这样落**：`host-math.js`（真 `wx` 调用点）不在我的写范围（别的 owner）⇒ 我把**强制逻辑 + 接缝契约 + 降级报告**做全并测透，宿主侧的 `writeTextExclusive` 由 core 一行接上；不接也不撒谎（仍是 `not-enforced` ＋ 具名）。
- **Windows 注意（已写进注释/文档）**：`wx` 在 Windows 上是 `CREATE_NEW`，语义正确；但**原子替换**（写临时文件再 rename）在 Windows 上 `rename` 覆盖已存在文件会失败 ⇒ 需要一个 `renameReplace` 式的接缝，那是另一条（本轮未做，未见需求）。

### B.2 大结果引用 ⛔ **具名登记为缺**
- 现状：超过 `vmu.math.captureStdoutBytes` 的输出只有**计数式截断**（`receipt.droppedBytes`），没有内容寻址引用面。
- **缺了会怎样**：被截断的完整输出的**回执引用不到**它（只能在归档文件里翻）。
- **谁需要它**：要在**另一台机器 / 另一次会话**复核大输出的读者（复现包 `ReproPack`、审计链）。
- **不是有意为之的能力**：它是有意的**未做项**（与"v5r 也缺"一致），登记在 `docs/09 §4` 与 `docs/15 §14.4`。

### B.3 验证
```
node tests/vmu-mathjobs-exclusive.test.mjs → === VMU MATHJOBS EXCLUSIVE: 5 passed, 0 failed === EXIT=0
```
五条：① 无接缝 ⇒ 具名降级（`exclusiveCreate:false`／`not-enforced` ＋ notes）；② 有接缝 ⇒ admission 翻转 ＋ 独占写入计数；③ **同号（另一进程先占）⇒ `VMU_MATH_JOB_ID_TAKEN`，前者镜像逐字未动，内存不留作业，`idTaken` 计数**；④ 同进程更新仍覆盖；⑤ **Lean 面同形**（用注入的 `kernel/ids.js` 把下一个号钉成 `lean-42`，预置别人占的镜像 ⇒ 同样具名拒且镜像未动）。

---

## C. C-45 忠实性缺陷 ⇒ **强制弃权**：**落在内核谓词** ✓（已实现）

### C.1 判定点该落在哪（结论）
**内核谓词，不是 pack 声明**：
- **声明**（"这份形式化不忠实"，必须写明具体偏差）是判断 ⇒ 策略层（代理/pack）；
- **能不能把它变成一张 1 或 0 的票**由内核回答，答案永远是"不能" ⇒ 被登记者在该对象上的布尔票被**强制改写为 0.5 弃权**。
⇒ pack 无法关掉它、成员无法"忘记弃权"；v5r 的 L2 option A 语义（不忠实 ≠ 命题为假，也绝不允许"记录后照常算票"）因此成立。已一句话回复 vmu-pack（"内核谓词，无需声明、无新错误码"）。

### C.2 落点与形状
- **新服务** `kernel/fidelity.js`（`createFidelityRegistry`；建议服务键 `vmu.fidelity`）。**刻意不挂在 `kernel/formal.js` 的方法表上**：`formal.js` 的 10 个方法与 `vibe_vmu_formal` 的 10 个 action 必须一一对应（该门禁要求"谁都不许漂移"），而我加 5 个方法后 `tests/vmu-formal-tool.test.mjs` 立刻红（"enum 与服务方法表 one for one"）⇒ 拆成独立服务是**遵守那条门禁**，不是绕开它。
- **三个动词**：
  - `declareDefect({target,by,note})`：缺 target/by/note ⇒ 具名拒 `VMU_MATH_INVALID_INPUT` ＋ `enforced[]` ＋ `enforcedScope`；成功 ⇒ marker `{markerId:'fd-N', target, by, note, at, enforcedVote:0.5, passedWithdrawn:true}` ＋ `enforcedAbstention:{vote:0.5, enforced:true, reason:'fidelity-defect'}` ＋ `isRefutation:false`。
  - `abstentionFor({target,by})`：**纯谓词**，只对"该成员 × 该对象"成立（别的成员/别的对象都是 `null`）。
  - `applyAbstention({target,by,declared})`：**唯一强制点** —— 被登记者声明的 `1`/`0` 一律 → `0.5`（`enforced:true`）；本来就是中间值 ⇒ 原样通过且**不重复计数**；未登记者 ⇒ 原样通过。
  - `loadDefects()` / `view()` / `status()`：留痕读面（`count/declared/abstentionsEnforced/durable/dir/loaded/droppedLog/defects[]`）。
- **留痕**：append-only（同一对象第二个缺陷**追加** history，绝不抹掉第一个人）；注入 fs 时落 `Formal/Defects/<target>.json` 并可跨实例重载；无 fs ⇒ `durable:false` **具名**。
- **接缝**：`createFormal({ fidelity })` 只在 `status().fidelity` 里显示登记册的计数（**不新增方法**）；`fidelity: null` ⇒ `status().fidelity === null`（不编一个 0 出来）。
- **新错误码**：**无**（缺参复用已登记的 `VMU_MATH_INVALID_INPUT`；`VMU_MATH_JOB_ID_TAKEN` 是 N5 唯一的例外，需 core 登记 docs/03 §8）。
- **closed-by（唯一需要外部一行）**：**表决面计票时必须把布尔票路由过 `applyAbstention`**（`kernel/ballotbox.js` 等）。本面把强制点做好且可测；未接线的**具名**在 `docs/09 §4.2` 与本节，不在别处重复实现。

### C.3 验证
```
node tests/vmu-fidelity-abstention.test.mjs → === VMU FIDELITY ABSTENTION: 8 passed, 0 failed === EXIT=0
```
八条：① 缺 target/by/note 三拒（各带 `enforced:[]`/scope，且不留任何标记）；② 声明成功 ⇒ marker ＋ `passedWithdrawn` ＋ `isRefutation:false`；③ 谓词不外溢；④ `applyAbstention` 把 1/0 都变 0.5、中间值不重复计数、他人不受影响；⑤ **留痕可跨实例重载**（新实例 `loadDefects()` 后强制仍生效）＋ 无 fs 时具名降级；⑥ 第二人缺陷 append-only 且两人都被强制；⑦ 读面纯、计数一致；⑧ `formal.status().fidelity` 能显示登记册数字，且 **formal 面没有长出第 11 个方法**。

---

## D. 文档同步 ✓
- `docs/09-math-formalization.md`：§4 的持久化条目改为"跨进程独占创建 ✓／大结果引用 ⛔ 具名"；新增 **§4.2 C-45 忠实性缺陷 ⇒ 强制弃权**（判定点＝内核谓词、三动词、留痕、语义边界、closed-by）。
- `docs/15-math-computation-toolbox.md`：§14.4 的"跨进程独占创建"由 ⛔ 改 ✓（含 `wx`/`O_EXCL` 与降级语义）、"大结果引用"写明缺了会怎样与谁需要；§14.9 追加 C-45 与 **N3 核对结论**（mathtools 本就对齐，只补两处）。

---

## E. 原样命令 + 退出码（Round 3 全量定向）

```
node tests/vmu-mathjobs-exclusive.test.mjs      → === VMU MATHJOBS EXCLUSIVE: 5 passed, 0 failed ===      EXIT=0
node tests/vmu-fidelity-abstention.test.mjs     → === VMU FIDELITY ABSTENTION: 8 passed, 0 failed ===     EXIT=0
node tests/vmu-math-adapters.test.mjs           → === VMU MATH ADAPTERS: 20 passed, 0 failed ===          EXIT=0
node tests/vmu-mathjobs.test.mjs                → === VMU MATHJOBS: 10 passed, 0 failed ===               EXIT=0
node tests/vmu-mathjobs-persist.test.mjs        → === VMU MATHJOBS PERSIST: 17 passed, 0 failed ===       EXIT=0
node tests/vmu-lean.test.mjs                    → ALL GREEN  (passed=13, failed=0)                        EXIT=0
node tests/vmu-lean-jobs.test.mjs               → === VMU LEAN JOBS: 13 passed, 0 failed ===              EXIT=0
node tests/vmu-formal.test.mjs                  → === VMU FORMAL: 10 passed, 0 failed ===                 EXIT=0
node tests/vmu-formal-tool.test.mjs             → === FORMAL TOOL: 16 passed, 0 failed ===                EXIT=0
node tests/vmu-formal-pipeline.test.mjs         → === FORMAL PIPELINE: 14 passed, 0 failed ===            EXIT=0
node tests/vmu-mathtools.test.mjs               → === VMU MATHTOOLS: 208 passed, 0 failed ===             EXIT=0
node tests/vmu-mathtools-tool.test.mjs          → === MATHTools TOOL: 14 passed, 0 failed ===             EXIT=0
node tests/vmu-math.test.mjs                    → === VMU MATH: 27 passed, 0 failed ===                   EXIT=0
node tests/audit-vmu-orphan-methods.test.mjs    → === VMU ORPHAN-METHOD AUDIT: 4 passed, 0 failed ===     EXIT=0
node tests/audit-enforced-consistency.test.mjs  → 336 passed, 1 failed（findings=1 UNCOVERED-MODULE@paper.js）EXIT=1
node scripts/check-docs.mjs                     → vmu doc-lint: docs=29 issues=0 notes=24 / DOC LINT: PASS  EXIT=0
```

### E.1 那条唯一的红**不是我的**（已核实并具名）
`audit-enforced-consistency` 的 `findings=1 :: UNCOVERED-MODULE@paper.js` —— `kernel/paper.js`（**不在我的写范围**）在代码里提到 `enforced` 但该门的场景表里没有它的场景。**我名下五个提到 `enforced` 的模块都已覆盖**：`mathadapters`（`plan(no settings/seams)`）、`mathjobs`（`submit(computation=off)`）、`lean`（`recover(no fs seam)`）、`formal`（`check(no proof)`）、`fidelity`（`declareDefect(no note)`）——本轮我给后两个各加了一条**实测**场景（`refusal scenarios` 19 → 21）。请把 `paper.js` 交给它的 owner（或由 verify 按同法加一条场景）。
> 附注：`tests/vmu-mathtools.test.mjs` 本轮一度因 `settings/schema.js` 里 **`vmu.math.jobs.maxParallel` 声明两次**（`complementOk` 的 `planned+wired===declared` 差 1）而红；该键不归我（Round 3 第 5 项由 core 收敛），现core 已修，**复跑 208/0 全绿**。

---

## F. 未做项（具名）
| # | 未做 | 为什么／去处 |
|---|---|---|
| 1 | **大结果内容寻址引用**（`Math/Results/<sha256>` ＋ 回执 `resultRef`） | 与 v5r 同缺；已在 `docs/09 §4`／`docs/15 §14.4` 写明"缺了会怎样、谁需要"。要做得先定"截断阈值/保留策略/跨机可达性"三条策略（属 pack 层决策）。 |
| 2 | 宿主侧 `fs.writeTextExclusive` 的**真实装配** | **vmu-core 已落 `host-math.js` 的 `writeTextExclusive(rel,text)`**（`writeFileSync(...,{flag:'wx'})`；已存在 ⇒ 抛 `EEXIST`；路径仍走同一 `under()` 策略；`node --check host-math.js` exit 0）。我这边就近读 `opts.fs.writeTextExclusive` ⇒ **无需任何开关**；剩下的只是把它从 host 传进 `createJobMirror` 的 `fs` 接缝（core 侧一行）。**C-45 接线单已发 core**：服务 `vmu.fidelity`（`createFidelityRegistry`，`kernel/fidelity.js:44`）＋ 建议工具面 `vibe_vmu_fidelity`（门控用**既有键** `vmu.math.formalVerify ∈ {encourage,require}`，**零新设置键**）＋ **零新错误码**；时钟保持 core 现在传的 raw clock（我的面只需 `()=>number`，`status()/admission()` 不读钟）。 |
| 3 | **表决面调用 `applyAbstention`** | C-45 的 closed-by；`kernel/ballot*.js` 不是我的文件。强制点已就绪且可测（`node tests/vmu-fidelity-abstention.test.mjs`）。 |
| 4 | `tools/*.js` 的 action 枚举 | `tools/formal.js` 不在我写范围；C-45 刻意做成独立服务（`vmu.fidelity`）⇒ 若 core 要给它工具面，新增一个 action 集即可，不会与 `vibe_vmu_formal` 的 10 个冲突。工具文件 `tools/fidelity.js` 默认由 core 按我给的枚举写（`action ∈ declareDefect|abstentionFor|applyAbstention|loadDefects|view|status`；`declareDefect` 的 `by` 由工具层用 caller 填）；若 Lead 划给我，我照 `tools/mathtools.js` 的形状补上并自带"enum ↔ 服务方法 one-for-one"断言。 |
