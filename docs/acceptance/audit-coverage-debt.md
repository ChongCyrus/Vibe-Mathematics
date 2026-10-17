# 覆盖债务台账 · **kernel 逐文件的三级审查账**

> ★ **本文件是【生成物】** —— ★ 由 `scripts/generate-coverage-debt.mjs` 生成，★ `regen-all --check` 会校验（★ 手改会失败）。
> ★ 要改 `L2`（★ 「读过」）请改生成器里的 `READ_MODULES`（★ 那是**声明**，★ 因为「读过」是人做的事）；
> ★ `L3`（★ 宣称级验证）与 `L1`（★ 仅机器门禁）都是**派生**的：★ 前者来自 `tests/audit-kernel-claims*.mjs`，★ 后者是补集。

## 1. ★★★ 三级口径

| ★ 级别 | ★ 含义 |
|---|---|
| ★★ **L3 宣称级验证** | ★ `tests/audit-kernel-claims*.mjs` 里有断言在测**它自己头部的一句话** |
| ★★ **L2 已读** | ★ 本阶段**逐行读过**，或改过并复读过（★ **声明**，★ 见 `READ_MODULES`）|
| ★ **L1 仅机器门禁** | ★ **没有人读过**，★ 但**全树可判定门禁**覆盖它（★ 悬空调用／★ 面动作／★ 静默键／★ RULE E 断言判据／★ docs lint／★ 派生同步）|
| ★ **L0 未触及** | ★ 以上皆无（★ 结构性恒为 0，★ **也印成一行**，★ 免得它悄悄不再被检查）|

★★ **L1 不是「没检查」** —— ★ 它是**「有一套判据明确、结果可复算的检查覆盖了它，★ 只是没人逐行读」**。
★ 覆盖 L1 的四道自建门禁：
★ `tests/audit-service-calls.mjs`（★ 调用侧：★ `kernel.<服务>.<方法>` 必须可解析，★ **87 服务 × 213 文件**）／
★ `tests/audit-face-actions.mjs`（★ 面侧：★ 每个提供的动作必须存在或有分支，★ **51 面／47 enum**）／
★ `tests/audit-silent-keys.mjs`（★ 设置键：★ 不得「既无人读也未被裁定」，★ **640 文件**）／
★ `tests/audit-kernel-claims*.mjs`（★ 行为宣称：★ **60 模块／断言数见各探针总结行**）。

## 2. ★★★★★ 账（★ kernel 103 文件／45166 行）

| ★ 级别 | ★ 文件 | ★ 行数 | ★ 占比 |
|---|---|---|---|
| ★★ **L3 宣称级验证** | ★ **60** | ★ **30973** | ★ 68.6% |
| ★★ **L2 已逐行读** | ★ **15** | ★ **9690** | ★ 21.5% |
| ★ **L1 仅机器门禁** | ★ **28** | ★ **4503** | ★ 10.0% |
| ★ **L0 未触及** | ★ **0** | ★ **0** | ★ 0% |

⇒ ★★★★ **75/103 文件（90% 行）有人工审查；★ 28 文件（10% 行）仅机器门禁覆盖** ✓

### 2.1 ★★ L3（★ 有行为断言在测其头部宣称）

  `resume.js`（1195） · `meetings.js`（1154） · `mathjobs.js`（1033） · `idempotency.js`（907） · `lean.js`（893） · `records.js`（883） · `mathtools.js`（873） · `mathadapters.js`（855） · `chat.js`（758） · `ip.js`（747） · `workflow.js`（729） · `library.js`（727） · `funding.js`（712） · `pack.js`（640） · `ballot.js`（631） · `replay.js`（627） · `meeting.js`（613） · `scheduler.js`（611） · `alerts.js`（609） · `charter.js`（598） · `conference.js`（593） · `paper.js`（586） · `ballotbox.js`（571） · `migration.js`（561） · `auditchain.js`（550） · `bidding.js`（537） · `tasks.js`（534） · `human.js`（528） · `external.js`（524） · `meetingmarker.js`（516） · `memory.js`（497） · `capacity.js`（456） · `publication.js`（435） · `minutes.js`（434） · `course.js`（429） · `panel.js`（428） · `transaction.js`（416） · `rules.js`（410） · `compliance.js`（407） · `resource.js`（386） · `retention.js`（376） · `recruit.js`（368） · `fairness.js`（303） · `notify.js`（301） · `trust.js`（290） · `collab.js`（287） · `storepolicy.js`（284） · `lifecycle.js`（270） · `grant.js`（268） · `tenure.js`（268） · `loader.js`（254） · `skills.js`（252） · `governance.js`（251） · `topology.js`（249） · `handover.js`（243） · `clockguard.js`（242） · `formal.js`（241） · `stateversion.js`（237） · `identity.js`（227） · `ratelimit.js`（169）

