# vmu Round 15 · `task-114` 报告 — 取得↔释放门收尾 ＋ §4.2 第九条实例汇编

- 负责人：`vmu-activity2`（证伪 / 门禁守护人）
- 仓库：`D:\wd\vibemath开发\Vibe-Mathematics`，分支 `main`，**HEAD = `e40207b`**（"round 14 … the acquire-release gate un-falsified itself" ⇒ R14 已被 Lead 提交）
- 报告时间：**2026-10-15 09:4x +08:00**（**§6.3 为收尾复核后的追加，含一处归属更正**）
- git 纪律：**未 commit / 未 push / 未做任何 git 写操作**；只用 `git log/show/diff/grep` 读。
- 结论一句话：**① 两条收尾都做完了（注释漂移更正并把"数目"变成打印读数＋断言；矩阵选"具名边界"并写清谁守着守护者）；② 第九条实例台账 8 条（`I1–I8`）已写进 `docs/11 §4.2`，每条带观测运行；③ 期间我自己踩了一个同族的坑（运行标签被 claim-id 正则读成引用），当场测出并修好；④ 收尾时全部闭合（`regen-all --check` 15/15、`audit-vmu-docs` 95/0、`audit-declaration-criterion` 79/0），其中一处机制我原先归错，已按 `vmu-verify2` 的实测更正（§6.3）。**

---

## 0. 结论摘要

| # | 事项 | 结果 | 关键读数（哪一次运行） |
|---|---|---|---|
| 1 | ①‑A RULE A 注释漂移 | ✅ 更正；并把"数目"升级为**打印读数＋断言** | `--selftest` 14→**16 passed, 0 failed** EXIT=0（E1）；`RULE A coverage … reallyRan:true, exit:0, mentionedOnly:false`（E1） |
| 2 | ①‑B 门禁脚本是否入矩阵 | ✅ **选"具名边界"**（不加行），理由＋"谁守着守护者"三道＋推翻判据，落在 `docs/11 §4.2` | `--check` ⇒ `96 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED` EXIT=0（C7）；`audit-package-membership` ⇒ **28 passed, 0 failed** EXIT=0（E5） |
| 3 | ② 第九条实例台账 | ✅ `I1–I8` 写进 `docs/11 §4.2`（每条：形态／变红条件／**观测运行**） | 见 §4 表 |
| 4 | ★ 我自己的现场事故 | ✅ 自测出＋已修：运行标签被 claim-id 正则读成引用 | 修前 `4 passed, 1 failed`，`{"unresolved":["11:C9"]}`；修后 **`5 passed, 0 failed`** EXIT=0（E2） |
| 5 | 副作用核查 | ✅ `docs/11` 改动**没弄红**任何我该负责的门；RULE E 指纹 **67=67 未动** | E1／E2／E3／E4 |
| 6 | 现状红点 | ✅ **全部闭合**（收尾复核，见 §6.3）：`regen-all --check` **15/15 in sync EXIT=0**；`audit-vmu-docs` **95/0 EXIT=0**；`audit-declaration-criterion` **79 passed, 0 failed EXIT=0**。窗口内那两条红**都不是我**：一条是 §4.2 里**又一次 ⑧ 式裸写**（发现者＝`vmu-verify2` 自查、标注 `(11-gates-and-development)`），一条是 `settings/planned.js` 少 3 键后生成区未再生成（同一 owner 跑了表生成器） | C4（我编辑前 `95/0`）→ D1／D-now（红 → 绿）；**§6.2 的机制已被 `vmu-verify2` 更正，§6.3 为准** |

---

## 1. 运行台账（★ 引用前先落一行核验：每个读数都写明读的是哪一次运行）

