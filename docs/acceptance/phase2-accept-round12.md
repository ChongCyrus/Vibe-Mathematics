# Phase 2 · `vmu-accept` · Round 12：并入 R11（A1 Part A 落地 ＋ Lead 执行时两个错 ＋ 崩溃谓词两缺口已修）

> **交付物**：① 总账 `docs/acceptance/17-objective-status.md`；② 本报告。★ **本报告未跟踪**（`git ls-files` 门禁此刻看不见它 —— §5.9-24 的自指现场）。
> **纪律**：**只读**（侦察＋代码/结构核实）＋ **只写**总账与本报告；★ **未跑全量（T0/T1 归 Lead）／未跑 `regen-all`（明令禁止）／未做任何 git 写**。

## 0. 哪一次运行、哪一版文件

| 项 | 值 |
|---|---|
| HEAD | **`fcc84f8`**（*feat(vmu): land A1 Part A (the reporting feedback loop's switch and receipt) and fix two holes in the crash-path diagnostic*；`a79efa9..fcc84f8` ＝ **16 files, +455/−18**） |
| 工作树 | ★ **有在飞编辑**：**` M vibe-math-vmu/kernel/report.js`**（**A1 Part B 方向**）＋ 我自己的两处写入（未提交） |
| 我的窗口 | 2026-10-16 **10:5x – 11:0x** |

## 1. ★ 我第一手核到的（不是采信）

| 我核的 | 读数 |
|---|---|
| ★ **(a) 零 import 不变量真的在** | `vibe-math-vmu/kernel/report.js` 的 **`^import ` 行数 ＝ 0** ✓（★ 该文件靠**注入**拿形状） |
| ★ **注入点在哪** | **`vibe-math-vmu/kernel/index.js:905 feedback: (c) => reportFeedbackFailure({…})`** ⇒ ★ **Lead 报的坐标是 `:897`，行号已漂** ⇒ ★ **我按我读到的 `:905` 记**（★ §5.9-1／24 的现场：**引用位置要带版本**） |
| ★★ **(b) 字段到底落在哪个函数** | `const declarations = () => {` **`:280`**／`const status = () => {` **`:573`**／★ **`reportFeedback: feedbackReceipt(c)` 在 `:602`（即 `status()` 内）** ✓（`feedbackReceipt` 定义在 `:143`） |
| ★ **两个新键** | `vibe-math-vmu/settings/schema.js:962 { key: 'vmu.report.feedback', type: 'boolean', def: false, … }`／`:963 { key: 'vmu.report.audience', type: 'string', def: '' … }` ✓ |
| ★ **零 import 是"被门钉住"的** | `tests/vmu-assistant-report.test.mjs` 注释原文：**"the module cannot even reach a decision service (it has no imports at all)"** ⇒ ★ **声明 → 可检查** ✓ |

★ **我实跑**：以上 grep/行号读数 ＋ `audit-table-integrity`（**EXIT=0**）。★ **T0/T1/`regen-all`／两个真入口探针＝Lead 的读数（转述）：我没跑**。

## 2. ★★ ① A1 Part A 已落地（★ **分开署名**）

★ **补丁作者＝`vmu-pack2`；执行者＝Lead** —— ★ 原因是它**连续五轮**判断"一轮落不下"，最终交出**可粘贴补丁**（★ 这条**署名规则**本身值得记：**判断"做不完"的人与动手的人可以是两个人**，但**功劳与责任要分开写**）。
- **两个键**：`vmu.report.feedback`（boolean 默认 `false`）／`vmu.report.audience`（string 默认 `''`）⇒ ★ **只加开关，不翻任何 pack 的默认**。
- **真读取**：`kernel/report.js` 的 `cfg()` 两处 `sget` ⇒ ★ **这才是 W1 要的"有人读"证据**（**不是** `LIVE_READERS` 那行）。
- **回执 9 键恒在**（真入口实测）：**关** ⇒ `enabled:false`／`source:'default'`；**开** ⇒ `enabled:true`／`source:'settings:vmu.report.feedback'`；`delivered:false` ＋ 已登记码 `VMU_EXTERNAL_UNAVAILABLE`；★ **`reason` 明写 "not wired in this build (A1 step 1 Part A)"** ⇒ ★ **不是**"宿主没有该能力"（C1/R5 已证该 API 存在）⇒ ★ **剩 Part B（真正的投递调用）未做**。

## 3. ★★ ② Lead 执行时的两个错（★ 本轮最有价值的现场）

| 错 | 谁抓到的 | 我核到的 | 纪律 |
|---|---|---|---|
| **(a) 写了 `import`** | ★ **被【门】抓红**（`tests/vmu-assistant-report.test.mjs` 的**零 import 不变量**） | ★ **`import` 行数 ＝ 0**（改注入后）；注入点 **`kernel/index.js:905`**；★ **形状仍单源**（`kernel/reportfeedback.js`），★ **唯一一处形状写两遍**＝**无 provider 的内联回退**（已具名） | ★ **§5.9-36「不变量可能以【门】的形式存在，而不是以注释的形式」** |
| **(b) 字段放进 `declarations()`（不是 `status()`）** | ★★ **没有任何门报红（328 个套件全绿）** ⇒ 靠**他自己的 real-entry 探针**发现 | ★ **我实读确认**：字段现在在 **`status()`（`:573`）内的 `:602`**；★ 定位手法＝搜"区分性字段" **`neverDrives`** | ★ **§5.9-37「字段要对【真正读它的那个东西】检查」** |

★★ **(b) 的意义**：★ **"落进某个函数" ≠ "落进读取者看的那个函数"**；★ **套件全绿 ≠ 功能可用** —— ★ 与 **§5.9-9**（**门红了 ≠ 红在被测那一行**）**互为镜像**（这次是"**门全绿 ≠ 被测功能到位**"）。

## 4. ③ 崩溃谓词两类缺口已修（`vmu-comms2`，同一提交）

- ★ **A**：`detail`/`status`/`signal` **一律存在**；`诊断:` 行**恒在**（沉默时打 `（子进程无输出）status=<n> signal=<…>`）⇒ ★ **两态同形**（★ §5.9-7）。
- ★ **B**：**`FATAL ERROR:`／`Assertion` 被识别** ⇒ OOM 报 **`FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`**（**不再是裸地址帧**）★ **与我 R11 的复现读数一致**。
- ★ **分支 2 改为"取最后一条 `Error:`"**（★ 链式错误**根因在后**；R7 取第一条会报**外层包装**）。
- ★ **STALE 路径逐字节不变**：STALE 子进程输出**无这三类行** ⇒ 三分支全落空 ⇒ 走旧规则；★ **＋5 条断言（11→16）** ＋ **副本反例**（**两个变异下 STALE 断言都保持绿** ⇒ **扩大覆盖**，不是改判据）。
- ★ **作者自曝踩坑**：第一版给选中行加 **`.trim()`** ⇒ **剥掉前导空格** ⇒ **STALE 断言当场红**（已改回**逐字保留**）⇒ ★ **"字节不变"是靠这一红被强制的**（★ 又一个"**约束靠反例活着**"的现场，呼应 §5.9-21／-34）。

## 5. ④⑤ 门禁与纪律（归属分开）

- ★ **Lead 实跑（转述）**：T0 **25/25**、`regen-all --check` **15/15**、**T1 328/328**；★ **真入口探针两个**（**面直调**／**装配后**）＝**Lead 自己的读数**。
- ★ **我实跑（R11）**：HEAD-vs-工作树**两侧崩溃测量**（HEAD 报**裸地址帧**／修复后报**有用行**）＋ `git cat-file -e` 判据前两步；★ **R12 我实跑**：上述 grep/行号读数 ＋ `audit-table-integrity` **0**。
- ★ **纪律族 1–37**：本轮新增 **36**（结构不变量可能以门的形式存在）／**37**（字段要对真正读它的东西检查）。

## 6. 诚实边界

1. ★ **未做 git 写**；★ **未跑 T0/T1/`regen-all`／未跑两个真入口探针**（那是 Lead 的读数）。
2. ★ **我核的是【结构与行号】**（import 数、函数归属、键定义、注入点），★ **没有**独立复跑"关／开两态 9 键"的真入口探针 ⇒ ★ **那两条读数是转述**。
3. ★ **注入点行号与 Lead 报的差 8 行**（他 `:897`／我 `:905`）⇒ ★ **我按我读到的记并注明**（★ 这正是 §5.9-1／24 的日常形态）。
4. ★ **本报告未跟踪** ⇒ 提交前请 **先 `git add`**；★ 并按 **§5.9-32**：**先收口提交、再派下一轮**（★ 我读到时 `kernel/report.js` **已有在飞编辑**）。
