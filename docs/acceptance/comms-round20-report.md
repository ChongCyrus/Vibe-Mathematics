# Round 20 · task-126 · v5r pack 的 M2「指标计数者」（`threshold` 自主开火的唯一收口条件）

- **状态**：**A 模块 ✓／B 双登记 ✓／C 能红断言 ✓／D 交棒 ✓**（真机判定**归 `vmu-assistant2`**，我**不**声称）。交付：本报告。
- **纪律**：未跑全量（T0/T1 归 Lead）、未 `regen-all`、**未 git**；临时文件全在 `D:\_tmp\vmu-r20`（变异钩子）；`package.json` **只做两次定点 `edit`**（未整文件写）；每步跑"加载内核/装载 pack"的套件。
- **核验口径（引用前先落一行）**：读数取自 **2026-10-15 16:27:12 起同一次运行**；指纹见 §⑤。此后若他人再改这些文件，读数需重取。

---

## A · 模块本体（`vibe-math-vmu/packs/v5r/middleware/artifact-counter.js`，新文件，sha `B2F4381D…`）

**为什么必须有它**（链条已由 R19/R20 各自实测，缺口唯一）：`kernel.metricValues()` 的契约是 **"无观测 ⇒ 无键"**（`kernel/index.js:723-725`，绝不伪造 `0`）⇒ 出货部署里没有任何 `observe()` ⇒ 边界拿到的 `{}` ⇒ `thresholdMet()` 如实 `false`。而**部署侧补不了**：`vmu.middleware.entries` 走 `bus.add()`、**总线不加载文件**（`kernel/bus.js`）⇒ 只有 pack 的 `module:`/`file:` 经 `kernel/loader.js` 才拿到 `api`（能力门控 `api.services.get`）。⇒ **收口条件＝pack 里有一个 M2 计数者**（R1：框架给能力，pack 决定计什么/何时计）。

**它计什么（政策＝数据表 `COUNTER_POLICY`）**

| 指标（`vmu.metrics.indicators` 里声明） | 挂的钩子 | 语义 |
|---|---|---|
| **`tool-results`** | **`tools/result`** | **每完成一次工具调用 +1**（`value:1`、`kind:'read'`、`agg` 默认 `sum`） |
| **`settled-jobs`** | `math/job-settled`／`lean/job-settled` | 每个结算的数学/Lean 作业 +1（机构自己的"产出型步骤完成"） |

**★ 为什么是 `tools/result`（两条独立证据）**：① **宿主包内原文**（DSH `app.asar` 内文档）：*"Observe final tool outcomes on `tools/result`; use `tools/post-execute` only to transform a result"* —— 且同包内有真实用法 `ctx.on("tools/result", (exec, result) => …)`；② 本仓 `kernel/bus.js:270` 把它注册为 `blockable:false, rewritable:false`，timing 逐字 *"a tool result exists (observation)"* ⇒ **计数器改不了它所看的调用**。
**★ 为什么【不】挂 `agent/turn-stopping`**（Lead 约束 ①）：报告边界**也**在那个钩子上（`vibe-math-vmu.js:656-657`）⇒ 同刻写入的可见性取决于监听器顺序，**单回合剧本会被误判成"没开火"**。本模块的两个钩子都在**回合内**。
**★ 两种"没记上"都不是静默**：① 部署**一条指标都没声明** ⇒ 指标面自己的零机制跳过（`recorded:false, configured:false` ＋ reason `no indicators declared (zero mechanism)`），本模块**原样透传**并把这次跳过**计数**；② 声明了、但**这个名字不在表里** ⇒ 指标面**具名拒**（`VMU_METRIC_UNAVAILABLE`，hint 列已声明清单），本模块把它**转成具名跳过**（`{ok:false, counted:false, code}`）并**计数**（`counters().skippedUndeclared`），**绝不抛**（manifest 条目 `failure:'open'`：计数器不许弄坏它计的工作）。**未发明任何新错误码**——用的全是指标面自己的码。
**形状**：`meta:{id:'v5r.artifact-counter',apiVersion:1}`、`capabilities:['trigger-workflow','record']`（**模块级**，loader 读的是模块的）、`hooks` 由政策表派生（两者不会漂移）、额外导出 `counters()`（跳过可读，否则"没人看见"）。

