# Round 2 · 目标 1（task-10）实现报告：断点续跑 + 人工干预

> 作者：v5r-reader-a。范围：`kernel/resume.js`(新) · `kernel/ids.js`(新) · `kernel/human.js` · `kernel/control.js` · `kernel/lifecycle.js` · `kernel/tasks.js` · `kernel/members.js` · `kernel/budget.js` · `tools/human.js`(新) · `docs/07` · `docs/26` · 本报告。
> 判据来源：`_handoff/vmu/03-v5r-full-inventory.md` 分片 A §4／§4.8 ＋ `_handoff/vmu/00-decisions.md`（D-01／D-07／D-08）＋ lead 的两条范围升级（真耐久投影；统一 id 原语）。
> 接线（`kernel/index.js`／`host.js`／`vibe-math-vmu.js`／`settings/schema.js`／`kernel/store.js`）由 **vmu-core** 落；会议/表决/纪要五面的 `snapshot()/restore()` 由 **v5r-reader-c** 落；两者接口均已发消息冻结。

---

## 1. 交付物与落点（逐项 file:line）

| 项 | 交付 | 落点 |
|---|---|---|
| A · 会话级恢复原语 | `createResume({store,work,control,identity,mailbox,watchdogs,faces,settings,bus,clock,log,listCap})`：`read/write/patch`（写前必读闸）· `recover/recoverPlan` · `snapshot/hydrate/projectionOf` · `attachProjection` · `nextId/observeIds` · `settleOutcome` · `interrupted` · `readBack` · `status/history` | `vibe-math-vmu/kernel/resume.js:1-800` |
| A · 投影纯原语 | `createProjection({key,mode,snapshot,restore,list,replay,cap})` · `attachProjection({target,methods,projection,nonReplayable})` · `checkSnapshot(face,snap,required)` · `contentDigest` · `RECOVERY_STEPS`／`PROJECTION_KEYS`／`CODE` | `kernel/resume.js:60-330` |
| A · id 铸造原语 | `createIds({store,clock,log,bus,settings})` → `mint/observe/counter/hydrate/flush/status`；模块级 `bindIds/mint/observeIds/hydrateIds/idsStatus`；`IDS_KEY='ids'` | `kernel/ids.js:1-215` |
| A · 面侧 seam | `snapshot()/restore(snap,{replace})`（含 `restore` 的冲突具名拒与计数器 max+1 语义） | `kernel/tasks.js:44-56,127-131,289-361`（`snapshot` 在 `:289` 起）、`kernel/members.js:36-41,259-303`、`kernel/budget.js:7-12,146-175` |
| B · 审批真闸门 | `approvalDecision` · `gate` · `queue` · `decide`(+`by`/`pendingReason`) · `explainDecision` · `liftVeto` · `dashboard(domains)` · `attachApprovalGate({target,methods,gate,face,subjectOf,byRoleOf})` | `kernel/human.js:29-56,60-100,150-380` |
| B · 工具面 | `makeHumanSpec`（14 action），`TOOL_NAMES.human='vibe_vmu_human'` 由 core 登记 | `tools/human.js:1-120` |
| C · 暂停/恢复/改参数 | `createControl({...,approval,setSetting})`：`tune({key,value,byRole})`＋`tuneTrail()`、`resume()` 的 `pausedAt/heldMs` 留痕、`mayAct` 咨询 `approval` 缝 | `kernel/control.js:30-53,56-72,110-190,240-275` |
| D · 文档 | `docs/07` 新增 **§14 会话级恢复与 id 不复用** ＋ §15 判定留痕；`docs/26` 新增 **§7 会话恢复对本卷的约束** | `docs/07-durability-library.md:448-500`、`docs/26-turn-orchestration.md:587-600` |
| D · `docs/17` §19 | **不在我名下**：替换文本（5 条完整行）已 `send_message` 发 **v5r-reader-c**，由其落笔 | 见消息 `team-message-cf0473cb` |
| 附带修复 | `kernel/lifecycle.js` 的**静默失效广播**（`bus.emit({type:…})` ⇒ 具名拒被 catch 吞掉）：改为 `emit('lifecycle/prereg'|'lifecycle/advance', payload)` | `kernel/lifecycle.js:39-49,162,239` |

---

## 2. 逐条验收（A/B/C/D）

