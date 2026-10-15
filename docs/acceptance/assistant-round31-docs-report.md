# Round 31 · `task-154`（docs）：`docs/04 §6.1` 回改完毕（A 已落地）＋ 发现一处**读数污染**（在飞写者，两次独立实例）

> 负责人：`vmu-assistant2`｜交付：`docs/04-settings.md`（§6.1 **整块回改**）、`docs/02-architecture.md`（那一行同步）、本报告。
> 硬约束：**未做真机**（按 Lead 指示，真机复核排下一轮）；**未跑全量**／未 `regen-all`／未 git 写／未改代码·测试；临时文件全在 `D:\_tmp`。
> ★ **本轮我的角色只有 docs**（写者隔离：`comms2` 在 `schema.js`／`kernel/**`／生成器／`tests/**`，`pack2` 在 `vibe-math-vmu.js`／`host.js`）—— 我只改了两卷 docs。

---

## 0. 结论（四句）
1. **A 确实已落地**（`c12556e`）：`resolveSettings` **有了第一个真运行期调用者**，值/域校验**三个执行点**（§1 给了 `file:line`）⇒ R30 我写的"未接线／未生效"**现在是假话，已整块回改**（§2）。
2. **回改后的两处都带当天实证读数**，且读数**绑定到"哪一版"**（提交 `c12556e` ＋ 两个文件的 sha256 前缀 ＋ 时刻 20:38:48）（§3）。
3. **两条具名边界已写进卷**（`planned` 111 具名不执法／`declarations` 逐键豁免）——★ 但 **`declarations` 我实测是 `[]`（0）**，与任务书写的"13→2"**不一致**，我按实测写并具名了这个差（§4）。
4. ★★ **本轮发现一处"读数污染"**：**写者未提交的中途态会让别人的读数翻红**（我撞了**两次**，且用隔离实验证明了归属）。**写者隔离防住了"写撞写"，没防住"写撞读"** —— 建议与证据见 §6。

## 1. ★ 先核 A 的落地形态（板上 ＋ 读码 ＋ `file:line`）
| 项 | 读数 |
|---|---|
| **板上** | `task-149` 已不再是我 R30 看到的 `in_progress` 单项工作；**A 落进提交 `c12556e`**（`git log`：*"round 30 - declared types and domains finally have a runtime execution point, and it nearly shipped a 26 percent regression"*） |
| **`resolveSettings` 现在有调用者了吗** | ★ **有**：`kernel/index.js:1855` `const screened = resolveSettings([incoming], { onInvalid: 'reject' })`（在 `applyPackSettings()` 里）—— 该处注释自陈 **"also `resolveSettings`'s first real runtime caller — before this it was unreachable code"** ✓ |
| **三个执行点** | ① **配置／合并面（构建期）**：`kernel/index.js:363-378` `screenSettings(settings, { source:'config' })`（`settingsRejected.push(r)`；`if (r.reason !== 'undeclared') settings[r.key] = r.default`）<br>② **交互写面**：`kernel/index.js:1911` `setSettingsValue()` 里的 `validateValue(key, value)`（注释自陈 "THE VALUE/DOMAIN GUARD'S EXECUTION POINT, SECOND OF TWO (the INTERACTIVE face)"）<br>③ **pack／合并层**：`kernel/index.js:1855`（同上的 `resolveSettings(..., {onInvalid:'reject'})`；记录追加 `source:'pack:'+by`） |
| **回执暴露** | `kernel/index.js:2112`（`settingsRejected()`）／`:2176-2177`（`settingsRejected`／`settingsRejectedCount`）／`:2182`（`settingsUnenforced: unenforcedReport()`）✓ |
| **那句假注释** | ★ **源码里已被逐字纠正**：`schema.js:1606` 现在**引旧句并标注** *"…the path every runtime write takes"* **AND THAT WAS FALSE** ✓（旧行号 `:1521` 已不复存在） |
| **新签名** | `schema.js:1697` `export function resolveSettings(layers = [], { onInvalid = 'refuse' } = {})` —— `refuse`＝原行为（默认），`reject`＝合并面处置（记账＋跳过，默认值留下）✓ |

