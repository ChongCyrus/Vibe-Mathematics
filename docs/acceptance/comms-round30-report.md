# Round 30 · task-149（接手 `vmu-core2` 的 R29 计划）· **A 已落 ✓** ／ B 设计已实现并可读 ／ **D(A) 已落 ✓** ／ E 部分 ／ **C 具名未做（缺 scope，阻塞点精确）**

> ★ **起点＝`_handoff/vmu/core-round29-report.md`（core2 的 R29 记录，我照读 §1／§2／§4bis，未重造、未覆盖）**。本文件是它的**续篇**：它把"执行点定位／B 的两路处置／C 的抽取授权／core 不变量"全部落在纸上，本轮把它**变成代码**（A）并**种下当天反例**（D）；C 卡在一处**可验证的 scope 边界**上（§6）。
> 纪律：未跑全量（T0/T1 归 Lead）／未 `regen-all`／**未 git**；临时文件 `D:\_tmp\v30`；**未碰** `vibe-math-vmu.js`／`host.js`（task-151 的面，见 §7）；结构性编辑原子＋每步跑"加载内核"套件。

## 0. 核验行（本轮我自己的读数，全部可复算）

| 项 | 读数 |
|---|---|
| 干净跑 `node tests/vmu-settings-domain.test.mjs` | **26 passed / 0 failed，exit=0** |
| 当天反例 `CTRL_MUTANT=noop`（把 `validateValue` 掏空＝回到"声明只是文档"） | **8 passed / 18 failed，exit=1**（18 条 **具名** FAIL） |
| 行数（`split('\n')` 口径） | `settings/schema.js` 1574→**1653**（+79）／`kernel/index.js` 2255→**2306**（+51）／`tests/audit-settings-channels.test.mjs` 145→**168**（+23） |
| `kernel/meetings.js` 现状 | **1199** 行（C 必须**净减**，见 §6） |
| RULE E | **current=67 = baseline=67**（★ 我第一版给 `audit-settings-channels` 引入过一条 `A:for:sampleKeys.slice` 新指纹，**已按纪律修掉**，见 §5） |

## 1. ★ 不对称的准确描述（Lead 要求原样进报告）

**不是"这个包不做校验"，而是"两条校验各走各的、其中一条没接上"**：
- **键校验**（`assertDeclared`，`settings/schema.js:1436`）**接上了** —— `vibe-math-vmu.js:36` 导入 → `:614` 交给适配器 → **`host.js:553` 在 `set` 面真的调用**；
- **值/域校验**（`validateValue`，`settings/schema.js:1459`）**没接上** —— 唯一调用者 `resolveSettings`（`:1558/:1566`）**自己也没有调用者**（core2 与我**各自** grep 复核，结论独立同向）；
⇒ **这解释了"为什么有人会以为已经校验了"**：**同一个文件里一半校验确实在跑**（键），于是"声明了 `type`/`domain` ⇒ 应该也在跑"成了很自然的误读，而 `:1521` 那句 *"the path every runtime write takes"* **正是把这个误读写成了注释**。★ 该注释本轮**已改成真话**（并点名真正的执行点）。

## 2. A · 已落 ✓ —— 值/域守卫的**两个真执行点**（都在我写范围内，**未动 `inject`**）

| 执行点 | 位置 | 处置 |
|---|---|---|
| **配置/合并面（构造期）** | `kernel/index.js`：在 `settingsView` 建立**之前**（`:357` 前）跑 `screenSettings(settings, { source:'config' })` | **不收该值 ＋ 具名记账 ＋ 用声明默认值** ⇒ `settingsRejected[]`（`status().settings.settingsRejected(Count)` 可读） |
| **交互写面** | `kernel/index.js` 的 `setSettingsValue`：在既有 `settingsGuard` 之后加 `validateValue(key, value)` | **具名拒** `VMU_INVALID_ARGUMENT`（**复用已登记码**，与 R17 的 `orderMode` 同码；**未自造码**） |
| **pack／合并层** | `kernel/index.js` 的 `applyPackSettings`：`resolveSettings([incoming], { onInvalid:'reject' })` ⇒ 只应用 `accepted[0]`，rejections 记 `source:'pack:<id>'` | 同"合并面"处置；**这同时是 `resolveSettings` 的第一个真调用者**（此前不可达） |

