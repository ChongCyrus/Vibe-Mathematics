# vmu 交接 · Round 1 · task-5 报告（中间件 / pack / 提示词面）

- 任务：`task-5`（Round1 · 目标0：中间件/pack/提示词面断线修复）
- 裁决依据：`_handoff/vmu/00-decisions.md`（D-02/D-03/D-04 硬裁决，D-07 并行纪律）
- 基线：`_handoff/vmu/pack-baseline.md`
- 纪律：**未跑**全量 sweep／`scripts/regen-all.mjs`；**未动 git**（无 commit/push）；临时文件在 `D:\_tmp`；针对性单跑见下（原样命令 + 退出码）。
- 写范围外**未动**：`kernel/index.js`、`vibe-math-vmu.js`（vmu-core）、`package.json`／`installer.js`（vmu-verify）、`tests/run-tests.mjs`／`tests/audit-*.mjs*`（vmu-verify）。唯二例外：**Lead 明确授权**的两行测试数据（见 P3）。

---

## 逐项：改了什么 · file:line

### P4 纸面中间件形态（D-03）· 已落地

- `kernel/bus.js:203` `SUPPORTED_KINDS = ['rules','module']`；`:206` `UNSUPPORTED_KIND_CARRIERS`（script/plugin 的真实载体 + 指向 docs/05 §2）；`:214` `unsupportedKind()`。
- `kernel/bus.js:308-311` `add()` 对 `kind:'script'|'plugin'` **具名拒** `VMU_MIDDLEWARE_KIND_UNSUPPORTED`（hint 点名 M3＝`kernel/script-bridge.js`＋`vibe_vmu_script`；M4＝消费公开服务的 DSH 插件，**pack 是 L4**）。
- `kernel/bus.js:231-233` `validateEntry()` 同步把这两种 kind 报为问题（未知 kind 仍走原 `VMU_MIDDLEWARE_FAILED`，保持既有测试语义）。
- `kernel/bus.js:240-243`：**非 rules 条目必须有 `handler`**——`file` 不再是替代品（总线不装载文件；模块文件由 `loader.toBusEntries()` 带上 handler）。这关掉了"校验通过、emit 时 `middleware/skipped`"的另一条纸面路径。
- `kernel/pack.js:130-141`：`validatePack` 对 `middleware` 条目加 kind/handler 校验（计划期即报，不等 apply）。

### P5 钩子单一真源（D-04）· 已落地（一处受限，见"未做/受限"）

- `kernel/bus.js:102-148`：**`HOOK_REGISTRY`**（41 条：22 个 vmu + 19 个 host），每条含 `name`/`kind`/`failure`/`blockable`/`rewritable`/`scope`/`timing`/`producer`/`bridged`/`bridgeSite`。
- `kernel/bus.js:150` `DSH_HOOKS`、`:153` `BRIDGED_HOOKS`、`:156` `HOOK_PREFIXES` —— **由登记表派生**。
- `kernel/bus.js:167-190` `hookRegistryProblems()`：无重名；`VU_HOOKS` 与登记表 vmu 名**双向一致**；`DEFAULT_FAILURE` 与登记表逐项一致；**桥接 ⊆ 可订阅**；每个桥接项必须写明 `bridgeSite`。
- `kernel/loader.js:19,29,51`：`DSH_HOOKS` 改为派生再导出；`workflow/*` 前缀改用 `HOOK_PREFIXES`。`DSH_HOOKS` 17 → **19**（补 `agent/created`、`system-prompt/assemble`，使"桥接 ⊆ 可订阅"成立）。
- `host-hooks.js:23,33`：`BRIDGED_HOOKS` 改为派生（值仍 14，行为不变）；`tests/vmu-host-hooks.test.mjs:145` 的 self-probe 锚点字符串**原样保留**。
- **受限说明（D-04 的"全部派生"只做到三分之二）**：`VU_HOOKS` 与 `DEFAULT_FAILURE` 仍保留字面量，因为三处既有门禁**按源码文本**解析它们：`tests/audit-hook-coverage.test.mjs:31`、`tests/audit-doc-vs-code-tables.test.mjs:59`、`scripts/generate-surface-index.mjs:39-41`（另有 `tests/audit-vmu-docs.test.mjs:416`）。把它们改成派生表达式会让这些门禁读不到名字而变红，而它们不在我写范围内。因此改用"字面量 + `hookRegistryProblems()` 双向断言"绑定。**若要把字面量也变成派生**，需同轮改这 4 处（vmu-verify 的 `tests/audit-*.mjs*` 与 `scripts/`），已在"需裁决/交接"列出。

### P1 `promptPolicies` 真接入 `apply()`（D-03）· 已落地

