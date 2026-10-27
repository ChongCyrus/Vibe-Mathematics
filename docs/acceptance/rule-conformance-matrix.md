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
| ✅ DONE | 61 | all four citations resolve |
| ◐ PARTIAL | 16 | the row states exactly which of M/T/P/R is missing |
| ❌ MISSING | 0 | no mechanism at all yet |
| 📌 DECIDED | 0 | the user ruled it out of scope (`next` records the ruling) |

**A goal may not close while any row is ◐ or ❌.**

## A. 成员分层

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `A1` | L1-L2 | 所办＝主代理：用户的助手、媒介、传信者 | ✅ DONE | 2/2/1/1 | — |
| `A2` | L1-L2 | 有进展时自动唤起所办汇报 | ✅ DONE | 1/1/1/2 | — |
| `A3` | L1-L2 | 支持用户以自然语言让所办设参数、控制研究所 | ✅ DONE | 2/2/1/1 | — |
| `A4` | L3 | 院士＝chair 席，统领研究所 | ✅ DONE | 1/1/1/1 | — |
| `A5` | L3 | 常驻研究员＝member 席 | ✅ DONE | 1/1/1/1 | — |
| `A6` | L3 | 临时工：可被雇佣、无表决权、默认不参与会议、可解雇 | ✅ DONE | 1/1/1/1 | — |
| `A7` | L3 | 临时工可被解雇 | ✅ DONE | 1/1/1/1 | — |

## B. 公共文件

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `B1` | L7-L8 | Verified 只收 p=1 的命题 | ✅ DONE | 1/1/1/1 | — |
| `B2` | L7-L8 | 参考文献中的命题也可直接入 Verified | ✅ DONE | 2/2/1/2 | — |
| `B3` | L7-L8 | 只有辩论能把 p 改为 1 | ✅ DONE | 1/1/1/1 | — |
| `B4` | L7-L8 | 蓝图：总目标/技术路线/规划，按时更新 | ✅ DONE | 1/1/1/1 | — |
| `B5` | L7-L8 | 蓝图由院士+常驻研究员共同设计 | ✅ DONE | 1/1/1/1 | — |
| `B6` | L7-L8 | 蓝图最终编辑权在院士 | ✅ DONE | 1/1/1/1 | — |

## C. 个人文件

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `C1` | L11-L12 | 研究过程 progress 日志 | ✅ DONE | 1/1/1/1 | — |
| `C2` | L13 | 已尝试路线/方法及其进度 | ✅ DONE | 1/1/1/1 | — |
| `C3` | L14 | 遇障路线/尝试/方法及障碍与原因归档 | ✅ DONE | 1/1/1/1 | — |
| `C4` | L15 | 被否定的路线/结论归档 | ✅ DONE | 1/1/1/1 | — |
| `C5` | L16 | 命题库：完整定义、p(0-1)、进度 | ✅ DONE | 1/1/1/1 | — |
| `C6` | L16 | 平时只记证明/证伪尝试，真正会证时才写正式证明字段 | ✅ DONE | 1/1/1/1 | — |
| `C7` | L16 | 只有写完的正式证明才能用于辩论 | ✅ DONE | 1/1/1/1 | — |
| `C8` | L16 | p=1 的命题要标记 verified | ✅ DONE | 1/1/1/1 | — |
| `C9` | L17 | 方法库（理论/方法/工具，抽象化产物） | ✅ DONE | 1/1/1/1 | — |
| `C10` | L18 | Lean 代码与编译结果归档 | ✅ DONE | 1/1/1/1 | — |
| `C11` | L18 | lean 通过后辩论只查描述/定义是否符合原意 | ◐ PARTIAL | 2/1/1/0 | 机制在：fidelity 注册表（`createFidelityRegistry`）承载「追问是否已放回辩论」的状态，未追问就下结论 ⇒ 具名 `VMU_PACK_V5R_FIDELITY_ASK_REQUIRED`；缺真机链路 lean 通过 → 辩论 → fidelity → p=1（0 次）。 ／ 真机未演练：`fidelity` 词形只出现在 run 31 的 deny 清单（5150/5151）；无「lean 通过→辩论→fidelity→p=1」真机链路。 |
| `C12` | L18 | 鼓励开关：鼓励把小结/定义 Lean 化 | ✅ DONE | 1/1/1/1 | — |
| `C13` | L19 | 经分派后各自负责部分的论文 | ✅ DONE | 1/1/1/2 | — |
| `C14` | L20 | 脚本文件等归档，不写 ad-hoc 脚本 | ✅ DONE | 1/1/1/2 | — |
| `C15` | L21 | 自反馈库（问题/冗余/障碍/可优化点/方案；院士含组织协作） | ✅ DONE | 1/1/1/1 | — |

