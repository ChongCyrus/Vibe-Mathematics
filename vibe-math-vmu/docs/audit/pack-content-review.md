# 整合包·提示词内容审查（v5r pack content review）

- 审查对象（**逐字通读**，见文末"怎么查的"）：`vibe-math-vmu/packs/v5r/prompts/v5r-charter.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-persona.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-prompts.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-core.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/settings/schema.js`（＋`settings/planned.js`）、`vibe-math-vmu/docs/26-turn-orchestration.md` §3.9–3.19。
- 判据：`docs/26` §3.9（快照→片段，**装配后不得残留具体成员名与具体轮次**，行 187–202）、§3.10（片段与分支的施工图，行 204–251）、§3.13（每轮骨架与 `role` vs `roleLabel` 的分工，行 289–310）、§3.14（资源数字走 settings，行 312–330）、§3.16（指针契约开关，行 348–364）、§3.19（本节审查方法，行 400–417）。
- 类别记号：**(a)** 有意固定的散文／本就属于数据层的声明（**不算缺陷**）；**(b)** **本该是 `{{ }}` 变量或 settings 键却写死**（缺陷）；**(c)** 写死但只在**注释／元数据／采集证据**里（低严重度）。
- 本报告**只读不改**：未修改任何被审文件；仅新增本文件。

---

## 0. 一句话结论

四个 pack 文件里，**`v5r-charter.js`（手写、已变量化）是唯一"像模板"的一份** ✓，但它**没有被任何运行时接线**（只被 `tests/vmu-turn.test.mjs:19` 引用）；**真正被 pack 声明、会被装配的是 `v5r-persona.js`（逐字采集的快照）** ✗ —— 而快照里保留了 `院士 acad`、`m = 1/2/3`、`辩论轮次上限 3 轮`、整条绝对库路径 ✗，并且**同一 section 同一 role 有多条 binding 会被【全部追加】**，导致一名常驻研究员实际收到 **18,528 字**、内含**三种研究员身份、7 处 `院士 acad`、互相矛盾的 `m = 1`／`m = 2`／`m = 3`** ✗✗（实测，见 §2.2）。

---

## 1. 各文件内容与文本质量

### 1.1 `vibe-math-vmu/packs/v5r/prompts/v5r-charter.js`（902 行，67 KB）

**是什么**：把原版 `charterFor(member)` 的**片段拼接**重建成 `CHARTER_BLOCKS`（19 个块，`order` 700–750，行 31–882），并派生出 `CHARTER_ROLE_BINDINGS`（行 885）、`CHARTER_PHASE_BINDINGS`（889）、`CHARTER_BINDINGS`（893）、`CHARTER_LEADER_VARIANTS`（896）、`CHARTER_SECTIONS`（900–908）。块种类齐全：开头／分工／编制／通用规章／规则 7／三条硬规则／资料库／组织／求真说明／表决／节奏／雇佣／任务板／任务板-领头人／上下文／停止／简报占位／回复目录／formal 字段／逐轮标题／逐轮要求／院士统筹／资源／命题准入／指针契约／反馈行／formal 三块。

**文本本身**：句子通顺、术语一致，与 `docs/26` §3.10 的十一段能对上 ✓；`{{ member }}`／`{{ roster }}`／`{{ quorum }}`／`{{ round }}`／`{{ roleLabel }}`／`{{ setting:… }}` 的用法与 §3.9／§3.13／§3.14 的设计一致 ✓。

**质量缺陷（文本层）**：
1. **头文与分工段重复**：`v5r-charter-opening` 的 `academician` 文本（行 45–48）与 `v5r-charter-division.'with-leader'`（行 73–77）是**同一段话**；而 `v5r-charter-division` 是独立块（`leader-conditional` ⇒ 默认取 `with-leader`，见行 907）⇒ **院士实际会读到两遍**（实测 `本所没有**外部**派活` ×2，见 §2.4）。
2. **"四、组织"块缺少"无院士"变体**：`v5r-charter-org` 的 `researcher`／`temp` 文本**点名领头人**（行 267、290：`本所的领头人是**院士 {{ setting:vmu.institute.leaderId }}**`），但该块的 `kind` 是 `'role'`（行 238）⇒ **没有 leaderless 分支** ✗，与头文自订的铁律"章程绝不能点名一个不在册的领头人"（行 21–22）以及 `docs/26:233`（"临时工再分有/无院士"）冲突 ✓。
3. **雇佣块对院士自相矛盾**：`v5r-charter-hiring.academician` 行 424 写"解雇别人雇的临时工，或增聘/解聘常驻研究员，只能向全所提议，**由院士/所办决定**" —— 读者就是院士本人 ⇒ 与紧随其后的行 426"**院士统筹全所的用人**…可以解雇任何临时工"互相打架 ✓。
4. **回复字段目录三份复制**：`v5r-reply-spec` 的 `researcher`（548–580）、`academician`（581–617）、`temp`（618–647）各约 30 行，差异只在院士多 4 个字段、临时工少 `verdict` ⇒ 任何措辞修订要改三处（维护风险，非错误）✓。
5. **相位表少一种**：`v5r-turn-heading`（674–679）只有 `founding/normal/checkpoint/meeting`；`docs/26:295` 与采集到的语料都还有 **`【会话重建 —— …】`**（`v5r-prompts.js:63–65`）⇒ 若宿主按相位装配，`resume` 相位**落到 `normal` 兜底文本**（行 906）✗（`docs/26:295` 列了五种）。
6. **`v5r-reply-formal` 的句子悬空**：行 660 `← Lean 形式化：{{ setting:vmu.formal.modeLine }}详见提示词里的【Lean 形式化验证】段` —— `modeLine` **没有任何来源**（见 §4）⇒ 渲染成"…：详见…"，引导语消失 ✗。
7. **`v5r-charter-libraries` 里 `{{ member }}` 与 `<你>` 两种写法混用**（行 197–199 用 `Members/{{ member }}/`，行 198–229 又用 `Members/<你>/`）⇒ 同一段里两套记号，读者需要自己换算（§3.10 行 220 只要求前者）✓（可读性问题）。

