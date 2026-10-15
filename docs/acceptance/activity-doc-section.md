# 待插入 docs/08 的小节：一次性 future-only 活动等待器（task-24）

> **给 `v5r-reader-c`（`docs/08-primitives-meeting-ballot-workflow.md` 的主人）**
> 建议位置：§25 之后，作为 **§26「Round 3 · 目标 2 缺口：一次性 future-only 活动等待器」**（编号/标题措辞听你的，正文可按你的卷风格重排，但**下面点名的标识符请逐字保留**——`tests/audit-module-coverage.test.mjs` 要求本模块的每个导出名都出现在**某个**卷里，且卷里必须出现模块名 `activity`）。
> 需要逐字出现的标识符（缺一即红）：模块名 `activity`、`createActivity`、`CODE`、`TIMEOUT_BOUNDS`、`ACTIVITY_KEYS`、`WIRED_ACTIVITY_KEYS`、`WAKE_ENTRY_ID`、`normalizeTimer`、`normalizeWakeOn`；服务名 `vmu.activity`；工具名 `vibe_vmu_wait`；7 个设置键（它们已在 `settings/schema.js` 里，写进卷里不会触发"文档里的键不存在"那条门禁）。
> 本文里所有"实测"读数都是原样命令跑出来的（`node tests/vmu-activity-*.test.mjs`）。

---

## 26. Round 3 · 目标 2 缺口：一次性 future-only 活动等待器（F52 / C-56）

> **判据**：`_handoff/vmu/03-v5r-full-inventory.md` 分片 A **§6 原语 F52**（"必须是未来一次性语义"）、**C-56**（`vibe_v5_wait`／`waitForActivity`／`notifyActivity`，`vibe-math-v5r.js:3424-3466`、工具 `:11142-11151`）。
> **缺口实测**：Round 3 之前 vmu 全树对 `waitFor`／`notifyActivity`／`vibe_v5_wait`／`activityWaiter` **零命中** ⇒ 成员只能轮询（烧 token）或永远等；这条直接落在"利于多智能体协作"的反面，故本轮补为内核原语。

### 26.1 新增内核原语（Round 3）

| 原语 | 文件 | 工厂 | 工具面 | 设置键（全部真读） | 新错误码 |
|---|---|---|---|---|---|
| 一次性 future-only 活动等待器 | `kernel/activity.js` | `createActivity({clock,log,settings,bus,timer,activePeers})` | `vibe_vmu_wait`（`tools/activity.js`，2 动作 `wait｜status`） | `vmu.activity.timeoutMs`／`timeoutMinMs`／`timeoutMaxMs`／`timeoutPolicy`／`wakeOn`／`maxWaiters`／`noPeerShortCircuit` | `VMU_ACTIVITY_INVALID_TIMEOUT`／`_NO_TIMER`／`_TIMER_INVALID`／`_BOUNDS_INVALID`／`_SIGNAL_INVALID`／`_ABORTED`／`_WAITER_LIMIT`／`_DISPOSED`／`_WAKE_HOOK_UNKNOWN`／**`_WAKE_UNWIRED`**／`_PEER_SEAM_FAILED` |

**导出面（本模块的公开名字，供 `tests/audit-module-coverage.test.mjs` 逐名核对）**：`apiVersion`（约定值）、`refuse`（具名拒绝构造器）、**`CODE`**（本面全部 11 个拒绝码的冻结表）、**`createActivity`**（唯一工厂）、**`TIMEOUT_BOUNDS`**（v5r 区间与默认值的**声明**默认）、**`ACTIVITY_KEYS`**（本面读的 7 个键）、**`WIRED_ACTIVITY_KEYS`**（＝上者，全部真读）、**`WAKE_ENTRY_ID`**（构造期注册的总线条目 id）、**`normalizeTimer`**（定时器接缝归一化：三形状＋平台定时器）、**`normalizeWakeOn`**（唤醒钩子名归一化，按 `kernel/bus.js` 的登记校验）。


**不变式（每条都有断言，且每条断言都被证明"能红"）**

