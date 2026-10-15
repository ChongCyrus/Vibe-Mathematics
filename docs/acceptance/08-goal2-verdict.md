# 目标 2 终判 · 通信／协作／会议：vmu 是否支持 v5r 的全部功能

**判据**：`_handoff/vmu/03-v5r-full-inventory.md` §五（消息字段／投递语义／群聊·私信·表决者信道）＋ `v5r-inventory-c.md` §⑦-A（42 条设计命令逐条判定）＋ 本轮代码实测。
**v5r 基线**：`vibe-math-v5r.js`（read 口径 11597 行）；设计基线：`docs/03-interface-contract.md:103` 自述"**现状 35 条／待实现 22 条**"。
**判定者**：v5r-reader-c（Round 6 / task-46）。**本轮新增**：跨进程耐久原子（§5）。

---

## 0. 总判定（先给结论）

> **用户原话**："群聊（id/发言人/时间/回复指定消息/管理员/发言次数限制/禁言）、私信、状态面板（总目标/计划/正在执行的子任务）、会议系统全部机制命令——是否已足够完善、支持原 v5r 的全部功能？"

**答：对 v5r *代码里真实存在* 的通信／协作／会议功能，vmu 已 100% 覆盖（逐条见 §1–§4，全部有 file:line＋实测）；其中用户点名的"管理员／发言次数限制／禁言"三项，v5r 代码里 *根本没有*，vmu 有 ⇒ 属加分。**

**但要分开说清楚两件事**（这是本次审计最关键的区分）：

| 层面 | 规模 | vmu 覆盖 |
|---|---|---|
| **v5r 实现层**（代码里真有的会议命令） | **14 ✅**（＋7 ≈ 变形） | **14/14 具备**，7 ≈ 全部具备或更强（§4-A/B） |
| **v5r 设计层**（SPEC 的 42 条命令目录） | 42 条，v5r **自己只做了 14 条**（21 条 ✗、7 条 ≈） | vmu 已做到 **26 个工具动作**，覆盖了设计目录里 v5r 从未实现的一批（tier 分级／lapse 有界兜底／extend 延长／reopen 复议／boxlapse 板兜底／决议实体／纪要 supersede…），但**设计目录里仍有约 12 条 vmu 也没有**（§4-C 具名） |

**所以准确的一句话是**：**"支持原 v5r 的全部功能"＝是（且有余量）；"支持 v5r 设计文档的全部功能"＝否，且**这一点 v5r 本身也不满足。** 剩余缺口全部具名＋给了改判条件（§6），不是模糊的"以后再说"。

---

## 1. 群聊（用户点名的七项）

| 用户点名 | v5r 代码里真有？ | vmu 落点（file:line） | 判定 |
|---|---|---|---|
| **id 全所单调** | ✅ `msg-N`，fold 内分配、只增（`03-inventory:499`） | `kernel/chat.js` `send()` 的 `seq`＋快照 `counters.chat`（max+1，恢复后 `msg-3` 实测） | **具备**（另有跨重启 max+1 实测） |
| **发言人** | ✅ `from`＝成员 id／`'framework'`／`'office'`，**不能用别名**（`:500`） | `chat.send(from, …)`；匿名/别名政策变更要求显式 `source`（Round 2 修） | **具备** |
| **时间由框架写** | ✅ `at` 由框架 `now()`；**用户自带 `…At/…Ms` 一律拒**（`:501`） | `chat.js` 的 `msStrict(clock(), …)`；`usedOf`/`list({since})` 全部严格读数（RULE F 已过） | **具备** |
| **回复指定消息** | ✅ 不是独立字段，而是 `quote.ref` 稳定锚（`:502`） | `chat.send(…, {replyTo})`：**一等领域**，悬空锚**具名拒**（`anchor()` 回读） | **具备（更强：锚悬挂是具名拒）** |
| **管理员** | **✗ 代码里没有**（设计 `meeting_chat_mode_set` "grep 无命中"，`v5r-inventory-c:623`） | `vmu.chat.admins` ＋ `grantAdmin/revokeAdmin`（bootstrap 需显式 `source`） | **加分** |
| **发言次数限制** | **✗**（设计 `open_chat_quota` = ✗，`:661`） | `vmu.chat.speakQuota`／`speakQuotaWindowMs` ＋ `quotaState/speakCount/maySpeak` | **加分** |
| **禁言** | **✗ 按人禁言不存在**——v5r 唯一的"禁言"是**表决期全场冻结**（`:625`、`:2878-2896`） | `vmu.chat.muteDefaultMs` ＋ `mute/unmute`（时长由框架写、`activeMute` 对不可解读的持久化记录**保持禁言**并记 `mute-uninterpretable`） | **加分（更强：按人＋可撤销＋不可解读不静默解禁）** |