- `settings/schema.js` 新增 **`screenSettings(input,{source})`**（把 `validateValue` 变成真被调用的守卫）＋ `resolveSettings(layers,{onInvalid})`（`'refuse'`＝原语义默认／`'reject'`＝合并面），并返回 `{values, accepted, provenance, rejected}`（`accepted[i]` 让调用者**只应用一层**，不必把每个声明默认值物质化进 live settings）。
- ★ **`schemas.js:1521` 的假注释已改正**：逐字写明"这句曾经是假的 + 现在的两个执行点在哪"。
- ★ **`status()` 新增**：`settings.settingsRejected[]`（key/value/code/reason/domain/default/source）＋ `settingsRejectedCount`；另有 `kernel.settingsRejected()` 只读访问器（**没有走 `host.js`**，故与 task-151 不重叠）。

## 3. B · 两路两种处置（＝实现，不是纸面）

- **(i) 处置**：交互写面＝**具名拒**；配置/合并面＝**不收 ＋ 具名记账 ＋ 声明默认值**。★ 理由（照 core2 §2 采纳）：合并面硬拒会把**一个键写错**升级成**整个会话起不来**——我们在 preset 组装上已经见过一次同类打断。
- **(ii) 既有部署已有域外值**：**升级后不会突然拒载**（合并面不拒），`settingsRejected` **本身就是那条一次性具名迁移提示**（点名 key/value/domain/default）。
- **(iii) 三态可区分（断言逐态各一，见 §4 T1–T4）**：**未给值** ⇒ 声明默认、`settingsRejected` 空（零机制）／**未声明键** ⇒ `reason:'undeclared'`（**记账但原样保留**，合并面不删别人的键）／**声明了域外** ⇒ `reason:'outside the declared domain …'`（记账＋默认值）。
- **行为变更清单（Lead 要求具名）**：① `set` 面新增具名拒（此前被静默存下、再由读者回落）；② 配置/pack 面新增 `settingsRejected` 记账（回执新增字段）；③ 域外值不再出现在 live settings（此前会"看起来像默认值"）。★ **受影响的套件实测到一处并已修**（§4 末）。

## 4. D（A 部分）· 断言 26 条 ＋ **当天种下的反例**

`tests/vmu-settings-domain.test.mjs`（新，**26 条**；集合断言**同一表达式内带非空前置**并打印计数）：
- **§1 交互面**：三个枚举键（`vmu.budget.onExceed`／`vmu.quota.onExceed`／`vmu.compat.unknownCombo`）域外值 ⇒ `VMU_INVALID_ARGUMENT` ＋ 拒绝里**点名域**；同键声明内值 ⇒ 通过（正控制）；**`vmu.metrics.sampleRate=7` ⇒ 拒**（★ 这正是 `:1521` 那句假注释声称的 0..1 界）。
- **§2 配置面**：域外值 ⇒ `settingsRejectedCount===1`、记录点名 key/domain/default、`resolved[key].value===声明默认`、**合法的 `config` 值不受影响**、**内核仍然构造成功**。
- **§3 pack 面**：合法 pack 值被应用、域外值不被应用且**带 `source:'pack:probe-pack'`** 记账；坏 pack 默认值**不抛**。
- **§4 三态**：未声明 vs 域外**各记一条、reason 不同**；未声明键**原样保留**；只有合法值的部署**记录为空**。

**★ 当天反例（`D:\_tmp\v30`，不写仓库）**：`CTRL_MUTANT=noop node --import …/register-domain-mutant.mjs tests/vmu-settings-domain.test.mjs` ⇒ **8/18，exit=1**，18 条具名 FAIL 全在"该拒的没拒／该记的没记／域外值真的进了 live settings"上——即**去掉执行点就必红**。

**★ 一处"行为变更影响到既有套件"（实测＋修复，必须具名）**：`tests/audit-settings-channels.test.mjs` 的 `G1.g` 用**合成值**探写（枚举键给字符串 `'runtime-probe'`、ratio 给 `before+1`）⇒ A 落地后这些写入**被正确地具名拒**，于是 `observed=0`、该门**57/1 红**。**修法**：探针改用**声明内**的值（枚举取域内另一个成员、ratio 取 0.25/0.75、数组/对象深拷贝），**门要证的意图不变**（两通道一致 ＋ 至少一键真的物质化）⇒ 现 **59/0**。★ 这条正是 core2 §2 末尾"可能受影响的套件我未枚举"那件事的**第一个实例**，现状＝已点名并已修。
> ★ **"改了哪些既有行为"栏的原样表述（Lead 要求）**：**A 一落地就真的改变了既有行为，而且【是门禁把它抓出来的】** —— 合成探针值（`'runtime-probe'` / `before+1`）从此**被 A 正确拒**，`G1.g` 的 `observed=0` 就是它；**修的是探针**（改用声明内值），**不是放宽门禁**。

