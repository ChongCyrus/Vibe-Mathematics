# 10 · 提示词段与设置 · 参考卷

> ★ **本文的证据规则**：**每一句结论后面都挂 `file:line`** ✓；★ **凡我没读到实现的地方，一律写明「未验证」并给补法** —— ★ **绝不把"没读到"写成"没问题"** ✓。
> ★ **路径基准**：仓库根 `D:\wd\vibemath开发\Vibe-Mathematics`；下文相对路径即从此起算。
> ★ **行号时点**：本文所有行号**取自本轮实读**的那一刻；★ 该文件在既往轮次里发生过行漂移（例如 `scope:` 从 `:361` 漂到 `:377`）⇒ ★ **引用时请以内容为准，行号为辅** ✓。

---

## 第 1 半 · 提示词段与绑定

**读的对象**：`vibe-math-vmu/kernel/prompt/index.js`。

### 1.1 段的字段表（从实读行归纳）

| 字段 | 含义 | 必需性 | 形状 | 默认 | 校验/读取处 |
|---|---|---|---|---|---|
| `name` | 段名（注册表键的一半） | ★ 必需 | kebab-case 字符串 | — | `:62` `KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/` ✓ |
| `order` | 排序号（**range 由它派生**） | ★ 可选 | 整数 | **600** | `:314` `Number.isInteger(section.order) ? section.order : 600` ✓ |
| `range` | 显式声明的区间名 | ★ 可选 | `facts`/`charter`/`contract`/`pack`/`override` 之一 | `null`（⇒ 由 `order` 派生） | `:324` 读取；`:326-335` 校验 ✓ |
| `source` | 来源标记（`kernel` 或 `pack:<id>`） | ★ 可选 | 字符串 | **`'kernel'`** | `:325` `…: 'kernel'` ✓；`:337` 用 `startsWith('pack')` 判框架区间 ✓ |
| `scope` | 命中条件（**不是**可见性开关） | ★ 可选 | 对象，见 §1.2 | `null` | `:377` `scope: section.scope \|\| null` ✓ |
| `mutable` | 能否被再注册（不可变段携带只读事实） | ★ 可选 | 布尔 | `true`（**例外：`state` 恒 false**） | `:379` `name === 'state' ? false : section.mutable !== false` ✓ |
| `lang` | 段文本语言（参与注册表键） | ★ 可选 | 字符串 | `null` | `:383`；`keyOf(name, section.lang)` 见 `:342` ✓ |
| `terms` | 本段引用的 id 列表 | ★ 可选 | 字符串数组 | `[]` | `:384` ✓ |
| `text` | 段正文 | ★ 可选 | 字符串 | `null` | `:385` ✓ |
| `template` | 模板（与 `vars` 配套） | ★ 可选 | 任意 | `null` | `:386` ✓ |
| `vars` | 模板变量 | ★ 可选 | 数组 | `[]` | `:387` ✓ |
| `truncate` | 截断策略 | ★ 可选 | 任意 | `null` | `:388` ✓ |
| `replaces` | **覆盖声明**（谁能顶掉谁） | ★ 条件必需（见 §1.5） | 字符串数组 | `[]` | `:364` `Array.isArray(section.replaces) ? section.replaces.map(String) : []` ✓ |

### 1.2 绑定的字段表（`section` ＋ **五维**）

★ **绑定形状**：`{ section, <恰一个维度>: 值, text }` —— ★ 作者原话见 `:268`：*"The raw binding shape is the same one the factory and the tests use: `{ section, <one dimension>: value, text }`"* ✓

| 维度 | 语义 | 来源 |
|---|---|---|
| `role` | 角色 **key**（不是显示名） | `:275` 五维数组 ✓；★ `:45-48` 明确 `role` 是 key、`roleLabel` 是显示名，**混用会让绑定依赖显示文本** ✓ |
| `phase` | 阶段 | 同上 ✓ |
| `member` | **所内成员 id** | 同上 ✓ |
| `task` | 任务维度 | 同上 ✓ |
| `agent` | **宿主 DSH agent 身份** | ★ `:53` `BINDING_PRIORITY` 与 `:275` `dims` **都已含 `agent`** ✓ |