- `kernel/pack.js:236`：`createPackLoader({..., onPromptPolicy = null, settingSource = null })`。
- `kernel/pack.js:215`：新增并导出 **`composePromptPolicies(policies)`** —— 把策略条目 `{id,apply}` 或**裸策略函数**合成一个 `sectionPolicy`；空列表 ⇒ `null`（保持"未注入 ⇒ 一个段都不动"）。裸函数会**包装**（否则 `fn.apply` 会被当成 `Function.prototype.apply` 调用而静默传空 settings）。
- `kernel/pack.js:317,323-326`：`plan()` 的 prompt-policy 动作带 `consumer` 字段，且无 sink 时在 **`warnings`** 里提前说明。
- `kernel/pack.js:459-472`：`apply()` 把每个策略交给 sink；**无 sink ⇒ 具名拒 `VMU_PACK_PROMPT_POLICY_UNCONSUMED`**；undo 调用 sink 返回的 `dispose`（`unload()` 无残留）。
- `kernel/pack.js:139`：`promptPolicies[].apply` 必须是函数（否则 `problems` 点名）。
- 回执：`apply()` 返回 `promptPolicies:[id]`（`:495`）。

### P2 pack 设置合并对齐 D-02 · 已落地（接缝由 vmu-core 提供）

- `kernel/pack.js:192` `SETTING_LAYERS`（`schema < pack < preset < session < runtime`）、`:195` `settingLayerRank()`。
- `kernel/pack.js:394-431`：有 `settingSource` 时——**更高层已拥有该键 ⇒ 遮蔽（shadowed）：高层胜、不覆盖、不报错**；**同层（另一个 pack／pack 默认层）⇒ `VMU_PACK_CONFLICT`**；`schema` 默认之下 ⇒ pack 施加；显式 `allowOverride` ⇒ 强制施加。**未提供 seam 时与旧版逐字节同行为**（任何重叠都具名拒）。
- `kernel/pack.js:517-533`：`status()` 新增 `layers` 与 `settings.resolved`（逐键 `{value, source, rank}`）+ `settings.shadowed`；`applied[]` 每项带 `settingsApplied`/`settingsShadowed`。
- `kernel/pack.js:491-495`：apply 回执带 `settings:{applied, shadowed}`。
- **入口侧（vmu-core 已确认本轮落）**：`kernel/index.js` 提供 `kernel.settingSource(key)`＋`status().settings.resolved`＋`applyPackSettings` 标 `pack:<id>`；`vibe-math-vmu.js` 传 `settingSource`。我方接口按此实现。

### P3 `range` 校验 + 修数据包声明 · 已落地

- `kernel/prompt/index.js:201-227`：`register()` 现在校验调用方传的 `range`——① 未知名 ⇒ `VMU_INVALID_ARGUMENT`；② 与 `order` 推出的区间不一致 ⇒ `VMU_INVALID_ARGUMENT`；③ `source` 标为 `pack:*` 的段落进 **`facts`**（框架独占）⇒ `VMU_NOT_PERMITTED`。
- `packs/example-data/prompts/sections.json:10`：`order: 10 → 600`（与 `range:'pack'` 自洽，落 pack 区间）。
- **Lead 授权的两行测试数据**（与 docs/06 §3"range 由 order 推出、不是入参"矛盾）：`tests/vmu-prompt.test.mjs:118`、`tests/vmu-turn.test.mjs:750` 删除 `range: 'pack',`（各加一行注释说明）。**改动后两套件全绿**。

### P6 v5r 无条件注入 → pack 声明驱动 · 机制侧已落地，入口侧待 vmu-core

- 我方交付：`composePromptPolicies`（P1）＋ `onPromptPolicy` sink ＋ `docs/27 §4.1` 把形状写清。
- **已发给 vmu-core 的精确要求**（消息 `team-message-c9925f0f`，其已回复确认四项在落）：`vibe-math-vmu.js:20-22,222` 改为按 `config.packs` 取本地 `PACK_RUNTIME` 映射；`sectionPolicy`／`noticeBlock`／`extraPhases` 在**未声明任何 pack 时全为 `null`**；`createPackLoader` 传 `settingSource` 与 `onPromptPolicy`。

### P7 文档同步 · 已落地

