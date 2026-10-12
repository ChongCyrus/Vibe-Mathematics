# 源码完备性审计：v5r 运行时机制 → vmu 移植

- **权威源**：`vibe-math-v5r/vibe-math-v5r.js`（约 11,597 行）
- **被审移植**：`vibe-math-vmu/kernel/**`、`vibe-math-vmu/host.js`、`vibe-math-vmu/vibe-math-vmu.js`、`vibe-math-vmu/settings/schema.js`，以及 `tests/vmu-turn.test.mjs`、`tests/vmu-ab-v5r-verification.test.mjs`
- **审计范围**：**回合机制**（生成/就座、唤醒/调度、回复字段派发、会议、表决链、任务板、hire/fire、暂停恢复）。**提示词措辞不在本报告范围**。
- **方法**：只读 `grep`/`read` 定点取证；**未**通读 11,597 行；**未**跑全量门禁；**未**改除本文件外的任何文件。
- **诚实边界**：凡未逐字读到的行，一律标 **`未核`**，不推测。

---

## 1. 机制覆盖表（原始行号 → 移植代码路径）

| # | 机制 | 原文行号（已核） | 原文规则（一句话） | 覆盖? | vmu 代码路径 | 证据 |
|---|---|---|---|---|---|---|
| M1 | 生成成员（`spawnMember`） | **3747** | 逐成员拉起子代理；**charter 在 hire 时冻结**（3788–3790） | **PARTIAL** | `vibe-math-vmu/kernel/index.js`（成员面）+ `host.js`（子代理接缝） | `tests/vmu-turn.test.mjs`（回合编排）；**未核**：vmu 是否有"冻结 charter 快照"字段 |
| M2 | **席位计数/上限** | **3709–3729** | 上限命中 ⇒ 具名拒并把成员记 `failed`（3828） | **PARTIAL** | `kernel/recruit.js`（seats/`VMU_RECRUIT_SEATS_EXCEEDED`） | `tests/vmu-recruit.test.mjs`（超员拒，带 current/limit） |
| M3 | **"每轮一行"记账** | **3750** | 限流句子**每 ROUND 一行**，不是每成员一行 | **未核** | — | — |
| M4 | 回合回复解析（`parseReply`） | **11556** | 从自由文本抽出 JSON 字段 | **YES（形态）** | `kernel/turn/index.js`：`extractFence()`（L57） | `tests/vmu-turn.test.mjs` |
| M5 | 回复处理（`handleReply`） | **9364** | 逐字段派发到内核面 | **PARTIAL** | `kernel/turn/index.js`：`FIELD_OWNERS`（L30–45）、`facesFrom()`（L67） | 见 §2 字段表 |
| M6 | 唤醒/调度循环 | **未核**（未定位 `wakeNext`） | 谁下一个被唤醒、pause 后停唤醒 | **未核** | `kernel/scheduler.js`（存在） | **未核** |
| M7 | 一"轮"的定义与计数 | **未核** | — | **未核** | — | — |
| M8 | `say`（群聊/私信/表决者） | **3531**（`say`）、3569（投递踢一次调度） | 按收件人投递；`V5_SELF_MESSAGE` 拒自寄 | **PARTIAL** | `kernel/turn/index.js` L31 → `vmu.meetings/speak` | `tests/vmu-turn.test.mjs` |
| M9 | 表决链（独立首过→辩论轮→法定 m→一致） | **2824–2845**（`verdictMaxRounds` 上限、`V5_INVALID_ARGUMENT`）、**2006**（决议≠真值、不驱动） | 轮次上限可配；**决议不写真值** | **PARTIAL** | `kernel/ballot.js`／`kernel/meetings.js`／`kernel/conference.js`（存在） | `tests/vmu-ballotbox.test.mjs`、`tests/vmu-conference.test.mjs`；**未核**：与原文"独立首过"逐条对齐 |
| M10 | 会议等级（formal/light） | **2218–2259** | `formal_agenda` 可显式覆盖；简流程**不得产出实体定论** | **PARTIAL** | `kernel/meetings.js`（`meetingLevelOf` 对应物） | `tests/vmu-meetings.test.mjs` |
| M11 | 会务（秘书、动议、附议、发言区） | **2277–2305**（secretaries）、**2346–2396**（motion/secondedBy）、**2444**（inputs 空则记 gap） | 秘书可撤换；动议需在册成员；二楼附议 | **PARTIAL** | `kernel/meetings.js`、`kernel/ballotbox.js` | `tests/vmu-meetings.test.mjs`、`tests/vmu-ballotbox.test.mjs` |
| M12 | 任务板（依赖/认领/CAS） | 提示词 **4007–4010**（`task_create`/`task_claim`/`task_done`/`task_update`） | `task_update` 带 `expected_revision` | **PARTIAL** | `kernel/turn/index.js` L36–37 → `vmu.tasks/create|transition`；`kernel/board.js` | `tests/vmu-kernel.test.mjs`（CAS 相关） |
| M13 | hire/fire 权限 | 提示词 **3310–3318**；`GRANTABLE_COMMANDS` **1595** | 院士可雇/解雇自己雇的临时工；可授权 4 条命令 | **PARTIAL** | `kernel/recruit.js`、`kernel/hr.js`（存在） | `tests/vmu-recruit.test.mjs`；**未核**：授权命令集是否等价 |
| M14 | pause/resume | **未核** | 暂停后停止唤醒 | **未核** | `kernel/index.js`（control 面） | `tests/vmu-turn.test.mjs`？**未核** |
| M15 | `contextPct` / `compacted` | **5820–5824** | 成员可在回复里报告上下文占用与压缩摘要 | **NO（在 turn 字段表中无 owner）** | — | 见 §2 |