| 运行 | 原样命令 | 退出码 | 关键读数 |
|---|---|---|---|
| **C1** | `node tests/vmu-assistant-host-slice.test.mjs` | **0** | `6 passed, 0 failed, 5 not-run` |
| **C2** | `node tests/vmu-assistant-host-slice.test.mjs --require-host` | **1** | `6 passed, 1 failed, 5 not-run (--require-host)` ⇒ not-run 有相反开关 |
| **C3** | `node scripts/audit-projection-census.mjs` | **0** | `PROJECTION CENSUS: 10 passed, 0 failed`；`declared=10 attached=7 viaAlias=0 notAttached=3`；种植面被具名归档 |
| **C4** | `node tests/audit-vmu-docs.test.mjs`（**我编辑 docs/11 之前**） | **0** | `VMU DOCS AUDIT: 95 passed, 0 failed`（G2 台账显形 3） |
| **C5** | `node tests/audit-enforced-consistency.test.mjs` | **0** | `358 passed, 0 failed`；5 条造错自证具名红 |
| **C6** | `node scripts/generate-zero-mechanism-matrix.mjs --selftest` | **0** | `ZERO-MECHANISM SELFTEST: GREEN (0 failed)`；`selftest ②/⑤` 证明"未登记 ⇒ 红并点名" |
| **C7** | `node scripts/generate-zero-mechanism-matrix.mjs --check` | **0** | `96 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED, 9 probe-errors, 4 n/a` |
| **C8** | `node tests/vmu-conference.test.mjs` | **0** | `72 passed, 0 failed`（含 `:246`／`:280` 的**无条件** `fired ⊆ enforced`） |
| **C9** | `node scripts/audit-acquire-release.mjs` / `… --selftest` / `… --selftest --require-tree` | **0 / 0 / 0** | 见 §2 |
| **D1–D11** | doc 侧 11 门逐条（见 §6.1 表） | 混合 | 只有 `audit-vmu-docs`／`regen-all --check` 红（非我） |
| **E1** | `node tests/audit-declaration-criterion.test.mjs` | **1** | `78 passed, 1 failed`（唯一红＝`regen-all --check`）；`RULE E fingerprints current=67 baseline=67`；`RULE A coverage … audit-acquire-release.mjs … reallyRan:true, exit:0, mentionedOnly:false`；`EXECUTED: … --selftest ⇒ exit=0 \| 16 passed, 0 failed` |
| **E2** | `node tests/audit-claim-traceability.test.mjs` | **0** | 修标签前 `4 passed, 1 failed`（`{"unresolved":["11:C9"]}`）⇒ 修后 `5 passed, 0 failed` |
| **E3** | `node tests/audit-cross-volume-refs.mjs` | **0** | `1060 reference(s) checked, 0 unresolved` |
| **E4** | `node scripts/check-docs.mjs` | **0** | `DOC LINT: PASS` |
| **E5** | `node tests/audit-package-membership.mjs` ＋ `require('./package.json').files.includes('scripts/audit-acquire-release.mjs')` | **0** | `28 passed, 0 failed`；`true`（共 680 条） |
| **E6** | `node tests/vmu-finally-falsify.test.mjs` | **0** | `26 passed, 0 failed` |

---

## 2. ①‑A 注释漂移：更正，并把"数目"变成**打印读数＋断言**

**原文（HEAD `e40207b` 里仍是如此）**：`tests/audit-declaration-criterion.test.mjs:592-597` 写 "**five** directions of the CLOSED ruling vocabulary"、ok-label 写 "five refused directions"。
**实测（`--selftest`）**：词表 **5 词**；§0b **7 拒 / 4 受**；§0c **5 拒 / 2 受**；§0d **9 组种植** + 诚实夹具五表全空。
⇒ 注释声明的检查数与实现不符（本仓对"声明↔实现不一致"已有专门门禁，故这行注释本身就是该缺陷类）。

**修法（两半，缺一不可）**：
1. **注释按实测重写**（逐条列出 §0／§0b／§0c／§0d／§1 各驱动什么，并注明 "counts corrected in ROUND 15 / task-114"）；
2. ★ **让数目自己会红**：在门里新增三条"声明数＝实测数"断言（`scripts/audit-acquire-release.mjs`），并把数目做成 `reading`：

```
reading §0b refused/accepted directions: {"words":5,"refused":7,"accepted":4}
reading §0c refused/accepted directions: {"refused":5,"accepted":2}
reading §0d counts                     : {"planted":9,"honestListsEmpty":true,"judged":1,"lists":["unregistered","rulingProblems","fileLevel","callLevel","tripwire"]}
ok ★ the DECLARED counts ARE the measured ones: 5 words in the closed vocabulary, 7 refused directions, 4 accepted …
ok ★ the DECLARED counts ARE the measured ones: the authority word refuses 5 directions … and accepts 2 …
ok ★ the DECLARED count IS the measured one: 9 planted violations each REDDEN THE LIST THEY NAME …
```