## D. 平时研究推进

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `D1` | L26 | 各自推进各自的总任务 | ✅ DONE | 1/1/1/1 | — |
| `D2` | L27 | 三通道：邮箱/私信/群聊 | ✅ DONE | 1/1/1/1 | — |
| `D3` | L27 | 三通道紧急语义：邮箱非紧急不必立即看／私信望早回／群聊非紧急 | ✅ DONE | 1/1/1/1 | — |
| `D4` | L28 | 状态版四字段：总任务/规划/任务完成状态/当前小任务 | ✅ DONE | 1/1/1/1 | — |
| `D5` | L28 | 四字段都含时间等基础信息 | ✅ DONE | 1/1/1/1 | — |
| `D6` | L28 | 可查看其他成员当前状态版 | ✅ DONE | 1/1/1/1 | — |
| `D7` | L28 | 可自己修改更新自己的状态版 | ✅ DONE | 1/1/1/1 | — |
| `D8` | L28 | 四字段按规则原文实现（字段名与语义） | ✅ DONE | 1/1/1/1 | — |

## E. 会议

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `E1` | L32 | 只能院士预约会议（可设预约时间） | ✅ DONE | 1/1/1/1 | — |
| `E2` | L32 | 到点人未到齐进入等待阶段；超时由院士决定 | ◐ PARTIAL | 2/1/2/0 | 教学（框架无定时器，靠 beat 结算）+ 真机 ／ 真机未演练：无定时器/beat 结算真机读数；§20.4 R3/R4（行 726/727）明说「未到齐进 waiting 不可达」「到点推进是触碰驱动」，等待阶段只有 `unansweredList`（5354）。 |
| `E3` | L33 | 只能院士召开会议并主持 | ✅ DONE | 1/1/1/1 | — |
| `E4` | L33 | 只能院士关闭会议 | ✅ DONE | 1/1/1/1 | — |
| `E5` | L33 | 院士可延长会议时长上界 | ✅ DONE | 1/1/1/1 | — |
| `E6` | L33 | 院士设会议标题 | ✅ DONE | 1/1/1/1 | — |
| `E7` | L33 | 院士设会议类型 | ✅ DONE | 1/1/1/1 | — |
| `E8` | L33 | 院士设会议议程/事项安排 | ✅ DONE | 1/1/1/1 | — |
| `E9` | L33 | 院士邀请入会成员 | ✅ DONE | 1/1/1/1 | — |
| `E10` | L33 | 院士设会议时长上界 | ◐ PARTIAL | 1/1/1/0 | 教学 + 真机（hardLimitMs 截断发言） ／ 真机未演练：`hardLimitMs` 只在机制表 57 行出现；真机只读到 `wallLimitMs`（5346 的延长），没有「设上界」回执。 |
| `E11` | L33 | 允许一次性连续召开多个会议 | ✅ DONE | 1/1/1/1 | — |
| `E12` | L34 | 成员命令随会议类型与身份不同 | ◐ PARTIAL | 1/1/1/0 | 真机验一条“辩论下 lean 被收窄” ／ 真机未演练：`deny[chair]`/`deny[member]` 读数是 run 31 的缺陷观测（5150），不是「命令随类型与身份不同」的正向真机回执。 |
| `E13` | L35 | 会议类型：正常/学术交流/辩论/结题/论文交流/未来规划 | ✅ DONE | 1/1/1/1 | — |
| `E14` | L36 | 常见命令：举手 | ✅ DONE | 1/1/1/1 | — |
| `E15` | L36 | 常见命令：邀请发言 | ✅ DONE | 1/1/1/1 | — |
| `E16` | L36 | 常见命令：批量指定成员按顺序发言 | ✅ DONE | 1/1/1/1 | — |
| `E17` | L36 | 常见命令：单次发言版群聊（每人各说一次、不打断） | ✅ DONE | 1/1/1/2 | — |
| `E18` | L37 | 投票板：院士设选项与机制（最少/最多选几项） | ✅ DONE | 1/1/1/1 | — |
| `E19` | L37 | 投票板不用于辩论 | ✅ DONE | 1/1/1/1 | — |
| `E20` | L38 | 任务板：设置与认领交派 | ✅ DONE | 1/1/1/1 | — |
| `E21` | L39 | 群聊式交流：院士为群管理员，设每人权限/发言次数/禁言 | ✅ DONE | 1/1/1/1 | — |
| `E22` | L40 | 辩论额外字段：对象或文件引用 | ✅ DONE | 1/1/1/1 | — |
| `E23` | L41 | 辩论/结题表决人数＝min(用户设置, 院士+常驻) | ✅ DONE | 1/1/1/1 | — |
| `E24` | L43-L44 | lean 已通过但 p≠1：辩论焦点是描述/定义是否符合原意 | ◐ PARTIAL | 1/1/1/0 | 机制在（fidelity 注册表 + `VMU_PACK_V5R_FIDELITY_ASK_REQUIRED` 闸），缺 live 端到端一次「lean 通过 → 辩论只查描述符合性 → p=1」。 ／ 真机未演练：`fidelity` 词形只在 5150/5151；无 lean-pass 且 p≠1 的辩论真机回执。 |
| `E25` | L47-L51 | 辩论骨架①各成员同时独立单次表态 | ✅ DONE | 1/1/1/1 | — |
| `E26` | L47-L51 | 辩论骨架②轮流/举手/邀请展开 | ◐ PARTIAL | 1/1/1/0 | needs a lane: land the missing mechanism/tool/prompt and a live receipt ／ 真机未演练：轮流/举手/邀请展开无真机回执；`hand` 词形只在教学段。 |
| `E27` | L47-L51 | 辩论骨架③结束前各成员最终裁决 | ✅ DONE | 1/1/1/1 | — |
| `E28` | L47-L51 | 辩论骨架④全一致取该值、否则平均，并通知持有者改值 | ✅ DONE | 1/1/1/1 | — |
| `E29` | L52-L53 | 辩论轮数由院士决定 | ◐ PARTIAL | 1/1/1/0 | 机制只设**上界**：`vmu.meetings.verdictMaxRounds`（默认 3，界内钳制；超上限 ⇒ `VMU_RESOURCE_BUDGET`），界内推进节奏由院士掌握；而提示词把轮数钉成设置键值 ⇒ 教学车道需改成「界内由院士决定」。缺 live 真机。 ／ 真机未演练：next 记「机制无硬限，但提示词把轮数硬钉成设置键」=教学缺陷，无「院士定轮数」真机回执。 |

