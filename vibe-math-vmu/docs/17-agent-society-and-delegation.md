# vmu 17 · 代理自组织与协作（Agent Society & Delegation）

> 状态：**设计稿 v0.1（深水区）** —— 理念里那句"**框架＋settings＋中间件＋代理自组织**"的括号，本卷把它**具体到接口、参数、错误码与成熟度** ✓。
> 上位：`00-README.md`（阅读顺序）、`01-philosophy.md`（R1 内核零策略／R2 能力与挂点齐备／R5 中间件／R6 登记即契约／R11 可观测）、`02-architecture.md`（内核分区与四层模型）、`03-interface-contract.md`（登记处）、`04-settings.md`（参数全表）、`05-middleware.md`（钩子全表）、`06-prompt-pipeline.md`（提示词管线）、`07-durability-library.md`（归档与台账）、`14-open-items-and-roadmap.md`（未决/未核登记）。
> **与 08 卷的分工（**双向交叉引用** ✓）**：**08＝治理（governance）**——会议/表决/工作流/任务板/控制流；**17＝社会（society）**——角色/招募/委托/信任/仲裁/记忆/技能/竞标/交接/带教/纪律/拓扑/自组织/身份/公平/可解释/人类在环。
> **交界处只写一次** ✗：**规则层面的"怎样决定"归 08**（三层门槛、表决方法、阶段门、WIP、预算硬门）；**人际层面的"谁与谁、凭什么、留什么痕"归 17**（席位与任职、委托链、声誉、仲裁者选择、交接包、宪章）。两卷互相引用的地方**给出对方的确切节号** ✓。
> **记账纪律**：① 正文可写**具体键名** ✓（登记管线见 `scripts/generate-planned-settings.mjs`：它从各卷**发现**键并写入 `settings/planned.js`，类型 `planned`、默认 `null` ⇒ 文档承诺不会变成"已实现" ✗）；② **未实现**的 `vibe_vmu_*` 工具名**必须与标记词同行**（`未实现/未接线/规划/提案/待实现/目标形态/尚未/roadmap/⛔`）✓；③ 每个 `VMU_*` 码都列进给 Lead 的回报 ✓。

---

## 0. 读法、条目模板与四条哲学

### 0.1 条目模板（本卷每项基础设施按 11 字段写成一条）

`名称` ｜ **目的** ｜ **面向谁** ｜ **接口形状**（服务方法／工具／钩子／协议） ｜ **可调控参数**（具体键名或族） ｜ **相关错误码** ｜ **四条哲学**（自由度 F·可调控性 T·可定义性 D·扩展性 X） ｜ **实现要点** ｜ **依赖与前置** ｜ **成熟度**（**已实现 ✓ / 未实现 ✗**） ｜ **优先级**（P0–P3）。

> **设计目标 vs 实现保证（本卷纪律，与 §0.2 同源）**：凡**未标 ✓** 的机制，其"**机器强制**／**必须在…**／**断言**／**具名红**"一律是**设计验收目标** ✗，**不是今天的实现保证** —— 在实现并由门禁守住之前**不得据以推理** ✓（现状见各条"成熟度"、`settings/planned.js` 的 `planned:true`、§25 未核项 → `14-§2` ✓）。本卷**已实现的底座**只有：`vmu.members`（席位/容量/任职）＋`vmu.store/library/work/tasks`（记忆与台账）＋08 的治理原语 ✓；**19 个社会服务、11 个社会工具、28 个社会钩子全部为规划** ✗。

### 0.2 本卷的六条社会不变式（**设计不变式：实现前不得据以推理** ✗）

> **实现状态（诚实 ✗，独立批评者第 5 轮点名）**：S-1…S-6 是**设计目标**，不是今天的机器事实 ✓ —— 其中 **S-2（委托只减权）／S-5（人类在环优先）／S-6（身份与归属可分）目前零实现** ✗（`vmu.delegation.*`／`vmu.identity.*` 都还是 `settings/planned.js` 里的**计划键** ✓，全树没有委托/审批优先级的执行代码 ✓）。⇒ 在它们被实现并由门禁守住之前，**不得**把本表当作"系统保证"来推理 ✗；逐条现状与实现归属见 §21／§22 ✓，未核项见 §25（→ `14-§2`）✓。

| # | 不变式 | 为什么 | 违反了会怎样 |
|---|---|---|---|
| S-1 | **席位不携带策略**：内核只给 role **slot**（名字＋容量＋不透明权限），**任何角色名不得出现在内核** ✓ | 沿用 01-§5 的 **D5** | 换机构要改内核 ⇒ 零策略破产 |
| S-2 | **委托永远是"减权的"**：委托只能**收窄**调用者的能力与范围，**不得**扩大；不可转授自己没得到的权限 | 权限的本源是席位 | 代理自我提权（最危险的失败模式） |
| S-3 | **声誉不改变权限**：声誉/评分**只影响"被选中/被信任"的建议与排序**，**永不**变成票权、席位或预算 ✓ | 防止"好评换权力" | 形成不可审计的寡头 |
| S-4 | **每次委托/仲裁/交接都必须有 `reason`** 且可被第三方复算 ✓ | 可解释（R11） | 无法回答"凭什么" |
| S-5 | **人类在环优先**：人类审批/否决可以**打断任何自动流转**，且**不消耗**代理配额 | 责任在人 | 自动化把人类架空 |
| S-6 | **身份与归属可分**：代理实例身份（本地）与人类/组织身份（宿主 SSO/OIDC）**分离**；跨机构迁移须重新绑定 ✓ | 本地槽位 vs 宿主身份边界 | 冒名与越权 |

### 0.3 四条哲学自检（每节末都能回答）

- **自由度（F）**：默认**不建社会**（无席位、无委托、无评分）⇒ 不声明就是"一群独立代理" ✓；
- **可调控性（T）**：每个旋钮给默认/域/热改等级/谁可改 ✓；
- **可定义性（D）**：凡是"规则"都落在 **判定点**（`society.*` 谓词）或 **pack 声明**（宪章/席位表）⇒ 不改内核 ✓；
- **扩展性（X）**：新拓扑/新选拔制/新声誉模型**只加数据与判定点** ✓。

---

## 1. 社会本体：实例／席位／机构／身份／归属

### 1.1 实体与关系（**先定名，后定协议**）

| 实体 | 是什么 | 关键字段 | 成熟度 |
|---|---|---|---|
| **AgentInstance（代理实例）** | 一次运行中的一个"在飞"代理 | `id`、`sessionId`、`slot`、`state(live/idle/ended)`、`since`、`wakes`、`parentId?` | **已实现 ✓**（`kernel.members` 的 `roster()` 给 `{id,slot,state,since,wakes}` ✓） |
| **RoleSlot（席位）** | 机构里的位置（名字＋容量＋不透明权限） | `id`（kebab-case）、`capacity`（0＝不限）、`permissions[]`（不透明字符串） | **已实现 ✓**（`roles()` ✓；容量在 `assignRole`/`hire` 双向强制 ✓） |
| **Institution（机构）** | 一套席位表＋章程＋台账的集合 | `id`、`charter{}`、`slots[]`、`tracks[]`、`parentId?`、`createdAt` | **部分 ✓**（pack 声明席位/轨道 ✓；**一等机构实体 = 未实现 ✗**） |
| **Charter（宪章）** | 机构自组织的规则文本＋结构化条款 | `version`、`clauses[]`、`amendedBy[]`、`effectiveAt` | **未实现 ✗**（当前靠 pack 代码，无宪章对象 ✗） |
| **Identity（身份）** | 本地身份（槽位/实例） | `localId`、`slot`、`boundAt`、`boundBy` | **部分 ✓**（`config.instance` 身份自证 ✓） |
| **Principal（宿主主体）** | 宿主侧的人类/账号（SSO/OIDC） | `sub`、`iss`、`email?`、`roles[]` | **未接线 ✗**（vmu 不读宿主身份 ✗） |
| **Membership（归属）** | 实例↔机构↔主体的绑定 | `{instanceId, institutionId, principalSub?, since, evidence}` | **未实现 ✗** |

### 1.2 身份与归属的边界（**本地槽位 vs 宿主 SSO/OIDC**）

- **本地**：`kernel.members` 的席位身份**完全本地**，不依赖宿主身份 ✓；`may(id,permission)` 只做包含判断 ✓。
- **宿主**：DSH 侧的主体身份（SSO/OIDC claims）**当前未读取** ✗ ⇒ 任何"按人类账号授权"的设计**必须**标注为未接线 ✓。
- **桥**：规划 `vmu.identity.principalBinding`（`off｜advisory｜required`）——`required` 时"没有宿主主体绑定就不得任职"；**默认 `off`** ✓（不引入宿主耦合）。
- **迁移**：跨机构迁移＝**重新绑定**（`Membership` 变更留痕）；**不搬运**主体身份 ✗。

---

## 2. 角色模型（Role Slots / Capacity / 任职与任期 / 罢免）

- **席位与容量** ｜ 目的：让"位置"与"人"分离（一个槽位可换人） ｜ 面向谁：机构管理者／pack ｜ 接口形状：**已实现 ✓** `kernel.members.roles()/roster()/hire({id,slot})/assignRole(id,slot)/end(id,reason)`；工具面规划 `vibe_vmu_roles`（⛔ 未实现） ｜ 可调控：`vmu.roles.*` ｜ 错误码：`VMU_INVALID_ARGUMENT`（未知槽位）／`VMU_MIDDLEWARE_FAILED`（重复槽位 ✓）／`VMU_RESOURCE_BUDGET`（容量或内存上限 ✓）／`VMU_SLOT_FULL`（拟增） ｜ 哲学：F✓（不声明则无席位）T✓D✓X✓ ｜ 实现要点：容量在 **两个入口**都强制（`hire` 与 `assignRole` ✓），否则 pack 可绕过 ✓ ｜ 依赖：pack 声明 `slots[]` ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **任职与任期（term）** ｜ 目的：位置**有期限**（到期自动复核，而不是永久占有） ｜ 面向谁：管理者 ｜ 接口形状：规划 `kernel.members.setTerm(id,{untilMs,renewable})`（⛔ 未实现） ｜ 可调控：`vmu.roles.termDefaultMs`／`termMaxMs`／`renewable` ｜ 错误码：`VMU_ROLE_TERM_EXPIRED`（拟增）／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：到期**不自动撤销**（只发提醒与标记 `expired`），撤销须显式或以宪章条款触发 ✓ ｜ 依赖：席位 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **罢免与轮换（recall / rotation）** ｜ 目的：坏任命有出口 ｜ 面向谁：宪章规定的机关（会议/人类） ｜ 接口形状：规划 `kernel.members.recall(id,{by,why,quorum})`（⛔ 未实现）＋与 **08 卷** `meeting_*`／`ballot_*` 衔接（动议→表决 ✓ 08-§2.2/§3） ｜ 可调控：`vmu.roles.recallQuorum`／`recallCoolDownMs` ｜ 错误码：`VMU_RECALL_QUORUM_NOT_MET`（拟增）／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：罢免**只改席位状态**（`end` ✓），**不删历史** ✗；被罢免者可申诉（§6） ｜ 依赖：08 表决面 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **代理长幼与代理主持（seniority / acting）** ｜ 目的：负责人缺席时由**指定代理人**维持 ｜ 面向谁：管理者 ｜ 接口形状：规划 `kernel.roles.acting(slot,{by,until,why})`（⛔ 未实现）；与 08 的主持代理/`chairProxy` 面衔接 ✓ ｜ 可调控：`vmu.roles.actingMaxMs`／`actingNeedsReason` ｜ 错误码：`VMU_ACTING_NOT_ALLOWED`（拟增）／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：代理人**只继承该席位的最小必要权限**（S-2）＋留痕＋到期自动失效 ✓ ｜ 依赖：席位＋委托（§4） ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **职责分离（separation of duties）** ｜ 目的：避免"自己批准自己" ｜ 面向谁：机构 ｜ 接口形状：规划 `society.separationOfDuties` 判定点（⛔ 未实现） ｜ 可调控：`vmu.roles.separationPairs`（如 `{proposer,approver}` 不得同一实例） ｜ 错误码：`VMU_DUTY_CONFLICT`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：判定点**只做否决**（不做任命）；冲突方必须回避（与 08 的回避面衔接 ✓ 08-§3.3/§12.3） ｜ 依赖：席位＋任务 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1

---

## 3. 招募与选拔（能力声明 / 试用期 / 晋升 / 席位裂变）

- **能力声明（capability claim）** ｜ 目的：代理**自报**能做什么，供协商与匹配 ｜ 面向谁：全体 ｜ 接口形状：规划 `kernel.skills.declare(id,{skills[],evidence[],ttlMs})`（⛔ 未实现）；工具面规划 `vibe_vmu_skills`（⛔ 未实现） ｜ 可调控：`vmu.skills.*` ｜ 错误码：`VMU_SKILL_UNKNOWN`（拟增）／`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：声明**不作为权限**（S-3 同族）＋可带 `evidence`（引用 07 归档 id ✓）＋`ttlMs` 到期自动降级为"未验证" ✓ ｜ 依赖：07 归档 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **招募（recruit）** ｜ 目的：按需增员且**有据** ｜ 面向谁：管理者 ｜ 接口形状：**部分 ✓**（`hire({id,slot})` ✓ 是"入册"，不是"选拔"）+ 规划 `kernel.recruit.open/close/decide`（⛔ 未实现） ｜ 可调控：`vmu.recruit.*` ｜ 错误码：`VMU_RESOURCE_BUDGET`（上限 ✓）／`VMU_SLOT_FULL`（拟增）／`VMU_RECRUIT_CLOSED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：招募**不得**绕过容量与内存上限（沿用 08 的机器强制纪律 ✓）；候选人来源可以是人类、宿主子代理或**已有实例转岗** ✓ ｜ 依赖：席位 ✓＋`vmu.limits.maxLiveMembers` ✓ ｜ 成熟度：**部分 ✓** ｜ 优先级：P1
- **试用期（probation）** ｜ 目的：新席位**先受限再放权** ｜ 面向谁：管理者 ｜ 接口形状：规划 `kernel.recruit.probation(id,{untilMs,limits{}})`（⛔ 未实现） ｜ 可调控：`vmu.recruit.probationMs`／`probationPermissions` ｜ 错误码：`VMU_PROBATION_ACTIVE`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：试用期＝**权限收窄＋额外审计**，不是"二等公民"；到期自动复核 ✓ ｜ 依赖：席位＋审计 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **晋升与降级（promotion / demotion）** ｜ 目的：能力与位置匹配 ｜ 面向谁：管理者 ｜ 接口形状：规划 `kernel.roles.promote/demote(id,{to,why,evidence})`（⛔ 未实现） ｜ 可调控：`vmu.roles.promotionNeedsEvidence` ｜ 错误码：`VMU_NOT_PERMITTED`／`VMU_SLOT_FULL` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：`why`＋`evidence` 必填（S-4）；晋升**不得**跳过容量 ✓ ｜ 依赖：席位＋技能库 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **席位裂变（slot fission）** ｜ 目的：一个席位压力过大时**拆成多个** ｜ 面向谁：机构／人类 ｜ 接口形状：规划 `kernel.charter.fission(slot,{into[],by,why})`（⛔ 未实现） ｜ 可调控：`vmu.charter.fissionMax`／`fissionNeedsHuman` ｜ 错误码：`VMU_CHARTER_FISSION_LIMIT`（拟增）／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：裂变＝**宪章修订**（新版本＋生效时点），不是悄悄加人 ✗；裂变后必须复核依赖与容量 ✓ ｜ 依赖：宪章（§15） ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3

---

## 4. 委托与转委（Delegation / Sub-delegation）

- **委托（grant a scope to another instance）** ｜ 目的：让"授权"成为**可审计、会过期、只减权**的一等动作（对齐 08 的临时授权面 ✓，但对象是**实例/席位**而非单条命令） ｜ 面向谁：任何有权限者 ｜ 接口形状：规划 `kernel.delegation.grant({to,scope{commands[],resources[],untilMs?},why})`（⛔ 未实现）；工具面规划 `vibe_vmu_delegate`（⛔ 未实现） ｜ 可调控：`vmu.delegation.*` ｜ 错误码：`VMU_DELEGATION_ESCALATION`（拟增，**试图扩大权限**）／`VMU_DELEGATION_EXPIRED`（拟增）／`VMU_NOT_PERMITTED`／`VMU_NO_SUCH_OBJECT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**S-2（设计目标）**：`scope ⊆ grantor.scope`，否则**具名拒**（这是本卷最硬的检查；**实现时**由内核强制，**当前未实现** ✗）＋`why` 必填（S-4）＋到期/事件失效 ✓ ｜ 依赖：席位权限 ✓（`may()` ✓）＋08 授权面 ✓ ｜ 成熟度：**未实现 ✗**（08 已有**命令级**临时授权 `meeting_grant` 语义 ✓；本卷是**实例级**委托） ｜ 优先级：P0
- **转委（sub-delegation）** ｜ 目的：链路化授权 ｜ 面向谁：受托方 ｜ 接口形状：规划 `kernel.delegation.subdelegate`（⛔ 未实现） ｜ 可调控：`vmu.delegation.maxDepth`（默认 **1**＝不许转委）／`subdelegateAllowed` ｜ 错误码：`VMU_DELEGATION_DEPTH`（拟增）／`VMU_DELEGATION_ESCALATION` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**默认禁止转委** ✓；若开启：深度上限＋**链上每一跳都不得超过授予者原有范围**＋禁环 ✓ ｜ 依赖：委托 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **撤销与回收（revoke）** ｜ 目的：授权随时可收 ｜ 面向谁：授予者／管理者 ｜ 接口形状：规划 `kernel.delegation.revoke(id,{why})`（⛔ 未实现） ｜ 可调控：`vmu.delegation.revokeBroadcast`（默认 true） ｜ 错误码：`VMU_NO_SUCH_OBJECT`／`VMU_DELEGATION_EXPIRED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：撤销**立即生效**＋广播＋在飞任务**不静默取消**（转为"待交接"，§11）✓ ｜ 依赖：委托＋在途台账（07/08） ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **委托预算（delegation budget）** ｜ 目的：授权也**消耗资源**（防止用委托绕过预算 ✗） ｜ 面向谁：授予者 ｜ 接口形状：规划 `kernel.delegation.budget(id)`（⛔ 未实现） ｜ 可调控：`vmu.delegation.tokenShare`／`turnsShare`／`onExhausted(refuse|return)` ｜ 错误码：`VMU_RESOURCE_BUDGET`（复用 ✓）／`VMU_DELEGATION_BUDGET`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**子预算从母预算里扣**（复式记账），触界只拒该项委托、不动全局 ✓ ｜ 依赖：08 预算族（`vmu.budget.*`／`vmu.limits.*` ✓） ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **委托留痕与可解释（audit trail）** ｜ 目的：每次委托都能回答"谁、凭什么、到什么时候、给了什么" ｜ 面向谁：审计者／人类 ｜ 接口形状：规划 `kernel.delegation.history({by,to,scope,at,until,why,chain[]})`（⛔ 未实现） ｜ 可调控：`vmu.explain.includeChains`（默认 true） ｜ 错误码：`VMU_EXPLAIN_DENIED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：留痕**进 07 归档**（可引用、可复算 ✓）；解释报告是**只读** ✓ ｜ 依赖：07 归档 ✓＋05 钩子 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1

---

## 5. 信任与声誉（Trust / Reputation）

- **可审计评分（auditable scoring）** ｜ 目的：把"谁靠谱"变成**可复核的公开记录**，而不是印象 ｜ 面向谁：全体／管理者 ｜ 接口形状：规划 `kernel.trust.score(subject,{dimension,delta,evidence,why})`（⛔ 未实现）；工具面规划 `vibe_vmu_trust`（⛔ 未实现） ｜ 可调控：`vmu.trust.*` ｜ 错误码：`VMU_TRUST_SELF_SCORE`（拟增，不得给自己打分）／`VMU_TRUST_EVIDENCE_REQUIRED`（拟增）／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**S-3（设计目标）**：评分**只进排序与建议**，**绝不**改权限/票权/预算 ✓（**实现时**阻断，**当前未实现** ✗）；每条评分带 `evidence`（引用归档 id ✓） ｜ 依赖：07 归档 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **衰减与时效（decay）** ｜ 目的：旧功劳不能永久吃老本 ｜ 面向谁：机构 ｜ 接口形状：规划 `kernel.trust.recompute({windowMs})`（⛔ 未实现） ｜ 可调控：`vmu.trust.halfLifeMs`／`minSamples`／`decayOnEnd` ｜ 错误码：`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：衰减**只读重算**（幂等 ✓）；样本不足 ⇒ 展示为"证据不足"而不是 0 分 ✓ ｜ 依赖：评分 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **申诉与更正（appeal / correction）** ｜ 目的：错误评分可纠正 ｜ 面向谁：被评者 ｜ 接口形状：规划 `kernel.trust.appeal(id,{why,evidence})`（⛔ 未实现）＋与 08 的申诉面衔接（08-§2.2-B ✓） ｜ 可调控：`vmu.trust.appealWindowMs`／`appealNeedsEvidence` ｜ 错误码：`VMU_TRUST_APPEAL_WINDOW`（拟增）／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：更正**不删除**原记录（追加更正条目 ✓，与 07 的"只增"纪律一致） ｜ 依赖：评分＋07 归档 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **防串谋（collusion resistance）** ｜ 目的：互相刷分的联盟必须可被发现 ｜ 面向谁：审计者 ｜ 接口形状：规划 `kernel.trust.collusionScan({windowMs})`（⛔ 未实现） ｜ 可调控：`vmu.collusion.*` ｜ 错误码：`VMU_COLLUSION_SUSPECTED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：扫描**只报告**（`suspects[]`＋理由），**不自动惩罚** ✗；判据示例：同一小圈互评占比、时间聚集、互为唯一证据源 ✓ ｜ 依赖：评分＋审计 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **声誉的用途边界** ｜ 目的：说清"声誉能干什么" ｜ 面向谁：全体 ｜ 接口形状：**只是约定＋判定点**（规划 `society.trustUsage` ⛔ 未实现） ｜ 可调控：`vmu.trust.useIn{selection,arbitration,auction}` ｜ 错误码：`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：允许的用途＝**候选人排序／仲裁者排序／报价加权**；**禁止**用途＝票权、席位、预算、否决（S-3 ✓） ｜ 依赖：评分 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1

