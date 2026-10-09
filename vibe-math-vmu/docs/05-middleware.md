# vmu 05 · 中间件（Middleware）手册

> 状态：**草案 v0.1**（DSH 侧钩子签名以 `design/00-dsh-plugin-surface.md` 为准；官方方言细节待 02 号侦察校正）
> 上位：`01-philosophy.md`（R5 四形态 / R6 钩子契约化 / R7 稳定接口）、`02-architecture.md`（L3 层、总线）
> 读者：**使用者**（写机制）与**实现者**（加钩子/加动作）

---

## 1. 心智模型

> **内核给"能在哪介入"（钩子）＋"能做什么"（动作）；中间件决定"什么时候、对谁、做什么"。**

```
事件流 ──► [总线] ──► 钩子序列（按 order） ──► 决定/改写/记录 ──► 框架继续或终止
              │
              └── 每条中间件都可声明：作用域 / 前提条件 / 失败策略 / 能力清单
```

**三条不变量**
1. **内核零策略**：任何"业务规则"都不得硬编码进内核，只能由中间件表达（R1）。
2. **契约化**：钩子与动作**都在本文档登记**；文档缺一条即门禁红（R6）。
3. **不炸框架**：中间件异常/超时**不得**让框架崩溃或静默改语义（§7）。

---

## 2. 中间件清单（单一模型，四形态共用）

```yaml
vmu.middleware.entries:
  - id: proof-before-debate            # 唯一 id（冲突检测用）
    kind: rules                        # rules | module | script | plugin
    enabled: true
    order: 100                         # 越小越先；默认 1000
    scope: { member: '*', phase: '*' } # 作用域（§8）
    on: [tools/pre-execute]            # 订阅的钩子（§5）
    failure: closed                    # open | closed | abort（§7）
    capabilities: [read-args, deny]    # 能力声明（M2 强制；M1 由动作集推导）
    file: middleware/rules/proof-before-debate.yml
    notes: "只有已登记正式证明/证伪且 locked 的对象才能进入表决"
```

**装载顺序（确定性）**：`order` 升序 → 同 `order` 按 `id` 字典序 → 同 id 报冲突。
**dry-run**：装载期必须先跑静态校验与"干跑"（§9），失败即拒装（不许半装载）。

---

## 3. 四形态（M1..M4）

| 形态 | `kind` | 载体 | 能做 | 不能做 / 约束 |
|---|---|---|---|---|
| **M1 声明式规则** | `rules` | YAML/JSON：`on` ＋ `when` ＋ `then` | 阻断/放行、改写参数、替换结果、追加提示词段、记录、通知、改设置、触发工作流、要求审批 | **不能跑任意代码**（只能在动作集内）；必须可静态校验与干跑 |
| **M2 代码模块** | `module` | ESM 模块：`export default (api) => ({ hooks: {…} })` | 任意控制器：读状态、条件复杂、串流程 | **必须声明 `capabilities`**；失败隔离＋超时；不得直接读内核私有符号（R7） |
| **M3 脚本/工作流** | `script` | DSH workflow 脚本 / 外部命令 | 多阶段、扇出/扇入、结构化结果 | **不进提示词**；只经**公开接口**驱动框架；必须限时；结果必须结构化 |
| **M4 外部插件** | `plugin` | 额外 DSH 插件 | 扩工具、扩 UI、扩传输 | 只能消费 vmu **版本化公开服务**；破坏性变更需 bump ＋ 迁移说明 |

---

## 4. 钩子大全（**契约化**：缺任一行即门禁红）

### 4.1 DSH 底座钩子（`substrate` 列：DSH 事件/服务；签名以 00 号侦察为准）

