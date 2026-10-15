# task-11 交付报告 · 目标 2（通信 / 协作 / 会议）· Round 2

- 负责人：v5r-reader-c；基线：`_handoff/vmu/00-decisions.md` **D-08 三层基线**；事实来源：`_handoff/vmu/v5r-inventory-c.md` §③④⑦。
- 写入范围（**只改这些**）：`kernel/{chat,mailbox,panel}.js`、`kernel/{meeting,meetings,ballot,ballotbox,minutes}.js`、`tools/{chat,mailbox,panel,meeting,minutes}.js`、`docs/{08,17}-*.md`、`tests/vmu-{chat,mailbox,panel,meeting-parity}.test.mjs`、`tests/vmu-minutes-tool.test.mjs`（既有套件的**契约同步**）、本文件。
- 未做：不跑全量 sweep、不 `regen-all`、不 git、未改 `kernel/resume.js`／`host.js`／`settings/schema.js`／`kernel/bus.js`（他人名下）。

## 0. 结论（对照 D-08 三层）

| 基线 | 要求 | 结果 |
|---|---|---|
| **A（必须 = v5r 实际实现）** | ≈14 命令 + 7 变形 + 全部会议参数与上下界 | **已覆盖**：能力分布在 `meeting.js`／`meetings.js`／`ballot.js`／`ballotbox.js`／`governance.js`／`minutes.js`／`grant.js`；本轮**补齐 v5r 缺的三件**（受邀发言／阶段派生／显式散会可达性）并把它们接到工具面。逐项对照见 `docs/08 §25.2`，驱动证据见 `tests/vmu-meeting-parity.test.mjs`（78 断言） |
| **B（必须 = 用户点名、v5r 只在设计文档里有）** | 群聊 id/发言人/时间/回复目标 + **管理员** + **发言次数限制（有限/不限）** + **禁言** + 私发信息 + **状态面板（总目标/计划/正在执行的子任务）** | **已实现**：`kernel/chat.js`／`kernel/mailbox.js`／`kernel/panel.js` ＋ 三个工具面；`subtasks` 是 v5r 缺的独立字段。见 `docs/08 §25.3` |
| **C（应当 = 设计有、v5r 未实现）** | 能落则落，不能落**具名登记** | **12 条具名登记**（`GAP-MTG-01..12`，含现状证据与"由哪一层补"）见 `docs/08 §25.4`；由 `tests/vmu-meeting-parity.test.mjs` 机械校验（数量/唯一性/closed-by 非空） |

## 1. 新增内核原语与工具面

| 交付 | 路径 | 说明 |
|---|---|---|
| 群聊原语 | `vibe-math-vmu/kernel/chat.js` | 消息 `{id,seq,from,at,text,replyTo,quotes,kind}`；管理员门（**必须具名 `by`**，引导路径须显式 `source:'settings'`）；`speakQuota`(0=不限)＋窗口；`mute/unmute`（相对时长、到期自动解除并记 `mute-expired`）；冻结由注入 `isFrozen()` **派生**（与 `ballot.freeze` 同源），`freezeExemptAdmins` 保留 chair-first；`historyCap` 触界**计数丢弃** |
| 耐久信箱 | `kernel/mailbox.js` | 每收件人一份；**ack 只在投递成功之后**（false/throw/无 seam ⇒ 一条都不 ack）；ack 后**正文即删**、悬空锚 `VMU_MAILBOX_ANCHOR_DANGLING`；注入去重（`freshOnly`+mark/clear）；urgent/digest 分级；`plan()` 受 `wakeBudget` 并**具名列出被推迟者**；`store.patch('mailbox')` 真持久（无端口 ⇒ `durable:false` 自曝） |
| 状态面板 | `kernel/panel.js` | `overall/subgoal/plan[]/status/**subtasks[]**`（v5r 缺的"正在执行的子任务"）；只追加历史；时间由框架写（`…At/…Ms` 具名拒）；同值幂等；他人改 `overall` ⇒ `deviation`（或策略具名拒）；**view 留痕**＋上限计数；有 `members` 接缝时镜像四字段（**不镜像 subtasks**） |
| 工具面 | `tools/chat.js`／`tools/mailbox.js`／`tools/panel.js` | action 枚举见 `docs/08 §25.6`；内核缺失时返回 `VMU_ENGINE_UNAVAILABLE`（不崩） |
| 会议/纪要可达性 | `tools/meeting.js`（action 9→22）、`tools/minutes.js`（6→8） | 新增：`hand/refuse/invite/invitedspeak/end/aggregation/complete/phase/status/summary/snapshot/freeze/unfreeze`；`zones`（v5r 发言区/投票区）／`gaps`（只报缺口、不自动补全） |
| 会议原语补齐 | `kernel/meeting.js` | `invite()`(:365)／`speakInvited()`(:386，`countsTowardsRound:false`)／`invitations()`(:401)／`get phase`(:412，派生两阶段)／`snapshot()`(:425)／`restore()`(:442) |
| 纪要补齐 | `kernel/minutes.js` | `zones()`(:229)／`gaps()`(:254)／`snapshot()`／`restore()`（逐字稿 64KB 上限＋**计数截断上报**） |
| 持久化缝 | `ballot.js`(:274/285)／`meetings.js`(:933/950)／`ballotbox.js`(返回对象内) | v5r-reader-a 定稿 v1 信封；id 计数 max+1；`policy` 键族**不入快照**（恢复时按 settings 重解析） |

