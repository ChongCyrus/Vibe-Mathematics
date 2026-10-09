# vmu 08 · 会议 · 表决 · 工作流原语（Primitives）

> 状态：**草案 v0.1**（待 `01-v5r-reuse-map.md` 合并后补"v5r 等价物对照"）
> 上位：`01-philosophy.md`（R1 内核零策略 / R2 能力与挂点齐备 / R5 中间件）、`02-architecture.md`（内核 E、F 分区）
> 核心立场：内核只给**原语 + 状态机骨架 + 钩子**；**"什么条件下能开会、谁能开、几票算过、冻结期能不能发言、轮次怎么算完成"全部由中间件/pack 决定**。

---

## 1. 为什么"原语化"（本仓血的教训）

v5r 的 `s8-freeze-say` 真回归：**"本轮是否完成"的判据被写死在收束函数里**，于是"冻结期被拒的发言"让某个成员的 ask 永不收敛 ⇒ 重试耗尽 ⇒ 会议被**提前收束**。
**教训**：凡是"判定/门槛/完成条件"，都必须是**可替换的具名谓词**（由中间件提供），内核只负责**在正确时机询问**。

**vmu 的对策（硬要求）**
- 内核定义**判定点（decision points）**，每个判定点有一个**默认实现**（最保守、什么都不做），并**开放给中间件**；
- 判定点的**输入/输出结构**、**触发时机**、**失败策略**在 03/05 登记；
- 门禁：任何判定点被"写死"（无中间件接管能力）⇒ 红。

---

## 2. 会议原语（Meeting）

### 2.1 状态机骨架（内核提供，**不含门槛**）

```
(idle) ──convene──► (convened) ──open──► (in_session)
                          │                  ├─ round(n) ──► (in_session)
                          │                  ├─ hand_up(m) ──► (in_session)
                          │                  └─ close(reason) ──► (closed) ──► (idle)
                          └─ cancel(reason) ──► (idle)
```

**判定点（全部可被中间件接管）**
| 判定点 | 内核默认 | 典型 pack/中间件用法 |
|---|---|---|
| `meeting.can-convene` | 允许 | 只允许某角色召集；或"必须有未决项才允许召集" |
| `meeting.roster` | 全部在册者（按角色槽位） | 只邀请某角色；排除在飞成员 |
| `meeting.round-complete` | **所有被问者都有终态**（answered/silent/unreached） | 表决冻结期 ⇒ **不推进**（v5r 教训）；或"满足最小发言数即完成" |
| `meeting.wake-policy` | 顺序唤醒，retry≤N | 并发唤醒、优先级唤醒、预算感知 |
| `meeting.hand-policy` | 举手后按序发言 | 只允许特定角色举手；举手配额 |
| `meeting.close-policy` | 显式关闭 | 自动收束条件（全部发言完/超时/无新信息） |
| `meeting.summary` | 生成纪要（结构化） | 自定义纪要格式与落点 |

### 2.2 数据模型（公开部分）

`Meeting = { id, kind, agenda, roster[], state, rounds[], inputs{member→文本}, hands[], unreached[], history[], startedAt, closedAt?, closeReason? }`
- **`inputs` 只在"被接受"时写入**：被拒/被冻结的发言**不得**进入 `inputs`（否则会污染完成判定——v5r 血的教训）；
- 被拒的发言必须**具名留痕**（`history` 里 `what:'refused'` ＋ 原因），且**不消费举手**（可配）。

---

## 3. 表决原语（Ballot）

### 3.1 状态机骨架

```
(closed) ──open(target)──► (open) ──freeze?──► (frozen) ──unfreeze──► (open)
                              │                    │
                              ├─ cast(member,vote) │
                              └─ close(reason) ──► (tallied) ──► (decided|undecided)
```

