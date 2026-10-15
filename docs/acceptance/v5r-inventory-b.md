# v5r 深度盘点 · 分片 B

**任务**：`task-8`（Round1 · 目标3-B）。**唯一写入文件**：本文件。
**作者**：`v5r-reader-b`。**只读来源**：`Vibe-Mathematics`（分支 `main`，HEAD `6d0164e`），未做任何写入 / git 操作 / 依赖安装；未跑全量门禁与 `scripts/regen-all.mjs`。

**本分片范围（逐段读完整，未跳读、未抽样）**
- `vibe-math-v5r/vibe-math-v5r.js` 第 **3730–7359** 行（read 工具行号；本文件所有行号均为 **read 工具口径**）。
  - 覆盖：成员诞生五步 3734 / prompts 3973 / heartbeat-watchdog 4244 / 任务板原语 4278 / Lean 形式化 4308 / 异步 Lean 编译队列 4587 / `math_computation` 接缝 5027 / 经验反馈库 5243 / 三个索引 5493 / context·compact 5802 / 成员成果库 5829 / 任务板 CAS DAG 6062 / 共识验证 m-vote 6452；为把机制讲清，另**顺藤摸瓜**读了范围外的**定义侧**（行号单独标注为「范围外」）。
- `vibe-math-v5r/math-computation.js`（1481 行）**全文**。
- `vibe-math-v5r/math-engines.js`（197 行）**全文**。
- 指定文档：`docs/09-implementation-manual.md`（按需检索）、`vibe-math-v5r/docs/05-voting.md`（全文）、`vibe-math-v5r/docs/10-guards-and-acceptance.md`（全文）；另读了代码注释直接引为契约的 `docs/math-computation.md`、`docs/formal-verification.md`（全文），因为它们是本分片机制的一手契约。

**行号口径说明**：`read` 工具报 `vibe-math-v5r.js` 共 **11597** 行；`Get-Content` 报 11269 行（CR/LF 计数差异）。本文件只用 read 口径；引用外部文件时用其自身 read 口径。

**本分片的用途**：目标 2（表决/共识对照）、目标 3（框架是否足够强）、目标 4（pack 是否完整复现）、**目标 5（数学引擎深度 + 作业持久化/断点续算）** 的**唯一事实来源**。因此标注原则：宁详勿漏；每条机制都给「入口 / 逻辑 / 字段 / 参数与上下界 / 持久化-恢复 / 宿主接触面 / file:line」；结论凡可验证必附行号。

---

## 0. 预备知识：本分片所有机制共用的底座

不讲这层，后面每条机制的「持久化与恢复」都无从谈起。

| 底座 | 说明 | file:line |
|---|---|---|
| 事件类型表 `EV` | 12 个耐久事件：`vibe5/institute`、`member`、`task`、`message`、`delivered`、`meeting`、`debate`、`verdict`、`queue`、`solve`、`progress`、`formal` | 207–220（范围外） |
| 唯一 fold `applyV5Event` | 所有事件经**同一个纯函数**折叠成内存状态；非 `vibe5/` 前缀直接返回；异常**绝不抛出**（写 diagnostics，保留 `v`/`institutes`，最多留 50 条） | 589–900（范围外） |
| 投影版本 `PROJECTION_VERSION = 1` | 状态文件版本号 | 206（范围外） |
| institute 级耐久键**白名单**（fold 里逐项 `if (patch.X !== undefined)`） | `project`、`institute`、`phase`、`problem{id,statement}`、`params`、`runId`、`lastProgressAt`、`artifactCount`、`meetingOpen`、`officeRequestsDropped`、`paper`、`feedback`、`chair`、`stallNotice`、`grants`、`ballots`、`chatSupplements`、`formalProofs`、`secretaries`、`resolutions`、`minutesConfirmations`、`motions`。**凡不在此列表的 `patchInstitute` 键会被静默丢弃**（注释里 S4–S18 反复以此为据） | 597–692（范围外） |
| 函数式变更（fold 内 mutation） | `paper`/`feedback`/`grants`/`ballots`/`chatSupplements`/`formalProofs`/`secretaries`/`resolutions`/`minutesConfirmations`/`motions`/`queue`/`formal.record`/`formal.todo` 都接受**函数**，在 fold 内应用 ⇒ 同 tick 两个写入不互相覆盖 | 616–690、831–870（范围外） |
| `emptyInstitute` 的耐久字段 | `key/project/institute/createdAt/phase/problem/params/members/tasks/messages/delivered/meetings/debates/verdicts/formal/todo/queue/solve/counters/runId/lastProgressAt/artifactCount/diagnostics/meetingOpen/officeRequestsDropped/paper/feedback`；`counters` 初值 `{academician,researcher,temp,task,meeting,message,verify}` | 485–527（范围外） |
| 数值上限（LRU） | `DELIVERED_CAP = 500`（送达台账）、会议/辩论索引各 **200** 条上限、办公室请求 `OFFICE_REQUEST_CAP = 10` | 484、809、819、570（范围外） |
| 写入 API | `commit(type,data)`（await 后端 load；写失败**拒绝覆写**并记 note；成功后**回灌 params/phase/autoDone**）、`patchInstitute`、`putMember`、`putTask`、`putMessageMake`、`putSolve`、`ackDelivered`、`putDebate`、`putVerdict`（收口处 `sealRecord` 盖少数意见章）、`markProgress` | 1474–1537（范围外） |
| id 分配器 | `makeIdAllocator(inst)` 在 **fold 内**运行：`academician→'acad'`；其余 `ID_PREFIX = {message:'msg-',task:'t-',meeting:'mt-',researcher:'r-',temp:'t-'}` + 序号；新建对象必须用 `d.make` | 563–588、696–697、716–717、804–805（范围外） |
| **内存态（不持久、重启即重建）** | `busy:Set`、`wakeKind:Map`、`rounds:Map`、`roundsSinceCompact:Map`、`contextPct:Map`、`needReanchor:Set`、`inboxInjected:Map`、`inboxSuppressed:Set`、`seeds:Map`、`lastActiveAt:Map`、`currentMember`、`finalizeLock`、`verifiedRecently:Map`、`liveAgents:Map(childId→WeakRef)`、`inflight:Map(childId→{token,kind})`、`meeting`、`pendingMeeting`、`lastMeetingId`、`digestTimer`、`heartbeatDisposer`、`lastProgressAt`、`dbg` | 1185–1230（范围外） |
| 参数体系 | `DEFAULT_PARAMS`（1062–1183）；`normalizeParams`（9762+，含 ints/bools/strs/arrs 白名单，新增 int 必须插在末两项**之前**否则自探针失效）；`clamp01` 11508、`clPct` 11510、`posMs` 11512（**非正数一律回落默认**）、`idSafe` 11518、`coerceBool` 11531 | 范围外 |
| 回复解析 | `parseReply`：优先最后一个 ```json 围栏，其次整段 JSON，最后最外层 `{...}`；失败返回 `{}` | 11556–11578（范围外） |
| 派生集合 | `activeMembers() = members.filter(phase==='active')`；`voters() = activeMembers().filter(kind ∈ {academician,researcher})`；`memberById(id)` | 2899–2902（范围外） |
| 容错时间常量 | `recoverStallMs() = posMs(activityTimeoutMs,120000) * 2` ⇒ 默认 **240 000 ms**（既是"死锁放弃"阈值，也是"刚刚定论"去重窗口） | 4249（范围内） |

**参数默认值速查（本分片相关）**：`researcherCount=3`、`quorumCap=3`、`quorumMode='m-unanimous'`、`reconsiderFloor=0`、`verdictMaxRounds=3`、`compactThreshold=66`、`compactAfterRounds=8`、`maxParallel=3`、`activityTimeoutMs=120000`、`chatDigestMs=45000`、`meetingKeepEvery=5`、`formalVerify='off'`、`leanCommand='lean'`、`leanArgs=[]`、`leanTimeoutMs=120000`、`leanAsync=true`、`leanInitiative='normal'`、`leanSearchPaths=[]`、`leanJobsMaxParallel=1`、`resourceSelfCheck=false`、`toolCallsPerTurnCap=0`、`memoryCeilingMb=0`、`maxLiveChildren=0`、`pointerPropagation=true`、`feedback='on'`、`mathComputation='auto'`、`mathMode='typed+shell'`、`mathTimeoutMs=60000`、`mathPackages=[]`、`mathInstallScope='user'`（1062–1183；math 六项默认来自共享模块 `MATH_PARAM_DEFAULTS`，1147–1152）。
**模块级常量**：`LEAN_SEARCH_PATH_FLAG = '-R'`、`LEAN_READ_MAX_BYTES = 64*1024`、`LEAN_QUEUE_CONCURRENCY = 1`（**定义于 255，但实测无读取点 —— 见 §7 未决问题 U1**）260–261。

---

## 1. 机制逐条清单

格式：**名称** / 触发入口 / 具体逻辑（状态机·算法·边界·钳制·拒绝码·时序）/ 数据结构字段 / 可调参数（键·默认·上下界）/ 持久化与恢复 / 宿主接触面 / `file:line`。

### 1.1 `[SPAWN]` 成员诞生五步 `spawnMember(member, initialTask, mode)`

- **入口**：内部函数；被 `start`/`hire`/`addResearcher`/`resume` 路径调用（`mode='founding'` 新成员，`'resume'` 重建子会话）。3732–3746（顺序注释）／3747。
- **逻辑（顺序承载语义，注释明说「ORDER IS LOAD-BEARING」）**：
  1. **三道资源硬门（先于任何宿主调用）**：① 已知宿主子代理上限 `hostChildLimit` 且 `liveChildCount() >= 该值` ⇒ `noteSpawnLimitOnce` + `throw v5err('ACTIVATION_LIMIT_REACHED', activationLimitText(hostChildLimit))`（3752–3755）；② **本所自设** `maxLiveChildren()>0` 且在活数已达 ⇒ `throw v5err('V5_RESOURCE_BUDGET', …)`（3758–3763，S25-E）；③ **真实内存** `memoryCeilingMb()>0 && rssMb() >= 该值` ⇒ 同上 `V5_RESOURCE_BUDGET`（3766–3771，S25-D）。三种都只**每轮一行**提示（`noteSpawnLimitOnce`），且错误里点名参数名 + 当前读数 + 用 `vibe_v5_resume` 续。
  2. 解析 `provider = member.provider || pickProvider()`、`ao = memberAgentOptions()`、`tf = memberToolFilter(member)`；`kind = mode==='resume' ? 'resume' : 'initial'`（3772–3775）。
  3. **先把成员 commit 成 `phase:'active'`、`childId:''`**（3776–3778）—— 这一步先于派生（`activeMembers()`、`[状态]`/`[在册]` 块、法定数 m、票数、章程花名册），修的正是"每个 brief 都在描述错的人"的 bug。随后 `busy.add`、`wakeKind.set`、`currentMember`、`lastActiveAt.set`（3779–3782）。
  4. **计数器先算后用**：`startRound = rounds+1`、`startRoundsSinceCompact = rsc+1`（3786–3787），**只在 `startContinuable` 成功后**才 `rounds.set`/`roundsSinceCompact.set`（3836–3837），失败路径**不碰**（旧的 `rounds.delete` 会把 resume 的编号抹掉，3816–3818）。
  5. `persona = member.persona || memberPersona(member)`（**章程在入职时冻结**，resume 不重建，3788–3793）；`prompt = initialPrompt(member, initialTask, mode, startRound)`；`putMember`；`mkdirs()`；`writeRosterMirror()`（3794–3797）。
  6. 启动：`startWithToolFilter(tf, spec)`，spec 含 `provider`、`label='vibe5 <id> (<kindLabel>)'`、`request:{prompt:[textBlock(prompt)], parent:rootAgent, persona, agentOptions?, toolFilter?}`、`signal: makeSignal(params.activityTimeoutMs)`（3799–3811）。
  7. **失败回滚**：`busy.delete`/`wakeKind.delete`；`isActivationLimitReached(e)` ⇒ `noteChildLimit(e)` + `noteSpawnLimitOnce(member)`；成员记为 `phase:'failed'`、`error`、`failReason:'activation-limit'|'other'`；命中上限抛 **typed** `ACTIVATION_LIMIT_REACHED`（不再回放宿主原文）（3812–3831）。
  8. **成功后**：`member.childId = started.childId`、`childOwner.set(childId, sessionId)`、两侧计数器落定、**注册"入职这一轮"为在飞** `inflight.set(childId,{token:shortId(),kind})`（否则首次 `subagent/end` 无 token 可匹配，入职轮永不处理、会被心跳当普通轮重唤醒）（3832–3842）。
  9. **回合开始即落"待续"耐久标记** `member.pendingWork = {childId, objective:'入职/继续首轮（kind=…）', interruptedAt, reason:'host-ended'}`；`turnToolCalls.set(id,0)`（工具预算从 0 起算）⇒ `putMember`（3843–3849）。
- **字段**：`member{id,kind,provider,persona,phase,childId,pendingWork,direction,hiredBy,dismissedAt,dismissReason,failReason,error,activeMeetingId…}`。
- **参数**：`activityTimeoutMs`(120000，作用于启动信号)、`maxLiveChildren`(0=不设，spawn 前硬拒)、`memoryCeilingMb`(0=不设)、宿主 `hostChildLimit`（宿主侧上限，运行时探测）。
- **持久化/恢复**：成员记录、`pendingWork` 耐久；`rounds/contextPct/busy` **不持久**。重启后靠 `pendingWork` 判断"它还有活没干完" ⇒ 由所办用 `vibe_v5_resume` 续（3867–3873 注释）。
- **宿主接触面**：`subagents.startContinuable`、`ctx.fs`（putMember）、`mkdirs/writeRosterMirror`、`rssMb()`（宿主 `process` 读数）。
- **file:line**：3732–3851。

### 1.2 `[SPAWN]` 投递一轮 `wakeMember(member, promptText, kind)`

- **入口**：内部；`askVoters`、`continueVerifyRound`、`wakeIfIdle`、会议/心跳调度、`assign` 后 `wakeIfIdle` 等。
- **逻辑**：
  - 前置守卫：`!member || !member.childId || member.phase!=='active'` ⇒ `return false`（3860）。
  - `clearHeartbeat()`；`token=shortId()`；**kind 随这一轮走** `inflight.set(childId,{token,kind:kind||'normal'})`（387–3866 —— 注释：`wakeKind` 是**成员级槽位**，后一次唤醒会覆盖，回执归因必须靠 in-flight token）。
  - **"待续"耐久标记**：`pendingWork={childId,objective:promptText.slice(0,300),interruptedAt,reason:'host-ended'}`（回合开始即落盘 ⇒ 主代理被杀、子代理 end 不回也能看到"还有活没干完"）（3870–3873）；`turnToolCalls` 归零；`busy.add`；`wakeKind.set`；`currentMember`；`lastActiveAt`。
  - 计数器 `nextRound`/`nextRoundsSinceCompact` 先算，**发送成功后**才落（3 879–3883、3920–3924）。
  - **两类 context 指令严格区分**（v4 §24.1-③ 的修复）：(a) **软压缩指令**只在 `wake ∈ {'normal','checkpoint'}` 且（`contextPct >= compactThreshold` 或 `nextRoundsSinceCompact >= compactAfterRounds`）时注入；注入文本 = `coreRules()` + `[CONTEXT COMPACT …]`，要求回执填 `contextPct:15` 与 `compacted:true`；置 `softInjected=true`（3894–3912）。(b) `needReanchor.has(id)` ⇒ 前置 `coreRules()` 一次并**清除**标记（3913–3916）。
  - 发送：**必须** `subagents.sendMessage(rootAgent, member.childId, [textBlock(prompt)], {signal})`；服务缺此方法直接抛 `no subagents.sendMessage continuation API`（3918–3919；注释：v4 用不存在的 `followup` 导致全组静默停摆）。
  - **成功**：`rounds.set(nextRound)`；`roundsSinceCompact.set(softInjected ? 0 : nextRoundsSinceCompact)`（软压缩指令**真的送达**才清触发器）（3923–3924）。
  - **失败**：`console.error`；`inflight.delete(childId)`、`busy.delete(id)`；`return false`（不消耗轮次、不清触发器）（3926–3931）。
- **参数**：`compactThreshold`(66)、`compactAfterRounds`(8)、`activityTimeoutMs`。
- **持久化/恢复**：`pendingWork` 耐久；`rounds/roundsSinceCompact/contextPct` 内存；`postmark`（§1.16）在回执侧统一记账。
- **宿主接触面**：`subagents.sendMessage`。
- **file:line**：3859–3932。

### 1.3 `[OTHER]` 调用者身份推导（三函数）

- `memberIdOfAgent(agent)`：有 session id ⇒ `byChild(id)` 命中返回成员 id；**是 session 根** ⇒ `'office'`；否则 `''`；**完全没有 session id** 才允许回落到 `currentMember`（且要求该成员仍存在）（3939–3955）。注释记录 v4 缺陷：所办调 `assign` 被误判为研究员 ⇒ `V5_NOT_ACADEMICIAN`，且分派/督办签错名。
- `isProvablyOffice(agent)`：仅当该 agent **就是** session 根（`rootOf(agent)===agent` 且有 session id）（3961–3963）。
- `officeCaller(agent)`：成员 id / `'office'` / `''`；**office-only 工具必须在 `''` 上具名拒（`V5_MEMBER_NOT_FOUND`）**，不得冒充所办（3967–3971）。
- `isOffice(id) = (id === 'office')`（**空串不是所办**，第二道防线，5837）。
- **file:line**：3933–3971、5837。

### 1.4 `[PROMPT/PERSONA]` 回执字段目录 `replySpec(kind)`

- **入口**：所有轮次提示词的尾部（`initialPrompt`/`normalPrompt`/`checkpointPrompt`/`meetingPrompt`）；`verifyPrompt` 用**自己的**收尾契约（4232–4238）。
- **逻辑**：先声明"只输出一个 JSON 对象（```json 围栏内）"，再**显式说明**下面的字段目录是"目录"而非合法 JSON（F2 修复），末尾给**最小合法样例** `{"say":"…","progress":"…","solved":false,"contextPct":40}`（3978–4046）。
- **字段清单（按 kind 分支）**：`say`（字符串=群聊；`{to,text}`；`to:'voters'`=只对表决者）／`progress`（追加 `Progress/progress.md`）／`record:[{kind:'proposition|method|subproblem',id,title,statement,content,value,motive,p}]`；
  - `kind !== 'temp'` 追加 `propose_verify{target,kind,reason}`、`verdict{target,verdict,reason}`（**只有 1 或 0 算表决**，中间=弃权/存疑）（3992–3995）；`temp` 分支明确"**你可以提议，但没有表决权**，`verdict` 填了也会记为无表决权"（3996–3999）。
  - 所有人：`propose_meeting{agenda,kind,target}`（4000）、`task_create{subject,description,blocked_by,write_scopes}`（4007）、`task_claim`（4008）、`task_done`（4009）、`task_update{task_id,expected_revision,action}`（4010）、`input`（会议发言正文）（4011）、`reject_assign{task_id,why}`（4018–4019）、`vote_solved`（**一致同意才结题**，4031–4033）、`meeting_hand`（4034；**已发言者可再举手**，false 撤回）、`meeting_invite{member,why}`（4035，只记纪要**不计票**）、`solved`（4036）、`contextPct`（4037）、`compacted`（4038）。
  - `kind === 'academician'` 追加 `convene_meeting`（**无需附议**）、`assign{subject,description,to,why,acceptance,priority}`（**必须写 why 与 acceptance**）、`prioritize{order,why}`、`nudge{to,why,next_step}`（4001–4006）。
  - `formalOn()` 时追加 `formal{target,decision:'used|blocked|defect',file,note}`，并按 `formalMode()` 写"强制/鼓励"语义（4012–4017）。
- **参数**：`formalVerify`（决定是否出现 `formal` 字段与措辞）。
- **file:line**：3978–4047。

### 1.5 `[PROMPT/PERSONA]` 五个提示词构造器

| 构造器 | 结构（自上而下） | 关键点 | file:line |
|---|---|---|---|
| `initialPrompt(member, initialTask, mode, roundNo)` | 标题（入职首轮／会话重建）→ 首轮独白要求／"先读回你自己的 Progress/ 与成果库，不要从头再来" → 初始任务/恢复说明 → `member.direction`（仅非 resume）→ `resourceBlock` → `mathPushLine` → `paperPushLine` → `feedbackPushLine` → `------------` → `pointerContractBlock` → `stateBlock` → `------------` → `replySpec(kind)` | resume 与 founding 的**文案与语义不同**（resume 不得说"刚加入"、不展示入职简介） | 4054–4083 |
| `normalPrompt(member)` | 第 N 轮标题 → 推进研究指令 → 若 `kind==='academician' && params.academicianLeads` 追加统筹指令（overview/assign/nudge）→ 若 `leanDailyOn()` 追加 `formalWorkLine()` → 资源/数学/论文/反馈 → 指针契约 → 状态块 → `replySpec` | 轮次号取 `rounds.get(id)` | 4084–4107 |
| `checkpointPrompt(member)` | 心跳标题 → "所内一段时间没有新进展，请**继续推进**而不是停在原地" → 可选 `formalWorkLine()` → 同尾块 | 心跳轮**也**注入数学/论文/反馈行 | 4108–4127 |
| `meetingPrompt(member, mn, opts)` | 会议头（id/议程/类型）→ 受邀临时工声明（**不计票、不阻塞**）→ 其他成员已发表意见列表（`mn.inputs`）或"你是第一位发言者 + 发言模型说明" → 发言/举手/沉默语义 → `proofStatusBlock()` → 资源/数学/论文/反馈 → 指针契约 → 状态块 → `replySpec` | 发言模型逐字写实：**轮流发言（不强制）→ 举手发言（可多轮）→ 无人举手即收束；沉默不触发任何截止**；并声明"框架每轮最多同时唤醒 `maxParallel`（默认 3）" | 4128–4176 |
| `verifyPrompt(member, vs)` | 求真表决头（对象+类型）→ 陈述（>800 字**可见截断**并指向源卡片）→ `proofStatusBlock()` → verdict 五态说明 → **计票规则**（只有投票通道产生票；表决期内发言不改票；**沉默不是同意也不是反对**，未表态阻塞结题）→ `formalOn()` 时 `formalPromptBlock(target)` + 阻塞/未通过时的定向说明（"若你跑通形式化，后续审查对象从'推导是否正确'变成'Lean 代码是否忠实于命题'"）→ `stage==='debate'` 时公开上一轮各人 `history`（verdict=prob｜reason）→ 反从众声明 → 数学/论文/反馈 → 指针契约 → 状态块 → **独立收尾契约** `{"verdict":{...},"contextPct":40}`（+ formal 字段） | 陈述截断**必须可见**（task-24）；`'abstain'`/`'unable'` 的字面量用 `String.fromCharCode(39)` 拼引号避免转义问题 | 4177–4241 |

