# vmu 08 · 会议 · 表决 · 工作流 · 任务板 · 控制流（Primitives & Infrastructure）

> 状态：**设计稿 v0.2（深水区）** —— 本版把 v0.1 的"骨架"扩成**可实施的基础设施全集**：逐条给出判定点、可调控族、错误码面、钩子、强制点与成熟度。
> 上位：`00-README.md`（阅读顺序与权威顺序）、`01-philosophy.md`（R1 内核零策略 / R2 能力与挂点齐备 / R5 中间件 / R6 登记即契约 / R11 可观测）、`02-architecture.md`（内核分区与钩子域）。
> 邻居（谁登记什么，**不要重复登记** ✗）：`03-interface-contract.md`（服务/工具/钩子索引/耐久键/**错误码总表**）、`04-settings.md`（**设置键全表**与"已接线/未接线"）、`05-middleware.md`（钩子全表与中间件语义）、`06-prompt-pipeline.md`（提示词段与注入）、`07-durability-library.md`（耐久与归档）、`14-open-items-and-roadmap.md`（未核项与路线图）。
> **核心立场**：内核只给**原语 ＋ 状态机骨架 ＋ 判定点 ＋ 钩子**；**"什么时候能开会、谁能开、几票算过、冻结期能不能发言、轮次怎么算完成、任务能否开始"全部由 settings／pack／中间件决定** ✓。

---

## 0. 读法、条目模板与三条记账纪律

### 0.1 条目模板（本卷每一项基础设施都按此 11 字段写成一行）

`名称` ｜ **目的** ｜ **面向谁** ｜ **接口形状**（服务方法／工具／钩子／协议） ｜ **可调控族**（`vmu.<ns>.*` 通配） ｜ **相关错误码** ｜ **四条哲学**（自由度 F·可调控性 T·可定义性 D·扩展性 X） ｜ **实现要点** ｜ **依赖与前置** ｜ **成熟度**（**已实现 ✓ / 未实现 ✗**） ｜ **优先级**（P0–P3）。

**为什么统一模板**：本卷是"实现清单"，不是散文。缺任一字段 ⇒ 读者无法判断"这条能不能落地、归谁调、错了报什么"。

### 0.2 三条记账纪律（全卷适用）

1. **通配族纪律** ✗✓：正文**只写通配家族**（如 `vmu.meetings.*` ✓）与**已登记的既有键**（作为"已实现"的证据 ✓）；**新键的具体名字一律不写在本卷**，由 `04-settings.md` 统一登记（防"文档承诺了 schema 里没有的键"）。
2. **工具名纪律** ✗✓：宿主**实际注册**的工具（`vibe_vmu_status`／`set`／`middleware`／`records`／`script`／`pack`／`control`／`meeting`／`task` ✓）可直接写；**任何未注册的工具名必须写在"含标记词"的行上**（`未实现／未接线／规划／提案／待实现／目标形态／尚未／roadmap／⛔` ✓）。
3. **错误码纪律** ✗✓：正文只用**已登记**的 `VMU_*`；**规划中的码用通配占位**（形如 `VMU_BALLOT_*`，末尾 `_` 表示族）并全部列进给 Lead 的回报，由其登记到 `03-§8` ✓ —— 未登记的**具体**码不得出现在本卷。

### 0.3 四条哲学怎么落到本卷（四个自检问句）

- **自由度（F）**：*代理能不能自己组织？* —— 会议/表决/任务都不强制流程；本卷每条机制的默认值必须"不做决定"。
- **可调控性（T）**：*使用者能不能改？* —— 每项都给出通配族与**热改等级**（立即生效／下轮生效／重启生效）。
- **可定义性（D）**：*能不能被定义/替换？* —— 每项都指出它是**判定点**（中间件可接管）、**结构声明**（pack 可给）还是**机器强制**（不可绕过）。
- **扩展性（X）**：*能不能加新的？* —— 新会议类型/新表决方法/新门/新触发器都必须能**只加数据与中间件**落地，不改内核。

---

## 1. 原语化与判定点（Decision Points）

### 1.1 为什么"原语化"（本仓血的教训，保留）

v5r 的 `s8-freeze-say` 真回归：**"本轮是否完成"的判据被写死在收束函数里** ⇒ "冻结期被拒的发言"让某个成员的 ask 永不收敛 ⇒ 重试耗尽 ⇒ 会议被**提前收束**。
**教训**：凡"判定/门槛/完成条件"，必须是**可替换的具名谓词**（由中间件/pack 提供），内核只负责**在正确时机询问** ✓。

### 1.2 判定点的统一契约（**内核只问不做**）

| 项 | 规定 |
|---|---|
| 形态 | **纯函数**（可 async）：入参是**只读快照**，返回结构化裁决；**不得**有副作用（副作用一律由内核按裁决执行 ✓） |
| 返回 | 允许：`true`（通过）／`{ ok:true }`／`{ ok:false, code?, message?, hint? }`／`{ complete:boolean, reason?, pending? }`（完成类）／`{ outcome, reason?, detail? }`（计票类） |
| 默认 | **最保守**：默认**不放行任何"没明说允许"的事**，也**不替调用方作决定**（不推进、不收束、不裁定） |
| 失败策略 | 判定点抛异常 ⇒ 内核按中间件失败策略处置（**具名** `VMU_MIDDLEWARE_FAILED` ✓ 或拒绝，**绝不静默通过** ✗）；返回形状非法 ⇒ 同样具名失败（例：`roundComplete` 不返回布尔 ⇒ `VMU_MIDDLEWARE_FAILED` ✓） |
| 可接管 | 每个判定点必须能被 pack 构造参数或中间件规则替换；**"写死到无法接管" ⇒ 门禁红** ✓ |
| 可观测 | 每次判定都要留痕（谁问的／什么裁决／哪个中间件 id 说了算）并可从 `status()` 读出 ✓ |

### 1.3 判定点登记表（已实现 ✓ ／ 规划 ✗）

> 图例：**已实现 ✓** = 当前代码里存在该决策点且被调用；**未实现 ✗** = 规划中的决策点，落地前不得据其写操作步骤（本卷一律标注）。

| 判定点 | 所在原语 | 内核默认（✓ 真实默认） | 入参（只读快照） | 返回形状 | 常见替换用法 | 成熟度 | 优先级 |
|---|---|---|---|---|---|---|---|
| `meeting.can-convene` | 会议 | `defaultCanConvene`：**≥2 人**才允许（否则 `VMU_MEETING_TOO_SMALL` ✓） | `{roster, kind, agenda}` | `{ok}` | 只允许某角色召集；"有未决项才开会"；席位/代表制检查 | 已实现 ✓ | P0 |
| `meeting.round-complete` | 会议 | `defaultRoundComplete`：**每个被问者都有终态**（已回答／已声明沉默） ✓ | `{asked, inputs, silent, refused, round, rounds}` | `{complete, reason?, pending?, refusedCount?}` | 冻结期**不推进**（v5r 教训）；"最小发言数即完成"；"全体委员会阶段用简单多数" | 已实现 ✓ | P0 |
| `meeting.close-policy` | 会议 | `()=>({ok:true})`（**不阻拦**；未完成的轮次另由"必须显式 force"挡住 ✓） | `{complete, round, reason}` | `{ok, code?, message?, hint?}` | "必须有决议才能散会"；"未确认上次纪要不得闭会" | 已实现 ✓ | P0 |
| `meeting.hand-policy` | 会议 | `()=>({ok:true})`（举手即受理） | `{member, round, hands}` | `{ok, code?, message?}` | 只允许特定槽位举手；举手配额；优先级队列 | 已实现 ✓ | P1 |
| `meeting.speech-order` | 会议 | **未实现 ✗**（当前只有举手顺序＝插入顺序） | `{hands, order, round}` | `{next:[member], reason?}` | 轮流／按席位／按权重／按未发言优先 | 未实现 ✗ | P1 |
| `meeting.speech-budget` | 会议 | **未实现 ✗**（当前只有整轮超时 `vmu.meetings.roundTimeoutMs` ✓ 与"超时后发言被具名拒" ✓） | `{member, round, elapsedMs, chars, spoke}` | `{allow, remainingMs?, code?, message?}` | 单人时间箱／发言次数配额／延长动议 | 未实现 ✗ | P1 |
| `meeting.interrupt` | 会议 | **未实现 ✗** | `{speaker, interrupter, round}` | `{allow, kind?('yield'/'point-of-order'/'objection'), code?}` | 允许让渡/程序问题/紧急打断；其余拒绝 | 未实现 ✗ | P2 |
| `meeting.quorum` | 会议 | **未实现 ✗**（`vmu.meetings.quorumCap` 目前由 pack 侧消费：门槛类规则在 pack 内 ✓） | `{roster, present, absent, kind}` | `{met, required, have, lostPolicy?}` | 法定人数、流失后处理（休会/延期/降门槛/明确未决） | 未实现 ✗ | P0 |
| `meeting.confidentiality` | 会议 | **未实现 ✗** | `{kind, member, role, agenda}` | `{level('open'|'closed'|'sealed'), allowRead, allowQuote}` | 闭门会：条目不出现在库/提示词；引用被折叠 | 未实现 ✗ | P2 |
| `meeting.lifecycle` | 会议 | **部分实现 ✓**（当前已发 `meeting/round-start`／`meeting/round-end` 两个钩子 ✓；其余生命周期点**未实现 ✗**） | — | — | 召集/开场/休会/复会/闭会/散会的中间件介入 | 部分 ✓ | P1 |
| `ballot.can-open` | 表决 | `()=>true`（**不阻拦**） | `{target, eligible, quorumRule}` | `true` 或拒绝 | "只有已登记正式证明/证伪的对象才能进入表决"（pack ✓） | 已实现 ✓ | P0 |
| `ballot.eligible` | 表决 | `eligible` 列表为空 ⇒ **全部在册**；否则按列表 | `{member, target}` | 布尔 | 排除临时角色／观察员／利害相关者（回避） | 已实现 ✓ | P0 |
| `ballot.frozen` | 表决 | `()=>false`（不冻结） | `{member, target}` | 布尔 | 冻结期：投了也**不计数**（具名拒 ✓） | 已实现 ✓ | P0 |
| `ballot.cast-valid` | 表决 | 决定性票必须是**布尔 1/0** ✓（其余形状具名拒） | `{member, value, kind}` | 布尔 | 允许多选项／排序／加权票（须同时换计票） | 已实现 ✓ | P0 |
| `ballot.tally` | 表决 | `defaultTally`：全 1 ⇒ `true`；全 0 ⇒ `false`；**其余 ⇒ `undecided` ＋ 必带 reason** ✓ | `{votes, eligible, quorumRule}` | `{outcome, reason?, detail?}` | 多数制族／IRV／孔多塞／博达／批准／二次投票／加权 | 已实现 ✓ | P0 |
| `ballot.after-decided` | 表决 | **未实现 ✗**（当前只有 `ballot/tally` 钩子可观测 ✓） | `{target, outcome, tally}` | `{ok}` | 结论触发下游（写库/开新阶段/通知/冻结决议） | 未实现 ✗ | P1 |
| `task.can-assign` | 任务 | **未实现 ✗**（当前 `assign()` 只做存在性与预算检查 ✓） | `{task, who, role}` | `{ok, code?}` | 只允许派给特定槽位；RACI 检查；不能自派 | 未实现 ✗ | P1 |
| `task.can-transition` | 任务 | **未实现 ✗**（当前由 `transition()` 内建的依赖/阶段门/暂停门强制 ✓） | `{task, from, to, reason}` | `{ok, code?, message?}` | 自定义状态机（审核/验收列）；WIP 限制 | 未实现 ✗ | P1 |
| `task.gate`（准入/准出） | 任务/阶段 | **部分实现 ✓**：`advance()` 先过 `stageGate`（阶段门）✓ | `{from, to, reason, tasks}` | `{ok, code?, message?}` | 交付物检查、里程碑、验收清单 | 部分 ✓ | P0 |
| `task.retry-policy` | 任务 | **未实现 ✗** | `{task, attempt, error}` | `{retry:boolean, backoffMs?, giveUp?}` | 退避/抖动/上限；转人工升级 | 未实现 ✗ | P2 |
| `work.recover-policy` | 在途台账 | **未实现 ✗**（`recover()` 当前按台账恢复 ✓，策略固定） | `{entries, reason}` | `{recover:[id]}` | 重启后只接回某类工作；超期不接回 | 未实现 ✗ | P1 |
| `control.can-pause` | 控制流 | **不存在 ✗**（暂停是框架动作，不是中间件判定点 ✓；要定制就挂 `control/paused` 观察型规则 ✓） | `{reason, scope}` | `{ok, code?}` | 只允许院士/所办暂停；停机窗口 | 未实现 ✗ | P3 |

### 1.4 六条不变式（**内核机器强制，中间件不可绕过** ✗）

| # | 不变式 | 谁强制 | 违反了会怎样 |
|---|---|---|---|
| I-1 | **过程读数不构成裁定**：`kind:'process'` 的票**只计数、只报告**，永不产生结论 ✓ | `ballot.js` | 过程票变"自动裁定器"，辩论被中途掐断（R10 同族） |
| I-2 | **没有隐式推进**：轮次完成只能**被询问**，不得由"拒了一次发言""超时""有人说话"推断 ✓ | `meeting.js` | 提前收束（`s8-freeze-say` 的成因） |
| I-3 | **拒绝不污染**：被拒输入不写入 `inputs`、不计票、不让成员变"已回答" ✓ | `meeting.js`／`ballot.js` | 拒一次就推进一格 ⇒ 完成判定失真 |
| I-4 | **三值结论**：`true/false/undecided`，且 `undecided` **必带 reason**（无 reason ⇒ `VMU_MIDDLEWARE_FAILED` ✓） | `ballot.js` | 结论强度被悄悄放大，"没有结论"被编出来 |
| I-5 | **暂停是真门禁**：`pause` 后**任务新建/转换、会议召集/开轮/发言、表决开板/投票**全部具名拒 ✓（不只是台账标记） | `kernel/index.js` | "暂停而不挡工作"＝幽灵在飞（07-§3 的待续标记也失真） |
| I-6 | **幂等去重**：写操作按 `traceId` 去重，重复调用不得二次生效 ✓ | 内核 | 重放/重试造成双写 |

---

## 2. 会议原语（Meeting）

### 2.1 已实现的会议 API（**精确，按 `kernel/meeting.js` ✓**）

- 工厂：`kernel.meeting(opts)` ✓ —— 逐场一个实例（**不是** `vmu.meetings` 服务 ✗）；`opts` 可给 `id/kind/roster/canConvene/roundComplete/closePolicy/handPolicy/deliver/bus/clock/roundTimeoutMs/quotesPerMessageMax/quoteDepthMax/isPaused` ✓。
- 实例方法（**全部已实现 ✓**）：`convene(agenda,{roster})`、`openRound({ask,members})`、`speak(member,text,{quotes})`、`refuseInput(member,text,reason)`、`markSilent(member,reason)`、`handUp(member)`、`roundComplete()`、`close(reason,{force,by})`、`summary()`、`status()`、`history()`；只读 getter：`state`／`id`／`kind`／`agenda` ✓。
- 状态机（**已实现 ✓**）：`idle ──convene──► convened ──openRound──► in_session ──close──► closed`；`convene` 被 `canConvene` 拦 ⇒ **记 `convene-refused` 并具名抛** ✓；`close` 在轮次未完成时**默认拒**（`force:true` 才关，且审计记 `close-forced`＋`by` ✓）；`openRound` 会被中间件 `meeting/round-start` 拦（拦下 ⇒ 回 `{ok:false,refused}` ✓）。
- 数据模型（公开部分 ✓）：`Meeting = { id, kind, agenda, roster[], state, rounds[], inputs{}, silent{}, refused{}, hands[], history[], closedReason }`；`summary()` 额外给 `unreached[]`（**被问但既没答也没说沉默的人** ✓）与 `completeness`（当前轮的 `roundComplete()` 裁决 ✓）。
- **已接线的三个会议控制键 ✓**（真消费者，不是声明）：`vmu.meetings.roundTimeoutMs`（超时后发言**具名拒**，文案含"已过 N ms／预算 M ms" ✓）、`vmu.meetings.quotesPerMessageMax`（条数超限**拒绝** ✓）、`vmu.meetings.quoteDepthMax`（**深度超限＝折叠＋计数**，回执带 `folded`／`foldingNotice` ✓）。**两种相反策略别混** ✓（条数拒、深度折）。

### 2.2 会议广度清单（任务点名的每一项 ＋ 本卷扩展；一行式条目）

> 每条的"接口形状"若指向**未注册的工具名**，该行一定带标记词 ✓（见 §0.2 纪律 2）。

**A. 召集与议程族**

- **会议开放/召集** ｜ 目的：把"要议事"变成一个有 id 的耐久对象 ｜ 面向谁：召集人（角色由 pack 定） ｜ 接口形状：`kernel.meeting().convene()` ✓ ／工具面 `vibe_vmu_meeting {action:'open'}` ✓ ｜ 可调控族：`vmu.meetings.*` ｜ 错误码：`VMU_STATE`／`VMU_MEETING_TOO_SMALL`／`VMU_NOT_PERMITTED` ｜ 哲学：F✓（谁都能被 pack 允许开）T✓（门槛可调）D✓（`can-convene` 判定点）X✓（新会议类型＝新 kind＋pack 规则） ｜ 实现要点：状态必须 `idle`；被拦记 `convene-refused` ｜ 依赖：名册与席位（§2.2-C） ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **议程（agenda）** ｜ 目的：给议题一个有序、可引用、可完成的载体 ｜ 面向谁：召集人＋全体 ｜ 接口形状：`convene(agendaText)` ✓（当前是**一段文本** ✗）；**一等议程条目（id／所属会议／顺序／负责人／时限／状态）＝规划** ✗（尚未实现） ｜ 可调控族：`vmu.agenda.*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT`／`VMU_NO_SUCH_OBJECT` ｜ 哲学：F✓ T✓ D✓ X✓ ｜ 实现要点：条目要能被任务/决议引用；"逐条完成度"进 `report` ｜ 依赖：§2.1 状态机 ｜ 成熟度：**部分实现 ✓**（仅文本议程） ｜ 优先级：P1
- **议题的合并与拆分** ｜ 目的：混合议题不必"一起过" ｜ 面向谁：主持人 ｜ 接口形状：规划＝`kernel.agenda.split/merge` ⛔ 未实现 ｜ 可调控族：`vmu.agenda.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：拆分产生的子议题必须带父指针，禁止"打包审议"（会徒增轮次） ｜ 依赖：一等议程条目 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **议程通过（通过议程＝第一道过滤器）** ｜ 目的：把"有人想谈"与"大家同意值得谈"分开 ｜ 面向谁：全体 ｜ 接口形状：规划＝一次 `ballot`（方法族可配）＋ `can-open` 规则 ⛔ 未实现 ｜ 可调控族：`vmu.ballot.*`＋`vmu.agenda.*` ｜ 错误码：`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**弃权/未达门槛不得折算为通过**（I-4） ｜ 依赖：§3 表决 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2

**B. 动议与程序族**

- **动议（motion）** ｜ 目的：把"我想推进某件事"变成可追踪、可撤回的正式提案 ｜ 面向谁：有动议权的成员 ｜ 接口形状：规划＝`kernel.motions.propose/withdraw` ⛔ 未实现（宿主面规划 `vibe_vmu_motion`，⛔ 未实现） ｜ 可调控族：`vmu.motions.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_INVALID_ARGUMENT`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：动议＝`{id,kind,text,by,at,state}`；**kind** 至少分 `substantive`（实体）／`procedural`（程序）／`privileged`（特权，急件） ｜ 依赖：§2.2-A 议程 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **附议（second）** ｜ 目的：防止"一人随口＝集体决定" ｜ 面向谁：成员 ｜ 接口形状：规划＝`kernel.motions.second(id,by)` ⛔ 未实现 ｜ 可调控族：`vmu.motions.*`（规划） ｜ 错误码：`VMU_NO_SUCH_OBJECT`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：附议阈值＝规则（默认 1）；**附议不是票** ✓；动议超时无附议 ⇒ 自动失效（带审计） ｜ 依赖：动议 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **动议撤回** ｜ 目的：防"提了就得投" ｜ 面向谁：提案人 ｜ 接口形状：规划＝`kernel.motions.withdraw(id,by,why)` ⛔ 未实现 ｜ 可调控族：`vmu.motions.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：撤回须具名留痕；撤回后不得再被"顺手投掉" ｜ 依赖：动议 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **搁置与带出（table / take from the table）** ｜ 目的：给"时机不对"的议题低成本去处，**与否决区分** ｜ 面向谁：主持人／全体 ｜ 接口形状：规划＝`kernel.motions.table(id)`／`untable(id)` ⛔ 未实现 ｜ 可调控族：`vmu.motions.*`（规划） ｜ 错误码：`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：搁置＝状态（可带出），**不得**写进决议；带出需新的表决 ｜ 依赖：动议 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **修正案（含友好修正）** ｜ 目的：让"文字"可收敛（会议产出的是文本） ｜ 面向谁：提案人／全体 ｜ 接口形状：规划＝`kernel.motions.amend(id,{text,by})`；友好修正可由提案人直接并入 ⛔ 未实现 ｜ 可调控族：`vmu.motions.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**完整修正案表决链不纳入**（代理场景过重）⇒ 只保留"友好并入＋实质改动一次表态" ｜ 依赖：动议 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **程序性问题（程序性动议）** ｜ 目的：在**不解决实体问题**的前提下改变进程（休会/延长/限制发言/散会） ｜ 面向谁：成员（请求）＋主持人（裁定） ｜ 接口形状：规划＝`kernel.motions.procedural(kind)`；当前可用 `vibe_vmu_control {action:'pause'}` ✓ 与 `vibe_vmu_meeting {action:'close'}` ✓ **部分覆盖**（休会/延长**未实现 ✗**） ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：程序动议**不改变实体状态**；被拒须给理由并留痕 ｜ 依赖：动议 ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P1
- **程序性申诉（appeal）** ｜ 目的：主持裁决的救济通道（不设"开会推翻主持人"的重型通道） ｜ 面向谁：成员 → 主持人／上级 ｜ 接口形状：规划＝`kernel.appeals.raise({against,why})` ⛔ 未实现 ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：申诉**只记录＋要求理由**，不自动改流程；必进纪要 ｜ 依赖：动议／纪要 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **纪律与驱逐** ｜ 目的：极端情况下维护议事秩序 ｜ 面向谁：主持人 ｜ 接口形状：规划＝`kernel.discipline.warn/mute/expel` ⛔ 未实现（当前只有"不邀请/不唤醒"的间接手段 ✗） ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：驱逐＝**席位状态变更**（不是删除历史）；必须具名留痕＋可申诉 ｜ 依赖：席位（§2.2-C） ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **紧急程序（急件/特权动议）** ｜ 目的：允许"跳过常规顺序"但有据可查 ｜ 面向谁：主持人（或全体一致） ｜ 接口形状：规划＝`kernel.motions.privileged(kind,{why})` ⛔ 未实现 ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：紧急＝**降低程序门槛但不降低留痕**；必须在纪要里单列 ｜ 依赖：动议 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3

**C. 席位、在场与代表族**

- **名册与席位（roster / seat）** ｜ 目的：谁在册、谁占哪个角色槽位 ｜ 面向谁：框架／主持人 ｜ 接口形状：已实现 ✓＝`kernel.members.roles()/roster()/hire()/assignRole()/end()`（**服务面** ✓）；会议侧 `roster` 由 `convene()` 落实 ✓ ｜ 可调控族：`vmu.meetings.*`＋`vmu.limits.*` ｜ 错误码：`VMU_RESOURCE_BUDGET`／`VMU_NO_SUCH_OBJECT`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**席位 ≠ 成员**（一个槽位可换人）；换人必须留痕 ｜ 依赖：`vmu.members` ✓ ｜ 成熟度：**已实现 ✓**（席位语义）／**代表制 ✗** ｜ 优先级：P1
- **法定人数（quorum）** ｜ 目的：让"够不够人"可判、可解释 ｜ 面向谁：主持人／全体 ｜ 接口形状：规划＝`kernel.quorum.check(meeting)`＋`meeting.quorum` 判定点 ⛔ 未实现（当前只有 pack 侧按 `vmu.meetings.quorumCap` 等门槛做规则 ✓，会议原语**不含** quorum 检查 ✗） ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_MEETING_TOO_SMALL`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**三层门槛不得混用**（法定人数／本次投票成立／通过条件）；**流失后处理**必须事先写明（休会‖延期‖降门槛‖明确未决） ｜ 依赖：名册＋在场 ｜ 成熟度：**未实现 ✗**（pack 侧部分 ✓） ｜ 优先级：P0
- **在场/缺席/迟到/早退** ｜ 目的：到场口径决定分母 ｜ 面向谁：主持人 ｜ 接口形状：规划＝`kernel.attendance.mark(member,status)` ⛔ 未实现（当前"被问者终态"承担了在场语义 ✓） ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_NO_SUCH_OBJECT`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**未答不计分母、不算反对，且名单必列**（沿用定稿 D3 口径 ✓）；"唤醒失败"与"拒绝参加"分开记 ｜ 依赖：法定人数 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P0
- **观察员 / 列席 / 受邀者** ｜ 目的：把"信息来源"与"表决权"分开 ｜ 面向谁：主持人 ｜ 接口形状：规划＝席位类型 `observer|attendee|invitee`（`may()` 面已能表达 ✓，会议侧未区分 ✗） ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_NOT_MEMBER` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**非成员永不表决**（`ballot.eligible` 默认不含他们 ✓）；可被引用须先补记 ｜ 依赖：席位 ｜ 成熟度：**部分实现 ✓**（权限面）／**会议侧 ✗** ｜ 优先级：P1
- **委托与代理投票（proxy / delegation）** ｜ 目的：缺席者如何被"代表" ｜ 面向谁：成员 ｜ 接口形状：规划＝`kernel.delegations.grant/revoke` ⛔ 未实现（**且本卷建议默认不许代投** ✗，见 §3.3） ｜ 可调控族：`vmu.ballot.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：若启用，委托链必须**禁环**、可撤回、逐票留痕；**不得**把缺席沉默折算成票（I-3/R2 同族） ｜ 依赖：表决 ｜ 成熟度：**未实现 ✗**（默认禁用） ｜ 优先级：P3
- **远程/异步同步** ｜ 目的：异步成员也能"在场" ｜ 面向谁：全体 ｜ 接口形状：`deliver` 注入接缝（**已实现 ✓**：`openRound({ask})` 逐个投递 ✓）＋ 唤醒重试面（pack 侧 `vmu.meetings.wakeRetries` ✓） ｜ 可调控族：`vmu.meetings.*` ｜ 错误码：`VMU_ENGINE_UNAVAILABLE`（无投递接缝 ✓）／`VMU_RESOURCE_BUDGET` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**没有接缝就具名拒**，绝不假装问过（11-§4.1 ✓） ｜ 依赖：投递接缝 ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **并行多会（母会/子会）** ｜ 目的：委员会/分组讨论与大会议事并行 ｜ 面向谁：主持人 ｜ 接口形状：规划＝`kernel.meetings.spawn(parentId,{roster,agenda})` ⛔ 未实现（当前每场会独立实例、可按 id 寻址 ✓，但**无父子关系** ✗） ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_NO_SUCH_OBJECT`／`VMU_STATE`／`VMU_RESOURCE_BUDGET`（子会数量上限） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：子会**不得**自行改变母会状态；结论经"报告动议"回到母会；资源上限必须有 ｜ 依赖：席位＋预算 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **委员会 / 全体委员会 / 分组讨论** ｜ 目的：小范围深聊、再把结论带回来 ｜ 面向谁：主持人 ｜ 接口形状：规划＝`kind:'committee'|'committee-of-the-whole'`＋父会关系 ⛔ 未实现 ｜ 可调控族：`vmu.committees.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_RESOURCE_BUDGET` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：委员会**只有报告权**；"全体委员会"＝同一场会换规则集（`kind` 切换须留痕） ｜ 依赖：并行多会 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2

**D. 发言与秩序族**

- **举手与发言权** ｜ 目的：把"谁能说话"从"嗓门/速度"变成队列 ｜ 面向谁：成员 ｜ 接口形状：已实现 ✓＝`handUp(member)`＋`hand-policy` 判定点；工具面 `vibe_vmu_meeting {action:'speak'}` ✓ ｜ 可调控族：`vmu.meetings.*` ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：举手与发言分离；**举手不消费发言权**（可配） ｜ 依赖：§2.1 ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **发言顺序** ｜ 目的：公平与可预期 ｜ 面向谁：主持人 ｜ 接口形状：规划＝`meeting.speech-order` 判定点 ⛔ 未实现 ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：默认"先举手先发言"；可替换为轮流/席位/权重；顺序**对外可见** ｜ 依赖：举手 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **发言时长与时间箱** ｜ 目的：效率 ｜ 面向谁：主持人／成员 ｜ 接口形状：**部分实现 ✓**＝整轮超时 `vmu.meetings.roundTimeoutMs`（超时后发言**具名拒** ✓）；单人时间箱＝规划 ✗ ｜ 可调控族：`vmu.meetings.*` ｜ 错误码：`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**到点只拒"新的输入"，不得自动收束会议**（R10 同族 ✗）；延长必须显式 ｜ 依赖：§2.1 ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P1
- **轮次（round）** ｜ 目的：让"这一轮问完了吗"可判 ｜ 面向谁：内核／主持人 ｜ 接口形状：已实现 ✓＝`openRound()`／`roundComplete()`／`status().rounds` ｜ 可调控族：—（判定点可换） ｜ 错误码：`VMU_STATE`／`VMU_MEETING_TOO_SMALL`／`VMU_MIDDLEWARE_FAILED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**拒绝不推进**（I-2/I-3）；轮次可无限（由 `close-policy` 与预算控） ｜ 依赖：§2.1 ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **打断与让渡（interrupt / yield）** ｜ 目的：处理"必须现在插一句" ｜ 面向谁：成员（请求）／主持人（裁定） ｜ 接口形状：规划＝`meeting.interrupt` 判定点 ⛔ 未实现 ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：打断**不是新发言**（不占配额）；被拒留痕；`point-of-order` 优先于实体插话 ｜ 依赖：发言顺序 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **主持中立与主持交接** ｜ 目的：可信度与可持续性 ｜ 面向谁：主持人 ｜ 接口形状：规划＝`kernel.chair.transfer(to,{why})`＋`chair-neutral` 约束 ⛔ 未实现 ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**主持不额外加权**（沿用定稿 R5 口径 ✓）；交接须留痕且**不得**改变在飞的表决 ｜ 依赖：席位 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2

**E. 会议进行与收束族**

- **闭会 / 散会（close / adjourn）** ｜ 目的：有据地结束 ｜ 面向谁：主持人 ｜ 接口形状：已实现 ✓＝`close(reason,{force,by})`＋工具面 `vibe_vmu_meeting {action:'close'}` ✓ ｜ 可调控族：`vmu.meetings.*` ｜ 错误码：`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：未完成轮次**默认拒**；强制关必须记 `by`＋`why`（`close-forced` ✓） ｜ 依赖：§2.1 ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **休会 / 复会（recess / resume-session）** ｜ 目的：保留议题与进度地暂停 ｜ 面向谁：主持人 ｜ 接口形状：规划＝`meeting.recess(reason)`／`resumeSession()` ⛔ 未实现（**注意别与内核 `control.pause` 混**：后者停的是整个内核 ✓，不是"这一场会先歇会儿" ✗） ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：休会期间的发言不进入 `inputs`（I-3）；休会时长计入会议账 ｜ 依赖：§2.1 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **延会（adjourn to a time / continuation）** ｜ 目的：把"没议完"延续到下一次而不是偷偷继续 ｜ 面向谁：主持人 ｜ 接口形状：规划＝`meeting.continueAt(ts,{carry:[agendaIds]})` ⛔ 未实现 ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**散会后不得原地续会** ⇒ 必须"新会＋带出条目"；新旧会用 `carry` 链 ｜ 依赖：议程条目 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **上次纪要确认** ｜ 目的：让纪要与事实不脱节 ｜ 面向谁：全体 ｜ 接口形状：规划＝`kernel.minutes.confirm(prevId)`＋`close-policy` 挂钩 ⛔ 未实现 ｜ 可调控族：`vmu.minutes.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_NO_SUCH_OBJECT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：确认＝一条耐久记录；未确认可"记入待办"但**不得**假装确认 ｜ 依赖：纪要 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **纪要 / 逐字稿（minutes / verbatim）** ｜ 目的：组织记忆 ｜ 面向谁：全体／上级 ｜ 接口形状：**部分实现 ✓**＝`summary()`（结构化：轮次/被问/回答/沉默/拒绝/未达/举手/收束原因 ✓）；落盘纪要＝规划 ✗；逐字稿＝规划 ✗ ｜ 可调控族：`vmu.minutes.*`／`vmu.verbatim.*`（规划） ｜ 错误码：`VMU_IO_FAILED`／`VMU_NO_SUCH_OBJECT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：纪要**必须包含被拒项**（拒绝也留痕 ✓）；逐字稿默认关闭（成本）且必须可引用 ｜ 依赖：`vmu.library` ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P1
- **会议预算（回合/令牌/墙钟/子代理）** ｜ 目的：让"开会很贵"可计量、可限制 ｜ 面向谁：主持人／框架 ｜ 接口形状：**部分实现 ✓**＝`vmu.limits.*`（`maxParallel`／`toolCallsPerTurnCap`／`memoryCeilingMb`／`wallClockMs` ✓）＋轮次超时 ✓；会议级令牌/回合预算＝规划 ✗ ｜ 可调控族：`vmu.meetings.*`／`vmu.budget.*`（规划） ｜ 错误码：`VMU_RESOURCE_BUDGET` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：触界**必须具名广播**（当前 `status().control.stale` 即此思路 ✓）；**触界不得自动散会**（R10 同族 ✗） ｜ 依赖：`vmu.limits` ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P1
- **闭门与保密级别** ｜ 目的：敏感议题的可见性 ｜ 面向谁：主持人／框架 ｜ 接口形状：规划＝`meeting.confidentiality` 判定点＋`level(open|closed|sealed)` ⛔ 未实现 ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：闭门条目**不得**进库/提示词（与 S21 头部列表纪律一致 ✗）；引用须折叠 ｜ 依赖：库面 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **会议生命周期钩子** ｜ 目的：让中间件在"关键时刻"介入 ｜ 面向谁：M1/M2 中间件 ｜ 接口形状：**已注册 ✓**＝`meeting/round-start`／`meeting/round-end`；**规划 ✗**＝`meeting/convened`／`opened`／`speech-requested`／`speech-granted`／`motion`／`seconded`／`amendment`／`recess`／`resumed`／`adjourned`／`minutes-drafted` ｜ 可调控族：`vmu.middleware.*` ｜ 错误码：`VMU_MIDDLEWARE_REJECTED`／`VMU_MIDDLEWARE_FAILED` ｜ 哲学：F✓T✓D✓X（新钩子＝可扩展点 ✓） ｜ 实现要点：**钩子必须先注册再发**（05 号全表）；未实现的钩子不得写成"已生效" ✗ ｜ 依赖：`kernel/bus.js` ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P1

### 2.3 会议钩子与工具的成熟度小结

- **已实现钩子 ✓**：`meeting/round-start`、`meeting/round-end`（`bus.emit` 真生产者 ✓）。
- **已实现工具 ✓**：`vibe_vmu_meeting`（`list|open|speak|silent|close|ballot|vote|tally|reopen` ✓）。
- **规划工具 ✗**：`vibe_vmu_motion`（动议/附议/修正/搁置）、`vibe_vmu_agenda`（议程条目）、`vibe_vmu_minutes`（纪要/确认）、`vibe_vmu_committee`（委员会/子会）、`vibe_vmu_attendance`（在场/法定人数）—— **以上均未实现**（roadmap 见 §9）。

---

## 3. 表决原语（Ballot）

### 3.1 已实现的表决 API（**精确，按 `kernel/ballot.js` ✓**）

- 工厂：`kernel.ballot(opts)` ✓（逐次表决一个实例）；`opts`：`target/quorumRule/eligible/canOpen/isEligible/isFrozen/castValid/tally/bus/clock/isPaused` ✓。
- 方法（**全部已实现 ✓**）：`open()`、`freeze(reason)`、`unfreeze(reason)`、`cast(member,value,{kind})`、`close(reason)`、`reopen(reason)`、`status()`、`history()`、`processReadings()`；getter：`state`／`frozen`／`target` ✓。
- 状态机（**已实现 ✓**）：`closed ──open──► open ──freeze──► frozen ──unfreeze──► open`；`open|frozen ──close──► tallied`；`tallied ──reopen──► open`（**旧结论留在 history，不被覆盖** ✓）。
- 票的 kind（**已实现 ✓**）：`decisive`（决定性：布尔 1/0 ✓）与 `process`（过程读数：**只计数、永不裁定** ✓，`processReadings()` 单独暴露）。
- 结论（**已实现 ✓**）：`{outcome: true|false|'undecided', reason, detail, at}`；`undecided` **无 reason ⇒ 具名失败** ✓；计票可被 `ballot/tally` 钩子的 `decision.tally` 覆盖 ✓（自定义口径）但**不得移除三值契约** ✓。
- **拒绝不投**（**已实现 ✓**）：冻结中投票／不合格者／重复票／非法值／中间件拒绝 —— 全部**只留痕不入票** ✓。
- **幂等**：同一成员重复投 ⇒ 具名拒（`VMU_STATE` ✓）；重开清空票（**并留痕** ✓）。

### 3.2 三层门槛（**不得混用** ✗ —— 本卷最重要的口径）

| 层 | 问题 | 数据来源 | 未达时 |
|---|---|---|---|
| ① **法定人数（quorum）** | 这次会**够不够人开/续** | 名册＋在场 | 只能：休会／延期／降低门槛（事先写明）／明确未决 —— **不得**默认通过或否决 ✓ |
| ② **本次投票成立门槛**（最少收集票） | 这次投票**算不算数** | 本次投票自身的规则 | **该次投票不形成结论**，且**不得**用剩余票推断 ✓ |
| ③ **通过条件** | 结论是"通过/否决/未决" | 表决方法族（§3.3） | 未达 ⇒ **未决**（`undecided` ＋ reason ✓） |

> **纪律**：① 与 ② 必须**分开登记、分开显示**（沿用定稿 K13 口径 ✓）；**未表态绝不折算成任何一票**（I-3/R2 同族 ✓）；**过程读数永不裁定**（I-1 ✓）。

### 3.3 表决方法族（广度清单；一行式条目）

**A. 多数制族**

- **简单多数** ｜ 目的：过半即通过 ｜ 面向谁：全体表决者 ｜ 接口形状：`tally` 判定点替换（`ballot.tally` ✓ 可接管） ｜ 可调控族：`vmu.ballot.method*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT`／`VMU_MIDDLEWARE_FAILED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：分母口径必须显式（在册？在场？已投？） ｜ 依赖：§3.2 三层门槛 ｜ 成熟度：**未实现 ✗**（默认只有一致制 `defaultTally` ✓） ｜ 优先级：P0
- **绝对多数 / 相对多数 / 2-3 多数（三分之二）** ｜ 目的：按事项轻重选门槛 ｜ 面向谁：全体 ｜ 接口形状：同上（`tally` 替换） ｜ 可调控族：`vmu.ballot.method*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：**"未达门槛"＝未决**（不是否决 ✓） ｜ 依赖：三层门槛 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P0
- **一致同意（m-unanimous；当前默认 ✓）** ｜ 目的：最高强度结论（v5r 沿用） ｜ 面向谁：全体 ｜ 接口形状：`defaultTally` ✓（全 1 ⇒ true；全 0 ⇒ false；分裂 ⇒ undecided ✓） ｜ 可调控族：`vmu.meetings.*`＋`vmu.ballot.*` ｜ 错误码：`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：**"所有人都投了"与"都投同一向"分两步判** ✓；未投者使结果悬置（`undecided` ＋ 原因 ✓） ｜ 依赖：— ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **配额制（quota / 保留席位）** ｜ 目的：保证少数派比例 ｜ 面向谁：全体 ｜ 接口形状：规划＝`tally` 替换＋多席位模型 ⛔ 未实现 ｜ 可调控族：`vmu.ballot.*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：需要"多席位/多任命"场景（本仓目前**没有** ✗）⇒ 只登记不实现 ｜ 依赖：多席位 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3

**B. 票的形态族**

- **加权票** ｜ 目的：权责对等 ｜ 面向谁：全体 ｜ 接口形状：规划＝`cast` 带 `weight`＋`tally` 汇总 ⛔ 未实现 ｜ 可调控族：`vmu.ballot.weight*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT`／`VMU_NOT_PERMITTED` ｜ 哲学：F✗（默认等权更自由）T✓D✓X✓ ｜ 实现要点：**主持不额外加权** ✓；权重来源必须可审计且不可自赋；与"纯算术平均"的聚合纪律**不得混用** ｜ 依赖：票的语义 ｜ 成熟度：**未实现 ✗**（默认等权 ✓） ｜ 优先级：P3
- **弃权（abstain）** ｜ 目的：区分"没意见"与"没到场" ｜ 面向谁：表决者 ｜ 接口形状：规划＝`cast(member,null,{kind:'abstain'})`（当前 `kind:'process'` 可近似但语义不同 ✗） ｜ 可调控族：`vmu.ballot.abstain*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：**弃权＝已投但不计入任何选项**（沿用定稿 D3 ✓）；弃权**不得**让门槛"没达"变"达" ｜ 依赖：票的 kind 扩展 ｜ 成熟度：**未实现 ✗**（当前决定性票只接受 1/0 ✓） ｜ 优先级：P0
- **缺席／未答／未表态** ｜ 目的：三者的账要分开 ｜ 面向谁：主持人／审计 ｜ 接口形状：规划＝`tally` 输入扩展 `absent[]/unanswered[]`（当前 `eligible` 与实际投票数之差可近似 ✓） ｜ 可调控族：`vmu.ballot.*`（规划） ｜ 错误码：`VMU_STATE` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：**未答不计分母、不算反对，且名单必列** ✓；不得把"没答"当"同意" ✗ ｜ 依赖：在场（§2.2-C） ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P0
- **记名 / 不记名 / 秘密表决** ｜ 目的：追责与保护真实意见兼顾 ｜ 面向谁：主持人（定）＋全体（守） ｜ 接口形状：规划＝`ballot.secrecy` 声明＋仅记"结论"的分支 ⛔ 未实现 ｜ 可调控族：`vmu.ballot.secrecy*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：**必须在开票前选定**（事后不得两头都要 ✗）；不记名时**仍留档"本次不记名"**；结论公开而票面隐藏 ｜ 依赖：票的语义 ｜ 成熟度：**未实现 ✗**（默认全记名 ✓，`status().votes` 可见 ✓） ｜ 优先级：P1
- **点名与唱名（roll call）** ｜ 目的：逐人表态、可即时纠错 ｜ 面向谁：主持人 ｜ 接口形状：规划＝`ballot.rollCall(order)` ⛔ 未实现 ｜ 可调控族：`vmu.ballot.rollcall*`（规划） ｜ 错误码：`VMU_STATE` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：点名顺序＝名册顺序可配；唱名结果公开；**点名不是催促**（不得因未答而"跳过并记通过"） ｜ 依赖：名册 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2

**C. 方法族（多轮与偏好）**

- **多轮与淘汰（runoff）** ｜ 目的：无人过半时收敛 ｜ 面向谁：全体 ｜ 接口形状：规划＝`kernel.ballotRounds(n)`＋`reopen` 复用（`reopen()` ✓ 已能重开但不记"第几轮" ✗） ｜ 可调控族：`vmu.ballot.rounds*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：轮数上限**事先写明**；每轮独立留痕（不得覆盖上一轮 ✓ 沿用 `reopen` 的纪律） ｜ 依赖：`reopen` ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P1
- **排序复选（IRV）** ｜ 目的：偏好分散时选出"最被接受"者 ｜ 面向谁：全体 ｜ 接口形状：规划＝`tally:'irv'`＋排序票 `rank[]` ⛔ 未实现 ｜ 可调控族：`vmu.ballot.irv*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：**一次收集、一次计票**（避免"多轮投票"拖死 run ✓）；并列规则事先写明 ｜ 依赖：票形态扩展 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **孔多塞 / 博达 / 批准投票（approval） / 二次投票（quadratic）** ｜ 目的：更强的偏好表达 ｜ 面向谁：全体 ｜ 接口形状：规划＝`tally:'condorcet'|'borda'|'approval'|'quadratic'` ⛔ 未实现 ｜ 可调控族：`vmu.ballot.condorcet*`／`borda*`／`approval*`／`quadratic*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：每种方法都必须**声明自己的并列/未达规则**；二次投票的"票力预算"必须有上限（防操纵） ｜ 依赖：票形态扩展 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3

**D. 门槛、回避与救济族**

- **法定票数门槛** ｜ 目的：小样本不得形成强结论 ｜ 面向谁：主持人 ｜ 接口形状：规划＝`min_votes` 参数＋`tally` 前置检查 ⛔ 未实现 ｜ 可调控族：`vmu.ballot.quorum*`（规划） ｜ 错误码：`VMU_MEETING_TOO_SMALL`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：**与法定人数分开**（§3.2 ✓） ｜ 依赖：三层门槛 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P0
- **利害关系回避与利益冲突** ｜ 目的：研究诚信 ｜ 面向谁：成员（申报）／主持人（裁定） ｜ 接口形状：规划＝`kernel.recusals.declare(member,scope)`＋`ballot.eligible` 排除 ⛔ 未实现 ｜ 可调控族：`vmu.ballot.recuse*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：回避**不计入该项投票的分母**；申报与裁定都留痕 ｜ 依赖：`ballot.eligible` ✓ ｜ 成熟度：**未实现 ✗**（判定点已可承载 ✓） ｜ 优先级：P1
- **否决与保留（veto / reservation）** ｜ 目的：保护关键方 ｜ 面向谁：特定角色 ｜ 接口形状：规划＝`tally` 的特例分支 ⛔ **本卷建议默认不纳入** ✗（否决权与"少数意见可复议"的架构重复且易成单点阻塞） ｜ 可调控族：`vmu.ballot.veto*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED` ｜ 哲学：F✗T✓D✓X ｜ 实现要点：若某机构确需，用"提高门槛＋必须具名理由"替代；**保留意见**（reservation）＝进纪要，不影响结论 ｜ 依赖：纪要 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **表决冻结期** ｜ 目的：防止"边说边投" ｜ 面向谁：主持人 ｜ 接口形状：**已实现 ✓**＝`freeze()`／`unfreeze()`＋`isFrozen` 判定点（冻结中投票**具名拒且不入票** ✓）；会议侧"冻结期不推进轮次"＝由 `meeting.round-complete` 判定点承担 ✓（**本仓 v5r 教训的正面答案** ✓） ｜ 可调控族：`vmu.ballot.freeze*`（规划）／`vmu.meetings.*` ｜ 错误码：`VMU_STATE` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：冻结**不等于**关闭（可解冻）；冻结期间**任何**写票路径都要走同一判定点 ｜ 依赖：§3.1 ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **重开与复议（reopen / reconsider）** ｜ 目的：低成本纠错 ｜ 面向谁：全体（门槛可配） ｜ 接口形状：**已实现 ✓**＝`reopen(reason)`（旧结论留 history ✓）；复议门槛＝规划（`vmu.meetings.reconsiderFloor` 由 pack 消费 ✓） ｜ 可调控族：`vmu.ballot.reopen*`（规划）／`vmu.meetings.*` ｜ 错误码：`VMU_STATE`／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：复议须有**明确发起人＋范围**（防滥诉）；复议期间的旧结论**仍然有效**直到新结论产生 ｜ 依赖：§3.1 ｜ 成熟度：**已实现 ✓**（复议门槛部分 ✓） ｜ 优先级：P1
- **票数审计与复算（audit / recount）** ｜ 目的：结论可被第三方复算 ｜ 面向谁：审计者／上级 ｜ 接口形状：**部分实现 ✓**＝`history()`（含被拒项 ✓）＋`status().votes/byKind/refused` ✓；独立复算器＝规划 ✗ ｜ 可调控族：`vmu.audit.*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT`／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：复算**只读**；必须能回答"有效票集合是什么、规则是哪条、谁判的" ｜ 依赖：`history` ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P1

### 3.4 表决判定点与钩子（成熟度）

- **已实现判定点 ✓**：`ballot.can-open`／`ballot.eligible`／`ballot.frozen`／`ballot.cast-valid`／`ballot.tally`；
- **已实现钩子 ✓**：`ballot/cast`（可拒绝 ✓）、`ballot/tally`（可覆盖计票 ✓）；
- **规划 ✗**：`ballot.after-decided`／`ballot/quorum`／`ballot/recuse`／`ballot/freeze-check`／`ballot/recount`／`ballot/secret-scope` 与 `ballot/opened|frozen|unfrozen|closed|reopened|audited` 钩子（**均未实现**）。

---

## 4. 工作流 · 任务板 · 控制流

### 4.1 已实现的任务/台账 API（**精确，按 `kernel/tasks.js`／`kernel/work.js` ✓**）

- `vmu.tasks` ✓（服务）：`create({title,objective?,owner?,deps?,priority?})`、`assign(id,who)`、`transition(id,to,{reason})`、`list()`、`stage()`、`advance({to,reason})`（**先过阶段门** ✓）、`rollback({reason})`、`brief(id)`／`briefOf(id)`／`clearBrief(id)`（任务简报＝给负责人的执行流程 ✓）、`history(id?)`、`status()`；具名拒：`VMU_STATE`／`VMU_RESOURCE_BUDGET`／`VMU_NO_SUCH_OBJECT`／`VMU_INVALID_ARGUMENT` ✓。
- `vmu.work` ✓（服务）：`start({owner,kind,objective})`、`settle(id,{outcome})`、`interrupt(id,reason)`、`recover({reason})`、`list()`、`pending()`、`interrupted()`、`status()` —— **在途工作台账**（重启后"谁还有活没干完" ✓）。
- 钩子 ✓：`task/assign`、`task/transition`、`settle/before`、`settle/after` ✓；工具面 `vibe_vmu_task`（`list|create|assign|transition|stage|advance|brief|history` ✓）。
- 机器强制 ✓：**依赖未满足不得 start**；**阶段门**；**暂停中新建/转换被拒**（I-5 ✓）；**任务上限** `vmu.tasks.maxOpenTasks`（`VMU_RESOURCE_BUDGET` ✓）。

### 4.2 工作流广度清单（一行式条目）

- **任务 DAG 与依赖（完成/开始、软/硬）** ｜ 目的：让"顺序"可判而非靠自觉 ｜ 面向谁：任务负责人／调度 ｜ 接口形状：**部分实现 ✓**＝`deps[]`＋未满足即拒（`create/transition` 已做 ✓）；**依赖类型**（finish-to-start／start-to-start／软硬）＝规划 ✗ ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_NO_SUCH_OBJECT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**成环必须拒**（当前有依赖检查 ✓，环检测能力见 `status`）；软依赖＝可越过的提醒，硬依赖＝机器拒 ｜ 依赖：`vmu.tasks` ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P0
- **阶段与门（准入/准出）** ｜ 目的：把"能开始/算完成"变成可换的判定 ｜ 面向谁：调度／负责人 ｜ 接口形状：**已实现 ✓**＝`stage()`／`advance({to,reason})`（先过 `stageGate` ✓）／`rollback()`；**门类型**（准入/准出/验收）＝规划 ✗ ｜ 可调控族：`vmu.tasks.*`／`vmu.workflow.gates*`（规划） ｜ 错误码：`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：阶段是**声明式列表**（`vmu.tasks.stages` ✓，未声明 ⇒ 零阶段、不假装有流程 ✓） ｜ 依赖：`vmu.tasks` ✓ ｜ 成熟度：**已实现 ✓**（阶段机） ｜ 优先级：P0
- **并行与抢占** ｜ 目的：资源有限时的调度 ｜ 面向谁：调度 ｜ 接口形状：**部分实现 ✓**＝`vmu.limits.maxParallel` ✓（并发上限）；抢占式调度＝规划 ✗ ｜ 可调控族：`vmu.workflow.*`（规划）／`vmu.limits.*` ｜ 错误码：`VMU_RESOURCE_BUDGET` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**抢占必须留下被打断者的可恢复记录**（`work.interrupt()` ✓ 已有原语） ｜ 依赖：在途台账 ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P1
- **优先级与截止** ｜ 目的：先做要紧事 ｜ 面向谁：调度／主持人 ｜ 接口形状：**部分实现 ✓**＝`create({priority})` ✓；截止/逾期＝规划 ✗ ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：优先级**只影响顺序**，不得改变门槛；逾期是提醒不是自动失败 ｜ 依赖：任务台账 ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P2
- **重试与退避** ｜ 目的：瞬时失败不惊动上级 ｜ 面向谁：调度 ｜ 接口形状：规划＝`task.retry-policy` 判定点 ⛔ 未实现 ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_ENGINE_UNAVAILABLE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**任何重试/等待必须有界**（禁止无界循环 ✗）；退避＋抖动＋上限＋放弃后的升级路径 ｜ 依赖：在途台账 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **超时、中断、暂停恢复** ｜ 目的：别让一次卡死拖垮全所 ｜ 面向谁：调度／主持人 ｜ 接口形状：**已实现 ✓**＝`vibe_vmu_control {pause|resume|stop}` ✓＋`work.interrupt()`／`recover()` ✓；**超时**＝部分（会议轮次超时 ✓，任务超时规划 ✗） ｜ 可调控族：`vmu.control.*`／`vmu.limits.*` ｜ 错误码：`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：暂停**真门禁**（I-5 ✓）；恢复必须**逐条列出接回了什么**（`recover()` ✓） ｜ 依赖：控制面 ✓ ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **检查点 / 回滚 / 补偿** ｜ 目的：可回到"上一个确定状态" ｜ 面向谁：负责人／调度 ｜ 接口形状：规划＝`kernel.checkpoints.save/restore`＋补偿动作注册 ⛔ 未实现（当前只有 `tasks.rollback()`＝**阶段回滚** ✓，不是状态快照 ✗） ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_STORE_FAILED`／`VMU_IO_FAILED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：检查点＝**耐久投影**（复用 `vmu.store` ✓）；补偿**不得**自动删除别人的工作 ｜ 依赖：`vmu.store` ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **预算（令牌/墙钟/工具次数/子代理数）与配额公平** ｜ 目的：把"昂贵操作"变成可计量资源 ｜ 面向谁：使用者／调度 ｜ 接口形状：**已实现 ✓**＝`vmu.limits.*`（`maxParallel`／`toolCallsPerTurnCap`／`memoryCeilingMb`／`wallClockMs`／`maxLiveMembers` ✓）＋`VMU_RESOURCE_BUDGET` ✓；**公平/配额分配**＝规划 ✗ ｜ 可调控族：`vmu.budget.*`（规划）／`vmu.limits.*` ｜ 错误码：`VMU_RESOURCE_BUDGET` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**机器强制、不靠提示词**（v5r S25-D 纪律 ✓）；触界必须给"当前值＋上限"（`VMU_RESOURCE_BUDGET` 文案要求 ✓） ｜ 依赖：`vmu.limits` ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P0
- **看板列与 WIP 限制** ｜ 目的：限制在制品、暴露瓶颈 ｜ 面向谁：调度／主持人 ｜ 接口形状：规划＝`kernel.board.columns/wip` ⛔ 未实现（宿主面规划 `vibe_vmu_board`，⛔ 未实现） ｜ 可调控族：`vmu.board.*`（规划） ｜ 错误码：`VMU_RESOURCE_BUDGET`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：WIP 超限＝**拒绝把任务拉进该列**（不是自动丢弃）；列＝阶段机的一种视图（不重复造状态） ｜ 依赖：阶段机 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **角色与责任（RACI）** ｜ 目的：谁负责/谁批准/谁咨询/谁知会 ｜ 面向谁：任务负责人／上级 ｜ 接口形状：规划＝任务字段 `raci{}`＋`task.can-assign` 判定点 ⛔ 未实现 ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：RACI 只做**权限与提醒**，不额外制造审批层级；批准人缺位时的升级路径要写明 ｜ 依赖：席位 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **交接与升级（handover / escalation）** ｜ 目的：不让责任悬空 ｜ 面向谁：负责人／上级 ｜ 接口形状：**部分实现 ✓**＝`work.interrupt()`＋`recover()`＋任务简报 `brief()` ✓；**升级链**＝规划 ✗ ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_NO_SUCH_OBJECT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：交接必须写清"给谁、到什么时候、验收什么"；升级**只提醒，不自动改状态** ｜ 依赖：在途台账 ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P1
- **仲裁与冲突解决** ｜ 目的：两个成员僵住时有出路 ｜ 面向谁：主持人／上级 ｜ 接口形状：规划＝`kernel.arbitration.open/cite` ⛔ 未实现 ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：仲裁结论＝**决议**（进纪要），不得悄悄改任务；双方理由都留痕 ｜ 依赖：§2 会议＋§3 表决 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **审计追踪** ｜ 目的：可复核 ｜ 面向谁：全体／上级 ｜ 接口形状：**已实现 ✓**＝各服务的 `history()`／`status()`＋`status().auditTail` ✓＋落盘审计（`vmu/audit/<date>.jsonl` ✓）；**跨对象统一审计查询**＝规划 ✗ ｜ 可调控族：`vmu.audit.*`（规划）／`vmu.core.*` ｜ 错误码：`VMU_IO_FAILED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**拒绝也是审计对象**（I-3 ✓）；写盘失败必须具名（`audit.lastWriteError` ✓） ｜ 依赖：`vmu.store` ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P0
- **度量（吞吐/周期/积压）** ｜ 目的：看见瓶颈 ｜ 面向谁：主持人／上级 ｜ 接口形状：规划＝`kernel.metrics.window(ms)` ⛔ 未实现（当前只能从 `history()` 自行算 ✗） ｜ 可调控族：`vmu.metrics.*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：度量**只读**、可复算；**不得**用度量自动降级/惩罚（那会把统计变成策略 ✗） ｜ 依赖：审计 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **里程碑与交付物** ｜ 目的：让"到哪一步了"可见 ｜ 面向谁：主持人／上级 ｜ 接口形状：规划＝`kernel.milestones.declare/meet` ⛔ 未实现 ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_NO_SUCH_OBJECT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：里程碑＝**带到期与验收的标记**；达成须有证据（交付物 id） ｜ 依赖：库面 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **自动触发（时间/事件）** ｜ 目的：让"到点/出事"不必靠人记得 ｜ 面向谁：pack／用户 ｜ 接口形状：规划＝`kernel.scheduler.at/on(event)` ⛔ 未实现（内核**没有定时器** ✗ —— 心跳由调用方驱动 ✓，空闲触发需宿主 timer 服务 ⇒ 未接 ✗） ｜ 可调控族：`vmu.scheduler.*`（规划） ｜ 错误码：`VMU_ENGINE_UNAVAILABLE`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：触发**只发钩子/提示**，**不得**隐式推进流程（R10 同族 ✗）；时间源必须可注入（可复现 R12 ✓） ｜ 依赖：宿主 timer 服务／`clock` 注入 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **工作项模板** ｜ 目的：把常办事项固化 ｜ 面向谁：使用机构 ｜ 接口形状：规划＝`kernel.templates.register/instantiate` ⛔ 未实现 ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT`／`VMU_NO_SUCH_OBJECT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：模板＝**数据**（不是代码分支）；实例化必须留痕"用了哪个模板的哪一版" ｜ 依赖：任务台账 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **子任务与拆分** ｜ 目的：大任务拆小、并行推进 ｜ 面向谁：负责人 ｜ 接口形状：**部分实现 ✓**＝`deps[]` 已能表达层级（父 id 可作依赖 ✓）；**父子语义/汇总完成度**＝规划 ✗ ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_RESOURCE_BUDGET` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：拆分深度必须有上限（防爆炸）；父任务完成＝**所有子任务终态**（可换成判定点） ｜ 依赖：DAG ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P1
- **幂等与去重** ｜ 目的：重放安全 ｜ 面向谁：所有写路径 ｜ 接口形状：**已实现 ✓**＝写操作按 `traceId` 去重（I-6 ✓）；**跨会话幂等键**＝规划 ✗ ｜ 可调控族：`vmu.core.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**同一 traceId 不二次生效**；去重要留痕（"这是重复，未生效"）而不是静默 ✗ ｜ 依赖：审计 ✓ ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0

---

## 5. 控制流（Pause / Resume / Stop / 心跳）—— **实现现状（保留并扩写）✓**

| 动作 | 语义（真实现 ✓） | 证据／边界 |
|---|---|---|
| `kernel.pause(reason)` | 控制状态 → `paused`；**任务的新建与状态转换被具名拒** `VMU_STATE` ✓；会议召集/开轮/发言被拒 ✓；表决开板/投票被拒 ✓；发 `control/paused` ✓ | 场景见 `tests/vmu-kernel.test.mjs` V7 组 ✓ |
| `kernel.resume(reason)` | → `running`，回执带 `resumedFrom` ✓；发 `control/resumed` ✓ | 同上 ✓ |
| `kernel.stop(reason)` | → `stopped`，清空注册；发 `control/paused{reason:'stopped'}` ✓；**已停止不能再 pause** ✓ | 同上 ✓ |
| `kernel.beat(note)` | 心跳计数 + 时间戳；发 `control/heartbeat` ✓ | `status().control.beats/lastBeatAt` ✓ |
| `kernel.control()`／`status().control` | `{state, pausedAt, pausedReason, resumes, stops, beats, lastBeatAt, wallClockMs, sinceLastBeatMs, stale}` ✓ | **`vmu.limits.wallClockMs` 的真实消费者** ✓（超预算 ⇒ `stale:true` ✓） |
| 工具面 | `vibe_vmu_control {action:'status'|'pause'|'resume'|'stop'|'beat'}` ✓，**仅在声明 `control:` 时出现** ✓（零机制 ✓） | 场景见 `tests/vmu-entry.test.mjs` V7 组 ✓ |

### 5.1 暂停门禁范围矩阵（**必须逐处显式** ✓）

| 面 | 是否受 pause 门禁 | 证据 | 备注 |
|---|---|---|---|
| 任务：`create`／`transition` | **是 ✓** | 具名拒 `VMU_STATE` | 机器强制（I-5） |
| 会议：`convene`／`openRound`／`speak` | **是 ✓** | 同上 | 话语面也被冻结 |
| 表决：`open`／`cast` | **是 ✓** | 同上 | 冻结期与暂停**不是**一回事（§3.3） |
| 在途台账：`work.start` | **是 ✓** | `VMU_STATE` | 恢复后 `recover()` 可列回 |
| 归档/记录面：`library.append`／`record` | **否 ✗（尚未接）** | 不受 pause 影响 | 见 §9 未核项；风险：暂停期间仍可写库 |
| 设置面：`vibe_vmu_set` | **否 ✗** | 不受 pause 影响 | 设计取舍：管理面应可在暂停中修复配置 |

### 5.2 仍未实现（诚实 ✗）

- **判定点** `control.can-pause`／`on-idle`／`on-timeout`／`degrade` **不存在** ✗（暂停是框架动作，不是中间件判定点 ✓；要定制就在 `control/paused` 上挂观察型规则 ✓）；
- **没有定时器/看门狗**：心跳由调用方驱动 ✗（内核不自带 scheduler；"空闲触发"需宿主 timer 服务 ⇒ 未接 ✗）；
- **降级策略（degrade）**：预算触界后**只有拒**（`VMU_RESOURCE_BUDGET` ✓），没有"降级为只读/只报告"的档位 ✗；
- **暂停范围未覆盖归档面** ✗（见 §5.1）。

---

## 6. 控制流可定义性：用 settings ＋ 中间件把机制"定义/替换/组合"（本卷重点）

### 6.1 三类旋钮（**先想清楚动的是哪一类** ✓）

| 类别 | 谁能动 | 生效方式 | 典型对象 | 本卷的记账 |
|---|---|---|---|---|
| **设置旋钮（settings）** | 使用者／所办（按 `vmu.safety.*` 与 `whoMayOverride` 面） | 立刻／下轮／重启（按键声明 ✓） | 门槛、时长、上限、默认方法 | 通配族写在本卷；**具体键由 04 登记** ✓ |
| **判定点（中间件/pack 规则）** | pack 作者／中间件条目 | 替换谓词 ⇒ 行为改变（无需改内核） | `can-convene`、`round-complete`、`tally`、`gate` | 本卷给签名与默认 ✓（§1.3） |
| **结构声明（pack）** | 整合包 | 装载期生效（冲突即具名拒） | 会议类型、阶段列表、席位表、表决方法清单、钩子条目 | 本卷给"声明形状"，具体 manifest 归 10 号 ✓ |

### 6.2 内核机器强制清单（**中间件不可绕过** ✗ —— 谁想改就得改内核）

1. **拒绝不污染**（I-3）：被拒输入不进 `inputs`／不计票／不让成员变已回答；
2. **无隐式推进**（I-2）：轮次完成只能被**询问**（`roundComplete()` ✓），不得被超时/拒绝/发言次数推断；
3. **过程票不裁定**（I-1）：`kind:'process'` 永不产生 `outcome`；
4. **三值结论＋`undecided` 必带 reason**（I-4）；
5. **暂停真门禁**（I-5）：任务/会议/表决三条写路径都看 `isPaused()`；
6. **预算与容量强制**（`VMU_RESOURCE_BUDGET`）：并发/内存/工具次数/成员数——**在机器里，不在提示词里** ✓；
7. **依赖与阶段门**：未满足即拒（`VMU_STATE`），不得靠"成员自觉"；
8. **幂等去重**（I-6）：同一 `traceId` 不二次生效。

> **判据**：任何"能被中间件一句 `return true` 绕过"的强制点 ⇒ 该点**没被强制** ✗。以上 8 条都有具名场景（§8 门禁第 2/3/4 条 ✓）。

### 6.3 可被覆盖的点与覆盖顺序（**明确**，避免"谁能改"打架）

- **顺序（后者覆盖前者）**：`settings 默认值` → `pack（结构声明与默认规则）` → `中间件条目（判定点替换/观测）` → `调用方显式参数（单次操作）` ✓；
- **不可覆盖**：§6.2 的 8 条强制点 + §4 的"档级"（例如 `library` 的指纹单点、S21 头部列表不含正文 ✓）；
- **冲突纪律**：pack 与 pack 冲突 ⇒ `VMU_PACK_CONFLICT` ✓ 具名拒（不静默择一 ✗）；中间件拒绝 ⇒ `VMU_MIDDLEWARE_REJECTED` ＋ **必须给中间件 id** ✓。

### 6.4 组合配方（**用 settings＋中间件拼出机制**，每个都可复跑 ✓）

| # | 目标机制 | 组合方式（判定点 + 旋钮族） | 成熟度 |
|---|---|---|---|
| R1 | **冻结期不推进轮次**（v5r 教训的正面解） | `ballot.freeze()` ✓ ＋ `meeting.round-complete` 判定点：冻结中返回 `{complete:false, reason:'frozen'}` ✓ ＋ 会议侧 `isFrozen` 同源 | **可实现 ✓**（判定点已存在 ✓） |
| R2 | **表决期间禁止发言** | `ballot.frozen` 判定点 ＋ `meeting.round-complete` 同步冻结 ＋ 冻结中 `speak()` 由中间件拒绝（`ballot/cast` 同源 ✓） | **部分 ✓**（会议侧冻结联动＝规划 ✗） |
| R3 | **法定人数流失后降门槛** | `meeting.quorum` 判定点（规划 ✗）＋ 门槛族通配 ＋ 流失事件钩子（规划 ✗） | 规划 ✗ |
| R4 | **IRV 计票** | `ballot.cast-valid` 接受排序票（规划 ✗）＋ `ballot.tally` 换成 IRV（**判定点已存在 ✓**） | 判定点 ✓／票形态 ✗ |
| R5 | **看板 WIP 限流** | `task.can-transition` 判定点（规划 ✗）＋ `vmu.board.*`（规划）＋ 超限即拒（`VMU_RESOURCE_BUDGET` ✓ 可复用） | 规划 ✗ |
| R6 | **按角色限权开会** | `meeting.can-convene` 判定点（**已存在 ✓**）＋ `vmu.members.may()` ✓ ＋ pack 声明席位 | **可实现 ✓** |
| R7 | **决议即冻结（结论后不得改票）** | `ballot.reopen()` 门槛（复议门槛族）＋ `ballot.can-open` 检查上游结论 | 部分 ✓（`reopen` ✓／门槛规划 ✗） |
| R8 | **紧急闭门会** | `meeting.confidentiality` 判定点（规划 ✗）＋ `can-convene`（已存在 ✓）＋ 库面引用折叠 | 规划 ✗ |

### 6.5 热改等级与"谁可改"（**按类给，不逐键**）

| 类 | 默认热改等级 | 谁可改 | 理由 |
|---|---|---|---|
| 时长/上限（预算、超时、配额） | **立即**（下一条指令即生效 ✓） | 所办／获授权者 | 与 v5r 纪律一致：机器强制且即时 |
| 门槛/方法（quorum、多数制、复议门槛） | **下一轮/下一次表决** | 所办＋pack 默认 | 不可在"正在进行的表决"中途改（防作弊 ✗） |
| 结构（阶段表、席位、会议类型、钩子条目） | **装载期/重启** | pack 作者／所办 | 结构变更走迁移（13 号） |
| 观察型（审计级别、度量窗口） | 立即 | 所办 | 无副作用 |
| 强制点（§6.2） | **不可改** ✗ | 无人 | 它们是"机器可信"的底线 |

---

## 7. 与工作流脚本（M3）、packs、中间件的关系

- 内核提供**桥**：脚本可 `await kernel.meeting(...)`／`kernel.ballot(...)`／`kernel.tasks.transition(...)`／`kernel.library.append(...)`（全部公开服务 ✓）；脚本面工具 `vibe_vmu_script`（`list|run` ✓，结果**只回调用方**，不进提示词 ✓）。
- **长流程**（扇出/扇入）用脚本；**短判定**用 M1/M2（避免"小题大做" ✓）。
- **pack**：声明会议类型、阶段表、席位与规则；**不得**绕过 §6.2 强制点 ✗。
- **中间件**：接判定点、观测钩子、拒绝并留痕；**不得**直接改内核状态（只能经内核按裁决执行 ✓）。

---

## 8. 门禁（本篇验收判据，**机器可判定**）

1. **零策略**：内核里找不到任何"门槛/完成条件"的硬编码 ⇒ 静态门（R1）＋ 代码评审；
2. **判定点可接管**：每个**已实现**判定点都有"中间件接管后行为改变"**与**"不接管用默认"两个场景 ✓（未实现判定点必须列在 §9，不得写成可用 ✗）；
3. **拒绝不污染**：被拒/被冻结的操作**不写入** `inputs`／票数／已完成集合（v5r 教训的回归测试 ✓）；
4. **完成判定正确**：冻结期场景 ⇒ 轮次**不得推进**（v5r `s8-freeze-say` 的等价场景 ✓）；
5. **结论三值**：`undecided` 必带原因；过程票不构成裁定（`kind:'process'` 断言 ✓）；
6. **控制流一致**：pause/resume/stop 后无幽灵在飞；待续标记清/留行为符合 `07-§3` ✓；暂停门禁范围与 §5.1 矩阵**逐格一致** ✓；
7. **可复现**：注入时钟下同 seed 两次会议/表决序列一致（R12）；
8. **记账一致**（本卷特有）：本卷提到的每个**已实现**符号（服务方法/工具/钩子/判定点/码）都能在 03/04/05 找到登记 ✓；每个**未实现**项都在 §9 或本卷行内带标记 ✓。

> **机器可判定要求**：上述每条都要能指出对应的**断言**与**具名红**；判定点都要有"接管后行为改变／不接管用默认"两个可复跑**场景** ✓。

---

## 9. 未核项（必须保留；本版扩写）

- **判定点的可接管性未实测**：本卷的"每个判定点都能被中间件接管"是**设计承诺** ⇒ 需 P1/P2 用"接管后行为改变＋不接管用默认"两场景证明；**当前只有会议 4 个与表决 5 个判定点存在于代码** ✓，其余全为规划 ✗。
- **v5r 等价场景尚未建立**：`s8-freeze-say`（冻结期误收束）的等价回归场景**待写** ⇒ 它是 I-1/I-2 不变量的首个回归证据。
- **议程/动议/席位是否升为一等实体**：本卷按"应当升为一等实体"设计（§2.2-A/B/C）✗，但与 v5r-pack 映射时的兼容代价**未核** ⇒ 需裁。
- **会议与阶段机的交互**：会议是否可作为任务阶段推进的条件（"开完会才能进下一阶段"）**未定**。
- **归档面是否纳入暂停门禁**：`library.append` 当前不受 pause 影响 ✗ ⇒ 是否该拒（或只警告）**未定**（§5.1）。
- **三层门槛的默认值**：法定人数、最少收集票、通过条件的**默认值**未定（本卷只定"必须分开、必须事先写明" ✓）。
- **方法族的默认**："默认一致制"是否在通用场景过严 ⇒ 需与 v5r 口径对照后裁。
- **度量与自动触发的边界**：度量是否允许触发自动动作（本卷建议**不允许**，只允许发钩子/提示 ✓）⇒ 待裁。
- **配额公平的实现位置**：放在 `vmu.budget.*`（新族）还是复用 `vmu.limits.*` ⇒ 需裁。

> **未核登记处**：以上各项应并入 `14-§2`（U 系列）与 `14-§1`（O 系列）✓；本卷不自行改 14 ✗。

---

## 10. 字段级 Schema（**落实现行照此建对象**）

> 约定：`✓`＝当前代码已有该字段；`✗`＝规划字段（落地前不得依赖）。所有耐久对象必须**可 JSON 序列化**（03-§2.1 纪律 ✓）。

### 10.1 Meeting（会议）

| 字段 | 类型 | 必填 | 语义 | 谁写 | 成熟度 |
|---|---|---|---|---|---|
| `id` | string | ✓ | 会议标识（`m-<n>` 或调用方给 ✓） | 内核 | ✓ |
| `kind` | string | ✓ | 会议类型（默认 `'general'` ✓；类型目录见 §15） | 召集人 | ✓ |
| `agenda` | string\|null | — | 议程（**当前是一段文本** ✗） | 召集人 | 部分 ✓ |
| `agendaItems[]` | object[] | — | 一等议程条目（§10.2） | 召集人 | ✗ |
| `roster[]` | string[] | ✓ | 在册被问者（`convene` 时固定 ✓） | 召集人 | ✓ |
| `state` | enum | ✓ | `idle｜convened｜in_session｜closed`（＋规划：`recessed｜adjourned`） | 内核 | ✓ |
| `rounds[]` | object[] | ✓ | 每轮：`{n, ask, asked[], answers{}, silent[], refused[], openedAt}` ✓ | 内核 | ✓ |
| `inputs{}` | member→string | ✓ | **只写被接受**的输入（I-3 ✓） | 内核 | ✓ |
| `silent{}` | member→{at,reason} | ✓ | 显式沉默（**终态**，可结算 ✓） | 成员/内核 | ✓ |
| `refused{}` | member→{at,reason}[] | ✓ | 被拒记录（**不消费回答** ✓） | 内核 | ✓ |
| `hands[]` | {member,round,at}[] | ✓ | 举手队列（插入顺序 ✓） | 成员 | ✓ |
| `history[]` | object[] | ✓ | 全量留痕（含 `convene-refused／round-refused／input-refused／input-accepted／member-silent／hand-up／hand-refused／close-refused／close-forced／closed` ✓） | 内核 | ✓ |
| `closedReason` | string\|null | — | 收束原因 ✓ | 内核 | ✓ |
| `chair` | string | — | 主持人（**规划** ✗：当前无主持字段，"主持人"是 pack 的角色约定） | 召集人 | ✗ |
| `quorum` | object | — | `{required,have,met,lostPolicy}`（规划 ✗） | 内核 | ✗ |
| `attendance{}` | member→enum | — | `present｜absent｜late｜left_early｜excused`（规划 ✗） | 内核 | ✗ |
| `confidentiality` | enum | — | `open｜closed｜sealed`（规划 ✗） | 召集人 | ✗ |
| `budget` | object | — | `{turnsUsed,tokensUsed,wallMsUsed,limitsRef}`（规划 ✗；当前预算在 `vmu.limits`／`vmu.meetings` ✓） | 内核 | 部分 ✓ |
| `parentId` | string\|null | — | 母会（并行多会/委员会，规划 ✗） | 内核 | ✗ |
| `minutesId` | string\|null | — | 关联纪要（规划 ✗） | 内核 | ✗ |

### 10.2 AgendaItem（议程条目，规划 ✗）

| 字段 | 类型 | 语义 | 备注 |
|---|---|---|---|
| `id` | string | 条目 id | 可被任务/决议/表决引用 |
| `meetingId` | string | 所属会议 | 跨会带出时**新建**条目并记 `carriedFrom` |
| `order` | number | 顺序 | 可重排（须留痕） |
| `title` / `text` | string | 标题与正文 | 讨论对象 |
| `owner` | string\|null | 负责人/报告人 | 缺省＝主持人 |
| `timeboxMs` | number | 时间箱 | 0＝不限 |
| `state` | enum | `pending｜discussing｜settled｜tabled｜deferred｜carried` | 与动议状态联动 |
| `materials[]` | string[] | 材料引用 | 指向库/文件 |
| `linkedTaskIds[]` | string[] | 关联任务 | 会后执行项 |
| `carriedFrom` | string\|null | 上次带出源 | 延会/搁置带出用 |

### 10.3 Motion（动议，规划 ✗）

| 字段 | 类型 | 语义 |
|---|---|---|
| `id` | string | 动议 id |
| `meetingId` / `agendaItemId` | string | 归属 |
| `kind` | enum | `substantive｜procedural｜privileged｜amendment` |
| `text` | string | 动议正文（**内容字段必填** ✗ 不得裸动作） |
| `by` | string | 提案人 |
| `seconders[]` | string[] | 附议人（**附议不是票** ✓） |
| `threshold` | number | 需要的附议数（规则给） |
| `deadlineMs` | number | 无附议失效时限 |
| `state` | enum | `proposed｜seconded｜tabled｜withdrawn｜voting｜adopted｜rejected｜undecided｜expired` |
| `supersededBy` | string\|null | 被修正/取代链（**只标注链，不覆盖历史** ✓） |
| `history[]` | object[] | 全量留痕 |

### 10.4 Ballot（表决）

| 字段 | 类型 | 必填 | 语义 | 成熟度 |
|---|---|---|---|---|
| `target` | string | ✓ | 表决对象（命题/提案/人选） ✓ | ✓ |
| `state` | enum | ✓ | `closed｜open｜frozen｜tallied` ✓ | ✓ |
| `frozen` | boolean | ✓ | 是否冻结 ✓ | ✓ |
| `quorumRule` | string | ✓ | 门槛规则名（默认 `'m-unanimous'` ✓；用户设置键来自 `vmu.meetings.*` ✓） | ✓ |
| `eligible[]` | string[] | ✓ | 有表决权者（空＝全部在册 ✓） | ✓ |
| `votes{}` | member→{value,kind,at} | ✓ | 票（`kind: decisive｜process` ✓；规划 `abstain`） | 部分 ✓ |
| `voteCount` / `byKind{}` | number / object | ✓ | 计数（**不裁定** ✓） | ✓ |
| `outcome` | object\|null | ✓ | `{outcome,reason,detail,at}`（三值 ✓） | ✓ |
| `refused[]` | object[] | ✓ | 被拒投票（含原因 ✓） | ✓ |
| `openedAt` / `closedAt` | ISO string | ✓ | 时间戳（注入时钟 ✓） | ✓ |
| `method` | enum | — | `unanimous｜simple｜absolute｜relative｜two-thirds｜irv｜condorcet｜borda｜approval｜quadratic｜quota`（规划 ✗；规则名可与 `quorumRule` 合并） | ✗ |
| `secrecy` | enum | — | `named｜secret｜mixed`（规划 ✗） | ✗ |
| `recusals[]` | string[] | — | 回避名单（规划 ✗；`eligible` 已能表达 ✓） | 部分 ✓ |
| `proxy{}` | object | — | 委托链（规划 ✗；本卷建议默认禁用） | ✗ |
| `rounds[]` | object[] | — | 多轮记录（规划 ✗；`reopen()` 已能重开但不记轮次 ✓） | 部分 ✓ |
| `audit` | object | — | 复算快照（规划 ✗） | ✗ |

### 10.5 Task / WorkEntry / Board（任务·在途·看板）

| 对象 | 字段（✓ 实有／✗ 规划） |
|---|---|
| `Task` ✓ | `id, title, objective?, owner?, deps[], priority?, state, stage?, brief?, history[], createdAt` ✓ |
| `Task`（规划 ✗） | `due?, raci{}, wipColumn?, checkpoints[], retry{}, gates{}, subtasks[], templateId?` |
| `WorkEntry` ✓ | `id, owner, kind, objective, state(pending/settled/interrupted), outcome?, at` ✓ |
| `Board`（规划 ✗） | `columns[{id,name,wipLimit,order}], swimlanes[], agingWarnMs` |
| `Checkpoint`（规划 ✗） | `id, taskId, at, projectionHash, restoreOf?` |
| `Trigger`（规划 ✗） | `id, at|on(hook), action(prompt|hook), enabled, lastFiredAt` |

### 10.6 Minutes / Verbatim（纪要·逐字稿，规划 ✗）

| 对象 | 字段 |
|---|---|
| `Minutes` | `id, meetingId, at, confirmedAt?, attendance{}, agendaOutcomes[], motions[], ballots[], resolutions[], actions[{who,due,state}], dissent[], refused[], materials[], verbatimRef?` |
| `Verbatim` | `meetingId, entries[{at,member,text,quotes[],folded[]}], redactions[]`（默认关闭；开启则必须可引用、可裁剪） |

---

## 11. 接口签名草案（**服务方法 · 工具参数 · 钩子 payload · 协议**）

> 纪律：本节给的是**草案**；落地时必须回填 `03-§2/§3`（服务/工具）与 `05-§4`（钩子）——**本节不是登记处** ✓。已实现者标 ✓，规划者标 ✗ 并在行内带标记词。

### 11.1 已实现的服务方法签名 ✓（**与代码一致**）

| 服务 | 签名（参数 → 返回） |
|---|---|
| `vmu.tasks` | `create({title,objective?,owner?,deps?,priority?})→{ok,id,state}`／`assign(id,who)`／`transition(id,to,{reason})`／`advance({to,reason})`／`rollback({reason})`／`brief(id)`／`briefOf(id)`／`clearBrief(id)`／`history(id?)`／`status()` |
| `vmu.work` | `start({owner,kind,objective})→{ok,entry}`／`settle(id,{outcome})→{ok,settled,remaining}`／`interrupt(id,reason)`／`recover({reason})→{ok,recovered,entries[]}`／`list()`／`pending()`／`interrupted()`／`status()` |
| `vmu.members` | `roles()`／`roster()`／`hire({id,slot})`／`assignRole(id,slot)`／`end(id,reason)`／`wake(id,ask,{role?,phase?})`／`may(id,permission)`／`status()` |
| 会议原语 ✓ | `kernel.meeting(opts)` → `{convene,openRound,speak,refuseInput,markSilent,handUp,roundComplete,close,summary,status,history}` |
| 表决原语 ✓ | `kernel.ballot(opts)` → `{open,freeze,unfreeze,cast,close,reopen,status,history,processReadings}` |
| 活对象寻址 ✓ | `kernel.liveMeeting(id)`／`kernel.liveBallot(id)`／`kernel.liveList()`（`cap` 与 `evicted` 计数 ✓） |

### 11.2 已实现的工具参数 ✓

| 工具 | 参数（宿主视图） | 动作 |
|---|---|---|
| `vibe_vmu_meeting` ✓ | `action`(必填)、`id`、`ballotId`、`member`、`text`、`target`、`value`、`kind`、`reason`、`agenda`、`roster` | `list｜open｜speak｜silent｜close｜ballot｜vote｜tally｜reopen` ✓ |
| `vibe_vmu_task` ✓ | `action`(必填)、`id`、`title`、`objective`、`owner`、`deps`、`to`、`reason` | `list｜create｜assign｜transition｜stage｜advance｜brief｜history` ✓ |
| `vibe_vmu_control` ✓ | `action`(必填)、`reason`、`note` | `status｜pause｜resume｜stop｜beat` ✓ |

### 11.3 规划中的工具与参数（**全部未实现** ✗）

| 工具（规划，⛔ 未实现） | 参数草案 | 覆盖的广度项 |
|---|---|---|
| `vibe_vmu_motion`（⛔ 未实现，roadmap） | `action:'propose'\|'second'\|'withdraw'\|'table'\|'untable'\|'amend'\|'list'`、`id`、`kind`、`text`、`why` | 动议/附议/撤回/搁置/修正案 |
| `vibe_vmu_agenda`（⛔ 未实现，roadmap） | `action:'add'\|'update'\|'remove'\|'reorder'\|'split'\|'merge'\|'list'`、`id`、`title`、`text`、`owner`、`timeboxMs`、`order` | 议程条目与拆分合并 |
| `vibe_vmu_attendance`（⛔ 未实现，roadmap） | `action:'mark'\|'list'\|'quorum'`、`member`、`status` | 在场/法定人数/流失后处理 |
| `vibe_vmu_minutes`（⛔ 未实现，roadmap） | `action:'draft'\|'confirm'\|'expand'\|'list'`、`id`、`detail` | 纪要与上次确认 |
| `vibe_vmu_committee`（⛔ 未实现，roadmap） | `action:'spawn'\|'report'\|'list'`、`parentId`、`roster`、`agenda` | 委员会/子会/全体委员会 |
| `vibe_vmu_board`（⛔ 未实现，roadmap） | `action:'columns'\|'wip'\|'move'\|'metrics'`、`column`、`limit` | 看板列与 WIP |
| `vibe_vmu_workflow`（⛔ 未实现，roadmap） | `action:'deps'\|'gate'\|'retry'\|'checkpoint'\|'compensate'`、`id`、`to`、`reason` | DAG/门/重试/检查点 |
| `vibe_vmu_budget`（⛔ 未实现，roadmap） | `action:'status'\|'reserve'\|'release'`、`scope`、`amount` | 预算与配额公平 |
| `vibe_vmu_scheduler`（⛔ 未实现，roadmap） | `action:'at'\|'on'\|'list'\|'cancel'`、`at`、`event`、`action` | 自动触发 |
| `vibe_vmu_metrics`（⛔ 未实现，roadmap） | `action:'window'\|'throughput'\|'cycle'\|'backlog'`、`windowMs` | 度量 |
| `vibe_vmu_audit`（⛔ 未实现，roadmap） | `action:'trace'\|'recount'\|'export'`、`id`、`from`、`to` | 审计与复算 |

### 11.4 钩子 payload 草案（✓＝已注册；✗＝规划）

| 钩子 | payload（草案） | 可否拒绝 | 成熟度 |
|---|---|---|---|
| `meeting/round-start` | `{id,kind,agenda,round}` | **可拒绝**（拦下＝本轮不开 ✓） | ✓ |
| `meeting/round-end` | `{id,reason,rounds}` | 观测型 | ✓ |
| `ballot/cast` | `{target,member,value,kind}` | **可拒绝**（票不入账 ✓） | ✓ |
| `ballot/tally` | `{target,votes,eligible,quorumRule}` | **可覆盖计票**（`decision.tally` ✓） | ✓ |
| `task/assign` | `{task,who,by}` | 可拒绝 | ✓ |
| `task/transition` | `{task,from,to,reason}` | 可拒绝 | ✓ |
| `settle/before` / `settle/after` | `{reason,entries}` | 观测型 | ✓ |
| `control/paused` / `control/resumed` / `control/heartbeat` | `{reason,state,beats}` | 观测型 | ✓ |
| `meeting/convened`／`meeting/opened`／`meeting/speech-requested`／`meeting/speech-granted`／`meeting/interrupted`／`meeting/motion`／`meeting/seconded`／`meeting/amendment`／`meeting/recess`／`meeting/resumed`／`meeting/adjourned`／`meeting/minutes-drafted` | 见 §10 字段（✗ 规划） | 视点而定 | ✗ |
| `ballot/opened`／`ballot/frozen`／`ballot/unfrozen`／`ballot/closed`／`ballot/reopened`／`ballot/audited` | 见 §10.4 | 部分可拒绝 | ✗ |
| `task/created`／`task/deps-changed`／`task/gate-check`／`task/retry`／`task/checkpoint`／`task/escalated` | 见 §10.5 | 部分可拒绝 | ✗ |
| `board/wip-exceeded`／`budget/warn`／`trigger/fired`／`committee/formed`／`committee/reported` | 见 §10.5 | 观测型 | ✗ |

**钩子纪律**：① 未注册的钩子**不得**写成"已生效" ✗（05-§4 是登记处）；② 拒绝型钩子必须**具名**（`VMU_MIDDLEWARE_REJECTED` ＋ 中间件 id ✓）；③ 观测型钩子**不得**返回"拒绝"来偷偷改变流程 ✗（要改就换判定点）。

### 11.5 协议（会议与表决的交互序列，**权威在 §6.2 强制点**）

```
① 召集：can-convene 判定 → convene() → state=convened
② 开轮：meeting/round-start 钩子（可拒） → openRound({ask}) → 逐人 deliver（无接缝 ⇒ VMU_ENGINE_UNAVAILABLE ✓）
③ 发言：handUp()（hand-policy）→ speak()（暂停门 → 轮次超时门 → 引用条数/深度门）→ inputs 写入
        被拒 → refuseInput()：**不写 inputs、不进票、不算已回答**
④ 完成：roundComplete() 判定（**只问不推**）→ 未完成则继续/沉默/放弃
⑤ 表决：ballot.can-open 判定 → open() → cast()（暂停门／冻结门／资格门／重复门／形状门）
        → freeze()/unfreeze()（冻结中投票：具名拒且不入票）
        → close() → ballot/tally 钩子（可覆盖计票）→ 三值结论（undecided 必带 reason）
⑥ 收束：close-policy 判定 → 未完成轮次默认拒 → force 才关（记 by/why）
⑦ 收尾：summary() → 纪要（规划）→ 行动项进任务（已实现 ✓）
```

---

## 12. 参数族总表（**可调控性核心**：族 × 旋钮 × 默认 × 域 × 热改 × 谁可改 × 成熟度）

> **记账纪律**：本表只写**通配族**（`vmu.<ns>.*` 或 `vmu.<ns>.<name>*`）——**具体键名不写在本卷** ✗。落地时逐条登记进 `04-settings.md`（含类型/默认/域），并由该表声明"已接线/未接线" ✓。
> 域写法：`bool`／`int≥0`／`ms`／`enum(...)`／`string[]`／`0..1`／`对象`。热改：`立即`／`下轮`／`重启`。谁可改：`所办`／`pack`／`获授权者`。

### 12.1 会议族（`vmu.meetings.*`；已登记的既有键是本族基线 ✓）

| 族（通配） | 旋钮（语义） | 默认 | 域 | 热改 | 谁可改 | 成熟度 |
|---|---|---|---|---|---|---|
| `vmu.meetings.round*` | 单轮超时／超时行为 | 0＝不限 ✓（`roundTimeoutMs` 已登记已接线 ✓） | ms | 立即 | 所办 | 部分 ✓ |
| `vmu.meetings.quote*` | 每条引用条数上限／深度上限（**条数拒、深度折** ✓） | 2／3 ✓ | int≥0 | 立即 | 所办 | ✓ |
| `vmu.meetings.quorum*` | 法定人数口径/阈值/流失后处理/复算周期 | 未声明（pack 定 ✓） | 对象/enum | 下轮 | pack＋所办 | 部分 ✓ |
| `vmu.meetings.speech*` | 单人时间箱／发言次数／延长步长／到点行为 | 0＝不限 | ms/int/enum | 立即 | 所办 | ✗ |
| `vmu.meetings.order*` | 发言顺序模式（`hands｜round-robin｜seat｜weighted｜unspoken-first`） | `hands` | enum | 下轮 | 所办 | ✗ |
| `vmu.meetings.interrupt*` | 允许的打断类型与配额 | `off` | enum/int | 立即 | 主持人 | ✗ |
| `vmu.meetings.motion*` | 附议阈值／失效时限／可否撤回／特权动议白名单 | 1／0／true／[] | int/ms/bool/string[] | 下轮 | pack | ✗ |
| `vmu.meetings.amend*` | 友好修正是否直接并入／实质改动表态方式 | `true`／一次表态 | bool/enum | 下轮 | 主持人 | ✗ |
| `vmu.meetings.committee*` | 子会数量上限／委员会是否有报告义务 | 0／true | int/bool | 重启 | 所办 | ✗ |
| `vmu.meetings.recess*` | 休会上限／复会是否需要动议 | 0／false | ms/bool | 立即 | 主持人 | ✗ |
| `vmu.meetings.appeal*` | 申诉受理范围／时限／是否必须给理由 | 程序异议／0／true | enum/ms/bool | 立即 | 所办 | ✗ |
| `vmu.meetings.discipline*` | 警告/静默/驱逐的阈值与申诉窗口 | `off` | enum/ms | 立即 | 主持人 | ✗ |
| `vmu.meetings.emergency*` | 特权动议允许的情形与留痕级别 | `[]` | string[] | 下轮 | pack | ✗ |
| `vmu.meetings.confidentiality*` | 闭门级别／条目可见性／引用折叠 | `open` | enum | 下轮 | 主持人 | ✗ |
| `vmu.meetings.verbatim*` | 逐字稿开关／保留期／可裁剪 | `off` | bool/ms | 立即 | 所办 | ✗ |
| `vmu.meetings.budget*` | 会议级回合/令牌墙钟预算与触界行为（**触界只广播，不自动散会** ✗） | 未声明 | 对象 | 立即 | 所办 | ✗ |
| `vmu.meetings.chair*` | 主持中立约束／交接是否需要留痕 | `true`／true | bool | 立即 | pack | ✗ |

### 12.2 议程/动议/席位/在场族

| 族 | 旋钮 | 默认 | 域 | 热改 | 谁可改 | 成熟度 |
|---|---|---|---|---|---|---|
| `vmu.agenda.*` | 条目上限／必须带负责人／时间箱必填／拆分深度 | 0／false／false／1 | int/bool | 下轮 | 所办 | ✗ |
| `vmu.motions.*` | 附议规则／搁置上限／修正案形状／特权动议 | 见 12.1 | enum/int | 下轮 | pack | ✗ |
| `vmu.attendance.*` | 未答默认／迟到阈值／离席认定／唤醒失败语义 | `unanswered`／0／`auto`／`unreached≠against` | enum/ms | 立即 | 所办 | ✗ |
| `vmu.committees.*` | 委员会类型／报告格式／并会上限 | `[]` | string[] | 重启 | pack | ✗ |
| `vmu.minutes.*` | 纪要详略／必须含被拒项／上次确认是否强制 | `normal`／true／false | enum/bool | 下轮 | 所办 | ✗ |
| `vmu.verbatim.*` | 逐字稿开关／脱敏规则 | `off` | bool/对象 | 立即 | 所办 | ✗ |

### 12.3 表决族（`vmu.ballot.*`）

| 族 | 旋钮 | 默认 | 域 | 热改 | 谁可改 | 成熟度 |
|---|---|---|---|---|---|---|
| `vmu.ballot.method*` | 表决方法族（一致/简单/绝对/相对/2-3/配额/IRV/孔多塞/博达/批准/二次） | `unanimous`（**当前唯一实现** ✓，其余 ✗） | enum | 下一次 | pack＋所办 | 部分 ✓ |
| `vmu.ballot.quorum*` | 本次投票成立门槛（**与法定人数分开** ✗） | 未声明 | int/0..1 | 下一次 | 主持人 | ✗ |
| `vmu.ballot.rounds*` | 多轮上限／淘汰规则 | 1 | int/enum | 下一次 | 主持人 | ✗ |
| `vmu.ballot.secrecy*` | 记名/不记名/混合；不记名仍留档 | `named` | enum | 开票前 | 主持人 | ✗ |
| `vmu.ballot.abstain*` | 是否允许弃权／弃权是否计入门槛 | 允许／计入已投不计选项 | bool | 开票前 | 主持人 | ✗ |
| `vmu.ballot.recuse*` | 回避申报方式／是否公开 | `declare`／公开 | enum/bool | 开票前 | 主持人 | ✗ |
| `vmu.ballot.proxy*` | 是否允许代理/委托链（**本卷建议默认禁用** ✗） | `off` | enum | 开票前 | 所办 | ✗ |
| `vmu.ballot.veto*` | 否决权（**本卷建议默认不纳入** ✗） | `off` | enum | 下一次 | 所办 | ✗ |
| `vmu.ballot.freeze*` | 冻结触发（手动/事件）／是否联动会议轮次 | 手动／true（联动＝规划 ✗） | enum/bool | 立即 | 主持人 | 部分 ✓ |
| `vmu.ballot.reopen*` | 复议门槛／发起人范围／时限 | 未声明（pack ✓） | int/enum/ms | 下一次 | pack＋所办 | 部分 ✓ |
| `vmu.ballot.audit*` | 复算是否只读／审计保留期 | true／未声明 | bool/ms | 立即 | 所办 | ✗ |

### 12.4 工作流/看板/预算/控制/触发族

| 族 | 旋钮 | 默认 | 域 | 热改 | 谁可改 | 成熟度 |
|---|---|---|---|---|---|---|
| `vmu.workflow.*` | 依赖类型矩阵／门类型／重试退避／超时／升级链／检查点周期 | 最保守（无重试、无自动升级） | 对象/enum/ms | 重启/下轮 | pack＋所办 | ✗ |
| `vmu.board.*` | 列定义／WIP 上限／泳道／老化提醒 | 无列（零机制 ✓） | 对象/int/ms | 立即 | 所办 | ✗ |
| `vmu.budget.*` | 令牌/回合/子代理配额与公平策略（**机器强制** ✓ 原则） | 未声明 | 对象 | 立即 | 所办 | ✗ |
| `vmu.control.*` | 暂停范围／看门狗间隔／空闲策略／降级档位 | 未声明（无定时器 ✗） | 对象/ms | 立即 | 所办 | ✗ |
| `vmu.scheduler.*` | 触发器（时间/事件）与动作（发钩子/提示） | `[]` | 对象[] | 立即 | 所办 | ✗ |
| `vmu.metrics.*` | 度量窗口／指标白名单／是否允许触发动作 | 未声明／**不允许触发** ✗ | ms/string[]/bool | 立即 | 所办 | ✗ |
| `vmu.audit.*` | 审计级别／导出范围／复算权限 | 未声明 | enum/string[] | 立即 | 所办 | ✗ |
| `vmu.arbitration.*` | 仲裁是否强制／结论是否进纪要 | `off`／true | enum/bool | 下轮 | 所办 | ✗ |
| `vmu.templates.*` | 工作项模板库与默认模板 | `[]` | 对象[] | 重启 | pack | ✗ |

### 12.5 参数族与"四条哲学"的对应（**一句话**）

- **自由度**：所有族的默认值都是"不做事"（0／`off`／未声明）⇒ 不配置＝零机制 ✓；
- **可调控性**：每族都给了"热改等级＋谁可改"⇒ 使用者可预期改动的影响面 ✓；
- **可定义性**：凡是"规则"都落在判定点（§1.3）或 pack 声明（§6.1）⇒ 不需要改内核 ✓；
- **扩展性**：新方法/新门/新触发器只需**加一族数据＋一个判定点实现** ✓。

---

## 13. 算法与流程细化（**实现要点级**，可直接照写）

### 13.1 门槛判定流程（三层，顺序固定 ✓）

```
check(ballot, meeting):
  1) quorum:  have = |present|; required = rule(quorum.*)
             if !met → 只能 {recess | defer | lowerThreshold(事先写明) | undecided}
             （**不得**自动通过/否决 ✗）
  2) pollAlive: cast = |votes|（含弃权，排除未表态）; min = rule(ballot.quorum.*)
             if cast < min → {outcome:'undecided', reason:'poll did not reach its floor'}
             （**不得**用剩余票推断 ✗）
  3) passage: tally(votes, eligible, method) → true | false | undecided(reason 必填)
```
**不变量**：任一步的"没达"都**不改变**前一步的事实；三值结论只在第 3 步产生 ✓。

### 13.2 计票算法族（**每种都必须自带并列/未达规则**）

| 方法 | 算法要点 | 并列处理 | 未达处理 | 成熟度 |
|---|---|---|---|---|
| 一致制（当前 ✓） | 全 1 ⇒ true；全 0 ⇒ false；否则 undecided | 分裂＝undecided | 有人未投 ⇒ undecided | ✓ |
| 简单/绝对/相对/2-3 | 有效票的计数比 | 事先写明的 tie-rule | 未达门槛 ⇒ undecided | ✗ |
| IRV | 一轮收集排序票；逐轮淘汰末位 | 末位并列 ⇒ 事先规则（同时淘汰/抽签须禁用） | 无多数 ⇒ undecided | ✗ |
| 孔多塞 | 两两对决矩阵；寻找全胜者 | 无全胜者 ⇒ 最小败者集（Schulze 等）须声明 | 循环 ⇒ undecided | ✗ |
| 博达 | 位置权重求和 | 并列 ⇒ 事先规则 | — | ✗ |
| 批准 | 统计被批准数 | 并列 ⇒ 事先规则 | — | ✗ |
| 二次投票 | 票力预算平方成本 | — | 预算不足 ⇒ 拒绝该票 | ✗ |
| 配额制 | 达到配额即当选 | 剩余席位规则须声明 | — | ✗ |

> **纪律**：**排序型方法必须"一次收集、一次计票"**（避免多轮投票拖死 run ✗）；**任何方法都不得把未表态折算成任何一票** ✓。

### 13.3 冻结联动算法（v5r 教训的正面解）

```
freeze(ballot):
  ballot.freeze(reason) ✓                # 投票：具名拒且不入票 ✓
  meeting.speechFrozen = true            # 会议侧联动（规划 ✗）
  meeting.roundCompact = () => ({complete:false, reason:'frozen'})   # 判定点：**不推进** ✓
  bus.emit('ballot/frozen', …)           # 规划钩子 ✗
unfreeze:
  反向；**已拒的票不补记**（拒绝就是拒绝 ✓）
```
**判据**：冻结期间 `roundComplete()` 必须返回 `complete:false`（否则回到 `s8-freeze-say` ✗）。

### 13.4 DAG 环检测与依赖判定

```
addDep(task, dep):
  if reachable(dep → task) → refuse('VMU_STATE', 'dependency cycle')     # 成环即拒 ✓
ready(task) = deps.every(d => terminal(d))                               # 硬依赖 ✓
softDep: 只提示（进 brief），不阻止 start（规划 ✗）
```

### 13.5 重试与退避（规划 ✗，但给死参数形状）

```
attempt(n):  backoff = min(base * 2^(n-1), cap) * (1 ± jitter)   # 有界 ✓
giveUp(n > max) → escalate(owner→上级)（升级**只提醒**，不改状态 ✗）
禁止：无界 while(true) ✗；禁止用"时间到"隐式推进状态（R10 同族 ✗）
```

### 13.6 复算（recount）算法（规划 ✗）

```
recount(ballotId):
  1) 取 history() 的全部 cast 与 cast-refused（**拒绝也在内** ✓）
  2) 取当时的规则快照（method/quorumRule/min_votes/eligible/recuse/proxy）
  3) 用同一算法重算 → {outcome, reason, detail}
  4) 与 status().outcome 比对；不一致 ⇒ **具名报告差异**（不自动改结论 ✗）
  只读 ✓；需要权限（`vmu.audit.*`）
```

---

## 14. 配方库（**用 settings ＋ 判定点拼出机制**：14 个可复跑配方）

> 每个配方给：**目标 → 组合（判定点＋参数族）→ 预期可观测 → 失败模式（若不照做会怎样）→ 成熟度**。配方是"可定义性/扩展性"的证明：**全部不要求改内核** ✓。

| # | 目标机制 | 组合 | 预期可观测 | 不照做的失败模式 | 成熟度 |
|---|---|---|---|---|---|
| R01 | **冻结期不推进轮次** | `ballot.freeze()` ✓ ＋ `meeting.round-complete` 判定点返回 `{complete:false,reason:'frozen'}` ✓ ＋ `meeting.speech*` 联动（规划 ✗） | `roundComplete().complete===false`；`speak()` 被拒且 `inputs` 不增长 | v5r `s8-freeze-say`：被拒发言仍算完成 ⇒ 重试耗尽 ⇒ 提前收束 | **可实现 ✓**（判定点在 ✓，联动 ✗） |
| R02 | **表决期间禁止发言** | `ballot.frozen` ✓ ＋ 会议轮次完成判定同源 ＋ `ballot/cast` 与 `speak()` 共用"冻结"事实 | 冻结中 `cast` 具名拒（不入票 ✓）＋ 发言被拒 | "边说边投"：现场压力污染票面 | 部分 ✓ |
| R03 | **法定人数流失后降门槛** | `meeting.quorum` 判定点（规划 ✗）＋ `vmu.attendances*` 族（规划 ✗）＋ 流失事件钩子（规划 ✗） | `quorum={met:false,lostPolicy:'lower'}`；门槛变化留痕 | 缺席被算成反对／结论被少数人代表 | 规划 ✗ |
| R04 | **一人一票的 IRV** | `ballot.cast-valid` 接受排序票（规划 ✗）＋ `ballot.tally` 换 IRV（**判定点已在 ✓**） | `tally.detail.rounds[]`；一次计票出结果 | 多轮重投拖死 run（违反有界纪律） | 判定点 ✓／票形态 ✗ |
| R05 | **看板 WIP 限流** | `task.can-transition` 判定点（规划 ✗）＋ `vmu.board.*`（规划 ✗）＋ 复用 `VMU_RESOURCE_BUDGET` ✓ | 超限 ⇒ 具名拒；列内计数可见 | 在制品无限：谁也不先完成 | 规划 ✗ |
| R06 | **按角色限权开会** | `meeting.can-convene` ✓ ＋ `vmu.members.may()` ✓ ＋ pack 声明席位 | 无权限 ⇒ `VMU_NOT_PERMITTED` ＋ 具名理由 | 谁都能开会 ⇒ 资源被挤占 | **可实现 ✓** |
| R07 | **结论后不得改票** | `ballot.reopen()` ✓ ＋ 复议门槛族（规划 ✗）＋ `ballot.can-open` 检查上游结论 | `reopen` 被拒（非 tally）／需门槛 | 结论被反复重写，审计失效 | 部分 ✓ |
| R08 | **紧急闭门会** | `meeting.confidentiality` 判定点（规划 ✗）＋ `meeting.can-convene` ✓ ＋ 库面引用折叠（规划 ✗） | 条目不出现在库/提示词；引用被折叠并计数 | 敏感内容进库/进提示词 | 规划 ✗ |
| R09 | **委托链（可选，默认关）** | `vmu.ballot.proxy*`（规划 ✗）＋ `ballot.eligible` ✓ ＋ 环检测 | 委托链可查询、可撤回、逐票留痕 | 代投把缺席沉默变成一票（违 I-3/R2） | 规划 ✗（建议默认 `off`） |
| R10 | **弃权与缺席分开记账** | 票 `kind` 扩展 `abstain`（规划 ✗）＋ `vmu.attendances*`（规划 ✗）＋ 三层门槛（§13.1） | `status()` 分别给 `abstain/absent/unanswered` | "没投"语义含混 ⇒ 同一票型两个结论 | 部分 ✓ |
| R11 | **行动项闭环** | `summary()` ✓ → `vmu.tasks.create()` ✓ → `brief()` ✓ → `work.start()` ✓ | 决议项可追踪到负责人与终态 | 会议沦为清谈 | **可实现 ✓** |
| R12 | **委员会报告回母会** | 子会（规划 ✗）＋ `motions.propose`（规划 ✗）＋ `ballot` ✓ | 母会记录子会报告与表决 | 分组结论丢失/越权改母会 | 规划 ✗ |
| R13 | **预算触界只广播不散会** | `vmu.limits.*` ✓ ＋ `budget/exceeded` 钩子（**已注册但无生产者** ✗，见 05-§4.3）＋ `vmu.meetings.budget*`（规划 ✗） | `status().control.stale` ✓ ＋ 具名广播 | 触界被写成"自动散会" ⇒ 违 R10 | 部分 ✓ |
| R14 | **纪要含被拒项** | `summary()` ✓（含 `refused[]` ✓）＋ `vmu.minutes.*` 强制项（规划 ✗） | 纪要中 `refused[]` 非空 | 只记"发生过的好事" ⇒ 审计失真 | 部分 ✓ |

---

## 15. 会议类型目录（**类型是数据，不是代码分支** ✓）

> 类型＝一份**声明**：启用哪些机制、默认方法、门槛、产出。**未声明的类型不得假装有机制**（零机制 ✓）。成熟度：`✓`＝当前可用（`kind` 自由字符串 ✓，机制由 pack 规则给出）；`✗`＝需要本卷规划项。

| 类型（英/中） | 启用机制 | 默认表决方法 | 默认门槛 | 产出 | 成熟度 |
|---|---|---|---|---|---|
| `general` 平常会议 | 轮次＋举手＋发言＋收束 ✓ | 一致制 ✓ | 在册 ≥2 ✓ | `summary()` ✓、任务 ✓ | ✓ |
| `seminar` 学术讨论 | 轮次＋引用（条数/深度 ✓）＋自由发言 | 一致制（意向性） | ≥2 | 讨论要点、待证命题 | ✓（部分机制 ✗） |
| `planning` 任务规划 | 轮次＋任务建/派/阶段 ✓ | 一致制 ✓ | ≥2 | 任务板＋负责人 ✓ | ✓ |
| `debate` 辩论 | 正反方席位（✗）＋定向质询（✗）＋最后陈述（✗） | 一致制＋平均（pack ✓） | 双方到齐（✗） | 辩论录、判定结果 | 部分 ✓ |
| `resolution` 结题表决 | 议程通过（✗）＋动议/附议（✗）＋表决 ✓＋结论冻结（✗） | 绝对多数（✗） | 法定人数（✗）＋最少收集票（✗） | 决议＋行动项 | 部分 ✓ |
| `paper-design` 论文设计交流 | 逐节讨论（✗）＋任务拆分（部分 ✓） | 一致制 | ≥2 | 方案＋写作任务 | 部分 ✓ |
| `standup` 站会 | 单人时间箱（✗）＋一轮完成（✓） | 无需表决 | 全到（✗） | 阻塞项清单 | 部分 ✓ |
| `emergency` 紧急会 | 特权动议（✗）＋最短流程（✗） | 简单多数（✗） | ≥2 | 紧急决议 | ✗ |
| `closed` 闭门会 | 保密级别（✗）＋禁止引用（✗） | 记名/不记名（✗） | 法定（✗） | 密封纪要 | ✗ |
| `committee` 委员会 | 子会（✗）＋报告义务（✗） | 委员会自定（✗） | 委员到齐（✗） | 报告动议 | ✗ |
| `committee-of-the-whole` 全体委员会 | 同场换规则集（✗）＋可回退（✗） | 简单多数（✗） | 全体（✗） | 阶段性结论 | ✗ |
| `hearing` 听证/质询 | 定向质询（✗）＋证人席位（✗） | 无需表决 | — | 记录与结论 | ✗ |
| `appeal-board` 申诉审理 | 申诉（✗）＋回避（✗） | 绝对多数（✗） | 奇数席（✗） | 裁决 | ✗ |
| `annual` 年度会 | 报告（✗）＋里程碑（✗）＋表决 ✓ | 绝对多数（✗） | 法定（✗） | 年度决议＋计划 | ✗ |

---

## 16. 条目总索引（名称 → 成熟度 → 优先级）

### 16.1 会议（§2.2）

| 条目 | 成熟度 | 优先级 | 条目 | 成熟度 | 优先级 |
|---|---|---|---|---|---|
| 召集/开放 | ✓ | P0 | 打断与让渡 | ✗ | P2 |
| 议程（文本） | 部分 ✓ | P1 | 程序性问题 | 部分 ✓ | P1 |
| 议程条目（一等） | ✗ | P1 | 程序性申诉 | ✗ | P2 |
| 议题合并/拆分 | ✗ | P2 | 纪律与驱逐 | ✗ | P3 |
| 议程通过 | ✗ | P2 | 紧急程序 | ✗ | P3 |
| 动议 | ✗ | P1 | 名册与席位 | ✓（席位语义） | P1 |
| 附议 | ✗ | P2 | 法定人数 | ✗（pack 侧部分 ✓） | P0 |
| 动议撤回 | ✗ | P2 | 在场/缺席/迟到 | ✗ | P0 |
| 搁置与带出 | ✗ | P2 | 观察员/列席/受邀 | 部分 ✓ | P1 |
| 修正案（友好） | ✗ | P3 | 委托与代理投票 | ✗（建议默认关） | P3 |
| 举手与发言权 | ✓ | P0 | 远程/异步同步 | ✓ | P0 |
| 发言顺序 | ✗ | P1 | 并行多会（母/子会） | ✗ | P2 |
| 发言时长/时间箱 | 部分 ✓（整轮超时 ✓） | P1 | 委员会/全体委员会/分组 | ✗ | P2 |
| 轮次 | ✓ | P0 | 休会/复会 | ✗ | P2 |
| 闭会/散会 | ✓ | P0 | 延会 | ✗ | P3 |
| 上次纪要确认 | ✗ | P2 | 闭门与保密级别 | ✗ | P2 |
| 纪要/逐字稿 | 部分 ✓（`summary()` ✓） | P1 | 会议生命周期钩子 | 部分 ✓（2 个 ✓） | P1 |
| 会议预算 | 部分 ✓（`vmu.limits` ✓） | P1 | 主持中立与交接 | ✗ | P2 |

### 16.2 表决（§3.3）

| 条目 | 成熟度 | 优先级 | 条目 | 成熟度 | 优先级 |
|---|---|---|---|---|---|
| 一致制（默认） | ✓ | P0 | 排序复选 IRV | ✗ | P2 |
| 简单/绝对/相对/2-3 多数 | ✗ | P0 | 孔多塞/博达/批准/二次 | ✗ | P3 |
| 配额制 | ✗ | P3 | 法定票数门槛 | ✗ | P0 |
| 加权票 | ✗（默认等权 ✓） | P3 | 回避/利益冲突 | ✗ | P1 |
| 弃权 | ✗ | P0 | 代理与委托链 | ✗（建议默认关） | P3 |
| 缺席/未答/未表态 | 部分 ✓ | P0 | 否决与保留 | ✗（建议不纳入） | P3 |
| 记名/不记名/秘密 | ✗（默认记名 ✓） | P1 | 表决冻结期 | ✓ | P0 |
| 点名与唱名 | ✗ | P2 | 重开与复议 | ✓（门槛部分 ✓） | P1 |
| 多轮与淘汰 | 部分 ✓（`reopen` ✓） | P1 | 票数审计与复算 | 部分 ✓（`history` ✓） | P1 |

### 16.3 工作流/任务板/控制流（§4.2、§5）

| 条目 | 成熟度 | 优先级 | 条目 | 成熟度 | 优先级 |
|---|---|---|---|---|---|
| 任务 DAG（硬依赖） | ✓ | P0 | 检查点/回滚/补偿 | ✗（`rollback` 是阶段回滚 ✓） | P2 |
| 依赖类型（开始/软硬） | ✗ | P0 | 预算与配额公平 | 部分 ✓ | P0 |
| 阶段与门 | ✓（阶段机 ✓） | P0 | 看板列与 WIP | ✗ | P2 |
| 并行与抢占 | 部分 ✓（并发上限 ✓） | P1 | RACI | ✗ | P2 |
| 优先级与截止 | 部分 ✓（优先级 ✓） | P2 | 交接与升级 | 部分 ✓ | P1 |
| 重试与退避 | ✗ | P2 | 仲裁与冲突解决 | ✗ | P3 |
| 超时/中断/暂停恢复 | ✓ | P0 | 审计追踪 | 部分 ✓ | P0 |
| 度量（吞吐/周期/积压） | ✗ | P3 | 里程碑与交付物 | ✗ | P3 |
| 自动触发（时间/事件） | ✗ | P2 | 工作项模板 | ✗ | P3 |
| 子任务与拆分 | 部分 ✓（依赖表达 ✓） | P1 | 幂等与去重 | ✓ | P0 |

---

## 17. 门禁对照（§8 每条 → 断言 → 具名红 → 现状）

| §8 门禁 | 建议断言（机器可判） | 具名红 | 现状 |
|---|---|---|---|
| 1 零策略 | 静态扫 `kernel/meeting.js`／`ballot.js`：不得出现"门槛常量"（除默认最保守谓词） | `INV-R1: hard-coded threshold` | 部分可判（需写静态检查）✗ |
| 2 判定点可接管 | 对每个已实现判定点跑两场景：接管后行为改变／不接管用默认 ✓ | `INV-DP: decision point not pluggable` | ✓（会议 4＋表决 5 已有） |
| 3 拒绝不污染 | 场景：`refuseInput()` 后 `inputs`／票数／已回答集合**不变** ✓ | `INV-I3: refusal polluted state` | ✓（`tests/vmu-kernel.test.mjs` 已覆盖部分） |
| 4 完成判定正确 | 场景：冻结中 `roundComplete().complete===false` ✓ | `INV-I2: frozen round advanced` | ✓（判定点存在） |
| 5 三值＋过程票不裁定 | 断言：`kind:'process'` 永不进 `outcome`；`undecided` 无 reason ⇒ 失败 ✓ | `INV-I1/I4: process reading decided` | ✓ |
| 6 控制流一致 | 矩阵逐格：pause 后各写路径均具名拒（§5.1） | `INV-I5: pause not enforced on <face>` | 部分 ✓（归档面 ✗） |
| 7 可复现 | 注入时钟＋同 seed 两次运行序列一致 | `INV-R12: nondeterministic sequence` | 未写场景 ✗ |
| 8 记账一致 | 本卷符号 ↔ 03/04/05 登记表双向一致 | `DOC-08: symbol not registered` | 由 `audit-vmu-docs` 部分覆盖 ✓ |

---

## 18. 未核项（续，并入 14 号）

- **§15 的"类型目录"与 pack 的分工未裁**：类型放 pack manifest 还是内核常量？本卷立场＝**pack 声明**（内核零策略 ✓）。
- **`kind` 的枚举是否需要内核白名单**：当前 `kind` 是自由字符串 ✓ ⇒ 打错字不会被拒（可用 pack 校验补齐 ✗）。
- **§13.1 的"降门槛"是否应允许在会议中途生效**：本卷建议**只在"流失事件"后**且**事先写明** ✓ ⇒ 需裁。
- **§12.3 `vmu.ballot.method*` 与 `vmu.meetings.quorumRule` 的关系**：两者是否合并为一个族（避免"两个地方说门槛" ✗）⇒ 需裁。
- **归档面是否纳入暂停门禁**（§5.1 末行）⇒ 需裁。
- **`vibe_vmu_meeting` 是否需要扩容动作**（`recess/adjourn/motion/…`）还是新开规划工具（§11.3）⇒ 需裁。
- **度量是否允许触发动作**：本卷建议**不允许**（只发钩子/提示 ✓）⇒ 需裁。

---

## 19. 拟增设置键全表（**具体键名**；由 Lead 登记进 `04-settings.md`＋`settings/schema.js`）

> 说明：本表用**具体键名**（先前版本的"只用通配"约束已由 Lead 解除 ✓）。**既有键**（`vmu.meetings.quorumRule/quorumCap/reconsiderFloor/verdictMaxRounds/hardLimitMs/wakeRetries/roundTimeoutMs/quotesPerMessageMax/quoteDepthMax`、`vmu.tasks.stages/maxOpenTasks`、`vmu.limits.*`）**不重复登记** ✓，只在"备注"里指出被本表哪族扩写。
> 列义：**键** ｜ **类型** ｜ **默认** ｜ **取值域** ｜ **谁可改** ｜ **热改** ｜ **说明（一句话）**。

### 19.1 会议（`vmu.meetings.*`）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.meetings.quorumMin` | int | 0 | ≥0 | 所办 | 下轮 | 法定人数绝对下限（0＝只看比例） |
| `vmu.meetings.quorumRatio` | number | 0 | 0..1 | 所办 | 下轮 | 法定人数比例（0＝只看绝对下限） |
| `vmu.meetings.quorumLossPolicy` | enum | `undecided` | `recess｜defer｜lower｜undecided` | pack | 下轮 | 人数流失后的合法出路（**不得**默认通过/否决） |
| `vmu.meetings.quorumRecountMs` | ms | 0 | ≥0 | 所办 | 立即 | 流失后复算法定人数的周期 |
| `vmu.meetings.unansweredInDenominator` | bool | false | bool | 所办 | 立即 | 未答是否计入分母（默认**不计**） |
| `vmu.meetings.attendanceMode` | enum | `auto` | `manual｜auto` | 所办 | 立即 | 在场靠点名还是被问者终态自动推断 |
| `vmu.meetings.lateAfterMs` | ms | 0 | ≥0 | 所办 | 立即 | 超过多久到场算迟到 |
| `vmu.meetings.leaveEarlyPolicy` | enum | `excused` | `absent｜excused` | 所办 | 立即 | 早退如何记账 |
| `vmu.meetings.wakeFailurePolicy` | enum | `unreached` | `unreached｜absent` | pack | 立即 | 唤醒失败 ≠ 反对（默认记未达） |
| `vmu.meetings.speechDefaultMs` | ms | 300000 | ≥0 | 所办 | 立即 | 单人发言默认时间箱（0＝不限） |
| `vmu.meetings.speechMaxMs` | ms | 600000 | ≥0 | 所办 | 立即 | 单次发言硬上限 |
| `vmu.meetings.speechExtendMs` | ms | 60000 | ≥0 | 主持人 | 立即 | 一次延长的步长 |
| `vmu.meetings.speechExtendMax` | int | 1 | ≥0 | 主持人 | 立即 | 延长次数上限 |
| `vmu.meetings.speechQuotaPerMember` | int | 0 | ≥0 | 所办 | 下轮 | 每人发言次数配额（0＝不限） |
| `vmu.meetings.orderMode` | enum | `hands` | `hands｜round-robin｜seat｜weighted｜unspoken-first` | 主持人 | 下轮 | 发言顺序模式 |
| `vmu.meetings.interruptAllow` | string[] | `[]` | 子集 `{yield,point-of-order,objection,privileged}` | 主持人 | 立即 | 允许的打断类型 |
| `vmu.meetings.interruptQuota` | int | 0 | ≥0 | 主持人 | 立即 | 每人每轮打断配额 |
| `vmu.meetings.typeCatalog` | string[] | `[]` | kind 白名单 | pack | 重启 | 允许的会议类型（空＝不校验） |
| `vmu.meetings.liveCap` | int | 50 | ≥1 | 所办 | 重启 | 会话内活对象上限（超出按最旧逐出并计数） |
| `vmu.meetings.materialsRequired` | bool | false | bool | 主持人 | 下轮 | 是否要求议程条目带材料 |
| `vmu.meetings.confirmPreviousMinutes` | bool | false | bool | 主持人 | 下轮 | 开场是否强制确认上次纪要 |
| `vmu.meetings.budgetTurns` | int | 0 | ≥0 | 所办 | 立即 | 会议级回合预算（0＝不限） |
| `vmu.meetings.budgetTokens` | int | 0 | ≥0 | 所办 | 立即 | 会议级令牌预算 |
| `vmu.meetings.budgetWallMs` | ms | 0 | ≥0 | 所办 | 立即 | 会议级墙钟预算 |
| `vmu.meetings.budgetOnExceed` | enum | `broadcast` | `broadcast｜refuse｜pause` | 所办 | 立即 | 触界行为（**默认只广播，绝不自动散会** ✗） |
| `vmu.meetings.verbatimEnabled` | bool | false | bool | 所办 | 立即 | 逐字稿开关（默认关，成本） |
| `vmu.meetings.verbatimRetentionMs` | ms | 0 | ≥0 | 所办 | 立即 | 逐字稿保留期（0＝随会话） |
| `vmu.meetings.confidentialityDefault` | enum | `open` | `open｜closed｜sealed` | 主持人 | 下轮 | 默认保密级别 |
| `vmu.meetings.confidentialityQuotePolicy` | enum | `fold` | `allow｜fold｜deny` | 主持人 | 下轮 | 闭门内容的引用策略 |
| `vmu.meetings.appealScope` | enum | `procedural` | `procedural｜all｜off` | pack | 下轮 | 申诉受理范围 |
| `vmu.meetings.appealDeadlineMs` | ms | 0 | ≥0 | 所办 | 立即 | 申诉时限（0＝不限） |
| `vmu.meetings.appealReasonRequired` | bool | true | bool | pack | 立即 | 申诉必须给理由 |
| `vmu.meetings.disciplineWarnMax` | int | 0 | ≥0 | 主持人 | 立即 | 警告上限（0＝不启用） |
| `vmu.meetings.disciplineMuteMs` | ms | 0 | ≥0 | 主持人 | 立即 | 静默时长 |
| `vmu.meetings.disciplineExpelAllowed` | bool | false | bool | pack | 重启 | 是否允许驱逐（默认否） |
| `vmu.meetings.emergencyKinds` | string[] | `[]` | 子集 `{privileged,budget,closed}` | pack | 下轮 | 允许走紧急程序的情形 |
| `vmu.meetings.emergencyQuorumRatio` | number | 0 | 0..1 | pack | 下轮 | 紧急程序的到场比例 |
| `vmu.meetings.chairNeutral` | bool | true | bool | pack | 立即 | 主持中立约束（**不额外加权** ✓） |
| `vmu.meetings.chairTransferAudit` | bool | true | bool | pack | 立即 | 主持交接是否强制留痕 |
| `vmu.meetings.committeeMax` | int | 0 | ≥0 | 所办 | 重启 | 并行子会上限（0＝不允许） |
| `vmu.meetings.committeeReportRequired` | bool | true | bool | pack | 下轮 | 委员会是否必须报告回母会 |
| `vmu.meetings.recessMaxMs` | ms | 0 | ≥0 | 主持人 | 立即 | 单次休会上限 |
| `vmu.meetings.recessResumeRequiresMotion` | bool | false | bool | pack | 下轮 | 复会是否需要动议 |
| `vmu.meetings.minutesDetail` | enum | `normal` | `brief｜normal｜full` | 所办 | 下轮 | 纪要详略 |
| `vmu.meetings.minutesIncludeRefused` | bool | true | bool | pack | 下轮 | 纪要必须含被拒项（**建议恒 true** ✓） |
| `vmu.meetings.minutesActionsRequired` | bool | false | bool | pack | 下轮 | 决议是否必须带行动项 |
| `vmu.meetings.minutesRetentionMs` | ms | 0 | ≥0 | 所办 | 立即 | 纪要保留期 |

> **备注**：`vmu.meetings.quorumRule／quorumCap／reconsiderFloor／verdictMaxRounds／hardLimitMs／wakeRetries／roundTimeoutMs／quotesPerMessageMax／quoteDepthMax` 为**既有键**（本族基线 ✓）；本表是它们的**扩写**。

### 19.2 动议/议程（`vmu.motions.*`、`vmu.agenda.*`）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.motions.secondThreshold` | int | 1 | ≥0 | pack | 下轮 | 附议阈值（0＝无需附议） |
| `vmu.motions.expireMs` | ms | 0 | ≥0 | pack | 立即 | 无附议自动失效时限（0＝不失效） |
| `vmu.motions.withdrawable` | bool | true | bool | pack | 立即 | 是否允许撤回动议 |
| `vmu.motions.amendFriendlyInline` | bool | true | bool | pack | 下轮 | 友好修正是否直接并入 |
| `vmu.motions.amendSubstantiveMode` | enum | `one-vote` | `one-vote｜amend-chain` | pack | 下轮 | 实质改动的处理（**默认不引入完整修正案链** ✗） |
| `vmu.motions.proceduralKinds` | string[] | `['recess','extend','limit-speech','adjourn']` | 子集 | pack | 下轮 | 允许的程序动议 |
| `vmu.motions.privilegedKinds` | string[] | `[]` | 子集 | pack | 下轮 | 特权（急件）动议 |
| `vmu.motions.tabledMax` | int | 0 | ≥0 | pack | 立即 | 同时可搁置的动议上限（0＝不限） |
| `vmu.motions.maxOpen` | int | 5 | ≥1 | 所办 | 立即 | 同时未决动议上限 |
| `vmu.agenda.maxItems` | int | 0 | ≥0 | 所办 | 下轮 | 议程条目上限（0＝不限） |
| `vmu.agenda.ownerRequired` | bool | false | bool | pack | 下轮 | 条目是否必须带负责人 |
| `vmu.agenda.timeboxRequired` | bool | false | bool | pack | 下轮 | 条目是否必须带时间箱 |
| `vmu.agenda.splitDepthMax` | int | 1 | ≥0 | pack | 下轮 | 议题拆分深度上限 |
| `vmu.agenda.reorderAudit` | bool | true | bool | pack | 立即 | 重排是否强制留痕 |
| `vmu.agenda.carryOnAdjourn` | bool | true | bool | pack | 下轮 | 散会时未决条目是否自动带出 |

### 19.3 在场/法定人数/委员会/纪要（`vmu.attendance.*`、`vmu.committees.*`、`vmu.minutes.*`）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.attendance.markMode` | enum | `auto` | `auto｜manual` | 所办 | 立即 | 在场标记方式 |
| `vmu.attendance.excusedCounts` | enum | `excused` | `excused｜absent` | 所办 | 立即 | 请假如何记账 |
| `vmu.attendance.reportLate` | bool | true | bool | pack | 立即 | 迟到是否进纪要 |
| `vmu.committees.kinds` | string[] | `['committee']` | 子集 | pack | 重启 | 允许的委员会类型 |
| `vmu.committees.parentRosterSubsetOnly` | bool | true | bool | pack | 下轮 | 委员必须来自母会在册 |
| `vmu.committees.reportFormat` | enum | `motion` | `motion｜minutes｜both` | pack | 下轮 | 报告回母会的形式 |
| `vmu.minutes.confirmPreviousRequired` | bool | false | bool | pack | 下轮 | 上次纪要确认是否强制 |
| `vmu.minutes.dissentMandatory` | bool | true | bool | pack | 下轮 | 少数意见是否强制入档（**建议恒 true** ✓） |
| `vmu.minutes.actionsOwnerRequired` | bool | false | bool | pack | 下轮 | 行动项是否必须带责任人 |
| `vmu.minutes.dueRequired` | bool | false | bool | pack | 下轮 | 行动项是否必须带截止 |

### 19.4 表决（`vmu.ballot.*`）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.ballot.method` | enum | `unanimous` | `unanimous｜simple｜absolute｜relative｜two-thirds｜irv｜condorcet｜borda｜approval｜quadratic｜quota` | pack | 下一次 | 默认表决方法（**当前仅 `unanimous` 已实现** ✓） |
| `vmu.ballot.minVotes` | int | 0 | ≥0 | 主持人 | 开票前 | 本次投票成立门槛：最少收集票 |
| `vmu.ballot.minVotesRatio` | number | 0 | 0..1 | 主持人 | 开票前 | 成立门槛的比例形式 |
| `vmu.ballot.roundsMax` | int | 1 | ≥1 | 主持人 | 下一次 | 多轮上限（**事先写明** ✓） |
| `vmu.ballot.runoffTopN` | int | 2 | ≥2 | 主持人 | 下一次 | 决选取前 N 名 |
| `vmu.ballot.tieRule` | enum | `undecided` | `undecided｜runoff｜largest-group` | 主持人 | 开票前 | 平票规则（**不得临时解释** ✗） |
| `vmu.ballot.secrecy` | enum | `named` | `named｜secret｜mixed` | 主持人 | 开票前 | 记名/不记名（**开票前选定** ✓） |
| `vmu.ballot.secrecyRecordFact` | bool | true | bool | pack | 开票前 | 不记名时仍留档"本次不记名" |
| `vmu.ballot.abstainAllowed` | bool | true | bool | 主持人 | 开票前 | 是否允许弃权 |
| `vmu.ballot.abstainCountsForFloor` | bool | true | bool | 主持人 | 开票前 | 弃权是否计入"已投"（**不计入选项** ✓） |
| `vmu.ballot.recuseDeclareMode` | enum | `both` | `declare｜chair-asks｜both` | pack | 开票前 | 回避申报方式 |
| `vmu.ballot.recusePublic` | bool | true | bool | pack | 开票前 | 回避是否公开 |
| `vmu.ballot.proxyMode` | enum | `off` | `off｜delegation-chain` | 所办 | 开票前 | 代理投票（**默认禁用** ✗） |
| `vmu.ballot.proxyChainMaxDepth` | int | 1 | ≥0 | 所办 | 开票前 | 委托链深度上限（**禁环** ✓） |
| `vmu.ballot.vetoMode` | enum | `off` | `off｜role` | 所办 | 下一次 | 否决权（**默认不纳入** ✗） |
| `vmu.ballot.freezeMode` | enum | `manual` | `manual｜event` | 主持人 | 立即 | 冻结触发方式 |
| `vmu.ballot.freezeMeetingLinked` | bool | true | bool | pack | 立即 | 冻结是否联动会议轮次（**不推进** ✓） |
| `vmu.ballot.reopenFloor` | int | 0 | ≥0 | pack | 下一次 | 复议门槛（0＝用既有 `reconsiderFloor` ✓） |
| `vmu.ballot.reopenInitiatorScope` | enum | `winner-side` | `any｜winner-side｜chair` | pack | 下一次 | 复议发起人范围（**防滥诉** ✓） |
| `vmu.ballot.reopenSameMeetingOnly` | bool | true | bool | pack | 下一次 | 复议是否限同一会议 ✓ |
| `vmu.ballot.auditReadOnly` | bool | true | bool | pack | 立即 | 复算只读（**不得自动改结论** ✗） |
| `vmu.ballot.auditRetentionMs` | ms | 0 | ≥0 | 所办 | 立即 | 复算记录保留期 |
| `vmu.ballot.processReadingsVisible` | bool | true | bool | pack | 立即 | 过程读数是否可见（**可见也必须标注未生效** ✓） |
| `vmu.ballot.rollCallOrder` | enum | `roster` | `roster｜seat｜custom` | 主持人 | 开票前 | 唱名顺序 |
| `vmu.ballot.irvInstantSingleCount` | bool | true | bool | pack | 下一次 | IRV 是否"一次收集一次计票"（**建议恒 true** ✓） |
| `vmu.ballot.quadraticCreditCap` | int | 0 | ≥0 | pack | 下一次 | 二次投票的票力上限 |
| `vmu.ballot.quotaSeats` | int | 0 | ≥0 | pack | 下一次 | 配额制席位数（0＝不启用） |

### 19.5 工作流/看板（`vmu.workflow.*`、`vmu.board.*`）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.workflow.depTypes` | string[] | `['finish-to-start']` | 子集 `{finish-to-start,start-to-start,finish-to-finish,start-to-finish}` | pack | 重启 | 允许的依赖类型 |
| `vmu.workflow.softDepsEnforced` | bool | false | bool | pack | 下轮 | 软依赖是否机器强制（**默认只提示** ✓） |
| `vmu.workflow.stageGateMode` | enum | `refuse` | `advisory｜refuse` | pack | 下轮 | 阶段门：提示还是拒绝 |
| `vmu.workflow.gateKinds` | string[] | `['entry','exit']` | 子集 | pack | 下轮 | 门类型白名单 |
| `vmu.workflow.retryMax` | int | 0 | ≥0 | 所办 | 立即 | 重试上限（0＝不重试） |
| `vmu.workflow.retryBaseMs` | ms | 1000 | ≥0 | 所办 | 立即 | 退避基数 |
| `vmu.workflow.retryCapMs` | ms | 60000 | ≥0 | 所办 | 立即 | 退避上限 |
| `vmu.workflow.retryJitterRatio` | number | 0.2 | 0..1 | 所办 | 立即 | 抖动比例（防同步风暴） |
| `vmu.workflow.taskTimeoutMs` | ms | 0 | ≥0 | 所办 | 立即 | 单任务超时（0＝不限） |
| `vmu.workflow.checkpointEveryMs` | ms | 0 | ≥0 | 所办 | 立即 | 检查点周期（0＝不自动） |
| `vmu.workflow.compensationMode` | enum | `manual` | `manual｜registered` | pack | 下轮 | 补偿动作来源 |
| `vmu.workflow.subtaskDepthMax` | int | 2 | ≥0 | pack | 下轮 | 子任务深度上限 |
| `vmu.workflow.parentDoneRule` | enum | `all-terminal` | `all-terminal｜any-terminal` | pack | 下轮 | 父任务完成判据 |
| `vmu.workflow.priorityClasses` | string[] | `['low','normal','high']` | 字符串数组 | pack | 重启 | 优先级档 |
| `vmu.workflow.dueWarnBeforeMs` | ms | 0 | ≥0 | 所办 | 立即 | 到期前提醒窗口 |
| `vmu.workflow.escalationAfterMs` | ms | 0 | ≥0 | pack | 立即 | 多久未动就升级（0＝不升级） |
| `vmu.workflow.escalationTarget` | enum | `office` | `chair｜office｜user` | pack | 立即 | 升级对象 |
| `vmu.workflow.arbitrationMode` | enum | `off` | `off｜on` | 所办 | 下轮 | 仲裁是否启用 |
| `vmu.workflow.claimRequired` | bool | false | bool | pack | 下轮 | 任务是否必须先认领才能开工 |
| `vmu.workflow.handoverNote` | bool | true | bool | pack | 立即 | 交接是否强制写说明 |
| `vmu.workflow.idempotencyKeyScope` | enum | `session` | `session｜durable` | 所办 | 重启 | 幂等键范围 |
| `vmu.workflow.templateDefault` | string | `''` | 模板 id | pack | 重启 | 默认工作项模板 |
| `vmu.workflow.templates` | object[] | `[]` | 模板对象数组 | pack | 重启 | 模板库 |
| `vmu.board.columns` | object[] | `[]` | `{id,name,wipLimit,order}[]` | 所办 | 立即 | 看板列定义（空＝无看板 ✓） |
| `vmu.board.wipDefault` | int | 0 | ≥0 | 所办 | 立即 | 默认 WIP 上限（0＝不限） |
| `vmu.board.wipPerColumn` | object | `{}` | `{列id:上限}` | 所办 | 立即 | 按列覆盖 WIP |
| `vmu.board.swimlanes` | string[] | `[]` | 泳道名数组 | 所办 | 立即 | 泳道 |
| `vmu.board.agingWarnMs` | ms | 0 | ≥0 | 所办 | 立即 | 老化提醒 |
| `vmu.board.moveRequiresTransition` | bool | true | bool | pack | 立即 | 移动列是否必须走状态迁移（**建议 true** ✓） |

### 19.6 预算/控制/触发/度量/审计（`vmu.budget.*`、`vmu.control.*`、`vmu.scheduler.*`、`vmu.metrics.*`、`vmu.audit.*`）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.budget.tokens` | int | 0 | ≥0 | 所办 | 立即 | 令牌总量（0＝不限） |
| `vmu.budget.turns` | int | 0 | ≥0 | 所办 | 立即 | 回合总量 |
| `vmu.budget.toolCalls` | int | 0 | ≥0 | 所办 | 立即 | 工具调用总量（与 `limits.toolCallsPerTurnCap` 的单回合上限区分） |
| `vmu.budget.subagents` | int | 0 | ≥0 | 所办 | 立即 | 子代理总量 |
| `vmu.budget.perTaskShare` | number | 0 | 0..1 | 所办 | 立即 | 单任务可占比例 |
| `vmu.budget.fairnessPolicy` | enum | `equal` | `equal｜priority｜reserve` | 所办 | 立即 | 配额公平策略 |
| `vmu.budget.reserveRatio` | number | 0 | 0..1 | 所办 | 立即 | 预留比例 |
| `vmu.budget.warnAtRatio` | number | 0.8 | 0..1 | 所办 | 立即 | 预警阈值 |
| `vmu.budget.onExceed` | enum | `refuse` | `refuse｜warn｜pause` | 所办 | 立即 | 触界行为（**默认拒，不自动散会** ✓） |
| `vmu.control.pauseScope` | string[] | `['tasks','meetings','ballots','work']` | 子集 | 所办 | 立即 | 暂停门禁覆盖面（归档面默认**不在**内 ✗ 待裁） |
| `vmu.control.watchdogIntervalMs` | ms | 0 | ≥0 | 所办 | 重启 | 看门狗周期（0＝无定时器 ✗） |
| `vmu.control.idleAfterMs` | ms | 0 | ≥0 | 所办 | 立即 | 多久算空闲 |
| `vmu.control.idleAction` | enum | `notice` | `notice｜recess｜none` | 所办 | 立即 | 空闲行为（**默认只提示** ✓；不自动散会 ✗） |
| `vmu.control.degradeSteps` | string[] | `[]` | 子集 `{read-only,report-only,no-spawn}` | 所办 | 立即 | 降级档位 |
| `vmu.control.canPauseRoles` | string[] | `['office','chair']` | 角色槽位数组 | pack | 立即 | 谁可以暂停 |
| `vmu.control.stopClearsRegistry` | bool | true | bool | pack | 重启 | stop 是否清空注册（**当前行为 ✓**） |
| `vmu.scheduler.triggers` | object[] | `[]` | `{id,at/on,action,enabled}[]` | 所办 | 立即 | 触发器表 |
| `vmu.scheduler.maxTriggers` | int | 8 | ≥0 | 所办 | 立即 | 触发器上限 |
| `vmu.scheduler.timeSource` | enum | `clock` | `clock｜host-timer` | 所办 | 重启 | 时间源（`host-timer` **未接线** ✗） |
| `vmu.scheduler.actionsAllowed` | string[] | `['emit-hook','prompt']` | 子集（**不含改状态** ✗） | pack | 立即 | 触发器允许的动作 |
| `vmu.metrics.windowMs` | ms | 0 | ≥0 | 所办 | 立即 | 度量窗口 |
| `vmu.metrics.indicators` | string[] | `['throughput','cycle','backlog','wip']` | 子集 | 所办 | 立即 | 指标白名单 |
| `vmu.metrics.allowTrigger` | bool | false | bool | 所办 | 立即 | 度量是否可触发动作（**建议恒 false** ✓） |
| `vmu.metrics.exportFormat` | enum | `json` | `json｜jsonl` | 所办 | 立即 | 导出格式 |
| `vmu.audit.level` | enum | `normal` | `minimal｜normal｜verbose` | 所办 | 立即 | 审计级别 |
| `vmu.audit.exportScope` | string[] | `['settings','middleware','refusals']` | 子集 | 所办 | 立即 | 导出范围 |
| `vmu.audit.recountRoles` | string[] | `['office','chair']` | 角色槽位数组 | pack | 立即 | 谁可复算 |
| `vmu.audit.traceKeepMs` | ms | 0 | ≥0 | 所办 | 立即 | 追踪保留期 |
| `vmu.arbitration.mode` | enum | `off` | `off｜on` | 所办 | 下轮 | 仲裁开关 |
| `vmu.arbitration.binding` | bool | false | bool | pack | 下轮 | 仲裁结论是否有约束力 |
| `vmu.arbitration.recordInMinutes` | bool | true | bool | pack | 下轮 | 仲裁是否进纪要 |
| `vmu.templates.default` | string | `''` | 模板 id | pack | 重启 | 默认模板 |
| `vmu.templates.items` | object[] | `[]` | 模板对象数组 | pack | 重启 | 模板库 |

**计数（供登记核对，逐节实测）**：§19.1 **47** ＋ §19.2 **15** ＋ §19.3 **10** ＋ §19.4 **27** ＋ §19.5 **29** ＋ §19.6 **33** ＝ **161 个拟增键**（不含既有键 ✓；按命名空间：`vmu.meetings` 47／`vmu.motions` 9／`vmu.agenda` 6／`vmu.attendance` 3／`vmu.committees` 3／`vmu.minutes` 4／`vmu.ballot` 27／`vmu.workflow` 23／`vmu.board` 6／`vmu.budget` 9／`vmu.control` 7／`vmu.scheduler` 4／`vmu.metrics` 4／`vmu.audit` 4／`vmu.arbitration` 3／`vmu.templates` 2）。

---

## 20. 拟增错误码表（**具体码名**；由 Lead 登记进 `03-§8`）

> 纪律：① 只**增**不改语义（改语义＝新码 ✓）；② 每个码必须"具名解释"（谁能做/为什么/下一步 ✓）；③ pack 自有码必须用 `VMU_PACK_<ID>_<REASON>` 形状（不占框架命名空间 ✓）。
> 列义：**码** ｜ **语义** ｜ **何时** ｜ **必须给的解释**。

### 20.1 会议与议程

| 码 | 语义 | 何时 | 必须给的解释 |
|---|---|---|---|
| `VMU_MEETING_QUORUM_LOST` | 法定人数在会中流失 | 复算时 | 现有/需要人数＋合法出路（休会/延期/降门槛/未决） |
| `VMU_MEETING_UNANSWERED_POLICY` | 未答语义与配置冲突 | 门槛计算 | 当前策略与名单（**不得**把未答算作反对 ✗） |
| `VMU_MEETING_ORDER_DENIED` | 发言顺序/优先权被拒 | 举手/点名 | 队列位置与规则 |
| `VMU_MEETING_SPEECH_TIMEBOUND` | 发言超出时间箱/配额 | 发言 | 已用/上限＋如何延长 |
| `VMU_MEETING_INTERRUPT_DENIED` | 打断不被允许/超配额 | 打断 | 允许的打断类型与配额 |
| `VMU_MEETING_CONFIDENTIAL_DENIED` | 保密级别不允许该读/引用 | 读/引用 | 级别与可见范围 |
| `VMU_MEETING_RECESS_LIMIT` | 休会超上限 | 休会 | 已休/上限 |
| `VMU_MEETING_APPEAL_OUT_OF_SCOPE` | 申诉不在受理范围 | 申诉 | 范围与时限 |
| `VMU_MEETING_DISCIPLINE_DENIED` | 纪律动作不被允许 | 警告/静默/驱逐 | 依据与申诉窗口 |
| `VMU_MEETING_EMERGENCY_NOT_ALLOWED` | 紧急程序不适用 | 特权动议 | 允许情形白名单 |
| `VMU_AGENDA_ITEM_REQUIRED` | 需要一等议程条目 | 议程操作 | 为什么需要（动议/决议要引用） |
| `VMU_AGENDA_SPLIT_DEPTH` | 拆分超过深度 | 拆分 | 当前深度/上限 |
| `VMU_AGENDA_OWNER_REQUIRED` | 条目缺少负责人 | 建条目 | 规则来源 |
| `VMU_MOTION_NOT_SECONDED` | 动议未获附议 | 进入表决前 | 需要的附议数与已获数 |
| `VMU_MOTION_EXPIRED` | 动议过期失效 | 引用时 | 失效时间与原因 |
| `VMU_MOTION_WITHDRAWN` | 动议已撤回 | 投票/引用 | 撤回人与时间 |
| `VMU_MOTION_TABLE_LIMIT` | 搁置动议超上限 | 搁置 | 当前搁置数/上限 |
| `VMU_AMENDMENT_REJECTED` | 修正案不被接受 | 修正 | 为什么不接受＋可走哪条路 |
| `VMU_MINUTES_NOT_CONFIRMED` | 上次纪要未确认 | 开场/闭会 | 哪一场的纪要、如何确认 |
| `VMU_MINUTES_ACTION_REQUIRED` | 决议缺少行动项 | 记录决议 | 要求的字段 |

### 20.2 表决

| 码 | 语义 | 何时 | 必须给的解释 |
|---|---|---|---|
| `VMU_BALLOT_METHOD_UNSUPPORTED` | 表决方法未实现/未声明 | 开板 | 支持清单（当前仅一致制 ✓） |
| `VMU_BALLOT_MIN_VOTES_NOT_MET` | 本次投票成立门槛未达 | 计票 | 已收/门槛＋**不得**用剩余票推断 ✓ |
| `VMU_BALLOT_TIE_UNRESOLVED` | 平票且规则未定/无法判定 | 计票 | 票型＋事先声明的 tieRule |
| `VMU_BALLOT_ROUNDS_EXHAUSTED` | 多轮用尽仍无结论 | 计票 | 轮数上限与历次结果 |
| `VMU_BALLOT_SECRECY_LOCKED` | 开票后要求改记名方式 | 开票后 | 开票前选定的方式（**不得事后两头都要** ✗） |
| `VMU_BALLOT_ABSTAIN_NOT_ALLOWED` | 本板不允许弃权 | 投票 | 规则来源 |
| `VMU_BALLOT_FROZEN` | 冻结中投票被拒 | 投票 | 冻结原因与解冻方式（**票不入账** ✓） |
| `VMU_RECUSAL_REQUIRED` | 该表决要求回避 | 投票 | 回避依据与申报方式 |
| `VMU_PROXY_NOT_ALLOWED` | 代理/委托未启用 | 代投 | 默认禁用说明＋可用替代（异步亲自投） |
| `VMU_PROXY_CHAIN_TOO_DEEP` | 委托链超深/成环 | 委托 | 链现状与上限 |
| `VMU_VETO_NOT_ALLOWED` | 本机构未启用否决权 | 否决 | 建议替代（提高门槛＋具名理由） |
| `VMU_REOPEN_FLOOR_NOT_MET` | 复议门槛未达 | 复议 | 需要/已有支持数 |
| `VMU_REOPEN_WRONG_INITIATOR` | 复议发起人不合规 | 复议 | 允许的发起人范围（防滥诉 ✓） |
| `VMU_RECOUNT_MISMATCH` | 复算结果与结论不一致 | 复算 | 差异明细（**不自动改结论** ✗） |
| `VMU_RECOUNT_SCOPE_DENIED` | 无权复算/导出 | 复算 | 权限与值班角色 |

### 20.3 工作流/看板/预算/控制/触发/度量

| 码 | 语义 | 何时 | 必须给的解释 |
|---|---|---|---|
| `VMU_WORKFLOW_DEP_TYPE_UNSUPPORTED` | 依赖类型未声明 | 建依赖 | 支持清单 |
| `VMU_WORKFLOW_GATE_NOT_MET` | 门未达成 | 迁移/推进 | 缺什么＋如何补齐 |
| `VMU_WORKFLOW_WIP_LIMIT` | 看板列超 WIP | 移动列 | 列名/现值/上限（**拒绝而不是丢弃** ✓） |
| `VMU_WORKFLOW_RETRY_EXHAUSTED` | 重试耗尽 | 重试 | 次数/上限＋升级路径 |
| `VMU_WORKFLOW_CHECKPOINT_MISSING` | 无检查点可回滚 | 回滚 | 最近检查点时间 |
| `VMU_WORKFLOW_COMPENSATION_FAILED` | 补偿动作失败 | 补偿 | 原始错误＋人工处置建议 |
| `VMU_WORKFLOW_ESCALATION_TARGET_UNKNOWN` | 升级对象不存在 | 升级 | 目标清单 |
| `VMU_WORKFLOW_RACI_MISSING_OWNER` | 任务无责任人 | 建/派任务 | 必须指定的角色位 |
| `VMU_WORKFLOW_SUBTASK_DEPTH` | 子任务超深 | 拆分 | 当前深度/上限 |
| `VMU_WORKFLOW_TEMPLATE_UNKNOWN` | 模板不存在 | 实例化 | 可用模板清单 |
| `VMU_WORKFLOW_ARBITRATION_OFF` | 仲裁未启用 | 仲裁请求 | 开启方式 |
| `VMU_BUDGET_SCOPE_UNKNOWN` | 预算范围未登记 | 预算操作 | 可用范围 |
| `VMU_BUDGET_RESERVE_EXHAUSTED` | 预留额度用尽 | 预留 | 当前值/上限 |
| `VMU_CONTROL_SCOPE_UNKNOWN` | 暂停范围非法 | pause | 允许的范围集合 |
| `VMU_CONTROL_NO_TIMER` | 宿主无定时器服务 | 看门狗/触发 | 如何提供 timer 接缝（**未接线** ✗） |
| `VMU_SCHEDULER_TRIGGER_LIMIT` | 触发器超上限 | 注册触发 | 现值/上限 |
| `VMU_SCHEDULER_ACTION_FORBIDDEN` | 触发器动作越界（试图改状态） | 触发 | 允许动作（只发钩子/提示 ✓） |
| `VMU_METRICS_TRIGGER_FORBIDDEN` | 度量试图触发动作 | 度量 | 设计纪律（度量只读 ✓） |
| `VMU_IDEMPOTENCY_KEY_REUSED` | 幂等键重复且载荷不同 | 写操作 | 原载荷与新载荷差异 |

**计数（逐节实测）**：§20.1 **20** ＋ §20.2 **15** ＋ §20.3 **19** ＝ **54 个拟增错误码**（另有复用既有码：`VMU_STATE／NOT_PERMITTED／NO_SUCH_OBJECT／INVALID_ARGUMENT／MEETING_TOO_SMALL／RESOURCE_BUDGET／MIDDLEWARE_REJECTED／MIDDLEWARE_FAILED／IO_FAILED／ENGINE_UNAVAILABLE／STORE_FAILED` ✓）。

---

## 21. 拟增服务/工具/钩子/协议清单（含是否已实现 ✓✗）

### 21.1 服务（`registry.register` 面）

| 名字 | 是否已实现 | 说明 |
|---|---|---|
| `vmu.tasks` / `vmu.work` / `vmu.members` / `vmu.library` / `vmu.store` / `vmu.prompt` / `vmu.middleware` | **已实现 ✓** | 现役服务面（03-§2 已登记 ✓） |
| 会议/表决**原语**（`kernel.meeting()`／`kernel.ballot()`） | **已实现 ✓**（**是工厂，不是服务** ✗） | 逐对象实例；不要按服务注册 ✓ |
| `vmu.motions`（动议/附议/搁置/修正） | **未实现 ✗** | 目标形态：动议台账＋状态机 |
| `vmu.agenda`（议程条目） | **未实现 ✗** | 一等条目 CRUD 与拆分合并 |
| `vmu.attendance`（在场/法定人数） | **未实现 ✗** | 与 `vmu.members` 分工：members 管席位，attendance 管"这次会谁在" |
| `vmu.committees`（委员会/子会） | **未实现 ✗** | 父子会与报告 |
| `vmu.minutes`（纪要/确认） | **未实现 ✗** | 结构化纪要＋上次确认 |
| `vmu.verbatim`（逐字稿） | **未实现 ✗** | 默认关；开启须可裁剪 |
| `vmu.workflow`（DAG/门/重试/检查点） | **未实现 ✗** | 目标形态：任务编排层（不改 `vmu.tasks` 语义） |
| `vmu.board`（看板/WIP） | **未实现 ✗** | 阶段机的视图层 |
| `vmu.budget`（预算/公平） | **未实现 ✗** | 现役只有 `vmu.limits.*` 的硬门 ✓ |
| `vmu.scheduler`（触发器） | **未实现 ✗** | 需宿主 timer 接缝（**未接线** ✗） |
| `vmu.metrics`（度量） | **未实现 ✗** | 只读，**不允许触发动作** ✓ |
| `vmu.audit`（追踪/复算） | **未实现 ✗** | 只读复算；权限受 `vmu.audit.*` |
| `vmu.arbitration`（仲裁） | **未实现 ✗** | 结论进纪要；默认关 |

### 21.2 工具（宿主面，`vibe_vmu_*`）

| 工具 | 是否已实现 | 动作 |
|---|---|---|
| `vibe_vmu_meeting` ✓ | **已实现 ✓** | `list｜open｜speak｜silent｜close｜ballot｜vote｜tally｜reopen` |
| `vibe_vmu_task` ✓ | **已实现 ✓** | `list｜create｜assign｜transition｜stage｜advance｜brief｜history` |
| `vibe_vmu_control` ✓ | **已实现 ✓** | `status｜pause｜resume｜stop｜beat` |
| `vibe_vmu_motion` | **未实现 ✗（规划）** | 动议/附议/撤回/搁置/修正 |
| `vibe_vmu_agenda` | **未实现 ✗（规划）** | 议程条目 CRUD/拆分合并 |
| `vibe_vmu_attendance` | **未实现 ✗（规划）** | 在场/法定人数 |
| `vibe_vmu_minutes` | **未实现 ✗（规划）** | 纪要/确认/展开 |
| `vibe_vmu_committee` | **未实现 ✗（规划）** | 子会/报告 |
| `vibe_vmu_board` | **未实现 ✗（规划）** | 列/WIP/度量 |
| `vibe_vmu_workflow` | **未实现 ✗（规划）** | 依赖/门/重试/检查点/补偿 |
| `vibe_vmu_budget` | **未实现 ✗（规划）** | 预算状态/预留/释放 |
| `vibe_vmu_scheduler` | **未实现 ✗（规划）** | 触发器 |
| `vibe_vmu_metrics` | **未实现 ✗（规划）** | 度量窗口/指标 |
| `vibe_vmu_audit` | **未实现 ✗（规划）** | 追踪/复算/导出 |

### 21.3 钩子（`VU_HOOKS`）

| 钩子 | 是否已注册 | 可拒绝? |
|---|---|---|
| `meeting/round-start`／`meeting/round-end` | **已注册 ✓** | 前者可拒 ✓ |
| `ballot/cast`／`ballot/tally` | **已注册 ✓** | 前者可拒 ✓／后者可覆盖计票 ✓ |
| `task/assign`／`task/transition`／`settle/before`／`settle/after`／`control/paused`／`control/resumed`／`control/heartbeat` | **已注册 ✓** | 视点而定 ✓ |
| `meeting/convened`／`meeting/opened`／`meeting/speech-requested`／`meeting/speech-granted`／`meeting/interrupted`／`meeting/motion`／`meeting/seconded`／`meeting/amendment`／`meeting/recess`／`meeting/resumed`／`meeting/adjourned`／`meeting/minutes-drafted` | **未注册 ✗（规划）** | 见 §11.4 |
| `ballot/opened`／`ballot/frozen`／`ballot/unfrozen`／`ballot/closed`／`ballot/reopened`／`ballot/audited` | **未注册 ✗（规划）** | 部分可拒 |
| `task/created`／`task/deps-changed`／`task/gate-check`／`task/retry`／`task/checkpoint`／`task/escalated` | **未注册 ✗（规划）** | 部分可拒 |
| `board/wip-exceeded`／`budget/warn`／`trigger/fired`／`committee/formed`／`committee/reported` | **未注册 ✗（规划）** | 观测型 |
| `budget/exceeded` | **已注册但无生产者** ✗（05-§4.3 已声明 ✓） | 观测型 |

### 21.4 协议/接缝（不是新工具）

| 名字 | 是否已实现 | 说明 |
|---|---|---|
| `deliver({meeting,round,member,ask,at})` 投递接缝 ✓ | **已实现 ✓** | 无接缝 ⇒ `VMU_ENGINE_UNAVAILABLE` ✓（11-§4.1） |
| `clock()` 注入时钟 ✓ | **已实现 ✓** | 可复现（R12） |
| `isPaused()` 注入暂停态 ✓ | **已实现 ✓** | 会议/表决的真门禁（I-5） |
| timer/看门狗接缝 | **未接线 ✗（规划）** | 宿主 timer 服务；`VMU_CONTROL_NO_TIMER` |
| 归档面暂停门禁接缝 | **未接线 ✗（规划）** | 见 §5.1 与 §18 |

---

## 22. 旧策略不合理处与替换方案（逐条）

| # | 旧写法（v0.1／他卷） | 为什么不合理 | 替换方案（本卷立场） |
|---|---|---|---|
| 1 | 头注引用 `01-v5r-reuse-map.md` | **该文件不存在**（设计集是 00–14）⇒ 悬空引用 | 改为 `00-README.md`／`01-philosophy.md`／`02-architecture.md`＋邻居卷 ✓（已改） |
| 2 | "会议有 `roster` 就够了" | 没有**在场/席位/观察员**，无法表达"谁在、谁能投" | 拆成**名册（members）／在场（attendance）／席位类型／表决权（eligible）** 四件事 ✓ |
| 3 | "门槛由 pack 给" 却没区分层次 | 法定人数／投票成立／通过条件混在一起 ⇒ 同一票型两个结论 | **三层门槛**（§3.2/§13.1）＋要求**事先写明** ✓ |
| 4 | "冻结期禁止发言"只写在文档里 | 没有判定点 ⇒ 冻结无法联动"轮次完成" | `ballot.freeze()` ✓＋`meeting.round-complete` 判定点（R01 配方 ✓） |
| 5 | `kind` 是自由字符串且无目录 | 打错字不会被拒；类型与机制的关系无处声明 | `vmu.meetings.typeCatalog`（白名单，可为空）＋§15 类型目录（pack 声明 ✓） |
| 6 | "会议预算"只提"令牌" | 没有触界行为；容易被写成"触界即散会" ✗ | `vmu.meetings.budget*`＋四种触界行为，**默认只广播** ✓ |
| 7 | "代理投票"未决定默认 | 代投会把缺席沉默变成一票（违 I-3） | **默认 `off`** ＋若要启用必须：禁环、可撤回、逐票留痕 ✓ |
| 8 | "否决权"被当常规机制 | 与"少数意见入档＋有门槛复议"重复且易成单点阻塞 | **默认不纳入**；关键方靠"提高门槛＋具名理由" ✓ |
| 9 | 修正案写"完整表决链" | 代理场景过重（轮次爆炸） | **友好并入＋实质改动一次表态** ✓ |
| 10 | 检验点/回滚只有 `tasks.rollback()` | 那只是**阶段回滚**，不是状态快照 ⇒ 无法"回到上一个确定状态" | 新增 `vmu.workflow.*` 检查点族（复用 `vmu.store` ✓） |
| 11 | 度量/统计未定边界 | 一旦允许度量触发动作，就把统计变成策略 ✗ | `vmu.metrics.allowTrigger=false` **恒建议 false** ✓ |
| 12 | 触发器想象成"内核定时器" | 内核**没有 scheduler** ✗；假装有会写出幽灵功能 | 明确"需宿主 timer 接缝（未接线）"＋`VMU_CONTROL_NO_TIMER` ✓ |
| 13 | 暂停被当成"台账标记" | 归档面/会议面仍可写 ⇒ 幽灵在飞 | 暂停＝**真门禁**（I-5）＋§5.1 逐面矩阵 ✓ |
| 14 | `vibe_vmu_ballot` 等幽灵工具名 | 手册承诺了不存在的能力 ✗（03-§3.2 已记录教训） | 未实现工具**必须带标记词**＋在 §11.3/§21.2 明确 ✗✓ |

---

## 23. 需 Lead／用户裁决的点

1. **三层门槛的默认值**：`quorumMin/quorumRatio` 与 `ballot.minVotes` 默认 0（＝不限）是否太松 ⇒ 是否给机构级推荐值？
2. **`vmu.ballot.method` 与既有 `vmu.meetings.quorumRule` 是否合并**（避免"两个地方说门槛" ✗）⇒ 建议：`quorumRule` 作为**别名**指向 `vmu.ballot.method`＋`vmu.ballot.minVotes`。
3. **`vmu.meetings` 与 `vmu.motions`／`vmu.agenda` 的分工**：会议族只放"会级"旋钮，动议/议程放各自族（本卷立场）⇒ 需确认无重叠登记。
4. **`vmu.ballot.proxyMode` 是否随机构差异允许开启**（默认 `off` ✓）⇒ 若开启，是否需要额外审计级别？
5. **归档面是否纳入 `vmu.control.pauseScope`**（当前不含 ✗）⇒ 影响 §5.1 矩阵与 I-5 的"面"。
6. **`vmu.control.beatStaleMs` 与 `vmu.limits.wallClockMs` 的关系**（两个都像"多久没动" ✗）⇒ 建议：只留 `vmu.limits.wallClockMs`，`beatStaleMs` 不新增。
7. **§20 的 55 个码是否需要合并**（例如把 `VMU_MEETING_*` 与 `VMU_MOTION_*` 合成 `VMU_MEETING_PROCEDURE_*`）⇒ 影响 03-§8 的体量。
8. **`vmu.metrics`／`vmu.audit` 是否要独立工具面**（§21.2 规划了两个）⇒ 或并入 `vibe_vmu_records`／`status`。



