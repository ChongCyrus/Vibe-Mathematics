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
