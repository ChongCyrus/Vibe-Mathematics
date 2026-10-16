# 逐键裁定台账 · **118 个"声明了却无人读"的设置键**（task-217，★ 只分析、不改代码）

> ★ 交付物＝本文件（唯一写的文件）。★ 作者＝`vmu-verify2`（独立复核／裁定建议，**不是**最终裁决）。
> ★ 数据来源（**我自己的读数，与 Lead 的清单逐项吻合**）：权威键集＝`settings/schema.js` 的 `SETTING_DEFS`（**1228 键**）；判据＝`scripts/generate-vmu-settings-table.mjs` 导出的 `hasConsumer` / `verdictOf`。
> ★ 绑版本：`settings/schema.js` sha16 **`4437D125BEF16D19`**（1752 行，★ 有兄弟正在改它 ⇒ 若哈希变了，本台账的机械列须重跑）；`settings/planned.js` sha16 **`4DE5213FFC43FE0F`**（129 行）。
> ★ 本轮**未改任何代码**；未跑 git；未跑 T1／全量门禁；临时件在 `D:\_tmp\t217`。

## 0. 我复算的读数（与 Lead 的清单逐字吻合 ✓）

| 项 | 我的读数 |
|---|---|
| 权威键数 | **1228** ✓ |
| **声明了但无消费者** | **118 键 ／ 41 域** ✓ |
| 生成器分桶 | **113 "未接线" ＋ 5 "未判定"** ⇒ 118 = 113+5 ✓ |
| 5 个"未判定" | `vmu.turn.objective`／`vmu.turn.selfCheck`／`vmu.turn.feedback`／`vmu.pointer.propagation`／`vmu.turn.instituteName`（★ **绝不按死键处置**，见 §3） |

## 1. ★★ 先说一件会决定全部裁定的结构事实（我读源码得到的，非推测）

★★ **先更正我自己上一版的一句话**：我最初写"这 118 键整体就是 `PLANNED_DEFS`" —— ★ **那是错的，我已复算并改正**：118 键是 **93 个 `planned` ＋ 25 个 CORE（手写）** 的**并集**（`PLANNED_DEFS` 共 111 键，其中 93 个无消费者；另有 18 个 planned 键**是被读的**）。★ 请按修正后的口径读本节（§0 的计数不受影响）✓

★★ **但大头确实是 `PLANNED_DEFS`**：
- `settings/planned.js:1-8`（逐字）：**"GENERATED FILE — DO NOT EDIT BY HAND. … Every entry below is DECLARED IN THE DOCS and NOT WIRED to runtime code: type "planned", def null. `settings/schema.js` composes `SETTING_DEFS = [...core, ...PLANNED_DEFS]` so the docs audit can tell "planned" apart from "invented"…"**；
- 每条都带 **`planned: true`**、**`def: null`**、**`volumes: ["21"]`**（**哪些设计卷声明了它**，可多卷）与 `doc`（首个声明卷）；
- `scripts/generate-planned-settings.mjs:2,10-14,17-19`（逐字）：**"docs（single source of truth）⇒ planned key registry"**、**"`--write` rewrite `settings/planned.js` from the docs"**、**"`--check` fail … if the file is not exactly what the docs yield"**；
- 有**常驻门**在守它：`tests/audit-doc-planned-claims.mjs`（96 行，规则见 `:6-8`：文档里同时出现键名与"未实现／未接线／planned／规划"的宣称，若生成表把它标成 **✅ 已接线** 就是**活缺陷**）+ `tests/audit-vmu-docs.test.mjs` group G（文档里的 `vmu.*` 名必须在 schema 里存在）。

⇒ ★★ **因此"删键"的正确杠杆不是改 schema**：`planned.js` 是**生成物**，`--check` 会让手改失败、`--write` 会把手改**改回来**。★ **本台账里 DELETE 的含义统一是**：**撤回【声明该键的设计卷】里那条设计宣称**（然后由生成器把键从镜像里去掉）✓；★ **WIRE 的含义统一是**：**在点名模块里真的读它**（★ 且**必须同步**把设计卷里"未实现／规划"的措辞改掉 —— 否则 `audit-doc-planned-claims` 的规则正好会把它判成**活缺陷**：表已接线、卷还说未实现）✓。

