# 05 · 中间件与钩子（四形态全生命周期 · 钩子全景 · 插件与协议）

> 状态：**草案 v0.2**（据 `kernel/bus.js`与各原语模块**逐条核对后重写**；v0.1 中"自由裁决词表/作用域维度/失败策略"等处已按实现更正，见 §14 修正清单）
> 上位：`01-philosophy.md`（R1 内核零策略 / R5 四形态 / R6 钩子契约化 / R7 稳定接口 / R11 可观测）、`02-architecture.md`（L3 总线层）、`04-settings.md`（键解析）、`06-prompt-pipeline.md`（`prompt/*` 的具体化）、`10-packs.md`（M4 打包）、`11-gates-and-development.md`（把本章红线变门）
> **读者**：**使用者**（写机制：选钩子、配作用域、定失败策略）与**实现者**（加钩子、加能力、加原语）
> **术语**：**原语（primitive）**＝内核最小能力（成员/会议/投票/记录/任务/结算/控制）；**挂点（hook）**＝原语执行路径上允许外部介入的具名位置；**条目（entry）**＝一个中间件声明；**决策（decision）**＝处理器返回的能力对象；**能力（capability）**＝条目必须**先声明**才能使用的一种动作。

---

## 0. 一页速览

**内核给"能在哪介入"（53 个冻结钩子，见 §5.3 与 §5 末生成索引）＋"能做什么"（12 项能力）；中间件声明"我在哪个钩子、对谁、按什么失败策略、用哪些能力、做什么"。**

| 概念 | 实现事实（`kernel/bus.js`） |
|---|---|
| 条目形态 | `kind ∈ {rules, module}`（＝**M1/M2 是总线条目**）；`script`／`plugin` **不是总线 kind** ⇒ `bus.add` 具名拒 `VMU_MIDDLEWARE_KIND_UNSUPPORTED` 并在 hint 里点名真实载体（**D-03：没有纸面形态**） |
| 必需字段 | `id`（非空字符串）、`kind`、`on`（≥1 个钩子） |
| 非规则条目 | **必须给 `handler`（函数）**；`file` **不是**处理器的替代品（总线不装载文件——模块文件由 `kernel/loader.js` 装载并带上 handler 后才进总线） |
| 默认顺序 | `order` 缺省＝**1000**；排序＝`order` 升序，再按 `id` 字典序（**确定性**） |
| 默认失败策略 | 取自 `DEFAULT_FAILURE[on[0]]`（§5 表），缺省兜底 `closed` |
| 能力 | 12 项（§3.2）；**用了没声明的能力＝配置缺陷，恒按 closed 处理并计入熔断** |
| 超时 | `vmu.middleware.hookTimeoutMs`（默认 **2000 ms**）⇒ 超时算失败 |
| 熔断 | `vmu.middleware.breakerThreshold`（默认 **3** 次连续失败）⇒ 条目被**停用**（可 `enable()` 复位） |
| 作用域 | 总线三维：`member` / `role` / `phase`（提示词管线另有 `task`，见 §6.4） |
| 干跑 | `setDryRun(true)` ⇒ 决策照常记录但被标记 `dryRun:true` |
| 追踪 | 每钩子一次 `traceId`；`trace(traceId)` 取时间线（**环形保留 64 条**） |
| 观测 | `status()`：条目（含 `hits` / `consecutiveFailures` / `disabledReason`）、`hooks`、`dryRun`、两个预算值 |
| 审计 | 每次注册/跳过/决策/失败/熔断/启用禁用/干跑开关都产生**审计行**（`onAudit`） |
| 不可介入面 | 票权/门槛/结算口径/审计开关/提权 —— 见 §7 |

---

## 1. 心智模型

```
原语执行 ──► bus.emit(hook, payload, {member, role, phase, traceId})
                 │
                 ├─ 取「该钩子 + 已启用 + 未被熔断」的条目
                 ├─ 按 order → id 确定性排序（可复现）
                 ├─ 作用域过滤（member/role/phase，支持 '*' 通配）
                 ├─ 逐条调用 handler（带超时）──► 返回 undefined/null ＝ 不改，继续
                 │                               返回决策对象 ＝ 能力校验后记录
                 ├─ deny/cancel ＝ 终止并具名拒绝（返回 refused{code,message,hint}）
                 └─ 失败 ⇒ 按该条目的失败策略（open 放行 / closed 拒绝 / abort 上报中止）
```

**三条不变量**（v0.1 起，实现已落实）
1. **内核零策略**：业务规则不得硬编码进内核，只能由中间件表达。
2. **契约化**：钩子名在 `VU_HOOKS` 冻结集内；能力在 `CAPABILITIES` 冻结集内；**文档缺一条即门禁红**。
3. **不炸框架**：中间件异常/超时/越权**不得**让框架崩溃或静默改语义 ⇒ 失败三态 + 审计 + 熔断。

---

## 2. 四形态总表（**总线只跑 M1/M2**；M3/M4 各有真实载体，**不是总线 `kind`**）

> ★★★ **轮 1 更正（D-03）**：本节原先把 `kind ∈ {rules, module, script, plugin}` 写成"＝M1/M2/M3/M4"，而 `bus.add` 只认 `rules`／`module`——`script`／`plugin` 曾经**校验通过、`emit` 时被静默跳过**（`middleware/skipped`）。现在二者在 `add` 处**具名拒** `VMU_MIDDLEWARE_KIND_UNSUPPORTED`，hint 点名真实载体。**M4 不是 pack**：整合包是 **L4**（`kernel/pack.js`，自成一档），M4 是**消费 vmu 公开服务的 DSH 插件**。

| 形态 | 实现落点 | 载体 | 必需 | 表达力 | 隔离 | 热改 | 典型用途 |
|---|---|---|---|---|---|---|---|
| **M1 规则（声明式）** | 总线条目 `kind:'rules'` | 设置/声明里的条目（**无需 handler**） | `id`,`kind`,`on` | 低（选钩子/顺序/作用域/失败策略/能力声明） | 最高 | ✓ | 团队约定、合规开关、只做"启用/禁用/排序"的机制 |
| **M2 代码模块（函数式）** | 总线条目 `kind:'module'` | 同进程模块，**必须** `handler` 函数（模块文件经 `kernel/loader.js` 装载后带上 handler） | ＋`handler` | 高（任意逻辑） | 低 | 需重载 | 复杂决策合并、外部系统对接 |
| **M3 脚本／工作流（子进程桥）** | **不在总线上** | `kernel/script-bridge.js` ＋ `vibe_vmu_script` 工具（`config.scripts` 声明） | `file`／`inline`（进程协议） | 中（受协议限制） | 高（进程＋超时） | ✓ | 任意语言写策略、复用既有工具链 |
| **M4 外部插件／mod** | **不在总线上** | 消费 vmu **已发布服务**的 DSH 插件（宿主插件声明） | 宿主插件清单 | 组合级（服务/工具/提示词段） | 取决于宿主 | △ | 新服务、新工具、新提示词段 |
| **L4 整合包（组合，自成一档）** | `kernel/pack.js` | `packs/<id>/`（settings/ ＋ middleware/ ＋ prompts/ ＋ index.js） | 包清单 | 组合级（依赖/覆盖/别名/槽位/轨道） | 取决于内含 | △ | 分发整套制度（教学/团队/合规模板） |

> **统一形状**：**总线上的两种形态**最终都产出同一形状的条目（`id/kind/on/order/failure/capabilities/scope/source/handler`）⇒ §3–§5 的语义对它们**完全通用**；差别只在"处理器从哪来"。M3/M4/L4 各有自己的契约（`script-bridge` / 宿主插件 / `pack.js`），**不套用总线条目语义**。

---

## 3. 条目契约

