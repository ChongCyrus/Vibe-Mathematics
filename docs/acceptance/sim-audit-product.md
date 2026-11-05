# R240-E · 产品级只读审计：vmu 作为框架、vmu+v5r 作为「多智能体数学研究机制」

> 审计对象：本仓工作副本（main，HEAD `a1a795bb`）。只读：本文件是唯一写入，未改任何产品码 / 测试 / 其它文档，未 commit。
> 方法：源码通读 + 定位式 grep + 三个只读审计脚本（`scripts/generate-wired-schema.mjs`、`scripts/check-docs.mjs`、`docs/18` 与本仓 `host.js` 工具表对账）。每条都给出 `file:line`，可复现；"建议"允许破坏性重构。
> 规模基线（用于判断可维护性）：`vibe-math-vmu/kernel/` 约 60 625 行 / 约 90 个模块，`kernel/turn/index.js` 单文件近 5 000 行；`packs/v5r/` 12 383 行、`tools.js` 6 635 行 / 48 个 `vibe_v5_*` 工具；`settings/schema.js` 1 168 个设置键、1 922 行；`docs/` 372 个文件 / 4.7 MB；`tests/` 753 个测试文件。
>
> **一句话结论**：vmu 是一个**工程质量很高（文档即门禁、具名错误、可回放、可恢复）但"框架化只完成了一半"的框架**；vmu+v5r 是一个**组织流程仿真器 + 社会性裁决机制**，它**没有任何环节在数学上检查"证明对不对"**——唯一机器可检的 Lean 是可选外部 seam，其余"验证"= 投票一致 / 字符串引用 / 结构门。产品化上，安装面与默认值会让新用户"装完了却看不见东西"，且 README 仍在讲四代旧 preset。

---

## 0. 最严重 5 条（先看这里）

| # | 一句话 | 证据 |
|---|---|---|
| S1 | **"验证"不检查证明正确性**：`verified.js` 自认"cannot claim to have judged the proof"，p=1 的路由里只有 Lean 是机器可检且需外部 spawn seam；其余是全体一致投票或文献字符串 | `vibe-math-vmu/packs/v5r/verified.js:50-54`、`vibe-math-vmu/packs/v5r/verification-gates.js:95-98`、`vibe-math-vmu/kernel/index.js:1146-1155` |
| S2 | **新增一个 pack 仍要改内核/框架入口**：入口静态 import v5r 的策略模块并硬编码 `v5r` 注册表；回执字段表写死 25 个字段且 `resolveOwners` 只能覆盖既有字段 | `vibe-math-vmu/vibe-math-vmu.js:20-22`、`:526`；`vibe-math-vmu/kernel/turn/index.js:108-146`、`:1203-1215` |
| S3 | **预算不可执行**：`tokens` 是预算种类且设置标"已接线"，但全仓没有调用方传非零 token；模型成本不可观测/不可强制 | `vibe-math-vmu/kernel/budget.js:15`、`vibe-math-vmu/kernel/delegation.js:412`、`vibe-math-vmu/settings/schema.js:856`、`vibe-math-vmu/docs/04-settings.md:893` |
| S4 | **README/安装面无产品真相**：README 说选择器出现"四个" preset，`installer.js` 实际只发 `vibe-math-vmu` 一个；新用户装完只看到 1 个工具（惰性默认），且工具注册形状写错会**静默不出现** | `README.md:19`、`installer.js:53-56`、`vibe-math-vmu/host.js:63-85` |
| S5 | **状态写入有静默丢更新窗口**：文件锁有界且"best effort"，拿不到锁就无锁继续写；写前无 stamp/version 冲突检测，后写者覆盖前写者的另一个键且不报错 | `vibe-math-vmu/kernel/store.js:252-270`、`:331-395`、`:171-173` |

---

## A. 框架可定义性与扩展性（哪些 v5r 专属物写死在内核/宿主；新增一个 pack 要改几处）

**A1（致命）框架入口静态 import v5r，注册表硬编码 `v5r`。**
`vibe-math-vmu/vibe-math-vmu.js:20-22` 直接 `import { decideSections as V5R_DECIDE_SECTIONS } from './packs/v5r/middleware/prompt-switches.js'`、`import { inboxBlock as V5R_INBOX_BLOCK } from './packs/v5r/notices.js'`、`import ... from './packs/v5r/index.js'`，`:526` 用这三个对象拼硬编码注册表 `v5r: { id:'v5r', sectionPolicy, noticeBlock, phases }`。
**为什么不利于目标**：pack 的"可插拔"只在文件层面成立；换一个机构/pack，要么改框架入口源码，要么复制入口。manifest 里其实已有 `promptPolicies`/`phases` 字段（`vibe-math-vmu/kernel/pack.js:109-268`），但 sectionPolicy/noticeBlock/phases 这三类"真正决定帧形状"的东西没有进 manifest，导致入口必须认识 v5r。
**建议**：把 `sectionPolicy`（已可经 `promptPolicies` 中间件表达）、`noticeBlock`、`phases` 提升为 manifest 一等字段；入口改为遍历 `config.packs`（或 loader 的 `plan/apply` 结果）动态注册，删除静态 import；在 `packs/v5r/index.js` 里补声明。

