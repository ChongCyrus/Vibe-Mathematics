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
| ✅ DONE | 74 | all four citations resolve |
| ◐ PARTIAL | 12 | the row states exactly which of M/T/P/R is missing |
| ❌ MISSING | 0 | no mechanism at all yet |
| 📌 DECIDED | 0 | the user ruled it out of scope (`next` records the ruling) |

**A goal may not close while any row is ◐ or ❌.**

## A. 成员分层

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `A1` | 3 | 所办＝主代理：用户的助手、媒介、传信者 | ✅ DONE | 2/2/1/1 | — |
| `A2` | 3 | 有进展时自动唤起所办汇报 | ✅ DONE | 2/1/1/2 | — |
| `A3` | 3 | 支持用户以自然语言让所办设参数、控制研究所 | ✅ DONE | 2/2/1/1 | — |
| `A4` | 3 | 院士＝chair 席，统领研究所 | ✅ DONE | 2/1/2/1 | — |
| `A5` | 3 | 常驻研究员＝member 席 | ✅ DONE | 2/1/1/1 | — |
| `A6` | 3 | 临时工：可被雇佣、无表决权、默认不参与会议、可解雇 | ✅ DONE | 1/1/1/1 | — |
| `A7` | 3 | 临时工可被解雇 | ◐ PARTIAL | 9/1/1/0 | r117：成员在**首个**回合里 hire 临时工 → `hiredBy` 是该成员（不再是 null）；同成员 fire 它 → `ownership:"own"` 且放行；另一成员在**首个**回合 fire 它 → 具名拒 `VMU_NOT_PERMITTED` + `ownership:"not-own"`；无法映射的非 root 会话 → `VMU_FIRE_CALLER_UNKNOWN`；root/office 调用 → 放行且 `ownership:"unrecorded"`。 |
| `A8` | 10 | 院士、常驻研究员各自的文件（范围）：这些库属院士与常驻研究员，临时工不在其列 | ◐ PARTIAL | 3/3/1/0 | r114：临时工经 vibe_vmu_records {action:"append", kind:"proposition"} 写命题 → 具名拒 VMU_TOOL_NOT_IN_FACE 且回执带 seatFace:{member:"r-t1",tool:"vibe_v5_record_proposition"}；再让它用自己席位看得见的写面做临时任务成功。两条逐字进台账。 |
| `A9` | 3 | 临时工的用途约束：被院士或常驻研究员雇佣用于特殊任务/临时任务 | ✅ DONE | 1/1/1/1 | — |

## B. 公共文件

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `B1` | 7 | Verified 只收 p=1 的命题 | ✅ DONE | 1/1/1/1 | — |
| `B2` | 7 | 参考文献中的命题也可直接入 Verified | ✅ DONE | 2/2/1/2 | — |
| `B3` | 7 | 只有辩论能把 p 改为 1 | ◐ PARTIAL | 2/2/1/0 | r113：带 literature_ref 的 p=1 写入 → 回执 p1Route:"literature"；多数决 p=1 → 具名拒 VMU_PACK_V5R_P1_NEEDS_DEBATE 且回执带 p1Routes。两条逐字进台账。 |
| `B4` | 8 | 蓝图：总目标/技术路线/规划，按时更新 | ✅ DONE | 2/1/1/1 | — |
| `B5` | 8 | 蓝图由院士+常驻研究员共同设计 | ✅ DONE | 2/1/1/1 | — |
| `B6` | 8 | 蓝图最终编辑权在院士 | ✅ DONE | 2/1/1/1 | — |

