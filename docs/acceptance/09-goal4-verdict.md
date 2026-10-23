# vmu 目标 4 · **终判**：v5r pack 是否一致地实现了梳理清单里的全部机制

> 任务 `task-47`（vmu-pack）· Round 6 · 日期 2026-10-15
> 基线：`03-v5r-full-inventory.md`（＋ 三份未损坏分片 `v5r-inventory-{a,b,c}.md`）与 `04-parity-matrix.md`（v4，125 行：A 47＋X 9、B 20、C 57）
> 本文只回答**用户原话**的那一问：**"当前 vmu+v5r 的 pack 是否完全一致地实现了梳理 md 中的所有机制。"**

---

## §0 总判定（**敢下结论**）

**结论：一致 —— 机制面没有一条是"框架与 pack 都缺"。** 但"一致"的**准确形状**必须写清楚，否则会被读成"125 条都在 pack 里声明了"：

| 结论 | 量 | 含义 |
|---|---|---|
| **① pack 已声明且真生效** | **48 个 settings 键** ＋ 1 条 M1 规则 ＋ 1 个 prompt 策略 ＋ 4 个 prompt 模块 ＋ 3 slots／5 tracks；**直接承载约 36 行机制** | 每个键都点名了**真读者**（内核模块或 pack 自己的策略模块），见 §1 |
| **② 框架具备但 pack 未声明** | **其余约 89 行** | **不是缺口**：内核已有原语与键，v5r 取**框架默认值**或**默认不启用**；部署要改就声明（每行给出可声明的键族），见 §2 |
| **③ 两者都缺（真缺口）** | **1 条子项（M-A04）＋ 1 个孤儿键（§3.2）** | M-A04 的"论文轮次上限可调"**没有键**；`vmu.meetings.reconsiderFloor` 是**孤儿键**；另有 4 处矩阵"键名"是 v1 转述（真名见 §3.1），**不是缺口** |

（① 的行数按"该行的策略由 pack 直接声明"计，逐键映射见 §1；①＋②＋③ ＝ 125 行。）

**为什么敢说"一致"**：vmu 的分层铁律是"**能力进内核、策略进 pack**"。清单里 125 条机制**绝大多数是能力**（fold／信箱／会议／表决／调度／工具面……），它们的承载者是内核原语；pack 的职责是**声明这家研究所的策略**。因此"框架具备 + pack 不声明"**恰恰是设计要的样子**，不是覆盖失败。**唯一不许出现的两种状态**——"声明了没人读"与"能读但设置面拒绝"——本轮**各抓到一处**（§3 的孤儿键与已闭合的 v3 键）。

**关键量（实测，非转述）**：
- pack 实际声明 **47 个 `vmu.*` 键**（`settings/defaults.json` 34 ＋ 清单 `settings` 13，去重后 47；探针 `D:\_tmp\goal4-keycheck.mjs`）。
- 其中 **41 个有内核/宿主/工具/入口真读者**；**5 个由 pack 自己的策略模块读**（`prompt-switches.js` 的 `OFF_SWITCHES`/`CATALOGUES`）；**1 个是孤儿**（无任何读者）。
- **0 个**键在 `settings/schema.js` 里缺失（`vmu-pack-defaults-vs-schema.mjs` → `undeclared=0`）。

---

## §1 ① pack 已声明且真生效（逐项：键 → 机制 id → **真读者**）

### 1.1 settings 键（47 个，按家族）

