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
> **本卷可依附的已实现底座**（其余全为规划）：`vibe_vmu_records` ✓（记录轨：只追加、可导出）、`vibe_vmu_task` ✓（任务板与分派）、`vibe_vmu_meeting` ✓（会议/议程/表决原语）、`vibe_vmu_set` ✓（设置读写与下放）、`vibe_vmu_middleware` ✓（钩子注册与动作）、`vibe_vmu_pack` ✓（组织政策的载体）、`vibe_vmu_script` ✓（脚本桥：外部命令＋回执）、`vibe_vmu_status` ✓（现况）、`vibe_vmu_control` ✓（暂停/恢复/拒绝）；以及 `vmu.records.*`／`vmu.meeting.*`／`vmu.tasks.*`／`vmu.budget.*`／`vmu.audit.*`／`vmu.quota.*`／`vmu.license.*`／`vmu.review.*`／`vmu.admission.*` 键族（分属 07/08/16/17/20 ✓）。

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

- **自由度（F）**：默认**无运营层** —— 不声明 `vmu.funding.*`／`vmu.resource.*` 等任何族，就等于"没有财务/设施/法务流程"的纯研究机构 ✓；
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
| **0** | **货币与舍入（Money，横切规范）** | **无（本卷新增类型规范 §3.0）** | `vmu.funds.*` | `VMU_MONEY_*`／`VMU_CURRENCY_*`／`VMU_FX_*`／`VMU_ROUNDING_*`／`VMU_AMOUNT_*`／`VMU_SCALE_*`／`VMU_ALLOCATION_*` | ✗ |
| 1 | 仪器与设备 | `vibe_vmu_records`／`vibe_vmu_task`／07 `datasets` | `vmu.resource.*` | `VMU_EQUIP_*` | ✗ |
| 2 | 经费与财务 | `vibe_vmu_records`／08 工作流／17 令牌（**仅参照**） | `vmu.funding.*`＋`vmu.funds.*` | `VMU_FUNDING_*` | ✗ |
| 3 | 知识产权 | `vibe_vmu_records`／16 出版面／20 许可 | `vmu.ip.*` | `VMU_IP_*` | ✗ |
| 4 | 会务与活动 | **08 会议/表决原语** ＋ 16 评审面 | `vmu.conference.*` | `VMU_CONF_*` | ✗ |
| 5 | 科学传播 | `vibe_vmu_records`／20 脱敏 | `vmu.dissemination.*` | `VMU_OUTREACH_*` | ✗ |
| 6 | 跨机构协作 | 17 委托/身份 · 20 数据共享 | `vmu.collab.*` | `VMU_COLLAB_*` | ✗ |
| 7 | 合规与审计运营 | 20 合规基线 · 21 审计导出 | `vmu.compliance.*` | `VMU_COMPLIANCE_*` | ✗ |
| 8 | 资源与容量 | 07 `vmu.quota.*` · 17 席位 | `vmu.capacity.*` | `VMU_CAPACITY_*` | ✗ |
| 9 | 人事与任期 | 17 `vmu.admission.*`／席位 | `vmu.tenure.*` | `VMU_HR_*` | ✗ |
| **10** | **保管链与溯源（N4）** | `vibe_vmu_records`／§2.1 台账／07 记录轨 | `vmu.custody.*` | `VMU_BIOSAMPLE_*` | ✗ |
| **11** | **税务与法务实体（N9）** | §3.0 Money／§3.1 账户／20 密级 | `vmu.partnership.*` | `VMU_ENTITY_*`／`VMU_TAX_*`／`VMU_CROSSBORDER_*` | ✗ |
| **12** | **DUA／MTA 协议闸（N10）** | §7.1 协议登记／21 提醒（引用） | `vmu.agreements.*` | `VMU_AGREEMENT_*` | ✗ |

> **成熟度诚实声明** ✗（★ **轮 264 部分更正** ✓✓）：**本卷若干族的承载面【早已存在】** ✓ —— **实测：`kernel/resource.js`（359 行 ✓，含登记/预约/校准/阻断 ✓）、`kernel/funding.js`（693 行 ✓，含 `openAccount`／`request`／`expense`／`settle` ✓）、`kernel/collab.js`（285 行 ✓，含 `authorship`／`settle` ✓）、`kernel/custody.js`（195 行 ✓）** ✓ ⇒ **下文各处若仍写"计划 ✗"，应以上述承载面为准** ✓；**逐族成熟度的完整复核仍待做** ✗。**原始声明（保留以备对照）**：本卷 **13 个族（含 §3.0 的货币类型与 §2.5／§3.6／§7.4 三个追加族）、9 个服务、9 个工具、10 个钩子、9 个协议全部为规划**（`settings/planned.js` 里 `planned:true`）✓ —— 今天能用的只有**底座**（记录/任务/会议/设置/中间件/pack/脚本桥）✓。

### 0.1 逐族成熟度实测表（轮 265）✓✓

> **为什么加这张表** ✓：**本卷上文多处写"✗ 计划"，而实测显示【14 个族已全部接线、4 个部分接线】** ✗ ⇒ **笼统的成熟度声明已经不可信** ✓；**下表把"每族有多少键、接了多少、由谁读"逐行写明** ✓（**数据源：`docs/04` 设置表 ＋ 内核扫描 ✓**）。

| 族 | 键数 | 已接线 | 读取者（括号＝读了多少条） | 裁定 |
|---|---|---|---|---|
| `vmu.resource` | 17 | **17** | `resource.js`(17) | ★ **已接线 ✓（上文 §2 的"计划 ✗"已过期）** |
| `vmu.funding` | 16 | **16** | `funding.js`(16) | ★ **已接线 ✓（§3 的"计划 ✗"已过期）** |
| `vmu.funds` | 11 | **11** | `funding.js`(11) | ★ **已接线 ✓** |
| `vmu.custody` | 5 | **5** | `custody.js`(5) | ★ **已接线 ✓（§L168"本仓今天没有任何样本/保管实现"【已不成立】✗）** |
| `vmu.anonymity` | 2 | **2** | `custody.js`(2) | ★ **已接线 ✓**（**轮 400 由 `custody` 分出** ✓：`pseudonymStyle`／`mappingIrreversible` 讲的是**不暴露主体是谁**，不是保管链 ✓；旧名仍可解析 ✓）|
| `vmu.agreements` | 7 | **7** | `collab.js`(7) | ★ **已接线 ✓** |
| `vmu.capacity` | 12 | **12** | `capacity.js`(12) | ★ **已接线 ✓** |
| `vmu.tenure` | 11 | **11** | `tenure.js`(11) | ★ **已接线 ✓** |
| `vmu.ip` | 15 | **15** | `ip.js`(20) | ★ **已接线 ✓** |
| `vmu.quota` | 4 | **4** | `retention.js`(4) | ★ **已接线 ✓** |
| `vmu.conference` | 18 | **18** | `conference.js`(18) | ★ **已接线 ✓** |
| `vmu.compliance` | 20 | **20** | `compliance.js`(17) ＋ `domaincompliance.js` | ★ **已接线 ✓** |
| `vmu.audit` | 17 | **17** | `audit.js`(12) ＋ `auditchain.js` | ★ **已接线 ✓** |
| `vmu.records` | 32 | **32** | `records.js` ＋ `index.js` 等 | ★ **已接线 ✓** |
| `vmu.budget` | 9 | **9** | `budget.js`(9) ＋ `fairness.js` | ★ **已接线 ✓** |
| `vmu.collab` | **9** | **7** | `collab.js`(7) | ⚠️ **部分（余 2 条契约薄，见 §L234；原 10 含 1 个服务名，轮 270 剔除）** |
| `vmu.dissemination` | **12** | **10** | `publication.js`(9) | ⚠️ **部分（10/12）**（★ 轮 530 更正：**声明 12／已接线 10** ✓ —— ★ 新增 `exaggerationWords` 所致 ✓） —— 9 条**已接线 ✓**；另 2 条（`impact`／`mediaRequest`）**经审计确认内核无读取者 ⇒ 真实待办 ✗**（见 §0.1 与 `04` 的 `planned` 行 ✓） |
| `vmu.admission` | 12 | **12** | `recruit.js`(12) | ★ **已接线 ✓（轮 267 接了余下 4 条，当时漏更此表 ✗，轮 271 修正）** |
| `vmu.tasks` | **3** | **3** | `index.js`(3) | ★ **已接线 ✓（轮 270 剔除 1 个服务名后，分母由 3 修正为 2 ✓）** |
| `vmu.partnership` | 6 | **6** | `partnership.js`(6) | ★ **已接线 ✓（轮 276 建面：`registerEntity`／`bindAccount`／`validateInvoice`，五码齐 ✓）** |
| `vmu.license` | 4 | **4** | `publication.js`(4) | ★ **已接线 ✓（轮 274 接线：`default`／`incompatiblePolicy` 执法，`codeDefault`／`attributionRequired` 报出）** |
| `vmu.review` | 4 | **4** | `records.js`(1) ＋ `reviewers.js`(3) | ★ **已接线 ✓（轮 278 `rebuttalRequired` ＋ 轮 279 `mode`／`conflictPolicy`／`quorum`）** |
| `vmu.reviewers` | 4 | **4** | `reviewers.js`(4) | ★ **已接线 ✓（轮 279 建面三键 ＋ 轮 283 `acknowledgement`；契约取自 16 卷 §L302）** |

> **结论（轮 271 重测）** ✓✓：**本卷的"13 个族全部为规划"【早已不成立】** ✗；**21 族里【17 族已全部接线】（14 族原本如此 ＋ `outreach`／`recruit`／`tasks` 三族在本轮修正分母后亦为全接线 ✓）** ✓；**部分族只剩 `collab` 一个（7/9 ✓）** ✓；**已无【真实缺口】族** ✓ —— **`license`(4) 于轮 274 接线 ✓、`legalentity`(6) 于轮 276 建面接线 ✓、`review`(4) 于轮 278 转为【部分】（`rebuttalRequired` 已接 ✓，余 3 条待审稿人库）** ✓ ✓。★ **两次"分母错了"的教训** ✓：**① 轮 267 接了 4 条键却【漏更此表** ✗**）**；**② 轮 270 剔除了 5 个服务名，分母随之变化** ✓ ⇒ **本表是【实测的】，就必须在每次接线或登记更正后重测 ✓**。**上文各处的"✗ 计划"应以本表为准** ✓。

### 0.2 三族真实缺口：为什么【没有】承载面（轮 266 实测）✓

~~> **`vmu.partnership`（6 条，卷 22）**：**概念层实测：`legalentity`／`jurisdiction`／`taxId`／`crossBorder` 在【内核全无】** ✗ ⇒ **本卷 §L287 的协议 `LegalEntity`／`TaxFieldSlots` 也仍标 ⛔ 待实现** ✓ ⇒ **复活条件**：**先有【法律实体对象】（含 `entityId`／`jurisdiction`／`taxIdRef` ✓）与**发票税位**的稳定字段位** ✓，**再由它读这 6 键** ✓；**在那之前，6 键无宿主** ✓。~~ ★★★ **轮 537：本行【已被证伪**]** ✓ —— ★ **`kernel/partnership.js` 自轮 276 起就实现了这些** ✓（★ 含 6 键／5 码／`validateInvoice` ✓）⇒ **见下方新增的 §0.3** ✓。
> **`vmu.license`（4 条，卷 20／16）**：**概念层实测：`licen[cs]e`／`attribution`／`incompatible` 命中处【都不是许可证面**（多为注释与其他语义 ✓）**）** ✓ ⇒ **复活条件**：**先有【许可证判定点**（默认许可证 ＋ 归属要求 ＋ 不兼容处置 ✓）**）** ✓，**最自然的宿主是 `publication.js`／`ip.js` 的输出侧** ✓；**未定时不接** ✓。
> **`vmu.review`（4 条，卷 16）**：**概念层实测：`reviewers`／`reviewMode`／`quorum`／`rebuttal` 中**，**`rebuttal`（答辩）在内核【全无】** ✗；**`quorum` 在 `ballot.js`／`charter.js`／`conference.js`／`tenure.js` 有对应概念** ✓ ⇒ **复活条件**：**先有【答辩】概念** ✓（**该词内核零命中 ⇒ 这是一条【真实的新机制】而非"忘了接"** ✓），**否则 `review.rebuttalRequired` 无从判定** ✓。 ★★★ **轮 537 实测更正** ✗✓：★ **`records.rebuttal` 【存在**]** ✓（★ `kernel/records.js` ✓）⇒ ★ **"全无"不成立** ✓；★ 而 `reviewers`（★ `vmu.reviewers` ✓）**也存在** ✓ ⇒ ★ **本行的缺口面比原判断【小得多**]** ✓。



---

## 2. 共享资源与资格授权（Shared Resources & Qualification）

> ★★ **改名后的正文状态（轮 307）** ✗✓：**本族的机器面已按本意改名** ✓（`instruments` → **`resource`**：键族／错误码／工厂／模块／服务／套件／双清单／文档标识符），**因为该面实际做的是共享资源的登记、资格与授权、维护窗口与退役** ✓。**但下面正文仍按旧的窄框定（实验室仪器）书写** ✗ —— **正文重写【未做** ✗**】**：须把它改写成"**共享资源的资格与授权**"（数学研究里的实例：证明助手与 CAS 的机时、共享数据集、许可证约束的外部服务）✓。**改名完成不等于正文已贴合本意** ✗，故此处如实标注 ✓。


> **⚠ 状态更正（轮 61 核实；以下各条的"计划 ✗"字样已过期）** ✓✓：**本族已实现** —— 归属面是 **`kernel/resource.js`**（**14/17 键已接线** ✓：责任人／能力标签／**校准到期即阻断**（`blockOnOverdue`）／预约（`reserve`／`maxHoldHours`／`reservationHorizonDays`／`overbookRatio`／`priorityPolicy`／`waitlistPolicy`）／**维护排期**（`scheduleMaintenance`）／**采集挂引用**（`attachCapture`））＋ **`kernel/capacity.js`**（`facilities`＋重叠即 `VMU_CAPACITY_FACILITY_CONFLICT` ✓）✓。**仅 3 键未接线且理由已由模块写明** ✗（`ledgerDir` 无 FS 接缝／`dataCaptureRef` 需 library／`downtimePolicy` 需运维协同）。**归属表以 §14 为准** ✓（本节只保留接口形状与判定点，**不再声称未实现** ✗✓）。

### 2.1 台账与登记

| 字段 | 内容 |
|---|---|
| **名称** | 共享资源台账（Shared Resource Ledger） |
| **目的** | 每个共享资源有**唯一身份**（资源号＋位置/端点＋责任人＋能力标签），使"谁能用、用了什么、产出挂在哪"可追溯 ✓ |
| **面向谁** | 资源管理员、使用资源的代理、审计 |
| **接口形状** | 服务 `vmu.resource`（★ **已接线 ✓**（实测 17/17，见 §0.1 实测表））：`register(resource)`／`list(filter)`／`get(id)`／`retire(id, reason)`；工具 `vibe_vmu_resource` ⛔ 未实现（唯一入口：登记/预约/维护三类操作）；协议 `InstrumentReservation` ⛔ 待实现 |
| **可调控参数** | `vmu.resource.ledgerDir`（默认 `Ops/Resources`）、`vmu.resource.requireOwner`（默认 `true`）、`vmu.resource.capabilityTags`（默认 `[]`） |
| **相关错误码** | 见 `03-§8` 的 **VMU_RESOURCE_\***（**已实现 ✓**；本行原列的 ⛔ 计划名已作废 ✗）（详见 §14） |
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
| **面向谁** | 使用者、资源管理员、调度代理 |
| **接口形状** | 服务 `vmu.resource.reserve(holder, window, purpose)`／`release(reservationId)`／`waitlist(id)`（★ **已接线 ✓**（实测 17/17，见 §0.1 实测表））；钩子 `ops/reservation-requested` ⛔ 提案、`ops/reservation-conflict` ⛔ 提案；协议 `InstrumentReservation` ⛔ |
| **可调控参数** | `vmu.resource.reservationHorizonDays`（默认 `30`）、`vmu.resource.maxHoldHours`（默认 `12`）、`vmu.resource.priorityPolicy`（默认 `fifo`；可选 `pi-first`／`quota-weighted`）、`vmu.resource.waitlistPolicy`（默认 `auto-offer`）、`vmu.resource.overbookRatio`（默认 `1.0`＝不超额） |
| **相关错误码** | 见 `03-§8` 的 **VMU_RESOURCE_\***（**已实现 ✓**；本行原列的 ⛔ 计划名已作废 ✗） |
| **四条哲学** | F：不排期＝自由抢用 ✓｜T：时间窗/上限/优先级全可配 ✓｜D：优先级**是 pack 的判定点**（内核不认识"PI 优先"）✓｜X：新调度算法只换判定点 ✓ |
| **实现要点** | 冲突判定＝**区间集合**运算（确定性、可复算）；裁决必须写 `reason` 与规则来源 ✓；候补"自动递补"可被人类审批打断（O-6）✓ |
| **依赖与前置** | §2.1 台账、`vibe_vmu_task` ✓（把占用挂到任务（(f) 工作流））、08 工作流原语 ✓（审批形态） |
| **成熟度** | ✗ 计划 |
| **优先级** | P1 |

