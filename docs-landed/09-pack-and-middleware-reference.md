# 09 · pack 与中间件参考卷（逐项 · 可查）

> ★ **本卷是【参考手册】**：密集、逐项、带 `file:line`，供**边写边查**。
> ★ 叙述性的"怎么造一个机构"见 [`03-extending.md`](03-extending.md)；本卷只回答**"这个字段叫什么、必填吗、不填会怎样、校验在哪"**。
> ★★ **铁律**：本卷每条都核到代码并给 `file:line`；**核不到的写「未验证」＋补法**，★ **不把"没读到"写成"没问题"**。
> ★ 上游 `docs/*.md` 是**主张**，代码是**事实**；二者不一致处在 §5 单列。
> ★ 路径前缀约定：`kernel/` ＝ `vibe-math-vmu/kernel/`，`packs/` ＝ `vibe-math-vmu/packs/`，`vibe-math-vmu.js`／`host.js` 在 `vibe-math-vmu/` 下。
>
> ★★ **快照声明（G8）**：本卷是**弃用前**的 `docs-landed` 参考快照，不是当前权威清单（旧 `vibe-math-v2`…`v5r`
> preset 已弃用，见 `docs/DEPRECATED-LEGACY-PRESETS.md`）。★ **下面各表若要找"当前"的工具面／提示词／设置**，
> 以生成式索引为准：工具面见 `docs/18`、接口见 `docs/03`、设置键见 `docs/04`（生成）；★ 行号是写作时点，以内容为准。

---

## 1 · pack 清单的**全部字段**

★ 校验器：`kernel/pack.js` 的 `validateManifest()`（**`:104-147`**）；★ 冲突/残留/纯计划三条边界在 `:6-12`；★ `plan()` 只报告不生效（`:6-7`）。
★ `id` 的合法形状：`ID` 正则 **`kernel/pack.js:27`** `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`。