- `stateBlock(member, roundNo)` 只是 `briefBlock` 的别名（**刻意没有"最后一个碰过的成员"回落**，4051–4053）。
- **file:line**：4051–4053、4054–4242。

### 1.6 `[PROMPT/PERSONA]` 每轮状态块 `briefBlock(member, roundNo)`

- **逻辑/字段（逐行）**：身份无效直接 `throw v5err('V5_INTERNAL', …)`（状态块**绝不**为未知身份构造）(3377–3379)；
  `[状态] 你是 <id>（职位）｜轮次 <n>｜法定票数 m=<quorumM() 或 '未启动'>｜有表决权者 <voterCount()> 人`（3382–3383）；
  `[在册]` 全部 active 成员 id（3384）；`[未就位]` 非 active 且非 dismissed 者（**静默省略会让 provisioning 失败隐形**，3385–3388）；
  `[形式化]`（仅 `formalOn()`）模式 + 已通过数 + 已阻塞数 + 待办数（3391–3397）；
  **`takeLeanNoticesFor(member.id)` 的一次性公告行**（3398–3400，§1.11）；
  `[任务板]` 进行中/可认领/我负责 计数（3401–3407）+ 我的任务明细（含验收与分派者，3408–3414）；
  `[新到的消息/通知]`（`inboxSuppressed` 时不重复注入，3415–3419）。
- **宿主接触面**：无（纯读耐久状态 + 内存表）。
- **file:line**：3376–3421（范围外）。

### 1.7 `[SCHED]` 心跳 / 看门狗时序

- `heartbeatDisposer`、`digestTimer`（1220、1227）、`clearHeartbeat()`：两个 disposer 都清（4250–4253）。
- `armHeartbeat(ms)`：`!running || autoDone` 直接返回；已存在 disposer 先清；`delay = posMs(ms, posMs(params.activityTimeoutMs,120000))`；定时回调里**先** `runLeanQueue()`（独立于调度，必须跑）**再** `scheduleNext()`（4257–4268）。
- `armDigest()`：去重（已有 timer 或未运行则不装）；`posMs(params.chatDigestMs,45000)` 后仅调 `scheduleNext()`（"话多的所不该每条消息都唤醒所有人"）（4270–4276）。
- `recoverStallMs() = 2 × activityTimeoutMs`（默认 240 000ms）：会议/验证的"死锁放弃"阈值**同时**被当作"刚刚定论"去重窗口（4244–4249、6688、6755、6952）。
- **持久化/恢复**：定时器**不持久**；重启后由 `scheduleNext`/`armHeartbeat` 重建。
- **file:line**：4244–4276。

### 1.8 `[TASK]` 任务板 CAS DAG（分派 / 依赖 / compare-and-set / 阶段机）

**8.1 原语（4279–4306）**
- `taskReady(task)`：`status==='pending'` 且所有 `blockedBy` 都存在且 `status==='completed'`（找不到的 blocker 视为未完成）（4279–4287）。
- `writeScopeWarnings(task)`：与所有 `status==='in_progress'` 的其它任务做 `scopesOverlap(a,b)`（**前缀重叠**判定，471–476），返回去重后的可读告警串（4288–4299）。
- `taskView(task)`：浅拷贝 + `ready` + `ownerName = ownerId` + `writeScopeWarnings`（4300–4306）。

**8.2 依赖校验 `validateDeps(candidateId, blockedBy)`（6069–6098）**
- 自依赖 ⇒ `V5_TASK_DEPENDENCY_CYCLE`；重复 blocker ⇒ `V5_INVALID_ARGUMENT`；bloker 不存在或已删除 ⇒ `V5_TASK_NOT_FOUND`；随后在**整个候选图**上做 DFS 三色环检测（`graph` 含候选自身、忽略 `deleted`），命中 ⇒ `V5_TASK_DEPENDENCY_CYCLE`。

**8.3 建档 `taskCreate(memberId, o)`（6099–6143）**
- **时间键一律拒**：任何键名匹配 `/(At|Ms)$/i`（含 `due_at`）⇒ `V5_INVALID_ARGUMENT`（期限只收相对表达 `due_in`，如 `next-meeting`）（6101–6103，S15/K4）。
- `subject` 必填且 ≤200；`description` ≤16384；`write_scopes` 逐个 `normalizeScope`（拒空/绝对/盘符/`.`/`..` 段，464–470），非法 ⇒ `V5_INVALID_WRITE_SCOPE`，去重（6104–6114）。
- `priority` 非有限数 ⇒ 0。
- **id 与 counters 在 fold 内分配**：`commit(EV.task, { make:(alloc)=>{ task.id = alloc.next('task'); validateDeps(task.id, blockedBy)（失败返回 null ⇒ fold 不写任何东西）; return task } })`（6128–6138）。校验错误在 fold 里 catch 住、fold 外重抛（6132–6138）。
- 成功后 `writeTaskboardMirror()`、`markProgress()`、`notifyActivity()`（6139–6141）。
- **持久字段**：`{id, revision:1, subject, description, status:'pending', ownerId:'', blockedBy[], writeScopes[], priority, createdBy:'office'|memberId, assignedBy:'', why:'', acceptance:'', origin, due_in, state:'open', createdAt, updatedAt}`（6116–6127）；`reassign` 可另写入 `resolution_id`（6283）。

**8.4 读面（6144–6157）**
- `listTasks(filter)`：过滤 `status`、`owner`（`'unowned'` ⇒ 无 owner）、`ready===true`；排序 `priority` 降序，其次 `createdAt` 升序；返回全部 `taskView`（**含 writeScopeWarnings**）(6144–6152)。
- `getTask(id)`：不存在抛 `V5_TASK_NOT_FOUND`（6153–6157）。

**8.5 CAS 状态机 `taskUpdate(memberId, o, meta)`（6161–6292）**
- 守卫链：空 `memberId` ⇒ `memberDiagnosis`（**防止空串被当成"每个无主任务的 owner"**，6162–6165）；任务不存在/已删除 ⇒ `V5_TASK_NOT_FOUND`/`V5_TASK_DELETED`；`expected_revision` 非有限 ⇒ `V5_INVALID_ARGUMENT`；`expected !== task.revision` ⇒ **`V5_TASK_STALE_REVISION`**（消息为中文并提示先 `vibe_v5_task_get`，6171–6178）。
- 权限：`lead = (meta.authorized===true) || canDo(memberId,'board').ok || canDo(memberId,'assign').ok`；`owner = task.ownerId === memberId`；`requireOwnerOrLead()` 否则 `V5_TASK_UNAUTHORIZED`（6184–6188）。
- **动作表**（每步失败都返回 `{ok:false, code, message}`，`e.code||'V5_INVALID_ARGUMENT'`）：
  | action | 前置 | 迁移 | 备注 | file:line |
  |---|---|---|---|---|
  | `claim` | owner 为空或就是自己；`status==='pending'`；`taskReady` | → `in_progress`，`ownerId = office ? (原owner||'') : memberId` | 失败码 `V5_TASK_ALREADY_CLAIMED`/`V5_TASK_INVALID_TRANSITION`/`V5_TASK_BLOCKED` | 6191–6196 |
  | `release` | owner/lead；`in_progress` | → `pending`，`ownerId=''` | | 6197–6200 |
  | `edit` | owner/lead；至少给 `subject`/`description`/`write_scopes` 之一 | 字段截断 200/16384、scopes 归一 | 无字段 ⇒ `V5_INVALID_ARGUMENT` | 6201–6216 |
  | `set_dependencies` | owner/lead；`blocked_by` 必须给出（可为 `[]`） | `validateDeps` 后替换 | | 6217–6223 |
  | `complete` | owner/lead；`in_progress` | `status='completed'` **且 `state='done'`** | S15：**显式状态机，绝不自动关闭** | 6224–6229 |
  | `handover` | **仅 lead**；非 deleted | `state='handover'`；若给 `owner`（须 active 成员）⇒ `ownerId=target,status='in_progress',state='open'`；不给 ⇒ `ownerId='',status='pending'` | G3：责任人缺席 ⇒ **待接手，不自动关闭、不静默丢弃**；非 active ⇒ `V5_MEMBER_NOT_FOUND` | 6230–6246 |
  | `reopen` | owner/lead；`completed` | → `pending`，`ownerId=''`，`state='open'` | | 6247–6251 |
  | `reassign` | **仅 lead**；`pending`/`in_progress` | 有 `owner`（须 active + `taskReady`）⇒ `in_progress`+owner；无 ⇒ `pending`+ownerId '' | 失败码含 `V5_TASK_BLOCKED` | 6252–6262 |
  | `delete` | owner/lead；**有依赖者则拒** | `status='deleted'` | 依赖者列表进消息；`V5_TASK_HAS_DEPENDENTS` | 6263–6267 |
  | 其它 | — | — | `V5_INVALID_ARGUMENT: unknown action` | 6268–6270 |
- **G4（单一 CAS 写）**：分派元数据**在同一次 CAS 写里**落（仅 `action==='reassign'` 时可携带 `meta.assignedBy/why/acceptance/resolution_id`），旧的"写第二次 putTask"会吞掉并发 `task_update` 且不升 revision（6274–6284）。随后 `next.revision = task.revision + 1`、`updatedAt`、`putTask`、镜像、markProgress、notifyActivity（6285–6291）。
- `listTasks` 的过滤/排序 + `writeTaskboardMirror` 只写**人读镜像** `Shared/TaskBoard.md`（权威在 `State/<所>.v5state.json`）（6405–6418）。

**8.6 分派 `taskAssign(memberId, o)`（6297–6373）**
- 权限 `gateDo(memberId,'assign', 'only the academician (or the office) can assign tasks')`（6299–6300）；时间键拒（6302–6304）。
- `from_resolution`（`resolution_id`）必须指向既存 `res-<n>` 且**未被取代**（`supersededBy` 非空 ⇒ 拒"已被取代的决议不得派活"）（6305–6313，S20/B-3(甲)）。
- `to` 必须是 active 成员；`why` 必填；`acceptance` 必填（6315–6321）。
- 无 `task_id` 时：若给了 `origin`，按 `origin + subject` 查重——**同 origin+subject+同 owner 且已在执行 ⇒ 幂等返回 `{deduped:true}`（不重复建、不重复派）**；否则复用该任务 id；仍无则 `taskCreate`（优先 `priority/write_scopes/origin/due_in`）（6324–6350）。
- 有 blocker 且未 ready ⇒ `V5_TASK_BLOCKED`（6352–6354）。
- 落到 `taskUpdate(..., action:'reassign', owner:to, meta:{assignedBy, why, acceptance, authorized:true, resolution_id})` —— **`authorized` 是内部位置参数**，不在工具 args 面上（6355–6360）。
- 分派后：`say(to, kind:'assign', …'默认应当执行；若认为方向有误请说明理由（会被广播）'…)` + `wakeIfIdle(target)`（6365–6372）。

**8.7 优先级 `taskPrioritize`（6374–6394）**：`gateDo('prioritize')`；`order` 非空数组；逐项 upsert `priority` 且 `revision+1`；写镜像 + 通知。

**8.8 除名回收 `releaseTasksOf(memberId, reason)`（6397–6404）**：把该成员名下所有 `in_progress` 任务释放为 `pending`+`ownerId=''`+`revision+1`+`releaseReason`（**DSH 原版明确不自动释放 owner，这是 v5 补的缺口**）；有则写镜像、返回 id 列表。

**8.9 编制表镜像 `writeRosterMirror()`（6422–6449）**：写 `Institutes.md`；含求真门槛行（`m = quorumM()` 或"未启动"）、`phaseFactLine()`、在册表格（代号/职位/状态/雇主/方向/轮次/上下文%），dismissed 单列"已除名（代号永不复用）"。**只写不读**。

- **触发入口（工具面）**：`vibe_v5_task_create`（`subject` 必填）、`vibe_v5_task_list`（`status/owner/ready`）、`vibe_v5_task_get`（`task_id`）、`vibe_v5_task_update`（`task_id/expected_revision/action/…` 必填前三）、`vibe_v5_assign`、`vibe_v5_task_prioritize`（注册见 11176–11179、11056 段）。
- **持久化/恢复**：任务在 `EV.task` fold 里 upsert（714–732），**全程耐久**；`revision` 是 CAS 令牌；`writeTaskboardMirror` 只是快照。恢复后 `listTasks` 直接可用。
- **宿主接触面**：`ctx.fs`（镜像）、`commit`；分派会 `sendMessage`（wakeIfIdle）。
- **file:line**：4278–4306、6062–6449。

### 1.9 `[FEEDBACK]` 经验反馈库（Shared/Feedback/）

- **入口**：`vibe_v5_feedback {op: add|update|list|summary, …}`（注册 11154）。
- **常量**：类别 `['cooperation','management','process','obstacle','conflict']`（74–76）；路由 `['self','team','interpersonal']`（84）；状态 `['open','adjusted','closed','dropped']`，未闭环=`['open','adjusted']`；目录 `Shared/Feedback`；关闭消息常量（74–92）。
- **`feedbackOn()`**：`String(params.feedback || 'on') !== 'off'`（5247）；参数 `feedback ∈ {'on','off'}`（11071）。
- **逻辑**：
  - `add`：`off` 时**具名拒** `V5_FEEDBACK_DISABLED` + 复原指引（**绝不静默写入**，5301–5304）；`category` 非白名单 ⇒ `V5_FEEDBACK_BAD_CATEGORY`；`route` 非白名单 ⇒ `V5_FEEDBACK_BAD_ROUTE`；`phenomenon/impact/action` 任一为空 ⇒ `V5_FEEDBACK_INCOMPLETE`；**仅 `interpersonal`** 要求 `assessment` 非空，否则 `V5_FEEDBACK_NEEDS_ASSESSMENT`（**self/team 是自我调节，无审批步骤**）（5305–5329）。
  - 条目在 fold 内 push：`patchInstitute({ feedback: (cur)=>{ entry = {id:'fb-'+(list.length+1), …}; list.push(entry); return list } })`（5330–5339）；随后写人读镜像并返回 `{entry, mirror, counts, routeHint}`（5340–5344）。
  - `update`：`id` 必填（`V5_FEEDBACK_NO_ID`）、存在性（`V5_FEEDBACK_NOT_FOUND`）、**权限 = 发起人或所办**（否则 `V5_FEEDBACK_FORBIDDEN`）；`status` 白名单（`V5_FEEDBACK_BAD_STATUS`）；**interpersonal + `status='closed'` 必须回填 `outcome`**（`V5_FEEDBACK_NEEDS_OUTCOME`）；`status='dropped'` 必须有 `outcome` 或 `note`（`V5_FEEDBACK_NEEDS_REASON`）；写入 `updatedAt/updatedBy` 及可选字段（5346–5383）。
  - `list`：按 `category`/`route` 过滤，默认**只列未闭环**，`all:true` 列全部（5385–5395）。
  - `summary`：只回计数（5396）。
  - 未知 op ⇒ `V5_FEEDBACK_BAD_OP`（5397–5398）。
- **`feedbackCounts()`**：`{total, open, closed, byCategory, byRoute}`（5249–5261）；`feedbackView(e)` 固定字段投影（5262–5267）。
- **镜像 `feedbackMirror()`**：每个类别一个 `Shared/Feedback/<category>.md`（人读，含"这是方法论／协作层，不是研究结论"声明）+ `Shared/Feedback/index.json`（`{counts, entries}`）；失败**只报 `mirror:false`**，不抛不记（5268–5297）。
- **提示词行 `feedbackPushLine`**：`off` 时零注入；否则一段"为什么记/记什么/三条路由/记了之后"的短说明（5403–5411）。
- **持久化/恢复**：条目在 **耐久 `inst().feedback` 数组**（emptyInstitute 525），fold 白名单 625–630；镜像**只写**。
- **宿主接触面**：`ctx.fs`（镜像）、`commit`。
- **file:line**：74–92、5243–5411（+11071、11154）。

### 1.10 `[COMPACT]` 上下文核算 `coreRules` / `postmark`

- `coreRules()` 是**函数而非冻结串**（成员可见库路径必须反映**当下**项目/研究所，DEFECT A）：`[核心规则]` 一句话说明"只有 Verified/ 算已确立；进 Verified/ 必须 ≥m 名有表决权者投出**恰好 1/恰好 0** 且**没有任何反向票**，否则留库附平均概率；你只写自己的库；组织与分派由院士负责但判断属于你自己；退出时只输出一个 JSON 对象"（5809–5812）。
- `postmark(member, parsed)` 是**唯一**上下文记账点，**所有回执类型**（normal/meeting/verify/checkpoint）都走：`contextPct` 经 `clPct` 钳到 0–100；`compacted===true` ⇒ `roundsSinceCompact=0`、`contextPct=15`、`seeds = (progress||summary).slice(0,4000)`；最后 `needReanchor.delete(id)`（5814–5827）。
- 相关参数：`compactThreshold=66`、`compactAfterRounds=8`；真压缩路径 `maybeRealCompact`（9728–9749，优先 `compactNow`，回退 `compactIfNeeded`，成功则 `roundsSinceCompact=0` + `needReanchor.add`）。
- **file:line**：5802–5827（+9728–9749）。

### 1.11 `[LIBRARY]` 成员成果库（四轨 Progress + 三类卡片 + 头部列表契约）

- **`bumpArtifacts()`（5844–5856）**：`artifactCount+1` 经 `commit(EV.progress)`；**必须 await**（否则同一回执里两张卡读到同一计数、`meetingKeepEvery` 同步会触发两次，5840–5843、M6）；当 `n % meetingKeepEvery === 0` 且 `!meeting && !pendingMeeting && !hasVerifyInFlight()` ⇒ `startMeeting('office',{agenda:'定期同步：分工 / 进展 / 是否需要验证', kind:'sync'})`（框架**只召集，不派活**，5852–5854）。
- **`publishProgress(memberId, text, track)`（5862–5881）**：空文本 ⇒ `V5_INVALID_ARGUMENT`；`PROGRESS_TRACKS = {route:'routes', obstacle:'obstacles', rejected:'rejected', state:'state'}`；缺省（`narrative`）逐字追加 `Members/<id>/Progress/progress.md`，给 track ⇒ 落 `Progress/<routes|obstacles|rejected|state>.md`，并在 progress.md 里**首次**补一行索引 `- 分轨：routes/obstacles/rejected/state`；写入格式 `\n### <时间>｜<成员>\n<text>\n`；失败 ⇒ `V5_WRITE_FAILED`；成功 `markProgress()`。
- **`recordCard(memberId, kind, o)`（5885–5931）**：
  - **三必填**：`value`（价值程度）、`motive`、`p`；缺失**具名列出**并拒 `V5_INVALID_ARGUMENT`（**绝不静默默认**，5888–5892）。
  - id：`idSafe(args.id) || prefix + '-' + shortId()`，`prefix = p|m|s`；目录 `Propos|Methods|Subproblems`；缺省状态 `未定论|经验|求解中`。
  - body 模板：命题 = `## 陈述 / ## 证明尝试 / ## 证伪尝试`；方法 = `## 核心内容 / ## 定义与记号 / ## 应用记录 / ## 改进历史`；子问题 = `## 陈述 / ## 进度`。
  - **内容指纹** `contentFingerprint(kind, body)`（模块级 362–365）：`sha256(kind + '\n' + parts.map(leanHashText).join('\n---\n'))`——**只覆盖陈述原文与证明正文，不含标题/ID/时间**（重贴标签不算内容变更；S21/D1）。
  - 卡片头字段（写盘）：`# <类型>｜<标题>`、`- 标题`、`- ID`、`- 类型`、`- 状态`、`- 概率: clamp01(p).toFixed(2)`、`- 价值程度: clamp01(value).toFixed(2)`、`- 动机用途计划`、`- 记录者`、`- 记录时间`、`- 依赖: []`、**`- 内容指纹: <sha>`**；随后 `bumpArtifacts()`、`notifyActivity()`；返回 `{id,file,kind,fingerprint,status,title,owner}`。
