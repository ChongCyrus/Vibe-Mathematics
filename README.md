# Vibe Mathematics — 多代理数学问题求解与验证框架

> 一个运行在 **DeepSeek Harness** 内的**永久 agent preset**（`vibe-math`）。
> 它用「**广度探索 → 深度迭代 → 交叉验证 → 知识沉淀**」的闭环，自动求解数学问题，
> 并对每个结论做多代理交叉验证；支持**断点续跑**与**中途人工干预**，全程可由自然语言驱动。

---

## ✨ 功能特色

- **多代理自动求解**：主代理把问题交给调度器，调度器派发 brainstorm / solver / verifier / decider 等子代理协同求解，**你无需逐节点手操**。
- **多代理交叉验证**：每个结论拆成最小验证单元，≥3 个「严苛审稿人」独立审查 → 辩论 → 裁决（一票否决 / 加权投票）。
- **知识沉淀**：验证通过的结论晋升进 `Verified/` 可信知识库，供后续方向复用。
- **断点续跑**：调度状态、任务栈、代理注册表、决策队列、依赖图、验证器历史准确率等全部落盘；重启后 `resume` 即可恢复（含对账，不会卡死）。
- **中途人工干预（并继续）**：`auto / manual` 模式随时切换；manual 在关键节点挂起决策等你 approve/reject/override；可对任意子代理发消息 / 中断。
- **按项目隔离**：每个数学问题一个独立项目文件夹，互不干扰，可随时切换。
- **子代理权限可调控**：可限制子代理允许/禁止的工具、每轮外部工具调用上限，并明确告知其可读 `Verified/` 与进度日志。
- **可配置**：`vibe_math_setting.json`（含注释）自定义默认参数；`/vibe setup` 交互式问答配置。
- **自然语言控制**：主代理充当「助手 + 汇报者」，你把需求说成人话，它自己调用工具、汇报进度、配置参数。

---

## 🧠 架构与分工

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

## 📁 目录结构

框架数据落在会话工作区的 `VibeMath/` 下，每个项目一套完整布局：

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

**铁律**：调度器是**唯一文件写者**（子代理只返回结构化 JSON，从不写文件），所有跨目录移动都走**临时原子交换**。

---

## 🚀 安装

1. 把本仓库的三个文件放到 preset 目录：

   ```
   C:\Users\<你>\.dsh\.agent-presets\vibe-math\
   ├─ agent.cordis.yml
   ├─ preset.yml
   └─ vibe-math.js
   ```

2. 新建一个会话，在 preset 选择器里选 **「Vibe Math」**。
3. 会话启动后即可使用：工具列表里会出现 20 个 `vibe_math_*` 工具，输入框键入 `/vibe` 有自动补全。

> 修改 preset 文件后需**重启 DSH 进程**再开新会话（preset 的 standing mount 会缓存到进程退出）。

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

斜杠命令（与工具等价）：`/vibe start|resume|pause|abort|status|report|mode <auto|manual>|setup|save|template [global|project]|add <id> <desc>|project [list|new <name>|<name>]|decisions|agents`

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

---

## ⚙️ 参数速查表（默认值）

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
| `reportIntervalMs` | 30000 | 自动写进度报告的最小间隔 |

---

## 📝 断点续跑 & 人工干预（两大硬性需求）

- **断点续跑**：所有状态落盘到 `VibeMath_State/*.json`，每个子代理都是 DSH 的 **continuable 持久会话**（对话由 DSH 自动保存）。重启后新开会话 → `vibe_math_resume` 即可续跑。
- **中途人工干预**：`manual` 模式在关键节点（brainstorm/solver 派发、验证裁决、晋升 Verified）挂起决策；可随时 `set_mode auto` 切回自动；可对任意子代理 `message_agent` / `interrupt_agent`。

---

## ⚠️ 已知边界（有意简化）

- `Pending_Verification` 按文件逐个拆解，未做跨文件的“去重 / 引用整合”（不损正确性）。
- `weighted-vote` 会记录每个验证器的历史准确率 + 严谨性权重，但最终裁决仍遵循“证伪优先 / 全 Uncertain→False”（数值权重仅用于审计）。
- manual 模式在第一个未决关键节点暂停整条主循环。

完整逻辑见仓库内规格文档 `实现方案-多代理数学问题求解与验证框架.md`。

---
## 使用示例

> 实际使用效果截图（长图）：
>
> 实际使用示例：示例图/实际使用示例-长截图.png


---

## 📄 License

MIT
