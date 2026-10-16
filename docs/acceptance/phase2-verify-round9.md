# Phase 2 · verify2 · Round 9 —— 独立复核 Lead 轮末的三处干预（含那条**实质裁定**）

> 纪律：**只读复核**（真树只新增本报告）；夹具/比较脚本一律在 `D:\_tmp\p2r9`；**"没核"与"核了"分开写**；★ **每个读数绑 blob**；★ **不把转述写成"我跑了"**；未跑全量／`regen-all` 写／git 写。
> **读的版本**：`HEAD 31fd3cd`（＝本轮那笔提交，**开跑时 `git status` 空**）；`vibe-math-vmu/kernel/reportfeedback.js` **`2184859F24AC6BED`（7389 B／119 行）**；该文件在 `31fd3cd` 的父提交 `beef759` 里**不存在**（见 §1）；`scripts/generate-zero-mechanism-matrix.mjs`、`scripts/generate-planned-codes.mjs`、`vibe-math-vmu/docs/03-interface-contract.md` 均按当前字节；`vibe-math-vmu/host.js` **`461D7FD499F016EA`（1167 行）**；`tests/run-tests.mjs` **`B988AF9351E9219C`（未变）**。
> ★ **在飞写者（报告时刻）**：`M docs/acceptance/17-objective-status.md`、`?? docs/acceptance/phase2-accept-round9.md`、`?? docs/acceptance/phase2-pack-round9-a1-wiring2.md` ⇒ **全是 docs/报告，未触碰任何被我复核的产品文件** ⇒ 读数无混版本。

## 0. 结论速览
| 干预 | 判定 | 关键读数 |
|---|---|---|
| **① 头注释 `/** */` → `//` 的机械转换** | ★ **无损（"只有标记与首行变了、正文逐句等价"成立）** | 标记＋空行归一后：**正文 33 行、逐行相同、整段文本字符级相同（两侧各 2984 字符）**；**唯一变化＝首行标题**（按 Lead 声明改写） |
| **② `reportfeedback` 的 `EXPECT_NA` 裁定** | ★ **我同意**（且由**实测导出面**支撑） | 实测导出 **10 个**：**4 个纯函数**（`assertFiniteOrder`／`reportFeedbackReceipt`／`reportFeedbackFailure`／`boundFeedback`）＋**6 个常量**；★ **`create*` 工厂 = false**；★ **服务面（`status`/`on`/`effect`/`ctx`/start/stop/dispose/apply/register）= 0 个** |
| **③ planned-code registry 的 `--write`** | ✅ **机制成立、且已 in sync** | **干净 HEAD 副本**（`git archive`，未做任何 git 写）：`regen-all --check` **15/15**、`generate-planned-codes --check` **exit=0** ⇒ **陈旧是本轮的、不是先有的**；两个码的**载体表**：`VMU_EXTERNAL_UNAVAILABLE` **7 → 8**、`VMU_MIDDLEWARE_FAILED` **17 → 18**，**新增恰好 `vibe-math-vmu/kernel/reportfeedback.js`、无删除** |
| **☆ 顺带** | ✅ 与 Lead 读数一致 | `kernel-index: docs/02 matches the kernel (**99 modules, 0 headerless**)`；`audit-kernel-index` **6/0 exit=0**；`regen-all --check` **15/15**（干净 HEAD 与工作树**都** 15/15）；`host.js` **1167 ≤1200**；`run-tests.mjs` blob **未变** |