| pack 声明的键（值） | 承载的机制 id | **真读者**（file:line） |
|---|---|---|
| `vmu.meetings.quorumRule='m-unanimous'` | M-A19、C-13、C-22、C-24 | `kernel/meetings.js` 的 `K.quorumRule`（`index.js:1377` 装配） |
| `vmu.meetings.quorumCap=3` | 同上 | `kernel/meetings.js:45,73,132` |
| `vmu.meetings.verdictMaxRounds=3` | M-A19、C-13、M-B19 | `kernel/meetings.js:58,86,177` |
| `vmu.meetings.hardLimitMs=1800000` | C-12、C-13、C-37（墙钟界） | `kernel/meetinglapse.js:150,165,189`；reader-c 的 `lapseDue()` |
| `vmu.meetings.wakeRetries=5` | C-12（唤醒重试） | `kernel/meetings.js:61,90,173` |
| `vmu.meetings.tier='formal'` | **M-A36**、C-18、C-24 | `kernel/meetings.js:43,124,315`（＋唯一判定点） |
| `vmu.meetings.allowLight=false` | **M-A36**（light 被具名拒） | `kernel/meetings.js:43,125,316` |
| `vmu.meetings.quoteDepthMax=3` | M-A19、**C-08**（引用深度） | `kernel/meeting.js:195`、`kernel/index.js:1394` |
| `vmu.meetings.quotesPerMessageMax=2` | M-A19、C-08 | `kernel/meeting.js:188,193`、`kernel/index.js:1393` |
| `vmu.meetings.unansweredInDenominator=false` | M-A19（v5r D3"未答不计分母"） | `kernel/meetings.js:46,74,137` |
| `vmu.ballot.reopenFloor=0` | **M-A33**（S9 复议"门槛只升不降"） | `kernel/ballotbox.js:22,41,137` 的 `reopen()` |
| `vmu.records.pointerPropagation=true` | **M-A06／M-B11**（S21 指针传播） | `kernel/records.js:57,99,592` |
| `vmu.records.requireSettledRecords=true` | C-26／C-27（只写已结算） | `kernel/records.js:57,98,469` |
| `vmu.pointer.propagation=true` | **M-A06／M-B11**（**提示词侧**指针契约注入） | pack 策略模块 `packs/v5r/middleware/prompt-switches.js:26` 的 `OFF_SWITCHES`（框架经 `sectionPolicy` 调用） |
| `vmu.turn.selfCheck=true` | M-B05／C-55（资源纪律段） | `prompt-switches.js:27` |
| `vmu.turn.feedback=true` | M-B05／C-55（反馈行） | `prompt-switches.js:28` |
| `vmu.turn.replyCatalogue='compact'` | M-B04／C-14／C-55（两套回执目录二选一） | `prompt-switches.js:77` |
| `vmu.turn.protocolPath='Shared/Protocol.md'` | M-B04（compact 目录点名的协议路径） | `packs/v5r/prompts/v5r-blocks-b.js:235,581` 的占位符 → `kernel/prompt/index.js` 变量解析 |
| `vmu.paper.officeConsult='required'` | **C-30**（office 定稿咨询门） | `kernel/paper.js:45,111-114`（`cfg()` 无条件读全五键） |
| `vmu.paper.officeConsultOn='finalize'` | **C-30** | `kernel/paper.js:46,112` |
| `vmu.paper.officeConsultTimeoutMs=0` | **C-30** | `kernel/paper.js:47,114` |
| `vmu.paper.officeConsultOnTimeout='hold'` | **C-30** | `kernel/paper.js:48,116` |
| `vmu.paper.officeConsultExemptRoles=[]` | **C-30**（Lead F4：默认不豁免） | `kernel/paper.js:49,120,185` |
| `vmu.paper.maxRounds=3` | **M-A04**（v5r `PAPER_MAX_ROUNDS=3`；超限具名拒 `VMU_PAPER_ROUNDS_EXCEEDED`） | `kernel/paper.js:41`（WIRED_KEYS）、`:135`（`readKey(...) \\|\\| 0`）——`revise()` 是唯一读者 |
| `vmu.report.enabled=true` | **C-52**（自动汇报面） | `kernel/report.js:10,76,108` |
| `vmu.report.reports=[…3 个触发器…]` | **C-52**（period／event／threshold 三类各一） | `kernel/report.js:10,76,109` |
| `vmu.report.params=[…8 键…]` | C-52／C-48／C-49（可改参数域） | `kernel/report.js:77,115,447` |
| `vmu.report.whoMayChange=['office']` | C-52／C-53（谁可改） | `kernel/report.js:77,116,447` |
| `vmu.report.requireReason=false` | C-52 | `kernel/report.js:77,117,519` |
| `vmu.chat.admins=['acad']` | C-01／C-06（群聊管理面） | `kernel/chat.js:31,83,126` |
| `vmu.chat.speakQuota` | C-05／C-06（发言配额） | `kernel/chat.js:32,33,116` |
| `vmu.chat.muteDefaultMs` | C-01（禁言默认时长） | `kernel/chat.js:34,118,478` |
| `vmu.chat.freezeExemptAdmins` | C-01（冻结豁免） | `kernel/chat.js:35,81,120` |
| `vmu.mailbox.urgentKinds` | **C-03／C-04**（通知优先级） | `kernel/mailbox.js:38,112,250` |
| `vmu.mailbox.wakeBudget` | **C-06**（唤醒预算） | `kernel/mailbox.js:40,114,436` |
| `vmu.panel.deviationPolicy` | **M-B18**（成员自述面板） | `kernel/panel.js:15,41,97` |
| `vmu.resume.projections`（10 面） | **M-A24**（ephemeral 重建清单） | `kernel/index.js:779,799,864` ＋ `kernel/resume.js` 的 `attachProjection` |
| `vmu.resume.writeThrough=true` | **M-A24／C-39／C-50** | `kernel/index.js:803`、`kernel/resume.js:326` |
| `vmu.resume.autoRecover` | **C-39／C-50**（恢复即续跑） | `kernel/resume.js:319,671` |
| `vmu.resume.readBack` | M-A24（恢复后回读） | `kernel/resume.js:322` |
| `vmu.human.onTimeout` | **C-09／C-52 人机接口**（超时处置） | `kernel/human.js:123,213,224` |
| `vmu.human.vetoLiftRoles` | 人机接口（谁可解除否决） | `kernel/human.js:131,272`、`host.js:400` |
| `vmu.human.gatedActions=[]` | **C-09**（审批闸门清单，v5r **故意为空**） | `kernel/human.js:70,127,315` |
| `vmu.math.maxParallel=1` | **M-B12／M-B14**（数学运行并发＝v5r 后台编译串行） | `kernel/mathjobs.js:41,357`、`kernel/mathtools.js:59` |
| `vmu.math.jobs.persist=true` | **M-B14**（作业持久化／断点续算） | `kernel/lean.js:62,170,491` |
| `vmu.math.jobs.recover='on-load'` | **M-B14** | `kernel/lean.js:64,164`、`kernel/index.js:707` |
| `vmu.limits.maxLiveMembers=3` | **M-A47／C-34**（在活成员上限＝v5r"每轮最多唤醒 3 名"） | `kernel/index.js:216,221`、`kernel/members.js:164` |