- **`readLibrary(query)`（5932–6060）**：
  - **两种模式**：`list:true` ⇒ 头部列表（**只有** `id/kind/title/fingerprint/status/owner/updatedAt`，**绝无正文**；`updatedAt` 优先文件 `stat.mtimeMs`、回退卡片 `- 记录时间:`、`0`=未知；支持 `limit`；**在此 return，不落体**——落到展开分支会让每个条目带上整篇正文，R100 门禁正是抓这个）（5947–6000）。
  - 展开模式：`wantId` 给定时直读 `Members/<m>/<dir>/<id>.md`（命中才收）；不给 id 时枚举全部卡片（正文 **slice(0,4000)**）+ `Progress/progress.md` **尾 6000** + 四条分轨**各尾 2000 并带 `droppedChars`**（截断**必须计数**，6028–6042）。
  - **悬空 id 必须具名拒**：`wantId && out.length===0` ⇒ `{ok:false, code:'V5_INVALID_ARGUMENT', message:'读不到对象 <id>…不得改用记忆/猜测/近似对象', next:{kind:'expand-by-id', tool:'vibe_v5_read_library', …}}`（6044–6058，S21/D5/G3）。
  - 成员集合：给 `member` 用 `memberById`，否则 `activeMembers()`；`kind` 过滤 `proposition|method|subproblem`。
- **指针传播契约 `headerListContractBlock()`（范围外 372–383）**：8 条规则（跨对象只持头部列表；要正文用 id 展开；指纹与头部不一致必须重新拉取；引用他人结论必须带 id；上下文无正文不得凭记忆叙述；论文阶段按 id+指纹重建正文，不一致 ⇒ **具名阻塞并上报**；禁止猜/改写/拼写 id；Lean 归档正文不在头部列表，用 `vibe_v5_lean_lib`/`vibe_v5_lean_read`）。开关 `pointerPropagation`（默认 true）通过 `pointerContractBlock()`（2065–2068）**一处**生效：关 ⇒ 8 个注入点全部零注入。
- **提示词注入点（8 个 builder）**：`initialPrompt`/`normalPrompt`/`checkpointPrompt`/`meetingPrompt`/`verifyPrompt` + 三个会议/验证变体（4078、4102、4122、4171、4229 等），顺序固定在**状态块之前**。
- **宿主接触面**：`ctx.fs`（`resolve/stat/listDir/readText/writeText`）。
- **file:line**：362–383、2065–2068、5829–6060。

### 1.12 `[FORMAL]` Lean 形式化验证 —— 模式、路径与状态机

- **入口**：`formalVerify`（`'off'|'encourage'|'require'`，默认 `off`）+ `leanInitiative`（`'off'|'normal'|'eager'`，默认 `normal`）。`FORMAL_MODES` 4323；`formalMode()` 非法值回落 `'off'`（**笔误绝不能静默升级为强制**，4324）；`formalOn()`（4325）；`leanInitiative()` 4330；**`leanDailyOn() = leanInitiative!=='off' && (formalOn() || leanInitiative==='eager')`** —— 两个轴独立：`formalVerify=off + leanInitiative=eager` 仍注入日线（4331）。
- **路径**：`formalRoot()=instRoot()+'/Formal'`；`formalRootRel()=instRootRel()+'/Formal'`（**对成员文件工具可用的 CWD 相对完整路径**，提示词广告的是这个）；`formalLibRoot()=vibeRoot()+'/Formal/Lib'`；`formalProvedRoot()=vibeRoot()+'/Formal/Proved'`；`verifiedLeanRoot()=instRoot()+'/Verified/Lean'`（4332–4340）。
- **记录**：`formalRecords()=inst().formal||{}`；`formalTodo()=inst().todo||[]`；`formalOf(target)` 返回记录或 `{status:'none'}`（4341–4346）。
- **写 API `putFormal(target, record, todo)`**（4347–4349）：`commit(EV.formal, {target:idSafe(target), record, todo})`；`record`/`todo` **可以是函数**（fold 内应用 ⇒ 并发写不同 target 不丢条目，fold 见 831–853）。
- **门禁谓词 `formalGateOk(rec)`**：`status ∈ {'passed','blocked'}`（**`passed` 必须有绿色运行，光有归档文件不算**，4350–4352）。
- **状态行 `formalStatusLine(target)`**：passed ⇒ `Lean 通过（proof||file）`；blocked ⇒ `阻塞（note||未说明）`；attempted ⇒ `已尝试未通过`；否则 `未尝试`（4353–4359）。
- **`tail(s,n)`** 工具（4360）。
- **状态机（唯一权威 = docs/formal-verification.md §4 表 + 实现）**：
  | 事件 | 迁移 | 实现 |
  |---|---|---|
  | `lean_run` 成功/失败 | `none/attempted → attempted`；**已是 passed/blocked 保持原状**（一次随手运行不得撤销已成立的证明） | `formalSetRun` 4503–4512 |
  | `lean_archive kind='proof'` + 异步作业 `settled(ok)` | `→ passed`，写 `Verified/Lean/<id>.lean`，`proof` 指针，`decision:'used'`，`decisionSource:'job-settle'`，`sha256` 沿用作业 `contentSha256` | `leanApplySettle` 4793–4824 |
  | 同上但未 settled | `→ attempted`，`proof:''`，`note` 追加"文件内容已改变，本次结果不用于判定"等 | 4796–4820 |
  | 同步路径失败重归档 | `→ attempted`，**清空 `proof`**（旧证明指向的代码刚被覆盖） | 5758–5780 |
  | `kind='blocked'`（工具或回执 `decision:'blocked'`） | `→ blocked`（`note` 必填，空则 `V5_INVALID_ARGUMENT`） | `leanArchive` 5786–5797 / `handleReply` 9468–9471 |
  | 回执 `decision:'used'` | `→ attempted`（记录 `file`），**passed/blocked 保持** | `handleReply` 9472–9479 |
  | 回执 `decision:'defect'` | `→ attempted`、`proof:''`、`sha256:''`、撤回归档证明、写 TODO、公告 | `recordFidelityDefect` 4544–4585 |
- **`recordFidelityDefect(memberId, rawTarget, note)`（4544–4585）**：`target`/`note` 必填（缺 ⇒ `V5_INVALID_ARGUMENT`）；**两半都在 fold 内**（record 与 todo 都是函数，MEDIUM 6）；`fidelity` 对象**合并**而非替换（`fidelity` 保留历史 marker，F1/S3）；`sha256:''` 丢掉内容身份（S21/D3）；`removeArchivedProof(proofRel)`（默认 `Verified/Lean/<t>.lean`）后写 `Formal/TODO.md`+`Formal/Index.md`+群聊；撤回失败时**显式告警**"归档证明未能撤回，记录已降级，请勿当证明"（4576–4584）。
- **`removeArchivedProof(rel)`（4520–4541）三条路**：① 优先走**带 policy 的 fs 服务**覆写为撤回声明并**读回校验**含"已撤回"；② 回退平台 shell 真删除（`Remove-Item -LiteralPath` / `rm -f`）并读回确认；③ 再覆写一次兜底。返回 `true` 表示"归档不再读起来像证明"（删除或覆写皆可）——消息里刻意不写"已删除"。
- **L2 强制弃权（跨文件，但属本机制）**：同一回执里声明了某对象的 `defect` ⇒ 框架把**该成员对该对象**的 `verdict` 记为**弃权 0.5**（`defectTargetsThisReply`，9366–9369、9501–9532），并把 `voteAbstainedByFramework[]`+`abstainedCount` 记入 formal 记录的 `fidelity`（**数组**，两人同轮互不覆盖），且**只影响声明者与当轮**（无跨轮状态、其他票不动）。`encourage` 档没有门禁 ⇒ 靠这条弃权保证"本轮无法得出一致布尔结论"（5428–5438）。
- **持久化/恢复**：`formal{target→record}`、`todo[]` 在 `EV.formal` fold（831–853），耐久；`Verified/Lean/<id>.lean`、`Formal/<id>.lean`、`Formal/Index.md`、`Formal/TODO.md` 是文件面；**`off` 档回执里的 `formal` 字段被 `formalOn()` 守卫挡住**（9420–9435：off 是真 no-op，残留/幻觉回执不得创建形式化状态；工具仍可用，因为"工具调用是刻意行为"）。
- **宿主接触面**：`ctx.fs`、`subprocess`（经 `leanRunFile`）、群聊/通知。
- **file:line**：4323–4599、9418–9535（回执侧，范围外）。

### 1.13 `[FORMAL]` 路径守卫与单文件执行 `leanAbsPath` / `leanRunFile`

- **`normalizeAbsPath(p)`（4366–4376）**：纯词法归一（折叠 `.`/`..`/重复斜杠，不碰文件系统）。注释点名：仅 `startsWith(root)` 不够，`…/Projects/../../../../etc/evil.lean` 字符串上仍以 root 开头却能越界。
- **`leanAbsPath(rel)`（4379–4394）**：接受两种拼写——**文档化的 CWD 相对完整路径**（`instRootRel()+'/Formal/…'`，成员自己的文件工具产出的就是这种）与短的 `Formal/x.lean`；先剥离文档前缀，再无前缀则拼 `instRoot()`；归一后必须 **等于 `vibeRoot()` 或在其下**（否则 `null`）；空串 ⇒ `null`。
- **`leanRunFile(relPath, timeoutMs, hooks)`（4401–4491）**：**绝不把异常抛进调度器**，每个失败都变可读结果：
  - `!rel` ⇒ `V5_INVALID_ARGUMENT`；`leanAbsPath===null` ⇒ `V5_INVALID_ARGUMENT`（消息点名必须位于 `<VibeMath 根>/` 下）；非 `.lean` ⇒ `V5_INVALID_ARGUMENT`；文件读不到 ⇒ `V5_NOT_FOUND`；`subprocessOf()` 无 `spawn` ⇒ `NO_SUBPROCESS`（4402–4416）。
  - `cap = max(1000, timeoutMs || params.leanTimeoutMs || 120000)`（4417）；引擎解析 `resolveKnownTool(sub,{name:'lean', explicit: leanCommand!=='lean'?leanCommand:'', kind:'lean'})`，失败 ⇒ `LEAN_NOT_FOUND` + `next.tried`（4409–4424）。
  - `argv = [exe, ...prefix.slice(1), abs]`（`prefix` 由 `leanRunPrefix()` 给：`[engine, ...leanArgs, ...searchArgs]`，4425–4426、4664–4671）；`spawn({argv, cwd: instRoot(), stdio:{stdin:'ignore', stdout:{maxBytes:64KB}, stderr:{maxBytes:64KB}}, graceMs:cap})`（4429–4434）。
  - `hooks.onHandle(handle)` 把活进程交给异步队列（dispose 时 terminate）；`hooks.onBuildPrefix(pfx.prefix)` 把**归一化构建前缀**交给 settle 校验（**作业只能落地它入队时的构建上下文**，4436–4439）。
  - **超时必须真的终止**：`Promise.race([guarded done, ctx.timeout(cap)→timedOut=true; handle.terminate(); resolve(SIGTERM)])`；disposer 在 finally 里两条路都清；`done` 晚到不得变成 unhandled rejection（4451–4477）。
  - 取输出：`handle.collected.stdout.readFrom(0).text`（best effort）（4478–4480）。
  - 返回 `{ok:exitCode===0, exitCode, signal, ms, command, file, leanFoundVia, stdout:tail(4000), stderr:tail(4000), timedOut: timedOut||ms>=cap, code: ok?undefined:(timedOut||ms>=cap?'LEAN_TIMEOUT':'LEAN_FAILED')}`（4484–4490）。
- **`formalSetRun(target, run)`（4492–4513）**：`record` 以**函数**形式传 fold（并发写同 target 不覆盖，MEDIUM 6）；`keep = passed|blocked ? 原值 : 'attempted'`；写 `file`、`run:{at,ok,exitCode,ms,stdoutTail:800,stderrTail:800}`、`updatedAt`。
- **`leanRunTool(memberId, o)`（5581–5619）**：`leanAsync !== false` 时走 `leanPrecheck` + 读文本 + `leanRunPrefix` ⇒ `enqueueLeanJob({jobId: leanJobId(target||rel, leanBuildDigest(text,prefix)), kind:'run', rel, file:rel, target, member, contentSha256: sha256Hex(leanHashText(text)), buildHash: leanBuildHash(prefix), buildPrefix, timeoutMs: args.timeout_ms})`；返回 `{ok:true, async:{jobId,state:'queued'}, jobId, file, target, message}`，message 明确"公告只投给发起者、**重启后不再补发**，长期查询用 `vibe_v5_lean_job {jobId}` / `Formal/Jobs/<jobId>.json` / `lean_lib.jobs`"（5596–5602）。同步档：`leanRunFile`，有 `target` 则 `formalSetRun` + `writeFormalIndex`，成功写群聊，返回体带 `hint`（通过 ⇒ 用 `kind='proof'` 归档；失败 ⇒ 修复重跑或 `kind='blocked'`）（5603–5618）。
- **file:line**：4360–4513、5581–5619。

### 1.14 `[FORMAL]` 异步 Lean 编译队列（本分片最关键的「作业持久化/断点续算」实现）

- **入口**：`lean_run`（默认 async）、`lean_archive{run:true}`（默认）、`kind='lemma'` 隐式编译；`lean_job` 查询。
- **内存结构（4594–4601）**：`leanJobs:Map(jobId→job)`（**权威**）、`leanActive:Map(jobId→{job,handle})`、`leanActiveJob/leanActiveHandle`（最近启动者，供提示/卸载报告）、`leanDrainTimer`、`leanRecoveryDone`、`leanDisposed`、`leanNotices[]`（**上限 20**，4852–4853）。
- **`leanJobsMax()` = `max(1, floor(params.leanJobsMaxParallel || 1))`**（4602，默认 1 = 严格串行）。
- **耐久镜像**：`leanJobRel(jobId) = 'Formal/Jobs/' + jobId + '.json'`；`leanWriteJob`（best-effort，**从不抛**）；`leanReadJobMirror`；`leanJobMirrorSettled(rec) = rec.state==='settled' && Number(rec.exitCode)===0`（4603–4610）。
- **内容去重 `leanLibArchivedOk(name, sha)`**：先查内存队列，再遍历 `Formal/Jobs/*.json`（`fs.resolve`+`fs.stat`+`fs.listDir`），命中"kind='lib' && name && contentSha256===sha && 镜像 settled"⇒ true；没有镜像 ⇒ 不去重（4614–4629）。
- **`leanNextQueued()`**：`state==='queued'` 里 `enqueuedAt` 最小者（**FIFO**）（4635–4639）。
- **搜索根**：`leanSearchRootView()` = `vibeRoot()` 正斜杠化；`leanSearchRoot()` 绝对路径直接用，相对路径经 `fs.resolve` 取 `targetKey||displayPath`（4641–4650）。
- **构建摘要（jobId 的键）**：
  - `leanRunPrefix()` = `{engine, userArgs, searchList, searchArgs, prefix:[engine,...userArgs,...searchArgs]}`——**归一化构建前缀，不含文件名**（4662–4671）。
  - `leanInjectedSearchList(userArgs)`：`leanArgs` 已含 `-R`/`--root`/`--search-path`（`leanHasSearchFlag` 263–272）⇒ **返回 `[]`（显式覆盖优先）**；否则 `leanSearchPaths`（用户顺序）+ 自动 `vibeRoot()` 去重（4674–4680）。
  - `leanBuildDigest(contentText, prefix) = sha256(leanHashText(content) + '|' + JSON.stringify(prefix))`；`leanBuildHash(prefix) = sha256(JSON.stringify(prefix))`（4681–4684）。
  - `leanJobId(key, sha) = String(key) + '-' + sha.slice(0,12)`（**同一文本在不同 flags 下是不同的作业**，4657–4661）。
  - `leanHashText`（274–276）：`\r\n?→\n` + 去尾部空白；`sha256Hex`（292+）是**手写 SHA-256**（文件零 import，测试对 published vectors 与 `node:crypto` 双向核对）。
- **装填/驱动**：
  - `armLeanDrain(ms)`（4685–4694）：已 dispose 或已有 timer 则不装；**`delay = (typeof ms==='number' && ms>0) ? floor(ms) : 0`** —— 注释点名 `posMs(0,…)` 会把 0 当默认 120s 从而**卡死队列**，所以这里不用 `posMs`。
  - `enqueueLeanJob(spec)`（4715–4725）：`Object.assign({}, spec, {state:'queued', attempts:0, enqueuedAt:now(), startedAt:0, settledAt:0, exitCode:null, ok:false, timedOut:false, interrupted:false})` ⇒ `leanJobs.set` ⇒ **先写镜像** ⇒ `armLeanDrain()`（**工具必须在下一次 tick 之前返回**）。
  - `runLeanQueue()`（4726–4745）：`while (leanActive.size < leanJobsMax())` 取队首 ⇒ `runLeanJob(job,slot)` 后台跑；`.finally` 里 `leanActive.delete`、清 active 指针、**若有下一个 queued 再 `armLeanDrain()`**。
  - 心跳接线：`armHeartbeat` 回调**先** `runLeanQueue()` **再** `scheduleNext()`（4263–4266）；即"暂停/已结题的研究所也会把已接受的作业跑完"（注释 4590）。
- **`runLeanJob(job, slot)`（4746–4783）**：`state='running'`、`startedAt`、`attempts+1` ⇒ 写镜像 ⇒ `leanRunFile(job.rel, job.timeoutMs, {onHandle, onBuildPrefix})`（异常包成 `LEAN_RUN_FAILED`）⇒ 重新 `leanHashFile(job.rel)`；**`settledOk = run.ok && hashMatched && buildMatched`**（三条件），其中 `buildMatched = buildHash(actualPrefix) === job.buildHash`，不匹配时 stderr tail 记"构建上下文已改变（leanArgs/搜索路径在入队后被修改），本次结果不用于判定"；终态 `settled | interrupted | timeout | failed`；`job.run` 记录；`leanApplySettle`；写镜像；`leanQueueNotice`。
- **`leanApplySettle(job, run, settledOk, hashMatched)`（4786–4844）**：**唯一**让对象因编译变 `passed` 的地方，按 kind 三分支：
  - `proof`：`status = settledOk ? 'passed' : 'attempted'`；`proof = settledOk ? 'Verified/Lean/<t>.lean' : ''`；`decision='used'`、`decisionSource='job-settle'`；**`sha256` 沿用 `job.contentSha256`**（S21/D1/D3：settle 写入会替换整条记录，不带上就会把归档身份清掉）；`note` 追加 stale 说明；`settledOk` 时写 `Verified/Lean/<target>.lean`（内容 = `job.content`）⇒ `putFormal` ⇒ `rebuildLeanLibIndexes()` ⇒ 群聊。
  - `lib`：有 target 则更新记录的 `file/run/async`；`rebuildLeanLibIndexes()`；群聊。
  - 其它（普通 run）：`formalSetRun(target,run)` + 附加 `async` 记录 + `writeFormalIndex()`；群聊。
- **公告一次性 `leanQueueNotice` / `takeLeanNoticesFor(memberId)`（4845–4871）**：行文本按 `settled/timeout/interrupted/failed` 四态；`leanNotices` 上限 20；`takeLeanNoticesFor` 先**剪掉已非 active 成员的通知**（L8：否则永远投不出去却占槽），再只取该成员自己的并移除 ⇒ **"结算结果恰好在成员的下一轮提示里出现一次"**。
- **崩溃恢复 `recoverLeanJobs()`（4915–4966）**：幂等（`leanRecoveryDone`）；扫 `Formal/Jobs/*.json`（`fs.resolve/stat/listDir`）：
  - `queued` ⇒ 重新放入内存队列 + 群聊"从未开始，已重新入队"；
  - `running`/`interrupted` ⇒ `interrupted=true`；`leanMarkAttempted(rec, matched ? '崩溃恢复：上一次运行的结果不可知' : '…文件已被改写')`；**哈希仍匹配 ⇒ `state='queued'`、`startedAt=0`、重新入队（attempts 由后续 run 再 +1）**；不匹配 ⇒ `state='failed'`、写镜像、群聊"**不自动重驱**，请手动重跑（对象保持 attempted）"；
  - `settled && exitCode===0 && matched` ⇒ `leanApplyRecovered(rec)`（**补写 `Verified/Lean/<t>.lean` + `passed`**，写 `sha256`）+ 群聊"按作业记录补齐归档与 passed"；
  - 否则 ⇒ `leanMarkAttempted(rec, '崩溃恢复：作业未通过或内容已变')`；
  - 末尾若有 queued 再 `armLeanDrain()`；返回 `{scanned, requeued, attempted}`。
  - **调用点**：`ready()`/启动路径 1393（"状态文件装好之后"）、10294（另一处启动/resume 路径）；两处都 try/catch，注释说"已在 ready() 路径报过"。
