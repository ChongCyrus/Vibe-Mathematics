# vmu 交接基线 · 内核 / 接口 / 工具面（task-1）

- 侦察对象：`Vibe-Mathematics/vibe-math-vmu/`（主仓 `Vibe-Mathematics`，分支 `main`，HEAD `6d0164e`）
- 属性：**只读侦察**。本次未修改 `Vibe-Mathematics` 下任何文件；`git -C Vibe-Mathematics status --porcelain` 在跑完 4 个生成器后仍为空（实测）。
- 规模实测（本文件所有数字均来自代码，不是文档）：`kernel/**/*.js` **84 个 / 29,240 行**（其中 82 个在 `kernel/` 顶层，`kernel/prompt/index.js`、`kernel/turn/index.js` 在子目录）；`tools/*.js` **39 个 / 1,370 行**；宿主层 `host.js 691` / `host-hooks.js 205` / `host-spawn.js 196` / `host-math.js 158` / `vibe-math-vmu.js 525` 行；`settings/schema.js` 201KB（生成器读到 1,421 行）、`settings/planned.js` 44KB；`docs/*.md` 29 篇；`packs/*.js` 12 个；`extensions/*.js` 2 个；仓根 `tests/*.mjs` 313 个。
- 一句话结论：**内核（kernel）是这次交接里最扎实的一层；坏掉的是「内核 → 真宿主的最后一米」**——70 个公开服务名、82 个模块的被生成的索引、4 个生成器门禁全部自洽，但宿主适配层把 45 个工具面里的 35 个永久关在门外，且 turn 投递缝、idempotency 耐久键在真机上必然失效。

---

## 1. 内核模块地图（84 个模块，逐个职责 + docs/02 §2 A–I 分区对应）

分区依据：`vibe-math-vmu/docs/02-architecture.md:29-39`（A–I 表）与 `:43-59`（分区↔服务↔钩子表）。
**重要事实**：docs/02 的 A–I 表只点名了 17 个模块（生成器脚本自己承认「手写点名了 84 个里的 24 个」：`scripts/generate-kernel-index.mjs:3`），因此下表绝大多数行是 **✗ 未落 docs/02 §2 分区表**。docs/02:41 写「真实 `kernel/` ＝ 17 个 `.js`」，与实测 84 相差 67 个。

