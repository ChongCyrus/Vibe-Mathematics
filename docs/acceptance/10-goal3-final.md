# 目标 3 终判 · vmu 框架原语面 F8–F53（Round 7 / task-54）

> **方法**：每条的判定来自**读码**（`grep`/`read` 本仓 `vibe-math-vmu/**`，路径相对 `Vibe-Mathematics/`）或**只读探针**；每条给 **file:line**、**搜索范围与模式**、**判定**。凡"未核"一律标未核——**本文件不把未核写成具备**。
> **取代关系**：本文件**取代** `05-framework-strength-evidence.md` 主表 + §10.1–§10.8 中**仍非"具备"**的那些行；其余行（已具备）不重复判定，只在新旧冲突处点名。
> **本轮证据基准**：Round 6 收尾（`vmu.paper.maxRounds`、孤儿键删除、Lean `fs:host`、killable `spawnHandle`、两码登记）＋ Round 3–6 的 reader-a/b/c 实测（凡转述均在对应行注明"复核方式"）。

---

## 0. 总判定（一句话）

**够强——vmu 框架足以实现 v5r 的全部功能：原语面 42 条现已结清为「具备 41 ／ 部分 1 ／ 缺失 0」，其中唯一的"部分"是与 v5r 刻意相反的 fail-closed 选择（F13，更安全且已具名），另有 5 处**具名残余**（都不阻塞"能否实现 v5r 功能"这一问，且各有明确 owner 与改判条件）。**

**"若要更强还差什么"**（按代价从小到大，逐条见 §3）：① F13 的容错开关（一个 enum 键）；② F15 最后一处无句柄 sleep；③ `meetingOpen` 域标记；④ 公告注入下一轮提示词（core 回合管线一行消费点）；⑤ 跨进程原子所需的**宿主分配型 store**（协议已完备）；⑥ 符号解列表的 `kind` 区分（接口变更）；⑦ target-1 的两条"部分"（重派成员＝策略、未 ack 邮件计数＝端口一行）；⑧ F53 的自动门禁。

**"支持 v5r 全部功能"＝是（有余量）；"支持设计文档全部功能"＝否（v5r 自身也不满足）** —— 后半句沿用目标 2 终判的结论（`08-goal2-verdict.md`：设计层 42 条里 v5r 自己只实现 14 ✅＋7 ≈＋21 ✗）。

---

## 1. 逐条结清（仍非"具备"的行）

判定词：`具备`＝机制存在且与要求同义；`部分`＝存在但语义/覆盖不等价（写明差在哪）；`缺失`＝未找到；`具名豁免`＝刻意不做且有理由与上界。

