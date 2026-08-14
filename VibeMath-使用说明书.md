# Vibe Math 多代理数学问题求解与验证框架 · 使用说明书

> 本插件是一个**永久 agent preset**（`vibe-math`），运行在 DeepSeek Harness 内，实现
> “广度探索 → 深度迭代 → 交叉验证 → 知识沉淀”的闭环，用于自动求解数学问题、
> 多代理交叉验证结论，并支持**断点续跑**与**中途人工干预（并继续）**。
>
> 本插件是**纯 Host 侧**的持久插件，通过 20 个 `vibe_math_*` 工具 + `/vibe` 斜杠命令驱动，
> 进程重启后**自动加载**。

---

## 目录

1. [它是什么](#1-它是什么)
2. [安装与启动（选 preset 开新会话）](#2-安装与启动)
3. [目录结构与数据文件（按项目）](#3-目录结构与数据文件)
4. [快速上手（5 分钟跑通）](#4-快速上手5-分钟跑通)
5. [控制工具清单（20 个）](#5-控制工具清单)
6. [斜杠命令 /vibe](#6-斜杠命令-vibe)
7. [工作流详解](#7-工作流详解)
8. [人工 / 自动模式](#8-人工--自动模式)
9. [断点续跑](#9-断点续跑)
10. [参数说明](#10-参数说明)
11. [已知边界与实现取舍](#11-已知边界与实现取舍)
12. [常见问题](#12-常见问题)

---

## 1. 它是什么

一个**编程化调度器 + 多类子代理**组成的框架。调度器是唯一主控（读 `qs.csv`、派发子代理、
写文件、推进状态机），**所有控制靠编程而非代理**。

| 角色 | 说明 |
|---|---|
| 调度器（插件代码） | 唯一主控：读 `qs.csv`、派发子代理、写文件、推进状态机，按固定顺序循环（验证 → 晋升 → 判定 → 求解）。 |
| Brainstorm 子代理 | 元认知头脑风暴，为问题拆出若干个“大相径庭”的求解方向。 |
| Solver 子代理 | 每个方向一个专属求解器，**同一会话内多轮迭代**，产出引理/碎片结论/完整解法/存活概率。 |
| 验证器子代理 | 每个验证单元 **≥3 个**独立“严苛审稿人”，独立审查 → 辩论 → 裁决。 |
| 判定器子代理 | `Verified/` 出现新结论时，判断它是否解决了某未解决问题，回写 `qs.csv`。 |

---

## 2. 安装与启动

preset 已作为**永久 preset** 安装于用户根：

```
C:\Users\<你>\.dsh\.agent-presets\vibe-math\
├─ agent.cordis.yml   # 组合（= standard 全部能力 + vibe-math 插件行）
├─ preset.yml         # 显示名 “Vibe Math” + 描述
└─ vibe-math.js       # 框架全部逻辑（无 import 的 ESM，随组合挂载）
```

**使用步骤（重要）**：preset 只在**新建会话并选中该 preset** 时生效。

1. 新建一个会话，在 preset 选择器里选 **“Vibe Math”**；
2. 会话启动后，工具列表里应出现 20 个 `vibe_math_*` 工具，输入框键入 `/vibe` 有自动补全；
3. 直接对话即可。

> “Vibe Math” preset 只在其**自身会话**里生效；其它会话不会挂载该 preset，`/vibe` 与
> `vibe_math_*` 工具只在 “Vibe Math” 会话里可用。
>
> **重要：修改 preset 文件（`vibe-math.js` / `agent.cordis.yml`）后，必须重启 DSH 进程再开新会话。**
> 原因：preset 的“standing mount”在首次挂载后**缓存到进程退出为止**，仅仅新开会话不会重新读取
> 已改动的组合文件。

### 会话内的模型上下文（skill/说明）

`agent.cordis.yml` 的 `persona` 已内置一段 “Vibe Math toolkit” 说明：会话启动后，模型会**直接知道**
这 20 个工具与 `/vibe` 命令的存在、推荐工作流（加题 → start → status）、manual/auto 干预方式、
交互式配置（setup → ask_user_question → set_params → save_settings）与断点续跑方式。因此你只需
自然语言说“求解某数学题”，模型即可自行调用相应工具。

---

## 3. 目录结构与数据文件

每个数学项目一个独立目录，根目录记录当前项目：

```
<会话工作区>/VibeMath/
├─ current.json                        # {"project":"<当前项目>"}
├─ vibe_math_setting.json             # （可选，全局回退）默认参数 JSONC，含注释
└─ Projects/<project>/                 # 每项目一套完整框架
   ├─ vibe_math_setting.json          # 该项目默认参数（JSONC，含注释）
   ├─ qs/qs.csv                        # 问题清单（见下）
   ├─ Verified/                        # 已验证可信知识库（绝对可信）
   ├─ Pending_Verification/{uuid}.csv  # 待验证原始输出
   ├─ Under_Verification/{obj}_{title}.csv  # 拆解后的最小验证单元
   ├─ Temp/                            # 临时写入 / 合并工作区
   ├─ Temp_Validated/{obj}.csv         # 已验证、待晋升（固定 Dependencies/Target 格式）
   ├─ Progress_Logs/
   │   ├─ {qid}_progress.csv           # 每问题方向/进度日志
   │   ├─ report.json                  # 定期进度报告（vibe_math_report 触发/自动写）
   │   ├─ verification_{obj}.log       # 辩论全过程记录（复盘/审计）
   │   └─ falsified_{obj}.log          # 被证伪单元的归因
   └─ VibeMath_State/                  # 调度器私有持久状态（断点恢复用）
       ├─ params.json
       ├─ scheduler_state.json
       ├─ agent_registry.json
       ├─ task_stack( tasks ).json
       ├─ decision_queue.json
       ├─ dependencies.json
       ├─ solved_by_verified.json      # 已被 Verified 证明解决的 qid 集合
       ├─ promotion_queue.json         # Temp_Validated 单元的依赖元数据
       ├─ verifier_accuracy.json       # 各验证器子会话的历史准确率（加权投票用）
       └─ decided_verified.json        # 已判定过的 Verified 文件（防重复）
```

### 统一文件格式规范

- 所有 CSV 采用 **RFC 4180**；承载内容的单元格一律 **JSON 编码字符串**（自动加引号转义）。
- **调度器是唯一文件写者**：子代理只做推理、返回结构化 JSON，从不直接写文件——
  从构造上满足“严禁两个代理同时写同一文件”。
- 所有跨目录“移动 / 合并 / 晋升”都经 **Temp 原子交换**（写临时 → 同卷 `Move-Item` 改名）。

### 关键表头

- `qs/qs.csv`：`id,description,priority,status,deps`
  - `priority` 数值越小越优先；`status` ∈ `unsolved | solved`；`deps` 为子问题 id 的 JSON 数组。
- `Progress_Logs/{qid}_progress.csv`：
  `direction_id,title,method,core_assumption,round,status,survival_probability,dead_end_reason,lemmas_json,sub_routes_json,aux_hypotheses_json,updated_at`
  - `status` ∈ `active | success | dead-end`。

---

## 4. 快速上手（5 分钟跑通）

以“证明 √2 是无理数”为例，在 “Vibe Math” 会话里依次调用：

```text
1) vibe_math_add_problem  {"id":"q1","description":"证明：√2 是无理数。","priority":0}

2) vibe_math_start
   → 返回 { ok:true, message:"scheduler started", project:"default", frameworkRoot:".../Projects/default" }

3) vibe_math_status
   → 观察 activeCount、openTasks、pendingDecisions 等（调度器每 2 秒推进一次，可反复查）

4) （可选）vibe_math_set_mode  {"mode":"manual"}   # 切到人工模式逐步把关

5) 等求解/验证/晋升完成后：
   vibe_math_status   # qs 状态应已回写为 solved
```

或直接用斜杠命令：

```text
/vibe add q1 证明：√2 是无理数。
/vibe start
/vibe status
```

> 调度器是**事件 + 定时器驱动**的：`vibe_math_start` 只是“点火”，真正推进由后台循环完成，
> 全程无需逐节点手动驱动；当没有未解决问题、也没有活跃子代理与验证任务时自动停机。

---

## 5. 控制工具清单

在对话里直接调用（`vibe_math_*`），参数为 JSON 对象。

| 工具 | 参数 | 说明 |
|---|---|---|
| `vibe_math_start` | 无 | 启动（或重新启动）调度器 |
| `vibe_math_resume` | 无 | 断点/重启后恢复调度器 |
| `vibe_math_pause` | 无 | 暂停（在跑的子代理完成当前回合后停下） |
| `vibe_math_abort` | 无 | 终止并中断所有活跃子代理 |
| `vibe_math_status` | 无 | 查看状态 / 参数 / 项目 / 活跃代理 / 挂起决策 / 最近活动 |
| `vibe_math_report` | 无 | 返回完整进度报告并写入 `Progress_Logs/report.json` |
| `vibe_math_set_mode` | `mode` ∈ `manual`\|`auto` | 切换人工 / 自动 |
| `vibe_math_set_params` | 见[参数说明](#10-参数说明)（均可选，部分更新） | 运行时调参 |
| `vibe_math_setup` | 无 | 返回交互式配置的参数 schema（含说明/选项/建议） |
| `vibe_math_save_settings` | 无 | 把当前参数写入 `vibe_math_setting.json` 作为新默认 |
| `vibe_math_template` | `where`? ∈ `global`\|`project` | 生成一份**默认参数模板**（含注释）到工作区/项目 |
| `vibe_math_add_problem` | `id`*、`description`*、`priority`? | 往当前项目 `qs.csv` 加题 |
| `vibe_math_new_project` | `name`* | 新建项目文件夹并切换 |
| `vibe_math_set_project` | `name`* | 切换当前项目 |
| `vibe_math_list_projects` | 无 | 列出所有项目 |
| `vibe_math_list_decisions` | 无 | 列出挂起的人工决策 |
| `vibe_math_decide` | `id`*、`action`* ∈ `approve`\|`reject`\|`override`、`verdict`? ∈ `true`\|`false` | 裁决一条挂起决策 |
| `vibe_math_list_agents` | 无 | 列出被跟踪的子代理（childId/角色/问题/方向/轮次） |
| `vibe_math_message_agent` | `childId`*、`message`* | 给某子代理发消息（作为其下一回合） |
| `vibe_math_interrupt_agent` | `childId`* | 中断某子代理 |

（带 `*` 为必填，`?` 为可选。`vibe_math_decide` 的 `action=override` 必须同时给 `verdict`。）

### 示例

```text
vibe_math_set_params   {"maxParallelThreshold":6,"solverMaxRounds":30,"verdictMode":"weighted-vote"}
vibe_math_new_project  {"name":"图论猜想"}
vibe_math_list_decisions
vibe_math_decide       {"id":"<decisionId>","action":"approve"}
vibe_math_decide       {"id":"<decisionId>","action":"override","verdict":"false"}
vibe_math_message_agent {"childId":"<childId>","message":"换一个更接近构造性证明的子路线试试"}
vibe_math_interrupt_agent {"childId":"<childId>"}
```

---

## 6. 斜杠命令 /vibe

输入框键入 `/vibe` 会自动补全并提示子命令。所有子命令与同名工具等价：

```text
/vibe start | resume | pause | abort | status | report
/vibe mode <auto|manual>
/vibe setup                                # 返回交互式参数配置 schema
/vibe save                                 # 把当前参数保存到 vibe_math_setting.json
/vibe template [global|project]            # 在工作区/项目生成默认参数模板（含注释）
/vibe add <id> <description>               # description 可为带空格的整句
/vibe project [list | new <name> | <name>]
/vibe decisions
/vibe agents
```

---

## 7. 工作流详解

调度器每次“tick”按固定顺序循环推进（每轮都执行）：

```
1) 验证结果处理：Pending_Verification → 拆解 → 派验证器（并补齐缺的验证器）
2) 晋升扫描：Temp_Validated → Verified（依赖链满足后原子移动）
3) 判定器：Verified 出现新文件 → 判断是否解决某题 → 回写 qs.csv
4) solve(q)：取优先级最高未解决问题，头脑风暴 / 派生方向 / 派求解器
```

**并发铁律**：任何“派发新代理”前必须等 `active_sub_agents_count < maxParallelThreshold`。

### 7.1 `solve(q)`

- **前置检查**：若 `q.id` 已在 `solved_by_verified`（即 Verified/ 已存在其完整解）或 `qs` 状态为
  `solved`，直接跳过。
- 无进度日志 → 派 **Brainstorm** 产生方向集 `M_q`（失败重试最多 3 次，仍无方向则标记弃置）。
- 有进度日志 → 对每个非 success/dead-end 方向派专属 **Solver** 并发执行
  `agent_self_iteration(q, m_i)`。
- **方向耗尽后自动派生**：当某问题的所有方向都变为 success/dead-end 仍未解决时，调度器派
  **derive 子代理**基于历史痛点/障碍深度推导 1~3 个**从未尝试过的新方向**（附推导动机），
  与遗留高潜方向取并集后继续求解（最多重试 3 次，避免无限派生）。

### 7.2 `agent_self_iteration(q, m)`（同会话多轮）

- 每轮 Solver 返回结构化 JSON：`status ∈ continue|success|dead-end`、`solution`（完整解法或 null）、
  `lemmas`（含证明）、`findings`、`sub_routes`（可行性信号/障碍）、`survival_probability`、
  `dead_end_reason`、`aux_hypotheses`。
- `continue` → 调度器 `followup` **同一会话**进入下一轮；`success`（自检通过）→ 输出写
  `Pending_Verification/`；`dead-end` 或达到 `solverMaxRounds` → 记录归因，方向关闭。
  （`max-tokens` 截断视为 `continue` 续跑，而非误判死路。）
- **分支递归**：Solver 提出 `aux_hypotheses`（高复杂度子问题）→ 调度器把子问题加进 `qs.csv`
  （id=`{qid}_sub_{唯一id}`）、记入 `dependencies.json`、异步 `solve(q_sub)`，当前方向先“临时假设成立”继续。

### 7.3 验证与结果处理

- `Pending_Verification/*` → 拆解为**最小验证单元**：
  - 每条引理 / 每条 finding → 一个独立单元；
  - 若存在**完整解法**（`solution` 非空）→ 额外生成一个“solution 单元”（依赖 = 其 aux_hypotheses）。
- 每个单元写入 `Under_Verification/`，并建一条验证任务；调度器**逐 tick 补齐**验证器，
  保证每个单元最终都有 `verifierCount`（≥3）个独立验证器。

### 7.4 `验证器(r)`（独立审查 → 辩论 → 裁决）

1. **独立审查**：各验证器互不见面，输出 `{verdict: true|false|uncertain, reason, strictness}`。
2. **辩论（交流群）**：调度器把“他人发言全集”逐轮喂回各验证器，最多 `debateMaxRounds` 轮；
   全体一致（全 true 或全 false）即止。全过程写入 `verification_{obj}.log`。
3. **裁决**（`verdictMode`）：
   - `direct-veto`：任一 `false` 未被驳倒 → 判 False（数学严谨性优先）；
   - `weighted-vote`：证伪优先；有 `false` 或全 `uncertain`/混合 → False。
4. 结果：
   - **True** → 写 `Temp_Validated/`（`Dependencies (Assumed or Verified): [...]` + `---` + `Target Content`）；
   - **False** → 反例/断裂点写 `falsified_{obj}.log` 供后续方向避坑。

### 7.5 晋升与回写

- 后台扫描 `Temp_Validated/`：某单元的**依赖链全部已存在于 `Verified/` 中**（按依赖标题在
  Verified 内容中匹配；无依赖则立即晋升）→ **原子移动**晋升到 `Verified/`。
- `Verified/` 出现新文件 → 派**判定器**判断是否解决某未解决问题 → 是则 `qs.csv` 状态
  `unsolved → solved`，并记入 `solved_by_verified`（供 `solve(q)` 前置检查）。

---

## 8. 人工 / 自动模式

- `auto`（默认）：所有关键节点按预设自动通过，全程无人值守。
- `manual`：调度器在**关键节点**停下，把决策放进 `decision_queue` 等待人工：

| 决策节点 `node` | 含义 | 可执行动作 |
|---|---|---|
| `spawn` | 即将派发 brainstorm / solver | `approve`（派发）/ `reject`（跳过） |
| `verdict` | 某单元得出验证结论 | `approve`（接受结论）/ `override` + `verdict`（强制改写） |
| `promote` | 某已验证单元待晋升到 `Verified/` | `approve`（晋升）/ `reject`（搁置） |

人工通过 `vibe_math_list_decisions` 查看、`vibe_math_decide` 裁决（`/vibe decisions` 也可查看），
裁决后调度器自动继续；期间可随时 `vibe_math_set_mode auto` 切回自动。

> 注意：manual 模式下调度器会**在第一个未决关键节点处暂停整条主循环**，直到该决策被裁决。
> 用 `vibe_math_status` 看 `pendingDecisions`，用 `vibe_math_list_decisions` 取决策 id。

---

## 9. 断点续跑

**场景**：进程重启、会话恢复、或中途 `vibe_math_abort`。

1. 数据不丢：`VibeMath/` 下所有文件 + 子代理的 **DSH continuable 持久会话**都在。
2. 在新开的 “Vibe Math” 会话里调用 `vibe_math_resume`：
   - 重新加载 `VibeMath_State/*`（任务栈、代理注册表、决策队列、依赖图、晋升队列、已证集合）；
   - 对“进行中”的验证任务做**对账（reconcile）**：已收齐本轮全部验证器报告的任务会自动续推
     （继续辩论或出裁决），不会因中断而卡死；
   - 冷恢复各子会话（DSH continuable 机制自动完成）。

> 提示：preset 是永久插件，重启 DSH 后**无需重装**，只需在新会话里 `vibe_math_resume`。

---

## 10. 参数说明

三种设置方式（优先级从低到高）：

1. **`vibe_math_setting.json`（含注释，可手写）** —— 提供“默认值”；
2. **`VibeMath_State/params.json`** —— 运行期 `vibe_math_set_params` 改过的值（覆盖设置文件）；
3. **`vibe_math_set_params`** —— 运行期改，立即生效并落盘到 `params.json`。

`vibe_math_save_settings`（或 `/vibe save`）会把**当前参数**写回 `vibe_math_setting.json`
（生成带 `//` 注释的 JSONC），作为下次的新默认。
`vibe_math_template`（或 `/vibe template`）会在**工作区**（`<工作区>/VibeMath/vibe_math_setting.json`）
或**当前项目**目录生成一份**默认参数模板**（含注释），方便你先手改再启动。

| 参数 | 默认 | 说明 |
|---|---|---|
| `mode` | `auto` | 调度模式：`auto` / `manual`（也可用 `vibe_math_set_mode`） |
| `maxParallelThreshold` | 4 | 全局最大并发子代理数（并发门阈值） |
| `solverMaxRounds` | 20 | 每个 Solver 方向的最大迭代轮数 |
| `verifierCount` | 3 | 每个验证单元的独立验证器数量（内部强制 ≥3） |
| `debateMaxRounds` | 5 | 辩论（交流群）最大轮数 |
| `verdictMode` | `direct-veto` | 裁决方式：`direct-veto` / `weighted-vote` |
| `provider` | 空 | 子代理模型 provider（空 = 继承根代理） |
| `model` | 空 | 子代理模型 id（空 = 继承根代理） |
| `solverPersona` | 空 | 注入每个 Solver 提示词开头的人格/要求 |
| `verifierPersona` | 空 | 注入每个验证器提示词开头的人格/要求 |
| `solverToolAllow` | `[]` | 求解器允许的工具名列表（空 = 继承全部；**硬性** toolFilter） |
| `solverToolDeny` | `[]` | 求解器禁止的工具名列表（如禁用写文件/控制工具） |
| `verifierToolAllow` | `[]` | 验证器允许的工具名列表 |
| `verifierToolDeny` | `[]` | 验证器禁止的工具名列表 |
| `solverMaxToolCalls` | 0 | 求解器每轮外部工具调用上限（0 = 不限；**软性**提示约束） |
| `verifierMaxToolCalls` | 0 | 验证器每轮外部工具调用上限（0 = 不限） |
| `reportIntervalMs` | 30000 | 自动写 `Progress_Logs/report.json` 的最小间隔（毫秒） |

### 子代理权限（已告知 + 可配置）

每个 brainstorm/solver/verifier 子代理的提示词里都**明确告知**其权限：
可读取 `Verified/` 下任何文件作为已知依赖；求解器还可读取
`Progress_Logs/{qid}_progress.csv` 查看**所有方向**的进度/障碍；可用外部工具（搜索/符号计算/文献）
且遵守 `*MaxToolCalls` 上限；并且**不得直接写文件**（只返回结构化 JSON，调度器是唯一写者）。

在此基础上，`solverToolAllow/Deny`、`verifierToolAllow/Deny` 通过 **硬性 toolFilter**（子代理
工具可见性）进一步收紧：例如 `{"solverToolDeny":["write","edit"]}` 禁止求解器写文件。

### 交互式配置（/vibe setup）

输入 `/vibe setup`（或让主代理执行 `vibe_math_setup`）会返回完整参数 schema（每项含
`description` / `options` / `suggestion`）。主代理会据此用 `ask_user_question` 逐项询问你的选择，
`vibe_math_set_params` 应用，最后问你是否 `vibe_math_save_settings` 保存到 `vibe_math_setting.json`。

---

## 11. 已知边界与实现取舍

本实现完整覆盖两大硬性需求（断点续跑、中途人工干预并继续）与主流程（solve / 迭代 /
验证 / 晋升 / 判定、并发门、单写者 + 原子移动），并已实现“方向耗尽后自动派生 1~3 个新方向”
与“验证器历史准确率 + 严谨性(strictness)加权投票”。以下为**有意简化**、可作为后续增强点：

1. **`Pending_Verification` 的“逻辑合并”**：当前按文件逐个拆解，未做跨文件的“去重 / 引用整合”
   （每个求解器输出已自包含，故按文件拆解不损失正确性，仅少了跨文件去重）；
2. **加权投票的数值权重不改变裁决结果**：`weighted-vote` 会记录每个验证器的历史准确率与
   本次 `strictness` 严谨性权重（写入 `verification_*.log` 与 `VibeMath_State/verifier_accuracy.json`），
   但最终裁决仍遵循规格的“证伪优先 + 全 Uncertain / True+Uncertain 混合→False”，因此数值权重
   只用于审计、不改变结论；
3. **manual 门控粒度**：manual 模式在第一个未决关键节点暂停整条主循环（而非按单元并行门控）。

这些取舍不影响正确性与数据安全，仅影响“自动化程度 / 探索广度”。

---

## 12. 常见问题

**Q1：我看不到 `vibe_math_*` 工具 / `/vibe`？**
本插件是**永久 preset**，只在**新建会话并选择 “Vibe Math” preset** 时挂载；其它会话不会挂载它。

**Q2：`VibeMath` 目录建在哪里？**
在根代理会话工作区下，即 `<会话 cwd>/VibeMath`。用 `vibe_math_status` 的 `frameworkRoot`
字段查看当前项目根目录。

**Q3：为什么子代理不直接写文件？**
设计铁律：**调度器唯一写者**。子代理只返回结构化 JSON，由调度器落盘，避免并发写冲突，
所有跨目录移动走 Temp 原子交换。

**Q4：怎么知道某方向被判死了？**
`Progress_Logs/{qid}_progress.csv` 里该方向 `status=dead-end`，`dead_end_reason` 与
`sub_routes_json` 记录障碍归因；被证伪单元见 `falsified_{obj}.log`。

**Q5：想人工改某个子代理的方向怎么办？**
`vibe_math_list_agents` 找到 `childId` → `vibe_math_message_agent` 注入新指令；
或 `vibe_math_interrupt_agent` 中断后由调度器按最新进度重新派发。

**Q6：进程重启后数据还在吗？插件要不要重装？**
数据在 `VibeMath/` 与 DSH 持久会话里。插件是永久 preset，**无需重装**；新开会话后
`vibe_math_resume` 即可续跑。

**Q7：想换一个数学项目怎么办？**
`vibe_math_new_project {"name":"..."}`（新建并切换）或 `vibe_math_set_project {"name":"..."}`；
切换会自动终止当前调度、重置内存态并加载目标项目的持久状态。
