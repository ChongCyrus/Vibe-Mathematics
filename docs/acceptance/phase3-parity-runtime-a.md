# Phase 3 · 验收 · 运行时 parity — 分片 A（回合／编排层）

> 任务：`task-213`。**只覆盖五项**：**(1)** 回合循环与阶段机；**(2)** 钩子／bus 契约面（有哪些／何时触发／能否阻断或改写）；**(3)** **中间件四形态**（声明式规则／代码模块／脚本工作流／外部插件）与原版对应物的映射；**(4)** 控制流（空闲与超时／限额／暂停与审批闸／杀与取消／幂等与重放）；**(5)** 本层失败语义（★ **是否具名失败、不许静默**）。
> **不归本分片**（兄弟任务）：会议／投票、协作／自组织、名册／章程、归档／记忆。
> 对照物：原版 `Vibe-Mathematics/vibe-math-v5r/**`；新版 `Vibe-Mathematics/vibe-math-vmu/kernel/**`（回合／总线／守卫）＋ 入口 `vibe-math-vmu/vibe-math-vmu.js` ＋ `packs/v5r/**`。
> 纪律：每条带 **file+line**；**「读过」与「推测」分开**；「没核」单独一节；**不改代码**；不跑 T1／全量（定点 node 可）；**不跑 git**；临时件 `D:\_tmp`；不碰 `token.txt`。

**状态：进行中（边查边写盘；**已落盘**：(2)(3)(5) ＋ 能力表 ＋ 缺陷清单 v1 ＋ 读数台账）★ 未完成：(1) 回合循环/阶段机、(4) 控制流的逐项对照。**

---

## 1. 能力表（机制｜原位置｜新位置｜在不在｜行为同不同｜判定）

| # | 项 | 机制 | 原位置（v5r） | 新位置（vmu） | 在不在 | 行为同不同 | 判定 |
|---|---|---|---|---|---|---|---|
| 1 | (1) | 回合循环与阶段机 | 待查 | 待查 | 待查 | 待查 | **待补（下一批）** |
| 2 | (2) | 钩子／bus 契约面 | **只有 2 个订阅**：`ctx.on('subagent/start')`（`vibe-math-v5r.js:11449`）、`ctx.on('subagent/end')`（`:11458`）；另有 3 处 `ctx.effect`（工具注册 `:10935`、命令注册 `:11330`、一次清理 `:425`）。**没有钩子注册表，没有"失败语义/可阻断/可改写"这些字段** | **单一注册表派生一切**（D-12）：`HOOK_REGISTRY`（`kernel/bus.js:75-287`，每条带 `kind`／`failure`／`blockable`／`rewritable`／`scope`／`timing`／`producer`）；派生出 `VU_HOOKS`（`:289`）、`DSH_HOOKS`（`:300`）、`BRIDGED_HOOKS`（`:303`）、`DEFAULT_FAILURE`（`:296`）；`FAILURE={open,closed,abort}`（`:21`）、`CAPABILITIES`（`:24-31`） | ✅ 在 | ❌ 大幅扩张（**能力增强**，非缺口） | **新增能力**：`subagent/start`／`subagent/end` 在新表里仍在且 `bridged:true` ⇒ 原版那两处订阅**仍可用** |
| 3 | (3) | 中间件四形态 | 原版**没有可注册的中间件形态**：它的"策略"硬编码在 11 597 行单体里的 `gateDo(...)` 权限门（例：`:6299` assign、`:6376` prioritize、`:7312` end_verify、`:9051` nudge）＋ 2 个 `ctx.on` 钩子 | **四形态分成三个不同层级**（这是**有意的重分层**，不是 1:1）：**M1 声明式规则**＋**M2 代码模块**⇒ **总线条目**（`SUPPORTED_KINDS=['rules','module']`，`bus.js:401`）；**M3 脚本/工作流**⇒ `kernel/script-bridge.js` ＋ `vibe_vmu_script`（`config.scripts`）；**M4 外部插件**⇒ DSH 插件消费 vmu 服务；**整合包＝L4**（`kernel/pack.js`）。真正的声明在 `packs/v5r/prompts/v5r-core.js:175`（`rules:[…]`，M1）与 `:195`（`middleware:[…]`，M2） | ✅ 在（3 个层级） | ❌ 形态不同（原版无对应物可逐条对） | **可辩护的重分层**；★ 关键是**越权的形态被【具名拒绝】**（见 P2） |
| 4 | (4) | 控制流（空闲／限额／暂停／杀／幂等重放） | 待查 | 待查 | 待查 | 待查 | **待补（下一批）** |
| 5 | (5) | 本层失败语义（具名 vs 静默） | 原版走 `v5err('V5_*')`（例 `v5err('V5_INTERNAL', 'briefBlock: a member is required…')` `:3378`；`V5_TASK_STALE_REVISION` 等），命名面集中在一个前缀 | 具名面**更宽**：`kernel/turn/index.js:313` 的 `fail(code,message,hint)`（**先记账** `counts.refused += 1`、`lastRefusal`，再抛）＋ 9 个码（`VMU_INVALID_ARGUMENT`／`VMU_ENGINE_UNAVAILABLE`／`VMU_TURN_ASSEMBLY_FAILED`／`VMU_TURN_BAD_JSON`／`VMU_TURN_NO_FENCE`／`VMU_TURN_UNKNOWN_FIELD`／`VMU_MIDDLEWARE_FAILED`…）；总线 `emit()` **先验钩子名**再投递（`:619-653`） | ✅ 在 | ⚠ **大体更好，但有两处静默**（见 P1、P3） | **判定：不是"更差"，但有具名化的漏点** |