★ **优先级（低 → 高）**：`:53` `BINDING_PRIORITY = Object.freeze(['role', 'phase', 'member', 'task', 'agent'])` ✓
★ **"恰一维"的具名拒**：`:275-277` —— `dims.length !== 1` ⇒ `refuse('VMU_INVALID_ARGUMENT', 'a binding must name exactly one dimension', 'one of: role < phase < member < task …')` ✓
★ **同一段每次装配只出一个赢家**：`:437` 给每个候选打 `priority: BINDING_PRIORITY.indexOf(dim)` ✓；`:659` `rankOf = (m) => BINDING_PRIORITY.indexOf(m.dim)` ✓；★ **同特异性并列 ⇒ 具名拒**：`:665` hint 逐字 `'give one of them a more specific dimension; priority is ' + BINDING_PRIORITY.join(' < ')` ✓ ⇒ ★ **"并列"不是静默取一个** ✓

### 1.3 五个 `range`（顺序与含义）

| range | 区间 | 含义（注释原文） |
|---|---|---|
| `facts` | `[0, 199]` | *"state, time, budget: **framework-owned**"* |
| `charter` | `[200, 399]` | *"charter / role"* |
| `contract` | `[400, 599]` | *"mechanism contracts that must be replayed every turn"* |
| `pack` | `[600, 899]` | （pack 区间） |
| `override` | `[900, 9999]` | *"overrides and middleware appends"* |

★ 依据 `:23-30` ✓；★ `:23` 注释逐字 *"Kernel-reserved order ranges (docs/06 §7). **A pack may not claim a kernel range**"* ✓
★ **顺序的强制**：`order` 必须落在**某一个**区间内，否则 `:261` `refuse('VMU_INVALID_ARGUMENT', 'section <name>: order <order> is outside every reserved range')` ✓
★ **`range` 与 `order` 必须自洽**：`:331-335` —— 声明了 `range` 却与 `order` 派生的区间不符 ⇒ `VMU_INVALID_ARGUMENT`，hint 逐字含 *"range is derived from order (docs/06 §3), so the two must agree"* ✓
★ **`facts` 是框架专属**：`:337-341` —— `source` 以 `pack` 开头却落在 `facts` ⇒ `refuse('VMU_NOT_PERMITTED', …, 'facts is framework-owned (docs/06 §4 rule 2): move the order into the pack interval [600,899]')` ✓

### 1.4 覆盖（`replaces`）声明门 ＋ 位移记录

| 情形 | 结果 | 行 |
|---|---|---|
| 段不可变（`state` 或 `mutable:false`）被再注册 | ★ `VMU_NOT_PERMITTED` | `:344-348` ✓ |
| **pack 与 pack 同名** | ★ `VMU_MIDDLEWARE_FAILED`，hint *"pack conflicts are declared explicitly, never resolved silently (docs/10 §4)"* | `:349-352` ✓ |
| **pack 顶掉框架段**且 `replaces` **未**含本段名 | ★★ `VMU_MIDDLEWARE_FAILED`，hint 逐字 *"add replaces: [\"<name>\"] to this section"* | `:363-369` ✓ |
| 同上但**已声明** | ★ 放行，并**记录位移**：`displaced = { section, displacedSource, displacedOrder, replacedBy, declaredReplaces }` ⇒ 进 `replacedSections` | `:370`／`:391` ✓ |

★★ **为什么不用 `disable()`**（作者原话，`:360-362` 逐字）：*"NOT `disable(name)` + register: the render loop skips a disabled section **WHOLE by name** (`:590`), and this replacement **shares that name** - it would suppress the replacement itself and inject **NOTHING**, silently. The record therefore lives in `replacedSections` and the section stays enabled."* ✓
★ 该分支的**由来**（`:353-357` 逐字）：*"MEASURED BEFORE THIS BRANCH EXISTED: … a pack section colliding with a framework one fell straight to `registry.set` … the framework text **disappeared**, the pack text rendered, and **nothing was refused or reported**."* ✓
★ **未验证**：`disable()` 的渲染跳过**确在** `:590` —— 我读到的只是 `:360` **注释里写的** `:590`，**未自读该行**。★ 补法：`Get-Content vibe-math-vmu\kernel\prompt\index.js | Select-Object -Skip 585 -First 12`。

