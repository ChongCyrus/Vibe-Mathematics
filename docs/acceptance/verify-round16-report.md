# Round 16 · vmu-verify2（`task-116`）交付报告

> 纪律：**未跑全量（T0/T1 归 Lead）／未 `regen-all`／未做任何 git 写操作**；临时文件只在 `D:\_tmp\v16`；**未改 `docs/**`**（本轮只动 `tests/**`）；**别改他人测试**已遵守（唯一一次跨出 Lead 点名的三个文件，见 §6，且 `tests/**` 在 `task-116` 写范围内）。
> **读的是哪一次运行**：工作树 `D:\wd\vibemath开发\Vibe-Mathematics`，`git rev-parse HEAD` = `4e5be5a`（R13）＋ R14/R15/R16 的未提交改动。
> 日期：2026-10-15

## 0. 结论速览（命令＋退出码见 §4）

| # | 项 | 状态 | 读数 |
|---|---|---|---|
| ① | **条件式逃生口收口** | ✅ **实为 4 处，不是 3 处** | Lead 点名的 3 处已改；**全仓关键词搜出第 4 处**（`tests/vmu-course.test.mjs:247`，同一形状）⇒ 同法收口。**RULE E `current=67 baseline=67` 未变**（不改基线）；四个套件 **6/7/13/18 passed, 0 failed** |
| ② | **残留复核（第八条口径）** | ✅ | 扫描范围＝**仓根下全部 612 个 `.mjs`/`.js`**（`tests/` 383、`scripts/` 35）；按语义关键词（`fired`／`enforced`／`⊆`）全量列出并**逐条读**；结论＝**同类「条件式 `Array.isArray(r.fired)` 包住断言」共 4 处、已全部收口**；另有 4 处**反向累加器**（安全，不碰）与 2 处**兄弟条件式断言**（他人文件，具名不动） |
| ③ | **`reviewRound` 只报告不判红** | ✅ | `GATE_ROUND` 15→16；输出改为 `exemptions: 6 named; review due at round 16: 0 (REPORT-ONLY by Lead ruling …)`；新增**自探针 6b** 把裁决钉住：due ⇒ **计数**且 `missing/gone/redundant` 全空（**永不红**）⇒ 门 **29 passed / 0 failed** |

## 1. ① 条件式逃生口：**先量"它是否真的会跑"，再改**

**先测（关键，不是猜）**：三处守卫的**真实可达性**（Node 读内核源码，`fired`/`enforced` 出现次数）：

| 文件 | `fired` | `enforced` | 守卫的真实状态 |
|---|---|---|---|
| `kernel/bidding.js` | **0** | **0** | 外层 `if (r && Array.isArray(r.enforced))` **永不成立** ⇒ 内层断言**是死代码** |
| `kernel/board.js` | **0** | **0** | 同上（实测 `带 enforced 的回执=0`） |
| `kernel/ballotbox.js` | **0** | 62 | 外层会跑（`receipts.length === 4` 已有非空前置），内层 `if (Array.isArray(r.fired))` **永不成立** ⇒ 两条断言是死代码 |
| `kernel/course.js` | **0** | — | 同 ballotbox（第 4 处） |

⇒ **比任务描述更严重**：不只是"分支可能不执行"，而是**这四处断言从未执行过**（"穿着检查外衣的死代码"）。

**改法（四处同一形状）**：① 断言**不再被 `if` 包住**——`fired` 规范化后无条件遍历（空表＝无可检查者，**不是**被跳过）；② `fired` 的**形状本身**成为一条无条件断言（非数组 ⇒ 红，不能悄悄被规范化成"没东西可查"）；③ 死分支**被断言为事实**（`assert.equal(enforcedReceipts, 0, '…复活条件：kernel/x.js 一旦产出 enforced[]，删掉这条并让真分支接管')`）＋ `probed > 0` 非空前置；④ **自探针**（第九条："不能加反向开关就配自探针"）：合成回执 `{enforced:['a'], fired:['b']}` **必须被抓到**、合规回执**必须安静**、非数组 `fired` **形状判据必须判红**。
★ 每个 `for…of` 旁都有 `EMPTY_ALLOWED` 注释（RULE E 的正式豁免词）说明"空表是有意的，牙在自探针上"。

**逐文件**：
| 文件 | 改动 | 新断言 |
|---|---|---|
| `tests/vmu-bidding-audit.test.mjs`（:76-92 段） | 去掉 `if (Array.isArray(r.fired))`；加 `probed`、形状断言、`assert.equal(enforcedReceipts, 0, …)`；日志改口径 | 非空前置＋2 条自探针＋1 条形状自探针＋1 条死分支事实断言 |
| `tests/vmu-board-audit.test.mjs`（:92-109 段） | 同上；**并补 `CAP` 缺失断言**——该文件顶部 `CAP` 是**死常量**，而它的日志写"已由上一断言如实记录 ✓"**而那条断言根本不存在** ⇒ 现在这句话为真 | 同上＋CAP 源文本缺失断言 |
| `tests/vmu-ballotbox.test.mjs`（:229-236 段） | 去掉守卫；`fired` 规范化＋形状断言；2 条自探针＋形状自探针 | — |
| `tests/vmu-course.test.mjs`（:244-251 段，**第 4 处**） | 与 ballotbox 完全同形，同法收口 | 同 ballotbox |

