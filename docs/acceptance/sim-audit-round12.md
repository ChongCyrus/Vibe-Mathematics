# 独立审计 第 12 轮 · lane B（audit-r12b）

- 审计对象：`Vibe-Mathematics`（vmu 内核 + v5r 规则包），只读审计。
- 基线：`main`，HEAD **`8128b17d`**；工作树**不干净**——并行 lane 的未提交改动（见下），本报告所有结论都在该工作树状态下取得：
  ```
  docs/acceptance/sim-audit-prompts.md            | 79 +++++++++++++ (另一 lane 的报告)
  scripts/sim/harness.mjs                         |  9 +++   (RUN 244: boot 传 faces)
  vibe-math-vmu/kernel/index.js                   | 16 ++++  (RUN 244: 导出 kernel.faces)
  vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js | 32 +++---
  vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js | 40 +++----
  vibe-math-vmu/packs/v5r/prompts/v5r-core.js     |  4 +--
  vibe-math-vmu/packs/v5r/prompts/v5r-corrections.js | 10 +--
  ```
  其中 `harness.mjs` / `kernel/index.js` 的改动（RUN 244）与 §2-M6 的"提示词里 agenda 行空值"直接相邻，我在 M6 里把两层分开说清楚了：**RUN 244 修的是"尺子缺 faces 导致模拟出来的 prompt 比真实短"**；我这一条是**绑了一个不存在的会议 id** 时，真实 faces 读不到会议、于是渲染空值——修 canon 之后这条依然存在。
- 探针与原始回执：`D:/_tmp/audit-r12/`（`p1-timeout.mjs`、`p3-gate.mjs`、`p4-abandon.mjs`、`p5-records.mjs`、`p6.mjs`、`p7.mjs`、`p8.mjs` 及各自 `.out.txt`；审计结束即删）。
- 台账口径：93 条 = 91 DONE + 2 PARTIAL（C10 Lean 部署、D2 用户裁定）。本报告不重复台账里已判定的项，只报**本轮新发现**或**台账 DONE 但新证据与之相反**的项。

## §0 方法与口径

1. **只用回执，不靠读码推断行为**。所有"事实"下面都贴了探针打出来的回执原文；代码行号只用来解释回执为什么长这样、并给出最小修法的落点。
2. **入口**：`scripts/sim/harness.mjs` 的 `boot({ root, clock, withPrompt, deliver, settings })`（内部已 `await kernel.store.open()`，不手写 ctx）。`clock` 固定为 `1_800_000_000_000` ⇒ 注入钟对应 `2027-01-15T08:00:00.000Z`，与宿主墙钟（2026-11-06）相差约两个月——这是 §2-M3"两个钟"的暴露器，不是探针造的。
3. **工具调用**一律 `h.call(name, args, { as })`，它走的是 entry 真实装配出来的 `handle.kernel`（不是 harness 的 prompt 采集内核）；`records.get({ id, includeBody })` 是对象签名。
4. **deliver 语义**（P6 期间实测确认）：seam 的返回值既可以是 `{ reply, childId, stopReason, attribution }`，也可以**直接是裸字符串**（`kernel/turn/index.js:2408` 的注释这么写，但没有 schema 检查）；返回 `{ output:[...] }` 会被 `String(raw)` 变成 `"[object Object]"`，得到 `VMU_TURN_NO_FENCE, replyLength:15, replyExcerpt:"[object Object]"`。这也说明**seam 的返回形状只有注释、没有可拒的契约**（见 §3-L3）。
5. **挂起与超时**：探针里 "HUNG(1500)" 表示该 `h.call` 返回的 Promise 在 1500ms 内没有 settle（用 `Promise.race` 判），不是进程崩溃；随后脚本继续做别的调用，以此证明**同一个进程里另一条工具面仍然健康**。
6. **只读**：本轮没有改任何产品码/测试/生成物；唯一写的文件就是本报告。`git status` 里属于我的新增只有 `docs/acceptance/sim-audit-round12.md`（探针在仓库外的 `D:/_tmp/`）。

## §1 高危（4 条）

### H1. 回合在途时，root 的整个回合面（含只读 `status` 与释放阀 `abandon`）都被自己的队列挡住

**回执（P3，`p3-gate.out.txt`）**。`op:"step"` 投递 park 后 200ms，逐路竞速 1500ms：

| 路径 | 结果 |
| --- | --- |
| `h.kernel.turn.status()`（进程内直调） | 正常返回：`turnReceipts:[{"turn":"t-1",…,"status":"open","unavailable":[{"field":"reply","why":"this turn has not settled in THIS kernel yet…flips to applied/failed"},…]}]` |
| `h.specOf('vibe_vmu_turn').execute({op:'status'},{kernel})` | **HUNG(1500)** |
| `h.call('vibe_vmu_turn',{op:'status'})` | **HUNG(1500)** |
| `h.call('vibe_vmu_turn',{op:'abandon',turn:'t-1',why:'probe'})` | **HUNG(1500)** |
| `h.call('vibe_vmu_records',{action:'list',limit:1})`（同一刻） | 正常返回 `total:0` |

⇒ 挂起**不在内核**、也不在整个工具面，而在 `vibe-math-vmu/tools/turn.js:470` 的 `let turnQueue = Promise.resolve()`：`:496-498` 对 **root 调用者一律** `const job = turnQueue.then(() => coreTurnInner(args, exec), …); turnQueue = job.catch(()=>{}); return job`（只有成员调用者 `memberCaller` 在 `:490` 拿到直通，且只许 `status`/`reply`）。一个在等 deliver 的 `step` 会把队列占住，于是排在它后面的 `status`/`abandon` 在**投递返回之前永远不会被调用**。

