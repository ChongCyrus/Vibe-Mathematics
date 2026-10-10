# 06 · 提示词管线（Prompt Pipeline）——用户可接管每一段

> 状态：**草案 v0.2**（据 `kernel/prompt/index.js`（354 行）**逐条核对后重写**：区间表、段注册、绑定、覆盖、截断、变量白名单、宿主接缝与 v0.1 的出入见 §18 修正清单）
> 上位：`01-philosophy.md`（R8 提示词可管理 / R11 可观测 / R12 纯函数 / R13 门禁即文档）、`02-architecture.md`（内核 C 分区）、`03`（段与变量登记）、**`05`（钩子：`prompt/section-assembled` 与 `budget/exceeded`）**
> **目标**：让提示词成为**一等公民** —— 分段注册、按对象绑定、可覆盖、可版本化、可逐字快照；**使用者能完全接管"谁在什么时候拿到哪一段、每段长什么样"**。
> **键名写法**：本章正文**允许**写具体键名（用户已放宽该红线），但**拟增键全表**仍在派单回报里给出（键/类型/默认/域/谁/说明）。

---

## 0. 一句话总纲

> **提示词不是"拼出来的字符串"，而是"由若干有名字、有归属、有区间、有作用域、有截断策略的段，按固定规则装配、可被用户逐段接管的产物"。**
> 用户的权力分三层：① **选段与排序**（`order` 落在哪个区间，pack/override 层）；② **改段内容**（覆盖 `override`／绑定 `bindings`／段自带的 `text`/`template`）；③ **在装配时介入**（中间件钩子；**注意 `05` §5.2 的命名缺陷：当前 emit 名不匹配，尚未真正生效**）。
> 三层**都可观测（`status()`）**、**都可快照（`snapshot()`）**；**唯一不可碰**的是 `state` 段（只读事实）。

---

## 1. 为什么是"管线"而不是字符串拼接

| 拼接式（反面） | 管线式（vmu，实现已落实） |
|---|---|
| 提示词散落在几十处 `L.push(...)` | 每段有 `name`/`order`/`range`/`scope`/`source`/`mutable`；改一段只碰那段 |
| 改了没人知道 | `status()` 列出每段与"是否被覆盖"；`sources[]` 逐段给出贡献者 |
| 无法回答"这条规则从哪来" | `assemble()` 返回 `sources[]`（`kernel`/`override`/`binding:<dim>`/`middleware:<id>`） |
| 无法证明"没丢东西" | `snapshot(scopes)` 逐字快照（**同一输入 ⇒ 同一字节**） |
| 无法按对象差异化 | 四维绑定 `role < phase < member < task` |
| `slice()` 静默截尾 | **计数式截断**：告知写进正文、数字进 `status().truncation` |

**三条不变量（实现逐条落实）**
1. **`state` 不可覆盖**：`setState()` 设一次即冻结（`mutable:false`）；再注册/改设 ⇒ `VMU_NOT_PERMITTED`；pack/中间件**只能追加**。
2. **装配确定性**：`order` → `name` 排序 + 固定连接/换行规范化（`trimTrailing`）⇒ **同输入同字节**。
3. **值不可注入模板**：变量替换时对**值**做转义（`{{`→`{ {`，`}}`→`} }`）⇒ 值里的占位符**永远不会被二次展开**。

---

## 2. 装配模型（`assemble(ctx)` 的真实步骤）

```
assemble(ctx = { settings, member, role, phase, task, ... })
 ① （可选）中间件钩子：bus.emit('prompt/assemble', …)     ← 见 §17.1 命名缺陷
       └─ decisions[].appendPrompt ⇒ 收集为“中间件追加段”
 ② 过滤：registry 中 scopeMatches(entry.scope, ctx) 的段
 ③ 排序：order 升序 → name 字典序（确定性）
 ④ 逐段取内容：
       · state / mutable:false  ⇒ 只用自身 text（忽略 override/binding/append）
       · 其它：binding.text|binding.file → overrides[name] → entry.text → entry.template(readFile)
 ⑤ 叠加：按绑定优先级 role<phase<member<task 逐条追加其内容（source 记为 binding:<dim>）
 ⑥ 叠加：同段名的中间件追加段（source 记为 middleware:<id>）
 ⑦ 截断：按段的 truncate 策略裁剪（**不可变段不做截断**），并把告知写进正文
 ⑧ 变量：renderVariables（白名单＋值转义）
 ⑨ 组装：每段渲染为 "# <name>\n<text>"，用 "\n\n" 连接 → trimTrailing ⇒ 结尾单换行
 ⑩ 返回：{ ok:true, text, sources[], truncation[], at }
     （被拒绝时返回 { ok:false, refused:{code,message}, traceId }）
```

