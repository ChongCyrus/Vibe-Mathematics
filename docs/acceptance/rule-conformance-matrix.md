# v5r rule conformance matrix (generated)

**Do not edit by hand.** Source of truth: [`rules-ledger.json`](rules-ledger.json). Renderer:
`scripts/generate-rule-matrix.mjs`. Gate: `scripts/check-rules-coverage.mjs` (structural always;
`--check` is the closing gate that refuses any PARTIAL/MISSING).

## What a row claims

Every atomic requirement of `D:/wd/vibemath开发/宏观层面v5r运行规则.md` (rev `a5d9a6c1ff73`, 63 lines) answers four questions, and each answer is a **machine-re-resolved citation**
(`path::pattern`): **M** mechanism (the kernel/pack enforces it) · **T** tool (a reachable face answers it) ·
**P** prompt (live teaching says it) · **R** real run (a receipt proves it).

## Now

| status | rows | meaning |
| --- | --- | --- |
| ✅ DONE | 84 | all four citations resolve |
| ◐ PARTIAL | 2 | the row states exactly which of M/T/P/R is missing |
| ❌ MISSING | 0 | no mechanism at all yet |
| 📌 DECIDED | 0 | the user ruled it out of scope (`next` records the ruling) |

**A goal may not close while any row is ◐ or ❌.**

## A. 成员分层

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `A1` | 3 | 所办＝主代理：用户的助手、媒介、传信者 | ✅ DONE | 2/2/1/1 | — |
| `A2` | 3 | 有进展时自动唤起所办汇报 | ✅ DONE | 7/1/1/2 | — |
| `A3` | 3 | 支持用户以自然语言让所办设参数、控制研究所 | ✅ DONE | 2/2/1/1 | — |
| `A4` | 3 | 院士＝chair 席，统领研究所 | ✅ DONE | 2/1/2/1 | — |
| `A5` | 3 | 常驻研究员＝member 席 | ✅ DONE | 1/1/1/1 | — |
| `A6` | 3 | 临时工：可被雇佣、无表决权、默认不参与会议、可解雇 | ✅ DONE | 1/1/1/1 | — |
| `A7` | 3 | 临时工可被解雇 | ✅ DONE | 4/1/1/3 | — |
| `A8` | 10 | 院士、常驻研究员各自的文件（范围）：这些库属院士与常驻研究员，临时工不在其列 | ✅ DONE | 2/3/1/1 | — |
| `A9` | 3 | 临时工的用途约束：被院士或常驻研究员雇佣用于特殊任务/临时任务 | ✅ DONE | 1/1/1/2 | — |

## B. 公共文件

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `B1` | 7 | Verified 只收 p=1 的命题 | ✅ DONE | 1/1/1/1 | — |
| `B2` | 7 | 参考文献中的命题也可直接入 Verified | ✅ DONE | 2/2/1/2 | — |
| `B3` | 7 | 只有辩论能把 p 改为 1 | ✅ DONE | 2/2/1/1 | — |
| `B4` | 8 | 蓝图：总目标/技术路线/规划，按时更新 | ✅ DONE | 2/1/1/3 | 已由 r131 全证（1ms 窗口 + 两版 adopt ⇒ overdueUpdate:true/previousAgeMs>0/staleAfterMsSource:"setting"）；后续轮次只做回归。 |
| `B5` | 8 | 蓝图由院士+常驻研究员共同设计 | ✅ DONE | 2/1/1/2 | — |
| `B6` | 8 | 蓝图最终编辑权在院士 | ✅ DONE | 2/1/1/1 | — |