### 1.2 `vibe-math-vmu/packs/v5r/prompts/v5r-persona.js`（218 行，57 KB）

**是什么**：`scripts/generate-pack-persona.mjs` 从 `prompt-corpus-v5/persona-corpus-v5.json`（sha256 见行 11）生成的 **11 个 persona 段**（`PERSONA_SECTIONS`，order 610–620，行 21–99）＋**20 条 role binding**（`PERSONA_BINDINGS`，行 102–203）＋段名说明表（行 206–218）。

**严重问题（不是"文本写错"，而是"装配语义与数据形状不匹配"）**：
1. **每个变化段都拷贝了 4 份**：`opening`／`roster`／`formats`／`duties`／`thresholds` 各 4 条 binding，其中 **1 条 `role:"academician"` ＋ 3 条 `role:"researcher"`**（行 102–203）⇒ 管线的 `matchingBindings` 会**把同一 section 同一 role 的所有匹配 binding 依次追加**（`kernel/prompt/index.js:421–428`）⇒ 一名研究员拿到**三种研究员版本**（r-1／r-2／r-3）＋基线一份（见 §2.2 实测）。
2. **没有 `temp` binding**（全文 20 条 binding 里 `role` 只有 `academician`／`researcher`）⇒ 临时工只能拿到 **section 的基线文本**，而基线是**院士版采集**（例如行 27 开头"你是「institute」的**院士**"、行 34"**院士 acad（你）**"、行 62"m = 1"）⇒ **临时工会被自己的章程告知它是院士** ✗✗（实测 §2.2：temp 的装配结果 6,537 字**全部**是院士文本）。
3. **基线文本本身是院士快照**：`PERSONA_SECTIONS[i].text` 取的是采集时那一条（`opening` = 院士版，见行 27）；装配时基线**无条件拼在最前**（`kernel/prompt/index.js:264`、`419–420`）⇒ 即使 role 正确，**院士段仍会出现一次**（实测：researcher 的第 1 段就是"你是「institute」的**院士**"，academician 则整份 ×2）。
4. **快照值**：`院士 acad`（行 34、126、131、136、141、171、176、181）、`代号 r-1/r-2/r-3`（行 111／116／121）、`m = 1/2/3`（行 62、186、191、196、201）、`辩论轮次上限 3 轮`（行 62 等）、绝对路径 `VibeMath/Projects/default/Institutes/institute/Members/<acad|r-1|r-2|r-3>/`（行 48、146、151、156、161）—— 这些**在 `v5r-charter.js` 里都已变量化**（`{{ member }}`／`{{ quorum }}`／`{{ setting:vmu.verdict.maxRounds }}`）⇒ 同一条提示词在两份文件里给出**两种保真度** ✓✗。
5. **`v5r-persona-duties` 的标题写死"（院士）"**（行 55、166、171、176、181）而内容对 researcher 其实是"院士领头 + 对你的要求" ⇒ 标题与读者不匹配（研究员也读到"你的组织职责与边界（院士）"）✓。
6. **与 charter 大段重复**：`rules`（行 41）＝ charter 的 `rules`＋`hard-rules`；`duties`（行 55/166）含 charter 的 `truth-note`；`hiring`（行 76）＝ charter 的 `hiring`；`taskboard`（行 83）＝ charter 的 `taskboard`＋`taskboard-leader`（把 leader-conditional 两套**合并成一套院士版**✗）。

### 1.3 `vibe-math-vmu/packs/v5r/prompts/v5r-prompts.js`（120 行，156 KB）

**是什么**：`scripts/generate-pack-prompts.mjs` 从 `prompt-corpus-v5/prompt-corpus-v5.json`（sha256 行 9）生成的 **67 条采集提示词**（`PROMPTS`，行 51–117，一行一条）＋计数（`COUNTS.total=67`／`kinds=31`／`chars=79138`，行 10–14）＋`KIND_HISTOGRAM`（行 15–47）。

