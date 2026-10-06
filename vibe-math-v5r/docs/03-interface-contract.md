# 第 03 章 · 统一接口契约（Interface Contract）

> **本章地位**：本章是会议平台**唯一**的接口权威 —— 命令名、参数、回执、错误码、状态字段、硬约束，**同一件事只有一个说法**。
> **上游（只读，不得违反）**：`MEETING-PLATFORM-RULINGS.md`（定稿：D1–D10／**R1–R10**／C1–C7／G1–G5／U3–U5）、`MEETING-PLATFORM-SPEC.md`（其第 2 节 统一命名表 42 条、其第 3 节 K1–K14 裁决）、`MEETING-PLATFORM-A-model.md`（命令目录 8 字段）、`MEETING-PLATFORM-PHILOSOPHY.md`、`MEETING-PLATFORM-VOTING.md`、`MEETING-PLATFORM-OVERSIGHT-TIME.md`。
> **凡与定稿冲突**：**以定稿为准**，并在文末「判定留痕」记一条；**不得**让两个说法并存。

---

## 1. 约定与阅读方法

- **规范名唯一**：命令一律 `meeting_*` + `snake_case`；参数一律 `snake_case`。
- **旧名仅文档别名**：A 稿的裸动词名（如 `convene`、`invite_speech`）与 B 稿建议名仅用于对照，**不注册第二套工具**。
- **表列义**：`★`＝用户点名；`内容`＝是否必须携带正文或结构化内容；`回执`＝成功返回的关键字段（`ok:true` 之外）；`状态影响`＝对会议阶段/实体的可观察变化；`权限`＝无临时授权时的默认；`可授`＝可临时授予的对象（**S6 起由 #47／#48 落地**：可授集合有界、事件型失效）；`实现`＝`现状`（今天已有行为，注明承载面）或 `待实现`。
- **命名空间**：会议动作＝`meeting_*`；机构/成员/研究动作仍沿用既有 `vibe_v5_*`（本章不改名，只做边界说明）。

---

## 2. 统一命名与约定

### 2.1 命名规则
1. **前缀**：会议平台动作一律 `meeting_` 前缀；机构级动作（启动/暂停/成员/研究）保持既有前缀，**不重复**。
2. **风格**：全小写 `snake_case`；名词用单数（`meeting_task_assign`，不用 `tasks`）。
3. **动词表**：`open/start/set/roll_call/recess/resume/extend/adjourn/grant/revoke/invite/speak/mute/settle/motion/poll/result/minutes/task/raise/say/challenge/answer/vote/abstain/second/material/claim/request/leave/stop`。
4. **参数命名**：`target`（对象）、`to`（收件人/执行者）、`mode`（枚举）、`options[]`（选项）、`rules{}`（规则聚合）、`note`（正文摘要）、`reason`（理由，**必填项时**不可省）、`deadline`（截止）、`visibility`（可见性）。
5. **枚举值**：一律小写英文（`present/absent/late/left_early/excused`；`single/open/round_robin/hands/call_on/directed`；`single/multi`）。

### 2.2 名称与别名
- **文档别名**：`convene→meeting_open`、`invite_speech→meeting_invite`、`call_on→meeting_speak_next`、`create_ballot+open_ballot→meeting_poll_open`、`close_ballot+tally+announce_result→meeting_poll_close`、`set_speech_mode+set_chat_policy+single_statement_round→meeting_chat_mode_set`、`quote_speech→meeting_say.quote_ref`、`mute/unmute` 拆两条。
- **别名规则**：别名**只出现在文档对照**中；实现**只注册**规范名；别名不得出现在提示词、回执或错误码里。

### 2.3 版本与兼容
- **接口版本**：`meeting.*` 语义版本随产品版本走；**新增**字段＝小版本（向后兼容）；**改名/删除**字段＝大版本，且必须在本章「迁移」小节登记（第 08 章执行）。
- **冻结承诺**：`status` / `report` / `overview` 的**顶层键**一经发布即冻结；新增一律加成**新键**，不得改变既有键的语义或类型。

---

## 3. 命令契约总表（**42 条平台命令** ＋ **6 条 v5r 运行时工具 #43–#48**）

> 每行 8 字段齐全；`实现` 列基于当前 `vibe-math-v5r.js` 的静态证据（是否已有该**行为**，而非是否已有该名字）。

