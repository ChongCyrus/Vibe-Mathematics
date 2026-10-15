# Round 3 · task-20 · 内核收尾（P0–P5 · F1–F5 · activity · fidelity）

- 状态：**P0–P5、F1–F5、task-24（activity）、task-19（fidelity）、reader-c 的两处装配全部落地并验证**；唯一剩余红在 `tests/vmu-entry.test.mjs`，根因是**测试的同步读**（补丁已给 Lead 转 verify，见"未做项"）。
- 纪律：未跑全量 sweep、未 `regen-all`、未 git；内容型改写只用 Node；探针在 `D:\_tmp`。

## P0 · 入口 TDZ（阻断项）
`kernel/index.js`：`meetings` 的晚绑定 Proxy 改读**持有者对象** `meetingsRef.current`（`const meetingsRef = { current: null }`；`meetingsRef.current = createMeetings(…)` + `const meetings = meetingsRef.current`）⇒ 不再有早于初始化的 `const` 访问；attach 循环移到所有面构造之后（`attachDeclaredProjections()`，调用点在审批闸块之后）。
实测：`entry.apply(minimalCtx, {clock})` **不抛**；`await ready()` 后 `specs=["vibe_vmu_status"]`。

## P1 · tasks 适配器的 replay 传参 bug
删掉自定义 `replay`（reader-a 的 `replaySeam` 用 `fn.apply(target, entry.args)` 正确展开），不再有 `create([{title}])` 形状错误。

## P2 · 八行 state 适配器
`members／meetings／ballotbox／minutes／chat／panel` 已加（＋既有 `tasks`／`work`）；`meeting`／`ballot`（每场/每板工厂，无单一活实例）、`budget`（无公共 snapshot/restore 对）、`mailbox`（有 snapshot 无 restore）**具名不挂**。
实测：`attached=["human","meetings","ballotbox","minutes","chat","panel","tasks"]`；`members` 因该装配无花名册而 `notAttached`（理由 `attachProjection needs a target object`）。

## P3 / F1 · pack 清单声明 ⇒ 工具面必须发布（修根因）
`createHostAdapter` 改拿 **`kernel.settingsView()`**（fake kernel 回退部署 settings）。pack **清单**（`packs/v5r/v5r-core.js:101-102`）在 `applyPackSettings` 之后对**下一次 install** 可见，入口本就在 pack 之后 `await adapter.install()`。
**可执行定义实测**：`before=["vibe_vmu_status"]` → `applyPackSettings({'vmu.report.enabled':true})` → `install()` → `after=["vibe_vmu_status","vibe_vmu_report"]`；零声明仍恰 1 个 ✓。

## P4 / F2 · `deliver` 缝
入口放行 `config.deliver`（边界写明：宿主提供投递函数，不猜 report/member 信封；无它时缝缺席、`VMU_REPORT_NO_TRANSPORT` 仍是诚实答案）。实测 `no deliver => false`／`config.deliver => true`。

## P4 / F3 · 回执不许低报也不许高报
模块级 `LIVE_READERS`（`vmu.prompts.／vmu.report.／vmu.resume.／vmu.ids.／vmu.turn.`）+ `liveReadersOf(key)`；`requiresRestart = hot === 'H2' && liveReadBy.length === 0`；`appliesAt` 在"H2＋有活读者"时改为 `this session for the measured live readers (…); declared class H2 …`；`status().settings.liveReaders` **真发布**。
实测 `vmu.turn.instituteName`：`hot=H2, requiresRestart=false, appliesAt="this session for the measured live readers…"`。

## F4 · C-30 豁免默认值
`vmu.paper.officeConsultExemptRoles` 默认 `['office']` → **`[]`**（doc 写明"默认不豁免任何人；部署可显式加角色"），与 v5r 原场景（office 自己定稿也要先咨询）一致。

## F5 · pack-only 装载时宿主周期时钟不挂（与 F1 同型）
构造期 `reportDeclared` → **`attachReportTick()`**，判据改为 F1 的产物（`adapter.status().registered` 含 `vibe_vmu_report`），在**初始 install 之后**＋**pack 装载之后**＋**M2 模块装载之后**各重判一次（幂等）。门控语义保留：无声明 ⇒ 面不发布 ⇒ 不挂监听器。
实测：`UNDECLARED: listeners=[] specs=1`；`DECLARED: turn-stopping listeners=1 reportToolPublished=true`。

## task-24 · `vmu.activity` / `vibe_vmu_wait`
`TOOL_NAMES.activity`、`TOOL_FACES` 行（`vmu.activity.`）、import＋dispatch；`kernel/index.js` 的 import／`createActivity({clock, log, settings, bus, activePeers})`／注册／`get activity()`／`status().activity`；`settings/schema.js` 7 键（`wakeOn` **H2**）。
**两处按内核惯例调整**（已告知作者）：① 不传 `timer`（保持"省略 ⇒ 平台定时器"）；② 传 **RAW clock**（`activity.status()` 读钟，guardedClock 遇 ISO 字符串钟会让 `kernel.status()` 崩）。