## B · 双登记 ＋ 清单条目 ＋ 门禁

- **清单条目（随模块一起落）**：`packs/v5r/prompts/v5r-core.js` 新增
  `{ id:'v5r.artifact-counter', kind:'module', order:320, on:['tools/result','math/job-settled','lean/job-settled'], failure:'open', capabilities:['trigger-workflow','record'], module: V5R_ARTIFACT_COUNTER }`
  ⇒ 部署只要 `packs.active:['v5r']` 即随之装载；装载后 `host-hooks.js` 的 `hooks.refresh()`（`vibe-math-vmu.js:862`）把 `tools/result` 桥到宿主。
- **双登记（pack 文件是预设载荷）**：`package.json` 的 `files[]` ＋️ **`installer.js` 的 `PRESETS[].files`**（后者**一行定点**：`'packs/v5r/middleware/motion-box.js', 'packs/v5r/middleware/artifact-counter.js'`）。另把**新测试**登记进 `package.json files[]`（`installer.js` 对**任何**测试文件都是 0 条，实测）。
- **`audit-pack-face` 要求 pack 文件夹里的每个文件都在 `docs/27` 被点名** ⇒ 在 `docs/27-pack-folder.md` 的 v5r 目录树里**加一行** `artifact-counter.js`（一句说明口径）。★ **见 §⑥-2：这一行与清单条目都在我声明的写范围之外，是"核 `audit-pack-face`"这条验收要求的必要修复，已具名披露。**
- **门禁（同一次运行）**：`audit-pack-middleware-shape 7/0`、`vmu-middleware-hooks-declared 8/0`、`audit-pack-face 5/0`、`audit-package-membership 29/0`、`audit-installer-policy ALL GREEN`、`audit-installer-compat ALL GREEN`、`vmu-pack 53/0`、`vmu-host-hooks 22/0`、`vmu-entry 150/0`、`vmu-kernel 175/0`、`audit-code-size 9/0`、`audit-fs-purpose 10/0`、`audit-dependency-cycles 8/0`、`check-docs PASS`。

## C · 能红断言（`tests/vmu-metrics-counter.test.mjs`，新文件，**26 条**）

| 状态 | 断言要点 |
|---|---|
| **① 装了** | 条目真的成为 bus entry（loader 附 `api`）、`tools/result` **真的被桥接**、**3 次真实 `tools/result` ⇒ `kernel.metricValues()['tool-results'] === 3`**（读的是边界自己的读取器，不是 handler 的返回值）、两次 `math/job-settled` ⇒ `settled-jobs === 2`、模块计数与指标面**一致** |
| **② 不装** | 同部署旋钮、**无 pack** ⇒ 无 bus entry、无可桥接钩子、`metricValues()` **是空对象（无键、无伪造 0）**、模块计数**没动** |
| **③ 指标未声明** | 已声明的照记（`tool-results === 1`）；未声明的 `settled-jobs` ⇒ **恰一跳过 ＋ 被计数**（`skippedUndeclared` 增量＝1）＋ `metricValues()` **无该键** ＋ 跳过**带具名码**；直接驱动 handler ⇒ 回 `{ok:false,counted:false,code}` **而不抛**；**一条指标都没声明** ⇒ 指标面的零机制跳过**原样透传**；**没有 `api`**（inline 条目）⇒ **具名拒** `VMU_ENGINE_UNAVAILABLE` |
| **形状** | `meta/capabilities/hooks` 合规；钩子集合＝政策表；**不挂 `agent/turn-stopping`** |

**变异（能红，且不写仓库：`D:\_tmp\vmu-r20` 的 loader 钩子）** —— ★ 三个数**只能在同一次 `counter-evidence.mjs` 运行里引用**（它先把哈希打出来再跑三次），见 §⑦-E 的更正
```
node D:\_tmp\vmu-r20\counter-evidence.mjs     ← 一次跑完三条并绑定哈希（推荐）
# 等价的手工三条（16:34:25 复跑，哈希：test 622085760DAF1E77 / hook B32E65F9E569817A / module B2F4381D8FCA794E）
node tests/vmu-metrics-counter.test.mjs                                            → 26 passed / 0 failed   exit=0
CTRL_MUTANT=hook   node --import …/register-counter-mutant.mjs tests/vmu-metrics-counter.test.mjs
   → 17 passed / 9 failed  exit=1   （政策挪到边界钩子 ⇒ S5/S7/I3/I5/I7/U0/U1/U6/U7 全红）
CTRL_MUTANT=silent node --import …/register-counter-mutant.mjs tests/vmu-metrics-counter.test.mjs
   → 24 passed / 2 failed  exit=1   （把"跳过计数"改静默 ⇒ U2/U5 红）
# ★ 我更早写的 23/2 是**陈旧读数**（在 U0 断言加入之前取的、且没绑哈希）⇒ 已更正，见 §⑦-E
```

