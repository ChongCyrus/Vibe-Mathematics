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
★ `tests/audit-kernel-claims*.mjs`（★ 行为宣称：★ **77 模块／断言数见各探针总结行**）。

## 2. ★★★★★ 账（★ kernel 103 文件／45166 行）

| ★ 级别 | ★ 文件 | ★ 行数 | ★ 占比 |
|---|---|---|---|
| ★★ **L3 宣称级验证** | ★ **77** | ★ **34252** | ★ 75.8% |
| ★★ **L2 已逐行读** | ★ **15** | ★ **9690** | ★ 21.5% |
| ★ **L1 仅机器门禁** | ★ **11** | ★ **1224** | ★ 2.7% |
| ★ **L0 未触及** | ★ **0** | ★ **0** | ★ 0% |

⇒ ★★★★ **92/103 文件（97% 行）有人工审查；★ 11 文件（3% 行）仅机器门禁覆盖** ✓

### 2.1 ★★ L3（★ 有行为断言在测其头部宣称）

  `resume.js`（1195） · `meetings.js`（1154） · `mathjobs.js`（1033） · `idempotency.js`（907） · `lean.js`（893） · `records.js`（883） · `mathtools.js`（873） · `mathadapters.js`（855） · `chat.js`（758） · `ip.js`（747） · `workflow.js`（729） · `library.js`（727） · `funding.js`（712） · `pack.js`（640） · `ballot.js`（631） · `replay.js`（627） · `meeting.js`（613） · `scheduler.js`（611） · `alerts.js`（609） · `charter.js`（598） · `conference.js`（593） · `paper.js`（586） · `ballotbox.js`（571） · `migration.js`（561） · `auditchain.js`（550） · `bidding.js`（537） · `tasks.js`（534） · `human.js`（528） · `external.js`（524） · `meetingmarker.js`（516） · `memory.js`（497） · `capacity.js`（456） · `publication.js`（435） · `minutes.js`（434） · `course.js`（429） · `panel.js`（428） · `transaction.js`（416） · `rules.js`（410） · `compliance.js`（407） · `resource.js`（386） · `retention.js`（376） · `recruit.js`（368） · `fairness.js`（303） · `notify.js`（301） · `trust.js`（290） · `collab.js`（287） · `storepolicy.js`（284） · `lifecycle.js`（270） · `grant.js`（268） · `tenure.js`（268） · `loader.js`（254） · `skills.js`（252） · `governance.js`（251） · `topology.js`（249） · `handover.js`（243） · `clockguard.js`（242） · `formal.js`（241） · `stateversion.js`（237） · `identity.js`（227） · `meetinglapse.js`（224） · `script-bridge.js`（219） · `budget.js`（216） · `audit.js`（214） · `crypto.js`（213） · `receiptbounds.js`（209） · `custody.js`（204） · `registry.js`（194） · `repropack.js`（192） · `reviewers.js`（192） · `board.js`（190） · `fidelity.js`（187） · `projmigrate.js`（181） · `reportfeedbackdelivery.js`（179） · `discipline.js`（175） · `ratelimit.js`（169） · `work.js`（165） · `reportfeedback.js`（125）

### 2.2 ★★ L2（★ 已逐行读过或改过并复读 · ★ 声明于 `READ_MODULES`）

  `index.js`（2439，R80） · `turn/index.js`（1034，R50） · `prompt/index.js`（785，R86） · `bus.js`（753，R85） · `report.js`（628，R99） · `mailbox.js`（607，R89） · `activity.js`（547，R80） · `delegation.js`（547，R97） · `arbitration.js`（497，R97） · `metrics.js`（394，R97） · `store.js`（317，R97） · `members.js`（316，R83） · `control.js`（309，R83） · `guard.js`（293，R97） · `ids.js`（224，R97）

## 3. ★★★★★ L1 的具名余项（★ 11 文件，★ 按行数降序）

> ★ **这一列就是门 1 的剩余工作清单** —— ★ **可数、★ 具名、★ 按规模排序**。
> ★ 推进方式：★ **每轮取 2–3 个照「验证宣称」那把尺过一遍**（★ 已验证者升到 L3，★ 并把断言收进 `audit-kernel-claims*`）。

| ★ # | ★ 文件 | ★ 行数 |
|---|---|---|
| 1 | `math.js` | 159 |
| 2 | `explain.js` | 157 |
| 3 | `resumeflush.js` | 152 |
| 4 | `library-policy.js` | 143 |
| 5 | `partnership.js` | 143 |
| 6 | `citations.js` | 137 |
| 7 | `meetingleave.js` | 96 |
| 8 | `meetingdomain.js` | 72 |
| 9 | `meetings-defaults.js` | 58 |
| 10 | `timevalue.js` | 55 |
| 11 | `contentvalue.js` | 52 |

## 4. ★★★ 这份账之外的覆盖

