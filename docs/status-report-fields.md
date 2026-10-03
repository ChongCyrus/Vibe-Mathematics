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


<!-- G-6-FIELD-TABLE-START -->

## 逐预设字段作用域表（G-6：由源码派生，`tests/audit-status-report-fields.mjs` 双向校验）

### v2 的字段与作用域（**源自源码派生**）

| 字段 | 作用域 | 视图 | 含义 |
|---|---|---|---|
| `project` | 耐久 | status()（report() 同源） | 当前项目 id/slug |
| `projects` | 耐久 | status()（report() 同源） | 项目列表 |
| `problems` | 耐久 | status()（report() 同源） | 问题清单与状态 |
| `propositions` | 耐久 | status()（report() 同源） | 命题/引理索引 |
| `stateCommit` | 耐久 | status()（report() 同源） | 状态提交（原子提交标记与世代） |
| `formal` | 耐久 | status()（report() 同源） | Lean 形式化验证面（作业/回执/结论） |
| `paper.finalizedAt` | 耐久 | status()（report() 同源） | 论文定稿时间戳 |
| `paper.artifacts` | 耐久 | status()（report() 同源） | 论文产物清单（md/tex/pdf 等） |
| `paper.compile` | 耐久 | status()（report() 同源） | LaTeX 编译结果/降级原因 |
| `stateWriteFailures` | 会话 | status()（report() 同源） | 状态写失败计数（耐久写不健康时可见） |
| `activeCount` | 会话 | status()（report() 同源） | 活跃子代理数（由注册表推导） |
| `pendingDecisions` | 会话 | status()（report() 同源） | 等待人工决策的节点 |
| `registeredAgents` | 会话 | status()（report() 同源） | 已注册子代理表 |
| `verifyTasks` | 会话 | status()（report() 同源） | 验证任务视图 |
| `recentActivity` | 会话 | status()（report() 同源） | 最近活动日志（环形缓冲） |
| `paper.inFlight` | 会话 | status()（report() 同源） | 论文撰写是否在途 |
| `paper.inFlightSince` | 会话 | status()（report() 同源） | 在途开始时间 |
| `paper.inFlightAgeMs` | 会话 | status()（report() 同源） | 在途已持续时间 |
| `paper.reapedThisRun` | 会话 | status()（report() 同源） | 本轮回收的论文撰写者数 |
| `paper.queued` | 会话 | status()（report() 同源） | 排队的论文撰写请求 |

### v3 的字段与作用域（**源自源码派生**）

| 字段 | 作用域 | 视图 | 含义 |
|---|---|---|---|
| `project` | 耐久 | status()（report() 同源） | 当前项目 id/slug |
| `projects` | 耐久 | status()（report() 同源） | 项目列表 |
| `problems` | 耐久 | status()（report() 同源） | 问题清单与状态 |
| `propositions` | 耐久 | status()（report() 同源） | 命题/引理索引 |
| `stateCommit` | 耐久 | status()（report() 同源） | 状态提交（原子提交标记与世代） |
| `formal` | 耐久 | status()（report() 同源） | Lean 形式化验证面（作业/回执/结论） |
| `methods.project` | 耐久 | status()（report() 同源） | 项目级方法库 |
| `methods.global` | 耐久 | status()（report() 同源） | 全局方法库 |
| `paper.finalizedAt` | 耐久 | status()（report() 同源） | 论文定稿时间戳 |
| `paper.artifacts` | 耐久 | status()（report() 同源） | 论文产物清单（md/tex/pdf 等） |
| `paper.compile` | 耐久 | status()（report() 同源） | LaTeX 编译结果/降级原因 |
| `stateWriteFailures` | 会话 | status()（report() 同源） | 状态写失败计数（耐久写不健康时可见） |
| `activeCount` | 会话 | status()（report() 同源） | 活跃子代理数（由注册表推导） |
| `pendingDecisions` | 会话 | status()（report() 同源） | 等待人工决策的节点 |
| `registeredAgents` | 会话 | status()（report() 同源） | 已注册子代理表 |
| `verifyPending` | 会话 | status()（report() 同源） | 待验证项 |
| `queuedPlanActions` | 会话 | status()（report() 同源） | 排队的计划动作 |
| `plannerFails` | 会话 | status()（report() 同源） | 规划器失败计数 |
| `methods.pendingInventions` | 会话 | status()（report() 同源） | 待发明的理论/方法 |
| `recentActivity` | 会话 | status()（report() 同源） | 最近活动日志（环形缓冲） |
| `paper.inFlight` | 会话 | status()（report() 同源） | 论文撰写是否在途 |
| `paper.inFlightSince` | 会话 | status()（report() 同源） | 在途开始时间 |
| `paper.inFlightAgeMs` | 会话 | status()（report() 同源） | 在途已持续时间 |
| `paper.reapedThisRun` | 会话 | status()（report() 同源） | 本轮回收的论文撰写者数 |
| `paper.queued` | 会话 | status()（report() 同源） | 排队的论文撰写请求 |

### v5 的字段与作用域（**源自 `status()` 字面量；v5 的 `fieldScopes` 只是粗分类**）

> v5 的 `fieldScopes` 只给出**类别**（对象里两个键 `session` / `durable`，各自装若干**类别描述**而不是逐字段），因此下表按 `status()` 的顶层键逐条派生；**不在 `fieldScopes` 分类里的键** 作用域写"未分类（语义见实现）"而不猜。派生由 `tests/audit-status-report-fields.mjs` 双向核对，并打印 `frozen / doc-rows / exceptions` 三个计数（`frozen` = 源码里的顶层键数，`doc-rows` = 本表行数，`exceptions` = 显式豁免数，当前为 0）。