★ **这不是推翻 Lead 的判据**：★ "找不到可能消费者的功能不进内核"依然成立 ⇒ 118 键仍要**逐键二选一**；★ 我只把**杠杆**指准（**卷**而不是生成物），否则 118 条裁定会全部落空 ✓。

## 2. 裁定汇总（★ 分批可处置；本节的数字以 §4 的逐键表为准，边写边更新）

| 裁定 | 键数 | 含义（本台账口径） |
|---|---|---|
| **WIRE** | 见 §4 | 在点名的模块里真的读它（并同步改设计卷措辞） |
| **DELETE** | 见 §4 | 撤回**设计卷**里的该条宣称（生成器物，勿手改） |
| **UNDECIDED** | 见 §4 | 判不了 ⇒ 具名阻碍（★ 不硬判） |

★ 每域的计数见 §4 各小节标题；★ 118 键**恰好各出现一次**（§5 有校验）。

## 3. ★★ 5 个"未判定"键（生成器自陈：可能走动态读取，静态看不见 ≠ 没有）—— **绝不按死键处置**

★ 以下 5 键**一律不判 DELETE** ✓。★ **它们的权威裁定行在 §4**（每条恰好一次）；本节只解释为什么不能当死键，★ 故**不再列表格**（否则同一键会出现两次、破坏"恰好一次"）：
- `vmu.turn.objective`（默认 `"（尚未设定）"`）：非空默认 ＋ packs/docs/tests 引用 4/4/4；**原始 v5r 的 `problem.statement` 就是它** ⇒ 属"任务目标"这种必然有消费者的语义 ⇒ 我的裁定 **WIRE**（读在 `kernel/turn/index.js` 的轮次上下文；packs 已有 `{{ setting:vmu.turn.objective }}`）。
- `vmu.turn.selfCheck`（`true`）：非空默认；`turn` 是已实现子系统（`kernel/turn/index.js`、`tools/turn.js`）⇒ **WIRE**（其自检分支）。
- `vmu.turn.feedback`（`true`）：非空默认；★ 且**已有一个接线了的同类键** `vmu.report.feedback`（phase-2 落地，真机 `delivered:true`）⇒ 语义重叠、`turn.feedback` 是旧名 ⇒ **WIRE**，并在 §4 注明重叠关系（★ 归并口径建议由你裁）。
- `vmu.pointer.propagation`（`true`）：非空默认；packs 2 处引用 ⇒ **WIRE**（`kernel/prompt/index.js` 的指针传播段）。
- `vmu.turn.instituteName`（`"institute"`）：非空默认；packs 4 处、tests 6 处引用；★ **`kernel/index.js` 里就有字面提及** ⇒ **WIRE**（既有读取面 ＋ packs 的 `{{ setting:… }}`）。

★ 这 5 键我**都没有**判成 DELETE ✓（遵守"看不见 ≠ 没有"）。


## 4. 逐键裁定（按域；★ 每键恰好一次）


### ★★ 4.0 全局最重要的口径发现（★ 请先读这条）

★ **`{{ setting:<key> }}` 是【真实的消费者路径】**：`kernel/prompt/index.js:435` 做模板代换、`:438` 把 `setting:` 列入白名单、**`:445` `if (key.startsWith('setting:')) value = ctx.settings ? ctx.settings[key.slice(8)] : undefined`** ⇒ 凡在 packs 里被写成 `{{ setting:<key> }}` 的键，**装配时真的从 settings 读它**。
★★ **而生成器的判据（`scripts/generate-vmu-settings-table.mjs`）只扫 JS 里的键名字面量，不计模板代换** ⇒ ★ **118 键里有 21 个是这种"其实已被读、却被标成未接线"的** ⇒ ★ **"未接线"这个词对这 21 个键是不真的**（★ 该修的是**判据/表格**，不是这些键）✓