**质量判定**：作为**采集证据**它完整、可追溯 ✓（每条的 `id`／`kind`／`owner`／`charterChars` 都在 ✓）。**但它被 `v5r-core.js:34–40` 逐条变成 pack section**，于是采集期的**快照值**会**原样进入装配**：
- **`轮次 N` 字面值**：66/67 条命中，12 个不同值（`轮次 1`…`轮次 12`）—— 同一份提示里**标题**已是 `【第 {{ round }} 轮 …】`（变量 ✓），**状态块**却写死 `轮次 6`（行 51 等）⇒ **自相矛盾** ✗✗（`docs/26:187–193` 明确要求换成变量）。
- **`有表决权者 N 人` 字面值**：66/67 条，4 个值（1/2/3/4）⇒ 与 `m={{ quorum }}` 并排出现 ⇒ 同一个 block 里"法定票数"是变量、"人数"是快照 ✗。
- **绝对路径**：64/67 条含 `VibeMath/Projects/default/Institutes/institute/Shared/Protocol.md`（项目／研究所名写死）✗。
- **身份标签写死**：46/67 条写死 `你是 {{ member }}（常驻研究员）` ✗ ⇒ **`{{ member }}` 是变量而角色是字面值**，临时工/院士若拿到该段就会被叫成常驻研究员 ✗（`docs/26:307` 明确要求显示名走 `roleLabel`）。
- **标题用了错误的变量**：语料标题写作 `【第 {{ round }} 轮 —— {{ role }} {{ member }}】`，而 `role` 是**种类键**（`academician|researcher|temp`）不是显示名 ⇒ 实测把 67 段装成一份提示时得到 **50 处 `—— researcher r-1】`、0 处 `—— 常驻研究员 r-1】`** ✗✗（charter 的同位文本用的是 `{{ roleLabel }}`，行 676；`docs/26:307` 正是为此把两者分开）。
- **能力快照**：61/67 条写死"`math_computation`：可用引擎 无。" ✗ ⇒ 与 `docs/26:370`（能力**按当时现算**）相反；真正的每轮值在 `v5r-core.js` 的 `v5r-brief-status`（`{{ statusBlock }}`，行 529）里 ✓。
- **任务板计数快照**：9/67 条含 `[任务板] 进行中 N｜可认领 M`（3 种组合）✗。
- **任务／成员字面 id**：`acad` 15/67、`r-1|r-2` 13/67、`t-1|t-2|t-999` 11/67 ✗。
- 元数据 `"charterChars":797`（行 56 等）是采集期度量 ⇒ **(c)** ✓。
- **重复度**：每条尾部都有同一段 ~700 字回复目录＋状态块 ⇒ 67 段拼成一份 **78,136 字**的提示（实测 §2.4）；作为"section"显然不应整体投递 ✗。

### 1.4 `vibe-math-vmu/packs/v5r/prompts/v5r-core.js`（215 行）

**是什么**：pack 清单（`PACK`：id/version/description、`requires`、两个 code、settings 默认层、slots、tracks、M1 规则、M2 模块中间件、aliases、`prompts` 元数据，行 43–179）＋把语料变成 section 的桥（`v5rPromptSections`，行 34–40）＋`v5rRoleSection`（order 601，行 202–212）＋`v5rTurnSections`（行 215）＋两个 getter（行 150–152）。

**文本／数值**：
- `settings` 层（行 65–75）：`quorumRule:'m-unanimous'`、`quorumCap:3`、`reconsiderFloor:0`、`verdictMaxRounds:3`、`hardLimitMs:1800000`、`wakeRetries:5`、`pointerPropagation:true`、`requireSettledRecords:true` ⇒ **这些都是数据层**（**(a)** ✓）；但它们与 `docs/04 §11` 的键名要一致 ⇒ 见 §5 的**键名错配**（`verdictMaxRounds` vs 章程里的 `vmu.verdict.maxRounds`）。
- `slots`（行 78–82）：`capacity:1`（主持人）、`capacity:0`（成员，含义未注明是"无限"还是"零"✗）、`capacity:12`（临时工）⇒ 声明层数据 **(a)** ✓，但"12"与"0"缺少注释会误导读者 **(c)** ✓。
- 规则／中间件文案（行 99、128–129）：面向操作者的中文说明，通顺 ✓（**(a)**）。
- `v5rRoleSection`（行 208–211）：`【本轮面向的成员】代号：{{ member }} ｜角色：{{ role }} ｜阶段：{{ phase }}` ⇒ **第二处把 `{{ role }}` 当显示名用** ✗（这里显示的会是 `researcher`）✓。
- **`v5r-core.js` 只 import 了语料与 persona（行 20、184），没有 import `v5r-charter.js`** ⇒ pack 声明的 section = **语料 67 段＋persona 11 段**（行 187）⇒ 手写、已变量化的章程**不在运行时路径上** ✗✗（见 TOP-5 第 5 条）。

### 1.5 `vibe-math-vmu/kernel/prompt/index.js`（518 行）

**是什么**：提示词管线（段注册／四维绑定／白名单变量替换／截断告知／快照）。关键行：
- 白名单：行 50 `['member','role','roleLabel','phase','time','pack','task','roster','round','quorum','statusBlock','setting:','count:']`。
- 变量替换：行 269–284；**未登记变量⇒具名拒**（行 275–278）✓；**取值缺失⇒返回空串**（行 283）✗（见 §4）。
- 绑定语义：行 421–428 **把每个匹配的 binding 依次 `+ '\n' + extra`** ⇒ 同 section 同 role 的重复 binding 会**叠加**（persona 的 3 条 researcher binding 就是这样变成三份的）。
- 段基线：行 264 `if (entry.text !== null) return entry.text` ⇒ section 自带文本**对所有 role** 生效（persona 的院士基线因此泄漏给所有角色）。
- `entry.vars` 只被记录（行 189）**从不校验** ✗ ⇒ 本可自动发现"声明了变量却无人供值"。
- 其余：不可变 `state`（行 166–168、312–323）✓、确定性排序（行 361）✓、截断不静默（行 287–306）✓、`ORDER_RANGES` 禁止 pack 抢 kernel 区间（行 24–30）✓。

### 1.6 `vibe-math-vmu/settings/schema.js`（1356 行）＋`planned.js`

**与本审查相关的部分**：`vmu.turn.objective`（schema:131）、`vmu.turn.maxParallel|toolCallsPerTurnCap|memoryCeilingMb`（135–137）、`vmu.formal.currentProof|blockedNote|rootRel|modeLabel`（144–147）、`vmu.pointer.propagation`（141）、`vmu.records.pointerPropagation`（82）。
**缺失**：`vmu.institute.name`／`vmu.institute.leaderId` —— **只在 `settings/planned.js:68–69` 以 `type:'planned'` 声明**（按仓库口径＝"声明但未接线"，`docs/04-settings.md:257` 对同类键明确写"⚠️ 未接线"）；`vmu.member.hiredBy`／`vmu.member.direction`／`vmu.member.term`／`vmu.verdict.maxRounds`／`vmu.meeting.current`／`vmu.formal.modeLine` —— **schema 与 planned 里都没有** ✗。

