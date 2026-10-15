# Round 19 · task-121 · ① `threshold` 自主开火（边界 tick 带真指标）✅ 已落并已证 ／ ② 数学作业中间检查点接缝 ❌ **未开工（具名）**

**一句话**：① 的根因就是「**框架没把真指标交给边界 tick**」——已按正确方向修好（**没有**放宽 `thresholdMet()`），并拿到「**同部署对照**」证据：达线的报告**无人要求、自己在回合边界开火**，未达的**全程沉默**；② 我**一行未写**（理由与设计见 §6，按纪律"做不完就具名，不留半成品"）。**另在取证途中发现一条新缺陷**（`config.packs` 传内联 manifest 会抛 `ERR_INVALID_ARG_TYPE`），它是 ① 的 pack 侧生产者路径的堵点（§5）。

- 状态：**①已落／已证／已常驻守卫；②未开工（具名）；docs 未改（具名）；真机 DSH 会话未跑（具名，§5）**
- 纪律：结构性编辑均"一次替换内完成"并**立刻核文件内容**；每步跑**加载内核**的套件；`kernel/meetings.js` **一个字未碰**（它 1199/1200）；未跑全量（T0/T1 归 Lead）／未 `regen-all`／未 git；临时文件仅在 `D:\_tmp`；新文件已**双登记**（§7）。

---

## 0. 核验行：我读的是哪一版 / 哪一次运行

| 项 | 值 |
|---|---|
| HEAD | `3d93aee`（`git rev-parse --short HEAD`），分支 `main`，**我未 commit／push** |
| 我改动的文件 | `vibe-math-vmu/kernel/index.js`（`C5EB62E66B8395CB`，2254 行）、`vibe-math-vmu/vibe-math-vmu.js`（`9E43BED291B93334`，941 行）、`package.json`（+1 行）、**新增** `tests/vmu-report-boundary-metrics.test.mjs`（`BA2271322EC20F52`） |
| ★ **我【没有】碰的文件** | **`vibe-math-vmu/kernel/report.js`（`DF8317A7C98F8ECE` ＝ HEAD 原样）** ⇒ 红线"不许把缺指标放宽成就算成立"**可用哈希证明**：`thresholdMet()` 与 `tick()` 一字未改。★ **行数口径**：我记 **570**（`Get-Content .Count`），`vmu-verify2` 记 **571**（`split('\n').length`）—— 差的那 1 是**末尾换行**产生的空元素，**不是矛盾**；两者结论相同。★ 独立复核另证：`git show HEAD:vibe-math-vmu/kernel/report.js` 与磁盘**逐字节相同** |
| 未碰 | `kernel/meetings.js`（1199/1200）、`kernel/mathjobs.js`（② 未开工）、`docs/21`、`docs/05`、`packs/**`、`scripts/**` |

---

## 1. ① 复现：`threshold` 确实不会自主开火（两层证据）

**（a）R18 的真机会话（既有，非我跑的）**：`docs/22-academic-operations.md:1190`，会话 `session-7105ed8b-3e6b-4300-9845-00995baadbb3`，剧本**去掉 `report/tick` 步骤** ⇒ 宿主 stdout **有** `turn-end-duty`（`kind:'event'`）的 sink 行、**没有** `artifacts-threshold`（`kind:'threshold'`）的行。根因链：`vibe-math-vmu.js:646` 桥出的 `tick({event:'turn-end'})` 不带 `metrics` ⇒ `kernel/report.js` 的 `thresholdMet()` 在 `!metrics || typeof metrics !== 'object'` 时 **直接 `return false`**（`:331-333`）。

**（b）我自己的复现（真装配，原样回执）**——`node D:\_tmp\vmu-r19-boundary-metrics.mjs` §2：
```
§2 REPRODUCTION — `tick({event:"turn-end"})` WITHOUT metrics, i.e. exactly what the boundary used to send
   fired with no metrics = ["turn-end-duty"]
```
⇒ 事件触发器照常开火（证明边界本身是工作的），**达线阈值不开火**。这是"测到的否定侧"，不是推断。

---

