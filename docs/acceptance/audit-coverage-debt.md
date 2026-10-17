# 覆盖债务台账 · **kernel 逐文件的三级审查账**（Round 105）

> ★ 这一篇要解决一件事：★ **门 1 说「源码级全树检查」—— ★ 而「全树」不能靠宣称，★ 只能靠【可数的账】**。
> ★ 因此**每个 kernel 模块都被标上它【真正受到过】的审查级别**，★ **余项是一个数字，★ 不是一种感觉**。

## 1. ★★★ 三级口径

| ★ 级别 | ★ 含义 |
|---|---|
| ★★ **L3 宣称级验证** | ★ **8** | ★ **6107** | ★ 13.5% |
| ★★ **L2 已读** | ★ 本阶段**逐行读过**，或改过并复读过 |
| ★ **L1 仅机器门禁** | ★ **77** | ★ **26789** | ★ 59.4% |
| ★ **L0 未触及** | ★ 以上皆无 |

★★ **重要**：★ **L1 不是「没检查」** —— ★ 它是**「有一套判据明确、结果可复算的检查覆盖了它，★ 只是没人逐行读」**。
★ 本阶段**新增的四道自建门禁**正是为了把 L1 从「未知」变成「有判据覆盖」：
★ `tests/audit-service-calls.mjs`（★ 调用侧：`kernel.<服务>.<方法>` 必须可解析，★ **87 服务 × 213 文件**）／
★ `tests/audit-face-actions.mjs`（★ 面侧：★ 每个提供的动作必须存在或有分支，★ **51 面／47 enum**）／
★ `tests/audit-silent-keys.mjs`（★ 设置键：★ 不得「既无人读也未被裁定」，★ **640 文件**）／
★ `tests/audit-kernel-claims*.mjs`（★ 行为宣称，★ **8 模块 81 条**）。

## 2. ★★★★★ 账（★ kernel 103 文件／45129 行）

| ★ 级别 | ★ 文件 | ★ 行数 | ★ 占比 |
|---|---|---|---|
| ★★ **L3 宣称级验证** | ★ **8** | ★ **6107** | ★ 13.5% |
| ★★ **L2 已逐行读** | ★ **18** | ★ **12233** | ★ 27.1% |
| ★ **L1 仅机器门禁** | ★ **77** | ★ **26789** | ★ 59.4% |
| ★ **L0 未触及** | ★ **0** | ★ **0** | ★ 0% |

⇒ ★★★★ **26/103 文件（41% 行）有人工审查；★ 77 文件（59% 行）仅机器门禁覆盖** ✓

### 2.1 ★★ L3（★ 有行为断言在测其头部宣称）

  resume.js（1195） · mathjobs.js（1033） · idempotency.js（907） · lean.js（893） · records.js（883） · scheduler.js（611） · transaction.js（416） · ratelimit.js（169）

### 2.2 ★★ L2（★ 已逐行读过或改过并复读）

  index.js（2439） · meetings.js（1154） · turn/index.js（1034） · prompt/index.js（785） · chat.js（758） · bus.js（753） · ballot.js（631） · report.js（628） · mailbox.js（607） · activity.js（547） · delegation.js（547） · arbitration.js（497） · metrics.js（394） · store.js（317） · members.js（316） · control.js（309） · guard.js（293） · ids.js（224）

## 3. ★★★★★ L1 的具名余项（★ 77 文件，★ 按行数降序）

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

## 4. ★★★ 这份账之外的覆盖（★ 不在这 103 个文件里）

★ **kernel 之外**：★ `tools/` **51 个面**已按动作级核对（★ 0 缺陷）／★ `settings/schema.js` 的 **1123 键**已过静默键门禁／★ **pack 17/17 文件**已有覆盖（★ 13 逐行＋2 生成免眼审＋2 结构化审计）／★ `host*.js`（★ 定点）／★ `docs/landscape-similar-frameworks.md`（★ 见下方具名未读）。
★ **真机**：★ 53 面被真实调用、★ **47/47 重点面逐面触达**、★ 39 条拒绝全部可执行、★ **结题两次独立达成**。

## 5. ★★ 明确【尚未读】的少数非 kernel 文件（★ 具名，★ 不藏）

