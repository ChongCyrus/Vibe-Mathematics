# PHASE 6 · v3 复刻 · P0-10 工具面收口方案（只读设计）

> 性质：**只读设计文档**。本轮不改任何代码，只回答"36 个工具里留哪 10 个、怎么发布、⑤ 还是 ⑥"。
> 上位：`docs/acceptance/phase6-v3-p0-build-checklist.md:141`（P0-10 施工卡）、`docs/acceptance/phase6-v3-p0-build-checklist.md:151`（"建议不逐个复刻 36 个"）。
> 本文件不是行为等价证明，也不把"我会调"说成"测过调用分布"（见 §6）。
>
> **行号简写（本节起生效）**：`V3:NNN` = `vibe-math-v3/vibe-math-v3.js:NNN`；`YML:NNN` = `vibe-math-v3/agent.cordis.yml:NNN`；`VH:NNN` = `vibe-math-vmu/host.js:NNN`；`VP:NNN` = `vibe-math-vmu/kernel/pack.js:NNN`；`VK:NNN` = `vibe-math-vmu/kernel/index.js:NNN`；`VE:NNN` = `vibe-math-vmu/vibe-math-vmu.js:NNN`。其余一律写完整相对路径。

## 0. 先核实另一路给的约束（结论：一半对、一半不成立）

| 约束 | 核实结果 | 证据 |
|---|---|---|
| "面解析发生在 pack settings 之后" | **属实**。装载完成后入口**再 install 一次**，此时才解析工具面；adapter 拿到的是内核**活设置视图**，所以 pack 清单 settings 在这一次 install 里是可见的。 | `VE:1076`（AFTER the packs settle）＋`VE:596`、`VE:599`（`settings: kernel.settingsView()`）＋`VE:582`（该缺陷已按"根因"修过：清单 settings 对 resolveFaces 可见） |
| "本包 PACK.settings 故意为空" | **属实**（当前状态）。 | `vibe-math-vmu/packs/v3/index.js:69` |
| "⇒ **工具面不能靠 pack 声明点亮**，必须 ⑤ 或 ⑥" | **不成立**。pack **清单 settings** 能点亮**现有**工具面：`vmu.tools.faces` 是设计好的"万能门"（面键/工具名/`*`），face 解析函数把它当第 2 条声明路径读。我用**内联清单 + 真实入口**实跑：一个 inline 包声明 `vmu.tools.faces` 后，`vibe_vmu_turn`/`vibe_vmu_control`/`vibe_vmu_task`/`vibe_vmu_human`/`vibe_vmu_report` 都被发布了（`packErrors` 空）。 | `VH:276`（万能门的注释）、`VH:298`（`setting:vmu.tools.faces` 分支）；实跑探针见 §4.3 |
| **仍然成立的部分** | pack 无法声明**新的工具名**：清单校验不认 `tools` 字段，发布路径只有 face 表（54 个固定面）＋ 继承的 `math_computation`。这就是 P0-10 真正的缺口。 | `VP:102`（validatePack 的全部分支里没有 tools）＋`VH:167`（TOOL_FACES 是冻结表）＋`VK:1574`（唯一非 `vibe_vmu_*` 的工具登记） |

⇒ 所以 P0-10 有**三条**路，而不是两条：⑤ 装配、⑥ 内核声明式工具面、**⑤′ 用值层/清单点亮现有面**（零代码，但发布的是 vmu 的名字）。§4 给三张表并明确推荐 ⑥。

## 1. 原 v3 的 36 个工具全表

计数是**派生**的，不是手抄：

```
node -e "const s=require('fs').readFileSync('vibe-math-v3/vibe-math-v3.js','utf8');const n=[...new Set([...s.matchAll(/registerTool\('([a-z_]+)'/g)].map(m=>m[1]))];console.log(n.length)"
→ 36
node tests/audit-v3-registration-parity.mjs
→ shared TOOL_DESC entries: 36 ｜ tools registered twice: 36 / 36 ｜ one-path-only tools: none
```

其中 35 个 `vibe_math_*` ＋ 1 个共享的 `math_computation`。每个工具都是**两层注册**：会话层 handler 表与 apply 层 `tools.register`；描述唯一来源是 `TOOL_DESC`（`V3:5996`）。根代理的系统提示词把这 36 个**全部列出**（`YML:38` 起，逐名核对 36/36 全中），但"列出＝可用"不等于"提示词要求它调"——最后一列按**祈使句**判定（会／偶发／否）。

