# Round 2 · `task-181`（`vmu-accept`）：并入「`D2` 迁徙」落地 ＋ 总账迁入仓内

> **交付物**：① 本报告；② 总账 **`docs/acceptance/17-objective-status.md`**（原地维护，新增"收轮后追加·四"＋ D10 ＋ §5-8 更正 ＋ 纪律 22/23）。
> **纪律**：**只读**（侦察）＋ **只写**总账与本报告；**未跑全量（T0/T1 归 Lead）／未 `regen-all`／未做任何 git 写**（只读 `git log/show/diff/ls-files`）。

## 0. 哪一次运行、哪一版文件（钉死）

| 项 | 值 |
|---|---|
| 工作树 | `D:\wd\vibemath开发\Vibe-Mathematics` |
| `git rev-parse --short HEAD` | **`1960c8d`**（迁徙提交，**10-16 07:25:45**，*chore(acceptance): move the out-of-repo verification evidence into docs/acceptance, and make the one audit it affected coherent*） |
| 工作树是否干净 | ★ **干净**（`git status --porcelain` ＝ 0 行，07:27 读） |
| 我的运行窗口 | 2026-10-16 **07:27 – 07:4x** |
| 被核对象（哈希，我自己算的 sha256[0:16]） | `docs/acceptance/04-parity-matrix.md` **`a9a6c5b95a588861`**（366,263 B／**CRLF＝0**）／`docs/acceptance/17-objective-status.md` 迁入时 **`4836a0aced96ca61`**（106,100 B／490 行／CRLF＝0） |

## 1. 我实读的迁徙事实（★ 与 Lead 给的读数逐条对齐）

| # | 事实 | 我的读数（命令＋结果） | 与 Lead 的读数 |
|---|---|---|---|
| 1 | 提交存在 | `git log -3` ⇒ `1960c8d`；`git log -1 --format='%h %ad %s' 1960c8d` ⇒ **10-16 07:25:45** | 一致（消息逐字一致） |
| 2 | 变更面 | `git diff --shortstat f5cfa47..1960c8d` ⇒ **229 files changed, 29,997 insertions(+), 20 deletions(−)** | ★ **一致** |
| 3 | 迁入文件数 | `git ls-files docs/acceptance` ⇒ **220** 行；★ 其中 `17-objective-status.md` **在列**（`git ls-files docs/acceptance/17-objective-status.md` 有输出） | ★ **一致**（220 ＝ 219 ＋ 迁移 README） |
| 4 | 源目录已清空 | `Get-ChildItem D:\wd\vibemath开发\_handoff\vmu -Force` ⇒ **只有 `README.md`（1,249 B）** | ★ **一致**（剩一个仓外指针） |
| 5 | 字节被保住 | `04-parity-matrix.md` **sha256[0:16] `a9a6c5b95a588861`**、**CRLF＝0**；`17-objective-status.md` **CRLF＝0** | ★ **一致**（矩阵哈希与"当初作者报的"同） |
| 6 | 五门（**同一版 `1960c8d`、工作树 clean**） | `audit-claim-traceability` **8/0**；`audit-package-membership` **29/0**；`audit-code-size` **9/0**；`audit-doc-index` **5/0**；`check-docs` **PASS** | ★ **一致**（★ 这五条是**我第一手**跑的） |
| 7 | T0／T1 | — | ★★ **Lead 的读数（转述）：T0 25/25 PASS、T1 `GATE_SCOPE=vmu` 326/326 PASS（384.3s）、`regen-all --check` 15/15 in sync** ⇒ ★ **我没有跑 T0/T1，也没跑 `regen-all`**（纪律），**不抬成"我核过"** |

## 2. ★★ 迁徙的隐藏后果：**`audit-claim-traceability` 的溯源表必须先被拆**

**我读码核到的形状**（`tests/audit-claim-traceability.test.mjs`，**只读**）：