## 2. 回改了什么（两卷、同一次）
- **`docs/04 §6.1`：整块替换**（原"两条校验的不对称 ✗／未接线 ✗／设计（未生效）"那 9 行）⇒ 改为：
  1. **两条校验现在都在跑**，但**执行点不同**：键校验（`host.js` 的 `set` 面）／值·域校验的**三个执行点**（逐条 `file:line`）；
  2. **历史保留为教训**：那句注释**曾是假的**，A 落地时**已在源码里逐字纠正**（`schema.js:1606`）；
  3. ★ **一处近失**（新写）：接上执行点后，`validateValue` 的 `default:` 分支开始**拒绝"声明了却没有 case 的类型"的合法值**（如 `string`）⇒ `schema.js:1467-1472` 记成"**把'这个类型没有定义'变成'这个值非法'的执行点，比没有执行点更糟**"（`c12556e` 提交信息里"差点上线 26% 回归"即此）⇒ **执行点必须与"未定义类型"的具名豁免一起设计** ✓（这条是"两路两种处置"能站住的前提）。
- **`docs/02-architecture.md`**：把 R30 那句"值（域）校验【未接线】"改为"**键校验与值（域）校验都已接线**（值/域三个执行点在 `kernel/index.js:363-378`／`:1911`／`:1855`）"，仍只**一句交叉引用**指向 `04-§6.1`（不复写，避免两卷各说一半）。

## 3. ★ 当天实证读数（★ 绑定"哪一版"）
**取样时刻 2026-10-15 20:38:48**；**绑定提交 `c12556e`**：`vibe-math-vmu/settings/schema.js` sha256 前缀 **`D357E4FD0D19`**、`vibe-math-vmu/kernel/index.js` **`81D7CDD40962`**（★ 说明：直接在工作树上跑会把**别人未提交的中途态**算进来 —— 见 §6；因此我把 `c12556e` 用 `git archive` 取成干净副本 `D:\_tmp\r31-c12556e` 后在其上取样）。
```
A) 配置／合并面：{'vmu.budget.onExceed':'nonsense', 'vmu.compat.unknownCombo':'try'}
   settingsRejectedCount = 1
   settingsRejected = [{"key":"vmu.budget.onExceed","value":"nonsense","code":"VMU_INVALID_ARGUMENT",
     "reason":"outside the declared domain refuse | warn | pause","domain":["refuse","warn","pause"],
     "type":"enum","source":"config","default":"refuse"}]
   活值 vmu.budget.onExceed   = "refuse" | source = config     ← 不收该值、声明默认留下
   活值 vmu.compat.unknownCombo = "try"   | source = config     ← 合法值原样生效
B) 交互写面：setSettingsValue('vmu.budget.onExceed','nonsense')
   code = VMU_INVALID_ARGUMENT | message = "vmu.budget.onExceed: expected one of refuse | warn | pause" | hint = "declared as enum"
C) 合法值不被拒：setSettingsValue('vmu.budget.onExceed','warn')
   receipt = {"ok":true,"appliesAt":"next turn","source":"runtime"} | 活值 = "warn" | settingsRejectedCount = 0
   string 型键合法 token：{'vmu.meetings.attendanceMode':'bogus'} ⇒ rejectedCount = 0 | 活值 = "bogus"
D) settingsUnenforced（可读）：types = [{"type":"planned","count":111,"reason":"no validator implemented for this declaration type yet"}]
   declarations = []  （count 0）
E) pack／合并层：applyPackSettings({'vmu.quota.onExceed':'sometimes'},{by:'probe-pack'})
   记录 = [{"key":"vmu.quota.onExceed",...,"layer":0,"default":"warn","source":"pack:probe-pack"}]
F) null 不是域外值：{'vmu.budget.onExceed':null} ⇒ rejectedCount = 0 | 活值 = null
```
**同刻**该版本六套件读数（干净副本内）：`vmu-settings-domain` **47/0**、`audit-settings-channels` **59/0**、`vmu-settings` **47/0**、`vmu-planned-settings` **ALL GREEN（111/28, 39/0）**、`vmu-pack-defaults-named` **32/0**、`audit-enforced-consistency` **358/0** ✓

