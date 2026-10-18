# `packs/v3/` — v3 复刻包（PHASE 6）

**这一句话是它可能是什么**：把 `vibe-math-v3` 的机制（周期调度 → 规划 → 数据面 → 方法库 → 验证闭环 → 人工门）
复刻成 vmu 的一个**整合包**；vmu 的内核提供能力，这个文件夹只声明"v3 这家机构要什么"。

## 与 `packs/v3-core/` 的关系

**互斥装载（部署二选一）**。`v3-core` 是 v3 的**机构外壳**（槽位/轨/两个闸），文件头自己写着
"NOT v3 and NOT a behavioural-equivalence proof"；`v3`（本文件夹）是把运转机制真正落下来的那一个。
两个包的 `settings`/`tracks` 会重叠，同时装载会被 `kernel/pack.js` 以 `VMU_PACK_CONFLICT` 具名拒。

## 已落了什么

| 文件 | 职责 |
|---|---|
| `index.js` | 被装载清单（`PACK`）：两个 middleware 模块（`v3-tick`、`v3-dataplane`）。 |
| `settings/defaults.json` | **值层**：构造期就被读取的值 —— schedule 四键、`vmu.v3.tickIntervalMs`，以及 P0-9 的 records 五键（轨/kind 白名单/未定稿可写/正文上限/条数上限）。 |
| `middleware/tick.js` | P0-1 tick 体：订阅 `v3/tick`，写一条 `journal` 记录，返回 `{ok:true}`。 |
| `middleware/dataplane.js` | **P0-9 ＋ P0-6 数据面**：三卡 compose/parse（问题/命题/方法）、正文段逐字保留、有界写入（截断＋`dropped` 计数）、索引重建（条目数＝磁盘卡数、坏卡点名、`dropped` 计数）、Verified 分裂（只收定论、内容不变不重写）、tick 驱动的 5s 节流索引。 |
| `prompts/sections.json` | **P0-6 可信分层段**（纯数据）：只有 `verified` 轨"绝对可信"，其余一律"经验参考"。插件在建内核**之前**按目录名读它。 |
| `README.md` | 本文件。 |

## 两条必须知道的装载约束（写在这里，别在下一轮重新踩）

1. **构造期要读的键只能放 `settings/defaults.json`。** 清单的 `settings` 是装载后 apply，而调度器与 records
   在 `createKernel` 构造期就把这些值读走/快照了（`kernel/scheduler.js:96-114`、`kernel/index.js:878-887`、
   `kernel/records.js:189-221`）。写错地方**不会报错**，系统只是"安安静静地不跑/卡写不进去"。
   P0-9 因此把 `vmu.records.tracks / allowedKinds / requireSettledRecords / bodyCapBytes / head.maxItems`
   全部放进值层，`PACK.settings` 保持**空**。
2. **`v3/tick` 是协议扩展主题，必须先 `declareTopic` 才能 emit / 才能被模块订阅。** 声明发生在
   `middleware/tick.js` 被 import 时（`bus.declareTopic` 是进程级的）。清单里的 module 条目**故意不写
   `kind`**：`kernel/pack.js` 会把无 `kind` 的条目按 module 处理，而 `kernel/bus.js` 的静态校验会拒
   "带 kind 却没有 handler"的原始条目。

### 为什么清单里**没有** `tracks:` 字段

清单 §4 曾建议 v3 扩 `tracks`。实测：`kernel/pack.js:479-482` 对 manifest `tracks` 调的是
`kernel.declareTracks()`，它**重建 `kernel.library`**，且第一行 `mustLibrary()` 在没有 `root` 的装配上
**具名拒**（`kernel/index.js:1871-1877`）⇒ 加了它，没工作区的部署会在 apply 期拿到 pack 错误；而且它喂的是
library，**不是** `vmu.records` 的构造期快照 ⇒ 轨仍然写不进去。**轨的唯一生效处是值层**
（`vmu.records.tracks`），清单的 `tracks` 既不必要也会坏事。

## 数据面的两条契约（P0-9/P0-6 的可写断言都落在这上面）

1. **正文只增不减 / 自定义段逐字保留**（v3 `:893-903`、`:6128-6143`）：compose 只重写它接管的锚点行与
   托管段（问题卡：陈述/解法候选；命题卡：陈述/证明尝试/证伪尝试；方法卡：核心内容/应用记录/改进历史），
   其余任意 `## ` 段在回写后**原样保留在正文末尾**。`findSectionHeads` **跳过围栏代码块**：围栏里的
   `## ` 不是段边界（否则回写会把代码块劈开）。重复回写是**幂等**的（同一 patch 第二次回写逐字节不变）。
2. **Verified 分裂**（v3 `:1060-1080`、`:2112-2131`）：只有定论（命题 `- 概率: 1|0`、问题 `- 状态: 已解决`）
   才能 `promoteVerified` 进 `verified` 轨；非定论是**具名拒**（`VMU_STATE`），不是静默不写。Verified 卡的
   body 带结论/时间/来源/分类 ＋ **全部 prob=1 的证明/证伪/解法全文**；内容不变（时间行不参与比较）⇒
   `{written:false, unchanged:true}`，不重写。`verified` 轨的每一条都是 1/0 结论。

## 诚实边界 ✗

- 这**不是** v3，也**不是**行为等价证明。P0 只做"机制可用"；行为等价的 A/B 是另立项（与 P0-10 同一口径）。
- **没有新拒码**：数据面的拒绝复用已登记的内核码（`VMU_INVALID_ARGUMENT`／`VMU_STATE`／`VMU_NO_SUCH_OBJECT`）。
  新 `VMU_PACK_V3_*` 码须先登记进 `docs/03 §8.1`，而 `docs/**` 不在本卡写域 ⇒ 不造未登记码。
- **索引 5s 节流是常量**（`INDEX_THROTTLE_MS=5000`，v3 `:2039`），没有设置键：新增 `vmu.v3.*` 键必须先登记
  进 `settings/schema.js`（本卡写域不含该文件）⇒ `dataplane.status()` 自报 `throttleMs`，**不自称可配**。
- 本轮没有 slots（v3 的 planner/solver/verifier）与 M1 规则 —— 它们属于 P0-2/P0-4/P0-7，不在这里提前声明。
