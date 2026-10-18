# Phase 6 · 逐轮完成记录（★ 用户要求：每轮完成情况持续记录到 md）

> ★ **本文件是【阶段 6】的逐轮账**。★ 规矩：★ 每轮**追加一节**，★ 记 **本轮做了什么 / 证据 / 未做完的 / 下一轮计划**。
> ★ **不写"打算"当"已做"** —— ★ 没做的写"未做"，★ 没核到的写"未核到" ✓

---

## 阶段 6 的四个总目标（★ 用户 2026-10-18 下达）

| ★ # | ★ 目标 | ★ 状态 |
|---|---|---|
| ★ **1** | ★ **适配新版 DSH**（★ 全面检查 ＋ 需要则改；★ 并看新版有无可采纳的新东西） | ★ **进行中** |
| ★ **2** | ★ **完成 v3 pack** —— 使 `vmu+v3pack` **完全一致甚至更优**地复刻原 `vibe-math-v3` 的运行机制/逻辑/提示词 | ★ **进行中（先盘点）** |
| ★ **3** | ★ **全面审查**（代码/docs/逻辑，★ 至 0 问题） | ★ 未开始 |
| ★ **4** | ★ **暂停 goal 并询问用户**是否进行 SLV；★ 放行后跑 v3 与 v5r 真机至结题（★ **告知代理这是模拟、以测试功能为主**） | ★ 未开始 |

★ **纪律**（★ 用户明确）：★ 不发布；★ 只跑**必要**门禁，★ **长门禁（>5 分钟）每 3–7 轮才跑一次**；★ commit ＋ push；★ 临时件放 `D:\_tmp`；★ 队友最多 8 并行。

---

## 轮 1（2026-10-18）

### ★★★★★ 本轮最重要的发现：**DSH 实际是 `0.2.1-rc.2`，而 vmu 只测到 `0.2.0-rc.2`**

★ **证据**（★ 逐字读出来的）：`C:\Users\admin\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\package.json`
- ★ `"name": "@deepseek-ai/dsh-desktop-runtime"`／★ `"version": "0.2.1-rc.2"`
- ★ `"@deepseek-ai/dsh": "0.2.1-rc.2"`，★ **且该文件里 300+ 个 `@deepseek-ai/dsh-*` 依赖全部是 `0.2.1-rc.2`** ✓
- ★ 桌面端 `app.asar` 时间戳 **2026-10-17 17:20**；★ `app-update.yml` 的 channel ＝ **`nightly`** ⇒ ★ **确实是新构建** ✓
- ★ 佐证：★ 本会话 GUI 端口从 **19387 变成 52193**（★ 应用重启过）✓

★ **而 vmu 的 `package.json`**：
| ★ 字段 | ★ 值 |
|---|---|
| ★ `dsh.testedVersion` | ★ **`0.2.0-rc.2`** |
| ★ `compatibility.dshReleases` | ★ **最高只列到 `0.2.0-rc.2`** |
| ★ `engines.dsh` | ★ 末段 **`>=0.2.0-alpha.1 <0.3.0-0`** ⇒ ★ **0.2.1-rc.2 在范围内** ✓ |

★ **另要分清**：★ **PATH 上的 `dsh` CLI 仍报 `0.2.0-rc.2`**（★ 比桌面端旧）⇒ ★ **"DSH 版本"有两个**：★ **桌面运行时（0.2.1-rc.2，★ 本会话跑的就是它）** vs ★ **CLI（0.2.0-rc.2）** ✓

### ★★★★ 已完成的动作

1. ★★ **提高了队友上限以开"第三批"**（★ 用户要求）
   ★ `~\.dsh\profiles\desktop\cordis.patch.yml` 里 `agent-team.config.maxMembers`：★ **16 → 24** ✓
   ★ **理由写进了文件注释**：★ 该文件**原本就有同因注释**（★ 逐字）：★ *"a member's provider/model are **IMMUTABLE identity fields** and roster rows **can never be removed**, so 'repoint the backend' is impossible for them and the only clean route is a **NEW member name** (which inherits the Lead's current route)"* ⇒ ★ **我补了"第三批（2026-10-18）：opencode-go 与 commandcode 都无额度，★ Lead 已转到 deepseek 路由"** ✓
   ★ **实测生效**：★ **spawn 成功**（★ 无需重载 profile），★ 新队友 `model` ＝ **`deepseek-flash`**（★ 新 provider）✓

2. ★★ **第三批第一位：`dsh-compat`**（★ 目标 1 的执行者）
   ★ 任务：★ 找出 0.2.0-rc.2 → 0.2.1-rc.2 的变更；★ **用 `cordis_inspect` 拉取运行时服务/事件/工具目录**（★ 这是"新版提供什么"的一手证据）；★ 对照 vmu 的**实际依赖面**（`inject`／`ctx.get(...)`／`host*.js`／`kind:'host'` 钩子）★ 逐条判断**仍在／变了／消失**；★ 产出**适配清单**（★ 必须改／建议改／可采纳）✓

3. ★★ **第三批第二位：`v3-inventory`**（★ 目标 2 的地基）
   ★ 任务：★ 把原 v3 的**全部机制**盘清（★ 规划-调度闭环／方法库／软规范数据模型／验证分层／Lean／断点续跑／参数表／提示词段／并发写锁／35 工具全表），★ 然后**逐条判断 vmu 能否表达**（★ 六态：★ 纯数据 pack／M2／M3／M4／装配层注入／**框架能力不足需加内核能力**），★ 产出**复刻施工图骨架**（P0/P1/P2）✓
   ★ **为什么先盘点**：★ **v3-core 只有 134 非空行**，★ 而原 v3 是 **6285 行** ⇒ ★ **行数不能证明什么，★ 但"缺了哪些机制"必须先数清** ✓

### ★★ 本轮建立的基线

| ★ 项 | ★ 值 |
|---|---|
| ★ 仓库 HEAD | ★ `602f194b`，★ dirty=0 |
| ★ 仓库版本 | ★ `2.8.5` |
| ★ 桌面 DSH | ★ **`0.2.1-rc.2`** |
| ★ CLI dsh | ★ `0.2.0-rc.2` |
| ★ profile | ★ `desktop`（★ 其中 `vibe-math-*` 全部 `disabled: true`） |
| ★ agent-team 上限 | ★ **24**（★ 本轮由 16 提高） |
| ★ profile 的 Lead 路由 | ★ `agent-default-model`：★ `provider: deepseek-account`／★ `model: deepseek-flash` |

### ★★ 本轮未做 / 待办

- ★ **未改 vmu 任何代码或 docs** —— ★ 因为**适配结论还没出来**（★ `dsh-compat` 在跑）；★ **先核实再改**，★ 不猜 ✓
- ★ **v3 pack 未动一行** —— ★ 等 `v3-inventory` 的施工图 ✓
- ★ **未跑长门禁**（★ T1 > 5 分钟）—— ★ 按纪律每 3–7 轮才跑；★ 本轮只做了**只读侦察** ✓
- ★ **门禁状态未知**（★ 上阶段末为 T1 374/374 绿；★ 但**换 DSH 大版本后必须重跑**）⇒ ★ **列入轮 2–3**

### ★★ 轮 2 计划（★ 按需，不凑数）

1. ★★ **收 `dsh-compat` 的适配清单** ⇒ ★ 若"必须改"非空 ⇒ **立即改并验证**
2. ★★ **收 `v3-inventory` 的机制清单 ＋ 施工图骨架** ⇒ ★ 定 **P0 清单**，★ 再派实现
3. ★★ **跑一次必要门禁**：★ `node scripts/preflight.mjs` ＋ ★ `scripts/check-docs.mjs`（★ 都很快）⇒ ★ **确认换 DSH 后没坏**
4. ★ ★ 视情况跑 **T1**（★ 长，★ 但换大版本后**值一次**）

---

## 轮 1 · 追加（★ 同轮内收口：`v3-inventory` 交付 ＋ 三处更正）