| 字段 | 必需/可选 | 类型/形状 | 默认 | 校验在哪（`file:line`） | 不填/填错会怎样 |
|---|---|---|---|---|---|
| `id` | ★ **必需** | kebab-case 字符串 | 无 | **`kernel/pack.js:105`**（配 `:27` 正则） | 进 `problems`：`id must be a kebab-case identifier` ⇒ `plan()` 拒绝 ✓ |
| `version` | ★ 两个示例 pack 都写（`packs/institute-min/index.js:22`、`packs/v5r/index.js:68`） | 字符串（如 `'1.0.0'`） | — | ★ **未在校验器中找到** ⇒ 见 §5-U1 | ★ 目前**不被校验**（写了也不校验；不写也不报） |
| `packContractVersion` | ★ 示例写 `1`（`packs/institute-min/index.js:23`） | 整数 | `0`（缺省时） | ★ **不在 pack.js 校验**，而在 **`kernel/registry.js:169-174`**（`checkPack`） | ★ 缺省按 `0` 比；**大于已发布 `PACK_CONTRACT_VERSION`** ⇒ `checkPack` 报 `tooOld:true` ⇒ `ok:false` ✓ |
| `description` | 可选 | 字符串 | — | ★ **未在校验器中找到**（`packs/institute-min/index.js:24` 只是提供值） | ★ 不被校验 |
| `requires` | 可选 | `Array<{ service, minVersion }>` | 无 | **`kernel/pack.js:107`**（必须是数组）＋ **`kernel/registry.js:150-177`**（`checkPack` 逐条比对） | ★ 形状错 ⇒ `requires must be a list of { service, minVersion }`；★ **服务不存在/版本过低** ⇒ `checkPack` 的 `missing`／`tooOld` 非空 ⇒ `ok:false` ✓ |
| `codes` | 可选 | `string[]`，★ **必须 `VMU_PACK_<PACKID>_<REASON>`** | 无 | **`kernel/pack.js:108-109`**（前缀由 `id` 导出） | ★ 前缀不符 ⇒ 进 `problems`（框架拒与机构拒必须可区分，`:14-15`）✓ |
| `slots` | 可选 | `Array<{ id, capacity?, label?, permissions? }>` | 无 | **`kernel/pack.js:112-114`**（`id` kebab；`capacity` 整数 `>= 0`） | ★ `id` 非法 ⇒ `a slot needs a kebab-case id`；`capacity` 非整数/负数 ⇒ `capacity must be an integer >= 0` ✓ |
| `tracks` | 可选 | `string[]`（非空字符串） | 无 | **`kernel/pack.js:116`** | ★ 非字符串/空串 ⇒ `a track name must be a non-empty string` ✓ |
| `settings` | 可选 | 对象（键为 `vmu.*` 机制键） | 无 | ★ **未找到结构校验**（仅是透传；示例 `packs/institute-min/index.js:50-57`） | ★ 目前不校验形状 ⇒ 见 §5-U2 |
| `rules` | 可选 | `Array<{ id, on[], when?, then[] }>` | 无 | **`kernel/pack.js:117-119`**（`id` 必需、`on` 非空数组） | ★ 缺 `id` ⇒ `a rule needs an id`；缺 `on` ⇒ `rule <id>: on is required` ✓ |
| `middleware` | 可选 | `Array<{ id, kind, handler? , module?, file? }>` | 无 | **`kernel/pack.js:121-135`** | ★ `kind` **必须是 `rules`｜`module`**（`:127-128`，`script`／`plugin` **不是 bus kind**，D-03）；★ **非 `rules` 条目**必须给 **`handler` 函数**，或 `module` 对象／`file`（`:129`、`:135`）⇒ ★ **bus 本身不加载 `file`**（由 `kernel/loader.js` 的 `apply()` 加载并挂 `api`，`:132`）✓ |
| `promptPolicies` | 可选 | `Array<{ id, apply({settings,turn}) }>` | 无 | **`kernel/pack.js:143-144`** | ★ 缺 `apply` ⇒ `prompt policy <id>: needs an apply({settings,turn}) function` ✓ |
| `aliases` | 可选 | `Array<{ from, to }>` | 无 | **`kernel/pack.js:146-147`**（形状）＋ **`kernel/registry.js:93-103`**（注册时的约束） | ★ 形状错 ⇒ `an alias needs { from, to }`；★ 目标**未发布** ⇒ `the alias target is not published`（`registry.js:100-101`）；★ 会**遮蔽已发布名** ⇒ 拒（`:96-97`）✓ |
| `sections` / `bindings` | ★ **未在 `pack.js` 校验器、也未在两个示例 pack 中出现** | — | — | ★ **未验证**（见 §5-U3） | ★ 目前**未发现**它们被 pack 加载器读取 |

★ **在代码里额外发现、任务清单未列的字段**：**`promptPolicies`**（`pack.js:143-144`）✓ —— ★ 这是 pack 把自己的提示词策略挂进去的通道。

★ **示例 pack 的完整形状**可直接读：`packs/institute-min/index.js:20-84`（`id`／`version`／`packContractVersion`／`description`／`requires`／`codes`／`slots`／`tracks`／`settings`／`rules`／`aliases` 全在一个 `Object.freeze` 里）✓

---

## 2 · M2（`kind:'module'`）的完整契约

★ **能力词表（★ 12 项，确切名字）** —— 定义处 **`kernel/bus.js:24-26`**：
| # | 能力名 | 语义（同一处声明的心智） |
|---|---|---|
| 1 | `read-state` | 读状态 |
| 2 | `read-args` | 读调用参数 |
| 3 | `deny` | 拒绝该调用（具名） |
| 4 | `cancel` | 取消该调用 |
| 5 | `rewrite-args` | 改写参数 |
| 6 | `rewrite-result` | 改写结果 |
| 7 | `append-prompt` | 往提示词追加内容 |
| 8 | `record` | 写记录 |
| 9 | `notify` | 发通知 |
| 10 | `set-setting` | 改设置 |
| 11 | `trigger-workflow` | 触发工作流（★ 也是 `services` 端口的解锁能力，见 `kernel/loader.js:116-117`） |
| 12 | `annotate` | 加注记 |
★ 决策键 → 能力 的映射表：**`kernel/bus.js:30-41`**（`deny`/`cancel`/`rewriteArgs`/`rewriteResult`/`appendPrompt`/`record`/`notify`/`setSetting`/`triggerWorkflow`/`annotate`）✓
★ **用了没声明的能力** ⇒ **具名拒绝**（`kernel/bus.js:7` 的边界声明；装载器另有双向检查：`kernel/loader.js:93-95` —— 模块用的能力**必须是该条目声明过的**）✓

