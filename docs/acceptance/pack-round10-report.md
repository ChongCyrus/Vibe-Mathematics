# vmu 交接 · Round 10 · task-76 报告（pack：B1–B4 八键声明 · stallAutoMeeting 形状 · 值域门禁复核）

- 任务：`task-76`（vmu-pack）· 纪律：未跑全量 sweep、未 `regen-all`、未 git；临时文件 `D:\_tmp`；**读者未落地不写默认值**、**不臆造常量**。
- 本轮改动：`packs/v5r/settings/defaults.{json,js}`（＋8 键）、`docs/10 §4.8`（＋D9 修正）。

---

## A. B1–B4 的 v5r 值声明 · **8/8 已落**（core 的 task-74 落了键＋真读者后逐键核对再写）

**方法**：先用探针 `node D:\_tmp\pack-readiness.mjs`（仓库外一次性·实测）对 8 个键做**三条件检查**——`schema 声明 ∧ 有真读者（kernel/host/tool/entry）∧ 值在声明的域内`；**只有 READY 才写默认值**。中途快照：`0/8 → 4/8（paper 四项）→ 7/8 → 8/8`，每一步都等读者到位。

| 已声明键 | 值（v5r 出处） | **真读者** | 类别 |
|---|---|---|---|
| `vmu.prompt.compactThreshold` | **66**（`:1078`） | `kernel/prompt/index.js:118,121`（读 `ctx.contextPct`） | 复述默认（def 66） |
| `vmu.prompt.compactAfterRounds` | **8**（`:1079`） | `kernel/prompt/index.js:125,128`（读 `ctx.round`） | 复述默认（def 8） |
| `vmu.paper.finalPaper` | **true**（`:1163`） | `kernel/paper.js:58`＋`:164` | 复述默认（def true） |
| `vmu.paper.format` | **'both'**（`:1164`） | `kernel/paper.js:59`＋`:165` | 复述默认（def 'both'） |
| `vmu.paper.language` | **'zh'**（`:1165`） | `kernel/paper.js:60`＋`:171` | 复述默认（def 'zh'） |
| `vmu.paper.compilePdf` | **true**（`:1166`） | `kernel/paper.js:61`＋`:177` | 复述默认（def true） |
| `vmu.members.maxTempPerMember` | **3**（`:1075`） | `kernel/recruit.js:52,173`（`accept()`） | 复述默认（def 3） |
| `vmu.tasks.memberMayRejectAssign` | **true**（`:1066`） | `kernel/tasks.js:111`（`objectAssign()`）＋`kernel/index.js:667` | 复述默认（def true） |

★ **诚实口径（沿用 Lead 轮 7 对 `vmu.math.maxParallel` 的裁决）**：这 8 个键的**框架默认值都是从 v5r 抄的**（schema doc 逐条引了 v5r 的 `file:line` 与消费点）⇒ 它们是**"复述默认"**：**可读、可调**，但**不得**当作"v5r 行为已复现"的证据。我在 `defaults.js` 里对每一组都写明了这一点（不是含糊带过）。
★ **一处刻意的更严（已登记）**：`vmu.tasks.memberMayRejectAssign=false` 时 vmu **具名拒**，而 v5r **静默忽略该字段**（schema doc 明写）⇒ 分歧方向在安全侧。

**读数**：`vmu-pack-defaults-vs-schema` → `undeclared=0`（**43 键**）；JSON/JS 同键同值 `sameKeys true / diffs []`；`vmu-pack` **53/0**；`vmu-paper` **37/0**；`audit-pack-face` **5/0**；值域门禁 **5/0**。

## B. `stallAutoMeetingMs` 的最终形状 · **具名保留（`control/idle` 未落）**

- **实测**：`grep -rn "control/idle" vibe-math-vmu/kernel` → **0 命中**；`HOOK_REGISTRY` 里也没有 ⇒ 按任务口径**具名保留**，**未写任何声明**。
- **为什么不能先写 M2**：`kernel/loader.js` 按登记表校验 `on`，**未登记钩子⇒具名拒**，整个 pack 的 apply 会失败 ⇒ 先写＝把 pack 弄坏（这一点写进了 `docs/10 §4.8`）。
- **已就绪的落地物（暂存于仓库外临时目录·实测暂存用）**：`<临时目录>/staged-stall-meeting.js` —— 含**纯函数** `stallDecision()`（**阈值不硬编码**：用 `3 × vmu.control.idleAfterMs` ＝ 3×120000 ＝ **360000**，v5r `:1082/:1083`）＋ M2 条目 `{id:'v5r.stall-meeting', kind:'module', on:'control/idle', handler}`（判定静止 ⇒ 调 `meetings.open({topic:'stall-review'})`）。
- **落地即配的探针（三步证真）**：① 内核 emit `control/idle`（含 `afterMs`）；② M2 handler 被调用（计数器）；③ 会议面 `open()` 真被调用（stub 断言）。**钩子一落我立刻复制进仓＋跑该探针**。

