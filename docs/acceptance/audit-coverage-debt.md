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
★ `tests/audit-kernel-claims*.mjs`（★ 行为宣称：★ **72 模块／断言数见各探针总结行**）。

## 2. ★★★★★ 账（★ kernel 103 文件／45166 行）

| ★ 级别 | ★ 文件 | ★ 行数 | ★ 占比 |
|---|---|---|---|
| ★★ **L3 宣称级验证** | ★ **72** | ★ **33427** | ★ 74.0% |
| ★★ **L2 已逐行读** | ★ **15** | ★ **9690** | ★ 21.5% |
| ★ **L1 仅机器门禁** | ★ **16** | ★ **2049** | ★ 4.5% |
| ★ **L0 未触及** | ★ **0** | ★ **0** | ★ 0% |

⇒ ★★★★ **87/103 文件（95% 行）有人工审查；★ 16 文件（5% 行）仅机器门禁覆盖** ✓

### 2.1 ★★ L3（★ 有行为断言在测其头部宣称）

  `resume.js`（1195） · `meetings.js`（1154） · `mathjobs.js`（1033） · `idempotency.js`（907） · `lean.js`（893） · `records.js`（883） · `mathtools.js`（873） · `mathadapters.js`（855） · `chat.js`（758） · `ip.js`（747） · `workflow.js`（729） · `library.js`（727） · `funding.js`（712） · `pack.js`（640） · `ballot.js`（631） · `replay.js`（627） · `meeting.js`（613） · `scheduler.js`（611） · `alerts.js`（609） · `charter.js`（598） · `conference.js`（593） · `paper.js`（586） · `ballotbox.js`（571） · `migration.js`（561） · `auditchain.js`（550） · `bidding.js`（537） · `tasks.js`（534） · `human.js`（528） · `external.js`（524） · `meetingmarker.js`（516） · `memory.js`（497） · `capacity.js`（456） · `publication.js`（435） · `minutes.js`（434） · `course.js`（429） · `panel.js`（428） · `transaction.js`（416） · `rules.js`（410） · `compliance.js`（407） · `resource.js`（386） · `retention.js`（376） · `recruit.js`（368） · `fairness.js`（303） · `notify.js`（301） · `trust.js`（290） · `collab.js`（287） · `storepolicy.js`（284） · `lifecycle.js`（270） · `grant.js`（268） · `tenure.js`（268） · `loader.js`（254） · `skills.js`（252） · `governance.js`（251） · `topology.js`（249） · `handover.js`（243） · `clockguard.js`（242） · `formal.js`（241） · `stateversion.js`（237） · `identity.js`（227） · `meetinglapse.js`（224） · `script-bridge.js`（219） · `budget.js`（216） · `audit.js`（214） · `crypto.js`（213） · `receiptbounds.js`（209） · `custody.js`（204） · `registry.js`（194） · `repropack.js`（192） · `reviewers.js`（192） · `board.js`（190） · `fidelity.js`（187） · `ratelimit.js`（169）

### 2.2 ★★ L2（★ 已逐行读过或改过并复读 · ★ 声明于 `READ_MODULES`）

  `index.js`（2439，R80） · `turn/index.js`（1034，R50） · `prompt/index.js`（785，R86） · `bus.js`（753，R85） · `report.js`（628，R99） · `mailbox.js`（607，R89） · `activity.js`（547，R80） · `delegation.js`（547，R97） · `arbitration.js`（497，R97） · `metrics.js`（394，R97） · `store.js`（317，R97） · `members.js`（316，R83） · `control.js`（309，R83） · `guard.js`（293，R97） · `ids.js`（224，R97）

## 3. ★★★★★ L1 的具名余项（★ 16 文件，★ 按行数降序）

> ★ **这一列就是门 1 的剩余工作清单** —— ★ **可数、★ 具名、★ 按规模排序**。
> ★ 推进方式：★ **每轮取 2–3 个照「验证宣称」那把尺过一遍**（★ 已验证者升到 L3，★ 并把断言收进 `audit-kernel-claims*`）。

| ★ # | ★ 文件 | ★ 行数 |
|---|---|---|
| 1 | `projmigrate.js` | 181 |
| 2 | `reportfeedbackdelivery.js` | 179 |
| 3 | `discipline.js` | 175 |
| 4 | `work.js` | 165 |
| 5 | `math.js` | 159 |
| 6 | `explain.js` | 157 |
| 7 | `resumeflush.js` | 152 |
| 8 | `library-policy.js` | 143 |
| 9 | `partnership.js` | 143 |
| 10 | `citations.js` | 137 |
| 11 | `reportfeedback.js` | 125 |
| 12 | `meetingleave.js` | 96 |
| 13 | `meetingdomain.js` | 72 |
| 14 | `meetings-defaults.js` | 58 |
| 15 | `timevalue.js` | 55 |
| 16 | `contentvalue.js` | 52 |

## 4. ★★★ 这份账之外的覆盖

