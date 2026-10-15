# 目标 1 · 端到端钻取：断点续跑 ＋ 人工干预（task-62 / Round 8）

> **一份可复现的脚本，一条真实时间线。** 同一个 store 文件上连开三次"进程"，把
> 「派活 → 留未读信 → 暂停 → 注入指令 → 续跑 → 动作被审批门拦下 → 重启 → 再重启 → 批准后才执行」
> 串成一次跑完的场景，并逐条断言"断点续跑"和"人工干预"里**可被机器判定**的部分；
> 末尾附一条 **G7 正对照**（把 mailbox 绑到真的耐用提交日志）：证明"接耐用日志"**不改变**任何一条投影契约。
>
> 交付物本体＝`tests/vmu-resume-e2e.test.mjs`（本目录不复制代码；本文件是**读数与边界**）。
> 本文所有数字都来自**本轮真实运行**，命令与退出码逐条列出；**没跑的东西不会写成"已验证"**。
> **版本说明**：`vmu-verify` 的独立验收（52/0 ＋ 变异复验）是在 **§⑦ 加入之前**的版本上做的；
> 加入 §⑦ 后套件为 **63/0**（并已由 verify 刷新进其证据 §10.11）；**Round 9 加** **§⑧ 退出契约**（`10a`–`10l`）与 **§⑨ 多实例**（`11a`–`11f`）；
> **Round 10 加** **§⑩ 真装配**（**真入口 ＋ 两个内核实例 ＋ 真 store**，`12a`–`12j`）；
> **Round 11 加** **§⑪ 投影种子普查**（`13a`–`13c`）与 **§⑫ F51 域标记**（`14a`–`14e`）⇒ 当前 **99/0**。
> 各轮读数保持原样（当时真实运行的结果）：R8 见 §2，R9 见 §2.3／§2.4／§6.5，R10 见 §2.5／§6.6，R11 见 `resume-round11-report.md` §3／§4。

## 0. 怎么跑（本轮的原始命令与结果）

```bash
cd Vibe-Mathematics
node tests/vmu-resume-e2e.test.mjs          # ⇒ === VMU GOAL1 E2E: 99 passed, 0 failed === ；exit 0（Round 11 当前版本）
node tests/vmu-resume-e2e.test.mjs --self-probe   # ⇒ === VMU GOAL1 E2E SELF-PROBE: GUARD CANNOT FAIL === ；exit 1
```

- `--self-probe` 的语义沿用本仓既有约定（与 `vmu-resume-recovery` 逐字同形）：**先注入缺陷再跑**，它应退出 0；
  在**全绿**的树上跑，它只会报 `GUARD CANNOT FAIL` 并退出 1。⇒ 这条变体本身在绿树上"跑出红"是**设计如此**，
  不是失败；本轮**没有**把它当验收证据。
- **但它确实会咬人**：把本轮修好的 journal 序列改成旧写法（`seq += 1`，`resume.js:181`）后，**本轮真跑**：
  `node tests/vmu-resume-e2e.test.mjs` ⇒ `61 passed, 2 failed`，exit 1，红的是 `7a`（`VMU_RESUME_PROJECTION_GAP`
  `{kind:'hole',at:1,expected:3}`）与 `7e`（`{"tasks":0,"queue":3}`）；§⑦ 的 11 条**照旧全绿**（它不走"重启后追加"这条路）。
  **`vmu-verify` 在 §⑦ 加入前的版本上独立复验过同一条变异**：`50 passed, 2 failed`、exit 1，锚点唯一性断言 ＋ `finally` 还原 ＋
  还原后 sha256 比对（`230412f8a423ea62…`）后复跑 52/0。⇒ 两版读数之差（61 vs 50）正好是 §⑦ 的 11 条。
- 钻取只写 `D:/_tmp/vmu-goal1-e2e/` 与 `D:/_tmp/vmu-goal1-e2e-queue/`（每次运行前 `rmSync` 清空），
  **不碰仓库内外任何真实状态**；跑完可整个删除。

## 1. 场景脚本（钻取的时间线）

