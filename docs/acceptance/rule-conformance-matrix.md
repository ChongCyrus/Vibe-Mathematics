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
| ✅ DONE | 0 | all four citations resolve |
| ◐ PARTIAL | 72 | the row states exactly which of M/T/P/R is missing |
| ❌ MISSING | 5 | no mechanism at all yet |
| 📌 DECIDED | 0 | the user ruled it out of scope (`next` records the ruling) |

**A goal may not close while any row is ◐ or ❌.**

## A. 成员分层

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `A1` | L1-L2 | 所办＝主代理：用户的助手、媒介、传信者 | ◐ PARTIAL | 0/1/1/0 | re-cite machine-resolvable evidence for: mechanism, live (the gate stripped citations that no longer resolve) |
| `A2` | L1-L2 | 有进展时自动唤起所办汇报 | ◐ PARTIAL | 1/1/0/0 | 核实“进展→唤起所办”的触发链（是谁、按什么条件唤醒 office），缺则补机制，再把条件写进教学 |
| `A3` | L1-L2 | 支持用户以自然语言让所办设参数、控制研究所 | ◐ PARTIAL | 0/1/0/0 | re-cite machine-resolvable evidence for: mechanism, prompt, live (the gate stripped citations that no longer resolve) |
| `A4` | L3 | 院士＝chair 席，统领研究所 | ◐ PARTIAL | 1/1/1/0 | re-cite machine-resolvable evidence for: live (the gate stripped citations that no longer resolve) |
| `A5` | L3 | 常驻研究员＝member 席 | ◐ PARTIAL | 1/1/1/0 | re-cite machine-resolvable evidence for: live (the gate stripped citations that no longer resolve) |
| `A6` | L3 | 临时工：可被雇佣、无表决权、默认不参与会议、可解雇 | ◐ PARTIAL | 1/1/1/0 | 教学补“默认不参会”（attend 只认 chair+member 是机制事实）；真机跑一次 hire→temp 不被邀请/不能投票→fire |
| `A7` | L3 | 临时工可被解雇 | ◐ PARTIAL | 1/1/1/0 | 真机一条 hire→fire（任务转 cancelled、席位消失） |

## B. 公共文件

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `B1` | L7-L8 | Verified 只收 p=1 的命题 | ◐ PARTIAL | 1/1/1/0 | re-cite machine-resolvable evidence for: live (the gate stripped citations that no longer resolve) |
| `B2` | L7-L8 | 参考文献中的命题也可直接入 Verified | ❌ MISSING | 0/0/0/0 | 设计并实现引用入口（清单+引用行格式+验证方式），或由用户裁定不做（DECIDED） |
| `B3` | L7-L8 | 只有辩论能把 p 改为 1 | ◐ PARTIAL | 0/1/1/0 | 提示词用“或”让 verified 轨独立满足 p=1，需收紧为“只有辩论” |
| `B4` | L7-L8 | 蓝图：总目标/技术路线/规划，按时更新 | ◐ PARTIAL | 1/1/1/0 | 补教学段（谁 propose、多久算逾期、adopt 的语义）；真机跑 blueprint state→propose→adopt |
| `B5` | L7-L8 | 蓝图由院士+常驻研究员共同设计 | ◐ PARTIAL | 1/1/1/0 | 教学写清“任何 live 成员可 propose、院士 adopt”；真机验常驻 propose |
| `B6` | L7-L8 | 蓝图最终编辑权在院士 | ◐ PARTIAL | 1/1/1/0 | 同上教学 + 真机验“常驻 propose 被院士改后再 adopt” |

