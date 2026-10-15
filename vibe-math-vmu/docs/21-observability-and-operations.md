# 21 · 可观测性与运维（日志 / 追踪 / 指标 / 告警 / 诊断 / 容量 / 发布 / 备份 / SLO / runbook / 可解释性）

> 状态：草案 v0.1（新卷；据 `kernel/bus.js`、`kernel/prompt/index.js`、`kernel/script-bridge.js`、`host.js`、`host-hooks.js`、`kernel/store.js`、`settings/schema.js` 的**现有观测面**展开，并补"运维视角"的缺口清单）
> 上位：`01-philosophy.md`（R11 可观测）、`02-architecture.md`（L3 总线/C 分区）、`03-interface-contract.md`（§2 服务／§8 错误码唯一登记表）、`04-settings.md`（键、H0–H3 热改）、`05-middleware.md`（钩子与总线审计）、`06-prompt-pipeline.md`（段/截断/快照）、`07-durability-library.md`（耐久与备份）、`11-gates-and-development.md`（门禁与 T0/T1 分层）、`13-migration.md`（迁移/兼容）、`17-agent-society-and-delegation.md`（通知与 explain 面）、`18-command-and-protocol-reference.md`（工具/协议/错误码速查）
> 读者：**运维者**（部署/值班/救火）、**机制作者**（判据与阈值）、**代理**（自查与自证）
> 一句话：本卷要让平台**答得出三句话**——「**它现在在干什么**」（现况）／「**为什么是这样**」（可解释）／「**怎么变好**」（判据与动作）。
> 通配约定：**正文中的设置键一律写成通配形**（`vmu.observability.*`／`vmu.alerts.*`／`vmu.quality.*`／`vmu.retention.*` 等）；**具体键形态与拟增码在派单回报中给全**（由生成管线登记）。**正文出现的每个 `VMU_*` 码都取自 `03-§8`**（唯一登记表）。

---

> ★★★ **本章要教的 API（★ 轮 502 实测补 ✓）**：★ **本卷原先【一个都没有点名**]✗ —— ★ **`audit.js`／`metrics.js`／`alerts.js`／`auditchain.js` 四个模块共 **19** 个公开导出，覆盖率 **0%** ** ✓（★ 与 `docs/07` 对 `records.js` 是同一类 ✓）。★ **现在逐个点名** ✓：
> - ★ **审计**：★ **`createAudit({ … })`** ✓、**`WHAT_VOCAB`** ✓（★ 审计行的 **`what` 词表** ✓）、**`DEFAULT_REDACT_KEYS`** ✓（★ 默认脱敏哪些键 ✓）、**`ENFORCED_SCOPE`** ✓（★ 强制作用域 ✓）、**`redactRow(row)`** ✓（★ 单行脱敏 ✓）；
> - ★ **度量**：★ **`createMetrics({ … })`** ✓、**`METRIC_CATALOGUE`** ✓（★ 指标目录 ✓）、**`NEVER_SAMPLED_KINDS`** ✓（★ **永不采样**的类别 ✓ —— ★ 这一项的意义是**明确哪些东西【不进**]样本** ✓）；
> - ★ **告警**：★ **`OPS`** ✓、**`SLO_STATES`** ✓、**`ERROR_BUDGET_ACTIONS`** ✓（★ 错误预算动作 ✓）、**`ALERT_CODES`** ✓、**`RUNBOOK`** ✓（★ 处置手册 ✓）、**`fingerprintOf(…)`** ✓（★ **告警去重的指纹** ✓）、以及告警面工厂 ✓；
> - ★ **审计链**：★ **`GENESIS`** ✓（★ 链的**创世行** ✓）、**`CHAIN_FAILURES`** ✓（★ 链失败的具名原因 ✓）、**`rowPreimage(row)`** ✓（★ **指纹前像** ✓ —— ★ 与 `fingerprintOf` 配对 ✓）、**`createAuditChain({ … })`** ✓。
> ★★ **由 `tests/audit-doc-api-coverage.test.mjs` 的配对表守着** ✓。

## 1. 心智模型：三层观测 + 一条不变量

```
① 事件层（发生了什么）   审计行 · 结构化日志 · 钩子决策 · 工具回执
        │  (只追加、可脱敏、可导出、环形上限)
② 关联层（为什么相关）   traceId 贯通：工具调用 → 钩子 → 原语 → 记录 → 结算
        │  (跨钩子/跨成员/跨任务/跨会话关联；可采样)
③ 判据层（意味着什么）   指标/KPI · 健康与降级 · 告警 · SLO/错误预算 · runbook
```

**一条不变量（本卷的总纲）**：**计数不静默** ✗——
- 任何**被跳过/被拒绝/被截断/被熔断/被降级/未接线**的动作，都**必须**在事件层留痕、在判据层可计数；
- "看起来没发生"与"发生了但被拒"**必须可区分**（这是 `05 §8` 与 `06 §14` 自证要求的运维化表达）。

**成熟度图例**：✓ 已实现（有真实观测面）｜⚠ 已实现但**面不全**（有具体缺口，附补齐点）｜✗ 计划（**本卷所有未实现工具名都写在含"计划/未实现/待实现"标记词的行上**）。

---

## 2. 结构化日志与审计（事件层）

### 2.1 审计面（已实现 ✓）
| 面 | 现有形状（逐字来自 `kernel/bus.js`） | 说明 |
|---|---|---|
| **审计行** | `audit(row)`；`onAudit(row)` 注入消费端 | 行字段（总线侧）：`{ts, seq, what, id, hook, order, failure, keys, dryRun, traceId, policy, consecutive, code, error, reason}` |
| **`what` 词表** | `middleware/registered`｜`middleware/skipped`｜`middleware/decision`｜`middleware/failed`｜`middleware/failure-policy`｜`middleware/breaker-tripped`｜`middleware/disabled`｜`middleware/enabled`｜`middleware/dry-run` | **只增不改**（扩展只加新词，不改旧词语义） |
| **环形上限** | 追踪环 **64** 条（`trace(traceId)` 可读） | 审计流本身由消费端落盘（本卷 §2.3 给保留策略） |
| **只追加** | 总线**不提供** `audit.clear()`/改写 | 条目**不得**关闭/篡改审计（`05 §7.2`） |
| **干跑标记** | `dryRun:true` 出现在行与决策上 | "看着像做了"与"真的做了"必须可分 |

### 2.2 其它事件源（已实现 ✓，但**面不全** ⚠）
| 源 | 现有观测 | 缺口（本卷要求补齐） |
|---|---|---|
| **工具面** | 回执 JSON（`ok/code/message/hint`）＋安装期的 `failures[]` | 缺**每工具调用计数/耗时/错误分布**（§4 指标） |
| **脚本桥** | `stats {runs, failures, timeouts, refusals, dryRuns}`＋`recent`（末 10）＋`history()` | 缺**队列等待/首字节时延**（§11 性能） |
| **宿主钩子桥** | `status {attached, planned, refusedUnsupported[], turnCalls, budgetRefusals}` | 缺**每钩子命中/耗时分布**（现只有总线上有 `hits`） |
| **提示词管线** | `status {sections[], bindings, truncation[], middlewareAppends[]}`；`assemble.sources[]` | 缺**装配耗时/缓存命中**（§11） |
| **控制面** | `control()`（state/pausedAt/pausedReason/resumes/stops）；`beat()` 心跳 | 缺**停滞判定阈值与 stale 列表**（§4/§14） |
| **耐久层**（与 `07` 交叉） | `store.stats()`；原子写；`open(expected)`/`migrate()` | 缺**备份年龄/恢复点清单**（§10） |