**读者会得出什么错结论**：
- office 调 `op:"status"` 想"看看卡在哪"，回执却是**迟到 N 分钟（最长到投递超时 900000ms）之后的快照**；如果投递永不 settle（进程级卡死），这个调用也永不返回。RUN 241 加 `turnLoop`/`inFlightForMs` 的**全部目的**就是"让所办在回合卡住时看见它"——而这条路上恰好看不见。
- 更糟的是 `op:"abandon"`（RUN 241 / FEEDBACK64-M1 为"永不 settle 的回合必须能从外面关掉"而加的释放阀）在 root 面上**永远排在它所想关掉的那个 step 后面**，因此**从 root 面不可达**。P4 证明内核的 `abandon` 本身工作正常——是这个 op 到不了它。真正还能触到 `kernel.turn.abandon` 的只有绕过队列的调用者：会议面 `packs/v5r/tools.js:4433` 的 `step = await kernel.turn.step({…})`，以及 `:4065` 的 `abandonAfterMs` 兜底（它同样要等"另一个 step 调用"来触发）。
- `tools/turn.js:471-478` 的注释自己记了同族事故（G6：成员嵌套调用排在自己的 step 后，等了 175.7s 撞上投递超时），**修法是只给成员开直通，没给 root 的 status/abandon 开**——于是"观察面"和"释放面"仍然共享同一把队锁。

**最小修法**：把 `op:"status"`、`op:"reply"`（读 / 交回，不新开回合）与 `op:"abandon"` 在 root 上也走直通；只对**会新开回合**的 `step`/`drive`/`reopen-closure` 保留串行队列（`:496-498` 的 `turnQueue` 分支加一个 `const serialize = op==='step'||op==='drive'||op==='reopen-closure'`）。或者给队列加"只串行 mutating op"——但最小、最不伤语义的是前者。

**判它修好了的断言**（永久的回归测试，放 `tests/`）：`const h=await boot({root,clock,deliver:neverReturns}); await h.call('vibe_v5_start',{problem:'x',researcherCount:1}); const stepP=h.call('vibe_vmu_turn',{op:'step',member:'r-1',phase:'normal'}); await sleep(200); const st=await Promise.race([h.call('vibe_vmu_turn',{op:'status'}).then(()=> 'ok'), sleep(1500).then(()=> 'hung')]); assert.equal(st,'ok')`；并且同一探针里再断言 `await h.call('vibe_vmu_turn',{op:'abandon',turn:st.status.turnLoop.inFlightTurn})` 在 1500ms 内返回 `{ok:true,abandoned:true}`。

### H2. `abandon` 回执承诺"Nothing was applied"，迟到的回复照样写账，并把行从 `abandoned` 覆盖成 `applied`

**回执（P4，`p4-abandon.out.txt`）**。内核直调 `h.kernel.turn.abandon({turn:'t-1',why:'probe'})`：

```json
{"ok":true,"abandoned":true,"turn":"t-1","member":"r-1","openedBy":"drive","meeting":null,
 "ageMs":146,"closedWith":"VMU_TURN_ABANDONED","clearedParked":false,
 "turnRow":{ "turn":"t-1", … ,"status":"abandoned","codes":["VMU_TURN_ABANDONED"] },
 "means":"this turn is CLOSED, not completed: the loop lock is released and the next op:\"step\"/op:\"drive\" opens a real turn. Nothing was applied - an abandoned turn has no outcome; …"}
```

随后让这个回合的 deliver **迟到返回**（围栏里带 `say` + `progress`），**同一个 step 的 Promise 回执是成功**：

```json
{"ok":true,"receipt":{"round":1,"member":"r-1","fields":["say","progress"],"executed":1,
  "executedDetail":[{"field":"progress","face":"vmu.records","op":"put",
    "result":{"ok":true,"id":"rec-1","slug":"late-write",…}}]}}
```

再读 `op:"status"`，同一行（`turn:"t-1"`）变成：

```json
{"turn":"t-1","member":"r-1","openedBy":"drive","phase":"normal","meeting":null,
 "openedAt":"2027-01-15T08:00:00.000Z","status":"applied","fields":["say","progress"],
 "executed":[{"field":"progress","channel":"vmu.records.put"}],
 "writes":[{"tool":"vmu.records.put","recordId":"rec-1"}],"codes":["VMU_TURN_ABANDONED"],…}
```

并且 `vibe_vmu_records {action:"list",by:"r-1",limit:0}` 真的读到 `{"total":1,"records":[{"id":"rec-1","track":"progress","title":"late write","writer":"r-1","updatedAt":1800000000000}]}`。

**读者会得出什么错结论**：
- 收 `abandon` 回执的人认为"这一轮什么都没落地、没有结果"，**账上和记录面上却多了一行由该回合写出的记录**。
- 读 `status` 的人看到 **`status:"applied"` 与 `codes:["VMU_TURN_ABANDONED"]` 在同一行并存**——一个字段回答两个问题（"应用了吗"既答"是"又答"它被抛弃了"）。而 `status==='applied'` 正是"成员答了并且写回成功"的意思，于是"抛弃"这个事实在整个可读面上**只剩下一个 refusal code 的残留**。
- 若把 `abandon` 修成 H1 那样可达（这是本轮建议），这条会立刻变成**线上高频**：office 关掉一个卡住的回合后，迟到的子会话回来把记录写进去——正是"关掉了但没关掉"。