## 2. ① 修法：**只**在框架侧"把真指标交出去"，判定与投递仍归既有报告面

三处定点编辑（每处一次替换、编辑后立刻 grep 核内容）：

| # | 文件:行 | 内容 |
|---|---|---|
| 1 | `kernel/index.js:693-736`（新 `const metricValues` 在 **:715**） | 新读法 `metricValues({ window = null, agg = 'sum' })`：**只读** `vmu.metrics` 的 `snapshot()`，把 `indicators[]` 拍平为 `{指标名 → 一个数}`。★ **无观测的指标【不出现】在 map 里**（`Number(r.count) > 0` 才收）⇒ 绝不伪造 `0`，报告面那边继续给出它自己的诚实答案 |
| 2 | `kernel/index.js:1360-1366` | `middlewareServiceCatalog()` 新增 `'vmu.metrics': metrics` —— 此前该面**被建出来、被注册，却没进能力门控目录**，任何 pack/政策都**无法计数**；这条是"框架给能力、政策决定计什么/何时计"的框架那一半 |
| 3 | `kernel/index.js:1566` | kernel 门面暴露 `metricValues`（方法，非 getter：它带参数） |
| 4 | `vibe-math-vmu.js:646-657` | 边界监听器改为先把 `kernel.metricValues()` 读出来，再 `tick({ at, event:'turn-end', metrics: metricsOf })`；`try/catch` 保留（报告永远不能弄坏产生它的那个回合） |

★ **`thresholdMet()` / `tick()` 一行未改**（哈希见 §0）——"没数据"仍然**不是**"就算成立"。

---

## 3. ① 证据：真装配上的「同部署对照」（这是反例能红的那一条）

`node D:\_tmp\vmu-r19-boundary-metrics.mjs` ⇒ **`=== VMU R19 BOUNDARY METRICS: 15 passed, 0 failed ===`，exit=0**（真 entry `apply()` ＋ 真 loader；`agent/turn-stopping` 监听器由 entry 自己注册，探针**只发宿主事件、从不调 `report/tick`**）：

```
§3 NO OBSERVATION ⇒ NO KEY
   metricValues() with 0 observations = {} ; snapshot.indicators = [{"name":"artifacts","count":0}]
§4 THE POLICY RECORDS REAL COUNTS
   metricValues() after 5 observations = {"artifacts":5}
§5 THE BOUNDARY FIRES BY ITSELF
   delivered by the boundary: ["artifacts-met","turn-end-duty"]
   its text: "ABOVE: artifacts=5 gte 5"
§6 WHOLE-RUN ACCOUNTING
   sink = ["turn-end-duty","turn-end-duty","artifacts-met","turn-end-duty"]
```

**同一部署里两份阈值报告**（`artifacts-met` = `gte 5`、`artifacts-unmet` = `gte 50`）：
- **已达的自开火**：`artifacts-met` 在边界被投递**恰一次**，文案里带**真实值 5**（不是占位符/undefined）；
- **未达的保持沉默**：`artifacts-unmet` **全程 0 次**（整轮 sink 里根本不出现）；
- 并且**没有数据时谁都不开火**（§3：`metricValues()` 为空、`snapshot` 里 `count:0`、传空 map 也不 due）—— 这条正是"不许把缺指标放宽成就算成立"的运行时证据。

---

## 4. ① 常驻守卫（能跑 ≠ 被守住）

新增 **`tests/vmu-report-boundary-metrics.test.mjs`**：`node tests/vmu-report-boundary-metrics.test.mjs` ⇒ **`=== VMU R19 BOUNDARY METRICS: 12 passed, 0 failed ===`，exit=0**。四段判据：
① 旧形状（无 metrics 的 tick）**仍不开火**（缺陷被复现，且没有被放宽）；② 已声明但从未观测的指标**在 map 里缺席**（红线）；③ 真观测 ⇒ **边界自己开火**（起的是**entry 自己注册的宿主事件**，不是测试手调的 `tick`）；④ ★ **同部署里未达线那份全程 0 次**（反例）。