| # | 工具 | 一句话用途（来自 TOOL_DESC） | 注册行（会话/apply，均属 V3） | 类别 | 模型会主动调？依据 |
|---|---|---|---|---|---|
| 1 | `math_computation` | 数值/符号/统计/线代计算，probe→run，留可复核回执 | `V3:5103` / `V3:5507` | 数学 | **会**：计算提示词明确要求"调用 math_computation：先 probe，再 run"（`vibe-math-v3/math-computation.js:107`、英文版 `vibe-math-v3/math-computation.js:122`；根提示词同一句 `YML:71`） |
| 2 | `vibe_math_start` | 启动/重启调度器（override 抢项目锁） | `V3:5104` / `V3:5464` | 控制 | **偶发**：只在用户要求启动时由根代理调；根提示词仅列出（`YML:41`），无祈使句 |
| 3 | `vibe_math_resume` | 断点/重启后续跑调度器 | `V3:5105` / `V3:5465` | 控制 | 偶发（同上，`YML:41`） |
| 4 | `vibe_math_pause` | 暂停（在飞子代理跑完当前轮） | `V3:5106` / `V3:5466` | 控制 | 偶发（`YML:44`） |
| 5 | `vibe_math_abort` | 终止调度器并中断所有子代理 | `V3:5107` / `V3:5467` | 控制 | 偶发（`YML:44`）；另在拒绝提示里被点名（`V3:1674`） |
| 6 | `vibe_math_status` | 调度器状态/参数/活跃代理/项目 | `V3:5108` / `V3:5468` | 汇报 | 偶发（`YML:43`）；源码里只有一处注释提到（`V3:3306`） |
| 7 | `vibe_math_report` | 完整进度报告并落 `report.json`/`Logs/报告.md` | `V3:5109` / `V3:5469` | 汇报 | **会**："当用户问进展时调用"（`YML:114`）；框架推送更新时也明确要求（`V3:1535`） |
| 8 | `vibe_math_set_mode` | manual/auto 切换（auto 立即结清待决） | `V3:5110` / `V3:5470` | 控制 | 偶发（`YML:45`） |
| 9 | `vibe_math_set_params` | 批量改参数（Lean/论文/数学/调度） | `V3:5111` / `V3:5471` | 控制 | 偶发：仅在报告/提示的**建议句**里出现（`V3:1508`、`V3:3351`），不是成员任务 |
| 10 | `vibe_math_setup` | 返回参数 schema 用于引导配置 | `V3:5112` / `V3:5472` | 控制 | 否（`YML:54` 仅列出；一次性配置面） |
| 11 | `vibe_math_save_settings` | 把当前 params 写成默认 | `V3:5113` / `V3:5473` | 控制 | 否（`YML:54`） |
| 12 | `vibe_math_template` | 生成带注释的设置模板 | `V3:5114` / `V3:5474` | 控制 | 否（`YML:54`） |
| 13 | `vibe_math_add_problem` | 新建问题卡 `Problems/<id>.md` | `V3:5115` / `V3:5475` | 写 | 偶发：根提示词列出（`YML:38`），是"用户给题"时的首个动作；成员被要求**直接写 md**（`V3:1707`）而不是用它 |
| 14 | `vibe_math_add_proposition` | 新建命题卡（同 id 拒覆盖） | `V3:5116` / `V3:5476` | 写 | 偶发（`YML:39`）；成员同样走 md + sync_meta 通道 |
| 15 | `vibe_math_list_propositions` | 列命题库索引 | `V3:5124` / `V3:5477` | 读 | 偶发（`YML:40`） |
| 16 | `vibe_math_new_project` | 新建项目并切换 | `V3:5125` / `V3:5478` | 控制 | 偶发（`YML:61`） |
| 17 | `vibe_math_set_project` | 切换当前项目 | `V3:5126` / `V3:5479` | 控制 | 偶发（`YML:61`） |
| 18 | `vibe_math_list_projects` | 列项目 | `V3:5127` / `V3:5480` | 读 | 偶发（`YML:61`） |
| 19 | `vibe_math_list_decisions` | 列待人工决策 | `V3:5128` / `V3:5481` | 读 | 偶发：仅作为 decide 拒绝时的下一步被点名（`V3:1996`、`V3:1997`） |
| 20 | `vibe_math_decide` | 结清一条人工决策（approve/reject/override） | `V3:5129` / `V3:5482` | 控制 | 偶发：manual 门的人类动作（`V3:1940` 的 maybeGate 入队）；提示词只列出（`YML:62`） |
| 21 | `vibe_math_list_agents` | 列在册子代理 | `V3:5130` / `V3:5483` | 读 | **会**：推送更新明确要求"用 list_agents 取各代理状态"（`V3:1535`）；拒绝提示也指名（`V3:1668`） |
| 22 | `vibe_math_message_agent` | 给子代理发消息（下一轮） | `V3:5131` / `V3:5484` | 派发 | 偶发（`YML:63`）；框架内部的 followup 不经过此工具 |
| 23 | `vibe_math_interrupt_agent` | 中断某个子代理 | `V3:5132` / `V3:5485` | 控制 | 偶发（`YML:63`）；拒绝提示会指回 list_agents（`V3:1668`） |
| 24 | `vibe_math_plan` | 看排队计划/上次计划，或强制规划一轮 | `V3:5133` / `V3:5486` | 派发 | 偶发（`YML:55`）；正常路径由 tick 自动调规划器，不需模型调 |
| 25 | `vibe_math_index` | 从 md 重建机读索引 | `V3:5134` / `V3:5487` | 读 | 否：默认每次写盘自动重建（`V3:413`），参数描述只在关闭该默认时提示（`YML:56`） |
| 26 | `vibe_math_method_add` | 手工加方法卡 | `V3:5135` / `V3:5488` | 写 | 否：方法卡由 method-keeper 写 md（`V3:1720`），提示词不要求成员调此工具 |
| 27 | `vibe_math_method_list` | 列方法卡（项目＋全局） | `V3:5136` / `V3:5489` | 读 | 偶发（`YML:57`）；`V3:1700` 要求"开工前先查 Methods/"，指的是读卡不是调工具 |
| 28 | `vibe_math_lock_status` | 项目锁占用 | `V3:5137` / `V3:5490` | 读 | 否（`YML:58` 仅列出） |
| 29 | `vibe_math_claim_write` | （成员）取某文件写锁 | `V3:5138` / `V3:5491` | 写 | **会**：成员提示词明确"写任何文件前先 claim_write"（`V3:1708`） |
| 30 | `vibe_math_release_write` | （成员）释放写锁 | `V3:5139` / `V3:5492` | 写 | **会**：同上（`V3:1708`） |
| 31 | `vibe_math_sync_meta` | （成员）写完 md 后上报轻量调度元数据 | `V3:5140` / `V3:5493` | 写 | **会**：成员提示词明确"写完必须上报"（`V3:1709`） |
| 32 | `vibe_math_lean_run` | 对一个 `.lean` 跑编译器 | `V3:5145` / `V3:5496` | 形式化 | **会**：形式化提示段点名（`V3:3197`、`V3:3208`、`V3:3236`） |
| 33 | `vibe_math_lean_archive` | 归档 def/lemma/proof/blocked | `V3:5146` / `V3:5497` | 形式化/归档 | **会**（`V3:3197`、`V3:3202`、`V3:3204`、`V3:3208`）；方法整理提示也要求（`V3:1913`） |
| 34 | `vibe_math_lean_lib` | 列/重建 Lean 复用库（先查重） | `V3:5147` / `V3:5498` | 读 | **会**（`V3:3199`、`V3:3211`、`V3:3213`、`V3:3231`、`V3:3242`） |
| 35 | `vibe_math_lean_read` | 读回归档 Lean 原文 | `V3:5166` / `V3:5499` | 读 | **会**（`V3:3197`、`V3:3211`、`V3:3242`） |
| 36 | `vibe_math_lean_job` | 查/等后台编译作业 | `V3:5167` / `V3:5500` | 形式化/读 | **会**（`V3:3245`："用 vibe_math_lean_job 或下一轮提示看结果"） |