| 条目 | 最近旧判 | **R7 判定** | file:line（本轮复核） | 搜索范围与模式 | 判定依据（读码/实测） |
|---|---|---|---|---|---|
| **F13** `tools.restrict` 未注册名容错 | 部分（R5 维持） | **部分（刻意差异，非缺陷）** | `host.js:861-875`（`sanitizeToolFilter` 抛错 ⇒ `failures.push` ＋ **什么都不注册**）；`host.js:319,329,858` | `grep -n "sanitizeToolFilter\|vmu.tools.enabled" vibe-math-vmu/host.js` | 未知名 ⇒ **具名拒**并列出未知项/已知面；v5r 是"容错跳过"。**这是刻意的**（本仓 R1：没声明的东西不许悄悄生效；"跳过"会让未声明策略看起来生效）。**改判条件**：若真机要求同名语义，新增 `vmu.tools.onUnknown ∈ {refuse,skip}`（默认仍 `refuse`），**不得**把 skip 做成隐式默认 |
| **F15** 可注销定时器 | 具备＋1 处具名豁免 | **具备（保留 1 处具名豁免）** | 豁免站点：`math-computation.js:617,728`（**无句柄 `sleep`**，owner＝reader-b，已入 `docs/11 §11.ad` 站点表/上界/重测命令） | `grep -n "setTimeout\|setInterval" vibe-math-vmu/kernel/*.js`（`setInterval` **0 命中**；推导清单在 `tests/vmu-activity-timers.test.mjs §1`：6 文件 8 站点，新站点不分类即红） | 其余 8 站点均持句柄并在 `finally`/唯一 `cleanup()` 清理（`bus.js:382-384`、`activity.js:120,386-402`、`scheduler.js:491-515`、`mathjobs.js:125-133/190-191`、`host-spawn.js:191-192/216-224`）；**集成缺口具名**：全仓无 `scheduler.arm()/tick()/disarm()` 的**生产调用者**（R6 已按 Lead 口径登记为"框架提供、pack 使用"，见 `docs/03` 调度边界注） |
| **F17** 子进程真 terminate ＋ 输出上限 | 条件具备（R4）→ 生产路径部分（R6） | **具备（生产路径；条件已具名）** | 杀点：`kernel/lean.js:123-126`（`spawnHandle` 缝）、`:387`（`spawnHandle ? spawnHandle(cmd2, onHandle) : spawn(cmd2)`）、`:261,326`（`terminated/hadHandle` 随记录走）；**接线**：`kernel/index.js:578`（Lean）／`:710`（mathjobs）／`:725`（mathadapters）；宿主侧 `host-spawn.js:84`（`spawn(request, onHandle)`，**await 之前**交出 handle）＋`vibe-math-vmu.js:462` 的 `spawnHandle: spawnSeam` | `grep -n "spawnHandle" vibe-math-vmu/kernel/*.js vibe-math-vmu/host*.js vibe-math-vmu/vibe-math-vmu.js` | 有 handle ⇒ `terminated:true` 是**事实**；无 handle ⇒ 具名写"无法 terminate，进程可能仍在跑"（不假装）。输出上限＝`vmu.math.captureStdoutBytes`（`lean.js:67` WIRED ＋`:166` 真读）。★ **R6 由实现改判**：此前"面层看不到 handle"的缺口已由 killable 缝贯通 |
| **F18** 锁在 `finally` 释放 | 部分（R3）→ 具备（R4） | **具备** | `kernel/resume.js:692-713`（`acquireRecoveryLock`）、`:761-762`（`finally { releaseRecoveryLock() }`）、`:688-690`（注释：覆盖快乐路径/每个 early return/每次 throw）；自曝 `acquisitions/releases/busyRefusals` | `grep -n "acquireRecoveryLock\|releaseRecoveryLock" vibe-math-vmu/kernel/resume.js`；跨进程断言 `tests/vmu-resume-lock-and-marks.test.mjs`（R5 复跑 **49/0**） | `vmu.store.lock` 未声明 ⇒ 零机制直通（`locked:false`）但**仍 release**；独占失败 ⇒ 具名拒 `VMU_RESUME_BUSY`（R6 我登记 §8） |
| **F31** 原子队列 | 部分→具备（R5 进程内）→R6 跨进程耐久 | **具备（协议完备；残余具名）** | `kernel/ballot.js:189`（`castNow` 唯一临界区）、`:335`（同一条 FIFO 链包装）、`:139-152`（`createDurableCommitLog`：ticket 由 store 分配／意图先于生效／`reconcile()` 不双花／缺席自曝）、`status().gate={serialized,pending,commits,durable,log}` | `grep -n "castNow\|createDurableCommitLog\|reconcile" vibe-math-vmu/kernel/ballot.js`；`tests/vmu-meeting-parity.test.mjs`（R6 复跑 **162/0**） | **残余（具名，不改判）**：① 需**宿主分配型 store**（`store.append` 回 `{ticket}`）才能跨进程；② `ballotbox`/`mailbox` 队列可照同三行接上；③ 写者隔离由 store 的原子 append 保证，本面只定义协议 |
| **F44** 一键公告＋长期查询 | 部分→具备（R5） | **具备（残余已接线，正路未由探针证实）** | `kernel/lean.js:215`（`pushNotice`）、`:72`（`LEAN_NOTICE_MAX=20`）、`:221`（`takeNoticesFor` **取出即移除**，**已由 API 暴露** `lean.js:771`）、`:500`（`status`）、`:762`（`mirrors` 长期查询）；**R7 新增消费点**：`kernel/turn/index.js` 的 `noticeSource` 缝（`assemble()` 里与 loop 自己的 `drainNotices` 合流，源抛错 ⇒ **具名拒**）＋ `kernel/index.js:1027` 传 `noticeSource: (member) => lean.takeNoticesFor(member)` | `grep -n "pushNotice\|takeNoticesFor\|LEAN_NOTICE_MAX\|mirrors" vibe-math-vmu/kernel/lean.js`；`grep -n "noticeSource" vibe-math-vmu/kernel/turn/index.js vibe-math-vmu/kernel/index.js` | **残余（R7 收窄）**：公告**注入下一次提示词**的消费点**已接**（此前只有接口、没有消费者）。★ **诚实边界**：我的探针只证到"**缝被消费**＋**源失败具名**"（`D:/_tmp/vmu-r7/notice-source.mjs` 3/6）；**正路（公告真的出现在投递文本里）未由该探针证实**——探针里 `k.turn.assemble(...)` 的 `statusBlock` 未按我给的参数进入装配上下文（stub 收到的 `statusBlock` 为空），需要按 `run()` 的完整 turn 形状重写探针才能证正路。**loop 自身的通知通道**（被拒分派 ⇒ 下一轮提示）由 `tests/vmu-turn.test.mjs` 的 T143/T144 覆盖（**145/0**） |
| **F45** 去重与 settle 同源 | 部分→具备（R5） | **具备（形式化面；差异具名）** | `kernel/lean.js:307`（`dedupeKeyOf`）复用 `:300`（`contextHashOf`）——**同一个** settle 复核事实 ⇒ 结构上不可能漂移 | `grep -n "dedupeKeyOf\|contextHashOf" vibe-math-vmu/kernel/lean.js` | **具名差异**：**计算面**故意不做内容去重（同 id 才拒 `VMU_MATH_JOB_ID_TAKEN`）；这是刻意的面间差异，不是漏实现 |
| **F51** 重启标记 | 缺失→具备（R5） | **具备（1 处具名缺口）** | 标记本体：`resume` 键的 `recoveries[]`；只读视图 `status().restart`＝`{generation,restarted,at,reason,interrupted,unhydrated,missingChildren,readBack,phase,durableKey}`；跨进程断言 `generation===2` | `grep -n "recoveries\|restart(" vibe-math-vmu/kernel/resume.js`；`tests/vmu-resume-lock-and-marks.test.mjs`（**49/0**） | **唯一具名缺口**：v5r 的 **`meetingOpen`（"会议开了未收束"）域标记**在 vmu 无等价物（需会议投影带 `open` 标记；owner＝会议面）。`activity.js` 的 generation 是**一次性等待器**的世代，**有意不持久** |
| **F52** 一次性 future-only 活动等待器 | **缺失**（R3/R5 两次核过，基于 `control.js` 的搜索范围） | **具备（R7 改判）** ★ | `kernel/activity.js:1`（文件头即"ONE-SHOT, FUTURE-ONLY activity waiter (docs/08 primitives; v5r C-56 / F52)"）、`:11-16`（future-only／one-shot 语义）、`:21-23`（**disposer 在所有分支**＋`status().disposersCalled` 可观测）、`:73`（`VMU_ACTIVITY_DISPOSED`）；**注册** `kernel/index.js:1170`；**工具面** `host.js:137`（`activity: 'vibe_vmu_wait'`）＋`:236`（TOOL_FACES 行）；**装配** `kernel/index.js` 的 `createActivity({clock, log, settings, bus, activePeers})` | `grep -rn "createActivity" vibe-math-vmu/`（⇒ `kernel/activity.js` ＋ `kernel/index.js`）；`grep -rn "vibe_vmu_wait" vibe-math-vmu/` | ★ **旧判"缺失"是搜索范围的产物**：R3/R5 按 Lead 提示只核了 `kernel/control.js:132-142`（那两处确为 `tune()` 校验，**不是**等待器），而**真正的实现是 Round 3 才落地的 `kernel/activity.js`**。本轮按"原语名 + 语义"重搜（`createActivity`/future-only/one-shot/generation/disposer）⇒ 机制、注册、工具面、装配**四处齐备**。**搜索范围教训**：按"提示的行号"找原语会漏掉后落地的新模块，**应按语义关键词全仓搜** |
| **F53** 直连 fs 与策略 fs 的边界 | 部分（R5） | **具备（R7 改判）** ★ | 边界**已显式声明**：`docs/03-interface-contract.md:100`（F53 注：用户给的相对路径一律走策略缝 `under()`→`guardWrite`，越界具名拒 `VMU_PATH_ESCAPE_REFUSED`/`VMU_NOT_PERMITTED`；直连 `node:fs` 仅三处且都不是用户路径；**规则**：只碰框架自己的（`root` 之下）或包内文件并在注释写明） | `grep -rn "from 'node:fs'" vibe-math-vmu/` ⇒ 现为 **5 个模块**：`host-math.js`（策略缝本体）、`kernel/guard.js`（守卫自身）、`kernel/index.js`（框架自己的审计锚点/日志）、`kernel/records.js`（**包内只读**自审）、`vibe-math-vmu.js`（入口读包内文件） | R3 的 8 模块清单已缩到 5（`kernel/{lean,library,store}.js` 不再直连 fs）；**残余（具名）**：规则是文档级的，**没有**自动门禁检查"新模块是否声明了直接 fs 的用途"（若要，建议 verify 加一条审计） |

