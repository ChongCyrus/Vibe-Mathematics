# 提示词 × 真回执 对照审计（task-114 / TB-2633）

> 语料：`D:/_tmp/sim/e2e/`（scenario end-to-end，startedAt `2026-11-09T04-46-11Z`，root `D:\_tmp\sim\ws-end-to-end--7bdcgq`）。
> 47 对 = 45 条真回执 + 紧接其后该席位装配的完整提示词；每一对都可回查（提示词侧 `prompts/<NN>-<seat>.txt:<line>`，回执侧 `receipts.jsonl:<line>`）。

## §1 方法与判读口径

成对语料的价值在于它把三个本来分开的东西对齐了：**回执**（内核这次到底给了什么）、**提示词**（模型这次到底被教了什么）、**动作**（这次调用本身）。单看任何一边都自洽，只有成对看才发现「教了但做不到」「给了但没教」「承诺了但没有」「同事实两个名字」。

判读口径（本轮固定，避免事后挪分类）：

- **A 教的动作回执不支持**：提示词把某个动作/结果当作可行或已收口，而回执显示它被拒绝、变了形或要看另一个读数才算数。
- **B 回执给的读数提示词没教**：回执里有这个键、值也有意义，但对应提示词从未解释它怎么读、拿它做什么。
- **C 提示词承诺与回执形状相反/缺失**：提示词写了「你会自己完成」「会带这个字段」，回执却是代做、缺字段或给另一个码。
- **D 同一事实两个名字/两种形状**：两边都对，但同一个概念在提示词与回执里叫法或结构不同，模型需要自己换算。
- **E 一致**：教的和给的对得上。

方法：47 对逐对读（每对只看与该回执工具/动作相关的 3–5 段提示词，不整篇读），证据用「提示词行号 + 回执行号」固定；机器可跑的部分落成 `tests/vmu-run257-prompt-receipt-parity.test.mjs`（真读语料，不含手写快照）。

## §2 覆盖表（47/47）

| # | 席位/相位 | 工具（动作） | 判读 | 提示词证据 | 回执证据 | 判定 |
|---:|---|---|---|---|---|---|
| 1 | chair/normal | `vibe_v5_start` | **E** | `prompts/01-chair.txt:53`（`vibe_v5_start`） | `receipts.jsonl:1`（seq 1，`hiredNow`） | 开所回执 hired/hiredNow/rosterBefore 与提示词「开所」段一致（started.already 另有含义，提示词已写明） |
| 2 | chair/normal | `vibe_v5_hire` | **E** | `prompts/01-chair.txt:27`（`vibe_v5_hire`） | `receipts.jsonl:2`（seq 2，`hired`） | hire 回执 roster/hiredNow 与提示词「用 vibe_v5_hire」一致 |
| 3 | chair/normal | `vibe_v5_record_proposition` | **E** | `prompts/01-chair.txt:20`（`vibe_v5_record_proposition`） | `receipts.jsonl:3`（seq 3，`proofState`） | proof_state 入参 / proofState 回执的别名对照提示词已明文写出 |
| 4 | chair/normal | `vibe_v5_blueprint propose` | **D** | `prompts/01-chair.txt:367`（`mdChangedSinceIndex`） | `receipts.jsonl:4`（seq 4，`mdWritten`） | 回执同屏给顶层 mdWritten:true 与嵌套 md.written:false（本次调用写没写 vs 文件在不在），提示词只说「md 是唯一真相」，没教两形 |
| 5 | chair/normal | `vibe_v5_blueprint propose` | **D** | `prompts/03-chair.txt:363`（`mdChangedSinceIndex`） | `receipts.jsonl:5`（seq 5，`formatSwitched`） | 同 P4 的两形，另加 formatSwitched:true（落盘形态被改写）无教学 |
| 6 | chair/normal | `vibe_v5_blueprint adopt` | **D** | `prompts/03-chair.txt:363`（`materialize:true`） | `receipts.jsonl:6`（seq 6，`mdOwner`） | adopt 回执 mdWrite.written:true + mdOwner.writtenBy:"kernel-materialized"，而提示词把 kernel-materialized 只挂在「显式 materialize:true」下 |
| 7 | chair/normal | `vibe_v5_blueprint read` | **E** | `prompts/03-chair.txt:363`（`mdChangedSinceIndex`） | `receipts.jsonl:7`（seq 7，`mdChangedSinceIndex`） | read 回执 mdChangedSinceIndex/md.written 与提示词 fs-first 段一致 |
| 8 | member/normal | `vibe_vmu_records list` | **A** | `prompts/04-member.txt:32`（`vibe_v5_read_library`） | `receipts.jsonl:8`（seq 8，`truncated`） | 读记录本真要 vibe_vmu_records list，但 12 份提示词 0 命中该工具名；成员只被教 read_library/inbox |
| 9 | member/normal | `vibe_v5_meeting` | **E** | `prompts/04-member.txt:2`（`vibe_v5_meeting`） | `receipts.jsonl:9`（seq 9，`notified`） | convene(at) 回执 notified:[r-1,r-2] 与提示词「预约=给被邀者下一回合的通知块」一致（notifyRows 未教，见 B 注） |
| 10 | member/normal | `vibe_v5_meeting` | **B** | `prompts/07-member.txt:3`（`vibe_v5_meeting`） | `receipts.jsonl:9`（seq 9，`notifyRows`） | 被预约者提示词首行出现会议预约块，但 notifyRows/notifyFailed/noticesMeans 读数无教学 |
| 11 | member/meeting | `vibe_vmu_meeting attend` | **E** | `prompts/05-member.txt:361`（`waitingFor`） | `receipts.jsonl:10`（seq 10，`waitingFor`） | attend 回执 waitingFor/lateAdmission 与提示词「到点不自开、等 quorum/chair-proceed」一致 |
| 12 | member/meeting | `vibe_vmu_meeting attend` | **E** | `prompts/05-member.txt:361`（`waitingFor`） | `receipts.jsonl:11`（seq 11，`lateAdmission`） | 同 P11（第二个迟到者 lateAdmission 口径一致） |
| 13 | member/meeting | `vibe_vmu_meeting status` | **B** | `prompts/05-member.txt:295`（`vibe_vmu_meeting`） | `receipts.jsonl:12`（seq 12，`speechUsed`） | status 板几十个读数（speechUsed/speechExtendMs/waiters/eligible…）提示词未教怎么用 |
| 14 | chair/meeting | `vibe_v5_say` | **C** | `prompts/01-chair.txt:23`（`vibe_v5_say`） | `receipts.jsonl:13`（seq 13，`memberActed`） | 提示词说「发言只能你自己在本回合做完，别请所办代办」，回执却是所办代 r-1 发言：memberActed:true（动作记在 r-1 名下）+actedForMember:"r-1"+via:"meeting"——做的人不是 r-1，承诺与现行形状相反 |
| 15 | chair/meeting | `vibe_v5_say` | **C** | `prompts/01-chair.txt:23`（`vibe_v5_say`） | `receipts.jsonl:14`（seq 14，`actedForMember`） | 同 P14（代 r-2 发言；memberActed:true + actedForMember:"r-2" + via:"meeting"） |
| 16 | chair/meeting | `vibe_v5_motion` | **E** | `prompts/06-chair.txt:42`（`vibe_v5_motion`） | `receipts.jsonl:15`（seq 15，`motion`） | motion 回执与提示词会议动议段一致 |
| 17 | chair/meeting | `vibe_v5_second` | **E** | `prompts/01-chair.txt:42`（`vibe_v5_second`） | `receipts.jsonl:16`（seq 16，`seconded`） | second 回执与提示词附议段一致 |
| 18 | chair/meeting | `vibe_vmu_vote` | **D** | `prompts/06-chair.txt:11`（`vote_solved`） | `receipts.jsonl:17`（seq 17，`closureVote`） | 提示词教「用回执字段 vote_solved 表达结题判定」，回执里同名事实长成 closureVote{cast,votesCast,votesFor…}；且真工具 vibe_vmu_vote 12 份提示词 0 命中 |
| 19 | chair/meeting | `vibe_vmu_vote` | **D** | `prompts/01-chair.txt:11`（`vote_solved`） | `receipts.jsonl:18`（seq 18，`closureVote`） | 同 P18（r-1 票） |
| 20 | chair/meeting | `vibe_vmu_vote` | **D** | `prompts/01-chair.txt:11`（`vote_solved`） | `receipts.jsonl:19`（seq 19，`closureVote`） | 同 P18（r-2 票） |
| 21 | member/normal | `vibe_vmu_meeting status` | **B** | `prompts/07-member.txt:384`（`vibe_vmu_meeting`） | `receipts.jsonl:20`（seq 20，`waiters`） | status 回执的 waiters/eligible/floor 等读数提示词未教 |
| 22 | member/normal | `vibe_v5_verdict_ask` | **A** | `prompts/08-member.txt:3`（`verdict`） | `receipts.jsonl:21`（seq 21，`verdict_ask`） | member 调 vibe_v5_verdict_ask，但 07/08 两份 member 提示词 0 命中 verdict_ask（chair 提示词各有 3–4 处） |
| 23 | member/normal | `vibe_v5_verdict_ask` | **A** | `prompts/07-member.txt:2`（`verdict`） | `receipts.jsonl:21`（seq 21，`verdict_ask`） | 同 P22（07-member） |
| 24 | member/normal | `vibe_v5_verdict` | **E** | `prompts/08-member.txt:3`（`vibe_v5_verdict`） | `receipts.jsonl:22`（seq 22，`submission`） | verdict 回执与提示词打分段一致 |
| 25 | member/normal | `vibe_v5_verdict` | **E** | `prompts/08-member.txt:3`（`vibe_v5_verdict`） | `receipts.jsonl:23`（seq 23，`readBack`） | 同 P24（第二票） |
| 26 | member/normal | `vibe_v5_verdict_final` | **C** | `prompts/08-member.txt:0`（`vibe_v5_verdict_final`） | `receipts.jsonl:24`（seq 24，`VMU_MEETING_QUORUM_LOST`） | member 08 提示词 0 命中 verdict_final 与 VMU_MEETING_QUORUM_LOST（chair 才有），回执却把该码交给 member 读 |
| 27 | chair/normal | `vibe_vmu_meeting close` | **E** | `prompts/09-chair.txt:42`（`vibe_vmu_meeting`） | `receipts.jsonl:25`（seq 25，`closed`） | close 回执与提示词结会段一致 |
| 28 | chair/normal | `vibe_v5_record_progress` | **E** | `prompts/09-chair.txt:22`（`vibe_v5_record_progress`） | `receipts.jsonl:26`（seq 26，`recordId`） | record_progress 回执与提示词记账段一致 |
| 29 | chair/normal | `vibe_v5_record_method` | **E** | `prompts/09-chair.txt:24`（`vibe_v5_record_method`） | `receipts.jsonl:27`（seq 27，`recordId`） | record_method 回执与提示词记账段一致 |
| 30 | chair/normal | `vibe_v5_read_library` | **B** | `prompts/09-chair.txt:38`（`vibe_v5_read_library`） | `receipts.jsonl:28`（seq 28，`panelPointer`） | read_library 回执 entries/truncated 可读，但提示词没教怎么用这两读数 |
| 31 | chair/normal | `vibe_vmu_records list` | **A** | `prompts/09-chair.txt:38`（`vibe_v5_read_library`） | `receipts.jsonl:29`（seq 29，`records`） | 同 P8（chair 侧也直接调 vibe_vmu_records） |
| 32 | member/normal | `vibe_v5_paper start` | **E** | `prompts/10-member.txt:47`（`vibe_v5_paper`） | `receipts.jsonl:30`（seq 30，`started`） | paper start 回执与提示词论文生命周期一致 |
| 33 | member/normal | `vibe_vmu_records list` | **A** | `prompts/10-member.txt:34`（`vibe_v5_read_library`） | `receipts.jsonl:31`（seq 31，`records`） | 同 P8（member 读记录本） |
| 34 | member/normal | `vibe_v5_paper part` | **B** | `prompts/10-member.txt:47`（`vibe_v5_paper`） | `receipts.jsonl:32`（seq 32，`requiredLines`） | part 回执给 requiredLines/evidenceGate（还缺什么行/证据闸），提示词没教怎么读 |
| 35 | member/normal | `vibe_v5_paper part` | **B** | `prompts/10-member.txt:47`（`vibe_v5_paper`） | `receipts.jsonl:33`（seq 33，`evidenceGate`） | 同 P34（proof 部分） |
| 36 | member/normal | `vibe_v5_paper advance` | **E** | `prompts/04-member.txt:45`（`vibe_v5_paper`） | `receipts.jsonl:34`（seq 34，`advance`） | advance 回执与提示词推进段一致 |
| 37 | member/normal | `vibe_v5_paper review` | **E** | `prompts/10-member.txt:47`（`vibe_v5_paper`） | `receipts.jsonl:35`（seq 35，`deliverable`） | review 回执 deliverable 与提示词互审段一致 |
| 38 | member/normal | `vibe_v5_paper review` | **E** | `prompts/10-member.txt:47`（`vibe_v5_paper`） | `receipts.jsonl:36`（seq 36，`review`） | 同 P37（第二份评审） |
| 39 | member/normal | `vibe_v5_paper advance` | **E** | `prompts/04-member.txt:45`（`vibe_v5_paper`） | `receipts.jsonl:37`（seq 37，`advance`） | 同 P36（评审后推进） |
| 40 | chair/normal | `vibe_v5_paper final` | **A** | `prompts/12-chair.txt:63`（`vibe_v5_paper`） | `receipts.jsonl:38`（seq 38，`VMU_OFFICE_CONSULT_REQUIRED`） | 提示词把 final 当结题动作，回执拒绝并要求先 consult（hint 才第一次出现 action:"consult"），全部提示词 0 命中 consult |
| 41 | chair/normal | `vibe_v5_paper consult_state` | **A** | `prompts/12-chair.txt:63`（`vibe_v5_paper`） | `receipts.jsonl:39`（seq 39，`consult`） | consult_state 被真调用，但「consult」这个动作在 12 份提示词 0 命中 |
| 42 | chair/normal | `vibe_v5_paper consult` | **A** | `prompts/12-chair.txt:63`（`vibe_v5_paper`） | `receipts.jsonl:40`（seq 40，`consult`） | 同 P41（真正 consult 提交） |
| 43 | chair/normal | `vibe_v5_paper final` | **A** | `prompts/12-chair.txt:63`（`vibe_v5_paper`） | `receipts.jsonl:41`（seq 41，`toolchainAbsent`） | final 回执 ok:true 同时 toolchainAbsent:["latex"]、missing:["pdf"]；提示词教「final=chair 接受即收口」，未教缺 pdf/缺工具链时怎么读 |
| 44 | chair/normal | `vibe_v5_paper compile` | **A** | `prompts/12-chair.txt:63`（`vibe_v5_paper`） | `receipts.jsonl:42`（seq 42，`VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING`） | compile 被真调用直接报「无宿主 spawn 接缝」，compile 在 12 份提示词 0 命中 |
| 45 | chair/normal | `vibe_v5_paper render` | **A** | `prompts/12-chair.txt:63`（`vibe_v5_paper`） | `receipts.jsonl:43`（seq 43，`renderOk`） | 提示词承诺 render 产出；回执 ok:true 但 renderOk:false（toolchain 缺），另有 wrote/wroteDeprecated/wroteWhere 三形 |
| 46 | chair/normal | `vibe_v5_paper status` | **B** | `prompts/12-chair.txt:63`（`vibe_v5_paper`） | `receipts.jsonl:44`（seq 44，`reachableMoves`） | status 回执给 reachableMoves/editorReading/archiveArtifacts，提示词未教怎么用 |
| 47 | chair/normal | `vibe_vmu_records list` | **A** | `prompts/12-chair.txt:38`（`vibe_v5_read_library`） | `receipts.jsonl:45`（seq 45，`records`） | 同 P8（chair 读记录本） |