| 步 | 动作 | 这一步真实调用的东西 |
| --- | --- | --- |
| ① | boot 1：`createStore({root})` → `bindIds/hydrateIds` → `createWorkLedger` → `createMailbox` → `createHuman` → `createControl` → `createTasks` → `attachApprovalGate(tasks.create)` → `createStorePolicy({vmu.store.lock:true})` → `createResume({...ports})` → `attachProjection(tasks=journal, human=state, mailbox=state)` → `recover({reason:'kernel-start'})` | 真 `state.json`（temp+rename）、真锁、真 id 铸造器、真审批门 |
| ① | `work.start({owner:'r-1',kind:'proof'})`；`mailbox.send('office',{to:'r-1'})`；`ctrl.pause({scope:'tasks'})`；`vibe_vmu_human.inject({text,to:'r-1'})`；`ctrl.resume({scope:'tasks'})` | 都是公开面（`tools/human.js` 的 `inject` 走 mailbox 路径） |
| ② | `tasks.create({title:'the paper'})` 被拒；`human.veto(...)`；`human.approvalDecision(...)` + `decide({allow:false})` | 审批门／否决台账／`pendingReason` |
| ②′ | `settle()`：等所有已发起的**异步写穿**落地，然后**直接读 fold** 断言 `human`/`mailbox` 已是 state 信封；再断言 `tasks` 键**还没**落盘（具名缺口），最后 `snapshot({key:'tasks'})` 走装配侧的"优雅退出 flush" | 进程边界必须显式做出来，见 §5 |
| ③ | boot 2：**全新一套实例**打开**同一个**文件（`rmSync` 只在最开头做过一次） | 恢复 11 步全过 |
| ④ | 断言重启代价与重派：`status().inflight`／`status().lock`／`steps.reassign`／`status().reassignAttempts`／`restart.generation` | `pendingWork` 等价物、真锁 finally、耐久尝试计数 |
| ④ | 人工半边：队列仍在（**同一个** `requestId`）、`pendingReason` 仍在、否决仍生效、**仍可解除**、未批动作**确实没跑** | human 面 state 信封 |
| ⑤ | boot 3：`maxAttempts:2` 用尽 ⇒ 第三次启动**不再重派**；任务板由 journal 重放重建 | 耐久上界 + journal 重放 |
| ⑥ | `store.stats()` / `store.export()`：一个真文件、白名单键齐全 | 耐久产物本体 |
| ⑦ | **G7 正对照**：`createDurableCommitLog`（`kernel/ballot.js` 的真协议）＋假宿主 `append/readAll` → 绑给 mailbox → 另一个干净 store 上复跑"发送＋被门拦下＋重启" | 证明**绑定耐用日志不改动任何投影契约**；见 §2.2、§5.4 |
| ⑧ | **退出契约（Round 9 / task-70 A）**：变更 ⇒ 同一 tick 断言写穿**在飞** ⇒ **一次 `await resume.settle()`** ⇒ 读 fold ⇒ `await resume.flushAll()` ⇒ **另开一个 store 实例（下一位读者）读文件** ⇒ `await resume.exit()` ⇒ 探针看 shipped 装配是否调了它 | `settle()`＝等写穿落地；`flushAll()`＝刷 journal；`exit()`＝两半边取 AND；见 §2.3 |
| ⑨ | **多实例（Round 9 / task-70 B）**：把真 `kernel/meetings.js` **按装配原样**（`methods: []`）接上 ⇒ 开**两个会** ⇒ 断言耐久键仍是种子（缺陷）⇒ `exit()` 也救不了 ⇒ **只把方法列表填上**再跑同一路径 ⇒ 信封有两个会、重启后都回来 | 证明"集合面就是注册表"＋"缺的是 `methodsOf`"；见 §2.4、§6.5 |
| ⑩ | **真装配（Round 10 / task-78 B）**：`vibe-math-vmu.js apply(ctx, config)`（最小假宿主 ctx）起**两个内核实例**读**同一个真 store root**：K1 开 2 会 2 票箱 → `kernel.shutdown()` → **另开 raw store 读文件** → K2 恢复 | 复核"集合面即注册表"在**真装配**上成立；把退出缝从源码探针升级为**行为断言**；见 §2.5 |

## 2. 逐步读数（Round 8 的三次 boot 时间线，当时原样输出 63/0；当前 81/0，Round 9 读数见 §2.3／§2.4）

```text
  store root: D:/_tmp/vmu-goal1-e2e (fresh)

[1] boot 1 — recover, dispatch work, leave mail unread, pause, inject, resume
  ok   1a the first boot recovers cleanly on a BRAND-NEW store (generation 1: a first start is still a recorded recovery)
  ok   1b the FIRST start already reconciles the roster: the one missing child is offered to the policy (attempt 1)
  ok   1c dispatched work is registered in the durable in-flight ledger
  work: w-1-mbxstlow owner=r-1 kind=proof
  ok   1d the office queued one durable mail entry for r-1 (unacknowledged)
  ok   1e the human PAUSED the task surface
  ok   1f an attempt while paused is refused by name (the gate runs BEFORE the pause check)
  ok   1g nothing was created while paused
  ok   1h the human INJECTED an instruction mid-run (mailbox path, office voice)
  ok   1i the injection is a second unread entry (the restart must count 2)
  ok   1j the human RESUMED the surface (with an auditable hold time)

[2] the approval gate — a real action is attempted and must NOT run
  ok   2a creating a gated task is refused while no human approved it
  ok   2b the board is EMPTY: the action did not run (the gate is real)
  ok   2c the queue holds the waiting request(s); the paused attempt ALSO opened one (the gate runs before the pause check)
  human queue: while paused#approval-1(pending) the paper#approval-2(pending)
  ok   2d the veto that promised a reason is recorded as owing one
  ok   2e the denial that promised a reason is recorded as owing one too
  human: total=3 pending=2 activeVetoes=1 vetoPendingReasons=1
  ok   2f every wrapped human/mailbox mutation was followed by one state write (write-through, no explicit snapshot)
  ok   2g the human ledger is ALREADY a real state envelope in the fold (3 requests + 1 veto durable before the restart)
  ok   2h the mailbox snapshot is durable too (2 unacknowledged entries live in the fold)
  ok   2i NAMED GAP: the `tasks` journal has NO write-through — it is still the empty seed in the fold
  ok   2j the assembly's exit flush makes the journal durable: 2 recorded REFUSED commands, both marked failed (they are history, not state)

[3] RESTART — a new process opens the same store file
  ok   3a the second boot recovers successfully
  recovery steps: read✓ roster✓ children✓ reassign✓ inflight✓ ledgers✓ mailbox✓ watchdogs✓ flags✓ readback✓ outcome✓
  ok   3b the task journal hydrated, applied 0 commands and SKIPPED the 2 failed (refused) ones it had recorded
  ok   3c the two STATE projections were restored from their envelopes (human, mailbox)
  ok   3d restart.generation is DURABLE and incremented (2)
  ok   3e the marker is derived from the durable key and names the reason
  ok   4a pendingWork: the dispatched work is INTERRUPTED and NAMED after the restart
  ok   4b pendingWork: it FOUND one item and nothing is left open
  ok   4c unacknowledged mail is counted after the restart (2: the request + the injected instruction)
  ok   4d the recovery took the REAL store lock and released it in the finally
  ok   4e the wired recovery ports are visible (lock/roster/children/mailbox)
  ok   4f re-dispatch was offered ONLY to the missing member (r-2), never to the live one (r-1)
  ok   4g the offer carries the member and the attempt number, counted ACROSS the restart (1 → 2)
  ok   4h the attempt counter is durable and readable

[4] the human half across the restart
  ok   5a the pending approval is STILL queued, with the SAME requestId after the restart
  ok   5b its action and attempt count survived too
  ok   5c the denial that still OWES a reason reports pendingReason after the restart
  ok   5d the veto is still in force and its ledger row survived
  ok   5e the vetoed target is still refused after the restart
  ok   5f the veto can still be LIFTED after the restart (role + reason)
  ok   6a the board is STILL empty: the un-approved action never ran, even across a restart
  ok   6b the gate still refuses (same queued request, no second one)
  ok   6c no duplicate request was opened by the retry
  ok   6d once a human ALLOWS it, the same call succeeds (and mints the first id)
  ok   6e and the task really exists on the restarted board
  ok   6f the promised veto reason can still be discharged after the restart

[5] third boot — the re-dispatch bound is durable
  ok   7a the third boot recovers cleanly and the generation keeps counting restarts (3)
  ok   7b the third boot does NOT re-dispatch r-2 again (the durable counter is exhausted at maxAttempts 2)
  ok   7c the exhaustion names its reason
  ok   7d the marker reports it
  ok   7e the board (rebuilt by replaying the journal) and the human ledger (restored from its envelope) both survived the third boot

[6] the durable artifact
  ok   8a the state lives in ONE real file that the third process opened
  store file: D:\_tmp\vmu-goal1-e2e\vmu\state.json keys=18
  ok   8b the durable keys that carried the scenario all exist (resume/work/human/mailbox/tasks)
  durable keys: ballots,budget,chat,human,idempotency,ids,mailbox,meetings,members,middleware,packs,panel,phase,records,resume,settings.resolved,tasks,work

[7] G7 positive control — durable commit log BOUND: both projection contracts unchanged
  ok   9a the commit log is really durable (the REAL protocol from kernel/ballot.js, over a host store)
  ok   9b a first boot with the queue BOUND still recovers cleanly (binding it is not a recovery port)
  ok   9c the send still DELIVERS (the commit log wraps the body, it does not replace it)
  ok   9d G7 recorded the INTENT then the OUTCOME (one appended intent + 2 host rows: mailbox-send / accepted; no pending commit)
  ok   9e the approval gate still refuses the un-approved action with the queue bound
  ok   9f CONTRACT 1 UNCHANGED: the state faces still WRITE THROUGH on every wrapped mutation (no explicit snapshot)
  ok   9g CONTRACT 1 UNCHANGED: the mailbox state envelope is in the fold, without any snapshot() call
  ok   9h CONTRACT 2 UNCHANGED: the journal is STILL not written through (a commit log does not make it durable)
  ok   9i CONTRACT 2 UNCHANGED: the journal becomes durable only on the explicit flush (1 recorded refused command)
  ok   9j after the restart the unread mail comes from the STATE projection (1), not from the commit log
  ok   9k the two durabilities are DIFFERENT things: the commit log says "settled" while 1 mail is still UNREAD

=== VMU GOAL1 E2E: 63 passed, 0 failed ===   ← Round 8 版本（§⑦ 结束时）；Round 9 加 §⑧/§⑨ 后为 81/0
```

