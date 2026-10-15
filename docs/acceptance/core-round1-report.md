# Round 1 · 目标0 · 内核/宿主面断线修复（task-4 · vmu-core）

- 裁决依据：`_handoff/vmu/00-decisions.md`（D-01／D-02 入口侧／D-05／D-07）。基线证据：`_handoff/vmu/core-baseline.md`。
- 状态：**K1–K6 全部落地并验证**；P6（声明驱动 pack runtime）与 vmu-pack 的接口请求（settingSource／onPromptPolicy／composePromptPolicies）一并落地。
- 纪律：未跑全量 sweep、未跑 `regen-all.mjs`／`update-doc-counts --write`、未 commit/push；临时文件在 `D:\_tmp\vmu-r1\`。
- **过程事故（如实报备）**：中途用 PowerShell 文本管道做批量替换，把 `host.js` 的 UTF-8 中文双重编码损坏。已用 `git show HEAD:...`（只读）取回原始字节并 `copy` 覆盖，**随后用编辑工具／Node 脚本重做全部 K1 改动**；`host.js` 现为有效 UTF-8（`chinese-ok=true no-FFFD=true`），`node --check` exit 0。教训：**内容型批量改写只用 Node／编辑工具，不用 PowerShell 文本管道**。

## 一、逐项交付

### K1 工具面可达性（最高优先 · D-01）
改了什么：
1. `vibe-math-vmu/host.js`：新增**唯一映射表** `TOOL_FACES`（45 行，每行给出 `face／name／families／config／always／extraIntent／surface`）、`FACE_KEYS`、`faceKeyOf()`、`resolveFaces()`（单一解析：`vmu.tools.faces` → `config.faces` → `config.<face>` → `vmu.<族>.*` → 少数面的特有条件；再按 `vmu.core.facesDisabled` 具名关闭，按 `surface` 报"声明了但不可用"）。
2. `host.js` `toolSpecs()`：签名改为 `config/faces/...faceFlags`（旧 `<face>Tool` 布尔仍接受），**45 个 gate 全部改为 `on('<face>')`**（39 处机械替换 + 6 处内联面）。
3. `host.js` `createHostAdapter()`：接收 `config` + `faces` + `...faceFlags`，**解析一次**并传给 `toolSpecs`（`plan()` 与 `install()` 不可能不一致）；`plan()/status()` 回报 `faces.{enabled,disabled,unavailable,unknownDisabled,sources}`。
4. `vibe-math-vmu.js`：把 `config` 交给适配器（不再自己拼 4 个布尔）。
5. `settings/schema.js`：新增 `vmu.tools.faces`（H1）与 `vmu.core.facesDisabled`（H1）。
验收（探针 + 单测，全部实测）：
- 无声明 ⇒ **恰好 1 个工具**（`vibe_vmu_status`）✓
- `vmu.tools.faces:['*']` ⇒ `resolveFaces` 解析 **45/45**；`toolSpecs` **构建 45/45** ✓
- **真实入口** `entry.apply(ctx, { root, packs:['institute-min'], scripts:[…], 'vmu.tools.faces':['*'] })` ⇒ **注册 45 个工具** ✓
- `vmu.<族>.*`／`config.<face>`／工具名三种声明各自点亮对应面 ✓
- `facesDisabled: ['minutes','vibe_vmu_board','no-such-face']` ⇒ 前两者进 `disabled`（`VMU_NOT_PERMITTED`），错名进 `unknownDisabled` ✓
- `records` 声明但无 root ⇒ 进 `unavailable`（`VMU_ENGINE_UNAVAILABLE` + 原因）✓

### K2 幂等台账耐久键
- `kernel/store.js` `PUBLIC_KEYS` 补 `'idempotency'`（附测量说明）。
- `kernel/idempotency.js` `persist()`：**追踪 `store.patch` 的 promise**（原代码发出即弃 ⇒ 被拒的写变成 unhandled rejection，`durable:true` 可在写落盘前就报出）。
- **Lead 裁决 ④ 已落地（诚实回执，保持同步 API）**：`lastPatchOk` 与 `durableReason` **只由 promise 的 settle 决定**；在飞期间回执为 `durable:false + pending:true + writeInFlight:N`（原因写明"write IN FLIGHT…"）；新增 **`whenDurable()`**（聚合所有已发出且未 settle 的写，含等待期间新发的，返回与 `durable()` 同形的事实）；`durable()`／`status()` 均带 `pending`／`writeInFlight`。`begin/commit/abort/persist` 仍是同步返回，调用面未变。
- `docs/03 §6` 公开键清单补 `work`／`idempotency`。
验收：
- `node D:/_tmp/vmu-r1/probe.mjs`（真 store）⇒ 在飞 `durable:false+pending:true` ✓、`await whenDurable()` 后 `durable:true` ✓、投影**在盘上** ✓、新实例读回 committed ✓
- `node tests/vmu-idempotency.test.mjs` ⇒ **252 passed, 0 failed**（原 8 条改为新契约、**覆盖面未缩水**，并新增 3 条：在飞不早报 durable、`persist()` 回执为 in-flight、`whenDurable()` 聚合后转真 ✓）

### K3 轮次投递缝（能力进内核、装配在宿主）
- `kernel/index.js`：新增 `deliverTurn` 选项，`turnDeliverSeam` **解析一次**（`deliverTurn` > 兼容 `host.deliverTurn` > null），交给 `createTurnOrchestrator`；`status().seams` 新增 `turnDeliver／turnDeliverSource／turnDeliverNote`。
- `vibe-math-vmu.js`：装配 `turnDeliver` —— **调用时**解析 `ctx.get('subagents')`，经 `kernel/turn/index.js` 的 `deliverViaSubagents` 投递（服务未挂载时不早绑为"缺席"）；缺缝具名拒 `VMU_ENGINE_UNAVAILABLE`。
验收：真实入口 ⇒ `seams.turnDeliver:true`；`kernel.turn.step({members:[{id:'m-1'}]})` ⇒ **真的投递并分派**（`receipt.executed ≥ 1`，桥收到的 `label='vmu-turn-<id>'`）✓；无缝 ⇒ `turnDeliver:false` + 具名 note ✓；`node tests/vmu-turn.test.mjs` **145/0** ✓。

### K4 提示词管线设置断线
- `kernel/index.js:452`：`createPromptPipeline({ …, settings: settingsView })`（**live 只读视图**，不是原始对象）。此前该调用点根本不传 `settings` ⇒ `vmu.prompts.sections／overrides／overridesByLang／locale.*／glossary.*` 在真机全失效。
验收（真机路径，非直传单测）：`createKernel({ settings: { 'vmu.prompts.sections':[…], 'vmu.prompts.overrides':{…} } })` ⇒ `kernel.prompt.assemble({})` 文本**含**声明段与设置覆盖 ✓；无声明 ⇒ 文本**不含**（零机制不变）✓。
- **未做（越界已回滚）**：`kernel/prompt/index.js` 的 H1 惰性读取补丁（我在范围澄清前误改，已**逐处还原**，`git diff` 该文件不含我的标记）。补丁摘要已发 vmu-pack，由其决定是否落地。

### K5 pack 设置合并（入口侧 · D-02）+ 唯一实现
- `vibe-math-vmu.js`：pack 默认逐键记来源（`packDefaultSource`）；**重叠具名报错** `VMU_PACK_CONFLICT`（用户值胜出、不静默覆盖），仅 `vmu.packs.allowKernelOverride`／`allowOverride`／`activeOverrides` 放行（放行的记为 `shadowed`）；`settingsSources` 把 pack 默认标成 `pack:<id>`（不再误报 `config`）；入口暴露 `packMerge()`／`promptPolicies()`。
- `kernel/index.js`：新增 `settingsSources／packApplier` 选项（`settingsConflicts` 已在 T1 后**删除**，见 §四④）；`applyPackSettings` 写后 `markSettingWriter(settings, key, 'pack:<by>')`；新增并挂载 `kernel.settingSource(key)`；`status().settings.resolved` 来源阶梯改为 `pack 层 > entry 层标注 > config > default`，并新增 `settingsMerge{priority,sources,conflictsView}` 与 `packPath`。
- **`usePack()` 硬拒（Lead 裁决）**：无 `packApplier` ⇒ `VMU_PACK_LOADER_UNAVAILABLE`（不再有第二条静默路径）；有注入 ⇒ 委托 `kernel/pack.js`（唯一实现）。
- vmu-pack 接口已交付：`createPackLoader({ settingSource, onPromptPolicy })`；`composePromptPolicies` 用**命名空间导入 + 特性检测**（缺导出不会 load-time 抛），其落地后自动生效。
验收：`probe` K5 段 7/7 ✓（优先级文案、具名冲突、用户值胜出、`shadowed`、`pack:v5r` 标注、内核 resolved 视图复述）；`node tests/vmu-kernel.test.mjs` **174/0** ✓（**已按 Lead 授权改写** pack 段：无注入 ⇒ 具名拒 + `packPath`，其余 5 条行为改走 loader，覆盖面未缩水、并新增 `packPath` 断言）。

### K6 文档同步（我名下）
- `docs/03`：§8 登记 4 个码 —— `VMU_MIDDLEWARE_KIND_UNSUPPORTED`（vmu-pack 的 D-03）、`VMU_PACK_INVALID`（基线 R7 的"借前缀豁免"项，如实登记）、`VMU_PACK_LOADER_UNAVAILABLE`、`VMU_PACK_PROMPT_POLICY_UNCONSUMED`；§3.1 增加 **D-01「出现条件」单一真源**说明（含两条硬规则与真源位置）；§6 公开键清单。
- `docs/02`：§2 修正 **模块实数 17→84**（含 A–I 表只覆盖 17 个的说明）；**"未触发钩子 6 个"清单改为"已清空"**（逐个给出真实生产者）。
- `docs/04`：以 `generate-vmu-settings-table.mjs --write`（**只写 docs/04，属我范围**）重生成 §11，新增两键后 `1154 keys (1032 wired, 122 declared-but-not-wired)`。
- `docs/18`：§1 增加"出现条件＝`TOOL_FACES`／`resolveFaces` 同一真源"说明。
- `docs/26`：§5 更正投递缝叙述（`host.deliverTurn` → 内核 `deliverTurn` + 入口装配，附轮 1 复测）。
- `docs/02` 的 kernel-index 生成块已 `--write` 重生成（单文件，我范围）：`82 modules, 0 headerless`。

### P6 声明驱动 pack runtime（vmu-pack 请求）
- `vibe-math-vmu.js`：`PACK_RUNTIME` 映射 + `config.packs` 唯一开关 ⇒ `sectionPolicy／noticeBlock／extraPhases` **不再无条件注入 v5r**（无 pack ⇒ `sectionPolicy:null`，零机制成立）。

## 二、验证命令与结果（原样命令 + 退出码）

```
node D:/_tmp/vmu-r1/probe.mjs                      → TOTAL pass=39 fail=0          exit=0
node tests/vmu-kernel.test.mjs                     → 174 passed, 0 failed          exit=0
node tests/vmu-host.test.mjs                       → 103 passed, 0 failed          exit=0
node tests/vmu-tools-filter.test.mjs               →   9 passed, 0 failed          exit=0
node tests/vmu-control-roster.test.mjs             →  12 passed, 0 failed          exit=0
node tests/vmu-turn.test.mjs                       → 145 passed, 0 failed          exit=0
node tests/vmu-idempotency.test.mjs                → 252 passed, 0 failed          exit=0
node tests/vmu-minutes-tool.test.mjs               →  13 passed, 0 failed          exit=0
node tests/audit-vmu-docs.test.mjs                 →  77 passed, 1 failed          exit=1   （见"未做/移交" ③）
node scripts/generate-kernel-index.mjs             → docs/02 matches (82, 0 headerless) exit=0
node scripts/generate-surface-index.mjs            → docs/03·05(×3)·18 current；docs/04 settings-index STALE  exit=1（见 ①）
node scripts/generate-wired-schema.mjs             → already in sync (1427 lines)   exit=0
node scripts/generate-wiring-index.mjs             → STALE（docs/00-README.md）     exit=1（见 ②）
node --check <host.js|kernel/index.js|kernel/store.js|kernel/idempotency.js|vibe-math-vmu.js|settings/schema.js> → 全 0
```

## 三、未做 / 需他人或 Lead 处理

1. **`docs/04` 的 `settings-index` 生成块过期**（我新增两键所致）：需 `node scripts/generate-surface-index.mjs --write`；该脚本**同时写 `docs/05`（vmu-pack 文件）**，故按 D-07 不由我跑 ⇒ **请 Lead 在全员停写后统一跑**。
2. **`wiring-index` 过期**（`docs/00-README.md`，跨人）：同属 Lead 的统一 regen。
3. **`tests/audit-vmu-docs.test.mjs` 唯一红项**：`MATH_CANON_DIR`、`MATH_SCHEMA_FILE`（出现在 `docs/11-gates-and-development.md`）未登记 §8。`docs/11` 不在我写范围 ⇒ 需其作者在 §8/正文处理，或由 vmu-verify 在门禁里把它们列入"非错误码"白名单。（我负责的 §8 侧 4 个码已登记，C 节"代码→§8"通过。）
4. **`kernel/prompt/index.js` 的 H1 惰性读取**：补丁摘要已交 vmu-pack（越界回滚说明见 K4）。
5. **`idempotency.persist()` 时序诚实性 —— 已按 Lead 裁决 ④ 修复**（在飞 ⇒ `durable:false + pending:true`，`whenDurable()` 给settled 答案；同步 API 不变；`tests/vmu-idempotency.test.mjs` 8 条已按授权改为新契约 + 3 条新断言，252/0）。
6. **常驻测试未入库**：我的验收探针在 `D:\_tmp\vmu-r1\probe.mjs`（**39 断言**）。`tests/` 不在我写范围（仅 Lead 授权的 `vmu-kernel.test.mjs`／`vmu-idempotency*.test.mjs`／`vmu-projmigrate.test.mjs` 例外）⇒ 建议由 vmu-verify 收编为 `tests/vmu-faces-reachability.test.mjs`（或等价）。
7. **未触碰**：`host-hooks.js`、`kernel/{pack,loader,rules,bus}.js`、`kernel/prompt/**`、`package.json`／`installer.js`、`tests/run-tests.mjs`／`audit-*.mjs*`、`scripts/**`、`packs/**`、`docs/05/06/10/11/27`。

## 四、T1 复跑（FAIL 6 → 我名下 4 项）定点修复

| # | 失败 | 修法 | 命令 → 结果 |
|---|---|---|---|
| ① | `vmu-entry.test.mjs`：middleware 面丢了"总线已有 entries 即声明" | `host.js` 的 middleware 行加 `extraIntent`：读 `kernel.bus.status().entries`，非空即声明（pack/M2 模块后加的条目也点亮该面）；零机制红线不变（空总线+无声明 ⇒ 仍恰 1 个工具） | `node tests/vmu-entry.test.mjs` → **141 passed, 0 failed**, exit 0 |
| ② | `vmu-idempotency-tool.test.mjs`：枚举与服务方法不再一一对应 | `tools/idempotency.js` 枚举加 `whenDurable`（只读等待，注释标注幂等）+ 分派行；测试期望列表同步为服务的真实方法集 **13**，仍**逐项一一对应**（未放宽） | `node tests/vmu-idempotency-tool.test.mjs` → **13 passed, 0 failed**, exit 0 |
| ③ | `vmu-projmigrate.test.mjs`：A3 断言撞上新的诚实语义 | 断言改为：先断 `persist()` 回执 `pending:true & durable:false`（**在飞绝不早报**），再 `await ledger.whenDurable()` 后断 `durable:true`；覆盖面不缩水 | `node tests/vmu-projmigrate.test.mjs` → **107 passed, 0 failed**, exit 0 |
| ④ | `vmu-seam-params-consumed.test.mjs`：`settingsConflicts` 全树无人读 | **删除该内核接缝**（内核从不据此行动）；重叠报告改由 **host 面**承载：`createHostAdapter({ mergeReport })` → `vibe_vmu_status` 的 `settingsMerge`（host.js 真读它）；入口不再传 `settingsConflicts` | `node tests/vmu-seam-params-consumed.test.mjs` → **8 passed, 0 failed**, exit 0 |

回归（同轮复跑，全绿）：`vmu-kernel 174/0`、`vmu-host 103/0`、`vmu-idempotency 252/0`、`node D:/_tmp/vmu-r1/probe.mjs` → **39 pass, 0 fail**。四项改动涉及文件：`host.js`、`tools/idempotency.js`、`kernel/index.js`、`vibe-math-vmu.js` ＋ 三个被授权的测试文件。