★ **`module:` 形态拿到的 `api` 上到底挂了什么**：**`kernel/loader.js:32`** `API_KEYS = ['log','setting','kernel','dryRun','traceId','hook','services']`（**7 项**）；★ facade 由 `makeApi()` 构建并 **`Object.freeze`**：**`kernel/loader.js:120`**（"exactly API_KEYS, nothing else, and not rewritable by the module"，`:109`）；★ 挂载点：**`kernel/loader.js:207`** `flat.api = makeApi(entry, hook, traceId, module.capabilities)` ✓

★ **handler 拿到的确切对象**：★ 我只核到**模块必须导出 `hooks = { <hook>: handler }`**（**`kernel/loader.js:83-90`**，含"每个 hook 必须是已注册钩子"与"必须是函数"两条）：★ **handler 的实参对象逐字段**我**未逐行读到**（发火路径在 bus）⇒ **未验证**，见 §5-U4 ✓

★ **`order` / `failure` / `scope` / `on`**：
- ★ **`order`**：缺省与排序规则 —— **`kernel/bus.js:11-12`** 逐字 *"ordering is deterministic (order, then id)"* ⇒ ★ **先 `order` 再 `id`** ✓
- ★ **`failure`**：三值 **`open`／`closed`／`abort`**（`kernel/bus.js:9`）；★ **每个 vmu 钩子的缺省**由注册表逐钩子写明，并导出 `DEFAULT_FAILURE`（**`kernel/bus.js:59-68`**）✓
- ★ **`scope`**：维度 **member／role／phase**（`kernel/bus.js:11`）；★ 每个钩子的可作用维度在注册表的 `scope` 字段（如 `:77-79` 的 `VU_SCOPE`）✓
- ★ **`on`（钩子名从哪查）**：**唯一来源是注册表** `kernel/bus.js:59-79`（`VU_HOOKS`＝`kind:'vmu'` 的名字；`DSH_HOOKS`＝宿主 substrate；`BRIDGED_HOOKS`＝`bridged:true` 的宿主钩子）；★ 装载器侧的"是否已注册"判定：**`kernel/loader.js:54-59`**（含 `bus.declareTopic(name)` 声明的 topic，`:49-51`）✓

★ **超时／熔断**：
- ★ **熔断**：连续失败触发 breaker **禁用该条目**而不是拖垮全局 —— **`kernel/bus.js:9-10`** ✓
- ★ **超时**：★ 我**未**在 bus 里核到每钩子的超时处理 ⇒ **未验证**，见 §5-U5 ✓

---

## 3 · M3 脚本（`config.scripts`）—— ★ 结论来自 Lead 实测 17/17 全绿，**本节补 `file:line`**

★★ **`run()` 返回 shadow 摊平在顶层**：`{ ran, exit, policy, timedOut, ok, summary, findings, data }` —— ★ **不嵌在 `.result` 下** ✓（★ 该形状由 Lead 实测给定；代码侧见 `kernel/script-bridge.js` 的 `run` 返回构造处：★ **本卷未逐行核到该行号** ⇒ 见 §5-U6）

