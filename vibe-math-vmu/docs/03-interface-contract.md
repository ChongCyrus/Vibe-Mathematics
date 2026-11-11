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
| `vmu.library`（有 `root` ✓） | 归档与记忆 | `append(rec,{member?})`、`record(member,track,text)`、`list(filter,{includeTrash?})`、`expand(id,{capBytes})`、`storedFingerprint(id)`、`fingerprint(kind,parts)`、`truncationReport()`、`status()`、**批 3 新增**：`remove({id})`、`removeRevision({id,rev})`、`moveToTrash({id})`、**轮回 230 新增**：`registerVocabulary({tags,aliasTags})`、`checkTags({tags})`、**轮回 231 新增**：`checkReferences({references,known})`、`backlinks(id,{depth})`、**轮回 232 新增**：`checkMetadata({record})`、`provenanceOf({inputs})`、**轮回 233 新增**：`indexHealth()`、**轮回 234 新增**：`exportRecord(id,{format?,includeHistory?,allowInternal?})`、**轮回 236 新增**：`search({text,filter?,analyzer?,maxResults?,snippetLen?})`、**RUN 200 新增**：`resolvePointer(pointer)`（把卡上的 `proofRef` 按**库根**解析成 `{ok,exists,reason,absolutePath,relativePath,anchor}`；`ok` 只表示「库回答了」，`exists` 才是「文件在不在」——同步方法，因为召集路径是纯谓词且不能变成 async）、`restore({id})`、`listTrash()`（**永久标记保护＋删除留痕＋不静默成功** ✓，全部经 `guardWrite` ✓） | 1 |
| `vmu.members` ✓ | 成员与角色**槽位** | `roles()`、`roster()`、`hire({id,slot})`、`assignRole(id,slot)`、`end(id,reason)`、`wake(id,ask,{role?,phase?})`、`may(id,permission)`、`selfReport(id,fields,{by?})`、`selfReports()`、`selfReportHistory(id)`、`noteWake(id)`、`status()` | 1 |
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
| `vmu.library` | `search({text,filter,analyzer,maxResults,snippetLen})→{ok,analyzer,query,hits,total,dropped,snippetLen,enforced,fired}`（**轮 236：analyzer【真的改变什么算命中】✓；上限咬合【计数丢弃】✓；片段越界加省略号并自曝** ✓）／`exportRecord(id,{format,includeHistory,allowInternal})→{ok,format,visibility,history,text|manifest}`（**轮 234：`internal` 默认【不可静默导出】✓；格式三者具名拒他者 ✓；历史【计数上报】** ✓）／`indexHealth()→{read,deferred,unreadable,missingId,limit}|null`（**轮 233：一次重建【读了什么、延后了多少、哪些读不到】全部自曝** ✓）／`checkMetadata({record})→{ok,strictness,customPrefix,custom,unknown,reported,enforced,fired}`（**轮 232：三值严格度；未知字段在 warn 下【列出】而非消失** ✓）／`provenanceOf({inputs})→{ok,depth,kept,dropped,inputFingerprint,enforced,fired}`（**轮 232：深度有界且【计数丢弃】** ✓）／`checkReferences({references,known})→{ok,references,dangling,reported,enforced,fired}`（**轮 231：悬空引用按 `vmu.refs.danglingPolicy` 拒或列出，绝不静默** ✓）／`backlinks(id,{depth})→{ok,levels,backlinks,enforced,fired}`（**轮 231：按 `vmu.refs.backlinkDepth` 广度优先** ✓）／`registerVocabulary({tags,aliasTags})→{ok,vocabulary,aliases,controlled,aliasTable,enforced,fired}`（**轮 230：受控词表登记** ✓；本面**不自行读标签文件** ✗）／`checkTags({tags})→{ok,tags,controlled,maxDepth,aliasTable,enforced,fired}`（**轮 230：深度／受控词表／别名三关，越界【具名拒】** ✓）／`fingerprint(kind,parts)→hex`（**单点计算** ✓）／`append(rec,{member?})→{ok,id,fingerprint,deduplicated}`／`record(member,track,text)→{ok,file}`／`list(filter)→Head[]`（**七键、不含正文、行数上限＋计数** ✓；新增 `{includeTrash?}` ✓）／`expand(id,{capBytes})→{ok,head,body,truncated,path}`／`resolvePointer(pointer)→{ok,pointer,relativePath,absolutePath,anchor,exists,isFile,bytes,insideLibrary,reason,means}`（**RUN 200：`empty`／`absolute`／`escapes`／`missing`／`file` 五档具名；`exists` 与 `ok` 分开说，不把「库回答了」当成「文件存在」** ✓）／`storedFingerprint(id)→{ok,id,fingerprint}`（**读回而非重算** ✓）／`truncationReport()`／`status()`（**异步** ✓）／`remove({id})`／`removeRevision({id,rev})`／`moveToTrash({id})`／`restore({id})`／`listTrash()`／`commitRevision({id,by,reason?})`／`revision({id,rev})`／`revisions({id,limit?})` | `VMU_NO_SUCH_OBJECT`／`VMU_INVALID_ARGUMENT`／`VMU_RETENTION_CONFLICT`（永久标记 ✗）／`VMU_IO_FAILED`（带 `step` ✓） |
| `vmu.members` | `roles()`／`roster()`／`hire({id,slot})`／`assignRole(id,slot)`／`end(id,reason)`／`wake(id,ask,{role?,phase?})`（**注入接缝**；缺则具名拒 ✓）／`may(id,permission)`（**只做包含判断** ✓）／**`selfReport(id,fields,{by?})`**（轮 132：成员**自述** `overall`(必填)／`subgoal`／`plan`／`status`，**只追加** ✓、**未知字段具名拒** ✓、`by` 记为审计事实而**不发明策略** ✓）／**`selfReports()`**（每人**最新**一条 ＋ 更新计数）／**`selfReportHistory(id)`**（该成员**只追加**历史，**最旧在前** ✓）／**`noteWake(id)`**（★ RUN 189／FEEDBACK33 1.1：花名册 `wakes` 的**写入者** —— 成员回合打开时由 `kernel/turn` 的 `onTurnOpen` 接缝调用；run 34 实测 11 个回合、四席都醒过而每行 `wakes` 恒 0，原因就是它只有读者没有写者）／**`snapshot()`／`restore(v,{replace?})`**（★ 轮 2：耐久投影的 state 适配对 ✓；★ **轮 538**：`restore` 对**非空**花名册拒绝一份不同的快照（`VMU_RESUME_RESTORE_CONFLICT`，「不静默半覆盖」），而**重载 seam 传 `{replace:true}`** —— 重载时磁盘即权威，否则后启内核 reload 成功也会被拒、花名册永久陈旧（实测断点 3，见 `docs/acceptance/phase12-v5r-rules-conformance.md` §104））／`status()` | `VMU_RESOURCE_BUDGET`（**报当前数与上限** ✓）／`VMU_NO_SUCH_OBJECT`／`VMU_STATE`／`VMU_ENGINE_UNAVAILABLE`／`VMU_INVALID_ARGUMENT`（自述缺 `overall` 或含未知字段 ✓）／`VMU_RESUME_RESTORE_CONFLICT`／`VMU_RESUME_SNAPSHOT_VERSION`／`VMU_RESUME_SNAPSHOT_INCOMPLETE` |
| `vmu.tasks` | `create({title,objective?,owner?,deps?,priority?,writeScopes?})→{ok,id,state,deps,writeScopes,skippedScopes}`（★ 轮 5／F39：`writeScopes` 是 **advisory** 写域，非法范围**具名**进 `skippedScopes:[{what,why}]`，绝不静默丢 ✗）／`setPriority(id,priority,{expectedRevision?,by?})→{ok,id,priority,previous,revision}`（★ 目标 8 补的能力：之前 `priority` 只能在 `create` 时定、`list()` 按它排序、而没有任何操作能改已有行；现在能了，且与其它变更同一套 compare-and-set 并记 `task-priority-set` 审计 ✓）／`assign(id,who)→{ok,id,owner,state,mayObject,enforced}`（轮 10：回执点名 `vmu.tasks.memberMayRejectAssign` 是否开着）／**`objectAssign(id,{by,why})→{ok,id,state,owner,objection,broadcast,enforced,fired}`**（★ 轮 10／v5r `reject_assign`（`:9555-9562`）：成员对被分派**表示异议**——**记录在面自己的只增台账**（`history()` 里 `assign-objected`，随投影耐久）且**任务仍执行**；`vmu.tasks.memberMayRejectAssign=false` ⇒ **具名拒**（v5r 当时**静默忽略**该字段，vmu 刻意更严 ✗✓）；广播**没有**已登记钩子 ⇒ 回执**具名**说明（不假装广播过））／`transition(id,to,{reason})`／**`setDependencies(id, deps, {expectedRevision?})→{ok,id,deps,revision}`**（★ 轮 5／F35：**改边**动作——两节点环与长环只能由此产生；成环 ⇒ `VMU_TASK_DEPENDENCY_CYCLE`，`detail.cycle` 给环路径 ✓；`expectedRevision` 不符 ⇒ 具名拒 ✓）／**`writeScopeConflicts()`**（只读：写域重叠对；读者＝`tasks.status()` ✓）／`list()`／`stage()`／`advance({to,reason})`（**先过 `stageGate`** ✓）／`rollback({reason})`／**`brief(id)`／`briefOf(id)`／`clearBrief(id)`**（任务简报＝给该任务负责人的执行流程 ✓）／`history(id?)`／`status()`／**`snapshot()`／`restore(v)`**（★ 轮 2：耐久投影的 state 适配对；`restore` 会校验快照再回填 ✓） | `VMU_STATE`（依赖未满足／非法转换／**暂停中** ✓）／**`VMU_TASK_BLOCKED`**（run 229：带未完成 blocker 的认领**具名拒并逐个点名 blocker 与 state** ✓；hint 只给"做到 done"或"删边"两条真出路 ✓）／`VMU_RESOURCE_BUDGET`／**`VMU_TASK_DEPENDENCY_CYCLE`**（★ 轮 5：依赖边成环 ✓）／`VMU_RESUME_RESTORE_CONFLICT`（恢复冲突 ✓）／`VMU_RESUME_SNAPSHOT_VERSION`／`VMU_RESUME_SNAPSHOT_INCOMPLETE`（快照版本/缺字段 ✓） |
| `vmu.paper` ✓（轮 135：多成员合著编排 ✓） | `start({title,sections,contributors,editor})`（**每节必须有人认领** ✓，无主章节具名拒 ✗）／`contribute({paperId,section,by,artifact?})`（**归属机器强制** ✓：只有 owner 能交，且**只交一次** ✗ 不静默覆盖）／`finalize({paperId,by})`（**异步** ✓；缺节**逐节点名到人** ✓；`vmu.paper.finalizer` 决定谁可定稿 ✓；**登记委托给注入的 `register` 接缝** ✓，缺接缝即具名拒 ✗）／`status(paperId?)`／`keysUsed()`／`partition()` | `VMU_INVALID_ARGUMENT`（无标题／无章节／重名／**无主章节** ✓）／`VMU_NOT_PERMITTED`（非 owner 交付 ✓／非允许的定稿人 ✓）／`VMU_STATE`（已交／已定稿／缺节 ✓）／`VMU_NO_SUCH_OBJECT`／`VMU_ENGINE_UNAVAILABLE`（**缺登记接缝** ✓） |
| `vmu.turn` ✓（轮 339） | `open({member,phase,task,round})`／`assemble(turn)`（**交给管线** ✓，**缺则具名拒** ✗）／`deliver(turn,text)`（**宿主缝**；缺则具名拒 ✓）／`parse(text)`（**三种失败三种名** ✓）／`plan(reply)`（**纯函数** ✓）／`apply(reply,faces?)`（**计数未接线** ✓）／`run(spec)`（**一轮跑完** ✓）／`status()` ✓ | 轮次编排 26 |
| `vmu.status` ★ PHASE 7 | `registerSection(name, fn)→disposer`／`unregisterSection(name)→{ok,name,removed}`／`names()→string[]`；`kernel.status().sections.<name> = {ok,value|code,message}`，**无注册 ⇒ 无 sections 段**（零机制）；同名注册具名拒 | `VMU_INVALID_ARGUMENT`／`VMU_ENGINE_UNAVAILABLE` |
| `vmu.prompt` | `register(s)→entry`／`bind(binding)→{section,dim,total}`／`disable(name)→{ok,disabled}`／`enable(name)`／`assemble(ctx)→{ok,text,sources[],truncation[],at}`／`override(section,text,by)→{ok,previous}`／`rollback(section)`／`snapshot(scopes)`／`bindToHost(adapter)`／`setState(text)`／`status()→{sections[],bindings,truncation[],middlewareAppends[]}` | `VMU_NOT_PERMITTED`／`VMU_INVALID_ARGUMENT`／`VMU_NO_SUCH_OBJECT`／`VMU_ENGINE_UNAVAILABLE` |
| `vmu.middleware` | `status()→{dryRun,hookTimeoutMs,breakerThreshold,entries[],hooks[]}`／`entries()`／`disable(id,reason)`／`enable(id)`／**`declareTopic(name)→{ok,topic,existing}`（协议扩展点：冻结集之外的新钩子主题必须先声明才可 emit ✓，名字非法即具名拒 `VMU_INVALID_ARGUMENT` ✓）**／**`retractTopic(name,{by})→{ok,topic,removed,stillDeclared,owners}`（★ **PHASE 6 / 目标 3**：按 **owner** 撤回声明——同一主题还有其他 owner 时仍然声明 ✓；包卸载的 undo 调它，所以"卸载"与"仍注册"不再同时成立 ✓）**／**`retractTopicsOwnedBy(by)→{ok,removed,count}`（★ 撤回某 owner 声明的**全部**主题；pack.js 在 apply 时按 `topics` 字段声明、卸载时按同一 owner 撤回 ✓）**／`setDryRun(v)`／`isDryRun()`／`emit(hook,payload,{scope?,traceId?,member?,role?,phase?,bridge?})→{ok,decisions[],traceId,refused?,aborted?,decision}`（**命名空间感知的成员校验** ✓：`member/turn/meeting/ballot/record/task/prompt/budget/pack/settle/control` 这 11 个 **vmu 命名空间**里的未知名**具名拒** ✓；**宿主命名空间**（如 `tools/pre-execute`／`fs/write-intent`）**放行** ✓ —— 那是基座的词汇 ✓；注意 `prompt/assemble` **属宿主词表** ⇒ 这正是为何**不能整表放行** ✗（放行就等于把已修的漂移 bug 放回 ✗）；`bridge:true` 只用于宿主瀑布桥 ✓）／`on(entry,handler)→id`／`add(entry)→entry`／`trace(traceId)→Trace[]`／`wrapHostWaterfall(next)→async(payload)`／**`rewriteOf(hook,emitted)→string|null`**（★ **PHASE 6 / K10**：★ **`.rewritable` 的第一个读者** —— 把决策里的 `rewriteResult` 取出来给调用方应用；★ 三态都显式：★ 没人要求⇒`null`／★ 合法⇒返回（★ 后者胜，★ 因为 `order` 已决定谁最后跑）／★ **在【非 rewritable】钩子上改写 或 值畸形 ⇒ 具名拒**（★ 绝不静默）✓ 首个消费者＝`turn/index.js` 的 `turn/reply-parsed` ✓） | `VMU_MIDDLEWARE_FAILED`／`VMU_MIDDLEWARE_REJECTED`／`VMU_INVALID_ARGUMENT` |
| `vmu.store` | `open(expected)→{opened,version,migration?}`／`read(key)→Value`（**克隆** ✓）／`refresh()→{ok,stamp,coherence,reloaded,why}`（★ layer 4（docs/07 §1-(5)）：**显式**重读——它是一次**请求**而不是推断，所以 `coherence:'off'` 下也照做 ✓）／`onReload(fn)→Disposer`（★ layer 4 第二半：本实例**每次重载后**回调，返回撤销器；装配层（`kernel/index.js`）注册它，好让投影在别的实例写入后重新 snapshot —— **"文件重载了、服务还是旧的"**正是 run 13 测到的缺陷 ✓）／`write(key,value)→{ok,key,version,changed}`／`patch(key,fn)→同左`（**fold 内函数式** ✓；★ **R31／task-17**：`open`/`migrate`/`import` 与 `write`/`patch` **共用同一把文件锁**——此前 `open()` 只直接 `readFile`，撞上另一实例在飞的 `rename` 就在 Windows 上 `EPERM` 并**按旧文件开机**，实测 400 组里 259 次丢写；现在写路径遇瞬态码（`EPERM`/`EBUSY`/`EACCES`/`ENOTEMPTY`）会**先重读磁盘再合并重试整轮**（≤3 次），耗尽则抛具名 `VMU_STORE_FAILED` 并**明说该写未被确认**，成功回执只在真的重试过时带 `attempts`）／`subscribe(key,fn)→Disposer`／`migrate()`／`export()→Snapshot`／`import(snapshot)`／`stats()`（含 `writeRetries`/`writeRetryGiveUps`/`writeRootGone`，让"重试过几次、是否放弃过、是否有写落在已消失的目录上"可读而不是靠猜；★ **R32／task-20**：落盘目录被删后再写，`persist` 以 `VMU_STORE_FAILED` + `reason:"root-gone"` + `cause` **具名拒绝并明说该写未被确认**，且把从未落盘的值从内存折页**回滚**——此前这种写只留下一个无人处理的 rejection，会直接把进程打死） | `VMU_STORE_FAILED`（含**写未被确认**的具名情形与 `attempts`）／`VMU_STORE_MIGRATION`／`VMU_INVALID_ARGUMENT`（未登记键 ✓） |
| `vmu.commitlog` ✓（轮 9／**G7**） | `durable`（**getter**，布尔：有合格 store 才真）／`reserve(op)→rec\|null`（**意图先于生效**，返回带 ticket 的记录；无 store ⇒ `null`）／`complete(rec,outcome)→ticket\|null`（结果落在**意图的 ticket** 上）／`status()→{shared,name,durable,tickets,appended,done,recoveredAt}`／`resolveState()→{durable,bound,failure}`（**观测**：`failure` 把"解析器抛错"与"没给 store"**分开**） | 无（**缺席不是拒绝**：`durable===false` 且 `reserve()` 返回 `null` —— 具名降级，两个面照常工作）。解析器抛错 ⇒ `failure.code === 'VMU_COMMIT_STORE_FAILED'` |
| `vmu.meetingverdict` ✓（phase 12／**D15**） | `aggregateVerdicts({verdicts,propositionId?,at?})`（**纯函数** ✓：每行 `{member,p,reason}`，`p` 必须是 `[0,1]` 内**有限数**、`reason` 必须非空、成员不得重复、空集具名拒 ✗）⇒ `{mode:'unanimous'\|'mean', proposition, value, exact, rounded, valueSource, decided, estimate, n, perMember, spread, keys:[]}`（**全一致 1/0 ⇒ 就是该值**；否则**算术均值**，且 `estimate:true` 说明"均值不是裁定" ✓；写入值取 6 位 `rounded`，`exact` 同时给出 ⇒ `0.30000000000000004` 永不进卡 ✓）／`rulePropositionProbability({verdicts,propositionId,owner,from?,template?,at?})` ⇒ 聚合 ＋ `notice{from,to,about,kind:'verdict-ruling',value,mode,perMember,text}`（**machine-readable** ✓，投递给**既有** mailbox 面，本模块不开第二通道 ✗）／`status()`（自证：算了几次/裁了几次/拒了几次/投递成败） | `VMU_INVALID_ARGUMENT`（空集／非数字／NaN／越界（含百分数 80）／无 reason／重复成员／缺 `propositionId`／缺 `owner`／`from` 非字符串／空模板／**跨命题**：一组裁决指向多个命题、只有部分行标了命题、或裁决所指命题与裁定目标不一致 —— 全部**指名到人**，绝不取均值 ✗） |
| `vmu.work` | `start({owner,kind,objective})→{ok,entry}`／`settle(id,{outcome})→{ok,settled,remaining}`／`interrupt(id,reason)`／`recover({reason})→{ok,recovered,entries[]}`／`list()`／`pending()`／`interrupted()`／`status()` | `VMU_STATE`（**暂停中** ✓）／`VMU_NO_SUCH_OBJECT`／`VMU_INVALID_ARGUMENT`／`VMU_STORE_FAILED`（store 未 open ✓） |
| `vmu.meetings` ✓（轮 12／**`boxFor` 绑定**） | `open({id?,type,chair,roster,size,materials,kind,at})`（★ **A1／轮 10**：显式 `id` 现在被接受；与活会重名 ⇒ 具名 `VMU_CONFLICT`）／`motion({meeting,member,kind,text,materials,at})→{ok,motion:id}`／`vote({meeting,member,motion,value,at})→{ok,tally,counted,tallyNote,quorum,receipt,enforced,enforcedScope}`（★ **R15 诚实化**：`motion` 缺省时**没有可计数的容器** ⇒ `tally:null` ＋ `counted:false` ＋ 具名 `tallyNote`，**绝不再回 `{for:0,against:0,abstain:0}`** —— 那个"看着像真的"的计数与同一调用真写了 minutes、真涨了 `counters.votes` 的事实互相矛盾；**真正的 open-ballot 容器是 `vmu.ballot`／`vmu.ballotbox`**，走工具面 `action=ballot→vote→tally`／`boxopen→boxcast→boxclose`）／**`flow({meeting,mode,by,why})`**（B④ 地面四模式 `open｜hands｜round_robin｜call_on`；未知/已合并名 ⇒ `VMU_INVALID_ARGUMENT`）／**`overrideOrder({meeting,by,why,mode})`**（B③ 发言序覆盖 `fifo｜round-robin｜chair｜random`）／**`orderView({meeting})`**（只读：当前生效规则＋它给出的 queue 序）／**`order({meeting,members,by})`**（★ **RUN 229 / E16**：**写**——本会主席按给定顺序**整体重排**发言队列，回执带 `before`／`after`／`moved[{member,from,to}]`／`dropped` 与 minutes 的 `floor-order` 行；非主席 ⇒ `VMU_NOT_PERMITTED`，无主席 ⇒ `VMU_ENGINE_UNAVAILABLE`，**缺席席位** ⇒ 具名 `VMU_NOT_MEMBER`（hint 指明先 `attend()`，`lateAdmission:"chair"` 下由主席 `admit()`）；`round-robin`／`random` 每次重算、存不住列表 ⇒ 具名 `VMU_STATE`；**不给 `members` 时工具面仍走 `orderView`**，只读形状一字不变）——★ **前两者的闸同一条**：**仅该会主席**、**必须 `why`**、**部署须声明 `vmu.meetings.orderMode`**（未声明 ⇒ `VMU_ENGINE_UNAVAILABLE`），覆盖一旦在force `queue()` 就**不再读**该键（`enforced:[]`，`modeSource:'override'`）（★ 投票镜像在 **`receipt.receipt.ballot`**：`{mirrored,reason,boxId?,code?}`）／**`bindBox(fn\|null)→{ok,bound,replaced,at,changes,note}`**（★ 轮 12 裁决 (i)：**`motion → box` 的绑定是【方法】不是清单字段** —— 策略在 pack，本面**只调用**回调，从不自己开箱/造映射；可**换绑**、可**解绑**、**可自曝**）／**`boxBinding()→{bound,source:'injected'\|'method'\|null,at,changes}`**／**`second({meeting,motion,member})`**／**`close({meeting,report,actions,at})`**（收束后进归档）／**`meetingView({meeting})`**（动议状态；★ **轮 18**：回执带 `spokeBy`/`spokeByMeans` —— 「谁在这会里发过言」是**事实**，读状态面就能看见）／**`spokeBy({meeting})`**（★ **轮 18** 新增：`{ok,meeting,spokeBy,spokeByCount,source:"minutes-entries"}`，**直接读会议自己的 `minutes.entries`**，不读被 `vmu.meetings.minutesDetail` 塑形、且最多 20 条的 `minutes()` 视图 —— 闸判「谁必须表态」时不能读一个**展示层**；`minutes()` 同时修掉了「`ms:0` 的无上限发言被整句过滤掉」的旧缺陷）／**`wait({meeting,member,until,timeoutMs,reason,at})\u2192{ok,armed,waiter,deadlineAt,replaced,waiters,waitMeans,enforced}`**／**`unwait({meeting,member,why,at})\u2192{ok,cancelled,waiter,alreadySettled,waiters,unwaitMeans}`**／**`sweepDue()`**（★ **RUN 239-D · 等待是登记的，等待者是被唤醒的**：`wait` 把一个「我在等这场会的某个事件」写进会议自己的 **waiters 表**（`until` 九值 `speak|vote|motion|poll|phase|attend-all|hand|meeting-closed|deadline`，其它值具名 `VMU_INVALID_ARGUMENT` 并列出九值；`timeoutMs` 缺省 `null` ＝ 只等事件、无期限 —— 「没有期限」是事实不是零）；重复登记不抛，旧行落 `cancelled`/`cancelledBy:"replaced"` 并点名被换掉的行。**唤醒不是一个承诺，是一次投递**：12 个结算点（`proceed`/`attend`/`admit`/`speak`/`hand`/`motion`/`second`/`vote`/`recess`/`resume`/`close`/`extendlimit`）在事件发生后把 `firedWaiters[{member,until,id,wake}]` 挂到**触发动作自己的回执**上，`wake` 说清这次的通道（`via:"seam"|"mail"|"none"`）；`deadline` 由 `sweepDue()` 的过期扫描触发（心跳在调），回执 `expiredWaiters/expiredWaitersCount/expiredWaitersMeans`。★ **真机部署里的唤醒通道是回合循环**（`members.wake` 需要唤醒形状的传输；内核的 `deliver` 选项是**报告**传输，把唤醒信封交给它是形状错误）⇒ 席位没有常驻进程，唤醒＝**开这一席的回合并把提示词交给交付接缝**；异步投递时 `wake.pending:true`，`waiter.wake` 之后原地结算为 `{delivered,woken,settledAfterReceipt:true}` 并发 `meetings/woken-after-receipt`，**绝不**先声称「已唤醒」；唤醒失败按 `wakeFailurePolicy`（`refuse|skip|retry`）处置，而**事件本身不回滚**。读面：`summary`／`status` 的 `waiters` 四态 `armed|fired|expired|cancelled` 与 `waitersCount/Armed/Fired/Expired/Cancelled`；`waitStates` 讲的是「这一轮谁在等」，`waiters` 讲的是「谁登记了、谁被唤醒」，两件事不许混成一句。`sweepDue()` 只过期**真的带了期限**的行（`Number(null)===0` 曾把无期限的行当 epoch 全标过期）／**`summary({meeting})`**（★ **A1／轮 10**：动议＋逐票 `tally`，活会与归档会都可读——此前本服务没有 summary，调用方只能从 minutes 反推）／**`eligibleVoterIds()`**（★ **A1／轮 10**：按声明的表决席返回 `{restricted,seats,ids}`；`restricted:false` ＝ 未声明席别）／`status()`（含 `boxBinding` 与 `durableMarker`）／`openMeetings()`（★ **A2／轮 1**：工具面 `vibe_vmu_meeting` 的 `list`／`status`／`speak`／`close` 现在**先找逐对象原语、找不到再回落到本服务**；`list` 返回 `meetings`（原语）＋`serviceMeetings`（本服务）＋`unionMeetings`（并集），服务侧回执带 `registry:"service"`，本服务的收束进归档（回执带 `closeSemantics`）；两处都没有 ⇒ 具名 `VMU_NO_SUCH_OBJECT` 且 hint 列出两个 id 空间）／… | `VMU_INVALID_ARGUMENT`（`bindBox` 收到非函数非 null ⇒ **具名拒**：不能作答的绑定＝要防的静默）／**`VMU_MEETING_BOX_UNWIRED`**（未绑／已解绑时投票：**具名**，绝不静默）／`VMU_MEETING_BOX_UNMAPPED`（绑了但回 null）／`VMU_MEETING_BOX_BINDING_FAILED`（回调抛且**自带码优先**）／`VMU_NOT_MEMBER`／`VMU_MEETING_BOX_*` 见 §8 |

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
> ★★ **F53 · `node:fs` 与策略 fs 的边界（具名 ✓）**：**用户给的相对路径一律走策略缝** —— `host-math.js` 的 `under()`（绝对化 ⇒ `guardWrite({settings, root, target})` ⇒ 越界**具名拒** `VMU_PATH_ESCAPE_REFUSED`／`VMU_NOT_PERMITTED`）✓；**直接 `node:fs` 的模块清单不在这句散文里手抄**（✗ 手抄必过期：本条曾写「只出现在三处」，而实测的导入者远超三处、还含 `node:fs/promises` 的读者 —— 数字写进散文就会烂掉）⇒ **以 F53 门禁的扫描结果为准**：`tests/audit-fs-purpose.test.mjs` 扫 `vibe-math-vmu/` 下每个 `.js` 的**语句位置**导入（注释与数据字符串里的同名字符串**不算** ✓），断言「导入者集合 == 已登记表 ∪ 自带 `fs-purpose: <kind>` 标记的文件」—— **集合相等**（新导入者没声明用途即红 ✗，登记过期同样红 ✗），并有**两处内部自探针**（`tests/audit-fs-purpose.test.mjs:73-94`）＋一次**种违规文件 ⇒ EXIT=1、删掉同一路径 ⇒ EXIT=0** 的实证（`docs/acceptance/04-parity-matrix.md:13`）✓。★ **合规用途只有三种**：`guard`（守卫自身必须读文件系统才能**判定**）、`audit`（**框架自己的**审计锚点／日志／自己的产物，`root` 之下）、`self-audit`（**包内只读**自审）；每种都要在注释里**写明是哪一种**（标记须在导入上方 3 行内，见 `tests/audit-fs-purpose.test.mjs:63-71`）✓。★ **规则**：其余一律走注入的 fs 缝 ✓ —— 于是「到底哪几个模块用直接 fs」**不靠人记清单**：清单由门禁算出，没标记的新导入者会让它变红 ✓。
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
| `vibe_vmu_set` | 改一个设置；未声明的键一律具名拒；回执含**热改等级对应的生效时机**与来源 | `key`(必填)、`value` | 有声明键时 | `VMU_INVALID_ARGUMENT`、`VMU_NOT_PERMITTED`（H3）、`VMU_PACK_CONFLICT` | ★ R89：`vibe_v5_meeting` 的 `at` 接受 epoch 毫秒、ISO-8601 或**相对偏移**（`"+90s"`/`"+5m"`，内核用自己的钟换算——代理没有自己的钟）。★ R101：`vibe_v5_meeting` 的 `durationMs` 让**院士自己定这一场的上界**（整数 ms，钳制 300000–7200000，越界具名拒；回执读回 `wallLimitMs`/`wallLimitMsSource`，`status`/`summary` 事后也读得到）；`extendlimit` 在它之上再延长。★ R87：`vmu.meetings.verdictMaxRounds` 是**具名活读键**（`kernel/index.js` 的 `LIVE_READERS_EXACT`；`kernel/meetings.js` 每次动议重读）⇒ 回执报 `liveReadBy:["kernel/meetings …"]`、`requiresRestart:false`；同族其它键仍按家族承诺在构造期读。
| `vibe_vmu_middleware` | 中间件：`action=list\|disable\|enable\|validate\|dryRun`（**validate/dryRun 只读、无副作用** ✓） | `action`(必填，枚举)、`id`、`rule`(M1 规则 JSON)、`samples`(事件样本 JSON 数组) | 有声明条目**或**总线已有条目 | `VMU_INVALID_ARGUMENT`、`VMU_NO_SUCH_OBJECT` |
| `vibe_vmu_records` | 记录面：`action=list\|get\|expand\|append\|status\|prune\|restore\|reindex`（`get` 与 `expand` 是**同一个实现**——按 id 取正文，`get` 只是任务书与文档惯用的名字；两处名字、一个读者）；`status` 是**有界的**共享折入/计数器视图：`shared.adoptedWithoutAuthor`、`shared.scope` 说明计数器属于**本内核实例**，`shared.staleLiveRows` 是被拒绝采纳的陈旧 live 副本数，`shared.tombstonesAdopted` 是**从折入面采纳的、本实例没剪过的墓碑数**，`records.trashed`/`records.trashedByTrack` 是回收站按轨计数（prune 回执承诺的正是这个数），`asOf`（viewAt/foldPullAt/foldSyncAt）说明**这条读数是哪个时刻的账**——`status` 先折入面再计数，两个内核数字不同时先比 `foldPullAt`，`foldWrites`（pending/ackedAt/failed）说明本实例还没落盘的快照写、join point 是内核接缝 `flushRecordsFold()`，见 docs/26 ROUND 69/70、ROUND 171、ROUND 173、ROUND 174；★ `prune` 把**某条轨的最旧行**移入 **TRASH**；`restore` 按 id 把它复原到 `purgeAt` 之前 —— 两者合起来才是"轨满"拒绝语里那条**真实可达**的腾空间通路，见 docs/26 ROUND 168）；★ `reindex` 把**文件**当真相：扫描 `<库根>/Shared/*.md` 等文档路径，与索引行按 `mdFingerprint`（sha256）对账 —— 文件被手改过就重建那一行（`changed[]` 里给 `rowChoice` 说明选行依据）、文件还在索引没了就 `restore` 到活行（`adopted[]`）、索引有文件没了报 `missing[]`、两边都没有的路径报 `untracked[]`；`dryRun:true` 只报不写。写完一行都要带 `mdFingerprint`，所以「外部编辑」与「工具写」从此可分辨；`by` 缺省依次取显式 `by`、当前回合席位、`office`（★ RUN 2691：`list` 默认每行带 `writtenFrom`（`own-turn`／`relayed`／`unknown`，写时由 `records.beginTurnCaller` 单一现场记下——所办代写不再与成员亲写同形）；它**不叫** `writerSource`（那个名字继续只答「哪个字段答的」）；`withWriter:false` 省略行字段并在回执写 `writtenFromOmitted:true`，见 §3.1g R1） | `action`(必填)、`id`(expand/restore；restore 可逗号分隔多个)、`kind`、`statement`、`proof`、`track`、`keep`、`why`、`by`、`dryRun`、`withWriter` | 有 `root`（耐久库在场） | `VMU_INVALID_ARGUMENT`、`VMU_NO_SUCH_OBJECT`、`VMU_QUOTA_EXCEEDED`、`VMU_RETENTION_CONFLICT` |
| `vibe_vmu_direction` ★ ROUND 236 / task-28 | **方向卡**：`action=set\|get\|list` ✓ —— **规则 G10／G13／G14 的共用载体**（九类字段：当下评价、初始计划、相关计划、可行性、价值、发现、障碍、历史、可复用；其中五类必填）✓ ★ **不是门禁、不评分**：只保证有地方写、写得进、读得回、缺了会说缺 ✓；一张卡就是 `state` 轨上的一行 `records`（`kind=route`，正文是既有的 `vmu-md/1` 形状）✓ —— **没有第二套存储、没有第二个 IO** ✓；`set` 更新**同一张**卡（`id=dir-<方向键>`，经 `records.supersede` 保留版本轨迹；回执给 `mode:created\|updated`）✓；`get` 让九个字段**全部出现**（没记的是 `null`，另给 `fieldsMissing`／`fieldsMeans`／`labels`／`revision`／`previousRevisions`）✓；`list` 给方向键／更新时间／缺字段数 ✓ | `action`(必填，枚举)、`direction`、九个字段（`current_assessment`／`initial_plan`／`related_plan`／`feasibility`／`value`／`findings`／`obstacles`／`history`／`reuse`）、`by` | 有 `root`（耐久库在场：卡落在 `records` 的 `state` 轨上；裸内核 ⇒ 不在面上，声明了也是具名不可达） | `VMU_DIRECTION_INCOMPLETE`、`VMU_INVALID_ARGUMENT`、`VMU_NO_SUCH_OBJECT`、`VMU_ENGINE_UNAVAILABLE` |
| `vibe_vmu_script` | M3 脚本：`action=list\|run`（结果**只回调用方**，不进提示词） | `action`(必填)、`id`、`args`(JSON 数组字符串) | profile 行声明了 `config.scripts` | `VMU_NO_SUCH_OBJECT`、`VMU_INVALID_ARGUMENT`、`VMU_ENGINE_UNAVAILABLE` |
| `vibe_vmu_pack` | 整合包：`action=list\|plan\|apply\|unload`（**`plan` 是纯报告** ✓、`apply` 冲突即具名拒、`unload` 逐个回滚） | `action`(必填，枚举)、`id`(unload)、`manifest`(内联 manifest JSON) | profile 行声明了整合包（`config.packs` 或 `vmu.packs.active` 非空）。**无声明 ⇒ 不出现** ✓（零机制不受管理面豁免 ✓） | `VMU_INVALID_ARGUMENT`、`VMU_PACK_*` |
| `vibe_vmu_control` | 控制流：`action=status\|pause\|resume\|stop\|beat\|roster\|hire\|fire\|tune`（**暂停是真门禁**：任务新建/转换被 `VMU_STATE` 拒 ✓；`beat` 是心跳，`stale` 由 `vmu.limits.wallClockMs` 判 ✓；`roster/hire/fire/tune` 是成员/控制面；★ **权威 enum 在 `tools/control.js`**） | `action`(必填，枚举)、`reason`(pause/stop)、`note`(beat)、`member_id`/`slot`/`institution`(hire/fire)、`key`/`value`/`byRole`(tune) | 声明 `control:` 时 ✓（无声明 ⇒ 不出现 ✓） | `VMU_STATE`、`VMU_INVALID_ARGUMENT` |
| `vibe_vmu_meeting` | 会议/表决面：`action=list\|open\|speak\|silent\|hand\|hands\|order\|refuse\|invite\|invitedspeak\|admit\|attend\|end\|agendaclose\|agendaitems\|leaverequest\|leaveapprove\|leaverequests\|aggregation\|complete\|phase\|status\|summary\|snapshot\|minutes\|verbatim\|close\|extend\|lapse\|revokelapse\|ballot\|vote\|tally\|reopen\|freeze\|unfreeze\|boxopen\|boxcast\|boxclose\|boxreopen\|boxlapse\|boxrevokelapse\|second\|withdraw\|flow\|overrideorder\|extendlimit\|proceed\|wait\|unwait\|types\|appoint\|schedule` ✓（**全集以 `tools/meeting.js:178` 的 enum 为权威**）★ **本轮补登四动作（T1 抓出的文档落后于代码）**：`order`＝**发言次序**：不给 `members` 时是**读**（回 `{mode,source,order,queueOpen}`，字段不变；只有 service 会议有 floor order，原语会 ⇒ 具名 `VMU_INVALID_ARGUMENT` 并指到 `action=status` 的逐轮 ask 表）；★ **RUN 229 / E16 起给 `members` 就是写**——本会**主席**按给定顺序**整体重排**发言队列（「批量指定成员按一定顺序发言」，规则 L50），回执带 `before`/`after`/`moved[{member,from,to}]`/`dropped`（只回 `ok:true` 不算数）；非主席 ⇒ `VMU_NOT_PERMITTED`，无主席 ⇒ `VMU_ENGINE_UNAVAILABLE`，缺席席位 ⇒ 具名 `VMU_NOT_MEMBER` 且 hint 说明**先把人弄到场**（`attend()`，`lateAdmission:"chair"` 下由主席 `admit()`）而不是改队列；`round-robin`/`random` 这两种会**每次重算**次序的规则无法被存储列表绑定 ⇒ 具名 `VMU_STATE`（先换模式），`flow/overrideorder` 需声明 `vmu.meetings.orderMode`；`attend`＝把成员**标记为到场**（纯委派 `meetings.attend`，face 不加席位策略、内核只校验在册；**只有它能让被邀的非主席成员真正发言**——此前 pack 面 100% 拒 `attend() first`，而 `invite` 只排发言序、不伪造到场）；★ **RUN 225-B · `admit` 与三种迟到入席政策**：召集时可给 `lateAdmission`（`open` 缺省／`chair`／`refuse`，其它值具名拒并列出三值；写在会议行上，`status`／`summary` 读回）。迟到的判定沿用既有的 `vmu.meetings.lateAfterMs` 对 `openedAt`（默认 0 ＝ 本署不判迟到）：`open` ⇒ 照旧入席并回 `late:true`；`refuse` ⇒ 具名拒 `VMU_LATE_ADMISSION_REFUSED`（hint 给两条补救：本会主席 `admit()`，或参加下一场会；重试 `attend()` 只会再拒）；`chair` ⇒ `attend` **不入席**，回 `pendingLate:true` 并把该成员记进该会 `status.pendingLate`，只有本会主席调用 `action="admit"`（`meeting`／`id` ＋ `member` ＋ `actor` 或 `by`）才真正入席，回执给 `admitted`／`admittedBy`／`admittedAt` 与剩余 `pendingLate`；非待批成员（已在席、或从未在门口）具名拒 `VMU_STATE` 并说明原因。★ **会内等待是可观察事实，不是常驻进程**：`status`／`summary` 另给 `waitStates[]`（每人 `present`／`awaiting`／`spoke`／`absent` ＋ `owes`：有它未投的已附议动议）与 `waitRecommended`／`waitRecommendedWhy` —— 成员**不是常驻进程**，本框架不为它守时；一次等待只意味着「这一轮不属于它」，回合结束即交回主席。`extendlimit`＝**只延会议墙钟**（`meetings.extendWall`；`vmu.meetings.extendRequiresChair` 默认 true ⇒ 须本会主席自报 `actor`，步长须为正，越过 `vmu.meetings.extendCeilingMs` ⇒ `VMU_RESOURCE_BUDGET`；**不延发言**；发言延长是 `action="extend"`（★ **RUN 230**：`extend` 现在**跨注册表**——service 会议走 `meetings.extend` 并回 `registry:"service"`，回执带 `extensions`/`max`/`extendMeans` 且写入 receipt 环；主席轨 `vmu.meetings.extendRequiresChair` 只在调用者自报 `actor`/`by` 时校验：自报非主席 ⇒ `VMU_NOT_PERMITTED`、无主席 ⇒ `VMU_ENGINE_UNAVAILABLE`，不报身份则沿用「所办可以延长」的旧语义；被抬高的发言上界可在 `summary`/`status` 读回：`speechUsed:[{member,speeches,extensions}]`＋`speechExtendMs`/`speechExtendMax`/`speechMaxMs`/`speechDefaultMs`；原语会议对象没有发言预算 ⇒ 具名 `VMU_INVALID_ARGUMENT` 并指向 pack 面）；★ **RUN 239-D · `wait`／`unwait`＝在会议里登记/撤销一次等待**（`meeting`/`id` ＋ `member` ＋ `until`（九值 `speak|vote|motion|poll|phase|attend-all|hand|meeting-closed|deadline`）＋ 可选 `timeoutMs`／`reason`）：回执 `registry:"service"`／`waitId`／`deadlineAt`／`waitMeans`；成员由 `member` 或当前回合的调用者推定，两者都没有 ⇒ 具名 `VMU_INVALID_ARGUMENT`；无 service 会议 ⇒ `VMU_ENGINE_UNAVAILABLE`（原语会议没有 waiters 表）。★ 这一面**只在等待登记**：真正的唤醒发生在事件结算点（见 `vmu.meetings` 行的 `wait` 说明），回执里的 `pending:true` 是诚实（投递是异步的），不是「已经在跑」。`proceed`＝**等待态提前开会／超时自决**（只对 `waiting` 有效：`scheduled` 未到点、`open` 已在跑 ⇒ 具名 `VMU_STATE`；`vmu.meetings.waitDecisionRequiresChair` 默认 true ⇒ 只有主席，回执带 `waitedMs`／`beforeDeadline`／`quorum` 并记入纪要）★ **RUN 194 · `minutes`／`verbatim`＝会议【记录正文】的两个读面**（此前写侧五个面在写、读侧一个都没有：`summary` 是 board、`status` 是状态机、`snapshot` 是原语会议的耐久序列化，对 service 会议具名拒 `VMU_REGISTRY_BOUNDARY`）：`minutes`＝结构化记录（说了／投了／拒了什么，`registry:"service"`，`allowArchived:true` ⇒ **已归档的会仍可读**）；`verbatim`＝逐字稿（受声明的剪枝设置约束，被剪条数会计数）。原语会议的 id 收到这两个动作 ⇒ 具名 `VMU_INVALID_ARGUMENT` 并指向它唯一的那份记录 `action="summary"`。★ **R102 · `types`**：`types` 不要 id，读**声明的会议类型目录**（`vmu.meetings.typeCatalog`）并说明**哪张面拥有会议类型**（`meetingTypeOwner:"vibe_v5_meeting"`）—— 成员席位持有本面、不持有 pack 面，所以「我必须遵守的六个会议类型」此前在**必须遵守它的席位上读不到**（run 100：成员只能背名字）；回执同时把 `kind`（本面的**票**类型 `decisive|advisory`）与会议类型分开说（`ballotKindMeans`）。★ **RUN 248-N · `appoint`／`schedule` ＝预约会议（服务记录的「先约后开」）**：两者都寻址 **`vmu.meetings` 服务记录**（不是原语表）—— `appoint` ＝立即开始（不给 `at`）、`schedule` ＝**`at` 必填**（部署时钟的 ISO 字符串或 epoch 毫秒；pack 面另接受相对偏移 `"+90s"`／`"+5m"`）；`id` 可指定、缺省由内核分配。预约词表：`type`／`title`／`materials`（未给时回落到 `agenda`）／`lateAdmission`（`open|chair|refuse`，缺省 `open`）／`wallLimitMs`／`formalAgenda`，其中 **`scheduledFor` 是 `at` 的别名**（同时给且不一致 ⇒ 以 `at` 为准，回执照实记录）。成功后内核给**每个被邀成员**（roster 减主席）投一条**耐久 mailbox 行**（`channel:"mail"`、`dedupeKey:"meeting-appoint:<会 id>"`，含类型／议题／开始时间／主席／该成员席位／**可直接照抄的 `attend` 调用**）；回执 `notified`／`notifyRows`／`notifyFailed` —— **投不出去的逐人具名，绝不静默丢**。同一轮起**主席对全体发言**（`speak` 且发言人＝本会主席）会给每个在席成员（不含发言人）投一条 `channel:"group"` 耐久行（摘要 ≤800 字符 ＋ 全文指针 `<会 id>/minutes#<条号>`），回执 `deliveredTo`／`deliveredRows`／`broadcastFailed`／`broadcastMeans`；普通成员的发言仍只进纪要、不推送（否则每句话都变成 N-1 封邮件）。 —— 只对**内核已登记的实例 id**寻址 ✓（未知 id ⇒ `VMU_NO_SUCH_OBJECT` ✓；★ **RUN 84**：当这个 id 只存在于 service 表时，回执不再说「没有这场会」，而是消息点名「不在本表、在另一张表」＋`registry:"service"`＋`askedAction`＋`actionCrosses`，hint 列出**真实交叉集合**并明说被问动作是否在其中 —— 旧消息与同一回执的 hint 互相矛盾）。★ **R94**：当被问动作**从不跨注册表**（如 `agendaitems`/`agendaclose`）而 id 在 service 表时，消息**以边界开头**（`action "X" addresses the PRIMITIVE registry only and never crosses, while meeting … lives in the SERVICE registry`，字段 `boundaryOnly:true`），因为读者按第一句行动；`vote` 在**面上归一化**口语票值（`for/yes/赞成`⇒1；`against/no/反对`⇒0 ✓），其余原样交给原语 ⇒ **权威拒绝仍来自原语** ✓。★ **R30 · `close` 回执新增 `closureVote`／`closureVoteNote`**：`close` 的 rails（`enforced` 点名的会议策略轨）与「结题票一致同意」是**两个机制** ⇒ **「closed」≠「一致判定已解决」**；回执把两者并排给，并说清后者既不把关、也没被关改动（`tools/meeting.js:353-368`；细则见 §3.1a 末的 R30 注 ✓） | `action`(必填，枚举)、`id`、`ballotId`、`member`、`text`、`target`、`value`、`kind`、`reason`、`agenda`、`roster` | 声明 `meetings:` 或 `ballot:` 时 ✓（无声明 ⇒ 不出现 ✓） | `VMU_NO_SUCH_OBJECT`、`VMU_STATE`、`VMU_INVALID_ARGUMENT`、`VMU_PACK_*=pack 规则` ✓ |
| `vibe_vmu_turn` | **轮次编排面**（`26-§3.4` ✓）：`op=step\|drive\|status\|reply\|prompt` ✓ —— **`step` 精确跑一轮**（**谁**由 `vmu.turn.wakeupPolicy` 定 ✓、**什么提示词**由 `vmu.prompt` 管线装配 ✓），**`drive` 连跑有界若干轮**，**`status` 读数**（策略／已唤醒计数／各阶段计数 ✓），`reply` 交回本回合结构化汇报，**`prompt` 分页读回本进程交出的成员提示词原文**（`turn`/`offset`/`limit`；★ 因为 `step` 回执里的 `memberPrompt.text` 受回执上限约束会被截断，而验收要能逐字核对整份提示词）。★ **`status` 的 `detail` 只接受 `'closure'`**（只回 `closureVote/closureVoteWrites`）；**省略 = 全量 status；未知值 ⇒ 具名 `VMU_INVALID_ARGUMENT`，不静默忽略**。★ 语义照 `26-§3.3`：无成员 ⇒ 合法空转（`stopped:"no-members"` ✓）；缺投递缝 ⇒ 该轮返回 `ok:false`（不假装跑过 ✗）；一轮失败是运行结果，参数不合法是编程错误（抛）✓ | `op`(必填；**所办/主席**：`step\|drive\|status\|reply\|prompt\|abandon\|reopen-closure`；**成员席位**：仅 `status` —— 成员调其它 op ⇒ 具名拒 `VMU_NOT_PERMITTED`，hint 的 `REACHABLE INSTEAD:` 点名可照抄的 `vibe_vmu_turn { op: "status" }` 并说明 reply 由所办代转，**不再教成员去改 `tools.allow`**；成员席 status 回执带 `memberOps`／`memberOpsMeans`)、`members`、`rounds`、`phase`、`why`、`next_step`、`detail`(仅 status：closure)、`turn`/`offset`/`limit`(仅 prompt) | 声明 `turn:` 时 ✓（无声明 ⇒ 不出现 ✓，**零机制不被破坏** ✓） | `VMU_ENGINE_UNAVAILABLE`、`VMU_INVALID_ARGUMENT`、`VMU_TURN_*` ✓、`VMU_STATE`(prompt 无缓存时)、`VMU_NO_SUCH_OBJECT`(prompt 未知回合) |
> **`memberOps`／`memberOpsMeans`（TB-2733，成员面的动作级收窄）**：谁写——`vibe-math-vmu/tools/turn.js` 的单一常量 `MEMBER_TURN_OPS`（`Object.freeze(['status'])`），工具描述里的成员句、运行期 guard、拒绝 hint、回执四处同源渲染（不是四份手写）；谁读——成员席位的工具描述与拒绝路径；缺了读什么——旧回执没有这两个键，成员可用集退化为「以拒绝回执逐 op 实测」，**不要从 `tools.allow` 推断**（那是所办/部署的配置，成员改不了；hint 也不再这么教）。
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
| `vibe_vmu_mathtools` | **数学工具面**：`action=plan\|run\|cacheMarkCorrupt\|cacheView\|receiptsView\|status` ✓ —— **只做寻址与调用** ✓（R202：`run` 的持久化写 `Math/Jobs` 镜像，回执带 `persisted`/`persistedVia`/`persistCode`/`persistMeans`；三态计数在 `status().receipts`，`keptDetail` 跟随结果不跟随设置） | `action`(必填，枚举)、`op`、`args`、`cacheKey` | `mathtoolsTool` 为真 | **服务自己的码原样透传** ✓（`VMU_MATH_INVALID_INPUT` ＋ 可用的调用示例 ✓） |
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
| `vibe_v5_paper` ★ G7 重点 | **论文的唯一运行入口**：`start/part/advance/review/final/render/status/compile/sections`（9 action）。`final` **只有 chair 席**能过（成员 ⇒ `VMU_NOT_PERMITTED`）；`render` 回 `wrote/missing/complete/pdf`；`status` 回同一 `PaperArtifacts` 的 `missing/complete/pdf`（不写产物）；PDF 失败回执带 **`triedEngines:[{engine,phase,code}]`**（可读的结构化引擎尝试列表，不再 `[object Object]`） | `action`、`target`、`member`、`participants`、`part/title`、`body`、`deliverable`、`notes`、`decision` | ★ R86：`action:"consult"` 可由**声明的答复角色**（`PAPER_CONSULT_ROLES`，当前 `office`）作答，即使名册没有该 id —— 所办是运行本所的会话；回执 `answererKind:"declared-role"`/`"roster-seat"` 与 `answererMeans` 说清身份。★ R95：`action:"part"` 的 `evidence` 指针**写入当刻**就对着 records 面解析（`paper-quality.js#checkEvidencePointers`），指向不存在或轨不对的记录 ⇒ 当场具名拒（`paper-quality.js` 的 `EVIDENCE_MISSING` 家族码，见 §8 的 pack 族前缀）；回执 `evidence{provided,checked,resolved}`。`render` 的 `wrote` 是**记录种类**不是磁盘文件，`wroteWhere{records,disk,means}` 说明 `.tex`/`.pdf` 只在 `compile` 后落盘。★ RUN 2691：`status.pdfCompiled` 报出 `pdfSha256`（归档行记录的 PDF 文件 sha256，和 `pdfBytes` 来自同一次 `fs.readBytes`）、`diskPdfSha256`／`diskPdfBytes`（`kernel.latex.pdfReading` 现读）、`pdfSha256MatchesDisk`／`pdfSha256Mismatch`（篡改 1 字节 ⇒ 具名 `mismatch:true` 且 means 点名 `TAMPERED OR REPLACED`），旧行缺 sha ⇒ 三值为 `null` 且 `missing` 点名 `pdfSha256`（见 §3.1g R3）。
| `vibe_v5_inbox` | 信箱：`list/open/mark`；`list` 行 **9 字段（含 `urgent`）无正文**，`open` 置 `read:true`，`mark` 改 read/todo。与 `vibe_vmu_mailbox` **同一套存储**（非紧急提示无正文；紧急只有发送方 `urgent:true` 才带正文）；★ **R30 · `open` 的回执形状**：正文**只在 `message.text`**（`message` 另带 `id/from/at/subject/kind/urgent/read:true/todo`），`list` 的 `rows` **永不带正文**（`packs/v5r/tools.js:160` 的 note 明写 rows carry NO body）—— 先按发件人／时间／主题／urgent／read／todo triage（`urgent:null` 是「面读不出」**而非**「不紧急」✓），再 `open` **一封**（`packs/v5r/tools.js:163-174`）✓ | `action`、`member`、`status`、`id`、`read`、`todo` |
| `vibe_v5_wait` | 等待：`wait/status`；**面名是 `activity`（不是 `wait`）**；回执 `timedOut/waitedMs/timeoutMs`；无 peer 接缝时 `peerCheck:"no-seam"` | `action`、`timeout_ms`、`member`、`reason` |
| `vibe_v5_record_*` | 研究日志/成果卡（内容指纹去重）。★ RUN 92：**卡面 `member` 指向谁，就按那一位的席位判能不能写**（`seat-faces.js` 的声明表）——所办没有席位，所以「所办代写」不再是绕过席位声明的路：temp 写方法/子问题卡具名拒 `VMU_NOT_PERMITTED`（hint 引 `rule 4/3` 与声明原话，并给出「省略 `member` 由所办自己写」的出路），写命题卡仍允许（按面判，不按席判） | `content`/`statement`、`value`、`motive`、`p`、`track` |
| `vibe_v5_message` / `_say` | 所办转达/群聊私信；`urgent` 默认 **false**（kind 不自动紧急） | `to`、`content`、`subject`、`urgent` |
| `vibe_v5_meeting` / `_motion` / `_second` / `_poll_*` / `_verdict` 〔★ R101：`durationMs` 设定这一场的墙钟上界，`wallLimitMs`/`wallLimitMsSource` 在召集回执与 `vibe_vmu_meeting` 的 `status`/`summary` 上都可读回〕 | 机构会议/投票面；与 `vibe_vmu_meeting` 的 service 注册表/ballot 镜像见 `docs/08 §27`；★ **R30**：v5r-pack 的 `vibe_v5_verdict_ask`／`_verdict_final` 回执增量（`propositionClause`／`accounting`／`excluded`／`mail`、`floorMeans`／`correction`）见 §3.1a 末的 R30 注 ✓ | 见 `packs/v5r/tools.js` |
| `vibe_v5_lean_run` / `_job` / `_lib` / `_read` / `_archive` | Lean 面：无宿主 spawn 时**具名 `VMU_ENGINE_UNAVAILABLE`**，不假装编译 | `file`、`statement`、`jobId`、`kind` |
| `vibe_v5_script` ★ RUN 236 · C14 | 脚本归档（规则 C14「研究脚本必须归档」的唯一可达面）：**chair-only** —— `op=archive` 把脚本原文落到 records 的 `scripts` 轨（kind=`dataset`，指纹由 kernel 算；回执带 `recordId` / `archived {recordId,name,track,bytes}` / `archiveMeans`「archival copy，不是执行证据」），`op=read`（id 或 name，最新 edition）逐字读回，`op=list` 列出；member/temp 具名拒 `VMU_NOT_PERMITTED` 并给可达路径（把原文交给院士并说明按什么归档：`say {to}` / 会议记录 / 任务回执）。此前全席 deny ⇒ C14 无执行者。no-adhoc-scripts 不变：归档 ≠ 运行 | `op`（枚举 `archive`\|`read`\|`list`，缺省 `archive`）、`name`、`text`、`purpose`、`parent`、`edition`、`id`、`limit`、`member` |
| `vibe_v5_task_*` / `_hire` ★ RUN 92（`to` 是**新成员 id**：已在册的 id 具名拒 `VMU_INVALID_ARGUMENT`，hint 指向 `vibe_vmu_control {action:"hire"}` 那道明示重排座位的面——静默把院士改席成 temp 曾让整场会议不可召集） / `_assign` / `_fire` / `_nudge` / `_prioritize` / `_feedback` / `_read_library` / `_overview` / `_report` / `_start` / `_stop` / `_pause` / `_resume` / `_configure` / `_set` / `_tool_help` | 任务板/招聘/所务管理/控制；被具名拒时保留原码 | 见 manifest |

