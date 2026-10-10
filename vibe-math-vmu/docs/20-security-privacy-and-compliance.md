# vmu 20 · 安全 · 隐私 · 合规 · 伦理（横切面基础设施卷）

> 状态：**设计稿 v0.2**（v0.1＝通用伦理/隐私/合规；**v0.2 增补 §9.1–§9.4：领域合规包 ＋ 临床（N2）＋ 动物（N3）＋ 两者共用的审批闸/复审/证据包** —— 补批评者第 6 轮的 N2/N3 两处缺口；实现落地后逐字校准）
> 上位：`01-philosophy.md`（R3 四可／R11 具名拒绝）、`02-architecture.md`、`03-interface-contract.md`（服务/工具/码的唯一登记表 ＋ 共享模块码表 ✓）、`18-command-and-protocol-reference.md`（工具与错误码的处置速查 ✓）、`04-settings.md`、`05-middleware.md`、**`16-research-lifecycle.md`（生命周期挂点）**、**`21-observability-and-operations.md`（到期复审的提醒面）**、**`22-academic-operations.md`（台账/凭证包）**
> 邻卷：`07`（归档与保留）、`11`（门禁与发布）、`17`（不变式与人类在环）、`12`（使用者手册）、`14`（未决项与路线图）
> 读者：**研究者/机构管理员**（要合规地跑研究）＋ **机制作者**（要写安全规则）＋ **审计者**（要核账）。

---

## 0. 定位：为什么安全面必须是"一等基础设施"

现状 ✗：全仓仅散落三个键（`vmu.safety.pathPolicy`／`vmu.safety.delegableKeys`／`vmu.safety.approvalRequired`），**没有威胁模型、没有权限矩阵、没有审计链语义、没有去标识化手段**。
本卷把它们写成**可实施**的一组机制：**每个原则 → vmu 手段（键／钩子／工具／协议）＋ 具名码 ＋ 成熟度 ＋ 优先级**。

### 四可关系（本卷的判定方式）
| 维度 | 问法 | 本卷的答案形态 |
|---|---|---|
| **自由度** | 允许谁做什么？ | 权限矩阵（主体×动作×对象） |
| **可调控性** | 用哪个键调？热还是冷？ | `vmu.safety.*`／`vmu.audit.*`／`vmu.privacy.*`／`vmu.ethics.*` |
| **可定义性** | 怎么**断言**它做对了？ | 每条给出**断言／场景／具名红** |
| **扩展性** | 新政策从哪插？ | 新政策＝新 M1 规则；新角色＝新矩阵行 |

---

## 1. 威胁模型（谁可能做什么）

| 主体 | 信任级别 | 可能造成 | 对应防线 |
|---|---|---|---|
| 人类用户（本人） | 高（但仍可误操作） | 误删、误发布、越权读取 | `approvalRequired`、审计链、回收站式保留 |
| 代理成员（LLM） | **中（不可信输入）** | 提示注入、越权写路径、泄露上下文 | 路径策略、能力白名单、输出脱敏、只追加审计 |
| 外部输入（论文/网页/数据） | **低（不可信）** | 注入指令、超长输入、恶意文件 | 输入隔离、长度闸、脚本沙箱 |
| 第三方依赖 | 低 | 供应链投毒 | 依赖锁定、SBOM、可复现构建 |
| 同机其它进程 | 低 | 读凭据、改产物 | 凭据最小暴露、文件权限、签名校验 |

**信任边界**：① 人类 ↔ 代理（最易被绕过）；② 代理 ↔ 宿主子进程（真执行面）；③ 本机 ↔ 外部（网络与跨境）；④ 现在 ↔ 未来（长期保存与不可否认）。

**信号**：所有"跨越边界"的动作都必须**具名留痕**，且**默认拒绝**（fail-closed）。

---

## 2. 能力与权限矩阵

- **12 项能力**（与 `CAPABILITIES` 对应）作为**原子权限**：读产物／写产物／执行脚本／建会议／投票／派任务／归档／检索／网络取数／执行计算／修改设置／管理成员。
- **矩阵形状**：主体（人类／院士／常驻／临时工／外部审稿人）× 动作（12 能力）→ `allow|ask|deny`。

