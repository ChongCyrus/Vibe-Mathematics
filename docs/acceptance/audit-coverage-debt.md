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
★ `tests/audit-kernel-claims*.mjs`（★ 行为宣称：★ **64 模块／断言数见各探针总结行**）。

## 2. ★★★★★ 账（★ kernel 103 文件／45166 行）

| ★ 级别 | ★ 文件 | ★ 行数 | ★ 占比 |
|---|---|---|---|
| ★★ **L3 宣称级验证** | ★ **64** | ★ **31846** | ★ 70.5% |
| ★★ **L2 已逐行读** | ★ **15** | ★ **9690** | ★ 21.5% |
| ★ **L1 仅机器门禁** | ★ **24** | ★ **3630** | ★ 8.0% |
| ★ **L0 未触及** | ★ **0** | ★ **0** | ★ 0% |

⇒ ★★★★ **79/103 文件（92% 行）有人工审查；★ 24 文件（8% 行）仅机器门禁覆盖** ✓

### 2.1 ★★ L3（★ 有行为断言在测其头部宣称）

  `resume.js`（1195） · `meetings.js`（1154） · `mathjobs.js`（1033） · `idempotency.js`（907） · `lean.js`（893） · `records.js`（883） · `mathtools.js`（873） · `mathadapters.js`（855） · `chat.js`（758） · `ip.js`（747） · `workflow.js`（729） · `library.js`（727） · `funding.js`（712） · `pack.js`（640） · `ballot.js`（631） · `replay.js`（627） · `meeting.js`（613） · `scheduler.js`（611） · `alerts.js`（609） · `charter.js`（598） · `conference.js`（593） · `paper.js`（586） · `ballotbox.js`（571） · `migration.js`（561） · `auditchain.js`（550） · `bidding.js`（537） · `tasks.js`（534） · `human.js`（528） · `external.js`（524） · `meetingmarker.js`（516） · `memory.js`（497） · `capacity.js`（456） · `publication.js`（435） · `minutes.js`（434） · `course.js`（429） · `panel.js`（428） · `transaction.js`（416） · `rules.js`（410） · `compliance.js`（407） · `resource.js`（386） · `retention.js`（376） · `recruit.js`（368） · `fairness.js`（303） · `notify.js`（301） · `trust.js`（290） · `collab.js`（287） · `storepolicy.js`（284） · `lifecycle.js`（270） · `grant.js`（268） · `tenure.js`（268） · `loader.js`（254） · `skills.js`（252） · `governance.js`（251） · `topology.js`（249） · `handover.js`（243） · `clockguard.js`（242） · `formal.js`（241） · `stateversion.js`（237） · `identity.js`（227） · `meetinglapse.js`（224） · `script-bridge.js`（219） · `budget.js`（216） · `audit.js`（214） · `ratelimit.js`（169）

### 2.2 ★★ L2（★ 已逐行读过或改过并复读 · ★ 声明于 `READ_MODULES`）

  `index.js`（2439，R80） · `turn/index.js`（1034，R50） · `prompt/index.js`（785，R86） · `bus.js`（753，R85） · `report.js`（628，R99） · `mailbox.js`（607，R89） · `activity.js`（547，R80） · `delegation.js`（547，R97） · `arbitration.js`（497，R97） · `metrics.js`（394，R97） · `store.js`（317，R97） · `members.js`（316，R83） · `control.js`（309，R83） · `guard.js`（293，R97） · `ids.js`（224，R97）

## 3. ★★★★★ L1 的具名余项（★ 24 文件，★ 按行数降序）

> ★ **这一列就是门 1 的剩余工作清单** —— ★ **可数、★ 具名、★ 按规模排序**。
> ★ 推进方式：★ **每轮取 2–3 个照「验证宣称」那把尺过一遍**（★ 已验证者升到 L3，★ 并把断言收进 `audit-kernel-claims*`）。

| ★ # | ★ 文件 | ★ 行数 |
|---|---|---|
| 1 | `crypto.js` | 213 |
| 2 | `receiptbounds.js` | 209 |
| 3 | `custody.js` | 204 |
| 4 | `registry.js` | 194 |
| 5 | `repropack.js` | 192 |
| 6 | `reviewers.js` | 192 |
| 7 | `board.js` | 190 |
| 8 | `fidelity.js` | 187 |
| 9 | `projmigrate.js` | 181 |
| 10 | `reportfeedbackdelivery.js` | 179 |
| 11 | `discipline.js` | 175 |
| 12 | `work.js` | 165 |
| 13 | `math.js` | 159 |
| 14 | `explain.js` | 157 |
| 15 | `resumeflush.js` | 152 |
| 16 | `library-policy.js` | 143 |
| 17 | `partnership.js` | 143 |
| 18 | `citations.js` | 137 |
| 19 | `reportfeedback.js` | 125 |
| 20 | `meetingleave.js` | 96 |
| 21 | `meetingdomain.js` | 72 |
| 22 | `meetings-defaults.js` | 58 |
| 23 | `timevalue.js` | 55 |
| 24 | `contentvalue.js` | 52 |