| 模块 | 一句话职责（取自代码头部注释） | docs/02 §2 分区 |
|---|---|---|
| `alerts.js` | 运维判断面：阈值、告警级去重、抑制、静默窗（静默必补摘要）、升级、SLO 错误预算、runbook | ✗ 未落表 |
| `arbitration.js` | 冲突案件/回避/听证/裁决/复议；当事人不得自裁（`VMU_ARBITER_IS_PARTY`） | ✗ 未落表 |
| `audit.js` | 只追加审计：入库前脱敏、写入失败具名、环形截断计数；不导出任何 mutate/delete | ✗ 未落表 |
| `auditchain.js` | 审计行前向哈希链（N1），可定位改/删/换序/插入到具体行；`hash`/`macKey` 均为注入缝 | ✗ 未落表 |
| `ballot.js` | 表决原语：process 读数≠裁决、三值结果、拒票不算票、冻结/法定数/复议 | E 会议与表决 |
| `ballotbox.js` | `vmu.ballot.*` 27 键策略层：法定数不足具名拒、弃权与缺席分开计数 | ✗ 未落表 |
| `bidding.js` | 市场机制：发标/收标/截止/授标；结算规则前置声明，声誉不得直接定胜负（S-3） | ✗ 未落表 |
| `board.js` | 看板列/WIP/泳道/老化；未配置即零机制，移动可要求合法迁移 | ✗ 未落表 |
| `budget.js` | 四类配额、预留、公平、告警阈值与越界动作；具名拒带当前值与上限 | ✗ 未落表 |
| `bus.js` | 钩子总线：能力声明、失败三态(open/closed/abort)+熔断、作用域与确定性排序、宿主瀑布桥 | H 资源与控制 / I 总线与扩展点 |
| `capacity.js` | 容量台账：席位/机时/设施/存储余量/候补/抢占（点名受害者）/预测 | ✗ 未落表 |
| `charter.js` | 章程：不可变条款、子机构权限不得超父、批准延迟、解散理由 | ✗ 未落表 |
| `citations.js` | 文献面：声明样式、必备字段、标识符优先级、无标识符默认拒 | ✗ 未落表 |
| `clockguard.js` | 注入时钟的单调守卫（N3）：回拨按 clamp/refuse/warn 处置并自曝；`observe()` 只观察 | ✗ 未落表 |
| `collab.js` | 跨机构协作：对手方登记、协议到期预警、数据共享模板、共同署名、结算周期与对账容差 | ✗ 未落表 |
| `compliance.js` | 研究合规：伦理审批/知情同意/数据保护/COI 申报/被试数据导出/审计留痕；出口管制归 domaingate（只引用） | ✗ 未落表 |
| `conference.js` | 跨会期会议组织：征稿/投稿/程序委员会/评审法定数/匿名/注册上限，分层在 meetings 之上 | ✗ 未落表 |
| `control.js` | 运行开关：可暂停范围与角色、看门狗间隔、idle 语义（默认 notice）、降级梯度 | ✗ 未落表 |
| `course.js` | 教学面（N13）：`vmu.teaching.*` 24 键，教学成果↔产物对齐，缺 outcome 具名拒 | ✗ 未落表 |
| `crypto.js` | 签名与不可否认；`signer` 是注入缝，无缝不伪造签名；四类可区分验签失败；密钥轮换留痕 | ✗ 未落表 |
| `custody.js` | 入库台账与保管链：链缺口默认阻断、冻融计数、销毁保留引用、不可逆化名映射 | ✗ 未落表 |
| `delegation.js` | 代理授权，机器强制 S-2（只能收窄）、到期、撤销级联 | ✗ 未落表 |
| `discipline.js` | 成员失败纪律：熔断窗与半开探针、停职上限、复职需人类、复盘强制 | ✗ 未落表 |
| `explain.js` | 解释报告构造器：必填理由、理由长度上限（超限拒而非截断）、事件关联、md/json 渲染 | ✗ 未落表 |
| `external.js` | N11 外部抓取适配：resolve→fetch→normalize→merge→receipt 五步（冻结）；`fetchFn` 注入缝，缓存过期三态 | G 形式化与计算（相关） |
| `fairness.js` | 守恒分配/单人上限/声誉不得当权重/可解释审计；截断与不可分配必须计数 | ✗ 未落表 |
| `formal.js` | 形式化面：`sorry` 默认拒、公理白名单、编译失败≠命题为假（`verdict:undecided`）、复现指纹 | G 形式化与计算（相关） |
| `funding.js` | 研究经费面：账户/预算行/报销/跨机构结算/审计包；引用 budget 不重定义 | ✗ 未落表 |
| `governance.js` | 治理最小切片：议程 + 动议；每键有安全缺省、只读面不改状态 | ✗ 未落表 |
| `grant.js` | **孤儿模块**：v5r `vibe_v5_grant` 的移植——临时/有界/单次授权（枚举命令、scope、过期、目标须在册） | ✗ 未落表 |
| `guard.js` | 已解析设置的**强制点**：写路径策略、路径逃逸/软链/超长、kill switch、exec 白名单、net 策略、内存上限 | H 资源与控制（相关） |
| `handover.js` | 交接包 + 上下文压缩包：必备字段点名补齐、压缩计数丢弃、打包前脱敏、未接受不算完成 | ✗ 未落表 |
| `human.js` | 人在环路：否决范围与理由、观察员可见面、审批等待（超时默认 hold 而非 allow）、总览范围 | ✗ 未落表 |
| `idempotency.js` | K6 幂等台账：请求指纹（类型标记规范化）、重复键异载荷具名拒、投影版本+校验和 | ✗ 未落表 |
| `identity.js` | 身份：主体绑定、可信 issuer、claim→slot 映射、多机构归属上限、化名场景、离场处置、读取审计 | ✗ 未落表 |
| `index.js` | **组合根**：装配 store/bus/prompt/registry/全部服务与工具面、注册公开名、控制状态机、`status()` 自曝 | H（控制状态机）/ I |
| `ip.js` | 知识产权：披露义务、公开暂缓、保密窗、在先技术检索、权属/转让/许可/收益分成；20 键=15 旋钮+5 服务面 | ✗ 未落表 |
| `lean.js` | P3 Lean 面：仅「退出 0 且产物哈希未变」才算 passed；归档三动词只引不复制 | G 形式化与计算 |
| `library.js` | 成果卡/分轨/内容指纹单点计算/头部列表（七键、不含正文）/按 id 展开（截断双计） | D 归档与记忆 |
| `library-policy.js` | 从 library.js 逐字抽出的 6 个纯策略检查器（文件大小的工程性拆分，不改行为） | D（library.js 的一部分） |
| `lifecycle.js` | 研究生生命周期 L1–L24：阶段/闸点结构校验，闸点判据**委托**给 domaingate/publication 缝 | ✗ 未落表 |
| `loader.js` | M2 代码模块装载：meta.apiVersion/capabilities 必填、钩子须已登记、冻结 api facade、装载失败隔离 | I 总线与扩展点 |
| `math.js` | 数学/形式化**能力适配**：包装共享模块 `../math-computation.js`，策略外置，`isRefutation` 恒 false | G 形式化与计算 |
| `mathjobs.js` | 数学作业与回执：spawn 注入缝、超时保留部分输出、回执六要素缺一具名拒、随机需种子 | G（相关） |
| `mathtools.js` | `vmu.math.*` 策略+守卫层：约 45 键改变可观测结果，其余在 `status().plannedKeys` 逐个点名 | G（相关） |
| `meeting.js` | 会议原语：轮次/举手/收束，轮次推进只被询问不隐式推进，拒答不算回答（I-2） | E 会议与表决 |
| `meetings.js` | `vmu.meetings.*` 47 键策略层：召集/议程/发言权/纪要；回执带 `enforced[]` | ✗ 未落表 |
| `members.js` | 角色**槽位**（D5：内核不提供角色）：编制/容量机器强制/唤醒信封经 deliver 缝/自述只追加 | A 会话与成员 |
| `memory.js` | 机构记忆：经验卡/反模式/事实/偏好；记忆永不授权、矛盾不静默、过期自曝、替换需理由 | ✗ 未落表 |
| `metrics.js` | 判断层计数面：指标目录、三态计数纪律（不静默丢弃/可解释/采样自曝） | ✗ 未落表 |
| `migration.js` | 版本/布局迁移编排：plan/dry-run/批次/确认/回退点/窗口；`GATE_SCENARIOS` 逐条点名 | ✗ 未落表 |
| `minutes.js` | 会议纪要/决议/行动项；拒绝具名、触界报丢弃数、不读真实时间 | ✗ 未落表 |
| `notify.js` | 通知：订阅/dedup/静默时段（只挡投递不挡记录）/摘要/投递；`deliver` 注入缝 | ✗ 未落表 |
| `pack.js` | 整合包装载：plan 纯函数、冲突不合并（O4）、卸载无残留、pack 码须 `VMU_PACK_<ID>_<REASON>` | I 总线与扩展点 |
| `paper.js` | **孤儿模块**：多成员稿件编排（分节认领、归属机器强制、定稿门禁） | ✗ 未落表 |
| `partnership.js` | 法人实体与税务字段槽（N9）：登记/账户绑定/invoice 槽校验/跨境闸；税务号只存不透明引用 | ✗ 未落表 |
| `projmigrate.js` | 内核自有持久文档（幂等投影/审计快照）的版本迁移；未知版本具名拒，失败不半迁移 | ✗ 未落表 |
| `prompt/index.js` | 提示词管线：段注册（名字/owner/scope/source）、四维绑定、覆盖与回滚、变量白名单、截断计数 | C 提示词管线 |
| `publication.js` | 发表：版本链不可断、投稿包、离线归档登记、可用性声明与徽章、复现结果（阴性一等公民） | ✗ 未落表 |
| `ratelimit.js` | 令牌桶：只用注入时钟、超限具名拒带 `retryAfterMs`、队列降级自曝、无配置即「unlimited」并说明 | ✗ 未落表 |
| `records.js` | `vmu.records.*` 记录轨旋钮面：触界具名拒、保留计数、永久标记不可删；回执带 `enforced[]`/`fired[]` | ✗ 未落表 |
| `recruit.js` | 招募/申请/评分/录用/试用/转正；S-1 内核不认识职位名（须显式映射 slot） | ✗ 未落表 |
| `registry.js` | 公开面：按服务版本化（`apiVersion`）+ 单一 `PACK_CONTRACT_VERSION`+别名层（不静默覆盖） | I 总线与扩展点 |
| `replay.js` | K5 审计只读重放：纯函数重建、缺口如实上报、绝不回写任何服务 | ✗ 未落表 |
| `repropack.js` | 复现包（L12）：必备成员具名、随机必带种子、差异定点、打包计数截断、数据默认只存指针 | ✗ 未落表 |
| `resource.js` | 共享资源面（22 卷 17 键）：校准有效期、受训人员、预约冲突、维护窗；借冲突点名冲突时段 | ✗ 未落表 |
| `retention.js` | 保留/回收：**默认只报告**、永久标记不可裁、配额三态、GC 需显式 `dryRun:false` | ✗ 未落表 |
| `reviewers.js` | 审稿市场（G1）：COI 回避、盲映射与解绑留痕、并发负载上限 | ✗ 未落表 |
| `rules.js` | M1 声明式中间件引擎：`on/when/then` 闭合白名单，表达式形状一律拒；编译结果即总线 handler | I 总线与扩展点 |
| `scheduler.js` | 定时触发：timer 是注入缝（缺则 tick-only）、`triggerVia` 默认 none（只报告不触发） | ✗ 未落表 |
| `script-bridge.js` | M3 脚本/工作流桥：spawn 注入缝、结果须结构化 JSON、非零退出是结果不是异常、脚本结果不进提示词 | G（相关） |
| `skills.js` | 技能声明：不得自我任命（需证据+他人背书）、过期必自曝降级、词表受控、截断计数 | ✗ 未落表 |
| `stateversion.js` | 状态版本/迁移（N4）：未知版本默认拒且不得当当前版本、迁移显式可审计、失败不留半态、幂等 | ✗ 未落表 |
| `store.js` | 耐久 Store 端口：fold 内函数式 patch、**键白名单**、原子写（tmp+rename）、单链序列化、版本迁移 | B 耐久与投影 |
| `storepolicy.js` | 仅存储**后端策略**（15 键）：后端/路径/锁/备份计数/远端/版本过高立场，不做任何 IO | ✗ 未落表 |
| `tasks.js` | 任务台账（依赖在**开始**时校验、开放数可机器封顶）+ 阶段机（默认无阶段） | F 任务与工作流 |
| `tenure.js` | 人事面：招聘周期/绩效证据/终身教职法定数/申诉/离场/轮换；与 members 分层 | ✗ 未落表 |
| `timevalue.js` | 实例→毫秒的**唯一**归一化器（task-231）：裸年份陷阱、数字必须当数字处理 | ✗ 未落表 |
| `topology.js` | 七种协作拓扑的路径约束：非法跳具名拒并给合法路径、describe/assert 共用一张规则表 | ✗ 未落表 |
| `transaction.js` | K1 跨服务补偿事务：无 `undo` 的步骤在 begin 即拒、失败逆序补偿、补偿需理由留痕 | ✗ 未落表 |
| `trust.js` | 可审计声誉：信号/衰减/解释/争议；S-3 声誉永不授权，权重无证据则降权并自曝 | ✗ 未落表 |
| `turn/index.js` | 轮次编排（docs/26）：assemble→deliver→parse→dispatch，投递经注入缝，解析三级别失败具名 | ✗ 未落表 |
| `work.js` | 在途台账（docs/07 §3）：start/settle/interrupt/recover，重启后仍存在即标记 interrupted | B 耐久与投影 |
| `workflow.js` | 声明式工作流：阶段白名单、迁移门、依赖、重试、检查点、升级、交接、模板、仲裁开关 | F（相关） |

