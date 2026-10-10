# vmu 16 · 学术研究生命周期（一等基础设施卷）

> 状态：**设计稿 v0.2**（v0.1＝L1–L24 生命周期＋G1/G2/G12/G19/G20；**v0.2 增补 §8：外部取数适配层（N11）** —— 补批评者第 6 轮点名的"**平台没有任何取数通道**"缺口；实现落地后逐字校准）
> 上位：`01-philosophy.md`（R3 四可／R11 具名拒绝）、`04-settings.md`（设置权威）、`05-middleware.md`、`06-prompt-pipeline.md`（提示词管线）、**`07-durability-library.md`（归档/指纹/去重）**、**`20-security-privacy-and-compliance.md`（网络策略与凭据）**、**`22-academic-operations.md`（台账/凭证/回执）**、**`21-observability-and-operations.md`（取数指标与告警）**
> 邻卷：`07-durability-library.md`（归档轨）、`08-primitives-meeting-ballot-workflow.md`（会议与表决）、`09`／`15`（数学计算与形式化）、`12-user-guide.md`（使用者手册）、`14-open-items-and-roadmap.md`（未决项与路线图）
> 读者：**研究者本人**（要把"一项研究从选题做到长期保存"跑在 vmu 上）＋ **机制作者**（要为新阶段写规则/模块/脚本/包）。

---

## 0. 心智模型：生命周期是"可挂点的流水线"

1. **每个阶段 ＝ 一组「记录 + 约束 + 可复算产物」**；vmu 提供**能力**（记录／会议／计算／归档／脚本）与**挂点**（阶段前后可挂 M1 规则、M2 模块）。
2. **成熟度必须逐条标注**：✓＝已实现（可跑）/ ✗＝规划（未接线）；**未实现的工具名一律与标记词同行**。
3. **"可复现"不是口号，而是四条可核事实**：数据指纹、参数、环境、脚本 —— 缺一条即**不得**声称可复现（具名拒）。

### 四可关系（每阶段都要回答）
| 维度 | 问法 | 不好的答案 |
|---|---|---|
| **自由度** | 这一步允许我自由决定什么？ | "都行"（等于没有边界） |
| **可调控性** | 用哪个 settings 键调？热还是冷？ | "改代码" |
| **可定义性** | 能否用一条**断言**判定它做对了？ | "看起来对" |
| **扩展性** | 新方法/新格式从哪插入？ | "fork 一份" |

---

## 1. 总览（L1–L24）

| # | 阶段 | vmu 手段 | 成熟度 | 优先级 |
|---|---|---|---|---|
| L1 | 选题与立项 | 记录（`vibe_vmu_records`）＋任务板（`vibe_vmu_task`） | ✓ | P0 |
| L2 | 文献检索与去重 | 记录 + 脚本（`vibe_vmu_script`）＋**外部取数适配层（§8／N11）** | ✓（脚本面无内置检索器 ✗／**适配层为计划 ✗**） | P1 |
| L3 | 引文与参考文献（BibTeX/CSL-JSON/DOI/arXiv/PMID/ORCID/ROR） | settings + 记录＋**§8 适配层（DOI/arXiv/PMID 等标识符→元数据）** | ✗ 规划（无专用工具；**§8 已给接口形状与字段** ✓） | P0 |
| L4 | 阅读笔记与知识库（卡片／关系／反链） | 记录 + 中间件 | ⚠️ 卡片可记；反链未接线 ✗ | P1 |
| L5 | 假设与预注册（preregistration） | 记录 + M1 规则 | ✓（形态已可表达） | P0 |
| L6 | 实验设计与变量 | settings + 记录 | ✗ 规划 | P1 |
| L7 | 样本量与功效分析 | 计算面（数学计算接缝） | ⚠️ 计算面已接、统计模板 ✗ | P1 |
| L8 | 数据采集与清洗 | 脚本 + 记录 | ✓（脚本可跑） | P0 |
| L9 | 数据登记与血缘（路径＋指纹＋参数＋parent） | 记录 + settings | ⚠️ 形态可表达；指纹自动计算 ✗ | P0 |
| L10 | 版本化数据集 | 记录 + 归档轨（07） | ⚠️ | P1 |
| L11 | 统计与稳健性（多重比较校正／效应量／贝叶斯因子／重采样） | 计算面 + 记录 | ✗ 规划（模板未接线） | P1 |
| L12 | 复现包（环境锁定＋种子＋脚本＋数据指针） | pack（`vibe_vmu_pack`）+ 记录 + 脚本 | ✗ 规划（打包器未接线） | P0 |
| L13 | 同行评审（单盲/双盲/公开／审稿人库／利益冲突／回避） | 会议（`vibe_vmu_meeting`）+ 中间件 + 记录 | ⚠️ 会议 ✓／审稿人库 ✗ | P0 |
| L14 | 修改与 rebuttal | 记录 + 会议 | ✓ | P1 |
| L15 | 版本记录（preprint → VoR） | 记录 + 归档轨 | ⚠️ | P1 |
| L16 | 更正与撤稿 | 记录 + 会议 + M1 规则 | ⚠️（撤稿必须**具名**留痕） | P0 |
| L17 | 署名与贡献度（CRediT） | 记录 + settings | ✗ 规划（CRediT 模板未接线） | P0 |
| L18 | 致谢与经费合规 | 记录 + settings | ⚠️ | P2 |
| L19 | 数据与代码可得性声明 | 记录 + pack | ✗ 规划 | P0 |
| L20 | 伦理审批（IRB/DPIA） | 记录 + M1 规则（拒绝无审批的实验） | ✗ 规划 | P0 |
| L21 | 版权与许可（CC 等） | settings + 记录 | ✗ 规划 | P1 |
| L22 | 长期保存（PDF/A、格式迁移、DOI 持久引用） | 归档轨（07）＋ settings | ✗ 规划 | P1 |
| L23 | 负面结果与复现失败登记 | 记录（一等公民） | ✓ | P0 |
| L24 | 教学与带教（seminar）／跨机构协作与联邦交换 | 会议 + 记录 + 协议 | ⚠️ 会议 ✓／联邦交换 ✗ | P2 |

---

## 2. 各阶段详述

> 统一字段：**目的／面向谁／接口形状／可调控参数／错误码／四可／实现要点／依赖与前置／成熟度／优先级**。

### L1 选题与立项
- **目的**：把"想做什么"变成**可追踪的对象**（问题、范围、成功判据）。
- **面向谁**：研究者本人；PI／导师。
- **接口形状**：`vibe_vmu_records {action:'append', kind:'topic', text:'<问题陈述＋成功判据>'}`；任务板建卡 `vibe_vmu_task {action:'create', subject:'<课题>'}`。
- **可调控参数**：`vmu.lifecycle.topicRequiredFields`（数组，默认 `["question","scope","success"]`）。
- **错误码**：`VMU_INVALID_ARGUMENT`（缺成功判据 ⇒ 具名拒）。
- **四可**：自由度＝选题自由；可调控性＝必填字段可配；可定义性＝"缺字段即拒"可断言；扩展性＝新字段靠 settings。
- **实现要点**：M1 规则在 `record.beforeWrite` 校验必填字段。
- **依赖**：无。**成熟度** ✓。**优先级** P0。