---

## 6. 冲突与仲裁（Escalation / Arbitration）

- **升级（escalation）** ｜ 目的：僵局有上级 ｜ 面向谁：任何一方 ｜ 接口形状：规划 `kernel.conflict.escalate({subject,to,why,evidence})`（⛔ 未实现）＋**08 已有**的 `vmu.workflow.escalationAfterMs/escalationTarget` ✓（机器提醒） ｜ 可调控：`vmu.conflict.*`／`vmu.workflow.escalationTarget` ✓ ｜ 错误码：`VMU_CONFLICT_TARGET_UNKNOWN`（拟增）／`VMU_CONFLICT_LIMIT`（拟增）／`VMU_NO_SUCH_OBJECT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：升级**只提醒与归档**，**不自动改状态** ✗（与 08 同纪律）；同级不得反复升级（限次） ｜ 依赖：08 工作流 ✓ ｜ 成熟度：**未实现 ✗**（提醒侧 ✓） ｜ 优先级：P1
- **仲裁者选择（arbiter selection）** ｜ 目的：谁来判 ｜ 面向谁：双方／机构 ｜ 接口形状：规划 `kernel.arbitration.pick({candidates,rule})`（⛔ 未实现）＋08 已有 `vmu.arbitration.mode/binding/recordInMinutes` ✓（开关与效力） ｜ 可调控：`vmu.conflict.arbiterRule`（`senior-slot｜random｜mutual｜human`）／`arbiterMustDiffer` ｜ 错误码：`VMU_ARBITER_UNAVAILABLE`（拟增）／`VMU_DUTY_CONFLICT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：仲裁者**不得**是当事人（职责分离 ✓）；选择规则**事先写明**（防临时挑裁判 ✗） ｜ 依赖：席位＋声誉（§5） ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **仲裁过程与效力（hearing / bindingness）** ｜ 目的：结论可执行 ｜ 面向谁：双方 ｜ 接口形状：规划 `kernel.arbitration.open/cite/rule`（⛔ 未实现）＋**会议/表决面复用 08**（听证＝会议，裁决＝决议 ✓ 08-§2/§3） ｜ 可调控：`vmu.arbitration.binding` ✓（08）／`vmu.conflict.appealToHuman` ｜ 错误码：`VMU_ARBITRATION_OFF`（拟增）／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：结论进**纪要**（08-§2.2-E ✓）＋进 **07 台账**（可检索 ✓）；不服可上诉到人类（§19） ｜ 依赖：08 会议/表决 ✓ ｜ 成熟度：**部分 ✓**（08 的开关/效力面 ✓） ｜ 优先级：P1
- **冲突登记与冷却（conflict registry / cooldown）** ｜ 目的：避免同一矛盾反复爆 ｜ 面向谁：机构 ｜ 接口形状：规划 `kernel.conflict.list/cooldown`（⛔ 未实现） ｜ 可调控：`vmu.conflict.cooldownMs`／`maxOpenConflicts` ｜ 错误码：`VMU_CONFLICT_LIMIT`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：冷却**不封口**（仍可升级到人类 ✓） ｜ 依赖：冲突登记 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **与 08 共识面的接口** ｜ 目的：分歧最终要有出口 ｜ 面向谁：全体 ｜ 接口形状：**08 提供**会议/动议/表决/三层门槛（✓ 08-§2.2/§3.2）；**17 提供**"谁参与、谁回避、谁仲裁"（席位/职责分离/仲裁者） ｜ 可调控：见两卷各自族 ｜ 错误码：`VMU_MEETING_*`（08）／`VMU_CONFLICT_*`（17） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**不得**用声誉替代票（S-3）；**不得**用仲裁替代表决（程序问题走 08 申诉面 ✓） ｜ 依赖：08 ✓ ｜ 成熟度：**已定义 ✓**（交界说明） ｜ 优先级：P0

---

## 7. 共识与分歧（Consensus & Dissent）

- **共识形成协议（consensus protocol）** ｜ 目的：把"大家同意"变成可判定状态 ｜ 面向谁：全体 ｜ 接口形状：**复用 08** 的表决与三层门槛（✓ 08-§3.2/§13.1）＋规划 `society.consensus` 判定点（⛔ 未实现，用于"何时算达成共识"的地方性口径） ｜ 可调控：`vmu.consensus.*` ｜ 错误码：`VMU_CONSENSUS_NOT_REACHED`（拟增）／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**过程读数不裁定**（沿用 08 的 I-1 ✓）；共识**不抹平少数**（保留异议，§7 下条） ｜ 依赖：08 表决 ✓ ｜ 成熟度：**部分 ✓**（表决面）+ 判定点 ✗ ｜ 优先级：P1
- **异议与保留（dissent / reservation）** ｜ 目的：少数意见入档并可触发复议 ｜ 面向谁：全体 ｜ 接口形状：**复用 08** 的 `vmu.minutes.dissentMandatory` ✓／`vmu.ballot.reopenInitiatorScope` ✓／少数意见入档纪律 ✓ ｜ 可调控：08 族（✓）＋`vmu.consensus.dissentRetentionMs` ｜ 错误码：`VMU_MINUTES_*`（08）／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**不得**把未表态折算为同意（08 I-3 ✓）；异议必须可检索 ✓ ｜ 依赖：08 纪要 ✓＋07 归档 ✓ ｜ 成熟度：**已定义 ✓** ｜ 优先级：P0
- **分歧分类（disagreement taxonomy）** ｜ 目的：分清"事实分歧/价值分歧/资源分歧"，走不同出口 ｜ 面向谁：主持人／仲裁者 ｜ 接口形状：规划 `kernel.conflict.classify({kind})`（⛔ 未实现） ｜ 可调控：`vmu.conflict.classes`（默认 `fact｜value｜resource`；**分类只定义一处** ✓，见 §20.4） ｜ 错误码：`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：事实分歧 ⇒ 走验证（09 形式化/数学面 ✓）；价值分歧 ⇒ 走表决（08 ✓）；资源分歧 ⇒ 走预算与公平（§17） ｜ 依赖：08/09/17 三面 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **共识的可撤回性（revocability）** ｜ 目的：新证据出现时能改主意 ｜ 面向谁：全体 ｜ 接口形状：**复用 08** `ballot.reopen` ✓＋`vmu.ballot.reopenFloor/reopenInitiatorScope` ✓ ｜ 可调控：08 族 ✓ ｜ 错误码：`VMU_REOPEN_*`（08） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：撤回**不删旧结论**（追加 ✓）＋限制发起人（防滥诉 ✓） ｜ 依赖：08 ✓ ｜ 成熟度：**已实现 ✓** ｜ 优先级：P1

---

## 8. 代理记忆与知识（Memory & Knowledge）

- **跨会话记忆（durable memory）** ｜ 目的：重启/换会话后**不丢自己** ｜ 面向谁：每个实例 ｜ 接口形状：**已实现 ✓**＝`vmu.store`（`open/read/write/patch/subscribe/migrate/export/import/stats` ✓）＋`vmu.library`（`append/record/list/expand/storedFingerprint/fingerprint` ✓）；规划 `vibe_vmu_memory`（⛔ 未实现） ｜ 可调控：`vmu.memory.*` ｜ 错误码：`VMU_STORE_FAILED`（✓）／`VMU_IO_FAILED`（✓）／`VMU_MEMORY_KEY_UNSCOPED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**绝不写进宿主会话日志**（沿用 07 硬限制 ✓）；键必须**带作用域**（实例/机构）以防串味 ✓ ｜ 依赖：07 耐久层 ✓ ｜ 成熟度：**已实现 ✓**（底层）／**记忆语义层 ✗** ｜ 优先级：P0
- **经验卡片（experience cards）** ｜ 目的：把"踩过的坑"沉淀成可检索卡 ｜ 面向谁：全体 ｜ 接口形状：规划 `kernel.memory.card({kind,lesson,evidence,scope})`（⛔ 未实现）＋**复用 08** 的记录分轨（`vmu.records.tracks` ✓／`Progress/{routes,obstacles,rejected,state}.md` ✓） ｜ 可调控：`vmu.memory.cardTtlMs`／`cardKinds`／`requireEvidence` ｜ 错误码：`VMU_MEMORY_CARD_INVALID`（拟增）／`VMU_INVALID_ARGUMENT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：卡片**只增不改**（更正＝新卡 ✓）；必带来源（07 归档 id ✓） ｜ 依赖：07 ✓＋08 记录分轨 ✓ ｜ 成熟度：**部分 ✓**（分轨已有） ｜ 优先级：P1
- **技能库（skill library）** ｜ 目的：可复用的"怎么做" ｜ 面向谁：全体 ｜ 接口形状：规划 `kernel.skills.register/use/retire`（⛔ 未实现）；与 09 的数学/形式化能力衔接 ✓ ｜ 可调控：`vmu.skills.*` ｜ 错误码：`VMU_SKILL_UNKNOWN`（拟增）／`VMU_SKILL_RETIRED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：技能＝**声明＋指向实现**（脚本 id／工具名），不含隐藏状态 ✓ ｜ 依赖：M3 脚本面 ✓（`vibe_vmu_script` ✓） ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **记忆的可见性与最小必要（visibility）** ｜ 目的：谁能读谁的记忆 ｜ 面向谁：全体 ｜ 接口形状：规划 `society.memoryVisibility` 判定点（⛔ 未实现） ｜ 可调控：`vmu.memory.visibility`（`private｜institution｜public`，默认 `institution`）／`redactPatterns` ｜ 错误码：`VMU_MEMORY_VISIBILITY_DENIED`（拟增）／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**私聊内容永不进入公共记忆**（沿用 08 的 D6 口径 ✓）；引用只带摘要＋稳定指针 ✓ ｜ 依赖：07 头部列表 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **遗忘与压缩（forgetting / compaction）** ｜ 目的：记忆不能无限膨胀 ｜ 面向谁：机构 ｜ 接口形状：**部分 ✓**＝07 的截断与计数（`vmu.records.truncateMode` ✓／`truncationReport()` ✓）；规划 `kernel.memory.compact({keepEvery,budget})`（⛔ 未实现） ｜ 可调控：`vmu.memory.compactEveryMs`／`keepEvery`／`neverDropKinds` ｜ 错误码：`VMU_MEMORY_COMPACTION_REFUSED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：压缩**只动摘要，不动原始归档** ✓；丢弃必须**计数并具名**（不得静默 ✗） ｜ 依赖：07 ✓ ｜ 成熟度：**部分 ✓** ｜ 优先级：P2
- **记忆的继承与交接** ｜ 目的：换人时不失忆 ｜ 面向谁：接班人 ｜ 接口形状：**§11 交接包**（规划 ✗）＋07 归档 ✓ ｜ 可调控：`vmu.handover.includeMemoryScopes` ｜ 错误码：`VMU_HANDOVER_INCOMPLETE`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：交接包含**指针而非全文**（对齐 S21 头部列表纪律 ✓） ｜ 依赖：§11 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1

---

## 9. 技能与能力协商（Capability Negotiation）

- **能力目录（capability catalogue）** ｜ 目的：全所"谁会什么"一查即知 ｜ 面向谁：全体 ｜ 接口形状：规划 `kernel.skills.catalog()`（⛔ 未实现）＋07 头部列表模式 ✓（只给头部，不给正文 ✓） ｜ 可调控：`vmu.skills.catalogTtlMs`／`includeEvidence` ｜ 错误码：`VMU_SKILL_UNKNOWN`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：目录**只读**；每项标"已声明/已验证"（与 §3 声明呼应 ✓） ｜ 依赖：§3 声明＋07 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **协商（negotiation）** ｜ 目的：任务、能力、预算三方对齐 ｜ 面向谁：双方 ｜ 接口形状：规划 `kernel.skills.negotiate({task,need,offer})`（⛔ 未实现）＋**08 的任务竞标面**（§10） ｜ 可调控：`vmu.skills.negotiationRounds`（默认 1）／`mustAcceptReason` ｜ 错误码：`VMU_NEGOTIATION_FAILED`（拟增）／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：协商**有界**（轮数上限 ✓）；失败必须**具名给理由**（不得沉默拒绝 ✗） ｜ 依赖：任务板（08 ✓） ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **能力降级（degraded capability）** ｜ 目的：做不到时说清楚并给替代 ｜ 面向谁：双方 ｜ 接口形状：规划 `society.capabilityDegrade` 判定点（⛔ 未实现） ｜ 可调控：`vmu.skills.degradePolicy`（`refuse｜partial｜reassign`） ｜ 错误码：`VMU_SKILL_DEGRADED`（拟增）／`VMU_ENGINE_UNAVAILABLE`（✓） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：降级**必须写清降了什么**（可解释 ✓）；不得"假装能做" ✗ ｜ 依赖：§9 协商 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **能力与权限的分离** ｜ 目的：会做 ≠ 有权做 ｜ 面向谁：全体 ｜ 接口形状：**约定＋判定点**（规划 `society.canExercise` ⛔ 未实现） ｜ 可调控：`vmu.skills.requiresPermission`（默认 true） ｜ 错误码：`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：能力只影响**匹配与排序**；执行仍走权限（S-2/S-3 ✓） ｜ 依赖：席位权限 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1

---

## 10. 任务竞标与分配（Auction / Bid / Claim）

- **竞标（auction）** ｜ 目的：让"谁来做"由**报价与能力**决定 ｜ 面向谁：全体 ｜ 接口形状：规划 `kernel.auction.open/bid/close`（⛔ 未实现）；工具面规划 `vibe_vmu_auction`（⛔ 未实现）＋**复用 08 任务板**（`vmu.tasks.*` ✓／`meeting_task_claim` 语义 ✓） ｜ 可调控：`vmu.auction.*` ｜ 错误码：`VMU_AUCTION_CLOSED`（拟增）／`VMU_AUCTION_INVALID_BID`（拟增）／`VMU_RESOURCE_BUDGET`（✓） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：结标规则**事先写明**（最低价/最优评分/随机）；**不得**因声誉直接内定（S-3 ✓） ｜ 依赖：任务板（08 ✓）＋预算（08 ✓） ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **报价（bid）** ｜ 目的：把成本/时间/风险讲清楚 ｜ 面向谁：投标者 ｜ 接口形状：规划 `kernel.auction.bid({taskId,cost{tokens,turns,wallMs},plan,confidence})`（⛔ 未实现） ｜ 可调控：`vmu.auction.maxBidCost`／`requirePlan` ｜ 错误码：`VMU_AUCTION_INVALID_BID`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：报价**进审计**；虚报低价者由**完工复盘**反制（§13 纪律 ✓） ｜ 依赖：预算 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **认领（claim）** ｜ 目的：简单场景不必竞标 ｜ 面向谁：全体 ｜ 接口形状：**已实现 ✓**（08 的 `vibe_vmu_task {action:'assign'}` ✓ 与"认领"语义面 ✓；`claimRequired` 在 08 §19.5 ✓） ｜ 可调控：`vmu.workflow.claimRequired` ✓（08）／`vmu.auction.claimFirst`（默认 true） ｜ 错误码：`VMU_TASK_*`（08）／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**先认领后竞标**（默认）⇒ 小任务不开标（避免仪式过重 ✓） ｜ 依赖：08 任务板 ✓ ｜ 成熟度：**已实现 ✓**（认领侧） ｜ 优先级：P0
- **分配（assignment / dispatch）** ｜ 目的：有人定夺时直接派 ｜ 面向谁：管理者 ｜ 接口形状：**已实现 ✓** `vibe_vmu_task {action:'assign'}` ✓ ｜ 可调控：08 族 ✓ ｜ 错误码：`VMU_RESOURCE_BUDGET`（✓）／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：派单**必须带验收标准**（08 `create/assign` 面 ✓）；不得派给已满席位（容量 ✓） ｜ 依赖：席位＋任务 ✓ ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **防挑活与公平轮转（anti-cherry-picking）** ｜ 目的：脏活也得有人干 ｜ 面向谁：机构 ｜ 接口形状：规划 `society.dispatchFairness` 判定点（⛔ 未实现） ｜ 可调控：`vmu.auction.fairnessPolicy`／`dirtyWorkQuota`／`rotationWindow` ｜ 错误码：`VMU_FAIRNESS_QUOTA`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：配额**只影响分配顺序**（不改权限 ✓）；轮转记录可审计 ✓ ｜ 依赖：§17 公平 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2

---

## 11. 交接（Handover & Context Package）

- **交接单（handover）** ｜ 目的：换人/换会话时**责任不悬空** ｜ 面向谁：交出方→接手方 ｜ 接口形状：规划 `kernel.handover.open/accept/close`（⛔ 未实现）；工具面规划 `vibe_vmu_handover`（⛔ 未实现）＋**07 在途台账**（`vmu.work.start/settle/interrupt/recover` ✓） ｜ 可调控：`vmu.handover.*` ｜ 错误码：`VMU_HANDOVER_INCOMPLETE`（拟增）／`VMU_HANDOVER_NOT_ACCEPTED`（拟增）／`VMU_NO_SUCH_OBJECT` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：交接单必含 **①现状 ②未决项 ③指针（不是全文）④风险 ⑤验收标准**；未接受前原负责人**仍担责** ✓ ｜ 依赖：07 台账 ✓＋08 任务 ✓ ｜ 成熟度：**部分 ✓**（台账中断/恢复 ✓）／交接单 ✗ ｜ 优先级：P0
- **上下文压缩包（context package）** ｜ 目的：把"必要的上下文"打包成**有界、可引用**的一束 ｜ 面向谁：接手方 ｜ 接口形状：规划 `kernel.handover.pack({scopes[],budgetBytes})`（⛔ 未实现）＋**复用 07** 的头部列表与指纹（`vmu.records.headListAt` ✓／`pointerPropagation` ✓） ｜ 可调控：`vmu.handover.packBudgetBytes`／`includeKinds`／`requireFingerprint` ｜ 错误码：`VMU_HANDOVER_PACK_TOO_BIG`（拟增）／`VMU_IO_FAILED`（✓） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**指针优先**（对齐 S21／07 纪律 ✓）；超预算 ⇒ **截断并计数**（不静默 ✗）；每项带稳定 id ＋指纹 ✓ ｜ 依赖：07 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **待续标记（pending work）** ｜ 目的：重启后知道"谁还有活" ｜ 面向谁：接手方／管理者 ｜ 接口形状：**已实现 ✓**（07/08：`pendingWork`／`interrupted()`／`recover()` ✓） ｜ 可调控：08 族 ✓ ｜ 错误码：`VMU_STATE`（✓） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：交接**不得**清掉未结算的待续标记（只有 `settle` 才清 ✓） ｜ 依赖：07 ✓ ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **交接的失败与回退（failed handover）** ｜ 目的：接手方跑路了怎么办 ｜ 面向谁：机构 ｜ 接口形状：规划 `society.handoverFallback` 判定点（⛔ 未实现） ｜ 可调控：`vmu.handover.acceptTimeoutMs`／`onTimeout(return｜reassign｜escalate)` ｜ 错误码：`VMU_HANDOVER_TIMEOUT`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：超时**默认退回原负责人**（最保守 ✓）＋升级（§6） ｜ 依赖：§6 升级 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2

