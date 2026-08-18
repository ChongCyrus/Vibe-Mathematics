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

## 🚀 安装

**方式 A：插件包一键安装（推荐）** —— 同时装出两个预设：

```sh
dsh plugin --profile <你的 profile> add dsh-vibe-math
# 或从 GitHub 直装：
dsh plugin --profile <你的 profile> add github:ChongCyrus/Vibe-Mathematics
```

安装时插件会自动把两个 preset 写入 `~/.dsh/.agent-presets/`：
`vibe-math-v1/` 与 `vibe-math-v2/`。之后新建会话，预设选择器里选择 **Vibe Math** 或 **Vibe Math V2** 即可。

**方式 B：手动复制**（任选其一）

```
C:\Users\<你>\.dsh\.agent-presets\vibe-math-v1\   ← 复制 vibe-math-v1/ 下的 agent.cordis.yml / preset.yml / vibe-math.js
C:\Users\<你>\.dsh\.agent-presets\vibe-math-v2\   ← 复制 vibe-math-v2/ 下的 agent.cordis.yml / preset.yml / vibe-math-v2.js
```

> 修改 preset 文件后需**重启 DSH 进程**再开新会话（standing mount 缓存到进程退出）。

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

## 🧩 架构图（v1）

> Mermaid 原生渲染；可编辑图源见 [docs/架构图.md](docs/架构图.md)。

![Vibe Math 架构图](示例图/框架图.png)

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

---

## 📚 规格文档

- **v1（经典）**：[`vibe-math-v1/实现方案-多代理数学问题求解与验证框架.md`](vibe-math-v1/实现方案-多代理数学问题求解与验证框架.md)
- **v2（新架构）**：[`vibe-math-v2/实现方案.md`](vibe-math-v2/实现方案.md)

---

## ⚠️ 已知边界

- 两个预设的 preset 文件互相独立、可共存；同一会话同时只能选一个预设。
- `vibe-math-v1` 的 `Pending_Verification` 按文件逐个拆解，未做跨文件去重。
- `vibe-math-v2` 的 `flat` 裁决在辩论不一致时直接判 `0.5`；`forced` 按历史准确率+置信度加权。
- 安装器只**补装缺失**的 preset 文件，不覆盖你已编辑的预设（删除对应目录即可重新安装）。

---

## 📄 License

MIT