| # | 命令（中/英） | 语义 | 参数（类型/默认） | 内容 | 回执 | 状态影响 | 权限 | 可授 | 实现 |
|---|---|---|---|---|---|---|---|---|---|
| 1★ | 召集开会 `meeting_open` | 建会：题目、议程、类型、名册 | `title:string`／`agenda:string[]`／`type:string`／`roster:string[]` | 是（题目+议程） | `meeting_id`、`phase` | 建会：`draft→summoned` | 院士 | 所办（显式） | **现状**（`vibe_v5_meeting`+建会逻辑） |
| 2 | 开场 `meeting_start` | 重申题目/议程/规则并宣布开始 | `note?:string` | 否 | `phase` | `summoned→in_session`（首阶段 `opening`） | 院士 | — | 待实现 |
| 3★ | 设定类型 `meeting_type_set` | 换类型 ⇒ 换旋钮组合与权限 | `type:string` | 否 | `type`、启用机制清单 | 不改阶段，**只改使能** | 院士 | — | 待实现 |
| 4 | 设定议程 `meeting_agenda_set` | 增删改议程条目 | `agenda:string[]`、`op?:add/remove/update` | 是（条目文本） | 议程快照 | 原地修改 | 院士 | 代行（须显式指定） | 待实现 |
| 5 | 采用/重排流程 `meeting_flow_set` | 采用推荐流程或自排步骤 | `steps:string[]` | 是（步骤文本） | 流程快照 | 不改阶段，只改建议序列 | 院士 | — | 待实现 |
| 6 | 点名 `meeting_roll_call` | 逐人确认在场 | `roster?:string[]` | 否 | 出席表 | 进入/重申 `roll_call` | 院士 | 纪要人 | 待实现 |
| 7★ | 设定时长 `meeting_time_set` | 设单步/单机制/发言/投票窗口时长与硬界 | `target:string`、`ms:int` | 否 | 生效时长 | 不改阶段 | 院士 | 代行（须显式指定） | 待实现 |
| 8★ | 停止 `meeting_stop` | 停当前动作/发言窗口（**不改阶段**） | `target:string`、`reason:string` | 是（理由） | 停止回执 | **相位不变**；不得据此推进/收束（R10） | 院士 | — | 待实现 |
| 9 | 休会 `meeting_recess` | 暂时中止，保留产物 | `reason?:string`、`expected_resume?:ts` | 可选 | 休会记录 | `in_session→recessed` | 院士 | 代行（须显式指定） | 待实现 |
| 10 | 复会 `meeting_resume` | 从休会恢复 | — | 否 | 复会记录 | `recessed→in_session` | 院士 | 代行（须显式指定） | 待实现 |
| 11★ | 延长 `meeting_extend` | 延长发言/投票/整场 | `target:string`、`by_ms:int` | 否 | 新截止 | 改时长（受双上限，D4） | 院士 | 代行（须显式指定） | 待实现 |
| 12★ | 散会 `meeting_adjourn` | 结束会议（产物保留，可归档） | `note?:string`、`archive?:bool=false` | 可选 | 散会记录+产物路径 | `→adjourned`（可选 `archived`） | 院士 | — | 待实现 |
| 13★ | 临时授权 `meeting_grant` | 授某人某命令（含范围与过期） | `to:string`、`command:string`、`scope{}`、`expires_at?`、`expires_on?`、`reason:string`（**v5r 落地面有意偏离**：只收**事件型** `grant_scope`，**不收** `expires_at?`／`expires_on?` —— 见 #47 行） | 是（理由） | 授权记录 | 不改阶段，只改权限 | 院士 | — | **已实现**（v5r 运行时工具 **#47／#48**） |
| 14 | 撤回/撤销 `meeting_revoke` | 撤回动议/邀请/任务/授权 | `target_kind:string`、`target_id:string`、`reason:string` | 是（理由） | 撤回记录 | 依对象而定 | 院士 | — | **已实现（部分覆盖）**：v5r 的 **#48** 只覆盖"**授权**"这一类；动议/邀请/任务的撤回仍待实现 |
| 15★ | 邀请发言 `meeting_invite` | **邀请内容＋邀请一体**：带正文的邀请 | `to:string`、`content:string`、`expect?:string`、`timebox_ms?` | **是**（`content`） | 邀请回执+被邀者通知 | 进入 `speech`，加入发言队列 | 院士 | 代行（须显式指定） | **现状**（`meeting_invite` 标识+`V5_ALREADY_INVITED`/`V5_INVITE_NOT_TEMP`） |
| 16★ | 设定发言顺序 `meeting_speak_order_set` | 指定谁先谁后 | `order:string[]` | 否 | 顺序快照 | 改 `speech_policy.order` | 院士 | 代行（须显式指定） | 待实现 |
| 17★ | 按顺序点名发言 `meeting_speak_next` | 请下一位发言（可附提示） | `next?:string`、`note?:string` | 可选 | 点名回执 | 进入 `speech(call_on)`，记录机会 | 院士 | 代行（须显式指定） | 待实现 |
| 18★ | 发言机制与群聊参数 `meeting_chat_mode_set` | 切模式＋配额/禁言/并行 | `mode:string`、`policy{quota?,mute[]?,allow_parallel?}` | 否 | 生效策略 | 改 `speech_policy` | 院士 | — | 待实现 |
| 19 | 举手管理 `meeting_hands_set` | 允许/暂停举手、优先、清空 | `allow?:bool`、`prioritize?:string`、`clear?:bool` | 否 | 举手队列 | 维持 `speech(hands)` | 院士 | 代行（须显式指定） | 待实现 |
| 20 | 静默 `meeting_mute` | 单人静默（可听不可说） | `who:string`、`reason?:string` | 否 | 静默名单 | 改策略 | 院士 | 代行（须显式指定） | 待实现 |
| 21 | 解除静默 `meeting_unmute` | 解除静默 | `who:string` | 否 | 静默名单 | 改策略 | 院士 | 代行（须显式指定） | 待实现 |
| 22★ | 沉淀等待 `meeting_settle` | 等在飞成员把活跑完（报 x/y） | `cap_ms?:int`、`on_timeout?:continue/defer/absent` | 否 | 等待清单与结果 | 进入 `settling` | 院士 | 代行（须显式指定） | **现状**（`vibe_v5_wait`+settle 逻辑） |
| 23 | 提出动议 `meeting_motion` | 提动议（议题/程序/决议） | `kind:string`、`text:string` | **是** | 动议记录 | 进入/保持 `motion` | 院士；成员需授权 | 在册成员 | 待实现 |
| 24★ | 创办投票板 `meeting_poll_open` | 建并开放：选项＋单选/多选＋上下限＋**最少收集票** | `mode:option/boolean`、`question:string`、`options:string[]`、`rules{single/multi,max?,min?,min_votes?,secret?,rounds?,tie_rule?}` | **是** | `ballot_id`、规则快照 | `→voting` | 院士 | 代行（须显式指定） | 待实现（选项式）；布尔轮已有行为 |
| 25 | 截止并计票 `meeting_poll_close` | 截止→计票→判定→广播 | `ballot_id?` | 否 | 计票表、判定、广播文本 | `voting→tally→resolution` | 院士 | 纪要人 | 待实现（选项式）；布尔聚合已有行为 |
| 26 | 记录决议 `meeting_result_record` | 结论写成决议（含责任人与期限） | `text:string`、`actions[{who,due}]` | **是** | 决议 id | `resolution` 内落库 | 院士 | 纪要人 | 待实现 |
| 27 | 生成纪要 `meeting_minutes` | 依事件流与议程生成纪要 | `detail?:brief/normal/full` | 否 | 纪要草稿/路径 | `→minutes` | 院士/纪要人 | 纪要人 | **现状**（纪要在写；需按新议程结构扩展） |
| 28 | 指定纪要人 `meeting_secretary_appoint` | 指定谁写纪要 | `who:string` | 否 | 授权记录 | 改权限表 | 院士 | — | 待实现 |
| 29★ | 创办任务板 `meeting_taskboard_open` | 把产物变成**可认领**任务清单 | `tasks[{subject,detail,accept,priority}]` | **是** | 任务板快照 | 建 `task_board` | 院士 | 代行（须显式指定） | 待实现 |
| 30★ | 分派任务 `meeting_task_assign` | 把任务**直接派给**某人 | `task_id`、`to`、`why?`、`due?` | 可选 | 派单回执 | 任务板 `assigned` | 院士 | 代行（须显式指定） | **现状**（`vibe_v5_assign`） |
| 31★ | 举手发言 `meeting_raise_hand` | 请求发言机会（可再次举手） | `about?:string`、`retract?:bool=false` | 可选 | 队列位置 | 入队/撤回（**不改阶段**） | 在册成员 | — | **现状**（`meeting_hand` 回复字段） |
| 32★ | 发言（含引用）`meeting_say` | 发言并可引用过去某条 | `text:string`、`quote_ref?:string`、`quote_excerpt?`、`visibility?` | **是**（`text`） | 发言 id、引用关系 | 记发言；可能推进配额 | 在册成员（受策略） | — | **现状**（`vibe_v5_say`；`quote_ref` 待补） |
| 33 | 定向质询 `meeting_challenge` | 向某人提必须回答的问题 | `to:string`、`text:string`、`timebox_ms?` | **是** | 质询记录 | `debate(directed)` 排队 | 辩论参与方 | 本章第 3 节（命令契约总表）的权限列 | 待实现 |
| 34 | 回答质询 `meeting_answer` | 回应质询 | `challenge_id:string`、`text:string` | **是** | 回答记录 | 关闭该质询或标待答 | 被质询者 | — | 待实现 |
| 35★ | 投票板投票 `meeting_poll_vote` | 在选项式投票板投票（可带理由） | `ballot_id`、`choices[]`、`note?` | 可选 | 投票回执 | 记票；可触发兜底截止 | 有表决权者 | — | **现状**（布尔票已存在；选项式待实现） |
| 36★ | 布尔概率＋理由 `meeting_boolean_vote` | 提交概率估计（0…1）＋理由 | `value:number(0..1)`、`reason:string` | **是**（理由） | 票面回执 | 记票（R10 第 4 条后方可终局） | 有表决权者 | — | **现状**（`vibe_v5_verdict`+聚合） |
| 37 | 弃权 `meeting_abstain` | 明确弃权（计入已投、不计选项） | `ballot_id`、`reason?` | 可选 | 弃权回执 | 记弃权 | 有表决权者 | — | **现状**（计票含 `abstain`） |
| 38 | 附议 `meeting_second` | 附议动议使其成立 | `motion_id:string` | 否 | 附议回执 | `motion` 计数 +1 | 在册成员 | — | 待实现 |
| 39 | 提交材料 `meeting_material_submit` | 材料挂到议程条目/议题 | `agenda_item?`、`kind:string`、`text?:string`、`path?:string` | **是**（text 或 path） | 材料 id | 材料列表更新 | 在册成员 | — | 待实现 |
| 40★ | 请求认领任务 `meeting_task_claim` | **请求**认领（需批准） | `task_id`、`plan?` | 可选 | `pending`/`granted` | 任务板 `claim_pending` | 在册成员 | — | **现状**（任务认领+CAS 修订号） |
| 41 | 请求休会/延长 `meeting_request` | 提议休会或延长 | `kind:recess/extend`、`by_ms?`、`reason` | 是（理由） | 请求回执 | 入请求队列（**不迁移**） | 在册成员 | — | 待实现 |
| 42 | 请假/离席 `meeting_leave` | 通报缺席/提前离席 | `until?:ts`、`reason?` | 可选 | 出席表更新 | `attendance` 更新 | 在册成员 | — | 待实现 |
| 43★ | 显式结束辩论（v5r 运行时工具）`vibe_v5_end_verify` | 院士显式结束对当前验证对象的辩论，使其进入**结束裁定**（R10-2a） | `target?`、`reason?`（**无 `memberId` 参数：调用者身份由调用上下文推导**） | 否 | `{ok,target,endedBy:'academician',endedByMember,endedAt,endReason,outcome,reason,process{…provisional:true},provisional:false}` | 关闭/置未定论该验证对象（写 `verdicts[target]`） | **仅院士** | 否 | **已实现**（`vibe-math-v5r/vibe-math-v5r.js`） |
| 44★ | 自述更新（v5r 运行时工具）`vibe_v5_self_report` | 成员更新**自己的**总目的/子目的/计划流程/进行态（**G6**；`overall/subgoal/plan/status`） | `overall?`、`subgoal?`、`plan?`（有序步骤数组）、`status?`、`reason?`、`source?`（`self`｜`negotiated`｜`academician`）；**一切 `…At`／`…Ms` 时间参数一律拒绝**（**时间由框架设置**） | 否（写入留痕，不产生会议内容） | `{ok,member,fields{overall,subgoal,plan,status},times{overallAt,subgoalAt,planAt},updatedBy,history[],deviation?,deduped?}` | 更新 `members[me].selfReport`（历史保留） | **仅本人**（在册成员；院士可**读**全部，默认**不**静默改写他人） | 否 | **已实现**（`vibe-math-v5r/vibe-math-v5r.js`） |
| 45 | 主持代行（v5r 运行时工具）`vibe_v5_chair_proxy` | **仅院士**可**显式指定**代行收束（D1/R4/R5）；代行**不产生新票权**、主持**不额外加权** | `member`（代行者 id，必填；亦可用别名 `proxy`）、`scope`（**唯一取值** `'close'`）、`why`（**必填**）；**一切 `…At`／`…Ms`／`until` 一律拒绝**（**时间由框架设置**） | 否（只落记录，不产生会议内容） | `{ok,chair{id,since,proxy,scope,why},chairProxy,scope,meetingId,deduped?}`（幂等 ⇒ `deduped:true` 且**不刷新** `since`） | 写入耐久 `chair` 记录＋当次会议 `meeting.chair`（`{id,since,proxy?}`）；**不改阶段、不改票面** | **仅院士** | 否 | **已落地**（`vibe-math-v5r/vibe-math-v5r.js`） |
| 46 | 程序异议（v5r 运行时工具）`vibe_v5_procedural_objection` | **在册成员**（院士/常驻研究员）可对进行中的会议提程序异议并要求主持给出理由（D2 救济通道；**不设**"全体推翻主持"） | `why`（**必填**） | **是**（`why`） | `{ok,objection{by,at,why,chairReply:null,chairReplyPending:true},chairReplyPending,meetingId,deduped?}` | 入档 `meeting.objections[]`＋当次会议纪要（耐久）；**只记录不驱动**（不改阶段/票面/收束时点） | **在册成员**（列席/受邀/临时工 ⇒ `V5_NOT_VOTER`） | 否 | **已落地**（`vibe-math-v5r/vibe-math-v5r.js`） |
| 47★ | 临时授权（v5r 运行时工具）`vibe_v5_grant` | **仅院士**把**一条被默认保留的命令**按**事件范围**临时授予**一个在册成员**（D1/D2/D6/D8）；**可授集合有界＝4**（`assign`／`prioritize`／`nudge`／`convene`）；**授权只改"默认权限表"这一层**，**绝不**改票权/阶段/票面 | `to`（被授权者 id，必填；**必须是在册成员**）、`command`（必填；四选一）、`grant_scope`（必填；`meeting`｜`verify`｜`once`；亦接受别名 `grantScope`）、`why`（**必填**）；**一切 `…At`／`…Ms`（含 `expires_at`）一律拒绝**（**时间由框架设置**；失效只由**事件**表达——**有意偏离 SPEC #13 的字面参数表**） | 是（`why`） | `{ok,grant{id,by,to,command,grantScope,at,expiresOn,revokedAt:null},deduped?}`（同值仍在生效 ⇒ `deduped:true`，**不追加台账**） | 追加**耐久台账** `grants[]`（append-only；`EV.institute` fold 白名单）＋广播一句；**不产生新票权**（`voters()`／`quorum` 不变） | **仅院士** | 否（**不可转授**，GAPS 22） | **已落地**（`vibe-math-v5r/vibe-math-v5r.js`） |
| 48 | 撤回授权（v5r 运行时工具）`vibe_v5_revoke` | **仅院士**撤回一条临时授权 ⇒ 权限**立即**回到默认表口径；**写事件并广播**（SPEC P6） | `grant_id?`（或 `to`＋`command`）、`why`（**必填**） | 是（`why`） | `{ok,revoked{id,by,to,command,grantScope,at,revokedAt,revokedBy},deduped?}` | 台账写 `revokedAt`／`revokedBy` ＋广播；**不改阶段/票面** | **仅院士** | 否 | **已落地**（`vibe-math-v5r/vibe-math-v5r.js`） |

