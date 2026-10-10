# 05 · 中间件与钩子（四形态全生命周期 · 钩子全景 · 插件与协议）

> 状态：**草案 v0.2**（据 `kernel/bus.js`（327 行）与各原语模块**逐条核对后重写**；v0.1 中"自由裁决词表/作用域维度/失败策略"等处已按实现更正，见 §14 修正清单）
> 上位：`01-philosophy.md`（R1 内核零策略 / R5 四形态 / R6 钩子契约化 / R7 稳定接口 / R11 可观测）、`02-architecture.md`（L3 总线层）、`04-settings.md`（键解析）、`06-prompt-pipeline.md`（`prompt/*` 的具体化）、`10-packs.md`（M4 打包）、`11-gates-and-development.md`（把本章红线变门）
> **读者**：**使用者**（写机制：选钩子、配作用域、定失败策略）与**实现者**（加钩子、加能力、加原语）
> **术语**：**原语（primitive）**＝内核最小能力（成员/会议/投票/记录/任务/结算/控制）；**挂点（hook）**＝原语执行路径上允许外部介入的具名位置；**条目（entry）**＝一个中间件声明；**决策（decision）**＝处理器返回的能力对象；**能力（capability）**＝条目必须**先声明**才能使用的一种动作。

---

## 0. 一页速览

**内核给"能在哪介入"（20 个冻结钩子）＋"能做什么"（12 项能力）；中间件声明"我在哪个钩子、对谁、按什么失败策略、用哪些能力、做什么"。**

| 概念 | 实现事实（`kernel/bus.js`） |
|---|---|
| 条目形态 | `kind ∈ {rules, module, script, plugin}`（＝M1/M2/M3/M4） |
| 必需字段 | `id`（非空字符串）、`kind`、`on`（≥1 个钩子） |
| 非规则条目 | 必须给 `handler`（函数）或 `file`（脚本路径） |
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

## 2. 四形态总表（M1–M4 ＝ 实现里的 `kind`）

| 形态 | 实现 `kind` | 载体 | 必需 | 表达力 | 隔离 | 热改 | 典型用途 |
|---|---|---|---|---|---|---|---|
| **M1 规则（声明式）** | `rules` | 设置/声明里的条目（**无需 handler**） | `id`,`kind`,`on` | 低（选钩子/顺序/作用域/失败策略/能力声明） | 最高 | ✓ | 团队约定、合规开关、只做"启用/禁用/排序"的机制 |
| **M2 代码模块（函数式）** | `module` | 同进程模块，`handler` 函数 | ＋`handler` | 高（任意逻辑） | 低 | 需重载 | 复杂决策合并、外部系统对接 |
| **M3 脚本（子进程桥）** | `script` | `file`（经 `kernel/script-bridge.js`） | ＋`file` | 中（受协议限制） | 高（进程＋超时） | ✓ | 任意语言写策略、复用既有工具链 |
| **M4 整合包（组合）** | `plugin` | 包（`kernel/pack.js`）携带的条目集合 | ＋包清单 | 组合级（依赖/覆盖/别名/服务） | 取决于内含 | △ | 分发整套流程（教学/团队/合规模板） |

> **统一形状**：四形态最终都产出**同一形状的条目**（`id/kind/on/order/failure/capabilities/scope/source/handler|file`）⇒ §3–§5 的语义对四形态**完全通用**；差别只在"处理器从哪来"。

---

## 3. 条目契约

### 3.1 字段（**逐字来自 `validateEntry` 与 `add`**）
| 字段 | 类型 | 必需 | 默认 | 说明 |
|---|---|---|---|---|
| `id` | string（非空） | ✓ | —— | **全局唯一**；重名 ⇒ `VMU_MIDDLEWARE_FAILED`（"冲突从不静默解决"） |
| `kind` | `rules`｜`module`｜`script`｜`plugin` | ✓ | —— | 非法值 ⇒ 校验失败 |
| `on` | string ｜ string[] | ✓ | —— | ≥1 个钩子名；**不得为空** |
| `handler` | function | 非 `rules` 必给（或给 `file`） | —— | 函数式挂点 |
| `file` | string | 非 `rules` 可替代 `handler` | —— | 脚本路径（M3） |
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

## 5. 钩子全景表（20 个冻结名，逐字来自 `VU_HOOKS`）

> **生产者列取自实仓 grep**（`kernel/*.js`、`kernel/prompt/*.js`、`host*.js`、`vibe-math-vmu.js`、`packs/*.js`）：✓＝有 `emit(` 生产者；✗＝**今天无人 emit**（只出现在 `bus.js` 的冻结表/默认表）。
> **默认失败策略**＝`DEFAULT_FAILURE` 逐字。