**派生小结**：36 个注册工具里，**有祈使句依据、模型真会主动调的是 11 个**——`math_computation` ＋ `claim_write`、`release_write`、`sync_meta`（成员写入通道，`V3:1708`、`V3:1709`）＋ `report`、`list_agents`（推送更新，`V3:1535`）＋ 5 个 Lean（`V3:3197` 起）。其余 25 个只在**根提示词/工具描述里被列出**（`YML:38` 起），属于"可用但没人叫它"的控制/配置/人类面；其中 8 个（setup/save_settings/template/set_params/set_mode/lock_status/index/method_add）连祈使句都没有。

## 2. 「10 个」是哪 10 个

**判据（按 P0-10 的目标措辞"主代理/人能控制 v3：起停、状态、决策、方法查看"，不是按成员的写入通道）**：留**根代理与人类**会主动使用的控制/观察面；成员侧被 vmu 回执通道取代的写锁三件套**不留**。

推荐保留（10）：

| # | 工具 | 为什么必须留（v3 侧证据） | 若不留会怎样 |
|---|---|---|---|
| 1 | `vibe_math_start` | 起停是唯一入口：调度器不启动则 tick/规划/验证全不存在（`V3:5104`）；根提示词把"issue the control tools"定为根代理职责（`YML:26`、`YML:41`） | 人类只能改配置再重启；vmu 侧"暂停门"也无法恢复 |
| 2 | `vibe_math_pause` | 停：暂停是在飞子代理的收口手段（`V3:5106`、`V3:5999`）；vmu 有真实的 control 暂停门（`vibe-math-vmu/tools/control.js:11`） | 只能 abort（不可逆）或放任跑完；"停"这件事没有安全的表达 |
| 3 | `vibe_math_status` | 状态是根代理自省 + 汇报的底座（`V3:5108`）；v3 的报告/状态字段是 documented contract（`V3:1465`） | 人类只能看日志；模型无法回答"现在到哪一步了" |
| 4 | `vibe_math_report` | **唯一有直接祈使句的汇报工具**（`YML:114`＋`V3:1535`） | 违背 v3 的汇报契约；进度问题只能靠模型拼 status |
| 5 | `vibe_math_list_decisions` | manual 门的**入口**：decide 的拒绝提示两次指回它（`V3:1996`、`V3:1997`） | decide 无从取得 id；P0-8 的人工门只能看见"有 N 条待决" |
| 6 | `vibe_math_decide` | "人说了算"是 v3 的机制（`V3:1940` 的 maybeGate 入队；`/vibe decisions` 也在 `V3:5513`） | P0-8 的 gate 只能挂起、永不结清 ⇒ 机构卡死 |
| 7 | `vibe_math_plan` | 规划的**人工/根代理**观察与强制入口（`V3:5133`、`V3:6021`）；正常由 tick 自动跑，但"看计划/强制一轮"没有替代面 | 计划队列不可见；规划器卡住时无手动恢复手段 |
| 8 | `vibe_math_list_agents` | **有祈使句**（`V3:1535`）＋ 拒绝提示指名（`V3:1668`） | 汇报与排障都失去"谁在做什么"；目标里的"在册"落空 |
| 9 | `vibe_math_method_list` | 目标里的"方法查看"；v3 明确要"开工前先查方法库"（`V3:1700`）、根提示词（`YML:57`） | 方法库只写不读；人类无法检查沉淀结果 |
| 10 | `vibe_math_add_problem` | 用户给题时的**首个动作**（`YML:38`）；v3 的入口对象就是问题卡（`V3:5115`、`V3:6010`） | 新项目要靠手写 md 才能起题；vmu 侧也没有替代的"落一张问题卡"面 |