**孤儿/未接入内核的模块（`kernel/index.js` 从不 import）**：`grant.js`、`paper.js`、`pack.js`（由 `vibe-math-vmu.js:335` 使用，不经内核）、`library-policy.js`（由 `library.js:20` 内部 import，属正常拆分）。→ `grant.js`/`paper.js` 是**死代码**；其中 `paper.js` 更严重，因为 docs/03 把它写成公开服务 `vmu.paper`（见第 2 节）。

---

## 2. 公开接口实际清单

### 2.1 服务名（`registry.register`，代码实测：**71 处调用 → 70 个唯一公开名**）

来源：`kernel/index.js:721-795` 逐行注册，外加 `kernel/index.js:1062`（`declareSlots()` 内重复注册一次 `vmu.members`）。唯一名 = 69 个 `vmu.*` + `math_computation`；无条件 65 + 条件 5 = 70。

无条件注册（65 个）：`vmu.tasks`、`vmu.prompt`、`vmu.turn`、`vmu.middleware`、`vmu.governance`、`vmu.board`、`vmu.minutes`、`vmu.budget`、`vmu.metrics`、`vmu.audit`、`vmu.partnership`、`vmu.reviewers`、`vmu.alerts`、`vmu.retention`、`vmu.delegation`、`vmu.workflow`、`vmu.trust`、`vmu.handover`、`vmu.arbitration`、`vmu.admission`、`vmu.topology`、`vmu.fairness`、`vmu.charter`、`vmu.repropack`、`vmu.memory`、`vmu.bidding`、`vmu.mathjobs`、`vmu.skills`、`vmu.publication`、`vmu.collab`、`vmu.identity`、`vmu.human`、`vmu.discipline`、`vmu.custody`、`vmu.explain`、`vmu.control`、`vmu.citations`、`vmu.formal`、`vmu.external`、`vmu.scheduler`、`vmu.crypto`、`vmu.notify`、`vmu.lifecycle`、`vmu.idempotency`、`vmu.replay`、`vmu.transaction`、`vmu.ratelimit`、`vmu.auditchain`、`vmu.stateversion`、`vmu.clockguard`、`vmu.mathtools`、`vmu.projmigrate`、`vmu.meetings`、`vmu.ballotbox`、`vmu.records`、`vmu.teaching`、`vmu.conference`、`vmu.resource`、`vmu.ip`、`vmu.funding`、`vmu.compliance`、`vmu.storepolicy`、`vmu.capacity`、`vmu.tenure`、`vmu.migration`。

条件注册（5）：`vmu.library`（`index.js:721`，需 root）、`vmu.members`（`:722`，需 slots 或 maxLiveMembers）、`vmu.store`（`:793`，需 root）、`vmu.work`（`:794`，需 workLedger）、`math_computation`（`:795`，需 host 缝，`kind:'tool'`）。

生成物核对：`docs/03` 的 `service-index` 生成块**70 行**（69 `vmu.*` + `math_computation`），与代码**双向一致**（本次实测：文档里没有代码不存在的服务；代码里没有文档缺的服务）。

