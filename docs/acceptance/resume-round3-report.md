# Round 3 · 目标 1 收尾（task-18）实现报告：审批队列耐久台账 + resume 边界收口

> 作者：v5r-reader-a。判据：`00-decisions.md` D-15、`resume-round2-report.md` 的未做项、task-18 A–D。
> 本轮写范围：`kernel/resume.js` · `kernel/human.js` · `kernel/ids.js` · `kernel/control.js` · `kernel/lifecycle.js` · `tools/human.js` · `docs/07` · `docs/26` · 本报告。接线（`kernel/index.js`／`store.js`／`settings/schema.js`）由 vmu-core 落。

---

## 1. 交付与落点

| 项 | 交付 | 落点 |
|---|---|---|
| A · 审批队列/否决台账耐久 | `human.snapshot()` / `human.restore(snap,{replace})`（含 `gateIndex` 重建、`seq` 取 max+1、`pendingReason` 保留、`list()` 便捷面） | `kernel/human.js:434-478,485-492`（return 面） |
| A · 写穿机制 | `attachProjection({…, after})` ＋ 状态型投影自动写穿（`vmu.resume.writeThrough`，默认 true；成功/失败计数） | `kernel/resume.js:233-262,500-522` |
| A · 装配 | `resume.attachProjection({target:human, key:'human', mode:'state', …})`（**vmu-core 已落**） | `kernel/index.js:771-787` |
| A · 耐久键 | `human`（已请 vmu-core 加白名单；core 已在 `store.js` 处理） | 见 §5 |
| B · 边界收口 | `phase` 成为**引擎拥有的耐久值**：`setPhase(value,{why})` / `phase()` ＋ 内置 `phase` adapter | `kernel/resume.js:453-490` |
| B · 水合加固 | `hydrate()` 识别**三种面级拒接**：返回 `{ok:false}` · **抛错** · **journal 回放抛错**（均具名 `unhydrated`，不中断其余键） | `kernel/resume.js:567-618` |
| C · 跨重启 interrupted 断言 | 两次重启后仍具名、仍拒 passed、显式覆盖只作用于该 id | `tests/vmu-resume-recovery.test.mjs` §14 |
| D · 文档 | `docs/07` §14/§15、`docs/26` §7 按实现改写（含 Round 3 增补与 Round 2 误记更正） | `docs/07-durability-library.md:454-495`、`docs/26-turn-orchestration.md:587-604` |

---

## 2. 逐条验收

### A. 审批队列跨重启台账 —— 已实现并端到端验证
- **耐久形状**：`human.snapshot()` = `{apiVersion:1, face:'human', v:1, at, data:{vetoes[], approvals[[id,rec]]}, counters:{human:max}, skipped:[]}`；`restore()` 用**共享校验器** `checkSnapshot('human', snap, ['vetoes','approvals'])`（三个码 `VMU_RESUME_SNAPSHOT_VERSION`／`_INCOMPLETE`／`VMU_RESUME_RESTORE_CONFLICT` **单源**，不新增码）。
- **三件必须活着的东西**（测试逐条断言，`tests/vmu-human-gate.test.mjs` §8）：
  1. **未批动作仍在排队**：重启后 `queue().pending` 与重启前一致，`action`/`subject`/`attempts` 全在；`gate()` **仍拒**且 **复用同一个 `requestId`**（不会为同一动作开第二个请求）。
  2. **否决仍在生效**：`activeVetoes` 不变，被否决动作重启后仍 `VMU_HUMAN_VETOED`。
  3. **`pendingReason` 不丢**：紧急否决"先停后补"的状态跨重启保留（`status().pendingReasons===1`），且 `explainDecision({vetoId})` 重启后仍能补上；被拒审批的 `pendingReason` 同理。
- **id 不复用**：`seq` 取 `max(snap.counters.human, 既有 id 后缀)`；测试断言重启后新请求号 **>** 重启前的号（`approval-N` 不会重来）。
- **不可恢复项具名**：`restore()` 对非法条目进 `skipped[{what,why}]`；`hydrate()` 对面级拒接进 `unhydrated[]`（不假装成功）。
- **写穿**：`attachProjection(mode:'state' + snapshot/restore)` 在每个被包方法返回后写一次；测试不显式 flush 也断言 store 里已有 `human` 信封；关掉 `vmu.resume.writeThrough` 后**只**在显式 `snapshot()` 时写（两个方向都断言）。

