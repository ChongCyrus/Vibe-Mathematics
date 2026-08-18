# Vibe Mathematics — 多代理数学问题求解与验证框架（双架构）

[![npm](https://img.shields.io/npm/v/dsh-vibe-math)](https://www.npmjs.com/package/dsh-vibe-math)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/ChongCyrus/Vibe-Mathematics)](https://github.com/ChongCyrus/Vibe-Mathematics)

> 运行在 **DeepSeek Harness** 内的一组 **agent preset**（`vibe-math-v1` / `vibe-math-v2`），
> 用多代理协作自动求解数学问题并对结论做多代理交叉验证。两个预设共享「**断点续跑**、
> **中途人工干预**、**进度汇报**、**自然语言驱动**」三大底座能力，但采用两套不同的求解架构：
>
> - **`vibe-math-v1`（经典流水线）**：「广度探索 → 深度迭代 → 交叉验证 → 知识沉淀」闭环；
> - **`vibe-math-v2`（新架构 · 概率驱动）**：`qs.json` 问题清单 + `Propos/` 命题库 + 概率驱动调度。

安装本插件包（或手动复制预设）后，DSH 的预设选择器里会出现**两个** agent preset。

---

## ✨ 功能特色

- **多代理自动求解**：主代理把问题交给调度器，调度器派发 brainstorm / solver / verifier / decider（v1）或 explorer / solver / verifier（v2）等子代理协同求解，**你无需逐节点手操**。
- **多代理交叉验证**：每个结论交给 ≥3 个「严苛审稿人」**独立审查 → 辩论（交流群）→ 裁决**。
- **知识沉淀**：验证通过的结论晋升进 `Verified/` 可信知识库（v2 另有 `Propos/` 命题库），供后续方向复用。
- **断点续跑**：调度状态、任务栈、代理注册表、决策队列、验证器历史准确率等全部落盘；重启后 `resume` 即可恢复（v2 用进程纪元区分"同进程暂停→恢复"与"跨进程重启"）。
- **中途人工干预（并继续）**：`auto / manual` 模式随时切换；manual 在关键节点挂起决策等你 approve/reject/override；可对任意子代理发消息 / 中断。
- **按项目隔离**：每个数学问题一个独立项目文件夹，互不干扰，可随时切换。
- **子代理权限可调控**：可限制子代理允许/禁止的工具、每轮外部工具调用上限，并明确告知其可读 `Verified/`、`Propos/`、`Reliable/` 与进度日志。
- **可配置**：`vibe_math_setting.json`（含注释）自定义默认参数；`/vibe setup` 交互式问答配置。
- **自然语言控制**：主代理充当「助手 + 汇报者」，你把需求说成人话，它自己调用工具、汇报进度、配置参数。

---

## 🚀 安装

两种安装方式，任选其一（也可并存）：

### 方式 A：作为插件包一键安装（推荐，同时装出两个预设）

```sh
dsh plugin --profile <你的 profile> add dsh-vibe-math
# 或从 GitHub 直装：
dsh plugin --profile <你的 profile> add github:ChongCyrus/Vibe-Mathematics
```

安装时插件会自动把两个 preset 写入 `~/.dsh/.agent-presets/`：`vibe-math-v1/` 与 `vibe-math-v2/`。
之后新建会话，预设选择器里选择 **Vibe Math**（v1）或 **Vibe Math V2**（v2）即可。
**升级包版本后重启 DSH，未手动改过的 preset 文件会自动更新到新版本**（细节见文末「v2」安装器说明）。

### 方式 B：作为 agent preset 手动安装

1. 把本仓库对应目录的文件复制到 preset 目录：

   ```
   C:\Users\<你>\.dsh\.agent-presets\vibe-math-v1\   ← 复制 vibe-math-v1/ 下的 agent.cordis.yml / preset.yml / vibe-math.js
   C:\Users\<你>\.dsh\.agent-presets\vibe-math-v2\   ← 复制 vibe-math-v2/ 下的 agent.cordis.yml / preset.yml / vibe-math-v2.js
   ```

2. 新建一个会话，在 preset 选择器里选 **「Vibe Math」** 或 **「Vibe Math V2」**。
3. 会话启动后即可使用：工具列表里会出现 `vibe_math_*` 工具，输入框键入 `/vibe` 有自动补全。

> 修改 preset 文件后需**重启 DSH 进程**再开新会话（preset 的 standing mount 会缓存到进程退出）。

---

## 🧭 两个预设怎么选

| | **vibe-math-v1（经典）** | **vibe-math-v2（新架构）** |
|---|---|---|
| 核心思想 | 流水线：拆方向 → 逐方向求解 → 拆最小单元 → 多验证器辩论 → 晋升 `Verified/` | 概率驱动：`qs.json` 问题 + `Propos/` 命题库，按「正确概率 / 价值」调度求解与验证 |
| 数据 | `qs/qs.csv` + `Progress_Logs/` | `qs/qs.json` + `Propos/<分类>_Propos.json` + `Reliable/` |
| 角色 | brainstorm / solver / derive / verifier / decider | explorer（拆方向）→ 逐方向 solver → verifier（独立审查→辩论→裁决） |
| 收口规则 | 验证通过晋升 `Verified/`，decider 判定解决 | 解法/证明达概率 `1` 即收口（问题 solved、命题 1/0），`never` 永不调度 |
| 特设能力 | 子问题分支（Aux_Hypothesis） | 命题「价值/关键性」自动晋升问题清单；`reportMode file/push/both`；`priorityAdjust` 三种优先级策略 |

两者都支持：断点续跑（`vibe_math_resume`）、人工/自动模式切换、`vibe_math_*` 工具集与 `/vibe` 命令、按项目隔离、子代理权限调控。

---

## 🧠 架构与分工（v1 · 经典）

框架 = **一个主代理（助手）+ 一个代码调度器 + 五类子代理**。

| 角色 | 类型 | 职责 |
|---|---|---|
| **主代理** | LLM（会话里的那个助手） | **自然语言接口 + 汇报者 + 助手**。它**自己不求解、不调度**，只负责：把你的话翻译成 `vibe_math_*` 工具调用、汇报进展、问答式配置参数、执行调控命令。 |
| **调度器** | 插件代码（非模型） | 唯一主控：读 `qs.csv`、派发子代理、写文件、推进状态机。**所有调度靠编程，不靠代理**。 |
| **Brainstorm 子代理** | 子代理 | 元认知头脑风暴：约束分解、边界测试、相似问题映射，把问题拆成多个「大相径庭」的求解方向。 |
| **Solver 子代理** | 子代理 | 每个方向一个专属求解器，**同一会话内多轮迭代**，产出引理（含证明）、子路线、存活概率、完整解法。 |
| **Derive 子代理** | 子代理 | 当某问题的所有方向都走进死路仍未解决时，基于历史痛点**派生 1~3 个全新方向**。 |
| **Verifier 子代理** | 子代理 | 每个验证单元 ≥3 个独立「严苛审稿人」，独立审查 → 辩论（交流群）→ 裁决。 |
| **Decider 子代理** | 子代理 | `Verified/` 出现新结论时，判断它是否解决了某未解决问题，回写 `qs.csv` 并重命名解法文件。 |

> 一句话分工：**主代理负责“和人对话”，调度器负责“干活”，子代理负责“动脑”。**

---

## 🧩 架构图 · v1（经典）

> 静态 PNG 预览 + 可编辑 Mermaid 图源（GitHub 原生渲染）；完整流程说明见 [docs/架构图.md](docs/架构图.md)。

![Vibe Math V1 架构图](示例图/框架图-v1.png)

```mermaid
flowchart TB
    subgraph L1["👤 交互层"]
        U["😀 用户（自然语言）"]
        M["🤖 主代理（助手 + 汇报者）<br/>翻译需求 · 汇报进度 · 问答配置<br/>不求解 · 不调度"]
    end

    subgraph L2["⚙️ 调度层（插件代码）"]
        SCHED["调度器 Scheduler<br/>唯一文件写者<br/>读 qs.csv · 派发子代理 · 推进状态机"]
    end

    subgraph L3["🧠 子代理层（continuable 持久会话）"]
        BRAIN["🧭 Brainstorm<br/>拆解多个求解方向"]
        SOLV["✍️ Solver × N<br/>逐方向多轮迭代"]
        DERI["🔀 Derive<br/>死路时派生新方向"]
        VERI["🔬 Verifier × ≥3<br/>独立审查 → 辩论 → 裁决"]
        DECI["⚖️ Decider<br/>判定是否解决"]
    end

    subgraph L4["💾 数据层 · VibeMath/Projects/&lt;项目&gt;/"]
        QS["📋 qs.csv"]
        PEND["📥 Pending_Verification/"]
        UNDR["📂 Under_Verification/"]
        TVAL["✅ Temp_Validated/"]
        KNOW["📚 Verified/ 可信知识库"]
        STATE["🗄️ Progress_Logs/ · VibeMath_State/"]
    end

    U -->|"求解 XX / 查进度 / 干预"| M
    M -->|"vibe_math_* 工具"| SCHED

    SCHED -->|"① 派发"| BRAIN
    BRAIN -->|"多个大相径庭的方向"| SCHED
    SCHED -->|"② 每方向一个"| SOLV
    SOLV -->|"结构化结果 JSON"| SCHED
    SOLV -.->|"迭代至卡死"| DERI
    DERI -->|"派生 1~3 个新方向"| SCHED
    SCHED -->|"③ 写盘"| PEND
    SCHED -->|"④ 拆解为最小验证单元"| UNDR
    SCHED -->|"⑤ 派发 ≥3 个"| VERI
    VERI -->|"裁决 JSON"| SCHED
    SCHED -->|"⑥ 通过"| TVAL
    SCHED -->|"⑦ 晋升"| KNOW
    SCHED -->|"⑧ 派发"| DECI
    DECI -->|"⑨ 已解决 → 回写"| QS
    SCHED <-->|"读取问题"| QS
    SCHED <-->|"状态落盘 / 断点恢复"| STATE
```

**一句话流水线**：`qs.csv` → Brainstorm 拆方向 → 每方向一个 Solver 多轮迭代（卡死则 Derive 派生新方向）→ 输出拆成最小验证单元 → ≥3 个 Verifier 独立审查 → 辩论 → 裁决 → 通过晋升 `Verified/` → Decider 回写 `qs.csv`；全程状态落盘 `VibeMath_State/`，`resume` 断点续跑，`manual` 模式在派发/裁决/晋升处挂起人工决策。

---

## 🧩 架构图 · v2（新架构 · 概率驱动）

> 静态 PNG 预览 + 可编辑 Mermaid 图源（GitHub 原生渲染）；生成脚本见 [docs/generate_framework_diagram_v2.py](docs/generate_framework_diagram_v2.py)。

![Vibe Math V2 架构图](示例图/框架图-v2.png)

```mermaid
flowchart TB
    subgraph L1["👤 交互层"]
        U["😀 用户（自然语言）"]
        M["🤖 主代理（助手 + 汇报者）<br/>翻译需求 · 汇报进度 · 问答配置<br/>不求解 · 不调度"]
    end

    subgraph L2["⚙️ 调度层（插件代码 · 概率驱动）"]
        SCHED["调度器 Scheduler<br/>唯一文件写者 · 按优先级调度<br/>explorer → 逐方向 solver → 验证器 → 收口<br/>断点持久化 · 人工决策门"]
    end

    subgraph L3["🧠 子代理层（continuable 持久会话）"]
        EXP["🧭 Explorer<br/>拆方向 / 全死路时重派生（去死路 · 并集）"]
        SOLV["✍️ Solver × N<br/>agent_self_iteration<br/>逐方向多轮迭代"]
        VERI["🔬 Verifier × ≥3<br/>独立审查 → 辩论 → 裁决"]
    end

    subgraph L4["💾 数据层 · VibeMath/Projects/&lt;项目&gt;/"]
        QS["📋 qs/qs.json<br/>问题 + 解法（正确概率）"]
        PRP["📚 Propos/&lt;分类&gt;_Propos.json<br/>命题（布尔估计 · 证明/证伪列表）"]
        VERD["✅ Verified/<br/>定论事实（0/1）"]
        LOGS["🗄️ Verification_logs/ · Progress_Logs/<br/>· Reliable/ · VibeMath_State/"]
    end

    U -->|"求解 / 查进度 / 干预"| M
    M -->|"vibe_math_* 工具"| SCHED

    SCHED -->|"① 按优先级取问题"| QS
    SCHED -->|"② 派 Explorer"| EXP
    EXP -->|"方向集 M_q"| SCHED
    SCHED -->|"③ 每方向一个"| SOLV
    SOLV -->|"引理 → Propos（概率&lt;1）"| PRP
    SOLV -->|"解法 → qs（概率&lt;1）"| QS
    SOLV -.->|"卡死 → 重派生"| EXP
    SCHED -->|"④ 选 r 派 ≥3 验证器"| VERI
    VERI -->|"⑤ 裁决 0/1/中间"| SCHED
    SCHED -->|"⑥ 概率=1 → 收口/晋升"| PRP
    SCHED -->|"已解决 / 优先级 never"| QS
    SCHED -->|"晋升定论"| VERD
    SCHED <-->|"辩论记录 / 状态落盘"| LOGS
```

**一句话流水线**：`qs.json` 按优先级取问题 → Explorer 拆方向（全死路则重派生）→ 每方向一个 Solver 多轮迭代（引理进 `Propos/`、解法回 `qs.json`，概率均 <1）→ 调度器选 r（命题 / 命题+证明·证伪 / 问题+解法）派 ≥3 验证器独立审查→辩论→裁决 → 概率=1 自动收口（问题 solved、命题 1/0，优先级置 `never`）；全程状态落盘，`resume` 断点续跑，`reportMode` 可 file/push/both 汇报。

---

## 📁 目录结构

### v1（经典）

```
<会话工作区>/VibeMath/
├─ current.json                        # 当前项目
├─ vibe_math_setting.json             # （可选，全局回退）默认参数 JSONC，含注释
└─ Projects/<项目>/
   ├─ vibe_math_setting.json          # 该项目默认参数
   ├─ qs/qs.csv                        # 问题清单：id,description,priority,status,deps
   ├─ Verified/                        # 已验证可信知识库（绝对可信）
   ├─ Pending_Verification/            # 待验证原始输出
   ├─ Under_Verification/              # 拆解后的最小验证单元
   ├─ Temp/                            # 临时工作区
   ├─ Temp_Validated/                  # 已验证、待晋升
   ├─ Progress_Logs/                   # 每问题进度 + 辩论日志 + 定期报告
   └─ VibeMath_State/                  # 调度器私有持久状态（断点恢复用）
```

### v2（新架构）

```
<会话工作区>/VibeMath/
├─ current.json                        # 当前项目
├─ vibe_math_setting.json             # （可选，全局回退）默认参数 JSONC，含注释
└─ Projects/<项目>/
   ├─ vibe_math_setting.json          # 该项目默认参数
   ├─ qs/qs.json                       # 问题清单：概述/已解决/解法列表(完整解法·正确概率)/优先级/progress
   ├─ Propos/<分类>_Propos.json        # 命题库：概述/布尔估计/细类型/证明·证伪列表/优先级/价值·关键性/progress
   ├─ Reliable/                        # 可信参考文献（只读，用户放入）
   ├─ Verified/                        # 定论事实索引（布尔估计=0/1 的命题）
   ├─ Verification_logs/               # 每轮验证的辩论记录（审计用）
   ├─ Progress_Logs/                   # 定期进度报告 report.json
   └─ VibeMath_State/                  # 调度器私有持久状态（断点恢复用）
```

**铁律（两版通用）**：调度器是**唯一文件写者**（子代理只返回结构化 JSON，从不写文件）。

---

## ⚡ 快速上手

### 方式 A：直接对话（推荐，最省事）

因为主代理内置了使用说明，你**直接说人话即可**：

```
帮我用 Vibe Math 证明 √2 是无理数。
```

主代理会自动：`vibe_math_add_problem` 加题 → `vibe_math_start` 启动 → 之后你随时问它进度。

```
现在进展怎么样了？
```

主代理会自动调用 `vibe_math_status` / `vibe_math_report` 并把结果用人话汇报给你。

### 方式 B：命令 / 工具（精确控制）

在对话里直接调用工具（参数为 JSON）：

| 工具 | 作用 |
|---|---|
| `vibe_math_add_problem` | 加题（id/description/priority） |
| `vibe_math_add_proposition` / `vibe_math_list_propositions`（v2） | 添加 / 列出命题库（id/概述/布尔估计/细类型/价值·关键性） |
| `vibe_math_start` / `vibe_math_resume` | 启动 / 断点恢复调度器 |
| `vibe_math_pause` / `vibe_math_abort` | 暂停 / 终止（中断所有子代理） |
| `vibe_math_status` / `vibe_math_report` | 查看状态 / 完整进度报告 |
| `vibe_math_set_mode` | 切换 `auto` / `manual` |
| `vibe_math_set_params` | 运行时调参 |
| `vibe_math_setup` | 返回参数 schema（交互式配置用） |
| `vibe_math_save_settings` | 把当前参数存成新默认 |
| `vibe_math_template` | 生成默认参数模板文件 |
| `vibe_math_new_project` / `set_project` / `list_projects` | 项目管理 |
| `vibe_math_list_decisions` / `decide` | 查看 / 裁决人工决策 |
| `vibe_math_list_agents` / `message_agent` / `interrupt_agent` | 查看 / 发消息 / 中断子代理 |

斜杠命令（与工具等价）：`/vibe start|resume|pause|abort|status|report|mode <auto|manual>|setup|save|template [global|project]|add <id> <desc>|add-proposition <id> <概述>|list-propositions|project [list|new <name>|<name>]|decisions|agents`

---

## 🎓 教学：让主代理替你干活

### 1. 自然语言驱动（不用记命令）

主代理的作用就是当你的「翻译官」。你只需描述**目标**，它会自己选择并调用工具：

| 你说的话 | 主代理做的事 |
|---|---|
| “求解 / 证明 XXX” | `add_problem` + `start`，之后汇报 |
| “现在进度怎么样 / 有哪些代理在跑” | `status` / `report` / `list_agents` 并总结 |
| “暂停 / 终止求解” | `pause` / `abort` |
| “切到人工模式，我要逐步把关” | `set_mode manual`，之后有决策就 `list_decisions` 提醒你 |
| “给 q1 的某个求解方向换个思路（比如改成构造性证明）” | `list_agents` 找到 childId → `message_agent` 注入新指令 |
| “中断某个卡住的子代理” | `interrupt_agent` |

### 2. 问答式参数配置（/vibe setup）

你甚至不用记参数名。说：

```
帮我配置一下参数。
```

主代理会调用 `vibe_math_setup` 拿到完整参数 schema（每项含**说明 / 选项 / 建议 / 当前值**），
然后用 `ask_user_question` **逐项问你**（选项自带解释与建议），你选完它用 `vibe_math_set_params`
应用，最后问你是否 `vibe_math_save_settings` 存为默认。

也可以直接跑命令：`/vibe setup`（看 schema）→ 跟主代理说你要改哪些 → `/vibe save`（存默认）。

### 3. 配置文件（vibe_math_setting.json）

- **生成模板**：`/vibe template`（生成到工作区）或 `/vibe template project`（生成到当前项目）——
  会产出一份**带 `//` 注释、逐项中文说明**的 JSON 模板，你手改后重启/resume 即生效。
- **保存当前值**：`/vibe save` 把当前生效参数写回该文件。

---

## 🌱 新手示例流程（以“证明 √2 是无理数”为例）

**Step 1 — 用一句话启动**

```
帮我用 Vibe Math 证明：√2 是无理数。
```

主代理执行 `vibe_math_add_problem {"id":"q1","description":"证明：√2 是无理数。","priority":0}`
再执行 `vibe_math_start`，然后告诉你“已启动”。

**Step 2 — 询问进度**

```
进展如何？
```

主代理执行 `vibe_math_status` 并用人话汇报：当前活跃子代理数、正在验证的单元、是否有待决策等。

**Step 3 — 问答式调参（可选）**

```
我想让它用加权投票，并发数设成 6。
```

主代理 `vibe_math_set_params {"verdictMode":"weighted-vote","maxParallelThreshold":6}`，
并问你是否 `vibe_math_save_settings` 保存。

**Step 4 — 中途干预（可选）**

```
切到人工模式，我要在每个关键节点把关。
```

主代理 `vibe_math_set_mode {"mode":"manual"}`。之后每到一个关键节点它会 `vibe_math_list_decisions`
拿到决策，向你说明，等你 `vibe_math_decide {"id":"...","action":"approve"}`（或 `reject` / `override`）。

**Step 5 — 收尾**

```
结束了吗？结论是什么？
```

主代理 `vibe_math_status`：`qs.csv` 里 `q1` 已回写 `solved`，解法文件在 `Verified/` 里并被命名为
`q1-的解法_<唯一标识>.csv`。

> v2 对应的收尾是：`qs.json` 中 `q1.已解决 = true`，其解法 `正确概率 = 1`，相关命题进入 `Verified/`。

---

## 🖼️ 实际使用示例（长截图）

> 截图很长，这里默认**折叠**：点击下方「展开」才加载整张长图，避免它占满页面、遮挡前后文字。

<details>
<summary>📸 展开查看实际使用示例长截图</summary>

![实际使用示例长截图](示例图/实际使用示例-长截图.png)

</details>

---

## ⚙️ 参数速查表

### v1（经典）默认值

| 参数 | 默认 | 说明 |
|---|---|---|
| `mode` | `auto` | `auto` / `manual` |
| `maxParallelThreshold` | 4 | 全局最大并发子代理数 |
| `solverMaxRounds` | 20 | 每个求解方向最大迭代轮数 |
| `verifierCount` | 3 | 每验证单元独立验证器数（≥3） |
| `debateMaxRounds` | 5 | 验证辩论最大轮数 |
| `verdictMode` | `direct-veto` | `direct-veto` / `weighted-vote` |
| `provider` / `model` | 空 | 子代理模型（空 = 继承根代理） |
| `solverPersona` / `verifierPersona` | 空 | 注入求解器/验证器的额外要求 |
| `solverToolAllow` / `solverToolDeny` | `[]` | 求解器允许/禁止的工具（硬性 toolFilter） |
| `verifierToolAllow` / `verifierToolDeny` | `[]` | 验证器允许/禁止的工具 |
| `solverMaxToolCalls` / `verifierMaxToolCalls` | 0 | 每轮外部工具调用上限（0=不限，软性） |
| `reportIntervalMs` | 0 | 0 = 仅事件驱动（有代理状态更新等事件才写报告）；>0 = 定时自动写（毫秒） |
| `tickIntervalMs` | 2000 | 调度器心跳间隔（毫秒） |
| `activityLogCap` | 100 | 活动日志保留条数（report 最多显示 30 条） |

### v2（新架构）默认值

| 参数 | 默认 | 说明 |
|---|---|---|
| `mode` | `auto` | `auto` / `manual` |
| `maxParallelThreshold` | 4 | 全局最大并发子代理轮数（新派发前须 active < 阈值） |
| `solverMaxRounds` | 3 | 每个求解方向最大迭代轮数（agent_self_iteration 上限） |
| `verifierCount` | 3 | 每个验证对象的独立验证器数量 |
| `debateMaxRounds` | 5 | 验证辩论（交流群）最大轮数 |
| `verdictMode` | `flat` | `flat` = 均衡机制（不一致判 0.5）/ `forced` = 强制裁决（历史准确率+严谨性加权） |
| `reportMode` | `file` | `file` = 写报告文件 / `push` = 推送主代理汇报 / `both` |
| `promoteValueThreshold` | 0.7 | Propos 中「价值/关键性」≥ 该值且未决(0,1) 的命题自动加入 qs.json |
| `priorityAdjust` | `none` | `none` / `deadend-deprioritize`（全死路降优先级）/ `survival-map`（按存活率重算） |
| `proposPriorityAdjust` | `none` | 命题优先级动态调整：`none` / `progress-graded`（按定论接近度+证明/证伪材料量重算，越接近定论越优先验证） |
| `provider` / `model` | 空 | 子代理模型（空 = 继承根代理） |
| `solverPersona` / `verifierPersona` | 空 | 注入求解器/验证器的额外要求 |
| `solverToolAllow` / `solverToolDeny` | `[]` | 求解器允许/禁止的工具 |
| `verifierToolAllow` / `verifierToolDeny` | `[]` | 验证器允许/禁止的工具 |
| `solverMaxToolCalls` / `verifierMaxToolCalls` | 0 | 每轮外部工具调用上限（0=不限） |
| `reportIntervalMs` | 0 | 0 = 仅事件驱动（有状态更新才写/推）；>0 = 定时自动汇报（毫秒） |
| `tickIntervalMs` | 2000 | 调度器心跳间隔（毫秒） |
| `activityLogCap` | 100 | 活动日志保留条数（report 最多显示 30 条） |
| `maxExplorerRetries` | 3 | explorer 拆方向失败的重派生上限 |

---

## 📝 断点续跑 & 人工干预（两大硬性需求）

- **断点续跑**：所有状态落盘到 `VibeMath_State/*.json`，每个子代理都是 DSH 的 **continuable 持久会话**（对话由 DSH 自动保存）。重启后新开会话 → `vibe_math_resume` 即可续跑。v2 额外用**进程纪元**区分"同进程暂停→恢复"（保留存活子代理继续）与"跨进程重启"（清理陈旧任务）。
- **中途人工干预**：`manual` 模式在关键节点（v1：brainstorm/solver 派发、验证裁决、晋升 Verified；v2：explorer/solver 派发、验证裁决）挂起决策；可随时 `set_mode auto` 切回自动；可对任意子代理 `message_agent` / `interrupt_agent`。
- **进度汇报**：默认**事件驱动** —— 只有代理状态更新等事件发生时才会写 `Progress_Logs/report.json`（v2 的 `reportMode` 可 `file`/`push`/`both`，`push` 通过 `rootAgent.followup()` 唤醒主代理主动汇报）；只有把 `reportIntervalMs` 设为 >0 才启动定时自动汇报（间隔毫秒）。

---

## 📚 规格文档

- **v1（经典）**：[`vibe-math-v1/实现方案-多代理数学问题求解与验证框架.md`](vibe-math-v1/实现方案-多代理数学问题求解与验证框架.md)
- **v2（新架构）**：[`vibe-math-v2/实现方案.md`](vibe-math-v2/实现方案.md)

---

## ⚠️ 已知边界（有意简化）

**v1**：
- `Pending_Verification` 按文件逐个拆解，未做跨文件的“去重 / 引用整合”（不损正确性）。
- `weighted-vote` 会记录每个验证器的历史准确率 + 严谨性权重，但最终裁决仍遵循“证伪优先 / 全 Uncertain→False”（数值权重仅用于审计）。
- manual 模式在第一个未决关键节点暂停整条主循环。

**v2**：
- 安装器带**版本化自动更新**：每次 DSH 启动时对比包版本与 `<presetRoot>/.vibe-math-installed.json` 记录——版本升级会自动替换**未被手动修改**的 preset 文件（哈希一致才覆盖）；你改过的文件会被保留并在日志中提示。无记录的老安装首次会一次性刷新到当前版本。想强制全量重装：删除 `~/.dsh/.agent-presets/vibe-math-v1` 与 `vibe-math-v2` 目录后重启 DSH。
- `flat` 裁决在辩论不一致时直接判 `0.5`；`forced` 按历史准确率+置信度加权。
- `never` 优先级的问题/命题**永不调度**，且不阻塞严格终止（视为主动弃权）。
- 两个 preset 文件互相独立、可共存；同一会话同时只能选一个预设。

---

## 📄 License

MIT
