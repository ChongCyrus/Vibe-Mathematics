# Phase 2 · `vmu-accept` · Round 15：并入 R14/R15（A1 第一步完成 ＋ 两条新纪律 39/40）

> **交付物**：① 总账 `docs/acceptance/17-objective-status.md`；② 本报告（未跟踪 ⇒ `git ls-files` 门禁此刻看不见它，§5.9-24 的自指现场）。
> **纪律**：**只读**（侦察＋结构实读）＋ **只写**总账与本报告；未跑全量／`regen-all`／git。

## 0. 哪一次运行、哪一版文件

| 项 | 值 |
|---|---|
| HEAD | **`2b3fefe`**（*feat(vmu): complete A1 step 1 - the report-feedback loop now delivers, with four named outcomes*） |
| 提交面（我实读） | **`2908308..2b3fefe` ＝ 18 files, +421/−14**（新模块 `kernel/reportfeedbackdelivery.js` **95 行**／入口 `vibe-math-vmu.js` 改动） |
| 工作树 | 只有我自己的两处写入（**未提交**） |
| 我的窗口 | 2026-10-16 **11:4x – 12:0x** |

## 1. ★ 我第一手核到的三处（★ 两处与 Lead 的读数有【口径差异】）

| 我核的 | 读数 |
|---|---|
| ★ 新模块真的在 | `vibe-math-vmu/kernel/reportfeedbackdelivery.js` ⇒ ★ **我实读 95 行**（Lead 报 **89** ⇒ **行数口径差异**，我按我读到的记） |
| ★ 入口行数 | ★ **我实读 1196 行** ⇒ **≤ 1200** ✓（Lead 报 1205→**1153** ⇒ 同为**口径差异**；★ **两个口径都 ≤ 1200**，所以"预算没破"这一点两方一致） |
| ★★ **(a) 的守卫真在** | ★ **`vibe-math-vmu.js:853`**：`try { reportFeedbackStatus = kernel && kernel.report ? kernel.report.status() : null } catch (e) { … }` ⇒ ★ **"缺面 ⇒ 不投递、不崩"确实落了** ✓ |

★ **我实跑**：以上结构实读 ＋ `audit-table-integrity` **EXIT=0**。★ **T0／T1／`regen-all`／`audit-code-size`／`audit-declaration-criterion`／`vmu-entry`＝Lead 的读数（转述）**。

## 2. A1 第一步＝完成（★ 状态改写，署名保留）

★ **总账已把状态从"Part B 两半"改为【第一步完成】**，并**保留分栏署名**：**Part A 补丁作者＝`vmu-pack2`／Part B 边界作者＝`vmu-pack2`／执行者＝Lead**。
★ **投递调用＝独立顶层块**（★ 不能放进 `if (effectivePrompts.length > 0)` 的提示词注册段 —— 那会**只在有提示词文本的部署里跑** ⇒ **开关开了也不生效**）。
★ **四种具名结局**：**关＝零机制（`code:null`，不编造失败）**／**开而受众空＝具名失败 `report.audience`**（★ **契约级不一致的修复**：该键 `doc` 承诺过"不静默"，而 R14 审计第一手确认代码里原本**没有**这一支）／**宿主不可达或无 `.context`＝具名失败复用 `VMU_EXTERNAL_UNAVAILABLE`＋stderr**／**否则 `delivered:true, registered:true`**。
★★ **投递文本＝运行时快照且明写"不是指令"** ⇒ ★ **"反馈不许增加 P"** —— ★ 这正是当初选**动态 context 通道**、否掉"写进提示词 section"的决定性理由（★ 与 §0.7 C1 的"**内容侧仍未覆盖**"边界一致：**我们只知道我们送了什么，不知道宿主最终让模型看到什么**）。

## 3. ★★ 两条新纪律（39／40）＋ 两条自曝错并入已有族

- **39「一个可选面在入口被【无条件引用】⇒ 会把'没有'变成'崩溃'」**：现场＝第一版 `kernel.report.status()` 无保护 ⇒ `vmu-entry` 报 `Cannot read properties of undefined (reading 'status')`（★ **有的构造里没有 report 面**）⇒ **修法＝守卫**（★ 我核过 `:853`）。★ 同族：36／37／35 —— **先核"对象在不在"，再写"怎么用"**。
- **40「新增要被【裁定】，不能被【吸收】」**：★ **(a)** `audit-declaration-criterion` 的**断言指纹基线**因新测试而红 ⇒ **改【基线】不改【判据】**（审计自己的 `--write-baseline`）⇒ **69／58 条、88/0**；★ **(b)** 新模块 ⇒ **零机制矩阵 FINDING** ⇒ 补 `EXPECT_NA` ＋ **双登记**。★ 同族：33（新增模块必须跑完整派生检查）、11（不许抬阈值消红）。
- ★ **并入已有族的两条自曝错**：★ **`vmu-comms2` 第一版"拿输入不同的两者比"**（报 `differing: [code, what, reason]` —— ★ 那是**零信息结论**；它**当成测试自己的错修掉**）⇒ ★ **与复核者 R12 同一个坑，记为第二个实例**，并入 **§5.9-31／-37 家族**；★ 它**如实记 M2「未取得」**（**不给"回退被执行"的直接证明**）—— ★ **这条"没取得就说没取得"正是 §5.9-14② 的正面现场**。

## 4. ⑤⑥ 门禁与下一轮（归属分开）

★ **Lead 实跑（转述）**：T0 **25/25**／`regen-all --check` **15/15**／**T1 329/329**／`audit-code-size` **9/0**／`audit-declaration-criterion` **88/0**／`vmu-entry` **150/0**；★ **派生计数 397→398、320→321**（新测试）。★ **我实跑**：结构实读 ＋ `audit-table-integrity` **0**（★ **那些套件我没跑**）。
★★ **下一轮（A1 第二步＝显式打开回路跑真机）必须先分开报的一件事**：★ **A 臂回执里 `reportFeedback.delivered` 是否真的 `true`** ⇒ **"回路没送达"与"送达了但模型没用"是两件不同的事**（★ 判据句＝**"有回路之后模型会不会用汇报通道"**）—— ★ 本轮 `vmu-assistant2` 真机**尚无读数**。

## 5. 诚实边界

1. ★ **未做 git 写**；★ **未跑 T0/T1/`regen-all`／未跑那些套件与真机**（那些是 Lead／复核者／`vmu-assistant2` 的读数）。
2. ★ **两处口径差异我如实并列**（新模块 95 vs 89、入口 1196 vs 1153）⇒ ★ **结论一致（都 ≤ 1200），数字不同** ⇒ ★ 我**不把任一方写成"错"**（★ §5.9-31：**先说清比的是哪两份**）。
3. ★ **本报告未跟踪** ⇒ 提交前请 **先 `git add`**；★ 并按 **§5.9-32**：**先收口提交、再派下一轮**。
