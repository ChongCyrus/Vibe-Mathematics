# lane-d10-members —— D10 与 A 组（A1–A4）复核

> 只读复核。对象：`docs/acceptance/phase12-v5r-rules-conformance.md` §1 A 组与 D10 行。
> 判据（本轮自述）：**机制** ＝ 内核有能力**且**该能力被读、能改变结果；**消费者** ＝ pack 侧**真的调用**它。
> 结论只用三种：✅ 已实现 / ⚠️ 部分 / ❌ 缺口。每条结论都指到 `文件:行`；未能核到的写在 §未核项。

## 总表（6 行）

| # | 规则 | 判定 | 一句话证据 |
|---|---|---|---|
| D10-1 | 投票板：选项式＋每票「最多/最少选几项」 | ✅ 已实现 | 规则校验 `ballotbox.js:169,178-200`；**越限具名拒** `ballotbox.js:271-277`（`VMU_BALLOT_CHOICE_COUNT`）；pack 面把 `min/max/mode/min_votes/allow_revote` **翻译进** rules 并回报 applied/unapplied `packs/v5r/tools.js:636-648` |
| D10-2 | 任务板设置与认领/交派 | ⚠️ 部分 | 面覆盖全：`kit/extras.js:96-129`（claim/reassign/assign/transition/complete/reopen/set_dependencies）＋真交派 `packs/v5r/tools.js:258-290`；**但 claim/assign 的审计事实没有 `by`**：`kernel/tasks.js:302` 只记 `who`，`kit/extras.js:100-111` 也不收 `by`（`setPriority` 反而记了 `by`：`kernel/tasks.js:278`） |
| D10-3 | 群聊式交流（院士群管／权限／发言次数／禁言） | ✅ 已实现 | 六个键声明并接线 `kernel/chat.js:31-35,40-42`；管理动作具名拒 `:280-290`（`VMU_CHAT_NOT_ADMIN`）；**禁言具名拒** `:341-343`（`VMU_CHAT_MUTED`，带解除时刻）；**配额具名拒** `:349-357`（`VMU_CHAT_QUOTA_EXCEEDED`，带 used/limit/window） |
| D10-4 | 群聊／会议之间是否有第二套并行机制 | ⚠️ 部分（有，但作用域不同） | 群聊侧 `chat.js:31-35`（admins/speakQuota/muteDefaultMs/窗口）；会议侧 `meetings.js:179-182`（`speechQuotaPerMember`／`speechMaxMs`／`disciplineMuteMs`）⇒ 两套地址**不同对象**（会话发言 vs 会议发言），非同一件事双口径；`chat.js:7-8` 自述 v5r 群聊**没有** quota/mute，历史上是空白而非重复 |
| A1 | 所办＝主代理：用户助手、自动唤起汇报、媒介、可自然语言设参控进程 | ✅ 机制＋消费者 | office 声音投递 `packs/v5r/tools.js:49`（`vibe_v5_message` → mailbox `send` as office）、assign/nudge 通知 `:287,332`；通知族 `packs/v5r/notices.js:2-4`**（"自动唤起汇报"的具体唤起点未核，见 §未核项）** |
| A2 | 院士：主席席位，主持/决策会议 | ✅ 机制＋消费者（**两向已测**） | 主席席拒绝 `packs/v5r/tools.js:195-206`（`toolOverview`，座位判定 `:198-201`）、会议/表决动作要求 chair `:482-488`（`requireChairSeat`）；投票席位**声明式** `settings/schema.js:1101`（`vmu.meetings.eligibleSeats`）＋ `kernel/meetings.js:132,350-363` 消费（空列表回落 `:356` 全名册）；两向断言（chair ⇒ ok／非 chair 与未知成员 ⇒ 各具名拒）见 `tests/vmu-a2a3-seats-and-bounds.test.mjs` |
| A3 | 常驻研究员 | ✅ 机制＋消费者（**两向已测**） | `vibe_v5_start` = `packs/v5r/tools.js:1050`（`toolStart`，行号随 `tools.js` 并行修改漂移，以函数名为准）：`researcherCount` 默认 3（`:1051`）、域 `0..50` 越界具名拒 `VMU_INVALID_ARGUMENT`（`:1052`，带 hint、零副作用）；省略⇒3 / 0⇒合法 / 51 与 -1⇒具名拒，四向断言见 `tests/vmu-a2a3-seats-and-bounds.test.mjs`（17/0，见 §A2/A3 复扫记录） |
| A4 | 临时工：可雇/可解、无表决权、默认不参会 | ⚠️ 部分 | 雇 `packs/v5r/tools.js:154`（`members.hire` 进 `temp`）＋初始任务；解 `:295`（`members.end`＋任务 `cancelled`，`:59`）；temp 席位权限只有 `speak`（`packs/v5r/prompts/v5r-core.js:217`）⇒ **权限层无表决权**；但**表决门是否读该权限未核**，且 `eligibleSeats` 的 **pack 声明未找到**（schema 默认 `[]` ⇒ `meetings.js:356` 回落全名册，temp 会被计入分母） |