## 1. ★ ① 头注释转换：**无损**——★ 但**你给的比较源不存在**（我改用了唯一存在的证据源）
**先纠前提（必须报）**：`git cat-file blob 31fd3cd^:vibe-math-vmu/kernel/reportfeedback.js` ⇒ **该路径在父提交里不存在**（`fatal: path … does not exist in '31fd3cd^'`），且 `git show --stat 31fd3cd` 显示该文件是 **新增**（`119 ++++`）；`git log --all --oneline -- <path>` **只有 `31fd3cd` 一笔** ⇒ ★ **"`31fd3cd^` 的 `/** */` 原貌"在 git 里【不存在】**（原文件从未被提交，转换发生在提交之前）。
**我实际用的证据源（绑定并说明来历）**：**我自己 R8 轮留在仓外的快照** `D:\_tmp\p2r8\old\vibe-math-vmu\kernel\reportfeedback.js`（**7367 B、头注释为 `/** */`（首行即 `/**`）**，系 R8 臂在转换之前拷贝的副本 —— 与 `mut` 那份逐字节相同）。★ **这是本轮唯一可用的"转换前"字节**；若它当时没被留下，这条主张**在仓内无法复核**。
**比较方法（只归一标记与空行，不做别的改写）**：取 `export` 之前的头注释，逐行剥 `//`／`/**`／`*/`／前导 `*`，去空行，得到"文本行"序列；**首行标题单列比较**，其余作为"正文"逐行比。
```
candidate (pre-conversion /** */): 34 text lines   title = "ROUND 8 (phase 2, A1 step 1) — THE SHAPE AND BOUNDS OF ONE REPORT-FEEDBACK RECEIPT."
committed  (// form)             : 34 text lines   title = "vmu kernel · reportfeedback — THE SHAPE AND BOUNDS OF ONE REPORT-FEEDBACK RECEIPT (round 8, phase 2, A1 step 1)."
★ body lines (title excluded): cand=33  cur=33
★ FIRST body-line difference: NONE — the body is line-for-line identical
★★ whole body text identical: true   (cand chars=2984, cur chars=2984)
★ title first divergence at char 0（标题整句被改写，与你声明一致：模块名＋轮次进标题）
```
⇒ ★ **判定："只有标记与首行变了、正文逐句等价"成立** —— 而且比"逐句等价"更强：**正文是字符级相同**（不是"意思相同"）。★ **没有发现任何一句的意思被改动**。
★ **建议（不代改）**：以后这类"机械转换"应当**让转换前形态进 git**（单独一笔或先提交原形）—— 否则**只有复核者手里那份临时副本**能证明无损，一旦临时目录被清理，该主张就**不可复核**（与本项目"读数必须可被别人重算"同一条）。

## 2. ★★ ② `EXPECT_NA` 的裁定：**我同意**（依据＝实测导出面，不是注释）
**我实测的导出面**（`import()` 后逐个取 `typeof`，不是读注释）：
```
exports = 10
  4 函数 : assertFiniteOrder, boundFeedback, reportFeedbackFailure, reportFeedbackReceipt
  6 常量 : REPORT_FEEDBACK_CONTEXT_NAME(string) / _CONTEXT_ORDER(number) / _KEYS(object, frozen)
           / _MAX_BYTES(number) / _WHAT_AUDIENCE(string) / _WHAT_CONTEXT(string)
★ any create* factory: false
★ any service-ish surface (status|on|effect|ctx|start|stop|dispose|apply|register): 0
```
**判据侧的证据**：`scripts/generate-zero-mechanism-matrix.mjs:30` 的**闭集**＝"形状 ✓／`EXPECT_UNDECIDED`（显式待办）／`EXPECT_NA`（非服务模块）"；`:237` 把**没有机制、没有可探针物**的模块路由到 `EXPECT_NA`；同族的先例就在旁边：**`receiptbounds`（:179）**——**纯函数工具模块、无 `create*` 工厂 ⇒ 矩阵不适用**，且它也是"抽取/新增后必须有一行裁定"被**强制**登记的（`:188 出现了却没有裁定行 ✗`）。运行读数：**`--check` exit=0**、`99 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED, 9 probe-errors, 6 n/a`**（`6 n/a` 与 `EXPECT_NA` 行数一致）⇒ **登记与产物 in sync** ✓。
⇒ ★ **我的判定：`EXPECT_NA` 正确**（不是"形状 ✓"，因为没有服务对象可形状断言；也不是 `EXPECT_UNDECIDED`，因为它**不是待办**——模块的**形状**已确定，未接线的是**装配**，那由 §③ 的那行 docs 具名）。
★ **一处我加的限定（与你自己写的 `:189-190` 一致）**：该行是**新增模块被强制裁定**的结果，**作者的第二步（接线）落地后必须复核** —— 届时若长出**服务/`status()`/可探针物**，登记值要改（例如变成"形状 ✓"）；那句"待作者第二步复核"**必须保留**，否则这行就会变成"一次性裁定的永久化"。
★ 另外一点（不影响裁定）：`assertFiniteOrder` **会抛具名码** `VMU_MIDDLEWARE_FAILED` —— 那是**纯函数的拒绝**，**不是**可探针的服务面（对照：`guard`／`library-policy` 同样是 `EXPECT_NA`）。

