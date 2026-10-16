# Phase 5 · **确切配方**（Round 25 —— 未知项已清零，只剩机械执行）

> ★ 作者＝Lead。★ 本文件只记录**怎么做**，不启动运行。

## 1. ★ Phase 5 ＝ 用 `vibe-math-vmu` preset 跑一遍完整流程到结题

★ **任务书已写好**：`D:\_tmp\slv-phase5\vmu-v5r-fullflow-task.txt` ✓
★ 它按**前次 `L5-converge.txt`** 的成熟设计改写：★ **声明这是模拟**／★ **允许用最小可占位对象**（如 `1+1=2`）／★ **要验证的是流程与提示词、不是数学**／★ **跑到框架停止条件真的触发**（全体一致 `vote_solved=true` ⇒ 论文阶段 ⇒ `finalize`）／★★ **不得操纵投票**／★ 预算 40 次调用·75 分钟／★ 硬边界含**禁止 escalations** 与 **不用 `ask_user_question`** ✓

## 2. ★★★ 关键：vmu 是【零机制】的 —— 研究机制来自【pack】

- ★ `vibe-math-vmu/agent.cordis.yml:41` 逐字：**"With no pack active, vmu does nothing beyond making those capabilities available."**
- ★ `:13-14` 逐字：**"DEFAULT IS ZERO MECHANISM … A generation's behaviour — for example the research-institute mode — is reproduced by its PACK, never by the kernel"**

⇒ ★★ **所以 Phase 5 必须激活 v5r pack**，★ 否则框架**只会提供能力、不会有研究所行为** ✓

## 3. ★★★ 激活的确切写法（★ 入口自己记下了那次实测失败，所以这里是确凿的）

★ `vibe-math-vmu.js:60-71` 的 **`U14 / Round 6`** 注释逐字：

> ★ *"the overlay recipe declares the NESTED form (`config.vmu = { tools: { faces: ['*'] }, packs: { active: ['v5r'] } }`), while the reader only kept keys starting with `vmu.` ⇒ `tools`/`packs`/`report` were dropped ⇒ **silently discarded**（★ Round-5 的真机会话**只看到 `vibe_vmu_status`**）"*

★ **两种被接受的形状**：
1. ★ **NESTED** `config.vmu = { tools: { faces: ['*'] }, packs: { active: ['v5r'] } }` ⇒ **被扁平化成点号键** ✓
2. ★ **DOTTED** `config.vmu = { 'vmu.tools.faces': ['*'], 'vmu.packs.active': ['v5r'] }` ⇒ **原样采纳** ✓

★★ 且 ★ **"NOTHING IS DROPPED SILENTLY"**：★ 任何**无法变成设置**的条目都会**连同理由**出现在 `unparsed` 里 ⇒ ★ **所以"激活是否生效"是可判定的** ✓

## 4. ★★ 执行路径（★ 因为驱动没有 `--patch`）

★ 驱动 `dsh-drive.mjs` 的 **23 个开关里没有 config/patch 直通**（★ `--preset` 只选 preset）⇒ ★★ **正确做法：在【克隆里安装完之后、启动之前】，把 `config.vmu.packs.active: ['v5r']` 写进克隆的 `agent.cordis.yml`** ✓
★★ **这是【部署声明】** —— ★ **而不是把 pack 写死进 preset**（★ 那会**违反"默认零机制"的哲学**）✓
★ 实现：★ **复制一份 `slv-run.ps1`**（★ scratch 脚本、可改），★ **在 `npm i` 之后、`Start-Process` 之前插入这一步** ✓

## 5. ★★ 两处已知要先处理

1. ★★ **脚本在 Windows 上清不掉 `node_modules`** ⇒ ★ 每次运行**会泄漏克隆**（★ Round 23 我手工清过两次）⇒ ★ **运行前确认没有残留克隆，运行后必查并手工清** ✓
2. ★★ **tarball 不要放在 `D:\_installs\pkg\`**（★ 那是脚本自己的暂存处 ⇒ ★ 会报 "cannot overwrite with itself"）⇒ ★ **放 `D:\_tmp\...`** ✓

## 6. ★ 预算建议

★ 完整流程（★ 研究所**真的跑起来**）**比 Phase 4 贵得多** ⇒ ★ 手册实测 v4「启动＋1 轮」≈ **732,888 tokens** ⇒ ★★ 本次是**多轮跑到收敛** ⇒ ★ **建议 `-MaxTokens 900000`、`-TimeoutSec 1800`**；★ **触顶记为 NON-RESULT（★ 不是通过）** ✓
