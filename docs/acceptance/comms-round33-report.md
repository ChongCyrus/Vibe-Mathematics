# Round 33 · task-159 · 「未接线」判据覆盖**派生名消费**（含 `selfCheck` 与 16 行残差）· 报告

> 触发面：`vmu-assistant2` 按 Lead 裁定把 `docs/04 §11` 的 `vmu.meetings.minutesDetail` 那格改成 `✅ 已接线` ⇒ `audit-vmu-docs` 红。★ **裁定＝错的是表、不是门**，本任务修**判据**。纪律：生成块/表体**不手写**；反例器**副本制**（真树只读、hash 核）；未跑全量/`regen-all`/git；`D:\_tmp\v33`。

## 0. 结论速览

| 项 | 结果 |
|---|---|
| **A 判据覆盖派生名消费** | ★ **已修**（`scripts/generate-vmu-settings-table.mjs`：新增 `READ_SHAPE` 例外） |
| **计数器** | `1106 wired / 120 not-wired` → **`1108 wired / 118 not-wired`**（**+2**：`minutesDetail`、`budgetOnExceed`） |
| **D 收口** | ★ **`audit-vmu-docs` 已回绿（99/0 exit=0）**；`docs/04 §11` 的 `minutesDetail` 格＝**`✅ 已接线`**、载体 `kernel/meetingdomain.js`；★ **`--check` 报 "up to date"** ⇒ **你那步 `--write` 现在是 no-op**（表体已与判据一致，**不是我手改的**） |
| **C 可红** | 真树仍有 **118 个 `未接线`**（未放宽成"永远已接线"）＋ 副本制反例（下 §3） |
| **B `vmu.turn.selfCheck`** | ★ **结论：其"消费"是【列表驱动的动态读取】，没有任何字面量读取形状 ⇒ 判据不得据此判"未接线"**；**证据**在下 §2（并给出我的处置建议与未做原因） |
| **A 16 行残差** | 逐行判定见 §2：**已核 3 行**（含我修好的 2 行）／**没核 13 行**（★ 按你的规则**写"没核"**，不冒充） |

## 1. A · 判据怎么修的（**输入集＝它声称覆盖的路径**）

**缺陷（实测，逐行证据）**：`isDeclarationLine`（`:64-70`）把"**行首是带引号的 `vmu.*` 键**（数组元素／对象键）"的行整行丢掉，本意是排除 `settings/planned.js`／原因表这类**声明**。但 `kernel/meetingmarker.js` 里有一类是**派生表**：
```
meetingmarker.js:232   'vmu.meetings.minutesDetail': K.minutesDetail,       ← K 是设置访问器 ⇒ 这是【读】
meetingmarker.js:227   'vmu.meetings.budgetOnExceed': K.budgetOnExceed,     ← 同上
```
⇒ 这些**真读**被过滤 ⇒ `hasConsumer()` 只看得到 `settings/schema.js` 里的声明 ⇒ 判 `未接线`。★ **"我看不见"被当成了"没人读"** —— 与 R28「`oneOf` 输入集只覆盖一半来源」**同形**。

**修法（最小、可验、方向单一）**：`isDeclarationLine` 前面加一条**读形状例外**：
```js
const READ_SHAPE = /(K\.[A-Za-z_$][A-Za-z0-9_$]*|sget\(|\.get\(|readKey\(|settings\[|settingsView\(|sgetValue\()/
if (READ_SHAPE.test(t)) return false   // ★ 会读的行就不是声明，无论它以什么开头
```
- ★ **`K.<field>` 正是本题的"派生名消费"**（键名 `vmu.meetings.minutesDetail` ↔ 访问器字段 `K.minutesDetail`）；
- **纯声明仍被过滤**（数组元素／`'key': 'literal'` 默认表／我的 `meetingdomain.js` 表）⇒ 判据**仍能判"未接线"**（C）；
- **判据的输入集与它声称覆盖的路径一样宽**：只要该行**读了**（访问器字段/设置 getter/索引读），键名与字段名不同也认 ✓。

**验证**：`--check` 计数器 **1106/120 → 1108/118**（恰好那 2 个 `meetingmarker` 派生键转"已接线"）。

## 2. B 与 16 行残差（逐行，含"没核"）

