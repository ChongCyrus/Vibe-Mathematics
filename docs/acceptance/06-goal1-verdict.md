# 目标 1 终判：vmu 的「断点续跑」与「人工干预决策」是否足够完善（对照 v5r）

> 作者：v5r-reader-a（task-44）。判据基线：`_handoff/vmu/03-v5r-full-inventory.md` **§四 断点续跑与恢复**（本文件的 v5r 侧行号＝该分片 A 的实测行号，文件 `vibe-math-v5r/vibe-math-v5r.js`）＋ v5r 代码复核；vmu 侧证据＝代码 `file:line` ＋**定向单跑**（命令与退出码见 §6）。
> 基线路径说明：lead 给的发布路径 `C:\Users\admin\.dsh\profiles\web\node_modules\dsh-vibe-math\vibe-math-v5r\` 在本机**不存在**（`Test-Path` = False），实际基线用仓库内副本 `Vibe-Mathematics/vibe-math-v5r/vibe-math-v5r.js`（`Test-Path` = True，11597 行）——**读码判定**的搜索范围即该文件 1–3730（分片 A）＋引用行号。

---

## 0. 一句话结论（敢下）

- **断点续跑：足够完善（判定「够」），但带 3 处具名小缺口。** v5r 的**全部核心机制**在 vmu 都有对应实现，其中 **5 条是 v5r 的超集**（写前必读闸、回读一致性、独占锁、耐久重启标记/世代号、子代对账）；缺口是：**未 ack 邮件计数端口未接**（邮件自身已持久，只是恢复时不统计）、**看门狗时钟刷新在 vmu 无对应对象**（vmu 没有 v5r 那种持久在飞时钟 ⇒ 该机制 N/A 而非缺失）、**每实例 face（meeting/ballot）缺多实例注册表**（单例会静默丢实例，已拒绝该做法）。另有 1 条**有意不实现**：恢复到"成员子代不在了 ⇒ 重新派发"是**装配策略**，引擎只**对账并具名**。
- **人工干预决策：完善（超集）。** v5r 在这条线上**只有设计意图**（分片 A §4.8：`vibe_v5_pause/stop` 有、office 不是成员、审批只是文档）；vmu 把它做成了**真闸门**：未批动作**只排队不执行**、审批队列/否决台账**跨重启**、否决**可解除**（角色+理由）、超时三态＋`default-allow` 二次确认、暂停/恢复/改参数**带留痕**、**本轮补上「人工中途注入」**（`vibe_vmu_human {action:'inject'}` 经 chat/mailbox 面，面策略照常生效、拒绝原样透传）、审计走既有 audit chain/钩子/log。
- **因此：不必再"补一个断点续跑/人工干预"。** 剩下的都是**一行接线或具名 N/A**，见 §5 的改判条件。

---

## 1. 判定口径

| 判定 | 含义 |
|---|---|
| **具备** | vmu 有等价实现，且**有断言或实测**（本报告 §6 给出命令/数字） |
| **超集** | 不仅等价，还覆盖了 v5r 没有的失败面（更强） |
| **部分** | 主干具备，但某一条路径**具名缺失/未接线**（写明 file:line 与改判条件） |
| **N/A（有理由）** | vmu 的结构里**不存在**该对象（如 v5r 的持久在飞时钟），因此不是"缺"，而是"无需" |
| **缺失** | 应当有而没有 |

---

## 2. 断点续跑：逐条对照（表 A）

| # | v5r 机制（基线行号） | vmu 判定 | vmu 证据（file:line） | 缺口 / 改判条件 |
|---|---|---|---|---|
| A1 | **唯一耐久载体**（整份快照 `State/<inst>.v5state.json`，1355/907–1029） | **具备** | `kernel/store.js:75-106`（`<root>/vmu/state.json`，temp+rename 原子写）；`kernel/resume.js:RESUME_KEY` | — |
| A2 | **不是宿主会话日志**（DSH 拒绝未知事件 ⇒ 后端被删，28–52） | **具备（同结论）** | `kernel/store.js:1-17` 头注：同一理由，状态只在自己文件里 | — |
| A3 | **一条恢复路径**：读文件→fold（28–36） | **具备** | `kernel/resume.js` 的 `read()` → `hydrate()`（`recover()` 十步）；同一路径对进程内重启与冷启动 | vmu 的"fold"是**每面快照/日志**（投影）而非单一事件流；语义等价，形态不同（已在 docs/07 §14 写明） |
| A4 | **纯函数 fold + 变化必返新引用**（478–483） | **具备** | `kernel/store.js:213-227`（`patch(key, fn)` 在互斥段内读改写）；`resume.js` 的 `attachProjection` 记录/重放 | — |
| A5 | **白名单写入**（未登记键静默丢弃的历史坑） | **超集** | `kernel/store.js:94-99` `assertKey`（未登记键**抛** `VMU_INVALID_ARGUMENT`）；Round 1 的 `idempotency` 事故已修 | — |
| A6 | **写前必读闸**（`V5_STATE_NOT_LOADED`，996–1005） | **超集** | `kernel/resume.js` `requireRead` → **`VMU_RESUME_WRITE_BEFORE_READ`**（write/patch 两条写路径共用）；断言见 `tests/vmu-resume-recovery.test.mjs` §1 | — |
| A7 | **整快照串行写 + 推迟 stringify**（1006–1024） | **具备** | `kernel/store.js:88-92,101-106`（`runExclusive` 串行链 + 每次全量 `JSON.stringify`） | — |
| A8 | **载入失败可见**（坏 JSON/版本不符 ⇒ 拒绝覆盖，926–960） | **具备** | `kernel/store.js:145-176`（坏文件抛 `VMU_STORE_FAILED` 且**原样保留**；版本过高抛 `VMU_STORE_MIGRATION`） | vmu 不做 v5r 式的"读路径也回显原因"（core 的 entry 会 log）；改判条件＝若要求 operator 面回显，core 在 `status()` 加一行 |
| A9 | **写失败可见**（1012–1024） | **超集** | `kernel/resume.js` 的 `writesThrough/writeThroughFailures` ＋ `resume/projection-error` 钩子；`kernel/index.js` 的 audit 写失败 `lastWriteError` | — |
| A10 | **有界数组 + 截断计数**（484/787/809/819/897） | **具备** | `vmu.resume.keepRecoveries`（恢复记录）、`vmu.resume.journalCap`（journal，超限 ⇒ `incomplete` ⇒ 具名拒水合）；`kernel/store.js` 每面自带上限 | — |
| A11 | **fold 内 id 分配**（554–588） | **超集** | `kernel/ids.js`（`mint/observe/hydrate`，计数器耐久；约 30 处模块级 `seq` 已批量替换）；`resume.nextId/observeIds` | `tasks.js` **有意**保留每实例计数（A/B harness 依赖各自 `t-1`），跨重启不复用由 `snapshot/restore`＋`observeIds` 保证 |
| A12 | **"names are immortal"**（3642–3645） | **具备** | `kernel/ids.js` 的 `max(耐久, 观测)+1`；`tests/vmu-resume-recovery.test.mjs` §5（settle 掉 `t-1` 后新 id = `t-3`） | — |
| A13 | **恢复后 read-back 一致性**（v5r 靠指纹只读回，477–482） | **超集** | `resume.readBack()`（写后逐键比对，漂移具名 `VMU_RESUME_READBACK_DRIFT`）；`vmu.resume.readBack` 默认 true | — |
| A14 | **十步恢复**（10237–10296） | **具备** | `RECOVERY_STEPS = read/roster/inflight/ledgers/mailbox/watchdogs/flags/readback/outcome`（＋本轮 `children`） | v5r 的"重读 Progress 并重派成员"是**策略**，见 A19 |
| A15 | **`pendingWork` 在途回合耐久**（456,10300–10310） | **具备** | `kernel/work.js`（start/settle/interrupt/recover，`interruptedReason` 具名）；**本轮新增可读视图** `resume.status().inflight = {pending, interrupted, pendingNow}` | — |
| A16 | **世代号/重启标记**（v5r 只有会话内 `persistedEpoch`，无耐久标记） | **超集** | `resume` 键的 `recoveries[]` ＋ `status().restart`/`resume.restart()`（`generation/restarted/at/reason/interrupted/unhydrated/missingChildren/readBack/phase`）；跨进程 `generation===2` 断言 | — |
| A17 | **锁/独占**（v5r 无恢复锁，只有写链） | **超集** | `recover()` 取 `vmu.store.lock`（`kernel/storepolicy.js:138/168`）并在 **`finally`** 释放；并发 ⇒ `VMU_RESUME_BUSY`；四条分支断言（成功/抛错/早返回/被占） | — |
| A18 | **子代对账**（v5r 无独立对账；靠 childId 判"仍在役"） | **超集** | `children` 端口已在入口接好（`vibe-math-vmu.js:424-435` → `subagents.listChildren`）；引擎**具名** `missing:[{member,childId}]` 并进 `restart.missingChildren`；**本轮补 `roster` 端口**（`members.roster()`＝唯一带 `childId` 的名册源；`identity.list()` **不带** childId，已在 `rosterSource` 具名） | — |
| A19 | **重派缺失成员**（v5r 用 Progress 末 4000 字重派，10251–10268） | **部分（有意）** | 引擎**只对账不重派**（`children` 步的 note 明写 "the engine does NOT spawn"；`VMU_RESUME_CHILDREN_UNAVAILABLE` 亦不失败） | **改判条件**：若要求"重启自动重建成员"，由**装配**接一行：`missingChildren` → `spawn/members` 面（vmu 的成员唤醒/子代理缝与 v5r 不同，属策略层） |
| A20 | **未 ack 消息计数**（v5r 恢复时统计未 ack 邮件） | **部分（端口未接）** | 邮件面**自身已持久**（`kernel/mailbox.js:452-497` 自己的 `mailbox` 键 + `snapshot/restore`）；但恢复**没接** `mailbox` 端口 ⇒ 步 `mailbox` 报 `VMU_RESUME_MAILBOX_UNAVAILABLE`（`status().ports.mailbox=false`） | **代价可控（一行）**：`kernel/mailbox.js` 加 `pendingAll()`（或让 core 传 `mailbox: () => …`）；我已在 §5 给签名 |
| A21 | **看门狗时钟刷新**（v5r `meeting.lastInputAt`/`verdict.lastVoteAt`，10273–10277） | **N/A（有理由）** | vmu 无持久在飞时钟：`kernel/control.js:186` 的 `watchdog({lastBeatAt})` 是**策略面**（0＝无定时器）；`kernel/activity.js` 是一次性等待器（会话内）；`meeting/ballot` 的 seam 里没有时钟字段（`grep lastInputAt/lastVoteAt` 在 `vibe-math-vmu/kernel/**` **零命中**） | 端口仍保留（`watchdogs.targets/touch`），**接上即生效**；改判条件＝任何面出现"耐久在飞时钟"时 |
| A22 | **恢复期不留幻影**（10294–10335） | **具备** | 恢复期 `state.inflight/interrupted` 由**耐久 work 台账**重算；`control.stop()` 清 registry/降级；`scheduler` 的 F15/F16 句柄释放（`vmu-scheduler` 111/0） | — |
| A23 | **ephemeral 重建清单**（461–463） | **具备（形态不同）** | vmu 用"面侧 `snapshot/restore` ＋ `attachProjection` 写穿"，会话内状态（scheduler 的 in-flight、activity 等待器、human 队列**已持久**）各自声明 | 未水合面一律进 `unhydrated[]`（"重启后空名册"与"真的恢复了"可区分，`status().projection.degraded`） |

**表 A 小结**：具备/超集 **18** 条，部分 **2** 条（A19 有意、A20 一行可补），N/A **1** 条（A21，有理由）。

---

## 3. 人工干预：逐条对照（表 B）

| # | v5r 机制（基线） | vmu 判定 | vmu 证据 | 缺口 / 改判条件 |
|---|---|---|---|---|
| B1 | **审批（未批只能排队）**——v5r 侧**只有设计意图**（分片 A §4.8；`withOffice` 拒非所办，属权限不是队列） | **超集（真闸门）** | `kernel/human.js` `approvalDecision/gate/queue/decide`；`attachApprovalGate` 包住真实服务（`tests/vmu-human-gate.test.mjs` §6：未批 ⇒ `tasks.list().length===0`，批准后 `t-1` 落地） | 词表 `vmu.human.gatedActions` 由 pack 声明（空＝零机制） |
| B2 | **审批队列跨重启**（v5r 无） | **超集** | `human` 键（`kernel/human.js:434-478` state seam + 写穿）；重启后仍排队、**复用同一 `requestId`**、`attempts`/`pendingReason` 不丢、id 不复用（同套件 §8） | — |
| B3 | **否决**（立即生效＋广播；v5r 文档有、实现无） | **超集** | `human.veto`（+ `human/vetoed` 钩子）；被否决动作**连队都不入** | — |
| B4 | **事后补理由**（v5r：紧急允许后补，记为 pending） | **具备** | `pendingReason`（否决**与**被拒审批都记），`explainDecision({vetoId|requestId})` 事后补；跨重启仍在 | — |
| B5 | **解除否决**（v5r 无） | **超集** | `liftVeto({vetoId, by, reason})`：角色 ⊆ `vmu.human.vetoLiftRoles`、理由必填、进台账 | — |
| B6 | **人工答复 SLA / 超时**（v5r `approvalTimeoutMs`/`onTimeout` 默认 hold） | **超集** | 三态各有具名出口：`hold` ⇒ 继续排队（`heldOnTimeout`）；`default-deny` ⇒ `VMU_HUMAN_APPROVAL_TIMEOUT`；`default-allow` ⇒ **仅当 `defaultAllowAcknowledged=true`**，否则 `VMU_HUMAN_DEFAULT_ALLOW_NOT_ACKNOWLEDGED`（`gateNeverAllowsBySilence` 恒真） | — |
| B7 | **暂停 / 恢复 / 停止**（v5r pause 只改调度与 `pendingWork`；stop 中断子代理、耐久清 solve 票、phase='idle'，10313–10343） | **具备** | `kernel/control.js` `pause/resume`（范围＋角色具名拒＋`pausedAt/heldMs` 留痕）＋ `kernel/index.js` 的 pause/resume/stop 与 **`phase` 四点接线**（`writePhase`，先 `read()` 过写前必读闸） | vmu 的 stop 语义面（清票/中断）由 scheduler/meeting 面承担；`phase` 已耐久（`VMU_RESUME_WRITE_BEFORE_READ` 若未先读会具名拒） |
| B8 | **中途注入**（v5r `vibe_v5_message` 所办声音） | **本轮补齐 → 具备** | **新** `vibe_vmu_human {action:'inject', text, to?, from?, via?, why?}`（`tools/human.js`）：经 `kernel.mailbox.send`（逐收件人）或 `kernel.chat.send`（群聊/公告）；**面策略照常生效**（配额/禁言/冻结/admins），**面级拒绝原样透传**（断言：`VMU_MAILBOX_QUOTA` 原样回来）；两面都未挂 ⇒ 具名 `VMU_ENGINE_UNAVAILABLE`；回执带 `why`（可审计） | — |
| B9 | **成员→所办的上行**（v5r：`OFFICE_INBOX` 伪 id＋上限 10＋丢弃计数，M-A13） | **部分** | 上行通道存在：`kernel/mailbox.js:29` 的 `MAILBOX_URGENT_KINDS` 含 `'office'`；`kernel/arbitration.js:407` 的 `escalate({to:'office'})`；**但**没有 v5r 式"所办收件箱"单一聚合面 | **改判条件**：若人工要一个"待我处理"的收件箱聚合（含上限与丢弃计数），由 chat/mailbox 面加一个**只读聚合**；当前人工可读的是**审批队列**（`vibe_vmu_human {action:'queue'}`，这已是"需要人拍板"的清单） |
| B10 | **观察员/仪表盘域钳制**（v5r 文档：observerScopes/dashboardScope） | **具备（钳制）** | `human.observerView`（空＝全不可见）＋ `human.dashboard({scope,domains})`（`PRIVATE_DOMAINS` 永不可见、未声明域具名拒） | **数据面**属 `kernel/panel.js`（`vibe_vmu_panel`，reader-c）；钳制在我这，数据在它那 |
| B11 | **审计**（v5r：群聊行＋广播；R7） | **超集** | `kernel/audit.js` 的落盘 chain（`vmu/audit/<day>.jsonl` + checkpoint 锚）、`kernel/bus.js` 钩子、各面 `log.append`；本轮动作都带 `why`/`by`/`at` | — |
| B12 | **改参数（人工中途调控）** | **具备** | `kernel/control.js` `tune({key,value,byRole})`：键须在 `vmu.control.tunableKeys`、角色须在 `canSetRoles`、**无写缝 ⇒ 具名拒**；`trail`＋`control/param-set` 广播 | — |

**表 B 小结**：具备/超集 **10** 条（其中 3 条是 v5r **完全没有**实现的），部分 **1** 条（B9，一行可补），无缺失。

---

## 4. 本轮补掉的（都带断言）

| 补了什么 | file:line | 断言 |
|---|---|---|
| **`inflight` 视图**（= v5r `pendingWork` 的等价物：找到了什么/结束了什么/还剩什么） | `kernel/resume.js` 的 `state.inflight`＋`status().inflight` | `tests/vmu-resume-lock-and-marks.test.mjs` F51c |
| **`ports` 视图**（哪些恢复端口真的接了，避免服务描述"声称有"） | `kernel/resume.js` 的 `status().ports` | 同上（`children/roster/mailbox=true, watchdogs/lock=false`） |
| **`roster` 端口**（让子代对账真的有用：`identity.list()` 不带 `childId`，已具名 `rosterSource`） | `kernel/resume.js` 的 children 步 | 同上（`rosterSource='roster-port'`、`missing=[r-2/c-gone]`） |
| **函数形端口**（`mailbox: () => entries`、`children: (parentId)=>ids`）——降低接线成本 | `kernel/resume.js` | 同上（function-shaped mailbox 被接受并计数） |
| **`inject`（人工中途注入）** | `tools/human.js`（action 枚举 14→15） | `tests/vmu-human-gate.test.mjs` §9（5 条断言，含"面拒绝原样透传"） |
| **两个 shadowing bug 修复**（同类缺陷第二次出现，如实登记） | ① `attachProjectionTo` 的形参 `snapshot` 遮蔽引擎写者（Round 4 修，写穿失效）② **本轮** `recoverUnlocked` 的局部 `roster` 遮蔽 `roster` 端口（子代对账永远 `checked:0`） | 两处都有断言；`node --check`＋套件绿 |

---

## 5. 未做项 / 改判条件（逐条，代价从小到大）

1. **A20 – 未 ack 邮件计数端口（一行）**：需要 `kernel/mailbox.js` 暴露 `pendingAll()`（`() => [{id,seq,to,kind}]`，所有箱子的未 ack 条目），或 core 在装配时传 `mailbox: () => …`。**改判条件＝接线后 `status().ports.mailbox===true` 且 `steps.mailbox.attached===true`**。owner：chat/mailbox 面 + core。
2. **B9 – 人工收件箱聚合（一行 + 只读视图）**：若要 v5r `officeRequests` 那种"待我处理"清单（含上限/丢弃计数），由 mailbox 面加只读聚合。**当前替代**＝审批队列（`{action:'queue'}`）已覆盖"需要人拍板"的主干。
3. **A19 – 重启自动重派缺失成员（策略，不在引擎）**：引擎已把 `missingChildren` 具名；**接线**由装配决定（`children` 已接，缺的是"→ spawn/members 面"这一步）。
4. **A21 – 看门狗刷新**：**N/A 有理由**（vmu 无持久在飞时钟）；端口保留，任何面出现耐久时钟即可接。
5. **多实例 face 投影**（`meeting`/`ballot`）：需要"实例注册表"（谁持有实例谁负责）。**单例化已明确拒绝**（会静默丢实例）。
6. **审批台账的"已决定历史"**：`human` 快照含已决定的请求 ✓；但**跨会话的长期历史**（跨多个 generation 的审批归档）没有独立台账；改判条件＝若审计需要"历次人工决定"检索面，再加一个 append-only 台账。

---

## 6. 实测证据（原样命令 + 数字）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tests/vmu-resume-recovery.test.mjs` | `=== VMU RESUME: 73 passed, 0 failed ===` | 0 |
| `node tests/vmu-resume-lock-and-marks.test.mjs` | `=== VMU RESUME LOCK+MARKS: 54 passed, 0 failed ===` | 0 |
| `node tests/vmu-human-gate.test.mjs` | `=== VMU HUMAN GATE: 75 passed, 0 failed ===` | 0 |
| `node tests/vmu-scheduler.test.mjs` | `=== VMU SCHEDULER: 111 passed, 0 failed ===` | 0 |
| `node tests/vmu-tasks-dag-and-scopes.test.mjs` | 41 / 0 | 0 |
| `node tests/vmu-kernel.test.mjs` / `vmu-entry.test.mjs` / `vmu-work.test.mjs` / `audit-hook-coverage.test.mjs` | 全绿 | 0 |
| `node --check` × `kernel/resume.js`、`kernel/human.js`、`tools/human.js`、`kernel/tasks.js` | 全过 | 0 |

**读码判定（未跑）**：v5r 侧行号（1–3730 由本人在 Round 1 逐段全读）；vmu 侧 `grep` 范围＝`vibe-math-vmu/**`（`lastInputAt|lastVoteAt|pendingWork|meetingOpen` 零命中 ⇒ A15/A21 的结论）；发布路径 `Test-Path` = **False**（见文首）。

---

## 7. 给 vmu-verify 的矩阵增量（建议）

- 目标 1 两行可从"部分"改为：**断点续跑＝具备（3 处具名小缺口）**；**人工干预＝具备（1 处具名上行缺口）**。
- 新增可引用证据：`tests/vmu-resume-lock-and-marks.test.mjs` 54/0（锁全分支/重启标记/端口视图/children 对账/roster 端口）、`tests/vmu-human-gate.test.mjs` 75/0（真闸门/耐久队列/否决解除/超时 ack/**inject**）。
- 两条"v5r 有而 vmu 结构性不同"的注记：A21（看门狗 ⇒ N/A 有理由）、B9（officeRequests ⇒ 由审批队列承担主干）。

---

## 8. 诚实边界

1. 本判定基于**分片 A 的逐段全读**＋本轮定向单跑；未跑全量 sweep（纪律），因此"具备"的强度是**定向断言 + 读码**，不是全门禁。
2. `inject` 是**经面转发**：它**不保证送达**（面可能排队/拒绝），回执严格反映面的结果——这正是"人工干预不越权"的设计。
3. 表 A/B 的行号是 v5r 仓库副本的行号；发布包路径不存在，若日后基线换成发布包，请重新核对行号（语义应一致）。