## F. 论文阶段

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `F1` | L55 | 把原问题与所有有价值产物系统梳理 | ◐ PARTIAL | 1/1/1/0 | 教学已落地（撰写阶段要求系统梳理原问题与全部有价值产物：命题卡/方法卡/子问题卡/进展日志/表决记录/形式化证据）；仍缺 live 真机 0 次 ／ 真机未演练：论文阶段 0 次真机（`vibe_v5_paper` 只在机制/教学）；next 原文「真机 0 次」。 |
| `F2` | L55 | 合作撰写：分派各自内容并合并 | ◐ PARTIAL | 1/1/1/0 | 教学已落地（章节分派各写 `action:"part"`、定稿代表合并成一篇、不改写他人章节）；仍缺 live 真机一次多成员 part→合并 ／ 真机未演练：多成员 part→合并 0 次真机；next 仍记为缺。 |
| `F3` | L56 | 互审 | ◐ PARTIAL | 1/1/1/0 | needs a lane: land the missing mechanism/tool/prompt and a live receipt ／ 真机未演练：互审无机制车道（next: needs a lane），0 次真机。 |
| `F4` | L56 | 面向读者：系统/正确/完整/严谨清晰 | ◐ PARTIAL | 2/1/1/0 | 质检门保留原样：`paper.js:144` 调 `checkQuality`，`QUALITY_CODES` 四条 = 章节缺失 / CITATION_UNKNOWN / EVIDENCE_MISSING / VERIFIED_MISSING（证据·引用·已核实结论不得缺）。「系统/正确/完整/严谨清晰」四句文字质量是审阅清单（教学车道已写），不是自动闸——Lead 裁决：不加文字质量门。余项：live 真机演练一次「质检失败被具名拒 → 修订 → 通过」。 |
| `F5` | L56 | 讨论检查无误后定稿 | ◐ PARTIAL | 1/1/1/0 | 教学里“院士席 vs 学术委员会主席席”有矛盾，需修 + 真机 ／ 真机未演练：定稿/渲染无真机回执；next 记「院士席 vs 学术委员会主席席」教学矛盾待修。 |

