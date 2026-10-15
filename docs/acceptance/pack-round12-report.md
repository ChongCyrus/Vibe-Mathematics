# vmu 交接 · Round 12 · task-97 报告（motion→box 政策：**具名保留**＋依赖清单）

- 任务：`task-97`（vmu-pack）· 纪律：未跑全量/`regen-all`/未 git；临时文件 `D:\_tmp`；**未落半接线模块**；**未臆造常量**。
- **结论：C 分支成立 ⇒ 具名保留**。政策本身**可声明**（形状我已勘定），但今天**没有可挂的钩子、也没有 pack 能提供的接缝**；按 R10 `ballots` 的教训，**不落半接线模块**。本轮产出＝**三段实测证据 ＋ 六行精确依赖 ＋ 落地即用的模块形状**。

> ★★ **一条方法论（本轮由它产出两条新缺陷，值得引用）**：**"核引用不是礼节，是发现手段"**。
> 起因：vmu-verify 更正了我对 `kernel/governance.js` 的一处行号引用（我引 `:166` 的 `refuse` 当成 emit；真正的 emit 在 `:172`）⇒ 我随后**把本轮每个引用当场重 grep 一遍**，于是发现两处**"落了也不生效"**的装配事实：**④ `kernel/index.js:1118` 没传 `ballot`**（真装配里 `mirrorVote` 在 `no-seam` 就返回 ⇒ **`boxFor` 永不被问**）与 **⑤ `meetings.js` 总线 emit 数 = 0 ＋ 两面动议 id 不同（`mo1` vs `mo-1`）**（**箱对不上号**）。
> ⇒ **教训**：**"依赖已落地" ≠ "这条能落"**——要看依赖**在真装配里**是否被调用、身份是否对得上。若只核到"参数存在、方法存在"就宣布可落，这两条都会被漏掉。（`docs/11` 的对应条目由 vmu-verify 收口。）

---

## A. 政策形状（已勘定，落地即用；**本轮未落**）

政策＝"**动议被提出时，为它开一个票箱并把票投进去**"。用**既有机制**表达的正确形状是 **M2 模块**（不是 M1 规则：规则的动作集不含"调服务"；也不是 inline handler：总线路径**没有 `api`**——这正是 R11 新门禁 `scripts/audit-pack-middleware-shape.mjs` 的口径）：

```js
// packs/v5r/middleware/motion-box.js（落地即用；本轮 STAGED）
export const V5R_MOTION_BOX = Object.freeze({
  meta: { id: 'v5r.motion-box', apiVersion: 1 },
  capabilities: ['trigger-workflow', 'record'],          // trigger-workflow 解锁 api.services 缝
  hooks: {
    'motion/propose': async (flat) => {                   // ← 需要该钩子被登记（见 C③）
      const box = await flat.api.services.get('vmu.ballotbox')
        .open({ question: 'motion ' + flat.id, options: MOTION_BOX_OPTIONS })
      return { ok: true, boxId: box.boxId, motionId: flat.id }
    },
  },
})
```
**不臆造常量**：`MOTION_BOX_OPTIONS` 与"用动议文本作问题"这两点**本轮没有落地**——因为 (i) v5r 的动议面是**附议（second）**，不是选项投票，选项集**无 v5r 出处**；(ii) 钩子载荷只有 `{ type, id }`，而 `governance.motion` **没有读方法**（`{propose, second, withdraw}`，实测），模块**拿不到动议文本**。⇒ 这两点必须由 reader-a 的接缝（或新增读方法）给出**可核**的输入，否则就是我臆造。

## B. 探针（原样命令 + 读数）· **反向成立：不开箱、也不假装**

`node D:\_tmp\motion-box-hold-probe.mjs`（仓库外一次性·实测，**exit 0**）：

