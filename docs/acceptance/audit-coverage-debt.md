# 覆盖债务台账 · **kernel 逐文件的三级审查账**（Round 105）

> ★ 这一篇要解决一件事：★ **门 1 说「源码级全树检查」—— ★ 而「全树」不能靠宣称，★ 只能靠【可数的账】**。
> ★ 因此**每个 kernel 模块都被标上它【真正受到过】的审查级别**，★ **余项是一个数字，★ 不是一种感觉**。

## 1. ★★★ 三级口径

| ★ 级别 | ★ 含义 |
|---|---|
| ★★ **L3 宣称级验证** | ★ `tests/audit-kernel-claims*.mjs` 里有断言在测**它自己头部的一句话** |
| ★★ **L2 已读** | ★ 本阶段**逐行读过**，或改过并复读过 |
| ★ **L1 仅机器门禁** | ★ **没有人读过**，★ 但**全树可判定门禁**覆盖它（★ 悬空调用／★ 面动作／★ 静默键／★ RULE E 断言判据／★ docs lint／★ 派生同步）|
| ★ **L0 未触及** | ★ 以上皆无 |

★★ **重要**：★ **L1 不是「没检查」** —— ★ 它是**「有一套判据明确、结果可复算的检查覆盖了它，★ 只是没人逐行读」**。
★ 本阶段**新增的四道自建门禁**正是为了把 L1 从「未知」变成「有判据覆盖」：
★ `tests/audit-service-calls.mjs`（★ 调用侧：`kernel.<服务>.<方法>` 必须可解析，★ **87 服务 × 213 文件**）／
★ `tests/audit-face-actions.mjs`（★ 面侧：★ 每个提供的动作必须存在或有分支，★ **51 面／47 enum**）／
★ `tests/audit-silent-keys.mjs`（★ 设置键：★ 不得「既无人读也未被裁定」，★ **640 文件**）／
★ `tests/audit-kernel-claims*.mjs`（★ 行为宣称，★ **8 模块 81 条**）。

## 2. ★★★★★ 账（★ kernel 「 + files.length + 」 文件／「 + total + 」 行）

| ★ 级别 | ★ 文件 | ★ 行数 | ★ 占比 |
|---|---|---|---|
| ★★ **L3 宣称级验证** | ★ **「 + by(」L3「).length + 」** | ★ **「 + sum(by(」L3「)) + 」** | ★ 「 + (100 * sum(by(」L3「)) / total).toFixed(1) + 」% |
| ★★ **L2 已逐行读** | ★ **「 + by(」L2「).length + 」** | ★ **「 + sum(by(」L2「)) + 」** | ★ 「 + (100 * sum(by(」L2「)) / total).toFixed(1) + 」% |
| ★ **L1 仅机器门禁** | ★ **「 + l1.length + 」** | ★ **「 + sum(l1) + 」** | ★ 「 + (100 * sum(l1) / total).toFixed(1) + 」% |
| ★ **L0 未触及** | ★ **0** | ★ **0** | ★ 0% |

⇒ ★★★★ **「 + (by(」L3「).length + by(」L2「).length) + 」/「 + files.length + 」 文件（「 + (100 * (sum(by(」L3「)) + sum(by(」L2「))) / total).toFixed(0) + 」% 行）有人工审查；★ 「 + l1.length + 」 文件（「 + (100 * sum(l1) / total).toFixed(0) + 」% 行）仅机器门禁覆盖** ✓

### 2.1 ★★ L3（★ 有行为断言在测其头部宣称）

  resume.js（1195） · mathjobs.js（1033） · idempotency.js（907） · lean.js（893） · records.js（883） · scheduler.js（611） · transaction.js（416） · ratelimit.js（169）

### 2.2 ★★ L2（★ 已逐行读过或改过并复读）

  index.js（2439） · meetings.js（1154） · turn/index.js（1034） · prompt/index.js（785） · chat.js（758） · bus.js（753） · ballot.js（631） · report.js（628） · mailbox.js（607） · activity.js（547） · delegation.js（547） · arbitration.js（497） · metrics.js（394） · store.js（317） · members.js（316） · control.js（309） · guard.js（293） · ids.js（224）

## 3. ★★★★★ L1 的具名余项（★ 「 + l1.length + 」 文件，★ 按行数降序）

> ★ **这一列就是门 1 的剩余工作清单** —— ★ 它**可数、★ 具名、★ 按规模排序**，★ 而不是一句「还有不少没读」。
> ★ 推进方式：★ **每轮取 2–3 个照「验证宣称」那把尺过一遍**（★ 已验证者升到 L3），★ 并**把断言收进 `audit-kernel-claims*`**。

