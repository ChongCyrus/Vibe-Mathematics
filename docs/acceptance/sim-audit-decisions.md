# 决策备忘：三条「规则在、但今天没有可走路径」的判定

> 来源：`docs/acceptance/sim-audit-rules.md` 的 A2 / E12 / E16 / D2 / D8 行。本文只做判断与影响面，**不改代码**。
> 复现：`node /d/_tmp/g7a10/probe-decisions.mjs`、`…-decisions2.mjs`、`…-decisions3.mjs`（每份 = 一次真 boot；输出落在 `D:/_tmp/g7a10/decisions.json`、`dec2.json`）。
> 证据口径：只有**回执字段**算数。「可达」＝不改代码、只给部署配置就能走通；「需改」＝产品文件。

## 0. 先分开两件事：宿主环境 vs 产品

| 缺口 | 宿主环境 | 产品 |
| --- | --- | --- |
| A2 无投递 | 部署没给 `config.deliver`，也没开 `vmu.report.transport` | 默认值 `''` 是产品决定；教学里写「唤起」是产品措辞 |
| E12 无 subagents | 宿主上下文没有 `subagents` 服务 | `deliverMode` 默认 `subagents`；caller 路径的 reply 没有 `meeting` 绑定字段 |
| E16 order 只读 | — | 工具面无写路径（兄弟 lane 正在补） |
| D2 成员不能直发 | — | 席位面表把 `vibe_v5_message` 归给 office |
| D8 `V5_NOT_VOTER` 不触发 | — | 席面门在 pack 之前先拒，具名票权拒到不了 |

三条 finding 的共同点：**机制大多已经写了，缺的是「谁把效果送到」这一步**。本备忘不要求为了「看起来可达」去放宽门禁。

## 1. A2：有进展时自动唤起所办汇报

### 1.1 规则要求

规则 L3（A2）：所办是「用户的助手、媒介、传信者」，**当有进展时自动唤起汇报**。

### 1.2 今日回执（默认装配）

```
vibe_vmu_report {action:"status"}  -> declared:4, armed:4, fires:0, neverDrives:true, transportInjected:false
vibe_vmu_report {action:"tick", event:"progress"} -> fired:1, delivered:0
  fired[0].refused.code    = VMU_REPORT_NO_TRANSPORT
  fired[0].refused.message = "no delivery transport was injected: nothing was sent (and nothing is pretended)"
  fired[0].refused.hint    = "pass { deliver: (report) => … } when creating the module"
```

### 1.3 什么是可达的

只开一个设置 `{'vmu.report.transport': 'mailbox'}`（`vibe-math-vmu/settings/schema.js:1046`，HOT.H1）：

```
tick   -> fired:1, delivered:1, refused:null, fired[0].to:["office"], fired[0].channel:"inbox"
status -> fires:2, delivered:2, transportInjected:true, drives:false, neverDrives:true
chair vibe_v5_inbox {action:"list"} -> count:2
  rows[0] = {id:"ml-1", from:"report", subject:"v5r-progress-notice", read:false, urgent:false, kind:"notice", bytes:125}
```

⇒ 可达的是**耐久投递**：通知落进所办邮箱，等所办下次读；**不是**「推醒 / 驱动一个所办回合」（`drives:false, neverDrives:true` 不因投递而变）。投递器本来就在产品里：`kernel/reporttransport.js`（`createMailboxReportTransport`），装配在 `vibe-math-vmu.js:594-598`、以 `deliver:` 传入 kernel（`:645`）。

### 1.4 三选项：成本 / 风险

| 选项 | 成本 | 风险 |
| --- | --- | --- |
| (a) 只做诚实披露 | 1 个回执字段（`wakeMeans`）+ 2 处教学措辞 | 仍会被读成「推醒」 |
| (b) 打开耐久传送门（产品已成型，只差默认/教学/预设） | 默认值决定 + 教学 + 模拟器预置 + ledger A2 行 | 每次进度一封邮件（`vmu.report.minIntervalMs` 默认 60000 可兜底），邮箱会吵 |
| (c) 从教学与台账删掉「自动唤起」 | 改 prompt + `rules-ledger.json` A2 行 | 删掉一条**已经能工作**的机制，A2 变假话 |

### 1.5 建议

