# dsh-vibe-math 2.8.5 — 发布说明

> 上一版本：2.8.4。本版是**补丁版**（版本号沿用 2.8.x 线）：以**修复**为主——Lean 形式化通道此前默认无法编译，"装了但不在 PATH"的 TeX 引擎现在能找到，另有几处面向成员提示词的修正；并附带一个**纯增量**的新能力（反馈库，默认开启、默认行为不变）。参数名与默认值、数据格式与目录结构**未变**，DSH 支撑窗口不变，**无需迁移**。

## 概述

- **Lean 形式化通道恢复可用**：此前注入的搜索根旗标拼写对 Lean 4 无效，编译器在**参数解析阶段**就失败（要编译的文件从未被读取），形式化因此永远无法通过；现在注入 `-R <root>`，真机上最小证明可编译并归档，且能被另一名成员读取复用。
- **TeX 引擎"装了但不在 PATH"现在能找到**：新增**有界**的文档化候选根（仍然只查文档化位置、不扫全盘、绝不自动安装、绝不写工作区之外），未检测到时 `triedPaths` 继续**具名**列出实际探测过的路径。
- **提示词不再要求成员做它做不到的事**：缺引擎时改为"如实上报所办（或群聊）"，由所办向用户确认；LaTeX 指引标注**适用范围**；"回执"概念补上背景；空引擎列表措辞不再自相矛盾；面向成员的框架回执标题改为 **【研究所提示】**；面向代理的文本不再出现盘符字面量。
- **新增合作/管理/工作经验反馈库**（v5）：把"怎么一起工作"记下来并闭环——`self`/`team` 路由**自我调整即可、无需审批**，`interpersonal` 路由需要先评估、事后再**回填验证**；开关 `feedback`（默认 `on`）。
- **安装与升级的两个坑写清了**：`dsh plugin …` 的插件管理**需要一个可用的 `pnpm`**；安装/升级**请给显式版本**（不带版本可能装到旧版）。
- 维护者向：新增/加强了一批跨四套预设的静态不变式与具名变异自检；门禁与"宿主是否安装 TeX"**解耦**，套件在任何机器上结果一致。

## 新增

- 工具 **`vibe_v5_feedback`**（v5，成员可用）：`op` 取 `'add' | 'update' | 'list' | 'summary'`；`list` 默认只列**未闭环**条目（可按 `category`/`route` 过滤，`all: true` 看全部）；`summary` 按类别与路由计数。
- 载体：`Shared/Feedback/<类别>.md`（`cooperation` 合作｜`management` 管理｜`process` 流程｜`obstacle` 障碍｜`conflict` 矛盾）＋ `Shared/Feedback/index.json` 索引；权威数据放在研究所的**耐久状态**里，重启不丢。
- 参数 **`feedback`**（v5）：`'on'`（默认）| `'off'`。设为 `'off'` 时：提示词**不再注入**该段，且工具的**每个操作**都**具名拒绝**（`V5_FEEDBACK_DISABLED`，绝不静默写入）。
- **三条路由**（写进提示词与文档）：`self`＝你自己的做法 ⇒ **自己调整即可，无需谁采纳**；`team`＝组织/工作流/团队运行的调整 ⇒ **同样无需审批**，觉得不好就及时调整；`interpersonal`＝**别人造成的、要别人改变才能解决** ⇒ **只有这条**要先做评估，并在事后**回填验证结果**（`outcome` 回填后才允许闭环）。
- 权限：成员与临时工可 `add`，且只能 `update` **自己发起的**条目；所办可 `update` 任何条目（标记解决／回填结果）。
- 可观测：条目数/未闭环数/按类别/按路由计数出现在 `vibe_v5_feedback {op:'summary'}`、`vibe_v5_report` 与 `vibe_v5_overview` 三处。

## 变更

