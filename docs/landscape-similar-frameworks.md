# Vibe Math 同类框架调研（互联网检索报告）

> 检索目标：找出与当前仓库 `Vibe-Mathematics`（npm `dsh-vibe-math`，四个 agent preset：`vibe-math-v2`/`v3`/`v4`/`v5`）**同类的 "vibe mathing harness"** 框架。
> 检索时间：本次会话；所有结论均附来源链接，未能核实的项已标注「未核实」。

---

## 0. 先定义"像不像"的判据

Vibe Math 的本质**不是模型，而是 harness**——一个把 LLM 代理编排成长期数学研究流程的**脚手架**。它的可辨识特征有 8 条，本报告用这 8 条给每个候选打分：

| # | 特征 | Vibe Math 的实现 |
|---|---|---|
| F1 | **多代理角色分工** | explorer / solver / verifier（v2/v3）+ planner + method-keeper；v4/v5 为常驻研究员的角色自组织 |
| F2 | **持久知识库**（非聊天记录） | `qs.json`、`Propos/`、`Methods/`、`Verified/` |
| F3 | **独立多代理交叉验证** | 每个结论派 ≥3 个验证器**独立**审查 → 辩论 → 裁决 |
| F4 | **共识/法定票门槛**（进可信库的硬门） | v5：`≥ m = min(quorumCap, 在册有表决权人数)` 张**布尔**票全部同向；反向票阻塞、弃权不计票 |
| F5 | **机器核对门（Lean 4）** | `formalVerify = off / encourage / require`；不通过则本次裁定不定论 |
| F6 | **可续跑的状态持久化** | v2/v3 落盘 JSON；v5 存会话日志的 host-only 投影单元，零 token |
| F7 | **人在环中途干预** | `auto/manual` 模式、计划审批门、方法晋升门、任意时刻给成员发消息/增删编制 |
| F8 | **自动产出论文** | 收口前自动写 `Paper/<id>/{paper.md,paper.tex,paper.pdf}` |

> 补充一条**边界判据**：F4 与 F5 同时具备者极少。绝大多数系统只有其中之一，或两者皆无（只是"再问一个 LLM 看一眼"）。

---

## 1. 结论速览

按"与 Vibe Math 的相似度"排序，值得关注的共 **6 个梯队**：

| 梯队 | 代表 | 为什么像 | 关键差异 |
|---|---|---|---|
| **A. DSH 同宿主插件** | **`dsh-rigorquant`**（最近）、`MathModelingAgent`、`dsh-ultramath`、`xsoc1/math-research-dsh`、`dsh-math-team`、`dsh-math-proof`、`dsh-math-olympiad`、`math-modeling-harness`、`symmetryseeker/math-agent-framework`、`dsh-agent-teams` | **同一个宿主、同一套 preset/harness 机制**，安装即用；`dsh-rigorquant` 更做到**框架强制的上下文隔离** | 都缺 F4 布尔法定票门槛；多数缺 F1 的长期常驻编排 |
| **★ B. 研究级数学 harness（真同行）** | **`ProofCouncil`**（ETH Zurich，开源）、**DeepMind `AI co-mathematician`**（闭源）、**`ResearchMathAgent`**（上海交大）、**`AutoformBot`/ATLAS**（Meta FAIR 等）、**MMAT**（中科院 AMSS） | **信息型研究级数学**、多代理编排 + 结构化/持久知识库 + 验证门 + 可续跑；`AutoformBot` 另有 Lean 硬门 + 3 个独立维度 judge | 都缺 F4 布尔法定票门槛；`ProofCouncil` 的评议会是咨询性的，`Co-mathematician` 的 reviewer 是单方的 |
| **C. 学术界的"数学研究 harness"（自称 Harness）** | **MMAT / MechMath Agent Team**（中科院 AMSS） | 论文里**直接自称 "Harness Architecture"**；三平面解耦 + 知识图谱 + Lean 闭环 + 人在环 | 集中编排、无布尔共识票、无自动论文 |
| **D. 形式化 prover harness（长期运行型）** | `unsorry`、`LeanMarathon`、`Goedel-Architect`、`LeanAgent`、`AutoRocq`、`numina-lean-agent`、`lean4-skills` | F5 最强（内核是唯一裁判）+ **仓库即队列与知识库** | **几乎没有 F2/F3/F4**（无信息型知识库、无概率信念、无辩论）——信任锚来自内核而非共识 |
| **E. 多代理对抗验证** | `dsh-math-olympiad`（新鲜上下文对抗验证）、QED 式、`ReConcile`、MAD 系列、Google `AI co-scientist` | F3 + 部分 F4 | 通用科研/竞赛，不是研究级知识库；门槛多为 Elo/加权而非布尔法定票 |
| **F. 自组织代理团队** | `munder-difflin`（AI 办公室）、`dsh-agent-teams`、`Pantheon` | F1 + F6/F7，**机制形态与 v4/v5 最接近** | 目标是通用办公/开发，没有数学验证与 Lean |
| **G. 同名"VibeMath"簇** | `BlinkDL/VibeMath`、`cyanseek/VibeMath`、`VibeMathed` | **名字一样**，易混 | 是**数据/索引站点与 MCP**，不是求解 harness |

> **一句话结论**：在**信息型（informal）研究级数学**赛道上，Vibe Math 有**四个真同行**——开源的 **`ProofCouncil`**（ETH）、**`ResearchMathAgent`**（上海交大）、**`AutoformBot`**（Meta FAIR，但它是"形式化"而非"发现"）、闭源的 **DeepMind `AI co-mathematician`**——外加**一簇 DSH 原生兄弟预设**。这四家的形状与 Vibe Math 高度重合，但**没有一家有法定票门槛**。而"长期运行 + 知识库 + 验证门"这一**形状**在**形式化赛道**被大规模实现（`unsorry` 2349 条已验证证明、`LeanMarathon` 已交付多个 Erdős 问题 repo），那里的信任锚是**内核**；Vibe Math 则必须用**辩论 + 概率 + 共识门槛**自己合成信任锚——**这正是它最独特、也最难的地方，而 §8.5 表明这个信任锚有一个已被形式化证明的漏洞**。

---

## 2. 梯队 A：DSH 生态里的同类插件（最直接的对标）