### B. resume 边界收口
- **`phase` 从"无写者的空行"变成"引擎拥有的耐久值"**：`setPhase()` 经写前必读闸写 `phase` 键、报 `from/to`；`phase()` 读会话值；`hydrate({keys:['phase']})` 跨重启读回。**装配侧仍需在相位变化点各接一行**（要求已发 vmu-core；未接时该键 `present:false`，报事实不报错）。
- **三种面级拒接都被识别**（本轮加固，均有断言）：返回 `{ok:false}`（reader-c 的五面 + chat/panel）、`restore()` **抛错**、journal **回放抛错**（半重建不算恢复）。
- **`budget.js` 的 Round 2 误记已更正**（见 §3 与 §7）：该文件**没有**公共 `snapshot()/restore()`（内部已有 `const snapshot = (s) => …` 格式化器，公共 seam 需改名或包一层）；本轮**不在写范围**，故按纪律只做**具名更正**而非改动。
- **`chat`/`panel`**：reader-c 本轮已落地 seam（`chat.js:587/603`、`panel.js:350/367`）——"未投影"的**原因已从"没有 seam"变为"装配缺适配器"**，已把 8 行适配器清单发 vmu-core（`kernel/index.js:740-747` 现有适配器只覆盖 `tasks`/`work`）。
- **`mailbox.js:479` 有 `snapshot()` 无 `restore()`** ⇒ 不能作 state 适配器（具名）。
- **`settings.resolved`/`packs`/`middleware`（不宜持久，写实理由）**：前两者是**声明与其解析结果**——启动时由 settings 与 pack 重新解析，持久化会让"一次部署变更"被旧快照悄悄回退；`middleware` 的恢复语义属装配层（vmu-core/pack），不是数据面。**`records`** 已由 `kernel/library.js` 的磁盘卡片持久（文件即权威），`records` 键本身无写入者，建议 core 在 `docs/03 §6` 标注为保留键。

### C. `interrupted` 跨重启端到端断言
- 测试 §14：同一 store 上 **进程1** 起两条在途 → `recover(reason:'round3-crash-1')` 两条都标中断；**进程2**（新 ledger + 新引擎）再 `recover(reason:'round3-crash-2')`：
  - `interrupted()` 仍是 2 条且**理由非空**、**含 `round3-crash`**（不是 generic unknown）；
  - `status().interruptedIds` 列出两条；
  - `settleOutcome('passed')` 仍 **`VMU_RESUME_INTERRUPTED_NOT_PASSED`**；
  - `explicit+reason` 覆盖只放行**那一条**，另一条**仍被保护**（覆盖是 per-id，不是全局开关）。

### D. 文档
- `docs/07`：§14 落地面/不变量/两形态（新增写穿）/耐久键/逐模块状态/验收全部按实现改写；§15 增 Round 3 留痕**并明写 Round 2 的 `budget` 误记更正**。
- `docs/26 §7`：标题改"Round 2 落地 ✓ / Round 3 收口 ✓"；第 4 条扩入"回放抛错/面返回 `{ok:false}`"；新增 Round 3 增补三条（人类在途= `human` 键、状态投影必须写穿、`phase` 由引擎拥有）；验收数字更新。

---

## 3. 逐模块耐久状态（本轮口径，含具名缺口）

| 模块 / 键 | 状态 | 证据 / 理由 |
|---|---|---|
| `work` | **真持久 ✓** | `kernel/work.js:50,57,64,135`（journal 适配器 `kernel/index.js:746`） |
| `idempotency` | **真持久 ✓** | Round 1 已接 |
| `resume`（恢复记录＋计数器＋journal 索引） | **真持久 ✓** | `kernel/resume.js` 经写前必读闸 |
| `ids`（id 计数器） | **真持久 ✓** | `kernel/ids.js`；`vmu.ids.persistEvery` |
| **`human`（审批队列＋否决台账）** | **真持久 ✓（本轮新增）** | `human.js:434-478` ＋ `index.js:771-787`（state + 写穿）；跨重启断言见 human 套件 §8 |
| `tasks` | **真持久 ✓** | journal（`index.js:742`）＋ `tasks.js:304/325` 的 state seam |
| `members` | **面 seam ✓ / 装配待接（具名）** | `members.js:265/279`；`RESUME_PROJECTION_ADAPTERS` 尚无 `members` 行 ⇒ `unhydrated` |
| `meetings` / `meeting` / `ballot` / `ballotbox` / `minutes` | **面 seam ✓ / 装配待接（具名）** | reader-c 落点见 docs/07 §14；适配器清单已发 core |
| `chat` / `panel` | **面 seam ✓（reader-c 本轮落地）/ 装配待接（具名）** | `chat.js:587/603`、`panel.js:350/367`；"未 ack 消息"作为一等集合在 `data` 内 |
| `phase` | **引擎可写 ✓ / 装配调用待接（具名）** | `resume.setPhase/phase`；core 需在相位变化点接一行 |
| `budget` | **无公共 seam（具名，Round 2 误记已更正）** | 内部 `const snapshot = (s) => …`（`budget.js:145`）占用名字；修法＝把内部格式化器改名（如 `viewOf`）再加公共 `snapshot()/restore()` |
| `mailbox` | **有 `snapshot()` 无 `restore()`（具名）** | `mailbox.js:479`；不能作 state 适配器 |
| `settings.resolved` / `packs` / `middleware` | **不宜持久（写实理由见 §2B）** | 声明/解析结果；旧快照会回退部署变更；装配面属 core/pack |
| `records` | **文件持久 ✓**（非投影） | `kernel/library.js` 磁盘卡片为权威 |
| 派生 id（`reviews.js:94` 等） | **不改（具名理由）** | 从集合大小派生的位置号，随被引集合一起恢复；改 `mint` 反而换号 |

