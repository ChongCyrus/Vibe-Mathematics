# Phase 5 · **真机功能清点与拒绝归因**（Round 89）—— ★ "真机跑遍各功能"那门的证据

> ★ 作者＝Lead。★ 依据：真机转录 `…095034`（Round 88，**406s／3,798,192 tokens**，★ 该轮**已结题**）。★ 方法：★ **数【工具调用】与【拒绝码】，★ 不数转录里的词** —— ★ 本阶段已两次因"词出现"而误判。

## 1. ★★★★★ 触达面：**53 个 vmu 工具面**

★ **最活跃**：★ `turn` **121** 次／★ `meeting` **55**／★ `control` **31**／★ `task` **31**／★ `status` **25**／★ `formal` **19**／★ `chat` **13**／★ `mailbox` **13**／★ `records` **13**／★ `mathadapters`·`mathjobs`·`mathtools`·`publication`·`set` 各 **7** ✓
★ **其余 ~35 个面各触达 1 次**（★ admissions／arbitration／audit／auditchain／bidding／board／bridge／budget／capacity／charter／citations／clockguard／collab／conference／custody／discipline／explain／external／fairness／fidelity／governance／handover／human／idempotency／ip／middleware／minutes／notify／pack／panel／projmigrate／ratelimit／recruit／report／retention／reviewers／topology／transaction／wait 等）

★ **面上动作**：★ `meeting`: boxcast／boxclose／boxopen／list／open／status／summary；★ `control`: hire／roster；★ `formal`: check／status；★ `chat`: send ✓

## 2. ★★★★★★ 拒绝码归因：**7 种、共 28 次、★ 27 次是框架【正确地】拒绝**

| ★ 码 | ★ 次 | ★ 样本 | ★ 判定 |
|---|---|---|---|
| `VMU_INVALID_ARGUMENT` | 6 | `unknown record track: undefined (progress/routes/obstacles/rejected/state)` | ★ **正确**（★ 并**列出可接受值**）|
| | | `a message needs a non-empty `from`` | ★★ **真问题 → 本轮已修**（见 §2.1）|
| `VMU_STATE` | 5 | `illegal transition assigned -> done`／`unmet dependencies for t-2: t-1` | ★ **正确**（状态机与依赖都【真的】不满足）|
| `VMU_NO_OPEN_MEETING` | 4 | `no meeting is open (id: undefined)` | ★ 正确（★ 已知前置条件）|
| `VMU_TASK_DEPENDENCY_CYCLE` | 4 | `dependency cycle: t-1 -> t-2 -> t-1` | ★★ **框架成功【发现】了代理自己造的环** |
| `VMU_EXTERNAL_UNAVAILABLE` | 4 | `适配面需要注入 resolveExecutable（本机未接真解释器）` | ★ **正确且说清了**（★ 该部署确实没接解释器）|
| `VMU_LEAN_COMPILE_FAILED` | 4 | `Lean 编译失败（exit NaN）⇒ 未判定真假（编译失败 ≠ 命题为假 ✗）` | ★★ **正确**：★ **拒绝把"编译失败"当成"命题为假"** |
| `VMU_MATH_INVALID_INPUT` | 1 | `check 需要 statement 与 proof` | ★ 正确（★ 点名缺什么）|

⇒ ★★★★ **结论：★ 真机上唯一的行为缺陷是那条措辞（★ 已修）；★ 其余 27 次拒绝都是框架按设计拒绝，★ 其中两条（发现依赖环、拒绝把编译失败当真值）还是【功能在正常工作】的证据** ✓✓

### 2.1 ★★★ 那条真问题：拒绝消息点了【调用者无法供给】的参数名

★ **`kernel/chat.js` 与 `kernel/mailbox.js`** 的消息写 *"a message needs a non-empty `from`"* —— ★ **对服务自身参数是对的**，★ **但代理只通过工具面调用，★ 面的参数是 `by`** ⇒ ★ 真机代理原话：★ **"`vibe_vmu_chat` 的参数表里根本没有 `from` 字段（只有 `by`）"** ✓
★ **修法**：★ 消息改为 **"a message needs a non-empty sender id"**，★ hint 给出**代理真正要发的形状**：★ `{"action":"send","by":"<member id>","text":"…"}`，★ 并说明**为什么必须可审计** ✓
★ **判据**：★ 拒绝是**写给要修它的人**的，★ 所以要用**那个人的词汇**，★ 并说清它在**哪个面**上 ✓
★ **改前已核**：★ parity 门禁**只管 `math-computation.js`** ⇒ 这两个文件**不是共享副本**，★ 可安全修改（★ `SHARED PARITY 5/0` 复跑通过）✓

## 3. ★★★★ 诚实边界：★ "触达"不等于"充分验证"

★ **35 个面只被调用过 1 次** ⇒ ★★ **它们证明的是"这个面能注册、能被调用、不炸"，★ 而不是"它的各个动作都被验证过"** ✓
★ **因此本门【尚未完全满足】**：★ 若要主张"vmu 各功能真机完全无问题"，★ 还需要**逐面多动作、含拒绝路径**的定向实测（★ 这是一份可计划的清单，★ 不是再跑一遍全流程就能得到）✗
★ **已确认的强证据**：★ ① **53 个面在真机上都能被调用**；★ ② **28 次拒绝【没有一次是崩溃或引擎消息**（★ 全部是具名、可读、可执行的拒绝）**；★ ③ **该轮【结题达成**（★ `cast:true` ×15）✓✓