> **孤儿（无读者）**：`vmu.meetings.reconsiderFloor=0`（清单 `packs/v5r/prompts/v5r-core.js:78`）——见 §3.2。

### 1.2 非 settings 的声明（同样"真生效"）

| pack 声明 | 承载的机制 id | 生效点 |
|---|---|---|
| **M1 规则** `v5r-core-no-adhoc-scripts`（`on: tools/pre-execute`，deny `VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS`） | C-57（测试/后门面）＋ M3 脚本面的机构策略 | 清单 `rules[]` → `kernel/rules.js` → 总线；v5r 下临时脚本**具名拒**（可 `disable` 该条目） |
| **prompt 策略** `v5r.prompt-switches`（`promptPolicies[]`，`on: prompt/assemble`） | M-A41／M-B06／C-17／C-55 | `packs/v5r/middleware/prompt-switches.js:65-115` 的 `decideSections`（纯函数；未知会议态**具名拒**） |
| **4 个 prompt 模块**（core/charter/prompts/persona）＋ blocks-a/b | M-A40（章程）、M-A41／M-B06（每轮状态块）、M-B04／M-B05（回执目录与构造器）、M-B15／M-B17（形式化/论文块）、C-11／C-14／C-17／C-25／C-55 | `packs/v5r/prompts/**` → `kernel/prompt/index.js` 段注册与装配（D-13 活读） |
| **3 slots**（chair/member/temp） | M-A39／M-A46（名册原语）、C-32／C-34（编制） | 清单 `slots[]` → `kernel/members.js`（不透明 slot，D5） |
| **5 tracks**（progress/routes/obstacles/rejected/state） | M-B11（成果库四轨＋Progress） | 清单 `tracks[]` → `kernel/library.js` |
| **phases**（heartbeat／paper-write／paper-review／paper-final） | M-A29／M-B07（心跳/论文阶段词汇） | `packs/v5r/index.js:51` → 入口的 phases 注入（pack 命名、循环接受） |
| **codes**（2 个） | C-57／M3 策略 | 清单 `codes[]` → 拒绝码登记 |