- **`leanMarkAttempted(rec, why)`（4875–4891）**：`target` 空则返回；**`!sameJob && prev.status==='passed'` ⇒ 不降级**（"绝不降级更新的通过"）；`!sameJob && rec.kind!=='proof'` ⇒ 不写；否则 `status = prev.status==='blocked' ? 'blocked' : 'attempted'`，`proof = kind==='proof' ? '' : prev.proof`，写 `async:{jobId,state:'interrupted',attempts,enqueuedAt,startedAt,settledAt,exitCode}`，`note` 追加 why（去重），`updatedAt`；`writeFormalIndex()`。
- **`leanApplyRecovered(rec)`（4892–4914）**：`proof` 作业 ⇒ 写 `Verified/Lean/<t>.lean`（内容 = `rec.content`）⇒ `status:'passed'`、`proof`、`decision:'used'`、`sha256: rec.contentSha256||prev.sha256`、`run` 覆盖为 `{ok:true,exitCode:0}`、`async` ⇒ `rebuildLeanLibIndexes()`。其它 kind ⇒ 只更新 run/async 后重建索引。
- **`leanJobView(job)`（4967–4980）**：投影 `{jobId,state,kind,file,rel,target,attempts,exitCode,ok,timedOut,interrupted,buildMatched: job.buildMatched!==false,enqueuedAt,startedAt,settledAt,jobFile,proof,stderrTail}`。
- **`leanJobTool(o)`（4984–5003）**：`waitMs = max(0, min(600000, floor(...)))`；无 `jobId` ⇒ `{ok:true, jobs:leanJobsView(), count, running, maxParallel}`；有 ⇒ 先内存再镜像；**自轮询**（每轮 `runLeanQueue()` + 最多 25ms 睡眠）直到非 queued/running 或超时；超时返回**当前状态**而非抛错；`{ok:true, job, waitedMs, timedOut}`。
- **`disposeLeanJobs()`（5005–5024）**：`leanDisposed=true`、清 drain timer、把 `leanActive` 里每个作业标 `interrupted`+`settledAt`、`handle.terminate()`、再 terminate 最近的 handle；对每个作业**best-effort 写镜像** + `leanQueueNotice(job, …, true)`；返回 `{terminated}`。注册进 `leanDisposers`（5025）。⇒ **进程消失时进行中的编译必定不是 passed**。
- **`leanArchive(memberId, o)`（5654–5799）**：三分支细节见 §1.12 表；关键实现点：
  - `def`/`lemma`：`name` 必填（`V5_INVALID_ARGUMENT`）；`content` 或 `from`（`from` 必须是工作区内 `.lean`）二者其一否则拒；`rel = Formal/{Lib|Proved}/<name>.lean`；`sha = sha256(leanHashText(body))`；**去重 = 文件哈希相同 && `leanLibArchivedOk(name,sha)`** ⇒ `{deduped:true}` 不重写不重编译（5671–5676）；异步档走 `leanPrecheck(instRootless(rel))`（**hint 用绝对路径**，因为全局库在所根之外）+ 入队 `kind:'lib'` + `rebuildLeanLibIndexes()`；没有工具链则**回落到同步路径**以保留诚实的 NO_SUBPROCESS/LEAN_NOT_FOUND（5692–5696）；同步路径也会**补写一份 job 镜像**（`state: ok?'settled':timedOut?'timeout':'failed'`），供后续同内容去重与恢复扫描使用（5697–5705）。
  - `proof`：`target` 必填；`workRel = Formal/<target>.lean`；去重 = `prev.status==='passed' && 当前工作文件哈希 === sha`（5724–5728）；写工作文件后异步档把对象置 `attempted`（`blocked` 保持 `blocked`）、`proof:''`、`decision:'used'`、`async:{jobId,state:'queued',…}`；**"落地为通过之前不会写 Verified/Lean/、也不会转忠实性审查"**（5738–5752）。
  - `blocked`：`note` 必填（5790）。
  - 返回值都带 `sha256`、`fidelity`、`abstainedCount`（`(rec.fidelity||prev.fidelity).abstainedCount`），供 `lean_lib` / 报告做可读面（5727、5752、5784）。
- **`leanRead(o)`（5622–5653）**：`name` 必填且**拒路径形状**（含 `/`、`\`、`..`、盘符 ⇒ `V5_INVALID_ARGUMENT`）；`idSafe(raw)` 必须等于 `raw`（否则拒）；`kind ∈ auto|lib|proved`；依次查 `Formal/{Lib,Proved}/<name>.lean`（经 `leanAbsPath(instRootless(rel))`）；返回 `{ok,name,file,kind,sha256(sha256Hex(leanHashText(full))),bytes,text,truncated}`，正文上限 `LEAN_READ_MAX_BYTES`=64KB。
- **`leanLibArchivedOk` 的语义边界**：它**只看作业记录**，不重编译；`rebuildLeanLibIndexes` 也**刻意不执行工具链**（"每次问'有什么可复用'就跑 lean 会很慢也很意外"，5524–5528）。
- **持久化/恢复总结（目标 5 的关键对照）**：
  - **有**：作业镜像 `Formal/Jobs/<jobId>.json`（每次状态变化都写）、四态终态、`recoverLeanJobs` 的四分支恢复、`settled+hash 匹配` 可补写归档、`interrupted` 可重入队（attempts+1）、dispose 必中断。
  - **没有**：**没有后台守护进程**（docs/formal-verification.md §11："异步队列不是持久任务系统 —— 队列是内存态 + 镜像"）；**公告不补发**（只有"发起者下一轮"一次性；重启后必须查 `lean_job`/镜像）；`leanJobs` 是**会话内**的 Map，第二个会话看不见第一个会话的队列（只能看镜像）。
- **file:line**：4587–5025、5649–5705、5581–5619。

### 1.15 `[FORMAL]` 三个索引 + 形式化提示词块

- **`writeFormalIndex()`（5494–5513）**：写 `Formal/Index.md`；表头 `对象|状态|形式化文件|归档证明|最近运行|难度判断/阻塞原因`；run 列格式 `ok（exit 0，1.2s）`/`fail（exit N，…s）`/`—`；note 去 `|` 并截断 120；有 TODO 时追加 `## 形式化待办（require 模式：定论被搁置）`。
- **`writeFormalTodo()`（5514–5523）**：写 `Formal/TODO.md`，逐条 `- <id>|<why>|<时间>`；空则"（暂无）"。
- **`rebuildLeanLibIndexes()`（5524–5571）**：`scan(dirAbs, dirRel, kindLabel)` 扫 `.lean`：抽**第一条非注释非 import 代码行**作摘要（截断 110）、抽所有 `import ` 行作依赖列；产出 `rows`（md 表）与 `cards`（`{name,file,kind,summary,sha256}`，sha 用 `sha256Hex(leanHashText(txt))`）；分别写 `vibeRoot()+'/Formal/Lib/Index.md'` 与 `.../Proved/Index.md`；再 `writeFormalIndex()`+`writeFormalTodo()`；返回 `{lib,proved,objects,libCards,provedCards}`。**不执行工具链**。
- **`instRootless(rel)`（5574）**：vibe-root 相对 → 绝对（全局库在项目树旁边）。
- **`formalPromptBlock(target)`（5413–5472）**：`off` 返回空串；`passed` ⇒ **忠实性审查**措辞（"不需要重新检查推导"；发现偏差**不要投 0**，给严格介于 0 与 1 的值 + `formal:{decision:'defect',note}`；框架撤回"已通过"；`require` 档明说本次不定论，`encourage` 档**不得承诺它无法强制的搁置**，要靠弃权；只有独立于 Lean 也能确定命题为假才投 0）（5419–5440）；`blocked` ⇒ 复核阻塞判断（5441–5443）；否则给难度判断流程、工具名、工作目录（`formalRootRel()/` 与短形两种写法都接受）、复用路径（Lib/Proved）、`require` 档的门禁说明、**"宿主无 Lean 工具链（LEAN_NOT_FOUND / NO_SUBPROCESS）也算显式阻塞原因，门禁可放行"**（5444–5470）。
- **`formalWorkLine()`（5473–5492）**：日常"顺手形式化"段；`off` 时返回空；`eager` 追加"主动"句；写明查重优先、`import Formal.Lib.<name>`/`vibe_v5_lean_read` 复用、**默认后台队列（leanAsync=true）且"作业落地为'通过'之前不得把该对象当成已通过"**、`require` 档句子。
- **file:line**：5493–5574、5413–5492。

### 1.16 `[MATH]` `math_computation` 接缝（宿主侧，5027–5222）

- **路径守卫（纵深防御，模块自己也有一层）**：
  - `mathRelPath(rel)`（5032–5042）：反斜杠归一；空/绝对/盘符 ⇒ `null`；`..` 弹栈，**越出则 `null`**；返回归一化 institute 相对路径。
  - `mathWriteRel/mathReadRel/mathExistsRel/mathListDirRel`（5043–5071）：`''`/`'.'` 在 `listDir` 表示**项目根本身**；其余非法路径 ⇒ `false`/`undefined`/`[]`。
- **`mathResolveExecutable(cmd)`（5072–5078）**：无 subprocess 服务 ⇒ `throw new Error('NO_SUBPROCESS: the host exposes no subprocess service')`；解析不到 ⇒ throw。
- **`mathSpawn(opts)`（5084–5151）**（模块调用契约 `{argv,cwd,timeoutMs,stdoutCap,stderrCap,stdin}`，期望**完整捕获输出**）：
  - 无 subprocess 服务 / 空 argv ⇒ **返回 `null`**（模块把它映射为 `MATH_NO_SUBPROCESS`，5087–5089、5109–5111）。
  - `cap = max(1000, floor(timeoutMs || params.mathTimeoutMs || 60000))`；`outCap = max(MATH_CAPS.stdout, floor(stdoutCap || MATH_CAPS.file))`；`errCap` 同（**stdio 上限必须 ≥ 模块的 64KB 返回上限、以 `MATH_CAPS.file`=4MB 为默认**，5081–5083、5091–5093）。
  - `spawn({argv, cwd: o.cwd||instRoot(), stdio:{stdin: o.stdin===undefined?'ignore':'pipe', stdout:{maxBytes:outCap}, stderr:{maxBytes:errCap}}, graceMs:cap})`；spawn 抛异常 ⇒ 返回 `{exit:null,timedOut:false,killed:false,ms,stdout:'',stderr:err}`（5096–5108）。
  - `stdin` 提供时写入并 `end()`（best effort）（5112–5114）。
  - **超时真 kill**：与 `leanRunFile` 同构的 race + `handle.terminate()` + finally 清 disposer（5115–5138）。
  - 返回 `{exit, timedOut, killed: timedOut||!!signal, ms, stdout, stderr}`（**完整文本**，不截断）（5139–5150）。
- **`mathLog(kind,msg)`**：`saveChatLine('【计算】'+msg)`，异常吞掉（"日志行绝不能弄坏一次运行"）（5152–5154）。
- **`mathSessionHost`（5157–5177）**——模块与本所之间的**唯一耦合面**：
  `register:()=>{}`；`params:()=>Object.assign({},params)`；`projectRoot:()=>instRoot()`；`designator:'vibe-math-v5r'`；`writeText/readText/exists/resolveExecutable/spawn`（上面几个）；`hasSubprocess`（让模块在引擎探测前就报 `MATH_NO_SUBPROCESS`）；`listDir`（P2a 保留上限用）；`runtimeRoots`（**`process.env.DSH_HOME` 有则**用它，否则 `HOME|USERPROFILE`+'/.dsh'**，注释明说"显式设置即隔离发现"）；`listDirAbs`（`fs.resolve`+`fs.stat`+`fs.listDir`，异常返回 `[]`）；`log`。
  注释强调：这个 host **同时**被"可用性行探针"使用，而探针在**工具调用之外**运行，所以不能依赖"当前会话"环境（5155–5156）。
- **`refreshMathLine()`（5183–5206）**：`mathComputation==='off'` ⇒ 两语言行为空串（**零提及纪律**）；否则 `probeMathEngines(mathSessionHost)` ⇒ `mathAvailabilityLine(probe,lang,mathMode)`；然后 **4 条漂移守卫**：中文/英文各自必须仍含 `MATH_RULE_LINES[0]`/`MATH_RULE_LINES_EN[0]`、`MATH_ARCHIVE_WORKFLOW_LINE(_EN)`、`MATH_SUBSTITUTION_RULE_LINE(_EN)`，缺失只 `console.error`（5191–5200）；探针异常 ⇒ 保留旧值，**绝不让提示词构造失败**（5202–5205）。
- **`mathPromptBlock(lang)`（5209–5219）**：有动态行则用它；否则退回 `MATH_PERSONA_TOOL_LINE` + 归档工作流 + 替代声明规则（`off` ⇒ 空串）。**`mathPushLine(L)`（5222）** 把中文块 push 进提示词（一行，`off` 时 no-op）。
- **工具注册（范围外 10986–11024）**：
  - 模块的 `MATH_TOOL_NAME = 'math_computation'`（**刻意无 `vibe_` 前缀**：四套预设同一原语）；`projectRoot()` 是**研究所根** ⇒ 回执落在 `<研究所>/Computation/<runId>/`（10986–10988）。
  - 先用 `mathMetaHost`（假 host，回调永不触发）调 `registerMathComputation` **只为拿冻结的工具面**；**漂移守卫**：`mathToolMeta.description !== MATH_TOOL_DESCRIPTION` ⇒ `console.error`（10989–11010）。
  - 每个 session 一个模块实例：`mathSessionHandlers: WeakMap(session API → handler)`，`mathHandlerFor(s)` 用 `s.mathSessionHost()` 注册，无 handler 时给安全兜底 `MATH_INVALID_ARGUMENT`（11011–11020）。
  - `registerTool(mathToolMeta.name, mathToolMeta.description, mathToolMeta.parameters, (s,args)=>mathHandlerFor(s)(args))`（11021–11024）。⇒ **工具名/描述/参数 schema 不是 v5r 手写的，而是共享模块冻结面**。
  - 参数 `vibe_v5_set` 接受：`mathComputation`/`mathMode`/`mathInstallScope` 在 `strs`，`mathTimeoutMs` 在 `ints`，`mathEngines`/`mathPackages` 在 `arrs`（9778–9782、11070）。
- **file:line**：5027–5222、10986–11024、（+5762–5782）。

### 1.17 `[MATH]` 论文（LaTeX）提示块 `paperHintBlock` / `paperPushLine`

- `paperHintBlock(lang)`（5228–5232）：LaTeX 缺失时的**四步有界指引 + 三条硬边界**——① 只在文档化的常见 TeX 根与 PATH 上**有界**核查（`where xelatex`、`latexmk --version`），**不要全盘扫描**；点名"最常见的情形是引擎装了但不在 PATH"并给出 Windows 盘根 `texlive\<年>\bin\windows`、Unix `/usr/local/texlive/<年>/bin/*` 与 `/opt/texlive/...`、macOS `/Library/TeX/texbin`；② 找到绝对路径写进 `paperLatexCommand` 后重检；③ 仍找不到 ⇒ **如实上报所办/群聊**，由所办向用户确认（装 TeX 需用户明确同意）；④ 无回应则照旧降级（只交付 `paper.tex`+`paper.md`）。**硬边界：绝不自动安装；绝不写工作区之外；绝不把"未检测到"当失败。**（task-9 四步三边界；task-28 补"装了但不在 PATH"与 TeX Live 文档位置。）
- `paperPushLine(L)`（5233–5241）：每次唤醒都 push，但**前置一句"以下这段仅在你参与论文写作或编译时适用"**（P4 铁律修复：这段原本在入职/验证/会议提示里像无解释的噪声）。
- **file:line**：5224–5241。

### 1.18 `[OTHER]` 成员自查＋自述（G6）

- **入口**：`vibe_v5_self_report {overall?,subgoal?,plan?,status?,reason?,source?}`（无字段 = **只读查看**并留痕）；另可经 `member|memberId|for|target` 指向他人（**仅院士可为他人的 `overall`**）。
- **逻辑（7131–7223）**：
  - 只有 `academician|researcher` 可写（列席/受邀/临时工 ⇒ `V5_NOT_VOTER`）；只读查看不受限（7134–7137）。
  - **时间由框架设置**：工具层与函数层**各查一次** `/(At|Ms)$/i`（大小写不敏感，堵 `subgoal_at`/`expires_at` 这类全小写），命中 ⇒ `V5_INVALID_ARGUMENT`（7139–7145、7213–7218）。
  - `source ∈ {self,negotiated,academician}`，其余归 `self`（7146–7147）。
  - 字段差异 → `changes[]`；**无变化 ⇒ `{ok:true,deduped:true}` 且不追加历史**（幂等）（7165–7170）。
  - 有变化：逐字段写值 + `SELF_TIME_OF={overall:'overallAt',subgoal:'subgoalAt',plan:'planAt'}` 打时间戳 + `history.push({at,by,field,old,next,reason,source})`（7171–7177）；`overall` 的**作者不是自己**时记 `deviation:{at,by,keptAcademicianValue,keptValue,keptAt,keptBy}`（**保留原值与旧时间、可取回**），否则 `overallBy = (source==='academician'?'academician':m.id)`（7178–7186）；写盘 + 群聊（含"已偏离院士设定"提示）（7187–7194）。
  - 他人自述：`actor.kind==='academician'` 且**只有 `overall` 一个字段**才放行，否则 `V5_INVALID_ARGUMENT`（7204–7212）。
- **文件承载（不碰 fold/EV 表）**：`Members/<id>/SelfReport.json`，写入是 **tmp + rename 原子**（`fs.mkdirSync(recursive)`、`writeFileSync(tmp)`、`renameSync`）（7075–7092）。
- **查看留痕**：`Shared/SelfReportViewAudit.json`，append `{at,by,saw}` 并 **cap 200**（`SELF_VIEW_AUDIT_CAP`）；**留痕失败不得让查看失败**（7093–7103）。
- **查看面**：`selfReportView(viewerId)` 分两组——在册（academician/researcher）与 `nonVoting`（列席/受邀/临时工**单列并标注**）；每行只含工作状态字段（`overall/subgoal/plan/status` + 各自 `…At` + `deviation/deviationLabel`）；返回 `viewAuditTail`（最近 20）；**私聊内容永不进入**（7104–7130）。
- **宿主接触面**：`node:fs`（**直接 import，不经 ctx.fs**）——这是本分片唯一直接使用 Node 文件系统的地方（7076、7094）。
- **file:line**：7069–7223。

### 1.19 `[OTHER]` S4 主持代行 / 程序异议 / 结束辩论（含 `formal_proof` 登记）

- **`chairProxyTool`（`vibe_v5_chair_proxy`）（7235–7277）**：仅院士（否则 `V5_NOT_ACADEMICIAN`）；时间键 + `until` 一律拒；**必须有进行中会议**（否则 `V5_NO_OPEN_MEETING`）；`scope` 只能 `'close'`（唯一取值，`CHAIR_SCOPE_CLOSE`=7228）；`why` 必填；代行者必须是**在册 active** 成员；同值重复 ⇒ `{ok:true,deduped:true}`（**不追加历史、不刷新 `since`**）；入档 = `patchInstitute({chair:rec})` **耐久副本** + 当次会议内存对象 `meeting.chair`；**明确不产生新票权**（不碰名册与 `voters()`）；群聊公告"代行不产生新票权、主持不额外加权"。
- **`proceduralObjectionTool`（`vibe_v5_procedural_objection`）（7280–7306）**：只有**在册成员**可提（列席/受邀/临时工 ⇒ `V5_NOT_VOTER`）；必须会议在飞（`V5_NO_OPEN_MEETING`）；`why` 必填；按 `(by,why)` 幂等；入档 = `meeting.objections[]` + 纪要尾部（`appendMeetingTail`）；**`chairReplyPending:true` 必须保持可见**（不得假装已回填）；**只记录不驱动**（不改票面、不改阶段、不延后收束）。
- **`endVerify(memberId, target, reason, op, status)`（7309–7358）**：
  - 权限 `gateDo(member.id,'end_verify', '只有院士可以显式结束辩论（R10-2a）…')`。
  - **`op==='formal_proof'`（S25-C / issue #13 #1）**：`target` 经 `idSafe`；`status` 必须 `'proved'|'disproved'`；`patchInstitute({formalProofs: (cur)=>Object.assign({},cur||{},{[t]:{status,by:memberId,at:now(),ref:reason,locked:true}})})`（**函数式变更，并发登记不互相覆盖**）；群聊并 `notifyActivity()`；返回 `{ok,target,formalProof}`。**只登记、不推进辩论**；自此该命题才有资格进入验证/辩论（见 §3）。
  - 否则：必须有在飞验证（`V5_INVALID_ARGUMENT`）；`target` 不一致 ⇒ 拒；`judgeVerdict(vs,'academician')`；`ended = {...vs, endedBy:'academician', endedByMember, endedAt, endReason}`；`true/false` ⇒ 过 `require` 门禁后 `closeVerify` 或 `deferForFormal`；否则 `finalizeUndecided(ended, j, {endedBy:'academician', bound:null})`；返回体**同时**给 `outcome/reason` 与 `process:{m,Peff,P,bTrue,bFalse,abstain,estimates,votedCount,answered,silent,unable,mean,provisional:true}` + `provisional:false`。
- **持久化**：`chair`/`formalProofs` 都在 fold 白名单（634、662–667）；`meeting.objections` 只活在当次会议 + 纪要尾部（耐久文件）。
- **file:line**：7224–7358。

### 1.20 `[OTHER]` 边界说明（相邻机制归属）

- `saveChatLine(text)`（7365–7376）：群聊**人读镜像** `Shared/Chat/<YYYY-MM-DD>.md`，append 经**单条 promise 链**串行化（权威记录是 `inst().messages`）；空行直接 `false`。
- `wakeIfIdle(member, kind)`（7379–7384）：`!running || autoDone` ⇒ false；非 active ⇒ false；`busy` ⇒ false；否则 `wakeMember(member, normalPrompt(member), kind||'normal')`。
- **`// ---- meetings ----`（7385 起）属于分片 C**：`startMeeting` 的 park 规则、发言模型（机会位/发言位/票位）、`meetingHardLimitMs`（默认 1800000，钳制 `[300000,7200000]`）、`meetingWakeRetries`（默认 5，钳制 `[0,10]`）等，本文件只在需要交叉引用时点名（例如 `taskAssign` 的 `origin:'meeting:<mt>'`、`bumpArtifacts` 的 `meetingKeepEvery` 自动同步、`startMeeting` 与 `verify` 互斥）。

---

## 2. 标签索引（机制 → 标签 → file:line）