### L2 文献检索与去重
- **目的**：把检索结果与去重后的**净集**落库。
- **面向谁**：研究者；系统综述作者。
- **接口形状**：`vibe_vmu_script {action:'run', id:'lit-search'}`（脚本自备检索器 ✗ 规划：当前需用户自带脚本）。
- **可调控参数**：`vmu.lifecycle.searchSources`（数组）、`vmu.lifecycle.dedupeKeys`（默认 `["doi","title"]`）。
- **错误码**：`VMU_ENGINE_UNAVAILABLE`（无子进程服务 ⇒ 检索脚本不可跑）。
- **四可**：自由度＝数据源可选；可调控性＝源与去重键；可定义性＝"净集条数"可断言；扩展性＝新数据源＝新脚本。
- **依赖**：L8 的脚本通路（子进程服务）。**成熟度** ✓（脚本面）／✗（内置检索器）。**优先级** P1。

### L3 引文与参考文献
- **目的**：一条引文＝**稳定标识**（DOI／arXiv／PMID）＋**可渲染**（BibTeX／CSL-JSON）。
- **面向谁**：写作者；投稿者。
- **接口形状**：`vibe_vmu_records {action:'append', kind:'citation', text:'<CSL-JSON>'}`（**规划**：`vibe_vmu_cite` 工具**未实现**，属 roadmap）。
- **可调控参数**：`vmu.citations.style`（`csl` 串，默认 `"apa"`）、`vmu.citations.preferIds`（默认 `["doi","arxiv","pmid"]`）、`vmu.citations.orcid`、`vmu.citations.ror`。
- **错误码**：`VMU_INVALID_ARGUMENT`（缺稳定标识 ⇒ 具名拒）。
- **四可**：自由度＝样式可选；可调控性＝style／preferIds；可定义性＝"每条引文有标识"可断言；扩展性＝新样式＝新 CSL。
- **依赖**：无。**成熟度** ✗ 规划。**优先级** P0。

### L4 阅读笔记与知识库
- **目的**：卡片（断言＋出处）＋关系（支持／反驳／细化）＋**反链**。
- **接口形状**：记录（`kind:'note'`）✓；**反链查询未接线 ✗**（目标形态：`vibe_vmu_records {action:'query', kind:'note', backlinks:true}`）。
- **可调控参数**：`vmu.notes.linkKinds`（默认 `["supports","refutes","refines"]`）。
- **错误码**：`VMU_INVALID_ARGUMENT`（非法 linkKind）。
- **四可**：自由度＝链接类型可扩；可调控性＝linkKinds；可定义性＝"每条笔记至少有 1 条出处"可断言；扩展性＝新关系＝新 linkKind。
- **依赖**：L3。**成熟度** ⚠️。**优先级** P1。

### L5 假设与预注册
- **目的**：把假设**先登记后检验**，防止事后改写。
- **接口形状**：记录（`kind:'hypothesis'`）＋ M1 规则锁定"登记后不可改语义"。
- **可调控参数**：`vmu.lifecycle.preregLock`（布尔，默认 `true`）。
- **错误码**：`VMU_INVALID_ARGUMENT`（登记后改语义 ⇒ 具名拒）。
- **四可**：自由度＝假设内容自由；可调控性＝锁开关；可定义性＝"改动被拒"可断言；扩展性＝新字段。
- **依赖**：L1。**成熟度** ✓。**优先级** P0。

### L6 实验设计与变量
- **目的**：自变量／因变量／控制变量的**显式化**与平衡性检查。
- **接口形状**：记录（`kind:'design'`）；平衡性检查**规划 ✗**。
- **可调控参数**：`vmu.lifecycle.variableRoles`（默认 `["iv","dv","control"]`）。
- **错误码**：`VMU_INVALID_ARGUMENT`。
- **依赖**：L5。**成熟度** ✗ 规划。**优先级** P1。

### L7 样本量与功效分析
- **目的**：给"样本是否足够"一个**可复算**的答案。
- **接口形状**：计算面（数学计算接缝）＋ 统计模板（**规划 ✗**）。
- **可调控参数**：`vmu.lifecycle.powerTarget`（默认 `0.8`）、`vmu.lifecycle.alpha`（默认 `0.05`）。
- **错误码**：`VMU_MIDDLEWARE_FAILED`（计算接缝失败）、`VMU_ENGINE_UNAVAILABLE`。
- **依赖**：09／15 计算面。**成熟度** ⚠️。**优先级** P1。

### L8 数据采集与清洗
- **目的**：从原始数据到**可用集**，全程留痕。
- **接口形状**：`vibe_vmu_script {action:'run', id:'clean'}`。
- **可调控参数**：`vmu.script.timeoutMs`、`vmu.script.stdoutCap`、`vmu.script.stderrCap`。
- **错误码**：`VMU_JOB_TIMEOUT`、`VMU_MIDDLEWARE_FAILED`。
- **注意** ✗：脚本必须给**真实字符串 cwd**（宿主 `validateNoNullByte` 缺陷 ⇒ 调用侧规避，详见 12-§16）。
- **依赖**：宿主子进程服务。**成熟度** ✓。**优先级** P0。

### L9 数据登记与血缘
- **目的**：每个数据集＝**路径＋指纹＋参数＋parent**。
- **接口形状**：记录（`kind:'dataset'`）；**指纹自动计算未接线 ✗**（目标形态：`{action:'register', fingerprint:'sha256:…', parent:'<id>'}`）。
- **可调控参数**：`vmu.data.fingerprintAlgo`（默认 `"sha256"`）、`vmu.data.requireParent`（默认 `false`）。
- **错误码**：`VMU_INVALID_ARGUMENT`（缺指纹且算法未接线）。
- **四可**：可定义性＝"任一数据集可回溯到 raw 或外部来源"可断言。
- **依赖**：L8。**成熟度** ⚠️。**优先级** P0。

### L10 版本化数据集
- **目的**：数据集**可引用到版本**（而非"最新"）。
- **接口形状**：记录 ＋ 归档轨（07）。
- **可调控参数**：`vmu.data.versionScheme`（默认 `"semver"`）。
- **成熟度** ⚠️。**优先级** P1。

### L11 统计与稳健性
- **目的**：校正（多重比较）、效应量、贝叶斯因子、重采样（bootstrap／permutation）。
- **接口形状**：计算面 ＋ 模板（**规划 ✗**）。
- **可调控参数**：`vmu.stats.correction`（默认 `"holm"`）、`vmu.stats.effectSize`（默认 `"cohen_d"`）、`vmu.stats.seed`（整数，**必须显式**以复现）。
- **错误码**：`VMU_INVALID_ARGUMENT`（缺 seed ⇒ 具名拒，因为结果不可复现）。
- **依赖**：L9。**成熟度** ✗ 规划。**优先级** P1。