**① 接缝本身是好的（supplied 时真工作）**
```
no boxFor            -> {"mirrored":false,"reason":"no-binding","code":"VMU_MEETING_BOX_UNWIRED"}   ← 具名，不静默
boxFor returns null  -> {"mirrored":false,"reason":"unmapped","code":"VMU_MEETING_BOX_UNMAPPED"}    ← 具名
boxFor returns id    -> {"mirrored":true,"reason":"cast","boxId":"bx-for-…"}                        ← 真投进去
```
**② 今天提出一个动议：不开箱，而且中间件根本挂不上**
```
motion.propose -> {"ok":true,"motion":{"id":"mo-1",…}}
ballot boxes before/after: 0 -> 0   (NO box was opened)
isRegisteredHook("motion.propose"): false | in VU_HOOKS: false
```
**③ 为什么**（三项，逐条带 file）：
- **a. 装配没接 `boxFor`**：`kernel/meetings.js:100` 的 `createMeetings({ …, boxFor = null })` 有参数、`:694` 的 `mirrorVote({ boxFor })` 有消费点，但 **`kernel/index.js` 里 grep 不到 `boxFor`** ⇒ 永远是 null ⇒ 回执恒为 `VMU_MEETING_BOX_UNWIRED`（**具名**）。
- **b. pack 没有投递它的路径**：`createMeetings` 在 `kernel/index.js` 里构造，pack 只能声明 `packs/**`；今天**没有**"pack 提供 `boxFor`"的文档化接缝（既不是清单字段，也不是 `loader` 的 module API）。
- **c. 事件形态不满足"可挂"**：`kernel/governance.js:166` 用**对象形态** `emit({ type: 'motion.propose', id })`（该模块自己的 helper 会拆出 `name` 再 `bus.emit(name, ev)`，所以**功能上发得出去**，但）⇒ **(i)** `audit-hook-coverage` 的**字面量扫描看不见它**（它只认 `emit('<名>'`）；**(ii)** 名字**未登记** ⇒ `loader` 会以"unregistered hook"拒掉声明它的模块；**(iii)** 它是**点号名**（`motion.propose`），`bus.declareTopic()` 的形态校验是 `/^[a-z0-9-]+\/[a-z0-9-]+$/` ⇒ **点号名连"声明主题"这条路都走不了**（实测 `VMU_INVALID_ARGUMENT`）。

## C. 依赖状态（轮 12 收尾复核：core 已落 ①②③；**④⑤ 是收尾时新查出的两处**）

| # | 依赖 | 状态 | 实测 / 落地后我做什么 |
|---|---|---|---|
| **①** | `boxFor` 的**消费点** | ✅ **已落** | `kernel/meetings.js:730` `mirrorVote({ ballot, boxFor: boxBinding, … })` |
| **②** | pack 的**投递路径**（Lead 裁决 (i)） | ✅ **已落** | `vmu.meetings` 的 `bindBox(fn\|null)`／`boxBinding()`／`status().boxBinding`；**懒绑**（装载期工厂拿不到 `api`，在 `motion/propose` 处理器里 `if (!boxBinding().bound) bindBox(fn)`） |
| **③** | **动议事件可挂** | ✅ **已落** | core 把 governance 的 8 个事件改成**名首字面量 ＋ 斜杠名**并**登记**（`motion/propose…`、`agenda/add…`）＋`motion\|agenda` 进 `VU_NAMESPACE`。★ 我先前也加了一份**重复登记**，被 `hookRegistryProblems()` 当场抓出（8 条 duplicate）⇒ 已删我的那份（`VU_HOOKS` 96、problems `[]`）。实测 `<临时目录>/motion-hook-fire-probe.mjs`（**6/0 exit 0**）：一个真被 loader 装载的 M2 模块**确实收到 `motion/propose`**、且**能经能力门控缝够到 `vmu.ballotbox`** |
| **④** | ★ **镜像的 `ballot` 缝没装配** | ❌ **待 core** | `kernel/index.js:1118` `createMeetings({ settings, bus, clock, log, durable })` **没传 `ballot`** ⇒ `mirrorVote` 在 `no-seam` 就返回（实测 `receipt.ballot = {"mirrored":false,"reason":"no-seam"}`），**根本走不到 `boxFor`** |
| **⑤** | ★ **"会议动议"不可观测 ＋ 两个动议面 id 不同** | ❌ **待 core** | `kernel/meetings.js` **总线 emit 数 = 0**（只用本地 `say()`）⇒ pack **无法观测"会议里有人提出动议"**；且 **会议动议 id ＝ `mo1`**（`:677`）而 **治理动议 id ＝ `mo-1`**（`newId('mo')`）⇒ 挂 `motion/propose` 开的箱与镜像问的 `boxFor({motion:'mo1'})` **对不上**（⇒ `VMU_MEETING_BOX_UNMAPPED`） |
| **⑥** | ★ **词表不匹配（`choice` vs `value`）** | ⏳ **reader-a R13 两行** | reader-a 实测根因：`ballotbox.cast` 读 **`choice`**，而 `mirrorVote` 转发会议侧词汇 **`value`（0\|1）** ⇒ 箱收到 `choice: undefined` ⇒ 具名 `VMU_CONFLICT`。**修法**：绑定可返回 `{boxId, choice?, value?, by?}`，`mirrorVote` **`choice` 优先／`value` 兜底** ⇒ **本 pack 的 `boxForMotion()` 已改成返回 `{boxId, choice}`**（把 `1 → 'for'`／`0 → 'against'`，与 `MOTION_BOX_OPTIONS` 同一对词——**词表映射是政策，归 pack**） |

