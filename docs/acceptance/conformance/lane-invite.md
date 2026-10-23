# Lane: D9 举手发言 / 邀请发言 / 批量按顺序发言 / 单次发言版群聊（lane-invite）

依台账 `docs/acceptance/phase12-v5r-rules-conformance.md` §4 的 D9 行（`:63`，原文：常见命令：举手发言、邀请发言、**批量指定成员按顺序发言**、单次发言版群聊（权限区分，部分仅主持））与 §7 记录的两条缺陷（`:147`、`:185`：「pack 开的是 service 会议，`invite/invitedspeak` 只在原语注册表」）。

判定纪律（沿用台账 §0）：**(a) 提示词里写了** ≠ **(b) 机制存在且可达** ≠ **(c) 有机器可失败的门禁**，三者分列，不互相顶替；每条结论指到 `文件:行` 或实测命令出口。

**★ 本 lane 是「修 + 验」，不是纯审计**：写域由 Lead 划定，只有下列四个文件（+ `package.json#files` 一行登记）：

| 文件 | 动因 |
|---|---|
| `vibe-math-vmu/tools/meeting.js` | `hand`/`invite`/`invitedspeak` 跨注册表；新增 `order`（读回地面）与 `attend`（纯委派） |
| `vibe-math-vmu/packs/v5r/tools.js` | 回执 note 的承诺改准；`{ at }` 预约会议的透传与读回 |
| `tests/vmu-meeting-invite.test.mjs` | **新建**，67 断言（本 lane 的门禁） |
| `docs/acceptance/conformance/lane-invite.md` | **新建**，本文件 |
| `package.json` | `files[]` 插入 `tests/vmu-meeting-invite.test.mjs`（768 → 769） |

未改（属他人写域，全部只读）：`vibe-math-vmu/kernel/**`、`vibe-math-vmu/settings/schema.js`、`vibe-math-vmu/packs/v5r/settings/defaults.json`、`tests/**`（除新建的那一个）。

---

## §0 快照

- HEAD：`fb237c95`。本 lane 开始时该树为 0 行改动；审计与实现期间出现了并行 lane 的工作树漂移，见 §6。
- 本轮实跑的命令与出口（全部在本 lane 收尾时的树上取得，逐条可复现）：

| 命令 | 读数 | 出口 |
|---|---|---|
| `node tests/vmu-meeting-invite.test.mjs` | `vmu-meeting-invite: 67 passed, 0 failed` | 0 |
| `node tests/vmu-meeting-types.test.mjs` | `=== VMU MEETING TYPES: 92 passed, 0 failed ===` | 0 |
| `node tests/vmu-meetings.test.mjs` | `=== VMU MEETINGS: 201 passed, 0 failed ===` | 0 |
| `node tests/vmu-kernel.test.mjs` | `=== VMU KERNEL: 260 passed, 0 failed ===` | 0 |
| `node tests/vmu-meeting-parity.test.mjs` | `vmu-meeting-parity: 206 passed, 0 failed` | 0 |
| `node tests/vmu-meeting-order.test.mjs` | `=== VMU MEETING ORDER: 60 passed, 0 failed ===` | 0 |
| `node tests/vmu-v5r-tools.test.mjs` | `=== VMU V5R TOOLS: 334 passed, 0 failed ===`（本 lane 期间该套件曾 333/1，红的是 G7 ④，见 §7.1；修法不是本 lane 做的，本 lane 只复核） | 0 |
| `node tests/audit-installer-policy.test.mjs` | `INSTALLER POLICY: 90 passed, 0 failed / ALL GREEN` | 0 |
| `node scripts/check-docs.mjs` | `DOC LINT: PASS`（只有 note/D6/D11/D16 提示） | 0 |
| `node scripts/regen-all.mjs --check` | `vmu regen-all: 6/16 in sync` | 0 |

唯一曾红的是 `vmu-v5r-tools` 的 **G7 ④**，与本 lane 无关且**在 HEAD 上就已红**；本 lane 收尾复核时它**已转绿（334/0）**，归因与修法见 §7.1。