★ `docs/landscape-similar-frameworks.md`（★ **408 行**）—— ★ **完全未读**（★ 它是调研文档，★ 不影响运行机制，★ 但按「不许把没读到写成没问题」，★ 在此具名）。
★ `README.md` 与 `vibe-math-vmu/docs/00–14` 各卷 —— ★ **未逐卷通读**（★ 但 `check-docs`（★ DOC LINT PASS）＋ `audit-doc-line-refs` ＋ `audit-readme-counts` ＋ `regen --check` 在管其**数字与链接的一致性**）。

## 6. ★★★★★ ROUND 105 补记：A 路第四批（★ 队友执行）—— `ballot`／`meetings`／`chat`，**27 条断言**

★ **结果**：★ **`ballot.js` 15 条 · `meetings.js` 6 条 · `chat.js` 6 条 ＝ 27 条，全绿** ✓
★ **关键宣称举例**：★ **`kind:'process'` 的票【计数但不产生裁决】**／★ **`undecided` 必带 reason**（★ 含**集合级**"每一条都带 reason"，★ 且带非空守卫）／★ `instantRunoffTally` 平票 ⇒ **具名 tied options**／★ **`isFrozen` 是【注入谓词】而非硬编码角色**（★ 无 seam ⇒ `status().mechanism.hasFrozenSeam === false`，★ **自报真假**）✓

### 6.1 ★★★★ 而它的 3 条失败【全部是它自己错】，★ 且它**没有放宽或删断言**
★ **它断言"缺 `clock` ⇒ 抛"** ⇒ ★ **错**：★ 回读 `meetings.js:52` 逐字为 **`createMeetings({ clock = () => 0, … })`** ⇒ ★ **`clock` 有默认**，★ `:55` 的 throw 是给**"传了非函数 clock"**的 ✓
★ **修法**：★ **把断言改到正确的声称上**（★ "默认合法" ＋ "非函数才拒"），★ **而不是删掉它** ✓
★ **且它主动"不猜"**：★ 原想用 `createBallot` 工厂做断言，★ recon 里签名被读截断 ⇒ ★ **改为只断言纯函数**（`classifyVote`／`defaultTally`／`instantRunoffTally`）⇒ ★ **避免了一处必然发生的猜错** ✓
⇒ ★★★ **它并给出"牙齿证明"**：★ **本探针真的红过 3 条 ⇒ 不是"不可能失败的断言"** ✓✓

### 6.2 ★★ 它如实开出的【未验证清单】（★ 与"已验证"分开写）
★ `meetings.js` **大头未验证**（★ 头部注释是**可读的最小者**，★ 基本是描述、无具体不变量）⇒ ★ **只验了工厂契约**；★ 状态机／29 个 `VMU_*` 码（含已知的 `VMU_NO_OPEN_MEETING`）／两条 journal 事件／receipt 词表 **未验** ✓
★ `ballot.js` **约 10 条未验**（★ frozen ⇒ 拒票不入计／资格拒／重复投／未知 kind 拒／middleware 无 reason 的 undecided ⇒ `VMU_MIDDLEWARE_FAILED`／`createDurableCommitLog`…）✓
★ `chat.js` **约 10 条未验**（★ 悬空 `replyTo` ⇒ `VMU_CHAT_ANCHOR_DANGLING`／mute·quota·admin 的具名强制／绝对时刻拒／quote 上限…）✓
★ **方法学债务**：★ 样板有 `--selftest`，★ 它的探针**没有**（★ 但**已由 3 条真实失败实证"能红"**）⇒ ★ 若要常驻化**应补 `--selftest`** ✓

### 6.3 ★★★★★ 而本轮【我自己的仪器出了错，并被修好】
★ 我为生成这份台账写的脚本，★ **用「」批量替换中文引号时改过了头** —— ★ **把含计算的表达式行的引号也剥了** ⇒ ★ **文档里一度印着未求值的 JS 代码**（★ 例：★ `「 + by(」L3「).length + 」`）✓
★ **修法**：★ 不再改生成器（★ 它已结构受损），★ **直接按权威读数重算并就地修补该文档**，★ **并核验残留未求值表达式 = 0** ✓
⇒ ★★★★ **"仪器自述不实"这一类，★ 本阶段已经出现两次**（★ 上次是我自己的扫描器空过）⇒ ★ **结论：★ 生成物【必须被读一遍】，★ 不能假设"我写了生成器所以它是对的"** ✓

