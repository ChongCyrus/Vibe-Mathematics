# Round 10 · falsify：真 `finally` 解锁 ＋ 活动治理计数器 ＋ remote 四组合（＋ 登记纪律）

> 任务 `task-77`（owner `vmu-activity`）。**本轮新增 11 个单点缺陷**（家族 11，缺陷总数 **45**；R9 为 34）。
> 交付：3 个已存在的 falsify 文件被扩成多 case（**未新建 test 文件**）＋ `package.json files[]` 登记 ＋ 本报告。
> **未改内核/工具源码**（变异只发生在 `D:\_tmp` 的副本上）、未 git、未 `regen-all`、未全量 sweep、未改他人测试。

## 0. 读数（原样命令 → 末行）

| 命令 | 读数 |
|---|---|
| `node tests/vmu-resume-falsify.test.mjs` | `=== VMU RESUME FALSIFY: 16 passed, 0 failed ===`（5 变异，2 case） |
| `node tests/vmu-activity-falsify.test.mjs` | `=== VMU ACTIVITY FALSIFY: 29 passed, 0 failed ===`（12 变异，3 case） |
| `node tests/vmu-storepolicy-falsify.test.mjs` | `=== VMU STOREPOLICY FALSIFY: 23 passed, 0 failed ===`（9 变异，3 case） |
| `node tests/audit-package-membership.mjs` | `=== PACKAGE MEMBERSHIP: 13 passed, 0 failed ===`（本轮从 12/1 转绿，见 §4） |
| `node tests/audit-declaration-criterion.test.mjs` | `75 passed, 1 failed`（唯一红＝`regen-all --check`）＋ **RULE E current=67 = baseline=67** |
| 其余 8 族（mailbox/chat/panel/fidelity/human/tasks/activity-lib/doc-invariant/doc-invariant2） | 全 0 failed（见 §6） |

## 1. A · `resume` 的 F18 独占段：把「已断言」变成「可失败」（+3）

`tests/vmu-resume-lock-and-marks.test.mjs` 早就**断言**了「`recover()` 在每条出口都释放锁」（happy / throw / early-return / busy 四条）。**没有一条断言被证明过能红**——本轮补上，探针读四个出口，且每个出口都用 `status().lock` **和**锁服务本身两个来源交叉读：

| 缺陷（单点） | 锚点 | 变异后的读数 |
|---|---|---|
| **释放只在 happy path**（即 `finally` 被拆掉） | `resume.js:843-848` 的 `try { return await recoverUnlocked(args) } finally { if (acquired !== null) releaseRecoveryLock() }` | throw 出口：`throwReleases:0`、`throwLocks:1`（**锁泄漏**），而 happy 出口 `happyReleases:1` 不变 ⇒ **变异窄** |
| 释放**永不执行** | `:847` `if (acquired !== null) releaseRecoveryLock()` → `if (false) …` | 三条出口 `releases:0`，happy 出口也 `happyLocks:1` |
| **被拒的锁被忽略**（独占性不成立） | `:786` `if (!r || r.ok === false) {` → `if (false) {` | `busyCode:null`、`busyAcquisitions:1`、`busyRefusals:0`，且**它自己的 release 把别人的锁也释放了**（`holderIntact:0`） |

**控制方向**：happy 出口真释放；throw 出口以 `VMU_RESUME_UNAVAILABLE` 具名拒**且**仍释放；无 store 的 early-return 返回一张 report（不是抛）**且**仍释放；第二者持锁时 `VMU_RESUME_BUSY` 且 `acquisitions:0`。第三条变异最刺眼：**"拒绝"与"释放别人的锁"是同一个错误的两半**。

> 复现口径提醒：happy 路径必须注入 `work` ledger（否则 `inflight` 这一步 `ok:false`，整张 report 不是绿的——这是**探针的前置**，不是模块的问题；我在探针里写明了）。

## 2. B · `activity` 的治理计数器：clamp / dispose / 通知环（+4）

`tests/vmu-activity-falsify.test.mjs` 第三 case，四条，全部读**回执＋副作用两侧**：