## D · 交棒（真机判定＝`vmu-assistant2` 的活，**我不声称**）

已把三件事具名发给 `vmu-assistant2`：**① 指标名 `tool-results`／`settled-jobs`**（它 overlay 现为 `['artifacts']`，两条 `artifacts` 阈值**不会开火**，需把 `indicators` 与两条阈值的 `metric` 改成 `tool-results`）；**② 观测挂 `['tools/result','math/job-settled','lean/job-settled']`**（**回合内**，且 `tool-results` ＝该会话工具调用次数 ⇒ 建议阳性 `gte 1`、阴性 `gte 1000`）；**③ 清单条目已随模块落地**；并给了**备用路线** `config.modules:[{id,file,capabilities}]`（`vibe-math-vmu.js:876`）。
★ **我在这条交棒里说错了一句，已更正（见 §⑦-G）**：我写的"部署只要 `packs.active:['v5r']` 即随之装载"是**错的** —— 装载开关是**顶层 `config.packs`**（`vibe-math-vmu.js:732`），`vmu.packs.active` 只是设置键（`:515-516` 只让"pack 工具/loader 可达"，**不装载任何东西**）。**⇒ 按 `vmu-assistant2` 的三次真机实测：已知两条能设 `config.packs` 的路线都堵 ⇒ 真机装载路线未通、真机未证**（下文 §⑦-G 逐条给证据）。

---

## ⑤ 实测（原样命令 ＋ 退出码 ＋ 指纹；2026-10-15 16:27:12 起同一次运行）

```
FP packs/v5r/middleware/artifact-counter.js  sha256[0:16]=B2F4381D8FCA794E   (新)
FP packs/v5r/prompts/v5r-core.js             sha256[0:16]=C28A8E3F24FF053D   (＋清单条目)
FP tests/vmu-metrics-counter.test.mjs        sha256[0:16]=622085760DAF1E77   (新，26 条)
FP package.json 38E45B2F5E3C12C3 / installer.js 131E49F818E7FB72 / docs/27-pack-folder.md 159801750364CB0A

tests/vmu-metrics-counter.test.mjs           → 26 passed, 0 failed          exit=0
tests/vmu-metrics.test.mjs                   → VMU METRICS: 85 passed, 0 failed                 exit=0
tests/vmu-report-boundary-metrics.test.mjs   → VMU R19 BOUNDARY METRICS: 12 passed, 0 failed   exit=0
tests/vmu-host-hooks.test.mjs                → VMU HOST HOOKS: 22 passed, 0 failed             exit=0
tests/vmu-pack.test.mjs                      → VMU PACK: 53 passed, 0 failed                  exit=0
tests/vmu-pack-inline-manifest.test.mjs      → VMU PACK INLINE MANIFEST: 35 passed, 0 failed   exit=0
tests/vmu-entry.test.mjs / vmu-kernel.test.mjs → 150/0 ・ 175/0                                exit=0
tests/audit-pack-face.test.mjs               → PACK FACE: 5 passed, 0 failed                   exit=0
tests/vmu-middleware-hooks-declared.test.mjs → 8 passed, 0 failed                              exit=0
tests/audit-package-membership.mjs           → PACKAGE MEMBERSHIP: 29 passed, 0 failed         exit=0
tests/audit-installer-policy.test.mjs / audit-installer-compat.test.mjs → ALL GREEN            exit=0
tests/audit-code-size.test.mjs               → CODE SIZE: 9 passed, 0 failed                   exit=0
tests/audit-fs-purpose.test.mjs              → 10 passed, 0 failed                             exit=0
tests/audit-dependency-cycles.test.mjs       → 8 passed, 0 failed                              exit=0
scripts/audit-pack-middleware-shape.mjs      → PACK MIDDLEWARE SHAPE: 7 passed, 0 failed       exit=0
scripts/check-docs.mjs                       → DOC LINT: PASS                                  exit=0
tests/audit-declaration-criterion.test.mjs   → 16:27:12 读数：RULE E current=68 baseline=67（FLAG 行点名 `vmu-pack-inline-manifest.test.mjs:A:busEntries`）
                                             → 16:30:53 复跑：RULE E current=67 = baseline=67 ／ multi-line C 57=57 ／ 唯一 FAIL＝`regen-all --check`
                                               （⇒ §⑥-3 那条**已由 owner 关闭**；两版读数都留，见 §⑦）
```