---

## §1 判定汇总（改后）

| 分项 | 规则要点 | 改前 | 改后 | 证据 |
|---|---|---|---|---|
| D9-a | 举手发言（`hand`） | ❌ 对 pack 召开的会议，工具面回 `VMU_NO_SUCH_OBJECT` | **✅ 可达**：service 上「举手＝把自己排进地面队列」 | `tools/meeting.js:180-192`；测试 §2 |
| D9-b | 邀请发言（`invite` / `invitedspeak`） | ❌ 同上（`invite` 在真机 100% 被拒） | **✅ 可达，且带权威闸**：只有主席能邀（单个或有序批量）；被邀者用 `invitedspeak` 在纪要里发言 | `tools/meeting.js:200-249`、`:254-277`；测试 §3、§5 |
| D9-c | 批量指定成员按一定顺序发言 | ❌ 无数组入参；且「地面顺序」在工具面**读不回来** | **✅ 可达**：`members:[…]` 按给定顺序逐个入队，`action=order` 读回真实队列 | `tools/meeting.js:225-246`、`:357-369`；测试 §4 |
| D9-d | 单次发言版群聊 | ⚠️ 机制在（发言配额＋地面队列），**缺部署声明值** | **⚠️ 部分**（机制可达；改判条件见 §5.3） | `kernel/meetings.js` 的 `speak`（`speechQuotaPerMember`，`VMU_MEETING_SPEECH_TIMEBOUND`） |
| D9-e | 权限区分（部分仅主持） | ⚠️ service 的 `queue()` 在 fifo 下**没有任何主席轨** | **✅**：chair 闸放在唯一能看见席位的层 | `tools/meeting.js:213-224`；测试 §3.2、§3.3 |
| D9-f | 被邀者「在场」先决条件 | ❌ 全仓无 `attend` 路由 ⇒ 任何非主席发言都是死路 | **✅ 可达**（纯委派，见 §2.3） | `tools/meeting.js:376-389`；测试 §5 |

> **门禁（c）**：台账 D9 行原本 `门禁 = 待核`。本 lane 立了它：`tests/vmu-meeting-invite.test.mjs`（67 断言，正反双向），并把「pack 开的 service 会议」作为被测对象 —— 不是拿原语会议冒充。

---

## §2 三条缺口：实测 → 根因 → 修法

### §2.1 缺口一：`hand`/`invite`/`invitedspeak` 只寻址**原语**注册表

- **实测**（真机 boot `packs:['v5r']`，会议由 `vibe_v5_meeting { agenda, kind:'sync', member:'acad' }` 召开，id `m1`）：`hand`、`invite`、`invitedspeak`、`hands` 四个 action 全部回
  `VMU_NO_SUCH_OBJECT` — `no live meeting with id m1`，hint：`meeting m1 lives in the SERVICE registry: list/speak/summary/close cross registries, but this action addresses the primitive registry only`。
- **根因**：pack 的 `vibe_v5_meeting` 走 `kernel.meetings.open(...)`（`packs/v5r/tools.js:554`，service 注册表），而工具面这四个 action 只调 `kernel.liveMeeting(id)`（原语注册表）。跨注册表的机制**早就在**（`speak`/`status`/`summary`/`close`/`extendlimit`/`flow` 都用它），只是这四个没接。
- **修法**（`tools/meeting.js`）：每块统一成「**原语优先、service 兜底**」，与既有跨注册表 action 同构：`sid(id)` → `kernel.liveMeeting(pid)` → `svcOf() && serviceHas(pid)` → 都不是则 `noSuchMeeting(pid)`（两个 id 空间都列出）。回执带 `registry:'service'`，读者一眼知道命中的是哪一面。**没有第二套会议状态**（见 §2.4）。

### §2.2 缺口二：地面顺序「只可写、不可读」