## §3 五类统计

| 类 | 条数 | 占比 |
|---|---:|---:|
| A | 12 | 25.5% |
| B | 7 | 14.9% |
| C | 3 | 6.4% |
| D | 6 | 12.8% |
| E | 19 | 40.4% |
| **合计** | **47** | 100% |

**A 类条数 = 12**，分两簇：

- **A1 能力闸门（4 对：P40/P43/P44/P45）**——提示词把动作当可行/已收口，回执说这里有它没告诉你的闸门。这是本轮「提示词承诺 vs 回执能力」的核心差值。
- **A2 工具面未教（8 对：P8/P22/P23/P31/P33/P41/P42/P47）**——动作确实做了且回执 ok，但完成它的工具名在 12 份提示词里 0 命中（`vibe_vmu_records`、`vibe_vmu_vote`、`consult`、member 侧 `verdict_ask`）。模型读回执能看懂结果，却无法从提示词学会自己发起。

## §4 A 类逐条

### A1 能力闸门

1. **P40 `vibe_v5_paper {action:"final"}` → `VMU_OFFICE_CONSULT_REQUIRED`**：提示词把 final 写成结题动作；回执拒绝，hint 才第一次出现 `vibe_v5_paper { action:"consult", target, member, answer }`。`consult` 在 12 份提示词里 0 命中（P41/P42 走的就是这条未教的路）。
2. **P43 final ok:true 但 `toolchainAbsent:["latex"]`、`missing:["pdf"]`**：提示词教「final=chair 接受即收口」，未教「ok:true 同时可能缺产物/缺工具链」这个读法。
3. **P44 `compile` → `VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING`**：回执指明「需要宿主 spawn 接缝，kernel/index.js 只在 spawn/spawnHandle 存在时创建 kernel.latex」，而 compile 在提示词里 0 命中——模型会把它当普通动作调用。
4. **P45 `render` ok:true 但 `renderOk:false`**：提示词承诺 render 产出；回执的「工具成功」与「产物成功」是两层，且产物层失败没在提示词里出现。

### A2 工具面未教

1. **`vibe_vmu_records list`（P8/P31/P33/P47）**：读记录本索引的真工具，12 份提示词 0 命中；提示词只教 `vibe_v5_read_library`/`vibe_v5_overview`/`vibe_v5_inbox`。
2. **member 侧 `verdict_ask`（P22/P23）**：chair 提示词各 3–4 处，07/08 两份 member 提示词 0 命中。
3. **`consult`（P41/P42）**：动作在 12 份提示词 0 命中，只有失败回执的 hint 提它。
4. 附：`vibe_vmu_vote` 同样是 0 命中的真工具（P18–P20），但该三对的主判读是「同一事实两名」（vote_solved vs closureVote），记在 D 类，工具缺口计入 §10 建议。

## §5 B 类逐条

1. **`memberActed` / `callerIsSeat` / `ranInOwnTurn` / `actedForMember`**：30+ 对回执都有，12 份提示词 0 命中。模型能读到「这一动作是谁做的」，但没人教它这组读数在代做/自做时怎么变。
2. **`notifyRows` / `notifyFailed` / `noticesMeans`**（P9/P10）：预约与投递结果只在回执里；提示词只教了「被预约者下一回合会看到通知块」，没教投递失败长什么样。
3. **会议 status 板**（P13/P21）：`speechUsed` / `speechExtendMs` / `waiters` / `eligible` 等几十个读数无教学。
4. **paper 读数**（P34/P35/P46）：`requiredLines`（还缺哪几行）、`evidenceGate`（证据闸）、`reachableMoves`（下一步可做的合法动作）、`editorReading`、`archiveArtifacts` 均无教学——而这些正是「下一步做什么」的唯一机器答案。

## §6 C 类逐条

1. **P14/P15 代发**：提示词写「发言只能你自己在本回合做完，别请所办代办」；回执却是所办代 r-1/r-2 发言：`memberActed:true`（动作记在被代者名下）、`actedForMember:"r-1"`、`via:"meeting"`。这是「承诺的形状」与「现行机制形状」相反——动作算在成员账上，但做的人不是成员。
2. **P26 verdict_final 的 quorum 码**：member 08 提示词 0 命中 `verdict_final` 与 `VMU_MEETING_QUORUM_LOST`（只有 chair 提示词有 quorum 段），回执却把该码交给 member 读。

## §7 D 类逐条

1. **`mdWritten` vs `md.written`**（P4/P5/P6/P7）：同一屏里顶层 `mdWritten:true`（本次调用写了）与嵌套 `md.written:false`（文件此刻在不在）并存；还有 `writtenBy` 与 `mdOwner.writtenBy` 两级。提示词只说「md 是唯一真相」，未教两形两义。
2. **`vote_solved` vs `closureVote`**（P18–P20）：提示词教回执字段 `vote_solved` 表达判定；回执里同名事实是 `closureVote{cast,votesCast,votesFor,…}`。且真工具 `vibe_vmu_vote` 12 份提示词 0 命中。
3. **`wrote` / `wroteDeprecated` / `wroteWhere`**（P45）：一个事实三种字面，提示词未提。
4. 已知有明文对照、归 E 的两组：`proof_state`（入参）vs `proofState`（回执）、`truncated` vs `replyTruncated`（旧称）——提示词已写明，不再记缺陷。