## 2. ② 残留复核（第八条：先说范围，再把"没找到"与"不存在"分开）

**搜索范围（原样）**：脚本 `D:\_tmp\v16\residual-check.mjs` ⇒ 仓根（`D:\wd\vibemath开发\Vibe-Mathematics`）下**全部 `.mjs`/`.js`，`node_modules`/`.git` 排除，共 612 个文件**（`tests/` 383、`scripts/` 35）；按**语义关键词**（不是文件名前缀）匹配 `fired`／`enforced`／`⊆`／条件式断言形状，**逐条打印并人工读**（脚本同时打印原始行，不是只给计数）。

**结论（三类，分开说）**：

| 类 | 数量 | 判定 |
|---|---|---|
| **(a) 同类：`if (Array.isArray(r.fired)) { …断言… }`** | **4** | bidding／board／ballotbox（Lead 点名）＋ **course（新发现）** ⇒ **全部已收口**（§1） |
| **(b) 反向累加器：`if (!Array.isArray(r.fired)) bad.push(…)` ＋ `if (!r.fired.every(…) ) bad.push(…)`**，随后**无条件** `ok(bad.length === 0, …)` | 4（`vmu-capacity:231/234/236`、`vmu-conference:276/278/280`、`vmu-funding:296/299/302`、`vmu-migration:286/289/291`） | **不是逃生口**：`fired` 缺失会被**推入 bad ⇒ 红**；断言**无条件**执行。这正是 `vmu-conference:280` 那个"正例"的形状 ⇒ **不碰** |
| **(c) 兄弟条件式断言：`if (must.length > 0) ok(must.every(…) )`** | 2（`vmu-records.test.mjs:475`、`vmu-workflow.test.mjs:451`） | **同属第九条形态**（`must` 为空时该断言不执行），但语义上 `must` 是**调用方给的期望清单**（`check(…, must = [])`），空＝"本场景无特定期望"；**不是** `fired ⊆ enforced` 那类"回执契约"。**他人文件，具名不动**（改法：`ok(must.length === 0 \|\| must.every(…))` 或补一条"本场景确实有必须点名的键"的非空前置——后者会改变测试**声称**的东西，应由属主决定） |
| **(d) 同一行条件式断言（RULE E shape C，零容忍）** | 6 命中 | 4 条在**探针自己的定义/夹具**里（`audit-declaration-criterion` 的注释与自测），2 条是**普通控制流**（`audit-persona-surface:253` 在分支里 `ok(false,…)`＋`continue`＝**取到分支即红**，非空过；`v5-tool-help:26` 是校验器的 `else if` 分支） ⇒ **无新增缺陷** |
| **(e) 多行条件式断言（RULE E 只看同一行 ⇒ 盲区）** | 21 命中 | **作为清单报告、不作为缺陷断言**：多数是普通控制流（`if (existsSync(…))`／`if (EXPECT_DELIVERY)`／变异体字符串）。其中**与本主题相关**的即上表 (a)(c)。★ 这条盲区本身值得进矩阵：**RULE E 的 shape C 判据只认单行形式**，所以"条件式断言"的**多行写法**在结构上一直不被它看见 |

⇒ **"同类未收口＝0"是实测结论**（范围 612 文件、逐条读过）；**"不存在其它形态的条件式断言"我没有断言** —— (c)/(e) 明确列出并交回属主/Lead。

## 3. ③ `reviewRound`：**只报告、不判红**（把裁决写进代码＋自探针）

- `tests/_lib/package-exemptions.mjs`：`GATE_ROUND` **15 → 16**，注释写明"只用于到期**计数**，永不用于红"＋**裁决理由**（把记账日期变成门禁失败会推着人**只改日期**——正是白名单漂移的同型）。
- `tests/audit-package-membership.mjs`：输出改为
  `exemptions: 6 named; review due at round 16: 0 (REPORT-ONLY by Lead ruling, round 16: a due entry is never a red - self-probe 6b proves it)`
- **新增自探针 6b**（把"裁决"本身钉住，而不是只写在注释里）：合成一条**已到期**的豁免 ⇒ `due.length === 1` **且** `missing/gone/redundant` **全为 0** ⇒ **到期不产生任何红**。★ 没有它，日后有人"为了整齐"把 `due` 改成红，**没有任何门会察觉裁决被反转**。

## 4. 全部读数（原样命令 ＋ 退出码）