### 1.5 模板变量白名单（全表）＋ 越界后果

★ **全表（原文数组，`:50` 逐字）**：
`['member', 'role', 'roleLabel', 'phase', 'time', 'pack', 'task', 'roster', 'round', 'quorum', 'statusBlock', 'setting:', 'count:']` ✓
⇒ ★ **共 13 项**；★ 后两项是**前缀**（`setting:`／`count:`），不是具体变量名 ✓

| 情形 | 判定 | 行 |
|---|---|---|
| `key` 在表内 | 放行 | `:482` ✓ |
| `key` 以 `setting:` 开头**且**表内含 `'setting:'` | 放行（★ 即 `{{ setting:<任意已声明键> }}` ⇒ 值取自内核活设置） | `:483` ✓ |
| 同上，`count:` | 放行 | `:484` ✓ |
| 其它 | ★ `refuse('VMU_INVALID_ARGUMENT', 'unregistered template variable: ' + whole, 'the whitelist is docs/03 §4 / docs/06 §5: ' + VARIABLE_WHITELIST.join(', '))` | `:486-487` ✓ |

★ **`scope` 的通配语义（容易读错，故此单列）**：`:413-420` 的 `hit(dim, value)`：
- `scope[dim] === undefined` **或** `'*'` ⇒ **命中 true** ✓（★ 即"**不写该维 ⇒ 该维视为通配**"，**不是**"不命中"）；
- 否则把值转成数组后 `includes` ✓。
⇒ ★ **注意**：这与"未设的值 ⇒ 不命中任何人"是**两种相反语义**；若某处要后者（例如 `agent` 维），**必须在调用点另行实现**，`scopeMatches` 本身不会那样做 ✓

★ **一处已修的历史缺陷（值得记）**：`:252-255` —— appends 曾是**跨装配累积**的单一数组 ⇒ 一条 middleware append **永久留在提示词里**、提示词单调增长；现改为**只保留最后一次装配的 appends**（`let lastAppends = []` ＋ `:555 lastAppends = appends`）✓

---

## 第 2 半 · 设置

### 2.1 两个 `settings/` 目录的分工

| 目录 | 角色 | 实体（实测存在） | 大小（由 `Get-ChildItem` 派生） |
|---|---|---|---|
| `vibe-math-vmu/settings/` | ★ **声明＝代码** | `schema.js`／`planned.js` | `schema.js` 251,706 B；`planned.js` 43,374 B ✓ |
| `vibe-math-vmu/packs/<id>/settings/` | ★ **取值＝数据** | `packs/v5r/settings/defaults.json`／`defaults.js` | 3,730 B／3,047 B ✓ |

★ **能不能删**（我的判断，附依据）：★ **声明目录不可删** —— `SETTING_DEFS` 是**唯一**的声明源，且 `assertDeclared` 未声明即拒（§2.4）⇒ 删一条声明会让所有引用它的部署**立即具名拒** ✓；★ **取值目录可删（逐 pack）** —— 它只是取值，删掉后该 pack 的键回到声明默认（★ **未验证**：这一点我没有读到 fold 的失败语义，仅由"取值为数据"的结构推得 ⇒ **补法**见 §2.6 第 3 条）。

### 2.2 一个键的声明字段（真实条目）

