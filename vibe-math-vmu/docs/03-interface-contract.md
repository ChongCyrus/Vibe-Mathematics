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
| `vmu.library`（有 `root` ✓） | 归档与记忆 | `append(rec,{member?})`、`record(member,track,text)`、`list(filter,{includeTrash?})`、`expand(id,{capBytes})`、`storedFingerprint(id)`、`fingerprint(kind,parts)`、`truncationReport()`、`status()`、**批 3 新增**：`remove({id})`、`removeRevision({id,rev})`、`moveToTrash({id})`、`restore({id})`、`listTrash()`（**永久标记保护＋删除留痕＋不静默成功** ✓，全部经 `guardWrite` ✓） | 1 |
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
| `vmu.library` | `fingerprint(kind,parts)→hex`（**单点计算** ✓）／`append(rec,{member?})→{ok,id,fingerprint,deduplicated}`／`record(member,track,text)→{ok,file}`／`list(filter)→Head[]`（**七键、不含正文、行数上限＋计数** ✓；新增 `{includeTrash?}` ✓）／`expand(id,{capBytes})→{ok,head,body,truncated,path}`／`storedFingerprint(id)→{ok,id,fingerprint}`（**读回而非重算** ✓）／`truncationReport()`／`status()`（**异步** ✓）／`remove({id})`／`removeRevision({id,rev})`／`moveToTrash({id})`／`restore({id})`／`listTrash()`／`commitRevision({id,by,reason?})`／`revision({id,rev})`／`revisions({id,limit?})` | `VMU_NO_SUCH_OBJECT`／`VMU_INVALID_ARGUMENT`／`VMU_RETENTION_CONFLICT`（永久标记 ✗）／`VMU_IO_FAILED`（带 `step` ✓） |
| `vmu.members` | `roles()`／`roster()`／`hire({id,slot})`／`assignRole(id,slot)`／`end(id,reason)`／`wake(id,ask,{role?,phase?})`（**注入接缝**；缺则具名拒 ✓）／`may(id,permission)`（**只做包含判断** ✓）／`status()` | `VMU_RESOURCE_BUDGET`（**报当前数与上限** ✓）／`VMU_NO_SUCH_OBJECT`／`VMU_STATE`／`VMU_ENGINE_UNAVAILABLE` |
| `vmu.tasks` | `create({title,objective?,owner?,deps?,priority?})→{ok,id,state}`／`assign(id,who)`／`transition(id,to,{reason})`／`list()`／`stage()`／`advance({to,reason})`（**先过 `stageGate`** ✓）／`rollback({reason})`／**`brief(id)`／`briefOf(id)`／`clearBrief(id)`**（任务简报＝给该任务负责人的执行流程 ✓）／`history(id?)`／`status()` | `VMU_STATE`（依赖未满足／非法转换／**暂停中** ✓）／`VMU_RESOURCE_BUDGET` |
| `vmu.prompt` | `register(s)→entry`／`assemble(ctx)→{ok,text,sources[],truncation[],at}`／`override(section,text,by)→{ok,previous}`／`rollback(section)`／`snapshot(scopes)`／`bindToHost(adapter)`／`setState(text)`／`status()→{sections[],bindings,truncation[],middlewareAppends[]}` | `VMU_NOT_PERMITTED`／`VMU_INVALID_ARGUMENT`／`VMU_NO_SUCH_OBJECT`／`VMU_ENGINE_UNAVAILABLE` |
| `vmu.middleware` | `status()→{dryRun,hookTimeoutMs,breakerThreshold,entries[],hooks[]}`／`entries()`／`disable(id,reason)`／`enable(id)`／**`declareTopic(name)→{ok,topic,existing}`（协议扩展点：冻结集之外的新钩子主题必须先声明才可 emit ✓，名字非法即具名拒 `VMU_INVALID_ARGUMENT` ✓）**／`setDryRun(v)`／`isDryRun()`／`emit(hook,payload,{scope?,traceId?,member?,role?,phase?,bridge?})→{ok,decisions[],traceId,refused?,aborted?,decision}`（**命名空间感知的成员校验** ✓：`member/turn/meeting/ballot/record/task/prompt/budget/pack/settle/control` 这 11 个 **vmu 命名空间**里的未知名**具名拒** ✓；**宿主命名空间**（如 `tools/pre-execute`／`fs/write-intent`）**放行** ✓ —— 那是基座的词汇 ✓；注意 `prompt/assemble` **属宿主词表** ⇒ 这正是为何**不能整表放行** ✗（放行就等于把已修的漂移 bug 放回 ✗）；`bridge:true` 只用于宿主瀑布桥 ✓）／`on(entry,handler)→id`／`add(entry)→entry`／`trace(traceId)→Trace[]`／`wrapHostWaterfall(next)→async(payload)` | `VMU_MIDDLEWARE_FAILED`／`VMU_MIDDLEWARE_REJECTED`／`VMU_INVALID_ARGUMENT` |
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
| `VMU_LEAN_EXIT_NONZERO` | Lean 作业退出非 0（**编译/检查失败**） | 形式化面（`kernel/lean.js` ✓） | ✅（与"哈希变了"分开登记 ✓） |
| `VMU_LEAN_HASH_CHANGED` | 退出 0 **但**产物内容哈希变了 ⇒ **不算 passed** ✓ | 形式化面 | ✅（"退出 0 就行"是错的 ✓） |
| `VMU_LEAN_TIMEOUT` | 超过 `vmu.math.leanTimeoutMs` 单次预算 | 形式化面 | ✅（须给当前值 ✓） |
| `VMU_LEAN_SPAWN_FAILED` | Lean 进程起不来/异常（**须给原始错误** ✓） | 形式化面 | ✅ |
| `VMU_LEAN_FILE_UNREADABLE` / `VMU_LEAN_FILE_REQUIRED` | 产物文件读不到／`submit` 未给 `file` | 形式化面 | ✅（本面只编译既有文件 ✓） |
| `VMU_LEAN_STATEMENT_REQUIRED` | `submit` 未给 `statement`（回执与审计的对象 ✓） | 形式化面 | ✅ |
| `VMU_LEAN_NOT_SETTLED` | 作业尚未结算（`state≠settled`）就要求结算 | 形式化面 | ✅（须给当前 state ✓） |
| `VMU_ENGINE_UNAVAILABLE` | 引擎不可用（探测失败/未注册） | 计算/形式化 | ✅ |
| `VMU_JOB_TIMEOUT` / `VMU_JOB_CANCELLED` | 作业超时/被取消 | 计算/形式化作业 | ✅ |
| `VMU_MATH_INVALID_INPUT` | 数学输入非法（域/精度/单位） | 计算面 | ✅ |
| `VMU_MEETING_TOO_SMALL` | 会议参与人数不足（门槛由中间件定，**码由内核登记**） | 会议原语 | ✅ |
| `VMU_NOT_FOUND` | 要引用的**段/包/脚本/对象**不存在（泛型缺席；`VMU_NO_SUCH_OBJECT` 更偏"悬空 id"） | 中间件/提示词/装载 | ✅（须给**下一步**） |
| `VMU_CONFLICT` | **声明冲突**（钩子/段/服务重名、同区间相斥声明） | 中间件/提示词/装载 | ✅（须给**冲突双方**） |
| `VMU_VERSION_MISMATCH` | **协议/包版本**不匹配（`apiVersion`/manifest/消息 schema） | 中间件/包/协议 | ✅（须给**双方版本**） |
| `VMU_TIMEOUT` | 泛型超时（钩子/脚本；作业面另有 `VMU_JOB_TIMEOUT`） | 中间件/脚本 | ✅（须给**当前预算**） |
| `VMU_DEGRADED` | 条目处于**降级窗口**（熔断/退避中，能力可用性下降） | 中间件 | ✅（须给**恢复条件**） |
| `VMU_NAME_CONFLICT` | 归档**命名冲突**（slug 撞名且策略未给出可用后缀） | 归档/库 | ✅（须给**冲突名与策略**） |
| `VMU_WRITE_FAILED` | 耐久写入失败（原子写/落盘/权限；比 `VMU_STORE_FAILED` 更贴文件层） | 归档/库 | ✅（须给**路径与 errno 面**） |
| `VMU_BODY_TRUNCATED` | 正文被**计数式截断**返回（**永不静默** ✓） | 归档/库 | ✅（须给**截断字节与上限**） |
| `VMU_META_VALIDATION_FAILED` | 元数据 schema 校验失败 | 归档/库 | ✅（须给**字段与规则**） |
| `VMU_REF_DANGLING` | 引用目标不存在（策略可 warn/refuse） | 归档/库 | ✅（须给**悬空引用 id**） |
| `VMU_AUDIT_WRITE_FAILED` | 审计落盘失败（**不得静默吞掉** ✓） | 归档/审计 | ✅ |
| `VMU_INDEX_STALE` | 索引陈旧超容忍度（须重建或降级为直读） | 归档/检索 | ✅（须给**陈旧度**） |
| `VMU_QUOTA_EXCEEDED` | 触达配额（软/硬阈值） | 归档/配额 | ✅（须给**当前值与阈值**） |
| `VMU_CRYPTO_VERIFY_FAILED` | 完整性/签名校验失败 | 归档/加密 | ✅ |
| `VMU_EXTERNAL_UNAVAILABLE` | 外部对象/远端后端不可达 | 归档/远端 | ✅（须给**离线策略**） |
| `VMU_PATH_ESCAPE_REFUSED` | 路径逃逸被拒（`vmu.safety.pathPolicy` 面；与 `VMU_NOT_PERMITTED` 并存，此码**专指路径面**） | 安全/归档/脚本 | ✅（须给**被拒路径与策略**） |
| `VMU_MIGRATE_DRYRUN_FAILED` | 迁移 **dry-run** 失败（未落盘即失败 ✓） | 迁移 | ✅（须给**失败步骤**） |
| `VMU_ROLLBACK_UNAVAILABLE` | 无可用回退点（未先落回退点 ⇒ 拒绝执行） | 迁移 | ✅ |
| `VMU_ROLLBACK_FAILED` | 回退执行失败（**须人工介入** ✓） | 迁移 | ✅（须给**卡在哪一步**） |
| `VMU_COMPAT_UNKNOWN_COMBO` | 兼容矩阵里**未知组合**（**不得默认当作兼容** ✓） | 迁移/兼容 | ✅ |
| `VMU_ALIAS_AMBIGUOUS` | 别名解析**多义**（同别名指向多个目标） | 迁移/命名 | ✅（须给**候选列表**） |
| `VMU_PARAM_RENAMED` / `VMU_PARAM_DEPRECATED` / `VMU_PARAM_REMOVED` | 参数**改名/废弃/已移除**（三阶段；废弃期须给替代键 ✓） | 设置/迁移 | ✅ |
| `VMU_PACK_KERNEL_OVERRIDE_REFUSED` | 整合包试图覆盖**内核强制面**被拒（R-d ✓） | 包/装载 | ✅（须给**被拒的键/面**） |
| `VMU_FORMAL_NOT_FOUND` | 形式化**工具链/定理库**不存在（Lean/Mathlib/Loogle 等） | 形式化面 | ✅（须给**怎么装/怎么指路**） |
| `VMU_FORMAL_SORRY_FOUND` | 证明里仍有 `sorry`/`admit`（**≠ 编译失败** ✗） | 形式化面 | ✅（须给**位置**） |
| `VMU_FORMAL_AXIOM_UNTRUSTED` | 用到未受信公理/`axiom`（信任边界外） | 形式化面 | ✅（须给**公理清单**） |
| `VMU_FORMAL_ADAPTER_UNSUPPORTED` | 该证明助手**无适配器**或适配器不支持该操作 | 形式化面 | ✅ |
| `VMU_FORMAL_SKELETON_UNAVAILABLE` | 证明骨架生成不可用（缺模板/缺上下文） | 形式化面 | ✅ |
| `VMU_FORMAL_REPRO_INCOMPLETE` | **复现包不完整**（缺环境锁定/脚本/数据指针） | 形式化/复现 | ✅（须给**缺什么**） |
| `VMU_FORMAL_DISAGREEMENT` | 形式化结论与数值/经验结论**不一致**（须并置呈现，**不得自动择一** ✓） | 形式化面 | ✅ |
| `VMU_FORMAL_LIBRARY_NOT_INDEXED` | 定理库未建索引（检索不可用，须给重建办法） | 形式化面 | ✅ |
| `VMU_MATH_UNSUPPORTED_OP` | 请求的数学操作在**当前引擎**无实现（须给可用引擎/替代 ✓） | 计算面 | ✅ |
| `VMU_MATH_DIMENSION_MISMATCH` | 量纲/维度不匹配 | 计算面 | ✅（须给**两侧量纲**） |
| `VMU_MATH_SINGULAR_MATRIX` | 奇异矩阵/不可逆 | 计算面 | ✅ |
| `VMU_MATH_NONCONVERGENT` | 迭代/求解**不收敛**（须给迭代数/残差 ✓） | 计算面 | ✅ |
| `VMU_MATH_RESIDUAL_TOO_LARGE` | 残差超容差（结果不可用，**不得当作答案** ✗） | 计算面 | ✅ |
| `VMU_MATH_PRECISION_LOST` | 精度损失超阈值（须给丢失位数/条件数 ✓） | 计算面 | ✅ |
| `VMU_MATH_INTERVAL_EMPTY` | 区间/置信区间为**空**（前提矛盾或数据不足） | 计算面 | ✅ |
| `VMU_MATH_ASSUMPTION_CONFLICT` | 符号假设**互相矛盾**（须给冲突假设 ✓） | 计算面 | ✅ |
| `VMU_MATH_SEED_REQUIRED` | 结果依赖随机性但**未给种子** ⇒ **拒绝声称可复现** ✓ | 计算/复现 | ✅ |
| `VMU_MATH_REPRO_MISMATCH` | 复算与既有结果**不一致**（须给两次输入指纹 ✓） | 计算/复现 | ✅ |
| `VMU_MATH_CACHE_CORRUPT` | 计算缓存损坏（须给处置：丢弃/重建 ✓） | 计算面 | ✅ |
| `VMU_MATH_JOB_PERSIST_FAILED` | 作业**持久化失败**（断点续算不可用 ✓） | 计算面 | ✅ |
| `VMU_MATH_SANDBOX_DENIED` | 沙箱**拒绝**（网络/文件/进程能力越界） | 计算/安全 | ✅（须给**被拒能力**） |
| `VMU_MATH_RESOURCE_LIMIT` | 触达计算资源上限（CPU/内存/时间/输出） | 计算面 | ✅（须给**哪一项与上限**） |
| `VMU_MATH_ARTIFACT_TOO_LARGE` | 产物超上限（须给出**未落盘字节数** ✓） | 计算面 | ✅ |
| **会议·议程·动议·纪要（卷 08 规划面 ✓）** | | | |
| `VMU_MEETING_QUORUM_LOST` | 法定人数**会中流失**（复算时判） | 会议 | ✅（须给**流失后处置**） |
| `VMU_MEETING_UNANSWERED_POLICY` | 未答语义与门槛配置**冲突** | 会议 | ✅ |
| `VMU_MEETING_ORDER_DENIED` | 发言顺序/优先权被拒 | 会议 | ✅ |
| `VMU_MEETING_SPEECH_TIMEBOUND` | 超时间箱/发言配额 | 会议 | ✅（须给**上限**） |
| `VMU_MEETING_INTERRUPT_DENIED` | 打断不允许/超配额 | 会议 | ✅ |
| `VMU_MEETING_CONFIDENTIAL_DENIED` | 保密级别不允许读/引用 | 会议 | ✅ |
| `VMU_MEETING_RECESS_LIMIT` | 休会超上限 | 会议 | ✅ |
| `VMU_MEETING_APPEAL_OUT_OF_SCOPE` | 申诉不在受理范围 | 会议 | ✅（须给**受理范围**） |
| `VMU_MEETING_DISCIPLINE_DENIED` | 纪律动作不允许 | 会议 | ✅ |
| `VMU_MEETING_EMERGENCY_NOT_ALLOWED` | 紧急程序不适用 | 会议 | ✅ |
| `VMU_AGENDA_ITEM_REQUIRED` | 需要**一等议程条目** | 议程 | ✅ |
| `VMU_AGENDA_SPLIT_DEPTH` | 议程拆分超深度 | 议程 | ✅ |
| `VMU_AGENDA_OWNER_REQUIRED` | 条目缺负责人 | 议程 | ✅ |
| `VMU_MOTION_NOT_SECONDED` | 动议未获附议 | 动议 | ✅ |
| `VMU_MOTION_EXPIRED` | 动议过期失效 | 动议 | ✅ |
| `VMU_MOTION_WITHDRAWN` | 动议已撤回 | 动议 | ✅ |
| `VMU_MOTION_TABLE_LIMIT` | 搁置超上限 | 动议 | ✅ |
| `VMU_AMENDMENT_REJECTED` | 修正案不被接受 | 动议 | ✅ |
| `VMU_MINUTES_NOT_CONFIRMED` | 上次纪要未确认 | 纪要 | ✅ |
| `VMU_MINUTES_ACTION_REQUIRED` | 决议缺行动项 | 纪要 | ✅ |
| **表决（卷 08 ✓）** | | | |
| `VMU_BALLOT_METHOD_UNSUPPORTED` | 计票方法未实现/未声明 | 表决 | ✅（须给**可用方法**） |
| `VMU_BALLOT_MIN_VOTES_NOT_MET` | 本次投票**成立门槛未达** | 表决 | ✅（须给**当前与门槛**） |
| `VMU_BALLOT_TIE_UNRESOLVED` | 平票且规则未定 | 表决 | ✅ |
| `VMU_BALLOT_ROUNDS_EXHAUSTED` | 多轮用尽 | 表决 | ✅ |
| `VMU_BALLOT_SECRECY_LOCKED` | 开票后要求改记名方式 | 表决 | ✅ |
| `VMU_BALLOT_ABSTAIN_NOT_ALLOWED` | 本板不允许弃权 | 表决 | ✅ |
| `VMU_BALLOT_FROZEN` | 冻结中投票被拒（**票不入账** ✓） | 表决 | ✅ |
| `VMU_RECUSAL_REQUIRED` | 该表决要求**回避** | 表决 | ✅ |
| `VMU_PROXY_NOT_ALLOWED` | 代理/委托未启用（默认 **off** ✓） | 表决 | ✅ |
| `VMU_PROXY_CHAIN_TOO_DEEP` | 委托链超深/成环 | 表决 | ✅ |
| `VMU_VETO_NOT_ALLOWED` | 未启用否决权 | 表决 | ✅ |
| `VMU_REOPEN_FLOOR_NOT_MET` | 复议门槛未达 | 表决 | ✅ |
| `VMU_REOPEN_WRONG_INITIATOR` | 复议发起人不合规 | 表决 | ✅ |
| `VMU_RECOUNT_MISMATCH` | **复算与结论不一致** | 表决 | ✅（须给**两次计数**） |
| `VMU_RECOUNT_SCOPE_DENIED` | 无权复算/导出 | 表决 | ✅ |
| **工作流·看板·预算·控制·触发·度量（卷 08 ✓）** | | | |
| `VMU_WORKFLOW_DEP_TYPE_UNSUPPORTED` | 依赖类型未声明 | 工作流 | ✅ |
| `VMU_WORKFLOW_GATE_NOT_MET` | 门未达成 | 工作流 | ✅（须给**缺哪一项**） |
| `VMU_WORKFLOW_WIP_LIMIT` | 看板列超 WIP | 工作流 | ✅ |
| `VMU_WORKFLOW_RETRY_EXHAUSTED` | 重试耗尽 | 工作流 | ✅ |
| `VMU_WORKFLOW_CHECKPOINT_MISSING` | 无检查点可回滚 | 工作流 | ✅ |
| `VMU_WORKFLOW_COMPENSATION_FAILED` | 补偿失败 | 工作流 | ✅ |
| `VMU_WORKFLOW_ESCALATION_TARGET_UNKNOWN` | 升级对象不存在 | 工作流 | ✅ |
| `VMU_WORKFLOW_RACI_MISSING_OWNER` | 任务无责任人 | 工作流 | ✅ |
| `VMU_WORKFLOW_SUBTASK_DEPTH` | 子任务超深 | 工作流 | ✅ |
| `VMU_WORKFLOW_TEMPLATE_UNKNOWN` | 模板不存在 | 工作流 | ✅ |
| `VMU_WORKFLOW_ARBITRATION_OFF` | 仲裁未启用 | 工作流 | ✅ |
| `VMU_BUDGET_SCOPE_UNKNOWN` | 预算范围未登记 | 预算 | ✅ |
| `VMU_BUDGET_RESERVE_EXHAUSTED` | 预留用尽 | 预算 | ✅ |
| `VMU_CONTROL_SCOPE_UNKNOWN` | 暂停范围非法 | 控制流 | ✅（须给**合法面**） |
| `VMU_CONTROL_NO_TIMER` | 宿主**无定时器服务**（看门狗不可用 ✓） | 控制流 | ✅ |
| `VMU_SCHEDULER_TRIGGER_LIMIT` | 触发器超上限 | 调度 | ✅ |
| `VMU_SCHEDULER_ACTION_FORBIDDEN` | 触发器动作越界（**试图改状态** ✗） | 调度 | ✅ |
| `VMU_METRICS_TRIGGER_FORBIDDEN` | 度量试图触发动作 | 度量 | ✅ |
| `VMU_IDEMPOTENCY_KEY_REUSED` | 幂等键重复且**载荷不同** | 工作流 | ✅（须给**键与差异**） |
| `VMU_WORKFLOW_TRANSITION_REQUIRED` | 看板移动要求**合法迁移**（`vmu.board.moveRequiresTransition` ✓；实现于 `kernel/board.js` ✓） | 工作流/看板 | ✅（须给**当前列与目标列** ✓） |
| `VMU_NO_OPEN_MEETING` | 起草纪要时**无进行中的会议**（实现于 `kernel/minutes.js` ✓） | 会议/纪要 | ✅（须给**可用会议入口** ✓） |
| `VMU_METRIC_UNAVAILABLE` | 指标不在**已声明白名单**内（`vmu.metrics.indicators` ✓；实现于 `kernel/metrics.js` ✓） | 可观测性 | ✅（须给**可用指标清单入口** ✓） |
| `VMU_MINUTES_DISSENT_REQUIRED` | `dissentMandatory` 下**异议为空**（实现于 `kernel/minutes.js` ✓） | 会议/纪要 | ✅（须点明**缺哪一项异议** ✓） |
| `VMU_ALERT_SUPPRESSED` | 告警被**上级故障抑制**（实现于 `kernel/alerts.js` ✓） | 告警面 | ✅（须点名**抑制源** ✓） |
| `VMU_ALERT_SILENCED` | 告警落在**静默窗口**（**静默≠丢弃**：仍计数，恢复后补摘要 ✓） | 告警面 | ✅（须给**窗口 id／原因／until** ✓） |
| `VMU_SLO_BUDGET_EXHAUSTED` | **错误预算耗尽**（须给 SLI／窗口／已耗比例 ✓） | 告警面 | ✅（默认只警告；`freeze-H2` 时拒 H2 变更 ✓） |
| `VMU_RETENTION_TRUNCATED` | 裁剪计划/动作超出上限 ⇒ **丢弃必须计数**（实现于 `kernel/retention.js` ✓） | 归档/保留 | ✅（须给**丢弃条数** ✓） |
| `VMU_QUOTA_SOFT_EXCEEDED` | 越过**软配额**（只警告不拒；实现于 `kernel/retention.js` ✓） | 归档/配额 | ✅（须给**当前量与软限** ✓） |
| `VMU_TRUST_VOCAB_VIOLATION` | 声誉信号**越出受控词表**（实现于 `kernel/trust.js` ✓） | 社会面/信任 | ✅（须给**允许的 kind 清单** ✓） |
| `VMU_WORKFLOW_STAGE_UNKNOWN` | 阶段**未声明**（含迁移引用未声明阶段；实现于 `kernel/workflow.js` ✓） | 工作流 | ✅（须给**已声明阶段清单** ✓） |
| `VMU_WORKFLOW_TASK_UNKNOWN` | 任务**无工作流状态**（实现于 `kernel/workflow.js` ✓） | 工作流 | ✅（须提示先 `advance()` ✓） |
| `VMU_WORKFLOW_GATE_BLOCKED` | 阶段门**未满足**（实现于 `kernel/workflow.js` ✓） | 工作流 | ✅（须**点名缺哪一项** ✓） |
| `VMU_WORKFLOW_ESCALATION_NOT_DUE` | 升级**未到时限**（实现于 `kernel/workflow.js` ✓） | 工作流 | ✅（须给**年龄与阈值** ✓） |
| `VMU_ARBITER_UNAVAILABLE` | 选择规则要求**人类指定**仲裁者（实现于 `kernel/arbitration.js` ✓） | 仲裁 | ✅（须说明"内核不代人指定" ✓） |
| `VMU_ARBITRATION_OFF` | 仲裁**未启用**（零机制；实现于 `kernel/arbitration.js` ✓） | 仲裁 | ✅（须给**如何启用** ✓） |
| `VMU_RECRUIT_SLOT_UNKNOWN` | 职位名**未映射到 slot**（S-1：内核不认识职位名；实现于 `kernel/recruit.js` ✓） | 招募 | ✅（须给**已知 slot 清单** ✓） |
| `VMU_RECRUIT_SEATS_EXCEEDED` | 席位**超员**（含已开岗位预留；实现于 `kernel/recruit.js` ✓） | 招募 | ✅（须给**当前/上限** ✓） |
| `VMU_RECRUIT_NOT_APPLIED` | 对**未申请**的岗位发出录用（实现于 `kernel/recruit.js` ✓） | 招募 | ✅（须给可用申请入口 ✓） |
| `VMU_RECRUIT_REASON_REQUIRED` | 评分/拒绝**缺理由**（实现于 `kernel/recruit.js` ✓） | 招募 | ✅（须点明缺哪一项 ✓） |
| `VMU_RECRUIT_OFFER_EXPIRED` | 录用报价**已过期**（实现于 `kernel/recruit.js` ✓） | 招募 | ✅（须给**过期时刻** ✓） |
| `VMU_RECRUIT_PROBATION_NOT_DUE` | **试用期未满**不得转正（实现于 `kernel/recruit.js` ✓） | 招募 | ✅（须给**剩余时间** ✓） |
| `VMU_TOPOLOGY_PATH_FORBIDDEN` | 拓扑**不允许该路径**（实现于 `kernel/topology.js` ✓） | 协作拓扑 | ✅（须给**允许路径** ✓） |
| `VMU_TOPOLOGY_CYCLE` | 层级/流水线**成环或自指**（实现于 `kernel/topology.js` ✓） | 协作拓扑 | ✅（须给**环路径** ✓） |
| `VMU_TOPOLOGY_SIZE_EXCEEDED` | 委员会/层级**超出规模上限**（实现于 `kernel/topology.js` ✓） | 协作拓扑 | ✅（须给**当前/上限** ✓） |
| `VMU_MEMORY_NOT_AUTHORITY` | **记忆不得当作授权**（实现于 `kernel/memory.js` ✓；与 S-3 同源：`may()`／`authorize()` **永远拒** ✓） | 机构记忆 | ✅（须说明权威来自席位或委托 ✓） |
| `VMU_REPRO_COPY_DENIED` | `dataPointerOnly` 下**拒绝复制数据**（实现于 `kernel/repropack.js` ✓） | 复现包 | ✅（须给改为指针的做法 ✓） |
| `VMU_SKILL_SELF_ATTEST` | **自我见证被拒**（不得自封；实现于 `kernel/skills.js` ✓） | 技能库 | ✅（须提示请他人见证 ✓） |
| `VMU_SKILL_VOCAB_VIOLATION` | 技能等级**越出受控词表**（实现于 `kernel/skills.js` ✓） | 技能库 | ✅（须给允许等级清单 ✓） |
| `VMU_SKILL_LIMIT` | **超过单人技能上限**（实现于 `kernel/skills.js` ✓） | 技能库 | ✅（须给现值/上限与释放办法 ✓） |