| 标签 | 机制（file:line） |
|---|---|
| `[SPAWN]` | 成员诞生五步 `spawnMember` 3747–3851；投递一轮 `wakeMember` 3859–3932；`startWithToolFilter` 重试 9711–9726（范围外） |
| `[PROMPT/PERSONA]` | `replySpec` 3978–4047；`initialPrompt` 4054–4083；`normalPrompt` 4084–4107；`checkpointPrompt` 4108–4127；`meetingPrompt` 4128–4176；`verifyPrompt` 4177–4241；`stateBlock/briefBlock` 4051–4053、3376–3421；`pointerContractBlock` 2065–2068；`resourceBlock` 2069–2085；`proofStatusBlock` 2087–2097；`formalPromptBlock` 5413–5472；`formalWorkLine` 5473–5492；`mathPromptBlock/mathPushLine` 5209–5222；`paperHintBlock/paperPushLine` 5228–5241；`feedbackPushLine` 5403–5411；`coreRules` 5809–5812；`headerListContractBlock` 372–383（范围外） |
| `[SCHED]` | `recoverStallMs` 4249；`clearHeartbeat` 4250–4253；`armHeartbeat` 4257–4268；`armDigest` 4270–4276；`armLeanDrain` 4685–4694；`notifyActivity/waitForActivity` 3429–3435 |
| `[TASK]` | 原语 4279–4306；`validateDeps` 6069–6098；`taskCreate` 6099–6143；`listTasks` 6144–6152；`getTask` 6153–6157；`taskUpdate` 6161–6292；`taskAssign` 6297–6373；`taskPrioritize` 6374–6394；`releaseTasksOf` 6397–6404；`writeTaskboardMirror` 6405–6418；`writeRosterMirror` 6422–6449 |
| `[FORMAL]` | 模式/路径 4323–4359；`leanAbsPath` 4366–4394；`leanRunFile` 4401–4491；`formalSetRun` 4492–4513；`removeArchivedProof` 4520–4541；`recordFidelityDefect` 4544–4585；队列 4594–5025；`formalPromptBlock` 5413–5472；`formalWorkLine` 5473–5492；三索引 5493–5574；`leanRunTool` 5581–5619；`leanRead` 5622–5653；`leanArchive` 5654–5799；回执侧 9418–9535（范围外） |
| `[MATH]` | 接缝 5027–5222；注册 10986–11024；`math-computation.js` 全文；`math-engines.js` 全文 |
| `[FEEDBACK]` | 常量 74–92；5243–5411；注册 11154 |
| `[LIBRARY]` | `bumpArtifacts` 5844–5856；`publishProgress` 5862–5881；`recordCard` 5885–5931；`readLibrary` 5932–6060；`contentFingerprint` 362–365（范围外） |
| `[COMPACT]` | `coreRules` 5809–5812；`postmark` 5818–5827；`maybeRealCompact` 9728–9749（范围外） |
| `[VOTE]` | §3 专章；主区 6452–7067；阈值/少数意见 2701–2734（范围外）；复议 2742–2864（范围外）；选民/法定数 2899–2953（范围外） |
| `[OTHER]` | 身份推导 3933–3971；`isOffice/isAcademician` 5837–5838；自述 G6 7069–7223；主持代行/程序异议/结束辩论 7224–7358；`saveChatLine/wakeIfIdle` 7365–7384 |

---

## 3. 专章：共识验证（m-vote 布尔）完整逻辑

> 目标 2（会议/表决对照）的**主要事实来源**。代码主区 6452–7067；选民与阈值定义 2899–2953；少数意见与复议 2701–2864（范围外）；收束门禁 6801–6813、7345–7351。

### 3.1 参与者与分母（三条名单口径）

| 记号 | 定义 | 实现 |
|---|---|---|
| `E0` / `P` | **在册可表决者全名单**：`activeMembers()` 里 `kind ∈ {academician, researcher}`（列席/受邀/临时工**无表决权**且不入名单） | `voters()` 2901；`aggregateOpinion` 的 `votersAll` 6585 |
| `E` / `Peff` | **有效分母**：`E0` 去掉已声明 `unable`（"明确无法判断/不能应答"）者 | 6559–6562 |
| `silent` | `E` 中"未表态"者（**阻塞结题、不算反对、绝不折算成同意**） | 6571、6605–6610 |
| `m` | 法定布尔票数 = `max(1, min(max(1, floor(quorumCap \|\| 3)), Peff))`，`quorumCap` 默认 3 | `quorumMFrom` 2903–2906；`quorumCap` 1068 |
| `m_eff` | **复议只升不降**：`max(m, vs.threshold.m)` | `raisedThresholdOf` 2734 + `judgeVerdict` 6595–6597 |
| `rosterVersion` | `'r<成员总数>:<id:phase 排序逗号串>'`，供各视图证明"读到的是同一快照" | 2913–2916；`quorumView` 2934–2953 |

**否决/边界**：`Peff === 0` ⇒ **直接 `undecided`**（"no voters: the institute has no voting members yet"）——不会用 `m=1` 硬凑（6604）；`quorumView()` 在未启动时把 `m` 报成 **0** 且给 `next:{kind:'start'}`，而内部 `quorumM()` 仍 ≥1 以保持算术不变（2929–2952）。

### 3.2 票型全表（`castVerdict` 7014–7067 + `handleReply` 9493–9535）

| 输入 | 语义 | 记账 | 拒绝码 |
|---|---|---|---|
| 数值 `p` | `p==1` ⇒ **断言真**；`p==0` ⇒ **断言假**；`0<p<1` ⇒ **中间概率估计**（计入已投与平均，**不计入布尔选项**） | `votes[id]={prob:p,reason,at}` | 非有限或越界 ⇒ `V5_INVALID_VERDICT`（`verdict must be a number in [0,1], or the word abstain (弃权) / unable (无法判断)`） |
| `'abstain'` / `'弃权'` | **显式弃权**：计入"已投"，**不计选项**（既非赞成也非反对） | `votes[id]={abstain:true,reason,at}` | — |
| `'unable'` / `'无法判断'` | **退出本次分母**：`unable[id]={why,by,at}`；**仍列在名单中**（`unable[]` 可追溯） | 不改票、不算反对 | — |
| 临时工（`kind==='temp'`） | 无表决权；其意见**转达给表决者**（`say(to:'voters')`）而非静默丢弃 | 不写 `votes` | `V5_NOT_VOTER`（`临时工没有表决权；你的意见已转达给表决者`） |
| 没有在飞验证 | — | — | `V5_INVALID_ARGUMENT: no verification in progress` |
| `target` 与当前对象不一致 | — | — | `V5_INVALID_ARGUMENT: the object under verification is <t>` |
| 漏填 `verdict` 字段 | 不投票（`silent`） | — | 框架 `notice` 告知"本轮的票未被记录" |

- 解析层的宽松：`normVerdictNumber`（9348–9359）额外接受字符串 `'TRUE'→1`/`'FALSE'→0`，其余 `Number()` 并钳到 `[0,1]`（**引用数字 `"0.9"` 不再掉成 0.5**）。
- **L2 强制弃权（形式化缺陷联动）**：同一回执里对该对象声明了 `formal:{decision:'defect'}` ⇒ 若该成员是**真表决者**且声明了恰好 `0/1`，框架把这一票记为 **0.5 弃权**，并在 formal 记录的 `fidelity.voteAbstainedByFramework[]` 追加 `{at,by,declared}` + `abstainedCount`（**数组**，两人同轮不互相覆盖），群聊/成员通知明说"你对该对象的 verdict 已按弃权计入"；只影响声明者与当轮（9501–9532）。
- 每次投票都更新 `vs.lastVoteAt`（看门狗计时基准），并**尝试立即收束**：`allVoted = 每个 E0 成员都有 votes[id] 或 unable[id]` ⇒ `continueVerifyRound(next)`，否则只 `scheduleNext()`（7038–7042、7049–7053、7060–7063）。
- 回执含 **`pendingVoters`**（具名列出还没表态的人）——task-25 的真机修复：此前只有一个 `allVoted:false`，成员只能反复试探（7064–7066）。

### 3.3 计量 vs 裁定（R10：过程票数永不产出结论）

- `aggregateOpinion(vs)`（6557–6587）**只描述当时票数**，返回对象**永远带 `provisional: true`**，字段：`{m,P,Peff,bTrue,bFalse,abstain,estimates,mean,votedCount,answered,silent,unable,voters,votersAll,provisional}`。
  - `mean = all.length ? Σp/|all| : 0.5`（**无人投票时默认 0.5**，6581）。
  - `abstain` 与 `estimates` **同名不同义**（L4 术语纪律）：前者是显式弃权（不计选项），后者是 `0<p<1` 的中间估计（**计入平均**）。
- `judgeVerdict(vs, endedBy)`（6593–6625）是**唯一能产出 `true/false` 的路径**，且**必须**显式给出 `endedBy`：
  - `!endedBy` ⇒ `undecided`，reason `R10: 辩论尚未结束（过程票数不构成裁定）`（**fail-safe：忘记传就绝不隐式收束**，6598）。
  - 之后依次：`Peff===0` ⇒ undecided（6604）；`silent.length` ⇒ undecided 并**列出未表态名单**（"D3 参与门：未表态阻塞结题"，6605–6610）。
  - `quorumMode === 'all-unanimous'`（v4 兼容档）：`bTrue===E.length && bFalse===0` ⇒ true；`bFalse===E.length && bTrue===0` ⇒ false；否则 `undecided: not unanimous`（6611–6615）。
  - 默认 `'m-unanimous'`（`quorumMode` 默认值，1069）：
    1. `bTrue + bFalse < m` ⇒ `undecided`（"only N boolean vote(s); m=M required（显式弃权 A 计入已投但不计选项）"）（6616–6618）；
    2. `bTrue>0 && bFalse>0` ⇒ `undecided: conflicting assertions`（**任何反向断言都阻断定论**，少数派不可能被弃权票淹掉）（6619–6621）；
    3. `bTrue>=m && bFalse===0` ⇒ **`true`**（6622）；`bFalse>=m && bTrue===0` ⇒ **`false`**（6623）；
    4. 末行 `undecided: quorum not met`（6624）在数学上被前面分支覆盖（只单边时 `bTrue+bFalse>=m` 已由 1 挡住）⇒ 属**不可达的兜底**（可作为死分支记录）。
  - **`endedBy` 的三个合法来源**（R10 §7.2）：`'round-complete'`（每位有效表决者都已表态）、`'academician'`（院士显式结束，R10-2a）、`'bound:idle'`／`'bound:round-cap'`（**具名且可撤销**的有界触界）。
  - `boundOf(name,why)`（6548）产出 `{name,why,at,revocable:true}`；`R10_PROVISIONAL_NOTE = '（过程票数：尚未生效·仅供参考）'`（6549）。

### 3.4 一轮的生命周期 `continueVerifyRound`（6752–6837）

1. **有界兜底**：`now - lastVoteAt >= recoverStallMs()`（默认 240s）⇒ 具名触界 `bound:idle`：`closed:true`、`outcome:'undecided'`、`endedBy:'bound:idle'`、`bound`、`closedAt`、`mean` 落库；群聊公告明确"**具名且可撤销/续期**（任意成员或院士可重新提议验证）"并列出过程票数（真/假/弃权/平均/m/P）；随后 `armNextVerify()`+`scheduleNext()`（6754–6772）。
2. **轮次只由"全员已答"推进**：`need = voters()`；`missing` 非空 ⇒ 对每个 active 且非 busy 的缺票者 `wakeMember(..., verifyPrompt, 'verify')`；若一个都没唤醒成功 → `armHeartbeat()`；**直接 return（不推进轮次）**（6774–6790）。注释点名这条是承重的：`continueVerifyRound` 在每次调度 pass 都跑，没有它，无关成员的一轮会把辩论轮次烧完并"没人投票就静默结题"。
3. **同一时刻只允许一个收束**：`finalizeLock`（值 `'verify'`）挡住两个并发 `subagent/end` 同时观察"全员已答"并重复收束（重复 Verified 卡 + 重复辩论记录）；锁在**尾部调度之前**释放，链式验证不会被吞掉（6791–6797、6833–6836）。
4. `j = judgeVerdict(vs, 'round-complete')`：
   - `true|false` ⇒ **`require` 门禁**（§3.5）：`formalMode()==='require' && !formalGateOk(formalOf(target))` ⇒ `deferForFormal(vs,j,isTrue)`；否则 `closeVerify(vs, isTrue, j)`（6799–6813）。
   - 未定论且 `vs.round >= max(1, floor(verdictMaxRounds||3))` ⇒ `finalizeUndecided(..., {endedBy:'bound:round-cap', bound: boundOf('round-cap','已达最大辩论轮数 N')})`（6814–6815，`verdictMaxRounds` 默认 3）。
   - 否则**进入真正的辩论轮**：`history = {...vs.votes}`、`votes = {}`、`stage='debate'`、`round+1`、`lastVoteAt=now`，并以 `provisional:true` 落库（**不写 outcome**）；群聊公布每人 prob + `R10_PROVISIONAL_NOTE`；再 `askVoters(next)`（6816–6832）。注释点名"**不清空 `votes` 会让'全员已答'恒真、辩论轮空转（没人被重新征询）**"。
5. 尾：`finally finalizeLock=null` ⇒ `scheduleNext()`（6833–6836）。
- `askVoters(vs)`（6742–6751）：对**还没有票**的每个 voter 发 `verifyPrompt`（kind `'verify'`）；一个都没发出去 ⇒ `armHeartbeat()`。

### 3.5 进入 `Verified/` 的条件（收束三分支）

**共同前置（两道 S25-C 硬门，issue #13 #1）** —— 提议侧与开启侧**各查一遍**（防御纵深）：
1. **只有院士能开启辩论与选择辩论对象**：`maybeQueueVerify`（6681–6683）与 `beginVerify`（6709–6711）都对 `proposer` 做 `isAcademician` 检查，否则 `V5_INVALID_ARGUMENT`（"请由院士发起 propose_verify"）。
2. **只有"已被正式证明或证伪、且已定稿（locked）"的对象才有资格**：`formalProofReady(t)` = `inst().formalProofs[t]` 存在且 `locked===true` 且 `status ∈ {'proved','disproved'}`（`formalProofOf` 先判空再 `idSafe`，避免 `undefined` 抛 TypeError 让整个调度 pass 失败；真源是所级 `formalProofs`，`verdicts[t].formalProof` 仅前向兼容回退）（6660–6674）。登记入口 = `vibe_v5_end_verify {op:'formal_proof', status:'proved'|'disproved'}`（§1.19）。

**分支 A：`closeVerify(vs, isTrue, j)`（6896–6916）——唯一写 `Verified/` 的路径**
- `writeDebateDoc(vs, true, isTrue?1:0)` ⇒ `Shared/Debates/<target>.md`（含结论、提出者、类型、m、P、轮次、阶段、对象陈述、本轮票面、`## 上一轮（辩论前）意见`）。
- `writeVerifiedCard(vs, isTrue, j)` ⇒ `Verified/{问题|方法|命题}/<target>.md`（目录按 `vs.kind`），字段：`# 已验证｜<id>`、`- ID`、`- 类型`、`- 结论: 真|假`、`- 概率: 1|0`、`- 来源: N 名有表决权者一致判真（m=M）`、`- 表决者: <j.voters 逗号串>`、`- 显式弃权: A｜中间估计: E｜全组平均概率: mean.toFixed(2)`、`- 形式化: <formalStatusLine>`（仅 `formalOn()`；附证明路径）、`- 时间`、`## 陈述`、`## 辩论记录`（指向 Debates 文件）（6987–7012）。
- **改源卡**：`rewriteSource(target, proposer, {状态:'已验证·真'|'已验证·假', 概率:'1'|'0'})`（`rewriteCardField` 支持"一行一字段"与"分号串"两种卡片写法，6522–6536）。
- `verifiedRecently.set(target, now())` ⇒ 形成 `recoverStallMs` 的**"刚刚定论"去重窗口**（6901；消费点 6687–6690、6951–6952）。
- `putVerdict`（closed、outcome、mean=1|0、m/P/bTrue/bFalse/abstain/closedAt/voters）—— 收口处 `sealRecord` 自动盖 `minority[]/minorityCount/sealed/threshold{m,floor}/effectiveAt/reconsiderations[]`（1529、2721–2732）。
- `putDebate({target,at,file,outcome})`；群聊"经 N 名有表决权者一致判真（m=M），已写入 Verified/，来源卡已标注"；`markProgress`；`armNextVerify`；`scheduleNext`。
- **少数意见定义**（`minorityOf` 2701–2718）：与最终 outcome 不一致者（outcome=true ⇒ `p<1`；false ⇒ `p>0`）；无胜方时 = 与多数侧不一致者（`mean>=0.5 ? p<mean : p>mean`）；**弃权/无法判断/未表态都不算少数意见**（单列，R2/D3）。

**分支 B：`deferForFormal(vs, j, isTrue)`（6842–6872）——`require` 档门禁**
- 触发条件：`judgeVerdict` 已给出 `true|false`，但 `formalMode()==='require'` 且 `!formalGateOk(formalOf(target))`（即 `status` 不是 `passed`/`blocked`）。
- 记录：`closed:true, outcome:'undecided', reason:'formal-required：尚未取得 Lean 形式化通过，也没有显式阻塞记录（当前状态 X）', mean:j.mean, formalDeferred:true, m/P/bTrue/bFalse/abstain, closedAt, voters:j.voters`；`putFormal`（record 函数：非 `'none'` 的原样保留；todo 函数：按 id 去重后 push `{id,at,why,verdict: isTrue?1:0}`）；写 `Formal/TODO.md`+`Formal/Index.md`；群聊（"本轮不定论，已记入 Formal/TODO.md"）；`markProgress`+`armNextVerify`+`scheduleNext`。**注意：不写 `Verified/`、不改源卡、不改变对象既有概率字段**（6842–6872、docs/formal-verification.md §8）。
- 门禁的**兜底属性**：`require` 档下验证提示词会**先**告知表决者"定论前需要 passed 或 blocked"，所以正常路径不会触发；且门禁"从不把 run 卡死"——记 `undecided`+待办让研究所能继续。

**分支 C：`finalizeUndecided(vs, j, opts)`（6873–6895）——未达门槛 / 触界 / 院士结束**
- `writeDebateDoc(vs,false,j)`（过程记录：平均概率、reason、m、布尔真/假/显式弃权/中间估计）；`rewriteSource(target, proposer, {状态:'未定论', 概率: mean.toFixed(2)})`（**留库附平均概率**，缺源卡则跳过而不是造垃圾文件）；`putVerdict`（closed、outcome `'undecided'`、reason、mean、m/P/bTrue/bFalse/abstain、closedAt、`endedBy`、`bound`、voters）；`putDebate(outcome:'undecided')`；群聊（若是触界则带 `【求真触界｜<name>】`）；`markProgress`+`armNextVerify`+`scheduleNext`。

**触发 `armNextVerify()` 的时机与互斥**（6917–6960）：
- **会议与验证永不并发**：`if (meeting) return`（提议留在队列里，会议结束后由 `schedulePass` 再到达）（6928）。
- `beginLock` 保证**只有一个 begin 在飞**（两个调用者都通过 `currentVerify()` 检查会重复启动同一对象）（6932–6934）。
- 循环里：队列空 ⇒ return；**再查一次** `meeting || currentVerify()`（`await putQueue` 期间可能开了会议）；`takeQueueHead()` **原子**取头（append 落在中间不会丢，删除后也不会被 append 复活）；命中"刚刚定论"窗口 ⇒ `continue`（丢弃该提议）；否则 `beginVerify(p)` + `askVoters(vs)` + return（6936–6956）。
- 队列的**原子性**：`appendToQueue(entry)`（按 `target` 去重 + append 都在 fold 内，6631–6641）；`takeQueueHead()`（取出与删除在同一个 fold 内，6645–6654）。这修的是"同一 tick 两个 `propose_verify` 只留下第二个、两个调用都报 ok"的丢提议竞态（6626–6630）。

**`beginVerify(proposal)`（6706–6741）**：两道门 ⇒ `resolveTargetStatement(target, proposer)`（`findSourceRel` 按 `owner→其余在册成员`×`Propos/Methods/Subproblems` 顺序找源卡，找不到再全目录扫"卡片自报 ID"`- ID:` 匹配；**返回 null 而不是猜路径**，避免造 0 字节野文件并漏写真卡，6473–6501）⇒ 陈述抽取 `## 陈述` 段，**上限 20000 字符且截断可见**（6512–6517）⇒ 造 `vs`：
```
{ target, kind: proposal.kind || guessTargetKind(target), proposer, reason, statement,
  sourceRel, stage:'initial', round:1, votes:{}, history:null, lastVoteAt:now(),
  closed:false, outcome:'', mean:0, m:quorumM(), P:voterCount(), createdAt:now() }
```
⇒ `putVerdict`；群聊"对 X（类型）发起验证；法定票数 m=…，有表决权者 P 人。**先独立初评（彼此不可见），未定论再公开辩论**"；`notifyActivity`（6716–6740）。`guessTargetKind` 由 id 前缀猜：`m_`/`m-` ⇒ method，`s_`/`s-` ⇒ subproblem，否则 proposition（6459–6464）。

### 3.6 复议（R9/U3/D5/D5a）——门槛只升不降