### L12 复现包
- **目的**：把"环境＋种子＋脚本＋数据指针"打成一包（RO-Crate／BagIt 式）。
- **接口形状**：`vibe_vmu_pack {action:'build', id:'<包>'}`（**规划 ✗**：当前 pack 只做机制打包，不做复现包）。
- **可调控参数**：`vmu.repro.lockEnv`（默认 `true`）、`vmu.repro.includeSeed`（默认 `true`）、`vmu.repro.dataPointers`（数组）。
- **错误码**：`VMU_INVALID_ARGUMENT`（缺种子／数据指针 ⇒ 具名拒）。
- **四可**：可定义性＝"包内四条事实齐备"可断言（指纹／参数／环境／脚本）。
- **依赖**：L8、L9、L11。**成熟度** ✗ 规划。**优先级** P0。

### L13 同行评审
- **目的**：评审**可配置**（单盲／双盲／公开）＋**利益冲突**检查与回避。
- **接口形状**：`vibe_vmu_meeting {action:'open', kind:'review'}` ＋ 记录；审稿人库与回避**规划 ✗**。
- **可调控参数**：`vmu.review.mode`（默认 `"single-blind"`）、`vmu.review.conflictPolicy`（默认 `"recuse"`）、`vmu.review.quorum`。
- **错误码**：`VMU_INVALID_ARGUMENT`（未声明冲突即参与 ⇒ 具名拒）。
- **依赖**：08 会议卷。**成熟度** ⚠️。**优先级** P0。

### L14 修改与 rebuttal
- **目的**：把审稿意见→回应→改动**配对留痕**。
- **接口形状**：记录（`kind:'rebuttal'`），每条意见一个条目。
- **可调控参数**：`vmu.review.rebuttalRequired`（默认 `true`）。
- **成熟度** ✓。**优先级** P1。

### L15 版本记录（preprint → VoR）
- **目的**：同一工作的**版本链**可追溯。
- **接口形状**：记录（`kind:'version'`）＋ 归档轨。
- **可调控参数**：`vmu.pub.versionKinds`（默认 `["preprint","accepted","vor","erratum"]`）。
- **成熟度** ⚠️。**优先级** P1。

### L16 更正与撤稿
- **目的**：更正／撤稿必须**具名、可查、不可静默**。
- **接口形状**：记录（`kind:'correction'|'retraction'`）＋ M1 规则（禁止删除既有结论）。
- **可调控参数**：`vmu.pub.retractionRequiresReason`（默认 `true`）。
- **错误码**：`VMU_INVALID_ARGUMENT`（无理由撤稿 ⇒ 具名拒）。
- **成熟度** ⚠️。**优先级** P0。

### L17 署名与贡献度（CRediT）
- **目的**：贡献按 **CRediT** 角色登记，避免"挂名"争议。
- **接口形状**：记录（`kind:'credit'`）；**CRediT 模板未接线 ✗**（目标形态：`vibe_vmu_credit` 工具**规划**）。
- **可调控参数**：`vmu.authorship.creditRoles`（默认 14 项 CRediT 标准角色）、`vmu.authorship.requireCredit`（默认 `true`）。
- **错误码**：`VMU_INVALID_ARGUMENT`（署名但无角色 ⇒ 具名拒）。
- **成熟度** ✗ 规划。**优先级** P0。

### L18 致谢与经费合规
- **目的**：经费号／致谢**结构化**，便于合规检查。
- **接口形状**：记录（`kind:'funding'`）。
- **可调控参数**：`vmu.funding.requiredFields`（默认 `["grantId","funder"]`）。
- **成熟度** ⚠️。**优先级** P2。

### L19 数据与代码可得性声明
- **目的**：声明**具体可得路径**（而非"可索取"）。
- **接口形状**：记录（`kind:'availability'`）＋ pack。
- **可调控参数**：`vmu.avail.requireUrl`（默认 `true`）。
- **错误码**：`VMU_INVALID_ARGUMENT`（"应要求提供" ⇒ 具名拒）。
- **成熟度** ✗ 规划。**优先级** P0。

### L20 伦理审批（IRB／DPIA）
- **目的**：涉及人类数据／隐私的处理**先审批后执行**。
- **接口形状**：记录（`kind:'ethics'`）＋ M1 规则：无审批编号时**拒绝**采集类脚本。
- **可调控参数**：`vmu.ethics.requireApprovalFor`（默认 `["human-data","pii"]`）、`vmu.ethics.dpiaRequired`（默认 `true`）。
- **错误码**：`VMU_INVALID_ARGUMENT`（缺审批号 ⇒ 具名拒）。
- **成熟度** ✗ 规划。**优先级** P0。

### L21 版权与许可
- **目的**：产出物**许可明确**（如 CC-BY-4.0）。
- **接口形状**：settings ＋ 记录。
- **可调控参数**：`vmu.license.default`（默认 `"CC-BY-4.0"`）、`vmu.license.codeDefault`（默认 `"MIT"`）。
- **成熟度** ✗ 规划。**优先级** P1。

### L22 长期保存
- **目的**：**格式迁移**＋**持久引用**（DOI）＋可读性（PDF/A）。
- **接口形状**：归档轨（07）＋ settings；迁移器**规划 ✗**。
- **可调控参数**：`vmu.preserve.pdfProfile`（默认 `"PDF/A-3"`）、`vmu.preserve.migrateAfterYears`（默认 `5`）。
- **成熟度** ✗ 规划。**优先级** P1。

### L23 负面结果与复现失败登记
- **目的**：负结果／复现失败是**一等产出**，不是垃圾。
- **接口形状**：记录（`kind:'negative'|'repro-failure'`）。
- **可调控参数**：`vmu.records.treatNegativeAsFirstClass`（默认 `true`）。
- **四可**：可定义性＝"每条负结果有可复跑脚本指针"可断言。
- **成熟度** ✓。**优先级** P0。

### L24 教学与带教／跨机构协作
- **目的**：seminar 复现训练；跨机构**联邦交换**（受控、可审计）。
- **接口形状**：会议（`kind:'seminar'`）＋ 记录；联邦交换协议**规划 ✗**。
- **可调控参数**：`vmu.collab.federationPeers`（数组）、`vmu.collab.exportPolicy`（默认 `"minimal"`）。
- **成熟度** ⚠️／✗。**优先级** P2。

---

## 3. 与既有卷的双向交叉引用