**#47 的不可授清单**（拒绝文案，与实现**逐字一致**）：`end_verify`（**R10-2a** 仅院士）／主持与代行（**D1**；S4 的 `vibe_v5_chair_proxy` 是**唯一入口**）／**票权与代表态**（R2／R3／D3／D8）／**私密与引用面**（D6）／**授权本身**（GAPS 22 **不可转授**）。**判据＝凡由裁定级身份保证把守的命令不可授**。

**计数**：**现状 17 条**（#1、#15、#22、#27、#30、#31、#32、#35、#36、#37、#40、**#43**、**#44**、**#45**、**#46**、**#47**、**#48**）／**待实现 29 条**；其中 #27、#32、#35 与 **#14** 标注了"部分覆盖"（见上表备注）。★ 共 **23 处**（院士侧 **17**、成员侧 6），与 SPEC 一致（**#47★ 镜像 SPEC #13 的 ★**）。**#43–#48 是 v5r 运行时工具（`vibe_v5_*`），不是 `meeting_*` 平台命令** —— 归入本章以保"对外承诺单一出处"（**42 条平台命令的编号与含义不变**）。

**查看权（G6）**：**在册成员**可查看**全体在册成员**的**工作状态字段**（`overall`／`subgoal`／`plan`／`status` ＋ 各自 `overallAt`／`subgoalAt`／`planAt` 与最近更新者）；**不再是院士专属**。**G5 的边界**：只开放上述工作状态字段，**私聊内容永不进入**（他人私密永不进入）；**默认只读**；**查看留痕**（谁在何时看了谁）；列席／受邀／临时工**单列并标注**，不冒充表决成员。