## C. 值域门禁的自探针复核 · **仍能"种域外值 ⇒ 红"**

- `node scripts/audit-pack-value-domain.mjs` → **5 passed / 0 failed**（exit 0）：§1 静态（**43 处声明**全在域内）＋§2 实测（`vmu.paper.finalizer` 域外值**具名拒**）＋§3 自探针。
- `node scripts/audit-pack-value-domain.mjs --selftest` → **3 passed / 0 failed**（exit 0）：**种下的域外值必被报红**，且**域内值不误报**。
- **执行点已在门禁树里**：`tests/audit-declaration-criterion.test.mjs:569-572` 的 RULE A `runSelfProof('audit-pack-value-domain.mjs','--selftest')` ✓（vmu-verify 补的）。

## D. 文档 · 已同步

- `docs/10 §4.8`：改为**最终状态**——8 键已声明（逐键列真读者＋"复述默认"类别）＋ `control/idle` 仍具名保留＋暂存物与三步探针说明。
- **D9 修正**：§4.8 里那处盘符绝对路径按卷惯例改成"**仓库外临时目录，实测暂存用**：`<临时目录>/…`" ⇒ `check-docs` 回 **issues=0 / DOC LINT: PASS**（证据保留，未删）。
- `docs/27`：**未改**（本轮无 pack 内新文件；`audit-pack-face` 5/0）。
- **口径确认（Lead 转告的 `plan().actions` 事实）**：我的卷（`docs/10`／`docs/27`）**没有**"按 `id` 取 action"的说法——`docs/10` 只提到 `kind:'prompts'` 动作的存在；该口径本就写在 `docs/29:297-305`（"每个 kind 用**它自己的标识字段**；**`count` 是权威计数**"）。**无需改动**。

---

## 验证（原样命令 + 退出码）

工作目录 `Vibe-Mathematics`。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node D:\_tmp\pack-readiness.mjs`（仓库外一次性探针·实测） | 0 | **ready 8/8**（每键：schema ∧ 真读者 ∧ 值在域内）；`control/idle` → **false** |
| `node D:\_tmp\vmu-pack-defaults-vs-schema.mjs`（仓库外一次性探针·实测） | 0 | `packs-with-defaults checked; undeclared=0` / `total undeclared=0`（**43 键**） |
| `node scripts/audit-pack-value-domain.mjs` | 0 | **5 passed, 0 failed** |
| `node scripts/audit-pack-value-domain.mjs --selftest` | 0 | **3 passed, 0 failed** |
| `node scripts/check-docs.mjs` | 0 | `vmu doc-lint: docs=30 issues=0` / **DOC LINT: PASS**（D9 已消） |
| `node --check packs/v5r/settings/defaults.js` | 0 | 语法通过 |
| JSON/JS 同键同值核对（内联探针） | 0 | `keys 43 sameKeys true diffs []` |
| `node tests/vmu-pack.test.mjs` | 0 | 53 passed, 0 failed |
| `node tests/vmu-paper.test.mjs` | 0 | 37 passed, 0 failed |
| `node tests/audit-pack-face.test.mjs` | 0 | 5 passed, 0 failed |

**非我红（core 的 `task-74` 收尾）**：`vmu-settings` → `the table and the schema declare the same NUMBER of keys [1220 vs 1228]`；`vmu-planned-settings` → `docs/04 is classified as a mirror … [1107/1115]`。两条都指向 **`docs/04 §11` 的生成表 STALE**（core 新落 8 键后未重生成）⇒ Lead 已认领为其 `regen-all`。

---

## 追加（Lead 裁决 · reader-a 实测的真缺陷）：**投影面名 `ballots` → `ballotbox`**

**缺陷**：pack 的 `vmu.resume.projections` 写 `'ballots'`，而**投影适配表与耐久 store 键都是 `ballotbox`**（`kernel/index.js:883`、`kernel/store.js:75`）⇒ `notAttached:[{face:'ballots', reason:'no adapter in this assembly'}]` ⇒ **开两个真票箱、`shutdown()` 后耐久键仍是种子**——票箱**从未被投影**（"声明了没生效"一类）。

**修法（我的一行）**：`packs/v5r/settings/defaults.{json,js}` 的该列表 **`'ballots'` → `'ballotbox'`**，注释写清 reader-a 的实测形状＋core 的**具名容忍**（`PROJECTION_ALIASES`，经 `viaAlias` 回显）＋"容忍与具名必须成对"。core 同时保留对旧拼写的具名容忍（②）。

**实测（`node D:\_tmp\projection-packlist-probe.mjs`，仓库外一次性·实测，exit 0）**：
```
pack declares : ["members","tasks","meetings","ballotbox","budget","phase","work","chat","panel","human"]
attached      : ["human","tasks","meetings","ballotbox","budget","chat","panel"]
viaAlias      : []            ← 直接声明，不再走别名
notAttached   : [{face:'members', reason:'attachProjection needs a target object', code:'VMU_INVALID_ARGUMENT'},
                 {face:'phase', …}, {face:'work', …}]
