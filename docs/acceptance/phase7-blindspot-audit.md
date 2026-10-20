# PHASE 7 / 静态审计三类盲区（目标 5）

本卷只记录**可执行判据**与**派生覆盖**，不是“又读了一遍”。扫描命令与命中数写在每节。

## 0. 覆盖口径（先说自己扫了多少、没扫什么）

- 源码扫描范围：`vibe-math-vmu/kernel/**`、`vibe-math-vmu/host*.js`、`vibe-math-vmu/packs/**`（`.js`），以及 `tests/*.mjs`。
- `tests/*.mjs` 手造事件/载荷模式：`payload:\s*\{`／`emit('…', {…})` 命中 **167 处**（grep）。**未逐条读完**；按“有/无生产者对齐断言”抽样 20 条（见 §1）。
- 时间判据：`ticks|plannerMaxFails|timeoutMs|intervalMs|deadline` 命中 **276 处**（grep 输出上限 250，已读 250，余 26 条未逐条读）。
- 运行时接线：`set*Observer|Applier|Provider|Catalogue` 定义 **4 个**；另有 `setToolExecObserver` 的调用点 1 处（不是定义）。全部已核（§3）。
- **没扫**：`.mjs` 探针里动态生成的载荷、宿主侧 DSH 源码、纯字符串拼接的事件名；这些不构成本卷的“已覆盖”。

## 1. (a) 接缝真实形状：手造载荷有没有与真实生产者对齐

判据：`tests/*.mjs` 里**直接构造事件/钩子载荷**的地方，必须能找到一条断言把它与**真实生产者**（host/loader/kernel 发出该 hook 的代码）对齐；否则列入“未对齐清单”。

命中 167 处；抽样 20 条的分类：

| 类别 | 抽样数 | 例子 | 判定 |
|---|---|---|---|
| 有显式对齐断言 | 6 | `tests/vmu-pack-plan-rule-validate.test.mjs` 用真实 `tools/pre-execute` 载荷 `{ tool, args, agent, hook }`；`tests/vmu-entry.test.mjs` 用真实 `tools/pre-execute` 由入口装配发出 | 对齐 |
| 有“形状相同”但**无生产者断言** | 9 | `tests/vmu-bus.test.mjs` 多处 `emit('meeting/round-start', { roster: [...] })` 是测试自己写的载荷；`tests/vmu-auditchain.test.mjs` 直接手造 `{ seq, what, at, payload }` | **未对齐** |
| 手造**回执**（不是事件） | 5 | `tests/vmu-v3-verify.test.mjs`、`tests/vmu-v3-methods.test.mjs` 的 `emit('turn/reply-parsed', { reply: … })` | 未对齐（parser 真形状只由别处覆盖） |

**未对齐清单（示例，不穷尽）**：
- `tests/vmu-bus.test.mjs:67,70,84,93,101,112,118,123,128,137,150,162`：手造 hook 载荷，未与真实 `bus.emit` 调用方的形状对齐。
- `tests/vmu-auditchain.test.mjs:22,44,89,101,171,186,193,300,321`：手造链行 `{ seq, what, at, payload }`，未断言真实 append 生产者的字段集。
- `tests/vmu-v3-verify.test.mjs:417-423`、`tests/vmu-v3-methods.test.mjs:450-461`：手造 `turn/reply-parsed` 回执，没有一条断言证明它等于 `parseReply` 真输出。

**这不是“都错了”**：大多数测试只消费载荷，不需要生产者断言；本条只要求“**声称接缝形状的测试**必须有一条对齐断言”。清单留作后续逐个补。

## 2. (b) 时序与时长：按计数/毫秒判断的地方

判据：每个 `ticks`／`MaxFails`／`timeoutMs`／`intervalMs`／`deadline` 的判据来源，都必须能回答“真实一个回合多久”；不能回答的列入。

命中 276 处（读 250）。**最严重 3 条**：

