# Phase 12 — v5r 运行规则一致性台账（逐条核查 vmu + v5r pack）

本台账是用户 2026-10-23 给出的《v5r pack 的运行规则》的**逐条对照表**。它不是设计文档，是**证据表**：
每一条规则都要能指到 `文件:行` 或命令输出，否则记「待核」，不得记「没问题」。

## §0 读法与状态词

| 状态 | 含义 |
|---|---|
| ✅ 已实现 | 有机制、有读点、有门禁/断言，且能指到位置 |
| ⚠️ 部分 | 机制在但不完整，或缺门禁，或只在一部分面上生效 |
| ❌ 缺口 | 规则要求的机制**不存在**（"没有机制"本身是缺口，不是待核） |
| 待核 | 本轮还没查到这里；**不得**当成通过 |

★ 判定纪律：**「提示词里写了」不等于「机制存在」**；**「工具声明了参数」不等于「参数被消费」**。
本台账的「门禁」列指**机器可失败的检查**（测试/审计脚本/schema 校验），没有门禁的规则只能算"靠自觉"。

## §1 成员（A）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| A1 | 所办＝主代理：用户助手；有进展时自动唤起汇报；是用户与研究所的媒介/传信者；支持用户用自然语言让所办设参数、控制进程 | 席位 `office`（`packs/v5r/tools.js` 头部映射：`vibe_v5_message` 以 office 声音投递）；通知族 `packs/v5r/notices.js:74 officeNotice`；设参面 `vibe_v5_configure` / `vibe_v5_set` | 待核 | 待核 |
| A2 | 院士：主席席位，主持/决策会议 | `packs/v5r/tools.js:186` overview 的 chair 席位拒绝、`:472` chair seat 检查；`vmu.meetings.eligibleSeats:['chair','member']` | 待核 | 待核 |
| A3 | 常驻研究员 | `vibe_v5_start` 的 `researcherCount`（`packs/v5r/tools.js:1139`） | 待核 | 待核 |
| A4 | 临时工：被院士/常驻研究员雇佣做特殊/临时任务；**无表决权**；**默认不参与会议**；可雇佣/解雇 | `vibe_v5_hire` → members `hire` 进 `temp` 席位 + 初始任务；`vibe_v5_fire` → members `end` + tasks `cancelled`；`vmu.members.maxTempPerMember: 3`；**无表决权/不入会由 `vmu.meetings.eligibleSeats:['chair','member']` 表达**（temp 不在册） | 待核 | 待核 |