| ★ # | ★ 文件 | ★ 行数 |
|---|---|---|
| 1 | `mathtools.js` | 868 |
| 2 | `mathadapters.js` | 855 |
| 3 | `ip.js` | 742 |
| 4 | `workflow.js` | 729 |
| 5 | `library.js` | 727 |
| 6 | `funding.js` | 712 |
| 7 | `pack.js` | 640 |
| 8 | `replay.js` | 627 |
| 9 | `meeting.js` | 613 |
| 10 | `alerts.js` | 609 |
| 11 | `charter.js` | 598 |
| 12 | `conference.js` | 593 |
| 13 | `paper.js` | 586 |
| 14 | `ballotbox.js` | 571 |
| 15 | `migration.js` | 561 |
| 16 | `auditchain.js` | 550 |
| 17 | `bidding.js` | 537 |
| 18 | `tasks.js` | 534 |
| 19 | `human.js` | 528 |
| 20 | `external.js` | 524 |
| 21 | `meetingmarker.js` | 516 |
| 22 | `memory.js` | 497 |
| 23 | `capacity.js` | 456 |
| 24 | `publication.js` | 435 |
| 25 | `minutes.js` | 434 |
| 26 | `course.js` | 429 |
| 27 | `panel.js` | 428 |
| 28 | `compliance.js` | 407 |
| 29 | `rules.js` | 395 |
| 30 | `resource.js` | 386 |
| 31 | `retention.js` | 376 |
| 32 | `recruit.js` | 360 |
| 33 | `fairness.js` | 303 |
| 34 | `notify.js` | 301 |
| 35 | `trust.js` | 290 |
| 36 | `collab.js` | 287 |
| 37 | `storepolicy.js` | 284 |
| 38 | `lifecycle.js` | 270 |
| 39 | `grant.js` | 268 |
| 40 | `tenure.js` | 268 |
| 41 | `loader.js` | 254 |
| 42 | `skills.js` | 252 |
| 43 | `governance.js` | 251 |
| 44 | `topology.js` | 249 |
| 45 | `handover.js` | 243 |
| 46 | `formal.js` | 241 |
| 47 | `clockguard.js` | 238 |
| 48 | `stateversion.js` | 237 |
| 49 | `identity.js` | 227 |
| 50 | `meetinglapse.js` | 224 |
| 51 | `script-bridge.js` | 219 |
| 52 | `budget.js` | 216 |
| 53 | `audit.js` | 214 |
| 54 | `crypto.js` | 213 |
| 55 | `receiptbounds.js` | 209 |
| 56 | `custody.js` | 204 |
| 57 | `registry.js` | 194 |
| 58 | `repropack.js` | 192 |
| 59 | `reviewers.js` | 192 |
| 60 | `board.js` | 190 |
| 61 | `fidelity.js` | 187 |
| 62 | `projmigrate.js` | 181 |
| 63 | `reportfeedbackdelivery.js` | 179 |
| 64 | `discipline.js` | 175 |
| 65 | `work.js` | 165 |
| 66 | `math.js` | 159 |
| 67 | `explain.js` | 157 |
| 68 | `resumeflush.js` | 152 |
| 69 | `library-policy.js` | 143 |
| 70 | `partnership.js` | 143 |
| 71 | `citations.js` | 137 |
| 72 | `reportfeedback.js` | 125 |
| 73 | `meetingleave.js` | 96 |
| 74 | `meetingdomain.js` | 72 |
| 75 | `meetings-defaults.js` | 58 |
| 76 | `timevalue.js` | 55 |
| 77 | `contentvalue.js` | 52 |

## 4. ★★★ 这份账之外的覆盖（★ 不在这 「 + files.length + 」 个文件里）

★ **kernel 之外**：★ `tools/` **51 个面**已按动作级核对（★ 0 缺陷）／★ `settings/schema.js` 的 **1123 键**已过静默键门禁／★ **pack 17/17 文件**已有覆盖（★ 13 逐行＋2 生成免眼审＋2 结构化审计）／★ `host*.js`（★ 定点）／★ `docs/landscape-similar-frameworks.md`（★ 见下方具名未读）。
★ **真机**：★ 53 面被真实调用、★ **47/47 重点面逐面触达**、★ 39 条拒绝全部可执行、★ **结题两次独立达成**。

## 5. ★★ 明确【尚未读】的少数非 kernel 文件（★ 具名，★ 不藏）

★ `docs/landscape-similar-frameworks.md`（★ **408 行**）—— ★ **完全未读**（★ 它是调研文档，★ 不影响运行机制，★ 但按「不许把没读到写成没问题」，★ 在此具名）。
★ `README.md` 与 `vibe-math-vmu/docs/00–14` 各卷 —— ★ **未逐卷通读**（★ 但 `check-docs`（★ DOC LINT PASS）＋ `audit-doc-line-refs` ＋ `audit-readme-counts` ＋ `regen --check` 在管其**数字与链接的一致性**）。