| 本卷阶段 | 依赖卷（读） | 被引卷（写回） |
|---|---|---|
| L10／L15／L22 归档与长期保存 | **07**（归档轨） | 07 需补"生命周期阶段"字段 |
| L13／L14／L24 评审与教学 | **08**（会议与表决） | 08 需补"评审模式／回避" |
| L7／L11 功效与统计 | **09／15**（计算与形式化） | 09／15 需补统计模板清单 |
| L5／L16／L20 约束与拒绝 | **05**（中间件） | 05 需补"生命周期钩子名" |
| L4／L17 提示词与角色 | **06**（提示词） | 06 需补"CRediT 段" |
| 全部阶段的操作入口 | **12**（使用者手册） | 12 增"生命周期配方" |
| 全部规划项 | **14-§2**（未决项／路线图） | 14 增 T9「研究生命周期」主题 |
| **N11 外部取数：入档/指纹/去重/保留** | **07**（归档轨） | 07 收"外部来源"字段（本卷只引用指纹纪律 ✓） |
| **N11 外部取数：网络策略/凭据/隐私** | **20**（安全·隐私·合规） | 20 收 `vmu.external.*` 的网络与凭据面（**本卷不定义凭据** ✗） |
| **N11 外部取数：台账/回执/凭证** | **22**（学术运营） | 22 收"取数回执"作为凭证成员（只引用 ✓） |
| **N11 外部取数：指标与 stale 告警** | **21**（可观测） | 21 增"stale 比例/取数失败率"指标（机制归 21 ✓） |
| **N11 取数挂点** | **05**（中间件） | 05 复用既有钩子（`record/append-before`／`pack/loading`），**不新增钩子** ✗ |

---

## 4. 验收判据（≥2 个机器可判定词）

1. **具名**：任一阶段缺"必需字段"（如 L5 成功判据、L11 seed、L12 数据指针、L20 审批号）⇒ **具名拒**（非静默）。
2. **断言**：可为每条 L9 数据集写**断言**"可回溯到 raw 或外部来源"；为 L23 写**断言**"负结果带可复跑脚本指针"。
3. **场景**：每阶段至少一条**场景**（照抄即得预期结果）；**规划**阶段允许标"场景待实现 ✗"。
4. **红**：反向变异（把必需字段去掉）必须产出**具名红**（`VMU_INVALID_ARGUMENT`）。
5. 文档审计：未实现的 `vibe_vmu_*` 工具名**必须与标记词同行**；否则视为**红**。
6. **外部取数（N11／§8）具名降级**：`allowNetwork=false` 且无缓存 ⇒ **`VMU_EXTERNAL_UNAVAILABLE`**（hint 给端点与缓存状态），**绝不返回伪造元数据** ✗✓。
7. **外部取数（N11／§8）stale 自曝（断言）**：命中过期缓存 ⇒ 回执**必须**含 `stale:true` 与 `ageMs`，引用面出现"（缓存过期）"标记；任一缺失 ⇒ **红**（`VMU_EXTERNAL_STALE_SERVED` 是**告知码**，不是失败）. 
8. **外部取数（N11／§8）多源冲突自曝（场景）**：同一 DOI 从两个源取数 ⇒ 标量按 `primarySources` 选中、数组取并集、**差异进 `conflicts[]` 且可读**（**不得静默择一** ✗）。

---

## 5. 未核项

- **本卷全部"规划 ✗"阶段**：工具面**未实现** ⇒ 照抄会失败；落地后须逐条补**场景**；
- **键名**：本卷给出的是**拟增键**（见回报），尚未进 `settings/schema.js` 生成管线 ⇒ 以登记后为准；
- **宿主 cwd 缺陷**：L8 的脚本通路依赖调用侧规避（12-§16），宿主修好后需复核；
- **斯坦福式外部标准**（CRediT／CSL／RO-Crate／BagIt）的**字段级**对齐未做；
- 编号登记见 **14-§2**（主题 T1–T8；本卷新增建议主题 **T9「研究生命周期」**）。
- **N11 外部取数适配层（§8）未核项** ✗：① **真实网络调用未实现**（只定义接缝与缓存契约）；② **限流/配额与人机验证未做**；③ **机构订阅与 API key 管理归 20 卷** ✓（只引用）；④ 七个源（Crossref／arXiv／OpenAlex／PubMed／DataCite／Software Heritage／专利检索）的**字段级对齐未做**；⑤ 端点**版本化协议**（`endpointVersion`）语义未定；⑥ **`stale` 的指标化**（stale 比例告警）待 `21` 定键；⑦ 建议 `14-§2` 新增主题 **T12「外部取数适配层（N11）」**（编号登记见 **`14-§2`** ✓）。

---

## 6. 与四条哲学的关系（总表）

| 阶段族 | 自由度 | 可调控性 | 可定义性 | 扩展性 |
|---|---|---|---|---|
| 选题／假设／预注册 | 高 | 必填字段可配 | "缺字段即拒" | 新字段靠 settings |
| 数据／统计／复现 | 中（受算法与种子约束） | 算法／阈值／种子 | "四事实齐备" | 新方法＝新脚本 |
| 评审／署名／伦理 | 中（受合规约束） | 模式／政策开关 | "无理由即拒" | 新角色／新政策 |
| 归档／保存／协作 | 低（受格式与协议约束） | 格式剖面／迁移年限 | "可持久引用" | 新格式＝新迁移器 |

---

## 7. 出版与外部对接（G1／G2／G12／G19／G20）

> 统一说明：以下五条**只引用** 07（归档）／08（会议与表决）／17（信任与公平）／20（安全·隐私·合规），**不重定义**它们的语义 ✗。

### G1 评审人市场（审稿人库 · COI · 盲评映射 · 负载均衡）
- **本体/字段 schema**：`reviewers[{ id, expertise[], load, conflicts[] }]`；`reviewAssignment{ reviewerId, submissionId, mode, blind, assignedAt, dueAt, status }`；`coiRecord{ reviewerId, subjectId, kind, evidence }`。
- **接口形状**：`vibe_vmu_records {action:'append', kind:'reviewer'|'reviewAssignment'|'coi'}`（已实现 ✓ 的记录面）；
  **规划 ✗（未实现）**：`vibe_vmu_reviewers`（**规划/未接线**：库查询与负载均衡）。
- **字段级规则**：① **COI 校验**——`conflicts[]` 命中被审对象 ⇒ **必须回避**，否则**具名拒**；② **盲评映射**——单盲/双盲/公开由 `vmu.review.mode` 决定；映射表与解绑**必须有留痕**（谁在何时解绑）；③ **负载均衡**——同一审稿人并发分配上限可配。
- **参数键**：`vmu.reviewers.maxLoad`（整数，默认 `3`）｜`vmu.reviewers.coiPolicy`（`"deny"|"ask"`，默认 `"deny"`）｜`vmu.reviewers.blindUnbindRequiresReason`（布尔，默认 `true`）｜`vmu.reviewers.acknowledgement`（布尔，默认 `false`，可选"致谢/报酬"登记）。
- **错误码**：`VMU_COI_VIOLATION`（未回避）｜`VMU_REVIEWER_OVERLOADED`（超负载）｜`VMU_BLIND_UNBIND_DENIED`（无理由解绑）。
- **交界**：会议与表决规则留在 **08** ✓（本卷只登记"评审作业"对象）；信任与公平不变式留在 **17** ✓；审稿人个人数据按 **20 卷**隐私规则处理（分类＋去标识化）✓。
- **成熟度** ✗ 规划（记录面 ✓ 可承载；市场/负载面未接线）。**优先级** P0。