| 项 | 读数 |
|---|---|
| 卷扫描根 | `:17 const DOCS = join(REPO,'vibe-math-vmu','docs')`；`:69 volumes = readdirSync(DOCS).filter(f => /^\d\d-.*\.md$/)` ⇒ **只读插件的卷**，★ **仓根 `docs/` 不在扫描根内** |
| 两张溯源表 | `:48 EXTERNAL`（**6 条**：D11／D12／G8／G11／G13／G17）⇒ 断言**在【工作区根】下存在**（`:106`）；`:58 IN_REPO`（**1 条**：**F53 → `docs/acceptance/03-v5r-full-inventory.md`**）⇒ 断言**在【仓库根】下存在**（`:110`） |
| 防漂移 | `:100` **EXTERNAL 恰好 6 条**；`:103` **IN_REPO 恰好 1 条且路径逐字**；★ **两张表都不能悄悄长大** |
| 注释里的历史（**故意保留**） | `:59-64` 写明 F53 **当年**在 `_handoff/vmu/03-v5r-full-inventory.md`、**旧路径写在注释里并显式标注为旧路径**；`:63` "the gap is CLOSED" |
| **不修就会坏的那句话** | 迁移**之前**：那张表断言"每条**在工作区根**下存在"；迁移**之后**若仍用一张表 ⇒ **它会开始断言"仓内的文件存在于仓外"** —— ★ **这正是 Lead 说的"不修就坏"** |

★ **我没有改这个测试**（不在我的只读范围）；★ 我核到的是**当前形态**：`:100`/`:103` 两条"恰好那一组"断言 ＋ 两张表各按**自己的根**存在性断言（`:106`／`:110`），★ 与 Lead 描述的**处置一致**。
★ **与已立纪律的关系**：§5.9-22（**"把一个东西搬进仓，会改变它原来'在外面'这一事实的断言"**）**由此条现场命名**；★ 其**强形式**是 Lead 给的 **B 复现**（把 F53 放回 EXTERNAL 用旧路径 ⇒ **红**）—— ★ **它证明的不是"新断言能红"，而是"修的必要性"**（我**只读转述**该副本实验，**未重跑**）。

## 3. 我写进总账的东西（四处）

1. **文首"★ 收轮后追加·四（R2：「`D2` 迁徙」落地）"**：219 文件／`1960c8d`／229 files ＋29,997−20／`ls-files` 220／源目录只剩仓外指针／**本文件从此在仓内**／字节保住（全 LF，矩阵 `a9a6c5b95a588861`）／映射表 `_handoff/vmu/X → docs/acceptance/X`／**旧路径引用保持原样**。
2. **§0 版本表新增两行**：**"本文件现在在哪（R2 起）"** ＋ **"R2 迁徙那一版的读数"**（含我跑的五门；★ T0/T1 标注为 **Lead 的读数（转述）**）；并把 `HEAD` 行改为 `1960c8d`，同时**保留** R39 的 `a3bde6a` 口径（**正文套件读数分属两个干净树**）。
3. **§3.3 新增 D10**：★ **标明命名冲突** —— 此处 **`D2` 是任务编号**，与同表里那条待解 **D2（"回执说 pack 合并了"）同名不同物**（本项目已立过"同一 token 在门的另一侧可能有语义"）。
4. **§5 第 8 条就地更正**：旧说法（"写在仓外 ⇒ 不会污染任何扫卷的门禁"）**作废**；★ **新说法**：它**在仓内**，**不被卷审计覆盖的原因是【扫卷根不同】**（我逐条读码：卷审计只读 `vibe-math-vmu/docs/`、`audit-code-size` 只走 `vibe-math-vmu/**/*.js`、安装器项只限 `vibe-math-vmu/` 前缀的 `files[]`、`audit-claim-traceability` 的卷扫描同样只读 `vibe-math-vmu/docs`）。
5. **§5.9 新增两条纪律 22／23**（见下）。

## 4. 本轮新入册的两条纪律（均带现场）

- **22** ★★ **"把一个东西搬进仓，会改变它原来'在外面'这一事实的断言"**（**迁徙类改动专用**）：**迁徙前必须先找【按路径存在性】断言的审计**，并逐条问"**搬完之后这句话还是真的吗**"；处置＝**按根拆表**（`EXTERNAL`／`IN_REPO`）＋ **两张表都断言"恰好是当初那一组"**；★ **必须有牙**：A 指向不存在文件 ⇒ 红并点名；★★ **B 用旧路径复现"不修就会坏"的那个失败本身**（比"新断言能红"更强）。
- **23** ★ **"批量替换必须排除【记录历史的文本】"**：**活引用（要改）／历史记录（不改）／被扫卷（改完要重跑门）** 三类分开；现场＝9 个测试文件的 10 处失效旧路径被更新，而**迁移说明与各报告内部 ≈114 处自引用故意不替换**（改写会把历史变成"它一直在仓里"的断言）⇒ 处置＝**保留旧路径并显式标注为旧路径** ＋ **给映射表**。

