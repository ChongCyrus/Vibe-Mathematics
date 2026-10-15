# Round 2 · task-14 · 内核管线（接线 / 设置 / 工具面 / 入口 / 文档实数）

- 状态：**已停写**（Lead 冻结令期间未再改仓库内文件）。本报告在仓库外，按 Lead 授权补写。
- 纪律：未跑全量 sweep、未 `regen-all`、未 git；临时文件在 `D:\_tmp\vmu-r2\`。

## 一、七个新服务的接线（服务名 / 工具名 / 意图键 / file:line）

| 面 | 服务键（`registry.register`，`kernel/index.js`） | 工具名（`host.js` TOOL_NAMES） | 意图键（`TOOL_FACES` 行） | 工厂装配（`kernel/index.js`） |
|---|---|---|---|---|
| id 铸造 | `vmu.ids` | —（无工具面，纯内部原语） | — | `bindIds({ store, clock, log, bus:null, settings: settingsView })`（**RAW clock**：`ids.status()` 会读时钟，guardedClock 拒绝 ISO 字符串钟 ⇒ 曾把 `kernel.status()` 带崩） |
| 断点续跑 | `vmu.resume` | `vibe_vmu_human`（与审批闸共用一面，按 Lead task-10 原文） | `families:['vmu.human.','vmu.resume.']`, `config:['human','resume']` | `createResume({ store, work: workLedger, control, identity, settings, bus, clock: guardedClock, log, faces:{} })` |
| 群聊 | `vmu.chat` | `vibe_vmu_chat` | `families:['vmu.chat.']`, `config:['chat']` | `createChat({ clock: guardedClock, log, settings, bus })`（冻结/管理员走模块的**文档化默认**，未伪造冻结源） |
| 私信 | `vmu.mailbox` | `vibe_vmu_mailbox` | `families:['vmu.mailbox.']`, `config:['mailbox']` | `createMailbox({ clock, log, settings, bus, store, deliver, resolveAudience })`：`to:'all'` ⇒ 真花名册；`to:'voters'` **具名拒**（本装配无 ballot 上下文，不猜名单） |
| 状态面板 | `vmu.panel` | `vibe_vmu_panel` | `families:['vmu.panel.']`, `config:['panel']` | `createPanel({ clock, log, settings, bus, members })` |
| 自动汇报 | `vmu.report` | `vibe_vmu_report` | `families:['vmu.report.']`, `config:['report']` | `createReport({ settings, clock, log, deliver, audit, describeSetting: settingDescription })`（**RAW clock**：构造期读时钟，见下"崩溃修复"） |
| 数学库适配 | `vmu.mathadapters` | `vibe_vmu_mathadapters`（**单开一面**，Lead 裁决 B） | `families:['vmu.math.adapters.']`, `config:['mathadapters']` | `createMathAdapters({ settings, clock: guardedClock, log, bus, spawn, resolveExecutable, root })` |
| 数学作业（既有服务，新面） | `vmu.mathjobs`（Round 1 已有） | `vibe_vmu_mathjobs`（**单开一面**） | `families:['vmu.math.jobs.']`, `config:['mathjobs']` | `createMathJobs({ …, fs, root })` + **显式** `mathjobs.recover()`（`vmu.math.jobs.recover==='on-load'` 时，best-effort 不阻塞构造 —— reader-b 的修正 1） |

**为什么数学适配/作业各自开面**：`vibe_vmu_mathtools` 的强契约是「action 枚举 **恰好等于** `kernel.mathtools` 方法集」；把属于另外两个服务的 9 个动作塞进去会破坏一一对应。Lead 裁决 B ⇒ 单开两面，`tools/mathtools.js` 与 `tests/vmu-mathtools-tool.test.mjs` **一行未动**。

**`tools/control.js` 的 `tune`**：按同一规则判 —— `tune` 是 `vmu.control` **自己的**方法（`kernel/control.js:132`）⇒ 扩枚举同时扩服务方法集，一一对应仍成立（该工具的两套测试 `vmu-control-roster 12/0`、`vmu-explain-control-citations 66/0` 均无精确枚举断言，未改测试）。目标服务经 **`kernel.controlService`** 取（`kernel.control` 自 Round 1 起是控制**视图函数**，同名字段后定义者胜 —— 实测 `typeof kernel.control === 'function'`，故新开 `controlService`）。

## 二、接口实数（本轮实测，写进 docs/02/03/18）

| 项 | 轮 1 | 轮 2 | 证据 |
|---|---|---|---|
| 工具面 | 45 | **52** | `TOOL_FACES.length === 52 === Object.keys(TOOL_NAMES).length` |
| 服务 | 70 | **77** | `registry.status().services` 去重计数（`kernel/index.js` 的 `registry.register` 调用点） |
| kernel 模块 | 84 | **91** | `kernel/**/*.js` 计数（新增 ids/resume/chat/mailbox/panel/report/mathadapters） |
| 耐久公开键 | 11 | **17** | `PUBLIC_KEYS`：+`idempotency`(轮1) +`mailbox` +`resume` +`ids` +`chat` +`panel` |
| Round 2 设置键 | — | **49** | `settings/schema.js` 的 `// ---- ROUND 2 (task-14` 块：chat 6／mailbox 6／panel 4／resume 5／human 5／control 2／math.adapters 7／math.jobs 2／report 11／ids 1 |
| 错误码登记 | — | **+45 行** | `docs/03 §8` 的 `R2 ·` 行（四个面接线单逐条；含 reader-a 的 delta、reader-b 的 `VMU_LEAN_JOBS_*`） |