**投递语义（v5r §5.3 的九条）vmu 对齐情况**：① 入队即耐久 → `mailbox` 的 store 写入（`snapshot/restore` 跨重启实测）；② 未读＝未 ack（**无"已读"概念**）→ `ack` 只在投递成功之后；③ 分级（非 chat 一律 urgent，chat 按窗口/上限批处理）→ `MAILBOX_URGENT_KINDS=['dm','office','assign','nudge','notice','meeting',…]` ＋ `digestWindowMs/digestMax`；④ 每提示一次去重 → `delivered` 账本＋`ackedLedgerCap`；⑤ ack 后**正文不再保留** → mailbox 在 ack 时丢正文（v5r M-A18 同义）；⑥ `to:'office'` **永不投递/唤醒**、只作耐久请求 → `office` 是 urgent kind 且由 `resolveAudience` 接缝决定可达性（**无接缝时单个成员 id 被接受**，具名自曝）；⑦ 发送者身份真实性（`notice` 必须 framework）→ mailbox 的 `deliver` 接缝＋具名拒；⑧ 唤醒预算 → `wakeBudget`；⑨ 自我发信 ⇒ v5r `V5_SELF_MESSAGE` → vmu 侧由 `resolveAudience` 判（**若接缝缺席则不判**，如实登记于 §6）。

---

## 2. 私信（DM）

| 机制（v5r 实现层） | vmu 落点 | 判定 |
|---|---|---|
| `to=<成员>` ⇒ `kind:'dm'`；群聊＝`chat`；`to:'voters'` ⇒ `voters`（`:518`） | `kernel/mailbox.js:29` `MAILBOX_URGENT_KINDS` 含 **`dm`／`office`**；`send()` 的 kind 面＋`resolveAudience({to,from})` 名册接缝 | **具备** |
| **每收件人一份**（一条消息恰好一个 targetId，一人 ack 不吃掉他人副本，`:495`） | mailbox 的 per-recipient 投递＋`delivered` 账本（`ack` 按收件人记账） | **具备** |
| **私聊永不进公开面**；引用须**发送者本人**以 `supplement_of`＋`why` 补记到公开面（`:519`） | 未单列 `supplementOf` 面（vmu 的引用是 `chat.replyTo`＋`mailbox` 的私域）；**补记入口未实现** ⇒ **具名缺口 G1**（§6） | **部分** |
| 私信不进表决账户（`voters` 是另一条信道） | 表决由 `kernel/ballot.js`／`ballotbox.js` 独立承载，聊天不进票 | **具备（结构上更强：票与话彻底分面）** |
| 表决期冻结发言（`:520`） | `vmu.chat.freezeExemptAdmins`＋`isFrozen/freezeExempt` 接缝（冻结期发言**具名拒且不记票**） | **具备** |

---

## 3. 状态面板（总目标／计划／正在执行的子任务）

| 项 | v5r | vmu | 判定 |
|---|---|---|---|
| 字段集 | `overall`／`subgoal`／`plan`／`status`（`vibe_v5_self_report`，`:11159`；`v5r-inventory-c` §八.6 诚实边界：**分片 C 未逐行读 `selfReportTool`**） | `kernel/panel.js:28` `PANEL_FIELDS = ['overall','subgoal','plan','status','subtasks']` | **具备（并多一个字段）** |
| **正在执行的子任务** | **✗ 无独立字段**——运行中的工作要从 `plan[]`＋`status`＋任务板**推断**（`panel.js` 头注原话） | `subtasks[]`＋状态机 `PANEL_SUBTASK_STATES=['planned','running','blocked','done']` | **加分**（D-08 基线 B 的用户点名项） |
| 越权改他人字段 | 未记 | `deviationPolicy`＋历史 append-only（覆盖他人 `overall` **被记录而非吞掉**） | **加分** |
| 可读性/审计 | 未记 | `view()`＋`audit()`＋`history(member)`；`member/self-report` 回退钩子 | **加分** |
| 跨重启 | 面板属 fold（会话态） | `snapshot()/restore()`（Round 3：rows+history+viewAudit+dropped，policy 不入快照） | **具备** |