### 1.7 `docs/26 §3.9–3.18`（作为判据）

§3.9（行 181–202）给出**列举式**替换表并立下"装配后不得残留具体成员名与具体轮次"的门禁线；§3.10（204–251）给出十一段与分支（其中行 216 明确 `member.term/hiredBy/direction` 走 `{{ setting:… }}` **或循环按成员事实填**；行 217、233 明确"无院士"要换段）；§3.13（289–310）给出 8 段骨架并把 `role`／`roleLabel` 分工写明；§3.14（312–330）要求资源数字全部走 settings；§3.16（348–364）宣告指针契约开关为 `vmu.pointer.propagation`；§3.19（400–417）就是本次审查方法的由来。
**对照结果**：charter 大体按这份施工图建成 ✓；**persona 与语料这两份"采集物"没有被这份施工图处理** ✗ —— 它们仍是快照，却被 pack 当作 section 声明 ✓。

---

## 2. 硬编码值清单（`file:line | snippet | 类别 | 为什么 | 建议`）

> "snippet"为原文摘录（为可读性只取片段）。行号以当前文件为准。

| # | file:line | snippet | 类别 | 为什么important | 建议 |
|---|---|---|---|---|---|
| 1 | `v5r-persona.js:34`（同 126/131/136/141） | `· **院士 acad（你）** —— 本所领头人…` | **(b)** | 具体成员 id 进入**所有 role 的基线**；`docs/26:202` 明令装配后不得残留具体成员名 | 换成 `{{ member }}`／`{{ roleLabel }}`；基线段改为 role 无关文本 |
| 2 | `v5r-persona.js:62`（同 186/191/196/201） | `至少有 m = 1 名有表决权者` / `m = 2` / `m = 3` | **(b)** | 同一 section 的 4 条 binding 会**全部**追加 ⇒ 一份提示同时说 m=1、m=2、m=3（实测） | 用 `{{ quorum }}`（charter 行 343 已如此） |
| 3 | `v5r-persona.js:62`、`186` 等 | `辩论轮次上限 3 轮` | **(b)** | 轮次上限是设置（`vmu.meetings.verdictMaxRounds`，`v5r-core.js:69`） | `{{ setting:vmu.meetings.verdictMaxRounds }}` |
| 4 | `v5r-persona.js:111/116/121` | `代号 r-1` / `r-2` / `r-3` | **(b)** | 三个研究员版本堆叠；且 `r-N` 是采集期成员 | `{{ member }}`；每个 role 只留**一条** binding |
| 5 | `v5r-persona.js:48/146/151/156/161` | `VibeMath/Projects/default/Institutes/institute/Members/acad/` | **(b)** | 项目／研究所／成员三层写死；charter 同行用 `Members/{{ member }}/` | 引入 `{{ setting:vmu.institute.rootRel }}` 之类（或复用 `{{ member }}` 相对式） |
| 6 | `v5r-persona.js:27/106/111/116/121` | `你是「institute」的**院士**` | **(b)** | 研究所名写死；且**对所有 role 都会出现** | `{{ setting:vmu.institute.name }}`＋按 role 绑定 |
| 7 | `v5r-persona.js:102–203`（20 条 binding，无 `temp`） | `{"section":"v5r-persona-opening","role":"researcher","text":…}` ×3 | **(b)** | 同 section 同 role 多条 ⇒ 管线**全追加**；`temp` 缺 binding ⇒ 拿院士基线 | role 维应**唯一**；补 `temp`；或把 role 文本做成**段**而不是重复 binding |
| 8 | `v5r-prompts.js:51–117`（66/67 条） | `[状态] 你是 {{ member }}（常驻研究员）｜轮次 6｜法定票数 m={{ quorum }}｜有表决权者 3 人` | **(b)** | 同一行里三个变量＋两个快照（`轮次 6`、`有表决权者 3 人`）⇒ 自相矛盾 | 生成器应把 `轮次 N`→`{{ round }}`、`N 人`→`{{ count:voters }}`（或整段换成 `{{ statusBlock }}`） |
| 9 | `v5r-prompts.js:51` 等（50 处） | `【第 {{ round }} 轮 —— {{ role }} {{ member }}】` | **(b)** | `role` 是种类键 ⇒ 标题渲染成 `—— researcher r-1】`（实测 50 处；`roleLabel` 0 处） | 改 `{{ roleLabel }}`（`docs/26:307`；charter 行 676 已正确） |
| 10 | `v5r-prompts.js:51–117`（64/67 条） | `VibeMath/Projects/default/Institutes/institute/Shared/Protocol.md` | **(b)** | 绝对路径写死项目／研究所名；每份提示重复 | 走一个 `{{ setting:vmu.institute.protocolRel }}`（或 `{{ statusBlock }}` 里的现算行） |
| 11 | `v5r-prompts.js:51` 等（61/67 条） | `math_computation：可用引擎 无。` | **(b)** | 能力快照；真实能力应按轮现算（`docs/26:370`） | 删掉这段（它属于 `{{ statusBlock }}` 的现算内容） |
| 12 | `v5r-prompts.js:51–55` 等（9 条） | `[任务板] 进行中 0｜可认领 1｜我负责 无` | **(b)** | 任务板是每轮现算事实（`docs/26:264`） | 同上：交给 `{{ statusBlock }}` |
| 13 | `v5r-prompts.js:51–55`、`73`、`80–82` 等 | `任务 t-1 当前 revision 是 1，不是 99` / `由 acad 分派` / `t-999` | **(b)** | 具体任务与成员 id；`t-999` 是刻意构造的异常值 | 语料保留（证据 ✓），但**不得**作为 section 投递 |
| 14 | `v5r-charter.js:51/52/56` | `由 {{ setting:vmu.member.hiredBy }} 雇入`、`用途：{{ setting:vmu.member.direction }}`、`任务期至：{{ setting:vmu.member.term }}` | **(b)** | 这三个键 schema/planned 都没有 ⇒ **渲染成空串**（实测 `由  雇入`、`任务期至：。`） | 改为循环按成员事实供值（`docs/26:216` 的后半句），或登记真键并由 loop 注入 |
| 15 | `v5r-charter.js:267/290` | `本所的领头人是**院士 {{ setting:vmu.institute.leaderId }}**` | **(b)** | `leaderId` 只在 `planned.js:69`（未接线）⇒ 空串 ⇒ "**院士 **" | 补真键＋循环注入；或整块改为 leader-conditional（含 leaderless 文本） |
| 16 | `v5r-charter.js:353/373` | `辩论轮次上限 {{ setting:vmu.verdict.maxRounds }} 轮` | **(b)** | **键名错**：pack 自己的设置是 `vmu.meetings.verdictMaxRounds`（`v5r-core.js:69`）⇒ 渲染成"上限  轮"（实测 ×2/角色） | 改用 `vmu.meetings.verdictMaxRounds`（或把该键登记为别名） |
| 17 | `v5r-charter.js:660` | `Lean 形式化：{{ setting:vmu.formal.modeLine }}详见…` | **(b)** | `modeLine` 无来源 ⇒ 引导语消失；同族已有 `modeLabel`（schema:147） | 用 `modeLabel`，或补 `modeLine` 并接线 |
| 18 | `v5r-charter.js:678` | `【研究所会议 {{ setting:vmu.meeting.current }} 进行中 —— …】` | **(b)** | `vmu.meeting.current` 无来源（schema 里是 `vmu.meetings.*`）⇒ 会议标题丢 id | 用 loop 注入的 `{{ setting:vmu.meetings.currentId }}`（或新增 `{{ meeting }}` 变量） |
| 19 | `v5r-core.js:208–211` | `｜角色：{{ role }} ｜阶段：{{ phase }}` | **(b)** | 面向成员的展示行用了种类键 | `{{ roleLabel }}` |
| 20 | `v5r-charter.js:907` | `text: … (b.texts['with-leader'] \|\| b.texts.researcher \|\| '')` | **(b)** | 给**所有角色**的默认文本取了 `researcher` 版 ⇒ 基线角色错位（与 persona 同病） | `role` 类段不要给"默认文本"，只给绑定；或让默认随 `ctx.role` 解析 |
| 21 | `v5r-charter.js:19–20`（注释） | `member.id -> {{ member }}` / `member.kind -> {{ role }}`（绑定维） | **(c)** | 注释里的对照表：把 `role` 写成面向读者的身份 | 注释点明 `roleLabel` 才是显示名 |
| 22 | `v5r-prompts.js:56` 等 | `"charterChars":797` | **(c)** | 采集期度量（长度会随运行变化） | 保留（证据），但注明它**不是**运行时字段 |
| 23 | `v5r-core.js:78–82` | `capacity: 1` / `capacity: 0` / `capacity: 12` | **(a)/(c)** | 声明层数据 ✓，但 `0` 的含义（无限/零）未注明 | 补一句注释 |
| 24 | `v5r-core.js:65–75` | `quorumCap:3`、`hardLimitMs:1800000`、`wakeRetries:5` … | **(a)** | 属于 pack 的机制默认层（数据 ✓） | 无需改；仅需与章程/文档同键名 |
| 25 | `v5r-charter.js:730–734` | `每轮最多同时唤醒 {{ setting:vmu.turn.maxParallel }} 名…` | **(a)** | 全部走 settings（`docs/26:318–320`）✓ | —— |
| 26 | `v5r-charter.js:551–575` 等 | 回复目录里的示例 `{"to":"r-2"…}`、`"t-3"`、`"expected_revision":2`、`"contextPct": 40` | **(c)** | 这些是**示例值**（散文的一部分）✓，但 `r-2`／`t-3` 恰好是真实存在的 id，读者可能误以为是约定 | 示例改成中性记号（`r-x`／`t-x`／`contextPct: <0-100>`） |
| 27 | `v5r-charter.js:699`、`v5r-persona.js:48` 等 | `例如 Members/acad/Progress/progress.md` | **(c)** | 说明性举例 ✓（但仍是具体成员名） | 可选：改 `Members/<你的 id>/…` |
| 28 | `v5r-prompts.js:51–117` | 每条尾部同一段 ~700 字回复目录／状态块 | **(c)** | 采集重复 ✓（不是错误），但说明语料**不能**整体当 section | 见 §6 建议 |