## ⑥ 具名未做／边界（做不完就说）

1. **真机结论我没有声称**：本轮只证明"**模块在 in-process 真装配（`entry.apply` ＋ `packs:['v5r']`）里真的装载、钩子真的桥接、观测真的写进 `metricValues()`**"（C①，且已被 §⑦-F 的**独立探针复算**确认）。**"`threshold` 报告在真 DSH 会话的回合边界自主开火"归 `vmu-assistant2`**；而经 §⑦-G：**"把 pack 送进真会话"这条装载路线目前未通**（`vmu.packs.active` 不装载；`config.packs` 的两条已知路线一条打断预设组装、一条被工具设计性拒），⇒ **真机未证**，且**报告任何一处都不得被读成"真机已验证"**。
2. **两处在声明写范围之外的编辑，已具名披露**：① `packs/v5r/prompts/v5r-core.js`（清单条目）—— Lead 约束 ②-3 明写"若模块要新清单条目，**必须随模块一起落**，否则真会话里根本不会装载"，故必须落；② `docs/27-pack-folder.md`（一行点名）—— `audit-pack-face` 是**我任务验收里点名要核的门**，不落则红树。两处都**只做定点 `edit`**、只增不删，并已告知 `vmu-pack2`（docs/27 在其 docs 写范围内）与 Lead。
3. **RULE E `current=68 baseline=67` —— ★ 已关闭（两版读数都留，见 §⑦）**：16:27:12 那次 FLAG 行逐字点名 `vmu-pack-inline-manifest.test.mjs:A:busEntries`（**不是我的文件**；我的两个新文件在该门 `hits by file` 里**零命中**）；**16:30:53 复跑已是 `current=67 = baseline=67`**，该文件 `:134` 现在同一行上就有非空前置（`busEntries.length > 0 && …`）。⇒ owner 在两次读数之间修好了；**本项无遗留**。
4. **命名取舍（诚实优先）**：`tools/result` 记的是"**工具结果**"，故指标叫 **`tool-results`**，**没有**沿用会误导的 `artifacts`（"一次工具调用 ≠ 一件成果"）。代价＝`vmu-assistant2` 要改 overlay 的 `indicators` 与两条阈值的 `metric`（已把确切行文给它）；它也可保留 `artifacts` 作为**另一个**（例如未来的成果入库）指标名，本模块不占用。
5. **未做**：没有指标工具（`tools/metrics.js`）——那不在本任务范围（R20 的缺口是**生产者**，不是工具面）；`settled-jobs` 在真会话里可能一次都不触发（无数学作业）⇒ 它只是**诚实**的第二个指标，真机阳性靠 `tool-results`。
6. **`kernel/meetings.js` 未被本任务触碰**（它仍 1197/1200，留给自己的面）；本轮改动全在 pack／测试／登记三处。
7. **★ 装载路线（本任务范围外的阻塞项，已具名）**：模块、政策、清单条目、桥名单**逐条自查＋被 `vmu-assistant2` 复核**都成立（`tools/result` 确在 `BRIDGED_HOOKS`；它复跑我的套件 26/0），**差的只是"让它进到真会话"**：装载开关是顶层 `config.packs`，而(a) `vmu.packs.active` 不装载、(b) 把 `config.packs` 打到预设内那行插件会**打断会话创建**（`agent-preset/invalid … systemPrompt … without inject`）、(c) `vibe_vmu_pack {action:'apply'}` **按设计只吃内联 manifest**（`host.js:704-705`）。⇒ 裁决（修 inject ／ 让工具接受 `id` ／ 证实 profile 行装载点）**已由它交 Lead**；**我不改 `packs/**` 之外的装载链**（`vibe-math-vmu.js`／`host.js` 不在我写范围），也不把这条写成"已解决"。