## 额外发现（单列一节）

1. **`VMU_CHAT_CAP_REACHED` 是"登记但提案未实现"，不是漂移**：`docs/03-interface-contract.md:386` 的 R2 行与 `:1185` §8.1「提案 ⛔ … 仅登记在表里」一致；代码里确实没有该码。**不是缺陷**（文档已自述），但如果合账需要"聊天环形上限"这条，它是**未实现项**。
2. **D10-2 的审计事实缺口（建议修）**：`claim`/`assign` 走 `kernel/tasks.js:286-302`，`record('task-assigned', { id, who, state })` **只有被指派人**；而 `setPriority` 有 `by`（`:278`）、`objectAssign` 有 `by`（`:329-337`）。⇒ 谁认领/谁交派**不可追溯**。修法：`assign(id, who, { by })` 把 `by` 记进 record（内核 1 处＋面 1 处传参），并加断言"record 含 by"。
3. **`eligibleSeats` 的默认值方向**：schema 默认 `[]`（`settings/schema.js:1101`），`meetings.js:356` 在空列表时**回落到全名册**。v5r 的声明我只在 `packs/v5r/tools.js:436,457`（注释/逻辑）见到，**没在 pack 的 settings 文件里找到声明** ⇒ 若真未声明，temp 会被计入"可表决宇宙"。这是 A4「默认不参会」与 A2 的边界问题，建议下一轮确认 pack 是否声明。

## 逐行展开

### D10-1 投票板（✅）

- **正证 ①** 规则键白名单与域校验：`kernel/ballotbox.js:169`（`RULE_KEYS`）、`:175`（`VMU_BALLOT_RULE_UNKNOWN`）、`:178-190`（`minVotes/maxChoices/minChoices` 必须非负整数）、`:194`（`mode ∈ {single,multi}`）、`:197-198`（`minChoices ≤ maxChoices`）、`:200`（`single` 强制 `maxChoices=1`）。
- **正证 ②** 越限**真执行且具名**：`kernel/ballotbox.js:271-277` —— `n < minC` ⇒ `deny('VMU_BALLOT_CHOICE_COUNT', '选择数 n 少于规则 minChoices=…')`；`n > maxC` ⇒ 同码另一侧。**不是静默截断**。
- **正证 ③** pack 面把原版 per-poll 规则**翻译**进内核：`packs/v5r/tools.js:636-637`（`min→minChoices`、`max→maxChoices`、`min_votes→minVotes`、`mode`、`allow_revote`），`:645-648` 回执区分 `applied` 与 `unapplied`（`secret`/`allow_abstain` 明确说明本内核无对应规则）——**未落地的规则不会被假装生效**。
- **反证**：`mode:'single'` 下未给 `maxChoices` ⇒ 默认 1（`ballotbox.js:200`），超选即拒；标量 `choice` 走同一路径（`:268-281`）；不在票面的选项 `VMU_CONFLICT`（`:279-281`）。
- **没核到的部分**：没有在**活宿主**里用真实工具调用跑一遍 `vibe_v5_poll_open/vote`（本轮只做静态证据＋既有套件）；`multi` + `maxChoices` 缺省为 `Infinity`（`:273`）时"无上限"是否有回执自述，未核。

### D10-2 任务板（⚠️ 部分）