## C. 个人文件

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `C1` | 11 | 研究过程 progress 日志 | ✅ DONE | 1/1/1/1 | — |
| `C2` | 12 | 已尝试路线/方法及其进度 | ✅ DONE | 2/1/1/1 | — |
| `C3` | 13 | 遇障路线/尝试/方法及障碍与原因归档 | ✅ DONE | 2/1/1/2 | — |
| `C4` | 13 | 遇到的各种障碍及其原因（归档内容的一部分） | ◐ PARTIAL | 2/1/1/0 | r113：写 obstacles 卡（含原因段与 progress 行）→ expand 读回正文两段都在，且 progress 行未被吞；逐字进台账。 |
| `C5` | 14 | 命题库：完整定义、p(0-1)、进度 | ✅ DONE | 2/1/1/1 | — |
| `C6` | 14 | 平时只记证明/证伪尝试，真正会证时才写正式证明字段 | ✅ DONE | 1/1/1/1 | — |
| `C7` | 14 | 只有写完的正式证明才能用于辩论 | ✅ DONE | 2/1/1/1 | — |
| `C8` | 14 | p=1 的命题要标记 verified | ◐ PARTIAL | 2/2/1/0 | r113：p=1 命题卡单卡读与列表读都带 verifiedRef:{id,title,at}；未验证卡带 verifiedRef:null + means（“没在 Verified 库里找到”）。逐字进台账。 |
| `C9` | 15 | 方法库（理论/方法/工具，抽象化产物） | ✅ DONE | 2/1/1/1 | — |
| `C10` | 16 | Lean 代码与编译结果归档 | ◐ PARTIAL | 2/2/1/0 | r113：lean_run → lean_archive 后 lean_read 读到 outcome/exitCode/jobId/diagnosticsTail；未跑过的文件读出 outcome:"not-measured" + means。逐字进台账。 |
| `C11` | 16 | lean 通过后辩论只查描述/定义是否符合原意 | ✅ DONE | 2/1/1/1 | — |
| `C12` | 16 | 鼓励开关：鼓励把小结/定义 Lean 化 | ✅ DONE | 1/1/1/1 | — |
| `C13` | 17 | 经分派后各自负责部分的论文 | ✅ DONE | 1/1/1/3 | — |
| `C14` | 18 | 脚本文件等归档，不写 ad-hoc 脚本 | ✅ DONE | 2/1/1/2 | — |
| `C15` | 19 | 自反馈库（问题/冗余/障碍/可优化点/方案；院士含组织协作） | ✅ DONE | 1/1/1/1 | — |

## D. 平时研究推进

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `D1` | 26 | 各自推进各自的总任务 | ◐ PARTIAL | 2/1/1/0 | r113：两个成员各拿到自己的 [状态板]，② 行读到「你的（r-1，未完成 N 条）」而所办（无 member）读不到该行；① 行带 scopeNote「全所总任务」。逐字进台账。 |
| `D2` | 27 | 三通道：邮箱/私信/群聊 | ✅ DONE | 2/1/1/2 | — |
| `D3` | 27 | 三通道紧急语义：邮箱非紧急不必立即看／私信望早回／群聊非紧急 | ✅ DONE | 2/1/1/1 | — |
| `D4` | 28 | 状态版四字段：总任务/规划/任务完成状态/当前小任务 | ✅ DONE | 2/1/1/1 | — |
| `D5` | 28 | 四字段都含时间等基础信息 | ✅ DONE | 2/2/1/2 | — |
| `D6` | 28 | 可查看其他成员当前状态版 | ✅ DONE | 1/1/1/1 | — |
| `D7` | 28 | 可自己修改更新自己的状态版 | ✅ DONE | 2/1/1/2 | — |
| `D8` | 28 | 四字段按规则原文实现（字段名与语义） | ✅ DONE | 2/1/1/1 | — |

