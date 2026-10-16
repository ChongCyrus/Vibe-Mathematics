# Phase 5 · **收敛的最后一个阻塞点（★ 已定到行）**（Round 43）

> ★ 作者＝Lead。★ 依据：真机转录 `…010340` ＋ `tools/control.js` 的逐行阅读。

## 1. ★★★★★ 一句话

★★★ **`control.hire` 写的是【身份名册】（`kernel.identity.addMembership`），★ 而 `turn` 读的是【内核槽位名册】（`kernel.members`）** —— ★★ **两份互不相认** ⇒ ★ **名册永远是空的** ⇒ ★ **`turn` 永远回 `no-members`** ⇒ **无人被唤醒 → 无人表决 → 无论文 → 无 `finalize`** ✓✓

## 2. ★★★★★ 证据（★ 两条，★ 而第二条是"契约与实现相反"）

**（a）★ 实现：★ `tools/control.js:29` 逐字**
```js
if (action === 'hire') return Object.assign({ ok: true, action },
  kernel.identity.addMembership({ memberId: member_id, institution: institution === un… }))
```
⇒ ★★ **它写的是 `identity`** ✓✓

**（b）★★★ 而【同一个文件、同一段描述】说它走的是内核槽位** —— ★ `tools/control.js:8` 逐字：
> ★ *"…**roster** 只读花名册（带上限），**hire/fire 是成员加入与离开（走内核槽位，docs/17）**"* ✓✓

⇒ ★★★★ **即：★ 面自己的契约说"走内核槽位"，★ 而实现写的是身份名册** ⇒ ★★ **这是本阶段一直在消的"契约与实现相反"那一族** ✓✓✓

**（c）★ 而真机证实了后果** —— ★ 转录 `…010340`：
- ★ `vibe_vmu_admission` **只被调用 1 次**，★ **而【没有任何】`openPosting`／`apply`／`offer`／`accept`／`confirm`／`hire` 动作出现** ✓
- ★ **`roster`／`members`／`staff`／`confirmed`／`seated` 一个都不出现** ✓
- ★★ **`stopped: "no-members"`、`roundsRun: 0`** ✓
⇒ ★★ **代理从未招募任何人** ⇒ ★ **名册始终为空** ✓✓

## 3. ★★★ 而这是一个**鸡生蛋**问题

★ **名册为空 ⇒ 没有院士 ⇒ 没有人能雇人 ⇒ 名册仍为空** ✓✓
★★ **所以【必须有某个面把创所成员放进去】** ⇒ ★ **在 v5r 里那是 `vibe_v5_start { researcherCount, academician }`** ✓
★ **而在 vmu 里**，★ `control` 的 `hire` 本该承担（★ 或 `admission` 的 `confirm` ✓）⇒ ★★ **但 `hire` 写错了账本、★ `confirm` 没被调用** ✓✓

## 4. ★★★★ 修法（★ 两条，★ 而第二条更根本）

1. ★★★ **`control.hire` 必须【也】把成员放进内核槽位** —— ★ 即调用 **`members.assignRole(memberId, slot)`**（★ 与我在 `recruit.confirm` 里做的那次修复同一手法 ✓）⇒ ★ **要么补上这一步，★ 要么把它的描述改成事实**（★ 但那就等于承认它雇的人不会工作 ✓）✓
2. ★★★★ **更根本**：★ **两份名册必须收敛成一份**（★ 我在 Round 31 的裁定里已写过 ✓）⇒ ★ **以 `kernel.members` 为唯一真相**，★ **身份名册降为它的投影** ✓ —— ★★ **否则每加一个入口面，都要记得"顺手也写另一份"**，★ 而这正是双账本会不断复发的机制 ✓✓
3. ★★ **并给"名册为空时 `turn` 只回 `no-members`"补一条【可操作】的指引**：★ `no-members` 应带上 **`next`**（★ 例如"没有人被放进去；先用 control.hire 或 admission 的流水线 ✓"）⇒ ★ **否则使用者只会看到"no-members"，★ 无从知道从哪开始** ✓✓

## 5. ★★ 顺带：★ 本轮运行本身是【干净】的

