# Lane: E1（合作论文 → 九节成稿）＋ E3（论文质量：证据/引用/不得编造）

> 批次：phase 12 台账 E 组两行 ⚠️。写于工作树 HEAD 由 Lead 统一提交之前；行号是**当前工作树快照**（pack 侧
> 正被并行改写，引用前请以 `git grep -n` 复核）。
> 本批可写面：`vibe-math-vmu/packs/v5r/paper.js`、新文件 `vibe-math-vmu/packs/v5r/paper-quality.js`、新测试、
> `package.json#files`、`installer.js`。**未改** `kit/paper.js`、`packs/v5r/tools.js`、提示词、`kernel/**`、`tools/**`。

## 0. 判据（台账原文→本批要证的东西）

- E1：「分派后各自负责部分并入论文，最终合并成稿并交付」。
- E3：「论文合规：每一条有证据（实验/推导/引用），不得编造」。
- 本批的实测起点（Lead 已给）：九节里 **3 节结构性为空**，且**渲染不读记录库**；E3 只有「文本合同＋阶段正反隔离」，
  **产出物本身没有质量闸**。

## 1. 起点的机器读数（复现）

`D:\_tmp\probe15-e1-sections.mjs` 在真数据下报：

```
emptySections = ["1:引言与问题背景","3:已检验通过的命题","4:已解决的子问题 / 中间成果"]
mdChars = 460
```

原因在结构上，不在内容上：`vibe-math-vmu/packs/v5r/paper.js:83`
`sectionFields: ['title','','solution','','','methods','rules','limits','evidence']` —— 下标 1/3/4 是空串，
`kit/paper.js:526` 的 `PaperMd` 遇到 `if (!field) continue` 就整节空过。所以这 3 节**永远**是空标题，
与研究所里有没有 verified 卡无关。

## 2. E1 承载：九节从记录库取值（已落地）

新文件 `vibe-math-vmu/packs/v5r/paper-quality.js`：

- `RECORD_SECTIONS`（`:48`）把三个空节声明成**记录驱动的节**，每节给出：`index`、`title`、`recordSource`、
  `legalEmpty`（一句**具名**空理由，不是空串）、`rows()`（读哪个轨）。三个来源分别是：
  - §1 引言与问题背景 ← 声明式设置 `vmu.turn.objective`（`settings/schema.js` 的 `vmu.turn.objective`；读点是
    `kernel.settingsSnapshot()`，即「总目标」这一声明的真值，不是另一份拷贝）；
  - §3 已检验通过的命题 ← `verified` 轨（`packs/v5r/verified.js` 的 `listVerified`：只有带「逻辑结论 + 来源凭证」的
    行才算，`bad` 行逐条具名，不猜）；
  - §4 已解决的子问题 / 中间成果 ← `problems` 轨里**卡片自己写 `概率：1`** 的行（判据是卡片的布尔，不是标题措辞；
    `p=0.4` 的同一张卡不进，E1 测试成对断言）。
- `fillRecordSections({ md, sections, view, codes })`：在 kit 生成的 markdown 里定位每节标题，把内容插在该节标题与下一个
  `##` 之间；**标题没找到 ⇒ `problems` 里具名**（不静默跳过）；每条都带 id + 出处（`from 记录库/verified 轨/...`）。
- `sectionAudit` 的每节报 `{ index, title, mode: 'filled'|'legal-empty', count, chars, source }` —— 「填了」与
  「合法为空」在机器上可分。

接入点在 `packs/v5r/paper.js:96-120`：`flow.PaperMd` 用填充版覆盖（调用形状与 kit 相同，既存调用者不改），
`flow.sectionAudit` 新增只读审计。**没有新轨、没有新记录、没有第二份事实**：三个来源全是仓里已有的轨/声明。

## 3. E1 的**未达成**部分（具名，卡在 kit 缝）—— 这是本批最重要的一条

`kit/paper.js` 里 `render`（`:608`）、`PaperTex`（`:560`）、`PaperArtifacts`（`:583`）、`recordFinal` 回执
**都用 kit 内部的闭包 `PaperMd`**（`:526`），不是 flow 对象上那个方法。因此：

- `flow.PaperMd` / `flow.sectionAudit` / 质量闸看到的是**填充版**；
- 而 `flow.render` 写进 `Paper/` 的 `.md`/`.tex` 产物仍是**未填充版**（3 节依旧空）。

我没有用「在 pack 里重写一遍渲染器」来绕过：那会造出第二个渲染权威（红线①/②），且 pack 侧改不动
`PaperTex`/`compilePdf` 的闭包依赖。**请求的最小 kit 缝**（约 12 行，全部在 `kit/paper.js`）：

1. `createPaperFlow({ …, sectionFills = null })` 增加一个可选入参（默认 `null` ⇒ 行为完全不变）；
2. 闭包 `PaperMd`（`:526`）在每节标题后，若 `sectionFills && sectionFills[i]` 存在则追加该文本（否则维持现状）；
3. 其余 `PaperTex`/`PaperArtifacts`/`render`/`compilePdf` **一行都不用改**（它们都经由闭包 `PaperMd`）；
4. pack 侧把 `fillRecordSections(...).md` 之外的**每节文本**（`sections[].text`）作为 `sectionFills` 传入即可。

消费者是谁：`packs/v5r/tools.js:1820` 的 `action:"render"`（`paper.render`）——用户/所办真正拿到的论文文件。
在缝落地之前，E1 的「合并成稿」在**文件产物**上仍差这一步，读面（`flow.PaperMd`）与质量闸是完好的。

