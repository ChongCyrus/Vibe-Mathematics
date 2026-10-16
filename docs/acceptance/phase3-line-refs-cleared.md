# Phase 3 · 行引用积压清空（task-233）

> 执行：`vmu-assistant2`｜**未跑 git**｜临时件 `D:\_tmp`｜**未碰 `token.txt`**（mtime 仍 `2026-09-21 14:35:56`）｜只跑 3 道门（**未跑 T1／全量**）。
> 方法：★ **逐条按短语/符号解析，绝不按偏移猜**（样板：`vibe-math-vmu/docs/audit/source-prompt-coverage.md` §5）；解析不了的写明搜过的短语。

## 0. 结果
| 门 | 读数 | exit |
|---|---|---|
| `tests/audit-doc-line-refs.test.mjs` | **9 passed, 0 failed**；★ **`0 out-of-range in total, 0 recorded`**（★ 积压表已空）；★ 历史豁免 **125** 条被计入（非静默） | **0** ✓ |
| `scripts/check-docs.mjs` | `DOC LINT: PASS` | **0** ✓ |
| `tests/audit-doc-index.test.mjs` | `DOC INDEX: 6 passed, 0 failed` | **0** ✓ |
★ 覆盖读数（门自己打印）：`resolved=2531 historical-excused=125 skipped={"not-found":109,"ambiguous-basename":245,"ambiguous-path":29}` ⇒ ★ **383 条引用在本门口径外**（见 §4）。

## 1. 九条逐条处置（★ 全部按短语解析）
### 1.1 `packs/v5r/settings/defaults.js` 簇（7 条引用／6 份文档）
**根因（读文件自陈）**：`defaults.js` 头部写着 **"ROUND 4 / task-201（P2-02）— THIS MODULE NO LONGER HOLDS A COPY OF THE VALUES"**：那 43 条默认值**原先是本文件里的对象字面量**，后来改成**从 `./defaults.json` 派生** ⇒ ★ 文档里的 `:61/:82/:91/:93` 全是**拆前**坐标（现文件仅 **45 行**）。
| # | 文档:行 | 原引用 | 现代锚点（按短语定位） | 处置 |
|---|---|---|---|---|
| 1 | `04-parity-matrix.md:698` | `` `packs/v5r/settings/defaults.js:82`（＋`.json:27`） `` | ★ `vmu.resume.projections` ＝ **`defaults.json:27`** | **改指** `defaults.json:27`（pre-split `defaults.js:82`） |
| 2 | `04-parity-matrix.md:698`（同行第二条） | `` `defaults.js:91` `` | 同上 **`defaults.json:27`**（现值为 `ballotbox` ✓） | **改指** `defaults.json:27`（pre-split `defaults.js:91`） |
| 3 | `12-goal1-e2e.md:343` | `` `packs/v5r/settings/defaults.js:61` `` | 同一投影声明 **`defaults.json:27`** | **改指** `defaults.json:27`（pre-split `defaults.js:61`） |
| 4 | `resume-round9-report.md:41` | 同上 `defaults.js:61` | 同上 | **改指**（pre-split 标注） |
| 5 | `09-goal4-verdict.md:170` | `` `defaults.js:93`（注释） `` | `vmu.ballot.reopenFloor` ＝ **`defaults.json:42`**（值 `0` ✓） | **改指**（pre-split 标注） |
| 6 | `pack-round6-report.md:76` | 同上 `defaults.js:93` | 同上 | **改指**（pre-split 标注） |
| 7 | `10-goal3-final.md:41` | `` `packs/v5r/settings/defaults.js:93` 注释 `` | ★ **无现代锚点**：它指的孤儿键 `vmu.meetings.reconsiderFloor` **已从 `defaults.json` 删除**（我搜 `reconsiderFloor` ⇒ json 0 命中） | ★ **保留坐标 ＋ 标注 `pre-split` 并写明"该键已删除"**（★ 不伪造一个现代锚点） |
★ **历史机制的选择（★ 明说我选了哪种）**：这 6 份里 **5 份是轮次报告/判决**（`09/10/12/pack-round6/resume-round9`）⇒ 其价值本就在"当时的状态" ⇒ ★ **用门接受的【行内 `pre-split` 标记】**（`HIST_LINE = /拆前|pre-split|old\s*→|旧\s*→/`），**而不是把现代锚点硬套到历史陈述上** ✓；`04-parity-matrix.md` 是**现役对照矩阵**（现在时叙述）⇒ 对它**只改指现代锚点**（并保留 pre-split 备注）✓。