★ **不许把政策写进内核**：①②只要"接缝/投递路径"，**"哪个动议开哪个箱、用什么选项、0/1 怎么映射成选项"全在 pack**。
★ **本轮把模块从仓里撤出、只在仓外暂存**（`<临时目录>/staged-motion-box.js`：`motionBoxQuestion()`（有 `text` 用 `text`、没有用 id）＋ `boxForMotion()`（返回 `{boxId, choice}`）＋懒绑；`options` 用**本 pack 政策**并写明"非 v5r 出处"）——**因为按现状落进去就是半接线**（④ 使 `boxFor` 永不被问；⑤ 使开的箱对不上镜像问的 id；⑥ 未落时 `choice` 映射不生效）。**改判条件**：core 补 ④＋⑤（`meetings.js:683` 处名首字面量 `emit('meeting/motion', { meeting, motion, kind })`；`meeting/` 已在 `VU_NAMESPACE`）＋ reader-a 的 R13 三行（`text/kind/emergency` 透传）与两行（`choice` 优先）⇒ **我登记 `meeting/motion`** 并把模块挂到**会议动议**这一面，跑开火探针（动议 ⇒ 回调被调 ⇒ 箱子真存在；票真进箱；未声明 ⇒ 不开箱、不假装）。

## D. 文档 · 已同步

- `docs/10` **新增 §4.11** 并更新为**五行依赖状态**（①②③已落、④⑤待 core）；其中 `vmu.meetings` 的 `bindBox()` 用**服务名写法**（该门把所有 `vmu.*` 文档名当设置键 ⇒ 写成 `vmu.meetings.bindBox` 会红；已按 core/Lead 的修法改）。
- `docs/27`：**未改**（本轮 pack 内无新文件——模块已撤出仓；`audit-pack-face` 5/0 仍绿）。
- `docs/05/06`：**未改**（钩子登记由 core 完成，我这边只**删除**了自己那份重复登记）。

---

## 验证（原样命令 + 退出码）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node D:\_tmp\motion-box-hold-probe.mjs`（仓库外一次性·实测） | 0 | 接缝 supplied 时真工作（3 种回执）；**动议提出 ⇒ 0 个箱子**；`isRegisteredHook('motion.propose') === false` |
| `node D:\_tmp\motion-propose-emit-probe.mjs`（仓库外一次性·实测） | 0 | `bus.emit` 实收 `('motion.propose', {object})` ⇒ 事件**发得出去**，但**没有已登记钩子** ⇒ 无人能挂 |
| `node scripts/audit-pack-middleware-shape.mjs` | 0 | 7/0（本轮**未新增**清单条目，形状门禁仍绿） |
| `node tests/vmu-pack.test.mjs` | 0 | 53 passed, 0 failed |
| `node tests/vmu-entry.test.mjs` | 0 | 150 passed, 0 failed |
| `node tests/vmu-governance.test.mjs` | 0 | 治理面套件（未改动，仅引用其 API 形状） |
| `node tests/audit-hook-coverage.test.mjs` | 0 | 4/0（未登记新钩子 ⇒ 无"纸面钩子"） |
| `node scripts/audit-hook-emit-classification.mjs` | 0 | 7/0 |
| `node scripts/check-docs.mjs` | 0 | PASS（`docs=30 issues=0`） |

## 未做项 / 待他人（**轮 13 收尾后已全部闭合，见下节**）

---

# 轮 13 收尾：**政策已进仓并被常驻守住**（结论从"具名保留"改判为"已闭合"）

