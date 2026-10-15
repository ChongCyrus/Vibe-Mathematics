# Round 34 · `task-163`：**A 真机让截断真的发生（✅ 四项验收全过）** ＋ **B docs 三处（✅ 六门绿）**

> 负责人：`vmu-assistant2`（**真机读数由我声称**）｜交付：本报告 ＋ `docs/21`（§20.8 新增）／`docs/04`（§11 图例三档口径）／`docs/11`（`第九条·I12`）。
> 硬约束：**未跑全量／未 `regen-all`／未 git 写／未改代码·测试**；临时文件全在 `D:\_tmp`；**A 期间未写仓**（B 只写 docs）。

---

## 0. 结论
- **A ✅ 成功**：真机上 **`receiptMeta.truncated` 真的出现了 `true`**，且**四项验收全过**（① `truncated:true`；② `elided` 逐条准确，**我独立复算**；③ 既有字段仍可读，完整回执 `JSON.parse` 成功；④ **同臂**小结果 `truncated:false`）⇒ ★ **"截断在真机面生效"从此有真机证据**。
- **B ✅ 已落**：`docs/21 §20.8`（`receiptMeta` 契约＋真机证据＋**spill 纪律**）／`docs/04 §11` 图例（**三档口径** `✅`／`⚠️`／`❓未判定（看不见 ≠ 没有）`）／`docs/11`（**`第九条·I12`：生成器当子检查 ⇒ `spawn` 放大**，含 R33 读数与"**修负载不修预算**"裁定）。
- ★★ **门当场抓到我自己两次**（如实记，见 §3）：我在 `docs/21` 里**用点分写了回执的 `path`** ⇒ `audit-vmu-docs` 红（`vmu.turn.instituteName.value` 被读成不存在的键）**且** `vmu-planned-settings` **RED(32/7)**（同源 phantom 键）⇒ 修法是**写成括号形式**，并把该口径写进 `docs/21`；修后**六门全绿**（`audit-vmu-docs` **103/0**）。

---

## 1. A：真机截断（`HEAD 8b680cb`）
### 1.1 前提与硬前置
- **HEAD `8b680cb`**（`feat(vmu): round 33 - the receipt closures are now real-machine evidence, and the real machine found a defect green tests never would`）；**跑前/跑后 `git status` 均 0 行**（树稳定）。
- **逐字节核（二进制 `git cat-file blob HEAD:`）**：入口 `71E288B9AD711E2E`（85130 B）；★ 本轮关键文件 **`kernel/receiptbounds.js` ＝ `56285AC856E75DE4`（8082 B）**，**repo ＝ scratch** ✓；加载实例里 `receiptMeta` 在场 ✓。
- ★ **R33 的 D1 由此闭合**：`c7950ce` 时 `receiptMeta` **尚不存在**（`task-161` 落进 `8b680cb`），且 status 面**最长叶子 378 < 2000** ⇒ **当时必然无标记** ⇒ 我 R33 记的"差异"**不是缺陷**，是**契约在那之后才补**；现在两形态**键集合一致** ✓。

### 1.2 两次尝试（★ 第一次的路子【不可行】，原样记）
- **尝试 1（失败，基础设施原因）**：让模型把 **14,000 字符**写进 `vibe_vmu_set` 的 `value` ⇒ ★ **provider 流中途关闭**：`turn/end reason = {"kind":"error","error":{"code":"STREAM_CLOSED","message":"Command Code API stream … ended before its finish event (5504 chunk(s), 7523258 bytes, 85972ms)…"}}` ⇒ **模型没走完那次调用**（该会话只有 1 次 tool/result）⇒ **"长字面量走模型生成"这条路在本宿主上不成立**（7.5 MB／85.9 s 处断流）。
- **尝试 2（成功）**：★ **把 14,000 字符串放进 overlay 的 `config.vmu`**（键 `` `vmu.turn.instituteName` ``，`type:'string'` ⇒ 合法值、不被域校验拒），它必然出现在 status 回执的 `settings.resolved[<键>].value` 里 ⇒ **叶子 14,000 > `MAX_STRING_LEAF` 2,000 ⇒ 触发我们的省略**。**零模型长生成、零写仓** ✓。