---

## ⑦ 追加：`vmu-verify2` 的独立复核 ＋ 我更正的那条（★ 门禁读数必须绑定版本）

**A · 更正（我报的一条红已经不存在）**：`vmu-verify2` 先按我给的时刻重跑，指出 `RULE E 68/67` 在**当前树**上不存在。我**自己复跑确认**（16:30:53）：

| 读数时刻 | 读数 | 版本锚点 |
|---|---|---|
| **16:27:12**（本报告 §⑤） | `RULE E current=68 baseline=67`；FLAG 行点名 `vmu-pack-inline-manifest.test.mjs:A:busEntries` | 当时该文件 `busEntries` 的 for-of 无前置 |
| **16:30:53**（本次复跑） | **`current=67 = baseline=67`** ／ `multi-line C 57=57` ／ `DECLARATION CRITERION: 87 passed, 1 failed`（唯一 FAIL＝`regen-all --check`，Lead 的轮末步） | `tests/vmu-pack-inline-manifest.test.mjs` sha256[0:16]=`FD9F55EA346630CC`，`:134` 已是 `ok(busEntries.length > 0 && busEntries.every(…))` |

⇒ **两版读数都留在案**（不抹历史），结论＝**该项已由 owner 关闭，本任务无遗留**。★ 这已是本会话第三次"门禁读数随树漂移"（R15 的 stale 项、R20 的 `regen-all 12/15↔13/15`、这次的 `68↔67`）⇒ **纪律：任何门禁读数都必须连同时刻（＋受影响文件的哈希）一起引用**，否则读者会把两个版本当成矛盾。

**B · 它独立核过且与我一致的两条**：① 我的两个新文件（`tests/vmu-metrics-counter.test.mjs`、`packs/v5r/middleware/artifact-counter.js`）在该门 `hits by file` / `RULE-E-HIT` 里**零命中**；② **双登记双向**：磁盘→`files[]`（它的闭包量具：`vibe-math-vmu` 磁盘 215→216 ＝我新增的 pack 文件；裸未登记仍 6 条＝豁免表里的 6 份 `docs/audit/*`，`audit-package-membership 29/0`）＋ `files[]`→`PRESETS`（`audit-installer-policy ALL GREEN`），且 `tests/**` 仍不进 `PRESETS`（无例外）。

**C · 它复跑过的三条（读数**完全对上**，并被它逐条读出 FAIL 具名）**：`26/0 exit=0`；`hook ⇒ 17/9 exit=1`（S5/S7/I3/I5/I7/U0/U1/U6/U7）；`silent ⇒ 24/2 exit=1`（U2/U5）。★ 它同时用**算术**抓到了我一处**陈旧读数**：我写过 `silent ⇒ 23/2`（23+2=25 ≠ 干净跑的 26），见 **E**。⇒ 一次跑完三条、并绑定哈希的配方（原样，共享文件系统可执行、**不写仓库**）：
```
node D:\_tmp\vmu-r20\counter-evidence.mjs     # 先打印四个哈希，再依次跑 CLEAN / MUTANT hook / MUTANT silent
# 等价手工三条（16:34:25 复跑；哈希：test 622085760DAF1E77 / hook B32E65F9E569817A / register 9AA97C91B5DB5CC9 / module B2F4381D8FCA794E）
node tests/vmu-metrics-counter.test.mjs                                                       # 26/0 exit=0
CTRL_MUTANT=hook   node --import file:///D:/_tmp/vmu-r20/register-counter-mutant.mjs tests/vmu-metrics-counter.test.mjs   # 17/9 exit=1
CTRL_MUTANT=silent node --import file:///D:/_tmp/vmu-r20/register-counter-mutant.mjs tests/vmu-metrics-counter.test.mjs   # 24/2 exit=1
```