| # | 钩子 | 默认失败 | 生产者 | 建议入参（payload 关键面） | 允许的决策（能力） | 可拒绝 | 可改写 | 归属 |
|---|---|---|---|---|---|---|---|---|
| 1 | `member/wake-before` | `closed` | **✓** `members.js` | 目标成员、唤醒类型、上下文摘要 | `deny`／`rewriteArgs`／`appendPrompt`／`annotate` | ✓ | ✓ | 用户可定义（"未拒绝才唤醒"） |
| 2 | `member/wake-after` | `closed` | **✓** `members.js` | 成员、唤醒结果、耗时 | `record`／`notify`／`annotate` | ✗ | ✗ | 用户可定义（观测） |
| 3 | `turn/reply-parsed` | `closed` | **✗ 无生产者** | 成员、回合解析结果 | `deny`／`rewriteResult`／`annotate` | ✓ | ✓ | 用户可定义（**不得**改票权语义） |
| 4 | `meeting/round-start` | `closed` | **✓** `meeting.js` | 会议 id、轮次、参与集、议程 | `deny`／`rewriteArgs`／`notify` | ✓ | ✓ | 用户可定义（可否开会） |
| 5 | `meeting/round-end` | `closed` | **✓** `meeting.js` | 会议 id、轮次、产出摘要 | `record`／`notify`／`annotate` | ✗ | ✗ | 用户可定义 |
| 6 | `ballot/cast` | `closed` | **✓** `ballot.js` | 投票人、选项、时间 | `deny`（**唯一**） | ✓ | ✗ | **内核强制**（票面不可改写） |
| 7 | `ballot/tally` | `closed` | **✓** `ballot.js` ＋ `packs/v3-core.js` | 票集、门槛、汇总 | `deny`／`annotate`（**不得** rewrite） | ✓ | ✗ | **内核强制**（计票不可改写） |
| 8 | `record/append-before` | `closed` | **✗ 无生产者** | 记录种类、内容、目标 | `deny`／`rewriteArgs`／`record` | ✓ | ✓ | 用户可定义（**不得**删既有记录） |
| 9 | `record/appended` | **`open`** | **✗ 无生产者** | 记录摘要、哈希 | `record`／`annotate`／`notify` | ✗ | ✗ | 用户可定义（观测；失败放行） |
| 10 | `task/assign` | `closed` | **✓** `members.js`／`tasks.js` | 任务、被指派者、验收 | `deny`／`rewriteArgs`／`notify` | ✓ | ✓ | 用户可定义 |
| 11 | `task/transition` | `closed` | **✓** `tasks.js` | 任务、原/目标状态 | `deny`／`record` | ✓ | ✗ | 用户可定义（状态机仍内核校验） |
| 12 | `prompt/section-assembled` | **`open`** | **✓ 已有生产者**（装配路径 emit ✓；曾漂移为 `prompt/assemble` ✗ ⇒ 本会话已修 ✓ 见 §5.2） | 段名、段文本、来源、顺序、剩余预算 | `deny`／`appendPrompt`／`rewriteResult`／`annotate` | ✓ | ✓ | 用户可定义（**见 06**） |
| 13 | `budget/exceeded` | **`abort`** | **✗ 无生产者** | 超预算对象、已用/上限、候选 | `deny`／`annotate` | ✓ | ✗ | 用户可定义（截断协商） |
| 14 | `pack/loading` | `closed` | **✗ 无生产者** | 包 id、声明、计划 | `deny`／`rewriteArgs` | ✓ | ✓ | 用户可定义 |
| 15 | `pack/loaded` | `closed` | **✗ 无生产者** | 包 id、条目数、服务、耗时 | `record`／`notify` | ✗ | ✗ | 用户可定义 |
| 16 | `settle/before` | `closed` | **✓** `tasks.js` | 结算对象、口径、参与集 | `deny`（**唯一**） | ✓ | ✗ | **内核强制**（口径不可改写） |
| 17 | `settle/after` | `closed` | **✓** `tasks.js` | 结算结果、留痕引用 | `record`／`annotate`／`notify` | ✗ | ✗ | 用户可定义（观测） |
| 18 | `control/paused` | **`open`** | **✓** `kernel/index.js` | 暂停原因、作用域、发起者 | `notify`／`annotate` | ✗ | ✗ | 用户可定义（提示面） |
| 19 | `control/resumed` | **`open`** | **✓** `kernel/index.js` | 恢复原因、跳过项 | `notify`／`annotate` | ✗ | ✗ | 用户可定义 |
| 20 | `control/heartbeat` | **`open`** | **✓** `kernel/index.js` | 心跳序号、健康摘要、降级列表 | `record`／`notify`／`annotate` | ✗ | ✗ | 用户可定义 |

