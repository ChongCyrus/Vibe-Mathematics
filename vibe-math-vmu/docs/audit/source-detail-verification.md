# 源细节核验：v5r 原版 vs vmu 移植

> 角色：SOURCE-DETAIL VERIFIER。**只写本文件**；未 commit/push；未跑全量门禁。
> 权威源：`vibe-math-v5r/vibe-math-v5r.js`（约 11,600 行）。移植：`vibe-math-vmu/**`。

## 1. 范围与方法（我实际读了哪些行）

**读到的原版行（逐字，`vibe-math-v5r/vibe-math-v5r.js`）**
- `3980–4020`：**回复字段目录**（提示词里的 `say`／`progress`／`record`／`propose_verify`／`verdict`／`propose_meeting`／`convene_meeting`／`assign`／`prioritize`／`nudge`／`task_create`／`task_claim`／`task_done`／`task_update`／`input`／`formal`／`reject_assign` 等，逐条列在 3988–4018）；
- `5820–5824`：`parsed.contextPct` ⇒ `contextPct.set(member.id, clPct(...))`；`parsed.compacted` ⇒ `seeds.set(member.id, String(parsed.progress || parsed.summary || '').slice(0, 4000))`；
- `3531`（`say`）、`3569`（投递后踢调度）、`3709–3729`（子代理上限与具名拒）、`3750`（限流句**每 ROUND 一行**）、`3788–3790`（charter 冻结于 hire）；
- `1595`／`1640`（可授权命令集）、`2006`（决议≠真值）、`2218–2259`（会议等级）、`2277–2305`（秘书）、`2346–2396`（动议/附议）、`2444`（inputs 与 gap）、`2824–2845`（表决轮上限）、`9364`（`handleReply`）、`11556`（`parseReply`）；
- 路径构造用 `instRel(...)` 的实证行（此前的 progress 路径核验）：`8137`、`10433`（`out.push(instRel('Members/' + m.id + '/Progress/progress.md') …)`）。

**读到的移植行**
- `vibe-math-vmu/kernel/prompt/index.js`：`21`（apiVersion）、**`24` `ORDER_RANGES`**、**`50` `VARIABLE_WHITELIST`**、`53` `BINDING_PRIORITY`、`71` `createPromptPipeline`、`176–190` `disable`/`enable`（**关掉＝零注入**）、`193–233` `register`（`order` 缺省 600；`state` 不可变；重名拒绝）、`333` 变量缺值拒绝、`358` 截断计数、`377` 内建 `state` 段（不可变）、`419` 排序（order→name 稳定）、`481–520` 绑定/覆盖/追加、`538–558` `override`/`rollback`、`587–593` `status`；
- `vibe-math-vmu/kernel/turn/index.js`：**`30–45` `FIELD_OWNERS`（12 个字段 → face/op）**、`45` `FIELDS`、`47` `PHASES`、`57` `extractFence`、`67` `facesFrom`、`136` `createTurnOrchestrator`；
- `vibe-math-vmu/packs/v5r/prompts/v5r-prompts.js`：**`49`（语料说明："one entry per corpus prompt, in corpus order. `id` is `<kind>#<n>` and is stable"）**，语料条目 `51–117`（逐条含 `id`/`kind`/`owner`/`toolFilter`/`charterChars`/`text`）。

**跑过的命令**：仅只读 `grep`／`read`（无写入、无测试、无门禁）。

---

## 2. 发现表

