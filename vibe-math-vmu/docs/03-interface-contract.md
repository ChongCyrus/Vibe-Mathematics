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

**① 【核心**]服务（★ 下面是**值得逐个点名**的那些 ✓；括号内为出现条件 ✓）**

> ★★ **轮 527 更正** ✓：★ 本处原写 **72** ✗ —— ★★ **域合规两支服务已【降级出内核**]✓（★ 见 `docs/25` 的执行记录 ✓）⇒ **`registry.register` 实测注册 **80** 个服务** ✓（★ 轮 3／task-20 更新：轮 2 的 77 ＋ `vmu.activity`／`vmu.fidelity` 两个新面 ✓；★ 计数口径＝**静态注册点数**（含 5 个条件注册），与 `tests/audit-doc-vs-code-tables.test.mjs` 的判据一致 ✓）。
> ★★★ **口径（★ 轮 493 实测修正 ✓；轮 2/3 复核 ✓；PHASE 9 / 轮 4 起 **82**）**：★ **本表【不是**]发布面的全集** ✗ —— ★ **`kernel/index.js` 的 `registry.register` 实际注册了 **82** 个服务** ✓（★ 本表点名 **8** 个 ✓）。★★ **真源只有一个**：★ **`registry.register` 的调用点** ✓ ⇒ ★★ **要"发布面全集"就读代码，不要读这张表** ✓。★★★ **本行原先写"真正**发布**的服务"，★ 那会让读者以为发布面就是这 8 个** ✗ —— ★ **而漏掉的 74 个同样在契约里、同样可被 pack 的 `requires` 引用** ✓。
> ★★★ **PHASE 7 更正（★ 不改写上面的历史，★ 只追加）** ✓：★ 80 变 **81** 的原因是新增了 **`vmu.status`**
> ★★★ **PHASE 9 更正（★ 同上：★ 只追加 ✓）**：★ 81 变 **82** 的原因是新增了 **`vmu.env`**（★ 环境探测面：★ 标准 `probe`／`list`／`report` 三动作，★ 用 `vmu.env.needs` 声明本部署需要哪些外部环境）✓。★★ **口径不变**（★ 仍然是 `registry.register` 的静态注册点数）✓。 ✓
> ★★★ **PHASE 12 更正（★ 同上：★ 只追加 ✓）**：★ 82 变 **83** 的原因是新增了 **`vmu.meetingverdict`**（★ 裁决聚合面：★ 命题感知的行裁定 ＋ `rulePropositionProbability` 主入口，★ 由 `kernel/meetingverdict.js` 注册）✓。★★ 口径不变（★ 仍然是 `registry.register` 的静态注册点数）✓；★ 本轮同时**删除**了装配不可达的 `kernel/grant.js` —— ★ 它不是服务、不进这个数 ✓。
> ★ 它为什么存在：★ **pack 模块拿不到真 kernel**（★ `loader` 交付的 `services.kernel` 是 `Object.freeze({ read })` 只读门面，★ 而 `services.get` 的目录里没有 `vmu.kernel`）⇒ ★ **一个 pack 想贡献一段 `status()` 就【无路可走】** ✓
> ★★ 所以补的是**通用通道**而不是给单个功能开洞：★ `services.get('vmu.status')` 提供 **`registerSection(name, fn)`（返回 disposer）／`unregisterSection(name)`／`names()`**，★ 同名注册**具名拒**；★ 模块可导出 `dispose`，★ `pack.unload()` 会 `await` 它 ⇒ ★ **卸载真的清零** ✓
> ★★★ **计数口径不变**（★ 仍是 `registry.register` 的静态注册点数，★ 与 `tests/audit-doc-vs-code-tables.test.mjs` 的判据一致）✓

| 服务键 | 职责 | 主要方法（**与代码一致** ✓） | apiVersion |
|---|---|---|---|
| `vmu.library`（有 `root` ✓） | 归档与记忆 | `append(rec,{member?})`、`record(member,track,text)`、`list(filter,{includeTrash?})`、`expand(id,{capBytes})`、`storedFingerprint(id)`、`fingerprint(kind,parts)`、`truncationReport()`、`status()`、**批 3 新增**：`remove({id})`、`removeRevision({id,rev})`、`moveToTrash({id})`、**轮回 230 新增**：`registerVocabulary({tags,aliasTags})`、`checkTags({tags})`、**轮回 231 新增**：`checkReferences({references,known})`、`backlinks(id,{depth})`、**轮回 232 新增**：`checkMetadata({record})`、`provenanceOf({inputs})`、**轮回 233 新增**：`indexHealth()`、**轮回 234 新增**：`exportRecord(id,{format?,includeHistory?,allowInternal?})`、**轮回 236 新增**：`search({text,filter?,analyzer?,maxResults?,snippetLen?})`、`restore({id})`、`listTrash()`（**永久标记保护＋删除留痕＋不静默成功** ✓，全部经 `guardWrite` ✓） | 1 |
| `vmu.members` ✓ | 成员与角色**槽位** | `roles()`、`roster()`、`hire({id,slot})`、`assignRole(id,slot)`、`end(id,reason)`、`wake(id,ask,{role?,phase?})`、`may(id,permission)`、`selfReport(id,fields,{by?})`、`selfReports()`、`selfReportHistory(id)`、`status()` | 1 |
| `vmu.tasks` ✓ | 任务与阶段 | `create({title,…})`、`assign(id,who)`、`transition(id,to,{reason})`、`setPriority(id,priority,{expectedRevision,by})`、`list(filter)`、`stage()`、`advance({to,reason})`、`rollback({reason})`、`status()` | 1 |
| `vmu.prompt` ✓ | 提示词管线 | `register(section)`、`bind(binding)`、`disable(name)`、`enable(name)`、`assemble(ctx)`、`override(section,text,by)`、`rollback(section)`、`snapshot(scopes)`、`bindToHost(adapter)`、`setState(text)`、`status()` | 1 |
| `vmu.middleware` ✓ | 中间件总线（观测/启停/校验） | `status()`、`entries()`、`disable(id,reason)`、`enable(id)`、`setDryRun(v)`、`validateEntry(entry)`、`declareTopic(name,{by})`、`retractTopic(name,{by})`、`retractTopicsOwnedBy(by)`、**`rewriteOf(hook,emitted)`** | 1 |
| `vmu.store`（有 `root` ✓） | 耐久端口 | `open(expected)`、`read(key)`、`write(key,value)`、`patch(key,fn)`、`migrate()`、`import(snapshot)`、`stats()` | 1 |
| `vmu.work`（有 `root` ✓） | **在途工作台账** | `start({owner,kind,objective})`、`settle(id,{outcome})`、`interrupt(id,reason)`、`recover({reason})`、`list()`、`pending()`、`interrupted()`、`status()` | 1 |
| `math_computation`（声明了数学意图 ✓） | 继承的数学工具（D14 原名 ✓） | 由共享模块注册（`op=probe\|run\|receipt\|install` ✓） | 1 |

> **★ 槽位回执口径（轮 9，实测）**：`hire`/`assignRole` 的回执带 `capacity` 与 **`unlimited`**。**`capacity:0` ＝ 无上限**（内核守卫 `def.capacity > 0 && used >= def.capacity`，`kernel/members.js:141`）⇒ 此时 `unlimited:true`；`capacity>0` 时 `unlimited:false`，满员后具名拒 `VMU_RESOURCE_BUDGET`。**不要把 0 读成"容量 0"**——那会与 `occupied:1` 看起来矛盾。

> ★ **模型工具面的分段读取**：★ `vibe_math_status` 支持 `fields: ["counts","verify","dispatch","planner","paper","lastPlan"]` **选择器**（★ 只回所要的段；★ 未知段用 `unknownFields` 具名报出）＋ `waitIdle:true`（★ 确定性排空回合派发队列后再读）✓。★ 理由：★ 真机上 status 回执会随轨数/日志变大，★ **诊断字段可能被回执边界挤掉**；★ `fields` 让"加了字段却读不到"不再发生 ✓。

> ★★★ **其余服务的清单（★ 轮 502 实测补 ✓；轮 2/3 复核 ✓）**：★ **`registry.register` 共注册 **80** 个服务，其中 **18** 个原先【在任何文档里都查不到名字**]✗** ✓ ⇒ ★★ **一个 pack 可以 `requires` 一个读者【无从查证**]的服务名** ✓。★ **现列于此** ✓（★ 轮 2 的七个新服务与轮 3 的 `vmu.activity`／`vmu.fidelity` 另见 §2 上文与 `docs/18` 的工具面说明 ✓）：
> 
> ★ `vmu.alerts` ✓ ｜ `vmu.retention` ✓ ｜ `vmu.repropack` ✓ ｜ `vmu.bidding` ✓ ｜ `vmu.publication` ✓ ｜ `vmu.external` ✓ ｜ `vmu.crypto` ✓ ｜ `vmu.idempotency` ✓ ｜ `vmu.replay` ✓ ｜ `vmu.transaction` ✓ ｜ `vmu.ratelimit` ✓ ｜ `vmu.auditchain` ✓ ｜ `vmu.stateversion` ✓ ｜ `vmu.clockguard` ✓ ｜ `vmu.mathtools` ✓ ｜ `vmu.projmigrate` ✓ ｜ `vmu.storepolicy` ✓ ｜ `vmu.migration` ✓。
> 
> ★★ **真源仍是 `registry.register` 的调用点** ✓；★ **本行只是让这 18 个名字【可查**] ✓。

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
| `vmu.library` | `search({text,filter,analyzer,maxResults,snippetLen})→{ok,analyzer,query,hits,total,dropped,snippetLen,enforced,fired}`（**轮 236：analyzer【真的改变什么算命中】✓；上限咬合【计数丢弃】✓；片段越界加省略号并自曝** ✓）／`exportRecord(id,{format,includeHistory,allowInternal})→{ok,format,visibility,history,text|manifest}`（**轮 234：`internal` 默认【不可静默导出】✓；格式三者具名拒他者 ✓；历史【计数上报】** ✓）／`indexHealth()→{read,deferred,unreadable,missingId,limit}|null`（**轮 233：一次重建【读了什么、延后了多少、哪些读不到】全部自曝** ✓）／`checkMetadata({record})→{ok,strictness,customPrefix,custom,unknown,reported,enforced,fired}`（**轮 232：三值严格度；未知字段在 warn 下【列出】而非消失** ✓）／`provenanceOf({inputs})→{ok,depth,kept,dropped,inputFingerprint,enforced,fired}`（**轮 232：深度有界且【计数丢弃】** ✓）／`checkReferences({references,known})→{ok,references,dangling,reported,enforced,fired}`（**轮 231：悬空引用按 `vmu.refs.danglingPolicy` 拒或列出，绝不静默** ✓）／`backlinks(id,{depth})→{ok,levels,backlinks,enforced,fired}`（**轮 231：按 `vmu.refs.backlinkDepth` 广度优先** ✓）／`registerVocabulary({tags,aliasTags})→{ok,vocabulary,aliases,controlled,aliasTable,enforced,fired}`（**轮 230：受控词表登记** ✓；本面**不自行读标签文件** ✗）／`checkTags({tags})→{ok,tags,controlled,maxDepth,aliasTable,enforced,fired}`（**轮 230：深度／受控词表／别名三关，越界【具名拒】** ✓）／`fingerprint(kind,parts)→hex`（**单点计算** ✓）／`append(rec,{member?})→{ok,id,fingerprint,deduplicated}`／`record(member,track,text)→{ok,file}`／`list(filter)→Head[]`（**七键、不含正文、行数上限＋计数** ✓；新增 `{includeTrash?}` ✓）／`expand(id,{capBytes})→{ok,head,body,truncated,path}`／`storedFingerprint(id)→{ok,id,fingerprint}`（**读回而非重算** ✓）／`truncationReport()`／`status()`（**异步** ✓）／`remove({id})`／`removeRevision({id,rev})`／`moveToTrash({id})`／`restore({id})`／`listTrash()`／`commitRevision({id,by,reason?})`／`revision({id,rev})`／`revisions({id,limit?})` | `VMU_NO_SUCH_OBJECT`／`VMU_INVALID_ARGUMENT`／`VMU_RETENTION_CONFLICT`（永久标记 ✗）／`VMU_IO_FAILED`（带 `step` ✓） |
| `vmu.members` | `roles()`／`roster()`／`hire({id,slot})`／`assignRole(id,slot)`／`end(id,reason)`／`wake(id,ask,{role?,phase?})`（**注入接缝**；缺则具名拒 ✓）／`may(id,permission)`（**只做包含判断** ✓）／**`selfReport(id,fields,{by?})`**（轮 132：成员**自述** `overall`(必填)／`subgoal`／`plan`／`status`，**只追加** ✓、**未知字段具名拒** ✓、`by` 记为审计事实而**不发明策略** ✓）／**`selfReports()`**（每人**最新**一条 ＋ 更新计数）／**`selfReportHistory(id)`**（该成员**只追加**历史，**最旧在前** ✓）／**`snapshot()`／`restore(v)`**（★ 轮 2：耐久投影的 state 适配对 ✓）／`status()` | `VMU_RESOURCE_BUDGET`（**报当前数与上限** ✓）／`VMU_NO_SUCH_OBJECT`／`VMU_STATE`／`VMU_ENGINE_UNAVAILABLE`／`VMU_INVALID_ARGUMENT`（自述缺 `overall` 或含未知字段 ✓）／`VMU_RESUME_RESTORE_CONFLICT`／`VMU_RESUME_SNAPSHOT_VERSION`／`VMU_RESUME_SNAPSHOT_INCOMPLETE` |
| `vmu.tasks` | `create({title,objective?,owner?,deps?,priority?,writeScopes?})→{ok,id,state,deps,writeScopes,skippedScopes}`（★ 轮 5／F39：`writeScopes` 是 **advisory** 写域，非法范围**具名**进 `skippedScopes:[{what,why}]`，绝不静默丢 ✗）／`setPriority(id,priority,{expectedRevision?,by?})→{ok,id,priority,previous,revision}`（★ 目标 8 补的能力：之前 `priority` 只能在 `create` 时定、`list()` 按它排序、而没有任何操作能改已有行；现在能了，且与其它变更同一套 compare-and-set 并记 `task-priority-set` 审计 ✓）／`assign(id,who)→{ok,id,owner,state,mayObject,enforced}`（轮 10：回执点名 `vmu.tasks.memberMayRejectAssign` 是否开着）／**`objectAssign(id,{by,why})→{ok,id,state,owner,objection,broadcast,enforced,fired}`**（★ 轮 10／v5r `reject_assign`（`:9555-9562`）：成员对被分派**表示异议**——**记录在面自己的只增台账**（`history()` 里 `assign-objected`，随投影耐久）且**任务仍执行**；`vmu.tasks.memberMayRejectAssign=false` ⇒ **具名拒**（v5r 当时**静默忽略**该字段，vmu 刻意更严 ✗✓）；广播**没有**已登记钩子 ⇒ 回执**具名**说明（不假装广播过））／`transition(id,to,{reason})`／**`setDependencies(id, deps, {expectedRevision?})→{ok,id,deps,revision}`**（★ 轮 5／F35：**改边**动作——两节点环与长环只能由此产生；成环 ⇒ `VMU_TASK_DEPENDENCY_CYCLE`，`detail.cycle` 给环路径 ✓；`expectedRevision` 不符 ⇒ 具名拒 ✓）／**`writeScopeConflicts()`**（只读：写域重叠对；读者＝`tasks.status()` ✓）／`list()`／`stage()`／`advance({to,reason})`（**先过 `stageGate`** ✓）／`rollback({reason})`／**`brief(id)`／`briefOf(id)`／`clearBrief(id)`**（任务简报＝给该任务负责人的执行流程 ✓）／`history(id?)`／`status()`／**`snapshot()`／`restore(v)`**（★ 轮 2：耐久投影的 state 适配对；`restore` 会校验快照再回填 ✓） | `VMU_STATE`（依赖未满足／非法转换／**暂停中** ✓）／`VMU_RESOURCE_BUDGET`／**`VMU_TASK_DEPENDENCY_CYCLE`**（★ 轮 5：依赖边成环 ✓）／`VMU_RESUME_RESTORE_CONFLICT`（恢复冲突 ✓）／`VMU_RESUME_SNAPSHOT_VERSION`／`VMU_RESUME_SNAPSHOT_INCOMPLETE`（快照版本/缺字段 ✓） |
| `vmu.paper` ✓（轮 135：多成员合著编排 ✓） | `start({title,sections,contributors,editor})`（**每节必须有人认领** ✓，无主章节具名拒 ✗）／`contribute({paperId,section,by,artifact?})`（**归属机器强制** ✓：只有 owner 能交，且**只交一次** ✗ 不静默覆盖）／`finalize({paperId,by})`（**异步** ✓；缺节**逐节点名到人** ✓；`vmu.paper.finalizer` 决定谁可定稿 ✓；**登记委托给注入的 `register` 接缝** ✓，缺接缝即具名拒 ✗）／`status(paperId?)`／`keysUsed()`／`partition()` | `VMU_INVALID_ARGUMENT`（无标题／无章节／重名／**无主章节** ✓）／`VMU_NOT_PERMITTED`（非 owner 交付 ✓／非允许的定稿人 ✓）／`VMU_STATE`（已交／已定稿／缺节 ✓）／`VMU_NO_SUCH_OBJECT`／`VMU_ENGINE_UNAVAILABLE`（**缺登记接缝** ✓） |
| `vmu.turn` ✓（轮 339） | `open({member,phase,task,round})`／`assemble(turn)`（**交给管线** ✓，**缺则具名拒** ✗）／`deliver(turn,text)`（**宿主缝**；缺则具名拒 ✓）／`parse(text)`（**三种失败三种名** ✓）／`plan(reply)`（**纯函数** ✓）／`apply(reply,faces?)`（**计数未接线** ✓）／`run(spec)`（**一轮跑完** ✓）／`status()` ✓ | 轮次编排 26 |
| `vmu.status` ★ PHASE 7 | `registerSection(name, fn)→disposer`／`unregisterSection(name)→{ok,name,removed}`／`names()→string[]`；`kernel.status().sections.<name> = {ok,value|code,message}`，**无注册 ⇒ 无 sections 段**（零机制）；同名注册具名拒 | `VMU_INVALID_ARGUMENT`／`VMU_ENGINE_UNAVAILABLE` |
| `vmu.prompt` | `register(s)→entry`／`bind(binding)→{section,dim,total}`／`disable(name)→{ok,disabled}`／`enable(name)`／`assemble(ctx)→{ok,text,sources[],truncation[],at}`／`override(section,text,by)→{ok,previous}`／`rollback(section)`／`snapshot(scopes)`／`bindToHost(adapter)`／`setState(text)`／`status()→{sections[],bindings,truncation[],middlewareAppends[]}` | `VMU_NOT_PERMITTED`／`VMU_INVALID_ARGUMENT`／`VMU_NO_SUCH_OBJECT`／`VMU_ENGINE_UNAVAILABLE` |
| `vmu.middleware` | `status()→{dryRun,hookTimeoutMs,breakerThreshold,entries[],hooks[]}`／`entries()`／`disable(id,reason)`／`enable(id)`／**`declareTopic(name)→{ok,topic,existing}`（协议扩展点：冻结集之外的新钩子主题必须先声明才可 emit ✓，名字非法即具名拒 `VMU_INVALID_ARGUMENT` ✓）**／**`retractTopic(name,{by})→{ok,topic,removed,stillDeclared,owners}`（★ **PHASE 6 / 目标 3**：按 **owner** 撤回声明——同一主题还有其他 owner 时仍然声明 ✓；包卸载的 undo 调它，所以"卸载"与"仍注册"不再同时成立 ✓）**／**`retractTopicsOwnedBy(by)→{ok,removed,count}`（★ 撤回某 owner 声明的**全部**主题；pack.js 在 apply 时按 `topics` 字段声明、卸载时按同一 owner 撤回 ✓）**／`setDryRun(v)`／`isDryRun()`／`emit(hook,payload,{scope?,traceId?,member?,role?,phase?,bridge?})→{ok,decisions[],traceId,refused?,aborted?,decision}`（**命名空间感知的成员校验** ✓：`member/turn/meeting/ballot/record/task/prompt/budget/pack/settle/control` 这 11 个 **vmu 命名空间**里的未知名**具名拒** ✓；**宿主命名空间**（如 `tools/pre-execute`／`fs/write-intent`）**放行** ✓ —— 那是基座的词汇 ✓；注意 `prompt/assemble` **属宿主词表** ⇒ 这正是为何**不能整表放行** ✗（放行就等于把已修的漂移 bug 放回 ✗）；`bridge:true` 只用于宿主瀑布桥 ✓）／`on(entry,handler)→id`／`add(entry)→entry`／`trace(traceId)→Trace[]`／`wrapHostWaterfall(next)→async(payload)`／**`rewriteOf(hook,emitted)→string|null`**（★ **PHASE 6 / K10**：★ **`.rewritable` 的第一个读者** —— 把决策里的 `rewriteResult` 取出来给调用方应用；★ 三态都显式：★ 没人要求⇒`null`／★ 合法⇒返回（★ 后者胜，★ 因为 `order` 已决定谁最后跑）／★ **在【非 rewritable】钩子上改写 或 值畸形 ⇒ 具名拒**（★ 绝不静默）✓ 首个消费者＝`turn/index.js` 的 `turn/reply-parsed` ✓） | `VMU_MIDDLEWARE_FAILED`／`VMU_MIDDLEWARE_REJECTED`／`VMU_INVALID_ARGUMENT` |
| `vmu.store` | `open(expected)→{opened,version,migration?}`／`read(key)→Value`（**克隆** ✓）／`write(key,value)→{ok,key,version,changed}`／`patch(key,fn)→同左`（**fold 内函数式** ✓）／`subscribe(key,fn)→Disposer`／`migrate()`／`export()→Snapshot`／`import(snapshot)`／`stats()` | `VMU_STORE_FAILED`／`VMU_STORE_MIGRATION`／`VMU_INVALID_ARGUMENT`（未登记键 ✓） |
| `vmu.commitlog` ✓（轮 9／**G7**） | `durable`（**getter**，布尔：有合格 store 才真）／`reserve(op)→rec\|null`（**意图先于生效**，返回带 ticket 的记录；无 store ⇒ `null`）／`complete(rec,outcome)→ticket\|null`（结果落在**意图的 ticket** 上）／`status()→{shared,name,durable,tickets,appended,done,recoveredAt}`／`resolveState()→{durable,bound,failure}`（**观测**：`failure` 把"解析器抛错"与"没给 store"**分开**） | 无（**缺席不是拒绝**：`durable===false` 且 `reserve()` 返回 `null` —— 具名降级，两个面照常工作）。解析器抛错 ⇒ `failure.code === 'VMU_COMMIT_STORE_FAILED'` |
| `vmu.meetingverdict` ✓（phase 12／**D15**） | `aggregateVerdicts({verdicts,propositionId?,at?})`（**纯函数** ✓：每行 `{member,p,reason}`，`p` 必须是 `[0,1]` 内**有限数**、`reason` 必须非空、成员不得重复、空集具名拒 ✗）⇒ `{mode:'unanimous'\|'mean', proposition, value, exact, rounded, valueSource, decided, estimate, n, perMember, spread, keys:[]}`（**全一致 1/0 ⇒ 就是该值**；否则**算术均值**，且 `estimate:true` 说明"均值不是裁定" ✓；写入值取 6 位 `rounded`，`exact` 同时给出 ⇒ `0.30000000000000004` 永不进卡 ✓）／`rulePropositionProbability({verdicts,propositionId,owner,from?,template?,at?})` ⇒ 聚合 ＋ `notice{from,to,about,kind:'verdict-ruling',value,mode,perMember,text}`（**machine-readable** ✓，投递给**既有** mailbox 面，本模块不开第二通道 ✗）／`status()`（自证：算了几次/裁了几次/拒了几次/投递成败） | `VMU_INVALID_ARGUMENT`（空集／非数字／NaN／越界（含百分数 80）／无 reason／重复成员／缺 `propositionId`／缺 `owner`／`from` 非字符串／空模板／**跨命题**：一组裁决指向多个命题、只有部分行标了命题、或裁决所指命题与裁定目标不一致 —— 全部**指名到人**，绝不取均值 ✗） |
| `vmu.work` | `start({owner,kind,objective})→{ok,entry}`／`settle(id,{outcome})→{ok,settled,remaining}`／`interrupt(id,reason)`／`recover({reason})→{ok,recovered,entries[]}`／`list()`／`pending()`／`interrupted()`／`status()` | `VMU_STATE`（**暂停中** ✓）／`VMU_NO_SUCH_OBJECT`／`VMU_INVALID_ARGUMENT`／`VMU_STORE_FAILED`（store 未 open ✓） |
| `vmu.meetings` ✓（轮 12／**`boxFor` 绑定**） | `open({id?,type,chair,roster,size,materials,kind,at})`（★ **A1／轮 10**：显式 `id` 现在被接受；与活会重名 ⇒ 具名 `VMU_CONFLICT`）／`motion({meeting,member,kind,text,materials,at})→{ok,motion:id}`／`vote({meeting,member,motion,value,at})→{ok,tally,counted,tallyNote,quorum,receipt,enforced,enforcedScope}`（★ **R15 诚实化**：`motion` 缺省时**没有可计数的容器** ⇒ `tally:null` ＋ `counted:false` ＋ 具名 `tallyNote`，**绝不再回 `{for:0,against:0,abstain:0}`** —— 那个"看着像真的"的计数与同一调用真写了 minutes、真涨了 `counters.votes` 的事实互相矛盾；**真正的 open-ballot 容器是 `vmu.ballot`／`vmu.ballotbox`**，走工具面 `action=ballot→vote→tally`／`boxopen→boxcast→boxclose`）／**`flow({meeting,mode,by,why})`**（B④ 地面四模式 `open｜hands｜round_robin｜call_on`；未知/已合并名 ⇒ `VMU_INVALID_ARGUMENT`）／**`overrideOrder({meeting,by,why,mode})`**（B③ 发言序覆盖 `fifo｜round-robin｜chair｜random`）／**`orderView({meeting})`**（只读：当前生效规则＋它给出的 queue 序）——★ **三者的闸同一条**：**仅该会主席**、**必须 `why`**、**部署须声明 `vmu.meetings.orderMode`**（未声明 ⇒ `VMU_ENGINE_UNAVAILABLE`），覆盖一旦在force `queue()` 就**不再读**该键（`enforced:[]`，`modeSource:'override'`）（★ 投票镜像在 **`receipt.receipt.ballot`**：`{mirrored,reason,boxId?,code?}`）／**`bindBox(fn\|null)→{ok,bound,replaced,at,changes,note}`**（★ 轮 12 裁决 (i)：**`motion → box` 的绑定是【方法】不是清单字段** —— 策略在 pack，本面**只调用**回调，从不自己开箱/造映射；可**换绑**、可**解绑**、**可自曝**）／**`boxBinding()→{bound,source:'injected'\|'method'\|null,at,changes}`**／**`second({meeting,motion,member})`**／**`close({meeting,report,actions,at})`**（收束后进归档）／**`meetingView({meeting})`**（动议状态）／**`summary({meeting})`**（★ **A1／轮 10**：动议＋逐票 `tally`，活会与归档会都可读——此前本服务没有 summary，调用方只能从 minutes 反推）／**`eligibleVoterIds()`**（★ **A1／轮 10**：按声明的表决席返回 `{restricted,seats,ids}`；`restricted:false` ＝ 未声明席别）／`status()`（含 `boxBinding` 与 `durableMarker`）／`openMeetings()`（★ **A2／轮 1**：工具面 `vibe_vmu_meeting` 的 `list`／`status`／`speak`／`close` 现在**先找逐对象原语、找不到再回落到本服务**；`list` 返回 `meetings`（原语）＋`serviceMeetings`（本服务）＋`unionMeetings`（并集），服务侧回执带 `registry:"service"`，本服务的收束进归档（回执带 `closeSemantics`）；两处都没有 ⇒ 具名 `VMU_NO_SUCH_OBJECT` 且 hint 列出两个 id 空间）／… | `VMU_INVALID_ARGUMENT`（`bindBox` 收到非函数非 null ⇒ **具名拒**：不能作答的绑定＝要防的静默）／**`VMU_MEETING_BOX_UNWIRED`**（未绑／已解绑时投票：**具名**，绝不静默）／`VMU_MEETING_BOX_UNMAPPED`（绑了但回 null）／`VMU_MEETING_BOX_BINDING_FAILED`（回调抛且**自带码优先**）／`VMU_NOT_MEMBER`／`VMU_MEETING_BOX_*` 见 §8 |

**三条接口纪律**：① **能力缺失用 `ok:false` ＋ 具名码**，不得抛裸异常给上层 ✗（框架内部异常按中间件失败策略处置 ✓）；② **返回对象一律可 JSON 序列化**（便于审计与场景比对 ✓）；③ **幂等性**：`read/list/status/tally` 幂等；`set/append/cast` 等写操作**必须能被审计去重**（同一 `traceId` 不重复生效 ✓——沿用 v5r 的幂等纪律 ✓）。

**约定**：所有方法**只返回结构化数据**（无副作用者返回快照）；**带副作用者必须返回"发生了什么"的可审计摘要**；任何拒绝都必须带 `{ok:false, code, message, hint?}`。

---

> ★★ **部署入口：`overlay` 行（轮 5 / U14 第二版，具名语义 ✓）**：随包 `cordis.patch.yml` 在 preset 行**之前**多一行 **`- id: vibe-math-vmu-overlay`**（`config: {}` ⇒ 零机制）。部署用 `--patch` 打**这一行**，payload 形状：
> ```yaml
> config: { overlayFor: vibe-math-vmu, rows: { 'vibe-math-vmu': { vmu: { … } } } }
> ```
> `preset-declaration.js` 的 `apply` 见 `overlayFor` ⇒ 把 `rows` 记进模块级注册表（**不注册 preset**）；`registerDeclaration` 在**注册时**取出它并用 **`applyOverlay`** 按 **id 深合并**进 `config.plugins` 的匹配行 ✓。★ **默认不声明 ⇒ 注册定义与随包逐字节一致**（零机制 ✓，随包无测试值 ✓）。★★ **为什么必须是独立行** ✗✓（**实测**）：**loader 的 patch 是【替换】config 而不是【合并**】—— 把 `overlay` 放进 preset 行 config 会让该行 `config` 被整个覆盖（dump 1932 → 1562 行、`plugins:` 消失 ⇒ `agent-preset/not-found`）；独立行的 payload **本来就是整个 config**，替换即正确 ✓。★★★ **具名告警（三条）**：① 匹配不到任何行的 overlay 键 ⇒ `warn('[dsh-vibe-math] preset "<id>" overlay names a row that does not exist: <key>')`，**定义不变** ✓；② **行身份缺失**（`config.plugins` 不是数组／`id` 空）⇒ `warn('… its config was most likely REPLACED by a patch; patch the OVERLAY row …')` 且**什么都不注册** ✓；③ 有声明时 `info('overlay row declared N row override(s) for preset "<id>"')` ✓。★ 导出 `applyOverlay(plugins, overlay, warn?)`／`overlayForPreset(id)` 供测试直接断言（**不原地修改** `plugins` ✓）。★ **dump 的局限**：`--dump-config` 是 **loader 树**，不是运行时定义 ⇒ 合并的判据在**运行时探针**（`docs/02` 同节）✓。