## E. 会议

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `E1` | 32 | 只能院士预约会议（可设预约时间） | ✅ DONE | 2/1/1/1 | — |
| `E2` | 32 | 到点人未到齐进入等待阶段；超时由院士决定 | ✅ DONE | 2/1/2/1 | — |
| `E3` | 32 | 只能院士召开会议并主持 | ✅ DONE | 2/1/1/1 | — |
| `E4` | 32 | 只能院士关闭会议 | ✅ DONE | 2/1/1/1 | — |
| `E5` | 32 | 院士可延长会议时长上界 | ✅ DONE | 2/1/1/1 | — |
| `E6` | 32 | 院士设会议标题 | ✅ DONE | 1/1/1/1 | — |
| `E7` | 32 | 院士设会议类型 | ✅ DONE | 1/1/1/1 | — |
| `E8` | 32 | 院士设会议议程/事项安排 | ✅ DONE | 1/1/1/1 | — |
| `E9` | 32 | 院士邀请入会成员 | ◐ PARTIAL | 1/1/1/0 | r113：chair 调 invite{member,why} → 回执 invited 与 order 变化，且被邀者未 attend 时 quorum 不变（邀请≠签到）。逐字进台账。 |
| `E10` | 32 | 院士设会议时长上界 | ✅ DONE | 3/2/1/2 | — |
| `E11` | 32 | 允许一次性连续召开多个会议 | ✅ DONE | 2/1/1/1 | — |
| `E12` | 34 | 成员命令随会议类型与身份不同 | ✅ DONE | 2/1/1/1 | — |
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
| `E24` | 49 | lean 已通过但 p≠1：辩论焦点是描述/定义是否符合原意 | ✅ DONE | 1/1/1/1 | — |
| `E25` | 51 | 辩论骨架①各成员同时独立单次表态 | ✅ DONE | 1/1/1/1 | — |
| `E26` | 51 | 辩论骨架②轮流/举手/邀请展开 | ✅ DONE | 1/1/1/1 | — |
| `E27` | 53 | 辩论骨架③结束前各成员最终裁决 | ✅ DONE | 2/1/1/1 | — |
| `E28` | 53 | 辩论骨架④全一致取该值、否则平均，并通知持有者改值 | ✅ DONE | 2/1/1/1 | — |
| `E29` | 51 | 辩论轮数由院士决定 | ◐ PARTIAL | 2/1/1/0 | r113：chair 设 verdictMaxRounds=1 后提第二条动议 → 具名拒 VMU_RESOURCE_BUDGET 且 message 给 n/cap；上调后同一动议成功。逐字进台账。 |
| `E30` | 32 | 院士通过命令自组织会议进行中的一切内容、控制、活动（兜底授权，动词不穷举） | ✅ DONE | 5/2/1/1 | — |
| `E31` | 32 | 框架推荐的会议流程骨架只是建议：具体实施、决定、是否遵循完全由院士决定 | ✅ DONE | 2/2/1/1 | — |
| `E32` | 53 | 辩论裁定的并发通知：告诉命题卡持有者最终概率并请其改值 | ✅ DONE | 1/1/1/1 | — |
| `E33` | undefined | 会议类型包括但不限于：正常会议，学术交流，辩论，结题，论文交流，未来规划策划，...。 | ✅ DONE | 1/1/1/2 | — |
| `E34` | undefined | 会议进行中的一些特殊活动包括但不限于：投票（院士设置投票板选项与机制）、任务板设置与认领交派、群聊式交流，...。 | ✅ DONE | 2/1/1/2 | — |
| `E35` | undefined | 关于辩论：院士如果设定会议类型为辩论，则会议会有个额外字段用于设置辩论的对象或辩论对象的文件引用。 | ✅ DONE | 1/1/1/1 | — |
| `E36` | undefined | 辩论类型的会议下，v5r框架默认推荐给院士的流程是：先进行各成员同时进行「单次发言版群聊」，独立发表各自的「布尔概率([0,1])，理由，...」，再进行轮流发言或各自举手发言或邀请发言来展开辩论；辩论的轮数由院士自己决策。 | ◐ PARTIAL | 1/1/1/0 | 余项：live —— r108 要在回执里读到群聊轮次簿的 roundSurface:"chat" 与一句指向会议发言面的话，再在辩论会里读到骨架推进（单次发言→举手/邀请），两者都逐字进台账后才可转 DONE。 |

## F. 论文阶段

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `F1` | 56 | 把原问题与所有有价值产物系统梳理 | ✅ DONE | 1/1/1/2 | — |
| `F2` | 56 | 合作撰写：分派各自内容并合并 | ✅ DONE | 2/1/1/2 | — |
| `F3` | 56 | 互审 | ✅ DONE | 1/1/1/1 | — |
| `F4` | 56 | 面向读者：系统/正确/完整/严谨清晰 | ✅ DONE | 1/1/1/2 | — |
| `F5` | 56 | 讨论检查无误后定稿 | ✅ DONE | 1/1/1/1 | — |

## G. 额外要求

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `G1` | 59 | 支持成员使用 Python 等数学计算工具 | ✅ DONE | 2/1/1/2 | — |
| `G2` | 59 | 所办可设工具并发数量限制防 CPU/OOM | ✅ DONE | 2/1/1/1 | — |
| `G3` | 60 | 支持人工干预研究所决策与运行 | ✅ DONE | 2/1/1/1 | — |
| `G4` | 60 | 支持断点续跑 | ✅ DONE | 1/1/1/1 | — |
| `G5` | 61 | 特殊权限/请求经所办向用户询问 | ✅ DONE | 2/1/1/1 | — |
| `G6` | 62 | 绝大多数功能走工具而非每轮末尾输出 JSON | ◐ PARTIAL | 2/1/2/0 | r113：一轮里工具与围栏字段各做一件事 → step 回执 executed 点名派发了什么；围栏写不认识的字段 → 回执点名该字段。逐字进台账。 |
| `G7` | 63 | 提示词与规则完全相符、自洽 | ◐ PARTIAL | 3/0/1/0 | r115：在同一轮里读到 (a) 会议 agenda/type/title 由召集回执逐字回述 (b) 骨架是推荐不是门禁（procedureBinding:"recommendation"）(c) 发言顺序在回执里可读。三条逐字进台账后才转 DONE。 |

## How to move a row

1. land the mechanism and the reachable face; 2. teach it in the live prompts; 3. run one live round whose
receipt proves the behaviour; 4. cite all four as `path::pattern` in the ledger; 5. run
`node scripts/check-rules-coverage.mjs` (structural) and `--check` (closing). A citation that stops
resolving turns the gate red — that is intended: a renamed symbol must not silently keep a claim alive.
