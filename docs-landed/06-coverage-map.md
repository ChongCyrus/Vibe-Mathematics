# 06 · **覆盖面映射：用户点名的 (a)–(j) 各自落在哪**

> ★ 用户对框架的定位里**点名了十个方面**，并要求"**涵盖所有必要的功能**"。
> ★ 这一卷就回答：★ **每一个方面，★ 框架里【落在哪】** —— ★ 并给出**可查的锚点**。
> ★ **★ 纪律**：★ **权威清单由【生成的文件】给出**，★ 本卷不手抄模块列表（★ 手抄必漂移）：
> ★ **`vibe-math-vmu/docs/02-architecture.md`**（★ 内核索引，★ **生成**）／★ **`docs/03-interface-contract.md`**（★ 面与错误码）／★ **`docs/04-settings.md`**（★ **生成**；★ **设置键数以该生成卷为准，本卷不手抄计数**）。
>
> ★★ **快照声明（G8）**：本卷是**弃用前**的 `docs-landed` 快照，不是当前权威清单（旧 `vibe-math-v2`…`v5r`
> preset 已弃用，见 `docs/DEPRECATED-LEGACY-PRESETS.md`）；下文若出现旧 preset 目录/计数，均按**历史**读。

- 回答通道：`vibe-math-vmu/packs/v5r/prompts/v5r-reply-channel.js`（字段目录由内核表派生，通道段落明写"不要调 op:reply"）＋ `middleware/prompt-switches.js` 的 `CATALOGUES` 二选一（`tests/vmu-run35-reply-channel.test.mjs` 31/0）。
- 跨实例院士活动：`vibe-math-vmu/kernel/store.js` 的 `turns` 账本 ＋ `kernel/turn/index.js` 投递前落账（写不进就不投递）＋ `kernel/index.js` 的 `turnLedger` seam（`tests/vmu-run35-chair-act.test.mjs` 23/0）。
- 回执可观测：`counts.replyParseFailedLast` 与成功回合的 `replyExcerpt`（`tests/vmu-run35-readouts.test.mjs` 26/0），状态板有值行打印 `（来源：…）`。

## 0. ★★★ 三个"任何方面都共用"的底座

| ★ 底座 | ★ 在哪 | ★ 说明 |
|---|---|---|
| ★★ **回合循环与编排** | ★ `kernel/turn/index.js` ＋ `kernel/prompt/index.js` | ★ 选人 → 五段装配 → 投递 → 记录 |
| ★★ **能力与装配** | ★ `host.js`／`vibe-math-vmu.js`／`kernel/pack.js`／★ `kernel/loader.js` | ★ 宿主适配、pack 装载/卸载（★ 原子） |
| ★★ **状态与耐久** | ★ `kernel/store.js`／★ `kernel/resume.js`／★ `kernel/idempotency.js` | ★ 折页、恢复（★ 读前不许写）、K6 幂等 |

## 1. ★★★★★ (a) 数学研究 —— ★ 研究本身怎么被组织

| ★ 落点 | ★ 模块／面 |
|---|---|
| ★★ **研究对象与阶段** | ★ `kernel/lifecycle.js`（★ 阶段机；★ **未声明阶段表 ⇒ 拒而非默认放行**）、★ `kernel/stateversion.js` |
| ★★ **任务与工作划分** | ★ `kernel/tasks.js`、★ `kernel/workflow.js`、★ `kernel/board.js`（★ WIP 上限）、★ `kernel/panel.js`（★ **subtasks**）|
| ★ **成果归档** | ★ `kernel/records.js`、★ `kernel/library.js`（★ 内容指纹＋**改标题不改身份**）、★ `kernel/tracks`（★ **负知识有自己的文件**）|
| ★ **主张与判断** | ★ `kernel/ballot.js`、★ `kernel/ballotbox.js`、★ `kernel/fidelity.js`（★ **布尔票一律改写为 0.5**）|
| ★ **报告与可见性** | ★ `kernel/report.js`、★ `kernel/fidelity`、★ `kernel/metrics.js` |

## 2. ★★★★★ (b) 形式化

| ★ 落点 | ★ 模块 |
|---|---|
| ★★ **Lean 面** | ★ `kernel/lean.js`（★ **`passed` 不是状态，★ 只是"退出 0 且哈希未变"的结论**；★ `admission()` **如实登记**无独占创建/无跨进程强制）|
| ★★ **形式化政策与忠实性** | ★ `kernel/formal.js`（★ **公理白名单扫【提交源码】**；★ **编译失败 ⇒ `verdict:'undecided'`，★ 不等于命题为假**）|
| ★ **复现包** | ★ `kernel/repropack.js`（★ **数据默认只存指针**）|
| ★ **反证/不忠实** | ★ `kernel/fidelity.js`（★ **`isRefutation` 永远 false**；★ 缺陷的弃权**有耐久记录**）|