### 2.3 日志纪律（**必须**，否则不可运维）
1. **结构化优先**：行是**对象**（可 JSON 化），不是自由文本；自由文本只用于 `message`/`hint`。
2. **只追加**：正确性与审计**不允许**中间改写；纠错靠**新行**（带"更正"语义）。
3. **脱敏**：默认**不写**秘密/凭据/完整提示词正文；需要正文时写**长度＋哈希＋指针**（可经授权展开）。
4. **导出**：审计/指标**必须可导出**（JSONL 为基线）；导出即快照（带 `at` 与版本）。
5. **保留（retention）**：`vmu.retention.*` 声明**分级保留**（热/温/冷）与**上限**；超限时**必须**在事件层写"已裁剪"（**不得静默丢**）。
6. **不静默**：任何丢弃/裁剪/采样都留痕（§3.3 采样同理）。

---

## 3. 追踪（关联层）

### 3.1 traceId 贯通（已实现 ✓ 的骨架）
- 总线每次 `emit` 生成 `traceId`（形如 `t<seq>-<hook>`），并把该次调用的每步（`decided`/`failed`/`capability-violation`）挂在同一 id 下（`remember()`）。
- **工具层**：回执中的 `traceId` 可回指总线调用（`emit` 返回 `{ok, decisions, traceId, decision}`）。
- **脚本层**：脚本结果回执带 `trace`（超时/失败路径亦带）。
- **提示词层**：`assemble()` 返回带 `sources[]`（段来源）与 `at`；**建议**把当次 `traceId` 一并返回（⚠ 待补齐）。

### 3.2 关联维度（**必须**可查）
| 维度 | 关联什么 | 典型问题 |
|---|---|---|
| **跨钩子** | 同一原语操作触发的多个钩子 | "这次投票里有哪些中间件介入过？" |
| **跨成员** | 同一成员的多回合 | "r-2 这三次发言为什么都被拒？" |
| **跨任务** | 任务的 assign/transition/settle 链 | "任务 t-9 卡在哪个阶段、谁改的？" |
| **跨会话** | 会话切换与恢复（`13`/`07` 交叉） | "重启后为什么结论变了？" |
| **跨实例** | 多实例（§12） | "这条记录是哪个实例写的？" |

### 3.3 采样（计划 ✗ 的部分）
- **必须采样的**：变更类（谁改了什么）、拒绝类（为什么被拒）、结算类（结论从哪来）——**永不采样**。
- **可采样的**：高频只读命中（如 `middleware/skipped`、缓存命中）⇒ 采样率 `vmu.observability.*`，且**采样本身要计数**（"采了多少、丢了多少"）。
- **可复现性**：采样决策必须可由 `traceId` 稳定重放（同 id 同结果），否则回放失效。

---

## 4. 指标与 KPI（判据层）

### 4.1 指标清单（名称／定义／来源／判据）
| 指标 | 定义 | 现有来源 | 状态 |
|---|---|---|---|
| **吞吐** | 每单位时间完成的回合/任务/结算数 | 控制面计数、任务台账、记录 | ⚠ 需聚合 |
| **周期时间** | 任务从 create → done；会议从 open → close | `vmu.tasks`／会议回执 `at` | ⚠ 需聚合 |
| **积压** | 未开始＋进行中任务数（按阶段） | `tasks.stage()` | ✓ 可算 |
| **WIP** | 同时进行中任务数（含每人上限） | `tasks.list()` | ✓ 可算 |
| **失败率** | 失败回执数／总回执数（按码分组） | 工具回执、`failures[]` | ⚠ 需聚合 |
| **拒绝率** | `VMU_MIDDLEWARE_REJECTED`＋`VMU_NOT_PERMITTED`／总操作数 | 总线审计、回执 | ⚠ 需聚合 |
| **预算消耗** | 每回合工具调用数／上限（`vmu.limits.toolCallsPerTurnCap`）；时长预算 | `host-hooks.status().turnCalls/budgetRefusals` | ✓ 部分 |
| **熔断/降级** | 处于降级窗口的条目数与时长 | `status().entries[].disabledReason` | ✓ |
| **截断率** | 被截断段数／段总数；丢弃字符数 | `status().truncation[]` | ✓ |
| **时间线密度** | 追踪环占用（/64）与丢弃计数 | `trace()` 环 | ✓ |
| **存储** | 记录数／快照年龄／索引陈旧度（`VMU_INDEX_STALE` 面） | `store.stats()` | ⚠ |
| **成本** | 引擎/脚本调用次数与时长（可折算） | 脚本桥 `stats`、数学面回执 | ⚠ |

### 4.2 KPI（可判定的目标）
- **可判定**：每个 KPI 必须写成"**某窗口内某指标 ≥/≤ 某值**"（例：拒绝率的 7 日 P95 ≤ 上限；截断率 ≤ 阈值；熔断时长 ≤ 恢复目标）。
- **不许**用"体感"指标（"响应尚可" ✗）；**每个 KPI 必须有一个对应的告警或 SLO 条款**（§5/§13）。

### 4.3 计数纪律（本卷硬约束）
1. **每个拒绝都要计数**（且按 `code` 分组）——`03-§8` 的码表就是分组维度。
2. **每个跳过都要计数**（含"钩子空跑"与"条目被禁用/熔断"）。
3. **每个"未接线"都要计数**（例：**6 个无生产者钩子**——`turn/reply-parsed`、`record/append-before`、`record/appended`、`budget/exceeded`、`pack/loading`、`pack/loaded`；见 §6.4）。
4. **指标本身的自证**：指标值必须能追溯到事件（抽样审计：任取一个指标数字，能列出构成它的行）。

---

## 5. 健康与就绪（现况自证）

### 5.1 自检清单（每次"就绪探测"都要答）
| 检查 | 判据 | 观测入口 |
|---|---|---|
| 内核是否启用 | `vmu.core.enabled` | `vibe_vmu_status` |
| 装配了哪些服务/接缝 | 服务清单（`03-§2` 的 8 个＋条件） | `status` |
| 中间件是否装载/熔断 | 条目数、`consecutiveFailures`、`disabledReason` | `middleware action=list` |
| 宿主钩子是否挂上 | `attached[]` vs `planned[]`；`refusedUnsupported[]` | 桥 `status()`（**当前未暴露为工具** ⚠） |
| 耐久是否可用 | `store.stats()`、`open(expected)` 结果 | `records`/`status` |
| 队列/积压 | 积压与 WIP | `task action=stage` |
| 实例身份 | `instance`（多实例判据，§12） | `status.instance` |
| 未接线项 | 6 个无生产者钩子清单 | §6.4（**建议进 `status`** ⚠） |

### 5.2 降级档位（**必须显式**）
| 档位 | 触发 | 行为 | 可见性 |
|---|---|---|---|
| **L0 正常** | 无降级条目 | 全功能 | — |
| **L1 局部降级** | 某条目熔断/失败策略触发 | 该条目停用；原语照常 | `entries[].disabledReason`＋审计 `middleware/breaker-tripped` |
| **L2 观测降级** | 审计/指标落盘失败 | **业务继续**，但**必须**报失败（`VMU_AUDIT_WRITE_FAILED`） | 事件层＋告警（§5.3） |
| **L3 只读降级** | 耐久不可用/版本不兼容 | 拒绝写操作，允许读；给出恢复步骤 | `VMU_STORE_FAILED`/`VMU_VERSION_MISMATCH` |
| **L4 停用** | 管理员 `control stop` 或 `vmu.core.enabled=false` | 不注册工具 / 全停 | `control action=status` / `status` |
**纪律**：档位切换**必须**留痕；**不得**静默降级（"悄悄变慢/悄悄少做"＝缺陷）。