### 2.1 关键中间值（同一轮运行里打出来的真实对象）

- `reassignSteps`：boot 1 `applied=[{member:'r-2', childId:'c-gone', attempt:1}]`；boot 2 `applied=[{…, attempt:2}]`；
  boot 3 `applied=[]、exhausted=[{member:'r-2', attempts:2, reason:'…crash loop…'}]`；`reassignCalls` 全程长度 2、成员**只有** `r-2`。
- `inflight`（boot 2 状态）：`pending=1`、`interrupted=[{id:'w-1-…', owner:'r-1', reason:'kernel-start'}]`、`pendingNow=0`、
  `unackedMail=2`、`unackedMailSource='port'`。
- `lock`（boot 2 状态）：`attached:true, acquisitions:1, releases:1, held:false`，且 `storepolicy.status().locks === 0`。
- `restart`：`generation=1→2→3`，`durableKey='resume'`，`reason='kernel-start'`，`readBack=true`，boot 3 `reassignExhausted=1`。
- `human`：boot 1 `total=3 pending=2 activeVetoes=1 vetoPendingReasons=1`；重启后 `5a` 断言**同一个** `requestId` 仍在 pending；
  `6d` 批准后 `tasks.create` 成功且 id 为 `t-1`（`6e` 板上 1 条）。
- 状态投影的 journal 行（boot 3 `ledgers`）：`human {hydrated:true, mode:'state', restored:['vetoes','approvals']}`、
  `mailbox {hydrated:true, mode:'state', restored:true, skipped:[{what:'deliver-seam', …}]}`、
  `tasks {hydrated:true, mode:'journal', entries:1, skippedFailed:3}`；`unhydrated=[]`。

### 2.2 G7 正对照的真实对象（第 ⑦ 节）

- 提交日志 `status()`：`{durable:true, name:'mailbox', tickets:1, appended:1, done:1, numbering:'store-allocated…'}`；
  宿主 store 两行：`[0] = {ticket:1, op:{kind:'mailbox-send', from:'office', to:'r-1'}}`、`[1] = {ticket:1, done:true, outcome:'accepted'}`；
  `recover()` = `{ok:true, durable:true, tickets:1, pending:[], reason:'the durable log is settled'}`。
  ⇒ **意图先写、结果后写、无未完成提交**（这就是 G7 承诺的那一件事）。
- 投影侧（与第 ①② 节**同一套形状**，只是多了 queue 绑定）：`writesThrough >= 2`、`writeThroughFailures === 0`、
  fold 里 `mailbox` 是 `mode:'state'` 信封且 `value.data.boxes['r-1'].length === 1`（**未调用过 `snapshot()`**）；
  `tasks` 键**仍是 `[]` 种子**，显式 flush 后才变成 `{mode:'journal', entries:1, failed:true}`。
- 重启后：`unackedMail === 1`（来源 `port`，即 **state 投影**），而**同一时刻**提交日志已 settled ⇒ 两件不同的耐久。

### 2.3 退出契约的真实对象（Round 9 §⑧）

