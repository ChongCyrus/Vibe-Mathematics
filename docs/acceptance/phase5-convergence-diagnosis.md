# Phase 5 · **"很活跃却不收敛"的完整诊断**（Round 47）

> ★ 作者＝Lead。★ 依据：真机转录 `…012707`（1654 KB）＋ `kernel/turn/index.js` 的 `FIELD_OWNERS` ＋ 原版 `vibe-math-v4.js:2369`。

## 1. ★★★★★ 一句话

★★ **研究所确实在【真工作】（★ 会议 61 次、★ 任务 31 次、★ 三个成员、★ `no-members` 归零 ✓），★ 但它【永远不会收敛】—— 因为结题要的那张票，★ 走的是【回复字段】`vote_solved`，★ 而**没有任何一个代理填过它** ✓✓

## 2. ★★★★★ 机制（★ 忠实于原版，★ 这点已被核实）

★★ **`kernel/turn/index.js:47`**：
```js
vote_solved: Object.freeze({ face: 'vmu.ballotbox', op: 'cast' }),
```
★ **它是 `FIELD_OWNERS` 的一张表**：★ **代理【回复里】的每个字段，★ 由它路由到一个【面】** ✓
★ **`:43-46` 的自述**：★ *"the rest of the reply surface **the original parses** …… checked against what the kernel's services REALLY expose at runtime —— **the ballot box carries `cast`** —— so nothing here is invented"* ✓✓
⇒ ★★★ **即：★ 原版从 `speakers[].voteSolved` 取"是否认为已解决"，★ vmu 把同一个字段【路由】到票箱的 `cast`** ✓✓ —— ★ **忠实** ✓

★★ **原版逐字**（★ `vibe-math-v4/vibe-math-v4.js:2369`）：
```js
const allSolved = allSpoke && speakers.length>0 && speakers.every(iv=>iv.voteSolved===true)
```
⇒ ★ **原版：★ 全体发言者的 `voteSolved` 都为 true ⇒ `allSolved`** ✓✓

## 3. ★★★★★ 而真机上的读数

| ★ 信号 | ★ 读数 | ★ 含义 |
|---|---|---|
| ★ `"vote_solved":true\|false` | ★ **0 次** | ★★★ **没有任何代理【填过这个字段】** ✓ |
| ★ `boxopen`／`boxcast`／`boxclose` | ★ **各 0 次** | ★★ **票箱从未被打开/投票/关闭** ✓ |
| ★ `vote` | ★ **16 次** | ★★ **代理用的是【会议面】的 `vote`** ✓ |
| ★ `tally` | ★ 4 次 | ★ 会议面的计票 ✓ |
| ★ `"quorum"` | ★ **0 次** | ★★ **法定人数从未被求值** ✓ |
| ★ `"paper"` | ★ **0 次** | ★ 论文段从未进入 ✓ |
| ★ `phase` | ★ `round-robin → round…` | ★ 一直停在轮值 ✓ |

⇒ ★★★★★ **所以链条是**：★ **代理【没有】在回复里填 `vote_solved`** ⇒ ★ **`FIELD_OWNERS` 的路由从不触发** ⇒ ★ **票箱从不 `cast`** ⇒ ★ **票箱的一致结果从不产生** ⇒ ★ **停止条件永不为真** ⇒ ★ **`phase` 永远停在 `round-robin`** ✓✓✓

## 4. ★★★★ 为什么它会这样（★ 两条，★ 都值得修）

1. ★★★ **提示词说了要填，★ 而代理选择了别的动作**：★ `v5r-blocks-a.js:584` 逐字写着 ★ *"`vote_solved`：你是否认为原问题已解决……**只有全体有表决权者都 true 时才会停止**"* ✓ —— ★★ **但同一个面里【还有一个】`vote` 动作（★ 会议级表决 ✓）** ⇒ ★ **代理自然会去用它** ✓✓ —— ★★ **两套表决语义，★ 而只有一套能结题** ✓✓
2. ★★★ **"沉默会阻止结题"这条很好，★ 但它【没有告诉使用者去哪填】**：★ 缺 `vote_solved` ⇒ **不结题** ✓ —— ★ **而代理拿不到"我该把票放进回复的哪个字段"这一步的操作指引** ✓✓