### 5.3 告警面（与 `17` 通知面交叉 ✓）
| 机制 | 规则（**必须可配**） |
|---|---|
| 阈值 | 指标＋窗口＋比较（`> / < / 变化率`）；阈值用通配 `vmu.alerts.*` 声明 |
| 抑制（inhibition） | 上级故障存在时**抑制**下级告警（防雪崩刷屏） |
| 去重（dedup） | 同指纹告警在窗口内**只发一次**（指纹＝指标＋对象＋码） |
| 升级（escalation） | 未确认 N 分钟后**升级**（通知下一层） |
| 静默窗口（silence） | 计划维护期**静默**，但**必须**在恢复后补一份摘要（**不得丢**） |
| 通知通道 | 经 `17` 的通知原语（成员/群/记录）；**告警也是一条记录**（可追溯） |
**纪律**：**告警不得静默丢弃**；静默/抑制/去重都要**计数**（"被抑制了多少条"）。

---

## 6. 诊断工具（怎么问"为什么"）

### 6.1 已实现 ✓
| 工具/面 | 用法 | 回答 |
|---|---|---|
| `vibe_vmu_status` | 无参 | 现况总览（服务/接缝/条目/包/实例/`settings.resolved`） |
| `vibe_vmu_middleware action=list` | — | 条目/命中/失败/熔断 |
| `vibe_vmu_middleware action=dryRun` | `rule`＋`samples` | **干跑**：这条规则在这些样本上会做什么（无副作用） |
| `vibe_vmu_middleware action=validate` | `rule` | 规则是否合法＋能力词表 |
| 总线 `trace(traceId)` | 代码侧 | 一次钩子调用的**时间线**（环形 64） |
| `vibe_vmu_pack action=plan` | manifest | **纯**报告"将会改什么" |
| `vibe_vmu_script action=run`（dry-run） | — | 脚本的**计划 argv/cwd/timeout**（不执行） |
| `assemble().sources[]` / `status().truncation[]` | 代码侧 | 段来源＋**截断数字** |
| `snapshot(scopes)` | 代码侧 | 逐字快照（回归基线） |

### 6.2 计划 ✗（**未实现**）
- `vibe_vmu_trace`（**计划/未实现**）：按 `traceId`/对象/时间窗取时间线（把 `trace()` 环升级为可查询面）。
- `vibe_vmu_explain`（**✓ 已实现，轮 530**）：输入"某次拒绝/某条截断/某个字段变更"⇒ 输出**判据链**（规则→能力→决策→裁决），与 `17` 的 explain 面统一。
- `vibe_vmu_metrics`（**计划/未实现**）：指标快照/序列查询（§4 的聚合）。
- `vibe_vmu_health`（**计划/未实现**）：§5.1 自检清单的一键版（含降级档位与未接线项）。
- `vibe_vmu_audit`**✓ 已实现（轮 554 ✓，10 个动作）**：`tail/query/verify`（含审计链校验）。
- `vibe_vmu_runbook`（**计划/未实现**）：按故障指纹取 runbook 条目（§14）。
- `vibe_vmu_export`（**计划/未实现**）：审计/指标/快照的导出与打包（脱敏后）。

### 6.3 错误码 → 处置
**唯一登记表＝`03-§8`**；人读速查视图见 `18-§7`（本卷不复制，避免两处漂移）。运维角度的**三条通则**：
1. 先看 `hint`（`03-§8` 要求每个码都给"下一步"）；
2. 同码连续出现 ⇒ **配置问题**，别盲目重试；
3. `ok:false` **必带 `code`**；只有 `error` 而无 `code` ⇒ **工具壳外的异常**，按缺陷处理。

### 6.4 **未接线清单（必须公开计数）** ✗
当前**无生产者**的冻结钩子（**6 个**）：`turn/reply-parsed`、`record/append-before`、`record/appended`、`budget/exceeded`、`pack/loading`、`pack/loaded`。
- 影响：相应"介入"是**纸面能力**（配了也不会触发）；
- 纪律：`status`/`health` **必须**列出该清单（否则运维者会以为"我配了却没生效＝平台坏了"）；
- **注意（本卷核对到的最新事实）**：`prompt/section-assembled` **已经接线** ✓（`05`/`18` 中"无生产者"的记述**已过期**，需回改——见 §16 与 §18）。

---

## 7. 容量与预算运维

| 面 | 现有机制 | 运维动作 |
|---|---|---|
| **每回合工具调用** | `vmu.limits.toolCallsPerTurnCap`（>0 时框架级挂 `tools/pre-execute`＋`agent/turn-stopping`，超限 deny，码 `VMU_RESOURCE_BUDGET`） | 观察 `budgetRefusals`；上调前先查"是否被循环调用" |
| **成员/任务容量** | 容量检查分散在 `members`/`tasks`（抛 `VMU_RESOURCE_BUDGET`） | 观察拒绝率；先清积压再扩容 |
| **脚本超时** | `timeoutMs`（默认 60000）＋宿主 `graceMs` | 超时率↑ ⇒ 改脚本或调预算 |
| **钩子超时** | `vmu.middleware.hookTimeoutMs`（默认 2000） | 超时即失败（按条目策略）⇒ 先看熔断列表 |
| **加载/内存上限** | `vmu.safety.*`（`readMemoryCeilingMb`；越界有具名面） | 触顶 ⇒ 降载或提额（**不得**静默丢任务） |
| **成本核算** | 脚本 `stats`＋数学面回执＋钩子次数 | 成本上升先查"拒绝率是否也在上升"（重试放大） |
**超限行为（必须统一）**：**拒绝＋具名＋计数**（不是排队到超时、也不是静默丢）；且**给出"当前值与上限"**（`VMU_RESOURCE_BUDGET` 的登记要求）。

---

## 8. 配置运维（H0–H3 与变更审计）

| 等级 | 语义 | 生效 | 运维纪律 |
|---|---|---|---|
| **H0** | 立即 | 同回合 | 可热改；出问题**立刻**回改（仍留痕） |
| **H1** | 下一回合 | 下一回合 | 观察一个回合再判定 |
| **H2** | 下一会话 | 需重启 | **必须**走变更窗口（§9） |
| **H3** | 只读（框架所有） | **拒绝**（`VMU_NOT_PERMITTED`） | 永不尝试；要改＝改平台 |
**变更审计（必须）**：`who/when/key/old/new/hot/who-may/appliesFrom/source`（`vibe_vmu_set` 回执已含 `hot/who/appliesFrom/source` ⇒ 补 `old/new` 落审计）。
**回滚**：H0/H1 **必须**能一键回改；H2 **必须**保留上一个可运行配置快照（版本化）；回滚本身**也是一次变更**（留痕）。
**禁止**：把"改了没反应"当作正常（`vibe_vmu_set` 的 H3 具名拒绝就是为杜绝这类沉默——**任何"无反馈的改动"都是缺陷**）。

---

## 9. 发布与兼容运维（与 `13` 交叉 ✓）

