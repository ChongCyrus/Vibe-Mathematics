# Round 24 · task-135 · 解 `hits:2` vs 报告文本 `tool-results=5`

**判定：`(i)` 两数**自洽** —— 它们是**同一个量在两个不同时刻**的采样**：`hits` 是**会话内 call #3（`vibe_vmu_status`）当时**读到的（此时**只有 2 次工具调用完成**），`tool-results=5` 是**回合边界**渲染的（此时 5 次全部完成）。**既不是 `hits` 少算，也不是观测多算**（`(ii)`／`(iii)` 均**不成立**）。★ 附：Lead 提的"最可能解释"（**一次事件带 N 条 result**）**被本会话的日志直接否证**（证据见 §C）。

- **纪律**：未跑全量（T0/T1 归 Lead）／未 `regen-all`／**未 git**；临时文件全在 `D:\_tmp\v24`；**`kernel/bus.js` 与 `artifact-counter.js` 全程只读**（本任务**未改任何代码**）。
- **核验口径（引用前先落一行）**：本报告读数取自下列**已落盘证据**（各带 sha256），并全部在 **2026-10-15 18:02:29** 前后的同一次复算会话中读取。

---

## A · `hits` 的语义（`kernel/bus.js`）—— 每次 **handler 返回了一个 decision** 计一次；且它是**快照计数器**

| 位置 | 事实 |
|---|---|
| `bus.js:478` | `const hits = new Map() // id -> times it returned a decision` —— 注释逐字：**"返回过 decision 的次数"** |
| `bus.js:666` | `decision = await withTimeout(entry.handler, { hook, payload, ctx, dryRun, traceId, setting })` —— 每个事件对该条目调 handler **一次** |
| `bus.js:681-684` | `if (decision === undefined \|\| decision === null) { failures.set(entry.id, 0); continue }` —— **返回 `undefined`/`null` 不计 hit**（handler 抛错走 `:667-680` 的 failure 分支，也不计 hit） |
| `bus.js:696` | `hits.set(entry.id, (hits.get(entry.id) \|\| 0) + 1)` —— **就在"返回了非空 decision 且过了能力校验"之后** |
| `bus.js:728` | `hits: hits.get(e.id) \|\| 0` —— `status()` 里原样曝出 ⇒ **读者拿到的是"到这条 `status()` 被调用的那一刻为止"的计数**（**没有任何时间戳/总量**） |

⇒ `hits` **不是**"事件到达次数"、**不是**"成功次数"，而是**"该条目返回过 decision 的次数"**；**计数与读取之间的时间差是它语义的一部分**（这正是本任务的关键）。
**本模块命中这条语义**：我的 handler 每条路径都 `return` 一个对象（`artifact-counter.js:79/86/102/107/113` 五条返回路径，**没有一条返回 `undefined`/`null`**）⇒ 每次被 dispatch **必计 +1**，故 `hits` 与"事件到达次数"在本例中**相等**。

## B · `artifact-counter.js` 的观测语义 —— **每次事件恰 1 次 `observe`，`value` 恒 1**

| 位置 | 事实 |
|---|---|
| `artifact-counter.js:48` | 政策表：`{ indicator:'tool-results', on:['tools/result'], count: 1, … }` |
| `:71` `const counter = (indicator) => async (flat = {}) => {` ／ `:73` `const row = COUNTER_POLICY.find(...)` | 每个钩子**一个** handler；**没有循环**、**不读 payload 的条数/计数字段** |
| `:90-92` | `metrics.observe({ name: indicator, value: Number(row.count) \|\| 1, … })` —— **一次调用只写一次** `observe`，`value = 1`（`row.count` 恒为 `1`） |
| `:100` | 成功路径 `state.observed += 1` ⇒ 模块自计数与指标面同步 |

