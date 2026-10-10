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
- **缺什么（计划 ✗）**：a) **逐段触发粒度仍待定**（命名缺陷**已修 ✓**：实现已 emit 冻结名 `prompt/section-assembled`；见 §17.1）；b) `budget/exceeded` 未接线；c) 无 `prompts()` 式"上回合 vs 本回合"diff（需上层实现或用 `snapshot` 自行比对）；d) **G4 多语言的实现面整体未做 ✗**（见 §21）。

---

## 14. 与 M1–M4 的相互作用（能改到什么程度）

| 形态 | 能改提示词的部分 | 手段 | 不能 |
|---|---|---|---|
| **M1 rules** | 段声明/顺序（`order`）/作用域/绑定/覆盖/截断策略 | settings 键 | 改 `state`；占内核区间 |
| **M2 module** | 装配钩子里 `appendPrompt`（可携带 `{section,text}`/`{section,file}`）；可用 `deny` 拒绝该次装配 | `prompt/section-assembled` 钩子（**已接线 ✓**；逐段粒度见 §19-⑤） | 改写 `state` 内容；绕过白名单；伪造变量 |
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

### 17.1 `prompt/assemble` ≠ `prompt/section-assembled` ✅ **已修复（本轮复核 ✓）**
**历史问题**：`kernel/prompt/index.js` 的 `assemble()` 曾 emit **`prompt/assemble`**，而冻结集是 **`prompt/section-assembled`** ⇒ 总线上无人应答（emit 名不校验）⇒ 中间件无法介入装配。
**当前事实（本轮实仓复核 ✓）**：`VU_HOOKS` 注册 **20** 个，**实际 emit 14 个**，其中**含 `prompt/section-assembled`** ✓（`tests/audit-vmu-docs.test.mjs` 的 `KNOWN_UNEMITTED` 也已缩到 6 项，不再包含它）⇒ **本条缺口已关闭**；仍待定的是**触发粒度**（每段一次 vs 一次带清单，见 §19-⑤）。
**仍然存在的相邻问题**：`assemble()` 的守卫是 `if (bus && settings['vmu.middleware.dryRun'] === undefined)` ⇒ **只要该键有定义（哪怕 `false`）就完全跳过钩子**；§20-4 已记"已按文档统一（干跑照常调用、只不施加）"，**旧行为的兼容性未核** ✗。

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
5. **多语言回退的留痕级别**未定 ✗（是否每次回退都写审计 ✓）⇒ 本卷已给出设计（§21.2：**必须**留痕），实现未做 ✗。
6. **G4 多语言的实现面整体未做** ✗：`section.lang`／回退链／语言级覆盖／术语本体一致性／产出物双语／快照带语言，**全部只有设计与判据**（见 §21），代码未动 ✗；**编号登记见 `14-§2`** ✓。
7. **DSH 侧 locale 支持未核** ✗：宿主是否提供 locale/language 注入面（决定"实例默认语言"从哪来）⇒ 见 §21.9 与 `14-§2` ✓。

---

## 21. 多语言与本地化（**G4**）

> **为什么单列一节**：本卷 §1–§20 的一切（段、绑定、覆盖、截断、快照）都默认"只有一种语言"。批评者的 G4 指出：**平台实质上只服务中文** ✗。本节把"**语言**"提升为一等维度，并给出**可检查**的约定，使"提示词可被用户完全接管"在多语言下**依然成立**。
> **一句话**：**语言是段的属性，不是段的内容**；缺语言**必须**按可配的回退链降级，且**每一次降级都要留痕**（**不得静默换语言** ✗）。

### 21.1 段的语言声明
| 字段 | 类型 | 默认 | 语义 |
|---|---|---|---|
| `vmu.prompts.sections[].lang` | string（BCP-47 子集） | **不声明**＝"语言无关/继承实例默认" | 该段文本所属语言 |
| `vmu.prompts.sections[].terms[]` | string[] | `[]` | 该段**引用**的术语 id（取自本体，§21.4） |
| `vmu.prompts.locale.default` | string | 实例默认（**未核**，见 §21.9） | 会话未指定语言时的语言 |
| `vmu.prompts.locale.fallbackChain[]` | string[] | `['zh-Hans','zh','en']` | **回退链**（自左向右） |

