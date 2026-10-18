# `packs/v3/` — v3 复刻包（PHASE 6）

**这一句话是它可能是什么**：把 `vibe-math-v3` 的机制（周期调度 → 规划 → 数据面 → 方法库 → 验证闭环 → 人工门）
复刻成 vmu 的一个**整合包**；vmu 的内核提供能力，这个文件夹只声明"v3 这家机构要什么"。

## 与 `packs/v3-core/` 的关系

**互斥装载（部署二选一）**。`v3-core` 是 v3 的**机构外壳**（槽位/轨/两个闸），文件头自己写着
"NOT v3 and NOT a behavioural-equivalence proof"；`v3`（本文件夹）是把运转机制真正落下来的那一个。
两个包的 `settings`/`tracks` 会重叠，同时装载会被 `kernel/pack.js` 以 `VMU_PACK_CONFLICT` 具名拒。

## 已落了什么

| 文件 | 职责 |
|---|---|
| `index.js` | 被装载清单（`PACK`）：六个 middleware 模块（`v3-tick`、`v3-planner`、`v3-methods`、`v3-verify`、`v3-dataplane`、`v3-gates`）＋ 提示段（`sections: [v3-planner, ...21 段]`，见下）。 |
| `settings/defaults.json` | **值层**：构造期就被读取的值 —— schedule 四键、`vmu.v3.tickIntervalMs`，P0-9 的 records 五键（轨/kind 白名单/未定稿可写/正文上限/条数上限），以及 P0-4 的第六把 `vmu.records.history.storeMode=full`（版本要带快照）。 |
| `middleware/tick.js` | P0-1 tick 体：订阅 `v3/tick`，写一条 `journal` 记录，返回 `{ok:true}`。 |
| `middleware/dataplane.js` | **P0-9 ＋ P0-6 数据面**：三卡 compose/parse（问题/命题/方法）、正文段逐字保留、有界写入（截断＋`dropped` 计数）、索引重建（条目数＝磁盘卡数、坏卡点名、`dropped` 计数）、Verified 分裂（只收定论、内容不变不重写）、tick 驱动的 5s 节流索引；P0-2 追加 `supersedeBody`（非卡记录的**同一个**有界写入口）。 |
| `middleware/planner.js` | **P0-2 ＋ P0-3 规划-调度与学习闭环**：`v3/tick` → 判可推进 → 组简报 → `vmu.turn.run({member:'planner'})` → 归一化/校验（6 动作白名单／horizon 截断／去重／逐角色硬校验）→ 按容量执行 → 逐条 outcome 写回 `plans` 轨；`turn/reply-parsed` 上做 K10 归一化（落盘 + `rewriteResult`）。 |
| `middleware/methods.js` | **P0-4 ＋ P0-5 方法库与发明上报**：方法卡的应用记录（只在有 qid/dirId 上下文时追加）／改进历史（v 号单调）／可信断言（只收概率 1/0 的命题）／项目级↔全局级两级晋升／耐久库冻结修订；`new_inventions` 入 `inventions` 轨、method-keeper 到期派发、有产出与无产出两条路都清队，无产出走**幂等兜底建卡**。 |
| `middleware/verify.js` | **P0-7 验证闭环**：**双写**（内核 `vmu.ballotbox` 强制法定人数＋连续 Result 落 `votes` 轨）／pack 纯函数聚合（全 1、全 0、同侧均值 ≥0.85、forced 等权均值夹 [0.01,0.99]、flat）／非全票一致才辩论且轮次有界（`vmu.v3.debateMaxRounds`）／裁决回写三处：命题卡＋`verified` 轨（只经 `promoteVerified`）＋`journal` 轨。 |
| `middleware/gates.js` | **P0-8 人工门**：判定纯函数（auto 直通／manual 排队／未知值 fail-closed）＋台账（`journal` 轨 `decision` kind，一条门一条记录）＋ approve/reject/releaseAll；planner/verify 在动作落地前调 `evaluateGate`，批准后由它们注册的执行器真正执行。 |
| `prompts/planner.js` | **P0-2 规划器提示段**（纯数据，`scope.role='planner'`）：动作词表、硬规则、回执契约。走清单 `sections` 通道（原因见下）。 |
| `prompts/sections.json` | **P0-6 可信分层段**（纯数据）：只有 `verified` 轨"绝对可信"，其余一律"经验参考"。插件在建内核**之前**按目录名读它。 |
| `README.md` | 本文件。 |