★ **真实条目（逐字，`schema.js:1044`）**：
```js
{ key: 'vmu.meetings.tier', type: 'enum', domain: ['formal', 'light'], def: 'formal', hot: HOT.H1, who: 'office', doc: '会议级别：light＝简流程，**不得产出实体定论**（派生谓词，不是阶段）。读者：`kernel/meetings.js` 的 `K.tier`＋`tier(…' }
```

| 字段 | 含义 |
|---|---|
| `key` | 设置键（点分） |
| `type` | 类型（`enum`／`string`／`natural`／`ratio`／`boolean`／`stringList`／…） |
| `domain` | ★ **闭集取值**（仅部分类型有；`enum` 必备） |
| `def` | 默认值（★ 是否"中性"见本卷外的政策默认值门） |
| `hot` | 热级（`HOT.H1` 等） |
| `who` | ★ **归属**（谁有权改） |
| `doc` | 说明（**含读者线索**） |
| `was` | ★ 历史名（改名后仍可解析；见 §2.4） |

★ **声明全集入口**：`schema.js:1436` `export const SETTING_DEFS = Object.freeze([...CORE_DEFS, ...PLANNED_DEFS])` ✓
★ **未验证**：`HOT.*` 的**取值表**与 `who` 的**合法枚举** —— 我未读它们的定义。★ 补法：`Select-String -Path vibe-math-vmu\settings\schema.js -Pattern "HOT = |WHO = |const HOT|const WHO"`。

### 2.3 加一个新键的完整流程

1. ★ 在 `vibe-math-vmu/settings/schema.js` 里**加声明**（照 §2.2 的字段）✓ —— ★ **注意生成块**：本仓约定**块内手写会被 `regen` 逐字还原**，手写内容要放**块外**并进 `HAND_DECLARED_DOMAINS` 一类机制（★ **未验证**：本卷未自读该生成块的边界 ⇒ 补法见 §2.6 第 4 条）。
2. ★ **必须重跑生成链**（三个都实际存在 ✓）：`node scripts/generate-vmu-settings-table.mjs --write`／`node scripts/update-doc-counts.mjs`／`node scripts/regen-all.mjs --write`。
3. ★ 再 `node scripts/regen-all.mjs --check`（★ `regen-all.mjs` 已核实存在 ✓）。
4. ★ **哪条门禁会红**：★ 这就是 **`tests/audit-silent-keys.mjs`**（★ 实测**存在**，★ 且注意它的扩展名是 **`.mjs` 而非 `.test.mjs`** ✓）—— ★ **未验证**：它**具体的判据**（我未读该文件）⇒ 补法：`node tests/audit-silent-keys.mjs` 直接跑，或读其头部注释。
★ **另一条会红的**：`scripts/check-docs.mjs`（★ 文档计数/引用一致性；本卷的自查用它 ✓）。

### 2.4 读未声明的键会怎样

★ **`assertDeclared(key)`（`schema.js:1479-1488`）**：
```js
1479| export function assertDeclared(key) {
1480|   const canonical = resolveKey(key)
1481|   if (!BY_KEY.has(canonical)) {
1482|     throw refuse('VMU_INVALID_ARGUMENT', 'undeclared setting key: ' + key,
1483|       'declare it in vibe-math-vmu/settings/schema.js first (docs/04 R4)')
1484|   }
1485|   // A FORMER NAME IS ACCEPTED AND RESOLVED, never silently treated as the canonical one: the record returned is the
1486|   // canonical declaration, so a caller that reads `record.key` learns the new name without a second lookup.
1487|   return BY_KEY.get(canonical)
1488| }
```
⇒ ★ **未声明 ⇒ 具名抛出 `VMU_INVALID_ARGUMENT`**，hint 直接指路 ✓；★ **旧名被接受并解析成规范名**（`resolveKey`）✓ —— ★ **不是静默当规范名用**，调用者能从返回记录的 `key` 学到新名 ✓

★ **相关但有别的规则（`:1490-1492` 注释）**：*"I-3: the framework owns time; a user may not hand us an absolute deadline. … so the refusal is for **undeclared, user-supplied instants** only."* ⇒ ★ **有一道专门挡"用户塞绝对时刻"的检查**（`assertNoUserTime`，调用点见 `:1746`）✓

★ **未验证**：`readSetting` / `readKey` / `settingSource` **在 `schema.js` 里并不存在**（我 grep 这三个名字**无命中**）⇒ ★ **"读设置"的公开入口在别处**（很可能在 `kernel/index.js` 的 `settingsView` 一带），★ **本卷不替它编名字**。★ 补法：`Select-String -Path vibe-math-vmu\kernel\index.js -Pattern "settingsView|readSetting|readKey"`。

### 2.5 惰性键（声明未接线）怎么看出来 ＋ 台账在哪

★ **可看出来的地方**（已核实存在）：★ **生成的设置表** —— `scripts/generate-vmu-settings-table.mjs` 会产出「已接线／未判定／未接线」三态（★ 我在 R9 实跑过：`regen-all --write` 的输出行里就有 `settings table (docs/04-§11) :: … keys (… wired, … undetermined, … declared-but-not-wired)` ✓）。
★ **台账**：★ 生成物 `vibe-math-vmu/docs/04-settings.md` 的 §11（★ **具体小节号以生成器当前输出为准**，本卷不手抄编号）✓。
★ **未验证**：是否有**第二**台账（例如专门的 inert-keys 文档）。★ 补法：`Get-ChildItem vibe-math-vmu\docs -Filter "*inert*"`／`Select-String -Path vibe-math-vmu\docs\*.md -Pattern "未接线"`。

### 2.6 设置的优先级/覆盖链 —— ★ **部分未验证（按铁律如实标）**

★ **读到的**：`schema.js:1735` `export function resolveSettings(layers = [], { onInvalid = 'refuse' } = {})`：
- `:1740` 先铺**声明默认**：`for (const d of SETTING_DEFS) out[d.key] = d.def` ✓
- `:1741` 然后**按 `layers` 数组顺序**逐层覆盖 ✓
- `:1746` 每层逐键前先 `assertNoUserTime(k)` ✓
⇒ ★ **机制是"默认 ← 逐层覆盖"，且层序由**调用者**决定** ✓

★ **未验证（关键缺口）**：★ **谁按什么顺序传哪些层**（部署 settings／pack 默认／运行时 set 的相对次序）—— ★ 我**没有**读到任何 `resolveSettings([...])` 的调用点 ⇒ ★ **这正是"优先级链"的核心，我不编**。★ 补法：
`Select-String -Path vibe-math-vmu\*.js,vibe-math-vmu\kernel\*.js -Pattern "resolveSettings\("` ⇒ 从调用点读层序；★ 若无人调用（很可能，R29 曾量到它在包内零调用），则**优先级链实际由内核自己的合并路径实现**，应改读 `kernel/index.js` 的 settingsView／`applyPackSettings` 一带。

★ **另两处未验证**：`defaults.json` 与 `defaults.js` **分别由谁读**（我只核实两文件存在）；★ **`planned.js` 与 `schema.js` 的关系**（`SETTING_DEFS` 已含 `PLANNED_DEFS` ✓，但 `planned.js` 的**生成者**未核）。

---

## 未验证清单（逐条 ＋ 补法）

| # | 未验证的事 | 补法（命令／文件） |
|---|---|---|
| U1 | 渲染循环确在 `:590` 跳过 disabled 段 | 读 `kernel/prompt/index.js` `:585-600` |
| U2 | `HOT.*`／`who` 的取值与合法枚举 | grep `schema.js` 的 `HOT`／`WHO` 定义 |
| U3 | 删掉 pack 的 `settings/` 后键是否回落声明默认 | 读 fold 的失败分支（入口 `vibe-math-vmu.js` 的 pack 折叠块） |
| U4 | `schema.js` 生成块的边界（手写该放哪） | 读 `scripts/generate-wired-schema.mjs` 的块标记 |
| U5 | `audit-silent-keys.mjs` 的具体判据 | `node tests/audit-silent-keys.mjs` ＋ 读其头部注释 |
| U6 | "读设置"的公开入口（`readSetting` 等名不存在） | grep `kernel/index.js` 的 `settingsView` |
| U7 | 惰性键是否有第二台账 | `Get-ChildItem vibe-math-vmu\docs -Filter "*inert*"` |
| U8 | ★ **优先级链的层序与调用者** | grep `resolveSettings(` 的调用点；无则改读内核合并路径 |
| U9 | `defaults.json` vs `defaults.js` 的读者 | grep 两者文件名在入口/loader 中的出现处 |
| U10 | `planned.js` 由谁生成 | 读 `scripts/` 下与 planned 相关的生成器 |

★ **自查**：`node scripts/check-docs.mjs` 的结果写在本卷交付消息里（★ 不以"应该会过"代替实跑）。