**与清单 §1 P0-10 的建议列表有一个必须说清的差异**：`docs/acceptance/phase6-v3-p0-build-checklist.md:150` 的 10 个里含 `claim_write`／`release_write`／`sync_meta`，而我建议换成 `pause`／`list_decisions`／`add_problem`。理由不是口味：

- 这三个是**成员写 md 的通道**；vmu 复刻的提示词已经**显式改写**为"卡片由数据面写、你只提供回执"，并写明"vmu 的写锁面不存在"（`vibe-math-vmu/packs/v3/prompts/knowledge.js:136`、`vibe-math-vmu/packs/v3/prompts/knowledge.js:138`、`vibe-math-vmu/packs/v3/prompts/knowledge.js:149`）。给它们发工具 = 让模型调一个**没有消费者**的机制（本仓红线：没有消费者就不给机制）。
- `decide` 离开 `list_decisions` 无法使用（见 #5 的证据）；`pause` 缺位则"停"只能用 abort；`add_problem` 缺位则"用户给题"这一入口没有面。
- 若 Lead 决定**保留清单原 10 个**，那必须同时补上 v3 的写锁面（在 vmu 里新建写锁服务/包内实现）与提示词回退，代价远大于本卡；本文件按"只留真会调的"给出上面的 10 个，并请 Lead 明确接受这一处 acceptance 修订。

被淘汰的 26 个（每个一句话说它去哪了）：