### A. 会话级恢复原语 —— 已实现
- **写前必读闸**：`resume.write/patch` 在 `readOk===false` 时抛 **`VMU_RESUME_WRITE_BEFORE_READ`**（含 hint 点名 v5r 的 `V5_STATE_NOT_LOADED` 规则）；`writeRefusals` 计数可见。**新会话不继承旧会话的读**（测试 §1 第 8 项）。
- **无 store 具名**：`recover()` 返回 `ok:false + VMU_RESUME_UNAVAILABLE` 且第一步即 `ok:false`；`write()` 直接拒。**没有"假装恢复了"的分支**。
- **十步与 v5r 对齐、只给原语**：`RECOVERY_STEPS = read→roster→inflight→ledgers→mailbox→watchdogs→flags→readback→outcome`；`recoverPlan()` 是只读预演（含 `willAutoRecover`，即 `vmu.resume.autoRecover` 在本文件的消费者）。
- **`interrupted` 具名、绝不静默 passed**：`work.recover()` 标中断；`settleOutcome({outcome:'passed'})` ⇒ `VMU_RESUME_INTERRUPTED_NOT_PASSED`；显式覆盖还需 `reason`（`VMU_INVALID_ARGUMENT`）。
- **read-back 一致性**：`readBack()` 逐键比对"本进程最后写入的摘要"，漂移 ⇒ `consistent:false + VMU_RESUME_READBACK_DRIFT + drift[]`，计数进 `status()`。
- **投影/水合**：`mode:'state'`（`restore(value)` seam）与 `mode:'journal'`（记录命令 → 启动经**该面公开方法**重放，面的 `seq` 自然推进到 max+1）。**四类具名拒**：无 adapter／无 seam ⇒ `VMU_RESUME_NO_ADAPTER`；journal 有洞/被裁头/含 `nonReplayable` 命令/参数不可序列化 ⇒ `VMU_RESUME_PROJECTION_GAP`；`status().projection.degraded` 同步为 true。
- **id 不复用**：`nextId(kind)` = `max(存量, 观测, 进程内)+1`；`observeIds` 幂等取 max；`ids.hydrate()` 从 `ids` 键恢复；未绑定 ⇒ `durable:false` **具名**。

### B. 人工干预真门禁 —— 已实现
- **零机制**：`vmu.human.gatedActions` 空（默认）⇒ `approvalDecision` 返回 `gated:false`，动作照跑。
- **真拦截**：`attachApprovalGate` 包住面方法；未批 ⇒ **动作不执行**、`gate()` 抛 `VMU_HUMAN_APPROVAL_PENDING`（`detail.queued/requestId`）；同一 `(action,subject)` 复用同一请求并累加 `attempts`；`decide(allow:true)` 后同一调用成功。**对真实 `createTasks` 做过端到端验证**（测试 §6：拒绝时 `tasks.list().length===0`，批准后 `t-1` 落地）。
- **否决立即生效 + 广播 + 事后补理由**：`veto()` 记录并 `emit('human/vetoed')`；被否决动作**连队都不入**；无理由时 `pendingReason:true`，`explainDecision` 事后补；**解除须 `vetoLiftRoles` 角色 + 必填理由**（`VMU_HUMAN_LIFT_ROLE`/`VMU_HUMAN_LIFT_REASON_REQUIRED`）。
- **超时默认 hold**：`hold` ⇒ 继续排队（`heldOnTimeout`）；`default-deny` ⇒ `VMU_HUMAN_APPROVAL_TIMEOUT`；`default-allow` ⇒ **仅当 `defaultAllowAcknowledged=true`** 才放行，否则 `VMU_HUMAN_DEFAULT_ALLOW_NOT_ACKNOWLEDGED` 并**继续排队**；`status().gateNeverAllowsBySilence` 恒真（除非两者都显式）。
- **观察员/仪表盘域钳制**：`observerScopes` 空＝全不可见；`dashboardDomains` 空＝仅聚合；`private`/`dm`/`secret` 类域**由构造永不可见**（`PRIVATE_DOMAINS`）。
- 队列有界：满 ⇒ `VMU_HUMAN_QUEUE_FULL` + `queueDropped` 计数（不静默丢）。

### C. 暂停/恢复/改参数 —— 已实现
- `pause()` 已有（范围/角色具名拒）；`resume()` 新增 `emit('control/scope-resumed')` ＋ `pausedAt/heldMs`（**留痕**）。
- `tune({key,value,byRole})`：键不在 `vmu.control.tunableKeys`（**空＝一律不许改**）⇒ `VMU_CONTROL_PARAM_UNDECLARED`；角色不在 `canSetRoles` ⇒ `VMU_CONTROL_PARAM_ROLE`；**无 settings 写缝 ⇒ `VMU_CONTROL_PARAM_UNAVAILABLE`**（不假装写了）；成功 ⇒ 通过缝写入 + `trail`/`lastTune` 审计 + `emit('control/param-set')`；每处拒绝都 `emit('control/param-refused')`。
- `mayAct({scope})` 现在同时咨询暂停面与（若注入）审批闸门 ⇒ 调用方只问一个问题。
- `control.js` 与 `resume.js` 的关系：`resume` **只读** `control.status()`（暂停面作为恢复后的运行事实 `flags`）。

