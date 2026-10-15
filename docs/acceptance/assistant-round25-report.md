# Round 25 · `task-139`：`hits` 快照口径已落 `docs/21 §20.6` ＋ `docs/05`（含**改前/改后哈希**与逐条自核）

> 负责人：`vmu-assistant2`｜交付：`docs/21-observability-and-operations.md`（新增 **§20.6**）、`docs/05-middleware.md`（R20 那段之后新增 **R25 补**）、本报告。
> 硬约束遵守：**不跑全量**（T0/T1 归 Lead）／**不 `regen-all`**／**不 git**（只读 `git show` 取改前哈希）／**未改代码·测试**／**未复制凭据**（本轮无需）。
> ★ **两人独立结案**：`vmu-comms2` 备文本、**我落两卷**（这两卷不在它的写范围）；下列每条数字**我都独立复算过**，不转述。

---

## 0. 结论（三句）

1. **要落的三条口径已进两卷**：`hits` 是**快照**（"返回过 decision 的次数"，`kernel/bus.js:474`，**无时刻戳**）／`{{ metric:… }}` 取**投递时刻**的 `kernel.metricValues()`（`vibe-math-vmu.js:656-657`）／★ **两者可以合法不等，比较前必须证明"同一时刻且同一 artifact"**（本轮新纪律「**同刻同源**」）。
2. **实例与复算按原样落**：`hits=2`（会话内第 3 次调用读）vs `tool-results=5`（回合边界读）；**我独立复算**＝**22 zstd 帧 → 44 events**、**5 次 `tool/call` ↔ 5 条 `tool/result` 按序 1:1**、**k=5 时两数相等**。
3. **"一次 `tools/result` 带多条 result"这条假设已否证**（若成立，result 条数会**少于**调用数）—— 文档里写成**已被否证的假设**，**没有**写成"计数没错"。

---

## 1. ★ 引用前先落一行核验（三条代码事实，原样）

| # | 事实 | 我读到的原文 |
|---|---|---|
| ① | **`hits` 的语义** | `kernel/bus.js:474`：`const hits = new Map() // id -> times it returned a decision` ⇒ **"返回过 decision 的次数"**，是**运行计数器**，**读数不带时刻戳** |
| ② | **边界交递** | `vibe-math-vmu.js:656-657`：`const metricsOf = kernel && typeof kernel.metricValues === 'function' ? kernel.metricValues() : null` → `kernel.report.tick({ at: Date.now(), event: 'turn-end', metrics: metricsOf })` ⇒ **`{{ metric:… }}` 取"投递那一刻"的值** |
| ③ | **计数者每事件恰 1 次观测** | `packs/v5r/middleware/artifact-counter.js:90-96`：`metrics.observe({ name: indicator, value: Number(row.count) \|\| 1, by, kind:'read', source:'middleware', labels:{hook, tool}, at })`；政策行 `count: 1`（`:48-49`）⇒ **每事件 1 条、值 1** |

## 2. ★ 我自己的复算（会话 `session-6ca9fefd-4b10-4e3b-a795-32c70ff2a5ae`；脚本 `D:\_tmp\r139-recount.mjs`）
```
zstd frames = 22 | decoded events = 44
L18 seq=16 call   vibe_vmu_report
L19 seq=17 result  (965 chars)
L23 seq=21 call   vibe_vmu_set
L24 seq=22 result  (350 chars)
L28 seq=26 call   vibe_vmu_status
L29 seq=27 result  (49930 chars)   * contains "hits":2
L33 seq=31 call   pwsh
L34 seq=32 result  (405 chars)
L38 seq=36 call   pwsh
L39 seq=37 result  (122 chars)
tool/call = 5 | tool/result = 5 | same count = true
the result carrying "hits" is #6 in the sequence; tool/results completed BEFORE it = 2  => snapshot hits = 2
the report text "tool-results=5" is rendered at the turn boundary (after ALL 5 results)
k=1..5 同刻：第 k 条 result 完成时 hits=k；边界读到的是总数 5 ⇒ k=5 时两者相等
```
⇒ **`hits:2` 与 `tool-results=5` 不是缺陷，是同一个量在两个时刻的采样**；且**在同一时刻同源时必然相等**（1:1 已实测）。