- **正证**：`vibe_v5_task_update` 的 action 全集在 handler 里逐条断言 `kit/extras.js:96-99`（未知 action 具名拒），`claim` `:100-103`、`reassign|assign` `:105-111`、`transition` `:116-120`、`complete|reopen` `:122-125`、其余按 `setDependencies` `:127-128`；真交派另有 `vibe_v5_assign`（`packs/v5r/tools.js:258-290`，含 mailbox 通知 `:287`）；`setPriority` 内核有独立方法且**记录 by**（`kernel/tasks.js:267,278`）。
- **反证**：`claim` 必须给 `member`（`kit/extras.js:101`），`assign/reassign` 必须给 `owner`（`:107-109`），否则具名拒；`transition` 的合法性由内核转移表判（`:113-115`），面不另造表。
- **缺口（部分）**：`kernel/tasks.js:302` `record('task-assigned', { id, who: t.owner, state })` —— **没有 `by`**；`kit/extras.js:100-111` 也不接收 `by`。⇒ 「谁认领/谁交派」的审计事实缺失（与 `setPriority` 的 `by` 不一致）。
- **没核到的部分**：`TASK_UPDATE_FACE_OPS` 的字面量内容（只看到用它校验 `:96`，未逐项抄出）；`vibe_v5_task_update` 的 `parameters` 里 `action` 是否有 `enum`（只读了描述行 `:1084`）。

### D10-3 群聊（✅）

- **正证**：`kernel/chat.js:31-35` 声明并读取 `vmu.chat.admins/speakQuota/speakQuotaWindowMs/muteDefaultMs/freezeExemptAdmins`；`:40-42` 自述"WIRED ＝ 被读且能改变结果"；管理员判定唯一入口 `:190-191`（声明列表 ∪ 注入 seam），默认 `:130`；管理动作非管理员 ⇒ `:280-290` 具名拒 `VMU_CHAT_NOT_ADMIN`（给允许名单）；禁言期发言 ⇒ `:341-343` `VMU_CHAT_MUTED`；配额 `:349-357` `VMU_CHAT_QUOTA_EXCEEDED`（message 带 used/limit，窗口；hint 说明 `0 = unlimited`）；窗口计数 `:237-247`（非有限时间戳**排除**而非计入，保守方向）。
- **反证**：配额为 0 时不拒（`:351` `limit > 0 &&`）；`usedOf` 的窗口为 0 ＝ 全会话（`:241`）；禁言与暂停是两个键（`freezeExemptAdmins` 只影响冻结期例外），互不冒充。
- **没核到的部分**：v5r pack 是否把 `chair` 写进 `vmu.chat.admins`（"院士为群管"的**配置事实**未核）；`vmu.chat.historyCap` 无实现（对应 `VMU_CHAT_CAP_REACHED` 提案状态）。

### D10-4 是否有第二套并行机制（⚠️ 部分：有，非重复）

- 群聊：`chat.js:31-35` 的会话级 admins/quota/mute；会议：`meetings.js:179-182` 的 `speechQuotaPerMember`/`speechMaxMs`/`disciplineMuteMs`/`interruptQuota`。
- **口径差**：两者作用对象不同（**会话发言** vs **会议发言**），且 `chat.js:7-8` 明确记载 v5r 的群聊**没有** quota、没有 per-member mute（"its only mute was the meeting-wide ballot freeze"）⇒ 这是**补齐**而不是**双口径**。
- **仍需注意**：同一"发言次数"概念在两个组件各有一套计数与窗口语义（`chat.js:237-247` vs `meetings.js` speech 配额）。若后续要"统一配额语义"，应把窗口/上限抽成声明而不是两处各写。**本轮不判定为缺陷**（作用域不同，且各自具名拒）。

### A1 所办（✅ 机制＋消费者）

- 机制：mailbox `send` 支持以 `office` 声音投递（`packs/v5r/tools.js:49` 的映射说明；`:287` assign 通知、`:332` nudge 均从 office 发出）。
- 消费者：`packs/v5r/tools.js:1048` 的 `vibe_v5_message` 描述（office/human 中继），以及 `notices.js:2-4` 的框架通知族。
- 缺口方向：**"有进展时自动唤起汇报"**的具体唤起点（turn 循环的 notice 注入）本轮未逐行核到 ⇒ 见未核项。

### A2 院士（✅）