- **允许的语言标识**：至少 `zh-Hans`／`zh-Hant`／`zh`／`en`；**大小写与分隔符按 BCP-47 规范化**（`zh-hans` ⇒ `zh-Hans`）。
- **同一段多语言并存**：同一 `name` 可出现多条声明，**以 `lang` 区分**；`lang` 缺省的那条是"语言无关兜底"。
- **非法语言标识 ⇒ `VMU_INVALID_ARGUMENT`**（不静默忽略：一个拼错的 `lang` 会让用户以为"翻好了"）。

### 21.2 回退链与**留痕**（本节的硬规则）
装配取段的顺序（**请求语言 → 回退链**）：
```
① 请求语言（会话/成员/回合）精确匹配
② 回退链逐个尝试（zh-Hans → zh → en）
③ 语言无关段（未声明 lang）
④ 都不存在 ⇒ 按 vmu.prompts.locale.onMissing 处置
```
| `onMissing` | 行为 | 留痕 |
|---|---|---|
| `fallback`（默认） | 用回退命中者；**必须**在 `sources[]` 记 `lang:<请求>→<实际>` | 审计行 `lang-fallback` |
| `skip` | 该段不参与本次装配 | 审计行 `lang-missing(skipped)` |
| `refuse` | **拒绝整次装配**（`VMU_LOCALE_MISSING`） | 拒绝行含请求语言与回退链 |

**三条不可让步**
1. **不得静默换语言** ✗：任何回退都要在 `assemble().sources[]`、`status().locale.fallbacks[]` 与审计行里可见；
2. **回退链可配**，但**不得**跳过 `en`（兜底语言）——否则会出现"没有任何语言能命中"的死角；
3. **回退计数进指标**（与 `21` 可观测卷交叉）：`lang-fallback` 次数是**必测指标**（"用户以为在用中文，其实拿到英文"＝事故）。

### 21.3 覆盖的分层（语言级覆盖 vs 既有 `overrides`）
内容来源的**完整优先级**（与 §6 的覆盖规则**叠加**，不替换）：
```
① 绑定（binding）：binding.text/file（同语言优先）
② 覆盖（override）：overridesByLang[section][lang]  →  overrides[section]（语言无关）
③ 段自身：section.text / section.template（lang 匹配者）
④ 回退链命中者（§21.2）
```
| 键 | 形状 | 语义 |
|---|---|---|
| `vmu.prompts.overrides` | `{section: text}` | **语言无关**覆盖（既有语义，保持兼容 ✓） |
| `vmu.prompts.overridesByLang` | `{section: {lang: text}}` | **语言级**覆盖（同段不同语言**各自覆盖**） |

**四条硬规则**
1. **不可变段不得被语言覆盖绕过** ✗：`state`／`mutable:false` 段**忽略** `overrides` 与 `overridesByLang`（与 §6 同一条拒绝路径：`VMU_NOT_PERMITTED`）——**语言不能成为绕开"只读事实"的后门**；
2. **不可变段不得被"要求翻译"绕过**：对 `state` 段声明非默认 `lang` ⇒ **拒绝**（`VMU_NOT_PERMITTED`，消息说明"事实段只按语言渲染格式、不换词"）；
3. **语言级覆盖优先于语言无关覆盖**（②内部自左向右）；两条都不存在才回到段自身；
4. **覆盖留痕**：`override(section, text, by, lang?)` 回执增 `lang`；审计行记 `{who, section, lang, old, new}`（与 `21` 的"谁改了什么"对齐）。

### 21.4 术语一致（与**机读术语本体** `vibe-math-vmu/glossary.json`）
**本体事实（已核 ✓）**：`glossary.json` 顶层 `{_comment, apiVersion, terms[]}`，**56 个术语**，每条形如
`{id, zh, en, layer, definedIn, note}`（例：`{id:'middleware', zh:'中间件', en:'Middleware', layer:'L3', definedIn:'05-§1', note:'四形态的机制定义手段（M1 规则／M2 模块／M3 脚本／M4 包）'}`）；
`01-§7 术语表` 由 `scripts/generate-glossary-table.mjs` **生成** ✓（单一真源＝本体）。