known         : [...,"ballots",...]   unwiredKnown: ["members","ballots","phase","work"]
```
**reader-a 的自适应探针已翻正**：`node tests/vmu-resume-e2e.test.mjs` → **90/0（exit 0）**，其中 **`12f CLOSED: ballotbox is attached and its envelope carries BOTH boxes across the shutdown`** ✓（它补票箱活体往返后 90→91）。

**同一类里另两处具名项（非 pack，已报 core）**：① `members` 声明了但 `notAttached`（reason "needs a target object"，**具名**非静默）；② `PROJECTION_KEYS`（`kernel/resume.js:59`）仍写 `ballots`，与适配表/store 键不一致 ⇒ `known`/`unwiredKnown` 报一个**没人能挂的名字**。

**追加读数（全 exit 0）**：JSON/JS `sameKeys true / diffs []`（43 键）· defaults 探针 `undeclared=0` · 值域门禁 5/0 · `vmu-pack` 53/0 · `vmu-resume-e2e` 90/0（12f CLOSED）· `vmu-resume-recovery` 73/0 · `audit-pack-face` 5/0 · `check-docs` PASS（issues=0）。文档：`docs/10 §4.9`。

---

## 追加二（core 落地 `control/idle` 之后）：**消费侧缺口** ＋ **`task/assign-objected` 登记**

### 1. 键名更正：**无需改动**（我写的已是真名）
`packs/v5r/settings/defaults.{json,js}` 声明的是 **`vmu.paper.finalPaper`／`vmu.paper.format`／`vmu.paper.language`／`vmu.paper.compilePdf`**（与 `vmu.paper.finalizer` 同构）；`paperFormat`／`paperLanguage`／`paperCompilePdf` 只作为 **v5r 参数名出现在注释**里。实测：defaults 探针 `undeclared=0`（43 键）、值域门禁 5/0。

### 2. `control/idle`：**STEP 1–2 通，STEP 3 做不到** ⇒ 不落半接线模块
实测（`node D:\_tmp\stall-m2-feasibility.mjs`，仓库外一次性·实测，exit 0）：
```
STEP 1 hook reaches an M2 handler: YES（handler invocations: 1）
api    : ["dryRun","hook","kernel","log","setting","traceId"]
kernel : ["read"]            ← kernel/index.js:1254-1258 的 services.kernel 只有 {read}
ctx    : {member, role, phase}  ← bus.js:594，无服务、无总线
STEP 2 can it call the meetings face?: NO
```
⇒ "静止 ⇒ 开会"要调会议面，而 M2 **够不到任何服务** ⇒ **STEP 3 无法完成**。**未落任何半接线模块**（那正是"声明了没生效"）。已请 Lead 裁一条**具名的服务访问缝**（推荐：`api.services.get(name)`，能力门控 + 未发布具名拒）；缝一落地我零改动即接：`stallDecision()`（`3 × idleAfterMs`＝**360000**，v5r `:1082/:1083`，不硬编码）＋ M2 条目 ＋ 三步探针 ＋ `docs/27` 点名。

### 3. v5r"异议广播给 voters"：**已闭合（登记 + core 的 emit + 端到端实测）**
`kernel/bus.js` 新增 **`task/assign-objected`**（`kind:'vmu'`、`failure:'open'`、**不可阻断**——异议不阻止任务执行，合 v5r 原文"任务仍会执行"；producer `kernel/tasks.js`）。`VU_HOOKS` 86→**88**、`hookRegistryProblems()` `[]`。core 随即在 `kernel/tasks.js:321` 接上 emit。
**实测**（`node D:\_tmp\assign-objected-probe.mjs`，仓库外一次性·实测，**exit 0**）：
```
objectAssign → broadcast: {attempted:true, hook:'task/assign-objected', emitted:true, middleware:0,
               audience:'the middleware decides the audience (v5r broadcast to voters; this face has no roster, …)'}