⇒ 三处注释若再漂移（例如有人加了一个探针却没改注释数），**门自己会红**。这就是把"注释声明与实现一致"从纪律变成**有牙的判据**。

**读数（C9，当前树）**：`node scripts/audit-acquire-release.mjs` ⇒ **25 passed, 0 failed** EXIT=0（改前 23）；`--selftest` ⇒ **16 passed, 0 failed** EXIT=0（改前 14）；`--selftest --require-tree` ⇒ 25/0 EXIT=0。
**RULE A 覆盖面**（E1）：`--selftest` 现在跑 **16** 条，且 RULE A 打印 `EXECUTED: node scripts/audit-acquire-release.mjs --selftest ⇒ exit=0 | === ACQUIRE↔RELEASE: 16 passed, 0 failed ===`。
**RULE E**（E1）：`scanned files=368, hits=67`，`fingerprints current=67 baseline=67` ⇒ **未推高基线**（任务硬约束）。

---

## 3. ①‑B 矩阵视野裁定：**选"具名边界"，不加行**

**事实（三条，都可复算）**：
1. 矩阵的行**只**来自内核模块：`scripts/generate-zero-mechanism-matrix.mjs:310` `readdirSync(KERNEL).filter((f) => f.endsWith('.js'))`，`KERNEL = vibe-math-vmu/kernel` ⇒ `scripts/audit-*.mjs`／`tests/*.test.mjs` 在矩阵里**没有裁定行**（C7：`96 modules` 全是内核模块）。
2. 我本轮**没有加、也没有改任何内核模块**（`git diff --name-only` 里我的两处＝`scripts/audit-acquire-release.mjs`、`tests/vmu-finally-falsify.test.mjs`）⇒ 矩阵**不欠行**。
3. 矩阵的规则是"**模块出现了却没有裁定行 ⇒ 必红**"（`:288`），并由 `--selftest` 自证（C6：`selftest ②`／`⑤`）。

**为什么选"具名边界"而不是"加一类"**：加它必须给生成器引入**非内核注册表**，而"门禁脚本的零机制行为"**不是一个可探的行动面** —— 脚本没有 `create*` 工厂、没有 `status()`，它唯一的可观测行为就是**退出码**，而那正是 RULE A 已经在读的东西。硬加一行只会造出一个**测不出东西的行**（本仓纪律：**不许为了让矩阵好看而造行**）。⇒ 我把边界**具名**并写清"谁守着守护者"，而不是留一个"看不出来是缺口还是视野外"的空档。

**谁守着守护者（三道，任一可复算）**：
- ① **RULE A**（`tests/audit-declaration-criterion.test.mjs`）：每个自证模式必须被**真跑**；`reallyRan` 与 `mentionedOnly` 两个字段把"提到"与"跑过"分开（R12 就抓过一次"只被提到没被跑过"）。E1 读数：7 个自证模式全部 `reallyRan:true`。
- ② **`package.json#files` ＋ `tests/audit-package-membership.mjs`**：新脚本漏登记 ⇒ 红。E5 读数：`28 passed, 0 failed` EXIT=0；`files.includes('scripts/audit-acquire-release.mjs') === true`（共 680 条）。
- ③ **每门自己的 `--selftest`**：取得↔释放门的 `§0d` 用**同一个** `judgeTree()` 种 9 组违规 ⇒ 门自证会红（C9 读数见 §2）。

**落点**：`docs/11 §4.2`，紧接第九条之后，标题为 `⇒ ★ R15 具名裁定（task-114）`。
**推翻判据（也写进文档）**：将来若某脚本长出**真正可探的行动面**（有 `create*`／`status()` 形状），且矩阵的**闭集**期望词表里能写出它的零机制形状 —— 那时才应加行；否则仍留在边界外。

---

## 4. ② `docs/11 §4.2` 第九条实例台账（`I1`–`I8`）

**落点**：`docs/11`，紧接第九条硬要求段落之后（`<` 生成区 `zero-mechanism-matrix` 位于 L717–820，相距甚远；本次改动 hunk＝`@@ -139,0 +140,12 @@`）。