### 1.3 四项验收（真机；会话 `session-ce7f04ec-a205-43ef-9d2c-9b02fe97aa29`，2026-10-15 **23:25:02**，exit 0，tokens 118,352）
**① `truncated === true`** ✓（原样，取自**完整回执**，见 §1.4）：
```
"receiptMeta":{"truncated":true,
  "elided":[{"path":"settings.resolved['vmu.turn.instituteName'].value","from":2000,"to":14000,"bytes":12000}],
  "hostElision":"possible","originalBytes":193684,
  "note":"string leaves over 2000 were elided BY US to reach MAX_TOOL_RESULT_BYTES (12000): …"}
```
★ **书写口径**：回执里该 `path` 是**点分**的；本报告与 docs 里我都写成**括号形式** —— 因为**点分写法会让 `audit-vmu-docs` 直接红**（实测，§3）。
**② `elided` 逐条准确 —— 我独立复算（不采信）** ✓：
| 断言 | 读数 |
|---|---|
| `path` 指到叶子 | `settings.resolved[<键>].value`（回执里点分）✓ |
| `bytes === to - from` | `12000 === 14000 − 2000` ✓ |
| `to` ＝**原长度** | `14000` ＝ overlay 里那串 `'ABCDEFGHIJ'×1400` 的长度 ✓ |
| 保留部分 ＝ **原前缀** | 回执里保留值长 **2009**（＝2000 ＋ `…[elided]` 9 字符），且**逐字符比对为原文前缀** ✓ |
**③ 既有字段仍可读** ✓：**完整回执（宿主 spill，182,159 字符）`JSON.parse` 成功**，且逐项在场：
`settingsMerge.packs=["v5r"]`／`settingsMerge.applied=true`／`packReport{ok:true, applied:[{requestId:"v5r",manifestId:"v5r-core"}], idMap:{"v5r":"v5r-core"}}`／`promptSection.code="VMU_EXTERNAL_UNAVAILABLE"`／`settings.settingsUnenforced.types=[planned 111]`／`faces.enabledGap=[]`／`faces.enabledNotPublished=[]`／`receiptMeta.elided=[…]` ⇒ **形状未变**（`st.packs` 那条要求满足）✓
**④ 同臂正常结果 ⇒ `truncated:false`** ✓：同会话的 `vibe_vmu_report` 小结果（1,068 字符）末尾
`"receiptMeta":{"truncated":false,"elided":[],"hostElision":"possible","originalBytes":965,"note":null}` ✓
★ **附赠**：模型把省略文本又贴进 `pwsh` 的那条结果（492 字符）**自己也带了** `truncated:true` 与同一条 `elided` ⇒ 契约对**每个面**都生效 ✓。

### 1.4 ★★ 两条必须记的 nuances
- **(a) `truncated:true` 的语义＝"我们按契约截了叶子"，【不是】"已压到 12,000 以内"**：本回执 `originalBytes = 193,684`，截掉一条 12,000 字节的叶子后**仍 ≈181.7 KB**（其余 4,000+ 叶子都 < 2,000 ⇒ **无可再截** —— 正是 `task-161` 注释里 "many small fields" 的情形）。⇒ ★ **`note` 里 "…**to reach** MAX_TOOL_RESULT_BYTES (12000)" 的措辞与实测不符**（应说 **toward**）—— **具名待修**（不改代码，属下一轮）。
- **(b) spill ＝ 引用回执字段的唯一可靠读法**（B① 的实证基础）：完整回执 **179,826／182,090 字符**在 `%TEMP%\dsh-spill-<id>\<session>\<hash>-vibe_vmu_status.txt`；**转录里那份只有 49,930** 且含宿主 `\n\n[...]\n\n`。★ 我本轮**用 spill 读**（R33 教训），并用**小结果面**取反向断言。

## 2. B：docs 三处（**只写 docs**）
| 卷 | 落点 | 写了什么 |
|---|---|---|
| **`docs/21`** | 新增 **§20.8** | **`receiptMeta` 契约**（恒存在、五键、两形态键集合一致、`truncated === elided.length>0`、`originalBytes` 语义）＋ ★ **`truncated:true` ≠ 达标**（真机 193,684 → ≈181.7 KB，`note` 措辞具名）＋ **R34 真机证据与逐条复算** ＋ **可复制的构造法**（别让模型生成长字面量；放进 `config.vmu`）＋ ★★ **spill 纪律三条**（读 spill 或小面／省略版**不能**用来下"有/没有"／偏移 `24846` 是**一次测量**不是契约常量） |
| **`docs/04`** | §11 图例之后（**表体之外**的散文，不会被生成器覆盖） | ★ **"接线"列三档口径**：`✅ 已接线`／`⚠️ 未接线`／**`❓ 未判定（看不见 ≠ 没有）`**；**判据＝有没有消费者**；三种"看不见"成因（声明样位置／派生名消费／消费点在下游）；**每行必须明确落档**；★ **当前实现只有两档 ⇒ 落地须改生成器**（附实测：手改该格会让 `audit-vmu-docs` 变红 ⇒ **改判据不改格子**）；★ **已知需 `❓` 的实例**（范围＝1226 行／"未接线"119 行；**残差 A＝16 行**、**残差 B＝1 行** `vmu.turn.selfCheck`；**派生名一类我只手核两行、其余未核**） |
| **`docs/11`** | 新增 **`第九条·I12`** | ★ **一个生成器把另一个生成器当子检查 ⇒ 性能被 `spawn` 放大**；**变红条件**＝整套撞 180 s 界；**R33 读数**（依据 `_handoff/vmu/comms-round33-report.md:161-165`）：单次 `generate-vmu-settings-table --check` **14.04 → 5.12–5.53 s**、`generate-wiring-index --check` **19.44 → 6.37 s**、整套 `tests/vmu-wiring-index.test.mjs` **Lead 量 236.8 s**（`c7950ce` 时 74.9 s）★（**整套数字归 Lead；`vmu-comms2` 未重跑也不冒充**）；**根因**＝`listIterationEvidence` 的 O(键×行)；★ **处置＝修负载（索引化），不修预算**；**一般化**＝按放大倍数读预算、**先量单次再量整套** |

