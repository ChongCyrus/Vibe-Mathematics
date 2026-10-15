# vmu 交接 · Round 8 · task-60 报告（pack 保真：6 类两代差异）

- 任务：`task-60`（vmu-pack）· 主交付：本报告 ＋ `docs/10 §4.6`
- 纪律：未跑全量 sweep、未 `regen-all`、未 git；临时文件 `D:\_tmp`；**读者未落地不写默认值**、**不臆造常量**。
- 写范围限制：schema（`settings/**`）与 `kernel/paper.js` 归 vmu-core ⇒ 优先项与 5 类的**键位/值域**改动我**只给精确规格 + 判据**，**未代改**。

---

## A. **优先项（真缺陷）：`paperEditor:'academician'` 的静默回落** · 已定位、已给修法、pack 侧已闭合

### A.1 缺陷已**实测复现**（不是推断）
探针 `node D:\_tmp\vmu-finalizer-fallback-probe.mjs`（仓库外一次性·实测，exit 0）：
```
reader domain (kernel/paper.js FINALIZERS): ["editor","contributor","any"]
started: {"paperId":"paper-1","editor":"acad"}
vmu.paper.finalizer = 'academician'  →  finalize 被拒：VMU_NOT_PERMITTED
   "only the editor (acad) may finalise, not someone-else"
```
⇒ 域外值（v5r `:1167` 的 `paperEditor: 'academician'`）被**静默回落**成 `'editor'`：**声明既没生效、也没报错**。两条注入路径都通：**(a) pack data 层**（清单/`defaults.json` 绕过设置边界）、**(b) `vibe_vmu_set`**（schema 把它声明成 `type:'string'`，不拦）。
根因（file:line）：`settings/schema.js:1234`（`type:'string'`）＋ `kernel/paper.js:104-107`（`FINALIZERS.indexOf(raw) === -1 ? 'editor' : raw`）。

### A.2 为什么**不**选"扩值域纳入 `academician`"
v5r 的 `paperEditor` 命名的是**机构角色**（院士）；`vmu.paper.finalizer` 是**权限规则**（editor／contributor／any）。让内核认识 "academician" **违反 D5**（内核永不学习机构角色名——角色是不透明 slot，见 `packs/v5r/prompts/v5r-core.js` 的 `slots`）。

### A.3 选定修法（**让"声明了没生效"变成"具名拒"**）· 已把精确补丁交 vmu-core
1. `settings/schema.js:1234` → `type:'enum', domain:['editor','contributor','any']`（运行期 `set` 域外值**具名拒**）；
2. `kernel/paper.js:104-107` → 回落改**具名拒**（`VMU_INVALID_ARGUMENT`，列出域；提示里写明 v5r 的 `paperEditor` 是**角色**、vmu 的等价是 `finalizer=editor` ＋ 创建时指定 editor）。
   ⇒ 修完后 **pack data 层**的域外值也拦得住，**不再有静默回落**。

### A.4 pack 侧结论（我的写范围，已闭合）
- **v5r 的等价表达**：`vmu.paper.finalizer='editor'`（**框架默认**，无需声明）＋ **创建 paper 时把 `editor` 设为主持人**（v5r 的"院士终稿"＝院士就是 editor）⇒ **本 pack 不声明 `finalizer`**（今天也没有任何静默降级在发生）。
- **值域门禁（新探针，可复跑）**：`node D:\_tmp\vmu-pack-value-domain.mjs` → **exit 0 / PASS**：pack 声明的 **9 个 enum 键值全在各自域内**（`replyCatalogue=compact`、`deviationPolicy=record`、`human.onTimeout=hold`、`math.jobs.recover=on-load`、`meetings.tier=formal`、`paper.officeConsult=required`／`On=finalize`／`OnTimeout=hold`、`meetings.quorumRule=m-unanimous`），且**未声明 `vmu.paper.finalizer`**。⇒ 这一类"域外值静默降级"**在 pack 侧为 0**。
- 文档：`docs/10 §4.6`（缺陷、证据、D5 理由、修法、v5r 等价表达、门禁读数）。

## B. 其余 5 类：逐条处置（**能表达就落；不能就具名＋改判条件**）