## C. 个人文件

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `C1` | 11 | 研究过程 progress 日志 | ✅ DONE | 1/1/1/1 | — |
| `C2` | 12 | 已尝试路线/方法及其进度 | ✅ DONE | 2/1/1/1 | — |
| `C3` | 13 | 遇障路线/尝试/方法及障碍与原因归档 | ✅ DONE | 2/1/1/2 | — |
| `C4` | 13 | 遇到的各种障碍及其原因（归档内容的一部分） | ✅ DONE | 3/1/1/2 | — |
| `C5` | 14 | 命题库：完整定义、p(0-1)、进度 | ✅ DONE | 1/1/1/2 | — |
| `C6` | 14 | 平时只记证明/证伪尝试，真正会证时才写正式证明字段 | ✅ DONE | 1/1/1/2 | 已由 r132 全证（lean-3 passed ⇒ 带 lean_job 的 proof_state:"complete" 被接受，回执带 proofStateEvidence；无证据的 p-c6b 在 r130 被具名拒）；后续轮次只做回归。 |
| `C7` | 14 | 只有写完的正式证明才能用于辩论 | ◐ PARTIAL | 2/1/1/0 | r136 真机：以一句话命题 `vibe_v5_meeting { type:"debate", subject:"<一句话>" }` 召集 ⇒ 具名 `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF`（message 说规则只允许两种形态、hint 给 record_proposition 调用）；再以 `proof_ref`+`proof_state:"complete"` 的卡为对象 ⇒ 放行且 subjectGate.form:"card" |
| `C8` | 14 | p=1 的命题要标记 verified | ✅ DONE | 1/2/1/1 | — |
| `C9` | 15 | 方法库（理论/方法/工具，抽象化产物） | ✅ DONE | 2/1/1/1 | — |
| `C10` | 16 | Lean 代码与编译结果归档 | ✅ DONE | 2/2/1/2 | — |
| `C11` | 16 | lean 通过后辩论只查描述/定义是否符合原意 | ✅ DONE | 2/1/1/1 | — |
| `C12` | 16 | 鼓励开关：鼓励把小结/定义 Lean 化 | ✅ DONE | 1/1/1/1 | — |
| `C13` | 17 | 经分派后各自负责部分的论文 | ✅ DONE | 1/1/1/3 | — |
| `C14` | 18 | 脚本文件等归档，不写 ad-hoc 脚本 | ✅ DONE | 2/1/1/2 | — |
| `C15` | 19 | 自反馈库（问题/冗余/障碍/可优化点/方案；院士含组织协作） | ✅ DONE | 1/1/1/1 | — |

## D. 平时研究推进

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `D1` | 26 | 各自推进各自的总任务 | ✅ DONE | 2/1/1/5 | 已由 r131 取证（r-1 状态板 ①②③ 先印自己那份并标注全所），office 视图逐字不变由 vmu-run111-board-own-share 钉住；后续轮次只做回归。 |
| `D2` | 27 | 三通道：邮箱/私信/群聊 | ✅ DONE | 2/1/1/2 | — |
| `D3` | 27 | 三通道紧急语义：邮箱非紧急不必立即看／私信望早回／群聊非紧急 | ✅ DONE | 2/1/1/2 | 已由 r133 全证（urgent:true ⇒ kind:"notice" + note「kind does NOT decide urgency」；收件行 ml-15 urgent:true；r-2 的非紧急行 urgent:false、kind:assign/dm；群聊 round 无 urgent）。 |
| `D4` | 28 | 状态版四字段：总任务/规划/任务完成状态/当前小任务 | ✅ DONE | 2/1/1/1 | — |
| `D5` | 28 | 四字段都含时间等基础信息 | ✅ DONE | 2/2/1/1 | — |
| `D6` | 28 | 可查看其他成员当前状态版 | ✅ DONE | 2/2/1/2 | 已由 r133 全证（两侧互指：panel get ⇒ libraryPointer.call；read_library{kind:"state"} ⇒ panelPointer.call；known:false 带 means）。 |
| `D7` | 28 | 可自己修改更新自己的状态版 | ✅ DONE | 2/1/1/1 | — |
| `D8` | 28 | 四字段按规则原文实现（字段名与语义） | ✅ DONE | 2/1/1/1 | — |