### 2.3 维护、校准与停机

| 字段 | 内容 |
|---|---|
| **名称** | 维护与校准（Maintenance & Calibration） |
| **目的** | 校准过期/维护中的设备**不得**被用于产出"可引用数据" ✓（把"能用"与"数据可信"分开） |
| **面向谁** | 资源管理员、质量负责人、使用资源的代理 |
| **接口形状** | 服务 `vmu.resource.scheduleMaintenance(id, window)`／`recordCalibration(id, cert)`／`block(id, reason)`（★ **已接线 ✓**（实测 17/17，见 §0.1 实测表））；钩子 `ops/calibration-due` ⛔ 提案、`ops/downtime-started` ⛔ 提案 |
| **可调控参数** | `vmu.resource.requireCalibration`（默认 `true`）、`vmu.resource.calibrationDueDays`（默认 `365`）、`vmu.resource.blockOnOverdue`（默认 `true`）、`vmu.resource.downtimePolicy`（默认 `queue`；可选 `fail`） |
| **相关错误码** | 见 `03-§8` 的 **VMU_RESOURCE_\***（**已实现 ✓**；本行原列的 ⛔ 计划名已作废 ✗） |
| **四条哲学** | F：不声明＝无校准要求 ✓｜T：周期/阻断策略可配 ✓｜D：设备类别→校准要求的映射由 pack ✓｜X：新证书类型只加字段 ✓ |
| **实现要点** | "过期阻断"必须**与产出绑定**：被阻断设备的数据在 07 的 `datasets` 上打**来源标注**（血缘可追，引用 16-L9）✓；解除阻断需人批准 ✓ |
| **依赖与前置** | §2.1、07 `datasets` ✓、16 血缘面 ✓ |
| **成熟度** | ✗ 计划 |
| **优先级** | P2 |

### 2.4 数据直采的引用面（与 07/16 的衔接）

| 字段 | 内容 |
|---|---|
| **名称** | 资源产出引用（Resource Capture Reference） |
| **目的** | 资源产出的原始文件**不复制**，只在记录里给**引用**（路径＋哈希＋设备号＋时间窗＋校准状态）✓ |
| **面向谁** | 使用资源的代理、数据管理、审计 |
| **接口形状** | 服务 `vmu.resource.attachCapture(id, datasetRef)`（★ **已接线 ✓**（实测 17/17，见 §0.1 实测表））；协议 `CaptureRef` ⛔ |
| **可调控参数** | `vmu.resource.dataCaptureRef`（默认 `required`；可选 `optional`→`ignore`）、`vmu.resource.hashAlgo`（默认 `sha256`） |
| **相关错误码** | 见 `03-§8` 的 **VMU_RESOURCE_\***（**已实现 ✓**；本行原列的 ⛔ 计划名已作废 ✗） |
| **四条哲学** | F：不挂引用＝数据与设备无关 ✓｜T：必填程度可配 ✓｜D：字段集由 pack ✓｜X：新采集格式只加字段 ✓ |
| **实现要点** | 引用**必须**含校准状态快照 ⇒ 事后可判定"这份数据来自已校准设备"✓ |
| **依赖与前置** | 07 归档/`datasets` ✓、§2.3 |
| **成熟度** | ✗ 计划 |
| **优先级** | P2 |

> **这一族怎么由 settings＋中间件＋pack 组合出来** ✓：**settings** 给"要不要台账、时间窗多长、过期是否阻断"；**中间件**在 `before`（预约/占用前）查台账与校准状态、在 `after`（数据产出后）校验引用链，把违规**具名拒**；**pack** 声明"哪些设备类别需要校准、谁有优先权、哪些设备禁止某类用途"。**内核只提供记录、任务、钩子与设置** —— 不出现"仪器/PI"这类组织名词 ✓。

### 2.5 保管链与溯源（Biobank / Custody —— **补 N4** ✗✓）

> **为什么要有这一节** ✗：批评者第 6/7 轮关键词实测"**共享资源与保管**"**0 命中** ✗ —— 一个能管仪器与经费的平台却**没有资源台账与保管链**这一最典型的实验资产 ✓。样本的特殊性在于：它**不可重建** ✓、与**不可逆假名引用**关联 ✓、且必须证明"**一直没脱离监管**" ✓。

| 字段 | 内容 |
|---|---|
| **名称** | 保管条目台账与链式保管（Custody Ledger & Chain of Custody） |
| **目的** | 每个样本**可追溯**：谁入库／谁保管／谁取用／取还几次／是否已销毁 ✓；**链式保管断链必须报** ✗✓；销毁后仍保留**引用**（与 07 只引用 ✓） |
| **面向谁** | 实验执行者、保管管理员、合规/审计、代理 |
| **接口形状** | 协议 `CustodyRecord` **✓ 已实现**（轮 538：字段由 `kernel/custody.js` 承载 ✓）：`{ sampleId, pseudonym, collectedAt, storage, storageCycles, chainOfCustody[] }`；协议 `CustodyEvent` **✓ 已实现**（轮 538：字段由 `kernel/custody.js` 承载 ✓）：`{ sampleId, from, to, atMs, why }`；服务 `vmu.custody`（★ **已接线 ✓**（实测 7/7，见 §0.1））：`register(sample)`／`transfer(sampleId, {from,to,why})`／`chain(sampleId)`／`verify(sampleId)`／`destroy(sampleId,{reason})`；工具 `vibe_vmu_custody` **✓ 已实现**（轮 538 ✓） | ★★★ **轮 538 实测更正** ✗✓：★ **工具 `vibe_vmu_custody` 【已落地**]** ✓（★ 6 个动作 ✓）；★★ **且承载面存在** ✓：**`kernel/custody.js`** 以 `registerEntry`／`transfer`／`storageCycle`／`destroy`／`chainOf`／`status` 实现 ✓，★ 策略回 `{ ledgerDir: "Ops/Custody", requireChain: true, chainGapPolicy: "block" }` ✓ ⇒ ★ **本行的"**✓ 已实现**（轮 538：字段由 `kernel/custody.js` 承载 ✓）"是快照** ✓。
| **可调控参数** | `vmu.custody.ledgerDir`（默认 `Ops/Biosamples`）、`vmu.custody.requireChain`（默认 `true`）、`vmu.custody.chainGapPolicy`（默认 `block`；可选 `warn`）、`vmu.custody.storageCycleWarnAt`（默认 `5`）、`vmu.custody.destroyKeepsReference`（默认 `true`）、`vmu.anonymity.pseudonymStyle`（默认 `pseudonym`）、`vmu.anonymity.mappingIrreversible`（默认 **`true`** ✗✓） |
| **相关错误码** | 见 `03-§8` 的 **VMU_CUSTODY_\***（**已实现 ✓**；本行原列的 ⛔ 计划名已作废 ✗）（**断链**）／见 `03-§8` 的 **VMU_CUSTODY_\***（**已实现 ✓**；本行原列的 ⛔ 计划名已作废 ✗） |
| **四条哲学** | F：不登记＝无保管条目概念 ✓｜T：断链策略/取还阈值/假名样式可配 ✓｜D：链式三要素（who/when/why）由 **pack 声明**，内核不认识"保管条目" ✓｜X：新的保管对象类型只加字段 ✓ |
| **实现要点** | ① 链式保管是**只追加事件流** ✓，每次转移三要素缺一即拒（见 `03-§8` 的 **VMU_CUSTODY_\***（**已实现 ✓**；本行原列的 ⛔ 计划名已作废 ✗））✓；② **断链检测＝连续性检查**：上一环 `to` ≠ 下一环 `from`、时间倒流、或事件缺失 ⇒ **断链必须报** ✗✓（`block` 时拒绝后续操作并具名，`warn` 时计数并继续）；③ **销毁＝状态转换＋保留引用**（`destroyed`＋原因＋时间；样本记录**不删**，与 07 的保留/回收站面**只引用不重定义** ✗）；④ 与 **20 卷去标识化只引用** ✗：本卷只存 `pseudonym`（假名），**样本↔受试者映射默认不可逆** ✓ —— 不提供反向查询接口，任何"由样本找回受试者"的请求 ⇒ 见 `03-§8` 的 **VMU_CUSTODY_\***（**已实现 ✓**；本行原列的 ⛔ 计划名已作废 ✗） |
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
| **接口形状** | 服务 `vmu.funding`（★ **已接线 ✓**（实测 16/16，见 §0.1））：`openAccount()`／`addBudgetLine()`／`available(account, category)`；工具 `vibe_vmu_funding` ⛔ 未实现；协议 `ExpenseClaim` ⛔、`CostShareSplit` ⛔ |
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
| **接口形状** | 服务 `vmu.funding.request()`／`approve()`／`recordReceipt()`（★ **已接线 ✓**（实测 16/16，见 §0.1））；钩子 `ops/expense-requested` ⛔ 提案、`ops/expense-approved` ⛔ 提案、`ops/receipt-recorded` ⛔ 提案；工具 `vibe_vmu_funding` ⛔ 未实现 |
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
| **接口形状** | 服务 `vmu.funding.split(expenseId, splits)`／`settle(period)`（★ **已接线 ✓**（实测 16/16，见 §0.1））；协议 `CostShareSplit` ⛔ |
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
| **接口形状** | 服务 `vmu.funding.auditPack(period, filter)`（★ **已接线 ✓**（实测 16/16，见 §0.1））；工具 `vibe_vmu_funding` ⛔ 未实现（`pack` 动作）；协议 `AuditEvidencePack` ⛔ |
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
| **接口形状** | 协议 `LegalEntity` ⛔ 待实现：`{ entityId, jurisdiction, taxIdRef, currency? }`；协议 `TaxFieldSlots` ⛔ 待实现：`{ slot, required, source }`；服务 `vmu.partnership`（**计划 ✗**）：`register(entity)`／`bind(accountId, entityId)`／`validateInvoice(doc)`／`gate(documentType, context)`；工具 `vibe_vmu_legalentity` ⛔ 未实现 |
| **可调控参数** | `vmu.partnership.registryDir`（默认 `Ops/Entities`）、`vmu.partnership.requireEntity`（默认 `true`）、`vmu.partnership.taxIdStyle`（默认 `opaque-ref`＝**只存引用，不存明文** ✓）、`vmu.partnership.invoiceTaxSlots`（默认 `["taxIdRef","taxRateRef","taxAmountMinor","taxJurisdiction"]`）、`vmu.partnership.crossBorderGate`（默认 `require-approval`）、`vmu.partnership.crossBorderApproverRoles`（默认 `[]`） |
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
| **接口形状** | 服务 `vmu.ip`（★ **已接线 ✓**（实测 15/15，见 §0.1））：`sweep(period)`／`disclose(draft)`／`status(id)`；工具 `vibe_vmu_ip` **✓ 已实现（轮 556）**；钩子 `ip/disclosure-before` **✓ 已实现（轮 556）** 提案；协议 `IpDisclosure` **✓ 已实现（轮 556）** |
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
| **接口形状** | 服务 `vmu.ip.recordSearch(query, db, hits, conclusion)`（★ **已接线 ✓**（实测 15/15，见 §0.1）） |
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
| **接口形状** | 服务 `vmu.ip.ownership(id)`／`vmu.ip.contributors(id)`（★ **已接线 ✓**（实测 15/15，见 §0.1））；协议 `IpOwnership` ⛔ |
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
| **接口形状** | 服务 `vmu.ip.hold(targetRef, reason, untilMs)`／`release(holdId, evidence)`（★ **已接线 ✓**（实测 15/15，见 §0.1））；钩子 `ip/publication-hold` ⛔ 提案、`ip/hold-released` ⛔ 提案 |
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
| **接口形状** | 服务 `vmu.ip.transfer(id, terms)`（★ **已接线 ✓**（实测 15/15，见 §0.1））；许可证条款本身**引用 20** 的 `vmu.license.*` ✓ |
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
| **接口形状** | 服务 `vmu.conference`（★ **已接线 ✓**（实测 18/18，见 §0.1））：`openCfP(spec)`／`submit(paper)`／`closeCfP()`；工具 `vibe_vmu_conference` **✓ 已实现（轮 543）** 已实现（轮 543）；协议 `CfP` **✓ 已实现（轮 543）** |
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
| **接口形状** | 服务 `vmu.conference.assign()`／`collectReviews()`（★ **已接线 ✓**（实测 18/18，见 §0.1））；协议 `ReviewAssignment` ⛔；**评审判据引用 16 的 `vmu.review.*`** ✓ |
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
| **接口形状** | 服务 `vmu.conference.schedule()`（★ **已接线 ✓**（实测 18/18，见 §0.1））；**会议/议程/纪要**一律走 `vibe_vmu_meeting` ✓ 与 08 的议程原语 ✓ |
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
| **接口形状** | 服务 `vmu.conference.register()`／`publishProceedings()`（★ **已接线 ✓**（实测 18/18，见 §0.1）） |
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
| **接口形状** | 服务 `vmu.dissemination`（⚠️ **部分接线**（实测 10/12，见 §0.1））：`draft(targetRef)`／`review(draftId)`／`publish(draftId)`；工具 `vibe_vmu_outreach` ⛔ 未实现；钩子 `outreach/draft-before` ⛔ 提案 |
| **可调控参数** | `vmu.dissemination.publicSummaryRequired`（默认 `true`）、`vmu.dissemination.evidenceFidelity`（默认 `strict`；可选 `warn`）、`vmu.dissemination.embargoRespect`（默认 `true`）、`vmu.dissemination.languageSet`（默认 `["zh","en"]`） |
| **相关错误码** | `VMU_OUTREACH_EVIDENCE_MISMATCH` ⛔／`VMU_OUTREACH_EMBARGO` ⛔／`VMU_OUTREACH_REF_MISSING` ⛔ |
| **四条哲学** | F：不启用＝无传播面 ✓｜T：保真档位/语言集可配 ✓｜D："哪些词算夸大"由 pack 的词表判定点 ✓｜X：新渠道只加渲染器 ✓ |
| **实现要点** | 机器判据：稿内每个**结论句**必须带 `evidenceRef`（指向内部结论/回执 id）；无法回指 ⇒ **具名拒** ✓；`strict` 档位下"确定性措辞"必须被内部结论的置信度覆盖 ✓ |
| **依赖与前置** | 07 记录轨 ✓、16 出版面 ✓、20 脱敏 ✓ |
| **成熟度** | **意图已承载 ✓／机器判据未实现 ✗**（轮 63 实测）—— 论文轨道**已在提示词层**要求写作方："**不得编造**：没有证据的推测不要写成结论；**未决／被否证的条目必须显式标注**" ＋ "在 **evidence** 里写清证据路径"（`vibe-math-v5.js:5825-5826` ✓）；**但没有机器校验** ✗（交付的 `evidence` 是否为空、未决项是否真的标注，**无人检查** ✗）。 |
| **裁决（轮 63）** | **做 ✓，但落点在论文轨道的交付点，不新建 `vmu.dissemination` 服务** ✗✓ —— **⓪ 步结论**：该机制**已有真实消费者**（**论文轨道自己产出 claims 与 evidence** ✓），而**独立的 `vmu.dissemination`（`draft`/`review`/`publish`）没有消费者** ✗（公众摘要＝论文摘要，本已在轨道内产出 ✓）。**最小机器判据** ✓：交付件**`evidence` 为空 ⇒ 具名拒**（＝`VMU_OUTREACH_REF_MISSING` 的形状 ✓；**用该码前须先登记** ✓）；**"确定性措辞被置信度覆盖"（strict 档）明写未做 ✗**（需 pack 词表判定点 ✓）。<br>**未做 ✗ 明列**：`vmu.dissemination.*` 四个键**未登记、未接线** ✗；`vmu.dissemination` 服务**不建** ✗。 |
| **优先级** | P1（诚实性是机构资产） |