**最小修法**：在 `dispatchReply`（`kernel/turn/index.js:3430-3535`）入口加一道归属检查：`const row = turnReceipts.get(turn.id)`；若 `row && row.status === 'abandoned'`（或 `settledTurnIds` 已有该 turn），**不 apply**，改为 `noteTurnReceipt(turn,{ status:'abandoned', closedWith:'VMU_TURN_ABANDONED_REPLY_DROPPED', settledBy:'late-reply', droppedReply:true, fields: parsed.fields })` 并让 step 回执返回 `{ok:false, code:'VMU_TURN_ABANDONED_REPLY_DROPPED', abandoned:true, why:'the turn was closed while its delivery was still in flight; its answer arrived afterwards and was NOT applied'}`。记录面已有"迟到副本身"的先例（`abandonTurn` 的 `clearedParked`）——关键是**别把迟到答案当成功**。

**判它修好了的断言**：P4 剧本原样跑一遍，断言 (a) 迟到 step 回执 `ok===false && code==='VMU_TURN_ABANDONED_REPLY_DROPPED'`；(b) `vibe_vmu_records {action:'list',by:'r-1',limit:0}` 的 `total===0`；(c) `status().turnReceipts` 里该行仍是 `status==='abandoned'` 且**不含** `writes`。

### H3. 单轮锁不校验持有者：旧回合的 `finally` 会清掉**新回合**的锁，同一时刻可以有两轮在途

**回执（P4 后半段）**。t-1 被 abandon、t-2 由会议面直调 `kernel.turn.step` 开起来（deliver 仍 park），随后 **t-1 的迟到返回让 t-1 的 `runFrom`/`run` 的 `finally` 执行**，此时 `turnLoop` 变成：

```json
{"inFlight":false,"inFlightTurn":null,"inFlightMember":null,…}
```

而 t-2 的 deliver **还在 parked**（`parked=2`）。接着 t-3 被开起来（`parked=3`），`status` 同时出现**两行 `status:"open"`**（t-2 与 t-3），而 `turnLoop` 只报 `inFlightTurn:"t-3"`。

**读者会得出什么错结论**：
- `turnLoop.inFlight===false` 与"t-2 的投递仍在等"直接相反；读者（和任何"卡住就重投"的自动逻辑）会认为"现在没有回合在跑，可以放心开下一轮"，而此时**已经有一轮还挂着**。
- 两个回合同时在途 ⇒ 成员两次执行、两份记录、两把 active-member 标量互相踩；而只读面只承认最后一个，第二个变成**不可见幽灵**。
- 根因是锁没有所有者：`kernel/turn/index.js:3602` `inFlightTurn = turn`、`:3769-3771 finally { inFlightTurn = null }`，`:4061-4081 run()` 的 `finally { turnInFlight=false; turnInFlightSince=0 }`——**都不判断"这把锁是不是我的"**。`abandonTurn`（`:3990`）同理直接清。

**最小修法**：锁值改成持有者令牌（如 `turn.id`/`turn.seq`），所有清理处 `if (inFlightTurn && inFlightTurn.id === turn.id) inFlightTurn = null`；`turnInFlight` 同样只在 `turnInFlightTurn === turn.id` 时清。`abandonTurn` 已经收到 `turn` 参数，加一句归属判断即可。配套：`status().turnLoop` 增加 `inFlightCount`（在途行数，从 `turnReceipts` 里 `status==='open'` 数出来）——现在只有一个布尔/单值，无法表达"两轮在途"。

**判它修好了的断言**：P4 剧本改为"t-1 abandon → t-2 park → t-1 迟到返回 → 断言 `turnLoop.inFlight===true && inFlightTurn==='t-2'`"；再断言 t-3 的 `step` 被 `VMU_TURN_REENTRANT` 具名拒绝（而不是开起来），且 `turnReceipts` 里只有 t-2 一行 `open`。

### H4. 投递超时被"重试一次"并重包装成 `VMU_ENGINE_UNAVAILABLE`：回执丢字段、行说 `undelivered`、成员可能双执行

**回执（P1，`p1-timeout.out.txt`）**。`deliver` 两次都抛 `{code:'VMU_TURN_DELIVERY_TIMEOUT', stillRunning:true, partial:{…}, waitedMs:1125039}`（seam 超时）。`op:"step"` 回执：

```json
{"ok":false,"code":"VMU_ENGINE_UNAVAILABLE",
 "message":"the host refused to start this member turn twice on the one-shot path: host seam waited 900000 ms for the child session and gave up waiting",
 "receipt":null}
```

缺失：`partial` / `stillRunning` / `stillRunningMeans` / `workspaceHint` / `waitedMs` / `deliveryTimeoutMs`（`tools/turn.js:370-388` 的 catch 只在 `e.partial` 存在时才保这些字段，而到这里的是被重包过的错误）。行是：

```json
{"turn":"t-1","status":"undelivered","closedWith":"VMU_ENGINE_UNAVAILABLE","settledBy":"delivery-threw"}
```

`counts.deliveryLastFail.stillRunning === false`（内层错误是 `true`）。`DELIVER_CALLS=2`。

**读者会得出什么错结论**：
- 把"成员正在跑、只是超过了 900000ms"读成"宿主机拒绝启动成员回合（引擎不可用）"——于是**去重启/换宿主**，而不是去等或去看 partial。`stillRunning:false` 进一步否定了"它还在跑"。
- `VMU_TURN_DELIVERY_TIMEOUT` 这个语义（续跑包装 `kernel/turn/index.js:1021-1059` 明确把它当"绝不能降级重投"的码）在**外层**被抹掉了；而重试本身已经**第二次投递**（成员可能执行两遍）。重试对"投递前的启动失败"是安全的，对"投递中/投递后超时"不安全——代码没有区分。
- 这与 RUN 51 明确要修的"超时要保住 partial 让所办知道跑到哪了"相反：修在了 `tools/turn.js`，但错误在到达它之前就被 `kernel/turn/index.js:763-779` 换掉了。