> ★★★ **入口接受【两种设置形态】，且【什么都不静默丢】（轮 6 / task-41，具名语义 ✓✓）**：`vibe-math-vmu.js` 的 `readSettings` 收：
> ① **嵌套**：`config.vmu = { tools: { faces: ['*'] }, packs: { active: ['v5r'] }, report: { enabled: true } }` ⇒ **递归展开为点号键**（`vmu.tools.faces`／`vmu.packs.active`／`vmu.report.enabled`；**数组是叶子**）✓；
> ② **点号**：`config.vmu = { 'vmu.tools.faces': ['*'] }` ⇒ **原样** ✓；
> ③ **扁平**（无 `config.vmu`）：只把 `vmu.*` 当设置，其余（`root`／`clock`／`scripts`／`packs`／`deliver`…）是**宿主配置**，**不报未解析** ✓。
> ★ **冲突**：同一个点号键**两形态都给** ⇒ **点号形态胜**（显式胜过推断），且**具名登记**进 `settingsConflicts`（**不许静默择一** ✗）。
> ★★★ **未解析必具名**：**空对象叶子**（`{ tools: {} }` ⇒ 声明了什么也没说）、**函数／类实例**、**不合形状的点号键**（`vmu.bad-key!`）⇒ `ctx.logger.warn` ＋ **stderr** 各一条，**并计数自曝**：句柄 `settingsUnparsed()`／`settingsConflicts()` 与 `status().settingsUnparsed／settingsConflicts` ✓。★ **实测失败链（本条的由来）**：overlay 声明的是**嵌套**形态，而旧读者只收 `k.startsWith('vmu.')` ⇒ **声明到了内层行却被静默丢弃** ⇒ 真机只见 `vibe_vmu_status` ✓（现由探针 `20/0` 覆盖：嵌套 ⇒ **`vibe_vmu_report` 真的发布**；**无声明 ⇒ 仍恰 1 个工具** ✓）。
> ★★ **F53 · `node:fs` 与策略 fs 的边界（具名 ✓）**：**用户给的相对路径一律走策略缝** —— `host-math.js` 的 `under()`（绝对化 ⇒ `guardWrite({settings, root, target})` ⇒ 越界**具名拒** `VMU_PATH_ESCAPE_REFUSED`／`VMU_NOT_PERMITTED`）✓；**直接 `node:fs` 只出现在三处且都不是用户路径**：`kernel/guard.js`（守卫自身要规范化/判定路径）、`kernel/index.js`（**框架自己的**审计锚点与审计日志，位于 `root` 之下）、`kernel/records.js`（**包内只读**：枚举本仓 `settings/*.js` 里已声明的键做自审）✓。★ **规则**：需要直接 fs 的模块必须（a）只碰**框架自己的**（`root` 之下）或**包内**文件，且（b）在注释里**写明是哪种**；其余一律走注入的 fs 缝 ✓。
> ★★★ **两条"读取时机"坑（轮 6 实测，写给所有离线断言）✓✓**：① **工具注册**：适配器的 install 是 **`chain.then(...)` 异步链**，`handle.ready()` **不**等它 ⇒ **同步读注册列表会得到 0 条**（看起来像"面没发布"）——要**小睡**（探针 80ms）或等 `status().installed` 为真 ✓。② **会话记账**：会话日志在 **turn 结束才 flush** ⇒ **早读得到空记账**（看起来像"没调用"）——要**等 turn 结束再读** ✓。★ **共同形状**：**"读到的空"不等于"没发生"** ✗✓ —— 这两处都曾把我／assistant 引向错误结论（Round 5 的 dump 假阳性是同一类的第三种）✓。

> ★★★ **分配型 store（G6，轮 8 落地 ✓✓）**：`kernel/ballot.js` 的 `createDurableCommitLog` 是**协议**（ticket 由 store 分配／意图先于生效／`recover()` 按 ticket 序幂等重放），而**序号是宿主的** ⇒ 宿主注入一个 **`commitStore`** 接缝：
> - **谁注入**：入口 `vibe-math-vmu.js` 的 `commitStore: () => …` —— **调用时解析**（先看部署的 `config.commitStore`，再看 `ctx.get('store')`），所以**开机后才挂载的 store 也会被下一次 ballot 取到** ✓；内核 `createKernel({ commitStore })` 把它交给 `createBallot`（**面自己**用它建日志）。
> - **`append` 的返回契约**：`append(record) → { ticket }`；★ **两条载荷语义（缺一不可，实测踩过）**：① **没有 `ticket` 的记录由 store 分配**（两个进程共享同一 store ⇒ **互不相同且单调**：实测 1、2 ✓）；② **已带 `ticket` 的记录必须【保留】**——`complete()` 用**意图的 ticket** 写结果行，而 `recover()` **按 ticket 配对** `done` 行与意图 ⇒ 若 store 给结果行另发一个号，意图会**永远重放**（探针第一版就是这样暴露的）✗✓。`readAll()` 回读全部行。
> - **缺席口径**（与既有 `durable:false` 一致，**不静默**）：无 store ⇒ `ballot.status().gate.durable === false`、`reserve()` 返回 `null`、`recover()` 明说无可恢复；`status().seams.commitStore === false` ＋ `commitStoreNote` **具名**说明该缝缺席与注入方式 ✓。
> - **断言（探针 `D:/_tmp/vmu-r8/commit-store.mjs` 14/0）**：两个内核实例共享同一 store ⇒ ticket **1、2**（互不相同且单调）；**崩溃在意图与生效之间** ⇒ 下一个进程 `recover().pending` **恰 1 条**、**再问一次仍 1 条**（幂等）、完成后第三个进程 `pending` **0 条**（不双花）且结果行**与意图同 ticket**；无 store ⇒ 具名降级；**调用时解析** ⇒ store 后挂载下一次生效。

> ★★★ **共享耐用日志（G7，轮 9 落地 ✓✓）**：**一份日志，两个面** —— 核侧建**一个**共享提交日志（`kernel/index.js` 的 `createSharedCommitQueue`，注册为服务 **`vmu.commitlog`**，内核面 `kernel.commitlog`）并**同时**交给 `createBallotBox({durableQueue})` 与 `createMailbox({durableQueue})`，于是 `cast` 与 `send` 的行**交错在同一条 ticket 序列**里（各自发号无法合流 ✗）。
> - **迟到绑定**：每次调用都解析宿主 store（`append()`＋`readAll()` 才合格），**调用时**才建真日志 ⇒ **开机后挂载的 store** 下一次 `cast`/`send` 即生效 ✓；store **换了对象** ⇒ 新日志先 `recover()` 再继续，号**不回退** ✓。
> - **观测**：`status().seams.sharedCommitLog` 给 `{bound, durable, failure, status, consumedBy}`；★ `failure` 把**"解析器抛错"**（`VMU_COMMIT_STORE_FAILED`）与**"根本没给 store"**分开 —— 两者都不假装耐用，但不是同一件事 ✓。
> - ★ **缺席口径**：无 store ⇒ 两个面**都**走内存路径且 `status().durableLog.bound === false`／`gate.durable === false`（具名降级，不是坏面）✓。
> - **断言（探针 `D:/_tmp/vmu-r9/g7-shared.mjs` 17/0）**：交错序列 `ballotbox-cast, mailbox-send, ballotbox-cast, mailbox-send` ⇒ ticket **1,2,3,4**（**一条**共享计数器）；结果行与意图同号；无 store／解析抛错／后挂载三种形状各自具名。

> ★★★ **退出冲刷（轮 9 落地 ✓✓）＝ 两件事，不是一个（★ 不许糊）**：
> - **state 面【每次变更自动写穿】**（`vmu.resume.writeThrough` 默认开）⇒ 退出只需**等**在途写落地（`recovery.settle()`）；**journal 面（如 `tasks`）只追加、【不写穿】** ⇒ 退出**必须显式刷**（`recovery.flushAll()`）。
> - **装配侧唯一入口**：`kernel.shutdown({reason})`（`kernel/index.js`）＝ 先 `settle()` 再 `flushAll()`，回执**分别**给 `writeThrough`／`journal` 两半边，`ok` 是二者的**与**（**不是**"至少一半成功" ✗），结果留在 **`status().shutdown`**（退出后仍可查；**从未退出过 ⇒ `null`，不等于成功** ✓）。**并发**多次调用**共用一次**冲刷；**再次**调用会**重跑**（宿主可能 uninstall→install 产生新 journal 尾巴，永久"已刷"标记会静默丢尾巴 ✗）。
> - **谁调**：`host.js` 的 `adapter.uninstall()`（回执带 `exitFlush`）与入口 `vibe-math-vmu.js` 的 effect cleanup；入口**返回该 Promise**（宿主若 await disposer 就会等），并把失败**具名**（`ctx.logger.warn` ＋ stderr ＋ `status().shutdown`），**绝不静默** ✓。
> - ★ **写前必读约束同样管辖退出**：**从未成功读过 fold** 的进程在退出时被 `flushAll()` **具名拒**（`VMU_RESUME_WRITE_BEFORE_READ`，`failed:[{key:null,…}]`）⇒ `shutdown().ok === false`，**不会**谎报"已刷"。正常装配在**开机链**里已 `recover()`，故退出必然成功；两种形状都有断言 ✓。
> - **断言（探针 `D:/_tmp/vmu-r9/exit-flush.mjs` 27/0）**：未读 ⇒ 具名拒；正常路径 ⇒ journal 真落盘（下一位读者在文件里看得到）＋ state 键出现在 `skipped[]` 并写明"writes through on every mutation"；幂等/并发；**无 durable root ⇒ 具名 skip（`ok:true`，不是失败也不是谎）** ✓。

## 3. Tools（`vibe_vmu_*`）

> 目标：**能力齐备但不内置策略**；工具只回答"能做"，"是否/何时做"由中间件与提示词决定。
> **别名层**：pack 可声明映射（如 `vibe_v5_poll_vote → vmu.tasks`），使旧语料/旧提示词可复用（D6）。
> **登记纪律（2026-10-09 真机校准 ✗✓）**：本表 = 宿主**实际注册**的集合，唯一真值是 `vibe-math-vmu/host.js` 的 `TOOL_NAMES` ✓；**未实现的计划工具必须标注 `⛔ 未实现`**，且文档任何地方不得把未实现的工具写成操作步骤 ✗ —— 这条由 `tests/audit-vmu-docs.test.mjs` 的 **F 组**断言强制 ✓（加此断言时，本文件原有 20 个工具名里 **15 个是幻影** ✗）。

> ★★ **两处内核工厂（★ 轮 503 补 ✓）**：★ **`kernel/identity.js` 的 `createIdentity({ … })`** ✓ —— ★ **成员身份与假名面工厂** ✓；★ **`kernel/notify.js` 的 `createNotify({ … })`** ✓ —— ★ **通知面工厂** ✓（★ 它 emit 的是**自己命名空间**的 `notify/emit` ✓ —— ★ 中间件要挂它必须**先 `declareTopic`** ✓，★ 这是**刻意**的 ✓）。

### 3.1 已实现（★ **数目见 `docs/18` 的生成式工具索引** ✓ —— ★ 本表是手写的已实现清单，★ **它不写数**，★ 因为"已实现"随多轮增长而快照会过期 ✗）


| `vibe_vmu_audit` | **审计面**（10 动作）：追加/查询/导出/校验/复算 ✓ —— **只做寻址与调用**（★ `recount` 由**角色**门控 ✓；★ `redactKeys` 未列出的键不写 ✓） | `action`(必填，枚举)、`request`、`id` | `auditTool` 为真 | 服务的码原样透传 ✓ |
| `vibe_vmu_idempotency` | **幂等面**（12 动作）：键/指纹/持久/回收 ✓ —— **只做寻址与调用**（★ 重复执行不产生二次效果 ✓） | `action`(必填，枚举)、`request`、`id` | `idempotencyTool` 为真 | 服务的码原样透传 ✓ |

> ★★★ **计数口径（★ 轮 494 实测修正 ✓）**：★ 本标题原先写 **"真机已验证的 5 个 ＋ 本轮新增 1 个"** ✗ —— ★ **那是写下时的快照，之后每加一个工具都没回头改** ✓ ⇒ ★★ **现在写"本表列 N 个"，且 N 由表本身决定** ✓；★★ **真机验证状态另见 `11-§9.6`，不要在这里凭记忆写** ✓。

| 工具 | 语义 | 参数（宿主视图） | 出现条件 | 具名拒 |
|---|---|---|---|---|
| `vibe_vmu_status` | 只读总览：接缝/注册面/中间件条目/生效整合包/**实例身份**/`settings.resolved`/`auditTail`/`prompt`；★ 默认 `detail:'summary'` 是**紧凑可读**（含 `closureVote`、live 成员 id/slot/state、计数，实测 <4000 字符）；`detail:'full'` 才回全量；`detail:'closure'` 只回结题读数（<1500 字符） | —（对象 schema，无必填） | `vmu.core.enabled !== false` | `VMU_MIDDLEWARE_FAILED` |
| `vibe_vmu_tools` ★ PHASE 8 / B-1（轮 39 补调用者路径） | 该成员**真实可见**的工具表：**回合内调用**时名字来自**调用者 Agent 的 `ctx.tools.schemas()`**（one-shot child 的 memberSession 映射可能尚未学到）；**回合外**走内核 `turn.visibleToolsOf`；每项 `{name,purpose}`；无 live Agent ⇒ **具名拒**，绝不返回空清单假装成功。`vibe_v5_tool_help` 应转调同一读数 | `member`（必填） | `vmu.members.*` 或 `vmu.tools.faces` 声明该面 | `VMU_NO_SUCH_OBJECT`／`VMU_ENGINE_UNAVAILABLE`／`VMU_INVALID_ARGUMENT` |
| `vibe_vmu_vote` ★ PHASE 8 / 轮 37 | 结题表决作为**工具**：写入 `turn.recordClosureVote`，与回执 `vote_solved` **同一写入者、同一账本**；非票权/未落座 ⇒ 具名拒。用途：投票回合只挂这一个工具，避免"无工具⇒把调用写进正文⇒`VMU_TURN_NO_FENCE`" | `member`（必填）、`solved`（必填 boolean）、`why`（可选） | `vmu.turn.*` 或 `vmu.tools.faces` 声明该面 | `VMU_NO_SUCH_OBJECT`／`VMU_NOT_PERMITTED`／`VMU_INVALID_ARGUMENT`／`VMU_ENGINE_UNAVAILABLE` |
| `vibe_vmu_env` ★ PHASE 9 / 轮 4 | 环境适配面：`probe` 用注入 spawn 跑需求表里的 probe，`list` 看表＋最近结果，`report` 把缺失写成 records finding；**探测失败是正常 ok:false**；**本面绝不执行 installCommand／不联网／不请求权限** | `action`（probe/list/report）、`need`／`needs`、`why`／`detail` | `vmu.env.*` 或任一 `vmu.math.*` 声明 | `VMU_ENV_UNKNOWN_NEED`／`VMU_ENGINE_UNAVAILABLE`／`VMU_INVALID_ARGUMENT` |

> ★★★★ **「出现条件」的单一真源（轮 1／K1，D-01 裁决 ✓；轮 2 扩到 52 面 ✓）**：★ **本节各行的"出现条件"由 `host.js` 的 `TOOL_FACES` 一张表解析** ✓ —— ★ **不再是"四十个布尔开关"** ✗（★ 轮 1 实测：真实入口只传 4 个开关 ⇒ **45 面里 35 面真机不可达** ✗，而本节与 `docs/18` 却写着它们都在 ✓）。★★ **轮 2 实数**：**工具面 52**（轮 1 的 45 ＋ `human`／`chat`／`mailbox`／`panel`／`report`／`mathadapters`／`mathjobs` 七个新面 ✓；★ `vibe_vmu_mathtools` 的 6 个 action **不变** —— 数学库适配与数学作业**各自开面**，因为"一工具一服务、action 枚举＝该服务方法集"是既有强契约 ✓）、**服务 77**（轮 1 的 70 ＋ `vmu.ids`／`vmu.resume`／`vmu.chat`／`vmu.mailbox`／`vmu.panel`／`vmu.report`／`vmu.mathadapters` ✓）、**耐久公开键 15**（`settings.resolved`／`packs`／`middleware`／`members`／`tasks`／`meetings`／`ballots`／`records`／`budget`／`phase`／`work`／`idempotency`／`mailbox`／`resume`／`ids` ✓）。
> **每一面的意图来源（按序求值 ✓）**：① `settings['vmu.tools.faces']`（面键／工具名／`*` ✓）；② `config.faces`；③ 该面自己的 `config.<face>` 键（如 `config.minutes` ✓）；④ 该面的 `vmu.<族>.*` 设置键（如 `vmu.minutes.*` ✓）；⑤ 少数面的特有条件（`set`＝有声明键；`records`＝有耐久 root；`script`＝声明了 scripts；`pack`＝装载器在场 ✓）。
> **两条硬规则** ✓：★ **无任何声明 ⇒ 恰好 1 个工具**（`vibe_vmu_status` ✓，零机制 R1 不变）；★ **每个面要么可达、要么【具名不可达**】—— `vmu.core.facesDisabled: ['<面键|工具名>']` 关闭它并在 `status().faces.disabled` 带 `VMU_NOT_PERMITTED` 上报 ✓，**声明了但运行时前置缺失**（例：`records` 无 root）则在 `status().faces.unavailable` 带 `VMU_ENGINE_UNAVAILABLE` 上报 ✓，**名字写错**在 `unknownDisabled` 上报 ✓ —— **绝不静默消失** ✗。★ **真源**：`host.js` 的 `TOOL_FACES`／`resolveFaces()`／`FACE_KEYS`（45 项 ✓）。
| `vibe_vmu_set` | 改一个设置；未声明的键一律具名拒；回执含**热改等级对应的生效时机**与来源 | `key`(必填)、`value` | 有声明键时 | `VMU_INVALID_ARGUMENT`、`VMU_NOT_PERMITTED`（H3）、`VMU_PACK_CONFLICT` |
| `vibe_vmu_middleware` | 中间件：`action=list\|disable\|enable\|validate\|dryRun`（**validate/dryRun 只读、无副作用** ✓） | `action`(必填，枚举)、`id`、`rule`(M1 规则 JSON)、`samples`(事件样本 JSON 数组) | 有声明条目**或**总线已有条目 | `VMU_INVALID_ARGUMENT`、`VMU_NO_SUCH_OBJECT` |
| `vibe_vmu_records` | 记录面：`action=list\|expand\|append` | `action`(必填)、`id`、`kind`、`statement`、`proof` | 有 `root`（耐久库在场） | `VMU_INVALID_ARGUMENT`、`VMU_NO_SUCH_OBJECT` |
| `vibe_vmu_script` | M3 脚本：`action=list\|run`（结果**只回调用方**，不进提示词） | `action`(必填)、`id`、`args`(JSON 数组字符串) | profile 行声明了 `config.scripts` | `VMU_NO_SUCH_OBJECT`、`VMU_INVALID_ARGUMENT`、`VMU_ENGINE_UNAVAILABLE` |
| `vibe_vmu_pack` | 整合包：`action=list\|plan\|apply\|unload`（**`plan` 是纯报告** ✓、`apply` 冲突即具名拒、`unload` 逐个回滚） | `action`(必填，枚举)、`id`(unload)、`manifest`(内联 manifest JSON) | profile 行声明了整合包（`config.packs` 或 `vmu.packs.active` 非空）。**无声明 ⇒ 不出现** ✓（零机制不受管理面豁免 ✓） | `VMU_INVALID_ARGUMENT`、`VMU_PACK_*` |
| `vibe_vmu_control` | 控制流：`action=status\|pause\|resume\|stop\|beat\|roster\|hire\|fire\|tune`（**暂停是真门禁**：任务新建/转换被 `VMU_STATE` 拒 ✓；`beat` 是心跳，`stale` 由 `vmu.limits.wallClockMs` 判 ✓；`roster/hire/fire/tune` 是成员/控制面；★ **权威 enum 在 `tools/control.js`**） | `action`(必填，枚举)、`reason`(pause/stop)、`note`(beat)、`member_id`/`slot`/`institution`(hire/fire)、`key`/`value`/`byRole`(tune) | 声明 `control:` 时 ✓（无声明 ⇒ 不出现 ✓） | `VMU_STATE`、`VMU_INVALID_ARGUMENT` |
| `vibe_vmu_meeting` | 会议/表决面：`action=list\|open\|speak\|silent\|hand\|hands\|order\|refuse\|invite\|invitedspeak\|attend\|end\|agendaclose\|agendaitems\|leaverequest\|leaveapprove\|leaverequests\|aggregation\|complete\|phase\|status\|summary\|snapshot\|close\|extend\|lapse\|revokelapse\|ballot\|vote\|tally\|reopen\|freeze\|unfreeze\|boxopen\|boxcast\|boxclose\|boxreopen\|boxlapse\|boxrevokelapse\|second\|withdraw\|flow\|overrideorder\|extendlimit\|proceed` ✓（**全集以 `tools/meeting.js:17` 的 enum 为权威**）★ **本轮补登四动作（T1 抓出的文档落后于代码）**：`order`＝**读**发言次序（只读；只有 service 会议有 floor order，原语会 ⇒ 具名 `VMU_INVALID_ARGUMENT` 并指到 `action=status` 的逐轮 ask 表）；`attend`＝把成员**标记为到场**（纯委派 `meetings.attend`，face 不加席位策略、内核只校验在册；**只有它能让被邀的非主席成员真正发言**——此前 pack 面 100% 拒 `attend() first`，而 `invite` 只排发言序、不伪造到场）；`extendlimit`＝**只延会议墙钟**（`meetings.extendWall`；`vmu.meetings.extendRequiresChair` 默认 true ⇒ 须本会主席自报 `actor`，步长须为正，越过 `vmu.meetings.extendCeilingMs` ⇒ `VMU_RESOURCE_BUDGET`；**不延发言**，发言延长是原语面的 `extend`）；`proceed`＝**等待态提前开会／超时自决**（只对 `waiting` 有效：`scheduled` 未到点、`open` 已在跑 ⇒ 具名 `VMU_STATE`；`vmu.meetings.waitDecisionRequiresChair` 默认 true ⇒ 只有主席，回执带 `waitedMs`／`beforeDeadline`／`quorum` 并记入纪要）—— 只对**内核已登记的实例 id**寻址 ✓（未知 id ⇒ `VMU_NO_SUCH_OBJECT` ✓）；`vote` 在**面上归一化**口语票值（`for/yes/赞成`⇒1；`against/no/反对`⇒0 ✓），其余原样交给原语 ⇒ **权威拒绝仍来自原语** ✓ | `action`(必填，枚举)、`id`、`ballotId`、`member`、`text`、`target`、`value`、`kind`、`reason`、`agenda`、`roster` | 声明 `meetings:` 或 `ballot:` 时 ✓（无声明 ⇒ 不出现 ✓） | `VMU_NO_SUCH_OBJECT`、`VMU_STATE`、`VMU_INVALID_ARGUMENT`、`VMU_PACK_*=pack 规则` ✓ |
| `vibe_vmu_turn` | **轮次编排面**（`26-§3.4` ✓）：`op=step\|drive\|status` ✓ —— **`step` 精确跑一轮**（**谁**由 `vmu.turn.wakeupPolicy` 定 ✓、**什么提示词**由 `vmu.prompt` 管线装配 ✓），**`drive` 连跑有界若干轮**，**`status` 读数**（策略／已唤醒计数／各阶段计数 ✓）。★ **`status` 的 `detail` 只接受 `'closure'`**（只回 `closureVote/closureVoteWrites`）；**省略 = 全量 status；未知值 ⇒ 具名 `VMU_INVALID_ARGUMENT`，不静默忽略**。★ 语义照 `26-§3.3`：无成员 ⇒ 合法空转（`stopped:"no-members"` ✓）；缺投递缝 ⇒ 该轮返回 `ok:false`（不假装跑过 ✗）；一轮失败是运行结果，参数不合法是编程错误（抛）✓ | `op`(必填，枚举)、`members`、`rounds`、`phase`、`why`、`next_step`、`detail`(仅 status：closure) | 声明 `turn:` 时 ✓（无声明 ⇒ 不出现 ✓，**零机制不被破坏** ✓） | `VMU_ENGINE_UNAVAILABLE`、`VMU_INVALID_ARGUMENT`、`VMU_TURN_*` ✓ |
| `vibe_vmu_task` | 任务面：`action=list\|create\|assign\|transition\|set_dependencies\|stage\|advance\|brief\|history` ✓（**权威 enum 在 `tools/task.js`**）—— **依赖/阶段门/暂停门仍由内核强制** ✓（本面只寻址与调用，不复制策略 ✓） | `action`(必填，枚举)、`id`、`title`、`objective`、`owner`、`deps`、`to`、`reason` | 声明 `tasks:` **或**声明了非空 `vmu.tasks.stages` ✓（无声明 ⇒ 不出现 ✓） | `VMU_STATE`、`VMU_NO_SUCH_OBJECT`、`VMU_RESOURCE_BUDGET`、`VMU_INVALID_ARGUMENT` |
| `vibe_vmu_minutes` | 纪要面：`action=list\|draft\|confirm\|append\|actions\|zones\|gaps\|resolve\|resolutions\|supersede\|status` ✓（**权威 enum 在 `tools/minutes.js`**）—— **只做寻址与调用** | `action`(必填，枚举)、`id`、`kind`、`text`、`member`、`session` | `minutesTool` 为真 | `VMU_INVALID_ARGUMENT`（缺必填／未知 action）、**服务自己的码原样透传** ✓ |
| `vibe_vmu_board` | 看板面：`action=columns\|addColumn\|move\|setWip\|swimlanes\|aging\|status` ✓（**权威 enum 在 `tools/board.js`**）—— **只做寻址与调用** ✓ | `action`(必填，枚举)、`id`/`name`/`wipLimit`/`order`、`taskId`/`toColumn`/`by`/`transition`、`column`/`limit`、`warnMs` | `boardTool` 为真 | **服务自己的码原样透传** ✓（如 `move` 缺参 ⇒ `VMU_INVALID_ARGUMENT` ＋ hint ✓） |
| `vibe_vmu_budget` | 预算面：`action=open\|charge\|reserve\|remaining\|status\|list\|totals\|perTaskShare` ✓ —— **只做寻址与调用** ✓ | `action`(必填，枚举)、`scope`、`kind`、`amount`、`taskId`、`limits`、`perTaskShare`、`ratio` | `budgetTool` 为真 | **服务自己的码原样透传** ✓（如缺 scope ⇒ `VMU_BUDGET_SCOPE_UNKNOWN` ＋ hint ✓） |
| `vibe_vmu_citations` | 引用面：`action=identify\|validate\|render\|status` ✓ —— **只做寻址与调用** ✓ | `action`(必填，枚举)、`ids`、`title`、`authors`、`year`、`freeText`、`style` | `citationsTool` 为真 | **服务自己的码原样透传** ✓（`VMU_CITATIONS_FIELD_MISSING`／`VMU_CITATIONS_IDENTIFIER_MISSING` ✓） |
| `vibe_vmu_discipline` | 纪律面：`action=recordFailure\|mayAct\|suspend\|restore\|status` ✓ —— **只做寻址与调用** ✓ | `action`(必填，枚举)、`subject`、`kind`、`detail`、`ms`、`reason`、`byHuman`、`postmortem` | `disciplineTool` 为真 | **服务自己的码原样透传** ✓（如 `VMU_DISCIPLINE_RESTORE_NEEDS_HUMAN` ✓） |
| `vibe_vmu_governance` | 治理面（★ **可观测**）：`action=keysUsed\|config\|droppedEvents` ✓ —— **只做寻址与调用** ✓ | `action`(必填，枚举) | `governanceTool` 为真 | `VMU_INVALID_ARGUMENT`（未知 action） |
| `vibe_vmu_ratelimit` | 速率面：`action=take\|peek\|reset\|bucket\|status` ✓ —— **只做寻址与调用** ✓ | `action`(必填，枚举)、`key`、`cost`、`scope`、`reason`、`by` | `ratelimitTool` 为真 | **服务自己的码原样透传** ✓（如 `reset` 缺理由 ⇒ `VMU_INVALID_ARGUMENT` ＋ hint ✓） |
| `vibe_vmu_explain` | 解释面：`action=checkReason\|correlate\|build\|render\|status` ✓ —— **只做寻址与调用** ✓ | `action`(必填，枚举)、`reason`、`targetAction`(**转交给服务的 `action` ✓**)、`traceId`、`taskId`、`chains`、`scores`、`fields`、`report`、`format` | `explainTool` 为真 | **服务自己的码原样透传** ✓（`VMU_EXPLAIN_REASON_REQUIRED`／`VMU_EXPLAIN_CORRELATION_UNKNOWN` ✓） |
| `vibe_vmu_projmigrate` | 迁移面：`action=register\|read\|upgrade\|status` ✓ —— **只做寻址与调用** ✓ | `action`(必填，枚举)、`kind`、`version`、`migrate`、`doc`、`to` | `projmigrateTool` 为真 | **服务自己的码原样透传** ✓（缺 `kind` ⇒ `VMU_INVALID_ARGUMENT` ＋ 调用样例 hint ✓） |
| `vibe_vmu_bridge` | 脚本面（M3）：`action=validate\|plan\|run\|status\|history` ✓ —— **只做寻址与调用** ✓（★ **`request` 对象原样转发、不解释字段** ✓） | `action`(必填，枚举)、`request`(对象；★ 形状见 `docs/05 §6.2` ✓) | `bridgeTool` 为真 | **服务自己的码原样透传** ✓（`VMU_ENGINE_UNAVAILABLE`／`VMU_INVALID_ARGUMENT` ✓） |
| `vibe_vmu_external` | 外部面：`action=fetchOne\|fetchMany\|normalize\|cache\|receipts\|status` ✓ —— **只做寻址与调用** ✓（★ **六个调用全部 await** ✓ —— ★ 该服务的 `fetchOne`/`fetchMany` 是**真异步** ✓） | `action`(必填，枚举)、`source`、`id`、`query`、`by`、`cacheDir`、`refs`、`results`、`raw`、`enforced` | `externalTool` 为真 | **服务自己的码原样透传** ✓（`VMU_EXTERNAL_UNAVAILABLE` ＋ 已声明来源清单 ✓） |
| `vibe_vmu_mathtools` | **数学工具面**：`action=plan\|run\|cacheMarkCorrupt\|cacheView\|receiptsView\|status` ✓ —— **只做寻址与调用** ✓ | `action`(必填，枚举)、`op`、`args`、`cacheKey` | `mathtoolsTool` 为真 | **服务自己的码原样透传** ✓（`VMU_MATH_INVALID_INPUT` ＋ 可用的调用示例 ✓） |
| `vibe_vmu_auditchain` | **审计链面**：`action=append\|verifyChain\|link\|checkpoint\|status\|refresh` ✓ —— **只做寻址与调用** ✓（★ 一条**真哈希链**：`prevHash`／`hash`／`GENESIS` ✓） | `action`(必填，枚举)、`entry`、`seq`、`note`、`key` | `auditchainTool` 为真 | **服务自己的码原样透传** ✓ |
| `vibe_vmu_notify` | **通知面**：`action=watch\|unwatch\|emit\|flush\|list\|status` ✓ —— **只做寻址与调用** ✓（★ **默认关**：零配置下 `defaultOff:true`／`enabled:false` ✓） | `action`(必填，枚举)、`subject`、`id`、`event`、`payload`、`channel` | `notifyTool` 为真 | **服务自己的码原样透传** ✓（缺参数 ⇒ `VMU_INVALID_ARGUMENT` ＋ 可用调用示例 ✓） |
| `vibe_vmu_transaction` | **事务面**：`action=begin\|run\|status\|list\|history\|compensate` ✓ —— **只做寻址与调用** ✓（★ 失败走**补偿**而非静默 ✓） | `action`(必填，枚举)、`id`、`steps` | `transactionTool` 为真 | **服务自己的码原样透传** ✓（`VMU_NO_SUCH_OBJECT` ＋ "known: (none)" ✓） |
| `vibe_vmu_custody` | **保管链面**：`action=registerEntry\|transfer\|storageCycle\|destroy\|chainOf\|status` ✓ —— **只做寻址与调用** ✓（★ **只收化名** ✓；★ 链缺口默认**阻断** ✓） | `action`(必填，枚举)、`pseudonym`、`entry`、`to`、`note` | `custodyTool` 为真 | **服务自己的码原样透传** ✓（`VMU_CUSTODY_*` ＋ 化名提示 ✓） |
| `vibe_vmu_topology` | **组织拓扑面（代理自组织）**：`action=select\|describe\|route\|assert\|list\|status` ✓ —— **只做寻址与调用** ✓（★ 零配置下 `zeroMechanism:true` ✓） | `action`(必填，枚举)、`kind`、`from`、`to`、`subject` | `topologyTool` 为真 | **服务自己的码原样透传** ✓ |
| `vibe_vmu_formal` | **形式化面**：`action=check\|axioms\|sorryReport\|artifacts\|reproduce\|list\|status\|keysUsed\|config\|trail` ✓ —— **只做寻址与调用** ✓（★ **原样透传服务的硬不变式** ✓：★ `spawn` 未注入 ⇒ 具名拒 ✓；★ `sorry` ⇒ 默认拒并点名 ✓；★ **"编译失败 ≠ 命题为假"** ✓） | `action`(必填，枚举)、`request`、`query`、`id` | `formalTool` 为真 | **服务自己的码原样透传** ✓（`VMU_FORMAL_*`／`VMU_MATH_*` ＋ 修复提示 ✓） |
| `vibe_vmu_collab` | **协作面（代理间协作）**：`action=addCounterparty\|openAgreement\|signAgreement\|reviewAgreement\|exchange\|settle\|authorship\|agreements\|status` ✓ —— **只做寻址与调用** ✓（★ 策略 `agreementRequired:true` ⇒ **没有协议就不能交换** ✗） | `action`(必填，枚举)、`name`、`counterparty`、`agreement`、`terms`、`resource` | `collabTool` 为真 | 服务的码原样透传 ✓ |
| `vibe_vmu_reviewers` | **评审人面**：`action=register\|assign\|unbind\|acknowledge\|acknowledgements\|quorumMet\|reviewerView\|status\|trace\|keysUsed` ✓ —— **只做寻址与调用** ✓（★ 模式与回避由服务强制：`mode:"single-blind"`／`conflictPolicy:"recuse"` ✓） | `action`(必填，枚举)、`id`、`expertise`、`conflicts`、`reviewerId`、`submissionId` | `reviewersTool` 为真 | 服务的码原样透传 ✓ |
| `vibe_vmu_clockguard` | **时钟守卫面**：`action=now\|observe\|skew\|monotonic\|status\|clockSource` ✓ —— **只做寻址与调用** ✓（★ 策略 `clamp` ⇒ **倒流不会被静默接受** ✗） | `action`(必填，枚举)、`value` | `clockguardTool` 为真 | 服务的码原样透传 ✓ |
| `vibe_vmu_capacity` | **容量面**（9 动作）：登记/预约/校准/阻断 ✓ | `action`(必填，枚举)、`request`、`id` | `capacityTool` 为真 | 服务的码原样透传 ✓ |
| `vibe_vmu_retention` | **留存面**（9 动作）：配额/宽限/回收/永久标记 ✓ —— **只做寻址与调用**（★ **默认 dryRun** ⇒ 不会先删后说 ✓） | `action`(必填，枚举)、`request`、`id` | `retentionTool` 为真 | 服务的码原样透传 ✓ |
| `vibe_vmu_ip` | **知识产权面**（19 动作）：归属/披露/争议/在先技术 ✓ | `action`(必填，枚举)、`request`、`id` | `ipTool` 为真 | 服务的码原样透传 ✓ |
| `vibe_vmu_bidding` | **竞标面**（11 动作）：竞标/围标检测/归一化 ✓ | `action`(必填，枚举)、`request`、`id` | `biddingTool` 为真 | 服务的码原样透传 ✓ |
| `vibe_vmu_admission` | **招募/准入面**（15 动作）：`openPosting→apply→offer→accept→confirm` ✓ —— ★ **拒绝会告出下一步** ✓ | `action`(必填，枚举)、`request`、`id` | `admissionTool` 为真 | 服务的码与提示原样透传 ✓ |