**可调控参数**
- `vmu.safety.capabilityMatrix`（对象；默认内置最小集：外部审稿人＝只读产物）
- `vmu.safety.delegableKeys`（数组；**仅这些键可被委派修改**，默认 `[]`）
- `vmu.safety.approvalRequired`（数组；命中即需人类批准，默认 `["publish","delete","network-egress"]`）

**错误码**：`VMU_FORBIDDEN_CAPABILITY`（未授权能力）、`VMU_APPROVAL_REQUIRED`（需批准）。
**实现要点**：能力检查挂在 `tool.beforeExecute`（M2 钩子），**未命中即具名拒**。
**成熟度** ⚠️（`delegableKeys`／`approvalRequired` 已有；**完整矩阵未接线 ✗**）。**优先级** P0。

- **最小权限**：默认零能力，逐项授予；**职责分离**：批准者 ≠ 执行者（与 **17 卷 S-1…S-6** 交叉引用）。

---

## 3. 沙箱与资源闸

| 维度 | 手段 | 键（拟增） | 成熟度 |
|---|---|---|---|
| 进程 | 子进程服务 + 白名单启动器 | `vmu.safety.execAllowlist` | ⚠️ |
| 文件 | 路径策略（§4） | `vmu.safety.pathPolicy` | ✓（已有） |
| 网络 | 默认禁网 + 显式放行 | `vmu.safety.netPolicy` | ✗ 规划 |
| CPU/内存 | 资源闸 | `vmu.safety.maxMemoryMb`／`vmu.safety.maxCpuMs` | ✗ 规划 |
| 墙钟 | 预算即期限 | `vmu.script.timeoutMs`（已有） | ✓ |

**错误码**：`VMU_RESOURCE_EXCEEDED`、`VMU_NETWORK_DENIED`、`VMU_JOB_TIMEOUT`。
**与计算面交叉** ✓：`vmu.math.*` 的沙箱面（宿主接缝）与本卷同源 ⇒ 两者必须给同一份"允许清单"。
**实现要点**：资源闸在**接缝层**执行（越界 ⇒ **具名拒** ＋ 终止，不得静默截断）。
**成熟度** ⚠️ 部分。**优先级** P0。

---

## 4. 路径与文件安全（`pathPolicy` 完整语义）

**语义要素**：① 根＝工作区（可多根）；② **禁逃逸**（`..`／绝对路径／UNC）；③ **禁符号链接穿越**（解析后仍需在根内）；④ **大小写敏感判定**（Windows 下必须按大小写不敏感比较，避免 `A/../../` 之类绕过）；⑤ **长路径**（>260 字符需显式支持或拒绝）；⑥ **保留名**（`CON`／`NUL` 等）。

**键**：`vmu.safety.pathPolicy`（已有）、`vmu.safety.followSymlinks`（默认 `false`）、`vmu.safety.maxPathLength`（默认 `4096`）。
**错误码**：`VMU_PATH_ESCAPE`（逃逸）、`VMU_PATH_INVALID`（非法/保留名）。
**实现要点**：**先规范化再比较**；两次解析不一致 ⇒ 拒（防 TOCTOU）。
**成熟度** ⚠️（策略键已有，符号链接/长路径语义**未接线 ✗**）。**优先级** P0。

---

## 5. 密钥与签名

- **用途**：审计条目签名（不可否认）、复现包签名、联邦交换对端认证。
- **键**：`vmu.crypto.signingKeyId`（默认 `""`＝未启用）、`vmu.crypto.rotateAfterDays`（默认 `365`）、`vmu.crypto.requireSignedAudit`（默认 `false`）、`vmu.crypto.timestampAuthority`（默认 `""`）。
- **生命周期**：生成 ✓（目标形态）／**轮换**（保留旧公钥以验旧条目）／**丢失处置**（标记"密钥失效"而非删除历史签名）。
- **错误码**：`VMU_SIGNATURE_INVALID`、`VMU_KEY_UNAVAILABLE`。
- **成熟度** ✗ 规划。**优先级** P1。