## C. 个人文件

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `C1` | L11-L12 | 研究过程 progress 日志 | ◐ PARTIAL | 1/1/1/0 | re-cite machine-resolvable evidence for: live (the gate stripped citations that no longer resolve) |
| `C2` | L13 | 已尝试路线/方法及其进度 | ◐ PARTIAL | 1/1/0/0 | 补“路线进 routes 轨”的教学；决定“进度”是否结构化（status/阶段枚举） |
| `C3` | L14 | 遇障路线/尝试/方法及障碍与原因归档 | ◐ PARTIAL | 1/1/0/0 | 补教学 + 真机一条（写 obstacles 并读回原因字段） |
| `C4` | L15 | 被否定的路线/结论归档 | ◐ PARTIAL | 1/1/0/0 | 补教学 + 真机一条 |
| `C5` | L16 | 命题库：完整定义、p(0-1)、进度 | ◐ PARTIAL | 1/1/1/0 | “进度”只有自由文本，无字段；需决定加结构化进度（或裁定不需要） |
| `C6` | L16 | 平时只记证明/证伪尝试，真正会证时才写正式证明字段 | ◐ PARTIAL | 1/0/1/0 | 只有段落约定，无字段级门；需决定是否加字段与门 |
| `C7` | L16 | 只有写完的正式证明才能用于辩论 | ◐ PARTIAL | 0/1/1/0 | re-cite machine-resolvable evidence for: mechanism, live (the gate stripped citations that no longer resolve) |
| `C8` | L16 | p=1 的命题要标记 verified | ◐ PARTIAL | 1/1/1/0 | re-cite machine-resolvable evidence for: live (the gate stripped citations that no longer resolve) |
| `C9` | L17 | 方法库（理论/方法/工具，抽象化产物） | ◐ PARTIAL | 1/1/0/0 | re-cite machine-resolvable evidence for: prompt, live (the gate stripped citations that no longer resolve) |
| `C10` | L18 | Lean 代码与编译结果归档 | ◐ PARTIAL | 1/1/1/0 | re-cite machine-resolvable evidence for: live (the gate stripped citations that no longer resolve) |
| `C11` | L18 | lean 通过后辩论只查描述/定义是否符合原意 | ◐ PARTIAL | 0/1/1/0 | 真机跑完整“lean 通过→辩论→fidelity→p=1” |
| `C12` | L18 | 鼓励开关：鼓励把小结/定义 Lean 化 | ◐ PARTIAL | 1/1/1/0 | 补教学（off/encourage/require 三档含义）+ 真机 |
| `C13` | L19 | 经分派后各自负责部分的论文 | ◐ PARTIAL | 1/1/1/0 | 真机 0 次：必须跑一轮论文阶段（分派→撰写→互审→定稿→渲染） |
| `C14` | L20 | 脚本文件等归档，不写 ad-hoc 脚本 | ◐ PARTIAL | 1/1/0/0 | 补 Scripts/ 目录教学 + 真机一条（archive→read→recompute） |
| `C15` | L21 | 自反馈库（问题/冗余/障碍/可优化点/方案；院士含组织协作） | ◐ PARTIAL | 1/1/1/0 | “迭代优化行为模式”缺闭环（谁读、何时复盘） |

## D. 平时研究推进

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `D1` | L26 | 各自推进各自的总任务 | ◐ PARTIAL | 1/1/1/0 | re-cite machine-resolvable evidence for: live (the gate stripped citations that no longer resolve) |
| `D2` | L27 | 三通道：邮箱/私信/群聊 | ◐ PARTIAL | 1/1/0/0 | re-cite machine-resolvable evidence for: prompt, live (the gate stripped citations that no longer resolve) |
| `D3` | L27 | 三通道紧急语义：邮箱非紧急不必立即看／私信望早回／群聊非紧急 | ◐ PARTIAL | 1/1/1/0 | 补一句语义教学（机制已有 urgent） |
| `D4` | L28 | 状态版四字段：总任务/规划/任务完成状态/当前小任务 | ◐ PARTIAL | 1/1/0/0 | re-cite machine-resolvable evidence for: prompt, live (the gate stripped citations that no longer resolve) |
| `D5` | L28 | 四字段都含时间等基础信息 | ◐ PARTIAL | 1/1/1/0 | re-cite machine-resolvable evidence for: live (the gate stripped citations that no longer resolve) |
| `D6` | L28 | 可查看其他成员当前状态版 | ◐ PARTIAL | 1/1/1/0 | 无定向入口（只能 list state 行）：加“读某成员状态板”形状 + 教学 + 真机 |
| `D7` | L28 | 可自己修改更新自己的状态版 | ◐ PARTIAL | 1/1/1/0 | 成员写的是 state 面板四字段（progress/obstacles/next/help），与注入的派生四格不同：统一或教清区别 |
| `D8` | L28 | 四字段按规则原文实现（字段名与语义） | ◐ PARTIAL | 1/1/1/0 | 英文键 objective/plan/tasks/current 与中文原文语义等价但名字不同：决定是否改名对齐 |