### 6.2 媒体与开放评审

| 字段 | 内容 |
|---|---|
| **名称** | 媒体与开放评审（Media & Open Review） |
| **目的** | 媒体询问、开放评审（公开评审意见）的**运营流程**：谁可代表机构发声、什么可公开 ✓ |
| **接口形状** | 服务 `vmu.dissemination.mediaRequest()`／`openReview(package)`（⚠️ **部分接线**（实测 10/12，见 §0.1）） |
| **可调控参数** | `vmu.dissemination.mediaApprovalPolicy`（默认 `spokesperson-only`）、`vmu.dissemination.openReviewEnabled`（默认 `false`）、`vmu.dissemination.anonymityPreserve`（默认 `true`） |
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
| **接口形状** | 服务 `vmu.dissemination.impact()`（⚠️ **部分接线**（实测 10/12，见 §0.1）） |
| **可调控参数** | `vmu.dissemination.impactLogFields`（默认 `["channel","reach","date","ref"]`）、`vmu.dissemination.impactUseInEvaluation`（默认 `false` ✗） |
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
| **接口形状** | 服务 `vmu.collab`（⚠️ **部分接线**（实测 7/10，见 §0.1））：`registerAgreement()`／`attachDsa()`／`status()`；工具  未实现 | ★ **其能力＝ `vibe_vmu_collab` 的九个动作** ✓（★ 本轮已落地 ✓）
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
| **接口形状** | 服务 `vmu.collab.authorship()`／`reconcile(period)` —— ★ **已接线 ✓（轮 264 实测）**：**`kernel/collab.js` 的 `authorship()`（L252 ✓）与 `settle()`（L224 ✓，即本处所说的对账动作；`reconciledMinor` 差异逐笔计算 ✓）** ✓ |
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
| **接口形状** | 协议 `Agreement` ⛔ 待实现：`{ agreementId, kind: 'dua'|'mta', parties[], scope, expiresAt, restrictions[], signatureRef }`；服务 `vmu.agreements`（★ **已接线 ✓**（实测 7/7，见 §0.1））：`register(agreement)`／`sign(agreementId, {signatureRef})`／`check(agreementId, {action, targetRef})`／`expiring(windowDays)`；工具 `vibe_vmu_agreements` ⛔ 未实现；钩子 `agreement/check-before` ⛔ 提案 | ★ **其能力＝ `vibe_vmu_collab` 的 `agreements` 动作** ✓（★ 本轮已落地 ✓）
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
| **接口形状** | 服务 `vmu.compliance`（★ **已接线 ✓**（实测 20/20，见 §0.1））：`addDue()`／`listDue()`／`complete()`；工具 `vibe_vmu_compliance` ⛔ 未实现；钩子 `compliance/calendar-due` ⛔ 提案、`compliance/overdue` ⛔ 提案 |
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
| **接口形状** | 服务 `vmu.compliance.require(approvalType, targetRef)`／`discloseCoi()`（★ **已接线 ✓**（实测 20/20，见 §0.1）） |
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
| **接口形状** | 服务 `vmu.compliance.prepare(scope)`／`exportPack()`（★ **已接线 ✓**（实测 20/20，见 §0.1））；工具 `vibe_vmu_compliance` ⛔ 未实现；协议 `AuditEvidencePack` ⛔（与 §3.4 同一形状，财务/合规两视角 ✓） |
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
| 9.5 | **设施使用登记** | 场地/实验室/工位的占用与安全要求（与 §2 共享资源同构） | `vmu.capacity.facilities`（默认 `[]`）、`vmu.capacity.safetyBriefingRequired`（默认 `true`） | `VMU_CAPACITY_FACILITY_CONFLICT` ⛔ | ✗ | P3 |

> **这一族怎么组合出来** ✓：**settings** 给池大小、超额比、预警比例、预测期；**中间件**在 `before`（申请资源/启动大批作业前）查池与预测、在 `after` 记用量；**pack** 给"谁能优先、哪类作业可抢占、哪些场地需安全简报" ✓。**存储语义与配额仍归 07** ✓（引用不重定义）。

---

## 10. 人事与任期运营（Personnel & Tenure Operations）

> **交界（只写一次 ✗）**：**17 管"席位/招募/试用/权限"（`vmu.admission.*` ✓）**；**22 管"周期运营"**：评审季、绩效节奏、任期决策、轮换、离职、申诉 ✓。

| 条目 | 名称 | 目的 | 可调控参数 | 码 | 成熟度 | 优先级 |
|---|---|---|---|---|---|---|
| 10.1 | **招募周期（运营）** | 与 17 的招募衔接：周期开窗、评审季排期、名额与容量联动（§9.1） | `vmu.tenure.recruitCycleDays`（默认 `60`）、`vmu.tenure.recruitWindowOpenMs` | `VMU_HR_CYCLE_CLOSED` ⛔ | ✗ | P2 |
| 10.2 | **绩效节奏** | 定期回顾的节奏与材料清单（**材料来自记录轨**，不凭印象 ✓） | `vmu.tenure.performanceCadenceDays`（默认 `180`）、`vmu.tenure.performanceEvidenceRequired`（默认 `true`） | `VMU_HR_PERF_EVIDENCE_MISSING` ⛔ | ✗ | P2 |
| 10.3 | **任期与晋升** | 任期时钟、里程碑、决策窗口（引用 16 的成果面，引用 17 的席位面） | `vmu.tenure.tenureTrackMonths`（默认 `60`）、`vmu.tenure.tenureDecisionWindowDays`（默认 `90`）、`vmu.tenure.tenureQuorum`（默认 `3`） | `VMU_HR_TENURE_DECISION_DUE` ⛔／`VMU_HR_TENURE_QUORUM_MISSING` ⛔ | ✗ | P1 |
| 10.4 | **轮换·离职·申诉** | 轮换与离职清单（权限回收、数据交接、设备归还、文件归档）；申诉窗口与受理 | `vmu.tenure.offboardingChecklist`（默认 `["revoke","handover","return","archive"]`）、`vmu.tenure.appealWindowDays`（默认 `30`）、`vmu.tenure.rotationPolicy`（默认 `none`） | `VMU_HR_OFFBOARDING_INCOMPLETE` ⛔／`VMU_HR_APPEAL_OPEN` ⛔ | ✗ | P1 |
| 10.5 | **人类在环** | 人事决策**永不**自动化（只准备材料），人类审批可打断（O-6） | `vmu.tenure.humanDecisionRequired`（默认 `true`） | `VMU_HR_AUTODECISION_FORBIDDEN` ✓ | ✓ **已实现（轮 531 实测 ✓）** | P0（纪律） |

> **这一族怎么组合出来** ✓：**settings** 给周期/窗口/清单；**中间件**在 `before`（权限变更/离职动作前）检查清单闭合、在 `after` 记录；**pack** 给"任期规则、评审季规则、申诉流程" ✓。**招募与试用语义归 17** ✓（引用不重定义）。

---

## 11. 组合与可调控性总纲（**本卷的灵魂**）

### 11.1 三层职责
| 层 | 决定什么 | 现状 |
|---|---|---|
| **settings**（`vmu.funds.*`／`vmu.resource.*`／`funding.*`／`ip.*`／`conference.*`／`outreach.*`／`collab.*`／`compliance.*`／`capacity.*`／`hr.*`） | 阈值、窗口、必填字段、强制度、周期、**金额表示与舍入** | ✗ 全部为计划键（`planned:true`）✓ |
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
| 工具 | `vibe_vmu_resource` **✓ 已实现（轮 543）** 已实现（轮 543）、`vibe_vmu_funding` **✓ 已实现（轮 543）** 已实现（轮 543）、`vibe_vmu_ip` **✓ 已实现（轮 543）** 已实现（轮 543）、`vibe_vmu_conference` **✓ 已实现（轮 543）** 已实现（轮 543）、`vibe_vmu_outreach` **✓ 已实现（轮 543）** 已实现（轮 543）、 已实现（轮 543）、`vibe_vmu_compliance` **✓ 已实现（轮 543）** 已实现（轮 543）、`vibe_vmu_capacity` **✓ 已实现（轮 543）** 已实现（轮 543）、`vibe_vmu_hr` **✓ 已实现（轮 543）** 已实现（轮 543） | ✗ | ★ **其能力＝ `vibe_vmu_collab` 的九个动作** ✓（★ 本轮已落地 ✓） **已实现（轮 545）** 未实现（规划）
| 工具 | `vibe_vmu_minutes` ✓ **已实现（轮 517）** | ✓ |
| 工具（复用） | `vibe_vmu_records` ✓、`vibe_vmu_task` ✓、`vibe_vmu_meeting` ✓、`vibe_vmu_set` ✓、`vibe_vmu_middleware` ✓、`vibe_vmu_pack` ✓、`vibe_vmu_script` ✓、`vibe_vmu_status` ✓、`vibe_vmu_control` ✓ | ✓ |
| 服务 | `vmu.resource`／`vmu.funding`／`vmu.ip`／`vmu.conference`／`vmu.dissemination`／`vmu.collab`／`vmu.compliance`／`vmu.capacity`／`vmu.tenure`（计划 `kernel/ops/*`） | ✗ |
| 钩子 | `ops/expense-requested` ⛔ 提案、`ops/expense-approved` ⛔ 提案、`ops/receipt-recorded` ⛔ 提案、`ops/reservation-requested` ⛔ 提案、`ops/reservation-conflict` ⛔ 提案、`ops/calibration-due` ⛔ 提案、`ip/disclosure-before` ⛔ 提案、`ip/publication-hold` ⛔ 提案、`conference/cfp-open` ⛔ 提案、`conference/decision` ⛔ 提案、`outreach/draft-before` ⛔ 提案、`compliance/calendar-due` ⛔ 提案、`capacity/pool-low` ⛔ 提案、`hr/review-season-open` ⛔ 提案 | ✗ |
| 协议 | `InstrumentReservation` ⛔、`ExpenseClaim` ⛔、`CostShareSplit` ⛔、`IpDisclosure` ⛔、`CfP` ⛔、`ReviewAssignment` ⛔、`AuditEvidencePack` ⛔、`CapacityPlan` ⛔、`TenureReview` ⛔ | ✗ |

---

## 13. 拟增键总表（**具体键**；由生成管线登记为 `planned`）