## 3. ★★★★★ (c) 计算与工具

| ★ 落点 | ★ 模块／面 |
|---|---|
| ★★ **数学计算面** | ★ `kernel/mathtools.js`（★ `spawn` 接缝；★ **未知 op 具名拒**）、★ `kernel/mathadapters.js`（★ 六种 `kind` 归一）|
| ★★ **异步作业** | ★ `kernel/mathjobs.js`（★ 镜像/恢复四分支；★ **`passed` 不在状态词表里**）|
| ★ **解释器与超时** | ★ `kernel/script-bridge.js`（★ **seam 结果字段是 `code`**；★ **非零退出是结果、★ 只有超时是硬失败**）|
| ★ **工具面的通用能力** | ★ `tools/capacity.js`、★ `tools/cost`、★ `kernel/ratelimit.js`（★ 令牌桶；★ **零限速自报 `unlimited`**）|

## 4. ★★★★★ (d) 代理通信与会议系统

| ★ 落点 | ★ 模块 |
|---|---|
| ★★ **会议** | ★ `kernel/meetings.js`、★ `kernel/meeting.js`（★ 轮次完成**只听 `inputs`/`silent`**）、★ `kernel/meetingmarker.js`（★ **接缝读到空＝空机构**）、★ `kernel/meetinglapse.js`（★ **纯规则**）|
| ★★ **群聊与私信** | ★ `kernel/chat.js`、★ `kernel/mailbox.js`（★ **拒绝点名 `by`**）|
| ★ **公告与通知** | ★ `kernel/notify.js`（★ **静默期只阻投递、★ 解除后必须发摘要**）、★ `kernel/alerts.js`（★ **去重不是丢弃**；★ **静默不是丢弃**）|
| ★ **会议纪要** | ★ `kernel/minutes.js`（★ **触界必报丢弃量**）|

## 5. ★★★★★ (e) 代理间协作

| ★ 落点 | ★ 模块 |
|---|---|
| ★★ **协作与协议** | ★ `kernel/collab.js`（★ **每张回执带 `enforced[]`＋`fired[]`**）、★ `kernel/partnership.js` |
| ★★ **委托与授权** | ★ `kernel/delegation.js`、★ `kernel/grant.js`（★ **授权有作用域：一扇窗，不是敞开的门**）|
| ★ **信任（★ 永不当权限）** | ★ `kernel/trust.js`（★ **S-3：声誉永不授予权限**；★ **零机制返回"无数据"而不是假 0**）|
| ★ **公平** | ★ `kernel/fairness.js`（★ **禁止把声誉当权重**）|

## 6. ★★★★★ (f) 工作流

| ★ 落点 | ★ 模块 |
|---|---|
| ★★ **工作流定义与推进** | ★ `kernel/workflow.js`（★ **23 键全接线、`partitionOk` 自述**）、★ `kernel/tasks.js`（★ 阶段机：**每条边两端都是已声明状态**）|
| ★★ **补偿事务** | ★ `kernel/transaction.js`（★ **失败逆序补偿，★ 只补偿已应用的**；★ **同一 txId 不跑两次**）|
| ★ **看板与槽位** | ★ `kernel/board.js`、★ `kernel/panel.js` |

## 7. ★★★★★ (g) 控制流

| ★ 落点 | ★ 模块 |
|---|---|
| ★★ **定时与调度** | ★ `kernel/scheduler.js`（★ **无计时器 ⇒ `tick-only` 且【永不假装】**；★ **到期只报告、不触发**）、★ `kernel/activity.js` |
| ★★ **时钟** | ★ `kernel/clockguard.js`（★ 单调；★ **未注入时回退 `Date.now()` 并【自曝】`guarded:false`**）、★ `kernel/timevalue.js`（★ **裸年份陷阱**）|
| ★ **限速与熔断** | ★ `kernel/ratelimit.js`、★ `kernel/discipline.js`（★ **阈值为零＝机制关闭，★ 不是"零次失败也允许"**）|
| ★ **暂停/恢复/停止** | ★ `kernel/control.js`（★ 面在 `tools/control.js`）|

## 8. ★★★★★ (h) 文件归档