## §2 文件与归档（B）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| B1 | **公共 Verified 文件夹**：只有布尔概率＝1 的命题（或参考文献中的命题）可加入；**只有辩论能把概率改成 1**，否则只能∈(0,1) | ★ 实测 `grep -rn "Verified" --include=*.js vibe-math-vmu/ \| wc -l` ＝ **85 条 / 15 个文件**（原写"只命中 auditchain"是**假阴性**，已更正：`grep -rln` 列出 15 文件）——但逐文件看：v5r 侧命中**全在 5 个提示词文件**（`prompts/v5r-assistant|blocks-a|blocks-b|core|persona|prompts.js`，是文字），代码侧命中是 `kernel/auditchain.js`(anchorVerified，无关)、`kernel/crypto.js`、`kernel/records.js`、`kit/paper.js` 与 **v3 pack**（`packs/v3/index.js`、`middleware/dataplane.js` 的 promoteVerified…＝v3 真的做过）。⇒ **v5r pack 没有 verified 轨/kind/字段**（`packs/v5r/settings/defaults.json` 十条轨无 verified；`kernel/records.js:457` 只有 `settled`），也**没有"概率＝1 只能来自辩论"的闸** | 无 | ❌ 缺口 |
| B2 | **公共蓝图**：实现总目标的完整技术路线设计/策划；按时更新；院士+常驻研究员共同设计；**最终编辑权归院士** | `vmu.turn.protocolPath: 'Shared/Protocol.md'`（pack 默认，`settings/defaults.json`）只是路径约定，无编辑权闸 | 无 | 待核 |
| B3 | 各自 progress | track `progress`（`defaults.json` records.tracks）＋ `vibe_v5_record_progress` | 待核 | 待核 |
| B4 | 已尝试路线/方法及进度 | tracks `routes` ＋ `methods` | 待核 | 待核 |
| B5 | 遇障路线/方法/障碍及原因归档 | tracks `obstacles` `rejected` | 待核 | 待核 |
| B6 | 命题库：完整定义＋布尔概率∈[0,1]＋进度；证明过程平时只写「证明/证伪**尝试**」字段；真会证了才写正式证明/证伪；**只有含正式证明（写完）的命题卡才能用于辩论**；概率＝1 要标记 verified | track `propositions` + `vibe_v5_record_proposition`（必填 statement/value/motive/p）；"正式证明"字段是**成员文件** `Members/<id>/Propos/<pid>.md` 的 `## 证明尝试/## 证伪尝试`；★「只有正式证明写完才能进辩论」的**机器闸**未找到 | 无 | ⚠️ 部分 |
| B7 | 方法库（一般化/推广/抽象出工具、理论框架） | track `methods` + `vibe_v5_record_method` | 待核 | 待核 |
| B8 | Lean 代码＋编译结果归档；**lean 通过 ⇒ 辩论只查描述/定义符合性 ⇒ 符合即概率＝1 且可入 verified**；参数可开「鼓励形式化」开关 | `vibe_v5_lean_run/job/lib/read/archive`；`vmu.math.leanJobsMaxParallel`；★ lean-pass → 概率＝1 的联动**未找到** | 无 | ❌ 缺口（联动） |
| B9 | 分派后各自负责部分的论文 | `packs/v5r/paper.js` + `vibe_v5_paper` | 待核 | 待核 |
| B10 | 脚本文件 | 无专门面（成员用 shell/工具写文件） | — | 待核 |
| B11 | 自反馈库：问题/冗余/障碍/可优化点与方案；**院士另含对各阶段（平时/会议/辩论）流程与组织协作的自反馈优化** | track `feedback` + `vibe_v5_feedback` | 待核 | 待核 |

## §3 平时研究推进（C）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| C1 | 各自推进各自总任务 | `vmu.turn.objective` + 各成员任务（tasks 面） | 待核 | 待核 |
| C2 | 交流通道：邮箱（非紧急）、私信（希望尽早回复）、群聊（非紧急） | `vibe_v5_inbox`(list/open/mark)、`vibe_v5_message`(office 声音)、`vibe_v5_say`(群聊 / `to` ⇒ DM)、`vibe_v5_nudge`；`vmu.mailbox.wakeBudget: 1` | 待核 | 待核 |
| C3 | 状态版：可查看他人、可改自己；内容①总任务②规划计划③各任务完成状态④当前小任务；含时间信息 | track `state`（`vibe_v5_record_progress` 可路由到 state）；★ 四个必需字段**是否有闸**待核 | 待核 | 待核 |