---

## 3. 每个 `{{ … }}` 占位符：白名单 ＋ 是否真有人供值

白名单（`kernel/prompt/index.js:50`）：`member, role, roleLabel, phase, time, pack, task, roster, round, quorum, statusBlock, setting:, count:`。
供值点（`kernel/turn/index.js:194`，`assemble()` 里的 `prompt.assemble({…})`；`open()` 的默认参数在 `:168`）：`{ member, role, roleLabel, phase, task, roster, quorum, statusBlock, round, settings }` —— **只有这些**。

| 占位符 | 出现次数（四个 pack 文件合计） | 白名单 | 供值 | 结论 |
|---|---|---|---|---|
| `{{ member }}` | 157 | ✓ | turn loop | ✓ |
| `{{ roster }}` | 73 | ✓ | turn loop（每轮现填） | ✓ |
| `{{ quorum }}` | 69 | ✓ | turn loop | ✓ |
| `{{ role }}` | 67 | ✓ | turn loop（**种类键**：`academician/researcher/temp`） | ✓ 但**当显示名用是错的**（见清单 #9／#19） |
| `{{ round }}` | 25 | ✓ | turn loop | ✓ |
| `{{ roleLabel }}` | 4 | ✓ | turn loop | ✓ |
| `{{ phase }}` | 1 | ✓ | turn loop | ✓ |
| `{{ statusBlock }}` | 1 | ✓ | turn loop（循环自己组块，`docs/26:268`） | ✓ |
| `{{ setting:vmu.turn.objective }}` | 9 | ✓ | schema:131 | ✓ |
| `{{ setting:vmu.turn.maxParallel / toolCallsPerTurnCap / memoryCeilingMb }}` | 各 1 | ✓ | schema:135–137 | ✓ |
| `{{ setting:vmu.formal.currentProof / blockedNote / rootRel / modeLabel }}` | 各 1 | ✓ | schema:144–147 | ✓ |
| `{{ setting:vmu.institute.name }}` | 4 | ✓ | **只有 `planned.js:69`（未接线）** | ✗ **空串** |
| `{{ setting:vmu.institute.leaderId }}` | 3 | ✓ | **只有 `planned.js:68`（未接线）** | ✗ **空串** |
| `{{ setting:vmu.verdict.maxRounds }}` | 2 | ✓ | **无人声明**（真键是 `vmu.meetings.verdictMaxRounds`） | ✗ **空串** |
| `{{ setting:vmu.member.hiredBy / direction / term }}` | 各 1 | ✓ | **无人声明** | ✗ **空串** |
| `{{ setting:vmu.meeting.current }}` | 1 | ✓ | **无人声明** | ✗ **空串** |
| `{{ setting:vmu.formal.modeLine }}` | 1 | ✓ | **无人声明** | ✗ **空串** |