probe listener observed: 1 emission, payload {at,id,by,why,state,owner}
```
⇒ **听众由中间件决定**（R1）；v5r 的"异议广播"**可复现**。
**瞬时红已自愈**：`audit-hook-coverage` → **4/0（exit 0）**、`scripts/audit-hook-emit-classification.mjs` → **7/0（exit 0）**（登记与 emit 两侧都在，`never:["task/assign-objected"]` 消失）。

### 4. 消费侧缝（Lead 裁决 (a)）＋ pack 接线：**已闭合（三步探针 11/0）**
- **core 落的缝**：`kernel/loader.js` 的 `API_KEYS` 加 `services`；`api.services.get(name)`／`names()` **能力门控**（声明 `trigger-workflow` 才可；未声明 ⇒ `VMU_NOT_PERMITTED`；未发布 ⇒ `VMU_NO_SUCH_OBJECT` 并列清单）——**无静默 null**。
- **我落的接线**：新增 `packs/v5r/middleware/stall-meeting.js`（纯函数 `stallDecision()`：阈值＝`3 × vmu.control.idleAfterMs`＝**360000**（v5r `:1082/:1083`），**不硬编码**；M2 模块 `V5R_STALL_MEETING`：`capabilities:['trigger-workflow','record']`＋`hooks:{'control/idle': …}` ⇒ `api.services.get('vmu.meetings').open({kind:'stall'})`）；清单 `prompts/v5r-core.js` 新增 **module 形状**条目（`module: V5R_STALL_MEETING`，非 inline handler）；`docs/27` 点名新文件。
- ★ **框架侧必要修正（`kernel/pack.js`，我的卷）**：清单中间件过去**一律 `bus.add`**（只认 inline `handler`，且 handler 看不到 `api`）⇒ module 形状条目既过不了 `validatePack` 也拿不到服务缝。现改为：**inline `handler` 走原路；module 形状（`module:`／`file:`）经 `kernel/loader.js` 的 `toBusEntries()`**（校验 apiVersion/capabilities/hooks ＋ 附加 `api`）；无 loader ⇒ **具名拒** `VMU_ENGINE_UNAVAILABLE`；`validatePack` 同步接受两种形状。
- **三步探针**（`node D:\_tmp\stall-three-step.mjs`，仓库外一次性·实测，**11 passed / 0 failed，exit 0**）：**STEP 1** 真控制面报出**空闲边沿**（`emitted:true`；同一 episode **不重发**）；**STEP 2** 模块成为 `control/idle` 上**恰一条**总线条目且带 `trigger-workflow`；**STEP 3** `vmu.meetings.open()` **真被调用**（形状 `kind:'stall'`）；**反向**：130000ms < 360000ms **什么也不开**。

**本轮最终读数**：**全 0**（`vmu-pack` 53/0 · `vmu-tasks` 42/0 · defaults 探针 `undeclared=0` · 值域门禁 5/0 · `vmu-resume-e2e` 90/0 · `vmu-host-hooks` 22/0 · `vmu-bus` 44/0 · **`vmu-loader` 28/0** · **`vmu-entry` 150/0** · `audit-pack-face` 5/0 · `vmu-pack-manifest-pointers` 8/0 · `vmu-pack-fields-match-category` 14/0 · `vmu-settings` 47/0 · **`audit-hook-coverage` 4/0** · **`audit-hook-emit-classification` 7/0** · `check-docs` PASS · **三步探针 11/0**）。

## 未做项 / 待他人

1. 结论回填矩阵（"异议广播已闭合"／"静止⇒开会已闭合"／投影面名一致性／**`kernel/pack.js` 的 module 形状路由**）⇒ vmu-verify。
2. `packs/v5r/prompts/v5r-core.js` 的那一处接线落在 **vmu-assistant 的写范围**内（Lead 指派接线；我只加了 import＋条目）⇒ 已通知它，避免重复/冲突。