- 提示词（受影响的四套预设）：缺引擎的处置由"向用户询问"改为"**如实上报所办（或群聊）**，由所办向用户确认"——成员没有直连用户的通道。
- 提示词：LaTeX 指引现在写明"**仅在你参与论文写作或编译时适用**"，不再作为无解释的噪声出现在每次唤醒里。
- 提示词：`math_computation` 的"归档→编辑→重跑"段在**首次**提到"回执"处说明"**回执＝一次 `math_computation` 调用的 JSON 结果**：先 `probe` 或 `run` 一次即可看到它的字段"，并给关键字段加最小注解。
- 提示词：空引擎列表由 `math_computation：本机可用 （无）` 改为 **`math_computation：可用引擎 无`**（英文 `available engines none`）。
- 提示词：面向成员的框架回执标题由 `【框架提示】` 改为 **`【研究所提示】`**。
- 文档：安装段与排查段写明 `pnpm` 前置与"显式版本"口径；README 里"用 `@latest` 升级"的旧说法已改正为显式版本。
- 维护者向：随包的提示词语料随上述文本变化同步更新。

## 修复

- **症状**：v2/v3/v4/v5 的 Lean 形式化几乎从不通过——日志里能看到大量 Lean 调用，但 `formal.passed` 为空。**原因**：注入的搜索根旗标是 Lean 3 的 `--search-path`，而 Lean 4 只认 `-R` / `--root`，编译器在**参数解析阶段**即以 `rc=1` 退出，要编译的文件从未被读取。**修正**：四个预设统一注入 `-R <root>`；若用户在 `leanArgs` 里已显式给出搜索根，则**不再注入第二个**（语义不变）。**验证**：真机上编译器被正确调用并读到文件；最小证明 `theorem probe_true : True := trivial` 编译通过并归档到 `Verified/Lean/`，随后**另一名成员读取该归档引理，并以它的陈述作为新定理的前提**（复用成立）。守卫：`tests/formal-verify-v2.test.mjs`／`tests/formal-verify-v3.test.mjs`／`tests/formal-verify-v4.test.mjs`／`tests/formal-verify-v5.test.mjs`，`tests/audit-prompt-invariants.mjs`（旗标拼写 ＋"预设文本不得再教 `--search-path`"），`tests/v5-institute-fixes.mutants.mjs`（具名红）。
- **症状**：TeX Live 装在 `texlive\<年份>\bin\windows` 这类"已安装但未加入 PATH"的位置时，四套预设都报"未检测到 LaTeX 引擎"，只交付 tex+md。**原因**：默认探测只覆盖 PATH 与 MiKTeX 的常见安装根。**修正**：新增**有界**候选根（Windows 盘根下的 `texlive\<年份>\bin\windows`、类 Unix 的 `/usr/local/texlive`、`/opt/texlive`、macOS 的 `/Library/TeX/texbin`），候选总数**有上限**；仍然**只查文档化位置、不扫全盘、绝不自动安装、绝不写工作区之外**；未检测到时 `triedPaths` 继续**具名**列出实际探测过的路径。**验证**：真实主机上"引擎装了但不在 PATH"的情形可被发现（PATH 查找失败 ⇒ 文档化根命中）；把文档化根沙箱化后，所有候选探测都落在允许树内且总数不超上限。守卫：`tests/audit-prompt-invariants.mjs`（候选根覆盖文档化位置／有上限／不得出现裸盘根／探测点必须经过可沙箱化的接缝），`tests/e2e-v5-round2.test.mjs`，`tests/audit-math-computation-parity.mjs`。
- **症状**：成员被要求做它做不到的事（例如"向用户询问"）。**修正**：改为"如实上报所办（或群聊）"。守卫：`tests/audit-prompt-invariants.mjs`（成员可见文本不得要求其做不到的动作），`tests/e2e-v5-round2.test.mjs`。
- **症状**：面向代理的文本里出现宿主绝对路径（盘符字面量），换一台机器就是错误指引。**修正**：改为可移植表述（`texlive\<年份>\bin\windows`、`/usr/local/texlive`、`/opt/texlive`、`/Library/TeX/texbin`）。守卫：`tests/audit-prompt-invariants.mjs`（源码级盘符判据 ＋ 四份提示词语料的路径判据），`tests/audit-path-discipline.mjs`。
- **症状**：成员第一次看到"回执字段 `scriptPath` / `scriptAbs`"时并不知道"回执"是什么，只能反复试探。**修正**：在"归档→编辑→重跑"段**首次**提到回执处补一句背景。守卫：`tests/e2e-v5-round2.test.mjs`（模块行为级 ＋ 成员提示词端到端），`tests/v5-institute-fixes.mutants.mjs`（删掉该句 ⇒ 按名红）。
- **症状**：无引擎时提示词渲染成 `math_computation：本机可用 （无）`，字面自相矛盾。**修正**：改为"可用引擎 无"（英文 `available engines none`）。守卫：`tests/e2e-v5-round2.test.mjs`，`tests/v5-institute-fixes.mutants.mjs`（改回旧措辞 ⇒ 按名红）。
- **症状**：面向成员的文本自称"框架"，在代理视角指代含糊（指插件？宿主？还是本研究所？）。**修正**：回执标题改为 **【研究所提示】**。守卫：`tests/e2e-v5-round2.test.mjs`（源码级：面向代理文本里不再出现 `【框架提示】`），`tests/v5-institute-fixes.mutants.mjs`。

