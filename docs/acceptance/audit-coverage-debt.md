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
★ `tests/audit-kernel-claims*.mjs`（★ 行为宣称：★ **83 模块／断言数见各探针总结行**）。

## 2. ★★★★★ 账（★ kernel 103 文件／45166 行）

| ★ 级别 | ★ 文件 | ★ 行数 | ★ 占比 |
|---|---|---|---|
| ★★ **L3 宣称级验证** | ★ **83** | ★ **35143** | ★ 77.8% |
| ★★ **L2 已逐行读** | ★ **15** | ★ **9690** | ★ 21.5% |
| ★ **L1 仅机器门禁** | ★ **5** | ★ **333** | ★ 0.7% |
| ★ **L0 未触及** | ★ **0** | ★ **0** | ★ 0% |

⇒ ★★★★ **98/103 文件（99% 行）有人工审查；★ 5 文件（1% 行）仅机器门禁覆盖** ✓

### 2.1 ★★ L3（★ 有行为断言在测其头部宣称）

  `resume.js`（1195） · `meetings.js`（1154） · `mathjobs.js`（1033） · `idempotency.js`（907） · `lean.js`（893） · `records.js`（883） · `mathtools.js`（873） · `mathadapters.js`（855） · `chat.js`（758） · `ip.js`（747） · `workflow.js`（729） · `library.js`（727） · `funding.js`（712） · `pack.js`（640） · `ballot.js`（631） · `replay.js`（627） · `meeting.js`（613） · `scheduler.js`（611） · `alerts.js`（609） · `charter.js`（598） · `conference.js`（593） · `paper.js`（586） · `ballotbox.js`（571） · `migration.js`（561） · `auditchain.js`（550） · `bidding.js`（537） · `tasks.js`（534） · `human.js`（528） · `external.js`（524） · `meetingmarker.js`（516） · `memory.js`（497） · `capacity.js`（456） · `publication.js`（435） · `minutes.js`（434） · `course.js`（429） · `panel.js`（428） · `transaction.js`（416） · `rules.js`（410） · `compliance.js`（407） · `resource.js`（386） · `retention.js`（376） · `recruit.js`（368） · `fairness.js`（303） · `notify.js`（301） · `trust.js`（290） · `collab.js`（287） · `storepolicy.js`（284） · `lifecycle.js`（270） · `grant.js`（268） · `tenure.js`（268） · `loader.js`（254） · `skills.js`（252） · `governance.js`（251） · `topology.js`（249） · `handover.js`（243） · `clockguard.js`（242） · `formal.js`（241） · `stateversion.js`（237） · `identity.js`（227） · `meetinglapse.js`（224） · `script-bridge.js`（219） · `budget.js`（216） · `audit.js`（214） · `crypto.js`（213） · `receiptbounds.js`（209） · `custody.js`（204） · `registry.js`（194） · `repropack.js`（192） · `reviewers.js`（192） · `board.js`（190） · `fidelity.js`（187） · `projmigrate.js`（181） · `reportfeedbackdelivery.js`（179） · `discipline.js`（175） · `ratelimit.js`（169） · `work.js`（165） · `math.js`（159） · `explain.js`（157） · `resumeflush.js`（152） · `library-policy.js`（143） · `partnership.js`（143） · `citations.js`（137） · `reportfeedback.js`（125）

### 2.2 ★★ L2（★ 已逐行读过或改过并复读 · ★ 声明于 `READ_MODULES`）

  `index.js`（2439，R80） · `turn/index.js`（1034，R50） · `prompt/index.js`（785，R86） · `bus.js`（753，R85） · `report.js`（628，R99） · `mailbox.js`（607，R89） · `activity.js`（547，R80） · `delegation.js`（547，R97） · `arbitration.js`（497，R97） · `metrics.js`（394，R97） · `store.js`（317，R97） · `members.js`（316，R83） · `control.js`（309，R83） · `guard.js`（293，R97） · `ids.js`（224，R97）

## 3. ★★★★★ L1 的具名余项（★ 5 文件，★ 按行数降序）

> ★ **这一列就是门 1 的剩余工作清单** —— ★ **可数、★ 具名、★ 按规模排序**。
> ★ 推进方式：★ **每轮取 2–3 个照「验证宣称」那把尺过一遍**（★ 已验证者升到 L3，★ 并把断言收进 `audit-kernel-claims*`）。

| ★ # | ★ 文件 | ★ 行数 |
|---|---|---|
| 1 | `meetingleave.js` | 96 |
| 2 | `meetingdomain.js` | 72 |
| 3 | `meetings-defaults.js` | 58 |
| 4 | `timevalue.js` | 55 |
| 5 | `contentvalue.js` | 52 |

## 4. ★★★ 这份账之外的覆盖

★ **kernel 之外**：★ `tools/` **51 个面**已按动作级核对（★ 0 缺陷）／★ `settings/schema.js` 的 **1123 键**已过静默键门禁／★ **pack 17/17 文件**已有覆盖（★ 13 逐行＋2 生成免眼审＋2 结构化审计）／★ `host*.js`（★ 定点）。
★ **真机**：★ 53 面被真实调用、★ **47/47 重点面逐面触达**、★ 39 条拒绝全部可执行、★ **结题两次独立达成**。

## 5. ★★ 明确【尚未读】的少数非 kernel 文件（★ 具名，★ 不藏）

