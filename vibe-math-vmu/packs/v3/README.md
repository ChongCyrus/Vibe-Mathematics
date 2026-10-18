# `packs/v3/` — v3 复刻包（PHASE 6）

**这一句话是它可能是什么**：把 `vibe-math-v3` 的机制（周期调度 → 规划 → 数据面 → 方法库 → 验证闭环 → 人工门）
复刻成 vmu 的一个**整合包**；vmu 的内核提供能力，这个文件夹只声明"v3 这家机构要什么"。

## 与 `packs/v3-core/` 的关系

**互斥装载（部署二选一）**。`v3-core` 是 v3 的**机构外壳**（槽位/轨/两个闸），文件头自己写着
"NOT v3 and NOT a behavioural-equivalence proof"；`v3`（本文件夹）是把运转机制真正落下来的那一个。
两个包的 `settings`/`tracks` 会重叠，同时装载会被 `kernel/pack.js` 以 `VMU_PACK_CONFLICT` 具名拒。

## 本轮（P0-1）落了什么

| 文件 | 职责 |
|---|---|
| `index.js` | 被装载清单（`PACK`）：本轮只声明一个 middleware 模块（`v3-tick`）。 |
| `settings/defaults.json` | **值层**：构造期就被读取的值 —— `vmu.schedule.autoArm`/`timeSource`/`triggerVia`/`triggers`、`vmu.v3.tickIntervalMs`、`vmu.records.tracks`。 |
| `middleware/tick.js` | tick 体：订阅 `v3/tick`，写一条 `journal` 记录（第几次 tick、时间、间隔），返回 `{ok:true}`。 |
| `README.md` | 本文件。 |

**只落了 P0-1。** v3 的九步循环（依赖同步→收口→优先级→晋升→验证补派→执行计划队列→规划→方法整理→汇报）
尚未实现：tick 体里**不**调用 `vmu.turn.run()`（那属于 P0-2，且 K2 的重入守卫会拒）。

## 两条必须知道的装载约束（写在这里，别在下一轮重新踩）

1. **构造期要读的键只能放 `settings/defaults.json`。** 清单的 `settings` 是装载后 apply，而调度器与 records
   在 `createKernel` 构造期就把这些值读走/快照了。写错地方**不会报错**，系统只是"安安静静地不跑"。
2. **`v3/tick` 是协议扩展主题，必须先 `declareTopic` 才能 emit / 才能被模块订阅。** 声明发生在 `middleware/tick.js`
   被 import 时（`bus.declareTopic` 是进程级的）。清单里的 module 条目**故意不写 `kind`**：`kernel/pack.js` 会把
   无 `kind` 的条目按 module 处理，而 `kernel/bus.js` 的静态校验会拒"带 kind 却没有 handler"的原始条目。
   清单条目里出现 `v3/tick` 时，`tests/vmu-middleware-hooks-declared.test.mjs` 目前只认冻结 hook 表 ∪ 宿主桥表 ⇒
   它需要把 `v3/tick` 记为一条**有理由的声明式主题**（见本轮报告）。

## 诚实边界 ✗

- 这**不是** v3，也**不是**行为等价证明。P0 只做"机制可用"；行为等价的 A/B 是另立项（与 P0-10 同一口径）。
- 本轮没有任何提示词段、槽位、tracks、M1 规则 —— 它们属于后续卡，不在这里提前声明（声明了没人读就是噪音）。