★ **框架侧的同名能力**（`vibe_vmu_*`）仍在 §3.1；两套并存的边界以“谁是当前 pack 的 manifest 工具”为准，**不要用一张手写清单代替 manifest**。

### 会议类型：中文别名 ≡ 英文 id（★ RUN 76 · TB-2715 / FEEDBACK63 C18）

规则文档与任务书用的是**中文词**，run76 里主席照任务书写 `type:"结题"` 却被 `VMU_INVALID_ARGUMENT` 拒、只能改英文 id —— 合法中文输入不该被拒。`vibe_v5_meeting` 的 `type` 现在**先精确匹配 id，再匹配中文别名**（大小写、空白、`/`／`／` 容忍：`"未来规划 / 策划"` 与 `"未来规划策划"` 等价）。

别名表是 `packs/v5r/meeting-procedures.js::MEETING_TYPE_ALIASES`（导出常量），与 `MEETING_TYPES[].label` **分开存**：`label` 是规则原文的**显示标签**（`tests/vmu-meeting-types.test.mjs` 逐字钉住它），别名是**接受的输入**。

| id | 显示标签（不可改） | 可用中文输入（别名） |
|---|---|---|
| `ordinary` | 正常会议 | 例会、普通会议、正常会议 |
| `academic` | 学术交流 | 学术 |
| `debate` | 辩论 | （标签本身即别名） |
| `closure` | 结题 | 决议 |
| `paper` | 论文交流 | 论文 |
| `planning` | 未来规划/策划 | 未来规划策划、未来规划/策划、未来规划、规划、规划会 |

归一规则（回执可在 `packs/v5r/tools.js` 的 convene 回执读到）：`type` **永远是 id**（`"结题"` 与 `"closure"` 开出同一类型的会）；另带 `typeInput`（调用者原文；未传 `type` 时为 `null`）与 `typeMatchedBy`（`"id"`｜`"alias"`｜`"default"`），`typeMatchedByMeans` 用一句话说明命中的门。`action:"types"` 的每行也带 `aliases`。未命中 ⇒ `VMU_INVALID_ARGUMENT`，hint **先列英文 id、再列「id（中文标签；别名…）」成对清单**。别名只在这张面上被解开：传给内核与存进会议的永远是 id，所以声明了 `vmu.meetings.typeCatalog` 的部署不需要把中文词登记进目录。

★ **耐久账里的同一事实（RUN 77 · TB-2726）**：convene 回执的这三个字段不是「回执装饰」——会议的**耐久 open 行**（`<root>/vmu/state.json` 的 `keys.meetings.value.data.receipts`，唯一生产写点 `kernel/meetings.js::pushReceipt`）逐字携带同一个投影：`type`（恒 id）、`typeInput`（调用者原文，原样保存：CJK、引号、空白都不再规范化）、`typeMatchedBy`（`id`｜`alias`｜`default`），并带 `typeMatchedByMeans` 一句话。缺值写 `null` + means，**不写 `""`**：RUN 77 现场 m3 行的 `""` 对是「没记录」，不是「调用者什么都没写」——那是两个不同的断言，空串会让读者分不清。读面 `receiptsView`（`kernel/meetings.js::receiptRowRead`）对旧行（缺键、或 RUN 77 的 `""` 对）一律读作 `null` + 同一句 means，不改写、不猜测、不抛错；新行 round-trip 不变。于是同一次开会后三处读数（convene 回执 / 耐久行 / `receiptsView`）的 `type`·`typeInput`·`typeMatchedBy` 必须逐字相等——`tests/vmu-run77-meeting-receipt-type.test.mjs` 对三种入口（英文 id、中文别名、省略 type）各钉一遍，并含旧行兼容与三盏反关灯。

★ **耐久会议行本身也带这份出处（RUN 78 · TB-2731）**：TB-2726 只把三键写进了回执环，会议的**耐久行**（`<root>/vmu/state.json` 的 `keys.meetings.value.data.live` 里那一条会议行）仍只有 `type` 一个词——于是「这次会是不是用别名开的」在审计时只能在回执与主席发言里找。现在 `openSeq` 把 `typeInput`/`typeMatchedBy` 一并写进耐久行：`type` 恒 id，`typeInput` 是调用者原文（不规范化），`typeMatchedBy` 是 `id`｜`alias`｜`default`。读面由**同一个投影** `typeProvenanceOf(m)` 提供，`summary` 与 status 视图各 spread 一次，另带 `typeMatchMeans` 一句话；RUN 78 之前记录的旧行两键读作 `null` + 具名 `typeMatchMeans`（「这一行在本折叠之前记录」），不改写、不猜测、不抛错，`type` 仍可信。**工具面同口径（RUN 78 · D3）**：`vibe_v5_meeting {action:"receiptsView", limit?}` 是只读的第二个读动作（此前只有 `rulings`），回执由内核 `receiptsView` 投影而来：`receipts`（新→旧序，内核环上限 200）、`count`、`available`、`dropped`/`ringDropped`、`receiptRingMeans`；`limit` 只收 1..200 的整数（缺省 50），越界具名拒 `VMU_INVALID_ARGUMENT`（clamp 会回答另一个问题）。于是同一次开会后**三处读数**（convene 回执 / 耐久会议行 / 工具面 `receiptsView`）的 `type`·`typeInput`·`typeMatchedBy` 逐字相等——`tests/vmu-run78-meeting-provenance.test.mjs` 对三种入口各钉一遍，第三处**只走注册工具面、不调内核服务**（服务有读面而工具面无入口，真机就只能记 NO-EVIDENCE），并含旧行 rehydrate 兼容与两盏反关灯。

★ **跨内核读回执：`receiptsView` 读耐久账，不是读本实例的空环（RUN 79 · TB-2740）**：RUN 78 给了工具面入口，但内核仍只读**本实例**的 receipt ring——于是所办（根内核）读主席子内核召集的会议得到 `receipts:[] / available:0`，而 `state.json` 的耐久账里明明躺着三键俱全的行（真机 build `6c689c86`：根内核 `vibe_v5_meeting {action:"receiptsView",limit:10}` ⇒ `count:0`，主席那边的回执却是 `m2`／`closure`／`结题`／`alias`，且与耐久会议行相等）。现在内核 `receiptsView` 先读**耐久折**：`meetingsDomainSeam.readFold()`（只读的 `store.read('meetings')`，`vibe-math-vmu/kernel/index.js:2274-2277`，`write` 一字不动）→ `value.data.receipts`（JSON 字符串或数组），读成功即 `readFrom:"durable-fold"`；接缝缺席、读抛错、无 data 或 JSON 坏 ⇒ 退回本实例环并标 `readFrom:"in-process-ring"`，同时给 `foldWhy` 说明原因（旧读者形状不变）。两个数字必须**分开出现、绝不互相覆盖**：`available` 是**源**（耐久折或环）的条数，`inProcessRingCount` 是本实例环的条数；两者不等时另给 `sourceDivergenceMeans`（「`<N>` durable / `<M>` in-process」＋耐久权威的理由：它是共享记录，环只反映本内核自己的动作），但返回的行**始终取耐久折**——缺省环、以环覆盖折会让兄弟内核的会议在审计里消失。`limit` 语义不变（1..200，缺省 50，越界具名拒 `VMU_INVALID_ARGUMENT`，不 clamp）：`count` 是本次返回行数，`available` 是源总条数，`dropped = available - count`。

| 层 | 位置（`file:line`） | 读者拿到的事实 |
| --- | --- | --- |
| 耐久账（跨内核唯一可读源） | `<root>/vmu/state.json` 的 `keys.meetings.value.data.receipts`；唯一生产写点 `vibe-math-vmu/kernel/meetings.js::pushReceipt` | open 行三键 `type`／`typeInput`／`typeMatchedBy` ＋ `typeMatchedByMeans`（RUN 77 起） |
| 耐久折（只读接缝） | `vibe-math-vmu/kernel/index.js:2274-2277`：`meetingsDomainSeam.readFold` → `store.read('meetings')` | 上面的 `receipts` 数组；**不经此接缝写回**，`meetingmarker` 的 `read()/write()` 行为不变 |
| 工具面读 | `vibe_v5_meeting {action:"receiptsView", limit?}` → `vibe-math-vmu/packs/v5r/tools.js` 的 `toolMeetingReceiptsView` | 内核回执原样透传 ＋ `readFrom`／`inProcessRingCount`／`receiptRingMeans`／`sourceDivergenceMeans`／`foldWhy` |

**议程的输入形状也要可区分（RUN 79 · TB-2740 C1）**：`vibe_v5_meeting` 的 `agenda` 一直「字符串或数组」两义，回执只用 `agendaItems` 呈现结果，读者分不清「调用者写了一整句含逗号的议程（`,` 不是分隔符）」还是「写了数组」。现在 convene 回执带 `agendaInputShape:"string"|"array"` 与 `agendaSplitMeans`：字符串按 `;`／`；`／换行切分，`,` 与 `、` **不是**分隔符（`确认 (2k−1,2k) 的界,与证明` 是一整项）；数组元素**不二次切分**，纯空白项丢弃。`tests/vmu-run79-receipts-cross-kernel.test.mjs` 用**两个共用同一 store 根的内核实例**钉住三键逐字相等（第三处只走注册工具面），另含旧行 `null`+means、坏接缝降级、`limit` 界、两种 `agenda` 形状与三盏反关灯（改回读环／`available` 用环条数／逗号切分，各自在整树副本上红、还原后 sha256 与 pristine 相同）。