### 2.2 ★★ L2（★ 已逐行读过或改过并复读 · ★ 声明于 `READ_MODULES`）

  `index.js`（2439，R80） · `turn/index.js`（1034，R50） · `prompt/index.js`（785，R86） · `bus.js`（753，R85） · `report.js`（628，R99） · `mailbox.js`（607，R89） · `activity.js`（547，R80） · `delegation.js`（547，R97） · `arbitration.js`（497，R97） · `metrics.js`（394，R97） · `store.js`（317，R97） · `members.js`（316，R83） · `control.js`（309，R83） · `guard.js`（293，R97） · `ids.js`（224，R97）

## 3. ★★★★★ L1 的具名余项（★ 28 文件，★ 按行数降序）

> ★ **这一列就是门 1 的剩余工作清单** —— ★ **可数、★ 具名、★ 按规模排序**。
> ★ 推进方式：★ **每轮取 2–3 个照「验证宣称」那把尺过一遍**（★ 已验证者升到 L3，★ 并把断言收进 `audit-kernel-claims*`）。

| ★ # | ★ 文件 | ★ 行数 |
|---|---|---|
| 1 | `meetinglapse.js` | 224 |
| 2 | `script-bridge.js` | 219 |
| 3 | `budget.js` | 216 |
| 4 | `audit.js` | 214 |
| 5 | `crypto.js` | 213 |
| 6 | `receiptbounds.js` | 209 |
| 7 | `custody.js` | 204 |
| 8 | `registry.js` | 194 |
| 9 | `repropack.js` | 192 |
| 10 | `reviewers.js` | 192 |
| 11 | `board.js` | 190 |
| 12 | `fidelity.js` | 187 |
| 13 | `projmigrate.js` | 181 |
| 14 | `reportfeedbackdelivery.js` | 179 |
| 15 | `discipline.js` | 175 |
| 16 | `work.js` | 165 |
| 17 | `math.js` | 159 |
| 18 | `explain.js` | 157 |
| 19 | `resumeflush.js` | 152 |
| 20 | `library-policy.js` | 143 |
| 21 | `partnership.js` | 143 |
| 22 | `citations.js` | 137 |
| 23 | `reportfeedback.js` | 125 |
| 24 | `meetingleave.js` | 96 |
| 25 | `meetingdomain.js` | 72 |
| 26 | `meetings-defaults.js` | 58 |
| 27 | `timevalue.js` | 55 |
| 28 | `contentvalue.js` | 52 |

## 4. ★★★ 这份账之外的覆盖

★ **kernel 之外**：★ `tools/` **51 个面**已按动作级核对（★ 0 缺陷）／★ `settings/schema.js` 的 **1123 键**已过静默键门禁／★ **pack 17/17 文件**已有覆盖（★ 13 逐行＋2 生成免眼审＋2 结构化审计）／★ `host*.js`（★ 定点）。
★ **真机**：★ 53 面被真实调用、★ **47/47 重点面逐面触达**、★ 39 条拒绝全部可执行、★ **结题两次独立达成**。

## 5. ★★ 明确【尚未读】的少数非 kernel 文件（★ 具名，★ 不藏）

★ `docs/landscape-similar-frameworks.md`（★ **408 行**）—— ★ **完全未读**（★ 调研文档，★ 不影响运行机制，★ 但按「不许把没读到写成没问题」，★ 在此具名）。
★ `README.md` 与 `vibe-math-vmu/docs/00–14` 各卷 —— ★ **未逐卷通读**（★ 但其**数字与链接**由 `check-docs`／`audit-doc-line-refs`／`audit-readme-counts`／`regen --check` 在管）。

## 16. ★★★★★ ROUND 116：第十五批 B 路 **42/0**（★ L3 达 60）＋ ★ 修掉一处**不成立的"从不"**