★ **kernel 之外**：★ `tools/` **51 个面**已按动作级核对（★ 0 缺陷）／★ `settings/schema.js` 的 **1123 键**已过静默键门禁／★ **pack 17/17 文件**已有覆盖（★ 13 逐行＋2 生成免眼审＋2 结构化审计）／★ `host*.js`（★ 定点）。
★ **真机**：★ 53 面被真实调用、★ **47/47 重点面逐面触达**、★ 39 条拒绝全部可执行、★ **结题两次独立达成**。

## 5. ★★ 明确【尚未读】的少数非 kernel 文件（★ 具名，★ 不藏）

★ `docs/landscape-similar-frameworks.md`（★ **408 行**）—— ★ **完全未读**（★ 调研文档，★ 不影响运行机制，★ 但按「不许把没读到写成没问题」，★ 在此具名）。
★ `README.md` 与 `vibe-math-vmu/docs/00–14` 各卷 —— ★ **未逐卷通读**（★ 但其**数字与链接**由 `check-docs`／`audit-doc-line-refs`／`audit-readme-counts`／`regen --check` 在管）。

## 20. ★★★★★ ROUND 121：第十九批 F 路 **23/0**（★ L3 达 77、L1 只剩 11）

| ★ 模块 | ★ 断言 | ★ 关键宣称 |
|---|---|---|
| ★ `projmigrate.js` | ★ 6 | ★ **"七条硬不变式"逐条以 `status()` 布尔自述**，★ **8 个布尔逐个检查**（★ 缺一条即红）／★ `CODE` **复用五个已登记码** |
| ★ `reportfeedbackdelivery.js` | ★ 6 | ★★ **"开关关闭 ⇒ 零机制：★ 什么都没交付，★ 且【不编造失败】"**（★ 九键在、失败字段全 `null`）／★ **"开但无受众 ⇒ 具名失败"**（`what` 指向 audience）／★ **"宿主接不了这通调用 ⇒ 带 stack 的具名失败"**（★ **两个子情形分别测**）／★ **"四种结果签名【两两不同】"** |
| ★ `discipline.js` | ★ 6 | ★★ **"阈值为零＝机制关闭，★ 而【绝不】是『零次失败也允许』"** ⇒ ★ **4 次失败仍不阻断** ＋ ★ **正向：阈值 1 ⇒ 一次即 `VMU_DISCIPLINE_BREAKER_OPEN`** |
| ★ `work.js` | ★ 5 | ★ **"一切写入走 `store.patch(key, fn)`（★ 函数式变更）"** ⇒ ★ **探针缝逐次观测 `key==='work'` 且 `typeof fn==='function'`** |
★ **累计：77 个模块、821 条断言**（★ 二十二个探针）⇒ ★ **L3 达 77/103 文件** ✓

### 20.1 ★★★★★ 两条值得记的方法
★ **① "四种结果"要把签名做细**：★ 它先用 `code|delivered|registered` 做签名 ⇒ ★ **两个宿主失败态看起来【相同】** —— ★ **正是该宣称禁止的那种坍缩** ⇒ ★ **把 `what`/`stack` 纳入签名后四态真正两两不同** ✓✓
★ **② 有一条宣称只能用【结构】验**：★ `work.js` 说"一切写入走 `store.patch(key, fn)`" —— ★ **答案本身证明不了这一点**，★ **只有【调用的形状】能** ⇒ ★ 它去观测接缝的每次调用 ✓✓
⇒ ★★★ **"有些宣称要用【答案】验，★ 有些只能用【调用的形状】验 —— ★ 用错层级就永远测不到"** ✓

### 20.2 ★★★ 而 A 路 16/1（★ 18A 的 2 条**全绿**，★ 根因查明）
★ **根因**：★ `declareDefect` **是 `async` 且三必填**（`target`／**`by`**／**`note`**）；★ **`applyAbstention` 的输入字段是 `declared`，不是 `vote`**（★ `vote` 是**强制输出**）✓
★ 因此 `declared:1` **与** `declared:0` **都 ⇒ `enforced:true, vote:0.5`** ⇒ ★ **"pack 无法关掉它"成立** ✓✓
★ 余 1 条：★ **`abstentionFor({target})` 漏了 `by`** ⇒ ★ 一行即可 ⇒ **下轮 17/0** ✓
★ **而它这次【先证前提】做对了**：★ 先断言"缺 `by`／缺 `note` 各具名拒"＋"三字段齐备被接受"＋"`status().declared>0`"，★ **然后才断言强制值** ✓✓

### 20.3 ★★★ 而 RULE E 又抓我一条
★ 一条断言建在**字面量数组**（`[1,2,3,4].map`，★ 恒 4 个）上 ⇒ ★ **RULE E 仍要求显式 `.length > 0`** ⇒ ★ 已加 **＋ 并写明"为什么不省：★ 让读者不必自己去证"** ✓

### 20.4 ★★ 判定
★ **覆盖债务：L3 77 · L2 15 · L1 11 · L0 0** ⇒ ★ **有人工审查 92/103 文件（89%）；★ 仅机器门禁只剩 11** ✓
★ **T1 372/372**（★ suites 312 · **probes 60**）／★ **RULE E 88/0**／★ **regen-all 16/16** ✓
★ **L1 已是个位数边缘（11）⇒ 再一轮即可清到个位数** ✓