选 (b) 的「诚实版」：产品默认仍留 `''`（未接线必须能被回执如实说出）；模拟器/预设显式设 `vmu.report.transport:"mailbox"`；`status` 增 `wakeMeans:"durable-mail-in-office-inbox; no loop drive"`；教学与 ledger A2 改成「有进展 ⇒ 所办邮箱多一封耐久通知（拉取式），不是唤醒回合」。理由：机制可验，措辞不能嘴硬。

### 1.6 后续 touch

- `vibe-math-vmu/settings/schema.js:1046`（默认值与 doc）
- `vibe-math-vmu/kernel/report.js:366-373`、`:488`（回执字段）
- `vibe-math-vmu/vibe-math-vmu.js:594-598`（装配，仅当改默认）
- `vibe-math-vmu/packs/v5r/prompts/*`（A2 措辞）
- `docs/acceptance/rules-ledger.json`（A2 行）
- `scripts/sim/harness.mjs`（boot 预设）

## 2. E12：会议内轮次驱动

### 2.1 规则要求

规则 L45（E12）：会议中各成员可执行的命令/工具**随会议类型与身份不同**；其形态要求会议里能按类型推进一轮（成员回合、成员动作）。

### 2.2 今日回执（默认装配）

```
vibe_v5_meeting_round {meeting:"m1", members:["r-1","r-2"], phase:"normal", why:"probe"}
  -> ok:false, code:"VMU_ENGINE_UNAVAILABLE"
     message:"the host exposes no subagents service at all (ctx.get('subagents') returned nothing), so no member turn can be delivered"
```

文案来源 `vibe-math-vmu/host-deliver.js:146`；无 seam 时的同族拒在 `kernel/turn/index.js:645`。

### 2.3 什么是可达的

设 `{'vmu.turn.deliverMode':'caller'}`（`settings/schema.js:188`，HOT.H2，重启生效）后同一调用：

```
meeting_round -> ok:true, turn:{ok:true, awaiting:true,
                 memberPrompt:{member:"r-1", turnId:"t-1", text:<完整成员提示词>}}
扮演者回复 vibe_vmu_turn {op:"reply", reply_for:"r-1", report:{say:"…"}}
  -> ok:true, accepted:true, source:"tool", fields:["say"], meeting:null
vibe_vmu_turn {op:"step"}（office）-> ok:true, completed:true, executed:0, skipped:1
  skippedDetail:[{field:"say", face:"vmu.meetings", op:"speak", reason:"no-meeting-bound"}]
```

⇒ 可达的是「回合交回调用会话 + 回复被记账」；**发言不落会议**。reply 的字段表里没有 `meeting`（硬传 ⇒ `VMU_TURN_UNKNOWN_FIELD "unknown reply field(s): meeting - refusing rather than guessing what was meant"`）。会议发言只能由扮演者自己调 `vibe_v5_say {meeting, member}`（实测 `ok:true, via:"meeting"`，回执带 `speechBound`）。

### 2.4 三选项：成本 / 风险

| 选项 | 成本 | 风险 |
| --- | --- | --- |
| (a) 只披露（默认 subagents，回执已具名拒） | ≈0 | E12 永远只能记 UNREACHABLE |
| (b) 宿主提供统一出站接缝（见 §3） | kernel 装配 + 两个调用点 + 状态回执 | 宿主形状不一，必须保留具名拒 |
| (c) 删规则 / 降级为 PROSE | 改台账 | 删掉已经用 caller 模式走通过的路 |

### 2.5 建议

选 (b)：默认仍 `subagents`（没接缝就具名拒），但 (i) 模拟器与文档示范 caller 模式，(ii) reply 通道补 `meeting` 绑定字段（否则 caller 模式的「发言」永远被 `no-meeting-bound` 丢掉），(iii) 状态板显示 `seams.deliverTurn`。理由：caller 路径已实测走到 `awaiting` 与 `step completed`，差的只是回执字段与默认值表述。

### 2.6 后续 touch

- `vibe-math-vmu/kernel/index.js:789`、`:2615-2616`、`:2704-2708`
- `vibe-math-vmu/host-deliver.js:131-150`
- `vibe-math-vmu/kernel/turn/index.js:645`
- `vibe-math-vmu/tools/turn.js`（`REPLY_FIELDS` 加 `meeting`）
- `vibe-math-vmu/settings/schema.js:188`
- `vibe-math-vmu/packs/v5r/tools.js:4142+`（`meeting_round`）