## 两条必须知道的装载约束（写在这里，别在下一轮重新踩）

1. **构造期要读的键只能放 `settings/defaults.json`。** 清单的 `settings` 是装载后 apply，而调度器与 records
   在 `createKernel` 构造期就把这些值读走/快照了（`kernel/scheduler.js:96-114`、`kernel/index.js:878-887`、
   `kernel/records.js:189-221`）。写错地方**不会报错**，系统只是"安安静静地不跑/卡写不进去"。
   P0-9 因此把 `vmu.records.tracks / allowedKinds / requireSettledRecords / bodyCapBytes / head.maxItems`
   全部放进值层；P0-4 再加 `vmu.records.history.storeMode=full`（`:208-209` 构造期读、`:378` 只有 `full`
   才存版本快照 ⇒ 不补会静默拿到 `diff`、改进历史不可回看）。`PACK.settings` 保持**空**。
2. **`v3/tick` 是协议扩展主题，必须先 `declareTopic` 才能 emit / 才能被模块订阅。** 声明发生在
   `middleware/tick.js` 被 import 时（`bus.declareTopic` 是进程级的）。清单里的 module 条目**故意不写
   `kind`**：`kernel/pack.js` 会把无 `kind` 的条目按 module 处理，而 `kernel/bus.js` 的静态校验会拒
   "带 kind 却没有 handler"的原始条目。

### 为什么清单里**没有** `tracks:` 字段

清单 §4 曾建议 v3 扩 `tracks`。实测：`kernel/pack.js:479-482` 对 manifest `tracks` 调的是
`kernel.declareTracks()`，它**重建 `kernel.library`**，且第一行 `mustLibrary()` 在没有 `root` 的装配上
**具名拒**（`kernel/index.js:1871-1877`）⇒ 加了它，没工作区的部署会在 apply 期拿到 pack 错误；而且它喂的是
library，**不是** `vmu.records` 的构造期快照 ⇒ 轨仍然写不进去。**轨的唯一生效处是值层**
（`vmu.records.tracks`），清单的 `tracks` 既不必要也会坏事。

## 数据面的两条契约（P0-9/P0-6 的可写断言都落在这上面）

1. **正文只增不减 / 自定义段逐字保留**（v3 `:893-903`、`:6128-6143`）：compose 只重写它接管的锚点行与
   托管段（问题卡：陈述/解法候选；命题卡：陈述/证明尝试/证伪尝试；方法卡：核心内容/应用记录/改进历史），
   其余任意 `## ` 段在回写后**原样保留在正文末尾**。`findSectionHeads` **跳过围栏代码块**：围栏里的
   `## ` 不是段边界（否则回写会把代码块劈开）。重复回写是**幂等**的（同一 patch 第二次回写逐字节不变）。
2. **Verified 分裂**（v3 `:1060-1080`、`:2112-2131`）：只有定论（命题 `- 概率: 1|0`、问题 `- 状态: 已解决`）
   才能 `promoteVerified` 进 `verified` 轨；非定论是**具名拒**（`VMU_STATE`），不是静默不写。Verified 卡的
   body 带结论/时间/来源/分类 ＋ **全部 prob=1 的证明/证伪/解法全文**；内容不变（时间行不参与比较）⇒
   `{written:false, unchanged:true}`，不重写。`verified` 轨的每一条都是 1/0 结论。

## 方法库与发明上报（P0-4/P0-5）的五条契约

1. **应用记录只在有上下文时追加**（v3 `:2804-2812`）：`methods_used` 引用了项目级方法卡且 `qid`/`dirId`
   至少一个非空 ⇒ 追加 `### 应用 N｜<时间>｜问题 X 方向 d`；没上下文 ⇒ **不写**并在回执里 `skippedApplications`
   计数（method-keeper 纯整理时引用方法不算"实际应用"，否则污染应用计数并触发错误的晋升）。