**为什么"空串"是缺陷而不是"缺省宽松"**：`kernel/prompt/index.js:283` 对缺失取值返回 `''`、**不拒也不报告** ⇒ 具名拒只覆盖"**未登记变量名**"（行 275–278），**覆盖不了"登记了但没人供值"** ✗ ⇒ 成员会读到语法破碎、语义矛盾的句子（下面实测），而 `docs/26:343` 的 T84"无遗留占位"门禁**只能**发现残留的 `{{ }}`，**发现不了被清成空的**。

**实测（把 charter 段按声明装配，settings 只给 schema 里真存在的键）**：
- `role=temp` ⇒ `由  雇入` ×1、`任务期至：。` ×1 ✗
- 三个角色都出现 `辩论轮次上限  轮` ×1～2 ✗、`本所的领头人是**院士 **` ×1～2 ✗
- `role=researcher/academician` 另有 `代号 r-1` ×2（基线＋绑定）✗

---

## 4. 读起来像"某一次运行快照"而不是"可复用模板"的块

1. **整个 `v5r-persona.js`（行 21–203）**：`院士 acad`、`代号 r-1/r-2/r-3`、`m = 1/2/3`、`辩论轮次上限 3 轮`、`VibeMath/Projects/default/Institutes/institute/Members/<acad|r-1|r-2|r-3>/` —— 一次运行的四名成员、一个研究所、三个法定票数 ✗。
2. **整个 `v5r-prompts.js`（行 51–117）**：67 条**采集**提示，含 `轮次 1..12`、`有表决权者 1..4 人`、`acad`／`r-1`／`t-999`、任务板计数、`可用引擎 无` ✗（作为证据 ✓；作为 section ✗）。
3. **`v5r-charter.js` 的 `v5r-charter-roster`（行 92–116）**：`· **院士 {{ member }}（你）**` —— 这句**只在读者是院士时成立**，而该块的基线（`CHARTER_SECTIONS` 默认，行 907）会把它送给所有人 ✗（实测：researcher 的装配里也出现）。
4. **`v5r-charter.js:199` 的"例如 `Members/acad/Progress/progress.md`"** —— 举例用了采集期成员 ✓（可接受，但同一文件其它处已改成 `{{ member }}`，前后不一致）。
5. **`v5r-charter.js:551–575` 的回复目录示例**：`{"to":"r-2"…}`、`"t-3"`、`"contextPct": 40` —— 示例值恰好是真实 id/轮次，容易被读成约定 ✗（低危）。

---

## 5. TOP 5 缺陷（按严重度）

**① persona 的重复 binding ＋ 院士基线泄漏 ⇒ 一名研究员收到自相矛盾的 18,528 字章程（实证）**
- 现象：`createPromptPipeline({sections: PERSONA_SECTIONS, bindings: PERSONA_BINDINGS}).assemble({role:'researcher',…})` ⇒ **"你是「institute」的**院士**" ×1、"你是…常驻研究员" ×3、`代号 r-1/r-2/r-3` 各 ×1、`院士 acad` ×7、`m = 1` ×2 & `m = 2` ×1 & `m = 3` ×1、`辩论轮次上限 3 轮` ×4**。
- 根因：`v5r-persona.js:102–203` 每个 section 对 `researcher` 有 3 条 binding；`kernel/prompt/index.js:421–428` 对匹配 binding **全追加**；`kernel/prompt/index.js:264` 又把院士版基线无条件放最前。
- 影响：成员被同时告知自己是"院士"和三名不同研究员，并读到三个互斥的法定票数 ⇒ 求真门禁的**口径被自己模糊掉**。
- 修法：① 每个 `(section, role)` 只留 1 条 binding；② role 变化改用**段＋绑定**而不是把整块复制 4 份；③ section 的 `text` 不要放角色专属版本（去掉 `docs/26:907` 式默认）。