★ **kernel 之外**：★ `tools/` **51 个面**已按动作级核对（★ 0 缺陷）／★ `settings/schema.js` 的 **1123 键**已过静默键门禁／★ **pack 17/17 文件**已有覆盖（★ 13 逐行＋2 生成免眼审＋2 结构化审计）／★ `host*.js`（★ 定点）。
★ **真机**：★ 53 面被真实调用、★ **47/47 重点面逐面触达**、★ 39 条拒绝全部可执行、★ **结题两次独立达成**。

## 5. ★★ 明确【尚未读】的少数非 kernel 文件（★ 具名，★ 不藏）

★ `docs/landscape-similar-frameworks.md`（★ **408 行**）—— ★ **完全未读**（★ 调研文档，★ 不影响运行机制，★ 但按「不许把没读到写成没问题」，★ 在此具名）。
★ `README.md` 与 `vibe-math-vmu/docs/00–14` 各卷 —— ★ **未逐卷通读**（★ 但其**数字与链接**由 `check-docs`／`audit-doc-line-refs`／`audit-readme-counts`／`regen --check` 在管）。

## 19. ★★★★★ ROUND 120：第十八批 E 路 **29/0**（★ L3 达 72、L1 只剩 16）

| ★ 模块 | ★ 断言 | ★ 关键宣称 |
|---|---|---|
| ★ `repropack.js` | ★ 7 | ★ "**缺必填成员 ⇒ 具名拒并【点名】**"在 **3 个缺失组合**上测（★ 每处都点名缺的成员）／★ **缺种子 ⇒ `VMU_MATH_SEED_REQUIRED`**／★ **数据默认只存指针**（`pointerMode:true`）／★ `list`/`status` 纯读 |
| ★ `reviewers.js` | ★ 7 | ★ **"未声明 mode ⇒ 内核不替调用方选"**／★ **COI 双向**：有冲突 ⇒ `VMU_COI_VIOLATION`／无冲突 ⇒ 通过 ／★ **"每次解绑必须留痕"双向**：无理由 ⇒ 拒／带理由＋作者 ⇒ 通过 ／★ **并发上限**（★ 前置：第一次成功）|
| ★ `board.js` | ★ 7 | ★ **"未配置 ⇒ 零机制"三点同时**：`configured:false`＋无列＋**移动具名拒且不裸抛** ／★ **WIP 上限 ⇒ `VMU_WORKFLOW_WIP_LIMIT`** ／★ **读面只读** |
| ★ `fidelity.js` | ★ 8 | ★ **缺 `target`/`by`/`note` 在【3 个点】各具名拒**，★ 且**每条带数组 `enforced` ＋作用域** ／★ **"append-only"**（★ 两次声明后留痕 ≥2）／★ **"永远不是反证"在【2 张票】上**（true／false 皆 `isRefutation:false`）／★ **无 fs 缝 ⇒ `durable:false` 具名** |
★ **累计：72 个模块、798 条断言**（★ 二十一个探针）⇒ ★ **L3 达 72/103 文件** ✓

### 19.1 ★★★★ 而它的一处**差点误报**是本阶段最常见的失败方式
★ `fidelity` 的 "append-only" 断言**差点被判为坏** —— 因为 **`view({target})` 只回一条** ✓
★ **纠正**：★ **`view({target})` 是【per-target 视图】，★ 而留痕在 `trail()`** ⇒ ★ **改读 `trail()` 后条数 ≥ 2** ✓✓
⇒ ★★★ **"为问题读错了【面】—— ★ 这已是本阶段断言对正确模块失败的最常见方式，★ 而解法每次都一样：★ 判断答案之前，★ 先问这条宣称说的是【哪个面】"** ✓

### 19.2 ★★ 而 A 路 39/2（★ 17A 的 7 条**全绿**）
★ 它按账里"解包字符串"的答案修好了 **5 条** ⇒ ★ **`JSON.parse(boundedToolResult(x))` 后 `receiptMeta` 五键、`elided[0]` 八键、`keptBytes<bytes` 全对** ✓
★ 余 2 条红：★★ **它未先证"缺陷已登记"就去断言强制弃权**（★ `applyAbstention` 返回 `enforced:false`）⇒ ★ **正是"上限/截断/强制类断言必须先证前置动作真发生了"这条规矩在它自己身上复现** ✓
★ 它留下的开工单：★ **① 读 `declareDefect` 必填字段 ⇒ 先断言登记成功再断言 `enforced:true`；② 三处"截断/上限"补前置造数据；③ 目标 41/0** ✓

### 19.3 ★★ 判定
★ **覆盖债务：L3 72 · L2 15 · L1 16 · L0 0** ⇒ ★ **有人工审查 87/103 文件（84%）；★ 仅机器门禁只剩 16** ✓
★ **T1 371/371**（★ suites 312 · **probes 59**）／★ **RULE E 88/0**／★ **regen-all 16/16** ✓
★ **按当前速率 ⇒ L1 清到个位数还需 1–2 轮** ✓
