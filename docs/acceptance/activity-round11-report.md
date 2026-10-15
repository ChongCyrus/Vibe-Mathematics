# Round 11 · 真 `finally` 的异常出口 ＋ records/store 判据 ＋ `docs/03:1412` 可达性

> 任务 `task-85`（owner `vmu-activity`）。**新增 7 个单点缺陷**（家族 13，缺陷总数 **52**；R10 为 45）。
> 交付：**1 个新 falsify 文件** ＋ 1 个既有文件加第 3 case ＋ `package.json files[]` 登记 ＋ 本报告。
> 未改内核（变异只发生在 `D:\_tmp` 副本）、未 git、未 `regen-all`、未全量 sweep、未改他人测试。

## 0. 读数（原样命令 → 末行）

| 命令 | 读数 |
|---|---|
| `node tests/vmu-finally-falsify.test.mjs`（**新**） | `=== VMU FINALLY FALSIFY: 15 passed, 0 failed ===`（4 变异 ＋ 1 条"防御性 finally"实测 pin） |
| `node tests/vmu-doc-invariant2-falsify.test.mjs` | `=== VMU DOC-INVARIANT2 FALSIFY: 22 passed, 0 failed ===`（8 变异，3 case；本轮加的是第 3 case） |
| 其余族（activity/storepolicy/resume/doc-invariant/activity-lib） | `29/0`、`23/0`、`16/0`、`9/0`、`27/0` |
| `node tests/audit-enforced-consistency.test.mjs` | **`findings=0 (none ✓)`、`358 passed, 0 failed`** ⇒ R10 交出的三块场景已被门禁主人落盘（358 正是我实测的 358） |
| `node tests/audit-package-membership.mjs` | `13 passed, 0 failed`（本轮先 12/1，见 §4） |
| `node tests/audit-tool-table.test.mjs` | `7 passed, 0 failed`（全表静态判据仍归 vmu-verify，我不动） |
| `node tests/audit-declaration-criterion.test.mjs` | `77 passed, 1 failed`（唯一红＝`regen-all`）＋ **RULE E current=67 = baseline=67** |

## 1. A · 真 `finally` 用户：异常出口也必须归还（+4）

先给**全量清点**（实测，`\bfinally\b` 逐文件扫描）：`kernel/` 内共 8 个文件有 `finally` —— `index.js`(2)、`mathjobs.js`(2)、`resume.js`(3)、`bus.js`(1)、`mathtools.js`(2)、`meetings.js`(1)、`migration.js`(1)、`scheduler.js`(1)；包根 `host.js`(2)、`host-spawn.js`(2)。R10 点名的两个"真用户"本轮都做了，第三处（`mathjobs.js:224` 的子进程预算定时器）已在 R4 的 F15 清单里（`tests/vmu-activity-timers.test.mjs` 36/0 逐站点分类），不重复。

### 1.1 `kernel/index.js:1953` —— exit-flush 的 single-flight 旗标（2 个变异，**含窄变异**）

```js
exitFlushInFlight = run
try { return await run } finally { exitFlushInFlight = null }
```
承诺（`:1916-1919`）：**并发调用共享一次 flush，之后清旗标 ⇒ 更晚的调用会再跑一次**（宿主可能重装并产生新的 journal 尾巴，永久旗标会静默丢掉它）。
**异常出口可达且被真的走到**：注入一个会抛的 `clock`（flush 第一件事就是 `clock()`）。实测真模块：`shutdown('one')` → ok、记录 `at=1000`；`shutdown('two')` → **再跑**（`at=1005`、reason='two'）；抛钟那次 **reject 冒出来**；随后 `shutdown('after')` → **再跑**（`at=1010`）—— 这就是 `finally` 买到的行为。

| 缺陷（单点） | 变异后的读数 |
|---|---|
| **释放只在 happy path**（拆掉 `finally`） | `recoveredAfterThrow:false`、`afterSucceeded:false`（下一次 shutdown 永远返回那枚**已 reject 的旧 promise**），而 `secondRunsAgain:true` 不变 ⇒ **窄变异，只泄漏抛出的那条出口** |
| 旗标**永不清除** | `secondRunsAgain:false` 且 `recoveredAfterThrow:false`：连**已结算**的那次也永不复跑（静默吞掉重装后的尾巴） |

### 1.2 `kernel/mathjobs.js:587` —— 并发槽位轨道（2 个变异 ＋ 1 条**实测非缺陷**）