---

## 6. 审计与不可否认

- **四点**：**只追加**（append-only）、**可轮换**（按日/按大小）、**有保留期**、**可脱敏**。
- **键**：`vmu.audit.dir`（默认 `<root>/vmu/audit`）、`vmu.audit.rotateDaily`（默认 `true`）、`vmu.audit.retentionDays`（默认 `365`）、`vmu.audit.redactKeys`（数组；默认 `["token","key","password","authorization"]`）。
- **接口形状**：`vibe_vmu_records {action:'audit', ...}`（目标形态；**审计写入当前由内核落盘 ✓** —— 见 07 卷）。
- **错误码**：`VMU_AUDIT_WRITE_FAILED`（审计写失败 ⇒ 相关操作必须**失败**，不得"继续但没留痕"）。
- **不可否认**：条目可选签名（§5）；**时间戳**由 `vmu.crypto.timestampAuthority` 提供。
- **成熟度** ✓（落盘与写失败具名已有）／✗（签名与轮换未接线）。**优先级** P0。

---

## 7. 敏感数据分类与去标识化

| 类别 | 例子 | 处理 |
|---|---|---|
| C0 公开 | 已发表数据 | 无限制 |
| C1 内部 | 未发表草稿 | 默认不外发 |
| C2 个人数据（PII） | 姓名/邮箱/ID | **去标识化后才可分析** |
| C3 健康数据（PHI） | 病历 | 需 IRB＋DPIA＋最小暴露 |
| C4 受限/出口管制 | 受控技术 | 禁出境，需合规审批 |

- **键**：`vmu.privacy.classification`（默认 `"C1"`）、`vmu.privacy.piiDetect`（默认 `true`）、`vmu.privacy.deidentify`（`"none"|"pseudonymize"|"k-anonymity"|"differential"`，默认 `"pseudonymize"`）、`vmu.privacy.kAnonK`（默认 `5`）、`vmu.privacy.dpEpsilon`（默认 `1.0`）、`vmu.privacy.minExposure`（默认 `true`）。
- **错误码**：`VMU_PRIVACY_VIOLATION`（未去标识即分析）、`VMU_DATA_CLASS_MISMATCH`。
- **实现要点**：去标识化**发生写入前**（`record.beforeWrite`）；**原数据与映射表分离存放**，映射表加密。
- **成熟度** ✗ 规划。**优先级** P0。

---

## 8. 同意与授权

- **同意记录**：目的、范围、有效期、撤回方式；**撤回**必须能**停止后续使用**（不是删除历史，而是标记不可用）。
- **键**：`vmu.consent.required`（默认 `true`）、`vmu.consent.scopes`（数组）、`vmu.consent.recheckDays`（默认 `365`）。
- **错误码**：`VMU_CONSENT_MISSING`、`VMU_CONSENT_WITHDRAWN`。
- **二次使用**：新目的 ⇒ 需**新同意**（`VMU_CONSENT_MISSING` 具名拒）。
- **成熟度** ✗ 规划。**优先级** P0。

---

## 9. 伦理审批（IRB / DPIA）

- **前置**：人类受试／PII／动物实验／双重用途研究 ⇒ **先审批后执行**。
- **键**：`vmu.ethics.irbRequired`（默认 `true`）、`vmu.ethics.dpiaRequired`（默认 `true`）、`vmu.ethics.dualUseReview`（默认 `true`）、`vmu.ethics.approvalRef`（记录审批编号）。
- **接口形状**：`vibe_vmu_records {action:'append', kind:'ethics', text:'<审批号＋范围>'}`；**无审批号时 `script.beforeRun` 拒绝采集类脚本**。
- **错误码**：`VMU_ETHICS_APPROVAL_MISSING`。
- **成熟度** ✗ 规划。**优先级** P0。

### 9.1 领域合规包（domain compliance pack）——**不内置法条**，只给挂点