| vmu 钩子名 | substrate | 时机 | 可否阻断 | 可否改写 | 作用域 | 默认失败策略 |
|---|---|---|---|---|---|---|
| `tools/pre-execute` | DSH `tools/pre-execute`（waterfall） | 工具派发前 | ✅ 拒绝/取消/询问 | ✅ 参数 | 成员/全局 | closed |
| `tools/post-execute` | DSH `tools/post-execute`（waterfall） | 结果归一化后 | ✅ 阻断 | ✅ 结果 | 成员/全局 | closed |
| `tools/execute` | DSH `tools/execute`（waterfall） | 派发包裹（超时/重试/计量） | ✅ | ✅ | 成员/全局 | open |
| `tools/result` | DSH `tools/result`（emit） | 结果冻结后（**只读观测**） | ❌ | ❌ | 成员/全局 | open |
| `prompt/assemble` | DSH `system-prompt/assemble`（waterfall） | 提示词装配出口 | ✅ | ✅ 段/上下文/变量 | 成员 | closed |
| `prompt/section` | DSH `systemPrompt.section/context/variable`（服务） | 段注册 | ❌ | ✅ 注册内容 | 全局→成员 | closed |
| `agent/pre-step` | DSH `agent/pre-step`（waterfall） | 一步开始前 | ✅ 拒绝/替换消息 | ✅ 消息集 | 成员 | closed |
| `agent/request` | DSH `agent/request`（waterfall） | 冻结模型调用配置 | ❌ | ✅ 配置（模型/参数） | 成员 | closed |
| `agent/request-error` | DSH `agent/request-error`（waterfall） | 请求失败重试前 | ✅ | ✅ 重试策略 | 成员 | open |
| `agent/turn-stopping` | DSH `agent/turn-stopping`（serial） | 回合即将关闭 | ❌ | ❌（副作用窗口） | 成员 | open |
| `agent/inbox` | DSH `agent/inbox/{inserted,claimed,discarded}`（emit） | 消息进出 | ❌ | ❌ | 成员 | open |
| `subagent/start` / `subagent/end` | DSH 同名（emit） | 子代理建立/结束 | ❌ | ❌ | 全局 | open |
| `session/event` | DSH `session/event`（emit，**只读**） | 会话事件追加后 | ❌ | ❌ | 全局 | open |
| `session/flush` | DSH `session/flush`（parallel） | 耐久检查点 | ❌ | ❌ | 全局 | closed |
| `fs/write-intent` | DSH `fs/write-intent`（waterfall） | 写前 | ✅ | ✅ 版本意图 | 全局 | closed |
| `settings/changed` | DSH `settings/document-updated`（emit） | 设置变更 | ❌ | ❌ | 全局 | open |
| `workflow/*` | DSH `workflow/{start,phase,log,agent-start,agent-end,end}`（emit） | 脚本流程 | ❌ | ❌ | 全局 | open |

### 4.2 vmu 内部钩子（内核在**语义时刻**触发；与 DSH 解耦，保证机制可定义）

| vmu 钩子名 | 何时 | 可否阻断 | 可否改写 | 典型用途 |
|---|---|---|---|---|
| `member/wake-before` / `member/wake-after` | 成员被唤醒前后 | ✅（before） | ✅ 提示词/模型 | 换唤醒策略、插前置检查 |
| `turn/reply-parsed` | 成员回复解析后 | ✅ | ✅ 解析结果 | 自定义回复语义、拒绝不合格回复 |
| `meeting/round-start` / `meeting/round-end` | 会议轮开始/结束 | ✅ | ✅ 议程/名单 | 换会议规则 |
| `ballot/cast` / `ballot/tally` | 投票与计票 | ✅（cast） | ✅（tally 计票口径） | 换票型/门槛/法定数 |
| `record/append-before` / `record/appended` | 归档写入前后 | ✅ | ✅ 内容/分轨 | 归档策略、指纹口径 |
| `task/assign` / `task/transition` | 分派与状态迁移 | ✅ | ✅ | 换分派与阶段机 |
| `prompt/section-assembled` | 某段装配完成 | ❌ | ✅ | 段级后处理 |
| `budget/exceeded` | 触达任一上限 | ✅ | ✅ 处置（降级/暂停） | 资源策略 |
| `pack/loading` / `pack/loaded` | 整合包装载前后 | ✅ | ✅ 覆盖 | pack 组合与冲突裁决 |
| `settle/before` / `settle/after` | 阶段收束（结题/写论文等） | ✅ | ✅ | 收束条件与产物 |

> **命名纪律**：DSH 底座钩子**沿用同名**（便于对照官方文档），vmu 内部钩子用 `域/动作[-时机]` 形式；**两者都必须在本文登记**。

### 4.3 vmu 内部钩子的**默认失败策略**与作用域（逐条；补齐 §4.2 表的语义列）