### 3.1 字段（**逐字来自 `validateEntry` 与 `add`**）
| 字段 | 类型 | 必需 | 默认 | 说明 |
|---|---|---|---|---|
| `id` | string（非空） | ✓ | —— | **全局唯一**；重名 ⇒ `VMU_MIDDLEWARE_FAILED`（"冲突从不静默解决"） |
| `kind` | `rules`｜`module` | ✓ | —— | **总线只跑这两种**；`script`／`plugin` ⇒ 具名拒 `VMU_MIDDLEWARE_KIND_UNSUPPORTED`（真实载体见 §2）；其它值 ⇒ 校验失败 |
| `on` | string ｜ string[] | ✓ | —— | ≥1 个钩子名；**不得为空** |
| `handler` | function | **非 `rules` 必给** | —— | 函数式挂点；总线**不装载文件**（模块文件先经 `kernel/loader.js`，由它带上 handler） |
| `file` | string | ✗ | —— | **只是装载线索，不是总线处理器**：给总线一个只有 `file` 的条目会被拒（`VMU_MIDDLEWARE_FAILED`） |
| `order` | integer | ✗ | **1000** | 排序键（升序），同级按 `id` |
| `failure` | `open`｜`closed`｜`abort` | ✗ | `DEFAULT_FAILURE[on[0]]`，兜底 `closed` | 失败策略（§4.3） |
| `capabilities` | string[] | ✗ | `[]` | **必须声明才能用**（§3.2）；未知能力 ⇒ 校验失败 |
| `scope` | `{member?,role?,phase?}` | ✗ | `null`（＝全部匹配） | 支持单值/数组/`'*'` |
| `enabled` | boolean | ✗ | `true` | `false`＝登记但不调用 |
| `source` | string | ✗ | `'session'` | 追溯来源（如包 id/文件名） |

### 3.2 能力词表（**12 项，冻结**）与决策键映射
| 能力 | 对应决策键 | 含义 |
|---|---|---|
| `read-state` | ——（无键，声明即允许读） | 允许读内核状态 |
| `read-args` | —— | 允许读调用参数 |
| `deny` | `deny` | **终止**并具名拒绝 |
| `cancel` | `cancel` | **终止**（默认码 `VMU_MIDDLEWARE_REJECTED`） |
| `rewrite-args` | `rewriteArgs` | 改写入参（窄改） |
| `rewrite-result` | `rewriteResult` | 改写返回结果 |
| `append-prompt` | `appendPrompt` | 向提示词**追加**段/文本（`{section,text}` 或 `{section,file}`） |
| `record` | `record` | 写一条记录（经原语） |
| `notify` | `notify` | 通知（成员/群） |
| `set-setting` | `setSetting` | 设置运行时设置项 |
| `trigger-workflow` | `triggerWorkflow` | 触发既定工作流 |
| `annotate` | `annotate` | 只加注解（不改语义） |

**能力纪律（实现行为）**：条目返回的决策对象里**出现的每个键**都会检查其能力是否**已声明**；未声明 ⇒ `VMU_MIDDLEWARE_FAILED`、**恒按 closed 处理**（不服从 `failure` 设置）、**计入熔断**。⇒ "越权"是**配置缺陷**，不是策略问题。

### 3.3 决策语义（**没有 allow/replace/short-circuit 这种词**）
- **返回 `undefined` / `null`** ⇒ **不改，继续**（"我只是看看"的正确写法；也是宿主 waterfall "必须调 next" 契约在 vmu 侧的等价物）。
- **返回决策对象** ⇒ 逐键按 §3.2 校验；**非终止键**（`rewriteArgs`/`rewriteResult`/`appendPrompt`/`record`/`notify`/`setSetting`/`triggerWorkflow`/`annotate`）被收集进 `decisions[]`，**由调用方（宿主适配器）取用**。
- **`deny` / `cancel` 是终止的**：立即返回 `{ok:false, decision, refused:{code,message,hint}, entry, decisions, traceId}`；**后续条目不再执行**。
- **`emit()` 返回完整决策集**（`{ok, decisions, traceId, decision}`）——**不是只返回拒绝**：宿主桥必须能看到 `appendPrompt`/`rewriteArgs`/`replaceResult`/`record` 等，否则这些能力会"静默不可用"（已修历史缺口，写在这里防回归）。
- **干跑**：`dryRun` 时决策被复制并标记 `dryRun:true`，审计照记 ⇒ 用户能看到"如果真跑会怎样"。

---

## 4. 装载与生命周期

### 4.1 阶段（每阶段都有可观测与可拒绝点）
| 阶段 | 做什么 | 拒绝/码 | 观测 |
|---|---|---|---|
| **1 声明** | 读条目声明 | 结构错 ⇒ `VMU_MIDDLEWARE_FAILED`（附 `problems` 列表与 docs 指针） | `middleware/registered` 审计行 |
| **2 校验** | `validateEntry`：id/kind/on/handler|file/failure/order/capabilities | 同上；**未知能力**即拒 | 审计行含 `on`/`order`/`failure` |
| **3 归一化** | 补默认值（order 1000、failure、capabilities []、enabled、source） | 重名 id ⇒ 拒绝（**绝不静默覆盖**） | 注册表 `entries()` 可见 |
| **4 装载** | 进 `registry`；M2 由 `on(entry, handler)` 挂处理器；M3 由桥接装载 | 桥失败 ⇒ 拒绝 | `status().entries[]` |
| **5 启用/禁用** | `disable(id, reason)` / `enable(id)` | 未知 id ⇒ `VMU_INVALID_ARGUMENT` | 审计 `middleware/disabled|enabled`；`disabledReason` 可读 |
| **6 熔断/复位** | 连续失败达阈值 ⇒ 自动停用；`enable()` 清失败计数并复位 | —— | `middleware/breaker-tripped`；`consecutiveFailures` |
| **7 干跑** | `setDryRun(true/false)` | —— | 审计 `middleware/dry-run` |
| **8 卸载（计划 ✗）** | 运行期移除条目 | 计划中（今天只能 `disable`） | —— |

**注意（现状边界）**：实现里**没有 `remove()`**（只有 `disable`）⇒ "卸载/依赖拒绝/回滚"属于**计划能力 ✗**（见 §13-4）。

### 4.2 排序与作用域（实现语义）
- **排序**：`order` 升序 → `id` 字典序 ⇒ **确定性**（同一配置两次运行行为一致，这是回放/回归的前提）。
- **作用域过滤**：`scopeMatches(scope, {member, role, phase})`；`undefined` 或 `'*'` ＝该维度全匹配；数组＝包含即匹配。
- **无匹配条目 ⇒ 钩子"空跑"**（`emit` 返回 `ok:true, decisions:[]`）——**不是错误**。

### 4.3 失败策略（三态）与"只能收紧"
| 策略 | 失败时行为 | 审计 | 默认适用 |
|---|---|---|---|
| `open` | **放行**：继续后续条目/原语（不阻断业务） | `middleware/failure-policy` | 观测类（`record/appended`、`prompt/section-assembled`、`control/*`） |
| `closed` | **拒绝**：返回 `VMU_MIDDLEWARE_FAILED` | 同上 | 把守类（多数原语钩子） |
| `abort` | **上报中止**：`aborted:true` ＋码，交调用方结束回合/阶段 | 同上 | `budget/exceeded`（唯一默认 abort） |

**用户可调**：`failure` 逐条目覆盖默认；**把 `closed` 放宽为 `open` 必须显式书写**（且照常有审计）⇒ 不存在"悄悄变成放行"的路径。

### 4.4 超时与熔断（实现细节）
- **超时**：`withTimeout` 用 `vmu.middleware.hookTimeoutMs`（默认 2000 ms；`<=0` 表示不超时）；超时抛 `VMU_MIDDLEWARE_FAILED` ⇒ 走该条目的失败策略。
- **熔断**：`recordFailure` 累加连续失败；达 `vmu.middleware.breakerThreshold`（默认 3）⇒ `disabled.set(id,'breaker: N consecutive failures')`，此后 `sortedFor` 不再取它；`enable(id)` 清空失败计数并解除停用。
- **熔断是"停用条目"而不是"跳过钩子"** ⇒ 钩子本身语义不受影响（防"一个坏条目把机制整体关掉"）。