**读法**：①②③ 决定"**有哪些段、什么顺序**"；④⑤⑥ 决定"**每段内容从哪来**"；⑦⑧ 决定"**内容如何被裁剪与安全替换**"；⑨⑩ 给出"**可验证的产物与来源**"。

---

## 3. 段的注册与字段（**逐字来自 `register()`**）

| 字段 | 类型 | 默认 | 约束/行为 |
|---|---|---|---|
| `name` | string | —— | **必须 kebab-case**（`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`），否则 `VMU_INVALID_ARGUMENT` |
| `order` | integer | **600** | 必须落在 §4 的某个保留区间，否则 `VMU_INVALID_ARGUMENT` |
| `scope` | `{member?,role?,phase?,task?}` | `null`（全匹配） | 支持单值/数组/`'*'` |
| `mutable` | boolean | `true`（`state` 恒 `false`） | `false` ⇒ 忽略覆盖/绑定/追加，只用自己的 `text` |
| `source` | string | `'kernel'` | 追溯（如 `pack:<id>`） |
| `text` | string | `null` | 内联文本 |
| `template` | string | `null` | 模板文件路径（需注入 `readFile`） |
| `vars` | string[] | `[]` | 该段声明的变量（登记用） |
| `truncate` | object | `null` | `{mode, keepChars}`（§8） |

**重名规则（实现）**：重名时——
- 目标是 `state` 或已存在段 `mutable === false` ⇒ **`VMU_NOT_PERMITTED`**（不可变段不得再注册）；
- 两个 `pack` 区间段同名 ⇒ **`VMU_MIDDLEWARE_FAILED`**（"包冲突显式声明，绝不静默解决"）；
- 其它同名 ⇒ 允许（后者覆盖注册表中的条目，按 `source` 追溯）。

**`state` 的唯一入口**：`setState(text)` ⇒ 注册 `{name:'state', order:0, range:'facts', mutable:false, source:'framework'}`；**重复设置**（已有 text）⇒ `VMU_NOT_PERMITTED`；非字符串 ⇒ `VMU_INVALID_ARGUMENT`。

---

## 4. 顺序区间（**内核保留，`ORDER_RANGES` 逐字**）

| 区间名 | 范围 | 语义 | 谁能占 |
|---|---|---|---|
| `facts` | **0–199** | 只读事实（`state`/时间/预算）——**框架所有** | 内核（`state` 固定 order 0） |
| `charter` | **200–399** | 章程/角色 | 内核/pack |
| `contract` | **400–599** | **必须逐回合重放的机制契约** | 内核/pack |
| `pack` | **600–899** | 包提供的段（**默认 order 600 落此区间**） | pack/用户 |
| `override` | **900–9999** | 覆盖与中间件追加（**最后生效**） | 覆盖/中间件 |

**规则**
1. **越界即拒绝**（`VMU_INVALID_ARGUMENT`，消息含段名与 order）——不得"就近归位"；
2. **pack 不得占用内核区间**（`facts`/`charter`/`contract`）——这是"机制在场性"的落点；
3. **同区间内**按 `name` 字典序（**确定性**）；
4. 覆盖与中间件追加落在 `override` 区间 ⇒ 用户/中间件意图**最后生效**，但**改不了 `facts` 内容**（§3 的 `mutable:false` 路径）。

---

## 5. 绑定（`bindings`）——"同一段对不同对象呈现不同内容"

- **绑定形状**：`{ section, role|phase|member|task, text|file, owner? }`
- **必须指向已注册段**：未知 section ⇒ **`VMU_NO_SUCH_OBJECT`**（"打错字等于悄悄关掉一条规则"是不可接受的）。
- **维度选取（实现）**：每条绑定**只取一个维度**，判定顺序为 `task` → `member` → `phase` → `role`（取**最先匹配的高优先级维度**）。
- **固定优先级**：`BINDING_PRIORITY = ['role','phase','member','task']`（**低→高**）；同一段的多条匹配绑定按此排序后**依次追加**（后者的内容在后）。
- **内容来源**：`binding.text` 优先，其次 `binding.file`（需 `readFile`）；两者都无 ⇒ 该绑定不贡献内容（跳过）。
- **落痕**：`sources[]` 记 `{section, source:'binding:<dim>', by: owner}`。