> **为什么**：通用 IRB/DPIA 覆盖不了**临床/医学**与**动物实验**（N2/N3）：它们的必答项、审批链与上报时限**都不相同** ✗。但平台**不是法律意见提供者**，也**不能把法条写死** ✗（法域不同、法条会变）。
> **做法**：本卷只定义**三件可组合的东西**，具体法域由使用方拼出来 ✓。

| 三件 | 是什么 | 承载面 |
|---|---|---|
| **① 可声明钩子点** | 把"必须在何时发生什么"落成 **M1 声明**，挂在**既有冻结钩子**上（**不新增钩子** ✗） | `05` 的 20 钩子：`member/wake-before`（开工前闸）／`record/append-before`（写前闸）／`task/assign`・`task/transition`（阶段闸）／`settle/before`（结算闸）／`pack/loading`（装载闸） |
| **② 模板位** | 每个必答项在**记录**里有稳定字段位（`kind` ＋ 字段名），可被审计逐字段核 | **`22` 的台账/凭证面**（**只引用，不重定义** ✗）＋ `07` 的归档对象 |
| **③ 检查表** | 机器可判定的清单：每条＝**判据＋证据指针＋失败码**，审阅人按表核账 | 本卷 §9.2/§9.3 的表；进 `11` 的 T1/T2 **场景**集 |

**组合方式（本项目灵魂）**：`settings（声明键） ＋ middleware（M1 规则／M2 模块执行闸） ＋ pack（把整包分发给他人）` ⇒ **一个具体法域＝一个 pack**（引用 `10` 的打包形态与 `19` 的扩展范式 ✓）。
**抽象上，一个领域包 = 一句可判定的话**：「*未满足 X 证据 ⇒ 不得发生 Y 动作*」，例如「*无 IACUC 方案号 ⇒ 不得开始采集*」✓。

**接口形状（拟增工具，全部为计划 ✗）**：`vibe_vmu_compliance_gate`（**计划/未实现**：跑闸并给出**具名**未满足项）、`vibe_vmu_domain_pack`（**计划/未实现**：列出/校验领域包的三件套是否齐备）。
**可调控参数（拟增键）**：`vmu.compliance.domainPacks`（数组；声明启用了哪些领域包）、`vmu.compliance.requireApprovalGate`（默认 `true`）、`vmu.compliance.evidenceKind`（默认 `"compliance-evidence"`）。
**错误码（拟增）**：`VMU_DOMAIN_PACK_MISSING`（启用了某领域包但**必需挂点/证据位缺失**）、`VMU_GATE_UNSATISFIED`（审批闸未满足，**须点名缺哪一项**）。
**成熟度** ✗ 计划（概念＋挂点表已定；**不含任何法条文本** ✗）。**优先级** P0。

### 9.2 临床/医学研究（**N2**）

> **与 §8/§9 的关系**：同意与伦理的**通用**语义在 §8/§9；本节只加**临床特有**的必答项与时限 ✓（**不重定义** ✗）。