**G6 成员自述字段（查看与编辑共用）**：`member`（标识）｜`overall`（总任务/总目的：**本人可改；院士可为他人设定**〔仅此字段〕；**判据＝当前 `overall` 的作者 ≠ 本次调用者** ⇒ 记 `deviation={at,by,keptValue,keptAt,keptBy}` 并**保留作者原值与旧时间**，查看面该行输出 `deviationLabel=「已偏离院士设定」`（**由 `deviation` 驱动**））｜`subgoal`（当下子目的，本人可改）｜`plan`（计划流程，有序步骤数组，本人可改）｜`status`（`planning/working/blocked/done`，可选）｜`updatedAt`/`updatedBy`（系统）＋ `overallAt`/`subgoalAt`/`planAt`（**框架自动**，见 `09` §7.0 的两类时间规范）。**写入即留痕**：`who/at/旧值/新值/reason?/source ∈ {self,negotiated}`，**旧值与旧时间不得静默丢弃**（历史可展开）。**框架不得据此自动推进流程**（R1／D10）。

---

## 4. 状态与观测字段

### 4.1 会议实体字段（规范）
`meeting_id`、`title`、`agenda[]`、`type`、`phase`、`chair`、`objections[]`、`roster[]`、`attendance{}`、`speech_policy{}`、`ballot{}`、`task_board{}`、`permissions[]`、`timeline[]`、`started_at`、`ended_at`、`duration_ms`、`recess{}`、`minutes{}`、`artifacts{}`、`status`。