## task-19 · `vmu.fidelity` / `vibe_vmu_fidelity`
`tools/fidelity.js`（我写，6 动作 one-for-one；`by` 必填在工具层具名拒）；`TOOL_NAMES.fidelity`、`TOOL_FACES` 行（**`families: []`**、`extraIntent` 要求 `vmu.math.formalVerify ∈ {encourage,require}`）；`kernel/index.js` 的 import／`createFidelityRegistry({clock, log, bus, fs})`／注册／`get fidelity()`；**零设置键**（强制不可配置）。
实测：`faces=54`；零声明 ⇒ 恰 1 个工具；`formalVerify=require` ⇒ `["vibe_vmu_status","vibe_vmu_mathtools","vibe_vmu_fidelity"]`。

## reader-c 的两处装配（task-17）
- `createMinutes({ …, meeting: meetingsSeam, meetings: meetingsSeam })`（两种拼写都给，任一侧都不必猜）；
- `createBallot({ …, fidelity })` —— **C-45 唯一强制点**接上；实测 `ballot().status().fidelitySeam === true`。

## 一处我自己的真错（已修，留证）
追加 activity／fidelity 注册时我**用"替换"而不是"追加"**，先后覆盖掉 `vmu.panel` 与 `vmu.activity` 的注册行 ⇒ 出现"有工厂、有工具面、有键、却没进注册表"的服务（D-01 禁止的静默不可达）。现三行齐备并留注释；实测 `panel=true activity=true fidelity=true`。

## P5 · 文档同步
- `docs/03 §8`：登记 **R3 全部新码**（`VMU_MATH_JOB_ID_TAKEN`／`VMU_MEETING_TIER_CONFLICT`／`VMU_OFFICE_CONSULT_REQUIRED`／`VMU_MEETING_LIGHT_NO_TRUTH`／`VMU_ACTIVITY_*` 11 个）；
- `docs/03 §2`：服务实数 77 → **79**（口径＝静态注册点数，与 `audit-doc-vs-code-tables` 一致）；
- `docs/03 §3.1`：补 `vibe_vmu_wait`／`vibe_vmu_fidelity` 两行；
- `docs/18 §1`：标题 52 → **54**，表补两行；
- `docs/04 §11`：单文件重生成（1218 键）。

## 验证（原样命令 + 退出码）
```
node --check host.js / kernel/index.js / host-math.js / tools/fidelity.js / settings/schema.js / vibe-math-vmu.js → 全 0
node scripts/generate-wired-schema.mjs              → INVARIANTS ok: 333 emitted, 772 pre-existing   exit=0
node scripts/generate-vmu-settings-table.mjs --write → 1218 keys rewritten（单文件 docs/04）        exit=0
node scripts/check-docs.mjs                         → DOC LINT: PASS        exit=0
node tests/audit-vmu-docs.test.mjs                  → 83 passed, 0 failed   exit=0
node tests/audit-doc-vs-code-tables.test.mjs        → 17 passed, 0 failed   exit=0
node tests/audit-tool-table.test.mjs                → 7 passed, 0 failed    exit=0
node tests/audit-service-coverage.test.mjs          → 5 passed, 0 failed    exit=0
node tests/vmu-kernel.test.mjs                      → 175 passed, 0 failed  exit=0
node tests/vmu-host.test.mjs                        → 103 passed, 0 failed  exit=0
node tests/vmu-seam-params-consumed.test.mjs        → 8 passed, 0 failed    exit=0
node tests/vmu-tools-filter.test.mjs                → 9 passed, 0 failed    exit=0
node tests/vmu-idempotency.test.mjs                 → 252 passed, 0 failed  exit=0
node tests/vmu-ballot.test.mjs / vmu-minutes / vmu-meetings → 41/0, 20/0, 161/0   exit=0
SETTING_DEFS 自检（Node 导入）：defs=1218 dup=[]
```
**唯一红**：`node tests/vmu-entry.test.mjs` → exit 1（`TypeError: handlers[0] is not a function`；TDZ 守卫读 `state.specs` 为空）。**根因是测试的同步读**：`install()` 走 `chain.then(...)` 微任务，F5 的监听器又必须在 install 之后挂（判据就是注册列表）⇒ 同步时点必然为空。**补丁**：`entry.apply(...)` 之后加 `await <handle>.ready()` 再断言 `state.specs` / `state.listeners['agent/turn-stopping']`（`tests/**` 属 vmu-verify）。

## 未做项
1. **`tests/vmu-entry.test.mjs` 的 await 补丁**（属 verify；两处精确位置已报 Lead）。
2. **C-30 判定点**（`kernel/paper.js` 定稿路径读 5 键并抛 `VMU_OFFICE_CONSULT_REQUIRED`）——不在我写范围（Lead 划给 vmu-assistant）；vmu-pack 因此**暂不写 pack 默认值**。
3. `vmu.fidelity` 的**真读者接点**（`ballotbox`/`minutes` 调 `applyAbstention`）：`ballot.cast()` 已接（reader-c 落）；`ballotbox`/`minutes` 侧由 reader-c 落。
4. `resume.setPhase()` 在 `pause/resume/stop/start` 四处仍未接（reader-a 的 task-18 第 3 项；现状 `phase` 投影空、`present:false`，不报错不假装）。
5. `docs/04` 键表里 `vmu.meetings` 的实数（58 声明／53 wired）由 reader-c 提供、Lead 的 regen 覆盖生成块。