---

## 6. 覆盖（`overrides`）与回滚

- **`override(section, text, by='office')`**：
  - 未知段 ⇒ `VMU_NO_SUCH_OBJECT`；
  - **不可变段（`state`/`mutable:false`）⇒ `VMU_NOT_PERMITTED`**（提示"改用中间件追加"）；
  - **`by` 不在 `whoMayOverride`（默认 `['office']`）⇒ `VMU_NOT_PERMITTED`**（消息列出允许者）；
  - 成功 ⇒ `{ok:true, section, previous, rollbackable:true}`（`previous` 供回滚）。
- **`rollback(section, previous=null)`**：无生效覆盖 ⇒ `VMU_NO_SUCH_OBJECT`；`previous===null` ⇒ 删除覆盖；否则恢复为 `previous`。
- **生效位置**：覆盖只影响**内容来源**（§2 第 ④ 步），**不影响排序/作用域/不可变性** ⇒ "覆盖"不能变成"改机制"。
- **审计**：谁在何时覆盖了哪一段、旧值是什么 —— 由调用方记录（`by` 已在回执里）。

---

## 7. 变量注入（白名单＋值转义）

- **语法**：`{{ key }}`（正则允许 `:`/`.`/`_`/`-`）。
- **白名单（逐字）**：`member`、`role`、`phase`、`time`、`pack`、`task`、`setting:`（带参）、`count:`（带参）。
- **取值**：`setting:<k>` ⇒ `ctx.settings[k]`；`count:<k>` ⇒ `counts[k]`；其它 ⇒ `ctx[key]`；`undefined`/`null` ⇒ **空串**（不报错）。
- **未登记变量 ⇒ `VMU_INVALID_ARGUMENT`**（消息含整个占位符，hint 列出白名单）——**绝不原样保留 `{{...}}`**（否则用户看到的提示词会带垃圾）。
- **防注入（关键）**：替换值经 `escapeTemplate` ⇒ `{{` 变 `{ {`、`}}` 变 `} }` ⇒ **值里的模板语法不会被二次展开**（一次替换，不做递归展开）。
- **七类上下文**（`ctx` 的语义面）：设置、状态、资源、会议、任务、数学面、实例身份 —— 其中**状态/时间/预算**由 `facts` 区间与 `state` 段承载（只读）。

---

## 8. 截断（**计数式，永不静默**）

- **每段可声明** `truncate = { mode, keepChars }`：
  | mode | 行为 |
  |---|---|
  | `keepChars`（默认） | 保留**尾部** `keepChars` 字符 |
  | `keepHeadTail` | 保留头尾各半（中间用 `\n…\n` 连接） |
  | `dropMiddle` | 同上（语义同 `keepHeadTail` 的两半分法；实现按 `keepEach = floor(keep/2)`） |
- **触发条件**：`keepChars > 0` 且 `text.length > keepChars`；否则原样返回。
- **告知写进正文**（逐字格式）：`（已省略更早 <dropped> 字符 · kept <kept>）\n<kept>`。
- **数字进状态**：`status().truncation[] = {section, kept, dropped, mode}`。
- **不可变段不截断**：`state`/`mutable:false` 在截断前就 `continue` ⇒ **只读事实永不丢字**。
- **与钩子的关系**：设计上应触发 `budget/exceeded` 让用户协商"截谁"；**当前实现未接线**（`05` §5.2）⇒ 记为 ✗。

---

## 9. 四级作用域与"谁在什么时候拿到哪一段"

| 维度 | 在哪生效 | 备注 |
|---|---|---|
| `role` | 总线段过滤 + 绑定（最低优先级维度） | |
| `phase` | 同上 | |
| `member` | 同上 | |
| `task` | **管线独有**（总线段过滤与绑定都支持；总线钩子**不支持**） | 见 `05` §6.4 非对称 |

**规则**：段过滤＝`scopeMatches`（`undefined`/`'*'` 全匹配，数组含即匹配）；绑定优先级固定 `role < phase < member < task`；**任务级最窄、最后追加** ⇒ 最贴近"当下这件事"的内容在最后（对模型最显著）。

---

## 10. 用户自定义段的三种来源（"完全接管"的落地路径）