- `10b`（变更**同一 tick**）：`status().pendingWrites >= 1` —— 写穿 promise 在 `attachProjectionTo` 里**同步注册**，所以"还没落地"是当场的真相，不是猜的。
- `10c` 此刻 fold 里**还没有** `mailbox` 信封；`10e` **一次 `await settle()`** 之后
  `{ok:true, settled:true, pending:0, rounds:1, writeThroughFailures:0}`（同一 await，无 sleep、无轮询）；
  `10f` `mailbox`/`human` 都是 `mode:'state'`；`10g` `tasks` **仍是 `[]` 种子**（settle 不是 flush）。
- `10h` `flushAll()` = `{ok:true, flushed:[{key:'phase',…},{key:'tasks', entries:1, seq:1}], failed:[], skipped:[{key:'human', reason:'a state projection writes through on every mutation: it is already durable and needs no flush'}, …]}`。
- `10i` **第二个 store 实例**读到 `tasks = {mode:'journal', entries:1}`（那条被拒命令）⇒ **下一位读者看得到**；`10j` 只有写穿的那封邮件也在。
- `10k` `exit({reason:'drill-exit'})` = `{ok:true, writeThrough:{settled:true,pending:0,waitedMs:…}, journal:{failed:[]}, reason:'drill-exit'}`。
- `10l`（自适应）**shipped 装配确实调了它**：`kernel/index.js:1807 async shutdown({reason})` → `recovery.exit()`（core 落地后本探针自动由"具名缺口"翻成正断言）。

### 2.4 多实例的真实对象（Round 9 §⑨）

- `11b`：`meetings.open({type:'ordinary',chair:'m-1',roster:[…]})` → `{ok:true, meeting:'m1', …}`；第二个 → `'m2'`（**两个会同时活着**）。
- `11c`（**缺陷**）：`settle()` 之后耐久 `meetings` 键 = **`[]`（store 的种子）** —— 尽管它被声明为 state 投影；原因是装配的 `methodsOf[face] || []` 让它**没有任何被包裹的方法**。
- `11d`（**缺陷不因退出 flush 而消失**）：`exit()` 的 `journal.skipped` 里 `meetings` 具名"state projection … needs no flush"，下一位读者读到的仍是 `[]`。
- `11e`（**修法**）：同一面、同一接缝，`methods: ['open','close','attend','motion']` ⇒ 信封
  `{mode:'state', value:{face:'meetings', data:{live:'{"__map":[["m1",…],["m2",…]]}'}}}`（`live` 是 Map/Set 感知序列化，所以计数要读 `__map`）。
- `11f`（**重启**）：第三次 boot 的 `ledgers` 行 `meetings {hydrated:true, mode:'state', restored:true}`，`snapshot().data.live` 里**两个会都在**。

### 2.5 真装配 × 两个内核 × 一个 store 的真实对象（Round 10 §⑩）

- **12a**：`apply()` 同步返回，但它启动的链是 `store.open()`（真 fs）→ `hydrateIds()` → `recovery.recover()`（`vibe-math-vmu.js:562-595`）。
  **一个 `setTimeout(0)` 不够**：闩未上锁时每一次写穿都被 `VMU_RESUME_WRITE_BEFORE_READ` 拒（这正是我本轮先犯的 drill 错，已改成对
  `store.stats().open === true && restart.generation >= 1` 的**有界轮询**）。就绪后：`generation = 1`、`unhydrated = []`。
- **12b**：`status().projections.wrappedMethods` 里 `meetings`（`mode:'state'`）的包裹方法列表**非空**
  （前几个：`open/attend/leave/speak/interrupt/motion/…`）⇒ Round 9 抓到的 `methodsOf[face] || []` 缺陷在真装配上**确实已修**。
- **12c/12d**：真面上开 **2 会 + 2 票箱**（`meetings.open` / `ballotbox.open({question, options})`）；
  `await kernel.shutdown({reason})` ⇒ `status().shutdown.ok === true`、`pendingWrites === 0`
  ⇒ **退出缝现在是行为断言，不再是源码探针**。
- **12e**：另开一个 **raw `createStore`** 读同一 root：`meetings` 是 `mode:'state'` 信封且 `__map` 里 **2 个会**
  ⇒ **真装配 + 真 store 真的写下去了**。
- **12f（缺陷探针，自适应）**：pack 声明的是 **`ballots`**，而装配的适配表键是 **`ballotbox`** ⇒
  `notAttached: [{face:'ballots', reason:'no adapter in this assembly'}]`，于是那两个活票箱**从未被投影**（耐久键仍是种子）。
- **12g/12h/12i**：第二个内核实例就绪（`generation = 2`），`meetings` **两个会都在**、报告里 `meetings:state:true`、
  `unhydrated = []` ⇒ **"集合面就是注册表"在真装配上复核成立**（Round 6 的多实例缺口按此改判为**已关闭**，`ballotbox` 的键名不一致另记）。

## 3. 这份钻取**证明了**什么（逐条对应断言）

1. **冷启动＋重启的恢复是干净的**：全新 store 第一次 `recover()` 就 `ok:true` 且 `unhydrated` 为空（`1a`）；
   第二次、第三次同样 `ok:true`（`3a`、`7a`），11 步恢复全绿（`read→roster→children→reassign→inflight→ledgers→mailbox→watchdogs→flags→readback→outcome`）。
2. **"上次没干完"是可读的事实，不是猜的**：派出去的活在重启后被标 `interrupted` 且**具名理由**（`4a`），
   `pending`／`pendingNow` 把"找到几条、还剩几条"分开报（`4b`）。
3. **未读邮件计数是真的**：重启后 `unackedMail=2`（请求 + 注入指令），来源具名为 `port`（`4c`）。
4. **恢复是独占段**：真 `createStorePolicy` 锁被 `recover()` 取到、在 finally 释放（`4d`），端口面自证（`4e`）。
5. **重派只给缺失的人，且有耐久上界**：只对 `r-2`（宿主已不认其 `childId`）调用声明的策略，**从不**碰在活的 `r-1`（`4f`）；
   尝试次数**跨重启**累加 1→2（`4g`、`4h`）；达 `maxAttempts` 后第三次启动**不再重派**并具名 `crash loop`（`7b`、`7c`、`7d`）。