### 4.5 干跑、追踪与观测
- **干跑**：`setDryRun(true)` ⇒ 决策被标记；**由调用方决定是否施加**（宿主桥在干跑下应只旁路记录）。
- **追踪**：每次 `emit` 生成 `traceId`（形如 `t<seq>-<hook>`）；`remember()` 把该次调用每步（`decided`/`failed`/`capability-violation`）挂到该 id；**环形保留 64 条**（`trace(traceId)` 读取）。
- **观测**：`status()` 给出条目清单（含 `hits`、`consecutiveFailures`、`disabledReason`）＋出现过的 `hooks` 集合＋两个预算值 ⇒ **"我到底挂了什么"一眼可见**（零机制时也可读）。

---

## 5. 钩子全景表（**轮 1 的 22 个契约名**；完整 53 个以 §5.3 与 §5 末生成索引为准）

> **生产者列取自实仓 grep**（`kernel/*.js`、`kernel/prompt/*.js`、`host*.js`、`vibe-math-vmu.js`、`packs/*.js`）：✓＝有 `emit(` 生产者；✗＝**今天无人 emit**（只出现在 `bus.js` 的冻结表/默认表）。
> **默认失败策略**＝`DEFAULT_FAILURE` 逐字。

| # | 钩子 | 默认失败 | 生产者 | 建议入参（payload 关键面） | 允许的决策（能力） | 可拒绝 | 可改写 | 归属 |
|---|---|---|---|---|---|---|---|---|
| 1 | `member/wake-before` | `closed` | **✓** `members.js` | 目标成员、唤醒类型、上下文摘要 | `deny`／`rewriteArgs`／`appendPrompt`／`annotate` | ✓ | ✓ | 用户可定义（"未拒绝才唤醒"） |
| 2 | `member/wake-after` | `closed` | **✓** `members.js` | 成员、唤醒结果、耗时 | `record`／`notify`／`annotate` | ✗ | ✗ | 用户可定义（观测） |
| 3 | `turn/reply-parsed` | `closed` | **✓** `kernel/turn/index.js`（轮 496 已接线） | 成员、回合解析结果 | `deny`／`rewriteResult`／`annotate` | ✓ | ✓ | 用户可定义（**不得**改票权语义） |
| 4 | `meeting/round-start` | `closed` | **✓** `meeting.js` | 会议 id、轮次、参与集、议程 | `deny`／`rewriteArgs`／`notify` | ✓ | ✓ | 用户可定义（可否开会） |
| 5 | `meeting/round-end` | `closed` | **✓** `meeting.js` | 会议 id、轮次、产出摘要 | `record`／`notify`／`annotate` | ✗ | ✗ | 用户可定义 |
| 6 | `ballot/cast` | `closed` | **✓** `ballot.js` | 投票人、选项、时间 | `deny`（**唯一**） | ✓ | ✗ | **内核强制**（票面不可改写） |
| 7 | `ballot/tally` | `closed` | **✓** `ballot.js` ＋ `packs/v3-core/index.js` | 票集、门槛、汇总 | `deny`／`annotate`（**不得** rewrite） | ✓ | ✗ | **内核强制**（计票不可改写） |
| 8 | `record/append-before` | `closed` | **✓** `kernel/library.js`（轮 496 已接线） | 记录种类、内容、目标 | `deny`／`rewriteArgs`／`record` | ✓ | ✓ | 用户可定义（**不得**删既有记录） |
| 9 | `record/appended` | **`open`** | **✓** `compliance.js`／`handover.js`／`minutes.js`／`tenure.js` | 记录摘要、哈希 | `record`／`annotate`／`notify` | ✗ | ✗ | 用户可定义（观测；失败放行） |
| 10 | `task/assign` | `closed` | **✓** `members.js`／`tasks.js` | 任务、被指派者、验收 | `deny`／`rewriteArgs`／`notify` | ✓ | ✓ | 用户可定义 |
| 11 | `task/transition` | `closed` | **✓** `tasks.js` | 任务、原/目标状态 | `deny`／`record` | ✓ | ✗ | 用户可定义（状态机仍内核校验） |
| 12 | `prompt/section-assembled` | **`open`** | **✓ 已有生产者**（装配路径 emit ✓；曾漂移为 `prompt/assemble` ✗ ⇒ 本会话已修 ✓ 见 §5.2） | 段名、段文本、来源、顺序、剩余预算 | `deny`／`appendPrompt`／`rewriteResult`／`annotate` | ✓ | ✓ | 用户可定义（**见 06**） |
| 13 | `budget/exceeded` | **`abort`** | **✓ 已有生产者**（`kernel/fairness.js` 在守恒分配失败时 emit ✓；独立复核者第 6 轮指出本表曾写"无生产者"✗ ⇒ 已更正 ✓） | 超预算对象、已用/上限、候选 | `deny`／`annotate` | ✓ | ✓ | 用户可定义（截断协商） |
| 14 | `pack/loading` | `closed` | **✓** `kernel/pack.js`（轮 496 已接线：应用前、可否决） | 包 id、声明、计划 | `deny`／`rewriteArgs` | ✓ | ✓ | 用户可定义 |
| 15 | `pack/loaded` | `closed` | **✓** `kernel/pack.js`（轮 496 已接线：全部就位后） | 包 id、条目数、服务、耗时 | `record`／`notify` | ✗ | ✗ | 用户可定义 |
| 16 | `settle/before` | `closed` | **✓** `tasks.js` | 结算对象、口径、参与集 | `deny`（**唯一**） | ✓ | ✗ | **内核强制**（口径不可改写） |
| 17 | `settle/after` | `closed` | **✓** `tasks.js` | 结算结果、留痕引用 | `record`／`annotate`／`notify` | ✗ | ✗ | 用户可定义（观测） |
| 18 | `control/paused` | **`open`** | **✓** `kernel/index.js` | 暂停原因、作用域、发起者 | `notify`／`annotate` | ✗ | ✗ | 用户可定义（提示面） |
| 19 | `control/resumed` | **`open`** | **✓** `kernel/index.js` | 恢复原因、跳过项 | `notify`／`annotate` | ✗ | ✗ | 用户可定义 |
| 20 | `control/heartbeat` | **`open`** | **✓** `kernel/index.js` | 心跳序号、健康摘要、降级列表 | `record`／`notify`／`annotate` | ✗ | ✗ | 用户可定义 |

### 5.1 表读法（三条硬结论）
1. **可拒绝 ≠ 可改写**：`ballot/cast`、`ballot/tally`、`settle/before` 允许 `deny` 但**不得改写** —— "用户能守门，改不了公理"的落点。
2. **`open` 默认＝观测类**（`record/appended`、`prompt/section-assembled`、`control/paused|resumed|heartbeat`）⇒ 观测者崩溃**不阻断业务**；**`abort` 默认只有一个**（`budget/exceeded`）⇒ 预算失守必须上报。
3. **没有任何钩子允许改票权/门槛/结算口径**：即便声明了 `rewriteResult`，在 §7 红线下也不被允许（能力声明 + 内核不提供对应写路径，双重约束）。

### 5.2 **已核实的真实不一致：一半已闭环、一半仍开**（★ 轮 495 重写 ✓）✗→✓

> ★★★ **本节曾把【已经修好的**]那一半也列在"必须修"里 ✗ —— ★ **一个标题写着"必须修"的小节，如果一半已经修好，是最糟的一种：★ 读者会去修【已经修好的东西**]✓。

- ★★ **① `prompt/assemble` 的那处【已闭环**]✓（★ 用的正是本节自己建议的方案 ② ✓）：★ **`kernel/prompt/index.js:400` 现在 emit 的是 `prompt/section-assembled`** ✓，★ **与冻结集里的名字一致** ✓ ⇒ ★ **中间件【可以**]逐段介入提示词装配** ✓。★★ **本节原先引用的 `host-hooks.js` 【不存在**]✗（★ 实测 ✓），★ 实际相关的文件是 `kernel/loader.js` ✓。
- ★★★ **② `pack/loading`／`pack/loaded` 【已闭环**]✓（★ **轮 1 更正**）：★ 本行原先写"仍然无人 emit、纸面能力" ✗，而 **`kernel/pack.js:303`（应用前、可否决）与 `kernel/pack.js:374`（全部就位后）已经 emit** ✓ —— ★ **同卷生成索引（§5 末）早已写明 `pack.js` 是生产者** ✓ ⇒ ★ **本条与生成索引的自相矛盾就此消除** ✓；★ 断言由 `tests/audit-hook-coverage.test.mjs`（冻结名必有 emit 点）与 `tests/audit-vmu-docs.test.mjs`（`KNOWN_UNEMITTED` 已清空）双向守着 ✓。
- ★ **③ `truncation[]` 只进 `status()`、不触发 `budget/exceeded`** ✓：★ **未复核，保持"待核"** ✓。