内核对象上还有 3 个**弃用别名 getter**（不是注册名）：`kernel.recruit → admission`（`index.js:883-884`）、`kernel.course → teaching`（`:921-922`）、`kernel.hr → tenure`（`:931-932`）。

### 2.2 工具名（`host.js:70-118` 的 `TOOL_NAMES`，45 个）

`vibe_vmu_status`、`vibe_vmu_set`、`vibe_vmu_middleware`、`vibe_vmu_records`、`vibe_vmu_script`、`vibe_vmu_pack`、`vibe_vmu_control`、`vibe_vmu_meeting`、`vibe_vmu_task`、`vibe_vmu_minutes`、`vibe_vmu_board`、`vibe_vmu_budget`、`vibe_vmu_citations`、`vibe_vmu_discipline`、`vibe_vmu_governance`、`vibe_vmu_ratelimit`、`vibe_vmu_explain`、`vibe_vmu_projmigrate`、`vibe_vmu_bridge`、`vibe_vmu_external`、`vibe_vmu_mathtools`、`vibe_vmu_auditchain`、`vibe_vmu_notify`、`vibe_vmu_transaction`、`vibe_vmu_custody`、`vibe_vmu_topology`、`vibe_vmu_formal`、`vibe_vmu_collab`、`vibe_vmu_reviewers`、`vibe_vmu_clockguard`、`vibe_vmu_publication`、`vibe_vmu_fairness`、`vibe_vmu_handover`、`vibe_vmu_conference`、`vibe_vmu_arbitration`、`vibe_vmu_charter`、`vibe_vmu_recruit`、`vibe_vmu_capacity`、`vibe_vmu_retention`、`vibe_vmu_idempotency`、`vibe_vmu_audit`、`vibe_vmu_ip`、`vibe_vmu_bidding`、`vibe_vmu_admission`、`vibe_vmu_turn`。

**可达性（关键）**——经真实入口 `vibe-math-vmu.js:242 → host.js:581 → host.js:589` 能注册的只有 **10 个**：
`status`（恒在）、`set`（有声明键）、`middleware`（有条目）、`records`（有 root）、`script`（声明 scripts）、`pack`（声明 packs）、`control`（声明 `control:`）、`meeting`（声明 meetings/ballot）、`task`（声明 tasks 或非空 stages）、`turn`（声明 `turn:`）。
其余 **35 个工具名在真实入口下永远注册不了**（见第 3 节 §S3 与第 5 节 R1）。`docs/18` 的 `tool-index` 生成块有 45 行，与 `TOOL_NAMES` 一致；但该表**不校验可达性**，所以文档看起来 45 个都「在」。

### 2.3 钩子名（`kernel/bus.js`）

- `VU_HOOKS`（冻结的 vmu 内部钩子，**22 个**，`bus.js:44-53`）：`member/self-report`、`budget/warn`、`member/wake-before`、`member/wake-after`、`turn/reply-parsed`、`meeting/round-start`、`meeting/round-end`、`ballot/cast`、`ballot/tally`、`record/append-before`、`record/appended`、`task/assign`、`task/transition`、`prompt/section-assembled`、`budget/exceeded`、`pack/loading`、`pack/loaded`、`settle/before`、`settle/after`、`control/paused`、`control/resumed`、`control/heartbeat`。
- `DEFAULT_FAILURE`（`bus.js:63-83`）：22 个**全部**有默认策略（生成块实测「无默认策略的 0 个」）：`closed` ×14、`open` ×6、`abort` ×1（`budget/exceeded`）、外加 `member/self-report`/`budget/warn`/`control/*` 为 `open`。
- **实际生产者**（生成块，逐条 grep 实测）：`turn/reply-parsed`→`index.js`；`record/append-before`→`library.js`；`record/appended`→`compliance.js`/`handover.js`/`minutes.js`/`tenure.js`；`budget/exceeded`→`fairness.js`；`pack/loading`、`pack/loaded`→`pack.js`；`prompt/section-assembled`→`index.js`；`task/assign`→`members.js`/`tasks.js`；其余同表。⇒ **22 个钩子现在全部有生产者**。
- `BRIDGE_TOPICS`（`bus.js:60`）：`host/waterfall`（宿主瀑布桥的独立话题，不算 vmu 钩子）。
- 宿主侧可桥接钩子 `BRIDGED_HOOKS`（`host-hooks.js:27-32`，**14 个**）：`tools/pre-execute`、`tools/post-execute`、`tools/execute`、`tools/result`、`agent/pre-step`、`agent/turn-stopping`、`agent/created`、`subagent/start`、`subagent/end`、`session/event`、`system-prompt/assemble`、`prompt/assemble`、`settings/changed`、`fs/write-intent`。
- 未知名处理：vmu 命名空间未登记名**具名拒**（`bus.js:291-294`），宿主命名空间放行；新话题须 `declareTopic()`（`bus.js:250-296`）。

### 2.4 耐久键（真实清单）

- `kernel/store.js:32-44` `PUBLIC_KEYS`（**11 个**，白名单，写未声明键**抛异常**）：`settings.resolved`、`packs`、`middleware`、`members`、`tasks`、`meetings`、`ballots`、`records`、`budget`、`phase`、`work`。
- 实际写入者只有 2 个：`kernel/work.js:27 WORK_KEY='work'`（✓ 在白名单）、`kernel/idempotency.js:43 LEDGER_KEY='idempotency'`（**✗ 不在白名单**）。
  - 实测（`node --input-type=module`，临时 root，未改仓库）：`await store.patch('work',…)` → `ok`；`await store.patch('idempotency',…)` → **`VMU_INVALID_ARGUMENT: undeclared durable key: idempotency`**；`store.read('idempotency')` 同样抛。落盘 `keys` 只有那 11 个键。
- 文件布局：`<root>/vmu/state.json`（`store.js:73-74`，原子写 tmp+rename `:95-100`）；审计 `<root>/vmu/audit/<day>.jsonl` + `<root>/vmu/audit/checkpoint.json`（`index.js:340`、`:348`、`:358-374`）；库文件由 `library.js` 自管。
- 文档侧：`docs/03:225` 的「公开键（提案）」清单与 `store.js` 同（缺 `idempotency`）；`docs/03:216` 注 `settings.resolved.json` **未落盘**（与代码一致：只在 `status().settings.resolved`）。

### 2.5 错误码

代码里**没有**码表常量（无 `KNOWN_CODES`/`CODES` 导出）；**注册表是文档**：`docs/03 §8` 手写表 + `§8.1` 生成的状态表，由 `tests/audit-vmu-docs.test.mjs:141-180` 与 `tests/audit-code-status.test.mjs:128-138` 双向强制。