**A2（致命）回执字段表写死内核，pack 无法新增回执字段。**
`vibe-math-vmu/kernel/turn/index.js:108-146` 的 `FIELD_OWNERS` 列了 25 个字段（say/progress/record/propose_verify/verdict/task_create/task_update/proposal/motion/formal/lean_archive/lean_run/meeting_hand/meeting_invite/input/propose_meeting/convene_meeting/task_claim/task_done/assign/nudge/reject_assign…），每字段绑 `{face, op}`；`resolveOwners(bindings)`（`:1203-1215`）只"逐字段覆盖 face/op"——**字段集合本身不可扩展**。派发循环里还有字段特例（say 的 `no-meeting-bound`、progress 强转、record 形状、vote_solved 等，`:2947-3087`）。
**为什么不利于目标**：回执是成员与框架之间**唯一的交互协议**。新 pack 的第一件事往往就是"我要一个自己的回执字段"（本仓 v5r 之外还有 v3/example-data）——这要求改内核。框架的扩展点没落在协议上。
**建议**：manifest 增 `replyFields: [{field, face, op, shape, textCoercion}]`；内核只保留"字段→(face,op) 的通用校验与派发"，把字段清单从 pack 的 manifest 合并（冲突即 `VMU_PACK_CONFLICT`）；`FIELD_OWNERS` 退化为"内核保底字段"。

**A3（严重）pack 的自有设置必须先写进框架 schema 才生效。**
`vibe-math-vmu/settings/schema.js:1574` `assertDeclared`（未声明键抛 `VMU_INVALID_ARGUMENT`）；`vibe-math-vmu/kernel/index.js:4513` `applyPackSettings` 经 `resolveSettings(..., {onInvalid:'reject'})`。即：pack 可以声明 settings（manifest `settings`），但**真正生效前必须在框架的 schema 文件里登记**。现状是 1 168 个键全堆在同一个 `settings/schema.js`，v3 与 v5r 的私有键（如 `settings/schema.js:85-99` 的 `vmu.v3.*`）都在里面。
**为什么不利于目标**：装一个第三方 pack 要改框架文件，升级框架又会覆盖它——扩展成本与"分享 pack"直接冲突。
**建议**：设置改为"框架命名空间 + pack 命名空间"两段注册：框架 schema 只声明框架键；pack settings 由 loader 从 manifest 的 `settings` 声明生成并经 `SETTING_LAYERS['pack']` 进入，权限校验只查"命名空间属主"；把 v3/v5r 的键迁回各自 pack 的 `settings/defaults.js`（导出结构已存在）。

**A4（严重）框架默认值携带 v5r 机构政策。**
`vibe-math-vmu/settings/schema.js:71` `vmu.records.tracks` 默认就是 v5r 的研究轨 `['progress','routes','obstacles','rejected','state']`；`:81` `vmu.records.requireSettledRecords` 默认 `true`，doc 自述"v5r 机制；由包携带默认 true"，但 **def 就是 true**。`settings/schema.js` 里 `vmu.v3.*` 行用 `★ capability-default` 注释说明"不是框架政策"，但这只是注释、无机制强制。
**为什么不利于目标**：新 pack 什么都不声明就继承了 v5r 的轨词表与"必须 settled 才能记录"政策；框架默认值即机构政策，等于"默认 v5r"。
**建议**：框架默认改为空/中性（tracks 默认 `[]`，requireSettledRecords 默认 false 并由 v5r pack 声明 true）；把 `capability-default` 从注释升级为 schema 字段（`owner:'pack:v5r'`），由 `assertDeclared` 在包未装载时拒绝该键生效。

**A5（严重）内核携带数学/研究子系统，且有一个 dead 面。**
`vibe-math-vmu/kernel/index.js:1279 createReviewers`、`:1315 createPublication`、`:1379 createCitations`、`:1380 createFormal` 无条件创建；另有 `kernel/lean.js`（1 252 行）、`kernel/mathtools.js`（961 行）、`latex.js`、`mathjobs.js`、`mathcomputation/`、`math-engines.js`。更糟：`kernel/paper.js:111 export function createPaper` 在 `kernel/index.js` 里**没有被 import**（全仓无 `from './paper.js'` 命中），而 pack 有自己的 `packs/v5r/paper.js`（`packs/v5r/tools.js:23, p.5495` 使用 `createPaperSubsystem`）——内核 `paper.js` 疑似未接线的重复面。
**为什么不利于目标**：框架声称"通用多智能体机制"，但内核 1/3 的代码是"研究机构/数学"专属。一个软件团队 pack 要背着 Lean/LaTeX/paper/publication 的语义与设置默认值；而"未接线的重复面"正是本仓自己 `scripts/audit-readers.mjs` A 类缺陷（内部机制无读者）。
**建议**：把 `reviewers/publication/citations/formal/lean/latex/mathtools/mathjobs/mathcomputation/paper` 迁到 `packs/research-core/`（manifest 声明 services/tools）；内核只留 records/tasks/meetings/ballot/workflow/mailbox/panel 等通用面；删除或接线 `kernel/paper.js`（二选一，按 audit-readers A 类纪律具名）。

