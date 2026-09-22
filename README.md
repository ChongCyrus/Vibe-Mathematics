# Vibe Mathematics — 多代理数学问题求解与验证框架（四架构）

[![npm](https://img.shields.io/npm/v/dsh-vibe-math)](https://www.npmjs.com/package/dsh-vibe-math)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/ChongCyrus/Vibe-Mathematics)](https://github.com/ChongCyrus/Vibe-Mathematics)

> 运行在 **DeepSeek Harness** 内的一组 **agent preset**（`vibe-math-v2` / `vibe-math-v3` / `vibe-math-v4` / `vibe-math-v5`），
> 用多代理协作自动求解数学问题并对结论做多代理交叉验证。四个预设共享「**断点续跑**、
> **中途人工干预**、**进度汇报**、**自然语言驱动**」底座能力，但采用四代不同的求解架构：
> **💡 `vibe-math-v2` 与 `vibe-math-v3` 同级主推**——两者都是成熟可用、正在维护的主推架构，根据你的实际需求自行选择（详见下方「怎么选」）；`vibe-math-v4` 是「常驻自组织合作研究」架构，`vibe-math-v5` 是最新的「研究所体系」（两者均为实验性）。
>
> - **`vibe-math-v2`（概率驱动 · JSON 数据层）✅ 主推**：`qs.json` 问题清单 + `Propos/` 命题库 + 概率驱动调度 + 代码启发式调度；
> - **`vibe-math-v3`（第三代 · 论文式 md + 规划代理 + 方法库）✅ 主推**：全部知识以 **Markdown 论文/研究报告式** 存储与续写（`Problems/` 问题清单+依赖+来源动机、`Progress/` 研究日志、`Propos/` 命题库、`Methods/` 通用理论发明库、`Verified/` 绝对可信）；调度前由**规划代理**自主制定接下来 N 步计划；解决过程中发明的理论/框架/工具/方法/思想由 **Method Keeper** 沉淀为可复用方法体系（如发明群论、泛函分析那样）。
> - **`vibe-math-v4`（第四代 · 常驻自组织合作研究）🧪 实验性**：一组**持久化常驻子代理**互相**留言 + 开会**，自主决定一切任务安排（无中央调度）；各自沉淀进度/命题/方法/子问题库并互相查阅；验证**仅当全体常驻一致（真 或 假）**才写入 `Verified/`，否则留库附概率；上下文达阈值自动 `/compact`；仅当全体一致认为原问题已解决才停止。
> - **`vibe-math-v5`（第五代 · 研究所体系）🧪 实验性 · 最新**：把常驻升级为一座**研究所**——**院士**（领头人 / 组织与协调中心，负责拆解与**分派**、定优先级、主持会议、督导进度）+ **常驻研究员**（有表决权，可自主雇佣/解雇自己的临时工）+ **临时工**（无表决权）；有**公共规章**、**群聊与会议**、**compare-and-set 任务板**、**真实解雇**；**≥ m 票布尔一致**才写入 `Verified/`（反向票阻塞、弃权不计票、未达门槛留库附平均概率）；状态存于**会话日志的 host-only 投影单元**，零 token 成本。

安装本插件包（或手动复制预设）后，DSH 的预设选择器里会出现**四个** agent preset。

---

## 🧩 架构图（v2 + v3 + v4 + v5）

> 静态架构图；完整流程说明见 [docs/架构图.md](docs/架构图.md)（v2 详解）与
> [vibe-math-v5/架构图.md](vibe-math-v5/架构图.md)（v5 全套细节图）；
> 可编辑生成脚本：[v2](docs/generate_framework_diagram_v2.py) / [v3](docs/generate_framework_diagram_v3.py) /
> [v4](docs/generate_framework_diagram_v4.py)（matplotlib → PNG）、
> [v5](docs/generate_framework_diagram_v5.mjs)（零依赖 Node → SVG，`node docs/generate_framework_diagram_v5.mjs`）。

### Vibe Math V2（概率驱动 · JSON 数据层）✅ 主推

![Vibe Math V2 架构图](示例图/框架图-v2.png)

**一句话流水线**：`qs.json` 按优先级取问题 → Explorer 拆方向（全死路则重派生）→ 每方向一个 Solver 多轮迭代（引理进 `Propos/`、解法回 `qs.json`，概率均 <1）→ 调度器选 r（命题 / 命题+证明·证伪 / 问题+解法）派 ≥3 验证器独立审查→辩论→裁决 → 概率=1 自动收口（问题 solved、命题 1/0，优先级置 `never`）；全程状态落盘，`resume` 断点续跑，`reportMode` 可 file/push/both 汇报。

### Vibe Math V3（论文式 md + 规划代理 + 方法库）✅ 主推

![Vibe Math V3 架构图](示例图/框架图-v3.png)

**一句话流水线**：全部知识以 **Markdown 论文/研究报告式**存储与续写（`Problems/` 问题清单含依赖/后生问题来源动机、`Progress/` 研究日志按方向按轮续写、`Propos/` 命题库、`Methods/` 通用理论发明库、`Verified/` 绝对可信）→ 调度前调度器构造状态简报并调用**规划代理**，规划代理一次性安排接下来 N 步（spawn solver/verifier/explorer/method-keeper、interrupt、promote、wait），代码校验后执行（超出并发的动作排队跨 tick 消费；规划失败自动回退 v2 式启发式）→ 验证器独立审查→辩论→**近共识裁决**（同侧且均值 ≥0.85/≤0.15 取均值，修复 v2 flat 误判）→ 概率=1 收口并生成 `Verified/` 卡 → 求解器的 `methods_used`/`new_inventions` 上报由 **Method Keeper** 沉淀/完善方法库（可组成体系层级、跨项目复用）。

### Vibe Math V4（常驻自组织合作研究）🧪 实验性

![Vibe Math V4 架构图](示例图/框架图-v4.png)

**一句话流水线**：起始产生 N 个**常驻子代理**（continuable，持久上下文）先各自头脑风暴、产出初始见解/方向 → 此后**所有任务安排由它们互相留言 + 集体开会自主决定**（框架只做消息总线/会议/任务板/产物沉淀，**绝不分配任务**）；每个常驻把有价值的产物按**价值程度 / 动机用途计划 / 自身概率估计**沉淀到**自己**的 `Progress/<id>/`、`Propos/<id>/`、`Methods/<id>/`、`Subproblems/<id>/` 库，并**可互相阅读**；验证由它们**自行商议**发起，**仅当全体常驻一致（真或假）**才写入 `Verified/`，否则留库附概率；常驻上下文量达阈值（默认 66%）自动 `/compact`；**仅当全体一致认为原问题已解决**才停止；可随时人工干预/增开/关闭常驻，支持断点续跑。

> 说明：V4 去掉 v3 的中央规划器与确定性角色（explorer/solver/verifier/planner/method-keeper），把"研究者"本身作为主体。详见 `vibe-math-v4/实现方案.md`。
> 保活机制（分级保活 A+B + 死锁看门狗）：团伙空闲超 `activityTimeoutMs` 会收到**自驱动** CHECKPOINT（建议继续解决/发消息/提议任务，而非"是否要停止"），且**并行填充**——A 分支一次尽量填满 `maxParallel` 并发预算（同一时刻唤醒多个空闲常驻，而非"只唤醒 r1、结束后再 r2"的串行），邮箱投递也并行送达多个空闲收件人；唤醒失败会自动重新武装心跳；若团队空闲且**无新产物**超过 `stallAutoMeetingMs`（默认 6 分钟），框架会自动召集一次同步会议让常驻们自行决定下一步；若某次**会议/验证卡死**（超过 2×`activityTimeoutMs` 仍无新的发言/投票），框架会自动**放弃该会议/验证**并回到正常自组织，避免一个坏掉的会议永久卡住整个团队；**会议不抢占验证**——验证进行时会议请求会暂存，验证做完再补开（保持一致共识的"求真"环节不被协调讨论打断）——框架始终只促成、从不指派任务。

---

### Vibe Math V5（研究所体系）🧪 实验性 · 最新

**一句话定位**：把 v4 的"一群互相留言的常驻"升级为一座**研究所**——有**院士**（领头人）、**常驻研究员**、
**临时工**三类职员，有所内**公共规章**，有**群聊与会议**，有**自主雇佣/解雇**，并且
**任何结论都必须由至少 m 名有表决权者一致给出布尔概率 1 或 0 才能写入 `Verified/`**。

![Vibe Math V5 架构图](示例图/框架图-v5.svg)

> 图源与全部细节图（成员生命周期、一轮时序、共识状态机、会议流程、调度优先级、状态折叠、
> 提示词构成、任务板、职权矩阵）：[`vibe-math-v5/架构图.md`](vibe-math-v5/架构图.md)。
> 上面这张 SVG 由零依赖脚本生成：`node docs/generate_framework_diagram_v5.mjs`。

```mermaid
flowchart TB
    OFF["👤 所办（会话根代理 / 人）<br/>不研究 · 不投票 · 只汇报与转达指令"]
    subgraph INST["🏛️ 研究所（所内自治：编制、组织与分派都在成员之间完成）"]
        ACAD["院士 acad —— 领头人 / 组织与协调中心<br/>L1 全所视图 · L2 分派 · L3 优先级<br/>L4 主持会议 · L5 督导 · L6 调人 · L7 对外"]
        RES["常驻研究员 r-n<br/>有表决权 · 可自主雇佣/解雇自己的临时工"]
        TMP["临时工 t-n<br/>无表决权 · 为特定任务临时雇入"]
    end
    subgraph FW["⚙️ 框架 vibe-v5 —— 只是媒介（middleware），绝不指派任务"]
        M["消息中继 · 会议/辩论 · 任务板 CAS+DAG<br/>m 票共识验证 · 上下文与活性 · 编制与雇佣 · 调度器"]
    end
    PROJ["💾 host-only 会话日志投影单元（键 vibeMathV5）<br/>11 类事件 · 纯折叠 applyV5Event · DSH 负责 checkpoint/restore"]
    FS["📁 Members/&lt;id&gt;/* · Shared/* · Verified/ · Problems/"]
    RULE{{"求真门槛：布尔一致 且 布尔票 ≥ m = min(quorumCap, 在册有表决权人数)"}}
    OFF <-->|"vibe_v5_* / /v5 命令　↔　status / report"| M
    M <-->|"每轮提示词　↔　单个 JSON 回执"| ACAD
    M <-->|"每轮提示词　↔　单个 JSON 回执"| RES
    M <-->|"每轮提示词　↔　单个 JSON 回执"| TMP
    ACAD -.->|"分派 / 督办 / 主持会议（所内组织，非框架行为）"| RES
    ACAD -.-> TMP
    M <--> PROJ
    M <--> FS
    M --> RULE
```

#### 职位与职权

| 职位 | 代号 | 表决权 | 职权 |
|---|---|---|---|
| **院士**（领头人） | `acad` | ✅ 一票，**与他人等重** | **组织与协调中心**：建立全所视图（`overview`）、把原问题拆解成任务并**分派**（`assign`）、设定优先级（`prioritize`）、召集并主持会议（`convene`）、督导进度（`nudge`）、调配临时工、对外汇报。**不能单方面定论**，也不能自我扩张编制。 |
| **常驻研究员** | `r-<n>` | ✅ 一票 | 在自己的方向上深入钻研；**可自主雇佣/解雇自己的临时工**；向院士汇报进展、接受其组织与分派（**有据理反对权**）。 |
| **临时工** | `t-<n>` | ❌ | 为特定任务临时雇入：可读/可想/可发言/可写自己的成果库/可认领或被分派任务；由**雇主或院士**解雇。代号永不复用。 |
| **所办**（主助手） | —— | ❌ | **不参与研究、不投票**。只汇报、把人的话翻译成工具调用，并代持平台要求的创建权（建所/增聘常驻研究员）。 |

**分工一句话**：**组织由院士负责，但判断属于每个人自己** —— 院士分派的是**工作**，不是**结论**。

#### 求真规则（V5 的核心）

一个对象进入 `Verified/` 必须**同时**满足：

1. 至少有 **m = min(`quorumCap`, 在册有表决权人数)** 名有表决权者投出**布尔概率值**；
2. 这些票**全部**是 `1`（绝对为真）或**全部**是 `0`（绝对为假）。

票是 `[0,1]` 的数值：**严格介于 0 与 1 之间 = 弃权/存疑**（不计入 m，但计入全组平均概率）。
**任何一张反向布尔票都会阻塞定论** —— 少数派无法靠别人弃权把结论推过去。
未达门槛的对象**留在原库**，并附上全组平均概率与完整辩论录，**不强行裁决**。

表决两段式：先【独立初评】（彼此不可见），未定论再进入【公开辩论】后重投，轮次上限 `verdictMaxRounds`。
`quorumMode: "all-unanimous"` 可切回 v4 的"全体一致"口径。

#### 运行机制

- **通信**：群聊（扇出给每位其他成员）、私信、只投给有表决权者；消息**逐收件人持久化**，
  先落盘再投递，群聊按 `chatDigestMs` / `chatDigestMax` 合批摘要（私信/会议/表决不合批）。
  一切所内通信都经框架中继（DSH 的邻接限制不允许成员之间直接发消息），但**署名始终是真实发送者**。
- **会议与验证互斥**（双向）：验证进行中会议请求会**暂存**；会议进行中提出的验证会**排队**——
  两个共识过程永不同时进行，避免互相饿死看门狗时钟。会议按**随机发言序**逐个收集意见，
  收口时汇总表决并检查是否全体认为已解决。
- **任务板**：compare-and-set（改前必须读到最新 `expected_revision`）+ 依赖 DAG（认领前必须全部依赖已完成，
  环检测拒绝坏依赖）+ 写范围重叠告警；owner 被解雇时任务自动收回。
- **雇佣 / 解雇**：院士与常驻研究员都可雇**自己的**临时工，配额按人（`maxTempPerMember`）与全所
  （`maxTempTotal`）双限；解雇是**真实的**——取消在途回合、释放常驻子会话、收回任务、丢弃未投递邮件。
- **活性**：主驱动是**一次性活动等待**（`vibe_v5_wait`，不轮询）；调度器按优先级推进
  （进行中的会议/验证 → 队列中的验证 → 暂存会议 → 在办任务 → 加急邮件 → 群聊摘要 → 停滞自动开会 → 兜底心跳），
  并发受 `maxParallel` 闸门限制；任务板的"推一把"按 `activityTimeoutMs` **节流**。
- **看门狗**：会议/验证超过 2×`activityTimeoutMs` 没有新发言/新票 → 放弃它并回到自组织；
  心跳**每次唤醒后都重新武装**，所以调度器不会永久冻结。
- **上下文**：达 `compactThreshold`（%）或累计 `compactAfterRounds` 轮时要求成员把工作状态浓缩进
  `Progress/`；**规章在 persona 里**，压缩后依然有效，不需要每轮重申。
- **停止**：**仅当全体有表决权者都认为原问题已解决**才结题（写 `Problems/conclusion.md`）。

#### 状态与持久化

研究所状态存在**会话日志的 host-only 投影单元**里（键 `vibeMathV5`）：框架的副作用只是往会话日志
追加 11 类事件，由 `applyV5Event` 纯折叠出状态。因此

- **零 token 成本**：这些事件**不进模型上下文**，不占成员的对话预算；
- **恢复走同一条代码路径**：跨进程重启与同进程 abort 后 resume 都由 DSH 的 checkpoint/restore 覆盖；
- v4 的 `State/*.json` 直写带来的"损坏静默覆盖 / 并发丢写 / 跨进程陈旧快照"这一整类问题在构造上被消除。

宿主若没有 `sessionProjections` 服务，v5 自动回退到加固 JSON（`State/<研究所>.v5state.json`，同一份折叠、
串行写、读前必 load），安装器的启动自检会报告这一降级。投影之外的文件（成员成果库、群聊、会议纪要、
辩论录、编制镜像、任务板镜像）都是**人可读产物**，手工改坏不会破坏研究所。

#### 提示词是怎么构成的

成员的"人设"（persona）承载**十节公共规章**（编制与同事、通用规章、资料库与 progress 格式、
组织与协调、表决规则、每轮节奏、雇佣解雇、任务板、上下文纪律、停止条件），在**入职时冻结**并随会话持久化；
每轮提示词只携带短小的**状态块**（我是谁 / 轮次 / m / 在册名单 / 我的任务 / 新到的消息）、**本轮问句**
和**回执契约**。回执契约里框架真正处理的每个字段都会出现并按职位裁剪
（临时工没有 `verdict`/`hire`/`fire`；非院士没有 `assign`/`prioritize`/`nudge`/`convene_meeting`）。

框架把"成员读到的文字"当作产品来保证：身份**显式传递、绝不猜测**；成员**先落盘进编制、再构造**它的入职
提示词；章程快照冻结在入职时，会话重建会框为 `【会话重建】` 而不是"刚入职"；没有院士时不出现任何院士叙事；
消息框头按**真实来源**标注（所办分派 ≠ 院士分派；督办 ≠ 分派）；框架反馈有独立发送者，
且**一次提示词只投递一条消息**。

#### 目录结构（研究所）

```
<会话工作区>/VibeMath/Projects/<项目>/Institutes/<研究所>/
├─ Institutes.md                 # 编制镜像（人读快照，勿手改）
├─ Problems/<id>.md              # 原问题
├─ Problems/conclusion.md        # 结题记录
├─ Members/<代号>/
│   ├─ Progress/progress.md      # 研究日志（压缩后恢复状态的主要依据）
│   ├─ Propos/<id>.md            # 命题
│   ├─ Methods/<id>.md           # 方法 / 理论 / 工具
│   └─ Subproblems/<id>.md       # 子问题
├─ Shared/
│   ├─ Chat/<日期>.md            # 群聊记录
│   ├─ Meetings/<mt-id>.md       # 会议纪要（含表决小节）
│   ├─ Debates/<对象>.md         # 辩论录（各轮票与理由 + 平均概率）
│   ├─ TaskBoard.md              # 任务板镜像
│   └─ State-of-institute.md     # 成员对"是否已解决"的判断快照
├─ Verified/<类型>/<id>.md       # 定论（只读；只有它能被当作已确立）
└─ State/README.md               # 说明"权威状态在会话日志投影里，不是这里"
```

#### 工具面

| 谁 | 工具 |
|---|---|
| **所办 / 人** | `vibe_v5_configure`（先配置）→ `vibe_v5_start`（开工）；`vibe_v5_resume` / `pause` / `stop`；`vibe_v5_set`（调参，立即生效）；`vibe_v5_status` / `report` / `members`；`vibe_v5_message` / `meeting`；`vibe_v5_hire` / `fire` / `add_researcher` / `remove_researcher`；斜杠命令 `/v5` |
| **全体成员** | `vibe_v5_say`（群聊/私信/致全体表决者）、`vibe_v5_wait`（免轮询等待）、`vibe_v5_record_progress`、`vibe_v5_record_proposition` / `_method` / `_subproblem`、`vibe_v5_read_library`（跨读他人库，只读）、`vibe_v5_propose_verify`、`vibe_v5_verdict`、`vibe_v5_task_create` / `_list` / `_get` / `_update`、`vibe_v5_meeting`（提议） |
| **院士**（另有 `academicianLeads` 开关） | `vibe_v5_overview`（全所视图）、`vibe_v5_assign`（分派，须写明理由与验收标准）、`vibe_v5_prioritize`、`vibe_v5_nudge` |

#### 与 v4 的关键差异

- **有领头人**：v4 无中央调度、一切靠讨论涌现；v5 在**所内**设有院士负责组织与分派
  （**框架仍然绝不指派**——指派者是院士，同样受 m 票约束）。
- **求真门槛从"全体一致"改为"≥ m 一致"**（可切回 v4 口径）。
- **状态存于会话日志的 host-only 投影单元**，由 DSH 负责 checkpoint/恢复（见上）。
- **三类职位 + 可雇用的临时工**：编制是可变的，雇佣/解雇是真实的可逆操作。
- **不引入任何 npm 实验包**：v5 是 preset 内的单个 `.js` 文件，零依赖。
- **会议与验证严格互斥**（双向排队）。

详见 [`vibe-math-v5/实现方案.md`](vibe-math-v5/实现方案.md)（文字规格）与
[`vibe-math-v5/架构图.md`](vibe-math-v5/架构图.md)（全部细节图）。

---

## ✨ 功能特色

- **多代理自动求解**：主代理把问题交给调度器，调度器派发 explorer / solver / verifier（v2/v3）与 **planner（规划代理，v3）**、**method-keeper（方法整理代理，v3）** 等子代理协同求解，**你无需逐节点手操**。
- **多代理交叉验证**：每个结论交给 ≥3 个「严苛审稿人」**独立审查 → 辩论（交流群）→ 裁决**（v3 默认**近共识裁决**：同侧且均值 ≥0.85/≤0.15 取均值，避免"0.9 vs 1"被误判成 0.5）。
- **论文式 Markdown 知识库（v3）**：问题清单（含问题间依赖、后生问题产生原因与计划）、研究日志、命题、方法库全部以 md 论文/研究报告式书写与续写（方向重派生时旧方向的日志自动归档保留）；**只有 `Verified/` 与验证器判真/假的对象绝对可信**，其余 md（含方法库未验证断言）仅作经验参考。
- **通用理论发明库（v3）**：解决过程中发明的理论体系/框架/工具/方法/思想（含经验性总结）经 `methods_used`/`new_inventions` 上报，由 **Method Keeper** 沉淀为 `Methods/` 方法卡（可组成体系层级、跨项目复用），像"解决方程时发明群论"一样形成系统化方法理论体系。
- **规划代理调度（v3）**：调度前调用规划代理，根据实际情况（问题依赖/存活率/可验证对象/并发预算/上次计划结果）自主选择最优调度方案，**一次安排接下来 N 步**各代理任务；规划失败自动回退启发式。
- **知识沉淀**：验证通过的结论晋升进 `Verified/` 可信知识库（v2/v3 另有 `Propos/` 命题库），供后续方向复用。
- **断点续跑**：调度状态、任务栈、代理注册表、决策队列、验证器历史准确率等全部落盘；重启后 `resume` 即可恢复（v2/v3 用进程纪元区分"同进程暂停→恢复"与"跨进程重启"；v3 的 md 本身即叙事断点）。
- **中途人工干预（并继续）**：`auto / manual` 模式随时切换；manual 在关键节点挂起决策等你 approve/reject/override（v3 新增**计划审批门**与**方法晋升门**）；可对任意子代理发消息 / 中断。
- **按项目隔离**：每个数学问题一个独立项目文件夹，互不干扰，可随时切换。
- **多会话并行隔离**：DSH 的 agent preset 是 standing mount（同一 preset 的所有会话共享一个插件实例），插件内部按**根会话 id** 隔离全部运行状态——两个会话可以同时各跑一个项目，各自的子代理会正确挂在自己会话名下，调度器 / 参数 / 决策队列 / 当前项目互不干扰（v3 另有**项目锁**，同一项目同一时刻只被一个会话调度）。当前项目按会话分别持久化（`VibeMath/current.<会话id>.json`）。
- **子代理权限可调控**：可限制子代理允许/禁止的工具、每轮外部工具调用上限，并明确告知其可读 `Verified/`、`Propos/`、`Methods/`、`Reliable/` 与进度日志。
- **可配置**：`vibe_math_setting.json`（含注释）自定义默认参数；`/vibe setup` 交互式问答配置。
- **自然语言控制**：主代理充当「助手 + 汇报者」，你把需求说成人话，它自己调用工具、汇报进度、配置参数。

**v4 / v5 特有**：

- **常驻自组织（v4）**：起始产生 N 个**持久化常驻子代理**，此后**所有任务安排由它们互相留言 + 开会自行决定**（框架只做消息总线/会议/任务板，绝不分配任务）。
- **研究所体系（v5）**：在 v4 的自组织之上引入**现实研究所的组织形式**——**院士**（领头人）负责拆解、**分派**、定优先级、主持会议、督导进度；**常驻研究员**有表决权并可**自主雇佣/解雇自己的临时工**；**临时工**无表决权；全部组织动作都由**所内成员**完成，框架仍然只做媒介。详见上方 [Vibe Math V5](#vibe-math-v5研究所体系-实验性--最新) 一节。
- **可调的一致性门槛（v5）**：对象要进 `Verified/`，需要 **≥ m = min(`quorumCap`, 在册有表决权人数)** 名有表决权者投出**一致的布尔票**（全 `1` 或全 `0`）；**反向票阻塞**、**弃权不计票但计入平均概率**；未达门槛则**留库附平均概率与完整辩论录**，不强行裁决。
- **零 token 成本的状态持久化（v5）**：研究所状态存于**会话日志的 host-only 投影单元**，不进模型上下文；跨进程与同进程恢复走同一条代码路径。
- **真实可逆的编制（v5）**：雇佣会创建常驻子会话，解雇会取消在途回合、释放子会话、收回其任务并丢弃未投递邮件；代号永不复用。
- **人可读镜像（v4/v5）**：编制表、任务板、会议纪要、辩论录、结题记录都以 Markdown 落盘，人随时可读；但**权威状态不在这些文件里**（v5 在投影单元），所以手工改坏它们不会破坏研究所。

---

## 🧮 Lean 形式化验证（四个架构共用，可调开关）

**它改变的不是"更严格一点"，而是审查对象本身。** m 个代理一致认为"这是对的"仍然是**共识**——
排除不了共同误解；Lean 通过是**机器核对**。于是剩下的唯一不确定项缩小为一个人能有效审查的问题：

> **Lean 代码里的定义 / 对象 / 条件 / 假设 / 结论，是否与命题原文完全一致？**

| | 原验证工作 | 形式化通过后的验证工作 |
|---|---|---|
| 审查对象 | 命题本身（推导是否正确） | **忠实性**：Lean 代码 ↔ 命题原文是否一致 |
| 结论强度 | 共识（可能共同出错） | 严格（内核已检查），前提是忠实性成立 |
| 副产品 | 无 | 可复用的 Lean 定义 / 引理库 |

### 开关：`formalVerify`（四个架构同名，默认 `'off'`）

| 取值 | 含义 |
|---|---|
| **`'off'`（默认）** | **不额外进行任何要求。** 成员提示词里不出现任何 Lean 内容，不写入任何形式化状态，验证流程与门禁完全不变（是**真正的无操作**，有断言与探针守着）。三个工具仍注册可用（主动调用照常工作）；主代理的 persona **始终**写着这三个工具与四个参数——否则这个开关就不可发现、"off" 也就无从打开 |
| `'encourage'` | **鼓励但不强制**：验证时先判断该对象的**实现难度**，能在可接受工作量内形式化就优先做；一旦 Lean 通过，审查重心转为**忠实性**。平时工作也鼓励把常用/可能复用的对象、假设、新定义随手形式化归档。**不设门禁** |
| `'require'` | **强制**：真/假结论必须满足「**Lean 已通过**」或「**显式记录了阻塞原因**」，否则本次裁定**不生效**——记为未定论（原因 `formal-required`）、写入「形式化待办」、群聊公告，对象留库待形式化后重新提议 |

> `require` 里的「显式记录阻塞原因」正是**"根据实现难度决定不做"**的落点：**决定权在代理，
> 但决定必须说出来、可审计**，不允许静默跳过。相关参数还有 `leanCommand`（默认 `lean`）、
> `leanArgs`（配合 `lake env lean`）、`leanTimeoutMs`（默认 120s）。

### ⚠️ 忠实性缺陷 ≠ 命题为假（重要）

Lean 通过只保证"这段代码过了内核"，**不保证它说的就是命题想说的**。所以当表决者逐条核对后
发现 Lean 代码与命题原文不一致（写窄了 / 写宽了 / 换了对象 / 漏了条件）时：

- **不得投 0**。投 0 的含义是"**该命题为假**"；一个写错的形式化会让框架把"形式化不合格"
  记成"命题被证伪"，在 v5 的全 0 一致规则下甚至会把命题写进 `Verified/` 标注**假**——
  用来求真的机制反而**伪造出一个错误的否定结论**。
- 正确做法：给一个严格介于 0 与 1 之间的值（记为弃权）+ 用回执
  `formal:{decision:'defect', note:'<具体偏差>'}` 记录偏差。框架随即**撤回这条证明的「已通过」状态**
  （降级为 `attempted`；`Verified/Lean/<id>.lean` **删除**，宿主删不掉时改写为"已撤回"说明，
  绝不把一个已撤回的证明留在大家找证明的位置；写入「形式化待办」），`require` 档下
  **本次裁定不定论**（`encourage` 档没有门禁，不得声称框架会强制搁置——那里靠表决者弃权阻止定论）；
  修正形式化并重新跑通后再投票。
- 只有表决者**独立于这份 Lean 代码**也能确定命题为假（并能给出独立理由）时才投 0。

> **回执通道**（不调用 Lean 工具的成员也能留下判断，`require` 档下必须留）：
> `"formal": {"target":"<对象id>", "decision":"used|blocked|defect", "file":"Formal/<对象id>.lean", "note":"难度判断/阻塞原因/具体偏差"}`。
> `decision='blocked'`/`'defect'` 时 **`note` 必填**（缺则整条拒绝）；`used` 只把对象记为 `attempted`；
> `off` 档下这个通道**失效**（否则 `off` 就不是真正的无操作了）。

> 注入提示词的另外三条硬要求（契约 §6）：工具名一律**全称**（`<prefix>lean_archive` 不是
> `lean_archive`——缩写不是注册名，代理照抄会调用一个不存在的工具）；归档可复用定义/引理**前先跑通**，
> 跑不通不许进库；**工具链缺失**（`LEAN_NOT_FOUND` 解析不到可执行文件 / `NO_SUBPROCESS` 宿主没有
> subprocess 服务）时把代码写下来归档并在 `note` 写明"宿主无 Lean 工具链"——这算显式阻塞原因，
> 门禁据此放行，不会因为装不了 Lean 而卡死。

### 归档：形式化代码放哪里

```
<VibeMath 根>/
├─ Formal/                              # ★ 跨项目可复用库（四个架构共用）
│   ├─ Lib/<name>.lean                  # 可复用定义 / 对象 / 假设（def / structure / notation）
│   ├─ Lib/Index.md                     # 名称 → 文件 → 类别 → 摘要（写新定义前先查这里）
│   ├─ Proved/<name>.lean               # 已成立的 Lean 命题 / 引理（机器已核对）
│   └─ Proved/Index.md
└─ Projects/<项目>/                      # （v5 为 Projects/<项目>/Institutes/<所>/）
    ├─ Formal/
    │   ├─ <对象id>.lean                 # 该对象的形式化工作文件
    │   ├─ Index.md                      # 对象 → 状态 → 文件 → 归档证明 → 运行结果 → 难度判断
    │   └─ TODO.md                       # require 模式下的「形式化待办」
    └─ Verified/
        ├─ <原有定论卡片>
        └─ Lean/<对象id>.lean            # ★ 归档证明：该定论对象对应的形式化代码
```

### 工具（每个架构三个，前缀跟随各自命名）

| 工具 | 作用 |
|---|---|
| `<prefix>_lean_run` | 在宿主 `subprocess` 服务上执行 Lean，返回 `{ok, exitCode, ms, stdout, stderr}`。**绝不抛异常**：缺工具链 → `LEAN_NOT_FOUND`，超时 → `LEAN_TIMEOUT`，路径越界 → 拒绝 |
| `<prefix>_lean_archive` | `kind='def'/'lemma'` → 归档到**跨项目** `Formal/Lib` 或 `Formal/Proved`；`kind='proof'` → 写 `Formal/<target>.lean`，运行通过则同时写 **`Verified/Lean/<target>.lean`** 并标记该对象为 Lean 通过；`kind='blocked'` → 记录显式难度判断/阻塞原因（**原因必填**） |
| `<prefix>_lean_lib` | 重建并返回三处索引与逐对象形式化状态——**写新定义前先查重、直接复用** |

例如 v5 是 `vibe_v5_lean_run` / `vibe_v5_lean_archive` / `vibe_v5_lean_lib`，v2/v3 是 `vibe_math_lean_*`，v4 是 `vibe_v4_lean_*`。

**边界（有意为之）**：框架**不内置 Lean**（不装工具链、不下载依赖；工具链缺失时优雅降级并如实记录）；
框架**不判断忠实性**（那是代理/人审查并投票的对象，框架只负责把审查焦点**换成**忠实性）；
**Lean 通过 ≠ 命题为真**——它只表示"这段形式化代码通过了内核检查"。

完整契约（参数、路径、状态迁移、提示词语义、门禁位置、索引格式、测试要求）见
[`docs/formal-verification.md`](docs/formal-verification.md)。

> **四个预设的 persona（主代理收到的提示词）都完整列出了上面三个工具与四个参数**，
> 并且 `prefix` 与 `text` 两个块逐行一致（只允许第 0 行不同）。这一层由
> [`audit-persona-surface.test.mjs`](audit-persona-surface.test.mjs) 与
> [`audit-persona-sensitivity.mjs`](audit-persona-sensitivity.mjs) 守护——加入本特性时正是
> 在四个预设里发现了"工具已注册、persona 从未列出"的缺陷（同批还发现 persona 少列了两条
> 增删常驻研究员的工具、`/v4`/`/v5` 的子命令列表与实现不一致；详见随包发布说明）。

---

## 🚀 安装

两种安装方式，任选其一（也可并存）：

### 方式 A：作为插件包一键安装（推荐，同时装出四个预设）

```sh
dsh plugin --profile <你的 profile> add dsh-vibe-math
# 或从 GitHub 直装：
dsh plugin --profile <你的 profile> add github:ChongCyrus/Vibe-Mathematics
```

安装时插件会自动把四个 preset 写入 `~/.dsh/.agent-presets/`：`vibe-math-v2/`、`vibe-math-v3/`、`vibe-math-v4/` 与 `vibe-math-v5/`。
之后新建会话，预设选择器里选择 **Vibe Math V3**（v3，**主推**）、**Vibe Math V2**（v2，**主推**）、**Vibe Math V4**（v4，常驻自组织）或 **Vibe Math V5**（v5，研究所体系）即可——v2 与 v3 同级主推，按实际需求自选（见「怎么选」）。
**升级包版本后重启 DSH，未手动改过的 preset 文件会自动更新到新版本**（细节见文末安装器说明）。

### 方式 B：作为 agent preset 手动安装

1. 把本仓库对应目录的文件复制到 preset 目录：

   ```
   C:\Users\<你>\.dsh\.agent-presets\vibe-math-v2\   ← 复制 vibe-math-v2/ 下的 agent.cordis.yml / preset.yml / vibe-math-v2.js
   C:\Users\<你>\.dsh\.agent-presets\vibe-math-v3\   ← 复制 vibe-math-v3/ 下的 agent.cordis.yml / preset.yml / vibe-math-v3.js
   C:\Users\<你>\.dsh\.agent-presets\vibe-math-v4\   ← 复制 vibe-math-v4/ 下的 agent.cordis.yml / preset.yml / vibe-math-v4.js
   C:\Users\<你>\.dsh\.agent-presets\vibe-math-v5\   ← 复制 vibe-math-v5/ 下的 agent.cordis.yml / preset.yml / vibe-math-v5.js
   ```

2. 新建一个会话，在 preset 选择器里选 **「Vibe Math V2」** / **「Vibe Math V3」** / **「Vibe Math V4」** / **「Vibe Math V5」**。
3. 会话启动后即可使用：v2/v3 的工具是 `vibe_math_*`、v4 是 `vibe_v4_*`、v5 是 `vibe_v5_*`；输入框键入 `/vibe`、`/v4`、`/v5` 有自动补全。

> 修改 preset 文件后需**重启 DSH 进程**再开新会话（preset 的 standing mount 会缓存到进程退出）。

### DSH 版本适配与依赖

- **形态依赖**：四个 preset 依赖 DSH 的标准 **agent-preset 机制**（`~/.dsh/.agent-presets/<id>/` + preset picker）与 **bundle patch 机制**（`cordis.patch.yml` 注入安装器）。
- **宿主插件行**：`agent.cordis.yml` 引用宿主提供的 `@deepseek-ai/dsh-*` 插件行（persona、agent-instructions、tool-bash/pwsh、tool-fs/fs-search、tool-jobs、skill-filesystem、tool-skill、tool-goal、plan-mode、compaction、subagent/workflow、ask-user、todo、web 等，约 21 个唯一包名）。宿主缺行会导致 preset 挂载失败（会话启动时报错）。
- **宿主服务 API**：预设插件消费 `subagents`（startContinuable / **sendMessage**（续做/唤醒；`followup` 仅为 `Agent` 对象方法、**不是** `subagents` 服务方法）/ interrupt / drainContinuableChildren（v5 用于**真实解雇**））、`agents`（get/roots）、`tools`（register/restrict）、`commands`（register）、`fs`（resolve/stat/readText/writeText/listDir），以及**可选** `subprocess` / `sandboxPolicy` / `compaction` / `sessionProjections` / `sessions`。这些 API 形状随 DSH 版本演进；本项目**已在 `dsh-v0.1.5-rc.2` 上逐项核对并适配**（`package.json` 的 `dsh.testedVersion`）。**注意：DSH 0.1.2 起 `subagents.startContinuable` 的 `agentOptions` / `toolFilter` 需要宿主 provider 声明对应 capability**（spawn / fork 进程内 provider 均支持，v4/v5 指定成员模型/路由与工具权限依赖于此）。
  > **2026 兼容性修复要点**（详见 `../COMPAT-AUDIT-ROUND2.md`）：① `tools.restrict()` 对**未注册的工具名抛错**，而 filter 在建立子代理时应用，故权限名表必须只含本部署真正注册的名字——v2/v3 原先硬编码 `web`/`fetch`/`bash`（其中 `bash` 在 Windows 被 `disabled`）会导致"想收紧权限时子代理永远起不来"；② v4 的真实 `/compact` 原先在 `subagent/end` 里查 `agents.get()`，但该事件在子代理**已被移出注册表之后**才触发，属死代码，已改为在 `subagent/start` 捕获引用；③ 可选服务改为**惰性读取**，不再在 `apply()` 快照（否则挂载顺序会让 `subprocess` 永久为 undefined 而静默不建目录）。
- **DSH STORE 兼容声明**：`package.json` 的 `dsh.compatibility.dshReleases` 对每个完整 DSH 版本逐项声明 `compatible` / `incompatible` / `unknown`（当前已声明 `0.1.2-alpha.4` … `0.1.5-rc.2` 共 8 个版本为 `compatible`，实测目标为 `0.1.5-rc.2`）；`engines.node` 为 `^22.19.0 || >=24.0.0`。
- **运行时自检（能力 + 版本双检）**：安装器（bundle 插件）每次启动时：**① 尽力探测 DSH 版本**（读 `@deepseek-ai/dsh/package.json` 或 `DSH_VERSION` 环境变量；DSH 未通过公开 service/context 暴露版本，故为尽力而为，探测不到就跳过）。若探测到且该版本未被 `dshReleases` 声明为 `compatible`，会给出明确提示；**② 再对宿主服务与关键 API 做能力自检**（这是真正的挂载门槛）：`subagents`/`agents`/`tools`/`commands`/`fs` 为**必需**（缺失即 warning），`subprocess`/`sandboxPolicy`/`compaction`/`sessionProjections`/`sessions` 为**可选**（缺失只提示"功能会静默降级"，不影响挂载；`sessionProjections` 缺失时 v5 的研究所状态回退到加固 JSON），另含 `fs.resolve` 返回形状检测与 subagent `agentOptions`/`toolFilter` capability 检测。preset 挂载失败时先看 DSH 日志里的自检 warning。
- **升级路径**：DSH 升级后无需重装本包；升级本包用 `dsh plugin update dsh-vibe-math`，重启 DSH 后安装器会自动把 preset 更新到新版本（见上文「安装」说明）。

---

## 🧭 四个预设怎么选

> **💡 `vibe-math-v2` 与 `vibe-math-v3` 同级主推，按你的实际需求自行选择：**
>
> - **选 `vibe-math-v2`（概率驱动 · JSON 数据层）**，如果你：
>   - 偏好**结构化 JSON 数据**（`qs.json` / `Propos/<分类>_Propos.json` / `Verified/` 卡），方便程序化检索与二次加工；
>   - 想要**成熟稳定的代码启发式调度**（优先级 + 概率，行为可预期、不依赖规划代理的"临场发挥"）；
>   - 不需要方法库沉淀 / 论文式叙述，数据以字段为主即可。
> - **选 `vibe-math-v3`（论文式 md + 规划代理 + 方法库）**，如果你：
>   - 偏好**论文/研究报告式的自然语言知识库**（问题清单含依赖与后生问题来源动机、研究日志按方向按轮续写，人类可读、可自由续写）；
>   - 希望调度由**规划代理**根据实际情况自主制定 N 步计划（更灵活，失败自动回退启发式）；
>   - 希望**通用理论发明库**——求解中发明的理论/框架/工具/方法/思想经 Method Keeper 沉淀为可复用、可体系化、跨项目扩充的方法论（像"解决方程时发明群论"）；
>   - 接受"只有 `Verified/` 绝对可信，其余 md 为经验参考"的可信分层。
>
> 两者都成熟可用、持续维护，且都支持断点续跑、人工/自动干预、进度汇报、多会话隔离、命题晋升、近共识/加权裁决等核心能力；切换成本低（同一套 `vibe_math_*` 工具与 `/vibe` 命令、同一套参数体系）。
>
> - **选 `vibe-math-v4`（常驻自组织）**，如果你想要一组**持久化常驻子代理**互相留言开会、**完全自组织**（无领头人、无中央调度），并且能接受"全体一致才定论"这种严格门槛。
> - **选 `vibe-math-v5`（研究所体系）**，如果你想要：
>   - **有组织的自组织**——现实研究所那样有**领头人（院士）**负责拆解、分派、定优先级、主持会议、督导进度，但**判断仍归每个人自己**；
>   - **可增减的编制**——常驻研究员 + 可**自主雇佣/解雇**的临时工（临时工无表决权，适合处理核对、试算、资料整理等杂活）；
>   - **可调的一致性门槛**——`m = min(quorumCap, 有表决权人数)` 票布尔一致即定论（比"全体一致"更容易收敛，同时**反向票仍然阻塞**，少数派不会被弃权淹没）；
>   - **零 token 成本的状态持久化**——研究所状态存于会话日志的 host-only 投影单元，不占成员上下文预算。
>
> **⚠️ `vibe-math-v2` 与 `vibe-math-v3` 是成熟主推架构；`vibe-math-v4`、`vibe-math-v5` 是实验性架构，** 均可选择；老 `vibe-math-v1` 已被移除（本包仅含 v2/v3/v4/v5）。

| | **v2（概率驱动 · 主推）** | **v3（论文式 md · 主推）** | **v4（常驻自组织 · 实验）** | **v5（研究所体系 · 实验）** |
|---|---|---|---|---|
| 定位 | **主推**（JSON 数据层） | **主推**（第三代） | **实验性**（第四代） | **实验性**（第五代） |
| 核心思想 | 概率驱动：`qs.json` 问题 + `Propos/` 命题库，按「正确概率 / 价值」调度 | **论文式 md 知识库 + 规划代理调度 + 通用理论发明库** | **持久化常驻子代理自组织**：互相留言 + 开会决定一切任务，无中央调度 | **研究所**：院士做组织与分派，成员各自研究；**≥ m 票布尔一致**才定论；临时工可按需雇入 |
| 数据 | `qs/qs.json` + `Propos/<分类>_Propos.json` + `Reliable/` | `Problems/` + `Progress/` + `Propos/` + `Methods/`（全部 md，软规范锚点 + 自由叙述）+ `Verified/` | `Problems/` + **按常驻 id 归属**的 `Progress|Propos|Methods|Subproblems/<id>/` + `Shared/`（会议/任务板/辩论）+ `Verified/` | 同 v4 的按成员归属布局，另加 `Institutes.md`（编制镜像）；**权威状态在会话日志投影里**，文件只是镜像与工作区 |
| 角色 | explorer → 逐方向 solver → verifier | **planner（规划代理）** → explorer → 逐方向 solver → verifier → **method-keeper（方法整理代理）** | **N 个常驻研究者**（continuable），无固定角色 | **院士 acad**（领头人）+ **常驻研究员 r-n**（有表决权）+ **临时工 t-n**（无表决权，可雇可解雇）+ 所办（不研究不投票） |
| 调度方式 | 代码启发式（优先级 + 概率） | **规划代理产出 N 步计划**（校验后执行，失败回退启发式） | **无中央调度**：任务由常驻互相留言/开会（框架只做媒介，不指派） | **框架仍不指派**；由**院士**拆解/分派/定优先级/督导，成员可据理反对；框架只做中继、任务板、会议与计数 |
| 收口规则 | 解法/证明达概率 `1` 即收口，`never` 永不调度 | 同 v2（近共识裁决修复 flat 误判） | **仅当全体常驻一致（真 或 假）**才写入 `Verified/`，否则留库附概率 | **布尔票 ≥ m = min(`quorumCap`, 有表决权人数) 且全为 1 或全为 0** 才写入 `Verified/`；反向票阻塞；弃权不计票但计入平均；（可切回 v4 口径） |
| 停止 | 全解或卡死 | 全解/无候选 | **仅当全体常驻一致认为原问题已解决**才停止 | 同 v4：**全体有表决权者一致认为原问题已解决**才结题 |
| 上下文 | 无 | 无 | **常驻上下文达阈值自动 `/compact`**（可调） | 同 v4（阈值/轮数可调，压缩后规章仍在 persona 里生效） |
| 特设能力 | 命题「价值/关键性」自动晋升问题清单；`reportMode file/push/both`；`priorityAdjust` | **方法库沉淀循环**（`methods_used`/`new_inventions` → Method Keeper）；**计划审批门/方法晋升门**；**项目锁**；后生问题「来源与动机」一等公民 | **常驻各自沉淀 + 互相阅读**；**全体一致验证**；**随时增开/关闭常驻、留言干预**；**断点续跑** | v4 的全部能力，另加：**真实雇佣/解雇**（释放子会话、收回任务）；**compare-and-set 任务板 + 依赖 DAG**；**会议与验证严格互斥**；**编制镜像与结题记录**；**状态零 token 成本** |

四者都支持：断点续跑（`vibe_math_resume` / `vibe_v4_resume` / `vibe_v5_resume`）、人工干预与暂停恢复、
按项目隔离、子代理权限调控、自然语言驱动。**v2 与 v3 均为同级主推**——偏好结构化 JSON 数据与确定性调度选 v2，
偏好论文式 md、规划代理与理论发明库选 v3；v4 是完全自组织的常驻合作研究，v5 是"有领头人 + 可增减编制 + 可调门槛"的研究所体系。

---

## 🧠 架构与分工（v3 · 第三代）✅ 主推

框架 = **一个主代理（助手）+ 一个代码调度器 + 一个规划代理 + 六类子代理**。

| 角色 | 类型 | 职责 |
|---|---|---|
| **主代理** | LLM（会话里的那个助手） | **自然语言接口 + 汇报者 + 助手**。它**自己不求解、不调度**，只负责：把你的话翻译成 `vibe_math_*` 工具调用、汇报进展、问答式配置参数、执行调控命令。 |
| **调度器** | 插件代码（非模型） | 唯一主控：维护 md 知识库索引、构造状态简报、**校验并执行规划代理的计划**、写文件、推进状态机。**硬约束（并发/幂等/已验证不再调度/写所有权）由代码强制**。 |
| **Planner（规划代理）** 🆕 | 子代理 | 每次准备派发时，读取状态简报（问题+依赖+存活率、可验证对象、活跃代理、并发预算、可用方法、上次计划结果），**自主选择最优调度方案，一次安排接下来 N 步**（spawn/continue/interrupt/promote/verify/method-keep/wait）。输出 JSON 计划，由调度器校验后执行；失败自动回退启发式。 |
| **Explorer 子代理** | 子代理 | 元认知头脑风暴：约束分解、边界测试、相似问题映射，把问题拆成多个「大相径庭」的求解方向（全死路则重派生）。开工前先查 `Methods/` 方法库。 |
| **Solver 子代理** | 子代理 | 每个方向一个专属求解器，**同一会话内多轮迭代**，产出引理（含证明）、子路线、存活概率、完整解法，并**上报 `methods_used` 与 `new_inventions`**（本轮回新发明的方法/工具/思想）。 |
| **Verifier 子代理** | 子代理 | 每个验证对象 ≥3 个独立「严苛审稿人」，独立审查 → 辩论（交流群）→ **近共识裁决**（同侧且均值 ≥0.85/≤0.15 取均值，否则 flat/forced）。 |
| **Method Keeper（方法整理代理）** 🆕 | 子代理 | 定期消化近期工作与新发明上报，**提炼新方法卡、合并碎片、完善体系结构（上级体系/子方法）、维护可信断言**，把求解中发明的理论/框架/工具/方法/思想沉淀进 `Methods/` 通用理论发明库。 |

> 一句话分工：**主代理负责“和人对话”，规划代理负责“定计划”，调度器负责“执行与守界”，子代理负责“动脑”，Method Keeper 负责“把发明沉淀成理论”。**

### 架构与分工（v4 / v5）

| | **v4（常驻自组织）** | **v5（研究所体系）** |
|---|---|---|
| 主体 | N 个常驻子代理（continuable） | 院士 + 常驻研究员 + 临时工（全部是 continuable 子代理） |
| 谁安排任务 | **没有人**：靠互相留言与开会自行涌现 | **院士**（所内成员，同样受表决规则约束）；框架仍不指派 |
| 谁做判断 | 各自；全体一致才定论 | 各自；**≥ m 票布尔一致**才定论 |
| 协调机制 | 消息 + 会议 | 消息 + 会议（与验证严格互斥）+ **compare-and-set 任务板** |
| 编制 | 常驻，可增开/关闭 | **可增减**：常驻研究员由所办批准增聘；临时工由院士/研究员自主雇佣解雇 |
| 状态 | `State/*.json` 直写 | **会话日志 host-only 投影单元**（零 token 成本、由 DSH checkpoint/restore） |

v5 的完整架构（含成员生命周期、一轮时序、共识状态机、会议流程、调度优先级、状态折叠、提示词构成、
任务板、职权矩阵）见 [`vibe-math-v5/架构图.md`](vibe-math-v5/架构图.md)；文字规格见
[`vibe-math-v5/实现方案.md`](vibe-math-v5/实现方案.md)。

---


## 📁 目录结构

### v2（概率驱动 · 主推）

```
<会话工作区>/VibeMath/
├─ current.json                        # 当前项目
├─ vibe_math_setting.json             # （可选，全局回退）默认参数 JSONC，含注释
└─ Projects/<项目>/
   ├─ vibe_math_setting.json          # 该项目默认参数
   ├─ qs/qs.json                       # 问题清单：概述/已解决/解法列表(完整解法·正确概率)/优先级/progress
   ├─ Propos/<分类>_Propos.json        # 命题库：概述/布尔估计/细类型/证明·证伪列表/优先级/价值·关键性/progress
   ├─ Reliable/                        # 可信参考文献（只读，用户放入）
   ├─ Verified/                        # 定论事实索引（布尔估计=0/1 的命题）
   ├─ Verification_logs/               # 每轮验证的辩论记录（审计用）
   ├─ Progress_Logs/                   # 定期进度报告 report.json
   └─ VibeMath_State/                  # 调度器私有持久状态（断点恢复用）
```

### v3（论文式 md + 规划代理 + 方法库）✅ 主推

```
<会话工作区>/VibeMath/
├─ Methods/                            # 【全局】跨项目通用理论发明库（v3，晋升自项目级）
├─ current.<会话id>.json               # 每会话当前项目（多会话并行互不覆盖）
├─ vibe_math_setting.json             # （可选，全局回退）默认参数 JSONC，含注释
└─ Projects/<项目>/
   ├─ vibe_math_setting.json          # 该项目默认参数
   ├─ Problems/<id>.md                 # 问题清单：每问题一个 md（软规范锚点：ID/类型/状态/优先级/依赖/被依赖/来源/计划
   │                                   #   + ## 陈述 / ## 来源与动机（后生问题：产生流程/动机/回填计划）/ ## 解法候选）
   ├─ Progress/<id>.md                 # 聚合研究日志索引（各方向摘要 + 引理索引 + 各轮记录）
   ├─ Progress/<id>/<方向id>.md         # 每方向一个独立文件（代理自组织直接写，方向间无并发冲突）
   ├─ Propos/<分类>/<id>.md            # 命题库：每命题一个 md（陈述/证明尝试/证伪尝试，软规范锚点 + 自由叙述）
   ├─ Methods/<id>.md                  # 【通用理论发明库】方法卡：理论体系/框架/工具/方法/思想（含应用记录/改进历史/体系层级）
   ├─ Verified/命题/<id>.md            # 绝对可信：调度器生成的已验证命题卡（只读）
   ├─ Verified/问题/<id>.md            # 绝对可信：已解决问题的完整可信解法卡（只读）
   ├─ Reliable/                        # 可信参考文献（只读，用户放入）
   ├─ Notes/                           # 自由笔记（不参与调度）
   ├─ Logs/Verification/               # 每轮验证的辩论记录（审计用）
   ├─ Logs/Plans/                      # 每次调度计划 + 执行结果（规划学习闭环）
   ├─ Logs/报告.md                     # 论文式人读进度报告
   └─ State/                           # 调度器私有持久状态（agents/tasks/plans/verifier_accuracy/index/项目锁/进程纪元）
```

**铁律（v2 通用）**：调度器是**唯一文件写者**（子代理只返回结构化 JSON，从不写文件）。
**v3 铁律**：只有 `Verified/` 与验证器判真/假的对象**绝对可信**；其余 md（未定论命题、研究日志、方法库未验证断言）仅作经验参考；调度器只解析软规范锚点行与条目标题行，从不解析正文散文。**v3 支持代理直接写 md**（自组织定位各自归属文件，如求解器写 `Progress/<id>/<方向id>.md`、新引理写 `Propos/<分类>/<id>.md`、方法整理代理写 `Methods/<id>.md`）；并发安全靠**写锁**——写任何文件前调 `vibe_math_claim_write`、写完 `vibe_math_release_write`（同一文件同一时刻只允许一个代理写），内容留在 md，轻量元数据经 `vibe_math_sync_meta` 上报给调度器。

### v5（研究所体系 · 实验）

```
<会话工作区>/VibeMath/Projects/<项目>/Institutes/<研究所>/
├─ Institutes.md                 # 编制镜像（人读快照：代号/职位/状态/雇主/方向/轮次/上下文%）
├─ Problems/<id>.md              # 原问题
├─ Problems/conclusion.md        # 结题记录（全体有表决权者一致认为已解决时生成）
├─ Members/<代号>/
│   ├─ Progress/progress.md      # 研究日志（叙述体，可追加；压缩后恢复状态的主要依据）
│   ├─ Propos/<id>.md            # 命题（含证明尝试/证伪尝试）
│   ├─ Methods/<id>.md           # 方法 / 理论 / 工具（含定义记号/应用记录/改进历史）
│   └─ Subproblems/<id>.md       # 子问题
├─ Shared/
│   ├─ Chat/<日期>.md            # 群聊记录（含建所/雇佣/解雇/会议/表决/结题公告）
│   ├─ Meetings/<mt-id>.md       # 会议纪要（各成员发言 + 表决小节）
│   ├─ Debates/<对象>.md         # 辩论录（各轮票与理由 + 全组平均概率）
│   ├─ TaskBoard.md              # 任务板镜像
│   └─ State-of-institute.md     # 成员对"是否已解决"的判断快照
├─ Verified/<类型>/<id>.md       # 定论（只读；只有它能被当作已确立）
└─ State/
    ├─ README.md                 # 说明"权威状态在会话日志投影里，不是这里"
    └─ <研究所>.v5state.json      # 仅当宿主缺 sessionProjections 时的回退权威源
```

> 启用 Lean 形式化验证时另有两个目录：本所 `Formal/`（工作文件 + 索引 + 形式化待办）与 `Verified/Lean/`
> （**归档证明**），以及**跨项目**的 `<VibeMath根>/Formal/{Lib,Proved}/`（可复用定义与已证引理）——详见
> 上方「Lean 形式化验证」一节。

**v5 铁律**：① 权威状态在**会话日志的 host-only 投影单元**（键 `vibeMathV5`）里，上表中除
`State/<研究所>.v5state.json`（降级回退）之外的一切文件都只是**镜像/工作区**，手工改坏不会破坏研究所；
② 成员**只写自己的库**（`Members/<自己的代号>/`），但可以读任何人的库；
③ 只有 `Verified/` 与标注"已验证·真/假"的卡片**绝对可信**，其余（含 `Methods/` 里的未验证断言）只是经验参考，
引用必须注明"未验证"；④ 入库必须写明**价值程度 / 动机用途计划 / 自己的概率估计**三项，缺一不可。

---

## ⚡ 快速上手

### 方式 A：直接对话（推荐，最省事）

因为主代理内置了使用说明，你**直接说人话即可**：

```
帮我用 Vibe Math 证明 √2 是无理数。
```

主代理会自动：`vibe_math_add_problem` 加题 → `vibe_math_start` 启动 → 之后你随时问它进度。

```
现在进展怎么样了？
```

主代理会自动调用 `vibe_math_status` / `vibe_math_report` 并把结果用人话汇报给你。

### 方式 B：命令 / 工具（精确控制）

在对话里直接调用工具（参数为 JSON）：

| 工具 | 作用 |
|---|---|
| `vibe_math_add_problem` | 加题（id/description/priority/dependencies?；v3 生成 `Problems/<id>.md`） |
| `vibe_math_add_proposition` / `vibe_math_list_propositions`（v2/v3） | 添加 / 列出命题库（id/概述/布尔估计/细类型/价值·关键性；v3 生成 `Propos/<分类>/<id>.md`） |
| `vibe_math_start` / `vibe_math_resume` | 启动 / 断点恢复调度器 |
| `vibe_math_pause` / `vibe_math_abort` | 暂停 / 终止（中断所有子代理） |
| `vibe_math_status` / `vibe_math_report` | 查看状态 / 完整进度报告 |
| `vibe_math_set_mode` | 切换 `auto` / `manual` |
| `vibe_math_set_params` | 运行时调参 |
| `vibe_math_setup` | 返回参数 schema（交互式配置用） |
| `vibe_math_save_settings` | 把当前参数存成新默认 |
| `vibe_math_template` | 生成默认参数模板文件 |
| `vibe_math_new_project` / `vibe_math_set_project` / `vibe_math_list_projects` | 项目管理 |
| `vibe_math_list_decisions` / `decide` | 查看 / 裁决人工决策（v3：`node=plan` 计划审批 / `node=method-promote` 方法晋升） |
| `vibe_math_list_agents` / `vibe_math_message_agent` / `vibe_math_interrupt_agent` | 查看 / 发消息 / 中断子代理 |
| `vibe_math_plan`（v3） | 查看待执行计划 / 上次计划，或 `force:true` 强制触发一次规划 |
| `vibe_math_index`（v3） | 从 md 知识库重建机器索引（`State/index.json`） |
| `vibe_math_method_add` / `vibe_math_method_list`（v3） | 手动添加 / 列出方法卡（项目 + 全局） |
| `vibe_math_lock_status`（v3） | 查看项目锁占用 |
| `vibe_math_claim_write` / `vibe_math_release_write`（v3） | 申请 / 释放某个 md 文件的**写锁**（代理直接写文件前调用；同一文件同一时刻只允许一个代理写，防并发冲突） |
| `vibe_math_sync_meta`（v3） | 代理把内容写进 md 后上报**轻量元数据**（方向状态/存活率/引理 id/方法卡 id/新发明），让调度器同步索引——内容留在 md，不进 JSON |

斜杠命令（与工具等价）：`/vibe start|resume|pause|abort|status|report|mode <auto|manual>|setup|save|template [global|project]|add <id> <desc>|add-proposition <id> <概述>|list-propositions|project [list|new <name>|<name>]|decisions|agents`（v3 另有 `methods|index|plan|lock`）

---

## 🎓 教学：让主代理替你干活

### 1. 自然语言驱动（不用记命令）

主代理的作用就是当你的「翻译官」。你只需描述**目标**，它会自己选择并调用工具：

| 你说的话 | 主代理做的事 |
|---|---|
| “求解 / 证明 XXX” | `add_problem` + `start`，之后汇报 |
| “现在进度怎么样 / 有哪些代理在跑” | `status` / `report` / `list_agents` 并总结 |
| “暂停 / 终止求解” | `pause` / `abort` |
| “切到人工模式，我要逐步把关” | `set_mode manual`，之后有决策就 `list_decisions` 提醒你 |
| “给 q1 的某个求解方向换个思路（比如改成构造性证明）” | `list_agents` 找到 childId → `message_agent` 注入新指令 |
| “中断某个卡住的子代理” | `interrupt_agent` |

### 2. 问答式参数配置（/vibe setup）

你甚至不用记参数名。说：

```
帮我配置一下参数。
```

主代理会调用 `vibe_math_setup` 拿到完整参数 schema（每项含**说明 / 选项 / 建议 / 当前值**），
然后用 `ask_user_question` **逐项问你**（选项自带解释与建议），你选完它用 `vibe_math_set_params`
应用，最后问你是否 `vibe_math_save_settings` 存为默认。

也可以直接跑命令：`/vibe setup`（看 schema）→ 跟主代理说你要改哪些 → `/vibe save`（存默认）。

### 3. 配置文件（vibe_math_setting.json）

- **生成模板**：`/vibe template`（生成到工作区）或 `/vibe template project`（生成到当前项目）——
  会产出一份**带 `//` 注释、逐项中文说明**的 JSON 模板，你手改后重启/resume 即生效。
- **保存当前值**：`/vibe save` 把当前生效参数写回该文件。
- **唯一持久化来源**：该文件是参数的**唯一持久化层**（项目级优先 → 缺失时回退全局 `<工作区>/VibeMath/vibe_math_setting.json` → 内置默认）。
  `vibe_math_set_params` / `set_mode` 会**立即写回**项目级文件并持久化，无需再手动 save。

---

## 🌱 新手示例流程（以“证明 √2 是无理数”为例）

**Step 1 — 用一句话启动**

```
帮我用 Vibe Math 证明：√2 是无理数。
```

主代理执行 `vibe_math_add_problem {"id":"q1","description":"证明：√2 是无理数。","priority":0}`
再执行 `vibe_math_start`，然后告诉你“已启动”。

**Step 2 — 询问进度**

```
进展如何？
```

主代理执行 `vibe_math_status` 并用人话汇报：当前活跃子代理数、正在验证的单元、是否有待决策等。

**Step 3 — 问答式调参（可选）**

```
我想让它用加权投票，并发数设成 6。
```

主代理 `vibe_math_set_params {"verdictMode":"weighted-vote","maxParallelThreshold":6}`，
并问你是否 `vibe_math_save_settings` 保存。

**Step 4 — 中途干预（可选）**

```
切到人工模式，我要在每个关键节点把关。
```

主代理 `vibe_math_set_mode {"mode":"manual"}`。之后每到一个关键节点它会 `vibe_math_list_decisions`
拿到决策，向你说明，等你 `vibe_math_decide {"id":"...","action":"approve"}`（或 `reject` / `override`）。

**Step 5 — 收尾**

```
结束了吗？结论是什么？
```

主代理 `vibe_math_status`：`qs.csv` 里 `q1` 已回写 `solved`，解法文件在 `Verified/` 里并被命名为
`q1-的解法_<唯一标识>.csv`。

> v2 对应的收尾是：`qs.json` 中 `q1.已解决 = true`，其解法 `正确概率 = 1`，相关命题进入 `Verified/`。

---

## 🖼️ 实际使用示例（长截图）

> 截图很长，这里默认**折叠**：点击下方「展开」才加载整张长图，避免它占满页面、遮挡前后文字。

<details>
<summary>📸 展开查看实际使用示例长截图</summary>

![实际使用示例长截图](示例图/实际使用示例-长截图.png)

</details>

---

## ⚙️ 参数速查表

### v2（概率驱动 · 主推）默认值

| 参数 | 默认 | 说明 |
|---|---|---|
| `mode` | `auto` | `auto` / `manual` |
| `maxParallelThreshold` | 4 | 全局最大并发子代理轮数（新派发前须 active < 阈值） |
| `solverMaxRounds` | 3 | 每个求解方向最大迭代轮数（agent_self_iteration 上限） |
| `directionsPerSolver` | 1 | 每个 solver 提示词可见的方向总数（1 = 只看自己方向、互不干扰；N>1 = 自己 + 最多 N-1 个其他活跃方向摘要） |
| `verifierCount` | 3 | 每个验证对象的独立验证器数量 |
| `debateMaxRounds` | 5 | 验证辩论（交流群）最大轮数 |
| `verdictMode` | `flat` | `flat` = 均衡机制（不一致判 0.5）/ `forced` = 强制裁决（历史准确率+严谨性加权） |
| `reportMode` | `file` | `file` = 写报告文件 / `push` = 推送主代理汇报 / `both` |
| `promoteValueThreshold` | 0.7 | Propos 中「价值/关键性」≥ 该值且未决(0,1) 的命题自动加入 qs.json |
| `priorityAdjust` | `none` | `none` / `deadend-deprioritize`（全死路降优先级）/ `survival-map`（按存活率重算） |
| `proposPriorityAdjust` | `none` | 命题优先级动态调整：`none` / `progress-graded`（按定论接近度+证明/证伪材料量重算，越接近定论越优先验证） |
| `provider` / `model` | 空 | 子代理模型（空 = 继承根代理） |
| `solverPersona` / `verifierPersona` / `explorerPersona` | 空 | 注入求解器/验证器/explorer 提示词开头的人格/要求 |
| `knowledgeContext` | 空 | 共享知识/数据模型说明（空 = 内置完整版：对象/属性定义、概率语义、文件夹用途、输出完整性要求；非空 = 覆盖并注入所有子代理提示词） |
| `solverToolAllow` / `solverToolDeny` | `[]` | 求解器允许/禁止的工具 |
| `verifierToolAllow` / `verifierToolDeny` | `[]` | 验证器允许/禁止的工具 |
| `solverAllowNetwork` / `verifierAllowNetwork` | 空 | 网络工具开关（web_search/web/fetch）：空=继承全部；`true`=在已有 allow 列表时补入；`false`=禁止 |
| `solverAllowScripts` / `verifierAllowScripts` | 空 | 脚本工具开关（bash/pwsh）：同上 |
| `solverMaxToolCalls` / `verifierMaxToolCalls` | 0 | 每轮外部工具调用上限（0=不限） |
| `reportIntervalMs` | 0 | 0 = 仅事件驱动（有状态更新才写/推）；>0 = 定时自动汇报（毫秒） |
| `tickIntervalMs` | 2000 | 调度器心跳间隔（毫秒） |
| `activityLogCap` | 100 | 活动日志保留条数（report 最多显示 30 条） |
| `maxExplorerRetries` | 3 | explorer 拆方向失败的重派生上限 |
| `formalVerify` | `'off'` | **Lean 形式化验证开关**：`'off'` 不额外要求（默认）｜`'encourage'` 鼓励（验证时按实现难度自行决定是否形式化）｜`'require'` 强制（真/假结论必须先有「Lean 通过」或显式阻塞记录，否则记为未定论并进入形式化待办）。非法值一律回退 `'off'` |
| `leanCommand` | `'lean'` | 要执行的 Lean 可执行文件（例：`'lake'`） |
| `leanArgs` | `[]` | 插在文件名之前的附加参数（例：`['env','lean']` 配合 `leanCommand='lake'`） |
| `leanTimeoutMs` | `120000` | 单次 Lean 运行的上限（毫秒） |

### v3（论文式 md + 规划代理 + 方法库）默认值

在 v2 全部参数之上新增/调整：

| 参数 | 默认 | 说明 |
|---|---|---|
| `verdictMode` | `forced` | v3 先做**近共识判定**（全部结果同侧且均值 ≥0.85/≤0.15 取均值），否则 `forced`=按历史准确率+严谨性加权 / `flat`=均衡（0.5）。修复了 v2 flat 把"0.9 vs 1"误判成 0.5 的问题 |
| `planningHorizon` | 3 | 规划代理一次计划的最多动作数（"接下来 n 次"） |
| `plannerEnabled` | true | false = 完全走内置启发式调度（规划代理禁用） |
| `plannerProvider` / `plannerModel` | 空 | 规划代理模型路由（空 = 继承根代理） |
| `plannerPersona` | 空 | 注入规划代理提示词开头的人格/要求 |
| `planMinIntervalMs` | 30000 | 两次规划调用的最小间隔（毫秒）；系统空闲且有工作时忽略 |
| `plannerMaxFails` | 3 | 规划代理连续失败达此值 → 自动降级启发式 |
| `methodKeepIntervalMs` | 0 | Method Keeper 定时整理间隔（0 = 事件驱动） |
| `methodKeepEvery` | 5 | 每积累 N 个待沉淀发明/新命题触发一次整理 |
| `methodAutoPromote` | false | 项目级方法自动晋升全局库（false = 人工门） |
| `indexAutoRebuild` | true | 每次写盘后自动重建 `State/index.json`（false = 手动 `vibe_math_index`） |
| `projectLockTimeoutMs` | 60000 | 项目锁等待超时（同项目同一时刻只允许一个会话调度） |
| `methodKeeperPersona` | 空 | 注入方法整理代理提示词开头的人格/要求 |
| `formalVerify` | `'off'` | **Lean 形式化验证开关**：`'off'` 不额外要求（默认）｜`'encourage'` 鼓励（验证时按实现难度自行决定是否形式化）｜`'require'` 强制（真/假结论必须先有「Lean 通过」或显式阻塞记录，否则记为未定论并进入形式化待办）。非法值一律回退 `'off'` |
| `leanCommand` | `'lean'` | 要执行的 Lean 可执行文件（例：`'lake'`） |
| `leanArgs` | `[]` | 插在文件名之前的附加参数（例：`['env','lean']` 配合 `leanCommand='lake'`） |
| `leanTimeoutMs` | `120000` | 单次 Lean 运行的上限（毫秒） |

### v4（常驻自组织 · 实验）默认值

`vibe_v4_set` 可调（持久化到 `State/settings.json`）：

| 参数 | 默认 | 说明 |
|---|---|---|
| `residentCount` | 4 | 常驻数（可 `vibe_v4_add_member` 增减） |
| `compactThreshold` | 66 | 常驻上下文占比达此值触发软压缩（自述指令） |
| `compactAfterRounds` | 8 | 常驻每累计 N 轮（未压缩）触发一次软压缩 |
| `meetingKeepEvery` | 5 | 每积累 N 个新产物自动触发一次同步会议 |
| `maxParallel` | 3 | 同时唤醒的常驻上限（框架侧并发闸，非指派） |
| `activityTimeoutMs` | 120000 | 空闲心跳间隔（超时才触发**自驱动** CHECKPOINT 唤醒，推动常驻继续推进；唤醒失败会自动重新武装心跳，保证小组永不永久停死） |
| `stallAutoMeetingMs` | 360000 | **停滞自动同步会议阈值**（分级保活 B）：团队空闲且无新产物超过该时长时，框架自动召集一次同步会议，让常驻们自行决定下一步路线/分工（框架只促成，不指派） |
| `verdictMaxRounds` | 3 | 验证在独立初评后进入辩论的最大轮数 |
| `provider` / `model` | 空 | **常驻 LLM 路由**（空 = 常驻继承主代理的 provider/model；此前声明未用，v1.4.1 真正接入） |
| `residentPersona` | 空 | 注入每个常驻提示词开头的人格/要求 |
| `toolAllow` / `toolDeny` | `[]` | **常驻工具权限**（经 `startContinuable` 的 `toolFilter` 做作用域 `tools.restrict()`；空 = 继承全部工具；⚠️ 空 `allow:[]` 会拒绝一切工具） |
| `formalVerify` | `'off'` | **Lean 形式化验证开关**：`'off'` 不额外要求（默认）｜`'encourage'` 鼓励（验证时按实现难度自行决定是否形式化）｜`'require'` 强制（真/假结论必须先有「Lean 通过」或显式阻塞记录，否则记为未定论并进入形式化待办）。非法值一律回退 `'off'` |
| `leanCommand` | `'lean'` | 要执行的 Lean 可执行文件（例：`'lake'`） |
| `leanArgs` | `[]` | 插在文件名之前的附加参数（例：`['env','lean']` 配合 `leanCommand='lake'`） |
| `leanTimeoutMs` | `120000` | 单次 Lean 运行的上限（毫秒） |

### v5（研究所体系 · 实验）默认值

`vibe_v5_set` 可调（持久化在会话日志投影里）：

| 参数 | 默认 | 说明 |
|---|---|---|
| `academician` | `true` | 是否设院士（1 名） |
| `academicianLeads` | `true` | 是否启用院士的组织/分派职权（关掉则退化为 v4 式纯自组织，只有所办能协调） |
| `memberMayRejectAssign` | `true` | 成员可否**据理反对**院士的分派（反对不阻塞执行，但理由会广播给院士与全所） |
| `researcherCount` | 3 | 常驻研究员数（建所时） |
| `quorumCap` | 3 | m 的上限；实际 **m = min(quorumCap, 在册有表决权人数)** |
| `quorumMode` | `'m-unanimous'` | v5 口径；切 `'all-unanimous'` 回到 v4 的"全体一致" |
| `verdictMaxRounds` | 3 | 独立初评后进入公开辩论的最大轮数 |
| `maxTempPerMember` | 3 | 每位院士/研究员**同时**在册的临时工上限（按在册计，非累计——所以换人不受限） |
| `maxTempTotal` | 12 | 全所同时在册临时工上限 |
| `compactThreshold` | 66 | 成员上下文占比（0–100）达此值触发压缩 |
| `compactAfterRounds` | 8 | 或每累计 N 轮触发一次软压缩 |
| `maxParallel` | 3 | 同时唤醒的成员上限（框架侧并发闸） |
| `activityTimeoutMs` | 120000 | 空闲兜底心跳间隔（主驱动是一次性活动等待，不轮询） |
| `stallAutoMeetingMs` | 360000 | 停滞自动召集同步会议的阈值 |
| `chatDigestMs` / `chatDigestMax` | 45000 / 12 | 群聊摘要合批的时间窗与条数上限（私信/会议/表决不合批） |
| `meetingKeepEvery` | 5 | 每积累 N 个新产物自动发起一次同步会议 |
| `provider` / `model` | 空 | 成员 LLM 路由（空 = 继承所办/主代理路由） |
| `toolAllow` / `toolDeny` | `[]` | 常驻员工工具权限（⚠️ 空 `allow:[]` 会拒绝一切工具） |
| `tempToolAllow` / `tempToolDeny` | `[]` | 临时工的工具权限（比常驻更窄） |
| `staffPersona` | 空 | 追加到每个成员章程前的人格/要求 |
| `formalVerify` | `'off'` | **Lean 形式化验证开关**：`'off'` 不额外要求（默认）｜`'encourage'` 鼓励（验证时按实现难度自行决定是否形式化）｜`'require'` 强制（真/假结论必须先有「Lean 通过」或显式阻塞记录，否则记为未定论并进入形式化待办）。非法值一律回退 `'off'` |
| `leanCommand` | `'lean'` | 要执行的 Lean 可执行文件（例：`'lake'`） |
| `leanArgs` | `[]` | 插在文件名之前的附加参数（例：`['env','lean']` 配合 `leanCommand='lake'`） |
| `leanTimeoutMs` | `120000` | 单次 Lean 运行的上限（毫秒） |

常用控制：`vibe_v5_configure`（先配置）→ `vibe_v5_start`（开工）→ `vibe_v5_report` / `vibe_v5_status`；`vibe_v5_message` / `vibe_v5_meeting` / `vibe_v5_members` / `vibe_v5_hire` / `vibe_v5_fire`（临时工）/ `vibe_v5_add_researcher` / `vibe_v5_remove_researcher`（增删常驻，仅所办）/ `vibe_v5_pause` / `vibe_v5_resume` / `vibe_v5_stop`；斜杠命令 `/v5`。

---

## 📝 断点续跑 & 人工干预（两大硬性需求）

- **断点续跑**：所有状态落盘（v2：`VibeMath_State/*.json`；v3：`State/*.json`；**v5：会话日志的 host-only 投影单元**），每个子代理都是 DSH 的 **continuable 持久会话**（对话由 DSH 自动保存）。重启后新开会话 → `vibe_math_resume` / `vibe_v4_resume` / `vibe_v5_resume` 即可续跑。v2/v3 额外用**进程纪元**区分"同进程暂停→恢复"（保留存活子代理继续）与"跨进程重启"（清理陈旧任务）。**v3 的 md 知识库本身就是叙事断点**——代理 resume 时从研究日志/问题卡/命题卡尾部续写；**v5 由投影单元承担**——跨进程与同进程恢复走同一条代码路径，成员会话重建时会以"读回你自己的 Progress/"重新种化（而不是让它们从头再来）。
- **中途人工干预**：`manual` 模式在关键节点挂起决策（v2：explorer/solver 派发、验证裁决；v3：**计划审批门**（规划代理产出计划后等你 approve/reject）、验证裁决门、**方法晋升门**（项目方法 → 全局库））；可随时 `set_mode auto` 切回自动（自动放行所有挂起决策）；可对任意子代理 `message_agent` / `interrupt_agent`。**v4/v5 天然可干预**：随时给成员留言（`vibe_v5_message`）、召集会议、暂停全所、增删编制——成员下一轮就会看到。
- **进度汇报**：默认**事件驱动** —— 只有代理状态更新等事件发生时才会写报告（v2：`Progress_Logs/report.json`；v3：`Progress_Logs/report.json` + `Logs/报告.md` 论文式人读摘要；`reportMode` 可 `file`/`push`/`both`，`push` 通过 `subagents.sendMessage(根代理, 常驻子代理, …)` 唤醒常驻主动汇报——`followup` **不是** `subagents` 服务的方法，它只是 `Agent` 对象方法）；只有把 `reportIntervalMs` 设为 >0 才启动定时自动汇报（间隔毫秒）。**v4/v5 的工作汇报是"所内自述"**：成员把进展写进自己的 `Progress/`、把关键结论说进群聊（v5 另有人读镜像 `Institutes.md` / `Shared/TaskBoard.md` / 会议纪要 / 辩论录 / `Problems/conclusion.md`）。

---

## 📚 规格文档

- **v2（概率驱动）**：[`vibe-math-v2/实现方案.md`](vibe-math-v2/实现方案.md)
- **v3（论文式 md + 规划代理 + 方法库）**：[`vibe-math-v3/实现方案.md`](vibe-math-v3/实现方案.md)
- **v4（常驻自组织）**：[`vibe-math-v4/实现方案.md`](vibe-math-v4/实现方案.md)
- **v5（研究所体系）**：[`vibe-math-v5/实现方案.md`](vibe-math-v5/实现方案.md)（文字规格）· [`vibe-math-v5/架构图.md`](vibe-math-v5/架构图.md)（全套架构图）
- **v5 提示词与交互语料**：[`prompt-corpus-v5/prompt-corpus-v5.md`](prompt-corpus-v5/prompt-corpus-v5.md)（框架真正发出的每一条提示词原文，可直接人工复核身份/编制/交互署名是否正确）
- **四套 Lean 提示词语料**：[`prompt-corpus-v2/formal-verify-v2.md`](prompt-corpus-v2/formal-verify-v2.md) · [`prompt-corpus-v3/formal-verify-v3.md`](prompt-corpus-v3/formal-verify-v3.md) · [`prompt-corpus-v4/formal-verify-v4.md`](prompt-corpus-v4/formal-verify-v4.md)（各自覆盖 off / encourage / **require** / 忠实性分支 / 工作轮 / 回执契约；工作区归一化为 `<WS>`、VibeMath 根为 `<VIBEMATH>`）
- **四个预设的 persona 原文**：[`prompt-corpus-persona/persona-corpus.md`](prompt-corpus-persona/persona-corpus.md)（主代理实际收到的提示词：有哪些工具、哪些参数、哪些斜杠子命令；由 `audit-persona-surface.test.mjs` 生成，随包发布）
- **Lean 形式化验证（四架构共用契约）**：[`docs/formal-verification.md`](docs/formal-verification.md)
- **测试耗时基线与并行跑法**：[`docs/test-timing.md`](docs/test-timing.md)（`node run-tests.mjs` 并行跑全部套件 ≈1.9 min；探针脚本 ≈2.6 min；每个 runner 都会打印耗时/加速比供下次选策略）
- **静态提示词面一致性（persona ↔ 工具注册表 ↔ 斜杠命令 hint/usage）**：[`audit-persona-surface.test.mjs`](audit-persona-surface.test.mjs)（197 条断言，并生成 [`prompt-corpus-persona/persona-corpus.md`](prompt-corpus-persona/persona-corpus.md) 供人工复核）+ [`audit-persona-sensitivity.mjs`](audit-persona-sensitivity.mjs)（11 条灵敏度探针）——守"注册的工具必须在 persona 里出现 / persona 里的名字必须真的注册 / `prefix` 与 `text` 两块逐行一致 / hint、usage、实际分支三处必须一致"
- **全面检查必查清单**：[`AUDIT-CHECKLIST.md`](AUDIT-CHECKLIST.md)（本仓库的强制审计流程；§1.9 专门查"工具参数 schema 收不收得下"）
- **提示词/交互不变式（四套一起，可一键复核）**：[`audit-prompt-invariants.mjs`](audit-prompt-invariants.mjs)（145 条断言）——把"历史上真实发生过的提示词/工具面缺陷类别"逐条编码成静态不变式（缩写工具名、把忠实性缺陷投成 0、`defect` 只写在提示词里没实现、回执契约缺 `defect`、无 note 放行、字段名错、`off` 档回执仍能写状态、语料不确定、探针缺失、**工具的封闭 schema 收不下它自己文档里的参数**、**schema 声明了参数层却静默丢弃的键**）。加 `--self-probe` 会在内存里注入这些缺陷形状，要求对应不变式**变红**、未变异的对照跑**仍为绿**（5/5）
- **规格 ↔ 代码可追溯（四套一起）**：[`audit-spec-traceability.mjs`](audit-spec-traceability.mjs)（91 条断言）——`实现方案.md`/README 里承诺的工具必须真的注册；四个 Lean 参数必须同时被文档与代码接受

---

## ⚠️ 已知边界（有意简化）

**v2**：
- 安装器带**版本化自动更新**：每次 DSH 启动时对比包版本与 `<presetRoot>/.vibe-math-installed.json` 记录——版本升级会自动替换**未被手动修改**的 preset 文件（哈希一致才覆盖）；你改过的文件会被保留并在日志中提示。无记录的老安装首次会一次性刷新到当前版本。想强制全量重装：删除 `~/.dsh/.agent-presets/vibe-math-v2`、`vibe-math-v3`、`vibe-math-v4` 与 `vibe-math-v5` 目录后重启 DSH。
- `flat` 裁决在辩论不一致时直接判 `0.5`（高置信分歧如 0.9 vs 1 也会被误判 0.5——**v3 已用近共识规则修复**）；`forced` 按历史准确率+置信度加权。
- `never` 优先级的问题/命题**永不调度**，且不阻塞严格终止（视为主动弃权）。
- 四个 preset 文件互相独立、可共存；同一会话同时只能选一个预设。

**v3**：
- **软规范而非零规范**：md 知识库只强制对象头部的 4~7 行锚点（`- ID/类型/状态/概率/优先级/依赖/...`）与条目标题行（`### 解法/证明/证伪 N｜标题｜概率X｜状态Y`），供调度器可靠索引；正文完全自由论文式叙述，调度器从不解析正文。手工编辑锚点可能导致索引漂移（调度器会保留上次有效索引并告警）。
- **规划代理是增强而非必需**：`plannerEnabled=false` 或规划代理连续失败（`plannerMaxFails`）时自动回退 v2 式启发式调度；`planMinIntervalMs` 冷却在有在途子代理时生效（系统空闲时有工作则立即规划）。
- **方法库可信分层**：方法卡的 `可信断言` 只允许链接已进 `Verified/` 的 ID；方法条目的其余内容（含未验证的策略/直觉/启发式）一律视为**经验参考**，不得当定理引用。
- **项目锁**：同一项目同一时刻只允许一个会话调度（第二个会话启动会提示"被会话 X 占用"）；锁在暂停/终止/全部解决时自动释放。
- **近共识裁决**：全部验证器结果同侧且均值 ≥0.85/≤0.15 时取均值（如 0.9 vs 1 → 0.95），否则 `forced` 加权 / `flat` 判 0.5——修复了 v2 中"数学上正确但形式有瑕疵"的结论被误判为不确定的问题。

**v5**：
- **框架绝不指派任务**：这是设计上的硬边界，不是尚未实现的功能。任务的产生与分配属于**所内自治**
  （院士拆解分派、成员自行认领），框架只提供任务板、消息与会议这些**协调工具**。
- **`≥ m` 一致 ≠ 数学上已证明**：门槛只保证"所内达成了一致判断"，不保证结论真的正确。
  求真的纵深靠成员自己的推导与辩论录留痕；未达门槛的对象会**留库附平均概率**，不会被强行判真判假。
- **一致性门槛不是"少数服从多数"**：任何一张反向布尔票都阻塞定论，弃权既不帮真也不帮假。
  要更容易收敛就调低 `quorumCap` 或减少有表决权人数；要更严格可切 `quorumMode: "all-unanimous"`。
- **一个回合永不结束的成员不会被强行释放**（与 v4 同一边界）：心跳每次都会重新武装，
  所以调度器不会永久冻结；需要人工介入时用 `vibe_v5_fire`（临时工）或所办增删编制。
- **会议与验证严格互斥**：一方进行中，另一方排队/暂存。因此"在会议上当场定论一个对象"会先排队，
  等会议收口后再走完整的表决流程。
- **`resume` 后轮次计数从 1 重新计**（内存态，仅用于节流与压缩提示）；权威进度在成员自己的 `Progress/`。
- **成员章程是入职快照**：升级本包不会改写已在跑的研究所里成员的章程（它们仍用入职时冻结的版本）。
  需要新章程就在新会话里重开一个研究所；投影状态与文件树无需迁移。
- **安装器行为同 v2**（版本化自动更新，`vibe-math-v5` 目录同样受管）。
- **Lean 形式化需要宿主上有 Lean 工具链**：框架不内置、不下载；没有工具链时三个 Lean 工具会如实返回
  `LEAN_NOT_FOUND`，形式化代码仍可写下来归档，但无法执行验证。
- **`require` 模式的门禁是「搁置」而不是「卡死」**：缺形式化的真/假结论会被记为未定论 + 进入形式化待办，
  研究所继续推进（与「未达门槛留库附平均概率」同一取舍），不会被一个对象永久卡住。

---

## 📄 License

MIT