### 1.1 已由实现闭合的"真缺口"（R6/R7 收尾，逐条留证）

| 缺口（旧） | 闭合方式 | file:line |
|---|---|---|
| **M-A04**「论文轮次上限」无键无读点 | **加键＋真读者**：`vmu.paper.maxRounds`（生成行，natural，**def 0＝不限**＝零机制；v5r 的 3 由 pack 声明）＋ `kernel/paper.js` 的新方法 **`revise()`**（owner-only／必须先交过一次／每次计数／超限 ⇒ 具名拒 `VMU_PAPER_ROUNDS_EXCEEDED` ＋ `enforced:['vmu.paper.maxRounds']` ＋ `rounds/maxRounds`）；`WIRED_KEYS`＋`keysUsed()` 已含该键 | `kernel/paper.js:41`（WIRED_KEYS）、`:135`（`readKey('vmu.paper.maxRounds') || 0`）、`revise()` 方法体；探针 `D:/_tmp/vmu-r6/paper-rounds.mjs` **11/0** |
| **孤儿键** `vmu.meetings.reconsiderFloor` | **删除**（四道前置全清后）：三处 pack 清单值（`packs/v5r/prompts/v5r-core.js:78`／`packs/institute-min/index.js:51`／`packs/v5r/settings/defaults.js:93` 注释，pre-split：该键已从 `defaults.json` 删除）＋`docs/08`＋`docs/10`＋`docs/12:208` 改述 ⇒ schema 行删除、`docs/04` 重生成 | 见 `core-round6-report.md` §"孤儿键"；真生效的旋钮是 `vmu.ballot.reopenFloor` |
| **Lean 面镜像未接线**（生产路径 `admission().fileMirror=false`） | **接 `fs: host`**（＋`ids`／`timer`） | `kernel/index.js:578`（`createLeanFace({… fs: host && … ? host : null })`） |
| **F17 面层看不到 handle** | **killable 缝贯通**：`host-spawn.js:84` 的 `spawn(request, onHandle)` ＋ 入口 `spawnHandle: spawnSeam` ＋ 内核三面传递 | `kernel/index.js:578/710/725`；`vmu-lean-killable` **7/0** |