| 工具 | 它去哪了 |
|---|---|
| `vibe_math_resume` | 合并进 `start`：在 vmu 里"重启后续跑"等价于"确保调度器在跑"（control 的 resume 动词），不需要单独的名字。 |
| `vibe_math_abort` | 合并进 `pause` 的 P1 扩展（vmu control 面已有 stop 动作）；本卡只留可逆的"停"，破坏性终止留给人经 vmu control 面执行。 |
| `vibe_math_set_mode` | 由 `decide`/`list_decisions` 取代：vmu 的 manual/auto 语义落在 P0-8 的人工门与 `vmu.human` 上，模式本身是设置而非工具。 |
| `vibe_math_set_params` | 由 `vibe_vmu_set` 取代：参数是声明式设置，内核已有声明键校验（`VH:85` 的 set 面）。 |
| `vibe_math_setup` | 真不需要：设置 schema 由 vmu 设置表/文档提供，不是每轮要调的工具。 |
| `vibe_math_save_settings` | 真不需要：vmu 的设置在写入时即持久（声明层），没有"另存默认"这一步。 |
| `vibe_math_template` | 真不需要：模板是 v3 的本地文件脚手架，vmu 没有对应的"每项目设置文件"机制。 |
| `vibe_math_add_proposition` | 由包内模块代劳：命题卡由 solver 回执 → 数据面落盘（`vibe-math-vmu/packs/v3/middleware/dataplane.js` 的 compose），不需要模型调。 |
| `vibe_math_list_propositions` | 由 `vibe_vmu_records`（list 轨）或 `report` 取代；本卡不留独立名字。 |
| `vibe_math_new_project` | 真不需要：vmu 的"项目"是持久根/工作区，不是每轮由模型新建的目录。 |
| `vibe_math_set_project` | 真不需要（同上）：部署决定工作区，模型不切项目。 |
| `vibe_math_list_projects` | 真不需要（同上）。 |
| `vibe_math_message_agent` | 由包内模块代劳：派发/追问由 planner 在 tick 里经 turn 服务完成，不经模型手调。 |
| `vibe_math_interrupt_agent` | 由包内模块代劳：planner 的 interrupt 动作经 turn 服务的中断接缝执行（K2 已开）。 |
| `vibe_math_index` | 由调度器代劳：数据面在 tick 里按 5s 节流重建索引（`vibe-math-vmu/packs/v3/middleware/dataplane.js:50` 的节流常量）。 |
| `vibe_math_method_add` | 由包内模块代劳：方法卡由 method-keeper 回执 → methods 模块建卡/改进（P0-4/P0-5）。 |
| `vibe_math_lock_status` | 真不需要：vmu 单会话/单项目锁不是 v3 的多会话文件锁模型（`vibe-math-vmu/packs/v3/prompts/knowledge.js:138`）。 |
| `vibe_math_claim_write` | 淘汰（被回执通道取代）：卡片由数据面写，成员不写文件（`vibe-math-vmu/packs/v3/prompts/knowledge.js:136`、`:149`）。 |
| `vibe_math_release_write` | 淘汰（同上，`vibe-math-vmu/packs/v3/prompts/knowledge.js:149`）。 |
| `vibe_math_sync_meta` | 淘汰（被回执取代）：轻量元数据就是本轮回执的记录体与 tags（`vibe-math-vmu/packs/v3/prompts/knowledge.js:150`）。 |
| `vibe_math_lean_run` | 未接线前不发布：v3 复刻的诚实边界写着"Lean 形式化的强制门尚未接线"（`vibe-math-vmu/packs/v3/prompts/assistant.json:34`）；接好后（P1）作为独立面回归，本卡不占 10 个名额。 |
| `vibe_math_lean_archive` | 同上（P1）。 |
| `vibe_math_lean_lib` | 同上（P1）。 |
| `vibe_math_lean_read` | 同上（P1）。 |
| `vibe_math_lean_job` | 同上（P1）。 |
| `math_computation` | **不新增**：vmu 已有同名工具（声明 math 家族时由 `vibe-math-vmu/host-math.js:78` 发布，并在内核登记 `VK:1574`）；P0-10 不得重复发布同名工具（见 §5 名称冲突）。 |

## 3. vmu 侧现状

- **工具面表**：`vibe-math-vmu/host.js:83`（TOOL_NAMES，54 个名字）＋ `vibe-math-vmu/host.js:167`（TOOL_FACES，54 行：每行给出面键、工具名与**声明来源**：`families` 设置前缀／`config` 键／`extraIntent`）。
- **解析与发布**：`vibe-math-vmu/host.js:271`（resolveFaces，按"显式 flag ＞ `vmu.tools.faces` ＞ config.faces ＞ config 键 ＞ 设置家族前缀 ＞ extraIntent"判定）→ `vibe-math-vmu/host.js:389`（toolSpecs，逐面 push spec）→ `vibe-math-vmu/host.js:1031`（install，`ctx.tools.register`）。
- **工具回执形状**：`execute` 必须返回 **JSON 字符串**，`output.schema` 声明为 string，`render` 返回 content-part 数组（`vibe-math-vmu/host.js:60` 的实测结论；`vibe-math-vmu/tools/turn.js:5` 还记着"对象/字符串差一次 stringify"的真实缺陷）。
- **已有的"非 `vibe_vmu_*`"工具**：只有 `math_computation`（由 `vibe-math-vmu/host-math.js:78` 单独发布，内核登记在 `VK:1574`）。
- **别名不产生工具面**：`docs/acceptance/phase6-v3-p0-build-checklist.md:233` 已裁定（别名唯一消费者是 registry 解析）⇒ P0-10 不能靠别名。

推荐 10 个与 vmu 现有面的映射（在 ⑥ 下"名字由 pack 声明，实现映射到现有服务/包内模块"）：