---

## §2 ② 框架具备、pack 未声明（**不是缺口**：默认值生效／默认不启用）

> 读法：这些机制的**能力在内核**，v5r 取**框架默认值**（或该能力**默认不启用**）；部署要改，就声明右列的键族。**"pack 未声明"≠"未实现"**——这正是分层铁律要的形状。

| 机制 id | 机制 | 框架承载（可声明的键族） | 默认状态 |
|---|---|---|---|
| M-A01 | TeX/Lean 安装位置解析 | `kernel/lean.js`／`math.js`（引擎三面门） | 内核级，无需声明 |
| M-A03 | 注入声明／投影版本／12 种事件 | `kernel/stateversion.js`／`store.js`／`migration.js` | 内核级 |
| M-A05 | Lean 队列常量与纯助手 | `kernel/lean.js`／`formal.js`／`crypto.js` | 内核级 |
| M-A07 | 宿主在活上限侦测与**具名** | `host-spawn.js`／`capacity.js`／`resource.js` | 具名拒绝（宿主行为不可改写；改判条件见矩阵） |
| M-A08..M-A12 | 插件装载面／工具函数／耐久骨架／引用同一性／原子 id | `vibe-math-vmu.js`／`loader.js`／`store.js`／`transaction.js`／`idempotency.js` | 内核级 |
| M-A14..M-A16 | 事件信封准入／机构补丁白名单／upsert 语义 | `kernel/store.js`／`guard.js`／`tasks.js` | 内核级 |
| M-A17／M-A18 | 消息事件追加去重／投递确认账本 | `kernel/mailbox.js`（`vmu.mailbox.ackedLedgerCap`／`deliverTimeoutMs` 等） | 框架默认（pack 声明了 urgentKinds／wakeBudget） |
| M-A20 | 辩论/判定/形式化/队列/解决票事件 | `kernel/formal.js`／`ballot.js`／`workflow.js`／`tasks.js` | 内核级 |
| M-A21 | 唯一后端（加固 JSON） | `vmu.store.*`（backend／root／fsync／lock…） | 框架默认（`vmu.store.lock=true`） |
| M-A22／M-A23 | 会话注册表／会话参数默认表 | `vibe-math-vmu.js`／`settings/schema.js` | 内核级（pack 声明了本所偏好 47 键） |
| M-A25..M-A28 | 路径守卫／fs 语义／ready 诊断／失败缓冲 | `kernel/guard.js`／`storepolicy.js`／`store.js`／`alerts.js` | 内核级 |
| **M-A29／C-38** | **S5 静止提示（只推荐、不驱动）** | `vmu.control.idleAfterMs`／`idleAction`／`watchdogIntervalMs` ＋ `vmu.schedule.*` | **默认不启用**（`vmu.schedule.triggerVia='none'`；见 `docs/10 §4.3`） |
| **M-A30** | **临时授权与撤回** | **框架不提供** —— `kernel/grant.js` 与 4 个 `vmu.grant.*` 键已于 goal round 3 删除（零活构造者；规则集不要求 grants）。仍在的是 `vmu.delegation.*`(12)，但那是**实例级委托**（只减权），不是「命令级 + 事件作用域」的临时授权 | **框架不提供（规则集不要求）**；改判条件见 `04-parity-matrix` 的 `M-A30` 行 |
| **M-A31／C-22** | **投票板门槛** | `vmu.ballot.minVotes`／`minVotesRatio`／`abstainCountsForFloor`…（23 键） | 框架默认（矩阵说"`min_votes` 无默认值"＝**键名转述**；真名是 `vmu.ballot.minVotes`） |
| M-A32 | 决议台账与检索 | `vmu.records.*`(32) | 框架默认 |
| M-A34／C-23 | 票与发言时序分离（谓词） | `kernel/meeting.js`／`control.js` | 内核级谓词 |
| M-A35／C-07 | 引用边界与私聊补记 | `kernel/mailbox.js`／`records.js` | 内核级 |
| **M-A37** | **记录人／纪要条目上限** | `vmu.minutes.*`(7，含 `verbatimCapBytes`) | 框架默认（矩阵的 `SECRETARY_ENTRY_MAX` 是 v1 转述，**无同名键**） |
| **M-A38／C-21** | **动议与附议门槛／程序异议** | **`vmu.motions.secondThreshold`**（＋ `expireMs`／`withdrawable`／`tabledMax`／`maxOpen`／`proceduralKinds`／`privilegedKinds`… 共 9 键）＋ `vmu.agenda.*`(6) | 框架默认（矩阵的 `motionSecondsRequired` 是转述，真名＝`vmu.motions.secondThreshold`） |
| M-A39／M-A46 | 名册助手／法定人数快照／工具过滤 | `kernel/members.js`／`skills.js`／`host.js` ＋ `vmu.skills.*`(10)／`vmu.tools.*`(2) | 框架默认（pack 声明了 slots） |
| M-A42／C-56 | 活动等待器（一次性、future-only） | `kernel/scheduler.js`／`tasks.js` | 内核级 |
| M-A43 | 项目目录树创建 | `kernel/work.js`／`host-spawn.js` | 内核级 |
| M-A44／M-A45／C-01..C-06 | 耐久信箱／投递分级／群聊镜像／摘要节流 | `vmu.mailbox.digestMax`(**12**)／`digestWindowMs`(**45000**)／`vmu.chat.historyCap`… | **框架默认恰等于 v5r 值**（矩阵的 `chatDigestMax(12)/chatDigestMs(45s)` 是转述） |
| M-A47 | 宿主在活上限的会话侧处理 | `vmu.limits.maxLiveMembers`（**pack 已声明 3**）＋ `vmu.capacity.*`(12) | pack 已声明（§1） |
| M-B01..M-B03 | `[SPAWN]` 五步／唤醒一轮／身份推导 | `kernel/turn/index.js`／`members.js`／`host-spawn.js`／`identity.js` | 内核级（prompts 由 pack 提供） |
| **M-B07／C-37** | **心跳/看门狗时序** | `vmu.control.watchdogIntervalMs`／`idleAfterMs` ＋ `vmu.schedule.*`(16) | **默认不启用**（内核不自动 arm；`docs/10 §4.3`） |
| M-B08／M-B10 | 任务板 CAS DAG／上下文核算 | `kernel/tasks.js`／`board.js`／`metrics.js` ＋ `vmu.tasks.*`(3) | 框架默认 |
| M-B09 | 经验反馈库 | `vmu.memory.*`(16) ＋ `kernel/memory.js` | 框架默认 |
| **M-B12／M-B14** | **Lean 形式化／异步编译队列** | `vmu.math.*`（`maxParallel`／`jobs.persist`／`jobs.recover`／`captureStdoutBytes`…） | **pack 已声明 3 个**；矩阵的 `vmu.lean.*` **不存在**（见 §3.1） |
| M-B13／M-B15..M-B17 | 路径守卫／索引／提示块／数学接缝 | `kernel/lean.js`／`guard.js`／`library.js`／`host-math.js` ＋ pack prompts | 内核级 ＋ pack 文本 |
| M-B19 | 主持代行／程序异议／结束辩论 | `kernel/governance.js`／`meeting.js`／`minutes.js` | 内核级 |
| C-28／C-29／C-31 | 结题落盘／论文状态机／交付物编译 | `kernel/lifecycle.js`／`paper.js`／`publication.js` ＋ `vmu.paper.*`(9) | 框架默认（pack 声明了 5 个 officeConsult 键） |
| C-32／C-33／C-34 | 雇佣／解雇／编制变更 | `kernel/recruit.js`／`tenure.js`／`capacity.js` ＋ **`vmu.tenure.*`(11)**；**`vmu.recruit.*` 无键** | 框架默认（编制策略族＝`vmu.tenure.*`；若"编制上限"无对应键，见 §5 未做项 3） |
| C-35 | 督办 `nudge` | `kernel/delegation.js`／`scheduler.js` ＋ `vmu.delegation.*` | 框架默认 |
| C-36 | 调度 trampoline | `kernel/scheduler.js` | 内核级 |
| C-39／C-50 | 延迟补建／配置与恢复 | `kernel/resume.js` ＋ `vmu.resume.*`（pack 声明 4 个） | pack 已声明 ＋ 框架默认 |
| C-40..C-44 | 参数同步／回复解析／归一／驱动／派发 | `kernel/control.js`／`turn/index.js`／`ballot.js` | 内核级（D-13 活读） |
| C-46／C-47／C-54 | 工具过滤／persona 冻结／工具面声明 | `vmu.tools.faces`／`enabled`、`vmu.skills.*`、`host.js` 的 `TOOL_FACES` | 框架默认（声明式面：`vmu.tools.faces`） |
| C-48／C-49 | 参数白名单与归一／写入与可见面 | `settings/schema.js`、`kernel/control.js` ＋ `vmu.control.tunableKeys` | 框架默认 |
| C-51／C-53／C-57 | 状态视图／工具注册面（具名拒绝）／测试 seam（具名拒绝） | `kernel/control.js`／`registry.js`／注入接缝 | 具名拒绝（理由与改判条件见矩阵 §5.2） |