---

## 12. 监护与带教（Mentor / Mentee）

- **结对（pairing）** ｜ 目的：新席位有师傅 ｜ 面向谁：管理者 ｜ 接口形状：规划 `kernel.mentor.pair(mentee,mentor,{untilMs,scope})`（⛔ 未实现） ｜ 可调控：`vmu.mentor.*` ｜ 错误码：`VMU_MENTOR_UNAVAILABLE`（拟增）／`VMU_MENTOR_SELF_PAIR`（拟增）／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：带教关系**不授予权限**（S-2 ✓）；师傅能看到徒弟的**公共面**，私有面仍需授权 ✓ ｜ 依赖：席位＋§9 能力 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **复核（review）** ｜ 目的：带教有产出 ｜ 面向谁：师傅 ｜ 接口形状：规划 `kernel.mentor.review(menteeId,{verdict,notes,evidence})`（⛔ 未实现） ｜ 可调控：`vmu.mentor.reviewEveryMs`／`verdicts`（`pass｜needs-work｜escalate`） ｜ 错误码：`VMU_MENTOR_REVIEW_MISSING`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：复核进**审计与声誉证据**（§5 ✓）；**不得**由师徒互评单独决定晋升（防串谋 §5 ✓） ｜ 依赖：§5 信任＋§3 晋升 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **毕业与转正（graduation）** ｜ 目的：试用期有明确终点 ｜ 面向谁：管理者 ｜ 接口形状：规划 `kernel.mentor.graduate(menteeId,{why,evidence})`（⛔ 未实现） ｜ 可调控：`vmu.mentor.graduationNeedsHuman`（默认 false） ｜ 错误码：`VMU_PROBATION_ACTIVE`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：转正＝解除试用期限制（§3 ✓）＋留痕 ｜ 依赖：§3 试用期 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3

---

## 13. 纪律与熔断（Discipline / Circuit Breaker）

- **配额（quota）** ｜ 目的：限制单实例的资源占用 ｜ 面向谁：机构 ｜ 接口形状：**已实现 ✓**＝08/内核 `vmu.limits.*`（`maxParallel`／`toolCallsPerTurnCap`／`memoryCeilingMb`／`maxLiveMembers` ✓）＋`VMU_RESOURCE_BUDGET` ✓ ｜ 可调控：`vmu.limits.*` ✓／`vmu.discipline.*` ｜ 错误码：`VMU_RESOURCE_BUDGET`（✓）／`VMU_DISCIPLINE_QUOTA`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**机器强制、不靠提示词**（沿用 08 纪律 ✓）；触界给"当前值＋上限" ✓ ｜ 依赖：内核 ✓ ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **熔断（circuit breaker）** ｜ 目的：连续失败就停手，别拖垮全所 ｜ 面向谁：机构 ｜ 接口形状：**部分 ✓**＝05 中间件已有 `vmu.middleware.breakerThreshold` ✓（中间件级）；规划 `kernel.discipline.breaker(instance,{reason})`（⛔ 未实现，实例级） ｜ 可调控：`vmu.discipline.breakerFailures`／`breakerWindowMs`／`halfOpenAfterMs` ｜ 错误码：`VMU_DISCIPLINE_CIRCUIT_OPEN`（拟增）／`VMU_MIDDLEWARE_FAILED`（✓） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：熔断＝**只停新任务**（不杀在飞 ✗）；必须**具名**说明触发原因与恢复条件 ✓ ｜ 依赖：05 中间件 ✓＋07 台账 ✓ ｜ 成熟度：**部分 ✓** ｜ 优先级：P1
- **封禁与恢复（ban / restore）** ｜ 目的：屡犯者停职，且**可恢复** ｜ 面向谁：机构／人类 ｜ 接口形状：规划 `kernel.discipline.suspend/restore`（⛔ 未实现） ｜ 可调控：`vmu.discipline.suspendMaxMs`／`restoreNeedsHuman`（默认 true） ｜ 错误码：`VMU_DISCIPLINE_SUSPENDED`（拟增）／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：停职＝**席位状态变更**（不删历史 ✓）；恢复需人类或宪章程序（§19 ✓） ｜ 依赖：席位 ✓＋§15 宪章 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **复盘与学习（postmortem）** ｜ 目的：失败要变成经验 ｜ 面向谁：全体 ｜ 接口形状：规划 `kernel.discipline.postmortem({incident,lesson})`（⛔ 未实现）＋07 经验卡片（§8 ✓） ｜ 可调控：`vmu.discipline.postmortemRequired`（默认 true） ｜ 错误码：`VMU_DISCIPLINE_POSTMORTEM_MISSING`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：复盘**只增卡、不追责权力**（追责走 §5/§6）✓ ｜ 依赖：§8 记忆 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2

---

## 14. 多代理协作拓扑（Topologies）

> 拓扑是**声明**（`vmu.topology.mode` ＋ pack 的席位/阶段），不是内核分支 ✓。

| 拓扑 | 适用条件 | 优点 | 代价/风险 | 与 settings/pack 的组合 | 成熟度 |
|---|---|---|---|---|---|
| **星型（star）** | 有一个天然负责人（主持/院士） | 决策快、责任清 | 单点瓶颈；负责人崩则全停 | 席位表指定中心槽位＋08 会议（`kind:'general'`） | **可实现 ✓**（席位＋任务＋会议都在 ✓） |
| **委员会（committee）** | 需要多视角、少数派保护 | 公平、可审计 | 慢、易僵局 | 08 §15 `committee`＋§7 共识＋§6 仲裁 | **部分 ✓**（会议 ✓／委员会实体 ✗，08 §15 标 ✗） |
| **市场（market）** | 任务可并行、成本可估 | 价格发现、资源优化 | 竞价虚报、串谋 | §10 竞标＋§17 公平＋08 预算 | **未实现 ✗** |
| **流水线（pipeline）** | 阶段清晰、依赖线性 | 吞吐高、易观测 | 一处堵全停（WIP！） | 08 §4.2 阶段机＋`vmu.board.*`（WIP） | **部分 ✓**（阶段 ✓／看板 ✗） |
| **群体（swarm）** | 探索型、无中心 | 鲁棒、并行 | 重复劳动、结论难收敛 | §10 认领＋§7 共识＋预算硬门 | **未实现 ✗** |
| **矩阵（matrix）** | 双线汇报（业务＋专题） | 资源复用 | 责任冲突 | §2 职责分离＋§6 升级 | **未实现 ✗** |
| **层级（hierarchy）** | 规模大、需分权 | 可扩展 | 层级僵化、信息失真 | §15 子机构＋§4 委托链 | **未实现 ✗** |

- **拓扑选择（topology selection）** ｜ 目的：按任务形状选结构 ｜ 面向谁：机构／人类 ｜ 接口形状：规划 `society.topology` 判定点（⛔ 未实现）＋`vmu.topology.mode` ｜ 可调控：`vmu.topology.mode`（`star｜committee｜market｜pipeline｜swarm｜matrix｜hierarchy`，默认 `star`）／`autoSelect` ｜ 错误码：`VMU_TOPOLOGY_UNSUPPORTED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：拓扑**只影响调度与寻址**，不改变权限模型（S-2 ✓）；切换拓扑须留痕（§15 宪章 ✓） ｜ 依赖：席位＋任务＋会议 ｜ 成熟度：**未实现 ✗**（星型≈当前能力 ✓） ｜ 优先级：P2
- **拓扑与预算的交互** ｜ 目的：市场/群体最烧钱 ｜ 面向谁：机构 ｜ 接口形状：复用 08 `vmu.budget.*` ✓ ｜ 可调控：`vmu.topology.budgetMultiplier` ｜ 错误码：`VMU_RESOURCE_BUDGET`（✓） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：切换拓扑时**预算上限不变**（不得偷偷加倍 ✗） ｜ 依赖：08 预算 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3

---

## 15. 自组织协议（Self-organisation / Charter）

- **子机构创设（spawn a sub-institution）** ｜ 目的：允许"所里有所" ｜ 面向谁：宪章授权者／人类 ｜ 接口形状：规划 `kernel.charter.spawn({parentId,charter,slots[],by,why})`（⛔ 未实现）；工具面规划 `vibe_vmu_charter`（⛔ 未实现） ｜ 可调控：`vmu.charter.*` ｜ 错误码：`VMU_CHARTER_NOT_AUTHORIZED`（拟增）／`VMU_CHARTER_DEPTH`（拟增）／`VMU_RESOURCE_BUDGET`（✓） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：子机构**继承但不放大**权限（S-2 ✓）；层级深度有上限；**人类可一键解散** ✓ ｜ 依赖：§2 席位＋08 预算 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **机构宪章（charter）** ｜ 目的：把"这个机构怎么运转"写成**可版本化的数据** ｜ 面向谁：机构／人类 ｜ 接口形状：规划 `kernel.charter.get/amend/history`（⛔ 未实现） ｜ 可调控：`vmu.charter.amendNeedsQuorum`（默认 true）／`amendNeedsHuman`／`frozenClauses[]` ｜ 错误码：`VMU_CHARTER_FROZEN`（拟增）／`VMU_CHARTER_QUORUM`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：修订＝**新版本＋生效时点**（不覆盖旧版 ✓）；**冻结条款**（如 S-1…S-6）即使表决也不可改 ✗ ｜ 依赖：08 表决（修订走表决 ✓）＋§18 审计 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **席位裂变与合并（fission / merge）** ｜ 目的：结构随任务变化 ｜ 面向谁：宪章授权者 ｜ 接口形状：规划 `kernel.charter.fission/merge`（⛔ 未实现） ｜ 可调控：`vmu.charter.fissionMax`／`mergeNeedsHuman` ｜ 错误码：`VMU_CHARTER_FISSION_LIMIT`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：裂变/合并**同时改席位表与容量**，必须复核在飞任务归属 ✓ ｜ 依赖：§2／§3 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **解散与继承（dissolve / succession）** ｜ 目的：机构能体面结束 ｜ 面向谁：人类 ｜ 接口形状：规划 `kernel.charter.dissolve({by,why,successor?})`（⛔ 未实现） ｜ 可调控：`vmu.charter.dissolveNeedsHuman`（默认 **true** ✓） ｜ 错误码：`VMU_CHARTER_DISSOLVE_DENIED`（拟增）／`VMU_STATE` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：解散＝**归档**（07 ✓）＋在飞任务交接或升级；**不得**留下悬空任务 ✓ ｜ 依赖：§11 交接＋07 归档 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **宪章与 pack 的关系** ｜ 目的：别出现两套规则 ｜ 面向谁：pack 作者／机构 ｜ 接口形状：**约定**：pack＝**装载期**的结构与默认值（10 号 ✓）；宪章＝**运行期**可修订的规则（本卷 ✓）；冲突 ⇒ pack 声明优先还是宪章优先**必须写明**（拟：**宪章 > pack 默认**，但不得越过 S-1…S-6 ✗） ｜ 可调控：`vmu.charter.precedence`（默认 `charter-over-pack`） ｜ 错误码：`VMU_PACK_CONFLICT`（✓）／`VMU_CHARTER_CONFLICT`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：冲突**具名拒**，不得静默择一 ✗ ｜ 依赖：10 packs ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1

---

## 16. 身份与归属（Identity & Membership）

- **本地身份（local identity）** ｜ 目的：实例身份自证 ｜ 面向谁：框架 ｜ 接口形状：**已实现 ✓**＝`config.instance`（身份自证 ✓）＋`kernel.members.roster()` ✓ ｜ 可调控：`vmu.identity.localFormat` ｜ 错误码：`VMU_NOT_MEMBER`（✓）／`VMU_NO_SUCH_OBJECT`（✓） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：身份**只在本地有效**；跨机构必须重新绑定 ✓ ｜ 依赖：内核 ✓ ｜ 成熟度：**已实现 ✓** ｜ 优先级：P0
- **宿主主体绑定（principal binding）** ｜ 目的：需要时把代理挂到人类账号上 ｜ 面向谁：机构／人类 ｜ 接口形状：**未接线 ✗**（vmu 当前不读宿主 SSO/OIDC claims；规划 `vibe_vmu_identity`，⛔ 未实现） ｜ 可调控：`vmu.identity.principalBinding`（`off｜advisory｜required`，默认 `off`）／`trustedIssuers[]`／`claimMap{}` ｜ 错误码：`VMU_IDENTITY_UNBOUND`（拟增）／`VMU_IDENTITY_ISSUER_UNTRUSTED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**默认不引入宿主耦合** ✓；`required` 时缺绑定**不得任职**（具名拒 ✓） ｜ 依赖：宿主身份接缝（未接线 ✗） ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **归属与多机构（membership）** ｜ 目的：一个实例能不能属于多个机构 ｜ 面向谁：机构 ｜ 接口形状：规划 `kernel.identity.memberships(id)`（⛔ 未实现） ｜ 可调控：`vmu.identity.multiMembership`（默认 **false**）／`maxMemberships` ｜ 错误码：`VMU_IDENTITY_MULTI_DENIED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：默认**单一归属**（避免责任不清 ✓）；多归属时**权限取交集**（S-2 ✓） ｜ 依赖：席位 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **化名与匿名（pseudonymity）** ｜ 目的：某些场景要保护提出者 ｜ 面向谁：机构 ｜ 接口形状：规划 `kernel.identity.pseudonym(scope)`（⛔ 未实现） ｜ 可调控：`vmu.identity.allowPseudonym`（默认 false）／`pseudonymScopes[]` ｜ 错误码：`VMU_IDENTITY_PSEUDONYM_DENIED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**匿名不等于不可审计**（审计侧保留可解绑映射 ✓）；**投票匿名**另有 08 的 `vmu.ballot.secrecy` ✓ ｜ 依赖：08 表决匿名面 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **身份变更与离职（end of membership）** ｜ 目的：人走账清 ｜ 面向谁：管理者 ｜ 接口形状：**已实现 ✓**＝`kernel.members.end(id,reason)` ✓ ｜ 可调控：`vmu.identity.onEnd`（`archive｜handover｜both`，默认 `both`） ｜ 错误码：`VMU_STATE`（✓）／`VMU_HANDOVER_INCOMPLETE`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：离职**必须走交接**（§11 ✓）＋归档（07 ✓）；在飞任务不得丢 ✓ ｜ 依赖：§11＋07 ✓ ｜ 成熟度：**部分 ✓** ｜ 优先级：P0

---

## 17. 公平与防串谋（Fairness & Anti-collusion）

- **资源公平（resource fairness）** ｜ 目的：不让强代理吃光预算 ｜ 面向谁：机构 ｜ 接口形状：**部分 ✓**＝08 `vmu.budget.fairnessPolicy` ✓（`equal｜priority｜reserve`）＋规划 `kernel.fairness.rebalance`（⛔ 未实现） ｜ 可调控：`vmu.fairness.*`／08 族 ✓ ｜ 错误码：`VMU_FAIRNESS_DENIED`（拟增）／`VMU_RESOURCE_BUDGET`（✓） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：再平衡**只改配额**（不改权限 ✓）＋必须解释"为什么给谁多少" ✓ ｜ 依赖：08 预算 ✓ ｜ 成熟度：**部分 ✓** ｜ 优先级：P1
- **机会公平（access fairness）** ｜ 目的：任务不被小圈子包圆 ｜ 面向谁：机构 ｜ 接口形状：规划 `society.accessFairness` 判定点（⛔ 未实现） ｜ 可调控：`vmu.fairness.minShares{}`／`newcomerQuota` ｜ 错误码：`VMU_FAIRNESS_QUOTA`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：配额**只影响分配顺序与候选集**（不改权限 ✓） ｜ 依赖：§10 分配 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **防串谋（anti-collusion）** ｜ 目的：互刷、抱团、围标可被发现 ｜ 面向谁：审计者／人类 ｜ 接口形状：规划 `kernel.collusion.scan({windowMs})`（⛔ 未实现） ｜ 可调控：`vmu.collusion.windowMs`／`maxMutualShare`／`onSuspect(report｜freeze)`（默认 **report** ✓） ｜ 错误码：`VMU_COLLUSION_SUSPECTED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**只报告不自动惩罚** ✗；判据公开（可复算 ✓）＋误报可申诉（§5 ✓） ｜ 依赖：§5 信任＋§18 审计 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **反垄断（anti-monopoly）** ｜ 目的：单实例不得掌握过多关键席位 ｜ 面向谁：机构 ｜ 接口形状：规划 `society.concentrationLimit` 判定点（⛔ 未实现） ｜ 可调控：`vmu.fairness.maxSlotsPerInstance`（默认 1，**同机构**）／`criticalSlots[]` ｜ 错误码：`VMU_FAIRNESS_CONCENTRATION`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：上限**只挡任职**（已在职者不强制免职，改走罢免程序 §2 ✓） ｜ 依赖：§2 席位 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3
- **公平的可解释（fairness explainability）** ｜ 目的：分配结果要能解释 ｜ 面向谁：全体 ｜ 接口形状：规划 `kernel.fairness.explain(decisionId)`（⛔ 未实现） ｜ 可调控：`vmu.explain.fairnessDetail`（`summary｜full`） ｜ 错误码：`VMU_EXPLAIN_DENIED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：解释是**只读报告**；必须给"受影响者清单" ✓ ｜ 依赖：§18 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P3

---

## 18. 审计与可解释（Auditability & Explainability）

- **委托审计（delegation audit）** ｜ 目的：每次授权都有据 ｜ 面向谁：审计者 ｜ 接口形状：**部分 ✓**＝07 审计落盘（`vmu/audit/<date>.jsonl` ✓）＋各服务 `history()` ✓；规划统一查询（§4 ✓／08 `vmu.audit.*` ✓） ｜ 可调控：`vmu.audit.*` ✓（08）／`vmu.explain.*` ｜ 错误码：`VMU_IO_FAILED`（✓）／`VMU_EXPLAIN_DENIED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**拒绝也审计**（08 I-3 同族 ✓）；写失败必须具名（`audit.lastWriteError` ✓） ｜ 依赖：07 ✓ ｜ 成熟度：**部分 ✓** ｜ 优先级：P0
- **理由字段（reason discipline）** ｜ 目的：每个社会动作都能回答"凭什么" ｜ 面向谁：全体 ｜ 接口形状：**约定＋判定点**（规划 `society.requireReason` ⛔ 未实现） ｜ 可调控：`vmu.explain.reasonRequired`（默认 true，覆盖委托/仲裁/罢免/解散）／`reasonMaxChars` ｜ 错误码：`VMU_REASON_REQUIRED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**S-4（设计目标）**：缺 `reason` ⇒ 具名拒（不是警告 ✓；**实现时**由各动作强制，**当前未实现** ✗） ｜ 依赖：各动作实现 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P0
- **可解释报告（explain report）** ｜ 目的：人可读的"发生了什么、为什么" ｜ 面向谁：人类／审计者 ｜ 接口形状：规划 `kernel.explain.report({subject,windowMs})`（⛔ 未实现）；工具面规划 `vibe_vmu_explain`（⛔ 未实现） ｜ 可调控：`vmu.explain.detail`／`includeChains`／`includeScores` ｜ 错误码：`VMU_EXPLAIN_DENIED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：报告**只读**、可复算（引用审计 id ✓）；不得包含私聊内容（08 D6 ✓） ｜ 依赖：07 ✓＋05 钩子追踪 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **追踪与关联（trace correlation）** ｜ 目的：把"一件事"的全链路串起来 ｜ 面向谁：审计者 ｜ 接口形状：**部分 ✓**＝05 中间件 `traceId`／`trace(traceId)` ✓ ｜ 可调控：`vmu.audit.traceKeepMs` ✓（08）／`vmu.explain.correlateBy` ｜ 错误码：`VMU_NO_SUCH_OBJECT`／`VMU_EXPLAIN_DENIED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：社会动作**必须带 traceId**（可串到会议/表决/任务 ✓） ｜ 依赖：05 ✓ ｜ 成熟度：**部分 ✓** ｜ 优先级：P1