> **活对象登记（本节新增面所需 ✓）**：内核持有**会话内**的会议/表决实例表（`kernel.liveMeeting(id)`／`liveBallot(id)` ✓，`status().live = {meetings[],ballots[],cap,evicted}` ✓）；**上限 50，超出按最旧逐出并计数** ✓（`evicted` 绝不静默 ✓）。它**不是新策略** ✓：同一批原语，只是**可按 id 寻址** ✓（docs/08 §2 的"逐对象原语" ✓）。

> **真实接线面（此前文档完全没写 ✗）**：这 5 个工具由 **profile 行的 `config`** 装配 —— `config.root`（耐久库 ⇒ `records`）、`config.vmu['vmu.middleware.entries']`（总线 ⇒ `middleware`）、`config.scripts`（⇒ `script`）、`config.instance`（身份自证）、`config.packs`（整合包装载）。**没有** `settings.yml`／`pack.yml`／`middleware/*.yml` 这类落盘配置 ✗（运行时**不读任何 YAML 文件** ✓）。

### 3.1a v5r pack 的工具面（41 个，`packs/v5r/tools.js`）★ G7 补

★ **这些不是框架面**：它们由 **`packs/v5r` manifest 的 `tools[]`** 声明，只在装载该 pack 时出现；名字集合见 `packs/v5r/tools.js` 的 `V5R_PACK_TOOLS`（生成式索引仍以 `docs/18` 为准）。★ **v5r 不声明 `toolPresentation`**，所以呈现是 native。

| 工具 | 要点 | 参数/返回 |
|---|---|---|
| `vibe_v5_paper` ★ G7 重点 | **论文的唯一运行入口**：`start/part/advance/review/final/render/status/compile/sections`（9 action）。`final` **只有 chair 席**能过（成员 ⇒ `VMU_NOT_PERMITTED`）；`render` 回 `wrote/missing/complete/pdf`；`status` 回同一 `PaperArtifacts` 的 `missing/complete/pdf`（不写产物）；PDF 失败回执带 **`triedEngines:[{engine,phase,code}]`**（可读的结构化引擎尝试列表，不再 `[object Object]`） | `action`、`target`、`member`、`participants`、`part/title`、`body`、`deliverable`、`notes`、`decision` |
| `vibe_v5_inbox` | 信箱：`list/open/mark`；`list` 行 **9 字段（含 `urgent`）无正文**，`open` 置 `read:true`，`mark` 改 read/todo。与 `vibe_vmu_mailbox` **同一套存储**（非紧急提示无正文；紧急只有发送方 `urgent:true` 才带正文） | `action`、`member`、`status`、`id`、`read`、`todo` |
| `vibe_v5_wait` | 等待：`wait/status`；**面名是 `activity`（不是 `wait`）**；回执 `timedOut/waitedMs/timeoutMs`；无 peer 接缝时 `peerCheck:"no-seam"` | `action`、`timeout_ms`、`member`、`reason` |
| `vibe_v5_record_*` | 研究日志/成果卡（内容指纹去重） | `content`/`statement`、`value`、`motive`、`p`、`track` |
| `vibe_v5_message` / `_say` | 所办转达/群聊私信；`urgent` 默认 **false**（kind 不自动紧急） | `to`、`content`、`subject`、`urgent` |
| `vibe_v5_meeting` / `_motion` / `_second` / `_poll_*` / `_verdict` | 机构会议/投票面；与 `vibe_vmu_meeting` 的 service 注册表/ballot 镜像见 `docs/08 §27` | 见 `packs/v5r/tools.js` |
| `vibe_v5_lean_run` / `_job` / `_lib` / `_read` / `_archive` | Lean 面：无宿主 spawn 时**具名 `VMU_ENGINE_UNAVAILABLE`**，不假装编译 | `file`、`statement`、`jobId`、`kind` |
| `vibe_v5_task_*` / `_hire` / `_assign` / `_fire` / `_nudge` / `_prioritize` / `_feedback` / `_read_library` / `_overview` / `_report` / `_start` / `_stop` / `_pause` / `_resume` / `_configure` / `_set` / `_tool_help` | 任务板/招聘/所务管理/控制；被具名拒时保留原码 | 见 manifest |

★ **框架侧的同名能力**（`vibe_vmu_*`）仍在 §3.1；两套并存的边界以“谁是当前 pack 的 manifest 工具”为准，**不要用一张手写清单代替 manifest**。

### 3.2 规划中（`⛔ 未实现`，**当前不可调用**）

> 这些名字宿主**没有注册**；保留在此仅为规划追溯 ✓。

| 工具（规划） | 意图 | 状态 |
|---|---|---|
| **`vibe_vmu_report`** ✓ | 面向人的报告（可裁剪字段）＋ 自动汇报/参数配置面（8 动作） | ★★★ **本行曾在轮 476 被划掉并判"降级为扩展、不再实现"**，★ **理由是"全仓零消费者：代码 0 处、测试 0 处"** ⇒ ★★ **该裁决已于轮 2 改判并【落地】**：★ `kernel/report.js`／`tools/report.js`／`kernel/reportfeedback.js` **现存**，★ 契约见本卷 **`:1515`**（★ 8 动作）；★ 历史裁决与改判理由见 `23-extensions-and-deferred` 的 §回写段 ✓ ★ **本条是"零引用 ⇒ 判死"被纠正的范例**（★ `docs/01 §1.4.3`：★ 删除侧举证只需**一个使用者场景**，★ "面向人的报告"显然有）✓ |
| `vibe_vmu_members` | 花名册与角色槽位（只读） | ⛔ **这个名字未注册** —— 但**能力已实现** ✓：★ 是 `vibe_vmu_control` 的 **`action=roster`** ✓ ⇒ `kernel.identity.list()` ✓（★ 只读、**用该文件已有的 `listCap` 上限** ✓ —— ★ 不能被限制大小的花名册就是一个转储 ✓） |
| `vibe_vmu_hire` / `vibe_vmu_fire` | 增/减成员（走内核槽位） | ⛔ **这两个名字未注册** —— 但**能力已实现** ✓：是 `vibe_vmu_control` 的 **`action=hire|fire`** ✓，走 `kernel.identity` 的 `addMembership`／`endMembership` ✓ ⇒ ★★★ **为什么不另立工具**：★ **`control` 只在配置声明了控制面时才出现** ✓（**零机制 R1** ✓）⇒ **加动作不动惰性默认态、不动工具面宽度、不加新门** ✓；★ **而新加工具会让"无配置时恰好一个工具"失守** ✗（★ 轮 479 试过，T1 两条断言当场红 ✓） |
| `vibe_vmu_say` | 发消息（可被中间件拦截） | ⛔ **工具名未注册** —— ★★ **注意一个同名陷阱** ✗：★ **内核里的 `say({type:...})` 是【事件发射器**]✓（★ 例如 `kernel/control.js` 的 `say({type:'control/paused'})` ✓），**不是成员发消息** ✓ ⇒ ★★ **两者不要混读** ✓；★★ **宿主桥在 `kernel/bus.js`**（★ 导出 `createBus({entries,settings,clock,…})` ✓、`VU_HOOKS` ✓、`BRIDGE_TOPICS: ['host/waterfall']` ✓）⇒ ★ **那是【宿主面**]，**成员面向成员的消息面本轮未找到** ✗ |
| `vibe_vmu_meeting` | 会议原语：召集/议程/举手/收束 | ✅ **已实现并已注册** ✓（★ 轮 477 实测 ✓）—— ★ `host.js` 用 `TOOL_NAMES.meeting` **注册了它** ✓（★ `kernel/meeting.js` ＋ `kernel/meetings.js` ✓）；★★ **本行原写"⛔ 未实现"，那是【假的**]✗**（★ 与 `pause`／`resume`、`hire`／`fire` 同一类：★ **文档落后于代码** ✓） |
| `vibe_vmu_ballot` | 表决原语：开板/投票/计票/结束 | ⛔ **这个名字未注册** —— 但**能力已实现且早已暴露** ✓：★ 是 `vibe_vmu_meeting` 的 **`action=ballot｜vote｜tally｜reopen`** ✓（★ 另有 `decisive`／`advisory` 两种表决语义 ✓） |
| `vibe_vmu_record_progress` / `vibe_vmu_record_{proposition,method,subproblem}` | 记录与成果卡 | ⛔ **这些名字未注册** —— 但**能力已实现** ✓：★ 是 `vibe_vmu_records` 的 **`action=append`（＋ `proposition`／`method`／`subproblem` 三种卡型）** ✓ |
| `vibe_vmu_read_library` | 读库：头部列表／按 id 展开 | ⛔ **这个名字未注册** —— 但**能力已实现** ✓：★ 是 `vibe_vmu_records` 的 **`action=list`（头部列表，不含正文）｜`expand`（按 id 取正文，超限计数）** ✓ |
| `vibe_vmu_task` | 任务：建/派/迁移/查 | ✅ **已实现并已注册** ✓（★ 轮 477 实测 ✓）—— ★ `host.js` 用 `TOOL_NAMES.task` **注册了它** ✓（★ `kernel/tasks` 一带 ✓）；★★ **本行原写"⛔ 未实现"，那是【假的**]✗**（★ 与 `pause`／`resume`、`hire`／`fire` 同一类：★ **文档落后于代码** ✓） |
| `vibe_vmu_lean_lib` / `vibe_vmu_lean_read` / `vibe_vmu_lean_archive` | 形式化面 | ⛔ **工具名未注册**（host 未注册这三个工具名，故此行仍标未实现 ✓）—— 但**能力已实现** ✓：`kernel/lean.js` 的 `archive`／`read`／`lib`（轮 131）：登记**具名引用＋内容哈希**、`read` **回源并校验哈希**、**漂移即具名拒且不返回旧内容**（**只引不复制** ✓） |
| `vibe_vmu_pause` / `vibe_vmu_resume` | 暂停/恢复调度 | ⛔ **这两个名字未注册** —— 但**能力已实现且早已暴露** ✓：★ **它们是 `vibe_vmu_control` 的 `action=pause|resume`** ✓（★ 该工具描述原话：**"暂停是**真门禁**（任务变更会被具名拒）"** ✓）⇒ ★★★ **本行先后错过三次** ✗：**"内核没有它" ✗ → "只缺名字" ✗ → 真相：★【能力在另一个工具的动作里**]✓ |
| `vibe_vmu_mw` | 中间件：查看/校验/干跑/禁用 | ⛔ **工具名未注册**（★ 它只是**同形陷阱**的名字 ✓）—— 真名是 `vibe_vmu_middleware` ✓（**它的 `validate`/`dryRun` 动作现已实现** ✓，见 §3.1） |
| `vibe_vmu_publication` | **出版面（14 动作）** ✓ —— **只做寻址与调用**（★ **整对象透传** ✓） | `action`(必填，枚举)、`request`、`id`、`period` | `publicationTool` 为真 | 服务的码原样透传 ✓ |
| `vibe_vmu_fairness` | **公平面**：`action=allocation\|explain\|audit\|rebalance\|status\|rebalanceDue` ✓ —— **只做寻址与调用** ✓ | `action`(必填，枚举)、`pool`、`reason` | `fairnessTool` 为真 | 服务的码原样透传 ✓ |
| `vibe_vmu_handover` | **交接面**：`action=open\|attach\|finalize\|accept\|reject\|pack\|status` ✓ —— **只做寻址与调用** ✓ | `action`(必填，枚举)、`id`、`payload`、`reason` | `handoverTool` 为真 | 服务的码原样透传 ✓ |

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
### 6.1 公开键（**逐键**：写者 → 读者；`kernel/store.js` 的 `PUBLIC_KEYS` 是**唯一白名单** ✓）

> **口径**：本节**只列公开面**（有读者、语义稳定、pack/preset 可依赖）。白名单里**没有写者的键单列**并标 **未定/保留**——不让部署依赖一个没人写的名字。任何 `patch/read` 都要过白名单（`kernel/store.js:119` 的 `assertKey`；越界 ⇒ 具名拒 `VMU_INVALID_ARGUMENT`，K2 的教训）。**完整键（1228）见 `docs/04`**；这里是**耐久键**（`PUBLIC_KEYS` 20 个，逐一有出处）。
>
> ★ **两张表互补，别只信一张**：**本表**保证"**每个键都有写者→读者**"（文档侧真相源）；**`scripts/audit-projection-census.mjs`**（常驻门禁，读**真装配**）保证"**每条声明真的生效、或具名地不生效**"（`declared` → `attached`／`viaAlias`／`notAttached` 逐条具名，例如面为 null 时的 `VMU_RESUME_NO_TARGET`）。文档说"谁写谁读"，门禁说"这条声明今天到底挂上没有"——两者都要看。

**族 ① · 投影键（耐久；由 `vmu.resume.projections` 声明后**写穿/重放**）**

| 键 | 模式 | 写者（声明后） | 读者（恢复时） |
|---|---|---|---|
| `tasks` | **journal**（记命令 ⇒ hydrate **重放**） | `kernel/index.js:870` 适配行；命令表在 `:965` 一带（`PROJECTION_COMMANDS`，读者不入表） | `kernel/resume.js` `hydrate()`（用**同一批公开方法**重放） |
| `members` | state | `kernel/index.js:881`（`snapshot()/restore()` 对） | 同上（**面为 null 时**报 `VMU_RESUME_NO_TARGET`，不假装） |
| `meetings` | state | `kernel/index.js:882` | 同上 |
| `ballotbox` | state | `kernel/index.js:883` | 同上（旧拼写 `ballots` 是**具名容忍**的 deprecated 别名：`:980-990` 的 `PROJECTION_ALIASES` ＋ **告警**，不静默） |
| `minutes` | state | `kernel/index.js:884` | 同上 |
| `chat` | state | `kernel/index.js:885` | 同上 |
| `panel` | state | `kernel/index.js:886` | 同上 |
| `budget` | state | `kernel/index.js:889` | 同上 |
| `human` | state | **无条件**挂（`kernel/index.js:998` 一带：审批队列＋否决台账） | 同上 |
| `phase` | state（单键） | `kernel/index.js:928` 的 `writePhase()`（调用点 `:1614/:1625/:1862/:1874`） | `kernel/resume.js` 的 `phase()` |
| `resume` | state（引擎自有） | `kernel/resume.js:439/:451`（`patch(key,…)`） | 同面 `hydrate()` |
| `ids` | state（计数器投影） | `kernel/ids.js:104`（`patch(IDS_KEY,…)`） | 同面读回（**号不重用**） |

**族 ② · 自持久面（面自己写自己的键，不经投影表）**

| 键 | 写者 | 读者 | **缺席时（具名）** |
|---|---|---|---|
| `mailbox` | `kernel/mailbox.js:497`（`persist()` → `patch(MAILBOX_STORE_KEY,…)`） | 同面 `restore()`（`:513` 一带） | `status().durable === false`：内存态，**不假装耐久** |
| `idempotency` | `kernel/idempotency.js:323`（`patch(LEDGER_KEY,…)`） | 同面（去重台账） | 只在本进程去重 |
| `work` | `kernel/work.js:64`（`patch(WORK_KEY,…)`） | 同面 ＋ 恢复的 `work` 接缝（`interrupted` 具名） | 无在途台账 |

**族 ③ · 白名单内但【未落盘】：只在 `status()` 视图里（**不要依赖文件**）**
`settings.resolved`（`status().settings.resolved`；白名单只为种子 `{}`）、`packs`（`status().packs` ＋ `packNotes()`）、`middleware`（`status().middleware`／`bus.status()`）。

**族 ④ · 无写者键（**结论已下**：删一个、留一个）**：
- ~~`ballots`~~ ⇒ **已删除**（轮 12／task-95，破坏性变更登记见 **§7.1**）：全树零写者、零读者，概念已由 **`ballotbox`** 承载。旧**声明**拼写仍被具名容忍（`PROJECTION_ALIASES`＋告警），故老部署无需改动；直接 `patch('ballots')` 仍**具名拒**（且本来就无写者）。
- `records` ⇒ **保留但不接线**（**带撤销条件**）：`kernel/records.js` 是**内存投影**，持久化**委托给 library 面**（文件头 `:16`）⇒ 本键无写者。★ 若下一次架构复核时仍无写者 ⇒ 按 §7.1 同样流程删除。**部署仍不要依赖它**。

### 6.2 零机制 ⇒ 声明后才由谁读（可调控性的边界，**同一节**）

| 维度 | **无声明时**（零机制） | **声明后（谁读）** |
|---|---|---|
| 工具面 | **恰好 1 个**：`vibe_vmu_status`（D-01 红线） | `host.js` 的 `TOOL_FACES`＋`resolveFaces`（声明 ⇒ 面被发布） |
| 投影耐久 | **不写穿**：键停在 store 种子（state→`null`／journal→`[]`） | `kernel/index.js` 的 attach 循环（`:975` 一带）＋ `kernel/resume.js` `hydrate()` |
| 空闲策略 | `idleAfterMs=0` ⇒ **空闲未定义，什么都不发生** | `kernel/control.js` `idleState()`；轮询点＝`kernel/index.js` 的 `beat()` |
| 上下文压缩 | 无 usage 信号 ⇒ **不注入** `[CONTEXT COMPACT]` | `kernel/prompt/index.js` `assemble()`（读 `ctx.contextPct`／`ctx.round`） |
| 自动论文 | `finalPaper=false` ⇒ 自动路径**具名拒**（手动仍可用） | `kernel/paper.js` `finalize({auto})` |
| 中间件权限 | 未声明 `trigger-workflow` ⇒ `api.services.get` **具名拒** | `kernel/loader.js` `makeApi().services.get`（发布清单来自 `kernel/index.js` 的目录） |
| 权威 | **不发明权威**（例：`idleAction` 默认 `notice`，本面永不自行休会；无主席 ⇒ 具名拒） | 各面按声明判定；**政策在 pack/中间件**（R1） |

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

### 7.1 破坏性变更登记（**已发生的**，逐条带日期/理由/迁移）

| 变更 | 日期 | 理由（实测） | 迁移 |
|---|---|---|---|
| **删除耐久键 `ballots`**（`kernel/store.js` 的 `PUBLIC_KEYS`） | 2026-10-15（轮 12／task-95） | **全树零写者、零读者**：`kernel/**` 内没有 `patch('ballots'…)`／`read('ballots'…)`；其概念已由 **`ballotbox`**（适配表键＋白名单键）承载 ⇒ 旧名只会让部署依赖一个**没有任何写者能产出**的键 | ① 声明 `vmu.resume.projections:['ballots']` 的部署：**旧拼写仍被具名容忍**（`kernel/index.js` 的 `PROJECTION_ALIASES` ＋ `vmu/deprecated-projection-name` 告警）⇒ 无需改；② 直接 `patch('ballots',…)`／`read('ballots')` 的脚本：**本来就会被拒**（无写者），现仍**具名拒** `VMU_INVALID_ARGUMENT`；③ 与 `ballotbox` 的语义差异：无（同一面）。★ 无关的同名字串（`vmu.control.pauseScope` 的作用域名、纪要记录的 `ballots` 字段、v5r 自己的 fold 台账）**不受影响** |
| **保留但不接线：耐久键 `records`**（**未删除**，带撤销条件） | 2026-10-15（同上） | `kernel/records.js` 是**内存投影**（文件头 `:16`：persistence stays with the library face），全树无写者 | 不改；★ **撤销条件**：若下一次架构复核时该面**仍无** store 写者 ⇒ 按本条同样的 §7 流程删除（不留"永远无人写"的公开名） |
| **宿主拒绝回执保留归属字段**（`host.js` 的 `toHostSpec` 错误分支） | 2026-10-23（轮 52／task-C2-C3-B10-B11 追加） | 错误分支原先只回 `{ok:false, code, message, hint}`，**丢掉 `enforced`／`enforcedScope`／`settingValues`**：同一次判定的成功回执经 `receiptMeta` 序列化、拒绝回执却没有，且 docs/03 承诺的"拒绝可答：读了这个判定的哪些键"在**所有 pack 工具**上都不可观测。v5r 的闸拒绝因此被迫从"抛"改成"返回回执"（`packs/v5r/tools.js` 的 `gateRefuse`）——**代码形状被宿主诊断面的不完整逼出来**，这是本条变更的真正理由 | 破坏性：无。三个字段**只在抛出方真的设置了它们时才出现**（`enforced` 须为数组、`enforcedScope` 须为非空字符串、`settingValues` 须为普通对象），所以原有"拒因只带 code/message/hint"的调用方**行为不变**；不读设置的拒绝**不会**凭空长出 `enforced: []`（那是"我查过了"的假声明）。判据：`tests/vmu-host-refusal-attribution.test.mjs`（改前 6/4 红、改后 10/0） |
| **邮件读面补 `urgent`**（`kernel/mailbox.js` 的 `listRow`／`openView`） | 2026-10-23（同上） | 写入侧（`sendBody`）在条目上记了 `urgent`、`send()` 的回执也回它，但两个**分诊读面**都把它删了 ⇒ 一条紧急私信在收件人的 list 行里与普通邮件**完全一致**；调用方唯一的补救是 `pending()` join，而 ack 之后 join 不到，`null` 让"分不清"退化成"没有"。读面删掉写入侧刚记下的事实，是**读面缺陷**而不是调用方的责任 | 破坏性：**字段数变了**（list 行 8→9、open 视图 6→7）。口径与写入侧同义：布尔原样透传，**布尔，缺省 `false`**（2026-10-23 二次裁决）：写侧永远记布尔，所以读到的是发送方的原意；从旧快照恢复的**老条目**没有该字段时给 `false`（"一条消息不说自己紧急就不紧急"），**不许** `undefined`／字段缺失，也不给 `null`。★ 读 `Object.keys(row)` 做严格字段数断言的消费方需要加一个键（本仓已改 `tests/vmu-mailbox.test.mjs`、`tests/vmu-v5r-tools.test.mjs`）；其余消费方只多一个可用字段 |

---

## 8. Error codes（提案；登记表）

> ★ **轮 2（task-14）新增登记**：下面 §8 的 `R2` 行来自四个新面的接线单（chat/mailbox/panel · resume/human/control · math adapters/jobs）。★ 登记**先于**实现落地是允许的（§8.1 会把未实现的标成提案 ✓）；★ 规则不变：**代码里每个非 `VMU_PACK_` 前缀的 `VMU_*` 字面量都必须在此登记**，否则 `tests/audit-vmu-docs.test.mjs` 的 C 节红 ✗。