⇒ 对该事件：**1 事件 = 1 观测、`value=1`** ⇒ `metricValues()`（`sum`）**等于事件数**（`kernel/index.js:711-713` 的注释逐字说明 `sum` 就是"发生了几次"）。
★ **不靠"读码"也能钉死**（`vmu-verify2` 明确说它只核了我的结论、没逐行核这段码）：一个 `sum` 只能钉住**乘积**，所以我把三个因子分开量——`node D:\_tmp\v24\verify-observe-factors.mjs` ⇒ **exit=0**：
```
at rest            : rows=0  sum=(no key)
after ONE event    : rows=1   items[0].value=1   kind='read'   by='v5r.artifact-counter'
                     labels={"hook":"tools/result","tool":"probe-tool"}
after FIVE events  : rows=5   sum=5   every row value=1  (非空前置 rows=5)
```
⇒ **observes/event=1**、**value=1**、events=5 ⇒ sum=5（读的是 `kernel.metrics.series({name})` 的**原始行**，不是求和）。这使 B 的结论**任何人一条命令可复算**，不必署名于我。
★ **`vmu-verify2` 用同一思路独立复现**（它的探针 `D:\_tmp\v24\verify-observe-rows.mjs`，settle 250 ms）：`at rest rows=0／sum 无键`；`after ONE event rows=1, values=[1], kind='read', by='v5r.artifact-counter'`；`after FIVE rows=5, values=[1,1,1,1,1], sum=5` ⇒ **两因子分开钉死＝两人各自量到**。它同时**自我订正**：`kernel.metrics.count(...)` **不存在**，原始行的正解是 **`series({name})`**（我复核：`metrics.js` 的方法面是 `observe:202／snapshot:265／series:268／explain:284／kpi:306…`，**无 `count`**）✓。
★ **因子可迁移（对两个指标都成立，不只对被量的那一个）**：两条政策行**共用同一个 handler 工厂** —— `artifact-counter.js:119` `for (const row of COUNTER_POLICY) for (const hook of row.on) hooks[hook] = counter(row.indicator)`，工厂在 `:71`、`observe` 在 `:90-92` ⇒ `tool-results` 与 `settled-jobs` **走同一条路径**，故"1 事件 = 1 观测、`value=1`"对**两者同时**成立。⇒ 我早先报告里"两次 `math/job-settled` ⇒ `settled-jobs === 2`"**不是裸乘积主张**：它**继承**了这里量到的因子（＝把本轮新纪律**应用回我自己的旧读数**）。

## C · `tools/result` 的 payload 形状 —— **一次工具调用 = 一条 `tools/result` 事件**（Lead 的"一次带 N 条"被**否证**）

**用本会话的日志本体证明**（解码后的 `D:\_tmp\v24\armE-session.jsonl`，22 帧／44 事件）：
```
tool/call   #18 vibe_vmu_report      →  tool/result #19
tool/call   #23 vibe_vmu_set         →  tool/result #24
tool/call   #28 vibe_vmu_status      →  tool/result #29     ← hits:2 就在这里
tool/call   #33 pwsh                 →  tool/result #34
tool/call   #38 pwsh                 →  tool/result #39
```
**5 次 call ↔ 5 条 result，按序 1:1**（`r131E-session.log` 的 `"toolCalls":5` 与 `"tools":["vibe_vmu_report","vibe_vmu_set","vibe_vmu_status","pwsh","pwsh"]` 逐字一致）。桥侧也只有一个发射点：`host-hooks.js:153` **每次监听器调用恰好 `kernel.bus.emit(hook, payload, {bridge:true})` 一次**。
★ **口径**：本会话里**不存在**"一次事件带多条 result"（**否证**，不是"未观测到"）；**没有多结果聚合的代码**（`artifact-counter.js:71-73` 无循环、不读 payload 计数）⇒ 即使将来某宿主一次带多条，本模块**也只会在**那次事件上写 **1** 个观测（那时 `hits` 与观测**仍同步**，因为二者都是"每次 dispatch 一次"）。

## D · 判定：`(i)` 自洽 —— 两条独立证据链

**证据链 1（`hits:2` 的**读取时刻**＝会话内 call #3）**：该 JSON **只出现一次**，在 **event #29**（＝ call #3 `vibe_vmu_status` 的 `tool/result`）里（下表为**去 JSON 转义后**的逐字内容，原文此处是 `\"hits\":2` 形态）：
```
{"id":"v5r.artifact-counter::tools/result","kind":"module","order":320,"on":["tools/result"],
 "failure":"open","capabilities":["trigger-workflow","record"],"scope":null,"source":"session",
 "enabled":true,"disabledReason":null,"hits":2,"consecutiveFailures":0}
```
而 **call #3 的执行体内**（它自己的 result 还没产生前），**只完成了 call #1、#2 两条 `tools/result`**（#19、#24）⇒ `hits = 2` **正确**。后两次 `pwsh`（#33/#38）**发生在这条 `status` 之后**。