## E. 会议

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `E1` | L32 | 只能院士预约会议（可设预约时间） | ◐ PARTIAL | 1/1/1/0 | 教学 + 真机（at 预约→到点→状态转 open/waiting） |
| `E2` | L32 | 到点人未到齐进入等待阶段；超时由院士决定 | ◐ PARTIAL | 1/1/1/0 | 教学（框架无定时器，靠 beat 结算）+ 真机 |
| `E3` | L33 | 只能院士召开会议并主持 | ◐ PARTIAL | 1/1/0/0 | re-cite machine-resolvable evidence for: prompt, live (the gate stripped citations that no longer resolve) |
| `E4` | L33 | 只能院士关闭会议 | ◐ PARTIAL | 1/1/0/0 | re-cite machine-resolvable evidence for: prompt, live (the gate stripped citations that no longer resolve) |
| `E5` | L33 | 院士可延长会议时长上界 | ◐ PARTIAL | 1/1/1/0 | 教学 + 真机（extend 后 upper bound 变大） |
| `E6` | L33 | 院士设会议标题 | ◐ PARTIAL | 1/1/1/0 | needs a lane: land the missing mechanism/tool/prompt and a live receipt |
| `E7` | L33 | 院士设会议类型 | ◐ PARTIAL | 1/1/1/0 | 补六种类型的清单教学 |
| `E8` | L33 | 院士设会议议程/事项安排 | ◐ PARTIAL | 1/1/1/0 | 教学细化（agenda vs agendaitems） |
| `E9` | L33 | 院士邀请入会成员 | ◐ PARTIAL | 1/1/1/0 | 教学改成工具形态（现教成回执字段且该字段非法） |
| `E10` | L33 | 院士设会议时长上界 | ◐ PARTIAL | 1/1/1/0 | 教学 + 真机（hardLimitMs 截断发言） |
| `E11` | L33 | 允许一次性连续召开多个会议 | ◐ PARTIAL | 1/1/1/0 | 教学 + 真机（一次给定三场指标与开始时间） |
| `E12` | L34 | 成员命令随会议类型与身份不同 | ◐ PARTIAL | 1/1/1/0 | 真机验一条“辩论下 lean 被收窄” |
| `E13` | L35 | 会议类型：正常/学术交流/辩论/结题/论文交流/未来规划 | ◐ PARTIAL | 1/1/1/0 | 补一览表教学（含 ordinary 无骨架的理由） |
| `E14` | L36 | 常见命令：举手 | ◐ PARTIAL | 1/1/1/0 | re-cite machine-resolvable evidence for: live (the gate stripped citations that no longer resolve) |
| `E15` | L36 | 常见命令：邀请发言 | ◐ PARTIAL | 0/1/1/0 | 教学改成工具形态 + 真机 |
| `E16` | L36 | 常见命令：批量指定成员按顺序发言 | ◐ PARTIAL | 1/1/1/0 | 教学（order/flow 两种机制）+ 真机 |
| `E17` | L36 | 常见命令：单次发言版群聊（每人各说一次、不打断） | ◐ PARTIAL | 1/0/1/0 | 无独立工具、无并行隔离：决定是否加“批量独立表态”动作（破坏性重构允许） |
| `E18` | L37 | 投票板：院士设选项与机制（最少/最多选几项） | ◐ PARTIAL | 1/1/1/0 | 教学 + 真机（poll_open→vote→close，含 min/max 校验） |
| `E19` | L37 | 投票板不用于辩论 | ❌ MISSING | 0/0/1/0 | 辩论中投票板没有具名拒（仅教学约定）：需加具名拒或明确裁定不需要 |
| `E20` | L38 | 任务板：设置与认领交派 | ◐ PARTIAL | 1/1/1/0 | re-cite machine-resolvable evidence for: live (the gate stripped citations that no longer resolve) |
| `E21` | L39 | 群聊式交流：院士为群管理员，设每人权限/发言次数/禁言 | ◐ PARTIAL | 1/0/1/0 | 机制齐全（admins/mute/quota/freeze）但教学零：补教学 + 真机验配额与禁言 |
| `E22` | L40 | 辩论额外字段：对象或文件引用 | ◐ PARTIAL | 0/1/1/0 | re-cite machine-resolvable evidence for: mechanism, live (the gate stripped citations that no longer resolve) |
| `E23` | L41 | 辩论/结题表决人数＝min(用户设置, 院士+常驻) | ◐ PARTIAL | 1/1/1/0 | re-cite machine-resolvable evidence for: live (the gate stripped citations that no longer resolve) |
| `E24` | L43-L44 | lean 已通过但 p≠1：辩论焦点是描述/定义是否符合原意 | ◐ PARTIAL | 0/1/1/0 | needs a lane: land the missing mechanism/tool/prompt and a live receipt |
| `E25` | L47-L51 | 辩论骨架①各成员同时独立单次表态 | ◐ PARTIAL | 1/1/1/0 | 无并行隔离：同 E17 决定 |
| `E26` | L47-L51 | 辩论骨架②轮流/举手/邀请展开 | ◐ PARTIAL | 1/1/1/0 | needs a lane: land the missing mechanism/tool/prompt and a live receipt |
| `E27` | L47-L51 | 辩论骨架③结束前各成员最终裁决 | ◐ PARTIAL | 0/1/1/0 | re-cite machine-resolvable evidence for: mechanism, live (the gate stripped citations that no longer resolve) |
| `E28` | L47-L51 | 辩论骨架④全一致取该值、否则平均，并通知持有者改值 | ◐ PARTIAL | 0/1/1/0 | 需真机验“通知持有者改值”的链路（mailbox 提醒？） |
| `E29` | L52-L53 | 辩论轮数由院士决定 | ◐ PARTIAL | 0/1/1/0 | 机制无硬限，但提示词把轮数硬钉成设置键：改教学 |