| 码 | 语义 | 何时 | 是否必须具名解释 |
|---|---|---|---|
| `VMU_INVALID_ARGUMENT` | 参数非法（域外/缺失/类型） | 所有工具入口 | ✅ |
| **`VMU_MIDDLEWARE_KIND_UNSUPPORTED`** | **中间件形态不在总线可跑的两种之内**（`rules`｜`module`）；`script`／`plugin` 的真实载体在总线之外（M3＝`kernel/script-bridge.js`＋`vibe_vmu_script`；M4＝消费公开服务的外部 DSH 插件） | 中间件装载（`kernel/bus.js` 的 `add`／`validateEntry`，D-03） | ✅（须点名**真实载体**） |
| **`VMU_PACK_INVALID`** | **pack 声明本身不合法**（例：声明的提示段名不是 kebab-case）；与 `VMU_PACK_MISSING`（装载前置条件缺失）分开 | pack 装载（`kernel/pack.js`，`collectPackSections`） | ✅（须点名**违规项与包 id**） |
| **`VMU_PACK_LOADER_UNAVAILABLE`** | **内核没有装载器可委托**：`kernel.usePack()` 只有一个实现（`kernel/pack.js`），无 `packApplier` 注入时**具名拒**而不是走第二条静默路径（D-02 唯一实现） | 装载（`kernel/index.js` 的 `usePack`） | ✅（须给**注入方式**与替代入口） |
| **`VMU_PACK_PROMPT_POLICY_UNCONSUMED`** | **pack 声明了 `promptPolicies` 但没有消费者**：装载器未拿到 `onPromptPolicy` sink 时具名拒（策略要么被真正接进提示管线，要么别声明） | pack 装载（`kernel/pack.js` 的 `apply`／`plan` warnings） | ✅（须点名**缺哪个 sink**与如何提供） |
| **`VMU_PACK_PROMPT_POLICY_FAILED`** | ★ **PHASE 6 · 轮 11**：★ **一条 pack 提示词策略在合成或 apply 时抛错** —— ★ 由 `composePromptPolicies` 捕获并**点名 policy id ＋ 原始错误**；★ 回合循环把它变成**具名拒**，★ **绝不静默跳过** | 提示词管线（`kernel/pack.js` 的 `composePromptPolicies` → `kernel/turn/index.js` 装配） | ✅（★ 须同时给出 policy id 与原始原因；★ **不许把策略错误当成"没有策略"**） |
| **R2 · `VMU_CHAT_MUTED`** | 发言者在禁言期内发言 | 群聊（`kernel/chat.js` 的 `send`） | ✅（须给**解除时刻**） |
| **R2 · `VMU_CHAT_QUOTA_EXCEEDED`** | 超出 `vmu.chat.speakQuota` 发言配额 | 群聊 | ✅（须给**已用/上限/窗口**） |
| **R2 · `VMU_CHAT_FROZEN`** | 表决冻结期内发言且不属豁免（`vmu.chat.freezeExemptAdmins`） | 群聊 | ✅（须给**冻结的 ballotId**） |
| **R2 · `VMU_CHAT_NOT_ADMIN`** | 非管理员执行管理动作（`vmu.chat.admins`） | 群聊 | ✅（须给**允许名单**） |
| **R2 · `VMU_CHAT_ANCHOR_DANGLING`** | 引用/回复目标不存在（悬空锚） | 群聊 | ✅（须给**悬空 id**） |
| **R2 · `VMU_CHAT_CAP_REACHED`** | 聊天审计环形上限触界（`vmu.chat.historyCap`） | 群聊 | ✅（须给**丢弃条数**） |
| **R2 · `VMU_MAILBOX_NO_SUCH_RECIPIENT`** | 收件人不在册/无法解析（`resolveAudience` 缺或返回空） | 私信（`kernel/mailbox.js`） | ✅（须给**可用入口**） |
| **R2 · `VMU_MAILBOX_ACK_UNKNOWN`** | ack 一个不存在的待投递条目 | 私信 | ✅（须给**已知 id 示例**） |
| **P9R2 · `VMU_MAILBOX_NO_SUCH_ENTRY`** | `open`/`setState` 给了一个不属于该成员信箱的 id（含已 ack 后正文已丢弃的 id） | 私信（`kernel/mailbox.js` ✓） | ✅（hint 指向 `list()`；**与投递层 ack 明确分开**） |
| **R2 · `VMU_MAILBOX_DELIVERY_FAILED`** | 投递失败 ⇒ **不 ack**，留在待投递（缺 `deliver` 缝时也走此路） | 私信 `flush()` | ✅（须给**原始错误**与重试口径） |
| **R2 · `VMU_MAILBOX_ANCHOR_DANGLING`** | 引用已 ack 后删除的正文（只留 `{id,from,at,kind,bytes}`） | 私信 | ✅（须给**悬空引用 id**） |
| **R2 · `VMU_MAILBOX_CAP_REACHED`** | ack 台账/待投递触界（`vmu.mailbox.ackedLedgerCap`／`digestMax`） | 私信 | ✅（须给**丢弃/滞留条数**） |
| **R2 · `VMU_PANEL_UNKNOWN_FIELD`** | 写入面板的字段不在固定集合（`overall｜subgoal｜plan｜status｜subtasks`） | 面板（`kernel/panel.js`） | ✅（须给**允许字段**） |
| **R2 · `VMU_PANEL_TIME_KEY`** | 调用方试图自带时间戳（时间由注入时钟决定） | 面板 | ✅（须说明**时钟归属**） |
| **R2 · `VMU_PANEL_NO_SUCH_MEMBER`** | 面板目标成员不存在 | 面板 | ✅（须给**下一步**） |
| **R2 · `VMU_PANEL_DEVIATION`** | 他人改 `overall` 且 `deviationPolicy=refuse` | 面板 | ✅（须给**留痕口径**） |
| **R2 · `VMU_PANEL_CAP_REACHED`** | 面板历史/子任务/查看留痕触界（`historyCap`／`subtasksMax`／`auditCap`） | 面板 | ✅（须给**丢弃条数**） |
| **R2 · `VMU_RESUME_UNAVAILABLE`** | 恢复面不可用（无 store / 无 work 台账） | 断点续跑（`kernel/resume.js`） | ✅（须给**如何提供**） |
| **R2 · `VMU_RESUME_WRITE_BEFORE_READ`** | **写前必读**闸：未先读回就写 | 恢复面 `read/write/patch` | ✅（须给**先读哪个键**） |
| **R2 · `VMU_RESUME_BAD_STEP`** | 恢复步骤不合法（未知步骤/顺序错） | 恢复面 | ✅（须点名**步骤**） |
| **R2 · `VMU_RESUME_INTERRUPTED_NOT_PASSED`** | 在途项未结算就被当作已完成传递 | 恢复面 | ✅（须点名**未结算项**） |
| **R2 · `VMU_RESUME_MAILBOX_UNAVAILABLE`** | 需要未 ack 私信面但 `mailbox` 缝缺失 | 恢复面 | ✅（须给**注入方式**） |
| **R2 · `VMU_RESUME_CLOCK_UNAVAILABLE`** | 缺注入时钟（恢复判定需要时刻） | 恢复面 | ✅（须给**时钟口径**） |
| **R2 · `VMU_RESUME_READBACK_DRIFT`** | 写后回读与写入不一致（`vmu.resume.readBack`） | 恢复面 | ✅（须给**两份值**） |
| **R2 · `VMU_RESUME_PROJECTION_GAP`** | journal 有缺口 ⇒ **拒绝水合**（不假装恢复了） | 恢复面 `hydrate` | ✅（须给**缺口位置**） |
| **R2 · `VMU_RESUME_NO_ADAPTER`** | 该面无 adapter ⇒ 具名 `unhydrated` | 恢复面 | ✅（须点名**哪个面**） |
| **R2 · `VMU_RESUME_QUEUE_FULL`** | 待批/待恢复队列触界（`vmu.human.approvalQueueCap`／`vmu.resume.journalCap`） | 恢复面/审批闸 | ✅（须给**当前与上限**） |
| **R2 · `VMU_HUMAN_APPROVAL_PENDING`** | 动作被审批闸拦住 ⇒ **只能排队**（带 `detail.queued`/`requestId`） | 审批闸（`kernel/human.js` `gate`） | ✅（须给**队列入口**） |
| **R2 · `VMU_HUMAN_VETOED`** | 人类否决已生效 | 审批闸 | ✅（须给**否决范围**） |
| **R2 · `VMU_HUMAN_DEFAULT_ALLOW_NOT_ACKNOWLEDGED`** | `onTimeout=default-allow` 但 `vmu.human.defaultAllowAcknowledged=false` ⇒ 超时**具名拒**（绝不静默放行） | 审批闸 | ✅（须说明**如何确认**） |
| **R2 · `VMU_HUMAN_LIFT_REASON_REQUIRED`** | 解除否决未给理由 | 审批闸 | ✅（须给**允许角色**） |
| **R2 · `VMU_HUMAN_DASHBOARD_DOMAIN`** | 请求的仪表盘域未声明（`vmu.human.dashboardDomains`；`private`/`dm` 永不可见） | 仪表盘 | ✅（须给**已声明域**） |
| **R2 · `VMU_CONTROL_PARAM_UNDECLARED`** | 改参数键不在 `vmu.control.tunableKeys` | 控制面 `tune` | ✅（须给**白名单**） |
| **R2 · `VMU_CONTROL_PARAM_ROLE`** | 改参数者不在 `vmu.control.canSetRoles` | 控制面 `tune` | ✅（须给**允许角色**） |
| **R2 · `VMU_MATH_LIB_UNAVAILABLE`** | 声明的科学计算库在本机不可用 | 数学适配（`kernel/mathadapters.js`） | ✅（须给**探测结果与安装指引**） |
| **R2 · `VMU_MATH_LIB_NOT_DECLARED`** | 请求的库不在 `vmu.math.adapters.libs`（零机制不允许猜） | 数学适配 | ✅（须给**已声明库**） |
| **R2 · `VMU_MATH_SHAPE_UNKNOWN`** | 结果形状无法归类到 `SHAPE_KINDS` | 数学适配 | ✅（须给**可用形状**） |
| **R2 · `VMU_MATH_HARNESS_FAILED`** | 适配脚本自身失败（不是数学结论） | 数学适配 | ✅（须给**原始错误**） |
| **R2 · `VMU_MATH_RESULT_UNPARSEABLE`** | 适配输出不是约定信封 | 数学适配 | ✅（须给**原始输出片段**） |
| **R2 · `VMU_MATH_EXPR_REQUIRED`** | 请求缺表达式/代码 | 数学适配 | ✅（须给**调用示例**） |
| **R2 · `VMU_MATH_JOBS_MIRROR_UNWIRED`** | 声明了镜像但缺 `fs` 缝 ⇒ **不静默**，`admission().fileMirror=false` | 数学作业（`kernel/mathjobs.js`） | ✅（须给**注入方式**） |
| **R2 · `VMU_MATH_JOBS_DIR_UNSAFE`** | 镜像目录越出 root（路径逃逸） | 数学作业 | ✅（须给**被拒路径与 root**） |
| **R2 · `VMU_MATH_JOB_INVALID_STATE`** | 作业状态不允许该操作（对照四态） | 数学作业 | ✅（须给**当前状态**） |
| **R2 · `VMU_MATH_ADAPTER_OP_UNKNOWN`** | 请求的适配操作不在声明集合 | 数学适配 | ✅（须给**可用操作**） |
| **R2 · `VMU_REPORT_NO_TRANSPORT`** | 汇报要投递但缺 `deliver` 缝（先留痕，再具名拒；绝不假装发出） | 汇报（`kernel/report.js`） | ✅（须给**注入方式**） |
| **R2 · `VMU_REPORT_ACTION_NOT_ALLOWED`** | 汇报声明里出现动作字段（`action|then|run|drive|decide|execute`）⇒ **汇报不是触发器** | 汇报 | ✅（须说明**汇报只报告**） |
| **R2 · `VMU_REPORT_TEMPLATE_VAR_UNKNOWN`** | 模板引用了未提供的变量 | 汇报 | ✅（须给**已知变量**） |
| **R2 · `VMU_REPORT_TRIGGER_UNKNOWN`** | 触发器种类不在 `event|period|threshold` | 汇报 | ✅（须给**允许种类**） |
| **R2 · `VMU_REPORT_UNKNOWN_NAME`** | 引用了未声明的汇报名 | 汇报 | ✅（须给**已声明名**） |
| **R2 · `VMU_REPORT_CHANNEL_UNKNOWN`** | 通道不在 `vmu.report.channels` | 汇报 | ✅（须给**允许通道**） |
| **R2 · `VMU_REPORT_NO_RECIPIENTS`** | 非 log 通道却没有收件人 | 汇报 | ✅（须给**收件人白名单**） |
| **R2 · `VMU_REPORT_DECLARATION_INVALID`** | 汇报声明结构非法（缺 name/trigger/template 等） | 汇报 | ✅（须点名**缺哪一项**） |
| **R2 · `VMU_REPORT_DELIVER_FAILED`** | 投递失败（已留痕并计数，不静默） | 汇报 | ✅（须给**原始错误**） |
| **R2 · `VMU_REPORT_NOT_ENABLED`** | `vmu.report.enabled=false` 时要求发送 | 汇报 | ✅（须给**开关键**） |
| **R2 · `VMU_REPORT_PARAM_NOT_DECLARED`** | 改的参数键不在 `vmu.report.params`（边界由声明给出，不写死内核） | 汇报参数面 | ✅（须给**已声明域**） |
| **R2 · `VMU_REPORT_PARAM_NOT_ALLOWED`** | 改参者不在 `vmu.report.whoMayChange` | 汇报参数面 | ✅（须给**允许角色**） |
| **R2 · `VMU_REPORT_PARAM_READONLY`** | 参数为 H3／框架所有 ⇒ 只读 | 汇报参数面 | ✅（须给**键与热改等级**） |
| **R2 · `VMU_REPORT_PARAM_REASON_REQUIRED`** | `requireReason=true` 而未给理由 | 汇报参数面 | ✅（须给**留痕口径**） |
| **R2 · `VMU_REPORT_AUDIT_UNAVAILABLE`** | 声明要写审计但缺 `audit` 缝（具名上报，不静默） | 汇报 | ✅（须给**注入方式**） |
| **R2 · `VMU_RESUME_SNAPSHOT_VERSION`** | 快照版本与当前不兼容（跨版本读必须拒） | 恢复面快照 | ✅（须给**两侧版本**） |
| **R2 · `VMU_RESUME_SNAPSHOT_INCOMPLETE`** | 快照缺必需字段 ⇒ **拒绝水合**（不假装恢复） | 恢复面快照 | ✅（须点名**缺哪些字段**） |
| **R2 · `VMU_RESUME_RESTORE_CONFLICT`** | 恢复目标已有冲突状态（members/tasks/budget/会议五面共用） | 恢复面 `restore` | ✅（须给**冲突双方**） |
| **R2 · `VMU_IDS_BAD_KIND`** | id kind 不合法（须形如小写名） | id 铸造（`kernel/ids.js`） | ✅（须给**示例**） |
| **R2 · `VMU_IDS_UNAVAILABLE`** | id 面不可用（未绑定/不可用） | id 铸造 | ✅（须给**绑定方式**） |
| **R3 · `VMU_MATH_JOB_ID_TAKEN`** | 作业 id 已被占用（显式 `jobId` 与既有镜像/回执冲突）⇒ 不覆盖、具名拒 | 数学作业（`kernel/mathjobs.js`） | ✅（须给**既有作业状态**与换名建议） |
| **R3 · `VMU_MEETING_TIER_CONFLICT`** | 会议级别与声明冲突：`vmu.meetings.allowLight=false` 时请求 light，或 light 会议试图产出**实体定论**（`vmu.meetings.tier` 的派生谓词） | 会议（`kernel/meetings.js` 的 `open()`／`truthWriteRefusal()`／`close()`） | ✅（须点名**冲突的键与当前档位**） |
| **R3 · `VMU_OFFICE_CONSULT_REQUIRED`** | **未咨询所内即定稿**（C-30 的门；由 `vmu.paper.officeConsult=required` 声明、`officeConsultOn` 决定时机、`officeConsultExemptRoles` 决定豁免，**默认不豁免**） | **在册的定稿路径**：`packs/v5r/paper.js` → `kit/paper.js` 的 `recordFinal({decision:'deliverable'})`（`kernel/paper.js` 的同名门在装配里没有构造者，因此不是执行点） | ✅（须给**三条出路**：先咨询／改时机键／显式豁免角色；`.enforced[]` 列出真正求值的键，`.settingValues` 给出当前生效值） |
| **R3 · `VMU_OFFICE_CONSULT_TIMEOUT`** | **所办问询超时**：`vmu.paper.officeConsultTimeoutMs > 0` 且已等待更久 ⇒ 按 `officeConsultOnTimeout` 分岔（`hold`：提问保留、**不放行**；`refuse`：作废该提问、下次重新开问）——**两种分岔都不放行** | 同上（`kit/paper.js` 的 `recordFinal`） | ✅（须给 `heldOnTimeout`/`requestCleared` 与**当前超时值**；未知取值一律按 `hold` 执行并在 `.settingValues` 里显形） |
| **R3 · `VMU_MEETING_LIGHT_NO_TRUTH`** | **light（简流程）会议试图产出实体定论**：`vmu.meetings.tier='light'` 的派生谓词在收束/决议写入点具名拒（简流程不得产出实体定论，与 `allowLight` 的拒绝分开） | 会议（`kernel/meetings.js` 的 `close()`／`truthWriteRefusal()`；`kernel/minutes.js` 的 `resolve()` 经注入接缝） | ✅（须点名**当前 tier**与"要么改 tier、要么不要写实体定论"） |
| **R3 · `VMU_ACTIVITY_NO_TIMER`** | 本部署没有定时器（`timer: null`）⇒ `wait()` 具名拒，而不是假装等待 | 活动等待（`kernel/activity.js`／`kernel/index.js` 的装配） | ✅（须给**注入方式**：省略 `timer` 即用平台定时器） |
| **R3 · `VMU_ACTIVITY_TIMER_INVALID`** | 注入的 timer 形状不被接受 | 活动等待 | ✅（须给**可接受形状**） |
| **R3 · `VMU_ACTIVITY_INVALID_TIMEOUT`** | 请求的超时不是合法数值 | 活动等待 | ✅（须给**默认值**） |
| **R3 · `VMU_ACTIVITY_BOUNDS_INVALID`** | `timeoutMinMs > timeoutMaxMs`（声明边界自相矛盾） | 活动等待 | ✅（须给**两个值**） |
| **R3 · `VMU_ACTIVITY_SIGNAL_INVALID`** | 传入的取消信号形状非法 | 活动等待 | ✅（须给**期望形状**） |
| **R3 · `VMU_ACTIVITY_ABORTED`** | 等待被取消（调用方主动） | 活动等待 | ✅（须说明**disposer 已清理**） |
| **R3 · `VMU_ACTIVITY_WAITER_LIMIT`** | 同时等待者触界（`vmu.activity.maxWaiters`） | 活动等待 | ✅（须给**当前与上限**） |
| **R3 · `VMU_ACTIVITY_DISPOSED`** | 对已释放的等待器继续操作 | 活动等待 | ✅（须给**下一步**：重新 `wait()`） |
| **R3 · `VMU_ACTIVITY_WAKE_HOOK_UNKNOWN`** | `vmu.activity.wakeOn` 里声明了未登记的总线钩子名 | 活动等待（构造期注册） | ✅（须给**已登记钩子名**与登记入口） |
| **R3 · `VMU_ACTIVITY_WAKE_UNWIRED`** | 声明了唤醒钩子但总线没真的接上（条目未注册/被拒） | 活动等待 | ✅（须说明**为何没接上**：H2 下次会话生效／总线拒绝） |
| **R3 · `VMU_ACTIVITY_PEER_SEAM_FAILED`** | `activePeers` 接缝自身失败（花名册读不到）⇒ 具名上报，不假装"无同伴" | 活动等待 | ✅（须给**原始错误**与降级口径） |
| **R2 · `VMU_IDS_NOT_BOUND`** | 在 `bindIds` 之前调用了 `mint()` | id 铸造 | ✅（须给**装配顺序**） |
| **R2 · `VMU_IDS_PERSIST_FAILED`** | 计数器写穿失败（**id 仍不复用**：靠已观测最大后缀兜底） | id 铸造 | ✅（须给**原始错误**） |
| **R2 · `VMU_HUMAN_APPROVAL_DENIED`** | 人类**拒绝**了待批请求 | 审批闸 | ✅（须给**拒绝范围**） |
| **R4 · `VMU_RESUME_BUSY`** | **恢复是不可交叠的独占段**：`recover()` 取仓库自己的 `vmu.store.lock` 时**被占** ⇒ 具名拒；**被拒者不释放别人的锁**（`detail.lockCode/waitedMs/attempts`，message 带 holder） | 会话恢复（`kernel/resume.js`，经注入的 `lock` 缝＝`kernel/storepolicy.js`） | ✅（须给 **holder** 与"等一会儿再试"的下一步） |
| **R4 · `VMU_RESUME_CHILDREN_UNAVAILABLE`** | **在活子代理对账端口缺席**：宿主没有 `subagents.listChildren` ⇒ 恢复**仍然成功**（`children.attached:false` 具名），只是**说不出**"名册里持 childId 的成员是否还在" | 会话恢复（`kernel/resume.js` 的 `children` 步；入口装配） | ✅（须说明"名册未能核对"与注入方式） |
| **R4 · `VMU_BUS_NAME_REQUIRED`** | 总线事件**缺字符串名**（把对象当首参传 ⇒ 本仓曾因此**静默不发**） | 总线广播（各模块的 `emit` 助手：`alerts`／`ballotbox` 等） | ✅（须说明"总线只收字符串名"，并给正确形态 `emit('<名>', payload)`） |
| **R4 · `VMU_BUS_EMIT_FAILED`** | 广播被拒（**未登记钩子名**／中间件拦截／形状错）⇒ 记入模块自己的日志，**不再被 catch 吞** | 总线广播（同上） | ✅（须给**原始 code 与钩子名**） |
| **R4 · `VMU_SPAWN_TIMER_CLEANUP`** | 子进程预算定时器**清理失败**（`clearTimeout` 抛错 ⇒ 真泄漏，具名上报而不是吞掉） | 宿主 spawn 缝（`host-spawn.js`，`seam.timerCleanupErrors`） | ✅（须给**原始错误**；正常结算路径已在 `finally` 清理） |
| **R6 · `VMU_SPAWN_HANDLE_CALLBACK_FAILED`** | **killable 缝**把宿主 handle 交给调用方时，**回调自身抛错**（可取消性不受影响，但要具名） | 宿主 spawn 缝（`host-spawn.js` 的 `spawn(request, onHandle)`，记进 `seam.timerCleanupErrors`） | ✅（须给**原始错误**） |
| **R6 · `VMU_PAPER_ROUNDS_EXCEEDED`** | **论文修订轮次超上限**（`vmu.paper.maxRounds`；v5r 只在散文里承诺过"有轮次上限"，本键是它的**唯一读者** `revise()`）⇒ 具名拒，上限进 `enforced[]`，回执带 `rounds`/`maxRounds` | 论文面（`kernel/paper.js` 的 `revise()`） | ✅（须给**当前轮次与上限**，并说明 `0`＝不限／或换一版手稿） |
| **R5 · `VMU_TASK_DEPENDENCY_CYCLE`** | **依赖边会使任务图成环**（自环／两节点环／三跳长环）⇒ 具名拒；`detail.cycle` 给**环路径**（如 `['t-3','t-1','t-2','t-3']`） | 任务台账（`kernel/tasks.js:59-63` 的 `cycleRefusal`；抛出点 `:214` `create`／`:240` `setDependencies`） | ✅（须给**环路径**与"删掉环上任一条边"的出路） |
| **R2 · `VMU_HUMAN_QUEUE_FULL`** | 待批队列触界（`vmu.human.approvalQueueCap`） | 审批闸 | ✅（须给**当前与上限**） |
| **R2 · `VMU_HUMAN_LIFT_ROLE`** | 解除否决者不在 `vmu.human.vetoLiftRoles` | 审批闸 | ✅（须给**允许角色**） |
| **R2 · `VMU_LEAN_JOBS_MIRROR_UNWIRED`** | Lean 作业镜像声明了但缺 `fs` 缝 ⇒ **不静默**，`admission().fileMirror=false` | 形式化面（`kernel/lean.js`） | ✅（须给**注入方式**） |
| **R2 · `VMU_LEAN_JOBS_DIR_UNSAFE`** | Lean 作业镜像目录越出 root（路径逃逸） | 形式化面（`kernel/lean.js`） | ✅（须给**被拒路径与 root**） |
| **R2 · `VMU_CONTROL_PARAM_UNAVAILABLE`** | 控制面没有设置写接缝 ⇒ 改参不可用（不静默） | 控制面 `tune` | ✅（须给**注入方式**） |
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
| `VMU_LEAN_SPAWN_FAILED` | Lean 进程起不来/异常（**须给原始错误** ✓；回执带 `resolved`／`doneError`／`resolveError`／`spawnError`／`cwd`／`pathPrefix`／`signal`／`timedOut`） | 形式化面 | ✅ |
| `VMU_LEAN_EXIT_UNOBSERVED` | **已解析、已启动句柄，但宿主未给退出码且无任何错误字段**（真机典型：DSH 沙箱拒绝执行该路径，如 workspace-write 拒绝工作区外 exe） | 形式化面（`kernel/lean.js` ✓） | ✅（hint 指向沙箱/执行权限，而非“命令不存在”） |
| `VMU_LEAN_COMMAND_NOT_FOUND` | **命令解析不到**（宿主服务的 PATH 找不到 `lean`；与“找到但退出非零”分开） | 形式化面（`kernel/lean.js` ✓） | ✅（hint 指向 `vmu.math.leanCommand` 或宿主 PATH） |
| `VMU_LEAN_FILE_UNREADABLE` / `VMU_LEAN_FILE_REQUIRED` | 产物文件读不到／`submit` 未给 `file` | 形式化面 | ✅（本面只编译既有文件 ✓） |
| `VMU_LEAN_STATEMENT_REQUIRED` | `submit` 未给 `statement`（回执与审计的对象 ✓） | 形式化面 | ✅ |
| `VMU_LEAN_NOT_SETTLED` | 作业尚未结算（`state≠settled`）就要求结算 | 形式化面 | ✅（须给当前 state ✓） |
| `VMU_LEAN_ARCHIVE_DRIFT` | **归档引用的内容已变**（哈希不符）⇒ `read()` 具名拒且**不返回旧内容** ✓ | 形式化面（`kernel/lean.js` ✓） | ✅（**只引不复制**的执行点 ✓） |
| `VMU_LEAN_ARCHIVE_NOT_FOUND` / `VMU_LEAN_ARCHIVE_NAME_TAKEN` / `VMU_LEAN_ARCHIVE_NAME_REQUIRED` | 归档三动词：条目不存在／**重名**（不静默覆盖 ✗）／未给 `name` | 形式化面（`kernel/lean.js` ✓） | ✅ |
| `VMU_LEAN_KIND_UNKNOWN` | `archive` 的 `kind` 不在允许的 kind 枚举（`def｜lemma｜theorem｜assumption`） | 形式化面（`kernel/lean.js` ✓） | ✅（未知即拒，不猜 ✓） |
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
| `VMU_ENV_UNKNOWN_NEED` | 环境适配面收到表里没有的 need 名 | 环境适配（`kernel/env.js` ✓） | ✅（hint 列出已知 need；**探测失败不是这个码**） |
| `VMU_ENV_NO_PROBE` | need 行没有可运行的 probe.command（表/设置写错了） | 环境适配 | ✅（指出补 `probe.command/args`） |
| `VMU_ENV_PROBE_FAILED` | 注入的 spawn 接缝直接抛错（面本身没跑起来） | 环境适配 | ✅（带原始错误；探测 exit≠0 **不是**这个码） |
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
| `VMU_MEETINGS_MARKER_UNREADABLE` | 耐久域标记**读不到** ⇒ **具名降级：不猜哪个会还开着**（F51 的域读面，出处 `kernel/meetings.js` 的 `openMeetings()`；未绑定接缝时是 `durableMarker:false`，同样不发明） | 会议 | ✅ |
| `VMU_MEETING_BOX_UNWIRED` | **未声明 `motion→box` 绑定** ⇒ 具名：内核**不发明映射、不自动开箱**（开箱是政策，R1；出处 `kernel/meetingmarker.js` 的 `mirrorVote()`。★ **装配侧声明绑定只有一条路**：服务 `vmu.meetings` 的 `bindBox(fn)`（注册／换绑／解绑）／`boxBinding()` —— 见本表 `vmu.meetings` 行；`createMeetings({ boxFor })` 是**内核内部工厂**的形参（`kernel/meetings.js` 的 `createMeetings` 签名；★ **行号不手写**，以 `grep -n "boxFor = null" vibe-math-vmu/kernel/meetings.js` 为准），而 `createKernel` **没有** `boxFor` 形参（多传的实参被**静默忽略**）⇒ 部署／插件路径一律走 `bindBox()`。**R14 复核**：`kernel/index.js` 的 `createMeetings({…, ballot: meetingBallot})` 调用点装配传的是 `ballot: meetingBallot`（★ **行号不手写**，以 `grep -n "ballot: meetingBallot" vibe-math-vmu/kernel/index.js` 为准）；真装配未绑时回执 `{mirrored:false,reason:'no-binding',code:'VMU_MEETING_BOX_UNWIRED'}`，`reason:'no-seam'` 在真装配**已不可达**） | 会议·表决联动 | ✅ |
| `VMU_MEETING_BOX_UNMAPPED` | 绑定**已声明**但答"这个动议没有对应箱"（返回 `null`／无 `boxId`）⇒ 具名；"没有箱"是**事实**，不是静默 | 会议·表决联动 | ✅ |
| `VMU_MEETING_BOX_BINDING_FAILED` | **绑定回调抛错**（回调自带 `code` 时以它为准）⇒ 具名；回执 `ballot:{mirrored:false, reason:'binding-threw', code, message}` | 会议·表决联动 | ✅ |
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
| `VMU_MEETINGS_MARKER_UNREADABLE` | 耐久**会议域接缝**读不到（`durable.read()` 抛）⇒ **拒绝猜**"哪个会还开着" | 会议域标记 F51（`kernel/meetingmarker.js` 的 `openMeetings()`；轮 11 拆分后该码随标记族迁出 `meetings.js`） | ✅（`openMeetings()` 回 `{ok:false, durableMarker:true, source:'seam-error', code, message}`；`status().durableMarker.{failures,lastError}` 自曝，`kernel/index.js` 的域接缝把 `meetings` 投影键的域行喂给它） |
| `VMU_MINUTES_ACTION_REQUIRED` | 决议缺行动项 | 纪要 | ✅ |
| **表决（卷 08 ✓）** | | | |
| `VMU_BALLOT_METHOD_UNSUPPORTED` | 计票方法未实现/未声明 | 表决 | ✅（须给**可用方法**） |
| `VMU_PAPER_LATEX_NO_ENGINE` | ★ **PHASE 7**：`latex.check` 的引擎探测全部不可用——回执的 `tried[]` 列出试过哪些引擎/退出码/stderr 摘要（“没引擎”与“编译失败”分开） | 论文/LaTeX | ✗（安装引擎或改 engineOrder） |
| `VMU_PAPER_LATEX_FAILED` | ★ **PHASE 7**：引擎可用但编译非零退出——回执带 `stderr` 摘要与真实 `argv` | 论文/LaTeX | ✗（按 stderr 修文档） |
| `VMU_PAPER_LATEX_TIMEOUT` | ★ **PHASE 7**：编译超过声明的预算（`vmu.paper.latexTimeoutMs` 或调用方 timeoutMs） | 论文/LaTeX | ✅（调大预算/简化文档） |
| `VMU_PAPER_LATEX_INTERRUPTED` | ★ **PHASE 7**：编译被取消/中断（与 timeout 分开） | 论文/LaTeX | ✅（重跑；signal 在回执里） |
| `VMU_PAPER_LATEX_NO_OUTPUT` | ★ **PHASE 7**：exit 0 但 outDir 里没有 PDF（或目录不可写）——不假成功 | 论文/LaTeX | ✗（检查 outDir/文档） |
| `VMU_BALLOT_RULE_UNKNOWN` | ★ **PHASE 7**：`ballot.open({ rules })` 里出现未声明的规则名（避免拼写错误静默变成全局默认） | 票箱 | ✗（给 minVotes／allowRevote／maxChoices／minChoices／mode 之一） |
| `VMU_BALLOT_RULE_INVALID` | ★ **PHASE 7**：逐箱规则值非法（minVotes 超有表决权人数、minChoices>maxChoices、mode 非 single/multi 等） | 票箱 | ✗（按提示修正） |
| `VMU_BALLOT_CHOICE_COUNT` | ★ **PHASE 7**：选择数违反该票箱的 minChoices/maxChoices（逐箱规则，不是全局设置） | 票箱 | ✗（按该票箱规则调整或改规则） |
| `VMU_BALLOT_MIN_VOTES_NOT_MET` | 本次投票**成立门槛未达** | 表决 | ✅（须给**当前与门槛**） |
| `VMU_TURN_NO_FENCE` | 回复里**既没有工具汇报、也没有可解析的 json 围栏** ⇒ 无可分派（★ **LANE turn-reply**：首选是工具汇报 `vibe_vmu_turn { op:"reply", report:{…} }`；围栏 JSON 仍是**兼容通道**，字节不变） | 轮次编排 26 | ✗（须**同时**给出工具形式与围栏 JSON 形式，★ 不再只要求"只输出一个围栏 JSON 对象"） |
| `VMU_TURN_REPLY_CONFLICT` | ★ **LANE turn-reply（08号决策）**：★ **同一回合里，工具汇报与围栏 JSON 对同一字段给出了不同的值** —— ★ 一个字段不能有两个真相；★ 冲突字段**逐一点名**，★ 且**在派发前**拒（半个回合都不会落地） | 轮次编排 26 | ✅（★ 同一字段只走**一个**通道：从工具汇报里删掉它，或从围栏 JSON 里删掉它；★ 两边值**相同**时合并，不拒；★ 回执以 `source:"tool+text"` 标明合并） |
| `VMU_TURN_NO_PENDING_MEMBER` | ★ **LANE turn-reply（08号决策）**：★ **没有打开着的成员回合，却有人用 `vibe_vmu_turn { op:"reply" }` 汇报** —— ★ 工具**不许凭空造出一个回合** | 轮次编排 26 | ✗（★ 先 `op:"step"` 拿到 `awaiting:true`＋`memberPrompt`，★ 再汇报那个回合；★ 兼容路径仍是 `op:"step"` 的围栏 JSON） |
| `VMU_PROMPT_BINDING_CONFLICT` | **同一段、同一维度上有两条绑定并列** ⇒ 拒（不再静默取其一） | 提示管线 06 | ✗（给其中一条更具体的维度；优先级 `role < phase < member < task`） |
| `VMU_PROMPT_VARIABLE_MISSING` | **占位符无人供值**（`vmu.prompts.missingVariable=refuse` 时） | 提示管线 06 | ✗（在装配上下文或 settings 里补值；默认 `report` 只记录不拒） |
| `VMU_TURN_BAD_JSON` | 围栏内容**不是合法 JSON**，或不是对象 | 轮次编排 26 | ✗（与"没有围栏"是**两种**失败 ✗） |
| `VMU_TURN_UNKNOWN_FIELD` | 回复字段**不在已宣告目录**里，且 `vmu.turn.unknownReplyFieldMode='refuse'`（默认 `ignore-named` 不抛此码，改为 `ignoredFields`＋notice） | 轮次编排 26 | ✗（须**点名**该字段并列出已知字段，**绝不猜** ✗） |
| `VMU_TURN_ASSEMBLY_FAILED` | **管线拒绝了本轮装配** | 轮次编排 26 | ✗（须转述管线的拒因） |
| `VMU_TURN_FIELD_NOT_APPLICABLE` | **回执带了某个字段，但本回合的 face/tool 根本调不到**（真机 `NO_OPEN_MEETING` 的真实原因：指令没进提示词）；`cause` 保留原会议错误 | 轮次编排 26（`kernel/turn/index.js` ✓） | ✅（hint 指向 `instructionDelivered` 与 per-turn tools allowlist） |
| `VMU_TURN_REENTRANT` | ★ **PHASE 6 / K2**：★ **已有一个回合在途，★ 第二次 `run()` 会嵌套** —— ★ 本循环的**归因／成员回复槽／通告队列都是单回合状态**，★ 嵌套会覆盖 | 轮次编排 26 | ✗（★ **等在途回合结算后再调**；★ `drive()`／`step()` 已按顺序调用，★ 不受影响 ✓） |
| `VMU_TURN_DELIVERY_TIMEOUT` | ★ **PHASE 6 / SLV**：★ **one-shot 成员回合在 `vmu.turn.deliveryTimeoutMs` 内没有结算**（请求已进入调用、未返回）—— ★ 超时后该回合**具名失败并释放串行派发队列**，后面的回合继续；★ 记录带 turn／member／已等毫秒／最后交付阶段／是否已进入调用 | 轮次编排 26 | ✅（可调 deadline；★ 正常回合不受影响） |
| `VMU_TURN_DISPATCH_FAILED` | ★ **PHASE 6 / SLV**：★ **一次 `turn.dispatch(spec)` 的成员回合在串行队列里失败**（交付/解析/写回任一环节）—— ★ 失败原因与原文在 `lastError`，`dispatch.completed` 不进；★ 队列继续 | 轮次编排 26 | ✅（读 `dispatchStatus().lastError` 与 `recentCompleted`） |
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
| `VMU_COMMIT_STORE_FAILED` | **注入的 `commitStore` 在**调用时**解析抛出** ⇒ 具名降级：记 `commit-store-failed` 并把日志转**非耐用**（`gate.durable===false`），**不静默吞** | G6 耐用日志 | ✅（`status().seams.commitStore`／`commitStoreNote` 点名缺席与注入方式） |
| `VMU_EXIT_FLUSH_UNAVAILABLE` | 退出时**装配没有可调用的 `shutdown()` 接缝**（内核面缺 `recovery.exit()`）⇒ 具名缺口：既不声称"等到了写穿"，也不声称"刷了 journal" | 退出冲刷（§2） | ✅（`status().shutdown.code`＋适配器 receipt＋`ctx.logger.warn`） |
| `VMU_EXIT_FLUSH_FAILED` | `recovery.exit()` **抛了**（契约要求它把失败装进回执，不抛）⇒ 照实记下，不吞 | 退出冲刷（§2） | ✅（`status().shutdown.message`） |
| `VMU_EXIT_FLUSH_INCOMPLETE` | 退出冲刷**回执 `ok:false` 且没有更具体的码** ⇒ 用这个兜底码，失败键在 `failed[]` 里具名 | 退出冲刷（§2） | ✅（`status().shutdown.failed[]`） |
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
| `VMU_MEMBER_LIMIT` | **同一雇佣者名下的临时（试用期未转正）成员超上限**（轮 10／`vmu.members.maxTempPerMember`；实现于 `kernel/recruit.js` 的 `accept()` ✓） | 招募 | ✅（须给 `scope:'per-member'` ＋ **current/limit** ✓；`hint` 说明"先转正或释放一个，或调键"） |
| `VMU_RESUME_NO_TARGET` | 投影**声明了但该面在本装配里是 null**（零机制：没人声明就没有实例，例如 `members` 需要 slots/maxLiveMembers）⇒ **没有可包裹的目标**，键保持未接线 | 恢复/投影（`kernel/index.js`） | ✅（`status().projections.notAttached[].reason` **逐面**说明"为什么没有目标"，与内部错误区分开） |
| `VMU_RECRUIT_NEEDS_HUMAN` | **必须人类批准**（`vmu.admission.needsHuman=true` 而无具名批准者；实现于 `kernel/recruit.js` ✓） | 招募 | ✅（须给批准者入口 ✓） |
| `VMU_RECRUIT_PROBATION_PERMISSIONS` | 试用期权限**超出上位权限**（非子集；实现于 `kernel/recruit.js` ✓） | 招募 | ✅（须点名越界权限 ✓） |
| `VMU_ROLE_SEPARATION_VIOLATED` | **职责分离**被违反（同一实例兼任 `separationPairs` 的两半；招聘与晋升两条路都拦 ✓，实现于 `kernel/recruit.js` ✓） | 任职（17） | ✅（须给**冲突的两半**与当事人 ✓） |
| `VMU_ROLE_TERM_NOT_RENEWABLE` | 任期**不可续**（`vmu.roles.termRenewable=false` ✓） | 任职（17） | ✅（须给**席位**与被告知者 ✓） |
| `VMU_ROLE_RECALL_QUORUM` | **罢免支持率不足**（低于 `vmu.roles.recallQuorum` ✓） | 任职（17） | ✅（须给**现值／阈值** ✓） |
| `VMU_ROLE_RECALL_COOLDOWN` | **罢免冷却期内**再次罢免（`vmu.roles.recallCoolDownMs` ✓，防反复弹劾 ✓） | 任职（17） | ✅（须给**剩余时间** ✓） |
| `VMU_ROLE_EVIDENCE_REQUIRED` | **晋升缺证据**（`vmu.roles.promotionNeedsEvidence=true` ✓） | 任职（17） | ✅（须点明缺 `evidence` ✓） |
| `VMU_SAFETY_KILL_SWITCH` | **全局停止开关生效**（`vmu.safety.killSwitch=true` ⇒ 一切子进程与写入具名拒；实现于 `kernel/guard.js` ✓） | 安全（20） | ✅（须点明**是总开关**与如何解除 ✓） |
| `VMU_SAFETY_EXEC_NOT_ALLOWED` | **命令不在白名单**（`vmu.safety.execAllowlist` 非空时；实现于 `kernel/guard.js` ✓） | 安全（20） | ✅（须给**白名单内容** ✓） |
| `VMU_SAFETY_NET_DENIED` | **默认禁网下启动网络客户端**（`vmu.safety.netPolicy=off`；实现于 `kernel/guard.js` ✓） | 安全（20） | ✅（须给**策略值**与放行方式 ✓） |
| `VMU_SAFETY_PATH_TOO_LONG` | **路径超长**（`vmu.safety.maxPathLength`；实现于 `kernel/guard.js` ✓） | 安全（20） | ✅（须给**实际长度与上限** ✓） |
| `VMU_SAFETY_SYMLINK_DENIED` | **路径跨越软链**（`vmu.safety.followSymlinks=false`；实现于 `kernel/guard.js` ✓） | 安全（20） | ✅（须给**具体链接路径** ✓） |
| `VMU_OUTREACH_INCOMPLETE` | 传播包**缺公共摘要**（`vmu.dissemination.publicSummaryRequired=true`；实现于 `kernel/publication.js` ✓） | 传播（22） | ✅（须点明缺 `publicSummary` ✓） |
| `VMU_OUTREACH_LANGUAGE` | 摘要语言**超出 `languageSet`**（实现于 `kernel/publication.js` ✓） | 传播（22） | ✅（须给**允许语言集** ✓） |
| `VMU_OUTREACH_EVIDENCE` | 主张**缺 `evidenceRef`**（`evidenceFidelity=strict` ✓） | 传播（22） | ✅（须给**缺失条数** ✓） |
| `VMU_OUTREACH_MEDIA_DENIED` | **非已声明发言人**发言（`mediaApprovalPolicy=spokesperson-only` ✓） | 传播（22） | ✅（须点名**发言人**与该政策 ✓） |
| `VMU_OUTREACH_ANONYMITY` | **匿名保护**被违反（`anonymityPreserve=true` ✓） | 传播（22） | ✅（须说明如何保持匿名 ✓） |
| `VMU_OUTREACH_EMBARGO` | **禁运期内发布**（`embargoRespect=true` ✓） | 传播（22） | ✅（须给**禁运终点**与当前时刻 ✓） |
| `VMU_OUTREACH_OPEN_REVIEW_OFF` | 请求开放评审但**开关为 false** ✓ | 传播（22） | ✅（须给**开关名** ✓） |
| `VMU_OUTREACH_IMPACT_FIELDS` | 影响日志**缺声明字段**（`impactLogFields` ✓） | 传播（22） | ✅（须给**第几条**与缺哪些字段 ✓） |
| `VMU_OUTREACH_IMPACT_NOT_FOR_EVALUATION` | 把**传播影响用于评价**（`impactUseInEvaluation=false` ✓） | 传播（22） | ✅（须说明它是**传播指标而非质量信号** ✓） |
| `VMU_OUTREACH_NOT_READY` | **尚无传播包**就发布/记影响（顺序错误 ✓） | 传播（22） | ✅（须给**先调 `outreachPack`** ✓） |
| `VMU_COLLAB_COUNTERPARTY_UNKNOWN` | 对手方**未登记**（实现于 `kernel/collab.js` ✓） | 协作（22） | ✅（须给**已知 id 示例** ✓） |
| `VMU_COLLAB_AGREEMENT_REQUIRED` | **无协议即交换**（`vmu.collab.agreementRequired=true` ✓） | 协作（22） | ✅（须给**先开协议的方法** ✓） |
| `VMU_COLLAB_AGREEMENT_EXPIRED` | **协议已到期**（`expiryWarnDays` 窗口已过 ✓） | 协作（22） | ✅（须给**到期时刻**与续约方式 ✓） |
| `VMU_COLLAB_TEMPLATE_UNKNOWN` | **模板未与对手方约定**（`dataSharingTemplate` ✓） | 协作（22） | ✅（须给**已声明模板清单** ✓） |
| `VMU_COLLAB_SETTLEMENT_PREMATURE` | **未到结算周期**即结算（`settlementCycleDays` ✓） | 协作（22） | ✅（须给**到期时刻与周期** ✓） |
| `VMU_COLLAB_RECONCILIATION_OFF` | **对账差额超出容差**（`reconciliationToleranceMinor` ✓） | 协作（22） | ✅（须给**差额与容差** ✓） |
| `VMU_FUNDING_NEGATIVE_NOT_ALLOWED` | **负额**而 `vmu.funds.allowNegative=false`（实现于 `kernel/funding.js` ✓） | 货币（22） | ✅（须给**金额与该键** ✓） |
| `VMU_FUNDING_AMOUNT_OVER_CEILING` | 金额**超出 `vmu.funds.maxAmountMinor`**（实现于 `kernel/funding.js` ✓） | 货币（22） | ✅（须给**金额与上限** ✓） |
| `VMU_FUNDING_ALLOCATION_WEIGHTS` | 分摊**权重非法或全零**（`allocate` ✓） | 货币（22） | ✅（须说明权重要求 ✓） |
| `VMU_FUNDING_ALLOCATION_MISMATCH` | 分摊**结果加不回总额**（余数政策有 bug ⇒ 一分未应用 ✓） | 货币（22） | ✅（须给**实际与应有总额** ✓） |
| `VMU_FUNDING_FX_SNAPSHOT_REQUIRED` | 换汇**没有带日期的快照**（`vmu.funds.fxSource` 离线优先 ✓） | 货币（22） | ✅（须给**快照目录**与来源名 ✓） |
| `VMU_FUNDING_FX_STALE` | 汇率快照**超过 `fxMaxAgeDays`**（实现于 `kernel/funding.js` ✓） | 货币（22） | ✅（须给**实际天数与上限** ✓） |
| `VMU_FUNDING_AUDIT_TUPLE` | 金额审计元组**缺声明字段**（`vmu.funds.auditTupleFields` 只可增不可删 ✓） | 货币（22） | ✅（须点名**缺哪些字段** ✓） |
| `VMU_AGREEMENT_KIND_UNKNOWN` | **协议种类未声明**（`vmu.agreements.kinds`；实现于 `kernel/collab.js` ✓） | 协议（22） | ✅（须给**允许种类** ✓） |
| `VMU_AGREEMENT_UNSIGNED` | **未签协议下的交换**（`vmu.agreements.unsignedPolicy=block`，即"未签不得共享" ✓） | 协议（22） | ✅（须给**先签署的方法**与该键 ✓） |
| `VMU_AGREEMENT_SIGNATURE_REF_REQUIRED` | 签署**缺引用**（`vmu.agreements.signatureRefRequired=true` ✓） | 协议（22） | ✅（须点明缺 `ref` ✓） |
| `VMU_AGREEMENT_SCOPE_NOT_COVERED` | 交换**越出协议范围**（`vmu.agreements.scopeEnforcement=block` ✓） | 协议（22） | ✅（须给**请求范围与已约范围** ✓） |
| `VMU_IDENTITY_PRINCIPAL_REQUIRED` | **`principalBinding=required` 而无主体**（实现于 `kernel/identity.js` ✓） | 身份（17） | ✅（须给**如何提供主体** ✓） |
| `VMU_IDENTITY_ISSUER_UNTRUSTED` | **issuer 不在可信列表**（`vmu.identity.trustedIssuers` ✓） | 身份（17） | ✅（须给**可信列表** ✓） |
| `VMU_IDENTITY_CLAIM_UNMAPPED` | claim **未映射到席位**（`vmu.identity.claimMap` ✓；本面 REPORT 而非猜 ✓） | 身份（17） | ✅（须给**已映射项** ✓） |
| `VMU_IDENTITY_MEMBERSHIP_CAP` | **归属超出上限**（`vmu.identity.maxMemberships` ✓） | 身份（17） | ✅（须给**现值与上限** ✓） |
| `VMU_IDENTITY_MULTI_MEMBERSHIP_OFF` | **多归属被关**（`vmu.identity.multiMembership=false` ✓） | 身份（17） | ✅（须给**现有归属** ✓） |
| `VMU_IDENTITY_PSEUDONYM_NOT_ALLOWED` | **不允许化名**（`vmu.identity.allowPseudonym=false` ✓） | 身份（17） | ✅（须给**该键** ✓） |
| `VMU_IDENTITY_PSEUDONYM_SCOPE` | **化名场景未声明**（`vmu.identity.pseudonymScopes` ✓） | 身份（17） | ✅（须给**已声明场景** ✓） |
| `VMU_HUMAN_VETO_SCOPE` | **否决范围超出**（`vmu.human.vetoScope` ✓） | 人类（17） | ✅（须给**允许范围** ✓） |
| `VMU_HUMAN_VETO_REASON_REQUIRED` | **否决缺理由**（`vmu.human.vetoNeedsReason=true` ✓；紧急可后补 ✓） | 人类（17） | ✅（须说明**紧急后补路径** ✓） |
| `VMU_HUMAN_OBSERVER_SCOPE` | **观察员范围未声明**（`vmu.human.observerScopes` ✓） | 人类（17） | ✅（须给**已声明范围** ✓） |
| `VMU_HUMAN_APPROVAL_TIMEOUT` | **审批超时且声明为 default-deny**（`vmu.human.onTimeout` ✓） | 人类（17） | ✅（须给**声明的超时行为** ✓） |
| `VMU_HUMAN_DASHBOARD_SCOPE` | **总览范围超出**（`vmu.human.dashboardScope` ✓） | 人类（17） | ✅（须给**允许范围** ✓） |
| `VMU_DISCIPLINE_BREAKER_OPEN` | **熔断打开或停职期内**（`vmu.discipline.breakerFailures`／`suspendMaxMs` ✓） | 纪律（17） | ✅（须给**失败数与阈值／停职终点** ✓） |
| `VMU_DISCIPLINE_SUSPEND_OVER_CAP` | **停职超上限**（`vmu.discipline.suspendMaxMs` ✓；实现为钳制并自曝 ✓） | 纪律（17） | ✅（须给**上限** ✓） |
| `VMU_DISCIPLINE_RESTORE_NEEDS_HUMAN` | **复职未经人类**（`vmu.discipline.restoreNeedsHuman=true` ✓） | 纪律（17） | ✅（须说明**须由人类决定** ✓） |
| `VMU_DISCIPLINE_POSTMORTEM_REQUIRED` | **复职缺复盘**（`vmu.discipline.postmortemRequired=true` ✓） | 纪律（17） | ✅（须点明缺复盘引用 ✓） |
| `VMU_CUSTODY_ENTRY_UNKNOWN` | **样本未登记**（实现于 `kernel/custody.js` ✓） | 样本（22） | ✅（须给**先登记的方法** ✓） |
| `VMU_CUSTODY_CHAIN_REQUIRED` | **转移未给持有人**（`vmu.custody.requireChain=true` ✓） | 样本（22） | ✅（须给**持有人参数** ✓） |
| `VMU_CUSTODY_CHAIN_GAP` | **保管链断裂**（`chainGapPolicy=block` ✓；warn 时记录并告警 ✓） | 样本（22） | ✅（须给**上一环时刻与本次时刻** ✓） |
| `VMU_CUSTODY_REVERSIBLE_MAPPING` | **存入可逆映射**（`mappingIrreversible=true` 内核强制 ✓） | 样本（22） | ✅（须说明**映射须留在本台账之外** ✓） |
| `VMU_CUSTODY_PSEUDONYM_STYLE` | **引用像明文标识**（`pseudonymStyle=pseudonym` ✓） | 样本（22） | ✅（须给**可用的假名形态** ✓） |
| `VMU_CUSTODY_ALREADY_DESTROYED` | **已灭失样本**再转移/再销毁 ✓ | 样本（22） | ✅（须给**灭失时刻** ✓） |
| `VMU_BUDGET_TASK_SHARE_EXCEEDED` | **单任务超出 `vmu.budget.perTaskShare`**（实现于 `kernel/budget.js` ✓） | 预算（08） | ✅（须给**已用/份额上限** ✓） |
| `VMU_AUDIT_SCOPE_NOT_DECLARED` | **导出范围未声明**（`vmu.audit.exportScope` ✓） | 审计（08） | ✅（须给**已声明范围** ✓） |
| `VMU_AUDIT_RECOUNT_NOT_ALLOWED` | **复算角色未声明**（`vmu.audit.recountRoles` ✓） | 审计（08） | ✅（须给**已声明角色** ✓） |
| `VMU_EXPLAIN_REASON_REQUIRED` | **社会动作缺理由**（`vmu.explain.reasonRequired=true`；实现于 `kernel/explain.js` ✓） | 解释（17） | ✅（须给**如何补理由** ✓） |
| `VMU_EXPLAIN_REASON_TOO_LONG` | **理由超 `reasonMaxChars`**（实现于 `kernel/explain.js` ✓；**具名拒而非截断** ✓） | 解释（17） | ✅（须给**实际长度与上限** ✓） |
| `VMU_EXPLAIN_CORRELATION_UNKNOWN` | **指定关联维度缺失**（`vmu.explain.correlateBy` ✓） | 解释（17） | ✅（须给**该维度名** ✓） |
| `VMU_CONTROL_PAUSE_SCOPE` | **暂停范围未声明**（`vmu.control.pauseScope`；归档默认不在内 ✓） | 控制（08） | ✅（须给**已声明范围** ✓） |
| `VMU_CONTROL_PAUSE_ROLE` | **角色无权暂停**（`vmu.control.canPauseRoles` ✓） | 控制（08） | ✅（须给**已声明角色** ✓） |
| `VMU_CONTROL_DEGRADE_STEP` | **降级档位未声明**（`vmu.control.degradeSteps` ✓） | 控制（08） | ✅（须给**已声明档位** ✓） |
| `VMU_CONTROL_PAUSED` | 表面**处于暂停**（`vmu.control.pauseScope` 覆盖它；实现于 `kernel/control.js` ✓） | 控制（08） | ✅（须给**谁暂停的与何时** ✓） |
| `VMU_CITATIONS_STYLE_UNKNOWN` | **引文样式未声明**（`vmu.citations.style` ✓） | 引文（07） | ✅（须给**已声明样式** ✓） |
| `VMU_CITATIONS_FIELD_MISSING` | **条目缺必填字段**（`vmu.citations.requiredFields` ✓） | 引文（07） | ✅（须点名**缺哪些** ✓） |
| `VMU_CITATIONS_IDENTIFIER_MISSING` | **条目无标识符**（`vmu.citations.allowFreeText=false` ✓） | 引文（07） | ✅（须给**优先级清单** ✓） |
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