**主持与救济（S4）字段语义**：`chair`＝当次会议的主持记录 `{id, since, scope, why, proxy?}` —— `id` 只能是院士；`proxy` 存在即"**代行已显式指定**"（D1）；`since` **由框架写入**。`objections[]`＝程序异议档案，每条 `{by, at, why, chairReply:null, chairReplyPending:true}` —— `chairReplyPending:true` 表示"**待主持回应**"；**未经主持回应不得写成 `false` 或省略**。代行与异议**都只记录、不驱动**（不改阶段、不改票面、不延后收束；R1/D10）。

### 4.2 `phase` 各态与允许迁移
| phase | 含义 | 允许的下一态（默认） |
|---|---|---|
| `draft` | 筹备 | `summoned`（召集） |
| `summoned` | 已召集 | `in_session`（开场）；`adjourned`（取消） |
| `in_session` | 进行中（含子阶段） | `recessed`、`adjourned` |
| `recessed` | 休会 | `in_session`、`adjourned` |
| `adjourned` | 散会 | `archived` |
| `archived` | 归档 | — |
| 子阶段 | `opening/roll_call/speech/discussion/settling/motion/debate/voting/tally/resolution/minutes` | 由院士显式动作迁移；**不得**由类型字段、计时器或过程票数触发（R10） |（注意：**计时器不得推进阶段**；而**有界触界**是 R10 第 2 条允许的停止来源，须**具名广播**且**可撤销/续期**——二者不同。）

### 4.3 `status` / `report` / `overview` 稳定字段
- **`status`**：`meeting.{id,title,type,phase,status,chair}`、`speech.{mode,order,hands_queue,current_speaker,granted{}}`、`poll.{open,question,options,cast,quorum_reached}`、`taskboard.{open,claimed,assigned}`、`attendance{}`、`side.available_commands[]`、`hints[]`。
- **`report`**：`agenda_progress[]`、`speech_points[]`、`resolutions[]`、`actions[{who,due,state}]`、`poll_results[]`、`blocking[]` ＋ **「静止提示」节**（S5：静止期间**最多一次**的提示 ＋「谁在等谁」）＋ **「临时授权」节**（S6：台账＋生效/失效状态；**只读**）。
- **`overview`**：`meetings[{id,type,phase,artifacts}]`、`tasks_summary`、`handover_pending[]` ＋ 「停滞提示」里的**本片段已提示一次**与「谁在等谁」（S5） ＋ 「临时授权（N 条生效／M 条台账）」（S6）。
- **`status` 顶层不加键**：「静止提示」（S5）与「临时授权」（S6）都只进 `report()`／`overview()`（`status` 顶层键是**冻结面**，见 第 2.3 节）；静止期间 `status.meeting` 保持 `null`（框架**不**自动召集会议）。
- **顶层键冻结**：上述键一经发布不得改名/改类型；新增只能加新键。

---

## 5. 回执与错误码规范

### 5.1 回执通用形状
- **成功**：`{ ok:true, ...业务字段 }`（关键业务字段必须可直接引用：id、phase、快照）。
- **具名拒绝**：`{ ok:false, code:'V5_*', message:'人可读中文/英文一句', retryable:bool }`；**不得**用异常穿透到调用方。
- **过程数字**：若回执携带"过程票数/计时"，必须带 `provisional:true`（尚未生效，R10 第 3 条）。

### 5.2 错误码总表（**现有**为基线，**新增**为本章登记）

> 本表是实现可达错误码的**对外映射**；**触发条件与可重试性以第 09 章第 5.2 节（插件 50 码）／第 5.3 节（共享件冻结 11 码）为准**（并集去重后 **61** 个可达码 + 4 个计划码）。
> 分组顺序：① 会议与机构（已有）→ ② 任务（已有）→ ③ 反馈 `V5_FEEDBACK_*`（12）→ ④ Lean `LEAN_*`（5）→ ⑤ 数学 `MATH_*`（11）→ ⑥ 其它可达（8）→ ⑦ 计划（4，实现 0 命中）。