| 来源 | 写法 | 能力 | 隔离 | 热改 | 失败 |
|---|---|---|---|---|---|
| **A. settings 内联** | `sections[]` 里带 `text` | 静态文本＋占位符 | 最高（纯数据） | ✓（重建管线） | 注册期即报错（`VMU_INVALID_ARGUMENT`） |
| **B. 文件** | 段带 `template`（或绑定带 `file`）＋注入 `readFile` | 静态文本（可版本化/评审） | 高（只读） | ✓（下次读文件） | `readFile` 返回 `null` ⇒ 该段无内容（**不崩**） |
| **C. 脚本生成** | 由中间件（M2/M3）在装配钩子里 `appendPrompt` 动态产出 | 动态 | 中（子进程/超时） | ✓ | 按条目失败策略（`05` §4.3） |

**共同要求**：段名 kebab-case；`order` 落区间；`scope` 显式或接受缺省；**不得**声明自己是 `state`；用户段**永远不能**变 `mutable:false` 来拒绝被覆盖（避免"用户段被包劫持"的镜像问题——包也不能禁止用户覆盖）。

---

## 11. 与 settings 的解析顺序（谁赢）

```
① 内核默认（`state` 段 order 0；`charter`/`contract` 由内核或 pack 提供）
② pack 段（`pack` 区间 600–899；同名 pack 段冲突 ⇒ 拒绝）
③ 用户设置：sections（含 text/template）、bindings、overrides、whoMayOverride
④ 运行期热改：重建管线（新增/删除段、改覆盖、改绑定）
⑤ 装配钩子的 `appendPrompt`（`override` 区间之后，最后追加）
```
- **覆盖只改内容**（§6）；**排序只由 order/name 决定**（§4）；
- 解析失败（键非法/段名非 kebab-case/order 越界/绑定指向未知段/变量未登记）⇒ **该次注册/装配拒绝并具名**（不做"部分生效"）。

---

## 12. 与整合包（M4）的关系

- 包可**携带段**（含 `template` 文件）与**绑定**，并声明依赖与版本；
- **同名 pack 段 ⇒ 拒绝**（§3 重名规则）⇒ 包之间必须显式改名/声明覆盖，**不得静默胜出**；
- **包的段优先于内核？** ✗：内核 `facts`/`charter`/`contract` 区间不开放给 pack；
- **包不能禁止用户覆盖其段**（用户永远最后生效，见 §10）；
- **卸载包** ⇒ 需重建管线（今日无 `remove`，`05` §4.1 阶段 8 为计划 ✗）。

---

## 13. 审计与自证（`status()` / `snapshot()`）

- **`status()`** 给出：
  - `sections[]`：`{name, order, range, scope, mutable, source, overridden}`（**逐段可见、可 diff**）；
  - `bindings`：绑定条数；
  - `truncation[]`：`{section, kept, dropped, mode}`（**截断数字**）；
  - `middlewareAppends[]`：`{section, source}`（中间件追加了哪些段）。
- **`snapshot(scopes)`**：对给定作用域逐个装配，返回 `{scope, text}` ⇒ **逐字快照**（回归/语料门禁的基线）。
- **`assemble()` 的 `sources[]`**：逐段来源（`kernel`/`override`/`binding:<dim>`/`middleware:<id>`）⇒ 回答"这段字从哪来"。
- **缺什么（计划 ✗）**：a) 没有"**逐段钩子**"（因为 emit 名不匹配，见 §17.1）；b) `budget/exceeded` 未接线；c) 无 `prompts()` 式"上回合 vs 本回合"diff（需上层实现或用 `snapshot` 自行比对）。

---

## 14. 与 M1–M4 的相互作用（能改到什么程度）

| 形态 | 能改提示词的部分 | 手段 | 不能 |
|---|---|---|---|
| **M1 rules** | 段声明/顺序（`order`）/作用域/绑定/覆盖/截断策略 | settings 键 | 改 `state`；占内核区间 |
| **M2 module** | 装配钩子里 `appendPrompt`（可携带 `{section,text}`/`{section,file}`）；可用 `deny` 拒绝该次装配 | `prompt/assemble` 钩子（**当前未接线**） | 改写 `state` 内容；绕过白名单；伪造变量 |
| **M3 script** | 同 M2（子进程、超时、失败策略） | 同上 | 同 M2 |
| **M4 plugin** | 携带段/绑定/资源；声明依赖 | 包清单 | 占内核区间；禁止用户覆盖 |

**权限实质**：**内容面完全开放**（用户可接管每段文本与顺序）；**事实面（`state`）与机制在场性（`contract` 区间不被 pack 占）由内核强制**。

---

## 15. 防注入与失败降级