### 5.1 表读法（三条硬结论）
1. **可拒绝 ≠ 可改写**：`ballot/cast`、`ballot/tally`、`settle/before` 允许 `deny` 但**不得改写** —— "用户能守门，改不了公理"的落点。
2. **`open` 默认＝观测类**（`record/appended`、`prompt/section-assembled`、`control/paused|resumed|heartbeat`）⇒ 观测者崩溃**不阻断业务**；**`abort` 默认只有一个**（`budget/exceeded`）⇒ 预算失守必须上报。
3. **没有任何钩子允许改票权/门槛/结算口径**：即便声明了 `rewriteResult`，在 §7 红线下也不被允许（能力声明 + 内核不提供对应写路径，双重约束）。

### 5.2 **已核实的真实不一致（必须修）** ✗
- `kernel/prompt/index.js:231` 与 `host-hooks.js`／`kernel/loader.js` 里 **emit 的钩子名是 `prompt/assemble`**，而**冻结集里是 `prompt/section-assembled`**。总线**不校验 emit 的钩子名** ⇒ 这三处 emit **匹配不到任何条目**（静默空跑）。
- 后果：**中间件无法介入提示词装配**（本卷与 `06` 的核心承诺在这条路径上不成立）。
- 处置（二选一，见 §13-2）：① 把 `prompt/assemble` 登记进 `VU_HOOKS`（并给默认失败策略）；② 把三处 emit 改为 `prompt/section-assembled`。**本卷建议 ②**（`06` 的目标是"逐段接管"，整篇粒度太粗）。
- 另：`budget/exceeded` 与 `pack/loading|loaded` **有冻结名与默认策略却无人 emit** ⇒ "截断协商/包装载介入"目前是**纸面能力 ✗**；`prompt/index.js` 的 `truncation[]` 只进 `status()`，**没有**触发 `budget/exceeded`。

---

## 6. 插件、协议与边界

### 6.1 三类扩展物的装载顺序
1. **包（plugin/M4）先**：`kernel/pack.js` 解析依赖 → 装载包内 `rules/module/script` 条目与资源；包冲突**必须显式声明**（重名 id 直接拒绝）。
2. **模块（module/M2）次之**：`bus.on(entry, handler)` 把处理器挂到条目上（测试也用这条路注入）。
3. **脚本（script/M3）最后**：经 `kernel/script-bridge.js` 建立调用；`file` 必填。
> **同 order 内**按 `id` 字典序 ⇒ 三种载体的相对顺序**确定可复现**。

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
- `14-open-items-and-roadmap.md`：本章标 ✗ 者（`remove()`、**6 个**无生产者钩子、`budget/exceeded` 未接线；`prompt/assemble` 命名**已修** ✓）。

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
3. **6 个无生产者钩子**：哪些**本阶段必须接线**（本卷建议优先：`budget/exceeded`＋`record/*`；`prompt/section-assembled` **已接线** ✓）？
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

---

## 15. 未核项（**编号登记见 `14-§2`**）

> **判据（机器可判定 ✓）**：本节缺失即 T0 预检 `[D8]` **红** ✓（"缺少未核项小节" ✓）⇒ 它是**断言**不是装饰 ✓；每条的失败都必须是**具名**拒绝而不是静默 ✓。

1. **6 个"注册但无生产者"的钩子仍未接线** ✗：`turn/reply-parsed`／`record/append-before`／`record/appended`／`budget/exceeded`／`pack/loading`／`pack/loaded`（**`prompt/section-assembled` 已接线 ✓** 本会话修 ✓）⇒ 挂上它们**今天不会触发** ✓；**场景**：接线后逐个补"生产者存在"的断言 ✓。
2. **`prompt/assemble` 命名漂移已修** ✓（代码改为冻结名 `prompt/section-assembled` ✓，总线加了名字校验 ✓）—— 但**逐段触发粒度**未定 ✗（每段一次 vs 一次带清单 ✓）。
3. **无 `remove()`** ✗：条目只能 `disable`，**卸载/回滚**为计划 ✓；`disable` 与"卸载"的语义差别未实证 ✗。
4. **脚本桥沙箱边界未定** ✗：M3 脚本能否调用外部命令（本卷建议**默认否** ✓）尚未由代码强制 ✗。
5. **熔断/降级的观测面**未核 ✗：`control/heartbeat` 是否常驻携带"被熔断条目清单"未定 ✓。
6. **`rewriteArgs` 在宿主 `tools/pre-execute` 永久不支持** ✗（当前具名拒 `VMU_NOT_PERMITTED` ✓）⇒ 是否需要 vmu 侧"改写入参"通道未裁 ✗。