> ★★★ **R30 · 四种回执形状增量（逐条指到 `file:line`；`tests/vmu-run30-findings.test.mjs` 对它们逐条点名 ✓）**
> - **`vibe_vmu_meeting{action:"close"}`**（`tools/meeting.js:353-368`）：回执并排给 `closureVote`（`cast`／`confirmed`／`votesCast`／`missing`，**同一实例上的一致同意读数**；不可读时是 `{readable:false,why}`）与 `closureVoteNote` —— note 明写它**不是**这次关会的要求、也**没被关会改动**，关会过的是 `enforced` 里点名的**会议策略轨** ⇒ **「closed」不等于「一致判定已解决」**；点名在 `missing` 里的人，正是「声称结题前该去问的人」✓。
> - **v5r-pack 的 `vibe_v5_verdict_ask`**（`packs/v5r/tools.js:1805-1860`）：`propositionKind`（`card`／`meeting-subject`／`file-ref`／`unverified`）、`propositionVerified`、`fileChecked`、`propositionWhy` 说清**这个 id 被理解成了什么**；`propositionClause` 是**真写进成员邮件正文**的那句话（`packs/v5r/tools.js:1744-1752`；注册卡 ⇒ `null`，因为点名一张已登记的卡不额外声称什么）；`accounting` 把三个数**摆平**：`asked + excluded = accountedCount`（`packs/v5r/tools.js:1793-1803`）；`excluded` 逐条给 `{member, why:"presides"}` —— 主席**签名**这次提问，所以不**回答**它，这是唯一被过滤的原因；`mail` 给真正发出的 `text` 与状态读数（「辩论已结束」只在状态真是 `closed` 时才算**读到的事实**，读不到就写「状态不可读」✓）。命题既不是卡、也不是文件引用、也不是本会辩论对象 ⇒ 具名拒 `VMU_ASK_UNKNOWN_PROPOSITION`（**已登记于 §8 的 R30 批**；抛出点 `packs/v5r/tools.js:1597`／`:1607`）✓。
> - **v5r-pack 的 `vibe_v5_verdict_final`**（`packs/v5r/tools.js:1362-1406`）：`floor`（`minVotes`／`min`／`roster`／`eligibleUniverse`／`cap`／`formula`／`satisfiedBy`／`means`）是**关会轨**要求的**表决**门槛读数（读内核 `meetings.quorum()`，不在本面二次推导）；`floorMeans` 把它搬到顶层并明写 **`satisfiedBy:false` 不是「跳过了闸」** —— **裁决不是表决**，部分集合上的裁决在带理由时合法；`correction` 给持有者**那一条可执行调用**（`vibe_v5_record_proposition` ＋本次裁决产出的 `p`／`debate_ruling`）—— 规则把**通知**交给框架、把**改卡**交给**持有者**，这一面**不代写卡**（否则同一行会多出第二个写者）✓。
> - **v5r-pack 的卡写入与 `vibe_v5_verified_promote`（B2 文献入口）**：`p:1` 的**第四种证据**是 `literature_ref:"<作者, 出处, 定理/页码>"`（须非空；闸记 `evidenceForm:"literature-reference"`，回执带 `p1Evidence`）；★ R97（独立审计 B1，真缺陷是**旁路**不是 p=0）：`vibe_v5_verified_promote` 现在和 p=1 卡写入跑**同一道四证据闸**——`warrant_kind:"debate-unanimous"` 必须带 `debate_ruling:{mode:"unanimous",value:1,subject:<card>}`，`"lean-conformance"` 必须带通过的 `lean_job`+`lean_conformance:"conform"`，`"literature"` 必须带非空 `literature_ref`；p=0 的定论（证伪）同样要带「一致为 0 的那次裁决」（否则具名拒 `VMU_PACK_V5R_VERIFIED_NEEDS_JUDGE`）；0<p<1 先按「偏好不是定论」拒。回执 `p1Evidence` 说明是哪一种通过的。入轨时 `warrant_kind:"literature"` ＋ 同一句 `literature_ref`，行上的 `warrant` 就是该引用、`source:"literature"` ⇒ 「为什么算定论」答得出处，而不是「有人说了算」。缺引用具名拒（`VMU_INVALID_ARGUMENT`，**不新造码**：它是参数缺失，不是新语义）；引用不能是空白串，空白串与没给同罪。
> - **v5r-pack 的 `vibe_v5_inbox{action:"open"}`**（`packs/v5r/tools.js:163-174`）：正文**只在 `message.text`**（`message` 另带 `id/from/at/subject/kind/urgent/read:true/todo`），`list` 的 `rows` **永不带正文** ✓ —— 与上表该行的「9 字段无正文」是同一条纪律的两个面：**先 triage，再 open 一封**。
> - **R102 · 面板属于「在册的人」，状态板每行都说时间**（`kit/handlers.js#toolRecordProgress`、`kernel/turn/index.js#statusBoardReadings`）：state 面板写**不在名册**的 id ⇒ 具名 `VMU_NO_SUCH_OBJECT`（消息给出它核对的名册，hint 指 `vibe_v5_hire`），回执照实说 `memberCheck:"checked"|"skipped"`；内核没有 members 面时**不猜**（`skipped` + `memberCheckMeans` 说明为什么没核）。`vibe_vmu_turn{op:"prompt"}` 的 `[状态板]` 每行要么带内容时间（`（读于 …）`），要么具名说 `时间未提供：<为什么>` —— 设置键派生的行（`[总任务]`）没有内容时间戳，它现在**说清这件事**，并且同一次装配两次渲染**逐字相同**（读时钟不进提示词）。

### 3.1b RUN 241（FEEDBACK64 M9/M10/M15/M13/M11/M12）的六条契约增量

> 真机第 64 次运行（`FEEDBACK64.md`）的六条「回执说 X、盘上/正文是 Y」，每条一个可读事实。逐条都有**运行期**断言（`tests/vmu-run241-receipts2.test.mjs`），不是只钉源码字符串。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| M9 ★ | `vibe_v5_record_*` 结算后的卡正文 | 结算回执有 `p1Evidence:"debate-unanimous"`，卡正文只有 `- debateRuling：…`，**没有** `- p1Evidence：` 行 | 结算（`settleRulingOnCard`）把**证据形态**写成一行 `- p1Evidence：<debate-unanimous\|literature-reference\|lean-conformance\|verified-row>`，紧跟 `- debateRuling：`；再次结算**替换**该行而不是叠加。回执 `settlement.wrote` 含 `p1Evidence`、`settlement.p1EvidenceLine:true`、`settlement.p1EvidenceReplaced`（旧行被替换时为 true）。`p1Evidence` 是「谁把 p=1 放行」的账，读卡的人不必再反推 `debateRuling`。 |
| M10 ★ | `vibe_v5_records` merge 的卡正文与 `bodyLinesAdded` | merge 后 `bodyLinesAdded:["id"]`，正文多一行 `- id：rec-4`（重复了行自己的 id） | 行 id 是 **ROW 本身**，不是 body 字段。`records` 在**存储边界**丢弃「只重复本行 id」的 `- id：<自身 id>` 行（`bodyOwnIdLineDropped:true` + `bodyOwnIdLineMeans`），`bodyLinesAdded` 由清洗后的正文计算 ⇒ 不再把它算成「调用方新增的正文行」。其他行的 `id：`（指向**别的**行）保留。 |
| M13 ★ | `vibe_vmu_meeting { action:"leaverequests" }`（读面） | 未决请假 `decidedAt:0`，而无期限 `wait` 是 `deadlineAt:null` —— 同一个「还没决定」两种写法，且 0 读起来像「在第 0 毫秒决定了」 | 读面归一为 `decidedAt:null` + `decidedAtMeans`（「'No decision' is not 'decided at the 0th millisecond'」）与 `undecidedRequests` 计数；**存储未改**（`meetingleave.js` 的哨兵仍是 0，读面负责把它印成 null），已决定的行走决定时刻。 |
| M15 ★ | `vibe_v5_meeting { formal_agenda }` 的 hint | hint 教 `kernel open({ formalAgenda: [...] })`，并说「pack 门等 schema 放宽」 | hint 指向**正门**：`vibe_v5_meeting { formal_agenda: ["<item>", { title: "<item>", kind: "review" }] }`（pack schema 接受 boolean 或 array；也保留 kernel 面 `open({formalAgenda:[...]})` 的拼写），删除「等 schema 放宽」的假等待。 |
| M11 ★ | `vibe_vmu_human { action:"recover" }` 回执 | 内核 `members.restore` 已返回 `keptLive`/`keptLiveMeans`，recover 回执里**读不到** | recover 回执顶层透出 `keptLive`（数组）与 `keptLiveMeans`：一次恢复**没有**把名册恢复成空（活的、快照里没有的席位被留下）。读 recover 一次就能回答「谁没被恢复掉」。 |
| M12 ★ | 同上 recover 的 `ok`/`code` | 干净首跑也回 `ok:false` + message「the recovery did not fully succeed: ledgers, readback」，而每一步的 `hydrated:false` reason 是「nothing was projected (a first run)」——正常事实与真失败混在一个码里 | `nothingToRestore:[<key>...]` 与 `nothingToRestoreMeans` 单列：**没有任何东西可恢复 ≠ 恢复失败**，它不失败任何 step、不翻 `ok`。`ok:false` 只留给 `unhydrated`（真冲突）与 read-back 漂移；此时回执的 hint 明说 `nothingToRestore` 不属于失败清单。 |


### 3.1c RUN 256（TB-2624：读数形状）的三条契约增量