> **注**：表中 `PARTIAL` 的定义＝**该能力在 vmu 有对应内核面，但"原文该机制的完整规则/字段"未逐条对齐核验**。

---

## 2. 字段派发表（原文提示词列出的回复字段 → vmu 是否有 owner）

**vmu 侧权威表**：`vibe-math-vmu/kernel/turn/index.js` **L30–45 `FIELD_OWNERS`**（共 **12** 个字段）。

| 回复字段 | 原文出现处（已核） | vmu owner（`FIELD_OWNERS`） | 判定 | 拒绝时的行为 |
|---|---|---|---|---|
| `say` | 提示词 **3988** | `vmu.meetings/speak`（L31） | **YES** | 面内具名拒（**未核**具体码） |
| `progress` | 提示词 **3989** | `vmu.records/put`（L32） | **YES** | 具名拒（**未核**） |
| `record` | 提示词 **3990–3992** | `vmu.library/record`（L33） | **YES** | 具名拒（**未核**） |
| `propose_verify` | 提示词 **3993/3997** | `vmu.meetings/motion`（L34） | **YES** | 具名拒（`VMU_*`） |
| `verdict` | 提示词 **3994** | `vmu.ballotbox/cast`（L35） | **YES** | 具名拒（**未核**） |
| `formal` | 提示词 **4013–4014** | `vmu.formal/check`（L40） | **YES** | 具名拒（**未核**） |
| `task_create` | 提示词 **4007** | `vmu.tasks/create`（L36） | **YES** | 具名拒 |
| `task_update` | 提示词 **4010** | `vmu.tasks/transition`（L37） | **YES** | 具名拒 |
| `proposal` / `motion` | （原文以 `propose_verify` 为主） | `vmu.meetings/motion`（L38–39） | **YES（别名）** | 具名拒 |
| `lean_archive` / `lean_run` | （原文 Lean 面） | `vmu.mathjobs/submit`（L41–42） | **YES** | 具名拒 |
| **`propose_meeting`** | 提示词 **4000** | — | **NO** | — |
| **`convene_meeting`** | 提示词 **4002–4003** | — | **NO** | — |
| **`assign`** | 提示词 **4003** | — | **NO** | — |
| **`prioritize`** | 提示词 **4004** | — | **NO** | — |
| **`nudge`** | 提示词 **4005** | — | **NO** | — |
| **`task_claim`** | 提示词 **4008** | — | **NO** | — |
| **`task_done`** | 提示词 **4009** | — | **NO** | — |
| **`input`** | 提示词 **4011** | — | **NO** | — |
| **`reject_assign`** | 提示词 **4018** | — | **NO** | — |
| `hire` / `fire` | 提示词 3310–3318（工具侧） | —（turn 字段表无） | **NO（字段面）** | 工具面另有 hire/fire（**未核**是否可达） |
| `vote_solved` | 任务文本列出 | — | **NO** | — |
| `meeting_hand` | 任务文本列出 | — | **NO** | — |
| `meeting_invite` | 任务文本列出 | — | **NO** | — |
| `solved` | 任务文本列出 | — | **NO** | — |
| `contextPct` | **5820** | — | **NO** | — |
| `compacted` | **5821–5824** | — | **NO** | — |

**小计**：**owner 命中 12**（含 2 别名）／**无 owner ≥17**。⇒ 原文文档化的回复面在移植里**大约覆盖 12/29**。

---

## 3. 缺口清单（按"vmu 单独跑完一轮研究所"的影响排序）