## 3. 动了哪两卷（★ 改前/改后哈希，绑定到字节）
| 卷 | 改前（＝ HEAD `cfbd2c7` 的字节；用 `git show HEAD:<path>` 二进制取） | 改后（工作树） | 改动 |
|---|---|---|---|
| `docs/21-observability-and-operations.md` | sha256 **`a66e4571d0e6fc9a`**（51070 B） | sha256 **`23462A76FD6CEC71`**（53197 B） | 新增 **§20.6「★ `hits` 是快照，不是"同一时刻的量"」**：两条读数的来源与时刻、纪律「同刻同源」、本轮实例、k=1..5 复算、**已否证的假设**＋计数者 `count:1` |
| `docs/05-middleware.md` | sha256 **`c6e360ba8297cc90`**（58069 B） | sha256 **`A8F3D38087192C05`**（59237 B） | 在 R20 那段之后新增 **「★★ R25 补：`hits` 是快照 —— 别拿它跟指标值直接比」**（同刻同源 ＋ 实例 ＋ 交叉指向 `21-§20.6`） |

### 3.1 ★ 动前先核在飞写者（按纪律做，且**用内容而不是 mtime**判）
- `git status --porcelain` 对这两卷**无输出** ∧ HEAD ＝ `cfbd2c7` ⇒ 改前树是**干净提交态**。
- ★ **内容核验**：HEAD 里两卷的哈希恰好等于**我先前自己落笔时的哈希**（`docs/21` `a66e4571…`＝我 R20/R21 的 §20 版本；`docs/05` `c6e360ba…`＝我的 R20 那段）⇒ **没有别的写者留下内容差异**。
- ⚠ **一处要记的观察**：`docs/05` 的 **mtime 是 18:03:15**（晚于我 R20 落笔），但 **HEAD 内容与我那版逐字节相同** ⇒ **mtime 不可作为"内容被改"的判据**（这正是本仓"引用前先落一行／跑的是哪个字节"的同一族教训：**看内容哈希，不看时间**）。

## 4. 门禁读数（★ 2026-10-15 18:15:34 同一次运行，绑定到上面的改后哈希）
| 门 | 读数 |
|---|---|
| `scripts/check-docs.mjs` | **PASS** |
| `tests/audit-doc-index.test.mjs` | **5 / 0** |
| `tests/audit-vmu-docs.test.mjs` | **99 / 0** |
| `tests/audit-doc-vs-code-tables.test.mjs` | **17 / 0** |
| `tests/audit-claim-traceability.test.mjs` | **5 / 0** |
| `tests/vmu-planned-settings.test.mjs` | **ALL GREEN（planned=111, docs=28, 39/0）** |
★ **调用形纪律**：新增文字里服务方法一律写调用形（`api.services.get('vmu.metrics').observe({…})`、`kernel.metricValues()`、`report.tick({…})`），**未裸写三段点号名**。

## 5. 没做的事 / 遗留（都具名）
- **未跑全量／未 `regen-all`／未 git 写／未改代码·测试**；本轮**未复制凭据**（无需要）。
- ★ **一处记账更新（不在本任务写范围，故未回改）**：我在 `_handoff/vmu/assistant-round21-report.md` §9.3 第 6 条把 `hits:2` vs `tool-results=5` 记为"**原样待解、我不解释**" —— 该条**现已由本轮两人独立结案**（不是缺陷，是快照）。**要回改那份 R21 报告请派单**（它不在本任务的写范围）。
- **未把"计数没错"当成结论**：正文给的是**可复算的 1:1 与同刻相等**，并明确写出**被否证的假设**及其**否证方式**。
