# Phase 2 · `vmu-accept` · Round 9：并入 R8（A1 第一段 ＋ 三处派生状态缺口 ＋ 纪律 33）

> **交付物**：① 总账 `docs/acceptance/17-objective-status.md`；② 本报告。★ **本报告未跟踪**（`git ls-files` 门禁此刻看不见它 —— §5.9-24 的自指现场）。
> **纪律**：**只读**（侦察＋机械复算）＋ **只写**总账与本报告；★ **未跑全量（T0/T1 归 Lead）／未跑 `regen-all`（明令禁止）／未做任何 git 写**。

## 0. 哪一次运行、哪一版文件

| 项 | 值 |
|---|---|
| HEAD | **`31fd3cd`**（*feat(vmu): land the report-feedback module unwired and named, and close three derived-state gaps that T0 alone does not cover*） |
| 工作树 | ★ **clean**（`git status --porcelain` ＝ **0 行**，09:2x 读）⇒ ★ 与 R7 那次的"在飞写者"不同，本轮读数**直接取自 HEAD** |
| 我的窗口 | 2026-10-16 **09:2x** |
| R8 提交面（我实读） | **9 files changed, 280 insertions(+), 5 deletions(−)**：`vibe-math-vmu/kernel/reportfeedback.js` **+119**／`scripts/generate-zero-mechanism-matrix.mjs` **+7**／`vibe-math-vmu/docs/03-interface-contract.md` **2＋／2−（＝那 4 行）**／`vibe-math-vmu/docs/02-architecture.md` 3／`vibe-math-vmu/docs/11-gates-and-development.md` 3／`installer.js` 1／`package.json` 1／＋两份报告（77／69） |
| 我只读的报告 | `phase2-verify-round8.md`（10,284 B）／`phase2-pack-round8-a1-wiring.md`（6,756 B） |

## 1. ★ 我本轮自己做的机械复算（不是采信）

| 我做的 | 读数 |
|---|---|
| `node tests/audit-kernel-index.test.mjs` | `=== KERNEL INDEX: 6 passed, 0 failed ===`，**EXIT=0** |
| ★ **用生成器【自己的】规则复算 headerless**（照抄 `headerOf`：只收 `//` 开头的行；`headerless`＝ header 长度 < 25） | ★ **`modules=99, headerless=0`** ✓（**与 Lead 的读数逐字相同**） |
| ★ 读生成器源码 | `scripts/generate-kernel-index.mjs`：`:19-28 headerOf`／**`:24 if (t.startsWith('//'))`**／`:37 headerless ＝ header.length < 25` ⇒ ★ **`/** */` 块注释机器看不见**（(c) 的机制**我读码核过**） |
| ★ 读新模块前 4 行 | `vibe-math-vmu/kernel/reportfeedback.js` 开头**已是 `//` 行**（`// vmu kernel · reportfeedback — …`）⇒ **转换确实生效** |
| `git show --stat 31fd3cd` | 见上表（★ `docs/03-interface-contract.md` 的 **2＋／2−** 正是 Lead 说的"**4 行**"） |

## 2. ★★ 本轮最值钱的一条：**派生状态 vs 快速门**（总账 §0.8 ＋ 纪律 §5.9-33）

★ **实测 `T0 PASS` 时 `regen-all --check` 是 `14/15`** ⇒ ★ **只跑快速门就会把两个陈旧生成物提交出去**。三处缺口**全部被 T0 不覆盖的门抓到**：

| # | 缺口 | 机制（★ 先给机制再动数字） | 状态 |
|---|---|---|---|
| **(a)** | planned-code registry（`docs/03-interface-contract.md`，**4 行**） | ★ 新模块是两个**已登记码**的**新载体**（`VMU_EXTERNAL_UNAVAILABLE`／`VMU_MIDDLEWARE_FAILED`）⇒ 登记块需重新生成 | ★ **先证"是本轮的"**（干净 HEAD worktree：该检查 `up to date`／`regen-all` `15/15`）→ **读 4 行 diff 说清机制** → **才 `--write`** |
| **(b)** | 零机制矩阵（生成器 +7 行） | ★ 规则＝"**模块出现了却没有裁定行**"即 FINDING ⇒ **一个模块不许无人裁定** | ★ **Lead 按 `receiptbounds` 先例加 `EXPECT_NA`**（非服务模块闭集值；理由＝**纯函数、无工厂**）＋ **标注"Lead 的读法、待作者复核"** ⇒ ★★ **【Lead 的实质裁定】、未经独立复核 ⇒ 已派 verify2** |
| **(c)** | 内核索引（`headerless`） | ★ 头注释用了 `/** */`，生成器**只收 `//`** ⇒ **机器看不见** | ★ **机械转换（剥标记、原文保留，非重打）**⇒ ★ **我复算 `99/0`**；★ **无损性 ⇒ 已派 verify2 逐句对照（未核）** |