| 族 | 键 | 类型 | 默认 | 域 | 谁可改 |
|---|---|---|---|---|---|
| 资源 | `vmu.resource.ledgerDir` | string | `Ops/Resources` | 相对项目根 | 运营席 |
| 资源 | `vmu.resource.requireOwner` | boolean | `true` | — | pack |
| 资源 | `vmu.resource.capabilityTags` | string[] | `[]` | 标签 | pack |
| 资源 | `vmu.resource.reservationHorizonDays` | integer | `30` | ≥0 | 运营席 |
| 资源 | `vmu.resource.maxHoldHours` | integer | `12` | ≥1 | 运营席 |
| 资源 | `vmu.resource.priorityPolicy` | string | `fifo` | `fifo`｜`pi-first`｜`quota-weighted` | pack |
| 资源 | `vmu.resource.waitlistPolicy` | string | `auto-offer` | `auto-offer`｜`manual`｜`off` | 运营席 |
| 资源 | `vmu.resource.overbookRatio` | number | `1.0` | ≥1.0 | 运营席 |
| 资源 | `vmu.resource.requireCalibration` | boolean | `true` | — | pack |
| 资源 | `vmu.resource.calibrationDueDays` | integer | `365` | ≥1 | 运营席 |
| 资源 | `vmu.resource.blockOnOverdue` | boolean | `true` | — | pack |
| 资源 | `vmu.resource.downtimePolicy` | string | `queue` | `queue`｜`fail` | 运营席 |
| 资源 | `vmu.resource.dataCaptureRef` | string | `required` | `required`｜`optional`｜`ignore` | pack |
| 资源 | `vmu.resource.hashAlgo` | string | `sha256` | 算法名 | 内核固定（可读） |
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
| 传播 | `vmu.dissemination.publicSummaryRequired` | boolean | `true` | — | pack |
| 传播 | `vmu.dissemination.evidenceFidelity` | string | `strict` | `strict`｜`warn` | pack |
| 传播 | `vmu.dissemination.embargoRespect` | boolean | `true` | — | pack |
| 传播 | `vmu.dissemination.languageSet` | string[] | `["zh","en"]` | 语言码 | 运营席 |
| 传播 | `vmu.dissemination.mediaApprovalPolicy` | string | `spokesperson-only` | 政策名 | pack |
| 传播 | `vmu.dissemination.openReviewEnabled` | boolean | `false` | — | pack |
| 传播 | `vmu.dissemination.anonymityPreserve` | boolean | `true` | — | pack |
| 传播 | `vmu.dissemination.impactLogFields` | string[] | `["channel","reach","date","ref"]` | 字段名 | 运营席 |
| 传播 | `vmu.dissemination.impactUseInEvaluation` | boolean | `false` | — | pack |
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
| 人事 | `vmu.tenure.recruitCycleDays` | integer | `60` | ≥1 | 运营席（衔接 17） |
| 人事 | `vmu.tenure.recruitWindowOpenMs` | integer | `0` | ≥0 | 运营席 |
| 人事 | `vmu.tenure.performanceCadenceDays` | integer | `180` | ≥1 | pack |
| 人事 | `vmu.tenure.performanceEvidenceRequired` | boolean | `true` | — | pack |
| 人事 | `vmu.tenure.tenureTrackMonths` | integer | `60` | ≥1 | pack |
| 人事 | `vmu.tenure.tenureDecisionWindowDays` | integer | `90` | ≥1 | pack |
| 人事 | `vmu.tenure.tenureQuorum` | integer | `3` | ≥1 | pack |
| 人事 | `vmu.tenure.offboardingChecklist` | string[] | `["revoke","handover","return","archive"]` | 步骤 | pack |
| 人事 | `vmu.tenure.appealWindowDays` | integer | `30` | ≥0 | pack |
| 人事 | `vmu.tenure.rotationPolicy` | string | `none` | `none`｜`periodic`｜`byRequest` | pack |
| 人事 | `vmu.tenure.humanDecisionRequired` | boolean | `true` | — | **内核强制** ✓ |
| 货币 | `vmu.funds.currencyDefault` | string | `CNY` | ISO-4217 alpha-3 | 运营席 |
| 货币 | `vmu.funds.roundingMode` | string | `half-even` | `half-up`｜`half-even`｜`floor`｜`ceil`｜`trunc` | pack |
| 货币 | `vmu.funds.scaleByCurrency` | object | `{}` | 币种→精度位数 | pack（覆盖 ISO 表需留痕） |
| 货币 | `vmu.funds.fxSource` | string | `manual-snapshot` | 来源名（离线优先） | pack |
| 货币 | `vmu.funds.fxSnapshotDir` | string | `Ops/FX` | 相对项目根 | 运营席 |
| 货币 | `vmu.funds.fxMaxAgeDays` | integer | `7` | ≥0 | 运营席 |
| 货币 | `vmu.funds.allocationRemainderPolicy` | string | `largest-remainder` | `largest-remainder`｜`first-party`｜`last-party` | pack |
| 货币 | `vmu.funds.rejectFloatAmounts` | boolean | **`true`** | —（**默认拒浮点**，不可静默关闭 ✗） | **内核强制** ✓ |
| 货币 | `vmu.funds.maxAmountMinor` | integer | `0` | ≥0（0＝不限） | pack |
| 货币 | `vmu.funds.allowNegative` | boolean | `false` | — | pack |
| 货币 | `vmu.funds.auditTupleFields` | string[] | `["inputs","fx","rounding","result"]` | 字段名（**只可增不可删** ✓） | 审计席 |
| 保管条目 | `vmu.custody.ledgerDir` | string | `Ops/Biosamples` | 相对项目根 | 样本管理员 |
| 保管条目 | `vmu.custody.requireChain` | boolean | `true` | — | pack |
| 保管条目 | `vmu.custody.chainGapPolicy` | string | `block` | `block`｜`warn` | pack |
| 保管条目 | `vmu.custody.storageCycleWarnAt` | integer | `5` | ≥0 | pack |
| 保管条目 | `vmu.custody.destroyKeepsReference` | boolean | `true` | — | pack（引用 07 保留面 ✓） |
| 保管条目 | `vmu.anonymity.pseudonymStyle` | string | `pseudonym` | `pseudonym`｜`code` | pack（与 20 联动） |
| 保管条目 | `vmu.anonymity.mappingIrreversible` | boolean | **`true`** | —（**默认不可逆** ✓） | **内核强制** ✓ |
| 税务/法务 | `vmu.partnership.registryDir` | string | `Ops/Entities` | 相对项目根 | 财务/法务 |
| 税务/法务 | `vmu.partnership.requireEntity` | boolean | `true` | — | pack |
| 税务/法务 | `vmu.partnership.taxIdStyle` | string | `opaque-ref` | `opaque-ref`｜`none` | pack（**不存明文** ✓） |
| 税务/法务 | `vmu.partnership.invoiceTaxSlots` | string[] | `["taxIdRef","taxRateRef","taxAmountMinor","taxJurisdiction"]` | 字段位名 | pack |
| 税务/法务 | `vmu.partnership.crossBorderGate` | string | `require-approval` | `require-approval`｜`warn`｜`off` | pack |
| 税务/法务 | `vmu.partnership.crossBorderApproverRoles` | string[] | `[]` | 席位名 | pack |
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
| **设备台账／预约／校准／维护**（`VMU_EQUIP_*`） | **已实现 ✓（轮 61 核到归属；不需新代码 ✗）** | **⓪ 前提步的实测结果** ✓✓：该族**已由 `kernel/resource.js` 实现**（**14/17 键已接线** ✓）—— `requireOwner`／`capabilityTags`／`requireCalibration`／`calibrationDueDays`／**`blockOnOverdue`**（**校准过期即阻断** ✓＝§2.3）／**`reserve`**／`maxHoldHours`（**超占用上限** ✓）／`reservationHorizonDays`／`overbookRatio`／`priorityPolicy`／**`waitlistPolicy`**（候补 ✓）／**`scheduleMaintenance`** ✓／`attachCapture`（**采集挂引用** ✓＝§2.4）／`hashAlgo`；**facility 预约与重叠拒**另由 **`kernel/capacity.js`** 承担（`facilities`／`fromMs`／`toMs`／`VMU_CAPACITY_FACILITY_CONFLICT` ✓＝§2.2）✓。**剩余 3 个键未接线且理由由模块自己写明** ✓✓：`ledgerDir`（**无 FS 接缝** ✗）、`dataCaptureRef`（**需 library 面，只引用** ✗）、`downtimePolicy`（**需运维/告警协同** ✗）⇒ **未做 ✗ 且明写** ✓ |
| **经费台账／预算行／凭证链**（`VMU_FUNDING_*`） | **做 ✓** | `funding` 面**已实现**（16 键 ✓、分摊余数具名 ✓）⇒ 其余项是其自然延伸 |
| **货币与舍入类型**（§3.0，**N1**） | **不做 ✗** | **⑤重复**：`funding` 已用**最小货币单位整数**＋**具名余数**（`VMU_ALLOCATION_REMAINDER` ✓）⇒ 再引入币种／汇率／审计四元组是**另一套会计系统**（**②无对应键**、**③无消费者**）⇒ 超出 vmu 初衷（**研究编排，不是账务** ✓） |
| **保管链与溯源**（§2.5，**N4**） | **不做 ✗** | **③无消费者**（无实验室系统接入面 ✓）；真需要"链式保管"应**复用**已实现的 `ip`（披露闸 ✓）与 `compliance`（同意／IRB ✓），**不新建一族** |
| **税务与法务实体**（§3.6，**N9**） | **不做 ✗** | **③无消费者**；且该卷自己写明"**禁止实现税率推导** ✗" ⇒ 既不做，就**不留 21 行规格** |
| **DUA／MTA 协议闸**（§7.4，**N10**） | **做 ✓（轮 60 已落地到期＋范围）** | **轮 59 改判** ✗✓：原判"不做 ✗"的**理由是错的** —— 核心里**没有**通用协议闸 ✗，**但 `kernel/ip.js` 已有『未签不得转移』的具名拒** ⇒ **③有真实消费者** ✓、**①改变决定** ✓ ⇒ 判"做 ✓"。**轮 60 已实现** ✓✓：`transfer()` 可收 **`agreement: { ref, expiresAt, restrictions }`** ⇒ **过期 ⇒ 具名拒** ✓、**范围不含 `transfer` ⇒ 具名拒并列出它允许什么** ✓、**读不出的到期值 ⇒ 具名拒**（**不得当作"无到期"** ✗✓）、**不透明引用仍然可用**（新字段可选 ✓）；**复用本面既有码** ✓（**未新增未登记码** ✓）。**领域词表（dua/mta 种类）仍归 pack** ✓ |
| **公众摘要证据保真**（§6.1，`VMU_OUTREACH_*`） | **做 ✓（轮 63 收窄落点；轮 64 已实现最小判据）** | **①改变决定** ✓（"**内部未定论 ⇒ 不得写成已证明**"**可判定** ✓）；**⓪ 步结论** ✓：**意图已在论文轨道提示词层承载**（`vibe-math-v5.js:5825-5826` ✓），**但机器判据此前不在** ✗ —— **受理处 `paperRecordPart` 把空 `evidence` 静默收成 `[]`，只把"声称证据：0 条"写进日志** ✗✓。**轮 64 已实现** ✓✓：**交付件 `evidence` 为空 ⇒ 具名拒 `VMU_OUTREACH_REF_MISSING`**（**该码此前已在 `03-§8` 登记为规划码** ✓ ⇒ **用即转"已实现"** ✓），并**同时给成员发一条说明**（"每条结论必须指向库内已存在证据；未决/被否证必须显式标注" ✓）。**未做 ✗ 明列**：① ~~"拒了但没人再问" ⇒ 流程会卡住~~ ⇒ **轮 66 已修 ✓✓**：**拒绝后"有界再问"**（`reaskAfterRefusal` ✓：**每成员最多 2 次**，超限**自曝"需要所办介入"** ⇒ **绝不死循环** ✗）；**且旧有的"空 part"拒绝同样接上了再问** ✓（**既有缺口一并补掉** ✓）。**因果验证** ✓✓：桩**只省略一次证据** ⇒ **`r-2` 被问了两次** ✓（`attempts={"acad":1,"r-1":1,"r-2":2,"r-3":1}` ✓）且**流程正常完成** ✓（`passed=101 failed=0` ✓）⇒ **去掉"拒"则无第二次；去掉"再问"则停摆**（**轮 65 实测 `passed=89 failed=11`** ✓）✓✓；② "**确定性措辞被置信度覆盖**"（strict 档）**需 pack 词表判定点** ✗；③ `vmu.dissemination.*` 四键**未登记未接线** ✗；④ **独立 `vmu.dissemination` 服务不建** ✗（**无消费者** ✓） |

**落地顺序** ✓：先做**与已实现面同族**的三族（设备／经费／披露 ✓），**其余只留本节一行** ✓；将来**真有消费者 ⇒ 改判**，并把该行升级为规格 ✓。
> **★ 结局（轮 59–79 已核 ✓✓）**：**设备族 = 已实现**（`kernel/resource.js` 14/17 键 ＋ `capacity` 的 facility 重叠拒 ✓，**不需要新代码** ✗）；**经费族 = 已实现**（`funding` 16 键；**金额必为整数**已由四条入口具名拒 ✓）；**协议闸 = 已落地**（`ip.transfer()` 的 `agreement.expiresAt`／`restrictions` ✓）；**公众摘要证据保真 = 已落地**（论文轨道交付点：**`evidence` 为空 ⇒ 具名拒 ＋ 有界再问** ✓，因果探针实测 `r-2` 被问两次且流程完成 ✓）。**判"不做 ✗"的四族**（会计层／保管条目库／税务实体／DUA 模板）**规格已删、只留一行** ✓。**未做 ✗ 明列**：`vmu.dissemination.*` 四键未登记未接线 ✓；"确定性措辞被置信度覆盖"需 pack 词表 ✓；`ip` 的 5 个**服务面**有意不入 settings ✓。

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
10. **断言：金额必为整数（§3.0 规则 M1）** —— 传浮点/小数/字符串金额 ⇒ **具名拒** `VMU_AMOUNT_NOT_INTEGER`（**含现值** ✓）；**零是合法值** ✓。**实现状态：部分 ✓** —— `request()` **已具名拒**（轮 57 ✓）；`expense()`／预算行／`costShareMinor` 仍走强转助手 ⇒ 收尾见 §14 ✓。**该规则无条件生效** ✓（**不引入 `vmu.funds.*` 键** ✗ —— 见 §14 裁决）。
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
- `17`：席位/招募/委托/仲裁/预算令牌（`vmu.admission.*`／`vmu.budget.*` **归 17** ✗；本卷管"钱与物"）。
- `20`：许可/密级/脱敏/合规基线（本卷合规运营**引用**其判据 ✗）。
- `21`：审计/指标/SLO/导出（本卷运营事件**必须**经其留痕）✓。
- **边界加注（N4／N9／N10）** ✗：**样本销毁与保留**只引用 07 的保留/回收站面；**样本↔受试者映射**只引用 20 的去标识化（本卷默认**不可逆** ✓）；**协议到期复审的提醒/日历/告警**只引用 21 ✓；**税务字段位**只声明"位与校验点"，法条与税率**不在本卷** ✓。

---

## 17. 未核项（**编号登记见 `14-§2`**）

> 本卷的"未核/待接线/待登记"项统一在 `14-§2` 编号登记，避免两处漂移；下列为**本卷视角**的未核项。

| # | 未核项 | 现状 | 影响 |
|---|---|---|---|
| O1 | 9 个运营服务与 9 个工具**零实现** | 已核实（本卷 §1 成熟度表） | 全卷为设计目标；不得据以推理 ✗ | ★★★ **轮 537 实测更正** ✗✓：★ **"零实现"与【本卷自己的 §1 成熟度表**]矛盾** ✗ —— ★ 该表有 **12 行**写着「已实现 ✓」✓ ⇒ ★★ **O1 的准确说法是：**这些服务【多数已有实现**]，★ **而未实现的是【它们各自的工具面**]** ✓（★ 见 §0.1 实测表与本卷 §1 ✓）。
| O2 | ~~财务金额与币种：本仓**没有任何货币类型/舍入实现**~~ ★★ **已过期（★ 轮 521 实测 ✓）**：★ **`funding.js` 实现了【最小单位**]金额** ✓（`vmu.funding.currency`／`approvalThresholdMinor`／`pettyCashLimitMinor`／`settlementRoundMinor` ✓）★ 以及内部的 `moneyOr` 校验器（★ 注释即指向本卷 §15-10 ✓）⇒ ★ **本项应改为"最小货币类型【已有**]，★ 缺的是【跨面统一**]"** ✓ | 已核实（本卷 §1 成熟度表） | 全卷为设计目标；不得据以推理 ✗ |
| O3 | 与 17 的令牌/钱换算边界 | 需要一条**静态门**才能变成机器事实 ★★ **轮 524 实测【部分有载体**]✓：★ 核心里 `rate` **368** 处／`convert` **3** 处 ⇒ ★ **换算面已存在** ✓ ⇒ **缺的是"跨面统一口径"** ✓ | ★ **缺跨面统一口径** ✓ |
| O4 | 披露时钟与 16 出版面的仲裁顺序 | 需要一条**判定点**与冲突记录格式 ★★ **轮 524 实测【有载体**]✓：★ `disclosure` **96** 处／`embargo` **25** 处 ⇒ ★ **披露时钟与禁运已实现** ✓ ⇒ **缺的是与 16 出版面的【仲裁顺序判定点**]** ✓ | ★ **缺仲裁顺序判定点** ✓ |
| O5 | 传播"夸大词表"的来源与维护者 | ★★★ **轮 530 已实现** ✓：★ **`vmu.dissemination.exaggerationWords`（stringList，默认【空**]⇒ 零机制 ✓）**；★ `publication.js` 的 `outreachPack` 在 `strict` 档命中即 **具名拒 `VMU_OUTREACH_EXAGGERATED`** ✓（★ 带 `words` 与指向设置的 hint ✓）；★ `warn` 档记警告不拒 ✓；★★ **词表由【声明**]决定，内核对它没有任何意见** ✓（★ 轮 63 裁定：落点在论文轨道的交付点 ✓） | §6.1 的 `strict` 档位缺词表即无法判定  ★★ **轮 525 判定：保留** ✓ —— ★ **消费者＝(i) 评审与出版** ✓：★ `strict` 档位要判"传播是否夸大"，**没有词表就无法判定** ✓ ⇒ ★ **有消费者、留待做** ✓ |
| O6 | 会计科目树与合规项清单的模板集 | 无 | pack 无法落地（§3/§8）  ★★ **轮 525 判定：【降级为扩展**]** ✓ —— ★ **消费者＝无** ✗：★ 会计科目树与合规项模板集是**财务/审计**的物件，★ **对数学研究不产生消费者** ✓ ⇒ ★ 按审批原则移出原卷、不再实现 ✓ |
| O7 | 容量预测的数据来源（任务板？历史用量？） | §9.4 的 `fair-share` 无输入 ★★ **轮 524 实测【有载体**]✓：★ `forecast` **35** 处／`predict` **1** 处 ⇒ ★ **容量预测有实现** ✓ ⇒ **缺的是数据来源的统一** ✓ | ★ **缺数据来源统一** ✓ |
| O8 | 人事决策的"人类在环"在无人类在场时如何处置 | ★★★ **轮 531 实测：已实现** ✓ | §10.5 的阻塞语义**已落地** ✓ —— ★ 无人在场 ⇒ `onTimeout: 'hold'`（`vmu.human` ✓）  ★★ **轮 525 判定：保留** ✓ —— ★ **消费者＝(j) 代理自组织** ✓：★ "无人类在场时如何阻塞"**正是多智能体自组织的核心语义** ✓ ⇒ 有消费者、留待做 ✓ |
| O9 | 审计证据包的**跨机构格式**兼容性 | §3.4/§8.3 只能自用 ★★ **轮 524 实测【部分有载体**]✓：★ `auditPack` **44** 处／**`crossOrg` = 0** ⇒ ★ **审计证据包已实现、跨机构格式未实现** ✓ | ★ **缺跨机构格式** ✗ |
| O10 | **规划码**（★ 数目见生成器 ✓，本行原先写 90 ✗）与既有码族的命名冲突 | 未核 | 04/03 登记前可能撞名 |
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