**最小修法**：`kernel/turn/index.js:763-779` 的重试只对**可证明未投递**的错误（例如 `VMU_ENGINE_UNAVAILABLE` / no-handle / 同步 startup throw）生效；对 `e.code==='VMU_TURN_DELIVERY_TIMEOUT'`（或任何 `e.partial` / `e.stillRunning===true` 的错误）**原样 rethrow**，让 `stepFailure`/`tools/turn.js` 的 partial 分支生效。若保留包装，也必须 `Object.assign(new Error(…), pick(e,['code','partial','stillRunning','waitedMs','deliveryTimeoutMs','cause']))` 并把 `attempts` 写进回执。

**判它修好了的断言**：同 P1 探针，断言 `step.ok===false && step.code==='VMU_TURN_DELIVERY_TIMEOUT' && step.partial && step.stillRunning===true && typeof step.waitedMs==='number'`，并且 `step.attempts===1`（不重投）或 `2` 但 `code` 仍是超时；行状态 `undelivered/settledBy:'delivery-threw'` 保留，`deliveryLastFail.stillRunning===true`。

## §2 中危（6 条）

### M1. 会议 id 打错时，回执把"会议不存在"诊断成"成员写了个没有形状的字段"，并**整轮中止**——同轮本来能写的内容一起丢

**回执（P8，`p8.out.txt`）**。`op:"step", member:'r-1', phase:'meeting', meeting:'m-typo'`，围栏里 `{say, progress}`：

```json
{"ok":false,"code":"VMU_TURN_FIELD_NOT_APPLICABLE",
 "message":"this turn was not given a meeting tool, and no meeting is open: the reply field \"say\" cannot be applied (no meeting is open (id: m-typo))",
 "hint":"the member answered with a field no tool in this turn could produce; check instructionDelivered on the turn receipt, and the per-turn tools allowlist. The underlying meeting error is kept as cause.",
 "receipt":null}
```

行：`{"status":"failed","fields":["say","progress"],"executed":[],"skipped":[],"writes":[],"codes":["VMU_TURN_FIELD_NOT_APPLICABLE"]}`。**对照组**：同样 `meeting:'m-typo'`、围栏只写 `{progress}` ⇒ `ok:true`，`progress` 正常落成 `rec-1`；**再一组**：完全不绑会议、围栏 `{say, progress}` ⇒ `ok:true`，`say` 被 `skipped`（`reason:"no-meeting-bound"`）、`progress` 照写。

**读者会得出什么错结论**：
- 消息说"这一轮没给成员会议工具、也没有会议开着"，hint 让去查 `instructionDelivered`/工具白名单——**两句话都与事实相反**：回合给了会议工具，问题是 office 写了一个不存在的会议 id。照着 hint 查的人会去翻工具白名单，永远找不到"是我 id 打错了"。
- `skipped:[], executed:[], writes:[]` 且 `receipt:null` ⇒ 读者不知道"进度记录也没写"；而对照组证明它**本来能写**。一个字段的失败吞掉了整轮剩下的写回 ⇒ "合法的动作被一个坏字段连坐"，这正好是 `skipped` 机制存在的意义（同一次运行里，另一种原因就正确 skip 了）。
- 代码落点：`kernel/turn/index.js:3362-3371`——`catch (e) { if (e.code === 'VMU_NO_OPEN_MEETING') { … err.code='VMU_TURN_FIELD_NOT_APPLICABLE'; throw err } }`。**throw 直接跳出 dispatch 循环**（`:3357-3382`），所以后面的 `progress` 永远轮不到。

**最小修法**：两种情况分开：(a) 字段自带会议 id 且 `VMU_NO_OPEN_MEETING` ⇒ 保留原因的**具名**拒绝 `VMU_MEETING_NOT_OPEN`，message 里点名 `meeting:"<id>"` 与两个出口（`vibe_v5_meeting` 开会 / `vibe_v5_meeting_round` 重绑），hint 面向 **office**（"你传给 step 的 meeting 不是一场开着的会"），而不是面向成员的字段形状；(b) 走 `skipped.push({field,code:'VMU_TURN_FIELD_NOT_APPLICABLE',reason:'meeting-not-open',…}); continue`——**一个字段的问题只记该字段**，不要中止整轮。若保留 fail-fast，至少把已成功的 `executed/writes` 放进失败回执（现在 `receipt:null` 把它们全丢了）。

**判它修好了的断言**：P8 剧本断言 (a) 回执 `code==='VMU_MEETING_NOT_OPEN'` 且 `message` 含 `m-typo` 且**不含**"not given a meeting tool"；(b) `vibe_vmu_records {action:'list',by:'r-1',limit:0}` 的 `total===1`（progress `p1` 写进去了）。

### M2. `status().turnLoop` 缺 8 个键；RUN 242 的测试只断言内部 `turnLoop()`，agent 可见面无人守

**回执（P1 `op:"status"` 的 `turnLoop`）**：只有
`{inFlight, inFlightTurn, inFlightMember, inFlightOpenedBy, inFlightForMs, abandonAfterMs, abandonsImmediately, wakeQueue, wakeQueueMeans, recentAbandonments}`。
而 `kernel.turn.turnLoop()`（`kernel/turn/index.js:4804`）另有 `inFlightMeeting, deliveryTimeoutMs, deliveryGraceMs, deliverySeamBudgetMs, timeoutOrder, timeoutOrderMeans, turnInFlightMeans, wakeQueueDepth`。`status()` 在 `:4906-4941` **手写**了另一个对象，所以两个面可以各自漂移。

**读者会得出什么错结论**：office 想知道"投递超时是多少、超时后先弃还是先拒"，按文档去读 `status().turnLoop.deliveryTimeoutMs` ⇒ `undefined`；读者会以为"这个内核没配超时/不知道超时"，而实际上 `turnLoop()` 里有 900000/1800000 等确定值。`:242` 的 `turnsMeans` 甚至没提 `turnLoop`，读者更难发现少了什么。