**已跑的相关既有套件**（全部 exit=0）：`vmu-kernel 175/0`、`vmu-entry 150/0`、`vmu-assistant-report 93/0`、`audit-vmu-services 49/0`、`audit-surface-index 20/0`、`audit-module-coverage 6/0`、`audit-seam-reachability 17/0`、`audit-package-membership 29/0`。

---

## 5. 未做项（**具名**，不含半成品）

### 5.1 真机 DSH 会话（①）——**未跑**（任务要求的是它，我必须如实说）
R18 的配方**现成可复用**：隔离 home `D:\_tmp\r18-home`、workspace `D:\_tmp\r18-ws`、overlay `D:\_tmp\r18-overlay.yml`、provider `D:\_tmp\r17-provider.yml`、驱动 `scripts/dsh-drive.mjs`（attach 模式）。我**没有跑它**，原因不是环境缺失而是**生产者路径被一条真缺陷堵住**（下条）＋ 本轮上下文预算已用到需要交回。⇒ **① 的"自主开火"目前由真装配的宿主事件复现证明，尚未由真 DSH 会话证明**；这句区分必须保留（R18 只在 `docs/22:1205` 记过同样的两分法）。

### 5.2 ★ 取证途中发现的**新缺陷**：`config.packs` 传**内联 manifest** 会抛 `ERR_INVALID_ARG_TYPE`
entry 自己的注释（`vibe-math-vmu.js:716-718`）写着"`config.packs` **accepts either a shipped pack id … or an inline manifest**"，而实测：
```
$ node D:\_tmp\vmu-r19-policy-path.mjs
vmu: pack r19-counter-pack was not applied: ERR_INVALID_ARG_TYPE The "path" argument must be of type string. Received an instance of Object
…  §1 bus entries = []   host listeners = ["agent/turn-stopping"]
   （exit=1；5 条断言红）
```
⇒ **内联 manifest 走到某个 `path` 参数（字符串）时炸掉**，"inline manifest"这条路**当前不可用**。为什么它与 ① 有关：`vmu.middleware.entries` **只支持 INLINE `{on, handler}` 形状**，**模块形状（M2，能拿 `api.services`）必须经 `kernel/loader.toBusEntries()`**，而那条路只有 **pack manifest**（`kernel/pack.js:457-480` 写明："Adding such an entry straight to the bus would give it no `api` at all"）。⇒ 真机上"政策去计数"只能靠 **pack 里的 M2 模块**，而 pack 在内联 manifest 修好之前只有"仓库内 `packs/<id>/`"一条路，**`packs/**` 不在我的写范围**。**这条我未修**（它属 entry 的 pack 装载路径，牵动 `packLoader.apply` 与汇总路径）。
**已转出为 `task-125`（unowned）**：`vmu-verify2` **独立复现**（同一原样 message、`exit=1`、`2 passed 5 failed`）并把它归档为"第十三条类：声明了没实现"。★ **声明足迹**（verify2 量得）：`inline manifest` 一语出现在 **9 个文件／11 处**（`host.js`×3、`docs/10`×2、`docs/00/02/03/12/18/27` 各 1、`vibe-math-vmu.js`×1）—— 但**两方都只读过 `vibe-math-vmu.js:716-718` 这一处**并证实与运行时相反，**其余 10 处【未逐条读】⇒ 本报告不声称它们全是假声明**（该限定已写进 `task-125`，修好后需逐条核）。

### 5.3 文档（`docs/21` §新、`docs/05` 注）——**未改**
本轮的改动是行为＋一个新方法＋一条目录项；四个相关门禁（`audit-vmu-services`／`audit-surface-index`／`audit-module-coverage`／`audit-seam-reachability`）实测**全绿**，故**没有门禁强制文档**。而 `docs/21` 有编号节＋索引（§1–§19），追加 `## 20.` 有触碰索引类门禁的风险，我选择**不半改**。建议的文本（给 docs 属主）：
> **`docs/21` 新增一节**：回合边界的指标交递 —— `kernel/index.js` 的 `metricValues({window,agg})` 只读 `vmu.metrics` 快照并把**有观测**的指标拍平成 `{名→数}`（无观测者缺席，绝不伪造 0）；`vibe-math-vmu.js` 的 `agent/turn-stopping` 桥把它交给 `report.tick({metrics})`。⇒ `threshold` 报告与 `event`/`period` 一样**可自主开火**；`thresholdMet()` **未放宽**；"自动汇报"要分两层说（触发器会开火／无人要求也会开火）。
> **`docs/05` 一句话**：中间件模块经 `api.services.get('vmu.metrics')` 可**计数**（`vmu.metrics.indicators` 必须已声明该指标，否则该次观测被**具名跳过**并计数）。

