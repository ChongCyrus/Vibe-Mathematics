# dsh-vibe-math 2.7.0 — 发布说明（中文）

> 上一版：2.6.0。本版新增两块能力：**Lean 增量形式化（异步编译 + `import` 复用）** 与
> **`math_computation` 数学计算工具**（四套预设共享同一实现）。既有参数默认值、数据格式与目录结构
> **未变**（只是新增参数与目录），DSH 支撑窗口不变，无需迁移。

---

## 概览

- **Lean 增量形式化**：`leanAsync`（默认 `true`）把编译放后台队列，入队即返回；新增并发上限
  `leanJobsMaxParallel`（默认 `1`）、日常主动性 `leanInitiative`（`off|normal|eager`，默认 `normal`）
  与额外搜索路径 `leanSearchPaths`（默认 `[]`）。新增只读工具 `lean_read` / `lean_job`，
  作业镜像写 `Formal/Jobs/<jobId>.json`。
- **`math_computation`（新工具）**：先用 `op:'probe'` 预检引擎/包/许可，再 `op:'run'` 计算，
  每次执行都归档成可复核回执；`op:'install'` 走"计划 → 确认"两段式，`op:'receipt'` 只读复核。
- **引擎**：`python` / `r` / `octave` / `julia` / `matlab` / `maple` / `wolfram` / `cli`。
  商业三家**只探测与查许可，永不代装**；`cli` 默认开启（两个文档化的关闭路径）。
- **归档→编辑→重跑**：回执带 `scriptPath`/`scriptHash`；改动脚本后必须用 `mode:'file'` 重跑，
  旧回执对修改后的代码无效（`scriptChanged` / `scriptChangedDuringRun` 显式告警）。
- **六个新参数**：`mathComputation` / `mathMode` / `mathEngines` / `mathTimeoutMs` / `mathPackages` /
  `mathInstallScope`（README 双语参数表与 `docs/math-computation.md` 为准）。
- 本版经过**四轮独立审查** + 冻结提交上的**真机打包/启动认证**；门禁 `TOTAL 65  PASS 65  FAIL 0`
  （44 套件 + 21 探针）。

## 变更

### 1. Lean 增量形式化 + 异步编译 + `import` 复用

- **新参数**（四套一致，默认值即"安全且不改变既有行为"）：
  - `leanAsync`：默认 `true`。`true` = 编译进**每会话后台队列**，入队即返回；`false` = 同步 `await`（旧语义）。
  - `leanJobsMaxParallel`：默认 `1`（串行）。后台编译的并发上限。
  - `leanInitiative`：`off | normal | eager`，默认 `normal`。**日常流程中的形式化主动性**。
  - `leanSearchPaths`：默认 `[]`。额外的 `--search-path` 根；非空时**先**注入它们，**再**注入自动根。
- **队列状态机**：作业有明确的状态迁移；**只有 `settled(ok)` 才算 passed**——"入队成功/正在编译"
  一律不计入通过，也不会被当成已证。
- **`import` 复用**：编译命令自动注入 `--search-path <VibeMath 根>`，因此
  `import Formal.Lib.<name>` 与 `Formal.Proved.<name>` 可以直接工作（跨项目复用已归档的定义/引理）。
- **新只读工具**：`lean_read`（读归档/库内容）与 `lean_job`（查作业状态），都是**只读**，不会触发编译。
- **作业镜像**：每个作业在 `Formal/Jobs/<jobId>.json` 留一份镜像，进程重启后可恢复或显式中断。
- **诚实说明**：`leanInitiative` 与 `formalVerify` 是**两条独立的轴**。
  `formalVerify:'off'` 关闭的是**验证阶段**，不会吞掉主动性轴：
  `off + normal` ⇒ 一个字都不提 Lean；`off + eager` ⇒ **只**出现日线（主动性提示），验证段仍然关闭。

### 2. 新工具 `math_computation`

- **六个冻结参数**（名字不可改；四套、README 双语表、契约文档拼写一致）：
  | 参数 | 默认 | 说明 |
  |---|---|---|
  | `mathComputation` | `auto` | `off`（真 no-op）/ `auto`（探测到才工作）/ `on` |
  | `mathMode` | `typed+shell` | **提示词策略**：`typed` 不提 shell 且禁用 `engine:'cli'` |
  | `mathEngines` | `[python,r,octave,julia,matlab,maple,wolfram,cli]` | 允许/探测顺序；去掉 `cli` 即关闭逃生口 |
  | `mathTimeoutMs` | `60000` | 单次上限（最小 1000）；超时**主动终止**进程 |
  | `mathPackages` | `[]` | 默认要求的包；缺包只报告 + 给计划，**不自动装** |
  | `mathInstallScope` | `user` | 安装作用域；`system` 必须每次显式指定、**不被记住** |
- **`op`**：`probe`（预检引擎/版本/包/许可）、`run`（`mode: code|file|expr`）、`receipt`（只读复核）、
  `install`（两段式安装）。