实测（正则 `\bVMU_[A-Z0-9_]+\b`，排除尾随下划线；代码= `vibe-math-vmu/**/*.js` 去 docs，文档= `vibe-math-vmu/docs/**/*.md`）：
- 代码出现 **402** 个唯一码；文档出现 **564** 个；文档有而代码无 **163** 个（绝大部分是 §8 里标「提案/未实现」的行，属设计意图而非错误）；**代码有而文档无 1 个**。
- **`VMU_PACK_INVALID`**（`kernel/pack.js:160`：声明的提示段名必须是 kebab-case）**未登记**在 docs/03 §8；它能溜过门禁是因为 `tests/audit-vmu-docs.test.mjs:171` 用 `code.startsWith('VMU_PACK_')` 整体豁免了 pack 前缀。→ 一个**框架**抛出的码借 pack 前缀逃过注册检查。
- 服务自己的码原样透传给工具面（`tools/*.js` 只寻址调用，不再造码）。

### 2.6 文档/代码不一致项（只列本次实测到的）

| # | 不一致 | 证据 |
|---|---|---|
| I1 | docs/02 §2 说「真实 `kernel/` ＝ 17 个 `.js`（含 prompt/index.js 共 18）」；实测 **84 个** | `docs/02-architecture.md:41` vs `kernel/**/*.js` 计数 84 |
| I2 | docs/02 §2 的 A–I 表只点名 17 个模块，**67 个模块未落任何分区** | `docs/02:29-39`；生成器自述「手写点名了 84 个里的 24 个」`scripts/generate-kernel-index.mjs:3` |
| I3 | docs/02 §2 的「未触发清单（6 个）」全部已过期：`turn/reply-parsed`、`record/append-before`、`record/appended`、`budget/exceeded`、`pack/loading`、`pack/loaded` **现在都有生产者** | `docs/02:59` vs `docs/05` 生成钩子索引（生产者列实测） |
| I4 | docs/02 §2 说 D 区（library）无钩子；实测 `library.js` 发射 `record/append-before` | `docs/02:50` vs 生成钩子索引 |
| I5 | docs/03 §2 服务表把 `vmu.paper` 写成已实现服务（「轮 135：多成员合著编排 ✓」）；代码**没有** `vmu.paper` 注册，`kernel/paper.js` 是孤儿 | `docs/03-interface-contract.md:75` vs `kernel/index.js` 70 个注册名 + 第 1 节孤儿清单 |
| I6 | `docs/03 §8` 代码清单里出现 `kernel/paper.js`、`kernel/grant.js` 等，如同它们已在运行路径上 | 文档 §8.1 生成表按「文件里有该码字符串」判定，孤儿模块也满足 |
| I7 | 大量注释说 `domaingate.js`（`kernel/compliance.js:3,13,62,69,134,287-304`、`kernel/lifecycle.js:4,15,40,185`、`kernel/timevalue.js:3`、`tests/vmu-domaingate.test.mjs:1`）；`kernel/domaingate.js` **不存在**，实体是 `extensions/domain-compliance/gate.js`（测试实际 import 的是后者，`tests/vmu-domaingate.test.mjs:2`） | `Test-Path kernel/domaingate.js` = False |
| I8 | docs/05 §5 标题写「20 个冻结名」（生成器注释已记录该漂移），实测 22 | `scripts/generate-surface-index.mjs:130` 自述 vs `bus.js:44-53` |
| I9 | `scripts/generate-surface-index.mjs:112` 自述「实测 73／73 个注册」；实测 **70** 个唯一注册名（71 处调用，重复 1） | 生成块 70 行 vs `kernel/index.js` |

---

## 3. 真实接线链（宿主 → host*.js → kernel/index.js → 服务/工具，逐步 `file:line`）

### S0 宿主装载入口
1. `vibe-math-vmu/agent.cordis.yml:205-206`：预置行 `- id: vibe-math-vmu` / `name: './vibe-math-vmu.js'`。**该行没有 `config:`** ⇒ 真机上 `apply(ctx, {})`，`settings = {}`、无 packs、无 scripts、无 modules、`declared = false`。
2. `vibe-math-vmu.js:44`：`export const inject = ['tools']`（唯一必需宿主服务；其余全部机会式）。
3. `vibe-math-vmu.js:61`：`apply(ctx, config = {})`；`:47-53` `readSettings()` 只收 `vmu.` 前缀键；`:63-64` 取 `config.root` / `config.clock`。

### S1 宿主能力缝
4. 子进程缝：`vibe-math-vmu.js:71-74`（`ctx.get` 存在即建）→ `host-spawn.js:60 createHostSpawn({ctx, defaultCwd, settings, root})`；纯探测 `host-spawn.js:50-55 hasHostSpawn`；调用时 `:75-77 ctx.get('subprocess')`；`：101-116 sub.resolveExecutable`；`:148-154 sub.spawn({argv,cwd,stdio,graceMs,env})`；`:178-194 handle.done 与超时竞速`。缺缝 ⇒ `:81-84 VMU_ENGINE_UNAVAILABLE`。
5. 数学宿主缝：`vibe-math-vmu.js:150-160`（**仅当** `config.math` 或任一 `vmu.math.*` 键被声明，且 `vmu.math.computation !== 'off'`）→ `host-math.js:55 createHostMath({ctx, settings, projectRoot, log})`；`:75-98 register()`（把共享模块的 `math_computation` 工具注册进宿主，`ctx.effect` 包裹 `:94`）；`:99-126 params()`（把 `vmu.math.*` 映射为共享模块参数，并校验 packages/installScope）；`:139-147 resolveExecutable`；`:149-153 spawn`（内部复用 `host-spawn.js:57` 的 seam）。
6. `vibe-math-vmu.js:222-225`：`createKernel({ sectionPolicy: V5R_DECIDE_SECTIONS, noticeBlock: V5R_INBOX_BLOCK, extraPhases: V5R_PHASES, settings: settingsWithPackDefaults, root, spawn: spawnSeam, host: mathHost, sections, bindings, overrides, whoMayOverride, readFile })`。
   **注意未传**：`deliver`、`signer`、`fetchFn`、`timer`、`secrets`、`slots`、`stages`、`tracks`、`middleware`。⇒ 这些缝在真实预置里恒为 `null`。