2. **未知 method id 不丢**（v3 `:2798-2802`）：作为待沉淀发明入 `inventions` 轨（`kind=invention`），
   `consumeMethodFeedback` 的回执带 `unknown` 计数与发明记录 id。
3. **改进历史 v 号单调**：`v = max(既有 v) + 1`（不是数组长度 —— 中间被删过也不倒退/复用），逐条落进卡的
   版本历史；`vmu.records.history.storeMode=full` 让每一版都带完整快照可回看。
4. **可信断言只收已定论命题**（v3 `:2880`）：只保留概率 1 或 0 的命题 id；不存在的/未定论的逐条**具名丢弃**
   （`trustedDropped:[{id, why}]`），不静默过滤。
5. **两级**：项目级/全局级用 **tag** 表示（`level:project` 默认、`level:global`），晋升阈值 3 条应用记录
   （v3 `:2939` 的常量）；`vmu.v3.methodAutoPromote=false`（默认）时**只报告不晋升**（`skipped` 具名，
   P0-8 的人工门以后接管）。此外每一版卡还会在**耐久库**冻结成 `<库记录 id>@<n>.md` 修订文件
   （`kernel/library.js:661-679`），没有工作区根时具名 `skipped:'no-library-root'`。

### 兜底建卡的幂等键

`fallback:<sha256(发明记录 id)[:16]>`。发明记录的 id 是耐久事实（不随标题/正文重述而变），所以同一批
pending 若因崩溃/清队失败再兜底一次：先按这个键在方法卡正文的 `## 沉淀元数据` 自定义段里查（回写不会丢
自定义段），命中就复用；再由 `records` 的内容指纹（content-only：kind+body+tags）兜底 —— 两道都不新建第二张卡。

### 回执载体（为什么不是顶层 `methods_used`）

内核的回合字段门**在任何中间件看到回执之前**就按 `FIELD_OWNERS + RECORDED_FIELDS` 拒未知顶层字段
（`kernel/turn/index.js:844-848`），而 v3 的 `methods_used`/`new_inventions` 是顶层字段 ⇒ 本包契约把它们放进
**已登记字段 `progress` 的载荷**：`progress.tags` 里的 `mu:`／`inv:`／`ctx:`／`imp:` 前缀（给模型的稳定契约，
P1-6 的提示段负责写进提示词），或 `progress.methods_used`/`progress.new_inventions`/`progress.qid`/`progress.dirId`
（同名字段）。纯 API 与测试也接受 v3 的顶层形状。消费完成后本模块返回 `{rewriteResult: <JSON 对象文本>}`，
把载荷换成一条合法 `journal` 记录再交给派发器（K10：非 JSON 对象文本会被内核以 `VMU_TURN_BAD_JSON` 具名拒）。

## 验证闭环（P0-7）的五条契约

1. **分层**：**法定人数由内核强制**（`vmu.ballotbox` 的 `open`/`cast`/`close`；不足即 `VMU_BALLOT_MIN_VOTES_NOT_MET`，
   且明说"不是未通过，是未成立"），**概率语义由 pack 持有**（连续 `Result∈[0,1]` 落 `votes` 轨，聚合在纯函数里）。
   票箱只收选项票，所以每票**双写**：`cast`（选项＝`for`/`against`）+ `votes` 轨（连续值/理由/轮次）。
2. **单票绝不定论**：闸门在结算层 `trySettle()`，不在算术里 —— 要求本轮 `votes` ≥ `max(2, vmu.v3.verifierCount)`；
   不足则**具名返回** `{ok:false, code:'VMU_BALLOT_MIN_VOTES_NOT_MET', settled:false, verdict:null}`
   （`source:'pack-precheck'` 或 `source:'kernel'`），对象卡/verified 轨/裁决 journal **一律不写**，
   只写一条"本轮未成立"审计 journal。这是**pack 自己的具名失败返回**，**不是**总线的 `deny`
   （`deny` 会阻断 tick 的动作，而这里要的是"这一轮不定论、下一 tick 继续"）。
3. **辩论轮次有界**：v3 的 `consensus` 只指**全 1/全 0**；不是全票一致且在 `vmu.v3.debateMaxRounds` 之内 ⇒
   进入下一轮（**每轮新开一个票箱**，因为票箱一人一票），每轮摘要写进 `journal`；轮次用完按
   `vmu.v3.verdictMode`（`forced` 夹 [0.01,0.99]／`natural` 原值）**具名收口**并记 `maxRoundsReached: true`。
