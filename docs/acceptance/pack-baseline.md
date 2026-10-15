# vmu 交接基线 · 中间件 / pack / 提示词管线面（L3/L4）

- 任务：`task-2`（vmu-pack）
- 仓库：`Vibe-Mathematics`（git，分支 `main`，HEAD `6d0164e`，侦察期间工作区保持干净）
- 侦察对象根：`Vibe-Mathematics/vibe-math-vmu/`
- 性质：**只读侦察，无任何实现改动**；本文件是唯一写入物（`_handoff/vmu/pack-baseline.md`）。
- 证据约定：所有结论附 `file:line`；引文档时标 `docs/…:line`。凡「文档声称 vs 代码实做」不一致，均单列。

---

## 0. 结论速览（先给判断，细节在下）

1. **四形态里只有 M1、M2 在总线上是真的**。`kind: 'script'` / `'plugin'` 是 `validateEntry` 接受但全仓无人读取的死词汇（`kernel/bus.js:97,106` 对 vs 全仓无 `kind === 'script'|'plugin'` 分支）。
2. **M3 脚本真实存在，但不在总线上**：它是 `kernel/script-bridge.js` + `vibe_vmu_script` 工具，靠 `config.scripts` 声明，**没有「条目 → 桥」的接线**，因此文档说的「M3 是总线条目的一种形态」不成立。
3. **M4 的真实实现是 pack 机制（`kernel/pack.js`），不是总线条目 `kind:'plugin'`**。文档 05 把 M4 映射成 `kind:'plugin'`（`docs/05-middleware.md:61`），文档 10 又把 M4 定义为 pack（`docs/10-packs.md:6`）——同项目两卷对同一层的载体说法不同。
4. **pack 的 `promptPolicies` 只被「校验 + 计划」，apply 不消费**（`kernel/pack.js:125`、`:250` vs `:349-367` 的 apply 循环）。v5r 的策略实际是由**插件硬编码**注入的（`vibe-math-vmu.js:20-22,222`）。
5. **「内核对上无依赖」在内核层成立，在插件入口层不成立**：`kernel/**` 零 import packs（grep 无命中）；但 `vibe-math-vmu.js` 顶层静态 import `packs/v5r/*`，并把 `decideSections` / `inboxBlock` / `V5R_PHASES` **无条件**塞给 `createKernel`，与 `config.packs` 无关。
6. **提示词管线的 settings 通道在真实装配里是断的**：`kernel/index.js:452` 调 `createPromptPipeline({...})` **没有传 `settings`**。单测都是直接 `createPromptPipeline({ settings })`（如 `tests/vmu-prompt.test.mjs:251,298,391`），所以测试绿、真机键失灵。
7. **`range`（段区间）是「有字段、无消费者」**：`register()` 只从 `order` 推区间（`kernel/prompt/index.js:199-200,212-228`），从不读 `section.range`；而数据包 `packs/example-data/prompts/sections.json:9-11` 声明 `order:10, range:'pack'`，实际落进内核专属的 `facts[0,199]`。
8. **`v5r` 的提示词正文不进 DSH system prompt**：它经 pack apply 后的 `manifest.sections` 晚注册进**内核管线**（`vibe-math-vmu.js:417-427`），再由回合循环装配、走 `deliver` 接缝；DSH systemPrompt 的 `vmu` 段只装 `config.promptSections` 的文本（`vibe-math-vmu.js:322-330`）。
9. **pack/loading、pack/loaded 已真正接线**（`kernel/pack.js:303,374`），docs/05 §5.2 与 §15-1 的「仍无人 emit」是**过期文档**（同卷生成的钩子索引 `docs/05-middleware.md:380-381` 已写 `pack.js` 是生产者，自相矛盾）。
10. **`vmu.prompts.glossary.mode` 想关也关不掉**：settings 没进管线 ⇒ 工厂内 `glossaryMode` 恒为默认 `'enforce'`（`kernel/prompt/index.js:91`），而真实 `readFile` 一定在（`vibe-math-vmu.js:224`），一旦本体读不到，**整个装配返回 `ok:false`**（`kernel/prompt/index.js:442-461`）。

---

## 1. 四形态中间件的实际落点

统一注册面都是 `kernel/bus.js`；统一条目形状由 `validateEntry`（`kernel/bus.js:93-110`）与 `add`（`:163-185`）定义：`id`、`kind∈{rules,module,script,plugin}`、`on`（≥1）、非 rules 需 `handler` 或 `file`、`order` 默认 1000（`:133,177`）、`failure` 默认 `DEFAULT_FAILURE[on[0]]`（`:63-83,178`）、`capabilities` 默认 `[]`（`:179`）。

### 1.1 M1 声明式规则（真）