★ `docs/landscape-similar-frameworks.md`（★ **408 行**）—— ★ **完全未读**（★ 调研文档，★ 不影响运行机制，★ 但按「不许把没读到写成没问题」，★ 在此具名）。
★ `README.md` 与 `vibe-math-vmu/docs/00–14` 各卷 —— ★ **未逐卷通读**（★ 但其**数字与链接**由 `check-docs`／`audit-doc-line-refs`／`audit-readme-counts`／`regen --check` 在管）。

## 22. ★★★★★★★ ROUND 122：第二十批 G 路 **23/0** ⇒ ★ **L1 只剩 5 个文件（★ 人工审查 98/103 ＝ 95%）**

| ★ 模块 | ★ 断言 | ★ 关键宣称 |
|---|---|---|
| ★ `math.js` | ★ 3 | ★★ **"`classifyOutcome` 把【每个】非 ok 结局标为 `isRefutation:false` —— ★ 编译失败或坏 argv 是【形式化的缺陷】，★ 不是命题的否证"** ⇒ ★ **在【3 类非 ok ＋ 1 个 ok】上测，全 false** ✓✓ ／★ **`REQUIRE_FORMALIZATION` 保持 false**（★ 决定权在 settings/middleware/packs）|
| ★ `explain.js` | ★ 5 | ★ **"超过声明上限的 reason 被【拒】而不是截断"（★ 双向）** ／★ **"理由必填而缺失 ⇒ 具名拒"** |
| ★ `resumeflush.js` | ★ 4 | ★ **"两半通过【显式端口】通信"** ⇒ ★ **缺 `snapshot({key})` 写入器 ⇒ 工厂直接拒并【点名该端口】** ／★ **"这里【失败不抛】"**（★ 宿主写入异常下 `exit()` 不抛，回布尔 `ok`）|
| ★ `library-policy.js` | ★ 3 | ★ **"纯净单元：读解析后的设置、按名拒、不碰磁盘"** ⇒ ★ 构造期 `getIndex` **0 次**读（★ 与"index 以 getter【惰性】到达"一致）／★ 两次调用后 index 逐字不变 |
| ★ `partnership.js` | ★ 4 | ★★ **"`validateInvoice()` 检查槽位【存在】，★ 但【不判断税率对错】"** ⇒ ★ **正向最关键：★ 税率 999% 但槽位齐 ⇒ 【通过】**；★ 缺槽位 ⇒ 具名拒并**点名声明键** ✓✓ |
| ★ `citations.js` | ★ 4 | ★ **"按【声明的优先级】选标识符（★ 不是先出现的那个）"** ⇒ ★ 回执 `priority` 自述 `['doi','arxiv','pmid','url']` ＋ `enforced[]` 记录该键 ✓ |
★ **累计：83 个模块、844 条断言**（★ 二十三个探针）⇒ ★ **L3 达 83/103 文件** ✓

### 22.1 ★★★★★ 而本批的核心是【两条只能单向测的宣称】
★ **math**：★ "**每个**非 ok 结局 ⇒ `isRefutation:false`" ⇒ ★ **必须跑【3 类非 ok ＋ 1 个 ok】** 才算测了"每个" ✓
★ **partnership**：★ "`validateInvoice` 只查**存在**、★ **不判断**税率对错" ⇒ ★ **只有"税率 999% 但槽位齐 ⇒ 必须【被接受】"才能证明** —— ★★ **纯负向的测法会在一个"一律拒"的模块上通过** ✓✓
⇒ ★★★ **"负向断言只能证明它拒了什么；★ 要证明它【不】拒某件事，★ 只能真的让它通过"** ✓

### 22.2 ★★★★ 而它两条【不报缺陷】的判断是对的
★ 它注意到 **畸形税号**与**无标识符的条目**都**未被拒** ⇒ ★ **而没有报缺陷** ✓
★ **理由**：★ **两者都可能需要【显式声明】（`taxIdStyle`／`allowFreeText`）才触发拒绝，★ 而那正是"零机制"的意思** ⇒ ★ **没有那份证据，★ 诚实的位置是【未验证清单】** ✓✓
⇒ ★★ **与第七批"拒绝把无法解释的红当发现"同一条纪律** ✓

### 22.3 ★★★★★ 覆盖债务（★ 里程碑）
| ★ 级别 | ★ 文件 | ★ 说明 |
|---|---|---|
| ★★ **L3 宣称级验证** | ★ **83** | ★ 有行为断言在测其头部宣称 |
| ★★ **L2 已逐行读** | ★ **15** | ★ 声明于 `READ_MODULES` |
| ★ **L1 仅机器门禁** | ★ **5** | ★ **从 77 一路降到这里** |
| ★ **L0 未触及** | ★ **0** | ★ 结构性恒为 0 |
⇒ ★★★★★ **有人工审查 98/103 文件（95%）；★ 仅机器门禁【只剩 5 个】** ✓✓

### 22.4 ★★ 判定
★ **T1 373/373**（★ suites 312 · **probes 61**）／★ **RULE E 88/0**／★ **regen-all 16/16**／★ **DOC LINT PASS** ✓
★ **A 路 29/3 未入库**（★ 3 条红的答案已在账里：★ `citations.identify({ids})`／★ `getIndex: () => new Map()`）✓
★ **下轮：★ 清掉最后 5 个 ⇒ L1 归零** ✓