**约定（可检查 ✓）**
1. **引用术语时从本体取词** ✓：段声明 `terms[]`（**只允许本体里存在的 `id`**）；装配时按**当前语言**取本体的 `zh`（中文系）或 `en`（英文系）字段**逐字**呈现；
2. **不得与本体的规范形冲突** ✗：段文本里若出现该术语的**规范形**（`zh`/`en` 的逐字值），必须与本体**完全一致**（含大小写/全半角/空格）；
3. **未知术语 id ⇒ `VMU_GLOSSARY_UNKNOWN_TERM`**；**规范形冲突 ⇒ `VMU_GLOSSARY_CONFLICT`**；
4. **处置强度可配**：`vmu.prompts.glossary.mode ∈ {enforce（默认，拒绝该段）, warn（留痕并继续）, off}`；
5. **本体版本参与握手**：`glossary.json.apiVersion` 与管线的期望版本不一致 ⇒ `VMU_VERSION_MISMATCH`（**不许**默默用旧词表）；
6. **本体路径可配**：`vmu.prompts.glossary.ontology`（默认 `vibe-math-vmu/glossary.json`）；路径不可读 ⇒ **不是"无术语"**，按 `mode` 处置并留痕。

**可检查的断言（写进 §21.10 的验收）**：对每一段，**抽取**其 `terms[]` 与文本中出现的规范形，**逐字比对**本体对应字段；**任一处不一致 ⇒ 红**（这是"引用一致性"的机器判据，与 `01-§7` 生成物同源）。

### 21.5 产出物语言（回执／报告／纪要）与**双语并存**
| 产出物 | 语言策略 | 关键点 |
|---|---|---|
| **工具回执** | **请求语言优先**，缺失走回退链（§21.2） | 回执带 `lang` 与 `fallback`（可判"我收到的是不是我要的语言"） |
| **报告/摘要** | `vmu.report.language`（默认随会话 locale）＋`vmu.report.bilingual` | 双语时**同一结论并存** |
| **会议纪要** | 必须带 `lang` 标注；双语＝**同一条目的两个语言字段** | **不得**生成两条时间/作者不同的记录（否则史实分叉） |

**双语并存的形状（硬约束）**
```
{ conclusion: { zh: '…', en: '…' }, at, by, lang: 'zh-Hans', translations: ['en'] }
```
- **一次结论、两个语言字段** ⇒ 结论**不可能**因翻译而分叉；
- **来源标注**：哪个语言是**原始产出**（`lang`），其它是**译本**（`translations[]`）；
- **译本可回退**：译本缺失 ⇒ 呈现原文＋"未译"标注（**不得**呈现空串或机器乱码 ✗）。

### 21.6 审计与可复现（**快照必须带语言**）
- **`snapshot(scopes)` 的条目必须含语言**：`{scope, lang, fallbacks[], text}`（**缺 `lang` 的快照不可用于 A/B** ✗）；
- **A/B 可比性**：**仅同语言可比**；跨语言比对必须显式声明"这是**翻译对照**，不是 A/B"（否则把翻译差异误读成机制差异 ⇒ 错误结论）；
- **缓存键含语言**：指纹＝（结构＋绑定＋覆盖＋**语言＋回退结果**）⇒ 语言切换**必须**使缓存失效（否则会拿到上个语言的文本 ✗）；
- **追踪贯通**：`traceId` 关联的审计行增 `lang` 与 `fallback`（与 `21` 的追踪一致）；
- **确定性不变**：给定（设置＋语言＋回退链），装配仍是**纯函数**（§1 不变量 3 在多语言下继续成立 ✓）。

### 21.7 计划中的工具与配置（✗ **未实现**）
| 名称 | 类型 | 目标形状（草案） | 状态 |
|---|---|---|---|
| `vibe_vmu_locale`（**计划/未实现**） | 工具 | `action=list|validate|coverage`：列出实例支持语言、校验回退链、给**语言覆盖率**（哪些段有 `en`） | ✗ 未实现 |
| `vibe_vmu_prompts_snapshot`（**计划**，与 §20/`21` 交叉） | 工具 | 快照**带语言**导出与 diff（同语言 A/B） | ✗ 未实现 |
| `vibe_vmu_glossary`（**计划/未实现**） | 工具 | `action=list|check`：列术语、按段/语言查引用一致性 | ✗ 未实现 |
| `vibe_vmu_explain`（**计划**，见 `21`） | 工具 | 解释"为什么这段回退/被拒/冲突" | ✗ 未实现 |