> ★★★ **轮 495 实测【把缺口数清楚了**]✓（★ 一次机械扫描：冻结集的每个名字去找 emit 点 ✓）：
> - ★★ **纸面钩子【四个**]✗，不是两个：★ **`pack/loading`** ✓、**`pack/loaded`** ✓、**`turn/reply-parsed`** ✓、**`record/append-before`** ✓ —— ★ **前两个本卷已知** ✓，**后两个是这次扫描【新发现的**]✗**；
> - ★★★ **而反向的偏差【更大**]✗：★ **框架 emit 了一族【不在冻结集里**]的钩子名** ✓ —— **`audit/rotate`** ✓、**`auditchain/appended`** ✓、**`auditchain/checkpoint-failed`** ✓、**`auditchain/partial-verify`** ✓ **等** ⇒ ★★ **这与原案 `prompt/assemble` 是【同一个缺陷**]，**只是规模从一处变成一族** ✓；
> - ★★★ **为什么这比"少了几个名字"严重**：★ **中间件只能声明【冻结集里**]的钩子** ✓ ⇒ **一个没人冻结的 emit 点，等于一个永远无法被介入的能力** ✗ —— ★ **而它【看起来**]是正常的：★ 代码在跑、事件在发、只是没人能挂上去** ✓。
> ★★ **处置（下一轮）**：★ **① 把那一族 emit 名登记进 `VU_HOOKS`（并给默认失败策略 ✓）**，**或** **② 把 emit 改为冻结名** ✓ —— ★ **与本节 ① 的处置同一套二选一** ✓；★ **纸面钩子则补 emit 点** ✓（★ `kernel/pack.js` 持有 `kernel.bus` ✓）。★ **守卫 `tests/audit-hook-coverage.test.mjs` 已写好并【当场证明它会失败**]✓，**但【未出荷**]✗ —— ★★ **"一个在当前树上失败的守卫不能出荷；★ 而一个不会失败的守卫什么都证明不了"** ✓ ⇒ **两者都记在这里，等缺口补完再上线** ✓。

> ★★★ **轮 496 复核与修复（★ 一次机械扫描 → 两处活 bug）** ✓：
> - ★★ **扫描方式**：★ **冻结集每个名字找 emit 点** ＋ ★ **每个 emit 名对冻结集与命名空间规则** ✓；
> - ★★★ **发现的两个【活 bug**]✗（★ 同一类）：★ **`kernel/budget.js` emit `budget/warn`** ✓、★ **`kernel/members.js` emit `member/self-report`** ✓ —— ★ **两者都在 `VU_NAMESPACE` 之内、却都【未冻结**]✗ ⇒ ★ **总线按规则拒绝** ✓ ⇒ ★★ **而调用点【不 await 也不 try**]✗ ⇒ **每次预算告警、每次成员自报都会抛错** ✓；★ **现已把两者冻结（策略 `open` ✓ —— ★ 告警与自报都是【观测**]，★ 与 `control/*` 同理：★ 一个坏监听者不该把告警变成失败 ✓）** ✓；
> - ★★ **并把四个纸面钩子补上 emit** ✓：**`pack/loading`（应用前、可否决 ✓）**、**`pack/loaded`（应用后 ✓）**、**`turn/reply-parsed`（解析后、分派前 ✓）**、**`record/append-before`（任何校验与落盘之前 ✓ —— ★ `createLibrary` 因此新增一个【可选**]`bus` ✓，既有调用方不受影响 ✓）**；
> - ★★★ **守卫 `tests/audit-hook-coverage.test.mjs` 现已出荷** ✓（★ 四断言，**两个方向** ✓）：★ **① 每个冻结钩子都必须有 emit 点** ✓；★ **② 每个【VU 命名空间内**]的 emit 必须已冻结** ✓（★ 这一条正是两次活 bug 的成因 ✓）；★ **它当场抓出第二个 bug**，★ 而这正是"守卫第一次运行就为自己付账"的又一例 ✓。
> ★★ **并由 `tests/audit-hook-coverage.test.mjs` 守着**：★ **冻结集里的每个钩子【要么在框架里有 emit 点、要么在本节里被明确标为纸面能力**]✓ ⇒ **一个名字不可能再静静地留在冻结集里、暗示一个没人提供的能力** ✓。

### 5.3 轮 2 新原语的钩子（31 个，**全部已有真实 emit 点**）✓

> 本节的 22 个是**轮 1 的契约集**（§5 表逐条列出）；轮 2 的四个新实现面各自新增了钩子，**已全部登记进 `HOOK_REGISTRY`**（单一真源，§6.1.1），并由 `tests/audit-hook-coverage.test.mjs` 双向守着（每个登记名都有 `bus.emit('<名>'` 落点；每个 vmu 命名空间内的 emit 都已登记）。**权威清单是 §5 末的生成索引**（53 个），下表给出语义面。

| 组（命名空间） | 钩子 | 默认失败 | 可否阻断 | 语义 |
|---|---|---|---|---|
| 恢复（`resume/`，`kernel/resume.js`） | `recovered`／`degraded`／`projection-error` | `open` | ✗ | 恢复完成／带未水合投影降级／单面水合失败 |
| 标识（`ids/`，`kernel/ids.js`） | `minted`／`hydrated`／`persist-failed` | `open` | ✗ | 铸号／从 fold 水合计数／持久化失败 |
| 人类在环（`human/`，`kernel/human.js`） | `vetoed`／`veto-lifted`／`approval-asked`／`approval-decided` | `open` | ✗ | 否决已记录／已解除／请求审批／审批已决 |
| 同上 | **`gate-pending`** | **`closed`** | **✓** | 动作被审批闸挂起——**闸门语义必须有人接**：监听者坏掉不得等于放行 |
| 控制（`control/`，`kernel/control.js`） | `scope-paused`／`scope-resumed`／`param-set`／`param-refused` | `open` | ✗ | 范围暂停/恢复、参数已改/被拒（观测，与既有 `control/paused|resumed|heartbeat` 同策略） |
| 群聊（`chat/`，`kernel/chat.js`） | **`send-before`** | **`closed`** | **✓** | 配额/禁言/表决冻结策略的执行点 |
| 同上 | `sent`／`refused` | `open` | ✗ | 已接受／被策略拒（观测） |
| 信箱（`mailbox/`，`kernel/mailbox.js`） | **`deliver-before`** | **`closed`** | **✓** | 一批投递 flush 之前的策略点 |
| 同上 | `delivered` | `open` | ✗ | 一批已投递并 ack |
| 面板（`panel/`，`kernel/panel.js`） | **`write-before`** | **`closed`** | **✓** | 自述面板写入前的策略点（他人改 `overall` 的处置在此可见） |
| 同上 | `written`／`viewed` | `open` | ✗ | 写入落地／被查看（查看留痕） |
| 数学作业（`math/`，`kernel/mathjobs.js`、`kernel/mathadapters.js`） | `job-submitted`／`job-settled`／`job-failed`／`job-timeout`／`job-cancelled`／`job-recovered`／`adapters-probed`／`adapters-ran` | `open` | ✗ | 作业生命周期与适配面探测/运行（观测；失败不因监听者坏掉而升级） |