### 5.4 ② 数学作业"中间检查点"接缝——**未开工**（§6）
### 5.5 内联中间件条目（`vmu.middleware.entries` 的模块形状）——**未改**（同上，属 pack/loader 路径）

---

## 6. ② 为什么我选择"具名"而不是"落一半"

**现状（一行核验，`kernel/mathjobs.js:993` 原文）**：
> `checkpointing: 'not-implemented: resumeFrom is CARRIED (request → env → mirror → recovery re-issue) but never interpreted; segment/checkpoint semantics are the ENGINE\'s (cost/design in docs/15 §14.4)'`

即：`resumeFrom` 被**原样搬运**（请求→env→镜像→恢复重发），**从不被解释** ⇒ **续算＝重跑整段**（正是任务描述的"唯一具名边界"）。

**要做完它需要的形状**（我的建议，供 Lead 排任务；**我未落笔**）：
1. **接缝（框架）**：作业可在**中间**落一个**可校验**的检查点 blob ⇒ `{ ok, checkpointId, sha256, at, offset/segment }`；**写什么/何时写/如何校验由 pack 决定**（框架只提供"落点＋校验回读"）；
2. **恢复**：`resumeFrom` 从"搬运"改为"**解释**" —— 校验 blob 后从**最近检查点**继续，**不重跑整段**；
3. **断言必须能区分"真的续"与"又从头跑了一遍"**：整段重跑会产生**可观测的重复副作用/计数**（例如引擎调用数、artifact 追加数、`counters.rangeRuns`）⇒ 断言两条路径的**计数不同**（这正是任务要求的"例如"）；
4. **不可续的引擎具名**：Lean 面（`kernel/lean.js`）若无法从中间态继续，必须**具名"该引擎不可续＋为什么"**，**不许**写"支持续算"。
**为什么不在本轮做**：它要动 63KB 的 `mathjobs.js` 的作业生命周期（admission→env→mirror→recovery→status），并在引擎面加能力声明；在本轮剩余预算下只能落成"半接线模块"，而 R10 的教训与本仓纪律都明确禁止那种形状。

---

## 7. 双登记与复现命令

```
# 双登记（新文件）：package.json files[] 已加（1 行 diff）
node D:\_tmp\r19-register-test.mjs  → inserted; JSON valid; files[] count=681; IN=true   exit=0
node tests/audit-package-membership.mjs → === PACKAGE MEMBERSHIP: 29 passed, 0 failed === exit=0
git diff --numstat package.json     → 1  0  package.json        # 只加一行，无重排
# （installer.js 的 preset 清单只托管 preset 文件：kernel/packs/docs/tools —— 既有任何 tests/* 都不在其中，故本测试不需进该清单）
```

原样命令＋退出码（全部在本轮当前树上跑）：

```
node D:\_tmp\vmu-r19-boundary-metrics.mjs      → === VMU R19 BOUNDARY METRICS: 15 passed, 0 failed ===  exit=0
node tests/vmu-report-boundary-metrics.test.mjs→ === VMU R19 BOUNDARY METRICS: 12 passed, 0 failed ===  exit=0
node D:\_tmp\vmu-r19-policy-path.mjs           → 红：内联 pack manifest 未被应用（ERR_INVALID_ARG_TYPE）    exit=1  ← §5.2 的复现
node tests/vmu-kernel.test.mjs                 → 175 passed, 0 failed     exit=0
node tests/vmu-entry.test.mjs                  → 150 passed, 0 failed     exit=0
node tests/vmu-assistant-report.test.mjs       →  93 passed, 0 failed     exit=0
node tests/audit-vmu-services.test.mjs         →  49 passed, 0 failed (80 registered)  exit=0
node tests/audit-surface-index.test.mjs        →  20 passed, 0 failed     exit=0
node tests/audit-module-coverage.test.mjs      →   6 passed, 0 failed     exit=0
node tests/audit-seam-reachability.test.mjs    →  17 passed, 0 failed     exit=0
node tests/audit-package-membership.mjs        →  29 passed, 0 failed     exit=0
```
（**未跑**）：`tests/run-tests.mjs` 全量、`scripts/regen-all.mjs`、任何 `git commit/push`；**未跑**真机 `dsh-drive`（§5.1）。