★ `exit=0 dur=165s tokens=760,577 capHit=False timeoutOrFatal=False` ✓；★ `srv.err` **只有无害的 bundle 跳过** ✓
★ 而 **165s 比上一轮的 257s 更短** ⇒ ★★ **因为重复的接缝调用已经去掉（Round 42 ✓）** ✓
★ `packs:["v5r"]`／`appliedPacks:["v5r-core"]`／`store:true`／`library:true`／`phase:"round-robin"` ✓
⇒ ★★ **即：★ 机制【已经全部就位】，★ 只差"有人被放进名册"这一步** ✓✓

---

## 6. ★★★★★★★ Round 44：**修复已落地，★ 而真机证明研究所【开始工作了】**

### 6.1 ★★★ 修法：★ 三个动作【同批】搬到内核槽位
★ `tools/control.js`：★ **`roster` → `kernel.members.roster()`**／★ **`hire` → `await kernel.members.hire({id, slot})`**／★ **`fire` → `await kernel.members.end(...)`** ✓
★★★ **为什么必须三个一起**（★ 队友的关键提醒）：★ **只修 `hire` 会比不修更糟** —— ★ **调用者 hire 之后立刻 roster，★ 会看不到刚雇的人** ⇒ ★ **那是同一个"契约与实现相反"换了个位置** ✓✓
★ **并给 `hire` 加了 `slot` 参数**：★ **内核【绝不猜】成员担任什么角色** ⇒ ★ **缺失即具名拒**，★ **并列出已声明的槽位** ✓；★ **且"槽位满"与"没有声明槽位"用【不同】文案**（★ 一个是容量、★ 一个是接线缺口 ✓）✓
★★ **顺带发现**：★ **`vmu-control.test.mjs` 【不存在】** ⇒ ★ **控制面【没有任何测试】** —— ★ **这正是"一个描述写对了账本、实现却写错账本"能长期存活的原因** ✓✓

### 6.2 ★★★★★★★ 真机结果：★ 名册【真的有成员了】
```
members: "members":[{id:acad,role:chair}]     ← ★★★ 成员已入座（chair 槽位）
seated:  "seated":true                        ← ★★★ hire 回报已入座
```
★★★ **即：★ `hire` 现在真的把人放进 `turn` 读的那份名册** ✓✓✓

### 6.3 ★★★★★ 而整次运行的【形态完全变了】
| ★ 面 | ★ 本次 | ★ 上一轮 |
|---|---|---|
| ★★ **`vibe_vmu_turn`** | ★★ **x61** | ★ x31 |
| ★★ **`vibe_vmu_report`** | ★★ **x25（新出现）** | ★ — |
| ★ `vibe_vmu_set` | ★ x25 | ★ x13 |
| ★ `vibe_vmu_control` | ★ x25 | ★ x31 |
| ★ `vibe_vmu_status` | ★ x19 | ★ x31 |
★ **转录 3,092 KB**（★ 至今最大 ✓）／★ **耗时 289 秒／1,543,436 tokens**（★ 至今最长、最多 ✓）
★★ **并出现了新的【具名拒】**：★ `VMU_TASK_STALE_REVISION`（★ **CAS 起作用了** ✓）／★ `VMU_REPORT_PARAM_NOT_DECLARED`（★ **报告参数门** ✓）／★ `VMU_REPORT_NO_TRANSPORT` ✓
⇒ ★★★★ **即：★ 研究所现在【有成员、能驱动回合、能报告、任务板走 CAS】** ✓✓✓

### 6.4 ★★ 顺序证据（★ 偏移量）
```
seated:true                     @ 247,168        ← 入座（早）
members:[{id:acad,role:chair}]  @ 1,096,274
phase:"round…                   @ 1,576,328
"paper":                        @ 1,976,337      ← 论文段在【接近末尾】出现
vote_solved / allSolved          @ 1,833 / 2,188  ← 这两个在【提示词文本】里（很早）
```
★★ **`no-members` 仍出现**，★ 且**部分在入座之后** ⇒ ★ 说明**某条回合路径仍会先看到空名册**（★ 或 `set` 改动了名册 ✓）⇒ ★ **下一轮要查** ✓

### 6.5 ★ 诚实边界
★ **仍未观测到收敛**：★ **没有 `vote_solved:true` 的收束证据、★ 没有 `finalize`** ⇒ ★ **按手册铁律【不主张收敛】** ✓
★ **本轮完成的是一件**结构**修复**：★ **研究所第一次真的有人可以工作** ✓ —— ★★ **而"人能不能走到结题"是下一件** ✓
