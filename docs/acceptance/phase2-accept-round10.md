# Phase 2 · `vmu-accept` · Round 10：并入 R9（两处干预已独立核实 ＋ 一处前提被推翻 ＋ 纪律 34）

> **交付物**：① 总账 `docs/acceptance/17-objective-status.md`；② 本报告。★ **本报告未跟踪**（`git ls-files` 门禁此刻看不见它 —— §5.9-24 的自指现场）。
> **纪律**：**只读**（侦察＋机械复算）＋ **只写**总账与本报告；★ **未跑全量（T0/T1 归 Lead）／未跑 `regen-all`（明令禁止）／未做任何 git 写**。

## 0. 哪一次运行、哪一版文件

| 项 | 值 |
|---|---|
| HEAD | **`4e5b3d9`**（*docs(acceptance): verify the Lead's two round-close interventions, and correct the premise one of them rested on*） |
| 提交面（我实读） | **4 files, +223/−2**：`docs/acceptance/17-objective-status.md` 22／`phase2-accept-round9.md` 56／`phase2-pack-round9-a1-wiring2.md` 70／`phase2-verify-round9.md` 77 ⇒ ★ **只有 docs／报告** |
| 工作树 | ★ **clean**（我 09:5x 读）；★ 期间另有 **`?? docs/acceptance/phase2-pack-round10-a1-wire.md`**（**下一轮写者已落地**） |
| 我的窗口 | 2026-10-16 **09:5x – 10:0x** |

## 1. ★★ ① 头注释转换：**我独立核了那条前提，并自己比了一遍**

**前提核实（★ 我最想确认的一点）**：`git log --all --oneline -- vibe-math-vmu/kernel/reportfeedback.js` ⇒ ★ **只有 `31fd3cd` 一笔** ⇒ ★ **`/** */` 原形【从未进 git】**（该文件是**新增**，**父提交里没有该路径**）⇒ ★ **Lead 指定的"拿 `31fd3cd^` 的原貌比"这个比较【不可能做】** —— ★ **这条前提被推翻，我独立确认**。

**唯一存活的"转换前"字节**（★ **我找到了它**）：`D:\_tmp\p2r8\old\vibe-math-vmu\kernel\reportfeedback.js`，**7,367 B**，首行 `/**`（★ 另有一份同样 7,367 B 的 `D:\_tmp\p2r8\mut\…`）。

**我自己的比较**（探针 `D:\_tmp\r10-accept\probe-lossless3.mjs`：去注释标记 ＋ 去空行 ＋ 排除标题行）：

| 项 | 读数 |
|---|---|
| 去标记去空行后的行数 | **OLD 33 ／ NEW 33**（★ 与"两侧各 33 行"一致） |
| **正文（去标题）** | **两侧各 32 行／2 958 字符** |
| ★★ **逐行相同** | **true** |
| ★★ **逐字符相同** | **true** |
| ★★ **差异行数** | **0** |
| **唯一变化** | **首行标题**：`ROUND 8 (phase 2, A1 step 1) — THE SHAPE AND BOUNDS OF ONE REPORT-FEEDBACK RECEIPT.` → `vmu kernel · reportfeedback — THE SHAPE AND BOUNDS OF ONE REPORT-FEEDBACK RECEIPT (round 8, phase 2, A1 step 1).` |

★ **口径注（我明写我自己的口径）**：复核者报的是 **2 984 字符**，我算的是 **2 958** —— ★ **差 26 字符来自归一化口径**（是否计入标题行／空行／换行符）；★ **结论同向：正文逐行逐字符相同，唯一变化是标题行**。

### 1.1 ★★ 我自己的仪器失误（同一族第三次，如实记）

我**第一版**探针拿"**整文件去掉第 1 行**"去比 ⇒ 报 **`body IDENTICAL = false`**、`first difference at index 0`。★ 原因**不是**转换有损：旧格式的第一行是 `/**`、正文每行还带 ` * ` 前缀、末尾有 ` */` ⇒ ★ **我比错了对象**。★ **看去掉标记后的形状**才发现（★ **与复核者自陈的失误 (2) 同族**，也与我在总账里记的 **§5.9-31** 同族）⇒ ★ **我把这条也写进了总账**（"我自己本轮也踩同族"）。

## 2. ② `EXPECT_NA`：独立同意（依据＝实测导出面）