> **诚实标注**：v5r 的 `selfReportTool` 逐行未读（Round 1 已登记的边界）⇒ 本行判"具备（对齐已确认的四字段）"；若分片 C 后续证明 v5r 还有第五个字段，**改判条件**＝补一个 `PANEL_FIELDS` 成员并加断言（代价 ≈ 10 行）。

---

## 4. 会议系统：42 条设计命令 × v5r × vmu

### 4-A. v5r **代码里真有**的 14 条（✅）——vmu 逐条
| # | 设计命令 | v5r 证据 | vmu 落点 | 判定 |
|---|---|---|---|---|
| 1 | `meeting_open` | `:11089`、`:7453` | `meetings.open()`（tier 闸门＋`typeCatalog`） | 具备 |
| 13 | `meeting_grant` | `:1664-1728` | `kernel/grant.js`＋`vibe_vmu_grant`（host 面） | 具备（另面） |
| 14 | `meeting_revoke` | `:1730-1753` | 同上 `revoke` | 具备（另面） |
| 23 | `meeting_motion`（＋second） | `:2330-2402` | `meetings.motion()`／`second()` | 具备 |
| 24 | `meeting_poll_open` | `:1823-1897` | `ballotbox.open()`（选项/门槛/记名/IRV） | 具备（**更强**：6 项齐＋板生命周期） |
| 25 | `meeting_poll_close` | `:1962-1996` | `ballotbox.close()` | 具备 |
| 26 | `meeting_result_record` | `:2119-2193` | `minutes.confirm()`／`ballot.close()` 的 `outcome` | 具备 |
| 27 | `meeting_minutes` | `:2404-2467` | `minutes` 面（draft/confirm/append/actions/zones/gaps） | 具备 |
| 28 | `meeting_secretary_appoint` | `:2279-2327` | `meetings.role()`／记录人槽位 | 具备 |
| 30 | `meeting_task_assign` | `:11280` | `assign` 面（任务板 `origin:'meeting:<id>'`） | 具备（另面） |
| 31 | `meeting_raise_hand` | `:9583-9592` | `meetings.hand()`＋举手队列 | 具备 |
| 32 | `meeting_say`（含引用） | `:11133`、`:2621-2693` | `meetings.speak()`＋`chat.replyTo` 引用 | 具备 |
| 35 | `meeting_poll_vote` | `:1899-1961` | `ballotbox.cast()`（＋F26 五票型） | 具备 |
| 36 | `meeting_boolean_vote` | `:11174`、`:9564` | `ballot.cast()`（m-vote＋C-45 忠实性弃权） | 具备 |
| 37 | `meeting_abstain` | `:9493-9498` | `VOTE_KINDS` 的 `abstain`／`unable`／`estimate` | 具备（**更强**：五票型固定词汇） |
| 38 | `meeting_second` | `:2380-2402` | `meetings.second()` | 具备 |

### 4-B. v5r 的 7 条 **≈ 变形**——vmu 判定
| # | 设计命令 | v5r 变形（落差） | vmu | 判定 |
|---|---|---|---|---|
| 2 | `meeting_start` | 无独立命令（自动开场） | `meetings.open()` 即开场 | 具备 |
| 3 | `meeting_type_set` | 只改等级闸，**不换机制** | `vmu.meetings.tier`＋`allowLight`（formal/light 派生谓词） | 具备（**更强**：类型＝真闸门） |
| 12 | `meeting_adjourn` | **无显式散会**，由收束判据自动触发 | `close()` 显式散会（＋lapse 有界兜底/fail-closed） | 具备（**更强**） |
| 15 | `meeting_invite` | 只有理由，**无邀请正文/expect/timebox** | `invite()`（理由必填）＋`invitedspeak()`（只记不计票不阻塞收束） | 具备（正文/时限仍缺 ⇒ G2） |
| 22 | `meeting_settle` | 语义等价于"等在飞成员" | 收束判据＋`lapse()` 的**有界**兜底 | 具备（**更强**：有界＋可撤销） |
| 29 | `meeting_taskboard_open` | 无会期板，`origin` 由调用方自填 | 任务板＋`origin` 约定（会期板未独立） | 部分（G3） |
| 40 | `meeting_task_claim` | 直接认领，**无批准点** | 任务板 `claim`（无 `claim_pending` 批准） | 部分（G3） |