- **实测**：`meetingView` 故意不披露 `present/roster/queue`（`kernel/meetings.js:1571` 起只给 `type/state/subject/loop/note/reason/chair/secretary/motions`）；`orderView` 是唯一能读到地面顺序的面，但工具面**没有 action 指向它**（改前 `action:'order'` ⇒ `VMU_INVALID_ARGUMENT unknown action: order`）。
- 后果：主席排了序无法读回，于是「按给定顺序入队」这句话**不可证伪** —— 这与「不得把没测写成没问题」直接冲突。
- **修法**：新增只读 `action=order`（`tools/meeting.js:357-369`）⇒ `svc.orderView({ meeting })`，把 `{ mode, source, order, queueOpen }` 原样带回；对原语会议具名拒并指向 `action=status`（原语会议用的是「本轮点名表」，不是地面顺序）。

### §2.3 缺口三：非主席成员**根本无法在场** ⇒ 邀请只能是空账

- **实测**：`open()` 只把主席放进 `present`（`kernel/meetings.js:554` 起的 `present` 只收 chair）；`speak` 的前置是 `if (!m.present.has(String(member))) throw deny('VMU_NOT_MEMBER','speaker is not present: …','attend() first')`；而**全仓没有任何工具把 `attend` 路由出去**（`meeting_hand`/`meeting_invite` 的回执字段面也一样，且它连 `meeting` id 都没带，见 §7.3）。⇒ 在 pack 召开的会议上，除主席外**任何人发言都是死路**，`vibe_v5_say { meeting }` 同样被挡。
- **修法**：新增 `action=attend`（`tools/meeting.js:376-389`），**纯委派** `svc.attend({ meeting, member })`：不自定策略、不给默认值、不做角色检查、不改写内核拒绝原文。它不参与 invite 路径 —— **邀请绝不代签到**，因为 `present` 才是法定人数（`quorum`）的分母，伪造出席＝静默改分母。
- 归属说明（Lead 要求写清）：`attend` 是**内核面已有能力**（`kernel/meetings.js:725`），本 lane 只补了「路由」，因此它对**所有** pack 与宿主都可达，不是 v5r 专用。

### §2.4 为什么不新建第二套会议状态（红线）

service 会议的地面就是一个**队列**（`m.queue`）＋顺序器（`kernel/meetingmarker.js` `createOrderControls`）。本 lane 的三条命令全部落到既有机制上：`hand`＝自己入队、`invite`＝主席替别人入队、`invitedspeak`＝service 自己的 `speak`（纪要/预算/配额/纪律静音都留在原处）。**没有新增任何账本、字段或状态机**，也没有把「邀请」做成第二份 `invited` Map（原语会议那份 `invited`/`invitedOrder` 是原语侧的，不搬到 service）。

### §2.5 `hands` 在 service 上为什么是**具名拒**而不是伪造成功

`hands` 的四个 op 是 `grant/revoke/clear/list`（`kernel/meeting.js:285` 起），而 service 的地面只有「入队」和「发言即出队」，**没有 dequeue、没有 revoke、没有 scope**。硬做就是发明机制，所以 `tools/meeting.js:341-353` 具名拒：`VMU_ENGINE_UNAVAILABLE`，消息点名「its floor is a QUEUE and it has no grant/revoke/clear/list of hands」，hint 给出 service 上真正存在的两条（`action=hand` / `action=invite`）。原语会议上的 `hands` 行为一字未改。

---

## §3 权限分层（★ 权限要放在能看见席位的那一层）

1. service 的 `queue()` 在 **fifo 地面下没有任何主席轨**：`orderControls.queueGate` 只在 `eff.order === 'chair'`（call_on）时启用（`kernel/meetingmarker.js:422`）。实测：fifo 地面下 `by:'r-2'` 替 `r-1` 排队**成功** ⇒ 内核这一层不能承担「只有主席能邀」。
2. 能看见席位的唯一读面是 `meetingView().chair`（`kernel/meetings.js:1571`）。因此**chair 闸放在工具面**（`tools/meeting.js:213-224`）：
   - 无 `by` ⇒ `VMU_INVALID_ARGUMENT`「needs by:"<the chair id>"」，hint 指向 `action=hand`（成员举手是自荐，不需要主席）；
   - 会议无 chair ⇒ `VMU_ENGINE_UNAVAILABLE`「declares no chair, so nobody holds the authority to invite」（不替它挑一个权威）；
   - `by !== chair` ⇒ `VMU_NOT_PERMITTED`，消息**同时点名** actor 与主席。