## 2. **持久化/恢复专节**（Lead 追加项：哪几个面已可跨重启、哪几个具名不可恢复）

| 面 | seam | 跨重启 | **具名不可恢复项（原因）** |
|---|---|---|---|
| `kernel/meeting.js` | `snapshot/restore` ✅ | **可** | `deliver`、`bus`（注入接缝由宿主重绑）；`roster` 的"外部真相"来自调用方 |
| `kernel/ballot.js` | ✅ | **可** | `bus`；五个判定谓词 `canOpen/isEligible/isFrozen/castValid/tally`（注入策略，恢复时重绑） |
| `kernel/minutes.js` | ✅ | **可** | `meeting` 接缝；逐字稿超 **64KB** 部分被裁 ⇒ 在 `truncated`＋`skipped[{what:'verbatim'}]` **计数上报** |
| `kernel/meetings.js` | ✅ | **可** | **`policy`（47 键）不入快照**（来自 settings/pack，重解析 ⇒ 旧声明绝不覆盖新配置）；`members/ballot/wake/bus`；`refusals` 计数 |
| `kernel/ballotbox.js` | ✅ | **可** | **`policy`（26 键）重解析**；`bus` |
| `kernel/mailbox.js` | ✅ `snapshot/hydrate`＋`persist/restore` | **可（配 `store` 端口）** | 无 `store` ⇒ 内存态＋`status().durable=false`；`deliver`／`resolveAudience` 宿主重绑 |
| `kernel/chat.js` | **无 seam** | **不可** | 消息账本与策略会话态未做投影；（策略值来自 settings 会重解析；账本本身需后续切片或 `resume` 补 `chat` seam） |
| `kernel/panel.js` | **无 seam** | **不可** | 面板行/历史/查看留痕未做投影（同上，属后续切片） |

> 冲突/版本语义：`restore` 在"已有不同来源活状态"时返回 `VMU_RESUME_RESTORE_CONFLICT`（**绝不半覆盖**）；版本/缺字段返回 `VMU_RESUME_SNAPSHOT_VERSION`／`VMU_RESUME_SNAPSHOT_INCOMPLETE`；重复 restore 同一快照幂等。三码**已改为 `import { CODE as RESUME_CODE } from './resume.js'` 单源**（不再用字面量；`resume.js` 落盘后即切换，`node --check` 与 `tests/vmu-resume-recovery.test.mjs` 50/0 均通过）。校验器 `resume.checkSnapshot(face, snap, required)` 是面侧唯一校验入口；我的 `restore()` 强制同样的三个条件（版本/完整性/冲突）。

## 3. 钩子生产者（8 个，字符串首参形态）

| 钩子 | 生产者（真读点） | 语义 |
|---|---|---|
| `chat/send-before` | `kernel/chat.js:132` | **可阻断**：拒绝 ⇒ 抛具名码且**不追加**消息 |
| `chat/sent` | `kernel/chat.js:133` | 追加成功后 |
| `chat/refused` | `kernel/chat.js:134` | 每条具名拒（带 `code`，可能的 `member`） |
| `mailbox/deliver-before` | `kernel/mailbox.js:130` | **可阻断**：拒绝 ⇒ `ok:false` 且**一条都不 ack** |
| `mailbox/delivered` | `kernel/mailbox.js:131` | ack 成功之后 |
| `panel/write-before` | `kernel/panel.js:154` | **可阻断**：拒绝 ⇒ 抛具名码且行不变 |
| `panel/written` | `kernel/panel.js:155` | 变更落账后（带 `changed`/`mirrored`） |
| `panel/viewed` | `kernel/panel.js:156` | 查看留痕写入时 |