---

## 4. 定向单跑：原样命令 + 退出码

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tests/vmu-resume-recovery.test.mjs` | `=== VMU RESUME: 73 passed, 0 failed ===` | **0** |
| `node tests/vmu-human-gate.test.mjs` | `=== VMU HUMAN GATE: 67 passed, 0 failed ===` | **0** |
| `node --check vibe-math-vmu/kernel/resume.js` | 通过 | 0 |
| `node --check vibe-math-vmu/kernel/human.js` | 通过 | 0 |

（未跑全量 sweep / `regen-all` / `update-doc-counts --write` / git；临时脚本放 `D:\_tmp`，本轮未产生需保留的临时文件。）

---

## 5. 已发出的接线要求（摘要）

| 收件人 | 要求 |
|---|---|
| vmu-core | ① 白名单键 `human`；② `attachProjection` 的 human 行（**已落** `index.js:771-787`）；③ **修 `tasks` 适配器的 replay 传参 bug**（`entry.args` 是参数数组，现被当成单个对象传入 ⇒ hydrate 时 `VMU_INVALID_ARGUMENT`；推荐直接删掉自定义 `replay`，用实例 `replaySeam` 的 `fn.apply(target, entry.args)`）；④ 8 行 state 适配器（members/meetings/meeting/ballot/ballotbox/minutes/chat/panel）；⑤ `phase` 变化点各接一行 `await resume.setPhase(…)`；⑥ settings 键 `vmu.resume.writeThrough` |
| vmu-pack | 唯一新增 settings 键 `vmu.resume.writeThrough`（bool, def true, H2, office）+ v5r 默认值；`vmu.resume.projections` 取值域新增 `human`（`PROJECTION_KEYS` 现为 members/tasks/meetings/ballots/budget/phase/work/chat/panel/human）；耐久键非 settings |

---

## 6. 未做项 / 诚实边界

1. **装配适配器未接的面**（members/meetings/meeting/ballot/ballotbox/minutes/chat/panel）在 `resume.status().unhydrated[]` 里**具名**，`projection.degraded=true`；它们**不是**"已恢复"。清单已发 core，装配后即成为真持久。
2. **`budget` 无公共 seam**（本轮不在写范围）：只更正报告与文档，未改代码；修法已写实（内部格式化器改名）。
3. **`mailbox` 无 restore**：具名，未处理。
4. **`phase` 装配调用未接**：引擎方法与断言已就绪；core 接一行后 `phase` 才跨重启。
5. **journal 重放的确定性代价**不变：不可重放命令、不可序列化参数、非连续 seq ⇒ 具名拒；**回放抛错**本轮也已具名且不中断其余键。
6. **`docs/17` §19** 上轮由 v5r-reader-c 落地（本轮未改）。

---

## 7. 事故 / 更正留痕

- **Round 2 报告误记更正**：`kernel/budget.js` 曾被写成"写了 `snapshot()/restore()`"——实测**没有**（我只加了 import 注释，方法未写；内部 `snapshot(s)` 格式化器同名）。本轮已在 docs/07 §15 与报告 §3 具名更正，并给出修法要点。**教训**：报告里的"已实现"必须在写完后用 grep/运行时再确认一次。
- **本轮修掉的一个真缺陷（由测试逼出）**：`attachProjectionTo` 原先把形参命名为 `snapshot`，**遮蔽了引擎自己的 `snapshot({key})` 写者** ⇒ 写穿实际调用的是**面的** snapshot seam（返回对象而非 promise），`.then` 不存在 ⇒ 静默失败、`writesThrough=0`、耐久键根本没写。现形参改名 `snapshotSeam`，并用"不显式 flush 也能跨重启"的断言钉住。
- **本轮加固**：`hydrate()` 对**抛错的 restore/replay** 也具名（此前只有返回式 `{ok:false}`），修复前一个坏面会**中断整次恢复**或留下半重建状态。