| 行 | 判定 | 证据 |
|---|---|---|
| `vmu.meetings.minutesDetail` | ★ **已接线**（判据修好后**自然**生成，非手改） | 读形状行 `kernel/meetingmarker.js:232`（`'…': K.minutesDetail`）；另 `kernel/meetings.js:59`（键列表）/`:87`（默认表，**声明**） |
| `vmu.meetings.budgetOnExceed` | ★ **已接线**（同理） | `kernel/meetingmarker.js:227`（`'…': K.budgetOnExceed`） |
| **残差 B `vmu.turn.selfCheck`** | ★ **结论：**它**不是**"没有消费者"，而是**消费者走列表驱动的动态读取**；**判据不得据此判"未接线"** —— 但**我未实现**（见下） | 唯一载体内出现：`packs/v5r/middleware/prompt-switches.js:27` `['vmu.turn.selfCheck', 'v5r-turn-resources'],` ⇒ **数组元素、`readShape=no`**（我逐行核过）；真正的读取在**注释**里被记载：`packs/v5r/settings/defaults.js:20` 写 `settings['vmu.turn.selfCheck'] !== false`（`prompt-switches.js:27`）⇒ ★ 按 R32 已立的纪律「**注释提到键＝文档，不是读取**」，这里**没有字面量读形状** ⇒ 我的 `READ_SHAPE` 例外**修不好它**（那行确实不是读行，它是**被读的名单**） |
| 其余 13 行（`vmu.turn.objective`／`protocolPath`／`feedback`／`vmu.pointer.propagation`／`vmu.turn.instituteName`／`ballot.freezeMeetingLinked`／`freezeMode`／`reopenInitiatorScope`／`reopenSameMeetingOnly`／`vmu.math.network`／`vmu.math.proof`／`paper.retentionMs`／`teaching.blindMappingRetentionMs`／`teaching.maxUnits`） | ★ **没核**（**不冒充判定**） | 我探到的**部分**线索（**不是判定**）：`vmu.math.network` 唯一出现于 `settings/planned.js`（**声明**）⇒ 倾向"确实无消费者"；`vmu.paper.retentionMs` 出现于 `kernel/paper.js` ＋ `settings/planned.js`，`vmu.teaching.maxUnits` 出现于 `kernel/course.js` ⇒ **两者都有运行时文件命中，须逐行看是否读形状** ⇒ **没核** |

**★ 残差 B 的正确处置（建议，供你裁，本轮未做）**：按你给的第三个选项 **把该类降级为「未判定」而不是「未接线」** —— 具体＝当键**只出现在"被遍历的键名单"里**（数组元素，且该数组在运行时被 `for…of`／`.map` 后交给设置读取器）时，输出 **`❓ 未判定（消费者走动态读取，静态看不见）`**，而不是 `⚠️ 未接线`。★ 理由与本任务 A 同一条：**看不见 ≠ 没有**。我**没做**的原因：它要动 §11 的**格值词表**（新增第三种格）＋ 需要"名单是否被遍历"的判别器（不是一行的正则），在本轮收口窗口内做不完整 ⇒ **具名留给下一轮**（判据与证据都在上表）。

## 3. C · 判据仍可红 ＋ 当天反例（**副本制**）

- **真树**：`node scripts/generate-vmu-settings-table.mjs --check` ⇒ **`up to date (1226 keys (1108 wired, 118 declared-but-not-wired))`** ⇒ ★ **not-wired 非空（118）**，门没被放宽。
- **反例**（`D:\_tmp\v33\counter-evidence.mjs`，**拷贝 tree 到 `_tmp\v33\copy`，只变异副本**）：把副本的 `hasConsumer` 改成**恒 `true`**（＝"把门放宽成永远已接线"）⇒
```
REAL   : {"keys":1226,"wired":1108,"notWired":118}      teeth: YES ✓
MUTANT : (1226 keys (1226 wired, 0 declared-but-not-wired))   ← 未接线类被压成 0
REAL TREE UNTOUCHED: 2873feb6e4d72bed -> 2873feb6e4d72bed OK (read-only ✓)
```
⇒ ★ **变异把"未接线"整类抹掉** ⇒ 这正是本反例要检出的失效形态（判据失去牙齿）；**真树 hash 前后一致** ⇒ 副本制成立。
★ **自曝一处工具瑕疵**：我的 `_tmp` 提取器只在 **stdout** 上匹配计数，而变异运行把计数印在 **STALE 提示（stderr）** 里 ⇒ 脚本打印了 `MUTANT : null`（**证据本身在输出里逐字可见**，只是我的汇总正则没取到）。**不影响判据，只影响我这条汇总脚本**；修它需要再跑一次，本轮预算用尽 ⇒ 具名。