### ★★★★ 收 `v3-inventory` 的交付（★ 目标 2 的地基已成）

★ **全量盘点已固化进仓**：★ **`docs/acceptance/phase6-v3-replication-blueprint.md`**（★ 62 KB / 305 行）—— ★ 含**机制全表（A 驱动／B 规划调度／C 验证＋Lean／D 方法库／E 数据模型／F 人工干预／G 参数提示词并发工具面）**、★ **逐条"vmu 能否表达"判定**、★ **复刻施工图 P0/P1/P2**、★ **需加内核能力的 K1–K11**、★ **未核到清单 U1–U10** ✓

★ **它同时校正了我给的几个基线数字**（★ 以它的派生值为准）：
| ★ 项 | ★ 我先前说 | ★ 实测（派生） |
|---|---|---|
| ★ `实现方案.md` | ★ 406 行 | ★ **649 总 / 498 非空 / 16 节** |
| ★ `vibe-math-v3.js` | ★ 6285 | ★ **6285 总 / 6199 非空** ✓（对上了） |
| ★ v3 工具数 | ★ "35" | ★ **36**（★ 35 个 `vibe_math_*` ＋ `math_computation`） |
| ★ v3 参数 | ★ 未盘 | ★ **`PARAM_SCHEMA` 64 条**（`PARAM_PROPS_KEYS` 63，★ 差 `fileLockTimeoutMs`） |
| ★ vmu 钩子数 | ★ — | ★ **`VU_HOOKS` 124**（★ 可阻断 16）⇒ ★ **`docs/19:39-46` 写的"20 项"已过时** ✗ |
★ 另：★ **`math-computation.js` / `math-engines.js` 在 v3／vmu／v4／v5r【sha256 逐字节相同】** ✓

### ★★★★★ 三处【我先前对你说错】的事实（★ 已回代码复核为真）

| ★ # | ★ 我说过 | ★ 实际（★ 证据） |
|---|---|---|
| ★ **1** | ★ "**M2 能触达服务** ⇒ 可做 v3 调度" | ★★ **M2 的服务目录是【固定 15 项】**（`kernel/index.js:1416-1428`）：★ `tasks/meetings/chat/mailbox/panel/minutes/ballotbox/members/commitlog/library/records/human/budget/activity/metrics` ⇒ ★ **没有 store／scheduler／turn／control／work／idempotency／lean** ✗ |
| ★ **2** | ★ "`turn/reply-parsed` 是 blockable ＋ **rewritable**" | ★★ **`rewriteResult` 全仓【只出现 1 次】** —— `kernel/bus.js:34` 的能力名映射（★ 即"允许声明"）⇒ ★ **没有任何消费者真的应用改写** ⇒ ★ **该点【只能拒、不能改】** ✗ ★ ★ **这是"宣称 vs 实现"的一处缺陷**（★ 注册表 `bus.js:81` 写 `rewritable:true`） |
| ★ **3** | ★ "`control/heartbeat` 可当 v3 的周期驱动" | ★ 它**确实 emit**（★ `kernel/index.js:2072`，★ 返回值被计数）★ **但没有定时器**；★ 唯一触发者是**显式**的 `vibe_vmu_control{action:'beat'}`（★ `tools/control.js:36`）⇒ ★ **不能当周期源** ✗ |

⇒ ★★★ **这三条直接把目标 2 的性质定死了**：★ **v3 的复刻【不是纯 pack 工作】** —— ★ **P0-1（tick）与 P0-2/P0-4（派发回合）必须先给内核加具名能力**（★ K1／K2）✓
★ **而这是【符合哲学】的**：★ **"能力在内核，★ 规范/策略/装配在 pack 或宿主"** ⇒ ★ **加内核能力是正解，★ 不是搬 v3 的代码** ✓

### ★★★ 目标 2 的可行性结论（★ 现在有依据了）

★ **可行，但要分两层做**：
- ★★ **第一层（现有机制已够，★ 只需 pack 策略代码 ＋ 声明）** —— ★ 比预期多：★ **软规范 md 卡**（`library` ＋ tracks）／★ **验证投票**（`ballotbox.cast` 的 `estimate` 票种 ＋ **`ballot/tally` 可注入 tally** 覆盖）／★ **辩论轮限**（`vmu.meetings.verdictMaxRounds`）／★ **人工门**（`vmu.human` ＋ `human/gate-pending` 可阻断）／★ **汇报**（`vmu.report`）／★ **Lean 全套**（`lean.js` ＋ `fidelity.js`）／★ **论文全套**（`paper.js`） ✓
- ★★ **第二层（需加内核具名能力）**：★ **K1 周期自驱**（`scheduler` 有 every/arm/tick，★ **但装配没注入 timer、内核不自动 arm**）／★ **K2 派发一次成员回合**（`vmu.turn` 不在 M2 目录；`members.wake` 需装配注入 `deliver`）／★ K3–K11（见蓝图） ✓

★ **另有一条必须写进断言的行为差异**：★★ **v3 的拒绝码普遍缺失**（★ tick/计划/验证/方法库多为 `{ok:false,message}` 或**静默剔除**）⇒ ★ **复刻若照抄会撞 vmu 的"拒绝要具名"红线** ⇒ ★ **必须在 P0/P1 断言里明确"这里要比 v3 更严"** ✓

### ★ 本轮末状态

| ★ 项 | ★ 值 |
|---|---|
| ★ HEAD | ★ 本轮结束时提交（★ 见下条） |
| ★ 快门禁 | ★ `PREFLIGHT PASS`／`DOC LINT PASS`／`regen 16/16` ✓ |
| ★ 队友 | ★ `dsh-compat` **仍在跑**（★ 目标 1）；★ `v3-inventory` **已交付** ✓ |
| ★ 目标 2 地基 | ★ **已成**（★ 蓝图进仓）✓ |
| ★ 目标 1 | ★ **待 `dsh-compat` 回报** |

### ★ 轮 2 计划（★ 更新）

1. ★★ **收 `dsh-compat`** ⇒ ★ "必须改"非空就立刻改
2. ★★ **目标 2 开工顺序**（★ 我按依赖排）：
   - ★ **先做 K10**（★ `rewritable` 名不副实）—— ★ **它是一处真缺陷**，★ 便宜、★ 且不清掉会污染后续断言
   - ★ **再做 K1（周期自驱）＋ K2（派发回合）** —— ★ **v3 复刻的两根支柱**，★ 必须先进内核
   - ★ **然后 P0 的 pack 层**（★ 规划模块／方法库模块／验证模块／人工门／tracks）
3. ★★ **跑一次 T1**（★ 换 DSH 大版本后值一次；★ >5 分钟，★ 但本轮是第 2 轮，★ 且 K10 改动会影响全量）

---

## 轮 2（2026-10-18）

### ★★★★★ 目标 1 的实质：DSH 0.2.1-rc.2 换了子代理的**启动动词** —— 而 vmu 的默认交付路径正靠它

★ **`dsh-compat` 审计 ＋ 我向运行时核实**，两边一致：
★ **`subagents` 服务现在提供**：`startActivation`（两个重载）／`waitForChildren`／`drainDescendants`／`drainChildren`／`sendMessage`／`interrupt`／`listChildren`／`listDescendants`／`prompt`／`interruptByParent`／`registerProvider`／`getProvider`／`list`／`resolveMaxDepth`
★★ **而 `start` 与 `startContinuable`【都不存在】** ✓（★ 运行时服务目录直接读出来的，★ 不是看文档）
★ 新增类型：★ `SubagentActivationSpec = { provider, label, childId?, request, signal, delivery:'parent'|'caller' }`；★ `SubagentActivation = { childId, messageId?, result: Promise<SubagentResult>, dispose() }`；★ `SubagentResult = { output: ContentBlock[], structured?, diagnostic?, stopReason }` ✓
⇒ ★★ **vmu 的默认 `deliverMode:'subagents'` 在 0.2.1 上会【每次交付都被拒】** —— ★ 这是**唯一的硬伤** ✓