**E · ★ 更正（这一条是**我的**错，不是版本漂移）**：我早先写过 `silent ⇒ 23 passed / 2 failed`。**根因**＝那次读数是**在给测试加入 `U0` 断言之前**取的（`U0` 是我为了让 `hook` 变异体**以断言失败而不是 TypeError 崩溃**而补的），**之后我没有重跑 silent**；而我又**没有把哈希和数字一起记**。⇒ 当前版本实测 **`24/2`**（24+2＝干净跑的 26，算术自洽），与 `vmu-verify2` 读数**逐字一致**。
| 读数时刻 | `silent` 变异 | 版本锚点 |
|---|---|---|
| 早先（无 U0 的测试版本，哈希未记） | `23/2`（总 25） | ★ **不可复现的陈旧读数，作废** |
| **16:34:25**（本次） | **`24/2`（总 26）exit=1**，FAIL＝`U2`/`U5` | test `622085760DAF1E77`／hook `B32E65F9E569817A`／module `B2F4381D8FCA794E` |
⇒ **纪律升级（照 §A 的教训再进一步）**：变异/门禁读数不仅要**绑时刻＋哈希**，**还必须在最后一次编辑之后重跑**——所以我把三条并成**一条命令**（`counter-evidence.mjs`，先打哈希再跑），从此"数字与版本"不可能被分开引用。★ 这一条比 §A 更硬：§A 是**树被别人的修改移动**，这条是**我自己的读数早于自己的最后一次编辑**。

**F · 独立复算已完成 ✓（它写探针，我**自己**跑一遍）**：`vmu-verify2` 写了**不依赖我套件**的探针 `D:\_tmp\v20\independent-counter-probe.mjs`（sha256[0:16]=`D39B05713E759789`，真入口 `entry.apply` ＋ `packs:['v5r']` ＋ `indicators:['tool-results']`，只读 `kernel.metricValues()` 与 `bus.status().entries`）。**我在 2026-10-15 16:37:54 自己复跑它**（不转述它的读数），得到与它一致的：
```
at rest: metricValues() = {}                                          ← 无观测 ⇒ 键缺席、无伪造 0
bus entries（前缀 v5r.artifact-counter）: lean/job-settled ・ math/job-settled ・ tools/result   ← 恰好三条＝政策表三个钩子
ctx.on listeners: ["agent/turn-stopping","tools/pre-execute","tools/result"]；tools/result listener=1
通道① 调 ctx.on('tools/result') 监听器 3 次 ⇒ metricValues() = {"tool-results":3}   ★我要证的那条，独立复现
通道② kernel.bus.emit('tools/result') 3 次 ⇒ metricValues() = {"tool-results":6}    （两条通道都能到达，且 sum 语义自洽）
ARM 2（packs: []）⇒ 含 artifact-counter 的条目 0、metricValues() = {}
```
★ 它顺带给出一个**我没写过的细化**（我采纳并记下）：`agent/turn-stopping` 出现在**入口**的 `ctx.on` 列表里（那是**报告**的边界，与 `vmu.limits.toolCallsPerTurnCap` 同处），而**该模块自己的 bus 条目里没有它** ⇒ 我的 S5"计数模块不在报告边界自身的瞬间观测"**结构上成立**；但两者不要混读。⇒ **A 的三种边界已由"独立复算"确认，不再只是复跑我的套件。**

**G · ★ 更正（我的交棒话术错了，第二轮自我更正）：`vmu.packs.active` **不装载** pack；真机装载路线未通**
我先前对 `vmu-assistant2` 写过"部署只要 `packs.active:['v5r']` 即随之装载"。**代码上这句话是错的**（我读的是测试 harness —— 它**同时**传了 `packs:['v5r']`，我把两件事读成了一件）：
| 事实 | 代码锚点 |
|---|---|
| **装载开关＝顶层 `config.packs`** | `vibe-math-vmu.js:732` `const packsWanted = Array.isArray(config.packs) ? config.packs : []`（`docs/10:436` 与之一致："在 profile 行的 `config.packs: ['<id>']` 里声明"） |
| `vmu.packs.active` **只是设置键** | `:515-516` 的第二个析取只让 `packsDeclared` 为真 ⇒ `:530` 把 **`vibe_vmu_pack` 工具/loader 变成可达**，**不装载任何 pack** |
| **随包 pack 无法经工具装载** | `host.js:704-705` 具名拒：`VMU_INVALID_ARGUMENT … plan/apply need an inline manifest (manifest: "<json>")`，hint 逐字"a pack SHIPPED as `./packs/<id>.js` is loaded by the profile row via `config.packs`" ⇒ **`docs/10:514` 的"② 运行期装载 ⇒ `vibe_vmu_pack`"只对内联 manifest 成立**（doc 与工具口径需一并收口，归其 owner） |

