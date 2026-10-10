# vmu 03 · 内核接口契约（公开面登记处）

> 状态：**草案 v0.1**（工具/服务清单为**首版提案**，待 `01-v5r-reuse-map.md` 合并后定稿）
> 上位：`01-philosophy.md`（R6/R7/R11/R13）、`02-architecture.md`（内核 A–I）
> 规则：**本文件登记的东西才是"公开面"**；未登记的内部实现**任何人不得依赖**（含 pack、中间件、外部插件）。

---

## 0. 三条铁律

1. **登记即公开，公开即契约**：本文件没有的符号，上层不许用；用了 ⇒ 静态门红。
2. **命名统一**：工具/服务/耐久键/错误码一律 `vibe_vmu_*` / `vmu.*` / `VMU_*`（D6）。
3. **版本化**：每个公开面带 `apiVersion`（§7）；破坏性变更 ⇒ bump ＋ 迁移说明（13 号文档）。

---

## 1. 公开面总览（七张表）

| # | 面 | 面向谁 | 在本文件的位置 | 相关文档 |
|---|---|---|---|---|
| 1 | **Services**（宿主内服务） | M4 插件、其它 DSH 插件、框架自身 | §2 | 02-§3 |
| 2 | **Tools**（模型可调用） | 成员/主代理（模型） | §3 | 12 号使用说明 |
| 3 | **Prompt sections / variables** | 提示词作者、pack | §4 | 06 号 |
| 4 | **Hooks**（可介入时机） | M1/M2 中间件 | §5（索引；全表在 05-§4） | 05 号 |
| 5 | **Durable keys ＋ 文件布局** | pack、脚本、外部工具、运维 | §6 | 07 号 |
| 6 | **Error codes** | 所有上层 | §8 | 11 号门禁 |
| 7 | **Settings keys** | 使用者 | §9（索引；全表在 04-§4） | 04 号 |

---

## 2. Services（**按实际发布面重写，2026-10-09 ✓**）

**① 真正**发布**的服务（`kernel/index.js` 的 `registry.register` ✓；括号内为出现条件 ✓）**

| 服务键 | 职责 | 主要方法（**与代码一致** ✓） | apiVersion |
|---|---|---|---|
| `vmu.library`（有 `root` ✓） | 归档与记忆 | `append(rec,{member?})`、`record(member,track,text)`、`list(filter)`、`expand(id,{capBytes})`、`storedFingerprint(id)`、`fingerprint(kind,parts)`、`truncationReport()`、`status()` | 1 |
| `vmu.members` ✓ | 成员与角色**槽位** | `roles()`、`roster()`、`hire({id,slot})`、`assignRole(id,slot)`、`end(id,reason)`、`wake(id,ask,{role?,phase?})`、`may(id,permission)`、`status()` | 1 |
| `vmu.tasks` ✓ | 任务与阶段 | `create({title,…})`、`assign(id,who)`、`transition(id,to,{reason})`、`list(filter)`、`stage()`、`advance({to,reason})`、`rollback({reason})`、`status()` | 1 |
| `vmu.prompt` ✓ | 提示词管线 | `register(section)`、`assemble(ctx)`、`override(section,text,by)`、`rollback(section)`、`snapshot(scopes)`、`bindToHost(adapter)`、`setState(text)`、`status()` | 1 |
| `vmu.middleware` ✓ | 中间件总线（观测/启停/校验） | `status()`、`entries()`、`disable(id,reason)`、`enable(id)`、`setDryRun(v)`、`validateEntry(entry)` | 1 |
| `vmu.store`（有 `root` ✓） | 耐久端口 | `open(expected)`、`read(key)`、`write(key,value)`、`patch(key,fn)`、`migrate()`、`import(snapshot)`、`stats()` | 1 |
| `vmu.work`（有 `root` ✓） | **在途工作台账** | `start({owner,kind,objective})`、`settle(id,{outcome})`、`interrupt(id,reason)`、`recover({reason})`、`list()`、`pending()`、`interrupted()`、`status()` | 1 |
| `math_computation`（声明了数学意图 ✓） | 继承的数学工具（D14 原名 ✓） | 由共享模块注册（`op=probe\|run\|receipt\|install` ✓） | 1 |