### 4.1 `vmu.turn`（22 键；WIRE 22 / DELETE 0 / UNDECIDED 0）
| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.turn.objective` | `"（尚未设定）"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.objective }}` 出现在 `v5r-blocks-a.js`、`v5r-charter.js`、`v5r-persona.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.maxParallel` | `3` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.maxParallel }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.toolCallsPerTurnCap` | `0` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.toolCallsPerTurnCap }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.memoryCeilingMb` | `0` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.memoryCeilingMb }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.selfCheck` | `true` | **WIRE** | ★ 生成器自陈"可能走动态读取"⇒ 不按死键；且它在 packs/docs/tests 有引用（2/2/2）⇒ 应接线到该域的运行时模块并同步修设计卷措辞 |
| `vmu.turn.protocolPath` | `"Shared/Protocol.md"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.protocolPath }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.verifyTarget` | `"(unspecified)"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.verifyTarget }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.verifyKindLabel` | `"(unspecified)"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.verifyKindLabel }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.invitedBy` | `"(unspecified)"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.invitedBy }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.invitedWhy` | `"(unspecified)"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.invitedWhy }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.feedback` | `true` | **WIRE** | ★ 生成器自陈"可能走动态读取"⇒ 不按死键；且它在 packs/docs/tests 有引用（2/2/3）⇒ 应接线到该域的运行时模块并同步修设计卷措辞 |
| `vmu.turn.instituteName` | `"institute"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.instituteName }}` 出现在 `v5r-assistant.js`、`v5r-blocks-a.js`、`v5r-charter.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.leaderId` | `""` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.leaderId }}` 出现在 `v5r-blocks-a.js`、`v5r-charter.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.tempHiredBy` | `"（未说明）"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.tempHiredBy }}` 出现在 `v5r-blocks-a.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.tempDirection` | `"（未说明）"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.tempDirection }}` 出现在 `v5r-blocks-a.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.tempTerm` | `"雇主另行通知"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.tempTerm }}` 出现在 `v5r-blocks-a.js`、`v5r-charter.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.meetingId` | `""` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.meetingId }}` 出现在 `v5r-blocks-a.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.formalModeLine` | `"鼓励：按实现难度自行决定；做了就归档，没做就写明难度判断，` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.formalModeLine }}` 出现在 `v5r-blocks-a.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.formalProof` | `"Formal/p-x.lean"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.formalProof }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.formalBlockedNote` | `"未说明"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.formalBlockedNote }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.formalRootRel` | `"Formal"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.formalRootRel }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.turn.formalModeLabel` | `"鼓励"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.turn.formalModeLabel }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |

### 4.2.1 `vmu.a11y`（7 键；WIRE 0 / DELETE 7 / UNDECIDED 0）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.a11y.checkScope` | `null` | **DELETE** | 该域在**运行时零足迹**（除生成物 `settings/planned.js` 外无任何模块携带该域词）⇒ 按准入判据"找不到可能消费者 ⇒ 不进内核"：★ 撤回设计卷 ["21"] 里的该条宣称（生成物勿手改） |
| `vmu.a11y.checklist` | `null` | **DELETE** | 该域在**运行时零足迹**（除生成物 `settings/planned.js` 外无任何模块携带该域词）⇒ 按准入判据"找不到可能消费者 ⇒ 不进内核"：★ 撤回设计卷 ["21"] 里的该条宣称（生成物勿手改） |
| `vmu.a11y.enabled` | `null` | **DELETE** | 该域在**运行时零足迹**（除生成物 `settings/planned.js` 外无任何模块携带该域词）⇒ 按准入判据"找不到可能消费者 ⇒ 不进内核"：★ 撤回设计卷 ["21"] 里的该条宣称（生成物勿手改） |
| `vmu.a11y.failOn` | `null` | **DELETE** | 该域在**运行时零足迹**（除生成物 `settings/planned.js` 外无任何模块携带该域词）⇒ 按准入判据"找不到可能消费者 ⇒ 不进内核"：★ 撤回设计卷 ["21"] 里的该条宣称（生成物勿手改） |
| `vmu.a11y.headingGapPolicy` | `null` | **DELETE** | 该域在**运行时零足迹**（除生成物 `settings/planned.js` 外无任何模块携带该域词）⇒ 按准入判据"找不到可能消费者 ⇒ 不进内核"：★ 撤回设计卷 ["21"] 里的该条宣称（生成物勿手改） |
| `vmu.a11y.minContrastRatio` | `null` | **DELETE** | 该域在**运行时零足迹**（除生成物 `settings/planned.js` 外无任何模块携带该域词）⇒ 按准入判据"找不到可能消费者 ⇒ 不进内核"：★ 撤回设计卷 ["21"] 里的该条宣称（生成物勿手改） |
| `vmu.a11y.requireAltText` | `null` | **DELETE** | 该域在**运行时零足迹**（除生成物 `settings/planned.js` 外无任何模块携带该域词）⇒ 按准入判据"找不到可能消费者 ⇒ 不进内核"：★ 撤回设计卷 ["21"] 里的该条宣称（生成物勿手改） |