| 必答项 | **机器可判定判据** | 键（拟增） | 码（拟增） |
|---|---|---|---|
| **试验注册号**必填 | 开工（首例入组）前 `vmu.clinical.registrationId` **非空**；给了 `registrationIdPattern` 就必须匹配 ⇒ 否则拒 | `vmu.clinical.registrationRequired`（默认 `true`）、`vmu.clinical.registrationId`、`vmu.clinical.registrationIdPattern`（默认 `""`＝只要求非空） | `VMU_REGISTRATION_MISSING` |
| **知情同意版本化** | 同意记录必须含 `version` ＋ `effectiveAt`（＋`withdrawnAt?`）；**受试所用版本 ≠ 当前生效版本 ⇒ 拒**；**撤回**保留历史、只标记不可用（可追溯 ✓） | `vmu.clinical.consentVersioning`（默认 `true`）；复审复用 `vmu.consent.recheckDays`（§8 ✓） | `VMU_CONSENT_VERSION_MISMATCH`（复用 `VMU_CONSENT_WITHDRAWN` ✓） |
| **SAE/不良事件上报时限** | 事件登记含 `severity`＋`observedAt`＋`reportedAt`；`reportedAt − observedAt > 时限` ⇒ **红**（SAE 与 AE 两个时限） | `vmu.clinical.saeReportLimitHours`（默认 `24`）、`vmu.clinical.aeReportLimitHours`（默认 `72`）、`vmu.clinical.reportChannel`（默认 `""`） | `VMU_SAE_REPORT_OVERDUE`、`VMU_AE_REPORT_OVERDUE` |
| **方案偏离登记** | 偏离须登记 `kind`（`major`/`minor`）＋`reason`＋`at`＋`action`；**`major` 未登记 ⇒ 阻塞结算**（`settle/before` 闸） | `vmu.clinical.deviationRegister`（默认 `true`） | `VMU_PROTOCOL_DEVIATION_MISSING` |
| **数据最小化与去标识化** | **只引用 §7**（`vmu.privacy.*` 的分类/去标识/最小暴露）⇒ **本节不重定义** ✗ | —— | 复用 `VMU_PRIVACY_VIOLATION`／`VMU_DATA_CLASS_MISMATCH` |
| **揭盲/紧急揭盲留痕** | 揭盲动作须记 `who/why/at`＋`emergency`（布尔）；**紧急揭盲须在事后复核登记** ⇒ 否则红 | `vmu.clinical.unblindingRequiresReason`（默认 `true`） | `VMU_UNBLINDING_UNLOGGED` |

**成熟度** ✗ 计划（表＋键＋码；闸点接线待做）。**优先级** P0（决定"能否承载临床研究"）。

### 9.3 动物实验（IACUC 式，**N3**）

| 必答项 | **机器可判定判据** | 键（拟增） | 码（拟增） |
|---|---|---|---|
| **审批闸（未批不得开始）** | 方案须含 `protocolId`＋`species`＋`approvedAt`＋`expiresAt`；`approvedAt > now` **或** `expiresAt ≤ now` ⇒ **拒**；年度复审周期可配 | `vmu.animal.iacucRequired`（默认 `true`）、`vmu.animal.protocolId`、`vmu.animal.reviewCycleDays`（默认 `365`） | `VMU_IACUC_APPROVAL_MISSING`、`VMU_IACUC_EXPIRED` |
| **3R 必答** | `replacement`／`reduction`／`refinement` 三项**逐条非空**（空 ⇒ 拒；逐条可核） | `vmu.animal.threeRRequired`（默认 `true`） | `VMU_THREE_R_INCOMPLETE` |
| **麻醉镇痛声明** | 活体手术类操作须声明麻醉/镇痛方案；**豁免须给理由** | `vmu.animal.anesthesiaRequired`（默认 `true`） | `VMU_ANESTHESIA_UNDECLARED` |
| **人道终点与意外死亡上报** | 事件须含 `kind ∈ {humane-endpoint, unexpected-death}`＋`at`＋`cause`＋`reportedAt`；超时 ⇒ 红 | `vmu.animal.deathReportLimitHours`（默认 `24`） | `VMU_HUMANE_ENDPOINT_REPORT_OVERDUE` |
| **设施资质 / 人员培训** | 设施：`facilityId`＋`accreditation`＋`validUntil`；人员：`personId`＋`trainingId`＋`completedAt`＋有效期；**过期 ⇒ 拒** | `vmu.animal.facilityAccreditation`、`vmu.animal.trainingRequired`（默认 `true`） | `VMU_FACILITY_UNACCREDITED`、`VMU_TRAINING_EXPIRED` |
| **动物数量与来源台账** | 字段：`species`／`count`／`source`／`supplier`／`acclimationDays`；**台账本体在 `22-§2`（仪器与设备/台账）＋`22-§8`（合规与审计运营）** ⇒ 本卷**只引用其对象 id**（`vmu.animal.ledgerRef`），**不重定义台账结构与存储** ✗ | `vmu.animal.ledgerRef` | `VMU_ANIMAL_LEDGER_MISSING` |

**成熟度** ✗ 计划。**优先级** P0（决定"能否承载动物实验"）。

### 9.4 两者共用：审批闸 / 到期复审 / 证据包