**② 未发布：内核**内部句柄**与**工厂（**不是服务** ✗ —— 草案把它们当服务写了 ✗）**

| 名字 | 真实形态（✓） | 说明 |
|---|---|---|
| `kernel.bus` / `kernel.rules` / `kernel.loader` / `kernel.bridge` / `kernel.registry` | 内核对象上的**只读句柄** ✓ | **未**注册进注册面 ✗ ⇒ pack 不能 `requires` 它们 ✗ |
| `kernel.meeting(opts)` / `kernel.ballot(opts)` | **逐对象工厂** ✓ | 会议/表决是**原语**：每场会/每次表决一个实例 ✓（草案的 `vmu.meetings` 服务**不存在** ✗） |
| `kernel.control()` / `pause` / `resume` / `stop` / `beat` | 控制面 ✓（§3.1 的 `vibe_vmu_control` ✓） | 草案的 `vmu.kernel`（`state/pause/resume/settle/health`）**不存在** ✗ |
| `kernel.setSettingsValue` / `unsetSettingsValue` / `settingsSnapshot` / `settingDef` ＋ `settings/schema.js` 的原语 | 设置**原语** ✓ | 草案的 `vmu.settings` 服务包装**不存在** ✗（观测经 `status().settings.resolved` ✓） |
| `createPackLoader({kernel,registry})` | **装载器工厂**（入口持有 ✓） | 草案的 `vmu.packs` 服务**不存在** ✗（工具面是 `vibe_vmu_pack` ✓） |
| 预算/上限 | **分散在 `members`／`tasks` 的容量检查里** ✓ | 草案的 `vmu.budget` 服务**不存在** ✗（`VMU_RESOURCE_BUDGET` 由它们抛出 ✓；`budget/exceeded` 钩子**无生产者** ✗，见 05-§4.3 ✓） |

### 2.1 方法签名（**已实现者按代码；未实现者一律标 ⛔**）

> 统一约定：所有方法返回 `{ ok: true, ... }` 或 `{ ok: false, code, message, hint? }`；**带副作用者必须返回"发生了什么"的可审计摘要**；每个服务由 `apiVersion` 版本化（D13-O3）；**异步侧一律 `await`** ✓。