### G2 出版社/期刊系统对接（JATS 式导出；网络归脚本/插件）
- **本体/字段 schema**：`publication{ id, version, kind: 'preprint'|'accepted'|'vor'|'erratum', jatsXmlRef, checklistRef, packageRef }`；投稿检查清单 `submissionChecklist{ items:[{id, ok, evidence}] }`。
- **接口形状**：`vibe_vmu_pack {action:'build', id:'<投稿包>'}`（**规划 ✗**：当前 pack 只做机制打包）；
  **明写边界** ✓：**本平台只产出"可提交包"**（JATS 式 XML／PDF／补充材料／许可／可得性声明）；**投稿 API 与网络调用属外部** ⇒ **由脚本（M3）或插件完成** ✗，**不在本卷定义**。
- **参数键**：`vmu.publish.jatsVersion`（字符串，默认 `"JATS-1.3"`）｜`vmu.publish.requireChecklist`（布尔，默认 `true`）｜`vmu.publish.versionChainStrict`（布尔，默认 `true`）。
- **错误码**：`VMU_SUBMISSION_INCOMPLETE`（清单未过）｜`VMU_VERSION_CHAIN_BROKEN`（preprint→accepted→VoR 断链）。
- **交界**：版本链与归档留痕归 **07** ✓；作者/CRediT 归本卷 **L17** ✓。
- **成熟度** ✗ 规划。**优先级** P1。

### G12 第三方归档注册（Zenodo/OSF/SWH 式；离线优先）
- **本体/字段 schema**：`registration{ id, target: 'zenodo'|'osf'|'swh'|'other', fingerprint, license, metadata{title,authors,keywords}, receipt? }`。
- **接口形状**：`vibe_vmu_records {action:'append', kind:'registration'}`（记录面 ✓）；**规划 ✗（未实现）**：`vibe_vmu_register`（**目标形态**：生成"待注册包"并登记回执）——**离线优先** ✓：**无网络也能产出待注册包**；回执（DOI/URL/时间戳）在**联网补齐后**再登记。
- **参数键**：`vmu.archive.targets`（数组，默认 `[]`）｜`vmu.archive.offlineFirst`（布尔，默认 `true`）｜`vmu.archive.receiptRequired`（布尔，默认 `true`）。
- **错误码**：`VMU_ARCHIVE_TARGET_UNKNOWN`｜`VMU_ARCHIVE_RECEIPT_MISSING`（声明已注册但无回执 ⇒ 具名拒）。
- **交界**：产物与指纹归 **07 归档轨** ✓（本卷只登记"注册"这一动作与回执）。
- **成熟度** ✗ 规划。**优先级** P1。

### G19 数据/代码可得性声明与徽章
- **本体/字段 schema**：`availability{ data:{license,url|how}, code:{license,url|how}, materials:{license,url|how}, badge:'open'|'restricted'|'closed' }`。
- **接口形状**：`vibe_vmu_records {action:'append', kind:'availability'}`（记录面 ✓）；**规划 ✗（未实现）**：`vibe_vmu_availability`（**规划**：校验＋徽章计算）。
- **字段级规则**：**"应要求提供"必须被拒** ✗✓（`how:"on request"`／缺失 `url` ⇒ **具名拒**）；**徽章口径** ✓：`data` 与 `code` 均给出**可解析 URL** 且许可为开放许可 ⇒ 记 `badge:'open'`；任一为受限 ⇒ `restricted`；否则 `closed`。
- **参数键**：`vmu.avail.requireUrl`（布尔，默认 `true`）｜`vmu.avail.allowOnRequest`（布尔，**默认 `false`**）｜`vmu.avail.openLicenses`（数组，默认 `["CC0-1.0","CC-BY-4.0","MIT","Apache-2.0"]`）。
- **错误码**：`VMU_AVAILABILITY_VAGUE`（"应要求提供"／无 URL）｜`VMU_BADGE_MISMATCH`（徽章与字段不符）。
- **交界**：许可兼容矩阵归 **20 卷** ✓；发布版本链归本卷 **L15** ✓。
- **成熟度** ✗ 规划。**优先级** P0。

### G20 负面结果与复现失败登记
- **本体/字段 schema**：`replication{ original, outcome: 'reproduced'|'failed'|'partial', evidence, notes }`。
- **接口形状**：`vibe_vmu_records {action:'append', kind:'replication'}`（记录面 ✓）；**规划 ✗（未实现）**：`vibe_vmu_replication`（**提案**：复现轨查询与摘要面）。
- **字段级规则**：**不得当作失败** ✗✓ —— `outcome:'failed'` 是**一等研究产出**，与 `negative` 轨同权；**摘要面** ✓：提供可检索的"复现失败清单"（供他人避坑）；**可选**与联邦交换联动（**规划 ✗**）。
- **参数键**：`vmu.records.treatNegativeAsFirstClass`（布尔，默认 `true`）｜`vmu.replication.summaryEnabled`（布尔，默认 `true`）｜`vmu.replication.federationShare`（布尔，默认 `false`）。
- **错误码**：`VMU_INVALID_ARGUMENT`（缺 `original` 或 `evidence` ⇒ 具名拒）。
- **交界**：负结果轨已在 **L23** ✓（本条扩为"复现"子轨）；联邦交换边界归本卷 **L24** ✓。
- **成熟度** ✗ 规划（记录面 ✓）。**优先级** P0。

### 五条总表

| 条 | 名称 | 成熟度 | 优先级 | 主要参数键 | 主要错误码 |
|---|---|---|---|---|---|
| G1 | 评审人市场 | ✗ 规划 | P0 | `vmu.reviewers.*` | `VMU_COI_VIOLATION` 等 |
| G2 | 出版社对接（JATS 式） | ✗ 规划 | P1 | `vmu.publish.*` | `VMU_SUBMISSION_INCOMPLETE` 等 |
| G12 | 第三方归档注册 | ✗ 规划 | P1 | `vmu.archive.*` | `VMU_ARCHIVE_RECEIPT_MISSING` 等 |
| G19 | 可得性声明与徽章 | ✗ 规划 | P0 | `vmu.avail.*` | `VMU_AVAILABILITY_VAGUE` 等 |
| G20 | 负结果与复现失败 | ✗ 规划 | P0 | `vmu.replication.*` | `VMU_INVALID_ARGUMENT` |

> **验收** ✓（机器可判定）：① **具名**——COI 未回避／"应要求提供"／无回执／盲评无理由解绑 ⇒ **具名拒**；② **断言**——`availability` 缺 URL 必拒、`registration` 声明已注册但无 `receipt` 必拒、`replication` 缺 `evidence` 必拒；③ **场景**——各条至少一条可复跑**场景**；④ **红**——反向变异（放开策略）必须产出**具名红**。
> **未核项**：五条的外部系统（Zenodo/OSF/SWH/JATS）**字段级对齐未做** ✗；`vibe_vmu_reviewers`／`vibe_vmu_register`／`vibe_vmu_availability`／`vibe_vmu_replication` 均为**规划/未实现** ⇒ 照抄会失败；编号登记见 **14-§2**（建议新增主题 **T11「出版与外部对接」**）。

---