**共享模块码表（**由数学/归档/脚本模块抛出 ✓；独立批评者第 5 轮发现这些码**整批在登记面之外** ✗ ⇒ 现纳入同一登记表与门禁 ✓）**

| 码 | 语义 | 来源模块 | 状态 |
|---|---|---|---|
| `MATH_NOT_AVAILABLE` | 计算面不可用（整体缺失） | `math-computation.js` | ✅ 已实现 |
| `MATH_ENGINE_NOT_FOUND` | 指定引擎不存在（须给**可用引擎** ✓） | 同上 | ✅ |
| `MATH_ENGINE_LICENSE_REQUIRED` | 引擎需授权（如商业工具 ✓） | 同上 | ✅ |
| `MATH_ENGINE_UNUSABLE` | 引擎存在但不可用（探测失败 ✓） | 同上 | ✅ |
| `MATH_ENGINE_UNAVAILABLE` | 引擎不可达（注册但缺依赖 ✓） | 同上 | ✅ |
| `MATH_ENGINE_BAD_ARGV` | 引擎 argv 形状非法（**我方形状错** ✓） | 同上 | ✅ |
| `MATH_MISSING_PACKAGES` | 缺依赖包（须给**包名与安装途径** ✓） | 同上 | ✅ |
| `MATH_TIMEOUT` | 计算超时（模块级；作业面另有 `VMU_JOB_TIMEOUT` ✓） | 同上 | ✅ |
| `MATH_NONZERO_EXIT` | 引擎非零退出（**原始 stderr 必须回传** ✓） | 同上 | ✅ |
| `MATH_NO_SUBPROCESS` | 宿主无子进程服务（**具名降级** ✓） | `host-spawn.js` 路径 | ✅ |
| `MATH_REFUSED` | 计算被策略/前置条件拒 | `math-computation.js` | ✅ |
| `MATH_INVALID_ARGUMENT` | 数学参数非法（与 `VMU_MATH_INVALID_INPUT` 并存：前者**模块级**、后者**契约级** ✓） | 同上 | ✅ |
| `VMU_EXTERNAL_DISABLED` | 外部取数**未启用**（零机制；实现于 `kernel/external.js` ✓） | 外部取数 | ✅（须给**如何启用** ✓） |
| `VMU_EXTERNAL_RECEIPT_INCOMPLETE` | 取数**回执缺字段**（实现于 `kernel/external.js` ✓） | 外部取数 | ✅（须列出**缺哪些字段** ✓） |
| `VMU_EXTERNAL_STALE` | 使用了**过期缓存**（告知码；实现于 `kernel/external.js` ✓） | 外部取数 | ✅（须给 **ageMs/ttlMs/来源** ✓；**不得静默** ✗） |
| `VMU_SCHEDULE_LIMIT` | 待触发项**超上限**（实现于 `kernel/scheduler.js` ✓） | 调度 | ✅（须给**当前/上限** ✓） |
| `VMU_CRYPTO_UNAVAILABLE` | **签名接缝未注入**（实现于 `kernel/crypto.js` ✓；**绝不伪造签名** ✗✓） | 不可否认 | ✅（须说明接缝由宿主/插件提供 ✓） |
| `VMU_CRYPTO_NO_KEY` | 无可用签名密钥／缺载荷（实现于 `kernel/crypto.js` ✓） | 不可否认 | ✅（须点明缺哪一项 ✓） |
| `VMU_CRYPTO_KEY_UNKNOWN` | 密钥**从未登记**（实现于 `kernel/crypto.js` ✓） | 不可否认 | ✅（须说明退役密钥仍登记 ✓） |
| `VMU_CRYPTO_KEY_EXPIRED` | 密钥**过期或已吊销**（实现于 `kernel/crypto.js` ✓） | 不可否认 | ✅（须给**到期时刻** ✓） |
| `VMU_CRYPTO_PAYLOAD_MISMATCH` | **载荷不符**（实现于 `kernel/crypto.js` ✓） | 不可否认 | ✅（须给**两侧摘要** ✓） |
| `VMU_CRYPTO_SIGNATURE_MISMATCH` | **签名不符**（实现于 `kernel/crypto.js` ✓） | 不可否认 | ✅（须给 keyId 与原因 ✓） |
| `VMU_CRYPTO_VERIFY_FAILED` | 验证失败**族码**（四类细分见上 ✓） | 不可否认 | ✅（须带 `reason` ✓） |
| `VMU_NOTIFY_DISABLED` | 通知**未启用**（零机制；实现于 `kernel/notify.js` ✓） | 通知 | ✅（须给如何启用 ✓） |
| `VMU_NOTIFY_NO_TRANSPORT` | **投递接缝未注入**（**不得假装已投递** ✗✓） | 通知 | ✅（须说明记录已保留 ✓） |
| `VMU_NOTIFY_EVENT_UNREGISTERED` | 事件**不在已注册钩子表**（实现于 `kernel/notify.js` ✓） | 通知 | ✅（须给**已注册清单** ✓） |
| `VMU_NOTIFY_DELIVERY_FAILED` | 投递失败（**不阻断业务**但必须留痕计数 ✓） | 通知 | ✅（须给失败原因 ✓） |
| `VMU_NOTIFY_LIMIT` | 关注／登记册**超上限**（实现于 `kernel/notify.js` ✓） | 通知 | ✅（须给当前/上限 ✓） |
| `VMU_WATCH_UNKNOWN` | 取消**未知关注**（实现于 `kernel/notify.js` ✓） | 通知 | ✅（须给现存清单入口 ✓） |
| `VMU_LIFECYCLE_NOT_DECLARED` | **未声明阶段表**（默认**不放行** ✗✓；实现于 `kernel/lifecycle.js` ✓） | 研究生命周期 | ✅（须指向 L1–L24 声明方式 ✓） |
| `VMU_LIFECYCLE_BAD_STAGE_ID` | 阶段 id **不是 `L<编号>`**（不得自造阶段名 ✗✓） | 研究生命周期 | ✅（须给合法区间 ✓） |
| `VMU_LIFECYCLE_ILLEGAL_STEP` | **越级或回退**（实现于 `kernel/lifecycle.js` ✓） | 研究生命周期 | ✅（须给**当前 L 与合法下一步** ✓） |
| `VMU_LIFECYCLE_GATE_UNMET` | 闸点未过（**委托** `domaingate`／`publication` ✓ 不重定义 ✗） | 研究生命周期 | ✅（须**点名缺哪一项** ✓） |
| `VMU_LIFECYCLE_EVIDENCE_REQUIRED` | 准入**缺证据**（实现于 `kernel/lifecycle.js` ✓） | 研究生命周期 | ✅（须点名缺哪条 ✓） |
| `ARCHIVE_RETENTION_EXCEEDED` | 归档保留上限被触及（**只报告不静默** ✓） | `kernel/library.js` 面 | ✅ |
| `SCRIPT_CHANGED_SINCE_LAST_RECEIPT` | 脚本内容与上次回执**不一致**（可复现性警告 ✓） | `kernel/script-bridge.js` 面 | ✅ |
| `SCRIPT_CHANGED_DURING_RUN` | 运行**期间**脚本被改（结果可信度警告 ✓） | 同上 | ✅ |
| `VMU_TX_STEP_NOT_COMPENSABLE` | 事务步骤**缺 `undo`**（`begin` 就拒 ✗✓，不许事后才发现回不去 ✓；实现于 `kernel/transaction.js` ✓） | 一致性内核 | ✅（须点名**第几步＋缺哪个方向** ✓） |
| `VMU_RATE_LIMITED` | **超限**（实现于 `kernel/ratelimit.js` ✓） | 限流 | ✅（须给 **retryAfterMs** ✓；**不得静默丢弃** ✗） |
| `VMU_AUDIT_CHAIN_NO_HASHER` | **哈希接缝未注入**（实现于 `kernel/auditchain.js` ✓；**绝不产出"看起来合法"的假哈希** ✗✓） | 防篡改审计 | ✅（须说明接缝由宿主/插件提供 ✓） |
| `VMU_AUDIT_CHAIN_TRUNCATED` | 链验证**只覆盖前 N 行**（告知码 ✓；**不得冒充"整链已验证"** ✗✓） | 防篡改审计 | ✅（须给**已验/未验**条数 ✓） |
| `VMU_CLOCK_UNGUARDED` | 时钟**未被守卫**（实现于 `kernel/clockguard.js` ✓；回拨会同时废掉 TTL 与幂等 ✗✓） | 时钟守卫 | ✅（须说明如何接入守卫 ✓） |
| `VMU_CLOCK_BACKWARD` | 时钟**回拨**（实现于 `kernel/clockguard.js` ✓） | 时钟守卫 | ✅（须给 **from/last** 与策略 ✓） |
| `VMU_CLOCK_FORWARD_JUMP` | 时钟**异常前跳**（实现于 `kernel/clockguard.js` ✓；一次前跳曾能**清空幂等台账并重置限流** ✗✓） | 时钟守卫 | ✅（须给 **from/to/jumpMs/阈值** ✓） |
| `VMU_AUDIT_CHAIN_ANCHOR_MISSING` | 无锚点写接缝却要求持久化（实现于 `kernel/auditchain.js` ✓） | 防篡改审计 | ✅（须说明检查点未被外部保留 ⇒ **删尾无法检出** ✗✓） |
| `VMU_AUDIT_CHAIN_ANCHOR_FAILED` | 锚点**写入被拒**（`write` 返回 false；实现于 `kernel/auditchain.js` ✓） | 防篡改审计 | ✅（**绝不假装已保存** ✗✓） |
| `VMU_AUDIT_CHAIN_ANCHOR_UNREADABLE` | 锚点**读不回**（读失败/为空/只写/未注入；实现于 `kernel/auditchain.js` ✓） | 防篡改审计 | ✅（**不得静默降级为"未锚定"** ✗✓） |
| `VMU_AUDIT_CHAIN_ANCHOR_TAMPERED` | **锚点自身被改**（cp 的 `mac` 不符；实现于 `kernel/auditchain.js` ✓） | 防篡改审计 | ✅（**必须与"链被改"区分开** ✗✓ —— 两者含义不同 ✓） |
| `VMU_AUDIT_CHAIN_ANCHOR_MISMATCH` | **多份锚点副本不一致**（实现于 `kernel/auditchain.js` ✓） | 防篡改审计 | ✅（须**点名哪一份不同** ✓；**不得择一相信** ✗✓） |
| `VMU_AUDIT_CHAIN_ANCHOR_CORRUPT` | 锚点**损坏/不可解析/形状未知**（实现于 `kernel/auditchain.js` ✓） | 防篡改审计 | ✅（**必须与"从未写过"区分** ✗✓✓ —— 否则事故中会把**篡改**误判为"从未 checkpoint" ✓；`UNREADABLE` 现专指"从未写过/为空" ✓） |
| `VMU_AUCTION_MIN_BIDS` | 竞标未达最少投标数（实现于 `kernel/bidding.js` ✓） | 治理/竞标 | ✅（**已实现** ✓；触发位置 `kernel/bidding.js:39` ✓） |
| `VMU_AWARD_RATIONALE_REQUIRED` | 授标缺理由（实现于 `kernel/bidding.js` ✓） | 治理/竞标 | ✅（**已实现** ✓；`kernel/bidding.js:39` ✓） |
| `VMU_MATH_NOT_CONVERGED` | 数值迭代**未收敛**（实现于 `kernel/mathtools.js` ✓） | 数学计算 | ✅（**已实现** ✓；`kernel/mathtools.js:452` ✓ —— **不得冒充已收敛** ✗✓） |
| `VMU_PACK_INSTITUTE_MIN_FROZEN_ROUND` | 整合包**轮次已冻结**后仍要改（实现于 `packs/institute-min.js` ✓） | 整合包 | ✅（**已实现** ✓；`packs/institute-min.js:34` ✓） |
| `VMU_PACK_INSTITUTE_MIN_NOT_LOCKED` | 整合包**未锁定**即需锁定态才能做的操作（实现于 `packs/institute-min.js` ✓） | 整合包 | ✅（**已实现** ✓；`packs/institute-min.js:33`／`:68` ✓） |
| `VMU_PACK_V3_CORE_MANUAL_GATE` | v3 核心**人工闸**未通过（实现于 `packs/v3-core.js` ✓） | 整合包 | ✅（**已实现** ✓；`packs/v3-core.js:36`／`:109` ✓） |
| `VMU_PACK_V3_CORE_VERIFIER_QUORUM` | v3 核心**验证者法定人数**不足（实现于 `packs/v3-core.js` ✓） | 整合包 | ✅（**已实现** ✓；`packs/v3-core.js:35`／`:86` ✓） |
| `VMU_PACK_V5R_CORE_NOT_SETTLED` | v5r 核心**未结项**（实现于 `packs/v5r-core.js` ✓） | 整合包 | ✅（**已实现** ✓；`packs/v5r-core.js:33`／`:101` ✓） |
| `VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS` | v5r 核心**禁用临时脚本**（实现于 `packs/v5r-core.js` ✓） | 整合包 | ✅（**已实现** ✓；`packs/v5r-core.js:34`／`:72` ✓） |