3. 成员只能自荐：`hand` 的 `by` 固定为自己（`tools/meeting.js:187-189`），回执 `source:'self'`。
4. 原语会议的权限轨**没有动**：`invite` 仍要求 `why`、仍拒「本轮被点名者」（那是 `asked` 的人，不是 guest），`hands` 仍按 `chair`/`isChair` seam 判定。

---

## §4 测试（`tests/vmu-meeting-invite.test.mjs`，67 断言）

真机装配（`boot({ root, packs:['v5r'] })` → `receipt()` 解析回执），被测会议**全部是 pack 召开的 service 会议**；原语只在 §8 里做「不回归」对照。

| 节 | 钉住的事实 |
|---|---|
| §1 | `order` 可读（空队列、`mode:'fifo'`、`queueOpen:true`）；未知 id、缺 id 都具名拒 |
| §2 | `hand` 正向（`receipt.by` 是本人、`order` 读回含该成员）与反向（非成员 `VMU_NOT_MEMBER`） |
| §3 | `invite` 权限正反：缺 `by` ⇒ 具名＋hint；非主席 ⇒ `VMU_NOT_PERMITTED`（消息含主席与 actor）；缺 `why` ⇒ 拒；主席单人邀请 ⇒ `invited:['r-2']` 且 `order` 读回 `r-1,r-2`；`member`+`members` 互斥；空数组；未知会议 |
| §4 | **批量按序**：**另开一场**后 `members:['r-2','r-1']` ⇒ `invited` 与 `order` 都严格等于 `r-2,r-1`（倒序实现过不了），再用独立 `action=order` 复核；重复邀请不重复入队；数组含空串具名拒 |
| §5 | **邀请不伪造在场**：service 起始 `quorum.present === 1`；两名被邀者之后**仍是 1**；被邀但缺席者 `invitedspeak` ⇒ `VMU_NOT_MEMBER` |
| §6 | **单次发言版群聊的完整闭环**：缺席 `speak` ⇒ `VMU_NOT_MEMBER`＋内核 hint `attend() first` 原样保留 ⇒ `attend` ⇒ `present === 2` ⇒ 同一成员 `speak` 成功（`turns>=1`）⇒ 主席重排后 `invitedspeak` ⇒ `wasQueued:true` 且 `turns>=2` ⇒ 发言消耗队位 ⇒ 新成员到场但从未排队 ⇒ `invitedspeak` 成功而 `wasQueued:false`（诚实读回） |
| §7 | `hands` 在 service ⇒ `VMU_ENGINE_UNAVAILABLE`，消息含 `QUEUE`，hint 含 `action=hand` 与 `action=invite` |
| §8 | **原语不回归**：原语会议仍能开（`defaultCanConvene` 要求 roster ≥ 2）；`hand` 仍回 `position`；被本轮点名者仍**不可**被邀请；guest 可邀且进 `invited`；`speakInvited` 仍 `countsTowardsRound:false`；`hands list` 可读、`hands grant` 无 chair 仍 `VMU_ENGINE_UNAVAILABLE` |
| §9 | **承诺与代码对齐**：读 `packs/v5r/tools.js` 断言 note 含「hand/invite/invitedspeak/order/attend now really reach a SERVICE meeting」与「silent/end/hands stay primitive-only」；读 `tools/meeting.js` 断言 enum 含 `order`/`attend` |
| §10 | **预约会议（`{ at }`，Lead 的 D1 条目）**：ISO 未来时刻 ⇒ `state:'scheduled'`、`scheduledFor === Date.parse(iso)`、`scheduleNote` 含该时刻；开始时前 `speak` ⇒ `VMU_STATE`；坏值 ⇒ `VMU_INVALID_ARGUMENT` 且消息含该值；时钟越过时刻后 `attend` ⇒ `state:'open'`，随后 `speak` ⇒ `turns>=1` |