| ★ 落点 | ★ 模块 |
|---|---|
| ★★ **折页与耐久** | ★ `kernel/store.js`（★ **白名单键**）、★ `kernel/resume.js`（★ **读成功前不许写**；★ **读不了的折页不当作空的**）|
| ★★ **归档与身份** | ★ `kernel/library.js`（★ **指纹只在一处算**）、★ `kernel/records.js`、★ `kernel/custody.js`（★ **明文映射按名拒**）|
| ★ **截断与上限** | ★ `kernel/receiptbounds.js`（★ **五键常在、★ 两态键集合相同**；★ **不改数组长度、不丢键**）|
| ★ **重放与迁移** | ★ `kernel/replay.js`（★ **空审计不是重建**）、★ `kernel/migration.js`、★ `kernel/projmigrate.js` |

## 9. ★★★★★ (i) 评审与出版

| ★ 落点 | ★ 模块 |
|---|---|
| ★★ **评审** | ★ `kernel/reviewers.js`（★ **COI 双向**；★ **每次解绑必须留痕**）、★ `kernel/ballotbox.js` |
| ★★ **论文与出版** | ★ `kernel/paper.js`（★ **只查存在、不判断税率**式的分工）、★ `kernel/publication.js`（★ **"on request" 除非显式允许否则被拒**；★ **版本链不得断**）|
| ★ **引用** | ★ `kernel/citations.js`（★ **按声明优先级选标识**；★ **`fired` ＝ 策略【覆盖】了默认**）|
| ★ **会议/期刊** | ★ `kernel/conference.js` |

## 10. ★★★★★ (j) 代理自组织

| ★ 落点 | ★ 模块 |
|---|---|
| ★★ **名册与席位** | ★ `kernel/control.js`（★ **hire/fire 走内核槽位**；★ **缺槽位具名拒**）、★ `kernel/members.js`、★ `kernel/recruit.js`（★ **未映射标题 ⇒ 具名拒并指 `vmu.roles.map`**）|
| ★★ **自组织规则** | ★ `kernel/rules.js`（★ **M1：数据不是解释器**）、★ `kernel/charter.js`（★ **未生效的章程不得引用**）|
| ★ **机构演化** | ★ `kernel/governance.js`、★ `kernel/topology.js`、★ `kernel/tenure.js`、★ `kernel/handover.js` |
| ★ **身份与人格** | ★ `kernel/identity.js`、★ `kernel/human.js`、★ `kernel/crypto.js` |

## 11. ★★★ 还有一层：★ **"其它一切有价值方面"**（★ 用户说"包括但不限于"）
★ **框架刻意把它做成【可扩展的】**，★ 而不是把清单写死：★ **加一个方面 ＝ 加一个 pack 条目/中间件/面**，★ **不需要改内核** ✓（★ 见 `03-extending`）
★ **已有的"计划中"扩展点**：★ `docs/10-packs.md §4.2` 里有**具名扩展点**（★ 例如 v3 的规划器/调度器/promotion 阈值 —— ★ 它们**被删掉了键**，★ 但把**设计意图**留在了那里）✓

## 12. ★★ 一句话
★ **十个方面【每一个都有落地模块】**，★ **且清单由生成文件兜底**（★ `docs/02`／`03`／`04`）⇒ ★ **读者不必信这一卷，★ 可以去查** ✓



## 13. ★★★★ 增量（R29–R33，2026-10-26）：★ 快照之后新增的机制，★ 权威在 `vibe-math-vmu/docs`

★ **本卷是快照，这一节是补丁**。★★ **下面每条都不改上面的历史表格**，只是把"快照之后新增的机制落在哪"点名，
★ 并把**权威指向**写出来 —— ★ 具体字段／错误码／设置键**一律以 `vibe-math-vmu/docs/` 为准**，★ **本卷不重抄**。