## E. 会议

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `E1` | 32 | 只能院士预约会议（可设预约时间） | ✅ DONE | 2/1/1/1 | — |
| `E2` | 32 | 到点人未到齐进入等待阶段；超时由院士决定 | ✅ DONE | 2/1/2/1 | — |
| `E3` | 32 | 只能院士召开会议并主持 | ✅ DONE | 2/1/1/2 | — |
| `E4` | 32 | 只能院士关闭会议 | ✅ DONE | 2/1/1/2 | — |
| `E5` | 32 | 院士可延长会议时长上界 | ✅ DONE | 2/1/1/1 | — |
| `E6` | 32 | 院士设会议标题 | ✅ DONE | 2/1/1/1 | — |
| `E7` | 32 | 院士设会议类型 | ✅ DONE | 1/1/1/1 | — |
| `E8` | 32 | 院士设会议议程/事项安排 | ✅ DONE | 1/1/1/1 | — |
| `E9` | 32 | 院士邀请入会成员 | ✅ DONE | 1/1/1/1 | — |
| `E10` | 32 | 院士设会议时长上界 | ✅ DONE | 3/2/1/2 | — |
| `E11` | 32 | 允许一次性连续召开多个会议 | ✅ DONE | 2/1/1/1 | — |
| `E12` | 34 | 成员命令随会议类型与身份不同 | ✅ DONE | 1/1/1/1 | — |
| `E13` | 37 | 会议类型：正常/学术交流/辩论/结题/论文交流/未来规划 | ✅ DONE | 2/1/1/1 | — |
| `E14` | 39 | 常见命令：举手 | ✅ DONE | 2/1/1/1 | — |
| `E15` | 39 | 常见命令：邀请发言 | ✅ DONE | 2/1/1/1 | — |
| `E16` | 39 | 常见命令：批量指定成员按顺序发言 | ✅ DONE | 2/2/1/1 | — |
| `E17` | 39 | 常见命令：单次发言版群聊（每人各说一次、不打断） | ✅ DONE | 1/1/1/2 | — |
| `E18` | 42 | 投票板：院士设选项与机制（最少/最多选几项） | ✅ DONE | 2/1/1/1 | — |
| `E19` | 42 | 投票板不用于辩论 | ✅ DONE | 1/1/1/1 | — |
| `E20` | 42 | 任务板：设置与认领交派 | ✅ DONE | 2/1/1/1 | — |
| `E21` | 42 | 群聊式交流：院士为群管理员，设每人权限/发言次数/禁言 | ✅ DONE | 2/1/1/1 | — |
| `E22` | 45 | 辩论额外字段：对象或文件引用 | ✅ DONE | 1/1/1/1 | — |
| `E23` | 47 | 辩论/结题表决人数＝min(用户设置, 院士+常驻) | ✅ DONE | 3/1/1/1 | — |
| `E24` | 49 | lean 已通过但 p≠1：辩论焦点是描述/定义是否符合原意 | ✅ DONE | 1/1/1/2 | 已由 r132 全证（Lean 已过 + p=0.9 的裁决汇总被 FIDELITY_ASK_REQUIRED 具名拒，hint 指辩论裁定）；后续轮次只做回归。 |
| `E25` | 51 | 辩论骨架①各成员同时独立单次表态 | ✅ DONE | 1/1/1/2 | 已由 r132 全证（群聊轮内 r-1 第二次发言被 VMU_CHAT_ALREADY_SPOKE 拒；会议面按 speeches 计分属记分板，不是这条规则的面）；后续轮次只做回归。 |
| `E26` | 51 | 辩论骨架②轮流/举手/邀请展开 | ✅ DONE | 1/1/1/1 | — |
| `E27` | 53 | 辩论骨架③结束前各成员最终裁决 | ✅ DONE | 2/1/1/1 | — |
| `E28` | 53 | 辩论骨架④全一致取该值、否则平均，并通知持有者改值 | ✅ DONE | 2/1/1/1 | — |
| `E29` | 51 | 辩论轮数由院士决定 | ✅ DONE | 2/1/1/1 | — |
| `E30` | 32 | 院士通过命令自组织会议进行中的一切内容、控制、活动（兜底授权，动词不穷举） | ✅ DONE | 1/2/1/1 | — |
| `E31` | 32 | 框架推荐的会议流程骨架只是建议：具体实施、决定、是否遵循完全由院士决定 | ✅ DONE | 2/2/1/1 | — |
| `E32` | 53 | 辩论裁定的并发通知：告诉命题卡持有者最终概率并请其改值 | ✅ DONE | 1/1/1/1 | — |
| `E33` | undefined | 会议类型包括但不限于：正常会议，学术交流，辩论，结题，论文交流，未来规划策划，...。 | ✅ DONE | 1/1/1/2 | — |
| `E34` | undefined | 会议进行中的一些特殊活动包括但不限于：投票（院士设置投票板选项与机制）、任务板设置与认领交派、群聊式交流，...。 | ✅ DONE | 2/1/1/2 | — |
| `E35` | undefined | 关于辩论：院士如果设定会议类型为辩论，则会议会有个额外字段用于设置辩论的对象或辩论对象的文件引用。 | ✅ DONE | 1/1/1/1 | — |
| `E36` | undefined | 辩论类型的会议下，v5r框架默认推荐给院士的流程是：先进行各成员同时进行「单次发言版群聊」，独立发表各自的「布尔概率([0,1])，理由，...」，再进行轮流发言或各自举手发言或邀请发言来展开辩论；辩论的轮数由院士自己决策。 | ✅ DONE | 1/1/1/1 | — |