## 5. ★★★★ 修法（★ 按哲学理念排序）

1. ★★★★ **最要紧：★ 让"两套表决"合并、或在指引里点名哪一套结题** —— ★ **要么** ★ **会议的 `vote` 在**一致表决**时【也】写一张箱票**（★ 于是两条路都能结题 ✓）；★ **要么** ★ **在会议面的描述与提示词里【明说】：★ "结题票是回复字段 `vote_solved`，★ 不是 `vote` 动作"** ✓✓
   ★★ **按哲学理念，我倾向第一种的【受限】版本**：★ **框架不猜**，★ **但应当在【同一处】把这两条路的关系讲清楚**（★ 因为"自由度"不等于"让使用者猜哪条路能结题" ✓）
2. ★★★ **`no-members` 那条已做的 `next` 指引，★ 在这里同样需要**：★ **当轮值跑满却没有 `vote_solved` 时，★ 状态面应当【明说】"本次无人填结题票；★ 需要全体有表决权者在回复里填 `vote_solved`"** ✓✓
3. ★★ **并给"票箱没被用过"一个可观测读数**：★ **状态面的 `phase` 段应当带上"最后一张箱票 / 是否有未结的箱"** ✓

## 6. ★★ 诚实边界

★ **本轮【未改代码】** —— ★ **这是一份诊断**，★ **修法已按优先级列出** ✓
★ **仍未主张收敛**：★ **`vote_solved` 零次、★ `paper` 零次** ⇒ ★ **按铁律不主张** ✓
★ **而这次诊断把"活跃 ≠ 收敛"变成了"活跃 ＋ 缺一张指定字段的票"** ⇒ ★★ **剩下的是一件【明确、可修】的事** ✓

---

## 7. ★★★★★★★ Round 48–49：**结题谓词【不存在】，★ 而修法已完整定到行**

### 7.1 ★★★★★★ 决定性证据：★ 结题那一个字段【只被记录、★ 没有被数】
★ **`kernel/turn/index.js:70-74`** 注释逐字：
> ★ *"ROUND 378 adds the fields the original parses that have **NO matching operation in this kernel yet**:
> **`solved`（the member's own round judgement）**, `prioritize`, `nudge`, `reject_assign`, `hire` and `fire`.
> They are **BOOKKEPT rather than dispatched** …… **the gap stays visible instead of hiding behind a refusal**."*
★ **`:611`**：★ `context.set(field, r[field])` ⇒ ★★ **`solved` 记进了 turn 状态，★ 而【没有任何东西去数它】** ✓✓

### 7.2 ★★★★★★ 这个区域有【三个】字段，★ 而结题那一个恰是"只记录、不派发"的
| ★ 字段 | ★ 现状 | ★ 后果 |
|---|---|---|
| ★★ **`solved`**（＝成员自己的回合判断，★ **正是原版 `speakers[].voteSolved` 的语义**） | ★ **BOOKKEPT，★ 不派发** | ★★ **记了，★ 没人去数** |
| ★★ **`vote_solved`** | ★ 派发 → `ballotbox.cast` | ★★ **缺 `by`／`boxId` ⇒ 每次必拒** |
| ★ **`verdict`** | ★ 派发 → `ballotbox.cast` | ★ 同上 |
⇒ ★★★★ **即：★ 就算把路由修好，★ 票也只是落进某个地方，★ 而仍然没有人去数它** ✓✓

### 7.3 ★★★★★ 第三种失败模式（★ 队友发现，★ 我认为是这几轮最有价值的观察之一）
★★ **`vote_solved` 既不是 `face-not-wired`、★ 也不是 `executed`** —— ★ **它的面接了、`op` 存在，★ 却每一次调用都必然被拒** ✓
★ 而 **`:600` 的 `counts.dispatched += 1` 会把它记成"【已派发】"** ⇒ ★★★ **"派发了"与"起作用了"被同一个计数混在一起** ✓✓
⇒ ★★★ **这正是"61 次会议而使用者看不出缺的就是这张票"的机制** ✓✓

