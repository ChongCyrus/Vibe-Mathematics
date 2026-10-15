# task-61 Round 8 · falsify 第 8–9 族（activity 统一形态 / storepolicy 锁纪律）＋ 范式推到**文档不变式**

> 累计：**10 个族 / 21 个单点缺陷**，全部"未变异绿 / 变异红"。
> 本轮新增：`activity` 从**手写形态统一到家族形态**（3 个变异，含一个**实测出来的"单点变异是空转"**教训）＋ `storepolicy` 锁释放纪律（2 个变异）＋ **文档不变式族**（`docs/07:502` 的承诺被同一套 falsify 守住）。
> 纪律：未跑全量 sweep、未 `regen-all`、未 git；变异体只写 `D:\_tmp` 且自建自删（有断言）；**未改任何他人测试**；集合断言同带非空前置（RULE E 指纹 **current=67 baseline=67，零新增**）。

---

## 1. 交付物

| # | 交付物 | 位置 |
|---|---|---|
| **第 8 族** | `activity` future-only/一次性/disposer —— 手写形态 → **家族形态** | `tests/vmu-activity-falsify.test.mjs`（**10/0**；3 处单点变异；家族接线 ~20 行） |
| **第 9 族** | `storepolicy` 锁的**独占与释放纪律**（F18 相邻） | `tests/vmu-storepolicy-falsify.test.mjs`（**9/0**；2 处单点变异） |
| **文档不变式族** | `docs/07:502` 的承诺："无端口无键 ⇒ `unackedMail` 是 **null，不是假 0**" | `tests/vmu-doc-invariant-falsify.test.mjs`（**9/0**；1 处单点变异；**文档引用本身是受检的控制字段**） |
| — | 本报告（含 §5 文档不变式配方） | `_handoff/vmu/activity-round8-report.md` |

---

## 2. A · 第 8 族：`activity` 统一到家族形态（并实测出一个重要教训）

**家族接线**：`falsifyFamily` ＋ `controlFields: ['timedOut','wokenTimedOut','disposersCalled']`；探针读三条不变式：future-only（历史不唤醒）、一次性（一次通知只唤醒当前一代；**超时后的等待器也不得复用**）、disposer（唤醒分支恰好跑一次）。Round 3/4 的手写复制/注入/导入/清理逻辑全部交给库，文件只剩"不变式 ＋ 缺陷"。

| 变异（单点） | 锚点 file:line | 变异体读数（具名红） |
|---|---|---|
| **历史被重放** | `activity.js:449`（`waiters.add(entry)` 之后插入历史重放） | `wokeOnHistory:true`（新来者被**已发生**的活动唤醒） |
| **已结算的等待器永不出列**（两处删除同去，`occurrences:2`） | `activity.js:394`（`cleanup` 内 `waiters.delete(entry)`）＋ arming 失败分支 | `lateNotified:1` —— 超时后的等待器仍被下一条通知**算作唤醒**（一次性被破坏）；而**被唤醒路径不受影响**（变异是窄的） |
| **disposer 被禁用** | `activity.js:395`（`if (timerDisposer) {`） | `disposersCalled:0`（唤醒分支留下未清理的定时器） |

### 2.1 实测教训（值得写进配方）：**"单点变异是空转"被库当场抓住**
我最初写的"一次性"变异是**删掉 `notify` 里的 `waiters.clear()`**，以及随后的"删掉 `cleanup` 里的 `waiters.delete`"。两次都被库判 **`PROBE-DOES-NOT-DISCRIMINATE`**（变异体读数与真模块**完全相同**）。原因（实测）：**一次性由两个独立机制保证**——`notify` 在取走当前一代时 `waiters.clear()`，而每个结算的等待器在 `cleanup()` 里自删；**任一单独失效都不改变可观察量**。
⇒ 只有"**超时**后的等待器"能暴露它（那条路径上没有 `notify` 的 clear，只靠 `cleanup`）：把 `cleanup` 的自删去掉后，`lateNotified` 从 0 变 1。**结论**：这不是库的误报，而是它正确地区分了"防御纵深"与"真正的单点依赖"；写族时必须找到**唯一**承重的那条路径。这一条已补进配方（§5.3）。

---

## 3. B · 第 9 族：`storepolicy` 的锁释放纪律（F18 相邻）

**为什么挑它**：F18 在 `05-framework-strength-evidence.md` 里是"部分"——锁原语与释放回执都在，但"每个分支都在 finally 释放"**未被证明**。本族证明的是它的**可观察核心**：*独占真的排他、释放真的放开*。

**探针读数**：首次 acquire ⇒ `locked:true`、holder 具名、`status().locks===1`；**持锁时第二次 acquire ⇒ `VMU_CONFLICT`**；release ⇒ `released:true` **且随后同一名字的 acquire 成功**（真的放开了）；释放一个**从未持有**的名字 ⇒ `released:false`（不假装释放）。