**② `temp` 没有任何 persona binding ⇒ 临时工拿到院士章程（实证：6,537 字全部为院士文本）**
- 根因：`v5r-persona.js` 20 条 binding 的 `role` 只有 `academician`／`researcher`；管线对无匹配 binding 的 section 回落到 `entry.text`（= 院士采集，行 27/34/62）。
- 影响：临时工读到"你是本所院士""你有表决权"等**权限错误的指令**（临时工**无表决权**是章程自己的硬规则，行 381–383）。
- 修法：补 `temp` binding（可从 `v5r-charter.js` 的 temp 文本派生）；并在生成器里**按 role 校验绑定完备性**（见 ⑤的建议）。

**③ 8 处"登记了却无人供值"的 `setting:` ⇒ 静默空串，句子破碎（实证）**
- 清单：`vmu.institute.name`(×4)、`vmu.institute.leaderId`(×3)、`vmu.member.hiredBy|direction|term`、`vmu.verdict.maxRounds`(×2)、`vmu.meeting.current`、`vmu.formal.modeLine`。
- 实测症状：`由  雇入`、`任务期至：。`、`辩论轮次上限  轮`、`本所的领头人是**院士 **`、`【研究所会议  进行中 …】`。
- 次生问题：`vmu.verdict.maxRounds` 与 pack 真正设置的 `vmu.meetings.verdictMaxRounds`（`v5r-core.js:69`）**键名不一致**；`institute.*` 只有 `planned` 声明（`planned.js:68–69`）。
- 修法：① 章程改用真键；② `member.*` 改由 loop 按成员事实注入（`docs/26:216` 允许）；③ 在管线里把"取了空值的 `setting:`"记为**可见的 trace**（甚至按 `vmu.prompts.missing` 策略具名拒），否则这类缺陷永远只能靠人工读文本发现。

**④ 语料 67 段被当作 section 声明 ⇒ 快照值可直接进入装配（实证：拼成 78,136 字，标题渲染 50 处 `researcher`）**
- 根因：`v5r-core.js:34–40` 把每条采集提示变成 pack section，`v5r-core.js:187` 又把它与 persona 一起作为 `sections` 声明；而语料里的 `轮次 6`／`有表决权者 3 人`／`acad`／Protocol 绝对路径／`可用引擎 无` **都是采集值** ✗。
- 影响：任何按 `docs/26` §4 第 5 条（`docs/26:425`）"`sections: [...ownSections, ...collectPackSections([PACK])]`"接线的宿主，会把 67 条含残留快照的提示**叠成一份**；`docs/26:202` 的"无残留"纪律被绕过。
- 修法：语料**只作证据**（保留 sha256 与 `prompts` 元数据 ✓），**不进 `sections`**；若要保留可读性，改为**一份**“示例语料”段并显式标注"采集样例，非投递文本"。

**⑤ charter 与 persona 是同一套 11 段的两个保真度版本，而运行时接的是**较差的**那份**
- 事实：`v5r-core.js` 只 import 语料与 persona（行 20、184）；`v5r-charter.js` 全仓**只被 `tests/vmu-turn.test.mjs:19` 引用** ⇒ 手写、已变量化、按 §3.10 分支齐全的章程**不在任何运行时路径**上；被声明的是**快照版** persona。
- 影响：`docs/26:217/235/251` 要求的分支与变量（`leaderId` 换段、`m`、`verdictMaxRounds`）在 charter 里做到 ✓、在 persona 里**都没有** ✗ ⇒ 目标与实现错位。
- 修法：把 charter 升为 pack 的正式 `sections`（顺序避开 persona 的 610–620，charter 用 700–750 ✓），persona 退为**证据/对照**；或反过来只保留一份并删去另一份，避免"两份都改、只走一份"。

**次高（值得排进下一批）**：charter 的"分工段被读两遍"（清单 #7／§1.1-1）与 `v5r-charter-org` 缺 leaderless 变体（§1.1-2）；`v5r-charter-hiring.academician` 对院士自称"由院士决定"（§1.1-3）；charter 相位表缺 `【会话重建】`（§1.1-5）。

---

## 6. 建议的修法顺序（不改代码，仅建议）

1. **先修"装配语义"**（TOP-1/2）：`PERSONA_BINDINGS` 按 `(section, role)` 去重、补 `temp`、`PERSONA_SECTIONS[*].text` 改为 role 无关文本（或空），再跑一次本次的装配探针，确认"每个身份只出现一次、`m` 只有一个值"。
2. **再修"变量与键名"**（TOP-3）：统一为 `vmu.meetings.verdictMaxRounds`；给 `vmu.member.*`／会议 id 定义**由 loop 注入**的事实变量；把 `vmu.institute.*` 从 `planned` 提升为真键（或在章程里改用 loop 注入）。
3. **把语料从 section 里摘出来**（TOP-4），只留 `prompts` 元数据＋一个显式"样例"段。
4. **决定单一真源**（TOP-5）：charter 上位、persona 退为对照，或反之；并在 `docs/26` 里写清谁是运行时真源。
5. **加机器门禁**（治本，可放进现有门禁体系）：① 生成器按 role 校验绑定完备性（每个 section × 每个 role 恰一条，或显式声明"回落"）；② 管线对"取到空值的 `setting:`"计数并可具名拒；③ 重新启用 `docs/26:202` 的"装配后无具体成员名/轮次"检查（charter 侧建议按 `CHARTER_SECTIONS` 跑，语料侧不作为投递文本）。

