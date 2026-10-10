# vmu 22 · 学术运营（Academic Operations：仪器 / 经费 / 知识产权 / 会务 / 传播 / 合规 / 容量 / 人事）

> 状态：**设计稿 v0.1（新卷）** —— 批评者第 5 轮点名的"**运营面空白**"（仪器、经费、知识产权、会议组织、科学传播、跨机构协作、合规审计运营、容量、人事周期）在这一卷补齐 ✓。**全部不动作内核**：只用 **settings ＋ 中间件 ＋ pack ＋ 记录轨** 组合出来 ✓。
> 上位：`00-README.md`（阅读顺序）、`01-philosophy.md`（R1 内核零策略／R2 能力与挂点齐备／R5 中间件／R6 登记即契约／R11 可观测／R12 可复现）、`02-architecture.md`（内核分区与四层模型）、`03-interface-contract.md`（服务/工具/协议/**错误码唯一登记表 §8**）、`04-settings.md`（参数全表与 H0–H3 热改）、`05-middleware.md`（钩子全表）、`06-prompt-pipeline.md`（提示词管线）、`07-durability-library.md`（归档/台账/`datasets`）、`08-primitives-meeting-ballot-workflow.md`（会议/表决/工作流/任务板原语）、`10-packs.md`（整合包＝组织政策）、`11-gates-and-development.md`（门禁与 T0/T1 分层）、`14-open-items-and-roadmap.md`（未决/未核登记）、`16-research-lifecycle.md`（生命周期/评审/出版/经费面）、`17-agent-society-and-delegation.md`（席位/招募/预算令牌/仲裁）、`20-security-privacy-and-compliance.md`（合规/隐私/许可）、`21-observability-and-operations.md`（日志/追踪/审计导出）。
> **与相邻卷的分工（双向交叉引用，交界只写一次 ✗）**：
> - **07＝数据与耐久**（归档、`datasets` 轨、`vmu.quota.*` 存储配额、备份）。本卷只在"**运营分配**"层引用它，不重定义存储语义 ✓。
> - **08＝治理原语**（会议、表决、工作流、任务板、控制流）。本卷的会务是**用 08 的原语组合**出来的编排，不新造表决/会议语义 ✓。
> - **16＝研究生命周期**（选题→评审→出版→经费面→血缘 L9）。本卷承接"**运营执行**"（账户、凭证、会务、传播、任期），评审/出版的**判据**仍归 16 ✓。
> - **17＝社会与席位**（角色/席位/招募/委托/声誉/仲裁/**预算令牌**）。**分工写死**：**17 管"令牌与回合"配额（`vmu.budget.*`）**；**本卷管"钱"（`vmu.funding.*` 等）** —— 两者**不得互相静默换算** ✓（不变式 O-1）。
> - **20＝合规与隐私**（许可、密级、脱敏、合规基线）。本卷只做"**合规运营**"：日历、准备、证据包导出，判据取自 20 ✓。
> - **21＝观测与运维**（审计、指标、SLO、runbook）。本卷的运营事件**必须**经 21 的观测面留痕（"计数不静默"）✓。
> 读者：**机构运营者**（PI／行政／设施／财务／法务／传播）、**机制作者**（pack 与判定点）、**代理**（知道哪些运营动作能自己做、哪些必须人批）。
> 一句话：让"运营"成为**可调控、可审计、可替换、可扩展**的一层 —— **不动内核** ✓，且**运营永远不改变学术结论** ✓（不变式 O-5）。
> **记账纪律（同 17-§0.1）**：① 正文可写**具体键名** ✓（由生成管线登记进 `settings/planned.js`，`planned:true`／`def:null` ⇒ 文档承诺不会变成"已实现" ✗）；② **未实现**的 `vibe_vmu_*` 工具名**必须与标记词同行**（`计划/未实现/规划/待实现/提案/目标形态/尚未/⛔`）✓；③ 每个 `VMU_*` 码都列进给 Lead 的回报 ✓，并由 `03-§8` 唯一登记 ✓。

---

## 0. 读法、条目模板与四条哲学

### 0.1 条目模板（本卷每项运营基础设施按 11 字段写成一条）

`名称` ｜ **目的** ｜ **面向谁** ｜ **接口形状**（服务方法／工具／钩子／协议） ｜ **可调控参数**（具体键名或族） ｜ **相关错误码** ｜ **四条哲学**（自由度 F·可调控性 T·可定义性 D·扩展性 X） ｜ **实现要点** ｜ **依赖与前置** ｜ **成熟度**（**已实现 ✓ / 未实现 ✗**） ｜ **优先级**（P0–P3）。

> **设计目标 vs 实现保证（本卷纪律，与 17-§0.1 同源 ✗）**：凡**未标 ✓** 的机制，其"机器强制／必须／断言／具名红"一律是**设计验收目标** ✗，不是今天的实现保证 —— 在实现并由门禁守住之前**不得据以推理** ✓。
> **本卷可依附的已实现底座**（其余全为规划）：`vibe_vmu_records` ✓（记录轨：只追加、可导出）、`vibe_vmu_task` ✓（任务板与分派）、`vibe_vmu_meeting` ✓（会议/议程/表决原语）、`vibe_vmu_set` ✓（设置读写与下放）、`vibe_vmu_middleware` ✓（钩子注册与动作）、`vibe_vmu_pack` ✓（组织政策的载体）、`vibe_vmu_script` ✓（脚本桥：外部命令＋回执）、`vibe_vmu_status` ✓（现况）、`vibe_vmu_control` ✓（暂停/恢复/拒绝）；以及 `vmu.records.*`／`vmu.meeting.*`／`vmu.tasks.*`／`vmu.budget.*`／`vmu.audit.*`／`vmu.quota.*`／`vmu.license.*`／`vmu.review.*`／`vmu.recruit.*` 键族（分属 07/08/16/17/20 ✓）。

### 0.2 本卷的六条运营不变式（**设计不变式：实现前不得据以推理** ✗）

| # | 不变式 | 为什么 | 违反了会怎样 |
|---|---|---|---|
| **O-1** | **令牌 ≠ 钱**：`vmu.budget.*`（17，令牌/回合/子代理）与 `vmu.funding.*`（本卷，货币）是两套账；任何换算必须**显式、留痕、可复算** ✓ | 令牌是机制配额，钱是组织资源 | 幻觉式"攒够令牌就能买设备" |
| **O-2** | **凭证链闭合**：每笔支出/占用/披露都要有 `请求 → 批准 → 发生 → 凭证` 四环；缺环 ⇒ **具名拒** ✓ | 审计与结算的前提 | 说不清"这笔钱/这台机器为什么这样花" |
| **O-3** | **披露时钟**决定公开与保密：IP/合规的公开时序由**显式时间轴**（而不是记忆）判定 ✓ | 专利新颖性与合规窗口 | 因早发预印本损失可专利性 |
| **O-4** | **对外证据强度 ≤ 内部证据强度**：传播稿/公众摘要**不得**比内部结论更强 ✓ | 学术诚信 | 夸大传播污染机构信誉 |
| **O-5** | **运营不改变学术结论**：任何运营动作（钱、物、会务、人事）**永不**投票、**永不**改判定 ✓ | 结论属于研究面（16/08） | 用预算或会务操纵结论 |
| **O-6** | **人类在环优先**：人类审批/否决可**打断任何自动流转**，且**不消耗**代理配额 ✓ | 责任在人 | 自动化架空人类责任 |

### 0.3 四条哲学自检（每节末都能回答）

- **自由度（F）**：默认**无运营层** —— 不声明 `vmu.funding.*`／`vmu.instruments.*` 等任何族，就等于"没有财务/设施/法务流程"的纯研究机构 ✓；
- **可调控性（T）**：每个旋钮给默认/域/热改等级（H0–H3）/谁可改（院士／运营席／pack） ✓；
- **可定义性（D）**：所有"规则"落在 **判定点**（`ops.*` 谓词）或 **pack 声明**（预算表、席位表、合规日历模板）⇒ 不改内核 ✓；
- **扩展性（X）**：新资助方/新会议形态/新合规辖区**只加数据与判定点** ✓。

---

## 1. 心智模型与总览矩阵

```
① 资源层   仪器/设施 · 机时/存储 · 席位/名额 · 货币         ← 本卷"有什么、谁在用"
② 流程层   申请→批准→发生→凭证 · 征稿→评审→日程→论文集     ← 本卷"怎么办、留什么痕"
③ 合规层   披露时钟 · 合规日历 · 证据包 · 审计准备          ← 本卷"能不能这么办"
④ 传播层   公众摘要 · 科普稿 · 媒体 · 影响记录               ← 本卷"对外怎么说（不得夸大）"
```

**一条不变量（本卷总纲）**：**运营留痕、具名拒绝、绝不改结论** ✗——
- 任何被**批准/拒绝/超预算/被占用/被暂停**的运营动作，都**必须**在记录轨（07）与观测面（21）可查 ✓；
- "看着办了"与"真的办了"必须可分（干跑标记沿用 05 ✓）；
- 运营动作**不得**出现在结论链的证据里（O-5）✓。

**总览矩阵**（成熟度：✓ 已实现｜⚠ 底座可用但面不全｜✗ 计划）：

| # | 族 | 可依附的现有底座 | 可调控键族 | 码族 | 成熟度 |
|---|---|---|---|---|---|
| **0** | **货币与舍入（Money，横切规范）** | **无（本卷新增类型规范 §3.0）** | `vmu.money.*` | `VMU_MONEY_*`／`VMU_CURRENCY_*`／`VMU_FX_*`／`VMU_ROUNDING_*`／`VMU_AMOUNT_*`／`VMU_SCALE_*`／`VMU_ALLOCATION_*` | ✗ |
| 1 | 仪器与设备 | `vibe_vmu_records`／`vibe_vmu_task`／07 `datasets` | `vmu.instruments.*` | `VMU_EQUIP_*` | ✗ |
| 2 | 经费与财务 | `vibe_vmu_records`／08 工作流／17 令牌（**仅参照**） | `vmu.funding.*`＋`vmu.money.*` | `VMU_FUNDING_*` | ✗ |
| 3 | 知识产权 | `vibe_vmu_records`／16 出版面／20 许可 | `vmu.ip.*` | `VMU_IP_*` | ✗ |
| 4 | 会务与活动 | **08 会议/表决原语** ＋ 16 评审面 | `vmu.conference.*` | `VMU_CONF_*` | ✗ |
| 5 | 科学传播 | `vibe_vmu_records`／20 脱敏 | `vmu.outreach.*` | `VMU_OUTREACH_*` | ✗ |
| 6 | 跨机构协作 | 17 委托/身份 · 20 数据共享 | `vmu.collab.*` | `VMU_COLLAB_*` | ✗ |
| 7 | 合规与审计运营 | 20 合规基线 · 21 审计导出 | `vmu.compliance.*` | `VMU_COMPLIANCE_*` | ✗ |
| 8 | 资源与容量 | 07 `vmu.quota.*` · 17 席位 | `vmu.capacity.*` | `VMU_CAPACITY_*` | ✗ |
| 9 | 人事与任期 | 17 `vmu.recruit.*`／席位 | `vmu.hr.*` | `VMU_HR_*` | ✗ |
| **10** | **生物样本库与链式保管（N4）** | `vibe_vmu_records`／§2.1 台账／07 记录轨 | `vmu.biospecimen.*` | `VMU_BIOSAMPLE_*` | ✗ |
| **11** | **税务与法务实体（N9）** | §3.0 Money／§3.1 账户／20 密级 | `vmu.legalentity.*` | `VMU_ENTITY_*`／`VMU_TAX_*`／`VMU_CROSSBORDER_*` | ✗ |
| **12** | **DUA／MTA 协议闸（N10）** | §7.1 协议登记／21 提醒（引用） | `vmu.agreements.*` | `VMU_AGREEMENT_*` | ✗ |

> **成熟度诚实声明** ✗：本卷 **13 个族（含 §3.0 的货币类型与 §2.5／§3.6／§7.4 三个追加族）、9 个服务、9 个工具、10 个钩子、9 个协议全部为规划**（`settings/planned.js` 里 `planned:true`）✓ —— 今天能用的只有**底座**（记录/任务/会议/设置/中间件/pack/脚本桥）✓。

---

## 2. 实验仪器与设备（Instruments & Equipment）

> **⚠ 状态更正（轮 61 核实；以下各条的"计划 ✗"字样已过期）** ✓✓：**本族已实现** —— 归属面是 **`kernel/instruments.js`**（**14/17 键已接线** ✓：责任人／能力标签／**校准到期即阻断**（`blockOnOverdue`）／预约（`reserve`／`maxHoldHours`／`reservationHorizonDays`／`overbookRatio`／`priorityPolicy`／`waitlistPolicy`）／**维护排期**（`scheduleMaintenance`）／**采集挂引用**（`attachCapture`））＋ **`kernel/capacity.js`**（`facilities`＋重叠即 `VMU_CAPACITY_FACILITY_CONFLICT` ✓）✓。**仅 3 键未接线且理由已由模块写明** ✗（`ledgerDir` 无 FS 接缝／`dataCaptureRef` 需 library／`downtimePolicy` 需运维协同）。**归属表以 §14 为准** ✓（本节只保留接口形状与判定点，**不再声称未实现** ✗✓）。

### 2.1 台账与登记

| 字段 | 内容 |
|---|---|
| **名称** | 仪器台账（Instrument Ledger） |
| **目的** | 每台/每套设备有**唯一身份**（资产号＋位置＋责任人＋能力标签），使"谁能用、用了什么、产出挂在哪"可追溯 ✓ |
| **面向谁** | 设施管理员、PI、执行实验的代理 |
| **接口形状** | 服务 `vmu.instruments`（**计划 ✗**）：`register(instrument)`／`list(filter)`／`get(id)`／`retire(id, reason)`；工具 `vibe_vmu_instruments` ⛔ 未实现（唯一入口：登记/预约/维护三类操作）；协议 `InstrumentReservation` ⛔ 待实现 |
| **可调控参数** | `vmu.instruments.ledgerDir`（默认 `Ops/Instruments`）、`vmu.instruments.requireOwner`（默认 `true`）、`vmu.instruments.capabilityTags`（默认 `[]`） |
| **相关错误码** | `VMU_EQUIP_NOT_REGISTERED` ⛔／`VMU_EQUIP_OWNER_REQUIRED` ⛔（详见 §14） |
| **四条哲学** | F：不登记＝无设施概念 ✓｜T：目录与必填字段可配 ✓｜D：能力标签与准入规则由 pack 声明 ✓｜X：新设备类型只加标签 ✓ |
| **实现要点** | 台账是**记录轨条目**（07 只追加）＋**索引视图**；删除＝`retire`（保留历史，不物理删）✓ |
| **依赖与前置** | `vibe_vmu_records` ✓、`vibe_vmu_set` ✓（键）、`vibe_vmu_status` ✓（现况） |
| **成熟度** | ✗ 计划 |
| **优先级** | P1（运营最小闭环的第一块） |

### 2.2 预约与占用（排他、优先级、候补）

| 字段 | 内容 |
|---|---|
| **名称** | 预约与占用（Reservation & Occupancy） |
| **目的** | 同一资源在**时间轴上不冲突** ✓；冲突时按**显式优先级**裁决并留痕（不靠默认先到先得）✓ |
| **面向谁** | 使用者、设施管理员、调度代理 |
| **接口形状** | 服务 `vmu.instruments.reserve(holder, window, purpose)`／`release(reservationId)`／`waitlist(id)`（**计划 ✗**）；钩子 `ops/reservation-requested` ⛔ 提案、`ops/reservation-conflict` ⛔ 提案；协议 `InstrumentReservation` ⛔ |
| **可调控参数** | `vmu.instruments.reservationHorizonDays`（默认 `30`）、`vmu.instruments.maxHoldHours`（默认 `12`）、`vmu.instruments.priorityPolicy`（默认 `fifo`；可选 `pi-first`／`quota-weighted`）、`vmu.instruments.waitlistPolicy`（默认 `auto-offer`）、`vmu.instruments.overbookRatio`（默认 `1.0`＝不超额） |
| **相关错误码** | `VMU_EQUIP_SLOT_CONFLICT` ⛔／`VMU_EQUIP_HOLD_LIMIT` ⛔／`VMU_EQUIP_WAITLIST_FULL` ⛔ |
| **四条哲学** | F：不排期＝自由抢用 ✓｜T：时间窗/上限/优先级全可配 ✓｜D：优先级**是 pack 的判定点**（内核不认识"PI 优先"）✓｜X：新调度算法只换判定点 ✓ |
| **实现要点** | 冲突判定＝**区间集合**运算（确定性、可复算）；裁决必须写 `reason` 与规则来源 ✓；候补"自动递补"可被人类审批打断（O-6）✓ |
| **依赖与前置** | §2.1 台账、`vibe_vmu_task` ✓（把占用挂到任务）、08 工作流原语 ✓（审批形态） |
| **成熟度** | ✗ 计划 |
| **优先级** | P1 |

### 2.3 维护、校准与停机

| 字段 | 内容 |
|---|---|
| **名称** | 维护与校准（Maintenance & Calibration） |
| **目的** | 校准过期/维护中的设备**不得**被用于产出"可引用数据" ✓（把"能用"与"数据可信"分开） |
| **面向谁** | 设施管理员、质量负责人、执行实验的代理 |
| **接口形状** | 服务 `vmu.instruments.scheduleMaintenance(id, window)`／`recordCalibration(id, cert)`／`block(id, reason)`（**计划 ✗**）；钩子 `ops/calibration-due` ⛔ 提案、`ops/downtime-started` ⛔ 提案 |
| **可调控参数** | `vmu.instruments.requireCalibration`（默认 `true`）、`vmu.instruments.calibrationDueDays`（默认 `365`）、`vmu.instruments.blockOnOverdue`（默认 `true`）、`vmu.instruments.downtimePolicy`（默认 `queue`；可选 `fail`） |
| **相关错误码** | `VMU_EQUIP_CALIBRATION_DUE` ⛔／`VMU_EQUIP_MAINTENANCE_BLOCKED` ⛔／`VMU_EQUIP_CERT_MISSING` ⛔ |
| **四条哲学** | F：不声明＝无校准要求 ✓｜T：周期/阻断策略可配 ✓｜D：设备类别→校准要求的映射由 pack ✓｜X：新证书类型只加字段 ✓ |
| **实现要点** | "过期阻断"必须**与产出绑定**：被阻断设备的数据在 07 的 `datasets` 上打**来源标注**（血缘可追，引用 16-L9）✓；解除阻断需人批准 ✓ |
| **依赖与前置** | §2.1、07 `datasets` ✓、16 血缘面 ✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P2 |

### 2.4 数据直采的引用面（与 07/16 的衔接）

| 字段 | 内容 |
|---|---|
| **名称** | 仪器直采引用（Instrument Capture Reference） |
| **目的** | 仪器产出的原始文件**不复制**，只在记录里给**引用**（路径＋哈希＋设备号＋时间窗＋校准状态）✓ |
| **面向谁** | 实验执行者、数据管理、审计 |
| **接口形状** | 服务 `vmu.instruments.attachCapture(id, datasetRef)`（**计划 ✗**）；协议 `CaptureRef` ⛔ |
| **可调控参数** | `vmu.instruments.dataCaptureRef`（默认 `required`；可选 `optional`→`ignore`）、`vmu.instruments.hashAlgo`（默认 `sha256`） |
| **相关错误码** | `VMU_EQUIP_CAPTURE_UNLINKED` ⛔ |
| **四条哲学** | F：不挂引用＝数据与设备无关 ✓｜T：必填程度可配 ✓｜D：字段集由 pack ✓｜X：新采集格式只加字段 ✓ |
| **实现要点** | 引用**必须**含校准状态快照 ⇒ 事后可判定"这份数据来自已校准设备"✓ |
| **依赖与前置** | 07 归档/`datasets` ✓、§2.3 |
| **成熟度** | ✗ 计划 |
| **优先级** | P2 |

> **这一族怎么由 settings＋中间件＋pack 组合出来** ✓：**settings** 给"要不要台账、时间窗多长、过期是否阻断"；**中间件**在 `before`（预约/占用前）查台账与校准状态、在 `after`（数据产出后）校验引用链，把违规**具名拒**；**pack** 声明"哪些设备类别需要校准、谁有优先权、哪些设备禁止某类用途"。**内核只提供记录、任务、钩子与设置** —— 不出现"仪器/PI"这类组织名词 ✓。

### 2.5 生物样本库与链式保管（Biobank / Biospecimen —— **补 N4** ✗✓）

> **为什么要有这一节** ✗：批评者第 6/7 轮关键词实测"**生物样本**"**0 命中** ✗ —— 一个能管仪器与经费的平台却**没有样本**这一最典型的实验资产 ✓。样本的特殊性在于：它**不可重建** ✓、与**受试者**关联 ✓、且必须证明"**一直没脱离监管**" ✓。

| 字段 | 内容 |
|---|---|
| **名称** | 生物样本台账与链式保管（Biospecimen Ledger & Chain of Custody） |
| **目的** | 每个样本**可追溯**：谁采集／谁保管／谁取用／冻融几次／是否已销毁 ✓；**链式保管断链必须报** ✗✓；销毁后仍保留**引用**（与 07 只引用 ✓） |
| **面向谁** | 实验执行者、样本管理员、伦理/合规、审计、代理 |
| **接口形状** | 协议 `BiospecimenRecord` ⛔ 待实现：`{ sampleId, subjectRef, collectedAt, storage, freezeThawCount, chainOfCustody[] }`；协议 `CustodyEvent` ⛔ 待实现：`{ sampleId, from, to, atMs, why }`；服务 `vmu.biospecimen`（**计划 ✗**）：`register(sample)`／`transfer(sampleId, {from,to,why})`／`chain(sampleId)`／`verify(sampleId)`／`destroy(sampleId,{reason})`；工具 `vibe_vmu_biospecimen` ⛔ 未实现 |
| **可调控参数** | `vmu.biospecimen.ledgerDir`（默认 `Ops/Biosamples`）、`vmu.biospecimen.requireChain`（默认 `true`）、`vmu.biospecimen.chainGapPolicy`（默认 `block`；可选 `warn`）、`vmu.biospecimen.freezeThawWarnAt`（默认 `5`）、`vmu.biospecimen.destroyKeepsReference`（默认 `true`）、`vmu.biospecimen.subjectRefStyle`（默认 `pseudonym`）、`vmu.biospecimen.mappingIrreversible`（默认 **`true`** ✗✓） |
| **相关错误码** | `VMU_BIOSAMPLE_NOT_REGISTERED` ⛔／`VMU_BIOSAMPLE_CHAIN_GAP` ⛔（**断链**）／`VMU_BIOSAMPLE_FREEZE_THAW_LIMIT` ⛔／`VMU_BIOSAMPLE_SUBJECT_LINK_FORBIDDEN` ⛔／`VMU_BIOSAMPLE_DESTROYED` ⛔ |
| **四条哲学** | F：不登记＝无样本概念 ✓｜T：断链策略/冻融阈值/去标识样式可配 ✓｜D：链式三要素（who/when/why）由 **pack 声明**，内核不认识"生物样本" ✓｜X：新样本类型只加字段 ✓ |
| **实现要点** | ① 链式保管是**只追加事件流** ✓，每次转移三要素缺一即拒（`VMU_BIOSAMPLE_CHAIN_GAP`）✓；② **断链检测＝连续性检查**：上一环 `to` ≠ 下一环 `from`、时间倒流、或事件缺失 ⇒ **断链必须报** ✗✓（`block` 时拒绝后续操作并具名，`warn` 时计数并继续）；③ **销毁＝状态转换＋保留引用**（`destroyed`＋原因＋时间；样本记录**不删**，与 07 的保留/回收站面**只引用不重定义** ✗）；④ 与 **20 卷去标识化只引用** ✗：本卷只存 `subjectRef`（假名），**样本↔受试者映射默认不可逆** ✓ —— 不提供反向查询接口，任何"由样本找回受试者"的请求 ⇒ `VMU_BIOSAMPLE_SUBJECT_LINK_FORBIDDEN` |
| **依赖与前置** | §2.1 台账（同构）、07 记录轨/保留（引用 ✓）、20 去标识化与密级（引用 ✓）、§8.2 伦理审批（取样前闸点）✓ |
| **成熟度** | ✗ 计划（本仓今天**没有**任何样本/保管实现 ✓） |
| **优先级** | P1（不可重建的资产 + 合规风险） |

> **这一节怎么由 settings＋中间件＋pack 组合出来** ✓：**settings** 给账本位置、是否强制链式、断链处置、冻融阈值、去标识样式；**中间件**在 `before`（取样/转移/取用/销毁）校验登记与链条连续性、在 `after` 追加事件并广播；**pack** 给"链式三要素的字段、样本类型、允许的存储条件"。**内核只提供记录、钩子与设置** ✓。

---

## 3. 经费与财务（Funding & Finance）

### 3.0 货币与舍入类型（Money Type）—— **裁决：不做 ✗**（轮 54/55 审判；理由见 §14）

### 3.1 资助账户与预算行

| 字段 | 内容 |
|---|---|
| **名称** | 资助账户（Grant Account） |
| **目的** | 每个资金来源（grant/合同/内部经费）有**账户身份**与**预算行**（科目×期间×额度），使支出可归属、可对账 ✓ |
| **面向谁** | PI、财务、审计、代理（知道"这笔钱能不能花"） |
| **接口形状** | 服务 `vmu.funding`（**计划 ✗**）：`openAccount()`／`addBudgetLine()`／`available(account, category)`；工具 `vibe_vmu_funding` ⛔ 未实现；协议 `ExpenseClaim` ⛔、`CostShareSplit` ⛔ |
| **可调控参数** | `vmu.funding.accountsDir`（默认 `Ops/Funding`）、`vmu.funding.currency`（默认 `CNY`）、`vmu.funding.budgetLineGranularity`（默认 `category`；可选 `task`／`member`）、`vmu.funding.requiredFields`（**16 已声明**：本卷只**消费**，不重定义 ✓） |
| **相关错误码** | `VMU_FUNDING_ACCOUNT_MISSING` ⛔／`VMU_FUNDING_LINE_MISSING` ⛔ |
| **四条哲学** | F：不开账户＝无财务概念 ✓｜T：币种/粒度可配 ✓｜D：科目树由 pack ✓｜X：新资助方只加账户 ✓ |
| **实现要点** | 金额一律**整数最小单位**（分）存储，避免浮点 ✓；币种换算需**显式汇率来源**＋时间戳 ✓ |
| **依赖与前置** | `vibe_vmu_records` ✓、16 的经费面（`vmu.funding.requiredFields` ✓）、20 的合规基线 ✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P1 |

### 3.2 报销与采购（申请→批准→发生→凭证）

| 字段 | 内容 |
|---|---|
| **名称** | 费用流程（Expense Workflow）——**金额一律遵守 §3.0 的 Money 规则**（整数 minor units／显式舍入／显式汇率）✓ |
| **目的** | 每笔支出四环闭合（O-2）✓：请求（谁/为什么/多少钱/哪个预算行）→ 批准（谁按什么规则）→ 发生（采购/报销）→ 凭证（发票/收据/哈希） |
| **面向谁** | PI、财务、采购、代理 |
| **接口形状** | 服务 `vmu.funding.request()`／`approve()`／`recordReceipt()`（**计划 ✗**）；钩子 `ops/expense-requested` ⛔ 提案、`ops/expense-approved` ⛔ 提案、`ops/receipt-recorded` ⛔ 提案；工具 `vibe_vmu_funding` ⛔ 未实现 |
| **可调控参数** | `vmu.funding.approvalThresholdMinor`（默认 `100000`＝1000 元；分级审批）、`vmu.funding.reimbursementSlaDays`（默认 `14`）、`vmu.funding.expenseRequiredFields`（默认 `["amount","category","account","purpose","receiptHash"]`）、`vmu.funding.pettyCashLimitMinor`（默认 `0`＝无零用金） |
| **相关错误码** | `VMU_FUNDING_UNAPPROVED_EXPENSE` ⛔／`VMU_FUNDING_OVER_BUDGET` ⛔／`VMU_FUNDING_RECEIPT_MISSING` ⛔／`VMU_FUNDING_APPROVAL_REQUIRED` ⛔ |
| **四条哲学** | F：不启用＝自由支出（研究机构默认无流程）✓｜T：阈值/必填字段/SLA 可配 ✓｜D：审批链是 pack 的判定点（内核不认识"财务处"）✓｜X：新审批形态＝新判定点 ✓ |
| **实现要点** | 超阈值/超预算 ⇒ **具名拒**（不是静默降级）✓；"先花后批"必须走**例外流程**并留 `reason` ✓；人类审批可打断自动批准（O-6）✓ |
| **依赖与前置** | §3.1、08 工作流原语 ✓（状态机）、`vibe_vmu_task` ✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P1 |

### 3.3 分摊与跨机构结算

| 字段 | 内容 |
|---|---|
| **名称** | 成本分摊与结算（Cost Share & Settlement）——余数与守恒规则见 **§3.0.5** ✓ |
| **目的** | 一笔支出在多账户/多机构间**按显式比例分摊**，且分摊后**总额守恒** ✓（可复算） |
| **面向谁** | 财务、合作方、审计 |
| **接口形状** | 服务 `vmu.funding.split(expenseId, splits)`／`settle(period)`（**计划 ✗**）；协议 `CostShareSplit` ⛔ |
| **可调控参数** | `vmu.funding.costSharePolicy`（默认 `manual`；可选 `byMember`／`byTask`／`equalAll`）、`vmu.funding.crossInstitutionSettlementDays`（默认 `60`）、`vmu.funding.settlementRoundMinor`（默认 `1`＝到分） |
| **相关错误码** | `VMU_FUNDING_COSTSHARE_UNBALANCED` ⛔／`VMU_FUNDING_SETTLEMENT_OVERDUE` ⛔ |
| **四条哲学** | F：不分摊＝单账户 ✓｜T：比例/周期可配 ✓｜D：分摊规则由 pack ✓｜X：新结算通道只加字段 ✓ |
| **实现要点** | 分摊合计**必须等于**原始金额（差额＝舍入余数显式记在某账户，禁止丢弃）✓ |
| **依赖与前置** | §3.1、§3.2、§6（跨机构协作）|
| **成熟度** | ✗ 计划 |
| **优先级** | P2 |

### 3.4 审计凭证包

| 字段 | 内容 |
|---|---|
| **名称** | 财务审计凭证包（Audit Evidence Pack） |
| **目的** | 一键导出"**期间×账户×流程**"的完整凭证链（请求/批准/发生/凭证/分摊）供外部审计 ✓ |
| **面向谁** | 审计、财务、PI |
| **接口形状** | 服务 `vmu.funding.auditPack(period, filter)`（**计划 ✗**）；工具 `vibe_vmu_funding` ⛔ 未实现（`pack` 动作）；协议 `AuditEvidencePack` ⛔ |
| **可调控参数** | `vmu.funding.auditPackFields`（默认 `["claimId","amount","account","approver","receiptHash","split"]`）、`vmu.funding.auditPackFormat`（默认 `jsonl`） |
| **相关错误码** | `VMU_FUNDING_AUDIT_PACK_INCOMPLETE` ⛔ |
| **四条哲学** | F：不导出＝无审计面 ✓｜T：字段/格式可配 ✓｜D：审计需求由 pack/外部要求 ✓｜X：新格式只加渲染器 ✓ |
| **实现要点** | 导出**不脱敏**需人批准（与 20 的密级联动）✓；缺环凭证**必须**列出而不是省略 ✓ |
| **依赖与前置** | 07 记录轨 ✓、21 导出面 ✓、20 密级 ✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P1 |

> **这一族怎么由 settings＋中间件＋pack 组合出来** ✓：**settings** 给阈值、SLA、必填字段、币种；**中间件**在 `before` 校验（账户/预算行/字段齐全）、在 `after` 补记凭证与分摊、把违规具名拒；**pack** 给"科目树＋审批链＋分摊规则＋谁可批"。**与 17 的分工**：`vmu.budget.*`（令牌/回合）**不是钱** ✓；若某 pack 想把"令牌消耗"折算成成本，**必须**在 pack 里声明换算率与留痕字段（O-1）✓。

---

### 3.6 税务与法务实体（Tax & Legal Entities —— **补 N9** ✗✓）

> **为什么要有这一节** ✗：批评者实测"**税务**"**0 命中** ✗ —— 经费族有账户与凭证，却**没有"钱属于哪个法律实体、在哪个辖区、发票上要有哪些字段位"** ✓。**纪律**：本节**只声明字段位与校验点** ✗，**不写任何税法条文/税率/免税规则** ✓（那些随辖区变化，必须由 pack 与外部系统提供 ✓）。

| 字段 | 内容 |
|---|---|
| **名称** | 法律实体与税务字段位（Legal Entity & Tax Field Slots） |
| **目的** | 每笔钱的**法律归属**可核（哪个实体、哪个辖区、哪个税号引用）✓；发票/报销的**必要字段位**缺失即拒 ✓；**跨境**报销多一道闸点 ✓ |
| **面向谁** | 财务、法务、审计、PI、代理 |
| **接口形状** | 协议 `LegalEntity` ⛔ 待实现：`{ entityId, jurisdiction, taxIdRef, currency? }`；协议 `TaxFieldSlots` ⛔ 待实现：`{ slot, required, source }`；服务 `vmu.legalentity`（**计划 ✗**）：`register(entity)`／`bind(accountId, entityId)`／`validateInvoice(doc)`／`gate(documentType, context)`；工具 `vibe_vmu_legalentity` ⛔ 未实现 |
| **可调控参数** | `vmu.legalentity.registryDir`（默认 `Ops/Entities`）、`vmu.legalentity.requireEntity`（默认 `true`）、`vmu.legalentity.taxIdStyle`（默认 `opaque-ref`＝**只存引用，不存明文** ✓）、`vmu.legalentity.invoiceTaxSlots`（默认 `["taxIdRef","taxRateRef","taxAmountMinor","taxJurisdiction"]`）、`vmu.legalentity.crossBorderGate`（默认 `require-approval`）、`vmu.legalentity.crossBorderApproverRoles`（默认 `[]`） |
| **相关错误码** | `VMU_ENTITY_UNKNOWN` ⛔／`VMU_ENTITY_ACCOUNT_UNBOUND` ⛔／`VMU_TAX_FIELD_MISSING` ⛔／`VMU_CROSSBORDER_GATE_REQUIRED` ⛔／`VMU_CROSSBORDER_CURRENCY_MISMATCH` ⛔ |
| **四条哲学** | F：不登记实体＝无税务位 ✓｜T：字段位清单/闸点策略/审批角色可配 ✓｜D：**字段位是 pack 声明**，税率与法条**只在 pack/外部** ✓｜X：新辖区只加实体行与字段位 ✓ |
| **实现要点** | ① **只做字段位与校验点** ✗：`validateInvoice()` 检查清单里的**位**是否存在（缺位 ⇒ `VMU_TAX_FIELD_MISSING`），**不判断税率是否"正确"** ✓；② 税务标识只存**不透明引用**（`taxIdRef`）⇒ 明文税号不进研究所记录 ✓；③ 金额与币种一律走 **§3.0 的 Money**（整数 minor units）✓，实体 `currency` 与单据币种不一致 ⇒ `VMU_CROSSBORDER_CURRENCY_MISMATCH` ✓；④ **跨境闸点**：单据涉及非本实体辖区的支付/收款时，`crossBorderGate=require-approval` ⇒ 缺人类批准即**具名拒** `VMU_CROSSBORDER_GATE_REQUIRED` ✓（人类在环 O-6 ✓） |
| **依赖与前置** | §3.0／§3.1／§3.2、20（隐私与密级，引用 ✓）、§8（合规日历）✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P2（有跨境或报销才有硬需求） |

> **这一节怎么由 settings＋中间件＋pack 组合出来** ✓：**settings** 给实体账本、是否强制绑定、字段位清单、跨境闸点与审批角色；**中间件**在 `before`（报账/采购/付款）校验实体绑定与字段位、在 `after` 记录校验结果；**pack** 给"辖区→字段位集合""谁能批跨境"。**内核不认识税号/税率/辖区** ✓。

---

## 4. 知识产权（IP：专利 / 著作权 / 商业秘密）

### 4.1 发明披露（Disclosure Sweep）

| 字段 | 内容 |
|---|---|
| **名称** | 发明披露（Invention Disclosure） |
| **目的** | 从研究记录里**系统性地**发现"可披露事项"（新方法/装置/数据集/软件），并在公开前登记 ✓ |
| **面向谁** | PI、技术转移、法务、代理 |
| **接口形状** | 服务 `vmu.ip`（**计划 ✗**）：`sweep(period)`／`disclose(draft)`／`status(id)`；工具 `vibe_vmu_ip` ⛔ 未实现；钩子 `ip/disclosure-before` ⛔ 提案；协议 `IpDisclosure` ⛔ |
| **可调控参数** | `vmu.ip.disclosureRequired`（默认 `true`）、`vmu.ip.sweepCadenceDays`（默认 `90`）、`vmu.ip.disclosureFields`（默认 `["title","inventors","evidenceRefs","publicDisclosures"]`） |
| **相关错误码** | `VMU_IP_DISCLOSURE_REQUIRED` ⛔／`VMU_IP_DISCLOSURE_INCOMPLETE` ⛔ |
| **四条哲学** | F：不启用＝无 IP 流程 ✓｜T：周期/字段可配 ✓｜D："什么算发明"由 pack 判定点 ✓｜X：新 IP 类型只加字段 ✓ |
| **实现要点** | 披露是**记录轨条目**＋证据引用（指向 07 的产物/实验记录）✓；**不得**自动判定"可否专利"（那是法务判断）✗ |
| **依赖与前置** | 07 记录/归档 ✓、16 出版面 ✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P2 |

### 4.2 检索式记录与既有技术（Prior Art）

| 字段 | 内容 |
|---|---|
| **名称** | 检索记录（Prior-Art Record） |
| **目的** | 记录检索式、库、时间、命中项与结论，使"新颖性判断"**可复核** ✓ |
| **面向谁** | 法务、PI |
| **接口形状** | 服务 `vmu.ip.recordSearch(query, db, hits, conclusion)`（**计划 ✗**） |
| **可调控参数** | `vmu.ip.priorArtSearchDepth`（默认 `standard`；可选 `quick`／`deep`）、`vmu.ip.priorArtRequired`（默认 `true`） |
| **相关错误码** | `VMU_IP_PRIORART_MISSING` ⛔ |
| **四条哲学** | F：不检索＝不主张新颖性 ✓｜T：深度可配 ✓｜D：检索标准由 pack ✓｜X：新库只加数据 ✓ |
| **实现要点** | 检索式必须**逐字存档**（可复现）✓；结论与命中项分离存储 ✓ |
| **依赖与前置** | §4.1 |
| **成熟度** | ✗ 计划 |
| **优先级** | P3 |

### 4.3 权属与贡献（Ownership & Contributors）

| 字段 | 内容 |
|---|---|
| **名称** | 权属与贡献（Ownership & Contribution） |
| **目的** | 依据**贡献记录**（谁做了什么、贡献阈值）确定权属与署名顺序，且规则**显式可审** ✓ |
| **面向谁** | PI、法务、全体成员、代理 |
| **接口形状** | 服务 `vmu.ip.ownership(id)`／`vmu.ip.contributors(id)`（**计划 ✗**）；协议 `IpOwnership` ⛔ |
| **可调控参数** | `vmu.ip.ownershipDefault`（默认 `institution`）、`vmu.ip.contributorThreshold`（默认 `0.1`＝贡献占比）、`vmu.ip.authorshipRule`（默认 `byContribution`；可选 `alphabetical`／`seniorLast`）、`vmu.ip.appealWindowDays`（默认 `30`） |
| **相关错误码** | `VMU_IP_OWNERSHIP_CONFLICT` ⛔／`VMU_IP_CONTRIB_EVIDENCE_MISSING` ⛔ |
| **四条哲学** | F：不声明＝机构默认 ✓｜T：阈值/排序规则可配 ✓｜D：署名规则**必须是 pack 声明**（与 16 出版面共用同一份声明 ✓）｜X：新贡献模型只加数据 ✓ |
| **实现要点** | 贡献判定**只看记录轨证据**（不得凭记忆）✓；争议进申诉窗口（§10.4）✓ |
| **依赖与前置** | 07 记录轨 ✓、16 署名/出版面 ✓、§10 |
| **成熟度** | ✗ 计划 |
| **优先级** | P2 |

### 4.4 公开与保密的时序（Disclosure Clock，**O-3**）

| 字段 | 内容 |
|---|---|
| **名称** | 披露时钟（Disclosure Clock） |
| **目的** | 论文/预印本/会议报告/开源发布**必须**先过披露时钟：在"申请窗口"内不得公开发表（或必须显式豁免），避免损失可专利性 ✓ |
| **面向谁** | PI、法务、传播、代理 |
| **接口形状** | 服务 `vmu.ip.hold(targetRef, reason, untilMs)`／`release(holdId, evidence)`（**计划 ✗**）；钩子 `ip/publication-hold` ⛔ 提案、`ip/hold-released` ⛔ 提案 |
| **可调控参数** | `vmu.ip.confidentialityWindowDays`（默认 `180`）、`vmu.ip.publicationHoldDays`（默认 `90`）、`vmu.ip.holdEnforcement`（默认 `block`；可选 `warn`）、`vmu.ip.exemptRoles`（默认 `[]`） |
| **相关错误码** | `VMU_IP_PUBLICATION_HOLD` ⛔／`VMU_IP_CONFIDENTIALITY_BREACH` ⛔／`VMU_IP_HOLD_EXEMPTION_REQUIRED` ⛔ |
| **四条哲学** | F：不设时钟＝自由发布 ✓｜T：窗口/强制度可配 ✓｜D：豁免规则由 pack ✓｜X：新公开渠道只加锚点 ✓ |
| **实现要点** | 与 **16 出版面**交界处**只写一次**：**16 决定"能不能发表"（学术判据）**；**22 的时钟决定"何时能发表"（法务时序）** —— 冲突时**以更严者为准**并**具名**记录 ✓ |
| **依赖与前置** | §4.1、16 出版面、20 密级 |
| **成熟度** | ✗ 计划 |
| **优先级** | P1（时序错一次不可逆） |

### 4.5 技术转移与许可（引用 20，不重定义）

| 字段 | 内容 |
|---|---|
| **名称** | 技术转移（Transfer） |
| **目的** | 把许可/转让的**运营步骤**（评估→谈判→签署→交付→收益分配）挂到记录轨 ✓ |
| **接口形状** | 服务 `vmu.ip.transfer(id, terms)`（**计划 ✗**）；许可证条款本身**引用 20** 的 `vmu.license.*` ✓ |
| **可调控参数** | `vmu.ip.transferPolicy`（默认 `manual`）、`vmu.ip.revenueSharePolicy`（默认 `institution-first`） |
| **相关错误码** | `VMU_IP_TRANSFER_UNLICENSED` ⛔ |
| **四条哲学** | F：不转移＝保留 ✓｜T：政策可配 ✓｜D：条款由 pack/20 ✓｜X：新形式只加流程 ✓ |
| **实现要点** | **不重定义**许可语义 ✓；收益分配必须有凭证链（§3.3）✓ |
| **依赖与前置** | 20 `vmu.license.*` ✓、§3 |
| **成熟度** | ✗ 计划 |
| **优先级** | P3 |

> **这一族怎么组合出来** ✓：**settings** 给窗口天数、强制度、阈值；**中间件**在 `before`（任何"公开/发布/外发"动作前）查披露时钟与密级，命中 ⇒ 具名拒；**pack** 给"什么算发明、所有权默认、豁免角色、署名规则"。**内核不认识"专利/预印本"** ✓（F）。

---

## 5. 学术会议组织（Conference & Events）

> **本节的纪律（交界只写一次 ✗）**：**会议/表决/议程/纪要的语义全部来自 08** ✓；**评审的判据与冲突回避来自 16** ✓；本节只提供**会务编排**（征稿→分配→日程→注册→论文集）与**运营参数** ✓。

### 5.1 征稿与投稿轨（CfP & Submissions）

| 字段 | 内容 |
|---|---|
| **名称** | 征稿与投稿（Call for Papers） |
| **目的** | 一次征稿＝一个有窗口、有主题、有格式要求的**活动对象**；投稿落在记录轨并可被评审引用 ✓ |
| **面向谁** | 组织者、投稿者、代理 |
| **接口形状** | 服务 `vmu.conference`（**计划 ✗**）：`openCfP(spec)`／`submit(paper)`／`closeCfP()`；工具 `vibe_vmu_conference` ⛔ 未实现；协议 `CfP` ⛔ |
| **可调控参数** | `vmu.conference.cfpOpenMs`／`cfpCloseMs`（窗口）、`vmu.conference.topicsRequired`（默认 `true`）、`vmu.conference.anonymityMode`（默认 `double-blind`；可选 `single`／`open`） |
| **相关错误码** | `VMU_CONF_CFP_CLOSED` ⛔／`VMU_CONF_SUBMISSION_INVALID` ⛔ |
| **四条哲学** | F：不开 CfP＝无会议 ✓｜T：窗口/匿名模式可配 ✓｜D：主题与格式由 pack ✓｜X：新投稿类型只加字段 ✓ |
| **实现要点** | 匿名模式对**提示词与文件**同时生效（否则匿名是装饰）✓；投稿哈希入档（可复现）✓ |
| **依赖与前置** | 07 记录轨 ✓、08 活动原语 ✓、16 评审面 ✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P2 |

### 5.2 评审分配与冲突回避（**组合 16 ＋ 08**）

| 字段 | 内容 |
|---|---|
| **名称** | 评审分配（Review Assignment） |
| **目的** | 每篇投稿分配到**无冲突**的评审人；评审结论按 16 的判据形成；争议按 08 的表决原语升级 ✓ |
| **接口形状** | 服务 `vmu.conference.assign()`／`collectReviews()`（**计划 ✗**）；协议 `ReviewAssignment` ⛔；**评审判据引用 16 的 `vmu.review.*`** ✓ |
| **可调控参数** | `vmu.conference.reviewAssignmentsPerPaper`（默认 `3`）、`vmu.conference.reviewerConflicts`（默认 `["coauthor","institution","advisor"]`）、`vmu.conference.reviewDeadlineDays`（默认 `21`）、`vmu.conference.metaReviewRequired`（默认 `true`） |
| **相关错误码** | `VMU_CONF_ASSIGNMENT_CONFLICT` ⛔／`VMU_CONF_REVIEW_QUORUM_MISSING` ⛔（引用 16 的 `VMU_REVIEW_*` 语族 ✓） |
| **四条哲学** | F：不分配＝不评审 ✓｜T：人数/冲突类/期限可配 ✓｜D：冲突定义与升级规则由 pack ✓｜X：新分配算法只换判定点 ✓ |
| **实现要点** | 冲突回避**必须**是机器判定（不是自觉）✓；评审人名额与工作量挂钩 §9 容量 ✓ |
| **依赖与前置** | 16 `vmu.review.*` ✓、08 表决 ✓、§9 |
| **成熟度** | ✗ 计划 |
| **优先级** | P2 |

### 5.3 日程与议程（引用 08 的会议原语）

| 字段 | 内容 |
|---|---|
| **名称** | 日程编排（Program Scheduling） |
| **目的** | 把录用项排进时间表；冲突检测（同一人/同一场地）与时长控制 ✓ |
| **接口形状** | 服务 `vmu.conference.schedule()`（**计划 ✗**）；**会议/议程/纪要**一律走 `vibe_vmu_meeting` ✓ 与 08 的议程原语 ✓ |
| **可调控参数** | `vmu.conference.scheduleTz`（默认 `UTC`）、`vmu.conference.slotMinutes`（默认 `20`）、`vmu.conference.maxParallelTracks`（默认 `2`） |
| **相关错误码** | `VMU_CONF_SCHEDULE_CONFLICT` ⛔ |
| **四条哲学** | F：不排期＝无议程 ✓｜T：时区/时长/并行轨道可配 ✓｜D：优先级由 pack ✓｜X：新形态（线上/混合）只加字段 ✓ |
| **实现要点** | **不重定义** 08 的议程语义 ✓；日程变更广播走 17 的通知面 ✓ |
| **依赖与前置** | 08 `vmu.meeting.*` ✓、17 通知 ✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P2 |

### 5.4 注册、费用与论文集

| 字段 | 内容 |
|---|---|
| **名称** | 注册与论文集（Registration & Proceedings） |
| **目的** | 注册（人数上限、费用、减免）、论文集生成与发布（版权/许可引用 20）✓ |
| **接口形状** | 服务 `vmu.conference.register()`／`publishProceedings()`（**计划 ✗**） |
| **可调控参数** | `vmu.conference.registrationCap`（默认 `0`＝不限）、`vmu.conference.registrationFeeMinor`（默认 `0`）、`vmu.conference.waiverPolicy`（默认 `none`）、`vmu.conference.proceedingsTrack`（默认 `records`） |
| **相关错误码** | `VMU_CONF_REGISTRATION_CLOSED` ⛔／`VMU_CONF_CAP_REACHED` ⛔／`VMU_CONF_FEE_UNPAID` ⛔ |
| **四条哲学** | F：不注册＝开放参加 ✓｜T：上限/费用/减免可配 ✓｜D：减免规则由 pack ✓｜X：新论文集形态只加模板 ✓ |
| **实现要点** | 费用**必须**走 §3 的账户与凭证（不得绕过财务）✓；论文集版权声明**引用 20** ✓ |
| **依赖与前置** | §3.1、20 `vmu.license.*` ✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P3 |

> **这一族怎么组合出来** ✓：**settings** 给窗口、评审人数、期限、费用与上限；**中间件**在 `before`（投稿/注册/发布）校验窗口与资格、在 `after` 记录与广播；**pack** 给"会议形态＋评审规则＋冲突定义＋费用减免政策"。08 提供**会议与表决语义**，16 提供**评审判据**，本卷只做**会务编排** ✓。

---

## 6. 科学传播与公众参与（Outreach & Public Engagement）

### 6.1 公众摘要与科普稿（**证据保真**）

| 字段 | 内容 |
|---|---|
| **名称** | 公众摘要（Public Summary） |
| **目的** | 面向公众的摘要/图文/视频稿：**必须**可回指内部结论，且**证据强度不高于**内部结论（O-4）✓ |
| **面向谁** | 传播团队、PI、代理 |
| **接口形状** | 服务 `vmu.outreach`（**计划 ✗**）：`draft(targetRef)`／`review(draftId)`／`publish(draftId)`；工具 `vibe_vmu_outreach` ⛔ 未实现；钩子 `outreach/draft-before` ⛔ 提案 |
| **可调控参数** | `vmu.outreach.publicSummaryRequired`（默认 `true`）、`vmu.outreach.evidenceFidelity`（默认 `strict`；可选 `warn`）、`vmu.outreach.embargoRespect`（默认 `true`）、`vmu.outreach.languageSet`（默认 `["zh","en"]`） |
| **相关错误码** | `VMU_OUTREACH_EVIDENCE_MISMATCH` ⛔／`VMU_OUTREACH_EMBARGO` ⛔／`VMU_OUTREACH_REF_MISSING` ⛔ |
| **四条哲学** | F：不启用＝无传播面 ✓｜T：保真档位/语言集可配 ✓｜D："哪些词算夸大"由 pack 的词表判定点 ✓｜X：新渠道只加渲染器 ✓ |
| **实现要点** | 机器判据：稿内每个**结论句**必须带 `evidenceRef`（指向内部结论/回执 id）；无法回指 ⇒ **具名拒** ✓；`strict` 档位下"确定性措辞"必须被内部结论的置信度覆盖 ✓ |
| **依赖与前置** | 07 记录轨 ✓、16 出版面 ✓、20 脱敏 ✓ |
| **成熟度** | **意图已承载 ✓／机器判据未实现 ✗**（轮 63 实测）—— 论文轨道**已在提示词层**要求写作方："**不得编造**：没有证据的推测不要写成结论；**未决／被否证的条目必须显式标注**" ＋ "在 **evidence** 里写清证据路径"（`vibe-math-v5.js:5825-5826` ✓）；**但没有机器校验** ✗（交付的 `evidence` 是否为空、未决项是否真的标注，**无人检查** ✗）。 |
| **裁决（轮 63）** | **做 ✓，但落点在论文轨道的交付点，不新建 `vmu.outreach` 服务** ✗✓ —— **⓪ 步结论**：该机制**已有真实消费者**（**论文轨道自己产出 claims 与 evidence** ✓），而**独立的 `vmu.outreach`（`draft`/`review`/`publish`）没有消费者** ✗（公众摘要＝论文摘要，本已在轨道内产出 ✓）。**最小机器判据** ✓：交付件**`evidence` 为空 ⇒ 具名拒**（＝`VMU_OUTREACH_REF_MISSING` 的形状 ✓；**用该码前须先登记** ✓）；**"确定性措辞被置信度覆盖"（strict 档）明写未做 ✗**（需 pack 词表判定点 ✓）。<br>**未做 ✗ 明列**：`vmu.outreach.*` 四个键**未登记、未接线** ✗；`vmu.outreach` 服务**不建** ✗。 |
| **优先级** | P1（诚实性是机构资产） |

### 6.2 媒体与开放评审

| 字段 | 内容 |
|---|---|
| **名称** | 媒体与开放评审（Media & Open Review） |
| **目的** | 媒体询问、开放评审（公开评审意见）的**运营流程**：谁可代表机构发声、什么可公开 ✓ |
| **接口形状** | 服务 `vmu.outreach.mediaRequest()`／`openReview(package)`（**计划 ✗**） |
| **可调控参数** | `vmu.outreach.mediaApprovalPolicy`（默认 `spokesperson-only`）、`vmu.outreach.openReviewEnabled`（默认 `false`）、`vmu.outreach.anonymityPreserve`（默认 `true`） |
| **相关错误码** | `VMU_OUTREACH_MEDIA_UNAUTHORIZED` ⛔／`VMU_OUTREACH_ANONYMITY_BREACH` ⛔ |
| **四条哲学** | F：不声明＝无人可代表机构 ✓｜T：发言人/开放评审开关可配 ✓｜D：发言人名单由 pack ✓｜X：新渠道只加适配 ✓ |
| **实现要点** | 开放评审**必须**同时保留匿名（评审人身份）与署名（作者）的规则档 ✓ |
| **依赖与前置** | §6.1、20 隐私 ✓、16 评审 ✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P3 |

### 6.3 影响记录（Impact Log）

| 字段 | 内容 |
|---|---|
| **名称** | 影响记录 |
| **目的** | 记录传播与转化效果（引用数、媒体报道、政策引用、教学使用），**用于运营决策**而非学术评价 ✓ |
| **接口形状** | 服务 `vmu.outreach.impact()`（**计划 ✗**） |
| **可调控参数** | `vmu.outreach.impactLogFields`（默认 `["channel","reach","date","ref"]`）、`vmu.outreach.impactUseInEvaluation`（默认 `false` ✗） |
| **相关错误码** | `VMU_OUTREACH_IMPACT_INCOMPLETE` ⛔ |
| **四条哲学** | F：不记＝无影响面 ✓｜T：字段/是否用于考核可配 ✓｜D：考核规则由 pack ✓｜X：新指标只加字段 ✓ |
| **实现要点** | **默认禁止**把传播影响用于人事考核（避免"宣传换晋升"，与 17 的 S-3 精神一致 ✓） |
| **依赖与前置** | §6.1、§10（人事）|
| **成熟度** | ✗ 计划 |
| **优先级** | P3 |

> **这一族怎么组合出来** ✓：**settings** 给保真档位/语言/发言人政策；**中间件**在 `before`（发布动作前）校验 `evidenceRef` 与禁运、在 `after` 记录影响；**pack** 给词表（夸大词）、发言人名单、开放评审规则 ✓。

---

## 7. 跨机构协作与联邦交换（运营侧）

### 7.1 合作备忘与数据共享协议

| 字段 | 内容 |
|---|---|
| **名称** | 合作协议（Agreement & DSA） |
| **目的** | 与外部机构合作前**必须**有备忘（MoU）与数据共享协议（DSA）的记录；交换范围/期限/责任显式 ✓ |
| **面向谁** | PI、法务、数据管理、代理 |
| **接口形状** | 服务 `vmu.collab`（**计划 ✗**）：`registerAgreement()`／`attachDsa()`／`status()`；工具 `vibe_vmu_collab` ⛔ 未实现 |
| **可调控参数** | `vmu.collab.agreementRequired`（默认 `true`）、`vmu.collab.dataSharingTemplate`（默认 `standard`）、`vmu.collab.counterpartyRegistry`（默认 `Ops/Partners`）、`vmu.collab.expiryWarnDays`（默认 `30`） |
| **相关错误码** | `VMU_COLLAB_AGREEMENT_MISSING` ⛔／`VMU_COLLAB_DSA_EXPIRED` ⛔ |
| **四条哲学** | F：不登记＝无跨机构交换 ✓｜T：模板/预警期可配 ✓｜D：交换范围由 pack ✓｜X：新合作形态只加字段 ✓ |
| **实现要点** | **技术面引用 17（身份/委托）与 20（隐私/密级）**，不重定义 ✓；技术交换**必须**先有协议（`before` 钩子具名拒）✓ |
| **依赖与前置** | 17 身份 ✓、20 隐私 ✓、07 记录 ✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P2 |

### 7.2 联合署名规则与 7.3 结算对账

| 字段 | 内容 |
|---|---|
| **名称** | 联合署名与结算（Joint Authorship & Settlement） |
| **目的** | 多机构成果的署名规则（顺序/单位标注）与费用对账 **显式化** ✓ |
| **接口形状** | 服务 `vmu.collab.authorship()`／`reconcile(period)`（**计划 ✗**） |
| **可调控参数** | `vmu.collab.jointAuthorshipPolicy`（默认 `contribution-then-alternate`）、`vmu.collab.settlementCycleDays`（默认 `60`）、`vmu.collab.reconciliationToleranceMinor`（默认 `1`） |
| **相关错误码** | `VMU_COLLAB_SETTLEMENT_MISMATCH` ⛔／`VMU_COLLAB_AUTHORSHIP_CONFLICT` ⛔ |
| **四条哲学** | F：不声明＝各署各的 ✓｜T：规则/周期可配 ✓｜D：署名规则由 pack（与 §4.3 同一份声明 ✓）｜X：新规则只加判定点 ✓ |
| **实现要点** | 对账差异**必须**逐笔列出（不得只报总额）✓；署名争议进申诉（§10.4）✓ |
| **依赖与前置** | §3.3、§4.3、20 ✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P3 |

### 7.4 数据使用协议与材料转移协议（DUA / MTA —— **补 N10** ✗✓）

> **为什么要有这一节** ✗：批评者实测"**数据使用协议/材料转移协议**"**0 命中** ✗ —— §7 有"合作备忘与数据共享协议"的**运营步骤** ✓，却没有**协议本体**与"**未签不得共享**"这条**机器可判定**的闸 ✓。本节的协议同时覆盖 **数据（DUA）** 与 **材料/样本（MTA）** ✓，后者与 §2.5 的样本交接联动 ✓。

| 字段 | 内容 |
|---|---|
| **名称** | 协议本体与共享闸（Agreement Registry & Sharing Gate） |
| **目的** | **共享/转移前必须有已签协议** ✗✓（机器可判定）；协议**范围与限制**可核；**到期⇒复审**（机制**引用 21** ✓，本卷不重定义通知/日历） |
| **面向谁** | PI、法务、数据管理、样本管理员、代理 |
| **接口形状** | 协议 `Agreement` ⛔ 待实现：`{ agreementId, kind: 'dua'|'mta', parties[], scope, expiresAt, restrictions[], signatureRef }`；服务 `vmu.agreements`（**计划 ✗**）：`register(agreement)`／`sign(agreementId, {signatureRef})`／`check(agreementId, {action, targetRef})`／`expiring(windowDays)`；工具 `vibe_vmu_agreements` ⛔ 未实现；钩子 `agreement/check-before` ⛔ 提案 |
| **可调控参数** | `vmu.agreements.registryDir`（默认 `Ops/Agreements`）、`vmu.agreements.kinds`（默认 `["dua","mta"]`）、`vmu.agreements.unsignedPolicy`（默认 **`block`** ✗✓）、`vmu.agreements.signatureRefRequired`（默认 `true`）、`vmu.agreements.expiryWarnDays`（默认 `30`）、`vmu.agreements.reviewCadenceDays`（默认 `365`）、`vmu.agreements.scopeEnforcement`（默认 `block`） |
| **相关错误码** | `VMU_AGREEMENT_MISSING` ⛔／`VMU_AGREEMENT_UNSIGNED` ⛔／`VMU_AGREEMENT_EXPIRED` ⛔／`VMU_AGREEMENT_SCOPE_VIOLATION` ⛔／`VMU_AGREEMENT_SIGNATURE_MISSING` ⛔ |
| **四条哲学** | F：不登记协议＝无共享闸（自由共享）✓｜T：是否阻断/预警期/复审周期可配 ✓｜D：**协议种类与限制项由 pack 声明** ✓｜X：新协议类型只加 `kind` 与字段 ✓ |
| **实现要点** | ① `check()` 是**纯判定**（返回 `{ allowed, agreementId, reason }`）✓：无协议 ⇒ `VMU_AGREEMENT_MISSING`；有协议但 `signatureRef` 为空 ⇒ **`VMU_AGREEMENT_UNSIGNED`**（**未签不得共享** ✗✓，机器可判定 ⇒ 可在 `before` 钩子里硬拦）；`expiresAt < now` ⇒ `VMU_AGREEMENT_EXPIRED`；`restrictions[]` 与请求的 `action`/`targetRef` 不符 ⇒ `VMU_AGREEMENT_SCOPE_VIOLATION`；② **到期复审提醒**：本卷只提供 `expiring(windowDays)` **查询** ✓，**提醒/日历/告警机制引用 21** ✗（不在本卷重定义）；③ **签名只存引用**（`signatureRef`，如外部签署系统的条目 id）✓，不存签名正文；④ 与 **§7.1/§7.2** 绑定：DSA/联合署名规则走同一条闸 ✓；**MTA** 与 **§2.5 样本转移**联动（材料交接必须引用有效 MTA）✓ |
| **依赖与前置** | §7.1、§2.5（MTA）、21（提醒机制，引用 ✓）、20（隐私与密级，引用 ✓）、§8.1 合规日历（引用 ✓） |
| **成熟度** | ✗ 计划 |
| **优先级** | P1（"未签先共享"是最高频的合规事故） |

> **这一节怎么由 settings＋中间件＋pack 组合出来** ✓：**settings** 给协议账本、未签策略、预警期、复审周期、范围强制度；**中间件**在 `before`（任何共享/导出/样本转移前）调用 `check()` 并按策略**具名拒**、在 `after` 记录判定；**pack** 给"协议种类、限制项词汇、谁能签署"。**内核只提供记录、钩子与设置** ✓。

---

## 8. 合规与审计运营（Compliance & Audit Operations）

### 8.1 合规日历（Compliance Calendar）

| 字段 | 内容 |
|---|---|
| **名称** | 合规日历 |
| **目的** | 把"什么时候必须做什么"（伦理复审、数据保护评估、许可复核、审计窗口、证书续期）变成**日历项＋提醒＋逾期升级** ✓ |
| **面向谁** | 合规负责人、PI、运营 |
| **接口形状** | 服务 `vmu.compliance`（**计划 ✗**）：`addDue()`／`listDue()`／`complete()`；工具 `vibe_vmu_compliance` ⛔ 未实现；钩子 `compliance/calendar-due` ⛔ 提案、`compliance/overdue` ⛔ 提案 |
| **可调控参数** | `vmu.compliance.calendarDir`（默认 `Ops/Compliance`）、`vmu.compliance.auditPrepLeadDays`（默认 `30`）、`vmu.compliance.overdueEscalation`（默认 `warn-then-block`）、`vmu.compliance.calendarTemplate`（默认 `standard`） |
| **相关错误码** | `VMU_COMPLIANCE_CALENDAR_MISSED` ⛔／`VMU_COMPLIANCE_OVERDUE_BLOCK` ⛔ |
| **四条哲学** | F：不启用＝无日历 ✓｜T：提前量/升级策略可配 ✓｜D：合规项清单由 pack（辖区相关）✓｜X：新辖区只加模板 ✓ |
| **实现要点** | 逾期升级的"阻断"**必须**说明阻断对象（哪类动作），不得泛化阻塞研究 ✓ |
| **依赖与前置** | 20 合规基线 ✓、21 观测 ✓、08 任务板 ✓（把到期项派单） |
| **成熟度** | ✗ 计划 |
| **优先级** | P1 |

### 8.2 伦理、出口管制与利益冲突

| 字段 | 内容 |
|---|---|
| **名称** | 伦理/出口/COI 检查 |
| **目的** | 涉及人类/动物/敏感数据/受控技术/潜在利益冲突的研究，**开工前**取得对应批准与披露 ✓ |
| **接口形状** | 服务 `vmu.compliance.require(approvalType, targetRef)`／`discloseCoi()`（**计划 ✗**） |
| **可调控参数** | `vmu.compliance.irbRequired`（默认 `true`）、`vmu.compliance.exportControlCheck`（默认 `true`）、`vmu.compliance.conflictOfInterestDisclosure`（默认 `annual`）、`vmu.compliance.coiScope`（默认 `["funding","review","procurement"]`） |
| **相关错误码** | `VMU_COMPLIANCE_APPROVAL_MISSING` ⛔／`VMU_COMPLIANCE_EXPORT_BLOCKED` ⛔／`VMU_COMPLIANCE_COI_UNDISCLOSED` ⛔ |
| **四条哲学** | F：不启用＝无审批要求 ✓｜T：类型/频率可配 ✓｜D：判定点由 pack 声明（**内核不认识"伦理委员会"**）✓｜X：新审批类型只加数据 ✓ |
| **实现要点** | 与 **16 评审面**联动：未披露 COI 的评审人**不得**被分配（§5.2）✓；与 **20** 的密级/导出限制联动 ✓ |
| **依赖与前置** | 20 ✓、16 ✓、§5.2 |
| **成熟度** | ✗ 计划 |
| **优先级** | P1 |

### 8.3 审计准备与证据包

| 字段 | 内容 |
|---|---|
| **名称** | 审计准备（Audit Prep） |
| **目的** | 在审计窗口前自动汇总**证据清单**（哪些凭证/记录/审批缺失），并生成**证据包** ✓ |
| **接口形状** | 服务 `vmu.compliance.prepare(scope)`／`exportPack()`（**计划 ✗**）；工具 `vibe_vmu_compliance` ⛔ 未实现；协议 `AuditEvidencePack` ⛔（与 §3.4 同一形状，财务/合规两视角 ✓） |
| **可调控参数** | `vmu.compliance.evidencePackFields`（默认 `["itemId","source","owner","evidenceRef","status"]`）、`vmu.compliance.redactionPolicy`（默认 `byClassification`＝引用 20 ✓） |
| **相关错误码** | `VMU_COMPLIANCE_EVIDENCE_INCOMPLETE` ⛔ |
| **四条哲学** | F：不准备＝临时抱佛脚 ✓｜T：字段/脱敏策略可配 ✓｜D：审计要求由 pack ✓｜X：新审计框架只加模板 ✓ |
| **实现要点** | 证据包**必须**给出**缺口清单**（不是只给已有的）✓；导出走 21 的观测导出面 ✓ |
| **依赖与前置** | §3.4、20 ✓、21 ✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P1 |

---

## 9. 资源与设施容量（Capacity & Facilities）

| 条目 | 名称 | 目的 | 可调控参数 | 码 | 成熟度 | 优先级 |
|---|---|---|---|---|---|---|
| 9.1 | **名额/席位** | 每个领域/角色的在用名额上限与候补（**席位语义引用 17** ✓） | `vmu.capacity.seatsPerDomain`（默认 `{}`）、`vmu.capacity.waitlistMax`（默认 `50`） | `VMU_CAPACITY_EXHAUSTED` ⛔ | ✗ | P1 |
| 9.2 | **机时/算力池** | 计算资源池的运营分配（配额、抢占、优先级） | `vmu.capacity.machineHoursPool`（默认 `{}`）、`vmu.capacity.preemptPolicy`（默认 `priority`）、`vmu.capacity.overcommitRatio`（默认 `1.0`） | `VMU_CAPACITY_POOL_LOW` ⛔／`VMU_CAPACITY_PREEMPTED` ⛔ | ✗ | P1 |
| 9.3 | **存储容量** | 引用 07 的 `vmu.quota.*` ✓（**不重定义**）＋运营预警与清理排期 | `vmu.capacity.storageWarnRatio`（默认 `0.8`）、`vmu.capacity.cleanupCadenceDays`（默认 `30`） | `VMU_CAPACITY_STORAGE_WARN` ⛔ | ✗ | P2 |
| 9.4 | **预测与排队** | 未来 N 天需求预测（基于任务板/在飞作业）与排队策略 | `vmu.capacity.forecastHorizonDays`（默认 `90`）、`vmu.capacity.allocationPolicy`（默认 `fair-share`）、`vmu.capacity.forecastStaleDays`（默认 `14`） | `VMU_CAPACITY_FORECAST_STALE` ⛔ | ✗ | P2 |
| 9.5 | **设施使用登记** | 场地/实验室/工位的占用与安全要求（与 §2 仪器同构） | `vmu.capacity.facilities`（默认 `[]`）、`vmu.capacity.safetyBriefingRequired`（默认 `true`） | `VMU_CAPACITY_FACILITY_CONFLICT` ⛔ | ✗ | P3 |

> **这一族怎么组合出来** ✓：**settings** 给池大小、超额比、预警比例、预测期；**中间件**在 `before`（申请资源/启动大批作业前）查池与预测、在 `after` 记用量；**pack** 给"谁能优先、哪类作业可抢占、哪些场地需安全简报" ✓。**存储语义与配额仍归 07** ✓（引用不重定义）。

---

## 10. 人事与任期运营（Personnel & Tenure Operations）

> **交界（只写一次 ✗）**：**17 管"席位/招募/试用/权限"（`vmu.recruit.*` ✓）**；**22 管"周期运营"**：评审季、绩效节奏、任期决策、轮换、离职、申诉 ✓。

| 条目 | 名称 | 目的 | 可调控参数 | 码 | 成熟度 | 优先级 |
|---|---|---|---|---|---|---|
| 10.1 | **招募周期（运营）** | 与 17 的招募衔接：周期开窗、评审季排期、名额与容量联动（§9.1） | `vmu.hr.recruitCycleDays`（默认 `60`）、`vmu.hr.recruitWindowOpenMs` | `VMU_HR_CYCLE_CLOSED` ⛔ | ✗ | P2 |
| 10.2 | **绩效节奏** | 定期回顾的节奏与材料清单（**材料来自记录轨**，不凭印象 ✓） | `vmu.hr.performanceCadenceDays`（默认 `180`）、`vmu.hr.performanceEvidenceRequired`（默认 `true`） | `VMU_HR_PERF_EVIDENCE_MISSING` ⛔ | ✗ | P2 |
| 10.3 | **任期与晋升** | 任期时钟、里程碑、决策窗口（引用 16 的成果面，引用 17 的席位面） | `vmu.hr.tenureTrackMonths`（默认 `60`）、`vmu.hr.tenureDecisionWindowDays`（默认 `90`）、`vmu.hr.tenureQuorum`（默认 `3`） | `VMU_HR_TENURE_DECISION_DUE` ⛔／`VMU_HR_TENURE_QUORUM_MISSING` ⛔ | ✗ | P1 |
| 10.4 | **轮换·离职·申诉** | 轮换与离职清单（权限回收、数据交接、设备归还、文件归档）；申诉窗口与受理 | `vmu.hr.offboardingChecklist`（默认 `["revoke","handover","return","archive"]`）、`vmu.hr.appealWindowDays`（默认 `30`）、`vmu.hr.rotationPolicy`（默认 `none`） | `VMU_HR_OFFBOARDING_INCOMPLETE` ⛔／`VMU_HR_APPEAL_OPEN` ⛔ | ✗ | P1 |
| 10.5 | **人类在环** | 人事决策**永不**自动化（只准备材料），人类审批可打断（O-6） | `vmu.hr.humanDecisionRequired`（默认 `true`） | `VMU_HR_AUTODECISION_FORBIDDEN` ⛔ | ✗ | P0（纪律） |

> **这一族怎么组合出来** ✓：**settings** 给周期/窗口/清单；**中间件**在 `before`（权限变更/离职动作前）检查清单闭合、在 `after` 记录；**pack** 给"任期规则、评审季规则、申诉流程" ✓。**招募与试用语义归 17** ✓（引用不重定义）。

---

## 11. 组合与可调控性总纲（**本卷的灵魂**）

### 11.1 三层职责
| 层 | 决定什么 | 现状 |
|---|---|---|
| **settings**（`vmu.money.*`／`vmu.instruments.*`／`funding.*`／`ip.*`／`conference.*`／`outreach.*`／`collab.*`／`compliance.*`／`capacity.*`／`hr.*`） | 阈值、窗口、必填字段、强制度、周期、**金额表示与舍入** | ✗ 全部为计划键（`planned:true`）✓ |
| **中间件** | 在运营动作**前后**插入检查与记账（`ops/*`、`ip/*`、`compliance/*` 钩子均为**提案** ✗） | 机制已实现 ✓（05），本卷钩子未实现 ✗ |
| **pack** | 组织政策：科目树、审批链、冲突定义、发言人、合规项清单、任期规则 | 机制已实现 ✓（10），运营 pack 未写 ✗ |

### 11.2 替换 / 组合矩阵（**每一族都能被这三层改**）
| 想要的效果 | 层 | 做法 | 现状 |
|---|---|---|---|
| 换审批链（PI 单签 → 双签） | pack | 改判定点与阈值 | ✗ |
| 换会计科目树 | pack | 加科目数据 | ✗ |
| 立刻收紧禁运 | settings | `vmu.ip.holdEnforcement=block`（H2 热改） | ✗ |
| 让某类设备免校准 | pack＋settings | 设备类别映射＋`requireCalibration` 覆盖 | ✗ |
| 传播稿必须双人复核 | 中间件 | `outreach/draft-before` 插复核 | ✗（钩子为提案） |
| 审计季自动派单 | 中间件＋08 | `compliance/calendar-due` → 任务板 | ✗ |
| 关闭整个运营层 | settings | 不声明任何 `vmu.<ops>.*` 族 | ✓（零机制） |

### 11.3 必须内核/机制层强制（任何 settings/pack 不能关）
**O-1…O-6** 六条不变式 ✓：令牌≠钱、凭证链闭合、披露时钟、证据保真、运营不改结论、人类在环 —— 它们**不是**可配项 ✗（可配的只是参数与阈值）✓。

### 11.4 扩展点
- **脚本桥可扩展** ✓：`vibe_vmu_script` 调外部财务/法务系统并**归档回执**；
- **需要代码的扩展** ✗：新服务（`kernel/ops/*`，**未实现** ⛔）、新协议（`ExpenseClaim`／`IpDisclosure`／`CfP`／`AuditEvidencePack`／`CapacityPlan`／`TenureReview`，**未实现** ⛔）。

---

## 12. 接口形状总表（✓ 已实现／✗ 计划）

| 类别 | 名称 | 现状 |
|---|---|---|
| 工具 | `vibe_vmu_instruments` ⛔ 未实现、`vibe_vmu_funding` ⛔ 未实现、`vibe_vmu_ip` ⛔ 未实现、`vibe_vmu_conference` ⛔ 未实现、`vibe_vmu_outreach` ⛔ 未实现、`vibe_vmu_collab` ⛔ 未实现、`vibe_vmu_compliance` ⛔ 未实现、`vibe_vmu_capacity` ⛔ 未实现、`vibe_vmu_hr` ⛔ 未实现 | ✗ |
| 工具（复用） | `vibe_vmu_records` ✓、`vibe_vmu_task` ✓、`vibe_vmu_meeting` ✓、`vibe_vmu_set` ✓、`vibe_vmu_middleware` ✓、`vibe_vmu_pack` ✓、`vibe_vmu_script` ✓、`vibe_vmu_status` ✓、`vibe_vmu_control` ✓ | ✓ |
| 服务 | `vmu.instruments`／`vmu.funding`／`vmu.ip`／`vmu.conference`／`vmu.outreach`／`vmu.collab`／`vmu.compliance`／`vmu.capacity`／`vmu.hr`（计划 `kernel/ops/*`） | ✗ |
| 钩子 | `ops/expense-requested` ⛔ 提案、`ops/expense-approved` ⛔ 提案、`ops/receipt-recorded` ⛔ 提案、`ops/reservation-requested` ⛔ 提案、`ops/reservation-conflict` ⛔ 提案、`ops/calibration-due` ⛔ 提案、`ip/disclosure-before` ⛔ 提案、`ip/publication-hold` ⛔ 提案、`conference/cfp-open` ⛔ 提案、`conference/decision` ⛔ 提案、`outreach/draft-before` ⛔ 提案、`compliance/calendar-due` ⛔ 提案、`capacity/pool-low` ⛔ 提案、`hr/review-season-open` ⛔ 提案 | ✗ |
| 协议 | `InstrumentReservation` ⛔、`ExpenseClaim` ⛔、`CostShareSplit` ⛔、`IpDisclosure` ⛔、`CfP` ⛔、`ReviewAssignment` ⛔、`AuditEvidencePack` ⛔、`CapacityPlan` ⛔、`TenureReview` ⛔ | ✗ |

---

## 13. 拟增键总表（**具体键**；由生成管线登记为 `planned`）

| 族 | 键 | 类型 | 默认 | 域 | 谁可改 |
|---|---|---|---|---|---|
| 仪器 | `vmu.instruments.ledgerDir` | string | `Ops/Instruments` | 相对项目根 | 运营席 |
| 仪器 | `vmu.instruments.requireOwner` | boolean | `true` | — | pack |
| 仪器 | `vmu.instruments.capabilityTags` | string[] | `[]` | 标签 | pack |
| 仪器 | `vmu.instruments.reservationHorizonDays` | integer | `30` | ≥0 | 运营席 |
| 仪器 | `vmu.instruments.maxHoldHours` | integer | `12` | ≥1 | 运营席 |
| 仪器 | `vmu.instruments.priorityPolicy` | string | `fifo` | `fifo`｜`pi-first`｜`quota-weighted` | pack |
| 仪器 | `vmu.instruments.waitlistPolicy` | string | `auto-offer` | `auto-offer`｜`manual`｜`off` | 运营席 |
| 仪器 | `vmu.instruments.overbookRatio` | number | `1.0` | ≥1.0 | 运营席 |
| 仪器 | `vmu.instruments.requireCalibration` | boolean | `true` | — | pack |
| 仪器 | `vmu.instruments.calibrationDueDays` | integer | `365` | ≥1 | 运营席 |
| 仪器 | `vmu.instruments.blockOnOverdue` | boolean | `true` | — | pack |
| 仪器 | `vmu.instruments.downtimePolicy` | string | `queue` | `queue`｜`fail` | 运营席 |
| 仪器 | `vmu.instruments.dataCaptureRef` | string | `required` | `required`｜`optional`｜`ignore` | pack |
| 仪器 | `vmu.instruments.hashAlgo` | string | `sha256` | 算法名 | 内核固定（可读） |
| 经费 | `vmu.funding.accountsDir` | string | `Ops/Funding` | 相对项目根 | 运营席 |
| 经费 | `vmu.funding.currency` | string | `CNY` | ISO-4217 | 运营席 |
| 经费 | `vmu.funding.budgetLineGranularity` | string | `category` | `category`｜`task`｜`member` | pack |
| 经费 | `vmu.funding.approvalThresholdMinor` | integer | `100000` | ≥0（最小单位） | pack |
| 经费 | `vmu.funding.reimbursementSlaDays` | integer | `14` | ≥1 | 运营席 |
| 经费 | `vmu.funding.expenseRequiredFields` | string[] | `["amount","category","account","purpose","receiptHash"]` | 字段名 | pack |
| 经费 | `vmu.funding.pettyCashLimitMinor` | integer | `0` | ≥0 | pack |
| 经费 | `vmu.funding.costSharePolicy` | string | `manual` | `manual`｜`byMember`｜`byTask`｜`equalAll` | pack |
| 经费 | `vmu.funding.crossInstitutionSettlementDays` | integer | `60` | ≥1 | 运营席 |
| 经费 | `vmu.funding.settlementRoundMinor` | integer | `1` | ≥1 | 运营席 |
| 经费 | `vmu.funding.auditPackFields` | string[] | `["claimId","amount","account","approver","receiptHash","split"]` | 字段名 | 运营席 |
| 经费 | `vmu.funding.auditPackFormat` | string | `jsonl` | `jsonl`｜`csv` | 运营席 |
| 知识产权 | `vmu.ip.disclosureRequired` | boolean | `true` | — | pack |
| 知识产权 | `vmu.ip.sweepCadenceDays` | integer | `90` | ≥1 | 运营席 |
| 知识产权 | `vmu.ip.disclosureFields` | string[] | `["title","inventors","evidenceRefs","publicDisclosures"]` | 字段名 | pack |
| 知识产权 | `vmu.ip.priorArtSearchDepth` | string | `standard` | `quick`｜`standard`｜`deep` | 运营席 |
| 知识产权 | `vmu.ip.priorArtRequired` | boolean | `true` | — | pack |
| 知识产权 | `vmu.ip.ownershipDefault` | string | `institution` | `institution`｜`inventor`｜`joint` | pack |
| 知识产权 | `vmu.ip.contributorThreshold` | number | `0.1` | 0–1 | pack |
| 知识产权 | `vmu.ip.authorshipRule` | string | `byContribution` | `byContribution`｜`alphabetical`｜`seniorLast` | pack |
| 知识产权 | `vmu.ip.appealWindowDays` | integer | `30` | ≥0 | pack |
| 知识产权 | `vmu.ip.confidentialityWindowDays` | integer | `180` | ≥0 | pack |
| 知识产权 | `vmu.ip.publicationHoldDays` | integer | `90` | ≥0 | pack |
| 知识产权 | `vmu.ip.holdEnforcement` | string | `block` | `block`｜`warn` | pack |
| 知识产权 | `vmu.ip.exemptRoles` | string[] | `[]` | 席位名 | pack |
| 知识产权 | `vmu.ip.transferPolicy` | string | `manual` | `manual`｜`auto-terms` | pack |
| 知识产权 | `vmu.ip.revenueSharePolicy` | string | `institution-first` | 政策名 | pack |
| 会务 | `vmu.conference.cfpOpenMs` | integer | `0` | ≥0 | 组织席 |
| 会务 | `vmu.conference.cfpCloseMs` | integer | `0` | ≥0 | 组织席 |
| 会务 | `vmu.conference.topicsRequired` | boolean | `true` | — | 组织席 |
| 会务 | `vmu.conference.anonymityMode` | string | `double-blind` | `double-blind`｜`single`｜`open` | pack |
| 会务 | `vmu.conference.reviewAssignmentsPerPaper` | integer | `3` | ≥1 | pack |
| 会务 | `vmu.conference.reviewerConflicts` | string[] | `["coauthor","institution","advisor"]` | 冲突类 | pack |
| 会务 | `vmu.conference.reviewDeadlineDays` | integer | `21` | ≥1 | 组织席 |
| 会务 | `vmu.conference.metaReviewRequired` | boolean | `true` | — | pack |
| 会务 | `vmu.conference.scheduleTz` | string | `UTC` | IANA 名 | 组织席 |
| 会务 | `vmu.conference.slotMinutes` | integer | `20` | ≥5 | 组织席 |
| 会务 | `vmu.conference.maxParallelTracks` | integer | `2` | ≥1 | 组织席 |
| 会务 | `vmu.conference.registrationCap` | integer | `0` | ≥0（0＝不限） | 组织席 |
| 会务 | `vmu.conference.registrationFeeMinor` | integer | `0` | ≥0 | pack |
| 会务 | `vmu.conference.waiverPolicy` | string | `none` | `none`｜`byRole`｜`byRequest` | pack |
| 会务 | `vmu.conference.proceedingsTrack` | string | `records` | 轨名 | 组织席 |
| 传播 | `vmu.outreach.publicSummaryRequired` | boolean | `true` | — | pack |
| 传播 | `vmu.outreach.evidenceFidelity` | string | `strict` | `strict`｜`warn` | pack |
| 传播 | `vmu.outreach.embargoRespect` | boolean | `true` | — | pack |
| 传播 | `vmu.outreach.languageSet` | string[] | `["zh","en"]` | 语言码 | 运营席 |
| 传播 | `vmu.outreach.mediaApprovalPolicy` | string | `spokesperson-only` | 政策名 | pack |
| 传播 | `vmu.outreach.openReviewEnabled` | boolean | `false` | — | pack |
| 传播 | `vmu.outreach.anonymityPreserve` | boolean | `true` | — | pack |
| 传播 | `vmu.outreach.impactLogFields` | string[] | `["channel","reach","date","ref"]` | 字段名 | 运营席 |
| 传播 | `vmu.outreach.impactUseInEvaluation` | boolean | `false` | — | pack |
| 协作 | `vmu.collab.agreementRequired` | boolean | `true` | — | pack |
| 协作 | `vmu.collab.dataSharingTemplate` | string | `standard` | 模板名 | pack |
| 协作 | `vmu.collab.counterpartyRegistry` | string | `Ops/Partners` | 相对项目根 | 运营席 |
| 协作 | `vmu.collab.expiryWarnDays` | integer | `30` | ≥0 | 运营席 |
| 协作 | `vmu.collab.jointAuthorshipPolicy` | string | `contribution-then-alternate` | 政策名 | pack |
| 协作 | `vmu.collab.settlementCycleDays` | integer | `60` | ≥1 | 运营席 |
| 协作 | `vmu.collab.reconciliationToleranceMinor` | integer | `1` | ≥0 | 运营席 |
| 合规 | `vmu.compliance.calendarDir` | string | `Ops/Compliance` | 相对项目根 | 合规席 |
| 合规 | `vmu.compliance.auditPrepLeadDays` | integer | `30` | ≥0 | 合规席 |
| 合规 | `vmu.compliance.overdueEscalation` | string | `warn-then-block` | `warn`｜`block`｜`warn-then-block` | pack |
| 合规 | `vmu.compliance.calendarTemplate` | string | `standard` | 模板名 | pack |
| 合规 | `vmu.compliance.irbRequired` | boolean | `true` | — | pack |
| 合规 | `vmu.compliance.exportControlCheck` | boolean | `true` | — | pack |
| 合规 | `vmu.compliance.conflictOfInterestDisclosure` | string | `annual` | `annual`｜`perProject`｜`off` | pack |
| 合规 | `vmu.compliance.coiScope` | string[] | `["funding","review","procurement"]` | 场景 | pack |
| 合规 | `vmu.compliance.evidencePackFields` | string[] | `["itemId","source","owner","evidenceRef","status"]` | 字段名 | 合规席 |
| 合规 | `vmu.compliance.redactionPolicy` | string | `byClassification` | 策略名 | pack（引用 20） |
| 容量 | `vmu.capacity.seatsPerDomain` | object | `{}` | 领域→名额 | pack |
| 容量 | `vmu.capacity.waitlistMax` | integer | `50` | ≥0 | 运营席 |
| 容量 | `vmu.capacity.machineHoursPool` | object | `{}` | 池→上限 | pack |
| 容量 | `vmu.capacity.preemptPolicy` | string | `priority` | `priority`｜`fifo`｜`off` | pack |
| 容量 | `vmu.capacity.overcommitRatio` | number | `1.0` | ≥1.0 | 运营席 |
| 容量 | `vmu.capacity.storageWarnRatio` | number | `0.8` | 0–1 | 运营席 |
| 容量 | `vmu.capacity.cleanupCadenceDays` | integer | `30` | ≥1 | 运营席 |
| 容量 | `vmu.capacity.forecastHorizonDays` | integer | `90` | ≥1 | 运营席 |
| 容量 | `vmu.capacity.allocationPolicy` | string | `fair-share` | `fair-share`｜`priority`｜`reservation` | pack |
| 容量 | `vmu.capacity.forecastStaleDays` | integer | `14` | ≥1 | 运营席 |
| 容量 | `vmu.capacity.facilities` | string[] | `[]` | 设施名 | 运营席 |
| 容量 | `vmu.capacity.safetyBriefingRequired` | boolean | `true` | — | pack |
| 人事 | `vmu.hr.recruitCycleDays` | integer | `60` | ≥1 | 运营席（衔接 17） |
| 人事 | `vmu.hr.recruitWindowOpenMs` | integer | `0` | ≥0 | 运营席 |
| 人事 | `vmu.hr.performanceCadenceDays` | integer | `180` | ≥1 | pack |
| 人事 | `vmu.hr.performanceEvidenceRequired` | boolean | `true` | — | pack |
| 人事 | `vmu.hr.tenureTrackMonths` | integer | `60` | ≥1 | pack |
| 人事 | `vmu.hr.tenureDecisionWindowDays` | integer | `90` | ≥1 | pack |
| 人事 | `vmu.hr.tenureQuorum` | integer | `3` | ≥1 | pack |
| 人事 | `vmu.hr.offboardingChecklist` | string[] | `["revoke","handover","return","archive"]` | 步骤 | pack |
| 人事 | `vmu.hr.appealWindowDays` | integer | `30` | ≥0 | pack |
| 人事 | `vmu.hr.rotationPolicy` | string | `none` | `none`｜`periodic`｜`byRequest` | pack |
| 人事 | `vmu.hr.humanDecisionRequired` | boolean | `true` | — | **内核强制** ✓ |
| 货币 | `vmu.money.currencyDefault` | string | `CNY` | ISO-4217 alpha-3 | 运营席 |
| 货币 | `vmu.money.roundingMode` | string | `half-even` | `half-up`｜`half-even`｜`floor`｜`ceil`｜`trunc` | pack |
| 货币 | `vmu.money.scaleByCurrency` | object | `{}` | 币种→精度位数 | pack（覆盖 ISO 表需留痕） |
| 货币 | `vmu.money.fxSource` | string | `manual-snapshot` | 来源名（离线优先） | pack |
| 货币 | `vmu.money.fxSnapshotDir` | string | `Ops/FX` | 相对项目根 | 运营席 |
| 货币 | `vmu.money.fxMaxAgeDays` | integer | `7` | ≥0 | 运营席 |
| 货币 | `vmu.money.allocationRemainderPolicy` | string | `largest-remainder` | `largest-remainder`｜`first-party`｜`last-party` | pack |
| 货币 | `vmu.money.rejectFloatAmounts` | boolean | **`true`** | —（**默认拒浮点**，不可静默关闭 ✗） | **内核强制** ✓ |
| 货币 | `vmu.money.maxAmountMinor` | integer | `0` | ≥0（0＝不限） | pack |
| 货币 | `vmu.money.allowNegative` | boolean | `false` | — | pack |
| 货币 | `vmu.money.auditTupleFields` | string[] | `["inputs","fx","rounding","result"]` | 字段名（**只可增不可删** ✓） | 审计席 |
| 生物样本 | `vmu.biospecimen.ledgerDir` | string | `Ops/Biosamples` | 相对项目根 | 样本管理员 |
| 生物样本 | `vmu.biospecimen.requireChain` | boolean | `true` | — | pack |
| 生物样本 | `vmu.biospecimen.chainGapPolicy` | string | `block` | `block`｜`warn` | pack |
| 生物样本 | `vmu.biospecimen.freezeThawWarnAt` | integer | `5` | ≥0 | pack |
| 生物样本 | `vmu.biospecimen.destroyKeepsReference` | boolean | `true` | — | pack（引用 07 保留面 ✓） |
| 生物样本 | `vmu.biospecimen.subjectRefStyle` | string | `pseudonym` | `pseudonym`｜`code` | pack（与 20 联动） |
| 生物样本 | `vmu.biospecimen.mappingIrreversible` | boolean | **`true`** | —（**默认不可逆** ✓） | **内核强制** ✓ |
| 税务/法务 | `vmu.legalentity.registryDir` | string | `Ops/Entities` | 相对项目根 | 财务/法务 |
| 税务/法务 | `vmu.legalentity.requireEntity` | boolean | `true` | — | pack |
| 税务/法务 | `vmu.legalentity.taxIdStyle` | string | `opaque-ref` | `opaque-ref`｜`none` | pack（**不存明文** ✓） |
| 税务/法务 | `vmu.legalentity.invoiceTaxSlots` | string[] | `["taxIdRef","taxRateRef","taxAmountMinor","taxJurisdiction"]` | 字段位名 | pack |
| 税务/法务 | `vmu.legalentity.crossBorderGate` | string | `require-approval` | `require-approval`｜`warn`｜`off` | pack |
| 税务/法务 | `vmu.legalentity.crossBorderApproverRoles` | string[] | `[]` | 席位名 | pack |
| 协议闸 | `vmu.agreements.registryDir` | string | `Ops/Agreements` | 相对项目根 | 法务 |
| 协议闸 | `vmu.agreements.kinds` | string[] | `["dua","mta"]` | 协议种类 | pack |
| 协议闸 | `vmu.agreements.unsignedPolicy` | string | **`block`** | `block`｜`warn` | pack（"未签不得共享" ✓） |
| 协议闸 | `vmu.agreements.signatureRefRequired` | boolean | `true` | — | pack |
| 协议闸 | `vmu.agreements.expiryWarnDays` | integer | `30` | ≥0 | 法务 |
| 协议闸 | `vmu.agreements.reviewCadenceDays` | integer | `365` | ≥1 | pack |
| 协议闸 | `vmu.agreements.scopeEnforcement` | string | `block` | `block`｜`warn` | pack |

---


---

## 14. 计划项裁决（**先审判、再实现** ✓）

> **裁决口径（五问，任一"是"⇒ 留）**：① 是否**改变某个决定**？② 是否**可经 settings／中间件／pack 调控**？③ 是否**有消费者**（代码读点／有明确归属）？④ 去掉**是否真丢能力**？⑤ 是否**与别处重复**？
> **五问全"否" ⇒ 判"不做 ✗"**；本节**只留一行＋理由**（**不删历史、也不重复展开** ✗✓）。

**本卷的 90 个规划码不再在本卷重列** ✗ —— **唯一登记处是 `03-§8`**（生成块 ✓）。此处只留**裁决**：哪些**该做**、哪些**判不做 ✗**。

| 族 | 裁决 | 理由（可核） |
|---|---|---|
| **设备台账／预约／校准／维护**（`VMU_EQUIP_*`） | **已实现 ✓（轮 61 核到归属；不需新代码 ✗）** | **⓪ 前提步的实测结果** ✓✓：该族**已由 `kernel/instruments.js` 实现**（**14/17 键已接线** ✓）—— `requireOwner`／`capabilityTags`／`requireCalibration`／`calibrationDueDays`／**`blockOnOverdue`**（**校准过期即阻断** ✓＝§2.3）／**`reserve`**／`maxHoldHours`（**超占用上限** ✓）／`reservationHorizonDays`／`overbookRatio`／`priorityPolicy`／**`waitlistPolicy`**（候补 ✓）／**`scheduleMaintenance`** ✓／`attachCapture`（**采集挂引用** ✓＝§2.4）／`hashAlgo`；**facility 预约与重叠拒**另由 **`kernel/capacity.js`** 承担（`facilities`／`fromMs`／`toMs`／`VMU_CAPACITY_FACILITY_CONFLICT` ✓＝§2.2）✓。**剩余 3 个键未接线且理由由模块自己写明** ✓✓：`ledgerDir`（**无 FS 接缝** ✗）、`dataCaptureRef`（**需 library 面，只引用** ✗）、`downtimePolicy`（**需运维/告警协同** ✗）⇒ **未做 ✗ 且明写** ✓ |
| **经费台账／预算行／凭证链**（`VMU_FUNDING_*`） | **做 ✓** | `funding` 面**已实现**（16 键 ✓、分摊余数具名 ✓）⇒ 其余项是其自然延伸 |
| **货币与舍入类型**（§3.0，**N1**） | **不做 ✗** | **⑤重复**：`funding` 已用**最小货币单位整数**＋**具名余数**（`VMU_ALLOCATION_REMAINDER` ✓）⇒ 再引入币种／汇率／审计四元组是**另一套会计系统**（**②无对应键**、**③无消费者**）⇒ 超出 vmu 初衷（**研究编排，不是账务** ✓） |
| **生物样本库链式保管**（§2.5，**N4**） | **不做 ✗** | **③无消费者**（无实验室系统接入面 ✓）；真需要"链式保管"应**复用**已实现的 `ip`（披露闸 ✓）与 `compliance`（同意／IRB ✓），**不新建一族** |
| **税务与法务实体**（§3.6，**N9**） | **不做 ✗** | **③无消费者**；且该卷自己写明"**禁止实现税率推导** ✗" ⇒ 既不做，就**不留 21 行规格** |
| **DUA／MTA 协议闸**（§7.4，**N10**） | **做 ✓（轮 60 已落地到期＋范围）** | **轮 59 改判** ✗✓：原判"不做 ✗"的**理由是错的** —— 核心里**没有**通用协议闸 ✗，**但 `kernel/ip.js` 已有『未签不得转移』的具名拒** ⇒ **③有真实消费者** ✓、**①改变决定** ✓ ⇒ 判"做 ✓"。**轮 60 已实现** ✓✓：`transfer()` 可收 **`agreement: { ref, expiresAt, restrictions }`** ⇒ **过期 ⇒ 具名拒** ✓、**范围不含 `transfer` ⇒ 具名拒并列出它允许什么** ✓、**读不出的到期值 ⇒ 具名拒**（**不得当作"无到期"** ✗✓）、**不透明引用仍然可用**（新字段可选 ✓）；**复用本面既有码** ✓（**未新增未登记码** ✓）。**领域词表（dua/mta 种类）仍归 pack** ✓ |
| **公众摘要证据保真**（§6.1，`VMU_OUTREACH_*`） | **做 ✓（轮 63 收窄落点；轮 64 已实现最小判据）** | **①改变决定** ✓（"**内部未定论 ⇒ 不得写成已证明**"**可判定** ✓）；**⓪ 步结论** ✓：**意图已在论文轨道提示词层承载**（`vibe-math-v5.js:5825-5826` ✓），**但机器判据此前不在** ✗ —— **受理处 `paperRecordPart` 把空 `evidence` 静默收成 `[]`，只把"声称证据：0 条"写进日志** ✗✓。**轮 64 已实现** ✓✓：**交付件 `evidence` 为空 ⇒ 具名拒 `VMU_OUTREACH_REF_MISSING`**（**该码此前已在 `03-§8` 登记为规划码** ✓ ⇒ **用即转"已实现"** ✓），并**同时给成员发一条说明**（"每条结论必须指向库内已存在证据；未决/被否证必须显式标注" ✓）。**未做 ✗ 明列**：① ~~"拒了但没人再问" ⇒ 流程会卡住~~ ⇒ **轮 66 已修 ✓✓**：**拒绝后"有界再问"**（`reaskAfterRefusal` ✓：**每成员最多 2 次**，超限**自曝"需要所办介入"** ⇒ **绝不死循环** ✗）；**且旧有的"空 part"拒绝同样接上了再问** ✓（**既有缺口一并补掉** ✓）。**因果验证** ✓✓：桩**只省略一次证据** ⇒ **`r-2` 被问了两次** ✓（`attempts={"acad":1,"r-1":1,"r-2":2,"r-3":1}` ✓）且**流程正常完成** ✓（`passed=101 failed=0` ✓）⇒ **去掉"拒"则无第二次；去掉"再问"则停摆**（**轮 65 实测 `passed=89 failed=11`** ✓）✓✓；② "**确定性措辞被置信度覆盖**"（strict 档）**需 pack 词表判定点** ✗；③ `vmu.outreach.*` 四键**未登记未接线** ✗；④ **独立 `vmu.outreach` 服务不建** ✗（**无消费者** ✓） |

**落地顺序** ✓：先做**与已实现面同族**的三族（设备／经费／披露 ✓），**其余只留本节一行** ✓；将来**真有消费者 ⇒ 改判**，并把该行升级为规格 ✓。

---

## 15. 验收（机器可判定判据；进 `11` 的 T1/T2 场景集）

1. **场景：零机制** —— 不声明任何 `vmu.<ops>.*` 键 ⇒ 13 个运营族**全部不可用**且**不报错**（与"关掉了"可区分：`status` 必须显示 `unavailable` 而不是"成功但空"）✓。
2. **断言：凭证链闭合（O-2）** —— 造一笔**缺凭证**的支出 ⇒ 必须**具名拒** `VMU_FUNDING_RECEIPT_MISSING`，且记录轨**有且只有一条**拒绝痕 ✓。
3. **红/绿：披露时钟（O-3）** —— 设 `vmu.ip.holdEnforcement=block` 后尝试发布 ⇒ **红**（`VMU_IP_PUBLICATION_HOLD`）；取得人类豁免后 ⇒ **绿**且豁免**入档** ✓。
4. **断言：证据保真（O-4）** —— 造一份"内部结论为未定论、传播稿写成已证明"的摘要 ⇒ **红**（`VMU_OUTREACH_EVIDENCE_MISMATCH`）✓。
5. **具名：运营不改结论（O-5）** —— 静态门：运营族代码**不得**调用表决/结算写入面；违反 ⇒ **红**✓。
6. **场景：人类在环（O-6）** —— 自动审批进行中，人类否决 ⇒ 自动流转**立即停止**且**不消耗**代理配额（配额计数**不变**＝可断言）✓。
7. **具名：令牌≠钱（O-1）** —— 静态门：`vmu.budget.*` 与 `vmu.funding.*` 之间**不得**出现隐式换算；任何换算必须在 pack 里显式声明 ✓。
8. **断言：容量不静默** —— 池耗尽 ⇒ `VMU_CAPACITY_EXHAUSTED` 且观测面计数；**不得**静默排队 ✓。
9. **场景：设备过期阻断** —— 校准过期的设备产出的数据 ⇒ 引用上带**过期标记**且不可作为"可引用数据"✓。
10. **断言：金额必为整数（§3.0 规则 M1）** —— 传浮点/小数/字符串金额 ⇒ **具名拒** `VMU_AMOUNT_NOT_INTEGER`（**含现值** ✓）；**零是合法值** ✓。**实现状态：部分 ✓** —— `request()` **已具名拒**（轮 57 ✓）；`expense()`／预算行／`costShareMinor` 仍走强转助手 ⇒ 收尾见 §14 ✓。**该规则无条件生效** ✓（**不引入 `vmu.money.*` 键** ✗ —— 见 §14 裁决）。
11. **断言：分摊守恒与可复算（§3.0.5）** —— 造一组"比例除不尽"的分摊 ⇒ `Σ result = total` **必须**成立（差 1 分即 **红** `VMU_ALLOCATION_REMAINDER`）；同一输入跑两次 ⇒ 输出**逐字节相同** ✓。**实现状态：已实现 ✓**（`settle()` 返回 `remainderMinor` ＋ 余数计 `counters.remainderMinor` ✓）。
12. **红/绿：未签不得共享（N10；轮 59 改判"做 ✓"，轮 60 已落地）** —— 无协议共享 ⇒ **具名拒** ✓（`vmu.ip.transferPolicy=manual` ＋ 空 `signedRef` ✓）；**`agreement.expiresAt` 已过 ⇒ 具名拒并给"现值/到期"** ✓✓；**`agreement.restrictions` 不含 `transfer` ⇒ 具名拒并列出允许项** ✓✓；**`expiresAt` 读不出 ⇒ 具名拒**（**不得当作"无到期"** ✗✓）；签齐、未过期且在范围内 ⇒ **绿** ✓。**实现状态：已实现 ✓**（`kernel/ip.js` ＋ `tests/vmu-ip.test.mjs` 六条断言 ✓；**到期接受 ISO 或 epoch-ms** ✓，走共享 `timevalue.ms` ✓。**未做 ✗**：独立的 `vmu.agreements` 协议账本与 `VMU_AGREEMENT_*` 码族 —— 目前**复用本面码** ✓；若将来需要账本 ⇒ 按 §14 先登记键与码 ✓）。
13. **以下 8 条（原 12–16、18–20：汇率方向与时效／审计四元组／混币种与精度／链式保管 N4／样本↔受试者 N4／跨境闸点 N9／税务字段位 N9／销毁保留引用 N4）** ⇒ **裁决：不做 ✗**（**理由与改判条件见 §14** ✓）。
    ⇒ 它们**不再作为本卷的验收项** ✗✓（**规格已删、不进 T1/T2 场景集** ✗）；**机器可判定的那部分若要保留，须先按 §14 恢复为规格并登记键与码** ✓。

---

## 16. 与其它卷的交叉引用（**必读**）

- `03-§8`：**错误码唯一登记表**（本卷 **90** 个规划码 ⛔ 由生成管线登记）✓。
- `04`：参数全表与热改等级（本卷 §13 的键按 04 的 H0–H3 规则落位）✓。
- `05`：钩子全表与失败策略（本卷 `ops/*`、`ip/*`、`compliance/*` 钩子为**提案** ✗）。
- `07`：记录轨/归档/`datasets`/`vmu.quota.*`（本卷存储与数据引用**只引用** ✗）。
- `08`：会议/表决/工作流/任务板原语（本卷会务与审批**只组合** ✗）。
- `10`：pack 机制（本卷所有"组织政策"的载体）✓。
- `11`：门禁分层（本卷 §15 的场景应登记进 T1/T2）✓。
- `16`：生命周期/评审/出版/经费面（`vmu.review.*`／`vmu.funding.requiredFields` **归 16** ✗）。
- `17`：席位/招募/委托/仲裁/预算令牌（`vmu.recruit.*`／`vmu.budget.*` **归 17** ✗；本卷管"钱与物"）。
- `20`：许可/密级/脱敏/合规基线（本卷合规运营**引用**其判据 ✗）。
- `21`：审计/指标/SLO/导出（本卷运营事件**必须**经其留痕）✓。
- **边界加注（N4／N9／N10）** ✗：**样本销毁与保留**只引用 07 的保留/回收站面；**样本↔受试者映射**只引用 20 的去标识化（本卷默认**不可逆** ✓）；**协议到期复审的提醒/日历/告警**只引用 21 ✓；**税务字段位**只声明"位与校验点"，法条与税率**不在本卷** ✓。

---

## 17. 未核项（**编号登记见 `14-§2`**）

> 本卷的"未核/待接线/待登记"项统一在 `14-§2` 编号登记，避免两处漂移；下列为**本卷视角**的未核项。

| # | 未核项 | 现状 | 影响 |
|---|---|---|---|
| O1 | 9 个运营服务与 9 个工具**零实现** | 已核实（本卷 §1 成熟度表） | 全卷为设计目标；不得据以推理 ✗ |
| O2 | 财务金额与币种：本仓**没有任何货币类型/舍入实现** | 无 | §3 的"到分"口径需先落一个最小货币类型 |
| O3 | 与 17 的令牌/钱换算边界 | 只有文字约定（O-1） | 需要一条**静态门**才能变成机器事实 |
| O4 | 披露时钟与 16 出版面的仲裁顺序 | 文字为"以更严者为准" | 需要一条**判定点**与冲突记录格式 |
| O5 | 传播"夸大词表"的来源与维护者 | 无 | §6.1 的 `strict` 档位缺词表即无法判定 |
| O6 | 会计科目树与合规项清单的模板集 | 无 | pack 无法落地（§3/§8） |
| O7 | 容量预测的数据来源（任务板？历史用量？） | 未定 | §9.4 的 `fair-share` 无输入 |
| O8 | 人事决策的"人类在环"在无人类在场时如何处置 | 未定 | §10.5 的阻塞语义 |
| O9 | 审计证据包的**跨机构格式**兼容性 | 未定 | §3.4/§8.3 只能自用 |
| O10 | **90** 个规划码与既有码族的命名冲突 | 未核 | 04/03 登记前可能撞名 |
| **O14** | **样本链式保管的真实载体** ✗ | 未定（记录轨条目？外部 LIMS？） | §2.5 的断链检测依赖事件流的真实来源 |
| **O15** | **税务字段位的辖区目录** ✗ | 未定（pack 声明？外部税务系统？） | §3.6 只校验"位是否存在"，缺目录则无法落地 |
| **O16** | **协议签名的验签** ✗ | 未做（只存 `signatureRef`，不验签） | §7.4 的"未签不得共享"可被伪造引用绕过 ⇒ 需外部签署系统对接或验签接缝 |
| **O17** | **MTA 与样本转移的联动清单** ✗ | 文字联动（§2.5↔§7.4） | 需一条**判定点**才能成为机器事实 |
| **O11** | **真实汇率提供者对接** ✗ | **未做**（离线优先：只接受**显式导入**的汇率快照 ✓；不内建联网/定时抓取 ✗） | §3.0.4 只能用手工快照；跨机构结算需人工导入 |
| **O12** | **多币种报表的呈现规则** ✗ | **未做**（汇总币种、展示精度、汇兑差额列示规则未定） | §3.3/§3.4 的报表会出现"混合币种"缺口 |
| **O13** | 币种精度表（ISO-4217）在仓库里的**载体**未定 | 未定（schema？pack？外部数据文件？） | §3.0.2 的 `scaleByCurrency` 覆盖需要基线表 |

---

## 18. 待裁决（✗）

1. **货币类型是否进内核**（最小货币原语）还是完全留在 pack/脚本层？
2. **O-1 的机器强制**：`vmu.budget.*` ↔ `vmu.funding.*` 的换算是否**一律**需要 pack 显式声明（本卷倾向"是"）？
3. **披露时钟的默认强制度**：`block` 是否过头（会阻塞正常预印本）⇒ 是否按"是否已提交专利申请"分档？
4. **会务是否独立成卷**：22 的 §5 是否应拆成"会务卷"，还是保持"运营"合卷（本卷倾向合卷）？
5. **容量预测的责任人**：运营席还是机制作者（涉及默认判定点）？
6. **传播保真的判定形态**：词表（可解释但脆弱）还是"结论句必须回指"（更强但要求写作规范，本卷倾向**两者并用**）？
7. **人事运营的隐私边界**：绩效/任期材料是否允许代理读取（与 20 交叉）？
8. **跨机构结算的信任模型**：是否允许"先交换、后对账"（本卷倾向**不允许**）？

---

## N13 教学与认证（Teaching & Accreditation）

> 状态：**设计稿 v0.1（本卷新增节）** —— 补齐批评者点名的 **N13 缺口**（`教学评估` 关键词实测 **0** ✗）✓；**不动作内核** ✗：只用 **记录轨 ＋ pack ＋ 中间件** 组合 ✓。
> 上位：本卷头部 `> 上位：`（含 `12-user-guide.md`、`21-observability-and-operations.md`）；**交界只引用不重定义** ✗✓。

**三层产物（各是一条"记录轨"，不是新机制）** ✓：
1. **课程/教学产出** ✓：讲义（`lecture-*`）、习题集（`problem-set-*`）、**评分标准**（`rubric-*`，含分值锚点与"何以得分"句）；三者都走既有 **记录** 与 **归档** 面（`07` 卷）✓，**不新增键与码** ✗✓；
2. **学习成果对齐（outcome ↔ artifact 映射）** ✓：每条 outcome 一行，指向 ≥1 个 artifact 引用（**只引不复制** ✗）；**未对齐的 outcome ⇒ 标记词**（见 §N15）✓；
3. **认证证据包** ✓：**自评报告**（叙述）＋**证据引用表**（`claim → artifact 引用 → 复核人 → 时刻` ✓）；**证据缺失即写"未做"标记** ✗✓，**不得**用叙述替代证据 ✗。

**与相邻卷的分工（双向交叉引用，交界只写一次 ✗）** ✓：
- **写作规范／引用格式** ⇒ 只引用 `12-user-guide.md` ✗（本卷**不重定义** ✓）；
- **无障碍与可读性** ⇒ 只引用 `21-observability-and-operations.md` ✗；
- **评审与人（谁有权复核）** ⇒ 只引用 `17-agent-society-and-delegation.md` 与 `16-research-lifecycle.md` ✗；
- **合规/隐私边界（学员材料）** ⇒ 只引用 `20-security-privacy-and-compliance.md` ✗。

**验收（可核对）** ✓：① 三类产物在记录轨上**可检索** ✓；② 每条 outcome **有且仅有**一个对齐状态（`aligned`／`未做 ✗`）✓；③ 认证证据包里**每条 claim 都有引用**（无引用 ⇒ **未做 ✗**）✓；④ **未实现工具名与标记词同行** ✗✓（便于"未做"被发现 ✓）。

**提案码**：**无**（本卷**只引用** `03-§8` 既有登记 ✗✓；若日后需要"认证证据缺失"专属码 ⇒ **列为提案**，不在此自造 ✗）。

## N13 未核项

1. **教学产物的落盘位置**（放在 `records/` 还是 `Shared/`）**未定** ✗ —— 见 `14-§2`（未决登记）✓；
2. **评分标准的分值锚点**是否要求机器可解析 **未核** ✗（与 `12` 卷写作规范的交界，见 `14-§2` ✓）；
3. **认证机构差异**（不同认证体的证据清单）**未做** ✗ —— 需 `pack` 承载，本卷**只给形状** ✓；
4. **学员（临时席）材料的保留期**与 `20` 卷的合规边界**未对齐** ✗（见 `14-§2` ✓）。