---

## §5 仍缺的两块（不改判条件就不许写成 ✅）

### §5.1 发言序覆盖（`flow` / `overrideorder`）在真机上被具名拒

`flow({mode})` 的域是 `open|hands|round_robin|call_on`（`kernel/meetingmarker.js:330`），`rails()` 要求部署**声明** `vmu.meetings.orderMode`（`:381`、`:439`），否则 `VMU_ENGINE_UNAVAILABLE`「not declared by this deployment」。v5r 的 `packs/v5r/settings/defaults.json` **没有声明**这一键 ⇒ 真机上 `flow`/`overrideorder` 一律被拒（实测回执即此文本）。

- 这是**声明缺失**，不是能力缺失：内核的顺序器（fifo/round-robin/chair/random）齐备，`action=order` 也能读回当前地面。
- **改判条件**：`packs/v5r/settings/defaults.json` 声明 `vmu.meetings.orderMode`（值域 `fifo|round-robin|chair|random`，schema 在 `settings/schema.js`）。该文件属 Lead 写域，本 lane 不动。

### §5.2 「单次发言版群聊」缺的是**声明值**，不是机制

机制齐备：发言配额 `vmu.meetings.speechQuotaPerMember`（`kernel/meetings.js` 的 `speak` 里读，超限 ⇒ `VMU_MEETING_SPEECH_TIMEBOUND` 并具名 `enforced`）＋地面队列＋`floor` 回执。缺的是部署把它声明成 1（v5r 当前未声明 / 默认 0＝不限）。

- **改判条件**：`packs/v5r/settings/defaults.json` 声明 `vmu.meetings.speechQuotaPerMember: 1`（Lead 写域）。声明后本 lane 的 §6 闭环断言即可扩成「第二轮被配额具名拒」。

### §5.3 `attend` 的缺口（内核侧，非本 lane 写域）

`attend` **没有主席轨、也没有 actor 轨**（`kernel/meetings.js:725`）：任何人都能让任何在册成员入场，并把该成员写进 `roster` 与 `present`，从而改变法定人数分母。本 lane 只做了路由，没有替内核加权限。

- **改判条件**：内核给 `attend` 加一条轨（例如「只有本人或主席可以签到」＋一条 declared key），再由工具面透传 `actor`。属 Lead/vmu-core 决定。

---

## §6 谁动了什么（并发漂移如实记录）

HEAD 始终是 `fb237c95`；本 lane 期间工作树同时有其它 lane 的改动，本文件只声明自己那一份，其余按观察记录、不据以判 ✅：

| 归属 | 改动 |
|---|---|
| **本 lane（vmu-pack）** | `tools/meeting.js`（跨注册表 hand/invite/invitedspeak；新增 order/attend；hands 具名拒；头注释与 `live()` hint 补全）、`packs/v5r/tools.js`（回执 note 改准；`{ at }` 透传＋`state/scheduledFor/scheduleNote` 读回）、`tests/vmu-meeting-invite.test.mjs`（新）、本文件（新）、`package.json#files`（+1 行） |
| Lead（D1 lane） | `kernel/meetings.js` 的预约/等待/`proceed()` 与「主席轨」（`conveneRequiresChair`/`closeRequiresChair`/`extendRequiresChair`/`waitDecisionRequiresChair` 等）、`kernel/meetings-defaults.js` 的 `WIRED_KEYS`/`DEFAULTS`、`settings/schema.js` 对应 CORE_DEFS、`tools/meeting.js` 的 `proceed` 块（**本 lane 未改该块一字**） |
| vmu-core（D15 lane） | `kernel/meetingverdict.js`（新）、`tests/vmu-meeting-verdict.test.mjs`（新）、`kernel/index.js` 注册、`kernel/bus.js` 一条钩子 |
| 其它 lane | `packs/v5r/settings/defaults.json` 的 `vmu.records.tracks/allowedKinds` 增 `"verified"`、`packs/v5r/verified.js`、`tests/vmu-verified-track.test.mjs`、`docs/acceptance/conformance/lane-{verdict,verified-design}.md` |

