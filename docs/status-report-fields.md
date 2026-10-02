# `status()` / `report()` 字段与作用域（v2 · v3）

> 本文件是 `vibe_math_status`（下称 **status**）、`vibe_math_report`（下称 **report**）以及 v3 的人读叙述报告
> （`Logs/报告.md`，由 `writeNarrativeReport()` 编译）的**字段契约**。v5 的同类说明在
> `vibe-math-v5/实现方案.md §14.9`；本文件补上 v2/v3 一直缺失的字段面文档（审查 F4）。
> 维护规则：**新增/改名一个字段，就在下表加/改一行**；`tests/v2-fix-probes.test.mjs`、`tests/v3-fix-probes.test.mjs`
> 的 `[F3] fieldScopes` / `[F1] pendingDecisions` / `[F5] 两面字段集` 断言会检查本表与代码一致。

## 1. 作用域（scope）语义

| scope | 含义 | 重启后 |
|---|---|---|
| `durable` | 落在**项目树**里（`State/`、`Formal/`、`Progress/`、`Propos/`、`Verified/` 等），本进程只是读取/更新它 | 仍在 |
| `session` | **本进程内存**（调度器/代理注册表/在飞任务/计数器）；进程退出即消失，重启后从零开始 | 归零 |

`status().fieldScopes` 就是这张表的机器可读版本（`session`/`durable`/`note` 三个键）；`status()` 里的字段名
必须能在该载荷里找到，否则 `[F3]` 守卫会红。

## 2. 字段表（v2 / v3）

| 字段 | 来源 | scope | status | report | 说明 |
|---|---|---|---|---|---|
| `ok` / `initialized` / `running` / `mode` | 内存（`rootAgent`/`scheduler`/`params`） | session | ✓ | 部分 | report 有 `running`/`mode`，无 `initialized` |
| `at` | `now()` 快照时间 | session | ✓ | ✓ | 两面都有（旧实现只有 report 有，审查 F5） |
| `project` / `projectExists` / `projects` | `currentProject` + 磁盘目录列举 | durable | ✓ | 部分 | report 只有 `project`/`projectExists` |
| `stateCommit` | 最近一次状态提交标记（`State/commit.json` 的投影） | durable | ✓ | ✗ | report 不含；要看提交历史读 `State/commit.json` |
| `stateWriteFailures` | 内存数组 `stateWriteFailures[]` 的 `{count,last}` | session | ✓ | ✓ | **重启归零**；不可当作"历史上没失败过" |
| `activeCount` / `maxParallelThreshold` | 由 `agentRegistry`/参数推导 | session | ✓ | ✓ | 空闲时 `0`，不是"没有代理定义" |
| `problems` / `propositions` | 卡片集合现算（v2 `已解决` 布尔；v3 `状态 === '已解决'`） | durable | ✓ | ✓ | 计数与列表同源（见 §3 的 F8 注） |
| `verifyTasks`（v2）/ `verifyPending`（v3） | 在飞验证任务投影 / 待验证候选数 | session / durable | ✓ | ✗ | 粒度不同：v2 是带票数的视图，v3 是计数 |
| `methods`（v3） | 方法卡集合大小 + 待沉淀发明台账 | durable + session | ✓ | ✓ | `pendingInventions` 是**当前批次**台账（会清空） |
| `pendingDecisions` | 待人工决策**计数** | session | ✓ | ✓ | 两面同形（数字）；明细在 `pendingDecisionItems`（仅 report；审查 F1） |
| `pendingDecisionItems` | 待人工决策明细 `{id,node,context}` | session | ✗ | ✓ | 名字与计数分开，避免把数组当数字读 |
| `registeredAgents` | `agentRegistry` 键数 | session | ✓ | ✓ | 与 `activeCount` 不同：含空闲/已完成未回收的登记项 |
| `queuedPlanActions` / `plannerEnabled` / `plannerFails`（v3） | 计划队列长度 / 参数 / 连续失败计数 | session | ✓ | 部分 | `plannerFails` 是**会话**计数，重启归零 |
| `formal` | `Formal/*.json` + 参数（v2 内联、v3 `formalSummary()`） | durable | ✓ | ✓ | v2 的 `formal.paths` 见下行 |
| `formal.paths`（v2） | 路径表：`base`（项目根，绝对）+ 相对项（`project`/`proofs`）+ 绝对项（`lib`/`proved`） | durable | ✓ | ✓ | 审查 F6：基准不同，故显式给出 `base` 与 `note` |
| `paper` | `paperStatusView()`：`id/dir/inFlight*`（session）与 `finalizedAt/artifacts/compile`（durable） | 混合 | ✓ | ✓ | 审查 F3/F5：**同一对象两种耐久性**，逐字段见 `fieldScopes` |
| `params` | 参数快照 | session | ✓ | ✓ | 权威值在 `vibe_math_setting.json`（durable） |
| `recentActivity` | 活动日志尾部 | session | ✓ | ✓ | **上限**：`ACTIVITY_REPORT_MAX`（v2/v3 现为 30，见常量与参数描述）；两面同一上限（审查 F2） |
| `fieldScopes` | 本表 §1 的机器可读版本 | — | ✓ | ✗ | v5 的 `*Scope` 模型移植（审查 F3） |

## 3. 两面差异与已知口径（有意为之，不是漂移）

- **`status` 独有**（守卫 `[F5]` 按本行逐字校验）：`initialized`、`projects`、`stateCommit`、`stateWriteFailures`、`plannerEnabled`、`plannerFails`、`fieldScopes`。
- **`report` 独有**：`pendingDecisionItems`（明细）。`paper`/`at` 已对齐（两面都有）。
- **F8 口径注（未证明漂移）**：`problems.solved` 在 v2 取**存储布尔** `已解决`（写路径：`vibe-math-v2.js` 内
  `q.已解决 = true` 的几处），在 v3 取 `状态 === '已解决'`。两者各自是唯一的写者，审查中**未构造出**
  "只更新其一"的代码路径，故按"有意差异"记录；若将来发现漂移，应让 v2 也保留 `状态` 字段或统一判据。
- **v3 人读报告**（`Logs/报告.md`）：布尔与方向状态已中文化（`运行中：是/否`、`d1:进行中(active)`），
  代码 token 放在括号里备查（审查 F7）。