| 环节 | 机制（登记口径见 `13`） | 运维动作 |
|---|---|---|
| **迁移 dry-run** | `VMU_MIGRATE_DRYRUN_FAILED`（未落盘即失败） | 发布前**必跑**；失败即中止 |
| **回退点** | `VMU_ROLLBACK_UNAVAILABLE`（无回退点 ⇒ 拒绝执行） | 先落回退点；`VMU_ROLLBACK_FAILED` ⇒ 人工介入 |
| **兼容矩阵** | `VMU_COMPAT_UNKNOWN_COMBO`（**未知组合不得默认兼容**） | 未知组合 ⇒ 先补矩阵再发 |
| **废弃推进** | `VMU_PARAM_RENAMED`→`VMU_PARAM_DEPRECATED`→`VMU_PARAM_REMOVED`（三阶段，废弃期给替代键） | 每阶段**给替代键＋观察窗** |
| **别名/改名** | `VMU_ALIAS_AMBIGUOUS`（多义） | 消歧后再发 |
| **版本握手** | `apiVersion` 不匹配 ⇒ `VMU_VERSION_MISMATCH`（给双方版本） | 发布窗口内先对齐版本 |
**发布门（建议）**：① dry-run 绿；② 回退点已落；③ 兼容矩阵覆盖；④ 告警阈值已就位（§5.3）；⑤ 本卷 §15 的验收场景绿。

---

## 10. 备份与灾难恢复（与 `07` 交叉 ✓）

| 面 | 要求 |
|---|---|
| **备份对象** | 耐久根（`store`）：每条记录的原子写产物＋索引＋审计（**审计与数据同源**） |
| **备份策略** | 周期＋变更触发（**变更后必须可追**）；带**校验**（`VMU_CRYPTO_VERIFY_FAILED` 面） |
| **恢复点目标（RPO）** | 必须写明"最多丢多少"（以事件层可回放为准） |
| **恢复时间目标（RTO）** | 必须写明"多久恢复"（含重建索引，`VMU_INDEX_STALE` 面） |
| **演练** | **必须**有演练记录（恢复流程可执行；演练＝验收场景之一） |
| **恢复后的自证** | 恢复必须能证明：记录数/指纹/审计链**一致**（差异必须显式列出） |
| **不可用降级** | 备份不可用 ⇒ 进 **L3 只读降级**（§5.2），**不得**静默继续写 |

---

## 11. 性能剖析（时间都花在哪）

| 观测点 | 现有 | 目标 |
|---|---|---|
| **钩子预算** | `hookTimeoutMs`（默认 2000）；超时按条目失败策略 | 每钩子**耗时分布**（P50/P95/max）＋超时计数 |
| **装配耗时** | `assemble()` 返回 `at`；`status().truncation[]` | 段数×字节数×耗时的分解；**缓存命中率** |
| **队列等待** | 脚本桥 `stats`（runs/failures/timeouts） | **等待时长**（提交→起跑）与**首字节时延** |
| **缓存** | 提示词管线（确定性）＋M1 dryRun | **命中/未命中/失效原因**（指纹变化来源） |
| **热点** | 无 | 按 `traceId` 聚合"最慢的 N 条链路" |
**纪律**：性能数据**也要计数不静默**（"没测到"必须与"测得为 0"可分）；剖析**不得**改变业务语义（采样/干跑优先）。

---

## 12. 多实例与多工作区运维

| 面 | 要求 |
|---|---|
| **实例身份** | 每个工具回执带 `instance`（`status.instance`）⇒ "谁答的"可判（同名工具在两行配置下会**只保留一份注册**，无身份则回执自相矛盾） |
| **注册冲突** | 同名注册失败 ⇒ 记入 `failures[]`（**具名**，不静默）；运维者据此判断"我的第二个实例没生效" |
| **隔离** | 每个工作区（`root`）独立耐久根；**跨区写默认禁止**（越界 ⇒ `VMU_PATH_ESCAPE_REFUSED`） |
| **联合查询**（计划 ✗） | 多工作区只读聚合（`vibe_vmu_metrics`/`vibe_vmu_audit` 的**计划**扩展）；**跨区写**必须显式授权 |
| **一致性** | 跨实例的**同一对象**不共享可变状态；"谁改的"以审计行为准（含 `instance`） |

---

## 13. SLO 与错误预算

| 概念 | 定义（**必须可度量**） |
|---|---|
| **SLI** | 指标（§4.1）＋窗口（如 7 日滚动）＋对象集合（如"全部结算操作"） |
| **SLO** | SLI 的目标（如"结算成功率 ≥ 99%"），用通配 `vmu.quality.*` 声明 |
| **错误预算** | `1 − SLO` × 请求量；**耗尽即冻结**非必要变更（发布门 §9 增加一项） |
| **惩罚** | 预算耗尽 ⇒ 禁止 H2 变更与包装载（**H0/H1 的救火变更除外**，且必须留痕） |
| **豁免** | 计划维护/演练/上游故障期可豁免，**但必须**记录豁免理由与时长 |
| **报表** | 每次发布后出"预算消耗＋豁免"摘要（可导出） |
**纪律**：SLO **不得**自证（不能既当运动员又当裁判）：度量由事件层独立计数（§4.3）。

---

## 14. Runbook（常见故障 → **具名**处置）

> 每条 runbook：**指纹**（怎么认出它）→ **判据**（看哪个面/码）→ **动作**（按序、可回滚）→ **验收**（怎么算修好）。

| # | 指纹 | 判据 | 动作（按序） | 验收 |
|---|---|---|---|---|
| R1 | 工具全消失 | `status` 面不可用/`vmu.core.enabled=false` | ①查配置；②`set key=vmu.core.enabled value=true`；③跑 §5.1 自检 | `vibe_vmu_status` 回执 `ok:true`；§5.1 全项可读（**具名**判据） |
| R2 | 某个中间件"没生效" | `middleware list` 里条目 `disabledReason` 非空 | ①看 `consecutiveFailures`；②查审计 `middleware/breaker-tripped`；③修条目；④`middleware enable` | 条目 `disabledReason` 为空且 `hits` 增长（**场景**判据） |
| R3 | 动作被拒但不知为何 | 回执 `code`＋`hint` | ①按 `18-§7` 查处置；②若 `VMU_MIDDLEWARE_REJECTED` ⇒ 取中间件 id；③`middleware dryRun` 复现 | 同一输入在 `dryRun` 下**稳定**给出同一决策（**断言**级） |
| R4 | 提示词变了/少了 | `status().sections[]` 的 `overridden`／`truncation[]` | ①比对 `snapshot` 快照；②看 `sources[]` 找来源；③若是截断 ⇒ 调预算或改 `keepChars` | 快照逐字一致或差异可逐段解释（**具名**段名） |
| R5 | 审计/指标不落盘 | `VMU_AUDIT_WRITE_FAILED` | ①进 **L2 观测降级**（业务继续）；②查路径/权限/磁盘；③修好后**补报**缺口 | 新行可见且缺口摘要已记（**具名**文件与 errno 面） |
| R6 | 耐久写失败 | `VMU_STORE_FAILED`/`VMU_WRITE_FAILED` | ①进 **L3 只读降级**；②查磁盘/权限；③按 §10 恢复点核验 | 写回执 `ok:true` 且恢复自证通过（**场景**判据） |
| R7 | 脚本超时/起不来 | `VMU_JOB_TIMEOUT`/`VMU_MIDDLEWARE_FAILED`（带 `hostStack`/`shape`） | ①看 `stats.timeouts`；②查 `cwd`（**必须**给真实字符串，规避宿主 `validateNoNullByte` 缺陷）；③调 `timeoutMs`；④重跑 | 脚本 `run` 回执 `ok:true`（**场景**判据） |
| R8 | 预算触顶 | `VMU_RESOURCE_BUDGET`（含当前值/上限） | ①查 `budgetRefusals`；②定位循环调用；③清积压后再提额 | 拒绝率回落且无新增预算拒绝（**具名**指标） |
| R9 | 版本不匹配 | `VMU_VERSION_MISMATCH`（双方版本） | ①对齐 `apiVersion`/manifest；②重载；③跑 §9 发布门 | 装载 `ok:true`（**断言**级） |
| R10 | 迁移中断 | `VMU_MIGRATE_DRYRUN_FAILED`/`VMU_ROLLBACK_FAILED` | ①停写（L3）；②按 `13` 回退；③dry-run 绿后再发 | dry-run 绿＋数据核验一致（**场景**判据） |