| 维度 | 事实 | 证据 |
|---|---|---|
| 加载器/编译器 | `createRulesEngine().compile()` 静态校验 + 冻结规则；`toBusEntries()` 产出总线条目 | `kernel/rules.js:274-319`、`:359-365` |
| 注册面 | ① `kernel.start()`：`settings['vmu.middleware.entries']` 中 `kind==='rules'` 走 `rules.toBusEntries`；② pack apply：`manifest.rules` 走同一路 | `kernel/index.js:975-989`（983-984）、`kernel/pack.js:349-355` |
| 失败隔离 | 加载期：静态问题即 `VMU_MIDDLEWARE_FAILED`（`:293-296`）；运行期：命中 `deny/cancel` 即终止并具名（`:306-309`），其余进 `decisions[]` | 同左 |
| 超时 | **规则引擎自身无超时**；超时由总线对「已编译 handler」统一施加 | `kernel/bus.js:191-198` |
| 能力清单 | `ACTION_CAPABILITY` 映射表 + `requiredCapabilities()`；禁止表达式键 | `kernel/rules.js:27-31`、`:122-130`、`:34` |
| 干跑 | `dryRun(rule, samples)` 纯求值 | `kernel/rules.js:342-356` |

### 1.2 M2 代码模块（真，但两条注册路径不等价）

| 维度 | 事实 | 证据 |
|---|---|---|
| 加载器 | `createLoader().load()`：强制 `kind:'module'`、`meta.apiVersion`、`capabilities`、**已注册钩子**校验；`toBusEntries()` 转总线条目 | `kernel/loader.js:120-180`、`:183-193`；校验 `:58-92` |
| 注册面 A（正规） | 插件 `config.modules` → `kernel.loader.toBusEntries(specs,{importModule})` → `bus.add` | `vibe-math-vmu.js:456-476`；`kernel/index.js:708-716` |
| 注册面 B（**绕过 loader**） | pack apply 把 `manifest.middleware` 条目**原样** `bus.add(entry)`：不查 meta/apiVersion、不冻 API facade | `kernel/pack.js:356-360`；对照 `kernel/loader.js:138-143,176-177` |
| 失败隔离 | 加载期：加载抛错/工厂抛错/校验不过 ⇒ 具名 `VMU_MIDDLEWARE_FAILED`；运行期按总线 failure 三态 + 熔断 | `kernel/loader.js:132-153`；`kernel/bus.js:306-321,213-221` |
| 超时 | 模块**加载**无超时；模块 handler 运行受总线超时 | `kernel/bus.js:191-198` |
| 能力清单 | loader 侧 `CAPABILITIES` 副本（`loader.js:36-37`）+ `API_KEYS` 冻结面（`:34,103-110`）；bus 侧 `CAPABILITIES`（`bus.js:24-27`），运行期 `checkCapability` | 同左 |
| 干跑 | 加载器诚实地只保证「传 `dryRun:true` 并报告返回值」，明文不可证明无副作用 | `kernel/loader.js:15-17,202-209` |

### 1.3 M3 脚本工作流（真，但**不是总线形态**）

| 维度 | 事实 | 证据 |
|---|---|---|
| 加载器 | `kernel/script-bridge.js`：`validateRequest` / `plan` / `run`，注入 spawn 接缝 | `kernel/script-bridge.js:31-50,87-168` |
| 注册面 | **无总线注册**。插件 `config.scripts` + `vibe_vmu_script` 工具（`action:list|run`）→ `kernel.bridge.run()`；桥在 `kernel/index.js:717` 构造 | `host.js:367-419`、`kernel/index.js:717` |
| 失败隔离 | 非零退出＝**结果**（按 `request.failure` open/closed/abort）；超时＝硬具名失败 `VMU_JOB_TIMEOUT`；stdout 必须是带 `ok` 的 JSON | `kernel/script-bridge.js:147-167,66-81` |
| 超时 | `request.timeoutMs || defaultTimeoutMs`，`defaultTimeoutMs = settings['vmu.math.timeoutMs']` | `kernel/script-bridge.js:127`、`kernel/index.js:717` |
| 能力清单 | 无能力词表；契约是进程协议 | — |
| 总线侧 | `validateEntry` 接受 `kind:'script'` + `file`，但 `emit` 对无 handler 条目只记 `middleware/skipped` 后 `continue` ⇒ **file 永远不执行** | `kernel/bus.js:97,106` vs `:301-304` |

### 1.4 M4 外部插件 / 扩展（三种东西混叫一个名字）

| 名称 | 事实 | 证据 |
|---|---|---|
| 总线 `kind:'plugin'` | `validateEntry` 接受，**全仓无消费者**（无 `kind==='plugin'` 分支、无 file 装载） | `kernel/bus.js:97`；全仓 grep 仅此一处 |
| pack（文档 10 的 M4） | `kernel/pack.js`：`validatePack` / `plan` / `apply` / `unload`，真实现 | `kernel/pack.js:102-130,231-285,297-383,386-396` |
| extensions/（文档 19 的 E5） | `extensions/domain-compliance/{index.js,gate.js}` 导出工厂，**全仓无 import 点**（只有自身与文档引用） | `extensions/domain-compliance/index.js:52,306`；`extensions/domain-compliance/gate.js:12,14` |