## 5. E（部分）· 登记与门禁

- **登记**：新测试进 `package.json files[]`（`tests/vmu-settings-domain.test.mjs`；`installer.js` 对测试文件为 0 条，实测）。**本轮未新建 kernel 模块** ⇒ 无第二登记项。
- **门禁读数（同一次收尾运行）**：`vmu-settings-domain 26/0`／`vmu-settings 47/0`／`audit-settings-channels 59/0`／`vmu-kernel 175/0`／`vmu-meetings 163/0`／`vmu-entry 150/0`／`vmu-pack 53/0`／`audit-enforced-consistency 358/0`／`audit-package-membership 29/0`／`audit-code-size 9/0`／`generate-wired-schema --check` **schema already in sync（1653→1653）＋ INVARIANTS ok**／`audit-pack-value-domain 5/0`／`vmu-planned-settings ALL GREEN`／`audit-doc-vs-code-tables 17/0`／`vmu-seam-params-consumed 8/0`／`audit-vmu-docs 99/0`／`check-docs PASS`／`audit-fs-purpose 10/0`／`audit-dependency-cycles 8/0`；`audit-declaration-criterion` **RULE E 67=67**（唯一 FAIL＝`regen-all --check`，Lead 的轮末步）。
- ★ **RULE E 我自己踩了一次并修掉**：给 `audit-settings-channels` 加探针时引入了 `A:for:sampleKeys.slice` 新指纹 ⇒ 改为**循环前钉非空**（`probeKeys.length > 0` 在同一窗口内）⇒ 指纹集合回到 **67=67**。

## 6. ★ C · **具名未做** —— 阻塞点精确到行，非我 scope

**要做的三件**（Lead 与 core2 §3／§4bis 已定）：① helper（`meetings.js:128`）＋ **11 个调用点**（`:136/138/147/154/171/173/178/184/185/186/188`）**原子抽取**到新模块（净减行）；② 11 处改**读取侧具名拒**（模板 `meetingmarker.js:296` 的 `strictOrderMode` ／ `:285` 的 `ORDER_MODES`）；③ **9 个键在 `schema.js` 补 `domain`**（**块外手写**＋进 `HAND_DECLARED_DOMAINS`）＋「`schema.domain` ≡ 读取侧集合」**逐元素相等**断言。

**为什么本轮不落（可验证的 scope 边界，不是我偷懒）**：
- ③ 的 `HAND_DECLARED_DOMAINS` 在 **`scripts/generate-wired-schema.mjs:301-303`**（现只有 `vmu.meetings.orderMode`），而该脚本**不在 task-149 写范围**（任务写范围＝`settings/schema.js`／`kernel/**`／`tests/**`／`package.json`／报告）。
- 该生成器**有两条不变量**（`generate-wired-schema.mjs:463-465`）：`HAND_DECLARED_DOMAINS` 里的键**必须在手写 schema 里**，且**不得出现在生成块内**。⇒ 只在 `schema.js` 手写 9 行 `domain`、而**不同时**把它们加进那个集合，会：① 与生成块里现有的同名行**重复**（生成器仍会为这些键发 `type:'string'`），② 直接触发 `:465` 的不变量红。
- 而把 9 行**从生成块移出**需要跑生成器 `--write`（＝`regen-all` 那一类），**本轮明令禁止**，且生成块是**生成物不得手改**。
- ⇒ **正确路径（3 步，需一次 scope 授权）**：① 授权我改 `scripts/generate-wired-schema.mjs`：把 9 键加进 `HAND_DECLARED_DOMAINS`；② 我在 `schema.js` 块外手写这 9 行（带 `domain`）；③ Lead 跑一次生成器 `--write`（生成块那 9 行消失）⇒ 再落 ① 的抽取与读取侧具名拒，最后跑「逐元素相等」断言。★ 另：`meetings.js` 现 **1199/1200**，抽取必须**净减**（这也是它被授权的原因）。

## 7. 未做／边界清单（做不完就具名）