---

## 15. 可解释性（"为什么"必须可答）与验收

### 15.1 三个必答问题（与 `17` explain 面交叉 ✓）
| 问题 | 必须能给出的答案 | 现有面 | 缺口 |
|---|---|---|---|
| **为什么这次被拒？** | 码＋`hint`＋**判据链**（哪条规则/哪个能力/哪个门槛） | 回执 `code/hint`；总线审计 | ✓ 已实现（轮 530）：`vibe_vmu_explain`（**✓ 已实现，轮 530**）把判据链结构化 |
| **为什么这条被截断？** | 段名＋`kept/dropped/mode`＋预算值 | `status().truncation[]`＋正文告知 | 需把预算来源一并给出（哪个键/哪一层） |
| **谁改了什么？** | `who/when/key/old/new/hot` | `vibe_vmu_set` 回执（缺 `old/new`）＋审计 | ⚠ 需把 `old/new` 落审计；计划 ✗：**工具名** `vibe_vmu_audit` 未注册 —— ★ **而其能力＝ `kernel.audit.query`** ✓（★ 轮 553 实测存在 ✓，★ 只是还没有工具面暴露它 ✓） |

### 15.2 验收（**机器可判定**）
1. **计数不静默（断言级）**：对同一输入连续触发 N 次拒绝，事件层的拒绝计数**必须**增加 N（**红/绿可判定**）；且 `VMU_*` 分组计数之和＝总拒绝数。
2. **未接线不得静默（具名判据）**：`status`/`health` 面**必须**列出 6 个无生产者钩子（**具名**清单逐字匹配）。
3. **追踪贯通（场景）**：给定一次投票**场景**，`traceId` 必须能串起 `ballot/cast` 钩子→投票原语→`ballot/tally`→记录行（缺任一环即红）。
4. **降级档位可判定**：制造一次审计写失败 ⇒ 档位**必须**显示 L2 且业务仍成功（**红/绿**）；制造耐久失败 ⇒ **必须** L3 且写操作被拒。
5. **截断可解释（具名）**：截断段名与 `kept/dropped/mode` 必须与正文告知**逐字一致**。
6. **告警不丢（断言）**：静默窗口内产生的告警**必须**在恢复后补发摘要，条数相等。
7. **多实例可判（具名）**：两个实例注册同名工具 ⇒ 第二个的失败**必须**出现在 `failures[]` 且带 `instance`。
8. **可及性检查必计数（断言，N5）**：对同一产出物连续跑 N 次 `check()` ⇒ 检查计数**必须**增加 N（**红/绿可判定**）；即使全部通过也要计入总检查数 ✓（"没检查"与"检查通过"可分）。
9. **可及性失败按策略分派（红/绿）**：缺 alt 文本且 `failOn` 含 `alt-text` ⇒ **红**（`VMU_A11Y_ALT_TEXT_MISSING`）；同一缺项在 `failOn` 不含它时 ⇒ **计数告警**而不阻断 ✓。
10. **对比度只判声明（具名）**：缺声明 ⇒ **红** `VMU_A11Y_CONTRAST_DECLARATION_MISSING`；声明值 < `vmu.a11y.minContrastRatio` ⇒ **红**；本卷**不得**出现像素级测量（静态门：无渲染/图像库调用）✗。

---

## 16. 与其它卷的交叉引用（**必读**）
- `03-§8`：**错误码唯一登记表**（本卷所有码取自此处；新增码由生成管线登记）。
- `12`：用户手册与写作规范（本卷 §17 的可及性检查**只引用**其规范 ✗，不重定义）。
- `22-§6`：传播类产出物（公众摘要/科普稿）的生成与证据保真（本卷 §17 **只做检查** ✓）。
- `05`：总线失败策略/熔断/干跑/`trace()`；**§5.4 缺口**（本卷 §6.4 的运维化表达）。
- `06`：段状态/截断/快照（本卷 §11/§15 的判据来源）。
- `07`：耐久与备份（本卷 §10）。
- `11`：门禁分层（本卷 §15 的验收场景应进 T1/T2 场景集）。
- `13`：迁移/兼容/废弃（本卷 §9）。
- `17`：通知与 explain 面（本卷 §5.3/§15.1）。
- `18`：工具/协议/错误码速查（本卷 §6.3 引用其 §7，不复制）。

---

## 17. 产出物无障碍（Accessibility of produced artifacts —— **补 N5** ✗✓）

> **为什么要有这一节** ✗：批评者第 6/7 轮关键词实测"**无障碍**"**0 命中** ✗ —— 平台会产出**报告/纪要/论文集/幻灯片/图表** ✓，却**没有一条机器可判定的可及性检查** ✓。
> **边界（只引用不重定义 ✗）**：本卷只写"**要检查什么**"✗（检查项、失败码、时机、计数）；**内容的写作规范**归 `12` 手册 ✓；**传播类产出物（公众摘要/科普稿）的生成与证据保真**归 `22-§6` ✓；**渲染/转换实现** ✗ 不在本卷。