### 1.5 文档声称 vs 代码实做（第 1 节）

| # | 文档声称 | 代码实做 | 证据 |
|---|---|---|---|
| 1-1 | M3 形态＝总线条目 `kind:'script'`，`file` 经 script-bridge 建立调用（docs/05:60、docs/05:213「脚本最后：经 kernel/script-bridge.js 建立调用」） | 总线条目 `kind:'script'` 在 emit 时被当「无 handler」跳过；桥只被 `vibe_vmu_script` 工具驱动 | `kernel/bus.js:301-304`；`host.js:367-419` |
| 1-2 | M4 形态＝总线条目 `kind:'plugin'`，载体＝pack（docs/05:61） | pack 完全不经 `bus.add` 的 plugin 分支；总线无 plugin 装载 | `kernel/pack.js:297-383`；`kernel/bus.js:97` |
| 1-3 | 脚本超时「按 `hookTimeoutMs`」，失败「按条目策略」（docs/05:232） | 脚本桥超时用 `vmu.math.timeoutMs`，失败用 `request.failure`，与总线条目无关 | `kernel/script-bridge.js:127`；`kernel/index.js:717` |
| 1-4 | 「20 个冻结钩子」（docs/05:153、docs/19:39-46），同卷生成索引又写 22（docs/05:361,388） | `VU_HOOKS` 实为 **22** | `kernel/bus.js:44-53` |
| 1-5 | pack/loading、pack/loaded「仍无人 emit」（docs/05:191,196,350） | 已 emit，且有默认失败策略 | `kernel/pack.js:303,374`；`kernel/bus.js:78` |
| 1-6 | 非 rules 条目需 `handler` 或 `file`，文档暗示两者等价可用（docs/05:76、docs/19:53,65） | `file` 只在**校验**里被接受；没有装载 file 的代码路径 | `kernel/bus.js:106` vs `:301-304` |
| 1-7 | `validateModule` 的 5 元校验对「pack 携带的模块」同样生效（docs/05:59、docs/10:113） | pack 的 middleware 条目直接进总线，不过 loader | `kernel/pack.js:356-360` |

---

## 2. pack 机制

### 2.1 目录契约（实际被读的只有两处数据文件 + 一个 index.js）

- 装载顺序：`./packs/<id>/index.js` → 失败且**仅 `ERR_MODULE_NOT_FOUND`** 时回退 `./packs/<id>.js` → 两者皆无则不报错，只要目录里有数据就当 `dataOnly` 已应用（`vibe-math-vmu.js:353-407`）。
- 纯数据契约（**建内核前**读，因为插件顶层不能 await）：
  - `packs/<id>/settings/defaults.json` → `{defaults:{key:value}}`（`vibe-math-vmu.js:205-220`）
  - `packs/<id>/prompts/sections.json` → `{sections:[{name,order,text}],bindings:[{section,role|phase|member|task,text}]}`（`vibe-math-vmu.js:177-204`；样例 `packs/example-data/prompts/sections.json:1-22`）
- 代码契约：`packs/<id>/index.js` 导出 `PACK`（`vibe-math-vmu.js:409`）。
- **没有读取任何 YAML**；docs/10 §6 自己也承认原文的 `pack.yml` 是错的（`docs/10-packs.md:226,252`）。

### 2.2 字段（`validatePack` 真正校验的集合）

`validatePack`（`kernel/pack.js:102-130`）校验：`id`(kebab)、`version`(semver 形)、`requires`(数组)、`codes`(前缀 `VMU_PACK_<ID>_`)、`slots[].id/capacity`、`tracks[]`、`rules[].id/on`、`middleware[].id`、`promptPolicies[].id`、`aliases[].from/to`。
**未校验也不报错的键**：`prompts`（在 `buildPlan` 里额外校验，:`260-271`）、`sections`、`bindings`、`priority`、`packContractVersion`、`migrations`（后者从不受理，`docs/10-packs.md:94` 自承）。
⇒ 结论：`validatePack` **按设计忽略未知键**，这正是本仓反复点名的「声明无消费者＝静默失效」风险位（`packs/v5r/index.js:57-61` 的注释亲口说明）。

### 2.3 settings 默认值合并（用户永远赢）

```
packDefaults（多个 pack 依 config.packs 顺序，先到先得）
  → settingsWithPackDefaults = { ...packDefaults, ...userSettings }   // 用户覆盖包
  → createKernel({ settings: settingsWithPackDefaults })
```
证据：`vibe-math-vmu.js:169-221,222-225`；`declared` 仍只数用户键，零机制不被包偏好污染（`vibe-math-vmu.js:229`）。

⚠️ **两条 settings 通道语义不同**：
- 插件路径（上）：**用户赢**，包默认值只是兜底；
- `kernel.applyPackSettings`（pack apply 时）：**重叠即具名拒**，除非声明 `vmu.packs.allowKernelOverride`/`allowOverride`（`kernel/index.js:1108-1130`、`kernel/pack.js:192-201,318-338`）。
⇒ 同一个包可能「默认值被采纳」却「显式 settings 被拒」，两条路径对「用户赢」的解释不同（见 §5-R2）。