| 编号 | 形态 | 变红条件（反向开关／自探针） | 观测运行（原样读数） |
|---|---|---|---|
| `第九条·I1` | 矩阵 `judge()` **判序跳过**（跳过排在判红之前 ⇒ 两个计数器都不进） | "未登记 ⇒ 红"排在"探针抛出就 `continue`"之前并**点名** | **C6**：`selftest ② audit 未登记 ⇒ unregistered=1 mismatches=1（期望 unregistered 恰 +1；且必须红）`、`selftest ⑤ 未登记模块 fixture ⇒ mismatches=2（点名 fixture=true）`，EXIT=0（R12 修序后当场抓出第三个 `resumeflush`） |
| `第九条·I2` | `EXPECT_NA`／`EXPECT_UNDECIDED` **记账型跳过** | "漏了"必红、"未定"只计数，互不吞并；**期望词表闭集** | **C7**：`96 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED, 9 probe-errors, 4 n/a`；**C6**：`selftest ③ ⇒ undecided=1 mismatches=0`、`selftest ① 期望写错 ⇒ mismatches=1` |
| `第九条·I3` | `--require-host` 把 **not-run** 变红 | 未跑的直接红＋退出码非 0 | **C1**：`6 passed, 0 failed, 5 not-run` **EXIT=0**；**C2**：`6 passed, 1 failed, 5 not-run (--require-host)` **EXIT=1** |
| `第九条·I4` | 普查门 `notAttached` **整类可能缺席** | **种一个不存在的面** ⇒ 必须被归档并具名 | **C3**：`PROJECTION CENSUS: 10 passed, 0 failed` EXIT=0；`a planted non-existent face is FILED …`／`and it is notAttached BY NAME`；活读数 `declared=10 attached=7 viaAlias=0 notAttached=3` |
| `第九条·I5` | `fired ⊆ enforced` 的**条件式**跳过（`if (Array.isArray(r.fired))`） | 把"真的 fire 了"做成**必填字段**，并以**无条件**形式断言子集 | **C8**：`72 passed, 0 failed` EXIT=0（`:246` 前置 `receipts.length >= 2` 在 `:244`；`:280` 对 14 条触发场景逐条查 `Array.isArray(e.fired)` 与 `fired⊄enforced`）⇒ 今天回执必带 `fired[]`。**残留（具名，未修）**：`tests/vmu-bidding-audit.test.mjs:88`／`tests/vmu-board-audit.test.mjs:105`／`tests/vmu-ballotbox.test.mjs:234` 仍是条件式（今天冗余，但冗余仍是逃生口）。另一侧 **C5**：`358 passed, 0 failed` EXIT=0，5 条造错自证具名红 |
| `第九条·I6` ★ | 取得↔释放门的 `不涉及` **假裁定**（R14，作者是我） | ① **每一行**裁定都校验＋`STALE-ROW`；② `不涉及` 收紧为"无取得位点 **且** 无锁库" ⇒ `FALSE-不涉及`；③ 新增闭集第五词 `自持-取释面`，其**长出定时器／监听器** ⇒ `OWES-FINALLY` | **C9**：`--selftest` `16 passed, 0 failed` EXIT=0，`§0c refused/accepted directions: {"refused":5,"accepted":2}`、`§0d counts: {"planted":9,"honestListsEmpty":true}`；正常跑 `25 passed, 0 failed` EXIT=0。★ **与 I1–I5 不同型**：根因不是"分支没被触发"，而是**词表缺形状**（取得词表刻意跳过"定义"＝这条跳过本身正确且有双向自证，而 `kernel/storepolicy.js` 恰是全内核**唯一**取锁面）⇒ **"跳过本身正确"也能造出假绿** |
| `第九条·I7` | G2 的**台账**与**样本**（R14，vmu-verify2） | ① 台账陈旧（修好一条却不删那行）⇒ 红；② **合成样本**写进被扫的卷 ⇒ `group G` 报未登记 ⇒ 红 | **C4**：`node tests/audit-vmu-docs.test.mjs` ⇒ `95 passed, 0 failed` EXIT=0（G2 台账仍显形 3）。R14 两次现场红：中间版本合成集写错 ⇒ 该门红 **80 秒**（`08:54:13–08:55:35`，该窗口内 T0/T1 读数作废）；`docs/22` 把三个服务名写成裸形 ⇒ G2 静默（真值 3→0）⇒ 改回**调用形**后恢复 |
| `第九条·I8` ★ | 本门自己的 `--selftest` **not-run 分支** ＋ `slice(0,3)` 空过（R14，作者是我） | ① 把 §2/§3/§5 抽成**纯函数**并用**同一个**函数种违规（诚实夹具五表必须全空）；② 给跳过加**相反开关**；③ 正向方向必须 `=== null` | **C9**：`§0d counts: {"planted":9,"honestListsEmpty":true,"lists":["unregistered","rulingProblems","fileLevel","callLevel","tripwire"]}`；`--selftest --require-tree` ⇒ `25 passed, 0 failed` EXIT=0 |