| # | 原版证据（file:line + 引文） | 移植对应（file:line） | 判定 | 需要做什么 | 置信度 |
|---|---|---|---|---|---|
| D1 | `vibe-math-v5r.js:5820` `if (parsed.contextPct !== undefined) contextPct.set(...)`；`:5821–5824` `if (parsed.compacted) { … seeds.set(…).slice(0,4000) }` | `kernel/turn/index.js:30–45` **无** `contextPct`／`compacted`（`FIELDS` L45 由该表派生） | **MISSING** | 给这两个字段加 owner（如 `vmu.metrics/observe`、`vmu.records/seed`），并在回合收尾对齐 5821–5824（含 `slice(0,4000)` 的**计数式截断**） | 高 |
| D2 | 同 D1：`pack` 语料**仍写着** `contextPct…compacted:true只表示已在progress保存摘要`（`packs/v5r/prompts/v5r-prompts.js:57`、`58`、`63`、`100`） | 同上：语料说了、派发表没有 | **PARTIAL**（自相矛盾） | 要么接线（同 D1），要么在语料里标注"该字段在本移植中未接线" | 高 |
| D3 | 原版用 `instRel(...)` 在**运行时**拼研究所相对路径（`vibe-math-v5r.js:8137`、`10433`） | `packs/v5r/prompts/v5r-prompts.js:51`、`56`、`63`、`113`、`117` 等处**把绝对形态路径写进语料文本**：`VibeMath/Projects/default/Institutes/institute/Shared/Protocol.md`、`…/Members/{{ member }}/Progress/progress.md` | **HARD-CODED** | 研究所根/项目名应来自设置（如 `vmu.core.workspace`+项目名变量），语料里改成变量或占位；否则换工作区/改名即失效 | 高 |
| D4 | 原版提示词里"有表决权者 **N** 人""轮次 **N**""任务 t-1/t-2""对象 p-lean-a/b/req"是**运行期数据**（原版把状态块由 `roster`/`quorum`/计数器生成；字段目录 3988–4018 为模板） | `packs/v5r/prompts/v5r-prompts.js:51`（"轮次 6｜…有表决权者 3 人"）、`:52`（"任务 t-2…"）、`:102–111`（`p-lean-a`/`p-lean-b`/`p-lean-req`）、`:115–117`（`Members/{{ member }}/Propos/p-r-1.md`） | **HARD-CODED**（**但须两面看**：该文件自称是**录制的语料**，L49 "one entry per corpus prompt" ⇒ 这些字面量是**录制产物**，不是模板变量） | 明确语料的定位：**只作 A/B 对照基准**，不得作为运行时模板；运行时模板必须走 `{{ }}` 变量与 `setting:`／`count:` 通道 | 高 |
| D5 | 原版字段目录含 ≥29 字段（`3988–4018`） | `kernel/turn/index.js:30–45` 只 **12** 个 | **PARTIAL**（覆盖率 ≈12/29） | 见 §4 前两项 | 高 |
| D6 | 原版把"简报/状态块"作为**每轮一个块**（`[状态] …｜轮次 N｜法定票数 m=…｜有表决权者 N 人` 见语料 `packs/v5r/prompts/v5r-prompts.js:51`） | `kernel/prompt/index.js:50` 白名单里有 **`statusBlock`／`roster`／`quorum`／`round`** | **MATCH（机制层）** | 无（但 `statusBlock` 在语料里的实际使用我**未核**） | 中 |
| D7 | 原版有"关掉某块＝零注入"的语义（语料 `packs/v5r/prompts/v5r-prompts.js:97` 的 `[CONTEXT COMPACT …]` 与 `:113` 的"以下这段仅在…适用"两种条件块） | `kernel/prompt/index.js:176–190` `disable()` 注释明写"**其 off 状态＝该块存在之前的样貌**（ZERO injection）" | **MATCH** | 无 | 高 |
| D8 | 原版有"不可覆盖的事实"（`state` 类只读事实） | `kernel/prompt/index.js:204–205`（不可变段拒绝重注册）、`:377`（内建 `state`，`mutable:false`）、`:468`（不可变段忽略覆盖/绑定/追加） | **MATCH** | 无 | 高 |
| D9 | 原版"截断必须计数"（v4/v5r 一路的纪律） | `kernel/prompt/index.js:358` `truncation.push({section, kept, dropped, mode})`；`:592` `status()` 回显 | **MATCH** | 无 | 高 |
| D10 | 原版变量替换（`{{ }}`） | `kernel/prompt/index.js:50` `VARIABLE_WHITELIST`（含 `setting:`／`count:` 两个前缀通道）、`:333` 缺值即拒（"would have rendered an empty slot"） | **MATCH（且更严）** | 无 | 高 |
| D11 | 原版条件包含（feature switch／phase／role／首发言人／LaTeX／引擎可用） | `kernel/prompt/index.js:481–520`（绑定按维度替换、同名并列拒绝 L496）、`:53` `BINDING_PRIORITY`、`:538` `override` | **PARTIAL** | **未核**：原版每一条条件（首发言人、LaTeX 检测、引擎可用）在 vmu 是否有等价设置项 | 中 |
| D12 | 原版中间态/回执（每轮记录、receipts、notices、archives、indexes） | **未核**（本会话未读 `kernel/records.js`／`kernel/index.js` 的簿记面） | **未核** | 需专门一轮对照 | 低 |

---

## 3. 已核验为"一致"的部分（同样带 file:line）