★★★ **命名空间规则同步扩展**（`bus.emit` 的 `VU_NAMESPACE`）：`resume|ids|human|chat|mailbox|panel|math` 已加入 ⇒ 这七个命名空间里**未登记的名字会被具名拒**，不再"看起来正常、其实没人能挂"（与轮 496 修 `budget/warn`／`member/self-report` 同一条规则）。
★★ **emit 形态是硬要求**：`bus.emit('<名>', payload, {member,role,phase})`。`emit({type:'x'})` 这种**单对象调用**会被总线以 `VMU_INVALID_ARGUMENT` 拒绝（`kernel/lifecycle.js:39` 曾是活样例，其两条广播因此**从未到达总线**）；且门禁只认字面量 `bus.emit('<名>'` ⇒ 对象形态**不算生产者**。

### 5.4 三类"名字"的边界：**登记钩子 / 声明主题 / 仅日志**（轮 4 定稿：逐个分类 + 门禁）

> 一个名字出现在代码里，**不等于**中间件能挂上去。轮 4 把全仓 **86** 个 emit 名**逐个分类**（Lead 裁决①），**不允许"既没登记也没分类"**——那正是静默。

| 类别 | 真源 | 能否 `bus.emit` | M1 规则可挂 | **M2 模块可挂** | 拼错会怎样 |
|---|---|---|---|---|---|
| **登记钩子**（**80** vmu ＋ 19 host） | `HOOK_REGISTRY`（§6.1.1） | ✓ | ✓ | ✓（`loader.js` 按登记表校验） | 在 vmu 命名空间内 ⇒ **具名拒** |
| **声明主题** | `bus.declareTopic('<domain>/<name>')` | ✓（`customTopics` 放行） | ✓ | ✓（**轮 4 统一**：`isRegisteredHook()` 现在同时认 `HOOK_REGISTRY` 与 bus 已声明主题） | 未声明且不在登记表：vmu 命名空间内**具名拒**；**外来命名空间直通**（`workflow/*` 见下） |
| **仅日志**（`LOG_ONLY_EMITS`，**6** 个） | `kernel/bus.js` 的 `LOG_ONLY_EMITS`（名字→理由） | ✓（仍是总线调用，但**没有登记 ⇒ 不是钩子**） | ✗ | ✗ | 命名空间不在 `VU_NAMESPACE` ⇒ 直通；**它们是被显式分类为"账目行"的**，不是遗漏 |
| `workflow/*`（特例） | `HOOK_PREFIXES` 前缀规则 ＋ 三个具名钩子已登记 | 未登记的 `workflow/<新名>` 现在会**具名拒**（`workflow` 已进 `VU_NAMESPACE`） | ✓ | ✓（前缀仍放行） | 新主题须 `declareTopic`（声明后即可被 M2 订阅） |

**轮 4 的分类结果（`kernel/bus.js`）**：
- **登记为钩子（29 个，都有真实 emit 点，扩展方应当能反应）**：`paper/office-consult-required`；`publication/{advance,replication-failed}`；`notify/emit`；`crypto/{signed,rotated}`；`external/stale-served`；`legalentity/registered`；`ratelimit/{queued,degraded}`；`recruit/confirmed`；`reviewers/registered`；`workflow/{advance,retry,escalate}`；`formal/{checked,fidelity-defect,abstention-enforced,defects-loaded}`；`lean/{job-submitted,job-settled,job-timeout,job-recovered,jobs-disposed}`；**`board/moved`、`projmigrate/migrated`、`skills/declare`、`topology/select`、`trust/signal`**（这 5 个是**仓内门禁**抓出来的：它们写在自己的模块里、注释自称 "advisory"，此前既没登记也没分类）。
- **显式 log-only（6 个，只是账目/审计行，**不应**可订阅）**：`audit/rotate`、`auditchain/{appended,checkpoint-failed,partial-verify,anchored}`、`retention/truncated`——理由逐条写在 `LOG_ONLY_EMITS` 里（如"审计环轮转"、"链上追加"、"保留策略丢弃行"）。
- **命名空间同步**：`paper|publication|notify|crypto|external|legalentity|ratelimit|recruit|reviewers|workflow|formal|lean|board|projmigrate|skills|topology|trust` 已加入 `VU_NAMESPACE`（这些名字现在都是登记钩子 ⇒ 未登记名**具名拒**）；`audit|auditchain|retention` **故意不加**（它们的行不是钩子，直通即其语义）。

**门禁（**仓内**，干净 clone 可复现）**：`node scripts/audit-hook-emit-classification.mjs` → 三段：① 每个 emit 名**已分类**（登记 ∪ log-only，`unclassified` 必须为 0）；② 每个登记钩子**都有 emit 点**（无纸面能力）；③ `declareTopic` **对称**（声明 ⇒ 可被 M2 订阅；未声明/拼错 ⇒ 仍拒）。当前 **7 passed / 0 failed**（exit 0）。该脚本已按 D-05 双登记口径进 `package.json` 的 `files[]`（`scripts/**` 只登记 files[]）。
- 早先的对称性/普查探针（**仓库外一次性副本，已被上面的仓内门禁取代**）曾显示"声明后 `bus.emit` 成功但 `isRegisteredHook` 仍为 false"（**声明了却挂不上**）；统一后两向断言并入门禁 §3。

## 6. 插件、协议与边界

### 6.1 三类扩展物的装载顺序（**轮 1 按 D-03 更正：只有 M1/M2 进总线**）
1. **整合包（L4）先**：`kernel/pack.js` 解析依赖 → 施加包内 `settings`／`slots`／`tracks`／`rules`（M1）／`middleware`（M2）／`aliases`／`promptPolicies`；包冲突**必须显式声明**（重名 id／设置重叠直接拒绝）。**包不是 M4**：它是自成一档的 L4 组合。
2. **模块（M2）次之**：`kernel/loader.js` 校验 `meta.apiVersion`／`capabilities`／**已注册钩子**并挂上 `handler`，再由 `bus.add` 进总线（测试也用 `bus.on(entry, handler)` 注入）。
3. **脚本（M3）不在总线上**：经 `kernel/script-bridge.js` ＋ `vibe_vmu_script` 工具（`config.scripts`）建立调用；`file`／`inline` 二选一。**外部插件（M4）同样不在总线上**：它是消费 vmu 已发布服务的 DSH 插件。
> **同 order 内**按 `id` 字典序 ⇒ 总线上的条目顺序**确定可复现**。

### 6.1.1 钩子只有一份登记（**轮 1 立，轮 2 收口 = D-12**）
- **单一真源**＝`kernel/bus.js` 的 `HOOK_REGISTRY`：每个钩子记 `name`／`kind`(vmu|host)／`failure`／可否阻断／可否改写／作用域／时机／真实生产者／是否桥接（`bridged` ＋ `bridgeSite`）。
- **全部派生**（轮 2 起**没有第二份字面量**）：`VU_HOOKS`＝登记的 `kind:'vmu'` 名（登记序）、`DEFAULT_FAILURE`＝各 vmu 钩子的 `failure`、`DSH_HOOKS`（模块可订阅的宿主名，`loader.js` 再导出）＝`kind:'host'` 名、`BRIDGED_HOOKS`（宿主桥真能挂的，`host-hooks.js` 再导出）＝`bridged:true` 子集；`workflow/*` 前缀在 `HOOK_PREFIXES`。
- **断言**：`hookRegistryProblems()` 校验**登记数据本身**——名字形状 `domain/name`、唯一、vmu 必有 `failure`/`scope`/`producer`、host 必有 `bridged` 且 `bridged ⇒ bridgeSite`、未桥接不得声称注册点、两张派生表覆盖数与登记一致；「桥接 ⊆ 可订阅」由 `BRIDGED_HOOKS` 的派生方式结构性成立，而**每个桥接项都有真实注册点**由 `bridgeSite` 字段具名。
- **门禁改读运行时导出**（D-12 同轮两侧改动）：`tests/audit-hook-coverage.test.mjs`、`tests/audit-doc-vs-code-tables.test.mjs`、`tests/audit-vmu-docs.test.mjs`、`scripts/generate-surface-index.mjs` 不再按源码文本正则解析这两张表 ⇒ 派生的形状可以自由演进。
- **命名空间**：`VU_NAMESPACE` 覆盖 `member|turn|meeting|ballot|record|task|prompt|budget|pack|settle|control|resume|ids|human|chat|mailbox|panel|math`；这些命名空间内未登记的名字**具名拒**（`declareTopic` 可显式声明新主题）。

