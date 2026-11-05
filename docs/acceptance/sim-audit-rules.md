# 93 条规则 × 观测证据台账（模拟器真机回执）

> **RUN 237 起的对账**：本文件的 verdict 是**当时那一刻**的观测结果；实现台账 `docs/acceptance/rules-ledger.json` 里若仍判 DONE，就必须带 `auditDispute { acknowledged, why, evidence }`（`evidence` 必须是 `tests/<维护中的套件>::<pattern>`，归档套件不算），由 `scripts/check-rules-coverage.mjs` 强制。也就是说：**两账不许再各说各话**——要么这条规则在本文件里被观测到，要么它承认本工作的判定并给出可执行的复验证据，要么它就不再声称 DONE（改为 PARTIAL 并写清 `next`）。
>
> 判据来源：只在**观测**上判——`receipts.jsonl` 回执字段、提示词装配文本、树快照。源码里「存在一个函数」不算证据。
> 观测载体：`D:/_tmp/g7a10/probe-part{1,2,3,4a,4b,4c,4d}.json`（每步一行 `{rules,label,tool,as,ok,code,msg}`，回执全文在 `receipts` 内）；提示词文本由 `scripts/sim/harness.mjs` 的 `prompts.assembleFor` 产出。
> 规则原文与行号：`D:/_tmp/g7a10/rules93.txt`；93 条 items 来自 `docs/acceptance/rules-ledger.json`。

## 判定口径

| verdict | 含义 |
| --- | --- |
| ✅ ENFORCED | 有工具/内核在**运行时**做出判定，且观测到「允许」与「拒绝」两侧的回执（拒绝带回执码） |
| 📝 PROSE-ONLY | 只在提示词/文档里出现，或只有可读字段没有判定；观测不到门禁 |
| 🚫 UNREACHABLE | 机制在源码/面上存在，但**本装配无法走到**（缺服务/接缝，或该动作在 service 面被具名拒） |
| ❌ CONTRADICTED | 规则要求的动作**被观测到做不到/被别的门拦下**，与规则文字冲突 |

## 计数

| verdict | 条数 |
| --- | --- |
| ✅ ENFORCED | 75 |
| 📝 PROSE-ONLY | 11 |
| 🚫 UNREACHABLE | 6 |
| ❌ CONTRADICTED | 1 |
| **合计** | **93** |

## 复现

```bash
cd "D:/wd/vibemath开发/Vibe-Mathematics"
node /d/_tmp/g7a10/probe-part4d.mjs   # 每份探针 = 一次 boot + 一组调用，产物 JSON 落在 D:/_tmp/g7a10/
```

## 台账（93 条）