★ **同族**：(c) 与 **R36**「加了 import 把头注释挤到代码之后」同族 —— **本仓的头注释是机器可读的；读者看不见的头＝没有头**。

## 3. A1：第 1 段已落且**明说未接线**

★ **新模块 `vibe-math-vmu/kernel/reportfeedback.js`（119 行）**：**具名字节上限**（`REPORT_FEEDBACK_MAX_BYTES = 65536`，**宿主先例非发明**）／**显式有限 context order ＋ 我们自己的校验**（★ 理由：**宿主只对其中一个注册调用做校验**）／**9 键回执、状态用值**／**具名失败复用已登记码**／**截断自己会说**；★ **两侧都登记**；★ **不碰行数预算将尽的那份文件**。
★★ **"为什么这个停点不是那三种看起来绿的状态"（照录）**：★ 那三条**都是关于【设置键】的** ⇒ ★ **它没有声明任何设置键**（步骤 2 未做）⇒ **不存在"声明了却不生效"**；★ **"模块未接线"在本仓规则下允许 —— 前提是具名** ⇒ **报告就是那个具名**。
★★ **R8 未核项自答**：两个新键**不是生成产物**（对照 `enabled`／`recipients` 都在）⇒ ★ **无需 `HAND_DECLARED_DOMAINS`**，设置那一步**缩成两行手写**。

## 4. ★★ R8 复核把我 R7 那条"没核"闭合了

★ **我 R7 无法测的那条主张**（"STALE 路径字节不动"）**由 verifier 代测且成立**：同一份 stale doc 在 R7 前后两侧 ⇒ **`诊断:` 行逐字节相同 ✓／整条 stderr 逐字节相同 ✓／stdout 也逐字节相同（两侧皆空；`E3B0C44298FC1C14` 是【空串】的 sha256）✓／退出码相同 ✓**。
★ 并给了**唯一**能区分"**回退式放大**"与"**顺手重写**"的反例：**同一变异下只红崩溃两条、STALE 那条断言仍绿** ✓。
★ 它**独立复现了两侧崩溃对照**（`Node.js v24.21.0` → `Error: ENOENT … open '<path>'`），且★ **先建父目录** ⇒ **从结构上排除**了我那次"**错 cwd ⇒ `MODULE_NOT_FOUND`、末行同样是版本横幅**"的**假象**（★ **我的仪器错误被另一种做法排除**）。
★ 它自陈**同族第二次仪器失误**（提取 `诊断:` 的辅助函数没先 trim ⇒ detail JSON 尾带 `\r`）⇒ 与 **§5.9-31** 同族：**两次都是仪器，不是被测物**。

## 5. 门禁与诚实边界

- ★ **我实跑**：`audit-kernel-index` **6/0**；机械复算 **`99／0`**；`audit-table-integrity` **EXIT=0**；`git show --stat`。
- ★ **T0 25/25／T1 `GATE_SCOPE=vmu` 328/328／`regen-all --check` 15/15＝Lead 的读数（转述）**：★ **我没跑**（★ 且 `regen-all` 属**明令禁止**项）⇒ ★ **"T0 绿 / 14-of-15"这条对比我只能引述**（我**没有**自己的那份 14/15 读数）。
- ★ **未核（具名）**：(b) 的 `EXPECT_NA` 裁定是否正确（**待 verify2**）；(c) 转换的**逐句无损性**（**待 verify2**）；A1 模块的**接线**（**明说未做**）。
- ★ **本报告未跟踪** ⇒ 提交前请 **先 `git add`**；★ 并按 **§5.9-32**：**先收口提交、再派下一轮**。