1. **C 全部未落**（§6：缺 `scripts/**` 的 scope 授权 ＋ 需一次生成器 `--write`）。
2. **B 的两路处置写进 docs 未落**：`docs/04`／`docs/21`／`docs/05` 不在本任务写范围（core2 §6② 已具名转出）⇒ 文本我可在下一轮备好，落地请派 docs 属主。
3. **未碰** `vibe-math-vmu.js`／`host.js`（task-151 的面）：A 的执行点**故意**选在 `schema.js` ＋ `kernel/**` ⇒ `settingsRejected` 目前**只在 `kernel.status()` 可见**，**没有**接进宿主 `set` 工具回执；若 Lead 要它在工具回执里出现，**需要一次跨文件授权**（我不自行跨）。
4. **真机未跑**：本轮全部为 in-process 装配读数；真机结论不声称。
5. **既有可能受影响的套件**：我只实测到并修好了一处（§4 末 `audit-settings-channels`）；其余候选（任何喂域外值并断言"回落成默认"的 settings 套件）我**跑过 `vmu-settings`／`audit-settings-channels`／`vmu-planned-settings`／`generate-wired-schema --check` 全绿**，但**没有跑全量**枚举口径。

---

## 8. ★★ STOP-THE-LINE：A 第一版的回归（`vmu-verify2` 抓到）＋ 修复（Lead 裁定 ①②③④ 已照做）

**它抓到的（我复现，逐字同）**：`validateValue` 的 switch 只有 8 种 type 有 case，而 A 让这个函数**从死代码变成两个面都在跑** ⇒ `default: throw 'unknown declaration type'` 把"**未定义**"当成了"**非法**"：
```
setSettingsValue('vmu.meetings.attendanceMode','roster') ⇒ THREW … unknown declaration type …: string
setSettingsValue('vmu.meetings.minutesDetail','brief')   ⇒ THREW 同上
config.vmu['vmu.meetings.attendanceMode']='bogus'        ⇒ 被筛掉，reason 写 "expected string"（值本就是 string ⇒ 误导）
```
**爆炸半径（我按 `SETTING_DEFS` 复算，与它一致）**：未覆盖类型＝`string 173`＋`planned 111`＋`object 21`＋`integer 7`＋`number 7`＝**319／1226 键（≈26%）**。★ **我那份 26 条断言没有一条走在 `string` 键上** ⇒ **回归对它是不可见的**（这就是盲点）。

**修法（Lead 裁定 ①②③④ 全部照做，1 次重构）**
- 把 switch **抽成一个纯判定** `whyBad(d, value)`（返回"为什么不行"的字符串／`null`），`validateValue` 只做三件事：**具名豁免** → 判定 → 抛具名拒。★ 单一来源，杜绝"两份 switch 漂移"。
- **②补齐能补的**：新增 `string`（173 键，最常见的那个）／`integer`／`number`／**`object`（按裁定＝type-only：只校"是不是对象"，不校字段）** ⇒ 现在**Judged**。
- **①未实现类型不再当非法**：`planned`（111，声明了但未接线）进 **`UNJUDGED_TYPES`** ⇒ **不执法、不拒**，且在 `status().settings.settingsUnenforced.types` **具名**（带 `count` 与 `reason:'no validator implemented for this declaration type yet'`）。
- ★ **我额外发现并具名的一类（Lead 裁定①的精神：既不静默收下、也不误拒）**：**13 个声明自相矛盾的键**（**它自己的 `def` 通不过它自己的声明**，如 `vmu.tools.enabled` 声明 `stringList` 而默认不是列表）—— 一个**由声明导出的校验器绝不能拒掉该声明自己的默认值** ⇒ 这 13 键**不执法但逐一具名**（`settingsUnenforced.declarations`，reason 写出"它自己的默认值不满足它的声明"）。**这是我的额外产出，不是原发现的转述。**

### 8.1 ★ 那 13 键的**根因三分**（`vmu-verify2` 独立复核并补了**判别性对照**）＋ **两条口径更正**

**两个层次必须先分清（`vmu-verify2` 更正 ②，我采纳）**：
- **层次 A（被判定的键）**：`validateValue(key, def.def)` 对**所有受判定的键** ⇒ **0/1226 失败**（`vmu-verify2` 与我都量到）——这是"校验器不拒自己的默认值"的不变量；
- **层次 B（被豁免的键）**：本节 13 键**正是被豁免的那一批**，对它们做的是**根因分类**，不是"判定失败"。
⇒ 两层**同源不冲突**；引用时不得混读（我上一条消息里已有这个区分，这里补全并保留）。