### S2 内核装配（`kernel/index.js`，行号为组合根内部顺序）
7. `:190 createKernel(...)`；`:241-260` 只读 live settings 代理（写入/删除具名拒）；`:265-266` `clockguard` + `guardedClock`；`:269 projmigrate`；`:270` `enabled = settings['vmu.core.enabled'] !== false`；`:314-324` 关闭即惰性返回；`:326-328 store = root ? createStore(...) : null`；`:332-334 workLedger`；`:340-374` 审计落盘（`<root>/vmu/audit/<day>.jsonl`）+ 防篡改锚 `checkpoint.json`；`:382-383` 日志等级；`:418-430 auditchain`（`hash` 用真 sha256，`macKey` 仅在有 `secrets` 时）；`:432-450 bus（entries = `settings['vmu.middleware.entries']`）`；`:452 prompt 管线`；`:454-468 library`；`:472-474 lean（需 spawn）`；`:478 resourceGate`；`:493-494 members`；`:496-505 tasks`；`:511-647` 42 个服务工厂；`:621-633 turn 编排`；`:654-674 mustStore/mustLibrary/mustMembers`；`:681-706 GUARD_FACES`；`:707 rules`；`:708-716 loader`；`:717 script-bridge`；`:718 registry`。
8. `:721-795` 注册 70 个公开名（第 2.1 节）；`:797-850` `kernel` 对象（getter 全部 live，因为 pack 可重新声明机构）；`:832-840 createMembersList`（无 slots 且 cap=0 ⇒ **null**）；`:843-849 mathSurface()`（惰性，缺 host 即 `VMU_ENGINE_UNAVAILABLE`）；`:943-963 ballot()/meeting() 工厂 + live 实例表（cap 50、逐出计数）`；`:975-992 start()`（读声明条目 → `bus.add`）；`:1009-1011` 三个 guard 面；`:1017-1043 usePack`；`:1048-1066 declareSlots`；`:1069-1088 declareTracks`；`:1141-1186 setSettingsValue`；`:1192-1210 unsetSettingsValue`；`:1218-1246 pause/resume/beat/control`；`:1257-1354 status()`。

### S3 宿主 → 工具面（**断链就在这里**）
9. `vibe-math-vmu.js:242-253`：`createHostAdapter(Object.assign({ ctx, kernel, settings, instance, scripts, packLoader, controlTool: config.control !== undefined, turnTool: config.turn !== undefined, meetingTool: config.meetings!==undefined || config.ballot!==undefined, taskTool: config.tasks!==undefined || 非空 stages }, declared ? { assertDeclared } : {}))`。**只传了 4 个 `*Tool` 开关。**
10. `host.js:581`：`createHostAdapter({ ctx, kernel, settings, assertDeclared, defineTool, log, instance, scripts, packLoader, controlTool, meetingTool, taskTool, turnTool })` —— 解构表里**只有 4 个开关**，其余 35 个开关既没被接收也没被转发。
11. `host.js:589`：`specs()` → `toolSpecs({ kernel, settings, assertDeclared, log, instance, scripts, packLoader, controlTool, meetingTool, taskTool, turnTool })` —— 另外 35 个 flag 在 `toolSpecs` 里**永远取默认 false**。
12. `host.js:190 toolSpecs(...)`：`status` 恒 push（`:206`）、`set` 需 `assertDeclared`（`:220`）、`middleware` 需条目（`:284`）、`records` 需 library（`:343`）、`script` 需 scripts（`:369`）、`pack` 需 packLoader（`:426`）；`:492-533` 的 39 个 `make*Spec` 全部由各自 flag 把关（`if (transactionTool) … if (admissionTool) …`）。
13. `host.js:547-556 toHostParameters`（provider 要求 object schema）、`:559-574 toHostSpec`（`execute` 返回 JSON 字符串 + `output.render` 返回 content-part 数组）、`:626-649` 注册循环：`ctx.effect(() => ctx.tools.register(hostSpec), 'vmu:tool:'+name)`，单个失败记入 `failures` 不中断。
14. `vibe-math-vmu.js:254` `kernel.start()`；`:257-263 kernel.math()`（注册 `math_computation`）；`:266-267 kernel.store.open()`；`:272-279 kernel.work.recover()`。

**结论（R1）**：真实入口下 <br>· `vibe_vmu_status` 恒在（因为 `settings={}` 且可注册 = 零机制承诺成立）；<br>· 声明了 `control/turn/meetings/tasks/records/scripts/packs/设置键` 时，最多再出现 9 个工具；<br>· `minutes/board/budget/citations/discipline/governance/ratelimit/explain/projmigrate/bridge/external/mathtools/auditchain/notify/transaction/custody/topology/formal/collab/reviewers/clockguard/publication/fairness/handover/conference/arbitration/charter/recruit/capacity/retention/idempotency/audit/ip/bidding/admission` 这 **35 个面无论配置怎么写都注册不了**（`tools/*.js` 里的 39 个 spec 工厂因此成为真机死代码，只在单测里被直接调用：`tests/vmu-*-tool.test.mjs`、`tests/vmu-tools-await-rejections.test.mjs:61-95`）。

### S4 钩子桥（宿主事件 → 总线）
15. `vibe-math-vmu.js:291 attachHostHooks({ctx, kernel, settings})`；`:294-304` 只在 `plan().count > 0` 时 `effect(() => hooks.attach(), 'vmu:hooks')`。
16. `host-hooks.js:89-111 declaredHooks()`：声明条目里落在 `BRIDGED_HOOKS` 的名字 ∪ `kernel.bus.status().entries`（**现实优先于声明**）∪ 当 `vmu.limits.toolCallsPerTurnCap > 0` 时强制加 `tools/pre-execute` + `agent/turn-stopping`。
17. `host-hooks.js:117-186 attach()`：`ctx.effect(() => ctx.on(hook, listener), 'vmu:hook:'+hook)`（`:179-182`）；listener 内 `:152 kernel.bus.emit(hook, payload, { bridge: true })`（宿主词汇走 bridge 豁免）；`:135-144` 预算强制（超限返回 `{kind:'deny'}`）；`:161-175` 决策映射（`deny→deny`、`cancel→cancel`、`ask→ask`、`rewriteArgs` 在 pre-execute **拒并具名**）。
18. `kernel/bus.js:250-296`：`declareTopic()` 与名字校验（vmu 命名空间未登记名具名拒）。