| 码 | 触发 | 可重试 | 文案要点 |
|---|---|---|---|
| `V5_NO_OPEN_MEETING` | 无进行中的会议（含主持代行/程序异议） | 否 | 先开会 |
| `V5_NOT_ACADEMICIAN` | 非院士执行主持类命令或指定代行 | 否 | 仅院士（或获临时授权者） |
| `V5_NOT_VOTER` | 无表决权者投票／非在册成员提程序异议 | 否 | 列席/临时工无表决权 |
| `V5_NOT_OFFICE` | 需要所办身份的机构动作 | 否 | 由所办执行 |
| `V5_ALREADY_INVITED` | 重复邀请同一人 | 否 | 已邀请（幂等提示） |
| `V5_INVITE_NOT_TEMP` | 邀请非临时工对象 | 否 | 邀请对象受限 |
| `V5_INVALID_ARGUMENT` | 参数缺失/类型错 | **是**（修正后） | 指出缺失字段与期望类型 |
| `V5_INVALID_TIMEOUT` | 时长非法 | 是 | 时长范围 |
| `V5_INVALID_VERDICT` | 概率/选项非法 | 是 | 0…1 或选项范围 |
| `V5_MEMBER_NOT_FOUND` | 目标成员不存在 | 否 | 成员 id |
| `V5_MEMBER_LIMIT` | 编制/临时工上限 | 否 | 上限值与释放方式 |
| `V5_TASK_NOT_FOUND`、`V5_TASK_ALREADY_CLAIMED`、`V5_TASK_STALE_REVISION`、`V5_TASK_INVALID_TRANSITION`、`V5_TASK_BLOCKED`、`V5_TASK_DEPENDENCY_CYCLE`、`V5_TASK_UNAUTHORIZED`、`V5_TASK_HAS_DEPENDENTS`、`V5_TASK_DELETED` | 任务与认领 | 视情形 | 与任务系统既有语义一致 |
| `V5_INSTITUTE_STATE` | 机构状态不允许（未运行/已结题） | 否 | 当前状态与允许动作 |
| `V5_PAPER_STATE`、`V5_PAPER_CONSULT_REQUIRED` | 论文流程前置不满足 | 否 | 需先咨询/会议 |
| `V5_STATE_NOT_LOADED`、`V5_WRITE_FAILED` | 持久化 | **是** | 状态未就绪/写入失败（文件为权威） |
| **③ 反馈** `V5_FEEDBACK_DISABLED` | `feedback:'off'` 时调用反馈 | 否 | **具名拒绝**，不静默丢弃 |
| `V5_FEEDBACK_BAD_OP` | `op` 非法 | 否 | 列出允许值 |
| `V5_FEEDBACK_BAD_CATEGORY` | `category` 非法 | 否 | 列出允许值 |
| `V5_FEEDBACK_BAD_ROUTE` | `route` 非法 | 否 | 列出允许值 |
| `V5_FEEDBACK_BAD_STATUS` | `status` 非法 | 否 | 列出允许值 |
| `V5_FEEDBACK_INCOMPLETE` | 缺三要素（现象/影响/调整） | 否（补齐后） | 要求补齐三要素 |
| `V5_FEEDBACK_NEEDS_ASSESSMENT` | interpersonal 路由缺 assessment | 否 | 先想清楚影响谁 |
| `V5_FEEDBACK_NEEDS_OUTCOME` | 闭环缺 outcome | 否 | 要求回填结果 |
| `V5_FEEDBACK_NEEDS_REASON` | `dropped` 无说明 | 否 | 要求"为什么不改" |
| `V5_FEEDBACK_NO_ID` | `update` 缺 id | 否 | 指名需要 id |
| `V5_FEEDBACK_NOT_FOUND` | 条目不存在 | 否 | 附 `next` 提示 |
| `V5_FEEDBACK_FORBIDDEN` | 非发起人/非所办 | 否 | 指名有权者 |
| **④ Lean** `LEAN_NOT_FOUND` | 解析不到 `lean` | 否 | 含"was not found on PATH"类信息 |
| `LEAN_SPAWN_FAILED` | 起进程失败 | 可能 | 附底层 `message` |
| `LEAN_RUN_FAILED` | 编译运行失败 | 可能 | 附 `ms` 与文件 |
| `LEAN_TIMEOUT` | 运行超时（三元赋码） | 可能（重试/加时限） | 附 `ms` 与文件；**不得**记为通过 |
| `LEAN_FAILED` | 运行失败（三元赋码兜底分支） | 可能 | 附 `ms` 与文件 |
| **⑤ 数学** `MATH_NOT_AVAILABLE` | 模块/工具不可用 | 否 | 说明不可用原因 |
| `MATH_ENGINE_NOT_FOUND` | 本机无可用引擎 | 否 | 附试过的名单与安装建议 |
| `MATH_ENGINE_LICENSE_REQUIRED` | 已安装但许可不可用 | 否 | 仅厂商可激活 |
| `MATH_ENGINE_UNUSABLE` | 版本探针失败/超时 | 可能 | 说明探针失败原因 |
| `MATH_MISSING_PACKAGES` | 缺所需包 | 否 | 附版本策略与安装计划 |
| `MATH_TIMEOUT` | 运行超时（部分输出另行归档） | 可能 | 附超时设置 |
| `MATH_NONZERO_EXIT` | 非零退出 | 可能 | 附 exit 与 stderr 摘要 |
| `MATH_ENGINE_BAD_ARGV` | argv 形态非法 | 否 | 指出期望形态 |
| `MATH_REFUSED` | 策略/路径/文件拒绝 | 否 | 说明拒绝理由（policy/path/file） |
| `MATH_INVALID_ARGUMENT` | 参数非法（共享件缺省码） | 否 | 指名非法项与期望形状 |
| `MATH_NO_SUBPROCESS` | 宿主无 subprocess | 否 | 说明无法执行 |
| **⑥ 其它** `ACTIVATION_LIMIT_REACHED` | 宿主并发子代理上限 | 是（等子代理结束） | 附上限来源与等待建议 |
| `NO_SUBPROCESS` | 宿主无 subprocess 服务 | 否 | 说明 Lean 无法执行 |
| `V5_INTERNAL` | 断言式内部错误 | 否（缺陷） | 应视为 bug（含上下文） |
| `V5_INVALID_WRITE_SCOPE` | 写入范围越界 | 否 | 指明允许范围 |
| `V5_NOT_FOUND` | 目标文件不存在 | 否 | 指名路径 |
| `V5_PROVISIONING_CONFLICT` | 成员创建冲突（并发） | 可能（可重试一次） | 附底层原因 |
| `V5_SELF_MESSAGE` | 给自己发消息 | 否 | 收件人须是他人 |
| `V5_WAIT_ABORTED` | 等待被中止（取消/超时） | 是 | 说明中止原因 |
| **⑦ 计划（实现 0 命中）** `MEETING_PHASE_NOT_ALLOWED` | 当前 `phase` 不允许该命令（**待实现**） | 是（等阶段） | 当前阶段 + 允许的动作 |
| **计划（实现 0 命中）** `MEETING_TYPE_NOT_ENABLED` | 类型字段未启用该机制（**待实现**） | 否 | 启用的机制清单（"使能而非驱动"） |
| **计划（实现 0 命中）** `MEETING_QUORUM_NOT_MET` | 最少收集票/法定人数不足（**待实现**） | 是（重开） | 缺票数与是否可重开；**不得**据此给结论 |
| **计划（实现 0 命中）** `MEETING_PROVISIONAL` | 过程观察被误当结论（**待实现**） | 否 | 标注"尚未生效"（R10） |