| 服务 | 方法（参数 → 返回；**已核** ✓） | 具名拒 |
|---|---|---|
| `vmu.library` | `fingerprint(kind,parts)→hex`（**单点计算** ✓）／`append(rec,{member?})→{ok,id,fingerprint,deduplicated}`／`record(member,track,text)→{ok,file}`／`list(filter)→Head[]`（**七键、不含正文、行数上限＋计数** ✓）／`expand(id,{capBytes})→{ok,head,body,truncated,path}`／`storedFingerprint(id)→{ok,id,fingerprint}`（**读回而非重算** ✓）／`truncationReport()`／`status()`（**异步** ✓） | `VMU_NO_SUCH_OBJECT`／`VMU_INVALID_ARGUMENT` |
| `vmu.members` | `roles()`／`roster()`／`hire({id,slot})`／`assignRole(id,slot)`／`end(id,reason)`／`wake(id,ask,{role?,phase?})`（**注入接缝**；缺则具名拒 ✓）／`may(id,permission)`（**只做包含判断** ✓）／`status()` | `VMU_RESOURCE_BUDGET`（**报当前数与上限** ✓）／`VMU_NO_SUCH_OBJECT`／`VMU_STATE`／`VMU_ENGINE_UNAVAILABLE` |
| `vmu.tasks` | `create({title,objective?,owner?,deps?,priority?})→{ok,id,state}`／`assign(id,who)`／`transition(id,to,{reason})`／`list()`／`stage()`／`advance({to,reason})`（**先过 `stageGate`** ✓）／`rollback({reason})`／**`brief(id)`／`briefOf(id)`／`clearBrief(id)`**（任务简报＝给该任务负责人的执行流程 ✓）／`history(id?)`／`status()` | `VMU_STATE`（依赖未满足／非法转换／**暂停中** ✓）／`VMU_RESOURCE_BUDGET` |
| `vmu.prompt` | `register(s)→entry`／`assemble(ctx)→{ok,text,sources[],truncation[],at}`／`override(section,text,by)→{ok,previous}`／`rollback(section)`／`snapshot(scopes)`／`bindToHost(adapter)`／`setState(text)`／`status()→{sections[],bindings,truncation[],middlewareAppends[]}` | `VMU_NOT_PERMITTED`／`VMU_INVALID_ARGUMENT`／`VMU_NO_SUCH_OBJECT`／`VMU_ENGINE_UNAVAILABLE` |
| `vmu.middleware` | `status()→{dryRun,hookTimeoutMs,breakerThreshold,entries[],hooks[]}`／`entries()`／`disable(id,reason)`／`enable(id)`／`setDryRun(v)`／`isDryRun()`／`emit(hook,payload,{scope?,traceId?,member?,role?,phase?})→{ok,decisions[],traceId,refused?,aborted?,decision}`／`on(entry,handler)→id`／`add(entry)→entry`／`trace(traceId)→Trace[]`／`wrapHostWaterfall(next)→async(payload)` | `VMU_MIDDLEWARE_FAILED`／`VMU_MIDDLEWARE_REJECTED`／`VMU_INVALID_ARGUMENT` |
| `vmu.store` | `open(expected)→{opened,version,migration?}`／`read(key)→Value`（**克隆** ✓）／`write(key,value)→{ok,key,version,changed}`／`patch(key,fn)→同左`（**fold 内函数式** ✓）／`subscribe(key,fn)→Disposer`／`migrate()`／`export()→Snapshot`／`import(snapshot)`／`stats()` | `VMU_STORE_FAILED`／`VMU_STORE_MIGRATION`／`VMU_INVALID_ARGUMENT`（未登记键 ✓） |
| `vmu.work` | `start({owner,kind,objective})→{ok,entry}`／`settle(id,{outcome})→{ok,settled,remaining}`／`interrupt(id,reason)`／`recover({reason})→{ok,recovered,entries[]}`／`list()`／`pending()`／`interrupted()`／`status()` | `VMU_STATE`（**暂停中** ✓）／`VMU_NO_SUCH_OBJECT`／`VMU_INVALID_ARGUMENT`／`VMU_STORE_FAILED`（store 未 open ✓） |

**三条接口纪律**：① **能力缺失用 `ok:false` ＋ 具名码**，不得抛裸异常给上层 ✗（框架内部异常按中间件失败策略处置 ✓）；② **返回对象一律可 JSON 序列化**（便于审计与场景比对 ✓）；③ **幂等性**：`read/list/status/tally` 幂等；`set/append/cast` 等写操作**必须能被审计去重**（同一 `traceId` 不重复生效 ✓——沿用 v5r 的幂等纪律 ✓）。

**约定**：所有方法**只返回结构化数据**（无副作用者返回快照）；**带副作用者必须返回"发生了什么"的可审计摘要**；任何拒绝都必须带 `{ok:false, code, message, hint?}`。

---

## 3. Tools（`vibe_vmu_*`）

> 目标：**能力齐备但不内置策略**；工具只回答"能做"，"是否/何时做"由中间件与提示词决定。
> **别名层**：pack 可声明映射（如 `vibe_v5_poll_vote → vmu.tasks`），使旧语料/旧提示词可复用（D6）。
> **登记纪律（2026-10-09 真机校准 ✗✓）**：本表 = 宿主**实际注册**的集合，唯一真值是 `vibe-math-vmu/host.js` 的 `TOOL_NAMES` ✓；**未实现的计划工具必须标注 `⛔ 未实现`**，且文档任何地方不得把未实现的工具写成操作步骤 ✗ —— 这条由 `tests/audit-vmu-docs.test.mjs` 的 **F 组**断言强制 ✓（加此断言时，本文件原有 20 个工具名里 **15 个是幻影** ✗）。