---

## 19. 人类在环（Human in the Loop）

- **人类审批（approval gate）** ｜ 目的：关键动作必须人点头 ｜ 面向谁：人类 ｜ 接口形状：**部分 ✓**＝内核 `vmu.safety.approvalRequired` ✓／`vmu.safety.delegableKeys` ✓；规划 `society.humanGate` 判定点（⛔ 未实现） ｜ 可调控：`vmu.human.*` ｜ 错误码：`VMU_HUMAN_APPROVAL_REQUIRED`（拟增）／`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**S-5（设计目标）**：列入审批的动作在未批前**只能排队**，不得"先做后报" ✗（**实现时**由内核安全面强制；**当前仅** `vmu.safety.approvalRequired` 的开关面已实现 ✓，**审批队列未实现** ✗） ｜ 依赖：内核安全面 ✓ ｜ 成熟度：**部分 ✓** ｜ 优先级：P0
- **人类否决（veto）** ｜ 目的：人能一票叫停 ｜ 面向谁：人类 ｜ 接口形状：规划 `kernel.human.veto(target,{why})`（⛔ 未实现） ｜ 可调控：`vmu.human.vetoScope`（`global｜institution｜task`）／`vetoNeedsReason`（默认 **false**，紧急时允许先停后说明 ✓） ｜ 错误码：`VMU_HUMAN_VETOED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：否决**立即生效＋广播**；被否决方有申诉与复盘出口（§5/§6 ✓） ｜ 依赖：§6 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **人类观察员（observer）** ｜ 目的：人可旁观不干预 ｜ 面向谁：人类 ｜ 接口形状：**已定义 ✓**（08 §2.2-C 观察员/列席 ✓，无表决权 ✓）＋规划人类观察面（⛔ 未实现） ｜ 可调控：`vmu.human.observerScopes[]` ｜ 错误码：`VMU_NOT_PERMITTED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：观察员**只读**；审计其查看（08 查看留痕纪律 ✓） ｜ 依赖：08 ✓ ｜ 成熟度：**部分 ✓** ｜ 优先级：P2
- **人类配额与超时（human SLA）** ｜ 目的：人可能不在线 ｜ 面向谁：机构 ｜ 接口形状：规划 `society.humanTimeout` 判定点（⛔ 未实现） ｜ 可调控：`vmu.human.approvalTimeoutMs`／`onTimeout(hold｜default-deny｜default-allow)`（默认 **hold** ✓，绝不默认放行 ✗） ｜ 错误码：`VMU_HUMAN_TIMEOUT`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：超时**不消耗代理配额**（S-5 ✓）；`default-allow` **必须显式开启** ｜ 依赖：§19 审批 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **人类可解释入口（human dashboard）** ｜ 目的：人一眼看懂全所 ｜ 面向谁：人类 ｜ 接口形状：**部分 ✓**＝`vibe_vmu_status`（只读总览 ✓）／`vibe_vmu_records`（list/expand ✓）；规划 `vibe_vmu_society`（⛔ 未实现，社会总览） ｜ 可调控：`vmu.explain.detail` ✓ ｜ 错误码：`VMU_EXPLAIN_DENIED` ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：总览**只读**＋最小必要字段（对齐 08 观测纪律 ✓） ｜ 依赖：03/07 ✓ ｜ 成熟度：**部分 ✓** ｜ 优先级：P1

---

## 20. 拟增设置键全表（**具体键名**；登记管线：`scripts/generate-planned-settings.mjs --write` ⇒ `settings/planned.js`）

> 列义：**键** ｜ **类型** ｜ **默认** ｜ **取值域** ｜ **谁可改** ｜ **热改** ｜ **说明**。
> 说明：以下键**均未接线**（`type:'planned'`, `def:null`）✓；**已实现**的键（`vmu.members.*` 无键、`vmu.limits.*`／`vmu.safety.*`／08 各族）**不在此表** ✗，见 04/08。

### 20.1 角色与招募（`vmu.roles.*`、`vmu.recruit.*`）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.roles.termDefaultMs` | ms | 0 | ≥0 | 所办 | 下轮 | 任职默认任期（0＝无期限） |
| `vmu.roles.termMaxMs` | ms | 0 | ≥0 | 所办 | 下轮 | 任期上限（0＝不限） |
| `vmu.roles.termRenewable` | bool | true | bool | pack | 下轮 | 任期可否续 |
| `vmu.roles.recallQuorum` | number | 0 | 0..1 | pack | 下轮 | 罢免所需支持比例（0＝只看流程） |
| `vmu.roles.recallCoolDownMs` | ms | 0 | ≥0 | 所办 | 立即 | 罢免冷却（防反复弹劾） |
| `vmu.roles.actingMaxMs` | ms | 0 | ≥0 | 所办 | 立即 | 代理主持的最长时长 |
| `vmu.roles.actingNeedsReason` | bool | true | bool | pack | 立即 | 代理必须给理由（S-4） |
| `vmu.roles.separationPairs` | object[] | `[]` | `{a,b}[]` | pack | 重启 | 职责分离对（不得同一实例兼任） |
| `vmu.roles.promotionNeedsEvidence` | bool | true | bool | pack | 下轮 | 晋升必须带证据 |
| `vmu.roles.slotIdPattern` | string | `^[a-z][a-z0-9-]*$` | 正则 | pack | 重启 | 席位 id 形状（与内核校验一致 ✓） |
| `vmu.recruit.policy` | enum | `closed` | `closed｜claim｜nominate｜open` | pack | 下轮 | 招募方式（默认关：零机制 ✓） |
| `vmu.recruit.probationMs` | ms | 0 | ≥0 | 所办 | 下轮 | 试用期时长（0＝无试用期） |
| `vmu.recruit.probationPermissions` | string[] | `[]` | 权限子集 | pack | 下轮 | 试用期可用权限（应为上位权限的子集 ✓） |
| `vmu.recruit.maxCandidates` | int | 0 | ≥0 | 所办 | 立即 | 候选人上限（0＝不限） |
| `vmu.recruit.decideBy` | enum | `manager` | `manager｜vote｜auction｜human` | pack | 下轮 | 选拔裁决方式 |
| `vmu.recruit.needsHuman` | bool | false | bool | pack | 立即 | 是否必须人类批准 |
| `vmu.recruit.evidenceRequired` | bool | true | bool | pack | 立即 | 候选人必须带能力证据 |

### 20.2 委托与转委（`vmu.delegation.*`）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.delegation.maxDepth` | int | 1 | ≥1 | 所办 | 立即 | 委托链深度（1＝不许转委 ✓） |
| `vmu.delegation.subdelegateAllowed` | bool | false | bool | 所办 | 立即 | 是否允许转委 |
| `vmu.delegation.defaultTtlMs` | ms | 0 | ≥0 | 所办 | 立即 | 默认有效期（0＝到事件失效） |
| `vmu.delegation.maxTtlMs` | ms | 0 | ≥0 | 所办 | 立即 | 有效期上限 |
| `vmu.delegation.reasonRequired` | bool | true | bool | pack | 立即 | 委托必须给理由（S-4 设计目标；当前未实现 ✗） |
| `vmu.delegation.tokenShare` | number | 0 | 0..1 | 所办 | 立即 | 可转授的令牌份额 |
| `vmu.delegation.turnsShare` | number | 0 | 0..1 | 所办 | 立即 | 可转授的回合份额 |
| `vmu.delegation.onExhausted` | enum | `refuse` | `refuse｜return` | pack | 立即 | 子预算耗尽时（拒新任务／归还） |
| `vmu.delegation.revokeBroadcast` | bool | true | bool | pack | 立即 | 撤销是否广播 |
| `vmu.delegation.requireExplicitScope` | bool | true | bool | pack | 立即 | 必须显式列命令与资源（不得"全权" ✗） |
| `vmu.delegation.auditChains` | bool | true | bool | pack | 立即 | 是否记录完整链 |

### 20.3 信任与声誉（`vmu.trust.*`、`vmu.collusion.*`）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.trust.halfLifeMs` | ms | 0 | ≥0 | 所办 | 立即 | 评分半衰期（0＝不衰减） |
| `vmu.trust.minSamples` | int | 3 | ≥0 | pack | 立即 | 展示分数的最低样本数 |
| `vmu.trust.evidenceRequired` | bool | true | bool | pack | 立即 | 评分必须带证据 |
| `vmu.trust.selfScoreAllowed` | bool | false | bool | pack | 立即 | 是否允许自评（默认否 ✗） |
| `vmu.trust.decayOnEnd` | bool | true | bool | pack | 立即 | 离职是否触发重算 |
| `vmu.trust.useInSelection` | bool | true | bool | pack | 立即 | 用于候选排序 |
| `vmu.trust.useInArbitration` | bool | true | bool | pack | 立即 | 用于仲裁者排序 |
| `vmu.trust.useInAuction` | bool | true | bool | pack | 立即 | 用于报价加权 |
| `vmu.trust.appealWindowMs` | ms | 0 | ≥0 | 所办 | 立即 | 申诉窗口（0＝不限） |
| `vmu.trust.appealNeedsEvidence` | bool | true | bool | pack | 立即 | 申诉必须带证据 |
| `vmu.trust.displayMode` | enum | `summary` | `summary｜full｜hidden` | pack | 立即 | 对成员展示的粒度 |
| `vmu.collusion.windowMs` | ms | 0 | ≥0 | 所办 | 立即 | 串谋扫描窗口 |
| `vmu.collusion.maxMutualShare` | number | 0.8 | 0..1 | pack | 立即 | 互评占比告警阈值 |
| `vmu.collusion.maxClusterSize` | int | 0 | ≥0 | pack | 立即 | 可疑团上限（0＝不限） |
| `vmu.collusion.onSuspect` | enum | `report` | `report｜freeze-review` | pack | 立即 | 疑似时动作（默认只报告 ✓） |
| `vmu.collusion.scanEveryMs` | ms | 0 | ≥0 | 所办 | 立即 | 扫描周期（0＝手动） |
| `vmu.collusion.minEvidence` | int | 2 | ≥0 | pack | 立即 | 至少几条证据才报 |

### 20.4 冲突、共识、记忆、技能（`vmu.conflict.*`、`vmu.consensus.*`、`vmu.memory.*`、`vmu.skills.*`）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.conflict.maxOpen` | int | 0 | ≥0 | 所办 | 立即 | 同时未决冲突上限（0＝不限） |
| `vmu.conflict.cooldownMs` | ms | 0 | ≥0 | 所办 | 立即 | 同一冲突冷却期 |
| `vmu.conflict.arbiterRule` | enum | `senior-slot` | `senior-slot｜random｜mutual｜human` | pack | 下轮 | 仲裁者选择规则 |
| `vmu.conflict.arbiterMustDiffer` | bool | true | bool | pack | 立即 | 仲裁者不得为当事人（设计目标；当前未实现 ✗） |
| `vmu.conflict.appealToHuman` | bool | true | bool | pack | 立即 | 是否允许上诉人类 |
| `vmu.conflict.classes` | string[] | `['fact','value','resource']` | 子集 | pack | 重启 | 分歧分类（决定出口：09/08/§17） |
| `vmu.conflict.hearingNeedsMinutes` | bool | true | bool | pack | 下轮 | 听证必须留纪要（08 纪要面 ✓） |
| `vmu.conflict.escalateMaxPerSubject` | int | 2 | ≥0 | pack | 立即 | 同一主题升级次数上限 |
| `vmu.consensus.protocol` | enum | `ballot-08` | `ballot-08｜judgment｜human` | pack | 下轮 | 共识判定协议（默认复用 08 表决 ✓） |
| `vmu.consensus.requireDissentRecord` | bool | true | bool | pack | 下轮 | 必须记录异议（对齐 08 少数意见 ✓） |
| `vmu.consensus.dissentRetentionMs` | ms | 0 | ≥0 | 所办 | 立即 | 异议保留期 |

> **不重复定义（本条原为重复项）** ✗：异议/分歧**分类**的定义只保留一处 ⇒ **`vmu.conflict.classes`（本卷 §20.4 的 `vmu.conflict` 族）** ✓；本卷**不另设**"共识分类"键 ✗（v0.1 曾两处各写一套，已删；生成管线随之重新归因 ✓）。
| `vmu.memory.visibility` | enum | `institution` | `private｜institution｜public` | pack | 立即 | 记忆可见性（私聊永不进入 ✓） |
| `vmu.memory.cardTtlMs` | ms | 0 | ≥0 | 所办 | 立即 | 经验卡有效期 |
| `vmu.memory.cardKinds` | string[] | `['lesson','obstacle','rejected']` | 子集 | pack | 重启 | 允许的卡片类型 |
| `vmu.memory.requireEvidence` | bool | true | bool | pack | 立即 | 卡片必须带来源（07 归档 id ✓） |
| `vmu.memory.compactionEveryMs` | ms | 0 | ≥0 | 所办 | 立即 | 压缩周期（0＝手动） |
| `vmu.memory.keepEvery` | int | 0 | ≥0 | 所办 | 立即 | 压缩保留密度（0＝不压缩） |
| `vmu.memory.neverDropKinds` | string[] | `['rejected','obstacle']` | 子集 | pack | 重启 | 永不丢弃的类别（负知识最有价值 ✓） |
| `vmu.memory.scopeRequired` | bool | true | bool | pack | 立即 | 键必须带作用域（防串味） |
| `vmu.memory.maxCards` | int | 0 | ≥0 | 所办 | 立即 | 卡片上限（0＝不限） |
| `vmu.skills.declareTtlMs` | ms | 0 | ≥0 | 所办 | 立即 | 能力声明有效期（到期转"未验证"） |
| `vmu.skills.catalogTtlMs` | ms | 0 | ≥0 | 所办 | 立即 | 能力目录缓存期 |
| `vmu.skills.negotiationRounds` | int | 1 | ≥1 | pack | 下轮 | 协商轮数上限（有界 ✓） |
| `vmu.skills.degradePolicy` | enum | `refuse` | `refuse｜partial｜reassign` | pack | 立即 | 能力不足时的行为 |
| `vmu.skills.requiresPermission` | bool | true | bool | pack | 立即 | 能力不替代权限（S-2/S-3） |
| `vmu.skills.evidenceRequired` | bool | true | bool | pack | 立即 | 声明必须带证据 |

### 20.5 竞标、交接、带教、纪律（`vmu.auction.*`、`vmu.handover.*`、`vmu.mentor.*`、`vmu.discipline.*`）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.auction.enabled` | bool | false | bool | 所办 | 下轮 | 竞标开关（默认关：零机制 ✓） |
| `vmu.auction.claimFirst` | bool | true | bool | pack | 下轮 | 先认领再竞标 |
| `vmu.auction.closeRule` | enum | `best-score` | `lowest-cost｜best-score｜random` | pack | 下轮 | 结标规则（事先写明 ✓） |
| `vmu.auction.bidWindowMs` | ms | 0 | ≥0 | 所办 | 立即 | 报价窗口 |
| `vmu.auction.maxBidCost` | int | 0 | ≥0 | 所办 | 立即 | 单次报价上限（0＝不限） |
| `vmu.auction.requirePlan` | bool | true | bool | pack | 立即 | 报价必须带计划 |
| `vmu.auction.maxOpenAuctions` | int | 1 | ≥0 | 所办 | 立即 | 同时开标数 |
| `vmu.auction.fairnessPolicy` | enum | `equal` | `equal｜quota｜rotation` | pack | 立即 | 分配公平策略 |
| `vmu.auction.dirtyWorkQuota` | number | 0 | 0..1 | pack | 立即 | 脏活配额（防挑活） |
| `vmu.auction.rotationWindow` | int | 0 | ≥0 | pack | 立即 | 轮转窗口（0＝不轮转） |
| `vmu.handover.acceptTimeoutMs` | ms | 0 | ≥0 | 所办 | 立即 | 接手超时（0＝不超时） |
| `vmu.handover.onTimeout` | enum | `return` | `return｜reassign｜escalate` | pack | 立即 | 超时行为（默认退回 ✓） |
| `vmu.handover.packBudgetBytes` | int | 32768 | ≥0 | 所办 | 立即 | 上下文压缩包字节预算 |
| `vmu.handover.includeKinds` | string[] | `['progress','obstacle','rejected']` | 子集 | pack | 重启 | 打包包含的类别 |
| `vmu.handover.requireFingerprint` | bool | true | bool | pack | 立即 | 每项必须带指纹（对齐 07/S21 ✓） |
| `vmu.handover.requiredFields` | string[] | `['status','openItems','pointers','risks','acceptance']` | 子集 | pack | 重启 | 交接单必填字段 |
| `vmu.handover.autoOpenOnEnd` | bool | true | bool | pack | 立即 | 离职自动开交接（§16 ✓） |
| `vmu.mentor.maxMenteesPerMentor` | int | 1 | ≥0 | 所办 | 立即 | 师傅带徒上限 |
| `vmu.mentor.reviewEveryMs` | ms | 0 | ≥0 | 所办 | 立即 | 复核周期（0＝不强制） |
| `vmu.mentor.requireReviewBeforeGraduation` | bool | true | bool | pack | 下轮 | 转正前必须复核 |
| `vmu.mentor.graduationNeedsHuman` | bool | false | bool | pack | 立即 | 转正是否需人类 |
| `vmu.discipline.breakerFailures` | int | 0 | ≥0 | 所办 | 立即 | 熔断失败阈值（0＝不熔断） |
| `vmu.discipline.breakerWindowMs` | ms | 0 | ≥0 | 所办 | 立即 | 熔断统计窗口 |
| `vmu.discipline.halfOpenAfterMs` | ms | 0 | ≥0 | 所办 | 立即 | 半开试探间隔 |
| `vmu.discipline.suspendMaxMs` | ms | 0 | ≥0 | 所办 | 立即 | 停职上限 |
| `vmu.discipline.restoreNeedsHuman` | bool | true | bool | pack | 立即 | 复职是否需人类 |
| `vmu.discipline.postmortemRequired` | bool | true | bool | pack | 下轮 | 失败必须复盘 |