> ★★★ **调度的边界（轮 4 / task-25 F16 ＋ 轮 5 补 pack 侧声明点，具名登记 ✓）**：**`vmu.scheduler` 是"框架提供、pack／中间件使用"的原语，内核【不自动启用】心跳** ✓ —— **全仓没有 `arm()/tick()/disarm()` 的生产调用者** ✓（`tools/control.js` 无 scheduler 动作 ⇒ 该路径目前只由测试驱动 ✓）。★ **为什么不自动启用** ✗✓：**自启会让"没有任何声明"的部署也跑起定时器** ⇒ **违反零机制** ✗；**"何时"按设计属宿主**（时钟是缝 ✓，见 `docs/26 §3.3`）。★ **pack 侧声明点（轮 5 明确）**：**pack 不需要为心跳声明任何新键** —— 它要定时推进就**声明自己的 `vmu.schedule.*` 触发器**（`triggerVia` 决定触发线）并**由 pack／中间件自己 `arm()` ＋ 按自己的时钟 `tick()`** ✓；内核只提供原语与 `status()` 自曝 ✓。★★ **改判条件**：若真机验收要求"声明即自动心跳"，则按 `vmu.schedule.*` 在**入口装配期** `arm()`（**一行，且必须自曝 `status().scheduler.armed`** ✓）。
> ★★★ **差异（不是缺陷）：fail-closed vs v5r 的容错跳过（轮 5 / F13，具名登记 ✓）**：**本框架在"声明缺失/接缝缺失/校验失败"处一律 fail-closed（具名拒）** ✓，而 **v5r 的既有实现多处是"容错跳过 + 继续"** ✗（例如缺接缝时静默走默认分支）。★ **为什么本框架选 fail-closed** ✓✓：本仓的 R1／"零机制"要求**任何没被声明的东西都不许悄悄生效**；"跳过"会让**未声明的策略看起来生效了**（正是 D-01 那类"静默不可达"的镜像）⇒ 宁可**具名拒 + 出路提示**，也不静默继续 ✓。★★ **可观察差异**（真机对比时会看到）：同一条提示词在 v5r 下"跳过并继续"的地方，在本框架下会得到**一个带 code 的拒绝**（回执带 `enforced[]`／`enforcedScope`，且**拒因回到制造它的人**的下一轮提示里 ✓）。★★ **改判条件**：若某条容错跳过被证明是**正确语义**（而非历史偶然），就把它**显式声明为一个键**（例如 `vmu.<face>.onMissing` ∈ `{refuse,skip}`），默认仍是 `refuse` ✓ —— **不许把"跳过"做成隐式默认** ✗。
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
| `VMU_PACK_INSTITUTE_MIN_FROZEN_ROUND` | 整合包**轮次已冻结**后仍要改（实现于 `packs/institute-min/index.js` ✓） | 整合包 | ✅（**已实现** ✓；`packs/institute-min/index.js:34` ✓） |
| `VMU_PACK_INSTITUTE_MIN_NOT_LOCKED` | 整合包**未锁定**即需锁定态才能做的操作（实现于 `packs/institute-min/index.js` ✓） | 整合包 | ✅（**已实现** ✓；`packs/institute-min/index.js:33`／`:68` ✓） |
| `VMU_PACK_V3_CORE_MANUAL_GATE` | v3 核心**人工闸**未通过（实现于 `packs/v3-core/index.js` ✓） | 整合包 | ✅（**已实现** ✓；`packs/v3-core/index.js:36`／`:109` ✓） |
| `VMU_PACK_V3_CORE_VERIFIER_QUORUM` | v3 核心**验证者法定人数**不足（实现于 `packs/v3-core/index.js` ✓） | 整合包 | ✅（**已实现** ✓；`packs/v3-core/index.js:35`／`:86` ✓） |
| `VMU_PACK_V3_DEFECT_TARGET_UNRESOLVED` | v3 缺陷记录的**目标无法解析**（实现于 `kernel/library.js` 的缺陷路径 ✓） | v3 复刻包 | ✅（**已实现** ✓；`kernel/library.js:565` ✓） |
| `VMU_PACK_V3_DUPLICATE_DISPATCH` | v3 **重复派发**同一动作（实现于 `packs/v3/middleware/planner.js` ✓） | v3 复刻包 | ✅（**已实现** ✓；`packs/v3/middleware/planner.js:501`／`packs/v3/index.js:77` ✓） |
| `VMU_PACK_V3_LEAN_REQUIRED` | v3 该动作**要求 Lean 形式化**（实现于 `packs/v3/middleware/lean-gate.js` ✓） | v3 复刻包 | ✅（**已实现** ✓；`packs/v3/middleware/lean-gate.js:26`／`packs/v3/index.js:77` ✓） |
| `VMU_PACK_V3_TOOL_NOT_PERMITTED` | v3 **工具不在允许集**（实现于 `packs/v3/middleware/toolfilter.js` ✓） | v3 复刻包 | ✅（**已实现** ✓；`packs/v3/middleware/toolfilter.js:10` ✓） |
| `VMU_PACK_V3_TOOL_UNRESOLVED` | v3 **工具名无法解析**（实现于 `packs/v3/middleware/toolfilter.js` ✓） | v3 复刻包 | ✅（**已实现** ✓；`packs/v3/middleware/toolfilter.js:13` ✓） |
| `VMU_PACK_V3_PROPOSITION_NOT_EXTRACTABLE` | v3 **命题无法从产出中抽取**（实现于 `packs/v3/middleware/dataplane.js` ✓） | v3 复刻包 | ✅（**已实现** ✓；`packs/v3/middleware/dataplane.js:721` ✓） |
| `VMU_PACK_V3_PAPER_INCOMPLETE` | v3 **论文不完整**（实现于 `packs/v3/middleware/paper-close.js` ✓） | v3 复刻包 | ✅（**已实现** ✓；`packs/v3/middleware/paper-close.js:8` ✓） |
| `VMU_PACK_V3_DEFECT_WITHDRAWN` | v3 缺陷**已撤回**（实现于 `packs/v3/middleware/dataplane.js` ✓） | v3 复刻包 | ✅（**已实现** ✓；`packs/v3/middleware/dataplane.js:606` ✓） |
| `VMU_PACK_V3_DEFECT_NOTE_REQUIRED` | v3 缺陷**缺说明**（实现于 `packs/v3/middleware/defects.js` ✓） | v3 复刻包 | ✅（**已实现** ✓；`packs/v3/middleware/defects.js:29` ✓） |
| `VMU_PACK_V3_DEFECT_UNENFORCED` | v3 缺陷**未被强制执行**（实现于 `packs/v3/middleware/defects.js` ✓） | v3 复刻包 | ✅（**已实现** ✓；`packs/v3/middleware/defects.js:30` ✓） |
| `VMU_PACK_V3_DEFECT_MODE_UNKNOWN` | v3 缺陷**模式未知**（实现于 `packs/v3/middleware/defects.js` ✓） | v3 复刻包 | ✅（**已实现** ✓；`packs/v3/middleware/defects.js:32` ✓） |
| `VMU_PACK_V5R_CORE_NOT_SETTLED` | v5r 核心**未结项**（实现于 `packs/v5r/prompts/v5r-core.js` ✓） | 整合包 | ✅（**已实现** ✓；`packs/v5r/prompts/v5r-core.js:33`／`:101` ✓） |
| `VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS` | v5r 核心**禁用临时脚本**（实现于 `packs/v5r/prompts/v5r-core.js` ✓） | 整合包 | ✅（**已实现** ✓；`packs/v5r/prompts/v5r-core.js:34`／`:72` ✓） |
| `VMU_PACK_V5R_CORE_PAPER_STATE` | v5r **论文状态机**拒绝该动作（非 writing 记 part／非 reviewing 记 review／非 awaiting-editor 记 final／轮次上限仍要修订）⇒ 具名；实现于 `packs/v5r/paper.js` | 论文·整合包 | ✅（**已实现** ✓；`packs/v5r/paper.js` ✓） |
| `VMU_PACK_V5R_CORE_PAPER_FINGERPRINT_MISMATCH` | 论文正文**指纹与记录里存的不一致**（正文被背后改动）⇒ **具名阻塞、绝不静默用旧正文**；实现于 `packs/v5r/paper.js` | 论文·整合包 | ✅（**已实现** ✓；`packs/v5r/paper.js` ✓） |
| `VMU_PACK_V5R_CORE_PAPER_PDF_NEEDS_KERNEL` | 四件产物缺 `pdf` ⇒ 具名，并**点名需内核能力：LaTeX 编译执行器** | 论文·整合包 | ✅（**已实现** ✓；`packs/v5r/paper.js` ✓） |
| `VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING` | 本装配**没有 LaTeX 面**（宿主未注入 spawn 接缝）⇒ 具名；`compilePdf` 抛此码 | 论文·整合包 | ✅（**已实现** ✓；`packs/v5r/paper.js` ✓） |
| `VMU_PACK_V5R_CORE_PAPER_PDF_FAILED` | 内核 LaTeX 面**拒绝编译**（无引擎／超时／编译错）⇒ 具名，错误上带面的 code/tried/stderrTail | 论文·整合包 | ✅（**已实现** ✓；`packs/v5r/paper.js` ✓） |
| `VMU_PACK_V5R_CORPUS_NOT_RUNTIME` | **捕获快照不得进运行时装配**（`v5rTurnSections` 等）⇒ 具名拒；实现于 `packs/v5r/prompts/v5r-core.js` 的 `assertRuntimeSafeSections` | 整合包·提示词 | ✅（**已实现** ✓；`packs/v5r/prompts/v5r-core.js` ✓） |
| `VMU_PACK_V5R_P1_NEEDS_DEBATE` | v5r **p=1 缺定论来源**：把命题卡的布尔概率改成 1，却没有「辩论全体一致为 1」／`verified` 轨定论行／「Lean 通过＋描述符合性裁定」三者之一（实现于 `packs/v5r/verification-gates.js` 的 `p1Intent`）；★ **尚无生产调用方**（接线在 B1 第 3 步） | 记录·整合包 | ✅（返回 `{code,message,hint}`，hint 列出三种合法来源；★ 归属字段由接线层填） |
| `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF` | v5r **辩论对象无已写完的证明**：`type=debate` 的会议 subject 解析到的命题卡没有「正式证明/证伪已写完」的承载（`proofRef` 空／`proofState≠complete`／无 `verified` 行／Lean 未通过），或文件引用不可读、为空（实现于 `packs/v5r/verification-gates.js` 的 `debateSubjectGate`）；★ **尚无生产调用方** | 会议·整合包 | ✅（拒绝文案逐一说明**三种 subject 形态**如何才算满足：卡 id／文件引用／一句话命题） |
| `VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED` | v5r **忠实性收口缺少可通过的 Lean 依据**：`vibe_v5_fidelity_conclude` 的 `fidelity:'conform'` 要求带一个**已通过**的 Lean 作业；缺 `lean_job`、作业 id 面不认识、或作业未通过（消息点名实收 `state`，并区分「面不认识该作业」与「作业没通过」）三处共用一个码（实现于 `packs/v5r/tools.js` 的 `toolFidelityConclude`）；★ **属"证据层"而非"声明层"**：模型自述"我核对了"不算依据 | 会议·整合包 | ✅（`tests/vmu-fidelity-conclude.test.mjs` 8 节；`tests/vmu-v5r-tools.test.mjs` 46 工具计数） |
| `VMU_PACK_V5R_DEBATE_SUBJECT_UNPROVEN` | v5r **辩论对象「声明已写完」但无机器证据**：卡上写了 `proofRef`＋`proofState=complete`，却既无 Lean 通过也无 `verified` 轨定论行（实现于 `packs/v5r/verification-gates.js` 的 `debateSubjectGate` 证据层分支）；★ **两种缺失两个码**：本码＝「自述写了≠真的写完」，`_NO_PROOF`＝「连自述都没有」；★ **尚无生产调用方**（接线在 B1 第 3 步） | 会议·整合包 | ✅（拒绝文案点名 `proofRef`/`proofState` 的实收值并给两条合法路径：跑 Lean 且 passed／走完辩论在 `verified` 轨留下定论行） |
| `VMU_PACK_V5R_VERIFIED_SINGLE_WRITER` | v5r **定论多写了**：`verified` 轨只能由 `promoteVerified` 写，其它入口（含未声明写入器的裸写）⇒ 具名拒（实现于 `packs/v5r/verification-gates.js` 的 `singleWriter`）；★ **尚无生产调用方** | 记录·整合包 | ✅（须点名**违规入口**与唯一写入器） |
| `VMU_PACK_V5R_FIDELITY_ASK_REQUIRED` | v5r **D13 符合性追问缺失**：Lean 已通过但该卡概率仍非 1 时，必须先裁定「Lean 代码中的命题/定义是否与所需一致」，未裁定且证明未被撤回 ⇒ 具名要求（实现于 `packs/v5r/verification-gates.js` 的 `fidelityAsked`；本码是 `kernel/fidelity.js` 的 pack 侧消费者）；★ **尚无生产调用方** | 辩论·整合包 | ✅（须给出**问题原文**与两个合法答案 `conform`/`defect`） |
| `VMU_MONEY_NEGATIVE_FORBIDDEN` | 投标价格**为负**（**价格非负；零价合法** ✓） | 治理/竞标 | ✅（**已实现** ✓；`kernel/bidding.js:295` ✓） |
| **D7 · `VMU_TOOL_NOT_IN_FACE`** | 成员这一回合**不许调用**该工具：它不在其席位的 face 里（`allow` 名单外／`deny` 名单内／本轮 `all` 收窄）⇒ 具名拒，**回执同时点名工具与席位**并带回那张面（谓词 `kernel/memberface.js` 的 `faceGate`；调用点 `kernel/index.js` 的 `memberFaceGate`） | 成员工具调用前（D7：可用命令按席位不同） | ✅（须点名**工具名 + 席位 + 面来源**；失败关闭，绝不按全集放行） |
| **D7 · `VMU_TOOL_FACE_UNRESOLVED`** | **解析不到**该成员/该席位的 face（没有面列表／空列表／未知席位／面形状不合法）⇒ 具名拒；成员不在册时 `memberFaceGate` 先抛 `VMU_NO_SUCH_OBJECT`（同一"失败关闭"口径） | 成员工具调用前 | ✅（须说明**缺哪一块**：面／席位／形状；不许猜一份默认全集） |