### 3.1 已实现（真机已验证的 5 个 + 本轮新增 1 个；零配置时只有第 1 个 ✓）

| 工具 | 语义 | 参数（宿主视图） | 出现条件 | 具名拒 |
|---|---|---|---|---|
| `vibe_vmu_status` | 只读总览：接缝/注册面/中间件条目/生效整合包/**实例身份**/`settings.resolved`/`auditTail`/`prompt` | —（对象 schema，无必填） | `vmu.core.enabled !== false` | `VMU_MIDDLEWARE_FAILED` |
| `vibe_vmu_set` | 改一个设置；未声明的键一律具名拒；回执含**热改等级对应的生效时机**与来源 | `key`(必填)、`value` | 有声明键时 | `VMU_INVALID_ARGUMENT`、`VMU_NOT_PERMITTED`（H3）、`VMU_PACK_CONFLICT` |
| `vibe_vmu_middleware` | 中间件：`action=list\|disable\|enable\|validate\|dryRun`（**validate/dryRun 只读、无副作用** ✓） | `action`(必填，枚举)、`id`、`rule`(M1 规则 JSON)、`samples`(事件样本 JSON 数组) | 有声明条目**或**总线已有条目 | `VMU_INVALID_ARGUMENT`、`VMU_NO_SUCH_OBJECT` |
| `vibe_vmu_records` | 记录面：`action=list\|expand\|append` | `action`(必填)、`id`、`kind`、`statement`、`proof` | 有 `root`（耐久库在场） | `VMU_INVALID_ARGUMENT`、`VMU_NO_SUCH_OBJECT` |
| `vibe_vmu_script` | M3 脚本：`action=list\|run`（结果**只回调用方**，不进提示词） | `action`(必填)、`id`、`args`(JSON 数组字符串) | profile 行声明了 `config.scripts` | `VMU_NO_SUCH_OBJECT`、`VMU_INVALID_ARGUMENT`、`VMU_ENGINE_UNAVAILABLE` |
| `vibe_vmu_pack` | 整合包：`action=list\|plan\|apply\|unload`（**`plan` 是纯报告** ✓、`apply` 冲突即具名拒、`unload` 逐个回滚） | `action`(必填，枚举)、`id`(unload)、`manifest`(内联 manifest JSON) | profile 行声明了整合包（`config.packs` 或 `vmu.packs.active` 非空）。**无声明 ⇒ 不出现** ✓（零机制不受管理面豁免 ✓） | `VMU_INVALID_ARGUMENT`、`VMU_PACK_*` |
| `vibe_vmu_control` | 控制流：`action=status\|pause\|resume\|stop\|beat`（**暂停是真门禁**：任务新建/转换被 `VMU_STATE` 拒 ✓；`beat` 是心跳，`stale` 由 `vmu.limits.wallClockMs` 判 ✓） | `action`(必填，枚举)、`reason`(pause/stop)、`note`(beat) | 声明 `control:` 时 ✓（无声明 ⇒ 不出现 ✓） | `VMU_STATE`、`VMU_INVALID_ARGUMENT` |
| `vibe_vmu_meeting` | 会议/表决面：`action=list\|open\|speak\|silent\|close\|ballot\|vote\|tally\|reopen` ✓ —— 只对**内核已登记的实例 id**寻址 ✓（未知 id ⇒ `VMU_NO_SUCH_OBJECT` ✓）；`vote` 在**面上归一化**口语票值（`for/yes/赞成`⇒1；`against/no/反对`⇒0 ✓），其余原样交给原语 ⇒ **权威拒绝仍来自原语** ✓ | `action`(必填，枚举)、`id`、`ballotId`、`member`、`text`、`target`、`value`、`kind`、`reason`、`agenda`、`roster` | 声明 `meetings:` 或 `ballot:` 时 ✓（无声明 ⇒ 不出现 ✓） | `VMU_NO_SUCH_OBJECT`、`VMU_STATE`、`VMU_INVALID_ARGUMENT`、`VMU_PACK_*=pack 规则` ✓ |
| `vibe_vmu_task` | 任务面：`action=list\|create\|assign\|transition\|stage\|advance\|brief\|history` ✓ —— **依赖/阶段门/暂停门仍由内核强制** ✓（本面只寻址与调用，不复制策略 ✓） | `action`(必填，枚举)、`id`、`title`、`objective`、`owner`、`deps`、`to`、`reason` | 声明 `tasks:` **或**声明了非空 `vmu.tasks.stages` ✓（无声明 ⇒ 不出现 ✓） | `VMU_STATE`、`VMU_NO_SUCH_OBJECT`、`VMU_RESOURCE_BUDGET`、`VMU_INVALID_ARGUMENT` |

