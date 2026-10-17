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
★ `tests/audit-kernel-claims*.mjs`（★ 行为宣称：★ **68 模块／断言数见各探针总结行**）。

## 2. ★★★★★ 账（★ kernel 103 文件／45166 行）

| ★ 级别 | ★ 文件 | ★ 行数 | ★ 占比 |
|---|---|---|---|
| ★★ **L3 宣称级验证** | ★ **68** | ★ **32666** | ★ 72.3% |
| ★★ **L2 已逐行读** | ★ **15** | ★ **9690** | ★ 21.5% |
| ★ **L1 仅机器门禁** | ★ **20** | ★ **2810** | ★ 6.2% |
| ★ **L0 未触及** | ★ **0** | ★ **0** | ★ 0% |

⇒ ★★★★ **83/103 文件（94% 行）有人工审查；★ 20 文件（6% 行）仅机器门禁覆盖** ✓

### 2.1 ★★ L3（★ 有行为断言在测其头部宣称）

  `resume.js`（1195） · `meetings.js`（1154） · `mathjobs.js`（1033） · `idempotency.js`（907） · `lean.js`（893） · `records.js`（883） · `mathtools.js`（873） · `mathadapters.js`（855） · `chat.js`（758） · `ip.js`（747） · `workflow.js`（729） · `library.js`（727） · `funding.js`（712） · `pack.js`（640） · `ballot.js`（631） · `replay.js`（627） · `meeting.js`（613） · `scheduler.js`（611） · `alerts.js`（609） · `charter.js`（598） · `conference.js`（593） · `paper.js`（586） · `ballotbox.js`（571） · `migration.js`（561） · `auditchain.js`（550） · `bidding.js`（537） · `tasks.js`（534） · `human.js`（528） · `external.js`（524） · `meetingmarker.js`（516） · `memory.js`（497） · `capacity.js`（456） · `publication.js`（435） · `minutes.js`（434） · `course.js`（429） · `panel.js`（428） · `transaction.js`（416） · `rules.js`（410） · `compliance.js`（407） · `resource.js`（386） · `retention.js`（376） · `recruit.js`（368） · `fairness.js`（303） · `notify.js`（301） · `trust.js`（290） · `collab.js`（287） · `storepolicy.js`（284） · `lifecycle.js`（270） · `grant.js`（268） · `tenure.js`（268） · `loader.js`（254） · `skills.js`（252） · `governance.js`（251） · `topology.js`（249） · `handover.js`（243） · `clockguard.js`（242） · `formal.js`（241） · `stateversion.js`（237） · `identity.js`（227） · `meetinglapse.js`（224） · `script-bridge.js`（219） · `budget.js`（216） · `audit.js`（214） · `crypto.js`（213） · `receiptbounds.js`（209） · `custody.js`（204） · `registry.js`（194） · `ratelimit.js`（169）

### 2.2 ★★ L2（★ 已逐行读过或改过并复读 · ★ 声明于 `READ_MODULES`）

  `index.js`（2439，R80） · `turn/index.js`（1034，R50） · `prompt/index.js`（785，R86） · `bus.js`（753，R85） · `report.js`（628，R99） · `mailbox.js`（607，R89） · `activity.js`（547，R80） · `delegation.js`（547，R97） · `arbitration.js`（497，R97） · `metrics.js`（394，R97） · `store.js`（317，R97） · `members.js`（316，R83） · `control.js`（309，R83） · `guard.js`（293，R97） · `ids.js`（224，R97）

## 3. ★★★★★ L1 的具名余项（★ 20 文件，★ 按行数降序）

> ★ **这一列就是门 1 的剩余工作清单** —— ★ **可数、★ 具名、★ 按规模排序**。
> ★ 推进方式：★ **每轮取 2–3 个照「验证宣称」那把尺过一遍**（★ 已验证者升到 L3，★ 并把断言收进 `audit-kernel-claims*`）。

| ★ # | ★ 文件 | ★ 行数 |
|---|---|---|
| 1 | `repropack.js` | 192 |
| 2 | `reviewers.js` | 192 |
| 3 | `board.js` | 190 |
| 4 | `fidelity.js` | 187 |
| 5 | `projmigrate.js` | 181 |
| 6 | `reportfeedbackdelivery.js` | 179 |
| 7 | `discipline.js` | 175 |
| 8 | `work.js` | 165 |
| 9 | `math.js` | 159 |
| 10 | `explain.js` | 157 |
| 11 | `resumeflush.js` | 152 |
| 12 | `library-policy.js` | 143 |
| 13 | `partnership.js` | 143 |
| 14 | `citations.js` | 137 |
| 15 | `reportfeedback.js` | 125 |
| 16 | `meetingleave.js` | 96 |
| 17 | `meetingdomain.js` | 72 |
| 18 | `meetings-defaults.js` | 58 |
| 19 | `timevalue.js` | 55 |
| 20 | `contentvalue.js` | 52 |