**`vmu-assistant2` 的三次真机实测（它记了 id/时刻/退出码；我照抄，未自行声称）**：① 16:28:11 `session-da4942a1-…` exit=0：overlay ＝ `vmu.packs.active:['v5r']` ＋ `indicators:['tool-results']` ⇒ 宿主 stdout 只有 `turn-end-duty`，`gte 1`／`gte 1000` **各 0 条** ⇒ **计数器未被触发**（因为 pack 从未装载；旁证：这些会话的 `vibe_vmu_status` 全是 `settingsMerge.packs: []` 且 `sources` 无 `source:"pack"`）；② 16:31:34 exit=1：把 `packs:['v5r']` 打到**预设内那行插件**的 config ⇒ **`session/create` 被拒** `agent-preset/invalid … cannot get property "systemPrompt" without inject`（这条路线会打断预设组装）；③ 16:33:21 `session-d2f0e7d5-…` exit=0：走工具 `vibe_vmu_pack {action:'apply', id:'v5r'}` ⇒ 按上表**设计性拒**。
⇒ **结论（与它一致）**：**in-process 装配 26/0 与 A/B/C 全部成立；"把它送进真会话"这条路线未通 ⇒ 真机未证。** 它已把装载路线二选一（修 inject 失败 ／ 让工具接受 `id` 或证实 profile 行的装载点）交 **Lead** 裁决；★ **我不声称真机结论**，也**未**把报告任何处写成"真机已验证"。**附带一条我这边可提供的事实**：我给的"备用路线 `config.modules`"与 `config.packs` **读的是同一个顶层 `config` 对象**（`:876` vs `:732`）⇒ 它很可能**同样不可达**（这一点应由 Lead／DSH 侧以一次真会话判定，我不替它下结论）。

**D · 边界两分法（双方一致、原样保留）**：我证"模块在真装配里真装载／钩子真桥接／观测真写进 `metricValues()`"；**"`threshold` 在真会话回合边界自主开火"归 `vmu-assistant2` 的真会话判定**——不得在矩阵里写成"真机已证"。★ 经 §G 之后，"真装配装载"这一半**仍成立**（那是 in-process 的 `entry.apply`），而**"在真会话里装载"是另一半、目前未通**。

**H · 收口状态（对方侧，2026-10-15 16:41:07，绑定字节）**：`vmu-assistant2` 已把 §G 的两条落进 `docs/21 §20.4`：**(c′)** 把我给的"第四条路线 `config.modules`"登记为**未测**（我确实只读码、没测过 ⇒ 它标"未测"是正确口径；它本轮也没测）；**(e)** 记下**两分法**——(i) 真装配（进程内）＝有效（引 `vmu-verify2` 的独立探针读数：三条 `v5r.artifact-counter::*` 总线条目、`tools/result` 真桥接、3 次事件 ⇒ `metricValues() === {"tool-results":3}`）／(ii) 真 DSH 会话＝**未装载**，并加限定"**别读成'凡 pack 生效一律作废'**"。读数：`docs/21` sha256[0:16]=`A66E4571D0E6FC9A`，`check-docs PASS`／`audit-doc-index 5/0`／`audit-vmu-docs 95/0`／`audit-doc-vs-code-tables 17/0`。
- **`docs/10:514` 的口径矛盾仍未修**（② "运行期检查/装载 ⇒ `vibe_vmu_pack`" 只对**内联 manifest** 成立，与 `host.js:704-705` 及 `docs/10:436` 不一致）：**`docs/10` 既不在我 task-126 写范围、也不在它写范围** ⇒ **我无权授权任何人代改**，已**连同可直接粘贴的改法**上交 **Lead** 指派人落（见 §⑥-7；本报告只登记，不代改）。
- 它对**下一次真机装载证据**拟加的两项检查（`settingsMerge.packs` **非空** ＋ 至少一键带 **`source:"pack"`**）与我 §G 引用的旁证同源 ⇒ 口径一致。