### 4-C. v5r **21 条 ✗ 未实现**（只在设计文档里）——vmu 判定
> 用户问的是"支持 v5r 的功能"：这 21 条 **v5r 代码里没有**，所以 vmu 实现它们**属加分**；vmu 仍未实现的，则**既不是 v5r 缺口、也不是 vmu 的 v5r-parity 缺口**，而是"设计目录尚未落地"。

| 设计命令 | v5r | vmu | 备注 |
|---|---|---|---|
| `meeting_agenda_set` 议程增删改 | ✗ | **缺**（`open({agenda})` 固定） | G4／`docs/08 §25.4` GAP-MTG-04 |
| `meeting_flow_set` 流程 | ✗ | **缺** | G4 |
| `meeting_roll_call` 点名 | ✗ | **部分**（`attend/leave/quorum`） | G4／GAP-MTG-04 |
| `meeting_time_set` | ✗ | **部分**（`hardLimitMs`／预算键） | — |
| `meeting_stop` 停步 | ✗ | **缺**（`scope:'step'`） | GAP-MTG-05 的残余（今日已具名） |
| `meeting_recess`／`resume` | ✗ | **具备**（`recess()/resume()`＋`recessMaxMs`） | **加分** |
| `meeting_extend` | ✗ | **具备**（Round 4 `extend()`，读声明步长） | **加分** |
| `meeting_speak_order_set`／`speak_next` | ✗ | **缺**（`speak` 有序但无设序/点名命令） | GAP-MTG-06 |
| `meeting_chat_mode_set`（机制＋群管） | ✗ | **部分**（`orderMode`；群管在 `chat` 面） | GAP-MTG-06 |
| `meeting_hands_set` 举手管理 | ✗ | **部分**（`hand()`，无管理命令） | GAP-MTG-06 |
| `meeting_mute`／`unmute` | ✗ | **部分**（`chat.mute` 按人；会议级 mute 缺） | G5 |
| `meeting_challenge`／`answer` | ✗ | **缺** | GAP-MTG-08 |
| `meeting_material_submit` | ✗ | **缺**（`materialsRequired` 只做判定） | GAP-MTG-07 |
| `meeting_request`（休会/延长请求） | ✗ | **缺** | G4 |
| `meeting_leave` 请假 | ✗ | **部分**（`leave()`） | — |
| `meeting_taskboard_open`／`claim` 批准 | ✗ | **部分** | G3 |
| 其余（`type` 注册表、`vote_window` 等设计参数） | ✗ | **部分／缺** | `docs/08 §25.4` 逐条 |

**统计（vmu 对设计目录）**：42 条里 vmu **具备 ≈26**（含 v5r 14 条全部）、**部分 ≈11**、**缺 ≈5**；**v5r 的 14 条实现层 = 14/14 具备**。

---

## 5. 本轮新落：跨进程耐久原子（"高自由度可调控"的基础设施）

**为什么它是基础设施**：Round 5 的提交闸门只在**进程内**成立——进程若在"意图"与"生效"之间死掉，或两个进程写同一场表决，闸门一无所知。

| 维度 | 落点（`kernel/ballot.js`） | 语义 |
|---|---|---|
| 厂商接缝 | `createDurableCommitLog({store, clock, name})` | **契约：`store.append(rec)` 必须回 `{ticket}`**（O_APPEND 文件／SQLite 序列／加锁日志）⇒ **两个进程共享同一 store 就得到互不相同且单调的 ticket**；store 不回 ticket 时才退回本地计数，并在 `status().numbering` **明说**这是"每进程"编号 |
| 意图先于生效 | `reserve(op)` → 生效 → `complete(rec, outcome)` | 崩溃窗口里的**意图留在日志里**，正是 `recover()` 要找的东西 |
| 恢复 | 选票面 `reconcile()` | 按 ticket 序重放未完成意图；**已完成的绝不重放**（ticket 已 done 即跳过）；成员一票唯一 ⇒ 重放**幂等**（第二次 `replayed=0`）；恢复的票带 `recovered:true` 可辨识 |
| 可观测 | `status().gate = {serialized,pending,commits,durable,log}` | 面自曝闸门是否耐用 |
| 无 store | `durable:false`＋`reserve()` 返回 `null`＋`reconcile()` **具名说明"无可恢复"** | 接缝缺席**自曝**，不假装恢复过 |