## 三、入口装配（`vibe-math-vmu.js`）

1. **启动链**：`store.open()` → `hydrateIds()`（id 计数器读回）→ `kernel.recovery.recover({ reason:'kernel-start' })`（`vmu.resume.autoRecover!==false`）。三步各自独立 promise，失败逐条具名上报；`ready()` 现在 **等待它们**（`idsHydrated`/`resumed` 也暴露在句柄上）。
2. **投影装配**：`vmu.resume.projections` 声明的面在装配期逐个 `resume.attachProjection({ target, methods, key, mode, list, replay })`；有 `list()` 的面走 `journal`（重放公共方法 ⇒ 真实计数器推进到 max+1 ⇒ **id 不复用**）。无适配器的面进 `status().projections.notAttached`（**具名理由**），绝不假装恢复。当前实际 attached 的是声明了的 `tasks`/`work`；`members`/`meetings`/`ballots`/`budget`/`phase`/`chat`/`panel` 等 `snapshot/restore` 缝落地后即可挂（reader-a 已把 `chat`/`panel` 加进 `PROJECTION_KEYS`，我加了白名单键）。
3. **审批闸**：`attachApprovalGate` 包 `vmu.tasks`（7 方法）／`vmu.ballotbox`（6）／`vmu.meetings`（6），只包**真实存在**的方法（`gateMethods` 过滤，`missing` 进 `status().approvalGate`）；`createControl({ approval })` 让 `mayAct` 也成为闸门。被闸动作**不执行**、只排队。
4. **`agent/turn-stopping` → `report.tick`**：**已接线**（`vibe-math-vmu.js:445-454`，在**入口**的 effect 里，未动 vmu-pack 的 `host-hooks.js`）。⚠ 诚实边界：该监听器在**内核启用时**即挂载，而 `vmu.report.*` 无声明时 `report.tick()` 是 no-op（`reporting.enabled:false`）——"零机制"在**工具面**上仍严格（恰 1 个工具 ✓），但**宿主监听器**这一层不是"完全不可见"。若要求严格惰性，下一轮把该 effect 用声明门控（一行）。
5. **root 人设**：读 `packs/<id>/prompts/assistant.json` 的 `hostPrompt:true` 节 → 进 `effectivePrompts` → `ctx.systemPrompt.section({name:'vmu'})`（**不动** `prompts/sections.json`，保住 corpus 边界测试）。

## 四、id 不可复用（Lead 追加项）

- **统一原语**：reader-a 的 `kernel/ids.js`（`mint(kind, prefix)` / `observeIds` / `bindIds` / `hydrateIds`），计数器落 `ids` 键，取 `max(耐久, 已观测, 进程内)+1`，**绝不回退到 0**。
- **模块侧替换（我）**：**35 处 / 22 文件** —— 我名下 19 个（`arbitration, charter, citations, course, custody, delegation, explain, grant, ip, memory, notify, paper, publication, records, repropack, resource, scheduler, skills, trust`）+ 无主的 3 个（`collab, governance, recruit`）。全部 `node --check` exit 0；kind 表见 `D:\_tmp\vmu-r2\replace-id-minters*.js`。
- **有意不改（具名）**：`tasks.js`（reader-a 的写范围，**每实例** seq 有 A/B harness 依赖，改用 `snapshot/restore` + `observeIds` 兜底）、`ballotbox/formal/human/lean/mathjobs/mathadapters/report`（各自作者本轮在自己文件里替换）、`work.js:85`（已持久化，范式）、`reviews.js:94`（派生 id，Lead 已同意不改）、**数值型序号** `audit.js:126 const seqNo = ++seq`／`crypto.js:116 seq: ++seq`／`publication.js:262 sequence: ++seq`（**不是字符串 id**：审计链与签名信封的数值语义会被 `mint()` 的字符串破坏 ⇒ 需各自的"数值计数器水合"，不是本原语的适用范围 —— 已具名留待下一轮）。
- 装配点：`bindIds` 在**任何服务构造之前**（`kernel/index.js`，bus 之后）；`hydrateIds()` 在 `store.open()` 之后（入口）。