| 变异（单点） | 锚点 file:line | 变异体读数（具名红） |
|---|---|---|
| **release 报"已释放"但仍持有** | `storepolicy.js:179`（`const had = locks.delete(name)`） | `releasedFlag:true` 而 `afterReleaseOk:false`（下一位写者**永远被挡**——经典锁泄漏） |
| **acquire 从不登记持有者** | `storepolicy.js:172`（`locks.set(name, …)`） | `secondCode:'allowed'`（两位写者**同时持锁**）而回执仍说 `locked:true` |

---

## 4. C · 第 10 族（新形态）：**文档不变式**——让 docs 里的承诺也有可证伪的守卫

**被守的承诺**（`docs/07-durability-library.md:502`，逐字）：
> …计数进 `status().inflight.unackedMail`（＋`unackedMailSource`），`steps.mailbox.source='durable-mailbox-key'`，无端口无键 ⇒ 仍具名 `VMU_RESUME_MAILBOX_UNAVAILABLE`（**null，不是假 0**）。

**实现点**：`kernel/resume.js:948` `state.inflight.unackedMail = mb.attached ? mb.pending : null`。

**探针读两件事**：
1. **实现**：无端口且无耐久 `mailbox` 键 ⇒ `status().inflight.unackedMail === null`（且 `!== 0`）；端口答 3 ⇒ 3（source `'port'`）；耐久键答 1 ⇒ 1（source `'durable-mailbox-key'`）；
2. **文档本身**：正则读 `docs/07` 里"`unackedMail … null，不是假 0`"仍在 —— 作为 **`controlFields` 的一项**（`docSaysNullNotZero`）。⇒ **文档被删改，这个族会以 `CONTROL-FIELD-ABSENT` 具名红**，而不仅是实现。

| 变异（单点） | 锚点 file:line | 变异体读数（具名红） |
|---|---|---|
| **未知被写成舒服的 0** | `resume.js:948`（`: null` → `: 0`） | `unknownIsNull:false`、`unknownNotZero:false` —— 文档承诺的"null，不是假 0"当场被打破；而两个**真实计数（3 / 1）不变**（变异是窄的：只有"未知"那一支在撒谎） |

**这就是本轮 C 的结论**：文档承诺一旦被写成"**一个可观察量 ＋ 一个明确的错误替代**"（`null` vs `假 0`），它就能被同一套范式守住；而"文档引用"作为控制字段，使**文档与实现两侧同时受检**。

---

## 5. 配方增量

### 5.1 "文档不变式"三条件（能守的承诺长什么样）
1. **点名可观察量**：一个 `status()` 字段／一个拒绝码／一个计数（"`status().inflight.unackedMail`"✓；"系统应当稳健"✗）；
2. **点名错误替代**：明确说出**不许**变成什么（"**null，不是假 0**"✓）——只描述正确值无法构造反例；
3. **有单点实现行**：那句承诺由**一处**代码决定（`resume.js:948` ✓）——否则变异不是单点。

### 5.2 五步接一个文档不变式族（照抄）
1. 在卷里挑一条满足 §5.1 的承诺，记下 `docs/<卷>:<行>`；
2. 找到实现那一行（`grep` 承诺里的字段名）；
3. 探针同时读：**实现行为**（含"真实值"方向作控制）＋ **文档文本**（正则，作为 `controlFields` 的一项）；
4. 列一处变异：把实现改成承诺明令禁止的形态（如 `null → 0`）；
5. `ok(family.ok, …)` ＋ 断言变异体的**具名红**（`unknownIsNull === false`）。~40 行，其中探针占一半。

### 5.3 新增的第六条纪律（本轮实测）
**"单点变异"必须找到唯一承重路径**：若同一性质由**两个独立机制**保证（本轮的 `waiters.clear()` ＋ `cleanup()` 自删），单独改任何一个都是**空转**，库会以 `PROBE-DOES-NOT-DISCRIMINATE` 拒绝——这是**正确**的，不要靠"改两处"绕过，而是换一条**只有一处保护**的可观察路径（本轮：超时后的等待器）。若确实两处都要改，就把它**声明成一个缺陷的两处站点**（如 chat 族的 `occurrences:2`）并在标签里写明。

---

## 6. 原样命令与退出码（定向单跑）