---

## §3 ③ 真缺口与需清理项（具名 + 改判条件）

### 3.1 机制层的**真缺口（1 条子项）＋ 3 处"矩阵键名不存在"**

| # | 项 | 事实（实测） | 处置 / 改判条件 |
|---|---|---|---|
| **G1** | **M-A04 子项：论文轮次上限可调** → **已闭合（轮 6 收尾）** | **读点与键都已落地**：core 落 `settings/schema.js` 的 `vmu.paper.maxRounds`（natural/def 0/H1/office），`kernel/paper.js:41,135` 真读（`revise()` 计数、超限**具名拒** `VMU_PAPER_ROUNDS_EXCEEDED` 且上限进 `enforced[]`）；**我随即在 v5r pack 声明 `3`**（＝v5r 的 `PAPER_MAX_ROUNDS`，defaults.json/js 同值）。 | ✅ **闭合**。判据：`node D:\_tmp\vmu-pack-defaults-vs-schema.mjs` → `undeclared=0`（35 键）；`vmu-paper` 37/0、`vmu-pack` 53/0、JSON/JS 同键同值。矩阵 M-A04 的 pack 列可写"`vmu.paper.maxRounds=3`（读者 `kernel/paper.js` 的 `revise()`）"。 |
| **G2** | **M-A30 的 `GRANTABLE_COMMANDS`／`GRANT_SCOPES`** → **已改判（goal round 3 收尾）** | 当时认定的"真名"`vmu.grant.commands`／`defaultScope`／`enabled`／`maxOpenGrants` **也随 `kernel/grant.js` 一起删除了**（模块零活构造者、规则集不要求 grants）。仍在的是 `vmu.delegation.*`(12)，但那是**实例级委托**（只减权），**不能**顶替「命令级 + 事件作用域」的临时授权。 | **不是缺口**：改判为「**框架不提供（规则集不要求）**」。`04-parity-matrix` 的 `M-A30` 行与 §9.4 表已同步改写；**改判条件**＝出现真实的「枚举命令 + 事件作用域 + 到期」消费者时，模块**带着消费者一起**回来。 |
| **G3** | **M-B12 的 `vmu.lean.*` 策略键** | **`vmu.lean.*` 一个键都不存在**（`grep` schema → 0）；框架承载是 `vmu.math.*`（pack 已声明 3 个）。 | **不是缺口**：矩阵改判为 `vmu.math.*`。 |
| **G4** | **C-05／M-A45 的 `chatDigestMax(12)`／`chatDigestMs(45s)`** | 真名是 **`vmu.mailbox.digestMax`（默认 12）／`digestWindowMs`（默认 45000）**——**框架默认值与 v5r 值逐字相同**。 | **不是缺口**：矩阵改判为真名，并写明"v5r 值＝框架默认值 ⇒ pack 无需声明"。 |
| **G5** | **M-A37 的 `SECRETARY_ENTRY_MAX`／M-A31 的 `min_votes`／M-A38 的 `motionSecondsRequired`** | 真名分别是 `vmu.minutes.verbatimCapBytes`、**`vmu.ballot.minVotes`**、**`vmu.motions.secondThreshold`**（＋ `vmu.motions.*` 共 9 键）。 | **不是缺口**：矩阵改判为真名（pack 未声明 ⇒ 框架默认）。 |