**最小修法**：`status()` 里先 `const loop = turnLoop()`，再按需要窄化（保留值来源唯一），或在 `:4906` 处 `Object.assign({}, turnLoop(), {…})`；加 `turnLoopMeans` 说明"同一个对象就是 `kernel.turn.turnLoop()` 的值"。

**判它修好了的断言**：`tests/vmu-run242-feedback65.test.mjs` 的 §3 增加一段**工具面**断言：`const st = await h.call('vibe_vmu_turn',{op:'status'}); for (const k of ['deliveryTimeoutMs','deliveryGraceMs','deliverySeamBudgetMs','timeoutOrder','turnInFlightMeans','inFlightMeeting']) assert.ok(k in st.status.turnLoop)`。

### M3. `counts.deliveryLastFail` 同一个对象里两个钟：`at` 用墙钟，`writesWindow.from/to` 用注入钟

**回执（P1）**：`{"at":1793929816635, …, "writesWindow":{"from":"2027-01-15T08:00:00.000Z","to":"2027-01-15T08:00:00.000Z","by":"r-1","enumerated":false,"readWith":"vibe_vmu_records { action:\"list\", by:\"<the by above>\", since:\"<the from above>\", until:\"<the to above>\", limit:0 }",…}}`。`at` 是 2026-11-06 墙钟，窗口是注入钟 2027-01-15——**同一回执内相差约两个月**。

**读者会得出什么错结论**：把 `at` 与 `writesWindow.from/to` 当同一根时间轴 ⇒ 得出"这次投递失败发生在窗口之后两个月"，而文档/字段名（`writesWindow`、`readWith`）都在暗示它们描述同一次失败。用 `at` 去和记录面的 `updatedAt` 比（records 时间源是注入 clock）⇒ 永远对不上，读者会得出"失败发生在记录之后/成员没写任何东西"的相反结论。代码：`kernel/turn/index.js:2376-2404`，`at: Date.now()`；`kernel/index.js:2819-2825` 的注释记录过同族（vote 行墙钟 vs `frozenAt` 注入钟）并已修，本处漏了。

**最小修法**：`at: isoStampOf(clock())`（与同对象内其它时间同源），需要墙钟就另开 `atWall` 并加 `atSource/atMeans` 说明两者不是一根轴。

**判它修好了的断言**：P1 探针断言 `Date.parse(deliveryLastFail.at) === Date.parse(deliveryLastFail.writesWindow.to)`（固定 clock 下）。

### M4. 行状态词表三套：注释/文案说 `settled`，实际写 `applied`

**事实**：`kernel/turn/index.js:2001-2004` 注释：「A turn row's status is one of: open … settled (the member answered), undelivered … failed … abandoned」；但全文件唯一写成功状态的是 `dispatchReply` 的 `:3498-3505` `noteTurnReceipt(turn,{status:'applied',…})`（grep 全仓 `status:'settled'` 零命中）；`tools/turn.js:242` 的 `turnsMeans` 仍写 "HOST BOOKKEEPING of each turn the loop settled (or still has open)"。P6 实测行：`{"status":"applied",…}`。

**读者会得出什么错结论**：按注释/文案写 `rows.filter(r=>r.status==='settled')` 的人**永远得到空集**，并据此报告"这个内核里还没有任何回合完成过"——而同一回执的 `turns` 里明明有 `applied` 行。反向：`unavailable` 的文案（`:1987` "flips to applied/failed"）又是对的，于是同一份代码里"哪种是完成"有两个答案。

**最小修法**：`settled` 这个词只留给人话（means），行值统一成 `applied`；把 `:2001-2004` 注释与 `tools/turn.js:242` 的 `turnsMeans` 同时改掉，或者在 status 回执里加 `statuses:['open','applied','undelivered','failed','abandoned']` 让词表可读。

**判它修好了的断言**：一条 grep 断言（`grep -q "status:'settled'" vibe-math-vmu` 为假）+ 一条运行断言：跑一轮成功回合后 `status().turnReceipts.some(r=>r.status==='applied')`，且 `turnsMeans` 含 "applied"。

### M5. 行里的 `fields` 同时回答"成员写了什么"和"应用了什么"

**回执（P6）**：`{"status":"applied","fields":["say","progress"],"executed":[{"field":"progress",…}],"skipped":[{"field":"say","reason":"no-meeting-bound","code":"VMU_TURN_FIELD_NOT_APPLICABLE"}],"writes":[{"recordId":"rec-1"}]}`。

**读者会得出什么错结论**：`fields.length`（2）读作"应用了两个字段"，于是认为 `say` 也落地了；而 `executed:1`、`skipped` 里 `say` 明明没执行。`fields` 的真实语义是"回执里被保留的字段"（kept），不是"已应用"（applied）。同一行里三个字段（`fields`/`executed`/`skipped`）回答同一个问题的三个不同切片，却没有任何 `fieldsMeans` 说明。

**最小修法**：行里加 `fieldsMeans:'fields = the reply fields this turn KEPT (its own input), not what was applied: applied is executed, held-back is skipped'`，或把键改名 `fieldsKept`（保留旧键做兼容并标注 deprecated）。

**判它修好了的断言**：一条测试断言 `row.fieldsMeans` 存在且 `row.fields.length === row.executed.length + row.skipped.length` 在"全部字段要么执行要么跳过"的剧本里成立。

### M6. 会议 id 不做存在性校验：提示词对成员说"你的发言会投到这场会"，成员读到的 agenda 是空值且自检句不触发