## 4. ★ 两条具名边界（写进卷；★ 一处与任务书不一致，我按实测写）
- **(a) `planned`（111 键）＝声明了但未接线** ⇒ **不执法但【具名】**：`settingsUnenforced.types = [{type:'planned', count:111, reason:'no validator implemented for this declaration type yet'}]`（实测）⇒ **类型名＋键数＋原因都在回执里**，不静默 ✓。
- **(b) "声明与自身默认值矛盾"的键 ⇒ 逐键具名豁免**（`settingsUnenforced.declarations`；来源 `schema.js:1543` `unenforcedReport()`，每项带 `key` ＋ `reason`）。★ **我实测（`c12556e`，20:38:48）：`declarations = []`（count 0）**，而不是任务书写的"13→2"。
  ★ **差异具名**：任务书的"13→2"应是**三分根修复过程中的中间态**；**我未独立复核 13 与 2**，**以我这版实测的 0 为准**。三分根（写进卷）：① **`null` ＝"未设"哨兵**（已裁＝一律接受，`schema.js:1488/1564`）／② **生成器类型推断**（已修）／③ **手写行 `committeeSize`**（已改 `natural`，`schema.js:404`）✓。
  ★ 卷里同时写明**口径**：**0 不是"名单永远为空"的承诺**，**以 `settingsUnenforced` 实时读数／`unenforcedReport()` 为准**；且**豁免是具名的、不是静默的**。

## 5. 执法点总原则（已写进卷）
**运行期执法在【接线处／读取侧】，`domain` 声明本身不是运行时保护** —— 证据两处：**R17 的 `vmu.meetings.orderMode`** 与 **A 的三个执行点**都靠这一点 ✓。

## 6. ★★ 本轮新发现：**在飞写者会污染别人的读数**（两次独立实例 ＋ 隔离实验）
**现象**：本轮我**两次**在同一批套件上得到**互相矛盾**的读数：
| 时刻 | 套件 | 读数 |
|---|---|---|
| ~20:2x | `vmu-settings-domain` | **47 passed, 0 failed** |
| 20:35:51 | `vmu-settings-domain` | ★ **FAIL W5**（"and it is really in effect (not silently replaced by the default)"） |
| 20:35:51 | `audit-settings-channels` | ★ **59 passed, 1 failed** |
| 20:35:51 | `audit-vmu-docs`（真仓） | ★ **exit=1**（要求 `generate-vmu-settings-table.mjs --write`） |
| **20:38:48（`c12556e` 干净副本）** | 上述全部 | ★ **全绿**（47/0、59/0、99/0、111/28…） |

**归因证据（不是猜）**：
- `git status --porcelain` ⇒ 写者**未提交**：`scripts/generate-wired-schema.mjs`、`settings/schema.js`、`kernel/meetings.js`、`vibe-math-vmu.js`、`installer.js`、`package.json`、`tests/vmu-pack-defaults-named.test.mjs`，＋**未跟踪的新文件 `kernel/meetingdomain.js`**；
- **版本不同**：`schema.js` 工作树 **`9861ACBF837F`** ≠ 提交 `c12556e` 的 **`D357E4FD0D19`**（`git cat-file blob` 二进制比对）；
- **隔离实验（双向）**：`audit-vmu-docs` 在**纯 `c12556e` 副本**＝ **99/0**；**同一副本换上我改后的两卷** ＝ **99/0**；而**真仓**（＝我的 docs ＋ 写者未提交的 `schema.js`／生成器）＝ **exit=1** ⇒ **红既不是我的文本、也不是已提交代码，而是未提交的中途态** ✓（`vmu-settings-domain` 同理：真仓 FAIL W5／`c12556e` 副本 47/0）。
**为什么重要**：**写者隔离（写范围不重叠）只防住"写撞写"，没防住"写撞读"** —— 别人的中途态会让**我的（以及任何人的）T0/T1 读数**在**同一分钟内**翻红翻绿，而**读数本身不带"读的是哪个字节"**。
**建议（具名，交 Lead 裁）**：
1. **凡引用 T0/T1 读数，必须与"文件哈希＋时刻"绑定**（本报告 §3 已照此做）——**这条应是纪律，不是自觉**；
2. 写者**在跑门禁/让别人读之前先落一个可引用的检查点**（提交或至少把哈希写进自己的报告）；
3. 反过来说：**看到红先别改自己** —— 先比 `git status` 与「committed blob vs worktree blob」，**先排除在飞写者**（本轮两次都是这样排除的）。