### 20.6 拓扑、宪章、身份、公平、可解释、人类（`vmu.topology.*`、`vmu.charter.*`、`vmu.identity.*`、`vmu.fairness.*`、`vmu.explain.*`、`vmu.human.*`）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.topology.mode` | enum | `star` | `star｜committee｜market｜pipeline｜swarm｜matrix｜hierarchy` | pack | 下轮 | 协作拓扑 |
| `vmu.topology.autoSelect` | bool | false | bool | 所办 | 下轮 | 是否按任务自动选拓扑 |
| `vmu.topology.budgetMultiplier` | number | 1 | ≥1 | 所办 | 立即 | 拓扑预算放大（**不得**>1 默认 ✓） |
| `vmu.topology.maxDepth` | int | 1 | ≥0 | 所办 | 重启 | 层级拓扑深度上限 |
| `vmu.topology.starCenterSlot` | string | `''` | 席位 id | pack | 下轮 | 星型中心席位 |
| `vmu.charter.enabled` | bool | false | bool | 所办 | 重启 | 宪章开关（默认关 ✓） |
| `vmu.charter.spawnMaxChildren` | int | 0 | ≥0 | 所办 | 重启 | 子机构数上限 |
| `vmu.charter.depthMax` | int | 1 | ≥0 | 所办 | 重启 | 机构层级深度上限 |
| `vmu.charter.amendNeedsQuorum` | bool | true | bool | pack | 下轮 | 修订需表决（走 08 ✓） |
| `vmu.charter.amendNeedsHuman` | bool | false | bool | pack | 立即 | 修订需人类批准 |
| `vmu.charter.frozenClauses` | string[] | `['S-1','S-2','S-3','S-4','S-5','S-6']` | 子集 | pack | 重启 | 冻结条款（表决也不可改 ✗） |
| `vmu.charter.dissolveNeedsHuman` | bool | true | bool | pack | 立即 | 解散必须人类批准 |
| `vmu.charter.fissionMax` | int | 0 | ≥0 | 所办 | 重启 | 席位裂变次数上限 |
| `vmu.charter.mergeNeedsHuman` | bool | true | bool | pack | 立即 | 合并需人类 |
| `vmu.charter.precedence` | enum | `charter-over-pack` | `charter-over-pack｜pack-over-charter` | pack | 重启 | 与 pack 冲突时的优先级 |
| `vmu.identity.principalBinding` | enum | `off` | `off｜advisory｜required` | 所办 | 重启 | 宿主主体绑定（默认不耦合 ✓） |
| `vmu.identity.trustedIssuers` | string[] | `[]` | issuer 列表 | 所办 | 重启 | 可信 issuer（SSO/OIDC） |
| `vmu.identity.claimMap` | object | `{}` | `{claim:slot}[]` | pack | 重启 | 主体属性→席位的映射 |
| `vmu.identity.multiMembership` | bool | false | bool | 所办 | 重启 | 是否允许多机构归属 |
| `vmu.identity.maxMemberships` | int | 1 | ≥1 | 所办 | 重启 | 归属上限 |
| `vmu.identity.allowPseudonym` | bool | false | bool | 所办 | 下轮 | 是否允许化名 |
| `vmu.identity.pseudonymScopes` | string[] | `[]` | 场景子集 | pack | 下轮 | 允许化名的场景 |
| `vmu.identity.onEnd` | enum | `both` | `archive｜handover｜both` | pack | 立即 | 离职处置 |
| `vmu.identity.auditReads` | bool | true | bool | pack | 立即 | 身份读取是否审计 |
| `vmu.fairness.minShares` | object | `{}` | `{slot:0..1}` | 所办 | 立即 | 各席位最低份额 |
| `vmu.fairness.newcomerQuota` | number | 0 | 0..1 | pack | 立即 | 新人配额 |
| `vmu.fairness.maxSlotsPerInstance` | int | 1 | ≥1 | 所办 | 下轮 | 单实例可占席位上限（同机构） |
| `vmu.fairness.criticalSlots` | string[] | `[]` | 席位子集 | pack | 重启 | 关键席位（更严的反垄断） |
| `vmu.fairness.rebalanceEveryMs` | ms | 0 | ≥0 | 所办 | 立即 | 再平衡周期 |
| `vmu.explain.detail` | enum | `summary` | `summary｜full` | 所办 | 立即 | 解释粒度 |
| `vmu.explain.includeChains` | bool | true | bool | pack | 立即 | 报告是否含委托链 |
| `vmu.explain.includeScores` | bool | true | bool | pack | 立即 | 报告是否含评分 |
| `vmu.explain.reasonRequired` | bool | true | bool | pack | 立即 | 社会动作必须给理由（S-4） |
| `vmu.explain.reasonMaxChars` | int | 400 | ≥1 | pack | 立即 | 理由长度上限 |
| `vmu.explain.correlateBy` | enum | `traceId` | `traceId｜taskId｜none` | pack | 立即 | 关联维度 |
| `vmu.explain.reportFormat` | enum | `md` | `md｜json` | 所办 | 立即 | 报告格式 |
| `vmu.human.vetoScope` | enum | `institution` | `global｜institution｜task` | 所办 | 立即 | 否决范围 |
| `vmu.human.vetoNeedsReason` | bool | false | bool | pack | 立即 | 否决是否必须先给理由（紧急允许后补 ✓） |
| `vmu.human.observerScopes` | string[] | `[]` | 场景子集 | 所办 | 立即 | 观察员可见范围 |
| `vmu.human.approvalTimeoutMs` | ms | 0 | ≥0 | 所办 | 立即 | 审批等待（0＝无限等） |
| `vmu.human.onTimeout` | enum | `hold` | `hold｜default-deny｜default-allow` | pack | 立即 | 超时行为（**默认挂起，绝不默认放行** ✗） |
| `vmu.human.dashboardScope` | enum | `institution` | `global｜institution` | 所办 | 立即 | 人类总览范围 |

> **跨卷不重复定义** ✗：**资源公平策略的定义在 08**（`vmu.budget.fairnessPolicy` ✓，08-§19.6）；本卷**不另设**"公平策略"键 ✓（v0.1 曾重复登记同一旋钮，已删；本卷只保留 `vmu.fairness.*` 里**08 没有的**那些：`minShares`／`newcomerQuota`／`maxSlotsPerInstance`／`criticalSlots`／`rebalanceEveryMs` ✓）。逐条对照见 **§27 交界表** ✓。

**计数（逐表实测；v0.2 起剔除与 08 重复的"公平策略"键与卷内重复的"共识分类"键 ✓，两处**不再以字面键名出现** ✗ 以免被生成管线重新声明 ✓；**v0.3 增 §28/§29 两族 ✓**）**：§20.1 **17** ＋ §20.2 **11** ＋ §20.3 **17** ＋ §20.4 **26** ＋ §20.5 **27** ＋ §20.6 **42** ＝ **140 个拟增键**，**另加 §28 教学族 `vmu.course.*` 24 个 ＋ §29 通知族 `vmu.notify.*` 19 个**（两族的同格式表在各自节内 ✓）⇒ **本卷合计 183 个拟增键**（按命名空间：`vmu.roles` 10／`vmu.recruit` 7／`vmu.delegation` 11／`vmu.trust` 11／`vmu.collusion` 6／`vmu.conflict` 8／`vmu.consensus` 3／`vmu.memory` 9／`vmu.skills` 6／`vmu.auction` 10／`vmu.handover` 7／`vmu.mentor` 4／`vmu.discipline` 6／`vmu.topology` 5／`vmu.charter` 10／`vmu.identity` 9／`vmu.fairness` 5／`vmu.explain` 7／`vmu.human` 6）。

---

## 21. 拟增错误码表（**具体码名**）

> 列义：**码** ｜ **语义** ｜ **何时** ｜ **必须给的解释**（登记进 `03-§8`）。

### 21.1 角色/招募/委托（24）

| 码 | 语义 | 何时 | 必须给的解释 |
|---|---|---|---|
| `VMU_SLOT_UNKNOWN` | 未知席位 | 任职/换岗 | 已声明席位清单（对齐内核 `VMU_INVALID_ARGUMENT` 现状 ✓，可迁移为本码） |
| `VMU_SLOT_FULL` | 席位容量已满 | 任职/招募 | 已占/容量＋释放方式 |
| `VMU_ROLE_TERM_EXPIRED` | 任期已过 | 行使席位权限 | 到期时间＋如何续期 |
| `VMU_RECALL_QUORUM_NOT_MET` | 罢免未达门槛 | 罢免 | 需要/已有支持 |
| `VMU_ACTING_NOT_ALLOWED` | 不允许代理 | 代理主持/席位 | 允许条件（宪章条款） |
| `VMU_DUTY_CONFLICT` | 职责分离冲突 | 任命/批准 | 冲突对＋替代人选 |
| `VMU_SKILL_UNKNOWN` | 未声明能力 | 协商/匹配 | 已声明能力清单 |
| `VMU_SKILL_RETIRED` | 能力已退役 | 使用 | 退役时间与替代 |
| `VMU_SKILL_DEGRADED` | 能力降级 | 执行 | 降了什么、还剩什么 |
| `VMU_SKILL_EVIDENCE_REQUIRED` | 声明缺证据 | 声明 | 要求的证据形状（07 归档 id） |
| `VMU_RECRUIT_CLOSED` | 招募未开放 | 应募 | 开放条件 |
| `VMU_RECRUIT_EVIDENCE_REQUIRED` | 候选缺证据 | 选拔 | 必备证据 |
| `VMU_PROBATION_ACTIVE` | 试用期限制 | 行使受限权限 | 限制项＋转正条件 |
| `VMU_DELEGATION_ESCALATION` | **委托试图扩大权限** | 委托/转委 | 授予者范围与被请求范围的差异（S-2 设计目标；当前未实现 ✗） |
| `VMU_DELEGATION_EXPIRED` | 委托已失效 | 使用 | 失效时间/事件＋如何重授 |
| `VMU_DELEGATION_DEPTH` | 委托链超深/成环 | 转委 | 链现状与上限 |
| `VMU_DELEGATION_BUDGET` | 委托子预算耗尽 | 使用 | 当前值/上限＋来源委托 |
| `VMU_DELEGATION_REASON_REQUIRED` | 委托缺理由 | 委托/撤销 | 要求的理由字段（S-4） |
| `VMU_TRUST_SELF_SCORE` | 自评被拒 | 评分 | 为什么禁止（S-3 同族） |
| `VMU_TRUST_EVIDENCE_REQUIRED` | 评分缺证据 | 评分 | 证据要求 |
| `VMU_TRUST_APPEAL_WINDOW` | 申诉窗口已过 | 申诉 | 窗口与例外 |
| `VMU_TRUST_USE_FORBIDDEN` | 声誉被用于禁止用途 | 配置/调用 | 允许用途清单（票权/席位/预算 ✗） |
| `VMU_COLLUSION_SUSPECTED` | 疑似串谋 | 扫描 | 判据＋受影响评分＋申诉入口 |
| `VMU_REASON_REQUIRED` | 社会动作缺 `reason` | 任何 S-4 动作 | 该动作、要求字段、示例 |

### 21.2 冲突/共识/记忆/竞标/交接/带教/纪律（29）

| 码 | 语义 | 何时 | 必须给的解释 |
|---|---|---|---|
| `VMU_CONFLICT_TARGET_UNKNOWN` | 升级对象不存在 | 升级 | 可用对象清单 |
| `VMU_CONFLICT_LIMIT` | 未决冲突超上限 | 新建冲突 | 现值/上限 |
| `VMU_ARBITER_UNAVAILABLE` | 找不到合格仲裁者 | 仲裁 | 候选与不可用原因 |
| `VMU_ARBITER_IS_PARTY` | 仲裁者是当事人 | 仲裁 | 冲突关系（职责分离） |
| `VMU_ARBITRATION_OFF` | 仲裁未启用 | 仲裁 | 开启方式（`vmu.arbitration.mode` ✓ 08） |
| `VMU_CONSENSUS_NOT_REACHED` | 共识未达成 | 收束 | 票型/门槛/为何未达（复用 08 三值 ✓） |
| `VMU_MEMORY_KEY_UNSCOPED` | 记忆键缺作用域 | 写记忆 | 作用域要求（防串味） |
| `VMU_MEMORY_CARD_INVALID` | 经验卡非法 | 写卡 | 缺字段清单 |
| `VMU_MEMORY_VISIBILITY_DENIED` | 记忆不可见 | 读记忆 | 可见级别与授权路径 |
| `VMU_MEMORY_COMPACTION_REFUSED` | 压缩被拒 | 压缩 | 拒绝理由（如"永不丢弃类"） |
| `VMU_NEGOTIATION_FAILED` | 协商失败 | 协商 | 分歧点＋下一轮或升级路径 |
| `VMU_AUCTION_CLOSED` | 竞标已结束 | 报价 | 结标时间与结果 id |
| `VMU_AUCTION_INVALID_BID` | 报价非法 | 报价 | 必填字段/上限 |
| `VMU_AUCTION_LIMIT` | 开标数超限 | 开标 | 现值/上限 |
| `VMU_HANDOVER_INCOMPLETE` | 交接单不完整 | 提交/接收 | 缺失字段（`vmu.handover.requiredFields` ✓） |
| `VMU_HANDOVER_NOT_ACCEPTED` | 交接未被接受 | 清账 | 原负责人仍担责的事实与期限 |
| `VMU_HANDOVER_PACK_TOO_BIG` | 压缩包超预算 | 打包 | 预算/实际＋截断计数 |
| `VMU_HANDOVER_TIMEOUT` | 接手超时 | 等待 | 超时行为（退回/重派/升级） |
| `VMU_MENTOR_UNAVAILABLE` | 找不到师傅 | 结对 | 可用师傅与容量 |
| `VMU_MENTOR_SELF_PAIR` | 自己带自己 | 结对 | 为什么禁止 |
| `VMU_MENTOR_REVIEW_MISSING` | 缺少带教复核 | 转正 | 复核要求 |
| `VMU_DISCIPLINE_CIRCUIT_OPEN` | 熔断打开 | 新任务 | 触发原因＋恢复条件＋半开时间 |
| `VMU_DISCIPLINE_QUOTA` | 纪律配额触界 | 动作 | 当前值/上限＋重置时点 |
| `VMU_DISCIPLINE_SUSPENDED` | 已被停职 | 行使权限 | 停职依据＋复职路径 |
| `VMU_DISCIPLINE_POSTMORTEM_MISSING` | 缺复盘 | 结项 | 复盘要求＋模板 |
| `VMU_HANDOVER_FALLBACK_USED` | 已走回退路径 | 交接 | 回退原因与最终归属 |
| `VMU_FAIRNESS_QUOTA` | 公平配额触界 | 分配 | 配额依据＋受影响者 |
| `VMU_FAIRNESS_CONCENTRATION` | 席位集中超限 | 任职 | 现值/上限＋关键席位说明 |

> **共享码不在此重复登记** ✗：`VMU_IDEMPOTENCY_KEY_REUSED`（v0.1 曾作为行列出）**等 13 个共享码的定义在 08**（见 §27 交界表 ✓）⇒ 本卷只在用到处**引用** ✓，不在本节重复一行 ✓。

### 21.3 拓扑/宪章/身份/公平/可解释/人类（20）

| 码 | 语义 | 何时 | 必须给的解释 |
|---|---|---|---|
| `VMU_TOPOLOGY_UNSUPPORTED` | 拓扑未支持/未声明 | 选拓扑 | 支持清单 |
| `VMU_CHARTER_NOT_AUTHORIZED` | 无创设/修订权 | 创设/修订 | 授权来源（宪章条款） |
| `VMU_CHARTER_DEPTH` | 机构层级超深 | 创设子机构 | 现值/上限 |
| `VMU_CHARTER_FROZEN` | 触及冻结条款 | 修订 | 冻结条款清单（S-1…S-6 ✗） |
| `VMU_CHARTER_QUORUM` | 修订未达表决门槛 | 修订 | 需要/已有（复用 08 表决 ✓） |
| `VMU_CHARTER_FISSION_LIMIT` | 裂变超限 | 裂变 | 现值/上限 |
| `VMU_CHARTER_DISSOLVE_DENIED` | 解散被拒 | 解散 | 缺人类批准或存在在飞任务 |
| `VMU_CHARTER_CONFLICT` | 宪章与 pack 冲突 | 装载/生效 | 冲突条款＋优先级（`precedence` ✓） |
| `VMU_IDENTITY_UNBOUND` | 主体未绑定 | 需 `required` 的场景 | 绑定方式与可信 issuer |
| `VMU_IDENTITY_ISSUER_UNTRUSTED` | issuer 不可信 | 绑定 | 可信列表 |
| `VMU_IDENTITY_MULTI_DENIED` | 多归属被拒 | 加入机构 | 策略与上限 |
| `VMU_IDENTITY_PSEUDONYM_DENIED` | 化名不被允许 | 请求化名 | 允许场景 |
| `VMU_IDENTITY_ENDS_WITH_OPEN_WORK` | 离职但仍有在飞 | 离职 | 未结算清单（必须先交接 ✓） |
| `VMU_IDENTITY_TRANSFER_DENIED` | 跨机构迁移被拒 | 迁移 | 需重新绑定/需人类 |
| `VMU_FAIRNESS_DENIED` | 公平策略拒绝 | 分配 | 触发的策略与依据 |
| `VMU_EXPLAIN_DENIED` | 无权解释/导出 | 报告/导出 | 权限与可申请路径 |
| `VMU_HUMAN_APPROVAL_REQUIRED` | 需人类批准 | 关键动作 | 待批事项＋超时策略（默认挂起 ✓） |
| `VMU_HUMAN_VETOED` | 被人类否决 | 否决后 | 否决人/范围/申诉入口 |
| `VMU_HUMAN_TIMEOUT` | 人类审批超时 | 等待 | 超时行为（hold/deny/allow） |
| `VMU_SOCIETY_DISABLED` | 社会机制未声明 | 任何社会动作 | 如何声明（`vmu.*` 开关；零机制 ✓） |

**计数**：§21.1 **24** ＋ §21.2 **28** ＋ §21.3 **20** ＝ **72 个拟增错误码**，**另加 §28.5 教学面 19 个 ＋ §29.4 通知面 15 个** ⇒ **本卷合计 106 个拟增错误码**（另有**复用** √：`VMU_NOT_PERMITTED／VMU_NOT_MEMBER／VMU_NO_SUCH_OBJECT／VMU_INVALID_ARGUMENT／VMU_STATE／VMU_RESOURCE_BUDGET／VMU_MIDDLEWARE_REJECTED／VMU_MIDDLEWARE_FAILED／VMU_IO_FAILED／VMU_STORE_FAILED／VMU_ENGINE_UNAVAILABLE／VMU_PACK_CONFLICT／VMU_IDEMPOTENCY_KEY_REUSED`（08）／`VMU_REOPEN_*`（08）／`VMU_MEETING_*`（08）／`VMU_MINUTES_*`（08）／`VMU_TASK_*`（08）／`VMU_CONFLICT_*`（本卷）——**共享码的定义一律在 08，逐条见 §27 交界表** ✓）。

---

## 22. 拟增服务 / 工具 / 钩子 / 协议清单（含 ✓✗）

### 22.1 服务

| 服务 | 是否已实现 | 说明 |
|---|---|---|
| `vmu.members`（席位/容量/任职） | **已实现 ✓** | role **slot** 面；`hire/assignRole/end/wake/may` ✓ |
| `vmu.store`／`vmu.library`／`vmu.work`／`vmu.tasks`／`vmu.prompt`／`vmu.middleware` | **已实现 ✓** | 记忆底座、任务与在途、提示词、总线 |
| `kernel.meeting()`／`kernel.ballot()` | **已实现 ✓**（工厂） | 会议/表决原语（08 治理面 ✓） |
| `vmu.roles`／`vmu.recruit`／`vmu.delegation`／`vmu.trust`／`vmu.conflict`／`vmu.consensus`／`vmu.memory`／`vmu.skills`／`vmu.auction`／`vmu.handover`／`vmu.mentor`／`vmu.discipline`／`vmu.topology`／`vmu.charter`／`vmu.identity`／`vmu.fairness`／`vmu.collusion`／`vmu.explain`／`vmu.human` | **未实现 ✗**（19 个） | 目标形态见 §2–§19；**登记前不得被依赖** ✗ |

### 22.2 工具（宿主面）