### 2.4 prompts 注入（三条互不相同的路）

1. **数据路（建内核前）**：`prompts/sections.json` → `sections:[...packSections,...promptSections]` + `bindings`（`vibe-math-vmu.js:177-204,224`）。`section.range` 被原样传入但**注册时被忽略**（见 R1）。
2. **清单晚注册路（apply 后）**：`manifest.sections` 逐个 `kernel.prompt.register(s)`，`manifest.bindings` 逐个 `kernel.prompt.bind(b)`，失败**不吞**（`vibe-math-vmu.js:411-427`）。v5r 走这条（`packs/v5r/prompts/v5r-core.js:166-168` 的 `get sections()/get bindings()`）。
3. **策略路（声明式、无 apply 效果）**：`manifest.promptPolicies` 只在 `validatePack` 与 `buildPlan` 出现为 `kind:'prompt-policy'` 动作（`kernel/pack.js:125,250`），`apply()` 的 `runAll()` 里**没有任何 promptPolicies 循环**（`kernel/pack.js:315-368`）。
   - 真实注入是插件硬编码：`sectionPolicy: V5R_DECIDE_SECTIONS`（`vibe-math-vmu.js:20,222`），**与 `config.packs` 是否含 v5r 无关**。
   - `collectPackSections()` 已导出且被文档点名（`docs/10-packs.md:10`），但**只有测试在用**（`tests/vmu-turn.test.mjs:17`），生产路径不用（grep 全仓：`kernel/pack.js:153` 定义 + tests）。

### 2.5 依赖方向（是否违反「内核对上无依赖」）

- **内核层：不违反**。`grep "from '../packs"` / `"./packs"` 于 `vibe-math-vmu/kernel/**` 零命中。
- **插件入口层：违反**。`vibe-math-vmu.js:20-22` 静态 import v5r 的 `prompt-switches.js` / `notices.js` / `index.js`，并在 `:222` 无条件注入 `sectionPolicy`、`noticeBlock`、`extraPhases`。即：**换一家机构，这个「框架入口」仍带着 v5r 的段策略、通知措辞、相位词**。
- 更细一层：`V5R_PHASES` 从 **文件夹记录** `packs/v5r/index.js:51` 导入，而非被装载清单（`id:'v5r-core'`）；两者是不同对象（`packs/v5r/index.js:37-83`），docs/27 §7 对此有专述（`docs/27-pack-folder.md:110`）。
- pack → kernel：v3-core/institute-min/v5r 均不 import 内核模块（只 import 同包或 node 内建）；pack 只用 `setting()` 读配置（`packs/v3-core/index.js:79-80,102-105`）。

### 2.6 三个 pack 的差异对照

| 维度 | `packs/v5r` | `packs/v3-core` | `packs/institute-min` |
|---|---|---|---|
| 形态 | **文件夹**（index.js + settings/ + middleware/ + prompts/ + notices.js） | 单文件 `index.js` | 单文件 `index.js` |
| 被装载清单 | `packs/v5r/prompts/v5r-core.js:53` `PACK`，`id='v5r-core'` | `packs/v3-core/index.js:20`，`id='v3-core'` | `packs/institute-min/index.js:18`，`id='institute-min'` |
| 文件夹记录 | `V5R_PACK`，`id='v5r'`（`packs/v5r/index.js:62-83`） | 无 | 无 |
| `requires` | `vmu.tasks`/`vmu.middleware`（`v5r-core.js:63-66`） | 同（`:29-32`） | 同（`:25-28`） |
| slots | chair/member/temp（`v5r-core.js:88-92`） | planner/solver/verifier（`v3-core/index.js:55-59`） | chair/member/temp（`institute-min/index.js:38-42`） |
| tracks | progress/routes/obstacles/rejected/state | propos/problems/directions/journal/verified | progress/routes/obstacles/rejected/state |
| rules（M1） | 1 条（拒临时脚本，`v5r-core.js:100-114`） | **空**（明写要有计数/状态，`:66`） | 1 条（未 locked 不得表决，`:60-74`） |
| middleware（M2） | 1 条 module（`:120-147`） | **2 条** module：quorum + manual gate（`:69-116`） | 无 |
| promptPolicies | 有（`packs/v5r/index.js:75`） | 无 | 无 |
| 提示词正文 | 4 个生成模块 + 2 个 block 模块（`v5r/index.js:24-27`） | 无 | 无 |
| settings 默认值 | `settings/defaults.json` + `defaults.js` 双视图（`v5r/index.js:31-32`；`docs/27-pack-folder.md:120`） | 清单内联（`:41-52`），含包私有 `vmu.v3.*` | 清单内联（`:48-56`），纯机制键 |
| aliases | v5 工具名 → 已发布服务（`v5r-core.js:169-174`） | `vibe_math_*` → `vmu.middleware`/`vmu.tasks`（`:119-123`） | `vibe_v5_*` → 已发布服务（`:77-82`） |