| 缺陷（单点） | 锚点 | 变异后的读数 |
|---|---|---|
| 声明的 `clamp` 策略**改成拒绝** | `activity.js:326` 的 clamp 分支加 `false &&` | `clampCode:'VMU_ACTIVITY_INVALID_TIMEOUT'`、`armedMs:-1`（一个定时器都没 arm）——声明的另一种处置消失了 |
| clamp **夹错方向**（回执说夹了、arm 的是原值） | `:326` `Math.min(Math.max(ms, min), max)` → `Math.max(Math.min(ms, max), 0)` | `clampClamped:true` 而 `clampMs:5`、`armedMs:5` ⇒ **低于声明的下界**：关于**值**的谎，不是关于布尔位的谎 |
| dispose **声称关了等待者却让它挂着** | `:487` `if (typeof w.fail === 'function') w.fail(refuse(CODE.disposed,` → `if (false) …` | `disposeClosed:1`（回执说关了 1 个）而 `disposeOutcome:'pending'`、`disposersAfterDispose:0`（promise 永不 settle、disposer 永不跑） |
| 通知环丢弃**不计数** | `:244` `notes.splice(0, over); ringDropped += over` → 只 splice | `ringDropsStarted:false`、`ringDropsAdvance:false`，而 `ringTailNewest:true`（环照常轮转）⇒ **静默丢弃** |

**一条关于"可观测量"的实测结论（写进范式，不写进测试）**：`status().notificationRing` 是 `notes.slice(-5)` —— **环的真实上限 N 不在公开读数面上**。所以我把环的判据做成**与 N 无关**的：发 60 与 80 两条独立实例，要求 `dropped(80) − dropped(60) === 20`（越过上限的每一条都被数到）。这样既不把实现里的常量抄进测试，又真的可证伪。
**据此我主动删掉了一个原本想写的变异**：「环不再修剪（无界）」——它与「修剪但不计数」在**全部公开读数上完全同形**（`slice(-5)` 的视图一样、`ringDropped` 都是 0），写上它就只能靠标签宣称一个**观测不到**的结论。**能红 ≠ 值得写**：读数相同的变异等于给报告灌水。这条"看不见就不宣称"的判据补进 §5。

## 3. C · `storepolicy` 的 remote 四组合（+4）

`tests/vmu-storepolicy-falsify.test.mjs` 第三 case。四条分支各自**具名**，且控制方向是"在线写不得被排队"（否则"拒绝/排队"和"面根本没跑"分不开）：

| 缺陷（单点） | 锚点 | 变异后的读数 |
|---|---|---|
| 声明的 `offlinePolicy` **停止决定**（refuse 变成排队） | `storepolicy.js:225` 的 refuse 分支 → `if (false)` | `offlineRefuseCode:'allowed'`、`queuedOk:true`，而 **strong 分支仍照常拒**（变异窄） |
| `strong` 一致性**允许延后写** | `:221` `if (c.remoteConsistency === 'strong') {` → `if (false) {` | `strongCode:'allowed'`、`strongQueued:true` ⇒ 排队正好是那条分支存在要阻止的**静默矛盾** |
| 调用方说的 **offline 被无视** | `:212` `if (args.online === false) {` → `if (false) {` | refuse 与 strong **两个策略都不再被问到**：什么都不拒、什么都不排队（`queueCounted:0`） |
| `remote=on` **缺 url 也放行** | `:209` `if (!c.remoteUrl) return deny(` → `if (false) return deny(` | `noUrlCode:'allowed'`（前置条件消失，其余分支不受影响） |

控制组三条：在线写是普通写且回执点名 `vmu.store.remote`；缺 url / 离线+refuse / 离线+strong **三条不同分支三张具名拒**；只有离线+queue 被接受并计数，`strong` 从不出现在排队里。

## 4. `package.json files[]` 登记纪律（本轮新规）

`tests/audit-package-membership.mjs` 判据：**vmu 包内每个相对 import 的目标都必须被 `files[]` 收录**（否则打包即 `MODULE_NOT_FOUND`），且每个被收录的路径都存在。本轮：

1. **把我此前各轮新建的 13 个测试文件补进 `files[]`**（`tests/vmu-*-falsify*.test.mjs`、`vmu-activity-timers.test.mjs` 等）——它们此前只在仓库里、不在发布清单里。补后 `entries: 655 → 668`。
2. **顺手抓到一个别人的漏登记**：Round 10 的 `meetings.js` 拆出了 `vibe-math-vmu/kernel/meetingleave.js`（文件**存在**、被已发布的 `meetings.js:8` import），但**没进 `files[]`** ⇒ 该门禁**红**（`meetings.js -> ./meetingleave.js`）。我把它登记上，门禁 `12/1 → 13/0`。**这不是我的文件**，但漏登记会让包发布后直接缺模块；我只做**加一行**，不动它的任何实现/测试，并在给 lead 的简报里点名归属。