| 字段 | 内容 |
|---|---|
| **名称** | 产出物可及性检查（Artifact Accessibility Check） |
| **目的** | 让"可及性"从**口头要求**变成**可判定 + 可计数**的检查 ✓：缺项即**具名拒**或**计数告警**（按策略）✓ |
| **面向谁** | 文档/传播作者、运维者、审计、代理 |
| **接口形状** | 协议 `A11yChecklist` ⛔ 待实现：`{ itemId, what, judgement, source, failCode }`；服务 `vmu.a11y`（**计划 ✗**）：`checklist()`／`check(artifactRef)`／`report(artifactRef)`；工具 `vibe_vmu_a11y` ⛔ 未实现；钩子 `artifact/check-before` ⛔ 提案 |
| **检查项（**只写要检查什么** ✗）** | ① **结构化标题层级**（无跳级、单 H1）⇒ `VMU_A11Y_HEADING_GAP`；② **表格表头**（每表有表头行）⇒ `VMU_A11Y_TABLE_HEADER_MISSING`；③ **图片替代文本**（每个图/图表有 alt）⇒ `VMU_A11Y_ALT_TEXT_MISSING`；④ **对比度声明**（正文/图表必须有**声明值**，本卷不测量像素）⇒ `VMU_A11Y_CONTRAST_DECLARATION_MISSING`；⑤ **链接文本**（"点击这里"类禁用）⇒ `VMU_A11Y_LINK_TEXT_AMBIGUOUS`；⑥ **数学公式的文本替代**（关键公式给线性/文字表述）⇒ `VMU_A11Y_MATH_ALT_MISSING`；⑦ **语言标记**（文档声明语言）⇒ `VMU_A11Y_LANG_MISSING`；⑧ **阅读顺序/表意**（导出为纯文本时仍可读）⇒ `VMU_A11Y_READING_ORDER_RISK`（**警告**级） |
| **可调控参数** | `vmu.a11y.enabled`（默认 `false`）、`vmu.a11y.checkScope`（默认 `["reports","minutes","proceedings"]`）、`vmu.a11y.requireAltText`（默认 `true`）、`vmu.a11y.minContrastRatio`（默认 `4.5`，**声明值**的下限 ✓）、`vmu.a11y.headingGapPolicy`（默认 `block`；可选 `warn`）、`vmu.a11y.checklist`（默认 `builtin`）、`vmu.a11y.failOn`（默认 `["alt-text","heading-gap","table-header"]`） |
| **相关错误码** | `VMU_A11Y_HEADING_GAP` ⛔／`VMU_A11Y_TABLE_HEADER_MISSING` ⛔／`VMU_A11Y_ALT_TEXT_MISSING` ⛔／`VMU_A11Y_CONTRAST_DECLARATION_MISSING` ⛔／`VMU_A11Y_LINK_TEXT_AMBIGUOUS` ⛔／`VMU_A11Y_MATH_ALT_MISSING` ⛔／`VMU_A11Y_LANG_MISSING` ⛔／`VMU_A11Y_READING_ORDER_RISK` ⛔（警告级） |
| **四条哲学** | F：不启用＝无检查（默认可及性要求关闭）✓｜T：检查集/阈值/哪些算致命可配 ✓｜D：**检查项与判据由 pack/清单声明**（内核不认识"alt 文本"）✓｜X：新产出物类型只加 `checkScope` 项 ✓ |
| **实现要点** | ① 检查**必须计数**（本卷总纲"计数不静默" ✓）：`check()` 返回 `{ items[], failed[], warned[], counts }`，即使通过也要计入总检查数 ✓；② 失败按 `failOn` 分派**具名拒** vs **警告** ✓（`headingGapPolicy`、`failOn` 决定）；③ **不测量像素/不渲染** ✗：对比度只看"声明值是否存在且 ≥ `minContrastRatio`" ✓（真实测量需渲染器 ⇒ 未核 O-N11）；④ 检查时机：产出物**落盘/发布前**由 `artifact/check-before` 钩子调用 ✓；⑤ 与 `12` 的分工：写作规范**只引用** ✗；与 `22-§6` 的分工：传播稿的**生成**归 22，**检查**在此 ✓ |
| **依赖与前置** | 07（产出物落盘）✓、21-§2（审计/计数）✓、`12`（写作规范，引用 ✓）、`22-§6`（传播产物，引用 ✓） |
| **成熟度** | ✗ 计划（本仓今天**没有**任何可及性检查 ✓） |
| **优先级** | P2（对外产出物必备；对内纪要可后置） |

> **这一节怎么由 settings＋中间件＋pack 组合出来** ✓：**settings** 给启停、检查范围、阈值、致命项集合；**中间件**在 `before`（产出物发布前）跑清单、把致命缺项**具名拒**、把其余**计数告警**；**pack** 给"哪些产出物必须过检、哪些检查项是硬门"。**内核只提供记录、钩子与设置** ✓。

---

## 18. 未核项（**编号登记见 `14-§2`**）

> 本卷的"未核/待接线/待登记"项统一在 `14-§2` 编号登记，避免两处漂移；下列为**本卷视角**的未核项。

| # | 未核项 | 现状 | 影响 |
|---|---|---|---|
| N1 | **6 个无生产者钩子**（`turn/reply-parsed`、`record/append-before`、`record/appended`、`budget/exceeded`、`pack/loading`、`pack/loaded`） | 已核实（本卷 §6.4） | 相关介入是纸面能力；需接线或公开计数 |
| N2 | `05`/`18` 中 **`prompt/section-assembled` "无生产者"** 的记述 | **已过期**（现已接线 ✓） | 文档漂移；需回改（非本卷写入面） |
| N3 | 指标聚合（吞吐/失败率/拒绝率） | 无独立面 | §4.1 的 ⚠ 项；计划 `vibe_vmu_metrics`（**未实现**）。★ **R20 补**：**服务面**（`vmu.metrics`）已在 R19 进**能力门控的服务目录**（可被 M2 模块 `observe()`）且聚合快照已接到**回合边界**（§20），但**没有工具面**且**出货 pack 里没有计数者** ⇒ "指标聚合"仍**未建立**，收口条件见 **§20.4** ✗✓ |
| N4 | 宿主钩子桥状态未暴露为工具 | 仅代码侧 `status()` | 运维者看不到 `attached/planned/refusedUnsupported` |
| N5 | 审计/指标保留策略与导出 | 无声明面 | §2.3/§2.5 需 `vmu.retention.*`＋导出工具（**未实现**） |
| N6 | SLO/错误预算 | 无面 | §13 全是计划项 |
| N7 | 备份演练记录 | 依赖 `07` 的缺口 | §10 的 RPO/RTO 未定值 |
| N8 | 采样策略 | 无 | §3.3 计划 |
| N9 | 成本核算口径 | 无 | §7 的职业化程度受限 |
| **N10** | **产出物可及性检查器未实现**（N5 缺口） | 只有本卷 §17 的检查项与失败码 ✓ | 对外产出物的可及性仍靠人工；计划 `vibe_vmu_a11y`（**未实现**） |
| **N11** | **对比度/替代文本的真实度量** ✗ | 未做（本卷只判"声明是否存在且达标" ✓） | 真实度量需要渲染器/图像分析 ⇒ 若要做，须新增渲染接缝 |
| **N12** | **可及性检查范围的载体** ✗ | 未定（pack 声明？产出物元数据？） | `vmu.a11y.checkScope` 需要"产出物类型"这一事实来源 |

---

## 19. 待裁决（✗）
1. **告警是否独立成面**（`vibe_vmu_alerts` **未实现**）还是复用 `17` 的通知原语＋本卷的阈值声明？
2. **SLO 的惩罚硬度**：错误预算耗尽时是否**硬性**冻结 H2 变更与包装载（本卷倾向"是"）？
3. **指标口径归属**：指标由**内核**算（可靠但耦合）还是由**外部采集**（灵活但可漂移）？
4. **保留策略默认值**：审计热/温/冷窗口与上限（`vmu.retention.*` 的默认）。
5. **采样边界**：除"变更/拒绝/结算"三类，是否还有**永不采样**的类别？
6. **多实例联合查询**：是否允许跨工作区只读聚合（本卷倾向"允许只读、禁止跨区写"）。
7. **`health` 的工具化**：是否把 §5.1 自检清单直接做成 `vibe_vmu_health`（**未实现**）。

---

## 20. 回合边界的指标交递（**R20 新增／R21 追测**：`threshold` 报告何时能自主开火 —— 交递已通，**装载出货 pack 的路线没通**）