| 命令 | 读数 | exit |
|---|---|---|
| `node D:\_tmp\v16\residual-check.mjs` | 612 文件（tests 383／scripts 35）；(a) 4／(b) 4／(c) 2／(d) 6／(e) 21 | 0 |
| `node tests/vmu-bidding-audit.test.mjs` | `=== VMU BIDDING AUDIT: 6 passed, 0 failed ===` | 0 |
| `node tests/vmu-board-audit.test.mjs` | `=== VMU BOARD AUDIT: 7 passed, 0 failed ===` | 0 |
| `node tests/vmu-ballotbox.test.mjs` | `=== VMU BALLOTBOX: 13 passed, 0 failed ===` | 0 |
| `node tests/vmu-course.test.mjs` | `=== VMU COURSE: 18 passed, 0 failed ===` | 0 |
| `node tests/audit-declaration-criterion.test.mjs` | `RULE E fingerprints: current=67 baseline=67`；`=== DECLARATION CRITERION: 79 passed, 0 failed ===` | 0 |
| `node tests/audit-package-membership.mjs` | `=== PACKAGE MEMBERSHIP: 29 passed, 0 failed ===`（含新的 6b） | 0 |
| `node tests/vmu-conference.test.mjs` | `=== VMU CONFERENCE: 72 passed, 0 failed ===`（**正例**未被误伤） | 0 |
| `node scripts/regen-all.mjs --check` | `=== vmu regen-all: 15/15 in sync ===` | 0 |

## 5. 未做（具名）

1. **(c) 两处兄弟条件式断言**（`vmu-records.test.mjs:475`、`vmu-workflow.test.mjs:451`）：**他人文件**，本轮**只具名不改**；两种改法各有语义后果（见 §2 表），请属主/Lead 裁。
2. **RULE E 的 shape-C 多行盲区**（§2 (e)）：建议**下一轮**给 `auditVacuousAssertions` 补"多行 `if (…) { …ok(…) }`"的判据**＋相反自探针**（否则新判据会把几十处普通控制流一次打红，需要先分类）——本轮**未动检测器**（它是 activity2 的文件，且改判据要连 RULE E 基线一起处理）。
3. `docs/11 §4.2` 的实例台账**未新增条目**：activity2 已建 `I1–I8` 前言台账，本轮第 4 处与③的裁决更适合由 Lead 决定是否入册（避免同一事实两份拷贝）。

## 6. ★ 归属说明（唯一一次超出 Lead 点名范围，请复核）

Lead 点名 3 个文件；**第 4 处** `tests/vmu-course.test.mjs:244-251` 是我在②的全仓搜索中发现的、**与 ballotbox 逐字同形**的死分支。我**选择了收口它**，理由：① `tests/**` 在 `task-116` 写范围内；② 不修就没有资格在报告里写"同类已清零"（那正是本仓反复打的"陈旧/不完整声明"）；③ 改动是同一机械形状、附自探针，并由 `vmu-course` **18/0** 与 **RULE E 67=67** 证明零副作用。**若 Lead 认为越界，回退方式＝把该段恢复为 `if (Array.isArray(r.fired)) { … }` 三段式即可**（我不认为应当回退，但它不是我的文件名义属主，故显式交裁）。

## 7. Lead 裁决（本轮收尾后收到，作为 Round 17 的输入）

| # | 事项 | 裁决 |
|---|---|---|
| 1 | 第 4 处（`tests/vmu-course.test.mjs`）收口是否越界 | **批准，不回退**。理由接受"`tests/**` 在写范围内＋同形＋自探针＋**不收口就没资格写'同类已清零'**"；并指出"**显式交裁而不是默默扩大范围**"是正确做法 |
| 2 | (c) 两处兄弟条件式断言（`vmu-records.test.mjs:475`／`vmu-workflow.test.mjs:451`） | **保持现状，不改**（`must` 是调用方给的期望清单，空＝本场景无特定期望，与"回执契约"不同；两种改法都有语义后果）⇒ **记入矩阵具名项**（不是欠债，是已裁定的现状） |
| 3 | (e) **RULE E shape C 只认单行**（多行 `if (…) {` ＋ 下一行 `ok(…)` 的盲区；本轮 4 处正是靠它活下来） | **Round 17 首项**；按本报告的提醒 **先分类再打红**（判据＋相反自探针：单行/多行两形态都要能被看见，合规的多行必须安静） |
| 4 | ③ `reviewRound` 只报告＋自探针 6b | 接受；评语："**这正是第九条用在门禁自己身上**" |
| 5 | 本轮定位 | "**穿着检查外衣的死代码**"＝第九条的**最纯形态**（不是"某次跳过"，而是**永远跳过**）；`board` 那句日志假声明＝**声明与实现不一致**（本仓反复抓的一类，这次藏在**日志**里） |

⇒ **本轮到此为止**（Lead 原话）。上述 3 与 5 是 Round 17 的输入；本报告 §5「未做」中与之重复的两条以此表为准。