### D. 文档
- `docs/07` §14：落地面、四条硬不变量、恢复十步、两套投影形态与代价、面侧快照契约、耐久键、逐模块状态与验收；§15 判定留痕。
- `docs/26` §7：整轮编排受恢复约束的四条（在途须耐久、id 不复用、快照不装接缝、**"重启后空名册"与"真的恢复了"必须可区分**）。
- `docs/17` §19：**替换文本已发给 v5r-reader-c**（5 条整行 + Round 2 落地说明），**我未改该文件**。

---

## 3. 逐模块耐久状态（lead 要求：不许静默略过）

| 模块 / 键 | 状态 | 证据 / 理由 |
|---|---|---|
| `work`（在途台账） | **真持久 ✓**（既有） | `kernel/work.js:50,57,64,135`；恢复时具名 `interrupted` |
| `idempotency` | **真持久 ✓**（既有） | `kernel/idempotency.js`（Round 1 已接） |
| `resume`（恢复记录＋计数器＋journal 索引） | **真持久 ✓**（新） | `kernel/resume.js` 经写前必读闸 `store.patch('resume')` |
| `ids`（id 计数器） | **真持久 ✓**（新） | `kernel/ids.js:...`；`vmu.ids.persistEvery`（默认 1） |
| `tasks` | **写穿 + 水合 ✓** | `attachProjection(mode:'journal')` 包 7 个变异方法；`snapshot()/restore()` 提供 state 形态；`restore` 冲突具名拒、计数器 `max+1` |
| `members` | **写穿 + 水合 ✓** | `snapshot()/restore()`（`kernel/members.js:259-303`）；**slot 声明故意不进快照**（避免旧声明覆盖新配置） |
| `budget` | **写穿 + 水合 ✓** | `snapshot()/restore()`（`kernel/budget.js:146-175`）；**只恢复"花了多少"**，totals/reserveRatio 等声明由 settings 重新解析 |
| `phase` | **可持久 ✓**（键在既有白名单） | 由 control 面/adapter 提供；当前内核未写该键 ⇒ 恢复时 `unhydrated` 具名（见下） |
| `meetings` / `ballots` / `ballotbox` / `minutes` / `meeting` | **写穿 + 水合 ✓**（**reader-c 已落**，回执 `team-message-e876dc24`） | `kernel/meeting.js:439-447`、`kernel/meetings.js:952-960`、`kernel/ballot.js:287-295`、`kernel/ballotbox.js:383-391`、`kernel/minutes.js:304-312`；统一 `import { CODE as RESUME_CODE } from './resume.js'`（三码单源）；`policy` 声明族不入快照；`skipped[]` 原样并回 |
| `chat` / `panel`（群聊账本 / 成员状态面板） | **未投影（具名）** | reader-c 回执 §5：本轮无 `snapshot()/restore()` ⇒ 未 ack 消息只能由 `mailbox.pending()` 端口**计数**、不能重建；两键已在 `PROJECTION_KEYS` 声明域，等 seam + 白名单键 `chat`／`panel` |
| `settings.resolved` / `packs` / `middleware` | **不宜持久（具名理由）** | 前两者是**声明/解析结果**，启动时由 settings 与 pack 重新解析；持久化会让一次部署变更被旧快照悄悄回退。`middleware` 是运行时装配面，恢复语义属 vmu-core/pack |
| `records`（成果库） | **已是文件持久 ✓**（不在白名单投影内） | `kernel/library.js` 的磁盘卡片是权威；`records` 键未被任何面读写（Round 1 已登记） |
| **派生 id（不改）** | **具名例外** | `reviews.js:94` 的 `assignments.size+1` 是**从集合大小派生的位置号**，不是全局名：它随被引集合一起恢复即可，改 `mint` 反而会让"同一指派换号"。**保留原样并在本报告具名**。 |

**约 30 处模块级 `seq`**：由 **vmu-core** 用 `kernel/ids.js` 的 `mint(kind, prefix)` 批量替换（我已核对其 `node --check` 全 0）；**唯一例外** `kernel/tasks.js` 保留**每实例**计数器 —— 具名理由：现有套件与 A/B harness（`tests/vmu-ab-v5r-meetings.test.mjs:325` 建两个 ledger）依赖**每个 ledger 各自从 `t-1` 起**；改为全局共享计数器会让第二个 ledger 从 `t-2` 起，破坏既有语义。`tasks` 的跨重启不复用由 `snapshot()/restore()` 的计数器 + `observeIds('task', …)` 保证（测试 §5 已证 `t-1` 被 settle 后不会重发）。