> **活对象登记（本节新增面所需 ✓）**：内核持有**会话内**的会议/表决实例表（`kernel.liveMeeting(id)`／`liveBallot(id)` ✓，`status().live = {meetings[],ballots[],cap,evicted}` ✓）；**上限 50，超出按最旧逐出并计数** ✓（`evicted` 绝不静默 ✓）。它**不是新策略** ✓：同一批原语，只是**可按 id 寻址** ✓（docs/08 §2 的"逐对象原语" ✓）。

> **真实接线面（此前文档完全没写 ✗）**：这 5 个工具由 **profile 行的 `config`** 装配 —— `config.root`（耐久库 ⇒ `records`）、`config.vmu['vmu.middleware.entries']`（总线 ⇒ `middleware`）、`config.scripts`（⇒ `script`）、`config.instance`（身份自证）、`config.packs`（整合包装载）。**没有** `settings.yml`／`pack.yml`／`middleware/*.yml` 这类落盘配置 ✗（运行时**不读任何 YAML 文件** ✓）。

### 3.2 规划中（`⛔ 未实现`，**当前不可调用**）

> 这些名字宿主**没有注册**；保留在此仅为规划追溯 ✓。

| 工具（规划） | 意图 | 状态 |
|---|---|---|
| `vibe_vmu_report` | 面向人的报告（可裁剪字段） | ⛔ 未实现 |
| `vibe_vmu_members` | 花名册与角色槽位（只读） | ⛔ 未实现（库面 `kernel.members` ✓） |
| `vibe_vmu_hire` / `vibe_vmu_fire` | 增/减成员（走内核槽位） | ⛔ 未实现 |
| `vibe_vmu_say` | 发消息（可被中间件拦截） | ⛔ 未实现 |
| `vibe_vmu_meeting` | 会议原语：召集/议程/举手/收束 | ⛔ 未实现（库面 `kernel.meeting()` ✓） |
| `vibe_vmu_ballot` | 表决原语：开板/投票/计票/结束 | ⛔ 未实现（库面 `kernel.ballot()` ✓） |
| `vibe_vmu_record_progress` / `vibe_vmu_record_{proposition,method,subproblem}` | 记录与成果卡 | ⛔ 未实现（已由 `vibe_vmu_records` 的 `append` 覆盖 ✓） |
| `vibe_vmu_read_library` | 读库：头部列表／按 id 展开 | ⛔ 未实现（已由 `vibe_vmu_records` 的 `list`/`expand` 覆盖 ✓） |
| `vibe_vmu_task` | 任务：建/派/迁移/查 | ⛔ 未实现（库面 `kernel.tasks` ✓） |
| `vibe_vmu_lean_lib` / `vibe_vmu_lean_read` / `vibe_vmu_lean_archive` | 形式化面 | ⛔ 未实现 |
| `vibe_vmu_pause` / `vibe_vmu_resume` | 暂停/恢复调度 | ⛔ 未实现（内核**没有** pause/resume ✗） |
| `vibe_vmu_mw` | 中间件：查看/校验/干跑/禁用 | ⛔ 未实现 —— 真名是 `vibe_vmu_middleware` ✓（**它的 `validate`/`dryRun` 动作现已实现** ✓，见 §3.1） |