> **轮 55 补登记（`VMU_MONEY_NEGATIVE_FORBIDDEN`）** ✗✓：本条**不是新增**，而是**删掉一处重复登记后暴露出来的幽灵登记** ✓✓ —— 该码**一直在 `kernel/bidding.js:295` 真实抛出** ✓，此前只因**卷 22 复制了一份 90 码清单**、被生成器**顺带当作已登记** ✗ ⇒ 卷 22 的复制表删除后，`audit-vmu-docs` 立刻点名它 ✗✓ ⇒ **门禁之前量到的是"复制品"，不是"登记"本身** ✓✓（**这是本族缺陷的又一形态**）。

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
| `VMU_ALIAS_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 13 | ⛔ |
| `VMU_ALLOCATION_REMAINDER` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_AMOUNT_NOT_INTEGER` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_ANESTHESIA_UNDECLARED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_ANIMAL_LEDGER_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_APPROVAL_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_ARBITER_IS_PARTY` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_ARCHIVE_RECEIPT_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_ARCHIVE_TARGET_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_ASSIGNMENT_ATTEMPTS_EXHAUSTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_ASSIGNMENT_DUE_PASSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_ASSIGNMENT_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_AUCTION_CLOSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_AUCTION_INVALID_BID` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_AUCTION_LIMIT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_AVAILABILITY_VAGUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_BADGE_MISMATCH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_BIOSPECIMEN_SAMPLE_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
| `VMU_BLIND_MAPPING_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_BLIND_UNBIND_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
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
| `VMU_CHARTER_FROZEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_CHARTER_NOT_AUTHORIZED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_CHARTER_QUORUM` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_CITE_ID_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_COI_VIOLATION` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_COLLAB_AGREEMENT_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COLLAB_AUTHORSHIP_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COLLAB_DSA_EXPIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COLLAB_SETTLEMENT_MISMATCH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COLLUSION_SUSPECTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_COMPAT_MATRIX_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 11 | ⛔ |
| `VMU_COMPLIANCE_APPROVAL_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COMPLIANCE_CALENDAR_MISSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COMPLIANCE_COI_UNDISCLOSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COMPLIANCE_EVIDENCE_INCOMPLETE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COMPLIANCE_EXPORT_BLOCKED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_COMPLIANCE_EXPORT_CONTROL_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
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
| `VMU_COURSE_READINGS_SHORT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
| `VMU_COURSE_RUBRIC_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_COURSE_UNIT_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_CROSSBORDER_CURRENCY_MISMATCH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_CROSSBORDER_GATE_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_CROSS_BORDER_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_DATA_CLASS_MISMATCH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_DEDUPE_REFCOUNT_UNDERFLOW` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_DELEGATION_BUDGET` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DELEGATION_DEPTH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DELEGATION_ESCALATION` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_DELEGATION_EXPIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_DELEGATION_REASON_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DEPRECATION_SILENT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 13 | ⛔ |
| `VMU_DISCIPLINE_CIRCUIT_OPEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DISCIPLINE_POSTMORTEM_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DISCIPLINE_QUOTA` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DISCIPLINE_SUSPENDED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_DOMAIN_PACK_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_DUTY_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_ENTITY_ACCOUNT_UNBOUND` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_ENTITY_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_ETHICS_APPROVAL_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_EXPLAIN_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_EXPORT_CONTROL_UNSCREENED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
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
| `VMU_GATE_UNSATISFIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_GC_REFUSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
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
| `VMU_HR_AUTODECISION_FORBIDDEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 11 | ⛔ |
| `VMU_HR_CYCLE_CLOSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_HR_OFFBOARDING_INCOMPLETE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_HR_PERF_EVIDENCE_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_HR_TENURE_DECISION_DUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_HR_TENURE_QUORUM_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_HUMANE_ENDPOINT_REPORT_OVERDUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_HUMAN_APPROVAL_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_HUMAN_TIMEOUT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_IACUC_APPROVAL_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_IACUC_EXPIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_IDENTITY_ENDS_WITH_OPEN_WORK` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_IDENTITY_MULTI_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_IDENTITY_PSEUDONYM_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_IDENTITY_TRANSFER_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_IDENTITY_UNBOUND` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_IMPORT_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_INCIDENT_FROZEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_INSTRUMENT_ALREADY_RESERVED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
| `VMU_INSTRUMENT_CALIBRATION_OVERDUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
| `VMU_INSTRUMENT_HOLD_EXCEEDED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
| `VMU_INSTRUMENT_NOT_QUALIFIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
| `VMU_INSTRUMENT_OVERBOOKED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
| `VMU_INSTRUMENT_RETIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
| `VMU_INSTRUMENT_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
| `VMU_IO_FAILED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
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
| `VMU_LICENSE_CODE_UNDECLARED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_LICENSE_DEFAULT_UNDECLARED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_LICENSE_INCOMPATIBLE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_LIFECYCLE_PREREG_DUPLICATE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
| `VMU_LIFECYCLE_PREREG_INCOMPLETE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
| `VMU_LIFECYCLE_PREREG_LOCKED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 28 | ⛔ |
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
| `VMU_MIDDLEWARE_REENTRANT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 05 | ⛔ |
| `VMU_MIGRATE_CONFIRM_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 13 | ⛔ |
| `VMU_MIGRATE_UNCOVERED_PRESENT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 13 | ⛔ |
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
| `VMU_OUTREACH_EVIDENCE_MISMATCH` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
| `VMU_OUTREACH_EXAGGERATED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 22 | ⛔ |
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
| `VMU_REASON_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_RECALL_QUORUM_NOT_MET` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_RECRUIT_CLOSED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_RECRUIT_EVIDENCE_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_REGISTRATION_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_RESOURCE_EXCEEDED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_RESUME_FROM` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 15 | ⛔ |
| `VMU_RESUME_SEGMENT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 15 | ⛔ |
| `VMU_RETENTION_CONFLICT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_REVIEWERS_CAP_UNDECLARED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_REVIEWER_OVERLOADED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_REVIEW_DUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_REVIEW_EVIDENCE_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_REVIEW_MODE_UNDECLARED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 16 | ⛔ |
| `VMU_REVIEW_NOT_ELIGIBLE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_REVIEW_ROUNDS_EXHAUSTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_REVIEW_RUBRIC_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_REVIEW_SELF_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_ROLE_TERM_EXPIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_SAE_REPORT_OVERDUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_SCHEDULE_OVERDUE_REPORT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
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
| `VMU_SUBMISSION_INCOMPLETE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_SUBMISSION_WITHDRAWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_SUPPLYCHAIN_UNLOCKED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_TASK_STALE_REVISION` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 08 | ⛔ |
| `VMU_TAX_FIELD_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_THREE_R_INCOMPLETE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_TOPOLOGY_UNSUPPORTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_TRAINING_EXPIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_TRASH_EXPIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_TRUST_APPEAL_WINDOW` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_TRUST_EVIDENCE_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_TRUST_SELF_SCORE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_TRUST_USE_FORBIDDEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_UNBLINDING_UNLOGGED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_VERSION_CHAIN_BROKEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_WATCH_CHANNEL_UNSUPPORTED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WATCH_CROSS_INSTITUTION_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WATCH_DUPLICATE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WATCH_EVENT_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WATCH_LIMIT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WATCH_SUBJECT_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WATCH_VISIBILITY_DENIED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_WRITE_PARTIAL` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |

### 8.1 实现状态一览（**生成 ✓**；登记 ≠ 已实现 ✗）

> 手写表登记 **443** 个码，**逐行**给出状态 ✓：其中 **404** 个**已实现 ✓**（能在运行时代码里找到该码字符串 ✓），
> **39** 个**提案 ⛔**（暂时只存在于表里）✓ —— 这不是错误 ✓，但**不得**把"已登记"当作"会被抛出" ✗；
> 本节由 `scripts/generate-planned-codes.mjs` 重算 ✓：删改任一码、或让某个"提案"码出现在运行时代码里，都会让 `--check` 变红 ✓，
> 并由 `tests/audit-code-status.test.mjs` 逐行核对报告与代码 ✓（含故意造错自证 ✓）。

| 码 | 状态 | 在哪实现（文件） | 备注 |
|---|---|---|---|
| `VMU_ACTIVITY_ABORTED` | **已实现 ✓** | `vibe-math-vmu/kernel/activity.js` | 代码里有该码字符串 ✓ |
| `VMU_ACTIVITY_BOUNDS_INVALID` | **已实现 ✓** | `vibe-math-vmu/kernel/activity.js` | 代码里有该码字符串 ✓ |
| `VMU_ACTIVITY_DISPOSED` | **已实现 ✓** | `vibe-math-vmu/kernel/activity.js` | 代码里有该码字符串 ✓ |
| `VMU_ACTIVITY_INVALID_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/kernel/activity.js` | 代码里有该码字符串 ✓ |
| `VMU_ACTIVITY_NO_TIMER` | **已实现 ✓** | `vibe-math-vmu/kernel/activity.js` | 代码里有该码字符串 ✓ |
| `VMU_ACTIVITY_PEER_SEAM_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/activity.js` | 代码里有该码字符串 ✓ |
| `VMU_ACTIVITY_SIGNAL_INVALID` | **已实现 ✓** | `vibe-math-vmu/kernel/activity.js` | 代码里有该码字符串 ✓ |
| `VMU_ACTIVITY_TIMER_INVALID` | **已实现 ✓** | `vibe-math-vmu/kernel/activity.js` | 代码里有该码字符串 ✓ |
| `VMU_ACTIVITY_WAITER_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/activity.js` | 代码里有该码字符串 ✓ |
| `VMU_ACTIVITY_WAKE_HOOK_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/activity.js` | 代码里有该码字符串 ✓ |
| `VMU_ACTIVITY_WAKE_UNWIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/activity.js` | 代码里有该码字符串 ✓ |
| `VMU_AGENDA_ITEM_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/governance.js` | 代码里有该码字符串 ✓ |
| `VMU_AGENDA_OWNER_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/governance.js` | 代码里有该码字符串 ✓ |
| `VMU_AGENDA_SPLIT_DEPTH` | **已实现 ✓** | `vibe-math-vmu/kernel/governance.js` | 代码里有该码字符串 ✓ |
| `VMU_AGREEMENT_KIND_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/collab.js` | 代码里有该码字符串 ✓ |
| `VMU_AGREEMENT_SCOPE_NOT_COVERED` | **已实现 ✓** | `vibe-math-vmu/kernel/collab.js` | 代码里有该码字符串 ✓ |
| `VMU_AGREEMENT_SIGNATURE_REF_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/collab.js` | 代码里有该码字符串 ✓ |
| `VMU_AGREEMENT_UNSIGNED` | **已实现 ✓** | `vibe-math-vmu/kernel/collab.js` | 代码里有该码字符串 ✓ |
| `VMU_ALERT_SILENCED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js` | 代码里有该码字符串 ✓ |
| `VMU_ALERT_SUPPRESSED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js` | 代码里有该码字符串 ✓ |
| `VMU_ALIAS_AMBIGUOUS` | **已实现 ✓** | `vibe-math-vmu/settings/schema.js` | 代码里有该码字符串 ✓ |
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
| `VMU_AUDIT_RECOUNT_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/audit.js` | 代码里有该码字符串 ✓ |
| `VMU_AUDIT_SCOPE_NOT_DECLARED` | **已实现 ✓** | `vibe-math-vmu/kernel/audit.js` | 代码里有该码字符串 ✓ |
| `VMU_AUDIT_WRITE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/audit.js`、`vibe-math-vmu/kernel/paper.js` | 代码里有该码字符串 ✓ |
| `VMU_AWARD_RATIONALE_REQUIRED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_BALLOT_ABSTAIN_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js` | 代码里有该码字符串 ✓ |
| `VMU_BALLOT_CHOICE_COUNT` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js` | 代码里有该码字符串 ✓ |
| `VMU_BALLOT_FROZEN` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_BALLOT_METHOD_UNSUPPORTED` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js` | 代码里有该码字符串 ✓ |
| `VMU_BALLOT_MIN_VOTES_NOT_MET` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js`、`vibe-math-vmu/packs/v3/middleware/verify.js`、`vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_BALLOT_ROUNDS_EXHAUSTED` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js` | 代码里有该码字符串 ✓ |
| `VMU_BALLOT_RULE_INVALID` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js` | 代码里有该码字符串 ✓ |
| `VMU_BALLOT_RULE_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js` | 代码里有该码字符串 ✓ |
| `VMU_BALLOT_SECRECY_LOCKED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_BALLOT_TIE_UNRESOLVED` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js` | 代码里有该码字符串 ✓ |
| `VMU_BODY_TRUNCATED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js` | 代码里有该码字符串 ✓ |
| `VMU_BUDGET_RESERVE_EXHAUSTED` | **已实现 ✓** | `vibe-math-vmu/kernel/budget.js` | 代码里有该码字符串 ✓ |
| `VMU_BUDGET_SCOPE_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/budget.js` | 代码里有该码字符串 ✓ |
| `VMU_BUDGET_TASK_SHARE_EXCEEDED` | **已实现 ✓** | `vibe-math-vmu/kernel/budget.js` | 代码里有该码字符串 ✓ |
| `VMU_BUS_EMIT_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/ballotbox.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/board.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/governance.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/meetingverdict.js`、`vibe-math-vmu/kernel/metrics.js`、`vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/repropack.js`、`vibe-math-vmu/kernel/resource.js`、`vibe-math-vmu/kernel/skills.js`、`vibe-math-vmu/kernel/stateversion.js`、`vibe-math-vmu/kernel/storepolicy.js`、`vibe-math-vmu/kernel/topology.js`、`vibe-math-vmu/kernel/trust.js` | 代码里有该码字符串 ✓ |
| `VMU_BUS_NAME_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/ballotbox.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/governance.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/metrics.js`、`vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/repropack.js`、`vibe-math-vmu/kernel/resource.js`、`vibe-math-vmu/kernel/stateversion.js`、`vibe-math-vmu/kernel/storepolicy.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_ANCHOR_DANGLING` | **已实现 ✓** | `vibe-math-vmu/kernel/chat.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_CAP_REACHED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_CHAT_FROZEN` | **已实现 ✓** | `vibe-math-vmu/kernel/chat.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_MUTED` | **已实现 ✓** | `vibe-math-vmu/kernel/chat.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_NOT_ADMIN` | **已实现 ✓** | `vibe-math-vmu/kernel/chat.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_QUOTA_EXCEEDED` | **已实现 ✓** | `vibe-math-vmu/kernel/chat.js` | 代码里有该码字符串 ✓ |
| `VMU_CITATIONS_FIELD_MISSING` | **已实现 ✓** | `vibe-math-vmu/kernel/citations.js` | 代码里有该码字符串 ✓ |
| `VMU_CITATIONS_IDENTIFIER_MISSING` | **已实现 ✓** | `vibe-math-vmu/kernel/citations.js` | 代码里有该码字符串 ✓ |
| `VMU_CITATIONS_STYLE_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/citations.js` | 代码里有该码字符串 ✓ |
| `VMU_CLOCK_BACKWARD` | **已实现 ✓** | `vibe-math-vmu/kernel/clockguard.js` | 代码里有该码字符串 ✓ |
| `VMU_CLOCK_FORWARD_JUMP` | **已实现 ✓** | `vibe-math-vmu/kernel/clockguard.js` | 代码里有该码字符串 ✓ |
| `VMU_CLOCK_UNGUARDED` | **已实现 ✓** | `vibe-math-vmu/kernel/clockguard.js` | 代码里有该码字符串 ✓ |
| `VMU_COLLAB_AGREEMENT_EXPIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/collab.js` | 代码里有该码字符串 ✓ |
| `VMU_COLLAB_AGREEMENT_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/collab.js` | 代码里有该码字符串 ✓ |
| `VMU_COLLAB_COUNTERPARTY_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/collab.js` | 代码里有该码字符串 ✓ |
| `VMU_COLLAB_RECONCILIATION_OFF` | **已实现 ✓** | `vibe-math-vmu/kernel/collab.js` | 代码里有该码字符串 ✓ |
| `VMU_COLLAB_SETTLEMENT_PREMATURE` | **已实现 ✓** | `vibe-math-vmu/kernel/collab.js` | 代码里有该码字符串 ✓ |
| `VMU_COLLAB_TEMPLATE_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/collab.js` | 代码里有该码字符串 ✓ |
| `VMU_COMMIT_STORE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_COMPAT_UNKNOWN_COMBO` | **已实现 ✓** | `vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/stateversion.js`、`vibe-math-vmu/kernel/storepolicy.js` | 代码里有该码字符串 ✓ |
| `VMU_CONFLICT` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/ballotbox.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/governance.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/library.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/minutes.js`、`vibe-math-vmu/kernel/resource.js`、`vibe-math-vmu/kernel/storepolicy.js`、`vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_CONTROL_DEGRADE_STEP` | **已实现 ✓** | `vibe-math-vmu/kernel/control.js` | 代码里有该码字符串 ✓ |
| `VMU_CONTROL_NO_TIMER` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/scheduler.js`、`vibe-math-vmu/packs/v3/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_CONTROL_PARAM_ROLE` | **已实现 ✓** | `vibe-math-vmu/kernel/control.js` | 代码里有该码字符串 ✓ |
| `VMU_CONTROL_PARAM_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/control.js` | 代码里有该码字符串 ✓ |
| `VMU_CONTROL_PARAM_UNDECLARED` | **已实现 ✓** | `vibe-math-vmu/kernel/control.js` | 代码里有该码字符串 ✓ |
| `VMU_CONTROL_PAUSED` | **已实现 ✓** | `vibe-math-vmu/kernel/control.js` | 代码里有该码字符串 ✓ |
| `VMU_CONTROL_PAUSE_ROLE` | **已实现 ✓** | `vibe-math-vmu/kernel/control.js` | 代码里有该码字符串 ✓ |
| `VMU_CONTROL_PAUSE_SCOPE` | **已实现 ✓** | `vibe-math-vmu/kernel/control.js` | 代码里有该码字符串 ✓ |
| `VMU_CONTROL_SCOPE_UNKNOWN` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_CRYPTO_KEY_EXPIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_CRYPTO_KEY_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js`、`vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_CRYPTO_NO_KEY` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js`、`vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_CRYPTO_PAYLOAD_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_CRYPTO_SIGNATURE_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_CRYPTO_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/auditchain.js`、`vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_CRYPTO_VERIFY_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/crypto.js` | 代码里有该码字符串 ✓ |
| `VMU_CUSTODY_ALREADY_DESTROYED` | **已实现 ✓** | `vibe-math-vmu/kernel/custody.js` | 代码里有该码字符串 ✓ |
| `VMU_CUSTODY_CHAIN_GAP` | **已实现 ✓** | `vibe-math-vmu/kernel/custody.js` | 代码里有该码字符串 ✓ |
| `VMU_CUSTODY_CHAIN_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/custody.js` | 代码里有该码字符串 ✓ |
| `VMU_CUSTODY_ENTRY_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/custody.js` | 代码里有该码字符串 ✓ |
| `VMU_CUSTODY_PSEUDONYM_STYLE` | **已实现 ✓** | `vibe-math-vmu/kernel/custody.js` | 代码里有该码字符串 ✓ |
| `VMU_CUSTODY_REVERSIBLE_MAPPING` | **已实现 ✓** | `vibe-math-vmu/kernel/custody.js` | 代码里有该码字符串 ✓ |
| `VMU_DEGRADED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_DISCIPLINE_BREAKER_OPEN` | **已实现 ✓** | `vibe-math-vmu/kernel/discipline.js` | 代码里有该码字符串 ✓ |
| `VMU_DISCIPLINE_POSTMORTEM_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/discipline.js` | 代码里有该码字符串 ✓ |
| `VMU_DISCIPLINE_RESTORE_NEEDS_HUMAN` | **已实现 ✓** | `vibe-math-vmu/kernel/discipline.js` | 代码里有该码字符串 ✓ |
| `VMU_DISCIPLINE_SUSPEND_OVER_CAP` | **已实现 ✓** | `vibe-math-vmu/kernel/discipline.js` | 代码里有该码字符串 ✓ |
| `VMU_ENGINE_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/host-deliver.js`、`vibe-math-vmu/host-hooks.js`、`vibe-math-vmu/host-math.js`、`vibe-math-vmu/host-spawn.js`、`vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/env.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/loader.js`、`vibe-math-vmu/kernel/mailbox.js`、`vibe-math-vmu/kernel/math.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetingmarker.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/minutes.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/kernel/paper.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/recruit.js`、`vibe-math-vmu/kernel/resource.js`、`vibe-math-vmu/kernel/script-bridge.js`、`vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/kit/extras.js`、`vibe-math-vmu/kit/handlers.js`、`vibe-math-vmu/kit/paper.js`、`vibe-math-vmu/packs/v3/middleware/gates.js`、`vibe-math-vmu/packs/v3/middleware/methods.js`、`vibe-math-vmu/packs/v3/middleware/planner.js`、`vibe-math-vmu/packs/v3/middleware/verify.js`、`vibe-math-vmu/packs/v3/tools.js`、`vibe-math-vmu/packs/v5r/blueprint.js`、`vibe-math-vmu/packs/v5r/meeting-tool-face.js`、`vibe-math-vmu/packs/v5r/middleware/artifact-counter.js`、`vibe-math-vmu/packs/v5r/middleware/motion-box.js`、`vibe-math-vmu/packs/v5r/middleware/paper-dispatch.js`、`vibe-math-vmu/packs/v5r/paper-quality.js`、`vibe-math-vmu/packs/v5r/tools.js`、`vibe-math-vmu/packs/v5r/verified.js`、`vibe-math-vmu/settings/schema.js`、`vibe-math-vmu/tools/activity.js`、`vibe-math-vmu/tools/capacity.js`、`vibe-math-vmu/tools/chat.js`、`vibe-math-vmu/tools/control.js`、`vibe-math-vmu/tools/env.js`、`vibe-math-vmu/tools/fidelity.js`、`vibe-math-vmu/tools/human.js`、`vibe-math-vmu/tools/mailbox.js`、`vibe-math-vmu/tools/mathadapters.js`、`vibe-math-vmu/tools/mathjobs.js`、`vibe-math-vmu/tools/meeting.js`、`vibe-math-vmu/tools/member-tools.js`、`vibe-math-vmu/tools/panel.js`、`vibe-math-vmu/tools/report.js`、`vibe-math-vmu/tools/turn.js`、`vibe-math-vmu/tools/vote.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_ENV_NO_PROBE` | **已实现 ✓** | `vibe-math-vmu/kernel/env.js` | 代码里有该码字符串 ✓ |
| `VMU_ENV_PROBE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/env.js` | 代码里有该码字符串 ✓ |
| `VMU_ENV_UNKNOWN_NEED` | **已实现 ✓** | `vibe-math-vmu/kernel/env.js` | 代码里有该码字符串 ✓ |
| `VMU_EXIT_FLUSH_FAILED` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_EXIT_FLUSH_INCOMPLETE` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_EXIT_FLUSH_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_EXPLAIN_CORRELATION_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/explain.js` | 代码里有该码字符串 ✓ |
| `VMU_EXPLAIN_REASON_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/explain.js` | 代码里有该码字符串 ✓ |
| `VMU_EXPLAIN_REASON_TOO_LONG` | **已实现 ✓** | `vibe-math-vmu/kernel/explain.js` | 代码里有该码字符串 ✓ |
| `VMU_EXTERNAL_DISABLED` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js`、`vibe-math-vmu/kernel/records.js` | 代码里有该码字符串 ✓ |
| `VMU_EXTERNAL_RECEIPT_INCOMPLETE` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js` | 代码里有该码字符串 ✓ |
| `VMU_EXTERNAL_STALE` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js` | 代码里有该码字符串 ✓ |
| `VMU_EXTERNAL_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js`、`vibe-math-vmu/kernel/formal.js`、`vibe-math-vmu/kernel/latex.js`、`vibe-math-vmu/kernel/lifecycle.js`、`vibe-math-vmu/kernel/mathadapters.js`、`vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/report.js`、`vibe-math-vmu/kernel/reportfeedback.js`、`vibe-math-vmu/kernel/reportfeedbackdelivery.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_FORMAL_ADAPTER_UNSUPPORTED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_FORMAL_AXIOM_UNTRUSTED` | **已实现 ✓** | `vibe-math-vmu/kernel/formal.js`、`vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_FORMAL_DISAGREEMENT` | **已实现 ✓** | `vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_FORMAL_LIBRARY_NOT_INDEXED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_FORMAL_NOT_FOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/formal.js` | 代码里有该码字符串 ✓ |
| `VMU_FORMAL_REPRO_INCOMPLETE` | **已实现 ✓** | `vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/repropack.js` | 代码里有该码字符串 ✓ |
| `VMU_FORMAL_SKELETON_UNAVAILABLE` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_FORMAL_SORRY_FOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/formal.js`、`vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_FUNDING_ALLOCATION_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/kernel/funding.js` | 代码里有该码字符串 ✓ |
| `VMU_FUNDING_ALLOCATION_WEIGHTS` | **已实现 ✓** | `vibe-math-vmu/kernel/funding.js` | 代码里有该码字符串 ✓ |
| `VMU_FUNDING_AMOUNT_OVER_CEILING` | **已实现 ✓** | `vibe-math-vmu/kernel/funding.js` | 代码里有该码字符串 ✓ |
| `VMU_FUNDING_AUDIT_TUPLE` | **已实现 ✓** | `vibe-math-vmu/kernel/funding.js` | 代码里有该码字符串 ✓ |
| `VMU_FUNDING_FX_SNAPSHOT_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/funding.js` | 代码里有该码字符串 ✓ |
| `VMU_FUNDING_FX_STALE` | **已实现 ✓** | `vibe-math-vmu/kernel/funding.js` | 代码里有该码字符串 ✓ |
| `VMU_FUNDING_NEGATIVE_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/funding.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_APPROVAL_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_APPROVAL_PENDING` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_APPROVAL_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_DASHBOARD_DOMAIN` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_DASHBOARD_SCOPE` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_DEFAULT_ALLOW_NOT_ACKNOWLEDGED` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_LIFT_REASON_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_LIFT_ROLE` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_OBSERVER_SCOPE` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_QUEUE_FULL` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_VETOED` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_VETO_REASON_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_VETO_SCOPE` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_IDEMPOTENCY_KEY_REUSED` | **已实现 ✓** | `vibe-math-vmu/kernel/idempotency.js` | 代码里有该码字符串 ✓ |
| `VMU_IDENTITY_CLAIM_UNMAPPED` | **已实现 ✓** | `vibe-math-vmu/kernel/identity.js` | 代码里有该码字符串 ✓ |
| `VMU_IDENTITY_ISSUER_UNTRUSTED` | **已实现 ✓** | `vibe-math-vmu/kernel/identity.js` | 代码里有该码字符串 ✓ |
| `VMU_IDENTITY_MEMBERSHIP_CAP` | **已实现 ✓** | `vibe-math-vmu/kernel/identity.js` | 代码里有该码字符串 ✓ |
| `VMU_IDENTITY_MULTI_MEMBERSHIP_OFF` | **已实现 ✓** | `vibe-math-vmu/kernel/identity.js` | 代码里有该码字符串 ✓ |
| `VMU_IDENTITY_PRINCIPAL_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/identity.js` | 代码里有该码字符串 ✓ |
| `VMU_IDENTITY_PSEUDONYM_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/identity.js` | 代码里有该码字符串 ✓ |
| `VMU_IDENTITY_PSEUDONYM_SCOPE` | **已实现 ✓** | `vibe-math-vmu/kernel/identity.js` | 代码里有该码字符串 ✓ |
| `VMU_IDS_BAD_KIND` | **已实现 ✓** | `vibe-math-vmu/kernel/ids.js` | 代码里有该码字符串 ✓ |
| `VMU_IDS_NOT_BOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/ids.js` | 代码里有该码字符串 ✓ |
| `VMU_IDS_PERSIST_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/ids.js` | 代码里有该码字符串 ✓ |
| `VMU_IDS_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/ids.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_INDEX_STALE` | **已实现 ✓** | `vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/stateversion.js` | 代码里有该码字符串 ✓ |
| `VMU_INVALID_ARGUMENT` | **已实现 ✓** | `vibe-math-vmu/extensions/domain-compliance/gate.js`、`vibe-math-vmu/host-deliver.js`、`vibe-math-vmu/host-math.js`、`vibe-math-vmu/host-spawn.js`、`vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/activity.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/arbitration.js`、`vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/board.js`、`vibe-math-vmu/kernel/bus.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/charter.js`、`vibe-math-vmu/kernel/chat.js`、`vibe-math-vmu/kernel/citations.js`、`vibe-math-vmu/kernel/clockguard.js`、`vibe-math-vmu/kernel/collab.js`、`vibe-math-vmu/kernel/compliance.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/control.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/custody.js`、`vibe-math-vmu/kernel/delegation.js`、`vibe-math-vmu/kernel/discipline.js`、`vibe-math-vmu/kernel/explain.js`、`vibe-math-vmu/kernel/fairness.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/guard.js`、`vibe-math-vmu/kernel/handover.js`、`vibe-math-vmu/kernel/human.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/identity.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/latex.js`、`vibe-math-vmu/kernel/library-policy.js`、`vibe-math-vmu/kernel/library.js`、`vibe-math-vmu/kernel/loader.js`、`vibe-math-vmu/kernel/mailbox.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetingdomain.js`、`vibe-math-vmu/kernel/meetinglapse.js`、`vibe-math-vmu/kernel/meetingleave.js`、`vibe-math-vmu/kernel/meetingmarker.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/meetingverdict.js`、`vibe-math-vmu/kernel/memberface.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/memory.js`、`vibe-math-vmu/kernel/metrics.js`、`vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/minutes.js`、`vibe-math-vmu/kernel/notify.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/kernel/panel.js`、`vibe-math-vmu/kernel/paper.js`、`vibe-math-vmu/kernel/partnership.js`、`vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/publication.js`、`vibe-math-vmu/kernel/ratelimit.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/recruit.js`、`vibe-math-vmu/kernel/registry.js`、`vibe-math-vmu/kernel/replay.js`、`vibe-math-vmu/kernel/report.js`、`vibe-math-vmu/kernel/resume.js`、`vibe-math-vmu/kernel/reviewers.js`、`vibe-math-vmu/kernel/rules.js`、`vibe-math-vmu/kernel/scheduler.js`、`vibe-math-vmu/kernel/script-bridge.js`、`vibe-math-vmu/kernel/skills.js`、`vibe-math-vmu/kernel/store.js`、`vibe-math-vmu/kernel/storepolicy.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kernel/tenure.js`、`vibe-math-vmu/kernel/timevalue.js`、`vibe-math-vmu/kernel/topology.js`、`vibe-math-vmu/kernel/transaction.js`、`vibe-math-vmu/kernel/trust.js`、`vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/kernel/workflow.js`、`vibe-math-vmu/kit/extras.js`、`vibe-math-vmu/kit/handlers.js`、`vibe-math-vmu/kit/paper.js`、`vibe-math-vmu/kit/tools.js`、`vibe-math-vmu/packs/v3/middleware/dataplane.js`、`vibe-math-vmu/packs/v3/middleware/gates.js`、`vibe-math-vmu/packs/v3/middleware/methods.js`、`vibe-math-vmu/packs/v3/middleware/planner.js`、`vibe-math-vmu/packs/v3/middleware/verify.js`、`vibe-math-vmu/packs/v3/tools.js`、`vibe-math-vmu/packs/v5r/blueprint.js`、`vibe-math-vmu/packs/v5r/middleware/paper-dispatch.js`、`vibe-math-vmu/packs/v5r/middleware/prompt-switches.js`、`vibe-math-vmu/packs/v5r/notices.js`、`vibe-math-vmu/packs/v5r/paper-quality.js`、`vibe-math-vmu/packs/v5r/tools.js`、`vibe-math-vmu/packs/v5r/verification-gates.js`、`vibe-math-vmu/packs/v5r/verified.js`、`vibe-math-vmu/settings/schema.js`、`vibe-math-vmu/tools/activity.js`、`vibe-math-vmu/tools/admission.js`、`vibe-math-vmu/tools/arbitration.js`、`vibe-math-vmu/tools/audit.js`、`vibe-math-vmu/tools/auditchain.js`、`vibe-math-vmu/tools/bidding.js`、`vibe-math-vmu/tools/board.js`、`vibe-math-vmu/tools/bridge.js`、`vibe-math-vmu/tools/budget.js`、`vibe-math-vmu/tools/capacity.js`、`vibe-math-vmu/tools/charter.js`、`vibe-math-vmu/tools/chat.js`、`vibe-math-vmu/tools/citations.js`、`vibe-math-vmu/tools/clockguard.js`、`vibe-math-vmu/tools/collab.js`、`vibe-math-vmu/tools/conference.js`、`vibe-math-vmu/tools/control.js`、`vibe-math-vmu/tools/custody.js`、`vibe-math-vmu/tools/discipline.js`、`vibe-math-vmu/tools/env.js`、`vibe-math-vmu/tools/explain.js`、`vibe-math-vmu/tools/external.js`、`vibe-math-vmu/tools/fairness.js`、`vibe-math-vmu/tools/formal.js`、`vibe-math-vmu/tools/governance.js`、`vibe-math-vmu/tools/handover.js`、`vibe-math-vmu/tools/human.js`、`vibe-math-vmu/tools/idempotency.js`、`vibe-math-vmu/tools/ip.js`、`vibe-math-vmu/tools/mailbox.js`、`vibe-math-vmu/tools/mathtools.js`、`vibe-math-vmu/tools/meeting.js`、`vibe-math-vmu/tools/member-tools.js`、`vibe-math-vmu/tools/minutes.js`、`vibe-math-vmu/tools/notify.js`、`vibe-math-vmu/tools/panel.js`、`vibe-math-vmu/tools/projmigrate.js`、`vibe-math-vmu/tools/publication.js`、`vibe-math-vmu/tools/ratelimit.js`、`vibe-math-vmu/tools/recruit.js`、`vibe-math-vmu/tools/report.js`、`vibe-math-vmu/tools/retention.js`、`vibe-math-vmu/tools/reviewers.js`、`vibe-math-vmu/tools/task.js`、`vibe-math-vmu/tools/topology.js`、`vibe-math-vmu/tools/transaction.js`、`vibe-math-vmu/tools/turn.js`、`vibe-math-vmu/tools/vote.js` | 代码里有该码字符串 ✓ |
| `VMU_JOB_CANCELLED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js`、`vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_JOB_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/script-bridge.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_ARCHIVE_DRIFT` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_ARCHIVE_NAME_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_ARCHIVE_NAME_TAKEN` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_ARCHIVE_NOT_FOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_COMMAND_NOT_FOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_COMPILE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/formal.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_EXIT_NONZERO` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_EXIT_UNOBSERVED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_FILE_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_FILE_UNREADABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_HASH_CHANGED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_JOBS_DIR_UNSAFE` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_JOBS_MIRROR_UNWIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_KIND_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
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
| `VMU_MAILBOX_ACK_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/mailbox.js` | 代码里有该码字符串 ✓ |
| `VMU_MAILBOX_ANCHOR_DANGLING` | **已实现 ✓** | `vibe-math-vmu/kernel/mailbox.js` | 代码里有该码字符串 ✓ |
| `VMU_MAILBOX_CAP_REACHED` | **已实现 ✓** | `vibe-math-vmu/kernel/mailbox.js` | 代码里有该码字符串 ✓ |
| `VMU_MAILBOX_DELIVERY_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/mailbox.js` | 代码里有该码字符串 ✓ |
| `VMU_MAILBOX_NO_SUCH_ENTRY` | **已实现 ✓** | `vibe-math-vmu/kernel/mailbox.js` | 代码里有该码字符串 ✓ |
| `VMU_MAILBOX_NO_SUCH_RECIPIENT` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/mailbox.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_ADAPTER_OP_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_ARTIFACT_TOO_LARGE` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_ASSUMPTION_CONFLICT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_CACHE_CORRUPT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_DIMENSION_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_EXPR_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_HARNESS_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js`、`vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_INTERVAL_EMPTY` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_INVALID_INPUT` | **已实现 ✓** | `vibe-math-vmu/kernel/fidelity.js`、`vibe-math-vmu/kernel/formal.js`、`vibe-math-vmu/kernel/mathadapters.js`、`vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/tools/fidelity.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_JOBS_DIR_UNSAFE` | **已实现 ✓** | `vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_JOBS_MIRROR_UNWIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/fidelity.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_JOB_ID_TAKEN` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js`、`vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_JOB_INVALID_STATE` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_JOB_PERSIST_FAILED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_LIB_NOT_DECLARED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_LIB_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_NONCONVERGENT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_NOT_CONVERGED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_PRECISION_LOST` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_REPRO_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/kernel/formal.js`、`vibe-math-vmu/kernel/repropack.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_RESIDUAL_TOO_LARGE` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_RESOURCE_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_RESULT_UNPARSEABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_SANDBOX_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_SEED_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js`、`vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/repropack.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_SHAPE_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_SINGULAR_MATRIX` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_UNSUPPORTED_OP` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js`、`vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETINGS_MARKER_UNREADABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/meetingmarker.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_APPEAL_OUT_OF_SCOPE` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_BOX_BINDING_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetingmarker.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_BOX_UNMAPPED` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/meetingmarker.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_BOX_UNWIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetingmarker.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_CONFIDENTIAL_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_DISCIPLINE_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_EMERGENCY_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_INTERRUPT_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_LIGHT_NO_TRUTH` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/minutes.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_ORDER_DENIED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MEETING_QUORUM_LOST` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_RECESS_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_SPEECH_TIMEBOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/meetinglapse.js`、`vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_TIER_CONFLICT` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_TOO_SMALL` | **已实现 ✓** | `vibe-math-vmu/kernel/meeting.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_UNANSWERED_POLICY` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MEMBER_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_MEMORY_NOT_AUTHORITY` | **已实现 ✓** | `vibe-math-vmu/kernel/memory.js` | 代码里有该码字符串 ✓ |
| `VMU_META_VALIDATION_FAILED` | **已实现 ✓** | `vibe-math-vmu/extensions/domain-compliance/index.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/lifecycle.js`、`vibe-math-vmu/kernel/resource.js`、`vibe-math-vmu/kernel/stateversion.js`、`vibe-math-vmu/kernel/storepolicy.js` | 代码里有该码字符串 ✓ |
| `VMU_METRICS_TRIGGER_FORBIDDEN` | **已实现 ✓** | `vibe-math-vmu/kernel/metrics.js` | 代码里有该码字符串 ✓ |
| `VMU_METRIC_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/metrics.js`、`vibe-math-vmu/packs/v5r/middleware/artifact-counter.js` | 代码里有该码字符串 ✓ |
| `VMU_MIDDLEWARE_FAILED` | **已实现 ✓** | `vibe-math-vmu/host-spawn.js`、`vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/activity.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/bus.js`、`vibe-math-vmu/kernel/library.js`、`vibe-math-vmu/kernel/loader.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/registry.js`、`vibe-math-vmu/kernel/reportfeedback.js`、`vibe-math-vmu/kernel/rules.js`、`vibe-math-vmu/kernel/script-bridge.js`、`vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/packs/v3/middleware/gates.js`、`vibe-math-vmu/packs/v3/middleware/methods.js`、`vibe-math-vmu/packs/v3/middleware/paper-close.js`、`vibe-math-vmu/packs/v3/middleware/planner.js`、`vibe-math-vmu/packs/v3/middleware/verify.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_MIDDLEWARE_KIND_UNSUPPORTED` | **已实现 ✓** | `vibe-math-vmu/kernel/bus.js` | 代码里有该码字符串 ✓ |
| `VMU_MIDDLEWARE_REJECTED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/bus.js` | 代码里有该码字符串 ✓ |
| `VMU_MIGRATE_DRYRUN_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/stateversion.js` | 代码里有该码字符串 ✓ |
| `VMU_MINUTES_ACTION_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/minutes.js` | 代码里有该码字符串 ✓ |
| `VMU_MINUTES_DISSENT_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/minutes.js` | 代码里有该码字符串 ✓ |
| `VMU_MINUTES_NOT_CONFIRMED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/minutes.js` | 代码里有该码字符串 ✓ |
| `VMU_MONEY_NEGATIVE_FORBIDDEN` | **已实现 ✓** | `vibe-math-vmu/kernel/bidding.js` | 代码里有该码字符串 ✓ |
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
| `VMU_NOT_FOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/ballotbox.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/governance.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/lean.js`、`vibe-math-vmu/kernel/lifecycle.js`、`vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/repropack.js`、`vibe-math-vmu/kernel/resource.js`、`vibe-math-vmu/kernel/stateversion.js` | 代码里有该码字符串 ✓ |
| `VMU_NOT_MEMBER` | **已实现 ✓** | `vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/governance.js`、`vibe-math-vmu/kernel/meetingleave.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/tools/meeting.js` | 代码里有该码字符串 ✓ |
| `VMU_NOT_PERMITTED` | **已实现 ✓** | `vibe-math-vmu/host-hooks.js`、`vibe-math-vmu/host-math.js`、`vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/arbitration.js`、`vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/ballotbox.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/charter.js`、`vibe-math-vmu/kernel/chat.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/delegation.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/guard.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/library.js`、`vibe-math-vmu/kernel/loader.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetinglapse.js`、`vibe-math-vmu/kernel/meetingleave.js`、`vibe-math-vmu/kernel/meetingmarker.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/panel.js`、`vibe-math-vmu/kernel/paper.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/resource.js`、`vibe-math-vmu/kernel/reviewers.js`、`vibe-math-vmu/kernel/storepolicy.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kit/paper.js`、`vibe-math-vmu/packs/v5r/middleware/paper-dispatch.js`、`vibe-math-vmu/packs/v5r/tools.js`、`vibe-math-vmu/settings/schema.js`、`vibe-math-vmu/tools/meeting.js`、`vibe-math-vmu/tools/turn.js` | 代码里有该码字符串 ✓ |
| `VMU_NO_OPEN_MEETING` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/minutes.js`、`vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_NO_SUCH_OBJECT` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/arbitration.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/charter.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/delegation.js`、`vibe-math-vmu/kernel/fairness.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/handover.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/library.js`、`vibe-math-vmu/kernel/loader.js`、`vibe-math-vmu/kernel/mailbox.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetingdomain.js`、`vibe-math-vmu/kernel/meetingleave.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/memory.js`、`vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/minutes.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/kernel/paper.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/registry.js`、`vibe-math-vmu/kernel/replay.js`、`vibe-math-vmu/kernel/retention.js`、`vibe-math-vmu/kernel/rules.js`、`vibe-math-vmu/kernel/scheduler.js`、`vibe-math-vmu/kernel/skills.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kernel/transaction.js`、`vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/kit/extras.js`、`vibe-math-vmu/kit/handlers.js`、`vibe-math-vmu/kit/paper.js`、`vibe-math-vmu/packs/v3/middleware/gates.js`、`vibe-math-vmu/packs/v3/middleware/planner.js`、`vibe-math-vmu/packs/v3/middleware/verify.js`、`vibe-math-vmu/packs/v5r/tools.js`、`vibe-math-vmu/tools/meeting.js` | 代码里有该码字符串 ✓ |
| `VMU_OFFICE_CONSULT_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/paper.js`、`vibe-math-vmu/packs/v5r/paper.js` | 代码里有该码字符串 ✓ |
| `VMU_OFFICE_CONSULT_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/paper.js` | 代码里有该码字符串 ✓ |
| `VMU_OUTREACH_ANONYMITY` | **已实现 ✓** | `vibe-math-vmu/kernel/publication.js` | 代码里有该码字符串 ✓ |
| `VMU_OUTREACH_EMBARGO` | **已实现 ✓** | `vibe-math-vmu/kernel/publication.js` | 代码里有该码字符串 ✓ |
| `VMU_OUTREACH_EVIDENCE` | **已实现 ✓** | `vibe-math-vmu/kernel/publication.js` | 代码里有该码字符串 ✓ |
| `VMU_OUTREACH_IMPACT_FIELDS` | **已实现 ✓** | `vibe-math-vmu/kernel/publication.js` | 代码里有该码字符串 ✓ |
| `VMU_OUTREACH_IMPACT_NOT_FOR_EVALUATION` | **已实现 ✓** | `vibe-math-vmu/kernel/publication.js` | 代码里有该码字符串 ✓ |
| `VMU_OUTREACH_INCOMPLETE` | **已实现 ✓** | `vibe-math-vmu/kernel/publication.js` | 代码里有该码字符串 ✓ |
| `VMU_OUTREACH_LANGUAGE` | **已实现 ✓** | `vibe-math-vmu/kernel/publication.js` | 代码里有该码字符串 ✓ |
| `VMU_OUTREACH_MEDIA_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/publication.js` | 代码里有该码字符串 ✓ |
| `VMU_OUTREACH_NOT_READY` | **已实现 ✓** | `vibe-math-vmu/kernel/publication.js` | 代码里有该码字符串 ✓ |
| `VMU_OUTREACH_OPEN_REVIEW_OFF` | **已实现 ✓** | `vibe-math-vmu/kernel/publication.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_CONFLICT` | **已实现 ✓** | `vibe-math-vmu/host-pack-tools.js`、`vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_INSTITUTE_MIN_FROZEN_ROUND` | **已实现 ✓** | `vibe-math-vmu/packs/institute-min/index.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_INSTITUTE_MIN_NOT_LOCKED` | **已实现 ✓** | `vibe-math-vmu/packs/institute-min/index.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_INVALID` | **已实现 ✓** | `vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_KERNEL_OVERRIDE_REFUSED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_PACK_LOADER_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_MISSING` | **已实现 ✓** | `vibe-math-vmu/host-pack-tools.js`、`vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_PROMPT_POLICY_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/pack.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_PROMPT_POLICY_UNCONSUMED` | **已实现 ✓** | `vibe-math-vmu/kernel/pack.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_CORE_MANUAL_GATE` | **已实现 ✓** | `vibe-math-vmu/packs/v3-core/index.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_CORE_VERIFIER_QUORUM` | **已实现 ✓** | `vibe-math-vmu/packs/v3-core/index.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_DEFECT_MODE_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/packs/v3/middleware/defects.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_DEFECT_NOTE_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/packs/v3/middleware/defects.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_DEFECT_TARGET_UNRESOLVED` | **已实现 ✓** | `vibe-math-vmu/kernel/library.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_DEFECT_UNENFORCED` | **已实现 ✓** | `vibe-math-vmu/packs/v3/middleware/defects.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_DEFECT_WITHDRAWN` | **已实现 ✓** | `vibe-math-vmu/packs/v3/middleware/dataplane.js`、`vibe-math-vmu/packs/v3/middleware/defects.js`、`vibe-math-vmu/packs/v3/middleware/verify.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_DUPLICATE_DISPATCH` | **已实现 ✓** | `vibe-math-vmu/packs/v3/index.js`、`vibe-math-vmu/packs/v3/middleware/planner.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_LEAN_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/packs/v3/index.js`、`vibe-math-vmu/packs/v3/middleware/lean-gate.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_PAPER_INCOMPLETE` | **已实现 ✓** | `vibe-math-vmu/packs/v3/index.js`、`vibe-math-vmu/packs/v3/middleware/paper-close.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_PROPOSITION_NOT_EXTRACTABLE` | **已实现 ✓** | `vibe-math-vmu/packs/v3/index.js`、`vibe-math-vmu/packs/v3/middleware/dataplane.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_TOOL_NOT_PERMITTED` | **已实现 ✓** | `vibe-math-vmu/packs/v3/index.js`、`vibe-math-vmu/packs/v3/middleware/toolfilter.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V3_TOOL_UNRESOLVED` | **已实现 ✓** | `vibe-math-vmu/packs/v3/index.js`、`vibe-math-vmu/packs/v3/middleware/toolfilter.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_NOT_SETTLED` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/paper.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_PAPER_FINGERPRINT_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/paper.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_PAPER_PDF_FAILED` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/paper.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_PAPER_PDF_NEEDS_KERNEL` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/paper.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_PAPER_STATE` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/middleware/paper-dispatch.js`、`vibe-math-vmu/packs/v5r/paper.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORPUS_NOT_RUNTIME` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/verification-gates.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_DEBATE_SUBJECT_UNPROVEN` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/verification-gates.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_FIDELITY_ASK_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/verification-gates.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_P1_NEEDS_DEBATE` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/verification-gates.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_VERIFIED_SINGLE_WRITER` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/verification-gates.js` | 代码里有该码字符串 ✓ |
| `VMU_PANEL_CAP_REACHED` | **已实现 ✓** | `vibe-math-vmu/kernel/panel.js` | 代码里有该码字符串 ✓ |
| `VMU_PANEL_DEVIATION` | **已实现 ✓** | `vibe-math-vmu/kernel/panel.js` | 代码里有该码字符串 ✓ |
| `VMU_PANEL_NO_SUCH_MEMBER` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_PANEL_TIME_KEY` | **已实现 ✓** | `vibe-math-vmu/kernel/panel.js` | 代码里有该码字符串 ✓ |
| `VMU_PANEL_UNKNOWN_FIELD` | **已实现 ✓** | `vibe-math-vmu/kernel/panel.js` | 代码里有该码字符串 ✓ |
| `VMU_PAPER_LATEX_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/latex.js` | 代码里有该码字符串 ✓ |
| `VMU_PAPER_LATEX_INTERRUPTED` | **已实现 ✓** | `vibe-math-vmu/kernel/latex.js` | 代码里有该码字符串 ✓ |
| `VMU_PAPER_LATEX_NO_ENGINE` | **已实现 ✓** | `vibe-math-vmu/kernel/latex.js` | 代码里有该码字符串 ✓ |
| `VMU_PAPER_LATEX_NO_OUTPUT` | **已实现 ✓** | `vibe-math-vmu/kernel/latex.js` | 代码里有该码字符串 ✓ |
| `VMU_PAPER_LATEX_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/kernel/latex.js` | 代码里有该码字符串 ✓ |
| `VMU_PAPER_ROUNDS_EXCEEDED` | **已实现 ✓** | `vibe-math-vmu/kernel/paper.js` | 代码里有该码字符串 ✓ |
| `VMU_PARAM_DEPRECATED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_PARAM_REMOVED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_PARAM_RENAMED` | **已实现 ✓** | `vibe-math-vmu/settings/schema.js` | 代码里有该码字符串 ✓ |
| `VMU_PATH_ESCAPE_REFUSED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_PROMPT_BINDING_CONFLICT` | **已实现 ✓** | `vibe-math-vmu/kernel/prompt/index.js` | 代码里有该码字符串 ✓ |
| `VMU_PROMPT_VARIABLE_MISSING` | **已实现 ✓** | `vibe-math-vmu/kernel/prompt/index.js` | 代码里有该码字符串 ✓ |
| `VMU_PROXY_CHAIN_TOO_DEEP` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_PROXY_NOT_ALLOWED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_QUOTA_EXCEEDED` | **已实现 ✓** | `vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/retention.js` | 代码里有该码字符串 ✓ |
| `VMU_QUOTA_SOFT_EXCEEDED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetingmarker.js`、`vibe-math-vmu/kernel/retention.js` | 代码里有该码字符串 ✓ |
| `VMU_RATE_LIMITED` | **已实现 ✓** | `vibe-math-vmu/kernel/ratelimit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECOUNT_MISMATCH` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_RECOUNT_SCOPE_DENIED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_RECRUIT_NEEDS_HUMAN` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECRUIT_NOT_APPLIED` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECRUIT_OFFER_EXPIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECRUIT_PROBATION_NOT_DUE` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECRUIT_PROBATION_PERMISSIONS` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECRUIT_REASON_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECRUIT_SEATS_EXCEEDED` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECRUIT_SLOT_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_RECUSAL_REQUIRED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_REF_DANGLING` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_REOPEN_FLOOR_NOT_MET` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_REOPEN_WRONG_INITIATOR` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_REPORT_ACTION_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_AUDIT_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_CHANNEL_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_DECLARATION_INVALID` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_DELIVER_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js`、`vibe-math-vmu/packs/v3/middleware/reports.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_NOT_ENABLED` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_NO_RECIPIENTS` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_NO_TRANSPORT` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js`、`vibe-math-vmu/packs/v3/middleware/reports.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_PARAM_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_PARAM_NOT_DECLARED` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_PARAM_READONLY` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_PARAM_REASON_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_TEMPLATE_VAR_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_TRIGGER_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_UNKNOWN_NAME` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPRO_COPY_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/repropack.js` | 代码里有该码字符串 ✓ |
| `VMU_RESOURCE_BUDGET` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/budget.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meetingmarker.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/paper.js`、`vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/replay.js`、`vibe-math-vmu/kernel/resource.js`、`vibe-math-vmu/kernel/stateversion.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kernel/transaction.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_BAD_STEP` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_BUSY` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_CHILDREN_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/host-children.js`、`vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_CLOCK_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js`、`vibe-math-vmu/kernel/resumeflush.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_INTERRUPTED_NOT_PASSED` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_MAILBOX_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_NO_ADAPTER` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_NO_TARGET` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_PROJECTION_GAP` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_QUEUE_FULL` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_READBACK_DRIFT` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_RESTORE_CONFLICT` | **已实现 ✓** | `vibe-math-vmu/kernel/budget.js`、`vibe-math-vmu/kernel/human.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/resume.js`、`vibe-math-vmu/kernel/tasks.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_SNAPSHOT_INCOMPLETE` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_SNAPSHOT_VERSION` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js`、`vibe-math-vmu/kernel/resumeflush.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_WRITE_BEFORE_READ` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js`、`vibe-math-vmu/kernel/resumeflush.js` | 代码里有该码字符串 ✓ |
| `VMU_RETENTION_TRUNCATED` | **已实现 ✓** | `vibe-math-vmu/kernel/retention.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLE_EVIDENCE_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLE_RECALL_COOLDOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLE_RECALL_QUORUM` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLE_SEPARATION_VIOLATED` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLE_TERM_NOT_RENEWABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLLBACK_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLLBACK_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/migration.js` | 代码里有该码字符串 ✓ |
| `VMU_SAFETY_EXEC_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/guard.js` | 代码里有该码字符串 ✓ |
| `VMU_SAFETY_KILL_SWITCH` | **已实现 ✓** | `vibe-math-vmu/kernel/guard.js` | 代码里有该码字符串 ✓ |
| `VMU_SAFETY_NET_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/guard.js` | 代码里有该码字符串 ✓ |
| `VMU_SAFETY_PATH_TOO_LONG` | **已实现 ✓** | `vibe-math-vmu/kernel/guard.js` | 代码里有该码字符串 ✓ |
| `VMU_SAFETY_SYMLINK_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/guard.js` | 代码里有该码字符串 ✓ |
| `VMU_SCHEDULER_ACTION_FORBIDDEN` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_SCHEDULER_TRIGGER_LIMIT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_SCHEDULE_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/scheduler.js` | 代码里有该码字符串 ✓ |
| `VMU_SKILL_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/skills.js` | 代码里有该码字符串 ✓ |
| `VMU_SKILL_SELF_ATTEST` | **已实现 ✓** | `vibe-math-vmu/kernel/skills.js` | 代码里有该码字符串 ✓ |
| `VMU_SKILL_VOCAB_VIOLATION` | **已实现 ✓** | `vibe-math-vmu/kernel/skills.js` | 代码里有该码字符串 ✓ |
| `VMU_SLO_BUDGET_EXHAUSTED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js` | 代码里有该码字符串 ✓ |
| `VMU_SPAWN_HANDLE_CALLBACK_FAILED` | **已实现 ✓** | `vibe-math-vmu/host-spawn.js` | 代码里有该码字符串 ✓ |
| `VMU_SPAWN_TIMER_CLEANUP` | **已实现 ✓** | `vibe-math-vmu/host-spawn.js` | 代码里有该码字符串 ✓ |
| `VMU_STATE` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/arbitration.js`、`vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/ballotbox.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/charter.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/delegation.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/human.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetinglapse.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/memory.js`、`vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/paper.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/resume.js`、`vibe-math-vmu/kernel/scheduler.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kernel/transaction.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/kernel/workflow.js`、`vibe-math-vmu/kit/handlers.js`、`vibe-math-vmu/packs/v3/middleware/dataplane.js`、`vibe-math-vmu/packs/v3/middleware/gates.js`、`vibe-math-vmu/packs/v3/middleware/planner.js`、`vibe-math-vmu/packs/v3/middleware/verify.js`、`vibe-math-vmu/packs/v3/tools.js`、`vibe-math-vmu/packs/v5r/blueprint.js`、`vibe-math-vmu/packs/v5r/meeting-tool-face.js`、`vibe-math-vmu/packs/v5r/tools.js`、`vibe-math-vmu/packs/v5r/verified.js`、`vibe-math-vmu/tools/activity.js`、`vibe-math-vmu/tools/admission.js`、`vibe-math-vmu/tools/arbitration.js`、`vibe-math-vmu/tools/audit.js`、`vibe-math-vmu/tools/auditchain.js`、`vibe-math-vmu/tools/bidding.js`、`vibe-math-vmu/tools/board.js`、`vibe-math-vmu/tools/bridge.js`、`vibe-math-vmu/tools/budget.js`、`vibe-math-vmu/tools/capacity.js`、`vibe-math-vmu/tools/charter.js`、`vibe-math-vmu/tools/chat.js`、`vibe-math-vmu/tools/citations.js`、`vibe-math-vmu/tools/clockguard.js`、`vibe-math-vmu/tools/collab.js`、`vibe-math-vmu/tools/conference.js`、`vibe-math-vmu/tools/control.js`、`vibe-math-vmu/tools/custody.js`、`vibe-math-vmu/tools/discipline.js`、`vibe-math-vmu/tools/env.js`、`vibe-math-vmu/tools/explain.js`、`vibe-math-vmu/tools/external.js`、`vibe-math-vmu/tools/fairness.js`、`vibe-math-vmu/tools/fidelity.js`、`vibe-math-vmu/tools/formal.js`、`vibe-math-vmu/tools/governance.js`、`vibe-math-vmu/tools/handover.js`、`vibe-math-vmu/tools/human.js`、`vibe-math-vmu/tools/idempotency.js`、`vibe-math-vmu/tools/ip.js`、`vibe-math-vmu/tools/mailbox.js`、`vibe-math-vmu/tools/mathadapters.js`、`vibe-math-vmu/tools/mathjobs.js`、`vibe-math-vmu/tools/mathtools.js`、`vibe-math-vmu/tools/meeting.js`、`vibe-math-vmu/tools/minutes.js`、`vibe-math-vmu/tools/notify.js`、`vibe-math-vmu/tools/panel.js`、`vibe-math-vmu/tools/projmigrate.js`、`vibe-math-vmu/tools/publication.js`、`vibe-math-vmu/tools/ratelimit.js`、`vibe-math-vmu/tools/recruit.js`、`vibe-math-vmu/tools/report.js`、`vibe-math-vmu/tools/retention.js`、`vibe-math-vmu/tools/reviewers.js`、`vibe-math-vmu/tools/task.js`、`vibe-math-vmu/tools/topology.js`、`vibe-math-vmu/tools/transaction.js` | 代码里有该码字符串 ✓ |
| `VMU_STORE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/mailbox.js`、`vibe-math-vmu/kernel/store.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_STORE_MIGRATION` | **已实现 ✓** | `vibe-math-vmu/kernel/store.js` | 代码里有该码字符串 ✓ |
| `VMU_TASK_DEPENDENCY_CYCLE` | **已实现 ✓** | `vibe-math-vmu/kernel/tasks.js` | 代码里有该码字符串 ✓ |
| `VMU_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js`、`vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_TOOL_FACE_UNRESOLVED` | **已实现 ✓** | `vibe-math-vmu/host-pack-tools.js`、`vibe-math-vmu/kernel/memberface.js` | 代码里有该码字符串 ✓ |
| `VMU_TOOL_NOT_IN_FACE` | **已实现 ✓** | `vibe-math-vmu/host-pack-tools.js`、`vibe-math-vmu/kernel/memberface.js` | 代码里有该码字符串 ✓ |
| `VMU_TOPOLOGY_CYCLE` | **已实现 ✓** | `vibe-math-vmu/kernel/topology.js` | 代码里有该码字符串 ✓ |
| `VMU_TOPOLOGY_PATH_FORBIDDEN` | **已实现 ✓** | `vibe-math-vmu/kernel/topology.js` | 代码里有该码字符串 ✓ |
| `VMU_TOPOLOGY_SIZE_EXCEEDED` | **已实现 ✓** | `vibe-math-vmu/kernel/topology.js` | 代码里有该码字符串 ✓ |
| `VMU_TRUST_VOCAB_VIOLATION` | **已实现 ✓** | `vibe-math-vmu/kernel/trust.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_ASSEMBLY_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_BAD_JSON` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_DELIVERY_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/host-deliver.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_DISPATCH_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_FIELD_NOT_APPLICABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_NO_FENCE` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_NO_PENDING_MEMBER` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_REENTRANT` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/packs/v3/middleware/verify.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_REPLY_CONFLICT` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_UNKNOWN_FIELD` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
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