```js
const execute = async (job) => { try { return await executeInner(job) } finally { releaseSlot() } }
```
轨道形状：`executeInner` 在 `running() >= maxParallel` 时 park（`slotWaiters`），**只有 `releaseSlot()` 能唤醒它**。探针：`maxParallel=1`，两个 async 作业，第一个的 `spawn` 我控制 —— 第二个必须 park（`queued`、未 spawn），第一个结束后必须**被唤醒并起跑**。

| 缺陷（单点） | 变异后的读数 |
|---|---|
| `releaseSlot` 唤醒不了任何人（`slotWaiters.splice(0)` → `[]`） | `parkedJobStarted:false`、`spawnedWhileParked:1`：**轨道静默卡死**，第二个作业永远不出队 |
| `finally` 里**根本不释放** | 同上，且第一个作业仍正常跑完（`firstStarted:true`） |

**★ 实测非缺陷（已 pin）**：把释放改成"只在成功路径"（`const out = await executeInner(job); releaseSlot(); return out`）后，**每个可达输入的读数与真模块逐字相同** ⇒ 库当场报 `PROBE-DOES-NOT-DISCRIMINATE`。原因可读：`executeInner` 自己的 `catch`（`:718-723`）把内部失败**转成回执**（`VMU_EXTERNAL_UNAVAILABLE`），`async:true` 那条路（`:774`）还再兜一层 `.catch` ⇒ **没有任何可达输入能让 wrapper 抛出**。诚实结论不是"我没能证伪它"，而是"**这处 `finally` 是防御性的**：它的抛出出口不可达"，并且我把这条结论**做成断言 pin**（`PROBE-DOES-NOT-DISCRIMINATE` 必须仍然出现）—— 一旦将来有重构让抛出逃出来，这条 pin **变红**就是"该把它升格成真变异"的信号。

## 2. B · `records`/`store` 接缝：**不存在就写清判据**（本轮只写判据，不硬造）

**判据（可复算，不是叙述）**：`finally` 只有当"函数**在内部取得**了必须在抛出时归还的东西"时才需要 —— 锁、定时器、句柄、监听器、队列槽位。逐文件实测（`\.acquire\(`／`\.release\(`／`\bfinally\b`／`setTimeout|setInterval`／`addEventListener|\.on\(`）：

| 文件 | 行数 | `finally` | `.acquire(` | `.release(` | 定时器 | 监听器 |
|---|---|---|---|---|---|---|
| `kernel/records.js` | 882 | 0 | 0 | 0 | 0 | 0 |
| `kernel/storepolicy.js` | 270 | 0 | 0 | 0 | 0 | 0 |
| `kernel/store.js` | 306 | 0 | 0 | 0 | 0 | 0 |

⇒ 这三个面**只持有内存状态（Map）**，而状态不是"取得来的资源"；`storepolicy` 的锁由**调用方**经两个独立公开调用 `acquire()`／`release()` 管理，**任何一次调用内部都没有取锁**（`write()` 甚至完全不取锁 —— R8/R9 已实测）。因此在这里写一个 `finally` 会**没有任何东西可归还**，是硬造。R10 那句"本面不存在该构造"现在有了可复算的判据。
**绊线（可复算）**：若 `storepolicy.write()` 将来在体内调用 `acquire()`（`grep` 该函数体），或者这三个文件长出定时器／监听器，则**那时**才需要 `finally`，且那时才有家族可做。这条判据也解释了 §1 的分布：真正需要 `finally` 的是 `resume`（跨调用持锁）、`mathjobs`（槽位／预算定时器）、`host-spawn`（预算定时器）那类**跨调用资源**。

## 3. C · `docs/03:1412` 后半句可达性：**按 vmu-verify 的裁定实现**（+3）

裁定（vmu-verify）：落点＝单点可证伪归我（他做全表静态，`audit-tool-table` 我不动）；入口＝**`host.js` 的 `toolSpecs({kernel, settings})`**（判"**发布**"，不是 `TOOL_FACES`/`resolveFaces` 的"声明"）；反例必须**排除 D-01**（总线已有条目也算声明）；并且必须同时断言 `disabled`／`unknownDisabled` **不撒谎**。