## §8 E 类与逐条豁免

E 类 19 对，覆盖开所/雇佣/蓝图 propose-read/会议 convene-attend-motion-second/verdict/close/记账/论文主链。

显式豁免（看过但不记缺陷）：

- P9/P10 预约语义本身一致：快照首行就是 `[新到的消息]` + 会议预约行 + `mailbox ack <id>`（ASCII 方括号；用全角括号 grep 会得到假阴性，这是本轮踩过的坑）。
- P14/P15 的「所办代发」是端到端夹具的调用方式，不是产品缺陷；记的是「提示词承诺与夹具形状相反」，归 C 不归产品转出。
- 回执 `ok:true` 但内层读数说「没做成」（P43/P45）不是「回执撒谎」，是两层语义；只记提示词未教，不记回执缺陷。

## §9 转出（产品缺陷，只记录不修）

1. **member 提示词缺 verdict_final/quorum 规则**：`v5r` member 侧不装配 verdict_final 教学与 `VMU_MEETING_QUORUM_LOST`（chair 侧有）。产品面：同一条规则对两个席位不对称，且不对称没有在回执里说明。
2. **`vibe_vmu_records`、`vibe_vmu_vote` 不在任何提示词**，但回执显示它们是真实且必要的读/投票工具——工具面与提示词面存在缺口。
3. **paper 的 `consult`/`compile`/`renderOk` 三段**：动作与读数已存在（P40–P45 真回执），提示词 0 命中；`final` 允许 `ok:true` 同时 `missing:["pdf"]`，建议产品在收口回执里给一个显式「未齐」布尔，别让调用方自己从 `missing` 推。
4. **两形读数**（`mdWritten`/`md.written`、`wrote`/`wroteDeprecated`）：建议下一版统一或至少在回执里带 `means` 指向（现在 P4/P45 只有值没有 means）。

## §10 给 TB-2615（轮 C/D 提示词）的输入

按「一句能改一个行为」排序，≤10 条：

1. member 提示词补 vibe_v5_verdict_ask / vibe_v5_verdict_final 两条工具路径与 VMU_MEETING_QUORUM_LOST 码（P22/P23/P26：member 收不到、chair 才能看到的规则）。
2. 教 vibe_vmu_records list 与 vibe_v5_read_library 的分工（P8/P31/P33/P47：读记录本索引的唯一可用工具，12 份提示词 0 命中）。
3. 教 vibe_vmu_vote（P18–P20：判定票真工具）并写清它与 vote_solved 回执字段的关系。
4. 教 paper 的 consult 通道（P40–P42：VMU_OFFICE_CONSULT_REQUIRED 之后必须先 consult 再 final）。
5. 教 compile/render 的宿主依赖与 renderOk/toolchainAbsent/missing 读法（P43–P45：ok:true 不等于产物齐）。
6. 教 memberActed / callerIsSeat / ranInOwnTurn / actedForMember 四个读数（30+ 对回执都有，全部提示词 0 命中）。
7. 教 notifyRows / notifyFailed / noticesMeans（P9/P10：预约与投递结果只有回执里有）。
8. 教会议 status 板与 paper status 的「下一步」读数：waitingFor/waiters/reachableMoves/requiredLines/evidenceGate。
9. 写清 mdWritten（本次调用写没写）与 md.written（文件在不在）是两形两义；wrote / wroteDeprecated / wroteWhere 同理。
10. 写清「代发」语义：memberActed:false + actedForMember 时，谁署名、谁负责（P14/P15 与提示词「别请所办代办」相反的现行形状）。

## §11 机器判据

`node tests/vmu-run257-prompt-receipt-parity.test.mjs`（≥20 条断言，真读 `pairs.jsonl` / `receipts.jsonl` / `prompts/*.txt`）：

- 结构：47 对、pairIndex 连续、45 条回执、`nextPrompt.text` 与 `prompts/*.txt` 12 份文件逐字相等；
- 覆盖：每对工具/动作在回执里可解析、每对都在本表出现且行号可回查（提示词行必须真含该 token，回执行必须真含该 seq/tool）；
- 缺口：`vibe_vmu_records`/`vibe_vmu_vote` 全 12 份提示词 0 命中，`consult`/`compile` 动作 0 命中，三个未登记码（`VMU_MEETING_QUORUM_LOST` 在 08、`VMU_OFFICE_CONSULT_REQUIRED`、`VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING`）0 命中——每一处都是本表 A/C 行的证据；
- 反例守卫：P40/P43/P44/P45 的结构化判读（码、`missing`、`renderOk`）必须能从回执复算出来；P14/P15 必须能读到 `memberActed:true`+`actedForMember`+且 `callerIsSeat:false`；P26 必须能在 08 提示词里查不到该码；
- 通知块：被 `notified` 的席位下一提示词首行必须是 `[新到的消息]`（ASCII），且预约行带 `op:"attend"`。

## §12 边界

- 语料是 end-to-end 仿真（0 token），不是真机；它证明「提示词/回执对不上」，不证明真模型会怎么误解。
- 本表只覆盖 47 对里出现的工具与读数；12 份 prompt 文件里 02-temp/09-chair/11-chair 三份没有被任何一对引用（夹具时间线的轮次没落到它们），未出现的工具（如 office 面其它动作）也不在本轮证据内。
- 产品缺陷只记录，未改产品代码；修复归对应车道与任务书。

## §13 已转出并处理（RUN 258 / TB-2638）

§9 第 3 条（paper 面 consult/compile/renderOk 三段）与 §4 A1 四条已由本任务处理。四条决定都是**改提示词 + 补回执命名**，不补能力（能力都在：`consult`/`consult_state` 存在，`status` 读 `toolchainAbsent`，`final` 无 PDF 也能收口，`vibe_vmu_env` 可探）；判据：没有放宽 `final` 的 consult 闸门，也没有把任何 `ok:true` 改成 `false`。

| 缺口 | 决定 | 落点 |
| --- | --- | --- |
| P40 `final` → `VMU_OFFICE_CONSULT_REQUIRED`，提示词 0 处教 consult | 改提示词：教问询门（读 `consult_state` 取 `awaiting.id`，所办答复后重试 `final`；不得设 off 绕过） | `vibe-math-vmu/packs/v5r/prompts/v5r-core.js:608`（chair）、`:647`（member）；`vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js:601`（paper-final 阶段块） |
| P43 `final` `ok:true` 但 `missing:["pdf"]`，`ok` 被读成完成 | 补回执命名：`okMeans`（ok = 请求被接受）、`complete`/`completeMeans`、`unfinished`、`reachableInstead`（status / env probe / 无引擎也能收口） | `vibe-math-vmu/packs/v5r/tools.js:6285`（`PAPER_OK_MEANS`）、`:6825-6829`（final 回执） |
| P44 `compile` → `VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING`，hint 只有宿主接缝 | 补能力侧最小改动：pack 在 `REACHABLE INSTEAD:` 后追加可执行替代（status 读 toolchainAbsent、env probe `need:"latex"`、无引擎也能 final） | `vibe-math-vmu/packs/v5r/tools.js:6991`；kit 原文 `vibe-math-vmu/kit/paper.js:1809-1830`（不改 kit 语义，只由 pack 追加） |
| P45 `render` `ok:true` 但 `renderOk:false` | 补回执命名：`okMeans` + `renderOkMeans`（renderOk = 归档行齐，不是「.tex 失败」）+ `complete` 与 `renderOk` 同值 BY CONSTRUCTION | `vibe-math-vmu/packs/v5r/tools.js:6926-6932`（render 回执） |

**快照口径（写死，防陈述滞后）**：本表 §3/§4/§11 量的是 **RUN 255 构建的快照语料** `D:/_tmp/sim/e2e`（生成时间 2026-11-09T04:46Z = 2026-11-09 12:46 +08:00，48 steps / 47 pairs / 45 receipts / 12 prompts）。**本表的 A1/A2 计数是快照读数**：A1 = `[40,43,44,45]`（4 对）、A2 = `[8,22,23,31,33,41,42,47]`（8 对）。**当前代码的 A1/A2 读数见 `D:/_tmp/sim/e2e-258` 复算：A1 = `[]`（0 对）、A2 = `[8,22,23,31,33,47]`（6 对）**——两个数都保留：快照读数描述本表证据，当前读数描述代码现状，二者不互相替代。快照迁移（重做快照 + 把 §4/§11 的行号与集合换到新语料）由 Lead 在真机第 75 次跑完后另立任务（TB-2648）执行；在那之前 §4/§11 不改。

语料复算（`node scripts/sim/run.mjs --scenario end-to-end --out D:/_tmp/sim/e2e-258`，exit 0；对照 §11 的 `VMU_PROMPT_RECEIPT_CORPUS` 机制）：

- 前（`D:/_tmp/sim/e2e`，RUN 255 快照）：A1 = `[40,43,44,45]`（4 对），A2 = `[8,22,23,31,33,41,42,47]`（8 对）。
- 后（`D:/_tmp/sim/e2e-258`）：A1 = `[]`（0 对，`S5a` 重算为空），A2 = `[8,22,23,31,33,47]`（6 对，`S4d` 实测）；12 份提示词里 `consult_state` 由 0 命中升到 11 份，`consult`/`compile`/`renderOk`/`toolchainAbsent` 在 `01-chair.txt` 均 ≥1 命中。
- 说明：§4 的行号引用仍指向 RUN 255 快照语料（§11 的判据默认读它）；重生成语料后行号会平移。**快照迁移（重做快照 + 换行号与 A1/A2 集合）由 Lead 在真机第 75 次跑完后另立任务（TB-2648）执行**；本任务不擅自改 §4/§11，也不把快照判据改成量当前语料。
- 角色段预算：教学句落在角色工具段，`tests/vmu-run247-prompt-dedup.test.mjs` 的段上限（chair ≤3600 / member ≤2100 / temp ≤1300）未上调，靠去掉与 blocks-b 重复的冗余句腾位（chair 3594、member 1998、temp 约 1000）；`node scripts/audit-prompt-budget.mjs --check` PASS。
- 回执侧判据：`tests/vmu-run257-paper-promise.test.mjs`（196 断言，真内核复算；改前在副本里改名/删标记 ⇒ 89/17 红），`tests/vmu-run257-refusal-hints.test.mjs` 41/0（含 D-2 五码的 `REACHABLE INSTEAD:` 标记与工具面真名）。

