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
★ `tests/audit-kernel-claims*.mjs`（★ 行为宣称：★ **90 模块／断言数见各探针总结行**）。

## 2. ★★★★★ 账（★ kernel 108 文件／56784 行）

| ★ 级别 | ★ 文件 | ★ 行数 | ★ 占比 |
|---|---|---|---|
| ★★ **L3 宣称级验证** | ★ **90** | ★ **49051** | ★ 86.4% |
| ★★ **L2 已逐行读** | ★ **12** | ★ **6618** | ★ 11.7% |
| ★ **L1 仅机器门禁** | ★ **6** | ★ **1115** | ★ 2.0% |
| ★ **L0 未触及** | ★ **0** | ★ **0** | ★ 0% |

⇒ ★★★★ **102/108 文件（98% 行）有人工审查；★ 6 文件（2% 行）仅机器门禁覆盖** ✓

### 2.1 ★★ L3（★ 有行为断言在测其头部宣称）

  `index.js`（4651） · `turn/index.js`（4273） · `meetings.js`（3161） · `lean.js`（1253） · `resume.js`（1251） · `chat.js`（1146） · `records.js`（1100） · `mathjobs.js`（1055） · `mathtools.js`（962） · `idempotency.js`（907） · `mathadapters.js`（869） · `pack.js`（852） · `prompt/index.js`（808） · `library.js`（768） · `ip.js`（747） · `ballot.js`（729） · `workflow.js`（729） · `funding.js`（712） · `ballotbox.js`（683） · `scheduler.js`（673） · `meeting.js`（648） · `replay.js`（627） · `alerts.js`（609） · `tasks.js`（606） · `charter.js`（598） · `conference.js`（593） · `paper.js`（589） · `migration.js`（561） · `human.js`（555） · `auditchain.js`（550） · `bidding.js`（537） · `meetingmarker.js`（534） · `external.js`（524） · `memory.js`（497） · `capacity.js`（456） · `publication.js`（435） · `minutes.js`（434） · `panel.js`（434） · `course.js`（429） · `transaction.js`（416） · `rules.js`（415） · `compliance.js`（407） · `recruit.js`（391） · `resource.js`（386） · `retention.js`（379） · `fairness.js`（303） · `notify.js`（301） · `trust.js`（290） · `collab.js`（287） · `storepolicy.js`（284） · `script-bridge.js`（280） · `lifecycle.js`（270） · `tenure.js`（268） · `loader.js`（265） · `skills.js`（252） · `governance.js`（251） · `topology.js`（249） · `handover.js`（243） · `clockguard.js`（242） · `formal.js`（241） · `math.js`（241） · `stateversion.js`（237） · `receiptbounds.js`（229） · `identity.js`（227） · `meetinglapse.js`（224） · `audit.js`（217） · `budget.js`（216） · `crypto.js`（213） · `custody.js`（204） · `fidelity.js`（202） · `reportfeedbackdelivery.js`（201） · `registry.js`（194） · `repropack.js`（192） · `reviewers.js`（192） · `board.js`（190） · `projmigrate.js`（181） · `discipline.js`（175） · `ratelimit.js`（169） · `work.js`（165） · `explain.js`（157） · `resumeflush.js`（152） · `library-policy.js`（143） · `partnership.js`（143） · `citations.js`（137） · `reportfeedback.js`（131） · `meetingleave.js`（96） · `meetings-defaults.js`（79） · `meetingdomain.js`（72） · `timevalue.js`（55） · `contentvalue.js`（52）

### 2.2 ★★ L2（★ 已逐行读过或改过并复读 · ★ 声明于 `READ_MODULES`）

  `mailbox.js`（1240，R89） · `bus.js`（950，R85） · `report.js`（648，R99） · `store.js`（561，R97） · `activity.js`（551，R80） · `delegation.js`（547，R97） · `arbitration.js`（497，R97） · `metrics.js`（394，R97） · `members.js`（390，R83） · `control.js`（323，R83） · `guard.js`（293，R97） · `ids.js`（224，R97）

## 3. ★★★★★ L1 的具名余项（★ 6 文件，★ 按行数降序）

> ★ **这一列就是门 1 的剩余工作清单** —— ★ **可数、★ 具名、★ 按规模排序**。
> ★ 推进方式：★ **每轮取 2–3 个照「验证宣称」那把尺过一遍**（★ 已验证者升到 L3，★ 并把断言收进 `audit-kernel-claims*`）。

| ★ # | ★ 文件 | ★ 行数 |
|---|---|---|
| 1 | `meetingverdict.js` | 447 |
| 2 | `latex.js` | 189 |
| 3 | `memberface.js` | 188 |
| 4 | `env.js` | 150 |
| 5 | `reporttransport.js` | 89 |
| 6 | `settings-defaults.js` | 52 |

## 4. ★★★ 这份账之外的覆盖

★ **kernel 之外**：★ `tools/` **51 个面**已按动作级核对（★ 0 缺陷）／★ `settings/schema.js` 的 **1123 键**已过静默键门禁／★ **pack 17/17 文件**已有覆盖（★ 13 逐行＋2 生成免眼审＋2 结构化审计）／★ `host*.js`（★ 定点）。
★ **真机**：★ 53 面被真实调用、★ **47/47 重点面逐面触达**、★ 39 条拒绝全部可执行、★ **结题两次独立达成**。

## 5. ★★ 明确【尚未读】的少数非 kernel 文件（★ 具名，★ 不藏）

★ `docs/landscape-similar-frameworks.md`（★ **408 行**）—— ★ **完全未读**（★ 调研文档，★ 不影响运行机制，★ 但按「不许把没读到写成没问题」，★ 在此具名）。
★ `README.md` 与 `vibe-math-vmu/docs/00–14` 各卷 —— ★ **未逐卷通读**（★ 但其**数字与链接**由 `check-docs`／`audit-doc-line-refs`／`audit-readme-counts`／`regen --check` 在管）。
