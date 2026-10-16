# Phase 3 · 验收 · 疑似重复键的关系裁定（task-234）

> 任务：`task-234`。**只出判定、不改代码**。两案：**(一)** `vmu.pointer.propagation`（疑改名／疑不同旋钮）vs 邻居 `vmu.records.pointerPropagation`（被读）；**(二)** `vmu.turn.feedback`（台账未接线）vs `vmu.report.feedback`（已接线、武装汇报回路）。
> 每题给：判定 ＋ **file:line 证据** ＋ **引 schema 自己的 `was`／`doc` 原文** ＋ 一行建议（DISTINCT／RENAME WITH AUTHORITATIVE NAME／MERGE／NEEDS A PRODUCT RULING）＋ **台账的 WIRE/DELETE 判定是否该改**。
> 纪律：每条带 file:line；**「读过」与「推测」分开**；「没核」单独一节；**不改代码**；不跑 T1／全量；**不跑 git**；临时件 `D:\_tmp`；不碰 `token.txt`。

---

## 0. 判定摘要

| 案 | 键 | 判定 | 一行建议 | 台账 WIRE/DELETE 是否该改 |
|---|---|---|---|---|
| 一 | `vmu.pointer.propagation` ↔ `vmu.records.pointerPropagation` | **(a) 两个不同的旋钮**（同一原始 S21 关切拆到两层；**不是**改名、**无** `was` 记录） | **DISTINCT**（两侧**都已接线**，只欠措辞/口径更正） | ★ **该改**：台账写 **WIRE**（`:47/:334/:411`）＝**错**；实际 **已接线（pack 策略层）**，应改判 **ALREADY WIRED (pack layer)**；**绝不 DELETE**（有活消费者＋pack 默认） |
| 二 | `vmu.turn.feedback` ↔ `vmu.report.feedback` | **(b) 两个互不重叠的键**（门控**不同产物**；`turn.feedback` **不是**旧名、也不是 report 面的遗留） | **DISTINCT**（两键都**已接线**） | ★ **该改**：台账写 `turn.feedback` "**语义重叠／旧名** ⇒ WIRE"（`:46/:75/:410`）＝**两处都错**（既不重叠也不是旧名，且已接线）；`report.feedback` 的"已接线"**不变** |

**共同根因（两案同一个）**：台账的"内核**按名** 0 处"是**扫描器的视野问题**，不是"没有消费者"。三个键的元素都在 **`packs/v5r/middleware/prompt-switches.js:26/27/28`** 的 `OFF_SWITCHES` 里，读取发生在 **`:71` 的 `for (const [key, section] of OFF_SWITCHES)`** ⇒ `settings[key]` 是**动态读**，静态按名 grep 永远看不见。★ 这一点**已由第三方独立测到并写进报告**：`docs/acceptance/comms-round33-report.md:90`「元素在 `packs/v5r/middleware/prompt-switches.js:26/27/28`，**遍历点 `:71``for (const [key, section] of OFF_SWITCHES)`（循环变量就叫 `key`）」＋`:104`。

**`was` 通道的判定（两案共用）**：schema **确实**有改名通道——`settings/schema.js:1424` 是它的定义（「THE RENAME CHANNEL (docs/03 §8: VMU_PARAM_RENAMED). A key record may carry `was: [formerNames]`」），全表 **65 处** `was:`（例 `:144`（`vmu.turn.maxParallel`）、`:293`（`vmu.quality.targets`）、`:380`（`vmu.admission.probationMs`）、`:766`（`vmu.anonymity.pseudonymStyle`））。★ **实测：这四个键一个都没有 `was`**（`schema.js:87`／`:163`／`:164`／`:962`，逐行已复核）⇒ **两案都不是"schema 记了 `was` 的改名"**（问题里的分支 (c) **两案均排除**）。
> ★ **本条读数的漂移，如实记下**：我**第一次** grep 时该注释在 `schema.js:1418`；**复核时**（同一轮内，文件被兄弟写者动过）它在 **`:1424`**。这**正是** task-226 那道门（`tests/audit-doc-line-refs.test.mjs`）存在的理由——本文件其余全部引用我都**逐行复核过**（见 §5 R6），只有这一处需要更正。

---

## 1. 案一：`vmu.pointer.propagation` ↔ `vmu.records.pointerPropagation`

### 1.1 判定：**(a) 两个不同的旋钮**（同一原始关切的两层实现）

**各自门控什么（★ 这是"不同"的判据，不是名字）**

