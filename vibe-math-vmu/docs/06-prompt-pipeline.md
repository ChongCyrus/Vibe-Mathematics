# vmu 06 · 提示词管线（Prompt Pipeline）

> 状态：**草案 v0.1**
> 上位：`01-philosophy.md`（R8 提示词可管理 / R11 可观测 / R13 门禁即文档）、`02-architecture.md`（内核 C 分区）、`03`（段与变量登记）、`05`（钩子）
> 目标：让提示词成为**一等公民** —— 能**分段注册、按对象绑定、被覆盖、被版本化、被快照验证**，并且**使用者能通过 settings/中间件/pack 安排"谁在什么时候拿到哪段提示词"**。

---

## 1. 为什么要"管线"而不是"字符串拼接"

| 拼接式（反面） | 管线式（vmu） |
|---|---|
| 提示词散落在几十处 `L.push(...)`；改一句要读千行文件 | 每段**有名字、有归属、有作用域**；改一段只碰那一段 |
| 改了没人知道、无法回滚 | **变更入审计**，可预览（dry-run）、可回滚 |
| 无法回答"这条规则从哪来" | **来源可见**：段 ← 内核 / pack / 中间件 / 覆盖文件 |
| 无法证明"没丢东西" | **语料快照逐字对比** ⇒ 任何漂移都红 |

---

## 2. 装配模型

```
一次提示词装配（每个成员、每个回合）
  = ① 段序列（sections，按 order，**作用域过滤**）
  + ② 上下文注入（contexts：状态、时间、预算…）
  + ③ 工具面（tools face：按角色/阶段裁剪）
  + ④ 变量替换（variables，白名单）
  ──► [钩子 prompt/assemble]（中间件可改） ──► 最终提示词（**逐字快照**）
```

**不变量**
1. **状态块（`state`）不可覆盖**：只读事实必须可信（R11）；pack/中间件只能**追加/前置**，不得改写状态块内容。
2. **每次装配都重拼**：不允许"靠压缩后残留的记忆"承载机制说明（v5r 的教训 ⇒ 契约段必须逐轮重放）。
3. **装配是纯函数**（除显式注入的时间/随机）：同输入 ⇒ 同输出（R12）。

---

## 3. 段登记（Section Registry）

```yaml
# prompts/sections/charter.yml（示例）
name: charter
order: 100                    # 越小越前；内核保留号段见 §7
scope: { role: '*' }          # 作用域：role/member/phase/task/session
mutable: true                 # false ⇒ pack 不得覆盖（如 state）
source: pack                  # kernel | pack | middleware | override
template: prompts/charter.zh.md
vars: [member, role, phase]   # 白名单变量（未登记 ⇒ 拒）
truncate: { keepChars: 0 }    # 0＝不截断；截断必须计数（§6）
```

**登记规则**
- 段名唯一；命名 `kebab-case`；新增段 ⇒ **同时更新 03 号索引**（否则门禁红）；
- `mutable:false` 的段被覆盖 ⇒ **具名拒**（`VMU_NOT_PERMITTED` 并指出原因）；
- 段的**来源**（kernel/pack/中间件/覆盖文件）必须可在 `status().prompts.sections` 读到。

---

## 4. 绑定与"把提示词交给相应负责人"（**本管线的核心能力**）

### 4.1 四维绑定

```yaml
vmu.prompts.bindings:
  # ① 按角色槽位
  - { section: reviewer-rubric, role: reviewer, file: rubrics/reviewer.md }
  # ② 按阶段
  - { section: stage-guidance, phase: [explore, formalize], file: guidance.md }
  # ③ 按具体成员
  - { section: personal-note, member: ['m-1'], text: '你负责…' }
  # ④ 按任务/指派（＝"任务执行的提示词给相应负责人"）
  - { section: task-brief, task: ['t-42'], file: tasks/t-42.md, owner: 'm-2' }
```
**优先级**（从低到高）：`角色 < 阶段 < 成员 < 任务`；同优先级按 `order`；冲突可检测（§8 门禁）。

### 4.2 任务提示词的"派发"语义

- 任务可携带**提示词片段**（`task.brief`），在**该负责人被唤醒时**注入（`task-brief` 段）；
- 任务片段的**内容来源**可以是：文件引用（pack 提供）、settings 内联、或**中间件生成**（M1 `appendPrompt` / M2 代码）；
- **归属与审计**：谁创建、谁修改、何时注入，全部入审计；被注入的片段在快照里可追到**来源 id**；
- **不进上下文的情况**：M3 脚本结果默认**不进提示词**，必须显式 `appendPrompt`（防止脚本输出污染推理）。

