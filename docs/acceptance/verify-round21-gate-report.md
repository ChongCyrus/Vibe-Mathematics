# Round 21 · `task-133` 交付报告 —— 门禁代码侧**去注释**（注释里的码不算"能抛"；字符串里的码必须仍计入）

> 纪律：未跑全量（T0/T1 归 Lead）／未 `regen-all`／未 git；临时文件只在 `D:\_tmp\v21`；**未改基线**。
> **读的是哪一次运行／哪一版文件**（逐条注明）：起点提交 `d2e4510`；**复核与落地期间工作树上有两位同行在飞**（`vmu-pack2` 的 task-130、`vmu-core2` 的 H2 修复）⇒ 凡受其影响处**一律并列两版并写明来源**。

## 1. 改动（一处，`tests/audit-vmu-docs.test.mjs`）

| # | 内容 |
|---|---|
| A | 新增 `import { stripComments } from './_lib/strip-comments.mjs'`（**用仓库已有的去注释器，未新写**），附一段就地说明：代码侧必须读**代码**、不是散文（第七条）。 |
| B | 代码侧扫描改为 `const text = stripComments(readFileSync(file, 'utf8'))` —— ★ **默认模式＝注释被空格化、字符串内容保留**。这一半是关键：`refuse('VMU_X', …)` 里的码**是**真引用，必须仍计入。 |
| C | **4 条双向自探针**（门内，合成输入）：① `//` 行注释里的码**不计入**；② `/* */` 块注释里的码**不计入**；③ **字符串字面量**里的码**仍计入**；④ **模板字面量**里的码**仍计入**。 |

**为什么不是"让作者改写注释"**：那是 R10 已记的"**门禁指挥措辞**"反模式；**修的是门，不是文本**（本任务 C 项）。

## 2. 证据：双向都真的不同（在**真模块**上做，不是只靠合成）

`node D:\_tmp\v21\prove-two-way-on-real-module.mjs` —— 把同一个**未登记**码 `VMU_COMMENT_FALSE_POSITIVE` 注入**真 `kernel/pack.js`** 的两种位置，再按门自己的判据（`CODE_LITERAL_RE`，登记集来自 `docs/03`）跑，**去注释 vs 不去注释**：

| 注入位置 | 不去注释 | **去注释（本修复）** |
|---|---|---|
| **(a) `//` 注释**：`// probe: this module never throws \`VMU_COMMENT_FALSE_POSITIVE\`` | `["VMU_COMMENT_FALSE_POSITIVE"]`（**假阳性**） | **`[]`** ✓ |
| **(b) 字符串**：`throw refuse('VMU_COMMENT_FALSE_POSITIVE', 'probe')` | `["VMU_COMMENT_FALSE_POSITIVE"]` | **`["VMU_COMMENT_FALSE_POSITIVE"]`** ✓ |
⇒ **`⇒ the stripping removes (a) and KEEPS (b): true`**。并附：当前真 `pack.js` 两种方式读数一致（`[]`）⇒ 无残留注释型假阳性。

**现场（我在 `task-132` 复核时先算出来的）**：`audit-vmu-docs 94/1`，detail＝`[VMU_ALWAYS | VMU_TOOL (kernel/pack.js)]`，而两码**只出现在工作树 `pack.js:506` 的注释里**、`HEAD` 无、`git log -S` 无命中 ⇒ **提交版绿**。**修复后该形状不可能再红**（注释先被空格化）。

## 3. 零副作用（任务 D 项）

| 命令 | 读数 |
|---|---|
| `node tests/audit-vmu-docs.test.mjs` | **99 passed / 0 failed，exit=0**（修复前 95/0 ⇒ **＋4 条＝那 4 条自探针**） |
| `node tests/audit-vmu-docs.mutants.mjs` | **15 passed / 0 failed，exit=0** ★ **外部双向检验**：M4 把未登记码注入模块的**真实抛出路径**（字符串字面量）⇒ **仍然红**，说明去注释**没有把真引用一起去掉**；control 副本绿 |
| `node tests/audit-declaration-criterion.test.mjs` | **RULE E fingerprints current=67 baseline=67** ✓、**multi-line C files=57 baseline=57** ✓（当次唯一 FAIL＝`regen-all --check`，见 §5） |
| 基线 | **未改任何基线**（A 67／C2 57 均未动） |