4. **三处同时落盘**：命题卡 `- 概率:`/`- 状态:`（`已验证·真`/`已验证·假`/`未定论`）→ `verified` 轨
   （**只经 `dataplane.promoteVerified`**，只收 1/0）→ `journal` 轨裁决记录（target/verdict/rule/round/votes/ballot）。
5. **载体**：验证者的票只能走**已登记字段 `progress`** 的载荷（`progress.votes` 同名字段，或 `vote:<target>｜<result>｜<reason>｜<round>`
   tag —— tag 的 `｜`/换行/反斜杠经转义可逐字还原）；消费后返回 `{rewriteResult: '{}'}`（JSON 对象文本）。
   缺字段的票与"没有本轮票箱的票"都写具名 journal，**不静默丢**。

### 为什么"未成立"不是 `deny`

总线 `deny` 的语义是"这个动作被拒绝"（调用方应当停下/改参）；而"票数不足"是**一次真实但未完成的表决**：
候选仍然合法、下一 tick 会继续收票。所以本模块用**具名返回值**（`ok:false`＋`code`＋`tally`）表达它，
并由 tick 落一条 `v3 验证未成立` 审计记录；内核 `close` 的 `deny` 对象也**原样透传**（同一 code，`source:'kernel'`）。

## 人工门（P0-8）的四条契约

1. **判定／台账／放行都在 `gates.js`**：判定是纯函数（auto 直通、manual 排队、未知值 fail-closed）；台账落
   `journal` 轨的 `decision` kind —— **不占 `plans` 轨**（否则 `latestPlanRecord` 会把审批记录当成"上一条计划"，
   排空被延后一整轮）；一条门一条记录，放行/拒绝/失败都用 `supersede` 写回**同一条**（id 不变、rev 递增）。
2. **消费点只有两处**：`planner.js`（计划执行前，`kind:'plan'`）与 `verify.js`（裁决回写前，`kind:'verdict'`）。
   manual 且未放行 ⇒ 计划记录写 `status:'awaiting-approval'` ＋ `gateId` 且**一条动作都不执行**；裁决只写
   "待审"journal，命题卡与 `verified` 轨都不动。
3. **放行才执行**：planner/verify 在开门时用 `registerGateExecutor` 注册执行器（**复用**同一条执行段：
   计划复用 `executeValidatedActions`，裁决复用 `settleProposition`）；`approveGate` 调到它；批准但没有执行器
   ⇒ 终态 `failed`（**绝不**把"没执行"伪装成"已放行"）。
4. **切回 auto ＝ 一拍放行**：`v3-gates` 是**最后**一个 tick 消费者（order 125）；模式是 auto 且仍有 pending ⇒
   `releaseAllGates()` 全部放行（失败也落终态）。planner/verify 在门仍 pending 时**不重复开门**（计划仍在等审批 ⇒
   规划器具名 skip；同一候选已有 pending 裁决门 ⇒ verify 具名 skip，不刷台账）。

## 规划-调度与学习闭环（P0-2/P0-3）的三条契约

1. **派发只能从 `v3/tick` 里做。** `vmu.turn` 已进 M2 服务目录（K2），但回合内再开回合会被
   `VMU_TURN_REENTRANT` 具名拒（`kernel/turn/index.js:1055-1064`）。tick 是**总线钩子、不是 turn**，
   所以 `vmu.turn.run({member:'planner', role:'planner', phase:'normal', statusBlock: <简报 JSON>})`
   只在 tick 处理器里调用。`turn/reply-parsed` 处理器**绝不**再开回合（它只写一条记录 + 返回改写值）。