### 2.7 文档声称 vs 代码实做（第 2 节）

| # | 文档声称 | 代码实做 | 证据 |
|---|---|---|---|
| 2-1 | `promptPolicies` 是被消费的清单字段（`docs/27-pack-folder.md:119`「声明与注入两条通道」） | 只进 `problems`/`plan.actions`，apply 不认；真实注入是插件硬编码 | `kernel/pack.js:125,250,315-368`；`vibe-math-vmu.js:222` |
| 2-2 | pack 目录「不含清单也可以」且由插件按目录名读数据（`docs/10-packs.md:27`） | 成立 | `vibe-math-vmu.js:392-405` |
| 2-3 | 「插件里没有任何 pack 的名字，由测试 grep 守住」（`docs/27-pack-folder.md:108`，针对数据包） | 该结论只对「数据包循环」成立；插件顶层**硬编码 v5r** | `vibe-math-vmu.js:20-22,222` |
| 2-4 | pack 段不得占内核区间（`docs/06-prompt-pipeline.md:100`、`docs/10-packs.md:14`） | 无任何强制：`range` 入参被忽略，只由 `order` 推；示例数据包实际落 `facts` | `kernel/prompt/index.js:199-200`；`packs/example-data/prompts/sections.json:9-11` |
| 2-5 | 用户段永远不能变 `mutable:false`（`docs/06-prompt-pipeline.md:179`，设计意图） | 代码允许任意段声明 `mutable:false`（只有 `state` 被强制） | `kernel/prompt/index.js:218` |
| 2-6 | `collectPackSections` 是「多个包共存时用」的生产 API（`docs/10-packs.md:10`） | 生产不用，仅测试用 | `tests/vmu-turn.test.mjs:17`；全仓无生产调用 |
| 2-7 | pack 的 `middleware` 条目走「装载校验 + 已注册钩子」纪律（`docs/05-middleware.md:59`、`docs/19:53`） | pack 直接 `bus.add`，无 loader 校验 | `kernel/pack.js:356-360` |

---

## 3. 提示词管线

### 3.1 注册与装配路径

**工厂**：`createPromptPipeline({ sections, bindings, overrides, whoMayOverride, bus, readFile, counts, settings, clock })`（`kernel/prompt/index.js:71-82`）。
**真实调用**：`createPromptPipeline({ sections, bindings, overrides, whoMayOverride, bus, readFile, clock })` —— **无 `settings`、无 `counts`**（`kernel/index.js:452`）。

段注册（`register()`）→ 区间（`ORDER_RANGES`，`:24-30`）→ 装配（`assemble()`，`:387-535`）：
1. 可选 `bus.emit('prompt/section-assembled', …)`，收集 `appendPrompt`（`:398-412`）；
2. 按名字 + language 选条目（`:415-417`）→ `scopeMatches`（`:250-259`）→ `order`→`name` 排序（`:419`）；
3. 逐段取内容：不可变段只用自身 text（`:469-474`）；否则 `binding`（**替换**语义，同维度并列即 `VMU_PROMPT_BINDING_CONFLICT`）→ `override` → `entry.text` → `entry.template`（`:478-505`、`:283-304`）；
4. 中间件 append 叠加（`:506-510`），未命中段的 append 自成一段（`:517-521`）；
5. `truncateText`（`:342-361`）→ `renderVariables`（`:313-340`）→ `"# <name>\n<text>"` 以 `\n\n` 连接 + `trimTrailing`（`:523`）。

**上下文/变量面**：`VARIABLE_WHITELIST` 13 项（`:50`）；`ctx.settings` 供 `setting:`，`counts` 供 `count:`（`:326-328`）；未登记变量具名拒（`:321-324`）；缺值记 `variableMisses`，`vmu.prompts.missingVariable=refuse` 时具名拒（`:329-337,527`）。

**工具面**：管线自身不注册工具；由 `kernel.prompt`（`kernel/index.js:724` 注册 `vmu.prompt` 服务）与 `host.js`/`tools/turn.js` 暴露。

### 3.2 v5r pack 的 prompt 文件如何进入 system prompt（两条完全不同的链）

```
链 A（DSH system prompt 的 'vmu' 段）：config.promptSections / config.prompt / vmu.prompts.resourceSection
   → effectivePrompts（override > file > inline）
   → ctx.systemPrompt.section({ name:'vmu', order, text })
   证据：vibe-math-vmu.js:84-142,322-330
   ✗ v5r 的 packs/v5r/prompts/*.js 不在这条链上

链 B（内核管线 → 成员回合）：
   pack apply → manifest.sections 晚注册进 kernel.prompt
   → turn.assemble() 里 sectionPolicy(decideSections) 开关段 + prompt.assemble(ctx)
   → out.text 交 deliver 接缝
   证据：vibe-math-vmu.js:411-427；kernel/turn/index.js:241-290；kernel/index.js:621-625
   ✓ v5r 的正文只在这条链上
```
⇒ 结论：**v5r pack 的 prompt 文件不改写 DSH 的 system prompt**；它们只经内核管线服务于成员回合（且 `deliver` 接缝由宿主/回合工具提供）。