## F. 论文阶段

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `F1` | L55 | 把原问题与所有有价值产物系统梳理 | ◐ PARTIAL | 1/1/0/0 | 真机 0 次：必须跑 |
| `F2` | L55 | 合作撰写：分派各自内容并合并 | ◐ PARTIAL | 1/1/0/0 | needs a lane: land the missing mechanism/tool/prompt and a live receipt |
| `F3` | L56 | 互审 | ◐ PARTIAL | 1/1/1/0 | needs a lane: land the missing mechanism/tool/prompt and a live receipt |
| `F4` | L56 | 面向读者：系统/正确/完整/严谨清晰 | ❌ MISSING | 0/0/0/0 | 质量四要求无任何机制：需定互审 checklist 门或由用户裁定不设门 |
| `F5` | L56 | 讨论检查无误后定稿 | ◐ PARTIAL | 1/1/1/0 | 教学里“院士席 vs 学术委员会主席席”有矛盾，需修 + 真机 |

## G. 额外要求

| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |
| --- | --- | --- | --- | --- | --- |
| `G1` | L58 | 支持成员使用 Python 等数学计算工具 | ❌ MISSING | 0/0/0/0 | 数学面需 host 注入 register/spawn 引擎；真机 VMU_ENGINE_UNAVAILABLE：需要可用引擎或落一个受控计算面 |
| `G2` | L59 | 所办可设工具并发数量限制防 CPU/OOM | ◐ PARTIAL | 1/1/1/0 | 教学错指成 vmu.turn.maxParallel（那是唤醒人数），应指 vmu.math.maxParallel |
| `G3` | L60 | 支持人工干预研究所决策与运行 | ◐ PARTIAL | 1/0/1/0 | re-cite machine-resolvable evidence for: tool, live (the gate stripped citations that no longer resolve) |
| `G4` | L60 | 支持断点续跑 | ◐ PARTIAL | 0/1/0/0 | 真机 0 次：跑一轮 pause→resume（含会话续接） |
| `G5` | L61 | 特殊权限/请求经所办向用户询问 | ◐ PARTIAL | 1/0/1/0 | re-cite machine-resolvable evidence for: tool, live (the gate stripped citations that no longer resolve) |
| `G6` | L62 | 绝大多数功能走工具而非每轮末尾输出 JSON | ◐ PARTIAL | 1/1/1/0 | 围栏 JSON 仍是回执通道：需在教学中说清二者分工 |
| `G7` | L63 | 提示词与规则完全相符、自洽 | ❌ MISSING | 0/0/0/0 | 6 处硬矛盾 + 5 类零教学：按 P0–P2 清单重写（meeting_hand 字段、结题门槛、轮数硬钉、task_update 词表、verified“或”、只教平均） |

## How to move a row

1. land the mechanism and the reachable face; 2. teach it in the live prompts; 3. run one live round whose
receipt proves the behaviour; 4. cite all four as `path::pattern` in the ledger; 5. run
`node scripts/check-rules-coverage.mjs` (structural) and `--check` (closing). A citation that stops
resolving turns the gate red — that is intended: a renamed symbol must not silently keep a claim alive.