## 8. 外部取数适配层（**N11**：文献/专利/归档 API）

> **为什么** ✗：批评者点名 **N11** —— 平台**没有任何"取数"通道**：引文/元数据至今靠**手填**（L3 只有 settings＋记录面 ✗）。本节补上**适配层**，但**只写接口形状与字段** ✓ —— **不做法条映射、不做商业承诺、不承诺任何端点的可用性或授权** ✗。
> **离线优先**（本节的硬前提）✗✓：**没有网络也必须能工作** —— 手填（L3 既有面 ✓）、离线缓存、以及"**待取数队列**"三者构成完整回路；**任何"取不到就编一个"的行为都是缺陷** ✗。

### 8.0 五步流水与留痕

```
① fetch      取数（M3 脚本；网络调用是**外部**能力，见 §8.9）
② normalize  规范化（各源字段 → 本卷的统一引文/元数据形状）
③ fingerprint 指纹（查询指纹用于缓存键；结果指纹用于去重——**指纹纪律引用 07** ✓ 不重定义 ✗）
④ archive     入档（07 归档轨：对象＋指纹＋来源＋回执）
⑤ cite        引用（在正文/复现包中以稳定指针引用，**不搬全文** ✓）
```
**每次取数必须留痕**（`fetchReceipt`，进 07 归档 ＋ 审计面，引用 20 卷审计纪律 ✓）：
`{ at, by, source, endpoint, endpointVersion?, queryFingerprint, resultFingerprint, httpStatus?, bytes, ms, cached, stale, ttlMs, ageMs, degraded? }`
- **`cached:true` ＋ `ageMs`**：命中缓存也要留痕（不得"看起来像刚取的" ✗）；
- **`stale:true`**：过期仍被使用的**自曝**标记（见 §8.9，**不得静默** ✗）；
- **`degraded:'external-unavailable'`**：外部不可用而走降级路径时的标记（见 §8.9）；
- **`by` 与 `at` 一律来自注入时钟与调用者**（不猜、不由端点提供时间）。

**接口形状（拟增工具，全部为计划 ✗）**：`vibe_vmu_fetch`（**计划/未实现**：取数适配层入口，参数 `{source, id, ttlMs?, allowNetwork?}`）、`vibe_vmu_cite`（**计划/未实现**：引文登记/去重/多源合并）、`vibe_vmu_external_cache`（**计划/未实现**：缓存查看/清理/自曝 stale）。

### 8.1 适配器总表（7 源）

| 源 | 标识 | 得到什么 | 主要字段 | 成熟度 |
|---|---|---|---|---|
| **Crossref** | DOI | 期刊论文元数据 | `title/authors/issued/container-title/license/URL` | ✗ 规划 |
| **arXiv** | arXiv id（`2401.12345v2`） | preprint 元数据 | `id/version/title/authors/abstract/categories/updated` | ✗ 规划 |
| **OpenAlex** | `W…/A…/I…` | 作品/作者/机构 | `doi/title/publication_year/authorships/institutions/open_access` | ✗ 规划 |
| **PubMed** | PMID | 生物医学元数据 | `pmid/doi?/title/journal/year/authors/mesh/pubTypes` | ✗ 规划 |
| **DataCite** | DOI（数据集） | 数据集元数据 | `doi/types/titles/creators/publisher/rightsList/relatedIdentifiers/version` | ✗ 规划 |
| **Software Heritage** | SWHID | 源码快照 | `swhid/origin/visit/snapshot/revision/directory` | ✗ 规划 |
| **专利检索** | 检索式 | **公开检索快照** | `database/queryString/resultCount/results[{publicationNumber,title,applicant,priorityDate}]` | ✗ 规划 |

### 8.2 Crossref（DOI → 元数据）
- **本体/字段 schema**：`crossrefRecord{ doi, type, title[], author[{family,given,ORCID?}], issued{date-parts}, containerTitle[], publisher, license[{URL,content-version?}], URL, relation? }`。
- **接口形状**：端点形状 `/works/{doi}`（**只描述形状** ✗ 不承诺可用性）；`vibe_vmu_fetch {source:'crossref', id:'10.xxxx/yyyy'}`（**计划/未实现**）。
- **参数键**：`vmu.external.crossref.mailto`（字符串，默认 `""`；用于**说明调用方身份**的礼貌参数）｜`vmu.external.crossref.includeRelations`（布尔，默认 `false`）。
- **错误码**：`VMU_EXTERNAL_QUERY_INVALID`（DOI 形态非法）｜`VMU_EXTERNAL_UNAVAILABLE`（不可达/无缓存）。
- **交界**：元数据入档与指纹归 **07** ✓；许可字段的解释归 **20** ✓（本卷只登记字段，不做兼容判定 ✗）。

### 8.3 arXiv（id → preprint 元数据）
- **字段 schema**：`arxivRecord{ id, version, title, authors[], abstract, categories[], doi?, journalRef?, updated, pdfUrl }`。
- **接口形状**：`/abs/{id}` 与 Atom 查询形状；`vibe_vmu_fetch {source:'arxiv', id:'2401.12345v2'}`（**计划/未实现**）。
- **参数键**：`vmu.external.arxiv.preferVersioned`（布尔，默认 `true`；`v1…vN` 必须**记录 version**）｜`vmu.external.arxiv.maxAbstractChars`（整数，默认 `2000`；超限 ⇒ **计数式截断并自曝** ✗✓）。
- **错误码**：`VMU_EXTERNAL_QUERY_INVALID`（id 形态非法）｜`VMU_BODY_TRUNCATED`（摘要被截断，须给截断字节与上限）。
- **交界**：`pdfUrl` 的**获取**属脚本/插件 ✗（本卷只登记指针 ✓）。

### 8.4 OpenAlex（作品/作者/机构）
- **字段 schema**：`openalexRecord{ id, doi?, title, publication_year, authorships[{author{id,display_name,orcid?},institutions[]}], institutions[], cited_by_count, open_access{is_oa,oa_url?}, concepts[] }`。
- **接口形状**：`/works/{W…}`、`/authors/{A…}`、`/institutions/{I…}`；`vibe_vmu_fetch {source:'openalex', id:'W…'}`（**计划/未实现**）。
- **参数键**：`vmu.external.openalex.mailto`（字符串，默认 `""`）｜`vmu.external.openalex.maxConcepts`（整数，默认 `20`；超限**计数截断** ✓）。
- **错误码**：`VMU_EXTERNAL_QUERY_INVALID`｜`VMU_EXTERNAL_UNAVAILABLE`。
- **交界**：**机构标识（ROR）**与 §L3 的 ROR 面同源 ⇒ 只引用 ✓。