**证据链 2（`tool-results=5` 的**读取时刻**＝回合边界）**：`D:\_tmp\r131E-boot.log` 的 sink 行逐字：
```
line2: [vmu-report-sink] {"name":"turn-end-duty", …, "text":"【所办汇报】turn-end-duty 在 turn-end 自动开火"}
line3: [vmu-report-sink] {"name":"tool-results-met", …, "text":"【阈值·已达】tool-results=5 ≥ 1"}
```
两条 sink 行**同一批**出现在回合末；而阈值的取值来自边界那次读取：`vibe-math-vmu.js:656-657` **`const metricsOf = kernel.metricValues()` → `kernel.report.tick({ event:'turn-end', metrics: metricsOf })`**（挂在 `agent/turn-stopping`，`:660`）⇒ 此刻 **5 条 `tools/result` 已全部发生** ⇒ `tool-results = 5×1 = 5` **正确**。

**证据链 3（可复算读数）**：`node D:\_tmp\v24\repro-hits-vs-observations.mjs` ⇒ **exit=0**，`mismatches=0`：
```
 k | the 5 tool calls happen one by one (the HOST calls the listener) | hits | metricValues()[tool-results]
  2 | read here = the arm-E `status` call #3 (2 calls done)            |    2 | 2   (1:1 ✓)
  5 | read here = the turn boundary (all 5 done)                       |    5 | 5   (1:1 ✓)
```
⇒ 两个计数器**逐 k 同步推进**（真装配：`entry.apply` ＋ `packs:['v5r']` ＋ `indicators:['tool-results','settled-jobs']`，只调宿主监听器）。⇒ `(hits, metric)` 的 `(2,5)` **就是同一量在两个时刻的采样**；`(ii)` 若成立必然出现 `hits < 观测` 的**同一时刻**读数，而它在 k=1..5 **一次都没有出现**。

**★ "我没找到"与"不存在"分开说（逐份报，不合并）**：`hits` 的三份候选 artifact 分别量到 —— `D:\_tmp\r131E-dump\transcript.jsonl` **0 行命中**（它是**驱动侧**日志：只有 rpc/poll/step 行，**根本不含工具结果**）、`D:\_tmp\r131E-session.log` **0 行命中**（同为驱动侧）、**解码后的 `D:\_tmp\v24\armE-session.jsonl` 命中 1 行（event #29）** ⇒ 会话内容里 `hits` **只此一处**（这是"读到的一处"，不是"推断的一处"）。`【阈值·已达】…` 文本**不在这三份里** —— 不是缺失，而是它属于**宿主 stdout 的 sink**（在 `D:\_tmp\r131E-boot.log`）：两数**本来就分属两份 artifact、两个时刻**。搜索范围＝上述三份 ＋ boot.log；**未**搜全仓（无必要：`hits`/报告文本都是运行时产物，不是源码字符串）。

## E · 按 `(i)`：为什么"不同才是对的"＋建议并入 docs（**我不改 docs**，见下）

**一句话口径**：**`hits` 是"到目前为止该条目返回过多少次 decision"的**快照**（`bus.js:478/:696`，随 `status()` 的调用时刻而变），`tool-results` 是**边界那一刻**对全部观测的求和（`vibe-math-vmu.js:656`＋`kernel/index.js:711-713`）；**同一会话里先后读它们，本来就应当得到两个不同的数**——除非两次读取**在同一时刻**，那时它们**相等**（§D 的 k=1..5 实测）。

**建议落到 docs（可直接粘贴，方法名一律调用形）**
> **`hits` 与指标和不是同一个量，也不在同一时刻**：`kernel/bus.js` 给每个总线条目记 `hits`＝**"该条目返回过 decision 的次数"**（`bus.js:478`：`// id -> times it returned a decision`；`:696` 在"返回非空且过能力校验"后 +1；`status()` 里原样曝出）⇒ 它是**快照**，读它的人**必须同时记下读取时刻**。而报告模板里的 `{{ metric:<名> }}` 取的是**那次投递时刻**的 `kernel.metricValues()`（边界：`vibe-math-vmu.js:656` 的 `kernel.report.tick({ event:'turn-end', metrics })`）⇒ **两者可以合法地不等**：例 `hits=2`（会话内第 3 次工具调用时读）vs `tool-results=5`（回合末读）**完全自洽**；**同一时刻**读则相等（实测 k=1..5 逐 k 同步）。★ 判据：**要比较两个数，先证明它们在同一时刻读**。
- **谁落**：`docs/21`（可观测性）或 `docs/05`（中间件）——**两卷都不在我 task-135 写范围**（本任务写范围只有 `kernel/bus.js`(只读)／`artifact-counter.js`(只读)／本报告）⇒ **我不动**，已把上面文本交 Lead／其 owner。