| # | v5r 参数（出处） | v5r 值 | 框架现状 | 处置 / 改判条件 |
|---|---|---|---|---|
| B1 | `compactThreshold`／`compactAfterRounds`（`:1078/1079`） | 66（%）／8（轮） | **无键**（`vmu.memory.compactionEveryMs` 是记忆面周期，语义不同） | **具名**。建议键位（已交 core）：`vmu.prompt.compactThreshold`(natural/66)／`vmu.prompt.compactAfterRounds`(natural/8)，读点＝上下文核算/压缩决策（`kernel/metrics.js` 或 prompt 装配）。**读点落地后我随即声明 66/8** |
| B2 | `finalPaper`／`paperFormat`／`paperLanguage`／`paperCompilePdf`（`:1163-1166`） | true／'both'／'zh'／true | **无键**（交付走 `kernel/publication.js`＋引擎三面门；`vmu.math.compileTimeoutMs` 是超时，不是开关） | **具名**。建议键位：`vmu.paper.finalPaper`(boolean/true)、`vmu.paper.format`(enum `both\|md\|tex`)、`vmu.paper.language`(enum `zh\|en`)、`vmu.paper.compilePdf`(boolean/true)，读点＝publication 的终稿/编译路径 |
| B3 | `maxTempPerMember`（`:1075`） | 3 | **无键**（pack 的 `slots` 只表达 `maxTempTotal=12`） | **具名**。建议 `vmu.members.maxTempPerMember`(natural/3)，读点＝`kernel/members.js`／`recruit.js` 的临时工编制检查 |
| B4 | `memberMayRejectAssign`（`:1066`） | true | **无键**（`vmu.workflow.requireAssignee` 是"阶段推进须有负责人"，语义不同） | **具名**。建议 `vmu.tasks.memberMayRejectAssign`(boolean/true)，读点＝`kernel/tasks.js` 的 assign 路径 |
| B5 | `stallAutoMeetingMs`（`:1083`） | 360000（静止即**自动开会**） | `vmu.control.idleAction` 域＝`['notice','recess','none']`，且 `control.js:204-220` 的 `idleState()` **永远 `recessed:false`**（该面结构上不能开会） | **有意分歧（R1）⇒ 不声明，且不许臆造 `'auto-meeting'`**（域外值同样会被静默回落成 `'notice'`）。**改判条件**：core 若加一个**已登记钩子 `control/idle`**（`idleState()` 判为 idle 时 emit），pack 的 M2 中间件就能实现"静止 ⇒ 开会"——这是既不违反 R1、又能复现 v5r 的唯一形状（已建议给 core） |

**共同判据**：5 类**都没有读者** ⇒ 按纪律**一行默认值都不写**（写了就是"声明了没人读"）。每类的**改判条件**已写明"加哪个键＋哪个读点"，落地后我按 v5r 值（66／8／true／both／zh／true／3／true）声明并复跑探针。

---

## 验证（原样命令 + 退出码）

工作目录 `Vibe-Mathematics`。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node D:\_tmp\vmu-finalizer-fallback-probe.mjs`（仓库外一次性探针·实测） | 0 | **缺陷复现**：域外值 `'academician'` ⇒ `VMU_NOT_PERMITTED`（走了 `editor` 规则），**无任何"值不合法"的报错** |
| `node D:\_tmp\vmu-pack-value-domain.mjs`（仓库外一次性探针·实测） | 0 | **PASS**：9 个 enum 键值全在域内；未声明 `vmu.paper.finalizer` |
| `node D:\_tmp\vmu-pack-defaults-vs-schema.mjs`（仓库外一次性探针·实测） | 0 | `undeclared=0`（35 键） |
| `node tests/vmu-pack.test.mjs` | 0 | 53 passed, 0 failed |
| `node tests/vmu-paper.test.mjs` | 0 | 37 passed, 0 failed |
| `node tests/audit-pack-face.test.mjs` | 0 | 5 passed, 0 failed |
| `node tests/vmu-settings.test.mjs` | 0 | 47 passed, 0 failed |
| `node tests/vmu-planned-settings.test.mjs` | 0 | **ALL GREEN（planned=113, docs=27, 39/0）** |
| `node tests/vmu-round1-seams.test.mjs` | 0 | 40 passed, 0 failed（verify 已按 R7 修法落地） |
| `node scripts/check-docs.mjs` | 0 | **DOC LINT: PASS**（`docs=29 issues=0`） |
| `node scripts/audit-hook-emit-classification.mjs` | 0 | 7 passed, 0 failed |

## 未做项 / 待他人

1. **A.3 的两处补丁**（schema enum ＋ `paper.js` 具名拒）⇒ **vmu-core**；落完后我会复跑 `vmu-finalizer-fallback-probe` 期望看到 `VMU_INVALID_ARGUMENT`（改判条件）。
2. **B1–B4 的键＋读点** ⇒ vmu-core；落地后我声明 v5r 值并复跑探针。
3. **B5 的 `control/idle` 钩子** ⇒ vmu-core（若采纳，我在 pack 加一个 M2 中间件实现"静止 ⇒ 开会"，值 360000 出自 `:1083`）。
4. 结论回填矩阵 §9.5（两代差异清单）⇒ vmu-verify（依据＝本报告 §A/§B）。