| vmu 钩子 | 默认失败策略 | 作用域 | 说明 |
|---|---|---|---|
| `member/wake-before` / `-after` | **closed** | 成员 | 唤醒前拦截应偏安全侧 |
| `turn/reply-parsed` | **closed** | 成员 | 解析结果直接影响后续，失败应拒绝而非放行 |
| `meeting/round-start` / `-end` | closed | 会议 | 影响流程推进 |
| `ballot/cast` | **closed** | 表决 | 投票完整性 |
| `ballot/tally` | **closed** | 表决 | 计票正确性 |
| `record/append-before` | closed | 成员/会话 | 归档写入完整性 |
| `record/appended` | **open** | 成员/会话 | 事后观测，失败不影响主流程 |
| `task/assign` / `task/transition` | closed | 任务 | 状态机完整性 |
| `prompt/section-assembled` | **open** | 成员 | 后处理，失败降级为"不处理" |
| `budget/exceeded` | **abort** | 会话 | 资源越界属关键路径 ⇒ 中止本轮并具名上报 |
| `pack/loading` / `pack/loaded` | closed | 会话 | 装载一致性 |
| `settle/before` / `-after` | closed | 阶段 | 收束条件必须成立 |
| `control/paused` | **open** | 会话 | 控制流是**观察面**（中间件可反应）；监听器出错**不该冻住整个运行** ⇒ 默认放行并留痕 ✓ |
| `control/resumed` | **open** | 会话 | 同上 ✓ |
| `control/heartbeat` | **open** | 会话 | 心跳纯观察 ✓；`stale` 由 `vmu.limits.wallClockMs` 判定（04 §11 已接线 ✓） |

**三态语义回顾**（§7）：`open`＝放行但留痕／`closed`＝拒绝该操作／`abort`＝中止本轮或本阶段；**任何失败都必须记审计**（谁、哪条、哪个钩子、原始错误）✓。

> **调度现实（2026-10-09 校准 ✗✓）**：上表是**登记表** ✓；**真正有生产者（`bus.emit`）的钩子**是 —— `member/wake-before|after`、`meeting/round-start|end`、`ballot/cast|tally`、`task/assign|transition`、`settle/before|after`、`prompt/assemble`、`control/paused|resumed|heartbeat` ✓。
> **已登记但当前没有生产者（7 个，诚实 ✗）**：`turn/reply-parsed`、`record/append-before`、`record/appended`、`prompt/section-assembled`、`budget/exceeded`、`pack/loading`、`pack/loaded` ⇒ **挂上它们目前不会触发** ✗（归档/预算/整合包的动作走的是工具面与内核路径 ✓）。
> **门禁**：`tests/audit-vmu-docs.test.mjs` 的钩子生产检查要求"**登记 ⇒ 有 emit 点，或被显式列入"未触发"清单**" ✓✓ —— 新增钩子不写生产者就红 ✓，而清单里混进"其实已经有生产者"的钩子同样红 ✓（防止清单腐化 ✓）。

---

## 5. M1 声明式规则：条件 DSL 与动作集

### 5.1 结构

```yaml
id: reject-debate-without-proof
on: [tools/pre-execute]
when:
  all:
    - tool: [vibe_vmu_records]      # 真机已注册的工具（`vibe_vmu_propose_verify` 等 ⛔ 未实现的名字不得用 ✗）
    - not: { subject: has_locked_formal_proof }   # 由内核提供的**具名谓词**
then:
  - deny:
      code: VMU_INVALID_ARGUMENT
      message: "只有已被正式证明或证伪、且已定稿（locked）的对象才能进入表决"
      hint: "先由有权限者登记 formal_proof"
```

### 5.2 谓词（**安全白名单**，全部由内核实现，规则只能组合）

| 谓词 | 语义 | 例子 |
|---|---|---|
| `tool` / `not.tool` | 工具名匹配（列表或通配） | `tool: [vibe_vmu_*]` |
| `member` / `role` / `phase` | 调用者身份与阶段 | `role: [chair]` |
| `arg` | 参数匹配（路径/正则/存在性） | `arg: { path: track, eq: rejected }` |
| `setting` | 设置当前生效值 | `setting: { key: vmu.limits.toolCallsPerTurnCap, gt: 0 }` |
| `count` | 计数（本回合/本阶段/全局） | `count: { of: tool_calls, member: self, gte: 12 }` |
| `subject` | **内核具名状态谓词**（如 `has_locked_formal_proof`、`in_frozen_ballot`） | 由 03 号契约登记 |
| `match` | 文本/正则（对提示词或结果） | `match: { on: prompt, re: '…' }` |
| `all` / `any` / `not` | 组合 | 见上例 |