**A6（严重）可定义性的真实成本：新增一个 pack 要改 4~6 处。**
- `settings/schema.js`（A3，1 168 键单文件）+ 生成物（`docs/04-settings.md`、`settings/planned.js`）；
- `vibe-math-vmu.js` 的 import 与注册表（A1）；
- `kernel/turn/index.js` 的 `FIELD_OWNERS`（A2，若需新回执字段）；
- `installer.js:53` `PRESETS`/`files` 清单（发货面，约 200 个受管文件）；
- `docs/27-pack-folder.md` §6 的"两处名册"：文档明说"新增/删除整合包文件时必须同时改"两张表（`docs/27-pack-folder.md:127-136`），且 §6.5 具名"seam 表不覆盖 ballot 族"的已知视野外（`:203`）。
**为什么不利于目标**：pack 作者要同时理解内核语义 + 两套名册 + 生成器；这不是"可定义性"，是"可复制一个 v5r"。
**建议**：把上述 4 处收敛为 1 处（manifest + 一个 loader 注册入口）；名册改为"loader 扫描目录"，`docs/27` 的清单表由生成器产出；`installer` 改为打包目录而非手写文件列表。

**A7（中）框架自述与代码不一致。**
`vibe-math-vmu/kernel/index.js:16` 注释自称"a file names a role, a stage, a paper or a policy — those arrive as settings values or pack content"，与 A5 的内置研究面直接矛盾。
**为什么不利于目标**：新贡献者按注释理解架构会做错决定。
**建议**：先落 A5 的搬迁，再让这条注释成为事实；否则改注释承认"kernel 内置 research 面"。

**A8（中）扩展文档面向"复制 v5r"，不是"写新 pack"。**
`docs/27-pack-folder.md` 描述的是"框架 + 整合包文件夹"的搬迁历史与名册纪律；`docs/10-packs.md`、`docs/29-build-your-own-preset.md` 存在，但 A1-A3 的硬编码没被文档点名为"你必须改的框架文件"。
**建议**：补一页"最小 pack 教程"：只写 manifest + 一个 tools 模块 + 一个 prompt 段，验证在零内核改动下能跑（把 A1-A3 修掉后可实现）。

---

## B. 基础设施完备性（持久化 / 并发锁 / 时钟 / 回放 / 取消 / 重试 / 身份 / 配额 / 错误 / 版本 / 导出导入 / 测试装置）