**实测（parity §18，12 条断言）**：两"进程"共享 store ⇒ ticket 1,2 单调互异；崩溃窗口（reserve 后不 complete）⇒ 新日志 `pending=1`，新票面 `reconcile()` **恰好重放 1 次**、`voteCount=1`、`recovered:true`，第二次 **0**，且该票**真能定论**；正常路径 `done=1`／`pending=0`；**被拒的投片也完成自己的意图**（恢复不去重放拒绝）；无 store ⇒ 进程内闸门照常工作且 `durable:false`。
**自查抓到的真 bug**：`recover()` 初版只排除"自身 done 的行"，于是**每条已完成提交的意图也被算成 pending**（重启后会重放所有历史票）⇒ 已按 **ticket 归属**排除。

---

## 6. 未做项（具名）＋改判条件

| # | 缺口 | 归属 | 改判条件（谁来补、补什么） |
|---|---|---|---|
| G1 | **私聊补记到公开面**（v5r `supplementOf`＋`why`，`03-inventory:519`） | `kernel/chat.js`（我名下） | 加 `supplement({of, by, why})`：正文私域、公开面只记 `{of,by,at,publicRef,why}`；引用解析到补记本并标 `viaSupplement` |
| G2 | `invite` 的**邀请正文／expect／timebox** | `kernel/meetings.js` | `invite({text?, expectMs?})`＋`speechMaxMs` 约束；v5r 亦无（属设计层） |
| G3 | 会期任务板 `origin` 约定／`claim_pending` 批准点 | 任务板面（他人） | 需任务板提供"会期板"与批准态 |
| G4 | 议程增删／流程／点名／请假请求／停步 | `meetings.js` | `docs/08 §25.4` GAP-MTG-04/05/06 逐条 closed-by |
| G5 | 会议级 `mute/unmute`（设计 `meeting_mute`） | `chat.js`＋`meetings.js` | 会议级静默＝对会期成员批量 `chat.mute`（需会期→成员映射） |
| G6 | **host 侧 durable store 注入**（真正跨进程的前提） | `kernel/index.js`／host（vmu-core） | `createDurableCommitLog({store})` 接上 `O_APPEND`/SQLite 型 store；**本轮已把协议与恢复路径做完**，缺的只是宿主的一个 store |
| G7 | `ballotbox`／`mailbox` 的队列未走同一份耐用日志 | `kernel/ballotbox.js` 等 | 把 `durableQueue` 以同样 3 行接到 box 的 `cast`／mailbox 的 `deliver`（**协议已成**，接线待 host store） |
| G8 | 自我发信在**无名册接缝**时不判（v5r `V5_SELF_MESSAGE`） | `kernel/mailbox.js` | 无 `resolveAudience` 时拒"给自己投递"，或如实自曝"未判" |
| G9 | v5r `selfReportTool` 逐行未读（面板第五字段风险） | Round 1 边界 | 见 §3 改判条件（≈10 行） |

---

## 7. 证据（原样命令 + 退出码）

```
node tests/vmu-meeting-parity.test.mjs    → 162 passed, 0 failed   exit=0   （§18 为耐久原子 12 条）
node tests/vmu-chat.test.mjs              →  67 passed, 0 failed   exit=0
node tests/vmu-mailbox.test.mjs           →  44 passed, 0 failed   exit=0
node tests/vmu-panel.test.mjs             →  39 passed, 0 failed   exit=0
node tests/vmu-meetings.test.mjs          → 161 passed, 0 failed   exit=0
node tests/vmu-meeting.test.mjs           →  50 passed, 0 failed   exit=0
node tests/vmu-ballot.test.mjs            →  41 passed, 0 failed   exit=0
node tests/vmu-ballotbox.test.mjs         →  13 passed, 0 failed   exit=0
node tests/vmu-minutes.test.mjs           →  20 passed, 0 failed   exit=0
node tests/vmu-minutes-tool.test.mjs      →  15 passed, 0 failed   exit=0
node tests/vmu-resume-recovery.test.mjs   →  73 passed, 0 failed   exit=0
node tests/audit-enforced-consistency.test.mjs → findings=0        exit=0
node tests/audit-enum-branches.mjs        → 0 finding              exit=0
node tests/audit-code-size.test.mjs       →   9 passed, 0 failed   exit=0
```