## 3. 一条同时服务 A2 与 E12 的接缝

设计：`host.effects = { deliverTurn(turn, text), deliverReport(report) }`，kernel 构造期解析一次，沿用既有次序（kernel 选项 > `host.effects.*` > 设置 > 具名拒，见 `kernel/index.js:2615-2616`）；两者共用同一对象，`status.seams` 分别报 `deliverTurn` / `deliverReport` 是否注入。

不合并成一个 `deliver(envelope)`：report 的封套是 `{to, channel, text}`，turn 的封套是 `{turn, text}`，形状不同；硬合并就是「猜形状」，`host-deliver.js:131` 的注释已经明确拒绝过这种做法。

成本：1 个入口对象 + 2 个读取点 + 2 个回执字段。风险：宿主只实现一半时，另一半必须仍具名拒（不能默认成功）。

## 4. E16「批量指定成员按一定顺序发言」+ D2 / D8

### 4.1 规则要求

- E16（L50）：常见命令含「批量指定成员按一定顺序发言」，并提示权限（有些只有主持人有）。
- D2（L38）：各成员通过邮箱 / 私信 / 群聊交流。
- D8（L39）：可查看其他成员状态版，只能改自己的；四字段为总任务 / 规划 / 任务状态 / 当前小任务。

### 4.2 今日回执

```
vibe_vmu_meeting {action:"order", id:"m1", members:["r-2","r-1"]}
  -> ok:false, code:VMU_INVALID_ARGUMENT
     message:"action order only READS the floor queue: `member`/`members` do not reorder anything here (this action has no write path)"
```

（`vibe-math-vmu/tools/meeting.js:917`；chair 与 member 同码。）兄弟 lane 正在落 `order:{members}` —— 假设落地后，**剩下的缺口**是：谁有权改（chair-only？）、改完的可观测顺序（回执要有 before/after 队列）、以及与 `overrideorder{mode}` 的优先级（后者要求 `mode ∈ fifo|round-robin|chair|random` 且必须有 `reason`）。

D2 / D8：

```
member  vibe_v5_message {to:"r-2", content:"…"}
  -> ok:false, code:VMU_TOOL_NOT_IN_FACE "member \"r-1\" may not call \"vibe_v5_message\": it is outside this member's seat face (member)"
office  vibe_v5_message {to:"r-2", member:"r-1", content:"…"}
  -> ok:true, from:"r-1", relayedBy:"office", actedForMember:"r-1"
temp    vibe_v5_poll_vote {ballot_id:"bx-1", choices:["a"]}
  -> ok:false, code:VMU_TOOL_NOT_IN_FACE "member \"r-t1\" may not call \"vibe_v5_poll_vote\": it is outside this member's seat face (temp)"
```

`V5_NOT_VOTER` 的实现确实在 `packs/v5r/tools.js:1111-1116`（`VMU_NOT_PERMITTED`），但**从未执行**；而 `:6250` 的工具描述自称 "is refused by name here"（不实）。D2 的工具描述则自己写着 'a member-to-member message is impossible to express'（`:6100`）。

### 4.3 权衡与建议

E16：(a) 接受兄弟 lane 的写入口，并补「before/after 队列 + chair-only」；(b) 不做，保持只读；(c) 用 `overrideorder{mode}` 冒充逐人排序 —— 不行（模式 ≠ 逐人队列）。**建议 (a)**。

D2 / D8：

| 选项 | 成本 | 风险 |
| --- | --- | --- |
| (a) 打开成员面（member→member 直发；temp 也进 poll_vote 再被 `V5_NOT_VOTER` 拒） | 改席面表 + 反滥用（谁是 spam、chair 可见性）+ 两条具名拒重排 | 审计面变大；chat 面已明确「没有 relay 字段，代发不可区分」 |
| (b) 关面，把「所办是唯一传信人」写成正式语义（回执已用 `from` / `relayedBy` 区分，可审计） | 改 2 处自述 + 教学承认 D2 = 群聊 + 所办代发 | 成员之间最短路径多一跳 |
| (c) 混合：永久席位开 member→member，temp 只经所办 | 中等 | 两套语义并存 |