### 7.4 ★★★★★★ 新谓词里的【三个陷阱】（★ 落笔前必须先定，★ 否则会再造一次"修了却不收敛"）
**① ★★★ `chair` 【没有】`vote` 权限 ⇒ `missing` 若按全体名册算，★ `cast` 永远不可能为真**
★ 依据 v5r pack 逐字（★ `packs/v5r/prompts/v5r-core.js:163-167` ✓）：
- ★ `chair`：`['convene','close','assign','grant','freeze']` ⇒ ★ **不含 `vote`**
- ★ `member`：`['speak','vote','propose']` ⇒ ★ **含 `vote`**
- ★ `temp`：`['speak']`（capacity 12）⇒ ★ **不含 `vote`**
⇒ ★★★★ **有表决权的只有 `member` 槽位上的人**；★ **若 `missing` 用 `members.roster()`（含 `chair`／`temp`）去算，★ `chair` 会永远留在 `missing` 里 ⇒ `cast` 永远 false** ✓✓
⇒ ★ **`missing` 必须＝"其槽位授予了结题表决权的在册成员" 减去 已表态者** ✓

**② ★★★ "哪个权限名算结题表决权"本身是【部署词汇】⇒ 框架不得硬编码 `'vote'`**
⇒ ★ 与 7.2 那条 (a)/(b) 裁定**同一个道理**（★ 票箱的选项也是部署词汇 ✓）✓
⇒ ★ **两条一致选法**：★ **(α) 用已声明的东西** —— ★ 先查是否已有可用的声明键（★ **未查**）；★ 没有则加一个**设置键**（如 `vmu.turn.closureVotePermission`），★ **默认值由 pack 给**（`packs/v5r/settings/defaults.json` ✓）；★ **(β)** 若把 `vote` 定为框架级能力令牌，★ **必须在一处讲清** ✓ —— ★ **倾向 (α)：★ 别替部署发明词汇** ✓

**③ ★★ `solved` 是【每回合】状态，★ 而结题是【每轮/每场次】判断 ⇒ 必须先定义【窗口】**
⇒ ★ **窗口不写明，★ `missing` 与 `cast` 就没有意义**（★ 同一个字段两种读法 ⇒ 下一次"两个视图不一致" ✓）
⇒ ★ 建议回执里**同时给出窗口标签**（★ `window:'round'|'meeting'` ✓）✓

### 7.5 ★★★★ 落点表（★ 一次落完）
| # | ★ 落点 | ★ 形状 |
|---|---|---|
| **1** | ★ `turn` 的 status/回执计算段 | ★ `closureVote: { window, cast, for:[ids], against:[ids], missing:[ids], reason }`；★ **`missing` 按 7.4① 算**；★ **权限名不硬编码**（7.4②）；★ `reason` 给可操作的下一步 |
| **2** | ★ `turn/index.js:47` ＋ `:599` | ★ **`vote_solved` 改绑 `{ face:'vmu.meetings', op:'vote' }`**（★ **不是票箱** ✓）；★ 上下文补 `member` 与当前会议 id；★ **拿不到会议 ⇒ 具名拒并说明** |
| **3** | ★ `:600` 附近 | ★ **单列 `counts.refusedByFace` ＋ 回执 `failed:[{field, code}]`** ⇒ ★ **"派发但被拒"不再冒充"已派发"** |
| **4** | ★ `phase` 段 | ★ 带结题票状态 |
| **5** | ★ 面描述／提示词 | ★ **一处讲清两套表决**：★ 会议级 `vote` ＝ **能结题**那条；★ `ballotbox.cast` ＝ 另一条（要 `boxId`／`by`）|

