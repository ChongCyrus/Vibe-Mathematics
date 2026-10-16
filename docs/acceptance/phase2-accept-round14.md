# Phase 2 · `vmu-accept` · Round 14：并入 R12/R13（Part A 独立复核 7/7 ＋ Part B provider 半边 ＋ 纪律 36/37 确认、38 新立）

> **交付物**：① 总账 `docs/acceptance/17-objective-status.md`；② 本报告（★ 本报告**未跟踪** ⇒ `git ls-files` 门禁此刻看不见它，§5.9-24 的自指现场）。
> **纪律**：**只读**（侦察＋结构核实）＋ **只写**总账与本报告；★ **未跑全量（T0/T1 归 Lead）／未跑 `regen-all`（明令禁止）／未做任何 git 写**。

## 0. 哪一次运行、哪一版文件

| 项 | 值 |
|---|---|
| HEAD | **`2908308`**（*feat(vmu): thread the report-feedback provider through the kernel so the entry can complete the loop*） |
| 提交面（我实读） | **`7cbf4d9..2908308` ＝ 3 files, +76/−3**（`kernel/index.js` 10／总账 8／我的 R12 报告 61） |
| 工作树 | 只有我自己的两处写入（未提交）＋ ★ **`?? docs/acceptance/phase2-verify-round12.md`**（独立复核报告） |
| 我的窗口 | 2026-10-16 **11:1x – 11:3x** |

## 1. ★ 我本轮第一手核到的

| 我核的 | 读数 |
|---|---|
| `createKernel` 接受 `reportFeedback = null` | ★ **`vibe-math-vmu/kernel/index.js:288 reportFeedback = null,`** ✓ |
| 装配点在哪 | ★ **`:913 feedback: typeof reportFeedback === 'function' ? reportFeedback : (c) => reportFeedbackFailure({…})`** ⇒ ★ **行号从 R12 我读到的 `:905` 漂到 `:913`** ⇒ ★ 我按**我读到的**记并注明（★ §5.9-1／24 的日常形态） |
| ★★ **(b) 声明与行为不一致（我独立确认）** | ★ `settings/schema.js` 该键 `doc` 原文含 **"开关开而受众为空时具名失败，不静默"**；★ 代码路径只有 **`report.js:121` 读值（默认 `''`）** → **`reportfeedback.js:85` 把空串映成 `null`**；★ **`REPORT_FEEDBACK_WHAT_AUDIENCE = 'report.audience'`（`reportfeedback.js:57`）存在，却没有为"开关开＋受众空"抛出任何失败** ✓ ⇒ **声明承诺了一个不存在的失败**（★ 正因如此，**这条不该被写成"文档小瑕疵"**：`doc` 是本仓**给读者看的契约**） |

## 2. ① Part A 独立复核：**七项全过**（★ 读数为【独立复核】）

★ **① 两键** ✅（diff **只 +5 行**；`boolean/def false`／`string/def ''`；`doc` 非空；★ **`packs/**` 两键 0 命中、且 packs 无 `report:` 设置块** ⇒ **没有任何 pack 默认被翻**）／**② 真读取端到端** ✅（★ **它自己的真入口探针**：`feedback:true` ⇒ `enabled:false→true`、`source→'settings:vmu.report.feedback'`、`audience:null→'m1'`；★ 判据句＝**"登记值本身不会让回执变"**）／**③ 落在 `status()`** ✅（★ **它的探针只能从 `kernel.report.status()` 取到** ⇒ ★ **佐证我 R12 的自陈**："第一版放错函数、**328 套件全绿**"—— ★ **这类错位只有真入口能抓**）／**④ 注入 vs 导入四项** ✅（import **0**／套件 **93/0**／装配点提供 provider／★★ **副本反例**：**给回退插 `throw` ⇒ 真入口照常拿回执（回退未执行）**；**去掉注入 ⇒ 真入口抛 `★ FALLBACK EXECUTED (no provider)`**）／**④+ 两处形状 9/9 逐字一致** ✅ ＋ ★★ **残余：两者是【手工镜像】、无任何断言钉住** ⇒ **今天一致、将来可能静默漂移**（★ **注释不是断言**）／**⑤ 值正确** ✅／**⑥ 两态同形** ✅（**9 键、集合与顺序相同、无条件键**）／**⑦ 派生检查** ✅（`regen-all` **15/15**；`audit-package-membership` **29/0**）。