## §14 RUN 260 / TB-2664 —— A2 剩余 6 对的逐条判定（判定表 + 判据提案，待 lead 裁定）

### 14.1 触发与口径

TB-2638 把 `consult` 两条教进提示词后，A2 从 8 对降到 **6 对**（`tests/vmu-run257-prompt-receipt-parity.test.mjs` §S4d，在 RUN 258 校准语料 `D:/_tmp/sim/corpus-end-to-end` 上实测）：`8,22,23,31,33,47`。lead m06848 要求逐条判死（`TAUGHT` / `SELF-EVIDENT` / `NOT-FOR-THIS-SEAT` / `DROP`），并给了退路：若 ≥3 对实质是「不必教」，就写成「A2 判据过严」交提案，**自己不许放宽判据**。

判定依据同一条：A2 问的是「回执里的读数，下一份提示词有没有教」。这条口径隐含一个假设——**回执的读者就是发起该动作的席位**。下面 6 对里有 6 对不满足这个假设，这就是本轮的结论。

### 14.2 逐条判定表

编号即语料里的 `pairIndex`；`actor` 取自语料 `caller`（本次 6 对全为 `null`，见 14.5），`next seat` 取自 `nextPrompt.seat`。

| pair | 工具与实参 | actor → next seat | 判定 | 证据（可复核） |
| --- | --- | --- | --- | --- |
| P8 | `vibe_vmu_records {action:"list", limit:0}` | `null` → member (r-1) | `SELF-EVIDENT` | 回执自带 `identity.means` 的记账恒等式 + 每个筛选维度的 `*Means`；见 14.3 |
| P31 | 同上 | `null` → chair (r-acad) | `SELF-EVIDENT` | 同上（同一实现、同一回执形状） |
| P33 | 同上 | `null` → member (r-1) | `SELF-EVIDENT` | 同上 |
| P47 | 同上 | `null` → chair (r-acad) | `SELF-EVIDENT` | 同上 |
| P22 | `vibe_v5_verdict_ask {meeting:"m1", proposition_id:"rec-1"}` | `null` → member (r-1) | `NOT-FOR-THIS-SEAT` | 该动作**只有主席能做**（非主席 ⇒ `VMU_NOT_PERMITTED`，`packs/v5r/tools.js:3960-3963`）；发起者是主席（`scripts/sim/scenarios/end-to-end.mjs:602-610`，`as: roster[0]`），而下一份提示词是 `capture({seat:"member", member:roster[2]})` |
| P23 | 同上 | `null` → member (r-2) | `NOT-FOR-THIS-SEAT` | 同上 |

6/6 判「不必教」⇒ 触发 lead 给的退路：A2 的口径需要改，而不是提示词需要加字（见 14.6）。

### 14.3 records 4 对为什么是 `SELF-EVIDENT`

判定不靠「我认为够清楚」，靠回执自己说了什么。实测（RUN 258 校准语料的 P8 回执，`D:/_tmp/a2/probe-means.mjs`）：

- 顶层 **15 个读数**里 **9 个**在同一条回执里有同名伴读：`rowsFromMeans`、`excludedMeans`、`includeUntrackedMeans`、`byFilterMeans`、`trackFilterMeans`、`libraryHeadsMeans`、`kindFilterMeans`、`truncatedByMeans`、`limitMeans`；
- 剩下的 6 个不需要单独伴读：`total`/`returned` 就是计数本身；`totalUniverse`/`mutedDropped` 由 `identity.means` 的恒等式解释（原文：`page + pageDropped + excluded(shapeMismatch + untracked) + mutedDropped === totalUniverse; noWriter/timeUnknown are SUBSETS of shapeMismatch - the three lists are NOT a partition, never add them up as if they were`）；`limitUsed` 由 `limitMeans` 解释（`this call asked for EVERY row (limit:0): no page cap was applied`）；`libraryExcludedBy`/`sinceFilter`/`untilFilter` 本次为 `null`，由 `timeFilterMeans`（`no time window was given: rows of every age are counted`）与 `libraryExcludedMeans` 覆盖；
- `excluded` 里还带 `untrackedScopeMeans`，把「这次是 inventory 还是 query 页」的两种排除路径讲清。

也就是说：**读者拿到这条回执，就能读懂每个读数**；把同一批字段名再抄进提示词，只会得到 RUN 247 刚删掉的那种「工具目录式字段清单」。另外，这 4 对里 `vibe_vmu_records` 在 12 份提示词中**出现 0 次**（这正是 §S4a `genericToolGap = vibe_vmu_records,vibe_vmu_vote` 已经单独记录的事），A2 再按 pair 数一遍，等于同一缺陷记两次。

### 14.4 verdict_ask 2 对为什么是 `NOT-FOR-THIS-SEAT`

两条机制证据，缺一不可：

1. **谁能做**：`packs/v5r/tools.js:3960-3963`，非主席调用 ⇒ `VMU_NOT_PERMITTED`（「only the meeting CHAIR asks for the final rulings」）；spec 描述同样写 `the CHAIR asks`（`tools.js:7463`）。
2. **谁做了 / 谁的提示词是下一份**：`scripts/sim/scenarios/end-to-end.mjs:602-610`——`vibe_v5_verdict_ask` 以 `as: roster[0] || 'r-acad'`（主席）发起，紧接着 `capture({ seat: 'member', member: roster[2] || 'r-2', ... })` 抓的是**成员的回合**。A2 于是拿「主席动作的回执」去问「成员的提示词有没有教」，结构上不可能教对。

补充事实（不改变判定，但说明不是「完全没人教」）：`verdict_ask` 在 5 份 chair 提示词里各出现 3–4 次（`01-chair.txt`、`03/06/09/11-chair.txt`），`05-member.txt:307` 还提到它是内核 hint 给出的下一步——**主席面是教了的**。而且 `vibe_v5_verdict_ask` 是**工具名**，不是回执字段；member 回执契约里本来就不该出现它。

### 14.5 共同的结构缺陷：A2 把「回执的读者」当成「调用者」

- 6 对的 `caller` **全是 `null`**（语料 `pairs.jsonl`）；records 那 4 次是场景的**桥接读**（`end-to-end.mjs:466-481` 的 P8 注释原文：`The ledger read is a BRIDGE, not decoration ... so the chair can be shown to have LOOKED UP the number`；`:715-724` P31；`:884-890` P47），根本没有席位在做这个调用——`caller:null` 是 sim 不记 caller，不是「无人调用」，但它足以让 A2 的「这个席位的提示词该教这个读数」失去主语。
- 剩下 2 对的调用者是主席，下一份提示词却是成员。
- 所以 6 对的失败与「提示词遗漏」不是同一类事实；把它们计入 A2，会持续逼后来的车道往提示词里塞字段目录。

### 14.6 提案（交 lead 裁定；我不改判据）

按「改判据是队长的活」的约定，这里只给可选项与各自会把数变成什么（以 RUN 258 校准语料为准）：

| 提案 | 规则 | 当前 6 对的预期结果 |
| --- | --- | --- |
| P1 席位错配不计 | A2 只计 `caller != null` **且** `caller` 的席位等于 `nextPrompt.seat` 的 pair；其余进 `seatMismatch` 名单（照报，不计入 A2） | `A2=[]`；6 对全部进 `seatMismatch`（caller 全 null） |
| P2 工具面缺陷不重复计 | 若 `tool` 已进 §S4a `genericToolGap`（12 份提示词 0 次），其 pair 不再逐对计入 A2 | `A2=[22,23]`（records 4 对移出） |
| P3 自述即算教过 | 若某读数在同条回执有同名 `*Means`/`*Source`，或有覆盖它的 `identity.means`/`accounting.means` 恒等式，则不算 gap | `A2=[]`（records 4 对全覆盖；verdict_ask 也基本覆盖） |
| P1+P2 | 两条同取 | `A2=[]` |

我的建议是 **P1+P2**：P1 修的是口径的主语（谁该教），P2 修的是重复计数；两者都不隐藏缺陷——`S4a` 仍然把 `vibe_vmu_records`/`vibe_vmu_vote` 的「工具面未教」照报，`S4d` 若发现真正的「席位自己的动作、自己的提示词没教」，仍然会红。P3 不建议单独采用（它把判据从「提示词有没有教」改成「回执自不自我解释」，是另一种问题，宜另立 S4e）。

**本小节不实施任何提案**；实施与否则由 lead 裁定后另开改动。

### 14.7 本轮边界

- 未改任何提示词、未改 `scripts/sim/**`、未改 `kernel/**`、未改 `packs/v5r/tools.js`；本文只记录判定与提案。
- 本轮没有 `TAUGHT` 判定，因此没有「删掉新增句 ⇒ 用例红」的实测；若 lead 裁定其中某对改为 `TAUGHT`，那条反关灯实测在实施时补。
- 预算/装配不受影响：三份 normal 与 chair/meeting 读数与上一轮一致（本轮 0 字符进入提示词）。

### 14.8 裁定落地：口径 P1+P2（RUN 260，lead 裁定）

lead 接受 P1+P2，并把口径写死为：

> **A2 = 「caller 存在、且 caller 席位 === `nextPrompt.seat` 的 pair 中，回执读数在装配后提示词里 0 命中」的集合。**

实现落在 `tests/vmu-run257-prompt-receipt-parity.test.mjs`（§S4e/S4f）。**RUN 260 二审（lead m07103）要求「两个问题各有一个数」**，于是同一段输出四个具名计数器（`console.log` 原文可在套件输出里看到）：

- `a2: []` —— **只答 pair 级问题**：caller 存在、caller 席位 === `nextPrompt.seat`、且回执读数在该席位提示词里 0 命中；
- `toolGapPairs: [{pair:8,tool:"vibe_vmu_records"},{pair:31,…},{pair:33,…},{pair:47,…}]` —— 因**工具整体未被教**而从 `a2` 排除的 pair，**逐条列 id + tool**（不是只报计数）；
- `noCaller: [{pair:22,tool:"vibe_v5_verdict_ask",why:"bridge-read"},{pair:23,…},{pair:41,tool:"vibe_v5_paper",…},{pair:42,…}]` —— 快照语料还没有 caller 的剩余部分，逐条点名；
- `seatMismatch: []` —— 已知 caller 但席位不符（快照 0 条）；
- `toolLevelGaps: ["vibe_vmu_records","vibe_vmu_vote"]` —— **每个工具一条**，去重。