1. **`contextPct`／`compacted` 无 owner**（原文 **5820–5824**）——**最要命**：原文**用它们做上下文压缩与续跑种子**（`seeds.set(...).slice(0,4000)`）；移植里回复**无法上报上下文占用**，压缩/续跑链在回合面**断了**。
2. **`assign`／`prioritize`／`nudge` 无 owner**（原文提示词 **4003–4005**，权限模型见 **1595/1640**）——**院士的督导面整体缺失**：成员回复提出的分派/优先级/督办**不会落到任何内核面**。
3. **`convene_meeting`／`propose_meeting` 无 owner**（原文 **4000–4003**，会议等级 **2218–2259**）——**会议发起面缺失**：只能靠工具面（**未核**是否存在等价路径）。
4. **`task_claim`／`task_done` 无 owner**（原文 **4008–4009**）——任务板**认领/完成**在回合面缺失（`task_create`/`task_update` 有 owner）。
5. **`reject_assign` 无 owner**（原文 **4018**）——被分派者的**异议通道**缺失。
6. **`input` 无 owner**（原文 **4011**）——会议/辩论**发言正文**在回合面缺失（`say` 可代但语义不同）。
7. **`vote_solved`／`solved`／`meeting_hand`／`meeting_invite` 无 owner**——议事与"已解决"表决面缺失。
8. **`hire`／`fire` 在回合字段面无 owner**（原文 **3310–3318** 为工具面）——**未核**工具面在 vmu 是否已接线。
9. **"每轮一行"限流记账**（原文 **3750**）**未核**。
10. **唤醒/调度循环与"轮"的定义**（原文未定位 `wakeNext`）**未核**——`kernel/scheduler.js` 存在，但**未核**其与原文的"谁下一个/何时停"是否一致。
11. **pause/resume 语义未核**（原文停止唤醒的条件未读）。
12. **charter 冻结快照**（原文 **3788–3790**）在 vmu 的等价字段**未核**。
13. **表决链细节**（独立首过、辩论轮上限、法定 m、一致）**仅核到原文上限/拒绝码（2824–2845）**，vmu 侧**逐条未核**。

---

## 4. "我怎么查的"（行范围与命令）

**读到的原文行区间（逐字）**：`3747`（`spawnMember` 定义）、`3531`（`say`）、`3569`（投递后踢调度）、`3709–3729`（子代理上限与具名拒）、`3750`（每轮一行）、`3788–3790`（charter 冻结）、`3988–4018`（**提示词里的回复字段全集**）、`5820–5824`（`contextPct`/`compacted` 用于种子）、`1595`／`1640`（可授权命令）、`2006`（决议≠真值）、`2218–2259`（会议等级）、`2277–2305`（秘书）、`2346–2396`（动议/附议）、`2444`（inputs 与 gap）、`2824–2845`（表决轮次上限）、`9364`（`handleReply`）、`11556`（`parseReply`）。

**读到的移植行区间**：`vibe-math-vmu/kernel/turn/index.js` **L20／L30–45／L47／L49／L57／L67／L90／L120／L136／L327**（`FIELD_OWNERS` 全表、`FIELDS`、`PHASES`、`refuse`、`extractFence`、`facesFrom`、`deliverViaSubagents`、`resolveOwners`、`createTurnOrchestrator`）。

**跑过的命令（只读）**：
- `grep "function spawnMember|function parseReply|…"` → 3747／9364／11556；
- `grep "parsed\.[a-zA-Z_]+"` → 942／943／5820／5821／5824；
- `grep "…字段名…"`（原文件）→ 250/1034 命中（提示词字段列表 3988–4018 即由此定位）；
- `grep "…字段名…"`（`kernel/turn/index.js`）→ L34／L37；
- `grep "…face:|^export…"`（`kernel/turn/index.js`）→ **L30–45 的 12 条 owner 表**（本文 §2 的决定性证据）。

**未做**：未读 `kernel/scheduler.js`／`kernel/meetings.js`／`kernel/ballot.js`／`kernel/index.js` 正文；未跑任何测试或全量门禁（红线）；未对原文的 `wakeNext`/pause/round 计数做逐字读取（未定位到定义行）。

---

## 5. THE SINGLE MOST IMPORTANT GAP

**`contextPct` 与 `compacted` 在移植里没有 owner —— 原文用它驱动"上下文压缩 ⇒ 续跑种子"（原文 `vibe-math-v5r.js:5820–5824`：`contextPct.set(member.id, clPct(parsed.contextPct))`；`if (parsed && parsed.compacted) { … seeds.set(member.id, String(parsed.progress || parsed.summary || '').slice(0, 4000)) }`），而 vmu 的字段表 `vibe-math-vmu/kernel/turn/index.js:30–45` 里**没有这两个字段**。**

**证据链**：
1. 原文把 `contextPct`/`compacted` 当作**成员回复的一等字段**并在回合收尾处消费（5820–5824）；
2. 移植的派发表是**封闭枚举**（`FIELD_OWNERS` L30–45，`FIELDS = Object.keys(FIELD_OWNERS)` L45）——**表外字段没有 owner ⇒ 无处派发**；
3. 我 grep 移植的 `kernel/turn/index.js` 全字段名，**`contextPct`/`compacted` 零命中**。

**后果**：**vmu 单独跑一轮研究所时，"上下文将满 ⇒ 压缩 ⇒ 带摘要续跑"这条链在回合面不存在**；长回合会**一直膨胀到宿主上限**（或依赖宿主自身的压缩，而那不是原文的机制）。**这一条直接决定"vmu 能否独立跑完一轮长研究"。**

**修复方向（供 Lead 裁示，未实施）**：在 `FIELD_OWNERS` 增 `contextPct`（→ `vmu.metrics/observe` 或新 `vmu.context/report`）与 `compacted`（→ `vmu.records/seed`），并在 `kernel/turn/index.js` 的收尾处对齐原文 5820–5824 的语义（**含 `slice(0, 4000)` 的计数式截断**）。