> **禁止**在 M1 里出现任意表达式/脚本（安全与可静态校验）；需要复杂逻辑 ⇒ 用 M2。

### 5.3 动作集（M1 可用的全部动作；每项在 03 号契约有签名）

| 动作 | 语义 | 备注 |
|---|---|---|
| `deny` / `allow` | 阻断/放行（具名拒必须给 `code`＋`message`） | 拒收必须**具名**（R11） |
| `cancel` | 取消调用（与 deny 的区别：不计入"被拒"统计） | 用于内部短路 |
| `ask` | 要求审批（走 DSH 审批面） | 需 `vmu.safety.approvalRequired` 配合 |
| `rewriteArgs` | 改写工具参数 | 必须声明 in/out 契约 |
| `replaceResult` | 替换结果（仅 `post-execute`） | 必须标记 `replacedBy`（审计） |
| `appendPrompt` | 追加提示词段（仅 `prompt/*`） | 段名＋内容或文件引用 |
| `record` | 写归档/分轨（走 07 号契约） | 支持 `track` |
| `notify` | 发通知（群聊/日志） | 不进模型上下文（除显式声明） |
| `setSetting` | 改设置（受权限与热改等级约束） | 必须在审计里可见 |
| `triggerWorkflow` | 触发 M3 脚本 | 需 `script` 引用 |
| `annotate` | 给对象/结果打标记（审计可追） | 不改语义 |

---

## 6. M2 / M3 / M4 规格（**可照抄；签名与宿主接缝已按实现校准 ✓**）

### 6.1 M2 代码模块（**怎么挂上去 ＋ 模块形状**）✓

**声明**（插件行的 `config.modules` ✓，见 12-§2.1）：
```yaml
        modules:
          - 'D:/work/modules/meeting-policy.js'      # 路径 ⇒ 动态 import，取命名导出
          # 或内联：{ id: meeting-policy, module: { meta, capabilities, hooks } }
```

**模块文件（真实现形状 ✓）**：
```js
// modules/meeting-policy.js
export const meta = { id: 'meeting-policy', apiVersion: 1 }        // 必填；id 必须与声明一致 ✓
export const capabilities = ['read-args', 'deny', 'appendPrompt'] // 必填；未声明就使用能力 ⇒ 具名拒 ✓
export const hooks = {
  'meeting/round-start': async (ev) => {
    // 读设置：门面对象上给的是 `api`（**不是** `ev.setting` ✗✓）：{ hooks, log, kernel, setting }
    if (ev.api && typeof ev.api.setting === 'function' && ev.api.setting('vmu.meetings.quorumRule') !== 'm-unanimous') return   // 放行必须显式 return ✓
    // 事件的**载荷**是钩子自己的：`meeting/round-start` 给 { id, kind, agenda, round } ✓（**没有** roster ✗）
    if (Number(ev.round) > 1) return { deny: { code: 'VMU_NOT_PERMITTED', message: '示例：只允许第一轮' } }
    return { appendPrompt: [{ section: 'meeting-policy', text: '本轮只允许…' }] }
  },
}
```
**硬要求**：`meta.id`／`apiVersion`／`capabilities`／`hooks` 缺一即拒 ✓；钩子名必须在**登记表**内 ✓；**必须显式 return**（返回 `undefined` ＝ 放行 ✓，异常按 §7 的失败策略 ✓）；**声明外能力**被使用 ⇒ 运行时**具名拒** ✓。

### 6.2 M3 脚本/工作流（**真实现：`file` ＋ 结构化 JSON 结果**）✓

**声明**（插件行的 `config.scripts` ✓；声明了才注册 `vibe_vmu_script` ✓）：
```yaml
        scripts:
          - id: nightly-audit
            file: node                                  # 交给宿主解析的可执行文件 ✓（不是脚本路径）
            args: ['-e', 'console.log(JSON.stringify({ok:true,summary:"audit done",findings:[]}))']
            timeoutMs: 60000
            failure: open
```
**约定（真实现 ✓）**：脚本的 **stdout 必须是 JSON**（至少含布尔 `ok` ✓）—— 自由文本会被**具名拒** ✓；`file` 是**可执行文件**（宿主 `resolveExecutable` 解析 ✓），**没有** `script:` 字段 ✗；结果**只回调用方**、不进提示词 ✓；超时 ⇒ `timedOut` 且桥转 `VMU_JOB_TIMEOUT` ✓。