### 0.3 ★★★ §0.2「三族真实缺口」的更正（★ 轮 536 实测 ✓）

> ★★★ **为什么必须更正**：★ §0.2 是**轮 266 的实测** ✓，★ 而**它把"没有承载面"当结论** ✗ —— ★★ **实测发现第一族【早就有承载面**]** ✓。★ 这比一个过期的**数字**更坏：★ **它把一个【已有的能力**]说成缺口** ✗。

| 族 | §0.2 说（轮 266） | 轮 536 实测 |
|---|---|---|
| **`vmu.partnership`** | ★ "`legalentity`／`jurisdiction`／`taxId`／`crossBorder` **在内核全无**" ✗；★ 协议 `LegalEntity`／`TaxFieldSlots` **仍标 ⛔ 待实现** ✗ | ★★★ **已有承载面** ✓：**`kernel/partnership.js`（132 行 ✓，头部写明 ROUND 276 ✓）** 实现了 ★ 协议 `LegalEntity { entityId, jurisdiction, taxIdRef, currency? }` ✓ 与 `TaxFieldSlots { slot, required, source }` ✓；★ **6 个键**（`registryDir`／`requireEntity`／`taxIdStyle`／`invoiceTaxSlots`／`crossBorderGate`／`crossBorderApproverRoles` ✓）；★ **5 个码**（`VMU_ENTITY_UNKNOWN`／`VMU_ENTITY_ACCOUNT_UNBOUND`／`VMU_TAX_FIELD_MISSING`／`VMU_CROSSBORDER_GATE_REQUIRED`／`VMU_CROSSBORDER_CURRENCY_MISMATCH` ✓）；★ 方法 `validateInvoice()` ✓（★ 只检**字段位是否存在**，**不判税率对错** ✓，★ 税号存**不透明引用** ✓） |
| **`vmu.license`** | ★ "`licen[cs]e`／`attribution`／`incompatible` 命中处**都不是许可证面**" ✓ | ★ **仍成立** ✓（★ 待本轮以外的复核 ✓） |
| **`vmu.review`** | ★ "`rebuttal`（答辩）在内核**全无**" ✗；★ `quorum` 在四处有对应概念 ✓ | ★ **§0.2 自己已给出部分更正** ✓（★ 见其下"状态更正（轮 61）" ✓） |

> ★★★ **由此得出的纪律（★ 第四次的同类 ✓）**：★ **"未决清单落后于代码"本会话已四遇** ✓（★ 轮 524 O3／O4／O7／O9 ✓、★ 轮 529 O6 ✓、★ 轮 531 O8 ✓、★ 轮 536 `partnership` ✓）⇒ ★★ **核"缺口"时读代码，★ 且【间隔久了要重测**]** ✓（★ 本节是**轮 266 的实测**，★ 已过 **270 轮** ✗）。
> ★★ **并记一条口径** ✓：★ **本族的存废【不因本轮而改**]** ✓ —— ★ 它**已有实现、键与码、且有守卫** ✓ ⇒ ★ **现在降级它只会制造搬迁churn** ✗；★ **真正的错误是【文档**]，★ 已更正** ✓。

### 0.4 ★★★ §0.2「三族真实缺口」的【终审**]（★ 轮 537 ✓）

> ★★★ **三族逐个读代码后的结论** ✓ —— ★ **两族被证伪、一族成立** ✓：

| 族 | §0.2（轮 266） | 轮 537 实测（问运行时 ✓） | 判定 |
|---|---|---|---|
| **`vmu.partnership`** | ★ "在内核全无" ✗ | ★★ **`kernel/partnership.js` 自轮 276 起存在** ✓：★ `LegalEntity`／`TaxFieldSlots` ✓、**6 键** ✓、**5 码** ✓、`validateInvoice()` ✓ | ★★★ **证伪** ✗ |
| **`vmu.review`** | ★ "`rebuttal` 在内核全无" ✗ | ★★ **`vmu.reviewers` 有 10 个方法** ✓（`register`／`assign`／`unbind`／`acknowledge`／`acknowledgements`／`quorumMet`／`reviewerView`／`status`／`trace`／`keysUsed` ✓）；★★ **`records.rebuttal` 存在** ✓ | ★★ **基本证伪** ✗ |
| **`vmu.license`** | ★ "命中处都不是许可证面" ✓ | ★ **实测含 license 语义的方法数 ＝ 0** ✓ | ★ **成立** ✓ |

> ★★★ **由此得出的纪律（★ 本会话第五到第八次同类 ✓）** ✓：★ **本节是【轮 266 的实测**]，★ 迄今已过 **270 余轮** ✗ ⇒ ★★ **凡"实测"结论都带【保质期**]** ✓ —— ★ **尤其"某事不存在"这类断言** ✓（★ **它随代码增长而【自动失效**]，★ 而没有任何守卫会发现 ✓）⇒ ★★★ **做法：① 间隔久了重测** ✓；★ **② "不存在"型断言要【写明它是哪一轮的实测**]** ✓（★ 便于判断新鲜度 ✓）。

---

## 19. 主代理＝助手：汇报原语与参数配置面（目标 6 · D-09）

> 状态：**实现稿 v0.1（本卷新增节）** —— 判据＝Lead 裁决 **D-09**：v5r 的主代理是**两层**（`office`＝会话根＝助手/外部接口，**不研究、不投票、无座**，`agent.cordis.yml:74-86`；`academician`＝所内领头人，charter 入职冻结）；**参数只能 office 改**（v5r 的 `withOffice` 对其他人具名拒 `V5_NOT_OFFICE`）；而 v5r **没有任何定时/自动汇报机制** ✗（只有人设文字 ＋ `Progress/` ＋ 院士主动 `overview` ＋ 所办手动 `report()`）。本节把这四件事落成**框架原语 ＋ pack 声明** ✓。
> 上位：本卷头部 `> 上位：`；`01-philosophy.md`（R1 内核零策略／R2 能力与挂点／R11 可观测）｜`06-prompt-pipeline.md`（段装配）｜`03-interface-contract.md`（服务/工具/错误码唯一登记 `§8`）｜`04-settings.md`（键与 H0–H3）｜`10-packs.md`（整合包＝组织政策）｜`16-§9`（汇报的**相位**接口 ✓）。
> 读者：**机制作者**（要扩展汇报原语）｜**pack 作者**（要声明某机构的助手人设与汇报策略）｜**代理**（要知道自己能改什么、不能改什么）。

### 19.1 能力进内核：`vibe-math-vmu/kernel/report.js`

一句话：**汇报原语是框架能力，汇报策略是 pack 声明** ✓（D-09＋`01` 的 R1）。工厂与导出面：

| 导出 | 是什么 | 语义要点 |
|---|---|---|
| `createReport({ clock, log, settings, deliver, audit, describeSetting })` | 工厂 | `clock` 必须注入；`deliver` 是唯一出站接缝；`audit` 写审计；`describeSetting` 是**只读**设置描述接缝（拿 hot/who，**不自己造第二个真源**）✓ |
| `CODE` | 具名拒的码表 | 见 §19.5 ✓ |
| `TRIGGER_KINDS` | `['event','period','threshold']` | 三类触发；**闭集** ✗✓ |
| `EVENT_VOCAB` | 8 个事件名 | **闭集**：写词表外的名字 ⇒ 声明期具名红 ✓ |
| `THRESHOLD_OPS` | `['gte','gt','lte','lt','eq']` | 阈值比较只认这五个 ✓ |
| `DRIVING_FIELDS` | `['action','then','run','drive','decide','execute']` | 声明里出现任一 ⇒ **具名拒**（`VMU_REPORT_ACTION_NOT_ALLOWED`）✓ |
| `TEMPLATE_VARS` | 模板变量白名单 | `at`／`event`／`name`／`count`／`value` ＋ `metric:`／`setting:` ✓ |

返回面：`declarations()`／`status()`／`tick()`／`emit()`／`preview()`／`trace()`／`paramDomain()`／`guardParam()`／`noteParamChange()` ✓。

### 19.2 工具面：`vibe_vmu_report`（`vibe-math-vmu/tools/report.js`）

八个 action ✓：`status`（服务状态：`enabled`／`declared`／`armed`／`problems`／`fires`／`trace`／`params` ✓）｜`declarations`（声明清单＋**逐条问题** ✓）｜`params`（**参数域：键 → 值／类型／hot／who** ✓）｜`set`（改参：**唯一写者＝内核 `setSettingsValue`** ✓）｜`preview`（渲染不发）｜`emit`（强制发一条）｜`tick`（推进周期/阈值评估 ✓）｜`trace`（留痕）✓。
**工具面不自己写设置** ✗：它先过 `guardParam()`（域／owner／理由），再由内核的设置守卫执行（H3 只读、具名 owner）✓ —— 这样"工具面"与"内核 API"是**同一个契约**，不是两份 ✓。

### 19.3 策略进 pack：三份声明，三个消费者

| 声明 | 位置 | 谁读它 | 说什么 |
|---|---|---|---|
| **汇报策略** | `packs/v5r/prompts/v5r-core.js` 的 `PACK.settings`（`vmu.report.enabled`／`reports`／`params`／`whoMayChange`／`requireReason`） | **pack 装载器**（`kernel/pack.js` 作为 pack 设置层应用 ✓） | 三触发各一条（周期/事件/阈值）、参数域 8 键、owner＝`office` ✓ |
| **回合面人设** | `packs/v5r/prompts/v5r-assistant.js`（`V5R_ASSISTANT_TURN_SECTIONS`，由 `PACK.sections` 带出 ✓） | **提示词管线**（每个成员每一轮 ✓） | 成员的汇报义务、对外出口是所办、参数面属于所办 ✓ |
| **system prompt 面人设** | `packs/v5r/prompts/assistant.json`（`hostPrompt:true` ✓） | **预设入口**（按文件夹名读取，插件**不认识 pack 名字** ✓） | office 的助手身份、汇报职责、参数面职责 ✓ |

**为什么分成两份文件**：两个**消费者**不是同一个 —— 回合面由**已装载清单**进管线；system prompt 面必须在**内核存在之前**、由插件**按 pack 文件夹名**作为**数据**读取（插件不能静态 import 某一个 pack 的模块 ✗，否则框架就认识了那一个 pack ✓）。两份文本**不重叠** ✓，所以没有第二个副本会漂移 ✓。
**为什么 `vmu.report.*` 只在一处声明**：同一个键被本 pack 的两个记录（清单 `settings` 与 `settings/defaults.json`）同时声明 ⇒ 具名 `VMU_PACK_CONFLICT`（D-02／O4）✗✓ —— 所以汇报策略归**清单**，`settings/defaults.json` 明确写"不在此处" ✓。

### 19.4 零机制 ＋ 可关（**两道闸，都可见**）

- **不声明 ⇒ 什么都不发生** ✓：`vmu.report.enabled` 的 schema 默认是 `false`（`settings/schema.js` ✓），`vmu.report.reports` 默认是**空表** ✓；无 pack 的装配 `status().declared === 0` 且 `tick()` 的 `note` 写"zero mechanism" ✓。
- **可关且关得可见** ✓：置 `vmu.report.enabled=false` ⇒ 已声明的汇报**全部停发**，但 `status().problems` **具名**报出 `VMU_REPORT_NOT_ENABLED`（**"已声明但已停用"与"从未声明"是两件事** ✗✓）；`emit()` 同码具名拒 ✓。
- **单条也能关**：声明里的 `enabled:false` 让那一条不触发 ✓。

### 19.5 绝不越权驱动（**结构性不变量** ✗✓）

- 每一份回执、每一行留痕、每一次投递都带 `drives:false` ✓；`status().neverDrives === true` ✓。
- 声明里挂动作 ⇒ `VMU_REPORT_ACTION_NOT_ALLOWED`，**具名拒而不是悄悄摘掉** ✓。
- 结构证明：`kernel/report.js` **没有任何 import** ✗✓ —— 它连一个决策服务都够不到（由 `tests/vmu-assistant-report.test.mjs` 断言源码这一事实 ✓）。
- 一句话：**汇报只提示，决策属于读到汇报的人** ✓。

### 19.6 真机装配证据（**不是"文档里写了"** ✓）

| 通道 | 证据 | 命令 |
|---|---|---|
| **回合注入**（成员每轮） | `PACK.sections` 含 `v5r-report-duty` ⇒ **已装载清单**把它注册进真实管线 ⇒ `assemble()` 的文本里**逐字出现**，`sources` 点名它是贡献者 ✓ | `node tests/vmu-assistant-assembly.test.mjs` ✓ |
| **system prompt**（人类对话的那个会话） | 真机 `entry.apply(ctx, { packs:['v5r'] })` ⇒ 入口注册的 host 段里含**助手人设三段**（身份/汇报/参数）✓ | `node tests/vmu-assistant-systemprompt.test.mjs` ✓ |
| **汇报可声明可关** | 三类触发各一条且 `problems` 为空；关掉开关 ⇒ 已声明**不触发**且问题清单具名 ✓ | `node tests/vmu-assistant-report.test.mjs` ✓ |
| **参数入口可改并留痕** | `guardParam()` 域外拒／owner 外拒／无理由拒；`set` 走内核写者 ⇒ 审计出现 `what:'update'` ＋ `subject:'setting:<键>'` ✓ | 同上 ✓ |

### 19.7 键、服务与接缝（**唯一登记在 `04`／`03`** ✓）

- **服务**：`vmu.report`（注册处与描述由内核管线落 ✓，本节只登记语义 ✓）。
- **键族**：`vmu.report.enabled`｜`reports`｜`channels`｜`recipients`｜`minIntervalMs`｜`traceCap`｜`templateMaxChars`｜`params`｜`whoMayChange`｜`requireReason`｜`auditChanges` ✓（逐键类型/hot/who 登记在 `04-§11`，本节**不重复** ✗）。
- **接缝**：`settings.get()`（活读 ✓）、`clock`、`deliver`（缺 ⇒ **先留痕再具名拒** `VMU_REPORT_NO_TRANSPORT` ✓）、`audit`（缺 ⇒ **具名上报** `VMU_REPORT_AUDIT_UNAVAILABLE`，不假装写过 ✓）、`describeSetting`（缺 ⇒ hot/who **报 UNKNOWN 而不臆造** ✓）。
- **不穿**：`store`（**不留耐久键** ⇒ `PUBLIC_KEYS` 不变 ✓）、`members`、`timer`、`bus`（**不发新钩子** ⇒ D-12 的钩子单一真源不动 ✓）。
- **周期由谁推进**：`tick()` 是**纯评估**，需外部驱动 —— 宿主回合结束钩子（`agent/turn-stopping` ✓）或工具面 `action:'tick'` ✓；**换接口＝零策略**（框架不自己起定时器 ✗✓）。
- **装配接线**：`assistant.json` 的 host 段由入口读入并登记为 host 段 —— **接线单（服务名/工具名/意图键/file:line）已交内核管线** ✓。

### 19.8 验收（机器可判定 ✓）

1. **具名**：域外键 ⇒ `VMU_REPORT_PARAM_NOT_DECLARED`；owner 外 ⇒ `VMU_REPORT_PARAM_NOT_ALLOWED`；无理由（`requireReason=true`）⇒ `VMU_REPORT_PARAM_REASON_REQUIRED`；无传输 ⇒ `VMU_REPORT_NO_TRANSPORT` ✓。
2. **断言**：`declarations().problems` 为空是"pack 策略有效"的判据；`status().armed` 与 `problems` 必须**互相一致**（有问题的报告绝不在 `armed` 里 ✓）。
3. **场景**：关开关 ⇒ `fires` 不涨 ＋ `problems` 出现 `VMU_REPORT_NOT_ENABLED`；开开关 ⇒ 同一条声明**在同一个实例里**立刻可触发（**不重建** ✓，即 H1 活读 ✓）。
4. **红**：反向变异（删掉域检查／owner 检查／`drives:false`／错拼一个模板变量）⇒ `tests/vmu-assistant-*.test.mjs` **具名红** ✓。
5. **留痕**：每次汇报一条 `what:'create'`、每次改参一条 `what:'update'`（带 `subject`／`from`／`to`／`by`／`reason` ✓）。

