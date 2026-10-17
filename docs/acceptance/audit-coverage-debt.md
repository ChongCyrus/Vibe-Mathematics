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
★ `tests/audit-kernel-claims*.mjs`（★ 行为宣称：★ **20 模块／断言数见各探针总结行**）。

## 2. ★★★★★ 账（★ kernel 103 文件／45139 行）

| ★ 级别 | ★ 文件 | ★ 行数 | ★ 占比 |
|---|---|---|---|
| ★★ **L3 宣称级验证** | ★ **20** | ★ **15169** | ★ 33.6% |
| ★★ **L2 已逐行读** | ★ **15** | ★ **9690** | ★ 21.5% |
| ★ **L1 仅机器门禁** | ★ **68** | ★ **20280** | ★ 44.9% |
| ★ **L0 未触及** | ★ **0** | ★ **0** | ★ 0% |

⇒ ★★★★ **35/103 文件（55% 行）有人工审查；★ 68 文件（45% 行）仅机器门禁覆盖** ✓

### 2.1 ★★ L3（★ 有行为断言在测其头部宣称）

  `resume.js`（1195） · `meetings.js`（1154） · `mathjobs.js`（1033） · `idempotency.js`（907） · `lean.js`（893） · `records.js`（883） · `mathtools.js`（873） · `mathadapters.js`（855） · `chat.js`（758） · `ip.js`（747） · `workflow.js`（729） · `library.js`（727） · `funding.js`（712） · `pack.js`（640） · `ballot.js`（631） · `replay.js`（627） · `scheduler.js`（611） · `alerts.js`（609） · `transaction.js`（416） · `ratelimit.js`（169）

### 2.2 ★★ L2（★ 已逐行读过或改过并复读 · ★ 声明于 `READ_MODULES`）

  `index.js`（2439，R80） · `turn/index.js`（1034，R50） · `prompt/index.js`（785，R86） · `bus.js`（753，R85） · `report.js`（628，R99） · `mailbox.js`（607，R89） · `activity.js`（547，R80） · `delegation.js`（547，R97） · `arbitration.js`（497，R97） · `metrics.js`（394，R97） · `store.js`（317，R97） · `members.js`（316，R83） · `control.js`（309，R83） · `guard.js`（293，R97） · `ids.js`（224，R97）

## 3. ★★★★★ L1 的具名余项（★ 68 文件，★ 按行数降序）

> ★ **这一列就是门 1 的剩余工作清单** —— ★ **可数、★ 具名、★ 按规模排序**。
> ★ 推进方式：★ **每轮取 2–3 个照「验证宣称」那把尺过一遍**（★ 已验证者升到 L3，★ 并把断言收进 `audit-kernel-claims*`）。

| ★ # | ★ 文件 | ★ 行数 |
|---|---|---|
| 1 | `meeting.js` | 613 |
| 2 | `charter.js` | 598 |
| 3 | `conference.js` | 593 |
| 4 | `paper.js` | 586 |
| 5 | `ballotbox.js` | 571 |
| 6 | `migration.js` | 561 |
| 7 | `auditchain.js` | 550 |
| 8 | `bidding.js` | 537 |
| 9 | `tasks.js` | 534 |
| 10 | `human.js` | 528 |
| 11 | `external.js` | 524 |
| 12 | `meetingmarker.js` | 516 |
| 13 | `memory.js` | 497 |
| 14 | `capacity.js` | 456 |
| 15 | `publication.js` | 435 |
| 16 | `minutes.js` | 434 |
| 17 | `course.js` | 429 |
| 18 | `panel.js` | 428 |
| 19 | `compliance.js` | 407 |
| 20 | `rules.js` | 395 |
| 21 | `resource.js` | 386 |
| 22 | `retention.js` | 376 |
| 23 | `recruit.js` | 360 |
| 24 | `fairness.js` | 303 |
| 25 | `notify.js` | 301 |
| 26 | `trust.js` | 290 |
| 27 | `collab.js` | 287 |
| 28 | `storepolicy.js` | 284 |
| 29 | `lifecycle.js` | 270 |
| 30 | `grant.js` | 268 |
| 31 | `tenure.js` | 268 |
| 32 | `loader.js` | 254 |
| 33 | `skills.js` | 252 |
| 34 | `governance.js` | 251 |
| 35 | `topology.js` | 249 |
| 36 | `handover.js` | 243 |
| 37 | `formal.js` | 241 |
| 38 | `clockguard.js` | 238 |
| 39 | `stateversion.js` | 237 |
| 40 | `identity.js` | 227 |
| 41 | `meetinglapse.js` | 224 |
| 42 | `script-bridge.js` | 219 |
| 43 | `budget.js` | 216 |
| 44 | `audit.js` | 214 |
| 45 | `crypto.js` | 213 |
| 46 | `receiptbounds.js` | 209 |
| 47 | `custody.js` | 204 |
| 48 | `registry.js` | 194 |
| 49 | `repropack.js` | 192 |
| 50 | `reviewers.js` | 192 |
| 51 | `board.js` | 190 |
| 52 | `fidelity.js` | 187 |
| 53 | `projmigrate.js` | 181 |
| 54 | `reportfeedbackdelivery.js` | 179 |
| 55 | `discipline.js` | 175 |
| 56 | `work.js` | 165 |
| 57 | `math.js` | 159 |
| 58 | `explain.js` | 157 |
| 59 | `resumeflush.js` | 152 |
| 60 | `library-policy.js` | 143 |
| 61 | `partnership.js` | 143 |
| 62 | `citations.js` | 137 |
| 63 | `reportfeedback.js` | 125 |
| 64 | `meetingleave.js` | 96 |
| 65 | `meetingdomain.js` | 72 |
| 66 | `meetings-defaults.js` | 58 |
| 67 | `timevalue.js` | 55 |
| 68 | `contentvalue.js` | 52 |

## 4. ★★★ 这份账之外的覆盖

★ **kernel 之外**：★ `tools/` **51 个面**已按动作级核对（★ 0 缺陷）／★ `settings/schema.js` 的 **1123 键**已过静默键门禁／★ **pack 17/17 文件**已有覆盖（★ 13 逐行＋2 生成免眼审＋2 结构化审计）／★ `host*.js`（★ 定点）。
★ **真机**：★ 53 面被真实调用、★ **47/47 重点面逐面触达**、★ 39 条拒绝全部可执行、★ **结题两次独立达成**。

## 5. ★★ 明确【尚未读】的少数非 kernel 文件（★ 具名，★ 不藏）

★ `docs/landscape-similar-frameworks.md`（★ **408 行**）—— ★ **完全未读**（★ 调研文档，★ 不影响运行机制，★ 但按「不许把没读到写成没问题」，★ 在此具名）。
★ `README.md` 与 `vibe-math-vmu/docs/00–14` 各卷 —— ★ **未逐卷通读**（★ 但其**数字与链接**由 `check-docs`／`audit-doc-line-refs`／`audit-readme-counts`／`regen --check` 在管）。