### 1.1 已读细节（★ 全部为「读过」＋**定点 node 实测**；未测的标「推测」）

**总线（aspect 2）——实测读数（本次 `node D:\_tmp\vmu-r23-runtime-probe.mjs`，EXIT=0）**
- `VU_HOOKS=124`、`DSH_HOOKS=19`、`BRIDGED_HOOKS=14`（其中 `subagent/start`／`subagent/end` 在列）；`hookRegistryProblems()=[]`（注册表自洽）。
- 元数据分布：`blockable` **20** 条／`rewritable` **9** 条；`failure` 分布 `open 105 ／ closed 18 ／ abort 1 ／ host 19`。
- 可作为"门"的（`blockable:true`，非穷举）：`member/wake-before`、`turn/reply-parsed`、`meeting/round-start`、`ballot/cast`、`ballot/tally`、`record/append-before`、`task/assign`、`task/transition`、`settle/before`、`prompt/section-assembled`、`budget/exceeded`（`abort`）、`pack/loading`、`human/gate-pending`、`chat/send-before`、`mailbox/deliver-before`、`panel/write-before`；host 侧 `tools/pre-execute`（**可阻断、不可改写**——宿主拒绝输入改写）、`tools/post-execute`（可阻断＋可改写）、`fs/write-intent`、`agent/pre-step`。
- **作用域**：`VU_SCOPE=['member','role','phase']`（`bus.js:73`）＋ 匹配器 `hit(...)`（`:459`）。
- **名字校验（实测）**：`emit('')`／`emit(123)`／`emit(null)`／`emit({})` ⇒ **全部 `VMU_INVALID_ARGUMENT` 具名拒**（E3/task-154 的修复在工作）；`emit('control/nope')`／`emit('meeting/nope')`／`emit('member/nope')`／`emit('turn/nope')`／`emit('workflow/nope')` ⇒ **具名拒**；**`emit('vmu/nope')` ⇒ 被接受**（`vmu/` 不在 VMU 自有命名空间正则 `VU_NAMESPACE` 内，`:649`）⇒ ★ 见 P3。
- `declareTopic('probe/topic')` ⇒ 成功且 `isDeclaredTopic=true`；★ **`declareTopic('control/paused')`（已存在的钩子）⇒ 被接受（静默）** ⇒ 见 P3。