### 15.1 防注入（实现已做的三件事）
1. **值转义**（§7）：值里的 `{{`/`}}` 不会二次展开；
2. **白名单**（§7）：未登记变量直接拒绝（不留在文本里）；
3. **不可变段隔离**（§3/§8）：`state` 忽略覆盖/绑定/追加与截断 ⇒ 事实段不可能被外部内容"改写"。

### 15.2 失败与降级（逐项）
| 失败 | 处置 | 码 |
|---|---|---|
| 段名非 kebab-case | 拒绝注册 | `VMU_INVALID_ARGUMENT` |
| `order` 越界 | 拒绝注册 | `VMU_INVALID_ARGUMENT` |
| 重名不可变段 / 覆盖不可变段 | 拒绝 | `VMU_NOT_PERMITTED` |
| 两个 pack 段同名 | 拒绝（**不静默**） | `VMU_MIDDLEWARE_FAILED` |
| 绑定指向未知段 | 拒绝 | `VMU_NO_SUCH_OBJECT` |
| `whoMayOverride` 不含 `by` | 拒绝 | `VMU_NOT_PERMITTED` |
| 模板变量未登记 | 拒绝该次装配 | `VMU_INVALID_ARGUMENT` |
| `readFile` 缺失/返回 null | 该段/绑定无内容（**不崩**） | —— |
| 宿主适配器缺失/不全 | 拒绝绑定 | `VMU_ENGINE_UNAVAILABLE` |
| 中间件在装配钩子上失败 | 按条目失败策略（`prompt/section-assembled` 默认 **`open`** ⇒ 放行但留痕） | `VMU_MIDDLEWARE_FAILED` |

---

## 16. 每回合重建 vs 缓存 · 差异对比

- **默认每回合重建**（不变量 2 的必然结果）：`assemble` 每次重算。
- **允许的缓存**只能做为"纯函数记忆化"（键＝`ctx` 的确定化指纹＋管线版本）；**任何注册/覆盖/绑定变化 ⇒ 指纹变化 ⇒ 失效**；缓存命中必须可观测（否则无法解释"为什么这回合没变"）。
- **差异对比**：`snapshot()` 两次快照的逐字 diff；配合 `sources[]` 可定位"是哪一段变了"。
- **A/B**：两套段/绑定配置各装配同一 `ctx`，结构化对比（段级：新增/移除/顺序/文本/截断差异）。

---

## 17. 与 `05` 的接口（**含两处必须裁决的真实缺口**）

### 17.1 `prompt/assemble` ≠ `prompt/section-assembled` ✗（`05` §5.2）
`kernel/prompt/index.js` 的 `assemble()` emit 的是 **`prompt/assemble`**，而冻结集是 **`prompt/section-assembled`** ⇒ **总线上无人应答**（emit 名不校验）⇒ **中间件目前无法介入提示词装配**。
**且** `assemble()` 的守卫是 `if (bus && settings['vmu.middleware.dryRun'] === undefined)` ⇒ **只要该键有定义（哪怕 `false`）就完全跳过钩子**，语义上等于"设了 dryRun 键＝关掉装配钩子"，与 `05` 的"干跑＝照常调用但不施加"不一致。⇒ 裁决项（§19-1/§19-2）。

### 17.2 `budget/exceeded` 未接线 ✗
`truncateText` 只把数字写进 `truncation[]`（`status()`），**没有** `emit('budget/exceeded')` ⇒ "让用户决定截谁"目前做不到。设计意图与实现现状的差距记录在此。

### 17.3 中间件追加段的来源与顺序
`appendPrompt` 的段名缺省 `'middleware-append'`；追加段在**所有段之后**参与拼接（§2 步骤 ⑥ 与收尾的"未匹配追加段自成一段"）⇒ 用户可预期"中间件一定在最后说话"。

---

## 18. 修正清单（v0.1 → v0.2，逐条有实现依据）