### ★★★★ 本轮改动（目标 1 的适配）

| ★ 文件 | ★ 改了什么 | ★ 为什么 |
|---|---|---|
| ★ **`kernel/turn/index.js`** | ★ 加**第三条路径 `activation`**（★ 顺序：`one-shot` → ★ **`activation`** → `continuable`）；★ 加 `startOnce()` 把"发起"集中一处；★ **activation 的取回逻辑**：★ `await activation.result` → ★ **从 `result.output` 的 text 块取文本** → ★ **`dispose()`** → ★ 带上 `stopReason`／`childId`／`structured`；★ 加两个防御式助手 `providerNamesOf()`／`textOfContentBlocks()` | ★ 0.2.1 只有 `startActivation`；★ **旧的两个动词保留作回退**（★ vmu 仍声明支持 0.1.2+，★ 且 48 个 fake-host 测试靠它们）|
| ★ **`host-deliver.js`** | ★ provider 发现条件加 `startActivation`；★ **前置判定**加 `startActivation`；★ **拒绝措辞改成真话**（★ 原文说"宿主没有 subagents 服务"★ **是假话** —— 服务在，★ 缺的是动词）；★ 列出**宿主实际提供的动词** | ★ 否则 0.2.1 上永远发现不到 provider、★ 且诊断指向错误的原因 |
| ★ **`installer.js`** | ★ **去掉 `startContinuable` 的必需要求**；★ 改成"`start`／`startActivation`／`startContinuable` **至少其一**"探测 | ★ 否则自检会把**更新的宿主**报成"宿主版本可能过旧"（★ 假阴性）|
| ★ **`package.json`** | ★ `testedVersion: 0.2.0-rc.2 → **0.2.1-rc.2**`；★ `compatibility.dshReleases` 补 `"0.2.1-rc.2": "compatible"`；★ `compatNote` 加一段说明 0.2.1 的动词变更；★ 新测试进 `files` | ★ `engines.dsh` 本已覆盖（`>=0.2.0-alpha.1 <0.3.0-0`）★ **不必改**；★ 而 `testedVersion`／`dshReleases` 是**给人看的宣称**，★ 留着 0.2.0 会误导 |
| ★★ **`tests/vmu-turn-activation.test.mjs`（新）** | ★ **27 条断言**：★ activation 路径被选中／★ **spec 五字段形状**（含 `delivery:'caller'`）／★ 从 `output` 取词／★ `stopReason`/`childId`/`structured` 传递／★ **成功与失败两条路都 `dispose()`**／★ 无文本⇒具名拒／★ 缺 provider⇒`VMU_INVALID_ARGUMENT`（**在重试之外**）／★ 旧动词回归／★ 无动词⇒具名拒并列出实际动词 | ★ 改前 **48 个测试用旧动词、★ 0 个用 `startActivation`** ⇒ ★ **新路径零覆盖**；★ 这条改动是"要么有测试、要么等于没做" |

### ★★★ 结果

| ★ 测试 | ★ 结果 |
|---|---|
| ★ `vmu-turn-activation.test.mjs`（新） | ★ **27 passed / 0 failed** ✓ |
| ★ `vmu-turn.test.mjs` | ★ 148 / 0 ✓ |
| ★ `vmu-host-deliver-wiring.test.mjs` | ★ 9 / 0 ✓ |
| ★ `vmu-round1-seams.test.mjs` | ★ 40 / 0 ✓ |
| ★ `vmu-turn-contracts.test.mjs` | ★ 12 / 0 ✓ |
| ★ `audit-code-size.test.mjs` | ★ 9 / 0 ✓（★ `turn/index.js` **1159/1200**，★ 逼近上限）|
| ★ `audit-installer-compat.test.mjs` | ★ 77 / 0 ✓ |
| ★ `audit-package-membership.mjs` | ★ 29 / 0 ✓ |
| ★ `preflight` | ★ **PASS** ✓ |
| ★ `check-docs` | ★ **PASS** ✓ |
| ★ `regen-all --check` | ★ **16/16 in sync** ✓ |

### ★★★★★ 本轮我写下的两个【同类错误】—— 值得单列

★ **两处"拒绝自己抛异常"**，★ **而且都写在同一批修改里**：
1. ★ `kernel/turn/index.js` 的拒绝 hint 里 `Object.getPrototypeOf(subagents)` —— ★ `subagents` 为 `null` 时**抛 TypeError** ⇒ ★ **三条既有断言拿到的是裸 TypeError（无 `.code`）**
2. ★ `host-deliver.js` 的 `typeof subs.startActivation` —— ★ `subs` 为 `undefined` 时**抛 TypeError** ⇒ ★ 同一后果
⇒ ★★ **教训（★ 已写进代码注释）**：★ **"每个新探针都要先把【服务不存在】的情形写好，★ 而不是最后才想"**；★ 而**"一个会抛的 hint 会把可诊断的拒绝变成不可诊断的崩溃"** ✓
★ 两处都已修，★ 并**复跑验证**（★ 探针直接打出 `code: VMU_ENGINE_UNAVAILABLE` ＋ 诚实消息）✓

### ★★ 轮 2 未做 / 待办（★ 按 `dsh-compat` 的清单）

- ★★ **建议改（不坏）**：★ `cordis.patch.yml` 的 `backgroundMode: continuable`（★ 0.2.1 无此键，★ 被静默忽略）／★ **4 个宿主不存在的钩子名**（★ `prompt/assemble`／`prompt/section`／`agent/inbox`／`settings/changed` —— ★ 两版都不存在，★ 是 vmu 登记表里的旧词汇）／★ `ctx.get('session')` 应为 `'sessions'`／★ `reportfeedback.js` 的 CONTEXT_ORDERS 注释
- ★★ **可采纳的新能力**（★ 最贴合哲学的三条）：★ **per-child `cwd`/`agentPreset`/`outputSchema`**（★ 成员各有工具面/预设；★ 近乎零成本）／★ **结构化子代理回执**（★ `structured` ＋ `outputSchema`，★ 与 vmu"回执＝一次调用的 JSON 结果"文化契合）／★ **`plugin:` 会话记录通道**（★ `ignorable`、★ 随 fork/resume 走 —— ★ 但**实验 API**，★ 只能当镜像不能当权威）
- ★★ **未跑 T1**（★ >8 分钟）—— ★ 本轮改了 turn 内核，★ **T1 列为轮 3 必跑**（★ 已经超过"换大版本后值一次"的理由）
- ★ **目标 2／3／4 未动**（★ 本轮全部用于目标 1 的硬伤）

### ★ 轮 3 计划

1. ★★ **跑 T1**（★ 本轮改了 turn 内核，★ 必跑）
2. ★★ **清 `dsh-compat` 的"建议改"四项**（★ 都是小而真的）
3. ★★ **采纳 1–2 项新能力**（★ 优先 **per-child `cwd`/`agentPreset`** 与 **结构化回执**，★ 按"内核加具名能力 ＋ pack 声明去用"）
4. ★ 然后回 **目标 2**（★ 按蓝图的 P0 顺序：★ 先 K10（`rewritable` 名不副实）→ ★ K1（周期自驱）→ ★ K2（派发回合））

---

## 轮 4（2026-10-18）

### ★★★★★★★ 创始人决定：**1200 行硬闸【退休】** —— ★ 本轮最重要的一件事

★ **原话**（★ 逐字）：★ *"我认为1200太紧，如无必要不应该有这种限制，一定不要限制你们的发挥，一切以符合哲学理念的最优方案来进行而不是局限"* ✓

★ **我的判断与落地**（★ 说明理由，★ 不是照办）：
★ **尺寸不是正确性属性** —— ★ 它只是"**屎山要看得见**"的一个**观察指标**；★ 而**把观察指标做成闸门**，★ 就是拿**启发式**去限制发挥 ⇒ ★ **与"自由度／扩展性极强"直接冲突** ✓
⇒ ★★ **所以正确的改法【不是删掉这道门禁】，★ 而是【只删"拦"、★ 不删"看"】** ✓

