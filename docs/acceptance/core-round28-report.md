# Round 28 · task-147 · **A 已量准（＝11 处，不是"≥6"）** ／ ★ **B 的修点与硬约束冲突，先报再谈** ／ B–E 未落（具名）

**一句话**：共享 `oneOf` 的静默回落**实测就是 11 处**（`vmu-accept` 的"至少 6 处"是**下界**，不是结论），**全部在 `kernel/meetings.js`**；而本任务的**硬约束写着"`kernel/meetings.js` 1199/1200 别碰"** ⇒ ★ **B（按 R17 修读取侧具名拒）与硬约束直接冲突**：**修点就在那个不许碰、且只剩 1 行余量的文件里**。⇒ 我**先报冲突、不越线**，并把 A 的完整清点表与逐站点判定（含一处**必须再读一行才能定类**的判别点）交出来。

## 0. 核验行（本轮只读，未改任何文件）

| 项 | 值 |
|---|---|
| HEAD | `cfbd2c7` 之后由 Lead 提交过若干次；**我本轮未 commit／push、未写任何仓库文件** |
| 搜索面 | `vibe-math-vmu/*.js`、`kernel/*.js`、`kernel/*/*.js`、`packs/*/*.js`、`packs/*/*/*.js`（按**语义**取 `oneOf(`，非按名字猜） |
| 命中 | **11** 处，**全部** `kernel/meetings.js`；**helper 定义在同文件 `:128`** |
| helper 语义（逐字） | `:128` `const oneOf = (v, set, def) => (set.includes(v) ? v : def)` ⇒ ★ **静默回落**（域外值 ⇒ 默认值，无任何拒绝） |
| 我未做的 | `settings/schema.js` 的生成链门槛（E）、任何修改、任何真机 |

## 1. A：完整清点表（11/11，逐条读到实参）

| # | file:line | 护的键（实参） | 选项集（实参） | `schema.js` 声明 | 判定类别 |
|---|---|---|---|---|---|
| 1 | `kernel/meetings.js:136` | `vmu.meetings.tier` | `['formal','light']` | **`type:'enum'` ＋ `domain:['formal','light']`**（`schema.js:1011`） | **待定（见 §2 判别点）** |
| 2 | `kernel/meetings.js:138` | `vmu.meetings.attendanceMode` | `['roster','signin','quorum-only']` | `type:'string'`，**无 `domain`**（`schema.js:1211`） | **(i) 真缺陷** |
| 3 | `kernel/meetings.js:147` | `vmu.meetings.quorumLossPolicy` | `['suspend','continue','recess']` | `type:'string'`，**无 `domain`**（`schema.js:1238`） | **(i) 真缺陷** |
| 4 | `kernel/meetings.js:154` | `vmu.meetings.budgetOnExceed` | `['refuse','warn','extend']` | `type:'string'`，**无 `domain`**（`schema.js:1212`） | **(i) 真缺陷** |
| 5 | `kernel/meetings.js:171` | `vmu.meetings.leaveEarlyPolicy` | `['allow','note','deny']` | `type:'string'`，**无 `domain`**（`schema.js:1231`） | **(i) 真缺陷** |
| 6 | `kernel/meetings.js:173` | `vmu.meetings.minutesDetail` | `['brief','full']` | `type:'string'`，**无 `domain`**（`schema.js:1235`） | **(i) 真缺陷** |
| 7 | `kernel/meetings.js:178` | `vmu.meetings.appealScope` | `['all','procedural','none']` | `type:'string'`，**无 `domain`**（`schema.js:1210`） | **(i) 真缺陷** |
| 8 | `kernel/meetings.js:184` | `vmu.meetings.leaveApprover` | `['chair','office']` | **`type:'enum'` ＋ `domain:['chair','office']`**（`schema.js:1021`） | **待定（同 §2）** |
| 9 | `kernel/meetings.js:185` | `vmu.meetings.confidentialityDefault` | `['public','internal','restricted']` | `type:'string'`，**无 `domain`**（`schema.js:1220`） | **(i) 真缺陷** |
| 10 | `kernel/meetings.js:186` | `vmu.meetings.confidentialityQuotePolicy` | `['allow','redact','deny']` | `type:'string'`，**无 `domain`**（`schema.js:1221`） | **(i) 真缺陷** |
| 11 | `kernel/meetings.js:188` | `vmu.meetings.wakeFailurePolicy` | `['refuse','skip','retry']` | `type:'string'`，**无 `domain`**（`schema.js:1253`） | **(i) 真缺陷** |

