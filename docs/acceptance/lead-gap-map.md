# Lead 侧差距地图（Round 1 · vmu 现状，待 v5r 盘点回填）

> 用途：把用户点名的目标 1/2/5/6 在 **vmu 侧**的现状先钉住（有 `file:line` 证据），v5r 三份盘点回来后只需补"v5r 有 / vmu 没有"的对照列，即可直接排 Round 2 的实现任务。
> 证据口径：只认读过的代码，不认文档声称；文档声称与代码不符处单列。

## 目标 1 · 断点续跑 + 人工干预决策

### 1a 断点续跑（已存在的能力）
| 能力 | 位置 | 状态 |
|---|---|---|
| 单一 fold 投影 + 耐久键白名单 | `kernel/store.js`（`PUBLIC_KEYS` 11 键） | ✓ 存在（但白名单漏 `idempotency`，见 task-4/K2） |
| 暂停/恢复（真门禁，非标签） | `kernel/control.js:62,87`；`kernel/index.js:1218,1227`；消费点 `kernel/tasks.js:116,159`、`kernel/meeting.js:107,162`、`kernel/ballot.js:131,173`、`kernel/work.js:69` | ✓ 存在且已接线 |
| 工作流检查点 | `kernel/workflow.js:461-486`（`checkpoint`/`checkpointDue`，`vmu.workflow.checkpointEveryMs`） | ✓ 存在（内核侧） |
| 审计链锚点/检查点 | `kernel/auditchain.js:168,290,483`（`vmu.audit.chain.checkpointEvery`） | ✓ 存在 |
| 回合相位 `resume` | `kernel/turn/index.js:86`（`PHASES` 含 `resume`） | ✓ 存在 |
| 会议休会/复会 | `kernel/meetings.js:633`（`resume()`，`recessMaxMs`/`recessResumeRequiresMotion`） | ✓ 存在 |

### 1b 断点续跑（缺口，待 v5r 盘点确认后定实现）
- **会话级恢复入口**：vmu 侧未见"从耐久 fold 重建整个会话/成员名册/在途工作"的端到端入口（v5r 有 fold + session registry + ephemeral 重建，见 reader-a）。
- **在途工作的续跑语义**：`workflow.checkpoint` 只记检查点，未见"从检查点继续执行"的驱动。

### 1c 人工干预决策
| 能力 | 位置 | 状态 |
|---|---|---|
| 人类否决 veto | `kernel/human.js:64-101`（scope 钳制、理由要求、紧急事后补理由） | ✓ 代码存在，`vmu.human` 服务已注册（`kernel/index.js:756`） |
| 审批等待/超时 | `kernel/human.js:122-158`（`hold` 为默认，绝不静默放行） | ✓ 代码存在 |
| 观察员可见域 | `kernel/human.js:107-119` | ✓ 代码存在 |
| 人类仪表盘域 | `kernel/human.js:161-171` | ✓ 代码存在 |
| **人类可达面（工具）** | 全仓 **无** `vibe_vmu_human` 工具 | ✗ **缺口**：能力在，agent/人 够不到 |
| **审批闸门真的拦动作** | docs/17 §19 自述"审批队列未实现"；内核未见"未批只能排队"的强制点 | ✗ **缺口**（S-5） |
| 人类超时→配额/暂停联动 | 未见 | ✗ **缺口**（P1） |

## 目标 2 · 代理通信 / 协作 / 会议

### 2a vmu 侧现状
| 能力 | 位置 | 状态 |
|---|---|---|
| 会议原语（召集/议程/轮次/纪要/收束/复议） | `kernel/meeting.js`、`kernel/meetings.js`、`kernel/minutes.js` | ✓ 存在 |
| 表决（票型/法定数/未定论） | `kernel/ballot.js`、`kernel/ballotbox.js` | ✓ 存在 |
| 会议内禁言（纪律） | `kernel/meetings.js:372-384`（`disciplineMuteMs`、`VMU_MEETING_DISCIPLINE_DENIED`） | ✓ 存在（**仅会议内**） |
| 通知/订阅（含 inbox 通道名） | `kernel/notify.js:52-53`（`vmu.notify.channels` 默认 `['inbox','digest']`） | ⚠️ 只是**通知通道名**，不是成员间私信 |
| **群聊（消息 id/发言人/时间/回复目标/管理员/发言次数/禁言）** | 全内核**无** chat/chatLog 服务 | ✗ **缺口**（用户点名） |
| **私发信息 / 耐用信箱** | 全内核**无** mailbox/DM；`agent/inbox` 只是 DSH 钩子名（`kernel/loader.js:28`） | ✗ **缺口**（v5r 有 durable per-recipient mailbox） |
| **成员状态面板（总目标/计划/正在执行的子任务）** | 全内核**无** `statusPanel` 类服务（`workflow.js` 的 subtask 只是任务树深度） | ✗ **缺口**（用户点名"v5r 已实现"） |
| 任务板 CAS DAG | `kernel/tasks.js` | ✓ 存在 |

### 2b 会议系统 vs v5r
- **判据在 `_handoff/vmu/v5r-inventory-c.md`**（reader-c 正在产出"会议系统全清单：机制/命令/工具/参数/上下界"）。回来后逐条对照 `kernel/meeting.js`、`kernel/meetings.js`、`kernel/ballot.js`、`kernel/minutes.js`。

## 目标 5 · 数学引擎深度
- vmu 侧：`vibe-math-vmu/math-computation.js`（与 `vibe-math-v2` 那份**逐字节相同**）、`math-engines.js`、`kernel/math.js`（懒加载面）、`kernel/mathjobs.js`、`kernel/mathtools.js`。
- 待确认：numpy/scipy/pandas/sympy 专用适配是否存在；作业持久化/断点续算现状。
- **判据在 `_handoff/vmu/v5r-inventory-b.md`**（reader-b 负责 v5r 数学面 + 接缝 + 断点续算现状）。

## 目标 6 · v5r pack 下主代理是否为"助手"
- vmu 侧：`packs/v5r/prompts/v5r-persona.js`、`v5r-core.js`、`v5r-charter.js`、`v5r-blocks-a/b.js`；入口 `vibe-math-vmu.js:20-22,222`（**无条件注入** v5r 的 sectionPolicy/noticeBlock/extraPhases —— 违反"由 pack 声明驱动"，见 task-5/P6）。
- 待确认：主代理（academician）自动汇报、参数配置入口、人设装配。
- **判据在 `_handoff/vmu/v5r-inventory-c.md`**（reader-c 的"主代理角色"专章）。

## 跨目标的结构性结论（Round 1 已定）
1. **能力在、够不到**：vmu 有一批内核能力没有工具面/宿主接线（`vmu.human`、35 个工具面）。D-01 的工具面可达性是目标 1/2 的前置。
2. **文档领先代码**：docs/17 §19 自己写着"审批队列未实现"、docs/04 标"已接线"而真机断线。凡实现前先按代码核对。
3. **v5r 是验收标尺**：目标 2/3/4/6 的判据一律以 reader-a/b/c 的盘点 md 为准，不以任何一方文档的自述为准。