## 7. 门禁读数（★ 分**真仓**与**干净副本**两栏，含局限声明）
| 门 | 真实仓（我的 docs ＋ 写者在飞态） | `c12556e` 干净副本 ＋ **我的两卷文本** |
|---|---|---|
| `scripts/check-docs.mjs` | **PASS** | FAIL ✗ —— ★ **副本局限**：我只 `git archive` 了 `vibe-math-vmu`／`tests`／`scripts`／`package.json`，**缺仓根其它目录**，该门因此缺文件（**不是发现，也不是我的文本**） |
| `tests/audit-doc-index.test.mjs` | **5 / 0** | **5 / 0** |
| `tests/audit-vmu-docs.test.mjs` | **exit=1**（在飞态所致，见 §6） | **99 / 0** ✓ |
| `tests/audit-doc-vs-code-tables.test.mjs` | **17 / 0** | **17 / 0** |
| `tests/audit-claim-traceability.test.mjs` | **5 / 0** | exit=1 ✗ —— ★ **同一副本局限**（`{"missing":["D11","D12","G8","G11","G13","G17","F53"]}`＝缺仓根定义文件） |
★ **结论**：**我的文本在"已提交代码"上是全绿的**（`audit-vmu-docs` 99/0、`audit-doc-index` 5/0、`audit-doc-vs-code-tables` 17/0；`check-docs`／`audit-claim-traceability` 在真仓也是绿）；**真仓唯一那个红（`audit-vmu-docs`）经隔离实验证明来自写者未提交的中途态**。★ 调用形纪律照旧（新增文字里服务方法一律调用形）。

## 8. 改前/改后哈希（★ BEFORE 用 `git cat-file blob HEAD:` **二进制**取）
| 卷 | BEFORE（= `c12556e`） | AFTER（工作树） |
|---|---|---|
| `docs/04-settings.md` | sha256 **`A02E496BB0FADFDE`**（286690 B） | sha256 **`87AD63AD7C7EFAE7`**（290077 B） |
| `docs/02-architecture.md` | sha256 **`1531E6CE2218074A`**（177771 B） | sha256 **`485E040C4F5BD67B`**（177833 B） |
（副本内两卷哈希与真仓一致：`87AD63AD7C7EFAE7`／`485E040C4F5BD67B` ✓）

## 9. 没做的事 / 遗留（具名）
- **未做真机**（Lead 指示：等 `pack2` 的 ③④ 落地后另派）；**未跑全量／未 `regen-all`／未 git 写／未改代码·测试**；
- ★ **遗留 1（需 Lead 裁）**：§6 的三条建议（读数绑文件哈希、写者先落检查点、见红先排写者）**是否升为纪律**；
- ★ **遗留 2**：`declarations` 名单的**实时**状态应以 `unenforcedReport()` 为准；本卷已写"**0 不是承诺**"，但**若 Lead 要把"13→2"写进任何交付物，请以当时的实测为准**（我这一版是 0）；
- ★ **遗留 3**：`kernel/index.js:1911`／`:1855`／`:363-378` 的行号会随写者继续改动而漂移 —— 本卷的 `file:line` **绑定 `c12556e`**；下次若有人动 `kernel/index.js`，**这三处引用要重新核**（我已在本报告写明该版本哈希）。