### 6.3 M4 外部插件 / 整合包（**真实消费面**）✓

- 只消费**已发布服务**（03-§2 表①：`vmu.library`／`members`／`tasks`／`prompt`／`middleware`／`store`／`work`／`math_computation` ✓）；**内部句柄**（`kernel.bus` 等）**不是**公开面 ✗ ⇒ 不能在 `requires` 里要求它们 ✓；
- 声明方式＝ pack 的 `requires: [{ service, minVersion }]` ✓（**数组**，不是 map ✗），装载期与注册面比对 ⇒ 缺失/过旧**具名列出** ✓；
- **不得**读内核私有符号、不得假设文件布局（除 07 号公开契约 ✓）；`apiVersion` bump ＋ 迁移说明（13 号 ✓）；
- 示例见 `packs/institute-min.js`（**唯一随包真实清单** ✓）与 10-§3 ✓。

---

## 7. 失败语义（**不许炸框架**）

| 策略 | 语义 | 适用 |
|---|---|---|
| `open` | 中间件出错 ⇒ **放行**（当作没挂），但**记审计＋通知** | 观测/优化类 |
| `closed` | 中间件出错 ⇒ **拒绝该次操作**（安全侧） | 门禁/准入类（默认给安全类钩子） |
| `abort` | 中间件出错 ⇒ **中止本轮/本阶段**并具名上报 | 关键流程 |

**统一实现**：包裹层捕获异常/超时（每钩子预算 `vmu.middleware.hookTimeoutMs`），失败计数进入**熔断**（连续失败 N 次 ⇒ 自动禁用该条并通知，避免拖死全所）；**任何失败都必须留痕**（谁、哪条、哪个钩子、原始错误）。

---

## 8. 作用域

```yaml
scope: { member: ['m-1','m-2'] }             # 成员
# 或
scope: { role: ['reviewer'], phase: ['review'], session: 'self' }   # 角色/阶段/会话
```
- 作用域**只在允许的维度**内组合（成员×角色×阶段×会话）；未声明＝全局；
- 由**总线**负责路由（中间件作者不必理解 DSH 的 `Scoped<Agent>` 规则）。

---

## 9. 校验、干跑与观测（**实现现状，2026-10-09 校准 ✓**）

1. **静态校验（真实现）**：装载期由 `kernel/rules.js` 的 `validate(rule)` ＋ `kernel/loader.js` 的 `validateModule(entry, module)` 执行 ⇒ id 唯一、`on` 在登记表内、谓词白名单、动作白名单、**具名 subject 谓词存在**（本轮补齐：此前该检查只藏在 `toBusEntries` 内 ✗✓）、`failure`/`order`/`capabilities` 合法 ✓。
   **工具面（本轮新增 ✓）**：`vibe_vmu_middleware {action:'validate', rule:'<JSON>'}` ⇒ `{ok, problems, vocabulary}`；`{action:'validate', id:'<已声明 id>'}` ✓。
2. **干跑（真实现 ✓）**：`vibe_vmu_middleware {action:'dryRun', id:'<id>'|rule:'<JSON>', samples:'[<事件>…]'}` ⇒ `{ok, evaluated, hits, would}`，**对总线零副作用**（`hits` 不增、条目不变，仅 `rules.stats.dryRuns` 前进 ✓）；另有全局开关 `vmu.middleware.dryRun=true`（总线只报不做 ✓）。
   **M2 例外（诚实 ✗）**：代码模块的干跑需要真实事件载荷，**没有**逐模块 dryRun 入口 ⇒ 只做装载期校验 ✓。