**判定点**
| 判定点 | 内核默认 | 典型用法 |
|---|---|---|
| `ballot.can-open` | 允许 | "只有已登记正式证明/证伪的对象才能进入表决" |
| `ballot.who-may-open` | 全部在册 | 仅某角色（如"院士"由 pack 定义） |
| `ballot.eligible` | 在册有表决权者 | 排除临时角色、排除利益相关者 |
| `ballot.quorum-rule` | `m-unanimous`（可配枚举） | 自定义门槛 |
| `ballot.frozen` | 不冻结 | "冻结期禁止发言"（发言不推进轮次） |
| `ballot.cast-valid` | 结构合法即可 | 拒绝重复票、拒绝非成员票、拒绝代投 |
| `ballot.tally` | 布尔多数/未定论 | **自定义计票口径**（过程票不构成裁定等） |
| `ballot.after-decided` | 记录结论 | 触发下游（写库、开新阶段、通知） |

### 3.2 结论与"未定论"

- 结论三值：`true` / `false` / `undecided`（后者**必须带原因**：票不足、无胜方、无法判断…）；
- **过程票数绝不构成裁定**（沿用 v5r 纪律）：只有"决定性票型"才产生结论；
- 复议（reconsider）：以**原语**形式提供（`ballot.reopen`），门槛与资格由中间件定。

---

## 4. 任务与阶段原语（Tasks & Stages）

### 4.1 任务台账

`Task = { id, title, objective, owner(角色槽位或成员), deps[], state, brief?, createdAt, transitions[] }`
- **依赖**：`deps[]` 未完成 ⇒ 不允许 `start`（拒绝具名）；
- **归属**：任务提示词随负责人唤醒注入（见 06-§4.2）；
- **门槛可换**：`task.can-assign` / `task.can-transition` 均为判定点。

### 4.2 阶段机（Stage Machine）

- 阶段是**声明式列表**（`vmu.tasks.stages[]`），内核只提供 `advance/rollback/current`；
- **进入/离开阶段**触发 `settle/before|after` 钩子 ⇒ "结题条件""论文阶段门禁"由中间件定义；
- **默认零阶段**：不声明阶段 ⇒ 框架只是"持续运行"，不假装有流程（零策略）。

---

## 5. 控制流（Pause / Resume / Stop / 心跳）—— **实现现状，2026-10-09 校准 ✓**

| 动作 | 语义（真实现 ✓） | 证据／边界 |
|---|---|---|
| `kernel.pause(reason)` | 控制状态 → `paused`；**任务的新建与状态转换被具名拒** `VMU_STATE` ✓（"暂停而不挡工作"只是标签 ✗）；发 `control/paused` ✓ | 场景见 `tests/vmu-kernel.test.mjs` V7 组 ✓ |
| `kernel.resume(reason)` | → `running`，回执带 `resumedFrom` ✓；发 `control/resumed` ✓ | 同上 ✓ |
| `kernel.stop(reason)` | → `stopped`，清空注册；发 `control/paused{reason:'stopped'}` ✓；**已停止不能再 pause** ✓ | 同上 ✓ |
| `kernel.beat(note)` | 心跳计数 + 时间戳；发 `control/heartbeat` ✓ | `status().control.beats/lastBeatAt` ✓ |
| `kernel.control()`／`status().control` | `{state, pausedAt, pausedReason, resumes, stops, beats, lastBeatAt, wallClockMs, sinceLastBeatMs, stale}` ✓ | **`vmu.limits.wallClockMs` 的真实消费者** ✓（超预算 ⇒ `stale:true` ✓） |
| 工具面 | `vibe_vmu_control {action:'status'\|'pause'\|'resume'\|'stop'\|'beat'}` ✓，**仅在声明 `control:` 时出现** ✓（零机制 ✓） | 场景见 `tests/vmu-entry.test.mjs` V7 组 ✓ |

**仍未实现（诚实 ✗）**：
- **判定点** `control.can-pause` / `on-idle` / `on-timeout` / `degrade` **不存在** ✗（暂停是框架动作，不是中间件判定点 ✓；要定制就在 `control/paused` 上挂观察型规则 ✓）；
- **没有定时器/看门狗**：心跳由调用方驱动 ✗（内核不自带 scheduler；"空闲触发"需宿主 timer 服务 ⇒ 未接 ✗）；
- **暂停的门禁范围（本轮已扩 ✓）**：**任务 ✓ ＋ 会议（convene/openRound 与 speak）✓ ＋ 表决（open 与 cast）✓**；**归档/记录面尚未接** ✗（`library.append` 不受 pause 影响 ⇒ 见 §8 未核项 ✓）。