**三分表（逐键读 `def` 实际值；生成块 1044–1377，其余手写）**

| 根因 | 键数 | **规范键名（逐字，`SETTING_DEFS` 全部命中）** | 性质 / 归属 |
|---|---|---|---|
| **b1 `null` 默认值 vs 具体类型** | **10** | `vmu.tools.enabled`(stringList,`null`)／`vmu.tools.faces`(stringList,`null`)／`vmu.external.endpoints`／`vmu.external.mergePolicy`／`vmu.math.repro.seed`／`vmu.partnership.crossBorderGate`／**`vmu.partnership.invoiceTaxSlots`**／**`vmu.partnership.registryDir`**／`vmu.resource.capabilityTags`／`vmu.teaching.latePenaltyRatio`（后 8 个均为 `object`,`null`） | ★ **框架有"未设"概念而校验器没实现它**（源头：生成器逐字含 *"emitted with a null default"*／*"an honest null default"*）⇒ **修法＝裁定 `null`＝未设**（对所有受判定类型一律接受、语义＝回落声明默认值）⇒ 10 键即从豁免名单消失 |
| **b2 数字默认值被标成 `object`** | **2** | `vmu.math.optim.tolerance`(def `1e-6`)／`vmu.math.precision.tolerance`(def `1e-9`) | **声明确错**；生成块 ⇒ **归生成器属主**（类型推断），不在我写范围 |
| **b3 `positiveInteger` 默认 `0`** | **1** | `vmu.topology.committeeSize`(def `0`) | 声明与默认值二者之一写错；手写行 ⇒ 需语义裁定（`natural` 还是默认改 1） |

**★ 更正 1（我自己造成的，必须改掉）**：我上一条消息在表格里把那两个键**缩写成** `invoiceTaxSlots`／`registryDir`（省了 `vmu.partnership.` 前缀），`vmu-verify2` 按字面搜 ⇒ **NOT FOUND**，于是怀疑是**别名/短名**。**实测**：`resolveKey('vmu.invoiceTaxSlots')` 与 `resolveKey('vmu.registryDir')` **原样返回**（不是别名）；**规范键名如上表加粗的两项**，我逐字复核 `SETTING_DEFS` **全部命中**，`b1=10／b2=2／b3=1＝13` 与 `unenforcedReport().declarations.length` **逐数相等**。⇒ **根因是我把键名当成了可缩写标签**（★ 与"引用前先落一行核验"同族：**清单里的名字不得缩写**）。

**★ `vmu-verify2` 补的判别性对照（把"根因"从自述变成判据）**：
- **b1**：**非豁免**的具体类型键一律**拒 `null`**（`vmu.records.tracks`(stringList)／`vmu.prompts.bindings`(objectList)／`vmu.board.wipPerColumn`(object) 都 THREW），而**豁免**的 `vmu.tools.enabled`／`vmu.external.endpoints` 的 `validateValue(null)` **ACCEPTED** ⇒ ★ 它们的"被接受"来自**逐键豁免**，**不是**校验器认识 `null` ⇒ b1 根因成立。
- **b2／b3**：非豁免的 `object` 键给数字 ⇒ `expected an object`；非豁免 `positiveInteger` 给 `0` ⇒ `expected an integer >= 1` ⇒ 两类的矛盾都**判别性成立**。

**入册**：矩阵 **§9.36.9**（1768→1784 行，sha256[0:16]=`9816DA08AF3E30D0`）含三分表＋两条对照＋两条更正（§9.36.8 为前一条 STOP-THE-LINE 的复核）。**本提交不依赖该三分表**（豁免已具名、不隐藏）；处置定序＝(i) 先裁 b1 的 `null` 语义 → (ii) b2 转生成器属主 → (iii) b3 等语义裁定。