> 真机第 74 次运行的取景（`FEEDBACK74`）发现三个「同一个事实、三种形状」的读面。改动见 `packs/v5r/tools.js`（环境读数）、`host.js`（records `get`/`includeUntracked`）、`kit/paper.js`（问询 id 铸造）。逐条有运行期断言：`tests/vmu-run256-reading-shapes.test.mjs`。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| E1 ★ | LaTeX 缺失在 `final` / `compile` / `status` 三个动作上的位置 | `final` 把 `toolchainAbsent` 与 `pdfEnvironmentMissing` **埋在** `receipt.final.*`；`compile` 失败时把 `code` 放顶层、**没有** `toolchainAbsent`；`status.toolchainAbsent` 是**字面空数组** `[]`（读起来像「没有缺失」，其实只是没问过） | 一个读法 `environmentReadingsAt(kernel)` 供三处引用，三个动作**顶层**都用同名三键：`toolchainAbsent`（`[]` 或 `["latex"]`）、`pdfEnvironmentMissing`（boolean）、`latexAvailable`（`true`/`false`/**`null` = 本次会话还没问过**），另带 `toolchainAbsentMeans`/`environmentMeans`。同一次会话里三处读数**逐字相等**（引擎缺失时同为 `["latex"]`/`true`/`false`）；`toolchainAbsent` 与 `missing` 互斥（`missing` 只装「这次编译需要却没有拿到的输入」）。`status` 在还没跑过 `compile`/`final` 时给 `latexAvailable:null` 并具名说「not asked yet」——它不是「已装」也不是「缺失」。`final.final.*` 的旧嵌套键保留，老读者不坏。 |
| E2 ★ | `vibe_vmu_records` 的动作名与 `list` 的默认口径 | 任务书写 `records.get`，工具面**没有** `get`，拒绝时只说 `unknown action: get`（不带 hint，不告诉人家最接近的动作）；`list` 默认页混入 `track` 为 `undefined` 的 ruling 卡（图书馆头），读者把它当「记录行」数 | ① 加 **`action:'get'`**，与 `expand` 是**同一个实现**（只改名字，回执逐字相同、同样按 `id` 读正文；`'get'` 加进枚举、分发前一行归一）；② 未知动作的拒绝**带 hint**，列出可用动作并明说 `get` ≡ `expand`（提示即承诺）；③ `list` 默认**排除** `track === undefined` 的行，计数与 id 写进**同一个** `excluded` 容器：`excluded.untracked` / `excluded.untrackedIds`（与 `shapeMismatch`/`noWriter`/`timeUnknown` 同处，不另造第二个容器），回执带 `includeUntracked:false`；传 `includeUntracked:true` 显式带出它们并让 `excluded.untracked` 归零。**两条路都在回执里说出来**：`excluded.untrackedScope` 取 `'bare-list'`（裸 `list`＝清点，无轨行默认排除、`untracked` 有计数）或 `'query'`（带 `by`/`since`/`until`/`kind`/`track` 任一选择条件＝回答一个问题，命中的图书馆头属于答案、不过滤，`untracked` 恒为 0），并附 `excluded.untrackedScopeMeans` 一句解释——读者不必从文档推断自己走的是哪条路。`rowsFrom.library` 仍计为「读过」——排除的是默认页，不是读取。 |
| E3 ★ | 问询 id 的铸造 | `kit/paper.js` 用标题拼 id：`consult-端到端占位论文-1`（标题含中文、斜杠或引号时 id 直接污染路径/引号；写作 `consult-<title>-<n>` 的读者会把 id 当标题） | id = **前缀 + 单调序号 + 4 位随机**：`consult-<seq4>-<rand4>`（`^[a-z-]+-\d{4,}-[0-9a-f]{4}$`，seq 补到至少 4 位），标题只进 `title`/`subject`。id 是**地址**不是标题。**旧形 id 仍可读**：咨询台账按 id 精确字符串匹配、不校验格式，所以历史 `consult-<旧标题>-<n>` 依旧能被读回与答复（迁移不改写历史，答复回执原样带回旧 id）。 |

### 3.1d RUN 257（TB-2611 / TB-2645：谁跑了这一轮、以及「成员根本没跑」）的两条契约增量

> 真机第 75 次运行的取景：办公室能读到每个已结算回合的行（`turnReceipts`），却没有任何读数回答「这些写作多少是成员自己在自己的会话里做的、多少是所办代打的」；交付 seam 抛错时行只说 `undelivered`，**没有一句说成员没运行**，于是超时可以被读成「这一轮发生过」。改动见 `kernel/turn/index.js`（只读取数派生 + 投递失败分支，不改调度）。逐条有运行期断言：`tests/vmu-run257-member-work-share.test.mjs`、`tests/vmu-run257-delivery-unavailable.test.mjs`。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| W1 ★ | 状态面的成员工作占比 | 每个回合行都有 `writes`，但**没有任何聚合**；要回答「成员自己写了多少」只能人肉扫 `turnReceipts`，而且行里**没有** `deliveryPath`，所办代打的回合与成员自己的回合无法区分 | `status()`（以及 `vibe_vmu_turn {op:"status"}` 与回合工具的整份状态）新增 **`memberWorkShare`** = `workShareOf({turns})` 只读派生：`{memberActs, officeRelayedActs, unknownActs, acts, provenActs, memberTurns, officeRelayedTurns, unknownTurns, deliveryUnavailableTurns, memberShare, classifiedBy, means}`。按**行级**事实 `deliveryPath` 三分类：`"caller"` ⇒ 所办代打（office-relayed）；其它具名路径（`activation` / `continuation` / `one-shot` / 宿主 seam 名）⇒ 成员自己的会话（member）；**缺失/空** ⇒ unknown，**绝不并入 member**。`memberShare = memberActs / (memberActs + officeRelayedActs)`：**分母不含 unknown**（未被证明的写作既不许抬高也不许稀释比例）；两侧都为 0 时 `memberShare:null`（具名缺席「没有可除的」）——不是 0 分也不是满分。`classifiedBy` 逐类写明读了哪个字段；`means` 写清同一条式子与分母口径。 |
| W2 ★ | 回合行的投递事实 | 行里只有 `status:"undelivered"` + `closedWith`，读不出「提示根本没到成员手上」；即使可推，也没有第四个可判态，`null` 与「好」不可分 | 回合行新增 **四个可判态**：`deliveryUnavailable:null`（尚未决定，开局槽位）/ `true`（投递没到成员，附 `deliveryUnavailableWhy` ∈ `timeout` \| `error` \| `not-configured` \| `engine-lost-reply`，以及 `deliveryUnavailableMeans` 一句「本轮成员未运行，任何写入都不是成员在自己的会话里完成的」）/ `false`（seam 确实把回合交出去了，成功行**显式**写 false）。**投递不可用时 `deliveryPath` 必须是 `null`**：`"caller"` 的语义是「所办**主动选择**播放这一轮」，投递挂掉不是选择 ⇒ 不许把失败洗成路由。同一行**不许**既 `ok:true` 又 `deliveryUnavailable:true`；`deliverMode:"caller"` 不是失败（awaiting 仍是 `"caller"`，不产生不可用行）。该三键同时出现在：抛出 seam 的拒绝对象上（`e.deliveryUnavailable/Why/Means`）、`counts.deliveryLastFail`、以及 `step`/`drive` 失败行（错误事实被抬进回执）。`workShareOf` 读该行时**先**看第四态：其 `writes` 一律计 `unknownActs`，`means` 明说「N 个回合投递不可用，成员未运行」。 |

> **登记面说明（不是生成件）**：`docs/status-report-fields.md` 的生成块只覆盖 **vibe-math-v2/v3/v5** 的 `status()`/`fieldScopes`（门禁 `tests/audit-status-report-fields.mjs` 只读那张表），**不读 vmu 内核**，仓库也没有 vmu 状态面字段生成器 ⇒ `memberWorkShare` 与回合行的 `deliveryPath`/`deliveryUnavailable*` 以**本文件的手写行 + `26-turn-orchestration.md` 的回合行字段表**为契约登记处，不改任何生成件。

### 3.1e RUN 262（TB-2661：预约的会议必须能被「现在开始」）的两条契约增量

> 真机第 76 次运行的取景：会议预约到 `+1h` 后，人已到齐，却**没有任何出口**把它现在开始——`proceed` 只在 `waiting` 接受（`VMU_STATE`），`beat` 只做 sweep、不推进会内时钟；而 `startBlockOf` 的 `nextActions` 早已承诺 `{action:'proceed', why:'the chair may open it early (chair-gated, and the receipt then reads startedLate:true)'}`，是一条**没有机制的承诺**。改动见 `kernel/meetings.js`（`proceed` 增 `scheduled` 分支、改写 `VMU_MEETING_NOT_STARTED` 的 hint、`startBlockOf` 的 `nextActions`）与 `tools/meeting.js`（拒绝事实透传 allow-list 增 `attendance`）。逐条有运行期断言：`tests/vmu-run262-meeting-start-early.test.mjs`（**86/0**；改前 **54/32** 红，证据 `D:/_tmp/tb2661-red.txt`）。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| P1 ★ | `proceed` 在 `scheduled` | `VMU_STATE`「proceed() only applies to a meeting WAITING for its scheduled start」；四席已到齐也开不了会；`nextActions` 里那条 proceed 是空头支票 | `proceed` 在 `scheduled` **接受**：仅**主席**（沿用既有 `VMU_NOT_PERMITTED`，无主席时消息说「无人被授权」），且 `attendanceRuleMet(m) === true`（**复用唯一谓词**，不另写出席算术）。未满足 ⇒ `VMU_STATE` 拒绝，消息含 `X of Y present` 与缺谁，`attendance.missing:[ids]` **具名缺席**（不是只说「人没到」）；该名单同时挂在抛出错误的 `attendance` 事实与工具面回执上（`tools/meeting.js` 的 `refusalDetails` 透传）。满足 ⇒ `state:'open'`，回执带 `startsEarly:true`、`earlyByMs = max(0, scheduledFor - at) > 0`、`scheduledFor`、`startedAt`、`attendance:{met:true,missing:[],electorateSize,electoratePresent,opensOn,means}`、`atSource`（内核钟 ⇒ `kernel-clock`，调用方给 `at` ⇒ `caller`）与对应 `atSourceMeans`；minutes 记 `kind:'proceeded'` + `startsEarly` + 该 `attendance`。`startedLate:false`——`startedLate` 只表示「在约定时刻**之后**开始」，提前开始是相反的事实，不许混用。`earlyByMsMeans` 换成 `SCHEDULED_EARLY_MS_MEANS`（相对 `scheduledFor`），与等待态 wait-relative 的 `EARLY_BY_MS_MEANS` 分开；`waitedMs:0` 并具名说明「等待态的早到量在这里不适用」。 |
| P2 ★ | `beat` 与未开始面的提示 | `beat()` 只做 sweep、不动钟，但 `VMU_MEETING_NOT_STARTED` 的 hint 说「必须先到 `waiting`，然后主席才能 `proceed`」——**唯一出口被写成还没有**；D-2 块还写「REACHABLE INSTEAD: 现在没有」 | hint 改写：`scheduled` 态**现在**就能由主席 `vibe_vmu_meeting {action:"proceed", id:"<id>", member:"<主席id>"}` 开始；出席规则未满足会被具名拒绝并列出 `attendance.missing`；「先 `attend` 补人、再 `proceed`」是完整序列；到点由触碰结算只是**可选**的第二条路。**`beat` 不许被读成推进会内时钟**：`startsInMs` 在 `beat` 前后不变（负例断言钉住），`beat` 回执只报 `sweep.swept`/`sweep.transitions`，不出现 `startedAt`/`state`。`startBlockOf` 的 `scheduled` `nextActions` 同步改为「**仅当出席规则满足**时主席可提前开始，否则拒绝并点名缺席」。 |

### 3.1f RUN 268（TB-2682：每行的 `ackRequired`／`acked`，以及 `unackedRows` 的同名异形）的两条契约增量

> 真机读数的更正：`status().notice` 里的 `ackRequired`／`acked` **本来就在**，但它们是**整箱级**的（「这一箱还有没有东西要 ack」），成员被要求**逐行** ack 时仍分不清「这一行欠 ack」还是「这一行是 group 广播、不需要 ack」；同时 `unackedRows` **同名异形**——在 `status.notice` 里是**数字**，在 `noticeLines()` 的行里是**数组**。改动见 `kernel/mailbox.js`（新增 `settledByAckOf`／`ackReadsOf` 单一派生，`listRow` 与 `list`／`pending`／`noticeLines` 的行、`ack` 回执的 `rows` 全部走它）。逐条有运行期断言：`tests/vmu-run268-mailbox-ack-reading.test.mjs`（**21/0**）。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| Q1 ★ | 行级 ack 读数 | 只有 view 级 `ackRequired`／`acked`（`status().notice`），`pending`／`list` 行上没有这两个名字；`noticeLines()` 的 `entries` 只有 8 字段。成员无法区分 dm（欠 ack）与 group 广播（不需 ack） | **`pending` 与 `list` 的每一行**都带 `ackRequired:boolean` 与 `acked:boolean`，由**唯一派生** `ackReadsOf(member, entry)` 产生：`ackRequired = 该 id 不在 ack 台账里 && channel !== 'group'`，`acked = 该 id 在 ack 台账里`。`list` 行 12 字段（…+`ackRequired`+`acked`）；`ack` 回执新增 `rows:[…]`，是同一次结算中**同一批 id 在结算后**的读数（`acked:true`、`ackRequired:false`），所以「ack 前后假→真」是**同一判据的两个观测面**，不是工具面二次计算（`tools/mailbox.js` 不出现 `ackRequired`，只转发内核回执）。**谁算的**：`kernel/mailbox.js` 的 `ackReadsOf`；`tools/mailbox.js`／`kernel/index.js` 都不许重算。 |
| Q2 ★ | `unackedRows` 同名异形 | `status().notice.unackedRows` 是**数字**（各箱合计），`noticeLines()` 每行的 `unackedRows` 是**数组**（该箱未结算行）——一个名字答两件事，读者无法从名字判断摸到的是哪种形状 | 两种读数**保持**（都已有消费者，破坏性改名会打断既有读面），但**在名字旁显式标注形状**：`status().notice` 里数字旁边有 `unackedRowsAllBoxes`（同值正名）与 `perBox:{member:n}`，`noticeLines()` 行内数组是「这一箱的逐行读数」；文档与提示词必须按「数字=全箱合计／数组=逐行」阅读，新增代码不得再用裸 `unackedRows` 猜形状。 |

### 3.1g RUN 2691（TB-2691：读数面只说实话——同一批行、同一个数字、同一份字节）的四条契约增量

> 真机读数的更正（run 75）：(1) 成员自己写的行与所办代写的行在 `vibe_vmu_records{action:"list"}` 与 `vibe_v5_read_library` 上**逐字段相同**——「谁的行为」只存在于调用现场，从未落库、读面也不说；(2) 所办只查 `vibe_v5_inbox{action:"list"}`（217 次）而不查 `vibe_vmu_mailbox status`（7 次），可 `count` 是**本箱**未读数、不是跨箱欠 ack 数，同一次会话里三个箱各自算过一遍；`unackedRowsAllBoxes` 只在 `vibe_vmu_mailbox status` 上，所办不得不多跳一次；(3) `paper-pdf` 归档行只有正文指纹 `fingerprint`（pdf 100 587 B，正文 ref 归一化后才算），核对器能算文件 sha256 却**无法与行对账**——这是 `ARITHMETIC-BLOCKED` 的根因；(4) 纯读的 `vibe_v5_read_library` 回执复用写面句子「the record was written IN THAT SEAT'S NAME」，读一次库看起来像写了一次。改动见 `vibe-math-vmu/kernel/records.js`（`writtenFrom` 写入时落库＋`beginTurnCaller` 单一现场）、`kernel/mailbox.js`（`noticeBlockOf` 单一派生）、`kernel/latex.js`（同一 buffer 算 `pdfSha256`＋`pdfReading`）、`kit/paper.js`（行体落 sha）、`kit/handlers.js`（两面读带出处；写回执带 `writtenFrom`）、`host.js`／`host-pack-tools.js`（`withWriter` 开关与派发现场）、`packs/v5r/tools.js`（inbox 转发 notice、`read_library` 参数、status 磁盘对账）。逐条有运行期断言：`tests/vmu-run2691-read-faces.test.mjs`（**110/0**）。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| R1 ★★★ | 行的「谁的行为」 | `vibe_vmu_records list`／`vibe_v5_read_library` 的行只有 `owner`／`writer`／`by`（+ 字段来源 `writerSource`，回答「哪个字段」），所办代写与成员亲写**一模一样**；`writerSource` 今天指的是「by→writer→owner 哪个字段答的」 | 写入时由**唯一现场** `kernel.records.beginTurnCaller(member)` 记下这一派发是否跑在该席会话里：`own-turn`（该席自己跑）／`relayed`（office 或其他席以该席名义写、但没在该席运行）／`unknown`（两者都没建立）。行上默认带 `writtenFrom`（= 行为来源），回执带 `withWriter:true`；`withWriter:false` 时行上省略并回执 `writtenFromOmitted:true`（省略本身被回答）。**为什么不叫 `writerSource`**：`writerSource` 已公开回答另一个问题（`by`→`writer`→`owner` 哪个字段答的，见 §3 记录面 `by` 过滤行与 `writerOf`），一个名字答两个问题正是本轮反复消灭的病，故新事实另起名，库头行上的 `writerSource` 语义一字不动。两个读面读**同一批** `records` 行，故不各算一遍。 |
| R2 ★★ | 跨箱欠 ack 数 | 该数只在 `vibe_vmu_mailbox status.notice` 上（`unackedRowsAllBoxes`／`perBox`）；`vibe_v5_inbox{action:"list"}` 只有本箱 `count`／`rows`，所办三次会话里三个箱各算一次 | `kernel/mailbox.js` 新增 `noticeBlockOf(per)` **单一派生**（一次遍历得 `unackedRowsAllBoxes`／`perBox`／`pendingMembers`／`acked`／`ackRequired`／`asOf`／`asOfSource`／`means`），`status().notice` 与 `list().notice` 都返回它；`packs/v5r/tools.js` 的 inbox `list` **原样转发**该块（不二次求和），两面 `asOf` 相同 ⇒ 可逐字段比对。ack 掉一条 ⇒ 两面同时 −1。 |
| R3 ★★★ | 归档 PDF 的文件指纹 | `paper-pdf` 行 body 只有 `{pdfPath,pdfBytes,engine,…}`，`fingerprint` 是正文指纹不是文件 sha256；核对器算得出 `sha256(file)=591d23a6…` 却无法与行对账 ⇒ `ARITHMETIC-BLOCKED` | `kernel/latex.js` 在成功返回里用**同一次** `fs.readBytes` 的 buffer 同时给出 `pdfBytes` 与 `pdfSha256`，并 expose 只读 `pdfReading(pdfPath)`（`{ok,exists,pdfBytes,pdfSha256,why}`）；`kit/paper.js` 把 `r.pdfSha256` 落进 `paper-pdf` 行 body，`compiledPdfRow` 读回；`vibe_v5_paper{action:"status"}.pdfCompiled` 报 `pdfSha256`（行）／`diskPdfSha256`／`diskPdfBytes`／`pdfSha256MatchesDisk`／`pdfSha256Mismatch`，篡改 1 字节 ⇒ 具名 `mismatch:true` 且 `means` 点名 `TAMPERED OR REPLACED` 与两个 sha；旧行缺 sha ⇒ `null`（不是 `false`）且 `missing` 点名 `pdfSha256`。 |
| R4 ★★ | 只读面的归属词 | `vibe_v5_read_library`（纯读）回执带 `memberActedMeans`「the record was written IN THAT SEAT'S NAME」——读一次库，读起来像写了一次 | `READ_ONLY_ACT_FACES`（闭集，当前仅 `vibe_v5_read_library`）在 `host-pack-tools.js` 走独立分支：`viewedBy`／`readForMember`／`wroteAnything:false` + 「this was a READ … wrote nothing in any seat name」；写面保留自己的句子（不是全局删句）——所以「读面不再这么说」与「写面用自己的话说」是两条同时成立的断言；★ **RUN 76 / TB-2710**：写面现在把「记录写在该席位名下」与「内核是否真的投递了该席位的一轮」分开说（`turnDelivered`），不再用 `caller === member` 一个比对回答两个问题。 |

### 3.1h RUN 2699（TB-2699：`proofRefState` 只有一个生产者，`unknown` 只表示「未检查」）的两条契约增量

> 真机读数的更正（run 75）：同一张已存卡，**写面回执**说 `proofRefState:"resolved"`，**读面**说 `"unknown"`——同一个事实两个生产者、两个值域（写面 `resolved|missing|absent`，读面 `absent|missing|unknown`），成员不知道信哪个。更糟的是 `unknown` 一词同时可能表示「查了但解析不了」与「这个面根本没查」，而写面还能在**什么都没量过**时说 `resolved`（内核没有 `library.resolvePointer`、指针是绝对路径、或指针指向一个**目录**）。现在：`packs/v5r/tools.js` 的 `proofRefReadingOf` **量**一次指针（每个面各一次）、`proofRefStateOf` **判**成四个词，写面回执／读存储行／结算回读三处出口全部调用它们；`unknown` 收窄为**只**表示 NOT CHECKED。逐条有运行期断言：`tests/vmu-run2699-proofrefstate-one-producer.test.mjs`（7/0，含三条反关灯）。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| S1 ★★★ | 四个词与它们的生产者 | 写面与读面各一个生产者：写面 `resolved \| missing \| absent`，读面 `absent \| missing \| unknown`；同一行两个答案（`resolved` vs `unknown`）；`unknown` 一名两义 | **唯一判定** `proofRefStateOf({pointer, reading, source})` 返回 `{proofRefState, proofRefStateChecked, proofRefStateSource, proofRefStateMeans}`。四值语义：`absent`＝本行没有 `proof_ref`（没有量可做）；`unknown`＝**本面没有量**（`checked:false`，means 以「未检查（NOT CHECKED）」开头，并给 `vibe_v5_read_library {card:"<id>"}` 这一步）；`resolved`＝**量过**且在库根内解析到真实文件（means 含相对路径与字节数）；`missing`＝**量过但解析不到**（means 含 `reason=…` 与「写进库根相对路径、再登记新卡」这一步，工具名 `vibe_v5_record_proposition`、形参 `proof_ref`/`proof_state`）。**`unknown` 绝不配 `checked:true`；`missing` 绝不配 `checked:false`。** |
| S2 ★★ | 两个读时机的同一个判定 | 读面不解析指针；写面在无 resolver／绝对路径／目录三种情况下照样 `resolved` | `proofRefReadingOf(kernel, pointer)` 是**唯一测量**（无指针／无 resolver／resolver 抛错 ⇒ `checked:false` 并给 `reason`；否则调一次 `library.resolvePointer`，`reason` 直接来自 library：`missing`／`absolute`／`not-a-file`）。写面（`source:"write-resolution"`）、读存储行（`source:"stored-row-read"`）、结算回读（`source:"settlement-read-back"`）都用它；`proofGateOfStoredCard(fields,{reading})` 只**转发**判定结果（`locked`/`reason`/`why`/`nextMove` 语义不变），回执 `proofGate` 与顶层 `proofRefState` 由同一份 `proofGateFinal` 提供。**行为变化（有意）**：①读面现在真解析，完整锁卡可能从 `unknown` 变为 `resolved` 或 `missing`——两面从此必须同词；②写面绝对路径／目录从 `resolved` 变为 `missing` 且锁被推迟（`proofGate.locked:false`，`reason:"complete-but-pointer-unresolved"`）。 |

**F75-14 = ALREADY-TRUE（只核对，不改代码）**：`render` 从不编译（`render()` 只写记录种类，`.tex`/`.pdf` 只有 `compile` 落盘，`renderOkMeans` 与 `missingMeans` 都写明），`ok:true` 是**受理**不是完成（`PAPER_OK_MEANS` 与 `complete` 同源），`renderOkMeans`（`packs/v5r/tools.js:6979-6981`）已答全「写了什么/没写什么/完成与否」。三项断言固化在 `tests/vmu-run2699-proofrefstate-one-producer.test.mjs` §5，不为此造改动。

### 3.1i RUN 76（TB-2713：评审票按 round 有效，作废必须说出来）的两条契约增量

> 真机读数的缺口（run 76）：round 2 的三张 `deliverable:true` 评审票在 round 3 被读成 `stale:["r-acad"]`，不计入本轮覆盖，三次 `advance` 有两次因此回退；回执只给 `stale`/`notYetReviewed`，**没有一句话说「上轮票被轮次边界作废、是谁的哪张行、要重投」**。机制本身正确：一票审的是**它那一轮**的正文（`kit/paper.js` 的 `readReview` 只数 `body.round === state.round`，`durable-other-round` 是 ROUND MISMATCH 不是拒收），所以本轮不改机制，只补读数。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| P1 ★★★ | `advance` 与 `status` 的本轮覆盖读数 | 两张回执都不给「本轮谁已投、谁上轮投过但本轮未投」；读者只能从后续 `stale:[…]` 反推，且不知道作废的是哪一行 | 两门打印**同一份** `perRoundReviewCoverage = {round, expected:[members], covered:[{member,recordId,round}], missing:[members], invalidatedByRound:[{member,recordId,round,why:'previous-round'}]}`，每值带 means 句（`expectedMeans`/`coveredMeans`/`missingMeans`/`invalidatedByRoundMeans`）。算术只有一处：`kit/paper.js#perRoundReviewCoverageOfState`；`advance` 门（`paper.advance` 包装）与 `status` 门（`paper.perRoundReviewCoverage(target)`）都只调用它——两门逐字相等由判据断言，工具面**不许**出现第二份算术。`covered` 要三件事同真：最新评审行的 `round` 等于论文当前 round、`deliverable === true`、`of` 点名**别人**（自审永不计入）；行属于更早的 round ⇒ 进 `invalidatedByRound`（带 recordId 与它所属的 round），不是静默消失。 |
| P2 ★★ | 机制边界（**不改**，写明理由） | 无 | **上轮票作废是刻意的安全设计**：review 行写 `body.round = state.round`，`requireCrossReview` 只数 `Number(b.round) === Number(state.round)`，round 只在两处 `+= 1`（`advance` 的 disagreement 分支与 `final{revise}` 重开写作）；一条旧票不能替新正文作保。本字段是这条规则的**读数**，不是闸门：`missing` 非空时状态机照旧回 writing，`advance` 的 `moved/roundFrom/roundTo` 读数不变。逐条运行期断言：`tests/vmu-run76-round-review-coverage.test.mjs`（86/0，含唯一算术、「missing 不恒空」「invalidatedByRound 逐条带 round 2 的 recordId」「advance ≡ status 的 covered 逐字相等」四条反关灯）。 |

**F75-19 = ALREADY-TRUE（只核对，不改机制）**：`advance` 的 `stale` 列表在「全席都已投」时为空（run 76 现场即是：三席都投了票，所以 `stale:[]`），旧票作废只能从 `invalidatedByRound` 读出——两条同时成立，判据 §4 钉住。

### 3.1j RUN 76（TB-2710：谁跑了这一轮、以及 parked 两个码各自何时适用）的两条契约增量

> 真机读数（run 76）：15 个回合确实在成员自己的子会话里跑完（`deliveryPath`=activation/continuation），但每张回执顶层都是 `memberActed:false`/`callerIsSeat:false`/`ranInOwnTurn:false` —— 因为 office 调用 `vibe_vmu_turn` 时 `caller` 是根会话，而 `memberActed` 只比对了 `caller === args.member`。同一个回执的 `memberWorkShare.memberActs` 却把这些回合算成成员动作。一个字段答了两个问题：**谁调用了工具** 与 **这一轮是谁跑的**。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| A1 ★★★ | `vibe_vmu_turn` 顶层归属三键 | `memberActed` = `caller === args.member`，office 代调一律 false；`turnDelivered` 无生产者（全仓只有两个读点） | 回合结算回执（`kernel/turn/index.js` 的 `step` 成功路径）新增 `turnDelivered`（`deliveryPath === null` ⇒ `null`＝不可读；`"caller"` ⇒ `false`＝调用方代打；one-shot/activation/continuation ⇒ `true`＝席位自己的内核跑了这一轮）＋`turnDeliveredMeans`。`host-pack-tools.js#discloseActOnSeat` 的写面把 `memberActed` 改为 `turnDelivered === true \|\| caller === args.member`，`callerIsSeat` 仍只答「这次调用是否从这个席位发出」，`ranInOwnTurn` 同源；means 逐句说明两者不同问。 |
| A2 ★★ | parked 两码的触发条件 | `VMU_TURN_ALREADY_PARKED`（已有 parked 回合又被要求派下一轮）的 `parkedFacts` 无 `parkedReason`；提示词把**再派同一席**教成 `VMU_TURN_PARKED_NEEDS_OWNER`；`NO_FENCE` 回执无 `starts` | 两码的 `parkedFacts` 都带 `parkedReason`：ALREADY 是「调用方仍握着这一轮，必须先答或 abandon」，NEEDS_OWNER 沿用三值 `no-parked-prompt`／`no-turn-id`／`turn-not-open`；两码 hint **第一句**各自写明「什么时候是这个码」；`packs/v5r/prompts/v5r-blocks-b.js` 的回合循环段改教真实码并写出两个触发器的区别。`VMU_TURN_NO_FENCE` 回执新增 `starts`（`[{tool,op,why,call}]`，`op:"reply"` 优先、`op:"step"` 兼容围栏 JSON）＋`startsMeans`：可执行结构是 hint 句子的机读孪生，不是第二套词表；`stepFailure` 把 `starts` 转发到失败回执，host 漏斗的 `refusalFacts` 自动带上它。逐条运行期断言：`tests/vmu-run76-attribution-and-parked.test.mjs`（含三盏反关灯：`memberActed` 改回常量 false、删 `parkedReason`、删 `starts` 各自必红）。 |

### 3.1k RUN 76（TB-2712：蓝图 live 读数的三种具名缺席与一条真实 seam）

> 真机读数（run 76）：每一轮的状态板都把 `liveReadings.blueprint` 报成 `{ value: null, why: "records.mdParse 没有注入", at: null, atSource: null }`，成员因此从未见过 `[蓝图]` 行。根因不是解析器不在，而是**唯一生产调用点的面没有它**：编排器拿到的是 `facesFrom(...)`，该映射只绑 `STATUS_BOARD_READ_OPS` 声明过的操作，而 `vmu.records` 只声明了 `['list','get']` —— 真正的 `records` 服务（`mdParse`/`mdDigest`/`mdRead` 俱在）从没到达回合层。同时「还没人提蓝图」与「解析器够不着」共用一句话，读者无法区分空研究所与断掉的 seam。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| B1 ★★★ | `liveReadings.blueprint.why` | 所有缺席共用一句中文（`records.mdParse 没有注入…`） | `why` 是**机读名**，`whyText` 保留人话：`no-current-blueprint`（轨上没有行，或行的 md 正文读不到 ⇒ 等于还没有可读草案）、`md-parser-unavailable`（行在、正文在，但 md 解析器解析不出字段）、`records-face-unavailable`（回合层没拿到 `records.list`，或 list 失败/形状不对）。三者互斥；`liveReadings.blueprint` 的 `value` 在缺席时仍为 `null`，`at`/`atSource` 为 `null` 并带 `timeWhy`（RUN 102：不借读取时刻当内容时间）。 |
| B2 ★★★ | 蓝图的 md 解析器从哪来 | 只认 `records.mdParse`；生产面没有 ⇒ 每一轮都是同一句缺席 | 优先用面带来的解析器（外部注入仍可覆盖）；面没有时用**内核自己的** `mdParseText`（`kernel/records.js` 的同一个导出，纯文本函数，不是第二套解析器）。读数 `detail.mdParserSource` 明说这次是 `records.mdParse` 还是 `kernel-own-md-parse`。 |
| B3 ★★ | seam 接线 | `turnFaces = facesFrom(...)` 只绑 `list/get` | `kernel/index.js` 在 `facesFrom` 之后把真实 `records` 的 `mdParse`/`mdDigest`/`mdRead` 绑到 `turnFaces['vmu.records']`（同一实例、同一门；`mdDigest` 让 `draftMdMissing`/`mdChangedSinceIndex` 与 adopt 闸门同谓词）。成功后生产路径的 `status().liveReadings.blueprint.value` 非空、`[蓝图]` 行出现在提示词里，且二者是同一个值。 |

逐条运行期断言：`tests/vmu-run76-blueprint-reading.test.mjs`（§1 空世界的 `no-current-blueprint`；§2 只用 `list/get` 的受限面仍能解析 = 不依赖外部注入；§3 真实内核 `status()` 与提示词同值且 `mdParserSource==='records.mdParse'`；§4 无可解析字段的正文 = `md-parser-unavailable`；§5 两个不同内核时钟 ⇒ 两个不同 `at`，`atSource==='records 的 updatedAt'`）。反关灯：删内核兜底、把两个 `why` 合成一个、把 `at` 写成常量，三者各自必红。

### 3.1l RUN 77（TB-2723：行级 `writtenFrom` 与回合级 `deliveryPath` 必须同源）

> 真机读数（run 77）：同一个回合的回执写着 `deliveryPath:"activation"`、`memberWorkShare.memberActs:8`、`memberActed:true`（席位自己的内核跑了这一轮）；而这一轮的 reply 通道写下的 31 行却全是 `writtenFrom:"relayed"`（办公室代写）。同一个事实，两处读数相反。根因：`writtenFrom` 的派生只认 `ambientTurnCaller`，而那个 seam 只在**工具调用**通道打开（`host-pack-tools.js` 的 `makePackToolSpec.run`），reply 通道把 `progress` 这类字段直接派发到 `vmu.records` 面的 `put`，写行时它一直是 `null`。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| C1 ★★★ | `records.put` 写入行的 `writtenFrom` | `ambientTurnCaller === null` 且写了 `by` ⇒ 一律 `relayed`；reply 通道从不打开 caller seam | `kernel/records.js` 新增与 `beginTurnCaller` 同形的 `beginTurnDelivery({path, turnId, member})`（prev/restore，返回 release）。派生前缀不变（显式 `writtenFrom` 仍最优先）；有投递事实时：`path` 非空且非 `"caller"`（`activation`/`continuation`/`one-shot`/任何宿主 seam 名）⇒ `own-turn`；`"caller"` ⇒ `relayed`；没有投递事实时才回落到原来的 caller 判据（`unknown`/`relayed`/`own-turn`）。更新行继承旧值的分支只在**既无 caller 也无投递事实**时生效。 |
| C2 ★★ | 回合层把投递事实交给写入 | `dispatchReply` 调 `apply()` 时只带 `turnId`/`turnStart`；`apply` 的派发循环对 face 一无所知 | `dispatchReply` 从 `lastAttribution.deliveryPath`（回合行自己用的同一个字段）组 `{path, turnId, member}` 放进 `opts.delivery`；`apply` 的派发循环在调用记录面之前 `beginTurnDelivery(opts.delivery)`，`try/finally` 释放（异常路径也释放；release 自身抛错不覆盖结果）。没有 `opts.delivery` 的旧调用者行为逐字节不变。 |
| C3 ★★ | seam 接线 | `turnFaces = facesFrom(...)` 的 `vmu.records` 面只绑 `STATUS_BOARD_READ_OPS`，没有 `beginTurnDelivery` | `kernel/index.js` 在 TB-2712 的同一段接线里把真实 `records` 的 `beginTurnDelivery` 绑到 `turnFaces['vmu.records']`（同一实例）；此后生产路径写出的行与回合行同源：非 caller 回合的每一行 `writtenFrom` 都不再是 `relayed`。 |

三值判定表（`writtenFrom` 只有这三个值；判定只发生在写入那一刻，行里的值与其 `writtenFromMeans` 必须能对回同一行证据）：

| 写入时的环境事实 | 行的 `writtenFrom` | 那句话的意思 |
|---|---|---|
| 调用方显式给了 `writtenFrom`（三值之一） | **原样保留** | 写入者自己声明来源；派生不覆盖声明 |
| 投递 seam 说 `deliveryPath` 非空且不是 `caller`（`activation`/`continuation`/`one-shot`/任何宿主 verb） | `own-turn` | 该席位自己的会话（或宿主以该席位身份跑的子代理）真的跑了这一轮 |
| 投递 seam 说 `deliveryPath:"caller"` | `relayed` | 调用方亲自扮演了席位，写入是代笔 |
| 没有投递事实，但工具通道开着 `ambientTurnCaller` | `own-turn`（同名）或 `relayed`（异名） | 旧判据：工具调用期间谁在跑 |
| 既无投递事实也无 caller 事实 | `unknown` | 不能证明谁写的；不猜 |

逐条运行期断言：`tests/vmu-run77-written-from.test.mjs`（§1 activation 回合的 reply 写行 ⇒ 行 `own-turn`、回执 `deliveryPath:"activation"`、`memberActed:true` 三处同源；§2 caller 代转 ⇒ `relayed`；§3 显式 `writtenFrom` 仍最优先；§4 集合级交叉断言：所有 `deliveryPath !== "caller"` 的回合行，其 `writes[].recordId` 指向的每一行都不得是 `relayed`，且这些写非空——单行绿不算绿）。反关灯：改回只认 `ambientTurnCaller`、把 caller 也判成 `own-turn`、删掉 `opts.delivery` 的传递，三者各自必红。

### 3.1m RUN 77（TB-2724：读者面的四条读数）

> 真机读数（run 77，build `f84f6a31`）：(1) `vibe_vmu_turn{op:"step"}` 的 `notices` 报 `{lines:0,rendered:false,blockChars:0}`，整段 `[新到的消息]` 从提示词消失——而提示词自己教「无未结算行时块头仍渲染具名空」；(2) 三次装配都只有 `[论文]`/`[结题]`，`liveReadings.blueprint.why` 已是机读名 `no-current-blueprint`，却没有任何一行说「蓝图没有现行版」；(3) `r-temp`（非选举席）的判断只进 `solvedThisRound`，`closureVote.notEligible` 只收录投过票的席位，`notEligibleMeans` 承诺的「recorded」对纯判断行不成立；(4) `vibe_vmu_turn{op:"status"}` 的 `originalBytes` 实测 51 988 B，被宿主 12 000 B 的预算截断，board 需要的四块与整本回合台账混在同一份回执里。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| A1 ★★★ | 空通知块 | 零未结算行 ⇒ 不渲染通知块，回执 `{lines:0,rendered:false,blockChars:0}`；读者看不出「看过了、确实没有」与「这一段被吞了」 | 零未结算行仍渲染**具名空**：块体 `[新到的消息] （无未结算行）`，回执 `notices:{lines:0,rendered:true,blockChars:15,namedEmpty:true}`。渲染器对空输入仍返回 `''`（`kernel/notices.js` 的零机制不变）；具名空只在**回合装配处**补：先试 `noticeBlock([])` 的文案，渲染器不给就用 `INBOX_HEADER + ' （无未结算行）'`。有行时 `namedEmpty:false`、块首仍是 `[新到的消息]`、第二行是行体——「有行」「无行」是同一判据的两个观测面。 |
| A2 ★★ | `[蓝图]` 具名缺席 | `renderLiveStatus` 对 `value===null` 的组一律 `continue`（注释写明是 RUN-258 的取舍），于是 `why:"no-current-blueprint"` 这条读数只存在于 JSON，提示词里没有一行 `[蓝图]` | `why` 是机读名，渲染层只对 `key:'blueprint'` 的 null 组说话：`why==='no-current-blueprint'` ⇒ `[蓝图] 无现行版（rev 0，md 未落盘）`；其它非空 `why` ⇒ `[蓝图] 读数不可得：<why>`。`why` 为 `null`/空串的组**仍静默**；`paper`/`closure` 的缺席本轮仍静默（它们的读面另有 lane）。 |
| A3 ★★★ | `notEligible` 的行形状 | 名字数组，只收「投过票但没有选举权」的席位；r-temp 的纯判断（`solvedThisRound`）不在里面，尽管 `notEligibleMeans` 写的是 recorded | `closureVoteOf({...,solvedThisRound})` 产出 `notEligible:[{member, solved, why:'no-closure-vote-permission'}]`——来源是 votes 与 solvedThisRound 两个 Map 的并集，按 member 去重，有选举权的席位不收录；`solved` 只读投票值与判断值，不猜。board 面的 `notEligible` 仍映射成**名字数组**（既有消费者不变），另给 `notEligibleJudged`（同一批行）；`detail.notEligible` 保持名字数组并追加 `detail.notEligibleJudged`。 |
| A4 ★★★ | `status` 的可截断切片 | 只有全量回执（51 988 B），board 要的四块被账本字段挤到宿主预算之外 | 内核 `status({detail:'board'})` 在组装前早返回 `{ok,apiVersion,action:'status',detail:'board',detailMeans,turnLoop,memberWorkShare,closureVote,liveReadings}`；四块与 full 回执的同名键**逐字相等**（同一份读数，不是二次计算）。`tools/turn.js` 的门接受 `closure|board`，board 命中时直接转发并带 `detailMeans`；非法值 ⇒ `VMU_INVALID_ARGUMENT`，hint 列允许值（工具面 `closure \| board`）。实测 board 7 031 B / full 27 761 B。 |

运行期断言：`tests/vmu-run77-reader-readings.test.mjs`（**39/0**；§0 源码五条具名形状、§A 空/有行两世界、§B 三份装配与反例 `why`、§C 对象行与 turn-level 同源、§D 四块逐字相等 + 字节数 + 非法 detail 具名拒）。改 pin 的旧世界已写进断言注释：`tests/vmu-run249-notice-and-reply.test.mjs` §1d/§1e/§4d（「零未读完全不渲染」不再成立）、`tests/vmu-run256-status-block-live.test.mjs` §1（「全空块与 pre-RUN-258 逐字节相同」不再成立）、`tests/vmu-run169-institute-closure.test.mjs` §2 与 `tests/vmu-run192-vote-counts.test.mjs`（`notEligible` 从名字数组变对象数组）。

**既有产品缺口（只报不改，修点在禁碰文件）**：`vibe_vmu_turn{op:"status"}` 的 `closureVote` 在工具面被 `kernel/index.js#closureVoteView`（`kernel/index.js:3241`）覆盖，而它的输入 `closureVoteInput()`（`kernel/index.js:3195`）不传 `solvedThisRound` ⇒「只写 `solved`、未写 `vote_solved`」的判断行在**工具面**的 `notEligible` 仍不可见（turn-level `kernel.turn.status({roster,may})` 已可见）。修法：让 `closureVoteInput()` 把 `turn.status().solvedThisRound` 交给 `closureVoteOf`。

### 3.1n RUN 78（TB-2730：结题票渠道可证化 + 台账第四键 + `child-error`）

> 真机读数（run 78，build `f84f6a31`）：(1) t-3/t-6/t-7 是**所办代传**的回合，回复里带 `vote_solved`，结算回执出现 `effects:[{kind:"closure-vote",member:"r-1",solved:true,source:"reply",durable:true}]`、`closureVote.votesCast` 从 1 变 2，且**没有** `kept:false` 行——「工具可见时不许用回复投票」这条硬门在本该拦住的回合里没有触发；(2) `turnReceipts[].notices` 只有三键，`namedEmpty` 缺失，读者无法从台账行区分「具名空块」与「没有块」；(3) t-4 的子会话以 `stopReason="error"` 结束，`deliveryUnavailableWhy` 却写 `not-configured`——「没配置」与「配置好了但子会话自己失败」被读成同一件事。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| D1 ★★★ | 结题票渠道的判据 | `apply` 的 `vote_solved` 分支读 `visibleToolsByMember.get(id) \|\| []`——该表只由「宿主 provider 返回数组」的装配写入；代传回合拿不到活的 member Agent（`host.js:2609-2626` 经 `resolveMemberAgent` 抛错），表为空 ⇒ `[]` 被读成「工具没挂」⇒ else 分支 `recordClosureVote` **计票** | 每个回合在装配时按 `turn.id` 记录**三态可证事实** `mountedToolsByTurn`：`provable:true` + 真实宿主工具表 / `provable:false` + `why`（`provider-threw:<code>`、`provider-returned-null`、`no-visible-tools-provider`）/ **无条目**——RUN 79 起「无条目」不再等同于 `legacy-row`：它由 durable `turns` 行上的 `loopEpoch` 与 FIFO 逐出记录再分成三格（见下表 a 的后三行）。`apply` 按序判定并逐条具名：`tool-used-this-turn`（本回合已用工具投过）⇒ kept:false；无 `opts.turnId` 的直接 `apply()` ⇒ 保留 RUN 39 旧语义（生产回复恒经 `dispatchReply` 带 turnId，注释写明这是兼容路径）；有 turnId 无事实 ⇒ `legacy-row`；不可证 ⇒ `tool-visibility-unprovable`（reason 带 `mounted-why:*`）；可证且含 `vibe_vmu_vote` ⇒ `tool-visible`；可证且不含 ⇒ **唯一采纳分支** `tool-not-mounted`，行带 `kept:true` + `adoptedBecause`。直接效果：代传/驱动回合的回复投票不再计票，且回执说明原因。 |
| V2 ★★★ | 台账行的第四个通知键 | 生产者（`assemble`）自 RUN 77 起就产 `notices:{lines,rendered,blockChars,namedEmpty}`，装配回执也带；台账行 whitelist（`noteTurnReceipt`）只搬三键 ⇒ 行读不出「具名空」 | 白名单原样搬运第四键：`namedEmpty` 为 boolean（RUN 78+ 生产者写的行 `namedEmpty === (lines === 0)`），非 boolean ⇒ `null`（`null` = 该行写于键存在之前，本 loop 无法证明，绝不是 `false`）。`turnReceiptsMeans` 两处句子改四键并新增一句解释三个层各自落地。**教训（§355）：同一个读数在「生产者 / 装配回执 / 台账行」三层各落地一次，报缺口前先问是哪一层丢了，不要把三层混成一层。** |
| U ★★ | 投递不可用的第五类 | `deliveryUnavailableWhyOf` 把 `VMU_ENGINE_UNAVAILABLE` 且非 `handed back no reply` 的一律归 `not-configured`；子会话 `stopReason="error"` 的抛点（`kernel/turn/index.js:919-921`）正落在此 | `DELIVERY_UNAVAILABLE_WHYS` 增第五值 `child-error`；在 not-configured **之前**判 message 含 `the child returned no text` 或 `stopReason=error` ⇒ `child-error`（配置没问题、子会话跑了但自己失败）。`deliveryUnavailableMeansOf` 对 `child-error` 与 `not-configured` 各给一句区分，seam 错误、回合行、`deliveryLastFail` 仍命名同一个 why（一套分类，三处落地）。 |

运行期断言：`tests/vmu-run78-closure-vote-channel.test.mjs`（**42/0**；§0 源码九条具名形状、§D1 六夹具（工具可见 / 可证空表 / provider 抛错（run-78 形状）/ 非数组 / legacy 行 / 无 turnId 兼容）、§V2 空队列与有队列两世界、§U 五类 + 端到端回合行同名、**§T1 模拟重启 + §T2 模拟逐出（RUN 79 / TB-2735 新增，六夹具期望值未改）**）。另 `tests/vmu-run2735-mounted-facts-durable.test.mjs`（**23/0**：§0 源码九条、§R 重启、§E 逐出 + 新回合仍采纳、§L legacy/兼容两条旧名仍精确、§M durable 行带 epoch）。`tests/vmu-run77-reader-readings.test.mjs` 增 §A2（43/0），从**台账行**读同一读数，证明三层中的第三层已补。既有套件回归：run169 29/0、run192 3/0、run249 45/0、run250 48/0、run254 52/0、run256 61/0、run257-delivery-unavailable 59/0、run263 50/0。

**（a）结题票渠道判定表（三态 × 五 why）**——`apply` 只在这张表的最末一行计票，其余每行都写明「为什么不计」：

| 事实状态 | 判据（按序，先命中先停） | `kept` | `keptWhy` | 计入 `closureVote.votesCast`？ |
|---|---|---|---|---|
| 本回合已用 `vibe_vmu_vote` 投过 | `toolVotedThisTurn.has(member)` | `false` | `tool-used-this-turn` | 否（同票不双写） |
| 无可证事实，但调用方**没有** `opts.turnId` | 直接 `apply()`（run169 的合约） | `true` | `no-turn-row-compat` | **是**（唯一兼容路径；生产回复恒经 `dispatchReply` 带 turnId，故无漏洞） |
| 无 turnId 形状不符（不是 `t-<n>`） | `!validId` | `false` | `legacy-row` | 否（裸行：从来就没有事实可丢，读者不必找老代码） |
| 有 turnId，本 loop **开过**该回合但从未装配 | `turns.has(turnId) && !mounted.has(turnId) && !evicted` | `false` | `legacy-row` | 否（本 loop 从未就该回合挂过工具表，不是遗忘） |
| 有 turnId，durable 行记的 epoch **≠** 本 loop | `turnLedger.epochOf(turnId) !== loopEpoch` | `false` | `tool-visibility-unknown-after-restart` | 否（事实随**上一个进程**一起消失；读者应调低对该回合投票的期待，或让回合重开，而不是去翻旧代码） |
| 有 turnId，同 epoch、本 loop 开过、FIFO 逐出过 | `epochOf===loopEpoch && turns.has && evictedTurnIds.has` | `false` | `tool-visibility-evicted` | 否（事实被 512 回合上限挤掉；修法是抬 cap，**不是**重启问题） |
| 有事实但 `provable !== true` | `why` = `provider-threw:<code>` / `provider-returned-null` / `provider-returned-<typeof>` / `no-visible-tools-provider` | `false` | `tool-visibility-unprovable` | 否（**run-78 的洞**：旧代码把这一格读成空表并计票） |
| 可证且工具表**含** `vibe_vmu_vote` | `provable === true && tools.indexOf(...) !== -1` | `false` | `tool-visible` | 否（硬门：工具可见时回复字段静默忽略） |
| 可证且工具表**不含** `vibe_vmu_vote` | `provable === true` 且不含 | `true` | `tool-not-mounted` | **是**（唯一采纳分支；行带 `adoptedBecause` 说明「该回合挂了 N 个宿主工具、没有一个是结题票」） |

**（a-1）「无事实」的三格如何被证明（RUN 79 / TB-2735）**——判据不是「map 里没有」，而是 durable 事实：

| 证据 | 位置 | 怎么读 |
|---|---|---|
| 每个 loop 的身份 | `kernel/turn/index.js` `loopEpoch = 'loop-' + process.pid + '-' + (++LOOP_EPOCH_SEQ)` | 同进程两个实例不同（计数器），真重启不同（pid）。**不是时钟读数**，不回答「何时」，只回答「是不是我这一个 loop」 |
| 回合行上的 epoch | durable `turns` 行新增 `loopEpoch` 列（`kernel/index.js#turnLedger.record` 写入，`foldRow` 同回合继承、新回合重置） | `epochOf(turnId)` 同步读 fold：行的 epoch ≠ 本 loop ⇒ 该回合由**上一个进程**装配 |
| 被逐出的 id | `evictedTurnIds`（`EVICTED_TURN_IDS_CAP = 2048`，只记 id） | 同 epoch + 本 loop 的 `turns` 表有它 + 逐出集合有它 ⇒ FIFO 挤掉，不是重启 |
| 两者都没有 | — | 真 `legacy-row`：id 形状不符，或本 loop 开了却从未装配——**从来就没有事实** |

读者下一步：看到 `unknown-after-restart` 不要查代码，去查**进程边界**（回合是否在重启前装配、回复是否跨进程迟到）；看到 `tool-visibility-evicted` 不要查代码，去查**容量**（512 回合 FIFO，长跑里超过 512 回合的旧回合必然落此格）；只有 `legacy-row` 才值得怀疑「这一行是谁写的」。三格都 `kept:false` 且都不计票——诚实的是原因，不是结果。

**（b）`namedEmpty` 的三层落地**——同一个读数在**生产者 / 装配回执 / 台账行**三层各落地一次，任何一层缺键都是缺陷，报缺口必须按层报：

| 层 | 位置 | 落地形态 | 缺这层时的症状 |
|---|---|---|---|
| 生产者（装配时计算） | `vibe-math-vmu/kernel/turn/index.js:3214` 附近 `assemble` 回执 | `notices:{lines, rendered, blockChars, namedEmpty}`（`namedEmpty` = 本轮是否渲染了具名空块） | 没有事实可搬（RUN 77 起已具备） |
| 装配回执（当场调用者看到的） | 同一个 `assemble` 返回值，同上四键 | 四键 | 调用者只能看块体文本猜（RUN 77 A 已补） |
| 台账行（结算后 status 读者看到的） | `noteTurnReceipt` 白名单 `kernel/turn/index.js:2886-2891` → `turnReceipts[].notices` | 四键；非 boolean ⇒ `null`（`null` = 行写于键存在之前，非 `false`） | 台账行读不出「具名空」与「没有块」的区别（**RUN 78 的洞，本票补的是搬运**） |
| 台账行说明（means） | `turnReceiptsMeans`（`kernel/turn/index.js:6893`） | 两处句子都写四键并解释三层 | 读者不知道行形状，按三键写代码（本票同步改） |

> **§355 教训**：同一个读数在「生产者 / 装配回执 / 台账行」三层各落地一次；报缺口前先问是哪一层丢了，不要把三层混成一层（FEEDBACK78 曾把「台账行只有三键」误报成「源码没有 namedEmpty」）。

### 3.1o RUN 78（TB-2734：两条「回执读起来像另一件事」的小读数）

> 真机读数（run 78，FEEDBACK78 待定位节）：(1) 议程 `"学术交流：抽屉配对 (2k-1,2k) 互质表述与证明规格"` 被读面切成 `["学术交流：抽屉配对 (2k-1", "2k) 互质表述与证明规格"]`——数学里逗号是**元组分隔符**，`(2k-1,2k)` 是一条命题；(2) paper `render` 回执只有 `wroteToLedger:["md","tex","meta"]`（kind 列表），读者要另跑 `read_library {track:"paper"}` 才知道刚写的三行是 rec-29/30/31。

| # | 面 | 改前（真机读数） | 改后（契约） |
|---|---|---|---|
| A1 ★★★ | 议程 `agendaItems` 的切分 | `AGENDA_ITEM_SEPARATORS = /[;；、,\n]/`：读面认 `、` 与 `,`，而写面（`packs/v5r/tools.js`）只把数组议程用 `"; "` 拼成一行 ⇒ 多认的两个字符不是 join 的逆，切坏数学元组 | 集合恰为写面能产出的分隔符：`/[;；\n]/`。`(2k-1,2k)` 原样留在**一条** item 里；`、` 与 `,` 留在 item 内部（用它们的散文列表读作一条，`agendaItemsMeans` 明说）。空串 ⇒ `[]` 且 means 仍有解释（缺席不是错误） |
| A2 ★★★ | paper `render` 的行 id | 回执只有 kind 列表；`kit/paper.js` 的 `render()` 拿到 `records.put` 的 `{ok,id,rev}` 后 `wrote: Object.keys(wrote)` 把 id 丢掉 | `render()` 返回 `wroteIds:{md,tex,meta}`（取自**本次** put 的返回值，不事后 list 反查——多版本/并发 render 会含糊）；工具面回执投影 `recordIds` + `recordIdsMeans`（是**行 id**，不是文件路径；`diskFiles` 另答文件）。kind 未由 format 请求时该键缺席，不写 null |

运行期断言：`tests/vmu-run78-small-readings.test.mjs`（**29/0**；§0 三处源码 pin、§1 元组逗号/三种真分隔符/空串、§2 三个 id 都能 `records.get` 且 kind 对得上、means 拒「文件路径」读法）。改 pin 的旧世界：`tests/vmu-run239-meetings.test.mjs` §0 源码 pin（旧 regex 含 `、`/`,`）、§4 夹具（原来靠这两个字符凑 5 条，现只靠 `;`/换行）、`agendaItemsMeans` 的 `order preserved` 旧句（新句改为 `order is preserved` 并补「NOT separators」）。回归：`vmu-run221-feedback56`（`wrote` 的 kind 列表仍在）、`vmu-run252-paper-artifact-truth`（`wroteToLedger` 语义不变）。


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
| **`math_computation`** ✓**已接入（2026-10-09 完成 ✓）** | **共享模块**（清点判决"原样复用" ✓） | `vibe-math-vmu/math-computation.js` ＋ `kernel/math.js` 适配 ＋ **`host-math.js` 真宿主接缝** ✓ | 名字**不改为** `vibe_vmu_*` ✗：改名会破坏各预设的**字节一致性**（`audit-math-computation-parity` ✓），且 v2–v5r 全用此名 ✓；旧名↔新名的映射由 **pack 别名层**（D6）负责 ✓。**出现条件**：插件行声明 `math: true` 或任一 `vmu.math.*` 键 ✓（未声明 ⇒ 不发布 ✓，零机制 ✓）；接缝提供 `register/params/projectRoot/writeText/readText/exists/listDir/resolveExecutable/spawn/log` ✓，`spawn` 走 `host-spawn.js`（调用时解析 ✓）；宿主无 `subprocess` 服务时，声明过 `vmu.math.*` 的部署走同一文件里的 `localFallback`（`node:child_process`，**同一套守卫**：可执行文件必填／参数数组／CWD 策略／输出上限／真能终止的预算），结果带 `seamKind`，`status.math.spawnSeamKind` 明说这次走的哪条（G1 ✓）。★ **R94**：`value` 是**引擎打印出来的那段文本**；★ **R96**：`math_computation` 自己的回执也带 `value`/`valueMissing`（与策略面共用 `math-computation.js#printedValueOf`，不再是一个入口一个形状）；`mode:"expr"` 走各引擎的 `exprPrint`（求值**并打印**），什么都没打印时回执是 `value:null` + `valueMissing:"stdout-empty"` + `valueMeans` —— **绝不把空输出读成 0**（`mathEngineOverride` 也接受 `exprPrint`） |

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
### 6.0 时钟契约（RUN 256 / TB-2623）

> **任何落到磁盘或回执里的时间戳都必须来自内核注入的 clock**（`kernel.clockguard.now()`；`vibe_vmu_clockguard` 面可读它的来源），不许产品代码直接读墙钟。内核只接受**数字毫秒**时钟（ISO 字符串会给具名拒 `VMU_CLOCK_UNGUARDED`）；pack 模块层另接受 ISO-8601 的 `at`。**语料可逐字节复现是产品承诺**：固定 clock 跑同一场景两次，产物 md 必须逐字节相同、语料里的 ISO 必须全落注入区间。唯一允许的墙钟兜底**每处只有一个且有名字**（`blueprint.clockSources.atSource:"wall-clock"`、`paper.clockSource()`），回执必须自报「这个时刻来自系统钟、不是注入钟」，不许静默混用。常驻门禁：`tests/audit-clock-purity.mjs`（枚举产品代码的墙钟读，未解释的一处即红，并自带 mutant 负例）＋ `tests/vmu-run256-clock-purity.test.mjs`（用与墙钟差十年的注入钟走 codesign/adopt/records/paper 四条写路径的混存判据）。
>
> ★ **同一个契约也管 id（RUN 257 / TB-2634）**：**任何铸出来的 id 都不许来自 `Math.random()`**——那是同一类病：**语料不可复现 ⇒ 判据不可复现**。`consult` 请求 id 的后缀现在由「标题 + 同一台账的单调序号」确定性折叠（同标题同序号 ⇒ 同 id；不同标题/序号 ⇒ 不同 id），随机性只能作为**注入的 seam**（`rand`）使用，缺省必须可复现。常驻门禁：`tests/vmu-run257-deterministic-ids.test.mjs`（同输入逐字相同、两个独立内核同 id、两次真语料 id 集合相同、注入抽样可区分输入，并普查产品代码里的 `Math.random`）。
>
> ★ **legacy 桶：声明，而不是“没有”（RUN 257 / TB-2636）**。`tests/audit-clock-purity.mjs` 里仍有**一部分真实墙钟读**无法迁移，它们被逐**站点**声明（`{file, match, count, owner, why, wouldBeWrongIf, test}`），不是逐文件豁免：**同一个已声明文件里新增一处 `Date.now()` 仍是 FINDING**。**是什么**：决定**真实等待**的墙钟——锁与 parked 提示词的超时/年龄（冻结的注入钟会让 deadline 永不触发、锁无人能放）、原子写 temp 名与 ballot id 的**跨进程唯一性**、心跳存活信号、以及「注入钟给出不可解析值时」那个**唯一有名字**的转换兜底。**为什么允许**：这些值不是「内核何时注意到」，而是「真实过了多久 / 必须全局唯一」；把它们改成注入钟会**改掉语义**（超时失效、id 撞名、心跳冻结）。**怎么核对**：每条必须四字段齐全、`why` ≥24 字、带 `match`/`count` 行锚；`legacyDeclarationProblems()` 判缺字段，匹配数≠声明数即 `staleLegacy`（指向已不存在行的豁免），总数超过 `LEGACY_BUDGET`（26）即失败。**只许减少**：迁移（回执事实走注入钟并带 `atSource:"kernel-clock"`）优先，声明只用于真不能迁的；新增一处墙钟读必须同时交出理由，否则红。门禁：`tests/vmu-run257-clock-legacy.test.mjs`（含负例：只有 `owner` 的声明、过短 `why`、stale 声明、已声明文件里的新读点，四种都必须被抓住）。
### 6.1 公开键（**逐键**：写者 → 读者；`kernel/store.js` 的 `PUBLIC_KEYS` 是**唯一白名单** ✓）

> **口径**：本节**只列公开面**（有读者、语义稳定、pack/preset 可依赖）。白名单里**没有写者的键单列**并标 **未定/保留**——不让部署依赖一个没人写的名字。任何 `patch/read` 都要过白名单（`kernel/store.js:119` 的 `assertKey`；越界 ⇒ 具名拒 `VMU_INVALID_ARGUMENT`，K2 的教训）。**完整键（1228）见 `docs/04`**；这里是**耐久键**（`PUBLIC_KEYS` 21 个，逐一有出处）。
>
> ★ **两张表互补，别只信一张**：**本表**保证"**每个键都有写者→读者**"（文档侧真相源）；**`scripts/audit-projection-census.mjs`**（常驻门禁，读**真装配**）保证"**每条声明真的生效、或具名地不生效**"（`declared` → `attached`／`viaAlias`／`notAttached` 逐条具名，例如面为 null 时的 `VMU_RESUME_NO_TARGET`）。文档说"谁写谁读"，门禁说"这条声明今天到底挂上没有"——两者都要看。

**族 ① · 投影键（耐久；由 `vmu.resume.projections` 声明后**写穿/重放**）**

| 键 | 模式 | 写者（声明后） | 读者（恢复时） |
|---|---|---|---|
| `tasks` | **journal**（记命令 ⇒ hydrate **重放**） | `kernel/index.js:870` 适配行；命令表在 `:965` 一带（`PROJECTION_COMMANDS`，读者不入表） | `kernel/resume.js` `hydrate()`（用**同一批公开方法**重放） |
| `members` | state | `kernel/index.js` 的 `RESUME_PROJECTION_ADAPTERS.members`（`snapshot()/restore(v,{replace:true})` 对；`declareSlots()` 晚创建 ⇒ 它**自己 attach**并先 `read()` 再写，否则 attach 循环只会报 `VMU_RESUME_NO_TARGET`、写穿被 `VMU_RESUME_WRITE_BEFORE_READ` 拒，§104 断点 1/2） | 同上（**面为 null 时**报 `VMU_RESUME_NO_TARGET`，不假装） |
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
| `turns`（R35） | `kernel/index.js:1829` 的 `turnLedger.record()`（`store.patch('turns', …)`：**一席位一行、按 member 原位 upsert**）← `kernel/turn/index.js` 的 `open()` 经 `noteSharedTurn()` 发布，`deliverTurn` 在投递**前** `await` 落盘 | `kernel/index.js` 的 `chairActed()`（`vmu.meetings.chairActRequiresTurn` 闸门：先本实例 `memberTurnCount`、再共享键） | 读失败抛 `VMU_STORE_FAILED`（`chairActed` 记 `vmu chair-act ledger unreadable` 后退回内存）；store 从未 open ⇒ `status().turn.counts.ledgerSkipped`（没有耐久层可写，不是缺陷） |
| `closure_window`（R172） | `kernel/index.js` 的 `reopenClosureVote`（`vibe_vmu_turn {op:"reopen-closure"}` 的唯一写者；`recordsStore.patch('closure_window', …)` 写 `{window, openedAt, why, by}`） | `closureWindowValue()` → `persistClosureVote` 给新票盖窗口号；`closureVoteFoldRows()` 只数当前窗口的行（旧票留档，不再计数） | 无 store ⇒ `reopenClosureVote` 具名拒 `VMU_STORE_FAILED`；回执 `archivedVotes`（留在旧窗口的票数）与 `sessionVotesCleared`（本进程内存票数）分开报 |
| `closure_votes`（R172） | `kernel/index.js` 的 `persistClosureVote`（`recordsStore.patch('closure_votes', 按 member 原位 upsert)`；工具与 turn 回执两条投票通道都经它） | `closureVoteInput` → `closureVotesMerged()`（**先读 fold，再用本进程内存覆盖**，内存更新鲜） | 无 store 时 `vibe_vmu_vote` **具名拒** `VMU_STORE_FAILED`（「cannot leave this process」），回执 `crossKernelScope:'shared-fold'` \| `'this-process'` 自报作用域 |
| `leanlibrary`（R60） | `kernel/lean.js` 的 `archive()`（`attachStore` 后 `store.write('leanlibrary', 合并行)`：按 name 合并在读到的当前值上，**不覆盖别的内核刚加的名字**） | 同面在 `lib()`/`read()`/`archive()` 之前 `readSharedRows()` 折入；装配处 `kernel/index.js` 在 `records.attachStore` 旁 `lean.attachStore(store)` | 没有接缝时 `persistence().shared === false` 且 `means` 明说「只在本进程内」；写失败计数在 `persistence().refused`，**不假装耐久** |

**族 ③ · 白名单内但【未落盘】：只在 `status()` 视图里（**不要依赖文件**）**
`settings.resolved`（`status().settings.resolved`；白名单只为种子 `{}`）、`packs`（`status().packs` ＋ `packNotes()`）、`middleware`（`status().middleware`／`bus.status()`）。

**族 ④ · 无写者键（**结论已下**：删一个、留一个）**：
- ~~`ballots`~~ ⇒ **已删除**（轮 12／task-95，破坏性变更登记见 **§7.1**）：全树零写者、零读者，概念已由 **`ballotbox`** 承载。旧**声明**拼写仍被具名容忍（`PROJECTION_ALIASES`＋告警），故老部署无需改动；直接 `patch('ballots')` 仍**具名拒**（且本来就无写者）。
- `records` ⇒ **保留但不接线**（**带撤销条件**）：`kernel/records.js` 是**内存投影**，持久化**委托给 library 面**（文件头 `:16`）⇒ 本键无写者。★ 若下一次架构复核时仍无写者 ⇒ 按 §7.1 同样流程删除。**部署仍不要依赖它**。

> ★★★ **RUN 2697 / TB-2697：读路径不许回滚行** ✓：`kernel/index.js` 的 `snapshotRecords()` 写折入行时**同时带 `rev` 与 `updatedAt`**（此前只有内容），`records.synchronize` 因此能用 **`(updatedAt, 同毫秒的 rev)` 严格新于本实例持有的行**判断「是否采纳折入版本」——旧的 `!==` 只比内容，本实例自己未确认的旧快照会被当成别人的新版本读回，`writer`／`fingerprint` 随之倒退（实测把 rec-2 的 writer 从 r-acad 拨回 r-1、`updatedAt` 拨成「读的时刻」+61000ms）。
> **(a) 何时采纳**：折入行严格更新（`updatedAt` 更晚，或同毫秒 `rev` 更大）才覆盖本行，采纳时行上保留折入行自己的时刻、不再盖 `now()`；被拒的旧行计入 `shared.staleRows`。**(b) pending 语义**：每次本地 `put`/`supersede` 记下 `(rev, updatedAt)`；折入行**等于**这一对才算「自己的写已落盘」并解除 pending，其余在 pending 期间一律跳过（计入 `shared.heldBack`）——不能拿自己的旧快照覆盖自己。**(c) 判据在哪**：`tests/vmu-run2697-synchronize-no-rollback.test.mjs`（§1 旧折不回滚、§2 别内核真写的新版仍采纳 = 保住 RUN 129、§3 两处 mutation 红证明）。

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
| **`records.put` 的同 id 更新改为「按字段合并」**（`kernel/records.js` 的 `put` update 分支；新参数 `bodyMode:'replace'\|'append'`；新回执 `updated`／`rev`／`versionsCount`／`fieldsKept`／`fieldsReplaced`／`bodyModeUsed`／`bodyModeMeans`，`fieldsKeptWhy.title` 说明"id 不是名字"） | 2026-11-05（RUN 236 / M4） | 实测（`FEEDBACK60` §M4）：r-1 用同一个 id 做「补正」，回执 `ok:true`，读回却是 `title` 退回它自己的 id（`rec-6`）、`value` 退回、整行 `- debateRuling：…` 消失；同一次写还把 `rev` 归 1、`createdAt` 重置、`versions` 清空 —— 读者以为在补充，实际在重写，且没有任何字段告诉他丢了什么。根因：`put` 对每次写都**整行重建**（旧行对象不参与），而 kit 卡路径在调用方没给 title 时把「行自己的 id」当 title 传下来 | 破坏性：**rev 语义变了**（同 id 更新从「重置为 1」变为「+1」，与 `supersede` 一致）；`createdAt`／`slug`／未命名的 `title`／`kind`／`tags`／`permanent`／`by` **保持原值**（此前会被默认值覆盖或清空），旧行状态进 `versions`。迁移：依赖「re-put 后 `rev===1`」的读者改读 `updated`／`rev`；正文仍默认 `replace`（旧正文作为版本留痕，`vmu.records.history.storeMode:'full'` 时才存全文，`'diff'` 下给变更字段与字节数）；要「接着写」用 `bodyMode:'append'`，而 `bodyMode` 只能出现在更新上（对新增具名拒 `VMU_INVALID_ARGUMENT`）。判据：`tests/vmu-run236-record-merge.test.mjs` |
| **记录面「三种人称」：`owner`／`writer`／`by` 各自定义，且写者随本次写更新**（`kernel/records.js` 的 `THREE_NAMES_MEANS`／`identityEcho`／`put` 回执／`get`／`list`／`supersede`；`kit/handlers.js` 的 `mergeEcho`；`kernel/index.js` 的 `snapshotRecords`） | 2026-11-05（RUN 240 / H · FEEDBACK63 ①1＋①10） | 实测（`run 63`，用户 `r-acad` 用 `bodyMode:"merge"` 改 `r-1` 的命题卡）：写回执只有 `fieldsReplaced:["body","by"]`，**没有 `writer` 一个字**；随后 `vibe_vmu_records {action:"expand"}` 读回 `owner:"r-1", writer:"r-1"` —— 更正被报告了，更正者没有。根因两层：① 回执与卡片面（`vibe_v5_record_proposition` 走的 `mergeEcho`）各自维护**白名单**，put 新增的写者字段被逐层挡掉；② 耐久快照 `snapshotRecords` 把 VIEW 的 `owner`（卡主）写进 fold 行的 `by`，一个名字承载两个事实，重启后写者必丢（同一内核读 `r-acad`，新内核读 `r-1`）；`supersede` 也只把 `by` 写进版本行、不移动卡片写者。现在：**`owner`＝这一行归谁（首版作者，更正不改变归属）**、**`writer`＝写出本次读到这一版的写者**、**`by`＝写面的叫法（卡工具把本次 `member` 作为它传下来）**，三者一句话定义表 `THREE_NAMES_MEANS` 随写回执／`expand`／`list` 一起返回（`ownerMeans`／`writerMeans`／`byMeans`／`threeNames`，卡片面另给嵌套 `identity` 以防上层把 `ownerMeans` 重写成 null）；`list` 的默认头部字段新增 `writer`；耐久 fold 行同时存 `by`（写者）与 `owner`（归属），旧 fold（只有一个名字）按 `owner = writer` 诚实采纳 | 破坏性：**`list` 头部多一个字段**（`writer`），严格按键数断言的消费方需加一；`records.put` 的 create 回执多了 `owner`／`writer`／`by`／四个 means 键；`supersede` 现在**会移动卡片上的写者**（此前写者停在上一版）；**`records.owner` 的语义收窄为「归属」**：此前 `owner` 在 fold 里等同写者、在 view 里等同首版作者，两种读法都出现过，现在只有一种。迁移：要问「谁写了这一版」读 `writer`（或 `by`），要问「这行归谁」读 `owner`；只读 `by` 的旧读者仍然拿到写者名（名字没变，变的是它不再等于卡主）。判据：`tests/vmu-run240-writer-identity.test.mjs` |
| **`settled` 是 `finalAck` 的 deprecated 别名（写入准入声明，不是行状态）**（`kernel/records.js` 的 `put`／`datasetRegister`／`rebuttal`；回执 `finalAck`／`finalAckSource`／`finalAckBy`／`finalAckMeans`） | 2026-11-10（TB-2700） | 此前 `settled:true` 同时被读成「这条记录已定稿」和「允许这次写入」，而该 flag 从不落库；同一个词在约 120 处旧调用者里当领域状态传，闸关（v5r 默认）时值被静默丢弃。现在：写入声明用 `finalAck:true`（调用方 DECLARES this write final，闸消费后不落库），`settled` 仅作为向后兼容别名保留，经别名准入的回执带 `finalAckSource:"legacy-settled"`；两个词都显式给出且相反 ⇒ `VMU_INVALID_ARGUMENT` 具名拒；同时为真 ⇒ 以 `finalAck` 为准且 `finalAckSource:"final-ack"`。别名在调用者迁移（TB-2703）后删除 | 破坏性：写回执新增四个键；`settled:true` 仍可用但不再有任何「记录状态」读法 | 判据：`tests/vmu-run2700-settled-finalack.test.mjs` |
| **记录面 `by` 过滤的写者解析顺序：`by` → `writer` → `owner`（唯一实现是 `kernel/records.js` 的 `writerOf`，`writerSource` 随答案返回；host 不重复实现）** | 2026-11-09（RUN 256 / TB-2617 P0-3） | 实测（audit round14）：同一刻同一查询，内核 `records.list({by})` 报 `excluded:{shapeMismatch:1,noWriter:["rec-1"]}`，工具面同一刻报 `excluded` 全零并主动说「没有行被丢」——两面对「谁写的」与「丢了哪些」各算一遍。现在过滤、`excluded.noWriter` 的具名、`rows.length + excluded 计数 === totalUniverse` 的恒等式与页大小全部由 `kernel.records.list()` 一处算出（`external` 行＝另一 store 的行，由调用方原样交入），host 只转发并保留自己的说明性读数；写者解析只走 `writerOf`（`by` 优先，`writer` 次之，`owner` 仅在两者都缺时兜底，绝不替代同时存在的 `by`），`writerSource` 告诉你哪个字段答的（★ RUN 2691 起：行上新增「该行为是 own-turn／relayed／unknown」的 `writtenFrom`；`writerSource` 一字不改、仍答「哪个字段答的」，见 §3.1g R1；本条是 RUN 256 的历史记录）；`ok:false` 以同一 `code`／`message`／`hint` 原样抛回，不洗成空页 | 破坏性：无（名字不变；只写 `owner` 的旧行仍能被 `by` 过滤命中，来源在 `writerSource` 里）；`list` 工具面新增 `totalUniverse`／`identity`（只增不减） |

---

## 8. Error codes（提案；登记表）

> ★ **轮 2（task-14）新增登记**：下面 §8 的 `R2` 行来自四个新面的接线单（chat/mailbox/panel · resume/human/control · math adapters/jobs）。★ 登记**先于**实现落地是允许的（§8.1 会把未实现的标成提案 ✓）；★ 规则不变：**代码里每个非 `VMU_PACK_` 前缀的 `VMU_*` 字面量都必须在此登记**，否则 `tests/audit-vmu-docs.test.mjs` 的 C 节红 ✗。

> ★ **`REACHABLE INSTEAD:` 是 ASCII 契约标记**：拒绝回执的 `hint` 里出现这个标记之后，替代动作的描述可以用中文（标记本身必须是 ASCII，审计与测试按字面匹配）。

| 码 | 语义 | 何时 | 是否必须具名解释 |
|---|---|---|---|
| `VMU_INVALID_ARGUMENT` | 参数非法（域外/缺失/类型） | 所有工具入口 | ✅ |
| **`VMU_MIDDLEWARE_KIND_UNSUPPORTED`** | **中间件形态不在总线可跑的两种之内**（`rules`｜`module`）；`script`／`plugin` 的真实载体在总线之外（M3＝`kernel/script-bridge.js`＋`vibe_vmu_script`；M4＝消费公开服务的外部 DSH 插件） | 中间件装载（`kernel/bus.js` 的 `add`／`validateEntry`，D-03） | ✅（须点名**真实载体**） |
| **`VMU_PACK_INVALID`** | **pack 声明本身不合法**（例：声明的提示段名不是 kebab-case）；与 `VMU_PACK_MISSING`（装载前置条件缺失）分开 | pack 装载（`kernel/pack.js`，`collectPackSections`） | ✅（须点名**违规项与包 id**） |
| **`VMU_PACK_LOADER_UNAVAILABLE`** | **内核没有装载器可委托**：`kernel.usePack()` 只有一个实现（`kernel/pack.js`），无 `packApplier` 注入时**具名拒**而不是走第二条静默路径（D-02 唯一实现） | 装载（`kernel/index.js` 的 `usePack`） | ✅（须给**注入方式**与替代入口） |
| **`VMU_PACK_PROMPT_POLICY_UNCONSUMED`** | **pack 声明了 `promptPolicies` 但没有消费者**：装载器未拿到 `onPromptPolicy` sink 时具名拒（策略要么被真正接进提示管线，要么别声明） | pack 装载（`kernel/pack.js` 的 `apply`／`plan` warnings） | ✅（须点名**缺哪个 sink**与如何提供） |
| **`VMU_PACK_PROMPT_POLICY_FAILED`** | ★ **PHASE 6 · 轮 11**：★ **一条 pack 提示词策略在合成或 apply 时抛错** —— ★ 由 `composePromptPolicies` 捕获并**点名 policy id ＋ 原始错误**；★ 回合循环把它变成**具名拒**，★ **绝不静默跳过** | 提示词管线（`kernel/pack.js` 的 `composePromptPolicies` → `kernel/turn/index.js` 装配） | ✅（★ 须同时给出 policy id 与原始原因；★ **不许把策略错误当成"没有策略"**） |
| **R96 · `VMU_REGISTRY_BOUNDARY`** | 一个**不跨注册表**的动词被用来指向**另一张注册表**里确实存在的对象（拒绝码不再谎称「对象不存在」；`boundaryOnly:true` + `askedAction` + `registry` + `actionCrosses:false` 都在回执上） | 会议面（`tools/meeting.js#primitiveMissError`） | ✅（须给**真实的动作名**与**交叉集合**；消息第一句就说「只认 PRIMITIVE 表、绝不交叉」） |
| **R96 · `VMU_REGISTRY_BOUNDARY`** | 一个**不跨注册表**的动词被用来指向**另一张注册表**里确实存在的对象（拒绝码不再谎称「对象不存在」；`boundaryOnly:true` + `askedAction` + `registry` + `actionCrosses:false` 都在回执上） | 会议面（`tools/meeting.js#primitiveMissError`） | ✅（须给**真实的动作名**与**交叉集合**；消息第一句就说「只认 PRIMITIVE 表、绝不交叉」） |
| **R120 · `VMU_MEETING_LABEL_MISSING`** | 会议行没有标签人话名 —— 召集者在调用上打开了 `labelRequired`（v5r pack 面**固定打开**，见 `packs/v5r/tools.js` 的召集分支），而这次调用既没给 `title` 也没给 `kind` ⇒ 具名拒，回执点名缺的是「标题或类型」并给两条可复制修法（补 `title` 再召集；或用 `kind` 说明它属于哪类）。服务面默认不要求标签（`labelRequired:false`），所以服务调用与既有夹具不受影响 | 会议召集（`kernel/meetings.js` 的 `openSeq`） | ✅ |
| **R97 · `VMU_PACK_V5R_VERIFIED_NEEDS_JUDGE`** | `vibe_v5_verified_promote` 想把一张 p=0 的卡写进定论轨，但没有带上「一致为 0 的那次裁决」：证伪也是定论，必须说清是哪场辩论判的（p=1 沿用同一道四证据闸） | `vibe_v5_verified_promote` / `verified.js#promoteVerified` | ✅（`debate_ruling{mode:"unanimous",value:0,subject}`；缺它具名拒） |

**R97 · 拒绝回执的附加事实（所有 `VMU_*` 拒绝共用）**：一个拒绝在抛出/返回时附带的事实（`boundaryOnly`、`askedAction`、`actionCrosses`、`registry`、`enforced`、`settingValues`、`shape`、`cause` 以及后续任何新事实）必须原样到达调用者；回执只排除**信封自身的键**（`ok`/`code`/`message`/`hint`）与机器细节（`name`/`stack`），不可表示的值得丢弃而不是让拒绝失败，超长字符串截断。实现只有一处：`vibe-math-vmu/host.js` 的 `refusalFacts()`（面级 `refused()` 与宿主桥 `toHostSpec()` 共用）。

**工具面回执只有一个生产者（TB-2668 / RUN 263）**：工具面（`host.js` 的显式面与 `tools/*.js` 的 `make<Face>Spec`）转发内核回执时必须**整份 spread**，只允许两类附加：①**行列表重命名**（`REKEYED`，物理上只留一个名字，不许 `items` 与 `records` 双名并存）；②内核**没有**的本面读数（纯宿主键须具名，不许借「挑键」丢内核读数）。禁止逐键挑内核回执再手工重建——判据 `tests/audit-host-receipt-superset.mjs` 对每个工具×动作断言 `kernelKeys − hostKeys === 0`（递归一层嵌套，逐条点名 `tool/action/missingKey`），例外只有三张表且每行必须回答「为什么必须这样」：`REKEYED`（行列表重命名，按 row-id 身份验证）、`WRAPPED`（内核回执整份嵌在一个命名空间下，例如 `result`，因内核回执自带 `ok`/`action`，平铺会与面级键撞键——嵌套是消歧，不是隐藏）、`NOT_FROM_KERNEL`（纯宿主合成回执，必须点名组成的各内核视图或宿主部件）。**内核真产出同名键时，该键必须从例外表踢出并由判据变红**——例外表不是永久居留证。

**内核拒绝时已经算出的判定事实，必须出现在回执里；宿主兜底文案不得替代事实（TB-2673 / RUN 263 姊妹条）**：内核在拒绝前已经算出的判定事实（`enforced`／`enforcedScope`／`wouldEvaluate`／`op`／`fired`／`refusedAt`／`missing`／`detail`／`key` 以及后续任何新事实）与成功回执里的读数同等重要——它们必须到达调用者，宿主兜底文案（`message`／`hint`）可以解释拒绝，但**不得替代事实**。面内 `catch` 只许写成 `refused(code, msg, hint, e)`（把 `e` 交给 `host.js` 的 `refusalFacts()`），不许只传 `String(e.message)`；写成 `refused(code, msg, hint)` 就是把内核已经算好的事实丢掉，属**回执回归**而不是简化。实现只有一处：`vibe-math-vmu/host.js` 的 `refusalFacts()`（`host.js:1901`；面级 `refused()` 与宿主桥 `toHostSpec()` 共用）。判据：`tests/audit-host-receipt-superset.mjs` 的 **class B**——Phase 1 覆盖 `host.js` 的 7 个显式面，Phase 2（`--faces spec`）覆盖全部工厂面；反关灯实测：把任一面的 `, e` 删掉 ⇒ 该点回 class B 并点名缺的事实键（例：`vibe_vmu_custody/transfer -> detail`）。

| **R85 · `VMU_CHAT_ALREADY_SPOKE`** | 同一个 `round` 里同一成员**第二次**发言（「单次发言版群聊」的轮记账；当天换新的 round id 才能再说） | 群聊（`kernel/chat.js` 的 `speakRound`；pack 面 `vibe_v5_say` 带 `round` 时） | ✅（须给**本轮已发言的消息 id**与**这一轮还欠谁**；并明说它是**记账＋具名拒**，不是并行隔离） |
| **R2 · `VMU_CHAT_MUTED`** | 发言者在禁言期内发言 | 群聊（`kernel/chat.js` 的 `send`） | ✅（须给**解除时刻**） |
| **R2 · `VMU_CHAT_QUOTA_EXCEEDED`** | 超出 `vmu.chat.speakQuota` 发言配额 | 群聊 | ✅（须给**已用/上限/窗口**） |
| **R2 · `VMU_CHAT_FROZEN`** | 表决冻结期内发言且不属豁免（`vmu.chat.freezeExemptAdmins`） | 群聊 | ✅（须给**冻结的 ballotId**） |
| **R2 · `VMU_CHAT_NOT_ADMIN`** | 非管理员执行管理动作（`vmu.chat.admins`） | 群聊 | ✅（须给**允许名单**） |
| **R2 · `VMU_CHAT_ANCHOR_DANGLING`** | 引用/回复目标不存在（悬空锚） | 群聊 | ✅（须给**悬空 id**） |
| **R2 · `VMU_CHAT_CAP_REACHED`** | 聊天审计环形上限触界（`vmu.chat.historyCap`） | 群聊 | ✅（须给**丢弃条数**） |
| **R2 · `VMU_MAILBOX_NO_SUCH_RECIPIENT`** | 收件人不在册/无法解析（`resolveAudience` 缺或返回空） | 私信（`kernel/mailbox.js`） | ✅（须给**可用入口**） |
| **R2 · `VMU_MAILBOX_ACK_UNKNOWN`** | ack 一个不存在的待投递条目 | 私信 | ✅（须给**已知 id 示例**） |
| **R2 · `VMU_MAILBOX_ALREADY_ACKED`** | ack 一个**已经结算**的条目 —— 投递行早已被某次 ack 收走并进了 ack 台账，重复 ack 不改变任何状态；**与 `VMU_MAILBOX_ACK_UNKNOWN`（真的不存在）分开** | 私信（`kernel/mailbox.js` 的 `ack`；先查 ack 台账再抛） | ✅（须给 **ackedAt**／**ackedBy**／**settledBy** 三个事实，并说明「这一行已经在何时被谁结算，重复 ack 不改变状态」）**验收三款**：① 重复 ack ⇒ 具名码 + 三字段，且拒绝前后 `status()` 快照不变（不搬迁任何状态）；② **校验先于任何状态搬迁** —— 一单里混入已结算 id 时整单拒绝，同单里还开着的行保持原样，不半途 ack；③ 提示行（`[新到的消息]` 块）只对**未结算**行渲染 ack 指令，已结算行既不出现提示行、也不出现在 `unackedRows` 里 |
| **P9R2 · `VMU_MAILBOX_NO_SUCH_ENTRY`** | `open`/`setState` 给了一个不属于该成员信箱的 id（含已 ack 后正文已丢弃的 id） | 私信（`kernel/mailbox.js` ✓） | ✅（hint 指向 `list()`；**与投递层 ack 明确分开**） |
| **R2 · `VMU_MAILBOX_DELIVERY_FAILED`** | 投递失败 ⇒ **不 ack**，留在待投递（缺 `deliver` 缝时也走此路） | 私信 `flush()` | ✅（须给**原始错误**与重试口径） |
| **R2 · `VMU_MAILBOX_ANCHOR_DANGLING`** | 引用已 ack 后删除的正文（只留 `{id,from,at,kind,bytes}`） | 私信 | ✅（须给**悬空引用 id**） |
| **R2 · `VMU_MAILBOX_CAP_REACHED`** | ack 台账/待投递触界（`vmu.mailbox.ackedLedgerCap`／`digestMax`） | 私信 | ✅（须给**丢弃/滞留条数**） |
| **R2 · `VMU_MAILBOX_NOTICE_FAILED`** | 取回合通知块 mailbox 行失败（日志 `type:"mailbox/notice-lines-failed"` 带原始 `code`/`message`）—— **只记审计、回合照跑**，不升级 `VMU_ENGINE_UNAVAILABLE` | 回合装配（`kernel/index.js#noticeSource` 的 `mailbox.noticeLines(...)` 调用点） | ✅（须给**原始 code 与 message**） |
| **R2 · `VMU_PANEL_UNKNOWN_FIELD`** | 写入面板的字段不在固定集合（`overall｜subgoal｜plan｜status｜subtasks`） | 面板（`kernel/panel.js`） | ✅（须给**允许字段**） |
| **R2 · `VMU_PANEL_TIME_KEY`** | 调用方试图自带时间戳（时间由注入时钟决定） | 面板 | ✅（须说明**时钟归属**） |
| **R2 · `VMU_PANEL_NO_SUCH_MEMBER`** | 面板目标成员不存在 | 面板 | ✅（须给**下一步**） |
| **R2 · `VMU_PANEL_DEVIATION`** | 他人改 `overall` 且 `deviationPolicy=refuse` | 面板 | ✅（须给**留痕口径**） |
| **R2 · `VMU_PANEL_CAP_REACHED`** | 面板历史/子任务/查看留痕触界（`historyCap`／`subtasksMax`／`auditCap`） | 面板 | ✅（须给**丢弃条数**） |
| **R2 · `VMU_RESUME_UNAVAILABLE`** | 恢复面不可用（无 store / 无 work 台账） | 断点续跑（`kernel/resume.js`） | ✅（须给**如何提供**） |
| **R2 · `VMU_RESUME_WRITE_BEFORE_READ`** | **写前必读**闸：未先读回就写 | 恢复面 `read/write/patch` | ✅（须给**先读哪个键**） |
| **R2 · `VMU_RESUME_BAD_STEP`** | 恢复步骤不合法（未知步骤/顺序错） | 恢复面 | ✅（须点名**步骤**） |
| **R2 · `VMU_RESUME_INTERRUPTED_NOT_PASSED`** | 在途项未结算就被当作已完成传递 | 恢复面 | ✅（须点名**未结算项**） |
| **R2 · `VMU_RESUME_CHILDREN_NO_PARENT`** | children 读回时这个会话没有父会话（不是「没有子会话」——两件事分开报） | 恢复面的 `children` 步（RUN 158） | ✅（须说清「这个会话没有父会话」而不是「0 个子会话」） |
| **R2 · `VMU_RESUME_CHILDREN_NONE_YET`** | 父会话存在、但目前确实**还没有**子会话 | 同上（RUN 158） | ✅（须区别于「没有父会话」） |
| **R2 · `VMU_RESUME_WATCHDOGS_UNAVAILABLE`** | `watchdogs` 面**未接线**（接口缺失）——不能写成「0 个目标」 | `readBack()` 的 `watchdogs` 步（RUN 158） | ✅（须点名缺的接口） |
| **R2 · `VMU_RESUME_WATCHDOGS_NONE`** | `watchdogs` 面已接线、但**当前确实 0 个**目标 | 同上（RUN 158） | ✅（与「未接线」分开） |
| **R2 · `VMU_RESUME_CHILDREN_PORT_FAILED`** | `children` 面**已接线但查询抛错**——不能吞成「0 个子会话」 | 恢复面的 `children` 步（RUN 159） | ✅（须带端口自己的码/话） |
| **R2 · `VMU_RESUME_WATCHDOGS_PORT_FAILED`** | `watchdogs` 面**已接线但刷新失败**——与「未接线」「0 个目标」都不许同形 | `readBack()` 的 `watchdogs` 步（RUN 159） | ✅（须说清是端口失败） |
| **R2 · `VMU_RESUME_MAILBOX_UNAVAILABLE`** | 需要未 ack 私信面但 `mailbox` 缝缺失 | 恢复面 | ✅（须给**注入方式**） |
| **R2 · `VMU_RESUME_CLOCK_UNAVAILABLE`** | 缺注入时钟（恢复判定需要时刻） | 恢复面 | ✅（须给**时钟口径**） |
| **R2 · `VMU_RESUME_READBACK_DRIFT`** | 写后回读与写入不一致（`vmu.resume.readBack`）。★ **RUN 259 / TB-2647：漂移 ≠ 失败**。回执给 `driftedSteps:["readback"]`（**哪一步**是读回不一致）与 `secondWriter`（盘上的字节**是谁写的**）：`false` ＝ 盘上是**本进程自己早先写过的值**（store 丢了／回滚了我们最后那次写，**不需要第二写者**来解释；`secondWriterMeans` 逐字声明唯一漏洞：第二个写者恰好写了同样字节）；`true` ＝ 本进程持有这些期望期间**零次持久写**，所以是**别人**写的（另一个 kernel／一次恢复／手改 —— 先去找那个写者，不要改内核）；`'unknown'` ＝ 本进程在此期间做过 N 次持久写、而 store 不提供跨进程 provenance ⇒ **报 unknown，绝不猜 false**。**该回执不带 `failedSteps`**（那是 `VMU_STATE` 那类执行失败的字段）；`writesBetween` ＝「上一次回读以来本进程的持久写次数」（每次回读后复位）。 | 恢复面（`vibe-math-vmu/kernel/resume.js` 的 `readBack()`、`vibe-math-vmu/tools/human.js` 的 `action:"readBack"`／`"recover"`） | ✅（须给**两份值** ＋ `driftedSteps` ＋ `secondWriter` 三值含义 ＋ hint 按 true/false/'unknown' 三条出路） |
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
| **R93 · `VMU_MATH_VOCABULARY`** | 规划层的请求没有引擎可执行体（`args` 里没有 `code`/`file`/`expr`），而接进来的缝是**引擎执行**词汇（`op:run` + `mode`） | 数学面（`kernel/math.js` 的 `planToComputationRequest`） | ✅（须给**两种写法**与 `math_computation` 的出路） |
| **R2 · `VMU_REPORT_NO_TRANSPORT`** | 汇报要投递但缺 `deliver` 缝（先留痕，再具名拒；绝不假装发出） | 汇报（`kernel/report.js`） | ✅（须给**注入方式**） |
| **R2 · `VMU_REPORT_ACTION_NOT_ALLOWED`** | 汇报声明里出现动作字段（`action|then|run|drive|decide|execute`）⇒ **汇报不是触发器** | 汇报 | ✅（须说明**汇报只报告**） |
| **R2 · `VMU_REPORT_TEMPLATE_VAR_UNKNOWN`** | 模板引用了未提供的变量 | 汇报 | ✅（须给**已知变量**） |
| **R2 · `VMU_REPORT_TRIGGER_UNKNOWN`** | 触发器种类不在 `event|period|threshold` | 汇报 | ✅（须给**允许种类**） |
| **R2 · `VMU_REPORT_UNKNOWN_NAME`** | 引用了未声明的汇报名 | 汇报 | ✅（须给**已声明名**） |
| **R2 · `VMU_REPORT_CHANNEL_UNKNOWN`** | 通道不在 `vmu.report.channels` | 汇报 | ✅（须给**允许通道**） |
| **R241 · `VMU_TURN_ABANDONED`** | 一个回合被**主动弃置**（`vibe_vmu_turn { op:"abandon" }`），或它抱锁超过 `vmu.turn.abandonAfterMs` 被自动弃置 ⇒ 那一行记 `status:"abandoned"` 且 `codes` 内是本码，**锁随之释放**（下一轮能开），并且从该回合**不施加任何字段动作**（它的报告仍留在 `turnReceipts` 里可读）。弃置是账上的事实，不是失败：`closedWith` 说它怎么结束的 | 回合循环（`kernel/turn/index.js` 的 `abandonTurn`；面在 `tools/turn.js`；设置键 `vmu.turn.abandonAfterMs`） | ✅（须给**被弃的回合 id/成员/门**、`ageMs`、以及「报告没有被应用」这一句） |
| **R236 · `VMU_DIRECTION_INCOMPLETE`** | 方向卡缺**必填**字段（五个：`current_assessment`／`initial_plan`／`feasibility`／`findings`／`reuse`）⇒ 具名拒，消息**点名缺哪几个字段名**并给出必填集合；其余四个字段可为空，读面回 `null` ＋ `fieldsMissing`（空＝没记，不是「没有」） | 方向卡（`kernel/directions.js`；码由模块的 `CODE.INCOMPLETE` 单一来源） | ✅（须点名**缺的字段名**与**必填集合**） |
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
| **R5 · `VMU_TASK_DEPENDENCY_CYCLE`** | **依赖边会使任务图成环**（自环／两节点环／三跳长环）⇒ 具名拒；`detail.cycle` 给**环路径**（如 `['t-3','t-1','t-2','t-3']`） | 任务台账（`kernel/tasks.js:278-281` 的 `cycleRefusal`；抛出点 `:334` `create`／`:354` `setDependencies`） | ✅（须给**环路径**与"删掉环上任一条边"的出路） |
| **R229 · `VMU_TASK_BLOCKED`** | **认领（或主席分派）一个还有未完成 blocker 的任务** ⇒ 具名拒。v5r 旧预设本来就有这道闸（`V5_TASK_BLOCKED`），移植进内核时只剩 `ready:false`：板子一边回答"没就绪"、一边接受认领，而 reply 字段的 hint（`kernel/turn/index.js:139`）已承诺"blocked_by dependencies are refused there by name"。message **逐个点名** blocker 与它的 state（`t-1 (open)`；不存在的依赖写成 `t-404 (does not exist yet)`），`detail.blockers:[{id,state}]`；hint 给两条**真实**出路：让每个点名 blocker 走到 done（唯一路径 `open -> assigned -> doing -> done`，**cancelled 的 blocker 永远不会解封**），或 `set_dependencies` 删掉那条边。blocker 自己成环时改报 `VMU_TASK_DEPENDENCY_CYCLE`（环不可能靠"完成"解开） | 任务台账（`kernel/tasks.js` 的 `blockedClaim()`／`blockerCycle()`；`assign()` 在 `normaliseActor` 之后、总线钩子**之前**抛）。因此 `vibe_v5_task_update {action:"claim"}`（`kit/extras.js`）与主席 `assign` 走**同一条**闸，而 `task_claim` 的 reply 通道本来就是按名字拒的 | ✅（须给**blocker 名与 state**、两条出路，且**不得**承诺"释放/取消 blocker 会解封"） |
| **R2 · `VMU_HUMAN_QUEUE_FULL`** | 待批队列触界（`vmu.human.approvalQueueCap`） | 审批闸 | ✅（须给**当前与上限**） |
| **R2 · `VMU_HUMAN_LIFT_ROLE`** | 解除否决者不在 `vmu.human.vetoLiftRoles` | 审批闸 | ✅（须给**允许角色**） |
| **R31 · `VMU_HUMAN_DECIDER_ROLE`** | **人工审批面的调用者角色不在 `vmu.human.deciderRoles`** ⇒ 具名拒 `decide`／`withdraw`／`veto`，**在任何状态变更之前**；角色＝roster 席位（非成员／root 才是 `office`），所以"填 `by:'office'` 冒充"改不了闸；`enforced[]` 点名声明键（task-22）。**R45 · 同一码也判被代办者**：`by` 缺省＝调用者自己；`by` 是角色名（如 `chair`）或名册成员 id 时，其解析出的角色**也**必须在 `vmu.human.deciderRoles` 里，否则同一码具名拒（message 点名 by 值与解析出的角色，hint 给"用自己的身份"与"把决定权交给成员自己的席位"两条路）——否则 root 会话可 `decide {by:"<member>"}` 把审批记到成员名下（run 45 真机） | 人工审批面（`vibe-math-vmu/tools/human.js` 的 `gateVerb`/`delegateOf`，闸在 `run()` 的 `try` 第一行） | ✅（须给**允许角色**、**声明键**与"默认只有 office"） |
| **R52 · `VMU_HUMAN_CALLER_UNKNOWN`** | **人工审批面的调用者不是 root、也不是本内核认得的成员** ⇒ 具名拒 `decide`／`withdraw`／`veto`／`inject`，**在任何状态变更之前**。`resolveTurnMember` 对"root 会话"与"本内核没见过的非 root agent（成员自己的内核）"都回 null，若把后者当 `office`，成员就能不带 `by` 调 `decide` 把决定记到所办名下（run 51 成员自报，`approval-1`）。判据用 agent id 形状（root 是 `session-…` 或无 id），message 点名该 agent id，hint 指向"在 root 会话做决定"或"让成员自己的回合调用" | 人工审批面（`vibe-math-vmu/tools/human.js` 的 `callerRole`/`gateVerb`） | ✅（须说明调用者 id 与允许角色声明键） |
| **R61 · `VMU_FEEDBACK_ACTION_IS_THE_OPERATION`** | **反馈面把「操作动词」当成了正文的第五个必填字段**：原文的 `action`（「你建议怎么改」）与调度层的 `action`（`op` 的别名）同键 ⇒ 成员写 `{action:"add", …}` 时回执 `ok:true`，落盘行却是 `action：add`，唯一承载建议的字段被写着操作动词（**数据丢失**，run 61 成员自报）。修法：操作是 `op`；正文用 `recommendation`（首选）或旧键 `action`（值不是 add/update/list 时照旧可用）；把操作词写进正文则具名拒本码，hint 点名两个字段 | 反馈面（`vibe-math-vmu/packs/v5r/tools.js` 的 `feedbackBodyAction`/`toolFeedback`） | ✅（须说明 `op` 是操作、建议走 `recommendation`，并说明旧键在什么条件下仍收） |
| **R45 · `VMU_CHAT_SNAPSHOT_INCOMPLETE`** | 持久里的 chat 值不是 v1 快照（`messages`/`mutes` 缺失）⇒ 合并恢复**什么都没采纳、也没动活内存**（`kernel/index.js` 的 `chatReloadMerge`） | 群聊状态的持久化恢复（task-28） | ✅（须说"什么都没采纳也没动活的"） |
| **R45 · `VMU_CHAT_RESTORE_FAILED`** | 合并后的快照交给 `chat.restore()` 时抛错（内核没给码）⇒ 报 `VMU_CHAT_RESTORE_FAILED` + `note` 原文（`kernel/index.js` 的 `reload` 适配） | 同上 | ✅（须给底层原文，不许只报"restore 失败"） |
| **R45 · `VMU_CHAT_RESTORE_REFUSED`** | `chat.restore()` 按名字拒绝合并后的快照（例如 live 已有消息而快照不同）⇒ 报该面自己的码或 `VMU_CHAT_RESTORE_REFUSED` + `note`（`kernel/index.js` 的 `chatReloadMerge`） | 同上 | ✅（须点名"不能半覆盖、消息不丢"） |
| **R45 · `VMU_CHAT_MUTE_FAILED`** | 采纳持久里的禁言行时 `chat.mute()` 自己拒绝（例如成员不存在）⇒ 进 `refused[]` 并带 `code/message`，**不阻断其它行**（`kernel/index.js` 的 `chatReloadMerge`） | 同上 | ✅（须说明是逐行采纳、一行被拒不等于整批失败） |
| **R31 · `VMU_HUMAN_INJECT_ROLE`** | **以人类口吻 `inject` 发言的调用者角色不在 `vmu.human.injectRoles`** ⇒ 具名拒（该面 `sender = from \|\| 'office'`，不校验调用者，所以"人类干预"必须由人类／所办署名送出） | 同上（`inject` 分支） | ✅（须给**允许角色**与**声明键**） |
| **R33 · `VMU_RESUME_HOSTCONTRACT`** | **宿主用自己内部的 TypeError 盖住了真实的续会话拒绝**：`subagents.prompt(request, signal)` 的准入路径第一句是 `options.signal.throwIfAborted()`，而失败路径 `rejectPrompt`→`isCancellation` 又直接读 `signal.aborted`（无 undefined 保护）⇒ 桥少传一个 signal 时，先抛 TypeError、再在拒绝路径抛 `Cannot read properties of undefined (reading 'aborted')`，**真实原因不可见**。本码只在“宿主仍以该形状失败”时出现，message 点名这是宿主缺陷对拒绝的 mask，hint 明说**本回合成员没有运行**（task-23） | 成员回合的续会话桥（`vibe-math-vmu/host-deliver.js` 的 `makeMemberResumeChild`；同一条规则也适用于 `kernel/turn/index.js` 的 `sendViaSubagents`） | ✅（须给**尝试的 session**、**被 mask 的宿主错误**与“成员未运行”） |
| **R2 · `VMU_LEAN_JOBS_MIRROR_UNWIRED`** | Lean 作业镜像声明了但缺 `fs` 缝 ⇒ **不静默**，`admission().fileMirror=false` | 形式化面（`kernel/lean.js`） | ✅（须给**注入方式**） |
| **R2 · `VMU_LEAN_JOBS_DIR_UNSAFE`** | Lean 作业镜像目录越出 root（路径逃逸） | 形式化面（`kernel/lean.js`） | ✅（须给**被拒路径与 root**） |
| **R2 · `VMU_CONTROL_PARAM_UNAVAILABLE`** | 控制面没有设置写接缝 ⇒ 改参不可用（不静默） | 控制面 `tune` | ✅（须给**注入方式**） |
| `VMU_NOT_MEMBER` | 调用者不是可识别成员/角色 | 需要身份的操作 | ✅ |
| `VMU_NOT_PERMITTED` | 权限不足（含中间件拦截） | 写/管操作 | ✅（须说明**谁能做**） |
| `VMU_NO_SUCH_OBJECT` | 对象不存在（悬空 id） | 读/引用 | ✅（须给**下一步**） |
| `VMU_MEMBER_SESSION_NOT_LIVE` | **对象在、只是不 LIVE**（成员的子会话已结束、没有活着的 Agent）——与 `VMU_NO_SUCH_OBJECT` 分开，正因为「一个面刚刚点名了那个 child session，却说它不存在」是自相矛盾的码（RUN 169 / run 15 F15-6；`host.js` 的 `memberWireRefusal`、`kernel/index.js` 的 `toolsView` 降级闸同时接受両码，`vibe_v5_tool_help` 逐字转发） | 成员工具面/子会话 | ✅（须给 **childId** 与下一步） |
| `VMU_MEMBER_SESSION_NEVER_OPENED` | **根本没有子会话**（该成员**从未**开过成员会话）—— 与 `VMU_MEMBER_SESSION_NOT_LIVE`（会话开过、已结束）是两个事实：前者没有可重开的会话，只有可开的会话。由 v5r 工具面导出的纯函数 `sessionRefusalOf()` 翻译内核 `toolsView` 的 `no-live-agent` 降级事实：`cause:"child-session-not-live"` ⇒ NOT_LIVE，其余（没有 childId、从未开过）⇒ 本码；修复前这一事实回落到 `VMU_NO_SUCH_OBJECT`（RUN 251 / F71-8，run 71 C3/C5 实测：同一个「没有活会话」被说了两遍） | `vibe_v5_tool_help` 的读面（`vibe-math-vmu/packs/v5r/tools.js` 的 `sessionRefusalOf`；内核 `kernel/index.js#toolsView` 只提供事实，不改内核） | ✅（须给**可开会话的修法**：先 `vibe_vmu_control {action:"hire"}` 立所，再 `vibe_v5_assign`／`vibe_vmu_turn {op:"drive"}` 开一次会话；`declarationSet` 无需会话即可读。套件：`tests/vmu-run251-tool-readings.test.mjs`） |
| `VMU_STATE` | 状态不允许该操作。★ **RUN 259 / TB-2647**：恢复回执里的 `failedSteps:["ledgers","readback"]` 属于**这一类**（执行失败，要修）；而 `VMU_RESUME_READBACK_DRIFT` 只给 `driftedSteps`／`secondWriter`（漂移 ≠ 失败，可能要去找第二写者），两者不许混用一个字段 | 阶段/流程约束 | ✅ |
| `VMU_RESOURCE_BUDGET` | 触达预算/上限（机器强制） | 工具调用/新建成员/内存 | ✅（须给**当前值与上限**） |
| `VMU_EXTEND_CEILING` | ★ **RUN 256 / F-MX-01（TB-2619）**：**等待期**延长会越过 `vmu.meetings.extendCeilingMs`（等待延长与墙钟延长**共用**这一个预算）。与 `VMU_RESOURCE_BUDGET` 分开，正因为后者是**墙钟** `wallLimitMs` 的既有答案：同一个「延长」动作在两个阶段有两个不同的上限，若都回 `VMU_STATE`，调用者只能读句子分辨「阶段不对」还是「额度用尽」。回执具名 `usedMs`／`step`／`ceilingMs` 与**剩余毫秒**；hint 给不改上限的出路（关掉重开新会） | `vibe-math-vmu/kernel/meetings.js` 的 `extendWall()`（`action:"extendlimit"` 命中 waiting 分支时；开放/recess 的墙钟越界仍是 `VMU_RESOURCE_BUDGET`，两界两名） | ✅（须给 **used + step / ceiling 与剩余 ms**；套件：`tests/vmu-run256-meeting-wait-extend.test.mjs`、`tests/sim-meeting-matrix.test.mjs` 的 C4/C4c 格） |
| `VMU_PACK_CONFLICT` / `VMU_PACK_MISSING` | 整合包冲突/缺失 | 装载 | ✅ |
| `VMU_PACK_DECLARATION_TOO_LATE` | ★ **RUN 256 / TB-2618 + RUN 258 / TB-2649 更正**：整合包在**内核构造之后**才声明**构造期快照**消费的键（`phases` / `noticeBlock` / `meetingTypeCatalog`）⇒ `apply()` 具名拒，点名被拒的键、声明时刻与构造时刻；第一方 packs 必须在构造**之前**完成声明（同一规则见 `kernel/pack.js` 文件头注释）。与 `VMU_PACK_MISSING`（包不存在）／`VMU_PACK_CONFLICT`（包之间冲突）分开：这个是**顺序**错了，时间线上没有合法路径。真能后置生效的 `slots`／`recordTracks` **不**在此闸（`declareSlots`／`declareTracks`）；无消费者的 `office`／`agendaStateMachine` 也**不**在此闸（见下一行的码） | 整合包装载（`vibe-math-vmu/kernel/pack.js` 的 `apply()` → `declarationTooLateError()`） | ✅（须给**被拒的键 + 声明时刻 vs 构造时刻**，并说明「先构造后声明」不可修，只能调整声明顺序） |
| `VMU_PACK_DECLARATION_UNCONSUMED` | ★ **RUN 258 / TB-2649**：整合包声明了 `office`／`agendaStateMachine`，而内核**任何层都没有消费者**（既无构造期折叠目标，也无后置机制）⇒ `apply()` 在任何副作用前具名拒；与 `TOO_LATE` 分开，正因为「提前到 `config.packManifests` 声明」**也救不了**它。修复前的缺口正是这两条被记进「已折」台账，导致只申报 `office` 的 manifest 被 **APPLIED 且零效果**（实测 `appliedPacks=[{applied:0}]`）。折叠台账现在只记**真折成功**的键；`unsupported` 经 `appliedPacks()[i].declarations.unsupported` 与 `packErrors[i].facts` 可读；`plan()` 对这两个键给 warning 并列 `{kind:"declaration", folded:false, consumer:null}` 动作，plan 与 apply 不许各说一套 | 整合包装载（`vibe-math-vmu/kernel/pack.js` 的 `apply()` → `declarationUnconsumedError()`；`foldPackDeclarations()` 的 `unsupportedByManifest`；`vibe-math-vmu/vibe-math-vmu.js` 的 `unsupportedDeclarations` 接线） | ✅（须点名**键 + consumer:null**；hint 以 `REACHABLE INSTEAD:` 开头给唯一可达动作「不要再声明它」，并明说改到 `config.packManifests` 也无效） |
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
| `VMU_MD_READ_FAILED` | md 索引文件**在但读不动**（权限/IO/编码）：回执显式声明「这次读不对内容做任何断言」 ✓ | 记录面 md 索引（`kernel/records.js` ✓ RUN 225-A） | ✅（须给**路径与原始错误**） |
| `VMU_MD_WRITE_FAILED` | md 正文的**原子写**失败（临时文件/rename/权限）——写失败则索引行**不写** | 记录面 md 索引（`kernel/records.js` ✓ RUN 225-A） | ✅（须给**路径与原始错误**，并说明索引未动） |
| `VMU_UNKNOWN` | **只在诊断字段里当兜底标签**（`reindex` 的 `skipped[].why` 里某个拒绝没带 code）；**从不用作抛出码** | 记录面 reindex 诊断（`kernel/records.js` ✓ RUN 225-A） | ✅（是标签不是判决） |
| `VMU_RECORDS_REINDEX_BLOCKED` | ★ **RUN 259 / TB-2650（sim 门禁实测，不是推测）**：这次 `reindex` 有 md 文件**收不进索引**（`blocked[]` 非空）⇒ 回执不再谎称成功：`ok:false` + 本码 + `blocked:[{path,whyClass,why,reachableInstead}]`（按 `whyClass` 分：`unreadable`／`not-a-vmu-md`／`undeclared-track`／`write-refused`）+ `partial:true`，`skipped` 仍保留但这些文件**不再是成功证据**。修复前这条拒绝**没有 code**（`ok:false && code:null`）：调用方无法分支、仿真账本无法把它声明为预期（`unpredicted[{tool:'vibe_vmu_records',code:null}]` ⇒ `mainline`／`actions-extra`／`records-blueprint` 三个场景 exit 1）、§8 码表无行可登 —— 一张说不出名字的拒绝不是回执。`orphan-draft-md` 不计入阻塞：那是采纳后的草案历史，不是调用方能修的文件 | 记录面 reindex（`vibe-math-vmu/kernel/records.js` 的 `mdReindex`；工具面 `vibe_vmu_records {action:"reindex"}`） | ✅（读 `blocked[].reachableInstead` 逐条修完（文件/权限/track 声明）**再调一次 reindex**；adopt 漂移的纯 markdown 草案 reindex 永远收不了，改走 `vibe_v5_blueprint {action:"adopt", draft, refreshFingerprint:true}`。`scheduled`／纯成员笔记不需要 reindex。套件：`tests/vmu-run259-audit14.test.mjs`） |
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
| `VMU_MATH_PERSIST_FAILED` | 数学回执/任务镜像**写不进去**（只出现在 `persistCode` 字段里：回执本身已产出，失败的是持久化那一步——**不要读成「计算失败」**） | 计算面 | ✅ |
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
| `VMU_MEETING_NOT_STARTED` | ★ **RUN 254-E**：★ **预约期（`scheduled`）的动作被拒，原因是 START TIME 还没到** —— ★ 与泛码 `VMU_STATE` 分工：message 点名 `SCHEDULED for <iso> and has not started`，hint 说明「挡住它的不是考勤规则（规则到点才评一次）」；★ 实现于 `kernel/meetings.js` 的 `requireMeeting` scheduled 分支 | 会议 | ✅（等到点后的 touch；或读 `status`／`summary` 看 `startsInMs`） |
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
| `VMU_LATE_ADMISSION_REFUSED` | 迟到入席被**本会政策**拒绝（`lateAdmission:"refuse"` 且到达时刻已越过 `vmu.meetings.lateAfterMs`，判定对着 `openedAt`）⇒ 具名拒；这是政策不是缺参数，所以 hint 给两条补救（本会主席 `admit()`；或参加下一场会）并明说重试 `attend()` 只会再拒 | 会议（`kernel/meetings.js` 的 `attend`） | ✅（须给两条补救与「重试无用」） |
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
| `VMU_TURN_NO_FENCE` | 回复里**既没有工具汇报、也没有可解析的 json 围栏** ⇒ 无可分派（★ **RUN 76 / TB-2710**：回执现带 `starts`——`[{tool,op,why,call}]` 两条可直接执行的通道，`op:"reply"` 优先、`op:"step"` 兼容围栏 JSON，并配 `startsMeans`）（★ **LANE turn-reply**：首选是工具汇报 `vibe_vmu_turn { op:"reply", report:{…} }`；围栏 JSON 仍是**兼容通道**，字节不变） | 轮次编排 26 | ✗（须**同时**给出工具形式与围栏 JSON 形式，★ 不再只要求"只输出一个围栏 JSON 对象"） |
| `VMU_TURN_REPLY_CONFLICT` | ★ **LANE turn-reply（08号决策）**：★ **同一回合里，工具汇报与围栏 JSON 对同一字段给出了不同的值** —— ★ 一个字段不能有两个真相；★ 冲突字段**逐一点名**，★ 且**在派发前**拒（半个回合都不会落地）。★ **RUN 230（task-19 / E12）扩用**：★ 同一名字也用于**会议绑定冲突** —— ★ `op:"reply"` 的 `meeting`（或围栏 JSON 顶层的 `meeting`）与停着的那个回合所属会议不一致时具名拒：★ 一个回答不能同时属于两场会，★ hint 点名停着那回合属于哪场会。★ **RUN 240（task-43 / FEEDBACK63 ①5）**：★ 冲突 message 现在**同时打印两个值**（`field (tool report: <值> vs fenced json: <值>)`），错误对象另带 `conflictRows:[{field,tool,fenced}]`，而 `fields` 仍是裸字段名；★ `op:"reply"` 的回执新增 `appliedWhen`／`conflictPolicy`／`notExecutedMeans`：**报告只是被记录**，冲突检查发生在应用（下一次 `step`/`drive` 结算该回合，或在途交付返回）时，不一致则整回合在派发前具名拒；★ 任何被记入 `counts.notExecuted` 的字段**必在 `skipped` 里带 `code`**（`VMU_TURN_FIELD_NOT_APPLICABLE`／`VMU_TURN_FACE_NOT_WIRED`／`VMU_TURN_DUPLICATE_SKIPPED`／形状适配器码如 `VMU_RECORD_SHAPE`）——「没有 code 的不执行」是 run 63 的实测缺陷；★ `vibe_vmu_turn { op:"status" }` 新增 `turns[]`（每回合 `{turn,member,openedBy,executed:[{field,channel}],skipped:[{field,reason,existingId?,code?}],writes:[{tool,recordId?}],codes,unavailable}` + `turnsMeans`），`openedBy ∈ drive|activation|wait|null`；★ 工具面 `vibe_vmu_turn { op:"step"|"drive", opened_by:"wait" }` 把「这一轮是会议唤醒后由所办结算」送进台账（省略＝drive；值域由内核记账，工具面不改判）；`unavailable` 具名列出本内核看不到的东西（独立子会话里的成员工具调用） | 轮次编排 26（`kernel/turn/index.js` 的 `supplyStructuredReply`、`runFrom`、`mergeReplyChannels`、`status`；读面 `vibe-math-vmu/tools/turn.js`） | ✅（★ 字段冲突：同一字段只走**一个**通道，两边值**相同**时合并（回执 `sameValueFields:[…]` 点名字段并附 `replyChannelsMeans`：两通道同值、只派发/只计一次，不是其中一条被静默丢弃）；★ 会议冲突：省略 `meeting`（继承停着那回合的会议）或改成该会的 id；★ 要把成员移到另一场会，先按那场会派发再答新 prompt；★ 迟到的报告：该回合已结算则具名拒并列出已应用字段，改在**下一回合**汇报；★ 想看 wait 唤醒的回合做了什么：`op:"status"` 读 `turns[]`，拿不到的写在该行的 `unavailable` 里） |
| `VMU_TURN_NO_PENDING_MEMBER` | ★ **LANE turn-reply（08号决策）**：★ **没有打开着的成员回合，却有人用 `vibe_vmu_turn { op:"reply" }` 汇报** —— ★ 工具**不许凭空造出一个回合** | 轮次编排 26 | ✗（★ 先 `op:"step"` 拿到 `awaiting:true`＋`memberPrompt`，★ 再汇报那个回合；★ 兼容路径仍是 `op:"step"` 的围栏 JSON） |
| `VMU_TURN_ALREADY_PARKED` | ★ **RUN 229（task-13）**：★ **已有一个成员回合停在调用方手里（`awaiting:true` 的 `memberPrompt`），却又被要求派发下一个回合** —— ★ `deliverByReturning` 只保留**一个** parked 槽（单槽是设计：没被回答的回合应被重新请求，而不是静默记住），★ 第二次派发**不许静默替换** | 轮次编排 26（`kernel/turn/index.js` 的 `drive`） | ✅（★ 先回答停着的那个：`op:"step"` 带 member 与回复，或 `op:"reply"` 带 report；★ 然后才能再派；★ 要答的 prompt 就是上一次派发 `awaiting:true` 返回的 `memberPrompt`；★ **RUN 76 / TB-2710**：本码的 `parkedFacts.parkedReason` 一句话说明「调用方仍握着这一轮：必须先答（或 abandon）才能再派」，与 `VMU_TURN_PARKED_NEEDS_OWNER`（有 reply、无 parked）按触发器分开） |
| `VMU_TURN_STALE_REPLY` | ★ **RUN 229（task-13）**：★ **汇报指向的成员不是当前停着的那个成员**（`reply_for` 点了别的成员，或 `supplyMemberReply(reply, forMember)` 的成员对不上）—— ★ 属于 `VMU_TURN_*` 族，★ 不把别人的答复塞进停着的回合 | 轮次编排 26（`kernel/turn/index.js` 的 `supplyStructuredReply`／`supplyMemberReply`） | ✅（★ 省略 `reply_for`（答的就是停着的那位），或传停着的那位；★ 想给别的成员答复，先把当前回合答完再派它） |
| `VMU_TURN_PARKED_NEEDS_OWNER` | ★ **RUN 256 / TB-2616（task-97）**：★ **调用方交回了一条答复，但本次会话没有停着的成员提示词可回答它**（`op:"step"` 带 `reply` 之前没有 `awaiting:true` 的派发）—— ★ 收下它就会被交给**下一个**回合：写者名义对、回合错（run 73 实测的静默错归属），★ 所以具名拒、★ 并把已暂存的答复**丢弃**（`parkedReplyDiscarded:true`），★ 拒绝本身**不新开回合**。★ 同一守卫的三个 `parkedReason`：`no-parked-prompt`（本就没有停着的提示词）、`no-turn-id`（停着的提示词没有回合 id）、`turn-not-open`（它指的回合已不在开着的台账里） | 轮次编排 26（`kernel/turn/index.js` 的 `step` 守卫 `refuseParkedNeedsOwner`；工具面 `vibe_vmu_turn { op:"step", reply }` 以回执形式返回这三个事实） | ✅（★ 先 `op:"drive"`（或一次返回 `awaiting:true` 的 `op:"step"`）拿到 `memberPrompt`，★ 再用**同一 member** 的 `op:"step"` 带 `reply` 回答那个 prompt；★ 回执带 `parkedFacts:{turnId,member,promptId,parkedSince,parkedForMs,releaseBy,parkedReason}`、`parkedReason`、`parkedReplyDiscarded`） |
| `VMU_PROMPT_BINDING_CONFLICT` | **同一段、同一维度上有两条绑定并列** ⇒ 拒（不再静默取其一） | 提示管线 06 | ✗（给其中一条更具体的维度；优先级 `role < phase < member < task`） |
| `VMU_PROMPT_VARIABLE_MISSING` | **占位符无人供值**（`vmu.prompts.missingVariable=refuse` 时） | 提示管线 06 | ✗（在装配上下文或 settings 里补值；默认 `report` 只记录不拒） |
| `VMU_TURN_BAD_JSON` | 围栏内容**不是合法 JSON**，或不是对象 | 轮次编排 26 | ✗（与"没有围栏"是**两种**失败 ✗） |
| `VMU_TURN_UNKNOWN_FIELD` | 回复字段**不在已宣告目录**里，且 `vmu.turn.unknownReplyFieldMode='refuse'`（默认 `ignore-named` 不抛此码，改为 `ignoredFields`＋notice） | 轮次编排 26 | ✗（须**点名**该字段并列出已知字段，**绝不猜** ✗） |
| `VMU_TURN_ASSEMBLY_FAILED` | **管线拒绝了本轮装配** | 轮次编排 26 | ✗（须转述管线的拒因） |
| `VMU_TURN_FIELD_NOT_APPLICABLE` | **回执带了某个字段，但本回合的 face/tool 根本调不到**（真机 `NO_OPEN_MEETING` 的真实原因：指令没进提示词）；`cause` 保留原会议错误 | 轮次编排 26（`kernel/turn/index.js` ✓） | ✅（hint 指向 `instructionDelivered` 与 per-turn tools allowlist） |
| `VMU_MEETING_NOT_FOUND` | ★ **RUN 254（FEEDBACK74 #2）**：回合回复的**文本里点名了一个不存在的会议 id**（`m-<id>`），而这一回合本来就是因 `no-meeting-bound` 被跳过的那类；探的**唯一**来源是本回合已装好的会议读面 `map['vmu.meetings'].summary` —— 只有该读面回 `VMU_NO_SUCH_OBJECT` 才判「缺」，读面没装／服务不可用**不算缺**（探不到就不许造幽灵）。命中时 `skipped[]` 的那一行写 `reason:"ghost-meeting"`、`code` 为本码，并带 `meetingId`／`missingMeetings`／`hint`（`REACHABLE INSTEAD: …`）／`means`；id 真实存在（open/scheduled/waiting/archived）则仍是 `no-meeting-bound`，未 open 沿用现码。修复前这一 skip 只有 `reason` 没有码：文本里写错一个 id，回合就静默地等于「没提到会议」，事后无法断言它到底跳过了什么 | 轮次编排 26（`kernel/turn/index.js` 的 `meetingIdsMentioned`／`ghostMeetingOf` 与回合结算的 `skipped` 明细；文档 26 第三章） | ✅（用 `vibe_v5_meeting { op:"status" }` 读出当前会议的真实 id 再写；或省掉 id，让回合自动绑定它所属的会。套件：回合面 `tests/vmu-turn.test.mjs` 覆盖 `no-meeting-bound`，本码是其中新增的具名分支） |
| `VMU_TURN_OP_MISSING` | ★ **TB-2739 / RUN 79 B8（真机取证）**：★ **`vibe_vmu_turn` 被调用时没带 `op`（或 `op` 只有空白）** —— 参数的 schema 一直写着 `op` 是必填，可面里的默认值把它悄悄当成 `status` 执行：第 79 次真机上所办三次 `{member:"r-1", next_step:"…"}` 就是这样拿回了「成功」的 status 读数、一个回合都没开。★ 现在面在**成员权限闸与队列之前**具名拒本码：message 列出实收参数（`carried`，一个参数都没有时写 `no arguments at all`）并用 `OP_ARG_OWNERS` 表推出「你八成想说的是哪个 op」（`members/member/phase/why/next_step/deliver_mode/opened_by/meeting/tools/statusBlock` ⇒ `step`，`rounds` ⇒ `drive`，`reply/reply_for/report` ⇒ `reply`，`turn/offset/limit` ⇒ `prompt`，`detail` ⇒ `status`），hint 给 `REACHABLE INSTEAD:` 加五种可照抄形状；守卫在队列之前 ⇒ 不会占掉一轮 | 回合面（`vibe-math-vmu/tools/turn.js` 的 `coreTurn`） | ✗（照 hint 补 `op`：读状态 `{ op: "status" }`、开一轮 `{ op: "step", member, phase, why }`、连跑 `{ op: "drive", member, rounds }`。套件：`tests/vmu-run79-step-not-status.test.mjs`，含用第 79 次真日志三条参数逐条重放 + 反关灯还原旧默认值必红） |
| `VMU_TURN_UNKNOWN_MEMBER` | **显式指定的成员不在在册名单里**（`turnFacts().rosterIds` 有值时判定）—— 拒在**投递之前**，message 点名是哪些 id，hint 打印在册名单；拿不到名册时**不猜** | 轮次编排 26 | ✗（先 hire，或从 hint 列出的 id 里选；否则只会白白烧掉 `vmu.turn.deliveryTimeoutMs`） |
| `VMU_TURN_REENTRANT` | ★ **PHASE 6 / K2**：★ **已有一个回合在途，★ 第二次 `run()` 会嵌套** —— ★ 本循环的**归因／成员回复槽／通告队列都是单回合状态**，★ 嵌套会覆盖 | 轮次编排 26 | ✗（★ **等在途回合结算后再调**；★ `drive()`／`step()` 已按顺序调用，★ 不受影响 ✓） |
| `VMU_TURN_DELIVERY_FAILED` | ★ **R242**：★ **成员回合的交付 seam 抛了错而那个错自己没有码** —— 账上不写一个空码，写这个；★ 它出现在回合行（`turnReceipts[].closedWith`）与 `counts.deliveryLastFail` 里，`status` 是 `undelivered`、`settledBy` 是 `delivery-threw`；★ 有码的错**原样保留那个码**，本码只是兜底 | 回合循环（`kernel/turn/index.js`） | ✗（读 `writesWindow` 看这一轮在成员自己的内核里到底写过什么，再判它是否什么都没做） |
| `VMU_TURN_DELIVERY_TIMEOUT` | ★ **PHASE 6 / SLV**：★ **one-shot 成员回合在 `vmu.turn.deliveryTimeoutMs` 内没有结算**（请求已进入调用、未返回）—— ★ 超时后该回合**具名失败并释放串行派发队列**，后面的回合继续；★ 记录带 turn／member／已等毫秒／最后交付阶段／是否已进入调用 | 轮次编排 26 | ✅（可调 deadline；★ 正常回合不受影响） |
| `VMU_TURN_DELIVERY_SHAPE` | ★ **RUN 254 / P1-6**：★ **交付 seam 返回的形状本内核读不了**（既非 string、非 `{reply:<string>}`、非 `{awaiting:true}`）—— ★ 「沉默」「无围栏」「错形状」三件不同的事各有各的码：本码 message 列出实际收到的键（如 `an object with keys [output]`），不再误报 `VMU_TURN_NO_FENCE`；★ 回合行 `closedWith` 记本码、`settledBy` 记 `delivery-shape` | 回合循环（`kernel/turn/index.js`） | ✗（按 docs/26 §3.22 三种接受形状之一重交；读 `keys` 找 adapter 的错） |
| `VMU_TURN_DELIVERY_NO_PAYLOAD` | ★ **RUN 2700 登记（原属 SLV 夹具 seam，TB-2632 起被提示词教到）**：★ **adapter/seam 交回了「什么都没有」**（`null`/`undefined`），与「形状读不了」是两件事—— ★ 本码由 SLV 夹具 seam 发（`scripts/sim/harness.mjs` 的 `no-payload`），**出厂内核自己的分类器不发它**：同一事实在出厂 adapter 边界上表现为 `VMU_TURN_DELIVERY_SHAPE`（`keys:[]`）。★ 内核侧只负责**原样透传**：它属于「不许重试、不许改码」的那一类（`kernel/turn/index.js` 的 `START_RETRYABLE_CODES` 之外），所以 seam 发什么，成员就看见什么 | 交付 seam（SLV 夹具：`scripts/sim/harness.mjs`） | ✗（改回执：真的产生了载荷再交；不要把「我没写东西」当成引擎故障） |
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
| `VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING` | 论文段落**没有任何证据条目**或 `evidence` 指针不成立（不存在的记录 id、轨不对、指向目录）⇒ 具名拒并**逐条点名坏指针**，绝不允许伪造引用活到渲染阶段；实现于 `packs/v5r/paper-quality.js`（`EVIDENCE_MISSING`）与 `packs/v5r/tools.js` | 论文·整合包 | ✅（**已实现** ✓；`packs/v5r/paper-quality.js` ✓） |
| `VMU_PACK_V5R_CORE_PAPER_PDF_FAILED` | 内核 LaTeX 面**拒绝编译**（无引擎／超时／编译错）⇒ 具名，错误上带面的 code/tried/stderrTail | 论文·整合包 | ✅（**已实现** ✓；`packs/v5r/paper.js` ✓） |
| `VMU_PACK_V5R_CORPUS_NOT_RUNTIME` | **捕获快照不得进运行时装配**（`v5rTurnSections` 等）⇒ 具名拒；实现于 `packs/v5r/prompts/v5r-core.js` 的 `assertRuntimeSafeSections` | 整合包·提示词 | ✅（**已实现** ✓；`packs/v5r/prompts/v5r-core.js` ✓） |
| `VMU_PACK_V5R_P1_NEEDS_DEBATE` | v5r **p=1 缺定论来源**：把命题卡的布尔概率改成 1，却没有「辩论全体一致为 1」／`verified` 轨定论行／「Lean 通过＋描述符合性裁定」三者之一（实现于 `packs/v5r/verification-gates.js` 的 `p1Intent`）；★ **尚无生产调用方**（接线在 B1 第 3 步） | 记录·整合包 | ✅（返回 `{code,message,hint}`，hint 列出三种合法来源；★ 归属字段由接线层填） |
| `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF` | v5r **辩论对象无已写完的证明**：`type=debate` 的会议 subject 解析到的命题卡没有「正式证明/证伪已写完」的承载（`proofRef` 空／`proofState≠complete`／无 `verified` 行／Lean 未通过），或文件引用不可读、为空（实现于 `packs/v5r/verification-gates.js` 的 `debateSubjectGate`）；★ **尚无生产调用方** | 会议·整合包 | ✅（拒绝文案逐一说明**三种 subject 形态**如何才算满足：卡 id／文件引用／一句话命题） |
| `VMU_PACK_V5R_FORMAL_REQUIRED` | v5r **形式化开关 `vmu.math.formalVerify=require` 时裁定缺少形式化凭据**：`vibe_v5_verdict_final` 要求被裁定的命题卡带「已通过的 Lean 作业」或已登记的 `blocked` 决定，否则具名拒（实现于 `packs/v5r/tools.js#toolVerdictFinal`，策略读 `formalVerifyPolicyOf`）；message 点名缺 Lean 还是缺 blocked，hint 给 `vibe_v5_lean_run`→`vibe_v5_lean_job` 与 blocked 两条路 | 裁决·整合包 | ✅（返回 `{code,message,hint}`，hint 两条可执行路径） |
| `VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED` | v5r **忠实性收口缺少可通过的 Lean 依据**：`vibe_v5_fidelity_conclude` 的 `fidelity:'conform'` 要求带一个**已通过**的 Lean 作业；缺 `lean_job`、作业 id 面不认识、或作业未通过（消息点名实收 `state`，并区分「面不认识该作业」与「作业没通过」）三处共用一个码（实现于 `packs/v5r/tools.js` 的 `toolFidelityConclude`）；★ **属"证据层"而非"声明层"**：模型自述"我核对了"不算依据 | 会议·整合包 | ✅（`tests/vmu-fidelity-conclude.test.mjs` 8 节；`tests/vmu-v5r-tools.test.mjs` 46 工具计数） |
| `VMU_PACK_V5R_DEBATE_SUBJECT_UNPROVEN` | v5r **辩论对象「声明已写完」但无机器证据**：卡上写了 `proofRef`＋`proofState=complete`，却既无 Lean 通过也无 `verified` 轨定论行（实现于 `packs/v5r/verification-gates.js` 的 `debateSubjectGate` 证据层分支）；★ **两种缺失两个码**：本码＝「自述写了≠真的写完」，`_NO_PROOF`＝「连自述都没有」；★ **尚无生产调用方**（接线在 B1 第 3 步） | 会议·整合包 | ✅（拒绝文案点名 `proofRef`/`proofState` 的实收值并给两条合法路径：跑 Lean 且 passed／走完辩论在 `verified` 轨留下定论行） |
| `VMU_PACK_V5R_VERIFIED_SINGLE_WRITER` | v5r **定论多写了**：`verified` 轨只能由 `promoteVerified` 写，其它入口（含未声明写入器的裸写）⇒ 具名拒（实现于 `packs/v5r/verification-gates.js` 的 `singleWriter`）；★ **尚无生产调用方** | 记录·整合包 | ✅（须点名**违规入口**与唯一写入器） |
| `VMU_PACK_V5R_FIDELITY_ASK_REQUIRED` | v5r **D13 符合性追问缺失**：Lean 已通过但该卡概率仍非 1 时，必须先裁定「Lean 代码中的命题/定义是否与所需一致」，未裁定且证明未被撤回 ⇒ 具名要求（实现于 `packs/v5r/verification-gates.js` 的 `fidelityAsked`；本码是 `kernel/fidelity.js` 的 pack 侧消费者）；★ **尚无生产调用方** | 辩论·整合包 | ✅（须给出**问题原文**与两个合法答案 `conform`/`defect`） |
| `VMU_PACK_V5R_BLUEPRINT_MD_MISSING` | v5r **蓝图草案 md 缺失**：`vibe_v5_blueprint` 的 `propose` 带了 `mdPath` 但文件不存在，或 `adopt` 时草案文件已被删除 ⇒ 具名拒，回执给该相对路径与可达修法（用 fs 工具写好同一 `mdPath` 重试／改为不带 `mdPath` 让内核物化 `Shared/Drafts/<stem>-r<N>.md`）（实现于 `packs/v5r/blueprint.js` 的 `proposeBlueprint`／`adoptBlueprint`，RUN 248） | 蓝图·整合包 | ✅（**已实现** ✓；`packs/v5r/blueprint.js`，`tests/vmu-run248-blueprint-md.test.mjs`） |
| `VMU_PACK_V5R_BLUEPRINT_MD_DRIFT` | v5r **蓝图草案行与文件分叉**：`adopt` 前重算草案文件的 sha256 与草案行的 `mdFingerprint` 不等（提交之后又改过文件）⇒ 具名拒并给两个 sha 与修法（先 `vibe_v5_records {action:"reindex"}` 收编外部编辑，再采纳**被编辑过的字节**），**绝不静默晋升**（实现于 `packs/v5r/blueprint.js#adoptBlueprint`，RUN 248） | 蓝图·整合包 | ✅（**已实现** ✓；`packs/v5r/blueprint.js`，`tests/vmu-run248-blueprint-md.test.mjs`） |
| `VMU_V5R_CLOCK_VALUE_INVALID` | v5r **时钟值非法**（RUN 259 / TB-2655 / AUDIT-14 P1-2）：`clockReadingOf` 只接受**整数毫秒且在 2000-01-01..2100-01-01 之间**，或**带显式位移的 ISO-8601**（`Z`/`+HH:MM`）；`0`／负数／小数／超范围（如 `8640000000000001`）／纯日期 `2026-01-01`／本地斜杠 `2026/01/01`／垃圾串一律具名拒，**绝不回落墙钟**——静默用 NOW 顶替会让「时钟坏了」和「时钟读到值」看起来一样。修复前这些值都被标成 `atSource:"kernel-clock"`（坏时钟冒充内核钟），且调用方自带的 `atSource` 还能覆盖实测值。内核钟值走 `{kernelClock:true}` 接缝（工具面硬编码，`boot({clock:()=>1000})` 不再被误拒）；`atSource` 只由测量方写，调用方标签另存 `atSourceCaller` | 时钟面（`vibe-math-vmu/packs/v5r/blueprint.js` 的 `clockReadingOf`；工具面 `vibe_v5_blueprint` 的 `at`/`now` 参数） | ✅（**已实现** ✓；`tests/vmu-run259-audit14.test.mjs`、`tests/vmu-run256-clock-purity.test.mjs`） |
| `VMU_MONEY_NEGATIVE_FORBIDDEN` | 投标价格**为负**（**价格非负；零价合法** ✓） | 治理/竞标 | ✅（**已实现** ✓；`kernel/bidding.js:295` ✓） |
| **D7 · `VMU_TOOL_NOT_IN_FACE`** | 成员这一回合**不许调用**该工具：它不在其席位的 face 里（`allow` 名单外／`deny` 名单内／本轮 `all` 收窄）⇒ 具名拒，**回执同时点名工具与席位**并带回那张面（谓词 `kernel/memberface.js` 的 `faceGate`；调用点 `kernel/index.js` 的 `memberFaceGate`） | 成员工具调用前（D7：可用命令按席位不同） | ✅（须点名**工具名 + 席位 + 面来源**；失败关闭，绝不按全集放行） |
| **D7 · `VMU_TOOL_FACE_UNRESOLVED`** | **解析不到**该成员/该席位的 face（没有面列表／空列表／未知席位／面形状不合法）⇒ 具名拒；成员不在册时 `memberFaceGate` 先抛 `VMU_NO_SUCH_OBJECT`（同一"失败关闭"口径） | 成员工具调用前 | ✅（须说明**缺哪一块**：面／席位／形状；不许猜一份默认全集） |
| **R30 · `VMU_RESUME_ADAPTER_FAILED`** | 恢复面的 adapter 工厂 `make()` 抛错 ⇒ 该面记 `ok:false` + 本码，**不静默跳过该面**（`unhydrated` 里逐面点名） | 断点续跑装配（`kernel/index.js` 的 resume 装配） | ✅（须点名**哪个面**与原始错误） |
| **R30 · `VMU_RESUME_RESTORE_FAILED`** | 恢复面的 `restore` 抛错 ⇒ 逐面记 `ok:false` + 本码 + 原始 message | 断点续跑装配（`kernel/index.js` 的 resume 装配） | ✅（须点名面与原始 message） |
| **R30 · `VMU_RECORD_SHAPE`** | 记录**形状错**（`track` 槽不是字符串——历史上把载荷对象塞进 track 槽，回执只说 `[object Object]`，等于没说）⇒ 具名拒，并给出**实际形状** | `vmu.library` 的记录登记（`kernel/library.js` 的 `refuse`） | ✅（须给期望形状、实际形状与合法轨道名） |
| **R240 · `VMU_RECORD_SETTLEMENT_REWRITE`** | 一张**已结算**的命题卡（body 里有 `- debateRuling：` 行且读数为 0/1）被一次普通写入**改掉了读数**：`bodyMode:"merge"` 只改 `- p：` 行的值、不删行，所以既有"破坏性写入"闸看不见它，卡会从"已结算"悄悄退回"未定"，而结算行还挂在 body 里（第 63 次真机实测：`ok:true,settled:false`，用户以为只是改了文字）。⇒ 具名拒（实现于 `packs/v5r/tools.js` 的 `gatedCardHandler`）；★ **不是墙**：hint 给三条可达路——带 `debate_ruling` 同值重结算、保持卡上原有的 `p`（读数没变就不算新断言，回执带 `p1GateSkipped:"p-unchanged"`）、或 `confirmDestructive:true` 明说要撤回读数 | v5r pack 写卡面（`packs/v5r/tools.js`） | ✅（须同时说出**当前读数**与**这次要写的读数**，并给三条出路；`p` 是必填参数，所以"别传 p"不是一条路——RUN 240 的第二个修法正是让"p 不变"合法） |
| **R240 · `VMU_TURN_FIELD_NOT_APPLICABLE`** | 一个回合的回复里带了这个回合**执行不了**的字段（需要对象或会议，本回合没有）⇒ 该字段留在 `notes`，并在 `skipped[]` 里记一行带本码（第 63 次真机：这类字段被**静默** notExecuted，只有 `counts.notExecuted:2`、没有任何 code） | 回合面（`kernel/turn/index.js` 的 `skipped` 明细） | ✅（每一条未执行都必须有 code 与原因；`counts.notExecuted` 与 `skipped.length` 必须能对上） |
| **R240 · `VMU_TURN_FACE_NOT_WIRED`** | 回复里绑定的面/动作**没有安装**（例如某个 op 在本部署不存在）⇒ `skipped[]` 记本码并点名缺的是哪个面 | 回合面（`kernel/turn/index.js`） | ✅（须点名缺的面与可达替代，不许只给一个计数） |
| **R240 · `VMU_TURN_DUPLICATE_SKIPPED`** | 同一回合里**同一个动作已经落地过一次**，第二次不重复执行 ⇒ `skipped[]` 记本码，并给 `existingId` 指明已经写下的那一行 | 回合面（`kernel/turn/index.js`） | ✅（须给 existingId；`skipped` 为空时必须意味着真的什么都没被扣下） |
| **R30 · `VMU_CHAIR_ACT_NOT_DELEGATED`** | `vmu.meetings.chairActRequiresTurn=true` 而该主席在**本内核没有已记录的回合** ⇒ 其席位不得召集，具名拒（**绝不降级为警告**：无归属决策的主席动作正是该闸要拦的） | `vmu.meetings` 召集（`kernel/meetings.js` 的 `deny`） | ✅（须给补救：先让主席自己走一个回合，再召集） |
| **R30 · `VMU_MEETING_ID_ARCHIVED`** | 新会议想复用**已归档**会议的 id ⇒ 具名拒（归档 id 不复用，否则历史会指向两份事实） | `vmu.meetings` 服务面的 `open`（`kernel/meetings.js` 的 `deny`） | ✅（须给归档时刻与替代 id） |
| **R30 · `VMU_ASK_UNKNOWN_PROPOSITION`** | `vibe_v5_verdict_ask` 的命题**既不是库里的卡、也不是文件引用、也不是本会辩论对象** ⇒ 具名拒（不向成员索要对一个没人辩论过的对象的裁决） | v5r pack（`packs/v5r/tools.js` 的 `refuse`） | ✅（须给两条出路：先 `vibe_v5_record_proposition` 登记，或传合法的文件引用形状） |
| **R30 · `VMU_ENGINE_FAILURE`** | 收信侧抛错且**未自带码** ⇒ 失败清单 `failed[].code` 的兜底码（**不静默吞错**；一条都没送达时升级为 `VMU_ASK_NOTHING_DELIVERED`） | v5r pack（`packs/v5r/tools.js` 的 `failed.push`） | ✅（须给收件人与原始 message；不许把失败折叠成"已问过"） |
| **R30 · `VMU_ASK_NOTHING_DELIVERED`** | 裁决请求**一条都没送达** ⇒ 具名拒（**0 送达不是成功**；此前该面回 `ok:true` + `delivered:[]` 还把 means 写成"已问到"） | v5r pack（`packs/v5r/tools.js` 的 `refuse`） | ✅（须逐条给失败 code 与补救路径） |
| **R31 · `VMU_SCOPE_REFUSED`** | `applyMemberScope` 给某个席位下发 Tool override 时**抛错且未自带码** ⇒ 记入回执的 `refused[]`（带 `member`/`slot`/`message`），**不静默跳过该席位**（跳过会被读成"这个席位本来就没有面"） | v5r pack（`packs/v5r/member-scope.js` 的 `refused.push`） | ✅（须点名席位与原始 message；整批仍继续下发其余席位） |
| **R31 · `VMU_SEAT_FACE_UNKNOWN`** | 席位面的纯函数收到**未声明的席位**（`chair`/`member`/`temp` 之外）⇒ 具名拒，`hint` 列出声明席位；**绝不返回一份默认面**（失败关闭：猜一份面＝把授权猜出来） | v5r pack（`packs/v5r/seat-faces.js`） | ✅（须给合法席位清单；面缺一块时宁可拒也不放行） |
| **R31 · `VMU_RULING_NO_SUBMISSIONS`** | `vibe_v5_verdict_final` 既**没有成员提交的裁决**、调用者也没自带 `verdicts` ⇒ 具名拒（**"收齐"不是框架凭空攒出来的**；此前 coverage 数名册而不是数提交，于是 `complete:true` 是假的） | v5r pack（`packs/v5r/tools.js` 的 `refuse`） | ✅（须给两步：先 `vibe_v5_verdict_ask`，成员各自 `vibe_v5_verdict {meeting, proposition_id, verdict, reason, member}` 提交） |
| **R31 · `VMU_RULING_CONTRADICTS_SUBMISSION`** | 主席**自己打的数字**与该成员**已提交**的数字不同 ⇒ 具名拒（**一条裁决是成员自己的动作**：主席不能替它改数；错的是提交就该让成员说，或按回执里的集合裁） | v5r pack（`packs/v5r/tools.js` 的 `refuse`） | ✅（须逐人给 `typed vs submitted`，并给"省略 `verdicts` 直接采纳全部提交"这条出路） |
| **R31 · `VMU_RULING_NO_LEDGER`** | 本内核**没有耐久 library** ⇒ 成员的裁决**无处可落**，具名拒（**不写一个 "filed" 的假回执**：那正是本通道要替换掉的假 coverage） | v5r pack（`packs/v5r/tools.js` 的 `refuse`） | ✅（须说明为什么需要 `config.root`：裁决是 `Members/<member>/Propos/` 下的卡，主席要能从**另一个内核**读到它） |
| **R31 · `VMU_RULING_CHAIR_SIGNS`** | **主席**本人要"以成员身份签一份裁决" ⇒ 具名拒（主席签的是**汇总** `vibe_v5_verdict_final`，它不替成员报数） | v5r pack（`packs/v5r/tools.js` 的 `refuse`） | ✅（须给主席的正当动作：收齐成员提交后用 `verdict_final` 采纳） |
| **R31 · `VMU_RULING_NOT_DEBATER`** | 提交裁决的人**不在该会记录的辩论集**里 ⇒ 具名拒，并**列出真正要表态的集合**（读会议的发言记录，不读名册、也不猜） | v5r pack（`packs/v5r/tools.js` 的 `refuse`） | ✅（须点名实收集合；要在集合里就先让会议记下发过言） |
| **R31 · `VMU_RULING_ALREADY_FILED`** | 同一成员对同一命题**已提交过一份不同的裁决** ⇒ 具名拒且**不覆盖已提交的那份**（回执照抄已提交的值、时间与卡路径） | v5r pack（`packs/v5r/tools.js` 的 `refuse`） | ✅（须给既有那份的位置与"改口要说给主席听"的出路：本面没有改写已提交裁决的路径） |
| **R31 · `VMU_RULING_NEEDS_CHANNEL`** | `vibe_v5_verdict` **既没给活票箱**（`target`）、**也没给辩论**（`meeting` + `proposition_id`）⇒ 具名拒（**一票要有它的对象**：此前"没有对象"与"对象不存在"混成同一个 `VMU_NO_SUCH_OBJECT`，读者分不清是自己没给还是给错了） | v5r pack（`packs/v5r/tools.js` 的 `refuse`） | ✅（须给两条通路：`target` 投活票箱；`meeting`+`proposition_id` 提交自己的辩论裁决） |

> **R31 补登记（9 条；task-12 裁决通道／task-15 席位面）**：同一形态的第 N 次——这 9 个码**早已在代码里真实抛出**（`packs/v5r/member-scope.js`、`seat-faces.js`、`tools.js`），文档此前没有登记，`tests/audit-vmu-docs.test.mjs` 的 C 节随之逐条点名 ✗。**登记 ≠ 批准新增**：代码未为登记改动一行 ✓。

> **R30 补登记（8 条；`gate-a-store`／task-6）**：同上一条批注是**同一形态**——这 8 个码**早已在运行时代码里真实抛出**（`kernel/index.js`／`kernel/library.js`／`kernel/meetings.js`／`packs/v5r/tools.js`），只是文档此前没有登记，于是 `tests/audit-vmu-docs.test.mjs` 的 C 节把它们逐条点名 ✗。**登记 ≠ 批准新增**：这里补的是登记，代码未改动一行（除 `kernel/store.js` 的 fs-purpose 注释）✓。

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
| `VMU_FIRE_CALLER_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 26 | ⛔ |
| `VMU_FLOOR_OUT_OF_ORDER` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 26 | ⛔ |
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
| `VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 26 | ⛔ |
| `VMU_PACK_VOTING_NOT_LOCKED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 19 | ⛔ |
| `VMU_PATH_ESCAPE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_PATH_INVALID` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_PRIVACY_VIOLATION` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_PROBATION_ACTIVE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_PROMPT_SECTION_DRIFT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 13 | ⛔ |
| `VMU_PROTOCOL_DEVIATION_MISSING` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_REASON_REQUIRED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_RECALL_QUORUM_NOT_MET` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 17 | ⛔ |
| `VMU_RECORD_DESTRUCTIVE_WRITE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 26 | ⛔ |
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
| `VMU_RULES_LINE_UNCLAIMED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 26 | ⛔ |
| `VMU_SAE_REPORT_OVERDUE` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 20 | ⛔ |
| `VMU_SCHEDULE_OVERDUE_REPORT` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 02 | ⛔ |
| `VMU_SCHEDULE_RECURRENCE_INVALID` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_SCHEDULE_TRIGGER_FORBIDDEN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_SCHEDULE_TZ_UNKNOWN` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_SCHEDULE_WINDOW_INVALID` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_SEARCH_UNEXPLAINED` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 07 | ⛔ |
| `VMU_SESSIONS_ROOTS` | **规划码**（设计阶段登记；语义与触发时机见该卷 ✓，未实现） | 卷 26 | ⛔ |
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

> 手写表登记 **514** 个码，**逐行**给出状态 ✓：其中 **473** 个**已实现 ✓**（能在运行时代码里找到该码字符串 ✓），
> **41** 个**提案 ⛔**（暂时只存在于表里）✓ —— 这不是错误 ✓，但**不得**把"已登记"当作"会被抛出" ✗；
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
| `VMU_ASK_NOTHING_DELIVERED` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_ASK_UNKNOWN_PROPOSITION` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
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
| `VMU_BALLOT_CHOICE_COUNT` | **已实现 ✓** | `vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/ballotbox.js` | 代码里有该码字符串 ✓ |
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
| `VMU_CHAIR_ACT_NOT_DELEGATED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_ALREADY_SPOKE` | **已实现 ✓** | `vibe-math-vmu/kernel/chat.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_ANCHOR_DANGLING` | **已实现 ✓** | `vibe-math-vmu/kernel/chat.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_CAP_REACHED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_CHAT_FROZEN` | **已实现 ✓** | `vibe-math-vmu/kernel/chat.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_MUTED` | **已实现 ✓** | `vibe-math-vmu/kernel/chat.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_MUTE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_NOT_ADMIN` | **已实现 ✓** | `vibe-math-vmu/kernel/chat.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_QUOTA_EXCEEDED` | **已实现 ✓** | `vibe-math-vmu/kernel/chat.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_RESTORE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_RESTORE_REFUSED` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_CHAT_SNAPSHOT_INCOMPLETE` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
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
| `VMU_CONFLICT` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/ballotbox.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/governance.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/library.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/minutes.js`、`vibe-math-vmu/kernel/resource.js`、`vibe-math-vmu/kernel/storepolicy.js`、`vibe-math-vmu/packs/v5r/tools.js`、`vibe-math-vmu/tools/meeting.js` | 代码里有该码字符串 ✓ |
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
| `VMU_DIRECTION_INCOMPLETE` | **已实现 ✓** | `vibe-math-vmu/kernel/directions.js` | 代码里有该码字符串 ✓ |
| `VMU_DISCIPLINE_BREAKER_OPEN` | **已实现 ✓** | `vibe-math-vmu/kernel/discipline.js` | 代码里有该码字符串 ✓ |
| `VMU_DISCIPLINE_POSTMORTEM_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/discipline.js` | 代码里有该码字符串 ✓ |
| `VMU_DISCIPLINE_RESTORE_NEEDS_HUMAN` | **已实现 ✓** | `vibe-math-vmu/kernel/discipline.js` | 代码里有该码字符串 ✓ |
| `VMU_DISCIPLINE_SUSPEND_OVER_CAP` | **已实现 ✓** | `vibe-math-vmu/kernel/discipline.js` | 代码里有该码字符串 ✓ |
| `VMU_ENGINE_FAILURE` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_ENGINE_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/host-deliver.js`、`vibe-math-vmu/host-hooks.js`、`vibe-math-vmu/host-math.js`、`vibe-math-vmu/host-spawn.js`、`vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/directions.js`、`vibe-math-vmu/kernel/env.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/loader.js`、`vibe-math-vmu/kernel/mailbox.js`、`vibe-math-vmu/kernel/math.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetingmarker.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/minutes.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/kernel/paper.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/recruit.js`、`vibe-math-vmu/kernel/resource.js`、`vibe-math-vmu/kernel/script-bridge.js`、`vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/kit/extras.js`、`vibe-math-vmu/kit/handlers.js`、`vibe-math-vmu/kit/paper.js`、`vibe-math-vmu/packs/v3/middleware/gates.js`、`vibe-math-vmu/packs/v3/middleware/methods.js`、`vibe-math-vmu/packs/v3/middleware/planner.js`、`vibe-math-vmu/packs/v3/middleware/verify.js`、`vibe-math-vmu/packs/v3/tools.js`、`vibe-math-vmu/packs/v5r/blueprint.js`、`vibe-math-vmu/packs/v5r/meeting-tool-face.js`、`vibe-math-vmu/packs/v5r/middleware/artifact-counter.js`、`vibe-math-vmu/packs/v5r/middleware/motion-box.js`、`vibe-math-vmu/packs/v5r/middleware/paper-dispatch.js`、`vibe-math-vmu/packs/v5r/paper-quality.js`、`vibe-math-vmu/packs/v5r/tools.js`、`vibe-math-vmu/packs/v5r/verified.js`、`vibe-math-vmu/settings/schema.js`、`vibe-math-vmu/tools/activity.js`、`vibe-math-vmu/tools/capacity.js`、`vibe-math-vmu/tools/chat.js`、`vibe-math-vmu/tools/control.js`、`vibe-math-vmu/tools/env.js`、`vibe-math-vmu/tools/fidelity.js`、`vibe-math-vmu/tools/human.js`、`vibe-math-vmu/tools/mailbox.js`、`vibe-math-vmu/tools/mathadapters.js`、`vibe-math-vmu/tools/mathjobs.js`、`vibe-math-vmu/tools/meeting.js`、`vibe-math-vmu/tools/member-tools.js`、`vibe-math-vmu/tools/panel.js`、`vibe-math-vmu/tools/report.js`、`vibe-math-vmu/tools/turn.js`、`vibe-math-vmu/tools/vote.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_ENV_NO_PROBE` | **已实现 ✓** | `vibe-math-vmu/kernel/env.js` | 代码里有该码字符串 ✓ |
| `VMU_ENV_PROBE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/env.js` | 代码里有该码字符串 ✓ |
| `VMU_ENV_UNKNOWN_NEED` | **已实现 ✓** | `vibe-math-vmu/kernel/env.js` | 代码里有该码字符串 ✓ |
| `VMU_EXIT_FLUSH_FAILED` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_EXIT_FLUSH_INCOMPLETE` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_EXIT_FLUSH_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_EXPLAIN_CORRELATION_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/explain.js` | 代码里有该码字符串 ✓ |
| `VMU_EXPLAIN_REASON_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/explain.js` | 代码里有该码字符串 ✓ |
| `VMU_EXPLAIN_REASON_TOO_LONG` | **已实现 ✓** | `vibe-math-vmu/kernel/explain.js` | 代码里有该码字符串 ✓ |
| `VMU_EXTEND_CEILING` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_EXTERNAL_DISABLED` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js`、`vibe-math-vmu/kernel/records.js` | 代码里有该码字符串 ✓ |
| `VMU_EXTERNAL_RECEIPT_INCOMPLETE` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js` | 代码里有该码字符串 ✓ |
| `VMU_EXTERNAL_STALE` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js` | 代码里有该码字符串 ✓ |
| `VMU_EXTERNAL_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js`、`vibe-math-vmu/kernel/formal.js`、`vibe-math-vmu/kernel/latex.js`、`vibe-math-vmu/kernel/lifecycle.js`、`vibe-math-vmu/kernel/mathadapters.js`、`vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/report.js`、`vibe-math-vmu/kernel/reportfeedback.js`、`vibe-math-vmu/kernel/reportfeedbackdelivery.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_FEEDBACK_ACTION_IS_THE_OPERATION` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
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
| `VMU_HUMAN_CALLER_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/tools/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_DASHBOARD_DOMAIN` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_DASHBOARD_SCOPE` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_DECIDER_ROLE` | **已实现 ✓** | `vibe-math-vmu/tools/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_DEFAULT_ALLOW_NOT_ACKNOWLEDGED` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_INJECT_ROLE` | **已实现 ✓** | `vibe-math-vmu/tools/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_LIFT_REASON_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js` | 代码里有该码字符串 ✓ |
| `VMU_HUMAN_LIFT_ROLE` | **已实现 ✓** | `vibe-math-vmu/kernel/human.js`、`vibe-math-vmu/tools/human.js` | 代码里有该码字符串 ✓ |
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
| `VMU_INVALID_ARGUMENT` | **已实现 ✓** | `vibe-math-vmu/extensions/domain-compliance/gate.js`、`vibe-math-vmu/host-deliver.js`、`vibe-math-vmu/host-math.js`、`vibe-math-vmu/host-pack-tools.js`、`vibe-math-vmu/host-spawn.js`、`vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/activity.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/arbitration.js`、`vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/board.js`、`vibe-math-vmu/kernel/bus.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/charter.js`、`vibe-math-vmu/kernel/chat.js`、`vibe-math-vmu/kernel/citations.js`、`vibe-math-vmu/kernel/clockguard.js`、`vibe-math-vmu/kernel/collab.js`、`vibe-math-vmu/kernel/compliance.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/control.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/custody.js`、`vibe-math-vmu/kernel/delegation.js`、`vibe-math-vmu/kernel/directions.js`、`vibe-math-vmu/kernel/discipline.js`、`vibe-math-vmu/kernel/explain.js`、`vibe-math-vmu/kernel/fairness.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/guard.js`、`vibe-math-vmu/kernel/handover.js`、`vibe-math-vmu/kernel/human.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/identity.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/latex.js`、`vibe-math-vmu/kernel/library-policy.js`、`vibe-math-vmu/kernel/library.js`、`vibe-math-vmu/kernel/loader.js`、`vibe-math-vmu/kernel/mailbox.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetingdomain.js`、`vibe-math-vmu/kernel/meetinglapse.js`、`vibe-math-vmu/kernel/meetingleave.js`、`vibe-math-vmu/kernel/meetingmarker.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/meetingverdict.js`、`vibe-math-vmu/kernel/memberface.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/memory.js`、`vibe-math-vmu/kernel/metrics.js`、`vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/minutes.js`、`vibe-math-vmu/kernel/notify.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/kernel/panel.js`、`vibe-math-vmu/kernel/paper.js`、`vibe-math-vmu/kernel/partnership.js`、`vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/publication.js`、`vibe-math-vmu/kernel/ratelimit.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/recruit.js`、`vibe-math-vmu/kernel/registry.js`、`vibe-math-vmu/kernel/replay.js`、`vibe-math-vmu/kernel/report.js`、`vibe-math-vmu/kernel/reporttransport.js`、`vibe-math-vmu/kernel/resume.js`、`vibe-math-vmu/kernel/reviewers.js`、`vibe-math-vmu/kernel/rules.js`、`vibe-math-vmu/kernel/scheduler.js`、`vibe-math-vmu/kernel/script-bridge.js`、`vibe-math-vmu/kernel/skills.js`、`vibe-math-vmu/kernel/store.js`、`vibe-math-vmu/kernel/storepolicy.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kernel/tenure.js`、`vibe-math-vmu/kernel/timevalue.js`、`vibe-math-vmu/kernel/topology.js`、`vibe-math-vmu/kernel/transaction.js`、`vibe-math-vmu/kernel/trust.js`、`vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/kernel/workflow.js`、`vibe-math-vmu/kit/extras.js`、`vibe-math-vmu/kit/handlers.js`、`vibe-math-vmu/kit/paper.js`、`vibe-math-vmu/kit/tools.js`、`vibe-math-vmu/packs/v3/middleware/dataplane.js`、`vibe-math-vmu/packs/v3/middleware/gates.js`、`vibe-math-vmu/packs/v3/middleware/methods.js`、`vibe-math-vmu/packs/v3/middleware/planner.js`、`vibe-math-vmu/packs/v3/middleware/verify.js`、`vibe-math-vmu/packs/v3/tools.js`、`vibe-math-vmu/packs/v5r/blueprint.js`、`vibe-math-vmu/packs/v5r/middleware/paper-dispatch.js`、`vibe-math-vmu/packs/v5r/middleware/prompt-switches.js`、`vibe-math-vmu/packs/v5r/notices.js`、`vibe-math-vmu/packs/v5r/paper-quality.js`、`vibe-math-vmu/packs/v5r/tools.js`、`vibe-math-vmu/packs/v5r/verification-gates.js`、`vibe-math-vmu/packs/v5r/verified.js`、`vibe-math-vmu/settings/schema.js`、`vibe-math-vmu/tools/activity.js`、`vibe-math-vmu/tools/admission.js`、`vibe-math-vmu/tools/arbitration.js`、`vibe-math-vmu/tools/audit.js`、`vibe-math-vmu/tools/auditchain.js`、`vibe-math-vmu/tools/bidding.js`、`vibe-math-vmu/tools/board.js`、`vibe-math-vmu/tools/bridge.js`、`vibe-math-vmu/tools/budget.js`、`vibe-math-vmu/tools/capacity.js`、`vibe-math-vmu/tools/charter.js`、`vibe-math-vmu/tools/chat.js`、`vibe-math-vmu/tools/citations.js`、`vibe-math-vmu/tools/clockguard.js`、`vibe-math-vmu/tools/collab.js`、`vibe-math-vmu/tools/conference.js`、`vibe-math-vmu/tools/control.js`、`vibe-math-vmu/tools/custody.js`、`vibe-math-vmu/tools/discipline.js`、`vibe-math-vmu/tools/env.js`、`vibe-math-vmu/tools/explain.js`、`vibe-math-vmu/tools/external.js`、`vibe-math-vmu/tools/fairness.js`、`vibe-math-vmu/tools/formal.js`、`vibe-math-vmu/tools/governance.js`、`vibe-math-vmu/tools/handover.js`、`vibe-math-vmu/tools/human.js`、`vibe-math-vmu/tools/idempotency.js`、`vibe-math-vmu/tools/ip.js`、`vibe-math-vmu/tools/mailbox.js`、`vibe-math-vmu/tools/mathtools.js`、`vibe-math-vmu/tools/meeting.js`、`vibe-math-vmu/tools/member-tools.js`、`vibe-math-vmu/tools/minutes.js`、`vibe-math-vmu/tools/notify.js`、`vibe-math-vmu/tools/panel.js`、`vibe-math-vmu/tools/projmigrate.js`、`vibe-math-vmu/tools/publication.js`、`vibe-math-vmu/tools/ratelimit.js`、`vibe-math-vmu/tools/recruit.js`、`vibe-math-vmu/tools/report.js`、`vibe-math-vmu/tools/retention.js`、`vibe-math-vmu/tools/reviewers.js`、`vibe-math-vmu/tools/task.js`、`vibe-math-vmu/tools/topology.js`、`vibe-math-vmu/tools/transaction.js`、`vibe-math-vmu/tools/turn.js`、`vibe-math-vmu/tools/vote.js` | 代码里有该码字符串 ✓ |
| `VMU_JOB_CANCELLED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js`、`vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_JOB_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/script-bridge.js` | 代码里有该码字符串 ✓ |
| `VMU_LATE_ADMISSION_REFUSED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
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
| `VMU_LEAN_NOT_FOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js`、`vibe-math-vmu/kit/extras.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_NOT_SETTLED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_SPAWN_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_STATEMENT_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js`、`vibe-math-vmu/kit/extras.js` | 代码里有该码字符串 ✓ |
| `VMU_LEAN_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js` | 代码里有该码字符串 ✓ |
| `VMU_LIFECYCLE_BAD_STAGE_ID` | **已实现 ✓** | `vibe-math-vmu/kernel/lifecycle.js` | 代码里有该码字符串 ✓ |
| `VMU_LIFECYCLE_EVIDENCE_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/lifecycle.js` | 代码里有该码字符串 ✓ |
| `VMU_LIFECYCLE_GATE_UNMET` | **已实现 ✓** | `vibe-math-vmu/kernel/lifecycle.js` | 代码里有该码字符串 ✓ |
| `VMU_LIFECYCLE_ILLEGAL_STEP` | **已实现 ✓** | `vibe-math-vmu/kernel/lifecycle.js` | 代码里有该码字符串 ✓ |
| `VMU_LIFECYCLE_NOT_DECLARED` | **已实现 ✓** | `vibe-math-vmu/kernel/lifecycle.js` | 代码里有该码字符串 ✓ |
| `VMU_MAILBOX_ACK_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/mailbox.js` | 代码里有该码字符串 ✓ |
| `VMU_MAILBOX_ALREADY_ACKED` | **已实现 ✓** | `vibe-math-vmu/kernel/mailbox.js` | 代码里有该码字符串 ✓ |
| `VMU_MAILBOX_ANCHOR_DANGLING` | **已实现 ✓** | `vibe-math-vmu/kernel/mailbox.js` | 代码里有该码字符串 ✓ |
| `VMU_MAILBOX_CAP_REACHED` | **已实现 ✓** | `vibe-math-vmu/kernel/mailbox.js` | 代码里有该码字符串 ✓ |
| `VMU_MAILBOX_DELIVERY_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/mailbox.js` | 代码里有该码字符串 ✓ |
| `VMU_MAILBOX_NOTICE_FAILED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MAILBOX_NO_SUCH_ENTRY` | **已实现 ✓** | `vibe-math-vmu/kernel/mailbox.js` | 代码里有该码字符串 ✓ |
| `VMU_MAILBOX_NO_SUCH_RECIPIENT` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/mailbox.js`、`vibe-math-vmu/kernel/reporttransport.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_ADAPTER_OP_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_ARTIFACT_TOO_LARGE` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_ASSUMPTION_CONFLICT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_CACHE_CORRUPT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_DIMENSION_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_EXPR_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_HARNESS_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js`、`vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_INTERVAL_EMPTY` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_INVALID_INPUT` | **已实现 ✓** | `vibe-math-vmu/kernel/fidelity.js`、`vibe-math-vmu/kernel/formal.js`、`vibe-math-vmu/kernel/mathadapters.js`、`vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/tools/fidelity.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_JOBS_DIR_UNSAFE` | **已实现 ✓** | `vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_JOBS_MIRROR_UNWIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/fidelity.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/mathjobs.js`、`vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_JOB_ID_TAKEN` | **已实现 ✓** | `vibe-math-vmu/kernel/lean.js`、`vibe-math-vmu/kernel/mathjobs.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_JOB_INVALID_STATE` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_JOB_PERSIST_FAILED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_LIB_NOT_DECLARED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_LIB_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/mathadapters.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_NONCONVERGENT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MATH_NOT_CONVERGED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_MATH_PERSIST_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
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
| `VMU_MATH_VOCABULARY` | **已实现 ✓** | `vibe-math-vmu/kernel/math.js` | 代码里有该码字符串 ✓ |
| `VMU_MD_READ_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/records.js` | 代码里有该码字符串 ✓ |
| `VMU_MD_WRITE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/records.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETINGS_MARKER_UNREADABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/meetingmarker.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_APPEAL_OUT_OF_SCOPE` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_BOX_BINDING_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetingmarker.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_BOX_UNMAPPED` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/meetingmarker.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_BOX_UNWIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetingmarker.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_CONFIDENTIAL_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_DISCIPLINE_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_EMERGENCY_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_ID_ARCHIVED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_INTERRUPT_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_LABEL_MISSING` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_LIGHT_NO_TRUTH` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/minutes.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_NOT_FOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_NOT_STARTED` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_ORDER_DENIED` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MEETING_QUORUM_LOST` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_RECESS_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_SPEECH_TIMEBOUND` | **已实现 ✓** | `vibe-math-vmu/kernel/meetinglapse.js`、`vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_TIER_CONFLICT` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_TOO_SMALL` | **已实现 ✓** | `vibe-math-vmu/kernel/meeting.js` | 代码里有该码字符串 ✓ |
| `VMU_MEETING_UNANSWERED_POLICY` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_MEMBER_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_MEMBER_SESSION_NEVER_OPENED` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_MEMBER_SESSION_NOT_LIVE` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_MEMORY_NOT_AUTHORITY` | **已实现 ✓** | `vibe-math-vmu/kernel/memory.js` | 代码里有该码字符串 ✓ |
| `VMU_META_VALIDATION_FAILED` | **已实现 ✓** | `vibe-math-vmu/extensions/domain-compliance/index.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/lifecycle.js`、`vibe-math-vmu/kernel/resource.js`、`vibe-math-vmu/kernel/stateversion.js`、`vibe-math-vmu/kernel/storepolicy.js` | 代码里有该码字符串 ✓ |
| `VMU_METRICS_TRIGGER_FORBIDDEN` | **已实现 ✓** | `vibe-math-vmu/kernel/metrics.js` | 代码里有该码字符串 ✓ |
| `VMU_METRIC_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/metrics.js`、`vibe-math-vmu/packs/v5r/middleware/artifact-counter.js` | 代码里有该码字符串 ✓ |
| `VMU_MIDDLEWARE_FAILED` | **已实现 ✓** | `vibe-math-vmu/host-spawn.js`、`vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/activity.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/bus.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/library.js`、`vibe-math-vmu/kernel/loader.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/registry.js`、`vibe-math-vmu/kernel/reportfeedback.js`、`vibe-math-vmu/kernel/rules.js`、`vibe-math-vmu/kernel/script-bridge.js`、`vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/packs/v3/middleware/gates.js`、`vibe-math-vmu/packs/v3/middleware/methods.js`、`vibe-math-vmu/packs/v3/middleware/paper-close.js`、`vibe-math-vmu/packs/v3/middleware/planner.js`、`vibe-math-vmu/packs/v3/middleware/verify.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
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
| `VMU_NOT_PERMITTED` | **已实现 ✓** | `vibe-math-vmu/host-hooks.js`、`vibe-math-vmu/host-math.js`、`vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/arbitration.js`、`vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/ballotbox.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/charter.js`、`vibe-math-vmu/kernel/chat.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/delegation.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/guard.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/library.js`、`vibe-math-vmu/kernel/loader.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetinglapse.js`、`vibe-math-vmu/kernel/meetingleave.js`、`vibe-math-vmu/kernel/meetingmarker.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/panel.js`、`vibe-math-vmu/kernel/paper.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/resource.js`、`vibe-math-vmu/kernel/reviewers.js`、`vibe-math-vmu/kernel/storepolicy.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kit/handlers.js`、`vibe-math-vmu/kit/paper.js`、`vibe-math-vmu/packs/v5r/middleware/paper-dispatch.js`、`vibe-math-vmu/packs/v5r/tools.js`、`vibe-math-vmu/settings/schema.js`、`vibe-math-vmu/tools/mailbox.js`、`vibe-math-vmu/tools/meeting.js`、`vibe-math-vmu/tools/panel.js`、`vibe-math-vmu/tools/turn.js` | 代码里有该码字符串 ✓ |
| `VMU_NO_OPEN_MEETING` | **已实现 ✓** | `vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/minutes.js`、`vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_NO_SUCH_OBJECT` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/arbitration.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/charter.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/delegation.js`、`vibe-math-vmu/kernel/directions.js`、`vibe-math-vmu/kernel/fairness.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/handover.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/library.js`、`vibe-math-vmu/kernel/loader.js`、`vibe-math-vmu/kernel/mailbox.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetingdomain.js`、`vibe-math-vmu/kernel/meetingleave.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/memory.js`、`vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/minutes.js`、`vibe-math-vmu/kernel/pack.js`、`vibe-math-vmu/kernel/paper.js`、`vibe-math-vmu/kernel/prompt/index.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/registry.js`、`vibe-math-vmu/kernel/replay.js`、`vibe-math-vmu/kernel/retention.js`、`vibe-math-vmu/kernel/rules.js`、`vibe-math-vmu/kernel/scheduler.js`、`vibe-math-vmu/kernel/skills.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kernel/transaction.js`、`vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/kit/extras.js`、`vibe-math-vmu/kit/handlers.js`、`vibe-math-vmu/kit/paper.js`、`vibe-math-vmu/packs/v3/middleware/gates.js`、`vibe-math-vmu/packs/v3/middleware/planner.js`、`vibe-math-vmu/packs/v3/middleware/verify.js`、`vibe-math-vmu/packs/v5r/blueprint.js`、`vibe-math-vmu/packs/v5r/tools.js`、`vibe-math-vmu/tools/meeting.js`、`vibe-math-vmu/tools/turn.js`、`vibe-math-vmu/tools/vote.js` | 代码里有该码字符串 ✓ |
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
| `VMU_PACK_DECLARATION_TOO_LATE` | **已实现 ✓** | `vibe-math-vmu/kernel/pack.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_DECLARATION_UNCONSUMED` | **已实现 ✓** | `vibe-math-vmu/kernel/pack.js` | 代码里有该码字符串 ✓ |
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
| `VMU_PACK_V5R_BLUEPRINT_MD_DRIFT` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/blueprint.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_BLUEPRINT_MD_MISSING` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/blueprint.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_NOT_SETTLED` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/paper-quality.js`、`vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING` | **已实现 ✓** | `vibe-math-vmu/kit/paper.js`、`vibe-math-vmu/packs/v5r/paper.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-core.js`、`vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_PAPER_FINGERPRINT_MISMATCH` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/paper.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_PAPER_PDF_FAILED` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/paper.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-core.js`、`vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_PAPER_PDF_NEEDS_KERNEL` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/paper.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORE_PAPER_STATE` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/middleware/paper-dispatch.js`、`vibe-math-vmu/packs/v5r/paper.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_CORPUS_NOT_RUNTIME` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/prompts/v5r-core.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/verification-gates.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_DEBATE_SUBJECT_UNPROVEN` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/verification-gates.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_FIDELITY_ASK_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/verification-gates.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_FORMAL_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_P1_NEEDS_DEBATE` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js`、`vibe-math-vmu/packs/v5r/verification-gates.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_VERIFIED_NEEDS_JUDGE` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_PACK_V5R_VERIFIED_SINGLE_WRITER` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/verification-gates.js` | 代码里有该码字符串 ✓ |
| `VMU_PANEL_CAP_REACHED` | **已实现 ✓** | `vibe-math-vmu/kernel/panel.js` | 代码里有该码字符串 ✓ |
| `VMU_PANEL_DEVIATION` | **已实现 ✓** | `vibe-math-vmu/kernel/panel.js` | 代码里有该码字符串 ✓ |
| `VMU_PANEL_NO_SUCH_MEMBER` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_PANEL_TIME_KEY` | **已实现 ✓** | `vibe-math-vmu/kernel/panel.js` | 代码里有该码字符串 ✓ |
| `VMU_PANEL_UNKNOWN_FIELD` | **已实现 ✓** | `vibe-math-vmu/kernel/panel.js` | 代码里有该码字符串 ✓ |
| `VMU_PAPER_LATEX_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/latex.js` | 代码里有该码字符串 ✓ |
| `VMU_PAPER_LATEX_INTERRUPTED` | **已实现 ✓** | `vibe-math-vmu/kernel/latex.js` | 代码里有该码字符串 ✓ |
| `VMU_PAPER_LATEX_NO_ENGINE` | **已实现 ✓** | `vibe-math-vmu/kernel/latex.js`、`vibe-math-vmu/kit/paper.js`、`vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
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
| `VMU_RECORDS_REINDEX_BLOCKED` | **已实现 ✓** | `vibe-math-vmu/kernel/records.js` | 代码里有该码字符串 ✓ |
| `VMU_RECORD_SETTLEMENT_REWRITE` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_RECORD_SHAPE` | **已实现 ✓** | `vibe-math-vmu/kernel/library.js`、`vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
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
| `VMU_REGISTRY_BOUNDARY` | **已实现 ✓** | `vibe-math-vmu/tools/meeting.js` | 代码里有该码字符串 ✓ |
| `VMU_REOPEN_FLOOR_NOT_MET` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_REOPEN_WRONG_INITIATOR` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_REPORT_ACTION_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_AUDIT_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_CHANNEL_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_DECLARATION_INVALID` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_DELIVER_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js`、`vibe-math-vmu/packs/v3/middleware/reports.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_NOT_ENABLED` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_NO_RECIPIENTS` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_NO_TRANSPORT` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js`、`vibe-math-vmu/kernel/reporttransport.js`、`vibe-math-vmu/packs/v3/middleware/reports.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_PARAM_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_PARAM_NOT_DECLARED` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_PARAM_READONLY` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_PARAM_REASON_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_TEMPLATE_VAR_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_TRIGGER_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPORT_UNKNOWN_NAME` | **已实现 ✓** | `vibe-math-vmu/kernel/report.js` | 代码里有该码字符串 ✓ |
| `VMU_REPRO_COPY_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/repropack.js` | 代码里有该码字符串 ✓ |
| `VMU_RESOURCE_BUDGET` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/budget.js`、`vibe-math-vmu/kernel/course.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meetingmarker.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/paper.js`、`vibe-math-vmu/kernel/projmigrate.js`、`vibe-math-vmu/kernel/replay.js`、`vibe-math-vmu/kernel/resource.js`、`vibe-math-vmu/kernel/stateversion.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kernel/transaction.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_ADAPTER_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_BAD_STEP` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_BUSY` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_CHILDREN_NONE_YET` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_CHILDREN_NO_PARENT` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_CHILDREN_PORT_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_CHILDREN_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/host-children.js`、`vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_CLOCK_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js`、`vibe-math-vmu/kernel/resumeflush.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_HOSTCONTRACT` | **已实现 ✓** | `vibe-math-vmu/host-deliver.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_INTERRUPTED_NOT_PASSED` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_MAILBOX_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_NO_ADAPTER` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_NO_TARGET` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_PROJECTION_GAP` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_QUEUE_FULL` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_READBACK_DRIFT` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js`、`vibe-math-vmu/tools/human.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_RESTORE_CONFLICT` | **已实现 ✓** | `vibe-math-vmu/kernel/budget.js`、`vibe-math-vmu/kernel/human.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/resume.js`、`vibe-math-vmu/kernel/tasks.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_RESTORE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_SNAPSHOT_INCOMPLETE` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_SNAPSHOT_VERSION` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/resume.js`、`vibe-math-vmu/kernel/resumeflush.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_WATCHDOGS_NONE` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_WATCHDOGS_PORT_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_WATCHDOGS_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js` | 代码里有该码字符串 ✓ |
| `VMU_RESUME_WRITE_BEFORE_READ` | **已实现 ✓** | `vibe-math-vmu/kernel/resume.js`、`vibe-math-vmu/kernel/resumeflush.js` | 代码里有该码字符串 ✓ |
| `VMU_RETENTION_TRUNCATED` | **已实现 ✓** | `vibe-math-vmu/kernel/retention.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLE_EVIDENCE_REQUIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLE_RECALL_COOLDOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLE_RECALL_QUORUM` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLE_SEPARATION_VIOLATED` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLE_TERM_NOT_RENEWABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/recruit.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLLBACK_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js` | 代码里有该码字符串 ✓ |
| `VMU_ROLLBACK_UNAVAILABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/migration.js` | 代码里有该码字符串 ✓ |
| `VMU_RULING_ALREADY_FILED` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_RULING_CHAIR_SIGNS` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_RULING_CONTRADICTS_SUBMISSION` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_RULING_NEEDS_CHANNEL` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_RULING_NOT_DEBATER` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_RULING_NO_LEDGER` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_RULING_NO_SUBMISSIONS` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/tools.js` | 代码里有该码字符串 ✓ |
| `VMU_SAFETY_EXEC_NOT_ALLOWED` | **已实现 ✓** | `vibe-math-vmu/kernel/guard.js` | 代码里有该码字符串 ✓ |
| `VMU_SAFETY_KILL_SWITCH` | **已实现 ✓** | `vibe-math-vmu/kernel/guard.js` | 代码里有该码字符串 ✓ |
| `VMU_SAFETY_NET_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/guard.js` | 代码里有该码字符串 ✓ |
| `VMU_SAFETY_PATH_TOO_LONG` | **已实现 ✓** | `vibe-math-vmu/kernel/guard.js` | 代码里有该码字符串 ✓ |
| `VMU_SAFETY_SYMLINK_DENIED` | **已实现 ✓** | `vibe-math-vmu/kernel/guard.js` | 代码里有该码字符串 ✓ |
| `VMU_SCHEDULER_ACTION_FORBIDDEN` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_SCHEDULER_TRIGGER_LIMIT` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_SCHEDULE_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/scheduler.js` | 代码里有该码字符串 ✓ |
| `VMU_SCOPE_REFUSED` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/member-scope.js` | 代码里有该码字符串 ✓ |
| `VMU_SEAT_FACE_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/seat-faces.js` | 代码里有该码字符串 ✓ |
| `VMU_SKILL_LIMIT` | **已实现 ✓** | `vibe-math-vmu/kernel/skills.js` | 代码里有该码字符串 ✓ |
| `VMU_SKILL_SELF_ATTEST` | **已实现 ✓** | `vibe-math-vmu/kernel/skills.js` | 代码里有该码字符串 ✓ |
| `VMU_SKILL_VOCAB_VIOLATION` | **已实现 ✓** | `vibe-math-vmu/kernel/skills.js` | 代码里有该码字符串 ✓ |
| `VMU_SLO_BUDGET_EXHAUSTED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js` | 代码里有该码字符串 ✓ |
| `VMU_SPAWN_HANDLE_CALLBACK_FAILED` | **已实现 ✓** | `vibe-math-vmu/host-spawn.js` | 代码里有该码字符串 ✓ |
| `VMU_SPAWN_TIMER_CLEANUP` | **已实现 ✓** | `vibe-math-vmu/host-spawn.js` | 代码里有该码字符串 ✓ |
| `VMU_STATE` | **已实现 ✓** | `vibe-math-vmu/host.js`、`vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/arbitration.js`、`vibe-math-vmu/kernel/ballot.js`、`vibe-math-vmu/kernel/ballotbox.js`、`vibe-math-vmu/kernel/bidding.js`、`vibe-math-vmu/kernel/capacity.js`、`vibe-math-vmu/kernel/charter.js`、`vibe-math-vmu/kernel/conference.js`、`vibe-math-vmu/kernel/delegation.js`、`vibe-math-vmu/kernel/funding.js`、`vibe-math-vmu/kernel/human.js`、`vibe-math-vmu/kernel/idempotency.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/ip.js`、`vibe-math-vmu/kernel/mailbox.js`、`vibe-math-vmu/kernel/mathtools.js`、`vibe-math-vmu/kernel/meeting.js`、`vibe-math-vmu/kernel/meetinglapse.js`、`vibe-math-vmu/kernel/meetings.js`、`vibe-math-vmu/kernel/members.js`、`vibe-math-vmu/kernel/memory.js`、`vibe-math-vmu/kernel/migration.js`、`vibe-math-vmu/kernel/paper.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/resume.js`、`vibe-math-vmu/kernel/scheduler.js`、`vibe-math-vmu/kernel/tasks.js`、`vibe-math-vmu/kernel/transaction.js`、`vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/kernel/workflow.js`、`vibe-math-vmu/kit/handlers.js`、`vibe-math-vmu/packs/v3/middleware/dataplane.js`、`vibe-math-vmu/packs/v3/middleware/gates.js`、`vibe-math-vmu/packs/v3/middleware/planner.js`、`vibe-math-vmu/packs/v3/middleware/verify.js`、`vibe-math-vmu/packs/v3/tools.js`、`vibe-math-vmu/packs/v5r/blueprint.js`、`vibe-math-vmu/packs/v5r/tools.js`、`vibe-math-vmu/packs/v5r/verified.js`、`vibe-math-vmu/tools/activity.js`、`vibe-math-vmu/tools/admission.js`、`vibe-math-vmu/tools/arbitration.js`、`vibe-math-vmu/tools/audit.js`、`vibe-math-vmu/tools/auditchain.js`、`vibe-math-vmu/tools/bidding.js`、`vibe-math-vmu/tools/board.js`、`vibe-math-vmu/tools/bridge.js`、`vibe-math-vmu/tools/budget.js`、`vibe-math-vmu/tools/capacity.js`、`vibe-math-vmu/tools/charter.js`、`vibe-math-vmu/tools/chat.js`、`vibe-math-vmu/tools/citations.js`、`vibe-math-vmu/tools/clockguard.js`、`vibe-math-vmu/tools/collab.js`、`vibe-math-vmu/tools/conference.js`、`vibe-math-vmu/tools/control.js`、`vibe-math-vmu/tools/custody.js`、`vibe-math-vmu/tools/discipline.js`、`vibe-math-vmu/tools/env.js`、`vibe-math-vmu/tools/explain.js`、`vibe-math-vmu/tools/external.js`、`vibe-math-vmu/tools/fairness.js`、`vibe-math-vmu/tools/fidelity.js`、`vibe-math-vmu/tools/formal.js`、`vibe-math-vmu/tools/governance.js`、`vibe-math-vmu/tools/handover.js`、`vibe-math-vmu/tools/human.js`、`vibe-math-vmu/tools/idempotency.js`、`vibe-math-vmu/tools/ip.js`、`vibe-math-vmu/tools/mailbox.js`、`vibe-math-vmu/tools/mathadapters.js`、`vibe-math-vmu/tools/mathjobs.js`、`vibe-math-vmu/tools/mathtools.js`、`vibe-math-vmu/tools/meeting.js`、`vibe-math-vmu/tools/minutes.js`、`vibe-math-vmu/tools/notify.js`、`vibe-math-vmu/tools/panel.js`、`vibe-math-vmu/tools/projmigrate.js`、`vibe-math-vmu/tools/publication.js`、`vibe-math-vmu/tools/ratelimit.js`、`vibe-math-vmu/tools/recruit.js`、`vibe-math-vmu/tools/report.js`、`vibe-math-vmu/tools/retention.js`、`vibe-math-vmu/tools/reviewers.js`、`vibe-math-vmu/tools/task.js`、`vibe-math-vmu/tools/topology.js`、`vibe-math-vmu/tools/transaction.js`、`vibe-math-vmu/tools/turn.js`、`vibe-math-vmu/tools/vote.js` | 代码里有该码字符串 ✓ |
| `VMU_STORE_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/alerts.js`、`vibe-math-vmu/kernel/index.js`、`vibe-math-vmu/kernel/lean.js`、`vibe-math-vmu/kernel/mailbox.js`、`vibe-math-vmu/kernel/records.js`、`vibe-math-vmu/kernel/store.js`、`vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/kernel/work.js`、`vibe-math-vmu/vibe-math-vmu.js` | 代码里有该码字符串 ✓ |
| `VMU_STORE_MIGRATION` | **已实现 ✓** | `vibe-math-vmu/kernel/store.js` | 代码里有该码字符串 ✓ |
| `VMU_TASK_BLOCKED` | **已实现 ✓** | `vibe-math-vmu/kernel/tasks.js` | 代码里有该码字符串 ✓ |
| `VMU_TASK_DEPENDENCY_CYCLE` | **已实现 ✓** | `vibe-math-vmu/kernel/tasks.js` | 代码里有该码字符串 ✓ |
| `VMU_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/kernel/external.js`、`vibe-math-vmu/kernel/mathtools.js` | 代码里有该码字符串 ✓ |
| `VMU_TOOL_FACE_UNRESOLVED` | **已实现 ✓** | `vibe-math-vmu/host-pack-tools.js`、`vibe-math-vmu/kernel/memberface.js` | 代码里有该码字符串 ✓ |
| `VMU_TOOL_NOT_IN_FACE` | **已实现 ✓** | `vibe-math-vmu/host-pack-tools.js`、`vibe-math-vmu/kernel/memberface.js` | 代码里有该码字符串 ✓ |
| `VMU_TOPOLOGY_CYCLE` | **已实现 ✓** | `vibe-math-vmu/kernel/topology.js` | 代码里有该码字符串 ✓ |
| `VMU_TOPOLOGY_PATH_FORBIDDEN` | **已实现 ✓** | `vibe-math-vmu/kernel/topology.js` | 代码里有该码字符串 ✓ |
| `VMU_TOPOLOGY_SIZE_EXCEEDED` | **已实现 ✓** | `vibe-math-vmu/kernel/topology.js` | 代码里有该码字符串 ✓ |
| `VMU_TRUST_VOCAB_VIOLATION` | **已实现 ✓** | `vibe-math-vmu/kernel/trust.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_ABANDONED` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_ALREADY_PARKED` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_ASSEMBLY_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_BAD_JSON` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-reply-channel.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_DELIVERY_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_DELIVERY_NO_PAYLOAD` | 提案 ⛔ | — | 仅登记在表里：实现时补语义与触发时机 ✓ |
| `VMU_TURN_DELIVERY_SHAPE` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_DELIVERY_TIMEOUT` | **已实现 ✓** | `vibe-math-vmu/host-deliver.js`、`vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/tools/turn.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_DISPATCH_FAILED` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_DUPLICATE_SKIPPED` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_FACE_NOT_WIRED` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_FIELD_NOT_APPLICABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-reply-channel.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_NO_FENCE` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-reply-channel.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_NO_PENDING_MEMBER` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-reply-channel.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_OP_MISSING` | **已实现 ✓** | `vibe-math-vmu/tools/turn.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_PARKED_NEEDS_OWNER` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/tools/turn.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_REENTRANT` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/packs/v3/middleware/verify.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_REPLY_CONFLICT` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js`、`vibe-math-vmu/packs/v5r/prompts/v5r-reply-channel.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_STALE_REPLY` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_UNKNOWN_FIELD` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TURN_UNKNOWN_MEMBER` | **已实现 ✓** | `vibe-math-vmu/kernel/turn/index.js` | 代码里有该码字符串 ✓ |
| `VMU_TX_STEP_NOT_COMPENSABLE` | **已实现 ✓** | `vibe-math-vmu/kernel/transaction.js` | 代码里有该码字符串 ✓ |
| `VMU_UNKNOWN` | **已实现 ✓** | `vibe-math-vmu/kernel/records.js` | 代码里有该码字符串 ✓ |
| `VMU_V5R_CLOCK_VALUE_INVALID` | **已实现 ✓** | `vibe-math-vmu/packs/v5r/blueprint.js` | 代码里有该码字符串 ✓ |
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

提案码（41）：VMU_AUCTION_MIN_BIDS、VMU_AWARD_RATIONALE_REQUIRED、VMU_BALLOT_FROZEN、VMU_BALLOT_SECRECY_LOCKED、VMU_CHAT_CAP_REACHED、VMU_CONTROL_SCOPE_UNKNOWN、VMU_DEGRADED、VMU_FORMAL_LIBRARY_NOT_INDEXED、VMU_FORMAL_SKELETON_UNAVAILABLE、VMU_MAILBOX_NOTICE_FAILED、VMU_MATH_ARTIFACT_TOO_LARGE、VMU_MATH_ASSUMPTION_CONFLICT、VMU_MATH_CACHE_CORRUPT、VMU_MATH_INTERVAL_EMPTY、VMU_MATH_JOB_INVALID_STATE、VMU_MATH_JOB_PERSIST_FAILED、VMU_MATH_NONCONVERGENT、VMU_MATH_PRECISION_LOST、VMU_MATH_RESIDUAL_TOO_LARGE、VMU_MATH_SINGULAR_MATRIX、VMU_MEETING_ORDER_DENIED、VMU_MEETING_UNANSWERED_POLICY、VMU_NAME_CONFLICT、VMU_PACK_KERNEL_OVERRIDE_REFUSED、VMU_PANEL_NO_SUCH_MEMBER、VMU_PARAM_DEPRECATED、VMU_PARAM_REMOVED、VMU_PROXY_CHAIN_TOO_DEEP、VMU_PROXY_NOT_ALLOWED、VMU_RECOUNT_MISMATCH、VMU_RECOUNT_SCOPE_DENIED、VMU_RECUSAL_REQUIRED、VMU_REF_DANGLING、VMU_REOPEN_FLOOR_NOT_MET、VMU_REOPEN_WRONG_INITIATOR、VMU_SCHEDULER_ACTION_FORBIDDEN、VMU_SCHEDULER_TRIGGER_LIMIT、VMU_TURN_DELIVERY_NO_PAYLOAD、VMU_VETO_NOT_ALLOWED、VMU_WORKFLOW_CHECKPOINT_MISSING、VMU_WORKFLOW_RACI_MISSING_OWNER

<!-- PLANNED-CODES:END -->

| **`VMU_IO_FAILED`** | **写盘/IO 失败**（与"状态不对"**区分**：调用方应重试或改路径，而不是改状态机 ✗） | 耐久/记录/归档 | ✅（**R-c 已裁定：新增** ✓，替代把 `V5_WRITE_FAILED` 混入 `VMU_STATE` ✗） |
| **TB-2743 · `VMU_REVIEW_STALE`** | **互审票绑的是旧正文**：票上的 `judgedPartFingerprint` / `judgedPartRound` 与该 part 槽位**现在**的指纹/轮次不一致 ⇒ 这张票**不计覆盖、也不计为拒收**，具名进 `perRoundReviewCoverage.staleReviews`（每条带 `by`/`of`/两枚指纹/两轮/`why`）；当陈旧票是「这一轮还差谁」的**唯一**原因时，`advance` 与 `final` 两门都具名拒，hint 给可照抄的修法（`part-text-changed` ⇒ 一行重投；`round-changed` ⇒ 五步：先由陈旧评审人投一次 `false`、`advance` 回到 writing、每位作者为**当前轮**重交 `part`、`advance`、最后重投 `true`） | `vibe-math-vmu/kit/paper.js` 的 `requireCrossReview`（`advance` 与 `final` 共用）；读数为 `perRoundReviewCoverageOfState` 的 `staleReviews`/`staleReviewsMeans`；票行字段见 `recordReview`（`judgedPartFingerprint`/`judgedPartRound`/`stalePart`） | ✅（须给 `staleReviews` 每条的两枚指纹与两轮；hint 带 ASCII `REACHABLE INSTEAD:` 且点名的调用**真可执行**；验证：`tests/vmu-run79-review-fingerprint.test.mjs`） |

> **登记纪律（门禁 D14）**：文档/代码中出现的每个 `VMU_*` 都**必须**在本表登记；**未登记即红** ✗。新增码 ⇒ **只增不改语义**（改语义＝新码，见 §7）✓。

> **TB-2743 · 论文面的两个「未测 ≠ 没有」读数（不是错误码，登记在契约卷里）**：`vibe_v5_paper { action: "status" }` 的 `toolchainProbe` 恰取三值 —— `"not-run"`（**没问过**，此时 `toolchainAbsent:[]` **不代表没有工具链**，修法：`vibe_vmu_env { action: "probe", need: "xelatex" }`——引擎 need 只能取 `settings/env-needs.js` 注册表里的真值（`xelatex` / `latexmk` / `pdflatex` / `lualatex` / `tectonic`），`latex` 不在表内、照抄会得到 `VMU_ENV_UNKNOWN_NEED`）、`"ran-absent"`（**问过且实测不可用**）、`"ran-present"`（问过且可用；这是观测，不是安装承诺）；三值各配一句 `toolchainProbeMeans`。`pdfCompiled.produced:false` 时 `blockedBy` 恰取 `"not-finalized"` / `"no-parts"` / `"toolchain-absent"` / `"compile-not-run"` 之一并配 `blockedByMeans`——**不许用一个裸 `false` 让读者自己猜是哪一种**。验证：`tests/vmu-run79-review-fingerprint.test.mjs` §B。

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
6. **记录面只许一张脸（RUN 256 / TB-2617）**：一个形状、两处名字、一个恒等式。
   - **一个形状**：`excluded` 只有**一个容器**，三个形状丢弃（`shapeMismatch` 计数 + `shapeMismatchIds`、`noWriter` + `noWriterCount`、`timeUnknown` + `timeUnknownCount`）与默认排除的无轨行（`untracked` + `untrackedIds` + `untrackedScope`）都在同一对象里；不得另开第二个排除容器。`noWriter`/`timeUnknown` 是 `shapeMismatch` 的**子集**（同一行可能既缺 writer 又缺时间），所以恒等式只数 `shapeMismatch` 一次，绝不把三个列表相加。
   - **两处名字**：`kernel.records.list()` 是**唯一算数处**（合并外部行、过滤、排除命名、分页、恒等式都在这里）；`vibe_vmu_records {action:"list"}` 只转发并改名（`items` → `records`，保留 `rowsFrom` 等读数说明）。同一刻、同一查询下，两面的 `excluded`、`totalUniverse`、行数**逐字相等**；`ok:false` 原样抛同码同 facts。
   - **一个恒等式**：`page + pageDropped + excluded(shapeMismatch + untracked) === totalUniverse`，两面都带 `identity:{page,pageDropped,excluded,totalUniverse,holds,means}`。`limit` 存在 ⇒ `total` 是页前的过滤集合大小、`totalUniverse` 是它覆盖的全域；两者各有名字，`total` 绝不冒充 `totalUniverse`。外部行经 `external`/`externalSource` 传入内核，调用方不得自己再过滤或重新计数。

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
| **`vibe_vmu_mailbox`**（轮 2 ✓；PHASE 9 / 轮 2 扩） | **私信面**（11 动作）：`send｜pending｜flush｜ack｜list｜open｜setState｜plan｜anchor｜unread｜status` ✓。★ **非紧急投递只给提示（count/发件人/标题，notice ≤300 字），正文不进提示词**；`list` 行（12 字段，含 `urgent`／`ackRequired`／`acked`）不带正文，`open` 返回正文并置 `read:true`，`setState` 改 read/todo；**`ack` 是投递层结算，不等于读过**；行级 `ackRequired`／`acked` 由 `kernel/mailbox.js` 的 `ackReadsOf` 单一派生（见 §3.1f），group 广播行 `ackRequired:false`；紧急只有发送方显式 `urgent:true` 才带正文。 | `action`(必填，枚举)、`to`、`from`、`kind`、`text`、`subject`、`urgent`、`id`、`read`、`todo`、`status` | `mailboxTool` 为真（`vmu.mailbox.*`） | 服务的码原样透传 ✓（`VMU_MAILBOX_*`） |
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