**守恒等式（防「数字变小了但没人知道去哪了」）**：`S4e8` 断言 `a2 + toolGapPairs + noCaller + seatMismatch === wouldBeGap` 的总数（8）；`S4e9` 进一步断言四个桶的 id 并集**逐字等于** `S4d` 的快照集合（既不丢也不重复计入）；`S4e10` 保留 m07103 的两项式读法（`a2 + toolGapPairs === 总数 − noCaller − seatMismatch`，余项具名）。

**「守恒等式会红」的实测（一次性破坏，随后恢复）**：在套件里临时插入 `counted.pop()` 让一条 pair 从记账中消失 ⇒ **110 passed / 2 failed**，红字原文：`FAIL S4e8 … :: got 7 expected 8`、`FAIL S4e9 … :: got "8,22,23,31,33,41,47" expected "8,22,23,31,33,41,42,47"`（消失的正是 42）。恢复后 **112 passed / 0 failed**。

**正/负控制（判据还活着，且工具级关闭可观察）**：`S4f1` 未教工具的 pair 归入 `tool`（不进 `a2`）；`S4f2` caller 与席位相符 + 读数未教 ⇒ 必须落 `a2`；`S4f3` 同一 pair 教进提示词后 ⇒ `no-gap` 掉出；`S4f4` 已知 caller 但席位不符 ⇒ `seat-mismatch` 具名；`S4f5` **把该工具从 `toolLevelGaps` 里去掉后，其 pair 由谓词重算自然回到 `a2`** —— 这就是「关闭工具级缺口的证据要求」的可观察落点（不是手动删表）。

**读数规则（写死，防止误读）**：`a2=[]` + 非空 `toolLevelGaps` 的正确读法是「**pair 级干净、工具级有病**」；`toolLevelGaps` 非空时套件会紧跟打印一句「工具面整体未被教：… —— 这不是 pair 级缺口，也不会因为教了一句就消失；补它需要一条工具级说明」。

**条件 d（拼写死分支）**：`tests/vmu-run257-prompt-receipt-parity.test.mjs` 原来的 `if (p.tool === 'vibe_vpu_records') return false;` 里 `vibe_vpu_records` 在本仓不存在 ⇒ 该行永不命中、等于没有。若按字面改成 `vibe_vmu_records` 并保留 `return false`，会把 4 条 records pair 从快照集合里排除（快照 8 → 4），与 TB-2664 的「已知 6 对」及 §S4d 的快照数字冲突。因此把这行**并入计数分支**（`if (p.tool === 'vibe_vmu_records') return true;`），行为与修正前一致、死名字消失。**数字变化：0。**（若日后要改成排除语义，那是改判据，需 lead 再裁。）

**口径变更记账**（历史数字不互相替代）：

| 时点 | 口径 | A2 |
| --- | --- | --- |
| RUN 255 快照 | 旧（不看席位） | 8 对：`8,22,23,31,33,41,42,47` |
| RUN 258 当前语料 | 旧（不看席位） | 6 对：`8,22,23,31,33,47`（41/42 已被 consult 教学消掉） |
| RUN 260（m07045，P1+P2） | caller 存在且席位相符 | **0 对**（6 对全部落入 `noCaller`，另 2 对旧口径残留是 consult 修复前） |
| RUN 260 二审（m07103，四桶拆分） | 工具级 / pair 级分离 + 守恒 | **A2=0；toolGapPairs=4（`8,31,33,47`）；noCaller=4（`22,23,41,42`）；toolLevelGaps=2** |

变更理由一句话：**旧口径把「回执的读者」当成「动作的发起者」，而快照语料不记录 caller，6 对全部没有席位主语。** 因此 **A2 从 6 归 0 是口径变更，不是缺口被修好**；不得把 0 当作长期基线。

**依赖与回升（重要）**：席位错配的源头在 pair 生成侧——`scripts/sim/scenarios/end-to-end.mjs:602-610` 用 `as: roster[0]` 由主席发起 `verdict_ask`，却 `capture({seat:"member"})` 抓成员提示词。该修正已并入 **TB-2648**（sim-lane）。修正后 caller 会被记录，records 的 4 对（工具整体未教）与可能的新增错配会重新进入判定，**回升的那部分才是真缺口**；本小节的 0 只是「快照语料没有主语」的读数，不是「A2 已清零」。

### 14.8.1 RUN 268 语料迁移记账（lead m08391 裁定；这是 commit 的阻塞项）

**触发**：磁盘语料换成了 2026-11-09T12:25Z 那一代（`startedAt 2026-11-09T12-25-37.248Z`、`promptsSha256 05e463ef…`、47 pairs / 45 receipts / 12 prompts），它**记录 caller**（bridge 读记 `caller:"office"`，caller 读记真实成员 id；`pairKind {bridge:24, caller:23}`），且 `scripts/sim/run.mjs:235` 的 caller-aware `promptAfter` 会优先取"真正动手的人"的提示词。于是套件从 **106 passed / 13 failed → 123 passed / 0 failed**。下面每条都是**重新推导**，不是照抄实测值。

| 判据 | 旧期望 | 新期望 | 推导式 / 为什么 |
|---|---|---|---|
| S2b0 | 9 个 used 文件 | **10** | used = 12 个文件里文本能逐字等于某个 pair 的 `nextPrompt.text` 的个数；caller-aware 配对使 09-chair 成为被使用的一回合。 |
| S2b | 12 − 9 = 3 | **2** | 同一测量：12 − 10 = 2。 |
| S2b2 | `02,09-chair,11-chair` | `02-temp,11-chair` | 未配对 = 全文件集 − used；09-chair 已进 used。 |
| S4b / S4c | `consult`/`compile` 全提示词 0 命中 | **每对真调用的 pair 必须在自己的提示词里见到该动作** | RUN 258 已把这两条路教进 chair 提示词；旧的全否定已不成立，改成正向可证伪形状（`consultPairs.length>=2`、`compilePairs.length>=1` 防空集）。 |
| S4d | 8 对 `8,22,23,31,33,41,42,47` | **6 对 `8,22,23,31,33,47`** | 谓词未动，逐桶重算：records 4 对（工具级，S4e2）+ verdict_ask 2 对（席位错配，S4e6）；41/42 因 consult 已教（S4b）而 `wouldBeGap=false`。 |
| S4e4 | `22,23,41,42`（无 caller 余项） | **`[]`** | 新语料每个 pair 都记 caller ⇒ `bucketOf` 的 `no-caller` 桶为空。**EMPTY_ALLOWED**：断言保留（不删），若将来语料丢 caller 列会自己变红。 |
| S4e6 | 0 | **`22,23`** | `callerSeatOf(p) !== nextPrompt.seat`：两对 verdict_ask 的 caller 是主席 `r-acad`，`nextPrompt.seat` 却是 member（§14.4 的 NOT-FOR-THIS-SEAT 事实由语料自身证实）。另加 S4e6b 断言两条都是 chair→member。 |
| S5a | 4 对 `40,43,44,45` | **`[]`** | A1 = "闸门 pair 自己的提示词**没教**闸门出口"。新语料里 12-chair 同时教了 consult/compile/toolchainAbsent/renderOk ⇒ 四个 `!has(...)` 全为 false。**这不是"闸门不再触发"**：S5b 仍从回执重算出同一组五对 `40,43,44,45,46`（含 P46 status 回显），闸门照旧拒绝；变的是"提示词承诺 vs 能力"的差值被 RUN 258 的教学收口。**EMPTY_ALLOWED**，理由同上。 |
| S8g | member 提示词 0 命中 `closureVote` | **只能出现在结题读数行**（行内含 `未决动议` 或 `[结题]`） | 成员提示词第 276 行确实有 `closureVote`，来源是结题读数句"未决动议 0（来源：本回合编排器的 closureVotes + …）"。形状改为可证伪：`closureVoteLinesOutsideReading(t).length === 0`。**两向反关灯**：往 member 提示词插一句"用 closureVote 表达你的结题判定" ⇒ 必被函数抓到；删掉读数行 ⇒ `S8g3` 的存在性 pin 变红（若只删读数行、S8g 仍"真"，那这条就退化成"根本没有这句话"，S8g3 堵住它）。 |
| S10j | 47 条 citation 全部对旧提示词行 | **同一断言，把 doc 的 47 个提示词引用重锚到本代语料** | 判据本身未放宽：仍要求 `prompts/<file>:<line>` 行内含 token，`:0` 仅在 token 确实缺席时允许。改的是 doc 数据：41 行行号/文件变化（提示词增删行使其后行号位移；caller-aware 配对使部分 pair 换文件），另 6 行原本就指向同一文件同一行。**行 26 保持 `:0`**（08-member 确实 0 命中 `vibe_v5_verdict_final`）。每行新引用仍满足"该文件 seat 后缀 = 该行席位列"（脚本复核 47/47，`bad rows=0`）。 |

**读数对比（套件输出原样）**：`a2=[]`、`toolGapPairs=[8,31,33,47]`（全 `vibe_vmu_records`）、`noCaller=[]`、`seatMismatch=[22,23]`（chair→member）、`toolLevelGaps=[vibe_vmu_records,vibe_vmu_vote]`；守恒 `6 = 0 + 4 + 0 + 2`。

**没有放宽的地方（写给自己与下一个人）**：`wouldBeGap`/守恒/S4f 五项控制未动；S4e4 与 S5a 是**保留断言 + 空集理由**，不是删断言；S4b/S4c 从全否定换成"每对真调用必见教学"（更强：它钉住的是每对自身）；S5b 保持五对闸门标记，证明 A1=[] 不是"闸门没了"。**S11 的 A=12/A1=4/A2=8 是 RUN 255 审计表的时点事实**（§13 已声明两个数并存），本轮不迁移报告分类，只迁移机器判据与引用；整表重生仍归 TB-2648。

### 14.9 本轮边界（补充）

- 改动的产品文件：**无**（提示词 0 字符、`kernel/**`、`packs/v5r/tools.js`、`scripts/sim/**` 均未动）。
- 改动的我的写域文件：本文、`sim-audit-prompts.md` §16、`tests/vmu-run257-prompt-receipt-parity.test.mjs`（谓词重构 + S4e 四桶/守恒 + S4f 五项控制 + 拼写死分支合并）。
- 门禁：parity **112/0**、`check-docs` PASS、`audit-prompt-budget --check` PASS（chair/meeting 34 671，cap 36 500 未动）、prompts-compress §5c 绊线未动（本轮 0 字符进入提示词）。