### 3.3 语料 / 快照测试挂点

| 挂点 | 位置 | 作用 |
|---|---|---|
| 管线快照 | `kernel/prompt/index.js:562-566` `snapshot(scopes)`；status 的 `truncation/middlewareAppends` `:585-595` | 字节基线 |
| 管线单测 | `tests/vmu-prompt.test.mjs`（`snapshot`、绑定 winner、locale/glossary 分支，均**直接传 `settings`**） | 单元面 |
| v5r 转写桥 | `tests/vmu-prompt-v5r-bridge.test.mjs:41` | 段串接 |
| 类型覆盖/语料 | `tests/vmu-prompt-type-coverage.test.mjs`、`tests/vmu-corpus-is-baseline-not-template.test.mjs` | 语料口径 |
| pack 文本保真 | `tests/vmu-pack-prompts.test.mjs`（对 `v5r-prompts.js` 与语料逐字） | 生成物一致性 |
| 数据包段 | `tests/vmu-pack-data-sections.test.mjs` | `sections.json` 路 |
| 文档/API 门 | `tests/audit-doc-api-coverage.test.mjs:32,34`；`tests/audit-pack-face.test.mjs:36-63` | 文档与文件点名 |

### 3.4 文档声称 vs 代码实做（第 3 节）

| # | 文档声称 | 代码实做 | 证据 |
|---|---|---|---|
| 3-1 | 绑定「按优先级逐条**追加**」到同段（`docs/06-prompt-pipeline.md:49,111`） | 已改为**一个赢家替换**，同维度并列即拒 | `kernel/prompt/index.js:481-505` |
| 3-2 | 缺值 `undefined/null ⇒ 空串（不报错）`（`docs/06:135`） | 记 `variableMisses`，可 `refuse` | `kernel/prompt/index.js:329-337,526-527` |
| 3-3 | `vmu.prompts.sections` 是「§11 最高分来源」，settings 内联段被注册（`docs/06:175`、`docs/04-settings.md:896` 记「✅ 已接线」） | 真实 kernel 未把 settings 传给管线 ⇒ 该键**在真实装配中无效** | `kernel/index.js:452` vs `kernel/prompt/index.js:98,235`；单测直传 settings 故绿 |
| 3-4 | `vmu.prompts.locale.*`、`overridesByLang`、`glossary.*`、`overrides` 由管线读（docs/04:893-916 全标「已接线」） | 同一原因全线失效；且 `glossary.mode` 恒 `'enforce'`，本体不可读时**拒绝整次装配** | `kernel/prompt/index.js:83-93,423-461`；`kernel/index.js:452` |
| 3-5 | `prompt/assemble` 命名漂移「已修 ✓」，装配钩子可用（`docs/06:267-270`） | 冻结名确为 `prompt/section-assembled`（`kernel/prompt/index.js:400`），但 `v5r.prompt-switches` 的 `on` 仍写 `prompt/assemble`（只作 policy 的标签用） | `packs/v5r/middleware/prompt-switches.js:126` |
| 3-6 | `prompt/section-assembled` 是装配**守望者**的总线钩子（`docs/05:171`） | 它在 `assemble()` 内 emit，但 `host-hooks` 的 `BRIDGED_HOOKS` 不含它 ⇒ 真机 DSH 事件上无桥 | `host-hooks.js:27-32` |
| 3-7 | 包的段「没接进默认运行路径」/ 唯一自洽做法是构造前 `collectPackSections`（`docs/24-v5r-containment.md:665,778`） | 已有第三条路：apply 后 `manifest.sections` 晚注册 | `vibe-math-vmu.js:411-427`（该文档为过期） |

---

## 4. 钩子接缝

### 4.1 三张名字表的实际差异