## 5. D 未做（具名，不绕过）＋ 范式补充

**D（`docs/03:1412` 后半句「`activityTool` 为真（`vmu.activity.*`）」↔ `host.js` 的 `TOOL_FACES` 出现条件）本轮未做**，理由具名：它需要**装配级**探针（真 kernel ＋ `toolSpecs`/`resolveFaces` 两档设置对比），而不是"复制一个模块改一行"；且 `host.js` 的副本要重写大量相对 import，风险与成本高于前三条；另外 `tests/audit-tool-table.test.mjs`（7/0）已在守工具表，扩之前要先与它对齐口径（R9 已与 `vmu-verify` 约定：要扩就扩那一个，不另造）。**下一轮配方**（已可执行）：解析 `docs/03` 行的第 4 格 → 抽出 `activityTool` 与 `vmu.activity.*` → 用两档 `settings`（声明/未声明）各装配一次 → 断言"声明 ⇒ 面出现、未声明 ⇒ 面消失、且 `status().faces.unavailable/disabled` 不撒谎"；变异落在 `host.js` 的该 face 条件行。

**范式补充（本轮两条判据）**：
- **④ 读数必须能区分你要宣称的东西**。一个在**全部公开读数上同形**的变异不能写：它会让检查数虚增，而读者以为多了一条保护。（对应 §2 删掉的那条"无界环"。）
- **⑤ 不知道的常量不要抄进测试**。环的 N 不在读数面上 ⇒ 判据改成**差分式**（两个总量之间差多少），既保住可证伪性，又不把实现细节复制成第二份真相。

## 6. 全部读数（本轮实测）

```
vmu-resume-falsify            16/0   （5 变异）
vmu-activity-falsify          29/0   （12 变异）
vmu-storepolicy-falsify       23/0   （9 变异）
vmu-mailbox/chat/panel-falsify 10/0  8/0  9/0
vmu-fidelity/human/tasks-falsify 10/0  12/0  9/0
vmu-activity-falsify-lib      27/0
vmu-doc-invariant(2)-falsify   9/0  16/0
vmu-activity-kernel / tool     141/0  58/0
vmu-resume-lock-and-marks     67/0   ← R9/R10 被证伪的那个 F18 行为测试本身仍全绿（行为没坏，只是没人证明过它能红）
vmu-storepolicy              11/0
audit-package-membership      13/0   ← 本轮转绿
audit-code-size                9/0   ← R9 的 resume.js 越界已被其 owner 修好
vmu-activity-timers           36/0   ← R9 的 lean.js 未分类定时器已被 reader-b 修好
audit-declaration-criterion   75/1（唯一红＝regen-all）RULE E 67=67
audit-enforced-consistency   354/1  findings=2 :: UNCOVERED-MODULE@recruit.js | UNCOVERED-MODULE@tasks.js  ← 见 §8
```

`D:\_tmp` 内 `vmu-falsify-*` 残留 **0**（库内 `TEMP-NOT-CLEANED` 断言 + 实测）。

## 8. 本轮复核到的树上红（都不是我的文件，只报告）

1. **`audit-enforced-consistency` 354/1**：`findings=2 :: UNCOVERED-MODULE@recruit.js | UNCOVERED-MODULE@tasks.js`。R9 复核时该门禁是 `355/0, findings=0` ⇒ 有 peer 在这两个模块里新增/改动了 `enforced` 口径但没在该门禁补场景行。门禁自己是对的（它在干活）：按该文件的规则，出现 `enforced` 的 kernel 模块必须有已登记场景，否则报 `UNCOVERED-MODULE`。归属：这两个模块的 owner ＋ 门禁主人（vmu-verify）。
2. **`regen-all --check`**：唯一红，R9 起一直如此，属 Lead 的 regen 步骤。
3. 已转绿（本轮实测确认）：`audit-code-size` 9/0（`kernel/resume.js` 越 1200 行已由 owner 处理）、`vmu-activity-timers` 36/0（`kernel/lean.js:137` 的轮询定时器已由 reader-b 分类/处理）、`audit-package-membership` 13/0（§4）。

## 9. 追加：`audit-enforced-consistency` 的三块场景 —— 已**实测**可粘贴（vmu-verify 请求，落盘归 vmu-verify）