- **失败码（11 个，冻结）**：`MATH_NOT_AVAILABLE`、`MATH_ENGINE_NOT_FOUND`、`MATH_ENGINE_LICENSE_REQUIRED`、
  `MATH_ENGINE_UNUSABLE`、`MATH_MISSING_PACKAGES`、`MATH_TIMEOUT`、`MATH_NONZERO_EXIT`、
  `MATH_ENGINE_BAD_ARGV`、`MATH_REFUSED`、`MATH_INVALID_ARGUMENT`、`MATH_NO_SUBPROCESS`；
  每个都带机读 `next`（`user-install` / `agent-install` / `vendor` / `enable` / `engine-override` /
  `reason` / `note`）。
- **确定性回执**：`runId` 只由"预设 + 项目 + 引擎 + 模式 + 键 + 排序后的包"决定，**不含墙钟**；
  `argv` 在回执与返回体里**双回显**（可照抄复跑）；`stdout`/`stderr` 全量落盘、返回体截 64KB。
- **引擎**：`python`/`r`/`octave`/`julia` 为自由引擎；`matlab`/`maple`/`wolfram` 为**商业**——
  只做探测与许可检查，**永不代装**（只给厂商指引）；`cli` 用你指定的命令执行，仍受本工具的超时、
  输出上限、cwd 与回执约束。
- **两条安装路径**：① 用户自装（逐 OS 命令 + 官方链接）；② 代理代装 `plan → planToken → confirm`
  （token 绑定计划内容，内容变了即失效）。默认 **user 作用域**，`system` **每次都要显式确认**；
  每次执行写审计 `Computation/installs/<planToken>.json`（含确切命令、退出码、before/after
  与**卸载命令模板**）。包安装**没有通用回滚**——工具保证的是"命令与版本可核验 + 卸载模板"，
  不做自动回滚。
- **`cli` 默认开启**（它不比模型本来就有的宿主 shell 更大，但多了回执与上限）；两个关闭路径：
  `mathMode:'typed'`，或把 `'cli'` 从 `mathEngines` 移除——两者都返回 `MATH_REFUSED`。
- **归档→编辑→重跑（完整性保证）**：
  - 返回体与回执都带 `scriptPath`/`scriptHash`；脚本原件可以打开/编辑；
  - 编辑后用 `mode:'file'` 重跑 ⇒ **新回执**（新 attempt、新哈希）；**旧回执不代表修改后的代码**；
  - `scriptChanged`（与上一份回执的哈希不一致）、`scriptChangedDuringRun`（运行期间被改动）都会
    **显式告警**并写进回执；
  - 归档是**追加式**的（`Computation/<id>/`，第 n≥2 次进 `attempts/<n>/`），已有文件**永不覆盖**；
  - 保留上限（20 attempt / 200 run）**只告警、永不自动删除**；手改状态文件里的未知参数键会被
    **报告**（`diagnostics`），不静默丢弃。

### 3. 诚实边界（务必读）

- **引擎执行只用假 subprocess seam 验证**：本机**没有**跑过真实的 python/R/octave/julia/matlab/
  maple/wolfram；真机验证需要一台装有这些引擎的机器（模板、许可探测与安装计划的**静态面**已被守卫冻结）。
- **插件不能强制禁网/限权**：宿主 `subprocess.spawn` **没有 policy 槽**（`env` 层只做凭据/`DSH_*`
  清洗，不能限制网络或写盘）；真强制需要宿主 sandbox 支持，**列为待上游需求**。
- **商业模板标 `VERIFY`**：Maple（尤甚）、MATLAB、Wolfram 的 CLI 模板随版本变化，描述符带 `VERIFY`
  标记；每次运行都回显实际 argv，用法/选项错会返回 `MATH_ENGINE_BAD_ARGV` 并提示用
  `mathEngineOverride` 覆盖模板（而不是裸 `MATH_NONZERO_EXIT`）。有许可的机器应自行验证这三个模板。
- **SageMath 属于 P2**：本版只有描述符占位，不接入。
- **两个对照实验以 run-book 形式给出**（同步 vs 异步编译；不使用 vs 使用 `import` 复用）：
  本说明**不含**任何编造的实测数字，也不声称已完成真实 Lean 语料的对比。

### 4. 审查与验证

本版经过 **四轮独立审查**（对抗性再证伪、交叉审计、用户上手路径、新视角复审），
并在**冻结提交上**完成**真机打包/启动认证**；门禁为 `TOTAL 65  PASS 65  FAIL 0`
（**44 套件 + 21 探针**），另有 22 个模块级变异探针要求"具名断言变红"。

## 兼容性

- 既有参数默认值、数据格式与目录结构**未变**；新增参数都取"不改变既有行为"的默认值
  （`leanAsync=true` 只是把编译改为后台队列，`leanInitiative='normal'` 保持原有主动性）。
- 新增目录 `Computation/` 与 `Formal/Jobs/`；宿主的文本写会**自动创建缺失的父目录**，
  无需预先手工建目录。
- DSH 支撑窗口不变（`>=0.1.7` 的 patch 行 + `<=0.1.6` 的目录行两条安装线都随包发布共享模块）。

## 升级

- 直接升级即可，**无需迁移**：没有改名的参数、没有改格式的状态文件。
- 想关闭新能力：`mathComputation:'off'`（真 no-op）、`leanAsync:false`（回到同步编译）、
  `leanInitiative:'off'`（不主动形式化）。