## 4. ★★★ 这份账之外的覆盖

★ **kernel 之外**：★ `tools/` **51 个面**已按动作级核对（★ 0 缺陷）／★ `settings/schema.js` 的 **1123 键**已过静默键门禁／★ **pack 17/17 文件**已有覆盖（★ 13 逐行＋2 生成免眼审＋2 结构化审计）／★ `host*.js`（★ 定点）。
★ **真机**：★ 53 面被真实调用、★ **47/47 重点面逐面触达**、★ 39 条拒绝全部可执行、★ **结题两次独立达成**。

## 5. ★★ 明确【尚未读】的少数非 kernel 文件（★ 具名，★ 不藏）

★ `docs/landscape-similar-frameworks.md`（★ **408 行**）—— ★ **完全未读**（★ 调研文档，★ 不影响运行机制，★ 但按「不许把没读到写成没问题」，★ 在此具名）。
★ `README.md` 与 `vibe-math-vmu/docs/00–14` 各卷 —— ★ **未逐卷通读**（★ 但其**数字与链接**由 `check-docs`／`audit-doc-line-refs`／`audit-readme-counts`／`regen --check` 在管）。

## 17. ★★★★★ ROUND 118：第十六批 C 路 **35/0**（★ L3 达 64、L1 降到 24）

### 17.1 ★★★ 四个模块升 L3
| ★ 模块 | ★ 断言 | ★ 关键宣称 |
|---|---|---|
| ★ `meetinglapse.js` | ★ 9 | ★ **"每个函数都纯"在【4 个纯函数 × 2 次运行】上测**（★ 逐字相同 ＋ 源码无时钟/随机）／★ **bounded／named／explained／timestamped／revocable 五面在【3 组 now/limit】上齐**／★ **可撤销【双向】**：无理由 ⇒ `VMU_REASON_REQUIRED`（"an unexplained revocation is unauditable"）／有理由 ⇒ 记录落 `revokedAt`/`revokeReason` |
| ★ `script-bridge.js` | ★ 10 | ★★ **"dry-run 真的没跑"⇒ `plan()` 后【spawn 计数 0】，★ `run()` 后 > 0（★ 正向对照）**／★ **非零退出是【结果】不是异常**（双向）／★ **只有超时是【具名硬失败】**／★ **`parseResult` 对空/非 JSON/缺 `ok` 一律具名拒** |
| ★ `budget.js` | ★ 8 | ★ **零配置＝无限且从不抛**／★ **具名拒绝带 `used`/`limit`**（★ 实测 `used=11 limit=10`）／★ **`list()` 截断被计数**（★ **前置：确实有 2 个作用域**）／★ **`remaining`/`status`/`list` 不变更** |
| ★ `audit.js` | ★ 8 | ★ **"存前脱敏"在【3 个点】测**（嵌套/大小写/数组）＋★ **正向：干净行原样**／★ **环引用 ⇒ `[circular]`**／★ **不导出任何变更/删除入口**／★ **"每次环/上限丢弃都被计数"**（★ **前置：4 次写入都成功**）|
★ **累计：64 个模块、739 条断言**（★ 十九个探针）⇒ ★ **L3 达 64/103 文件** ✓

### 17.2 ★★★ 而它的两处**测量错**正是本阶段教训的复用
★ ① 它先把 **"REVOCABLE"** 读成"撤销后规则会重新到期" ⇒ ★ 模块说不是 —— ★ **那正是头注 "NOTHING SETTLES BY ITSELF" 的意思** ⇒ ★ **它把断言移到【撤销真正落脚的那个记录面】** ✓
★ ② ★ **它没有去数源码里的 `Date.now` 出现次数**（★ 因为上一轮已证明那个数会被并行改动打翻）⇒ ★ **改用结构事实（是否 import fs）＋ 行为断言** ✓
⇒ ★★★ **"上一轮的错，★ 下一轮就变成了纪律"** ✓

### 17.3 ★★ 一处观察（★ 未定性，★ 不报缺陷）
★ `script-bridge.parseResult` 对空/非 JSON/缺 `ok` 都 `refuse('VMU_INVALID_ARGUMENT')`，★ **而 `run()` 会按失败策略把它折成 `{ok:false}` 结果** ⇒ ★ **"自由文本 ⇒ 具名拒"这一条【取决于失败策略】** ⇒ ★ **它没有确认策略面，故不报缺陷** ✓

### 17.4 ★★ 判定
★ **A 路 27/4 仍未入库**（★ 4 条红的答案已在 §17.2/R117 的账里：★ `code` 而非 `exitCode`／★ 公理扫**源码**而非 stdout）✓
★ **覆盖债务：L3 64 · L2 15 · L1 24 · L0 0** ⇒ ★ **有人工审查 79/103 文件；★ 仅机器门禁降到 24** ✓
★ **T1 369/369**（★ suites 312 · **probes 57**）／★ **RULE E 88/0**／★ **regen-all 16/16** ✓