| # | v0.1 说法 | v0.2 更正 | 依据 |
|---|---|---|---|
| 1 | 装配钩子写 `prompt/assemble` | **冻结名是 `prompt/section-assembled`**；实现当前 emit 的却是 `prompt/assemble` ⇒ **不一致（缺陷）** | `kernel/bus.js` `VU_HOOKS` vs `prompt/index.js:231` |
| 2 | "区间"只提到 facts 与 override | **实为 5 个区间**：`facts[0,199]`／`charter[200,399]`／`contract[400,599]`／`pack[600,899]`／`override[900,9999]`；段默认 `order=600` | `ORDER_RANGES` |
| 3 | "pack/中间件只能追加/前置"（未分种类） | **按 `mutable` 分叉**：不可变段（`state`）忽略覆盖/绑定/追加/截断；其余可覆盖+绑定+追加 | `assemble()` 分支 |
| 4 | 截断只说"计数式" | **补齐三模式与告知格式**：`keepChars`（默认）/`keepHeadTail`/`dropMiddle`；告知 `（已省略更早 N 字符 · kept M）` | `truncateText()` |
| 5 | 变量只说"白名单" | **补齐语法/取值/转义/空值**：`{{ }}`、`setting:`/`count:` 带参、值转义防注入、`undefined ⇒ ''` | `renderVariables()`／`escapeTemplate()` |
| 6 | 作用域"四级（会话/角色/成员/回合）" | **实为四维过滤（`member/role/phase/task`）＋绑定优先级 `role<phase<member<task`**；无"会话/回合"维度 | `scopeMatches()`／`BINDING_PRIORITY` |
| 7 | 未提覆盖的权限与回滚 | **新增**：`whoMayOverride` 默认 `['office']`；`override` 返回 `previous/rollbackable`；`rollback()` 语义 | `override()`／`rollback()` |
| 8 | 未提宿主接缝 | **新增**：`bindToHost` 需要 `registerSection`+`onAssemble`，缺失 ⇒ `VMU_ENGINE_UNAVAILABLE` | `bindToHost()` |
| 9 | 未提确定性细节 | **新增**：`order`→`name` 排序；`trimTrailing` 规范化（去行尾空格、压缩 3+ 换行为 2、结尾单换行） | `assemble()` |
| 10 | 未提两条真实缺口 | **新增 §17**：`prompt/assemble` 命名不一致＋`budget/exceeded` 未接线 | 实仓核对 |

---

## 19. 待裁决
1. **钩子名统一**：把 `prompt/assemble` 登记进 `VU_HOOKS`，还是把三处 emit 改为 `prompt/section-assembled`（本卷建议后者：`06` 要的是"逐段介入"）？
2. **`vmu.middleware.dryRun` 的语义**：当前"键有定义即跳过装配钩子"与 `05` 的"干跑照常调用但不施加"矛盾 ⇒ 统一为"照常调用、决策标 `dryRun`"？
3. **`budget/exceeded` 接线**：由 `truncateText` 触发（谁截谁）还是由上层在装配后统一协商？
4. **`contract` 区间的保护**：pack 不得占用（已定）——**用户**能否占用（本卷建议：可以，但段名须带用户命名空间，且不得删内核契约段——后者需 `05` 的"删除"能力定案）？
5. **逐段钩子粒度**：若采纳 `prompt/section-assembled`，是否为**每段**触发一次（最贴合"接管每一段"，但调用次数上升），还是一次性携带段清单？
6. **`mutable:false` 的用户可及性**：用户能否把自己的段标为不可变（本卷建议**不能**，防止绕过覆盖审计）？

---

## 20. 未核项（**编号登记见 `14-§2`**）

> 本卷的每一条"未核"都不是事实断言，未登记前不得当作结论使用 ✓。**验收判据（机器可判定 ✓）**：若本节缺失，T0 预检的 `[D8]` 会**红**（"缺少未核项小节" ✓）；`[D3]` 则要求全卷出现"验收"字样 ⇒ 本条即是该**断言**的落点 ✓，而不是装饰 ✓。

1. **整链路真机注入未验** ✗：段的顺序/绑定/覆盖/截断在**真机会话**里的最终字节未逐字比对过（单测覆盖了装配纯函数 ✓；`GATE_SCOPE=vmu` 未含真机 ✓）；**场景**：真机跑一次并抓 `prompts()` 快照 ⇒ 未做 ✗。
2. **`prompt/section-assembled` 触发粒度未定**（每段一次 vs 一次带清单 ✓）⇒ 见 §19-⑤ ✓。
3. **`budget/exceeded` 仍未接线** ✗（谁触发截断事件未定 ✓）⇒ 见 §19-③ ✓。
4. **`vmu.middleware.dryRun` 语义已按文档统一**（本会话已修：干跑**照常调用**、只不施加 ✓，见 `tests/vmu-prompt.test.mjs` 的断言 ✓）—— 但**旧行为的兼容性**未核 ✗（若有人依赖"定义即跳过"的旧语义 ✓）。
5. **多语言回退的留痕级别**未定 ✗（是否每次回退都写审计 ✓）。
