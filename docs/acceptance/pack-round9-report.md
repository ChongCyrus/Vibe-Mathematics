# vmu 交接 · Round 9 · task-68 报告（pack：B1–B4 声明 · 值域门禁常态化 · stallAutoMeeting 形状）

- 任务：`task-68`（vmu-pack）· 纪律：未跑全量 sweep、未 `regen-all`、未 git；临时文件 `D:\_tmp`；**读者未落地不写默认值**、**不臆造常量**。
- 本轮**新增仓内文件**：`scripts/audit-pack-value-domain.mjs`（＋`package.json files[]` 登记）；**修改**：`packs/v3-core/index.js`（门禁抓到的一处域外值）、`docs/10 §4.6/§4.7`。

---

## A. B1–B4 的 v5r 值声明 · **未落（读者未落地 ⇒ 一行默认值都没写）**

**实测（本轮开始时的 schema 检查）**：下面 8 个键**一个都还没进 `settings/schema.js`** ⇒ 按纪律**不写默认值**（写了就是"声明了没人读"）：

| # | 拟声明键 | v5r 值（出处） | 读点要求 |
|---|---|---|---|
| A1 | `vmu.prompt.compactThreshold`／`compactAfterRounds` | **66**／**8**（`vibe-math-v5r.js:1078/1079`） | 上下文核算/压缩决策处 |
| A2 | `vmu.paper.finalPaper`／`format`／`language`／`compilePdf` | **true**／**'both'**／**'zh'**／**true**（`:1163-1166`） | `kernel/publication.js` 的终稿/编译路径 |
| A3 | `vmu.members.maxTempPerMember` | **3**（`:1075`） | `kernel/members.js`／`recruit.js` 的临时工编制检查 |
| A4 | `vmu.tasks.memberMayRejectAssign` | **true**（`:1066`） | `kernel/tasks.js` 的 assign 路径 |

**改判条件（可红）**：core 落"键＋真读点"后，我按上表值在 `packs/v5r/settings/defaults.{json,js}` 各加一行（带 v5r 出处注释），复跑 `vmu-pack-defaults-vs-schema.mjs`（`undeclared` 必须仍为 0）＋ `vmu-pack` ＋ 新增的 `audit-pack-value-domain`。**值本身已核（v5r `DEFAULT_PARAMS` 原文），不是猜的。**

## B. 值域门禁常态化 · **已落（仓内 ＋ 双登记 ＋ 自探针）**

- **仓内文件**：`scripts/audit-pack-value-domain.mjs`（D-05）；已在 `package.json` 的 `files[]` 登记（`scripts/**` 按 D-05 修订口径只登记 files[]；锚点插在 `scripts/audit-hook-emit-classification.mjs` 之后）。**仓库外那份已删**。
- **三段判据**：
  1. **§1 静态**：从**真模块**读全部 pack 声明（各 pack 的 `index.js` 导出：`PACK.settings`／`V5R_SETTING_DEFAULTS`／`V5R_PACK.defaults`，＋ `packs/*/settings/defaults.json`），逐个对照 `settings/schema.js` 的 **108 个 enum 域**；另对"schema 是自由 `string`、读者有闭集"的键（当前 1 个：`vmu.paper.finalizer` → `kernel/paper.js` 的 `FINALIZERS`）同样校验。
  2. **§2 实测（这一类缺陷的正面守卫）**：给 `vmu.paper.finalizer` 注入一个**域外值**，走**真面**（`createPaper().start()`）⇒ 必须**具名拒**（`VMU_INVALID_ARGUMENT` 且回执列出 `declared`）。静默降级 ⇒ 红。
  3. **§3 自探针**：把**种下的域外值**喂给检查器 ⇒ **必须报红**（否则门禁空洞，本次判失败）；并验证**域内值不误报**（防"永远红"）。
- **读数**：`node scripts/audit-pack-value-domain.mjs` → **5 passed / 0 failed**（exit 0）；`--selftest` → **3 passed / 0 failed**（exit 0）。

### ★ 门禁上岗第一天就抓到**第二个真实例**（已修）
`packs/v3-core/index.js:44` 曾声明 `'vmu.meetings.quorumRule': 'majority'`，而 schema 域＝`['m-unanimous','all-unanimous']` ⇒ **域外**。后果与 `finalizer` 同类：
- `vibe_vmu_set` 会具名拒它，但 **pack 值绕过设置边界**；
- 该键经 `kernel/index.js:1401` 传给 `createBallot`，而 `ballot.js` 的默认 tally 把它当**上下文标签**（`detail.rule`）记录，**并不按 "majority" 聚合** ⇒ 这条声明做不到它写的事。
**已改为 `'m-unanimous'`**。改后门禁 §1 转绿。