**core 落了 ④⑤**（我复核过）：
- **④** `kernel/index.js:1118` 一带 `createMeetings({ …, ballot: meetingBallot })`（迟到绑定适配器，`cast` 只在投票时调用）⇒ 真装配里未绑时回执是 **`no-binding`**（不再是 `no-seam`）。
- **⑤** `kernel/meetings.js` 动议落账处新增 **`emit('meeting/motion', { at, meeting, motion, kind, emergency })`**（名首字面量），core **已登记** `meeting/motion`（`failure:'open'`、不可阻断）⇒ **我直接订阅，没有再登记**（避免上次"两人各加一份 ⇒ 8 条 duplicate"）。

**我落的（进仓 ＋ 双登记）**
- `packs/v5r/middleware/motion-box.js`：挂 **`meeting/motion`**（**不是** `motion/propose`——后者是全所动议 `mo-1`，镜像问的是会议内动议 `mo1`）；纯函数 `MOTION_BOX_OPTIONS`（**本 pack 政策**：`['1','0']`，即会议侧自己的词表）／`motionBoxQuestion()`（有 `text` 用 `text`、没有用动议 id，**不会** `undefined`）／`boxForMeetingMotion()`（返回 `{boxId, value, by}`）；**懒绑**（装载期工厂拿不到 `api`）。
- 清单 `prompts/v5r-core.js`：module 形状条目 `{id:'v5r.motion-box', order:310, on:['meeting/motion'], capabilities:['trigger-workflow','record'], module: V5R_MOTION_BOX}`。
- `package.json files[]` ＋ `installer.js` 的 vmu 托管名册 **双登记**（`audit-installer-policy` 要求"每个 shipped 文件被托管或豁免"）；`docs/27` 点名该文件；`docs/10 §4.11` 改"已闭合"。

**★ 常驻断言（新文件，R11 的"能跑 ≠ 被守住"）**：`tests/vmu-motion-box.test.mjs` ⇒ **22 passed / 0 failed**：
- 纯政策：meta/capabilities/唯一 hook＝`meeting/motion`、选项对是 2 元且为**本 pack 政策**、问题文案（无 `text` 用 id／有 `text` 用原文）、未映射 ⇒ `null`（具名 `VMU_MEETING_BOX_UNMAPPED` 而非猜测）；
- **真 pack 装载**：会议里提动议 ⇒ **箱子真的存在**（`ballotbox.status().boxes === 1`）＋ **绑定真被设上**（`boxBinding().source === 'method'`）＋ 投票 ⇒ **真的镜像进政策选的那个箱**（`receipt.receipt.ballot.mirrored === true` 且 boxId 相等）；
- 治理动议**不**开箱（两个面确实不同）；
- 反向：**解绑 ⇒ 具名 `VMU_MEETING_BOX_UNWIRED`（`no-binding`）**；下一条动议**再武装**（懒绑的设计，写成正向断言）；**未装政策的装配 ⇒ 不开箱、也不假装**。

**★ 环境事故（必须上报，非我造成）**：`packs/v5r/middleware/motion-box.js` 在**本轮被不明并发进程删除了两次**（第一次：我刚写完并跑过 `node --check`／`vmu-pack` 之后；第二次：`installer.js` 登记之后）。我用备份 `<临时目录>/motion-box-backup.js` 复原（哈希一致），现已恢复并被双登记。**请 Lead 排查是否有"清理未登记/未跟踪文件"的步骤**（它会反复弄坏树）；备份留在 `<临时目录>/motion-box-backup.js`。

**轮 13 读数（原样命令 + 退出码，全 0）**：`vmu-motion-box` **22/0** · `vmu-stall-meeting` 18/0 · `vmu-pack` 53/0 · `vmu-entry` 150/0 · `vmu-meetings` 161/0 · `vmu-kernel` 175/0 · `audit-pack-face` 5/0 · `audit-installer-policy` **ALL GREEN** · `audit-hook-coverage` 4/0 · `audit-hook-emit-classification` 7/0 · `audit-pack-middleware-shape` 7/0 · `audit-pack-value-domain` 5/0 · `check-docs` **PASS**（`docs=30 issues=0`）。

**仍未闭合（具名，非阻塞）**：reader-a 的 **R13 三行**（`text/kind/emergency` 透传）⇒ `motionBoxQuestion()` 自动从"动议 id"升级为**动议原文**（当前行为已断言，不需要改我的代码）；R13 的"`choice` 优先"两行落地后，`boxForMeetingMotion()` 可改回返回 `choice` 词表（当前 `{boxId, value, by}` 是 core 探针 11/0 证过的形状）。