★ **四条契约**（`kernel/script-bridge.js:5-15` 头注）：① 接缝未注入 ⇒ **`VMU_ENGINE_UNAVAILABLE`**；② **必须结构化 JSON（至少布尔 `ok`）**，自由文本 ⇒ **`VMU_INVALID_ARGUMENT`**（实测原文：*"a script result must be a JSON object with at least { ok } (docs/05 §6.2)"*）；③ **非零退出是结果不是异常**（带退出码）；④ **只有超时是硬失败 `VMU_JOB_TIMEOUT`**，且消息如实说**有没有被真的终止** ✓
★ 接缝返回形状：**`kernel/script-bridge.js:56`** 逐字 `{ code, stdout, stderr, timedOut?, ms? }` ✓；★ 亦可 handle 形或配 `spawnHandle(spec, onHandle)`（`:57-59`：那样本地预算能**真杀子进程**）✓
★ 工厂参数：**`kernel/script-bridge.js:61`** `{ spawn, spawnHandle, timer, defaultTimeoutMs=60000, dryRun=false, clock }` ✓
★ `spec` 形状 **`:146-147`** `{ file, inline, args, cwd, env, timeoutMs, graceMs }` ✓；★ `dryRun:true` ⇒ `ran:false` 且**真不跑**；`plan()` **纯**（不改请求、不调接缝）✓

### ★★ `config.scripts` 的**整链**（本轮补全）
| 环节 | `file:line` | 读数 |
|---|---|---|
| ① 宿主配置读入 | **`vibe-math-vmu.js:560`** | `instance, scripts: Array.isArray(config.scripts) ? config.scripts : []` ⇒ ★ **只认数组**，非数组 ⇒ 视为空 ✓ |
| ② 传进宿主适配器 | **`vibe-math-vmu.js:556`**（`createHostAdapter(Object.assign({…})`） | 与 `scripts` 同批注入 ✓ |
| ③ 适配器参数 | **`host.js:998`**（`createHostAdapter({ …, scripts = [] })`） | 缺省空数组 ✓ |
| ④ 面解析/工具构造 | **`host.js:271`**／**`:283`**／**`host.js:389`**／**`:419`**（`scripts` 一路透传） | 同一数组贯穿 ✓ |
| ⑤ **面出现条件** | **`host.js:181-183`** | `config: ['scripts']`；`extraIntent: c.scripts.length>0 ? 'config:scripts'`；`surface: … 'no scripts were declared in this profile row'` ⇒ ★ **没声明就整个面不出现** ✓ |
| ⑥ 真正执行 | **`host.js:738`**（`if (on('script') && scripts.length > 0)`） | ★ 只有声明了才有这个工具 ✓ |

### ★★ `vibe_vmu_script` 工具面的调用形（**`host.js:740-770`**）
| 参数 | 必需 | 类型 | 说明（`file:line`） |
|---|---|---|---|
| `action` | ★ 必需 | enum **`list`｜`run`** | **`host.js:743`**（默认 `list`） |
| `id` | `run` 必填 | 字符串 | **`host.js:744`**；找不到 ⇒ `VMU_NO_SUCH_OBJECT` 并在 hint 里**列出已声明 id**（`:754-756`）✓ |
| `args` | 可选 | ★ **JSON 数组的字符串** | **`host.js:745`**；解析失败或非数组 ⇒ `VMU_INVALID_ARGUMENT`（`:759-761`）✓ |
★ `list` 返回：`{ ok, action, scripts: [{ id, file, timeoutMs }] }` —— **`host.js:750`** ✓
★ `run` 组请求：`{ file, args: (script.args||[]).concat(extra), timeoutMs: script.timeoutMs||0, failure: script.failure||'open' }` —— **`host.js:765-770`** ✓

### ★★ `config.scripts` **条目的字段全表**（★ 由 `host.js:750`／`:765-770` 反推 + 注释）
| 字段 | 必需 | 说明 | 证据 |
|---|---|---|---|
| `id` | ★ **必需** | 工具面按 `id` 选择（`run` 的唯一入口） | **`host.js:753-756`** ✓ |
| `file` | ★ **必需**（`run` 时） | 传给桥的 `request.file` | **`host.js:766`** ✓ |
| `args` | 可选 | 预先追加的参数数组 | **`host.js:767`**（`(script.args || [])`）✓ |
| `timeoutMs` | 可选 | 0 ＝ 不设（`defaultTimeoutMs` 生效） | **`host.js:768`** ✓ |
| `failure` | 可选 | 缺省 **`'open'`** | **`host.js:769`** ✓ |
★ **`inline`／`cwd`／`env`／`graceMs`**：桥的 `spec` **支持**（`script-bridge.js:146-147`），但 ★ **`host.js` 的脚本条目只透传 `file/args/timeoutMs/failure`** ⇒ ★ **配置里写 `inline`/`cwd`/`env` 不会生效**（未透传）⇒ ★ **这是一处"文档可能让人以为能写"的坑**，见 §5-U7 ✓