vmu-verify 要我按 R9 格式给可粘贴场景块。我**没有直接改它的文件**（`tests/` 归它），而是把块**跑起来验证过**再交：把门禁复制到 `D:\_tmp`（相对 import 用 falsify 库的 `selfContainedSource` 改成绝对 URL、`HERE` 重指真 `tests/`），插块后运行；再对**内核副本**做单点变异，证明"改动 `enforced` 令牌就红"。

**实测读数（原始）**

| 变体 | 读数 |
|---|---|
| 基线（三块都在） | `refusal scenarios=25`、**`findings=0 (none ✓)`**、`=== VMU ENFORCED CONSISTENCY: 358 passed, 0 failed ===` |
| 基线再跑一次（确定性） | 同上逐字一致（358/0） |
| `recruit.js` 删掉 `VMU_MEMBER_LIMIT` 里的令牌（1 处） | `findings=1 :: REFUSAL-WITHOUT-ENFORCED@recruit.accept(second temp for the same hirer)`；`RED: rule ⑤ … refused (thrown VMU_MEMBER_LIMIT) with enforced=false` |
| `recruit.js` 删掉**卡本身**（`if (mine >= c.maxTempPerMember)` → `if (false)`） | `RED: … did NOT refuse as expected`（调用反而成功） |
| `tasks.js` 删掉 `detail` 里的令牌（1 处） | `findings=1 :: REFUSAL-WITHOUT-ENFORCED@tasks.objectAssign(...)` |
| `tasks.js` 让声明不再决定（`=== false` → `if (false)`） | `RED: … did NOT refuse as expected` |
| `loader.js` 删掉**两处**令牌（`occurrences: 2`） | `findings=1 :: REFUSAL-WITHOUT-ENFORCED@loader.handler reaches services without the trigger-workflow capability` |

**两处必须写进交接的实测细节**（我踩过）：
1. **两个面的 `enforced` 位置相反**：`recruit.js` 的 `refuse()` 是 `Object.assign(err, extra)` ⇒ **错误对象顶层**（`r.refusalEnforcedIsArray === true`）；`tasks.js` 的 `refuse()` 把它放进 `err.detail` ⇒ 靠 runner 的深度优先遍历找到（`arrays.length > 0`）。所以两块都过 `rule ⑤`，但**过法不同**。
2. **别在这些单行语句里插 `// MUTANT` 注释**：`{ …, enforced: [...] })` 这类行末尾就是 `)`，注释会把 `)` 一起吞掉 ⇒ `MUTANT-UNIMPORTABLE`（我在证明脚本里踩了两次）。注释写在块外。
3. **`loader.js` 的块有保质期**：该文件本轮仍在被改（`mtime` 在我测试期间变过），块依赖 `createLoader({services,log,clock})`、`load({id,kind,module})`、`get(id).handlers[hook]` 与 `capabilities.trigger-workflow` 令牌；**落盘前请再跑一次**。注意 `loader.js:132-134/138-140` 是**抛出的拒绝**（不是回执信封）⇒ 正确工具是 `REFUSAL_SCENARIOS`，不是 `RECEIPT_ENVELOPE_MODULES` 豁免（豁免的机械校验需要全行都是信封形状，这两行不满足… 实际上形状上是信封式的，但它们挂在 `throw` 上，用场景才是真检查）。
4. **`loader.js` 是本轮中途出现的第三个未覆盖模块**：我第一版基线（只补 recruit/tasks）是 `findings=0`，几分钟后同一条命令变成 `findings=1 :: UNCOVERED-MODULE@loader.js` —— 门禁在**实时**发现新模块，这正是它该有的样子。

三块的完整文本已随消息交给 vmu-verify；块形状：`REFUSAL_SCENARIOS` 追加 3 条 ＋ 顶部 3 行 import（`createRecruit`／`createTasks`／`createLoader`）。

## 7. 未证伪清单（下一轮）

1. **D**（上面已给配方）；
2. `kernel/index.js:894` 的 recovery **单例/租约**（另一个真 `finally` 用户）与 `mathjobs.js:587` 的 `finally { releaseSlot() }` ——本轮只证伪了 `resume` 那一个 `finally`；
3. `activity` 的 `wakeOn` 钩子词表：`docs/08:1564` 承诺"名字写错是 `VMU_ACTIVITY_WAKE_HOOK_UNKNOWN` 具名问题"，实现点与 `kernel/bus.js` 的 `HOOK_REGISTRY` 单源；
4. `storepolicy` 的 `vmu.store.onVersionTooHigh` 两值（`docs/07`／N4 同口径）与 `autoBackup` 计数。