```
node tests/vmu-activity-falsify.test.mjs      -> === VMU ACTIVITY FALSIFY: 10 passed, 0 failed ===   exit=0   (手写→家族形态)
node tests/vmu-storepolicy-falsify.test.mjs   -> === VMU STOREPOLICY FALSIFY: 9 passed, 0 failed === exit=0
node tests/vmu-doc-invariant-falsify.test.mjs -> === VMU DOC-INVARIANT FALSIFY: 9 passed, 0 failed === exit=0
node tests/vmu-human-falsify.test.mjs         -> === VMU HUMAN FALSIFY: 12 passed, 0 failed ===      exit=0   (R7 族，未回归)
node tests/vmu-tasks-falsify.test.mjs         -> === VMU TASKS FALSIFY: 9 passed, 0 failed ===       exit=0
node tests/vmu-resume-falsify.test.mjs        -> === VMU RESUME FALSIFY: 9 passed, 0 failed ===      exit=0
node tests/vmu-fidelity-falsify.test.mjs      -> === VMU FIDELITY FALSIFY: 10 passed, 0 failed ===   exit=0
node tests/vmu-mailbox-falsify.test.mjs       -> === VMU MAILBOX FALSIFY: 10 passed, 0 failed ===    exit=0
node tests/vmu-chat-falsify.test.mjs          -> === VMU CHAT FALSIFY: 8 passed, 0 failed ===        exit=0
node tests/vmu-panel-falsify.test.mjs         -> === VMU PANEL FALSIFY: 9 passed, 0 failed ===       exit=0
node tests/vmu-activity-falsify-lib.test.mjs  -> === VMU FALSIFY LIB: 27 passed, 0 failed ===        exit=0
node tests/audit-declaration-criterion.test.mjs -> 74 passed, 1 failed                               exit=1   (RULE E current=67 baseline=67：我的文件零新增)
node tests/audit-scope-classification.test.mjs  -> 38 passed, 0 failed                               exit=0
node tests/audit-code-size.test.mjs             -> 9 passed, 0 failed                                exit=0
node tests/audit-dependency-cycles.test.mjs     -> 5 passed, 0 failed                                exit=0
node tests/audit-vmu-orphan-methods.test.mjs    -> 4 passed, 0 failed                                exit=0
```

**唯一一条红不属我**：`audit-declaration-criterion` 的 `regen-all --check really runs green`（生成链，Lead 的 regen 步骤）。R7 我报过的两条 RULE E（`audit-fs-purpose.test.mjs:B`、`vmu-meeting-parity.test.mjs:A:roster`）已由对应主人修好，指纹回到 baseline。

---

## 7. 累计覆盖（10 族 / 21 个单点缺陷）

| 族 | 面／文档 | 不变式 | 变异数 |
|---|---|---|---|
| 1 | `kernel/mailbox.js` | ack 只在投递成功之后 | 2 |
| 2 | `kernel/chat.js` | 配额与禁言真的强制 | 2 |
| 3 | `kernel/panel.js` | 子任务字段真的写入 ＋ 状态词表真的校验 | 2 |
| 4 | `kernel/resume.js` | 未读的快照永不被覆盖（含"读失败不算读过"） | 2 |
| 5 | `kernel/fidelity.js` | C-45：布尔票被强制改写为 0.5 弃权 | 2 |
| 6 | `kernel/human.js` | 未批不生效／批准必解除／沉默不等于同意 | 3 |
| 7 | `kernel/tasks.js` | 环在两个写入口都被具名拒 | 2 |
| 8 | `kernel/activity.js` | future-only ＋ 一次性（含超时后不复用）＋ disposer | 3 |
| 9 | `kernel/storepolicy.js` | 锁独占 ＋ 释放真的放开 | 2 |
| 10 | **`docs/07:502` → `kernel/resume.js`** | **"unackedMail 是 null，不是假 0"** | 1 |

---

## 8. 未做项 / 下一轮候选

1. **只挑了 1 条文档承诺**（`unackedMail`）：`docs/03 §2` 的工具面表、`docs/07` 的"写前必读闸被拒时 0 键落地"（本仓已有族 4 覆盖实现侧，但**没有**把 docs 引用做成控制字段）、`docs/08` 的"fired ⊆ enforced"都可按 §5.2 接；**建议下轮挑 2–3 条**，让"文档承诺"成为常态而不是样板。
2. **`storepolicy` 的锁只证了"独占/释放"**：`lockSerializeAll` 的单车道、`lock.timeoutMs/retries/backoffMs` 的退避计数、以及"真写路径在 finally 释放"（F18 的原句）**未**证伪——已如实登记。
3. **`activity` 的家族只覆盖 3 条不变式**：peer 短路、`wakeOn` 接线、`maxWaiters` 等仍未证伪（Round 3/4 的 kernel 套件有断言，但没有变异证明）。
4. **未跑**：全量 sweep、`regen-all`、`git`（Lead 统一）。
5. **临时文件**：三个族的变异体全部由库写进 `D:\_tmp` 并在 `finally` 删除（每文件 `leftovers.length === 0` 断言）；我的 scratch 无残留。