| 卷 | 改了什么 |
|---|---|
| `docs/05-middleware.md` | §0 速览（kind／handler／file、22 个钩子）；§2 四形态表重写（**总线只跑 M1/M2；M3＝script-bridge＋工具；M4＝DSH 插件；pack＝L4**）；§3.1 字段表；§5 五处过期"无生产者"改真生产者；§5.2 的 `pack/loading|loaded` 自相矛盾改正；§6.1 装载顺序 + **新增 §6.1.1 钩子单一真源**；§10/§13/§15 过期计数删除；§14 新增第 11–13 条修正（轮 1） |
| `docs/06-prompt-pipeline.md` | §2 装配步骤（冻结名 `prompt/section-assembled`、绑定"单赢家替换"、缺值记 `variableMisses`）；§3 `range` 校验；§4 规则 2 落地说明；§5 绑定语义更正；§7 缺值策略更正 |
| `docs/10-packs.md` | 卷首定义加"pack 是 L4、不是 M4"；API 清单加新接缝与 `composePromptPolicies`；§2 字段表（`middleware` kind/handler、`settings` D-02 分层、**新增 `promptPolicies` 行**）；§3 接线现状；§4 优先级与冲突按 D-02 重写 |
| `docs/27-pack-folder.md` | §1 加 L4≠M4；**新增 §4.1 机构策略由 pack 声明驱动注入**（含残余边界：`extraPhases` 仍是构造期取值）；§7 数据包行的"插件没有任何 pack 名字"加轮 1 边界说明 |
| `docs/24-v5r-containment.md` | §2.2.39 与 §7 表① ③ 的"包的段没接进默认运行路径／删了不影响运行"更正为"晚注册已接进真实回合"（残余：管线无注销） |

---

## 验证（原样命令 + 退出码；均为单跑，非全量）

工作目录 `Vibe-Mathematics`。命令一律 `node tests/<file>`。

| # | 命令 | 退出码 | 结果 |
|---|---|---|---|
| 1 | `node tests/vmu-bus.test.mjs` | 0 | VMU BUS: 44 passed, 0 failed |
| 2 | `node tests/vmu-pack.test.mjs` | 0 | VMU PACK: 53 passed, 0 failed |
| 3 | `node tests/vmu-loader.test.mjs` | 0 | VMU LOADER: 28 passed, 0 failed |
| 4 | `node tests/vmu-host-hooks.test.mjs` | 0 | VMU HOST HOOKS: 22 passed, 0 failed |
| 5 | `node tests/vmu-prompt.test.mjs` | 0 | VMU PROMPT: 70 passed, 0 failed |
| 6 | `node tests/vmu-turn.test.mjs` | 0 | VMU TURN: 145 passed, 0 failed |
| 7 | `node tests/vmu-prompt-v5r-bridge.test.mjs` | 0 | VMU PROMPT v5r bridge: 12 passed, 0 failed |
| 8 | `node tests/vmu-pack-data-sections.test.mjs` | 0 | PACK DATA SECTIONS: 14 passed, 0 failed |
| 9 | `node tests/vmu-pack-fields-match-category.test.mjs` | 0 | 14 passed；packs=3 refusals=0 misplaced=0 |
| 10 | `node tests/vmu-middleware-hooks-declared.test.mjs` | 0 | 8 passed, 0 failed |
| 11 | `node tests/vmu-pack-manifest-pointers.test.mjs` | 0 | 8 passed, 0 failed |
| 12 | `node tests/vmu-kernel.test.mjs` | 0 | VMU KERNEL: 174 passed, 0 failed |
| 13 | `node tests/vmu-host.test.mjs` | 0 | VMU HOST: 103 passed, 0 failed |
| 14 | `node tests/vmu-script.test.mjs` | 0 | VMU SCRIPT: 18 passed, 0 failed |
| 15 | `node tests/vmu-script-and-protocol.test.mjs` | 0 | SCRIPT AND PROTOCOL: 8 passed, 0 failed |
| 16 | `node tests/vmu-settings.test.mjs` | 0 | VMU SETTINGS: 47 passed, 0 failed |
| 17 | `node tests/vmu-turn-contracts.test.mjs` | 0 | TURN CONTRACTS: 12 passed, 0 failed |
| 18 | `node tests/audit-hook-coverage.test.mjs` | 0 | HOOK COVERAGE: 4 passed, 0 failed |
| 19 | `node tests/audit-doc-vs-code-tables.test.mjs` | 0 | DOC VS CODE TABLES: 17 passed, 0 failed |
| 20 | `node tests/audit-doc-api-coverage.test.mjs` | 0 | DOC API COVERAGE: 2 passed, 0 failed |
| 21 | `node tests/audit-pack-face.test.mjs` | 0 | PACK FACE: 5 passed, 0 failed |
| 22 | `node tests/audit-vmu-release.test.mjs` | 0 | VMU RELEASE SHAPE: 22 passed, 0 failed |
| 23 | `node D:\_tmp\vmu-pack-round1-probe.mjs`（临时探针，见下） | 0 | **PROBE: 29 passed, 0 failed** |