| v3 工具（保留名） | vmu 现有可复用物 | 结论 |
|---|---|---|
| `vibe_math_start` | 控制服务的 resume 动词（`vibe-math-vmu/tools/control.js:11` 的 action 枚举）＋ tick 已由值层自动武装 | 需新增（pack 工具，handler 调内核控制面） |
| `vibe_math_pause` | 控制服务的 pause 动词（同上） | 需新增（同上） |
| `vibe_math_status` | 内核状态（`kernel.status()`）＋ records 计数 | 需新增（pack 工具 handler） |
| `vibe_math_report` | 包内 dataplane/records 汇总 | 需新增（pack 工具 handler） |
| `vibe_math_list_decisions` | 人类在环服务（`vibe-math-vmu/tools/human.js:34` 的 action 枚举） | 需新增（handler 调该服务） |
| `vibe_math_decide` | 人类在环服务的 decide 动作（同上） | 需新增（handler；**依赖 P0-8 的 gates 落地**） |
| `vibe_math_plan` | 包内 planner 状态（plans 轨） | 需新增（pack 工具 handler） |
| `vibe_math_list_agents` | 名册（`VK:1859` 的 declareSlots 创建的名册）——**前置：v3 包必须先声明 slots**（当前 `vibe-math-vmu/packs/v3/index.js:39` 明说 slots 未落） | 需新增（pack 工具 handler ＋ PACK.slots） |
| `vibe_math_method_list` | records 服务的 list（methods 轨） | 需新增（handler 调服务） |
| `vibe_math_add_problem` | 包内数据面 compose ＋ records | 需新增（pack 工具 handler） |

结论：**10 个全部是"需新增"**（vmu 现有面没有同义名，别名也不产生面）；其中 7 个可映射到已有服务，3 个（status/report/plan）必须由包内 handler 现算。

## 4. 三条路线对比（明确推荐 ⑥）

| 路线 | 做法 | 优点 | 代价 |
|---|---|---|---|
| **⑤ 装配改动** | 在 `vibe-math-vmu/host.js` 的 TOOL_FACES/toolSpecs 里加 10 个 `vibe_math_*` 面 | 简单直接；一次改完，测试好写 | **把某一机构（v3）的工具名写进框架的宿主适配层**：第二个机构要加自己的名字就得再改 host.js ⇒ 违反第一原则"换一个机构＝换一个 pack 文件夹"。而且 v3 未激活的部署也会看到这些面（除非再加一层"按 pack 激活"的判断，那等于把 ⑥ 的一半做进 ⑤） |
| **⑥ 内核声明式工具面** | 清单新增 `tools` 字段；`kernel/pack.js` 校验＋装载期登记；`kernel/index.js` 持有声明；`host.js` 通用地把"声明的工具"做成 spec | 工具名**由 pack 声明**，换机构换工具不改框架；与 slots/tracks 的既有声明模式同构（`VK:1859`、`VK:1880`）；未激活的 pack 天然不发布 | 要动内核＋宿主＋门禁＋文档；约 100 行内核/宿主 ＋ 包内 handler（§4.1） |
| **⑤′ 值层/清单点亮现有面**（本轮新核到的第三扇门） | 在 `packs/v3/settings/defaults.json` 或清单 settings 里声明 `vmu.tools.faces`（值层零代码） | **零代码**；工具面来自声明，符合"声明才动"；实跑已验证能发布 turn/control/task/human/report（§4.3） | **发布的是 vmu 的名字**，不是 v3 的 10 个 ⇒ 不满足清单 `docs/acceptance/phase6-v3-p0-build-checklist.md:150` 的验收；且 `plan`/`add_problem` 没有对应 vmu 面，10 个里最多覆盖 8 个 |

**推荐：⑥。** 一句话理由：**工具名是"这家机构对外说的语言"，应当由 pack 声明**——否则"换机构＝换 pack 不改框架"的第一原则在工具面上破例；⑤ 让宿主适配层认识 v3，⑤′ 让 v3 的调用者改口说 vmu 的名字，两者都把成本推给下游。

### 4.1 推荐 ⑥ 的最小可行改动清单（含大概行数）