## §4 会议（D）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| D1 | **只有院士**能预约会议（可设预约时间；到点人未齐可进等待；超时未齐由院士自决） | kernel `convene`（`kernel/index.js` attach 表）；等待/停摆 `kernel/meetinglapse.js` + `lapse/lapseDue` | 待核 | 待核 |
| D2 | 院士召开、关闭、**延长时长上界**；院士主持 | `close` / `extend`（`kernel/meetings.js:343`）；`vmu.meetings.hardLimitMs` | 待核 | 待核 |
| D3 | 院士设：标题、**类型**、内容事项、邀请成员、时长上界 | `open({materials: agenda, roster, chair, secretary, type, kind})`；★ **类型目前是死字段**（`vibe_v5_meeting` 白校验后丢弃，kernel 恒收 `type:'ordinary'`） | 无 | ❌ 缺口 |
| D4 | 院士通过命令自组织、决策会议中一切内容/控制/活动 | `speak/hand/interrupt/recess/order/queue/ballot/motion/second/vote` 等 kernel 面 | 待核 | 待核 |
| D5 | **特殊类型会议下框架初始给院士推荐流程骨架**，实施/是否遵循完全由院士决定 | ★ **没有任何按类型给出的流程骨架**；唯一带"辩论流程"字样的是语料库 `packs/v5r/prompts/v5r-prompts.js` 的 `verify-debate` 三条示例，**运行时从不注入** | 无 | ❌ 缺口 |
| D6 | 允许一次性设置**连续展开的多个会议** | 未找到"会议序列"机制（`m.queue` 是发言队列，不是会议队列） | 无 | ❌ 缺口 |
| D7 | 成员可用命令/工具**按会议类型和身份**有差异 | 身份差异有（chair seat 检查、`requireSpeaker`、`eligibleSeats`）；**按类型差异**没有（类型是死字段） | 待核 | ⚠️ 部分 |
| D8 | 会议类型含：正常、学术交流、辩论、结题、论文交流、未来规划/策划… | 类型目录 `vmu.meetings.typeCatalog` 默认空 ⇒ 传什么都放行，但**没有一处行为按类型分派** | 无 | ❌ 缺口 |
| D9 | 常见命令：举手发言、邀请发言、**批量指定成员按顺序发言**、单次发言版群聊（权限区分，部分仅主持） | `hand`(举手)、`invite`(邀请)、`queue/order`(排序)、`vibe_v5_say`；★「按顺序邀请一串成员」与「单次发言版群聊」待核 | 待核 | 待核 |
| D10 | 特殊活动：投票板（选项＋最多/最少选几项机制）、任务板设置与认领/交派、群聊式交流（院士为群管，可设权限/发言次数/禁言） | ballotbox（`poll_open/vote/close`，min/max 选择）＋ tasks 面 ＋ `vmu.chat.admins:['acad']` / `speakQuota` / `muteDefaultMs` | 待核 | 待核 |
| D11 | **辩论类型会议有额外字段：辩论的对象或对象文件引用** | 无（连类型都没有） | 无 | ❌ 缺口 |
| D12 | 辩论/结题**表决人数下限** ≥ min(用户设置数, 院士+常驻研究员数) | `vmu.meetings.quorumRule:'m-unanimous'` / `quorumCap:3` / `eligibleSeats`；★「取 min」的语义待核 | 待核 | 待核 |
| D13 | lean 已通过但概率非 1 的命题：辩论聚焦 **lean 代码中命题/定义的描述符合性** | 无专门闸；只在语料/提示词层面 | 无 | ❌ 缺口 |
| D14 | **辩论推荐流程**：先各成员"单次发言版群聊"独立给（概率,理由）；再轮流/举手/邀请展开；轮数由院士定 | 无（见 D5） | 无 | ❌ 缺口 |
| D15 | **辩论结束机制**：收各成员最终裁决（概率,理由）；全一致 1（或 0）⇒ 取该值，否则取均值；**通知命题卡持有者改概率** | `vibe_v5_verdict`（需核对是否就是"最终裁决"面）；"改概率的通知"未找到 | 待核 | 待核 |

## §5 论文阶段（E）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| E1 | 系统梳理原总问题与所有有价值产物，合作撰写最终论文 | `packs/v5r/paper.js` 的阶段流（draft/review/finalize，`editorDefault:'academician'`） | 待核 | 待核 |
| E2 | 合作写（分工后系统合并）、互审 | `vmu.review.mode:'single-blind'`、`vmu.reviewers.maxLoad:3`、`vmu.paper.maxRounds:3` | 待核 | 待核 |
| E3 | 面向读者：系统、正确、完整、严谨清晰 | 提示词层面（`v5r-paper-prompts.js`） | 待核 | 待核 |
| E4 | 最后讨论、检查无误后定稿 | `finalize` + `vmu.paper.officeConsult:'required'`（定稿前必须问所办） | 待核 | 待核 |

## §6 额外要求（F）