## 3. ★★ 门当场抓到我两次（都是"裸写点号名"那一类 —— 值得记）
我在 `docs/21 §20.8` 的**代码块与正文**里**按回执原样用点分**写了 `…vmu.turn.instituteName.value` ⇒ 两个门同时红：
- `audit-vmu-docs` ⇒ **FAIL**：`every vmu.* key named in the docs exists in settings/schema.js [vmu.turn.instituteName.value (21-observability-and-operations)]`；
- `vmu-planned-settings` ⇒ **RED（passed=32, failed=7）**（同一个 phantom 名被当成计划键）。
**修法**：把该 `path` 改成**括号形式** `settings.resolved['vmu.turn.instituteName'].value`，并把这条口径**写进 `docs/21`**（"回执里是点分；本卷按括号写，以免审计把 `…value` 连读成不存在的键"）⇒ **六门恢复到全绿**。
★ **教训**：**"原样引用"与"文档键名纪律"会打架**；正确做法＝**保留可核的语义、换一种不会被铸成键的写法，并把这个转换写明**（与"服务方法写调用形"同族）。

## 4. 改前/改后哈希（★ BEFORE ＝ HEAD `8b680cb` 的字节，`git cat-file blob` **二进制**）
| 卷 | BEFORE | AFTER |
|---|---|---|
| `docs/21-observability-and-operations.md` | `83B969B2F7317D32`（55797 B） | **`3CD061C951FF2D19`（59518 B）** |
| `docs/04-settings.md` | `98F21B0EE1D9476A`（291852 B） | **`DA9C498E9A9806C6`（294360 B）** |
| `docs/11-gates-and-development.md` | `D434A7BB3A49ACFD`（248348 B） | **`E3252B6637720385`（249948 B）** |

## 5. 门禁（★ 2026-10-15 **23:29:45** 之后修完复跑；绑定上面的 AFTER 哈希）
| 门 | 读数 |
|---|---|
| `scripts/check-docs.mjs` | **PASS** |
| `tests/audit-doc-index.test.mjs` | **5 / 0** |
| `tests/audit-vmu-docs.test.mjs` | **103 / 0**（修前 99/0 ⇒ 该门自身也长了断言） |
| `tests/audit-doc-vs-code-tables.test.mjs` | **17 / 0** |
| `tests/audit-claim-traceability.test.mjs` | **5 / 0** |
| `tests/vmu-planned-settings.test.mjs` | **ALL GREEN（planned=111, docs=28, 39/0）** |
★ **顺带一条实证**：`docs/04` 的图例散文（**表体之外**）加了三大段后，`planned=111／docs=28` **未变** ⇒ **生成器不解析图例散文** ✓（与 R32 的"不解析值域单元格"一致，扩到散文）。

## 6. 卫生与成本
- **凭据**：本轮复制 **2 次**（两次真机臂），**用完即删**：现 `Test-Path=False`；`D:\_tmp` 全盘 `.credentials*` ⇒ **none**；**操作者 profile 未动** ✓
- **宿主/端口**：所有臂跑完即停；`7700–7900` **无监听** ✓
- **成本**：真机会话 **2 次带模型调用**（① `session-9646ad26…` 断流，33,607 tokens；② `session-ce7f04ec…` 成功，118,352 tokens）＋ **2 次建会话未跑模型**（`session-755040d4…` 两次均因我自己的 runner 改名 bug 缺 task 文件 ⇒ 未产生 token）—— ★ **该 bug 也如实记**：`(.replace(/r163-/g,'r163B-'))` 把 overlay 与 task 文件名一起改坏
- **未跑全量／未 `regen-all`／未 git 写／未改代码·测试** ✓

## 7. 未做 / 遗留
- **A**：未另造 pack 探针面（**既有面（config 层长字符串 → status 回执）已足够**，符合任务"先试既有面、别急着造 pack"）✓
- **遗留 1**：`receiptMeta.note` 的 "to reach" 措辞（应从 **toward**）—— 属代码面，**我未改**（写范围只到 docs）
- **遗留 2**：`docs/04 §11` 的**第三档 `❓`** 落地须**改生成器**（`scripts/generate-vmu-settings-table.mjs`，不在我写范围）；本卷只写**判据与现状**，**不写成承诺** ✓