| 键 | 真实读取点（读过） | 它改变的可观测结果 |
|---|---|---|
| `vmu.records.pointerPropagation` | **`kernel/records.js:220`** `const pointerPropagation = sget(K.pointerPropagation) !== false`（★ **真读**；台账/兄弟写的 `:57/:99/:141` 是**声明/别名/默认表**三处，**不是读点**） | `:590-592`：关 ⇒ head list 被静音，回执 `suppressed:true`＋**具名 note**「`vmu.records.pointerPropagation=false`: the head list is muted (zero injection, the caller falls back verbatim)」⇒ 影响的是**内核内的头部列表** |
| `vmu.pointer.propagation` | **`packs/v5r/middleware/prompt-switches.js:26`**（`OFF_SWITCHES` 元素）→ 读取发生在 **`:71`** 的循环 `for (const [key, section] of OFF_SWITCHES)` ⇒ `:72` `decisions.push({ name: section, enabled: s[key] !== false })` | 该决策经 `sectionPolicy` 送进回合循环（`vibe-math-vmu.js:478` 注入 → `kernel/turn/index.js:386-390` 调 `setSectionEnabled`）⇒ 关掉＝**`v5r-pointer-contract` 段零注入（连标题都不出现）**，影响的是**提示词段** |

⇒ **同一原始 S21 关切，被拆成两层两个旋钮**：一个管**内核数据面**（records 的 head list），一个管**提示词面**（pointer contract 段）。**它们不是同一事实的两次声明**：把 `records.pointerPropagation` 关掉**不会**移除提示词里的指针契约段；把 `pointer.propagation` 关掉**不会**静音 head list。

### 1.2 schema 自己的原文（逐字引）

- `settings/schema.js:87`：`{ key: 'vmu.records.pointerPropagation', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: 'P3/S21：头部列表为默认信息通道；关＝零注入且提示词逐字回退' }` ★ **无 `was`**
- `settings/schema.js:164`：`{ key: 'vmu.pointer.propagation', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: '是否注入指针传播契约（关掉＝零注入；原线的 S21 开关同义）' }` ★ **无 `was`**
- ★ **两句 `doc` 都点 S21，而门控对象不同**（"头部列表"vs"指针传播契约"）⇒ **"同义"指的是它们同源于原线那一个开关，不是"彼此同义"**。这正是"看起来像重复键"的来源，也是本裁定的核心。

### 1.3 其它已读证据

- pack 默认：`packs/v5r/settings/defaults.json:7` `"vmu.pointer.propagation": true`（**出货 pack 真的给它默认值**）。
- 行为证据（测试真的把它拨来拨去）：`tests/vmu-turn.test.mjs:812` `mkS({ "vmu.pointer.propagation": false, … })`；`tests/vmu-prompt-type-coverage.test.mjs:36` 与 `tests/vmu-ab-v5r-verification.test.mjs:407` 两处设为 `true`。
- 装载证据（真机回执）：`docs/acceptance/assistant-round21-report.md:182` 的 `settingsMerge.sources` 里逐字有 `"vmu.pointer.propagation":"pack:v5r"` ⇒ **pack 层真的把它送到内核**。
- 已有旁人做过同一判定（**与我一致**）：`docs/acceptance/09-goal4-verdict.md:49` 把本键记为「**提示词侧**指针契约注入」，载体 `packs/v5r/middleware/prompt-switches.js:26`；`:47` 把邻居记为 S21（`kernel/records.js:57,99,592`）。
- 设计卷也把它当两个：`docs/acceptance/11-pack-fidelity.md:43` 一行里**并列** `vmu.records.pointerPropagation`＋`vmu.pointer.propagation`（`true／true`，"✓ 两个都声明"）。

### 1.4 一行建议 ＋ 台账该不该改

- **建议：DISTINCT**（两键都保留；**无需** RENAME，因为**没有 `was`、没有旧名**；★ 若要防后人再误判，只需在两处 `doc` 里各加半句"与另一键的分工"）。
- ★ **台账该改**：`docs/acceptance/phase3-inert-keys-ledger.md:47`／`:334`／`:411` 对本键判 **WIRE**（"应接线到该域的运行时模块"）⇒ **前提是错的**（"内核按名 0 处"≠"无消费者"）：它**已经接线在 pack 策略层**。应改判 **ALREADY WIRED (pack policy layer)**，并把"内核按名 0 处"标注为**扫描器看不见动态读**（根因见 §0）。**绝不能 DELETE**（有活消费者＋出货默认＋真机装载证据）。

---

## 2. 案二：`vmu.turn.feedback` ↔ `vmu.report.feedback`

### 2.1 判定：**(b) 两个互不重叠的键**（门控不同产物）