### 6.2 与 DSH 原生能力的边界（实现事实）
- `bus.wrapHostWaterfall(next)` 是**唯一**接触宿主 `next()` 的地方：把宿主 waterfall 包成一次 `emit`，**条目返回 `undefined` 即放行**，`emit` 返回 `ok:false` 时**短路**（不调 `next`）。
- **不得**：绕过 DSH 权限/沙箱；自立"影子调度"；用中间件替代 DSH 工具注册（只能 `notify`/`record`/`setSetting`/`triggerWorkflow`，工具仍走 DSH）。
- **无宿主依赖**：`kernel/bus.js` 明确 "no host imports"（纯 Node 可导入）⇒ 零机制下可运行、可测试。

### 6.3 协议扩展（主题/消息/握手）
- **`apiVersion`**：`bus.js` 与 `prompt/index.js` 都导出 `apiVersion = 1`；**握手**＝装载期比对，不匹配 ⇒ 拒绝（不得"尽力而为"半挂）。
- **能力协商**：`CAPABILITIES` 即协议面；条目声明什么才能用什么（§3.2）。
- **自定义主题/消息**：**必须带命名空间**、**不得占用内核钩子名**、消息带版本与模式、未知字段忽略（向前兼容）、破坏性变更升主版本；具体主题清单由 `03` 登记。