| ★ 维度 | ★ 退休前 | ★ 退休后 |
|---|---|---|
| ★ 测量 | ★ 每个 `.js` 计数 | ★ **一样** |
| ★ 可见性 | ★ 超限者进 `KNOWN` 名单（★ 只减不增） | ★★ **打印【最大的 8 个】＋ 逐个列名【所有超过软线的】** |
| ★ 硬拦 | ★★ **超线即红**（★ 除非在冻结名单里） | ★★ **【没有任何一条断言因尺寸而拒绝】** |
| ★ 仍然会红的（★ 可达性） | ★ — | ★ ① 走不到框架（★ 扫到 0 个文件）② **计数器不能证伪**（★ 合成超线输入要能被测出、★ 短的不能）③ **建议清单与测量必须同源**（★ 防名单烂成谎言）④ **决策必须被记载**（★ 含"已退休"） |

★ **改了两个文件**：
1. ★ **`tests/audit-code-size.test.mjs`** —— ★ 重写为 **9 条断言**，★ 末行输出 **`advisory over: N`**；★ 结果：★ **9/0，★ `advisory over: 3`** ✓
2. ★ **`docs/02-architecture.md:178`** —— ★ 把"建议"改成**软建议/advisory**，★ 并**具名记载"硬闸已退休"＋退休前形态＋为什么错＋退休后形态＋判据** ✓（★ **这样它不能被无意中改回去** —— ★ 门禁断言了 doc 必须含"退休/软/advisory"字样 ✓）

★ **它当场给出的分布**（★ 现在只是被看见）：★ `kernel/index.js` **2439**／★ `settings/schema.js` **1778**／★ `math-computation.js` **1482**／★ `resume.js` 1195／★ `host.js` 1185／★ `vibe-math-vmu.js` 1171／★ `turn/index.js` 1159／★ `meetings.js` 1154 ✓

### ★★★ 而本轮【在此之前】做的抽取 —— ★ 现在它靠自己的理由站着

★ **`vibe-math-vmu.js` 里的 `children` 块（恢复用的父 id ＋ 子名册对账）→ 新模块 `host-children.js`（61 行）** ✓
★ 入口 **1203 → 1171** ✓
★ ★ **诚实说明**：★ **我做这个抽取的动机是那道硬闸**；★ 而**闸门退休后，它仍然成立** —— ★ 因为它是**单一职责**（★ 与 `host-deliver.js` 轮 81 那次同型：★ 入口管装配、★ 该模块只管"哪些活在册的子会话属于这个父、父 id 是谁"），★ 且**可脱离插件入口测试**（★ `ctx`／`resolveSubagents` 都是参数注入）⇒ ★ **保留，★ 但理由换成"职责分离"而不是"体积"** ✓
★ **新文件按规矩登记了两处**：★ `package.json#files`（★ 754 条）＋ ★ `installer.js` 的 managed 清单 —— ★ 否则**装完就 `MODULE_NOT_FOUND`**（★ 这条本仓踩过）✓

### ★★★★ K10 的新证据（★ 本轮只查证、★ 未动手）

★ **`turn/reply-parsed` 的 `rewritable: true` 是【幽灵机制】**，★ 本轮查实三件事：
1. ★★ **全仓【没有任何代码读 `.rewritable`】**（★ grep 零命中）⇒ ★ 该字段**纯文档性质**
2. ★★ **`rewrite-result` 能力名【零消费者】**；★ 而 `docs/19-plugin-and-extension-development.md:227` **把它写成契约**：★ 逐字 `| turn/reply-parsed | { member, reply } | reply（rewrite-result） | { ok, reply } | 抛错⇒保留原 reply |`
3. ★ **没有 handler 真的返回 `rewrite:` 键**
⇒ ★★★ **所以：★ 文档承诺了一个【不存在】的应用点** ⇒ ★ **正是上一阶段修过 5 次的同一解剖**（★ **"契约承诺了实现没做的事"**）✓
★ **为什么【实现】而不是【删文档】**：★ 它与**目标 2 直接相关** —— ★ v3 的 `sync_meta` 要**规范化/校验成员回执**，★ 而 blockable 只能"拒"、★ 不能"规范化后再收" ✓
★ **下一轮首项**：★ 在 **`bus.emit` 处**按 `rewritable` 应用返回值（★ 一处，★ 让该字段获得**第一个读者**、★ 让文档契约成真）；★ 今天**无 handler 返回它** ⇒ ★ **行为零变化**，★ 风险可控 ✓

### ★★ 本轮结果

| ★ 项 | ★ 结果 |
|---|---|
| ★ `audit-code-size`（重写后） | ★ **9 / 0**（★ `advisory over: 3`）✓ |
| ★ `audit-package-membership` | ★ 29 / 0 ✓ |
| ★ `audit-installer-compat` | ★ 77 / 0 ✓ |
| ★ `vmu-resume-token-contract` ／ ★ `vmu-entry` | ★ 14/0 ／ 150/0 ✓ |
| ★ `check-docs` ／ ★ `regen` ／ ★ `preflight` | ★ PASS ／ **16/16** ／ PASS ✓ |
| ★ **T1** | ★ 见下（★ 本轮末跑） |

### ★ 轮 5 计划

1. ★★ **K10 实现**：★ `bus.emit` 按 `rewritable` 应用返回值（★ 让 `rewriteResult` 有消费者、★ 让 `docs/19:227` 的契约成真）＋ 断言（★ 含**正向**：真能改写；★ 与**反向**：非 rewritable 的钩子返回改写**被拒或忽略且有据**）
2. ★★ **然后目标 2**：★ 蓝图 P0 的 K1（周期自驱）／K2（派发回合）—— ★ **注意：硬闸退休后，`kernel/turn/index.js`（1159）不必再压** ✓
3. ★ 视情况把"0.2.1 适配结论"补进 **`docs/11-gates-and-development.md`**（★ 现在还只在 `docs/acceptance/` 与 `compatNote` 里）


### ★★★★ 轮 4 收口：T1 **373/375** 的两红（★ 都是我的，★ 且一条是【门禁在抓我自己】）

★ **T1 末跑：`TOTAL 375 PASS 373 FAIL 2`** —— ★ 两红**都在我本轮新写/新改的东西上**：