| 键 | 真实读取点（读过） | 它门控的东西 |
|---|---|---|
| `vmu.turn.feedback` | **`packs/v5r/middleware/prompt-switches.js:28`**（`OFF_SWITCHES`）→ 读取在 **`:71/:72`** 的循环 | **提示词段** `v5r-feedback-line`（工作反馈行）：关＝段零注入、连标题都不出现 |
| `vmu.report.feedback` | **`kernel/report.js:120`** `feedback: sget('vmu.report.feedback') === true`（＋`kernel/reportfeedbackdelivery.js:67/69` 的投递侧读取） | **汇报反馈回路**：开＝把汇报的**受众与回执**经宿主动态 context 通道回给模型（A1 第一步） |

⇒ **两者门控的产物不同、触发时机不同、默认值也不同**（`turn.feedback` 默认 **`true`**、`report.feedback` 默认 **`false`**）⇒ **不是同一事实**；`turn.feedback` **不是 report 面存在之前的遗留**——它今天仍是**活的、pack 携带的段开关**（出货默认 `true`、有真机装载证据、有测试拨动它）。

### 2.2 schema 自己的原文（逐字引）

- `settings/schema.js:163`：`{ key: 'vmu.turn.feedback', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: '是否注入工作反馈行（关掉＝零注入，连段标题都不出现；原线 feedbackOn 同义）' }` ★ **无 `was`**
- `settings/schema.js:962`：`{ key: 'vmu.report.feedback', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '汇报反馈回路开关（A1 第一步）：默认 false＝零机制；开＝把汇报的受众与回执经宿主动态 context 回给模型（投递调用已由入口在 Part B 接线（已落地）—— 未接线期间回执以真话具名）' }` ★ **无 `was`**
- ★ 两段 `doc` **没有一个字重叠**："是否注入工作反馈行"（提示词段）vs "汇报反馈回路开关"（投递回路）。**唯一的共同点只是英文词 `feedback`**。

### 2.3 有没有别的路径读 turn 域那个？（★ 问题点名要答的）

**有，而且就是那一条**：`packs/v5r/middleware/prompt-switches.js:28` 的 `OFF_SWITCHES` 元素 → `:71` 循环按 `key` 动态读 → 决策交 `sectionPolicy`。链路已读：`vibe-math-vmu.js:478`（`v5r: { sectionPolicy: V5R_DECIDE_SECTIONS, … }`）→ `kernel/turn/index.js:386-390`（真调用）。**内核里没有第二处按名读它**（我按名 grep 的全部命中见 §5 台账，除载体文件与测试/文档外无内核读点）⇒ 它是**单一路径、pack 层**的键。

### 2.4 其它已读证据

- pack 默认：`packs/v5r/settings/defaults.json:9` `"vmu.turn.feedback": true`。★ 本仓**已有两处专门警告"别把它与 report.feedback 混"**：`docs/acceptance/phase2-accept-round23.md:40` 与 `phase2-accept-round24.md:28`（「该文件 `:9` 有 `"vmu.turn.feedback": true` ⇒ **那是 `turn.feedback`、不是 `report.feedback`** ⇒ **谁 grep `feedback` 谁就会误判"默认被翻了"**）。⇒ **本裁定把这条警告从"易混提示"升级为"关系判定"**。
- 行为证据：`tests/vmu-turn.test.mjs:812` 把三键一起关掉；`09-goal4-verdict.md:51` 记它守 M-B05/C-55（反馈行），载体 `prompt-switches.js:28`。
- `vmu.report.feedback` 的接线是**真机级**：`docs/acceptance/phase2-verify-round17.md:11`／`phase2-assistant-round19-gate3.md:12` 等逐字给出 `enabled:true`／`source:"settings:vmu.report.feedback"`／`delivered:true` 的九键回执。
- 载体策略的**范围**也已被点名：`docs/acceptance/pack-round42-report.md:31` 列出三对 `OFF_SWITCHES` 后写「★ **没有一项管"汇报纪律"那些句子**」⇒ ★ **正是"turn 域段开关 ≠ report 回路开关"的独立佐证**。

### 2.5 一行建议 ＋ 台账该不该改

- **建议：DISTINCT**（两键都保留、都**已接线**；**不要 MERGE**——合并会让"关掉提示词里的反馈行"与"关掉汇报回路投递"变成一个动作，两者产物与风险都不同）。
- ★ **台账该改**：`docs/acceptance/phase3-inert-keys-ledger.md:46`（"**已有一个接线了的同类键** … **语义重叠**、`turn.feedback` **是旧名** ⇒ WIRE"）与 `:75`／`:410` ⇒ **两处主张都错**：既**不重叠**（§2.1／§2.2），也**不是旧名**（无 `was`，且它独立存在于 pack 层）。应改判 **ALREADY WIRED (pack policy layer) ＋ DISTINCT from `vmu.report.feedback`**；`vmu.report.feedback` 的"✅ 已接线"**维持不变**。