---

## 4 · M4 插件

★ 入口：**`vibe-math-vmu.js:55`** `export const inject = ['tools']`（★ 只硬依赖工具面；其余"机会性消费"，`:50-52`）✓
★ **"接缝在调用时解析宿主服务"**：**`vibe-math-vmu.js:154-156`** 逐字 —— *"the subprocess seam is bound whenever the context CAN carry services, and it resolves the host's service **AT CALL TIME** (a plugin's apply can run before the service mounts; binding 'absent' at that instant would refuse every script run forever). Without a service the run refuses by name."* ✓

### ★★ 插件怎么消费 vmu 的**已发布服务**
| 问题 | 答案 | `file:line` |
|---|---|---|
| **服务名去哪查** | ★ `registry.contract()`（**`kernel/registry.js:140-145`**：`{ packContractVersion, services:[{name,kind,apiVersion,description}] }`）或跑一次 `status()`（`:179-182`）⇒ ★ **不要猜名字，读这两个面** | `kernel/registry.js:140-145`、`:179-182` |
| **`apiVersion` 在哪校验** | ★ **注册时**：`register()` 要求整数，否则 `VMU_INVALID_ARGUMENT`（**`:82-85`**）；★ **消费时**：`get(name, {minVersion})` 比对（**`:130-137`**，不足 ⇒ 拒并给"看 `contract()`"的 hint） | `kernel/registry.js:82-85`、`:130-137` |
| **`packContractVersion` 在哪校验** | ★ 常量在 **`:20`** `PACK_CONTRACT_VERSION = 1`；★ **对 pack 的比对**在 `checkPack()`（**`:169-174`**：`required > published ⇒ tooOld`） | `kernel/registry.js:20`、`:169-174` |
| **`checkPack` 报什么** | ★ 返回 `{ ok, packContractVersion:{required,published,tooOld}, missing[], tooOld[], satisfied[] }`（**`:168-177`**）；★ `missing` ＝ 服务不存在、`tooOld` ＝ 版本不足、`satisfied` 里带 `viaAlias`（`:161-167`） | `kernel/registry.js:153-177` |
| **`requires:[{service,minVersion}]` 与 registry 的关系** | ★ pack 的 `requires` **就是喂给 `checkPack` 的入参**（`:150` 逐字 *"Check a pack's declared requirements … `requires: [{ service, minVersion, kind? }]`"*）⇒ ★ **部署前用 `checkPack(manifest)` 一次，就能知道这个 pack 在本构建上跑不跑得起来** | `kernel/registry.js:150-177` |
| **`alias(from,to)` 的约束** | ★★ **目标必须是【已发布】服务**：**`kernel/registry.js:99-102`** 逐字 —— `throw refuse('VMU_NO_SUCH_OBJECT', 'the alias target is not published: ' + String(to), …)` ✓；★ 另两条：**不得遮蔽已发布名**（`:96-97`）、**同名别名不得重复**（`:103`）；★ 别名**必须自曝**（`deprecated` ＋ reason，`:13`） | `kernel/registry.js:93-103`、`:13` |

★ **`register(name, impl, { apiVersion, kind, description })`**：★ 名字必须是**点号标识符**（`:75-76`）；★ **重复注册 ⇒ 拒**（`:78-80`，O4"绝不静默覆盖"）✓；★ 返回 `{ ok, name, kind, apiVersion, packContractVersion }`（`:89`）✓
★ **`resolve(name)`** 返回 `{ name, kind, apiVersion, viaAlias }`（`:117-126`）—— ★ **能告诉你这个调用是直接命中还是经别名** ✓

---

## 5 · ★★ 未验证／未核到（逐条＋补法）