### 14.10 第二次裁定的教训（RUN 260 二审，lead m07103）

1. **一台尺子只能量一件事，但可以让两个问题各有一个数**：`a2`（pair 级）与 `toolLevelGaps`（工具级）不是大小关系，是主语不同。用 pair 数去压工具级缺口，会得出「教一句就少一个缺口」的假象；反过来用工具级去吞 pair，会让真缺口消失。四桶拆分 + 守恒等式是唯一能同时守住两者的形状。
2. **工具级缺口的最小关闭单位是工具，不是 pair**：同一段「这个工具在提示词里没出现过」的说明，不应因为场景调了它 4 次就变成 4 个缺口；反过来，逐对加词也永远关不掉它。这条既写在这里，也写在 `sim-audit-prompts.md` §16.7——否则下一个人会先试逐对教、发现关不上、然后去改判据。
3. **判据里写错的名字等于没有这条判据，而且不会有任何东西变红**：`vibe_vpu_records` 这个死分支在文件里存在、能过审、永远不命中；它骗过的不是读者，是「有测试在看着」这个信念。教训：**判据里的每个标识符都要能被注册表校验**（与 §3 的 hint 工具名校验同一条原则）。
4. **守恒等式必须实测会红**：只写不断言等于注释。本轮用一次临时 `counted.pop()` 证明它会红（110/2，红字点名消失的 42），随后恢复；没有这次破坏，「数字变小了但没人知道去哪了」仍然无法被发现。

## §15 RUN 262 / TB-2678 —— 提示词正文里点名的名字必须真实存在（首轮量测，只记录不改）

### 15.1 病：hint 的判据盖不住「被拒之前」

RUN 258 的 AUDIT-14（TB-2652）治的是**拒因回执里的 hint**：hint 说 `vibe_v5_x {a:1}` 时，工具名与形参必须真存在，否则套件红。但 hint 只在人被拒**之后**才出现；**提示词正文出现在被拒之前**，它点名一个不存在的工具、形参、枚举值，成员照着做、撞墙，而没有任何东西会红——测试只钉「某句在不在」，不钉「那句里的名字是否真实」。用户说过提示词是重中之重，所以这条从「散文」升级成机器判据。

§14.10 第 3 条已经写下这条原则（`vibe_vpu_records` 死分支＝判据里写错的名字等于没有这条判据）：**判据里的每个标识符都要能被注册表校验**。§15 就是把它从「判据文件」扩到「提示词正文」。

### 15.2 三个活来源（全部实算，不手抄）

| 名字类别 | 来源 | 入口 |
| --- | --- | --- |
| 工具名 | 宿主注册表（boot 时 `ctx.tools.register` 收集的真 spec） | `scripts/sim/harness.mjs` 的 `boot()` 返回 `specs`；`audit-prompt-names.mjs` 取 `spec.name` 全集 |
| 形参名 / 枚举值 | 同一条 spec 的 `params[].name` / `params[].enum` | 同上，按工具分组 |
| 回执字段名 | 真回执语料 `D:/_tmp/sim/real-fieldset.json`（71 个工具的 `keys`）**并集**「源码里作为对象键出现过的词」 | 文件缺失 ⇒ `fail()` + exit 1，**绝不 skip**；第二来源扫 `vibe-math-vmu/{kernel,packs/v5r,middleware}/**/*.js` |

扫描对象是**装配后的文本**，不是源码字面量：`prompts.assembleFor({seat, phase:'normal', member})` 三个席位（chair/r-acad、member/r-1、temp/r-t1），任一席文本 < 10 000 字符即判装配失败（防止 harness 静默返回空文本后「零命中＝绿」）。

### 15.3 抽取规则：宁窄勿宽（误报会逼着改本来正确的中文）

- 工具名：全文扫 `\bvibe_(?:vmu|v5)_[a-z_]+\b`；尾随 `*` 当家族前缀（要求存在以该前缀开头的真工具，如 `vibe_v5_record_*`）。
- 形参 / 枚举：**只在反引号 span 内、且该 span 恰好点名一个真工具**时才校验（`k=v`、`k:"v"`、`k:'v'`）。这样 `action:"status"` 与工具名分处两个 span 的常见写法不会被误判。
- 回执键：只认「整个反引号 span 是一个标识符」或「span 内含引号外的 `key:`」；排除工具名、`vibe_` 前缀、所有参数名、**全部 enum 值**、常见英文停用词。
- **故意不扫的形态**（宁可漏报）：① 散文里不带反引号的形参/枚举；② 跨 span 的「工具名 + 形参」组合；③ 不带反引号的人话字段名；④ 权限面（工具真存在但该席无权）不在本判据判，另节报告。
- 非空洞闸：被检工具提及数 = 0 ⇒ FAIL（不许空扫当通过）；末行打印 `EXAMINED tool-mentions=… params=… enums=…`。
- 判定三级：`UNKNOWN_TOOL` / `UNKNOWN_PARAM` = BLOCKER（exit 非 0）；`UNKNOWN_ENUM` / `UNKNOWN_FIELD` = WARN（不改退出码，但逐条列名 + 上下文 20 字符 + 建议）。`--self-check` 内置四类注入：假工具、假形参、假枚举、假回执键必红，干净文本必须安静。

### 15.4 首轮读数（RUN 262，工作树）

| 类别 | 数量 | 级别 | 结论 |
| --- | --- | --- | --- |
| 工具名 | 0 | BLOCKER | 提示词点到的 340 处工具提及全部存在 |
| 形参 | 0 | BLOCKER | 22 处被关联校验，全部存在 |
| 枚举 | 0 | WARN | 仅 1 处满足「同 span 点名一个工具」的窄条件 |
| 回执字段 | 15 | WARN | 四分类后只剩「源码有、语料没有」的覆盖缺口（见 §15.5/§15.8）；0 条无来源 |

`--self-check` PASS；全量 exit 0（`BLOCKERS 0`）。

### 15.5 字段名的四分类（lead m07770 裁定后；每类计数 + 归属来源）

首轮把 60 条字段塞进「code-seen / nowhere」两类，逼着人做二选一：要么补语料，要么进白名单。lead 裁定不建白名单——**先分类，再让每一类都有自己的活的来源**；分不出的才叫人裁定。下表是第二批实测（三席合计，`tests/audit-prompt-names.mjs`，证据 `D:/_tmp/pin2678/final5.txt`）：

| 类别 | 去重名字 | 出现次数 | 活的来源（实算入口） | 处置 |
| --- | ---: | ---: | --- | --- |
| `RECEIPT_KEY` | 44 | 128 | `D:/_tmp/sim/real-fieldset.json` 的 `keys` + `kernel/**`/`packs/v5r/**` 当作对象键的词 | 在 fieldset 里＝通过；只在源码里＝`WARN: coverage-gap`（语料缺口，不是提示词错） |
| `SETTINGS_KEY` | 5 | 13 | `settings/schema.js` 的键表（`vmu.math.*`，如 `leanInitiative`） | 通过，或 `WARN: unknown-name` |
| `ENUM_VALUE` | 31 | 92 | spec `params[].enum` + 已知枚举值集合 + 源码字面量（`===`/`.includes`/`case`/`Object.freeze`） | 通过（`encourage`/`rejected` 属此类） |
| `VARIABLE` | 19 | 72 | `kernel/**`/`packs/v5r/**` 的 `const/let/var`、参数、解构绑定、字符串值 | 通过（`perBox`/`unackedRowsAllBoxes`/`period`/`lean_lib`/`valueMissing` 属此类） |
| `unclassified` | 0 | 0 | — | 逐条列名待裁定；**不判错也不静默** |

合计 99 条去重 / 305 处出现（同一名字在不同席位重复计数；`--json` 里 `classes` 是出现次数，`distinct` 是去重集合）。分类顺序固定为 fieldset→settings→enum→variable→源码对象键（coverage-gap）→源码标识符→unclassified，顺序写死在 `scanText`，避免事后挪分类。

**15 条 coverage-gap 名单**（`real-fieldset.json` 未收、但源码里确有对象键）：

`satisfiedBy, declaredCount, deliveredTo, deliveryFailed, ackRequired, blockChars, excerptLen, replyFullPath, replyFullSha256, replyFullBytes, turnInFlightMeans, inFlightMember, inFlightOpenedBy, inFlightForMs, recentAbandonments`

**9 条旧 nowhere 的归属（逐条 grep 复核，全部是真东西；现均落在上表类别里、`WARN=false`）**：

| 名字 | 真实出处 | 性质 |
| --- | --- | --- |
| `configure` | `v5r-core.js:567`、`member-scope.js:33`（`set` / `configure` 参数面） | 工具面/动作用词，非回执键 |
| `period` | `kernel/report.js:5`、`kernel/turn/index.js:3435` | 报告触发值 |
| `unackedRowsAllBoxes` / `perBox` | `kernel/mailbox.js:1391-1403` | 局部变量读数，非回执键 |
| `encourage` | `kernel/lean.js:17/261`（`formalVerify` 档位） | 枚举值 |
| `leanInitiative` | `kernel/lean.js:67/224`（settings `vmu.math.leanInitiative`） | 配置键 |
| `rejected` | 会议/审计 decision 值 | 枚举值 |
| `lean_lib` | `kernel/lean.js:18/1007`、`packs/v5r/tools.js:7109` | Lean 归档动词 |
| `valueMissing` | `kernel/math.js:187-192` | 数学回执字段（语料未收） |

**15.5.1 每条 coverage-gap 都要点名「谁产出它」（lead m07873-①）**。coverage-gap 只是「语料没收到」，它藏着两种完全不同的事实：(a) 采样没走到那个 op/状态（语料缺口，补语料即可），(b) 内核**读**这个名字却从不**写**进任何回执（提示词教了一个成员永远看不到的字段＝死名字）。光看 WARN 分不出这两者，所以每条带 `{key, producedBy, simProduced}` 一行；`simProduced` 由 sim harness **真跑**那条路径实测（不靠读码，探针 `D:/_tmp/cov15/probe{,2,3,4}.mjs`）。