2. **规划器回执走内核已登记的 `progress` 字段（→ `vmu.records.put`），不是 `{summary, plan}`。**
   原因：`parse` 在**任何中间件看到回执之前**就按 `FIELD_OWNERS + RECORDED_FIELDS` 拒未知顶层字段
   （`kernel/turn/index.js:844-848`），所以回执必须从一个内核认识的字段进入。计划动作放在**记录的 tags**
   上（一条动作一个 `act:` tag，全角竖线分段），`body` 只放 `- summary:` 一行 —— 这样不需要在 JSON 里再
   嵌套转义 JSON。tick 侧用**同一个读取器**读它（`readRawPlan`），随后校验并 `supersedeBody` 归一化成
   一条 JSON 计划记录（`{summary, raw, validated, rejected, truncated, duplicates, outcomes, queued, status}`）。
3. **学习环 = `plans` 轨上的 `outcomes`。** 每个被执行的动作产生一条 `{action, role, target, ok, error?}`
   写回同一条计划记录；下一次组简报时读**最新一条**计划记录的 `outcomes` → `brief.last_plan`。所以
   "第 n 次简报里的 `last_plan.outcomes` 长度 ＝ 第 n-1 次实际执行的动作数"是可断言的等式，不是形容词。

### 规划器提示段为什么**不在** `prompts/sections.json`

`prompts/sections.json` 的读取端（`vibe-math-vmu.js:331-342`）只保留 `name/order/range/text` 与
`role|phase|member|task` 四个绑定维度，**`scope` 会被丢弃**（`docs/10-packs.md` §3.3）。而 v3 的规划器词表
**只能**对规划器回合出现（提示词对账文档 §2.3 的 X9：planner 不拿知识上下文/能力/数学/形式化，别的角色也不
该拿调度词表）。所以规划段走**清单的 `sections` 通道**（晚注册 `kernel/prompt/index.js` 的 `register`，
字段完整、`scope` 生效）—— 文本仍是纯数据模块 `prompts/planner.js`，`order=700` 落在 pack 区间。

## K10 归一化：`turn/reply-parsed` 上做了什么

`turn/reply-parsed` 是可改写钩子（`kernel/bus.js:81`；`rewriteOf` 在 `:752-773`），消费者在
`kernel/turn/index.js:1012-1021`。本包在它上面：把规划器回执的 `progress` 载荷**归一化并替它落盘**
（写 `plans` 轨），然后返回 `{ rewriteResult: <归一化回执 JSON> }` —— 原始载荷因此不会再走到派发器。
非规划器成员与畸形回执**什么都不做**（不改写、不写入）。

★ **K10 已修好并接线**（Lead 实测：`turn/reply-parsed` 现在真的发射）。★ 语义也已改：框架会把
`rewriteResult` **解码成【reply 对象】再 dispatch**（字符串按 JSON 解析；非 JSON 对象 ⇒ 具名
`VMU_TURN_BAD_JSON`）⇒ 本包三个钩子（planner／methods／verify）在返回 `rewriteResult` 时都只给 **JSON 对象文本**
（`{...}` / `{}`），绝不给裸字符串或数组。三个钩子都只做"落盘/消费 + 改写"，**绝不**在钩子里再开回合。

## 诚实边界 ✗

- 这**不是** v3，也**不是**行为等价证明。P0 只做"机制可用"；行为等价的 A/B 是另立项（与 P0-10 同一口径）。
- **没有新拒码**：数据面的拒绝复用已登记的内核码（`VMU_INVALID_ARGUMENT`／`VMU_STATE`／`VMU_NO_SUCH_OBJECT`／
  `VMU_ENGINE_UNAVAILABLE`）。新 `VMU_PACK_V3_*` 码须先登记进 `docs/03 §8.1`，而 `docs/**` 不在本卡写域 ⇒
  不造未登记码。
- **索引 5s 节流是常量**（`INDEX_THROTTLE_MS=5000`，v3 `:2039`），没有设置键：新增 `vmu.v3.*` 键必须先登记
  进 `settings/schema.js`（本卡写域不含该文件）⇒ `dataplane.status()` 自报 `throttleMs`，**不自称可配**。
- **规划器的四把键**（`vmu.v3.planningHorizon/plannerEnabled/planMinIntervalMs/plannerMaxFails`）**调用期**读取，
  默认值已在 `settings/schema.js` 登记；`plannerMaxFails` 用尽时本模块**自禁用**（`vmu.v3.plannerEnabled` 是
  office 拥有的 H1 键，pack 不写它），并在 `journal` 轨写一条具名记录。