## 兼容性与迁移

- 破坏性变更：**无**。
- 纯新增：`vibe_v5_feedback` 工具、参数 `feedback`（默认 `'on'`）、`Shared/Feedback/` 目录与其索引。
- 迁移：**无需迁移**；既有参数名与默认值、数据格式与目录结构均未变。
- DSH 支撑窗口不变（见 `package.json` 的 `engines.dsh`）。
- **升级方式**：

```
dsh plugin --profile <你的 profile> add dsh-vibe-math@2.8.5
```

  - 若升级后仍是**旧版**：先确认 `pnpm` 可用——`dsh plugin …` 的插件管理需要一个可用的 `pnpm`；缺失时安装会失败，且**插件市场可能不显示原因**（可附 `~/.dsh/profiles/<profile>/hub.log` 定位）。
  - 再检查该 profile 的 `package.json` / `pnpm-lock.yaml` 是否仍指向旧版本：它们**优先**于 `latest` 标签，**不带版本可能装到旧版**；必要时显式指定版本重试。

## 已知限制

- LaTeX 引擎仍只探**文档化位置**：装在非标准目录时不会被自动发现；请用参数 `paperLatexCommand` 指定引擎命令的绝对路径（提示词会引导"写入后再次探测"）。
- 需要真实引擎/宿主的几处行为由**真机复测**确认；随包套件以**源码级不变式＋可沙箱化接缝**保证不回归，但不宣称覆盖宿主层行为（例如"中断后调用方被丢弃"）。
- **反馈库不产生研究证据**：它只记方法论与协作层（怎么组织、哪里卡住、与人摩擦）；研究结论仍然进 `Progress/` 与 `Verified/`。
- 安装/升级：本机工具链下 `@latest`、`@^2`、`pnpm update --latest`、`pnpm add …@latest` 均**不能**保证升级，仍建议**显式版本**（见"升级方式"）。
- 根代理提问会阻塞整所流程（运维注意项，产品不改）：长跑时请把问题与验收条件一次说清。

## 验证方式

- `node tests/run-tests.mjs` —— 全部通过（**106** 项：44 套件 + 62 探针）。
- `node scripts/release-check.mjs` —— 退出 0；发布后加 `--registry` 比对线上 shasum 与本地 tarball。
- 本版相关套件：`node tests/e2e-v5-round2.test.mjs`（实测 `passed=484 failed=0`）、`node tests/v5-institute-fixes.mutants.mjs`（**33/33** 具名红）、`node tests/audit-prompt-invariants.mjs`（**211/0**，`--self-probe` **26/26**）、`node tests/audit-artifact-docs.mjs`（**24/0**，其变异器 **8/8**）、`node tests/audit-math-computation-parity.mjs`（**108/0**）。
- 真机复测配方：① **Lean**——在装有 Lean 的主机上让一个对象走 `vibe_v5_lean_archive`（`kind:'proof'`），应编译通过并在 `Verified/Lean/` 出现对应文件，另一名成员应能 `import` 到它；② **TeX**——把引擎装在文档化根但不加入 PATH，运行论文流程应不再报"未检测到引擎"，且 `triedPaths` 里能看到实际探测过的路径。

## 依赖

- 无新增运行时依赖；DSH 支撑窗口不变。