### S5 提示词 / pack / M2 模块
19. `vibe-math-vmu.js:322-330`：有 `effectivePrompts` 且 `ctx.systemPrompt.section` 可用时，`effect(() => ctx.systemPrompt.section({name:'vmu', order, text}))`。装配来源：`config.prompt/promptSections`（`:84-100`）⊕ `vmu.prompts.resourceSection=true` 时追加 resources 段（`:105-119`）⊕ `vmu.prompts.overridesDir` 文件覆盖（`:120-128`）⊕ pack 的 `prompts/sections.json`（`:177-204`）。
20. `vibe-math-vmu.js:335 createPackLoader({kernel, registry: kernel.registry})`；`:340-451` 装载声明的 packs（文件夹 `packs/<id>/index.js` 优先、缺则 `packs/<id>.js`、都没有但有数据即视为 data-only 生效 `:392-407`），`:417-427` pack 的 **late section/binding 注册**（ROUND 383），`:410 packLoader.apply(manifest)`；失败进 `packErrors` 并写 stderr（`:429-433`）；装载后 `adapter.install()`（`:437`）与 `hooks.refresh()`（`:442`）。
21. `vibe-math-vmu.js:460-496`：M2 模块经 `kernel.loader.toBusEntries(specs, {importModule})`（`:473`）→ `kernel.bus.add(e)`（`:476`），同样重装工具与重桥钩子。
22. 包的设置缺省在**内核构造前**折算：`vibe-math-vmu.js:205-221`（`settingsWithPackDefaults = Object.assign({}, packDefaults, settings)`，用户设置优先）。

### S6 缺缝的真实后果（逐一有据）
23. `kernel/index.js:1329-1341 status().seams` 是**构造事实**：真实入口下 `deliver=false`、`signer=false`、`fetchFn=false`、`timer=false`、`secrets=false`（`vibe-math-vmu.js:222-225` 从不注入）。
    - ⇒ `members.wake()`、`meeting` 的投递、`notify.emit()` 在真机**具名拒**而不是静默；`seamReceipts.deliver` 恒空。
24. **轮次编排永远投递不了**：`kernel/index.js:627` `deliver: host && typeof host.deliverTurn === 'function' ? host.deliverTurn : null`；而 `host` 是 `host-math.js:55` 的返回值（`register/params/projectRoot/designTime…`，**没有 `deliverTurn`**）；全仓 `deliverTurn` 只出现在 `kernel/turn/index.js:293`（内部本地函数）与 `:555`（该模块自己的导出）、`kernel/index.js:627`、`tests/vmu-turn.test.mjs:160`（测试假宿主）。⇒ `turn/index.js:293-301` 的缺缝分支 `fail('VMU_ENGINE_UNAVAILABLE', …)` 必然命中，`vibe_vmu_turn` 的 `step`/`drive` 在真机必然 `ok:false`。
25. **幂等台账永远不耐久**：`kernel/index.js:588 createIdempotency({..., store})` → `kernel/idempotency.js:312 store.patch('idempotency', …)`（`LEDGER_KEY`，`:43`）→ `kernel/store.js:88-93 assertKey` 抛 `VMU_INVALID_ARGUMENT: undeclared durable key: idempotency`（实测见 2.4）；`persist()` 捕获后 `durableDegraded=true`（`:329-337`），`load()` 同样失败（`:352-360`），`isDurable()` 恒 false（`:340`）。测试用的是**假 store**（`tests/vmu-idempotency.test.mjs:367-368` 直接读写 `st.disk`），所以该缺陷对门禁不可见。

---

## 4. 生成器门禁现状（4 个都跑成「检查模式」，仓库零改动）

**运行方式与安全性**：四个脚本默认都是 check（只有 `--write` 才落盘），本次全部以默认模式运行，随后 `git -C Vibe-Mathematics status --porcelain` 输出为空（实测）。
- `scripts/generate-kernel-index.mjs:58-62`：`const check = !process.argv.includes('--write')`；check 时只比文本，不通过则 `exit 1`。
- `scripts/generate-surface-index.mjs:207-226`：同上；6 个生成块任一缺失/过期即 `exit 1`。
- `scripts/generate-wired-schema.mjs:339-354`：`--write` 才 `writeFileSync(SCHEMA)`；check 漂移只 `process.exitCode = 1`。
- `scripts/generate-wiring-index.mjs:279-347`：`--write` 才 `writeFileSync(README_FILE)`；默认过期即 `exit 1`。

| 生成器 | 生成物 | 本次实测结果 | 与代码是否一致 |
|---|---|---|---|
| `generate-kernel-index.mjs` | `docs/02` 的 `BEGIN/END GENERATED: kernel-index` 块 | `kernel-index: docs/02 matches the kernel (82 modules, 0 headerless)`，exit 0 | **一致**，但**只覆盖 82 个**（见 R4） |
| `generate-surface-index.mjs` | `docs/03` 服务索引、`docs/05` 钩子索引/段字段/能力词表、`docs/18` 工具索引、`docs/04` 设置家族索引 | 6 行全部 `current`，exit 0 | **一致**（服务 70、钩子 22、工具 45、设置 1,038 键 / 105 家族） |
| `generate-wired-schema.mjs` | `settings/schema.js` 内 `// WIRED-SCHEMA:BEGIN…END` 块 | `TOTAL keys=337 recovered=331 missing=6 service-surfaces-skipped=5`；`schema already in sync (1421 -> 1421 lines)`；`INVARIANTS ok: 337 emitted, 701 pre-existing, 5 service surfaces, 6 with an honest null default`，exit 0 | **一致** |
| `generate-wiring-index.mjs` | 仓根 `README.md` 的 WIRING-INDEX 块 | `29 volumes · planned=114 · wired=1030/1152 · proposed codes=276`；`up to date`，exit 0 | **一致** |

补充证据：
- 4 个生成器都有测试守护：`tests/audit-surface-index.test.mjs:32`、`tests/audit-kernel-index.test.mjs`（kernel-index 语句自述，`scripts/generate-kernel-index.mjs:49`）、`tests/vmu-wiring-index.test.mjs:31`、`tests/audit-vmu-docs.test.mjs`/`tests/audit-code-status.test.mjs`。
- **未跑的生成器**（不属本节 4 个，但同在 `scripts/`，改动内核时会被门禁牵连）：`generate-planned-settings.mjs`、`generate-planned-codes.mjs`、`generate-vmu-settings-table.mjs`、`generate-seam-table.mjs`、`generate-glossary-table.mjs`、`generate-zero-mechanism-matrix.mjs`、`generate-pack-prompts.mjs`、`generate-pack-persona.mjs`、`generate-readiness-figures.mjs`、`regen-all.mjs`、`release-check.mjs`、`update-doc-counts.mjs`。

