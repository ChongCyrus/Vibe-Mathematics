# Round 4 · task-25 · F9/F10/F11 子代理原语 + setPhase + maxParallel + 审批闸覆盖面

- 状态：**A–E 全部落地并验证**；另收 reader-a 的 task-28 三行（lock/budget/新码）与 vmu-activity 的 F15 定时器清理。
- 纪律：未跑全量 sweep、未 `regen-all`、未 git；内容型改写只用 Node；探针在 `D:\_tmp\vmu-r4\`。

## A · F9 `sendMessage` / F10 `interrupt`（照 `deliverTurn` 范式）
- **桥（内核）** `kernel/turn/index.js`：`sendViaSubagents(subagents)` / `interruptViaSubagents(subagents)`（导出）。
  - `sendMessage(sender, targetId, content, {signal})`：**缺 sender ⇒ 具名拒**（宿主由**确切的活 Agent** 派生耐久发送者归属，**绝不用 id 重建**）；缺 `targetId` ⇒ `VMU_INVALID_ARGUMENT`；`content` 允许字符串（自动包成 `[{type:'text',text}]`）。
  - `interrupt(targetSessionId, authority)`：**authority 形状在调用前校验**（`{kind:'user',parentSessionId}` / `{kind:'ancestor',agent}`），不合格 ⇒ `VMU_INVALID_ARGUMENT`（**不去收宿主的 `UNAUTHORIZED`**）；返回里写明 **fire-and-return 语义**（目标到观察点才停；未认领工作/Activation/已发布后代**都保留**）。
- **内核** `kernel/index.js`：`createKernel({ sendMessage, interrupt })` ⇒ 交给 `createTurnOrchestrator`（**真读者**）；`turn.sendToMember()` / `turn.interruptMember()`（**缺缝 ⇒ `VMU_ENGINE_UNAVAILABLE`**，并**计数** `counts.sent` / `counts.interrupted`）。
- **入口** `vibe-math-vmu.js`：从 `ctx.get('subagents')` **调用时解析**装配（`apply()` 可能早于服务挂载），与 `turnDeliver` 同一范式。
- **可观测**：`status().seams.sendMessage/interrupt` + `sendMessageConsumedBy`/`interruptConsumedBy`（**具名读者** `kernel/turn/index.js`）+ `*Note`（缝在但宿主无该动词 ⇒ **调用时具名拒**）；`turn.seams()`。

## B · F11 回合结束带 `childId` + `stopReason`
- `deliverViaSubagents` 现在回**信封** `{ reply, childId, stopReason, attribution }`：`childId` 依次读 `childId`/`sessionId`/`id`/`localAgent.id`/`agent.id`；`stopReason` 依次读 `handle.stopReason`/`handle.reason`/`await handle.result.stopReason`。
- **拿不到就具名**：`attribution` 写 `unavailable: … the turn is NOT attributed`（**绝不编 child id**）。
- **向后兼容**：适配器仍可返回**裸字符串** ⇒ 该轮照常跑完，回执**具名**为"bare string ⇒ 无 childId/stopReason"；`run()` 的回执带 `attribution`，`turn.attribution()` 读最近一次。

## C · 接缝纪律
每个新接缝：**真读者**（`kernel/turn/index.js`）✓、`status().seams.*` ✓、`docs/26 §3.32` 新章 + `docs/03 §8` 新码 ✓。**无新增 settings 键**（能力在宿主，不是策略）——已答复 vmu-pack。

## D · 两条小项
1. **`resume.setPhase()` 四处调用**（`kernel/index.js` 的 `start`/`pause`/`resume`/`stop`）：统一走一个 `writePhase(value, why)`，**先 `resume.read()` 满足写前必读闸**（否则相位永远停在空投影），失败**具名记日志**（不吞）。
   实测（开 store）：`start→"running"`、`pause→"paused"`、`resume→"running"`、`stop→"stopped"` ✓（此前 `phase` 恒 null）。
2. **`vmu.math.maxParallel` 收敛（在设置边界做，regen 稳定）**：入口把两个键收敛成**一个值** —— 规范键 `vmu.math.maxParallel` 有值 ⇒ 镜像到 `vmu.math.jobs.maxParallel`（并在 `settingsSources` 记为 `alias-of:…`）；只声明旧名 ⇒ 反向镜像。**两读者因此拿到同一个数**（实测 `canon=7 ⇒ jobs=7`）。读点文本的清理（`kernel/mathtools.js` 改读规范键）属 reader-b 的文件，已通知 vmu-pack/reader-b。

## E · 审批闸覆盖面 —— **扩到 10 面**
`attachApprovalGates()` 移到**所有面构造之后**（`return kernel` 前；早期位置实测 `Cannot access 'ip' before initialization`），覆盖：
`vmu.tasks:7`、`vmu.ballotbox:4`、`vmu.meetings:5`、**`vmu.records:6`**、**`vmu.library:1`**、**`vmu.publication:1`**、**`vmu.trust:3`**、**`vmu.custody:1`**、**`vmu.ip:5`**、**`vmu.resource:1`**（`status().approvalGate` 实测 **10 面全 attached**）。
**具名不扩**（写进代码注释）：`budget`/`metrics`/`audit`/`idempotency`/`stateversion`/`work` 是**记账**（闸门会让人类阻止账本记录**已发生**的事，这是账本唯一不能做的）；`members` 是**花名册管理**（挂闸会让待批锁死机构改自己的名册）；`paper` **本装配无实例**；`meeting`/`ballot` 是**每实例工厂**（闸门只包内核持有的单例 `meetings`/`ballotbox`）。零机制不变（`vmu.human.gatedActions` 空 ⇒ 不闸任何动作）。

## 顺带（task-28 / F15，均在写范围内）
- **F18 独占恢复**：`createResume({ …, lock: storepolicySeam })`（晚绑定 holder，避免 TDZ）⇒ 实测 `recovery.status().lock = {attached:true, acquisitions:1, releases:1, busyRefusals:0}`（**finally 释放**）；未声明 `vmu.store.lock` 时 `attached:false` 零机制透传。
  ⚠ **连带修一个真回归**：`createStorePolicy` 原来吃 `guardedClock`，而 guard 拒绝 ISO 字符串钟 ⇒ 每次恢复变成 `VMU_RESUME_BUSY … NaN`。已给 storepolicy 一个**归一化时钟**（有限数透传，否则按时间戳解析）——`vmu-storepolicy 11/0`、`vmu-entry 150/0`。
- **`budget` 投影适配器**（reader-a 本轮补了公共 `snapshot()/restore()`）⇒ 实测 `projections.attached` 含 `budget`。
- **F15 `host-spawn.js` 预算定时器泄漏**：`Promise.race` 无法取消败者 ⇒ 进程先结算时 timer **一直 armed**（实测 +1）。改为**默认 delay 自建可清句柄 + `finally` 清理**；注入的 `delay` 行为不变（测试仍驱动超时路径）；**清理失败具名**（`VMU_SPAWN_TIMER_CLEANUP` 记进 `seam.timerCleanupErrors` + stderr）。实测 `settled-first: armed=1 cleared=1 cleanupErrors=[]`。
- **F16 调度器无生产调用者** ⇒ 按 Lead 给的第二条路**具名登记**为"框架提供、pack／中间件使用，内核不自动启用"，写进 `docs/03`（调度边界注）+ `docs/26 §4.3`（含**改判条件**：若真机要求"声明即心跳"，入口一行 `arm()` 且必须自曝 `status().scheduler.armed`）。

## 验证（原样命令 + 退出码）
```
node D:/_tmp/vmu-r4/f9f10f11.mjs   → TOTAL pass=14 fail=0     exit=0   （F9/F10/F11 双向：宿主真收到调用／缺缝与错 authority 具名拒／回执带 attribution／裸字符串兼容）
node --check kernel/index.js / kernel/turn/index.js / host-spawn.js / vibe-math-vmu.js  → 全 0
node tests/vmu-kernel.test.mjs                → 175 passed, 0 failed   exit=0
node tests/vmu-host.test.mjs                  → 103 passed, 0 failed   exit=0
node tests/vmu-entry.test.mjs                 → 150 passed, 0 failed   exit=0
node tests/vmu-turn.test.mjs                  → 145 passed, 0 failed   exit=0
node tests/vmu-human-gate.test.mjs            → 67 passed, 0 failed    exit=0
node tests/vmu-resume-recovery.test.mjs       → 73 passed, 0 failed    exit=0
node tests/vmu-resume-lock-and-marks.test.mjs → 39 passed, 0 failed    exit=0
node tests/vmu-seam-params-consumed.test.mjs  → 8 passed, 0 failed     exit=0
node tests/vmu-storepolicy.test.mjs           → 11 passed, 0 failed    exit=0
node tests/vmu-scheduler.test.mjs             → 111 passed, 0 failed   exit=0
node tests/vmu-activity-kernel.test.mjs       → 141 passed, 0 failed   exit=0
node tests/vmu-activity-tool.test.mjs         → 58 passed, 0 failed    exit=0
node tests/audit-tool-table.test.mjs          → 7 passed, 0 failed     exit=0
node scripts/check-docs.mjs                   → DOC LINT: PASS         exit=0
```
**已知非我项**：`audit-vmu-docs` 仍因 `docs/04 §11` STALE（Lead 轮末 `regen-all` 覆盖）；`check-docs` 早前两条 D9 在 `docs/05`（vmu-pack，已被其修掉，现 PASS）。

## 追加（同一轮后半段：Lead 裁决 + 真缺陷 + reader-a/reader-c 收口）

### D-revert · `maxParallel` 镜像**已撤销**（Lead 裁决）
入口的 `alias-of` 镜像块**已删**（两个不同策略不许强行相等：`vmu.math.maxParallel`＝**数学运行**并发，v5r 的 `leanJobsMaxParallel:1`；"每轮最多唤醒 3 名成员"＝**成员**策略，由 `vmu.limits.maxLiveMembers` 表达，该键 schema 已有 `:65`，def 0＝不设）。`vmu.math.jobs.maxParallel` **已从 schema 移除**（不保留静默分叉的别名；`kernel/mathtools.js` 仍读它 ⇒ 该键现在是"已接线但未声明"，`docs/04` 会如实标出，读点退休归 reader-b）。`vmu.math.maxParallel` 的 doc 改写为"只管数学运行并发；不要拿它当成员上限"。

### 真缺陷 · `bus.emit` 对象首参（13 处，我名下 5 文件）
总线只收**字符串名**；以下站点把**事件对象**当首参 ⇒ 必然抛错并被各自 catch 吞掉（模块**看着接好了、其实一条都没发**）：
- **5 处直写**：`board.js`／`projmigrate.js`／`skills.js`／`topology.js`／`trust.js` ⇒ 改为 `bus.emit('<名>', payload)`，并把 `catch` 从"注释吞掉"改为**具名**：`log.append({ type:'bus/emit-failed', name, code, message })`（**不再被吞**）。
- **8 处 IDENT 站点**（`alerts/bidding/capacity/conference/course/funding/governance/grant`）**全部是同一缺陷**：本地助手 `const emit = (ev) => bus.emit(ev)`，调用方传的都是 `{type:…}` 对象。已把 8 个助手统一改成**拆名转发**（`bus.emit(ev.type, ev)`）＋**具名失败**（`course`/`governance` 走 `o.bus`/`o.log`，单独处理）。
- **实测**（`D:\_tmp\vmu-r4\bus-emit-probe.mjs` 6/0）：直写站点与助手站点都把**字符串名**送到总线；总线拒绝时日志里出现 `bus/emit-failed` + 原始 code（**具名**）。
- ⚠ **系统性剩余（不在我名下，请指派）**：同样形态的助手还在 **9 个模块**里 —— `ballotbox.js:91`、`mathtools.js:196`、`meetings.js:106`、`metrics.js:67`、`migration.js:93`、`repropack.js:34`、`resource.js:66`、`stateversion.js:31`、`storepolicy.js:64`（`index.js:530`/`lifecycle.js:39` 只是注释）。它们的调用方同样传对象 ⇒ 同样"静默不发"。
- ⚠ **钩子登记**：我实测这 22 个名字（`board/moved`、`grant/granted`…）当时**都不在** `HOOK_REGISTRY`；Lead 说 vmu-pack 随后已把 5 个新名登记（`VU_HOOKS` 85），其余名字的登记状态请以 vmu-pack 为准 —— 未登记时现在的行为是**具名失败**（这正是要的）。

### reader-a 收口（task-28 追加）
- **`work` 投影行已删**：`kernel/work.js` 把 `work` 写成**裸数组**，不是投影信封 ⇒ `hydrate()` 具名 `VMU_RESUME_PROJECTION_GAP` ⇒ 每次 `recover()` `ok:false`。`work` 已自持久、`resume` 走 `work` 接缝，所以投影行**弊大于利**（已从适配器表与 `targets` 移除，代码留因）。
- **根因同型**：`store.js` 的 `defaultKeys()` 把**每个公开键**都播种成 `[]`，而 `[]` 在投影键下就是"不是信封"⇒ 首跑即 gap。已引入 `NULL_SEEDED`（`phase/human/resume/ids/mailbox/chat/panel` 播种 **`null`**，`null` 被读作"nothing was projected (a first run)"）。
  **实测：干净首跑 `lastRecoveryOk=true`、`unhydrated=[]`、10 个 step 全 ok** ✓（此前 `ledgers:false`）。
- **`children` 端口已接**：入口用 `subagents.listChildren`（**调用时解析**）包成 `{parentId, list}`，`parentId` 取 `ctx.sessionId`／`ctx.get('session').id`；`createKernel({children})` ⇒ `createResume({children})`（**必须早于 createResume 定义**，晚定义实测 TDZ）。实测：无宿主方法 ⇒ `children={attached:false, code:'VMU_RESUME_CHILDREN_UNAVAILABLE'}`；有 ⇒ `{attached:true, parentId:'root-1', live:2}`。
- **新码 `VMU_RESUME_CHILDREN_UNAVAILABLE` 已登记 `docs/03 §8`** ✓。

### reader-c 更正
`vmu.ballot.openMaxMs`／`vmu.meetings.stepMaxMs` **从未进过 schema／planned／docs/04**（实测 grep 为空）⇒ **无键要加、无键要删**，无需动作。

### 追加验证（原样命令 + 退出码）
```
node D:/_tmp/vmu-r4/bus-emit-probe.mjs  → TOTAL pass=6 fail=0    exit=0
node D:/_tmp/vmu-r4/f9f10f11.mjs        → TOTAL pass=14 fail=0   exit=0
node --check board/projmigrate/skills/topology/trust/alerts/bidding/capacity/conference/course/funding/governance/grant/store.js/schema.js/index.js/vibe-math-vmu.js → 全 0
node tests/vmu-board 43/0 · vmu-trust 74/0 · vmu-topology 53/0 · vmu-skills 52/0 · vmu-projmigrate 107/0
node tests/vmu-kernel 175/0 · vmu-entry 150/0 · vmu-turn 145/0 · vmu-host 103/0
node tests/vmu-resume-recovery 73/0 · vmu-resume-lock-and-marks 49/0 · vmu-storepolicy 11/0
（全部 exit=0）
```
**非我项**：`check-docs` 的 D4 两条（`docs/14` 引用 `14-decision-history.md`／`05-middleware-and-hooks.md` 找不到）在别人的卷里；`audit-vmu-docs` 的 `docs/04 §11` STALE 由 Lead 轮末 regen 覆盖。