## F. 论文阶段

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `F1` | 56 | 把原问题与所有有价值产物系统梳理 | ✅ DONE | 1/1/1/2 | — |
| `F2` | 56 | 合作撰写：分派各自内容并合并 | ✅ DONE | 2/1/1/2 | — |
| `F3` | 56 | 互审 | ✅ DONE | 1/1/1/3 | 已由 r133 全证（一致→advance→awating-editor→final finalized:true；不一致那一轮先 deliverable:false 退回 writing，再 advance 回 reviewing 并 round 2）。 |
| `F4` | 56 | 面向读者：系统/正确/完整/严谨清晰 | ✅ DONE | 1/1/1/2 | — |
| `F5` | 56 | 讨论检查无误后定稿 | ✅ DONE | 1/1/1/1 | — |

## G. 额外要求

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `G1` | 59 | 支持成员使用 Python 等数学计算工具 | ✅ DONE | 2/1/1/2 | — |
| `G2` | 59 | 所办可设工具并发数量限制防 CPU/OOM | ✅ DONE | 1/1/1/1 | — |
| `G3` | 60 | 支持人工干预研究所决策与运行 | ✅ DONE | 2/1/1/1 | — |
| `G4` | 60 | 支持断点续跑 | ✅ DONE | 1/1/1/1 | — |
| `G5` | 61 | 特殊权限/请求经所办向用户询问 | ✅ DONE | 2/1/1/1 | — |
| `G6` | 62 | 绝大多数功能走工具而非每轮末尾输出 JSON | ✅ DONE | 3/1/2/2 | 已由 r133 全证（成员回合围栏多写未声明字段 ⇒ VMU_TURN_UNKNOWN_FIELD + hint 印全部已知字段）。 |
| `G7` | 63 | 提示词与规则完全相符、自洽 | ◐ PARTIAL | 3/1/1/1 | 规则原文与活教学之间的一致性只能审：第八轮真机后由只读代理独立审计，结论 CONTRADICTIONS(5)（判据=辩论对象形态/论文定稿条件/脚本面/LaTeX 键名/形式化开关），五条已在 phase12 §229.3 修完，并把 C3/C4 两类机器化进 check-rule-parity 的 P6/P7。G7 记 DONE 的条件是：修完后**再派一次只读审计，结论零矛盾**（"审过一次通过"不是判据，"审出问题、修完再审仍干净"才是）。 |

## How to move a row

1. land the mechanism and the reachable face; 2. teach it in the live prompts; 3. run one live round whose
receipt proves the behaviour; 4. cite all four as `path::pattern` in the ledger; 5. run
`node scripts/check-rules-coverage.mjs` (structural) and `--check` (closing). A citation that stops
resolving turns the gate red — that is intended: a renamed symbol must not silently keep a claim alive.