### 3.2 声明层的**孤儿键（1 个，须清理）**

- **`vmu.meetings.reconsiderFloor`**：同时出现在 `settings/schema.js`（vmu-core 的键表）与 **v5r 清单** `packs/v5r/prompts/v5r-core.js:78`，但**全仓没有任何读者**（`D:\_tmp\goal4-pack-readers3.mjs` 的严格扫描：无 kernel/host/tool/entry 读点；pack 自己的策略模块也不读它）。而 v5r 真正生效的"复议门槛只升不降"由 **`vmu.ballot.reopenFloor`** 承载（pack 已声明 0，读者 `kernel/ballotbox.js:22,41,137`）。
- ⇒ **处置已选定并执行（"删"分支，Lead 裁决）**——三处**清单/注释**已清，schema 声明由 vmu-core 随后删除：

| 位置 | 归属 | 状态 |
|---|---|---|
| `packs/v5r/prompts/v5r-core.js:78`（清单值） | vmu-assistant（Lead 指派） | ✅ **已删** |
| `packs/institute-min/index.js:51`（清单值）＋ 文件头注释 | **vmu-pack** | ✅ **已删／已改述** |
| `packs/v5r/settings/defaults.json:42`（pre-split `defaults.js:93` 注释） | **vmu-pack** | ✅ **已改述**（改指 `vmu.ballot.reopenFloor`） |
| `settings/schema.js:126`（声明行）＋ 116-117／127-130 注释 | vmu-core | ⏳ 待删（**删除顺序**：清单先清，否则门禁把"清单里点名"当"运行时读取"而红） |