**① 审批闸（机器可判定 ✓）**
- **一句话判据**：`gate({ domain, at })` → **未批 / 过期 / 缺必答 ⇒ `VMU_GATE_UNSATISFIED`**，且回执**点名**缺哪一项（"哪个字段、属于哪个必答项"）✓。
- **闸点**（复用既有钩子，**不新增** ✗）：`member/wake-before`（开工前）／`record/append-before`（写前）／`settle/before`（结算前）／`pack/loading`（装载前，用于"领域包自身是否齐备"）。
- **与 §9 的关系**：`VMU_ETHICS_APPROVAL_MISSING`（§9 通用）与本节两域码**并存**：通用缺审批用前者，域内缺必答项用后者 ✓（**不合并**，避免"一个码两种含义"）。
- **失败语义**：闸未满足 ⇒ **该动作不发生**（fail-closed），且**必须**留痕（谁在何时试图做什么、被哪条闸拦住）。

**② 到期与复审提醒——引用 `21`，不重定义** ✗
- 本卷只声明"**复审到期**"应产生的**告警指标/对象/码**（对象＝方案 id；指标＝`compliance.reviewDue`），**提醒机制（阈值/去重/静默/升级/通知通道）一律由 `21-§5.3` 负责** ✓。
- 键（拟增）：`vmu.compliance.reviewAlertLeadDays`（默认 `30`）；码（拟增）：`VMU_REVIEW_DUE`（到期未复审；**提醒用**，不是拒绝）。

**③ 证据包——引用 `22` 与 `07`，不重定义** ✗
- 本卷只声明**证据包的必需成员清单**（谁能一眼看出"这个结论背后有哪些合规证据"✓）：试验注册号／知情同意版本（＋撤回）／SAE·AE 或人道终点·意外死亡上报／3R 答复／审批与资质（含有效期）／方案偏离登记／去标识化记录（§7）。
- **打包、指纹、签名、保留与导出**一律由 `22`（凭证/证据包）与 `07`（归档/保留）负责 ✓；本卷不新增打包器 ✗。
- 键（拟增）：`vmu.compliance.evidenceMembers`（数组；默认＝上述清单）。

**成熟度** ✗ 计划。**优先级** P0。


---

## 10. 数据主权与跨境

- **本地优先**：默认不外发；出境需显式放行并留痕。
- **键**：`vmu.sovereignty.region`（默认 `"local"`）、`vmu.sovereignty.crossBorderAllow`（数组，默认 `[]`）、`vmu.sovereignty.exportControl`（默认 `"none"`）。
- **错误码**：`VMU_CROSS_BORDER_DENIED`。
- **成熟度** ✗ 规划。**优先级** P1。

---

## 11. 许可与合规兼容

- **矩阵（要点）**：`CC-BY-4.0`／`CC0`／`MIT`／`Apache-2.0` 可再分发；`GPL-*` **传染**（派生作品须同许可）；含**专利条款**（Apache-2.0 有，CC 无）。
- **键**：`vmu.license.default`、`vmu.license.codeDefault`、`vmu.license.incompatiblePolicy`（默认 `"deny"`）、`vmu.license.attributionRequired`（默认 `true`）。
- **错误码**：`VMU_LICENSE_INCOMPATIBLE`。
- **成熟度** ✗ 规划。**优先级** P1。

---

## 12. 供应链安全

- **三件**：**依赖锁定**（lockfile）、**SBOM**（生成物清单）、**可复现构建**（同输入 ⇒ 同哈希）。
- **键**：`vmu.supplychain.sbomPath`（默认 `<root>/vmu/sbom.json`）、`vmu.supplychain.requireLock`（默认 `true`）、`vmu.supplychain.reproducibleBuild`（默认 `false`）。
- **错误码**：`VMU_SUPPLYCHAIN_UNLOCKED`、`VMU_BUILD_NOT_REPRODUCIBLE`。
- **成熟度** ⚠️（锁文件 ✓；SBOM／可复现构建 ✗）。**优先级** P1。

---

## 13. 事件响应