### 5.3 幂等与去重
- **同参重复命令**：返回既有结果并带 `deduped:true`（例如重复邀请、重复启动同一后台作业）。
- **任务/授权类并发**：以修订号（CAS）为准，冲突返回 `V5_TASK_STALE_REVISION`，**不得**静默覆盖。

---
- **显式结束辩论（`vibe_v5_end_verify`）**：**同一 `target` 重复结束 ⇒ `{ok:true, deduped:true, …}`**（**不报错**）；第二次请求不改变任何状态，`endedBy/endedByMember/endedAt` 保持**第一次**的值。
- **不新增错误码**：`vibe_v5_end_verify` 复用 `V5_NOT_ACADEMICIAN`（非院士）与 `V5_INVALID_ARGUMENT`（当前无进行中的验证／`target` 与在验证对象不匹配），故 §4.2 码表无需新增行。
- **自述更新（`vibe_v5_self_report`）**：**同值重复提交 ⇒ `{ok:true, deduped:true, …}`**（**不报错**、不再追加历史）；不同值 ⇒ 追加一条历史并刷新该字段的 `…At`。
- **时间字段由框架设置**：请求里出现任何 `…At`／`…Ms` 字段（如 `updatedAt`／`subgoalAt`）**一律拒绝**，回执说明「**时间由框架设置**」（防伪造/防漂移，见 G6 §7.1）。
- **主持代行（`vibe_v5_chair_proxy`）**：同值重复（同 `{id, proxy, scope}`）⇒ `{ok:true, deduped:true, …}`（**不报错**、不追加历史、**不刷新 `since`**）；不同值 ⇒ 覆盖并刷新 `since`。
- **程序异议（`vibe_v5_procedural_objection`）**：同 `by + why` 重复 ⇒ `{ok:true, deduped:true, …}`（不追加）；`chairReply:null` 与 `chairReplyPending:true` 保持可见（**不得假装已回填**）。
- **临时授权（`vibe_v5_grant`）**：同 `{to, command, grant_scope}` 且**仍在生效** ⇒ `{ok:true, deduped:true, …}`（**不报错**、不追加台账、**不刷新 `at`**）；失效/撤回后同值再授 ⇒ **新增一条**（新生命周期；台账 **append-only**、不覆盖历史）。
- **撤回授权（`vibe_v5_revoke`）**：对**已撤回/已失效**的同一 `grantId` ⇒ `{ok:true, deduped:true, …}`（**不报错**）；撤回**必须写事件并广播**（SPEC P6）。
- **一次授权＝一次动作（`grant_scope='once'`）**：授权在**获批的那一刻**消费（写 `usedAt`）；同一命令内部的多步（如 `vibe_v5_assign` → 内部 `reassign`）**属同一次动作**，靠内部位置参数沿用同一次判定——**不是**"命令成功后才消费"。
- **主持代行的时间也由框架设置**：请求里出现任何 `…At`／`…Ms`（**含 `until`**）一律拒绝，回执说明「**时间由框架设置**」；代行**不自设时限**（`chair.since` 由框架写入），与上一条 G6 的时间纪律同源。

## 6. 硬约束（接口层）

| # | 约束 | 违反会发生什么 |
|---|---|---|
| H1 | **类型字段＝使能而非驱动**：决定"能做什么"，不决定"现在做什么" | 出现按类型自动进入阶段/自动收束 ⇒ 架空 R1/R4，决议来源不清 |
| H2 | **chair-first**：阶段迁移与收束只能由院士显式动作触发（或**具名广播触界**，可撤销/续期） | 出现"无人主持的推进/停止"，无法追责（R4/R10） |
| H3 | **票与发言分离**：发言不产生票权，票不因发言改变权重 | 辩论变拉票，列席者获得事实表决权（R3） |
| H4 | **沉默≠同意**：只记"未表态"，**禁止任何折算** | 门槛被"不说话的人数"注水，结论不可审计（R2/定稿 C1） |
| H5 | **过程判定 vs 结束裁定分离（R10）**：过程票数只是"当时票数的描述" | 过程数字变自动收束器，辩论被掐断（R10） |
| H6 | **时间字段两类**：墙钟（含时区）用于计划/记录；单调时长用于成本（定义见第 09 章） | 用时长当时刻或反之 ⇒ 时间线与审计被污染（R7/G2） |
| H7 | **私聊不进入引用**：引用限同一会议；跨会议只引上次决议 | 引用链爆炸、语境丢失、不可审计（D6） |
| H8 | **未达门槛＝未决**：程序性表决不得用平均替代 | 决议成立与否不可审计（R9/定稿 C3） |
| H9 | **主持不额外加权** | 程序救济失效（R5/定稿 C5） |
| H10 | **真值不越界**：平台只产出"判定结果+概率估计+依据" | 架空验证制度（R6/D9） |
| H11 | **框架只推荐、不驱动（静止）**：静止（无会议、无验证在飞、无人在飞）时**最多提示一次**（列出「谁在等谁」），**不得**自动召集会议、自动散会、自动收束或推进阶段（**R1／D10 ＋ R4／H2**）；**也不得**代替成员表态——票面／解决票／自述都不由框架写（**R2／R3／D3／D8**） | 框架替所里开会/收束/推进 ⇒ 出现"无人主持的决议"（R1/D10、R4/H2）；框架替成员表态 ⇒ 沉默被折算成票、结论不可审计（R2/R3、D3/D8） |
| H12 | **授权只改"默认权限表"这一层**：临时授权**不得**产生票权、不得改阶段/票面/收束时点，也不得打开私密与引用面；**凡由裁定级身份保证把守的命令一律不可授**（`end_verify`、主持与代行、票权与代表态、私密与引用面、授权本身）；**不可转授**（GAPS 22） | 授权变成"第二张票"或"绕过裁定级身份" ⇒ 架空 D1/D8/R2/R3/R10 与 D6；转授 ⇒ 授权链失控、不可追责 |

---

## 7. 验收判据（可写成断言）