## G. 额外要求

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `G1` | L58 | 支持成员使用 Python 等数学计算工具 | ◐ PARTIAL | 4/2/1/0 | 机制已补齐两条通道（`host-spawn.js` 的 `localFallback` + `host-math.js` 的无解析器兜底 + 真实的预算/上限/可终止句柄；`status.math.spawnSeamKind` 明确报哪条；`tests/vmu-run82-local-spawn.test.mjs` 31/0）。余项：live 真机仍需用 `vibe_vmu_mathtools{op:"run"}` 跑一次 Python 计算取证（真机上 `PY_CANDIDATES` 命中 python 3.12.10）；F4 文字质量门仍按审阅清单处理。 |
| `G2` | L59 | 所办可设工具并发数量限制防 CPU/OOM | ◐ PARTIAL | 1/1/1/0 | 教学错指成 vmu.turn.maxParallel（那是唤醒人数），应指 vmu.math.maxParallel ／ 真机未演练：`vmu.math.maxParallel` 无真机读数（next 记教学还错指成 `vmu.turn.maxParallel`）。 |
| `G3` | L60 | 支持人工干预研究所决策与运行 | ✅ DONE | 1/1/1/1 | — |
| `G4` | L60 | 支持断点续跑 | ◐ PARTIAL | 1/1/1/0 | 恢复原语在：`createResume`（写前必读 `VMU_RESUME_WRITE_BEFORE_READ`、中断具名绝不静默变 passed、回读一致性可查），`vibe_v5_resume` 走控制面。缺 live 真机 0 次：pause → resume → 续跑一轮。 ／ 真机未演练：`vibe_v5_resume` 全文 0 命中；next 原文「真机 0 次：pause→resume→续跑一轮」。 |
| `G5` | L61 | 特殊权限/请求经所办向用户询问 | ✅ DONE | 1/1/1/1 | — |
| `G6` | L62 | 绝大多数功能走工具而非每轮末尾输出 JSON | ✅ DONE | 1/1/1/1 | — |
| `G7` | L63 | 提示词与规则完全相符、自洽 | ◐ PARTIAL | 1/0/1/0 | 上一轮 6 处硬矛盾已修且逐条有 `path::pattern` 引用；本轮补上 E19 的机制侧（`poll_open` 辩论具名拒，见 E19 行）；仍待：①`packs/v5r/seat-faces.js:404` 的 sequence 说法与 `tests/vmu-run33-p2-teaching.test.mjs` 对应断言（提示词面已在 `v5r-turn-meeting-schedule` 教 truthful 版本）②尚无端到端「规则行→提示词断言」全量检查器（parity/ab 只覆盖已声明分歧）③live 面需真机复跑。 ／ 真机未演练：规则↔提示词的端到端检查器不存在（next ②）；真机只有逐条佐证（6403/6768），不构成 G7 的真机回执。 |

## How to move a row

1. land the mechanism and the reachable face; 2. teach it in the live prompts; 3. run one live round whose
receipt proves the behaviour; 4. cite all four as `path::pattern` in the ledger; 5. run
`node scripts/check-rules-coverage.mjs` (structural) and `--check` (closing). A citation that stops
resolving turns the gate red — that is intended: a renamed symbol must not silently keep a claim alive.