> **本批 9 条是"实现真实产出但文档此前未登记"的码** ✓✓（由文档复核逐条 `grep` 实测发现 ✓）：`kernel/bidding.js`／`kernel/mathtools.js` 属框架/模块码 ✓，7 个 `VMU_PACK_*` 属整合包码 ✓ —— **登记 ≠ 批准新增**：它们**早已在实现里**，这里只是补上登记（**"文档有实现无"是漂移，本条即其修复** ✓）。

<!-- PLANNED-CODES:BEGIN (generated by scripts/generate-planned-codes.mjs — do not hand-edit) -->

> **以下为设计阶段登记的计划错误码（生成块 ✓）**：由 `scripts/generate-planned-codes.mjs` 从各设计卷抽取 ✓，
> 与上表同属 **唯一登记表** ✓；**未实现**（`⛔`）⇒ 实现时把它们移入手写上表并补全语义与触发时机 ✓。

| 码 | 语义 | 来源 | 状态 |
|---|---|---|---|
| `VMU_A11Y_ALT_TEXT_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 21 | ⛔ |
| `VMU_A11Y_CONTRAST_DECLARATION_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 21 | ⛔ |
| `VMU_A11Y_HEADING_GAP` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 21 | ⛔ |
| `VMU_A11Y_LANG_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 21 | ⛔ |
| `VMU_A11Y_LINK_TEXT_AMBIGUOUS` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 21 | ⛔ |
| `VMU_A11Y_MATH_ALT_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 21 | ⛔ |
| `VMU_A11Y_READING_ORDER_RISK` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 21 | ⛔ |
| `VMU_A11Y_TABLE_HEADER_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 21 | ⛔ |
| `VMU_ACTING_NOT_ALLOWED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_AE_REPORT_OVERDUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_AGREEMENT_EXPIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_AGREEMENT_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_AGREEMENT_SCOPE_VIOLATION` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_AGREEMENT_SIGNATURE_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_AGREEMENT_UNSIGNED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_ALIAS_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 13 | ⛔ |
| `VMU_ALLOCATION_REMAINDER` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_AMOUNT_NOT_INTEGER` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_ANESTHESIA_UNDECLARED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_ANIMAL_LEDGER_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_APPROVAL_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_ARBITER_IS_PARTY` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_ARCHIVE_RECEIPT_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_ARCHIVE_TARGET_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_ASSIGNMENT_ATTEMPTS_EXHAUSTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_ASSIGNMENT_DUE_PASSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_ASSIGNMENT_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_AUCTION_CLOSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_AUCTION_INVALID_BID` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_AUCTION_LIMIT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_AVAILABILITY_VAGUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_BADGE_MISMATCH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_BIOSAMPLE_CHAIN_GAP` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_BIOSAMPLE_DESTROYED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_BIOSAMPLE_FREEZE_THAW_LIMIT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_BIOSAMPLE_NOT_REGISTERED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_BIOSAMPLE_SUBJECT_LINK_FORBIDDEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_BLIND_MAPPING_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_BLIND_UNBIND_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_BUILD_NOT_REPRODUCIBLE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_CAPACITY_EXHAUSTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CAPACITY_FACILITY_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CAPACITY_FORECAST_STALE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CAPACITY_POOL_LOW` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CAPACITY_PREEMPTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CAPACITY_STORAGE_WARN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CHARTER_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_CHARTER_DEPTH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_CHARTER_DISSOLVE_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_CHARTER_FISSION_LIMIT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_CHARTER_FROZEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_CHARTER_NOT_AUTHORIZED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 11 | ⛔ |
| `VMU_CHARTER_QUORUM` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_CITE_ID_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_COI_VIOLATION` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_COLLAB_AGREEMENT_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COLLAB_AUTHORSHIP_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COLLAB_DSA_EXPIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COLLAB_SETTLEMENT_MISMATCH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COLLUSION_SUSPECTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_COMPAT_MATRIX_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 11 | ⛔ |
| `VMU_COMPLIANCE_APPROVAL_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COMPLIANCE_CALENDAR_MISSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COMPLIANCE_COI_UNDISCLOSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COMPLIANCE_EVIDENCE_INCOMPLETE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COMPLIANCE_EXPORT_BLOCKED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COMPLIANCE_OVERDUE_BLOCK` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CONFLICT_LIMIT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_CONFLICT_STALE_REVISION` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_CONFLICT_TARGET_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_CONF_ASSIGNMENT_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CONF_CAP_REACHED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CONF_CFP_CLOSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CONF_FEE_UNPAID` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CONF_REGISTRATION_CLOSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CONF_REVIEW_QUORUM_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CONF_SCHEDULE_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CONF_SUBMISSION_INVALID` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CONSENSUS_NOT_REACHED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_CONSENT_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_CONSENT_VERSION_MISMATCH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_CONSENT_WITHDRAWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_COURSE_CLOSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_COURSE_COHORT_FULL` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_COURSE_DISABLED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_COURSE_ENROLL_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_COURSE_PRIVACY_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_COURSE_RUBRIC_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_COURSE_UNIT_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_CROSSBORDER_CURRENCY_MISMATCH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CROSSBORDER_GATE_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_CROSS_BORDER_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_CURRENCY_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_DATA_CLASS_MISMATCH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_DEDUPE_REFCOUNT_UNDERFLOW` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_DELEGATION_BUDGET` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DELEGATION_DEPTH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DELEGATION_ESCALATION` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DELEGATION_EXPIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DELEGATION_REASON_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DEPRECATION_SILENT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 13 | ⛔ |
| `VMU_DISCIPLINE_CIRCUIT_OPEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DISCIPLINE_POSTMORTEM_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DISCIPLINE_QUOTA` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DISCIPLINE_SUSPENDED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DOMAIN_PACK_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_DUTY_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_ENTITY_ACCOUNT_UNBOUND` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_ENTITY_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_EQUIP_CALIBRATION_DUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_EQUIP_CAPTURE_UNLINKED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_EQUIP_CERT_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_EQUIP_HOLD_LIMIT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_EQUIP_MAINTENANCE_BLOCKED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_EQUIP_NOT_REGISTERED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_EQUIP_OWNER_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_EQUIP_SLOT_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_EQUIP_WAITLIST_FULL` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_ETHICS_APPROVAL_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_EXPLAIN_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_EXPORT_VISIBILITY_BLOCKED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_EXTERNAL_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_EXTERNAL_QUERY_INVALID` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_EXTERNAL_STALE_SERVED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_FACILITY_UNACCREDITED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_FAIRNESS_CONCENTRATION` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_FAIRNESS_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_FAIRNESS_QUOTA` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_FORBIDDEN_CAPABILITY` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_FP_ALGO_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_FUNDING_ACCOUNT_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_FUNDING_APPROVAL_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_FUNDING_AUDIT_PACK_INCOMPLETE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_FUNDING_COSTSHARE_UNBALANCED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_FUNDING_LINE_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_FUNDING_OVER_BUDGET` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_FUNDING_RECEIPT_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_FUNDING_SETTLEMENT_OVERDUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_FUNDING_UNAPPROVED_EXPENSE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_FX_DIRECTION_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_FX_RATE_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_FX_RATE_STALE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_GATE_UNSATISFIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_GC_REFUSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_GLOSSARY_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 06 | ⛔ |
| `VMU_GLOSSARY_UNKNOWN_TERM` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 06 | ⛔ |
| `VMU_GRADE_IMMUTABLE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_HANDOVER_FALLBACK_USED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_HANDOVER_INCOMPLETE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_HANDOVER_NOT_ACCEPTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_HANDOVER_PACK_TOO_BIG` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_HANDOVER_TIMEOUT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_HEAD_FIELD_IMMUTABLE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_HISTORY_CHAIN_BROKEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_HR_APPEAL_OPEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_HR_AUTODECISION_FORBIDDEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_HR_CYCLE_CLOSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_HR_OFFBOARDING_INCOMPLETE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_HR_PERF_EVIDENCE_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_HR_TENURE_DECISION_DUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_HR_TENURE_QUORUM_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_HUMANE_ENDPOINT_REPORT_OVERDUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_HUMAN_APPROVAL_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_HUMAN_TIMEOUT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_HUMAN_VETOED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_IACUC_APPROVAL_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_IACUC_EXPIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_IDENTITY_ENDS_WITH_OPEN_WORK` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_IDENTITY_ISSUER_UNTRUSTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_IDENTITY_MULTI_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_IDENTITY_PSEUDONYM_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_IDENTITY_TRANSFER_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_IDENTITY_UNBOUND` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_IMPORT_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_INCIDENT_FROZEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_IO_FAILED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 08 | ⛔ |
| `VMU_IP_CONFIDENTIALITY_BREACH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_IP_CONTRIB_EVIDENCE_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_IP_DISCLOSURE_INCOMPLETE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_IP_DISCLOSURE_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_IP_HOLD_EXEMPTION_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_IP_OWNERSHIP_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_IP_PRIORART_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_IP_PUBLICATION_HOLD` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_IP_TRANSFER_UNLICENSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_KEY_UNAVAILABLE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_KILL_SWITCH_ENGAGED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_LICENSE_INCOMPATIBLE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_LOCALE_FALLBACK` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 06 | ⛔ |
| `VMU_LOCALE_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 06 | ⛔ |
| `VMU_LOCK_TIMEOUT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_MATH_TIMEOUT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 11 | ⛔ |
| `VMU_MEMORY_CARD_INVALID` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_MEMORY_COMPACTION_REFUSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_MEMORY_KEY_UNSCOPED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_MEMORY_VISIBILITY_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_MENTOR_REVIEW_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_MENTOR_SELF_PAIR` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_MENTOR_UNAVAILABLE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_MIGRATE_CONFIRM_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 13 | ⛔ |
| `VMU_MIGRATE_UNCOVERED_PRESENT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 13 | ⛔ |
| `VMU_MONEY_MIXED_CURRENCY` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_MONEY_NEGATIVE_FORBIDDEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_MONEY_OVERFLOW` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_MW_ORDER_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 13 | ⛔ |
| `VMU_NEGOTIATION_FAILED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_NETWORK_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_NOTIFY_CHANNEL_FAILED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_NOTIFY_DEDUPED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_NOTIFY_DIGEST_PENDING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_NOTIFY_QUIET_SUPPRESSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_NOTIFY_REASON_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_NOTIFY_SNR_BELOW_FLOOR` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_NOTIFY_TRUNCATED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_OUTREACH_ANONYMITY_BREACH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_OUTREACH_EMBARGO` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_OUTREACH_EVIDENCE_MISMATCH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_OUTREACH_IMPACT_INCOMPLETE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_OUTREACH_MEDIA_UNAUTHORIZED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_OUTREACH_REF_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_PACK_MANIFEST_MISMATCH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_PACK_T53_DENY` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 19 | ⛔ |
| `VMU_PACK_TASK_UNVERIFIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 19 | ⛔ |
| `VMU_PACK_VOTING_NOT_LOCKED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 19 | ⛔ |
| `VMU_PATH_ESCAPE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_PATH_INVALID` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_PRIVACY_VIOLATION` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_PROBATION_ACTIVE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_PROMPT_SECTION_DRIFT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 13 | ⛔ |
| `VMU_PROTOCOL_DEVIATION_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_REASON_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_RECALL_QUORUM_NOT_MET` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_RECRUIT_CLOSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_RECRUIT_EVIDENCE_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_REGISTRATION_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_REL_BACKLINK_STALE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_REL_CYCLE_DETECTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_REL_DEPTH_EXCEEDED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_REL_DISABLED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_REL_VOCAB_VIOLATION` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_RESOURCE_EXCEEDED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_RETENTION_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_REVIEWER_OVERLOADED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_REVIEW_DUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_REVIEW_EVIDENCE_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_REVIEW_NOT_ELIGIBLE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_REVIEW_ROUNDS_EXHAUSTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_REVIEW_RUBRIC_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_REVIEW_SELF_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_ROLE_TERM_EXPIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_ROUNDING_UNDEFINED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_SAE_REPORT_OVERDUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_SCALE_MISMATCH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_SCHEDULE_OVERDUE_REPORT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_SCHEDULE_RECURRENCE_INVALID` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_SCHEDULE_TRIGGER_FORBIDDEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_SCHEDULE_TZ_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_SCHEDULE_WINDOW_INVALID` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_SEARCH_UNEXPLAINED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_SIGNATURE_INVALID` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_SKILL_DEGRADED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_SKILL_EVIDENCE_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_SKILL_RETIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_SKILL_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_SLOT_FULL` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_SLOT_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_SOCIETY_DISABLED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_STORE_VERSION_NEWER` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_SUBMISSION_DUPLICATE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_SUBMISSION_INCOMPLETE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_SUBMISSION_WITHDRAWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_SUPPLYCHAIN_UNLOCKED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_TAX_FIELD_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_THREE_R_INCOMPLETE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_TOPOLOGY_UNSUPPORTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_TRAINING_EXPIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_TRASH_EXPIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_TRUST_APPEAL_WINDOW` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_TRUST_EVIDENCE_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_TRUST_SELF_SCORE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_TRUST_USE_FORBIDDEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_UNBLINDING_UNLOGGED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_VERSION_CHAIN_BROKEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 11 | ⛔ |
| `VMU_WATCH_CHANNEL_UNSUPPORTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WATCH_CROSS_INSTITUTION_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WATCH_DUPLICATE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WATCH_EVENT_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WATCH_LIMIT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WATCH_SUBJECT_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WATCH_VISIBILITY_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WRITE_PARTIAL` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |

### 8.1 实现状态一览（**生成 ✓**；登记 ≠ 已实现 ✗）

> 手写表登记 **202** 个码，**逐行**给出状态 ✓：其中 **162** 个**已实现 ✓**（能在运行时代码里找到该码字符串 ✓），
> **40** 个**提案 ⛔**（暂时只存在于表里）✓ —— 这不是错误 ✓，但**不得**把"已登记"当作"会被抛出" ✗；
> 本节由 `scripts/generate-planned-codes.mjs` 重算 ✓：删改任一码、或让某个"提案"码出现在运行时代码里，都会让 `--check` 变红 ✓，
> 并由 `tests/audit-code-status.test.mjs` 逐行核对报告与代码 ✓（含故意造错自证 ✓）。

| 码 | 状态 | 在哪实现（文件） | 备注 |
|---|---|---|---|
| `VMU_AGENDA_ITEM_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/governance.js` | 代码里有该码字符串 ✓ |
| `VMU_AGENDA_OWNER_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/governance.js` | 代码里有该码字符串 ✓ |
| `VMU_AGENDA_SPLIT_DEPTH` | **已实现 ✓** | `vibe-math-vmu/kernel/governance.js` | 代码里有该码字符串 ✓ |
| `VMU_ALERT_SILENCED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js` | 代码里有该码字符串 ✓ |
| `VMU_ALERT_SUPPRESSED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js` | 代码里有该码字符串 ✓ |
| `VMU_ALIAS_AMBIGUOUS` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_AMENDMENT_REJECTED` | **已实现 ✓** | `vibe-math-vmu/kernel/governance.js` | 代码里有该码字符串 ✓ |
| `VMU_ARBITER_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/arbitration.js` | 代码里有该码字符串 ✓ |
| `VMU_ARBITRATION_OFF` | **已实现 ✓** | `vibe-math-vmu/kernel/arbitration.js` | 代码里有该码字符串 ✓ |
| `VMU_AUCTION_MIN_BIDS` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_AUDIT_CHAIN_ANCHOR_CORRUPT` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js` | 代码里有该码字符串 ✓ |
| `VMU_AUDIT_CHAIN_ANCHOR_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js` | 代码里有该码字符串 ✓ |
| `VMU_AUDIT_CHAIN_ANCHOR_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js` | 代码里有该码字符串 ✓ |
| `VMU_AUDIT_CHAIN_ANCHOR_MISSING` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js` | 代码里有该码字符串 ✓ |
| `VMU_AUDIT_CHAIN_ANCHOR_TAMPERED` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js` | 代码里有该码字符串 ✓ |
| `VMU_AUDIT_CHAIN_ANCHOR_UNREADABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js` | 代码里有该码字符串 ✓ |
| `VMU_AUDIT_CHAIN_NO_HASHER` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js` | 代码里有该码字符串 ✓ |
| `VMU_AUDIT_CHAIN_TRUNCATED` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js` | 代码里有该码字符串 ✓ |
| `VMU_AUDIT_WRITE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/audit.js` | 代码里有该码字符串 ✓ |
| `VMU_AWARD_RATIONALE_REQUIRED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_BALLOT_ABSTAIN_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js` | 代码里有该码字符串 ✓ |
| `VMU_BALLOT_FROZEN` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_BALLOT_METHOD_UNSUPPORTED` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js` | 代码里有该码字符串 ✓ |
| `VMU_BALLOT_MIN_VOTES_NOT_MET` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js` | 代码里有该码字符串 ✓ |
| `VMU_BALLOT_ROUNDS_EXHAUSTED` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js` | 代码里有该码字符串 ✓ |
| `VMU_BALLOT_SECRECY_LOCKED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_BALLOT_TIE_UNRESOLVED` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js` | 代码里有该码字符串 ✓ |
| `VMU_BODY_TRUNCATED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js` | 代码里有该码字符串 ✓ |
| `VMU_BUDGET_RESERVE_EXHAUSTED` | **已实现 ✓** | `vibe-math-vmu/kernel/budget.js` | 代码里有该码字符串 ✓ |
| `VMU_BUDGET_SCOPE_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/budget.js` | 代码里有该码字符串 ✓ |
| `VMU_CLOCK_BACKWARD` | **已实现 ✓** | `vibe-math-vmu/kernel/clockguard.js` | 代码里有该码字符串 ✓ |
| `VMU_CLOCK_FORWARD_JUMP` | **已实现 ✓** | `vibe-math-vmu/kernel/clockguard.js` | 代码里有该码字符串 ✓ |
| `VMU_CLOCK_UNGUARDED` | **已实现 ✓** | `vibe-math-vmu/kernel/clockguard.js` | 代码里有该码字符串 ✓ |
| `VMU_COMPAT_UNKNOWN_COMBO` | **已实现 ✓** | `vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/stateversion.js`、`vibe-math-vmu/kernel/storepolicy.js` | 代码里有该码字符串 ✓ |
| `VMU_CONFLICT` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/ballotbox.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/governance.js`、`vibe-math-vmu/kernel/instruments.js`、`vibe-math-vmu/kernel/storepolicy.js` | 代码里有该码字符串 ✓ |
| `VMU_CONTROL_NO_TIMER` | **已实现 ✓** | `vibe-math-vmu/kernel/scheduler.js` | 代码里有该码字符串 ✓ |
| `VMU_CONTROL_SCOPE_UNKNOWN` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_CRYPTO_KEY_EXPIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_CRYPTO_KEY_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js`、`vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_CRYPTO_NO_KEY` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js`、`vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_CRYPTO_PAYLOAD_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_CRYPTO_SIGNATURE_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_CRYPTO_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js`、`vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_CRYPTO_VERIFY_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_DEGRADED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_ENGINE_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/host-hooks.js`、`vibe-math-vmu/host-math.js`、`vibe-math-vmu/host-spawn.js`、`vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/loader.js`、`vibe-math-vmu/kernel/math.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/script-bridge.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_EXTERNAL_DISABLED` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js`、`vibe-math-vmu/kernel/records.js` | 代码里有该码字符串 ✓ |
| `VMU_EXTERNAL_RECEIPT_INCOMPLETE` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js` | 代码里有该码字符串 ✓ |
| `VMU_EXTERNAL_STALE` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js` | 代码里有该码字符串 ✓ |
| `VMU_EXTERNAL_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js`、`vibe-math-vmu/kernel/formal.js`、`vibe-math-vmu/kernel/lifecycle.js`、`vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/records.js` | 代码里有该码字符串 ✓ |
| `VMU_FORMAL_ADAPTER_UNSUPPORTED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_FORMAL_AXIOM_UNTRUSTED` | **已实现 ✓** | `vibe-math-vmu/kernel/formal.js`、`vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_FORMAL_DISAGREEMENT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_FORMAL_LIBRARY_NOT_INDEXED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_FORMAL_NOT_FOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/formal.js` | 代码里有该码字符串 ✓ |
| `VMU_FORMAL_REPRO_INCOMPLETE` | **已实现 ✓** | `vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/repropack.js` | 代码里有该码字符串 ✓ |
| `VMU_FORMAL_SKELETON_UNAVAILABLE` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_FORMAL_SORRY_FOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/formal.js`、`vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_IDEMPOTENCY_KEY_REUSED` | **已实现 ✓** | `vibe-math-vmu/kernel/idempotency.js` | 代码里有该码字符串 ✓ |
| `VMU_INDEX_STALE` | **已实现 ✓** | `vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/stateversion.js` | 代码里有该码字符串 ✓ |
| `VMU_INVALID_ARGUMENT` | **已实现 ✓** | `vibe-math-vmu/host-math.js`、`vibe-math-vmu/host-spawn.js`、`vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/arbitration.js`、`vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/board.js`、`vibe-math-vmu/kernel/bus.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/charter.js`、`vibe-math-vmu/kernel/clockguard.js`、`vibe-math-vmu/kernel/compliance.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/delegation.js`、`vibe-math-vmu/kernel/domaingate.js`、`vibe-math-vmu/kernel/fairness.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/guard.js`、`vibe-math-vmu/kernel/handover.js`、`vibe-math-vmu/kernel/hr.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/library.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/memory.js`、`vibe-math-vmu/kernel/metrics.js`、`vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/minutes.js`、`vibe-math-vmu/kernel/notify.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/publication.js`、`vibe-math-vmu/kernel/ratelimit.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/registry.js`、`vibe-math-vmu/kernel/replay.js`、`vibe-math-vmu/kernel/rules.js`、`vibe-math-vmu/kernel/scheduler.js`、`vibe-math-vmu/kernel/script-bridge.js`、`vibe-math-vmu/kernel/skills.js`、`vibe-math-vmu/kernel/store.js`、`vibe-math-vmu/kernel/storepolicy.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kernel/timevalue.js`、`vibe-math-vmu/kernel/topology.js`、`vibe-math-vmu/kernel/transaction.js`、`vibe-math-vmu/kernel/trust.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_JOB_CANCELLED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_JOB_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/script-bridge.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_COMPILE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/formal.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_EXIT_NONZERO` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_FILE_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_FILE_UNREADABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_HASH_CHANGED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_NOT_FOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_NOT_SETTLED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_SPAWN_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_STATEMENT_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LIFECYCLE_BAD_STAGE_ID` | **已实现 ✓** | `vibe-math-vmu/kernel/lifecycle.js` | 代码里有该码字符串 ✓ |
| `VMU_LIFECYCLE_EVIDENCE_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/lifecycle.js` | 代码里有该码字符串 ✓ |
| `VMU_LIFECYCLE_GATE_UNMET` | **已实现 ✓** | `vibe-math-vmu/kernel/lifecycle.js` | 代码里有该码字符串 ✓ |
| `VMU_LIFECYCLE_ILLEGAL_STEP` | **已实现 ✓** | `vibe-math-vmu/kernel/lifecycle.js` | 代码里有该码字符串 ✓ |
| `VMU_LIFECYCLE_NOT_DECLARED` | **已实现 ✓** | `vibe-math-vmu/kernel/lifecycle.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_ARTIFACT_TOO_LARGE` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_ASSUMPTION_CONFLICT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_CACHE_CORRUPT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_DIMENSION_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_INTERVAL_EMPTY` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_INVALID_INPUT` | **已实现 ✓** | `vibe-math-vmu/kernel/formal.js`、`vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_JOB_PERSIST_FAILED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_NONCONVERGENT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_NOT_CONVERGED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_PRECISION_LOST` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_REPRO_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/kernel/formal.js`、`vibe-math-vmu/kernel/repropack.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_RESIDUAL_TOO_LARGE` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_RESOURCE_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_SANDBOX_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_SEED_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/repropack.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_SINGULAR_MATRIX` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_UNSUPPORTED_OP` | **已实现 ✓** | `vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_APPEAL_OUT_OF_SCOPE` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_CONFIDENTIAL_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_DISCIPLINE_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_EMERGENCY_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_INTERRUPT_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_ORDER_DENIED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MEETING_QUORUM_LOST` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_RECESS_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_SPEECH_TIMEBOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_TOO_SMALL` | **已实现 ✓** | `vibe-math-vmu/kernel/meeting.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_UNANSWERED_POLICY` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MEMORY_NOT_AUTHORITY` | **已实现 ✓** | `vibe-math-vmu/kernel/memory.js` | 代码里有该码字符串 ✓ |
| `VMU_META_VALIDATION_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/instruments.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/lifecycle.js`、`vibe-math-vmu/kernel/stateversion.js`、`vibe-math-vmu/kernel/storepolicy.js` | 代码里有该码字符串 ✓ |
| `VMU_METRICS_TRIGGER_FORBIDDEN` | **已实现 ✓** | `vibe-math-vmu/kernel/metrics.js` | 代码里有该码字符串 ✓ |
| `VMU_METRIC_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/metrics.js` | 代码里有该码字符串 ✓ |
| `VMU_MIDDLEWARE_FAILED` | **已实现 ✓** | `vibe-math-vmu/host-spawn.js`、`vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/bus.js`、`vibe-math-vmu/kernel/loader.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/registry.js`、`vibe-math-vmu/kernel/rules.js`、`vibe-math-vmu/kernel/script-bridge.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_MIDDLEWARE_REJECTED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/bus.js` | 代码里有该码字符串 ✓ |
| `VMU_MIGRATE_DRYRUN_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/stateversion.js` | 代码里有该码字符串 ✓ |
| `VMU_MINUTES_ACTION_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/minutes.js` | 代码里有该码字符串 ✓ |
| `VMU_MINUTES_DISSENT_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/minutes.js` | 代码里有该码字符串 ✓ |
| `VMU_MINUTES_NOT_CONFIRMED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/minutes.js` | 代码里有该码字符串 ✓ |
| `VMU_MOTION_EXPIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/governance.js` | 代码里有该码字符串 ✓ |
| `VMU_MOTION_NOT_SECONDED` | **已实现 ✓** | `vibe-math-vmu/kernel/governance.js` | 代码里有该码字符串 ✓ |
| `VMU_MOTION_TABLE_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/governance.js` | 代码里有该码字符串 ✓ |
| `VMU_MOTION_WITHDRAWN` | **已实现 ✓** | `vibe-math-vmu/kernel/governance.js` | 代码里有该码字符串 ✓ |
| `VMU_NAME_CONFLICT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_NOTIFY_DELIVERY_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/notify.js` | 代码里有该码字符串 ✓ |
| `VMU_NOTIFY_DISABLED` | **已实现 ✓** | `vibe-math-vmu/kernel/notify.js` | 代码里有该码字符串 ✓ |
| `VMU_NOTIFY_EVENT_UNREGISTERED` | **已实现 ✓** | `vibe-math-vmu/kernel/notify.js` | 代码里有该码字符串 ✓ |
| `VMU_NOTIFY_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/notify.js` | 代码里有该码字符串 ✓ |
| `VMU_NOTIFY_NO_TRANSPORT` | **已实现 ✓** | `vibe-math-vmu/kernel/notify.js` | 代码里有该码字符串 ✓ |
| `VMU_NOT_FOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/governance.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/instruments.js`、`vibe-math-vmu/kernel/lifecycle.js`、`vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/repropack.js`、`vibe-math-vmu/kernel/stateversion.js` | 代码里有该码字符串 ✓ |
| `VMU_NOT_MEMBER` | **已实现 ✓** | `vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/governance.js`、`vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_NOT_PERMITTED` | **已实现 ✓** | `vibe-math-vmu/host-hooks.js`、`vibe-math-vmu/host-math.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/arbitration.js`、`vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/charter.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/delegation.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/guard.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/instruments.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/storepolicy.js` | 代码里有该码字符串 ✓ |
| `VMU_NO_OPEN_MEETING` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/minutes.js` | 代码里有该码字符串 ✓ |
| `VMU_NO_SUCH_OBJECT` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/arbitration.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/charter.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/delegation.js`、`vibe-math-vmu/kernel/fairness.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/handover.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/library.js`、`vibe-math-vmu/kernel/loader.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/memory.js`、`vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/minutes.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/registry.js`、`vibe-math-vmu/kernel/replay.js`、`vibe-math-vmu/kernel/retention.js`、`vibe-math-vmu/kernel/rules.js`、`vibe-math-vmu/kernel/scheduler.js`、`vibe-math-vmu/kernel/skills.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kernel/transaction.js`、`vibe-math-vmu/kernel/work.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_CONFLICT` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/pack.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_INSTITUTE_MIN_FROZEN_ROUND` | **已实现 ✓** | `vibe-math-vmu/packs/institute-min.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_INSTITUTE_MIN_NOT_LOCKED` | **已实现 ✓** | `vibe-math-vmu/packs/institute-min.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_KERNEL_OVERRIDE_REFUSED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_PACK_MISSING` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_CORE_MANUAL_GATE` | **已实现 ✓** | `vibe-math-vmu/packs/v3-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_CORE_VERIFIER_QUORUM` | **已实现 ✓** | `vibe-math-vmu/packs/v3-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_NOT_SETTLED` | **已实现 ✓** | `vibe-math-vmu/packs/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS` | **已实现 ✓** | `vibe-math-vmu/packs/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PARAM_DEPRECATED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_PARAM_REMOVED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_PARAM_RENAMED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_PATH_ESCAPE_REFUSED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_PROXY_CHAIN_TOO_DEEP` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_PROXY_NOT_ALLOWED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_QUOTA_EXCEEDED` | **已实现 ✓** | `vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/retention.js` | 代码里有该码字符串 ✓ |
| `VMU_QUOTA_SOFT_EXCEEDED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/retention.js` | 代码里有该码字符串 ✓ |
| `VMU_RATE_LIMITED` | **已实现 ✓** | `vibe-math-vmu/kernel/ratelimit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECOUNT_MISMATCH` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_RECOUNT_SCOPE_DENIED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_RECRUIT_NOT_APPLIED` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECRUIT_OFFER_EXPIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECRUIT_PROBATION_NOT_DUE` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECRUIT_REASON_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECRUIT_SEATS_EXCEEDED` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECRUIT_SLOT_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECUSAL_REQUIRED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_REF_DANGLING` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_REOPEN_FLOOR_NOT_MET` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_REOPEN_WRONG_INITIATOR` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_REPRO_COPY_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/repropack.js` | 代码里有该码字符串 ✓ |
| `VMU_RESOURCE_BUDGET` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/budget.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/instruments.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/replay.js`、`vibe-math-vmu/kernel/stateversion.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kernel/transaction.js` | 代码里有该码字符串 ✓ |
| `VMU_RETENTION_TRUNCATED` | **已实现 ✓** | `vibe-math-vmu/kernel/retention.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLLBACK_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLLBACK_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/migration.js` | 代码里有该码字符串 ✓ |
| `VMU_SCHEDULER_ACTION_FORBIDDEN` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_SCHEDULER_TRIGGER_LIMIT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_SCHEDULE_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/scheduler.js` | 代码里有该码字符串 ✓ |
| `VMU_SKILL_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/skills.js` | 代码里有该码字符串 ✓ |
| `VMU_SKILL_SELF_ATTEST` | **已实现 ✓** | `vibe-math-vmu/kernel/skills.js` | 代码里有该码字符串 ✓ |
| `VMU_SKILL_VOCAB_VIOLATION` | **已实现 ✓** | `vibe-math-vmu/kernel/skills.js` | 代码里有该码字符串 ✓ |
| `VMU_SLO_BUDGET_EXHAUSTED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js` | 代码里有该码字符串 ✓ |
| `VMU_STATE` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/arbitration.js`、`vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/charter.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/delegation.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/memory.js`、`vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/scheduler.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kernel/transaction.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_STORE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/store.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_STORE_MIGRATION` | **已实现 ✓** | `vibe-math-vmu/kernel/store.js` | 代码里有该码字符串 ✓ |
| `VMU_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js`、`vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_TOPOLOGY_CYCLE` | **已实现 ✓** | `vibe-math-vmu/kernel/topology.js` | 代码里有该码字符串 ✓ |
| `VMU_TOPOLOGY_PATH_FORBIDDEN` | **已实现 ✓** | `vibe-math-vmu/kernel/topology.js` | 代码里有该码字符串 ✓ |
| `VMU_TOPOLOGY_SIZE_EXCEEDED` | **已实现 ✓** | `vibe-math-vmu/kernel/topology.js` | 代码里有该码字符串 ✓ |
| `VMU_TRUST_VOCAB_VIOLATION` | **已实现 ✓** | `vibe-math-vmu/kernel/trust.js` | 代码里有该码字符串 ✓ |
| `VMU_TX_STEP_NOT_COMPENSABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/transaction.js` | 代码里有该码字符串 ✓ |
| `VMU_VERSION_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/migration.js` | 代码里有该码字符串 ✓ |
| `VMU_VETO_NOT_ALLOWED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_WATCH_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/notify.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_ARBITRATION_OFF` | **已实现 ✓** | `vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_CHECKPOINT_MISSING` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_WORKFLOW_COMPENSATION_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_DEP_TYPE_UNSUPPORTED` | **已实现 ✓** | `vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_ESCALATION_NOT_DUE` | **已实现 ✓** | `vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_ESCALATION_TARGET_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_GATE_BLOCKED` | **已实现 ✓** | `vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_GATE_NOT_MET` | **已实现 ✓** | `vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_RACI_MISSING_OWNER` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_WORKFLOW_RETRY_EXHAUSTED` | **已实现 ✓** | `vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_STAGE_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_SUBTASK_DEPTH` | **已实现 ✓** | `vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_TASK_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_TEMPLATE_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_TRANSITION_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/board.js`、`vibe-math-vmu/kernel/workflow.js` | 代码里有该码字符串 ✓ |
| `VMU_WORKFLOW_WIP_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/board.js` | 代码里有该码字符串 ✓ |
| `VMU_WRITE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js` | 代码里有该码字符串 ✓ |