| 集合 | 位置 | 内容 |
|---|---|---|
| `VU_HOOKS`（22，vmu 内部权威） | `kernel/bus.js:44-53` | member/*、budget/*、turn/reply-parsed、meeting/*、ballot/*、record/*、task/*、prompt/section-assembled、pack/*、settle/*、control/* |
| `DEFAULT_FAILURE` | `kernel/bus.js:63-83` | 每钩子默认 open/closed/abort |
| `DSH_HOOKS`（loader 允许模块订阅的基座名，18） | `kernel/loader.js:25-31` | 含 `tools/*`、`prompt/assemble`、`prompt/section`、`agent/*`、`subagent/*`、`session/*`、`fs/write-intent`、`settings/changed`；另接受 `workflow/*` 前缀（`:53`） |
| `BRIDGED_HOOKS`（host-hooks 真正会 `ctx.on` 的，14） | `host-hooks.js:27-32` | 含 `system-prompt/assemble`、`agent/created`；**不含** `agent/request`、`agent/request-error`、`agent/inbox`、`session/flush`、`prompt/section` |
| `BRIDGE_TOPICS` | `kernel/bus.js:60` | `host/waterfall` |

⚠️ `DSH_HOOKS ⊃ BRIDGED_HOOKS`：一个模块可以合法订阅 `agent/inbox`（loader 通过）却在真机上永不被桥接 ⇒ 「校验通过但静默不触发」，与 loader 自己宣称的「typo 不会静默」形成缺口。
⚠️ 未在本会话核对 DSH 侧真实事件名（`prompt/assemble` vs `system-prompt/assemble`）；asar 内路径不可直接 grep，交给真机面（vmu-verify）。

### 4.2 注册与发射点

- **总线发射**：22 个冻结名全部有生产者（生成索引 `docs/05-middleware.md:363-388`）；本会话抽查 `pack/loading|pack/loaded`（`kernel/pack.js:303,374`）已接。
- **vmu 内部钩子 → 宿主**：`attachHostHooks()`（`host-hooks.js:81-205`）。
  - 计划钩子集：`settings['vmu.middleware.entries']` ∪ `kernel.bus.status().entries` ∩ `BRIDGED_HOOKS`，另强制加 `tools/pre-execute` + `agent/turn-stopping`（当 `vmu.limits.toolCallsPerTurnCap>0`）——`host-hooks.js:89-111`。
  - 注册：`ctx.effect(() => ctx.on(hook, listener), 'vmu:hook:'+hook)`（`:179-181`）；`refresh()` 幂等重扫（`:189`）。
  - 状态→宿主决策映射：`toPreExecuteDecision`（deny/cancel/ask；`rewriteArgs` **具名拒**）、`toPostExecuteDecision`（replaceResult/block）——`:47-73`、`:161-175`。
  - 每回合工具预算在这里计数与复位（`:131-144`）。
  - **桥接调用**：`bus.emit(hook, payload, { bridge: true })`（`:152`）——`bridge:true` 是 `bus.emit` 名字校验的豁免口（`kernel/bus.js:289-295`）。
- **插件侧挂接**：仅当 `hooks.plan().count > 0` 才 attach（`vibe-math-vmu.js:294-304`）；packs/modules 装载后再 `hooks.refresh()`（`:442,483`）。

### 4.3 精读：`packs/v5r/middleware/prompt-switches.js`

- 纯函数 `decideSections({settings, turn})`（`:65-115`）返回 `{decisions, errors}`，无管线/内核/I/O（`:63`）。
- 四组开关：三个可选段（`:25-29,71-73`，**OFF 即零注入**）、两份回复目录二选一（`:32,77-80`）、会议三态（`:35-39,89-99`，**未点名 `meetingState` ⇒ 三段全关**，且不猜）、形式化四分支恒有其一（`:42-47,101-112`）。
- 未知名具名拒：`VMU_INVALID_ARGUMENT`（`:90-96,103-109`）。
- 条目记录 `v5rPromptSwitchMiddleware = { id:'v5r.prompt-switches', kind:'module', on:'prompt/assemble', apply:decideSections }`（`:123-128`）。
- **真实消费点**是 `kernel/turn/index.js:279-283`（`sectionPolicy`），经 `vibe-math-vmu.js:222` 硬编码注入；其 `on:'prompt/assemble'` 只是标签（该条目**不进总线**，所以 `host-hooks` 也不会为它挂 DSH 监听）。
- 与 `src` 的关系：`kernel/turn` 只保留机制（disable/enable 段），策略词表全在 pack（`kernel/turn/index.js:274-283`；`docs/27-pack-folder.md:52-67`）。

---

## 5. 风险与空白（按严重度排序；标注「文档先行、实现缺失」）

**R1 · 严重 · 提示词管线的 settings 通道在真实装配中缺失（文档先行、实现缺失）**
`createKernel` 不把 `settings` 传给 `createPromptPipeline`（`kernel/index.js:452`），导致 `vmu.prompts.sections`（内联段）、`overrides`、`overridesByLang`、`locale.*`、`glossary.*` 在真机上全部无效，而 `docs/04-settings.md:893-916` 逐键标「✅ 已接线」。
连带副作用：`glossaryMode` 恒 `enforce`（`kernel/prompt/index.js:91`）+ `readFile` 恒存在（`vibe-math-vmu.js:224`）⇒ 本体不可读即**整次装配 `ok:false`**（`:442-461`）。单测直传 settings 故测不出。**未改动代码，只登记。**

**R2 · 严重 · pack 的 settings 语义分裂（用户赢 vs 重叠即拒）**
插件路径 `{...packDefaults, ...userSettings}` 用户赢（`vibe-math-vmu.js:221`）；pack apply 路径同键即 `VMU_PACK_CONFLICT`（`kernel/pack.js:318-338`）。同一份包，两种「谁赢」的答案；且存在第二条 pack 通道 `kernel.usePack()`，它只收 `id`+`aliases`，不施加 settings/slots/tracks/rules（`kernel/index.js:1017-1046`）。

**R3 · 高 · 声明式字段无消费者（文档先行、实现缺失）**
- `promptPolicies`：校验+计划有，apply 无（`kernel/pack.js:125,250` vs `:315-368`）；真实策略靠插件硬编码 v5r（`vibe-math-vmu.js:222`）。
- `section.range`：入参被读取但 `register()` 忽略，区间只由 `order` 推（`kernel/prompt/index.js:199-200`）；`packs/example-data/prompts/sections.json:9-11` 因此把段放进内核 `facts` 区间，与 `docs/06:100` 的「pack 不得占内核区间」直接冲突。
- `collectPackSections`：文档点名的生产 API，仅测试使用（`tests/vmu-turn.test.mjs:17`）。

**R4 · 高 · 总线的 M3/M4 形态是纸面能力（文档先行、实现缺失）**
`kind:'script'` / `'plugin'` 被 `validateEntry` 接受（`kernel/bus.js:97`），但无任何装载/执行路径；带 `file` 的条目在 emit 时被记为 `middleware/skipped` 后跳过（`:301-304`）。文档 05 §2/§6.1 把它们写成已实现形态（`docs/05:60-61,211-213`），docs/19 E2/E3 又把 `handler 或 file` 当作等价（`docs/19:53,65`）。

**R5 · 高 · 「内核对上无依赖」在插件入口层被破坏**
`vibe-math-vmu.js:20-22,222` 静态 import 并**无条件**注入 v5r 的策略/通知/相位；`config.packs` 为空时 v5r 的机构策略依然生效。R1/D5 的「框架不认识机构」只在 `kernel/**` 成立。

**R6 · 中 · 钩子集合三张表不同步**
`DSH_HOOKS`（loader，18）⊃ `BRIDGED_HOOKS`（host-hooks，14）：`agent/inbox`、`agent/request*`、`session/flush`、`prompt/section` 可被模块合法订阅但永不桥接；`prompt/section-assembled` 是内核装配钩子却不在桥接集。真机 DSH 事件名未核（本会话环境不可读 asar 内 `dsh/`）。

**R7 · 中 · 文档自相矛盾（同卷/跨卷）**
- docs/05 §5 标题「20 个」vs 同卷生成索引「22 个」（`docs/05:153` vs `:361,388`）。
- docs/05 §5.2/§15-1 说 `pack/loading|pack/loaded` 无生产者，同卷生成索引写明 `pack.js` 是生产者（`docs/05:191,350` vs `:380-381`）。
- docs/24 §7 说「包的段没接进默认运行路径」「唯一自洽是构造前 collect」，已被 `vibe-math-vmu.js:411-427` 的晚注册取代（`docs/24:665,778`）。
- docs/06 §5/§2 的绑定「追加」语义已被改为「单赢家替换」（`docs/06:49,111` vs `kernel/prompt/index.js:481-505`）。

**R8 · 中 · 失败隔离/超时的边界与文档不一致**
- 脚本桥超时用 `vmu.math.timeoutMs`（`kernel/script-bridge.js:127`、`kernel/index.js:717`），非 `hookTimeoutMs`；`docs/05:232` 写错。
- M1/M2 的**加载期**无超时（`kernel/loader.js:120-180`）；仅 handler 运行受 `hookTimeoutMs`（`kernel/bus.js:128,191-198`）。
- `extensions/domain-compliance/` 无装载器、无 import 点（`extensions/domain-compliance/index.js:52`），即「降级为扩展」后**没有调用路径**；`docs/23-extensions-and-deferred.md:77` 只记「已迁出内核」，未给挂载面。

**R9 · 低 · 迁移/卸载的已知空白**
- 总线无 `remove()`，pack unload 只能 `disable`（`kernel/bus.js:138-142`；`docs/05:125,352`）。
- pack `migrations` 不受理（`docs/10-packs.md:94`）。
- 管线无注销，pack 卸载后段仍在（`docs/10-packs.md:203`）；这与「apply 后晚注册 sections」形成不对称（`vibe-math-vmu.js:417-427` vs `:447-449` 的 unload 只 `packLoader.unload`）。

---

## 附：本会话未做的核对（交给真机/验证面）

1. DSH 真实事件名与 `BRIDGED_HOOKS` 的逐一对齐（`prompt/assemble` vs `system-prompt/assemble`；`tools/pre-execute` 的实际签名）。
2. `vmu.prompts.*` 断线在**真机会话**里的可观测后果（是否仅在装了 glossary 且可读时装配才成功）。
3. `pack/loading` 的拦截语义在真机 preset 行（`config.packs`）下是否真的触发（M1/M2 端到端未亲测，`docs/19:96` 自承）。
4. `v5r` 段经晚注册进入回合装配后的**逐字节**语料比对（单测覆盖纯函数，真机未比对，`docs/06:311` 自承 GATE_SCOPE 未含真机）。