## 5. 诚实边界

1. **未跑 T0/T1、未跑 `regen-all`** —— 这三项（25/25、326/326、15/15 in sync）**是 Lead 的读数，我按转述记并标明来源**。
2. **未重跑** Lead 的 A／B 两条副本反例 ⇒ 那两条是**只读转述**；★ 我核到的是**测试的当前形态**（两张表、各按自己的根、两条"恰好那一组"断言）。
3. **未改任何测试／代码／配置**（只写总账与本报告）；★ 我也**没有**运行 `--write` 类命令。
4. **我在写入后复跑了能覆盖"新增仓内文件"的那几个门**（见 §6），但★ **T1 的 326 条对表仍归 Lead**。
5. ★ **一处对我自己不利的更正**：上一版总账 §5-8 写的"**本文件在仓外 ⇒ 不会污染任何扫卷的门禁**"**已作废**（R2 起文在仓内）；我把它**改成"原因不同"**而不是删掉——**旧说法本身是历史**（§5.9-23 的同一原则）。

## 6. 写入后的门禁复跑（★ 证明"新增仓内文件"没碰任何门）

| 门 | 读数 | exit |
|---|---|---|
| `node tests/audit-claim-traceability.test.mjs` | `=== CLAIM TRACEABILITY: 8 passed, 0 failed ===` | 0 |
| `node tests/audit-package-membership.mjs` | `=== PACKAGE MEMBERSHIP: 29 passed, 0 failed ===` | 0 |
| `node tests/audit-code-size.test.mjs` | `=== CODE SIZE: 9 passed, 0 failed ===` | 0 |
| `node tests/audit-doc-index.test.mjs` | `=== DOC INDEX: 5 passed, 0 failed ===` | 0 |
| `node scripts/check-docs.mjs` | `DOC LINT: PASS` | 0 |

★ **说明**：这五条在**我写入之前**（07:2x）与**写入之后**（07:4x）各跑一次，**读数相同** ⇒ ★ **"总账搬进仓"与"我这一版更新"都没有改变任何门的读数**（★ 与 §3 的读码结论一致：它们的扫描根都不含仓根 `docs/`）。
★ **仍未覆盖的**：`tests/audit-claim-traceability.test.mjs` 的**卷扫描**是否应扩到仓根 `docs/`（**那是设计决定，不是我能裁的**）—— ★ 我把它列为**具名开口**留给 Lead。

## 7. 交付物的最终标识（★ 写入后我算的）

| 文件 | 字节 | 行 | sha256[0:16] | 说明 |
|---|---|---|---|---|
| `docs/acceptance/17-objective-status.md`（**总账**） | **113,030** | **497** | **`6edfd3c3d6be0df5`** | ★ **稳定**（本报告写完之前它已定稿；CRLF＝0、FFFD＝0） |
| `docs/acceptance/accept-round2-report.md`（**本报告**） | — | — | ★ **不自指** | ★ **纪律：报告不引自己的哈希** —— 每次写入都会改变它；我**最早量到** `9,359 B／76 行／b5253265df5fd5c9`，但那**不是最终值**，★ **我不把它写成最终值**。可识别标识＝**路径** ＋ 由 Lead 在提交时取的 `git hash-object` |

★ **结构自检**：总账内**无**"表格行粘连"（`|` 行里出现 `||` 的行数 ＝ **0**）；两个文件 **CRLF＝0、FFFD＝0**（★ 与迁徙的 `eol=lf` 约定一致）。
★ **`git status`（07:30 读）**：` M docs/acceptance/17-objective-status.md`（**我**）／**`?? docs/acceptance/accept-round2-report.md`**（**我**）／★ **` M scripts/generate-wiring-index.mjs`**（**不是我的改动——一个在飞写者**）⇒ ★ 按"**读数要说清哪一份／哪一版／哪一时刻**"：**本报告的读数是在【我这一版两个文件写入前后】取的，且当时工作树上另有一处在飞改动**；★ 我**没有**碰它，也**没有**把它算进任何读数。