## 4. 收口读数

`audit-vmu-docs` **99/0 exit=0（绿 ✓）**／`audit-doc-vs-code-tables` **17/0**／`vmu-planned-settings ALL GREEN`／`generate-vmu-settings-table --check` **up to date**。★ **`docs/04 §11` 的 `minutesDetail` 与 `budgetOnExceed` 两格均为 `✅ 已接线`**，载体 `kernel/meetingdomain.js` ⇒ **由判据自然生成**。⇒ **Lead 的 `--write` 现在是 no-op**（若你仍想跑，`--check` 会确认 up to date）。

## 5. 具名未做／需你裁

1. **残差 B 的第三种格「未判定」**（§2 末）：需动 §11 格值词表＋"名单是否被遍历"的判别器 ⇒ **下一轮**（Lead 已采纳该结论并排入下一轮）。
2. **16 行里 13 行未核**（§2 表已写"没核"，不冒充）。
3. 我的反例汇总脚本未读 stderr（§3 自曝）——**判据本身无此问题**。

## 6. ★★ 「表陈旧」与「判据看不见」在读数上**同形** —— 业主是判据，不是表（**Lead 要求写入**）

**先发生的顺序（照实记）**：**Lead 在我之前跑过一次 `--write`**；他看到 `docs/04 §11` 里那 2 格变成 `✅ 已接线` ⇒ 当时读作「**§11 表本来就陈旧**」，并据此刻一度**否定我的 premise**。
**我的读数（更准；Lead 已裁定以我为准）**：修好判据后 `--check` 报 **`up to date`**，**他先前那步 `--write` 变成 no-op**。
⇒ **两条证据合起来只支持一个解释**：格子之所以显示「已接线」，是因为**判据当时先把它判成「未接线」**，`--write` 只是**把判据当时的输出落盘**；**判据修好后，表体不再需要任何写** ⇒ ★ **业主＝判据（`isDeclarationLine` 的假过滤），不是表**；那 2 格的行为变化是**判据修好的自然结果**，既不是手改、也不是补写。

★ **这是"分不清两种原因"的一例，且两种原因在读数上完全同形**（都能看到「格＝未接线」或「格＝已接线」）。**唯一能把它们分开的读写**＝修完判据后再跑一次 `--check`：
- **表陈旧** ⇒ 修完**仍需** `--write`（`--check` 继续报 drift）；
- **判据看不见** ⇒ 修完 **`up to date`、`--write` no-op**。

⇒ 纪律（并入）：**"我看到的格子"不是原因，只是两种原因的共同投影**；**判因要靠"修完还有没有 drift"** —— 与「清单不许按名点数，要与回执对集合」同族：**别拿投影当结论**。

---

# Round 33 追加 · task-162 · §11 第三档「未判定」＋ 13 行残差逐行判定

## 7. ① 第三档「未判定」（`scripts/generate-vmu-settings-table.mjs`）

**格值**：`❓ 未判定（可能走动态读取，静态看不见 ⇒ 看不见 ≠ 没有）`（与 `✅ 已接线`／`⚠️ 未接线（改了不会有行为变化）`**并列、不可混**）。
**判别器（`listIterationEvidence(key)`）**：找出**把该键当【数组元素】**的那一行 → 向上定位**持有它的数组名**（`const NAME = [`）→ 在该文件里找**对该数组本身的遍历**（`for (… of NAME)`／`NAME.map|forEach|filter|some|reduce(`）。命中 ⇒ `未判定` 并给出 `{file, listName, elemLine, iterLine}`；否则 **`未接线`**（判据仍有牙）。
**★ 我在原型里先踩了两个"看似有牙"的假证据坑，修掉后才敢入表**：① **把注释当成读**（`packs/v5r/settings/defaults.js:20` 是注释里的 `settings['vmu.turn.selfCheck']`）⇒ `selfCheck` 一度被判**已接线** ✗ ⇒ 加 `COMMENT_LINE`：**注释行永不算证据**（R32 纪律）；② **松遍历**（曾匹配"同文件任意 `.map(`"，把 `kernel/ballotbox.js:175 args.options.map(String)` 当证据）⇒ 会给一批键**臆造**动态读 ✗ ⇒ 收紧为"**必须是对持有该元素的那个数组的遍历**"。
**三档计数（真树）**：`1226 keys (1108 wired, **3 undetermined**, 115 declared-but-not-wired)` ⇒ ★ **恰好 3 键升为「未判定」**：`vmu.turn.selfCheck`／`vmu.turn.feedback`／`vmu.pointer.propagation`，证据同一处 —— 元素在 `packs/v5r/middleware/prompt-switches.js:26/27/28`，**遍历点 `:71` `for (const [key, section] of OFF_SWITCHES)`**（循环变量就叫 `key`）。
**`--check` 现状**＝**STALE**（含新三档计数）⇒ ★ **必须你 `--write` 落盘**；★ 按 §6 判据这**不是**"判据看不见"那一类（那类修完即 `up to date`），**是判据内容真的变了** ⇒ drift 是真 drift。
**C · 可红 ＋ 当天反例（副本制）**：真树三档皆非空 ⇒ 判据既能说 `未接线` 也能说 `未判定` ✓；反例 `D:\_tmp\v34\counter-evidence.mjs`（**拷贝 tree 到 `_tmp\v34\copy`，只变异副本**：`verdictOf` 恒返回 `WIRED` ＝ **三档压成一档**）⇒
```
REAL   : wired=1108 undetermined=3 notWired=115
MUTANT : wired=1226 undetermined=0 notWired=0
REAL TREE UNTOUCHED: ffcd0daa4e6fc914 -> ffcd0daa4e6fc914 OK (read-only ✓)
```