★ **计数结论**：**11 处**（`vmu-accept` 的"至少 6 处"是**下界**，实测翻倍）；**`vmu.meetings.orderMode` 已不在其中** ⇒ 与"R17 已修那一处"自洽 ✓。★ **另有 9 处键的 `domain` 缺失**（`schema.js` 的 9 行仍是 `type:'string'` ＋ 文档"已接线（meetings.js 读取）；默认值取自模块源码"）——**这与 R17 修前的形态逐字同型**。

## 2. ★ 逐站点判定：9 处 (i)、2 处**待定**（判别点只差一行，我**不猜**）

- **9 处 = (i) 真缺陷**（#2–7、9–11）：**读取侧静默回落**（`:128` 无拒绝）**且 schema 连域都没声明**（`type:'string'` 无 `domain`）⇒ 部署可以写任意字符串、被静默变成默认值，而**状态字段会报出部署从未声明的值**（R17 已证的同形状）。
- ~~**2 处 = 待定**~~ ⇒ ★ **已定类：(i)**（#1 `tier`、#8 `leaveApprover`）—— 见 §2bis 的实测。⇒ **11/11 全部 (i)**，本任务**没有 (ii)/(iii) 站点**。

## 2bis. ★★ 判别点已读：`config.vmu` 通道**不拒**域外值 ⇒ 那两处也是 (i)；并挖出一条**更上位**的发现

**`vmu-verify2` 的真入口实测（投入域外值，走 `config.vmu` 通道）**：
```
vmu.meetings.tier          => LOADED（无拒绝）  source="config"
vmu.meetings.leaveApprover => LOADED（无拒绝）  source="config"
vmu.meetings.orderMode     => REFUSED VMU_INVALID_ARGUMENT …outside the declared domain fifo|round-robin|chair|random   ← 对照
```
⇒ **`config.vmu` 不执法 `domain`**；**唯一真正生效的执法点在读取侧**（`orderMode` 有 `strictOrderMode` 故拒；`tier`/`leaveApprover` 读取侧仍是 `oneOf` ⇒ **静默夹取仍活**）⇒ **判 (i)**。
★ **修法模板**：`kernel/meetingmarker.js:296` 的 `strictOrderMode` —— 其注释自称 "**the twin of `oneOf` (meetings.js:128)**"。
★ **它具名的未观察项（我原样带上，不得升级）**：**没有端到端观察到"域外值被静默替换成默认值"的用户可见后果**（`status().settings[key]` 取回 `undefined` 是**它的观测点没取到值**，不等于"值不存在"）⇒ 该结论由 **`oneOf` 的代码语义**（非成员一律回 `def`）＋"**通道不拒**"的实测**共同**支撑，**不得写成"已观察到后果"**。