| # | 落点 | 改什么 | 约行数 |
|---|---|---|---|
| 1 | `VP:102` | `validatePack` 接受 `manifest.tools`：每项 `{ name, description, parameters, handler, capabilities? }`；名字不合法/描述为空/handler 非函数/与已发布工具重名 ⇒ **具名拒**（沿用问题列表风格） | +10 |
| 2 | `VP:344` | `buildPlan` 把每个工具变成一条 action（`{kind:'tool', name}`），plan 可见 | +2 |
| 3 | `VP:490` | `apply()` 在 middleware 之后调用 `kernel.declarePackTools(manifest.tools)`，并把撤销函数压进 undo（unload 零残留） | +8 |
| 4 | `VK:1859` | 照 `declareSlots`/`declareTracks` 的形状加 `declarePackTools`/`retractPackTools` 与一个只读访问器（内核持有声明，宿主来取） | +22 |
| 5 | `VH:389` | toolSpecs 末尾追加"声明的工具" → 新增工厂 `makePackToolSpec`：`execute` = `JSON.stringify(await handler(args, { kernel }))` **只 stringify 一次**，并用 `boundedToolResult` 截断；`output.schema` 声明 string；`render` 返回 content-part | +35 |
| 6 | `VH:1044` | `sanitizeToolFilter` 的 known 集合并入 pack 工具名，否则 `vmu.tools.enabled` 写这些名字会被"unknown"按名拒 | +3 |
| 7 | 装配 | **无需改动**：装载后已有一次 `await adapter.install()`（`VE:1076`），声明的工具会在这次 install 被发布（与 §4.3 的实跑一致） | 0 |
| 8 | `vibe-math-vmu/packs/v3/index.js:52` | 清单加 `slots`（planner/solver/verifier，取值同 `vibe-math-vmu/packs/v3-core/index.js:73`）与 `tools: [...]`；工具实现放新文件 `packs/v3/tools.js`（10 个 handler） | index +12；tools.js **+180～220** |
| 9 | 门禁/文档 | 新测试（§4.2）；`docs/27` 命名新文件（`tests/audit-pack-face.test.mjs` 要求 pack 内每个 basename 在卷里出现）；`docs/10` 记录 `tools` 字段；`docs/18` 工具表补 10 行（reader-facing，非门禁强制）；`package.json#files`＋`installer.js` 托管清单；`regen-all --check` 与计数重生成 | 另计 |

**合计：内核/宿主约 80 行，包内实现约 200 行，测试/文档/门禁另计。** 关键设计取舍：handler 用**包 JS**（可现算 status/report/plan）而不是"服务名映射表"——后者只需约 40 行但覆盖不了 3 个需要包内状态的工具，最终会引入 3 个特例，反而更贵。

### 4.2 ⑥ 的验收（建议新增一条测试）

- `packErrors()` 为空且 `appliedPacks` 含 v3；
- 发布出来的工具名**逐字**等于 pack 清单声明的 10 个（`status().faces.published`/注册面）；
- 每个 `execute` 调用返回的是**字符串**且 `JSON.parse` 后是对象（钉住"回执是 JSON 字符串"）；
- 停用 pack 后这 10 个名字**消失**（unload 零残留）；
- 与已发布工具重名的声明被**具名拒**（种一个 `math_computation` 重名用例）。

### 4.3 本轮实跑证据（只读探针，均在 `D:\_tmp`，未改仓库）

- 探针 A：真实入口 `entry.apply(ctx, { clock, packs: ['v3'], vmu: { 'vmu.tools.faces': [...] } })` ⇒ 发布 `vibe_vmu_status`、`vibe_vmu_set`、`vibe_vmu_pack`、`vibe_vmu_turn`、`vibe_vmu_control`、`vibe_vmu_task`、`vibe_vmu_human`、`vibe_vmu_report`、`vibe_vmu_middleware`（`records` 因无持久根按"unavailable"不发布）。
- 探针 B：`entry.apply(ctx, { packs: [inlineManifest] })`，该 inline 清单 `settings` 声明 `vmu.tools.faces` ⇒ **同样发布** turn/control/task/human/report，`packErrors` 为空。⇒ "pack 清单 settings 在装载后的 install 里可见"这一修正是真的（对应 `VE:582` 的注释）。
- 探针 C：同一入口 `packs: ['v3']` 无任何 face 声明 ⇒ 只有 `vibe_vmu_status`/`vibe_vmu_pack`/`vibe_vmu_middleware`（v3 当前确实"零工具面"）。

## 5. 风险与陷阱

1. **回执是 JSON 字符串，不是对象**（最容易咬人的一条）。
   - 发布器必须 `JSON.stringify` **恰好一次**：handler 返回对象、publisher 转字符串；handler 若自己返回字符串就会被二次编码（`vibe-math-vmu/tools/turn.js:5` 记录的正是这个缺陷）。
   - 截断必须走 `boundedToolResult`（`vibe-math-vmu/host.js:53` 导入）：v3 的 status/report 在大项目里很大，不截断会撞宿主的工具结果上限（同类缺陷见 `VH:430` 的注释）。
   - 拒绝必须是**带已登记 code** 的对象（`{ok:false, code, message, hint}`）再被 stringify。新 code 的代价：`vibe-math-vmu/docs/03-interface-contract.md` §8.1 的实现状态表是**由代码扫描生成**的（`scripts/generate-planned-codes.mjs:158`），而包代码里的 `VMU_*` 字面量必须先在表里登记，否则 `tests/audit-vmu-docs.test.mjs` 的实现状态/登记门禁会红。**建议 10 个工具只复用已登记码**（参数非法/无此对象/引擎不可用），确实需要新码时走 `PACK.codes` + `docs/03` 手写表 + `regen-all --write`。