### 16.1 ★★★ 四个模块升 L3
| ★ 模块 | ★ 断言 | ★ 关键宣称 |
|---|---|---|
| ★ `formal.js` | ★ 11 | ★ **`sorry` 默认拒并在【3 个位置】点名 `line:col`**（★ 三点互不相同）／★ **正向 `allowSorry:true` 放行且自曝**／★ **编译失败 ⇒ `verdict:'undecided'`（★ 不等于命题为假）**，★ 成功 ⇒ 非 undecided（★ 双向）|
| ★ `clockguard.js` | ★ 9 | ★ **单调不减在【3 个回拨点】上**，★ **三个策略各自**（clamp 不回退／refuse 抛出具名码／warn 可回退但**自曝**）／★ **零机制自曝 `guarded:false`**（★ 两向）|
| ★ `stateversion.js` | ★ 12 | ★★ **迁移失败【一字不变】**（★ 原对象逐字比较 ＋ 具名 code）／★ **降级默认拒 ＋ 显式放行（双向）**／★ **幂等在 2 个点**／★ **3 跳链 ＋ `maxMigrationSteps:1` ⇒ `VMU_RESOURCE_BUDGET`** |
| ★ `identity.js` | ★ 10 | ★★ **`enforced[]`＋`fired[]` 在【3 张写回执】上都成立** —— ★ **正是 `collab.js` 栽过的同一个地方** ✓ |
★ **累计：60 个模块、704 条断言**（★ 十八个探针）⇒ ★ **L3 达 60/103 文件** ✓

### 16.2 ★★★★★ 而修掉了一处【不成立的"从不"】（★ 与那 3 处真缺陷同型）
★ `clockguard.js:32` 头注逐字：★ **"本模块**从不**调用 `Date.now()` / `performance.now()`"** ✓
★ 而 `:36` 逐字：★ `const base = typeof clock === 'function' ? clock : (typeof now === 'function' ? now : () => Date.now())` ⇒ ★ **未注入时的回退默认【确实调用】** ✓
★ **而 `:35` 的注释与 `status().guarded === false` 【都如实自曝】了这一点** ⇒ ★ **行为从来没错，★ 错的是那句"从不"** ✓
★ **修法**：★ **不改行为**，★ **只把头注改成【条件式真相】** —— ★ "**注入时**从不调用；★ **未注入时回退**到它，★ 而这一点在 `status().guarded === false` 里**自曝**" ＋ ★ **并写明"这半句原先写作『从不』，★ 而 `:36` 确实调用 —— ★ 一个不成立的『从不』已改为条件式"** ✓
⇒ ★★★ **"一个条件成立的『从不』，★ 是缺陷；★ 而行为可以完全正确"** ✓✓ —— ★ **与本阶段 3 处真缺陷同一个解剖**（★ "宣称的覆盖范围被夸大"）

### 16.3 ★★ 而 B 路自己也报了 8 处猜错，★ 其中第 8 处值得留
★ 它最初想用 **"源码里 `Date.now` 出现次数 ≤ 2"** 来证"不读真实时间" ⇒ ★ **★ 该次数在两次运行间从 2 变成 4**（★ 因为另一路正在并行改动同一棵树）⇒ ★ **它自己判定"这种脆测法无效"**，★ 改为 **问 `clockSource()` 返回什么 ＋ `guarded` 两向** ✓
⇒ ★★★ **"并行改动期，★ 数源码次数是一种会被别人改变量"** ✓

### 16.4 ★★ 覆盖债务
★ **L3 60 · L2 15 · L1 28 · L0 0** ⇒ ★ **有人工审查 75/103 文件；★ 仅机器门禁降到 28** ✓
★ **T1 368/368**（★ probes 56）／★ **RULE E 88/0**（★ 又抓我一条：★ **自证块里的条件式断言** ⇒ 已补 `EMPTY_ALLOWED` 豁免）／★ **regen-all 16/16** ✓
★ **A 路 18/2 未入库**（★ 它的两条红均是自己的仪器：★ 坏启发式 ＋ 假 spawn 的 exit 字段）⇒ ★ **它留下的开工单：★ ① 读 `formal.js` 的 spawn 结果字段名 ② 把 clockguard 源码断言改为"全文件 `Date.now()` 出现次数 === 1"（精确可数，替掉坏启发式）③ 重跑 ⇒ 目标 20/0** ✓