---

## 5. ★ 本轮我自己的现场事故（自测出＋已修）：**写文档这个动作被 claim-id 正则读成引用**

- **做了什么**：第一版台账用 `C1`…`C9` 当运行标签（"（R15 运行 C6）"…）。
- **门怎么抓到**：`tests/audit-claim-traceability.test.mjs:61` 的提取式是 `\b([CDFG]\d{1,2}[a-z]?)\b` ⇒ 我的标签被读成**卷 11 的 claim id** `C6/C7/C8/C9`；其中 `C9` 在代码里不存在 ⇒ 门报 **`{"unresolved":["11:C9"]}`**，`CLAIM TRACEABILITY: 4 passed, 1 failed` **EXIT=1**（运行 E2 的"修前"）。
- **修法**：标签改用 `O1`…`O9` 形状（`O` 不在该正则的字符集里），并在台账前言**具名**写下这件事（含正则原文），使下一次有人想用同类标签时会读到警告。
- **修后读数**（E2）：`CLAIM TRACEABILITY: 5 passed, 0 failed` **EXIT=0**。
- ★ **它是 I7 的同族，且这次踩坑的还是"写结论的那个人"**：判据扫的文本**包含**我用来描述判据的文本。⇒ **纪律（我已写进 `docs/11` 台账前言）**：在**被门扫的卷**里写运行/样本编号时，先查该卷的 id 提取正则；样本与编号尽量落在**不被扫的文本**（测试文件本体）里。

---

## 6. 副作用核查

### 6.1 我动过 `docs/11` 之后，doc 侧逐门读数（运行 D1–D11）

| 门 | 命令 | 退出码 | 读数 |
|---|---|---|---|
| D1 | `node tests/audit-vmu-docs.test.mjs` | **1 → 0** | 第一次 `94 passed, 1 failed`（3 个 `vmu.*` 未登记）；再跑直接以 `vmu settings table: STALE … docs/04 §11 is not what the schema yields` **提前中止**；★ **收尾时同一命令回到 `95 passed, 0 failed` EXIT=0**（我未再动 `docs/11`）⇒ **并发中间态，见 §6.2** |
| D2 | `node tests/audit-cross-volume-refs.mjs` | **0** | `1060 reference(s) checked, 0 unresolved` |
| D3 | `node tests/audit-table-integrity.test.mjs` | **0** | 绿（我的台账用**列表**不用表格，未触碰表格完整性） |
| D4 | `node tests/audit-doc-index.test.mjs` | **0** | 绿 |
| D5 | `node tests/audit-doc-vs-code-tables.test.mjs` | **0** | 绿（它只读 `§2.1`，与 §4.2 无关） |
| D6 | `node scripts/check-docs.mjs` | **0** | `DOC LINT: PASS` |
| D7 | `node tests/audit-claim-traceability.test.mjs` | **1 → 0** | 修前 `11:C9`（**我的**，见 §5）；修后 **EXIT=0** |
| D8 | `node tests/audit-verbatim-claims.test.mjs` | **0** | 绿 |
| D9 | `node tests/audit-artifact-docs.mjs` | **0** | 绿 |
| D10 | `node tests/audit-stale-markers.test.mjs` | **0** | 绿（该门只报告、不失败） |
| D11 | `node scripts/regen-all.mjs --check` | **1** | **非我，见 §6.2**（收尾时仍 `12/15 in sync`，三条红的读取面是 `settings/planned.js`／`docs/03-§8`／`docs/02`，全是并发改动面） |