### 6.4 作用域维度差异（真实差异）
- **总线**支持三维：`member`/`role`/`phase`。
- **提示词管线**支持四维：`member`/`role`/`phase`/**`task`**。
⇒ 中间件声明 `scope.task` 在**提示词路径**有效、在**总线其它钩子**上被忽略。**这是当前实现的非对称**，是否统一见 §13-1。

### 6.5 跨进程与跨会话
- **脚本桥**是唯一跨进程通道：入参出参走结构化协议；超时按 `hookTimeoutMs`，失败按条目策略。
- **跨会话**：条目集合与追踪环（64）**随会话**；全局层变更对新会话生效，对运行中会话需**显式重载**（并留痕）。

---

## 7. 安全与不可介入面（内核强制）

### 7.1 权限面（机制级）
| 动作 | 默认允许者 | 实现/备注 |
|---|---|---|
| 声明 M1 条目 | 用户（设置所有者） | 纯声明 |
| 挂 M2 处理器 | 用户/管理员 | 同进程代码 |
| 装载 M3 脚本 | 用户/管理员（可要求显式确认） | 需 `file` |
| 装载 M4 包 | 用户/管理员 | 包可携 M2/M3 |
| 热改/干跑开关 | 用户/管理员 | `setDryRun`、重载 |
| 禁用/启用/复位熔断 | 用户/管理员 | `disable`/`enable` |
| **卸载条目** | 计划 ✗ | 今日**无 `remove()`** |
| 改内核原语/票权/门槛/结算口径 | **任何人都不行** | §7.2 |

### 7.2 不可绕过（红线清单）
1. **能力不得自我授予**：用了没声明的能力 ⇒ `VMU_MIDDLEWARE_FAILED`（**恒按 closed**、计入熔断）。
2. **票权/门槛/结算/审计不可改**：`ballot/*`、`settle/*` 只允许 `deny`；审计只能由内核写（条目可 `record`/`annotate`，不能关闭/篡改）。
3. **失败不得静默**：`open` 放行也**必有审计行**（`middleware/failure-policy`）。
4. **冲突不得静默**：重名 id、包同名段一律**显式拒绝**（"never resolved silently"）。
5. **零机制可运行**：无任何条目时，`emit` 返回 `ok:true, decisions:[]`，原语按默认行为执行。

### 7.3 安全审计字段（每条审计行）
`{ts, seq, what, id, hook, order, failure, keys, dryRun, traceId, policy, consecutive, code, error, reason}` ⇒ 可回答"谁在何时改了什么/为什么被拒/失败几次"。

---

## 8. 调试与可观测

| 手段 | 接口 | 回答 |
|---|---|---|
| 条目清单 | `status().entries[]` | 挂了什么、顺序、能力、是否被熔断 |
| 命中/失败 | `hits`、`consecutiveFailures` | 谁在用、谁在坏 |
| 时间线 | `trace(traceId)` | 这一次钩子里每步做了什么 |
| 干跑 | `setDryRun(true)` ＋ `dryRun:true` 决策 | 若真跑会怎样 |
| 钩子集合 | `status().hooks` | 当前配置实际覆盖了哪些钩子 |
| 审计流 | `onAudit(row)` | 全量机制事件 |

**刚性**：观测是内核强制（`status()`/`trace()` 不可关闭）；**没有观测就无法证明"用户接管了什么"**。

---

## 9. 结构化条目模板

```
名称：<id>（唯一；kebab-case，含命名空间前缀最佳）
目的：<一句话>
形态：rules(M1) | module(M2) | script(M3) | plugin(M4)
接口形状：on: <钩子名>；payload：<关键字段>；返回：undefined（放行）或 { <能力键>: … }
可调控参数：vmu.middleware.*（见回报键表：hookTimeoutMs / breakerThreshold / entries[].* / dryRun）
错误码：VMU_MIDDLEWARE_FAILED | VMU_MIDDLEWARE_REJECTED | VMU_INVALID_ARGUMENT（＋拒绝时自定义 code）
哲学关系：内核零策略 / 不炸框架 / 票权不可让渡 / 只推荐不驱动
实现要点：装载时机、排序（order→id）、能力声明、失败策略、审计字段
依赖：kernel/bus.js（必需）；script→script-bridge；pack→pack.js；prompt→prompt/index.js
成熟度：✓ 已实现 | ✗ 计划
优先级：P0 机制必需 / P1 可用性 / P2 便利
```

---

## 10. 与其它卷的接口
- `04-settings.md`：键的**解析**；本章 §3.1/§4.4 的键（`vmu.middleware.*`）由它规范化。
- `06-prompt-pipeline.md`：`prompt/section-assembled`（**注意 §5.2 命名缺陷**）与 `budget/exceeded` 的具体化。
- `10-packs.md`：包冲突与覆盖的**显式声明**规则（本章 §6.1 只定装载顺序）。
- `11-gates-and-development.md`：把 §3.1/§3.2/§4.3/§7.2 逐条变门（缺一条即红）。
- `14-open-items-and-roadmap.md`：本章标 ✗ 者（`remove()`、`budget/exceeded` 未接线；`prompt/assemble` 命名**已修** ✓；**纸面钩子已于轮 496 清零** ✓ ⇒ 本行原先的"6 个无生产者钩子"是过期计数，已删）。

---

## 11. 零机制保证（可验收条款）

> **判据（机器可判定 ✓）**：**断言**＝无声明时只注册一个只读工具（由 `vmu-kernel` 与 `vmu-entry` 两个套件分别覆盖 ✓）；任一条被破坏即门禁**红** ✓；每条结论对应一个可复现**场景**（零配置启动／单条 M1／单条 M2／单条 M3／单条 M4 ✓）；失败必须是**具名**拒绝（`VMU_*` ＋ hint ✓），**不得静默放行** ✗。
1. 无任何条目 ⇒ `emit` 空跑、原语照常执行；
2. 无任何条目 ⇒ `status()` 仍可读（条目为空、`hooks` 为空）；
3. 无任何条目 ⇒ **只暴露一个只读工具**（观测面），**不产生任何写路径**；
4. 任何"看起来没配"的状态，都必须能被 `status()` 与审计区分于"配了但被拒/被熔断"。

---

## 12. 关键路径清单（实现者速查）
`validateEntry()` → `add()`（重名/校验/归一化）→ `sortedFor(hook)`（启用/未熔断/该钩子/排序）→ `scopeMatches()` → `withTimeout()` → `checkCapability()` → 决策收集/终止 → `recordFailure()`/熔断 → `audit()`/`remember()` → `status()`/`trace()` → `wrapHostWaterfall()`（宿主接缝）。

---

## 13. 待裁决
1. **作用域维度统一**：总线三维 vs 管线四维（§6.4）——统一为四维，还是管线独有？
2. **`prompt/assemble` vs `prompt/section-assembled`**（§5.2）：登记新名，还是改 emit 为逐段名（本卷建议后者）？
3. **无生产者钩子：已清零** ✓（轮 496 补上 `pack/loading`／`pack/loaded`／`turn/reply-parsed`／`record/append-before`，`prompt/section-assembled` 与 `budget/exceeded` 更早已接线）⇒ 由 `tests/audit-hook-coverage.test.mjs` 双向守着；**残余待办**只剩 `budget/exceeded` 的触发点协商（截断是否触发它，见 §13-2 与 06 §17.2）。
4. **卸载语义**：`remove()` 的依赖检查与"幽灵注册"防护规格（今日只有 `disable`）。
5. **熔断后可观测性**：是否要求 `control/heartbeat` 的 payload **常驻**携带"当前被熔断条目清单"（本卷倾向"是"）。
6. **能力扩展**：新增能力（如 `rewrite-state`）是否需要"内核先提供写路径"——本卷建议**永不提供**（保持 §7.2 红线）。

---

## 14. 修正清单（v0.1 → v0.2，逐条有实现依据）
| # | v0.1 说法 | v0.2 更正 | 依据 |
|---|---|---|---|
| 1 | 决策词表 `allow/deny/replace/short-circuit` | **实现没有这些词**：返回 `undefined`＝放行；返回对象⇒按**能力键**校验；`deny/cancel` 终止 | `bus.js` `DECISION_CAPABILITY`／`emit()` |
| 2 | 失败策略"仅 `record/appended` 为 open" | **逐字更正**：`open`＝`record/appended`、**`prompt/section-assembled`**、`control/paused|resumed|heartbeat`；**`abort`＝`budget/exceeded`**；其余 `closed` | `bus.js` `DEFAULT_FAILURE` |
| 3 | 作用域"全局/角色/成员/会话/回合" | 总线实为 **`member`/`role`/`phase`**；管线另有 `task` | `scopeMatches()`（两处） |
| 4 | 排序"优先级→作用域宽窄→声明序" | 实为 **`order` → `id`（字典序）** | `sortedFor()` |
| 5 | "短路"是通用能力 | 终止只有 **`deny`/`cancel`**；不存在通用短路 | `emit()` 终止分支 |
| 6 | 未提能力声明 | 新增 **§3.2 能力 12 项＋越权恒 closed＋计熔断** | `CAPABILITIES`／`checkCapability()` |
| 7 | 未提熔断/超时参数 | 新增 **§4.4**（`hookTimeoutMs`=2000、`breakerThreshold`=3、`enable()` 复位） | `createBus()`／`enable()` |
| 8 | 未提追踪/干跑/审计行 | 新增 **§4.5/§7.3/§8** | `emit()`／`remember()`／`audit()` |
| 9 | 未提钩子生产者 | 新增 **§5 生产者列（13 ✓ / 7 ✗）＋§5.2 命名不一致缺陷** | 实仓 grep |
| 10 | 未提卸载缺口 | 明确 **无 `remove()`**（只有 `disable`）⇒ 卸载/回滚为计划 ✗ | `bus` 公开面 |
| 11 | **轮 1**：`kind ∈ {rules,module,script,plugin}`＝M1–M4 | **总线只跑 `rules`／`module`**；`script`／`plugin` 在 `add` 处**具名拒** `VMU_MIDDLEWARE_KIND_UNSUPPORTED`（hint 点名真实载体）；**M4 是 DSH 外部插件，pack 是 L4** | `bus.js` `SUPPORTED_KINDS`／`add()` |
| 12 | **轮 1**：非规则条目"给 `handler` 或 `file`" | **必须给 `handler`**；`file` 只是装载线索（总线不装载文件，`loader.js` 装载后带上 handler） | `bus.js` `validateEntry()`／`emit()` 的 skipped 分支已不再可达 |
| 13 | **轮 1**：三份钩子表各自维护 | **一份登记 `HOOK_REGISTRY` ＋ 派生 ＋ 断言**（§6.1.1） | `bus.js` `hookRegistryProblems()`；`loader.js`／`host-hooks.js` 再导出派生表 |
| 14 | **轮 2**：`VU_HOOKS`／`DEFAULT_FAILURE` 仍是字面量（靠断言绑定） | **完全派生**（D-12）：两张表都由 `HOOK_REGISTRY` 生成，4 处按源码文本解析的门禁同轮改为**读运行时导出** | `bus.js` `VU_HOOKS`／`DEFAULT_FAILURE`；`tests/audit-hook-coverage.test.mjs`／`audit-doc-vs-code-tables.test.mjs`／`audit-vmu-docs.test.mjs`／`scripts/generate-surface-index.mjs` |
| 15 | **轮 2**：`emit({type:'x'})` 单对象广播（`kernel/lifecycle.js:39`） | **活 bug**：`bus.emit` 只收**字符串名** ⇒ 该调用抛 `VMU_INVALID_ARGUMENT` 且被 try/catch 吞掉 ⇒ **广播从未到达总线**。正确形态 `bus.emit('<名>', payload, opts)`；门禁也只认这一形态 | `kernel/lifecycle.js:39`；§5.3 末的形态硬要求 |

---

## 15. 未核项（**编号登记见 `14-§2`**）

> **判据（机器可判定 ✓）**：本节缺失即 T0 预检 `[D8]` **红** ✓（"缺少未核项小节" ✓）⇒ 它是**断言**不是装饰 ✓；每条的失败都必须是**具名**拒绝而不是静默 ✓。

1. **无生产者钩子：0 个** ✓（轮 496 已接线四个；`prompt/section-assembled` 与 `budget/exceeded` 更早已接线）⇒ **原先的"5 个仍未接线"已过期删除**；`tests/audit-hook-coverage.test.mjs` 与 `tests/audit-vmu-docs.test.mjs`（`KNOWN_UNEMITTED` 空集）双向守着，新增冻结名若无 emit 点即红 ✓。
2. **`prompt/assemble` 命名漂移已修** ✓（代码改为冻结名 `prompt/section-assembled` ✓，总线加了名字校验 ✓）—— 但**逐段触发粒度**未定 ✗（每段一次 vs 一次带清单 ✓）。
3. **无 `remove()`** ✗：条目只能 `disable`，**卸载/回滚**为计划 ✓；`disable` 与"卸载"的语义差别未实证 ✗。
4. **脚本桥沙箱边界未定** ✗：M3 脚本能否调用外部命令（本卷建议**默认否** ✓）尚未由代码强制 ✗。
5. **熔断/降级的观测面**未核 ✗：`control/heartbeat` 是否常驻携带"被熔断条目清单"未定 ✓。
6. **`rewriteArgs` 在宿主 `tools/pre-execute` 永久不支持** ✗（当前具名拒 `VMU_NOT_PERMITTED` ✓）⇒ 是否需要 vmu 侧"改写入参"通道未裁 ✗。

<!-- BEGIN GENERATED: hook-index -->

### 钩子索引（★ **生成**：来自 `VU_HOOKS` ＋ `DEFAULT_FAILURE` ＋ 实仓 emit 扫描 ✓）

> ★★★ **本节的数字【曾经手写、并因此过期**]✗** ✓：★ **§5 的标题写着"**20** 个冻结名"，而 `VU_HOOKS` 在轮 496 已增至 **85**（★ 新增 `budget/warn` 与 `member/self-report` ✓ —— ★ 两个都是**修活 bug 时**加上的 ✓）⇒ ★★ **手写计数【必然**]落后于代码** ✓ ⇒ **这张表改为生成** ✓。

| 钩子 | 默认失败策略 | 生产者 |
|---|---|---|
| `member/self-report` | `open` | `members.js`、`panel.js` |
| `budget/warn` | `open` | `budget.js` |
| `member/wake-before` | `closed` | `members.js` |
| `member/wake-after` | `closed` | `members.js` |
| `turn/reply-parsed` | `closed` | `index.js` |
| `meeting/round-start` | `closed` | `meeting.js` |
| `meeting/round-end` | `closed` | `meeting.js`、`minutes.js` |
| `ballot/cast` | `closed` | `ballot.js` |
| `ballot/tally` | `closed` | `ballot.js` |
| `record/append-before` | `closed` | `library.js` |
| `record/appended` | `open` | `compliance.js`、`handover.js`、`minutes.js`、`tenure.js` |
| `task/assign` | `closed` | `members.js`、`tasks.js` |
| `task/transition` | `closed` | `tasks.js` |
| `prompt/section-assembled` | `open` | `index.js` |
| `budget/exceeded` | `abort` | `fairness.js` |
| `pack/loading` | `closed` | `pack.js` |
| `pack/loaded` | `closed` | `pack.js` |
| `settle/before` | `closed` | `tasks.js` |
| `settle/after` | `closed` | `tasks.js` |
| `control/paused` | `open` | `index.js` |
| `control/resumed` | `open` | `index.js` |
| `control/heartbeat` | `open` | `index.js` |
| `resume/recovered` | `open` | `resume.js` |
| `resume/degraded` | `open` | `resume.js` |
| `resume/projection-error` | `open` | `resume.js` |
| `ids/minted` | `open` | `ids.js` |
| `ids/hydrated` | `open` | `ids.js` |
| `ids/persist-failed` | `open` | `ids.js` |
| `resume/lock-release-failed` | `open` | `resume.js` |
| `human/vetoed` | `open` | `human.js` |
| `human/veto-lifted` | `open` | `human.js` |
| `human/approval-asked` | `open` | `human.js` |
| `human/gate-pending` | `closed` | `human.js` |
| `human/approval-decided` | `open` | `human.js` |
| `control/scope-paused` | `open` | `control.js` |
| `control/scope-resumed` | `open` | `control.js` |
| `control/param-set` | `open` | `control.js` |
| `control/param-refused` | `open` | `control.js` |
| `chat/send-before` | `closed` | `chat.js` |
| `chat/sent` | `open` | `chat.js` |
| `chat/refused` | `open` | `chat.js` |
| `mailbox/deliver-before` | `closed` | `mailbox.js` |
| `mailbox/delivered` | `open` | `mailbox.js` |
| `panel/write-before` | `closed` | `panel.js` |
| `panel/written` | `open` | `panel.js` |
| `panel/viewed` | `open` | `panel.js` |
| `math/job-submitted` | `open` | `mathjobs.js` |
| `math/job-settled` | `open` | `mathjobs.js` |
| `math/job-failed` | `open` | `mathjobs.js` |
| `math/job-timeout` | `open` | `mathjobs.js` |
| `math/job-cancelled` | `open` | `mathjobs.js` |
| `math/job-recovered` | `open` | `mathjobs.js` |
| `math/adapters-probed` | `open` | `mathadapters.js` |
| `math/adapters-ran` | `open` | `mathadapters.js` |
| `lifecycle/prereg` | `open` | `lifecycle.js` |
| `lifecycle/advance` | `open` | `lifecycle.js` |
| `paper/office-consult-required` | `open` | `paper.js` |
| `publication/advance` | `open` | `publication.js` |
| `publication/replication-failed` | `open` | `publication.js` |
| `notify/emit` | `open` | `notify.js` |
| `crypto/signed` | `open` | `crypto.js` |
| `crypto/rotated` | `open` | `crypto.js` |
| `external/stale-served` | `open` | `external.js` |
| `legalentity/registered` | `open` | `partnership.js` |
| `ratelimit/queued` | `open` | `ratelimit.js` |
| `ratelimit/degraded` | `open` | `ratelimit.js` |
| `recruit/confirmed` | `open` | `recruit.js` |
| `reviewers/registered` | `open` | `reviewers.js` |
| `workflow/advance` | `open` | `workflow.js` |
| `workflow/retry` | `open` | `workflow.js` |
| `workflow/escalate` | `open` | `workflow.js` |
| `formal/checked` | `open` | `formal.js` |
| `formal/fidelity-defect` | `open` | `fidelity.js` |
| `formal/abstention-enforced` | `open` | `fidelity.js` |
| `formal/defects-loaded` | `open` | `fidelity.js` |
| `lean/job-submitted` | `open` | `lean.js` |
| `lean/job-settled` | `open` | `lean.js` |
| `lean/job-timeout` | `open` | `lean.js` |
| `lean/job-recovered` | `open` | `lean.js` |
| `lean/jobs-disposed` | `open` | `lean.js` |
| `board/moved` | `open` | `board.js` |
| `projmigrate/migrated` | `open` | `projmigrate.js` |
| `skills/declare` | `open` | `skills.js` |
| `topology/select` | `open` | `topology.js` |
| `trust/signal` | `open` | `trust.js` |

> ★★ 合计 **85** 个冻结钩子 ✓；★ **无默认策略的 **0** 个** ✓。

<!-- END GENERATED: hook-index -->

<!-- BEGIN GENERATED: register-fields -->

### 段注册字段（★ **生成**：来自 `kernel/prompt/index.js` 的 `entry` 对象 ✓）

> ★★★ **本节为什么是生成的**：★ **§3.1 原来【手写**]这些字段，而它在轮 493 被查出【漏了两个**]✗（`lang` 与 `terms` ✓ —— ★ 后者是守卫**第一次运行**就抓出来的 ✓）⇒ ★★ **手写字段表【必然**]落后于代码** ✓。★ **真源是 `register()` 构造的 `entry` 对象** ✓ —— ★ **下面是它逐字段的默认表达式** ✓。

| 字段 | 代码里的默认表达式（★ 逐字 ✓） | 备注（取自代码注释 ✓） |
|---|---|---|
| `scope` | `section.scope || null` | —— |
| `mutable` | `name === 'state' ? false : section.mutable !== false` | —— |
| `source` | `section.source || 'kernel'` | —— |
| `template` | `section.template || null` | —— |
| `vars` | `Array.isArray(section.vars) ? section.vars.slice() : []` | —— |
| `truncate` | `section.truncate || null` | —— |

> ★★ 合计 **6** 个字段 ✓。★★ **注意**：★ `range` **不是入参**，而是 `inRange(order, name)` 算出来的 ✓ —— ★ **它在 `entry` 里、不在 `section` 入参里** ✓。

<!-- END GENERATED: register-fields -->

<!-- BEGIN GENERATED: capability-list -->

### 能力词表（★ **生成**：来自 `kernel/bus.js` 的 `CAPABILITIES` ✓）

> ★★ **§3.2 声称"12 项，冻结"，★ 实测【与代码逐项一致**]✓** ✓（★ 轮 494 核实 ✓）⇒ ★ **现已改为生成，使未来不一致在源头不可能** ✓。★★ **而"能力→决策键"的映射仍【手写**]✗** ✓ —— ★ **因为代码里【没有**]那张映射表** ✓（★ 实测 ✓）⇒ ★★ **能推导的推导；不能推导的【明说**]** ✓。

| # | 能力 |
|---|---|
| 1 | `read-state` |
| 2 | `read-args` |
| 3 | `deny` |
| 4 | `cancel` |
| 5 | `rewrite-args` |
| 6 | `rewrite-result` |
| 7 | `append-prompt` |
| 8 | `record` |
| 9 | `notify` |
| 10 | `set-setting` |
| 11 | `trigger-workflow` |
| 12 | `annotate` |

> ★★ 合计 **12** 项 ✓。★★ **另两处【刻意不生成**]的**（★ 附理由 ✓）：★ **`docs/06 §4` 的"谁能占"列** ✓ —— ★ **代码只有数值区间，没有那一列** ✓；★ **`docs/03 §3.1` 的工具出现条件** ✓ —— ★ **十个里只有三个可从 `host.js` 机器提取** ✓。

<!-- END GENERATED: capability-list -->