**回执（P6 `prompts.assembleFor`，与真实入口同一个 `faces` 映射）**：`phase:'meeting'`、`meeting:'m-does-not-exist'`（文件名 `p6.out.txt` 里记为 `m-does-not-exist`；P7/P8 用 `m-typo` 走真实 step）组装出：

```
议程：（类型：，主席：）。本轮绑定该会议：回复第一句请写明会 id（m-does-not-exist）。
```

而 `packs/v5r/prompts/v5r-blocks-b.js:750-751` 的自检句写的是：「上面议程/类型/主席若为「未提供」、id 为空，就是本回合没有绑定会议」。**这里的值是空字符串（不是「未提供」）、id 非空** ⇒ 自检句的两条判据都不成立，成员只能读成"我绑了一场类型和主席都空白的会议"。同回合的 `meetingDelivery`（`kernel/turn/index.js:2189`）更是明说「本回合绑定会议 m-typo：**你的发言会投到这场会**」——而实际写回时 `say` 得到 `VMU_NO_OPEN_MEETING`（见 M1），整轮失败。

**读者会得出什么错结论**：成员相信自己的发言会进入 m-typo，于是**不再用工具面另说一遍**（那本来就是这一段的目的）；office 收 `abandoned`/`failed` 时也不知道是会议 id 打错。`tools/turn.js:531` 的 `meeting` 参数只做 `trim`（`:153`），`vibe_v5_meeting_round`（P7）才拒不存在/未开的会（`VMU_NO_OPEN_MEETING`）——**同一族两个面：一个校验、一个不校验，且不校验的那个还在提示词里作承诺**。

**最小修法**：`kernel/turn/index.js:2173` 的 `meetingFacts`：当 `boundMeetingId!==''` 且 `meetingRead===null`（读不到这场会）时，不要伪造"已绑定"的三空值行——`meetingDelivery` 改成「本回合绑定的会议 `<id>` 在本内核读不到（可能未开/已关/不是这场）：你的 say 不会投递，请先用工具确认会议 id」；类型/主席/议程渲染「未提供：该会议在本内核读不到」而不是空串。**同时**在 `tools/turn.js` 的 step/drive 入口对 `meeting` 做存在性/开着校验（用 `faces['vmu.meetings'].summary/snapshot`），不存在就 `VMU_NO_SUCH_OBJECT` 具名拒，别把错误留到写回阶段。

**判它修好了的断言**：P6/P7 剧本断言 (a) `step` 回执 `ok===false && code==='VMU_NO_SUCH_OBJECT'` 且 message 含会议 id；(b) 若仍允许绑定未知 id，则组装出的 prompt **不含** `（类型：，主席：）`，且含「该会议在本内核读不到」。

## §3 低危（3 条）

### L1. 记录面同一行列表里 `updatedAt` 有数字和字符串两种类型，library 行没有 `writer`

**回执（P6 `L_all`）**：
```json
{"total":2,"returned":2,"ids":["rec-1","s-7c8211f0"],
 "rows":[{"id":"rec-1","writer":"r-1","owner":"r-1","at":1800000000000,"title":"written by r-1"},
         {"id":"s-7c8211f0","owner":"shared","at":"1800000000000","title":"s"}]}
```
records 投影行的 `updatedAt` 是 **number**，pack library 行是 **string**（`"1800000000000"`），且 library 行**没有 `writer`**。

**读者会得出什么错结论**：用 `typeof updatedAt`/字符串比较/`r.updatedAt >= isoString` 排序或过滤的读者会得到**混合排序**（number 与 string 比较时 number 被转字符串，"1800000000000" vs "999" 之类的比较语义就变了）；按 `writer` 分组的读者会把 library 行归为"无作者"，而 `by:'office'` 在 office 刚 append 之后返回 `total:0`——读者会认为 office 什么都没写。回执里已有 `rowsFrom`/`libraryExcludedBy` 提示两个存储，但**行本身的形状**没有统一。

**最小修法**：`host.js:1034-1140` 合并前把 library 行规范化（`updatedAt: Number(...)`，`writer` 取 provenance/`'office'` 或显式 `writer:null` + `writerMeans`），或在回执里加 `rowShape` 说明两类行的差异。

**判它修好了的断言**：`list` 回执里所有行 `typeof r.updatedAt === 'number'`（library 行也一样），且 `by:'office'` 能读回 office append 的那行。

### L2. 记录面 `limit` 非法值静默回退默认页，回执不说它被忽略

**回执（P5）**：`{action:'list', limit:-3}` 与 `{limit:'2'}` 都 `ok:true`，且与不传 `limit` 的输出完全相同（走内核 `headListAt`）。`host.js:1014` 的参数说明是"`limit` 最大条数（0 = 全部；省略用 `vmu.records.headListAt`）"。

**读者会得出什么错结论**：传 `limit:'2'` 的调用者以为"只要了 2 条"，实际拿到默认页大小（可能多也可能少）——而 `truncated` 会据此回答"是否被截断"，于是"我要的范围"和"我拿到的范围"不一致，且回执没有 `limitApplied`。

**最小修法**：非整数/负数 `limit` 具名拒 `VMU_INVALID_ARGUMENT`（"limit must be a non-negative integer; 0 = all"），或在回执里回显 `limitApplied`。

**判它修好了的断言**：`{limit:-3}` 得到 `ok:false, code:'VMU_INVALID_ARGUMENT'`；`{limit:'2'}` 同样被拒（或回执含 `limitApplied:2`）。

### L3. deliver seam 的返回形状只有注释、没有可拒的契约（"合法的空/形状"被当成失败）