6. **人工干预的"在途"跨重启**：待批请求**同一个 `requestId`** 仍在（`5a`）、动作与尝试数在（`5b`）、
   欠下的理由仍是欠着（`5c`）、否决仍生效（`5d`、`5e`）且**仍可解除**（`5f`）。
7. **"未批准的动作真的没跑"是断言过的**：跨**两次**重启板一直是空的（`2b`、`6a`），重试不开第二个请求（`6b`、`6c`），
   **只有** `decide({allow:true})` 之后同一个调用才成功（`6d`、`6e`），欠下的否决理由可以真的写下（`6f`）。
8. **耐久产物是一个真文件**：`stats().file` 指向 `…/vmu/state.json`、`version=1`、`keys=18`（`8a`），
   场景依赖的 5 个键（`resume/work/human/mailbox/tasks`）都在（`8b`）。
9. **持久化机制本身也断言了**：state 面**每次包裹调用后自动写穿**（`2f`：`writesThrough>=5`、`failures=0`；
   `2g/2h`：**未调用任何 `snapshot()`** 就已在 fold 里看到 `human`/`mailbox` 的 state 信封），
   而 journal 面**没有**写穿（`2i`），必须由装配侧 flush（`2j`）。
10. **接耐用提交日志不改变任何一条投影契约（G7 正对照）**：用**真的** `createDurableCommitLog` 绑给 mailbox 后，
    ① 提交按协议留痕（意图→结果、无未完成提交，`9a`/`9d`），② 发送照旧投递（`9c`）、审批门照旧拒（`9e`），
    ③ **state 面仍自动写穿**（`9f`/`9g`）、**journal 面仍必须显式 flush**（`9h`/`9i`），
    ④ 重启后未读数来自 **state 投影**（`9j`），而提交日志**同一时刻已 settled**（`9k`）
    ⇒ **"提交耐久"与"投递/正文状态耐久"是两件事**，跨面不可互相替代。
11. **退出是一次可断言的契约（Round 9 §⑧）**：`await settle()` 之后"已耐久"是**事实**（一次 await、无 sleep）；`flushAll()` 刷 journal 并**具名**说明 state 键为何不用刷；**另一个 store 实例**（下一位读者）能在文件里看到结果；`exit()` 的 `ok` 是**两半边的 AND**。⇒ 装配的 `shutdown()`（core 已落地）有了可核对的语义，而不再是"看起来会落盘"。
12. **多实例靠集合面，不靠新机制（Round 9 §⑨）**：`meetings` 能同时开两个会、`snapshot()/restore()` 一次带走它们；**缺陷在于装配没给这个面任何被包裹的方法**（`methodsOf[face] || []`）⇒ 声明为投影却从未写过；**把方法列表填上，同一路径立刻耐久**（写穿落地、重启后两个会都回来）。
13. **真装配上复核成立（Round 10 §⑩）**：用**真入口**（最小假宿主 ctx）起**两个内核实例**读**同一个真 store**：K1 开 2 会后 `shutdown()`，**另一个 raw store 实例**立刻读到 `meetings` 的 state 信封（2 个会），K2 恢复后**两个会都在**、`unhydrated` 为空 ⇒ ① 多实例**不需要注册表机制**（集合面＋方法列表即够，Round 6 缺口**关闭**）；② 退出缝（`settle`×`flushAll`）在**真装配**上是可断言的**行为**，不再只是源码探针。

## 4. 这份钻取**没有证明**什么（边界，逐条点名）

- **没有宿主、没有子代理**：`children.list()` 与 `reassign.apply()` 都是**钻取里的回调**。
  ⇒ 它证明的是"引擎把缺失成员**只**交给声明的策略、并耐久计数"，**不是**"真的重启了一个子代理"。
  真实 spawn 走 `host-spawn.js`／`members.wake`，不在本钻取范围内。
- **不是真进程**：三次 boot 在**同一个 Node 进程**里，靠新建 store/面实例模拟"进程重启"。
  真正的崩溃（写一半断电）不在范围内；`store.js` 的原子 temp+rename 由 `vmu-store`/`vmu-stateversion` 另行覆盖。
- **写穿是异步的，所以"退出"这件事是钻取显式做出来的**：`settle()` 等已发起的写穿落地，`quiesce()` 再 flush journal。
  ⇒ 若真实宿主不这样做（**目前 `kernel/index.js` 就没有 flush**），journal 会整本留在内存里 —— 见 §5.1。
- **`inject` 走的是 mailbox 路径**（钻取里 `chat.send` 故意拒），所以"人插一句话进聊天面"的路径没被这条场景覆盖。
- **时间是注入的时钟**（`clock = () => (T += 1000)`），**没有真定时器**：`approvalTimeoutMs:0` 让回调路径不参与，
  超时/`default-allow` 分支不在这条时间线上。
- **`watchdogs` 端口没接**（钻取里 `N/A` 由状态面报出）：它在本仓是 N/A（vmu 无持久在飞时钟），
  ⇒ 钻取没有、也无法证明"看门狗刷新"。
- **单个成员的实例**：只用了两个名册行（`r-1` 活、`r-2` 缺）。多缺失成员、多实例注册表（`meeting`/`ballot`）未覆盖。
- **`meetingOpen` 等价物**：v5r 的"已开未收束"标记在 vmu 仍无等价物（具名缺口，未在本钻取中解决）。
- **第 ⑦ 节的提交日志是"宿主 store 的假实现"**：`append/readAll` 是内存里的两行；真实宿主的分配型 store
  （跨进程 ticket）不在本钻取中，`9a` 只说"协议接得上、语义照旧"，不说"生产 store 已验证"。