提案码（40）：VMU_ALIAS_AMBIGUOUS、VMU_AUCTION_MIN_BIDS、VMU_AWARD_RATIONALE_REQUIRED、VMU_BALLOT_FROZEN、VMU_BALLOT_SECRECY_LOCKED、VMU_CONTROL_SCOPE_UNKNOWN、VMU_DEGRADED、VMU_FORMAL_DISAGREEMENT、VMU_FORMAL_LIBRARY_NOT_INDEXED、VMU_FORMAL_SKELETON_UNAVAILABLE、VMU_MATH_ARTIFACT_TOO_LARGE、VMU_MATH_ASSUMPTION_CONFLICT、VMU_MATH_CACHE_CORRUPT、VMU_MATH_INTERVAL_EMPTY、VMU_MATH_JOB_PERSIST_FAILED、VMU_MATH_NONCONVERGENT、VMU_MATH_NOT_CONVERGED、VMU_MATH_PRECISION_LOST、VMU_MATH_RESIDUAL_TOO_LARGE、VMU_MATH_SINGULAR_MATRIX、VMU_MEETING_ORDER_DENIED、VMU_MEETING_UNANSWERED_POLICY、VMU_NAME_CONFLICT、VMU_PACK_KERNEL_OVERRIDE_REFUSED、VMU_PARAM_DEPRECATED、VMU_PARAM_REMOVED、VMU_PARAM_RENAMED、VMU_PROXY_CHAIN_TOO_DEEP、VMU_PROXY_NOT_ALLOWED、VMU_RECOUNT_MISMATCH、VMU_RECOUNT_SCOPE_DENIED、VMU_RECUSAL_REQUIRED、VMU_REF_DANGLING、VMU_REOPEN_FLOOR_NOT_MET、VMU_REOPEN_WRONG_INITIATOR、VMU_SCHEDULER_ACTION_FORBIDDEN、VMU_SCHEDULER_TRIGGER_LIMIT、VMU_VETO_NOT_ALLOWED、VMU_WORKFLOW_CHECKPOINT_MISSING、VMU_WORKFLOW_RACI_MISSING_OWNER

<!-- PLANNED-CODES:END -->

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