| 工具 | 是否已实现 | 说明 |
|---|---|---|
| `vibe_vmu_status`／`vibe_vmu_set`／`vibe_vmu_middleware`／`vibe_vmu_records`／`vibe_vmu_script`／`vibe_vmu_pack`／`vibe_vmu_control`／`vibe_vmu_meeting`／`vibe_vmu_task` | **已实现 ✓** | 03-§3.1 的九个（社会面用它读/改/记录 ✓） |
| `vibe_vmu_society` | **未实现 ⛔（规划）** | 社会总览（席位/委托/信任/冲突一屏） |
| `vibe_vmu_roles` | **未实现 ⛔（规划）** | 席位/任职/罢免/代理 |
| `vibe_vmu_delegate` | **未实现 ⛔（规划）** | 委托/转委/撤销/查链 |
| `vibe_vmu_trust` | **未实现 ⛔（规划）** | 评分/申诉/串谋扫描（只报告） |
| `vibe_vmu_skills` | **未实现 ⛔（规划）** | 能力声明/目录/协商 |
| `vibe_vmu_auction` | **未实现 ⛔（规划）** | 开标/报价/结标 |
| `vibe_vmu_handover` | **未实现 ⛔（规划）** | 交接单/压缩包/验收 |
| `vibe_vmu_charter` | **未实现 ⛔（规划）** | 宪章/创设/裂变/解散 |
| `vibe_vmu_identity` | **未实现 ⛔（规划）** | 主体绑定/归属/化名 |
| `vibe_vmu_explain` | **未实现 ⛔（规划）** | 可解释报告/导出 |
| `vibe_vmu_memory` | **未实现 ⛔（规划）** | 经验卡/技能库/压缩 |
| `vibe_vmu_course` | **未实现 ⛔（规划）** | 课程/单元/作业/提交（§28） |
| `vibe_vmu_grade` | **未实现 ⛔（规划）** | 评审/发布/追加改分（§28） |
| `vibe_vmu_notify` | **未实现 ⛔（规划）** | 投递/摘要/信噪比查询（§29） |
| `vibe_vmu_watch` | **未实现 ⛔（规划）** | 订阅/退订/列举（§29） |

### 22.3 钩子

| 钩子 | 是否已注册 | 可拒绝? |
|---|---|---|
| `member/wake-before`／`member/wake-after`（唤醒信封） | **已注册 ✓** | 可拒绝（拦下＝不唤醒 ✓） |
| `task/assign`／`task/transition`（派单与迁移） | **已注册 ✓** | 可拒绝 ✓ |
| `settle/before`／`settle/after`（结算） | **已注册 ✓** | `before` 可拒 ✓ |
| `meeting/round-start`／`meeting/round-end`／`ballot/cast`／`ballot/tally` | **已注册 ✓**（08 治理面） | 见 08 ✓ |
| `member/hired`／`member/ended`／`role/assigned`／`role/recalled`／`delegation/granted`／`delegation/revoked`／`trust/scored`／`trust/appealed`／`conflict/opened`／`conflict/resolved`／`consensus/reached`／`memory/consolidated`／`skill/declared`／`auction/opened`／`auction/closed`／`handover/opened`／`handover/accepted`／`mentor/paired`／`mentor/graduated`／`discipline/circuit-open`／`discipline/restored`／`topology/changed`／`charter/amended`／`identity/bound`／`fairness/rebalanced`／`collusion/suspected`／`human/approved`／`human/vetoed` | **未注册 ✗（规划，roadmap 见 §25）** | 视点而定（`*/opened|granted|scored` 可拒；`*/closed|resolved|consolidated` 观测型） |
| **§28 教学面（未注册 ✗，规划）**：`course/opened`／`cohort/formed`／`assignment/published`／`assignment/submitted`／`review/submitted`／`feedback/published`／`grade/amended` | **未注册 ✗（规划）** | `*/published`／`*/submitted` 可拒；`*/amended` 观测型 |
| **§29 通知面（未注册 ✗，规划）**：`notify/queued`／`notify/merged`／`notify/suppressed`／`notify/sent`／`notify/failed`／`notify/digest-ready`／`watch/subscribed`／`watch/unsubscribed` | **未注册 ✗（规划）** | `watch/subscribed` 与 `notify/queued` 可拒（拦下＝不投递 ✓）；其余观测型 |

### 22.4 协议/接缝（不是新工具）

| 名字 | 是否已实现 | 说明 |
|---|---|---|
| `deliver({meeting,round,member,ask,at})` 投递接缝 | **已实现 ✓** | 唤醒信封；缺则具名拒 ✓ |
| `may(id,permission)` 权限判断 | **已实现 ✓** | 只做包含；**委托检查必须复用它**（S-2 ✓） |
| `clock()`／`isPaused()` 注入 | **已实现 ✓** | 可复现＋暂停真门禁 ✓ |
| 宿主身份接缝（SSO/OIDC claims） | **未接线 ✗（规划）** | `vmu.identity.principalBinding` 需它；未接线前 `required` 不可用 ✗ |
| 上下文压缩包格式（`pack v1`） | **未实现 ✗（规划）** | 字段见 §11；含指纹与稳定 id ✓ |

---

## 23. 配方库（**用 settings ＋ 判定点 ＋ 08 的治理面拼出社会机制**）

| # | 目标机制 | 组合 | 可观测（断言点） | 失败模式（不照做会怎样） | 成熟度 |
|---|---|---|---|---|---|
| S01 | **只减权的委托** | `society.delegation` 判定点 ＋ `may()` ✓ ＋ `vmu.delegation.requireExplicitScope` | 越权委托 ⇒ 具名 `VMU_DELEGATION_ESCALATION`（**场景级**红） | 代理自我提权 | **可实现 ✓**（判定点规划 ✗） |
| S02 | **任命有期限** | `vmu.roles.termDefaultMs` ＋ 到期标记 `expired`（不自动免职） | 到期行使权限 ⇒ `VMU_ROLE_TERM_EXPIRED`（具名） | 位置被永久占有 | 规划 ✗ |
| S03 | **声誉不换权力** | `vmu.trust.useIn*` 白名单 ＋ 08 票权面（`ballot.eligible` ✓） | 用声誉改票权 ⇒ `VMU_TRUST_USE_FORBIDDEN`（断言红） | 好评寡头 | 规划 ✗ |
| S04 | **新席位先受限** | `vmu.recruit.probationMs` ＋ `probationPermissions`（上位权限子集 ✓） | 试用期越权 ⇒ `VMU_PROBATION_ACTIVE`（具名） | 新代理一上来就全权 | 规划 ✗ |
| S05 | **僵局可仲裁** | `vmu.conflict.arbiterRule` ＋ 08 会议/表决（听证＝会议、裁决＝决议 ✓） | 当事人当仲裁者 ⇒ `VMU_ARBITER_IS_PARTY`（具名） | 自己判自己 | **部分 ✓**（08 面 ✓／选择器 ✗） |
| S06 | **失败熔断** | 05 `vmu.middleware.breakerThreshold` ✓ ＋ `vmu.discipline.breakerFailures` | 连续失败 ⇒ `VMU_DISCIPLINE_CIRCUIT_OPEN`（具名）＋新任务被拒 | 一个坏代理拖垮全所 | **部分 ✓**（中间件级 ✓） |
| S07 | **交接不丢活** | 07 `work.interrupt/recover` ✓ ＋ 交接单 `requiredFields` ＋ 压缩包 | 未接受就清账 ⇒ `VMU_HANDOVER_NOT_ACCEPTED`（具名） | 责任悬空 | **部分 ✓**（台账 ✓／交接单 ✗） |
| S08 | **只报告不惩罚的串谋扫描** | `vmu.collusion.onSuspect='report'` ＋ 07 审计 ✓ | 扫描命中 ⇒ `VMU_COLLUSION_SUSPECTED`（**只报告**，评分不变） | 自动惩罚误伤/寒蝉效应 | 规划 ✗ |
| S09 | **脏活轮转** | `vmu.auction.dirtyWorkQuota` ＋ `rotationWindow` ＋ 08 任务板 ✓ | 配额触界 ⇒ `VMU_FAIRNESS_QUOTA`（具名） | 没人干脏活 | 规划 ✗ |
| S10 | **人类一票叫停** | 内核 `vmu.safety.approvalRequired` ✓ ＋ `vmu.human.vetoScope` | 未批就做 ⇒ `VMU_HUMAN_APPROVAL_REQUIRED`（具名） | 自动化架空人类 | **部分 ✓**（安全面 ✓） |
| S11 | **宪章冻结条款** | `vmu.charter.frozenClauses=['S-1'…'S-6']` ＋ 08 表决（修订 ✓） | 表决改冻结条款 ⇒ `VMU_CHARTER_FROZEN`（断言红） | 六条不变式被"民主地"废掉 | 规划 ✗ |
| S12 | **子机构不放大权限** | `vmu.charter.spawnMaxChildren/depthMax` ＋ S-2 委托检查 | 子机构拿到母机构没有的权限 ⇒ `VMU_DELEGATION_ESCALATION`（具名） | 层级越权 | 规划 ✗ |

---

## 24. 门禁（本卷验收判据；**每条都能指出断言与具名红**）

1. **零机制默认**：未声明任何 `vmu.roles.*`／`vmu.charter.*`／`vmu.auction.*` 时，社会动作**全不存在** ⇒ **断言**：`status().society === undefined`（或 `enabled:false`）＋尝试调用 ⇒ **具名红** `VMU_SOCIETY_DISABLED`；
2. **席位身份局部性**：内核源码中**不得出现任何角色名**（沿用 01-§5 D5 的**场景**：`tests/vmu-members.test.mjs` 的零策略断言 ✓）⇒ 违反 ⇒ 静态门 **红**；
3. **委托只减权**：用一对**场景**（合法委托／越权委托）断言：合法 ⇒ `ok:true` 且 `scope ⊆ grantor.scope`；越权 ⇒ **具名红** `VMU_DELEGATION_ESCALATION`；
4. **理由必填**：对 S-4 覆盖的每个动作跑一次**缺 reason** 的**场景** ⇒ 必须**具名红** `VMU_REASON_REQUIRED`（不得只警告 ✗）；
5. **声誉不改权限**：构造"高分实例"与"低分实例"，**断言**二者在 `ballot.eligible`／`may()`／预算上**完全一致** ⇒ 不一致 ⇒ **红**；试图把声誉接入权限 ⇒ **具名红** `VMU_TRUST_USE_FORBIDDEN`；
6. **仲裁者回避**：**场景**：让当事人自选仲裁 ⇒ **具名红** `VMU_ARBITER_IS_PARTY`；
7. **交接完整性**：缺任一必填字段 ⇒ **具名红** `VMU_HANDOVER_INCOMPLETE`；未接受即清账 ⇒ **具名红** `VMU_HANDOVER_NOT_ACCEPTED`；
8. **人类优先**：列入审批的动作在未批前 ⇒ **具名红** `VMU_HUMAN_APPROVAL_REQUIRED`；作出否决后 ⇒ **具名红** `VMU_HUMAN_VETOED` 且**不改**代理配额（S-5，**断言**配额不变）；
9. **冻结条款不可表决修改**：**场景**：以任何门槛表决修改 `frozenClauses` ⇒ **具名红** `VMU_CHARTER_FROZEN`；
10. **社会动作可复算**：每次委托/仲裁/交接都有 `traceId` 与 `reason` ⇒ **断言** `explain.report()` 字段齐全（只读 ✓）；缺字段 ⇒ **红**。

---

## 25. 未核项（**编号登记见 `14-§2`** ✓）

- **宿主身份接缝未接线**：`vmu.identity.principalBinding` 的 `advisory/required` **无法验证**（vmu 当前不读 SSO/OIDC）⇒ 编号登记见 `14-§2` ✓。
- **声誉模型的判据未实证**：`vmu.trust.*` 的衰减/样本阈值是**设计建议**，没有真实数据校准 ⇒ 见 `14-§2`。
- **串谋判据的误报率未知**：`vmu.collusion.*` 的阈值可能误伤小机构 ⇒ 见 `14-§2`。
- **竞标与 08 预算的复式记账未定**：子预算扣减点（委托时/用时时）未核 ⇒ 见 `14-§2`。
- **仲裁的"绑定力"与 08 决议的关系未定**：仲裁裁决是否等同决议（进纪要即生效 ✓）还是需要再表决 ⇒ 见 `14-§1`（O 系列）。
- **委员会实体与 08 §15 的类型目录重叠**：本卷的"委员会拓扑"与 08 的"委员会会议类型"可能是同一件事的两种视角 ⇒ 待并 ⇒ 见 `14-§1`。
- **成绩与机构考核的关系未定**（§28）：课程成绩是否进入 §5 的**声誉**（本卷默认**不进**：成绩≠声誉 ✓）⇒ 需裁 ⇒ 见 `14-§1`。
- **盲评映射的保留与解绑权未定**（§28）：`blindMappingRetentionMs` 到期后能否被人类强制解绑（现为**须留痕且需权限** ✓）⇒ 见 `14-§2`。
- **通知信噪比阈值未实证**（§29）：`vmu.notify.snrFloor` 的合理下限没有真实数据校准 ⇒ 见 `14-§2`。
- **跨机构订阅的合规边界未定**（§29）：默认禁止 ✓，但"同一人类主体的两个机构"是否例外 ⇒ 与 20 卷（隐私合规）联裁 ⇒ 见 `14-§1`。
- **订阅关系的可见性未定**（§29）：默认**不公开** ✓；是否应公开以避免"暗中监视"（与 §17 反垄断相关）⇒ 见 `14-§1`。
- **化名与审计的张力**：匿名要求与"可解释/可复算"冲突时谁优先 ⇒ 见 `14-§1`。
- **人类总览的字段集**：`vibe_vmu_society`（规划 ⛔）应暴露哪些字段（对齐 03 的观测纪律）⇒ 见 `14-§2`。

---

## 26. 与其它卷的双向交叉引用（**交界只写一次** ✗）

| 本卷的什么 | 引到哪一卷 | 对方给什么 | 本卷给什么 |
|---|---|---|---|
| 表决/门槛/共识判定 | **08**（§3.2 三层门槛、§13.1 判定流程、§3.3 方法族） | 表决原语与计票 | 谁参与、谁回避、谁仲裁（§2/§6） |
| 会议/听证/纪要 | **08**（§2 会议、§15 类型目录、§16 索引） | 会议状态机与纪要 | 席位、任职、观察员（§2/§19） |
| 任务/阶段/看板/预算 | **08**（§4 工作流、§12.4 预算族、§19.5 键表） | 任务板与机器强制门 | 竞标/认领/分配与公平轮转（§10/§17） |
| 钩子与中间件 | **05**（§4 全表） | 钩子注册与失败策略 | 需要哪些**社会钩子**（§22.3） |
| 归档/台账/记忆 | **07**（§2–§3、S21 头部列表纪律） | 耐久与头部列表 | 经验卡/压缩/交接包格式（§8/§11） |
| 参数与热改 | **04**（§4 全表、§11 生成表） | 参数登记与"已接线/未接线" | §20 的 140 个拟增键（**由生成管线登记** ✓） |
| 接口登记 | **03**（§2 服务、§3 工具、§5 钩子索引、§8 错误码） | 公开面契约 | §21 的 73 个拟增码 ＋ §22 的面清单 |
| 宪章与 pack | **10**（§2 manifest 字段） | 装载期结构 | 运行期可修订的宪章（§15） |
| 数学/形式化能力 | **09**（§? 形式化面） | 编译/验证能力 | 能力声明与协商（§9） |
| 未决/未核 | **14**（§1 O 系列、§2 U 系列） | 登记处 | §25 的未核项（**编号登记见 14-§2** ✓） |
| 实现侧做法 | **11**（§4.1 接缝纪律、§5 场景规范） | 场景与接缝纪律 | 本卷 §24 的门禁断言与具名红 |

> **本卷**的`未核项`已按任务要求写明"编号登记见 `14-§2`" ✓；本卷**不含任何已实现的"社会"服务**（19 个服务、11 个工具、28 个钩子全部为规划 ✗），**唯一已实现的底座**是 `vmu.members`（席位/容量/任职）＋`vmu.store/library/work/tasks`（记忆与台账）＋08 的治理原语 ✓ —— 这一点在全卷对每个条目都标注了成熟度 ✓。

---

## 27. 交界表：与 08 卷的分工（**谁定义／谁引用**；独立批评者第 5 轮 X1 的处置 ✓）

### 27.1 分界规则（三条判据，先判后写 ✓）

| 判据 | 归谁 | 例子 |
|---|---|---|
| **机制/程序**：怎样开会、怎样表决、怎样推进阶段、怎样限流与计量 | **08 定义** ✓ | 会议状态机、三层门槛、表决方法族、阶段门、看板 WIP、预算硬门、控制流 |
| **社会关系/身份**：谁是谁、凭什么被选中、委托给谁、谁来仲裁、记忆与技能归谁、如何交接、机构怎么自组织 | **17 定义** ✓ | 席位与任职、委托链、信任与声誉、仲裁者选择、经验卡与技能库、竞标、交接包、拓扑、宪章、身份归属、公平、人类在环 |
| **共享项**（两卷都会用到的旋钮/码） | **定义留在 08** ✓（`settings/planned.js` 按"最低卷号"归因 08 ✓）／**17 只引用** ✗ | 本节 27.2／27.3 逐条列出 |

**为什么共享项留 08**：① 它们是**程序性**的（表决/预算/审计/工作流），放在社会卷会让"机制的定义"分裂 ✗；② 生成管线按**最低卷号**归因 ⇒ 两处都写只会让读者以为有两个来源 ✗；③ 08 已经把它们写成**可实现的判定点/参数**，17 需要的是"用在什么社会场景"（那才是 17 的价值 ✓）。

### 27.2 共享**键**（11 条）——定义在 08，17 只引用 ✓

| 键 | 定义（08 的位置） | 本卷的用到处（17） | 为何留 08 |
|---|---|---|---|
| `vmu.workflow.escalationAfterMs` | 08-§19.5（工作流族） | §6 升级（L106） | 升级是**工作流**的时限机制 ✓ |
| `vmu.workflow.escalationTarget` | 08-§19.5 | §6 升级（L106） | 同上（目标对象是程序配置 ✓） |
| `vmu.workflow.claimRequired` | 08-§19.5 | §10 认领（L147） | 认领门是**任务板**机制 ✓ |
| `vmu.ballot.reopenInitiatorScope` | 08-§19.4（表决族） | §7 撤回共识（L117） | 复议门槛是**表决**机制（防滥诉 ✓） |
| `vmu.ballot.reopenFloor` | 08-§19.4 | §7 撤回共识（L119） | 同上 |
| `vmu.ballot.secrecy` | 08-§19.4 | §16 化名与匿名（L213） | 记名/不记名是**表决**机制 ✓ |
| `vmu.minutes.dissentMandatory` | 08-§19.1（纪要族） | §7 异议与保留（L117） | 少数意见入档是**纪要**机制 ✓ |
| `vmu.budget.fairnessPolicy` | 08-§19.6（预算族） | §17 资源公平（L220、L424） | 配额公平是**预算**机制；本卷只加"社会侧份额"（`vmu.fairness.minShares` 等）✓ |
| `vmu.audit.traceKeepMs` | 08-§19.6（审计族） | §18 追踪与关联（L233） | 审计保留期是**审计**机制 ✓ |
| `vmu.arbitration.mode` | 08-§19.6（仲裁族） | §6 仲裁（L107、L471） | 仲裁**开关**是程序配置；本卷只定义**仲裁者选择**（`vmu.conflict.arbiterRule`／`arbiterMustDiffer`）✓ |
| `vmu.arbitration.binding` | 08-§19.6 | §6 仲裁（L108） | 裁决**效力**是程序配置 ✓ |

> **本卷因此删掉的重复项**：**"公平策略"键**（与 08 的 `vmu.budget.fairnessPolicy` 同一旋钮 ✗ ⇒ 已删，且不再以字面键名出现 ✓）。

### 27.3 共享**码**（13 条具体码 ＋ 4 个 08 码族）——定义在 08，17 只引用 ✓