## 4. E3 闸：三条规则 + 四个具名码（已落地）

`paper-quality.js`：

| 规则 | 判据 | 具名拒 |
| --- | --- | --- |
| ① 引用必须可追 | 正文/证据里形如**已记录 id**的 token（`vibe-math-vmu/` 路径、`records.js` 的 `r-…` 形 id、`卡：id`）必须能在记录库存活；自由文本（"构造性证明"）不算引用、不构罪 | `VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN`（消息里点名 id 与成员） |
| ② 证据不得为空 | 每节/每成员至少一条证据；能解析到记录的条目必须带指纹 | `VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING` |
| ③ 研究所的结论必须进正文 | `verified` 轨的行、`p=1` 的已解决子问题，其 `title`/`cardId`/`id` 至少一个出现在**成员写的正文**里 | `VMU_PACK_V5R_CORE_PAPER_VERIFIED_DROPPED` |

- ③ 判的是 `kitPaperMd`（成员原文），**不是填充版**：填充会自动把 verified 行塞进 §3，用填充版判 ③ 会让它恒真
  （`packs/v5r/paper.js:141` 的注释写明这个理由）。
- 判定点：`flow.qualityGate`（纯判据，**永不抛**，编辑器可先问）；`flow.render`（`packs/v5r/paper.js:158-169`）
  在**产出文件之前**过闸 ⇒ 不通过时**什么也不写**（归档保持上一状态）。消费者是 `action:"render"` 的真机路径。
- 边界（两条，都在测试里成对断言，不是空白）：
  - `no-parts`（没有正文）⇒ `{ok:true, skipped:'no-parts'}`：没有文本就没有可判的东西；E4 的 office-consult 闸
    拥有那条路径（既有 E4 测试驱动的正是无 parts 的论文，硬判会把它们判假）。
  - `draft:<status>`（writing/cross-review 阶段）⇒ 跳过并**说出跳过了什么**：三条是**交付**契约，从
    `awaiting-editor` 起强制。作者渲染草稿自查不该被罚（`vmu-paper-quality` 测试 §9 成对断言：草稿渲染不抛、
    verdict 明说 `draft:writing`）。

## 5. 门禁（可机械失败的检查）

`tests/vmu-paper-quality.test.mjs`（**54 passed / 0 failed**，EXIT=0）：
E1-a 三节是声明出来的（含 `legalEmpty` 非空）；E1-b 有库时三节带**记录库内容**（objective 文本、verified 标题＋
`cardId`＋warrant id、p=1 子问题 id，并断言 `p=0.4` 的同名卡不进）；E1-c `sectionAudit` 逐节 `mode/count`；
E3-a 自由文本证据过闸；E3-b 引用了不存在的 id ⇒ 拒且消息点名该 id；E3-c 无证据 ⇒ 拒；E3-d 漏掉 verified 结论 ⇒ 拒、
补上后同稿通过（③ 的正反对）；E3-e `qualityGate` 不抛；§9 草稿边界正反对。

相关套件（同一批次实测，全部 EXIT=0）：
`vmu-v5r-tools` 339/0（含 ⑦c 论文子系统正反 + ⑦h export 面钉死）、`vmu-paper` 37/0、`vmu-paper-consult` 40/0、
`vmu-paper-consult-tool` 66/0、`vmu-paper-office-consult` 65/0、`audit-installer-policy` 90/0、
`audit-package-membership` 29/0、`audit-enforced-consistency` 344/0、`scripts/check-docs.mjs` **DOC LINT: PASS**。
`v4-final-paper` 90/3：三条都是「没有 LaTeX 引擎」的环境类断言（不是本批引入），`kernel/v4` 不在本批写面。

## 6. 登记

- `package.json#files`：`vibe-math-vmu/packs/v5r/paper-quality.js`、`tests/vmu-paper-quality.test.mjs`（各一行）。
- `installer.js:60` PRESETS `files`：`'packs/v5r/paper.js'` 之后加 `'packs/v5r/paper-quality.js'`。

## 7. 未做（具名）

1. **kit 缝**（§3）：渲染产物（`.md`/`.tex`）的 3 节填充要等 `kit/paper.js` 的 `sectionFills` 入参。消费者已存在
   （`tools.js:1820`），所以这不是「无消费者的机制」，而是被写面挡住的一步。
2. 九节里另外 6 节仍来自参与者字段（`sectionFields` 的 title/solution/methods/rules/limits/evidence）——
   台账没有要求它们改成记录驱动，本批不动。
3. ①「引用可追」的形态识别是**保守**的：只认已记录的 id 形态与 `vibe-math-vmu/` 路径；正文里写成别名的引用
   （如"见前面那张卡"）不会被判编造，也不会被判已追——未判定，缺的是命名约定（该由 pack 的写作规范声明，
   而不是在这里猜）。
4. `flow.render` 抛出的 `Error` 走工具层的 catch → 具名拒；`packs/v5r/tools.js` 的映射细节不在本批写面，
   已由 `vmu-v5r-tools` 的 ⑦c 覆盖「工具面拒绝形状」，未单独断言 `code` 透传（列为未判定）。

## 8. 复核命令

```
node tests/vmu-paper-quality.test.mjs          # 54/0
node tests/vmu-v5r-tools.test.mjs              # 339/0
node scripts/check-docs.mjs                    # DOC LINT: PASS
node scripts/regen-all.mjs --check             # 计数/索引预计 STALE：新文件派生，由 Lead 统一 --write
```