### 4.2.2 `vmu.ethics`（5 键；WIRE 0 / DELETE 0 / UNDECIDED 5）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.ethics.approvalRef` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["20"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 2 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.ethics.dpiaRequired` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16","20"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 2 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.ethics.dualUseReview` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["20"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 2 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.ethics.irbRequired` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["20"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 2 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.ethics.requireApprovalFor` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 2 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.2.3 `vmu.ballot`（4 键；WIRE 0 / DELETE 0 / UNDECIDED 4）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.ballot.freezeMeetingLinked` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["08"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 34 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.ballot.freezeMode` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["08"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 34 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.ballot.reopenInitiatorScope` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["08","17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 34 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.ballot.reopenSameMeetingOnly` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["08"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 34 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.2.4 `vmu.math`（4 键；WIRE 0 / DELETE 0 / UNDECIDED 4）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.math.formal.coqArgs` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["09"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 105 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.math.formal.coqCommand` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["09"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 105 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.math.network` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["09"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 105 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.math.proof` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["09"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 105 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.2.5 `vmu.mentor`（4 键；WIRE 0 / DELETE 0 / UNDECIDED 4）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.mentor.graduationNeedsHuman` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 3 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.mentor.maxMenteesPerMentor` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 3 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.mentor.requireReviewBeforeGraduation` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 3 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.mentor.reviewEveryMs` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 3 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.3.1 `vmu.attendance`（3 键；WIRE 0 / DELETE 0 / UNDECIDED 3）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.attendance.excusedCounts` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["08"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 7 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.attendance.markMode` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["08"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 7 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.attendance.reportLate` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["08"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 7 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.3.2 `vmu.committees`（3 键；WIRE 0 / DELETE 0 / UNDECIDED 3）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.committees.kinds` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["08"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 7 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.committees.parentRosterSubsetOnly` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["08"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 7 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.committees.reportFormat` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["08"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 7 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.3.3 `vmu.consensus`（3 键；WIRE 0 / DELETE 0 / UNDECIDED 3）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.consensus.dissentRetentionMs` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 3 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.consensus.protocol` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 3 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.consensus.requireDissentRecord` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 3 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.3.4 `vmu.consent`（3 键；WIRE 0 / DELETE 0 / UNDECIDED 3）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.consent.recheckDays` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["20"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 7 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.consent.required` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["20"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 7 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.consent.scopes` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["20"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 7 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.3.5 `vmu.deprecation`（3 键；WIRE 0 / DELETE 0 / UNDECIDED 3）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.deprecation.allowExempt` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["07","13"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 2 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.deprecation.exemptList` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["13"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 2 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.deprecation.stageDays` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["07","13"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 2 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.3.6 `vmu.incident`（3 键；WIRE 0 / DELETE 0 / UNDECIDED 3）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.incident.disclosureDays` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["20"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 2 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.incident.freezeCapabilities` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["20"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 2 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.incident.notifyContacts` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["20"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 2 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.3.7 `vmu.names`（3 键；WIRE 0 / DELETE 0 / UNDECIDED 3）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.names.aliasTablePath` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["07","13"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 171 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.names.strict` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["07","13"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 171 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.names.warn` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["13"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 171 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.4.1 `vmu.prompt`（3 键；WIRE 0 / DELETE 0 / UNDECIDED 3）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.prompt.compatMode` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["07","13"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 35 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.prompt.order` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["13"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 35 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.prompt.sections` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["13"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 35 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.4.2 `vmu.script`（3 键；WIRE 0 / DELETE 0 / UNDECIDED 3）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.script.stderrCap` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 87 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.script.stdoutCap` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 87 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.script.timeoutMs` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16","20"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 87 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.4.3 `vmu.sovereignty`（3 键；WIRE 0 / DELETE 3 / UNDECIDED 0）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.sovereignty.crossBorderAllow` | `null` | **DELETE** | 该域在**运行时零足迹**（除生成物 `settings/planned.js` 外无任何模块携带该域词）⇒ 按准入判据"找不到可能消费者 ⇒ 不进内核"：★ 撤回设计卷 ["20"] 里的该条宣称（生成物勿手改） |
| `vmu.sovereignty.exportControl` | `null` | **DELETE** | 该域在**运行时零足迹**（除生成物 `settings/planned.js` 外无任何模块携带该域词）⇒ 按准入判据"找不到可能消费者 ⇒ 不进内核"：★ 撤回设计卷 ["20"] 里的该条宣称（生成物勿手改） |
| `vmu.sovereignty.region` | `null` | **DELETE** | 该域在**运行时零足迹**（除生成物 `settings/planned.js` 外无任何模块携带该域词）⇒ 按准入判据"找不到可能消费者 ⇒ 不进内核"：★ 撤回设计卷 ["20"] 里的该条宣称（生成物勿手改） |

