# Vibe Mathematics —— 多代理数学问题求解与验证框架（永久 agent preset）

本目录是框架的**交付源码与使用说明**。插件是**永久 agent preset**（`vibe-math`），
随 DSH 会话自动挂载、进程重启无需重新加载；其**数据**持久化在
`<工作区>/VibeMath/Projects/<项目>/` 下，因此**断点续跑不依赖插件进程**。

## 交付物

| 文件 | 说明 |
|---|---|
| `C:\Users\<你>\.dsh\.agent-presets\vibe-math\vibe-math.js` | 框架全部逻辑（20 个工具 + `/vibe` 命令 + 调度器） |
| `C:\Users\<你>\.dsh\.agent-presets\vibe-math\agent.cordis.yml` | preset 组合（= standard + vibe-math 插件行） |
| `C:\Users\<你>\.dsh\.agent-presets\vibe-math\preset.yml` | 显示名 / 描述 |
| `VibeMath-使用说明书.md` | 完整使用说明书 |

## 一、已实现的能力

1. **断点后继续**：调度状态、任务栈、代理注册表、决策队列、依赖图、晋升队列、已证集合全部落盘到
   `VibeMath_State/*.json`；每个子代理是 DSH 的 **continuable 持久会话**（对话记录由 DSH
   session persistence 天然保存）；重启后 `vibe_math_resume` 恢复（含验证任务对账 reconcile）。
2. **中途人工干预（并继续）**：`auto / manual` 模式随时切换；manual 模式下在关键节点
   （brainstorm/solver 派发、验证裁决、晋升 Verified）产生「挂起决策」，人工 approve/reject/override
   后继续；可对任意子代理发消息 / 中断。
3. **按项目隔离**：每个数学项目一个目录 `Projects/<项目>/`，独立 qs/Verified/状态，可随时切换。

## 二、文件格式（统一规范）

框架根目录：`<会话工作区>/VibeMath/`（当前项目记录在 `current.json`）

```
VibeMath/
  current.json
  Projects/<project>/
    qs/qs.csv                                  # id,description,priority,status,deps
    Verified/                                  # 已验证可信知识库
    Pending_Verification/                      # 待验证原始输出
    Under_Verification/{obj}_{title}.csv       # 最小验证单元
    Temp/                                      # 临时工作区
    Temp_Validated/{obj}.csv                   # 已验证待晋升（Dependencies + Target Content 固定格式）
    Progress_Logs/{qid}_progress.csv           # 每问题进度（方向/轮次/存活概率/引理/子路线/假设）
    Progress_Logs/verification_{obj}.log       # 辩论全过程记录
    VibeMath_State/                            # 调度器私有状态（断点恢复用）
```

所有 CSV 采用 RFC 4180；内容承载单元格一律 JSON 编码字符串。**调度器是唯一文件写者**，子代理只做
LLM 推理并返回结构化 JSON，从不直接写文件——从构造上满足“严禁两个代理同时写同一文件”。

## 三、控制方式

- **20 个工具**：`vibe_math_start/resume/pause/abort/status/report/set_mode/set_params/setup/
  save_settings/template/add_problem/new_project/set_project/list_projects/list_decisions/decide/
  list_agents/message_agent/interrupt_agent`。
- **斜杠命令**：`/vibe start|resume|pause|abort|status|report|mode <auto|manual>|setup|save|
  template [global|project]|add <id> <desc>|project [list|new <name>|<name>]|decisions|agents`。

## 四、典型流程

1. 新建会话，选 **“Vibe Math”** preset。
2. `vibe_math_add_problem {id:"q1", description:"证明……", priority:0}`（或 `/vibe add q1 证明……`）。
3. `vibe_math_start` → 调度器按优先级 2>3>1 自动推进：头脑风暴 → Solver 多轮迭代 →
   验证（独立审查+辩论+裁决）→ 晋升 Verified → 判定器回写 qs 状态。
4. 需要人工把关时 `vibe_math_set_mode manual`，在关键节点 `vibe_math_decide` 裁决后继续。
5. 中断/重启后新开会话，`vibe_math_resume` 从 `VibeMath_State` 与持久子会话恢复。

## 五、默认参数

`mode=auto`，`maxParallelThreshold=4`，`solverMaxRounds=20`，`verifierCount=3`，
`debateMaxRounds=5`，`verdictMode=direct-veto`（可 `weighted-vote`）；子代理默认继承根代理的
provider/model；`solverPersona`/`verifierPersona` 可注入人格。

## 六、注意

- **preset 只在新建会话并选中 “Vibe Math” 时生效**；当前 `cordis` 会话不挂载它。
- 框架根目录由根代理会话 cwd 决定（`<cwd>/VibeMath`），可看 `vibe_math_status` 的 `frameworkRoot`。
- 完整使用与已知边界见 `VibeMath-使用说明书.md`。