> 为什么在本卷：这是"**指标 → 判据 → 动作**"这条链上**唯一**由**回合边界**推进的一段（`§4` 指标面 ＋ `§15` 可解释性）。它同时收了 R18–R21 的实测：**没有观测 ⇒ 没有键 ⇒ 不开火**（诚实否定，不是缺陷），以及 R21 追到的更深一层：**观测者存在，但它所在的出货 pack 在这些真会话里装载不上**（§20.4）。

### 20.1 机制（三个落点，逐条可核）

1. **`kernel.metricValues({window,agg})`**（`kernel/index.js:715`）：**只读** `vmu.metrics` 面的快照，把指标拍平成 `{名 → 一个数}`。
   - ★ **无观测者**：该指标**根本不进 map** —— 快照里 `count === 0` 的行被**刻意丢掉**（源码注释逐字：*"NO OBSERVATION ⇒ NO KEY … deliberately dropped here"*）⇒ **绝不伪造 `0`**。
   - `agg` 取该指标已观测**值**的聚合：`sum`（**默认**，因为"每事件记 `value:1`"读出来就是"发生了几次"）／`count`／`avg`／`last`／`max`／`min`。
2. **`agent/turn-stopping` 桥**（`vibe-math-vmu.js:656-657`）：回合边界把上一步的结果**交给**报告面 ——
   `kernel.report.tick({ at: Date.now(), event: 'turn-end', metrics: kernel.metricValues() })`。
   ★ 监听器**只在报告面已发布时**才挂（`:642`，零机制红线：无声明 ⇒ 不装监听器）。
   ⇒ **`threshold` 报告从此与 `event`／`period` 一样，可以在回合边界自主开火**（这是 R18 之前做不到的：那时代码传的是 `tick({at, event:'turn-end'})`，**没有 `metrics`**）。
3. **`thresholdMet()` 未放宽**（`kernel/report.js`）：`if (!metrics || typeof metrics !== 'object') return false` **原样保留** —— **"没有数据"绝不允许变成"开火"**（那是**假警报**）。修的是**交递**，不是**判据**。

### 20.2 "自动汇报"必须分两层说（判据纪律）

| 层 | 命题 | 判据 |
|---|---|---|
| **① 触发器** | "**报告会开火并真的送达**" | 回执 `fired[]` 非空 ＋ `delivered:1/failures:0` ＋ **宿主 stdout** 的 sink 行（第三方） |
| **② 自主性** | "**无人要求也会自己开火**" | 剧本**不点 `report/tick`**、会话日志里 **`report/tick` 调用数＝0**，而 sink 行出现 |
| **③ 触发器类型** | **哪些**能自主开火 | `event`（`turn-end`）✅／`period`（回合边界到点）✅／**`threshold` 仅当"边界能拿到非空 `metrics`"** ⛔今天拿不到（§20.3） |

★ **不许把任一层写成另一层**：①成立**不等于**②成立；②成立**也不等于**③里每一类都成立。

### 20.3 ★ 实测：真 DSH 会话里 `event` 自主开火、**两个 `threshold` 全程沉默**（R20 本次运行）

**配方**＝R18 那套（隔离 home `D:\_tmp\r18-home`（**仓库外，实测用**）／workspace `D:\_tmp\r18-ws`／provider 层 `commandcode`／**一份 overlay 只打 overlay 行**）；**overlay 声明三份报告**：`turn-end-duty`（`kind:'event', event:'turn-end'`，**阳性对照**）＋ `artifacts-met`（`kind:'threshold', metric:'artifacts', op:'gte', value:5`，**被测项**）＋ `artifacts-unreached`（同 `op/metric`，`value:50`，**否定对照**）；并声明 `vmu.metrics.indicators: ['artifacts']`（**部署侧那一半已就位**）。**剧本里没有 `report/tick`**。

| 项 | 读数 |
|---|---|
| 会话 | `session-f423c35d-d016-4244-b1c8-de7df83a931b`，**2026-10-15 16:07:33**，39 events，`durationSec:49`，tokens in 46178／out 3581／cacheRead 126464（cap 400k **未触**），`turn/end reason:"completed"`，**退出码 0** |
| 调用 | 4 个 `tool/call`：`vibe_vmu_report{action:"status"}`(seq16)／`vibe_vmu_set`(seq21)／`vibe_vmu_status`(seq26)／`pwsh`(seq31)；★ **`report/tick` 调用数 ＝ 0**（逐条解析会话日志） |
| **宿主 stdout（第三方）** | **恰一条** sink：`[vmu-report-sink] {"name":"turn-end-duty", …, "text":"【所办汇报】turn-end-duty 在 turn-end 自动开火","drives":false}` |
| **否定侧（同一份 stdout）** | `artifacts-met` 的 sink 行 **0 条**；`artifacts-unreached` 的 sink 行 **0 条** |

⇒ **结论（精确）**：**回合边界确实自主推进了报告面**（`turn-end-duty` 在无人调用 `tick` 的情况下开火并送达）；但**两个阈值报告都沉默**，因为**这次会话没有任何 `vmu.metrics` 观测** ⇒ `metricValues()` ＝ `{}` ⇒ `thresholdMet()` 如实返回 `false`（**这正是它该有的行为**，不是缺陷）。

### 20.4 ★★ R21 追测：**计数者已落地，但"装载出货 pack 的路线"不通** —— 收口条件随之改写

**R20 的"计数者缺席"只对了半天，R21 把它追到了更底一层**（时间线：R20 16:07:33 → R21 16:28:11 → R21b 16:31:34 → R21c 16:33:21；★ R21 之前的三条读数在 §20.3 的表里，R21 系列见下）。

**(a) 计数者现在存在，且它的 in-process 断言是绿的**：`vmu-comms2`（task-126）在 **`packs/v5r/middleware/artifact-counter.js`** 落了 M2 模块（policy：`tools/result` → **`tool-results`** 每次完成的工具调用 +1；`math/job-settled`／`lean/job-settled` → **`settled-jobs`** +1），并在 `packs/v5r/prompts/v5r-core.js` 落了清单条目 **`v5r.artifact-counter`**（`kind:'module'` 显式、`capabilities:['trigger-workflow','record']`）。**我自己复跑**：`node tests/vmu-metrics-counter.test.mjs` ⇒ **26 passed / 0 failed，exit=0**；`vmu-middleware-hooks-declared` **8/0**；`audit-pack-face` **5/0**。

**(b) 钩子桥也没问题**：`tools/result` **在** `BRIDGED_HOOKS` 里（实测 `kernel/bus.js` 的导出：`["tools/pre-execute","tools/post-execute","tools/execute","tools/result","prompt/assemble","agent/pre-step","agent/turn-stopping",…]`）⇒ 模块若装载，回合内真能收到该事件。模块**故意不挂 `agent/turn-stopping`**（与报告边界同刻会让单回合剧本被误判）。

**(c) ⇒ 缺的其实是"装载出货 pack 的路线"。三条路线我都实测过，没有一条通**：