### 8.5 PubMed（PMID → 元数据）
- **字段 schema**：`pubmedRecord{ pmid, doi?, title, journal, year, authors[], mesh[], pubTypes[] }`。
- **接口形状**：`efetch` XML 形状；`vibe_vmu_fetch {source:'pubmed', id:'12345678'}`（**计划/未实现**）。
- **参数键**：`vmu.external.pubmed.maxMeshTerms`（整数，默认 `50`；超限**计数截断**）｜`vmu.external.pubmed.preferAuthoritative`（布尔，默认 `false`）。
- **错误码**：`VMU_EXTERNAL_QUERY_INVALID`（PMID 必须为数字串）｜`VMU_EXTERNAL_UNAVAILABLE`。
- **交界**：**健康数据的隐私面**归 **20 卷** ✓（本卷只处理**文献元数据**，不取个体数据 ✗✓）。

### 8.6 DataCite（DOI → 数据集）
- **字段 schema**：`dataciteRecord{ doi, types{resourceTypeGeneral}, titles[], creators[{name,affiliation?,ORCID?}], publisher, publicationYear, rightsList[{rightsIdentifier,rightsURI?}], relatedIdentifiers[{relationType,relatedIdentifier}], version }`。
- **接口形状**：`/dois/{doi}`；`vibe_vmu_fetch {source:'datacite', id:'10.xxxx/yyyy'}`（**计划/未实现**）。
- **参数键**：`vmu.external.datacite.requireRights`（布尔，默认 `false`）｜`vmu.external.datacite.maxRelated`（整数，默认 `50`）。
- **错误码**：`VMU_EXTERNAL_QUERY_INVALID`｜`VMU_EXTERNAL_UNAVAILABLE`｜`VMU_REF_DANGLING`（`relatedIdentifiers` 指向的目标无法解析时**标注为悬空**，**不删** ✗✓）。
- **交界**：数据集的**版本与长期保存**归 **L10/L22 ＋ 07** ✓。

### 8.7 Software Heritage（SWHID → 源码快照）
- **字段 schema**：`swhRecord{ swhid, origin, visit?, snapshot?, revision?, directory?, metadata? }`。
- **接口形状**：`/api/1/swh/…` 形状；`vibe_vmu_fetch {source:'swh', id:'swh:1:rev:…'}`（**计划/未实现**）。
- **参数键**：`vmu.external.swh.requireSwhid`（布尔，默认 `true`；**无 SWHID 不得声称"已固化源码"** ✗✓）｜`vmu.external.swh.maxTreeEntries`（整数，默认 `0`＝不限）。
- **错误码**：`VMU_EXTERNAL_QUERY_INVALID`（SWHID 形态非法）｜`VMU_EXTERNAL_UNAVAILABLE`。
- **交界**：源码快照的**归档对象**归 **07** ✓；与 G12（第三方归档注册）共用"回执"概念 ✓。

### 8.8 专利检索（**公开检索快照 ＋ 检索式留痕**）
- **字段 schema**：`patentSearchSnapshot{ at, by, database, queryString, resultCount, results[{ publicationNumber, title, applicant, priorityDate, claimsRef? }], url?, note? }`。
- **接口形状**：`vibe_vmu_fetch {source:'patent-search', query:'…'}`（**计划/未实现**）。
- **字段级规则** ✗✓：① **检索式必须留痕**（`queryString` 必填：不可复算的结果不可引用）；② **只登记公开检索快照**（快照＝某时刻的结果集，**不承诺其法律状态** ✗）；③ **不内置任何商业数据库** ✗（`database` 只是字符串标识；接入方式由使用方决定）。
- **参数键**：`vmu.external.patent.requireQueryString`（布尔，**默认 `true`**）｜`vmu.external.patent.maxResults`（整数，默认 `50`；超限**计数截断并自曝** ✓）。
- **错误码**：`VMU_EXTERNAL_QUERY_INVALID`（缺 `queryString`）｜`VMU_BODY_TRUNCATED`（结果集被截断）｜`VMU_EXTERNAL_UNAVAILABLE`。
- **交界**：**法律意见与 FTO 结论不属本卷** ✗（本卷只保证"检索式可复算、快照可追溯" ✓）。

### 8.9 缓存与新鲜度（**过期不得静默使用** ✗✓）
- **缓存键**：`{source, endpoint, queryFingerprint}`（查询指纹＝规范化查询串的指纹；**指纹纪律引用 07** ✓，本键**只为缓存**，不重定义归档指纹 ✗）。
- **TTL**：`vmu.external.ttlMs`（默认 `604800000`＝7 日；`0`＝不过期但**必须记录 `ageMs`**）。
- **过期处置（三选一，必须显式）**：`vmu.external.stalePolicy ∈ {refresh, serve-stale-with-flag, refuse}`
  - `refresh`（默认）：**重取**；取不到 ⇒ 走降级（不得悄悄用旧的 ✗）；
  - `serve-stale-with-flag`：**可用旧值，但必须自曝** —— 回执带 `stale:true` ＋ `ageMs` ＋ `ttlMs`，引用面标 `（缓存过期）`，并记 `VMU_EXTERNAL_STALE_SERVED`（**告知码**，不是失败）；
  - `refuse`：直接**具名拒**（`VMU_STATE`，hint 给 `ageMs/ttlMs`）。
- **外部不可用 ⇒ 具名降级** ✗✓：`VMU_EXTERNAL_UNAVAILABLE` ＋ hint 给 `source/endpoint/缓存命中情况`；**降级路径只有两条**：① 用**已知 stale** 的缓存（自曝）；② 进入**待取数队列**（`pendingFetches[]` 记录，联网后补齐）——**绝不允许编造元数据** ✗。
- **上限与截断**：`vmu.external.maxCacheEntries`（默认 `500`）／`vmu.external.maxBytes`（默认 `1048576`）／`vmu.external.timeoutMs`（默认 `60000`）；**任何超限都必须报丢弃/截断计数** ✗✓（截断正文用 `VMU_BODY_TRUNCATED`）。
- **离线优先**：`vmu.external.allowNetwork`（**默认 `false`** ✗）⇒ 关闭时**只读缓存＋排队**；`vmu.external.offlineFirst`（默认 `true`）⇒ 任何取数先看缓存。

### 8.10 规范化与去重（**同一 DOI 多来源 ⇒ 合并规则 ＋ 冲突自曝**）
- **合并规则（字段级，可复算 ✓）**：
  - **标量字段**（`title`/`publicationYear`/`publisher`/`type`）⇒ 取 `vmu.external.primarySources` **列表中第一个命中的来源**（默认 `['crossref','datacite','arxiv','openalex','pubmed']`）；
  - **数组字段**（`authors`/`subjects`/`relatedIdentifiers`）⇒ 取**并集**，按**来源顺序 + 字段内稳定序**排序（可复算）；
  - **任何字段级不一致** ⇒ 记入 `conflicts[{ field, values:[{source,value}], chosen, why }]` ⇒ **在引用面与状态面自曝** ✗✓（`mergePolicy='fieldwise-union'` 默认；`'refuse-on-conflict'` ⇒ `VMU_EXTERNAL_CONFLICT` 具名拒，hint 给冲突字段与来源清单）。