另外两张"整门"读数：**E1** `audit-declaration-criterion` ⇒ `78 passed, 1 failed`（唯一红＝`regen-all --check`），且 **RULE E 指纹 67=67 未动**、**RULE A 对取得↔释放门 `reallyRan:true`**；**E5** `audit-package-membership` ⇒ `28 passed, 0 failed`。

### 6.2 那两条红**不是本次改动**（归因链，逐条可复算）

1. **我编辑前**（C4）同一命令 `node tests/audit-vmu-docs.test.mjs` ⇒ `95 passed, 0 failed` EXIT=0。
2. **我编辑后**（D1）⇒ `94 passed, 1 failed`，唯一失败是：
   `FAIL every vmu.* key named in the docs exists in settings/schema.js [vmu.dissemination.impact (11-gates-and-development) | vmu.dissemination.mediaRequest (11-gates-and-development) | vmu.meetings.open (11-gates-and-development)]`
   —— 这三个名字**不是**我写的：**我的新增行里 `vmu.*` 命中数 = 0**（`git diff -U0 -- docs/11 | grep '^+' | grep 'vmu\.'` 只命中**另一条 hunk**（`@@ -158,0 +171,7 @@`，同事的"R15 状态更新／⑧"区块）里的一行）。
3. **键数在窗口内被改**：R14 的 `regen-all --check` 印 `1229 keys (1108 wired, 121 declared-but-not-wired)`；本轮印 **`1226 keys (1108 wired, 118 declared-but-not-wired)`** ⇒ **声明的键少了 3 条**，正是那 3 个幽灵键（G2 台账清空所致）。
4. **谁改的**：`git diff --name-only` 显示 `vibe-math-vmu/settings/schema.js` 与 `vibe-math-vmu/kernel/meetings.js` **被并发同事修改**，而 **`vibe-math-vmu/docs/04-settings.md` 未被修改** ⇒ 门报的 `docs/04 §11 is not what the schema yields ... run: node scripts/generate-vmu-settings-table.mjs --write` 完全对得上；`regen-all --check` 的 3 条红同样指向 `settings/planned.js`／`docs/03-§8`／`docs/02`。
5. ⇒ **两条红是"设置表／生成物被并发改动而未再生成"的中间态**，责任面在**改 `settings/schema.js`／`kernel/meetings.js` 的人**（G2 台账清理）＋**轮末的 `regen-all --write`**（Lead 已声明会跑）。**本轮任务明令我不跑 `regen-all`**，故我**只报告、不修**，也不把它算进我的读数。
6. ★★ **收尾时的决定性证据**：我又跑了一次 **完全相同的命令** —— `node tests/audit-vmu-docs.test.mjs` ⇒ **`vmu settings table: up to date (1226 keys (1108 wired, 118 declared-but-not-wired))`** ＋ **`VMU DOCS AUDIT: 95 passed, 0 failed`**，**EXIT=0** —— 而我的 `docs/11` 块**一个字节都没再动**（`git diff` 里我的 hunk 仍是 `@@ -139,0 +140,12 @@`）。也就是说：**同一棵树、同一段我的文本下，该门从红自己回到绿**（此刻 `docs/04-settings.md` 已出现在 `git diff --name-only` 里）⇒ **这条红与我的改动无关**，证据链闭合。
   `node scripts/regen-all.mjs --check` 此刻仍为 `12/15 in sync` **EXIT=1**（其余三条生成物仍在别人的飞行中）—— 同样不是我的面。
7. ⚠ **本节（§6.2）第 1–6 点的"机制"已被 `vmu-verify2` 更正，见 §6.3（以 §6.3 为准）**：那次 `94/1` 点名的三个名字**不是**"清 G2 台账的中间态"，而是他**在 `docs/11 §4.2` 里又一次 ⑧ 式裸写**（把已被 G2 清出 planned 的三个名字裸形写进本卷 ⇒ `group G` 报未登记），**他自己查出来并改成服务限定短写**；`docs/04 §11 STALE` 则确实是"少 3 键＋生成区未再生成"那一件，由他跑 `generate-vmu-settings-table.mjs --write` 收口。**两件都不是我的文本**（我的新增行 `vmu.*` 命中数 = 0，这一点未变）。

---

## 6.3 ★ 收尾复核（与 `vmu-verify2` 交叉核对之后，**本节为准**）

**(a) 归属更正（我错了一半，已记明）**：`vmu-verify2` 指出 §6.2 我把两件事混成了一件事。**更正后**：