| # | 能力 | 判定 | 证据与缺口 |
|---|---|---|---|
| B1 | 持久化 | ✅ 强 | `kernel/store.js`：patch 内 fold、`PUBLIC_KEYS` 白名单、tmp+rename 原子写、单 promise 链串行、跨内核文件戳重读；`STATE_VERSION=1` + `kernel/migration.js` |
| B2 | 并发锁 | ⚠️ 有但非冲突检测 | `kernel/store.js:252-270` `withFileLock`，"Best effort and bounded"（`lockRetries=40, lockBackoffMs=25, lockTimeoutMs=2000`，`:171-173`）；拿不到锁 `stats.lockSkips += 1; return fn()` **无锁继续写**。`mutate`（`:331-395`）只在 rename 瞬态码上重试/重读，**写前不比对 stamp/version** ⇒ 两个 kernel 交错时后写者静默覆盖前写者另一个键 |
| B3 | 时钟 | ✅ | 全局注入 `clock`；`kernel/clockguard.js`、`kernel/stateversion.js` 防倒退 |
| B4 | 可观测/回放 | ✅ 单进程强 / ⚠️ 跨进程弱 | `kernel/bus.js`（进程内总线、三态失败 open/closed/abort、熔断、审计、确定性排序）、`kernel/audit.js`、`auditchain.js`、`activity.js`、`metrics.js`、`replay.js`（只读重建、gaps 具名、零副作用）、`receiptbounds.js`。但 bus 是**进程内**：子代理各自挂 kernel（`kernel/store.js:15-21` 注释实测 run13 四成员子会话读不到 roster/records），跨进程只有共享文件 + 重读，无跨进程事件流 |
| B5 | 中间件钩子 | ⚠️ 部分纸面 | `vibe-math-vmu/docs/18-command-and-protocol-reference.md:293-297`：`prompt/assemble` **不在冻结钩子集** ⇒ 中间件无法介入提示词装配；`budget/exceeded`、`pack/loading|loaded`、`record/*`、`turn/reply-parsed` **有冻结名无生产者** |
| B6 | 取消/超时 | ⚠️ 软 | 回合交付 deadline：`vmu.turn.deliveryTimeoutMs` def 180000（`settings/schema.js:190`），超时 `VMU_TURN_DELIVERY_TIMEOUT` 释放串行队列（`kernel/turn/index.js:3619,3947`）。但中断是**协作式**：`kernel/turn/index.js:1200` 注释"target may stop at its next observation point; unclaimed work and descendants survive" ⇒ 无法硬杀正在跑的模型调用，会议可能一直等 |
| B7 | 预算/配额 | ⚠️ 面多/可执行性差 | `kernel/budget.js:15` `BUDGET_KINDS=['tokens','turns','toolCalls','subagents']` + reserve/退（`:104`）；`ratelimit.js`；`capacity.js`（预约/冷却/抢占）；`resource.js`。但 **tokens 无人计费**：全仓唯一 charge 是 `kernel/delegation.js:412 spend({id,tokens=0,turns=0})`，**没有任何调用方传非零 tokens**；`vmu.budget.tokens` def 0=不限（`settings/schema.js:856`），而 `docs/04-settings.md:893` 标"✅ 已接线 | kernel/budget.js" |
| B8 | 默认配额安全 | ❌ | `settings/schema.js:64-68`：`toolCallsPerTurnCap`/`maxLiveMembers`/`memoryCeilingMb`/`wallClockMs` 默认全 **0=不限**（仅 `maxParallel` 3）⇒ 默认无限成本/并发，产品化必须显式配预算才安全 |
| B9 | 重试/幂等 | ❌ 工具面默认不幂等 | `kernel/idempotency.js`（906 行）只被 transaction/replay/projmigrate 引用，**工具派发不经过它**；`packs/v5r/tools.js` 仅 `vibe_v5_verdict` 声明 `idempotent:true, duplicate:true`（`:4961`）⇒ 崩溃重试可能双写（与 run60 的 progress 双写同族） |
| B10 | 身份/权限 | ⚠️ 声明式，无认证 | `delegation.js`/`arbitration.js`/`custody.js`/`identity.js`/`trust.js`/`charter.js`/seat faces 构成授权面；但工具参数自报 `member`（如 `vibe_v5_record_progress` 收任意 member，`packs/v5r/tools.js:6137-6141`），无密码学身份；`kernel/index.js:2232-2237` 记录 run35 实测跨会话 chair 权威问题（`VMU_CHAIR_ACT_NOT_DELEGATED`）。提示注入可冒充他人 |
| B11 | 版本/兼容 | ✅ | `apiVersion` 导出、`STATE_VERSION`、pack contract version、`registry.checkPack`、`migration.js`、`stateversion.js`；`docs/13-migration.md` |
| B12 | 导出/导入/交接 | ⚠️ 半 | `kernel/handover.js`（交接）、`store` 有 `export/import`（`docs/18` D16 备注列出的方法）；但无"把一次运行打包成可移植产物"的标准（repropack 是另一概念，`kernel/repropack.js`） |
| B13 | 长时程记忆/上下文 | ⚠️ | 无会话压缩；prompt 预算固定字符上限（chair 36 000 / member 30 000，`scripts/audit-prompt-budget.mjs:28-49`；task-30 实测 chair 35 979/36 000 仅余 21 字符）；`kernel/memory.js` 是制度记忆（lessons/facts/preferences）且**靠显式 recall**，不是对话压缩；`kernel/minutes.js`、status board 提供机构级摘要 |
| B14 | 错误面 | ✅ 强 | 具名码 + hint + means（`docs/03` §8 唯一登记表、`docs/18` §7 处置速查）；但 pack 私码只按前缀注册（`packs/v5r/paper-quality.js:28` 自述"registered by prefix, not in the kernel table"）⇒ 跨 pack 错误目录不完整；部分 hint 1 000+ 字符（`docs/18` §2 多行） |
| B15 | 测试装置 | ✅ 强 | 753 个测试文件、`tests/_lib`、`scripts/sim` + 仓外只读语料目录；`scripts/preflight.mjs` T0/T1 门禁 |
| B16 | 设置可发现性 | ⚠️ | 1 168 键集中在 `settings/schema.js`；`scripts/generate-wired-schema.mjs` 实测"schema already in sync (1922 -> 1922)"、330 emitted / 836 pre-existing / 6 honest null default；生成表 `docs/04-settings.md` 与 schema 同步（这是优点），但无"最小必设集"，HOT 等级 H0-H3 语义也没有产品级建议 |

---

## C. v5r 机制优越性：**现在到底有没有任何机制真的检查证明正确性？**

**结论（重点回答）：没有。** 现有 `p=1 / Verified` 的"正确性"由三种东西支撑：(1) 参会者全体一致投票；(2) 一句文献引用字符串；(3) 可选的外部 Lean 编译。前两者是**社会性凭据**，第三者需要宿主注入 `spawn` seam，未注入时是具名环境拒绝。代码自己承认这一点。