### ★ 追加（Lead 轮 9 裁决＋E-17(乙) 的红）：两件事
1. **"真多数聚合"＝【能力】＋改判条件，不是缺口**：框架**已提供可插拔接缝**（R1：`createBallot` 的 `tally` 谓词），缺的只是**某个具体聚合实现**——而"某机构用什么聚合"按哲学**本就该由 pack／中间件提供，不进内核**。⇒ `m-unanimous` 下计票**自洽**，v3 的"独立判定再聚合"以 m-unanimous 近似即可；真要 `majority` 由 pack 注入 `tally`（≈60 行＋断言）**单独排期**。★ **不把 `quorumRule` 做成"聚合算法注册表"**。
2. **`vmu-entry` E-17(乙) 的红：根因是我的改动，但修法在测试的观测量（已交 verify）**。探针 `node D:\_tmp\e17-order-probe.mjs`（仓库外一次性·实测）：
   - 甲 `[institute-min, v3-core]` ＋ `allowKernelOverride:true` → `errors=[]`、两包都应用、`verdictRounds=5`；
   - 乙 `[v3-core, institute-min]` ＋ 同声明 → `errors=[]`、两包都应用、`verdictRounds=3`；
   - `off` 无声明 → `errors=1`（`VMU_PACK_CONFLICT` 并**点名** `verdictMaxRounds`/`quorumRule`）、只应用 `institute-min`。
   ⇒ **入口侧重叠语义是对的**（Lead 已确认）；测试里那句 `VMU_PACK_CONFLICT` 来自**故意**跑的 `off` 档（断言 `errors.length===1`），同时打到 stderr，易被误读成失败原因。
   **失败真因**：E-17(乙) 用 **`vmu.meetings.quorumRule`** 观测"顺序决定重叠值"，而两包现在**都声明 `'m-unanimous'`** ⇒ `!==` 永不成立。它以前能过**只因 v3-core 当时写了域外值 `'majority'`** ⇒ **不许为让断言变绿把非法值写回去**（Lead 确认）。**修法（已交 verify）**：观测量改用两包**确实分歧**的 `vmu.meetings.verdictMaxRounds`（v3-core 5／institute-min 3），其余三档不动，并加注释。
   **通用教训**（Lead 已转 verify 写进 `docs/11`）：**断言所选观测量必须在被测两档之间真的不同**，否则是**语义级空过**，语法级门禁看不见。

## C. `stallAutoMeetingMs` 的最终形状 · **具名保留（core 未落 `control/idle`）**

- **实测**：`grep -rn "control/idle" vibe-math-vmu/kernel` → **0 命中** ⇒ 钩子未落 ⇒ 按任务口径**具名保留**，不写任何声明。
- **为什么不能"直接声明成 `'auto-meeting'`"**：`vmu.control.idleAction` 的域是 `['notice','recess','none']`（`settings/schema.js:787`），且 `kernel/control.js:204-220` 的 `idleState()` **永远 `recessed:false`**（该面结构上不能开会）。域外值同样会被静默回落 ⇒ **写它就是制造下一个"声明了没生效"**（现在会被 §1 门禁抓住）。
- **改判条件（唯一不违反 R1 又能复现 v5r 的形状）**：core 落一个**已登记钩子 `control/idle`**（`idleState()` 判为 idle 时 emit）⇒ 我在 `packs/v5r/middleware/` 加一个 M2 中间件：收到 `control/idle` ⇒ 调用会议面开会，阈值用 **360000**（v5r `:1083`），并配断言/探针（"静止 360s ⇒ 触发一次开会；未静止 ⇒ 不触发"）。**未落之前一行不写。**

## D. 文档 · 已同步

- `docs/10 §4.6`：把 finalizer 修法标为 **core 已落**（`schema.js` enum ＋ `paper.js:114-115` 具名拒），并写实测回执形状。
- `docs/10 §4.7`（新）：**值域门禁**的口径、三段判据、读数，以及**v3-core 那个真实例**的处置（含"真多数聚合是 R1 谓词"的改判条件）。
- `docs/27`：**未改**（本轮无 pack 内新文件；门禁是 `scripts/**`，`audit-pack-face` 5/0 仍绿）。

---

## 验证（原样命令 + 退出码）

工作目录 `Vibe-Mathematics`。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node scripts/audit-pack-value-domain.mjs` | 0 | **5 passed, 0 failed**（§1 130 处声明全在域内／§2 域外值具名拒／§3 自探针非空洞） |
| `node scripts/audit-pack-value-domain.mjs --selftest` | 0 | **3 passed, 0 failed**（种下域外值必报红；域内值不误报） |
| `node scripts/audit-hook-emit-classification.mjs` | 0 | 7 passed, 0 failed（R4 的仓内门禁仍绿） |
| `node tests/vmu-pack.test.mjs` | 0 | 53 passed, 0 failed |
| `node tests/vmu-pack-fields-match-category.test.mjs` | 0 | 14 passed；packs=3 refusals=0 misplaced=0 |
| `node tests/audit-pack-face.test.mjs` | 0 | 5 passed, 0 failed |
| `node tests/vmu-settings.test.mjs` | 0 | 47 passed, 0 failed |
| `node tests/vmu-planned-settings.test.mjs` | 0 | **ALL GREEN（planned=113, docs=27, 39/0）** |
| `node -e "JSON.parse(fs.readFileSync('package.json'))"` | 0 | `package.json` 解析通过（登记未破坏文件） |

## 未做项 / 待他人

1. **A1–A4 的键＋读点** ⇒ vmu-core；落地后我按 v5r 值（66／8／true／both／zh／true／3／true）声明并复跑三件套探针。
2. **`control/idle` 钩子** ⇒ vmu-core；落地后我加 M2 中间件（阈值 360000，v5r `:1083`）＋断言。
3. **v3-core 的"真多数聚合"**（若 Lead 要）：需 pack 注入 `createBallot` 的 `tally` 谓词——属功能新增，等裁决。
4. 结论回填矩阵 §9.5／§10.9 ⇒ vmu-verify（依据＝本报告 §A–§C）。