- **记录级入口** `vibe_v5_reconsider {target|target_id|ballot_id, why, evidence?}`（注册 11167；实现 2742–2864+）。
  - 时间键一律拒（2746–2749）；`why` 必填；`target` 必填。
  - **投票板分支**（`target` 以 `ballot:` 开头或给 `ballot_id`）：板必须 `phase==='closed'`（G2：只针对**已生效**结论）；**只有该板的参与者**可提（该板里没有你的票 ⇒ `V5_NOT_VOTER`）；同 `why` ⇒ 幂等 `deduped`；**每板只受理一次**；门槛 `bBefore = max(1, rules.minVotes || cap)`，`bAfter = max(bBefore, reconsiderFloor(), quorumCap)`；写入 `reconsiderations[]`、`supersededBy/supersededAt`、`threshold{m,floor}`、`reopenedAt`、`reopening:true`、**`priorResult` 留档**、`phase:'open'`、`closedAt:0`、`result:null`；**不记名板**（`rules.secret`）的复议**只给聚合面**（票数/门槛/是否成立），**逐人选择永不解密**（2754–2795）。
  - **判定对象分支**：对象必须存在且 `closed`（否则"尚未收束：复议只针对**已生效**的结论"）；资格**由记录派生而非角色**：参与者 = 有 `votes[id]` 或 `unable[id]`，否则 `V5_NOT_VOTER`；**有胜方（outcome true/false）时只有"当初胜方之一"可提**（`myP` 必须等于 1/0），**无胜方时任一参与者可提且不得以"没有胜方"拒收**（D5a 硬约束）；同 `(round,why)` 幂等；**每轮只受理一次**；`round >= verdictMaxRounds` ⇒ 拒（不得无限复算）；`after = max(before, reconsiderFloor, quorumCap)`（**只升不降**，U3）。写入：
    `reconsiderations[].{id:'rc-<target>-<round+1>',by,at,round,nextRound,why,evidence,eligibility:'winner'|'any-participant',thresholdBefore,thresholdAfter,raisedBy,onlyUp,secretSource}`、`previousRounds[]`（**旧票面/旧 unable/旧 minority/旧 outcome/旧 reason/旧 mean/旧 m/旧 endedBy 整块追加留档**）、`previousOutcome`、`supersededBy/supersededAt`、`threshold{m:after,floor}`、`round+1`、**`votes={}`、`unable={}`、`minority=[]`**、`sealed:false, closed:false, reopenedAt, lastVoteAt`，并 `delete` 掉 `outcome/reason/closedAt`（2796–2864+）。
  - **生效路径**：`judgeVerdict` 起始处 `raisedM = raisedThresholdOf(vs)`（读 `vs.threshold.m`），`raisedM > base.m` 时抬高 `base.m`（6595–6597）⇒ 复议后的门槛在下一轮判定里**真的生效**。
  - **不变量**：不产生新票权、不改分母、不改阶段、无定时器；旧结论仍可引用但带"已被复议"标记（2862–2863）。

### 3.7 这一套"不做什么"（实现层面的诚实边界）

- **投票不裁定真假**：结果只决定"是否写入 `Verified/`"，卡片明确写来源是"N 名有表决权者一致判真"（6996）；`verifyPrompt` 末尾写"本所宁可留下未定论，也不要一个骗人的结论"（4222–4223）。
- **框架不判忠实性**：`defect` 只是"表决者认定不忠实"的一档落库语义（降级+待办+不定论），不是框架判断（docs/formal-verification.md §11）。
- **过程票数不得驱动流程**：`aggregateOpinion` 永远 `provisional:true`；展示必须带"尚未生效·仅供参考"（6549、6830）。
- **`speechFrozen`（表决期禁止发言）** 属会议平台侧（2886–2896，范围外），本分片只登记其存在。

### 3.8 `[VOTE]` 相关的可调参数一览

| 参数 | 默认 | 上下界/语义 | file:line |
|---|---|---|---|
| `quorumCap` | 3 | `>=1`（`normalizeParams` 强制 9858）；`m = min(cap, Peff)` 且 ≥1 | 1068、2903–2906 |
| `quorumMode` | `'m-unanimous'` | 白名单 `m-unanimous`/`all-unanimous`，非法回落前者 | 1069、9794 |
| `verdictMaxRounds` | 3 | `Math.max(1, floor(...))` | 1073、6814、6824 |
| `reconsiderFloor` | 0 | `>=0`；生效门槛 `= max(before, floor, quorumCap)` | 1070、2719、2830–2832 |
| `activityTimeoutMs` | 120000 | 经 `posMs`（非正回落默认）；`recoverStallMs = 2×` ⇒ 兼作"刚刚定论"去重窗口 | 1082、4249 |
| `formalVerify` | `'off'` | `off|encourage|require`，非法回落 `off`；`require` = 定论门禁 | 1100、4324、6809 |
| `memberMayRejectAssign` | true | 允许对分派提异议（理由广播） | 1066、4018–4019 |

---

## 4. 专章：任务板 CAS DAG 与 成员成果库 / 三索引 的数据形状

### 4.1 任务（`inst().tasks[]`，fold `EV.task` 714–732 upsert by id）

```jsonc
{
  "id": "t-3",                 // fold 内 alloc.next('task') 铸号；ID_PREFIX.task='t-'
  "revision": 4,               // CAS 令牌；每次成功变更 +1（唯一例外见下）
  "subject": "…",              // ≤200
  "description": "…",          // ≤16384
  "status": "pending",         // pending | in_progress | completed | deleted
  "ownerId": "r-2",            // '' = 无主
  "blockedBy": ["t-1"],        // DAG 依赖（全 completed 才 ready）
  "writeScopes": ["Members/r-1/Propos"],  // 归一化（拒绝对/盘符/`.`/`..` 段）
  "priority": 0,               // 非有限数 ⇒ 0；排序主键（降序）
  "createdBy": "office" | "r-1",
  "assignedBy": "academician" | "office" | "r-1",   // 仅 reassign（经 meta）可写
  "why": "…",                  // assign 必填
  "acceptance": "…",           // assign 必填
  "origin": "meeting:mt-5",    // 行动项来源标记（/^meeting:/ 用于 report/overview）
  "due_in": "next-meeting",    // 只能用相对表达；任何 …At/…Ms 键被拒
  "state": "open",             // open | done | handover（显式状态机，绝不自动关闭）
  "resolution_id": "res-2",    // 可选：来源决议（S20；未被取代才可派活）
  "releaseReason": "…",        // 仅 releaseTasksOf（成员除名回收）写
  "createdAt": 0, "updatedAt": 0
}
```

- **阶段机（两张正交的"状态"字段）**：
  - `status`：`pending --claim--> in_progress --complete--> completed`；`in_progress --release--> pending`；`completed --reopen--> pending`；`delete`（有依赖者 ⇒ `V5_TASK_HAS_DEPENDENTS`）⇒ `deleted`（不可再操作，`V5_TASK_DELETED`）。
  - `state`（S15/K4 行动项）：`open --complete--> done`；`--handover--> handover`（无接手人则同时回 `pending`+`ownerId:''`；给接手人则回 `open`+`in_progress`）；`--reopen--> open`。**完成才置 `done`，绝不自动关闭、绝不静默丢弃（G3）**。
  - `reassign`（仅 lead）可在 `pending`/`in_progress` 上换人；`owner` 必须 active 且 `taskReady`。
- **CAS 语义**：`expected_revision` 必填；不等 ⇒ `V5_TASK_STALE_REVISION`（**不写入、不返回新对象**）；相等 ⇒ 写 `revision+1`。**唯一"不升 revision"的写**：`releaseTasksOf`（除名回收）也显式 `revision: t.revision + 1`，所以其实**所有变更都升号**；`taskPrioritize` 同样逐项 `revision+1`（6386）。
- **权限**：`lead = meta.authorized===true || canDo(id,'board').ok || canDo(id,'assign').ok`；`claim` 只需"无主或本人 + pending + ready"；`release/edit/set_dependencies/complete/reopen/delete` 需 owner 或 lead；`handover/reassign` 需 lead。拒绝码：`V5_TASK_UNAUTHORIZED`、`V5_TASK_ALREADY_CLAIMED`、`V5_TASK_INVALID_TRANSITION`、`V5_TASK_BLOCKED`、`V5_TASK_NOT_FOUND`、`V5_TASK_DELETED`、`V5_TASK_DEPENDENCY_CYCLE`、`V5_TASK_HAS_DEPENDENTS`、`V5_INVALID_WRITE_SCOPE`、`V5_INVALID_ARGUMENT`。
- **写域冲突只是"建议"**：`writeScopeWarnings` 用**前缀包含**判定重叠（`scopesOverlap` 471–476）⇒ `Members/r-1` 与 `Members/r-1/Propos` 算重叠；告警进 `taskView` 并写进 `Shared/TaskBoard.md`，**不阻断**任何操作。
- **分派幂等**：同 `origin` + 同 `subject` + 同 owner + 已 `in_progress` ⇒ 直接 `{ok:true,deduped:true}`（不重复建、不重复派）（6330–6334）。
- **人读镜像 `Shared/TaskBoard.md`**（6405–6418）：`- [status] id｜subject｜owner=…｜rev=…｜优先级=…｜可认领`，分派者/理由/验收、依赖、写域告警各占缩进行。**只写不读**，权威在状态文件。

### 4.2 成员成果库（文件面，状态文件里**不存正文**）

```
Members/<成员id>/
├─ Progress/progress.md          # narrative 轨（逐字追加；首次出现分轨索引行）
├─ Progress/{routes,obstacles,rejected,state}.md   # S25-B 分轨（route/obstacle/rejected/state）
├─ Propos/<id>.md                # 命题卡
├─ Methods/<id>.md               # 方法卡
├─ Subproblems/<id>.md           # 子问题卡
└─ SelfReport.json               # G6 自述（node:fs 原子写；不在 fold 里）
```

**卡片头的固定字段（`recordCard` 5911–5925 写盘，`readLibrary` 5949–5960 读回）**：

```
# <命题|方法|子问题>｜<标题>
- 标题: …            - ID: <id>          - 类型: …
- 状态: 未定论|经验|求解中（或 已验证·真/真假、未定论）
- 概率: <clamp01(p).toFixed(2)>          - 价值程度: <clamp01(value).toFixed(2)>
- 动机用途计划: <motive>                 - 记录者: <成员id>
- 记录时间: <ISO>                        - 依赖: []
- 内容指纹: <sha256(kind\n陈述原文\n---\n证明正文)>
## 陈述 / ## 证明尝试 / ## 证伪尝试     （或方法/子问题各自的段落）
```

- **id 约定**：`p-*` / `m-*` / `s-*`（缺省 `prefix + '-' + shortId()`）；`idSafe` 把 `\ / : * ? " < > |` 与控制字符换成 `-`、折叠连续 `-`、去掉首尾 `.`/`-`（11518–11521）⇒ id 变成文件名也**不可能穿越目录**。
- **头部列表（S21 指针面）**：`readLibrary({list:true})` 每张卡只回 `{id, kind, title, fingerprint, status, owner, updatedAt}`，**绝不含正文**；`updatedAt` = 文件 mtime，缺失回退卡片"记录时间"，`0` 表示未知（**未知就说未知，不猜**）。
- **正文只在 `{id:'…'}` 展开时回**；**查不到 ⇒ 具名拒绝**（`ok:false` + 指名 id + `next.kind='expand-by-id'`）。
- **截断一律计数**：`progress.md` 尾 6000（无计数）；四条分轨各尾 2000 且带 `droppedChars`；卡片正文 slice(0,4000)（无 `droppedChars` 字段但固定 4000 上限）。
- **Progress 分轨**：`PROGRESS_TRACKS = {route:'routes', obstacle:'obstacles', rejected:'rejected', state:'state'}`；`track` 非法 ⇒ `V5_INVALID_ARGUMENT`（列出可用值）；写入格式 `### <时间>｜<成员id>\n<正文>`。

### 4.3 "三索引"的两层含义（都已核实）

**(a) 框架维护的形式化三索引**（`rebuildLeanLibIndexes` 5524–5571 + `writeFormalIndex`/`writeFormalTodo`）：

| 文件 | 必需列 | 数据来源 | file:line |
|---|---|---|---|
| `<所根>/Formal/Index.md` | `对象\|状态\|形式化文件\|归档证明\|最近运行\|难度判断/阻塞原因` | `inst().formal` 记录；有 TODO 时追加"形式化待办"节 | 5494–5513 |
| `<vibe根>/Formal/Lib/Index.md` | `名称\|文件\|类别\|摘要\|依赖` | 列目录扫 `Formal/Lib/*.lean`：第一条非注释非 import 代码行（截 110）+ 所有 `import` 行 | 5556–5562 |
| `<vibe根>/Formal/Proved/Index.md` | `名称\|文件\|类别\|陈述\|依赖` | 同上，扫 `Formal/Proved/*.lean` | 5563–5567 |
| 附带：`<所根>/Formal/TODO.md` | `- <对象id>\|<why>\|<时间>` | `inst().todo` | 5514–5523 |

`rebuildLeanLibIndexes()` 额外返回**指针面 cards**：`{name, file, kind, summary, sha256}`，`sha256 = sha256Hex(leanHashText(文件原文))` —— **与 `lean_read` 返回、`lean_archive` 去重用的是同一个内容身份**；Lean 代码正文**永不**进这个面（S21/D1/D3）。全部索引都是**人/代理可读摘要，不是权威状态**（权威在状态文件的 `formal`）。

**(b) 成员成果库的三类卡片目录**：`Propos` / `Methods` / `Subproblems`（kind = `proposition` / `method` / `subproblem`）。这是"成果库"的物理三索引——`readLibrary` 的 `dirs` 数组逐字写死 `[['proposition','Propos'],['method','Methods'],['subproblem','Subproblems']]`（5948），三处读路径（list 模式、按 id 展开、全量枚举）共用它。

### 4.4 反馈库的数据形状（与成果库并列的一套"文件 + 耐久数组"）

```jsonc
// inst().feedback[]（耐久；fold 白名单 625–630）
{ "id":"fb-3", "at":0, "by":"r-1", "category":"process", "route":"interpersonal",
  "status":"open",              // open | adjusted | closed | dropped（未闭环 = open|adjusted）
  "context":"", "phenomenon":"", "impact":"", "action":"",
  "assessment":"",              // route=interpersonal 必填
  "outcome":"",                 // route=interpersonal 且 status=closed 必填
  "note":"", "updatedAt":"", "updatedBy":"" }
// 人读镜像：Shared/Feedback/<category>.md（每类一份） + Shared/Feedback/index.json = {counts, entries}
```

---

## 5. 专章：数学面（引擎探测 / 调用契约 / 结果形状 / 失败语义 / 5027 接缝 / 作业持久化现状）

> 目标 5 的**直接依据**。代码：`math-computation.js`（1481 行，全文读完）+ `math-engines.js`（197 行，全文读完）+ `vibe-math-v5r.js:5027–5222`（接缝）+ `10986–11024`（注册）。契约文档：`docs/math-computation.md`。

### 5.1 能力清单：引擎描述符表（`math-engines.js`）