**探针**（`D:\_tmp\vmu-pack-round1-probe.mjs`，仓外临时文件，可复跑）覆盖新行为的"会咬人"断言：`kind:'script'/'plugin'` 具名拒；file-only 条目拒；`plan().warnings`；无 sink ⇒ `VMU_PACK_PROMPT_POLICY_UNCONSUMED`；sink 消费 + unload dispose；`composePromptPolicies` 两种形态与空列表 null；D-02 遮蔽/同层冲突/无 seam 保守拒/`status().settings.resolved`；range 四种分支（未知、错配、pack 占 facts、一致接受）。**29/29，exit 0**。

### 与本次改动无关的红（如实登记，未动）

| 命令 | 退出码 | 归因 |
|---|---|---|
| `node tests/vmu-entry.test.mjs` | 1 | **vmu-core 的 K1 工具面映射表在飞**：`host.js:144` 新增 face 表、`:444` 由 `on('middleware')` 取代旧的"总线有条目即出现"条件 ⇒ 1 条断言（`vmu-entry.test.mjs:157`）失败；与本轮 P1–P7 无关（我未动 host.js／vibe-math-vmu.js） |
| `node tests/audit-surface-index.test.mjs` | 1 | `docs/04-settings.md` 生成块 stale（vmu-core 正在改 `settings/schema.js`＋docs/04）；**docs/05 的 3 个生成块均报 current** ✓ |
| `node tests/audit-vmu-docs.test.mjs` | 1 | 先因 docs/04 settings 表 stale 退出（vmu-core 范围）；其"代码里每个非 `VMU_PACK_` 码必须登记 docs/03 §8"一节待 vmu-core 登记 `VMU_MIDDLEWARE_KIND_UNSUPPORTED` 后才会绿（我已发精确要求，其已确认本轮落） |
| `node tests/audit-verbatim-claims.test.mjs` | 1 | `dangling: ["11:221 -> _oneoff/vmu/tools/check-docs.mjs"]` —— docs/11 的声明指向仓外文件，属 D-05（T0 进仓）范围（vmu-verify），与本轮无关 |

---

## 未做 / 受限 / 需裁决

1. **`VU_HOOKS`／`DEFAULT_FAILURE` 仍是字面量**（D-04 的完全派生只完成 host 两表）。原因与精确后续见 P5"受限说明"；需同轮改 4 处门禁（`tests/audit-hook-coverage.test.mjs:31`、`tests/audit-doc-vs-code-tables.test.mjs:59`、`tests/audit-vmu-docs.test.mjs:416`、`scripts/generate-surface-index.mjs:39-41`）——均不在我写范围。**请裁决**：是否把这些文件的读取方式改为读 `HOOK_REGISTRY`。
2. **K4-补（H1 活读）未做**：vmu-core 还原后把它交给我（`kernel/prompt/index.js:83-100` 的 `localeDefault/localeChain/localeOnMissing/overridesByLang/glossaryMode/glossaryPath` 在构造期快照，而 `kernel/index.js:452` 现在传的是 **live settingsView** ⇒ H1 回执"every consumer reads this key live"对提示词面仍不成立）。**不在 task-5 的 P 列表**，我未擅自落地；它属于同一类"断线"，建议下一轮作为独立项（改动约 15 处调用点，需配 vmu-prompt/vmu-turn 验证）。vmu-core 的原文与"最小风险版（只做 a+b，不碰 sections）"建议见其消息。
3. **v5r 的 `promptPolicies` 仍在 folder record（`V5R_PACK`）而非被装载清单（`v5r-core.js` 的 `PACK`）**：本轮**故意不动**——迁移它会让"声明了策略却没有 sink"的具名拒在 vmu-core 落地 sink 之前把 `vmu-entry` 的 v5r 路径打红。机制本身已由探针证明是真的（P1）；迁移可作为下一轮一行改动（并把 `V5R_PACK.promptPolicies` 去重）。
4. **`extraPhases` 仍是构造期取值**（回合循环在建内核时捕获）：第三方 pack 若走声明驱动，其相位必须由自己的插件在构造前传入（本轮 `PACK_RUNTIME` 同步映射即为此）。已在 `docs/27 §4.1` 标注。
5. **`kernel.usePack()` 第三条路径**：vmu-core 只落"有注入即委托 loader"，无注入仍保留 legacy（因 `tests/vmu-kernel.test.mjs:113-128` 6 条断言依赖它，tests 不在其写范围）。**请裁决**是否把 tests 划给 vmu-verify 后删 legacy。
6. **探针文件**保留在 `D:\_tmp\vmu-pack-round1-probe.mjs`（供 Lead 复跑）；若不需要可删。