| 码 | 定义（08 的位置） | 本卷的用到处 | 为何留 08 |
|---|---|---|---|
| `VMU_INVALID_ARGUMENT` | 08-§20 表头（通用） | 本卷各条"错误码"列 | 通用参数错误 ✓ |
| `VMU_STATE` | 08-§20 | 状态不允许（席位/委托/交接等） | 通用状态错误 ✓ |
| `VMU_NOT_PERMITTED` | 08-§20 | 职责分离/罢免/宪章/人类否决 | 通用权限错误 ✓ |
| `VMU_NOT_MEMBER` | 08-§20 | 身份/归属（§1/§16） | 通用身份错误 ✓ |
| `VMU_NO_SUCH_OBJECT` | 08-§20 | 悬空席位/任务/纪要 | 通用悬空错误 ✓ |
| `VMU_RESOURCE_BUDGET` | 08-§20 | 容量/配额/委托预算 | 预算与容量是**机器强制** ✓ |
| `VMU_MIDDLEWARE_REJECTED` | 08-§20 | 社会钩子被拒（§22.3） | 钩子拒绝的统一码 ✓ |
| `VMU_MIDDLEWARE_FAILED` | 08-§20 | 判定点异常 | 同上 ✓ |
| `VMU_IO_FAILED` | 08-§20 | 交接包/记忆写盘 | 耐久层 ✓ |
| `VMU_STORE_FAILED` | 08-§20 | 记忆底座 | 耐久层 ✓ |
| `VMU_ENGINE_UNAVAILABLE` | 08-§20 | 能力降级/无引擎 | 引擎不可用 ✓ |
| `VMU_PACK_CONFLICT` | 08-§20 | 宪章 vs pack（§15） | 与 pack 装载冲突 ✓ |
| `VMU_IDEMPOTENCY_KEY_REUSED` | 08-§20 | 委托/交接去重 | 幂等是程序纪律 ✓ |
| 码族 `VMU_MEETING_*`／`VMU_MINUTES_*`／`VMU_REOPEN_*`／`VMU_TASK_*` | 08-§20.1／§20.2 | 听证/纪要/复议/任务（§6/§7/§10） | 08 的码族 ✓ |

> **本卷因此删掉的重复行**：`VMU_IDEMPOTENCY_KEY_REUSED` 原在 §21.2 单列一行 ⇒ 已删（只在上表引用）✓；§21 计数 **73 → 72** ✓。

### 27.4 反向：**17 定义、08 引用**（本卷独有的族 ✓）

| 本卷定义的族 | 08 需要引用的地方 | 说明 |
|---|---|---|
| `vmu.delegation.*`（11 键）＋`VMU_DELEGATION_*` | 08 的临时授权面（08-§2.2-B / 44 行授权语义） | **命令级**授权归 08；**实例级**委托归 17 ✓ |
| `vmu.roles.*`（10）／`vmu.recruit.*`（7） | 08 的席位与法定人数（08-§2.2-C） | 08 只问"谁在场/够不够人"；**任职与任期**归 17 ✓ |
| `vmu.trust.*`（11）／`vmu.collusion.*`（6） | 08 的仲裁者与候选人排序（08-§6 参考） | 声誉**不改权限**（S-3），08 只读排序建议 ✓ |
| `vmu.charter.*`（10）／`vmu.topology.*`（5） | 08 的会议类型与阶段（08-§15/§4） | 08 管**一场会**；17 管**机构本身** ✓ |
| `vmu.identity.*`（9）／`vmu.fairness.*`（5）／`vmu.human.*`（6） | 08 的观察员/表决权/审批（08-§2.2-C/§3.2） | 08 管**票**；17 管**人与归属** ✓ |
| `vmu.handover.*`（7）／`vmu.memory.*`（9）／`vmu.skills.*`（6）／`vmu.auction.*`（10）／`vmu.conflict.*`（8）／`vmu.consensus.*`（3）／`vmu.explain.*`（7）／`vmu.mentor.*`（4）／`vmu.discipline.*`（6） | 08 的任务板/归档/升级（08-§4/§19.5） | 08 管**任务与在途**；17 管**交接与知识** ✓ |

> **两处"反向归属"已两卷同步** ✓（这是唯一两处由 17 定义、08 改为引用的地方）：
> ① **仲裁本体**（仲裁者选择/回避/听证/效力）定义在 **17-§6** ✓ ⇒ 08-§4 的"仲裁与冲突解决"一行已改为引用 17-§6（08 侧只保留**升级时限与目标** `vmu.workflow.escalationAfterMs`／`escalationTarget` ✓ 与会议/表决面 ✓）；理由：仲裁是**社会关系**（谁判谁、判了算不算），不是程序机制 ✗。
> ② **交接本体**（交接单/上下文压缩包/验收字段）定义在 **17-§11** ✓ ⇒ 08-§4 的"交接与升级"一行已改为引用 17-§11（08 侧只保留**在途台账** `work.interrupt()`／`recover()` ✓）；理由：交接是**责任与人际**的事，08 只需保证"在途不丢" ✓。

### 27.5 禁止与处置（**两卷共同纪律**）

1. **一个机制只能有一处定义** ✗：发现两卷各写一套 ⇒ **立刻停下报 Lead**，不得两处并行修改 ✓；
2. **引用必须给节号** ✓（本表已给到节/行）；
3. **删改要两卷同步** ✓：本次 17 删**两处重复键**（"公平策略"键／"共识分类"键，均不再以字面键名出现 ✗）＋§21.2 的重复码行 ⇒ 08 侧同步加**交界表 §24** ✓（不重复登记、只列"谁定义／谁引用"）；
4. **生成管线归 Lead** ✗：本卷只改文档 ✓；`settings/planned.js` 的重新归因由 Lead 跑 `--write` ✓。

### 27.6 本次同步记录（两卷）

- **17**：删**"公平策略"键**（→ 引 08 `vmu.budget.fairnessPolicy`）✓；删**"共识分类"键**（→ 用本卷 `vmu.conflict.classes`）✓；删 §21.2 的 `VMU_IDEMPOTENCY_KEY_REUSED` 行（→ 引 08）✓；键计数 **142 → 140**、码计数 **73 → 72** ✓；新增本节 §27 ✓；§0.1 增"设计目标 vs 实现保证"纪律 ✓；四处 `S-x 机器强制` 改为"设计目标（当前未实现 ✗）" ✓（两处被删键的说明也**不再写具体键名** ✗，避免被生成管线重新声明 ✓）。
- **08**：新增 **§24 交界表**（镜像本节 ✓）；§19 表头增"**全部为 `planned`（未接线）**" ✓；§6.2 增"本节 8 条**均已实现** ✓" ✓；`vmu.budget.*` 一行的"机器强制"改为"设计原则（当前仅 `vmu.limits.*` 已实现 ✓）" ✓；§0.2 增"设计目标 vs 实现保证"第 ④ 条纪律 ✓。

---

## 28. G11 · 教学/研讨班与课程面（Course & Cohort；**默认不启用＝零机制** ✗✓）

> **定位**：§12 的"监护与带教"只覆盖**一对一**（mentor/mentee）✗；本节补**一对多／多对多**的教学语义（课程、同期组、作业、互评、盲评、反馈发布）✓。
> **零机制**：`vmu.course.enabled=false`（默认 ✓）⇒ 不声明就**不存在课程对象、不存在教学角色、不存在作业** ✓（与 §0.2 的 S-1 同族：内核只给 role **slot**，教学是**机构语义** ✓）。
> **成熟度**：本节**全部为规划 ✗**（当前没有任何课程/作业/评分代码 ✅）；与教学相关的**已实现底座**只有 `vmu.members`（席位/容量）＋`vmu.library`（材料归档）＋08 的会议（研讨班＝一场会 ✓ 08-§2/§15）。

### 28.1 本体（对象与字段；✗ 规划）

| 对象 | 字段 | 说明 |
|---|---|---|
| `Course` | `id`／`title`／`syllabus[]`／`unitIds[]`／`readings[]`／`assignmentIds[]`／`rubricRef`／`instructorIds[]`／`cohortIds[]`／`state(draft｜open｜running｜closed｜archived)`／`visibility(private｜institution｜public)` | 课程是**机构语义**，不是内核对象 ✓ |
| `Unit` | `id`／`courseId`／`order`／`objectives[]`／`materialRefs[]`／`dueAt?` | 单元＝有目标与材料的阶段 |
| `Assignment` | `id`／`courseId`／`unitId?`／`kind(problem-set｜proof｜essay｜review｜presentation)`／`prompt`／`rubricRef`／`dueAt`／`submitMode(artifact｜inline｜both)`／`allowLate`／`maxAttempts` | **rubric 必须事先固定** ✓ |
| `Submission` | `id`／`assignmentId`／`by`／`at`／`artifactRefs[]`／`state(submitted｜late｜withdrawn｜graded)`／`blinded` | 提交＝**只增**（撤回＝状态变更＋留痕 ✓） |
| `Review` | `id`／`submissionId`／`reviewer?`（盲评时**不写**）／`verdict`／`score?`／`comments[]`／`evidenceRefs[]`／`rubricAnchors[]`／`at`／`published` | 评语带**证据**与**rubric 锚点**才可发布 ✓ |
| `Cohort` | `id`／`courseId`／`memberIds[]`／`term`／`capacity` | 同期学员组（同类一起学） |
| `Enrollment` | `{memberId,courseId,role(instructor｜ta｜student｜auditor),since,state}` | 选课＝**归属**；权限仍来自席位 ✓ |

### 28.2 条目（11 字段）

- **课程与单元（course/unit）** ｜ 目的：把"教什么、按什么顺序、用什么材料"变成可引用对象 ｜ 面向谁：讲师／机构 ｜ 接口形状：规划 `kernel.course.create/addUnit/publish`（⛔ 未实现）；工具面规划 `vibe_vmu_course`（⛔ 未实现） ｜ 可调控：`vmu.course.*` ｜ 错误码：`VMU_COURSE_DISABLED`（拟增）／`VMU_COURSE_CLOSED`（拟增）／`VMU_COURSE_UNIT_UNKNOWN`（拟增）／`VMU_INVALID_ARGUMENT`（✓） ｜ 哲学：F✓（默认关）T✓D✓X✓ ｜ 实现要点：课程**不改变权限**（S-2/S-3 同族 ✓）；材料只**引用**库 id（不搬正文 ✓ 07 纪律） ｜ 依赖：席位 ✓＋库 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **同期组与选课（cohort/enrollment）** ｜ 目的：谁和谁同期、以什么身份参加 ｜ 面向谁：讲师／机构 ｜ 接口形状：规划 `kernel.course.enroll/roster`（⛔ 未实现） ｜ 可调控：`vmu.course.cohortMax`／`enrollmentNeedsApproval`／`allowAuditors` ｜ 错误码：`VMU_COURSE_ENROLL_DENIED`（拟增）／`VMU_COURSE_COHORT_FULL`（拟增）／`VMU_SLOT_FULL`（拟增，若绑定席位容量） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**旁听＝只读**（不提交、不评分 ✓）；容量与席位容量**双重检查** ✓ ｜ 依赖：§2 席位 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **教学角色（instructor / TA / student / auditor）** ｜ 目的：把教学身份落到既有 role slot 上 ｜ 面向谁：机构 ｜ 接口形状：**pack 声明 slot** ✓（`kernel.members.roles()` ✓）＋**选课记录**（Enrollment ✗） ｜ 可调控：pack 的 `slots[]` ✓／`vmu.roles.*`（§20.1 ✓） ｜ 错误码：`VMU_SLOT_UNKNOWN`（拟增）／`VMU_NOT_PERMITTED`（✓） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**席位给权限、选课给归属** ✓（两层，不得混 ✗）；内核**不出现**"讲师"这种字面角色名（S-1 ✓） ｜ 依赖：§2／§3 ｜ 成熟度：**部分 ✓**（席位）／教学语义 ✗ ｜ 优先级：P1
- **作业与提交（assignment/submission）** ｜ 目的：有截止、有次数、有产出的学习任务 ｜ 面向谁：学员／讲师 ｜ 接口形状：规划 `kernel.course.submit/withdraw`（⛔ 未实现） ｜ 可调控：`vmu.course.submitMode`／`allowLate`／`latePenaltyRatio`／`maxAttempts` ｜ 错误码：`VMU_ASSIGNMENT_DUE_PASSED`（拟增）／`VMU_ASSIGNMENT_ATTEMPTS_EXHAUSTED`（拟增）／`VMU_SUBMISSION_DUPLICATE`（拟增）／`VMU_SUBMISSION_WITHDRAWN`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**先固定 rubric 再收作业** ✓；迟交按参数扣分（**默认不允许迟交、也不扣分** ✓ 最保守） ｜ 依赖：库 ✓／07 归档 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **互评与盲评（peer review / blind review）** ｜ 目的：多视角反馈＋公平 ｜ 面向谁：学员／讲师 ｜ 接口形状：规划 `kernel.course.review`（⛔ 未实现）＋盲评映射（审计侧可解绑 ✓） ｜ 可调控：`vmu.course.reviewRounds`／`reviewersPerSubmission`／**`blindReview`（默认 true ✓）**／`selfReviewAllowed`（默认 false ✓）／`peerWeight` ｜ 错误码：`VMU_REVIEW_NOT_ELIGIBLE`（拟增）／`VMU_REVIEW_SELF_DENIED`（拟增）／`VMU_REVIEW_ROUNDS_EXHAUSTED`（拟增）／`VMU_BLIND_MAPPING_DENIED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**盲评＝评阅时不写 `reviewer`**，映射只留审计侧（与 §16 化名机制同源 ✓）；不得自评；互评**不得**成为唯一成绩来源（§12 带教复核的独立性 ✓） ｜ 依赖：§17 公平＋§5 防串谋 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **反馈发布与评分公正（feedback / fairness）** ｜ 目的：评语**有据**、成绩**可复核** ｜ 面向谁：讲师／学员／审计者 ｜ 接口形状：规划 `kernel.course.publishGrade/amend`（⛔ 未实现）；工具面规划 `vibe_vmu_grade`（⛔ 未实现） ｜ 可调控：`vmu.course.rubricRequired`（默认 true ✓）／`requireEvidence`（默认 true ✓）／`requireRubricRef`（默认 true ✓）／`gradeChangeAdditive`（默认 true ✓）／`peerWeight` ｜ 错误码：`VMU_COURSE_RUBRIC_REQUIRED`（拟增）／`VMU_REVIEW_EVIDENCE_REQUIRED`（拟增）／`VMU_REVIEW_RUBRIC_REQUIRED`（拟增）／`VMU_GRADE_IMMUTABLE`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**无证据/无 rubric 锚点 ⇒ 不得发布**（不是警告 ✓）；改分＝**追加记录**（不覆盖 ✓，与 07 只增纪律一致）；同侪评分离群时**只提示复核**，不自动剔除 ✗（与 §17 "只报告不惩罚"同族 ✓） ｜ 依赖：§17／§18／07 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **评语与证据留痕（auditability）** ｜ 目的：成绩与评语可解释、可复算 ｜ 面向谁：审计者／人类 ｜ 接口形状：**复用 §18** 的理由字段与解释报告（`vmu.explain.*` ✗）＋07 归档 ✓ ｜ 可调控：`vmu.explain.reasonRequired` ✓（§20.6）／`vmu.course.requireEvidence`／`vmu.course.retentionMs` ｜ 错误码：`VMU_EXPLAIN_DENIED`（拟增）／`VMU_REASON_REQUIRED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：每份评语必带 `evidenceRefs`＋`rubricAnchors`；**盲评解绑也要留痕** ✓ ｜ 依赖：§18＋07 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **隐私与可见性（privacy）** ｜ 目的：作业/评语不得默认公开 ｜ 面向谁：机构／学员 ｜ 接口形状：规划 `society.courseVisibility` 判定点（⛔ 未实现） ｜ 可调控：`vmu.course.publishToLibrary`（默认 false ✓）／`vmu.course.visibility`／`blindMappingRetentionMs` ｜ 错误码：`VMU_COURSE_PRIVACY_DENIED`（拟增）／`VMU_MEMORY_VISIBILITY_DENIED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：默认**不进机构库**；跨机构默认**不可见**（与 §16/§17 的可见性纪律一致 ✓）；与 20 卷（隐私合规）的执行面衔接 ✓ ｜ 依赖：§16／§17／20 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **课程归档与结束（archive）** ｜ 目的：课程结束不等于记忆消失 ｜ 面向谁：机构 ｜ 接口形状：**复用 07**（`vmu.store`／`vmu.library` ✓）＋规划 `kernel.course.archive`（⛔ 未实现） ｜ 可调控：`vmu.course.retentionMs`／`state=archived` ｜ 错误码：`VMU_IO_FAILED`（✓）／`VMU_STORE_FAILED`（✓）／`VMU_COURSE_CLOSED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：归档保存**大纲-单元-作业-rubric-评语链**（可复算成绩 ✓）；归档后不得再提交（`VMU_COURSE_CLOSED` ✓） ｜ 依赖：07 ✓ ｜ 成熟度：**部分 ✓**（底座）／课程归档 ✗ ｜ 优先级：P3
- **研讨班与既有会议面的衔接（seminar＝a meeting）** ｜ 目的：不重复造"开会" ✗ ｜ 面向谁：讲师／学员 ｜ 接口形状：**复用 08**（`kernel.meeting()` ✓、`kind:'seminar'` ✓ 08-§15 类型目录）＋可选关联课程（✗ 规划） ｜ 可调控：08 的会议族 ✓（`vmu.meetings.*`）／`vmu.course.*` ｜ 错误码：`VMU_STATE`（✓）／`VMU_COURSE_DISABLED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**会议机制全部复用 08**（轮次/发言/纪要 ✓），17 只提供"这节课属于哪门课/哪些人" ✓（交界见 §28.4 ✓） ｜ 依赖：08 ✓ ｜ 成熟度：**已实现 ✓**（会议）／课程关联 ✗ ｜ 优先级：P2

### 28.3 拟增键（教学族 `vmu.course.*`；全部**未接线** ✗）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.course.enabled` | bool | false | bool | 所办 | 重启 | 教学面总开关（**默认关＝零机制** ✓） |
| `vmu.course.ontologyVersion` | string | `1` | 版本号 | pack | 重启 | 本体版本（迁移用，13 卷） |
| `vmu.course.visibility` | enum | `institution` | `private｜institution｜public` | pack | 下轮 | 课程可见性（默认**仅机构内** ✓；与 `publishToLibrary` 分工：一个管"谁能看"，一个管"是否进库" ✓） |
| `vmu.course.maxUnits` | int | 0 | ≥0 | 所办 | 立即 | 单元上限（0＝不限） |
| `vmu.course.readingsRequired` | bool | false | bool | pack | 下轮 | 单元是否必须带读物 |
| `vmu.course.rubricRequired` | bool | true | bool | pack | 下轮 | 发布作业前必须有 rubric |
| `vmu.course.cohortMax` | int | 0 | ≥0 | 所办 | 立即 | 同期组容量（0＝不限） |
| `vmu.course.allowAuditors` | bool | true | bool | pack | 下轮 | 是否允许旁听（只读 ✓） |
| `vmu.course.enrollmentNeedsApproval` | bool | false | bool | pack | 下轮 | 选课是否需要批准 |
| `vmu.course.submitMode` | enum | `artifact` | `artifact｜inline｜both` | pack | 下轮 | 提交形式（默认走库里的产出 ✓） |
| `vmu.course.allowLate` | bool | false | bool | pack | 下轮 | 是否允许迟交（默认否 ✓） |
| `vmu.course.latePenaltyRatio` | number | 0 | 0..1 | pack | 下轮 | 迟交扣分比例 |
| `vmu.course.maxAttempts` | int | 1 | ≥1 | 所办 | 下轮 | 每人提交次数上限 |
| `vmu.course.reviewRounds` | int | 1 | ≥1 | 所办 | 下轮 | 互评轮次（有界 ✓） |
| `vmu.course.reviewersPerSubmission` | int | 2 | ≥1 | 所办 | 下轮 | 每份作业评阅人数 |
| `vmu.course.blindReview` | bool | true | bool | pack | 下轮 | **盲评开关（默认开＝更公平** ✓） |
| `vmu.course.blindMappingRetentionMs` | ms | 0 | ≥0 | 所办 | 立即 | 盲评映射保留期（审计侧可解绑 ✓） |
| `vmu.course.selfReviewAllowed` | bool | false | bool | pack | 下轮 | 是否允许自评（默认否 ✓） |
| `vmu.course.peerWeight` | number | 0 | 0..1 | 所办 | 下轮 | 互评占成绩权重（0＝只作反馈 ✓） |
| `vmu.course.requireEvidence` | bool | true | bool | pack | 下轮 | 评语必须带证据才可发布 |
| `vmu.course.requireRubricRef` | bool | true | bool | pack | 下轮 | 评语必须带 rubric 锚点 |
| `vmu.course.gradeChangeAdditive` | bool | true | bool | pack | 重启 | 成绩变更只增不改（**建议恒 true** ✓） |
| `vmu.course.publishToLibrary` | bool | false | bool | pack | 下轮 | 课程材料是否进机构库（默认否＝隐私 ✓） |
| `vmu.course.retentionMs` | ms | 0 | ≥0 | 所办 | 立即 | 课程归档保留期 |