- **不是性能/规模测试**：81 条断言全在单文件、单机、毫秒级完成。
- **`10l` 是源码探针，不是行为断言**：它证明"shipped 装配**调用了**退出接缝"（`kernel/index.js:1807 shutdown()` → `recovery.exit()`），**不**证明"真 kernel/宿主跑一遍 `shutdown()` 之后端到端落地"——后者需要构造真装配（entry/宿主层与 verify 的行为门禁）。
- **§⑨ 只实测了 `meetings` 一面**：按同一 `methodsOf` 逻辑，`ballotbox`/`members`/`budget`/`chat`/`panel` 是**同形**的，但本轮**没有逐面实测**（不写成"已确认全族"）。
- **§⑨ 没说"哪个会还开着"**：`11f` 只证明"两个会回来了"；"未收束"的标记（v5r `meetingOpen` 等价物）由 reader-c 接手，**尚未落地**（本轮复核：全包 `grep meetingOpen|openMeeting|unclosed` = 0 命中）。
- **`settle()` 的 `waitedMs` 不是墙钟**：它取自**注入时钟**，在钻取里等于时钟刻度；不可解释的时钟走 `msStrict` 具名路径并让 `waitedMs` 退化为 `null`（`clockNote` 说明原因），**绝不传播 `NaN`**。
- **§⑩ 是"同进程的两个内核实例"，不是两个操作系统进程**：宿主侧只有一个**最小假 ctx**（`effect`/`on`/`tools.register`，取自 `vmu-entry.test.mjs` 的形状），没有真 DSH 服务、没有子代理、没有真定时器；"跨进程"在这里的含义是"**两套完整装配 + 同一个真 store root**"（真 fs、真 temp+rename）。
- **票箱的活体往返未被验证**：`12f` 实测的是**键名不一致**（pack 声明 `ballots`，适配表键 `ballotbox`）⇒ 票箱今天**根本没被投影**，所以"多实例跨实例恢复"这条结论**只对 `meetings` 做了活体证明**；`budget`/`chat`/`panel` 只证到"被包裹"（`12b` 的方法列表），未做活体往返。

## 5. 交给装配侧（core / pack）与验证面（verify）的事实

### 5.1 【具名缺口·装配】journal 没有写穿，必须在优雅退出时逐个 flush

- 实测（`2i`）：重启前 `tasks` 键**仍是 store 的 `[]` 种子** —— 尽管 boot 1 已经记了 2 条命令。
- 实测（`2j`）：`await resume.snapshot({ key: 'tasks' })` 之后，该键才变成 `{mode:'journal', entries:2, 全部 failed:true}`。
- 实测（boot 3）：`entries:1, skippedFailed:3` —— journal 重放**跳过失败命令**，只有真正成功过的那条被重放。
- **装配现状**（本轮全包只读复核，`vmu-verify` 亦独立复核）：`grep -rn "\.snapshot(\s*{" vibe-math-vmu --include=*.js`
  ⇒ 5 处命中，除 `kernel/alerts.js:205`（metrics 自己的窗口快照，无关）外**全在 `kernel/resume.js` 内部**
  （`:508` phase 键／`:534` 写穿闭包／`:551` 写入函数本身）；`grep -rn "snapshot|flush" vibe-math-vmu --include=*.yml` ⇒ **零命中**。
  ⇒ **出货包里没有任何一处装配/宿主在退出时 flush journal**（不是"`index.js` 忘了"，是全包都没有）；
  **只有测试**会显式 `snapshot({key})` —— 这正是"分面测试全绿"与"装配不 flush"可以同时为真的原因。
- 语义边界：journal 模式**故意**不做写穿（每条命令一次写 = 每轮一次真文件 I/O）；这不是缺陷，而是契约，
  所以钻取把"契约"和"缺口"分开断言：state 面自动写穿（`2f`），journal 面必须显式 flush（`2i`→`2j`）。

### 5.2 【顺序语义】先恢复 state，再重放 journal（本轮真修的 bug，见 §6.2）

- 重放是**把命令重新执行到活面上**：`tasks.create` 会过审批门，门要查 `human` 台账。
  按 attach 顺序重放 ⇒ 对着**空机构**执行历史，且副作用**写穿**，把**还没恢复的快照覆盖掉**。
- 实测症状（修前 boot 3）：门开出**新**请求 `approval-1` → 耐久 `human` 台账被自己从 3 条改写成 1 条 →
  随后 `human.restore()` 与"被自己改过的"快照一致 ⇒ 报 `idempotent`（`restored:[]`，**看起来像成功**），
  journal 则具名未水合（`VMU_HUMAN_APPROVAL_PENDING`）。**"看起来恢复了"正是本卷要防的失败。**
- 修后读数（§2.1）：`human` 恢复 3 请求 + 1 否决，`tasks` 重放成功 1 条、跳过 3 条失败命令，`unhydrated=[]`。

### 5.3 【可观测的顺序】审批门先于暂停

- 实测（`1f`/`2c`）：暂停期间的动作尝试被门具名拒 **`VMU_HUMAN_APPROVAL_PENDING`**，并**顺带开出一个请求**
  （所以 `2c` 的 `pending=2`：一个来自暂停期尝试，一个来自解除暂停后的尝试）。
- 钻取**按实测断言**（并把这个顺序写进断言名），没有替产品改语义。
  若产品上要"暂停优先、暂停期间连申请都不开"，那是 `kernel/human.js` + `control` 的取舍，需要单独一轮。

### 5.4 【跨面正对照·给 §21 用】绑定耐用提交日志不改变两条契约

- 形状（第 ⑦ 节，可直接引用）：**真的** `createDurableCommitLog({ store: fakeHostStore, clock, name:'mailbox' })`
  → `createMailbox({ ..., durableQueue: log })` → 同一套 `boot()`（state/journal 投影照旧挂）。