提案码（39）：VMU_AUCTION_MIN_BIDS、VMU_AWARD_RATIONALE_REQUIRED、VMU_BALLOT_FROZEN、VMU_BALLOT_SECRECY_LOCKED、VMU_CHAT_CAP_REACHED、VMU_CONTROL_SCOPE_UNKNOWN、VMU_DEGRADED、VMU_FORMAL_LIBRARY_NOT_INDEXED、VMU_FORMAL_SKELETON_UNAVAILABLE、VMU_MATH_ARTIFACT_TOO_LARGE、VMU_MATH_ASSUMPTION_CONFLICT、VMU_MATH_CACHE_CORRUPT、VMU_MATH_INTERVAL_EMPTY、VMU_MATH_JOB_INVALID_STATE、VMU_MATH_JOB_PERSIST_FAILED、VMU_MATH_NONCONVERGENT、VMU_MATH_PRECISION_LOST、VMU_MATH_RESIDUAL_TOO_LARGE、VMU_MATH_SINGULAR_MATRIX、VMU_MEETING_ORDER_DENIED、VMU_MEETING_UNANSWERED_POLICY、VMU_NAME_CONFLICT、VMU_PACK_KERNEL_OVERRIDE_REFUSED、VMU_PANEL_NO_SUCH_MEMBER、VMU_PARAM_DEPRECATED、VMU_PARAM_REMOVED、VMU_PROXY_CHAIN_TOO_DEEP、VMU_PROXY_NOT_ALLOWED、VMU_RECOUNT_MISMATCH、VMU_RECOUNT_SCOPE_DENIED、VMU_RECUSAL_REQUIRED、VMU_REF_DANGLING、VMU_REOPEN_FLOOR_NOT_MET、VMU_REOPEN_WRONG_INITIATOR、VMU_SCHEDULER_ACTION_FORBIDDEN、VMU_SCHEDULER_TRIGGER_LIMIT、VMU_VETO_NOT_ALLOWED、VMU_WORKFLOW_CHECKPOINT_MISSING、VMU_WORKFLOW_RACI_MISSING_OWNER