## 7. ★★★★★★ ROUND 105：第四批（★ 两路并行，队友执行）—— **73 条断言**

| ★ 路 | ★ 模块 | ★ 断言 | ★ 关键宣称 |
|---|---|---|---|
| ★ A | ★ `ballot.js` 15 · `meetings.js` 6 · `chat.js` 6 | ★ **27** | ★ **`kind:'process'` 的票【计数但不产生裁决】**／★ **`undecided` 必带 reason**（★ 含集合级断言＋非空守卫）／★ `instantRunoffTally` 平票 ⇒ **具名 tied options**／★ **`isFrozen` 是【注入谓词】而非硬编码角色**（★ 无 seam ⇒ `hasFrozenSeam:false`，★ **自报真假**）|
| ★ B | ★ `workflow.js` 20 · `library.js` 14 · `funding.js` 12 | ★ **46** | ★ **"空配置 ⇒ 23 键全接线"被【断言】而非暗示**／★ 源码扫描 **0 处 `Date.now`／随机**（★ 唯一时间源是注入时钟）／★ **`enforced[]`／`fired[]` 且 `fired ⊆ enforced`**（★ **"读了 ≠ 做了"**）／★ **拒绝必带 `enforced` 且永远是数组、绝不为 undefined**／★ **改标题不改身份、改 statement 改身份**／★ **悬空 id 具名拒（`VMU_NO_SUCH_OBJECT`）而绝不回空正文** |
★ **合计 73 条，全绿；★ 且两路各自"真的红过"**（★ A 路 3 条、★ B 路 6 条）⇒ ★★ **不是"不可能失败的断言"** ✓✓

### 7.1 ★★★ 而两路的失败【全部是它们自己的错】，★ 且都【没有放宽或删断言】
★ **A 路**：★ 断言"缺 `clock` ⇒ 抛" ⇒ ★ 错（★ `meetings.js:52` 是 `clock = () => 0`，★ **有默认**）⇒ ★ **把断言改到真实声称上**（★ "默认合法"＋"非函数才拒"）✓
★ **B 路 6 处**：★ `library.append` **是 async**（★ 它把 Promise 当记录 ⇒ 一次红 4 条）／★ `stage()` **是读阶段**不是改阶段（★ 真正的迁移在 `advance()`）／★ `due()` 取 `{taskId,dueAt}`／★ 预算行必须带 `category`／★ `expense` 先查必填字段／★ `status().plannedKeys` **不是**"键→原因"对象 ✓
⇒ ★★★ **B 路原话**：★ *"六处红全部追到我的调用形态；每一处模块行为都与它头部宣称一致"* ✓✓

### 7.2 ★★★★ 而【RULE E 又抓到了我】—— ★ 两次、共 6 处
★ 第一批入库时：★ **4 处 shape-A**（★ `for…of`／三处 `.every` 缺非空守卫）✓
★ 修的过程中我又踩了**两处**：★ **守卫写成 `if (failures.length)`（真值判断）★ 不被 `NON_EMPTY_GUARD` 正则认可** ⇒ ★ 必须写 **`.length > 0`**；★ **我的自证块 `if (--selftest) { ok(1===2) }` 命中 C2**（★ **`if` 里放断言**）⇒ ★ 按仓规补 **`EMPTY_ALLOWED` 注释并写明"这个断言是【故意为假】的，★ 它是"该仪器能报失败"的证明"** ✓
⇒ ★ **RULE E 88/0**；★ 两探针 **27/0 · 46/0**，★ **自证均 exit=0** ✓

### 7.3 ★★★ 覆盖债务台账（本文件 §2–§3）
★ **L3 8（13.5%）＋ L2 18（27.1%）＝ 26/103 文件（41% 行）有人工审查**；★ **L1 77 文件（59.4% 行）仅机器门禁覆盖**；★ **L0 0** ✓
★ **§3 列出全部 77 个 L1 文件并按其行数降序** ⇒ ★ **那就是门 1 的剩余工作清单** ✓