---

## 7. 不确定与未覆盖（如实记账）

- `{{ }}` 里的空键（`{{ }}`，1 处）来自**代码/注释文本**而非提示词正文；我未追到具体行，按"注释里的写法"处理（**(c)**，不影响结论）。
- `settings/planned.js` 里 `vmu.institute.name/leaderId` 的 `type:'planned'` 语义我按 `docs/04-settings.md:257` 的同类键（"⚠️ 未接线"）推断；**我未在运行时实测**这两个键被设置后是否有行为变化 ⇒ 若宿主自行把这两个键塞进 settings，也可能"恰好"填上（但 schema 校验与 `planned` 语义都不支持，故仍判 `(b)`）。
- persona 的 20 条 binding 是**采集**产物；"同一 role 多条 binding 会被全部追加"是我**读 `kernel/prompt/index.js:421–428`＋实测**得出的，不是文档明写的设计 ⇒ 若作者本意是"同一 role 只保留最后一条"，那这属于**实现与意图不一致**，结论（会产生重复）不变。
- 我没有运行任何门禁／测试套件（按要求）；所有"实测"均为**只读**地用公开导出装配出的文本，未写入仓库文件。
- 语料我只做**全文模式扫描＋抽样通读**（120 行文件，逐行都是长行）：模式统计覆盖 67/67 条，逐条通读的是前 9 条与按需抽样；`paper-*`／`lean-*` 段未逐字通读（若需，下一轮可补）。
- ⚠ **并发改动**：审查期间 `vibe-math-vmu/docs/26-turn-orchestration.md` 与 `vibe-math-vmu/kernel/turn/index.js` 正被其他任务修改（`git status` 显示二者为 `M`）。本报告的所有行号是**复核过的当前值**（`docs/26` 的 §3.9／3.10／3.11／3.13／3.14／3.16／3.19 分别在 181／204／253／289／312／348／400，关键行 202／216／217／230／233／268／307／318／364／414 逐条用 `Select-String` 重定位过 ✓；`kernel/turn/index.js` 的 `prompt.assemble({…})` 在 `:194`、`open()` 在 `:168`）。**四个 pack 文件与 `kernel/prompt/index.js`、`settings/*` 未被改动** ⇒ 它们的行号稳定 ✓。
- 我未检查 `vibe-math-v5r/vibe-math-v5r.js`（原版源码，6100+ 行）的对应片段；本报告对"原版怎么读"的判断只引用 `docs/26` 的转述与其自带的原版行号（如 L3131–3361、L3978–4047），**未独立回读原版** ⇒ 若需与源码逐条对拍，请另开一轮（`docs/26:400–417` 的"源码对照"方法）。

---

## 8. 怎么查的（读过什么、读到哪一行）

- `vibe-math-vmu/packs/v5r/prompts/v5r-charter.js`：**全文 1–908 行**（含头文 1–30、块定义 31–882、绑定导出 884–908）。
- `vibe-math-vmu/packs/v5r/prompts/v5r-persona.js`：**全文 1–218 行**（sections 21–99、bindings 102–203、headings 206–218）。
- `vibe-math-vmu/packs/v5r/prompts/v5r-prompts.js`：头 1–50（sha/计数/直方图）＋正文 51–117 **逐行模式扫描（67/67 条）**＋抽样逐字读（51–59、63–65、73、80–82 等）。
- `vibe-math-vmu/packs/v5r/prompts/v5r-core.js`：**全文 1–215 行**。
- `vibe-math-vmu/kernel/prompt/index.js`：**全文 1–518 行**（白名单 50；替换 269–284；装配 405–444；绑定 205–244）。
- `vibe-math-vmu/kernel/turn/index.js`：150–229（`open` 169–180、`assemble` 182–201、投递 203–212），并用 195 行的实参列表作为"谁供值"的依据。
- `vibe-math-vmu/settings/schema.js`：与本审查相关的键逐条 grep（`vmu.turn.objective` 131、`vmu.turn.*` 135–137、`vmu.formal.*` 144–147、`vmu.pointer.propagation` 141、`vmu.records.pointerPropagation` 82）；`settings/planned.js` 68–69。
- `vibe-math-vmu/docs/26-turn-orchestration.md`：§3.9–3.19（**全文 181–417 行**）。
- 交叉证据（只读、不落盘）：三个临时脚本（在仓库外的 `_oneoff/` 下，已删除）
  1. 语料模式扫描：对 67 条统计 `轮次 \d+`、`有表决权者 \d+ 人`、`acad`、`r-N`、`t-N`、`VibeMath/Projects/...`、`你是 {{ member }}（常驻研究员）`、`可用引擎 无`、`{{ }}` 等，并给出每个命中的 `id@行号`；
  2. 真实装配探针：用 `createPromptPipeline` ＋ `PERSONA_SECTIONS/PERSONA_BINDINGS` 与 `CHARTER_SECTIONS/CHARTER_BINDINGS` 分别对 `academician/researcher/temp` 装配，统计重复片段与空替换；
  3. 占位符清单：对四个 pack 文件抽取全部 `{{ }}`，逐项给出白名单判定与供值来源（`schema`／`planned`／loop）。
- **未运行**：任何门禁或测试套件；**未修改**：除本文件外的任何文件。