- **只看未来（future-only）**：等待开始**之前**发生的通知**绝不**唤醒它。机制是**没有积压**——`notify()` 没有等待者时只记录事实（`notified:0`）并**不入队**；等待者登记时记下当时可见的通知序号（`openedSeq`），只有**更新的**通知才可能 resolve 它。v5r 的原话就是这条要求：**不能把历史活动当新活动**。
  > 证伪：`tests/vmu-activity-falsify.test.mjs` 把 `kernel/activity.js` 复制到 `D:\_tmp` 后**注入"历史重放"缺陷**（新来者被**已发生**的最后一条通知 resolve）并导入，同一探针必须变红（实测：真模块 `wokeOnHistory=false`，变异体 `true`）；另有一个文件内变异体做探测器自证。
- **一次性（one-shot）**：`notify()` 取走**当前这一代**等待者并清空集合，逐个 resolve **恰好一次**；第二条通知唤醒 `0`；被唤醒／超时／中止的等待者**当场注销**（`status().waiters` 归零）。
- **超时区间**：`[10000, 3600000]` ms（v5r `vibe-math-v5r.js:3435-3439` 的区间）。越界**默认具名拒** `VMU_ACTIVITY_INVALID_TIMEOUT`（与 v5r 同义，`hint` 里点名另一条路）；`vmu.activity.timeoutPolicy="clamp"` 是**声明的另一种**处置，钳制时回执自曝 `clamped:true` 并计数。边界本身是设置键（`timeoutMinMs`／`timeoutMaxMs`），**不硬编码两次**；`timeoutMinMs > timeoutMaxMs` 这类不可用组合**具名拒** `VMU_ACTIVITY_BOUNDS_INVALID`。
- **disposer 在所有分支清理**：成功／超时／中止三条路都汇入**同一个** `cleanup()`（摘等待者 → 调定时器 disposer → 摘 abort 监听），且幂等；连"注入的定时器在 arming 时同步触发"这种病态形状也把刚拿到的 disposer 补跑。`status().disposersCalled` 把这条纪律变成**读数**而不是承诺（实测三个分支各恰好 1 次）。
- **没有定时器就不假装有**：`timer: null` ＝"本部署没有定时器"⇒ `wait()` **具名拒** `VMU_ACTIVITY_NO_TIMER`，绝不返回一个永远不会超时的 promise。**省略** `timer` ⇒ 用平台定时器，`status().timer.shape` 报告 `global-setTimeout`（可注入三形状：`{timeout(cb,ms)->disposer}`、`{setTimeout,clearTimeout}`、`(cb,ms)->disposer`；`normalizeTimer` 负责归一化）。
- **可 abort**：`signal` 支持；`wait()` 在**已经 aborted** 时拒绝且**一个定时器都不 arm**。拒绝码**一律具名** `VMU_ACTIVITY_ABORTED`，signal 的 `reason` 保留在 `abortReason`／`cause`。
  > **与 v5r 的具名偏离**：v5r 在 reason 是 `Error` 时**原样 reject**（`vibe-math-v5r.js:3449-3451`）；这里同样保留 reason，但**码始终具名**——`AbortController.abort()` 的默认 reason 是 `DOMException`，其 `code` 是**数字 20**，一个数字型无名码越过工具面正是本项目拒绝的形态。
- **无活跃同伴立即短路（v5r parity）**：注入 `activePeers(me)` 后，没有**其他**在活成员时**立即**返回 `noProgress:{reason:'no-active-peer'}`，**不 arm 定时器、不登记等待者**——这就是"不空等、不烧 token"。接缝**抛错或返回非数组**⇒ 具名拒 `VMU_ACTIVITY_PEER_SEAM_FAILED`（**绝不**被读成"没人"）；`vmu.activity.noPeerShortCircuit=false` 是可声明的关闭开关；**没有**接缝时 `status().peerCheck.seam=false` 如实自曝（不假装查过）。
- **可观测、可终止**：`status()` 给出等待者列表／最后一条通知／通知环（有界、丢弃**计数**）／各拒绝码计数／策略快照／定时器来源／唤醒接线状态／`enforced[]` 口径；`keysUsed()`／`partition()`／`config()`／`refusals()` 齐备。`dispose()` 把未决等待**具名**结束（`VMU_ACTIVITY_DISPOSED`，**不算"等到了"**）、跑掉 disposer、并按名停掉总线条目。

### 26.2 唤醒来源（只有两个）