## 3. ★★ ④ Part B：**只有 provider 半边**（★ 状态如实写成两半）

★ **已落**：`createKernel` 接受 **`reportFeedback = null`**（**`:288`**）→ 透传 `createReport`；★ **有 provider 用它／没有保持占位**（**占位 `reason` 仍是真话**）；★ 实测：**传入 provider ⇒ 回执 9 字段原样**／**不传 ⇒ 9 键仍在且 `reason` 如实**；★ `report.js` **import 仍 0**；`vmu-assistant-report` **93/0**／`vmu-kernel` **175/0**／`regen-all` **15/15**／**T1 328/328**。
★★ **未落**：**入口那次 `context()` 调用** ⇒ ★★ **总账里写的是"Part B 的 provider 半边已落；入口那次 `context()` 调用未落"，不许写成"Part B 已落"**。

## 4. ⑤ R11 谓词修复：独立复核为**已修**（照录）

**GAP A**：R11 前**无 `诊断:` 行** ⇒ 现**恰好 1 行**（`（子进程无输出）status=1 signal=null`）、父 exit=2 ⇒ **字段集合不再随失败形态变**；**多条 `Error:`** ⇒ 现取**最后**那条 ⇒ **采纳 R10 的裁定**；**GAP B** ⇒ `诊断: FATAL ERROR: Reached heap limit…` ⇒ **已修**；★ **STALE 路径 pre/post 逐字节相同**（stderr 同 sha **`F160BA148B34D6BA`**，★ **与它 R8 量到的相同** ⇒ 该路径**跨 R7→R8→R11 未动**）、**行首空格保留**（`.trim()` 踩坑已避开）；套件 **11→16**。
★ **它具名的边界读数（照录，★ 不升级为缺陷）**：`process.abort()` 的**原生转储仍是裸帧** ⇒ **未覆盖**，但★ **该输入是构造性的**（真生成器走 **OOM**，而 **OOM 已修**）⇒ **记为边界，不作缺陷主张**。

## 5. ②③ 纪律：36/37 确认，38 新立

- ★ **36【不变量可能以【门】的形式存在，而不是以注释的形式】**（确认；★ 新意＝不变量可以是**结构性**的：import 数／依赖方向／行数预算）。
- ★ **37【字段要对真正读它的那个东西检查】**（确认；★ **"落进某个函数" ≠ "落进读取者看的那个函数"**；★ **套件全绿 ≠ 功能可用**，与 #9 **互为镜像**；★ **R14 独立复核追加佐证**：放错函数时 **328 套件全绿**，只有真入口能抓）。
- ★★ **38【"判断做不完的人"与"动手的人"可以是两个人，但功劳与责任要分开写】**（★ 我在 R12 自提、本轮采纳入册）：Part A ＝ **补丁作者 `vmu-pack2`／执行者 Lead**；★ 理由＝**只写一个人会同时抹掉功劳与责任**（与 §5.9-14③「转述要注明来源」同族：**署名也是一种来源标注**）。

## 6. 诚实边界

1. ★ **未做 git 写**；★ **未跑 T0/T1/`regen-all`／未跑那些套件与两个真入口探针**（★ 那些读数是 **Lead 的 / `vmu-verify2` 的**）。
2. ★ **我实读的只有结构**：`reportFeedback = null`（`:288`）、装配点（**我读到 `:913`**，与 R12 的 `:905` **不同 → 行号漂移**）、两键 `doc`、以及 **(b) 的声明/行为不一致**（★ 这条是**我的第一手确认**）。
3. ★ **本报告未跟踪** ⇒ 提交前请 **先 `git add`**；★ 并按 **§5.9-32**：**先收口提交、再派下一轮**。