1. **变量化而非写死（机制层）**：语料确实用变量 `{{ round }}`／`{{ role }}`／`{{ member }}`／`{{ quorum }}`／`{{ roster }}`（`packs/v5r/prompts/v5r-prompts.js:51`、`56`、`63`），而管线为它们提供白名单与缺值拒绝（`kernel/prompt/index.js:50`、`:333`）——**机制是对的**；问题在个别**文本**（见 D3/D4）。
2. **零注入开关**：`kernel/prompt/index.js:176–190` 的 `disable()` 明确"关掉＝该块存在前的样貌"，并有 `enable()` 还原；**不是**用空字符串覆盖（`:178–180` 注释说明旧行为是错的、已修）。
3. **不可变事实段**：`state` 段 `mutable:false`（`:377`），重注册被拒（`:204–205`），覆盖被拒（`:468`、`:542`）。
4. **确定性拼装**：同输入同字节；排序固定为 `order` 再 `name`（`:419`），并声明 `docs/06 §1` 的装配不变式（文件头 `:3–10`）。
5. **截断计数**：`:358` 记录 `{section, kept, dropped, mode}`，且 `status()`（`:592`）可读——符合"截断不得静默"。
6. **原版路径是运行期构造**：`vibe-math-v5r.js:8137`、`10433` 用 `instRel(...)` 拼路径 ⇒ **原版没有**把研究所绝对路径写进模板文本；这**反证** D3 是移植侧引入的硬编码。
7. **原版对上下文压缩有明确语义**（`5821–5824`：`compacted` 只表示"已在 progress 保存摘要"，并在种子处 `slice(0,4000)`）——移植侧语料把它抄进了文本（`packs/v5r/prompts/v5r-prompts.js:57`），说明**内容对齐了、接线没对齐**。

---

## 4. 最高价值的后续五项（按顺序）

1. **`contextPct`／`compacted` 接线**（`kernel/turn/index.js:30–45`）：**小**。理由：它决定**长回合能否自我压缩并续跑**——数学研究回合天然长，缺它只能靠宿主兜底，等于原版最关键的"抗上下文爆炸"机制在移植里不存在（原版 `5820–5824`）。
2. **把研究所路径从语料文本中变量化**（`packs/v5r/prompts/v5r-prompts.js:51/56/63/113/117`）：**中**。理由：`VibeMath/Projects/default/Institutes/institute` 写死在**发给模型的文本**里，换工作区/多项目时会出现"提示词说 A、实际在 B"的**不一致**，正是用户要求禁止的那类硬编码。
3. **补齐回合字段派发**（原版 `3988–4018` vs `kernel/turn/index.js:30–45`）：**中**。理由：`assign`/`prioritize`/`nudge`/`convene_meeting`/`task_claim`/`task_done`/`reject_assign`/`input` 全无 owner ⇒ **院士督导面与任务认领/完成面**在回合层缺失（数学研究的组织行为直接受影响）。
4. **条件块等价性核对**（原版 feature switch / 首发言人 / LaTeX 检测 / 引擎可用；移植 `kernel/prompt/index.js:481–520`）：**中**。理由：含 Lean/论文的条件块直接影响"是否要求形式化""是否交付 PDF"，属于研究产出路径。
5. **中间态与输出对照**（每轮记录/receipts/notices/archives/indexes；原版未逐字读取，移植 `kernel/records.js` 未读）：**大**。理由：这是"结果可追溯、可复现"的基础，也是本次审计中**唯一整块未核**的区域。

---

## 5. 未做 / 无法确定（明写）

- **未读**：`packs/v5r/prompts/v5r-core.js`、`packs/v5r/prompts/v5r-charter.js`、`packs/v5r/prompts/v5r-persona.js`；`kernel/prompt/index.js` 的 `100–475` 之间除 grep 命中行以外的正文；`kernel/turn/index.js` 的 `136–327`（编排器正文）；`kernel/records.js`／`kernel/index.js` 的簿记面；`settings/**`。
- **未核**：原版**提示词拼装函数本体**（本轮只核到字段目录 `3988–4018` 与若干块文本），因此 §2 D11 的"每一条条件是否有等价设置"**没有逐条结论**。
- **未核**：原版中间态（每轮记录/回执/notices/archives/indexes）在移植中的对应物（D12）——**无法确定**是否有缺失。
- **未核**：`{{ statusBlock }}`、`{{ setting:… }}`、`{{ count:… }}` 在**语料**中的实际使用（白名单里有，语料抽样中未见）⇒ **无法确定**是否为未使用的通道。
- **未跑**：任何测试与全量门禁（按要求）；未做任何运行时探针（未使用 `tests/vmu-ab-v5r-verification.test.mjs` 的 harness）。
- **未改**：除本文件外**零改动**；未 `git commit`／`git push`。