### 19.9 未核项（**编号登记见 `14-§2`**）

1. **回合结束钩子** ✅ **Round 3 实测的 F5 已修，Round 4 结清** —— 判据改成"**面已发布**"并在 `install()` **之后**挂载 ⇒ **只装载 pack 也挂**（硬断言 ✓）；挂载仍**由声明驱动**（未声明 ⇒ 不挂，零机制 ✓）。
2. **`vmu.report.*` 的 schema 行与 `04-§11` 生成表**：由内核管线加键、`regen-all` 出表 ✓（本卷不手写表 ✗）。
3. **助手人设的"语气与篇幅"未定** ✗：本节只保证**必须说什么**（身份/职责/边界），措辞与长度属 pack 编辑范畴 ✓。
4. **参数域的"谁能改"只有一条 owner 口径** ✗：目前是**字符串匹配**（`whoMayChange` 列表 ✓），没有"角色槽位"级解析（与 `vmu.safety.delegableKeys` 的交界未定 ✓）。
5. **汇报与人类审批的联动未做** ✗：汇报**不触发**任何审批流（`vmu.safety.approvalRequired` 与它正交 ✓），是否需要"高危参数改动的审批"未决 ✓。
6. **投递（transport）** ✅ **Round 4 结清（F2 关闭）**：部署可用 **`config.deliver`** 交进**宿主自己的投递函数**；有 ⇒ `delivered:true` 且注带 `drives:false`（**真机入口**实测 ✓），无 ⇒ **具名拒 `VMU_REPORT_NO_TRANSPORT` 且**仍留痕（边界硬钉 ✓）。**不做**的事：入口不自己从 `ctx.get('subagents')` **猜**一个 envelope（report/member 的信封与 turn 的 `{turn,text}` 不同形 ⇒ 猜就是"假装发出"✗）。
7. **活读键的回执评分** ✅ **Round 4 结清（F3 关闭）**：`liveReadBy` ＋ `appliesAt` 双披露 ＋ 活读键 `requiresRestart:false`／`applied:'immediate'` ⇒ 硬断言"**不得低报也不得高报**" ✓。
8. **真宿主切片** ⚠（**Round 4 B；最终口径：路由已证／多面点亮未建立／未跑第二会话**）：测试已就位 `tests/vmu-assistant-host-slice.test.mjs`（**6 passed, 0 failed, 5 not-run, exit=0**；`--require-host` ⇒ **exit=1**，证明 skip 是真的）。**观测**：`dsh headless` 按设计**拒绝带 agent preset 的会话**（安装件 `dsh-headless/lib/index.js` 的 `assertAdoptable`：`if (preset !== void 0) throw … "which the one-shot runner does not compose"`），而助手面**就是**一个 preset；把插件当**顶层行**挂载也不行（实测 `Error: cannot get property "systemPrompt" without inject`，该注入由 preset 作用域提供）；provider 侧装了 `dsh-opencode-go` 且凭据已复制进隔离 home 仍 `NO_ADAPTER`（插件 README 对无头流程要求 `OPENCODE_API_KEY`）。⇒ **唯一可行路由＝跑着的 scratch `dsh web` ＋ `scripts/dsh-drive.mjs --preset vibe-math-vmu`**。**不支持**：真宿主上"多面点亮"（`vibe_vmu_report` 可达／阈值真触发／参数面留痕／两条人设通道到达真模型）**未建立**——零声明下只发布 `vibe_vmu_status`（**机制正确、非缺陷**，verify 同实例实测 `tool/call`@seq16 L134）。**非结果**：**未跑第二会话**（Lead 裁决降本；且"声明能否打到 `preset-vibe-math-vmu` 的 `config.plugins` 内层行"未确认，`--dump-config` 不显现内层 config）——**"未跑"不是"通过"** ⇒ `14-§2` **U14「Round 5 用可声明 overlay 再跑一次助手面真机切片」**（复跑须按 `docs/slv-playbook.md` §2/§4：首条 user message 写"模拟测试"、驱动显式传 `--max-tokens`；结论按 §7/§8 分"观测（带 `seq`/行号）／支持／不支持／非结果"）✓。

### 19.10 Round 3–4 真机验收（**端到端**；命令与读数）

> 判据：task-22（Round 3）——A 三类触发被**真事件**驱动一次（**不直接调 `tick()` 当证据**）、B 参数面**真生效**、C 两道闸**可关且零注入**、D 两通道**逐字**；task-29（Round 4）——**F2 关闭**（有 transport ⇒ 真的发出）。全部经**真机入口**（`entry.apply(ctx, { packs:['v5r'] })`）与**宿主注册的工具面**，不由手工装配代替 ✓。

| 项 | 驱动者（**真机路径**） | 证据 |
|---|---|---|
| **A 事件触发** | 宿主 `agent/turn-stopping`（**入口自己注册的监听器**） | 声明 `event:'turn-end'` 的报送 ⇒ `fired ×1` ＋ `trace` 行 ＋ 审计 `what:'create'`（`subject:'report:e2e-event'`，`drove:false`）✓ |
| **A 周期触发（路径 1）** | 同一宿主钩子（两次回合边界之间**真实过了 40ms**，`everyMs=5`、`minIntervalMs=0`） | 第一次**武装**不触发、第二次触发 ⇒ `trace` 里 `trigger:'period'` ✓ |
| **A 周期触发（路径 2 兜底）** | 工具面 `vibe_vmu_report {action:'tick'}` | 同一条声明被触发 ✓ |
| **A 阈值触发** | 工具面 ＋ **真度量**跨线／线下不触发 | `【阈值汇报】9 件成果` 逐字进正文；线下 0 触发 ✓ |
| **B 参数面** | 工具 `params`／`set` → **内核 `setSettingsValue`** | 下一**真实回合**（`kernel.turn.open`＋`assemble`）读到新值 ✓；审计 `what:'update'`（key／by／reason）✓；越域 ⇒ `VMU_REPORT_PARAM_NOT_DECLARED`、越权 ⇒ `VMU_REPORT_PARAM_NOT_ALLOWED`，且**零写入**（审计只有 1 行 update）✓ |
| **C 汇报开关** | 工具 `set vmu.report.enabled=false`（该键在域内） | 真实回合边界**零触发零留痕** ✓；`problems` 具名 `VMU_REPORT_NOT_ENABLED` ✓；`emit` 同码拒 ✓；开回后**下一回合立刻**恢复 ✓ |
| **C 人设段开关** | 提示词管线 `disable/enable` | 文本＋标题**整段消失**（零注入）✓；`enable` 后 **13056 字符逐字节复原** ✓ |
| **D 两通道逐字** | `node tests/vmu-assistant-e2e.test.mjs --print` | system prompt 含所办三段人设（1453 字符）＋ 回合面含 `【汇报纪律：本所「institute」】` 与 `sources.section='v5r-report-duty'` ✓ |
| **D＋F2 投递（Round 4）** | **真机入口 ＋ `config.deliver`**（宿主自己的投递函数） | 真实回合边界触发的**每一条**报送 `delivered:true`、`refused:null`，部署侧**恰好一条 note/次**；note 带 `to:['office']`／`channel`／渲染正文／`drives:false` ✓；`status().transportInjected===true` 且 `seams.deliver===true`（一个事实一个家）✓；**抛错的 transport** ⇒ note 记 `error.code` 并计 `failures`（不丢、不谎称已发）✓ |

**命令与读数** ✓：`node tests/vmu-assistant-e2e.test.mjs` ⇒ **55 passed, 0 failed, exit=0**；`--strict-findings` ⇒ **55 passed, 0 failed, exit=0**（**全绿**：Round 3 的两条待落项已关闭，机制保留 ⇒ 将来一有"待落项"就会具名红）✓；`node tests/vmu-assistant-report.test.mjs`／`-assembly`／`-systemprompt` ⇒ 93／39／15 全绿 ✓；`node tests/vmu-paper-consult.test.mjs` ⇒ 40／0 ✓；`node tests/vmu-assistant-host-slice.test.mjs` ⇒ **6 passed, 0 failed, 5 not-run, exit=0**（`--require-host` ⇒ exit=1，证明"未跑"不是悄悄通过 ✓）。

**Round 3 发现（F1–F5）→ 最终口径（**五条全部结清，Round 5 冻结**）**：

| 编号 | 事实（实测） | 最终处置 |
|---|---|---|
| **F1** ✅ | 工具面在**构造期**解析，而 pack **清单** settings 在装载时才施加 ⇒ 只装载 pack 时 `vibe_vmu_report` **不被发布**（汇报却被武装）✗ | core **按根因修**（面解析移到 pack settings 之后）；本卷**硬断言** ✓ —— **最终口径：面解析在 pack settings 之后**（不是"pack 要往 `defaults.json` 塞家族键"）✓ |
| **F2** ✅ | 入口**不注入**内核级 `deliver` ⇒ 报送触发并留痕，但每条具名拒 `VMU_REPORT_NO_TRANSPORT`（与 `03-§8` 一致，**不是缺陷**） | **Round 4 结清**：入口放行 **`config.deliver`**（宿主自给投递函数）⇒ 真机入口实测"有 transport ⇒ `delivered:true`、note 带 `drives:false`、一条 note/次"；**无 ⇒ 具名拒＋仍留痕**（边界硬钉 ✓）；抛错的 transport 记码计数 ✓ |
| **F3** ✅ | 回执按**声明档位**打分：活读键报 `requiresRestart:true`，而同会话真实回合已读到新值 ✗ | **Round 4 结清**：core 落 `liveReadBy` ＋ `appliesAt` 双披露 ＋ 活读键 `requiresRestart:false`／`applied:'immediate'` ⇒ **硬断言"不得低报也不得高报"** ✓ |
| **F4** ✅ | v5r 的 C-30 卡的是 **office 自己定稿前必须先咨询所内**；而 `officeConsultExemptRoles` 默认 `['office']` 恰好豁免了原场景 | Lead 裁决：默认改 `[]`（**不豁免**，与 `hold` 同一条保守纪律）；schema 与 pack defaults **都已改为 `[]`** ✓；本卷按此断言（"没声明 ⇒ office 也被卡" ✓） |
| **F5** ✅ | 与 F1 同型更深一层：宿主 `agent/turn-stopping` 周期时钟的挂载判据是**构造期** `settings` ⇒ 只装载 pack 时时钟不挂 ✗ | **Round 4 结清**：判据改成"**面已发布**"且在 `install()` 之后挂 ⇒ pack-only 也挂（**硬断言** ✓）；未声明仍不挂（零机制 ✓） |

### 19.12 真宿主助手面（**Round 5 冻结口径：观测／支持／不支持／非结果**）

> 为什么单独一节：真机结论**必须按四段分开写**（`docs/slv-playbook.md` §7/§8 同一条纪律）——"看到的"、"立住的"、"没立住的"、"根本没跑"是四件事，混写就会把"未跑"读成"通过" ✗✓。

**观测（可复核，逐条带出处）**
1. `dsh` **0.2.0-rc.2** 在 PATH；`headless` 模板可组合；隔离 `DSH_HOME` 可建且**不是**操作者的 ✓。
2. **`dsh headless` 拒绝带 agent preset 的会话**：安装件 `…/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-headless/lib/index.js` 的 `assertAdoptable`：`if (preset !== void 0) throw … "which the one-shot runner does not compose"`。⇒ 无头一次性 runner **不能**承载助手面（助手面就是 preset）✗✓。
3. 把 vmu 插件当**顶层行 `insert`** 可被挂载，但运行时报 `Error: cannot get property "systemPrompt" without inject`（该注入由 **preset 作用域**提供）⇒ 顶层行**不是**可用路由 ✗✓。
4. provider 侧：装好 `dsh-opencode-go`（0.1.22）、凭据已复制进隔离 home，仍 `NO_ADAPTER: no adapter registered for provider "dsh-opencode-go"`；插件 README 对**无头**流程要求 `OPENCODE_API_KEY` 在环境（凭据库那条给 **web** profile）✗✓。
5. **零机制在真机被确认**（verify，同实例）：零声明时一次真实回合里 `tool/call`@**seq16 L134** 只有 `name:"vibe_vmu_status"`、`tool/result`@**seq17 L135**；provider/model＝`dsh-opencode-go`／`deepseek-v4.1-flash`；一回合 in 23006／out 993／total 31807、21s ✓。
5b. **Round 5 复测（SLV §2/§4 合规，同一路由）**：`user/message`@**seq 8 / L12** 含原句「**模拟测试**」✓；`tool/call`@**seq 16 / L163** `name:vibe_vmu_status` ＋ `tool/result`@**seq 17 / L164** ✓；模型自述 `vibe_vmu_wait` **不在工具清单**（**多面未点亮**，具名）；`--timeout 300 --max-tokens 40000` ⇒ `tokenCap:40000`、`tokenCapHit:false`；tokens in 29508／out 719／total **31379**、15s ✓。**注意**：这条是 verify 的**框架面**会话；我的**助手面**会话本轮**未跑**（见"非结果"）✓。
6. **唯一可行路由**＝跑着的 scratch `dsh web` ＋ `scripts/dsh-drive.mjs --preset vibe-math-vmu`（本卷测试只**驱动**、不起服务）✓。
7. **U14（多面点亮）机制已进仓，但实测【会覆盖 preset 本体】⇒ 多面点亮仍【未建立】** ✗：`docs/02 §10` 记载 `preset-declaration` 的声明行新增 **`overlay`**（id 键控局部 config，默认缺省＝零机制）。**本卷两次实测（免费 `--dump-config`，计数可比）**：
   - **纯配方（照 docs/02 抄：只给 `config.overlay`）⇒ 覆盖** ✗：带该 patch 时 `^- id: preset-vibe-math-vmu` 行数 1，但**载荷 `id: vibe-math-vmu` 行数 1→0**（`name`／`description`／`order: 25`／`plugins:` 全消失）⇒ 真机会话报
     ```
     session/create → ok:false  error:{code:"agent-preset/not-found", message:"Unknown agent preset: vibe-math-vmu",
       available:["vibe-math-v2","vibe-math-v3","vibe-math-v4","vibe-math-v5","vibe-math-v5r","standard","ptc","minimal","cordis"]}
     ```
     （**该转录即本缺陷的实证**：`available` 里**没有 vmu**）✗。**先前"dump 里出现 `faces`"是假阳性** —— 那是 **patch 原文被打印**，不是合并结果 ✗✓。
   - **本卷的非破坏性绕行（仅测试侧，未改任何仓内文件）⇒ 身份保住 ＋ 回合真的跑起来** ✓：把声明行**逐字重述**（`id/name/description/order/plugins` 全带上）再追加 `overlay`，程序化生成 patch（**仓库外，实测用**：`D:\_tmp\build-overlay-full.mjs`，已随临时目录清理；当年从包内 `cordis.patch.yml` 抽取该条目）：dump ⇒ 载荷 `id` 行数 **1** ＋ `overlay:` 行数 **1** ＋ `plugins:` 行数 10 ✓；`session/create` ⇒ **`ok:true`** ✓。
   - **但这次真机会话里一个面都没被调用**：`{"step":"done","sessionId":"session-edb4dd16-60b9-47bd-86a9-60ca5f5c080d","preset":"vibe-math-vmu","durationSec":6,"tokens":{"uncachedInputTokens":6756,"outputTokens":449,"cacheReadTokens":1024},"tokenTotal":8229,"tokenCap":40000,"tokenCapHit":false,"transcriptEvents":22,"toolCalls":0,"tools":[]}` ⇒ **`toolCalls:0`／`tools:[]`**，即宿主侧五条事实**一条都没建立** ✗。原因未定（两条候选：① overlay 的**嵌套形态** `vmu.tools.faces` 不是入口 `readSettings` 读的**点号键**，声明没到达；② 模型行为）——**预算内未定**，据实记为未定 ✗✓。
   - **据实披露**：该会话实际落在 **`deepseek-official`／`deepseek-flash`**（本卷起服务时只带了 overlay patch、**漏了** provider/model 补丁），**不是** opencode-go；token **in 6756／out 449／total 8229**（cap 40000 未触）✓。
   ⇒ **口径：机制已进仓但实测会覆盖 preset 本体 ⇒ 多面点亮仍【未建立】**；该缺陷**已被第二设计取代**（见观测 8：独立 overlay 行，preset 行永不被动）✓。