### 28.4 交界（**不重复造机制** ✗）

| 教学面需要什么 | 归谁定义 | 说明 |
|---|---|---|
| 研讨班"开会"本身（轮次/发言/纪要/收束） | **08** ✓ | `kernel.meeting()` ✓／`kind:'seminar'` ✓（08-§15）；本节**不重复** ✗ |
| 权限与容量（谁能做什么、坐几个人） | **08/内核** ✓ | role slot＋`capacity` ✓；教学角色只**映射**到 slot ✓ |
| 材料与产出的归档 | **07** ✓ | `vmu.library`／`vmu.store` ✓；作业成果＝库里的产出 ✓ |
| 任务与阶段（作业＝任务？） | **08** ✓ | 需要"必须做的活"时用 `vmu.tasks.*` ✓；**成绩**不是任务状态 ✗ |
| 带教一对一 | **17-§12** ✓ | mentor/mentee 是本卷的**一对一**语义；课程是**一对多** ✓ |
| 公平与防串谋 | **17-§17** ✓ | 互评配额/离群提示走 §17 ✓ |
| 可解释与审计 | **17-§18** ✓ | 评语证据与理由字段 ✓ |
| 隐私与合规 | **17-§16** 声明／**20** 执行 ✓ | 默认不进库、跨机构不可见 ✓ |

### 28.5 拟增错误码（教学面）

`VMU_COURSE_DISABLED`（教学面未启用 ⇒ 零机制）／`VMU_COURSE_CLOSED`（课程已关闭/归档，不得提交）／`VMU_COURSE_UNIT_UNKNOWN`（单元不存在）／`VMU_COURSE_RUBRIC_REQUIRED`（发布作业缺 rubric）／`VMU_COURSE_ENROLL_DENIED`（选课被拒）／`VMU_COURSE_COHORT_FULL`（同期组满）／`VMU_COURSE_PRIVACY_DENIED`（越权查看作业/评语）／`VMU_ASSIGNMENT_UNKNOWN`（作业不存在）／`VMU_ASSIGNMENT_DUE_PASSED`（已过截止）／`VMU_ASSIGNMENT_ATTEMPTS_EXHAUSTED`（提交次数用尽）／`VMU_SUBMISSION_DUPLICATE`（重复提交）／`VMU_SUBMISSION_WITHDRAWN`（已撤回）／`VMU_REVIEW_NOT_ELIGIBLE`（无评阅资格）／`VMU_REVIEW_SELF_DENIED`（不得自评）／`VMU_REVIEW_ROUNDS_EXHAUSTED`（互评轮次用尽）／`VMU_REVIEW_EVIDENCE_REQUIRED`（评语缺证据）／`VMU_REVIEW_RUBRIC_REQUIRED`（评语缺 rubric 锚点）／`VMU_BLIND_MAPPING_DENIED`（无权解绑盲评映射）／`VMU_GRADE_IMMUTABLE`（成绩不可覆盖，只能追加）（**19 个，全部拟增** ✓）。

### 28.6 拟增工具与钩子（**全部未实现** ✗）

- 工具（⛔ 未实现）：`vibe_vmu_course`（课程/单元/作业/提交）、`vibe_vmu_grade`（评审/发布/追加改分）。
- 钩子（**未注册 ✗，规划**）：`course/opened`、`cohort/formed`、`assignment/published`、`assignment/submitted`、`review/submitted`、`feedback/published`、`grade/amended`。

---

## 29. G17 · 通知/订阅与信噪比（Watchers & Signal-to-noise；**默认关闭** ✗✓）

> **定位**：多代理协作最大的隐性成本是**噪声**（谁都@所有人、重复告警、半夜打扰）✗。本节定义"**发给谁／订阅什么／怎么合并／什么时候别打扰**" ✓。
> **零机制**：`vmu.notify.enabled=false`（默认 ✓）⇒ 不声明就**没有订阅、没有投递、没有摘要** ✓。
> **成熟度**：本节**全部为规划 ✗**（`vmu.notify.*` 均为 `planned` 键 ✓；`vibe_vmu_notify` 等工具 **⛔ 未实现**）；已实现底座只有 05 的钩子总线 ✓＋07 的审计留痕 ✓。

### 29.1 订阅模型（`watchers[]`）

```
watchers: [{
  id, subject: { kind: 'member|slot|institution|task|meeting|course|record|metric',
                 ids: [...] },                 // 订阅谁/什么
  events: ['task/transition', 'ballot/tally', ...], // 订阅哪些事件（05 的钩子名 ✓）
  channel: 'inbox|digest|hook|file',           // 投递通道
  quiet: { from: '22:00', to: '07:00', tz: 'local' } | null,   // 个人免打扰
  digest: { windowMs, mode: 'immediate|batch|hourly|daily' },  // 摘要
  priorityFloor: 'low|normal|high',            // 低于此优先级不打扰
  enabled: true, since
}]
```
**纪律**：① `subject.ids` 必须**可见**（§29.4 可见性）✓；② `events` 必须是**已注册钩子**或已登记事件（**不认识的事件 ⇒ 具名拒** ✓ 不得静默漏收 ✗）；③ `quiet`/`digest` 只影响**投递**，不影响**记录**（事件仍进审计 ✓）；④ 订阅本身是**审计对象**（谁订阅了谁、为什么 ✓ §18）。

### 29.2 条目（11 字段）

- **订阅（watch）** ｜ 目的：把"我想知道什么"变成声明 ｜ 面向谁：成员／机构 ｜ 接口形状：规划 `kernel.watch.subscribe/unsubscribe/list`（⛔ 未实现）；工具面规划 `vibe_vmu_watch`（⛔ 未实现） ｜ 可调控：`vmu.notify.*` ｜ 错误码：`VMU_NOTIFY_DISABLED`（拟增）／`VMU_WATCH_LIMIT`（拟增）／`VMU_WATCH_SUBJECT_UNKNOWN`（拟增）／`VMU_WATCH_EVENT_UNKNOWN`（拟增）／`VMU_WATCH_DUPLICATE`（拟增）／`VMU_WATCH_VISIBILITY_DENIED`（拟增）／`VMU_WATCH_CROSS_INSTITUTION_DENIED`（拟增）／`VMU_NOTIFY_REASON_REQUIRED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：订阅**不改权限**（只影响"被告知"，不影响"能做什么" ✓ S-3 同族）；未注册事件**具名拒** ✓ ｜ 依赖：05 钩子 ✓／§16 身份／§18 审计 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **投递通道（channel）** ｜ 目的：同一事件按不同紧迫度走不同通道 ｜ 面向谁：订阅者 ｜ 接口形状：规划 `kernel.notify.deliver`（⛔ 未实现）；工具面规划 `vibe_vmu_notify`（⛔ 未实现） ｜ 可调控：`vmu.notify.channels`（`inbox｜digest｜hook｜file`）／`vmu.notify.defaultChannel` ｜ 错误码：`VMU_WATCH_CHANNEL_UNSUPPORTED`（拟增）／`VMU_NOTIFY_CHANNEL_FAILED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：`hook` 通道＝**复用 05 的总线**（不新造通道语义 ✓）；`file` 通道走 07 归档 ✓ ｜ 依赖：05 ✓／07 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **去重（notification-level dedup）** ｜ 目的：同一件事不重复打扰 ｜ 面向谁：订阅者 ｜ 接口形状：规划（判定点 `society.notifyDedup` ⛔ 未实现） ｜ 可调控：`vmu.notify.dedupWindowMs`（默认 60000 ✓）／`vmu.notify.maxSubjectsPerWatcher` ｜ 错误码：`VMU_NOTIFY_DEDUPED`（拟增，**是正常回执不是错误** ✓ 但仍需可观测） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**通知级指纹＝watcher＋事件＋对象**（与 **21 的告警级指纹**＝指标＋对象＋码**不同层** ✗ 见 §29.5 ✓）；去重**必须计数**（"合并了多少" ✓ 21 同纪律） ｜ 依赖：05 事件 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **合并与摘要（merge / digest）** ｜ 目的：把 N 条小事件变成 1 份摘要 ｜ 面向谁：订阅者 ｜ 接口形状：规划 `kernel.notify.digest`（⛔ 未实现） ｜ 可调控：`vmu.notify.mergeWindowMs`／`mergeMaxPerDigest`／`digestDefaultMs` ｜ 错误码：`VMU_NOTIFY_DIGEST_PENDING`（拟增）／`VMU_NOTIFY_TRUNCATED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：摘要**不得丢事实**：被截断的必须给 `kept/dropped` 计数（与 07/21 的截断纪律一致 ✓） ｜ 依赖：§29.3 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **静默窗口（personal quiet hours）** ｜ 目的：人有下班时间 ｜ 面向谁：订阅者 ｜ 接口形状：规划（`watcher.quiet` ✗） ｜ 可调控：`vmu.notify.quietDefault`／`vmu.notify.quietTimezone` ｜ 错误码：`VMU_NOTIFY_QUIET_SUPPRESSED`（拟增，正常回执 ✓） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：静默期**不投递但必须留痕并计数** ✓；恢复后**补一份摘要**（与 **21 的维护静默**同纪律 ✓）；**静默不等于丢弃** ✗ ｜ 依赖：§29.3／21 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **信噪比（signal-to-noise）** ｜ 目的：让"太吵了"可度量、可干预 ｜ 面向谁：机构／人类 ｜ 接口形状：规划 `kernel.notify.metrics`（⛔ 未实现）＋**21 的指标面**（21-§4 ✓） ｜ 可调控：`vmu.notify.snrFloor`／`vmu.notify.suppressSelfEvents`（默认 true ✓）／`vmu.notify.priorityFloor` ｜ 错误码：`VMU_NOTIFY_SNR_BELOW_FLOOR`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：指标＝`delivered／merged／suppressed／failed／deduped`；低于下限**只提示**，**不得自动改订阅** ✗（与 §17 "只报告不惩罚"同族 ✓） ｜ 依赖：21-§4 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P2
- **失败语义（failure semantics）** ｜ 目的：通知坏了不能拖垮业务 ｜ 面向谁：全体 ｜ 接口形状：规划（判定点 `society.notifyFailure` ⛔ 未实现）＋**05 的失败策略** ✓ ｜ 可调控：`vmu.notify.dropOnFailure`（默认 true ✓）／`vmu.notify.failureKeepMs` ｜ 错误码：`VMU_NOTIFY_CHANNEL_FAILED`（拟增）／`VMU_MIDDLEWARE_FAILED`（✓） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**投递失败绝不阻断被通知的业务** ✓（业务回执里带 `notified:false` ✓）；但**必须留痕＋计数** ✓（不得静默 ✗） ｜ 依赖：05 ✓／07 审计 ✓ ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1
- **可见性与隐私（visibility）** ｜ 目的：谁能订阅谁 ｜ 面向谁：机构／成员 ｜ 接口形状：规划（判定点 `society.watchVisibility` ⛔ 未实现） ｜ 可调控：`vmu.notify.crossInstitution`（默认 false ✓）／§16 的可见性族 ✓ ｜ 错误码：`VMU_WATCH_VISIBILITY_DENIED`（拟增）／`VMU_WATCH_CROSS_INSTITUTION_DENIED`（拟增） ｜ 哲学：F✓T✓D✓X✓ ｜ 实现要点：**私聊内容永不进入公共通知**（08 的 D6 口径 ✓）；跨机构默认**不可订阅** ✓；订阅关系本身是否公开＝参数（默认**不公开** ✓，与 §17 反垄断的"关系可见性"待裁 ✗） ｜ 依赖：§16／§17／20 ｜ 成熟度：**未实现 ✗** ｜ 优先级：P1

### 29.3 拟增键（通知族 `vmu.notify.*`；全部**未接线** ✗）

| 键 | 类型 | 默认 | 取值域 | 谁可改 | 热改 | 说明 |
|---|---|---|---|---|---|---|
| `vmu.notify.enabled` | bool | false | bool | 所办 | 立即 | 通知面总开关（**默认关＝零机制** ✓） |
| `vmu.notify.maxWatchers` | int | 0 | ≥0 | 所办 | 立即 | 每人订阅数上限（0＝不限） |
| `vmu.notify.maxSubjectsPerWatcher` | int | 0 | ≥0 | 所办 | 立即 | 单订阅主体上限 |
| `vmu.notify.channels` | string[] | `['inbox','digest']` | 子集 `{inbox,digest,hook,file}` | pack | 重启 | 允许的投递通道 |
| `vmu.notify.defaultChannel` | enum | `inbox` | 同上 | pack | 下轮 | 默认通道 |
| `vmu.notify.dedupWindowMs` | ms | 60000 | ≥0 | 所办 | 立即 | **通知级**去重窗口（watcher×事件×对象） |
| `vmu.notify.mergeWindowMs` | ms | 0 | ≥0 | 所办 | 立即 | 合并窗口（0＝不合并） |
| `vmu.notify.mergeMaxPerDigest` | int | 50 | ≥1 | 所办 | 立即 | 单份摘要最大条数（超出**计数并截断** ✓） |
| `vmu.notify.quietDefault` | string | `''` | `HH:MM-HH:MM` | 所办 | 立即 | 默认免打扰时段（空＝无） |
| `vmu.notify.quietTimezone` | string | `local` | 时区 | 所办 | 立即 | 免打扰时区 |
| `vmu.notify.digestDefaultMs` | ms | 0 | ≥0 | 所办 | 立即 | 默认摘要周期（0＝即时） |
| `vmu.notify.dropOnFailure` | bool | true | bool | pack | 立即 | 投递失败是否丢弃该条（**默认丢弃但不阻断** ✓） |
| `vmu.notify.failureKeepMs` | ms | 0 | ≥0 | 所办 | 立即 | 失败留痕保留期 |
| `vmu.notify.requireReason` | bool | true | bool | pack | 立即 | 订阅/退订必须给理由（S-4 同源 ✓） |
| `vmu.notify.crossInstitution` | bool | false | bool | 所办 | 重启 | 是否允许跨机构订阅（默认否 ✓） |
| `vmu.notify.suppressSelfEvents` | bool | true | bool | pack | 立即 | 抑制自己触发的事件（降噪 ✓） |
| `vmu.notify.priorityFloor` | string | `''` | `low｜normal｜high` | pack | 立即 | 低于此优先级不打扰 |
| `vmu.notify.snrFloor` | number | 0 | 0..1 | 所办 | 立即 | 信噪比下限（低于**只提示** ✓） |
| `vmu.notify.retentionMs` | ms | 0 | ≥0 | 所办 | 立即 | 通知记录保留期 |

### 29.4 拟增错误码（通知面）

`VMU_NOTIFY_DISABLED`／`VMU_WATCH_LIMIT`／`VMU_WATCH_SUBJECT_UNKNOWN`／`VMU_WATCH_EVENT_UNKNOWN`／`VMU_WATCH_CHANNEL_UNSUPPORTED`／`VMU_WATCH_DUPLICATE`／`VMU_WATCH_VISIBILITY_DENIED`／`VMU_WATCH_CROSS_INSTITUTION_DENIED`／`VMU_NOTIFY_QUIET_SUPPRESSED`／`VMU_NOTIFY_DEDUPED`／`VMU_NOTIFY_DIGEST_PENDING`／`VMU_NOTIFY_CHANNEL_FAILED`／`VMU_NOTIFY_TRUNCATED`／`VMU_NOTIFY_REASON_REQUIRED`／`VMU_NOTIFY_SNR_BELOW_FLOOR`（**15 个，全部拟增** ✓；其中 `VMU_NOTIFY_DEDUPED`／`QUIET_SUPPRESSED`／`DIGEST_PENDING` 是**正常回执**，仍必须可观测 ✓）。

### 29.5 与 21／05／18 的交界（**这是本节最重要的表** ✓）

| 问题 | 归 **17（本节）** ✓ | 归 **21（可观测与运维）** ✓ | 归 **05／18** ✓ |
|---|---|---|---|
| **发给谁 / 订阅什么** | ✅ 定义（`watchers[]`／subject／events） | — | — |
| **投递通道** | ✅ 定义（inbox/digest/hook/file，通道**选择**） | — | 05 提供事件总线与失败策略 ✓ |
| **通知级去重**（同一 watcher 的同一事件） | ✅ 定义（`vmu.notify.dedupWindowMs`） | — | — |
| **告警级去重**（指标＋对象＋码 指纹） | — | ✅ 21-§5.3 定义 | — |
| **个人免打扰（quiet hours）** | ✅ 定义（`watcher.quiet`／`quietDefault`） | — | — |
| **维护静默（silence）与恢复摘要** | — | ✅ 21-§5.3 定义（**恢复后必须补摘要**） | — |
| **抑制（inhibition）／升级（escalation）／阈值** | — | ✅ 21-§5.3 定义 | — |
| **通知失败不阻断业务＋留痕** | ✅ 语义要求（`dropOnFailure`） | ✅ 21-§2 的记录纪律 | ✅ 05 的失败策略（熔断/干跑） |
| **指标（信噪比、投递数）** | ✅ 语义（`snrFloor`） | ✅ 21-§4 的指标面/计数纪律 | — |
| **工具/协议/错误码速查** | 本节只**声明**需求 | 21-§6.3 引用 | ✅ **18** 登记（本卷不复制 ✗） |
| **隐私与合规执行** | ✅ 声明默认（不跨机构/不进库） | 观测其执行 | ✅ 20 执行 ✓ |

**与 21-§5.3 的双向一致性** ✓：21 已写"通知通道 **经 17 的通知原语**（成员/群/记录）" ⇒ 本节正是那个原语的定义处 ✓；本节**不定义**阈值/抑制/升级/维护静默 ✗（那些在 21 ✓），21 **不定义**订阅模型 ✗（那些在本节 ✓）。

### 29.6 拟增工具与钩子（**全部未实现** ✗）

- 工具（⛔ 未实现）：`vibe_vmu_notify`（投递/摘要/信噪比查询）、`vibe_vmu_watch`（订阅/退订/列举）。
- 钩子（**未注册 ✗，规划**）：`notify/queued`、`notify/merged`、`notify/suppressed`、`notify/sent`、`notify/failed`、`notify/digest-ready`、`watch/subscribed`、`watch/unsubscribed`。

### 29.7 配方（新增 4 条，接 §23 的编号）

| # | 目标机制 | 组合 | 可观测（断言点） | 失败模式 | 成熟度 |
|---|---|---|---|---|---|
| S13 | **教学班（研讨班＋作业＋盲评）** | 08 的 `kernel.meeting(kind:'seminar')` ✓ ＋ §28 课程本体（✗）＋ `blindReview=true` | 盲评时 `Review.reviewer` **缺失**（断言）；无证据发布 ⇒ `VMU_REVIEW_EVIDENCE_REQUIRED`（具名红） | 成绩无据、评阅者身份泄露 | 规划 ✗（会议面 ✓） |
| S14 | **只报告不惩罚的成绩复核** | `peerWeight` ＋ §17 离群"只提示"＋ §18 解释报告 | 离群评分 ⇒ **提示**且成绩不变（断言） | 自动剔除异见 ⇒ 同侪压力 | 规划 ✗ |
| S15 | **通知降噪（合并＋免打扰）** | `vmu.notify.mergeWindowMs`＋`vmu.notify.quietDefault`＋`vmu.notify.priorityFloor` | 窗口内 N 条 ⇒ **1 份摘要**且 `dropped/kept` 计数（断言）；静默期 ⇒ `VMU_NOTIFY_QUIET_SUPPRESSED` 且**记录仍在**（断言） | 半夜刷屏／静默期真丢事件 | 规划 ✗ |
| S16 | **通知坏了业务照跑** | `vmu.notify.dropOnFailure=true` ＋ §29.5 失败语义 | 通道失败 ⇒ 业务回执 `ok:true, notified:false`（断言）＋ `VMU_NOTIFY_CHANNEL_FAILED` 留痕（具名红） | 通知故障让任务/表决连锁失败 | 规划 ✗ |