| # | 判据（断言形式） | 建议的具名变异 |
|---|---|---|
| A1 | **命令表与注册面一一对应**：42 条规范名全部注册，且注册面无未登记的 `meeting_*` | 注册一个未登记名 ⇒ 断言红 |
| A2 | **每个错误码都可达且都登记**：表中每个码在实现里能被 raise，且实现 raise 的码都在表中 | 删掉某码的触发分支 ⇒ 断言红 |
| A3 | **每个 `status` 字段都有消费者**：字段被文档或消费者引用，无"只写不读" | 移除字段消费者 ⇒ 断言红 |
| A4 | **阶段迁移合法性**：非法迁移返回 `MEETING_PHASE_NOT_ALLOWED`，且相位不变 | 去掉相位校验 ⇒ 断言红 |
| A5 | **过程数字必须 `provisional`**：过程回执缺 `provisional:true` 即失败 | 去掉标注 ⇒ 断言红 |
| A6 | **未达标不给结论**：票数不足时不得返回任何"通过/否决"字段 | 放行结论 ⇒ 断言红 |
| A7 | **幂等可重放**：同参重复命令返回 `deduped:true` 且不产生第二次副作用 | 去掉去重 ⇒ 断言红 |

---

## 8. 判定留痕（与定稿冲突处理的记录）

| # | 事项 | 处置（**以定稿为准**） |
|---|---|---|
| L1 | A 稿使用裸动词名（`convene`/`create_ballot`/`call_on`…） | 以 `MEETING-PLATFORM-SPEC.md` 第 2 节的 `meeting_*` 为准；旧名**仅文档别名**，不注册第二套 |
| L2 | A 稿把"发言"与"引用发言"写成两条命令 | 以 SPEC 为准：**合并为 `meeting_say` + `quote_ref` 字段**（`meeting_quote` 并入） |
| L3 | A 稿把 `mute / unmute` 写在同一行 | 以 SPEC 为准：**拆为** `meeting_mute` 与 `meeting_unmute` |
| L4 | A 稿无 `meeting_flow_set`、`meeting_stop`、`meeting_time_set` | 以 SPEC 为准：**三条均为最终命令**（前两条源自 B，第三条为合并后新增） |
| L5 | SPEC #8 `meeting_stop` 措辞"停当前步/整场动作（不改阶段）"与 R10 的"停止只可能来自院士显式操作或触界" | 一致，但**明确**：`meeting_stop` 只停**动作/窗口**，**相位不变**；**不得**被用作推进或收束的替代（R10 第 2 条） |
| L6 | SPEC #23 `meeting_motion` 默认权限写作"院士；成员需授权"，而 A 稿把 `motion` 列为成员命令之一 | 一致：**成员侧需临时授权**（`meeting_grant`）；默认表为院士 |
| L7 | A 稿 `create_ballot`（创建）与 `open_ballot`（开放）分开；SPEC 合并为 `meeting_poll_open` | 以 SPEC 为准（合并）；"创建但不开放"用 `phase` 不变 + `poll.open=false` 表达 |
| L8 | `meeting_leave`(#42)/`meeting_request`(#41) 与 D8"非成员无表决权" | 一致：两者都**不产生表决权**，只更新出席/请求队列 |
| L9 | 错误码总表遗漏了实现可达码（`V5_FEEDBACK_*` 12／`LEAN_*` 5／`MATH_*` 11／其它 8 = **36**） | **已补登记**（依第 09 章第 5.2／5.3 节的实测清单，第 5.4 节要求"第 09 章的每个码都能在第 03 章找到"）：现 **61** 个可达码全部登记，另 4 个 `MEETING_*` 标为**计划（实现 0 命中）**、不删；触发条件与可重试性以第 09 章为准 |
| L10 | 章号引用残留：第 2.3 节 原写"（第 10 章执行）"；第 9 节的"任务与行动项"章号 | **已裁定**：第 2.3 节 **已改正为第 08 章**；**任务与行动项 → 第 06 章**（扩展机制章收"新增机制与管理面能力"），**迁移与兼容 → 第 08 章**（落地计划含兼容与迁移）⇒ 两条**不同指向**，非冲突 |
| L11 | 裁定 1 的落盘自查曾用字面短语"权限与临时授权"核对（0 命中）而误判为已删 | **补做并更正**：第 9 节的自指条目（原写"**第 03 章**：权限表与临时授权矩阵"）**已删除**（本章不得列为自己的下游）；教训＝核对须按**条目语义/章号**，不得只按字面短语 |
| L12 | 本次单点归一：章号引用按"章号＝文件名前缀"保义改正；节号书写口径按手册约定归一（章内小节＝第 N 节／跨章＝第 NN 章） | **已落盘**（原文作为正文末条编制记录出现 ⇒ 移入本留痕，正文不再保留该编制注记） |
| L13 | 本章第 6 节硬约束表的行号曾用 `C1–C10`，与定稿硬口径 `C1–C7` **同名不同物**（原如"（R2/C1）"中的 `C1` 指本表、`R2` 指定稿） | **已裁定并落盘**：本表行号改为 **`H1–H10`**；表内对定稿的引用一律写明 **`定稿 C#`**（现为 `（R2/定稿 C1）`、`（R9/定稿 C3）`、`（R5/定稿 C5）`）；**跨章引用 0 处**（02／05／07 的 `C1–C7` 均指定稿；附录第 11 章另有 7 行自用 `C#`，未动待裁） |

---

## 9. 与其它章的引用关系

- **第 04 章**：`phase` 迁移图与推荐流程（本章只定义 phase 名与合法迁移方向）。
- **第 05 章**：投票聚合与门槛（本章只给命令与回执形状）。
- **第 07 章**：观测与纪要（本章只给字段名）。
- **第 06 章**：任务与行动项（本章只给 `meeting_taskboard_open`/`meeting_task_assign`/`meeting_task_claim` 的契约）。
- **第 09 章**：时间字段（墙钟/单调时长的**定义**在本章只引用，不重复定义）。
- **第 08 章**：迁移与兼容（别名映射、字段冻结、版本升级路径）。