---

## 8. 给 Lead 的三点

1. **① 判定**：根因（框架没交指标）**已修**、`thresholdMet()` **未放宽**（哈希可证）、**同部署对照**已拿到（达线自开火／未达全程沉默／无数据谁都不开火）、已**常驻守卫**（12/0）。**请接受**；同时接受"**真机 DSH 会话未跑**"这句限定（§5.1）。
2. **§5.2 新缺陷**（`config.packs` 内联 manifest 抛 `ERR_INVALID_ARG_TYPE`，与 entry 自己的注释 `:716-718` 矛盾）**已转出为 `task-125`（unowned）**，含写范围（`vibe-math-vmu.js` ＋ 可能 `kernel/pack.js`）与"11 处声明足迹里其余 10 处**未逐条读**、不得声称全假"的限定。它是"① 的真机生产者"与任何"部署侧内联 pack"的堵点。
3. **② 未开工**：已转出为 **`task-122`（unowned）**，形状见 §6（框架给接缝、pack 定检查点语义、Lean 不可续要具名、断言要能区分续算与重跑）；我**没有**留半成品。

---

## 9. 独立复核（`vmu-verify2`，非我自证；本轮收尾）

- **§0 版本绑定 4/4 MATCH**：`kernel/index.js C5EB62E66B8395CB`／`vibe-math-vmu.js 9E43BED291B93334`／`kernel/report.js DF8317A7C98F8ECE`／`tests/vmu-report-boundary-metrics.test.mjs BA2271322EC20F52` —— 对方**独立算的哈希**，与我一致 ⇒ 定点编辑确在树上。
- **红线 哈希可证 ✓**：`git show HEAD:vibe-math-vmu/kernel/report.js` 与磁盘**逐字节相同**（`identical to HEAD: true`）。行数口径差 1（末尾换行）已按 §0 澄清。
- **新接线逐处对上**：`metricValues` 定义 **L715**、`'vmu.metrics'` 进目录 **L1366**、门面暴露 **L1566**、`vibe-math-vmu.js:646-657` **逐行一致**。
- **读数复跑（对方跑，全 exit=0）**：新套件 **12/0**、`vmu-assistant-report 93/0`、`audit-vmu-services 49/0（80 registered）`、`audit-surface-index 20/0`、`audit-package-membership 29/0`、`vmu-kernel 175/0`。
- **双登记复核 ✓**：新文件在 `package.json files[]`（`files total/distinct = 681/681`），且 **`installer.js` 里 `tests/…` 条目仍 = 0** ⇒ `tests/**` 永不进 `PRESETS` 的不变量未被破坏。
- **RULE E 指纹**：`audit-declaration-criterion` **88/0 exit 0**，**A 基线 `67=67`、多行 C2 基线 `files=57 baseline=57` 均未动**；我的新测试 107 行、`.every` 0 次、`filter().length===0` 0 次 ⇒ **一个 RULE E 指纹都没新增**（对方注明：一个独立作者的全新文件没触发 C2 的"新文件出现该形态 ⇒ 红"，是"合规新文件必须安静"的现场证据）。
- **对方明确保留、不替我声称的**：**真 DSH 会话未做** ⇒ ① 的"自主开火"目前**只有真装配的宿主事件证据**，`vmu-verify2` **不会**在矩阵里把它写成"真机已证"（与 §5.1 的分法一致）；`mathjobs` ② 未开工、`docs/21`／`docs/05` 未改，对方**无异议**。