- **分级**：S0 数据泄漏／S1 越权写／S2 服务中断／S3 审计缺口。
- **流程**：**止损**（冻结相关能力）→ **取证**（读审计链）→ **披露**（按政策与时限）→ **复盘**（写回 14 卷路线图）。
- **键**：`vmu.incident.freezeCapabilities`（数组）、`vmu.incident.notifyContacts`（数组）、`vmu.incident.disclosureDays`（默认 `30`）。
- **错误码**：`VMU_INCIDENT_FROZEN`（冻结期内相关动作一律具名拒）。
- **成熟度** ✗ 规划。**优先级** P1。

---

## 14. 人类在环与紧急制动

- **两档**：`ask`（需批准）与 **紧急制动**（一键冻结全部写/外发能力）。
- **交叉引用** ✓：与 **17 卷 §19** 同源（人类在环不变式）。
- **键**：`vmu.safety.killSwitch`（布尔，默认 `false`）、`vmu.safety.askOn`（数组，默认 `["publish","network-egress","delete"]`）。
- **错误码**：`VMU_KILL_SWITCH_ENGAGED`。
- **成熟度** ⚠️（`approvalRequired` 已有；kill switch ✗）。**优先级** P0。

---

## 15. 合规映射（原则 → vmu 手段）

| 原则（GDPR 式／FAIR／期刊政策） | vmu 手段 | 成熟度 |
|---|---|---|
| 合法性·目的限定 | 同意记录 ＋ `vmu.consent.scopes` | ✗ |
| 数据最小化 | `vmu.privacy.minExposure` ＋ 分类门 | ✗ |
| 准确性 | 结论须带出处（07 归档） | ✓ |
| 存储限定 | `vmu.audit.retentionDays`／`vmu.data.retention` | ⚠️ |
| 完整性与保密性 | 审计链 ＋ 密钥签名 ＋ 沙箱 | ⚠️ |
| 可问责 | **具名**审计条目（谁在何时做了什么） | ✓ |
| FAIR：可发现/可访问/可互操作/可复用 | 稳定标识 ＋ 归档轨 ＋ 许可声明 | ⚠️ |
| 期刊：数据可得性 | 禁"应要求提供"（`vmu.avail.requireUrl`） | ✗ |
| 期刊：复现包 | RO-Crate/BagIt 式打包 | ✗ |

---

## 16. 验收（机器可判定）

1. **具名**：越权能力／路径逃逸／未去标识分析／无审批采集／无理由删除 ⇒ **一律具名拒**（`VMU_FORBIDDEN_CAPABILITY`／`VMU_PATH_ESCAPE`／`VMU_PRIVACY_VIOLATION`／`VMU_ETHICS_APPROVAL_MISSING`／`VMU_APPROVAL_REQUIRED`）。
2. **断言**：审计目录**只追加**（写失败 ⇒ 操作失败）；`pathPolicy` 对 `..`／符号链接／大小写变体**全部拒绝**（各一条断言）。
3. **场景**：至少 5 条可复跑场景（越权写入被拒／路径逃逸被拒／PII 未去标识被拒／kill switch 生效／审计链可取证）。
4. **红**：反向变异（放开某条策略）必须产出**具名红**。
5. 文档审计：**未实现**的 `vibe_vmu_*` 工具名**必须与标记词同行**，否则视为**红**。
6. **域闸（断言）**：`gate({domain:'clinical'})` 且 `vmu.clinical.registrationId` 为空 ⇒ **拒**且回执**点名** `registrationId`；`gate({domain:'animal'})` 且 `expiresAt ≤ now` ⇒ **拒**且回执**点名** `expiresAt`（**未批不得开始** ✓）。
7. **时限（断言）**：SAE 的 `reportedAt − observedAt > vmu.clinical.saeReportLimitHours` ⇒ `VMU_SAE_REPORT_OVERDUE`（**红**）；人道终点/意外死亡 > `vmu.animal.deathReportLimitHours` ⇒ `VMU_HUMANE_ENDPOINT_REPORT_OVERDUE`（**红**）。
8. **版本（场景）**：受试所用同意版本 ≠ 当前生效版本 ⇒ `VMU_CONSENT_VERSION_MISMATCH`；**撤回后历史仍可追溯**（只标记不可用、不删历史 ✓）。
9. **3R（具名）**：`replacement`／`reduction`／`refinement` 任一为空 ⇒ `VMU_THREE_R_INCOMPLETE`，且回执**点名**缺的是哪一项。