- **去重**：同一 `(source, id)` 或同一 `resultFingerprint` ⇒ **同一条目**（第二次取数只补 `fetchReceipt`，不新建对象 ✓）；**去重规则与指纹一律引用 07** ✓（本卷**不重定义**归档指纹与去重决策树 ✗）。
- **引用形状**：引用＝**稳定指针 ＋ 指纹 ＋ 可解析 URL**（**不搬全文** ✗）；指针必须在 `07` 可解析，悬空 ⇒ 标 `VMU_REF_DANGLING`（**标注而非删除** ✗✓）。

### 8.11 参数键总表（拟增；由生成管线登记）

| 键 | 类型 | 默认 | 取值域 | 说明 |
|---|---|---|---|---|
| `vmu.external.enabled` | bool | `false` | bool | 取数适配层总开关（默认关＝零机制 ✓） |
| `vmu.external.offlineFirst` | bool | `true` | bool | 先查缓存再谈网络 |
| `vmu.external.allowNetwork` | bool | **`false`** | bool | 默认**禁网**（与 20 卷网络策略同源 ✓） |
| `vmu.external.cacheDir` | string | `<root>/vmu/external-cache` | 路径 | 缓存目录（在 `pathPolicy` 根内 ✓） |
| `vmu.external.ttlMs` | ms | `604800000` | ≥0 | 缓存 TTL（`0`＝不过期但记录 `ageMs`） |
| `vmu.external.stalePolicy` | enum | `refresh` | `refresh｜serve-stale-with-flag｜refuse` | **过期不得静默使用** ✓ |
| `vmu.external.maxCacheEntries` | int | `500` | ≥0 | 缓存条目上限（超限**计数**） |
| `vmu.external.maxBytes` | int | `1048576` | ≥0 | 单次取数上限（超限**截断＋自曝**） |
| `vmu.external.timeoutMs` | ms | `60000` | ≥0 | 单次取数超时 |
| `vmu.external.primarySources` | string[] | `['crossref','datacite','arxiv','openalex','pubmed']` | 子集 | 标量字段的主源顺序 |
| `vmu.external.mergePolicy` | enum | `fieldwise-union` | `fieldwise-union｜refuse-on-conflict` | 多源合并策略 |
| `vmu.external.requireReceipt` | bool | `true` | bool | 每次取数必须留痕（缺 ⇒ 具名拒） |
| `vmu.external.endpoints` | object | `{}` | 源→base | 端点覆盖（只写形状，不承诺可用性 ✗） |
| `vmu.external.crossref.mailto`／`openalex.mailto` | string | `""` | 邮箱串 | 调用方身份参数 |
| `vmu.external.arxiv.preferVersioned`／`maxAbstractChars` | bool／int | `true`／`2000` | — | preprint 版本与摘要上限 |
| `vmu.external.pubmed.maxMeshTerms` | int | `50` | ≥0 | MeSH 上限 |
| `vmu.external.datacite.requireRights`／`maxRelated` | bool／int | `false`／`50` | — | 许可与关联标识上限 |
| `vmu.external.swh.requireSwhid` | bool | `true` | bool | 无 SWHID 不得声称"已固化源码" |
| `vmu.external.patent.requireQueryString`／`maxResults` | bool／int | `true`／`50` | — | 检索式留痕与结果上限 |

### 8.12 错误码总表

| 码 | 语义 | 何时 | 必须给的解释 | 状态 |
|---|---|---|---|---|
| `VMU_EXTERNAL_UNAVAILABLE` | 外部对象/端点不可达（或离线且无缓存） | 取数 | 端点＋缓存命中情况＋**降级路径** | 既有 ✓ |
| `VMU_EXTERNAL_QUERY_INVALID` | 标识符/检索式形态非法 | 取数入口 | 期望形态＋实际值 | **拟增** |
| `VMU_EXTERNAL_STALE_SERVED` | 使用了**过期**缓存（**告知码**，非失败） | 取数 | `ageMs`／`ttlMs`／来源 | **拟增** |
| `VMU_EXTERNAL_CONFLICT` | 多源字段冲突且策略为 `refuse-on-conflict` | 合并 | 冲突字段＋来源清单 | **拟增** |
| `VMU_BODY_TRUNCATED` | 正文/结果集被**计数式截断** | 取数/规范化 | 截断字节与上限 | 既有 ✓ |
| `VMU_REF_DANGLING` | 引用目标不存在（**标注不删**） | 引用 | 悬空引用 id | 既有 ✓ |
| `VMU_META_VALIDATION_FAILED` | 规范化后的元数据不合 schema | 规范化 | 字段＋规则 | 既有 ✓ |
| `VMU_QUOTA_EXCEEDED`／`VMU_RESOURCE_BUDGET` | 触达本地配额/上限 | 取数/缓存 | 当前值与上限 | 既有 ✓ |
| `VMU_TIMEOUT` | 单次取数超时 | 取数 | 当前预算 | 既有 ✓ |
| `VMU_WRITE_FAILED` | 缓存/归档写入失败 | 入档 | 路径与 errno 面 | 既有 ✓ |

### 8.13 交界与验收
- **交界（只引用不重定义 ✗✓）**：**07**（归档对象/指纹/去重/保留）｜**20**（网络策略、密钥与 API key 管理、隐私分类：**授权与凭据全部归 20 卷** ✓）｜**22**（学术运营的台账/凭证与回执面 ✓）｜**21**（取数指标与"stale 比例"告警 ✓）｜**05**（把取数挂在 `record/append-before`／`pack/loading` 等既有钩子上 ✓）。
- **验收（机器可判定 ✓）**：
  1. **具名**：`allowNetwork=false` 且无缓存时取数 ⇒ **`VMU_EXTERNAL_UNAVAILABLE`**（hint 给端点与缓存状态）；**绝不返回伪造元数据** ✗✓。
  2. **断言**：`stalePolicy='serve-stale-with-flag'` 命中过期缓存 ⇒ 回执**必须** `stale:true` ＋ `ageMs`，且**引用面**出现"（缓存过期）"标记；缺任一 ⇒ **红**。
  3. **场景**：同一 DOI 从 Crossref 与 DataCite 各取一次 ⇒ 标量按 `primarySources` 选中、数组取并集、**若有差异则 `conflicts[]` 非空且可读**（**不得静默择一** ✗）。
  4. **红**：反向变异（把 `stalePolicy` 改成"静默使用旧值"／去掉 `fetchReceipt`）⇒ **具名红**（`VMU_EXTERNAL_STALE_SERVED` 消失／`VMU_INVALID_ARGUMENT`）。
  5. 文档审计：本节**未实现**的工具名（`vibe_vmu_fetch`／`vibe_vmu_cite`／`vibe_vmu_external_cache`）**必须与标记词同行** ✓。
- **未核项（编号登记见 `14-§2`）**：① **真实网络调用未实现** ✗（本节只定义**接缝与缓存契约**）；② **限流/配额与人机验证未做** ✗；③ **机构订阅与 API key 管理归 20 卷** ✓（只引用）；④ 七个源的**字段级对齐**未做 ✗（只到"字段清单"层）；⑤ 端点的**版本化协议**（`endpointVersion`）语义未定；⑥ 建议 `14-§2` 新增主题 **T12「外部取数适配层（N11）」** ✓。