- **`interrupt` 动作在本轮是具名失败**，不是静默跳过：`vmu.turn.interruptMember` 需要 host 权威
  `{kind:'ancestor',agent}` 或 `{kind:'user',parentSessionId}`，而 pack 模块没有 host 的 agent 句柄、也没有
  在飞子会话登记表（v3 的 `agentRegistry` 属装配层）。P0-10 接上 host 派发面后改成真的
  `interruptMember({ targetSessionId, authority })`。
- **`spawn` 出来的回合在 P0 里装配文本为空**：被派发角色的提示词内容属 P1-6（对账文档 E1/E3 的 solver/
  explorer 段），本轮证明的是**派发机制**（open→assemble→deliver→parse→dispatch）而不是那些角色的提示词。
- **`verify_candidates` 在规划器简报里仍为空**：P0-7 的候选面已经在 `verify.js` 的 `listCandidates()` 里，
  但把简报字段接上要改 `planner.js`（P0-2 的写域，本轮不动）⇒ 留作后续一轮的小接线，简报的 `notes` 仍如实点名。
- **验证闭环本轮只结算"命题"这一类**：v3 的 `settleVerdict` 还有 `prop-proof` 与 `problem-solution` 两个分支
  （`:4312-4365`），本卡只落命题分支（`候选＝可验证命题`）；另两类需要各自的对象卡语义，未做即未做。
- **人工门只接了"计划"与"裁决"两类**：`gates.js` 的第三类 `method-promote`（方法晋升到全局库）已有判定/台账
  能力，但 `methods.js` 的晋升目前仍是"auto 才晋升、否则具名 skipped"（P0-4 的实现），**没有**调 `evaluateGate`
  —— 把它接上是后续一小步（`vmu.v3.methodAutoPromote` 与人工门的取舍属机构策略）。
- **`flat` 只是纯函数里的 v3 字面回退**（`:4267`）：设置 `vmu.v3.verdictMode` 的域是 `forced｜natural`，
  没有设置值会选中 `flat`；它保留是为了与 v3 逐条对照和测试可断。
- **验证者回合的"话术"属 P1-6**：本模块用 `turn.run` 的 `statusBlock` 传契约（票放 `progress.votes`），
  不伪造验证者提示词；`keeper`/`verifier` 的提示段由提示词对账那一路上线。
- **多候选时一个 tick 会依次推进每个候选**（各自 ≤ `debateMaxRounds` 轮 × `required` 个回合）：
  本卡没有做"每 tick 只验一个"的预算，P0-10 若需要限流应在装配面/工具面加（不是在这里藏一个常量）。
- **手动放行的执行粒度**：计划门批准时按"整条计划"执行（计划在校验阶段已按 horizon 截断）；没有做
  "批准后每 tick 只执行 capacity 条"的分片（v3 的 executePlanQueue 是分片的）—— 这是有意的简化，`capacity`
  在执行器里取该计划的动作数。
- **本轮的 method-keeper 只有"机制"，没有"话术"**：keeper 回合的提示内容（v3 `:1905-1919` 的
  `methodKeeperPrompt`）属 P1-6 的提示词对账；本模块用 `turn.run` 的 `statusBlock` 传**摘要**
  （`buildMethodDigest`，v3 `:2844-2860` 的等价面），不给它伪造一段提示词。
- **全局级方法卡与项目级卡在同一根/同一轨**（用 tag 区分），因为 v3 的"全局库"是**另一个根**
  （`vibeRoot()/Methods/`），而本框架没有"全局根"这个接缝键；跨项目隔离是部署面的事，本卡不假装有。
- **耐久修订有两个诚实限制**：① 没有工作区根 ⇒ 不归档（具名 `skipped:'no-library-root'`）；
  ② `kernel/library.js` 只有"追加 + 冻结"、没有"原地改记录"的写面 ⇒ 每一版卡冻结成**一个新的库记录**
  的 `<库记录 id>@1.md`，而不是同一个 id 的 `@2`；`@<n>` 的单调性由 library 的 high-water mark 保证，
  测试里用同一内容连续冻结两次断到 `@1`/`@2`。
- 本轮没有 slots（v3 的 planner/solver/verifier）与 M1 规则 —— slots／P0-10 属后续卡。