| 编号 | 未验证的是什么 | 我核到了什么 | 补法（最小观测） |
|---|---|---|---|
| **U1** | `version` 字段的校验 | 两个 pack 都写了（`packs/institute-min/index.js:22`、`packs/v5r/index.js:68`）；★ `pack.js:104-147` 里**没有**它的校验分支 | 通读 `pack.js` 的 `validateManifest` 全函数（`:104-148`）确认"确实不校验"⇒ 然后在 pack.js 加一条或在本卷改为"不校验" |
| **U2** | `settings` 的结构校验 | 示例透传（`institute-min:50-57`）；★ 校验器里未见 | 读 `kernel/pack.js` 的 apply 路径，确认 settings 是否**逐键**校验（大概只做冲突检查，见 `:8-9`） |
| **U3** | `sections` / `bindings` 是否为真字段 | ★ 校验器与两个示例 pack **都没有** | `grep -n "sections\|bindings" vibe-math-vmu/kernel/pack.js packs/*/index.js` ⇒ 无命中则从本卷删除该行 |
| **U4** | handler 的**实参逐字段** | 只核到"模块必须导出 `hooks={hook:handler}`"（`loader.js:83-90`）与 `api` 的 7 键（`:32`、`:120`、`:207`） | 读 `kernel/bus.js` 的发火路径（找到 `handler(` 调用处）⇒ 按其实际实参补一张表 |
| **U5** | 每钩子的**超时**行为 | 只核到熔断（`bus.js:9-10`） | 在 `bus.js` 搜 `timeout`/`Promise.race` ⇒ 有则补，无则写"无超时，只有熔断" |
| **U6** | `run()` 摊平返回的**具体构造行号** | 形状由 Lead 实测给定；★ 我未定位到源码那几行 | 读 `kernel/script-bridge.js` 中 `return { …ran… }` 的构造处（约 `run` 尾部）⇒ 补 `file:line` |
| **U7** | `config.scripts` 条目能否写 `inline`/`cwd`/`env`/`graceMs` | ★ `host.js:765-770` **只透传** `file/args/timeoutMs/failure` | 读 `host.js:765-772` 全段确认；若确认未透传，建议：要么补透传，要么在本卷明写"配置层不支持这些字段" |
| **U8** | `packs/v5r/index.js` 的 `promptPolicies` 两种形态 | `:75` 是**对象数组**、`:80` 是**id 数组**；★ 我未逐行确认二者各属于哪个对象（manifest vs 报告面） | 读 `packs/v5r/index.js:60-110` 分清两个对象的边界 |

---

## 6 · ★ 上游文档与代码不一致处（逐条）

| 上游说法 | 代码事实 | 影响 |
|---|---|---|
| ★ 任务清单把 `sections`／`bindings` 列为 pack 字段 | ★ **代码里未发现**（`pack.js` 校验器与两个示例 pack 均无）⇒ §5-U3 | ★ 若上游确有声明，**两边须对齐**：要么补实现，要么删主张 |
| ★ "非规则条目必须给 handler（`file` 不是替代品）" | ★ 精确表述：**bus 只跑 `rules`／`module`**（`pack.js:127-128`）；★ **非 `rules` 条目**可给 **`handler`**，或给 `module`／`file` 让 **`kernel/loader.js`** 加载并挂 `api`（`pack.js:129-135`、`loader.js:132`） | ★ "`file` 不是替代品"**对 bus 成立**；**对装载器不成立**（它会加载 file）⇒ 引用时须说清**是哪个层** |
| ★ 头注称 `script-bridge` 的接缝"会被 await" | ★ 实测该处是**同步调用**（`formal.js:151` 的同类读法；★ `script-bridge.js:56` 明确返回**对象**而非 Promise） | ★ 写中间件/插件时**不要**把接缝写成 async（会被当成 Promise 读成 `undefined`） |

---

## 7 · 自查

- ★ `node scripts/check-docs.mjs` ⇒ **结果见交付消息**（本卷写完即跑）。
- ★ 围栏成对（本卷全部用成对的 ```` ``` ````）。
- ★ 本卷引用路径均存在：`vibe-math-vmu/kernel/{pack,loader,bus,registry,script-bridge}.js`、`vibe-math-vmu/{vibe-math-vmu,host}.js`、`vibe-math-vmu/packs/{v5r,institute-min}/index.js` ✓