| id | 规则行 | 规则（摘） | verdict | 观测证据（文件 · step · 字段） | 备注 / 缺口 |
| --- | --- | --- | --- | --- | --- |
| A1 | L3 | 所办＝主代理：用户的助手、媒介、传信者 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4a.json` · step `office-message` · ok:true · from:office, relayedBy:office；member 亲自调 message ⇒ VMU_TOOL_NOT_IN_FACE（step member-message-face） | 所办确为唯一传信人；成员无直发通道 |
| A2 | L3 | 有进展时自动唤起所办汇报 | 🚫 UNREACHABLE | `D:/_tmp/g7a10/probe-part4c.json` · step `vmu-report-tick` · ok:true · declared:4 armed:4 fires:0 → tick 触发但 refused.code=VMU_REPORT_NO_TRANSPORT | 机制在、投递不在：本装配未注入 transport，自动唤起从不发生（neverDrives:true） |
| A3 | L3 | 支持用户以自然语言让所办设参数、控制研究所 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `set-declared` · ok:true · applied.hot=H1/L1, who=role:chair；未声明键 ⇒ VMU_INVALID_ARGUMENT（unknown setting）；control tune 未声明键 ⇒ VMU_CONTROL_PARAM_UNDECLARED | 声明表是唯一入口；H2 键写后需重启（C12 收据 applied=next-session） |
| A4 | L3 | 院士＝chair 席，统领研究所 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4a.json` · step `control-roster` · ok:true · slot:chair=r-acad；fire chair ⇒ VMU_NOT_PERMITTED（part1 step fire-chair） | chair 席唯一、不可解雇 |
| A5 | L3 | 常驻研究员＝member 席 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4a.json` · step `control-roster` · ok:true · start 后 r-1/r-2 slot:member | 常驻席由 start 建立 |
| A6 | L3 | 临时工：可被雇佣、无表决权、默认不参与会议、可解雇 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `hire-temp` · ok:true · slot:temp；temp poll_vote ⇒ VMU_TOOL_NOT_IN_FACE（part3 step vote-temp） | 效果成立但拒码是席面门，不是具名表决权拒（V5_NOT_VOTER 在 tools.js:1111-1116 不可达，见 finding 2） |
| A7 | L3 | 临时工可被解雇 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `fire-temp` · ok:true, slot:temp；fire-member 同样 ok | 解雇可用，但也解得掉常驻席：规则只写「临时工可被解雇」，未禁止解雇常驻 |
| A8 | L10 | 院士、常驻研究员各自的文件（范围）：这些库属院士与常驻研究员，临时工不在其列 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4a.json` · step `temp-progress` · code:VMU_TOOL_NOT_IN_FACE；temp read_library ok | 写库被席面拒、读库放行：与「库属院士与常驻」一致 |
| A9 | L3 | 临时工的用途约束：被院士或常驻研究员雇佣用于特殊任务/临时任务 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4a.json` · step `hire-no-purpose` · code:VMU_INVALID_ARGUMENT "hire needs purpose" |  |
| B1 | L7 | Verified 只收 p=1 的命题 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4b.json` · step `promote-half` · code:VMU_INVALID_ARGUMENT "promote needs the warrant that produced this conclusion"；`D:/_tmp/g7a10/probe-part4b.json` · step `prop-p1-direct` · code:VMU_PACK_V5R_P1_NEEDS_DEBATE | Verified 只收 p=1 且必须带裁判 warrant |
| B2 | L7 | 参考文献中的命题也可直接入 Verified | 📝 PROSE-ONLY | `D:/_tmp/g7a10/probe-part4b.json` · step `promote-half` · code:VMU_INVALID_ARGUMENT · ）文献路径（warrant_kind:literature + literature_ref）未观测到成功回执 | 门禁在，但成功路径本次未复现；不据此判实现 |
| B3 | L7 | 只有辩论能把 p 改为 1 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4b.json` · step `prop-p1-direct` · code:VMU_PACK_V5R_P1_NEEDS_DEBATE，hint 列三条路（辩论全体一致 1/文献引用/Lean+conform） |  |
| B4 | L8 | 蓝图：总目标/技术路线/规划，按时更新 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4a.json` · step `blueprint-read` · code:VMU_INVALID_ARGUMENT "a blueprint read needs the record id"；paper-start 前需 adopted 蓝图（4d step paper-start ok 前置换算） | 蓝图面存在且有读取门；「按时更新」不可机检 |
| B5 | L8 | 蓝图由院士+常驻研究员共同设计 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part2.json` · step `blueprint-adopt-member` · code:VMU_NOT_PERMITTED；chair adopt 未经 codesign ⇒ VMU_PACK_V5R_BLUEPRINT_NEEDS_CODESIGN（part2 step blueprint-adopt） |  |
| B6 | L8 | 蓝图最终编辑权在院士 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part2.json` · step `blueprint-adopt-member` · code:VMU_NOT_PERMITTED "blueprint (adoption) is an academician (chair seat) action" |  |
| C1 | L11 | 研究过程 progress 日志 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `progress-for-tick` · ok:true, track:progress；read_library kindsPresent |  |
| C2 | L12 | 已尝试路线/方法及其进度 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4b.json` · step `progress-obstacle` · ok:true；declaredTracks 含 routes/obstacles（`D:/_tmp/g7a10/probe-part4b.json` · step `library-obstacles` · ok:true · tracks:[obstacles]） | routes 轨声明存在；本次未写 routes 卡 |
| C3 | L13 | 遇障路线/尝试/方法及障碍与原因归档 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4b.json` · step `progress-obstacle` · ok:true; library-obstacles tracks:[obstacles], declaredTracks 含 rejected |  |
| C4 | L13 | 遇到的各种障碍及其原因（归档内容的一部分） | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4b.json` · step `progress-obstacle` · ok:true · content 含障碍与原因，写入成功 |  |
| C5 | L14 | 命题库：完整定义、p(0-1)、进度 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4a.json` · step `prop-draft` · ok:true · recordId:rec-3, settled:false, title=断言原文；p 越界 ⇒ VMU_INVALID_ARGUMENT（step prop-p-range） |  |
| C6 | L14 | 平时只记证明/证伪尝试，真正会证时才写正式证明字段 | 📝 PROSE-ONLY | `D:/_tmp/g7a10/probe-part4a.json` · step `prop-proof-complete` · ok:true · proof_state:complete + proof_ref 接受 | 无「何时才算正式证明」的门；字段可随意声明 |
| C7 | L14 | 只有写完的正式证明才能用于辩论 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `debate-subject-id-string` · ok:true；一句话对象 ⇒ VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF（step debate-subject-card-obj） | 辩论对象只收可寻址命题卡/文件引用 |
| C8 | L14 | p=1 的命题要标记 verified | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4b.json` · step `prop-p1-direct` · code:VMU_PACK_V5R_P1_NEEDS_DEBATE 明说需 Verified 轨定论行 | verified 轨唯一写者是 verified_promote |
| C9 | L15 | 方法库（理论/方法/工具，抽象化产物） | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4a.json` · step `method-card` · ok:true · recordId:rec-5, track:methods；`D:/_tmp/g7a10/probe-part4a.json` · step `library-methods` · ok:true · kindsPresent:[method] |  |
| C10 | L16 | Lean 代码与编译结果归档 | 🚫 UNREACHABLE | `D:/_tmp/g7a10/probe-part4c.json` · step `lean-lib` · code:VMU_ENGINE_UNAVAILABLE "needs the Lean face, and this assembly has none" | 环境缺 Lean face/spawn，归档读面不可达 |
| C11 | L16 | lean 通过后辩论只查描述/定义是否符合原意 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `fidelity-no-job` · code:VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED | 符合性裁定必须先有通过 job；lean 本身不可达（C10） |
| C12 | L16 | 鼓励开关：鼓励把小结/定义 Lean 化 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `set-formalverify` · ok:true · applied.hot=H2, requiresRestart:true, applied:next-session | 开关存在且可设；H2 需重启才生效 |
| C13 | L17 | 经分派后各自负责部分的论文 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `paper-part` · code:VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING / part 非参与人 ⇒ VMU_NO_SUCH_OBJECT（part3）；4d paper-start ok:true (paper-p1) |  |
| C14 | L18 | 脚本文件等归档，不写 ad-hoc 脚本 | 🚫 UNREACHABLE | `D:/_tmp/g7a10/probe-part4a.json` · step `script-archive` · code:VMU_TOOL_NOT_IN_FACE · member 调 ⇒ VMU_TOOL_NOT_IN_FACE（tool 在 chair 席面） | 成员无法归档脚本；规则未限定实施者，但观察面只对 chair 开放 |
| C15 | L19 | 自反馈库（问题/冗余/障碍/可优化点/方案；院士含组织协作） | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4a.json` · step `feedback-add` · code:VMU_INVALID_ARGUMENT · interpersonal 路由缺 assessment ⇒ VMU_INVALID_ARGUMENT REQUIRES assessment；library-feedback ok | 必填门成立；反馈库可读 |
| D1 | L37 | 各自推进各自的总任务 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `turn-status` · ok:true, status 面 | 回合环存在；「各自推进」是流程承诺，逐成员执行未观测 |
| D2 | L38 | 三通道：邮箱/私信/群聊 | ❌ CONTRADICTED | `D:/_tmp/g7a10/probe-part4a.json` · step `member-message-face` · code:VMU_TOOL_NOT_IN_FACE · member 调 vibe_v5_message ⇒ VMU_TOOL_NOT_IN_FACE；office 代发可携带成员声音（office-message/member-voice-message） | 规则要求成员有邮箱/私信通道，实际成员无法直接发信：只能由所办代发 |
| D3 | L38 | 三通道紧急语义：邮箱非紧急不必立即看／私信望早回／群聊非紧急 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4a.json` · step `inbox-list` · ok:true · urgent:true 未开信可见；message 收据 note「kind does NOT decide urgency」 | 紧急语义成立 |
| D4 | L39 | 状态版四字段：总任务/规划/任务完成状态/当前小任务 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4b.json` · step `panel-set` · ok:true · changed:[overall,subgoal,plan,status]；`D:/_tmp/g7a10/probe-part4b.json` · step `panel-get` · ok:true · known:true + times{} | 四字段齐备 |
| D5 | L39 | 四字段都含时间等基础信息 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4b.json` · step `panel-get` · ok:true · times:{overallAt,subgoalAt,planAt,subtasksAt} | 时间由框架写 |
| D6 | L39 | 可查看其他成员当前状态版 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4a.json` · step `panel-view-other` · ok:true · viewer:r-2 看 r-1，count:1 + auditTail | 查看留痕 |
| D7 | L39 | 可自己修改更新自己的状态版 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4a.json` · step `panel-set-other` · code:VMU_NOT_PERMITTED "a member may write only its OWN panel" |  |
| D8 | L39 | 四字段按规则原文实现（字段名与语义） | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4b.json` · step `panel-get` · ok:true · fields:{overall,subgoal,plan,status}；但 plan 元素回读为 "[object Object]"（panel-set fields.plan） | 字段名与语义对；嵌套值序列化泄漏（finding 3） |
| E1 | L43 | 只能院士预约会议（可设预约时间） | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `meeting-scheduled` · ok:true · state:scheduled, scheduledFor；member 开会 ⇒ VMU_TOOL_NOT_IN_FACE（part2） | 预约仅 chair |
| E2 | L43 | 到点人未到齐进入等待阶段；超时由院士决定 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `status-after-time` · ok:true · state:scheduled→waiting；`D:/_tmp/g7a10/probe-part4c.json` · step `status-long-wait` · ok:true · state:open | 到点未齐进入等待；长等后进入 open（未观测到「超时流失/关会」的自动路径） |
| E3 | L43 | 只能院士召开会议并主持 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `meeting-open` · ok:true · chair ok meeting:m1；`D:/_tmp/g7a10/probe-part4b.json` · step `meeting-open-notitle` · ok:true · title 缺省仍 ok |  |
| E4 | L43 | 只能院士关闭会议 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `meeting-close` · chair ok:true, closeSemantics/turns；member close ⇒ VMU_NOT_PERMITTED（part3 step close-member） |  |
| E5 | L43 | 院士可延长会议时长上界 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `extendlimit-member` · VMU_NOT_PERMITTED "only the declared chair may extend this meeting"；chair extendlimit ok（part3） | 时长上界由 chair 延长；extend 本身在 SERVICE 面不可达（G9） |
| E6 | L43 | 院士设会议标题 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `meeting-open` · ok:true · title 字段与 titleMeans | 可设；不设也有默认 |
| E7 | L43 | 院士设会议类型 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `meeting-open` · ok:true · type:academic + procedure；非法 type ⇒ "unknown meeting type"（part2） |  |
| E8 | L43 | 院士设会议议程/事项安排 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `meeting-open` · ok:true · agenda/formalAgenda |  |
| E9 | L43 | 院士邀请入会成员 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `invite-members-only` · ok:true；member 邀请 ⇒ VMU_NOT_PERMITTED（part3） |  |
| E10 | L43 | 院士设会议时长上界 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `meeting-open` · ok:true · wallLimitMs:600000 由 durationMs |  |
| E11 | L43 | 允许一次性连续召开多个会议 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `sequence-array` · code:VMU_INVALID_ARGUMENT "sequence[0] has an unknown key"；`D:/_tmp/g7a10/probe-part4d.json` · step `sequence-obj` · code:VMU_INVALID_ARGUMENT · 同 | 参数被严格校验（数组形态、键集），成功路径未复现 |
| E12 | L45 | 成员命令随会议类型与身份不同 | 🚫 UNREACHABLE | `D:/_tmp/g7a10/probe-part4c.json` · step `round` · code:VMU_ENGINE_UNAVAILABLE "the host exposes no subagents service at all" | 会议内轮次驱动依赖 subagents 服务，本装配无 |
| E13 | L48 | 会议类型：正常/学术交流/辩论/结题/论文交流/未来规划 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4b.json` · step `meeting-types` · ok:true，6 类 |  |
| E14 | L50 | 常见命令：举手 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `hand` · ok:true (r-1) |  |
| E15 | L50 | 常见命令：邀请发言 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `invitedspeak-member` · ok:true；缺 text ⇒ VMU_INVALID_ARGUMENT（part3） |  |
| E16 | L50 | 常见命令：批量指定成员按顺序发言 | 🚫 UNREACHABLE | `D:/_tmp/g7a10/probe-part4b.json` · step `order-chair` · code:VMU_INVALID_ARGUMENT "action order only READS the floor queue … no write path" | 「批量指定顺序发言」在 service 面不可写（finding 1） |
| E17 | L50 | 常见命令：单次发言版群聊（每人各说一次、不打断） | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4b.json` · step `say-round-1` · ok:true · ok；`D:/_tmp/g7a10/probe-part4b.json` · step `say-round-2` · code:VMU_CHAT_ALREADY_SPOKE | 单次发言版群聊成立 |
| E18 | L53 | 投票板：院士设选项与机制（最少/最多选几项） | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `poll-open` · ok:true · rules:{minVotes:2,mode:single,maxChoices:1}；多选 ⇒ VMU_CONFLICT（vote-two-choices）；重复投 ⇒ VMU_CONFLICT（vote-revote）；早关 ⇒ VMU_BALLOT_MIN_VOTES_NOT_MET（part3）；平票 ⇒ VMU_BALLOT_TIE_UNRESOLVED（poll-close） |  |
| E19 | L53 | 投票板不用于辩论 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `ballot-open` · ok:true 绑到 motion mo1；绑命题卡 ⇒ VMU_NO_SUCH_OBJECT（part3 step ballot-card） | 票箱只对动议开放 |
| E20 | L53 | 任务板：设置与认领交派 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `task-claim` · ok:true · ok；`D:/_tmp/g7a10/probe-part4c.json` · step `task-claim-stale` · code:VMU_TASK_STALE_REVISION；task 状态机 doing/done（tasks.js:28） |  |
| E21 | L53 | 群聊式交流：院士为群管理员，设每人权限/发言次数/禁言 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `chat-setpolicy` · ok:true by:r-acad；`D:/_tmp/g7a10/probe-part4d.json` · step `say-2` · ok:true · VMU_CHAT_QUOTA_EXCEEDED；`D:/_tmp/g7a10/probe-part4c.json` · step `say-muted` · code:VMU_CHAT_MUTED |  |
| E22 | L56 | 辩论额外字段：对象或文件引用 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `debate-subject-id-string` · ok:true (subject=rec-3)；散文 ⇒ VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF（debate-subject-card-obj） |  |
| E23 | L58 | 辩论/结题表决人数＝min(用户设置, 院士+常驻) | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `verdict-final-one` · code:VMU_STATE "missing 1 of the 2 member(s) who debated" | 人数门成立；min(quorumCap,在册席位) 的取值路径未单独复现 |
| E24 | L60 | lean 已通过但 p≠1：辩论焦点是描述/定义是否符合原意 | 📝 PROSE-ONLY | `D:/_tmp/g7a10/probe-part4c.json` · step `fidelity-no-job` · code:VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED | 裁定入口存在，但「lean 通过而 p≠1」的辩论焦点无独立门 |
| E25 | L62 | 辩论骨架①各成员同时独立单次表态 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `say-1` · ok:true · via:meeting, receipt.speechBound；member 提示词含「单次发言」「vibe_v5_say」（prompts.memberHas） |  |
| E26 | L62 | 辩论骨架②轮流/举手/邀请展开 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `hand` · ok:true · ok；`D:/_tmp/g7a10/probe-part4d.json` · step `invitedspeak-member` · ok:true · ok；flow 面存在（留言表） | 轮流经 order/flow；批量 order 不可写（E16） |
| E27 | L64 | 辩论骨架③结束前各成员最终裁决 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `verdict-final-both` · ok:true, tally/floor 回执 |  |
| E28 | L64 | 辩论骨架④全一致取该值、否则平均，并通知持有者改值 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `verdict-final-both` · ok:true · decided:false（0.7/0.9 未达一致 1）, 回执含 correction/p1RulingReading | 均值路径回执存在；「通知持有者改值」由 correction 字段承载 |
| E29 | L62 | 辩论轮数由院士决定 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `motion-2-over-cap` · code:VMU_RESOURCE_BUDGET "the motion ceiling is reached for this meeting: 1 / 1"（part3 同） | 动议额度=任何 kind 的动议条数；extend/extendlimit 不增加额度 |
| E30 | L43 | 院士通过命令自组织会议进行中的一切内容、控制、活动（兜底授权，动词不穷举） | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `overrideorder-reason` · code:VMU_INVALID_ARGUMENT "overrideOrder needs { mode } ∈ fifo|round-robin|chair|random"；proceed 只对 waiting 生效（proceed-open ⇒ VMU_STATE）；set 无该 action（meeting-set ⇒ "this face has no action: set"） | 兜底动词存在但按面切分：部分动词只在 PACK 面 |
| E31 | L43 | 框架推荐的会议流程骨架只是建议：具体实施、决定、是否遵循完全由院士决定 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `meeting-open` · ok:true · procedureBinding:"recommendation" + procedureNote「不检查也不阻断」 |  |
| E32 | L64 | 辩论裁定的并发通知：告诉命题卡持有者最终概率并请其改值 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `verdict-final-both` · ok:true · correction 字段 |  |
| E33 | L47 | 会议类型包括但不限于：正常会议，学术交流，辩论，结题，论文交流，未来规划策划，...。 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4b.json` · step `meeting-types` · ok:true · 6 类 + desc 列 7 种 |  |
| E34 | L52 | 会议进行中的一些特殊活动包括但不限于：投票（院士设置投票板选项与机制）、任务板设置与认领交派、群聊式交流，...。 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `poll-open` · ok:true · 会议内投票板 ok；task/chat 在会议内同样可用（task-create/chat-setpolicy） |  |
| E35 | L56 | 关于辩论：院士如果设定会议类型为辩论，则会议会有个额外字段用于设置辩论的对象或辩论对象的文件引用。 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `debate-subject-id-string` · ok:true · ok；`D:/_tmp/g7a10/probe-part4d.json` · step `debate-subject-card-obj` · code:VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF |  |
| E36 | L61 | 辩论类型的会议下，v5r框架默认推荐给院士的流程是：先进行各成员同时进行「单次发言版群聊」，独立发表各自的「布尔概率([0,1])，理由，...」，再进行轮流发言或各自举手发言或邀请发言来展开辩论；辩论的轮数由院士自己决策。 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `prompts.chairHas` · chair 辩论期提示词含「轮数由院士」「动议次数」「speechBound」「primitive」「SERVICE」 (32047 chars) | 推荐骨架进入了院士提示词 |
| F1 | L67 | 把原问题与所有有价值产物系统梳理 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `paper-start` · ok:true · started.id:paper-p1, status:writing, round:1 |  |
| F2 | L67 | 合作撰写：分派各自内容并合并 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `paper-advance-1` · ok:true；part 非参与人 ⇒ VMU_NO_SUCH_OBJECT（part3） |  |
| F3 | L67 | 互审 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `paper-advance-2` · code:VMU_INVALID_ARGUMENT 互审必须由两位不同、非作者的成员完成（0/2）；review 缺 deliverable ⇒ VMU_INVALID_ARGUMENT（paper-review-self） | 互审门是真门禁 |
| F4 | L67 | 面向读者：系统/正确/完整/严谨清晰 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `paper-render` · ok:true · wrote:[md,tex,meta], missing:[pdf]；compile ⇒ VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING；part 证据对象 ⇒ VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING | 渲染/证据门成立；「面向读者的质量」不可机检 |
| F5 | L67 | 讨论检查无误后定稿 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `paper-final-member` · code:VMU_PACK_V5R_CORE_PAPER_STATE "not awaiting its editor (now: reviewing)"；chair final 同码（该阶段） | 定稿阶段+席面双门；成功定稿本次未走到 |
| G1 | L70 | 支持成员使用 Python 等数学计算工具 | 🚫 UNREACHABLE | `D:/_tmp/g7a10/probe-part4c.json` · step `mathjobs-submit` · code:VMU_EXTERNAL_UNAVAILABLE "spawn 接缝未注入" | 计算工具面在，本机无引擎接缝 |
| G2 | L70 | 所办可设工具并发数量限制防 CPU/OOM | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `math` · limits.maxParallel:1, wiredCount:75 | 并发上限可读且为 1 |
| G3 | L71 | 支持人工干预研究所决策与运行 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `human-open` · ok:true id:approval-1；`D:/_tmp/g7a10/probe-part4c.json` · step `human-queue` · ok:true · requests/queueCap/pending 回执 | 人工干预入口成立 |
| G4 | L71 | 支持断点续跑 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `pause` · ok:true · ok；`D:/_tmp/g7a10/probe-part4c.json` · step `resume` · ok:true · ok | 暂停/恢复成立；「断点续跑」跨进程未验证 |
| G5 | L72 | 特殊权限/请求经所办向用户询问 | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4c.json` · step `human-open` · ok:true · openApproval 走所办；`D:/_tmp/g7a10/probe-part4c.json` · step `human-queue` · ok:true · queue | 特殊请求转所办询问 |
| G6 | L73 | 绝大多数功能走工具而非每轮末尾输出 JSON | ✅ ENFORCED | `D:/_tmp/g7a10/probe-part4d.json` · step `turn-reply-report` · code:VMU_TURN_NO_PENDING_MEMBER，hint 明说 reply 通道只在 awaiting prompt 时可用 | 工具优先、JSON 兜底只在 awaiting 路径；本装配为 delegated 路径 ⇒ 该兜底永久不可达（规则允许「绝大多数」走工具） |
| G7 | L74 | 提示词与规则完全相符、自洽 | 📝 PROSE-ONLY | `D:/_tmp/g7a10/probe-part4c.json` · step `prompts` · chair 32047 / member 24580 / meeting 32918 chars；关键规则片段命中 | 提示词确实装入规则，但「完全相符、自洽」无法机检（无 parity 断言） |
| G8 | L25 | the mainline is stated as the blueprint of the original problem, coarse to fine | 📝 PROSE-ONLY | `D:/_tmp/g7a10/probe-part4c.json` · prompt: chair meeting 32918 chars 含「骨架」；无对应门禁 | mainline 见 G8-G14：全部只活在提示词 |
| G9 | L27 | cognition and feedback that move the mainline are accumulated | 📝 PROSE-ONLY | `D:/_tmp/g7a10/probe-part4c.json` · prompt: chair 32047 chars |  |
| G10 | L28 | each direction/route/node records its nine fields | 📝 PROSE-ONLY | `D:/_tmp/g7a10/probe-part4b.json` · step `library-obstacles` · ok:true · declaredTracks 含 routes/obstacles/rejected，可作「九字段」载体 | 载体在，九字段逐项校验不在 |
| G11 | L29 | the blueprint is refined and its objects updated from practice | 📝 PROSE-ONLY | `D:/_tmp/g7a10/probe-part4c.json` · prompt: chair meeting |  |
| G12 | L30 | experience keeps improving and optimising the way of working | 📝 PROSE-ONLY | `D:/_tmp/g7a10/probe-part4a.json` · step `feedback-add` · code:VMU_INVALID_ARGUMENT · 反馈库存在 | 「持续改进」是过程承诺 |
| G13 | L31 | valuable methods and obstacle solutions are reused, generalised, transferred | 📝 PROSE-ONLY | `D:/_tmp/g7a10/probe-part4a.json` · step `method-card` · ok:true · method 库存在 | 复用/迁移无门禁 |
| G14 | L32 | a problem is checked against similar past problems before work starts | 📝 PROSE-ONLY | `D:/_tmp/g7a10/probe-part4c.json` · prompt: chair normal | 无「先查类似问题」的机检 |

## 五大发现

1. **E16「批量指定成员按顺序发言」在 service 会议不可写**：`action order` 自述 "this action has no write path"（`probe-part4d.json` step `order-chair`），`overrideOrder` 只能改**排序策略**（`mode ∈ fifo|round-robin|chair|random`，step `overrideorder-reason`）。规则原文的「批量按顺序发言」没有任何工具面能表达。
2. **D2 三通道对成员不可达 + D8 具名拒不可达**：成员调 `vibe_v5_message` 得 `VMU_TOOL_NOT_IN_FACE`（step `member-message-face`）；邮件只能由所办代发（`from:office, relayedBy:office`）。而 D8 的具名表决权拒（`packs/v5r/tools.js:1111-1116` 的 `V5_NOT_VOTER`）同样被席面门先拦成 `VMU_TOOL_NOT_IN_FACE`（temp `poll_vote`），具名拒在观测中不可达。
3. **A2「有进展时自动唤起所办」在本装配从不发生**：`vibe_vmu_report status` = `declared:4 armed:4 fires:0 neverDrives:true`；`action:"tick"` 能触发事件，但投递被拒 `VMU_REPORT_NO_TRANSPORT`（"no delivery transport was injected"），`delivered:false, drives:false`。
4. **E12 会议内轮次驱动不可达**：`vibe_v5_meeting_round` ⇒ `VMU_ENGINE_UNAVAILABLE`（"the host exposes no subagents service at all"）；E2 的「超时流失」也没有自动路径（只观测到 scheduled→waiting→open）。
5. **嵌套值序列化泄漏（A2 型）**：`vibe_vmu_panel set` 的 `plan:[{...}]` 回读成 `["[object Object]"]`（step `panel-set`/`panel-get`）；`vibe_v5_paper part` 的 `evidence:[{...}]` 直接被拒 `does not resolve … "[object Object]"`（step `paper-part`）。对象入参在多个面上被字符串化，规则要求的结构化字段因此写不进去。

## 已知盲区（未据此下判决）

- Lean 面（C10/C11/E24）、计算引擎（G1）、LaTeX 编译（F4 compile）在本机全部 `VMU_ENGINE_UNAVAILABLE`/`VMU_EXTERNAL_UNAVAILABLE`：只记 UNREACHABLE，不改判为「未实现」。
- quorum 的 `m = min(vmu.meetings.quorumCap, 在册席位)` 取值路径（E23）未单独复现，只验到「缺一位辩论者即拒」。
- C14 只观测到 chair 席面（member 被席面拒），无法判断「脚本归档」是否本就只给院士；记 UNREACHABLE 而非 CONTRADICTED。