**工具面纪律**（对 DSH 的对接约束，**来源已分级标注** ✓）：
- **参数 DSL（源码级）**：`parameters: { <名>: { type, required: true, description, enum } }` —— **`required` 写在参数内部**，**不是**顶层 `required[]` 数组 ✗；
- **`output` 必填（源码级，非文档级）**：`dsh-tools/lib/index.js:842` **无保护地**解引用 `options.output.render`（`L849` 解引用 `.schema`）⇒ 省略 `output` 必然 `TypeError`；
- **`additionalProperties: false`** 的价值（第一方包注释）：保证"日志快照 == 模型以为自己写的内容"⇒ vmu 工具**默认收紧**；
- **四条更细的硬约束（C′ 终版，源码级）** ✗✓：① **对象型参数必须显式写布尔 `additionalProperties`**（`dsh-tools/.../schema.js:158-160`）；② **参数级 `required` 只能写 `true`**；③ **`type` 与 `oneOf` 不可同时出现**；④ `output` 的强制是**显式守卫**：`dsh-tools/lib/index.js:2881` `throw new TypeError('tool "<name>" must declare output { schema, render, presentationMeta? }')` ✓；
- **`restrict` 只能减**（官方逐字）；其"四类输入抛错"的说法**未核** ✗ ⇒ 需要"加/改"的场合由 vmu **自建注册面**负责，不依赖 DSH restrict；
- 每个工具都必须有：**具名拒**、`status` 可观测面、以及"被中间件拦截时"的审计留痕。

### 3.1 继承工具面（**保留原名**；见 01-§5 的 **D14**）

| 工具名 | 来源 | 实现位置 | 说明 |
|---|---|---|---|
| **`math_computation`** ✓**已接入（2026-10-09 完成 ✓）** | **共享模块**（清点判决"原样复用" ✓） | `vibe-math-vmu/math-computation.js` ＋ `kernel/math.js` 适配 ＋ **`host-math.js` 真宿主接缝** ✓ | 名字**不改为** `vibe_vmu_*` ✗：改名会破坏各预设的**字节一致性**（`audit-math-computation-parity` ✓），且 v2–v5r 全用此名 ✓；旧名↔新名的映射由 **pack 别名层**（D6）负责 ✓。**出现条件**：插件行声明 `math: true` 或任一 `vmu.math.*` 键 ✓（未声明 ⇒ 不发布 ✓，零机制 ✓）；接缝提供 `register/params/projectRoot/writeText/readText/exists/listDir/resolveExecutable/spawn/log` ✓，`spawn` 走 `host-spawn.js`（调用时解析 ✓） |

> **纪律**：`vibe_vmu_*` 是 **vmu 自建工具**的命名空间 ✓；**继承面**以原名登记在本表 ✓，不得悄悄改名 ✗（改名 = 破坏性变更，须走 03-§7 的版本与迁移流程 ✓）。

---

## 4. Prompt sections / variables（索引）

| 段名（提案） | 用途 | 可变点 | 绑定维度 |
|---|---|---|---|
| `charter` | 章程/规章（**内容由 pack 给**） | 全文覆盖 | 角色槽位 |
| `role` | 角色说明 | 全文覆盖 | 角色槽位 |
| `state` | 状态块（只读事实） | 不得覆盖（框架注入） | 阶段/成员 |
| `hooks-contract` | 钩子/中间件机制说明 | 覆盖 | 全局 |
| `library-index` | 归档头部列表（S21 思路） | 模板 | 成员/阶段 |
| `stage-guidance` | 阶段指引 | 覆盖 | 阶段 |
| `task-brief` | 当前任务简报 | 模板＋注入 | 任务 |