| 现象 | **正确机制** | 谁 | 现状 |
|---|---|---|---|
| `audit-vmu-docs` 曾 `94 passed, 1 failed`，点名 `vmu.dissemination.impact`／`mediaRequest`／`meetings.open` 标注 `(11-gates-and-development)` | **不是**"清 G2 台账的中间态"：是他**在 `docs/11 §4.2` 写 R15 状态更新段时把那三个已被 G2 清出 planned 的名字【裸写】进本卷** ⇒ `group G` 报未登记＝**⑧ 的又一次踩坑（他自陈"我两处"）** | `vmu-verify2`（自查并改） | 已改成**服务限定短写** ⇒ **95/0** |
| `vmu settings table: STALE … docs/04 §11 is not what the schema yields (1226 keys (1108 wired, 118 declared-but-not-wired))` | 确是"`settings/planned.js` 少 3 键（1229→1226）后**生成区未再生成**"⇒ `audit-vmu-docs` 在导入期 `--check` **提前中止** | 生成物 owner（`vmu-verify2` 在其写范围内跑了 `generate-vmu-settings-table.mjs --write`） | 已闭合 ⇒ **95/0** |

两件**都不是我的文本**（我的新增行 `vmu.*` 命中数 = 0，这一点未变）⇒ 结论方向不变，**我给的机制错了一处，已按实测更正**。

**(b) 他的复核读数（他原样报的）**：`regen-all --check` **15/15 in sync EXIT=0**；`audit-declaration-criterion` **79 passed / 0 failed**，**RULE E `current=67 baseline=67`**；并确认 ①‑A「把『声明数≠实测数』变成打印读数＋断言」**正是第四条要的形态**（声明自己在门里被量，而不是被信）。

**(c) 我自己的收尾复核（本轮同树实测，全部 EXIT=0）**：

| 命令 | 读数 |
|---|---|
| `node scripts/regen-all.mjs --check` | **`vmu regen-all: 15/15 in sync`** |
| `node tests/audit-vmu-docs.test.mjs` | **`95 passed, 0 failed`** |
| `node tests/audit-claim-traceability.test.mjs` | **`5 passed, 0 failed`** |
| `node tests/audit-cross-volume-refs.mjs` | **`1060 reference(s) checked, 0 unresolved`** |
| `node scripts/check-docs.mjs` | **`DOC LINT: PASS`** |
| `node tests/audit-declaration-criterion.test.mjs` | **`79 passed, 0 failed`** EXIT=0；`RULE E fingerprints current=67 baseline=67`（**未推高**）；`EXECUTED: node scripts/audit-acquire-release.mjs --selftest ⇒ exit=0 \| 16 passed, 0 failed` |

★ 另注：**"哪三项 stale"本身在动**（我 13:xx 看到 `planned.js`／`docs/03-§8`／`docs/02`；他 13:5x 看到的是另外三项）—— 这**同一条观察**反过来支持"并发中间态"的判断：固定缺陷不会换面孔。

**(d) 按他建议做的一处互指（`docs/11`，我的写范围内）**：台账前言那句从"与 `第九条·I7` 同族"改成

> **⑧ 的第二型**（⑧ 第一型＝写进卷里的**发现的名字**污染被扫计数；**第二型＝连"运行编号"都会被反向读成引用**；两型合起来＝**你写下的每一个 token 都可能在门的另一侧有语义**）… **本处只作指针，不在两处各写一份**。

⇒ 他**刻意不把这条事实抄进 §4.2 第二遍**（避免"同一事实两份拷贝"，正是本轮在收的口径），改由我这侧指向 ⑧；改后重跑：`audit-vmu-docs` **95/0**、`audit-claim-traceability` **5/0**、`cross-volume` **1060/0**、`check-docs` **PASS**、`regen-all --check` **15/15** —— 全 EXIT=0。