**回执（P4 第一次失败）**：seam 返回 `{ output:[{type:'text',text:reply}], stopReason:'end_turn' }`（harness 的 `simulateSubagents` 风格），被 `String(raw)` 变成 `"[object Object]"` ⇒ `{"ok":false,"code":"VMU_TURN_NO_FENCE","replyLength":15,"replyExcerpt":"[object Object]",…}`。

**读者会得出什么错结论**：宿主侧按"标准"返回 `{output:[…]}` 是常见形状，回执却说"成员没写围栏"，长度 15——读者会去查成员提示词/围栏语法，而真正的问题是**seam 的返回值没被识别**。`kernel/turn/index.js:2408` 的注释写了两种允许形状（`{reply,childId,stopReason,attribution}` 或裸字符串），但代码没有 schema 校验/具名拒，于是"错的形状"被静默字符串化成 `"[object Object]"` 再在下一层被误诊。

**最小修法**：`deliverTurn` 返回值在解析前做一次形状归一：字符串 ⇒ 原样；带 `reply` 的对象 ⇒ 取 `reply`；带 `output:[{type:'text',text}]` ⇒ 取拼接后的 text；其它 ⇒ 具名拒 `VMU_SEAM_BAD_RESULT` 并给出允许形状，别让 `String(obj)` 静默变成 `"[object Object]"`。

**判它修好了的断言**：seam 返回 `{output:[{type:'text',text:fence(...)}]}` 的回合能正常完成（`ok:true, receipt.executed>=1`）——这正是 harness 的 `simulateSubagents.answer` 默认形状，所以这条同时是"模拟器与内核一致"的断言。

## §4 已判不修 / 非缺陷，但留档

1. **文档滞后（非代码缺陷）**：`docs/26:4406` 仍写"`vibe_vmu_records {action:'list'}` 根本不接受 `by`，也不接受时间窗"，`docs/18:36` 仍写 list 回 `total/returned/truncated` 与 `rowsFrom`。实测 P5/P6：`by` 接受（`byFilter` 回显、`by:'r-1'` 命中）、`since/until` 接受（闭区间）、非法时间具名拒 `VMU_INVALID_ARGUMENT`。⇒ 是文档没跟上 RUN 243，不改代码；建议下一轮只改文档。
2. **无会议绑定的回合不再讲会中手册**：P6 组装 `phase:'meeting', meeting:null` 时，`（类型：` 形式的 agenda 行没有出现（`hasAgenda:true` 的匹配来自别处的工具帮助段"`agenda` 是会议议程文本…"），且提示里含「本回合没有绑定会议」。⇒ RUN 242 的 `scope.meetingId` 门在工作。M6 是**另一个格**：绑了但绑的是不存在的 id。
3. **`abandonAfterMs` 兜底本身正常**：`kernel/turn/index.js:4065-4066` 在**下一个 step** 看到 `ageMs>=ABANDON_AFTER_MS` 时自动 abandon 并随后 `VMU_TURN_REENTRANT`。探针 P4 用 `settings:{'vmu.turn.abandonAfterMs':300}` 验证了内核路径。⇒ 缺陷不在兜底逻辑，而在 H1（root 面到不了它）与 H2/H3（abandon 之后的状态语义）。
4. **`writesWindow.readWith` 现在真能执行**（P6）：`{action:'list',by:'r-1',since:'2027-01-15T08:00:00.000Z',until:'2027-01-15T08:00:00.000Z',limit:0}` 返回 `total:1`（闭区间两端含等号，`rec-1` 的 `updatedAt=1800000000000`）。⇒ RUN 243 修的"指着一面无门可走的墙"在这条路径上确实修好了；本轮的墙在别处（H1 的锁、M1 的会议 id）。
5. **`vibe_vmu_records {action:'put'}` 不存在是设计**：该面动作是 `list|expand|append|status|prune|restore|reindex`（`host.js:1012`），写入走 `append` 或回合写服务 `vmu.records.put`。P5 第一次探针用 `put` 得到 `VMU_INVALID_ARGUMENT: unknown action: put`——是正确的具名拒，不是缺陷。
6. **`v5r-turn-meeting-agenda` "正文 0 字符"在本工作树不复现**：`packs/v5r/prompts/v5r-blocks-b.js:730-754` 的 `texts.meeting` 是非空两行 join；`scope` 已带 `phase:['meeting'] + meetingId:'required'`。我未能复现"在 sources 里但正文 0 字符"，且本轮无法逐段比对 sources（见 §5-未验证）。
7. **`h.call` 的 `detail:'closure'` 窄化**（`tools/turn.js:217-244`）是设计：`detail:'closure'` 只回 `{closureVote, closureVoteWrites}`。未发现两面矛盾。
8. **v5r 结算闸的拒绝回执与成功回执同构**（范围 3）：`VMU_RECORD_SETTLEMENT_REWRITE` 现在带 `bodyModeUsed:'refused'`、`bodyLinesDropped:null`、`bodyLinesAdded:null`、`bodyLinesMeans`（含 "NOT PROCESSED"），与成功回执的 `bodyLines*` 字段同名同形；RUN 242 修复（FEEDBACK65 1.5）已把它写成断言（`tests/vmu-run242-feedback65.test.mjs:188-197`），我没有再重跑一个独立探针，而是跑了两份回归：`node tests/vmu-run240-settlement-rewrite.test.mjs` ⇒ **29 passed, 0 failed**；`node tests/vmu-run242-feedback65.test.mjs` ⇒ **62 passed, 0 failed**（当前工作树）。⇒ 本范围未发现新缺陷。
9. **提示词的会议门已被测试守住**（范围 5 的一半）：RUN 242 §8e/§8f 断言"meeting PHASE 且未绑会议 ⇒ 两个会议专属 section 都不选"、"绑了会议 ⇒ 两个都选"，且 §8g 断言"尺子绑的会议 id 与真实世界一致"。⇒ 我 §4-2 的观察与它们一致；剩下的洞是 M6 的**绑了不存在的 id**（§8f 用的是真实会议，覆盖不到它）。