1. `vibe-math-vmu/packs/v3/middleware/planner.js:988` + `:899` + `:1187`：`state.ticks += 1`，`plannerMaxFails` 与 `planner-reply-pending` 的 `ageTicks` 都按 **tick 数**判断，而一个成员回合实测 **5–100 秒**、tick 是 **2 秒**级——这正是 SLV 被咬过的“5 个 tick＝10 秒 vs 100 秒回合”。已用 `deliveryTimeoutMs` 兜底，但 `plannerMaxFails` 本身仍是 tick 计数。
2. `vibe-math-vmu/packs/v3/middleware/verify.js:210,225,863`：`ticks/undecided/ticksWithoutVerdict` 全部按 tick 计数；`undecided` 已改成“新票后的未成立”，但 `ticksWithoutVerdict` 仍是 tick 单位——它名字诚实，**不是时长**。
3. `vibe-math-vmu/settings/schema.js:188`：`vmu.turn.deliveryTimeoutMs` 默认 **180000ms**；SLV 实测正常回合 5–44s、异常回合 180s 超时——阈值本身有实测依据，但**“一个回合多久”只在 SLV 记录里，未写进该键的注释**。

**其余同类（未逐条读）**：`vmu.math.timeoutMs`、`vmu.script.timeoutMs`、`vmu.external.timeoutMs`、`vmu.store.lock.timeoutMs`、`vmu.activity.timeoutMs`、`vmu.schedule.intervalMs` 等；它们多数是**毫秒**而非 tick，风险低于 planner/verify 的 tick 计数。

## 3. (c) 无断言的运行时接线：set* 声明有没有消费者断言

判据：每个 `set*Observer/Applier/Provider/Catalogue` 定义，必须有**一个测试**证明注册的函数**被调用过**（不是“函数存在”）。

定义共 **4 个**（`vibe-math-vmu/kernel/index.js`：`setMemberToolFaceApplier`、`setToolFaceCatalogue`、`setPackToolRetractObserver`；`kernel/turn/index.js`：`setVisibleToolsProvider`），另有 `host.js` 的 `setToolExecObserver`。

| 声明 | 消费者 | 证据 |
|---|---|---|
| `setToolExecObserver` | `vibe-math-vmu/vibe-math-vmu.js` 的 root 绑定；工具执行前 observer | `tests/vmu-host.test.mjs` 现在断言“真实工具执行后 observer 被调用” |
| `setMemberToolFaceApplier` | host adapter 的 `applyMemberToolFace` | `tests/vmu-host.test.mjs` 断言 `schemas()` 前后差集 |
| `setToolFaceCatalogue` | host adapter 发布 TOOL_NAMES＋pack 工具名 | `tests/vmu-pack.test.mjs` 断言 apply 收到 allow |
| `setPackToolRetractObserver` | host adapter 的 `retractTools` | `tests/vmu-host.test.mjs` 断言 retract 后 observer 收到被撤名 |
| `setVisibleToolsProvider` | turn 装配的状态块 | `tests/vmu-turn.test.mjs` 断言“状态块含真实工具名 / 空则不写段” |

**本阶段之前没有任何消费者断言的是**：`setToolExecObserver`、`setPackToolRetractObserver`。现在都有。

## 4. 新门禁：`tests/audit-observer-consumers.mjs`

- **判据**：扫描 `vibe-math-vmu/**/*.js` 中真正的 `set*Observer/Applier/Provider/Catalogue` **定义**（排除 `typeof kernel.setX` 之类调用点）；对每个名字，要求 `tests/*.mjs` 中有一个文件**同时**包含 `setName(` 与附近 1200 字符内的 `ok(` 断言。
- **自证能命中**：`--selftest` 输出 `named positive hits: true | no-test is red: true | no-assert is red: true | real definitions found: 4`。
- **自证能红**：`--selftest` 用合成源/测试证明“无测试 ⇒ 红”“只提名字不断言 ⇒ 红”；同时用真实源码证明扫描不是零命中（`real definitions found: 4`）。
- **默认模式**：扫描真实仓；当前 `=== OBSERVER CONSUMERS: 4 setters, all have a test that names them ===`，exit 0。
- **作业数**：该测试是新增 job，派生计数从 455 变 **456**（suites 349 / probes 107），README 与 `docs/test-timing.md`、`docs/AUDIT-CHECKLIST.md` 已由 `update-doc-counts.mjs` 更新。

## 5. 结论与后续

1. **(a) 接缝形状**：无法完全机械化；本卷给出 167 命中的抽样与“未对齐清单”，**未逐条判定**。
2. **(b) 时序**：最大残余是 `plannerMaxFails`／`verify.ticks` 仍按 tick；`deliveryTimeoutMs` 已有 SLV 实测依据，但注释里没有“真实回合多久”。
3. **(c) 接线**：5 个 setter 全有消费者测试；新增门禁可红、可自证，已进 T1。
4. **没核到**：宿主侧 DSH 源码、动态生成载荷、`ticks` 276 命中中剩余 26 条、以及 (a) 未抽样部分。