| 字段 | 作用域 | 视图 | 含义 |
|---|---|---|---|
| `ok` | 会话 | status()（report() 同源） | 调用是否成功（机器面总开关） |
| `institute` | 会话/派生 | status()（report() 同源） | 研究所名与根 |
| `project` | 会话/派生 | status()（report() 同源） | 当前项目（会话根的项目标识） |
| `key` | 会话 | status()（report() 同源） | 本研究所的状态键（状态文件与隔离用） |
| `phase` | 耐久 | status()（report() 同源） | 研究所阶段（从状态文件派生） |
| `running` | 会话 | status()（report() 同源） | 调度器是否在跑（重建后由会话状态决定） |
| `autoDone` | 会话 | status()（report() 同源） | 自动模式是否已完成收口（phase 的会话镜像） |
| `runId` | 耐久 | status()（report() 同源） | 当前 run 的 id |
| `leanNotices` | 会话 | status()（report() 同源） | Lean 提示（会话内累积） |
| `leanNoticesScope` | 未分类（语义见实现） | status()（report() 同源） | leanNotices 的作用域声明 |
| `fieldScopes` | 未分类（语义见实现） | status()（report() 同源） | 本对象自身的字段↔作用域分类（机器可读） |
| `backend` | 会话/派生 | status()（report() 同源） | 持久化后端种类 |
| `diagnostics` | 未分类（语义见实现） | status()（report() 同源） | 跳过/畸形事件与状态加载问题 |
| `debug` | 会话 | status()（report() 同源） | 调度调试计数（passes/reschedule 等） |
| `quorum` | 未分类（语义见实现） | status()（report() 同源） | 共识/投票视图 |
| `members` | 未分类（语义见实现） | status()（report() 同源） | 成员名册（含会话态字段） |
| `tasks` | 未分类（语义见实现） | status()（report() 同源） | 共享任务板 |
| `failedMembers` | 未分类（语义见实现） | status()（report() 同源） | provisioning 失败的成员 |
| `failedMembersNote` | 未分类（语义见实现） | status()（report() 同源） | 失败成员的处理说明（重试口径） |
| `pendingSpawns` | 未分类（语义见实现） | status()（report() 同源） | 被宿主 live-child 上限拒绝、已登记待补建的成员 |
| `pendingSpawnsNote` | 未分类（语义见实现） | status()（report() 同源） | 待补建的口径说明（何时重试、何时清空） |
| `chat` | 未分类（语义见实现） | status()（report() 同源） | 邮箱计数（pending 未 ack / delivered 有上限的确认账本） |
| `chatScope` | 未分类（语义见实现） | status()（report() 同源） | chat 两个计数的作用域声明 |
| `officeRequests` | 未分类（语义见实现） | status()（report() 同源） | 所办请求（办公室收件） |
| `officeRequestsShown` | 未分类（语义见实现） | status()（report() 同源） | 本次展示的请求数 |
| `officeRequestsCap` | 未分类（语义见实现） | status()（report() 同源） | 展示上限 |
| `officeRequestsDropped` | 未分类（语义见实现） | status()（report() 同源） | 因上限被丢弃的请求数 |
| `officeRequestsTruncated` | 未分类（语义见实现） | status()（report() 同源） | 是否发生了截断 |
| `persistence` | 未分类（语义见实现） | status()（report() 同源） | 持久化状态（含 scope） |
| `meeting` | 未分类（语义见实现） | status()（report() 同源） | 会议视图 |
| `parkedMeeting` | 未分类（语义见实现） | status()（report() 同源） | 挂起的会议 |
| `verify` | 未分类（语义见实现） | status()（report() 同源） | 验证面（按对象） |
| `verifyQueue` | 未分类（语义见实现） | status()（report() 同源） | 验证队列 |
| `verified` | 未分类（语义见实现） | status()（report() 同源） | 已验证对象集合 |
| `verifiedTrue` | 未分类（语义见实现） | status()（report() 同源） | 验证为真的对象 |
| `concludedFalse` | 未分类（语义见实现） | status()（report() 同源） | 结论为假的对象 |
| `verifiedNote` | 未分类（语义见实现） | status()（report() 同源） | 验证面的说明/口径 |
| `undecided` | 未分类（语义见实现） | status()（report() 同源） | 未定论对象 |
| `solveVotes` | 未分类（语义见实现） | status()（report() 同源） | 求解投票 |
| `formal` | 未分类（语义见实现） | status()（report() 同源） | Lean 形式化验证面（作业/回执/结论） |
| `paper` | 未分类（语义见实现） | status()（report() 同源） | 论文面（状态/产物/编译） |
| `lastProgressAt` | 未分类（语义见实现） | status()（report() 同源） | 最近一次进展的时间戳（停滞判定用） |
| `params` | 未分类（语义见实现） | status()（report() 同源） | 规范化后的运行参数（会话内可写、耐久只存落盘值） |

### v4：**没有** `fieldScopes`

v4 的源码里**不存在** `fieldScopes`（0 命中，本表由源码派生而非声明）。v4 的机器面字段以 `tests/formal-verify-v4.test.mjs` 的行为断言为准；本表因此**不为 v4 编造行**。

<!-- G-6-FIELD-TABLE-END -->