**变量**：`{{member}}`、`{{role}}`、`{{phase}}`、`{{time}}`、`{{setting:key}}`、`{{count:...}}`、`{{pack}}` —— **白名单制**，未登记变量即拒（防注入）。
**纪律**：状态块**不得**由 pack/中间件覆盖（保证 R11 只读事实可信）。

---

## 5. Hooks（索引）

完整表在 `05-middleware.md` §4（DSH 底座钩子 ＋ vmu 内部钩子）。**登记规则**：新增钩子必须**同时**更新 03（索引）与 05（全表），否则门禁红。

---

## 6. Durable keys 与文件布局契约（公开部分）

```
<workspace>/
├── vmu/                          # 内核工作区（公开布局，pack/脚本可读）
│   ├── state.json                # 单一 fold 投影（＋版本号/迁移记录）
│   ├── settings.resolved.json    # ⚠️ 未落盘：生效设置与来源**只在 status().settings.resolved** ✓
│   ├── packs/<name>/             # ⚠️ 未落盘：已装载 pack 的清单只在 status().packs 与 pack 记录里 ✓
│   └── audit/<YYYY-MM-DD>.jsonl  # **已落盘 ✓**：设置/中间件/拒绝 审计（只增；写失败在 status().audit.lastWriteError 具名上报 ✓）
├── Members/<id>/
│   ├── Progress/{progress,routes,obstacles,rejected,state}.md
│   ├── Propos/ · Methods/ · Subproblems/
│   └── Profile.md
└── Shared/                       # 所级共享（会议纪要/决议/形式化/论文…）
```
**公开键（提案）**：`phase`、`members[]`（含角色槽位与待续标记）、`tasks[]`、`meetings[]`、`ballots[]`、`records[]`（含指纹）、`budget`、`settings.resolved`、`middleware[]`、`packs[]`。
**纪律**：① **绝不**把自有状态写进 DSH 会话日志（硬限制）；② 键的增删属**破坏性变更** ⇒ 走 §7；③ 截断一律**计数**（见 07 号）。

---

## 7. 版本化与废弃

| 面 | 版本字段 | 兼容策略 |
|---|---|---|
| Services | `apiVersion`（每服务） | 只增方法＝minor；改签名/删方法＝major（bump ＋ 迁移说明） |
| Tools | 工具描述里写明可用版本；`vibe_vmu_*` 名称稳定 | 改名＝新工具 ＋ 旧名进入**别名层**弃用期 |
| Prompt sections | 段名稳定；内容可变属 pack 事 | 删段＝major |
| Durable keys | `state.version` 整数 ＋ `migrate()` | 每次 bump 必须提供**前向迁移**与**回退说明** |
| Error codes | 登记表（§8）| 只增；改语义＝新码 |

---

## 8. Error codes（提案；登记表）