**C1（根本）`verified` 轨自认"没有、也不可能判断证明"。**
`vibe-math-vmu/packs/v5r/verified.js:50-54`：proof text 存在 `Members/<member>/Propos/<id>.md`，"never reaches this track … promoteVerified requires a WARRANT … it does not, and cannot, claim to have judged the proof"。p=1 的四条路：`packs/v5r/verification-gates.js:95 P1_ROUTES=['debate','literature','lean-conformance','verified-row']`（`:98` 有逐条解释）。其中只有 lean-conformance 是机器检查，且 `kernel/index.js:1146-1155` 需要 `spawn` seam；没有 seam 时 sim（task-5）实测 `VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING`，论文照样 `finalized:true`。
**为什么不利于目标**：产品叙事是"多智能体数学研究"；核心承诺是"可信"。当前系统只能承诺"研究所相信它"，不能承诺"它是对的"。
**建议**：在 `verified` 记录里显式区分 `warrantKind:'social'|'machine'` 并在 API/UI 全部展示；`p=1` 的默认要求从"任一 warrant"改为"machine warrant 或显式 `acceptSocialWarrant:true`"；把 Lean 接成必选 pack（`packs/lean-check/`），未注入 seam 时 p=1 只能进 `Verified/` 的 social 分区而**不是**"绝对可信"。

**C2（严重）辩论闸只检查"证明登记在场"，不检查内容。**
`packs/v5r/verification-gates.js:255-330 debateSubjectGate`：卡片形态看 `proofState="complete"`（自述）与 `proof_ref`；文件形态**只信调用方自报** readable/bytes，回执 `proofContentChecked:false`、`evidenceSource:'caller-reported'`；一句话命题具名拒 `DEBATE_SUBJECT_NO_PROOF`。
**为什么不利于目标**：成员可以把一个空壳证明标 `complete` 就开会辩论；"辩论"的对象可以不是证明文本。
**建议**：辩论前要求 proof 文件 hash 与行数/结构清单（如 `\begin{proof}`…`\end{proof}` 或 Lean 目标语句），把 `proofContentChecked` 变 true 才允许开辩；辩论结论必须给"哪几行被核过"（receipt 里记录行号范围）。

**C3（严重）"概率"不是信念更新，是投票聚合。**
`kernel/meetingverdict.js:196-226`：全一致 ⇒ 该值；否则**均值**（标 `estimate:true, decided:false`）。全仓 `posterior`/`credence` 0 命中，`bayes` 仅 1 处；没有证据条件更新、没有校准、没有分布。`packs/v5r/verified.js:88-94` 把 p=1 约定为真、p=0 为假。
**为什么不利于目标**：直接把 p 当概率读会误导；"信念更新"在机制里不存在（只有"投票 → 平均值"）。
**建议**：要么把字段改名 `voteShare`/`confidence` 并停止用"概率"叙事；要么实现最小证据更新：每条 evidence 带 `(prior, likelihood)`，`p' = p·L/(p·L+(1-p)(1-L))`，并记录更新轨迹；至少要求 `p` 变更有 witness。

**C4（严重）没有反例机制。**
`counterexample` 在 kernel 0 命中、packs 1 命中、tests 17 命中（测试里的用法，不是机制）；`rejected` 只是一条存储轨。p=1 之前没有"先尝试否证"的强制步骤（否证任务、SAT/数值搜索、Lean 否定目标）。
**为什么不利于目标**：数学研究的核心动作是"找反例"；当前机制奖励"达成一致"，不奖励"证伪"。
**建议**：加 `negation` 任务类：p→1 前自动生成"否定命题"并派给独立成员，结果进 `counterexample` 轨；加 `vibe_v5_negate_search` 工具（接 Lean/数值/SAT）；反例命中即阻断 promote。

**C5（严重）文献面没有检索，只收字符串。**
`literature` 在 kernel 0 命中；`kernel/citations.js:1-6` 自述是书目**格式**面（style/fields/id priority）；`packs/v5r/verification-gates.js:188-192` 的 literature 路只收 reference 字符串，不核引用是否存在。
**为什么不利于目标**：文献支撑是"证明可依赖已有结果"的关键；当前连"这篇文献存在吗"都不检查。
**建议**：接 arXiv/zbMATH/Mathlib 检索（至少 DOI/arXiv id 存在性 + 标题匹配），把 literature_ref 升级为 `{source, id, verifiedAt, matchScore}`；未解析的引用不能作 warrant。

**C6（严重）论文评审闸是结构门，不是数学门。**
`packs/v5r/paper-quality.js` 的三个 gate：`citation`（id 是否存在/轨是否正确，`:595`）、`evidence`（每个 part 是否有证据，`:619,:632`）、`required-line`（verified/solved 的结论逐字出现）。评审 `kernel/reviewers.js` + `packs/v5r/paper-quality.js` 不判断定理陈述与证明是否匹配。
**为什么不利于目标**：论文可以"结构完美、引用全在、评审一致"，而数学是错的；`finalized:true` 不要求任何机器检查（C1 的 sim 已实测）。
**建议**：至少把"每个定理的证明必须引用 verified 轨的 machine/social warrant"做成 final gate；更进一步，要求每个 paper part 的 `requiredLine` 来自 proof 文件的真实行（hash 绑定）。