**★★ 更上位的新发现（verify2 建议单独派单；★ 不得塞进 task-147）**：**`settings/schema.js` 的 `type`/`domain` 在运行时【没有任何执行点】**：
- `validateValue`（`schema.js:1459`；`enum` 分支 `:1467`）**唯一调用者**是 `resolveSettings`（`:1558`／调用在 `:1566`）；
- 而 **`resolveSettings` 在包内运行时【无调用者】**（全量 grep `vibe-math-vmu/**` 只命中它自己的定义；`tests/**` 不在该次 grep 内 ⇒ 若测试拿它当 oracle 不影响结论）；
- **泛化实测**（远离 meetings 的 enum 键）：`vmu.budget.onExceed`／`vmu.compat.unknownCombo`／`vmu.quota.onExceed` 的域外值经 `config.vmu` **全部 LOADED（无拒绝）** ⇒ ★ **不是 meetings 的问题，是"声明无人执行"**。
⇒ **对本任务的直接含义（已被实测支撑）**：**给 9 个键补 `schema` 的 `domain` 只完成"声明"**（而声明不执法已证）；**真修在读取侧具名拒**。★ 若目标要的是"**域外值根本进不来**"，那需要在 **config 通道另立执法点**（给 `resolveSettings`／合并路径**接上一个真正的调用点**）—— **那是比 task-147 更大的裁决**，我只具名上报，**不偷偷塞进本任务**。
★ **verify2 给的记账判据我接受**：**若最终只落"补 schema 声明"，报告必须写明"这不构成修复"**（否则那条洞会被记成已修）。

## 3. ★★ B 的修点与硬约束冲突（**先报，不越线**）

任务硬约束逐字：**"`kernel/meetings.js` 1199/1200 别碰"**；而 **B 要求的"读取侧具名拒"就在那个文件的 `:128`（helper）+ 11 个调用点**。⇒ 两条互斥：
1. **碰它 ＝ 违反硬约束**；**不碰它 ＝ 修不了读取侧**（`schema.js` 只能加 `domain`，那**只是把"域外值"从"无人知道"变成"schema 知道"，静默回落仍在**——★ 且若 §2 的判别点结论是"配置通道不拒"，**只改 schema 等于没修**）。
2. **行数也不允许**：`meetings.js` 记为 **1199/1200**（我本轮未重测）⇒ 给 11 个站点加具名拒**必然越限** ⇒ 任何真修法**都必须先把读取侧的 `oneOf`／拒绝语义**抽到别的模块**（本仓先例：`kernel/meetingmarker.js` 是 R11/R12 从 `meetings.js` 抽出来的同型处置）。
⇒ **需要 Lead 裁决**（我给出选项，不选）：
- **(甲)** 授权我在 `kernel/meetings.js` 上做**一次原子抽取**（helper ＋ 11 调用点 → 新模块，`meetings.js` 净减行）＋ 随后按 R17 修；**代价**：那是我这几轮被明确禁止的文件，且抽取是结构性编辑（本仓要求原子＋每步跑加载内核的套件）。
- **(乙)** 把读取侧修理**派给另一个任务/另一个写者**，我只交 A（本表）＋ §2 判别点结论 ＋ `schema.js` 的 9 处 `domain` 声明（若 Lead 认为"只加 domain"这一步**独立有意义**——但按 R17 的口径，**它不是修**，我不建议单独落）。
- **(丙)** 只落"**不许一把梭**"能落的部分：**先定 §2 那 2 处**＋把 9 处的 `domain` 与**具名拒**作为**同一批**、连同抽取一起排。

## 4. 未做项（**具名**）

1. **§2 的判别点**（`type:'enum'` 的 `domain` 是否在所有通道拒绝）—— **未读**（预算用尽）。
2. **B 的 9 处修复 ＋ D 的断言 ＋ E 的门槛** —— **未落**，原因是 §3 的冲突未裁（**不做半截**：只加 `domain` 不叫修，且会造出"schema 说有域、实现仍在回落"的新不一致）。
3. 本轮**未改任何仓库文件**（只读清点）。

## 5. 结论

**A 交付**：`oneOf` 静默回落**实测 11 处**（不是 ≥6），全部 `kernel/meetings.js`；其中 **9 处连 `domain` 都没有**（与 R17 修前逐字同型），**2 处已 `enum+domain` 但读取侧仍回落**（待一行判别）。★ **B 与硬约束冲突（文件禁改 ＋ 行数 1199/1200）⇒ 需 Lead 裁决甲/乙/丙**；我**未越线**、未做半截。真机未跑、结论未声称；未跑全量／`regen-all`／git。