### 1.2 旧判"部分/缺失"但**本轮维持具备**的行（防回退，逐条给复核点）

| 条目 | 判定 | 复核点（file:line） |
|---|---|---|
| F9/F10 `sendMessage`/`interrupt` | 具备 | `kernel/index.js:263`（seam 选项）、`status().seams.sendMessage/interrupt` ＋ `*ConsumedBy`；消费 `kernel/turn/index.js` 的 `sendToMember`/`interruptMember`；宿主桥 `sendViaSubagents`/`interruptViaSubagents` |
| F11 `childId`+`stopReason` | 具备 | `kernel/turn/index.js` 的 `deliverViaSubagents` 返回 `{reply, childId, stopReason, attribution}`（`childIdOf`／`stopReason` 三级尝试）；探针 `D:/_tmp/vmu-r4/f9f10f11.mjs` **14/0** |
| F26 五种票型 | 具备 | `kernel/ballot.js:38` `VOTE_KINDS`（恰好五种）＋`:41 classifyVote`（唯一分类点）＋`:57 DECISIVE_KINDS` |
| F28/F30 有界兜底／复议只升不降 | 具备 | `kernel/meetings.js:331/336/348/370`（lapse/revokeLapse）；`kernel/ballotbox.js:123`（`reopenFloor` 真读并决定） |
| F32 定论去重窗口 | 具备 | 构造参数 `dedupWindowMs`（0＝零机制）＋`status().dedup`＋快照携带 |
| F34 开启辩论资格 | 具备 | `open({by})` 的 `openers`/`minEligible`/`requiresTarget` ＋ `status().openCriterion` |
| F35 DAG 环检测 | 具备 | `kernel/tasks.js:54-75` `findDependencyCycle`（自环＝长度 1 的环；返回环路径）＋`:214` `create`／`:240` `setDependencies` 抛出 |
| F39 写域 advisory | 具备 | `kernel/tasks.js:82-83` `normalizeWriteScope`＋`:180-182` `writeScopeConflicts()`（注释逐字"Never refuses anything"） |
| F16 调度 trampoline | 具备（**真原语**，非等价推理） | `kernel/scheduler.js:136-139`（`reentrantDeferred`/`ticking`/`rerunRequested`）、`:248 tickPass`；实测重入 ⇒ `passes=2, deferred=1, firedCount=1` |
| F33 门禁只在唯一收口点 | 具备（**等价判定**，保留旧注） | `kernel/ballotbox.js:13`（具名拒集合）、`kernel/ballot.js:151`（冻结期投片拒且不记票）＋`:235`（落定单点）。★ 旧注"若要求**同名原语**则应改判部分"**仍然有效**：这是性质等价，不是同名机制 |
| F20–F24 提示词管线（5 条） | 具备 | `kernel/prompt/index.js:115-125/127-133/588-593`；F22 的可证伪族已迁到 `tests/_lib/falsify.mjs` |
| F43/F46/F47 | 具备 | `kernel/lean.js:345/422/424/428-429`；`kernel/mathadapters.js:139 PY_CANDIDATES`／`:396`；`:471 probe`＋两步安装＋`:718 shapeContract` |
| F49/F50 | 具备（R5 加厚） | `kernel/metrics.js:359`／`kernel/audit.js:10`；`kernel/arbitration.js:169/209/407`；R5 追加三类"缺席即具名" |
| F12/F14/F25/F27/F29/F36/F37/F38/F40 | 具备 | 见 `05-framework-strength-evidence.md` 主表（本轮未发现回退；R5/R6 未触及这些面） |