| key | producedBy（哪个 op + 哪个状态） | simProduced |
| --- | --- | --- |
| `satisfiedBy` | `vibe_v5_verdict_final` → `receipt.floor.satisfiedBy`；`vibe_v5_paper {action:"final"}` → `receipt.final.consult.satisfiedBy`（e2e seq24/41） | true |
| `declaredCount` | `vibe_v5_start` / `vibe_v5_hire` → `receipt.memberScope.declaredCount`（seq1/2） | true |
| `deliveredTo` | `vibe_v5_say`（主席发言，带/不带 to）→ `receipt.deliveredTo`（seq13；私信时 `[]`） | true |
| `deliveryFailed` | `vibe_vmu_turn {op:"status"}` → `status.counts.deliveryFailed`（投递抛错后=1） | true |
| `ackRequired` | 只在 `kernel/mailbox.js:1138 noticeLines` 视图（1172 行）；唯一消费者 `kernel/index.js:3006` 只取 `.lines` 渲染 `[新到的消息]`——**没有任何工具回执返回该视图** | **false** |
| `blockChars` | `vibe_vmu_turn {op:"status"}` → `status.turnReceipts[i].notices.blockChars`（43） | true |
| `excerptLen` | 同一行 → 被切时 2000 | true |
| `replyFullPath` | 同一行 → `Members/<id>/Turns/<turn>.md` | true |
| `replyFullSha256` | 同一行 | true |
| `replyFullBytes` | 同一行（7800） | true |
| `turnInFlightMeans` | `status.turnLoop.turnInFlightMeans`（in-flight 时） | true |
| `inFlightMember` | `status.turnLoop.inFlightMember`（r-1） | true |
| `inFlightOpenedBy` | `status.turnLoop.inFlightOpenedBy`（drive） | true |
| `inFlightForMs` | `status.turnLoop.inFlightForMs` | true |
| `recentAbandonments` | `status.turnLoop.recentAbandonments`（`op:"abandon"` 后非空，row 带 settledBy:"released"） | true |

**从 WARN 升 BLOCKER 的规则**（写进判据，非文档约定）：coverage-gap 名字缺条目、或 `producedBy` 为空 ⇒ `blocker:true`，计入末行 `coverage-gap without producedBy=N`，exit 非 0。理由：WARN 一旦没有产出者背书，就变成「永久豁免」——没人会回来复查；只有「产出者写不出⇒红」才能逼着裁定 (a)/(b)。`--self-check` 两向都测（已登记 gap 仍 WARN、未登记 gap 必 BLOCKER）。

**唯一 `simProduced:false` 的 `ackRequired`（(b) 候选，待 lead 裁定）**：它和同句里的 `acked`/`unackedRowsAllBoxes`/`perBox`/`settledBy:"ack"` 都只在 `noticeLines` 视图里；提示词 `v5r-blocks-b.js:1033` 却把这几个名字列为成员「具名读数」⇒ 成员照读永远拿不到。这是 **判据盲点**：后四个被四分类归到 `VARIABLE`/`ENUM`，因此不进 coverage-gap WARN——「在源码里出现过」不等于「能出现在回执里」。本任务**不改提示词**（只量不改），动作交给 lead 裁定（(b) 死名字，同 TB-2652 处置）。

读法：**没有一条是拼写错误**。它们暴露的是「对象键」这一第二来源也偏窄——漏变量、settings 键、字符串值；所以首轮只标「待裁定」。lead 的处置是**扩类别而不是扩白名单**：`configure`/`lean_lib` 是工具面/归档动词（不算字段），`period`/`rejected`/`encourage` 是枚举值，`leanInitiative` 是 settings 键，`perBox`/`unackedRowsAllBoxes`/`valueMissing` 是源码变量或字符串值——每一类都用自己的活来源校验（§15.5 表），白名单保持**空**。只有当某个名字**既不**是回执键、settings 键、枚举值，**也不**在源码里以任何形式出现时，才落 `unclassified` 交人裁定。

### 15.6 反关灯两态（实测，不是声明）

向 `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js:86` 的字符串**内部**注入（脚本 `D:/_tmp/pin2678/mutate-names4.mjs`，证据 `state1/2/3.txt`）：

| 态 | 注入 | 结果 |
| --- | --- | --- |
| ① | 句末加「调用 `vibe_vmu_does_not_exist`」 | exit 1；`chair \| UNKNOWN_TOOL \| vibe_vmu_does_not_exist \| …not in the published tool registry`；`BLOCKERS 1` |
| ② | 句末加 `` `vibe_vmu_records {action:'list', nonexistent:1}` `` | exit 1；`UNKNOWN_PARAM \| nonexistent \| …vibe_vmu_records has no such parameter`，**只点名该形参** |
| ③ | 还原 | exit 0；`BLOCKERS 0`；文件 sha256 与注入前一致 `7dfe69f0a1d344d7…` |

两个坑（留给下一个人）：`v5r-blocks-b.js:86` 是双引号字符串且行尾是 `",`——把文本追加到行末会跑到字符串外（SyntaxError）；清理时若把 `",` 的逗号一起删掉，下一行字符串同样红（`Unexpected string`）。

### 15.7 边界

- 改动产品文件：**无**（`kernel/**`、`packs/v5r/**`、`scripts/sim/**` 未动）；提示词本轮 **0 字符改动**——按任务书要求，首轮只量不改，等 lead 裁定真错/别名。
- 新增：`tests/audit-prompt-names.mjs`（`--self-check` / `--json` / `--fieldset`）；第二批把字段判断改成四分类（§15.5/§15.8），判据文件本身同步改（属我的写域）。
- 门禁：本判据 exit 0（0 BLOCKER）；待裁定后的改词轮再复跑 `vmu-run239-prompts`、`vmu-run257-refusal-hints`、`vmu-turn-mainline`、`audit-prompt-budget --check`、`check-docs`。
- 教训预告（若裁定要改词）：**先量后改**——把「提示词里有多少个名字」变成可数事实，才有资格讨论预算；凭印象改词会把 cap 余量吃光。

### 15.8 四分类的工程口径（第二批）

为什么不是白名单，而是四个类别各带一个活来源：

1. **白名单会让判据失去牙齿**。白名单的本质是「人已经看过这个名字」；一旦允许写名字，它就变成第二个「提示词副本」——名字错了、工具重命名了、枚举删了，白名单不会跟着红。四分类不记人话，只记**活的来源**：fieldset（回执语料）、`settings/schema.js`（配置键）、spec `enum` + 源码字面量（枚举值）、`kernel/**`/`packs/**` 的绑定与字符串（变量）。来源变了，判据自然红——这正是 §16.10.8「期望值本身必须有守卫」的同一类要求。
2. **`--self-check` 从「4 个注入全红」扩成「4 个注入全红 + 4 类各归其表 + coverage-gap 必须 WARN + 干净文本安静」**。只测「假名会被抓到」不够——还要测「真名会被分到对的表里」；否则分类写错（比如把枚举值当回执键）时，全量仍 `BLOCKERS 0`，判据看起来是绿的。
3. **`EXAMINED` 非空洞闸**：`tool-mentions=0` 直接 FAIL，不许「没扫到东西」当通过。当前实测 `tool-mentions=340 params=22 enums=1 idents=305`。
4. **已知偏窄处（故意不扫，宁漏不误）**：① 散文里不带反引号的工具名不查（工具名本身仍全文本扫）；② 形参/枚举只在「反引号 span 内且恰好点名一个真工具」时才校验——`action:"status"` 与工具名分处两个 span 的常见写法因此不校验（`enums=1` 是这个原因）；③ 不带反引号的人话字段名不判；④ fieldset 只覆盖 47 对真回执，所以 `coverage-gap` 只 WARN 不 BLOCKER。
5. **`unclassified=0` 比「15 条 WARN」更有价值**（lead m07873-②）：WARN 只说「语料没收到」，它不区分「我写错了」和「我读到的东西不存在」；而分类表把每个名字逼进一个**有活来源的类别**，分不出的才落 `unclassified`。第二批 `unclassified=0` 意味着：99 个去重名字里**没有一个是「既不在这四类里、又确实出现在提示词里」的孤儿**——这比「少报了几条」强，因为它证明分类没有靠吞错来让数字好看；也正因如此，剩下的 coverage-gap 才值得一条条要 `producedBy`（§15.5.1）。
6. **第二批读数**：`COUNTS tools=0 params=0 enums=0 fields=15 (coverage-gap=15 unclassified=0)`；`CLASSES receipt=128 settings=13 enum=92 variable=72 unclassified=0`；`CLASSES-DISTINCT receipt=44 settings=5 enum=31 variable=19 unclassified=0`；`BLOCKERS 0`。脚本入口：`node tests/audit-prompt-names.mjs`（`--self-check`；`--json` 输出含 `classes` 与 `distinct`；`--fieldset` 可换语料，缺失即 FAIL）。

### 15.9 S10 报告解析器的锚定（lead m07770-②）

旧 S10 用 `doc.split('\n').filter((l) => /^\| \d+ \|/.test(l))` 抓「报告行」——**任何**位置出现的数字表格都会被算进 47 对里。§15 自己加的第一张表（首格 1/2/3）就曾把计数搅成 48，当时只是把首格改成 ①②③ 绕过；绕过不是修复：下次谁在别处放一张数字表，S10 还会静默变。

现在改成 `reportRowsOf(text)`（`tests/vmu-run257-prompt-receipt-parity.test.mjs`）：

1. 只在 `^## §2` 到下一个 `^## §` 之间解析（报告表所在 section）；
2. 必须找到表头 `^\| # \|`，断言第二格是 `#`、总格数固定 9（含首尾空 cell）；
3. 只收「列数一致 + 第二格是数字」的行；
4. **反关灯 S10k0–S10k3**：§2 外插一张数字表仍 47；表头前插一行数字仍 47；没有 §2 段＝0 行；有表头无行＝0 行。最后两条是**非空洞守卫**——parser 写成「找不到就返回全部行」时它们会红。

同一类病在本轮的四处实例（lead m07770-② 的推广，接 §16.10.8；第四例即本节的 S10 正则）：提示词整句常量（正面，有 §1j/§1k 守卫）；`fidelity-branch-baseline.json` 的 stale 声明（反面，无守卫，靠 stale 检查兜）；`CODES.length === 12`（反例，只锁数量不锁集合）——以及本节的 S10 正则（反例，只锁形状不锁位置；实测旧写法在 §15.6 首格改回 1/2/3 时把 47 数成 50）。

### 15.10 第五类 TAUGHT-READING：「源码里有」不等于「回执里能读到」（lead m08032-③）