| 码 | 语义 | 何时 | 是否必须具名解释 |
|---|---|---|---|
| `VMU_INVALID_ARGUMENT` | 参数非法（域外/缺失/类型） | 所有工具入口 | ✅ |
| `VMU_NOT_MEMBER` | 调用者不是可识别成员/角色 | 需要身份的操作 | ✅ |
| `VMU_NOT_PERMITTED` | 权限不足（含中间件拦截） | 写/管操作 | ✅（须说明**谁能做**） |
| `VMU_NO_SUCH_OBJECT` | 对象不存在（悬空 id） | 读/引用 | ✅（须给**下一步**） |
| `VMU_STATE` | 状态不允许该操作 | 阶段/流程约束 | ✅ |
| `VMU_RESOURCE_BUDGET` | 触达预算/上限（机器强制） | 工具调用/新建成员/内存 | ✅（须给**当前值与上限**） |
| `VMU_PACK_CONFLICT` / `VMU_PACK_MISSING` | 整合包冲突/缺失 | 装载 | ✅ |
| `VMU_MIDDLEWARE_REJECTED` | 中间件**显式**拒绝 | 钩子 | ✅（须给**中间件 id**） |
| `VMU_MIDDLEWARE_FAILED` | 中间件异常（按失败策略处置） | 钩子 | ✅（须给**原始错误**） |
| `VMU_STORE_FAILED` / `VMU_STORE_MIGRATION` | 耐久写失败/迁移失败 | 耐久层 | ✅ |
| `VMU_LEAN_NOT_FOUND` | **无工具链**（Lean 不存在/不可解析） | 形式化面 | ✅（须给**怎么装/怎么指路**） |
| `VMU_LEAN_COMPILE_FAILED` | **编译失败**（**不是**"命题为假" ✗） | 形式化面 | ✅（须**显式区分**"缺陷"与"反驳"） |
| `VMU_ENGINE_UNAVAILABLE` | 引擎不可用（探测失败/未注册） | 计算/形式化 | ✅ |
| `VMU_JOB_TIMEOUT` / `VMU_JOB_CANCELLED` | 作业超时/被取消 | 计算/形式化作业 | ✅ |
| `VMU_MATH_INVALID_INPUT` | 数学输入非法（域/精度/单位） | 计算面 | ✅ |
| `VMU_MEETING_TOO_SMALL` | 会议参与人数不足（门槛由中间件定，**码由内核登记**） | 会议原语 | ✅ |
| **`VMU_IO_FAILED`** | **写盘/IO 失败**（与"状态不对"**区分**：调用方应重试或改路径，而不是改状态机 ✗） | 耐久/记录/归档 | ✅（**R-c 已裁定：新增** ✓，替代把 `V5_WRITE_FAILED` 混入 `VMU_STATE` ✗） |

> **登记纪律（门禁 D14）**：文档/代码中出现的每个 `VMU_*` 都**必须**在本表登记；**未登记即红** ✗。新增码 ⇒ **只增不改语义**（改语义＝新码，见 §7）✓。

**pack 自有域码规范（R-d 已裁定 ✓）**：整合包若需要机构级错误码，**必须**用 `VMU_PACK_<PACKID>_<REASON>` 形状 ✗不得直接占用 `VMU_*` 的框架命名空间（否则"框架拒"与"机构拒"不可分 ✗）✓；并且**必须在 pack manifest 的 `codes[]` 里登记每个码＋一行语义** ✓（加载期校验：未登记即拒 ✓）。框架码与 pack 码因此**前缀可分** ✓。

**纪律**：**任何"拒绝"都必须具名**（R11）；不得返回"空成功"或近似物（沿用 v5r 的 S21 纪律）。

---

## 9. Settings keys（索引）

全表在 `04-settings.md` §4（命名空间 `vmu.*`）。**登记规则**：新增键必须同时更新 04 与 §6 的公开键清单（如涉及耐久）⇒ 否则门禁红。

---

## 10. 本文件的验收判据（门禁）

1. **登记完整性**：源码中出现的公开符号 ∈ 本文件（多一个/少一个 ⇒ 红）；
2. **README/文档引用一致**：02/04/05/06/07 引用的服务/工具/钩子/键**都存在**（悬空引用 ⇒ 红）；
3. **命名合规**：`vibe_vmu_*` / `vmu.*` / `VMU_*` 之外的前缀 ⇒ 红；
4. **版本字段**：每个 Service 有 `apiVersion`；docker 键有 `state.version`；
5. **具名拒覆盖**：每个工具的每条拒绝路径都有登记码 ⇒ 红/绿可判。

---

## 11. 未核项

- 本文 §2 的服务/工具清单为**首版提案**，签名待 P0 实现时定稿；
- **工具参数 DSL 的细节**（`required` 位置、`additionalProperties` 行为）为**源码级**证据（官方文档未明文）⇒ 见 14-§2（U3）；
- **`restrict` 的"四类输入抛错"未核**（官方仅逐字支持"只能减"）⇒ 见 14-§2（U2）；
- 公开接口**版本化粒度**（按服务/按 pack 契约）待裁 ⇒ 见 14-§1（O3）。