- 机制：overview 仅 chair（`packs/v5r/tools.js:195` 的 `toolOverview`，座位判定 `:198-201`）；会议/表决动作要求 chair（`:482` 的 `requireChairSeat`）；投票席位是**声明值**（`settings/schema.js:1101`）而非硬编码角色。
- 消费者：`kernel/meetings.js:132` 读取、`:350-363` 用于法定人数分母（空列表回落 "roster (no voter seats declared)" `:356`，且 lookup 失败者**计为合格**而不是缩小分母 `:360-362`）。

### A3 常驻研究员（✅）

- `vibe_v5_start` = `packs/v5r/tools.js:1050`（`toolStart`）：`researcherCount` 默认 3（`:1051`）、范围 0..50 具名拒（`:1052`），回执 `hired`/`started`（`:1050` 起）。**行号是快照**：同一 `tools.js` 在 15:07→15:27 之间整体下移约 290 行（`toolStart` 从 `:761` 到 `:1050`），因此本文件一律以**函数名**定位，行号只作辅助。

### A4 临时工（⚠️ 部分）

- 正证：雇佣进 `temp`（`packs/v5r/tools.js:154`，`members.hire({slot:'temp'})`）＋初始任务；解雇 `members.end` ＋任务 `cancelled`（`:59`、`:295`）；temp 席位声明权限只有 `speak`（`packs/v5r/prompts/v5r-core.js:217`）⇒ **无 vote 权限**。
- 反证/未证：① **表决门是否读 `vote` 权限**未找到明确检查（`kernel/index.js:1527` 的 closure vote 读的是 `vmu.turn.closureVotePermission`，不是席位权限）⇒ "无表决权"目前证据在**席位声明**层，执行层未核；② **默认不参会**依赖 `vmu.meetings.eligibleSeats` 是否被 pack 声明——schema 默认 `[]`，`meetings.js:356` 空则回落全名册（temp 会被计入分母）；本轮**未找到 v5r 的声明**（只在 `packs/v5r/tools.js:436,457` 的注释/逻辑见到）。

## 未核项

1. **活宿主端到端**：D10-1（poll_open→poll_vote 越限）与 D10-3（真实 mute/quota 拒）只做了静态与既有套件证据，**没有**真机 session 复现（本轮无真机授权窗口）。
2. **`vibe_v5_chat` 面**：管理动作（setAdmins/setQuota/mute）到 `kernel/chat.js` 的**调用链**未逐行核（只核了内核侧具名拒）；"院士作为群管"的**配置事实**（v5r 是否把 chair 写进 `vmu.chat.admins`）未核。
3. **`vmu.meetings.eligibleSeats` 的 v5r 声明**：未在 pack settings 文件中找到；若确实未声明，则 A4 的"默认不参会"在**法定人数分母**上不成立（只在出席/发言上成立）——需要下一轮读 pack 的 settings 全量确认。
4. **表决权限门**：未找到 `vote` 权限的执行点；`kernel/index.js:1527` 是 closure vote 的**另一个**设置键。
5. **`TASK_UPDATE_FACE_OPS` 字面量**与 `vibe_v5_task_update` 的 `action` `enum` 未抄录。
6. **时间**：本次复核只覆盖上述 6 行＋3 条额外发现；合账其余行未动。

---

## A2/A3 落点可达性（装配静态图，R16）

Lead 的 R16 判据升级：一条"已接线"的结论，**光有"字符串出现在 runtime"不够，必须是"出现在装配可达的 runtime"**。下表用 `scripts/lib/reachability.mjs` 的 `walkAssembly()`（8 个 `PLUGIN_ENTRY_FILES` 出发的静态 import 边 BFS）给 A2/A3 的**每个落点文件**标注可达性，并给出真实 import 链（探针 `D:\_tmp\reach-chain.mjs`，带 parent 链；2026-10-23 15:40 读数）。