四分类问的是「这个名字在仓库里存在吗」。这个问法有一个边界：`ackRequired`／`perBox`／`unackedRowsAllBoxes` 都是 `kernel/mailbox.js:1138` 的 `noticeLines` 视图里的标识符——它们确实是源码里的真变量，于是被判成 `VARIABLE`，`BLOCKERS 0` 一片绿；可这个视图**没有任何工具回执返回**（唯一调用点 `kernel/index.js:3006` 只取 `.lines` 去渲染 `[新到的消息]`）。提示词却把它们写成「具名读数」——读者照着去回执里找，永远找不到。判据要抓的不是「名字存不存在」，而是「提示词**承诺可读**的那个名字，读者能不能真的读到」。

第五类 `TAUGHT-READING` 把抽取规则钉死在提示词自己的措辞上（句式是从三席装配文本数出来的，不是猜的）：

| 触发句式 | 三席合计出现 | 取名字的方式 |
| --- | --- | --- |
| `…是具名读数` | 3 | 同句前文 220 字符内的反引号标识符 |
| `…是小节读数` | 3 | 同上 |
| `回执里 `X`` | 3 | 直接取 |
| `回执的 `X` 字段` | 8 | 直接取 |
| `看 `X`` | 4 | 直接取 |

另外查过 `返回 …` 与 `…字段` 两类句式：只找到「返回 0 行」「四个字段（指面板）」这类**不点具体回执键**的句子，没有可判的名字，所以故意不收（收了就是把散文当承诺，误报会逼着改本来正确的中文）。

判定三档：

1. **pass**：名字出现在真机 fieldset ∪ sim 语料回执的键并集里（`--fieldset` 与 `--corpus` 两个入口，语料缺失即 FAIL，不 skip）；
2. **WARN `reading-gap`**：候选集里没有，但**有实测的 producer**（`TAUGHT_READING_PROVEN`，证据是探针跑出的回执键路径）——这是采集缺口，不是提示词错；
3. **BLOCKER `TAUGHT_READING`**：既读不到、又没有 producer。报告必须引**那句提示词原文**（`promptQuote`），否则读者不知道改哪句。

第 2 档不是给提示词开后门，而是因为「语料没采到」与「回执根本不返回」是两件事：`notices`／`rendered`／`blockChars` 在 `vibe_vmu_turn {op:"status"} -> status.turnReceipts[i].notices` 里实测可读（`D:/_tmp/taught-readings/probe4.mjs`，`notices={"lines":1,"rendered":true,"blockChars":43}`），只是 e2e 采集没跑 status；若一律判 BLOCKER，判据会把真读数判死。反过来，没有 producer 的名字没有第三条路可走——`perBox`／`unackedRowsAllBoxes` 正落在这里。

**WARN 不是判决，是一张有到期日的收据**（lead m08149-①）：每条 `reading-gap` 必须带 `capturedBy: {tool, action, corpus, scenarioStep}`，写清「跑哪个 op、在哪份语料的哪一步能看到它」；`capturedBy` 缺任一字段 ⇒ 立刻 BLOCKER（`readingVerdict` 同一处判，`--self-check` 两向都测）。sim-lane 已往 e2e 场景加 `vibe_vmu_turn {op:"status"}` 与 `vibe_vmu_mailbox {action:"pending"}` 两个探针；**语料重生成后这 4 条 WARN 必须自己消失**。若重生成后仍在 ⇒ 说明 producer 只在某种状态下出现，那时把 `capturedBy` 精确到状态，或者承认它其实是 BLOCKER。这与 §16.10.8 的老病同源：没有到期日的 WARN 就是永久豁免。

首轮读数（提示词改动前，红字存档 `D:/_tmp/taught-readings/red-first-run.txt`）：

```
READINGS claims=21 pass=21 gap=12 blockers=6 patterns=是具名读数:3 是小节读数:3 回执里 X:3 回执的 X 字段:8 看 X:4
READINGS-DISTINCT names=6 gap=4 blockers=2
```

按名字去重的首轮红清单：两个 BLOCKER（`unackedRowsAllBoxes`／`perBox` 只在 `noticeLines` 视图，无回执返回）+ 四个 WARN（`ackRequired` 等 task-165；`notices`／`rendered`／`blockChars` 有 producer 但语料没跑 status）。

处置（lead m08149-② 裁定后，本轮已落地）：

1. **删掉两个 view 级聚合**：那句改成「`acked`／`ackRequired`／`settledBy:"ack"` 是具名读数；`unackedRows` 是旧称。」——只留当前真能读到的名字，不拿「全所合计」这类没法验证的措辞替代。同步 pin：`tests/vmu-run239-prompts.test.mjs` §10k/§10k3/§10m 与 `tests/vmu-run256-mail-tool-facts.test.mjs` 的 body pin 都改成「新名在 + 两个旧名 0 命中」（正反两半，不是删断言）；机制面 `status().notice` 仍照旧计算这两个聚合（`vmu-run255-mail-receipts`／`vmu-run256-mail-tool-facts` 的内核断言不动）。
2. **`settledBy:"ack"` 待实测**：不为它新加 `k:"v"` 抽取形式（宁窄勿宽）；task-165 落地后跑一次 `vibe_vmu_mailbox {action:"ack"}`，回执里有 `settledBy` ⇒ 当普通回执键保留（走 receipt 类），没有 ⇒ 一并从这句删掉。**用实测决定，不用推断决定。**
3. **`ackRequired` 留 WARN**：task-165 正在给它造回执（pending/list 每行），落地后它会从 gap 里消失；若落地后仍不出现 ⇒ 机制没交出来，回 lead。

判据侧复跑读数（本轮改完，提示词删名后）：

```
READINGS claims=21 pass=21 gap=12 blockers=0 patterns=是具名读数:3 是小节读数:3 回执里 X:3 回执的 X 字段:8 看 X:4
READINGS-DISTINCT names=4 gap=4 blockers=0
EXAMINED tool-mentions=340 params=22 enums=1 idents=299 readings=33
BLOCKERS 0 (UNKNOWN_TOOL + UNKNOWN_PARAM + taught-reading without producer=0 + coverage-gap without producedBy=0)
```

即：名字层面的假承诺已清零，剩下的 4 条是「语料还没采到」的有到期日收据。

反关灯（`--self-check` 内，5 个注入 + 四个方向）：① 造一句「`notARealReading` 是具名读数」⇒ BLOCKER 且 `promptQuote` 含该名字；② 把候选集里的真键 `rows` 删掉 ⇒ 同一句「`rows` 是具名读数」从安静变 BLOCKER（证明它真在比语料，不在比硬编码白名单）；③ 有 producer 的 `notices` 在候选集为空时是 WARN 不是 BLOCKER；④ `capturedBy` 完备 ⇒ WARN、`capturedBy` 缺失 ⇒ BLOCKER（用注入的假表两向测，不靠真表碰巧）；⑤ 干净文本保持安静；⑥ 按 lead 的原话造「读数里有 `vibe_vmu_does_not_exist`」⇒ `UNKNOWN_TOOL` 必红（工具名永远由第一类兜底，不靠第五类）。

**收口前面核对（lead m08320-②）。** 用真 sim 驱动的探针（`D:/_tmp/face-probe.mjs`，boot → `vibe_v5_start` → 一条 DM → `vibe_vmu_mailbox {action:"status"}`）复核「这几个名字到底在哪一面能读出来」，结论如下：

- `vibe_vmu_mailbox {action:"status"}` 的 `notice` 键＝`acked`／`ackRequired`／`unackedRows`／`unackedRowsAllBoxes`／`perBox`／`pendingMembers`／`settledBy`／`means`。一条未 ack 的 DM 之后实测：`ackRequired:true`、`acked:false`、`settledBy:"ack"`、`unackedRows:1`、`unackedRowsAllBoxes:1`、`perBox:{"r-1":1}`；ack 之后 `acked:true`（同一探针可复现）。
- 今天 `pending` 每行**没有** `ackRequired`／`acked`（只有 `ackedAt`），`list` 行也没有 ⇒ task-165/TB-2682 的价值是「把这两个读数放到 per-row 面」，**不是**「让 `ackRequired` 第一次可读」。
- **更正**：本节前面「`ackRequired` 只在 `noticeLines` 视图、没有任何工具回执返回它」「`simProduced:false`」是**误判**——漏看了 `vibe-math-vmu/kernel/mailbox.js:1390-1410` 的 `status().notice` 聚合面（`noticeLines` 视图确实不被工具直接返回，但 `status` 返回的是同一批读数的聚合）。判据表已改：`ackRequired` 的 `simProduced:true`、`producedBy` 指向 `vibe_vmu_mailbox {action:"status"} -> notice.ackRequired`、`capturedBy` 指向 `mailbox/status`（e2e 语料还没跑 status，所以它**仍是** reading-gap WARN，到期日规则不变）。
- 「`unackedRows` 是旧称」**准确**：`status.notice` 同时给 `unackedRows`（数字）与 `unackedRowsAllBoxes`（同一个数的真名；`kernel/mailbox.js:1398-1406` 注释原话是 the reading keeps its old name … now also says what it is）。
- `perBox`／`unackedRowsAllBoxes` **在 status 面可读**（探针实测）。提示词不教它们，理由应写成「教学经济：成员只需知道自己箱里欠几条（`pending`/`unread` 已够），不必背全所聚合」，而**不是**「无面可读」——删除结论不变，但理由要诚实，否则下一个人会拿「不可读」去删一个真能读的读数。
- 另有一处同名异形陷阱记在这里：`noticeLines` 视图里的 `unackedRows` 是**行数组**（该视图不被工具返回），`status.notice` 里的 `unackedRows` 是**数字**（可读）。同一个名字两种形状，读回执的人不要跨面推理。

- `ack` 动作回执**没有** `settledBy`（`D:/_tmp/ack-probe.mjs` 实测键：ok/action/member/acked/rows/remaining/ackedLedger/enforced/…）；`settledBy:"ack"` 只在 `status.notice` 里。三者（`acked`／`ackRequired`／`settledBy`）同属 status 面，所以提示词把它们并列成「具名读数」是对的；ack 回执只给 `acked`（id 数组）与 `remaining`，读者不要指望在 ack 回执里看到 `settledBy`。
这条复核对提示词不改字（名字都已真实可读），只改判据表的 provenance 与本节文字；4 条 `reading-gap` 数量不变（`ackRequired`／`notices`／`rendered`／`blockChars`），因为 e2e harvest 仍未跑 status/pending 两个探针。