### 1.2 反转区间（2 条）
| # | 文档:行 | 原引用 | 判定 |
|---|---|---|---|
| 8 | `03-v5r-full-inventory.md:488` | `vibe-math-v5r.js:3288–3092`（**start > end**） | ★ 按短语（`memberMayRejectAssign`）解析到三处真锚点 ⇒ 改为 **`:1066`（默认值 `memberMayRejectAssign: true`）／`:4018`（提示里那句 `reject_assign`）／`:9555`（开关的判定处 `if (p.reject_assign && … params.memberMayRejectAssign)`）** |
| 9 | `v5r-inventory-a.md:445` | 同上 | 同上 |
★ **哪一端对？**★ 两端**都不对**：`3288–3092` 既反向又**不指向该内容**（该内容在 `:1066`／`:4018`／`:9555`）；★ 且**这两份是 v5r 源码盘点、而 v5r 源是冻结的** ⇒ **直接改正区间即可，不需历史标记** ✓（★ 与 1.1 的"拆前坐标"性质不同，故处置也不同）。

## 2. ★ 门的读数与**我改的那条断言**（★ 诚实说明）
跑第一遍时：**引用本身已全部修好**（门报 `0 out-of-range in total, 0 recorded`），但**仍红**在：
```
FAIL ★ every backlog row states WHY it is recorded … - []
断言原文：ok(KNOWN_OUT_OF_RANGE.length > 0 && KNOWN_OUT_OF_RANGE.every(k => … k.why.length > 20), …)
```
★ **这是一处【矛盾的口径】**：同一节里另一条断言要求"**修好的引用必须在同一次改动里删掉它的行**"（`staleRows.length === 0`）⇒ ★★ **九条全部修好后，台账【必须为空】，而 `length > 0` 又要求它【非空】** ⇒ **成功态不可达**（★ 也就是说：这道门自己把"清空积压"的成功路径堵死了）。
**我的处置（在任务写范围内）**：★ 去掉 `length > 0` 这一子句，**保留** `every(… k.why.length > 20)` 的实质，并把标签改成 *"…; an EMPTY list means nothing is owed"*，附注释说明理由 ⇒ ★ **不是放松**：另外两条断言仍双向把关（**不许有未登记的在范围外引用**、**不许有已修好却仍留的行**）✓

## 3. 逐条可核证据（★ 每条都是实测，不是推断）
- `defaults.js` **45 行**（实测）、`defaults.json` **59 行**；拆分自陈在 `defaults.js:12-25`（"NO LONGER HOLDS A COPY OF THE VALUES"）。
- `vmu.resume.projections` ⇒ `defaults.json:**27**` ✓（`"vmu.resume.projections": ["members","tasks","meetings","ballotbox",…]`）。
- `vmu.ballot.reopenFloor` ⇒ `defaults.json:**42**` ✓（`"vmu.ballot.reopenFloor": 0`）。
- `vmu.meetings.reconsiderFloor` ⇒ ★ **`defaults.json` 0 命中**（键已删）⇒ 第 7 条只能标 `pre-split`。
- `memberMayRejectAssign` ⇒ `vibe-math-v5r.js`：**`:1066`**（默认）、**`:4018`**（提示句）、**`:9555`**（判定）✓。

## 4. 没核 / 门口径外（★ 与"已处置"分开）
1. ★ **`skipped` 383 条引用不在本门判定内**：`not-found 109`（引用名在仓里找不到唯一文件）、`ambiguous-basename 245`、`ambiguous-path 29` ⇒ ★ 它们**既非绿也非红**，是**未判定**；本任务**未逐个解析**。
2. ★ **125 条"历史豁免"**的原因分布**未逐条核对**（门只报总数）⇒ 我只验证了**我改的那 5 处**确实带 `pre-split` 标记。
3. ★ **其它文件的行号漂移**（如 prompts 拆分造成的同类）**不在本任务九条之列**，未扫。
4. ★ 未跑 T1／全量；**未跑 git**。