---

## 17. 与既有卷的双向交叉引用

| 本卷 | 读 | 写回 |
|---|---|---|
| 权限矩阵／最小权限 | **02**（架构）／**03**（工具） | 02 补"能力矩阵"节 |
| 键与热类别 | **04**（设置） | 04 收 39 个拟增键 |
| 钩子（能力检查/同意/审批） | **05**（中间件） | 05 补 5 个安全钩子 |
| 保留与脱敏 | **07**（归档） | 07 补"审计保留" |
| 发布前安全门 | **11**（门禁） | 11 增"安全断言组" |
| 人类在环 | **17**（不变式） | 17 与本卷互指 |
| 使用者操作 | **12**（手册） | 12 增"安全配方" |
| 规划项 | **14-§2** | 新增主题 **T10「安全·隐私·合规」** |
| 领域合规包（挂点／模板位／检查表） | **05**（钩子）／**10**（pack 形态）／**19**（扩展范式） | 05 补"合规挂点"示例；10 收"领域包"形态 |
| 台账与凭证（动物数量/来源、证据成员） | **22**（§2 仪器与设备/台账、§8 合规与审计运营、§12 接口形状总表、§13 键表） | 22 收 `vmu.animal.ledgerRef` 所指向的对象（**本卷只引用，不重定义** ✗） |
| 复审到期提醒 | **21**（§5.3 告警面／§14 R 表） | 21 增指标 `compliance.reviewDue`（机制由 21 负责 ✓） |
| 证据包打包/保留/签名 | **22**（凭证包）／**07**（归档与保留） | 07/22 复用既有打包与保留（本卷**不新增打包器** ✗） |
| 合规闸点落在生命周期的哪里 | **16**（§1 L1–L24） | 16 标注"合规闸点"对应的 L 阶段（只标注，不改流程 ✓） |

---

## 18. 未核项

- 本卷**全部 ✗ 规划项**：工具面/钩子**未实现** ⇒ 照抄会失败；落地后逐条补**场景**；
- **39 个拟增键**未进 `settings/planned.js` 生成管线（回报中列出）⇒ 登记后以管线为准；
- **12 项能力**与 `CAPABILITIES` 的**逐项对齐**未核（需读 02/03 后核对）；
- **17 卷 S-1…S-6** 的具体编号与措辞未核（本卷仅按名称引用）；
- **许可兼容矩阵**只给要点（GPL 传染／专利条款），**未**逐许可核对；
- 编号登记见 **14-§2**（主题 T1–T9；本卷建议新增 **T10**）。
- **领域合规（N2/N3）未核项** ✗：
  1. **具体法域法条映射未做** ✗（本卷**刻意不内置法条**：只给挂点＋模板位＋检查表；法域映射属使用方 pack）⇒ 登 `14-§2`；
  2. **外部系统对接未做** ✗（如 ClinicalTrials.gov／e-Submission 等登记与申报系统，见 N11 的**外部 API 面**）⇒ 登 `14-§2`；
  3. **`22` 卷的台账/凭证对象名未核** ✗（本卷按 `22-§2`／`22-§8`／`22-§12` 引用；具体对象 id 与字段待核）；
  4. **`21` 卷的告警具体键未登记** ✗（`vmu.alerts.*` 现仅通配 ⇒ 复审提醒的接线待 `21` 定键）；
  5. **域包装载闸未实现** ✗（`pack/loading` 上"领域包自身是否齐备"的检查）；
  6. **闸的判据函数未实现** ✗（`gate({domain,at})` 的字段级判据表已定，代码未写）；
  7. 建议 `14-§2` 新增 **N2（临床/医学研究合规）** 与 **N3（动物实验合规）** 两条主题编号（编号登记见 **`14-§2`** ✓）。