### 7.6 ★★★ 为什么改绑会议级而【不是】票箱（★ 理由两条，★ 只有一条被驳倒时仍不足）
1. ★★★ **票箱会逼框架【发明部署的词汇】**：★ `ballotbox.cast` 需 `boxId`（★ `:189-190` 缺失即 `deny('VMU_NOT_FOUND', '找不到票箱 …', '先 open() 取 id')` ✓），★ 而 `open()` 需**至少两个选项**（★ `:184` ✓）⇒ ★ **结题票的选项只能是"已解决／未解决"**，★ **而那是政策用词，★ 不是能力** ⇒ ★★ **"自动开箱"不是捷径，★ 它就是缺陷** ✓✓
2. ★★★ **它还需要一个【凭空来的】`by`**：★ `cast` 缺 `by` 即拒（★ `:195` ✓），★ **而派发手里只有 `{field, face, op}`**（★ `:599` ✓）⇒ ★ **这条路要同时发明【箱的选项词汇】与【票的来源】** ✓；★ **而会议级 `vote({meeting, member, motion, value})` 两个都不需要** ✓
★ **parity 也指向同一答案**：★ 原版 `voteSolved` 是**发言记录上的字段**（★ `vibe-math-v4/vibe-math-v4.js:2369` ✓），★ **不是票箱里的一张票** ✓✓

### 7.7 ★★ 验收（★ 端到端最重要）
★ **①** 多人回复 `solved:true` ⇒ ★ **`closureVote.cast === true`**；★ 有人未表态 ⇒ `false` ＋ **`missing` 点出是谁** ✓
★ **②** `vote_solved:true` 经 `turn` 派发**不再必拒** ✓
★ **③** "必然被拒"不再被记成"已派发" ✓
★ **④** `vmu-turn` 148／`vmu-control` 23／`vmu-kernel` 183／`vmu-meeting` 50 仍绿 ✓

### 7.8 ★ 诚实边界
★ **本轮【未改代码】**（★ 诊断与规格，★ 落点都在行上 ✓）；★ **仍未主张收敛** ✓
★★ **而问题已收敛到【一件**明确、可修、且陷阱已列全**的事】** ⇒ ★ **下一个完整窗口可一次落完** ✓
---

## 8. ★★★★★★★ Round 52：**谓词立刻见效 —— 它把一个【此前不可见】的阻塞点名了，★ 而代理当场对它有反应**

### 8.1 ★★★ 而这正是整个序列的目的：★ 把"看不见"变成"具名"
★ 真机（★ 232 秒／2,059,132 tokens —— **至今最多** ✓／会议 49 次／control 43／turn 43／report 25／status 25 ✓）
★★ **`closureVote` 出现 49 次／`vote_solved` 出现 8 次／`missing` 出现 59 次** ✓✓ —— ★ **新读数【真的被返回并被查看】** ✓
★★★ **而转录里出现了两种【各自可操作】的读数**：
```
closureVote: { cast:false, eligible:[], missing:[],
               reason: "no member holds the closure-vote permission, so unanimity is unreachable
                        (check the pack slot permissions…)" }
closureVote: { cast:false, eligible:["m1","m2"], missing:["m1","m2"],
               reason: "silence blocks closure; no judgement yet from: m1, m2" }
```
⇒ ★★★★ **两条都【点名了原因】，★ 而且第二条【点名了是谁】** ✓✓

### 8.2 ★★★★★ 而代理【读到了，★ 并当场行动】
★ 转录里逐字：★ *"**no member holds the closure-vote permission. Driving turns now.**"* ✓✓
⇒ ★★★ **即：★ 一个此前完全不可见的条件（★ 开了 61 次会却不知道为什么结不了题）** ⇒ ★★ **现在被【具名】，★ 而使用者与代理【立刻知道该做什么】** ✓✓✓
⇒ ★★ **这正是加这个谓词的全部理由** ✓

### 8.3 ★★ 仍未收敛，★ 而原因现在是【具体且可查的】
★ `"paper": 0`／`allSolved: 0` ⇒ ★ **仍未结题** ✓
★★ **而原因**：★ **没有【全体】有表决权者都填 `vote_solved: true`**（★ 该字段只出现 8 次 ✓）
⇒ ★★★ **但与上一轮的差别是决定性的**：★ **此前是"不知道为什么"；★ 现在是"m1 与 m2 还没表态"** ✓✓
⇒ ★★ **这个差别就是"不可诊断"与"可诊断"的差别** ✓