**C7（中）一致裁决有"没读也能投"的漏洞。**
`kernel/meetingverdict.js` 只数票；没有"投票前读了什么"的机制（回执里有 `read` 记录但裁决不要求）。`packs/v5r/meeting-procedures.js` 是程序，不是阅读证明。
**建议**：投票回执要求带 `readProofFingerprint`（proof 文件 hash）；未读同一 hash 的票计为弃权或降权。

**C8（✅ 有）任务依赖/状态机是真实存在的机制。**
`kernel/tasks.js` 有 `blocked_by` 与迁移表（run229 断言 legal table open→assigned|doing 等）；`kernel/workflow.js` 728 行。数学研究上的"拆题-依赖-验收"在这里有底座，虽然拆题质量靠 LLM。
**建议**：把"证明义务（obligation）"作为任务一等字段，让任务完成与莱布尼茨式检查挂钩（接 C1）。

**C9（⚠️ 部分）跨席知识复用是"共享库 + 显式检索"，不是自动注入。**
`record`/`library` 共享且可 `expand/search`（`docs/18` D16 备注列出 library 方法）；但每回合帧只自动带 status board 的 progress head，记忆（`kernel/memory.js`）要显式 recall。
**建议**：在帧里加"与本回合 task 相关的前 3 条 records（按标签/轨）"受限注入（预算内），把"知识复用"从"会用工具的人"变成"机制"。

**C10（⚠️ 部分）长时程：有 minutes/status board/replay，没有压缩与"当时相信什么"的查询。**
`kernel/minutes.js`、`kernel/replay.js`（K5 重建）能回答"发生了什么"，但没有"在 t 时刻研究所对命题 X 的信念是多少"的查询面；也无对话压缩（B13）。
**建议**：`replay` 增加 `beliefAt(t, propositionId)`；把 minutes 作为检索面暴露给成员。

**C11（✅ 有）失败复原强。**
`kernel/resume.js` 四条不变式（写前必读、id 永不复用、interrupted 具名、hydrate 缺口报 `VMU_RESUME_NO_ADAPTER`/`PROJECTION_GAP`）；回合循环对不可解析回执有重试计数；错误 hint 教修法。
**建议**：把"模型层面卡死"纳入同一语义（B6 的 hard deadline），避免会议无限等。

**C12（判断）"声称完成"vs"检查正确"的边界要写进产品话术。**
现在体系能保证：流程完整、引用可解析、证据在位、全员同意、可回放。不能保证：数学正确。这不是缺陷，而是**必须被明确的能力边界**；否则用户会把"finalized"读成"证明成立"。

---

## D. 产品化与可达性（冷启动 / 错误是否教人做事 / 文档 vs 实际）

**D1（严重）README 与安装面不一致：说四个 preset，实际发一个。**
`README.md:9-19` 用四代 preset 叙事，:`19` 明说"安装本插件包后，DSH 的预设选择器里会出现**四个** agent preset"，`README.md:11-17` 逐个介绍 v2/v3/v4/v5。但 `installer.js:53 export const PRESETS = [{ src:'vibe-math-vmu', dst:'vibe-math-vmu', … }]` **只发一个**；仓内也只有 `vibe-math-vmu/` 目录（`ls -d vibe-math-v*` 只有它），package.json 版本 2.8.5、files 清单里也无 v2-v5。README 顶部 `:21-22` 又说"旧 preset 弃用…方向已改为 vibe-math-vmu+pack"——**同屏出现两种真相**。
**为什么不利于目标**：新用户按 README 找四个 preset，找到零个旧 preset；信任从第一条就崩。
**建议**：README 以 vmu 为唯一主叙事，v2-v5 全部迁到 `docs/DEPRECATED-LEGACY-PRESETS.md`；安装段落改成"装完只有一个 preset：vibe-math-vmu"；用 `scripts/build-preset-rows.mjs` 生成"当前发货面"表并加 `--check` 防止再漂移。

**D2（严重）惰性默认 + 静默注册失败：装完可能"什么都没有"。**
`vibe-math-vmu/host.js:63-85` 注释（来自真实 host 实测）：`vmu.core.enabled === false` ⇒ 不注册任何工具；启用但未配置 ⇒ 只注册一个 `vibe_vmu_status`；"a tool registered with the wrong key is accepted silently and simply never appears"。代码侧还要求 tool spec 形状严格（`execute` 返回 JSON 字符串、`output.schema` 等）。
**为什么不利于目标**：这是"看不见的失败"——用户不知道为什么没工具；且默认启用与否需要读文档才知道。
**建议**：① `vibe_vmu_status` 在惰性时明确返回"如何启用"的三步指引（它已经是唯一可见面，最适合）；② 注册后打印/记录 `registeredTools` 清单，形状错误时**具名拒**而不是静默忽略（在 host 层包一层 `tools.register` 校验）；③ 提供 `vibe_vmu_doctor`（检查 config/packs/root/seam，输出可照抄的修复）。