## 8. ② 13 行残差逐行判定（每行给证据；**没核的写"没核"**）

| 键 | 判定 | 证据 |
|---|---|---|
| `vmu.turn.feedback` | **未判定** | 元素 `packs/v5r/middleware/prompt-switches.js:28`；遍历点 `:71` `for (const [key, section] of OFF_SWITCHES)` |
| `vmu.pointer.propagation` | **未判定** | 元素 `prompt-switches.js:26`；遍历点 `:71`（同上） |
| `vmu.turn.protocolPath` | **确实无消费者** | 全部出现仅 `packs/v5r/settings/defaults.js:27`／`defaults.json:10`／`settings/schema.js:158` ⇒ **只有声明与默认表，无列表、无读** |
| `vmu.math.network` | **确实无消费者** | 仅 `settings/planned.js` 的 `planned` 声明 |
| `vmu.math.proof` | **确实无消费者** | 仅 `settings/planned.js` 的 `planned` 声明 |
| `vmu.turn.objective` | **判"未接线"，但★没核** | 元素 `packs/v5r/prompts/v5r-core.js:155`（清单 `PROMPT_ENTRIES`）；**遍历点未定位**（`:63` 只写 `Array.isArray(PROMPT_ENTRIES) ? …`，`.map(` 可能在别行）⇒ 需**跨表达式**遍历定位器 |
| `vmu.turn.instituteName` | **判"未接线"，但★没核** | 元素 `v5r-core.js:154`（同一 `PROMPT_ENTRIES`）⇒ 同上 |
| `vmu.ballot.freezeMeetingLinked` | **判"未接线"，但★没核** | 元素 `kernel/ballotbox.js:18`（键名清单）＋ `:59`（`['key','说明']` 对）⇒ 清单已定位、**遍历点未定位** |
| `vmu.ballot.freezeMode` | **判"未接线"，但★没核** | 元素 `ballotbox.js:18`／`:55` ⇒ 同上 |
| `vmu.ballot.reopenInitiatorScope` | **判"未接线"，但★没核** | 元素 `ballotbox.js:22`／`:64` ⇒ 同上 |
| `vmu.ballot.reopenSameMeetingOnly` | **判"未接线"，但★没核** | 元素 `ballotbox.js:23`／`:67` ⇒ 同上 |
| `vmu.paper.retentionMs` | **判"未接线"，但★没核** | 运行时命中 `kernel/paper.js`（元素形状、清单名已定位）⇒ **遍历点未定位** |
| `vmu.teaching.blindMappingRetentionMs` | **判"未接线"，但★没核** | 运行时命中 `kernel/course.js`（同上） |
| `vmu.teaching.maxUnits` | **判"未接线"，但★没核** | 运行时命中 `kernel/course.js`（同上） |