- 结论（全部为断言）：`9a` 日志 `durable:true`；`9c` 发送照旧投递；`9d` 意图→结果两行、无 pending；
  `9f`/`9g` **CONTRACT 1 未变**（state 面仍自动写穿、fold 里已有 state 信封且未显式 `snapshot()`）；
  `9h`/`9i` **CONTRACT 2 未变**（journal 仍要显式 flush）；`9j`/`9k` **两种耐久不同**（未读 1 封 vs 日志 settled）。
- 给 `ballotbox`/`mailbox` 的一句话判据（我认同 reader-c 的做法，写成断言而非注释）：
  **"未绑定 ⇒ 悄悄退回进程内"必须能从 `status()` 读出来**，否则就是本仓最忌的"声明与事实不一致"。
  本钻取**不**断言该字段（尚未存在），不把它写成"已验证"。

## 6. 钻取**抓出来的真 bug**（Round 8 的 3 个 ＋ Round 9 的 1 类）

### 6.1 journal 序列不续接（`kernel/resume.js` · `createProjection.record()`）

- **症状**：boot 2 记录新命令后，boot 3 的 `tasks` 被判 `VMU_RESUME_PROJECTION_GAP`
  `{kind:'hole', at:1, expected:3}` —— **整个键不可重放**（板没了）。
- **根因**：`adopt()` 只赋 `this.seq`，闭包计数器 `seq` 仍是 0 ⇒ 重启后第一条命令**又从 1 开始**，与已采纳的第 1 条撞号。
- **修法**：`seq = Math.max(seq, natural(this.seq, 0)) + 1`（`kernel/resume.js:181`）。
- **变异实验（两版都真跑过）**：改回 `seq += 1` ⇒
  ① 当前版本（含 §⑦）：`61 passed, 2 failed`、exit 1（`7a`、`7e`；§⑦ 的 11 条照旧全绿）；
  ② 加 §⑦ 之前的版本：`50 passed, 2 failed`、exit 1 —— **由 `vmu-verify` 独立复验**，并在还原后做过 sha256 比对。
  恢复修法 ⇒ `63/0`。⇒ 这条断言**真的会把缺陷咬住**，不是"恒过的绿灯"。

### 6.2 水合顺序（`kernel/resume.js` · `hydrate()`）

见 §5.2。修法：把 `wanted` 按 `modeOf()` 分两组 —— **state 键全部在前**，journal 键在后（组内保持原顺序）。
- **变异实验（真跑，锚点 `resume.js:596`）**：把两组的顺序对调（journal 在前）⇒
  `node tests/vmu-resume-e2e.test.mjs` = `61 passed, 2 failed`、exit 1，红的正是 `7a`
  （`unhydrated: tasks`，`code: VMU_HUMAN_APPROVAL_PENDING`，"the action is QUEUED…"）与
  `7e`（`{"tasks":0,"queue":1}` —— **一个凭空多出来的请求**，这就是"看起来恢复了"的指纹）；
  恢复修法 ⇒ `63/0`；`resume.js` 变异前/还原后 sha256 一致（`230412f8a423ea62…`）。
  ⇒ 第 2 个 bug 也**不是**"只有文字叙述"：同一条锚点能让钻取具名红。

### 6.3 空种子数组被读成"投影缺口"（`kernel/resume.js` · `hydrate()`）

- **症状**：全新 store 的**第一次** `recover()` 就 `ok:false`，`unhydrated:["tasks"]`（`1a` 修前一直红）。
- **根因**：`kernel/store.js defaultKeys()` 给数组型键（`tasks`/`members`/`meetings`/`ballots`/`work`）的默认值是 `[]`；
  凡同时被挂投影的键，`adopt([])` 必拒。
- **修法**：`Array.isArray(env) && env.length === 0` ⇒ 按 "nothing was projected (a first run)" 处理
  （行里具名 `seeded:'empty-array'`）；**非空裸数组仍是具名缺口**（原判定针对的情形不变）。
- **面更宽**：`members`/`meetings`/`ballots` 都是同样形状，所以修在引擎侧（一次修好一族），而不是把 `tasks` 一个键改成 `null` 种子。

### 6.4（同轮、在 human 面）`gate()` 的内部路径绕过了投影

- 早前读数：队列里"卡住等批"的请求在重启后**整条消失**。根因：`gate()` 调的是闭包里的 `approvalDecision`，
  而 `attachProjection` 包的是**公开属性** ⇒ 内部路径没被记录。
- 修法：`gate()` 改为 `api.approvalDecision(req)`（`kernel/human.js:389`，即公开形状上的那一个），
  与 attach 顺序无关。断言：`2c` → `5a`（**同一个 `requestId`** 仍在 pending）。

### 6.5（Round 9 / B）**"声明为投影"不等于"有人写它"**：装配的 `methodsOf` 让写穿永不触发（`kernel/index.js`）

- **症状**：`packs/v5r/settings/defaults.js:61` 把 `members/tasks/meetings/ballots/budget/phase/work/chat/panel/human` 声明为投影；`human` 无条件挂、`tasks` 有方法列表，**其余 state 面在 `methodsOf` 里没有条目** ⇒ `methods: methodsOf[face] || []` 传了空数组 ⇒ `attachProjection` **一个方法都没包裹** ⇒ 写穿 `after` **永不触发** ⇒ 这些键**从未被写过**（钻取 `11c` 实测：开了两个会、`settle()` 之后 `meetings` 键仍是 store 的 `[]` 种子）。
- **为什么"退出 flush 落地"救不了它**：`flushAll()` 按契约只刷 `mode==='journal'`，state 键具名进 `skipped[]`（`11d` 实测）。
- **修法与证据**：同一面、同一套接缝，**只把方法列表填上**（`['open','close','attend','motion']`）⇒ 信封落地、重启后两个会一起回来（`11e`/`11f`）。⇒ **Round 6 的"多实例注册表未做"可以改判**：机制不需要（集合面就是注册表），缺的是**装配的方法列表**。
- **观察形态**：`11c`/`11d` 是**自适应探针**——core 修好 `methodsOf` 后，同一次 boot 会自动翻成 "CLOSED: …now DOES write through"，所以修复不会留下一条误导的红。