**D3（严重）文档 vs 实际：58 vs 54，且 10 个名字是"计划"混在检索里。**
实测对账：`host.js` 的 `TOOL_NAMES` **58** 个；`docs/18-command-and-protocol-reference.md:27` 写"54 个 `vibe_vmu_*`＋1 个继承工具"。docs/18 全文出现 68 个不同 `vibe_vmu_*` 名，其中 10 个是 §3 的"计划工具"（agenda/motion/workflow/scheduler/metrics/math/units/prompts_preview/prompts_snapshot/middleware_status）——§3 自己标"未实现 ✗"，但工具总表/参考的计数已过期。
**建议**：工具计数与工具总表由 `scripts` 从 `TOOL_NAMES` 生成（`docs/18` §1 加 `--check`）；计划工具从总表彻底移出，改叫"路线图"。

**D4（中）文档—代码漂移被 lint 记录下来但被接受。**
`node scripts/check-docs.mjs` 结果 `DOC LINT: PASS`，但输出 notes：D16 `vmu.library` 有 27 个方法、`vmu.members` 15 个、`vmu.store` 11 个**契约（docs/03）未登记**；D11 有 11 个服务（meetingverdict/repropack/bidding/publication/transaction/auditchain/stateversion/clockguard/mathtools/projmigrate/storepolicy）"03 登记但其它文档从未提及"；D6 多条把 `vibe_v5_` 当选定名的提示。
**建议**：把 D16 从 note 升级为 warning（或要求 `docs/03` 的方法表生成自代码导出）；D11 的服务加"一句话用途"，否则用户无法发现。

**D5（中）文档一致性的正面证据（保持）。**
`node scripts/generate-wired-schema.mjs` 实测 `schema already in sync (1922 -> 1922 lines)`，并报告 330 emitted / 836 pre-existing / 6 honest null default + 命名的类型回落；`docs/04-settings.md` 与 schema 同步。这套"文档即门禁"是产品应保留的核心资产。

**D6（严重）设置面 1 168 键，没有产品级"最小必设集"。**
`settings/schema.js` 单文件 1 168 键；HOT 等级 H0-H3 只描述生效时机，不描述"不设会怎样"。默认 `0=不限`（B8）意味着用户不读 1 922 行文档就无法安全运行。
**建议**：`settings/schema.js` 增 `profile:'essential'|'advanced'`；`docs/04` 顶部生成"最小必设 10 条"；`vibe_vmu_status` 返回 `essentialMissing` 列表。

**D7（中）安装/更新机制本身是强的。**
`installer.js:22-45`：版本变更时 FORCE-REPLACE，但替换前把用户字节备份到 `.vibe-math-backup/<fromVersion>/`；原子写；同版本幂等（no-op）；缺文件总是恢复。这是产品级安装面该有的纪律。
**风险**：约 200 个受管文件 + 手写 `files` 清单，任何新增文件都要改两处名册（`docs/27` §6），长期会漂移（A6）。
**建议**：manifest 化发货面（目录扫描 + 排除表），并用 `--check` 验证清单与目录一致。

**D8（中）成本不可见。**
B3 的 token 无计费 + README 对旧 v5 的"零 token 成本"叙事（`README.md:16-17`，指状态存本地不写会话日志）容易让用户误以为 vmu 也零成本；vmu 每回合都是真实模型调用。
**建议**：回合回执加 `usage`（tokens in/out、模型）、`vibe_vmu_status` 报累计成本；README 明确"零 token"仅指 v5 的状态存储方式。

**D9（中）错误是否"教人做事"：总体很好，但语言与长度是隐患。**
强项：具名码 + `hint`/`means`/`nextGate`（如 `packs/v5r/paper-quality.js:595-650` 的 citation/evidence 拒绝会说明"文件卡 vs 记录行"的转换、`docs/18` §2.4 的 `VMU_QUOTA_EXCEEDED` 给两条可达修法）。
隐患：① 所有错误文案是中文，非中文用户/模型被阻断（框架面向通用 pack）；② 部分拒绝文案 1 000+ 字符，占上下文（与 prompt 预算并置时成本高）；③ pack 私码不在统一错误表（B14）。
**建议**：错误消息加 `en` 摘要字段（或 code + 结构化 `fix` 列表）；hint 支持 `short`/`full` 两级，工具回执默认 short；pack 的 code 声明进 manifest 的 `codes` 并由 `registry.checkPack` 合并进统一表。

**D10（中）宿主耦合：这是 DSH 插件，不是独立产品。**
`vibe-math-vmu/host.js:63-85` 的注册形状、`ctx.effect`、`tools.register`、子代理交付 seam（`host-deliver.js`、`host-children.js`）全部是 DSH 专属；`docs/02-architecture.md` 的"宿主接缝"三件套（subprocess/timer/fs）只覆盖一部分。
**建议**：明确产品定位"DSH preset 包"；把宿主适配层收敛到 `host*.js` 一个目录并在 docs/19 给出"换宿主要实现哪些函数"清单（当前散落在 4 个 host 文件）。

**D11 · 文档 vs 实际参数/声明抽样 10 条（逐条结论）**