---

## 3. 顺带：载体就是那三个键的那份文件 ⇒ **已记下、未碰**

★ **是**。`packs/v5r/middleware/prompt-switches.js` 正是**三个"未判定"键的共同载体**（与兄弟报告一致）：

- `:26` `['vmu.pointer.propagation', 'v5r-pointer-contract'],`
- `:27` `['vmu.turn.selfCheck', 'v5r-turn-resources'],`
- `:28` `['vmu.turn.feedback', 'v5r-feedback-line'],`
- 读取点 `:71` `for (const [key, section] of OFF_SWITCHES) { :72 decisions.push({ name: section, enabled: s[key] !== false }) }`

⇒ **已按你的要求记下并【未触碰该文件】**（本次只写本文件；`packs/**` 全程零改动）。★ 也正因为它是载体，**两案的"已接线"结论都落在它身上**：改这份文件＝改两案的接线事实，属兄弟任务的禁碰区。

---

## 4. 「没核」（明确未验证的部分）

1. **端到端行为没测**：我**没有**跑"把 `vmu.pointer.propagation=false` / `vmu.turn.feedback=false` 装进真入口、看提示词段真的消失"的探针；两案的"会改变可观测结果"是**读码**（`prompt-switches.js:72` 的 `enabled` → `kernel/turn/index.js:389` 的 `setSectionEnabled` → `kernel/prompt/index.js` 的 `disable` → 段整段跳过）＋**既有测试拨动同一批键**（`vmu-turn.test.mjs:812`）推出的，**不是**我这次亲手测的。
2. **`vmu.turn.selfCheck`（第三个键）** 只作为"同载体"记录，**未做**它的关系判定（不属本任务两案）。
3. **原线 S21 的原文**没读：`docs/26-turn-orchestration.md:366` 说原线有 `pointerPropagationOn()`、配置键为 `vmu.pointer.propagation`；**我没有回到 `vibe-math-v5r.js` 核对那个开关当时到底门控几件事**（"同源到一个开关"这句我是**照 schema 的 `doc` 引用**，属**引用**而非独立复核）。
4. **`who:'office'`／`hot` 等元数据是否与实际一致**未核（与两案关系无关）。
5. **除 `prompt-switches.js` 与 `kernel/report.js` 之外**是否还有"按别的键名间接读"的路径未穷尽（我按**两个键名**全仓 grep，覆盖 119／45 命中；**按语义**找读者没做）。

---

## 5. 读数与命令台账（★ 每条都写明读的是哪一次运行）

| 运行 | 原样命令（读取工具） | 关键读数 |
|---|---|---|
| R1 | grep `vmu\.pointer\.propagation\|vmu\.records\.pointerPropagation`（全仓） | **45 命中**；关键：`schema.js:87`／`:164`、`prompt-switches.js:26`、`records.js:57/99/141/592`、`defaults.json:7`、`09-goal4-verdict.md:47/49` |
| R2 | grep `vmu\.turn\.feedback\|vmu\.report\.feedback`（全仓） | **119 命中**；关键：`schema.js:163`／`:962`、`prompt-switches.js:28`、`report.js:120`、`reportfeedbackdelivery.js:67/69`、`defaults.json:9`、`09-goal4-verdict.md:51` |
| R3 | grep `was:` on `settings/schema.js` | **65 命中**（改名通道存在）⇒ 与 R1/R2 交叉 ⇒ **四键均无 `was`** |
| R4 | grep `pointerPropagation` on `kernel/records.js` | **11 命中**；★ **真读点是 `:220`**（`sget(K.pointerPropagation) !== false`），`:141` 是默认表、`:590-592` 是效果与具名 note |
| R5 | grep `v5rTurnSections\|v5rPromptSections`（用于确认"三个未判定键"的载体范围） | 载体唯一：`packs/v5r/middleware/prompt-switches.js`（`:26/:27/:28`，遍历 `:71`） |
| R6 | **逐行复核**（`Get-Content` 取指定行）on `schema.js` `87/163/164/962`、`prompt-switches.js` `26/27/28/71/72`、`records.js` `220/590/592`、`report.js` `120`、`reportfeedbackdelivery.js` `67/69`、`defaults.json` `7/9` | **全部逐字命中**（见 §1.1／§2.1 引文）⇒ 本报告除 `was` 通道那一处（`1418`→**`1424`**，已更正并在 §0 具名）外，引用均与当前树一致 |

**未跑** T1／全量；**未跑 git**；**未改任何代码**（本次只新增本文件）；未碰 `token.txt`。