8. **U14 第二设计（独立行 `vibe-math-vmu-overlay`）：状态＝复核中（既不是"可用"也不是"失效"）** ⚠：Lead 落地第二设计（该行随包 `config: {}`＝零机制；deployment 打**这一行**，preset 行的 config **永不被动**）。
   - **身份** ✓（实测事实）：带 deployment patch 后**载荷 `id: vibe-math-vmu` 仍在**、`plugins:` 仍 10 条、**第一设计的 `agent-preset/not-found` 不复现** ✓。
   - **观测（事实）**：`--dump-config` 下**三种情况**（不带 patch／带 overlay2／带 bogus key）**内层行 `- id: vibe-math-vmu` 的 config 块逐行相同**；带 patch 多出的 15 行**全是 overlay 行自己的 payload**；未匹配 key 在 stderr 上**无告警** ✓。
   - **⚠ 判据更正（重要）**：**`--dump-config` 是 loader 树，不是运行时定义**——第二设计的合并发生在 `preset-declaration` 的**注册期**，**dump 照不出来** ⇒ **不得由"dump 里内层块没变"推出"机制不工作"**（本卷先前那次"dump 出现 `faces` ⇒ 已合并"是假阳性；用同一条 dump 反推"未合并"**同样不成立**）✗✓。
   - **core 的运行时证据（verify 正在独立复核）**：无 overlay ⇒ 注册定义与随包**逐字节一致**；有 overlay ⇒ 内层行**真的合并** `tools.faces`／`packs.active` 且**保留原字段**、其它行不动、定义里**不残留** `overlay`／`overlayFor`；未匹配 ⇒ **具名告警且定义不变**；被覆盖 ⇒ **具名告警且不注册**。verify 已索取探针，将**落成仓内常驻测试**并独立复跑（不只看 core 的 16/0）⇒ **在它独立复核通过之前，本卷只写"复核中"** ✓。
   - **core 的免费读数（供对照，本卷未独立复算）**：A（不带 patch）**3407 行** / B（带 patch）**3422 行**；**preset 行整块 203 行 A vs B 逐字节相同** ✓（身份与 `plugins` 完好）；差异只在 overlay 行（`config: {}` → payload）；**运行时探针 16/0**（含"不利行序"）✓。
   - **更正后的部署配方**（本卷据此准备，等 verify 发 port/token）：`docs/02 §10` / core 的更正版——**只打 overlay 行**，`preset` 行**永远不要打**：
     ```yaml
     # <你的临时目录>/vmu-overlay.yml   （仓库外，实测用）
     - id: vibe-math-vmu-overlay
       config:
         overlayFor: vibe-math-vmu
         rows:
           vibe-math-vmu: { vmu: { tools: { faces: ['*'] }, packs: { active: ['v5r'] }, report: { enabled: true, minIntervalMs: 0 } } }
     ```
   - **待办**：复核通过后，用 Lead 追加授权的**那一次**会话跑助手面（**务必同时带 overlay ＋ provider/model 两补丁**，提示词**显式点名** `vibe_vmu_status`／`vibe_vmu_chat(action:"list")`／`vibe_vmu_panel(action:"status")`／`vibe_vmu_report(action:"status")`，并把每条 `tool/call`／`tool/result` 的 **`seq`＋行号**回报 verify 以回填矩阵 §9.1／证据 §8）✓。
9. **★ Round 5 最终真机读数（verify 独立复核"机制可用"后、Lead 追加授权的那一次会话；本轮决定性证据）**：实例由 verify 起（`--port 7798`，启动补丁＝provider default-model ＋ **仓库外，实测用**的两份 patch：`D:\_tmp\opencode-go.patch.yml` ＋ `D:\_tmp\vmu-overlay-v2.yml`＝**只打 overlay 行**）；我按 SLV §2/§4 跑**一次**（首行「模拟测试」、`--max-tokens 40000`、提示词**显式点名**各面）。**证据在会话日志里，不在 `--dump-config` 里**（多帧 zstd 解码）：
   - **provider/model ＝ `dsh-opencode-go`／`deepseek-v4.1-flash`** ✓（上次漏 provider 补丁的问题已修复）；
   - `user/message`@**L10 seq=8**（首行即「模拟测试」✓ §2 落点）；`assistant/message`@L17 seq=15；**`tool/call`@L18 seq=16 `name=vibe_vmu_status`**；**`tool/result`@L19 seq=17**；`assistant/message`@L22 seq=20；
   - **日志里出现过的 `vibe_vmu_*` 名（声明／调用）只有 `vibe_vmu_status`** ✗；`toolCalls=1`（**不是 0**——先前"0"是驱动汇总口径＋我读日志过早所致）；
   - **模型原话（决定性）**：**"I only have vibe_vmu_status. … These tools are not in my available toolset. … The others don't exist."** ⇒ **这是"发布问题"，不是"提示词问题"**（Lead 要求的区分，由模型自述直接定性）✓；
   - tokens in 23077／out 1400／cacheRead 7680（总 ≈ **32,157**），`tokenCap 40000` 未触 ✓。
10. **★★ 目标 6 真机终态（Round 6；core 入口修复落地后）——多面点亮【建立】✅**：实例由 verify 起（`--port 7801`；补丁＝provider default-model ＋ `opencode-go.patch.yml` ＋ `vmu-overlay-v2.yml`＝**只打 overlay 行**）；我按 SLV §2/§4 跑**一次**（首行「模拟测试」、`--max-tokens 40000`、提示词**显式点名** status→chat→panel→report status→report tick）。**证据＝会话日志（多帧 zstd），不是 dump**：
    - **provider/model ＝ `dsh-opencode-go`／`deepseek-v4.1-flash`** ✓（`request/context`@L14）；
    - **首条 user message ＝ L10 seq8**（「模拟测试」✓）；tokens in 42778／out 1086／cacheRead 26624；**`tokenCapHit:true`**（`turn/end`@L35 `aborted/user` ＝驱动按上限取消）⇒ **按 playbook §8，触上限本身不算通过**，本结论只取事件级事实 ✓；
    - **宿主真发给模型的工具清单（`request/header.tools`）＝ 78 个工具，其中 `vibe_vmu_*` 52 个** ✓（对照 Round 5 的 **1 个**）——含 `vibe_vmu_report`／`chat`／`panel`／`set`／`turn`／`meeting`／`mailbox`…；
    - **5 对真实 `tool/call`＋`tool/result`**（全带 `seq`＋行号）：`status`@L18 seq16→@L19 seq17（49,929 字符回执）；`chat`@L20 seq18→@L21 seq19（`total:0`）；`panel`@L22 seq20→@L23 seq21；**`report`(status)**@L24 seq22→@L25 seq23（`enabled:true, declared:0, drives:false, neverDrives:true, auditInjected:true, enforced:[11 键], note:"no reports are declared: nothing is reported (zero mechanism)"`）；**`report`(tick, metrics={artifacts:9})**@L29 seq27→@L30 seq28（`declared:0, fired:[], drives:false`）✓；
    - **core 的 task-41 修复端到端验证** ✓：`settingsMerge.sources = {vmu.tools.faces:"config", vmu.packs.active:"config", vmu.report.enabled:"config", vmu.report.minIntervalMs:"config"}`、`settings.keys=4`、`resolved.vmu.tools.faces=["*"]`／`vmu.packs.active=["v5r"]`（Round 5 同字段是 `sources:{}`／`keys:0`）⇒ **嵌套声明这次真的到达入口**，51 面因此发布 ✓。
    ⇒ **终态**：**多面点亮【建立】✅**（发布 52 面 ＋ 4 个不同面真被调用）；**助手面 `vibe_vmu_report` 可达【建立】✅**（发布＋真调用＋完整回执）；**阈值真触发【未建立】——原因是部署未声明任何报告（`declared:0`，零机制正确）** ✗✓；**参数面留痕【未行使】**（`vibe_vmu_set` 已发布但本轮未点名）✗✓；**回合面／system prompt 面【本轮未行使】**（提示词未含该问；装配级双通道逐字证据仍绿）✗✓。**下一步（部署/提示词层面，非机制缺陷）**：overlay 里声明一份报告 ＋ 提示词补 `set` 与人设问句，再跑 1 次即可把"阈值/参数/两通道"三条也钉上 ✓。

12. **★★ 第 6 次真机会话（Round 7 · task-49）——三条全部【实测具备】✅ 目标 6 至此闭合**：实例 `--port 7803`（补丁＝provider ＋ `opencode-go.patch.yml` ＋ `vmu-overlay-v3.yml`）；**提示词重排**（把 49,929 字符的 `vibe_vmu_status` 从第 1 步挪到**第 4 步**，要证的三件事放最前）＋ **`--max-tokens 400000`** ⇒ **`tokenCapHit:false`**（前两轮 40k／120k 均被切断）。
    - **记账**（`session-55ab3f49-8a9c-4a7b-a942-8bb4a4eb07a8`，50 events）：首条 user message **L10 seq8**；6 对调用：`report`(status) **L19 seq17→L20 seq18**（`declared:1, armed:1`）｜`report`(tick) **L24 seq22→L25 seq23**｜`vibe_vmu_set` **L29 seq27→L30 seq28**｜`vibe_vmu_status` **L34 seq32→L35 seq33**（49,929 字符；`settingsMerge.sources` 5 键含 `vmu.report.reports:"config"`、`keys=6`）｜`pwsh`×2（模型自己量字符）；发布 **78 工具／`vibe_vmu_*` 52 个**；tokens in 48690／out 6138／cacheRead 204800（cap 400k 未触）✓。
    - **① 阈值真开火 ✅**：tick 回执 `"declared":1, "fired":[{"name":"artifacts-threshold","trigger":"threshold","text":"【成果阈值】artifacts=9 已达阈值 5","drives":false,"refused":{"code":"VMU_REPORT_NO_TRANSPORT",…}}], "skipped":[], "audit":{"appended":true}, "drives":false` ⇒ **`fired[]` 非空** ✓；投递被**具名拒**（`VMU_REPORT_NO_TRANSPORT`，`delivered:false`）＝**F2 的诚实边界**（scratch 部署未注入 transport），"开火"与"投递"分列 ✓。
    - **② 参数面留痕 ✅**：`vibe_vmu_set` 回执 `{"ok":true,"key":"vmu.turn.instituteName","value":"Slice-Institute","hot":"H2","who":"office","ownerCheck":"exempted (no \`by\` given: office path, DISCLOSED)","requiresRestart":false,"source":"runtime"}` ⇒ 真写入、可追（`source:"runtime"`）✓。**发现（给 core）**：该工具**已发布 schema 不收 `by`/`reason`**（`additionalProperties:false`，模型原话如此）⇒ 归属只能靠 `who`／`ownerCheck` 披露；建议 schema 收这两个字段，或把归属改由审计行承载。
    - **③ 两通道 ✅**：模型原话末段 **"I am the institute office (assistant/external interface), not a member, and I do not vote."** ⇒ **system prompt 面真的到达模型**（它按所办身份自述且自陈不投票）✓；回合面（`v5r-report-duty`）装配级逐字证据（13056 字符）仍在。
    - **★ 工程收获（本轮真正的修正）**：三条实质断言原先跑在**驱动 stdout** 上，而**工具回执只在会话日志里**（驱动不回声结果）⇒ 首跑 13/7/3 中那 3 红是**假阴性**；改为从 `sess.rawResults`／`sess.assistant` 断言后，**新增 `--session <id>` 离线复评**用**同一套断言**重评**已录会话**（不花会话）⇒ **15 passed, 0 failed, 0 not-run, exit=0** ✓✓。
    - **★ 正向新事实**：status 回执自曝 **`settingsMerge.sources`＝5 键（含 `vmu.report.reports:"config"`）**、**`settings.keys=5`**、`settingsUnparsed=null`、**`report.status: declared=1`** ⇒ **阈值报告声明真的到达入口并被接受**（core 的嵌套展平连"对象数组叶子"也对）✓。
    - **三条为何仍未建立**：**`tick` 与 `vibe_vmu_set` 根本没被调用**（会话在第 4 步后被上限切断），故"阈值真触发／参数面留痕／两通道自述"**无观测**；**根因是我的提示词成本**——`vibe_vmu_status` 的 49,929 字符回执被后续每步从缓存重读（cacheRead 110,976），在 root+child 合计口径下 120k 上限提前触顶 ✗✓。
    - **修法（下一轮若再跑）**：提示词**不要**把 `vibe_vmu_status` 放最前（或只取一个短 action），省掉这 5 万字符；`--max-tokens` 保持有界即可 ✓。
    ⇒ **终态（Round 6）**：**多面点亮【建立】✅（52 面发布＋4 面真调用）／助手面可达【建立】✅／声明到达入口【建立】✅**；**阈值真触发、参数面留痕、两通道＝【未建立/未行使】（`tokenCapHit:true` ⇒ 按 §8 NON-RESULT，不写成通过）** ⇒ **具名收口** ✓。