---

## 4. 定向单跑：原样命令 + 退出码

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tests/vmu-resume-recovery.test.mjs` | `=== VMU RESUME: 52 passed, 0 failed ===` | **0** |
| `node tests/vmu-human-gate.test.mjs` | `=== VMU HUMAN GATE: 51 passed, 0 failed ===` | **0** |
| `node tests/vmu-work.test.mjs` | `=== VMU WORK: 19 passed, 0 failed ===` | 0 |
| `node tests/vmu-identity-human-discipline.test.mjs` | `=== VMU IDENTITY+HUMAN+DISCIPLINE: 63 passed, 0 failed ===` | 0 |
| `node tests/vmu-tasks.test.mjs` | `=== VMU TASKS: 42 passed, 0 failed ===` | 0 |
| `node tests/vmu-kernel.test.mjs` | 全绿 | 0 |
| `node tests/vmu-host.test.mjs` | 全绿 | 0 |
| `node tests/vmu-control-roster.test.mjs` | 全绿 | 0 |
| `node tests/vmu-budget-pipeline.test.mjs` | 全绿 | 0 |
| `node tests/vmu-custody-budget-audit.test.mjs` | 全绿 | 0 |
| `node tests/vmu-ab-v5r-meetings.test.mjs` | 全绿（含"两个 ledger 各自 t-1"） | 0 |
| `node --check` × 9 个改动文件 | 全部 exit 0 | 0 |

未跑（按纪律）：`GATE_SCOPE=full`／`GATE_RELEASE=1`／`scripts/regen-all.mjs`／`update-doc-counts --write`。新套件由 `tests/run-tests.mjs` 的 `readdirSync` 自动纳入（`vmu-resume-recovery`／`vmu-human-gate` 不在排除前缀内）。

---

## 5. 钩子生产者（供 `audit-hook-coverage` 的 `bus\.emit\('<名>'` 字面量）

| 钩子 | 生产者 file:line |
|---|---|
| `resume/recovered` · `resume/degraded` | `kernel/resume.js:700,706` |
| `resume/projection-error` | `kernel/resume.js:442-445` |
| `ids/minted` · `ids/hydrated` · `ids/persist-failed` | `kernel/ids.js:135,175,150` |
| `human/vetoed` · `human/veto-lifted` | `kernel/human.js:135,200` |
| `human/approval-asked` · `human/gate-pending` · `human/approval-decided` | `kernel/human.js:325,326,168` |
| `control/scope-paused` · `control/scope-resumed` | `kernel/control.js:104,123` |
| `control/param-set` · `control/param-refused` | `kernel/control.js:164,139,146` |
| `lifecycle/prereg` · `lifecycle/advance` | `kernel/lifecycle.js:162,239`（**本轮修好的静默失效**；已请 vmu-pack 登记 `lifecycle/*`） |

**只进 log、不占总线**：`human/veto`、`human/decided`、`human/approval-*` 的 log 副本、`control/paused`、`control/resumed`、`ids/*` 的 log 副本。

---

## 6. 配置键：我**真读**的（供"穿而没人读"门禁）

| 键 | 读取点 |
|---|---|
| `vmu.resume.autoRecover` | `kernel/resume.js` `recoverPlan()`（回显 `willAutoRecover`；启动路径是第二消费者） |
| `vmu.resume.projections` | `status().declaredProjections` + 装配声明 |
| `vmu.resume.keepRecoveries` | 恢复记录裁剪（`read` 采纳 + `recover` 写入） |
| `vmu.resume.readBack` | `recover()` 第⑧步是否回读校验 |
| `vmu.resume.journalCap` | `createProjection` 的 `cap`（超限 ⇒ `incomplete` ⇒ 水合具名拒） |
| `vmu.ids.persistEvery` | `createIds` 的写穿频率 |
| `vmu.human.gatedActions` | `approvalDecision`（空＝零机制） |
| `vmu.human.approvalQueueCap` | `approvalDecision` 的队列上限 |
| `vmu.human.defaultAllowAcknowledged` | `approvalDecision` 的 default-allow 二次确认 |
| `vmu.human.approvalTimeoutMs` / `onTimeout` | `approvalState`（既有）＋ `approvalDecision` |
| `vmu.human.vetoScope` / `vetoNeedsReason` / `observerScopes` / `dashboardScope`（既有） | 既有各函数 |
| `vmu.human.dashboardDomains` | `dashboard({domains})` 的域钳制 |
| `vmu.human.vetoLiftRoles` | `liftVeto` 的角色校验 |
| `vmu.control.tunableKeys` / `canSetRoles` | `tune`（两道具名拒） |

---

## 7. 未做项 / 诚实边界（具名）

1. **审批队列与否决台账是会话内存**：重启后未批请求与历史否决不保留（本轮的"真闸门"保**拦截语义**，不保**跨重启的审批台账**）。下一步：把 `approvals`/`vetoes` 走 `resume` 的 state 投影（需要一层 `human` 键或并入 `resume`），并在 `human.js` 加 `snapshot()/restore()`。
2. **`vmu.human.gatedActions` 词表未冻结**：格式已冻结为 `<面>.<方法>`，具体词条取决于 vmu-core 装配时包哪些方法（候选：`tasks.create|assign|transition|brief|clearBrief|advance|rollback`、`ballotbox.open|freeze|unfreeze|cast|close|reopen`、`meetings.*`）。**冻结清单会在 vmu-core 装配后由我补一条 delta**；空值＝零机制的硬语义不变。
3. ~~**会议/表决/纪要五面的 seam 不在我名下**~~ → **已于 Round 2 内闭合 ✓**（reader-c 回执 `team-message-e876dc24`：五面 seam 落地、三码改为从 `resume.js` 单源 import）。我据此**修了一处真缺口**：`hydrate()` 原先只看 `restore()` 的返回值是否抛错，**不识别面"返回 `{ok:false, code}`"的拒接** ⇒ 会把面级拒接当成功；现已识别（`resume.js:509-521`）并加了断言（`tests/vmu-resume-recovery.test.mjs` §11），套件 50→**52 passed / 0 failed**。
8. **`chat` / `panel` 尚未投影（具名）**：reader-c 回执 §5 已具名；两键已加入 `PROJECTION_KEYS` 声明域。补 `snapshot()/restore()`（信封 `face:'chat'|'panel'`）＋ 白名单键 `chat`／`panel` 后即成为真持久；**未 ack 消息目前只能计数、不能重建**。
9. **`checkSnapshot` 的使用方式（对 reader-c 第 4 问的裁决）**：**不要求**他们改成"先 checkSnapshot 再 hydrate" —— 面的 `restore()` 返回自己的回执（含 `restored/skipped/counters`）是**正确形状**，而三条判据已用**同一组共享码**（`RESUME_CODE.*`）落地，单源成立。若日后要把"判据实现"也收敛成一份，再改为调用 `checkSnapshot`（它抛具名拒）；这属于重构，不是缺口。
4. **`docs/17` §19 由 v5r-reader-c 落笔**（替换文本已发）；本报告不声称已改。
5. **`kernel/tasks.js` 的 `seq` 有意保留**（理由见 §3）；`mint` 的模块侧替换由 vmu-core 做，我未逐个模块改。
6. **`lifecycle/*` 两个钩子待 pack 登记**：若 pack 决定不登记，我在此处登记为"仅 log 待定"（当前已按字符串形态生产，命名空间未登记时会被具名拒并由 `.catch` 吞掉，不再静默）。
7. **`ids/minted` 每次 mint 都广播**：若在装配/高频路径上造成噪声，可把 `vmu.ids.persistEvery` 语义或该钩子降为按需（需 pack 同步改登记口径）。

---

## 8. 事故与恢复（诚实留痕）
- 我一度用 **PowerShell 文本管道**（`Get-Content -Raw` → 正则替换 → `Set-Content`）批量改 `emit(...)` 形态，**损坏了 `kernel/lifecycle.js` 与 `kernel/control.js` 的 UTF-8 中文**（`lifecycle.js` 直接变成非法 UTF-8；`control.js` 出现替换字符）。
- 恢复：`cmd /c "git show HEAD:<path> > D:\_tmp\<name>.head.js"`（**cmd 重定向字节透明**）→ `node --check` 校验 exit 0 → `Copy-Item` 覆盖 → **用 `edit` 工具重做全部改动**。两文件现已 `node --check` exit 0、中文完好（`control.js` 非 ASCII 序列与 HEAD 一致 + 我新增的 `留痕` 注释）。
- **纪律**：本会话后续批量替换只用 Node 的 `readFileSync/writeFileSync('utf8')`（`D:\_tmp` 的一次性补丁脚本用完即删）。
- 记忆钩子：`edit` 工具的 `old_string` **不要带结尾换行**（会吞掉一个空行）。