**建议 (b)**：与已经落地的 `relayedBy` 审计证据一致，改动最小、不新增权限面；同时把 D8 的 `:6250` 描述改成真话（「席面门先拒 `VMU_TOOL_NOT_IN_FACE`；`V5_NOT_VOTER` 只在永久席位路径上生效」）。

### 4.4 后续 touch

- `vibe-math-vmu/tools/meeting.js:900-930`（order 写路径，兄弟 lane）
- `vibe-math-vmu/host-pack-tools.js:161-196`（席面门；如需 per-seat 面）
- `vibe-math-vmu/packs/v5r/tools.js:6100`、`:6250`（两句自述）、`:1111-1116`（`V5_NOT_VOTER`）
- `vibe-math-vmu/packs/v5r/seat-faces.js`（席位面表）
- `docs/acceptance/rules-ledger.json`（D2 / D8 / E16 行）

## 5. 未决与边界

- A2 若真要「推醒」（`drives:true`），本备忘没有给接缝方案：报告投递天然是拉取式，推醒等于让宿主替所办开回合，需要另立「谁允许被唤醒」的口径；E12 的 reply-meeting 冲突语义可复用 `VMU_TURN_REPLY_CONFLICT`。
- D8 若改成 per-seat 面，需回归 `tests/` 里「member 不能调用 office 工具」的一组断言；本备忘不建议这一步。
- 本文没有覆盖 Lean / 计算引擎 / LaTeX 三条同样「UNREACHABLE」的面：它们属于环境接缝，不是规则与面不匹配。

## 6. 实施后验收清单（task-18 / task-19）

> 复现：`cd "/d/wd/vibemath开发/Vibe-Mathematics"` 后运行下表命令；判据只看回执字段，`delivered:1` / `executed:1` 之后必须**读回**副作用（inbox list / meeting status）。

| 任务 | 命令（任一失败即不通过） | 必须出现的回执字段 |
| --- | --- | --- |
| **18 A2** | `node tests/vmu-a2-report-transport.test.mjs`；`node tests/vmu-a2-progress-report.test.mjs`；`node scripts/sim/run.mjs --scenario mainline --out D:/_tmp/sim/corpus-a2`；`node /d/_tmp/g7a10/probe-decisions3.mjs` | 默认 `status` ⇒ `transportInjected:false` 且 `wakeMeans:"durable-mail-in-office-inbox; no loop drive"`；`tick.refused.hint` 点名 `vmu.report.transport` / `config.deliver`；预设/场景下 ⇒ `transportInjected:true`、`fired:1, delivered:1, to:["office"], channel:"inbox"`，`inbox list` 有 `from:"report"` 的 `v5r-progress-notice`；`drives:false`、`neverDrives:true` **不得变**（投递≠唤醒）；不传设置时仍 `VMU_REPORT_NO_TRANSPORT` 且 `delivered:0` |
| **19 E12** | `node tests/vmu-turn-meeting-binding.test.mjs`；`node tests/vmu-turn-dispatch-k2.test.mjs`；`node tests/vmu-host-deliver-wiring.test.mjs`；`node /d/_tmp/g7a10/probe-decisions.mjs`；`node /d/_tmp/g7a10/probe-decisions2.mjs` | caller + `meeting_round` ⇒ `turn.awaiting:true`，且 turn/pending 上出现 `meeting:"m1"`（**drive 时绑定**）；随后 `{op:"step"}` ⇒ `executed:1`、`skippedDetail` 里**无** `reason:"no-meeting-bound"`，`vibe_vmu_meeting {action:"status"}` 能读回该成员那次发言；reply 传冲突 `meeting:"m2"` ⇒ 具名拒（建议复用 `VMU_TURN_REPLY_CONFLICT`，hint 写明「这次回合属于 m1」）；`deliverTurn` 注入后默认 `subagents` 模式也能 drive（回执带 `deliveryPath`/`childSessionId`），未注入仍是原文 `VMU_ENGINE_UNAVAILABLE` |

两条共同边界：没有 transport / 没有 seam 时必须仍是具名拒（不得默认成功）；`tests/vmu-turn-meeting-binding.test.mjs` 今天 **22 passed / 0 failed**（它验的是「reply 显式带 meeting」的方向），改语义后必须仍绿，或**显式**改断言并在报告里列出。
