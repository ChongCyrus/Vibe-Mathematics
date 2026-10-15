# Round 15 · vmu-pack（`task-115`）交付报告 —— SEAMS 具名 ＋ PRESETS 侧核验 ＋ pack 文档同步

> 任务：`task-115`（① `SEAMS` 白名单可见性；② 7 文件收口后的 `PRESETS` 侧核验；③ `docs/27 §6`／`docs/10 §2` 同步）
> 纪律：**未改 `scripts/**`、`tests/**`、`installer.js`、`package.json`** ✓；未跑全量 T0/T1、未 `regen-all`、未 git 写；临时文件 `D:\_tmp\vmu-pack14\`。
> **★ 读的是哪一版**：工作树 `D:\wd\vibemath开发\Vibe-Mathematics`，**`git rev-parse HEAD` = `e40207bf28316c4c483e3180ba8dcf553942a580`**（轮 14 已 commit）。★ 本轮工作树**被多名队友并发修改**，所以下面**每一条读数都绑定到文件哈希／mtime**，不绑定的读数一律不作数。

---

## 0. 结论速览

| 项 | 结论 | 绑定读数 |
|---|---|---|
| **① `SEAMS` 可见性** | ✅ **具名已落 `docs/27 §6.5`**（不改 `scripts/**` ✓）＋ ★ **实测代价已具名转 verify2** | 当前 `SEAMS`（`:26`）**不含** `ballot`／`boxFor`，该文件里这两个名字**出现 0 次**；★ 扩白名单实测＝**＋1 行、0 finding、PASS** |
| **② `PRESETS` 侧核验** | ✅ **全部通过** —— `packs/example-data/` **2 个文件**两份清单**都齐**；四门读数全绿 | `files[]`(vmu)＝**209** ／ `PRESETS`＝**209**，**四个差集全空** ✓ |
| **③ pack 文档同步** | ✅ `docs/27 §6.1/§6.2/§6.4` 更新为"**已落地**"＋新增 `§6.5` | 见 §3 |
| **★ 本轮抓到的一条新红（不是我引入的）** | 🔴 **`audit-vmu-docs` ＝ `94 passed, 1 failed`，EXIT=1**，失败项**只点名 `docs/11`** | 见 §4（读的是 `docs/11` sha256 `b95de80eab412d31`、mtime 13:39:52） |

---

## 1. ① `SEAMS` 白名单可见性 —— **走"具名"**（按 Lead 指示，不越界）

### 1.1 症状是**结构性**的，不是"这次漏了"

`scripts/generate-seam-table.mjs`（md5 **`14647243395a33cbcbe0a17b0ecef3af`**、9663 B、mtime **19:28:18**）：

| 事实 | 读数 |
|---|---|
| `SEAMS` 是一张**白名单**，位于 `:26` | 仍是 15 个名字：`clock, log, settings, bus, store, members, tasks, metrics, signer, deliver, fetchFn, timer, random, now, policy` |
| 提取器是 `for (const seam of SEAMS)`（`:92`） | ⇒ ★ **名单外的注入永远不会被提取、渲染或检查** —— **不是"没查到"，是"这类查不到"** |
| `ballot`／`boxFor` 在该文件里 | ★ **出现 0 次**（`Select-String` 全文件零命中） |
| 但它确实是一处**真构造注入** | `vibe-math-vmu/kernel/index.js:1130`：`createMeetings({ …, ballot: meetingBallot })` |

### 1.2 ★ 扩白名单的**实测代价**（在**当前**版本上重做，不是引用轮 14 的旧读数）

做法：把**当前** `generate-seam-table.mjs` 复制到 `D:\_tmp\vmu-pack14\gen-cur-exp.mjs`，只把 `SEAMS` 尾部改成 `… 'policy', 'ballot', 'boxFor']`，用 `--kernel <仓库真>kernel/index.js --no-fingerprint` 跑（★ **不改仓内任何文件**）。

| 运行 | 命令 | 读数 | 退出码 |
|---|---|---|---|
| 基线 | `node scripts/generate-seam-table.mjs --no-fingerprint` | `SEAM TABLE: rows=112 seams=7 null=1 findings=0` ／ `SEAM REACHABILITY: PASS` | **0** |
| 扩后 | `node D:\_tmp\vmu-pack14\gen-cur-exp.mjs --kernel <repo>\vibe-math-vmu\kernel\index.js --no-fingerprint` | `rows=113 seams=8 null=1 findings=0` ／ `PASS` | **0** |

★ **差集恰好一行**（四个单元依次）：`` `ballot` ``｜`` `kernel/index.js:1130` (meetings) ``｜`meetings`｜`` `meetingBallot` ``。
★★ **`boxFor` 加不加都一样**：它**没有构造点** —— 按裁决 (i)，`boxFor` 由 **pack 经 `bindBox` 懒绑**，不是构造期注入 ⇒ 今天加它不产生行。

### 1.3 扩还要不要动别的 —— **不用**

- `tests/audit-seam-reachability.test.mjs` 的判据是 **`rows.length >= 5`**（`:43`），**没有硬编码行数** ⇒ 112→113 不会触红；
- **仓里没有需要 `--check` 的已提交 seam 表**（新鲜度在 `mkdtemp` 临时目录里自证，`:50-52`）⇒ **没有生成物要重生成**；
- ⇒ **扩＝`SEAMS` 一个 token**，且实测 **0 finding**。

### 1.4 **谁守着这一族**（具名要求的那一半）

| 项 | 读数 |
|---|---|
| 门 | `tests/vmu-motion-box.test.mjs`（md5 `9a60f319ebf74b9d11a00ee74b32315d`） |
| 读数 | **`23 passed, 0 failed`，EXIT=0**（★ 任务书里的 `22/0` 是旧值；`22` ＝ B5b 之前，**B5b 是轮 14／task-107 加的**） |
| 它**不靠投票回执** | B2／B3 断言"箱子真的开了（`boxes===1`）＋ `boxFor` 缝真的绑上（`source:'method'`）"；★ **B5b 独立回读箱子裁定**（"把回执与事实分开"）；R1／R2 断绑／解绑；负例断言 `VMU_MEETING_BOX_UNWIRED` ＋ `reason:'no-binding'` |

⇒ ★ **归属**：`scripts/**` 是 `vmu-verify2` 的领地 ⇒ 本轮**只具名、不越界改**；已把"**一个 token ＋ ＋1 行 ＋ 0 finding**"的代价实测转它。

---

## 2. ② `PRESETS` 侧核验 —— **通过**（并抓到一次**并发写入竞态**）

### 2.1 ★ 先说竞态（否则下面的数会被误读）

我**第一次**跑自己的普查脚本时读到：`packs/example-data/README.md` **`files[]=true` ／ `PRESETS=false`**，而**同一分钟**用 §8 判据逐行复算却是 **∅（无 unmanaged）** —— 自相矛盾。原因：**verify2 正在并发落这件事**，两个脚本之间 `installer.js`（13:34:44）与 `package.json`（13:35:38）各被写了一次。
⇒ **修法**：改成**一次运行内把四个文件的 md5／bytes／mtime 全部打印**再判。★ 这条是 `docs/11` ⑪（扫描期间不得改变作业集合）的现场实例。

### 2.2 绑定读数（一次运行，`installer.js` md5 `958e1ba63fe08b8eeb433f0df87b468b`、55033 B、13:34:44）

| 文件 | md5 | bytes | mtime |
|---|---|---|---|
| `installer.js` | `958e1ba63fe08b8eeb433f0df87b468b` | 55033 | 13:34:44 |
| `package.json` | `a542000be44b7743054717c0a5d81ffa` | 34416 | 13:35:38 |
| `tests/_lib/package-exemptions.mjs` | `b59747355de4c2ac5e23a5016de20554` | 4270 | 13:34:00 |
| `tests/audit-package-membership.mjs` | `4a2634bac4dd32c6afbffb0893aba6a7` | 17035 | 13:35:52 |
| `tests/audit-installer-policy.test.mjs` | `ee2531c1f58d19d5986bd5be8af2e1c9` | 33070 | 13:35:27 |

**`packs/example-data/`（★ 磁盘上实际是 2 个文件，不是任务书猜的 3 个）**：

| 文件 | `files[]` | `PRESETS` |
|---|---|---|
| `vibe-math-vmu/packs/example-data/README.md` | **true** ✓ | **true** ✓ |
| `vibe-math-vmu/packs/example-data/prompts/sections.json` | **true** ✓ | **true** ✓ |

**全预设普查（`vibe-math-vmu/`，215 个文件）**：

| 项 | 读数 |
|---|---|
| `files[]`（vmu 前缀）／`PRESETS` | **209 ／ 209** |
| A) 磁盘上有、`files[]` 没有 | **6 个** ＝ `docs/audit/**`（★ **按设计**，由豁免表具名 ✓，见 §2.3） |
| B) `files[]` 有、`PRESETS` 没有 | **∅** ✓（★ 轮 14 的"只进一处"缺口**已闭合**） |
| C) `PRESETS` 有、`files[]` 没有 | **∅** ✓ |
| D) `PRESETS` 指向不存在的文件 | **∅** ✓ |
| E) `tests/`／`scripts/` 进了 `PRESETS` | **0** ✓（判据 (d) ✓） |
| F) `files[]` 重复条目 | **∅** ✓（★ 轮 14 那条 `tests/_lib/strip-comments.mjs` ×2 **已去重**） |

### 2.3 ★ 豁免表与我轮 14 的 `§B` 建议**逐条对齐**（并多了一条干净对照）

`tests/_lib/package-exemptions.mjs`：导出 `PACKAGE_EXEMPTIONS`（6 条，全是 `vibe-math-vmu/docs/audit/**`）＋ `GATE_ROUND = 15`。
- 字段**五个全在**：`path`（精确路径）／`reason`（为什么**不该**交付）／`approvedBy:'Lead'`／`approveRound:15`／`reviewRound:25` ✓；
- 六个反漂移开关**全部实现**：`missing`／`gone`／`redundant`／`dup`／`blank`／`due` ✓；
- ★ 消费方 `audit-package-membership.mjs` 的**预设源根磁盘闭包**块（`:148-227`）把判据抽成**纯函数** `closureOf`，**六个开关各一条合成自探针**（判据 e/f/g ＋ dup/blank/due），★ **还多了一条"探针 0 干净对照"**（干净输入必须安静）—— 这是我轮 14 §B.3 没写到的一步，**是改进** ✓；
- ★ 该块**逐条拒绝**了两件我轮 14 建议的事：它**从 `installer.js` 读 `PRESETS`**（不重述）✓、并明确写着 **"This is NOT the `files[] -> PRESETS` edge: that one belongs to §8"** ✓（＝"一个事实一个门"）✓。

### 2.4 门禁读数（★ 全部 EXIT=0）

| 命令（原样） | 读数 | 退出码 |
|---|---|---|
| `node tests/audit-package-membership.mjs` | `PACKAGE MEMBERSHIP: 28 passed, 0 failed`（★ 轮 14 同一门是 **13/0** ⇒ ＋15 条＝这条边＋它的探针） | **0** |
| `node tests/audit-installer-policy.test.mjs` | `INSTALLER POLICY: 100 passed, 0 failed` ＋ `ALL GREEN` | **0** |
| `node tests/audit-pack-face.test.mjs` | `PACK FACE: 5 passed, 0 failed` | **0** |
| `node tests/vmu-pack.test.mjs` | `VMU PACK: 53 passed, 0 failed` | **0** |

⇒ ★ **Lead 给的四条验收判据全部满足** ✓，且 `packs/example-data/` **齐全** ✓（无"不齐"需要具名）。

---

## 3. ③ pack 文档同步（`docs/27`，我的写范围）

| 改哪 | 改了什么 | 为什么必须改 |
|---|---|---|
| `§6.1` 权威表 | `docs/audit/**` 行补 **具名处＝`tests/_lib/package-exemptions.mjs`**；★ **新增一行** `packs/<id>/README.md`（出货的那份）⇒ **必进两份清单** | ★ 轮 15 现场出现了"**只进 shipped 名册、没进托管名册**"的实例（§2.1 的竞态），本表要能挡住它 |
| `§6.2` 豁免表 | 补"**本节已落地**"段：表＝`tests/_lib/package-exemptions.mjs`、消费方＝磁盘闭包块、★ **一节五字段＋六开关逐条对应**、★ 并有**探针 0 干净对照** | ★ 轮 14 写的是**建议**；不改就会变成"文档说建议、其实已落地"的**陈旧行**（本仓反复抓的那一类） |
| `§6.4` 标题＋结论 | `轮 14 结论` ⇒ **`轮 14 结论／轮 15 已落地`**；补**落地与读数**段（门 md5、`28/0`、四门读数、215/209/209 与四个空差集） | 同上：**建议 → 已落地**必须同轮改掉，否则读者只看到"建议" |
| `§6.5`（新增） | ★ **① 的具名**：`SEAMS` 白名单**视野外** ＋ 实测代价表（＋1 行／0 finding／PASS）＋ `boxFor` 无构造点 ＋ **谁守着这一族**（`vmu-motion-box` 23/0，不靠回执）＋ 归属（verify2、本轮不越界） | ★ "缺环/未接线必须具名，不许静默" |

★ **`docs/10 §2` 未改** —— 我轮 14 那句指针（"交付面以 `docs/27 §6` 为唯一权威"）**仍然准确**，verify2 的改动**没有改变"哪份清单收什么"**（只落地了"怎么具名不交付"）⇒ ★ **不需要同步**（★ 宁可不改，也不制造一处会过期的重复）✓。

### 3.1 我自己检验（避免我的表变成新的漂移源）

| 检验 | 结果 |
|---|---|
| 表格**不得被空行切断**（`audit-table-integrity` 的硬判据） | `docs/27` **none** ✓／`docs/10` **none** ✓ |
| 每行列数＝表头列数 | ★ 我**自己踩到并修掉一处**：`§6.5` 的"扩白名单的实测代价"行里我嵌了**带未转义 `\|` 的表格行**（列数 7 vs 3）⇒ 已改成"四单元依次是 …"的散文式 ✓。★ 剩余不匹配：`docs/27:241`（★ 轮 14 既有行，原 `:220`，我的改动把它位移）＋ `docs/10:52/294/295/355`（★ 均为**既有**，且该门自己的注释说明这类是 **report-only**：单元格里可以有 `\|`）⇒ **没有一处是我新增的** ✓ |
| 我新加的 `VMU_*` 码是否已登记（否则 `audit-vmu-docs` 会红） | ★ `§6.5` 引入 `VMU_MEETING_BOX_UNWIRED` ⇒ 我**先查了登记**：`docs/03:523`（码表）＋ `docs/03:1270`（"已实现"，出处 `kernel/meetingmarker.js`）⇒ **已登记** ✓，未制造新的未登记码 ✓ |

---

## 4. ★ 本轮抓到的一条红：`audit-vmu-docs` ＝ `94/1`，**只点名 `docs/11`**（不是我引入的）

**绑定读数**（跑前跑后取哈希**完全相同** ⇒ 读数确实覆盖该版本）：

| 文件 | sha256／md5 | bytes | mtime |
|---|---|---|---|
| `vibe-math-vmu/docs/11-gates-and-development.md` | sha256 `b95de80eab412d31` | 239844 | **13:39:52** |
| `vibe-math-vmu/docs/27-pack-folder.md`（我的改动后） | sha256 `926acd5307c56614` | 44689 | 13:40:42 |
| `tests/audit-vmu-docs.test.mjs` | md5 `0eb0543b87d97f1915b7c2e72882fa97` | 46843 | 13:37:44 |

```
node tests/audit-vmu-docs.test.mjs
=== VMU DOCS AUDIT: 94 passed, 1 failed ===
FAIL every vmu.* key named in the docs exists in settings/schema.js
     [vmu.dissemination.impact (11-gates-and-development) |
      vmu.dissemination.mediaRequest (11-gates-and-development) |
      vmu.meetings.open (11-gates-and-development)]
EXIT=1
```

★ **为什么可以断定与我的编辑无关**：该失败项的 detail **三个名字全部标注 `(11-gates-and-development)`**，**没有一个是 `27-pack-folder` 或 `10-packs`** ✓；我的 `§6.5`／`§6.4` 新增文本里**不含任何 `vmu.*` 键名** ✓（我新增的只有文件路径、哈希、读数和 `VMU_MEETING_BOX_UNWIRED` 码）。
★ **归属**：`docs/11` 与那条判据都是 `vmu-verify2` 的领地（G2 的收口）⇒ **具名转它，我不越界**。

★ **时间线（同一门，同一会话内的四次读数，各绑版本）**——★ 这正是"引用要写版本"的现场：

| 时刻 | 门版本 | `docs/11` | 读数 |
|---|---|---|---|
| 08:55:16 | 46063 B / 08:54:13 | — | `94/1`，失败＝ `SELF-PROBE (G2)`（合成输入，不读文档） |
| 08:55:35 | 46180 B / 08:55:35 | — | **`95/0`** |
| 09:05:51 | 46180 B / 08:55:35 | sha256 `0841d799095bac9c` / 09:05:31 | **`95/0`** |
| **13:41:31** | **46843 B / 13:37:44** | **sha256 `b95de80eab412d31` / 13:39:52** | **`94/1`（点名 `docs/11` 的三个 call-only 名）** |

---

## 5. 全部原样命令 ＋ 退出码（Lead 要的那份）

| # | 原样命令 | 读数 | 退出码 |
|---|---|---|---|
| 1 | `node tests/audit-package-membership.mjs` | `28 passed, 0 failed` | **0** |
| 2 | `node tests/audit-installer-policy.test.mjs` | `100 passed, 0 failed` / `ALL GREEN` | **0** |
| 3 | `node tests/audit-pack-face.test.mjs` | `5 passed, 0 failed` | **0** |
| 4 | `node tests/vmu-pack.test.mjs` | `53 passed, 0 failed` | **0** |
| 5 | `node tests/vmu-motion-box.test.mjs` | `23 passed, 0 failed` | **0** |
| 6 | `node tests/audit-seam-reachability.test.mjs` | `17 passed, 0 failed` | **0** |
| 7 | `node tests/audit-gate-snapshot.test.mjs` | `12 passed, 0 failed`（`head=e40207b dirty=9`） | **0** |
| 8 | `node scripts/generate-seam-table.mjs --no-fingerprint` | `rows=112 seams=7 null=1 findings=0` / `PASS` | **0** |
| 9 | `node D:\_tmp\vmu-pack14\gen-cur-exp.mjs --kernel <repo>\vibe-math-vmu\kernel\index.js --no-fingerprint` | `rows=113 seams=8 null=1 findings=0` / `PASS` | **0** |
| 10 | `node scripts/check-docs.mjs` | `DOC LINT: PASS` | **0** |
| 11 | `node tests/audit-doc-index.test.mjs` | `5 passed, 0 failed` | **0** |
| 12 | `node tests/audit-verbatim-claims.test.mjs` | `3 passed, 0 failed` | **0** |
| 13 | `node tests/audit-vmu-docs.test.mjs` | **`94 passed, 1 failed`**（点名 `docs/11`） | **1** |

我自己的只读探针（都在 `D:\_tmp\vmu-pack14\`，不进仓）：`presets-check2.mjs`（②）、`verify-docs.mjs`（表格结构）、`bind2.mjs`（绑定版本）、`gen-cur-exp.mjs`（① 的扩白名单对照）。

---

## 6. 交回 Lead／`vmu-verify2`

1. **给 `vmu-verify2`（①）**：`scripts/generate-seam-table.mjs:26` 的 `SEAMS` 加 `'ballot','boxFor'` ⇒ ★ **实测代价：＋1 行、0 finding、`PASS`、EXIT=0**；该门**无硬编码行数**、**无已提交 seam 表要 regen** ⇒ **不需要动别的**。★ 你决定要不要落；**我没动 `scripts/**`**。
2. **给 `vmu-verify2`（② 的确认）**：轮 14 那 7 个文件**已收口且我核过** —— 6 份 `docs/audit/**` **按设计豁免**（表＝`tests/_lib/package-exemptions.mjs` ✓）、`packs/example-data/README.md` **两份清单都齐** ✓；`files[]` 209 ／ `PRESETS` 209，**四个差集全空** ✓，`files[]` 重复条目 **∅** ✓。
3. **给 `vmu-verify2`（★ §4 那条红）**：`audit-vmu-docs` ＝ **`94/1` EXIT=1**，**只点名 `docs/11`** 的三个 call-only 名（`vmu.dissemination.impact`／`mediaRequest`／`vmu.meetings.open`）⇒ 是 G2 的收口项；★ 请以 **`docs/11` sha256 `b95de80eab412d31`（13:39:52）／门 md5 `0eb0543b87d97f1915b7c2e72882fa97`（13:37:44）** 为基线。★ **`docs/11` 在 13:39:52 之后若再被改过，这条读数即作废。**
4. **给 Lead（T0/T1 相关）**：本轮工作树**并发写入很多**（`installer.js` 13:34:44、`package.json` 13:35:38、`tests/_lib/package-exemptions.mjs` 13:34:00、`audit-package-membership` 13:35:52、`audit-installer-policy` 13:35:27、`audit-vmu-docs` 13:37:44、`docs/11` 13:39:52）⇒ ★ **轮末 T0/T1 请以开跑那一刻的哈希为准**；★ 且**当前树上 `audit-vmu-docs` 是红的**。
5. **未决／边界**：`boxFor` 加进 `SEAMS` **今天不产生任何行**（无构造点）⇒ 加它的价值是**将来**有人把它变成构造期注入时能被看见；这一点由 verify2 裁。★ 我**未改** `scripts/**`／`tests/**`／`installer.js`／`package.json`，本轮**只写** `docs/27` ＋ 本报告。