## 3. ★ ③ planned-code registry：机制成立 ＋ **HEAD 本来就是 in sync**
**(a) 干净 HEAD 副本（我自己建，未做任何 git 写）**：`git archive --format=tar HEAD` → `tar -xf` 到 `D:\_tmp\p2r9\head`（★ 不用 `git worktree add`，那会在 `.git/` 里写东西）：
```
CLEAN HEAD  generate-planned-codes --check exit=0
CLEAN HEAD  regen-all --check             exit=0   ⇒ "vmu regen-all: 15/15 in sync"
CLEAN HEAD  audit-kernel-index            exit=0   ⇒ "KERNEL INDEX: 6 passed, 0 failed"
WORKTREE    generate-planned-codes --check exit=0 / regen-all --check 15/15
```
⇒ ★ **"HEAD 是 in sync"成立**（干净副本与工作树**都** 15/15）⇒ ★ **你遇到的陈旧是【本轮】**（新模块进来导致载体表变化），**不是先有的** ✓。
**(b) 两个码的载体表（只取"载体行"＝点名 `vibe-math-vmu/…` 路径的那一行；★ docs/03 里同一个码出现在**多张表**，见 §5 我的仪器失误）**：
```
VMU_EXTERNAL_UNAVAILABLE : BEFORE(beef759) 7 carriers → AFTER(HEAD) 8   added=["vibe-math-vmu/kernel/reportfeedback.js"]  removed=[]
VMU_MIDDLEWARE_FAILED    : BEFORE(beef759) 17 carriers → AFTER(HEAD) 18  added=["vibe-math-vmu/kernel/reportfeedback.js"]  removed=[]
★ 两处都：新增恰好是那个新模块、无删除、状态列不变（仍 **已实现 ✓**）
```
⇒ ★ **你读的那条机制（"新模块是两个【已登记】码的新载体"）成立**，且**没有新造码**（`reportfeedbackFailure` 复用 `VMU_EXTERNAL_UNAVAILABLE`、`assertFiniteOrder` 复用 `VMU_MIDDLEWARE_FAILED`，与代码一致）✓。

## 4. 顺带项（我实跑）
- `node scripts/generate-kernel-index.mjs --check` ⇒ **`kernel-index: docs/02 matches the kernel (99 modules, 0 headerless)`** ✓（与你给的读数一致，且 `reportfeedback` 在列）
- `node tests/audit-kernel-index.test.mjs` ⇒ **exit=0（6 passed / 0 failed）** ✓
- `node scripts/regen-all.mjs --check` ⇒ **`vmu regen-all: 15/15 in sync`，exit=0** ✓（干净 HEAD 副本同）
- `vibe-math-vmu/host.js` ⇒ **1167 行 ≤ 1200** ✓；`tests/run-tests.mjs` blob ⇒ **`B988AF9351E9219C`（未变）** ✓

## 5. 我自己的三处仪器失误（具名；结论均已用修正后的量法重取）
1. ★ **PowerShell 不因 `git cat-file` 非零退出而抛** ⇒ 我第一版"逐个提交查该文件是否存在"的循环把**没有该文件的提交**也打印成 `has-file`（`.NET`/`git` 的非零退出在 PS 里不是终止错误，我的 `try/catch` 抓不到）⇒ 我改用**单次 `git cat-file` 的显式报错**与 `git log --all -- <path>` 定案。（同族：**先证明你量的是哪个对象**。）
2. ★ **行对齐假象**：头注释对比第一版把"标题从第 2 行挪到第 1 行"当成 41 处逐行差异 ⇒ 全是**我的对齐噪声**；改为"**先去标记与空行、标题单列、正文逐行**"后，真实结论是**正文 0 差异**。（同族：**比较前先确认比的是哪两份、以及要不要先归一**。）
3. ★ **载体行选择器写松**：`^| \`CODE\` |` 在 `docs/03` 会先命中**语义表**（`| \`VMU_EXTERNAL_UNAVAILABLE\` | 外部对象/远端后端不可达 | …`），我第一版因此报出 `carriers=1`、`status=外部对象…` 的**假读数**；改为"**该行必须点名 `vibe-math-vmu/` 路径**"后才是载体表。

## 6. 没核 / 未做（与"核了"分开写）
1. **没核**：`/** */ → //` 转换的**脚本本体**（你没有把该机械脚本交给我读）⇒ 我核的是**输入与输出的等价性**，**不是转换器实现**（两者是不同的主张）。
2. **没核**：`reportfeedback` 的**第二步接线**（设置键／真读取／回执）—— 尚未落地；本轮的 `EXPECT_NA` 只对**当前形状**成立（见 §2 的限定）。
3. **未做**：任何仓内代码/测试/生成物改动（本轮真树只新增本报告）；`regen-all` **写**与全量 sweep＝**归 Lead**。
4. **未核**：`17-objective-status.md` 与 `phase2-accept-round9.md`／`phase2-pack-round9-a1-wiring2.md`（报告时刻**在飞**，我只读到了它们的**文件名与状态**，**没有读内容**）。