（另：`member/self-report` 在 `kernel/panel.js:142`，**仅在未绑 `members` 接缝时**由 panel 发，避免与 `members.js` 双发。）

## 4. 验证（原样命令 + 退出码）

```
node tests/vmu-chat.test.mjs            → vmu-chat: 43 passed, 0 failed            exit=0
node tests/vmu-mailbox.test.mjs         → vmu-mailbox: 44 passed, 0 failed         exit=0
node tests/vmu-panel.test.mjs           → vmu-panel: 31 passed, 0 failed           exit=0
node tests/vmu-meeting-parity.test.mjs  → vmu-meeting-parity: 78 passed, 0 failed  exit=0
node tests/vmu-meeting.test.mjs         → 50 passed, 0 failed                      exit=0
node tests/vmu-meetings.test.mjs        → 160 passed, 0 failed                     exit=0
node tests/vmu-ballot.test.mjs          → 41 passed, 0 failed                      exit=0
node tests/vmu-ballotbox.test.mjs       → 13 passed, 0 failed                      exit=0
node tests/vmu-minutes.test.mjs         → 20 passed, 0 failed                      exit=0
node tests/vmu-action-arity-spellings.test.mjs → 8 passed, 0 failed                exit=0
node tests/vmu-tools-action-arity.test.mjs     → 5 passed, 0 failed                exit=0
node tests/vmu-tools-await-rejections.test.mjs → 114 passed, 0 failed              exit=0
node --check vibe-math-vmu/kernel/{chat,mailbox,panel,meeting,meetings,ballot,ballotbox,minutes}.js → exit=0（8/8）
```

**既有套件的契约同步（1 处）**：`tests/vmu-minutes-tool.test.mjs` 原本断言 minutes 工具 action 枚举恰为 6 个；`zones`／`gaps` 加入后我**同步了它的契约**（枚举 8 个、spy 增加两方法、delegation 断言同步），保留其本意（"枚举完整、无多余项、工具只委托不复制"）。

## 5. 受阻 / 未做（具名）

1. **（已解除）`kernel/mathjobs.js` 的重复声明**：取证时该文件有 `let droppedMirrors` 重复声明（219/249 行），任何 `import` 整内核的套件直接 `SyntaxError`。**非我名下文件，我未改动**；已通知 lead／vmu-core，**由该面负责人修复**；现已 `node --check` 通过，`tests/vmu-minutes-tool.test.mjs` 恢复 **14 passed / 0 failed**。保留本条作为"跨面并发编辑会打断 T1"的记录。
2. **`docs/17` §19（人类在环）**：已按 v5r-reader-a 提供的 task-10 文本**替换 5 条**（标题保留、条目数不变 5 条；内核 `kernel/human.js`／`tools/human.js` 的落地说明并入），并保留其"诚实边界"（审批队列是会话内存、持久化台账为下一片）。
3. **chat/panel 的投影缝**：本轮未做（见 §2），属基线的"后续切片"；已在报告中具名。
4. **12 条 GAP-MTG 未落地**：按 D-08 基线 C 的要求**具名登记在 `docs/08 §25.4`**（含 closed-by 层），未静默缺失。
5. **接线未完成部分归 vmu-core**：`TOOL_NAMES` 三键、`TOOL_FACES` 三行、`settings/schema.js` 18 键、`store.PUBLIC_KEYS['mailbox']`、`registry.register` 三服务、kernel 装配（`chat/mailbox/panel` 实例 + 注入 `bus`/`isFrozen`/`deliver`/`store`/`members`）——我已把**精确行号版接线单**发给 vmu-core（含三处修正：匿名≠引导路径、`bus` 必需、热改写穿声明键）。

## 6. 与目标 2 判据的对应（一句话）

**"vmu 的会议系统/群聊/状态面板是否支持 v5r 全部机制、命令、功能"** ⇒ **基线 A 已覆盖**（`docs/08 §25.2` ＋ parity 78 断言）；**基线 B（用户点名）已实现**（§25.3）；**基线 C 的 21 条落差压缩为 12 条具名扩展点**（§25.4，可逐条销账），**无静默缺失**。