| # | 文档声明 | 实测 | 结论 |
|---|---|---|---|
| 1 | README:`19`"选择器里会出现四个 preset" | `installer.js:53` PRESETS 仅 `vibe-math-vmu`；仓内仅该目录 | ❌ 漂移（严重） |
| 2 | `docs/18:27`"54 个 vibe_vmu_*" | `host.js` TOOL_NAMES = **58** | ❌ 计数过期 |
| 3 | `docs/18` 全文 68 个 `vibe_vmu_*` 名 | 58 已实现；10 个是 §3 计划工具（文档自己也标 ✗） | ⚠️ 需从总表移出 |
| 4 | `docs/04-settings.md:893` `vmu.budget.tokens` "✅ 已接线" | 无任何调用方传 tokens（`delegation.js:412` 唯一 charge 点） | ❌ 过度声明 |
| 5 | `docs/18:101-192` §2 逐工具参数/错误码（set/middleware/records/script/pack/control/meeting/task） | 对照 `host.js` 参数与动作枚举，未发现形状性错误；`set` 的 `appliesFrom` 映射与 `host.js:929` 一致 | ✅ 准确 |
| 6 | `docs/18` §2.6 `unload` 无需 `manifest`（R20 修复） | `host.js:1562-1573` 确认分支已上移、`plan/apply` 仍拒缺 manifest | ✅ 准确 |
| 7 | `docs/03` 服务方法契约 | `check-docs.mjs` D16：library 27 / members 15 / store 11 个方法未登记 | ❌ 契约不全 |
| 8 | `docs/18:293-297`"prompt/assemble 不在冻结集⇒中间件无法介入提示词装配；budget/exceeded 等无生产者" | 与 `kernel/prompt/index.js`/`kernel/bus` 代码一致 | ✅ 自报缺口真实 |
| 9 | `docs/04` 设置表与 `settings/schema.js` 同步 | `generate-wired-schema.mjs`："schema already in sync (1922 -> 1922)"，6 个 null default 具名 | ✅ 同步（保持） |
| 10 | `docs/27` §6"新增/删除整合包文件必须同时改两处名册" | 文档明写，但**无机制强制**（无生成器/校验） | ⚠️ 纪律靠人 |

---

## E. 距目标还缺什么（按优先级；每条给"放哪层 + 最小接口"）

1. **证明正确性的机器检查（目标核心）** — 放 `packs/lean-check/` + 内核 `verified` 面：`check(obligations) -> {ok, checked:bool, witness:{tool,hash}, linesChecked:[]}`；`promoteVerified` 默认要求 `warrantKind:'machine'`，社会性 warrant 显式降级标注（C1/C2）。
2. **pack 化收口（可定义性）** — 内核/入口：`replyFields` 进 manifest（A2）、`sectionPolicy/noticeBlock/phases` 进 manifest（A1）、pack settings 命名空间注册（A3）、框架默认去 v5r 化（A4）、research 面迁 pack（A5）。验收：新增 demo pack 零内核改动可跑（A6）。
3. **预算可执行（成本产品化）** — host 层：模型调用 usage → `budget.spend({tokens})`；回执带 `usage`；默认 `toolCallsPerTurnCap`/`maxLiveMembers` 给安全非零值（B7/B8/D8）。
4. **写入冲突检测** — store 层：rename 前比对 `stamp/version`，冲突返回 `VMU_STORE_CONFLICT`（可合并 patch 或报错），不再静默 last-writer-wins（B2）。
5. **工具派发幂等** — turn 层：以 `(turnId, field, callIndex)` 为键的默认去重（复用 `kernel/idempotency.js`），崩溃重试不双写（B9）。
6. **身份绑定** — host/turn 层：工具执行时 member 由回合上下文注入并与参数比对，不一致具名拒（B10）。
7. **跨进程可观测** — store 层：append-only 事件日志（审计链已有，扩成可 tail 的事件流）+ replay 关联 turnId（B4）。
8. **反例与文献** — pack 层：`negation` 任务类 + 反例搜索工具；引用解析（C4/C5）。
9. **产品入口** — docs/README 重构 + `vibe_vmu_doctor` + 最小必设集（D1/D2/D6）。
10. **错误国际化/分层** — 内核：`code + en + fix[]`，hint 分 short/full（D9）。

---

## F. 附：审计方法与可复现命令（全部只读）

```bash
node scripts/generate-wired-schema.mjs        # 设置读点 vs schema：sync 报告 + null default 清单
node scripts/check-docs.mjs                   # 文档一致性：PASS + D6/D11/D16 notes
node -e "import('./vibe-math-vmu/host.js').then(m=>console.log(Object.keys(m.TOOL_NAMES).length))"  # 58
grep -c "key: '" vibe-math-vmu/settings/schema.js   # 1168 个设置键
ls -d vibe-math-v*                            # 只有 vibe-math-vmu（对照 README:19 的"四个"）
```

> 未覆盖（本审计范围内未做，不误报）：动态运行行为（会在仓外临时目录或研究所数据目录写文件，超出只读范围）；`v6`/未来 pack 的可行性；安全渗透具体攻击链（B10 是结构性判断，不是 PoC）；性能基准（未跑压测）。