3. **观测**：`vibe_vmu_status` ⇒ `bus.entries[]`（启用/顺序/命中/连续失败/熔断 ✓）、`rules.stats`、`loader.status()`、`bridge.status()`（含 **`turnCalls`／`budgetRefusals`** ✓）、以及 **`auditTail`（最后 20 条审计 ✓）**；每次拦截经 `traceId` 串起"事件→命中规则→动作→结果" ✓。
   **框架级上限不走中间件**（2026-10-09 校准 ✓）：`vmu.limits.toolCallsPerTurnCap > 0` 时，**宿主钩子桥会自行挂上 `tools/pre-execute` 与 `agent/turn-stopping`** ✓ —— 于是它在**没有任何中间件**的配置里也照样强制 ✓✓（此前该上限只是声明、无人执行 ✗），超限时**具名拒** `VMU_RESOURCE_BUDGET`（文案含"已用 N / 上限 M" ✓），回合结束时计数归零 ✓。
4. **禁用回归**：禁用后行为回到"无该中间件"的基线 ✓（`{action:'disable'}` ⇒ `{action:'enable'}`，有场景 ✓）。

---

## 10. 与整合包（pack）的组合（**实现现状 ✓**）

- pack 由 profile 行的 `config.packs`（随包 id 或内联 manifest ✓）在**装载期**引入，向中间件清单**追加**条目 ✓（`source: pack:<id>` ✓）；
- **冲突裁决（已裁 O4 ✓）**：**检测即报错、不静默覆盖**；只有显式 `vmu.packs.allowOverride` 才允许覆盖 ✓；
- pack 可声明 `requires`（`[{service,minVersion}]` ✓ 与注册面比对 ✓）；`conflicts` **尚未被读取** ✗（真实冲突面是"已应用＋设置重叠＋总线 id 重复"三类 ✓）；
- **载入时机（已定 ✓）**：**boot 期**（`config.packs`）＋ 运行期可用 `vibe_vmu_pack {action:'plan'|'apply'|'unload'}` 处理**内联 manifest** ✓；H2 设置与之的交互见 04-§5 ✓。

---

## 11. 配方库（可直接照抄；12 号文档给完整上下文）

1. **表决前必须有正式证明**（M1）：§5.1 例；
2. **冻结期禁止推进发言轮**（M2 或 M1 谓词 `in_frozen_ballot`）：`meeting/round-start` 命中即 `cancel`；
3. **单回合工具预算**（M1）：`on: tools/pre-execute` ＋ `count.gte` ⇒ `deny(VMU_RESOURCE_BUDGET)`；
4. **越限降级**（M2）：`budget/exceeded` ⇒ 暂停新建成员＋通知；
5. **提示词按角色覆盖**（M1 `appendPrompt` ＋ 06 绑定）；
6. **归档分轨强制**（M1 `record` 动作：`track` 由 `arg` 推导）；
7. **论文阶段门禁**（M2）：`settle/before` 检查"每条结论都有出处 id"。

---

## 12. 门禁（本文档的"可验收判据"）

1. **钩子登记完整性**：代码里每个钩子触发点 ↔ 本文表格**一一对应**（缺一行即红）；
2. **四形态各 ≥1 可跑示例 ＋ ≥1 反向变异族**（禁用后回基线）；
3. **失败语义三态**各有场景（异常注入 ⇒ open/closed/abort 行为可验）；
4. **干跑无副作用**断言（dry-run 前后状态哈希一致）；
5. **M1 能力边界**：M1 里出现任意代码 ⇒ 静态拒装；
6. **M2 能力声明**：声明外能力被使用 ⇒ 运行时具名拒 ＋ 审计；
7. **公开接口版本**：M4 消费的接口必须有 `apiVersion`，缺失即拒装。

---

## 13. 未核项

- **DSH 底座钩子的精确签名与 mode**：本文表以 `design/00` 侦察（活宿主 78 事件目录 ＋ 磁盘 `.d.ts` 双证据）为准；其中 `agent/turn-stopping`、`tools/result` 等的**具体副作用语义未逐条实测**；
- **M3（脚本/工作流）桥的执行语义**（`workflow/*` 事件可见性、脚本读写权限边界）**未核** ⇒ 需 P4 实测；
- **能力清单（`capabilities`）的运行时强制方式**未定（谁校验、越权如何具名拒）；
- **条件 DSL 谓词全集**（尤其 `subject` 具名状态谓词）需与 03-§4 同步扩展 ⇒ 现仅首批。

> **未核登记处**：以上各项已并入 **14-§2（U1–U12）** 与 **14-§1（O1–O7，均已裁定为 D13）** ✓。