1. **命令式**：`notify({what,at})` —— v5r 的 `notifyActivity()` 同义，给握有服务的生产者调用。
2. **声明式**：声明 `vmu.activity.wakeOn: ['chat/sent', …]` 时，构造期在总线上注册**一个**观察条目（`id` ＝ `WAKE_ENTRY_ID` ＝ `vmu-activity-wake`，`kind:'module'`，`failure:'open'`，`order:900`），于是**真实已提交的状态变化**直接唤醒等待者，不必逐个生产者改代码。该 handler **返回 `undefined`**（不产生任何 decision）⇒ **坏掉的唤醒监听器永远不能阻断它所观察的写入**（实测：`bus.emit` 的 `decisions` 为空）。
   - 钩子词表**读自 `kernel/bus.js` 的登记**（单一真源，经 `normalizeWakeOn` 归一化）⇒ 名字写错是 `VMU_ACTIVITY_WAKE_HOOK_UNKNOWN` **具名问题**，而不是"静默订阅了一个没人 emit 的名字"；没有总线时同样具名上报（`wired:false` ＋ problems）。
   - 默认 `wakeOn: []` ＝ **零机制**：不注册条目、不挂监听器。
   - **热改等级 H2 的道理**：条目在**构造期**注册 ⇒ 改键**下次会话**生效；回执不得声称即时（`settings/schema.js` 的该行 doc 已写明）。
   - **已知相互作用（如实登记，不是缺陷）**：声明 `wakeOn` 会让总线**真的**多一个条目，于是 D-01 的 `middleware` 面"总线上已有条目即声明"这条 `extraIntent` 会随之一同点亮。

### 26.3 分层与边界

- **能力进内核**：等待机制（登记／一次性／future-only／disposer／abort／上限／短路）在 `kernel/activity.js`。
- **策略进 settings/pack**：区间上下界、拒／钳、等待者上限、是否短路、唤醒哪些钩子，全部是 `vmu.activity.*`（`who: office`；`H1` 的六键**每次调用现读**，故"下回合生效"是真的）。
- **`tools/activity.js` 只做寻址与调用**：它**不**复制区间策略（实测：低于区间的值原样交给内核，只有内核钳制），也不暴露 `notify`——**唤醒是已提交状态变化的事**，不是成员可以自己主张的事；成员想让事情发生就去产出（发言／派任务／开会）。
- **工具参数以 `docs/03` 的行为准**：`action`（缺省 `wait`）／`timeoutMs`／`why`／`me`；v5r 拼写 `timeout_ms`／`reason`／`member` 作为**别名**接受（便于照搬 v5r 调用）。
- **回执／拒绝的 D3 口径**：**每个**回执（被唤醒／超时／`noProgress`／`notify`／`dispose`）与**每个**拒绝都带 **`enforced[]`**（本面**这次调用**真正求值的键，数组、从不为 `undefined`）＋ **`enforcedScope:'evaluated-so-far'`**——与内核其余各面同一个名词、同一套语义。两条自曝纪律：① `vmu.activity.wakeOn` 是**构造期**键，只由 `keysUsed()` 承担，**不进**任何调用回执的 `enforced[]`（"未求值的键不得出现"）；② `vmu.activity.timeoutMs` 只在**调用方省略超时**时进入 `enforced[]`（那次调用真的读了默认值）；注入了同伴接缝时 `vmu.activity.noPeerShortCircuit` 必在列（它的值决定短路与否）。

### 26.4 验证（原样命令与读数）

| 命令 | 读数 |
|---|---|
| `node tests/vmu-activity-kernel.test.mjs` | `=== VMU ACTIVITY: 141 passed, 0 failed ===` |
| `node tests/vmu-activity-falsify.test.mjs` | `=== VMU ACTIVITY FALSIFICATION: 14 passed, 0 failed ===` |
| `node tests/vmu-activity-tool.test.mjs` | `=== VMU ACTIVITY TOOL: 58 passed, 0 failed ===` |

真机装配证据（`tests/vmu-activity-tool.test.mjs` §4）：声明 `vmu.activity.wakeOn:['chat/sent']` 的**真 kernel** 上，`k.activity.wait(...)` 被 `k.bus.emit('chat/sent', …)` **真的**唤醒（`notified.what==='hook:chat/sent'`）；同一装配下 `vmu.activity.noPeerShortCircuit=false` 的第 2 个 kernel **真的**超时（平台定时器）且 disposer 已跑；空名册时 `wait()` 立即 `noProgress:'no-active-peer'`。