## 4. ★★★ 这份账之外的覆盖

★ **kernel 之外**：★ `tools/` **51 个面**已按动作级核对（★ 0 缺陷）／★ `settings/schema.js` 的 **1123 键**已过静默键门禁／★ **pack 17/17 文件**已有覆盖（★ 13 逐行＋2 生成免眼审＋2 结构化审计）／★ `host*.js`（★ 定点）。
★ **真机**：★ 53 面被真实调用、★ **47/47 重点面逐面触达**、★ 39 条拒绝全部可执行、★ **结题两次独立达成**。

## 5. ★★ 明确【尚未读】的少数非 kernel 文件（★ 具名，★ 不藏）

★ `docs/landscape-similar-frameworks.md`（★ **408 行**）—— ★ **完全未读**（★ 调研文档，★ 不影响运行机制，★ 但按「不许把没读到写成没问题」，★ 在此具名）。
★ `README.md` 与 `vibe-math-vmu/docs/00–14` 各卷 —— ★ **未逐卷通读**（★ 但其**数字与链接**由 `check-docs`／`audit-doc-line-refs`／`audit-readme-counts`／`regen --check` 在管）。

## 18. ★★★★★ ROUND 119：第十七批 D 路 **30/0**（★ L3 达 68、L1 只剩 20）

| ★ 模块 | ★ 断言 | ★ 关键宣称 |
|---|---|---|
| ★ `crypto.js` | ★ 7 | ★★ **"私钥材料【永不】返回"在【5 个敏感名】上测**（privateKey／secretSeed／pem／dk／sk）★ **＋ 正向：公开字段保留、干净键原样** ／★ **四类可区分的失败理由**逐字 ／★ **旧键 `retired` 而非删除**（三态）／★ **无 signer 时 sign·verify 两入口都具名拒**且 `signatures===0`（★ 前提）|
| ★ `receiptbounds.js` | ★ 8 | ★★ **"`receiptMeta` 【总是】在，且两态【同一组五键】"**（★ 截断态与未截断态**键集合逐字比较**）／★ **每条裁剪记【八键】**（★ 前置：`elided` 非空）／★ **"不丢键、不改数组长度"在 2 个点上** ／★ `hostElision:'possible'` **单独报告、绝不混淆** |
| ★ `custody.js` | ★ 7 | ★★ **"键开启时，主体→引用的明文映射【按名拒】，★ 只有引用出行"**（★ **双向**：开 ⇒ `VMU_CUSTODY_REVERSIBLE_MAPPING`／关 ⇒ 接受）／★ **链随人走**（★ 前置：登记＋转移都成功）／★ **销毁仍保留引用** |
| ★ `registry.js` | ★ 8 | ★★ **"绝不静默覆盖（O4）"在【2 个点】**（重复注册／★ 别名占用已解析名）／★ **"别名从不隐藏自己"** ⇒ `resolve()` 带 `viaAlias{deprecated,reason}` ／★ **"版本被检查而非信任"并报出【比较过的数字】**（`required` > `published`）|
★ **累计：68 个模块、769 条断言**（★ 二十个探针）⇒ ★ **L3 达 68/103 文件** ✓

### 18.1 ★★★★ 而它的一处错误是【本阶段最老教训的新装】
★ `receiptbounds` **返回的是字符串**，★ 所以对返回值读 `.receiptMeta` **什么也读不到** —— ★ **要先 `JSON.parse`** ✓
★ 而它把区别讲清了：★ **"这跟『读序列化而不读字段』是同一个错，★ 只是外了一层 —— ★ 这里字符串【就是】那个值，★ 所以解析它是对的；★ 而给一个对象【造】一层 JSON 则不对。★ 区别在于你是【拆开这个值】还是【替换它】"** ✓✓
⇒ ★★★ **"同一种形式，★ 两种相反的对错 —— ★ 取决于你是在解包还是在替换"** ✓

### 18.2 ★★ 而 A 路 22/7 仍未入库（★ 7 条红全是它自己的读法）
★ 但 **16A 的 4 条红【全部变绿】** ⇒ ★ **账里那两条"一次读"的答案（★ `code` 而非 `exitCode`／★ 公理扫源码）确实有效** ✓
★ 它剩下的 5 条同源红：★ **`boundedToolResult` 返回字符串**（★ 与 D 路同一处发现）⇒ ★ **下轮 `JSON.parse` 即可** ✓

### 18.3 ★★ 判定
★ **覆盖债务：L3 68 · L2 15 · L1 20 · L0 0** ⇒ ★ **有人工审查 83/103 文件（81%）；★ 仅机器门禁只剩 20** ✓
★ **T1 370/370**（★ suites 312 · **probes 58**）／★ **RULE E 88/0**／★ **regen-all 16/16** ✓
★ **按当前速率（★ 每轮 4–8 个）⇒ L1 清到个位数还需 2–3 轮** ✓