### 6.6（Round 10 / task-78）空**对象**种子被读成"投影缺口"：真装配每次启动都报 `unhydrated:['budget']`

- **怎么发现的**：§⑩ 起真内核时 `recover()` 返回 `ok:false`，`unhydrated = [{key:'budget', code:'VMU_RESUME_PROJECTION_GAP', value:''}]`
  —— `value:''` 就是"一个**空对象**"（`Object.keys(env).join(',')`）。原因是 `kernel/store.js defaultKeys()` 把 `budget`（和
  `settings.resolved`）种子为 `{}`，而 `adopt({})` 必然拒（信封一定有 `v`/`mode`/`key`）。
- **为什么算真缺陷**：这是 Round 8「空数组＝首跑」的**姊妹形**（当时只治了 `[]`）；区别是它出现在**出货装配的每一次启动**上
  ⇒ "budget 已声明为耐久"与"真缺口"在状态面**无法区分**，`recover().ok` 恒为 `false`。
- **修法**（`kernel/resume.js` `hydrate()`）：`emptySeed` 判据从"`undefined`/`null`/空数组"扩为**再加空对象**，
  并具名 `seeded: 'empty-object'`；**有任何键的对象仍走具名缺口**（那条判据的本意不变）。
- **变异验证（真跑＋sha256）**：把空对象那一段改回 `false` ⇒ 钻取 **89 passed / 1 failed, exit 1**（`12i` 红，
  详情正是 `unhydrated:[{key:'budget'}]`）；还原后 sha256 `5A8ACD51C2705165B75AB41CB3D4FCDAE66A4880D4281DD0F41034D9D2B292B4` 前后一致 ⇒ **90/0**。

## 7. 复现纪律（本轮遵守的约束，便于复核）

- **不在仓库根跑全量、不跑生成器 `--write`、不动 git**：本轮所有命令都是"读 + 定向测试"。
- 临时文件只在 `D:\_tmp`（钻取 store、日志、一次性探针），**跑完删除**；一次性探针脚本不留在仓库里。
- 文本批量改写只用 Node（PowerShell 文本管线会破坏 UTF-8，本仓已有两次前车之鉴）；
  本轮对 `resume.js`/`human.js`/测试/文档的改动全部走**定点编辑**，改完 `node --check`。
- **不给绿灯改断言**：断言改动都来自"实测行为与预期不符，且实测行为是**对**的"，且都在此点名：
  ① `1f` 的暂停期拒因（门先于暂停，实测 `VMU_HUMAN_APPROVAL_PENDING`，按实测断言并把顺序写进名字）；
  ② `7b` 的重派次数（第一版把"boot 1 也会对账重派"漏算了，`maxAttempts` 改为 2 后，1→2→穷尽这条线才可判定）；
  ③ 新增的 `9d`：第一版写成 `appended === 2`，**实测是 1** —— `createDurableCommitLog` 的 `appended` 数的是
  **意图数**（只有 `reserve` 自增，`complete` 不自增），所以改成更贴近协议的断言：
  `appended === 1` ＋ 宿主两行（intent / outcome:'accepted'）。这是"按实测改断言"的正确方向，不是把红改成绿。
- **先跑再写（本轮的一处自我纠正）**：加 §⑦ 后，"变异读数 = 61/2"我第一版是**推断**（63−2）写下的，
  随后**真跑**确认一致（`61 passed, 2 failed`）。推断与实测一致，但规矩是先跑再写 —— 本文与报告里现已全部为实测值。
- **变异实验还原按哈希校验**：Round 8 两次（`resume.js` 序列／水合顺序）sha256 一致（`230412f8a423ea62…`）；
  Round 9 一次（删 `pendingWrites.add(p)`）sha256 一致（`4F18F95C2A916926…`）⇒ 69/5 → 81/0。

## 8. 关联

- `_handoff/vmu/resume-round11-report.md`：Round 11 完整报告（B 多实例复核＋`12f CLOSED`／C 种子普查＋反例／**A＝F51 域标记落地**＋4 条断言＋变异／RULE E 与 docs/03 登记）。
- `_handoff/vmu/resume-round10-report.md`：Round 10 完整报告（真装配 × 两内核 × 真 store、`{}` 种子缺陷、A/C 复核、命令与退出码）。
- `_handoff/vmu/resume-round9-report.md`：Round 9 完整报告（退出契约 §⑧、多实例 §⑨、RULE F、命令与退出码）。
- `_handoff/vmu/resume-round8-report.md`：Round 8 完整报告（改了哪些文件、跑了哪些套件、退出码）。
- `_handoff/vmu/06-goal1-verdict.md`：目标 1 终判（本钻取是其"端到端"证据，缺口清单以本文件 §5 为准）。
- `vibe-math-vmu/docs/07-durability-library.md` **§16**：三条恢复面规则 ＋ G7 正对照（含改前改后的实测读数）。
- `vibe-math-vmu/docs/26-turn-orchestration.md` **§7 Round 8 增补**：编排面照搬用的三组读数、两条装配动作、G7 正对照。
- 第 ⑦ 节的由来：`v5r-reader-c` 在 Round 8 收尾时**点名要一条"绑定 `durableQueue` 后两条契约各自照旧"的正对照**
  （作为其 §21 跨面引用的依据）。本节即该请求的答复；G7 的实现本身是他们的写域，本钻取只做**只读对照**
  （`createMailbox({ durableQueue })` 形参由他们本轮补上，我未改动 `kernel/mailbox.js` 一个字节）。
- 独立验收：`vmu-verify` 复跑 52/0（§⑦ 之前的版本）、独立完成同一条变异复验（锚点唯一性 ＋ `finally` 还原 ＋ 哈希比对），
  并把"退出路径不 flush journal"记入其矩阵 §9.7.10 / 证据 §10.11。