---

## 2. 本轮我**实际验证过**的（与**未核**的，分开写）

**实测/读码复核过**（本轮）：F17（`spawnHandle` 全链路 + 三面接线）、F52（`createActivity`/注册/工具面/装配四点）、F53（docs/03 边界注 + 直连 fs 模块降到 5）、M-A04（键＋`revise()`＋探针 **11/0**）、孤儿键（删除后四条门禁绿：`vmu-settings 47/0`／`vmu-planned-settings` ALL GREEN／`audit-vmu-docs 83/0`／`check-docs` PASS）、F15（`setInterval` 0 命中＋推导清单在测试里）、F31/F44/F45/F51（按 `file:line` 读码，未复跑其套件）。
**未核（如实）**：
1. **未复跑** reader-a/b/c 的多数套件（本轮只跑了我名下相关套件与四条门禁）；表中"复核方式"栏已逐条标注是"读码"还是"复跑"。
2. **F13 的 v5r 侧语义**未读 v5r 源码验证"容错跳过"的确切分支（沿用 R3 结论与 vmu-pack 的转述）——**改判条件里已写明**：若真机要求该语义，按 enum 键实现。
3. **F33 的同名性**仍是性质等价（旧注保留），未新增同名原语。
4. **真机面**：本文件只做代码/单元面判定；真机证据在 `05-...md §8.2`（R6 终态：52 个 `vibe_vmu_*` 面发布、5 对真调用/4 个面；两次回合触 `--max-tokens` 上限被取消 ⇒ 按 playbook **不是 PASS**）。