### 4.3 覆盖（Override）

| 覆盖对象 | 允许？ | 条件 |
|---|---|---|
| 内核段（charter/role/stage…） | ✅ | `mutable:true`；且覆盖者有权（`vmu.prompts.whoMayOverride`） |
| 状态块 `state` | ❌ | 具名拒 |
| 框架注入的**事实性字段**（时间/预算/名单） | ❌ | 只能通过设置改变**值**，不能改**呈现格式** |
| pack 段 | ✅ | 高优先级作用域可覆盖（成员 > pack） |

**回滚**：覆盖是"**引用替换**"，因此回滚＝切回原引用（审计里保存旧引用），不需要还原文件内容。

---

## 5. 变量、模板与安全

- **变量白名单**（登记在 03）：`{{member}} {{role}} {{phase}} {{time}} {{setting:key}} {{count:kind}} {{pack}} {{task}}`；
- **未登记变量 ⇒ 具名拒**（防注入/防"打印 undefined"）；
- 模板**不做任意代码求值**（无 `eval`、无表达式语言）；需要计算 ⇒ 由中间件先算好再以 `{{count:…}}` 形式提供；
- **转义**：变量值中的模板语法必须转义（防止注入）；
- **确定性**：渲染顺序、换行、末尾空行都固定（快照才可比对）。

---

## 6. 截断与"必须计数"

- 任一段/任一注入若被截断，**必须在提示词里显式写明**（如"已省略更早 N 字符"）**并**在 `status().prompts.truncation` 计数；
- 截断策略可配：`keepChars` / `keepHeadTail` / `dropMiddle`（默认 `keepChars` 尾保）；
- **禁止静默截断**（沿用 v5r S25-B 的纪律）。

---

## 7. 与 DSH 的对接（实现取向）

| 需求 | 用 DSH 的什么 | 注意 |
|---|---|---|
| 注册段 | `systemPrompt.section/context/variable`（服务） | 需在**正确作用域**注册（每成员）；取 `agent.ctx` 的时机＝`agent/created`（00 号侦察） |
| 最终改写 | `system-prompt/assemble`（waterfall） | **必须 `return next(...)`** 才放行；vmu 总线统一包装（中间件作者不必懂） |
| 工具面 | `systemPrompt.tools(provider)` | 与 `tools.restrict` 的区别：**restrict 只能减**；"加"由 vmu 自建面负责 |
| 顺序号 | `getSectionOrder/getContextOrder` | 内核保留号段：`0–199` 事实层（state/时间）、`200–399` 章程/角色、`400–599` 机制契约、`600–899` pack 段、`900+` 覆盖/中间件 |
| 观测 | `system-prompt/change` | 变更后刷新快照与状态面 |

### 7.1 入口真正接了什么（**2026-10-09 校准 ✗✓**；此前本文只描述管线、没写装配 ✗）

| 项 | 真实现 | 证据 |
|---|---|---|
| 段声明 | 插件行 `config.promptSections`（`{name, text}` 或 `{name, file}` ✓）或旧写法 `config.prompt`（单段，段名 `vmu` ✓） | 入口的 `promptSections` 归一化 ✓ |
| 段的文本来源 | 入口区分 `inline`／`file`／`override` ✓，经 `handle.prompts()` 暴露 ✓ | 入口 `effectivePrompts` ＋ `prompts()` ✓ |
| 覆盖 | `config.promptOverrides`（`{段名: 文本}` ✓）与 settings `vmu.prompts.overridesDir`（读 `<root>/<dir>/<段名>.md` ✓）；**覆盖 > `file` > `text`** ✓ | 入口 `readRel` ＋覆盖合并 ✓；场景见 `tests/vmu-entry.test.mjs` 第 8 组 ✓ |
| 绑定 | `config.promptBindings` **或** settings `vmu.prompts.bindings` ✓（四维优先级 `role < phase < member < task` ✓） | 入口 → `createKernel({bindings})` → `createPromptPipeline` ✓ |
| 谁可覆盖 | `config.whoMayOverride` **或** settings `vmu.prompts.whoMayOverride` ✓ | 同上 ✓ |
| 宿主可见性 | **一个** `systemPrompt` 分节（名 `vmu` ✓）承载**生效后**的合并文本 ✓；无声明 ⇒ **不注册** ✓ | 入口 `effect(..., 'vmu:prompt')` ✓；零机制断言见 `tests/vmu-entry.test.mjs` 第 2 组 ✓ |
| 状态面 | `vibe_vmu_status` ⇒ `prompt.sections[].source`（**声明层** ✓）＋ `.overridden`（布尔 ✓）＋ `prompt.bindings`（条数 ✓）＋ `prompt.truncation` ✓ | `kernel/prompt/index.js` 的 `status()` ✓ |