**汇总**：**3 行「未判定」（遍历点已定位）**／**3 行「确实无消费者」**（`protocolPath`／`math.network`／`math.proof` —— 同时是"判据仍可红"的实证）／**7 行"判未接线但没核"**。
★ **"没核"的准确含义**（不许读者误读成"猜它没消费者"）：**我的判别器要求"同文件、对同一数组"的遍历点；这 7 行的清单被导出／在别处遍历的可能性我没有排除** ⇒ 判准它需要**跨文件/跨表达式的遍历定位器（导入图）**，**本轮未做** ⇒ 具名下一轮。

## 9. ④ 与真机发现同族的一条（Lead 转述；我不跨写）

★ **宿主把大回执 spill 到文件、转录里留省略版**（三臂均 49,930 字符＋`\n\n[...]\n\n`，完整回执在 spill 文件里）⇒ **"我看见的那份不是全量"**。★ 这与本轮 §11 的「未接线／未判定」、与 §6 的「同形投影」是**同一条纪律的三个面**：**看不见 ≠ 没有；看见的切片 ≠ 全体**。★ 若入 docs/纪律，**归 docs 属主**。

## 10. 收口需要的动作

1. **Lead 跑 `--write`**（第三档落进 `docs/04 §11`）⇒ 之后 `audit-vmu-docs` 与 `regen-all --check` 应绿；
2. **下一轮（我）**：跨文件遍历定位器 ⇒ 把那 **7 行"没核"** 判实（或降为「未判定＋理由」）；
3. 反例脚本本轮改用 `--json` ⇒ 不再有 stdout/stderr 混淆。

---

## 11. ★ R33 收尾 · 门自己的两值假设（`tests/audit-vmu-docs.test.mjs`）

**现场**：Lead 跑 `--write` 后第三档落盘、生成器 `--check` **up to date**，但 `audit-vmu-docs` **98/1** 红在 `FAIL every settings row states whether the key is WIRED (no silent promises) [selfCheck, feedback, pointer.propagation]` ⇒ ★ **表是对的，红的是审计那条判据只认两值**。裁定照做：**把第三档纳入判据**（不是去掉第三档、也不是放宽成"有任意文字就算过"）。

**改了两处（都按同一意图，不是放宽）**
1. **`:544`（失败那条）**：`TIER_MARKER = { wired:/✅ 已接线/, undetermined:/❓ 未判定/, unwired:/⚠️ 未接线/ }` ⇒ 每行必须**明确落在三档之一**（**空白/含糊仍红**，"no silent promises"原意保留）；★ 并加**非空前置**：三档**都必须真的有行**（否则上一行会被"整档消失的表"空过）。
2. ★ **`:564-573`（我顺手核出的第二处，且它是真洞）**：原式 `trulyUnwired = filter(d => !hasConsumer(d.key))` ＋ `lyingUnwired = claimedUnwired − trulyUnwired` ⇒ **第三档出现后它是错的**：那 3 个 `未判定` 键**没有字面量读者** ⇒ 落在 `trulyUnwired` 里 ⇒ **某行把 `未判定` 键断言成 `⚠️ 未接线`，这条审计会放行** —— 恰好放行了第三档存在的目的所要拦的那句断言。**修法**：`truth` 三值化、**真值直接取生成器自己的 `verdictOf`**（"one rule, one place"，该审计自己的注释就这么写），加 `lyingWired`／`lyingUnwired`（**含"判据无法决定却断言没消费者"**）／`lyingUndetermined`（**第三档是结论，不是逃生门**）＋三档 **partition**（`wired+undetermined+unwired === 1226`）。★ 为让审计不自带第二份词表，把 `WIRED`／`NOT_WIRED`／`UNDETERMINED` 在生成器里**导出**。

**修后读数**：`audit-vmu-docs` **103 passed / 0 failed，exit=0**（生成器 `--check` 仍 **up to date**）。

**③ 顺手核（范围＋残差口径）**：按"**是否隐含两值**"扫该脚本的关键词面（`未接线|已接线|WIRED|silent promises` ＋计数类 `1226|1106|1108|118|wired +|trulyUnwired|claimedWired`）⇒ **命中 2 处，均已修**；**另有 0 处**。★ **我未逐行通读 721 行** ⇒ **通读面写"没核"**（不冒充"全查过"）。