| # | 路线 | 本次运行 | 结果 |
|---|---|---|---|
| 1 | **设置键** `vmu.packs.active: ['v5r']`（**R20／R21 用的、也是 `docs/29 §3`／`docs/22 §19` 配方里写的那一条**） | R21 **16:28:11**，`session-da4942a1-…`，exit=0 | **它不装载 pack**：`vibe-math-vmu.js:451` 的装载开关是 **`config.packs`**；设置键只喂 `packsDeclared`（`:516`）与状态/冲突文案（`:200`）。读数：该会话 `declared:3`（三份报告确实到达）而**两个阈值都沉默（sink 0 条）**，且 `settingsMerge.sources` 里**没有** `vmu.packs.active` 之外的 pack 证据 |
| 2 | **配置键** `config.packs: ['v5r']`（打在**预设内那行插件**上，与 `vmu:` 同级） | R21b **16:31:34**，**exit=1** | ★ **会打断预设组装**：`session/create` 被拒 `agent-preset/invalid: vibe-math-vmu (dsh-vibe-math/vibe-math-vmu/vibe-math-vmu.js): cannot get property "systemPrompt" without inject`（＝`tests/vmu-assistant-host-slice.test.mjs` 头部记载过的同一形态） |
| 3 | **运行时工具** `vibe_vmu_pack {action:'apply', id:'v5r'}`（该工具**已发布**：78 工具里有它） | R21c **16:33:21**，`session-d2f0e7d5-…`，exit=0 | **按设计拒绝出货 pack**：回执 **`{"ok":false,"code":"VMU_INVALID_ARGUMENT","message":"plan/apply need an inline manifest (manifest: \"<json>\")","hint":"a pack SHIPPED as ./packs/<id>.js is loaded by the profile row via config.packs; this tool inspects and loads inline manifests"}`** ⇒ 它只吃**内联 manifest** |

**(d) 旁证：在这些真会话里 pack 从未被装载过** —— 每一次的 `vibe_vmu_status` 回执都是 `settingsMerge.packs: []`，而 `settingsMerge.sources` 里**没有一个键带 `source:"pack"`**（只有 `config`／`default`）。这与 (c) 的三条读数互相印证。

**(c′) ★ 还有第四条路线：`config.modules`（本轮**未测**，不许当成可用）**：装载者（`vmu-comms2`，task-126）在读码时指出，`vibe-math-vmu.js:876` 的 `config.modules` 与 `:732` 的 `config.packs` **读的是同一个顶层 `config` 对象** ⇒ 它**很可能同样不可达**（预设会话里那两处都取不到手改的顶层配置）。**本轮我没有测它**（写范围与预算都只够三条路线）⇒ 如实登记为**未测**：既**不写成可用**，也**不写成不可用**；它值得与 (c) 的 ② 一起在第三次真机（`task-129` 落地后）里顺带判定。★ 另一条**口径矛盾**（转办，非本卷）：`docs/10:514` 的"② 运行期装载 ⇒ `vibe_vmu_pack`"**只对内联 manifest 成立**（与 `host.js:704-705` 的守卫不一致）⇒ 需 `docs/10` 属主收口。

**(e) ★ 推论必须分两层（`vmu-verify2` 独立复核，我采纳）** —— 否则会误伤同一批既有证据：
- **(i) 真装配（进程内）＝有效**：探针**直接传** `config.packs`（`entry.apply(ctx, {packs:['v5r']})`）时，pack 是**真装载**的。`vmu-verify2` 用**它自己写的**独立探针（不依赖计数者作者的套件）实测：总线上出现 **3 条 `v5r.artifact-counter::*` 条目**、`tools/result` 真桥接、发 3 次宿主 `tools/result` ⇒ **`metricValues() === {"tool-results":3}`**；`packs: []` 时条目 0、`metricValues() === {}` ⇒ ★ **`vmu-comms2` 的计数器证据、`vmu-core2` 的边界证据都属这一层，成立**。
- **(ii) 真 DSH 会话 ＝未装载**：两条能设 `config.packs` 的路线都堵（(c) 的 ②③）⇒ **只有"把它当已装载"的推断作废**。
- ⇒ **（d）那段不要读成"凡 pack 生效一律作废"**：`declared/armed`／`published faces` 这些读数来自 **`config`／`default` 层、与 pack 无关** ⇒ **它们不受影响**（(e) 这一层是 `vmu-verify2` 提出、我采纳并记录）。

**⇒ 收口条件（改写版，唯一）**：**先有一条"在预设会话里装载出货 pack"的可用路线** —— 二选一：① 修路线 2（`config.packs` 在预设作用域下装配时的 `systemPrompt`/inject 失败）；② 让路线 3 接受 `id`（或**证实**"profile 行"这一装载点真的可用，`docs/10:436` 说的就是它）。**路线通了之后**，才轮到我 R21 想证的那件事：`vmu.metrics.indicators` 声明 `['tool-results','settled-jobs']` ＋ `threshold metric:'tool-results' op:'gte' value:1` ⇒ 回合边界自主开火、`value:1000` 保持沉默。**本轮这三条路线都不通，且 `packs/**` 不在本任务写范围** ⇒ 我**只记录、不改模块、不越线**，**不写成"阈值自主开火已证"** ✗✓。

★ **对既有文档的影响（具名转办，不在本轮写范围）**：`docs/29 §3`（`:261`／`:282`）与 `docs/22 §19`（`:1145`）的 overlay 配方里写着 `packs: { active: ['v5r'] }`，而**装载**开关是 `config.packs`（`docs/10-packs.md:436` 写的是对的）⇒ 这两处的配方**关于"装载 pack"这一点是误导的**（它们对"报告声明＋transport"仍然正确）。**我未改那两卷**（本轮写范围只有 `docs/21`／`docs/05`），已具名报 Lead，建议由该两卷属主按上面 (c) 的三条读数改写。

### 20.5 可复制配方（**R21 校正版：指标名换成出货计数者真用的那两个；并先满足 §20.4 的装载条件**）

> ★ **先决条件**：必须先有一条**能装载出货 pack**的路线（§20.4(c) 三条里目前没有一条通）。**下面 ① 的声明与 ② 的计数者本体都已就位**（`packs/v5r/middleware/artifact-counter.js`，in-process 26/0），缺的只是"让它进到真会话里"。

```yaml
# overlay 行（只打 overlay 行；preset 行永远不要打）
vmu:
  metrics: { indicators: ['tool-results', 'settled-jobs'] }   # ① 指标白名单（空＝零机制：可记但不聚合）
  report:
    enabled: true
    reports:
      - name: 'tool-results-met'
        trigger: { kind: 'threshold', metric: 'tool-results', op: 'gte', value: 1 }   # 阳性：任何发生过工具调用的回合都必然达到
        channel: 'log'
        template: '【阈值·已达】tool-results={{ metric:tool-results }} ≥ 1'
      - name: 'tool-results-unreached'
        trigger: { kind: 'threshold', metric: 'tool-results', op: 'gte', value: 1000 } # 阴性：高位，正常回合必然沉默
        channel: 'log'
        template: '【阈值·未达线】tool-results={{ metric:tool-results }} ≥ 1000'
```
```js
// ② 计数者（M2 模块，经 pack 的 module:/file: 交给 loader 才会拿到 api）—— 出货版已落，形状如下
export const meta = { apiVersion: 1, id: 'my-counter' }
export const capabilities = ['trigger-workflow', 'record']   // 服务目录由 trigger-workflow 解锁
export const hooks = { 'tools/result': async (flat) => {     // ★ 用回合内钩子，别用 agent/turn-stopping
  flat.api.services.get('vmu.metrics').observe({ name: 'tool-results', value: 1, by: 'my-counter', kind: 'read' })
} }
```

★ **判据（三件一起看才算成立）**：① 宿主 stdout 出现 `tool-results-met` 的 sink 行；② 会话日志里 **`report/tick` 调用数 ＝ 0**（否则就成了"被人要求才开火"）；③ 同一份 stdout 里 **`tool-results-unreached` 0 条**（否定侧也实测）。