| ID | 规则要点 | 落点 / 证据 | 门禁 | 状态 |
|---|---|---|---|---|
| F1 | 支持数学计算工具（Python 等）；**所办可通过参数设工具并发上限**（防 CPU 过载/OOM） | `vmu.math.maxParallel:1`、`vmu.math.leanJobsMaxParallel`、math jobs 面（`vibe_v5_lean_*`）+ `vibe_v5_configure` | 待核 | 待核 |
| F2 | 支持人工干预决策/运行、**断点续跑** | `vmu.human.*`（onTimeout/vetoLiftRoles/gatedActions）+ resume 面（`vmu.resume.*`、`vibe_v5_pause/resume`） | 待核 | 待核 |
| F3 | 特殊权限/请求可经报告所办向用户询问 | `vibe_v5_report` + `vmu.paper.officeConsult` 机制 | 待核 | 待核 |
| F4 | 功能尽量通过**代理可执行命令（工具）**实现，而非每轮结束输出 JSON | ★ 需核：是否仍有"每轮结束返回 JSON"的残留要求 | 待核 | 待核 |
| F5 | **提示词与规则完全相符自洽**：删除「m 票机制」「每轮结束返回 JSON 机制」等不再适用的内容 | ★ 需核：提示词里是否仍有 m 票 / 末尾 JSON 语法 | 待核 | 待核 |

## §7 汇总

| 组 | 条数 | 已实现 | 部分 | 缺口 | 待核 |
|---|---|---|---|---|---|
| A 成员 | 4 | 0 | 0 | 0 | 4 |
| B 文件与归档 | 11 | 0 | 1 | 2 | 8 |
| C 平时推进 | 3 | 0 | 0 | 0 | 3 |
| D 会议 | 15 | 0 | 1 | 7 | 7 |
| E 论文 | 4 | 0 | 0 | 0 | 4 |
| F 额外要求 | 5 | 0 | 0 | 0 | 5 |
| **合计** | **42** | **0** | **2** | **9** | **31** |

★ 这张表第一次写出来的时候 **9 条已确认缺口、31 条待核**——即"待核"是绝大多数，任何"已完成"的说法都必须先把待核清零。

### 已确认的 9 条缺口（按影响排序）

1. **B1 Verified 目录 + "概率＝1 只能来自辩论"的闸** — 整个机制不存在。
2. **D3/D8/D11 会议类型是死字段** — 院士设了类型等于没设；也没有辩论对象字段。
3. **D5/D14 特殊类型会议的推荐流程骨架不存在** — "辩论该怎么走"没有任何框架给出的骨架。
4. **D15 辩论结束的裁定与通知闭环** — 需核 `vibe_v5_verdict` 是否就是最终裁决面，以及"通知改概率"是否存在。
5. **D13 lean 通过 ⇒ 辩论只查描述符合性** — 无闸。
6. **D6 连续多会议** — 无机制。
7. **B8 lean 通过 ⇒ 概率＝1 且可入 verified** — 无联动。
8. **B6 「只有含正式证明的命题卡才能用于辩论」** — 无机器闸。
9. **B2 蓝图的最终编辑权归院士** — 只有路径约定，无编辑权闸。

### 下一步（本轮内）

- 清空 31 条「待核」：按 A/B/C/D/E/F 六组分路核查，每条给出可失败的证据。
- 缺口按"机制缺口（要加能力/门禁）"与"提示词缺口（要改文本）"分流。
- 全部落定后再谈真机实测（用户要求最后跑完整真机，并明确告知代理这是一次模拟、把规则当核验对象）。

---

## 分片审计报告（本轮，只读，各自一个文件）

| 分片 | 文件 | 覆盖 | 结论摘要 |
|---|---|---|---|
| lane-meeting | `conformance/lane-meeting.md` | D 组 15 行中的 D1–D11、D14 | D1 ❌ D2 ⚠️ D3 ⚠️ D4 ⚠️ D5 ❌ D6 ❌ D7 ⚠️ D8 ❌ D9 ⚠️ D10 ✅ D11 ❌ D14 ❌ |
| lane-extra | `conformance/lane-extra.md` | 42 行中的 9 行（B1 B2 B9 B10 F1 F2 F3 F4 F5） | B9 ✅ F1 ✅ F2 ✅ · B10/F3/F4 ⚠️ · B1/B2/F5 ❌ |
| lane-claims-paper | `conformance/lane-claims-paper.md` | 命题/论文相关行 | 见文件 |