**★ 当天反例（副本制）—— 有效但不完整，必须具名**：`D:\_tmp\v34\counter-audit.mjs`（拷 `tests/`＋`scripts/`＋`vibe-math-vmu/`＋`package.json` 到 `_tmp\v34\copy2`，**只变异副本的 `docs/04`**）⇒
```
REAL   : exit=0  === VMU DOCS AUDIT: 103 passed, 0 failed ===
M1 (清空 selfCheck 行的档位)        : exit=1 (red ✓)
M2 (把某个 未判定 行改写成 ⚠️ 未接线): exit=1 (red ✓)
REAL TREE UNTOUCHED: OK (read-only ✓)
```
★ **但这两条红【没有被证明落在我那两条断言上】**：审计**先跑生成器的 `--check`**，改 `docs` 必然 STALE ⇒ **exit=1 可能来自 STALE 而非我的断言**（该路径下摘要为空）⇒ ★ **按 R27 教训，这是"半个证据"**：**"门红了"成立，"红在被测那一行"未成立**。**下一轮修法（具名）**：反例**同时**改副本里的生成器判据（让表与判据一致、`--check` 不 STALE），或**把两条断言单独跑**，才能证明红在断言上。

---

## 12. ★★ 生成器性能回归修复（T1 里 `vmu-wiring-index` TIMEOUT 的根因）

**量法（同一台机、同一次会话；`[Diagnostics.Stopwatch]` 包住整条命令）**
| 命令 | 修前 | 修后 | 目标 |
|---|---|---|---|
| `node scripts/generate-vmu-settings-table.mjs --check` | **14.04s** | **5.12–5.53s** | ~3–5s（达到） |
| `node scripts/generate-wiring-index.mjs --check` | **19.44s** | **6.37s** | ~6–8s ✓ |
| `tests/vmu-wiring-index.test.mjs`（整套） | Lead 量 **236.8s**（`c7950ce` 74.9s） | **未由我重跑（T1 归 Lead）** | ★ **我不给整套数字**（不冒充） |

**根因（我实测确认）**：`listIterationEvidence(key)` 第一版在**每个键**里做 `f.text.split('\n')`（180 文件 × 1226 键）＋ 每个候选 `new RegExp` ⇒ 近似 **O(键 × 行)**；而 `generate-wiring-index.mjs:124` **把 settings-table 当作自己的 check 去跑** ⇒ 单次变慢被 spawn **放大两次** ⇒ 整套超 180s 预算。
**修法**：**索引只建一次**——模块加载时单遍扫描：每个 `const NAME = [` 判定一次"NAME 是否被遍历"，再把该列表持有的键元素登记进 `LIST_INDEX`；`LINES_OF` 记忆化行表；`listIterationEvidence` 变成 **O(1) 查表**。**未改** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`（harness 规矩：**修负载，不抬预算**）。

**★ 但语义【不是逐字不变】—— 一处分歧，且判据是变得更准；请你裁**
- 修后计数＝ **`1108 wired / 4 undetermined / 114`**（你要的是 **3/115**）。
- **第 4 个键＝`vmu.paper.retentionMs`**（★ 点名方式：**拷树到 `_tmp\v34\copy3` 后 `--write`**，读副本 §11 带 `❓` 的四行；**真树 `docs/04` hash 前后不变** `C839E1DA7F337D79`）—— ★ 它正是我 R33 §8 里标"**判未接线但没核**"的那一行。
- **原因**：旧算法把"数组元素"与**上方 40 行内最近的一个 `const NAME = [`**配对 ⇒ **长列表深处的元素配不上自己的列表** ⇒ 漏了它；单遍索引按**包围关系**配对，能看见。★ **我验过"把 40 行窗加回去"这个假设：计数仍是 4/114** ⇒ 差别在**配对方式**而非窗口 ⇒ 那条窗口补丁**已撤销**（留一条不恢复计数的任意规则＝纯噪声）。
- ⇒ **请你裁**：**(a)** 接受 **4/114**（判据更准；需你 `--write`）；或 **(b)** 下一轮我**逐字复刻旧配对**（语义逐字一致，但保留一条已知会漏的规则）。
- **`audit-vmu-docs` 现状**：**exit=1 唯一原因是"表陈旧"**（它内含的 settings-table `--check` 子检查）；**修前（表不陈旧时）它是 103/0**。⇒ 走 (a)＋`--write` 后应回 103/0 —— ★ **这条我未复验（没核）**，请你复跑确认。
- **当天反例**：本次只改**实现**、未改三档判据的**意图**；我**未重跑** §11 的两条 docs 侧反例（**没跑**，如实记）。

**结论**：性能达成（两处回目标区间、放大源被切断）；**语义有一处分歧（+1 个 `未判定`，根因与点名证据如上），等 Lead 裁 (a)/(b)。**