| 结论 | 落点文件（符号） | 从插件入口可达 | import 链 |
|---|---|---|---|
| A2 主席席拒绝 | `packs/v5r/tools.js`（`toolOverview`） | ✅ | `vibe-math-vmu.js → packs/v5r/index.js → packs/v5r/prompts/v5r-core.js → packs/v5r/tools.js` |
| A2 表决席位读点 | `kernel/meetings.js:132`（`eligibleSeats`） | ✅ | `vibe-math-vmu.js → kernel/index.js → kernel/meetings.js` |
| A2/A3 设置声明 | `settings/schema.js:1101` | ✅ | `vibe-math-vmu.js → settings/schema.js` |
| A3 start 的默认/域 | `packs/v5r/tools.js`（`toolStart`） | ✅ | 同第一行 |
| ★ 反例（对照） | `kernel/paper.js`（`vmu.paper.*` 10 键） | ❌ | 不在图内（`KNOWN_UNMOUNTED`：`createPaper(` 只出现在测试/脚本；v5r 论文走 `packs/v5r/paper.js → kit/paper.js`，不读这些键） |
| ★ 反例（对照） | `kernel/grant.js`（`vmu.grant.*` 4 键） | ❌ | 不在图内（登记为无消费者，待删/待接） |

**读法（诚实边界，抄自 `scripts/lib/reachability.mjs:9-16`）**：可达 = 「加载器至少有一条 import 路径能看见它」，**不**证明模块被构造、被调用，也不证明键值改变行为——那三件事属 `audit-settings-wired` 与行为套件（例：`tests/vmu-a2a3-seats-and-bounds.test.mjs` 证明了 `toolStart` 的域**真的**改结果）。可达性是最便宜的一半，但它是"接线"声称的**下界**：文件都不在装配里，读点必然是死的。

**由此得到的写法（本轮起）**：给每条 `✅ 已实现/已接线` 的结论附「落点文件 ∈ 装配可达图」，否则降为 `⚠️ 未接线（读取者不可达）` 或 `N/A 有理由`。

## A2/A3 复扫记录（R16）

1. **行号漂移（旧引用作废）**：A2 `:188-190` ⇒ `toolOverview :195`（座位判定 `:198-201`）；A2 `:503` ⇒ `requireChairSeat :482`；A3 `:749-766`/`:752`/`:753` ⇒ `toolStart :1050`/`:1051`/`:1052`。原因：`packs/v5r/tools.js` 正被并行修改，15:07→15:27 之间整体下移约 290 行（sha 063A7DD8… → AAB797DE… → E22F06F5…）。**教训**：落点写「函数名 ＋ 相邻唯一串」，行号一律视为快照。
2. **覆盖缺口（真缺口，已补）**：复扫前对 `researcherCount` 与 overview 拒绝做全文 grep，**没有任何负向断言**——旧 `✅ 机制＋消费者` 只是"读代码读到的"，不是"测出来的"。⇒ 新增 `tests/vmu-a2a3-seats-and-bounds.test.mjs`。
3. **新测试断言面（17 条）**：A3 四向（省略⇒启动成功、默认真是 3、`0` 合法且真坐 0 人、`51`/`-1` ⇒ 具名拒＋hint＋零副作用）；A2 三向（chair⇒ok、非 chair⇒`VMU_NOT_PERMITTED` 点名 chair、未知成员⇒具名拒且 hint 所指替代读点确实存在）；RULE E 自检 2 条（`codes.length === 2 && codes.every(seen.has)`，不是空集合上成立）。
4. **有牙自证**：临时拔掉 `toolOverview` 的 chair 判定与 `toolStart` 的域判定 ⇒ **8 条失败**（含"51 不拒/零副作用"两族）；`Copy-Item` 备份 + try/finally 复原 ⇒ **17/0**、`node --check` 通过。**并发教训**：该文件当时正被他人编辑，"备份→改→复原"窗口虽 ≤1 分钟仍有覆盖风险；今后对活文件拔牙，先确认 owner 不在编辑，或改在副本目录里拔。
5. **RULE E（基线不动）**：本轮我自己引入的 `vmu-a2a3-seats-and-bounds.test.mjs:A:codes` 空集合风险已改成先断非空；`vmu-verified-gates.test.mjs:A:cat`、`:A:for:callers`、`vmu-meeting-verdict.test.mjs:A:r.perMember` 三处也由我加了非空守卫（tests/** 属验证车道写权）。**注意**：Lead 后到的派单把前两处给 v5r-reader-b、最后一处给 vmu-core——已同步"我已改完，勿重复改"，基线指纹一条未加。

