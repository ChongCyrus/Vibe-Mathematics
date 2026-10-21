# vmu 08 · 会议 · 表决 · 工作流 · 任务板 · 控制流（Primitives & Infrastructure）

> 状态：**设计稿 v0.2（深水区）** —— 本版把 v0.1 的"骨架"扩成**可实施的基础设施全集**：逐条给出判定点、可调控族、错误码面、钩子、强制点与成熟度。
> 上位：`00-README.md`（阅读顺序与权威顺序）、`01-philosophy.md`（R1 内核零策略 / R2 能力与挂点齐备 / R5 中间件 / R6 登记即契约 / R11 可观测）、`02-architecture.md`（内核分区与钩子域）。
> 邻居（谁登记什么，**不要重复登记** ✗）：`03-interface-contract.md`（服务/工具/钩子索引/耐久键/**错误码总表**）、`04-settings.md`（**设置键全表**与"已接线/未接线"）、`05-middleware.md`（钩子全表与中间件语义）、`06-prompt-pipeline.md`（提示词段与注入）、`07-durability-library.md`（耐久与归档）、`14-open-items-and-roadmap.md`（未核项与路线图）。
> **核心立场**：内核只给**原语 ＋ 状态机骨架 ＋ 判定点 ＋ 钩子**；**"什么时候能开会、谁能开、几票算过、冻结期能不能发言、轮次怎么算完成、任务能否开始"全部由 settings／pack／中间件决定** ✓。

---

> ★★ **本章要教的 API（★ 轮 501 补 ✓）**：★ **`createMeeting({ … })`** ✓ 与 **`createBallot({ … })`** ✓ —— ★ **两个原语工厂**；★★ **另有 `DECISIVE_VOTE`** ✓ —— ★ **"决定性票"的判据常量**（★ 三值结论的由来 ✓）与 **`instantRunoffTally(…)`** ✓ —— ★ **排序复选计票** ✓。

## 0. 读法、条目模板与四条记账纪律

### 0.1 条目模板（本卷每一项基础设施都按此 11 字段写成一行）

`名称` ｜ **目的** ｜ **面向谁** ｜ **接口形状**（服务方法／工具／钩子／协议） ｜ **可调控族**（`vmu.<ns>.*` 通配） ｜ **相关错误码** ｜ **四条哲学**（自由度 F·可调控性 T·可定义性 D·扩展性 X） ｜ **实现要点** ｜ **依赖与前置** ｜ **成熟度**（**已实现 ✓ / 未实现 ✗**） ｜ **优先级**（P0–P3）。

**为什么统一模板**：本卷是"实现清单"，不是散文。缺任一字段 ⇒ 读者无法判断"这条能不能落地、归谁调、错了报什么"。

### 0.2 四条记账纪律（全卷适用；**v0.2 已与 Lead 解除"只用通配"后的口径对齐** ✓）

1. **键名纪律** ✓（v0.2 更新 ✗✓）：正文**可以写具体键名** ✓；**登记管线**是 `scripts/generate-planned-settings.mjs`（从各卷**发现**键 ⇒ 写入 `settings/planned.js`，类型 `planned`、默认 `null` ⇒ **未接线** ✓，不会把承诺当成实现 ✗），**由 Lead 跑 `--write` 归因** ✓；**既有已接线键**（如 `vmu.meetings.roundTimeoutMs` ✓）只作为"已实现"的证据 ✓。
2. **工具名纪律** ✗✓：宿主**实际注册**的工具（`vibe_vmu_status`／`set`／`middleware`／`records`／`script`／`pack`／`control`／`meeting`／`task` ✓）可直接写；**任何未注册的工具名必须写在"含标记词"的行上**（`未实现／未接线／规划／提案／待实现／目标形态／尚未／roadmap／⛔` ✓）。
3. **错误码纪律** ✗✓：正文**可以写具体码** ✓（v0.2 更新 ✗✓）；§20 全表列出**规划码**并全部列进给 Lead 的回报，由其登记到 `03-§8` ✓；**未登记的码在实现前不得被依赖** ✗。
4. **设计目标 vs 实现保证** ✗（v0.2 新增 ✓，与 17-§0.1/§0.2 同源）：凡**未标 ✓** 的机制，其"**机器强制**／**必须在…**／**断言**／**具名红**"一律是**设计验收目标** ✗，**不是今天的实现保证** —— 在实现并由门禁守住之前**不得据以推理** ✓（现状看各条"成熟度"、§17 门禁对照、§18 未核项 → `14-§2` ✓）。

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
| `meeting.quorum` | 会议 | **未实现 ✗**（★ **轮 196 → 203 的更正**：`vmu.meetings.quorumCap` **已接线 ✓** —— `quorumOf(m)` 按 "m = min(cap, 参与人数)" 施加上限 ✓，有上限时会议**永不要求超过实际在场人数** ✓，`0` 表示**无上限** ✓；★ **仍未实现的是本行这个【更高层的 `kernel.quorum.check(meeting)` 接口】** ⛔ —— 先前把两者混为一谈 ✗） | `{roster, present, absent, kind}` | `{met, required, have, lostPolicy?}` | 法定人数、流失后处理（休会/延期/降门槛/明确未决） | 未实现 ✗ | P0 |
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
- **法定人数（quorum）** ｜ 目的：让"够不够人"可判、可解释 ｜ 面向谁：主持人／全体 ｜ 接口形状：规划＝`kernel.quorum.check(meeting)`＋`meeting.quorum` 判定点 ⛔ 未实现（当前只有 pack 侧**供给** `vmu.meetings.quorumCap`（★ **无读取方** ✗，见 §1.3 的轮 196 实测） 等门槛做规则 ✓，会议原语**不含** quorum 检查 ✗） ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_MEETING_TOO_SMALL`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**三层门槛不得混用**（法定人数／本次投票成立／通过条件）；**流失后处理**必须事先写明（休会‖延期‖降门槛‖明确未决） ｜ 依赖：名册＋在场 ｜ 成熟度：**未实现 ✗**（pack 侧部分 ✓） ｜ 优先级：P0
- **在场/缺席/迟到/早退** ｜ 目的：到场口径决定分母 ｜ 面向谁：主持人 ｜ 接口形状：规划＝`kernel.attendance.mark(member,status)` ⛔ 未实现（当前"被问者终态"承担了在场语义 ✓） ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_NO_SUCH_OBJECT`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**未答不计分母、不算反对，且名单必列**（沿用定稿 D3 口径 ✓）；"唤醒失败"与"拒绝参加"分开记 ｜ 依赖：法定人数 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P0
- **观察员 / 列席 / 受邀者** ｜ 目的：把"信息来源"与"表决权"分开 ｜ 面向谁：主持人 ｜ 接口形状：规划＝席位类型 `observer|attendee|invitee`（`may()` 面已能表达 ✓，会议侧未区分 ✗） ｜ 可调控族：`vmu.meetings.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_NOT_MEMBER` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**非成员永不表决**（`ballot.eligible` 默认不含他们 ✓）；可被引用须先补记 ｜ 依赖：席位 ｜ 成熟度：**部分实现 ✓**（权限面）／**会议侧 ✗** ｜ 优先级：P1
- **委托与代理投票（proxy / delegation）** ｜ 目的：缺席者如何被"代表" ｜ 面向谁：成员 ｜ 接口形状：规划＝`kernel.delegations.grant/revoke` ⛔ 未实现（**且本卷建议默认不许代投** ✗，见 §3.3） ｜ 可调控族：`vmu.ballot.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：若启用，委托链必须**禁环**、可撤回、逐票留痕；**不得**把缺席沉默折算成票（I-3/R2 同族） ｜ 依赖：表决 ｜ 成熟度：**未实现 ✗**（默认禁用） ｜ 优先级：P3
- **远程/异步同步** ｜ 目的：异步成员也能"在场" ｜ 面向谁：全体 ｜ 接口形状：`deliver` 注入接缝（**已实现 ✓**：`openRound({ask})` 逐个投递 ✓）＋ 唤醒重试面（pack 侧**供给** `vmu.meetings.wakeRetries` ✗ —— ★ **轮 196 实测：无任何运行源读取它** ✓） ｜ 可调控族：`vmu.meetings.*` ｜ 错误码：`VMU_ENGINE_UNAVAILABLE`（无投递接缝 ✓）／`VMU_RESOURCE_BUDGET` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**没有接缝就具名拒**，绝不假装问过（11-§4.1 ✓） ｜ 依赖：投递接缝 ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
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
- **会议生命周期钩子** ｜ 目的：让中间件在"关键时刻"介入 ｜ 面向谁：M1/M2 中间件 ｜ 接口形状：**已注册 ✓**＝`meeting/round-start`／`meeting/round-end`／`meeting/motion`；**规划 ✗**＝`meeting/convened`／`opened`／`speech-requested`／`speech-granted`／`seconded`／`amendment`／`recess`／`resumed`／`adjourned`／`minutes-drafted` ｜ 可调控族：`vmu.middleware.*` ｜ 错误码：`VMU_MIDDLEWARE_REJECTED`／`VMU_MIDDLEWARE_FAILED` ｜ 哲学：F✓T✓D✓X（新钩子＝可扩展点 ✓） ｜ 实现要点：**钩子必须先注册再发**（05 号全表）；未实现的钩子不得写成"已生效" ✗ ｜ 依赖：`kernel/bus.js` ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P1

### 2.3 会议钩子与工具的成熟度小结

- **已实现钩子 ✓**：`meeting/round-start`、`meeting/round-end`（`bus.emit` 真生产者 ✓）。
- **已实现工具 ✓**：`vibe_vmu_meeting`（`list|open|speak|silent|close|ballot|vote|tally|reopen` ✓）。
- **规划工具 ✗**：`vibe_vmu_motion`（动议/附议/修正/搁置）、`vibe_vmu_agenda`（议程条目）、`vibe_vmu_committee`（委员会/子会）、`vibe_vmu_attendance`（在场/法定人数）—— **以上均未实现**（roadmap 见 §9）。

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
- **重开与复议（reopen / reconsider）** ｜ 目的：低成本纠错 ｜ 面向谁：全体（门槛可配） ｜ 接口形状：**原语已实现 ✓**＝`reopen(reason)`（旧结论留 history ✓）；**复议门槛＝已落 ✓**（`vmu.ballot.reopenFloor`，读者 `kernel/ballotbox.js` 的 `reopen()`：不达门槛 ⇒ `VMU_BALLOT_MIN_VOTES_NOT_MET` 并点名该键；`reopen()` 还必须给理由） ｜ 可调控族：`vmu.ballot.reopen*` ✓ ／`vmu.meetings.*` ｜ 错误码：`VMU_STATE`／`VMU_NOT_PERMITTED`／`VMU_REASON_REQUIRED`／`VMU_BALLOT_MIN_VOTES_NOT_MET` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：复议须有**明确发起人＋范围**（防滥诉）；复议期间的旧结论**仍然有效**直到新结论产生 ｜ 依赖：§3.1 ｜ 成熟度：**已实现 ✓**（复议门槛 ✓，发起人范围与会期约束仍规划） ｜ 优先级：P1
> ★★★ **分工的正式表述（轮 286）** ✓✓：**"对象标准"与"上限"不是【遗忘的项】，而是【领域常量】** ⇒ **依 `docs/10` §1 的总原则（**内核零策略，D5**：角色实例／阶段列表／本处的门槛常量都由 pack 定义 ✓），本仓【只提供机制与判据】，**不臆造它们** ✓。**（历史注记 · 已被取代 ✓）**：本段"接线前提／保持未接线"的结论自 **Round 3** 起**不再成立**，见下方就地更正 ✓ —— ★ **当时的"这是【分工】不是【缺失】"判断是对的，但结论已由实现推进** ✓。★ **门槛的现状（Round 3 实测 ✓✓，取代轮 285 的结论）**：**复议门槛由 `vmu.ballot.reopenFloor` 承载** —— `kernel/ballotbox.js` 的 `reopen()` **真读并决定**（不达门槛 ⇒ `VMU_BALLOT_MIN_VOTES_NOT_MET` 并在回执里**点名该键**）✓，该键已由 `PLANNED_BALLOT_KEYS` **移入 `WIRED_BALLOT_KEYS`**（`partition()` 仍 exact ✓）；而原 `vmu.meetings.` 家族的 `reconsiderFloor`（**该名已删**）**全仓零读者** ✗ ⇒ 已从 `settings/schema.js` 与 pack 清单**删除** ✓（"声明必须真有读者"）。★ **⇒ 该门槛因此【已经生效** ✓，不再依赖 `docs/04` 那句 `生效门槛 = max(对象标准, 它, 上限)` 里两个从未定义的量 ✓ —— **门槛就是 `vmu.ballot.reopenFloor` 本身**（0＝不设门槛）✓。
> ★ **就地更正（轮 284，实测 ✗✓）**：**上句说的 `reopen(reason)` 是【票箱层的原语**（`kernel/ballot.js` L241 ✓ —— **只允许 `tallied` 重开 ✓、旧结论进 history ✓**；运行时证据 `tests/vmu-ballot.test.mjs` L97-100 ✓**）** ✗ ⇒ ★★ **本卷这一面（`kernel/meetings.js`）【没有 `reopen()`** ✗ —— **在该文件里 `reopen` 只与键名无关地出现 0 次 ✓**）** ✓；**`kernel/ballotbox.js` 早已带同样结论的更正（L60-63 ✓）** ✓。**复议门槛＝规划** ✓，**且缺的【不是 pack 示例**（`packs/institute-min/index.js` L51 已设置该键 ✓**）**，而是**内核侧那个模型**（**生效门槛 = max(对象标准, 它, 上限)** ✓ —— **"对象标准"与"上限"在本面【均无定义** ✗**）**）** ✓。
- **票数审计与复算（audit / recount）** ｜ 目的：结论可被第三方复算 ｜ 面向谁：审计者／上级 ｜ 接口形状：**部分实现 ✓**＝`history()`（含被拒项 ✓）＋`status().votes/byKind/refused` ✓；独立复算器＝规划 ✗ ｜ 可调控族：`vmu.audit.*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT`／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X ｜ 实现要点：复算**只读**；必须能回答"有效票集合是什么、规则是哪条、谁判的" ｜ 依赖：`history` ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P1

### 3.4 表决判定点与钩子（成熟度）

- **已实现判定点 ✓**：`ballot.can-open`／`ballot.eligible`／`ballot.frozen`／`ballot.cast-valid`／`ballot.tally`；
- **已实现钩子 ✓**：`ballot/cast`（可拒绝 ✓）、`ballot/tally`（可覆盖计票 ✓）；
- **规划 ✗**：`ballot.after-decided`／`ballot/quorum`／`ballot/recuse`／`ballot/freeze-check`／`ballot/recount`／`ballot/secret-scope` 与 `ballot/opened|frozen|unfrozen|closed|reopened|audited` 钩子（**均未实现**）。

---

## 4. 工作流 · 任务板 · 控制流

### 4.1 已实现的任务/台账 API（**精确，按 `kernel/tasks.js`／`kernel/work.js` ✓**）

- `vmu.tasks` ✓（服务）：`create({title,objective?,owner?,deps?,priority?})`、`assign(id,who,{expectedRevision?})`、`transition(id,to,{reason?,expectedRevision?})`、`brief(id,text,{by?,expectedRevision?})`、`clearBrief(id,{expectedRevision?})`、`list()`、`stage()`、`advance({to,reason})`（**先过阶段门** ✓）、`rollback({reason})`、`brief(id)`／`briefOf(id)`／`clearBrief(id)`（任务简报＝给负责人的执行流程 ✓）、`history(id?)`、`status()`；具名拒：`VMU_STATE`／`VMU_RESOURCE_BUDGET`／`VMU_NO_SUCH_OBJECT`／`VMU_INVALID_ARGUMENT` ✓。
- `vmu.work` ✓（服务）：`start({owner,kind,objective})`、`settle(id,{outcome})`、`interrupt(id,reason)`、`recover({reason})`、`list()`、`pending()`、`interrupted()`、`status()` —— **在途工作台账**（重启后"谁还有活没干完" ✓）。
- 钩子 ✓：`task/assign`、`task/transition`、`settle/before`、`settle/after` ✓；工具面 `vibe_vmu_task`（`list|create|assign|transition|stage|advance|brief|history` ✓）。
- 机器强制 ✓：**依赖未满足不得 start**；**阶段门**；**暂停中新建/转换被拒**（I-5 ✓）；**任务上限** `vmu.tasks.maxOpenTasks`（`VMU_RESOURCE_BUDGET` ✓）。
- ★★ **版本前置条件 ✓（轮 318 实现）**：**每条任务记录带 `revision`**（创建即 1 ✓，**每次被接受的写入递增** ✓）；**四个变更点**（`assign`／`transition`／`brief`／`clearBrief` ✓）接受 **`expectedRevision`** —— ★ **声明了过期版本 ⇒ 具名拒 `VMU_TASK_STALE_REVISION`，【绝不合并**】✓；★ **开关 `vmu.tasks.requireExpectedRevision`（默认 `false`）打开后，不声明版本的写入同样被拒** ✓ ⇒ **同 v5r 的严格语义，且默认不破坏单写入者调用者** ✓。

> ★ **口径（轮 319 更正）** ✗✓：**`advance`／`rollback` 【不是任务变更**】，而是**跑的【阶段机】移动**（`stageIndex` ✓）⇒ **版本前置条件对它们不适用** ✓（**上一轮把它列为"未接入"是归类错误** ✗）。★ **但"两个人同时推进同一阶段机"是一个真实的可能消费者** ✓ ⇒ **阶段级的前置条件（"我看到的是第几阶段"）作为独立问题登记** ✓（**未实现** ✗）。


### 4.2 工作流广度清单（一行式条目）

- **任务 DAG 与依赖（完成/开始、软/硬）** ｜ 目的：让"顺序"可判而非靠自觉 ｜ 面向谁：任务负责人／调度 ｜ 接口形状：**部分实现 ✓**＝`deps[]`＋未满足即拒（`create/transition` 已做 ✓）；**依赖类型**（finish-to-start／start-to-start／软硬）＝规划 ✗ ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_NO_SUCH_OBJECT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**成环必须拒**（当前有依赖检查 ✓，环检测能力见 `status`）；软依赖＝可越过的提醒，硬依赖＝机器拒 ｜ 依赖：`vmu.tasks` ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P0
- **阶段与门（准入/准出）** ｜ 目的：把"能开始/算完成"变成可换的判定 ｜ 面向谁：调度／负责人 ｜ 接口形状：**已实现 ✓**＝`stage()`／`advance({to,reason})`（先过 `stageGate` ✓）／`rollback()`；**门类型**（准入/准出/验收）＝规划 ✗ ｜ 可调控族：`vmu.tasks.*`／`vmu.workflow.gates*`（规划） ｜ 错误码：`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：阶段是**声明式列表**（`vmu.tasks.stages` ✓，未声明 ⇒ 零阶段、不假装有流程 ✓） ｜ 依赖：`vmu.tasks` ✓ ｜ 成熟度：**已实现 ✓**（阶段机） ｜ 优先级：P0
- **并行与抢占** ｜ 目的：资源有限时的调度 ｜ 面向谁：调度 ｜ 接口形状：**部分实现 ✓**＝`vmu.limits.maxParallel` ✓（并发上限）；抢占式调度＝规划 ✗ ｜ 可调控族：`vmu.workflow.*`（规划）／`vmu.limits.*` ｜ 错误码：`VMU_RESOURCE_BUDGET` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**抢占必须留下被打断者的可恢复记录**（`work.interrupt()` ✓ 已有原语） ｜ 依赖：在途台账 ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P1
- **优先级与截止** ｜ 目的：先做要紧事 ｜ 面向谁：调度／主持人 ｜ 接口形状：**部分实现 ✓**＝`create({priority})` ✓；截止/逾期＝规划 ✗ ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：优先级**只影响顺序**，不得改变门槛；逾期是提醒不是自动失败 ｜ 依赖：任务台账 ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P2
- **重试与退避** ｜ 目的：瞬时失败不惊动上级 ｜ 面向谁：调度 ｜ 接口形状：规划＝`task.retry-policy` 判定点 ⛔ 未实现 ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_ENGINE_UNAVAILABLE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**任何重试/等待必须有界**（禁止无界循环 ✗）；退避＋抖动＋上限＋放弃后的升级路径 ｜ 依赖：在途台账 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **超时、中断、暂停恢复** ｜ 目的：别让一次卡死拖垮全所 ｜ 面向谁：调度／主持人 ｜ 接口形状：**已实现 ✓**＝`vibe_vmu_control {pause|resume|stop}` ✓＋`work.interrupt()`／`recover()` ✓；**超时**＝部分（会议轮次超时 ✓，任务超时规划 ✗） ｜ 可调控族：`vmu.control.*`／`vmu.limits.*` ｜ 错误码：`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：暂停**真门禁**（I-5 ✓）；恢复必须**逐条列出接回了什么**（`recover()` ✓） ｜ 依赖：控制面 ✓ ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **检查点 / 回滚 / 补偿** ｜ 目的：可回到"上一个确定状态" ｜ 面向谁：负责人／调度 ｜ 接口形状：规划＝`kernel.checkpoints.save/restore`＋补偿动作注册 ⛔ 未实现（当前只有 `tasks.rollback()`＝**阶段回滚** ✓，不是状态快照 ✗） ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_STATE`／`VMU_STORE_FAILED`／`VMU_IO_FAILED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：检查点＝**耐久投影**（复用 `vmu.store` ✓）；补偿**不得**自动删除别人的工作 ｜ 依赖：`vmu.store` ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **预算（令牌/墙钟/工具次数/子代理数）与配额公平** ｜ 目的：把"昂贵操作"变成可计量资源 ｜ 面向谁：使用者／调度 ｜ 接口形状：**已实现 ✓**＝`vmu.limits.*`（`maxParallel`／`toolCallsPerTurnCap`／`memoryCeilingMb`／`wallClockMs`／`maxLiveMembers` ✓）＋`VMU_RESOURCE_BUDGET` ✓；**公平/配额分配**＝规划 ✗ ｜ 可调控族：`vmu.budget.*`（规划）／`vmu.limits.*` ｜ 错误码：`VMU_RESOURCE_BUDGET` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**机器强制、不靠提示词**（v5r S25-D 纪律 ✓）；触界必须给"当前值＋上限"（`VMU_RESOURCE_BUDGET` 文案要求 ✓） ｜ 依赖：`vmu.limits` ✓ ｜ 成熟度：**部分实现 ✓** ｜ 优先级：P0
- **看板列与 WIP 限制** ｜ 目的：限制在制品、暴露瓶颈 ｜ 面向谁：调度／主持人 ｜ 接口形状：**部分 ✓**＝`kernel.board.columns` ✓（★ 轮 553 实测：★ 存在 ✓）＋规划 `kernel.board.wip`（★ 真名是 `setWip` ✓）；宿主面 `vibe_vmu_board` **✓ 已实现**（轮 541 ✓） ｜ 可调控族：`vmu.board.*`（规划） ｜ 错误码：`VMU_RESOURCE_BUDGET`／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：WIP 超限＝**拒绝把任务拉进该列**（不是自动丢弃）；列＝阶段机的一种视图（不重复造状态） ｜ 依赖：阶段机 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **角色与责任（RACI）** ｜ 目的：谁负责/谁批准/谁咨询/谁知会 ｜ 面向谁：任务负责人／上级 ｜ 接口形状：规划＝任务字段 `raci{}`＋`task.can-assign` 判定点 ⛔ 未实现 ｜ 可调控族：`vmu.workflow.*`（规划） ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：RACI 只做**权限与提醒**，不额外制造审批层级；批准人缺位时的升级路径要写明 ｜ 依赖：席位 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **交接与升级（handover / escalation）** ｜ 目的：不让责任悬空 ｜ 面向谁：负责人／上级 ｜ 接口形状：**在途台账已实现 ✓**＝`work.interrupt()`＋`recover()`＋任务简报 `brief()` ✓；**交接单/上下文压缩包的本体定义在 17-§11** ✓（本卷**不重复定义** ✗）；**升级链**＝规划 ✗ ｜ 可调控族：`vmu.workflow.*`（升级，本卷）＋17 的 `vmu.handover.*`（交接本体） ｜ 错误码：`VMU_STATE`／`VMU_NO_SUCH_OBJECT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：本卷只保证"在途不丢"；"交给谁、到什么时候、验收什么"由 17-§11 规定 ✓ ｜ 依赖：在途台账 ✓ ｜ 成熟度：**部分实现 ✓**（台账）／交接单 ✗（见 17） ｜ 优先级：P1
- **仲裁与冲突解决** ｜ 目的：两个成员僵住时有出路 ｜ 面向谁：主持人／上级 ｜ 接口形状：**仲裁本体定义在 17-§6** ✓（仲裁者选择/回避**由 17 定义**（17-§6／17-§20.4）；本卷**不重复定义** ✗，也**不写其键名** —— 免得生成管线按最低卷号误归因到 08 ✓）；本卷只提供**升级时限与目标**（`vmu.workflow.escalationAfterMs`／`escalationTarget` ✓）与会议/表决面（§2／§3 ✓） ｜ 可调控族：`vmu.workflow.*`（升级，本卷）＋17 的 `vmu.conflict.*`／`vmu.arbitration.*`（仲裁开关/效力由本卷 §19.6 定义 ✓） ｜ 错误码：`VMU_STATE`／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：本卷只做"到点提醒"；"谁判、怎么判、判了算不算"由 17-§6 规定 ✓；仲裁结论＝决议（进纪要）✓ ｜ 依赖：§2 会议＋§3 表决＋17-§6 ｜ 成熟度：**08 侧升级时限部分 ✓／仲裁本体见 17 ✗** ｜ 优先级：P3（本卷侧）
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

> **实现状态（诚实 ✓）**：本节 **8 条全部已实现** ✓（落在 `kernel/meeting.js`／`kernel/ballot.js`／`kernel/tasks.js`／`kernel/members.js` 与控制面），并各有具名场景与门禁（§8）✓ —— 与 **17 卷的"设计目标"（S-1…S-6，多为规划 ✗）** 不同：**不要**把 17 的计划项读成本节的实现项 ✗（交界见 §24 ✓）。

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
| `Task`（轮 318 ✓） | **`revision`**（**每次被接受的写入递增** ✓；`expectedRevision` 与之比对 ⇒ 过期写入具名拒 ✓） |
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
| `vmu.members` | `roles()`／`roster()`／`hire({id,slot})`／`assignRole(id,slot)`／`end(id,reason)`／`wake(id,ask,{role?,phase?})`／`may(id,permission)`／`selfReport(id,fields,{by?})`／`selfReports()`／`selfReportHistory(id)`／`status()` |
| `vmu.paper` ✓（轮 135 新增） | `start({title,sections,contributors,editor})→{ok,paperId,sections,editor,outstanding}`／`contribute({paperId,section,by,artifact?})→{ok,paperId,section,by,artifact,outstanding}`／`finalize({paperId,by})→{ok,paperId,state,by,gaps,receipt,droppedTrail}`（**异步** ✓）／`status(paperId?)`／`keysUsed()`／`partition()` |
| **多成员合著（manuscript）的编排规则** ✓ | **① 每节必须【有人认领】** ✓（无主章节具名拒 ✗ —— "无人承诺的允诺"）；**② 归属机器强制** ✓（只有被指派的成员能交那一节，拒绝时**同时点名 owner 与调用者** ✓）；**③ 一节只交一次** ✓（不静默覆盖 ✗）；**④ 定稿闸**：缺节时**逐节点名到人** ✓，除非 pack 显式关掉 `requireAllSections`，**此时缺口随回执一起走** ✓（"缺口是信息，不是沉默" ✓）；**⑤ 定稿人规则可调** ✓（`vmu.paper.finalizer`＝`editor｜contributor｜any`，**未知值回落 editor 而非 any** ✓）；**⑥ 登记【委托】给注入的 `register` 接缝** ✓（缺接缝即具名拒 `VMU_ENGINE_UNAVAILABLE` ✗ —— **绝不假装登记成功** ✓）。**可调键 3 个** ✓：`vmu.paper.requireAllSections`（bool，默认 **true** ✓）／`vmu.paper.finalizer`（enum，默认 **editor** ✓）／**`vmu.paper.maxSections`（int ≥0，默认 `0`＝不限 ✓；轮 145 接线**：**超限在 `start()` 里具名拒 `VMU_RESOURCE_BUDGET`，消息同时给实际数与上限 ✓**，且**尺寸拒绝优先于归属拒绝** ✓）；**未接 1 个**（逐个点名 ✗）：`vmu.paper.retentionMs`（无持久化面 ✓） |
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
| `vibe_vmu_minutes`（**✓ 已实现，轮 517**） | `action:'list'\|'draft'\|'confirm'\|'append'\|'actions'\|'status'`、`id`、`kind`、`text`、`member`、`session` | 纪要与确认（★ 工具只做寻址与调用 ✓） |
| `vibe_vmu_committee`（⛔ 未实现，roadmap） | `action:'spawn'\|'report'\|'list'`、`parentId`、`roster`、`agenda` | 委员会/子会/全体委员会 |
| `vibe_vmu_board`（，roadmap） | `action:'columns'\|'wip'\|'move'\|'metrics'`、`column`、`limit` | 看板列与 WIP |
| `vibe_vmu_workflow`（⛔ 未实现，roadmap） | `action:'deps'\|'gate'\|'retry'\|'checkpoint'\|'compensate'`、`id`、`to`、`reason` | DAG/门/重试/检查点 |
| `vibe_vmu_budget`（，roadmap） | `action:'status'\|'reserve'\|'release'`、`scope`、`amount` | 预算与配额公平 |
| `vibe_vmu_scheduler`（⛔ 未实现，roadmap） | `action:'at'\|'on'\|'list'\|'cancel'`、`at`、`event`、`action` | 自动触发 |
| `vibe_vmu_metrics`（⛔ 未实现，roadmap） | `action:'window'\|'throughput'\|'cycle'\|'backlog'`、`windowMs` | 度量 |
| `vibe_vmu_audit`（**✓ 已实现（轮 554）**） | `action:'trace'\|'recount'\|'export'`、`id`、`from`、`to` | 审计与复算 | **capability: the `audit` action of `vibe_vmu_fairness`** ✓ (round 542)

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
| `meeting/convened`／`meeting/opened`／`meeting/speech-requested`／`meeting/speech-granted`／`meeting/interrupted`／`meeting/seconded`／`meeting/amendment`／`meeting/recess`／`meeting/resumed`／`meeting/adjourned`／`meeting/minutes-drafted` | 见 §10 字段（✗ 规划；`meeting/motion` 已注册 ✓） | 视点而定 | ✗ |
| `ballot/opened`／`ballot/frozen`／`ballot/unfrozen`／`ballot/closed`／`ballot/reopened`／`ballot/audited` | 见 §10.4 | 部分可拒绝 | ✗ |
| `task/created`／`task/deps-changed`／`task/gate-check`／`task/retry`／`task/checkpoint`／`task/escalated` | 见 §10.5 | 部分可拒绝 | ✗ |
| `budget/warn` | 见 §10.5 | 观测型 | ✓ |
| `board/wip-exceeded`／`trigger/fired`／`committee/formed`／`committee/reported` | 见 §10.5 | 观测型 | ✗（★ **域事件**：★ 在自己的命名空间里 emit ✓ ⇒ **中间件要挂它必须先 `declareTopic`** ✓） |

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
| `vmu.tasks.*` | `stages`（阶段机，默认空 ✓）／`maxOpenTasks`（默认 0＝无限 ✓）／★ **`requireExpectedRevision`（默认 `false`** ✓**）** | 零机制（无阶段、无上限、只在声明时校验版本 ✓） | 数组/int/bool | 重启/立即 | 所办 | ★ **三项均已接线 ✓** |
| `vmu.board.*` | 列定义／WIP 上限／泳道／老化提醒 | 无列（零机制 ✓） | 对象/int/ms | 立即 | 所办 | ✗ |
| `vmu.budget.*` | 令牌/回合/子代理配额与公平策略（**设计原则**：实现时机器强制；**当前仅** `vmu.limits.*` 已实现 ✓，本族为**计划键** ✗） | 未声明 | 对象 | 立即 | 所办 | ✗ |
| `vmu.control.*` | 暂停范围／看门狗间隔／空闲策略／降级档位 | 未声明（无定时器 ✗） | 对象/ms | 立即 | 所办 | ✗ |
| `vmu.schedule.*` | 触发器（时间/事件）与动作（发钩子/提示）—— ★ **规范族** ✓；`vmu.scheduler.*` 是**别名**（轮 181 更正：此行原把孪生名当规范族 ✗，与 `kernel/scheduler.js` 的 INTEGRATOR RULING 相反 ✗） | `[]` | 对象[] | 立即 | 所办 | ✗ |
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

> 说明：本表用**具体键名**（先前版本的"只用通配"约束已由 Lead 解除 ✓）。**既有键**（`vmu.meetings.quorumRule/quorumCap/verdictMaxRounds/hardLimitMs/wakeRetries/roundTimeoutMs/quotesPerMessageMax/quoteDepthMax`、`vmu.ballot.reopenFloor`、`vmu.tasks.stages/maxOpenTasks`、`vmu.limits.*`）**不重复登记** ✓，只在"备注"里指出被本表哪族扩写。
> **实现状态（诚实 ✗）**：本表**除上述既有键外全部是"计划键"** ✓ —— 由生成管线写入 `settings/planned.js`（`type:'planned'`、`def:null`、**未接线** ✓）；**不得**把它们当作今天的机器保证（§0.2 纪律 ④ ✓）。
> **跨卷**：与 17 卷共享的键（11 个）**定义在本卷**、17 只引用 ✓（逐条见 **§24 交界表** ✓）。
> 列义：**键** ｜ **类型** ｜ **默认** ｜ **取值域** ｜ **谁可改** ｜ **热改** ｜ **说明（一句话）**。

### 19.1 会议（`vmu.meetings.*`）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.meetings.quorumMin` | int | 0 | ≥0 | 所办 | 下轮 | 法定人数绝对下限（0＝只看比例） |
| `vmu.meetings.quorumRatio` | number | 0 | 0..1 | 所办 | 下轮 | 法定人数比例（0＝只看绝对下限） |
| `vmu.meetings.quorumLossPolicy` | enum | `suspend` | `suspend｜continue｜recess` | pack | 下轮 | 人数流失后的合法出路（**不得**默认通过/否决）★ **R32 起以实测值域为准**（本行原计划 `recess｜defer｜lower｜undecided`／默认 `undecided` **从未实现**；实测值域＝读取侧 `kernel/meetingdomain.js`，与 `settings/schema.js:1059` 逐元素相同，实测默认 `suspend`） |
| `vmu.meetings.quorumRecountMs` | ms | 0 | ≥0 | 所办 | 立即 | 流失后复算法定人数的周期 |
| `vmu.meetings.unansweredInDenominator` | bool | false | bool | 所办 | 立即 | 未答是否计入分母（默认**不计**） |
| `vmu.meetings.attendanceMode` | enum | `roster` | `roster｜signin｜quorum-only` | 所办 | 立即 | 在场靠点名还是被问者终态自动推断 ★ **R32 起以实测值域为准**（本行原计划 `manual｜auto`／默认 `auto` **从未实现**；实测值域＝`kernel/meetingdomain.js`，与 `settings/schema.js:1058` 逐元素相同，实测默认 `roster`） |
| `vmu.meetings.lateAfterMs` | ms | 0 | ≥0 | 所办 | 立即 | 超过多久到场算迟到 |
| `vmu.meetings.leaveEarlyPolicy` | enum | `allow` | `allow｜note｜deny` | 所办 | 立即 | 早退如何记账 ★ **R32 起以实测值域为准**（本行原计划 `absent｜excused`／默认 `excused` **从未实现**；实测值域＝`kernel/meetingdomain.js`，与 `settings/schema.js:1061` 逐元素相同，实测默认 `allow`） |
| `vmu.meetings.wakeFailurePolicy` | enum | `refuse` | `refuse｜skip｜retry` | pack | 立即 | 唤醒失败 ≠ 反对（默认记未达）★ **R32 起以实测值域为准**（本行原计划 `unreached｜absent`／默认 `unreached` **从未实现**；实测值域＝`kernel/meetingdomain.js`，与 `settings/schema.js:1066` 逐元素相同，实测默认 `refuse`） |
| `vmu.meetings.speechDefaultMs` | ms | 300000 | ≥0 | 所办 | 立即 | 单人发言默认时间箱（0＝不限） |
| `vmu.meetings.speechMaxMs` | ms | 600000 | ≥0 | 所办 | 立即 | 单次发言硬上限 |
| `vmu.meetings.speechExtendMs` | ms | 60000 | ≥0 | 主持人 | 立即 | 一次延长的步长 |
| `vmu.meetings.speechExtendMax` | int | 1 | ≥0 | 主持人 | 立即 | 延长次数上限 |
| `vmu.meetings.speechQuotaPerMember` | int | 0 | ≥0 | 所办 | 下轮 | 每人发言次数配额（0＝不限） |
| `vmu.meetings.orderMode` | enum | `fifo` | `fifo｜round-robin｜chair｜random` | 主持人 | 下轮 | 发言顺序模式 ★ **R14 起以实测值域为准**（本行原计划的 `hands｜round-robin｜seat｜weighted｜unspoken-first` **从未实现**；实际默认取自模块源码 `fifo`，`random`＝确定性可审计序，见 §25.16） |
| `vmu.meetings.interruptAllow` | string[] | `[]` | 子集 `{yield,point-of-order,objection,privileged}` | 主持人 | 立即 | 允许的打断类型 |
| `vmu.meetings.interruptQuota` | int | 0 | ≥0 | 主持人 | 立即 | 每人每轮打断配额 |
| `vmu.meetings.typeCatalog` | string[] | `[]` | kind 白名单 | pack | 重启 | 允许的会议类型（空＝不校验） |
| `vmu.meetings.liveCap` | int | 50 | ≥1 | 所办 | 重启 | 会话内活对象上限（超出按最旧逐出并计数） |
| `vmu.meetings.materialsRequired` | bool | false | bool | 主持人 | 下轮 | 是否要求议程条目带材料 |
| `vmu.meetings.confirmPreviousMinutes` | bool | false | bool | 主持人 | 下轮 | 开场是否强制确认上次纪要 |
| `vmu.meetings.budgetTurns` | int | 0 | ≥0 | 所办 | 立即 | 会议级回合预算（0＝不限） |
| `vmu.meetings.budgetTokens` | int | 0 | ≥0 | 所办 | 立即 | 会议级令牌预算 |
| `vmu.meetings.budgetWallMs` | ms | 0 | ≥0 | 所办 | 立即 | 会议级墙钟预算 |
| `vmu.meetings.budgetOnExceed` | enum | `refuse` | `refuse｜warn｜extend` | 所办 | 立即 | 触界行为（**默认只广播，绝不自动散会** ✗）★ **R32 起以实测值域为准**（本行原计划 `broadcast｜refuse｜pause`／默认 `broadcast` **从未实现**；实测值域＝`kernel/meetingdomain.js`，与 `settings/schema.js:1060` 逐元素相同，实测默认 `refuse`） |
| `vmu.meetings.verbatimEnabled` | bool | false | bool | 所办 | 立即 | 逐字稿开关（默认关，成本） |
| `vmu.meetings.verbatimRetentionMs` | ms | 0 | ≥0 | 所办 | 立即 | 逐字稿保留期（0＝随会话） |
| `vmu.meetings.confidentialityDefault` | enum | `internal` | `public｜internal｜restricted` | 主持人 | 下轮 | 默认保密级别 ★ **R32 起以实测值域为准**（本行原计划 `open｜closed｜sealed`／默认 `open` **从未实现**；实测值域＝`kernel/meetingdomain.js`，与 `settings/schema.js:1064` 逐元素相同，实测默认 `internal`） |
| `vmu.meetings.confidentialityQuotePolicy` | enum | `allow` | `allow｜redact｜deny` | 主持人 | 下轮 | 闭门内容的引用策略 ★ **R32 起以实测值域为准**（本行原计划 `allow｜fold｜deny`／默认 `fold` **从未实现**；实测值域＝`kernel/meetingdomain.js`，与 `settings/schema.js:1065` 逐元素相同，实测默认 `allow`） |
| `vmu.meetings.appealScope` | enum | `all` | `all｜procedural｜none` | pack | 下轮 | 申诉受理范围 ★ **R32 起以实测值域为准**（本行原计划 `procedural｜all｜off`／默认 `procedural` **从未实现**；实测值域＝`kernel/meetingdomain.js`，与 `settings/schema.js:1063` 逐元素相同，实测默认 `all`） |
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
| `vmu.minutes.detail` | enum | `normal` | `brief｜normal｜full` | 所办 | 下轮 | 纪要详略（**以实现名为准** ✓：`kernel/minutes.js` 真读它 ✓；原拟名 `vmu.meetings.minutesDetail` 作废 ✗ —— 独立批评者指出"同一旋钮两个名字" ✗，此处按**已接线的那一个**统一 ✓）★★ **R32 更正（2026-10-15，读码核过）**：上面那句"`vmu.meetings.minutesDetail` **作废**"**不再成立** —— 它现在**已被声明**（`settings/schema.js:1062`：`enum`，域 `brief｜full`，默认 `brief`）且**真被读**（`kernel/meetings.js:59/87/925` 的 `K.minutesDetail`；域表在 `kernel/meetingdomain.js:25`）⇒ **两个名字是不同的旋钮**：`vmu.minutes.detail`（`kernel/minutes.js:28` 读，域 `brief｜normal｜full`）与 `vmu.meetings.minutesDetail`（`kernel/meetings.js:925` 读，域 `brief｜full`）。★ **两者的接线状态以 `docs/04 §11` 的"接线"列为准**（该列由设置表维护），**不要按本行的历史叙述推断** |
| `vmu.meetings.minutesIncludeRefused` | bool | true | bool | pack | 下轮 | 纪要必须含被拒项（**建议恒 true** ✓） |
| `vmu.meetings.minutesActionsRequired` | bool | false | bool | pack | 下轮 | 决议是否必须带行动项 |
| `vmu.meetings.minutesRetentionMs` | ms | 0 | ≥0 | 所办 | 立即 | 纪要保留期 |

> **备注**：`vmu.meetings.quorumRule／quorumCap／verdictMaxRounds／hardLimitMs／wakeRetries／roundTimeoutMs／quotesPerMessageMax／quoteDepthMax` 与 `vmu.ballot.reopenFloor` 为**既有键**（本族基线 ✓）；本表是它们的**扩写**。

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
| `vmu.ballot.reopenFloor` | int | 0 | ≥0 | pack | 下一次 | **复议门槛（0＝不设门槛）**：`kernel/ballotbox.js` 的 `reopen()` **真读并决定**（不达门槛具名拒且点名本键） |
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
| `vmu.schedule.triggers` | object[] | `[]` | `{id,at/on,action,enabled}[]` | 所办 | 立即 | 触发器表（**轮 106 更正**：规范族是 `vmu.schedule.*` ✓；此前写的孪生名（`scheduler.triggers`，**此处不写全前缀以免被生成器当成声明源** ✗✓）已改为规范名，且模块**不再读取孪生名** ✓） |
| `vmu.schedule.maxPending` | int | 8 | ≥0 | 所办 | 立即 | 触发器上限（**轮 106 更正**：原写作孪生名 `scheduler.maxTriggers` ✗ ⇒ 改规范名 ✓） |
| `vmu.schedule.timeSource` | enum | `clock` | `clock｜host-timer` | 所办 | 重启 | 时间源（**轮 106 更正**：原写作孪生名 `scheduler.timeSource` ✗ ⇒ 改规范名 ✓；`host-timer` **未接线** ✗） |
| `vmu.schedule.actionsAllowed` | string[] | `['emit-hook','prompt']` | 子集（**不含改状态** ✗） | pack | 立即 | 触发器允许的动作（**轮 106 更正**：原写作孪生名 `scheduler.actionsAllowed` ✗ ⇒ 改规范名 ✓） |
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
| `vibe_vmu_minutes` | **✓ 已实现（轮 517）** | 纪要/确认/追加/动作/列表/状态 |
| `vibe_vmu_committee` | **未实现 ✗（规划）** | 子会/报告 |
| `vibe_vmu_board` | ****✓ 已实现（轮 522）**** | 列/WIP/度量 |
| `vibe_vmu_workflow` | **未实现 ✗（规划）** | 依赖/门/重试/检查点/补偿 |
| `vibe_vmu_budget` | ****✓ 已实现（轮 523）**** | 预算状态/预留/释放 |
| `vibe_vmu_scheduler` | **未实现 ✗（规划）** | 触发器 |
| `vibe_vmu_metrics` | **未实现 ✗（规划）** | 度量窗口/指标 |

### 21.3 钩子（`VU_HOOKS`）

| 钩子 | 是否已注册 | 可拒绝? |
|---|---|---|
| `meeting/round-start`／`meeting/round-end` | **已注册 ✓** | 前者可拒 ✓ |
| `ballot/cast`／`ballot/tally` | **已注册 ✓** | 前者可拒 ✓／后者可覆盖计票 ✓ |
| `task/assign`／`task/transition`／`settle/before`／`settle/after`／`control/paused`／`control/resumed`／`control/heartbeat` | **已注册 ✓** | 视点而定 ✓ |
| `meeting/convened`／`meeting/opened`／`meeting/speech-requested`／`meeting/speech-granted`／`meeting/interrupted`／`meeting/seconded`／`meeting/amendment`／`meeting/recess`／`meeting/resumed`／`meeting/adjourned`／`meeting/minutes-drafted` | **未注册 ✗（规划）**（`meeting/motion` 已注册 ✓） | 见 §11.4 |
| `ballot/opened`／`ballot/frozen`／`ballot/unfrozen`／`ballot/closed`／`ballot/reopened`／`ballot/audited` | **未注册 ✗（规划）** | 部分可拒 |
| `task/created`／`task/deps-changed`／`task/gate-check`／`task/retry`／`task/checkpoint`／`task/escalated` | **未注册 ✗（规划）** | 部分可拒 |
| `board/wip-exceeded`／`trigger/fired`／`committee/formed`／`committee/reported` | **未注册 ✓（规划；★ 域事件，需 `declareTopic` ✓）** | 观测型 |
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
6. **该键 与 `vmu.limits.wallClockMs` 的关系**（两个都像"多久没动" ✗）⇒ 建议：只留 `vmu.limits.wallClockMs`，该键 不新增。★ **该键已退役（轮 289）** ✗：**依本条自身的裁定** ✓ —— **它不再声明、不再登记，**且本条【不再点它的名**（审计要求：卷里出现的每个键名都必须在设置表里存在 ⇒ 退役键的名字只留在台账 ✓）**）** ✓。
7. **§20 的 55 个码是否需要合并**（例如把 `VMU_MEETING_*` 与 `VMU_MOTION_*` 合成 `VMU_MEETING_PROCEDURE_*`）⇒ 影响 03-§8 的体量。
8. **`vmu.metrics`／`vmu.audit` 是否要独立工具面**（§21.2 规划了两个）⇒ 或并入 `vibe_vmu_records`／`status`。

---

## 24. 交界表：与 17 卷的分工（**谁定义／谁引用**；独立批评者第 5 轮 X1 的处置 ✓）

### 24.1 分界规则（三条判据；与 17-§27.1 镜像 ✓）

| 判据 | 归谁 | 例子 |
|---|---|---|
| **机制/程序**：怎样开会、怎样表决、怎样推进阶段、怎样限流与计量 | **本卷（08）定义** ✓ | 会议状态机、三层门槛、表决方法族、阶段门、看板 WIP、预算硬门、控制流、升级时限 |
| **社会关系/身份**：谁是谁、凭什么被选中、委托给谁、谁来仲裁、记忆与技能归谁、如何交接、机构怎么自组织 | **17 定义** ✓ | 席位与任职、委托链、信任与声誉、仲裁本体、经验卡与技能库、竞标、交接包、拓扑、宪章、身份归属、公平、人类在环 |
| **共享项**（两卷都用的键/码） | **定义留在本卷（08）** ✓（生成管线按最低卷号归因 08 ✓）／**17 只引用** ✗ | §24.2／§24.3 逐条 |

**为什么共享项留 08**：① 它们本质是**程序性**的（表决/预算/审计/工作流）⇒ 放社会卷会让机制定义分裂 ✗；② 生成管线按**最低卷号**归因 ⇒ 两处都写会让读者以为有两个来源 ✗；③ 17 的价值在"用在什么社会场景"，而不是重抄机制 ✓。

### 24.2 共享**键**（11 条）——本卷定义，17 只引用 ✓

| 键 | 本卷的登记位置 | 17 的用到处 | 归 08 的理由 |
|---|---|---|---|
| `vmu.workflow.escalationAfterMs` | §19.5 | 17-§6 升级 | 时限是工作流机制 ✓ |
| `vmu.workflow.escalationTarget` | §19.5 | 17-§6 升级 | 目标对象是程序配置 ✓ |
| `vmu.workflow.claimRequired` | §19.5 | 17-§10 认领 | 认领门属任务板 ✓ |
| `vmu.ballot.reopenInitiatorScope` | §19.4 | 17-§7 撤回共识 | 复议门槛属表决（防滥诉）✓ |
| `vmu.ballot.reopenFloor` | §19.4 | 17-§7 撤回共识 | 同上 ✓ |
| `vmu.ballot.secrecy` | §19.4 | 17-§16 化名与匿名 | 记名/不记名属表决 ✓ |
| `vmu.minutes.dissentMandatory` | §19.1 | 17-§7 异议与保留 | 少数意见入档属纪要 ✓ |
| `vmu.budget.fairnessPolicy` | §19.6 | 17-§17 资源公平 | 配额公平属预算 ✓（17 已删其重复的**"公平策略"键**，且不再以字面键名出现 ✓） |
| `vmu.audit.traceKeepMs` | §19.6 | 17-§18 追踪关联 | 审计保留期属审计 ✓ |
| `vmu.arbitration.mode` | §19.6 | 17-§6 仲裁（开关） | **开关**是程序配置；**仲裁者选择**在 17 ✓ |
| `vmu.arbitration.binding` | §19.6 | 17-§6 仲裁（效力） | 效力是程序配置 ✓ |

### 24.3 共享**码**（13 条具体码 ＋ 4 个本卷码族）——本卷定义，17 只引用 ✓

`VMU_INVALID_ARGUMENT`／`VMU_STATE`／`VMU_NOT_PERMITTED`／`VMU_NOT_MEMBER`／`VMU_NO_SUCH_OBJECT`／`VMU_RESOURCE_BUDGET`／`VMU_MIDDLEWARE_REJECTED`／`VMU_MIDDLEWARE_FAILED`／`VMU_IO_FAILED`／`VMU_STORE_FAILED`／`VMU_ENGINE_UNAVAILABLE`／`VMU_PACK_CONFLICT`／`VMU_IDEMPOTENCY_KEY_REUSED`（均见 §20 表头与各行 ✓）；**码族**：`VMU_MEETING_*`／`VMU_MINUTES_*`／`VMU_REOPEN_*`／`VMU_TASK_*`（§20.1／§20.2 ✓）⇒ 17 全表只在用到处引用，**不重复登记** ✗（17-§21 计数已由 73 降为 72 ✓）。

### 24.4 反向：**17 定义、本卷引用**（本卷已改的两处 ＋ 其余归属 ✓）

| 17 定义的什么 | 本卷相应改动/引用 | 说明 |
|---|---|---|
| **仲裁本体**（17-§6：仲裁者选择/回避/听证/效力） | **§4 的"仲裁与冲突解决"一行已改为引用 17-§6** ✓（§4 行内保留：升级时限与目标 ✓） | 08 只做"到点提醒"；"谁判/怎么判"归 17 ✓ |
| **交接本体**（17-§11：交接单/上下文压缩包/验收） | **§4 的"交接与升级"一行已改为引用 17-§11** ✓（§4 行内保留：在途台账 `work.interrupt/recover` ✓） | 08 只保证"在途不丢" ✓ |
| 席位与任职/任期/罢免（17-§2） | §2.2-C 只问"谁在场/够不够人"（法定人数）✓ | 08 管一场会的人；17 管人与位置 ✓ |
| 委托与转委（17-§4） | §2.2-B 的**命令级**临时授权保留 ✓ | 命令级归 08；实例级归 17 ✓ |
| 信任与声誉（17-§5） | §6 仲裁者选择参考 17 的排序建议 ✓ | 声誉**不改权限**（S-3）✓ |
| 拓扑/宪章/身份/公平/人类在环（17-§14–§19） | §15 会议类型目录只描述"一场会" ✓ | 机构本体归 17 ✓ |
| 记忆/技能/竞标（17-§8–§10） | §4 只给任务板与在途台账 ✓ | 知识与人际归 17 ✓ |

### 24.5 禁止与处置（两卷共同纪律）

1. **一个机制只能有一处定义** ✗：发现两卷各写一套 ⇒ **立刻停下报 Lead**，不得两处并行修改 ✓；
2. **引用必须给节号** ✓（本表已给到节）；
3. **删改两卷同步** ✓（本次：17 删 3 处重复登记，本卷加本节并改 2 行引用 ✓）；
4. **生成管线归 Lead** ✗：本卷只改文档 ✓。

### 24.6 本次同步记录（本卷侧）

- 新增本节 **§24**（镜像 17-§27 ✓）；
- §0.2 由"三条记账纪律"改为**四条**（新增纪律 ④"设计目标 vs 实现保证"；并把 v0.1 的"只用通配"口径更新为 Lead 解除后的"可写具体键名/码" ✓）；
- §6.2 增"本节 8 条**均已实现** ✓"的诚实状态；
- §19 表头增"本表除既有键外**全部是计划键（未接线）**"＋跨卷说明；
- §12.4 的 `vmu.budget.*` 行由"机器强制原则"改为"设计原则（当前仅 `vmu.limits.*` 已实现 ✓）"；
- §4 的"仲裁与冲突解决"与"交接与升级"两行**改为引用 17-§6／§17-§11** ✓。

---

## 25. Round 2 · 目标 2 对齐台账（task-11：通信 / 协作 / 会议）

> 判据：`_handoff/vmu/00-decisions.md` **D-08 三层基线**；事实来源：`_handoff/vmu/v5r-inventory-c.md` §③（会议系统全清单）、§④（群聊与状态面板）、§⑦（设计↔实现落差）。
> 分层铁律照旧：**能力进内核**（消息、信箱、面板、会议状态机），**策略进 settings/pack**；v5r pack 只声明策略，不复刻内核实现。

### 25.1 新增内核原语（Round 2）

| 原语 | 文件 | 工厂 | 工具面 | 设置键（全部真读） | 新错误码 |
|---|---|---|---|---|---|
| 群聊 | `kernel/chat.js` | `createChat({clock,log,settings,bus,isFrozen,freezeExempt,isAdmin})` | `vibe_vmu_chat`（`tools/chat.js`） | `vmu.chat.admins`／`speakQuota`／`speakQuotaWindowMs`／`muteDefaultMs`／`freezeExemptAdmins`／`historyCap` | `VMU_CHAT_MUTED`／`_QUOTA_EXCEEDED`／`_FROZEN`／`_NOT_ADMIN`／`_ANCHOR_DANGLING`／`_CAP_REACHED` |
| 耐久信箱 | `kernel/mailbox.js` | `createMailbox({clock,log,settings,bus,store,deliver,resolveAudience})` | `vibe_vmu_mailbox`（`tools/mailbox.js`） | `vmu.mailbox.digestWindowMs`／`digestMax`／`urgentKinds`／`ackedLedgerCap`／`wakeBudget`／`deliverTimeoutMs` | `VMU_MAILBOX_NO_SUCH_RECIPIENT`／`_ACK_UNKNOWN`／`_DELIVERY_FAILED`／`_ANCHOR_DANGLING`／`_CAP_REACHED` |
| 状态面板 | `kernel/panel.js` | `createPanel({clock,log,settings,bus,members})` | `vibe_vmu_panel`（`tools/panel.js`） | `vmu.panel.auditCap`／`subtasksMax`／`deviationPolicy`／`historyCap` | `VMU_PANEL_UNKNOWN_FIELD`／`_TIME_KEY`／`_NO_SUCH_MEMBER`／`_DEVIATION`／`_CAP_REACHED` |

**不变式（与 v5r 的对应关系）**
- 群聊：消息 `{id:'msg-N', seq, from, at, text, replyTo, quotes[], kind}` —— **id／发言人／时间／回复目标**四件齐全；被拒发言**不追加**（"拒绝不是一条消息"）；禁言**到期即自动解除并留痕**；配额 `0＝不限`、窗口 `0＝整场`；**表决期禁言由注入的 `isFrozen()` 派生**（与 `ballot.freeze` 同源，无定时器），`freezeExemptAdmins` 保留 v5r 的 chair-first 豁免开关。
- 信箱：**每收件人一份**（群发＝N 条 N 个 id）；**非紧急投递只给提示（count／发件人／标题，notice ≤300 字），正文不进提示词**；成员用 `list` 看 8 字段行（无正文），`open` 返回正文并置 `read:true`，`setState` 改 read/todo；**`ack` 是投递层结算，不等于读过**；**ack 后正文即删**，指向它的引用锚**具名悬空拒**；`freshOnly`＋`markInjected/clearInjected` ＝ **每提示一次去重**；紧急只有发送方**显式 `urgent:true`** 才带正文（`vmu.mailbox.urgentKinds` 默认空，机构可声明 kind 自动紧急）；其余按 `digestMax`／`digestWindowMs` 合批（45000ms／12 是**非紧急提示的节奏**，不是批量投正文）；`plan()` 受 `wakeBudget` 约束且**具名列出被推迟者与原因**。
- **紧急投递（PHASE 9 / 轮 9）**：紧急正文进提示词，但**不 ack**；条目留在信箱里（`list` 的 N 与提示词一致），成员 `open` 读正文，`ack` 仍由成员/调用方显式结算。这样“提示词说收到 N 条”与“信箱里真有 N 条”不会自相矛盾。
- 状态面板：字段 `overall`（总目标）／`subgoal`／`plan[]`／`status`／**`subtasks[]`（正在执行的子任务，v5r 缺的独立字段）**，`state ∈ planned|running|blocked|done`；**只追加**历史；时间**由框架写**（自带 `…At/…Ms` 具名拒）；同值幂等；他人改 `overall` ⇒ 记 `deviation`（保留原作者与原值）或按 `deviationPolicy:"refuse"` **具名拒**；`view()` **留痕**且上限触界**计数上报**；有 `members` 接缝时镜像 `overall/subgoal/plan/status`（**不镜像 `subtasks`**，那个面不认识它）。

### 25.2 基线 A（v5r 实际实现）覆盖表

| v5r 能力（分片 C §⑦-A） | vmu 承载 | 判定 |
|---|---|---|
| 召集（`meeting_open`；只有院士/所办可开，其余只提议） | `meeting.convene`＋`meetings.open`＋`canConvene` 判定点；默认"≥2 人" | ✅ |
| 两阶段发言（轮流→举手，沉默不触发截止） | `meeting.roundComplete/phase`（派生：全部终态 ⇒ `open-floor`）＋`handUp`＋`asked/silent/refused` | ✅ |
| 发言／沉默／拒绝输入（拒绝不推进轮次） | `meeting.speak/markSilent/refuseInput`（"REFUSED INPUT IS NOT AN INPUT"） | ✅ |
| 邀请临时工发言（只记纪要、不计票、不阻塞收束） | **新增** `meeting.invite/speakInvited/invitations`（`countsTowardsRound:false`） | ✅ |
| 显式结束辩论（R10-2a）＋聚合闸 | `meeting.endDebate/aggregationAllowed` | ✅ |
| 收束（不完整轮次具名拒，强制收束留痕） | `meeting.close(reason,{force})` | ✅ |
| 投票板（选项式：minVotes／记名／弃权／多轮） | `ballotbox.js`（`method/minVotes/minVotesRatio/abstainAllowed/abstainCountsForFloor/secrecy/tieRule/roundsMax`）＋`ballot.js`（布尔票、三值结果、IC 冻结） | ✅ |
| 复议／重开 | `ballot.reopen(reason)`（逐场原语层）＋ **`ballotbox.reopen({boxId, reason})`（选项板层，GAP-MTG-10 已落，读 `vmu.ballot.reopenFloor`）** | ✅ |
| 动议＋附议 | `governance.js`（`MOTION_KEYS`；动议状态机由该面持有）；决议动议在 light 会期由 tier 谓词具名拒 | ✅ |
| 程序异议／申诉留痕 | `meetings.fileAppeal`（`appealScope/appealReasonRequired/appealDeadlineMs`） | ✅（变形） |
| 纪要（起草／确认／逐字稿／行动项） | `minutes.js`（`draft/confirm/append/actions/list/status`；`dissentMandatory/actionsOwnerRequired/dueRequired`） | ✅ |
| 上次纪要确认 | `minutes.confirm` + `confirmPreviousRequired` + `meetings.confirmPreviousMinutes` | ✅ |
| 临时授权（4 命令 × 3 事件型范围） | `grant.js`：`GRANTABLE_COMMANDS=['assign','prioritize','nudge','convene']`、`GRANT_SCOPES=['meeting','verify','once']`（与 v5r 逐字一致） | ✅（**工具面缺，见 GAP-MTG-12**） |
| 会议参数与上下界（硬界／唤醒重试／引用上限／轮次） | `meetings.hardLimitMs`（默认 1800000，钳 [300000,7200000]）、`wakeRetries`（钳 [0,10]）、`verdictMaxRounds`（≥1）；`meeting.roundTimeoutMs`／`quotesPerMessageMax`（默认 2，超限拒）／`quoteDepthMax`（默认 3，超深折叠计数） | ✅ |
| 会议分级（formal/light，简流程不得产出实体定论） | **`vmu.meetings.tier`＋`allowLight`＋`truthWriteRefusal()`（GAP-MTG-02 已落）**；`meetings.confidentiality*` 仍管保密级别与引用 | ✅ |

### 25.3 基线 B（用户点名，v5r 只在设计文档里有）覆盖表

| 用户点名项 | 承载 | 判定 |
|---|---|---|
| 群聊消息 `{id, 发言人, 时间, 回复目标}` | `chat.send` 的 `{id, from, at, replyTo, quotes}`（悬空回复锚具名拒） | ✅ |
| **管理员** | `chat.admins`（成员 id）／`isAdmin` 注入接缝；授予/撤销与改策均**要求具名 `by`**（匿名改策具名拒） | ✅ |
| **发言次数限制（指定次数／不限）** | `chat.speakQuota`＋`speakQuotaWindowMs`（`0＝不限`；超限 `VMU_CHAT_QUOTA_EXCEEDED` 带当前值/上限） | ✅ |
| **禁言（含到期）** | `chat.mute/unmute`（`durationMs` 相对时长，绝对时点由框架写；到期自动解除并记 `mute-expired`） | ✅ |
| 私发信息（耐久、逐收件人、ack 语义） | `mailbox.js`（见 25.1） | ✅ |
| 成员状态面板（**总目标／计划规划／正在执行的子任务**） | `panel.js`（`overall`／`plan[]`／**`subtasks[]`**；查看留痕；历史与偏离） | ✅ |

### 25.4 **具名扩展登记**（基线 C：设计有、v5r 未实现；**不许静默缺失**）

> 每条给出：缺口／现状证据（源码级）／**由哪一层补**。未落地者一律在此登记；评审可据此逐条销账。

| id | 缺口（分片 C 对照） | 现状证据 | 由哪一层补（closed-by） |
|---|---|---|---|
| **GAP-MTG-01** | 显式「散会／结束会议」命令（v5r 无工具，只有判据自动收束；D2/R4/K8 假定存在） | `meeting.close` 是**原语**且只能由调用方触发；`tools/meeting.js` 的 `close` 是唯一显式入口，**没有"仅院士可散会"的授权面** | `host.js` 工具面 + `pack` 权限声明（chair 槽位）；内核原语已就绪 |
| **GAP-MTG-02** | 会议分级的「简流程不得产出实体定论」硬闸（`truthWriteRefusal`） | **已落**：新增 `vmu.meetings.tier`（`formal\|light`，默认 formal）＋ `vmu.meetings.allowLight`（默认 true）；`kernel/meetings.js` 的 `tier()/isLight()/truthWriteRefusal()` 是**派生谓词**，**唯一判定点**在 `close()` 的收束路径（带 `report` ⇒ `VMU_MEETING_LIGHT_NO_TRUTH`，next 说明如何升级为 formal），并被 resolution 动议与 `minutes.resolve()` 复用；`tier=light` ＋ `allowLight=false` ⇒ `VMU_MEETING_TIER_CONFLICT`（`open()` 前即拒） | **已落**（`kernel/meetings.js` 的 `tier/allowLight/truthWriteRefusal` ＋ `close()`/`motion()` 判定点；键由 core 声明） |
| **GAP-MTG-03** | 决议实体：稳定 id（`res-<n>`）／公告即生效 `effectiveAt`／`supersededBy` 取代链 | **已落**：`kernel/minutes.js` 的 `resolve()`／`resolutions()`／`supersede()` —— 框架分配的全所单调 `res-<n>`、`effectiveAt === at`、`retroactive` 只记 `declaredAt`（**不移动生效时点**）、取代链单向只增、只读检索（任何 `…At/…Ms` 过滤**具名拒**）；**light 会议经同一个 tier 判定点具名拒**，缺 `meetings` 接缝 ⇒ `VMU_ENGINE_UNAVAILABLE`（不猜 tier）；决议随 minutes 快照跨重启（计数 max+1） | **已落**（`kernel/minutes.js` `resolve/resolutions/supersede`；`createMinutes({ meetings })` 装配由 core 落） |
| **GAP-MTG-04** | 议程增删改／点名出席表／发言顺序设定／点名发言（`agenda_set`／`roll_call`／`speak_order_set`／`speak_next`） | `meetings.js` 有 `attend/leave/queue/orderMode` 与 `materialsRequired`，**没有** agenda 条目对象、没有 attendance 状态表、没有"主席点谁"的命令 | `meetings.js`（议程对象 + 出席表 + `orderMode:'chair'` 的点名入口） |
| **GAP-MTG-05** | 休会／**延长**／**停步**（`recess` 已有；`extend`／`stop` 无） | **`extend` 已落**（Round 4）：`meetings.extend({meeting, member, ms?, by})` 把**声明步长** `vmu.meetings.speechExtendMs` 变成真命令（省略 `ms` 时读它，并**点名进 `enforced[]`**），受 `speechExtendMax`（每人次数）与 `speechMaxMs`（单次上限）约束，越界具名拒 `VMU_MEETING_SPEECH_TIMEBOUND`；**未声明步长 ⇒ `VMU_INVALID_ARGUMENT`（不发明时长）**。**`stop` 两半**：`scope:'meeting'` 由 `close()` 承担（SPEC K8 的收敛口径，无需新命令）；`scope:'step'` 仍缺 —— 本面没有"步（step）"这一概念，**键名待定（此处不点未登记的键名，避免文档留下悬空名）** | **extend 已落**（`kernel/meetinglapse.js` 的 `extensionPlan` ＋ `kernel/meetings.js` 的 `extend()`，工具面 `extend`）；`stop{scope:'step'}` 需先有"步"概念，届时由 core 先声明键再落地 |
| **GAP-MTG-06** | 发言机制切换（`single`／`open`／`round_robin`／`hands`／`call_on`／`directed`）与单次发言版群聊 | `chat.js` 提供"说话"原语与配额；`meeting.js` 提供机会位与举手；**没有 mode 切换命令** | `meeting.js`（在 `openRound` 上做 mode 判定点）＋`tools/meeting.js` |
| **GAP-MTG-07** | 材料提交（`material_submit`，挂到议程条目） | `meetings.materialsRequired` 只做"是否要求材料"的判定；无材料对象、无提交入口 | `meetings.js`（材料对象 + 议程挂钩） |
| **GAP-MTG-08** | 定向质询／回答（`challenge`／`answer_challenge`） | `meeting.interrupt`（`interruptAllow/interruptQuota`）是**打断**，不是"必须回答的质询" | `meeting.js`（质询对象 + 待答状态） |
| **GAP-MTG-09** | 会中任务的「请求认领 → 批准」批准点（`claim_pending`） | 任务面 `tasks.js`/`board.js` 的认领是**直接**的；无 `claim_pending` 状态 | `board.js`／`tasks.js`（v5r 的 `meeting_task_claim` 语义） |
| **GAP-MTG-10** | 投票板层的 `reopen`（复议门槛只升不降） | **已落**：`kernel/ballotbox.js` 新增显式生命周期（`open｜closed`：**裁定后的板不再收票/记缺席**，均具名拒 `VMU_STATE`）＋ **自有 `reopen()`**（要求 `reason`；**`vmu.ballot.reopenFloor` 真读并决定**——不达门槛 ⇒ `VMU_BALLOT_MIN_VOTES_NOT_MET` 带当前/门槛且 `enforced[]` 点名该键；旧结论先入 `reopenHistory` 再清票，只增不改）。该键已由 `PLANNED_BALLOT_KEYS` **移入 `WIRED_BALLOT_KEYS`**（分区 `27 = 23 + 4` 仍 exact）；工具面新增 `boxopen/boxcast/boxclose/boxreopen` 使其可达 | **已落**（`kernel/ballotbox.js` `reopen()`；**无第二份 reopen 实现**） |
| **GAP-MTG-11** | 会后异步补票窗口（`vote_window`；窗口只延长时间、不得重定义分母） | `mailbox.js` 提供耐久投递与 ack；投票侧无窗口概念（`minVotes` 是成立门槛） | `ballotbox.js`（窗口键 + 截止策略）；分母语义由 `meetings.unansweredInDenominator` 持有 |
| **GAP-MTG-12** | 临时授权／动议／纪要的**工具面**（`vibe_vmu_grant` 等；**工具面未实现 ✗**——**能力已在内核 ✓、工具缺 ✗**，两者要分清） | 内核有 `grant.js`／`governance.js`／`minutes.js`，`TOOL_FACES` 里**没有 grant 面**（动议/纪要已有各自工具面） | `host.js`（加 `grant` 面：families `vmu.grant.`，config `grant`）＋`tools/grant.js` |

### 25.5 持久化（投影缝）· Round 2

| 面 | `snapshot()`／`restore()` | 可跨重启？ | 具名不可恢复项 |
|---|---|---|---|
| `kernel/meeting.js` | ✅ v1 信封（`face:'meeting'`） | **是**（轮次/机会位/拒绝记录/举手/邀请/历史） | `deliver`、`bus`（注入接缝，宿主重绑） |
| `kernel/ballot.js` | ✅（`face:'ballot'`） | **是**（票面/状态/冻结/结果/历史） | `bus`、五个判定谓词（`canOpen/isEligible/isFrozen/castValid/tally`） |
| `kernel/minutes.js` | ✅（`face:'minutes'`） | **是**（记录＋逐字稿；逐字稿超 64KB **计数截断**） | `meeting` 接缝；超限字节数在 `truncated`／`skipped` 上报 |
| `kernel/meetings.js` | ✅（`face:'meetings'`） | **是**（live 会议 + 归档 + 回执环；Map/Set 感知序列化） | `policy`（47 键来自 settings，恢复时重解析，**绝不用旧声明覆盖新配置**）、`members/ballot/wake/bus`、`refusals` 计数 |
| `kernel/ballotbox.js` | ✅（`face:'ballotbox'`） | **是**（票箱 + 票面 Map） | `policy`（26 键重解析）、`bus` |
| `kernel/mailbox.js` | ✅ `snapshot/hydrate` ＋ `persist/restore(snap)` | **是**（**配 `store` 端口**真持久；`restore(snap)` 走投影引擎、`restore()` 走声明键） | `deliver`／`resolveAudience`（宿主重绑）；无 store 且未给快照 ⇒ `durable:false` 自曝 |
| `kernel/chat.js` | ✅ **Round 3 新增** `snapshot()/restore(snap)` | **是**（消息账本＋禁言＋发言计数；**policy 不入快照**，从 settings 重解析；id 计数 max+1） | 注入接缝（`bus/clock/isFrozen/freezeExempt/isAdmin`）由宿主重绑，**不算 `skipped`** |
| `kernel/panel.js` | ✅ **Round 3 新增** `snapshot()/restore(snap)` | **是**（行＋只追加历史＋查看留痕；**policy 不入快照**） | 注入接缝（`bus/members`）由宿主重绑，**不算 `skipped`** |

> 接口形状（v5r-reader-a 定稿 v1）：实例方法 `snapshot()`／`restore(snap)`；信封 `{apiVersion, face, v:1, at, data, counters, skipped}`；`restore` 回执 `{ok, restored:[…], skipped:[{what,why}], counters}`；版本/缺字段/冲突分别 `VMU_RESUME_SNAPSHOT_VERSION`／`VMU_RESUME_SNAPSHOT_INCOMPLETE`／`VMU_RESUME_RESTORE_CONFLICT`（注册在 `kernel/resume.js`；本卷以**同值字面量**引用，避免在 `resume.js` 落盘前形成硬依赖）。

### 25.6 工具面与钩子生产者

- 新工具面：`vibe_vmu_chat`（send/list/policy/setpolicy/mute/unmute/quota/admin/status）、`vibe_vmu_mailbox`（send/pending/flush/ack/list/open/setState/plan/anchor/unread/status）、`vibe_vmu_panel`（set/get/view/board/history/audit/status）。
- 新钩子（**字符串首参**形态；对象形态会被总线拒且被 catch 吞掉，等于没广播）：`chat/send-before`(可阻断)｜`chat/sent`｜`chat/refused`｜`mailbox/deliver-before`(可阻断)｜`mailbox/delivered`｜`panel/write-before`(可阻断)｜`panel/written`｜`panel/viewed`。三条 BEFORE 钩子的拒绝都会**具名**落到调用方（chat ⇒ 抛出该码且不追加；mailbox ⇒ 返回 `ok:false` 且**一条都不 ack**；panel ⇒ 抛出该码且行不变）。

### 25.7 本轮验证

- `node tests/vmu-chat.test.mjs` ⇒ 43 passed / 0 failed
- `node tests/vmu-mailbox.test.mjs` ⇒ 44 passed / 0 failed
- `node tests/vmu-panel.test.mjs` ⇒ 31 passed / 0 failed
- `node tests/vmu-meeting-parity.test.mjs` ⇒ 基线 A 逐项驱动 + §25.4 登记的机械校验（见该套件输出）
- 既有套件回归：`vmu-meeting` 50/0、`vmu-meetings` 160/0、`vmu-ballot` 41/0、`vmu-ballotbox` 13/0、`vmu-minutes` 20/0

### 25.8 C-45 · 忠实性缺陷 ⇒ 强制弃权（**closed-by ＝ `kernel/fidelity.js`**）

- **判定在策略层、强制在内核**：`declareDefect({target,by,note})` 登记"该成员在该对象上有已声明缺陷"（缺字段具名拒）；`abstentionFor(member,target)` 是纯谓词；**`applyAbstention` 是唯一强制点**（被登记者声明的 1/0 ⇒ 0.5）。
- **表决面唯一调用点**：`kernel/ballot.js` 的 `cast()`（`castValid` 之后、落票之前）——改写后的票以 `kind:'abstain'` 落账（**不计入 decisive/m**），并保留 `declared`／`byFidelity:true`／`markerId`。**唯一**一处，不散落。
- **不许静默**：回执带 `byFidelity/declared/markerId/note`；`ballot.status()` 回显 `fidelitySeam` 与 `byFidelity[]`；`fidelity.view()` 有 `abstentionsEnforced` ＋ `Formal/Defects/<target>.json` 耐久 marker。**无接缝** ⇒ `fidelitySeam:false` 且不改写任何票（不假装强制）。
- **它不越界**：不忠实**不是反证**（`isRefutation:false`）；强制的是**弃权**，不是结论（与 §3 的"R6 真值不越界"一致）。装配：`createBallot({ …, fidelity })`（由 `kernel/index.js` 落）。

---

### 25.9 F28 · 有界兜底：**有界、具名、可撤销**（Round 4）

**缺口（Round 3 证据）**：`vmu.meetings.hardLimitMs` 已被读取（`speak`/`motion`/`vote` 越界即 `VMU_RESOURCE_BUDGET`），但**拒绝不是收束** —— 会议永远停在 `open`，记录里只有"你不许动"。v5r 的硬界只做了"放弃并写全明细"的一半；F28 要求另一半：兜底必须产出**决定**，且该决定**具名**（`name`）、**有理由**（`why`）、**有时间戳**（`at`）、**可撤销**。

| 维度 | 落点与语义 |
|---|---|
| **有界（bound）** | **复用已声明的 `vmu.meetings.hardLimitMs`**（钳 [300000, 7200000]）——本面只有这一个墙钟界，**不发明第二个上限**；投票板侧的界由**构造参数** `openMaxMs` 声明（默认 0＝零机制）：该界属于**一个箱子的一生**，所以**刻意不设设置键**（键要么只在构造时读、要么会把正在投票的箱子的界限热改掉，两者都更差）——策略由**构造箱子的 pack** 拥有 |
| **派生谓词（唯一判定）** | `meetings.lapseDue({meeting, at?})` → `{due:false,…}`／`{due:true, name:'meeting-lapse', why, at, revocable:true, elapsedMs, limitMs, enforced:['vmu.meetings.hardLimitMs']}` |
| **具名收束** | `meetings.lapse({meeting, by?})` → 未到期**具名拒** `VMU_STATE`（带当前/上限）；到期则置 `state='lapsed'`、把 `{name, why, at, revocable}` 写进 `m.lapse` **与纪要**、计数 `lapses`、广播 `meetings/lapse`；重复调用幂等 |
| **fail-closed** | 收束后**动作面**（speak/motion/vote/…）在**唯一入口 `requireMeeting`** 处按 `state==='lapsed'` 具名拒 —— 一个判定点，不散落；**读面**（`minutes`/`verbatim`/`quorum`/`status`）以 `{readOnly:true}` 显式放行（记录仍可审计） |
| **可撤销** | `meetings.revokeLapse({meeting, by?, reason})` → **必须给理由**（否则 `VMU_REASON_REQUIRED`）；恢复 `state='open'`，**原 lapse 记录保留**（append-only）并记 `revokedAt/revokedBy/revokeReason`，计数 `lapseRevocations` |
| **可观测** | `status()` 增 `lapsedMeetings`／`lapses`／`lapseRevocations`；投票板 `status({boxId})` 增 `openMaxMs`／`lapse` |
| **表决侧同形** | `ballotbox.lapseDue/lapse/revokeLapse`：到期把板置 `lapsed`（**票保留、不发明结论** `outcome:null`），`cast`/`markAbsent` 在非 `open` 态本就具名拒；撤销需理由并回到 `open` |

**工具面（可达性）**：`vibe_vmu_meeting` 新增 `extend`／`lapse`／`revokelapse`／`boxlapse`／`boxrevokelapse`（**不新增面**）。**零机制**：未声明板界（`openMaxMs=0`）时兜底**不存在**，行为与本轮之前逐字一致；会议侧始终有 `hardLimitMs` 这个已声明界（钳制下界 5 分钟）。

---

### 25.10 拆分：`kernel/meetinglapse.js`（规则）↔ `kernel/meetings.js`（状态）

**为什么拆**：`kernel/meetings.js` 因 Round 3/4 的 tier／lapse／extend 等**自然增长**越过 `docs/02 §L174` 的 1200 行决议线（1245 行）。它不是"文本本身就是契约"的文件，所以**不**进 `KNOWN` 名单，而是按**规则/状态缝**拆开：

| 半边 | 文件 | 内容 |
|---|---|---|
| **规则（纯规则 + 一个注入接缝的工厂）** | `kernel/meetinglapse.js` | 导出面逐字：`apiVersion`、`MEETING_LAPSE_NAME`、`BALLOT_LAPSE_NAME`、`lapseDueOf`、`makeLapseRecord`、`revokeLapseRecord`、`extensionPlan`、**`createMeetingControls`**。纯函数部分无时钟、无状态、无总线；工厂把四个方法（`lapseDue`/`lapse`/`revokeLapse`/`extend`）与面注入的状态接缝（`requireMeeting`／`limits()`／`counters`／`say`／`deny`／`capIn`／数值归一）组合起来 |
| **状态（面）** | `kernel/meetings.js` | 持活记录／纪要／计数／广播，并**独家**把规则回执的 `keys` 映射为 D3 的 `enforced[]`＋`enforcedScope`（`withScope()`）——因此新模块**不出现**该词汇，不制造"未被门禁覆盖的新模块" |

**行为不变**：`tests/vmu-meeting-parity.test.mjs` §16 的 17 条 F28/extend 断言**逐条保持**（130/0）；`vmu-meetings` 161/0。**结果**：`meetings.js` **1164 行**（≤1200，余量 36）；`audit-code-size` **9/0** 且 `KNOWN` 名单仍为 **3**（未新增名字）；`audit-enforced-consistency` **findings=0**。

---

### 25.11 F26／F31／F32／F34：票型词汇、提交闸门、刚刚定论窗口、开辩资格（Round 5）

四条"部分"项的收口，全部落在 `kernel/ballot.js`（**无新增设置键**：界与窗口由**构造参数**声明，策略留在造票的 pack 手里）。

| 条目 | 原判（差在哪） | 落点与语义 |
|---|---|---|
| **F26 五种票型分离** | 票带自由 `kind`，**票型由设置而非固定词汇定义** ⇒ "这一票是哪一种"没有唯一答案 | **固定枚举 `VOTE_KINDS = ['for','against','abstain','unable','estimate']`** ＋ 纯函数 **`classifyVote(value, kind)`**：1/0 ⇒ for/against；`{kind:'abstain'}` ⇒ abstain；`{kind:'unable'}` ⇒ unable；`{kind:'estimate'}`＋严格介于 0 与 1 ⇒ estimate；`kind:'process'` ⇒ **不是第六种票**（I-1/F27：过程读数不是票，单独一条通道）。**m-vote 仍只由 for/against 决定**（`DECISIVE_KINDS`）；`status().byKind` 五种分开计数、`status().voteKinds` 报词汇；**未声明为 estimate 的 0.4 仍按 m-vote 规则具名拒**（不悄悄改判） |
| **F31 原子队列** | "原子"由单线程同步写**结构性**保证，**无显式队列/串行化** | **显式提交闸门**：`cast` 会 await 中间件，因此**并发两票可能在"查重"与 `votes.set` 之间交错**（真实隐患）⇒ 一张票的全部真值变更走**同一条 FIFO 链**（`castNow` 是唯一临界区，`cast` 只是带闸门的包装）。**断言**：同一成员两票并发 ⇒ **恰好一票被接受**、`voteCount===1`、`gate.commits===2`；不同成员并发不受影响（串行化不丢票） |
| **F32 "刚刚定论"去重窗口** | 只有"重复举手"去重，**没有定论时间窗去重** | 构造参数 `dedupWindowMs`（0＝零机制）：窗口内**同一结论**的重复收束被**折叠**（计数 `dedup.foldedVerdicts`、历史记 `close-deduped`、回执 `deduped:true` 带 `previousAt/windowMs`）。**三条诚信边界**：① **只有同结论才折叠**——窗口内的**不同结论**永远照常宣布；② 折叠**仍必须收束**（`state='tallied'`＋`outcome` 落在面里），否则票面会停在 `open` 继续收票——这正是本轮自查抓到并修掉的一处；③ 有中间件 tally（`bus`）时**不猜**：直接跳过折叠，公告权仍归中间件 |
| **F34 开启辩论的资格判据** | 只有"谁有资格投票"，**"谁有资格开启辩论"未见** | 三个**已声明**条件（`openers`／`minEligible`／`requiresTarget`），在**唯一开辩点 `open({by})`** 具名拒：非开启人 ⇒ `VMU_NOT_PERMITTED`；选民团小于下限 ⇒ `VMU_STATE`；无标的而声明必须有标的 ⇒ `VMU_INVALID_ARGUMENT`。三者形状由 `status().openCriterion` 在**撞上之前**可见（含 `satisfied`）；默认仍宽松（`openers=null`、无下限）＝零机制 |

**顺带修掉的一处语义暗礁**：`close()` 之后 `open()` 会**带着旧票**重开（下一次投片被判"已投票"，而旧结论静静留着）⇒ 现在 `open()` 对 `state==='tallied'` **具名拒**并指向 `reopen()`（清票重辩）。快照：`lastClose`／`dedupedVerdicts` **随快照走**（重启后窗口仍生效，实测 `restored_items` 含 `dedup`）；在飞行的闸门队列**不持久**并如实列入 `skipped`（`commit-gate`）。

---

### 25.12 F31+（Round 6）：**跨进程耐久原子** —— `createDurableCommitLog`

Round 5 的提交闸门只保证**进程内**不交错。进程若在"意图"与"生效"之间死掉，或两个进程写同一场表决，闸门一无所知。本节的接缝把这件事补成**协议**（落在 `kernel/ballot.js`，**无新增设置键**）：

| 维度 | 契约 |
|---|---|
| **ticket 由 store 分配** | `store.append(rec)` 必须回 `{ticket}`（`O_APPEND` 文件／SQLite 序列／加锁日志）⇒ **两个进程共享同一 store 即得到互不相同、单调的 ticket**；store 不回 ticket 才退回本地计数，并在 `status().numbering` **明说**是"每进程"编号 |
| **意图先于生效** | `reserve(op)` 先落意图 → 调用方生效 → `complete(rec, outcome)` 落结果；崩溃窗口里的**意图留在日志里**，正是 `recover()` 要找的 |
| **恢复不重放已完成** | 选票面 `reconcile()` 按 ticket 序重放**未完成**意图；已 done 的 ticket 即跳过（**按 ticket 归属排除**——初版只排除了"自身 done 的行"，会把每条已完成提交的意图也算成 pending；本轮已修）；成员一票唯一 ⇒ 重放**幂等**（第二次 `replayed=0`），恢复票带 `recovered:true` |
| **可观测** | `ballot.status().gate = {serialized,pending,commits,durable,log}` |
| **无 store** | `durable:false`＋`reserve()` 返回 `null`＋`reconcile()` 具名说明"无可恢复" ⇒ 接缝缺席**自曝**，不假装恢复过 |

**实测**：parity §18（12 条）——两"进程"共享 store ⇒ ticket 1,2 单调互异；崩溃窗口 ⇒ 新日志 `pending=1`、新票面 `reconcile()` **恰好重放 1 次**且该票**真能定论**、第二次 **0**；正常路径 `done=1/pending=0`；**被拒的投片也完成自己的意图**（恢复不重放拒绝）。

**接线待 host**：`createDurableCommitLog({ store })` 的 store 由宿主提供（vmu-core/host）；`ballotbox`／`mailbox` 可照同样三行接上（协议已成）。

---

### 25.13 Round 7：`08-goal2-verdict.md §6` 的缺口收口（G1／G5／G8／G6／GAP-MTG）

**A · G1 私聊补记到公开面（已落 ✓）** —— v5r 的 `supplement_of`＋`why`，落点 `kernel/chat.js`：`supplement({of, by, why, publicRef})`／`supplements()`／`supplementOf(id)`；工具面 `vibe_vmu_chat` 新增 `supplement｜supplements｜supplementof`。
- **正文永不搬运**（`body:'withheld'`）：公开面只记 `{of, by, at, why, publicRef}`；引用**经补记簿**解析并带 `viaSupplement:true`／`bodyWithheld:true`。
- **只有发送者本人可补记**：注入 `privateSender:{senderOf(id)}` 接缝时**核验**（不符 ⇒ `VMU_NOT_PERMITTED`；解析不到 ⇒ `VMU_CHAT_ANCHOR_DANGLING`）；**无接缝**时记 `authorship:'claimed-unverified'` —— **自曝未核验，不假装核验过**。
- **`why` 必填**；**append-only**（同一条第二次补记幂等）；容量受**已声明**的 `vmu.chat.historyCap` 约束并计数丢弃（`dropped.supplements`）。

**B · G5 会议级 mute（判定为"组合"，已写明用法 ✓，不新增原语）** —— 会议级静默 ＝ **按人禁言（`chat.mute`）＋ 会议作用域（会期成员清单）**：
```
for (const m of roster) chat.mute(m, { by: chair, reason: 'meeting in progress' })   // 会期开始
…会期结束／需要放开某人…   chat.unmute(m, { by: chair, reason: 'floor given' })
```
实测（parity §19）：组合后**每个会期成员**在群聊面被禁言、越席发言 ⇒ `VMU_CHAT_MUTED`（具名拒）、主席（管理员）仍可发言、`unmute` 后即恢复；**会议对象本身不受影响**（组合是单向的）。⇒ **不新增"会议作用域 mute"原语**：那会是同一判断的第二份实现（D5/D7 的反面）。

**C · G8 无名册接缝时的自我发信（已落 ✓）** —— `kernel/mailbox.js` 的**唯一发送口**：
- `to:'all'|'voters'` 且**无接缝** ⇒ 早已**具名拒** `VMU_ENGINE_UNAVAILABLE`（"kernel never guesses a roster"）；
- **目标等于发送者** ⇒ 无论来自字面 id 还是**接缝返回**，一律**具名拒**（注册码 `VMU_INVALID_ARGUMENT`＋记录 `reason:'self-message'`，可 grep）。理由：v5r 拒它（`V5_SELF_MESSAGE`）；"我发给我自己"是无人能处置的耐久消息，接缝返回自己时更是静默回环。**未新增错误码**（新码须 core 先落 `03-§8`）——**改判条件**：core 为 mailbox 登记一个 self-message 专用码后，此处把它换上去即可（本轮刻意只复用**已注册**码，避免文档里出现未登记名——这条纪律本身就是门禁要求）。

**D · G6 host 侧分配型 store 接缝（形状已定，接线待 host）**
| 项 | 内容 |
|---|---|
| **谁注入** | **host／`kernel/index.js`**（vmu-core）：把宿主的 store 传给 `createDurableCommitLog({ store, clock, name })`，实例再作为 `createBallot({ durableQueue })` 注入；`ballotbox`／`mailbox` 同一形状（三行） |
| **store 契约** | `append(record) -> {ticket}`（**必须分配**：O_APPEND 文件／SQLite 序列／加锁日志）＋ `readAll() -> record[]`；意图记录 `{ticket, at, name, op}`，完成记录 `{ticket, done:true, outcome}` |
| **语义保证** | 意图先落盘 → 生效 → 结果落盘；`recover()` 不重放已 done 的 ticket；`reconcile()` 幂等 |
| **缺席降级** | `durable:false`＋`reserve()`→`null`＋`reconcile()` 具名说明"无可恢复"；**进程内闸门照常工作**（Round 5 行为不变），不假装跨进程 |
| **判定** | 本面**协议与恢复路径已完备**（Round 6 实测 12 条）；缺的只是宿主一个**分配型 store**。本轮未接：`kernel/index.js`／host 不在本任务写范围 ⇒ 形状已发 vmu-core 落 `docs/03` |

**E · GAP-MTG 需新原语那几条（逐条：要什么原语／代价／是否本轮落）**
| 条 | 要什么原语 | 代价 | 本轮 |
|---|---|---|---|
| GAP-MTG-04 议程增删 | `meetings.agenda({op:'add'｜'amend'｜'drop', item, by})` ＋ 议程条目 id | ~120 行＋16 断言＋1 工具 action；须先裁"已议过的条目能否删" | **未落**（判据待裁） |
| GAP-MTG-06a 流程切换 | `meetings.flow({mode})`（`single｜open｜round_robin｜hands｜call_on｜directed`）＋ `orderMode` 收敛 | ~80 行；须定义 6 种 mode 的**可观察差异**（v5r 无实现可对照） | **R14 已落 ✓**：收敛为**四模式**（`open｜hands｜round_robin｜call_on`），`single`／`directed` 按 R8 裁决**合并**并**具名拒**；形状与实测见 **§25.16** |
| GAP-MTG-06b 点名／顺序 | `speak_order_set`／`speak_next`（v5r 是 Fisher-Yates 随机序） | ~70 行；须裁"随机序是否可被覆盖" | **未落** |
| GAP-MTG-06c 举手管理 | `hands({op:'grant'｜'revoke'｜'clear'})` | ~40 行（`hand()` 已有，只缺管理面） | **未落**（**代价最低，下一轮首选**） |
| GAP-MTG-05 停步 | `stop({scope:'step'})`：需要"步"概念（键须 core 先声明） | ~60 行＋1 键＋1 工具 action | **未落**（键未声明） |
| GAP-MTG-05 请假／离席请求 | `request({kind:'leave'｜'recess'｜'extend', by, why})` ＋ 批准点 | ~90 行；须裁"批准人是主席还是全体" | **未落**（判据待裁） |

**总判定**：A/C **已落**；B **判为组合并写明用法**；D **形状已定＋接线待 host**；E 六条**逐条给出原语与代价**（未落原因只有两类：**判据待裁**、**键/概念未声明**）。⇒ `08-goal2-verdict.md §6` 的 **G1／G5／G8 结清**，G6 降级为"host 一行接线"，GAP-MTG 余项从"缺"变成"**待裁/待键**"。

---

### 25.14 Round 8：举手管理面（已落）＋ 四个裁决的落地形状（★ 本轮**未落**，具名）

**A · 举手管理面 `hands({op, member, by, why, scope})` —— 已落 ✓**（`kernel/meeting.js`；工具面 `vibe_vmu_meeting` 新增 `hands` 动作＋`op`/`scope` 参数）
| 维度 | 语义（实测） |
|---|---|
| **谁可管理** | **仅主席**（`createMeeting({chair})` 或注入 `isChair` 接缝）；**两者都未声明 ⇒ 具名拒 `VMU_ENGINE_UNAVAILABLE`**（"没人声明过的权威"本仓不发明＝零机制）；非主席 ⇒ `VMU_NOT_PERMITTED`（回执点出已声明的主席） |
| **是否留痕** | **全部留痕**：`history` append-only 记 `hands-grant`／`hands-revoke`／`hands-clear`／**`hands-refused`**（连拒绝也记），行内带 `{op, member, by, why, scope, revoked/cleared}` |
| **理由** | `revoke`／`clear` **必须给 `why`**（否则 `VMU_REASON_REQUIRED`）——**静默移除他人的发言位**正是这条要防的；`grant` 的 `why` 可选但给了就记 |
| **`clear` 作用域** | `scope:'all'`（默认）／`'round'`（只清**本轮**举手；举手项自带 `round`）；**其他值 ⇒ `VMU_INVALID_ARGUMENT`**（作用域不发明）；回执给 `cleared` 计数 |
| **`grant` 不加塞** | 授权人在队列**末尾**取位（`position` 回报）；"插到最前"是另一条裁决（B③ 的发言序覆盖），不在这里偷偷做 |
| **读面** | `op:'list'` 无需主席即可读（`{member, round, at, granted}`） |

**B①–④：Lead 裁决原文（不再另选）＋ 落地形状（★ Round 8 当时"未落"；**B③/B④ 已由 R14 落 ✓**，见 §25.16；①/②/C 仍按各行标注）**
1. **议程条目不能硬删，只能关闭/归档** —— 形状：`open()` 支持条目数组 `{id, text, owner?, timebox?}`（受**已声明**的 `vmu.agenda.maxItems`／`ownerRequired`／`timeboxRequired` 约束）＋ `agendaClose({meeting, id, by, why})`：置 `closed/closedBy/why`，**原条目保留**；未知 id／无 `why` 具名拒。**代价 ≈ 90 行＋12 断言**；`vmu.agenda.*` 六键**已在 schema**（本项无需 core）。★ **未落**。
2. **请假/休会批准人＝chair，office 兜底，且必须可声明** —— 形状：`requestLeave({meeting, by, why})`＋`approveLeave({meeting, member, by, why})`，批准人读 `vmu.meetings.leaveApprover`（默认 `'chair'`，值域 `chair|office`）。**该键尚未在 schema**（需 core 声明）；键落地前读取必须**具名降级**（不臆造）。★ **未落（依赖 core 的键）**。
3. **随机发言序可被 chair 覆盖，但必须留痕；未声明 ⇒ 不可覆盖** —— 形状：`vmu.meetings.orderMode` 增 `random` 值（现 `fifo|round-robin|chair`）＋ `overrideOrder({meeting, by, why, mode})`：**仅 chair**、**必须 `why`**、写审计行、`enforced[]` **点名 `vmu.meetings.orderMode`**（`vmu.agenda.reorderAudit` 同步点名）；**未声明（settings 无该键）⇒ 具名拒**。★ **R14 已落 ✓**（§25.16）—— 裁决原文逐字保留；唯一具名偏离：`vmu.agenda.reorderAudit` **未**进 `enforced[]`，理由与替代路径见 **§25.16 B**。
4. **6 种 flow mode 的"可观察差异"裁决** —— **当场合并两项**：`single` 与 `hands` **不可区分**（都是"一次一人、按举手先后"，差别只在名字）⇒ **合并为 `hands`**；`directed` 与 `call_on` **不可区分**（都是"主席点名"，"是否附带问题"是 `call_on` 的**参数**而非另一个模式）⇒ **合并为 `call_on`**。**保留四种，各自可观察差异**：`open`（**无队列**：任何成员可即刻发言）、`hands`（一次一人，**按举手时间**）、`round_robin`（一次一人，**按已发言次数升序**——`queue()` 的 `round-robin` 分支已接线）、`call_on`（一次一人，**位置由主席指定**——`queue()` 的 `chair` 分支已接线）。★ **R14 已落 ✓**：四模式暴露为 `flow({mode})` 并与 `orderMode` 收敛，逐模式的可观察差异见 **§25.16 B**。

**C · 其余（★ 本轮未落，逐条代价）**：**G2** `invite` 正文/expect/timebox（~40 行，复用 `speechMaxMs`）；**G3** 会期板 `origin`＋`claim_pending`（~70 行，**跨面**，需任务板配合）；**G4** 议程增删/流程/点名/停步（见 B①④；`stop{scope:'step'}` 需 core 先声明"步"键）；**G7** `ballotbox`＋`mailbox` 接同一份耐用日志（**各 ≈ 6 行**：`durableQueue.reserve/complete` 包住 `cast`／`send` 的唯一写入点；协议已在 `kernel/ballot.js` 就绪）。★ **未落**。

**为什么 B/C 未落（如实登记，不改裁决）**：本轮把预算用在 A 的**实现＋11 条断言**（含"无主席 ⇒ 零机制"与"拒绝也留痕"两条硬约束）；B①–④ 与 C 的**裁决与形状已固化在上一表**，逐条带代价与依赖（B② 缺键、B④ 需收敛实现、C 四条各自可独立排期）。⇒ **凡未落地者一律标"未落"，不以文档代替实现。**

---

### 25.15 拆分：`kernel/meetingleave.js`（请假/休会请求的规则）↔ `kernel/meetings.js`（状态）

**为什么拆**：F（请假批准人）落地后 `kernel/meetings.js` 达 **1244** 行 > `docs/02 §L174` 的 1200 行决议线。它**不是**"文本本身就是契约"的文件 ⇒ **不**往 `KNOWN` 加名字，按**规则/状态缝**拆开：

| 半边 | 文件 | 内容 |
|---|---|---|
| **规则** | **`kernel/meetingleave.js`** | 导出 **`createLeaveControls`**（返回 `requestLeave`／`approveLeave`／`leaveRequests`）：谁可**请求**（`isMember` 接缝）／谁可**决定**（`vmu.meetings.leaveApprover`：`chair` 比对主席、`office` 为声明兜底）／**两侧都必须 `why`**／决定**幂等**／**拒绝是一等决定**。回执只报 `keys`，不写回执词汇 |
| **状态** | `kernel/meetings.js` | 注入 `requireMeeting`／`isMember`／`clock`／`limits()`／`deny`／`pushReceipt`；把模块回的 `keys` 经 **`withScope()`** 映射为 `enforced[]`＋`enforcedScope`；持有活记录、`m.minutes.entries`、receipt 台账 |

**行为不变（实测）**：parity **§22 的 13 条断言逐条保持**（`vmu-meeting-parity` **206/0**）；`vmu-meetings`（加载内核）**161/0**。
**结果**：`meetings.js` **1244 → 1188 行**（≤1200）；`audit-code-size` **9/0**，`KNOWN` 仍为 **3**（未增名）；新模块 **0 个 `enforced` 令牌** ⇒ 不制造"未被门禁覆盖的新模块"。

---

### 25.16 Round 14：B③ 发言序覆盖 ＋ B④ 四模式地面（★ 本轮**已落** ✓，逐条实测）

> **本节由 vmu-comms2 撰写（task-108）**；形状取自 §25.14 B-3／B-4 的裁决原文。实现落在 **`kernel/meetingmarker.js`**（规则族）＋ **`kernel/meetings.js`**（状态与调用点）＋ **`tools/meeting.js`**（工具面）。实测脚本 `D:\_tmp\vmu-r14\order14.mjs` ⇒ **54 passed / 0 failed，exit=0**（九组断言，集合断言均带非空前置）。

**A · B③ `overrideOrder({meeting, by, why, mode})` —— 已落 ✓**
| 维度 | 语义（实测） |
|---|---|
| **值域** | `vmu.meetings.orderMode` 增 **`random`** ⇒ `fifo｜round-robin｜chair｜random`（`kernel/meetings.js` 的 `oneOf(...)`；`ORDER_MODES` 是单源常量，`docs/04` 的该行归 vmu-verify2） |
| **仅主席** | `by` 必须是 `open({chair})` 声明的主席；**会议未声明主席** ⇒ 具名拒 `VMU_ENGINE_UNAVAILABLE`（不发明权威）；非主席 ⇒ `VMU_NOT_PERMITTED`（hint 点出已声明的主席） |
| **必须 `why`** | 缺失或纯空白 ⇒ `VMU_REASON_REQUIRED` |
| **未声明即拒** | 该部署**没有声明** `vmu.meetings.orderMode`（settings 缝回 `undefined`）⇒ 具名拒 `VMU_ENGINE_UNAVAILABLE`：**代码默认值不是声明**（零机制；默认＝**不可覆盖**） |
| **生效** | 覆盖**优先于**设置：覆盖在force时 `queue()` **不再读该键**，其 `enforced[]` 为**空**、`modeSource:'override'` ⇒「读了」与「生效了」可分 |
| **留痕** | 四件齐：`m.orderOverride`（随会议记录进 `snapshot()`／`restore()`，实测恢复后仍按覆盖排序）＋ append-only `minutes.entries` 行 `kind:'order-override'` ＋ 总线/日志行 `meetings/order-override` ＋ `pushReceipt`（`enforced:['vmu.meetings.orderMode']`＋`enforcedScope`） |
| **`random` 可审计** | **不读任何随机源**（无 `Math.random`）：成员位次＝`orderSeedOf(seed｜member)`（djb2，同 `kernel/bidding.js#fingerprintOf` 形状）；种子＝`orderSeedOf(meeting｜kind｜mode｜by｜why｜at)`，**种子与结果 `order` 同写进回执**；同一队列两次调用**同序**；**新成员加入不重排他人**（按成员定键，不是洗牌位置） |

**B · B④ `flow({meeting, mode, by, why})` —— 已落 ✓（四模式，各有一处可观察差异）**
| mode | 可观察差异（实测） |
|---|---|
| `open` | **无队列**：`queue()` 回 `queued:false`／`order:[]` 且**不存任何位**；`speak()` 对**从未排队**的成员照常成功（`floor.queueOpen===false`；任何模式下 `speak()` 都从不以"未轮到"拒） |
| `hands` | 一次一人、**举手（到达）序**；**任何成员可自助取位**（`queued:true`，`order`＝到达序） |
| `round_robin` | 一次一人、**按已发言次数升序**（已发言者排后） |
| `call_on` | 一次一人、**位次由主席给**：非主席自助取位 ⇒ `VMU_NOT_PERMITTED`；主席取位 ⇒ `order` 保留主席次序；**未声明主席** ⇒ `VMU_ENGINE_UNAVAILABLE` |

- **合并（R8 裁决）**：`single`＝`hands`、`directed`＝`call_on` **不再作为模式存在**；传旧名 ⇒ **具名拒** `VMU_INVALID_ARGUMENT`，hint **点名替换者**（不是静默别名）。
- **未知 mode** ⇒ `VMU_INVALID_ARGUMENT`。
- **与 B③ 同一条闸**：`flow` 与 `overrideOrder` 写**同一个槽**（`m.orderOverride`）⇒ 同为**仅主席＋必须 `why`＋未声明即拒**；否则 `flow` 就是绕过 B③ 三道闸的洞。
- **一条具名偏离（裁决原文要求 `vmu.agenda.reorderAudit` "同步点名"）**：该键是 **`kernel/governance.js`** 的读者（议程重排留痕），**本次调用没有读它** ⇒ 把它塞进 `enforced[]` 会让"读了"与"生效了"不可分（`audit-enforced-consistency` 正是抓这个）**故未点名**。替代且更合 R1 的路径：本面**已经发事件** `meetings/order-override`／`meetings/floor-flow` ⇒ **pack/中间件**可在该钩子上调治理面的重排留痕，**无需**内核 import 治理面。若 Lead 要求内核直连，需要一条跨面调用（本任务写范围外）。

**C · 该模块的导出面（逐字，供读者与 `tests/audit-module-coverage.test.mjs` 认领整个面而不是一部分）**
`kernel/meetingmarker.js` 导出：`createMeetingMarker`、`mirrorVote`、`budgetVerdictOf`、`createBoxBinding`、`meetingKeysSnapshot`，以及 R14 为 B③/B④ 新增的 **`ORDER_MODES`**、**`FLOW_MODES`**、**`FLOW_MERGED`**、**`FLOW_ORDER`**、**`orderSeedOf`**、**`randomOrderOf`**、**`createOrderControls`**；默认导出 `createMeetingMarker`。
**词汇缝**（与 `kernel/meetingleave.js` 同一条）：本模块只报 `keys`（它真读的设置键），`kernel/meetings.js` 用既有的 `withScope()` 把它映射成回执/返回的 `enforced[]`＋`enforcedScope` ⇒ **回执词汇仍只在面里**，本模块不写第二份封套（它也因此在 `audit-enforced-consistency` 的"代码里提到 enforced 的模块"扫描之外）。

**D · 工具面**：`vibe_vmu_meeting` 新增 **`flow`** 与 **`overrideorder`** 两个 action（`tools/meeting.js`）。★ **id 空间**：这两个 action 寻址 **`vmu.meetings` 服务记录**（`kernel/meetings.js` 的 `live` 表），**不是** action `open` 造的逐对象会议 id；未知 id 由服务**具名拒**（hint 列出在活记录）；服务未装配 ⇒ `VMU_ENGINE_UNAVAILABLE`（不静默）。

**E · 实测与具名未做（R14 当时的登记；其后继见下条 F）**：原样命令／退出码见 `_handoff/vmu/comms-round14-report.md` §D。R14 具名未做：① `docs/04` 的 `vmu.meetings.orderMode` 行值域仍写 `—`；② 本节 §19.1 计划表里该键的值域（`hands｜round-robin｜seat｜weighted｜unspoken-first`）与代码实际值域不符（计划表既有漂移）；③ `speak_order_set`／`speak_next` 的**命令名**（GAP-MTG-06b）未落 —— R14 落的是 `flow`／`overrideOrder`／`call_on` 三件，命名差异具名在此。⇒ ① 的根因与正确修法、② 的落地结果，以及 R15 新增的两件（open ballot 回执诚实化、断言进仓），逐条见 **F**。

**F · R15（task-112）· ① open ballot 的"回执伪造 tally"诚实化 ＋ ② 断言进仓 ＋ ③ 两条 docs 漂移的逐条结论**

- **① 诚实化＝已落 ✓**（`kernel/meetings.js` 的 `vote()`）：`motion` 缺省（"open ballot"）时该调用**真的**写 minutes 并涨 `counters.votes`，**但没有可计数的容器** ⇒ 回执**不再声称** `tally:{for:0,against:0,abstain:0}`（那是个"看着像真的"的计数），改为 **`tally:null` ＋ `counted:false` ＋ 具名 `tallyNote`**（note 里点名真正的容器）。**两半分开断言**：`tally:null`（不许多报）与"minutes 真写＋`counters.votes` 真涨"（真的做了）各一条。
  - **它"能红"**：`tests/vmu-meeting-order.test.mjs` §1；用 loader 钩子把旧写法还原后复跑 ⇒ **RED：59 passed / 1 failed，exit=1**（失败行正是"回执不许再回 `{for:0,against:0,abstain:0}`"）；干净树 ⇒ **60 passed / 0 failed，exit=0**。
  - ★ **第二步（先查再定）的结论＝v5r 有该机制，且 vmu 已有等价容器 ⇒ 不在本面造第二份**：v5r 的 open ballot 是**容器**（"当前 `phase==='open'` 的板" `vibe-math-v5r.js:1764`），工具 **`vibe_v5_poll_open`／`vibe_v5_poll_vote`／`vibe_v5_poll_close`**（注册 `:11164-11166`，实现 `:1823`／`:1899`／`:1962`），关闭时**真的计票**并受 `min_votes` 门（`:1803`／`:10496-10509`）。vmu 侧的同一容器是 **`kernel/ballotbox.js`（选项板：options/min_votes/保密/弃权/reopen）＋ `kernel/ballot.js`**，经工具面 `action=boxopen→boxcast→boxclose`／`ballot→vote→tally` 可达（`docs/08 §25.14 A`／GAP-MTG-10，A/B 对照见 `tests/vmu-ab-v5r-meetings.test.mjs`）。⇒ 缺口是**回执的诚实性**，**不是**缺机制；**为对称再开一个容器会变成同一机制的第二份实现**，故不做。
- **② 断言进仓＝已落 ✓**：新建 **`tests/vmu-meeting-order.test.mjs`**（**60 条**：§1 诚实性 7 条／§2 三道闸 14 条／§3 覆盖真变＋`enforced` 空 9 条／§4 四模式＋合并名 16 条／§5 回执 vs 真做＋`restore()` 7 条／§6 `random` 确定性 6 条／§7 变异 4 条），已登记 `package.json` 的 `files[]`（`installer.js` 的 `PRESETS[].files` **对任何测试文件都没有条目**——实测 0 条 ⇒ 测试文件的第二登记就是 `files[]` 本身）。集合断言**带非空前置** ⇒ `RULE E fingerprints current=67 = baseline=67`（**未推高**）。**变异**在**进程内**做（`data:` URL 导入变异后的 `meetingmarker.js`，该模块无 import）⇒ 测试**不依赖 `D:\_tmp`**、不写仓库。
- **③ 两条漂移**：
  - **落**：`docs/08 §19.1` 的 `vmu.meetings.orderMode` 行值域改为**实测值域** `fifo｜round-robin｜chair｜random`（默认 `fifo`），原计划值域保留在同行说明里 —— 计划表**行数不变**、且无任何生成器解析"值域"单元格（实测 `grep` 全树无该单元格的消费者）。
  - **具名不落**：`docs/04 §11` 的该键行值域仍 `—`。**根因是生成链**：`scripts/generate-vmu-settings-table.mjs:119` 规定"`def.type !== 'enum'` ⇒ 值域显示 `—`"，而 `settings/schema.js` 把它声明为 `type:'string'` ⇒ 手改该单元格会被生成器覆盖、并让 `--check` 变**陈旧红**。**正确修法＝在 `settings/schema.js` 把该键声明为 `enum` ＋ `values:['fifo','round-robin','chair','random']`，再由 Lead 的 `regen-all` 重生成 docs/04**（`settings/**` **不在 task-112 写范围**，且本任务禁 `regen-all`）⇒ 交 Lead／settings 面的 owner 定夺。

---

## 26. Round 3 · 目标 2 缺口：一次性 future-only 活动等待器（F52 / C-56）
> **判据**：`_handoff/vmu/03-v5r-full-inventory.md` 分片 A **§6 原语 F52**（"必须是未来一次性语义"）、**C-56**（`vibe_v5_wait`／`waitForActivity`／`notifyActivity`，`vibe-math-v5r.js:3424-3466`、工具 `:11142-11151`）。
> **缺口实测**：Round 3 之前 vmu 全树对 `waitFor`／`notifyActivity`／`vibe_v5_wait`／`activityWaiter` **零命中** ⇒ 成员只能轮询（烧 token）或永远等；这条直接落在"利于多智能体协作"的反面，故本轮补为内核原语。
> **本节由 `vmu-activity` 撰写（task-24）、由本节所有者插入**；标识符逐字保留，供 `tests/audit-module-coverage.test.mjs` 认领该模块。

### 26.1 新增内核原语（Round 3）

| 原语 | 文件 | 工厂 | 工具面 | 设置键（全部真读） | 新错误码 |
|---|---|---|---|---|---|
| 一次性 future-only 活动等待器 | `kernel/activity.js` | `createActivity({clock,log,settings,bus,timer,activePeers})` | `vibe_vmu_wait`（`tools/activity.js`，2 动作 `wait｜status`） | `vmu.activity.timeoutMs`／`timeoutMinMs`／`timeoutMaxMs`／`timeoutPolicy`／`wakeOn`／`maxWaiters`／`noPeerShortCircuit` | `VMU_ACTIVITY_INVALID_TIMEOUT`／`_NO_TIMER`／`_TIMER_INVALID`／`_BOUNDS_INVALID`／`_SIGNAL_INVALID`／`_ABORTED`／`_WAITER_LIMIT`／`_DISPOSED`／`_WAKE_HOOK_UNKNOWN`／`_WAKE_UNWIRED`／`_PEER_SEAM_FAILED` |

**该模块的导出面（逐字，供读者与门禁认领整个面而不是一部分）**：模块 `activity`（`kernel/activity.js`）导出 `apiVersion`、`refuse`、**`CODE`**、**`TIMEOUT_BOUNDS`**、**`ACTIVITY_KEYS`**、**`WIRED_ACTIVITY_KEYS`**、`WAKE_ENTRY_ID`、`normalizeTimer`、`normalizeWakeOn`、**`createActivity`**；服务名 `vmu.activity`，工具名 `vibe_vmu_wait`。其中 `CODE` 是**十一**个 `VMU_ACTIVITY_*` 码的单源表（含**上报型** `VMU_ACTIVITY_WAKE_UNWIRED`：它出现在 `status().wake.problems[].code`，不是抛出的），`TIMEOUT_BOUNDS` 是默认区间（`[10000, 3600000]`，可被 `timeoutMinMs`／`timeoutMaxMs` 覆盖）；而 `ACTIVITY_KEYS` 与 `WIRED_ACTIVITY_KEYS` 是**同一个 7 键集合**——本面 7 键**全部已接线、且每个都真的改变结果**（实现里 `WIRED_ACTIVITY_KEYS` ＝ `ACTIVITY_KEYS.slice()`）⇒ `partition()` 的 `planned`／`unwired` 都是空表，不制造"未接线"的假分类。

**不变式（每条都有断言，且每条断言都被证明"能红"）**

- **只看未来（future-only）**：等待开始**之前**发生的通知**绝不**唤醒它。机制是**没有积压**——`notify()` 没有等待者时只记录事实（`notified:0`）并**不入队**；等待者登记时记下当时可见的通知序号（`openedSeq`），只有**更新的**通知才可能 resolve 它。v5r 的原话就是这条要求：**不能把历史活动当新活动**。
  > 证伪：`tests/vmu-activity-falsify.test.mjs` 把 `kernel/activity.js` 复制到 `D:\_tmp` 后**注入"历史重放"缺陷**（新来者被**已发生**的最后一条通知 resolve）并导入，同一探针必须变红（实测：真模块 `wokeOnHistory=false`，变异体 `true`）；另有一个文件内变异体做探测器自证。
- **一次性（one-shot）**：`notify()` 取走**当前这一代**等待者并清空集合，逐个 resolve **恰好一次**；第二条通知唤醒 `0`；被唤醒／超时／中止的等待者**当场注销**（`status().waiters` 归零）。
- **超时区间**：`[10000, 3600000]` ms（v5r `vibe-math-v5r.js:3435-3439` 的区间）。越界**默认具名拒** `VMU_ACTIVITY_INVALID_TIMEOUT`（与 v5r 同义，`hint` 里点名另一条路）；`vmu.activity.timeoutPolicy="clamp"` 是**声明的另一种**处置，钳制时回执自曝 `clamped:true` 并计数。边界本身是设置键（`timeoutMinMs`／`timeoutMaxMs`），**不硬编码两次**；`timeoutMinMs > timeoutMaxMs` 这类不可用组合**具名拒** `VMU_ACTIVITY_BOUNDS_INVALID`。
- **disposer 在所有分支清理**：成功／超时／中止三条路都汇入**同一个** `cleanup()`（摘等待者 → 调定时器 disposer → 摘 abort 监听），且幂等；连"注入的定时器在 arming 时同步触发"这种病态形状也把刚拿到的 disposer 补跑。`status().disposersCalled` 把这条纪律变成**读数**而不是承诺（实测三个分支各恰好 1 次）。
- **没有定时器就不假装有**：`timer: null` ＝"本部署没有定时器"⇒ `wait()` **具名拒** `VMU_ACTIVITY_NO_TIMER`，绝不返回一个永远不会超时的 promise。**省略** `timer` ⇒ 用平台定时器，`status().timer.shape` 报告 `global-setTimeout`（可注入三形状：`{timeout(cb,ms)->disposer}`、`{setTimeout,clearTimeout}`、`(cb,ms)->disposer`；`normalizeTimer` 负责归一化）。
- **可 abort**：`signal` 支持；`wait()` 在**已经 aborted** 时拒绝且**一个定时器都不 arm**。拒绝码**一律具名** `VMU_ACTIVITY_ABORTED`，signal 的 `reason` 保留在 `abortReason`／`cause`。
  > **与 v5r 的具名偏离**：v5r 在 reason 是 `Error` 时**原样 reject**（`vibe-math-v5r.js:3449-3451`）；这里同样保留 reason，但**码始终具名**——`AbortController.abort()` 的默认 reason 是 `DOMException`，其 `code` 是**数字 20**，一个数字型无名码越过工具面正是本项目拒绝的形态。
- **无活跃同伴立即短路（v5r parity）**：注入 `activePeers(me)` 后，没有**其他**在活成员时**立即**返回 `noProgress:{reason:'no-active-peer'}`，**不 arm 定时器、不登记等待者**——这就是"不空等、不烧 token"。接缝**抛错或返回非数组**⇒ 具名拒 `VMU_ACTIVITY_PEER_SEAM_FAILED`（**绝不**被读成"没人"）；`vmu.activity.noPeerShortCircuit=false` 是可声明的关闭开关；**没有**接缝时 `status().peerCheck.seam=false` 如实自曝（不假装查过）。
- **可观测、可终止**：`status()` 给出等待者列表／最后一条通知／通知环（有界、丢弃**计数**）／各拒绝码计数／策略快照／定时器来源／唤醒接线状态／`enforced[]` 口径；`keysUsed()`／`partition()`／`config()`／`refusals()` 齐备。`dispose()` 把未决等待**具名**结束（`VMU_ACTIVITY_DISPOSED`，**不算"等到了"**）、跑掉 disposer、并按名停掉总线条目。

### 26.2 唤醒来源（只有两个）

1. **命令式**：`notify({what,at})` —— v5r 的 `notifyActivity()` 同义，给握有服务的生产者调用。
2. **声明式**：声明 `vmu.activity.wakeOn: ['chat/sent', …]` 时，构造期在总线上注册**一个**观察条目（`id` ＝ `WAKE_ENTRY_ID` ＝ `vmu-activity-wake`，`kind:'module'`，`failure:'open'`，`order:900`），于是**真实已提交的状态变化**直接唤醒等待者，不必逐个生产者改代码。该 handler **返回 `undefined`**（不产生任何 decision）⇒ **坏掉的唤醒监听器永远不能阻断它所观察的写入**（实测：`bus.emit` 的 `decisions` 为空）。
   - 钩子词表**读自 `kernel/bus.js` 的登记**（单一真源，经 `normalizeWakeOn` 归一化）⇒ 名字写错是 `VMU_ACTIVITY_WAKE_HOOK_UNKNOWN` **具名问题**，而不是"静默订阅了一个没人 emit 的名字"；没有总线时同样具名上报（`wired:false` ＋ problems）。
   - 默认 `wakeOn: []` ＝ **零机制**：不注册条目、不挂监听器。
   - **热改等级 H2 的道理**：条目在**构造期**注册 ⇒ 改键**下次会话**生效；回执不得声称即时（`settings/schema.js` 的该行 doc 已写明）。
   - **已知相互作用（如实登记，不是缺陷）**：声明 `wakeOn` 会让总线**真的**多一个条目，于是 D-01 的 `middleware` 面"总线上已有条目即声明"这条 `extraIntent` 会随之一同点亮。

### 26.3 分层与边界

- **能力进内核**：等待机制（登记／一次性／future-only／disposer／abort／上限／短路）在 `kernel/activity.js`。
- **策略进 settings/pack**：区间上下界、拒／钳、等待者上限、是否短路、唤醒哪些钩子，全部是 `vmu.activity.*`（`who: office`；`H1` 的六键**每次调用现读**，故"下回合生效"是真的）。
- **`tools/activity.js` 只做寻址与调用**：它**不**复制区间策略（实测：低于区间的值原样交给内核，只有内核钳制），也不暴露 `notify`——**唤醒是已提交状态变化的事**，不是成员可以自己主张的事；成员想让事情发生就去产出（发言／派任务／开会）。
- **工具参数以 `docs/03` 的行为准**：`action`（缺省 `wait`）／`timeoutMs`／`why`／`me`；v5r 拼写 `timeout_ms`／`reason`／`member` 作为**别名**接受（便于照搬 v5r 调用）。
- **回执／拒绝的 D3 口径**：**每个**回执（被唤醒／超时／`noProgress`／`notify`／`dispose`）与**每个**拒绝都带 **`enforced[]`**（本面**这次调用**真正求值的键，数组、从不为 `undefined`）＋ **`enforcedScope:'evaluated-so-far'`**——与内核其余各面同一个名词、同一套语义。两条自曝纪律：① `vmu.activity.wakeOn` 是**构造期**键，只由 `keysUsed()` 承担，**不进**任何调用回执的 `enforced[]`（"未求值的键不得出现"）；② `vmu.activity.timeoutMs` 只在**调用方省略超时**时进入 `enforced[]`（那次调用真的读了默认值）；注入了同伴接缝时 `vmu.activity.noPeerShortCircuit` 必在列（它的值决定短路与否）。
  > **待办（具名，不绕门）**：本面因此出现在 `tests/audit-enforced-consistency.test.mjs` 的"代码里出现 `enforced` 的 kernel 模块"名单里 ⇒ 在该门禁补上 `activity` 的场景行之前，它会报 `UNCOVERED-MODULE @ activity.js`。**这是如实登记**：口径就用内核统一的 `enforced[]`，不为过门改叫 `evaluated`；可粘贴的场景块已由 `vmu-activity` 交给门禁主人（vmu-verify）。服务名 `vmu.activity`。

### 26.4 验证（原样命令与读数）

| 命令 | 读数 |
|---|---|
| `node tests/vmu-activity-kernel.test.mjs` | `=== VMU ACTIVITY: 141 passed, 0 failed ===` |
| `node tests/vmu-activity-falsify.test.mjs` | `=== VMU ACTIVITY FALSIFY: 21 passed, 0 failed ===` |
| `node tests/vmu-activity-tool.test.mjs` | `=== VMU ACTIVITY TOOL: 58 passed, 0 failed ===` |

真机装配证据（`tests/vmu-activity-tool.test.mjs` §4）：声明 `vmu.activity.wakeOn:['chat/sent']` 的**真 kernel** 上，`k.activity.wait(...)` 被 `k.bus.emit('chat/sent', …)` **真的**唤醒（`notified.what==='hook:chat/sent'`）；同一装配下 `vmu.activity.noPeerShortCircuit=false` 的第 2 个 kernel **真的**超时（平台定时器）且 disposer 已跑；空名册时 `wait()` 立即 `noProgress:'no-active-peer'`。

## 27. 会议两注册表、ballot 镜像与 close 语义（PHASE 9+ / G7 真机）

会议面有**两个注册表**：`primitive`（`vibe_v5_meeting` 等逐对象原语开的）与 `service`（`vmu.meetings` 服务开的）。`vibe_vmu_meeting action:"list"` 同时报 `meetings`／`serviceMeetings`／`unionMeetings`；`summary`/`close` 的 `id` 读 **service**，`ballot` 的 `meeting` 读 **primitive** —— 参数名按 action 不同，传错只回 `id undefined`（已知可用性瑕疵）。

★ **ballot 绑定 `(meeting, motion)`**：`action:"ballot"` 回执带
`{ballotId, opened, target, mergedInto:{meeting,motion}, eligible}`。
★ **投票镜像到 service**：`action:"vote"` 回执带
`serviceVote:{ok, counted, tally, tallyNote, ballot:{mirrored, reason, boxId, code}}`；
`action:"summary"` 的 `motions[0].tally` 与 `votes` **必须和 ballot 票数一致**（G7 复验：两票后 `tally.for:2`、`votes` 两条、会议级 `votes:2`）。
★ **close**：`action:"close"` 回 `registry:"service"`、`closeSemantics:"service-archives"`、`enforced` **必须是数组**（不是字符串 `"[circular]"`）；会议进 service 归档后 `summary` 仍可读 motion/票。★ **`close.enforced` 现在会列出 advisory rails**（例如 `vmu.meetings.eligibleSeats`；数组可为空，空数组表示本次没有 advisory 键生效，不是类型退化）。
★ **quorum 的“投票即参与”语义**：`vote` 计票的同时把投票人视为**已参与**（`quorum.present` 应随票增加）；`vmu.meetings.unansweredPolicy` 决定未回答者如何计入分母——**“未投票”与“未参与”不是一回事**，实现与回执必须分开读。G7 复验仍观察到 `unansweredList` 陈旧（已知读数缺陷，不改变本条语义）。
★ **`eligibleSeats`**：框架默认 **`[]`（零策略：不替机构决定谁有票）**；v5r 的 pack 值层声明 `chair/member` —— 这是“政策在 pack，不在内核”的红线 1 例子。
★ **真机证据**：G7 复验（`D:\_tmp\slv-v5r\g7-verify.txt`，仓库外实测文件）—— `serviceVote.ballot.mirrored:true`、`summary.tally.for:2`、`close.enforced:[]`（数组）、`slv-inspect 5 sessions / 0 RED`。