> **纪律**：**"入口视图"与"管线视图"不是同一件事** ✗✓ —— 入口答"这段文本从哪来（inline/file/override）"，管线答"这个段由谁声明（kernel/pack/settings）＋是否被覆盖"。文档必须分开写 ✓。
> **未实现** ✗：**运行期改提示词的工具面**（改法是改配置/覆盖文件后重启实例 ✓）；把任务提示词按 `owner` **注入到具体成员会话**仍是**行内**能力（由 pack/中间件经 `ev.api` 驱动 ✓），整链路**尚未真机验收** ✗。

---

## 8. 快照、门禁与"文档即门禁"

1. **语料快照**：对每个 `(pack × 角色槽位 × 阶段)` 组合，保存**逐字**提示词快照（含装配来源标注）；
2. **漂移门禁**：任何改动导致快照变化 ⇒ 必须**显式更新快照**并写明理由（否则红）；
3. **段登记门禁**：03 号索引 ↔ 实际注册段**一一对应**；
4. **变量门禁**：模板里出现的变量 ⊆ 白名单；
5. **覆盖门禁**：`mutable:false` 被覆盖 ⇒ 红；覆盖权限不足 ⇒ 红；
6. **截断门禁**：出现截断而无计数/无提示 ⇒ 红；
7. **确定性门禁**：同输入两次装配**逐字一致**（除显式时间）。

---

## 9. 配方

```yaml
# A) 只改一段措辞（最小侵入）
vmu.prompts.overridesDir: prompts/overrides
# prompts/overrides/charter.zh.md 覆盖内核 charter 段

# B) 给角色加一段评审规则
vmu.prompts.bindings:
  - { section: reviewer-rubric, role: reviewer, file: rubrics/reviewer.md }

# C) 给某任务派发执行流程（"提示词给相应负责人"）
vmu.prompts.bindings:
  - { section: task-brief, task: ['t-42'], owner: 'm-2', file: tasks/t-42.md }

# D) 中间件动态注入（M1）
on: [prompt/assemble]
when: { phase: [review] }
then: [{ appendPrompt: { section: review-gate, text: '本轮只评已锁定结论。' } }]
```

---

## 10. 反模式

1. **把机制说明写在"状态块"里** ⇒ 状态块不可覆盖，机制必须进 `hooks-contract` 段（可覆盖、可版本化）。
2. **用字符串拼接绕过段登记**（隐式提示词）⇒ 门禁红（未登记段不得进入装配）。
3. **模板里求值**（表达式/代码）⇒ 拒绝（安全与可快照性皆失）。
4. **静默截断** ⇒ 违反 §6。
5. **只在某一代跑通就算数**：段与绑定必须**代际无关**（v5r 的东西进 v5r-pack 的 `prompts/`）。

---

## 11. 本篇的验收判据（门禁）

1. **登记完整**：03 号索引 ↔ 实际注册段一一对应；未登记段进入装配 ⇒ 红；
2. **快照可比**：`(pack × 角色槽位 × 阶段)` 组合均有**逐字快照**；漂移未显式更新 ⇒ 红；
3. **变量白名单**：模板变量 ⊆ 白名单；未登记变量 ⇒ 具名拒；
4. **状态块不可覆盖**：`mutable:false` 段被覆盖 ⇒ 红（R11 事实可信）；
5. **截断有计数**：出现截断而提示词未写明/状态面未计数 ⇒ 红；
6. **确定性**：同输入两次装配逐字一致（除显式注入的时间）；
7. **绑定四维生效**：角色/阶段/成员/任务各有一条"生效＋不生效"断言（优先级可证）。

---

## 12. 未核项

- **v5r 不调用 `systemPrompt.*`** ✗（persona 经 `subagents.startContinuable` 的 spec 传入，见 02-§3）⇒ vmu 若改走 DSH 原生提示词服务，**"每成员作用域注册的正确时机与实际行为"未实测**（00 号侦察给的是 `agent/created` ＋ 双注册 disposer 的规范写法）；
- **语料快照工具**未定（如何逐字比对、放哪、漂移如何报告）；
- **状态块"不可覆盖"的强制方式**未定（是拒绝装载还是运行时忽略）；
- **变量语法**（`{{...}}`）与 DSH 提示词服务是否已有插值机制**未核** ⇒ 需避免两套插值打架。

> **未核登记处**：以上各项已并入 **14-§2（U1–U12）** 与 **14-§1（O1–O7，均已裁定为 D13）** ✓。