**★ 追加（`vmu-verify2` 把"13"从点数升级为【双向集合相等】，我照收并记；它同时更正了它自己那半句）**
- **它的自我更正**：`SETTING_ALIASES` **键数 ＝ 0** ⇒ **本模块根本没有别名条目** ⇒ 我先前只能说"`resolveKey` 原样返回（不是别名）"，它给出的是**更强的判据**（别名表为空 ⇒ 那两个键**不可能**是别名）。两处结论一致 ✓。
- **集合相等（比"数量相等"强）**：它把「我列出的 13」与「回执 `settingsUnenforced.declarations` 的 13」做**双向差集** ⇒ `in theirs but NOT in receipt = []` ＋ `in receipt but NOT in theirs = []` ⇒ **set equality = true**（非空前置：回执侧 13）；并给出 `byType = {stringList:2, positiveInteger:1, object:10}` ⇒ ★ **与三分类对账**：`object:10 ＝ b1 的 8 ＋ b2 的 2`／`stringList:2 ＝ b1`／`positiveInteger:1 ＝ b3` ⇒ **按类型计数与按根因分类互相印证**。
- ⇒ 口径升级：**"13 = declarations.length" 只是数量相等；"双向集合相等 ＋ byType 对账"才是集合级证据**（同族纪律：**清单不许按名点数，要与回执对集合**）。
- **入册**：矩阵 **§9.36.10**（1784→1807 行，sha256[0:16]=`464FFEDA7529035A`）；`task-149 A` 在复核侧**全部收口**（现场 §9.36.1–9.36.4／已修 §9.36.8／三分 §9.36.9／集合相等 §9.36.10）。

---

## 9. ★ Lead 的第二批裁定（①清扫 ＋ b1／b2／b3）—— 全部已落，读数在下

**① T1 红点＋廉价清扫（同类的第二例）**
- **修**（`tests/vmu-set-attribution.test.mjs`）：探针值 `'m-majority'` **4 处 → `'m-unanimous'`**（`vmu.meetings.quorumRule` 的域 ＝ `m-unanimous | all-unanimous`），并在常量旁写明**为什么**（域外探测值被 A 正确拒 ⇒ CONTROL 臂"拥有者可写"变成 INVALID_ARGUMENT ⇒ 随后读 `lastRuntimeWrite` 为 null ⇒ TypeError）。**意图不变**：现 **15 passed / 0 failed**。
- **清扫（范围与判据原样，不夸口）**：按 **`tests/**` 的两个写面**搜 —— `setSettingsValue(` 与 `key:`/`value:` 对（**381 文件**）。分类：`tool-parsed(before-kernel)` **18**（工具面按声明解析后才进内核，`host.js:570-580`；`enum`/`string` 原样透传）／`deliberate-undeclared-key` **9**（断言就是"未声明 ⇒ 具名拒"）／`cannot-judge(expr)` **7**／`ok` **29**／`deliberate-out-of-domain(asserted-refusal)` **2**（我自己 §1/§5 里**故意**的域外探针）。⇒ **RESIDUAL（需修）＝ 0**。★ 措辞按你的要求：**"我按这个范围搜过、没找到（第二处）"**；**范围外**（`scripts/**`、`packs/**`、`_oneoff/**`）本轮未搜。

**② b1 落地：`null` ＝【未设】哨兵**（`schema.js`）：规则放进**纯判定 `whyBad`**（单一来源）⇒ 校验器**与豁免判定同时**知道它 ⇒ ★ **10 个 null-默认键从自相矛盾名单消失（13 → 2）**；`validateValue(key, null)` 对**所有受判定类型一律接受**（实测 **0 类拒 null**）；`null` 的 config 值**不进 `settingsRejected`**。
**③ b2 落地（生成器）**：`typeOf` 新增**科学计数法** ⇒ `'number'`（`1e-6`/`1e-9` 原为 `null` ⇒ 发射器 `null ⇒ 'object'` 兜底把数字 def 标成 `object`）。★ **后果写明**：`--check` 现在报 **DRIFT（1737→1737）**——那 2 行要**你跑 `--write`** 才落盘；INVARIANTS 仍 **ok**（332 emitted／783 pre-existing／5 service surfaces／6 honest null default）。**未手改生成块**。
**④ b3 落地**：`vmu.topology.committeeSize` 声明 `positiveInteger → natural`，依据是**代码事实**：`kernel/topology.js:55`（`Number.isInteger(v) && v > 0 ? v : 0`）＋ `:91`（`params.committeeSize > 0`）⇒ **0 是"不限"的有意义状态**，该行**自己的 doc 也写着"0＝不限"** ⇒ 错的是声明。
**⑤ 四项当天反例（全部断言级红，非崩溃）**：干净 **47/0 exit=0**；`noop` ⇒ **27/20 exit=1**；`drop-string` ⇒ **39/8 exit=1**；**`reject-null`（②反例）⇒ 46/1 exit=1（FAIL N3：名单回到 12）**；**`drop-sci`（③反例）⇒ 46/1 exit=1（FAIL N5：`typeOf('1e-6')=null`）**。★ 我自己踩过一次：放宽 loader 钩子的 URL 过滤后 `noop`/`drop-string` 也去匹配生成器 ⇒ `ANCHOR MISS` 崩溃（**崩溃不是断言红**）；已把**每个模式限定到自己的文件** ⇒ 四项现在都是断言级红。
**门禁（同一次收尾）**：`vmu-settings-domain 47/0`／`vmu-set-attribution 15/0`／`vmu-settings 47/0`／`audit-settings-channels 59/0`／`vmu-kernel 175/0`／`vmu-meetings 163/0`／`vmu-entry 150/0`／`vmu-pack 53/0`／`audit-enforced-consistency 358/0`／`vmu-planned-settings ALL GREEN`／`audit-package-membership 29/0`／`audit-doc-vs-code-tables 17/0`／`audit-fs-purpose 10/0`／`check-docs PASS`／**RULE E 67=67**（§7 一度引入 `A:decl` 空过指纹，改成 `filter`＋计数后回基线）。