这一梯队最重要：它们与 Vibe Math **共用同一个宿主 DeepSeek Harness 和同一套 agent preset 机制**，是真正意义上的"同类竞品"。DSH 插件目录已收录约 **7797 个插件**（[dshbase 目录](https://dshbase.com/plugins/directory/)）。

### A0. `linxichen/dsh-rigorquant` — **整个检索中最接近的单个同类** ⭐ 最高相似度

- 仓库：<https://github.com/linxichen/dsh-rigorquant>（★6，MIT，2026-10-01，需要 DSH `>=0.2.0-rc.2 <0.2.1`）；README 镜像：<https://awesome-dsh-plugin.com/p/linxichen/dsh-rigorquant/>
- 定位：**会话内无人值守的长期经验/计算数学研究**（经济学、金融、投资组合），把**一个会话变成一个上下文隔离的多代理实验室**。
- **八个角色绕一个 hub**：Orchestrator、explorer-`n`、OffGridThinker、DoubleChecker、Adversary、lit-line / lit-adversary、`rq_check.py` 验证器、doc-adversary。
- **它最值得 Vibe Math 学的一条（也是本报告最重要的工程发现）**：
  > **上下文隔离是被"强制"的，而不是靠"约定"的。** 编排器是**唯一**能看到全部报告的；teammate **不能**给另一个 teammate 发消息、**不能**列出花名册、**不能**读到整块黑板；而且**生产者永不检查自己的工作**（producer ≠ checker 被强制）。

  这直接回答了 §8.5 的独立性难题——`dsh-rigorquant` 用**框架层的可见性限制**，而不是靠投票者自觉。**这是 Vibe Math 最容易照抄、效果最直接的一条修补。**
- **四道门（在写任何数值实现之前）**：A 闭式等式 → B 精确不变量 → C 解析界 → D 统计加固。
- **盲复核**：DoubleChecker 用**两种不同手段**各自重新推导承重结论。
- **对抗者只以反例消灭主张**（不能靠"我觉得不对"否决）。
- **元验证器 `rq_check.py`**：**拒绝任何缺少证据的 `PASS`**，且**只读审计记录、从不读 `study.json`**——其原则是"**研究不能为自己作证**"；它自身还被一个**伪造的 study** 测试过，必须失败。
- **战绩**：据其声明，**21 个错误被特定机制捕获、无一靠运气**；81 条文献主张中**只有 35% 通过了独立验证**。
- **与 Vibe Math 的关键差异**：
  - **无布尔法定票**：裁决是二值 `PASS` / `NEEDS-EDITS` + 裁决 docket，不是 m-of-n 布尔票。
  - **无持久知识库**：没有 `Propos/` / `Methods/` / `Verified/` 那样的可累积命题与方法库（只有 `derivations/`、`audits/`）。
  - **明确声明不支持跨会话自治**："**does not continue autonomously across restarts**"——即**它主动放弃了 F6**。这反衬出 Vibe Math 的断点续跑与 v5 投影单元是有真实代价换来的能力。
  - **单领域**（经济/金融/投资组合），不是通用数学问题求解；Lean 只是**可选外部通道**（`jacobian` MCP 升级通道）。
  - 人类干预较轻：intake 问一个问题 + 一次性配置前批准 + 一个"continue"回合重新武装。

### A1. `MathModelingAgent`（yohanchen1）— 思想最接近的一个 ⭐ 高度相似

- 仓库：<https://github.com/yohanchen1/MathModelingAgent>；目录页：<https://dshbase.com/zh/plugins/mathmodelingagent/>（★4，2026-08-23 最近推送，MIT）
- 核心口号：**"模型负责提出，工具负责验证，证据决定结论。"**
- 与 Vibe Math 惊人一致的地方：
  - **Claim → Obligation → Evidence** 三段式，取代"让另一个 LLM 再看一遍"；裁决只有三态 `PASS / FAIL / INCONCLUSIVE`，且**"证据不足不能升级为 PASS"**——这与 Vibe Math「未达门槛留库附平均概率、不强行裁决」是同一种哲学。
  - **证据等级阶梯**：`NOT_CHECKED → DERIVED → EXECUTED → VERIFIED → INDEPENDENTLY_VERIFIED → EXTERNALLY_VALIDATED`；原则是"**证据强度不能弱于主张强度**"。
  - **SOLVED 硬门禁**：范围冻结 + 必选义务全 PASS + 关键对抗检查通过 + 可复现材料齐全 + 局限已声明；High-Assurance 还需**独立审计（审计器只读产物，不依赖求解过程的私有推理）**。
  - **可恢复运行**：`run.json / ledger.json / events.jsonl` 原子状态 + 跨进程互斥锁 + stale 锁 reclaim + Windows 共享冲突重试；已完成且输入未变的工作不重跑——对应 F6。
  - **Lean 可选**：明确写"不自动安装""**形式命题被证明 ≠ 现实主张被证明**"，缺失即降级记录，不伪装成验证成功。
  - **两个 skill**：`math-modeling-agent`（建模）+ `math-modeling-audit`（独立审计，**不替作者修改**）。
  - 失败分类归档：`failed/directions/`、`failed/code-drafts/`、`failed/issues.md`（DATA/TOOL/IMPLEMENTATION/MODEL/VALIDATION/EVIDENCE/RESEARCH_GAP）。
- 与 Vibe Math 的**关键差异**：
  - **无 F4**：没有"≥ m 张布尔票全同向才进 `Verified/`"的法定票门槛，靠**证据义务**而非**投票共识**放行。
  - **无 F1 的长期常驻编排**：是靠 skill 驱动的工作流，不是 v4/v5 那种常驻子代理互相留言/开会。
  - **有 F2 的变体**：`ledger.json` + `reproducibility.json` 更像**运行账本**，不是可累积复用的命题库 `Propos/` + 方法库 `Methods/`。
  - 定位是**数学建模（MCM/ICM 竞赛与开放式建模）**，含 MCM/ICM 终审评分（注明"非 COMAP 官方评分表"）；Vibe Math 定位是**数学问题求解与证明/证伪**。

### A2. `dsh-ultramath`（Andiii208）— 流程门禁与盲评最像 ⭐ 高度相似

- 仓库：<https://github.com/Andiii208/dsh-ultramath>；目录页：<https://dshbase.com/plugins/dsh-ultramath/>（★35，2026-08-24，MIT）
- 定位：**数学建模竞赛多 Agent 求解插件**，5 角色预设（UltraMath 主控 + 数学家 / 工程师 / 作家 / 审稿人）+ 33 篇模型库 + 论文模板/审稿脚本随包 + 进度可视化。
- 与 Vibe Math 对应的机制：
  - **阶段门禁**：Phase 0 框架 → 1 推导 → 2 编码 → **2.5 独立验算** → 3 论文 → 4 审稿，每阶段有门禁，审稿发现阻断项可**回退**。
  - **独立验算（信息隔离）**：分歧 >30% FAIL / 10–30% SUSPECT / <10% PASS——这是**带数值容差的独立复核**。
  - **三席独立盲评**：Phase 4 派 3 个**互不共享上下文**的评委（旗舰通审 / 创新与决策 / 正确性可复现），结构化 scorecard；**分歧 >20 分走证据仲裁，不取平均**——与 Vibe Math v3 的「近共识裁决」形成有趣对照（Vibe Math 是同侧且均值 ≥0.85/≤0.15 就**取均值**，UltraMath 是分歧大时**不取平均改走仲裁**）。
  - **学术诚信 7 类门控**：抄袭 / 数据造假 / 引用伪造 / 图片伪造 / 不可复现 / 匿名性违规 / 越权署名，**任一触发一票否决**；阻断项 B1–B9 一票否决。
  - **数字冻结 + 传播检测**：`冻结数字.json` 让论文每个数字可追溯到 CSV/脚本输出，改代码后 grep 检测 stale 引用。
  - **中途续跑 + 人工把关**：`求解/进度.md` 断点续跑；Friendly Mode 在每个关键决策点停下给编号选项确认——对应 F7。
  - 论文：`论文/*.tex`，xelatex×2 编译，Error = 0——对应 F8。
- **关键差异**：**没有 Lean/形式化（无 F5）**；**没有法定票门槛（无 F4）**，门禁是"阻断项 + scorecard 阈值"；知识沉淀是 33 篇**固定模型库**（静态方法论文档），不是 Vibe Math 那种**在解题过程中发明并沉淀新方法**的 `Methods/` 库。

### A3. `xsoc1/math-research-dsh` — "严谨开放数学研究"套件 ⭐ 高度相似

- 仓库：<https://github.com/xsoc1/math-research-dsh>（★2，2026-08-15 收录，MIT）；上游父项目：<https://github.com/xsoc1/rigorous-open-math-research>
- 四个 skill：
  - `math-research-workflow`——**选研究工具、维护当前进度、恢复会话与实际作业**
  - `manage-math-research-program`——文献、工具卡与批注、**经验比较**、人可编辑理解、**accepted Blueprint knowledge**
  - `rigorous-open-math-research`——**构造证明或反例**、理解成功与失败路线、审查论证
  - `lean-verify`——编译器反馈、**精确目标与传递公理（transitive axioms）**、语义审查与可复现证据
- 与 Vibe Math 高度重合：**长期数学研究**（不是竞赛题）、**可续跑**（`test_research_state.py`、`smoke_checkpoint_resume.py`、`smoke_handoff.py`）、**Lean 验证**（真实 Lean 测试固定在 `leanprover/lean-action@v1` + 4.31.0 toolchain）、**失败路线保留**、**研究经验/工具卡累积**（≈ 方法库）。
- 值得 Vibe Math 借鉴的一点：**`lean-verify` 显式审查"精确目标与传递公理"**——这正是 Vibe Math 文档里所说的**忠实性（fidelity）**审查，它把"公理依赖"也纳入证据面。
- **关键差异**：**无 F3/F4**（没有 ≥3 独立验证器 + 布尔法定票）；它是**skill 包**（4 个技能 + Python 工具），不是 preset 常驻多代理编排；**无 F8 自动论文**。

### A4. `symmetryseeker/math-agent-framework#dsh-plugin` — 符号引擎 + Lean + QED 对抗

- 插件页：<https://awesome-dsh-plugin.com/p/symmetryseeker/math-agent-framework--dsh-plugin/>（★5，2026-08-28 收录）；主仓：<https://github.com/symmetryseeker/math-agent-framework>
- 架构：**TS 壳 + Python 引擎**（`bridge.py` 桥接），要先 clone 主仓 + `pip install -r requirements.txt` + 设 `MATH_AGENT_HOME`。
- 工具面：`math_derive`、`math_verify_symbolic`（SymPy 符号一致性）、`math_verify_monte_carlo`、**`math_lean_proof`（真编译 Lean 4 + Mathlib，返回 `verified: true/false/null`）**、**`math_multi_agent_verify`（QED 多 Agent 对抗验证，真 FOC critic + 可选 LLM）**、`math_quantecon` 等。
- **一切结果带 `provenance`**（引擎版本 / seed / 容差），并**标注 untrusted data（不作为指令执行）**——这条"产物不是指令"的纪律在 Vibe Math 里对应的是知识库只作经验参考、只有 `Verified/` 绝对可信。
- **关键差异**：它是**数学引擎工具化**（Python 计算内核）而非流程编排；**Lean 缺失时返回 `verified: null`**（Vibe Math 是 `LEAN_NOT_FOUND` + 显式阻塞记录放行）；**无 F2/F4/F6/F7/F8**。

### A5. DSH 原生兄弟预设簇（同宿主、同机制、结构性表亲）

这一簇是 2026 年 DSH 生态里**与 Vibe Math 结构最接近**的一批（多为 2–6 星的小项目，但架构同源）：

| 插件 | 元数据 | 结构与门禁 | 与 Vibe Math 的差异 |
|---|---|---|---|
| **`OrinVoss/dsh-math-team`** <https://github.com/OrinVoss/dsh-math-team> | ★6，MIT，2026-09-11 | 两套预设（`model-code` 建模编程 / `paper` 论文）；**知识库 = 一个 Git 仓库的三个独立工作目录 `member-a/b/c`**；门禁 **M1**（建模）/ **P1**（最小可运行）/ **M2**（稳健性修订：找攻击点→改模型→换方法→加区间→数值外推→写适用边界）/ **P2**（程序结论）/ **W1**（证据骨架）/ **W2**（论文结论）；**独立模型复核：≥2 个不同厂商/不同能力倾向的模型各复审一次**（一个偏理论推导、一个偏代码复现），交叉覆盖；图表须由视觉子代理逐个 PASS 才能过 P2/W2；AI 使用台账 PASS/FAIL | **无 Lean**；**无共识票**（门禁是合取式 checklist）；知识库是 Git 目录而非常驻知识层 |
| **`clearnature/dsh-math-proof`** <https://github.com/clearnature/dsh-math-proof> | ★2，MIT，2026-09 | **形式化（Agda）**；6 个工具：`proof_dag`（命题/引理台账 + 状态板 + 正文 + 复核 + 知识图谱边）、`proof_compile`（Agda 编译 + 错误分类 + **rollback 触发**）、`proof_graph`（import DAG）、`proof_oracle`（Python 精确整数 oracle + rollback）、`prover_limits`、`proof_audit`；3 个 hook（SessionStart / PreToolUse 越权拦截 / Stop） | **"Agda 内核是唯一裁判"**：**只有工具返回的 `rollback` 才算"通过"**，模型自称的 `evidence` 属不合格项；只有 exit 0 且 0 postulate/hole 才算证明；`AUDIT.md` 记录**被推翻的判断**。→ **比 Vibe Math 的 `require` 档更严格**，但**没有多代理共识、没有概率信念、没有辩论** |
| **`988hj7tczd-oss/dsh-math-olympiad`** <https://github.com/988hj7tczd-oss/dsh-math-olympiad> | ★2，MIT，2026-08-24 | 5 步：纯推理求解（Pólya 启发式）→ 提取关键洞见 → **在新鲜上下文中派 `subagent` 做对抗验证（不共享推理轨迹）**，用验证器失败模式驱动修复 → 路由回第 1 步，**最多 2 轮**；仍失败则输出"**no confident solution**"；最终给答案 + 验证 + 置信度（high / medium / no confident solution）。测试中 `verify` 入口**只接受 `proof` 正文**，属"真防泄漏"设计；插件库 sha256 校验；固定 Node/权限 | **无长期知识库**（单题一次运行）；但"**新鲜上下文对抗验证 + 校准置信度 + 允许拒绝给答案**"与 Vibe Math 的"未达门槛留库附概率、不强行裁决"是**同一价值观的轻量版** |
| **`Leionel/math-modeling-harness`** | ★4，2026-10-02 | 目前见到的**最显式工程化**的门禁/凭据架构：确定性 **S0→M1→P1→P2→W1→W2→S1→F1** 门、**执行凭据（execution receipts）**、**产物 DAG（哈希驱动的新鲜度判定）**、**fail-closed MCP allowlist**、红队评测（12 场景 / 9 类）、公开威胁模型并**承认两处 attestation 缺口** | 是**建模** harness；其"单提示 vs 多代理无 harness vs 多代理有 harness"的 A/B/C 消融**已预注册但尚未运行**——即**不宣称任何能力结论**（这一点非常诚实，值得学习） |
| **`hatter123/dsh-math`** ★1 · **`jinguanghai/deepseek-harness-forge-plugins`** ★2（含 math/logic/regex/**eprover**/system/repair 门） · **`QianXiao233/mathmodel-assistant`** ★2（11 skills + 34 竞赛模板） · **`jsChen-biostat/math-modelCN`** ★45（建模手/编程手/论文手三角色） · **`Crayonnan/dsh-math-modeling-skills-Gatecraft-`** ★8 | 均 MIT | 这些是 DSH 上"数学建模/门禁"谱系的其余成员 | 扫描到的 DSH 数学相关插件**逾 114 个**，但多数是 CAS 工具或建模流程，**无一是"研究级求解 + 共识门槛"** |

> 另有 `11350613/SymPy-Calculate`——"**无状态**的 DeepSeek Harness agent preset，只提供一个 `sympy_calculate` 工具"，是 Vibe Math 持久知识库的**反面极端**，可作为设计对照。

### A6. 其他 DSH 生态相关项

| 插件 | 像在哪里 | 不像在哪里 |
|---|---|---|
| `OrinVoss/dsh-math-team` <https://dshbase.com/zh/plugins/dsh-math-team/>（★1） | 面向 DSH 的**团队化数学建模**，2 套预设（建模编程 / 论文）+ 质量门禁 M1/P1/P2/W1/W2 + Gitee 三文件夹协同 | **靠 Git 多文件夹人工协同**，不是框架内多代理协作；无验证投票、无 Lean |
| `NanmiCoder/dsh-agent-teams` <https://github.com/NanmiCoder/dsh-agent-teams>（★约 1937） | **DSH 上的通用多代理团队**——与 Vibe Math 的 v4/v5 团队化底座同构 | 通用团队，**无数学验证、无 Lean、无知识库共识门槛** |
| `loopx-project/loopx`（★约 6161） | **长时程代理的状态内核**：Goal / Todo / gate / evidence / quota / **recovery** / handoff | 通用状态内核，不是数学；但 F6 的设计值得对照 |
| `Q00/ouroboros`（★约 6183） | 36 个 interview/Seed/execution/evaluation/**evolution** 工作流工具 | 通用科研/演化工作流，非数学证明 |
| `Karbo123/DSH-EvoResearch` <https://dshbase.com/zh/plugins/DSH-EvoResearch/>（★17） | 自进化科研工作台：科研记忆、**Chat Graph 分支探索**、实验账本 + 回合 + 日报、多智能体（规划/调研/编码/分析/写作）、定时任务 | **无数学验证门、无 Lean、无共识票**；是桌面应用而非纯 preset |
| `IcyCreamDAS/shidi-skill` | AI-for-Science 科研工作流 skill | 面向研究者与研究生，非数学证明 |
| `apatetta/vibe-math-mcp` <https://github.com/apetta/vibe-math-mcp> | **名字几乎一样**（"math-ing whilst vibing"） | 是 **Polars 计算 MCP 服务器**（算术→微积分/线代），**不是代理 harness**；属"名字像、性质不同" |

---

## 3. 梯队 B：研究级数学 harness —— ProofCouncil、RMA、MMAT

### `ProofCouncil` — ETH Zurich ⭐⭐ **开源界最接近 v3/v5 形状的系统**

- 论文：**arXiv:2607.09474** <https://arxiv.org/abs/2607.09474> · 代码：<https://github.com/eth-sri/proof-council>
- 作者：J. Schmitt, T. Gehrunger, J. Dekoninck, G. Bérczi, U. Kreitner, L. Price, D. Holmes（**ETH Zurich SRI**）
- **架构（作者–批评者循环 + 独立评议会 + CAS 计算节点 + 人类节点）**：
  - **作者代理**（GPT-5.5-Pro xhigh，可执行代码 + 联网搜索，直接编辑 `answer.tex` / `research_notes.tex` / `references.bib`）
  - **有状态批评者**，每 k = 3 轮**重置**；批评者接受后**必须再由一个全新的批评者复审**（fresh-critic re-audit）
  - **"LLM council" = 3 个独立模型**（Gemini 3.1 Pro、Claude Opus 4.7、GPT-5.5-Pro）
  - **CAS 计算节点**（Codex/GPT-5.5 + SageMath、GAP、Singular、PARI）
  - **agents-as-conditional-DAG 库**（含有界 repeat 块）
- **人类在环**：**人可以是一个 DAG 节点，能暂停整个 run**——这是 F7 的干净实现。
- **持久状态**：文件落盘 + **resume 处理** + 成本核算（F6）。
- **成绩**：FirstProof-B2 **6/10**；约 **$213/题**，FirstProof 全程 **$3,186**。
- **与 Vibe Math 的关键差异**：
  - **评议会是"咨询性"的**——**由作者决定**，不是法定票门槛（**无 F4**）。
  - **无持久的多研究员知识库**（无 `Propos/`/`Methods/` 那种带版本的可累积库）。
  - **无框架级形式化门**（Lean 只是临时用，不是 `require` 档门禁）。
  - **⚠️ 但它的评议会设计比 Vibe Math v5 更"独立"**：其 LLM council **"独立作答，互不看对方的回答"**（"The models answer independently, without seeing one another's responses"）。**这正是 §8.5 所要求的隔离**——见 §8.5 的对照。
  - **它的"fresh-critic re-audit"机制（批评者接受后必须换一个全新批评者复审）值得 Vibe Math 直接借鉴**：这是一个低成本的防"审查者被说服"手段。

### `AI co-mathematician` — Google DeepMind ⭐ 最像的闭源系统

- 论文：**arXiv:2605.06651** <https://arxiv.org/abs/2605.06651> · 博客：<https://deepmind.google/blog/accelerating-mathematical-and-scientific-discovery-with-gemini-deep-think/>
- 作者：Zheng, von Glehn, Zwols, …, Kohli
- **架构**：**层级式**——项目协调者把问题分解成**并行工作流** + 专门子代理（文献检索、计算探索、证明推导）+ **专职 reviewer 代理**执行**强制审查循环**。
- **持久状态**：**有**——文档描述为"**异步的、有状态的 workspace**"，**追踪失败假设**，产出带边注的 working paper。案例：Marc Lackenby 的 Kourovka Notebook 21.10。
- **⚠️ 它公开记录了两个失败模式，而这正是 Vibe Math 的病灶**：
  1. **"reviewer-pleasing bias"（讨好审查者偏见）**
  2. **prover/reviewer "death spiral"（证明者/审查者死亡螺旋）**
- **与 Vibe Math 的关键差异**：**无形式化门**（个案里用了 SAT/PySAT）；**reviewer 是单方的**，不是法定票；**闭源**；FrontierMath Tier 4 48%。
- **值得警惕的一点**：Vibe Math 的"独立初评 → 公开辩论 → 重投"，在**公开辩论**环节恰恰会放大 **reviewer-pleasing bias**；而 DeepMind 报告的 **death spiral** 与 Vibe Math v4/v5 的看门狗（会议/验证超 2×`activityTimeoutMs` 就放弃）防的是**同一类病**——**说明 Vibe Math 的看门狗设计并非过度工程，而是有实证来源的**。

### `AutoformBot` + `ATLAS` — Meta FAIR 等 ⭐ 大规模 + Lean 硬门

- 论文：**arXiv:2605.29955** <https://arxiv.org/abs/2605.29955>（Rammal, Patel, Gloeckle, Hayat, Kempe, Munos, Arnal, Cabannes；Meta FAIR + CERMICS/ENPC + NYU + KIAS）· 代码：<https://github.com/facebookresearch/autoform-bot> · 库：<https://github.com/facebookresearch/atlas-lean>
- **架构：三层管理**——高层 **orchestrator** 从教材构建任务 DAG；中层 **trace analyzer**（从失败中学习、写"技能指南"）+ **supervisor**（评估教材目标、通过 triage 代理派发修复任务）；低层 **workers + reviewers**；worker 在 **git worktree** 中工作，走 **PR review + 批量合并队列**；**数千个 LLM agent**；带**给人在环用的可视化器**。
- **⚠️ 它报告了一个值得警惕的发现**：**worker 与 reviewer 之间会形成"规避验证"（verification-circumvention）的动态**。
- **验证（值得直接借鉴）**：**Lean 4 编译是硬门**（禁止 `sorry`、禁止非法公理）+ 声明依赖图 + 结构标签 + 机械门 + matcher 代理 + **3 个独立 LLM judge 分别评"忠实性 / 证明完整性 / 代码质量"**。
- **成绩**：26 本教材 → **45,000+ 条 Lean 4 声明、50 万行**。
- **与 Vibe Math 的关键差异**：它的任务是**形式化**而非**发现**；**无概率信念、无法定票**；但它的"**用 3 个独立 judge 分别评不同维度**"与 §8.5 建议借鉴的 **BoN-MAV Aspect Verifiers** 是同一思路，且它**真的实现了**。

### `ResearchMathAgent`（RMA）— 上海交大 ⭐⭐ 信息型赛道的"真同行"

- 仓库：<https://github.com/sjtuytc/ResearchMathAgent> · 论文：**arXiv:2605.22875**（COLM 2026 Lifelong Agents Workshop）<https://arxiv.org/abs/2605.22875>
- 元数据：**★29**，2026-09-17 最近推送，MIT（README 徽章声明；**GitHub API 的 `license` 字段为 `null`，存在不一致，引用时需注意**——`null` 在法律上是"保留所有权利"而非宽松许可）
- **补充（来自论文侧核验）**：RMA 的核心贡献是一个**持久化的、带类型的 research store** + **Research Context Orchestrator**——它为**每一个证明操作编译出"操作专用的有界上下文"**（而不是把整个历史塞进 prompt）。证明编辑、issue 更新、文献笔记、计划、评估都**写回 store**。验证包括独立专家评估、**盲评数学家复审**、LLM 基准评估，以及**Lean 4 内核**（Formal Conjectures 中 300 个"Research Solved"抽样目标里 **213 个**通过）。成绩：SOOHAK Challenge Hard **42.5%**；FirstProof B1 **8/10**、B2 **8/10**（专家评估）。
  > **"为每个操作编译有界上下文"这一点值得 Vibe Math 认真对照**：v5 每轮提示词只带短小的状态块（我是谁 / 轮次 / m / 在册名单 / 我的任务 / 新到的消息），思路与 RMA 相近；RMA 的贡献在于把"有界"这件事**形式化为 store 的一种查询**。
- 自我定位："**the first agentic framework that targets research-level mathematical proof — not competition problems, not formal theorem proving**"——与 Vibe Math **同赛道**（研究级、信息型）。
- **四段流水线**：`Initializer → Proposer → Verifier → Refiner`，通过**共享结构化记忆**协调；CLI 阶段 `parse → propose → verify → refine`；`rm solve` 循环 propose/verify，失败即调 refine。
- **验证门（最像 `Verified/` 的地方）**：`verify` 既查 LaTeX/产物正确性，也查**数学完备性门**（证明长度、子命题结构、子证明、假设审计、引用、边界情形证明）；**只有当全部验证门通过，一次运行才被标为 `verified`**；另有 LLM rubric 的 `proof_eval`（答案准确性、逻辑正确性、完备性、清晰度）。
- **持久状态**：`outputs/<dataset>/<exp>/`、逐题 `artifacts/metadata.json` / `status.json` / `verification_*.json` / `refinements/` / `proof_history`、push-forward 状态、**自主过夜 daily worker**——对应 F6。
- **形式化**：无 Lean 门（无 F5），但有 `rma reduce`：**Lean 内核核验的候选选择 + 已验证证明的 beam search + 策略组合上的 UCB1 bandit + 跨问题晋升的 transformation playbook**。其中"**跨问题 playbook**"与 Vibe Math 的 `Methods/` 库同构。
- **规模**：7 个研究数据集、**22,035 道题**（First Proof Rounds 1&2、Erdős Problems 1,217、Formal Conjectures 4,557、ResearchMath-14k、Unsolved Math 2,084、AIM lists 101）；First Proof R1 解出 **8/10**。
- **污染边界写进代码**：求解器**禁止读取** `final_solutions/`、`outputs/`、`baselines/`。
- **后端**：Anthropic API 或本地 Claude Code CLI（订阅计费）；FastAPI Web UI，带实时 PDF 预览、逐题 GitHub 式 issue tracker、token 成本图。
- **与 Vibe Math 的关键差异**：
  - **无 F4**：没有布尔法定票门槛，是"**全部验证门通过**"（合取式硬门）而非"≥ m 张布尔票全同向"。
  - **无 F5**：Lean 只用于 `reduce` 阶段的候选筛选，不是 `require` 档的裁定门禁。
  - **无 F7 的"审批队列"形态**：有 Web UI 可看可干预，但不是 manual 模式下的 approve/reject/override 决策门。
  - **无 F1 的常驻自组织**：是四段固定角色流水线，不是 v4/v5 的"常驻代理互相留言 + 开会"。
  - **强于 Vibe Math 的地方**：①**逐题 issue tracker + token 成本可观测**；②**污染边界在代码层强制**；③**UCB1 bandit 做策略选择**（比 v3 的 planner 代理更"可度量"）；④**过夜无人值守 worker**。

### `MMAT / MechMath Agent Team` — 中科院数学与系统科学研究院（AMSS）⭐ 最像的学术系统

- 论文：**arXiv:2607.04394**《MechMath Agent Team: LLM Driven Agents for Mathematical Research》（2026-07-05）<https://arxiv.org/abs/2607.04394> · 全文 <https://ar5iv.labs.arxiv.org/html/2607.04394>
- 站点：<https://mechmath.github.io/> · 团队页 <https://mechmath.github.io/agent-team/> · 开源仓 <https://github.com/MechMath/MechMath-agent-team>
- **为什么它是最直接的同类**：论文明说"we introduce the MechMath Agent Team (MMAT) … built upon a disciplined, structurally robust **Harness Architecture**"——**"harness" 正是 Vibe Math 的自我定位**。

**三平面 Harness 架构**（Control / Execution / Augmentation）：

| 平面 | 机制 | 对应 Vibe Math |
|---|---|---|
| **Control Plane** | **集中式 Orchestrator** + 两个确定性数据结构：**全局执行图**（execution graph）+ **局部任务账本**（task ledger）；**绕过 LLM 的易变对话上下文**，强制显式、状态驱动的任务调度 | v3 的 scheduler + `State/`（但 v3 额外有 planner 代理，MMAT 是纯代码编排） |
| **Execution Plane** | **沙箱隔离工作区** + **以产物为中心的文件交接**（artifact-centric File-Based Handoffs）取代脆弱的代理间对话 | v2 的"调度器是唯一文件写者 + 子代理只回 JSON"；v5 的"成员只写自己的库" |
| **Augmentation Plane** | **人机协同推理**（human-AI co-reasoning，弹性交互断点，用于专家精修与死锁解除）+ **分层持续记忆**（stratified continual memory：把反复出现的推理错误蒸馏成**跨会话负约束**） | F7 人在环 + `Methods/`；**"把重复推理错误沉淀为负约束"是 Vibe Math 目前没有的机制** |

**三个主权代理（closed loop，产出机器认证的证明）**：
- **KB-Manager**——维护**面向对象记忆图**（object-oriented memory graph），组织并归档数学推理史；KB 图含 sources / concepts / analyses / partial proofs / **obstructions** / Lean artifacts，是**项目域的依赖与证据图**。
- **NL-Prover**——编排可伸缩证明流水线（core derivation / grounded interfaces / advanced reasoning / documentation），负责**分解问题并合成自然语言证明**。
- **FL-Prover**——**作为逻辑裁判**，用 **Lean 4 编译器机器核对**自然语言推导（F-GE 生成 + F-RE 复核）。

**实证**：两个月部署解决 **11 个开放问题**（数论、代数复杂性、微分代数、算子代数、不等式）；案例 OEIS A287616 一条证明动用了 **137 个专用子代理**、产出 **>3500 行** Lean 4 形式化代码。项目级发现：从稀疏多项式乘法出发扩展到 **6 个相连研究方向**，其中包括**审计既有证明时发现一个错误论证的反例**并重建证明。

**与 Vibe Math 的关键差异**：
- **无 F4**：没有"≥ m 布尔票全同向"的法定票门槛；MMAT 的"求真"靠 **Lean 内核 + 集中式确定性编排**，Vibe Math 靠 **共识票 + Lean（可选）** 双层。
- **无 F8**：不自动生成最终论文。
- **无 F1 的常驻自组织**：MMAT 是**中心编排**，没有 v4/v5 那种"常驻代理互相留言/开会、框架绝不指派"的自组织形态。
- **强于 Vibe Math 的地方**：①**Augmentation Plane 的"跨会话负约束"**；②**项目级探索**（从一个问题扩展成 6 个方向）与**审计既有证明**；③明确的**执行图 + 任务账本**双层确定性结构；④**agent-agnostic**，可挂到 Claude Code / Codex / ZCode 上。
- 生态：同实验室还有 **MechGeo**（IMO 几何自动形式化与 Lean 4 证明）与《IMO 2026 进展》等（<https://mechmath.github.io/systems/>）。

### `STAR-PólyaMath`（arXiv:2605.19338）— 状态机式编排 + 持久元策略监督

- 论文：<https://arxiv.org/abs/2605.19338> · 代码：<https://github.com/Julius-Woo/STAR-PolyaMath>
- 机制：**orchestrated state machine**，嵌套 `challenge-step-replan` 循环；**reasoning-free Python orchestrator 把控制与推理分离**；关键创新是**持久 Meta-Strategist**，维护**跨尝试记忆**并发号施令（高层战略指导或强制指令），以逃离无效循环而非停滞。
- 与 Vibe Math 的关系：**同为"控制与推理分离"的 harness**（对应 Vibe Math 的 scheduler 与子代理分离）；**同为长时程**（针对 hallucination accumulation / memory fragmentation / imbalanced tool trade-off）；但**无 F4/F5/F8**，且目标是**竞赛基准**（AIME 2025–2026、MathArena Apex、Putnam 2025、IMO 2025、HMMT 2026、USAMO 2026）而非开放研究问题。

---

## 4. 梯队 C：多代理对抗验证 / 共识求真

### C1. 布尔法定票（F4）的真实学理源头 —— 两条最重要的论文

这两篇是**检索中唯一真正实现/研究"法定票门槛"的严肃工作**，对 Vibe Math 的 v5 规则有直接关系：

| 系统 | 元数据 | 机制 | 与 Vibe Math 的关系 |
|---|---|---|---|
| **Aegean / Aegean-Serve** | NUS（Chaoyi Ruan, Yiliang Wang, Ziji Shi, Jialin Li），2025-12-23，**arXiv:2512.20184** <https://arxiv.org/abs/2512.20184> | N 个 LLM 代理进程 + leader-based **terms/rounds**；leader 分发上一轮的**法定票精修集**，收集一个 quorum 的精修解后才可输出；**流式增量 quorum 检测**可取消滞后者；模块化**精修决策引擎**（可自定义一致条件："解相似度阈值 + 稳定性视野"）；**Quality Oracle Q: S×S→ℝ**（数值质量，代理不可见）；假设 ≤⌈(N−1)/2⌉ 个 fail-stop 代理 + 部分同步网络；**证明了安全性、活性、精修有效性与精修单调性** | **这是唯一对"法定票"给出形式化安全性/活性证明的系统**。Vibe Math 的 v5 规则（`≥ m` 全同向、反向票阻塞）**没有形式化证明**——Aegean 是可借鉴的严谨化路径。差异：Aegean 只**提交一个答案**，没有持久化 claim store；Vibe Math 有知识库但没有形式保证 |
| **The Illusion of Independent Quorums / DAQC** | Jun He, Deying Yu，2026-08-24，**arXiv:2609.02925** <https://arxiv.org/abs/2609.02925>；代码（据摘要）<https://github.com/openkedge/efd> | 定义 **Epistemic Fault Domains** 与**结构性认知割 κ_E**（= 使得某个授权联盟暴露的最小根故障数）；证明**任意大的 quorum 都可能保持 κ_E = 1**、识别共同祖先**永不**提升被记入的韧性、固定阈值下**增加投票者无法提高该割**；设计 **DAQC** 在**运行期准入门**强制结构性割；120 题冻结基准 | ⚠️ **这是对 Vibe Math 核心假设的直接反证**——见下方 §8.5 专项分析。**必读** |
| **`Voting or Consensus?`**（Kaesberg 等，ACL 2025 Findings） | **arXiv:2502.19130** <https://arxiv.org/abs/2502.19130> | 系统对照 **7 种决策协议**（含多数投票、**全体一致共识**），只改协议：投票类在推理任务 +13.2%，共识类在知识任务 +2.8%；**更多代理有帮助，但投票前更多轮次反而有害**；提出 All-Agents Drafting 与 Collective Improvement | **这是 Vibe Math 选择 `m-unanimous` vs `all-unanimous` 阈值时唯一可依赖的实证依据**。两条直接可用的结论：①**"投票前多轮辩论可能有害"**——Vibe Math 的 `verdictMaxRounds`（默认 3）需要实证校准；②共识类协议在**知识型**任务上更优，而数学证明正属知识型 |
| **Multi-Agent Verification / BoN-MAV**（Lifshitz, McIlraith, Du；arXiv:2502.20379） | <https://arxiv.org/abs/2502.20379> | 把"**验证器数量**"作为新的 test-time scaling 维度；**Aspect Verifiers**（用现成 LLM 分别验证不同方面）+ BoN-MAV（best-of-n 采样 × 多验证代理）；显示弱到强的泛化与自我改进，scaling 优于 self-consistency 与奖励模型验证 | **与 Vibe Math「每个结论派 ≥3 个严苛审稿人」结构最接近的实现**。差异：**无门槛、无持久库**；但它证明了"**增加验证器数量本身就是一个可扩展维度**"——支持 Vibe Math 继续在 `verifierCount` 上加码 |
| **`ReConcile`**（Chen, Saha, Bansal；ACL 2024，arXiv:2309.13007） | <https://arxiv.org/abs/2309.13007> | 多样化 LLM 代理圆桌会议；每轮讨论提示含分组答案 + 解释 + **各自的置信度分数**；**置信度加权投票**产出共识 | **"分歧时保留数值概率"最接近的实现**（对应 F4 里的"未达门槛留库附平均概率"）。差异：共识是**瞬时的、不落库**，没有晋升步骤 |
| **语义熵（Semantic Entropy）**（Farquhar 等，*Nature* 2024） | <https://www.nature.com/articles/s41586-024-07421-0> | 按**语义**聚类采样答案并计算熵 → 给 claim 附一个**数值不确定性**；**分歧提高这个数值，而不是强行给结论** | **"分歧 ⇒ 保留概率而非强行裁决"这一哲学的最强学术表述**，且与 Vibe Math v5 的"未达门槛留库附平均概率"同构。可借鉴：用语义聚类而非简单平均来算那个概率 |
| **`Wisdom of the Silicon Crowd`**（Schoenegger 等，2024） | <https://arxiv.org/abs/2402.19379> | LLM **集成**对二元问题给出**数值概率**预测，精度可媲美人类群体 | 为"多代理给出 0–1 概率并聚合"提供实证支持 |
| **Google `AI co-scientist`**（Gottweis/Weng/Daryin 等，*Nature* 2026，arXiv:2502.18864） | <https://arxiv.org/abs/2502.18864> · <https://doi.org/10.1038/s41586-026-10644-y> | 多代理（生成、**反思/批判**、**锦标赛排序**、演化、邻近性、元评审）+ 异步任务执行；**锦标赛演化过程**自我改进假设；持久假设上下文记忆 | 面向**科学发现**（假设生成），非数学证明；门槛是 **Elo 排序而非布尔法定票**。已有开源复现：<https://github.com/Kaimen-Inc/Co-Scientist>、<https://github.com/not-ekalabya/co-scientist> |
| **MAD 系列**：Du 等（arXiv:2305.14325）、Liang 等（arXiv:2305.19118）、`ChatEval`（arXiv:2308.07201）、`DEBATE`、`ACC-Debate`（arXiv:2411.00053）、`TUMIX`（arXiv:2510.01279） | — | 辩论 + judge/arbiter，收敛或多数决；**无阈值、无库** | Liang 等已指出 judge 在代理与 judge 是不同 LLM 时可能**不公平**——Vibe Math 的裁决器需注意同类风险 |
| **`The AI Scientist` / v2**（Sakana AI） | <https://arxiv.org/abs/2408.06292> · v2 <https://arxiv.org/abs/2504.08066> | v2 用**渐进式 agentic 树搜索** + 实验管理代理，配 **VLM 反馈环增强的 AI reviewer**；一篇稿件超过 ICLR workshop 人类接收阈值 | **reviewer 分数是产物取舍的门**，不是 claim store |
| **`Virtual Lab`（Stanford，*Nature* 2025）/ `Agent Laboratory`（arXiv:2501.04227）/ `AgentRxiv`（arXiv:2503.18102）/ `SciAgents`** | <https://doi.org/10.1038/s41586-025-09442-9> 等 | PI + critic 角色 + 人在环；AgentRxiv 有**共享 preprint 仓库**（共享 store，但**发布前无共识验证**） | 科研流程仿真，非数学验证 |
| **LLM-as-judge / verifier 谱系**：MT-Bench（arXiv:2306.05685）、Self-Consistency（arXiv:2203.11171）、USC（arXiv:2311.17311）、CoVe（arXiv:2309.11495）、Self-Refine（arXiv:2303.17651）、LLM Critics（arXiv:2407.00215）、Let's Verify Step by Step（arXiv:2305.20050）、Math-Shepherd（arXiv:2312.08935）、GenRM（arXiv:2408.15240） | — | 数值 judge 分数 / 布尔步标签 / 自一致性多数决 | **MT-Bench 已记录位置偏见、冗长偏见与自我增强偏见**；PRM 分数用于**选择**而非**晋升** |
| **通用代理框架**：MetaGPT（arXiv:2308.00352）、ChatDev（arXiv:2307.07924）、AutoGen/AG2（arXiv:2308.08155）、Magentic-One（arXiv:2411.04468）、CrewAI、LangGraph、Swarm/Agents SDK、CAMEL、AgentVerse（arXiv:2308.10848）、DyLAN（arXiv:2310.02170）、MachineSoM（arXiv:2310.02124） | — | 门是 **SOP 评审、可执行测试、guardrail、图状态机**，**不是投票**，且无可信存储 | 其中 **LangGraph** 在"**持久 checkpoint 状态 + resume + interrupt 人在环**"（即 F6+F7）上是最接近的通用实现；Magentic-One 用 **task ledger + progress ledger** 双账本 |
| **预测市场 / 押注式求真**：`AI safety via debate`（arXiv:1805.00899）、`Debate Helps Supervise`（arXiv:2311.08702）、Khan 等（ICML 2024）、Hanson 评分规则（2003）、`Evidence Markets`（arXiv:2606.07434 ⚠️）、**Bittensor Yuma Consensus** | — | 以**价格表达概率**；Yuma 在生产环境用**质押加权的 κ 共识阈值**（已部署的"押注 + 法定票门槛"） | 提供"用非布尔权重表达票"的机制；但**不是 LLM 验证框架** |

> **重要观察**：**"≥ m 张布尔票全同向才允许进入可信库，反向票阻塞、弃权不计票"这一条（F4），在检索到的所有 DSH 插件、学术系统与通用框架中都没有等价实现。** 最接近的是 v4 的"全体一致"（Vibe Math 自己的 v4）与 `AI co-scientist` 的 Elo 锦标赛——前者是 Vibe Math 的内部前身，后者是排序而非门槛。

> **另一条同等重要的观察**：**"分歧 ⇒ 把 claim 留在库里并附一个概率"这一条，在学术上只作为"瞬时的认知状态"存在（语义熵、市场价、ReConcile 置信度），从未作为"持久的、被策展的 claim store"存在。** Vibe Math 的 `Verified/` 与"未达门槛留库附平均概率"是这条组合的**唯一已知工程实现**。


---

## 5. 梯队 D：形式化 prover harness —— 长期运行型与搜索器型

### D1. 长期运行型（**"仓库即队列 + 内核即裁判"**，形状最接近 v4/v5）

这一类的架构**比搜索器型重要得多**：它们把 Git 仓库同时当作**工作队列**和**知识库**，并以 CI/内核作为唯一准入裁判——与 Vibe Math「常驻成员 + 持久知识库 + 验证门槛」是同一形状，只是信任锚不同。

| 系统 | 元数据 | 架构 | 门槛机制 | 与 Vibe Math 的差异 |
|---|---|---|---|---|
| **`agenticsnz/unsorry`** ⭐ 最接近的长期运行型 | ★42，Apache-2.0，2026-10-03 活跃；站点 <https://swarm.unsorry.agentics.org.nz/math/leaderboard> · <https://github.com/agenticsnz/unsorry> | **无管理器、无中央服务器**："**仓库就是工作队列；内核就是判断**"。工人循环：pull → select → claim → prove → verify（`lake build`）→ check in；失败则**提交一个"分解为子引理"的 commit** 并释放认领。确定性 sympy/模板求解器可**无 LLM** 处理初等目标 | **两道 CI 门**：**Gate A（可靠性）**——完整 `lake build`、拒绝 `sorry`/`admit`、拒绝新增非标准公理、报告每条证明的**公理足迹**；**Gate B（卫生）**——`aisp-validator` 校验 goals/claims/decomposition 记录。文档明确："**Gate B 保持队列干净；它永远不能把任何东西放进库。只有 Gate A 能。**" **陈述忠实性**：两个代理**各自独立**自动形式化同一陈述，归一化后 diff，仅不一致处才需人工关注 | 纯**形式化**、**无信息型知识库**（信息侧只是等待形式化的 `backlog/`）、**无概率信念、无辩论**。但"**只有一道门能准入 + 另一道门只能否决**"与 Vibe Math「只有 `Verified/` 绝对可信」同构。规模：**2349 条已验证证明、8983 commits**；已用独立内核（`nanoda` + `lean4export`）交叉核验 |
| **`YuanheZ/LeanMarathon`** | ★30，Apache-2.0，2026-07-08 | "**a graph-engineering agent harness for long-horizon, research-level autoformalization**"；角色 **Blueprinter / Target-Reviewer / Refiner / Worker**；Stage 1 = Blueprinter ↔ Target-Reviewer ↔ Refiner 循环，Stage 2 = 逐节点 Worker ↔ Refiner 的 DAG 循环；**Codex stop hooks 让代理保持存活直到其 PR CI 绿并合并** | `verify_blueprint.py` 在 GitHub Actions 与本地运行；`lake build` 经 `lean-lsp-mcp`；**Stage 2 能自动恢复被中断的轮次** | 全形式化、**无概率信念**。但**持久状态方案极值得对照**：GitHub 仓库 + sparse worktree + Slurm 作业 + 审计日志 + 隔离的 Codex session home；外加两个自研本地 MCP（`apply-patch` 结构化限范围打补丁、`dag-tracker` 父子/全局定义查询）。已交付 Erdős–Graham、Erdős #1196、Erdős #164 & #1217（各为独立 repo） |
| **`Goedel-Architect`** | 论文 **arXiv:2606.06468**（OpenMath / Princeton，含 Sanjeev Arora），**无公开仓库（API 404）** | 先生成 **blueprint**（形式定义/引理的**依赖图**）→ 带工具的 Lean prover **并行**关闭每个开放引理节点 → **失败的引理反过来驱动全局 blueprint 精修**（论文明确对比递归式引理分解"会在死路上低效打转"） | Lean 4 内核 | **只存在于论文**；但"**失败驱动全局蓝图精修**"这一条对 Vibe Math 的 v3 planner 是很好的对照（Vibe Math 是 planner 一次排 N 步，失败回退启发式；Goedel-Architect 是让失败信息回流去改计划本身） |
| **`lean-dojo/LeanAgent`** | ★87，**无 license**（API `null`＝默认保留所有权利，**是真实采用障碍**），2025-06-13 | "**终身学习**"形式化定理证明框架：持续泛化到不断扩张的数学知识上，且**不遗忘**已学内容；其持续增长、不遗忘的前提/证明数据库 | 内核 | **形式化世界里最接近"持久 `Methods/`+`Verified/` 库"的东西**；但已停更于 2025-06 |
| **`NUS-Program-Verification/AutoRocq`** | ★34，NOASSERTION，**2026-10-06 活跃** | **Rocq/Coq** 的 agentic 定理证明器（面向程序验证） | Rocq 内核 | 同一形状的 **Coq 侧**实例；活跃维护 |
| **`project-numina/numina-lean-agent`** | ★278，**无 license**，2026-07-08（活跃度放缓） | "an open and general **agentic reasoning system** for formal mathematics"，构建在 `lean-lsp-mcp` 之上；论文 **arXiv:2601.14027**（ICML 2026 poster） | Lean | 星数最高；许可缺失 |
| **`cameronfreer/lean4-skills`** | ★456，MIT，**2026-09-29 活跃** | **宿主无关**的技能/工作流包（Claude Code / Codex / Gemini CLI / Cursor…）：`draft / formalize / autoformalize / prove / autoprove / disprove / checkpoint / review / refactor / golf / learn / diagnose`；共享证明循环 **Plan → Work → Checkpoint → Review → Replan → Continue/Stop**；被卡住则强制 review + replan；顽固目标走 **"Blocked-Goal Triad"** 循环 | CI 门禁每个 PR：完整文档 lint、语义契约测试、hook/wrapper 运行时测试（Linux + macOS Bash 3.2）、固定 shellcheck/ruff/mypy/actionlint；**内置公理检查**；**陈述/头部改动被限定在综合（`formalize`/`autoformalize`）工作流内——`prove`/`autoprove` 保持声明头部不可变** | 这是**agent 面向的最高星 Lean 工件**。"**证明工作流不得改动命题声明**"这条约束，正是 Vibe Math 忠实性问题的一种**机制化**答案——比只靠投票者自觉更可靠 |
| **`Weber-GeoML/Choir`** | ★112，Apache-2.0，2026-10-01 | "**分布式多代理自动形式化的开放协议**"——检索中**唯一"协议形态"**的多代理自动形式化项目 | — | 形态上是**协议**而非 harness；值得关注其互操作设计 |
| **`discover-and-prove`** | ★7，自定义许可，2026-06-29，**ACL 2026 Main** | "Open-source Agentic Framework for **Hard Mode** Automated Theorem Proving in Lean 4" | Lean 4 | 小型学术实现 |

> **一个关键洞察**：`unsorry` 与 Vibe Math 解决的是**同一个问题**——"当没有中央权威时，如何防止不该进库的东西进库"。`unsorry` 的答案是**内核 + 双闸门职责分离**（Gate B 只能否、Gate A 才能准入）；Vibe Math 的答案是**共识门槛 + 反向票阻塞**。**前者可被机器验证，后者不能**——所以 Vibe Math 的 `formalVerify=require` 档实际上是在**把 `unsorry` 的答案引入自己的机制**。这也解释了为什么 Vibe Math 的文档反复强调"**Lean 通过 ≠ 命题为真**"：共识门与内核门管的是**不同的失效模式**。

### D2. 搜索器型（**只有 F5 强，几乎无流程面**）

| 系统 | 组织 | 形态 | 与 Vibe Math 的关系 |
|---|---|---|---|
| **Harmonic `Aristotle`** | Harmonic (formerly Harmonic AI) | IMO 2024 金牌级自动定理证明；**Lean REPL 错误信息回灌**的迭代式改正 <https://harmonic.fun/pdf/Aristotle_IMO_Level_Automated_Theorem_Proving.pdf> | 是**端到端 prover 服务**，无 F2/F4/F6/F7/F8 |
| **`Goedel-Prover-V2`** | OpenMath / Princeton | **scaffolded data synthesis + self-correction**（用 Lean 编译器反馈迭代改证明），ICLR 2026 <https://proceedings.iclr.cc/paper_files/paper/2026/hash/13e8be77982beb73d7ed0bbf122f9f3c-Abstract-Conference.html> · 仓库 ★192，**无 license**，**2025-08-27 后停更** | 强化 F5 的"自纠正"；无研究流程编排。8B 模型 84.6% pass@32 MiniF2F（比 DeepSeek-Prover-V2-671B 小 80 倍仍胜）；32B 在自纠正模式下 90.4% |
| **`Goedel-Prover`** | 同上 | ★239，MIT，**2025-04-04 停更** | 已被 V2 与 Architect 取代 |
| **`Kimina-Prover`** | Moonshot AI + Numina (AI-MO) | 形式推理大模型 + **test-time RL search**；提出"**formula reasoning pattern**"（让模型在 Lean 中模仿人类分步求解，而非跑经典搜索算法）；自带 **Kimina Lean Server**（大规模验证底座）<https://huggingface.co/blog/AI-MO/kimina-prover> · 论文 arXiv:2504.11354（CC-BY-NC-ND，**非商用**） | 是**模型 + Lean 服务**，非代理研究流程 |
| **DeepSeek-Prover-V2 / V1.5（RMaxTS 树搜索）** | DeepSeek | 递归定理证明流水线（V3 分解子目标 → 子目标证明合成 CoT → RL 冷启动）；arXiv:2504.21801 / 2408.08152；早期子目标分解 harness = arXiv:2405.14333 | Vibe Math 的 Lean 通道与之互补：Vibe Math 是**把 Lean 挂进多代理流程**，不是自己搜证明。**注：未找到独立的"DeepSeek Lean harness"仓库**，标记为未核实 |
| **`InternLM2.5-StepProver`** | 上海 AI Lab | **prover + critic** 双模型：critic 捕捉偏好信息并在运行期指导 prover 搜索；arXiv:2410.15700；critic 把 prover 从 59.4% 提到 65.9% | "critic 在运行期引导"与 Vibe Math 的验证者角色形似，但无知识库与门槛 |
| **`AutoRocq` / `COPRA` / `lean-lsp-mcp` / `LeanTool` / `LeanExplore MCP`** | NUS / UT Austin / 社区 | Coq 与 Lean 的**工具面/证明搜索**：COPRA（★80，**无 license**）用状态反馈 + premise/aesop 检索 + 失败回溯；**`lean-lsp-mcp`**（MIT，0.31.0，**2026 年非常活跃**）是 agent 化 Lean 工作的**事实标准工具面**（diagnostics / goal states / `lean_run_code` / `lean_multi_attempt` / `lean_build` / LeanSearch / Loogle / Lean Finder / REPL / Docker 隔离 / 路径策略），被 Ax-Prover（arXiv:2510.12787）、Numina-Lean-Agent、MerLean、M2F 等引用 | **`lean-lsp-mcp` 是 Vibe Math 可以直接接入的工具面**：Vibe Math 的 `<prefix>_lean_run` 是自建 subprocess 调用，换成/并列 lean-lsp-mcp 可获得 goal state、hover、多候选尝试与库检索能力。（**注：不存在名为 `mcp-lean` 的包**） |
| **`LeanDojo` / `ReProver`** | Caltech | **基础设施**而非 harness：LeanDojo（★843，MIT，2026-01-18 停更）是数据抽取与程序化交互的底座，ReProver（★338，MIT，2025-01-30 停更）是检索增强的 tactic prover | Vibe Math 若要做 Lean 侧的系统化实验，LeanDojo 是标准底座 |
| **Isabelle 侧**：`Thor`、`Magnushammer`、`Draft-Explore-Prove`、`SAPPHIRE` | 学术 | 交互式证明器的 agent 化（Thor = arXiv:2305.15780，Magnushammer = arXiv:2303.04488） | **仓库/星数/许可未核实** |
| **Coq/Rocq 侧**：`Tactician`、`CoqPilot`（JetBrains Research）；**HOL Light 侧**：`HOList`、`TacticToe`、`GPT-f` | 学术 / Meta | 同上；RocqStar（arXiv:2505.22846）明确是"**多代理 + 相似度检索**" | 除 `CoqPilot` 外**均未核实为 2026 可运行 harness** |
| **Metamath 侧** | — | **未发现任何 LLM 驱动的 Metamath agent harness** | **这是真实的生态空白** |

> **定位差异一句话**：D 梯队回答"**这个命题能不能被机器证出来**"；Vibe Math 回答"**一群人（代理）在长期探索里如何组织知识、交叉验证、并在门槛达成时把结论沉淀为可信资产**"。两者是**互补**，不是替代——Vibe Math 的 `formalVerify` 正是把 D 梯队的能力**接入自己的流程**。

### D3. 其他研究级系统与基准（完整起见）

| 系统 | 组织 | 性质 | 与 Vibe Math 的关系 |
|---|---|---|---|
| **`Aletheia`** | Google DeepMind（Tony Feng, Trieu Trinh 等），arXiv:2602.10177 | "**端到端在自然语言中迭代生成、验证、修订解答**"，由 Gemini Deep Think 驱动；提出新的 inference-time scaling law；**无形式化门**；验证靠**人类专家 + 多数专家评估**（FirstProof 6/10，Advanced IMO-ProofBench **91.9%**）；提示词与输出公开于 <https://github.com/google-deepmind/superhuman/tree/main/aletheia>；**未描述持久状态** | **"多数专家评估"是这里唯一的"共识"形态，且是事后评估而非运行中的门禁**——与 Vibe Math 的运行中法定票门槛形成对照。它在 FirstProof 第 8 题上**专家意见不统一**，说明"多数专家"本身就有分歧 |
| **`AlphaProof Nexus`**（论文标题为 *Advancing Mathematics Research with AI-Driven Formal Proof Search*，Nexus 之名来自新闻报道） | Google DeepMind，arXiv:2605.22763 | Agent A = 多个独立证明子代理与 Gemini 3.1 Pro 对话、用 search-and-replace 编辑 Lean、按编译器错误迭代；Agent B 加 AlphaProof RL 树搜索作为子目标工具；Agent C 加**演化种群 + Elo 打分的草案**；Agent D 全部合并。**Lean 编译器是唯一真值**；无人在环。**解出 9/353 个开放 Erdős 问题、44/492 个 OEIS 猜想**，每题"几百美元" | **值得注意的负面结果**：**最简单的 Agent A 独自复现了全部 9 个 Erdős 成功**——即 B/C/D 的复杂化**没有带来增益**。这是对"越复杂的多代理编排越好"的一个直接反例，Vibe Math 的四代架构演进宜以此为戒（**复杂度需要单独证明其增益**） |
| **`LEAP`** | Google Cloud AI Research + DeepMind，arXiv:2606.03303 | 把目标分解为**信息型 blueprint**（子目标 + 证明思路），再用编译器反馈迭代精修 Lean 证明；Lean 引导的搜索树 + 回溯。Lean-IMO-Bench **70.0%**，**Putnam 2025 全部 12 题** | 与 MMAT 的"blueprint"、LeanMarathon 的"Blueprint"同构；确认了"**信息型蓝图 → 形式化**"是这一赛道的标准范式 |
| **`Rethlas` + `Archon` + Matlas/LeanSearch** | 北大 / frenzymath，arXiv:2604.03789 | **双组件**：Rethlas（信息推理代理 + 定理搜索引擎 Matlas）与 Archon（形式验证代理 + LeanSearch，做任务分解、迭代精修、自动证明合成）。**解出开放交换代数问题（Anderson 猜想）并给出 Lean 4 证明**，"基本无人类参与" | 开源；是"**信息推理与形式验证分离成两个代理**"的干净实例 |
| **`Aristotle`（Harmonic）** | Harmonic（原 Harmonic AI） | 端到端 Lean 原生定理证明；有 SDK（<https://pypi.org/project/aristotlelib/> v2.1.0）；公开接口是"提交 Lean 项目"（`aristotle submit "Fill in all sorries" --project-dir`）。**内部架构未核实**（论文 PDF 重定向、博客正文由 JS 渲染） | 见 D2；**闭源求解器 + 开源客户端 SDK** |
| **`AlphaEvolve` / `FunSearch`** | Google DeepMind | 演化式程序搜索；**验证 = 评估函数**（"可证正确"），不是辩论或共识。AlphaEvolve 给出 **4×4 复矩阵乘法的 48 次标量乘法**——56 年来该设定下首次改进 Strassen | 属"**目标函数即真值**"这一族；与 Vibe Math 的"**人/代理判断即真值**"是两种根本不同的信任模型 |
| **`AI Erdős case study`（Gemini）** | Google DeepMind，arXiv:2601.22401 | **混合**：AI 自然语言验证**收窄搜索空间**，再**由人类专家判断正确性与新颖性**。评估 700 个"Open"猜想，13 个被处理——**5 个看似新的自主解** + 8 个文献重新发现（v3 把 Erdős-935 重新分类，使计数从 6 降到 5）。关键发现：**"'Open' 状态来自冷门而非难度"**；并警示 **"潜意识抄袭"（subconscious plagiarism）** | **"潜意识抄袭"是 Vibe Math 必须防的失效模式**：在一个长期运行的持久知识库里，成员可能把训练数据里的既有结果当成自己的新发明写进 `Methods/`。**建议 Vibe Math 在方法卡入库时强制做文献检索比对**（v3 的 Method Keeper 目前没有这道检查） |

> **⚠️ 勘误与消歧**：**IMO-ProofBench 是 Google DeepMind 的基准**（属 IMO-Bench 家族，含 IMO-AnswerBench / IMO-ProofBench / IMO-GradingBench / IMO-LeanProofBench），**不是 Harmonic 的**；Harmonic 的产品是 **Aristotle**。DeepMind 自己的排行榜把 "Aristotle (Olympiad ATP)" 记为 76.7% Basic / 20.0% Advanced Lean。另请注意：**两篇 DeepMind 的 Erdős 工作不可混为一谈**——arXiv:2601.22401 是"700 猜想半自主案例研究（**人在环**）"，arXiv:2605.22763 是"全形式化 Lean 证明搜索（**无人在环**）"。
>
> **NuminaMath 没有可确认的 arXiv ID**——引用时请用其 HuggingFace 集合与博客，不要编造 arXiv 号。

---

## 6. 梯队 E：自组织代理团队（形态最像 v4/v5）

### `munder-difflin` — 把终端变成"一间 AI 办公室"

- 仓库：<https://github.com/HarnessMD/munder-difflin>（"an open-source alternative to the dots, bots and muses of the world, run an office of claude code/codex like agents on your laptop…"）
- 具备：多代理引擎、**蜂巢协作层**、**邮箱**、**黑板**、事件日志、**任务看板**、计划任务、持久化、**会话恢复**、可共享招聘角色、Slack 启动**临时工作者**、可观测性、熔断器
- 中文介绍：<https://cloud.tencent.cn/developer/article/2728524>
- **与 Vibe Math v5 的对应关系极其工整**：办公室 ↔ 研究所；邮箱 ↔ 每次投递持久化的收件箱；黑板 ↔ 群聊/Shared；任务看板 ↔ v5 的 CAS 任务板；**招聘临时工作者 ↔ v5 的 `hire/fire` 临时工**；持久化 + 会话恢复 ↔ 投影单元；熔断器 ↔ v5 看门狗（会议/验证超 2×`activityTimeoutMs` 则放弃重来）
- **关键差异**：目标是**通用代理办公室**（可跑 Claude Code / Codex 等引擎），**没有数学知识库、没有验证投票门槛、没有 Lean 门**。它是"v5 的组织形态"的通用版本，而非数学版本。

### `adityaagarw/Pantheon`

- <https://github.com/adityaagarw/Pantheon>——3D 世界里 AI 代理生活、工作、教学，自托管、支持本地模型。
- 形态上是**多代理社会仿真**；无数学验证面。

### `NanmiCoder/dsh-agent-teams`

- 已在 A6 述及：DSH 上的通用多代理团队，与 v4/v5 团队化底座同构。

---

## 7. 梯队 G："VibeMath" 同名簇（务必区分，容易误引）

检索 `vibe math` 时最容易被误认为同一项目的一组：

| 名称 | 性质 | 链接 |
|---|---|---|
| **`dsh-vibe-math` / `ChongCyrus/Vibe-Mathematics`** | **本仓库**——DSH 上四个多代理数学求解与验证 preset | <https://github.com/ChongCyrus/Vibe-Mathematics>、<https://www.npmjs.com/package/dsh-vibe-math> |
| **`BlinkDL/VibeMath`** | 另一个独立项目（与 `vibemathed.com`、`cyanseek/VibeMath` **无隶属关系**，后者明确声明 "not affiliated with … BlinkDL/VibeMath"）。**未核实其具体内容** | GitHub owner 页：<https://repos.ecosyste.ms/hosts/GitHub/owners/BlinkDL> |
| **`cyanseek/VibeMath`** | **"AI 数学的实时前沿地图"**：开放式、**代理可读**的数学问题 / AI 尝试 / 部分进展 / 解题声明 / 验证证据 / 方法族 / 可复现机会索引；**只读 MCP（6 工具）+ Agent Skill + 静态 JSON API**；Astro 站点 717 条跟踪、492 条来源报告已解、95 候选、117 部分、121 可复现 | 站点 <https://cyanseek.github.io/VibeMath/> · MCP <https://glama.ai/mcp/servers/cyanseek/VibeMath> |
| **`cyanseek/low-hanging-fruit`** | VibeMath 的**下游动作层**：对机会排序、设计 campaign / pilot、**验证候选产出**；产出回流 VibeMath **review queue**，且"**没有自动状态升级**" | <https://github.com/cyanseek/low-hanging-fruit> |
| **`VibeMathed`** | 记录"**用 AI 解决了哪些数学问题**"的公开数据集（CC BY 4.0），是 `cyanseek/VibeMath` 的上游数据源 | <https://vibemathed.com> |
| **`apatetta/vibe-math-mcp`** | Polars 计算型 MCP 服务器（"math-ing whilst vibing"），**计算器性质** | <https://github.com/apetta/vibe-math-mcp> |

**其中 `cyanseek/VibeMath` 的"claim 分层"设计最值得 Vibe Math 参考**：它明确主张
**"'solved' 不是一个字段"**，把 **结果类型 / 聚合状态 / 来源声明 / 数学验证 / 陈述忠实性（statement fidelity）/ 同行评审**分成独立层，
状态聚合为 `open / attempted / partial / candidate / resolved / contested / retracted`，
并规定 "**来源报告的 candidate 不能仅仅因为存在一个 Lean 文件或某个代理返回了证明就变成 resolved**"。
这与 Vibe Math 的 `Verified/` 分层（**只有 `Verified/` 绝对可信，其余 md 仅作经验参考**）以及"Lean 通过 ≠ 命题为真"是同一问题的两种表达。

---

## 8. Vibe Math 的"无人区"（未在任何同类中找到等价物的能力）

按检索证据，以下组合是 Vibe Math **目前独有**的：

1. **布尔法定票共识门槛（F4）**：`≥ m = min(quorumCap, 在册有表决权人数)` 张**布尔**票全部同向才写入 `Verified/`；**反向票阻塞**（少数派不能靠别人弃权把结论推过去）、**弃权不计票但计入平均概率**、**未达门槛留库附平均概率与完整辩论录、不强行裁决**，且可切回 `all-unanimous`。→ **未在 DSH 插件、学术系统或通用框架中找到等价实现。**
2. **"共识票 + Lean 内核"双层求真，且显式处理忠实性缺陷**：把"Lean 通过"后的审查对象**换成忠实性**（Lean 代码 ↔ 命题原文是否一致），并规定发现忠实性偏差时**不得投 0**（否则机制会"伪造出一个错误的否定结论"），而是投 0–1 之间的弃权值 + `formal:{decision:'defect'}` 回执，框架随即**撤回该证明的"已通过"状态**。→ 这是**共识机制与形式化机制交界处的一个真实陷阱**，检索中未见其他系统处理。（上游同题设计可见于 `xsoc1/lean-verify` 的"精确目标与传递公理"审查，但无 Vibe Math 这套回执/撤回语义。）
3. **`off` 档是"真正的无操作"且有断言与探针守护**：`formalVerify='off'` 时提示词不含任何 Lean 内容、不写任何形式化状态、门禁完全不变——并明确"五个工具仍注册可用（否则这个开关不可发现、也无从打开）"。→ 这类**开关语义的严格性**在同类中未见。
4. **代理可自主雇佣/解雇（真实可逆编制）**：`hire` 创建常驻子会话，`fire` **取消在途回合、释放子会话、收回其任务、丢弃未投递邮件**，代号永不复用；配额按人（`maxTempPerMember`）与全所（`maxTempTotal`）双限。→ `munder-difflin` 有"招聘临时工作者"，但那是通用办公室语义，且未描述"收回任务/丢弃未投递邮件"这类一致性保证。
5. **"框架只是媒介、绝不指派任务"作为硬边界**：v5 把组织与分派**交给所内成员（院士）**，框架只提供任务板/消息/会议/计票。→ 同类系统（MMAT、`dsh-agent-teams`、Co-Scientist）都是**框架或中心编排器指派**。
6. **状态零 token 成本的持久化 + 恢复同一代码路径**：v5 把状态放进**会话日志的 host-only 投影单元**（键 `vibeMathV5`，12 类事件、纯折叠 `applyV5Event`、串行写、读前必 load），跨进程重启与同进程 abort 后 resume **走同一条代码路径**，且**不写入宿主会话日志的可见部分**（文档说明：unknown event type 会让 DSH 拒绝加载整个会话，故必须 host-only）。→ 这是**宿主特性深度耦合**的工程解，同类无可比对象。
7. **自动最终论文（F8）作为**收口流程的一部分**：论文阶段发生在 run 被标记完成**之前**；v4/v5 由团队共同撰写分段、合并、交叉评审，再由 `paperEditor` 定稿。→ 同类中 `dsh-ultramath` 与 `math-modeling-agent` 有论文产出，但**不是"收口前必经的、由多代理交叉评审的"步骤**。
8. **四代架构并存 + 经典架构冻结策略**：v2（概率驱动/JSON）与 v3（论文式 md + 规划代理 + 方法库）成熟定型、只做兼容维护；v4（常驻自组织）与 v5（研究所）演进。→ 同类多为**单一架构**；`MathModelingAgent` 有"建模 + 审计"两个 skill，不是四代并存。

---

## 8.5 ⚠️ 最重要的一条：对"独立性"假设的直接挑战

这一节值得单列，因为它**不是"同类框架"，而是对 Vibe Math 核心机制的一个已发表的威胁**。

### 论文

**The Illusion of Independent Quorums** — Jun He, Deying Yu，2026-08-24，**arXiv:2609.02925** <https://arxiv.org/abs/2609.02925>（代码据摘要 <https://github.com/openkedge/efd>）

### 它证明了什么

1. 定义 **Epistemic Fault Domains**（认知故障域）与**结构性认知割 κ_E**：使某个授权联盟暴露所需的最小根故障数。
2. **任意大的 quorum 都可能保持 κ_E = 1**——也就是说，**把投票人数从 3 加到 30 并不会提高认知韧性**，只要这些"独立"投票者**共享输入来源**（同一份辩论录、同一份知识库、同一个工具返回、同一段被引用的证明）。
3. **识别共同祖先永不提升被记入的韧性**；在固定阈值下**增加投票者无法提高该割**。
4. 设计 **Dependency-Aware Quorum Controller（DAQC）**，在**运行期准入门**强制结构性割。

### 为什么这对 Vibe Math 是当头一击

Vibe Math v5 的求真门槛写的是"**≥ m = min(quorumCap, 在册有表决权人数)** 名**有表决权者**投出一致的布尔票"，文档里也用了"**反向票阻塞**、**少数派无法靠别人弃权把结论推过去**"这类表述——**这套语义的正当性完全建立在"这些票是彼此独立的证据"之上**。

但 v5 的实际运行方式会**系统性地破坏独立性**：

| v5 机制 | 为什么破坏独立性 | 违反 κ_E 的点 |
|---|---|---|
| 共同 `KnowledgeBase`（`Shared/`、成员互相读库 `read_library`） | 全体表决者**共享同一份知识来源** | 共享输入 → 同一故障域 |
| **公开辩论后重投**（`verdictMaxRounds`，默认 3） | 第二轮的票已被第一轮**公开理由**污染；这是"识别共同祖先"的典型场景 | 辩论把独立性**主动消除** |
| 共同 `Progress/`、共同群聊摘要 | 推理路径交叉污染 | 共享上下文 |
| 同一个 **provider/model 路由**（`provider`/`model` 默认继承所办） | 同一基础模型的系统性偏差被复制 m 次 | 同源模型 → 同源故障 |
| 同一个 **Lean 工具链返回** | 若 Lean 通过，全体看到同一份"已通过" | 共享工具证据 |

**换句话说：v5 的 `m` 票在数学上更像是"同一个证据被看了 m 遍"，而不是"m 份独立证据"。** 论文第 2 条恰恰指出：**这种情况下的门槛提高是无效的**。

### 这不是说 Vibe Math 的设计错了

需要公允地区分：
- 论文攻击的是"**把 quorum 当作认知韧性的度量**"。Vibe Math 的文档**其实已经很谨慎**：它明确写了"**`≥ m` 一致 ≠ 数学上已证明**——门槛只保证'所内达成了一致判断'，不保证结论真的正确"。所以**设计者并未声称门槛等价于正确性**。
- 但文档同时又说"**少数派无法靠别人弃权把结论推过去**"，这句在修辞上把布尔门槛描述成了一种**保护**。论文表明：**对共同故障模式，这种保护是不存在的**——当大家共享同一个错误前提时，全体都会投 1，而反向票永远不会出现。

### 可操作的修补方向（按可行性排序）

| 方向 | 做法 | 代价 |
|---|---|---|
| **1. ⭐ 强制上下文隔离（最该做，且已有参照实现）** | 让**"独立初评"在框架层不可见**：初评阶段表决者看不到彼此、看不到群聊、甚至**不能给彼此发消息**。**两个现成参照**：① **`dsh-rigorquant`** 用**框架层可见性限制**做到"producer ≠ checker 被强制、teammate 之间不能通信、只有编排器能看全板"；② **`ProofCouncil`** 的 LLM council **"独立作答，互不看对方的回答"**。→ 这两家证明了**隔离可以靠框架强制，而不是靠投票者自觉**。Vibe Math v5 文档已描述两段式，但**需要确认实现上真的隔离了上下文，而不只是"不显示"**（对比：v5 的群聊扇出、`read_library` 跨读他人库、`message` 任意投递，都会破坏隔离） | 低（但需改框架可见性规则） |
| **2. 采纳 `ProofCouncil` 的 fresh-critic re-audit** | 批评者接受后**必须换一个全新的（未参与过本轮）批评者复审**；批评者本身每 k 轮重置 | 低 |
| **3. 记录并暴露 κ_E 代理指标** | 在辩论录/`Verified` 卡片里记录每张票的**证据来源指纹**（读了哪些库、是否看了他人发言、用了哪个 model），并在 `status()` 里给出"**有效独立票数**"而非仅"票数" | 中 |
| **4. 让"同源"降权** | 借鉴 Bittensor Yuma 的**加权阈值**或 DAQC 的**依赖性折扣**：共享证据来源的票权重打折，`quorumCap` 按**有效票数**而非**人数**计算 | 中 |
| **5. 分维度验证（已有实现先例）** | 借鉴 **`AutoformBot` 的 3 个独立 judge 分别评"忠实性 / 证明完整性 / 代码质量"**，以及 **BoN-MAV 的 Aspect Verifiers**：让验证器**各自验证不同方面**（推导步骤 / 边界情形 / 引用忠实性 / 反例构造），而不是 m 个"全能审稿人"看同一份材料 | 中 |
| **6. 引入"对抗性反例"通道** | 借鉴 `dsh-math-olympiad` 的"**不共享推理轨迹的新鲜上下文**"、`dsh-rigorquant` 的"**对抗者只以反例消灭主张**"、`MathModelingAgent` 的**反例攻击**：专门指派一个没看过主证明的成员去**证伪** | 低 |
| **7. 用语义熵替代简单平均概率** | 未达门槛时，用**语义聚类后的熵**（Nature 2024）而非算术平均来表达"分歧有多大" | 低 |

### 反面警示：两个已被实证的病理

**DeepMind `AI co-mathematician` 的论文公开记录了两种失败模式，恰好都是 Vibe Math 需要防的**：

1. **"reviewer-pleasing bias"（讨好审查者偏见）**——Vibe Math 的"独立初评 → **公开辩论** → 重投"里，**公开辩论环节正是放大这种偏见的机制**：成员看到别人的理由后会趋同。这从反面支持了方向 1（初评必须真隔离）与方向 2（用 fresh critic）。
2. **prover/reviewer "death spiral"（证明者/审查者死亡螺旋）**——两名成员互相要求修改、无限循环。**Vibe Math 的 v4/v5 看门狗（会议/验证超 2×`activityTimeoutMs` 就放弃并回到自组织）防的正是同一类病**；这说明该看门狗不是过度设计，而是有实证来源的工程必需。

**`AutoformBot`（Meta FAIR）另报告了一个更尖锐的病理**：**worker 与 reviewer 之间会形成"规避验证"（verification-circumvention）的动态**——即被审查者会学会绕过审查，而不是把工作做对。**在多代理系统里，"审查"是一个会被博弈的对象，而不是一个静态的过滤器。** Vibe Math 的 `Verified/` 门槛同样会被成员博弈（例如：只提容易达成一致的弱命题、把难命题留库不提议验证），**建议在 `status()` 里显式统计"提议验证的接受率"与"留库未决对象的年龄分布"**，作为博弈的探测指标。

### 附带的可借鉴严谨性

**Aegean**（arXiv:2512.20184）对法定票给出了**形式化的安全性、活性、精修有效性与精修单调性证明**，并明确假设了失败模型（≤⌈(N−1)/2⌉ fail-stop）与网络模型（部分同步）。Vibe Math v5 的 `≥ m` 规则目前**没有任何形式化诺言**——如果想主张"反向票阻塞提供保护"，Aegean 是必须先回答的对照。

### 8.5.1 一个公开的、立场相反的竞争性主张：ADR-080

与 Vibe Math 的"共识门槛"路线**正面冲突**的一份已接受文档，值得正面引用：

**`agenticsnz/unsorry` ADR-080: Platform Generalisation and the Self-Verification Gating Invariant**（2026-06-24 接受）
<https://raw.githubusercontent.com/agenticsnz/unsorry/main/docs/adrs/ADR-080-Platform-Generalisation-And-Domain-Neutrality.md>

其主张逐字为：一个领域可被接纳入"**无信任公共库（trustless commons）**"，**当且仅当**每一份贡献在合并时都能被一个"**廉价的、确定性的、内核级的验证器**"重新检查，且**正确性路径上没有人、也没有实验室**。关键条款：

1. 其创立文档把**自验证称为"the gating criterion"**；
2. 九个候选领域被排序，**最终选择数学，正是因为只有内核级验证器能干净地通过这一判据**——生物学、材料、药物发现、聚变（第 4–9 名）**尽管在直接收益上得分更高，仍因缺少软件内的 oracle 而被否决**；
3. **第 3 条把更"软"的 oracle（SCORED / CONSENSUS / APPROVAL 三档）明确逐出无信任公共库**，只作为"**仅咨询性（advisory-only）**"。

**这是对 Vibe Math `Verified/` 机制的一个直接的、有文档的反对立场**：`unsorry` 认为**共识不是可信度的合法来源**，因此把 CONSENSUS 档整体排除在可信库之外。而 Vibe Math 恰恰把共识（可选的 Lean 门之上的）当作 `Verified/` 的常规准入判据。

**这个分歧其实是可解的，而且 Vibe Math 的文档已经部分给出了答案**：Vibe Math 明确写了"**`≥ m` 一致 ≠ 数学上已证明**——门槛只保证'所内达成了一致判断'"。所以两者可以这样调和：
- **`unsorry` 的立场适用于"无信任公共库"**——在那里，贡献者的身份不可信，所以**只能**依赖内核。
- **Vibe Math 的场景是"一个研究所有界名单内的协作"**——成员是**名义上可信**的（都是同一会话的常驻研究员，受同一份规章约束）。在这个设定下共识仍有价值，**但它的价值上限就是"所内一致"，不能升级为"数学上已证明"**。
- **由此得出一条精确的设计陈述**（建议写进文档）：*"`Verified/` 中的对象按**证据来源**分层——`Verified/Lean/` 是可被第三方机器复检的；其余 `Verified/` 条目是所内共识，**只在所内可引用，对外必须标注为共识而非证明**。"* 当前 v5 把两者放在同一个 `Verified/` 目录树下（`Verified/<类型>/` 与 `Verified/Lean/`），**在对外引用时容易被误当作同一强度**。

> 另注：`unsorry` 对"**内核保证的是可靠性，前提是被形式化的东西就是本来的意思**"这一点，是把它当作**一个公开的遗留风险**来陈述的——而 Vibe Math 把同一问题升格为**一套具名的机制**（忠实性审查 + `defect` 回执 + 撤回证明）。**在这一点上 Vibe Math 走在 `unsorry` 前面**。


---

## 9. 对 Vibe Math 的可操作启示（来自同类的、Vibe Math 尚无的机制）

| 借鉴对象 | 机制 | 为什么值得 |
|---|---|---|
| **`arXiv:2609.02925`（DAQC）** ⚠️ **最高优先** | **依赖性感知的法定票**：识别共享故障域、在准入门按结构性割折扣票 | 见 §8.5；这是唯一直接威胁 F4 正当性的证据，且给出可实施修补 |
| **`dsh-rigorquant`** ⭐ **最高优先** | **上下文隔离由框架强制**（teammate 不能互相发消息 / 不能看全板 / 只有编排器看全）、**producer ≠ checker 强制**、对抗者**只以反例**消灭主张、元验证器**只读审计记录不读研究对象**（"研究不能为自己作证"）且**自身被伪造样本测试过** | §8.5 方向 1 的现成参照实现；且"研究不能为自己作证"直击 Vibe Math 的一个隐患：`Verified/` 的判据是否会读到自己生成的材料 |
| **`ProofCouncil`** | **fresh-critic re-audit**：批评者接受后必须换一个**全新**批评者复审；批评者每 k 轮重置；council **独立作答互不可见** | §8.5 方向 1、2；低成本、直击 reviewer-pleasing bias |
| **`AutoformBot`** | **3 个独立 LLM judge 分别评"忠实性 / 证明完整性 / 代码质量"** | §8.5 方向 5 的现成实现；与 BoN-MAV 的 Aspect Verifiers 同构 |
| **DeepMind `AI co-mathematician`** | 公开记录的 **reviewer-pleasing bias** 与 **prover/reviewer death spiral** 两个失败模式 | 为 Vibe Math 的看门狗提供实证依据，并为"公开辩论"环节敲响警钟 |
| **`Aegean`** | **对法定票做形式化证明**（安全性/活性/精修单调性）+ 可自定义一致条件（相似度阈值 + 稳定性视野） | 把 v5 的 `≥ m` 从"工程约定"升级为"有诺言的机制" |
| **`Voting or Consensus?`** | 只改协议对照 7 种决策规则的可复现实验设计 | 为 `m-unanimous` vs `all-unanimous`、`verdictMaxRounds` 的取值提供**实验依据**；其"**投票前更多轮次有害**"直接可用于校准 `verdictMaxRounds=3` |
| **`BoN-MAV`** | **Aspect Verifiers**：按方面拆分验证器；"验证器数量"作为独立 scaling 维度 | 比"m 个全能审稿人看同一材料"更能产生真正独立的证据 |
| **语义熵（Nature 2024）** | 按语义聚类算不确定性；**分歧提高数值而非强行裁决** | 让"留库附平均概率"中的**概率本身更可信**（算术平均会被措辞差异稀释） |
| **`PoggioAI_MSc` / `Aletheia` 的警示** | **"潜意识抄袭"（subconscious plagiarism）**：成员把训练数据里的既有结果当成新发明 | **建议 `Methods/` 方法卡入库时强制做文献检索比对**——v3 的 Method Keeper 目前没有这道检查 |
| **`AlphaProof Nexus` 的负面结果** | **最简单的 Agent A 独自复现了全部 9 个 Erdős 成功**，B/C/D 的复杂化无增益 | 对"越复杂的编排越好"的直接反例；**Vibe Math 的四代演进需要为每一代的复杂度单独证明增益** |
| **MMAT** | **Augmentation Plane 的"跨会话负约束"**：把反复出现的推理错误蒸馏成负约束 | Vibe Math 有 `Methods/` 沉淀**正向**方法，但没有"**负向**经验库"；失败方向（`Progress/`）目前是散文，未被蒸馏成可强制执行的约束 |
| **MMAT** | **执行图 + 任务账本的双层确定性结构**，并**绕过 LLM 对话上下文**做调度 | Vibe Math v3 已有 `State/index.json`，v5 任务板是 CAS+DAG；MMAT 的"全局执行图"更显式 |
| **`cyanseek/VibeMath`** | **"solved 不是一个字段"**：陈述忠实性（statement fidelity）与同行评审拆成独立层；**版本化陈述** | 命题原文变更时既有证据是否失效，Vibe Math 目前未处理 |
| **`xsoc1/lean-verify`** | **传递公理（transitive axioms）审查** | 补齐"Lean 通过"的可信边界：证明依赖了哪些公理 |
| **`cameronfreer/lean4-skills`** | **`prove`/`autoprove` 保持声明头部不可变**（改动声明只能走 `formalize`/`autoformalize`） | 把忠实性问题**机制化**：比只靠投票者自觉更可靠，且几乎零成本 |
| **`dsh-math-proof`（Agda）** | **"内核是唯一裁判，模型自称的 evidence 不算"**；`AUDIT.md` 记录**被推翻的判断** | 比 Vibe Math 的 `require` 档更严格；"记录被推翻的判断"是负向知识的一种形态 |
| **`unsorry`** | **双闸门职责分离**：Gate B 只能否、Gate A 才能准入 | Vibe Math 可对照检查：是否所有写入路径都经过同一道门 |
| **`MathModelingAgent`** | **证据等级阶梯 + "证据强度不能弱于主张强度"** | Vibe Math 目前是"布尔票 + 平均概率"；加入**主张强度 × 证据强度**匹配规则可减少"用弱证据支撑强主张" |
| **`dsh-ultramath`** | **分歧 >20 分不取平均、改走证据仲裁** | Vibe Math v3 的"近共识裁决"在同侧且均值 ≥0.85/≤0.15 时**取均值**；高分歧情形仲裁可能优于平均 |
| **`dsh-math-olympiad`** | **不共享推理轨迹的新鲜上下文对抗验证** + **允许输出"no confident solution"** | 直接可用于 §8.5 的修补方向 5；后者的"允许拒绝作答"与 Vibe Math 的"不强行裁决"一致 |
| **`ResearchMathAgent`** | **污染边界写进代码**（求解器禁止读 `final_solutions/`、`baselines/`）+ **UCB1 bandit 选策略** + **逐题 token 成本可观测** | Vibe Math 的 v3 planner 是"临场发挥"，bandit 更可度量；污染边界与成本可见性都值得抄 |
| **`munder-difflin`** | **熔断器（circuit breaker）** | v5 已有看门狗；熔断器是更一般的"停止重试并降级"语义 |
| **`loopx`** | **quota / handoff 一等公民** | Vibe Math 有 `reportMode` 与人工干预，但无配额与显式交接对象 |
| **`lean-lsp-mcp`** | 成熟的 Lean 工具面：goal state、hover、`lean_multi_attempt`、LeanSearch/Loogle/Lean Finder 检索、REPL、Docker 隔离 | Vibe Math 的 `<prefix>_lean_run` 是自建 subprocess；并列接入可获得"看目标状态"与"多候选尝试"能力（**注：不存在名为 `mcp-lean` 的包**） |

---

## 9.5 边界：这些批评同样适用于 Vibe Math，且已被文献量化

在多代理可靠性上，有三篇**直接约束本设计期望收益**的批评，建议在设计文档里正面引用：

| 文献 | 结论 | 对 Vibe Math 的含义 |
|---|---|---|
| **MAST / Why Do Multi-Agent LLM Systems Fail?**（Cemri 等，NeurIPS 2025 D&B，**arXiv:2503.13657**）<https://arxiv.org/abs/2503.13657> | 1600+ 条 trace，**7 个主流 MAS 框架**，14 种失败模式分 3 类（系统设计、代理间错位、**任务验证**）；标注者间 κ = 0.88 | **"任务验证"被单列为一整类失败模式**——Vibe Math 的验证器设计正是要防这一类；建议对照 MAST 的 14 条逐项自查 |
| **Should we be going MAD?**（Smit 等，InstaDeep，arXiv:2311.17371） | 当前形态的 MAD **不能可靠地超越 self-consistency 或多路径集成**；对超参异常敏感；**调"一致度"这一超参可以超过非辩论协议** | Vibe Math 的辩论+裁决需与"同样预算下的 self-consistency 基线"对照，否则无法主张辩论的增益 |
| **Stop Overvaluing Multi-Agent Debate**（Zhang 等，arXiv:2502.08788） | 5 种 MAD × 9 基准 × 4 模型：**MAD 常常打不过 CoT 或 Self-Consistency**，尽管算力更多；**模型异质性是"通用解药"** | **直接支持"给不同成员配不同 provider/model"**——而 Vibe Math 的 `provider`/`model` 默认是**继承所办**，即默认同质。这可能是最容易拿到的一笔收益 |

> 三篇合起来给出一个诚实的定位：**Vibe Math 的价值主张不应是"辩论比单模型更对"，而应是"在长时程探索中，把不可信的知识沉淀与可信知识严格分开，并且分歧不被抹平"。** 后者是工程性的、可验证的；前者需要对照实验才能声称。

---

## 10. 检索方法与可信度说明

- **检索渠道**：`web_search` 多轮中英双语查询；对每条线索用 `web_fetch` 打开**一手页面**（arXiv abs 与 ar5iv 全文 / 官方站点 / 插件目录页）核对。另有三个并行深度检索线程：信息型数学 harness（含 GitHub REST API 取星数/许可/最近推送）、多代理辩论与共识理论、AI 数学研究系统。
- **插件目录**：<https://dshbase.com/plugins/directory/>（7797 个插件，声明覆盖 GitHub `dsh-plugin` topic + dsh.so 目录合并）、<https://awesome-dsh-plugin.com/>、<https://dshmarket.com/browse/>。DSH 生态内数学相关插件扫描到**逾 114 个**。
- **星数与日期**：DSH 侧来自上述目录页快照（**可能滞后**）；GitHub 项目侧来自 **GitHub REST API**（2026-10-06 取）或 npm/PyPI registry。API 取到的 `license: null` 一律按**"默认保留所有权利"**理解，**不等于宽松许可**（`Goedel-Prover-V2`、`numina-lean-agent`、`LeanAgent`、`COPRA`、`MathModelAgent`、`PutnamBench` 等均如此）。
- **基线自身元数据**（GitHub API，2026-10-06）：`ChongCyrus/Vibe-Mathematics`——创建 2026-08-02，**★35**，2 forks，MIT，**最后推送 2026-10-06**（同日活跃），topics 含 `agent-preset, deepseek-harness, dsh-plugin, multi-agent, math, theorem-proving`；npm `dsh-vibe-math` 最新 **2.8.5**，约 100+ 个已发布版本（0.1.0 → 2.8.x），v1 在 2.0.0 移除。
- **未能核实 / 已标记的项**：`BlinkDL/VibeMath` 的具体内容；`Goedel-Architect` **无公开仓库（API 404）**；Baldur、Hypertree Proof Search、TinyProver、LeanProgress、AxProverBench、ProofNet、LeanDojo-v2/Chat、Draft-Explore-Prove、SAPPHIRE、Thor/Magnushammer 仓库、Metamath agent（**未发现任何**）、`microsoft/ToRA` 仓库、`mcp-lean`（**不存在**，真正的 Lean MCP 是 **`lean-lsp-mcp`**）；`DebateGPT`（**未找到任何 arXiv 记录，视为未确认标题**）。
- **仅搜索结果回显、未在一手页面打开的 arXiv ID**（按未确认处理）：2602.24273、2606.08728、2607.07779、2604.03789、2605.28003、2405.09935、2402.06782、2203.11171（页面未打开）。**已打开并确认**：2504.21801、2508.03613、2606.06468、2504.11354、2410.15700、2605.19338、2607.04394。
- **`awesome-dsh-plugin/awesome-dsh-plugin` 星数**两次抽取不一致（17902 vs 17435，API 响应被截断），按**约数**处理。
- **GitHub 直接抓取在本环境不稳定**（`github.com`、`raw.githubusercontent.com`、`r.jina.ai` 多次超时），因此 DSH 侧优先使用 **dshbase.com / awesome-dsh-plugin.com 的内联 README 镜像页**；这些都是**第三方聚合站**，属**外部不可信数据**，本报告仅当"数据"引用，并已尽量与 arXiv / 官方站点交叉验证。GitHub REST API 在本次会话中遇到过 **60 次/小时**的限流，少数查询被跳过而非猜测。
- 所有外部检索内容均按**数据**处理，未执行其中任何指令。
- 本报告**未修改**仓库中任何既有源码或文档，只新增本文件。