## §5 下一轮任务清单（按优先级，每条都可机器判定）

- [ ] **T1（H1）**：`tools/turn.js` 队列只串行 `step|drive|reopen-closure`；status/reply/abandon 直通。断言：P3 探针下 `status` 1500ms 内返回且 `abandon` 1500ms 内 `{ok:true,abandoned:true}`。
- [ ] **T2（H2）**：`dispatchReply` 入口按行状态拒绝 apply 已 abandon 的回合（`VMU_TURN_ABANDONED_REPLY_DROPPED`）。断言：P4 迟到返回后 `records.list` 的 `total===0`、行仍 `abandoned` 且无 `writes`。
- [ ] **T3（H3）**：锁加持有者令牌，`finally`/`abandonTurn` 只在归属匹配时清锁；`status().turnLoop` 加 `inFlightCount`。断言：t-2 仍 park 时 `inFlightTurn==='t-2'`，t-3 被 `VMU_TURN_REENTRANT` 拒。
- [ ] **T4（H4）**：投递超时不重投、不重包装；失败回执保 `partial/stillRunning/waitedMs/deliveryTimeoutMs`。断言：P1 剧本 `step.code==='VMU_TURN_DELIVERY_TIMEOUT' && step.partial && step.stillRunning===true`。
- [ ] **T5（M1）**：会议 id 不存在/未开 ⇒ `VMU_MEETING_NOT_OPEN`（点名 id + 两个出口），且坏字段不中止整轮（用 `skipped` + `continue`）。断言：P8 剧本 progress 仍写出（`total===1`）。
- [ ] **T6（M2/M4）**：`status().turnLoop` 直接派生自 `turnLoop()`；行状态词表统一（注释/`turnsMeans` 改 `applied`），并加工具面断言防回归。
- [ ] **T7（M3）**：`deliveryLastFail.at` 改用注入钟（或另开 `atWall` + `atSource`）。
- [ ] **T8（M5/L1/L2/L3）**：`fields` 加说明或改名；library 行 `updatedAt` 统一 number、`writer` 显式；非法 `limit` 具名拒；seam 返回形状归一（`{output:[…]}` 不被 `String()` 吃掉）。
- [ ] **T9（未验证项补齐，见下）**：`kernel/resume.js` 的**实际 recover 执行**（不只是 plan）、跨内核 records 可见性、C10/D2 的机器化验证、`charterSections()` 路径的 sections/sources 逐段比对。

### 本轮没验证成的项（诚实留档）

1. **`resume.recover` 的真实执行路径**：只跑通了 `vibe_vmu_human {action:'recover'}` 的 **plan**（`{"ok":true,"action":"recover","plan":{"ok":true,"reason":"human-requested","steps":[{"step":"roster","ok":true,"members":0,"note":null},…]}}`），没有让 plan 真正 apply（`willWrite:true` 之后需要另一次调用/apply 语义，我没在本轮跑通）。因此"合法的空是否仍被当失败"只看到 `plan.ok===true` 这一半证据，不足以结论。相关代码：`kernel/resume.js:1150-1164`（`nothingToRestore` 明确"不使 ok:false"，看起来已按 FEEDBACK65 1.4 修过，但未实测）。
2. **跨内核 records 可见性**：`records.get({id,includeBody})` 与 `list` 在**同一进程单内核**里验证了；"成员在自己的子内核写、office 在宿主内核读"的两内核场景未跑（harness 的 `deliver` 是模拟 seam，真子会话会另起进程），因此 `deliveryLastFail.writesWindow.readWith` 的 `readWithMeans` 里"空答案证明两件事之一"的假设没有被端到端证伪/证实。
3. **C10 / D2 的 PARTIAL 是否可机器化**：未做（C10 Lean 部署需要 Lean 工具链；D2 是用户裁定，天然不可机器判定）。台账仍应是 91 DONE + 2 PARTIAL。
4. **提示词的 section 级比对**：我只验了最终文本（P6），没有把 `sources[]` 里每个 section 的名字/字符数与 `decideSections` 的决策逐条对齐——因此"某 section 被选中但正文 0 字符"这类只在 sources 层可见的缺陷，本轮既没证实也没证伪（工作树里这些 prompt 文件正被并行 lane 改，断言会随 diff 漂移）。
5. **`v5r` middleware 侧是否还有第二个工具闸**：P3 已把挂起定位到 `tools/turn.js` 的 `turnQueue`（同刻 records 工具面正常），但我没有在**真实 host 会话**（非 harness）上复验这条队列的行为——本报告 H1 是对 `tools/turn.js` 源码 + harness 内核装配的直接证据，真实 entry 是否再多套一层门未验。
6. **范围 1 的 `reportChannel` / `wakeQueue` / `lastAttribution` 两两组合**：本轮只验了 `status().turnReceipts` 的行状态（open/applied/failed/abandoned/undelivered）、`turnLoop` 的锁字段、以及 deliver 迟到返回；`reportChannel`（`op:"reply"` 那条通道）与 `wakeQueue`（后台唤醒队列）**没有做"两两组合"的矩阵取证**，因此它们与锁面之间的矛盾若有，本轮未发现也未排除。
7. **范围 2 的"跨内核写入"**：见第 2 条（单内核已验证，双内核未跑）。
8. **范围 5 的 "sources 里 0 字符"**：见第 4 条（只比对最终文本；RUN 242 §8 测的是"选没选"，不是"选了但正文多长"）。
9. **范围 6 的 C10/D2**：见第 3 条。