| ★ 机制 | ★ 落点（模块/面） | ★ 权威 |
|---|---|---|
| ★★ **席位→工具面由【声明】派生**（不再从提示词反推 deny） | ★ `packs/v5r/seat-faces.js`（`SEAT_TOOL_FACES`／`SEAT_TEACHING`／`seatAllowNames` 等纯函数），提示词 bullet 由它**渲染** | ★ `docs/26` 的 seat 小节 |
| ★★ **成员工具 override 只能【收窄】**（allow 不许盖过席位 deny） | ★ `kernel/index.js` 的 `resolveMemberToolDeny()`（回执带 `allowNarrowedByDeny`） | ★ `docs/03` 工具面一节 |
| ★★ **邮箱跨内核共享**（成员子会话能读到自己收到的信） | ★ `kernel/mailbox.js` 读前拉取 + 写时在 store 当前值上合并回写 | ★ `docs/02` mailbox 段 |
| ★★ **成员在【自己的会话】里提交辩论裁决** | ★ `packs/v5r/tools.js` 的 `vibe_v5_verdict`（`channel:"ruling"`，落成成员名下卡）+ `vibe_v5_verdict_final` 从提交采纳 | ★ `docs/03` verdict 族 |
| ★★ **`[状态板]` 四字段由机制产出**（总任务／规划／各任务完成状态／当前小任务） | ★ `kernel/turn/index.js` 的 `STATUS_BOARD_READ_OPS`／`STATUS_BOARD_FIELDS`／`renderStatusBoard`／`composeStatusBlock` | ★ `docs/26 §3.44` |
| ★★ **落盘目录消失时的写：具名拒绝 + 不再制造无人处理的 rejection** | ★ `kernel/store.js`（`root-gone`／回写回滚／`patch()` 直接返回 mutate 的 promise） | ★ `docs/03` 的 `vmu.store` 行 |
| ★★ **人工审批面的席位闸门**（decide/withdraw/veto/inject 由声明角色决定，默认只有 office） | ★ `tools/human.js` 的 `gateVerb`＋`settings` 的 `vmu.human.deciderRoles`／`injectRoles` | ★ `docs/03 §8` 的 R31 码表 |
| ★ **成员回合的续会话**（同一 child session；不可达时回执写准原因） | ★ `kernel/turn/index.js`（`continuation` 读数）＋ `host-deliver.js`（`residency`） | ★ `docs/26` 的 `delivery.residency` 段 |
| ★ **连排多会议** | ★ `packs/v5r/tools.js` 的 `vibe_v5_meeting { sequence }`（内核 `openSeq` 早已支持） | ★ `docs/03` 的 `vibe_v5_meeting` 行 |
| ★★ **群聊治理面可达**（`vmu.chat.admins` 可写 SEAT token，如 `chair`＝院士；解析不到不算授予） | ★ `kernel/chat.js` 的 `seatOf` 缝＋`packs/v5r/settings/defaults.json` 的 `vmu.chat.admins: ["chair"]` | ★ `docs/04` 的 `vmu.chat.admins` 行＋`docs/26` 的 ROUND 34 段 |
| ★★ **校验器必须把自己的值交出去**（`need()` 会抛不等于会传；chat 面曾因此把"你传了"报成"没传"） | ★ `tools/chat.js` 的 `need` 返回其值 | ★ `docs/26` 的 ROUND 34 段 |
| ★★ **状态板读全轨、截断要写明**（`records.list` 默认只给最早 7 行，最新行恰在另一端） | ★ `kernel/turn/index.js` 的状态板 ④ 用 `limit: 0` ＋ 截断措辞 | ★ `docs/26` 的 ROUND 34 段 |
| ★★ **命题库跨内核可见**（先启动的所办也要读到成员后来写的卡：`known ids: (none)` 是 run 36 的死因） | ★ `kernel/records.js` 的 `attachStore`／`synchronize`（读写前按 stamp 增量同步，不覆盖本地）＋`kernel/index.js` 的接线 | ★ `docs/26` 的 ROUND 36 段（F-1） |
| ★★ **蓝图正文段是「起点标记」不是「段边界」**（`## 正文` 到 body 末尾逐字；曾把 4134 B 的草案 adopt 成 939 B） | ★ `packs/v5r/blueprint.js` 的 `blueprintTextOf()`／`blueprintMeans()` | ★ `docs/26` 的 ROUND 36 段（F-2） |
| ★★ **关掉的会议不会在下一个内核里重新开着**（archive 已记录 closed 的 live 行不序列化、不 hydrate、reload 不复活） | ★ `kernel/meetings.js` 的 `snapshot()`／`restore()`／`restoreReload()` | ★ `docs/26` 的 ROUND 36 段（F-3） |
| ★★ **研究日志的作者由写的人说出来**（不传 `member` ⇒ `by:null`、状态板认不出；落盘行的作者字段曾整个丢失） | ★ `packs/v5r/tools.js` 的 `vibe_v5_record_progress` 描述＋`seat-faces.js` 三条席位教学＋`kernel/index.js` 的 `snapshotRecords` 取 `owner` | ★ `docs/26` 的 ROUND 36 段（F-4） |

★ ★★ **两条读法**：① 上表任一行的"当前是否真的这样"★ **以对应 `docs/` 卷与门禁为准**，★ 本卷写的是**落点**不是**保证**；
② ★ 真机判决逐轮记录在 `docs/acceptance/phase12-v5r-rules-conformance.md`（§125 起），★ 那一卷是**证据表**，★ 每条都指到 `文件:行` 或门禁末行。