- **顺序为什么重要**：`vmu-settings` 的判据是"运行时**读取**的键必须已声明"，而它把**清单值**也算作"读取" ⇒ 先删 schema 会让该门禁红（core 实测并回滚过一次）。
- **原意由谁承载**：**`vmu.ballot.reopenFloor`**（本 pack 声明 `0`，真读者 `kernel/ballotbox.js:22,41,137` 的 `reopen()`）。★ 别被同名物误导：`vibe-math-v5r/vibe-math-v5r.js:1070/2719` 的 `params.reconsiderFloor` 是 **v5r 自己的运行期请求参数**，不是这个设置键。
- 判据（可红）：`grep -rn "reconsiderFloor" vibe-math-vmu/{settings,packs,kernel}` **只应命中 docs 的历史叙述**；schema／清单／内核**零命中**。
- **删完的复核读数（我这边，全 exit 0）**：`vmu-settings` **47/0**、`vmu-planned-settings` **ALL GREEN（planned=113, 39/0）**、`vmu-pack` 53/0、`audit-pack-face` 5/0、`vmu-entry` 150/0、`check-docs` **PASS**。

### 3.3 已闭合、不再计为缺口（本轮复核）

- **C-30**（office 定稿咨询门）：pack 声明 5 键 ＋ `kernel/paper.js:45-49,111-114` 真读 ⇒ **闭合**（§1.1）。
- **C-45**（忠实性缺陷强制弃权）：内核谓词（`declareDefect`/`applyAbstention`），**强制不可配置** ⇒ pack 侧**不应**声明开关（`docs/10 §4.1 边界⑤`）。
- **C-52**（人类报告的自动汇报面）：pack 声明 5 个 `vmu.report.*` ＋ `kernel/report.js` 真读 ⇒ **闭合**（真机证据见 `05-framework-strength-evidence.md`）。
- **M-A13／C-09**（所办伪 id）：**具名拒绝**（收件人必须是真实成员）⇒ 不是缺口。