★ **10 个导出＝4 纯函数**（`assertFiniteOrder`／`reportFeedbackReceipt`／`reportFeedbackFailure`／`boundFeedback`）＋ **6 常量**；★ **`create*` 工厂 ＝ false**；★ **服务面（`status`/`on`/`effect`/`ctx`/`start`/`stop`/`dispose`/`apply`/`register`）＝ 0**；★ 运行 **`99 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED, 9 probe-errors, 6 n/a`**（**`6 n/a` ↔ `EXPECT_NA` 行数一致**）⇒ **登记与产物 in sync**。★ **限定已入册**：该行由"**新增模块必须被裁定**"**强制产生** ⇒ **第二步（接线）落地后必须复核**；★ **"待作者第二步复核"那句必须保留**（否则**一次性裁定被永久化**）。

## 3. ③ 第三处干预的机制：独立核实成立

★ **干净 HEAD 副本**（`git archive HEAD`→`tar -xf`，★ **刻意不用 `git worktree add`**，因为那会**写 `.git/`**）：`generate-planned-codes --check` **exit 0**、`regen-all --check` **15/15**、`audit-kernel-index` **6/0** ⇒ ★ **"HEAD 本就 in sync"成立 ⇒ 陈旧是本轮的**；★ **载体表**：`VMU_EXTERNAL_UNAVAILABLE` **7→8**／`VMU_MIDDLEWARE_FAILED` **17→18**，**新增恰好 `kernel/reportfeedback.js`、无删除**、状态仍 **已实现 ✓** ⇒ **未新造码** ✓。

## 4. ④ 复核者自陈的三处仪器失误（已照录进纪律族，归入已有族）

| # | 失误 | 归族 |
|---|---|---|
| (1) | **PowerShell 不因 `git cat-file` 非零退出而抛** ⇒ 逐提交存在性检查把**没有该文件的提交**印成 `has-file` | ★ **§5.9-1**（先证明**你在量哪个对象**） |
| (2) | **行对齐假象**：标题上移一行被当成 **41 处差异**，归一后 **0** | ★ **§5.9-31**（★ ★ **我自己本轮也踩同族**，见 §1.1） |
| (3) | **选择器写松**：`^| \`CODE\` \|` 先命中 `docs/03` 的**语义表** ⇒ 假读数 `carriers=1／status=外部对象…` | ★ **§5.9-12 家族** ＋ 加一句"**选择器要窄到只命中目标那张表**" |

## 5. ⑤⑥ 门禁与 A1（归属分开）

- ★ **Lead 实跑（转述）**：T0 **25/25**；**`regen-all --check` 15/15**；★ **T1 未重跑且不需要**（★ 它 `git diff` 核过：**零个代码文件与 T1 通过那个提交不同**）⇒ ★ **本提交只有 docs／报告**。★ **我没有跑它们**（`regen-all`／T0／T1 均不在我范围）。
- ★ **复核者实跑（转述）**：`generate-kernel-index --check`（**`99 modules, 0 headerless`**）、`audit-kernel-index` **6/0**、`regen-all --check` **15/15**、`host.js` **1167 ≤ 1200**、`run-tests.mjs` blob **未变**。
- ★ **我实跑**：`audit-table-integrity` **EXIT=0**；两条探针（v1 失败／v3 成功，均如实记）。
- ★ **A1（照录）**：**步骤 2／4 连续三轮未开工** —— 原因＝**判据是原子性的**（只做 2 ＝ **"声明了却不生效"**）而预算不足以一次做完 ⇒ **"不开始＋说明"是唯一不构成半截的选择**、**零仓内改动**；★ **R10 已把范围砍到最小（只做 2＋4）**并派它做。

## 6. 诚实边界

1. ★ **未做 git 写**（我的两处写入**未提交**）；★ **未跑 T0/T1/`regen-all`**。
2. ★ **①的"转换前"字节不是 git 对象** —— 我用的是**复核者的仓外快照**（7,367 B）；★ 因此**我也只能证明"那份快照与提交版正文一致"**，★ **不能证明"那份快照就是当初被转换的字节"**（★ **这正是纪律 34 要防的不可复核性**）。★ 我能独立确认的是：**该路径在 git 里只有一笔提交**（原形从未进 git）。
3. ★ **②③⑤ 的数字是转述**（复核者/Lead 实跑）；★ 我实跑的只有 `audit-table-integrity` 与那两条探针。
4. ★ **本报告未跟踪** ⇒ 提交前请 **先 `git add`**；★ 并按 **§5.9-32**：**先收口提交、再派下一轮**（★ 我读到时 `phase2-pack-round10-a1-wire.md` **已在落地**）。