2. **工具名冲突**：`math_computation` 已经是 vmu 的继承工具（`VK:1574`、`vibe-math-vmu/host-math.js:78`）⇒ pack 清单若再声明同名，必须在 apply 期**具名拒**（不能靠"first-wins 注册面"静默遮蔽；`VH:442` 附近把重复当作注册面正常情况）。改名策略：⑥ 下名字由 pack 持有，改名只需改 pack＋文档；但要同步 `vmu.tools.enabled` 的 known 集合与 `docs/18` 表，否则按名筛会被"unknown"拒。
3. **`vmu.packs.active` 与 `config.packs` 对工具面的影响不同**：
   - **⑥（清单 tools）**：两条激活路线**都能发布**工具（清单总会被 apply，装载后统一 install）。
   - **⑤′（值层 `vmu.tools.faces`）**：只有 `config.packs` 路线有效。`vmu.packs.active` 是运行时加载，`settings/defaults.json` 在**建内核前**按 `config.packs` 折入（`VE:300`），运行时包折不了，只留 `defaultsUnfolded` 报告（`VE:619`）。
   - 更大的一条：v3 包**必须**用 `config.packs` 声明。否则连 records 的轨都是 schema 默认值（`journal`/`problems` 等不在默认轨里，`vibe-math-vmu/kernel/records.js:214` 的构造期快照），tick/数据面会拿到具名拒而不是"安静地不跑"。
4. **未接线就发布 = 纸面能力**：`vibe_math_decide` 依赖 P0-8 的人工门。当前 `packs/v3/middleware/gates.js` 存在但**没有被 index.js import**（`vibe-math-vmu/packs/v3/index.js:42` 起的 import 列表里没有它），此时发布 decide 会让模型调到一个"看起来有、其实没接线"的工具——这正是 `vibe-math-vmu/packs/v3/prompts/assistant.json:34` 要求"具名说明缺什么、不要文字模拟"的那类。**P0-10 应在 P0-8 落地后再让 decide 发布**，或让它以"未接线"具名拒（不许假装成功）。
5. **list_agents 的前置**：v3 包当前**没有 slots**（`vibe-math-vmu/packs/v3/index.js:39`），名册不存在；⑥ 的最小改动里必须补 3 个槽位（取值可直接照 `vibe-math-vmu/packs/v3-core/index.js:73`），否则 list_agents 无数据源。
6. **`vmu.tools.faces` 万能门的副作用**：它能点亮**任何已发布面**，包括与 v3 无关的面（如 meeting/budget）；若走 ⑤′ 必须显式列白名单而不是 `*`，否则"换机构等于换工具面"就没了边界。

## 6. 我没核到的（如实）

1. **"模型真会调几个"是判断，不是遥测**：没有真机会话的 tool-call 分布数据。§1/§2 的依据是**提示词祈使句**（行号已给）＋ 框架内的拒绝提示；"偶发/否"的判断可能被真实用户行为推翻。可派生的只有：注册名 36（上文命令）、两层注册 36/36（`tests/audit-v3-registration-parity.mjs`）、根提示词点名 36/36（把 36 个名字逐个在 YML 里查找 ⇒ 全中；这恰恰说明"被列出"区分不出"真会调"）。
2. **没有在 `packs/v3/settings/defaults.json` 里实跑 ⑤′**：探针用的是**用户设置层**与**内联清单 settings**，走的是同一个 resolveFaces 分支，但没有真的把键写进 v3 包的 defaults.json（那需要改仓库文件，本任务只读）。代码路径上二者等价（都进内核活设置视图），但"文件路线"未实测。
3. **`handle.status()` 的 faces 字段形状未核**：探针里 `status().faces` 为 `undefined`（faces 在 `vibe_vmu_status` 的工具回执里拼装，见 `VH:449`），所以我用"实际发布了哪些工具名"作为证据，没有断言 enabled/sources。
4. **⑥ 的改动量是估算**：行数来自读 `VP`／`VK`／`VH` 的现有结构，未见实现；门禁影响（`tests/audit-tool-table.test.mjs` 只比较 `vibe_vmu_*` 行，v3 名不会破坏它；但 `tests/audit-pack-face.test.mjs`、`tests/audit-package-membership.mjs`、文档计数会需要更新）也只是**读代码推断**，没有实跑。
5. **清单 acceptance 的修订需要 Lead 决定**：本文件推荐的 10 个与 `docs/acceptance/phase6-v3-p0-build-checklist.md:150` 的列表有 3 个差异（§2），我没有权限改那份文件；若 Lead 坚持原列表，需要补"v3 写锁通道"的机制，而不能只发三个空壳工具。
6. **P0-8 的落地状态可能是并发变化的**：我读到的 `gates.js` 未接入清单（`vibe-math-vmu/packs/v3/index.js:42`），但另一路可能正在改；P0-10 的 decide 可用性应以落地时的 tree 为准。