### 4.4.4 `vmu.stats`（3 键；WIRE 0 / DELETE 0 / UNDECIDED 3）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.stats.correction` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 168 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.stats.effectSize` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 168 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.stats.seed` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 168 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.4.5 `vmu.supplychain`（3 键；WIRE 0 / DELETE 3 / UNDECIDED 0）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.supplychain.reproducibleBuild` | `null` | **DELETE** | 该域在**运行时零足迹**（除生成物 `settings/planned.js` 外无任何模块携带该域词）⇒ 按准入判据"找不到可能消费者 ⇒ 不进内核"：★ 撤回设计卷 ["20"] 里的该条宣称（生成物勿手改） |
| `vmu.supplychain.requireLock` | `null` | **DELETE** | 该域在**运行时零足迹**（除生成物 `settings/planned.js` 外无任何模块携带该域词）⇒ 按准入判据"找不到可能消费者 ⇒ 不进内核"：★ 撤回设计卷 ["20"] 里的该条宣称（生成物勿手改） |
| `vmu.supplychain.sbomPath` | `null` | **DELETE** | 该域在**运行时零足迹**（除生成物 `settings/planned.js` 外无任何模块携带该域词）⇒ 按准入判据"找不到可能消费者 ⇒ 不进内核"：★ 撤回设计卷 ["20"] 里的该条宣称（生成物勿手改） |