13. **★★ 第 7 次真机会话（Round 8 · task-64）——"投递真的送达"＝真机已证 ✅ ＋ 部署侧可复制配方（目标 6 最后一格闭合）**：实例 `--port 7804`（补丁＝provider ＋ **`vmu-overlay-v5-transport.yml`**＝报告声明与 transport **合成一份**）。
    - **为什么先否掉"声明式 transport 名"**：全仓唯一来源是 `config.deliver`（`vibe-math-vmu.js:475`），入口**故意不从宿主猜**（`vibe-math-vmu.js:470-474`：*"We do NOT invent one from `ctx.get('subagents')` … guessing a shape would be exactly the 'pretend it was delivered' failure"*）⇒ **Lead ① 的字面形态不存在**；**但** core 的 `preset-declaration.js:70-78` `deepMerge` **对非对象叶子原样返回**，而 profile patch **支持 `!!js`** ⇒ **部署可以在 overlay 里携带函数**（免费 `--dump-config` 已见 `deliver: !!js >- …` 落在 overlay 行 config、preset 行整块不变）✓。
    - **配方（部署侧，一份 patch）**：`- id: vibe-math-vmu-overlay` → `config: { overlayFor: 'vibe-math-vmu', rows: { 'vibe-math-vmu': { deliver: !!js '(report) => console.log("[vmu-report-sink] " + …)', vmu: { tools:{faces:['*']}, packs:{active:['v5r']}, report:{ enabled:true, minIntervalMs:0, reports:[{name:'artifacts-threshold', trigger:{kind:'threshold',metric:'artifacts',op:'gte',value:5}, channel:'log', template:'【成果阈值】…'}] } } } } }` ✓。
    - **边界（三条分开写、不混）**：① **声明式名解析＝不存在**；② **overlay 携带 scope-free 函数＝已验证**（`!!js` 在 **overlay 行自己的 realm** 求值 ⇒ 只能用不依赖宿主服务的 sink，如 `console`／`fetch`；本次实测的就是 `console`，与 `channel:'log'` 语义相配）；③ **服务型 transport（写 inbox／`subagents.sendMessage`／需 `ctx` 的 webhook）＝仍需宿主代码注入**（在配置 vmu 那一行的宿主代码里给 `deliver:` 一个函数，例：`deliver: (report) => ctx.get('subagents').sendMessage({ to: report.to, text: report.text, payload: report.payload })`）——**overlay 里不要试**（realm 不对，正是 core 警告的那类静默错）✗✓。
    - **真机读数**（`session-8c105c47…`，50 events）：首条 user message **L10 seq8**；调用 `report`(status) **L19 seq17**／**`report`(tick) L24 seq22**／**`vibe_vmu_set` L29 seq27**／`status` **L34 seq32**（`settingsMerge.sources` 5 键含 `vmu.report.reports`）／`pwsh`×2；发布 **78／52**；tokens in 43900／out 2799／cacheRead 203264、**`tokenCapHit:false`** ✓。
    - **★ 投递证据**：tick 回执 **`"fired":[{…,"delivered":true,"drives":false,"error":null,"refused":null}], "delivered":1, "failures":0, "audit":{"appended":true}`** ⇒ **`delivered:true` 且无 `VMU_REPORT_NO_TRANSPORT`**（与 R7 两态对照）⇒ **F2 两半均为真机已证** ✓✓。**独立旁证（第三方，已到）**：vmu-verify 从**其 7804 服务 stdout**读到**恰好一条** `[vmu-report-sink] {"name":"artifacts-threshold","to":[],"channel":"log","text":"【成果阈值】artifacts=9 已达阈值 5","drives":false}` ⇒ 与回执 `name`/`channel`/`text`/`drives` **逐字一致、且只一条**（无重复投递）✓✓。
    - **顺带闭合**：`vibe_vmu_set` 回执本轮为 `…,"ownerCheck":"identified","by":"office","reason":"scripted slice"` ⇒ **R7 的"schema 只收 {key,value}"已由 core 修掉** ✓；人设原话本轮为 **"…not a voting member; I don't vote."**（断言正则原先不认缩写 ⇒ 已修为 `(do not|don'?t|does not|doesn'?t|not)\s+vote`）✓。
    - **离线复评**：`--session 8c105c47… --expect-delivery` ⇒ **16 passed, 0 failed, 0 not-run, exit=0**（实跑首过 16/1 的唯一红是上述正则假阴性）✓。
1. 助手面在**装配级／单元级全绿**：`vmu-assistant-e2e` **55/0**（`--strict-findings` 亦 **55/0**）、`-report` 93/0、`-assembly` 39/0、`-systemprompt` 15/0、`vmu-paper-consult` 40/0，`check-docs` PASS ✓（见 §19.10 读数）。
2. **F2 关闭**：真机入口 ＋ `config.deliver` ⇒ 触发即 `delivered:true`／note 带 `drives:false`／部署侧**恰一条 note/次**；**无 transport ⇒ 具名拒 `VMU_REPORT_NO_TRANSPORT` 且仍留痕**（边界硬钉）✓。
3. **F1／F3／F5 关闭**（见 §19.10 表）：面解析在 pack settings 之后；活读键**不得低报也不得高报**；周期时钟判据＝**面已发布**且在 `install()` 之后 ⇒ pack-only 也挂 ✓。
4. **工具已就位且自证**：`tests/vmu-assistant-host-slice.test.mjs` ⇒ **6/0/5 not-run exit=0**，`--require-host` ⇒ **exit=1**（"未跑"不是悄悄通过）；并已按 `docs/slv-playbook.md` §2/§4 备好（首行"模拟测试"标记 ＋ 显式 `--max-tokens`）✓。

**不支持（**未**建立，不许当通过）**
1. **【Round 7 已关闭】阈值真触发／参数面留痕／两通道**：观测 10 因部署未声明报告（`declared:0`）、观测 11 因回合被 120k 上限切断 ⇒ 当时均"未建立"；**观测 12 用重排提示词＋400k 上限一次钉上三条**（`fired[]` 非空且 `drives:false`／`vibe_vmu_set` 回执 `hot:H2`＋`source:"runtime"`／模型自述"I am the institute office … I do not vote"）⇒ **现为【实测具备】✅**。
2. **【Round 8 已关闭】"投递"**：观测 10/11/12 里投递都是**具名拒 `VMU_REPORT_NO_TRANSPORT`**（F2 边界、非缺陷）；**观测 13 用 overlay `!!js` 注入 scope-free transport（`console` log sink）⇒ `delivered:true`、`refused:null`、`delivered:1`、`failures:0` ＝真机已证 ✅**。**仍不支持的两条要分清**：① **"声明式 transport 名由 pack/宿主解析"＝不存在**（无读者）；② **overlay 携带"服务型" transport（需 `ctx`／inbox／subagents）＝未验证且不建议**（`!!js` 在 overlay 行自己的 realm 求值）⇒ 那一类**仍必须宿主代码注入**（示例见报告 §2.3）✗✓。
3. **"上限"性质（历史）**：观测 10/11 两轮 `tokenCapHit:true`（40k／120k，`turn/end.reason=aborted/user`）⇒ 按 `docs/slv-playbook.md` §8 **触上限本身不算通过**；观测 12/13 均 `tokenCapHit:false`（cap 400k）✓。
4. **历史教训（保留为判据纪律）**：U14 第一版设计是实测缺陷（patch 声明行 ⇒ 覆盖 preset 本体 ⇒ `agent-preset/not-found`）；第二版设计**注册期合并**已被 verify 独立复核（21/0 常驻测试）而**入口侧**由 core task-41 修好（观测 10–13 端到端验证）；**`--dump-config` 是 loader 树不是运行时定义**，且**不得用全文计数**当判据（本卷两次假阳性都源于此）✗✓。
5. **成本教训（已落地为修法）**：`vibe_vmu_status` 回执 **49,929 字符**被后续步骤从缓存重读（cacheRead 110,976）⇒ 观测 11 触顶；**修法＝提示词别把 `status` 放最前**（观测 12/13 均照此做并成功）✓。
6. **★ 判据纪律（Round 7 新增，最有价值）**：**工具回执只在会话日志里，驱动 stdout 不回声结果** ⇒ 把断言写在驱动输出上会产生**假阴性**（观测 12 首跑 3 红、复核全绿；观测 13 首跑 1 红＝正则不认 `don't vote` 缩写）⇒ **断言必须读 `sess.rawResults`／`sess.assistant`**，并提供 **`--session <id>` 离线复评**（同一套断言复评已录会话、不花会话）✓。

**已建立（目标 6 的正面终态——**四条维度 ＋ 投递，全部真机**）**
1. **多面点亮 ✅**：真机发布的 `vibe_vmu_*` 面 **52 个**（Round 5 是 1 个），**4 个不同面真被调用**（`status`／`chat`／`panel`／`report`），每对 `tool/call`+`tool/result` 全部带 `seq`＋行号 ✓（观测 10/12/13）。
2. **助手面可达 ＋ 阈值真开火 ✅**：`vibe_vmu_report` 发布＋真调用（status／tick 各一对）；tick 回执 `"fired":[{…"text":"【成果阈值】artifacts=9 已达阈值 5","drives":false}]`、`audit.appended:true` ✓（观测 12/13）。
3. **参数面留痕 ✅**：`vibe_vmu_set` 回执 `ok:true, hot:"H2", who:"office", ownerCheck:"identified", by:"office", reason:"scripted slice", source:"runtime"` ✓（观测 12/13；R7 的 schema 限制已由 core 修掉）。
4. **人设两通道 ✅**：模型自述 **"I am the institute office (assistant/external interface), not a voting member; I don't vote."** ⇒ system prompt 面真的到达模型 ✓（观测 12/13）。
5. **★ 投递真的送达 ✅（Round 8 闭合）**：tick 回执 **`"delivered":true, "refused":null, "delivered":1, "failures":0`** ⇒ **F2 两半均为真机已证**；配方与三条边界见观测 13 ✓。
6. **入口两形态 ✅**（core task-41）：`settingsMerge.sources` 5 个 `source:"config"` 的点号键（含 `vmu.report.reports`）、`settings.keys=5/6` ✓。
7. **零机制红线 ✅**：无声明 ⇒ 恰 1 个工具（verify 的 16/0 断言 ＋ 本卷 §2 对照断言）；**声明后**才 52 面 ✓。

**非结果（**不是通过**）**
1. **助手面会话：跑了 1 次，但一个面都没被调用 ⇒ 五条事实仍"未建立"** ✗✓：Round 4 曾按降本裁决不跑；Round 5 在 U14 机制进仓后，我用**非破坏性绕行 patch** 起了一个 scratch `dsh web`（隔离 `DSH_HOME`；**仓库外，实测用**的工作区：`--cwd D:\_tmp\smoke-ws`；提示词首行含「**模拟测试**」、`--max-tokens 40000`），**`session/create` ok、回合真跑**（6s、`transcriptEvents:22`），但 **`toolCalls:0`／`tools:[]`** ⇒ **`vibe_vmu_report` 可达／阈值触发／参数留痕／两通道到达模型 一条都未建立** ✗。**"未跑成"不是"通过"，也不是"失败"**：它是**未建立**，原因见观测 7 的两条候选 ✗✓。
2. **会话记账（≤2 纪律）**：verify 1 次（框架面，SLV 合规，见观测 5b）＋ 我 **1 次**（上面那次，SLV §2/§4 合规：首行"模拟测试"标记 ✓、显式 `--max-tokens 40000` ⇒ `tokenCapHit:false` ✓）＝ **2/2**。Lead 又按"决定性证据"**追加授权 1 次**；该次**尚未使用**——第一版设计是缺陷、第二版设计**仍在复核中**，因此在 verify 独立复核通过并发出 port/token 之前不跑（避免白花）✓。**已用总量 ≈ 40k tokens**（verify 31.4k ＋ 我 8.2k），远低于手册上限 ✓。
3. **据实披露（不写成"已验证"）** ✗✓：① 我那次会话实际落在 **`deepseek-official`／`deepseek-flash`**（起服务时只带了 overlay、**漏了 provider/model 补丁**），**不是** opencode-go；token in 6756／out 449／total **8229**；② 使用的是**测试侧绕行**（把声明行逐字重述＋追加 `overlay`；**仓库外，实测用**的脚本 `D:\_tmp\build-overlay-full.mjs`，已随临时目录清理），**不是** docs/02 的纯配方（纯配方会 `agent-preset/not-found`，见观测 7）；③ 未匹配键的**具名告警**、未匹配**不改动**这两条回归断言**未验**（等 core 的修复读数与 verify 的仓内常驻测试）。
4. **复跑清单（等 core 修复＋A/B dump 后执行）**：① 用**修好的** overlay（只按 id 深合并进 `config.plugins[]`，保 preset 身份；未匹配只告警不改动）；② 起服务时**同时**带 provider/model 补丁（opencode-go／`deepseek-v4.1-flash`，经操作者授权）；③ 驱动显式 `--max-tokens` ＋首行"模拟测试"并记 `user/message` 的 `seq`＋行号（§2）；④ dump 落 `_oneoff/vmu/live/**`；⑤ 结论按 §7/§8 四段写；⑥ 跑完删凭据副本、停服务 ✓。
5. **纪律**：全程**未使用**任何未授权凭据（我复制的临时凭据副本按纪律删除；verify 那份由其收尾）；**同一时刻只起一个服务**；未改任何仓内别人文件 ✓。

### 19.11 C-30 所办定稿咨询门（`kernel/paper.js`；**读者已落**）

> 为什么在本卷：这是**运营侧的定稿闸**——稿件可以定稿之前，必须按声明完成"所办咨询"。v5r 的原型在 `vibe-math-v5r.js:8349-8429`（`finalizePaperByOffice`／`notePaperConsult`：**消息与会议都要有**，且**按发生的动作计数**，意图不算；否则具名拒）。vmu 侧 5 个键先落进 schema，**一直没有读者**——本卷要点名的正是"声明了没人读"这一类 ✗✓。

- **读者**：`kernel/paper.js` 的定稿路径（`createPaper` 的 `finalize`）按序过 ①finalizer 规则 ②完整性 ③**C-30 咨询门** ④`register` 缝；`WIRED_KEYS` 因此 3→8 ✓。**导出面**（本卷点名，供 `02` 的模块面核对 ✓）：`createPaper`（工厂）／`refuse`（具名拒）／`apiVersion`／`ENFORCED_SCOPE`（D3 作用域标记）／`WIRED_KEYS`／`PLANNED_KEYS`／`FINALIZERS`／`CONSULT_POINTS`／`CONSULT_TIMEOUT_ACTIONS`（后两个是"何时必须咨询"与"超时怎么办"的**声明式词表** ✓）。
- **台账记的是动作**：`consult({paperId, kind, by, ref})` 追加一条（`kind` 是自由词表：`message`／`meeting`／机构自定 ✓）；`requestConsult()` 可显式开请求（幂等 ✓）；`consultState()` **只读**（`auto:false`，不改变稿件 ✓）。**意图不算数** ✗✓（对齐 v5r）✓。
- **拒法**：未咨询即定稿 ⇒ **`VMU_OFFICE_CONSULT_REQUIRED`**（已登记 `03-§8` ✓），带 `enforced[]`（5 键）＋ `enforcedScope='evaluated-so-far'` ＋ 算术细节（`reason`／`timeoutMs`／`elapsedMs`／`remainingMs`／`heldOnTimeout`／`timedOut`／`requestCleared`）；`hint` 给三条出路（先 `consult`／声明豁免／`officeConsult=off`）✓。
- **留痕**：审计行 `what:'auth'`（`subject:'paper:<id>'`，带 `enforced`＋scope ✓）＋ 总线事件 `paper/office-consult-required`（经 `bus.declareTopic` 的扩展点 ✓）＋ 模块内 trail；**接缝缺失时具名上报**（`trace.audit.code`／`trace.bus.note` ✓），绝不假装写过 ✓。
- **超时**：`hold`（默认）保持请求且**仍然拒**；`refuse` 清请求且**仍然拒**；`0`＝无限等；**无法识别的值按 `hold`** ⇒ **没有 `default-allow` 这一档，连拼写都进不来** ✗✓。
- **豁免（F4）**：**默认 `[]`（不豁免）** ✓；`consult({...})` 记录一次咨询即可开门；**没有任何/关掉** ⇒ `officeConsult='off'` 是零机制 ✓。
- **验收（机器可判定）**：① **具名**：未咨询定稿 ⇒ `VMU_OFFICE_CONSULT_REQUIRED` ＋ `enforced` 是 5 元数组 ＋ `enforcedScope` 存在 ✓；② **断言**：空豁免名单下 `office` 定稿被拒、声明 `['office']` 后同一路径通过 ✓；③ **场景**：`hold` 超时后**任意久**都不放行，`consult` 后才通过 ✓；④ **红**：把 `default-allow` 写进 `OnTimeout` ⇒ 回执 `onTimeout:'hold'` 且**仍拒** ✓；⑤ 与 `22-§19` 的汇报面同一条纪律：**只提示/只记账，绝不越权驱动** ✓。
- **测试**：`tests/vmu-paper-consult.test.mjs`（40 项 ✓）；**码登记**：`VMU_OFFICE_CONSULT_REQUIRED` 已登记 `03-§8` ✓；**策略值**：5 个键已由 pack 在 `packs/v5r/settings/defaults.json` 声明（`ExemptRoles: []`，F4 口径 ✓）。
- **未核项（见 `14-§2`）**：① `finalize-or-submit` 的 **submit 那一半**不在本面（归出版/投稿面）✗；② v5r 的**双计数**（消息＋会议都要）在 vmu 是"任意一次咨询即可"——要恢复双计数需**再声明白名单**（属 pack 扩展点）✓；③ 豁免按**字符串**匹配角色（无槽位解析，同 §19.9-4）✓。