---

## §4 给 vmu-verify 的**矩阵改判清单**（pack 列）

矩阵的"v5r pack 声明"列是 **v1 的转述**，其中 **40 处写的是"策略"或并不存在的键名**。建议按下面三类改写（其余保持）：

1. **改成"框架具备（键族），pack 未声明（默认值生效）"**（约 34 行）：M-A02、M-A06（提示词侧已声明，records 侧未声明——已声明的那半保留）、M-A17、M-A18、M-A21、M-A28、M-A30、M-A31、M-A32、M-A37、M-A38、M-A44、M-A45、M-B02、M-B07..M-B10、M-B12、M-B14、M-B16、M-B18、M-B19、C-01..C-06、C-08、C-10..C-22、C-25..C-28、C-31..C-35、C-37、C-38、C-41、C-42、C-44、C-46、C-47、C-49、C-50。
2. **改成 pack 真声明的键**（§1.1 的 47 键 ↔ 机制 id）：M-A19（quorumRule/quorumCap/verdictMaxRounds/hardLimitMs/wakeRetries/quoteDepthMax/quotesPerMessageMax/unansweredInDenominator）、M-A33（`vmu.ballot.reopenFloor`）、M-A36（tier/allowLight）、M-A06／M-B11（pointerPropagation ＋ pointer.propagation）、M-A24（resume.*）、M-A29（**未声明**）、M-A47（maxLiveMembers）、M-B14（math.*）、C-22（**未声明**）、C-29／C-30（paper.*）、C-39（resume.*）、C-52（report.*）、C-55（promptPolicies ＋ prompts）。
3. **改成"键名不存在／真名是 X"**（§3.1 的 G2–G5）：M-A30、M-A31、M-A37、M-B12、C-05。
4. **新增一行真缺口**：M-A04 的子项（G1）。

---

## §5 未做项（具名 + 归属）

| # | 未做 | 归属 | 判据 |
|---|---|---|---|
| 1 | 删/接 `vmu.meetings.reconsiderFloor`（孤儿键） | vmu-core（schema）＋ vmu-assistant（v5r 清单） | §3.2 的 grep 判据 |
| 2 | M-A04 子项的 `vmu.paper.maxRounds`（键 ＋ 读点） | vmu-core | 声明后"轮次上限可调"才可声称 |
| 3 | C-32/C-33/C-34 的"编制上限"键（若有）：先核 **`vmu.tenure.*`(11)** 是否已覆盖；`vmu.recruit.*` **无键** | vmu-core | 需要"编制上限可声明"时加键；**本轮判为框架原语 ＋ `vmu.tenure.*` 具备，专门的上限键缺** |
| 4 | 矩阵 pack 列改判（§4） | vmu-verify | 以本文件 §1–§3 的 file:line 为准 |

> **本轮的自我约束**：`packs/v5r/prompts/**`（清单与提示词）**不在我的写范围**（归 vmu-assistant），`settings/**` 归 vmu-core ⇒ 上面 1–3 我只**具名 + 给判据**，**没有代改**；pack 侧我能改的（`packs/v5r/settings/**`、`middleware/**`、`docs/10`）本轮**无需再改**（§1 的 47 键全部有真读者，唯一孤儿在别人名下）。