### 8.4 ★★★ 顺带：★ 早期 `eligible: []` 本身也是一个真实发现
★ **它出现于【成员还没入册】的早期** ⇒ ★ **而提示词要求"至少放 3 个成员（1 chair ＋ 2 member）"** ✓
⇒ ★★ **所以这条读数实际上在【教使用者怎么开始】** —— ★ **"no member holds the closure-vote permission" 比 "no-members" 更精确，★ 因为它说的是【权限】而不是【空】** ✓✓
★ **建议（★ 下一轮可选）**：★ **`eligible: []` 时，`reason` 里直接点出操作步骤**（★ "先用 control.hire 放成员，★ 且槽位需授予 `vote`" ✓）—— ★ **与 `no-members` 那条 `next` 同一手法** ✓

---

## 9. ★★★★★★★★ Round 54：**论文阶段【首次出现】，★ 入册【真的在发生】—— ★ 而剩下的缺口【精确】了**

### 9.1 ★★★★ 与以往每一次的差别（★ 同一模型、★ 同一任务书、★ 只差那两条读数）
| ★ 信号 | ★ 本轮（★ 231 秒／1,168,461 tokens／3,158 KB —— **转录最大** ✓） | ★ 以往各轮 |
|---|---|---|
| ★★★★ **`"paper"`** | ★★★★ **47** | ★ **0（★ 每一次都是 0）** |
| ★★★ **`hire`** | ★★★ **93** | ★ 0～3 |
| ★★★ **`institution`** | ★★★ **36** | ★ — |
| ★★ **`vote_solved`** | ★★ **48** | ★ 8 |
| ★ **`closureVote`** | ★ **101** | ★ 49 |
| ★ `meeting` / `turn` / `control` / `task` | ★ 49 / 49 / 37 / 31 | ★ 相当 |
⇒ ★★★★ **即：★ 加上那两条读数（★ 结题票字段 ＋ 入册步骤）之后，★ 研究所【第一次走到论文阶段】** ✓✓
★★ **而 `hire: 93` 与 `institution: 36` 说明**：★ **代理【真的按指引入册了】** ✓✓ —— ★ **指引生效** ✓

### 9.2 ★★ 但 `cast:true` 仍是 0 —— ★ 而原因现在【精确】
★ 本轮的 `closureVote.reason` 分布：
```
x9   no member holds the closure-vote permission
x4   silence blocks closure; no judgement yet from: m1, m2
x3   no member holds the closure-vote permission, so unanimity is unreachable - seat mem…
```
⇒ ★★★★★ **即：★ 代理【入了册】，★ 但入的是【没有 `vote` 权限的槽位】** ✓✓ —— ★ **所以 `eligible` 时有时为空** ✓✓
★★ **而这正是那条陷阱在真机上的第二次现身**：★ **v5r pack 把 `vote` 给 `member` 槽位，★ 【不给 `chair`、★ 也不给 `temp`】** ✓
⇒ ★★★ **而新措辞已经点名了它**（★ "grants it to `member` but NOT to `chair` or `temp`" ✓）—— ★ **下一位读者（或代理）现在有据可依** ✓

### 9.3 ★★★★ 结论：★ 问题已从"不可诊断"转为"一个具体的选择"
★ **机制层面**：★ 结题谓词存在 ✓、★ 结题票接在提示词指定的字段上 ✓、★ 端到端实测翻转 ✓、★ 论文阶段可达 ✓
★ **剩下的**：★ **入册时【选对槽位】这件事** —— ★ **要么由提示词更明确地要求（★ "member 槽位、★ 2 人" ✓），★ 要么由部署在任务书里指定** ✓
★★ **两者都是【部署层的选择】，★ 而不是框架缺陷** ⇒ ★★ **框架的职责（★ 把选择讲清楚 ＋ 把后果具名）★ 已经完成** ✓✓
★ **仍未主张收敛**：★ `cast:true` 0 次 ⇒ **按铁律不主张** ✓