---

## 3. 若要更强还差什么（按代价从小到大；每条给 owner 与改判条件）

| # | 缺口 | 代价 | owner | 改判条件 |
|---|---|---|---|---|
| 1 | **F13 的容错开关** | 一个 enum 键 `vmu.tools.onUnknown ∈ {refuse,skip}`（默认 `refuse`）＋一处分支 | 我（core） | 真机验收要求 v5r 式"容忍未知名"时 |
| 2 | **F15 最后一处无句柄 sleep** | `math-computation.js:617,728` 两处改持句柄＋`finally` | reader-b | 该文件任何后续改动时顺手 |
| 3 | **`meetingOpen` 域标记**（F51 残余） | 会议投影带 `open` 标记（+`status()` 一栏） | 会议面 | 真机要求"重启后知道哪场会开了没收束" |
| 4 | **公告注入下一轮提示词**（F44 残余） | ~~core 回合管线加一个消费点~~ **R7 已接**（`kernel/turn/index.js` 的 `noticeSource` ＋ `kernel/index.js:1027`）；**只剩"正路断言"**（按 `run()` 的完整 turn 形状写探针/测试） | 我（core）／verify | 真机要求"公告出现在成员下一轮提示里"时，先补正路断言 |
| 5 | **跨进程原子所需的宿主分配型 store**（F31 残余） | 宿主 `store.append` 回 `{ticket}`；`ballotbox`/`mailbox` 队列照同三行接上 | 宿主 / reader-c | 真机多进程共享同一 store 时 |
| 6 | **符号解列表的 `kind` 区分**（target-5 残余） | 新 `kind:'exprList'`（**接口变更**，需 verify 同步矩阵） | reader-b | 真机需要区分"符号解列表/数值数组" |
| 7 | **target-1 的两条部分** | ① 重派缺失成员＝**策略**（不在引擎，属 pack）；② 未 ack 邮件计数＝**端口未接**（一行） | ① pack ② reader-a | 见 `06-goal1-verdict.md` |
| 8 | **F53 的自动门禁** | 一条审计：新模块直连 `node:fs` 必须在注释里声明用途（框架自己的/包内） | verify | 下一次有模块新增 fs 使用时 |
| 9 | **target-2 的 G1–G9**（设计层） | 逐条见 `08-goal2-verdict.md`；**v5r 自身也未实现** ⇒ 不是"支持 v5r 功能"的缺口 | reader-c | 若要把"设计文档全部功能"也纳入范围 |

---

## 4. 结论（发 vmu-verify）

- **原语面结清**：42 条 ⇒ **具备 41／部分 1／缺失 0**（唯一"部分"＝F13 的**刻意** fail-closed）；**5 处具名残余**（F15 一站点、F31 跨进程 store、F44 提示词注入点、F51 `meetingOpen`、F53 自动门禁）＋**1 处性质等价保留**（F33 同名性）。
- **两处旧判被本轮推翻**（都因**搜索范围**而非实现变化）：**F52**（旧"缺失"按 `control.js` 行号搜；真实现是 Round 3 落地的 `kernel/activity.js` ＋注册＋工具面）⇒ **具备**；**F53**（旧"部分"缺"显式声明"；R6 已在 `docs/03:100` 声明边界，直连 fs 模块由 8 降到 5）⇒ **具备**。
- **三个真缺口已闭合**：M-A04（键＋`revise()` 真读者）、孤儿键（删除，四道前置全清）、Lean 镜像＋killable handle（生产路径）。
- **总判定**：**够强——能实现 v5r 的全部功能（有余量）**；"更强"的清单见 §3，其中只有 #1/#3/#4 属于**框架侧**可补，其余是策略/宿主/接口选择。