| 事项 | 为什么没做 | 交给谁 |
|---|---|---|
| 那两条红（`audit-vmu-docs`／`regen-all --check`） | 需要改 `settings/schema.js`／`kernel/meetings.js` 或跑 `regen-all --write`（任务禁止）；且责任面不在我 | 改这些文件的 owner ＋ **Lead 轮末 `regen-all`** |
| `I5` 的三处**条件式** `fired ⊆ enforced`（`vmu-bidding-audit:88`／`vmu-board-audit:105`／`vmu-ballotbox:234`） | **别改他人测试**；且今天冗余（无条件形式已在 `vmu-conference`／`vmu-capacity` 实测通过）⇒ 属"具名待办"不是活缺陷 | 三个套件的 owner（或 Lead 排期） |
| 矩阵"加一类门禁脚本注册表" | 需改生成器＋文档再生成；且我判定**不该加**（无可探行动面），已具名裁定 | 若 Lead 不同意，推翻判据已写在 `docs/11`（§3 末） |
| 全量 / T0 / T1 | 任务明令归 Lead | Lead |

---

## 8. 清理（★ 只认本次显式创建的精确路径；**本次未删除任何文件**）

本次在 `D:\_tmp` 显式创建 **9 个**文件（精确路径，都是**我**的运行日志/证据）：

1. `D:\_tmp\vmu-a2-r15-acqrel-selftest.txt`
2. `D:\_tmp\vmu-a2-r15-acqrel.txt`
3. `D:\_tmp\vmu-a2-r15-compendium.log`
4. `D:\_tmp\vmu-a2-r15-conference.txt`
5. `D:\_tmp\vmu-a2-r15-docsgates.log`
6. `D:\_tmp\vmu-a2-r15-vmudocs2.txt`
7. `D:\_tmp\vmu-a2-r15-declcriterion.txt`
8. `D:\_tmp\vmu-a2-r15-acqrel-final.txt`
9. `D:\_tmp\vmu-a2-r15-acqrel-st-final.txt` ＋ `D:\_tmp\vmu-a2-r15-finally.txt`

- **未执行任何删除**（不存在"用前缀/通配误删他人探针"的风险）；`D:\_tmp` 目录本身不是本次创建。
- **未新建任何 `tests/*.mjs`**（作业集合未变；E1 的 `RULE E scanned files=368` 与上轮的 367 之差来自**并发同事**新增的测试文件，不是我）。

---

## 9. 本次变更文件（3 个）

1. `Vibe-Mathematics/tests/audit-declaration-criterion.test.mjs`
   - RULE A 那段说明按实测重写（§0／§0b／§0c／§0d／§1 逐项，注明 "counts corrected in ROUND 15 / task-114"）；ok-label 同步。
2. `Vibe-Mathematics/scripts/audit-acquire-release.mjs`
   - §0b／§0c／§0d 各新增 **`reading` 数目行** ＋ 三条"**声明数＝实测数**"断言（5 词／7 拒／4 受；5 拒／2 受；9 种植）⇒ 注释再漂移即红。
   - 读数：正常 **25/0** EXIT=0；`--selftest` **16/0** EXIT=0；`--selftest --require-tree` **25/0** EXIT=0。
3. `Vibe-Mathematics/vibe-math-vmu/docs/11-gates-and-development.md`
   - 紧接第九条之后新增：**第九条实例台账 `I1`–`I8`**（前言含"运行标签形状"的现场警告）＋ **矩阵视野具名裁定**（不加行的理由／谁守着守护者三道／推翻判据）。
   - 改动 hunk：`@@ -139,0 +140,12 @@`（+12 行）；**未触碰生成区**（`zero-mechanism-matrix` 在 L717–820）。
   - 副作用读数：D2/D3/D4/D5/D6/D8/D9/D10 全绿；D7 由我修好（§5）。

---

## 10. 一句话给验证者

**两条收尾都落了地**：注释漂移不只改字，还把**数目变成打印读数＋断言**（`25/0`、`16/0`，RULE E 仍 `67=67`）；矩阵我选了**具名边界**而不是造一行（理由：门禁脚本**没有可探的行动面**，硬加只造一个测不出东西的行），并把"谁守着守护者"的三道判据与**推翻条件**写进 `docs/11 §4.2`。中途我自己踩了同族的坑：**描述门的文档被门扫**（运行标签被 claim-id 正则读成 `C9` ⇒ 悬挂引用），已当场测出、修好并**具名写进文档**。现状两条红（`audit-vmu-docs`／`regen-all --check`）有完整归因链，指向并发同事的 `settings/schema.js`＋`kernel/meetings.js` 改动与轮末 `regen-all`，**不是本次任务的红**。