★ **两份报告都是在「本轮改动落地之前」读的代码**：lane-meeting 的 D3「`packs/v5r/tools.js:513` 硬编码 `type:'ordinary'`」、D8「没有类型载体」、`target` 无消费者 —— 这三条**本轮已修**（见下），必须在下一轮用当前工作树复核后才算清账。lane-extra 报的 B1 台账假阴性已在本文件 §B1 行更正（85 命中 / 15 文件）。

### 本轮已落地的能力（会议类型 · 辩论对象 · 推荐流程骨架）

- `vibe-math-vmu/kernel/meetings.js`：`open()` 增加 `subject`（辩论对象/文件引用，非字符串具名拒 `VMU_INVALID_ARGUMENT`，空白归一为 `null`）；meeting 对象保存 `subject`；`open()` 回执、`summary()`、`meetingView()`、`meetings/opened` 事件都带 `type` 与 `subject`；`open()` 顶层也返回这两个（读回不用猜回执信封）。
- 新 `vibe-math-vmu/packs/v5r/meeting-procedures.js`：六种会议类型词汇 + **辩论**的推荐骨架（①同时发表 `poll_*` 独立表态 ②轮流/举手/邀请展开，轮数由院士定 ③结束前各自最终裁决 ④聚合），骨架只允许写"真实存在的工具"，未实现的步骤在回执里**具名 pendingSteps**；另五种类型 `procedure:null` + 具名理由（不发明流程）。
- `packs/v5r/tools.js` 的 `vibe_v5_meeting`：接受 `type`（默认 `ordinary`）、`subject`（`target` 为活别名，原来声明了没人读）、辩论缺对象具名拒；回执带 `type/subject/procedure/procedureBinding/procedureNote/pendingSteps`。
- `packs/v5r/settings/defaults.json`：声明 `vmu.meetings.typeCatalog` 六值 ⇒ 内核的 `typeCatalog` 白名单在 v5r 里真的绑上（未声明类型被具名拒并列出合法值）。
- `package.json#files` + `installer.js` PRESETS 双登记新模块（否则装完 MODULE_NOT_FOUND）。
- 新测试 `tests/vmu-meeting-types.test.mjs` **46 passed / 0 failed**；邻接套件 meetings 195/0、v5r-tools 334/0、motion-box 37/0、pack-prompts 24/0；`regen-all` 16/16。

### 下一批（按 lane 报告的证据排序）

1. **D1 只有院士能开会**：`packs/v5r/tools.js:495` 只 `requireSeat` 任意席位，`kernel/meetings.js:383-436` 不校验 actor ⇒ 加院士/主持闸（并在内核里给出可复用的 chair 校验，别在 pack 里造第二套）。
2. **D2/D4 关闭与延长**：`close()` 无主席校验（`meetings.js:1073-1136`）；**没有会议级 `extend`**（`wallStartMs` 只写一次 `:432`、读 `:1115`；只有发言级 `meetinglapse.js:197-217`）⇒ 补会议级延长上界，这是用户规则明写的。
3. **D9 邀请面真机不通**：pack 开的是 service 会议，`invite/invitedspeak` 只在原语注册表（`tools/meeting.js:61-81,159-160`）⇒ 要么把 invite 接进 service，要么让 pack 的 meeting 面指向原语面。
4. **FALSE EXIT 修正**：`docs/24-v5r-containment.md:53,396` 教院士用 `formal_agenda:true` 转正式会议，但该参数只被回显（`packs/v5r/tools.js:515`）⇒ 要么实现消费，要么改文档（本轮不动提示词，见 F5 的顺序约束）。
5. **F5 顺序约束（重要）**：m 票机制（`vmu.meetings.quorumRule='m-unanimous'`/`quorumCap` 是内核机制）与每轮 JSON 答复（`kernel/turn/index.js:863-878`）**都还活着** ⇒ 只删提示词文字会更不自洽。正确顺序：先建 B1 的 verified 承载与 p=1 门，再改机制，最后删文字。