**★ 具名残留**：(a) **b2 的 2 行等你 `--write`**（在那之前 `--check` 报 DRIFT 是正确的）；(b) 生成器 `d.type === null ⇒ 'object'` 的**兜底仍在**（本轮修的是"可识别字面量"；兜底对**不可识别字面量**仍会写出一个它并不认识的类型）⇒ 建议下一轮把它改成**具名清单并在生成器报告里点名**，本轮按你的范围**未动**；(c) `settingsUnenforced`/`settingsRejected` 仍只在 `kernel.status()`（进宿主回执归 pack2）。
- **③覆盖门（根本那条）**：`tests/vmu-settings-domain.test.mjs` §6 —— ①**每种已声明 type**：喂一个必然非法的值，错误**不得**是 `unknown declaration type`（除非该 type 在具名集合里）⇒ **新加一种没有 case 的 type 必红**；②**没有任何声明会拒掉自己的默认值**；③配上**当天反例**：`CTRL_MUTANT=drop-string`（把新增的 `string` case 删掉＝**这次回归的形状**）⇒ **32 passed / 8 failed，exit=1**，其中 **W1**（就是 verify2 量到的那次调用）、**W4**（连它看到的 `reason:"expected string"` 记录都逐字复现）、**W7**（type 扫描：`string@vmu.turn.objective legal=false illegal=unknown declaration type`）。
- **④断言补盲**：§5 现在**逐 type 各一条见证**（从 `SETTING_DEFS` **程序化取键**，跳过 H3 只读键与具名豁免键；实测 **probed=12**）＋ **`string` 键在【两个面】各一条**（交互面 `'roster'` 不再抛／config 面一个 token **不再被筛**且真的生效）。

**修复后读数（同一次运行）**：`test.mjs` ⇒ **40 passed / 0 failed，exit=0**；`drop-string` ⇒ **32/8 exit=1**；`noop` ⇒ **20/20 exit=1**；`unenforcedReport()` ⇒ `planned{count:111}` ＋ `declarations:13`；**"被自己的声明拒掉的默认值"＝0/1226**（13 个缺陷键已豁免）；全门禁：`vmu-settings 47/0`／`audit-settings-channels 59/0`／`vmu-kernel 175/0`／`vmu-meetings 163/0`／`vmu-entry 150/0`／`vmu-pack 53/0`／`audit-enforced-consistency 358/0`／`audit-planned-settings ALL GREEN`／`generate-wired-schema --check` **INVARIANTS ok**／`check-docs PASS`／**RULE E 67=67**（新增的 §5/§6 循环都带**非空前置**）。

**★ 入库纪律（`vmu-verify2` 提议、Lead 采纳，我照记）**：**执行点上线前，先证它对【每一种已声明类型】都有定义** —— 否则它会把"未定义"当成"非法"。与 R28 合看：**一个方向是"没人执行"，另一个方向是"执行了却把没定义的类型当非法"，两个方向都要防**；本轮的机械化落点＝§6 的两条覆盖断言＋`drop-string` 反例。