<!-- PLANNED-CODES:END -->

| **`VMU_IO_FAILED`** | **写盘/IO 失败**（与"状态不对"**区分**：调用方应重试或改路径，而不是改状态机 ✗） | 耐久/记录/归档 | ✅（**R-c 已裁定：新增** ✓，替代把 `V5_WRITE_FAILED` 混入 `VMU_STATE` ✗） |

> **登记纪律（门禁 D14）**：文档/代码中出现的每个 `VMU_*` 都**必须**在本表登记；**未登记即红** ✗。新增码 ⇒ **只增不改语义**（改语义＝新码，见 §7）✓。

**pack 自有域码规范（R-d 已裁定 ✓）**：整合包若需要机构级错误码，**必须**用 `VMU_PACK_<PACKID>_<REASON>` 形状 ✗不得直接占用 `VMU_*` 的框架命名空间（否则"框架拒"与"机构拒"不可分 ✗）✓；并且**必须在 pack manifest 的 `codes[]` 里登记每个码＋一行语义** ✓（加载期校验：未登记即拒 ✓）。框架码与 pack 码因此**前缀可分** ✓。

**纪律**：**任何"拒绝"都必须具名**（R11）；不得返回"空成功"或近似物（沿用 v5r 的 S21 纪律）。

---

### 8.2 env 缝（部署接口；**手写登记** ✓）

> ★ 这一节登记**部署必须设置的环境变量**：它们**不是错误码**，故不进上表；但"宿主必须设的一个名字"属于**部署接口**，必须在契约卷里有位置（doc-lint 对文档里出现的 `VMU_*` 名**逐名**比对，**环境缝不例外**）。三列是硬要求：**谁设／何时设**、**缺席时行为（具名降级）**、**出处**。

| 名称 | 谁设／何时设 | 缺席时行为（具名降级，**不是错误**） | 出处 |
|---|---|---|---|
| `VMU_RESUME_FROM` | **内核在派生数学作业子进程时**写进子进程 env：值＝`submit({resumeFrom})` 收到的**引擎自有不透明令牌**（内核只负责"带着它"：request → 子进程 env → 镜像 → 恢复重发） | 不设（`resumeFrom` 为空）⇒ 子进程**从头计算**；回执 `resumedFrom` 为 `null`，**不假装续算** | `kernel/mathjobs.js:611`（写）／`:658`（回执 `resumedFrom`）／`:747`（令牌形状，且**进请求指纹** `inputHash`） |

---

## 9. Settings keys（索引）

全表在 `04-settings.md` §4（命名空间 `vmu.*`）。**登记规则**：新增键必须同时更新 04 与 §6 的公开键清单（如涉及耐久）⇒ 否则门禁红。

**设计阶段登记（planned，未接线 ✓）**：`vmu.core.storeBackend` 的 `storage-domain` 备选后端目前**没有运行时读者**（红线 4：没有消费者就不给机制）⇒ 该键在 `settings/planned.js` 以 planned 登记，接线前不承诺任何行为；当前 `json-fold` 是唯一实现。

**只回显（display-only ✓）**：`vmu.math.leanInitiative` 会被读到并回显，但**不参与判定**（`kernel/lean.js` 的 `policy()` 自曝 `initiativeEffect:'display-only'`）；它不改变任何行为，`formalVerify` 才是判定时的策略。

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

| `vibe_vmu_conference` | **会议面**（11 动作）：投稿/指派/评审/决议 ✓ —— **只做寻址与调用**（整对象透传 ✓） | `action`(必填，枚举)、`request`、`id` | `conferenceTool` 为真 | 服务的码原样透传 ✓ |
| `vibe_vmu_arbitration` | **裁决面**（13 动作）：回避/听证/裁定/上诉 ✓ —— **只做寻址与调用**（整对象透传 ✓） | `action`(必填，枚举)、`request`、`id` | `arbitrationTool` 为真 | 服务的码原样透传 ✓ |
| `vibe_vmu_charter` | **章程面**（11 动作）：提议/修订/批准/生效 ✓ | `action`(必填，枚举)、`request`、`id` | `charterTool` 为真 | 服务的码原样透传 ✓ |
| `vibe_vmu_recruit` | **招募面**（15 动作）：任期/晋升/试用/招聘 ✓ | `action`(必填，枚举)、`request`、`id` | `recruitTool` 为真 | 服务的码原样透传 ✓ |
| **`vibe_vmu_human`**（轮 2 ✓） | **人工干预 + 审批闸 + 恢复动词**（16 动作）：`status｜veto｜explainVeto｜liftVeto｜observerView｜openApproval｜approvalState｜decide｜withdraw｜queue｜gate｜dashboard｜inject｜recover｜recoverStatus｜readBack` ✓ —— **只做寻址与调用**（审批闸在 `kernel/human.gate`；撤回走 `kernel/human.withdrawApproval`；恢复动词打 `kernel.recovery` ✓） | `action`(必填，枚举)、`request`、`id`、`reason`、`byRole` | `humanTool` 为真（`vmu.human.*`／`vmu.resume.*` 任一声明） | 服务的码原样透传 ✓（`VMU_HUMAN_APPROVAL_PENDING`／`VMU_HUMAN_VETOED`／`VMU_RESUME_*`） |
| **`vibe_vmu_chat`**（轮 2 ✓） | **群聊面**（9 动作）：`send｜list｜policy｜setpolicy｜mute｜unmute｜quota｜admin｜status` ✓ —— 管理员/发言配额/禁言/冻结豁免都由服务强制 ✓ | `action`(必填，枚举)、`from`、`text`、`kind`、`member`、`patch` | `chatTool` 为真（`vmu.chat.*`） | 服务的码原样透传 ✓（`VMU_CHAT_*`） |
| **`vibe_vmu_mailbox`**（轮 2 ✓；PHASE 9 / 轮 2 扩） | **私信面**（11 动作）：`send｜pending｜flush｜ack｜list｜open｜setState｜plan｜anchor｜unread｜status` ✓。★ **非紧急投递只给提示（count/发件人/标题，notice ≤300 字），正文不进提示词**；`list` 行（9 字段，含 `urgent`）不带正文，`open` 返回正文并置 `read:true`，`setState` 改 read/todo；**`ack` 是投递层结算，不等于读过**；紧急只有发送方显式 `urgent:true` 才带正文。 | `action`(必填，枚举)、`to`、`from`、`kind`、`text`、`subject`、`urgent`、`id`、`read`、`todo`、`status` | `mailboxTool` 为真（`vmu.mailbox.*`） | 服务的码原样透传 ✓（`VMU_MAILBOX_*`） |
| **`vibe_vmu_panel`**（轮 2 ✓） | **成员状态面板**（7 动作）：`set｜get｜view｜board｜history｜audit｜status` ✓ —— 总目标/计划/正在执行的子任务 ✓ | `action`(必填，枚举)、`member`、`fields`、`source`、`by` | `panelTool` 为真（`vmu.panel.*`） | 服务的码原样透传 ✓（`VMU_PANEL_*`） |
| **`vibe_vmu_report`**（轮 2 ✓） | **自动汇报 + 参数配置面**（8 动作）：`status｜declarations｜params｜set｜preview｜emit｜tick｜trace` ✓ —— **汇报只报告**（无 timer、不驱动任何决策 ✓） | `action`(必填，枚举)、`name`、`payload`、`key`、`value`、`by`、`reason` | `reportTool` 为真（`vmu.report.*`） | 服务的码原样透传 ✓（`VMU_REPORT_*`） |
| **`vibe_vmu_mathadapters`**（轮 2 ✓） | **数学库适配面**（8 动作）：`probe｜plan｜run｜shapeContract｜status｜keysUsed｜config｜clearBinding` ✓ —— numpy/scipy/pandas/sympy 的会话级环境绑定与形状契约 ✓（★ **单开一面**：`vibe_vmu_mathtools` 的 action 枚举＝`kernel.mathtools` 方法集，不混装 ✓） | `action`(必填，枚举)、`lib`、`op`、`mode`、`expr`、`code`、`fn`、`packages`、`seed`、`timeoutMs`、`args`、`refresh` | `mathadaptersTool` 为真（`vmu.math.adapters.*`） | 服务的码原样透传 ✓（`VMU_MATH_LIB_*`／`VMU_MATH_SHAPE_UNKNOWN`／`VMU_EXTERNAL_UNAVAILABLE`） |
| **`vibe_vmu_mathjobs`**（轮 2 ✓） | **数学作业面**（16 动作）：`submit｜status｜cancel｜receipt｜list｜statusAll｜checkReceipt｜keysUsed｜config｜trail｜recover｜mirrors｜listMirrors｜mirrorRel｜admission｜jobsDir` ✓ —— 超时保留部分输出、镜像四态恢复 ✓（★ **单开一面**，同上 ✓） | `action`(必填，枚举)、`engine`、`argv`、`stdin`、`timeoutMs`、`seed`、`jobId`、`reason` | `mathjobsTool` 为真（`vmu.math.jobs.*`） | 服务的码原样透传 ✓（`VMU_MATH_JOB_*`／`MATH_TIMEOUT`／`MATH_NONZERO_EXIT`） |
| **`vibe_vmu_wait`**（轮 3 ✓） | **活动等待面**（2 动作）：`status｜wait` ✓ —— **一次性 future-only**：等待开始前的通知绝不唤醒、一次通知只唤醒当前一代、超时 disposer 在所有分支清理 ✓ | `action`(必填，枚举)、`timeoutMs`、`why`、`me` | `activityTool` 为真（`vmu.activity.*`） | 服务的码原样透传 ✓（`VMU_ACTIVITY_*`／`VMU_ENGINE_UNAVAILABLE`） |
| **`vibe_vmu_fidelity`**（轮 3 ✓） | **忠实性缺陷面**（6 动作）：`status｜declareDefect｜abstentionFor｜applyAbstention｜loadDefects｜view` ✓ —— `applyAbstention` 是 **C-45 唯一强制点**（布尔票改写为 0.5 弃权，**不可由 pack 关闭**） | `action`(必填，枚举)、`target`、`by`（declareDefect/applyAbstention **必填**）、`note`、`declared` | **`vmu.math.formalVerify ∈ {encourage,require}`**（★ 该面无自己的设置族：强制不可配置；默认 `off` ⇒ 不发布） | `VMU_MATH_INVALID_INPUT`（缺 `by`/`target`/`note`）／`VMU_ENGINE_UNAVAILABLE`（面无接缝） |

<!-- BEGIN GENERATED: service-index -->

### 服务索引（★ **生成**：`node scripts/generate-surface-index.mjs --write` ✓）

> ★★ **每行的用途取自注册调用点的 `description`** ✓（★ 实测 **73／73** 个注册都带它 ✓）⇒ ★★ **所以这张表是推导出来的，不是抄写的** ✓。★ **真源是 `registry.register` 的调用点** ✓。

| 服务键 | 用途（注册点的 `description` ✓） |
|---|---|
| `math_computation` | the inherited math tool, name unchanged (D14) |
| `vmu.activity` | 一次性 future-only 活动等待器：等待开始前的通知绝不唤醒、一次通知只唤醒当前一代、超时 disposer 在所有分支清理（docs/08 原语） |
| `vmu.admission` | postings, applications, probation; job titles map to slots explicitly (S-1, docs/17 搂7) |
| `vmu.alerts` | thresholds, alert-level dedup, silences that still count, SLO tri-state (docs/21 搂5 搂13) |
| `vmu.arbitration` | arbitration: recusal, rationale, advisory vs binding made explicit (docs/17 搂6) |
| `vmu.audit` | append-only audit rows, redaction before storage, counted ring drops (docs/21 搂2) |
| `vmu.auditchain` | tamper-evident audit chain: no hash seam, no hash (N1) |
| `vmu.ballotbox` | ballot box: quorum is refused by name, abstention and absence counted apart (docs/08) |
| `vmu.bidding` | auctions: deadline, rationale, reputation never prices, collusion surfaced (docs/17 搂10) |
| `vmu.board` | board columns, WIP and aging (docs/08 搂4) |
| `vmu.budget` | four-kind quotas, reservation and fairness (docs/08 搂12.5) |
| `vmu.capacity` | capacity: seats per domain, machine-hour pool, overcommit reserve, waitlist and preemption that names the victim (docs/20, 22) |
| `vmu.charter` | charters: frozen articles, authority that cannot exceed the parent, dissolution reasons (docs/17 搂15) |
| `vmu.chat` | group chat: admin list, speech quota and mute are declared, hot-changed and audited (docs/17) |
| `vmu.citations` | citations: the declared style, the required fields, the identifier priority that decides the key, and free text that is off by default (docs/07) |
| `vmu.clockguard` | monotonic clock guard, consumed by every TTL-sensitive service (N3) |
| `vmu.collab` | collab: counterparty register, agreements with expiry warning, data-sharing template, joint authorship and the settlement cycle with reconciliation tolerance (docs/22 §协作) |
| `vmu.commitlog` | the ONE durable commit log shared by the board (kernel/ballotbox.js cast) and the mailbox (kernel/mailbox.js send): a late-bound facade over the host allocating store, one ticket sequence, absent store degrades by name (docs/03 §2) |
| `vmu.compliance` | research compliance: IRB and consent approvals, retention windows, COI disclosure and evidence packs (docs/20, 22; export control stays with domaingate) |
| `vmu.conference` | conference hosting: calls for papers, review quorum, anonymity, registration cap and agenda fit (docs/08; layered on the single-session face) |
| `vmu.control` | control: what may be paused and by which role, the watchdog interval (zero means no timer), what counts as idle and the notice-only default, the degradation ladder, and whether stopping clears the registry (docs/08) |
| `vmu.crypto` | signatures and non-repudiation: no signer means no signature is invented (docs/20 搂6) |
| `vmu.custody` | custody: entry ledger and chain of custody, chain-gap policy, freeze-thaw accounting with a warning threshold, destruction that keeps the reference, subject reference style and an irreversible mapping (docs/22 §2.5) |
| `vmu.delegation` | delegation that can only narrow (S-2), expiry, revocation cascade (docs/17 搂4) |
| `vmu.discipline` | discipline: failure breaker with window and half-open probe, suspension cap, restore that needs a human, and a required post-mortem (docs/17) |
| `vmu.env` | environment adapter: probe/list/report over vmu.env.needs; failed probe is a result; NEVER installs or calls the network (docs/09) |
| `vmu.explain` | explain: report detail, delegation chains and scores, a required reason with a declared length cap, event correlation by the declared key, and markdown or JSON rendering - every omission named (docs/17) |
| `vmu.external` | external fetch adapter: receipts for every fetch, stale never silent, conflicts surfaced (docs/16 搂8) |
| `vmu.fairness` | conserving allocation with a per-person cap; reputation is never a weight (docs/17 搂17) |
| `vmu.fidelity` | 忠实性缺陷强制弃权（C-45，v5r 的 L2 option A）：declareDefect 留痕（append-only，可落 Formal/Defects/<target>.json 并 loadDefects 重载）；abstentionFor 是纯谓词；applyAbstention 是唯一强制点——被登记者在该对象上的布尔票 1/0 一律被改写为 0.5 弃权（不可由 pack 关闭）。 |
| `vmu.formal` | formalisation: sorry refuses by default, compile failure is never a refutation (docs/09) |
| `vmu.funding` | funding: account/currency scope, budget balance, cost-share policy, receipts and settlement windows (docs/13, 22) |
| `vmu.governance` | agenda and motions (docs/08 搂2) |
| `vmu.handover` | handover packets: required fields named, redacted before packing (docs/17 搂11) |
| `vmu.human` | human: veto scope and reason, observer visibility, approval waiting whose declared timeout is hold rather than allow, and dashboard scope (docs/17) |
| `vmu.idempotency` | idempotency ledger: same key with a different payload is refused by name (K6) |
| `vmu.identity` | identity: principal binding, trusted issuers, claim-to-slot mapping, institutional memberships with a cap, pseudonym scopes, end-of-membership disposition and audited reads (docs/17) |
| `vmu.ids` | ids: the one id minter - monotonic across restarts, counters projected durably, never reuses a name (docs/07) |
| `vmu.ip` | intellectual property: disclosure hold, named inventors, priority dates and family duplicates (docs/21-22) |
| `vmu.library` | records, content identity, head list |
| `vmu.lifecycle` | research lifecycle L1-L24: gates delegated to the domain and publication services (docs/16 搂1) |
| `vmu.mailbox` | durable per-recipient mailbox: ack only after a successful delivery, unacked remains redeliverable (docs/17) |
| `vmu.mathadapters` | 数学库适配面：numpy/scipy/pandas/sympy 的会话级环境绑定、结果形状契约与具名拒（docs/09·15） |
| `vmu.mathjobs` | math jobs: timeout with partial output, complete receipts, seed required (docs/09路15) |
| `vmu.mathtools` | math tool policy layer: 45 declared knobs change behaviour, the rest are named as unwired (docs/09路15) |
| `vmu.meetings` | meeting policy layer: all 47 declared vmu.meetings knobs change behaviour (docs/08) |
| `vmu.meetingverdict` | 一场辩论的最终裁定：把各成员的 [0,1] 布尔概率聚合为「全一致取该值、否则取算术平均」，并产出给命题卡持有者的通知载荷（machine-readable，交出给既有 mailbox 面投递）；只属算术与载荷，谁辩论/何时结束/谁是卡主/措辞归 pack（docs/03 §2） |
| `vmu.members` | role slots and roster |
| `vmu.memory` | institutional memory that NEVER authorizes (S-3), contradictions visible (docs/17 搂9) |
| `vmu.metrics` | metric observation, KPI judgement and counted drops (docs/21 搂4) |
| `vmu.middleware` | the hook bus and its four forms |
| `vmu.migration` | migration orchestration: plan, dry-run, batches, confirm, rollback points and windows (docs/07, 13); the storage policy layer owns backends, this face owns the move |
| `vmu.minutes` | minutes, decisions and action items (docs/08 搂2) |
| `vmu.notify` | watchers and delivery: silence blocks delivery, never the record (docs/17 搂29) |
| `vmu.panel` | member state panel: overall goal, plan and running subtasks, append-only with a view audit (docs/17) |
| `vmu.partnership` | legal entities and tax field slots: registration, account binding, invoice slot validation (volume 22 §L285) |
| `vmu.projmigrate` | projection migration: an unlabelled or unreachable old document is refused, never dropped (A3) |
| `vmu.prompt` | prompt sections, bindings, overrides |
| `vmu.publication` | publication: unbroken version chain, offline archive registration, availability that refuses on-request-only (docs/16 搂7) |
| `vmu.ratelimit` | token-bucket rate limiting on the injected clock; unlimited by default and it says so (K2) |
| `vmu.records` | records tracks: caps refuse by name, retention counts, permanent markers cannot be deleted |
| `vmu.replay` | audit replay: pure read-only reconstruction, gaps reported (K5) |
| `vmu.report` | reporting: declarable report triggers (event/period/threshold), content templates, recipients and channels, an off switch whose default declares nothing, an append-only trace, and a parameter-config face whose domain and owners come from settings rather than from the kernel (docs/22 §reporting) |
| `vmu.repropack` | reproduction packs: required members named, seed mandatory, diffs located (docs/16 L12) |
| `vmu.resource` | instrument ledger: calibration currency, trained operators, reservation conflicts and maintenance windows (docs/22) |
| `vmu.resume` | resume: session recovery primitives - read-before-write gate, durable projections with id never reused, named interrupted outcomes (never silently passed), unacked-mail and watchdog refresh seams (docs/07) |
| `vmu.retention` | report-first retention, permanent markers, quota tri-state, gc (docs/07 搂4.3 搂4.8) |
| `vmu.reviewers` | reviewer market: COI recusal, blind mapping with tracing, concurrent load cap (volume 16 §L297) |
| `vmu.scheduler` | scheduled triggers: timer is a seam, triggerVia defaults to report-only (docs/08 搂5) |
| `vmu.skills` | skills: never self-appointed, expiry degrades and says so (docs/17 搂8) |
| `vmu.stateversion` | state versions and explicit migrations: no version is refused, not assumed (N4) |
| `vmu.status` | pack-registered status sections: registerSection returns a disposer, unregisterSection removes by name |
| `vmu.store` | durable, versioned state |
| `vmu.storepolicy` | storage POLICY only: backend/path validation, lock behaviour, backup counting, remote offline policy and the version-too-high stance (no IO; bytes stay with the store seam) |
| `vmu.tasks` | task ledger and stage machine |
| `vmu.teaching` | teaching: outcome-to-artifact alignment refuses with the missing outcome named (docs/22 N13) |
| `vmu.tenure` | personnel rules: recruitment cycle, performance cadence and evidence, tenure decision and quorum, appeals, offboarding and rotation (docs/22; seats stay with members) |
| `vmu.topology` | collaboration topologies and path assertions, describe and assert share one rule (docs/17 搂14) |
| `vmu.transaction` | compensation transactions: a step without undo is refused at begin (K1) |
| `vmu.trust` | auditable reputation that NEVER grants authority (S-3, docs/17 搂5) |
| `vmu.turn` | turn loop: assemble, deliver, parse, dispatch (docs/26) |
| `vmu.work` | durable in-flight ledger (recover after restart) |
| `vmu.workflow` | stage whitelist, gates and escalation, no stage skipping (docs/08 搂4) |

> ★★ 合计 **83** 个服务 ✓。

<!-- END GENERATED: service-index -->