---

## 5. 风险与空白（按严重度排序，全部有 `file:line`）

**R1（最高 · 功能面）真实入口下 45 个工具只有 10 个可注册，35 个面永久不可达。**
`vibe-math-vmu.js:242-253` 只传 4 个 `*Tool`；`host.js:581` 解构表只有那 4 个；`host.js:589` 调用 `toolSpecs` 时也只转这 4 个 ⇒ `host.js:492-533` 的 35 个 `if (xxxTool)` 恒 false。
影响：`tools/*.js`（39 个文件 / 1,370 行）与其单测构成一个**只在测试里存在**的工具面；docs/03 §3.1、docs/18 描述的这些面在真机上不可调用。
（不改代码，仅记录；修法方向：把 35 个开关一并透传 + 在 `vibe-math-vmu.js` 里按声明/存在性计算它们。）

**R2（高 · 数据完整性）K6 幂等台账在真机上永不耐久。**
`kernel/idempotency.js:43 LEDGER_KEY='idempotency'` vs `kernel/store.js:32-44 PUBLIC_KEYS`（无该键）；`kernel/store.js:88-93` 抛 `VMU_INVALID_ARGUMENT`。实测已复现（第 2.4 节）。测试用假 store（`tests/vmu-idempotency.test.mjs:367`）⇒ 门禁不可见。同时 `docs/03:225` 的公开键清单也不含它（文档与代码在这个缺陷上「一致地错」）。

**R3（高 · 真机不可用）轮次编排（docs/26）的投递缝无任何生产者。**
`kernel/index.js:627` 要 `host.deliverTurn`，而 `host` 是 `host-math.js` 的对象（无此方法）；全仓仅测试提供（`tests/vmu-turn.test.mjs:160`）。`kernel/turn/index.js:293-301` 缺缝即 `VMU_ENGINE_UNAVAILABLE`。⇒ `vibe_vmu_turn` 的 `step`/`drive` 必然失败，「让只装框架的宿主跑一轮」这个核心目标实际未达成。

**R4（中 · 门禁盲区）模块索引生成器只扫顶层目录。**
`scripts/generate-kernel-index.mjs:32` `readdirSync(KERNEL).filter(...)` 非递归 ⇒ 生成 82 个模块，**`kernel/prompt/index.js` 与 `kernel/turn/index.js` 两个子目录模块永远不进索引**（实测 `82 modules` vs 目录内 84 个 `.js`）。而 docs/02:41 与生成块又都被当作「与目录逐个一致」的证据。

**R5（中 · 门禁盲区）孤儿模块与「文档承认的服务」脱节。**
`kernel/grant.js`、`kernel/paper.js` 不被任何生产路径 import（第 1 节孤儿清单）；`docs/03:75` 仍把 `vmu.paper` 写成已实现服务、§8.1 生成表按「文件里有码字符串」把它们列为已实现（`tests/audit-vmu-docs.test.mjs:165-168`）。⇒ 门禁测的是「文件里有字符串」，不是「在生产路径上」。

**R6（中 · 文档过期）docs/02 §2 的分区表与钩子表已经落后一整代。**
`docs/02:29-39`（17 个模块、缺 67 个）、`:41`（17=84）、`:43-59`（6 个钩子的「未触发清单」现已全部有生产者、D 区钩子判断也错）。而 §4 的生成器只重写了 §2.5 的「内核模块索引」块，**A–I 表与钩子域表没有生成器守护** ⇒ 下次仍会漂。

**R7（中 · 门禁盲区）一个框架码借 pack 前缀逃过 §8 注册检查。**
`kernel/pack.js:160` 抛 `VMU_PACK_INVALID`；未登记在 docs/03 §8；豁免逻辑在 `tests/audit-vmu-docs.test.mjs:171`（`code.startsWith('VMU_PACK_')`）。⇒ 「每个框架码都必须在 §8」这条承诺对 `VMU_PACK_*` 形状的自造码不成立。

**R8（低-中 · 缝管理）真实入口从不注入 `deliver/signer/fetchFn/timer/secrets`，且只在 `status()` 里被动自曝。**
`vibe-math-vmu.js:222-225`（未传）→ `kernel/index.js:1329-1341`（`status().seams` 全 false）。`members.wake()`/`meeting` 投递/`notify.emit()`/`crypto.sign()`/`external.fetchOne()`/`scheduler.arm()` 在真机全部具名拒。零机制承诺成立，但「框架装着却永远发不出一次唤醒」是交接时必须知道的事实。

**R9（低-中 · 预设默认）`agent.cordis.yml` 的 vmu 行没有 `config:`。**
`agent.cordis.yml:205-206` ⇒ `settings={}`、`declared=false`、无 pack ⇒ 默认会话只有 `vibe_vmu_status`。v5r 机构能力（`packs/v5r`）必须靠 profile 的 `cordis.patch.yml` 才生效；交接文档若只读 `preset.yml`/`agent.cordis.yml` 会误以为「装上就有机构」。

**R10（低 · 代码卫生）注释指向不存在的模块。**
`kernel/compliance.js:3,13,62,69,134,287-304`、`kernel/lifecycle.js:4,15,40,185`、`kernel/timevalue.js:3`、`tests/vmu-domaingate.test.mjs:1` 都写 `kernel/domaingate.js`；实体是 `extensions/domain-compliance/gate.js`（`tests/vmu-domaingate.test.mjs:2` 才是真实 import）。交接阅读者会被引到空路径。

**R11（低 · 规模）`settings/schema.js` 是 201KB 单文件 + 1,038 个键。**
生成器（`generate-wired-schema.mjs:26` 直接写回 `settings/schema.js`）把「模块真实读取的 337 个键」注入同一个文件；`planned.js` 另有 114 键。任何设置改动都要同时过 `generate-wired-schema` 与 `generate-planned-settings` 两道生成器，交接顺序必须写清（先 `--write` 谁、再谁）。

---

## 附：本次未做（属其他两位队友或后续轮次）
- 未跑测试套件（313 个 `.mjs`，其中 `audit-*` 门禁约数十个）——属「验证·门禁·真机面」。
- 未做中间件/pack/提示词文本链路的行为级验证——属「中间件·pack·提示词面」。
- 未对 1,038 个设置键做逐键 wired/planned 复核（只核对了生成器自报的 337/1,030/114 三个数与代码一致）。
- 本文件只陈述事实，不含任何代码修改建议的落地；需要的改动全部留在上面 R1–R11。
