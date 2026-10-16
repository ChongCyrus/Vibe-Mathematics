# Phase 5 · **收敛阻塞点的根因（★ 已定到行）**（Round 31）

> ★ 作者＝Lead。★ 方法：★ 三路互证（★ 真机读数 ＋ `vmu-core2` 的名册溯源 ＋ 我逐行读 `recruit.js` / `members.js`）。

## 1. ★★★★ 一句话根因

★★★ **`kernel.members`（★ `turn` 读的那份名册）里【从来没有人被放进去】** —— ★ 因为**唯一能把人放进去的已发布服务 `assignRole()`，★ `recruit` 的招募流水线【一次都没调用】** ✓

## 2. ★★★★★ 证据链（★ 逐条带行）

| # | 事实 | ★ 行 | ★ 说明 |
|---|---|---|---|
| 1 | ★ 真机：★ **`appliedPacks:["v5r-core"]`／`store:true`／`library:true`，★ 但 `members: 0`** | ★ `slv5q` 回执 | ★ **pack 装上了**；★ 而 **`members: 0` 不是 `null`** ⇒ ★★ **名册【存在但为空】** ✓ |
| 2 | ★ 名册由**槽位**造出来 | ★ `kernel/index.js:687` `let members = createMembersList({ slots, … })` | ★ **`slots` 空才为 `null`**；★ 本机不是 null ⇒ **槽位已声明** ✓ |
| 3 | ★ 唯一写 `slots` 的入口 | ★ `kernel/index.js:1818` `declareSlots(list)` | ★ **唯一调用者＝pack 装载器**（★ `kernel/pack.js:474-476`）✓ |
| 4 | ★★ **v5r pack 【确实声明了】槽位** | ★★ `packs/v5r/v5r-core.js:163` `slots: [` | ★ 注释逐字：★ *"v5r's institute roster, as OPAQUE SLOTS (D5: the kernel never learns what 'academician' means)"* ✓ |
| 5 | ★★ **把成员放进槽位的【已发布服务】** | ★★ `kernel/members.js:117-118` ★ `/** Place a member into a slot… */ async assignRole(id, slotId)` | ★ **`:123` 逐字**：★ *"`assignRole` is a **PUBLISHED service** (docs/03 §2)"* ✓ |
| 6 | ★ 它做了什么 | ★ `:135` `assertSlot(slotId)`／★ `:149` `members.set(id, rec)`（★ `state:'live'`）／★ **`:150` `bus.emit('task/assign', …)`** | ★★ **写入名册 ＋ 发出派单事件（★ 那正是"唤醒成员"的动作）** ✓ |
| 7 | ★★★ **`recruit` 对 `members` 的【唯一】用法是只读** | ★★★ `kernel/recruit.js:213` `members.permissionsOf(memberId)` | ★★ **整个 `openPosting→apply→offer→accept→confirm` 流水线【从不调用 `assignRole`】** ✓✓ |

★ 另：★ `recruit.js` 维护**自己的 `staff` Map**（★ `:89`／`:96`／`:103`）⇒ ★★ **于是至少三本账**：★ **(a)** `kernel.members`（★ `turn` 读的，★ 唯一真相应为它）／★ **(b)** `identity.js` 的 Map／★ **(c)** `recruit.js` 的 `staff` ✓
★★ **而内核自己早就把洞具名了**：★ `kernel/index.js:1394` 逐字 ★ *"**NO production path REQUIRES a roster today**: consumers read the (nullable) `kernel.members` property and each mo…"* —— ★★ **"没有一条生产路径需要名册"＋"消费者读一个可空属性"，正是双账本生长的土壤** ✓

## 3. ★★ 一处**很可能同时踩到**的配置缺口

★ `vmu.roles.map`（★ 职位名 → 槽位）★ **声明在 `settings/schema.js:379`，★ 而 `def: {}`（★ 默认为空）** ⇒ ★ doc 逐字：★ *"职位名 → role slot 显式映射（**S-1：内核不认识职位名，未映射即拒**）"* ✓
★ 而 `recruit.js:6` 的 **INVARIANT S-1** 逐字：★ *"the kernel does NOT know job titles. A title must be mapped EXPLICITLY to a role slot"*，★ `:86` 的拒绝文案也逐字给出修法：★ *"the kernel does not know titles; add `vmu.roles.map["<title>"]=<slot>`"* ✓
⇒ ★★ **所以除了"没人调用 `assignRole`"之外，★ 还要确认 `vmu.roles.map` 有值（★ 应由 pack 的默认值提供）** ⇒ ★ **否则连 `openPosting({slot})` 的 slot 都拿不到** ✓

## 4. ★★★ 修法（★ 按此序，★ 一次落完）

1. ★★★★ **让 `recruit` 的 `confirm`（或 `accept`）在把候选人确认成 staff 时【调用 `members.assignRole(id, slot)`】** ⇒ ★ **这样成员才真的进入 `kernel.members`、★ 才会发出 `task/assign`、★ `turn` 才不再说 `no-members`** ✓ —— ★★ **这是让收敛成为可能的【那一步】** ✓
2. ★★★ **收敛成【一份名册】**：★ **以 `kernel.members` 为唯一真相**；★ `recruit.staff` 与 identity 名册**降为它的投影**（★ 或删掉）✓
3. ★★ **`kernel.members` 为 `null`（★ 无 pack 声明槽位）时【具名拒】**（★ "这个内核没有声明任何角色槽位"），★ **而不是让 `turn` 回 `no-members`**（★ 那会让人误以为"成员不肯投票" ✓）
4. ★★ **确认 `vmu.roles.map` 有 pack 默认值**；★ **否则在 `openPosting` 处具名拒**（★ 文案已现成 ✓）
5. ★★ **两个裸崩改具名拒**：★ **(a)** `turn` 显式 `members` 的 `TypeError`（★ `Cannot read properties of undefined (reading 'id')`）；★ **(b)** `hasDeliverSeam:false` —— ★ 注意它是**状态字段**（★ `kernel/mailbox.js:577`／`kernel/meeting.js:481` 都只是报告），★ **具名拒要加在【真的要用投递】的调用点** ✓
6. ★ **顺带**：★ `apply` 的 `posting` vs `postingId`；★ `ballot.opened.target` 为 `null` ✓

## 5. ★★ 验证要求（★ 上一轮教训）

★ **改后三件事都要做**：★ **① `import` 该模块跑一次**；★ **② 源码结构探针**（★ 断言新守卫在**函数体内**）；★ **③ 一个反例**（★ 守卫缺失时必须红）✓
★ **锚点必须【唯一且是代码形状】**（★ 不要子串 —— ★ 上一轮命中的正是**头部引用同一段代码的注释** ✓）
★ **端到端判据**：★ **`kernel.members.roster()` 非空 ＋ `turn` 的 `stopped` 不再是 `no-members`**（★ 不是"计数不为 0"这种弱判据 ✓）
