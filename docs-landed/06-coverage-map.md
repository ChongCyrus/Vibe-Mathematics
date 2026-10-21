# 06 · **覆盖面映射：用户点名的 (a)–(j) 各自落在哪**

> ★ 用户对框架的定位里**点名了十个方面**，并要求"**涵盖所有必要的功能**"。
> ★ 这一卷就回答：★ **每一个方面，★ 框架里【落在哪】** —— ★ 并给出**可查的锚点**。
> ★ **★ 纪律**：★ **权威清单由【生成的文件】给出**，★ 本卷不手抄模块列表（★ 手抄必漂移）：
> ★ **`vibe-math-vmu/docs/02-architecture.md`**（★ 内核索引，★ **生成**）／★ **`docs/03-interface-contract.md`**（★ 面与错误码）／★ **`docs/04-settings.md`**（★ **生成**；★ **设置键数以该生成卷为准，本卷不手抄计数**）。
>
> ★★ **快照声明（G8）**：本卷是**弃用前**的 `docs-landed` 快照，不是当前权威清单（旧 `vibe-math-v2`…`v5r`
> preset 已弃用，见 `docs/DEPRECATED-LEGACY-PRESETS.md`）；下文若出现旧 preset 目录/计数，均按**历史**读。

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