## 五、我修掉的两个工作区级崩溃（都曾让全队 T1 红）

1. **构造期 TDZ**：我接审批闸时把 `attach(... ballotbox ...)` 放在 `const ballotbox = createBallotBox(...)` **之前** ⇒ `ReferenceError: Cannot access 'ballotbox' before initialization`（任何 `createKernel` 都抛）。已把整块移到 `const records = …` 之后并留注释。
2. **`createReport` 构造期读时钟**：我把 `guardedClock` 传给它，而它构造期就调 `clock()`，clockguard 拒绝 ISO 字符串钟 ⇒ 进程崩溃（`vmu-kernel`/`vmu-entry`）。已改传 **RAW `clock`**（与 `bindIds` 同一处理），并建议 vmu-assistant 把构造期读时钟延后。

## 六、验证（原样命令 + 退出码）

```
node D:/_tmp/vmu-r2/faces-invariant.mjs       → TOTAL pass=13 fail=0        exit=0   （50→52 面的双向一致性/可达性/红线）
node D:/_tmp/vmu-r2/round2-verify.mjs         → TOTAL pass=47 fail=0        exit=0   （7 服务/7 面/枚举动作全部可派发/红线/status 自曝）
node tests/vmu-kernel.test.mjs                → 174 passed, 0 failed        exit=0
node tests/vmu-host.test.mjs                  → 103 passed, 0 failed        exit=0
node tests/vmu-entry.test.mjs                 → 141 passed, 0 failed        exit=0
node tests/vmu-seam-params-consumed.test.mjs  → 8 passed, 0 failed          exit=0
node tests/vmu-mathtools-tool.test.mjs        → 14 passed, 0 failed         exit=0   （未改，契约保持）
node tests/vmu-tools-filter.test.mjs          → 9 passed, 0 failed          exit=0
node tests/vmu-turn.test.mjs                  → 145 passed, 0 failed        exit=0
node tests/vmu-idempotency.test.mjs           → 252 passed, 0 failed        exit=0
node tests/vmu-mathjobs.test.mjs              → 10 passed, 0 failed         exit=0
node tests/vmu-control-roster.test.mjs        → 12 passed, 0 failed         exit=0   （+tune）
node tests/vmu-explain-control-citations.test.mjs → 66 passed, 0 failed     exit=0
node tests/vmu-chat.test.mjs / vmu-mailbox / vmu-panel                        exit=0
node scripts/check-docs.mjs                   → DOC LINT: PASS              exit=0
node tests/audit-doc-vs-code-tables.test.mjs  → 17 passed, 0 failed         exit=0
node scripts/generate-vmu-settings-table.mjs --write → 1203 keys rewritten  exit=0   （单文件 docs/04，属我范围）
```

## 七、未做项 / 遗留（下一轮）

1. **`vmu.math.maxParallel` 与 `vmu.math.jobs.maxParallel` 真正收敛**（Lead 裁决：本轮只写明语义与方向）。现状：语义相同（数学作业并发上限），读者不同 —— `kernel/mathjobs.js:195` 读前者、`kernel/mathtools.js:194/565` 读后者。方向：以前者为唯一真源；两个读点都在 reader-b 的文件里，未擅自改。
2. **`agent/turn-stopping` 监听的严格惰性**：见 §三.4（需要时一行声明门控）。
3. **`docs/08:1366` 的 `vibe_vmu_grant` 未标"未实现"**（reader-c/verify）与 **25 个新钩子被判"未 emit"**（门禁扫描形状 vs 本地 `emit(...)`/`say({type})` 助手，verify 侧修）—— 两条都不是我名下文件，已报 Lead。
4. **`docs/04 §11` 之外的生成块**（docs/02 kernel-index、docs/05 hook-index、docs/18 tool-index、docs/00 wiring-index）需 Lead 的 `regen-all` 统一重生成（跨人文件，按 D-07 不由我跑）。`docs/02` 的模块实数/`docs/18` 工具实数我已手写同步，生成块由 regen 覆盖。
5. **`id` 数值型序号**（audit/crypto/publication 三处）与 **`reviews.js:94` 派生 id**：具名未改，理由见 §四。
6. **`kernel/prompt/index.js` 的 H1 惰性读取**（D-13）归 vmu-pack，本轮由它落地；我不再动该文件。
7. **`_oneoff`/驱动/双登记**（`package.json#files` + `installer.js`）归 vmu-verify（7 个新 kernel 模块 + 7 个新 tools 文件 + `packs/v5r/prompts/assistant.json`）。