### 4.4.6 `vmu.paper`（2 键；WIRE 1 / DELETE 0 / UNDECIDED 1）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.paper.reviewedMember` | `"(unspecified)"` | **WIRE** | ★ 已被消耗：`{{ setting:vmu.paper.reviewedMember }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线" |
| `vmu.paper.retentionMs` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["08"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 19 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.4.7 `vmu.authorship`（2 键；WIRE 0 / DELETE 0 / UNDECIDED 2）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.authorship.creditRoles` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 7 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.authorship.requireCredit` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 7 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.4.8 `vmu.collab`（2 键；WIRE 0 / DELETE 0 / UNDECIDED 2）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.collab.exportPolicy` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 15 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.collab.federationPeers` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 15 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.4.9 `vmu.collusion`（2 键；WIRE 0 / DELETE 0 / UNDECIDED 2）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.collusion.maxClusterSize` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 6 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.collusion.scanEveryMs` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 6 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.4.10 `vmu.handover`（2 键；WIRE 0 / DELETE 0 / UNDECIDED 2）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.handover.autoOpenOnEnd` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 10 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.handover.includeMemoryScopes` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 10 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.1 `vmu.import`（2 键；WIRE 0 / DELETE 0 / UNDECIDED 2）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.import.onConflict` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["07"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 95 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.import.previewOnly` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["07"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 95 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.2 `vmu.institute`（2 键；WIRE 0 / DELETE 0 / UNDECIDED 2）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.institute.leaderId` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["26"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 34 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.institute.name` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["26"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 34 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.3 `vmu.preserve`（2 键；WIRE 0 / DELETE 0 / UNDECIDED 2）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.preserve.migrateAfterYears` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 11 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.preserve.pdfProfile` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 11 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.4 `vmu.pub`（2 键；WIRE 0 / DELETE 0 / UNDECIDED 2）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.pub.retractionRequiresReason` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 50 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.pub.versionKinds` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 50 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.5 `vmu.report`（2 键；WIRE 0 / DELETE 0 / UNDECIDED 2）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.report.bilingual` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["06"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 100 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.report.language` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["06"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 100 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.6 `vmu.teaching`（2 键；WIRE 0 / DELETE 0 / UNDECIDED 2）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.teaching.blindMappingRetentionMs` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 5 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.teaching.maxUnits` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 5 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.7 `vmu.templates`（2 键；WIRE 0 / DELETE 0 / UNDECIDED 2）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.templates.default` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["08"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 17 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.templates.items` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["08"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 17 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.8 `vmu.work`（2 键；WIRE 0 / DELETE 0 / UNDECIDED 2）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.work.pauseRule` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["07"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 87 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |
| `vmu.work.start` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 87 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.9 `vmu.core`（1 键；WIRE 1 / DELETE 0 / UNDECIDED 0）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.core.storeBackend` | `"json-fold"` | **WIRE** | `kernel/store.js`（耐久后端就是它实现的；该键是选后端的旋钮却没有读者——★ 换后端不会改变任何行为） |

### 4.5.10 `vmu.pointer`（1 键；WIRE 1 / DELETE 0 / UNDECIDED 0）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.pointer.propagation` | `true` | **WIRE** | ★ 生成器自陈"可能走动态读取"⇒ 不按死键；且它在 packs/docs/tests 有引用（2/3/3）⇒ 应接线到该域的运行时模块并同步修设计卷措辞 |

### 4.5.11 `vmu.ballotbox`（1 键；WIRE 0 / DELETE 0 / UNDECIDED 1）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.ballotbox.minVotes` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["24"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 12 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.12 `vmu.data`（1 键；WIRE 0 / DELETE 0 / UNDECIDED 1）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.data.retention` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["20"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 53 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.13 `vmu.explain`（1 键；WIRE 0 / DELETE 0 / UNDECIDED 1）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.explain.fairnessDetail` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 37 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.14 `vmu.identity`（1 键；WIRE 0 / DELETE 0 / UNDECIDED 1）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.identity.localFormat` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 25 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.15 `vmu.notes`（1 键；WIRE 0 / DELETE 0 / UNDECIDED 1）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.notes.linkKinds` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["16"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 97 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.16 `vmu.packs`（1 键；WIRE 0 / DELETE 0 / UNDECIDED 1）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.packs.searchPaths` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["07","13"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 85 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.17 `vmu.setting`（1 键；WIRE 0 / DELETE 0 / UNDECIDED 1）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.setting.defaults` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["27"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 121 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

### 4.5.18 `vmu.skills`（1 键；WIRE 0 / DELETE 0 / UNDECIDED 1）

| 键 | 默认值 | 裁定 | 理由 |
|---|---|---|---|
| `vmu.skills.catalogTtlMs` | `null` | **UNDECIDED** | 判定所需的是**产品决定**而不是代码事实：设计卷 ["17"] 声明了它，但 vmu 里没有实现该域的读者（同域词仅出现在 6 个模块中，多为子串噪声）⇒ 具名阻碍：★ 要么实现该域并在点名的模块里读它，要么撤回该卷宣称 |

## 5. 计数与校验

| 裁定 | 键数 |
|---|---|
| **WIRE** | **25** |
| **DELETE** | **13** |
| **UNDECIDED** | **80** |
| **合计** | **118**（★ 必须 = 118） |

★ **每域计数**：`vmu.core` 1 ／ `vmu.turn` 22 ／ `vmu.pointer` 1 ／ `vmu.paper` 2 ／ `vmu.a11y` 7 ／ `vmu.attendance` 3 ／ `vmu.authorship` 2 ／ `vmu.ballot` 4 ／ `vmu.ballotbox` 1 ／ `vmu.collab` 2 ／ `vmu.collusion` 2 ／ `vmu.committees` 3 ／ `vmu.consensus` 3 ／ `vmu.consent` 3 ／ `vmu.data` 1 ／ `vmu.deprecation` 3 ／ `vmu.ethics` 5 ／ `vmu.explain` 1 ／ `vmu.handover` 2 ／ `vmu.identity` 1 ／ `vmu.import` 2 ／ `vmu.incident` 3 ／ `vmu.institute` 2 ／ `vmu.math` 4 ／ `vmu.mentor` 4 ／ `vmu.names` 3 ／ `vmu.notes` 1 ／ `vmu.packs` 1 ／ `vmu.preserve` 2 ／ `vmu.prompt` 3 ／ `vmu.pub` 2 ／ `vmu.report` 2 ／ `vmu.script` 3 ／ `vmu.setting` 1 ／ `vmu.skills` 1 ／ `vmu.sovereignty` 3 ／ `vmu.stats` 3 ／ `vmu.supplychain` 3 ／ `vmu.teaching` 2 ／ `vmu.templates` 2 ／ `vmu.work` 2

★ **恰好一次校验**（脚本内）：键数 118；唯一键数 118；域数 41 ⇒ **118＝118、无重复、41 域 ✓**

### 只列出 WIRE 的键（便于逐批实现）

- `vmu.core.storeBackend` — `kernel/store.js`（耐久后端就是它实现的；该键是选后端的旋钮却没有读者——★ 换后端不会改变任何行为）
- `vmu.turn.objective` — ★ 已被消耗：`{{ setting:vmu.turn.objective }}` 出现在 `v5r-blocks-a.js`、`v5r-charter.js`、`v5r-persona.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.maxParallel` — ★ 已被消耗：`{{ setting:vmu.turn.maxParallel }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.toolCallsPerTurnCap` — ★ 已被消耗：`{{ setting:vmu.turn.toolCallsPerTurnCap }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.memoryCeilingMb` — ★ 已被消耗：`{{ setting:vmu.turn.memoryCeilingMb }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.selfCheck` — ★ 生成器自陈"可能走动态读取"⇒ 不按死键；且它在 packs/docs/tests 有引用（2/2/2）⇒ 应接线到该域的运行时模块并同步修设计卷措辞
- `vmu.turn.protocolPath` — ★ 已被消耗：`{{ setting:vmu.turn.protocolPath }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.verifyTarget` — ★ 已被消耗：`{{ setting:vmu.turn.verifyTarget }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.verifyKindLabel` — ★ 已被消耗：`{{ setting:vmu.turn.verifyKindLabel }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.invitedBy` — ★ 已被消耗：`{{ setting:vmu.turn.invitedBy }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.invitedWhy` — ★ 已被消耗：`{{ setting:vmu.turn.invitedWhy }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.feedback` — ★ 生成器自陈"可能走动态读取"⇒ 不按死键；且它在 packs/docs/tests 有引用（2/2/3）⇒ 应接线到该域的运行时模块并同步修设计卷措辞
- `vmu.pointer.propagation` — ★ 生成器自陈"可能走动态读取"⇒ 不按死键；且它在 packs/docs/tests 有引用（2/3/3）⇒ 应接线到该域的运行时模块并同步修设计卷措辞
- `vmu.turn.instituteName` — ★ 已被消耗：`{{ setting:vmu.turn.instituteName }}` 出现在 `v5r-assistant.js`、`v5r-blocks-a.js`、`v5r-charter.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.leaderId` — ★ 已被消耗：`{{ setting:vmu.turn.leaderId }}` 出现在 `v5r-blocks-a.js`、`v5r-charter.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.tempHiredBy` — ★ 已被消耗：`{{ setting:vmu.turn.tempHiredBy }}` 出现在 `v5r-blocks-a.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.tempDirection` — ★ 已被消耗：`{{ setting:vmu.turn.tempDirection }}` 出现在 `v5r-blocks-a.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.tempTerm` — ★ 已被消耗：`{{ setting:vmu.turn.tempTerm }}` 出现在 `v5r-blocks-a.js`、`v5r-charter.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.meetingId` — ★ 已被消耗：`{{ setting:vmu.turn.meetingId }}` 出现在 `v5r-blocks-a.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.formalModeLine` — ★ 已被消耗：`{{ setting:vmu.turn.formalModeLine }}` 出现在 `v5r-blocks-a.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.formalProof` — ★ 已被消耗：`{{ setting:vmu.turn.formalProof }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.formalBlockedNote` — ★ 已被消耗：`{{ setting:vmu.turn.formalBlockedNote }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.paper.reviewedMember` — ★ 已被消耗：`{{ setting:vmu.paper.reviewedMember }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.formalRootRel` — ★ 已被消耗：`{{ setting:vmu.turn.formalRootRel }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"
- `vmu.turn.formalModeLabel` — ★ 已被消耗：`{{ setting:vmu.turn.formalModeLabel }}` 出现在 `v5r-blocks-b.js`，由 `kernel/prompt/index.js:445` 在装配时从 settings 解析 ⇒ ★ 生成器的静态判据未计模板代换，故表格把它误标"未接线"

### 只列出 DELETE 的键（便于逐批撤回卷宣称）

- `vmu.a11y.checkScope`（grep packs/docs/tests = 0/2/1）
- `vmu.a11y.checklist`（grep packs/docs/tests = 0/2/0）
- `vmu.a11y.enabled`（grep packs/docs/tests = 0/2/1）
- `vmu.a11y.failOn`（grep packs/docs/tests = 0/2/0）
- `vmu.a11y.headingGapPolicy`（grep packs/docs/tests = 0/2/0）
- `vmu.a11y.minContrastRatio`（grep packs/docs/tests = 0/2/0）
- `vmu.a11y.requireAltText`（grep packs/docs/tests = 0/2/0）
- `vmu.sovereignty.crossBorderAllow`（grep packs/docs/tests = 0/2/0）
- `vmu.sovereignty.exportControl`（grep packs/docs/tests = 0/2/0）
- `vmu.sovereignty.region`（grep packs/docs/tests = 0/2/0）
- `vmu.supplychain.reproducibleBuild`（grep packs/docs/tests = 0/2/0）
- `vmu.supplychain.requireLock`（grep packs/docs/tests = 0/2/0）
- `vmu.supplychain.sbomPath`（grep packs/docs/tests = 0/2/0）

## 6. 没核（★ 与"核了"分开）

1. ★ **没有逐个键去读那 41 个设计卷**：`volumes` 是生成器给出的**声明卷号**，我**没有**打开卷正文核对"该键在该卷里到底怎么写的、是否已被后续卷取代" ⇒ ★ 因此 DELETE 的具体卷内措辞**须由你/卷作者裁**（我只给"该域运行时零足迹"这个代码事实＋卷号）。
2. ★ **没有核"有没有部署方在 config 里设过这些键"**（`task-210` 的迁移面）⇒ ★ 删键的**外部代价未评估**（本台账只评"内核里有没有读者"）。
3. ★ **没有核 93 个 planned 键里哪些已被实现只是名字不同**（我只核了 `vmu.turn.*` 那 4 个带 `was:` 的改名：**旧名在模块里 0 命中** ✓，所以不是"改名后读者还在读旧名"）。
4. ★ **`domainWordInModules` 是子串计数**（如 `names` 命中 171 个模块）⇒ ★ 它在表里只当"弱信号"用，**没有**据此单独判 WIRE/DELETE。
5. ★ **本轮未改任何代码**；★ 未跑 git；★ 只跑了 `check-docs`／`audit-doc-index`（见 §7）；★ `settings/schema.js` 正在被兄弟改 ⇒ 若其 sha16 变了，§4 的机械列须重跑。
6. ★ **5 个 UNDETERMINED 键我没有构造真机动态读取去证实**（我只据生成器自陈＋packs/docs/tests 引用）⇒ 它们的 WIRE 目标是**建议**，不是观测。