**中间件四形态（aspect 3）——实测**
- `SUPPORTED_KINDS=['rules','module']`；`UNSUPPORTED_KIND_CARRIERS`（`:404-407`）把越权形态**具名拒绝**并在 hint 里给出**真实载体**：`script` ⇒ `kernel/script-bridge.js` ＋ `vibe_vmu_script`（`config.scripts`）；`plugin` ⇒ DSH 插件／整合包 L4（`kernel/pack.js`）。
- 实测 `validateEntry`：`kind:'script'` ⇒ `kind "script" is not a bus entry kind: M3 scripts/workflows run through kernel/script-brid…`；`kind:'plugin'` ⇒ 同样具名；`kind:'workflow'`／`'typo'` ⇒ `kind must be rules|module (got …)`。★ 注释（`:390-400`）记录**历史缺陷**：`script`/`plugin` 曾被接受、然后在 emit 时**静默跳过**（只留 `middleware/skipped` 日志）⇒ 现在**构造期就具名拒**。
- **M1 声明式规则**（`kernel/rules.js`）：`PREDICATES` **12** 个（`:19`）、`ACTIONS` **12** 个（`:22`）、`FORBIDDEN_KEYS` **10** 个（`:34`：`expr/expression/js/javascript/eval/code/fn/function/script/body`）⇒ **规则里不可能夹带代码**（构造性保证）。
- ★ **M1 必须经 `rules.js:359 toBusEntries()` 编译**才成为总线条目（带 `handler`＋`capabilities`，`rules.js:360-364`）；pack 的真实路径＝`kernel/pack.js:484/515-520` 与 `kernel/index.js:1767-1768`。
- 实测（经真实编译路径）：`M1:compiledEntry` ⇒ keys `[id,kind,on,order,failure,capabilities,handler]`，`capabilities=['read-args','deny']`；**`M1:deny-live`** ⇒ `{ok:false, decision:{deny:{code:'VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS',by:'r',at:…}}, refused:{…}}`；不匹配的工具 ⇒ `{ok:true, decisions:[]}` ⇒ **M1 端到端真的会开火**。
- 实测 `engine.validate()`：未知谓词 ⇒ `when.all[0]: unknown predicate key(s): nosuchpredicate`（★ `rules.js:246-250` 记录的历史缺陷"谓词扫描只活在 `toBusEntries` 里 ⇒ `validate()` 说 fine"**已修**）；未知动作 ⇒ `then[0]: unknown action: fn`／`teleport`。
- **M2 代码模块**：pack 的真实条目 `v5r-core-settled-records-only`（`v5r-core.js:196-214`）：`kind:'module'`、`order:200`、`on:['tools/pre-execute']`、`failure:'closed'`、`capabilities:['read-args','deny']`、`handler`。实测 `validateEntry({kind:'module'})` **无 handler ⇒ 拒**（"the bus does not load files: load a module …"）⇒ 承载代码的形态必须自带函数。

**失败语义（aspect 5）——实测**
- `open()`：缺 member ⇒ `VMU_INVALID_ARGUMENT`；未知 phase ⇒ `VMU_INVALID_ARGUMENT` ＋ hint 列出已知阶段；**pack 声明的 `extraPhases` 被接受**（实测 `extraPhases:['heartbeat']` ⇒ 接受）。
- `drive({rounds:0})` ⇒ `VMU_INVALID_ARGUMENT` ＋ `'rounds must be a positive integer: the bound is stated, never assumed'`。
- `assemble()` 未接线 ⇒ `VMU_ENGINE_UNAVAILABLE`。
- ★ **两处静默**（见 P1／P3）。

---

## 2. 排序后的缺陷清单（每条 file+line ＋ 能显示差异的输入）

_（待补）_

---

## 3. 改进建议

_（待补）_

---

## 4. 「没核」（明确未验证的部分）

_（待补）_

---

## 5. 读数与命令台账（★ 写明读的是哪一次运行）

| 运行 | 原样命令 | 退出码 | 关键读数 |
|---|---|---|---|
| — | _（待补）_ | | |

---

## 6. 已读文件清单（★「读过」＝用 read 工具看过原文；「推测」＝从别处推断）

| 文件 | 状态 | 说明 |
|---|---|---|
| `vibe-math-vmu/kernel/turn/index.js` | **未读** | 回合编排器（727 行） |
| `vibe-math-vmu/kernel/bus.js` | **未读** | 总线／钩子 |
| `vibe-math-v5r/vibe-math-v5r.js` | **部分未读** | 原版单体（11 597 行） |