## 4. 落地时撞到的**真**红（不是我改的，也不是注释）：`vmu-core2` 自造了未登记码

修复后第一次跑门，红的是**另一组码、另一个文件**：`[VMU_PROMPT_SECTION_UNREACHABLE (vibe-math-vmu.js) | VMU_PROMPT_SECTION_UNAVAILABLE (vibe-math-vmu.js)]` —— 这是 `vmu-core2` H2 修复里**新造的公开码、尚未在 `docs/03 §8` 登记**（`docs/**` 不在其写范围）。他们随后**改为复用已登记的 `VMU_EXTERNAL_UNAVAILABLE`**（语义＝"宿主未注入的接缝"）＋ `what`／`reason` ⇒ **99/0 回绿**。
⇒ ★ **可入册的一条**：**模块不得自造公开码，且这条在代码侧就有牙**（`audit-vmu-docs` 直接抓到）；正解＝**复用语义相符的已登记码**，或**由 `docs` 属主登记新码**（跨写范围 ⇒ 需派单）。
★ 本轮同型共 **3 次**"读数随树漂移"（我复核提交版时撞到 pack2 在飞注释；core2 的新码；`regen-all` 的 stale 项随活写者变）⇒ 纪律第 2 条（读数绑版本）**对"复核"同样适用**。

## 5. `regen-all --check` 的两项（**非本任务**，归 Lead 轮末）

```
FAIL planned-code registry (docs/03-§8) :: run: node scripts/generate-planned-codes.mjs --write
FAIL documented counts (README / checklist) :: update-doc-counts: the scoped line for docs/11 was NOT rewritten (no scoped count)
```
第 2 项是**该更新器既有的 by-design 分支**（`--counts` 是 scope-independent ⇒ 不生成 scoped 行，见 `scripts/update-doc-counts.mjs:42-43`），第 1 项由本轮**在飞代码改动**使生成块过期 ⇒ 都属 Lead 轮末 `regen-all`，**我未跑**。

## 6. 并入 pack2 的两条自造红（Lead 要求并进本报告）

| 现场 | 归属与处置 |
|---|---|
| `pack2` 在 `kernel/pack.js:506` 的**注释**里写了两个**探针夹具码**（`VMU_ALWAYS`／`VMU_TOOL`）⇒ `audit-vmu-docs 94/1` | ★ **与本任务同一件事**（我已独立撞到并归因）。他们的处置＝**从注释里删掉** ⇒ 95/0。★ **我的补充判定**：那两个码 `pack.js` **根本不会抛**、以字面量出现在那里**本身就误导** ⇒ 删除是**正确性改进**；但**判据问题独立存在**，故本任务修的是**门**（此后**无需**改文本即可不红） |
| `pack2` 把 H3 断言写在 `if (name === 'v5r') { … }` 里 ⇒ **`RULE E multi-line C` 新增空过指纹（C2）** | 他们已**提出循环、无条件运行**并加 **H0**（前提自己也被断言）⇒ **C2 指纹清零**（`files=57 baseline=57`），断言**更强**。⇒ 与 `docs/11 §4.2` 第九条同型：**分支不走则该断言被静默跳过** |

## 7. 具名未做 / 需派单

1. **`docs/11 §4.2` 的实例条目未写**：该文件**当前有在飞写者**（`git status` 显示 ` M vibe-math-vmu/docs/11-…`）⇒ 我**不与它同文件各改一处**（遵守"一个写者"）。⇒ 请 Lead 指派或允许我在下一轮补一条（内容：代码侧去注释＋双向自探针；"模块不得自造公开码"）。
2. **`regen-all --check` 的 2 项**：Lead 轮末（见 §5）。
3. **`task-130` 的 A/B 复核**：`pack2` 已交付（`vmu-pack-plan-rule-validate 35/0`、两半各自可证伪）；我**尚未**独立复跑其 A/B 对照（他们附了原样命令）⇒ **派单即复**（这是我在上一轮说过的"派单即可"）。
4. **共享 `oneOf` 回落**：下一轮（Lead 已裁）。

**新文件登记**：仓内**无新增文件**（只改 `tests/audit-vmu-docs.test.mjs`）⇒ 无需双登记。