约定：`tools/meeting.js` 里 `proceed` 块逐字保留（Lead 的所有权），本 lane 的新增块按「小步、每次 edit 前重读」写入。

---

## §7 交 Lead 决定 / 未做

### §7.1 `vmu-v5r-tools` 的 G7 ④ 红（**不是本 lane 造成的，现已转绿**）

- 断言在 `tests/vmu-v5r-tools.test.mjs:1219-1222`：`receipt(v5rBoot,'vibe_vmu_meeting',{action:'close', meeting:g7mid, member:chairId})` 之后断言 `ok===true` 且顶层与 `receipt` 内的 `enforced` 都是数组。
- 本 lane 期间它红过（`333 passed, 1 failed`）。实测根因：不传任何 actor/by/member ⇒ `{"ok":false,"code":"VMU_NOT_PERMITTED","message":"vmu.meetings.closeRequiresChair=true: closing needs the chair to name itself; the chair of m1 is r-chair","hint":"pass { actor: \"r-chair\" } …"}`；把主席名出来之后 `ok:true`，`enforced` 是四项真数组。
- 归因：`packs/v5r/settings/defaults.json` 的 `"vmu.meetings.closeRequiresChair": true` **在 HEAD 上就已存在**，内核 close 主席轨也在 HEAD 上；本 lane 的 diff 未触碰 close 路径。**修法（补 `member: chairId`）不是本 lane 做的**；本 lane 收尾复核为 `334 passed, 0 failed`（exit 0）。

### §7.2 `regen-all --check` = 6/16

stale 的十项由并行 lane 的 kernel/schema 改动 + 新测试共同造成（`documented counts` 里已含新套件）。Lead 已声明：所有 lane 落地后统一跑一次 `--write`；本 lane 不自行 `--write`（避免与并发写入互相覆盖）。

### §7.3 回执字段面的 `meeting_hand` / `meeting_invite` 是**死的第二入口**（内核侧，非本 lane 写域）

- 提示词教模型回 `/packs/v5r/prompts/v5r-blocks-a.js:585-586`：`"meeting_hand": true`、`"meeting_invite": {"member":"t-1","why":"…"}`；`kernel/turn/index.js:47-48` 把两者映射到 `vmu.meetings` 的 `queue` / `attend`。
- 但 `plan()`（`kernel/turn/index.js:946-952`）把**回执值原样**当 payload 发出：`queue(true)`、`attend({member,why})` —— **都没有 `meeting` id**。实测（`D:\_tmp\probe-reply-field-payload.mjs`）：两者均 `VMU_NO_SUCH_OBJECT`，message `no such meeting: undefined`；补上 `meeting` 后 `attend` 才 `ok:true`。
- 即：**提示词写了、映射也在，但这条入口对任何会议都不工作**。修法属内核（`plan()` 注入当前会议 id，或把这两个字段改指工具），非本 lane 写域 ⇒ 交 Lead 决定。修好之前，**真机上「举手/邀请」只有工具面这一条活路**（本 lane 已把它打通并立了门禁）。

### §7.4 台账与 lane-meeting 的改判归属

- `docs/acceptance/phase12-v5r-rules-conformance.md:63`（D9 行）、`:147` 与 `:185`（两条缺陷记录）现在都应从「邀请面真机不通」改判为「已通，剩 §5.1/§5.2 两个声明项与 §5.3 一个内核轨」，并挂本文件。
- `docs/acceptance/conformance/lane-meeting.md` 的 D9 行（`⚠️ 部分`：「pack 建的会议上 hand/invite 不可达、无批量入参」）同样需要更新 —— 两个文件都不在本 lane 写域，请其 owner 或 Lead 改判。