- `MATH_ENGINE_ORDER = ['python','r','octave','julia','matlab','maple','wolfram','cli']`（12）。
- **P1 注册表 `MATH_ENGINES`**（19–171），每个引擎的字段：
  `{name, phase:'P1', candidates[], versionArgv[], versionRe, scriptArgv[], evalArgv[]|null, ext, probeCode, packageProbe{argv,parse}, license:'free'|'commercial'|'user', argErrorHints[], install{manager,userArgv,systemArgv?,uninstallArgv,managers?,systemUnsupportedReason?}|null, vendor?, verify?, verifyReason?, licenseProbe?, policy?, userInstall{windows,macos,linux}}`。
  | 引擎 | 候选可执行名 | 脚本/表达式模板要点 | 包探测 | 许可 | 安装 |
  |---|---|---|---|---|---|
  | `python` | `python3`→`python`→`py` | `['<script>']` / `-c <expr>`；`.py` | `-c <probeCode> <pkgs...>`（**每包一个 argv**，`importlib.util.find_spec`，每行 `name ok\|missing`） | free | pip/**conda/mamba/uv 分派** + `--user` |
  | `r` | `Rscript`→`R` | `<script>` / `-e <expr>`；`.R` | `-e <probeCode>`（`__PKGS__` 逗号串插进代码） | free | R 用户库 `R_LIBS_USER`；**无 system** |
  | `octave` | `octave`→`octave-cli` | `--no-gui --quiet <script>` / `--eval`；`.m` | `--eval <probeCode>`（`pkg('list')`） | free | `pkg install -forge`；**无 system** |
  | `julia` | `julia` | `<script>` / `-e`；`.jl` | `-e <probeCode>`（`Base.find_package`） | free | `Pkg.add`；**无 system** |
  | `matlab` | `matlab` | `-batch "run('<script>')"` / `-batch <expr>`；`.m` | `-batch <probeCode>`（`license('test',…)`） | **commercial** | `install:null` + 厂商 URL |
  | `maple` | `maple` | `-q <script>` / `-q -c <expr>`；`.mpl` | `-q -c <probeCode>` | **commercial** | `null` + 厂商 URL；**`verify:true`**（CLI 拼写随版本变） |
  | `wolfram` | `wolframscript`→`WolframKernel`→`math` | `-file <script>` / `-code <expr>`；`.wl` | `-code <probeCode>` | **commercial** | `null` + 厂商 URL |
  | `cli` | `[]` + `resolveFrom:'cli.command'` | 由调用方给 argv；`.txt` | —— | `'user'` | `null`；`policy:{requiresMathMode:'typed+shell', requiresEngineInList:true}` |
- **P2 表 `MATH_P2_ENGINES = {sage}`**（174–182）：**P1 不注册 sage**（探测表里只有 P1 会被 `mathEngineCandidates` 用于发现，但 `isKnownMathEngine` 认它）。
- 三个导出函数：`mathEngineCandidates(name)`（`cli` 返回 `null`）、`mathEngineArgErrorHints(name)`、`isKnownMathEngine(name)`（184–197）。
- **`ARG_ERROR_HINTS`**（17）：`unknown option`/`invalid option`/`unrecognized option`/`unrecognized argument`/`usage:`/`Usage:`/`illegal option` —— 引擎以这些字样非零退出 ⇒ 归为 `MATH_ENGINE_BAD_ARGV`（而不是裸 `MATH_NONZERO_EXIT`），并指向 `mathEngineOverride`。
- **占位符纪律**：`<script> <expr> <pkgs> <probeCode> <exe> <pkg>` **每个只替换进一个 argv 元素**；替换是**字符串级**（`String(a).split('<script>').join(abs)`），所以 matlab 的 `run('<script>')` 这类**内嵌**写法也能展开（math-computation.js:783–793）；`<pkgs...>` 展开成**多个 argv 项**（python 探针读 `sys.argv[1:]`），`<pkgs>` 是逗号串（R/Julia/Octave 插进代码）（693–707）。
- **shell 元字符禁令**：探针 argv **不得含 `|`/`%`**（真实宿主会以"空 spawn"拒绝），所以探测代码都改成"每行 `name ok`/`name missing`"，解析器两种形态都吃（math-computation.js:736–755；docs/math-computation.md §5.4）。

### 5.2 引擎探测（发现顺序 + 版本 + 许可）

- **发现顺序（PATH 永远优先）** `resolveCandidate(H,d)`（490–509）：
  1. 宿主 `resolveExecutable(候选名)`（PATH）；
  2. **DSH 自带运行时** `dshRuntimeCandidates`（515–549）：`<root>/dsh-runtimes/<tree>/dependencies/<engine>/<候选名>{,.exe,.cmd}`，树名**通配**、只接受描述符自己的候选名；`<root>` 来自宿主 `runtimeRoots()`（v5r 给的是 `DSH_HOME` 或 `~/.dsh`，**显式设置即隔离发现**）；
  3. **各 OS 已知安装目录** `knownInstallCandidates`（451–488）+ `mathInstallRoots(engine,env,win)`（428–449）：Windows `%ProgramFiles%`/`%LOCALAPPDATA%\Programs`/…、Unix `/usr/local`/`/opt/...`、`~/.juliaup/bin`；**存在性一律靠列目录证明**；宿主可选 `installRoots(engine)` **优先于**内置表（`[]` 视为未提供，回退内置表 —— "JS 空数组是 truthy"的坑，464–466）。支持扁平 / `/bin` / 版本化 `<root>/<ver>` / `<root>/<ver>/bin` / 嵌套 `…/mingw64/bin` 五种布局（477–484）。
- **版本探测** `probeVersion`（566–583）：`argv=[exe,...versionArgv]`，`cwd = probeCwd(H)`（**优先宿主 `probeCwd`，否则 OS 临时目录，最后项目根** —— 全新会话里项目根还不存在，宿主对"cwd 不存在"的 spawn 会返回 `spawned:true, exit:null` 且重试无用，551–564）；超时 20s；从 stdout+stderr 里匹配 `versionRe`；`ok = exit===0 && 匹配成功`；诊断 `{argv[:3], exit, timedOut, ms, spawned, stderrTail[:300]}`。
- **带重试的版本探测** `probeVersionWithRetry`（605–629）：最多 3 次（20s / 45s / 45s + 退避 250/650ms）；**只在看起来像冷启动/空返回**（`timedOut`、`exit===null`、`spawned===false`）时重试，确定性失败（非零退出/无法解析）不重试；诊断经 `jsonSafeDiag`（593–603）投影为**纯字段**（防自引用导致 `JSON.stringify` 抛"circular structure"——那会让调用方什么都看不到）；`attempts`/`retried`/`retryDiag` 一并带上。
- **探测缓存** `probeMathEngines(host, opts)`（395–418）：`PROBE_CACHE = new WeakMap()`，key 是 adapt 后的 host；`opts.refresh` 强制刷新；`params.mathEngines` 之外的引擎不探测；`cli` **不自动探测**（需要调用方给命令）；商业引擎版本探测失败 ⇒ 直接跳过（由 `run` 报 `LICENSE_REQUIRED`）；返回 `{ok:true, engines:[{name,version,path,foundVia,license,…verifyFields}], available}`。
- **许可检查** `checkLicence`（631–639）：非商业 ⇒ `{ok:true}`；商业无 `licenseProbe` ⇒ `{ok:false}`；matlab `okWhen:'trim-1'`（stdout 必须恰为 `1`）、wolfram `'not-unlicensed'`（stdout 不含 `Unlicensed`）、maple `'exit-0'`。
- **`resolveEngine(H, requested, params, args)`（641–690）**：`'auto'` 按 `params.mathEngines` 顺序逐个试；`applyOverride`（813–825）**必须同时作用于版本探测与许可探测**（不只是 script/eval argv —— AUDIT-B HIGH）；不在 `mathEngines` 白名单 ⇒ `MATH_REFUSED` + `next.reason='engine-not-allowed'`；`cli` 分支：策略检查（`mathMode` 必须 `typed+shell`、`cli` 必须在 `mathEngines`）、`cli.command` 必须可解析（否则 `MATH_ENGINE_NOT_FOUND` + 用户安装指引）、**按可执行文件 basename 推断族**（`engineFamilyForExe` 800–807）以复用该族的版本探测与包预检；找不到任何引擎 ⇒ `MATH_ENGINE_NOT_FOUND`，消息列出试过的名字，`next` = 逐 OS 安装指引（**按"请求的那个引擎"给指引**，299–301 的修复）。
- **`opProbe`（927–987）**：`refresh` 走 `packages:['refresh']`；**"probe 指定了某个引擎就必须描述那个引擎"**（不再回显 python，931–938）；包预检走 `familyProbeDet`（cli ⇒ 用家族的描述符；族不可识别 ⇒ 跳过预检并给 `precheckSkipped`）；返回 `{ok,op:'probe',engine,engineInfo,engines,available,packages,configured,absent[],message}`，`absent[]` 每项带 `why`（`not-found-on-this-machine` / `needs-a-caller-supplied-command`）。

### 5.3 调用契约（工具面）

- **工具名**：`math_computation`（`MATH_TOOL_NAME`，13）——**刻意无 `vibe_` 前缀**，四套预设同一原语。
- **参数（15 个，`MATH_TOOL_SCHEMA` 132–160 + `ALLOWED_ARGS` 213）**：`op`（必填：`probe|run|receipt|install`）、`engine`、`mode`（`code|file|expr`）、`code`、`file`、`expr`、`packages[]`、`timeoutMs`、`captureFiles[]`、`record`、`cli{command,argv?,stdin?}`、`scope`（`user|system`）、`dryRun`、`confirm`、`mathEngineOverride{<engine>:{versionArgv?,scriptArgv?,evalArgv?,packageProbe?}}`；`additionalProperties:false` ⇒ 未知键 `MATH_INVALID_ARGUMENT`。
- **`validateMathArgs`（232–294）**：闭合校验 + 交叉校验 —— `timeoutMs` 必须 `>=1000`；`packages` 每项过 `parsePackageSpec`（拒绝空格/`;`/`|`/`&`/`$`/反引号/`@`/括号等 ⇒ `unsupported-version-syntax`）；`cli` 只允许 `command/argv/stdin` 且 `command` 必填；`op='run'`：`mode` 必填、`engine='cli'` 的三条策略（`mathMode`、在列表、必须有 `cli{}`、**不支持 `mode='expr'`**）、`mode='file'` 的路径必须项目内、`mode='code'`/`'expr'` 必须有对应字段；`op='receipt'` 必须给 `file`；`op='install'` 必须有非空 `packages`。
- **`op='run'`（1000–1226）**：解析引擎（含 override）⇒ 包按 **base name** 存在性预检（`probePackages` 709–757，最多 3 次重试；**预检跑不起来不判缺包、不阻塞**，给 `PACKAGE_PRECHECK_UNKNOWN`）⇒ 缺包 ⇒ `MATH_MISSING_PACKAGES`（**不产生回执目录**，带 `missing/next(agent-install)/packages/versionPolicy/constraintsNotEnforced`）⇒ 组装 argv（`assembleArgv` 760–794；`cli` 会**自动把归档脚本绝对路径追加到 argv 末尾**，但调用方 argv 自带 `-c/-m/-e/--eval/--command` 时**不追加**并在回执里给 `scriptSkipped` 理由）⇒ **在 `withArchiveLock(baseDir)` 内**分配 attempt、写脚本、run、重新哈希源文件、写 stdout/stderr、captureFiles 副本、算 warnings、写 `receipt.json`+`receipt.md`、写群聊日志。
- **结果形状（成功 `shell`，1161–1184）**：`{ok:true, op:'run', engine:'<name>'|'cli:<cmd>', mode, runId, attempt, versionPolicy, constraintsNotEnforced[], engineInfo{name,path,version,source,foundVia}, argv[], scriptPath, scriptHash, scriptAbs, cwd, attemptDir, baseRunDir, scriptChanged, scriptChangedDuringRun, sourceFile, fileIsArchivedScript, partialStdout(尾2000), partialStderr(尾2000), previousReceipt{runId,attempt,scriptHash}, cliScriptAppended, packages{found}, exit, timedOut, ms, stdout(≤64KB), stderr(≤64KB), truncated{stdout,stderr}, artifacts[{path,sha256,bytes}], receipt{dir,json,md,sha256}, warnings[]}`。
- **`receipt.json` 字段**（1119–1154）：`schema:'vibe-math/math-computation-receipt@1'`、`runId/preset/project/op/mode/attempt/attemptDir/baseRunDir`、`engine{name,path,version,source,foundVia}`、`script{path,sha256,bytes}`+`scriptPath`+`scriptHash`+`scriptAbs`+`cwd`、`sourceFile`、`fileIsArchivedScript`、`partialStdout/partialStderr`、`sourceHashBefore/After`、`scriptChanged/scriptChangedDuringRun`、`previousReceipt`、`argv`、`packages{requested,found}`、`versionPolicy`、`constraintsNotEnforced`、`exit/timedOut/ms`、`truncated`、`artifacts`、`captured[]`、`network:'not-enforced-by-plugin'`、`warnings[]`、`determinism{inputSha256,packagesSorted:true,noWallClockInId:true}`、可选 `cli{command,argv,stdinUsed,scriptAppended,scriptSkipped}`。
- **`op='receipt'`（1232–1287）**：`file` 是 `Computation/<id>[/attempts/<n>]` 或 `<id>`；目录/receipt 不存在 ⇒ `MATH_REFUSED` + `next.reason='archive-missing'`；JSON 不可解析 ⇒ `MATH_INVALID_ARGUMENT` + `'receipt-unparsable'`；**重新哈希归档脚本**并与记录比对 ⇒ `scriptChanged`（**归档脚本丢失也算 changed**，fail-closed：`currentHash:null`）；只补写**缺失**的 `receipt.md`，**从不改写既有数据**。
- **`op='install'`（1294–1369）**：商业引擎/无 install 模板 ⇒ `MATH_REFUSED` + 厂商指引；`scope` 只对当次生效；先用 `mathEngineCandidates` 解析真实解释器路径；python 走 `detectPythonManager`（1392–1410：路径含 `/envs/|/conda|/miniconda|/anaconda|/mambaforge|/miniforge` 且 conda/mamba 可解析 ⇒ conda/mamba；`uv` 与解释器**同目录** ⇒ uv；否则 pip 且 `assumed:true`）；无 system 模板 ⇒ `MATH_REFUSED` + `systemUnsupportedReason`；**两步确认**：无 `confirm` ⇒ 返回 `plan`+`planToken = sha256({engine,packages,scope,commands}+'|planVersion=1').slice(0,32)`；`confirm !== planToken` ⇒ `MATH_REFUSED` + `'plan-token-mismatch'`；执行后写审计 `Computation/installs/<planToken>.json`（含 `rollback.commands` 卸载模板，`supported:'partial'`、**不做自动回滚**）；失败**不新增失败码**而是 `op:'install'` + `installedSoFar` + `timedOut`。

### 5.4 结果形状：回执目录（归档是**追加式**的）

```
<研究所根>/Computation/<runId>/
├─ script.<ext>            # 唯一权威源码（先落盘再执行）；cli ⇒ script.txt
├─ stdout.txt / stderr.txt # 完整输出（返回体只给 ≤64KB 截断版）
├─ receipt.json/receipt.md # 机器可读 + 人读
├─ captured/<项目内相对路径>  # captureFiles 的副本
└─ attempts/<n>/…          # n≥2：同一 runId 的后续 attempt（首次绝不覆盖）
```

- `runId = <designator>-<projectSlug>-<sha256(engine|mode|key|pkgs.sorted)[0:12]>`，`designator='vibe-math-v5r'`，`projectSlug = slug(instRoot())`。
  **key 的规则（P2a N1）**：`mode==='file'` ⇒ `'file:'+fileRel`（**按源路径**）；`mode==='code'/'expr'` ⇒ `canonical(scriptText)`（按内容）。⇒ 编辑**同一个源文件**重跑落在**同一个 runId 的 attempt≥2**（带 `scriptChanged:true` + `previousReceipt`），指向**归档副本本身**则是**新 runId、attempt 1、无历史**（`fileIsArchivedScript:true` + `ARCHIVED_SCRIPT_RERUN` 警告说清"这不是同一归档的新 attempt"）（828–835、1037–1050、1110–1111）。
- `canonical(s)`：CRLF→LF、去行尾空白、去尾部空行、补一个 `\n`（165）；`noWallClockInId:true`（回执里显式声明 id 不含墙钟）。
- **保留上限（只告警，永不自动删除）**：`MATH_ARCHIVE_MAX_ATTEMPTS_PER_RUN=20`（每 id）、`MATH_ARCHIVE_MAX_RUNS=200`（每项目，仅当宿主提供可选 `listDir` 时检查）；超限 ⇒ warning `ARCHIVE_RETENTION_EXCEEDED`（63–65、881–894）。
- **并发**：同一 runId 的"分配 + 占用（写 receipt.json）"由 `withArchiveLock(key)` 的**进程内 promise 链**串行化（847–855）⇒ 两个并发同 id 分别拿到 attempt 1/2；**跨进程并发仍需宿主独占创建原语（当前 fs 接口没暴露）—— 已知限制**（注释 840–846）。

### 5.5 失败语义（11 个冻结失败码 + 7 个 `next.kind` + 13 个 `next.reason`）

- **`MATH_FAILURE_CODES`（43–55，冻结）**：`MATH_NOT_AVAILABLE`（`mathComputation:'off'`）、`MATH_ENGINE_NOT_FOUND`、`MATH_ENGINE_LICENSE_REQUIRED`、`MATH_ENGINE_UNUSABLE`、`MATH_MISSING_PACKAGES`、`MATH_TIMEOUT`、`MATH_NONZERO_EXIT`、`MATH_ENGINE_BAD_ARGV`、`MATH_REFUSED`、`MATH_INVALID_ARGUMENT`、`MATH_NO_SUBPROCESS`。
- **`fail(code,engine,message,extra)`（311–329）** 只搬运白名单字段：`next/argv/receipt/missing/engines/available/configured/absent/packages/probe(经 jsonSafeDiag)/versionPolicy/constraintsNotEnforced`。
- **`next.kind` 7 种**：`user-install`、`agent-install`、`vendor`、`enable`、`engine-override`、`reason`、`note`。
- **"没有 subprocess 服务"与"没有引擎"是两件事**：宿主可选 `hasSubprocess()===false` ⇒ 一律 `MATH_NO_SUBPROCESS`（1428–1432）；否则解析不到 ⇒ `ENGINE_NOT_FOUND`+安装指引，解析到但 `spawn` 返回 `null` ⇒ `NO_SUBPROCESS`（math-computation.js:1093；v5r 侧 `mathSpawn` 返回 `null` 同理 5109–5111）。
- **超时**：`MATH_TIMEOUT` 携带与 `NONZERO_EXIT` **同样**的证据字段（`argv`/`receipt`/`exit:null`/`stdout`/`stderr`）+ `timedOut:true`；部分输出**进持久回执**（`partialStdout/partialStderr` 各取最后 2000 字符）（1185–1193、1131–1134）。
- **引擎用法错**：命中 `argErrorHints` ⇒ `MATH_ENGINE_BAD_ARGV` + 回显 argv + `next.kind='engine-override'`（指 `mathEngineOverride`）（1194–1208）。
- **JSON 可序列化是横切不变量**：所有响应必须能 `JSON.stringify`（round-7 回归：自引用诊断曾让调用方什么都看不到）（593–603）。

### 5.6 `vibe-math-v5r.js:5027` 接缝（宿主侧）

已在 §1.16 逐条列出。这里给**接缝能力的因果表**（哪些模块行为由哪个宿主字段决定）：

| 模块需要 | v5r 提供的字段 | 缺省/失败行为 |
|---|---|---|
| 项目根（回执落点、cwd） | `projectRoot:()=>instRoot()` | 必需（`adaptHost` 缺者 throw，366–367） |
| 参数（六项） | `params:()=>Object.assign({},params)` | 必需 |
| 文件读写/存在性/列目录 | `writeText/readText/exists/listDir` | `listDir` 可选 ⇒ 缺少时**只跳过项目级保留上限**，per-run 上限仍生效 |
| 可执行解析 | `resolveExecutable` | 必需（缺失 ⇒ 模块 throw，被 `registerMathComputation` 的 try/catch 变 `MATH_INVALID_ARGUMENT`） |
| 子进程 | `spawn` | 必需；返回 `null` ⇒ 模块视为 `MATH_NO_SUBPROCESS` |
| 是否根本无子进程 | `hasSubprocess` | 可选；提供 `false` ⇒ 探测前就报 `MATH_NO_SUBPROCESS` |
| DSH 自带运行时发现 | `runtimeRoots` + `listDirAbs` | 可选；缺失 ⇒ `[]`，行为回落到"已知安装目录"阶段 |
| 每 OS 已知安装根 | `installRoots`（**可选**） | 未提供 ⇒ 模块用**自己进程**的 `ProgramFiles/LOCALAPPDATA`（v5r **不提供**该字段 ⇒ 本机环境参与发现） |
| 探测 cwd | `probeCwd`（**v5r 不提供**） | 回退 OS 临时目录，再回退项目根 |
| 日志 | `log:'mathLog'` | v5r 把每次 run 写进群聊 `【计算】…` |

**关键接缝事实**：`mathSpawn` 的 stdio 上限**刻意放大**到 `max(MATH_CAPS.stdout, stdoutCap || MATH_CAPS.file)`（`MATH_CAPS = {stdout:64KB, stderr:64KB, file:4MB}`），因为**模块要把完整输出落盘、只有返回壳才截到 64KB**（5081–5083）；路径在接缝**再守一遍**（`mathRelPath`，防模块守卫回归）。

### 5.7 特别标注：**作业持久化 / 断点续算**的现状（目标 5 的核心结论）

**结论：`math_computation` 完全没有作业持久化，也没有断点续算；有的只是"追加式归档 + 失败关闭"的**证据**持久化。**逐条举证：

| 维度 | `math_computation`（数学计算） | `Lean`（形式化，同仓对照） |
|---|---|---|
| 是否有作业队列 | **无**。`op='run'` 在**一次工具调用内同步** await 子进程（1000–1226），调用方被阻塞到进程结束或超时 | **有**。`leanJobs` 内存队列 + `Formal/Jobs/<jobId>.json` 镜像 + `leanJobsMaxParallel` 并发（4587–5025） |
| 是否有持久作业记录 | **无**。只有**回执**（终态产物）：`Computation/<runId>/attempts/<n>/receipt.json` | **有**。每次状态变化写镜像，四态 `settled/failed/timeout/interrupted` |
| 崩溃/重启后能否续算 | **不能**。没有"未完成作业"的概念：进程死了，这次 run 的 `receipt.json` 根本没写出来（脚本/stdout 可能已写），`op='receipt'` 读不到就报 `archive-missing` | **能**（受限于镜像）。`recoverLeanJobs()`：`queued` 重入队；`running/interrupted` + 哈希匹配 ⇒ 重入队（attempts+1）；`settled+hash 匹配` ⇒ 补写归档与 `passed`；不匹配 ⇒ `failed` + "不自动重驱"（4915–4966） |
| 中间态持久化（断点） | **无**。没有任何 checkpoint/partial-state 写盘；长计算中途被杀 ⇒ 无任何进度记录 | **部分有**：作业 `state/attempts/startedAt/settledAt/exitCode/run.stderrTail` 都是耐久断点信息；`partialStdout`/`partialStderr` 只在 math 侧有 |
| 超时后的证据 | **有**：`partialStdout/partialStderr`（各尾 2000）+ stdout/stderr 全文落盘 + `timedOut:true`（1131–1134、1185–1192） | 有：`run.stderrTail`（800）+ 群聊行 |
| 重跑语义 | 靠**同 runId 的新 attempt**：编辑源文件再 `mode:'file'` ⇒ attempt≥2，`scriptChanged:true`、`previousReceipt` 指向上一次；**永不覆盖旧 attempt**（1056–1075） | 靠 `deduped`（内容+构建上下文一致则跳过）与 `attempts+1` |
| 并发保护 | **进程内** `withArchiveLock`（同 runId 串行）+ 明确的**跨进程缺口**（需宿主独占创建原语，840–846） | 队列天然串行/按 `leanJobsMaxParallel`；镜像写入 best-effort |
| 去重 | **无作业级去重**（同一计算重复跑就是新 attempt，这是**有意**的：每次运行都要独立回执） | **有**：`leanLibArchivedOk(name,sha)` + 构建摘要（4614–4629） |

**"缺什么"清单（可直接作为目标 5 的差距项）**
1. **没有异步/后台计算作业**：一次 `op:'run'` 就把成员的一轮工具调用占满到 `mathTimeoutMs`（默认 60s）；没有 `math_job{jobId}` 之类的查询面，也没有"入队即返回"。
2. **没有作业镜像与恢复扫描**：即没有 `Computation/Jobs/*.json` 这类文件，也没有 `recoverMathJobs()` 的对应逻辑。
3. **没有断点/续算原语**：长任务（大规模数值/符号计算）既不能保存中间状态，也不能从上一 attempt 继续；只有"重跑整段脚本"。
4. **没有抢占/取消语义**：没有 `jobId` 级的 terminate；只有超时（`cap` 到点 `handle.terminate()`）；会话 dispose 不终止在跑的 math 子进程（`disposeLeanJobs` 只覆盖 Lean，5005–5025；math 侧 `mathSpawn` 的 handle 只活在那次调用内）。
5. **没有跨进程归档独占**：并发写同一 runId 的 attempt 分配依赖宿主提供独占创建原语（当前 fs 接口未暴露）。
6. **清理/保留只有告警**：20 attempt / 200 run 只是 warning，永不删除，长期运行会无界增长（对"作业持久化"的运维面是缺口）。

### 5.8 numpy / scipy / pandas / sympy 适配的现状（逐字核实）

- **代码里没有任何针对 `numpy`/`scipy`/`pandas`/`sympy`（或 `matplotlib`/`sklearn`）的分支或特判**。全仓 grep 这四个名字，代码侧**唯一命中**是 `math-engines.js:30` 的一句注释（说明 python 探针必须"每包一个 argv"，否则会把 `numpy,pandas` 当成一个包名）——即：**它们被当作普通包**。
- 因此"适配"实际由**三条通用机制**承担：
  1. **包存在性探测**：`packages[]`（调用级）或 `mathPackages`（所级）⇒ `buildProbeArgv` + 引擎自带 `probeCode`；python 用 `importlib.util.find_spec`（**能发现已安装但未 import 的包**），R 用 `requireNamespace`，Julia 用 `Base.find_package`，Octave 用 `pkg('list')`，MATLAB 用 `license('test',…)`。
  2. **版本策略：只查存在，不校验版本**（`MATH_VERSION_POLICY`：`version-constraints-are-existence-only: 只按 base name 检查是否存在，约束本身从不校验；只检查是否存在；版本求解交给包管理器`）——`numpy>=1` 这类规格**只按 base name 探测**，规格原样透传给安装命令；响应与回执都带 `versionPolicy` 与 `constraintsNotEnforced[]`（**绝不静默丢弃约束**）（305–309、1012–1014、1141–1143）。
  3. **安装只出计划/指引**：缺包 ⇒ `MATH_MISSING_PACKAGES`（**不产生回执目录**），`next.kind='agent-install'` 带 `{engine,packages,specs,dryRun:true}`；真正执行要 `op='install'` 两步确认（plan→planToken→confirm）；python 还会按 conda/mamba/uv/pip 分派（§5.3）。
- **真实引擎验证记录（文档侧，非本分片实测）**：`docs/math-computation.md` §6 记："python 3.12.10（用户级安装）+ R 4.6.1（机器级、不在 PATH）已在真机验证；`numpy/pandas/sympy/scipy/matplotlib/mpmath` 经 TUNA PyPI 安装"；Octave/Julia/商业模板未验证。**读者须注意：这是文档声明，不是本分片复跑的结论。**
- **结论（供目标 5）**：现状是"**通用包探测 + 存在性策略 + 计划式安装**"，**不是**"针对科学计算栈的深度适配"（没有 import 注入、没有 dtype/精度协商、没有符号→数值降级路径、没有结果结构化解析、没有内存/大矩阵策略、没有 `sys.executable` 与 venv 绑定校验）。要让 numpy/scipy/pandas/sympy 真正"好用"，需要补的是**结果形状契约**（结构化返回）与**会话级解释器/环境绑定**，而不是再加一个包名列表。

---

## 6. 专章：框架能力需求清单（若要在一个通用框架里复现 v5r）

逐条列"机制 → 需要框架提供什么原语"。**粗体**是 v5r 里靠宿主（DSH）提供、框架自身无法模拟的能力；其余都可以在框架内实现，但**必须显式提供**，否则对应机制会退化成提示词纪律（不可强制）。

### 6.1 耐久层（一切其他能力的地基）

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F1 | **事件折叠（event-sourced fold）**：`commit(type,data) → 新状态`，同一 type 的所有写入串行；非法/异常事件**不得中断后续读** | 全部：成员/任务/消息/会议/辩论/verdict/formal/queue/solve/progress | 纯函数；返回**新顶层引用**（按 `Object.is` 比较）；异常写 diagnostics 后继续 |
| F2 | **键白名单 + 函数式变更**：每类事件只接受一份显式字段白名单；白名单项可传函数以在 fold 内做 read-modify-write | institute 的 22 个键（597–692）；`formal.record/todo`、`queue`、`paper`、`feedback`、`grants`、`ballots`、`formalProofs`、`resolutions`… | **漏写白名单 = 静默丢弃**（v5r 已三次踩坑并留注释）；函数式变更是"同 tick 两写不互吞"的唯一手段 |
| F3 | **fold 内 id 分配器**：`alloc.next(kind)` 与对象创建在同一 commit 内 | `t-N`、`mt-N`、`msg-N`、`r-N` | 读侧**不得**提供 id 预览（旧形状导致两个同 tick 创建铸出同一个 `t-N`，6128–6132） |
| F4 | **CAS 令牌（revision）**：对象带 `revision`，变更必须带 `expected_revision`，不匹配返回**专属错误码**且不写 | 任务板（6161–6178） | 必须有"具名 stale"错误码 + 中文可读消息 + "先读后写"的 next 提示 |
| F5 | **快照式持久化 + 载入失败拒写**：整状态写文件；**载入失败的文件绝不被覆写**；写失败要计数并在表面可见 | 状态文件 `State/<所>.v5state.json`（902–916、1474–1511） | 写失败无法回滚 ⇒ 必须可观测（v5r 用 diagnostics + `stateWriteFailures`） |
| F6 | **耐久标记表**：用于跨重启"只做一次"的承诺 | `meetingOpen`、`stallNotice`、`officeRequestsDropped`、`verifiedRecently`（内存，故非此列） | v5r 明确区分：能持久的承诺必须持久（如"静止最多提示一次"），不能持久的**不得**对外承诺 |
| F7 | **有界台账（LRU/cap）**：整快照每写一次都很贵，历史数组必须封顶并**计数丢弃量** | `delivered`(500)、`meetings`/`debates`(200)、`officeRequests`(10 + 计数)、成员录制的分轨截断 | **截断必须可观测**（"显示最新 N / 累计丢弃 K"），否则被读成完整 |

### 6.2 子代理生命周期（本分片最依赖宿主的层）

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F8 | **可续会话的子代理**：`startContinuable({prompt,parent,persona,agentOptions,toolFilter,signal}) → {childId}` | `spawnMember` | 能在一个"成员"名下多轮续跑；`agentOptions`（provider/model 覆盖）与 `persona` 分槽 |
| F9 | **向子代理投递**：`sendMessage(rootAgent, childId, blocks, {signal})` | `wakeMember`、会议/验证/心跳唤醒 | **服务级**方法（不是 Agent 方法）；缺它必须能**显式检测并报错**（v5r 用 `typeof !== 'function'` 硬挡，3918） |
| F10 | **回合结束事件带 `childId` + `stopReason`** | `onMemberEnd`：回执归因、`pendingWork` 清理、compaction | 回执必须能匹配到**发起这一轮的 token/kind**（v5r 用 `inflight` Map 修"kind 被后一次唤醒覆盖"，1213–1218） |
| F11 | **在活子代理上限可探测**：宿主拒绝时能识别出"这是上限"而非普通错误 | `spawnMember` 的 `ACTIVATION_LIMIT_REACHED` 归一化 | 必须把宿主的不透明字符串**翻译成具名参数 + 读数**（3821–3829） |
| F12 | **工具过滤与未注册名容错**：`tools.restrict` 对未注册名会 throw，需能从错误里解析"宿主已注册的工具名"并只保留它们重试 | `startWithToolFilter`（9711–9726） | 不得降级为"不带过滤启动"（那会扩大成员权限） |
| F13 | **卸载/dispose 钩子集合**：会话销毁时逐个调用 | `disposeLeanJobs` 注册 5025 | 卸载必须能终止在跑的**外部进程**（见 F17） |
| F14 | **真实资源读数**：RSS、在活子代理数 | `memoryCeilingMb` / `maxLiveChildren` 硬门（3766–3771） | 读数要进可观测面（`status().debug`），否则"为什么不再新建成员"不可解释 |

### 6.3 定时与并发控制

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F15 | **可注销的定时器**（`ctx.timeout(cb,ms) → disposer`） | 心跳、digest、Lean drain、Lean/math 超时 race | 每个定时器都必须有 disposer 并在**所有分支**清理（v5r 反复强调"disposer 在两种结果里都跑"） |
| F16 | **调度 trampoline**：单一 `scheduleNext()` 入口 + 去重标志，避免递归/并发重入 | 心跳、digest、proposal 触发 | 一次调度 pass 里"错过的触发"必须能被下一次补上（v5r：`maybeQueueVerify` 里"不能只靠一个已在飞的 pass"，6698–6703） |
| F17 | **子进程服务**：`resolveExecutable` + `spawn({argv,cwd,stdio:{maxBytes},graceMs,stdin}) → handle{done,collected.*.readFrom,terminate,stdin}` | Lean 编译队列、math 计算 | **超时必须真的 terminate**（`graceMs` 只是请求）；stdout/stderr 用 `maxBytes` 上限；`spawn` 可能返回 `null`（会话早期）⇒ 调用方必须把它当"无子进程"处理 |
| F18 | **锁/互斥骨架**：同一资源只允许一个收束在飞 | `finalizeLock`（验证/会议）、`beginLock`（开启验证）、`withArchiveLock`（同 runId 归档）、`chatChain`（群聊镜像串行） | 锁必须在 `finally` 释放，且**不得**把链式后续吞掉（6793–6796） |
| F19 | **跨进程独占创建**（**v5r 缺失**） | math 归档 attempt 分配 | 当前 fs 接口没有暴露 ⇒ 只能进程内串行；框架若要做"作业级"持久化必须补这个原语 |

### 6.4 提示词管线

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F20 | **运行时可变的 persona / 每轮提示词分离**：章程（persona）入职冻结；**所有随参数变化的文本必须在构造提示词那一刻现算** | `formalVerify`/`leanInitiative`/`pointerPropagation`/`resourceSelfCheck`/数学可用性行 | 写进 persona 就等于"切档后成员还读旧指令"（docs/formal-verification.md §1） |
| F21 | **共享文本块的单一来源 + 漂移守卫**：跨预设/跨模块共用的规则文本必须由同一常量给出，并在运行时校验它仍出现在最终文本里 | `MATH_RULE_LINES`/`MATH_ARCHIVE_WORKFLOW_LINE`/`MATH_SUBSTITUTION_RULE_LINE` 的四条守卫（5191–5200）；`MATH_TOOL_DESCRIPTION` 漂移守卫（11008–11010） | 守卫失败只能 `console.error`（不能中断提示词构造） |
| F22 | **回执契约必须是"行为断言"而不是措辞**：提示词里承诺的字段必须真的被解析入库 | `formal` 字段（9420–9483）；`vote_solved`（9564）；`reject_assign`；`record`；`task_*` | v5r 的教训原文：v2 首版只在提示词写了 `formal` 字段，框架从不解析，"177 条断言全绿却守着一个死通道" |
| F23 | **结构化回执解析的容错**：JSON 围栏/整段/最外层 `{}` 三级回落；非法票值不得静默变 0.5 | `parseReply`（11556–11578）、`normVerdictNumber`（9348–9359） | "引用数字/`TRUE` 字符串"这类常见形态要显式支持，否则成员以为投了票而实际没有 |
| F24 | **身份推导必须"派生而非猜测"**：调用者身份（成员 id / 所办 / 不可识别）必须由会话谱系导出；无身份时**具名拒绝**，绝不冒充 | `memberIdOfAgent`/`isProvablyOffice`/`officeCaller`（3933–3971）、`memberDiagnosis`（2959–2975） | 空串必须 fail-closed（v5r 的 L6 修复：空串曾被当成"每个无主任务的 owner"、"每个 office-only 工具的所办"） |

### 6.5 共识/表决引擎

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F25 | **门槛单一来源函数**：`m = f(有效分母, 上限参数)`，所有视图（状态/报告/花名册）**读同一个快照** | `quorumMFrom`/`rosterSnapshot`/`quorumView`（2903–2953） | 门槛**不得**硬编码在消息里；非法参数一律钳制（`quorumCap>=1`） |
| F26 | **票型枚举与语义分离**：赞成/反对/显式弃权/无法判断/未表态**五种分开记账**，且"沉默绝不折算" | `aggregateOpinion`（6557–6587）、`castVerdict`（7014–7067） | `abstain`（计入已投、不计选项）与 `estimates`（0<p<1，计入平均）**不得同名同义** |
| F27 | **计量与裁定分离**：过程票数只能产出 `provisional:true` 的描述；产出结论必须显式传"辩论为何结束" | `aggregateOpinion` vs `judgeVerdict(vs, endedBy)`（6557–6625） | **忘记传 `endedBy` ⇒ 一律 undecided**（fail-safe）；过程展示必须带"尚未生效"警示 |
| F28 | **有界兜底必须具名且可撤销**：任何"自动结束"都要带 `{name, why, at, revocable}` 并广播 | `bound:idle`（6755–6772）、`bound:round-cap`（6814–6815）、`boundOf`（6548） | 不得有"隐式收束"；收到该触界的对象不进"刚刚定论"去重窗口，任何成员可重新提议续期 |
| F29 | **收束的单一盖章点**：少数意见/门槛/生效时点在一个写入口自动盖，四条收束路径全覆盖 | `putVerdict → sealRecord`（1529、2721–2732） | 盖章要**幂等**（`sealed` 标志）；少数意见定义要写死（弃权/无法判断/未表态**不算**少数意见） |
| F30 | **复议（只能升门槛）**：资格**由记录派生**（有胜方 ⇒ 胜方之一；无胜方 ⇒ 任一参与者）；每轮一次；旧结论/旧票面 **append-only** 留档并标 `supersededBy` | `reconsiderTool`（2742–2864）、`raisedThresholdOf`（2734、6595–6597） | **不得以"没有胜方"拒收复议**（D5a）；不得无限复算（受 `verdictMaxRounds` 限） |
| F31 | **原子队列（append/take 都在 fold 内）**：proposal 的查重与入队、取头与删除必须是一个原子步 | `appendToQueue`/`takeQueueHead`（6631–6654） | 修的是"同 tick 两个提议只留一个、两边都报 ok"的丢提议竞态 |
| F32 | **"刚刚定论"去重窗口 + 单一收束锁** | `verifiedRecently` + `recoverStallMs`（6687–6690、6951–6952）、`finalizeLock`/`beginLock`（6796、6917–6934） | 双收束会产出重复的 Verified 卡与重复辩论记录 |
| F33 | **门禁只能加在"唯一收口点"** | `require` 门禁加在 `continueVerifyRound` 的 `closeVerify` 之前（6801–6813）与 `endVerify`（7345–7351）；`finalizeUndecided` 不受影响 | 门禁必须**记 undecided + 待办**而不是卡死（docs/formal-verification.md §8） |
| F34 | **"谁有资格开启辩论"的可配置身份判据** | S25-C：仅院士可 `propose_verify`；对象必须已 `formalProofs[t].locked && status∈{proved,disproved}` | 同一判据在**提议侧与开启侧各查一遍**（防御纵深，6681–6686、6709–6714） |

### 6.6 任务板 / 成果库

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F35 | **DAG 校验（自环/重复/缺失/整图环检测）** | `validateDeps`（6069–6098） | 校验必须在 **fold 内、用最终 id** 执行，失败返回 null 让 fold 不写 |
| F36 | **显式状态机 + 拒绝非法迁移**：`pending/in_progress/completed/deleted` 与 `open/done/handover` 正交 | `taskUpdate`（6161–6292） | **绝不自动关闭**；责任人缺失 ⇒ `handover` 不静默丢弃 |
| F37 | **行动项幂等键**：同一来源 + 同一 subject + 同一 owner ⇒ 不重复建/不重复派 | `taskAssign`（6324–6337） | 幂等要返回 `deduped:true`，让调用方可区分"新派"与"复用" |
| F38 | **内容指纹（id 之外的稳定身份）**：跨对象引用只持 `id + 一行标题 + 指纹 + 状态`；正文按需拉取；读数**回读**而非重算 | `contentFingerprint`（362–365）、`readLibrary({list:true})`（5932–6059） | 指纹只覆盖内容（不含标题/时间）；**悬空 id 必须具名拒绝** |
| F39 | **写域建议（advisory，不阻断）**：前缀重叠判定 + 告警面 | `writeScopeWarnings`/`scopesOverlap`（4288–4299、471–476） | 必须明确"advisory"，否则会被误当锁 |
| F40 | **人读镜像与权威状态分离**：镜像只写不读、勿手改、头部写明权威位置 | TaskBoard.md / Institutes.md / Formal 索引 / Shared/Feedback / Shared/Chat / Debates | 镜像丢失或手改**不得**影响语义 |

### 6.7 形式化 / 外部工具链

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F41 | **路径守卫（词法归一 + root 包含）**：任何"执行/读取用户给的路径"都必须先归一化并证明在根内 | `leanAbsPath`（4379–4394）、`mathRelPath`（5032–5042）、`projectRel` | **`startsWith` 不够**（`..` 能绕过）；显式拒绝绝对路径/盘符/越界 |
| F42 | **后台作业队列 + 耐久镜像 + 恢复扫描** | Lean：`enqueueLeanJob`/`runLeanJob`/`leanWriteJob`/`recoverLeanJobs`（4715–4966） | 镜像必须**每次状态变化**都写；恢复必须四分支（queued/running/settled/其它）且**绝不静默把对象验证掉** |
| F43 | **settle 判据三元组**：`exit 0` + **内容哈希未变** + **构建上下文未变** | `runLeanJob`（4763–4774）；`leanApplySettle` | 只有三元组全真才允许置 `passed`/写归档；否则 `attempted` + 明确 note |
| F44 | **一键式公告（one-shot notice）**：结算结果只在"发起者下一轮提示"出现一次；非 active 成员的待发通知要剪掉 | `leanQueueNotice`/`takeLeanNoticesFor`（4845–4871） | 公告**不补发**是承诺 ⇒ 必须同时给**长期查询路径**（镜像 + `lean_job`） |
| F45 | **去重（内容 + 构建上下文）** | `leanLibArchivedOk`（4614–4629）、`leanArchive` 的 dedupe（5671–5676、5724–5728） | 去重判据必须与 settle 判据同源；不重编译 |
| F46 | **外部工具解析顺序 + 可观测**：显式 → PATH → 已知安装位置；失败时 `next.tried` 点名探测过的路径 | `resolveKnownTool`（93+） | "装了但不在 PATH"是**最常见**的真实情形；不得只说 "not found on PATH" |
| F47 | **能力探测 + 两步安装（plan/token/confirm）+ 审计** | `math_computation op='probe'/'install'`、`detectPythonManager`、`Computation/installs/<planToken>.json` | 商业引擎**永不代装**；system 作用域**永不记忆**；无通用回滚要如实声明 |
| F48 | **"作业持久化"的显式等级**：框架必须能表达"这不是持久任务系统" | Lean 队列（docs/formal-verification.md §11）；math **完全没有** | 若要支持断点续算，需要 F42 + **F19（跨进程独占创建）** + **作业级取消/抢占**（v5r 两者都缺） |

### 6.8 可观测性与可恢复性

| # | 原语 | 被哪些机制消费 | 硬要求 |
|---|---|---|---|
| F49 | **诊断面**：载入/写入问题、被丢弃的未知参数键、`prematureReads`、`stateWriteFailures` 都能在 `status()/report()` 里读到 | `noteLoadProblem`/`drainLoadNotes`（1442–1472）、`reportDroppedStateKeys` | 被丢弃的东西必须**具名可见**（v5r §2.5 的 `state-dropped-keys`） |
| F50 | **"未知就说未知"**：`updatedAt:0`、`droppedChars`、截断标记、`timings` | 头部列表（5961–5972）、分轨截断（6031–6041）、`tail()`/`truncated` | 不得把缺失值猜成一个数 |
| F51 | **重启后可继续的标记**：`pendingWork`（成员有活没干完）、`meetingOpen`（会议开了没收束）、作业镜像 | `wakeMember`/`spawnMember` 3843–3848；`beginMeeting` 7485；`recoverLeanJobs` | 这些标记是"人/所办决定是否续跑"的**唯一依据** |
| F52 | **等待/活动通知**：`waitForActivity` 的一次性 waiter + `notifyActivity` | `vibe_v5_wait`（3424–3435） | 必须是"未来一次性"语义（不能把历史活动当新活动） |
| F53 | **直接 fs 与策略 fs 的边界要讲清**：G6 自述用 `node:fs`（原子 tmp+rename），而 Lean/math 走 `ctx.fs`（带 policy） | 7075–7092 vs 4520–4541 | 直接 fs 的写入**在宿主 fs 策略之外**，框架应显式记录这一例外（v5r 只在注释里说明） |

---

## 7. 未决问题 / 与其它分片的边界

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| **U1** | `LEAN_QUEUE_CONCURRENCY = 1`（255）**全仓无读取点**；实际并发读的是 `params.leanJobsMaxParallel`（4602）。二者语义重复且常量成了死代码 | grep `LEAN_QUEUE_CONCURRENCY` 仅命中定义 255 | 目标 3/4 的"参数面单一来源"叙事里有一个反例；复现 pack 时**不要**照抄这个常量当作并发上限 |
| **U2** | **v5r 的验证/会议不冻结参与集**：`aggregateOpinion` 与 `continueVerifyRound` 每次都读活的 `voters()`（6558、6778），而 v4 文档描述了 `rosterSnapshot`/`frozenParticipants`（docs/math-computation.md §123–124）。v5r **有** `rosterVersion`/`rosterSnapshot`（2913–2928），但 `judgeVerdict` **不读**它们 | 6557–6587 vs 2913–2928 | 验证进行中若发生 hire/fire，有效分母与 `m` 会**当场变化**；"冻结"承诺在 v5r 未实现（A/C 分片若发现会议侧有另一套冻结，请交叉核对） |
| **U3** | `judgeVerdict` 末行 `undecided: quorum not met`（6624）在前置分支下**不可达**（单边且总数≥m 已判 true/false） | 6616–6624 | 死分支；做覆盖率/变异测试时不要把它当有效路径 |
| **U4** | `math_computation` **无作业持久化/断点续算**（§5.7）；`docs/formal-verification.md §11` 也明说 Lean 队列"不是持久任务系统" | §5.7 全表 | 目标 5 的核心差距；若用户要求"断点续算"，必须新增框架原语（F19/F42/F48） |
| **U5** | `math_computation` 的 **跨进程归档并发**依赖宿主独占创建原语，当前 fs 接口未暴露 | 840–846 | 多进程/多会话同时跑同一计算时 attempt 分配不保证唯一 |
| **U6** | numpy/scipy/pandas/sympy **没有专门适配**（只有通用包探测 + 存在性策略） | 全仓 grep：仅 `math-engines.js:30` 注释 | 目标 5 的需求应表述为"结果形状契约 + 会话级环境绑定"，而非"再加包名" |
| **U7** | `docs/math-computation.md` §6 的"真机已验证"（python 3.12.10 / R 4.6.1 / numpy 等）是**文档声明**，本分片**未复跑**（受"不跑全量门禁/不装依赖"约束） | 文档 §6 171–177 | 目标 5 的验收若需真机证据，须由 `vmu-verify` 另开真机任务 |
| **U8** | `selfReportRead/Write` 与 `selfViewAudit` 直接用 `node:fs`（7076、7094），**不经 `ctx.fs` policy** | 7075–7103 | 在受限宿主上这条写入路径与其它耐久写入的策略面不一致；A 分片若盘点持久化层次需含此例外 |
| **U9** | 卡片正文 `readLibrary` 全量枚举时 `slice(0,4000)` **没有** `droppedChars`（分轨有），progress 的尾 6000 也**没有**丢弃计数 | 6024、6030 vs 6031–6041 | "截断必须计数"的范式未覆盖这两处；S21 门禁只盯头部列表，未盯这里 |
| **U10** | `LEAN_SEARCH_PATH_FLAG='-R'` 与 `leanHasSearchFlag` 的 `ALSO_ACCEPTED=['--search-path','--root']`：用户若在 `leanArgs` 里写 Lean 3 的 `--search-path`，v5r 会**尊重它不注入**，而该拼写在 Lean 4 上会导致编译失败 | 256–272 注释（task-27 实测） | 复现时需决定"尊重用户"还是"纠正用户"；当前实现选尊重并留下文档说明 |
| **U11** | `verifiedRecently` 是**内存** Map，重启即空 ⇒ "刚刚定论"去重窗口不跨会话 | 1212、6901 | 重启后同一对象可被立刻重新提议验证（只要 `formalProofs` 仍 locked）；若需跨会话去重须改为耐久 |
| **U12** | 任务板 `writeScopes` 只是建议，`taskReady` 只认 `blockedBy`；**没有任何机制阻止两个成员同时写同一文件** | 4288–4299、6069–6098 | 与 DSH agent-teams 的"advisory scope"一致；框架若要提供硬锁必须新增原语 |

**与分片 A / C 的交界（避免重复与遗漏）**
- **分片 A**（状态 fold / 持久化 / 恢复 / 名册 / 章程 / 信箱）：本文件 §0 与 §1.11/§1.12 只写"本分片机制**消费**到的耐久键与 fold 行为"，fold 本体（589–900）、后端（917+）、`start/resume/configure`、名册生命周期、章程/persona 全文、信箱与投递台账归 A。
- **分片 C**（会议系统 / 群聊与状态面板 / 主代理 / 控制面）：`7385` 起的 `startMeeting`/发言模型/纪要/决议、`handleReply` 的会议相关分支、`status()/report()`、`vibe_v5_set/configure/*`、paper 阶段归 C。本文件只登记与 B 强耦合的三处：`meetingKeepEvery` 自动同步（5852–5854）、`assign` 的 `say` 与 `wakeIfIdle`（6365–6372）、`endVerify` 的收束分支（7340–7351）。