## 附 · 证据与指纹（绑定到字节）

```
D:\_tmp\r131E-dump\transcript.jsonl                sha256[0:16]=50652E30CE085816
D:\_tmp\r131E-session.log                          sha256[0:16]=73ECBA8E8FC8A17A
D:\_tmp\r18-home\sessions\…\session-6ca9fefd-….zstd sha256[0:16]=09D1D43DBEFF28C6   （22 帧 → 214572 B / 44 事件）
D:\_tmp\v24\armE-session.jsonl                     （解码产物；本报告 §C/§D 的逐字引文出自它）
D:\_tmp\r131E-boot.log                             sha256[0:16]=B50782CD9BBEB0E1   （两条 sink 行）
node D:\_tmp\v24\repro-hits-vs-observations.mjs    → mismatches=0, exit=0        （两数逐 k 同步）
node D:\_tmp\v24\verify-observe-factors.mjs        → rows=1/value=1/rows=5/sum=5, exit=0   （B 的三因子分开钉住）
```

## F · 独立复核与入册（`vmu-verify2`，2026-10-15）

- **它自己解码同一份 zstd**（sha `09D1D43DBEFF28C6`，44 events，**与我逐字相同**）：5 calls ↔ 5 results 1:1；`"hits":2` **只在 #29 出现一次**；并**独立算出**"该行渲染时已完成的结果＝2（calls 3 / results 2）"⇒ **快照语义在事件序上直接可算**，**Lead 的"一次带 N 条"被否证**。
- **它逐行核了 `bus.js`**（`:478/:666/:681/:696/:728`）与**我的五个 handler 出口**（`:79/86/102/107/113` 全返回对象）；★ 它特意把 `:58`（`indicatorFor` 内部 helper 的 `row ? row.indicator : null`）**与 handler 出口分开看**——**这个读法对**：`:58` 不是出口，我的 §A 引的五个行号也不含它。
- **它没逐行核的是 §B 的码段**（`:48/:71/:73/:90-92`）并把结论**署名于我** ⇒ 我已用 `verify-observe-factors.mjs` 把三因子**分开**量出（见 §B 末），使该结论**一条命令任何人可复算**，不再需要署名。
- **已入册**：`_handoff/vmu/04-parity-matrix.md` **§9.30.8**（1220→1241 行，sha256[0:16]=`AD861B329EA6BA99`）把本条从 v16 §9.30.2 的"**原样待解**"**改判为"两数自洽（两人独立）"**，并保留**误导形态**（两数分属两份 artifact，并排比就会以为"对不上"）；同时新增纪律第 5 件 **「同刻同源」**：比较两个读数前，先证明**同一时刻且同一 artifact**（与既有 4 件并列：payload 哈希／解码帧完整性／`await` 指纹／装载 settle）。
- **第二次入册（因式分解）**：**§9.30.9**（1241→1252 行，sha256[0:16]=`0B25C439882EDF7D`）—— **观测的因式分解：`sum` 只钉乘积，原始行才分开钉因**；★ 同一个 `sum=5` 既可能"5 事件×1×1"也可能"1 事件×1×5"，**光看 `sum` 分不开**。纪律（原文口径）：**凡结论建立在某汇总值上，先问它钉的是乘积还是因子；乘积型汇总要用原始行分解开**（否则两个不同机制会给出同一读数）。它同时记下自己的订正：`metrics.count(...)` **不存在** ⇒ 原始行用 **`series({name})`**（我已在 §B 复核：方法面确无 `count`）✓。★ 这条纪律**已应用回我自己的旧读数**（§B 末："共享工厂 ⇒ 因子可迁移到 `settled-jobs`"）。
- ★ 我**未**参与该矩阵的写入（不在我写范围），仅在此**引用并确认口径**；`docs/21`／`docs/05` 的口径文本仍**待 Lead 指派 owner 落地**（§E）。
**未做**：未改任何代码（`(i)` 无需修）；未把结论写进 docs（不在写范围）；未声称任何**新**真机结论（本轮全部读数来自 `vmu-assistant2` 已落盘的 arm E artifact ＋ 我自己的 in-process 复算）。