`tests/vmu-doc-invariant2-falsify.test.mjs` 第 3 case 落实了每一条：**引文作为控制字段**（运行时解析 `docs/03:1412` 第 4 格，要求仍写着 `activityTool` ⇔ `vmu.activity.*`）；正例＝声明 `vmu.activity.timeoutMs` ⇒ `vibe_vmu_wait` **被发布**；反例＝只声明 `vmu.chat.quota` **且实测总线条目为 0**（`busFree` 控制字段）⇒ **不得发布**；自曝＝`vmu.core.facesDisabled:['activity']` ⇒ `disabled` 里具名 `VMU_NOT_PERMITTED` 且不发布，写错的名字 ⇒ `unknownDisabled`。

| 缺陷（`host.js` 单点） | 变异后的读数 |
|---|---|
| `families: ['vmu.activity.']` → `['vmu.activityX.']`（卷里印的声明不再发布该面） | `declaredPublishes:false`，而反例仍不发布 ⇒ **窄** |
| 同行插 `always: true`（零机制被破坏） | `unrelatedDoesNotPublish:false`：只声明 `vmu.chat.quota` 的部署**也拿到** `vibe_vmu_wait`（具名禁用分支仍胜出 ⇒ 变异指向明确） |
| `if (disabledKeys.has(row.face))` → `if (false)` | `disabledDoesNotPublish:false` **且** `disabledIsNamed:false`：禁用不再生效，**自曝也同时说谎** |

## 4. 登记与清理（本轮新规）

- **`package.json files[]`**：新文件 `tests/vmu-finally-falsify.test.mjs` 已登记（写入后 `entries` 计数与 membership 审计复核）。
- **第二个登记处＝？**（如实报告，不猜）：`docs/11:519` 把"双登记"定义为 **`package.json files` ＋ `installer.js` 的 `PRESETS.*.files`**。我实测：**6 个 preset 的 263 条 files 里 `tests/` 条目 = 0** ⇒ 测试文件**从来不是 preset 载荷**，第二处对测试文件不适用。若你要的第二个清单是别的东西（例如 face 所属卷的读数表），**点名我立刻补**——我没有把测试塞进 preset（那会把测试发进每个预设）。
- **又一次别人的漏登记（连续第二轮）**：`vibe-math-vmu/kernel/meetingmarker.js`（6924 B，存在）被已发布的 `meetings.js:13` import，却不在 `files[]` ⇒ membership **12/1**（`meetings.js -> ./meetingmarker.js`）。我**只加一行**登记，复跑 **13/0**；R10 的 `meetingleave.js` 是同一处拆分留下的同一类遗漏 ⇒ **建议**：meetings 面再拆分时，把"新模块进 `files[]`"当成拆分步骤的一部分。
- **临时区清理（按新规：只删本次显式创建的精确路径，不用前缀）**：本轮我只创建过 `D:\_tmp\r11-shutdown-probe.mjs`，已按**精确路径**删除；`vmu-falsify-*` 残留计数 **0**（库内 `TEMP-NOT-CLEANED` 断言 + 计数复核）。

## 5. 范式补充（本轮两条）

- **⑥ "防御性 `finally`"要被命名，而不是被绕过**。当构造存在、失败出口却不可达时，正确做法是：把"不可达"做成**实测断言**（库必须报 `PROBE-DOES-NOT-DISCRIMINATE`）＋ pin 一句"何时它会变红"，然后**转去证伪它真正调用的那一行**（本轮：`releaseSlot`）。比删掉这个 case 或编一个假变异都强。
- **⑦ 判据要能被复算**。B 项的结论不是"我觉得这儿没有 `finally`"，而是五列计数（0/0/0/0/0）＋一条绊线（体内出现 `acquire()` 才需要）。同一个形状也用在 §1 的清点上（哪些文件真有 `finally`，一个数说清）。

## 6. 未证伪清单（下一轮）

1. `mathjobs.js:224` 的子进程预算定时器 `finally`（F15 已分类，但"预算触发后 disposer 一定跑"可以被单点证伪：`disposeTimer(timerDisposer)` 删掉 ⇒ 注入定时器计数读取）；
2. `resume.js` 另外两处 `finally`（`:282` `replaying = false`、`:846` 释放）里，`:282` 的 `replaying` 旗标是否可观测；
3. `host-spawn.js:216-224` 的预算定时器（R4 已有回归探针，可升格为家族）；
4. `bus.js`／`scheduler.js`／`mathtools.js`／`migration.js`／`meetings.js` 各自那 1-2 处 `finally`（本轮只清点，未逐个证伪）。