| ★ 红 | ★ 根因 | ★ 处置 |
|---|---|---|
| ★★ `audit-declaration-criterion`（RULE E） | ★★ **我新写的门禁里有"不可能失败"的断言**：★ `ok(advisory.length >= 0, …)` **恒真**；★ 而 `advisory.every(…)` **空集恒真** ⇒ ★ RULE E 具名报出 **`audit-code-size.test.mjs:68 [A] every() is TRUE on an empty set** ✓ | ★ 把恒真断言换成**可证伪**的两条（★ 清单必须**降序**、★ `largest` 必须**恰为 min(8, 文件数)**）＋ ★ 给 `.every` 加 **`EMPTY_ALLOWED`** 注记（★ 空清单是**好结果**，★ 并写明同表达式里还有什么能红）⇒ ★ **10/0** ✓ |
| ★ `audit-cross-volume-refs` | ★ 我在两处注释里写 **`docs/02 §178`**，★ **而 178 不是该卷【声明】的小节** ⇒ ★ **跨卷引用门禁正确地拒了它** ✓ | ★ 改成 **`docs/02 §7`**（★ 卷 02 声明的小节，★ 待决项 1 在其下）⇒ ★ **1083 条引用、0 未解析** ✓ |

★★ **两条都印证了本仓的两条老教训**：
1. ★★ **"新写一条断言，★ 先问它能不能失败"** —— ★ 我写 `length >= 0` 的那一刻就在造一条**恒真**断言 ✓
2. ★★ **"引用要锚【声明过的小节】，★ 不要锚行号/编号"** —— ★ 而且**这道门禁真的在守它**（★ 它不认识 `§178`，★ 因为卷 02 没有第 178 节）✓

★ **收口后状态**：★ `code-size` **10/0**／★ RULE E **88/0**／★ 跨卷引用 **1083/0**／★ `regen 16/16`／★ `DOC LINT PASS`／★ **`PREFLIGHT PASS`** ✓
★ ★ **T1 未再重跑**（★ 又一轮 8 分钟）—— ★ 而两条红**已被各自的独立复跑证明修好**（★ 且改的只有那三条断言与两处注释）⇒ ★ **下一轮开头补一次 T1 作为确认**，★ **不把"独立复跑绿"当成"T1 绿"** ✓

★★★ **额外说明（★ 关于"体积"这件事本身）**：★ 硬闸退休后，★ `kernel/index.js`（**2439 行**）／★ `settings/schema.js`（1778）／★ `math-computation.js`（1482）★ **都不再需要为此做任何动作**；★ 而 `turn/index.js`（1159）等**也不再被逼着压** ⇒ ★ **后续目标 2 的实现不必为凑行数牺牲清晰度** ✓

---

## 轮 5（2026-10-18）

### ★★★★★★ K10 落地：**`rewrite-result` 终于有了消费者** —— ★ 而这是"契约承诺了实现没做的事"的第 6 例

★ **改前三件事都查实**：
1. ★★ **`.rewritable` 全仓【零读者】**（★ 除登记表自己外无一处 grep 命中）
2. ★★ **`rewriteResult` 全仓【只出现 1 次】** —— 就是 `DECISION_CAPABILITY` 里那条映射
3. ★★ **而 `docs/19 §7` 把契约写成了**：★ `turn/reply-parsed … reply（rewrite-result）` ⇒ ★ **文档承诺了一个不存在的应用点** ✓
⇒ ★★★ **后果**：★ pack 可以声明该能力、★ **通过能力校验**、★ 返回一个改写、★ **然后看着原始回执被派发下去** ⇒ ★ **静默无效** ✓

### ★★ 修法：**实现它**（★ 而不是删文档）—— ★ 因为文档承诺的行为**真的有用**
★ 与**目标 2 直接相关**：★ v3 的 `sync_meta` 要**规范化/校验成员回执**，★ 而 `blockable` 只能"拒"、★ **不能"规范化后再收"** ✓

★ **加了 `bus.rewriteOf(hook, emitted)`**（★ 在 `bus.js` 里，★ 与词汇同处一地）：
| ★ 状态 | ★ 行为 |
|---|---|
| ★ 没人要求改写 | ★ 返回 `null`，★ 调用方保留原值 |
| ★ 合法改写 | ★ 返回它（★ **`order` 已决定谁最后跑 ⇒ 后者胜，★ 确定性**）|
| ★★ **在【非 rewritable】钩子上改写** | ★★ **具名拒**，★ **并报出 `rewritable=false`** ⇒ ★ **`.rewritable` 获得了第一个读者** ✓ |
| ★★ **值畸形**（★ 非 string、★ 非 `{reply}`） | ★★ **具名拒**，★ 点名出错条目 ⇒ ★ **不静默** ✓ |
★ 而 `turn/index.js` **不 import 任何东西**（★ 它刻意零依赖）⇒ ★ **`bus.rewriteOf` 是【探测式】调用**：★ 注入的/旧的 fake bus 没有它 ⇒ **行为逐字不变**（★ 这就是 48 个 fake-host 套件没被打破的原因）✓
★ 应用点在 **`turn/reply-parsed` 之后、`dispatch` 之前**：★ `parsed.reply = rewritten` ✓

### ★★★ 新测试 `tests/vmu-rewrite-result.test.mjs`：**18/0** ✓
★ **用真 `createBus`**（★ 不是假 bus），★ 七组：
1. ★ **正向**：★ `{rewriteResult:'normalised'}` ⇒ 取回 `'normalised'` ✓
2. ★ **对象形**：★ `{rewriteResult:{reply:'from-an-object'}}` ⇒ 取回 `'from-an-object'`（★ 文档给的就是这个形）✓
3. ★ 没人要求 ⇒ `null`（★ 两条：★ 只 annotate 的条目／★ 空条目表）✓
4. ★ **后者胜**（★ `order` 100 vs 200 ⇒ 取 200 的）✓
5. ★ **畸形 ⇒ 具名拒且点名条目** ✓
6. ★★ **非 rewritable 钩子（`tools/pre-execute`）⇒ 具名拒**，★ **消息含 "not declared rewritable"**、★ **hint 含 `rewritable=false`** ✓
7. ★ 被拒的 emit ⇒ **什么都不可改写** ✓
8. ★ **接线**（★ 源码级：★ 真的调 `bus.rewriteOf('turn/reply-parsed'`、★ 真的探测、★ 真的在派发前替换）✓

### ★★ 本轮结果

| ★ 项 | ★ 结果 |
|---|---|
| ★ `vmu-rewrite-result`（新） | ★ **18 / 0** ✓ |
| ★ `vmu-bus` ／ ★ `vmu-turn` ／ ★ `vmu-turn-activation` | ★ 44/0 ／ 148/0 ／ 27/0 ✓ |
| ★ `audit-hook-coverage` ／ ★ `vmu-middleware-hooks-declared` | ★ 4/0 ／ 8/0 ✓ |
| ★ `check-docs` ／ ★ `regen` ／ ★ `preflight` | ★ PASS ／ **16/16** ／ PASS ✓ |
| ★ **T1** | ★ 见下（★ 本轮末跑） |

### ★ 轮 6 计划（★ 目标 2 正式开工）

1. ★★ **T1 确认**（★ 本轮末跑的结果决定它是否已绿）
2. ★★★ **目标 2 · K1（周期自驱）**：★ 蓝图 P0-1 —— ★ `scheduler` 有 `every/arm/tick`，★ **但装配没注入 timer、内核不自动 arm**；★ 做法按蓝图：★ 加 `vmu.schedule.autoArm`（★ **默认 false = 零机制**）＋ 内核 start 时 arm/tick ＋ **`status()` 自曝 `armed`** ✓
3. ★★★ **目标 2 · K2（派发一个成员回合）**：★ `vmu.turn` 不在 M2 服务目录 ⇒ ★ 按"**内核加具名能力**"加进去（★ 目录 `kernel/index.js` ＋ `loader.js` 能力表同步）✓
4. ★ **然后**：★ v3 的 P0-2／P0-4（规划模块／方法库模块）才有地基建 ✓

★ **注意**：★ **硬闸退休后，`kernel/turn/index.js`（现约 1170 行）不必为凑行数牺牲清晰度** ✓


### ★★★ 轮 5 收口：T1 **374/376** 的两红（★ 都是 K10 带出来的，★ 且都被门禁正确拦下）

| ★ 红 | ★ 根因 | ★ 处置 |
|---|---|---|
| ★ `audit-vmu-docs` | ★★ **我给 `vmu.middleware` 加了公开方法 `rewriteOf`，★ 而 `docs/03` 的契约表【没登记】** ⇒ ★ 门禁报 *"the module does not expose methods the contract omits [rewriteOf]"* —— ★ **这正是它该做的**（★ 契约卷是"公开面登记处"，★ 多一个未登记的面就是**未声明的接口**）✓ | ★ 在 `docs/03` **两处**补登：★ `:44` 摘要表 ＋ ★ `:78` 详表（★ 详表里写明**三态**与**首个消费者**）⇒ ★ **103/0** ✓ |
| ★ `audit-cross-volume-refs` | ★ 我引 **`docs/19 §7`**，★ **而卷 19 的编号是 `19.1–19.21`，★ 没有 §7** ✓ | ★ 改成 **`§19.12`**（★ "逐钩子 payload 规范表"，★ 那条 `rewrite-result` 契约正在其中）⇒ ★ **1087 条、0 未解析** ✓ |

★ **收口后**：★ `audit-vmu-docs` **103/0**／★ 跨卷 **1087/0**／★ `regen 16/16`／★ `DOC LINT PASS`／★ **`PREFLIGHT PASS`** ✓
★ **T1 未再整跑**（★ 两条红已各自独立复跑证明修好）⇒ ★ **轮 6 开头补一次确认** ✓

---

## 轮 6（2026-10-18）

### ★★★★★★ K1 落地：★ 调度器终于**有驱动了** —— ★ 而缺口比我预想的小得多

★ **测量先行**（★ 这是本轮最关键的一步）：
- ★ `createScheduler` **本来就接受 `timer` 接缝** ✓
- ★ 设置里**早就有** `vmu.schedule.timeSource: 'tick-only' | 'host-timer'`，★ 且 `scheduler.js:100-101` **真的读它**、★ `:471` **真的处理 `host-timer`** ✓
- ★ `arm()` **完整实现了** arm→fire→`tick()`→释放 handle→计数 ✓
- ★★ **而 `grep 'scheduler.arm(' / 'scheduler.tick('` 在全仓【零命中】** ⇒ ★★ **机制全在，★ 就是【没人调它】** ✓

⇒ ★ **后果（★ 用户可见）**：★ ① 声明在 `vmu.schedule.triggers` 的种子**永远不会自己触发**；★ ② **重复项只触发一次就安静**（★ 因为下次触发从不重新 arm）✓
⇒ ★★ **这正是本项目一直在清的那一类**：★ **"机制存在，★ 但没有通往用户的路径"**（★ 与 K10 同族）✓

### ★★ 修法：★ **显式 opt-in 的自驱**（★ 不默认打开）
| ★ 件 | ★ 改动 |
|---|---|
| ★ **`scheduler.js`** | ★ 加 `autoArm({on})`（★ 三态自曝：★ `on:false`⇒`mode:'off'`／★ **无 timer⇒`mode:'tick-only'`** 绝不假装／★ `host-timer` 已声明却无接缝⇒**`VMU_CONTROL_NO_TIMER` 具名拒**，★ **不静默降级**）；★ **fire 路径里重 arm**（★ 自驱环的第二半）；★ `status()` 自曝 **`autoArm`／`autoRearms`** ✓ |
| ★ **`kernel/index.js`** | ★ 构造后按 **`vmu.schedule.autoArm`** 起手 arm；★ **拒绝不被吞**（★ 记 log ＋ ★ `status().seams.scheduleDrive` 自曝）✓ |
| ★ **`settings/schema.js`** | ★ 新键 **`vmu.schedule.autoArm`**（★ **boolean，★ 默认 false ＝ 零机制**）✓ |

★ **为什么默认 false**：★ **arm 一个宿主 timer 是真实的副作用**，★ 而红线 4 要求**默认零机制** ⇒ ★ **一切自驱都必须来自【声明】** ✓
★ **为什么"关掉"不取消待触发项**：★ **停止驱动 ≠ 取消工作**，★ 那是两个决定 ⇒ ★ `autoArm({on:false})` 只停环，★ 释放 handle 要用 `disarm()` ✓
★ **顺带得到一件事**：★ **`vmu.schedule.autoArm` 一加就有读者**（★ 内核读它的字面量）⇒ ★ 设置表把它算作 **wired** ✓

### ★★★ 新测试 `tests/vmu-schedule-autodrive.test.mjs`：**27/0** ✓
★ 七组：★ ① **默认零机制**（★ `autoArm:false`、★ `autoRearms:0`；★ 且 `on:false` 时**待触发项存活**）② **opt-in 真 arm**（★ 恰一个 handle、★ `mode:'armed'`、★ status 自曝）③ **无接缝不假装**（★ `mode:'tick-only'`、★ `timerShape:null`）④ **`host-timer` 已声明却无接缝⇒具名拒** ⑤ **触发真的驱动**（★ `timerFired>=1`、★ **`tickPasses>=1`** ← ★ 这就是从前永不发生的那件事）⑥ **fire 后重 arm**（★ `autoRearms` 增、★ 出现新 handle、★ **第二次也能触发** —— ★ "重复"的定义）⑦ **内核级**（★ 默认 `scheduleAutoArm:false` 且 `scheduleDrive:null`；★ **带触发器种子时构造即 arm**、★ **真经注入 timer 触发**、★ 触发后仍自驱）✓

★★ **两个自我纠正（★ 都记在测试注释里）**：
1. ★★ **我的假 timer 签名错了** —— ★ 我写 `arm(ms, cb)`，★ **真实是 `arm({ at, delayMs, onFire })`**（★ `scheduler.js:191`）⇒ ★ `TypeError: h.cb is not a function` ⇒ ★ **正是 AGENTS.md §7.3「探针报错先假设是自己用错了 API」** ✓
2. ★★ **我内核级那条断言前提错了** —— ★ 我**没声明任何触发器**就断言"内核已 arm"，★ 而**无待触发项时 `armed:false` 是正确的** ⇒ ★ 补上 `vmu.schedule.triggers` 种子后才有意义 ✓

### ★★ 本轮结果
| ★ 项 | ★ 结果 |
|---|---|
| ★ `vmu-schedule-autodrive`（新） | ★ **27 / 0** ✓ |
| ★ `vmu-scheduler`（既有） | ★ **111 / 0** ✓（★ 默认关闭 ⇒ 我的改动对它不可见）|
| ★ `audit-vmu-docs` ／ ★ `audit-silent-keys` ／ ★ RULE E | ★ 103/0 ／ exit 0 ／ **88/0** ✓ |
| ★ `regen` ／ ★ `check-docs` ／ ★ `preflight` | ★ **16/16** ／ PASS ／ PASS ✓ |
| ★ **设置表** | ★ **1233 键（1139 wired，★ 0 undetermined，★ 94 声明未接线）** ✓ |
| ★ **T1** | ★ 见下（★ 本轮末跑）|

### ★ 轮 7 计划

1. ★★ **T1 确认**
2. ★★★ **目标 2 · K2（派发一个成员回合）**：★ **`vmu.turn` 加进 M2 服务目录**（★ 宽义已在消费者审计的 D12 判"写自己运行机制的人显然需要它"）—— ★ 但要**防递归**（★ 中间件在 turn 钩子里再调 turn）与**具名能力**（★ 蓝图建议 `dispatch-work` 类），★ 这两点要在实现时想清 ✓
3. ★★ **然后 v3 的 P0-2（规划/调度环）才有地基** —— ★ K1（周期自驱）＋ K2（派发回合）正是它的两块前置 ✓


### ★★★★ 轮 6 收口：T1 **376/377** 的一红 —— ★ 而它是【一条早就存在的守卫，★ 断言的正是我刚补上的缺口】

★★ **红：`vmu-activity-timers`** —— ★ 它有一条 **F15/F16 集成缺口守卫**，★ 原文逐字：
> ★ *"★ F15/F16 INTEGRATION GAP (named): **NOTHING in the shipped framework (host/tools/entry) calls scheduler.arm()/tick()/disarm()** — the timer discipline is real but has no production driver (the tool face has no scheduler action)"*

⇒ ★★★ **所以它不是"我弄坏了它"，★ 而是"我【修好了它守护的那个缺陷】，★ 于是它必须改口"** ✓
★ **诚实的一步**：★ **不能删掉它**（★ 删掉就等于**把缺口的可见性一起删了**）⇒ ★ **改成"反转 ＋ 收窄"**：
| ★ 断言 | ★ 改后 |
|---|---|
| ★ ① 内核**必须**驱动 | ★ `scheduler.autoArm(` **必须出现**在 `kernel/index.js` ⇒ ★ **删掉驱动就红** |
| ★ ② 工具面**仍**无手动 arm | ★ `tools/` 下**不许**出现 `scheduler.(arm|tick|disarm|cancel|autoArm)(` ⇒ ★ **残余缺口仍具名** |
| ★ ③ 模块不自引 | ★ `scheduler.js` 内**不许**出现 `scheduler.` 句柄（★ 它走 `api.`）✓ |
★ 结果：★ **38/0** ✓（★ 原 35/1）

★★ **而这里还有一个自我造成的假红，★ 值得单记**：★ 旧检查**读未剥注释的 `scheduler.js` 原文**，★ 而**我在 K1 的注释里写了 `scheduler.arm(` 字面量** ⇒ ★ **注释把我自己的测试搞红了** ⇒ ★ **修法不是改注释躲开，★ 而是【所有源码扫描断言都要声明它在扫什么文本】** ⇒ ★ 三条现在都在 **`stripComments` 之后**判 ✓

### ★★★ 结果汇总

| ★ 项 | ★ 结果 |
|---|---|
| ★ `vmu-schedule-autodrive`（新） | ★ **27 / 0** ✓ |
| ★ `vmu-scheduler` | ★ **111 / 0** ✓ |
| ★ `vmu-activity-timers` | ★ **38 / 0** ✓（★ 原 35/1）|
| ★ `audit-vmu-docs` ／ ★ `audit-silent-keys` ／ ★ RULE E | ★ 103/0 ／ exit 0 ／ 88/0 ✓ |
| ★ `regen` ／ ★ `check-docs` ／ ★ `preflight` | ★ 16/16 ／ PASS ／ PASS ✓ |
| ★ **T1（末读）** | ★ **376/377**，★ 唯一红已修并**独立复跑 38/0** ⇒ ★ **下一轮开头整跑确认**（★ 不把独立复跑当 T1 绿）|

---

## ★★★★ 待办登记（★ 创始人 2026-10-18 指示；★ 由他决定何时处理）

### 待办 P1：★ 处理"消费者"误读造成的**错误决策**（★ 创始人插话要求）

★ **背景**：★ 创始人指出"消费者"一词有歧义（★ 实际指**使用者可能的需求**，★ 不是仓内引用）⇒ ★ 经审计判定 **(C) 歧义真实存在、★ 且已影响过决策** ⇒ ★ **已在 `docs/01-philosophy.md` §1.4.1–§1.4.4 纠正定义**，★ 并记 `docs/acceptance/phase6-consumer-semantics-audit.md` ✓
★ **本待办的内容**：★ **把"当时被否定、★ 但在纠偏后的判据下其实是【用户可能会用】"的那些对象/功能，★ 逐条筛出来并处置**（★ 恢复／接线／★ 保留降级但具名登记"未接线＋怎么用"）✓
★ **状态**：★★ **清单已产出（191 行、★ W-01…W-08）** —— ★ `consumer-audit` 已交付 **`docs/acceptance/phase6-consumer-wrong-decisions.md`**（★ W-01 起的翻案清单，★ 每条带**当时裁决原文＋`文件:行`**、★ **具体使用者场景**、★ **当前状态（已恢复/仍未恢复/部分）**、★ **建议处置**、★ **置信度**）✓
★ **★ 等你裁定**：★ 清单产出后**不自动翻案** —— ★ 由你决定何时处理、★ 以及拿不准的条目（★ 代理会单列"需 Lead 裁定"）如何处置 ✓

### 待办 P2：★ 为 v5r pack 补齐原版 v5r 守卫的对应物（★ 早前登记，★ 仍未做）
★ 四个空白：★ ① 类型字段驱动的机制 ② 覆盖必被记录 ③ 广播携带规则引用 ④ 授权到期/召回；★ 另加：★ SLV 四类表 ＋ 硬预算模板、★ §5 四条兼容断言 ✓

### ★★★ P1 清单已交付（`docs/acceptance/phase6-consumer-wrong-decisions.md`，191 行）

| ★ 编号 | ★ 被否定的东西 | ★ 当前状态 |
|---|---|---|
| ★ **W-01** | `vibe_vmu_report` 报告原语＋工具面 | ★ **已恢复 ✓**（`kernel/report.js` 存在） |
| ★ **W-02** | 13 个零足迹键（a11y7／sovereignty3／supplychain3） | ★ **未实现 ✗（但也未被删）** |
| ★ **W-03** | 样本台账／链式保管（旧名 `biospecimen`） | ★ **已恢复 ✓**（现名 `custody`＋`anonymity`） |
| ★ **W-04** | 仪器台账（旧名 `instruments`） | ★ **已恢复 ✓**（现名 `resource`） |
| ★ **W-05** | `work`／`index`／`members`／`tasks` 键面 | ★ **已接线（部分）✓** |
| ★ **W-06** | M2 目录缺 `vmu.turn`／store／scheduler／control… | ★ **部分**：**K1 已落地 ✓**／**K2 已排期**／其余无排期 |
| ★ **W-07** | 关系与反链／知识图谱面（13 键） | ★ **仍未恢复 ✗** |
| ★ **W-08** | `hr`／`course` 的降级标注 | ★ **已撤销、保留 ✓** |

★★ **需你裁定的 6 项**（代理已单列，★ 我不替你定）：
1. ★ **W-06 其余 6 个服务**（store／scheduler／control／work／idempotency／lean）：逐个接线 → 还是成组具名登记？
2. ★ **W-02**：只补“未接线＋怎么用”登记，还是排最便宜的实现？
3. ★ **W-07**：恢复 planned 声明，还是只写“怎么用现有面做到”？
4. ★ **W-05**：是否允许回注 `28:181`（当时的 `wired=0 ⇒ D 类`）？
5. ★ **四处过期／冲突句回写**（`03:193`、`23:180`、`23:96`、`23:143`）——★ `03:193` 我本轮**已修**（它自相矛盾），★ **其余三处等你**；
6. ★ **双名对照**（`biospecimen`=`custody`＋`anonymity`；`instruments`=`resource`）是否进 `23 §0b.3` 对照表？

★ **代理另列了 12 条“不该翻案”**（★ 4 个宿主钩子名／v3-core 三键／设置表三档／bus `kind:'plugin'`／`settingsConflicts`／`CHARTER_LEADER_VARIANTS`／`rewrite-result`／货币税务／`clinical`／会计科目树 O6／`vmu.dissemination`／`23:175`），★ **理由逐条**，★ 我复核后认为该结论成立 ✓

---

## 轮 7（2026-10-18）

### ★★★★★ K2 落地：★ `vmu.turn` 对**已声明模块**可达 —— ★ 且递归被【具名拒】而不是被静默允许

★ **测量先行，★ 又一次让改动变小**：
- ★★ **`vmu.turn` 早就在 M4 注册表里【已发布】**（★ `kernel/index.js` 的 `registry.register('vmu.turn', …)`）
- ★★ **而它【不在 M2 能力门控目录】里** ⇒ ★ **pack 可以声明 `requires:['vmu.turn']` 并被校验，★ 而模块根本调不到它** ✓
⇒ ★★ **又是"已声明、★ 但没有通往用户的路径"** —— ★ 消费者审计的 **D12／W-06** 早已判它是错的 ✓
⇒ ★ **而它正是 v3 规划/调度环的卡点**：★ **一个想"唤醒某个成员"的声明式策略，★ 手里没有那个动词** ✓

### ★★ 修法：★ 一行接线 ＋ **同一次改动里加的重入守卫**
★ 目录里补 **`'vmu.turn': turn`** ✓
★ **而目录在 loader 的 `trigger-workflow` 能力之后** ⇒ ★ **跑在 `turn/*` 钩子里的模块现在可以【在回合内部】再调 `run()`** ⇒ ★ **会嵌套** ✓
★★ **为什么不禁止、也不静默**：★ 本循环持有**单回合状态**（★ `lastAttribution`／★ `lastReplyForMember`／★ **每成员通告队列**），★ **嵌套会在外层回合脚下覆盖它们** ⇒ ★ **框架不拿走正当用法（★ 从声明的策略里起一个回合正是 K2 的全部意义），★ 而是把【重叠】具名拒掉**：
```js
let turnInFlight = false
const run = async (spec) => {
  if (turnInFlight) throw refuse('VMU_TURN_REENTRANT', 'a turn is already in progress, so this run() would nest inside it', '…单回合状态…；等在途回合结算后再调 —— drive()/step() 已按顺序调用')
  turnInFlight = true
  try { return await runOne(spec) } finally { turnInFlight = false }
}
```
★ **`try/finally`**：★ **抛异常的回合也不会把循环卡死** ✓
★ **顺序调用完全不受影响**：★ `drive()`／`step()` **本来就循环调 `run()`**，★ 一次一个，★ 顺利通过 ✓

### ★★★ 新测试 `tests/vmu-turn-dispatch-k2.test.mjs`：**10/0** ✓
★ 四组：★ ① **在途时第二次 `run()` 具名拒**（★ `VMU_TURN_REENTRANT`，★ **且 hint 说出"单回合状态"这个理由** —— ★ 读者不用猜）★ ② **守卫会解除**（★ 在途回合结算后**紧接着**的 `run()` 被接受 —— ★ "会把循环卡死的守卫比 bug 更坏"）★ ③ **顺序 5 回合全成功**（★ 只拒重叠、★ 不拒重复）★ ④ **接线**（★ 目录真映射 `'vmu.turn': turn`、★ **两扇门必须一致（声明 AND 可达）**、★ 拒绝码在循环内声明、★ **`finally` 释放**）✓

★★ **两个自我纠正（★ 都在注释里记着）**：
1. ★ 我的假回执先是**纯文本** ⇒ ★ `VMU_TURN_NO_FENCE` ⇒ ★ **回合回执必须是【一个围栏 JSON 对象】**（★ docs/26 §3）✓
2. ★ 我用 `node` 脚本替换那串时**插入了真实换行**（★ 单引号字符串不能跨行）⇒ ★ 语法错误 ⇒ ★ 改用**转义序列** ✓

### ★★★ 门禁抓到的新码登记（★ 又一次证明它在守）
★ **`audit-vmu-docs` 具名报出**：★ *"every framework `VMU_*` code the CODE can throw is registered in 03-§8 … `[VMU_TURN_REENTRANT (kernel/turn/index.js)]`"* ✓
⇒ ★ 在 `docs/03 §8` 补登该码（★ 含"单回合状态"理由 ＋ ★ "等在途回合结算"的处置）⇒ **103/0** ✓

### ★★ 结果
| ★ 项 | ★ 结果 |
|---|---|
| ★ `vmu-turn-dispatch-k2`（新） | ★ **10 / 0** ✓ |
| ★ `vmu-turn` ／ ★ `vmu-turn-activation` ／ ★ `vmu-turn-contracts` | ★ 148/0 ／ 27/0 ／ 12/0 ✓ |
| ★ `vmu-loader` ／ ★ `vmu-bus` | ★ 28/0 ／ 44/0 ✓ |
| ★ `audit-vmu-docs` ／ ★ service-calls ／ ★ face-actions ／ ★ silent-keys | ★ 103/0 ／ ✅ ／ ✅ ／ ✅ ✓ |
| ★ `regen` ／ ★ `check-docs` ／ ★ `preflight` | ★ 16/16 ／ PASS ／ PASS ✓ |
| ★ **T1** | ★★★ **378 / 378，★ 0 红**（suites 316 · probes 62，528s）✓ —— ★本阶段第一次【整跑全绿】 |

### ★ 轮 8 计划
1. ★★ **T1 确认**
2. ★★★ **回目标 2 的 P0**：★ **K1（周期自驱）＋ K2（派发回合）两块前置已齐** ⇒ ★ **可以开 v3 的 P0-2（规划/调度环）**：★ 按蓝图把 **tick 驱动的规划步 → 选成员 → 派发回合** 串起来，★ 且**全部由 pack 声明**（★ 内核只给能力）✓
3. ★ 视需要把 **K1／K2 的结论补进 `docs/03`／`docs/05`**（★ 现在只在代码注释、契约行与本账里）

---

## 轮 8（2026-10-18）

### ★★★★ 首要发现：★ 目标 2 的地图**被自己弄坏了**（★ 而这一轮先把它变诚实）

★ 我轮 1 写的 **`docs/acceptance/phase6-v3-replication-blueprint.md`** 中文**大部分是乱码**：★ `发明上报闭环` 变成 `鍙戞槑涓婃姤闂幆` ✓
★ **成因**：★ **轮 1 用 PowerShell 路径写中文** ⇒ **UTF-8 字节被按控制台代码页解码**再存回 UTF-8 ✓

★ **我做了取证（★ 不是猜测）**：
| ★ 步骤 | ★ 结果 |
|---|---|
| ★ 严格 GBK 反解 | ★ 只救回 **4 行**（★ 其余因**丢失字节**在严格 `utf-8` 解码时抛错）|
| ★ 宽容解码 ＋ 自建 GBK 反查表 | ★ "救回 54 行"，★ **但 244／245／250 产出【像中文的胡话】** ⇒ ★ 它们含**私用区／注音／`€`**，★ **走了另一条字节路径**，★ 反解无效 ✓ |
| ★ 结论 | ★★ **233 行不可恢复** ⇒ ★ **这份蓝图基本被毁** ✓ |

★★ **处置（★ 按本仓最强的那条文化：★ "不要把没读到写成没问题"）**：
1. ★ **救回能救的** ✓
2. ★★ **其余每一行加 `⟪编码损坏⟫` 前缀**（★ **234 处标记**）—— ★ **宁可见，★ 不可静默** ✓
3. ★★ **卷首写明事故、成因、可恢复/不可恢复的界线、★ 并指向替代文档** ✓
4. ★★ **教训写进卷首**：★ **中文文档一律用 `write`／`edit` 写，★ 绝走 PowerShell `Set-Content`／`Out-File`** ✓

### ★★★★★ 替代：**干净的 P0 施工清单已交付**（★ 派 `v3-inventory` 重做）

★ **`docs/acceptance/phase6-v3-p0-build-checklist.md`（222 行）** ✓
| ★ 节 | ★ 内容 |
|---|---|
| ★ §0 | ★ **现状前置核对**（★ 每条回代码核过）|
| ★ §1 | ★ **P0 十条施工卡**（★ 每条：★ 目标／★ 落点文件／★ v3 侧行号＋函数／★ 机制三态／★ 设置键／★ **可写成 `ok(...)` 的判据**／★ 依赖）|
| ★ §2 | ★ **施工顺序**（★ 已按 **K10／K1／K2 已落地**的现状重排）|
| ★ §3 | ★★ **目录骨架结论：★ 新建 `packs/v3/`，★ `packs/v3-core/` 原样保留、★ 两者互斥装载（部署二选一）** ✓ |
| ★ §4 | ★ 与 `v3-core` 的**差集**（★ 逐条比对）|
| ★ §5 | ★ 未核到 ＋ **"最容易做错的一条"** 提醒 |

### ★★ 本轮结果
| ★ 项 | ★ 结果 |
|---|---|
| ★ `check-docs` ／ ★ `regen` ／ ★ `preflight` | ★ PASS ／ **16/16** ／ PASS ✓ |
| ★ 蓝图修复 | ★ **4 行救回 ＋ 234 处显式标记 ＋ 卷首事故说明** ✓ |
| ★ P0 施工清单 | ★ **222 行，十条卡齐** ✓ |

### ★ 轮 9 计划（★ 目标 2 正式开工）
1. ★★★ **读清单 §2 的施工顺序，开工 P0 第一块**（★ 按它给的顺序，★ 不自己拍）
2. ★★ **建 `packs/v3/` 骨架**（★ §3 给的文件清单）＋ **`index.js` 的 `PACK` 声明**
3. ★★ **每条 P0 都写断言**（★ 清单 §1 已给"能写成 `ok(...)`"的判据，★ 直接落成测试）✓