### 21.8 与既有机制的关系（一张图）
```
用户设置（sections/bindings/overrides/overridesByLang/locale/glossary）
   │  §11 解析顺序
   ▼
装配：作用域过滤 → order 排序 → 语言选取（§21.1）→ 回退（§21.2）→ 覆盖分层（§21.3）
   │                                                    │
   │                                         术语取词/校验（§21.4）
   ▼
产出：段文本（带 lang 与 sources）→ 快照（§21.6）→ 回执/报告/纪要（§21.5）
```

### 21.9 未核项（**G4**；编号登记见 `14-§2`）
1. **DSH 侧 locale/language 注入面**是否可用（决定 `vmu.prompts.locale.default` 的来源）⇒ **未核** ✗；
2. **翻译工作流**（谁翻、何时翻、如何校验一致性）⇒ **未做** ✗（本卷只定"校验约定"与"双语并存形状"，不定流程）；
3. **语言覆盖率基线**（56 术语与全部内核段是否都有 `en`）⇒ **未核** ✗；
4. **RTL/复数/格式化**（数字/日期/单位随语言的呈现）⇒ **未核** ✗（本卷只定"数值不变、呈现可变"的原则）；
5. **术语本体的演进**（新增/改名的兼容路径）⇒ 依赖 `13` 的废弃三阶段（**未接**）✗。

### 21.10 验收（**机器可判定**）
1. **回退必留痕（断言）**：构造"请求 `zh-Hant`、只有 `zh`/`en`"的输入 ⇒ `sources[]` **必须**含 `lang:zh-Hant→zh`，且审计行含 `lang-fallback`（缺失即**红**）；
2. **不可变段不可被语言绕过（断言）**：对 `state` 段设 `lang`/语言级覆盖 ⇒ **必须**返回 `VMU_NOT_PERMITTED`（返回成功即红）；
3. **术语一致性（具名判据）**：任一段的 `terms[]` 与文本规范形必须与 `glossary.json` 的 `zh`/`en` 逐字一致（差一处即红，报**具名**术语 id）；
4. **快照可比（场景）**：同语言两次快照**逐字相同**；不同语言快照**必须**带不同 `lang` 且被标注为"翻译对照"（缺 `lang` 即红）；
5. **双语并存（场景）**：同一结论生成 `{zh,en}` 后，`at`/`by` **必须**相同（生成两条不同时间的记录即红）；
6. **覆盖率可查（场景）**：`vibe_vmu_locale action=coverage`（**计划/未实现**）⇒ 目标态能列出"无 `en` 版本"的段清单（当前**无实现**，故本项为**目标态验收**）。

### 21.11 与其它卷的交界
- `01-§7`：**术语表**（生成物）与 **`glossary.json` 单一真源** ⇒ 本卷 §21.4 的校验与其同源 ✓；
- `12`（用户手册）：需要"怎么设语言/怎么加译本/覆盖率怎么看"的用户向步骤 ⇒ 本卷给机制，手册给操作 ✓；
- `21`（可观测）：`lang-fallback` 计数、快照语言字段、审计行 `lang` ⇒ 本卷产出**指标化**（§21.2 第 3 条）✓；
- `11`（门禁）：§21.10 的 6 条应落成 **T1/T2 场景**（`GATE_SCOPE=vmu` 之外的语料/真机层）✓；
- `03-§8`：新增码（`VMU_LOCALE_MISSING`／`VMU_LOCALE_FALLBACK`／`VMU_GLOSSARY_CONFLICT`／`VMU_GLOSSARY_UNKNOWN_TERM`）**由生成管线登记**（本卷直接使用）✓。

### 21.12 待裁决（G4）
1. **默认语言**：实例默认是"随宿主 locale"还是"显式必需"（本卷倾向：**显式默认 + 宿主可覆盖**）？
2. **`en` 是否强制为兜底**：本卷要求回退链**必含 `en`**；若用户只要中文环境，是否允许去掉（倾向：**不允许**，但可把 `en` 放在链尾）？
3. **术语冲突的强度**：默认 `enforce`（拒绝该段）是否过严（备选：`warn` + 指标）？
4. **译本责任**：双语结论里"谁是原始产出"由谁声明（作者 vs 框架）？
5. **覆盖率是否作为发布门**（例：新增内核段必须同时给 `en`，否则发布门红）？