### 5.1 会议的三个控制键（**本轮已真正强制 ✓**）

| 键 | 语义（真实现 ✓） | 强制点 |
|---|---|---|
| `vmu.meetings.roundTimeoutMs` | 单轮超时（0＝不限 ✓）；超时后**再发言被具名拒** `VMU_STATE`（文案含"已过 N ms／预算 M ms" ✓） | `speak()` 用该轮自己的 `openedAt` 计算 ✓ |
| `vmu.meetings.quotesPerMessageMax` | 每条发言最多引用几条（默认 2 ✓）；**超限 ⇒ 具名拒** `VMU_INVALID_ARGUMENT`（含"at most 2 quote(s), got 3" ✓） | `speak(member, text, { quotes })` ✓（**本轮新增的加法式参数** ✓） |
| `vmu.meetings.quoteDepthMax` | 引用链深度上限（默认 3 ✓）；**超深 ⇒ 折叠并计数**（**不拒** ✓，回执带 `folded` 与 `foldingNotice` ✓，审计记 `quotes-folded` ✓） | 同上 ✓ |

> **纪律（两种相反策略，别混 ✗）**：**条数超限＝拒绝，深度超限＝折叠＋计数** ✓ —— 这是文档早就声明的差别 ✓，本轮才成为真实现 ✓（此前 `speak` 连 `quotes` 参数都没有 ✗）。

---

## 6. 与工作流脚本（M3）的关系

- 内核提供**桥**：脚本可 `await kernel.meetings.convene(...)`、`kernel.tasks.transition(...)`、`kernel.library.append(...)`（全部公开服务）；
- 脚本**输出结构化结果**，默认**不进提示词**（防污染）；
- 长流程（扇出/扇入）用脚本；**短判定**用 M1/M2（避免"小题大做"）。

---

## 7. 门禁（本篇验收判据）

1. **零策略**：内核里找不到任何"门槛/完成条件"的硬编码 ⇒ 静态门（R1）+ 代码评审；
2. **判定点可接管**：每个判定点都有"中间件接管后行为改变"的场景 ＋ "不接管则用默认"的场景；
3. **拒绝不污染**：被拒/被冻结的操作**不写入** `inputs`/票数/已完成集合（v5r 教训的回归测试）；
4. **完成判定正确**：冻结期场景 ⇒ 轮次**不得推进**（直接用 v5r `s8-freeze-say` 的等价场景）；
5. **结论三值**：`undecided` 必带原因；过程票不构成裁定；
6. **控制流一致**：pause/resume/stop 后无幽灵在飞；待续标记清/留行为符合 07-§3；
7. **可复现**：注入时钟下同 seed 两次会议/表决序列一致（R12）。

---

## 8. 未核项

- **判定点的可接管性未实测**：本文的"每个判定点都能被中间件接管"是**设计承诺** ⇒ 需 P1/P2 用"接管后行为改变＋不接管用默认"两场景证明；
- **v5r 等价场景尚未建立**：`s8-freeze-say`（冻结期误收束）的等价回归场景**待写** ⇒ 它是 I-1/I-2 不变量（01-§3.1）的首个回归证据；
- **议程/议题实体的字段集**（是否引入一等"议题/动议"实体）未定 ⇒ 待 v5r-pack 映射时裁；
- **会议与阶段机的交互**（会议是否可作为阶段推进的条件）未定。

> **机器可判定要求**：本篇每条门禁都要能指出对应的**断言**与**具名红**；每个判定点都要有"接管后行为改变"与"不接管用默认"两个可复跑**场景** ✓。

> **未核登记处**：以上各项已并入 **14-§2（U1–U12）** 与 **14-§1（O1–O7，均已裁定为 D13）** ✓。
