# vmu 04 · 设置（Settings）手册

> 状态：**草案 v0.1**（schema 语法细节待 `02-dsh-official-guidelines.md` 落地后校正）
> 上位：`01-philosophy.md`（R3 四可 / R4 单一源）、`02-architecture.md`（L2 层）
> 读者：**使用者**（改机制）与**实现者**（加参数）

---

## 1. 什么算"设置"

| 类别 | 例子 | 归属 |
|---|---|---|
| **设置**（影响行为、需可调控） | 单回合工具预算、并发上限、会议法定数、是否要求形式化、提示词覆盖、pack 选择、中间件启停与顺序 | **L2 → 必须走本文** |
| **能力**（能做到什么，不该配） | "能开会"、"能写卡片"、"能跑 Lean" | L1 内核（用**中间件**决定"何时/是否用"） |
| **常量**（物理/协议约束） | 文件扩展名、字段名、错误码 | L1 契约（文档化，不可配） |
| **临时状态** | 当前会议、在飞回合 | 运行时（只读面可见，不可配） |

**判据**：如果一个量会影响"框架怎么做事"，它**必须**是设置（R3 四可）；否则就是隐藏策略（违反 R1/R3）。

---

## 2. 四可（R3）与实现约定

| 可… | 实现约定 | 门禁 |
|---|---|---|
| **可声明** | 每个键在 **schema 单一源**里有：类型、默认值、域、作用域、热改等级、since 版本、说明 | 静态门：**未被声明的键被读取 ⇒ 红**（R4） |
| **可读** | `status().settings` 给出**生效值 ＋ 来源层 ＋ 是否被覆盖**；报告面同源 | 每个键必须有回显断言 |
| **可改** | `vibe_vmu_set`（或等价入口）改值；**热改等级**决定生效时机（见 §5） | 每个键必须有热改场景；非法值必须**具名拒** |
| **可审计** | 每次改动进**耐久审计**：`{at, by, key, old, new, layer, reason?}`；只增不改 | 审计留痕断言（含"谁能改"） |

---

## 3. schema 单一源（选定载体 ＋ JSON Schema 投影）

**载体（vmu 自裁 D12；官方规范未规定 ✗✓）**：
- 官方 skill **完全没有** Schemastery 的说明；**真实包中两种都有**（`@deepseek-ai/schemastery` 的 `Schema.object/string/number/const/union/dict`，也存在用 **zod** 声明 `Config` 的例子）⇒ **DSH 两种都接受**；
- **vmu 选定：`@deepseek-ai/schemastery`**（与第一方包主流一致、API 更贴 DSH）；**允许** pack/中间件用 zod 定义**自有**校验（但内核公开键一律以选定载体为准，避免两套词）。
**为何还要投影**：文档表、静态门、`set` 域检查、IDE 补全都需要**JSON Schema** ⇒ 由选定载体**单向派生**（禁止手写第二份）。

```js
// settings/schema.js（示意；**实现已落地**，见 vibe-math-vmu/settings/schema.js）
// 真实结构是"一张声明表 + 两个派生器"：表是唯一源，Schemastery/JSON Schema 都由它派生。
import { Schema } from '@deepseek-ai/schemastery'   // 载体是**注入**的（见下注），此处仅示意形态
export const Settings = Schema.object({
  'vmu.limits.toolCallsPerTurnCap': Schema.number().min(0).step(1).default(0).description('单回合工具调用上限；0＝不限'),
  'vmu.limits.maxLiveMembers':      Schema.number().min(0).step(1).default(0).description('本所在活成员上限；0＝不设'),
  'vmu.meetings.quorumRule':        Schema.union([Schema.const('m-unanimous'), Schema.const('all-unanimous')]).default('m-unanimous'),
  'vmu.prompts.overridesDir':       Schema.string().default('prompts/overrides'),
  'vmu.middleware.entries':         Schema.array(Schema.any()).default([]),
  'vmu.packs.active':               Schema.array(Schema.string()).default([]),
  // …
})
export const SettingsJsonSchema = toJsonSchema()   // 单向派生；文档/门禁/域检查共用
```

> **两个实现要点（与 `settings/schema.js` 一致 ✓）**
> 1. **不要用 `Schema.natural()`** ✗ —— 官方规范与真实包中**都没有这个 API**；非负整数写成 `Schema.number().min(0).step(1)` ✓；对象元素数组用 `Schema.array(Schema.any())` ✓。
> 2. **模块不做静态宿主 import** ✗✓：本仓是 **bundle 不是宿主**（`@deepseek-ai/schemastery` 在此不可解析），且仓库测试用**纯 Node** `import()` 插件文件 ⇒ 数据表/校验器/解析器/JSON Schema **零依赖**，载体由宿主在激活时**注入** `buildSchemastery(carrier)`，缺席即**具名拒** `VMU_ENGINE_UNAVAILABLE` ✓。

**规则**
- 键名**必须**带命名空间前缀（见 §4）；`static Config`（插件 Config）与之**同名同义**，避免两套词。
- **禁止**在实现里读未声明键（静态门）。
- 默认值**必须**是"什么都不做"的安全值（D-默认无害原则）：默认路径＝**零机制**，机制由 pack/中间件加上去。
- 任何"用户可填的时间"（`…At/…Ms`）一律**拒收**（时间由框架设置）——沿用 v5r 的既有纪律。

---

## 4. 命名空间与作用域（草案）

| 命名空间 | 管什么 | 作用域 | 典型键 |
|---|---|---|---|
| `vmu.core.*` | 内核总开关（不涉策略） | 会话 | `enabled`、`logLevel`、`storeBackend` |
| `vmu.limits.*` | 预算与上限（R11 可观测） | 会话 | `toolCallsPerTurnCap`、`maxLiveMembers`、`memoryCeilingMb`、`wallClockMs` |
| `vmu.records.*` | 归档与记忆 | 会话 | `tracks[]`、`headListAt`、`fingerprintPolicy`、`truncate.keep/droppedCount` |
| `vmu.prompts.*` | 提示词管线 | 会话/角色/阶段/任务 四维（见 06） | `overridesDir`、`sections[]`、`bindings[]` |
| `vmu.meetings.*` | 会议原语参数 | 会话 | `quorumRule`、`roundTimeoutMs`、`ballotFrozen`（**是否冻结发言由 pack 定**） |
| `vmu.tasks.*` | 任务与阶段 | 会话 | `maxOpenTasks`、`stages[]` |
| `vmu.math.*` | 计算/形式化 | 会话 | `engines[]`、`lean.*`、`timeoutMs` |
| `vmu.safety.*` | 权限与写保护 | 会话 | `pathPolicy`、`approvalRequired[]` |
| `vmu.middleware.*` | 中间件清单 | 会话 | `entries[]`、`order`、`failure`、`dryRun` |
| `vmu.packs.*` | 整合包 | 会话 | `active[]`、`allowOverride` |

**作用域优先级（从低到高）**：`pack 默认` → `预设 Config` → `会话 settings` → `运行时 set`。
**来源可见**：`status().settings.resolved[key] = { value, layer, overridden: [layers…] }`。

---

## 5. 热改等级（**必须逐键声明**）

| 等级 | 语义 | 例子 | 门禁要求 |
|---|---|---|---|
| **H0 立即** | 下一次判定/下一次工具调用即生效 | 工具预算、上限、日志级别、提示词覆盖 | 场景：改后**同一会话内**可见效果 |
| **H1 下一回合** | 从下一个成员回合/下一轮会议起生效 | 会议法定数、阶段规则 | 场景：本回合不变、下回合变 |
| **H2 下一会话** | 需重新进入/重装预设 | store 后端、pack 列表（**若**启动期静态装载） | 场景：改后提示"需重启"且**不静默忽略** |
| **H3 只读** | 由环境/安装决定，不可在运行期改 | 插件版本、DSH 兼容范围 | 静态门：`set` 必须**具名拒** |

> 未标等级的键**不得**上线（静态门红）。**实现现状（2026-10-09 校准 ✓）**：`vibe_vmu_set` 的回执**逐键给出 `appliesFrom`** —— H0 ⇒ `immediately` ✓、H1 ⇒ `next turn` ✓、H2 ⇒ `next session (restart required)` ✓；**H3 直接具名拒**（`VMU_NOT_PERMITTED`，文案含 `read-only (H3)`）✗→✓（不再是"改了没反应" ✗）。九种 `safety.*` 里的 H3 键（如 `vmu.safety.pathPolicy`）因此**不可在运行期改** ✓。

---

## 6. 审计与"谁能改"（**实现现状，2026-10-09 校准 ✓**）

- **值从哪来（真实现）**：`vibe_vmu_status` ⇒ `settings.resolved[<key>] = { value, source, hot, who, overridden }` ✓，`source` 取值与优先级为 **`pack:<id>` > `runtime`（`vibe_vmu_set` 写过）> `config`（插件行的 `config.vmu`）> `default`（无人设置，用 schema 默认）** ✓；`overridden` 列出被 pack 覆盖过的来源 ✓。**没有** `settings.resolved.json` 这种落盘文件 ✗（见 §2 的修正）。
- **审计面（真实现，2026-10-09 更新 ✓）**：`vibe_vmu_status` ⇒ **`auditTail`**（总线审计的**最后 20 条**，内存 ✓）＋ **`audit = { dir, file, written, lastWriteError }`** ✓；行形如 `{ ts, seq, what, id, ... }` ✓。**耐久审计已落盘 ✓**：有 `root` 时每条追加到 `<root>/vmu/audit/<YYYY-MM-DD>.jsonl`（JSONL ✓，只增不改 ✓）；**写失败具名上报** ✗→✓（`lastWriteError`，且内存尾照常 ✓）；无 `root` ⇒ 仅内存面 ✓。
- **写权限（真实现 ✗→✓，2026-10-10 本轮接线 ✓）**：schema 里**每个键都声明了 owner**（`who`，如会议六键＝`role:chair` ✓）；现在它**可强制** ✓：`setSettingsValue(key, value, { by })` 中若 `by` 不是声明的 owner 且该键未被 `vmu.safety.delegableKeys` 下放 ⇒ **具名拒** `VMU_NOT_PERMITTED`（提示给出 owner 与下放写法 ✓）。**边界 ✗**：这是**政策钩子，不是鉴权系统** ✓——不传 `by` 的路径（office 工具 ✓、pack 回滚 ✓）行为不变，"故意不报 `by`"抓不到（需宿主身份 ✗）。
- **拒收（真实现）**：未声明键 ⇒ `VMU_INVALID_ARGUMENT` ✓；H3 ⇒ `VMU_NOT_PERMITTED` ✓；pack 设置冲突 ⇒ `VMU_PACK_CONFLICT` ✓（两条显式门：**粗粒度** `vmu.packs.allowOverride` ✓ 或**逐键** `vmu.packs.activeOverrides` ✓；提示会**点名该键** ✓，无静默第三条路 ✓）。

### 6.1 本轮新接线的四键（**语义与边界写清 ✓**，2026-10-10；刻意用要点而非表格，避免被当成 §11 的设置行 ✗）

- **✅ 已接线 · 日志级别**（`vmu.core.logLevel`）：决定**是否调用宿主 `log`** —— 默认 `info` 时审计行**文本逐字不变** ✓，`warn`/`error` 抑制它，`debug` 预留。**边界 ✗**：**永不进模型上下文** ✓，只影响日志回调 ✓。
- **✅ 已接线 · 资源段**（`vmu.prompts.resourceSection`）：`true` ⇒ 注入**恰好一个** `resources` 段（order 900 ✓；文本由**机制设置**推导：在役成员／任务／回合工具／墙钟／数学面／整合包 ✓）。**边界 ✗**：默认 `false` ⇒ 提示词**逐字节不变** ✓；该文本**不是实时看板** ✗（改设置需重新装配 ✓）。
- **✅ 已接线 · 键的下放**（`vmu.safety.delegableKeys`）：让 schema 里**早就存在的 `who`** 变得**可强制** ✓ —— `setSettingsValue(key, value, { by })` 中若 `by` 不是声明的 owner（会议六键＝`role:chair` ✓）且该键未下放 ⇒ **具名拒** `VMU_NOT_PERMITTED`（提示给出 owner 与下放写法 ✓）。**边界 ✗**：是**政策钩子、不是鉴权** —— 不传 `by` 的路径（office 工具 ✓、pack 回滚 ✓）行为不变，"故意不报 `by`"抓不到（需宿主身份 ✗）。
- **✅ 已接线 · 逐键覆盖门**（`vmu.packs.activeOverrides`）：与粗粒度的 `vmu.packs.allowOverride` 并列的**按键显式门** ✓ —— 冲突时键在声明列表内 ⇒ 放行；否则 `VMU_PACK_CONFLICT` 且提示**点名该键** ✓。**边界 ✗**：门是**逐键**的（声明 A 不放行 B ✓，有断言 ✓）。

> **顺带查实的一处层次差异（诚实登记 ✗）**：`settings/schema.js` 的 `resolveSettings()` 会算出 `def`（默认值 ✓，`status().settings.resolved[<key>].source === 'default'` 即它 ✓），但**入口把"原始 map"交给内核** ✗ ⇒ 运行时兜底是内核自己的 `||`（如 `maxLiveMembers || maxParallel || 0` ✓）。**后果** ✓：schema 默认值**不会**自动生效（所以本轮给 `maxParallel` 接线**没有改变任何默认行为** ✓：未设＝不限 ✓、已设才强制 ✓，有断言钉住 ✓）。**待裁决候选** ✗：是否让入口改走 `resolveSettings`（那会让 `maxParallel=3` 等默认值**真的生效** ✗＝行为变更，须批准 ✓）；或维持现状并在 §2 如实写明 ✓。

> **诚实边界** ✗：域外值（类型/枚举越界）目前**只在 `assertDeclared` 一层**做检查 ✓；`config.vmu` 直通内存路径**不校验** ✗（见 12-§10）。

---

### 6.2 又接线的两键（**安全／资源闸门**，2026-10-10 ✓）

- **✅ 已接线 · 写保护范围**（`vmu.safety.pathPolicy`）：新模块 `kernel/guard.js` 是**强制点** ✓ —— `guardWrite()` 管住**库写入**（`kernel/library.js` 每次落盘 ✓，含 pack 重声明后重建 ✓）与**数学宿主落盘**（`host-math.js` 的既有逃逸检查改走同一闸门 ✓）；越界**具名拒** `VMU_NOT_PERMITTED` ✓，message 点名被拒路径 ✓、hint 给出**当前策略**与放开办法 ✓；`../` 穿越亦拒 ✓；**闸门在一切落盘动作之前** ✓（独立验证曾抓到"先 `mkdir` 后拒绝 ⇒ 拒绝却留目录"✗，已修 ✓）。
- **✅ 已接线 · 写保护范围的 spawn 一路**：`guardSpawnCwd()` 已接进 `host-spawn.js`（两个调用点都传 `settings`／`root` ✓），但刻意 **opt-in** ✓ —— 只有配置**显式声明**该策略时才拦（spawn 的 cwd 通常是 **agent 工作区**而非内核 root ✓，按策略默认去拦会**把刚修好的 M3 那条路又拒掉** ✗）；未声明时接缝行为与从前完全一致 ✓。
- **✅ 已接线 · 宿主进程 RSS 上限**（`vmu.limits.memoryCeilingMb`）：`memoryCeilingExceeded()` 由内核接进**所有会增长编制的入口** ✓ —— `members.assignRole`（公开服务 ✓）与 `hire` 共用**同一处**判定 ✓；超限即**具名拒** `VMU_RESOURCE_BUDGET`，message 给出 `rssMB > ceilingMB` ✓；**在役成员的重复安置不误拒** ✓（独立验证抓到"`assignRole` 可绕过"✗ 与"no-op `hire` 被误拒"✗，均已修 ✓）。**边界 ✗**：口径是**宿主进程 RSS**（框架测不了自己的"净"内存 ✓，schema 文案已按此改 ✓）；`0`＝不设 ✓。
- **✗ 顺带修正的一处错误约定**：上一版 `guard.js` 把两个键用 `['vmu','safety','pathPolicy'].join('.')` **拼出来**再读 ✗（本意是"避免注释字面量被算作接线"）—— 但**设置表与文档审计都按"运行时源码里出现键字面量"判定接线** ✓ ⇒ 拼接会让**两套检查互相矛盾** ✗✗（**实测被抓** ✓）。**正确规则**：**真读的那个字面量就是信号** ✓（读取已改回字面量 ✓，只有人类可读的提示文本仍可拼接 ✓）。

---

### 6.3 两层 schema：**手写核心键 ＋ 生成计划键**（2026-10-10 设计阶段新增 ✓✓）

> **为什么要有这一节** ✗：设置表现在有 **700+ 键**，其中**绝大多数是"设计阶段已声明、尚未实现"的计划键** ✓ —— 不解释的话，读者会把它们当成"能用的旋钮" ✗，那正是本卷最忌讳的**写着有、实际没反应** ✗。

- **第一层：手写核心键**（`settings/schema.js` 的 `CORE_DEFS` ✓，**54 键** ✓）—— **唯一**"改了真有反应"的那批 ✓（表里 `✅ 已接线` 的 ✓；已声明但未接线的少数键也逐行写明了边界 ✓）。
- **第二层：生成计划键**（`vibe-math-vmu/settings/planned.js` ✓）—— **生成物，勿手改** ✗；来源＝各设计卷的"拟增键全表" ✓，由 `scripts/generate-planned-settings.mjs` 抽取 ✓，组成＝`SETTING_DEFS = [...CORE_DEFS, ...PLANNED_DEFS]` ✓。
  - 形状**固定** ✓：`{ key, type:'planned', def:null, hot:'H1', who:'office', scope:'global', planned:true, doc:'设计阶段登记：<来源卷> 声明，尚未实现' }` ⇒ **元数据以来源卷为准** ✓（本表只保证"这个键确实被设计过" ✓，不假装知道它的默认值 ✗）。
  - **诚实保证** ✓：它们**没有**运行时消费者 ⇒ 表里逐行 `⚠️ 未接线` ✓；`vibe_vmu_set` 能回显但**不会有行为变化** ✗；门禁（`tests/audit-vmu-docs.test.mjs` G 组 ✓）**独立重算**"谁真的被读过" ✓ ⇒ **没人能把计划键说成已接线** ✗。
- **一键"转正"流程** ✓（实现阶段按此走 ✓）：① 手写核心表加真元数据 ＋ 写真正的消费者 ✓；② 把来源卷里对应条目标为已实现 ✓；③ 重生成 ⇒ `generate-planned-settings.mjs --check` 会要求"**已实现的键不得留在 planned 里**" ✓；④ 重生成设置表 ⇒ 该行变 `✅ 已接线` ✓。
- **反循环** ✓：`planned.js` 的扫描**跳过生成物镜像卷 `docs/04`** ✓（它是 schema 的镜像，不是设计源 ✓；`--check` 有专门断言守这一点 ✓）。

> **未做 ✗**：本阶段**没有实现任何计划键** ✓ —— 全部计划键都是"设计已声明、代码未读" ✓；这是目标①"先设计到极致"的正常状态 ✓，目标②"逐批实现"从实现阶段开始 ✓。

---

## 7. 文档自动生成（R4 的落地方式）

`schema → 参数表` 每行字段（**全部由生成器产出 ✓**）：**键 / 类型 / 默认 / 域 / 作用域 / H（热改等级）/ 谁 / 接线 / 载体 / 说明** ✓。
- **接线**＝`✅ 已接线` 或 `⚠️ 未接线`，**按运行时代码里是否存在该键的字面量计算** ✓（`settings/schema.js` 只声明、**不算**消费者 ✓）；
- **载体**＝**首个提到该键**的运行时代码文件 ✓（消费点可能在其下游 ⇒ 顺着它去读代码 ✓；未接线时为 `—` ✓）；
- **说明**＝schema 的 `doc` 字段本身 ✓（单一源 ✓）。
- **尚未实现** ✗：`since`（引入版本）与逐键**示例**列 —— 见 §12 未核项 ✓。
**门禁**：① 表中键集合 ≡ schema 键集合（无多无少 ✓，`--check` 强制）；② **接线标记必须与"是否有消费者"一致**（`tests/audit-vmu-docs.test.mjs` 的 G 组**独立重算** ✓）；③ 每个键至少要能通过 `vibe_vmu_set` 的"回显＋非法拒"（`tests/vmu-host.test.mjs` ✓）；④ 表内示例必须可跑（**配方测试尚未逐条跑通** ✗）。

---

## 8. 配方（可直接照抄；待 12 号文档补齐上下文）

```yaml
# 1) 收紧预算＋并发
vmu.limits.toolCallsPerTurnCap: 12
vmu.limits.maxLiveMembers: 6

# 2) 只允许"已登记正式证明/证伪"的对象进入表决（机制，非内核）
vmu.middleware.entries:
  - id: proof-before-debate
    kind: rules
    file: middleware/rules/proof-before-debate.yml
    failure: closed          # 中间件异常时"拒绝放行"（安全侧）

# 3) 覆盖某段提示词
vmu.prompts.overridesDir: prompts/overrides
vmu.prompts.bindings:
  - { section: review-gate, roles: [reviewer], file: review-gate.md }

# 4) 选整合包
vmu.packs.active: [v5r]
```

---

## 9. 反模式（评审时直接打回）

1. **把机制写进内核**（"因为 v5r 需要"）⇒ 应进 pack/中间件（R1）。
2. **为省事加隐藏默认**：实现里写死一个值而不声明 ⇒ 静态门红（R4）。
3. **一个键管两件事**（语义耦合）⇒ 拆键。
4. **改了没反应**（无热改等级/无提示）⇒ §5 红线。
5. **两套词**（Config 一套、settings 一套）⇒ §3 规则。
6. **用设置实现"流程"**：流程属于中间件/pack；设置只放**量**。

---

## 10. 本篇的验收判据（门禁）

1. **单一源**：参数表与 schema 键集合**完全一致**（无多无少）；
2. **四可齐**：每个键都有"回显断言 ＋ 非法值具名拒 ＋ 热改场景 ＋ 审计留痕"四条；
3. **热改等级无遗漏**：每个键都标了 H0–H3；H2/H3 必须**用户可见提示**（不许静默忽略）；
4. **未声明键不可读**：静态门红（R4）；
5. **文档自动生成**：参数表由 schema 派生，示例可跑（配方测试）；
6. **零策略**：schema 里没有代际/角色专名（词表见 11-§4）。

---

## 11. 参数总表（**首版；机器可核**：与 schema 键集合必须完全一致）

> 列含义：**H**＝热改等级（H0 立即／H1 下一回合／H2 下一会话／H3 只读）；**谁**＝可改者（office＝会话根；role:槽位＝可下放）。**本表由 schema 派生**（手写副本仅作首版基线，P0 后由生成器替换 ✓）。

| 键 | 类型 | 默认 | 域 | 作用域 | H | 谁 | 接线 | 载体（首个**提到**它的运行时代码；消费点可能在其下游） | 说明 |
|---|---|---|---|---|---|---|---|---|---|
| `vmu.core.enabled` | bool | `true` | — | 会话 | H2 | office | ✅ 已接线 | `vibe-math-vmu.js` | 内核总开关（关闭＝完全不介入） |
| `vmu.core.storeBackend` | enum | `json-fold` | `json-fold`∣`storage-domain` | 会话 | **H3** | office | ⚠️ 未接线（改了不会有行为变化） | — | 耐久后端（O1：默认 fold；换后端须过同一套门禁） |
| `vmu.core.logLevel` | enum | `info` | `debug`∣`info`∣`warn`∣`error` | 会话 | H0 | office | ✅ 已接线 | `kernel/index.js` | 日志级别（不进模型上下文） |
| `vmu.limits.toolCallsPerTurnCap` | int ≥0 | `0` | — | 会话 | H0 | office | ✅ 已接线 | `vibe-math-vmu.js` | 单回合工具调用上限；0＝不限 |
| `vmu.limits.maxLiveMembers` | int ≥0 | `0` | — | 会话 | H0 | office | ✅ 已接线 | `vibe-math-vmu.js` | 在活成员上限；0＝不设（机器强制） |
| `vmu.limits.memoryCeilingMb` | int ≥0 | `0` | — | 会话 | H0 | office | ✅ 已接线 | `kernel/guard.js` | 宿主进程 RSS 上限（超限拒绝新建成员；框架无法测量自己的"净"内存，故此处是宿主进程口径）；0＝不设 |
| `vmu.limits.wallClockMs` | int ≥0 | `0` | — | 会话 | H0 | office | ✅ 已接线 | `vibe-math-vmu.js` | 阶段墙钟硬上限（框架侧上限，不是用户可设的截止时刻） |
| `vmu.limits.maxParallel` | int ≥1 | `3` | — | 会话 | H0 | office | ✅ 已接线 | `vibe-math-vmu.js` | 并发上限（P3：吸收 v5r 的 maxParallel；机器强制） |
| `vmu.records.tracks` | string[] | `[progress,routes,obstacles,rejected,state]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/index.js` | 记录分轨（负向知识有独立档） |
| `vmu.records.headListAt` | int ≥0 | `7` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/index.js` | 头部列表最多返回多少行（0＝全部）；被截断时按 docs/07 §4.4 计数 |
| `vmu.records.truncateMode` | enum | `keepChars` | `keepChars`∣`keepHeadTail`∣`dropMiddle` | 会话 | H1 | office | ✅ 已接线 | `kernel/index.js` | 截断策略（必须计数，禁静默） |
| `vmu.records.fingerprintPolicy` | enum | `content-only` | `content-only`∣`content+display` | 会话 | H2 | office | ✅ 已接线 | `kernel/index.js` | 内容指纹口径（默认排除展示头） |
| `vmu.records.requireSettledRecords` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 只允许写入已结算记录（v5r 机制；由包携带默认 true） |
| `vmu.records.pointerPropagation` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | P3/S21：头部列表为默认信息通道；关＝零注入且提示词逐字回退 |
| `vmu.records.meetingKeepEvery` | int ≥1 | `5` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | P3：每 N 场会议保留一次归档（v5r 的 meetingKeepEvery） |
| `vmu.audit.retentionDays` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/audit.js` | 审计按天老化（天）；0 或负＝禁用老化（kernel/audit.js 的回落语义，禁用时不删任何行） |
| `vmu.pack.compression` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/pack.js` | 打包启用确定性 LZSS（kernel/pack.js 以 === true 判定；缺省＝关闭，禁用时不压缩） |
| `vmu.prompts.overridesDir` | path | `prompts/overrides` | — | 会话 | H0 | office | ✅ 已接线 | `vibe-math-vmu.js` | 提示词覆盖目录（仓内相对路径） |
| `vmu.prompts.bindings` | obj[] | `[]` | — | 会话 | H0 | office | ✅ 已接线 | `vibe-math-vmu.js` | 四维绑定（优先级 角色<阶段<成员<任务） |
| `vmu.prompts.whoMayOverride` | string[] | `[office]` | — | 会话 | H1 | office | ✅ 已接线 | `vibe-math-vmu.js` | 允许覆盖提示词者 |
| `vmu.prompts.resourceSection` | bool | `false` | — | 会话 | H0 | office | ✅ 已接线 | `vibe-math-vmu.js` | P3/S25-A：默认 false＝提示词一字不改；true 才注入【资源】段 |
| `vmu.meetings.quorumRule` | enum | `m-unanimous` | `m-unanimous`∣`all-unanimous` | 会话 | H1 | role:chair | ✅ 已接线 | `kernel/index.js` | 法定数规则（仅规则，不含"何时开会"） |
| `vmu.meetings.quorumCap` | int ≥0 | `3` | — | 会话 | H1 | role:chair | ✅ 已接线 | `packs/institute-min.js` | P3：法定数上限 m = min(cap, 参与人数)；0＝不设上限 |
| `vmu.meetings.reconsiderFloor` | int ≥0 | `0` | — | 会话 | H1 | role:chair | ✅ 已接线 | `packs/institute-min.js` | P3：复议门槛下限（生效门槛 = max(对象标准, 它, 上限)）；0＝只保证"不降" |
| `vmu.meetings.verdictMaxRounds` | int ≥1 | `3` | — | 会话 | H1 | role:chair | ✅ 已接线 | `packs/institute-min.js` | P3：同一对象的复算轮次上限（不得无限复算） |
| `vmu.meetings.hardLimitMs` | int ≥0 | `1800000` | — | 会话 | H1 | office | ✅ 已接线 | `packs/institute-min.js` | P3：会议墙钟硬界（唯一兜底）＝1800000；钳制 [300000, 7200000]；**不存在"无界"** |
| `vmu.meetings.wakeRetries` | int ≥0 | `5` | — | 会话 | H1 | office | ✅ 已接线 | `packs/institute-min.js` | P3：同一成员同阶段的唤醒重试上限（钳制 [0,10]）；耗尽记 unreached 并视为"已获机会" |
| `vmu.meetings.roundTimeoutMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/index.js` | 单轮超时；0＝不限 |
| `vmu.meetings.quotesPerMessageMax` | int ≥0 | `2` | — | 会话 | H1 | role:chair | ✅ 已接线 | `kernel/index.js` | P3：每条发言最多引用几条；超限 ⇒ 具名拒 |
| `vmu.meetings.quoteDepthMax` | int ≥0 | `3` | — | 会话 | H1 | role:chair | ✅ 已接线 | `kernel/index.js` | P3：引用链深度上限；超深 ⇒ 折叠标注（不拒） |
| `vmu.tasks.maxOpenTasks` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `vibe-math-vmu.js` | 未完成任务上限；0＝不限 |
| `vmu.tasks.stages` | string[] | `[]` | — | 会话 | H2 | office | ✅ 已接线 | `vibe-math-vmu.js` | 阶段列表；默认空＝不假装有流程 |
| `vmu.math.computation` | enum | `auto` | `off`∣`auto`∣`on` | 会话 | H2 | office | ✅ 已接线 | `vibe-math-vmu.js` | P3：数学工具可用性（共享模块默认 auto） |
| `vmu.math.mode` | enum | `typed+shell` | `typed`∣`typed+shell` | 会话 | H2 | office | ✅ 已接线 | `host-math.js` | P3：typed＝绝不提 shell 且拒绝 engine=cli |
| `vmu.math.engines` | string[] | `[python,r,octave,julia,matlab,maple,wolfram,cli]` | — | 会话 | H2 | office | ✅ 已接线 | `host-math.js` | 引擎优先级（默认取自共享模块并拷贝；空＝具名降级） |
| `vmu.math.timeoutMs` | int ≥0 | `60000` | — | 会话 | H0 | office | ✅ 已接线 | `host-math.js` | P3：单次计算预算（共享模块默认） |
| `vmu.math.packages` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `host-math.js` | P3：计算可要求的包/工具箱（共享模块默认） |
| `vmu.math.installScope` | enum | `user` | `user`∣`system` | 会话 | H1 | office | ✅ 已接线 | `host-math.js` | P3：安装作用域；system 仅当次、绝不记忆 |
| `vmu.math.compileTimeoutMs` | int ≥0 | `0` | — | 会话 | H0 | office | ✅ 已接线 | `kernel/formal.js` | 编译超时；0＝作业级默认 |
| `vmu.math.formalVerify` | enum | `off` | `off`∣`encourage`∣`require` | 会话 | H2 | office | ✅ 已接线 | `kernel/lean.js` | P3：判定时的形式化要求；默认 off＝零策略 |
| `vmu.math.leanCommand` | string | `lean` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/formal.js` | P3：Lean 命令名（命令模板可覆盖） |
| `vmu.math.leanArgs` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/formal.js` | P3：Lean 附加参数（显式 -R/--root 优先于 searchPaths） |
| `vmu.math.leanTimeoutMs` | int ≥0 | `120000` | — | 会话 | H0 | office | ✅ 已接线 | `kernel/formal.js` | P3：单次 Lean 编译预算 |
| `vmu.math.leanAsync` | bool | `true` | — | 会话 | H2 | office | ✅ 已接线 | `kernel/formal.js` | P3：后台队列编译；只有"退出 0 且文件内容哈希未变"才可标 passed |
| `vmu.math.leanInitiative` | enum | `normal` | `off`∣`normal`∣`eager` | 会话 | H2 | office | ✅ 已接线 | `kernel/lean.js` | P3：日常形式化积极性（与 formalVerify 判定时要求正交） |
| `vmu.math.leanSearchPaths` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/formal.js` | P3：额外 -R 根（去重后注入，自动 VibMath 根之前） |
| `vmu.math.leanJobsMaxParallel` | int ≥1 | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/lean.js` | P3：后台编译并发（1＝串行） |
| `vmu.safety.pathPolicy` | enum | `workspace-only` | `workspace-only`∣`workspace+shared` | 会话 | **H3** | office | ✅ 已接线 | `host-spawn.js` | 写保护范围 |
| `vmu.safety.approvalRequired` | string[] | `[]` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 需审批的动作（走宿主审批面） |
| `vmu.safety.delegableKeys` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/index.js` | 可下放给角色槽位的键 |
| `vmu.middleware.entries` | obj[] | `[]` | — | 会话 | H0 | office | ✅ 已接线 | `host.js` | 中间件清单（默认空＝零机制） |
| `vmu.middleware.hookTimeoutMs` | int ≥1 | `2000` | — | 会话 | H0 | office | ✅ 已接线 | `kernel/bus.js` | 单钩子预算 |
| `vmu.middleware.breakerThreshold` | int ≥1 | `3` | — | 会话 | H0 | office | ✅ 已接线 | `kernel/bus.js` | 连续失败熔断阈值 |
| `vmu.middleware.dryRun` | bool | `false` | — | 会话 | H0 | office | ✅ 已接线 | `kernel/index.js` | 干跑（只报不做） |
| `vmu.packs.active` | string[] | `[]` | — | 会话 | H2 | office | ✅ 已接线 | `vibe-math-vmu.js` | 生效整合包（冲突按 O4 报错） |
| `vmu.packs.allowOverride` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/index.js` | 是否允许 pack 间显式覆盖 |
| `vmu.packs.activeOverrides` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/index.js` | 显式覆盖声明（不声明即报错） |
| `vmu.agenda.maxItems` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 议程条目上限（0＝不限；超限具名拒） |
| `vmu.agenda.ownerRequired` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 议程条目必须带负责人 |
| `vmu.agenda.timeboxRequired` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 议程条目必须带时间箱 |
| `vmu.agenda.splitDepthMax` | int ≥0 | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 议程拆分深度上限 |
| `vmu.agenda.carryOnAdjourn` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 延会时议程顺延（声明值；运行时兜底见 04-§6.1 的层次差异） |
| `vmu.agenda.reorderAudit` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 议程重排必须留审计 |
| `vmu.motions.secondThreshold` | int ≥1 | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 动议成立所需附议数 |
| `vmu.motions.expireMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 动议失效时限（0＝不失效） |
| `vmu.motions.withdrawable` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 动议可否撤回 |
| `vmu.motions.tabledMax` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 搁置上限（0＝不限） |
| `vmu.motions.maxOpen` | int ≥0 | `5` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 同时在案动议上限（0＝不限） |
| `vmu.motions.proceduralKinds` | string[] | `[recess,extend,limit-speech,adjourn]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 程序动议种类 |
| `vmu.motions.privilegedKinds` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 特权动议种类 |
| `vmu.motions.amendFriendlyInline` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 友好修正可内联 |
| `vmu.motions.amendSubstantiveMode` | string | `one-vote` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/governance.js` | 实质修正的处理方式 |
| `vmu.board.columns` | obj[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/board.js` | 看板列定义（空＝无看板：零机制） |
| `vmu.board.wipPerColumn` | object | `[object Object]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/board.js` | 按列的 WIP 上限覆盖 |
| `vmu.board.wipDefault` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/board.js` | 默认 WIP 上限（0＝不限） |
| `vmu.board.swimlanes` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/board.js` | 泳道清单 |
| `vmu.board.agingWarnMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/board.js` | 老化告警阈值（毫秒；0＝不告警） |
| `vmu.board.moveRequiresTransition` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/board.js` | 变列必须走迁移闸 |
| `vmu.minutes.detail` | enum | `normal` | `brief`∣`normal`∣`full` | 会话 | H1 | office | ✅ 已接线 | `kernel/minutes.js` | 纪要详略档 |
| `vmu.minutes.confirmPreviousRequired` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/minutes.js` | 起草前必须已确认上次纪要 |
| `vmu.minutes.dissentMandatory` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/minutes.js` | 异议必须写明被拒项 |
| `vmu.minutes.actionsOwnerRequired` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/minutes.js` | 行动项必须有负责人 |
| `vmu.minutes.dueRequired` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/minutes.js` | 行动项必须有期限 |
| `vmu.minutes.dissentRetentionMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/minutes.js` | 异议保留期（0＝永久） |
| `vmu.minutes.verbatimCapBytes` | int ≥1 | `32768` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/minutes.js` | 逐字稿上限（触界报丢弃字节数，永不静默） |
| `vmu.budget.fairnessPolicy` | enum | `equal` | `equal`∣`priority`∣`reserve` | 会话 | H1 | office | ✅ 已接线 | `kernel/budget.js` | 配额公平策略（实现仅接 reserve 切片；equal/priority 的排序算法未实现 ✗） |
| `vmu.budget.reserveRatio` | ratio | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/budget.js` | 预留比例（0..1 分数；0＝不预留） |
| `vmu.budget.warnAtRatio` | ratio | `0.8` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/budget.js` | 告警阈值（0..1 分数；越阈只警告不拒） |
| `vmu.budget.onExceed` | enum | `refuse` | `refuse`∣`warn`∣`pause` | 会话 | H1 | office | ✅ 已接线 | `kernel/budget.js` | 触界动作：拒（具名）/警告记账/暂停 |
| `vmu.metrics.windowMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/metrics.js` | 指标窗口（毫秒；0＝不限窗） |
| `vmu.metrics.indicators` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/metrics.js` | 指标白名单（空＝零机制：可记但不聚合） |
| `vmu.metrics.allowTrigger` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/metrics.js` | 指标是否允许触发动作（false ⇒ 具名拒） |
| `vmu.metrics.exportFormat` | enum | `json` | `json`∣`jsonl` | 会话 | H1 | office | ✅ 已接线 | `kernel/metrics.js` | 导出格式 |
| `vmu.metrics.sampleHighVolume` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/metrics.js` | 高频只读命中采样开关（变更/拒绝/结算永不采样） |
| `vmu.metrics.sampleRate` | ratio | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/metrics.js` | 采样率（0..1；实现用确定性步进而非随机，故可复现） |
| `vmu.metrics.seriesCap` | int ≥1 | `200` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/metrics.js` | 单指标序列上限（溢出必须计数） |
| `vmu.audit.ringMax` | int ≥1 | `64` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/audit.js` | 审计环形长度（丢弃必须计数） |
| `vmu.audit.redactKeys` | string[] | `[token,key,password,authorization]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/audit.js` | 入库前脱敏的字段名（脱敏在写入前，不在导出时） |
| `vmu.audit.exportFormat` | enum | `json` | `json`∣`jsonl` | 会话 | H1 | office | ✅ 已接线 | `kernel/audit.js` | 审计导出格式 |
| `vmu.alerts.thresholds` | obj[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | 告警阈值声明 |
| `vmu.alerts.dedupWindowMs` | int ≥0 | `300000` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | 告警级去重窗口（指纹＝指标×对象×码） |
| `vmu.alerts.escalateAfterMs` | int ≥0 | `900000` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | 未确认升级时限 |
| `vmu.alerts.silenceWindows` | obj[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | 维护静默窗口（静默≠丢弃：仍计数，恢复后补摘要） |
| `vmu.alerts.channels` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | 通知通道（投递给 17 卷的通知原语） |
| `vmu.alerts.inhibitions` | obj[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | 抑制规则（抑制须点名抑制源） |
| `vmu.alerts.autoEscalate` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | 超时自动升级 |
| `vmu.alerts.maxThresholds` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | 阈值声明上限（0＝不限；超限计数） |
| `vmu.alerts.maxSilences` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | 静默条目上限（0＝不限） |
| `vmu.alerts.maxExemptions` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | 豁免上限（0＝不限） |
| `vmu.alerts.maxFingerprints` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | 指纹环上限（0＝不限；丢弃计数） |
| `vmu.alerts.maxSamples` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | 评估样本上限（0＝不限） |
| `vmu.slo.targets` | obj[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | SLO 目标声明 |
| `vmu.slo.errorBudgetAction` | enum | `warn` | `freeze-H2`∣`warn`∣`none` | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | 错误预算耗尽的动作（默认只警告，不冻结） |
| `vmu.slo.exemptions` | obj[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/alerts.js` | SLO 豁免（必须记录理由与时长） |
| `vmu.gc.autoRun` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/retention.js` | 是否自动 GC（默认只报告不执行） |
| `vmu.gc.graceDays` | int ≥0 | `14` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/retention.js` | 孤儿宽限期 |
| `vmu.gc.scope` | string | `workspace` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/retention.js` | GC 作用范围 |
| `vmu.gc.exemptMarkers` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/retention.js` | 免于 GC 的标记 |
| `vmu.quota.softBytes` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/retention.js` | 软配额（只警告） |
| `vmu.quota.hardBytes` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/retention.js` | 硬配额（0＝不限） |
| `vmu.quota.warnAt` | ratio | `0.8` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/retention.js` | 配额告警阈值（0..1 分数） |
| `vmu.quota.onExceed` | enum | `warn` | `warn`∣`refuse`∣`degrade` | 会话 | H1 | office | ✅ 已接线 | `kernel/retention.js` | 超配额动作 |
| `vmu.records.retention.keepEvery` | int ≥0 | `10` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/audit.js` | 每 N 版保留一份 |
| `vmu.records.retention.permanentMarker` | string | `permanent` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 永久保留标记（命中即不得裁剪） |
| `vmu.records.retention.maxBytes` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 单轨体积上限（0＝不限） |
| `vmu.records.retention.tierThreshold` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 冷热分层阈值（0＝不分层） |
| `vmu.records.trash.retainDays` | int ≥0 | `30` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 回收站保留天数 |
| `vmu.records.trash.autoPurge` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 回收站自动清除（默认关） |
| `vmu.records.trash.countInQuota` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 回收站是否计入配额 |
| `vmu.records.history.depth` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 历史保留深度（0＝全部） |
| `vmu.records.history.storeMode` | string | `diff` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/library.js` | 历史存储方式（diff/full） |
| `vmu.delegation.maxDepth` | int ≥1 | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/delegation.js` | 委托链深度上限（1＝禁止转委） |
| `vmu.delegation.subdelegateAllowed` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/delegation.js` | 是否允许转委（默认禁） |
| `vmu.delegation.defaultTtlMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/delegation.js` | 委托默认有效期（0＝不过期） |
| `vmu.delegation.maxTtlMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/delegation.js` | 委托最长有效期（0＝不限） |
| `vmu.delegation.reasonRequired` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/delegation.js` | 委托必须给理由 |
| `vmu.delegation.requireExplicitScope` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/delegation.js` | 必须显式声明权限范围 |
| `vmu.delegation.onExhausted` | enum | `refuse` | `refuse`∣`return` | 会话 | H1 | office | ✅ 已接线 | `kernel/delegation.js` | 委托预算耗尽时的动作 |
| `vmu.delegation.tokenShare` | ratio | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/delegation.js` | 可委托的令牌份额（0..1） |
| `vmu.delegation.turnsShare` | ratio | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/delegation.js` | 可委托的回合份额（0..1） |
| `vmu.delegation.revokeBroadcast` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/delegation.js` | 撤销时广播 |
| `vmu.delegation.auditChains` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/delegation.js` | 委托链必须留审计 |
| `vmu.delegation.roots` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/index.js` | 不来自委托的权威持有者（空＝S-2 拒绝一切授予，诚实默认） |
| `vmu.trust.kinds` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/trust.js` | 声誉信号受控词表（空＝不限制） |
| `vmu.trust.weights` | object | `[object Object]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/trust.js` | 按 kind 的权重 |
| `vmu.trust.halfLifeMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/trust.js` | 声誉衰减半衰期（0＝不衰减） |
| `vmu.trust.evidenceRequired` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/trust.js` | 强权重信号必须有证据 |
| `vmu.trust.requireSource` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/trust.js` | 信号必须有来源 |
| `vmu.trust.selfScoreAllowed` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/trust.js` | 是否允许自评（默认禁） |
| `vmu.trust.appealWindowMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/trust.js` | 申诉窗口（0＝不限） |
| `vmu.trust.maxSignalsPerSubject` | int ≥1 | `500` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/trust.js` | 单主体信号上限（溢出必计数） |
| `vmu.trust.aggregate` | enum | `weighted` | `mean`∣`weighted`∣`median` | 会话 | H1 | office | ✅ 已接线 | `kernel/trust.js` | 聚合方式 |
| `vmu.trust.useInSelection` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/trust.js` | 选择时是否参考声誉（仅参考，绝不授权 ✗） |
| `vmu.trust.useInArbitration` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/trust.js` | 仲裁时是否参考声誉 |
| `vmu.trust.useInAuction` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 竞标时是否参考声誉 |
| `vmu.arbitration.mode` | enum | `off` | `off`∣`single`∣`panel` | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 仲裁模式（off＝零机制：写操作具名拒） |
| `vmu.arbitration.binding` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 裁决是否有约束力（false＝仅有建议效力，必须自曝） |
| `vmu.arbitration.recordInMinutes` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 裁决是否记入纪要 |
| `vmu.arbitration.panelSize` | int ≥1 | `3` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | panel 模式的仲裁者人数 |
| `vmu.arbitration.recuseWindowMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 回避窗口（0＝不限） |
| `vmu.arbitration.rationaleRequired` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 裁决必须给理由 |
| `vmu.arbitration.appealWindowMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 上诉窗口（0＝不限） |
| `vmu.arbitration.hearingMinNotes` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 裁决前最少听证笔记数 |
| `vmu.conflict.arbiterMustDiffer` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 当事人不得任仲裁者 |
| `vmu.conflict.arbiterRule` | string | `rotating` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 仲裁者选择规则（human＝必须人类指定） |
| `vmu.conflict.classes` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 冲突类别（受控词表；唯一定义处） |
| `vmu.conflict.cooldownMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 同一冲突的冷却期 |
| `vmu.conflict.maxOpen` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 同时在办案件上限（0＝不限） |
| `vmu.conflict.escalateMaxPerSubject` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 单主体升级上限（0＝不限） |
| `vmu.conflict.hearingNeedsMinutes` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 听证需纪要 |
| `vmu.conflict.appealToHuman` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/arbitration.js` | 允许上诉到人类 |
| `vmu.handover.requiredFields` | string[] | `[status,openItems,pointers,risks,acceptance]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/handover.js` | 交接必填字段（声明默认＝设计五字段；运行时代码强制四字段下限，不可更低） |
| `vmu.handover.linkToTask` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/handover.js` | 交接关联到任务 |
| `vmu.handover.requireAck` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/handover.js` | 接受须显式确认 |
| `vmu.handover.onRejectReturnTo` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/handover.js` | 被拒后退回到谁（空＝退回发起人） |
| `vmu.workflow.requireEvidence` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 阶段推进须带证据 |
| `vmu.workflow.requireAssignee` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 阶段推进须有负责人 |
| `vmu.workflow.gateOnOpenTasks` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 有未结任务时拦门（需注入 tasks 接缝） |
| `vmu.workflow.reopenPolicy` | enum | `deny` | `deny`∣`allow`∣`gate` | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 回退到首阶段的策略（gate 未实现 ✗） |
| `vmu.roles.map` | object | `[object Object]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/recruit.js` | 职位名 → role slot 显式映射（S-1：内核不认识职位名，未映射即拒） |
| `vmu.recruit.probationMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/recruit.js` | 试用期（0＝无试用期） |
| `vmu.recruit.seatsMax` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/recruit.js` | 席位总上限（0＝不限） |
| `vmu.recruit.scoreRequiresRationale` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/recruit.js` | 评分必须给理由 |
| `vmu.recruit.scoreAggregate` | enum | `mean` | `mean`∣`median`∣`trimmed` | 会话 | H1 | office | ✅ 已接线 | `kernel/recruit.js` | 评分聚合方式 |
| `vmu.recruit.offerExpiryMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/recruit.js` | 录用报价有效期（0＝不过期） |
| `vmu.recruit.rejectNeedsReason` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/recruit.js` | 拒绝必须给理由 |
| `vmu.recruit.requireEvidence` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/recruit.js` | 申请必须带证据 |
| `vmu.recruit.maxCandidates` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/recruit.js` | 单岗位候选人上限（0＝不限） |
| `vmu.topology.mode` | enum | `flat` | `flat`∣`star`∣`committee`∣`market`∣`pipeline`∣`swarm`∣`matrix`∣`hierarchy` | 会话 | H1 | office | ✅ 已接线 | `kernel/topology.js` | 协作拓扑（flat＝零机制：无路径约束） |
| `vmu.topology.pipelineStages` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/topology.js` | 流水线阶段（跳段即拒） |
| `vmu.topology.hierarchyDepthMax` | int ≥1 | `3` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/topology.js` | 层级深度上限 |
| `vmu.topology.matrixDimensions` | string[] | `[business,topic]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/topology.js` | 矩阵维度 |
| `vmu.topology.marketBidWindowMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/topology.js` | 市场竞价窗口（0＝不限） |
| `vmu.topology.swarmQuorum` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/topology.js` | 群体认领的法定数（0＝不判） |
| `vmu.topology.committeeSize` | int ≥1 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/topology.js` | 委员会规模上限（0＝不限） |
| `vmu.topology.allowCrossLane` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/topology.js` | 矩阵是否允许跨维直连 |
| `vmu.topology.starCenterSlot` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/topology.js` | 星型中心席位（空＝星型不可用） |
| `vmu.topology.autoSelect` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/topology.js` | 拓扑是否自动选择 |
| `vmu.topology.maxDepth` | int ≥1 | `3` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/topology.js` | 深度上限（hierarchyDepthMax 的兼容别名来源） |
| `vmu.topology.budgetMultiplier` | ratio | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/topology.js` | 拓扑预算倍率（当前只自曝，未接入预算 ✗） |
| `vmu.fairness.priorityWeights` | object | `[object Object]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/fairness.js` | 优先级权重（唯一合法权重源；声誉分数传入即拒 ✗） |
| `vmu.fairness.reserveRatio` | ratio | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/fairness.js` | 保留比例 |
| `vmu.fairness.maxShare` | ratio | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/fairness.js` | 单人份额硬顶（不得突破） |
| `vmu.fairness.minShare` | ratio | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/fairness.js` | 单人保底份额 |
| `vmu.fairness.minShares` | object | `[object Object]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/fairness.js` | 按主体的保底份额 |
| `vmu.fairness.tieBreak` | string | `lexicographic` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/fairness.js` | 平手规则（必须确定性） |
| `vmu.fairness.explainRequired` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/fairness.js` | 每次分配必须可解释 |
| `vmu.fairness.auditWindowMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/fairness.js` | 公平性审计窗口（0＝全程） |
| `vmu.fairness.underUseThreshold` | ratio | `0.5` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/fairness.js` | 使用不足判定阈值 |
| `vmu.charter.enabled` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 宪章机制总开关（false＝零机制） |
| `vmu.charter.ratifyThreshold` | ratio | `0.5` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 通过门槛（弃权不入分母） |
| `vmu.charter.amendQuorum` | ratio | `0.5` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 修订所需法定比例 |
| `vmu.charter.amendNeedsQuorum` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 修订须有审批记录 |
| `vmu.charter.amendNeedsHuman` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 修订须人类批准 |
| `vmu.charter.dissolveRequiresReason` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 解散必须给理由 |
| `vmu.charter.dissolveNeedsHuman` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 解散须人类批准 |
| `vmu.charter.maxArticles` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 条款数上限（0＝不限） |
| `vmu.charter.effectiveDelayMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 批准后延迟生效（0＝立即） |
| `vmu.charter.requiresParentConsent` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 子机构须母机构同意 |
| `vmu.charter.inheritDelegation` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 是否继承母机构委托权限（fail closed） |
| `vmu.charter.immutableArticles` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 不可改条款 id（改动即拒并点名） |
| `vmu.charter.frozenClauses` | string[] | `[S-1,S-2,S-3,S-4,S-5,S-6]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 冻结条款族（S-x 不变式） |
| `vmu.charter.depthMax` | int ≥1 | `2` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 子机构嵌套深度上限 |
| `vmu.charter.spawnMaxChildren` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 单机构子机构数上限（0＝不限） |
| `vmu.charter.precedence` | string | `charter-over-pack` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 优先序（当前只自曝，未做冲突强制 ✗） |
| `vmu.charter.fissionMax` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 裂变上限（未实现 API ✗） |
| `vmu.charter.mergeNeedsHuman` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/charter.js` | 合并须人类批准（未实现 API ✗） |
| `vmu.repro.requiredMembers` | string[] | `[script,entry,envLock,seed,dataFingerprint,deps]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/repropack.js` | 复现包必填成员（缺一即拒并点名） |
| `vmu.repro.hashAlgo` | string | `sha256` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/repropack.js` | 指纹算法 |
| `vmu.repro.maxPackBytes` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/repropack.js` | 包体上限（0＝不限；触界必报丢弃） |
| `vmu.repro.allowMissingSeed` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/repropack.js` | 是否允许缺种子（默认 false：随机作业必须有种子 ✗） |
| `vmu.repro.envLockMode` | enum | `full` | `full`∣`minimal` | 会话 | H1 | office | ✅ 已接线 | `kernel/repropack.js` | 环境锁模式（两者当前都只用调用方给的 env ✗） |
| `vmu.repro.dataPointerOnly` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/repropack.js` | 数据只存指针不复制（默认 true ✗） |
| `vmu.repro.verifyRequiresMatch` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/repropack.js` | 验证要求逐成员一致 |
| `vmu.skills.levels` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/skills.js` | 技能等级受控词表（空＝内置） |
| `vmu.skills.evidenceRequired` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/skills.js` | 声明必须带证据 |
| `vmu.skills.selfAttestAllowed` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/skills.js` | 是否允许自我见证（默认禁：不得自封 ✗） |
| `vmu.skills.freshnessMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/skills.js` | 技能保鲜期（0＝不过期；过期自曝并降级 ✗） |
| `vmu.skills.declareTtlMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/skills.js` | 声明有效期（freshnessMs 的兼容名来源） |
| `vmu.skills.maxSkillsPerMember` | int ≥1 | `50` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/skills.js` | 单人技能上限（超限具名拒） |
| `vmu.skills.aggregate` | enum | `latest` | `latest`∣`max` | 会话 | H1 | office | ✅ 已接线 | `kernel/skills.js` | 多来源技能等级聚合 |
| `vmu.skills.degradePolicy` | string | `one-step` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/skills.js` | 过期降级策略（one-step｜hold） |
| `vmu.skills.requiresPermission` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/skills.js` | 能力 ≠ 权限：技能本身不授权 ✗ |
| `vmu.skills.negotiationRounds` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/skills.js` | 技能协商轮次（0＝不协商） |
| `vmu.memory.kinds` | string[] | `[lesson,antipattern,fact,preference]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 记忆种类受控词表 |
| `vmu.memory.cardKinds` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 经验卡种类（空＝同 kinds） |
| `vmu.memory.requireEvidence` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 记忆必须带证据 |
| `vmu.memory.requireSource` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 记忆必须有来源 |
| `vmu.memory.maxCards` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 经验卡上限（0＝不限） |
| `vmu.memory.maxEntries` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 记忆条目上限（0＝不限；溢出必计数） |
| `vmu.memory.cardTtlMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 经验卡有效期（0＝不过期） |
| `vmu.memory.ttlMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 记忆有效期（0＝不过期；过期自曝 ✗） |
| `vmu.memory.visibility` | enum | `institution` | `institution`∣`team`∣`agent` | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 默认可见范围 |
| `vmu.memory.scopeRequired` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 记忆必须声明作用域 |
| `vmu.memory.scopeDefault` | enum | `institution` | `institution`∣`team`∣`agent` | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 缺省作用域 |
| `vmu.memory.contradictionPolicy` | enum | `report` | `report`∣`block`∣`supersede` | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 矛盾处理（report 时必须在 contradictions() 可见 ✗） |
| `vmu.memory.neverDropKinds` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 永不丢弃的记忆种类 |
| `vmu.memory.keepEvery` | int ≥0 | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 压缩时保留比例 |
| `vmu.memory.compactionEveryMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 压缩周期（0＝不自动压缩） |
| `vmu.memory.supersedeNeedsReason` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/memory.js` | 取代记忆必须给理由 |
| `vmu.auction.enabled` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 拍卖/竞标开关（默认关＝零机制） |
| `vmu.auction.claimFirst` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 先认领再拍卖 |
| `vmu.auction.closeRule` | string | `deadline` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 截止规则 |
| `vmu.auction.bidWindowMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 投标窗口（0＝不限） |
| `vmu.auction.maxBidCost` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 报价上限（0＝不限；不得突破 ✗） |
| `vmu.auction.requirePlan` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 投标必须带方案 |
| `vmu.auction.maxOpenAuctions` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 同时在办拍卖上限（0＝不限） |
| `vmu.auction.minBids` | int ≥0 | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 授标所需最少投标数 |
| `vmu.auction.maxBids` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 单场投标上限（0＝不限） |
| `vmu.auction.maxPosts` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 挂单上限（0＝不限） |
| `vmu.auction.awardNeedsRationale` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 授标必须给理由 |
| `vmu.auction.cancelNeedsReason` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 取消必须给理由 |
| `vmu.auction.collusionScan` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 雷同报价扫描（标记必须可见 ✗） |
| `vmu.auction.reputationInPrice` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 声誉是否入价（默认 false：声誉不得定价 ✗） |
| `vmu.auction.tieBreak` | string | `lexicographic` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 平手规则（必须确定性） |
| `vmu.auction.maxSuspects` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 串谋嫌疑上限（0＝不限） |
| `vmu.auction.allowRuleOverride` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 是否允许调用方覆盖规则（默认 false） |
| `vmu.collusion.windowMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 串谋扫描窗口（0＝不限） |
| `vmu.collusion.maxMutualShare` | ratio | `0.8` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 互投/雷同份额阈值 |
| `vmu.collusion.minEvidence` | int ≥0 | `2` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 判定嫌疑所需最少证据数 |
| `vmu.collusion.onSuspect` | enum | `report` | `report`∣`freeze-review` | 会话 | H1 | office | ✅ 已接线 | `kernel/bidding.js` | 嫌疑处理（默认只报告；冻结审查须显式开启） |
| `vmu.math.maxParallel` | int ≥1 | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathjobs.js` | 并行作业上限（超限 ⇒ 具名拒，不自旋等待 ✗） |
| `vmu.math.maxJobs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathjobs.js` | 作业总量上限（0＝不限） |
| `vmu.math.keepReceipts` | int ≥0 | `200` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathjobs.js` | 回执保留条数（溢出必计数） |
| `vmu.math.requireSeedForRandom` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathjobs.js` | 随机作业必须有种子 |
| `vmu.math.denyNetwork` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathjobs.js` | 默认禁网（作为 env 传给 spawn；真正拦截在宿主 ✗） |
| `vmu.math.workspaceOnly` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathjobs.js` | 默认限工作区（同上，拦截在宿主 ✗） |
| `vmu.math.captureStdoutBytes` | int ≥0 | `65536` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathjobs.js` | stdout 捕获上限（触界报丢弃字节 ✗） |
| `vmu.formal.axiomWhitelist` | string[] | `[propext,Classical.choice,Quot.sound]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/formal.js` | 受信公理白名单（白名单外 ⇒ 具名拒并点名 ✓） |
| `vmu.formal.allowSorry` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/formal.js` | 是否允许 sorry（默认 false：出现即拒并点名位置 ✗✓） |
| `vmu.formal.requireArtifacts` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/formal.js` | 是否必须有产物（当前只读入未强制 ✗） |
| `vmu.formal.maxArtifacts` | int ≥0 | `32` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/formal.js` | 产物条数上限（溢出必计数） |
| `vmu.formal.maxSourceBytes` | int ≥0 | `262144` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/formal.js` | 源码字节上限（触界报丢弃字节 ✗） |
| `vmu.external.conflictPolicy` | enum | `refuse-on-conflict` | `refuse-on-conflict`∣`newest-wins` | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 多源冲突策略（两种都必须把冲突报出来 ✗✓） |
| `vmu.external.maxResults` | int ≥1 | `100` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 单次取数结果上限（截断必计数） |
| `vmu.external.offline` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 离线模式（只许命中缓存 ✓ 零网络） |
| `vmu.external.sources` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 允许的来源清单（空＝不限制） |
| `vmu.compliance.maxReports` | int ≥1 | `1000` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/domaingate.js` | 合规上报条数上限（溢出必计数） |
| `vmu.compliance.saeLimitMs` | int ≥0 | `86400000` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/domaingate.js` | SAE 上报时限（毫秒；默认 24h） |
| `vmu.compliance.aeLimitMs` | int ≥0 | `259200000` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/domaingate.js` | AE 上报时限（毫秒；默认 72h） |
| `vmu.schedule.triggerVia` | enum | `none` | `none`∣`middleware`∣`script` | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 到期是否触发流程（默认 none＝只报告 ✗✓） |
| `vmu.schedule.maxPending` | int ≥0 | `8` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 待触发项上限（0＝不限；超限具名拒 ✓） |
| `vmu.schedule.timeSource` | enum | `tick-only` | `tick-only`∣`host-timer` | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 时间来源（tick-only＝只用 tick() 推进 ✓；host-timer 需注入 timer 接缝 ✗） |
| `vmu.schedule.actionsAllowed` | string[] | `[emit-hook,prompt]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 允许的触发动作白名单（越界注册即拒 ✓） |
| `vmu.schedule.triggers` | obj[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 声明式触发器种子 |
| `vmu.schedule.overdueGraceMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 迟到宽限（超宽限 ⇒ 丢弃并计数，绝不静默 ✗） |
| `vmu.schedule.coalesceMissed` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 漏跑是否合并（合并也要报 missed ✓） |
| `vmu.schedule.maxRecurrences` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 重复项上限（0＝不限） |
| `vmu.schedule.minIntervalMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 最小间隔（低于即拒 ✓） |
| `vmu.schedule.maxHorizonMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 最远调度视界（0＝不限；超出即拒 ✓） |
| `vmu.schedule.cancelNeedsReason` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 取消必须给理由（留痕 ✓） |
| `vmu.crypto.requireSigner` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/crypto.js` | 必须有签名接缝（无接缝 ⇒ 具名拒，绝不伪造 ✗✓） |
| `vmu.crypto.keyTtlMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/crypto.js` | 密钥有效期（0＝不自动过期） |
| `vmu.crypto.signingKeyId` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/crypto.js` | 默认签名密钥引用（只引用，不落材料 ✓） |
| `vmu.crypto.algorithm` | string | `ed25519` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/crypto.js` | 签名算法声明（实现归注入接缝 ✓） |
| `vmu.crypto.allowUnsignedVerify` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/crypto.js` | 无接缝时是否允许"验证"（放行也**只返回未验证** ✗✓） |
| `vmu.notify.enabled` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/notify.js` | 通知开关（默认关＝零机制） |
| `vmu.notify.dedupWindowMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/notify.js` | 通知级去重窗口（指纹＝watcher×事件×对象 ✓，与 21 卷分层 ✗） |
| `vmu.notify.digestWindowMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/notify.js` | 摘要窗口（当前只自曝，未驱动调度 ✗） |
| `vmu.notify.quiet` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/notify.js` | 全局免打扰（**只挡投递、不挡记录** ✗✓） |
| `vmu.notify.maxWatchers` | int ≥1 | `100` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/notify.js` | 关注条目上限（超限具名拒 ✓） |
| `vmu.notify.maxRegister` | int ≥1 | `500` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/notify.js` | 通知登记册上限（溢出必计数 ✓） |
| `vmu.notify.onFailure` | enum | `log` | `log`∣`throw` | 会话 | H1 | office | ✅ 已接线 | `kernel/notify.js` | 投递失败策略（默认只记录：**不阻断业务** ✓） |
| `vmu.notify.priorityFloor` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/notify.js` | 优先级下限（低于该级不投递但仍记录 ✓） |
| `vmu.notify.registeredEvents` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/notify.js` | 已注册事件清单（空则回退读钩子注册表 ✓） |
| `vmu.hooks.registered` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/notify.js` | 钩子注册表（05 卷；通知面据此校验订阅事件 ✓） |
| `vmu.lifecycle.stages` | obj[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/lifecycle.js` | 阶段表（16 卷 §1 的 L1–L24；**空 ⇒ 拒，不默认放行** ✗✓） |
| `vmu.lifecycle.requireEvidence` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/lifecycle.js` | 每阶段必须有准入证据 |
| `vmu.lifecycle.maxArtifacts` | int ≥1 | `20` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/lifecycle.js` | 产物条数上限（溢出必计数） |
| `vmu.lifecycle.allowBackward` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/lifecycle.js` | 是否允许回退阶段（默认否：回退即拒 ✓） |
| `vmu.idempotency.maxEntries` | int ≥1 | `1000` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/idempotency.js` | 台账条目上限（溢出 ⇒ 淘汰并计数 ✓） |
| `vmu.idempotency.ttlMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/idempotency.js` | 条目有效期（0＝不过期） |
| `vmu.idempotency.pendingTimeoutMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/idempotency.js` | pending 超时（0＝不限；超时可重试并留痕 ✓） |
| `vmu.idempotency.scopeDefault` | string | `global` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/idempotency.js` | 缺省作用域（同 key 跨 scope 视为不同键 ✓） |
| `vmu.idempotency.abortNeedsReason` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/idempotency.js` | abort 必须给理由（留痕 ✓） |
| `vmu.idempotency.retryAfterAbort` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/idempotency.js` | abort 后是否允许同 key 重试（同载荷 ✓） |
| `vmu.idempotency.maxPayloadBytes` | int ≥0 | `262144` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/idempotency.js` | 载荷指纹计算上限（触界报丢弃 ✗） |
| `vmu.idempotency.retrySamePayloadOnly` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/idempotency.js` | abort 后重试是否必须同载荷（默认是；放宽 ⇔ 重试是新尝试，必须自曝 ✗✓） |
| `vmu.idempotency.writerId` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/idempotency.js` | 写者标识（用于识别"更旧的覆盖" ✓；**同一部署的多个进程必须各给唯一值** ✗否则只能靠 seq 回退发现 ✓） |
| `vmu.clock.resyncMs` | int ≥0 | `60000` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/clockguard.js` | 前跳冻结的**重同步上限**（累计冻结超此值 ⇒ 接受新时刻并自曝 resynced ✓；**永冻不可接受** ✗✓✓） |
| `vmu.audit.chain.checkpointEvery` | int ≥1 | `100` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/auditchain.js` | 自动检查点节奏（每 N 行；**默认 100 ⇒ 出厂即会落锚** ✓✓ —— 一个"接了却永不触发"的接缝等于没有 ✓；0＝手动 ⇒ 则必须知道**删尾不可检出** ✗） |
| `vmu.projection.maxMigrationSteps` | int ≥1 | `16` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/projmigrate.js` | 投影迁移步数上限（超限具名拒并给当前/上限 ✓） |
| `vmu.ballot.method` | string | `plurality` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 表决方法（不支持 ⇒ 具名拒 ✓） |
| `vmu.ballot.minVotes` | int ≥0 | `0` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 法定票数下限（不足 ⇒ **具名拒而非"未通过"** ✗✓） |
| `vmu.ballot.minVotesRatio` | ratio | `0` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 法定比例下限 |
| `vmu.ballot.abstainCountsForFloor` | bool | `true` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 弃权是否计入法定人数基数 |
| `vmu.ballot.abstainAllowed` | bool | `true` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 是否允许弃权（禁止时投票 ⇒ 具名拒 ✓） |
| `vmu.ballot.secrecy` | enum | `open` | `open`∣`secret` | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 秘密表决 ⇒ **明细不可回收但保留计数** ✗✓ |
| `vmu.ballot.secrecyRecordFact` | bool | `true` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 秘密表决是否仍记录"发生过"这一事实 ✓ |
| `vmu.ballot.tieRule` | enum | `chair` | `chair`∣`unresolved`∣`status-quo` | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 平票处置（**必须自曝用了哪条规则** ✗✓） |
| `vmu.ballot.runoffTopN` | int ≥0 | `2` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 第二轮取前 N 名（回执标 round:2 ✓） |
| `vmu.ballot.roundsMax` | int ≥0 | `2` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 轮次上限（用尽仍平票 ⇒ 具名拒 ✓） |
| `vmu.ballot.rollCallOrder` | string[] | `[]` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 点名顺序（**未求值不得出现在 enforced[]** ✗✓） |
| `vmu.ballot.proxyMode` | enum | `off` | `off`∣`on` | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 代理投票开关 |
| `vmu.ballot.proxyChainMaxDepth` | int ≥0 | `1` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 代理链深度上限 |
| `vmu.ballot.quadraticCreditCap` | int ≥0 | `0` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 二次方投票信用上限（超限 ⇒ 具名拒 ✓） |
| `vmu.ballot.quotaSeats` | int ≥0 | `1` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 席位配额（多席计票上限） |
| `vmu.ballot.recusePublic` | bool | `false` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 回避是否公开 |
| `vmu.ballot.recuseDeclareMode` | string | `on-record` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 回避声明方式 |
| `vmu.ballot.vetoMode` | enum | `off` | `off`∣`chair`∣`quorum` | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 否决模式（off 时不介入 ✓） |
| `vmu.ballot.auditReadOnly` | bool | `true` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 表决审计只读（真时回执 audit 为空 ✓） |
| `vmu.ballot.auditRetentionMs` | int ≥0 | `0` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 表决审计保留期（**真实过期清理未实现** ✗） |
| `vmu.ballot.processReadingsVisible` | bool | `false` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/ballotbox.js` | 过程读数是否可见 |
| `vmu.records.allowedKinds` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 记录类型白名单（表外 ⇒ 具名拒 ✓） |
| `vmu.records.headFields` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 列表投影字段（**核心字段不可裁** ✗✓） |
| `vmu.records.bodyCapBytes` | int ≥0 | `262144` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 正文上限（超限读取时截断并**报丢弃字节数** ✗✓） |
| `vmu.records.expandThreshold` | int ≥0 | `4096` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 超阈按需展开 |
| `vmu.records.head.maxItems` | int ≥0 | `200` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 每轨条数上限（满 ⇒ 具名拒 `VMU_QUOTA_EXCEEDED` 给现值/上限，**不静默淘汰** ✗✓） |
| `vmu.records.head.sort` | enum | `updatedAt` | `updatedAt`∣`createdAt`∣`title` | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 列表排序 |
| `vmu.records.body.noticeStyle` | enum | `short` | `short`∣`detailed` | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 截断提示样式（**必须含数量** ✗✓） |
| `vmu.records.body.chunkedReturn` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 是否分片返回正文 |
| `vmu.records.naming.slugPolicy` | enum | `cjk-keep` | `cjk-keep`∣`ascii` | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | slug 策略（ascii 为**剥离**非转写 ✗） |
| `vmu.records.naming.maxLength` | int ≥0 | `64` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | slug 长度上限（截断必计数 ✓） |
| `vmu.records.naming.conflictSuffix` | string | `-{n}` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 命名冲突后缀模板 |
| `vmu.records.chunk.thresholdBytes` | int ≥0 | `262144` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 分片阈值 |
| `vmu.records.chunk.chunkBytes` | int ≥0 | `65536` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 分片大小 |
| `vmu.records.external.allowedSchemes` | string[] | `[file]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 外部引用方案白名单（表外 ⇒ `VMU_EXTERNAL_DISABLED` ✓） |
| `vmu.records.external.verifyExists` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/records.js` | 是否校验外部引用存在（无接缝 ⇒ `verified:null` 自曝，**绝不假装已验证** ✗✓） |
| `vmu.course.gradeScaleMax` | int ≥0 | `100` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/course.js` | 评分量表上限（越界 ⇒ 具名拒 ✓） |
| `vmu.course.passMark` | int ≥0 | `0` | — | 会话 | H2 | chair | ✅ 已接线 | `kernel/course.js` | 及格线（0＝不设 ✓） |
| `vmu.replay.strict` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/replay.js` | 未知事件类型是否具名拒（默认 false：计入 unknownKinds ✓ 绝不静默跳过 ✗） |
| `vmu.replay.keepUnknown` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/replay.js` | 未知事件是否保留在重建结果里（保留并标 unknown ✓） |
| `vmu.replay.requireContiguousSeq` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/replay.js` | 是否要求审计序号连续（缺口必须报 ✗✓） |
| `vmu.replay.maxEvents` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/replay.js` | 重放事件上限（0＝不限；截断必计数 ✓） |
| `vmu.replay.maxStateKeys` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/replay.js` | 重建状态键上限（0＝不限；截断必计数 ✓） |
| `vmu.tx.maxSteps` | int ≥1 | `32` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/transaction.js` | 单事务步骤上限（超限具名拒 ✓） |
| `vmu.tx.maxTransactions` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/transaction.js` | 在办事务上限（0＝不限） |
| `vmu.tx.autoCompensate` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/transaction.js` | 失败是否自动逆序补偿（false ⇒ 停在 failed 并明说要显式补偿 ✓） |
| `vmu.tx.compensateNeedsReason` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/transaction.js` | 补偿必须给理由（留痕 ✓） |
| `vmu.tx.keepEvidence` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/transaction.js` | 是否保留现场证据（false ⇒ 显式取舍，会丢现场 ✗） |
| `vmu.tx.traceCap` | int ≥1 | `50` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/transaction.js` | 每事务轨迹上限（**失败行永不被丢** ✗✓，其余截断必计数 ✓） |
| `vmu.ratelimit.ratePerSec` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ratelimit.js` | 每秒补充令牌数（0＝无限流，**必须自曝"无限流"** ✗✓） |
| `vmu.ratelimit.burst` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ratelimit.js` | 突发容量（0＝不限） |
| `vmu.ratelimit.scopeDefault` | string | `global` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ratelimit.js` | 缺省作用域（perScope 为平铺覆盖，无继承链 ✗） |
| `vmu.ratelimit.onLimited` | enum | `refuse` | `refuse`∣`queue`∣`degrade` | 会话 | H1 | office | ✅ 已接线 | `kernel/ratelimit.js` | 超限动作（默认拒；queue 有上限，degrade 必须自曝 ✗） |
| `vmu.ratelimit.retryAfterMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ratelimit.js` | Retry-After 覆盖（0＝按令牌回填计算 ✓） |
| `vmu.ratelimit.maxKeys` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ratelimit.js` | 桶数上限（0＝不限；淘汰必计数 ✓） |
| `vmu.ratelimit.queueMax` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ratelimit.js` | 排队上限（0＝不排队；溢出降级为具名拒并计数 ✓） |
| `vmu.ratelimit.perScope` | object | `[object Object]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ratelimit.js` | 按作用域覆盖限额 |
| `vmu.audit.chain.verifyCap` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/auditchain.js` | 分段验证上限（0＝全链；**只验前 N 行时必须如实报未验** ✗✓） |
| `vmu.audit.chain.algorithm` | string | `sha256` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/auditchain.js` | 链哈希算法声明（仅回显；实际由注入 hash 决定 ✗） |
| `vmu.audit.chain.macKeyTtlMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/auditchain.js` | 成功解析的密钥缓存时长（0＝不过期；**解析失败不入缓存**，下次必重试 ✗✓ —— 防一次密钥库抖动永久禁用不可否认链 ✓） |
| `vmu.audit.macKey` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/index.js` | 审计链 HMAC 的**密钥引用**（**secret 引用，绝不写密钥材料** ✗✓；经注入的 `secrets` 缝解析 ✓；未给 ⇒ 链保持无密钥并**自曝 `keyed:false`** ✗✓） |
| `vmu.state.current` | string | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/stateversion.js` | 当前状态版本 |
| `vmu.state.requireVersion` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/stateversion.js` | 状态必须带版本标签（缺失 ⇒ 具名拒，**绝不当成当前版本** ✗✓） |
| `vmu.state.maxMigrationSteps` | int ≥1 | `8` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/projmigrate.js` | 迁移步数上限（超限具名拒并给当前/上限 ✓） |
| `vmu.state.onUnknown` | enum | `refuse` | `refuse`∣`warn` | 会话 | H1 | office | ✅ 已接线 | `kernel/stateversion.js` | 未知版本策略（warn 时**必须自曝 `assumed`** ✗✓） |
| `vmu.state.keepHistory` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/stateversion.js` | 是否保留迁移历史（留痕 ✓） |
| `vmu.state.allowDowngrade` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/stateversion.js` | 是否允许降级迁移（默认拒；放行也必须自曝 ✗） |
| `vmu.clock.onBackward` | enum | `clamp` | `clamp`∣`refuse`∣`warn` | 会话 | H1 | office | ✅ 已接线 | `kernel/clockguard.js` | 时钟回拨处置（clamp 不回退并自曝；refuse 具名拒；warn 必须自曝 ✗✓） |
| `vmu.clock.maxBackwardMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/clockguard.js` | 回拨容忍（≤ 容忍不判回拨 ✓） |
| `vmu.clock.forwardJumpMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/clockguard.js` | 异常前跳阈值（0＝不判定；超阈记 suspect ✓ 不静默 ✗） |
| `vmu.clock.maxForwardJumpMs` | int ≥0 | `86400000` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/clockguard.js` | 异常前跳阈值（**默认 1 天，不许关闭** ✗✓；超阈按 onForward 处置 ✓） |
| `vmu.clock.onForward` | enum | `clamp` | `clamp`∣`refuse`∣`warn` | 会话 | H1 | office | ✅ 已接线 | `kernel/clockguard.js` | 异常前跳处置（clamp 不让值跳跃并自曝 ✓；refuse 具名拒 ✓；warn 可跳但必须自曝＋计数 ✗✓） |
| `vmu.clock.maxSkews` | int ≥1 | `100` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/clockguard.js` | 回拨/前跳记录上限（溢出必计数 ✓） |
| `vmu.handover.packBudgetBytes` | int ≥1 | `32768` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/handover.js` | 上下文包预算（触界必报丢弃） |
| `vmu.handover.compress` | enum | `summary` | `none`∣`summary` | 会话 | H1 | office | ✅ 已接线 | `kernel/handover.js` | 压缩方式 |
| `vmu.handover.requireFingerprint` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/handover.js` | 每项须带指纹 |
| `vmu.handover.acceptTimeoutMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/handover.js` | 接受超时（0＝不限；执行未实现 ✗） |
| `vmu.handover.onTimeout` | string | `report` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/handover.js` | 超时行为（return|reassign|escalate；执行未实现 ✗） |
| `vmu.handover.includeKinds` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/handover.js` | 打包包含的条目类别（空＝全部） |
| `vmu.handover.redactKeys` | string[] | `[token,key,password,authorization]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/handover.js` | 打包前脱敏字段（与审计同规则） |
| `vmu.capacity.allocationPolicy` | string | `strict` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/capacity.js` | 已接线（capacity.js 读取）；默认值取自模块源码 |
| `vmu.capacity.cleanupCadenceDays` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/capacity.js` | 已接线（capacity.js 读取）；默认值取自模块源码 |
| `vmu.capacity.facilities` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/capacity.js` | 已接线（capacity.js 读取）；默认值取自模块源码 |
| `vmu.capacity.forecastHorizonDays` | int ≥0 | `30` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/capacity.js` | 已接线（capacity.js 读取）；默认值取自模块源码 |
| `vmu.capacity.forecastStaleDays` | int ≥0 | `7` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/capacity.js` | 已接线（capacity.js 读取）；默认值取自模块源码 |
| `vmu.capacity.machineHoursPool` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/capacity.js` | 已接线（capacity.js 读取）；默认值取自模块源码 |
| `vmu.capacity.overcommitRatio` | int ≥0 | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/capacity.js` | 已接线（capacity.js 读取）；默认值取自模块源码 |
| `vmu.capacity.preemptPolicy` | string | `never` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/capacity.js` | 已接线（capacity.js 读取）；默认值取自模块源码 |
| `vmu.capacity.safetyBriefingRequired` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/capacity.js` | 已接线（capacity.js 读取）；默认值取自模块源码 |
| `vmu.capacity.seatsPerDomain` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/capacity.js` | 已接线（capacity.js 读取）；默认值取自模块源码 |
| `vmu.capacity.storageWarnRatio` | ratio | `0.9` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/capacity.js` | 已接线（capacity.js 读取）；默认值取自模块源码 |
| `vmu.capacity.waitlistMax` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/capacity.js` | 已接线（capacity.js 读取）；默认值取自模块源码 |
| `vmu.compliance.auditPrepLeadDays` | int ≥0 | `14` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.calendarDir` | string | `Shared/Compliance` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.calendarTemplate` | string | `audit-checklist` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.coiScope` | string | `members` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.conflictOfInterestDisclosure` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.domainPacks` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.evidenceKind` | string | `registry` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.evidenceMembers` | string | `all` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.evidencePackFields` | string | `kind+members+at` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.irbRequired` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.overdueEscalation` | string | `block` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.prepare` | string | `checklist` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.redactionPolicy` | string | `required` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.require` | string | `irb+consent` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.requireApprovalGate` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.compliance.reviewAlertLeadDays` | int ≥0 | `7` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 已接线（compliance.js 读取）；默认值取自模块源码 |
| `vmu.conference.anonymityMode` | string | `single` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.assign` | string | `manual` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.cfpCloseMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.cfpOpenMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.maxParallelTracks` | int ≥0 | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.metaReviewRequired` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.proceedingsTrack` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.register` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.registrationCap` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.registrationFeeMinor` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.reviewAssignmentsPerPaper` | int ≥0 | `2` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.reviewDeadlineDays` | int ≥0 | `21` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.reviewerConflicts` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.schedule` | string | `sequential` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.scheduleTz` | string | `UTC` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.slotMinutes` | int ≥0 | `30` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.topicsRequired` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.conference.waiverPolicy` | string | `require-reason` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/conference.js` | 已接线（conference.js 读取）；默认值取自模块源码 |
| `vmu.external.allowNetwork` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.arxiv.maxAbstractChars` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.arxiv.preferVersioned` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.cacheDir` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.crossref.includeRelations` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.crossref.mailto` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.datacite.maxRelated` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.datacite.requireRights` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.enabled` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.endpoints` | object | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.maxBytes` | object | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值未从源码取回 ⇒ 未定，见该模块 |
| `vmu.external.maxCacheEntries` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.mergePolicy` | object | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值未从源码取回 ⇒ 未定，见该模块 |
| `vmu.external.offlineFirst` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.openalex.mailto` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.openalex.maxConcepts` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.patent.maxResults` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.patent.requireQueryString` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.primarySources` | object | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值未从源码取回 ⇒ 未定，见该模块 |
| `vmu.external.pubmed.maxMeshTerms` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.pubmed.preferAuthoritative` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.requireReceipt` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.stalePolicy` | string | `refresh` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.swh.maxTreeEntries` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.swh.requireSwhid` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.timeoutMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值取自模块源码 |
| `vmu.external.ttlMs` | object | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/external.js` | 已接线（external.js 读取）；默认值未从源码取回 ⇒ 未定，见该模块 |
| `vmu.funding.accountsDir` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.approvalThresholdMinor` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.auditPack` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.auditPackFields` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.auditPackFormat` | string | `json` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.budgetLineGranularity` | string | `category` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.costSharePolicy` | string | `balanced` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.crossInstitutionSettlementDays` | int ≥0 | `90` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.currency` | string | `EUR` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.expenseRequiredFields` | string[] | `[receipt]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.pettyCashLimitMinor` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.reimbursementSlaDays` | int ≥0 | `30` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.request` | string | `manual` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.requiredFields` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.settlementRoundMinor` | int ≥0 | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.funding.split` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/funding.js` | 已接线（funding.js 读取）；默认值取自模块源码 |
| `vmu.hr.appealWindowDays` | int ≥0 | `14` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/hr.js` | 已接线（hr.js 读取）；默认值取自模块源码 |
| `vmu.hr.humanDecisionRequired` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/hr.js` | 已接线（hr.js 读取）；默认值取自模块源码 |
| `vmu.hr.offboardingChecklist` | string[] | `[handover,keys,records]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/hr.js` | 已接线（hr.js 读取）；默认值取自模块源码 |
| `vmu.hr.performanceCadenceDays` | int ≥0 | `180` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/hr.js` | 已接线（hr.js 读取）；默认值取自模块源码 |
| `vmu.hr.performanceEvidenceRequired` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/hr.js` | 已接线（hr.js 读取）；默认值取自模块源码 |
| `vmu.hr.recruitCycleDays` | int ≥0 | `30` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/hr.js` | 已接线（hr.js 读取）；默认值取自模块源码 |
| `vmu.hr.recruitWindowOpenMs` | object | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/hr.js` | 已接线（hr.js 读取）；默认值未从源码取回 ⇒ 未定，见该模块 |
| `vmu.hr.rotationPolicy` | string | `round-robin` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/hr.js` | 已接线（hr.js 读取）；默认值取自模块源码 |
| `vmu.hr.tenureDecisionWindowDays` | int ≥0 | `60` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/hr.js` | 已接线（hr.js 读取）；默认值取自模块源码 |
| `vmu.hr.tenureQuorum` | int ≥0 | `3` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/hr.js` | 已接线（hr.js 读取）；默认值取自模块源码 |
| `vmu.hr.tenureTrackMonths` | int ≥0 | `36` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/hr.js` | 已接线（hr.js 读取）；默认值取自模块源码 |
| `vmu.ip.appealWindowDays` | int ≥0 | `30` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.authorshipRule` | string | `byContribution` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.confidentialityWindowDays` | int ≥0 | `180` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.contributorThreshold` | ratio | `0.1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.disclosureFields` | string[] | `[title,inventors,evidenceRefs,publicDisclosures]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.disclosureRequired` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.exemptRoles` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.holdEnforcement` | string | `block` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.ownershipDefault` | string | `institution` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.priorArtRequired` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.priorArtSearchDepth` | string | `standard` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.publicationHoldDays` | int ≥0 | `90` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.revenueSharePolicy` | string | `institution-first` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.sweepCadenceDays` | int ≥0 | `90` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.ip.transferPolicy` | string | `manual` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 已接线（ip.js 读取）；默认值取自模块源码 |
| `vmu.math.artifacts.maxAttemptsPerRun` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.artifacts.maxFileMb` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.artifacts.maxRuns` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.cache.crossProject` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.cache.enabled` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.cache.maxEntries` | int ≥0 | `100` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.cache.onCorrupt` | string | `recompute` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.convergence.policy` | string | `report` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.formal.axiomAudit` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.formal.coqTimeoutMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.formal.requireAll` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.formal.sorryPolicy` | string | `deny` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.interval.enabled` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.jobs.dir` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.jobs.logMax` | int ≥0 | `200` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.jobs.maxParallel` | int ≥0 | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.jobs.persist` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.linalg.backend` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.linalg.requireResidual` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.linalg.sparse` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.numeric.stability` | string | `report` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.numeric.warnings` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.optim.backend` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.optim.certificates` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.optim.timeLimitMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.optim.tolerance` | object | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值未从源码取回 ⇒ 未定，见该模块 |
| `vmu.math.precision.digits` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.precision.mode` | string | `significant` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.precision.rounding` | string | `half-even` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.precision.tolerance` | object | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值未从源码取回 ⇒ 未定，见该模块 |
| `vmu.math.report.includeRepro` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.report.language` | string | `zh-Hans` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.report.style` | string | `plain` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.repro.deterministic` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.repro.packOnSuccess` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.repro.requireSeed` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.repro.seed` | object | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.sandbox.cpuMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.sandbox.memoryMb` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.sandbox.network` | string | `deny` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.sandbox.threads` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.sandbox.wallMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.units.constantsSource` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.units.enabled` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.math.units.strictDimensions` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 已接线（mathtools.js 读取）；默认值取自模块源码 |
| `vmu.meetings.appealDeadlineMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.appealReasonRequired` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.appealScope` | string | `all` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.attendanceMode` | string | `roster` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.budgetOnExceed` | string | `refuse` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.budgetTokens` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.budgetTurns` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.budgetWallMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.chairNeutral` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.chairTransferAudit` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.committeeMax` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.committeeReportRequired` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.confidentialityDefault` | string | `internal` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.confidentialityQuotePolicy` | string | `allow` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.confirmPreviousMinutes` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.disciplineExpelAllowed` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.disciplineMuteMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.disciplineWarnMax` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.emergencyKinds` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.emergencyQuorumRatio` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.interruptAllow` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.interruptQuota` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.lateAfterMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.leaveEarlyPolicy` | string | `allow` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.liveCap` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.materialsRequired` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.minutesActionsRequired` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.minutesDetail` | string | `brief` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.minutesIncludeRefused` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.minutesRetentionMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.orderMode` | string | `fifo` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.quorumLossPolicy` | string | `suspend` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.quorumMin` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.quorumRatio` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.quorumRecountMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.recessMaxMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.recessResumeRequiresMotion` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.speechDefaultMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.speechExtendMax` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.speechExtendMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.speechMaxMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.speechQuotaPerMember` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.typeCatalog` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.unansweredInDenominator` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.verbatimEnabled` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.verbatimRetentionMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.meetings.wakeFailurePolicy` | string | `refuse` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/meetings.js` | 已接线（meetings.js 读取）；默认值取自模块源码 |
| `vmu.migration.auto` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/migration.js` | 已接线（migration.js 读取）；默认值取自模块源码 |
| `vmu.migration.dryRunDefault` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/migration.js` | 已接线（migration.js 读取）；默认值取自模块源码 |
| `vmu.migration.dryrun` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/migration.js` | 已接线（migration.js 读取）；默认值取自模块源码 |
| `vmu.migration.keepBackups` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/migration.js` | 已接线（migration.js 读取）；默认值取自模块源码 |
| `vmu.migration.onFailure` | string | `abort` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/migration.js` | 已接线（migration.js 读取）；默认值取自模块源码 |
| `vmu.migration.report` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/migration.js` | 已接线（migration.js 读取）；默认值取自模块源码 |
| `vmu.migration.reportFormat` | string | `text` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/migration.js` | 已接线（migration.js 读取）；默认值取自模块源码 |
| `vmu.migration.requireConfirm` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/migration.js` | 已接线（migration.js 读取）；默认值取自模块源码 |
| `vmu.migration.rollback` | string | `allow` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/migration.js` | 已接线（migration.js 读取）；默认值取自模块源码 |
| `vmu.migration.rollbackPointDensity` | int ≥0 | `1` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/migration.js` | 已接线（migration.js 读取）；默认值取自模块源码 |
| `vmu.migration.stepBatch` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/migration.js` | 已接线（migration.js 读取）；默认值取自模块源码 |
| `vmu.workflow.arbitrationMode` | string | `off` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.checkpointEveryMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.claimRequired` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.compensationMode` | string | `manual` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.depTypes` | string[] | `[finish-to-start]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.dueWarnBeforeMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.escalationAfterMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.escalationTarget` | string | `office` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.gateKinds` | string[] | `[entry,exit]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.handoverNote` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.idempotencyKeyScope` | string | `session` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/idempotency.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.parentDoneRule` | string | `all-terminal` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.priorityClasses` | string[] | `[low,normal,high]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.retryBaseMs` | int ≥0 | `1000` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.retryCapMs` | int ≥0 | `60000` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.retryJitterRatio` | ratio | `0.2` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.retryMax` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.softDepsEnforced` | bool | `false` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.stageGateMode` | string | `refuse` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.subtaskDepthMax` | int ≥0 | `2` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.taskTimeoutMs` | int ≥0 | `0` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.templateDefault` | string | `` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.workflow.templates` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/workflow.js` | 已接线（workflow.js 读取）；默认值取自模块源码 |
| `vmu.a11y.checkScope` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 21（共见 1 卷：21），尚未实现（元数据以各卷为准） |
| `vmu.a11y.checklist` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 21（共见 1 卷：21），尚未实现（元数据以各卷为准） |
| `vmu.a11y.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 21（共见 1 卷：21），尚未实现（元数据以各卷为准） |
| `vmu.a11y.failOn` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 21（共见 1 卷：21），尚未实现（元数据以各卷为准） |
| `vmu.a11y.headingGapPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 21（共见 1 卷：21），尚未实现（元数据以各卷为准） |
| `vmu.a11y.minContrastRatio` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 21（共见 1 卷：21），尚未实现（元数据以各卷为准） |
| `vmu.a11y.requireAltText` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 21（共见 1 卷：21），尚未实现（元数据以各卷为准） |
| `vmu.agreements.expiryWarnDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.agreements.kinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.agreements.registryDir` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.agreements.reviewCadenceDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.agreements.scopeEnforcement` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.agreements.signatureRefRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.agreements.unsignedPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.animal.anesthesiaRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.animal.deathReportLimitHours` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.animal.facilityAccreditation` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.animal.iacucRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.animal.ledgerRef` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.animal.protocolId` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.animal.reviewCycleDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.animal.threeRRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.animal.trainingRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.archive.offlineFirst` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/publication.js` | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.archive.package` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.archive.package.includeEnvironment` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.archive.package.style` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.archive.receiptRequired` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/publication.js` | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.archive.targets` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/publication.js` | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.attendance.excusedCounts` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.attendance.markMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.attendance.reportLate` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.auction.dirtyWorkQuota` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.auction.fairnessPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.auction.rotationWindow` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.audit.dir` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.audit.exportScope` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.audit.level` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.audit.recountRoles` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.audit.rotateBytes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.audit.rotateDaily` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.audit.sensitiveFields` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.audit.traceKeepMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.authorship.creditRoles` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.authorship.requireCredit` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.avail.allowOnRequest` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/publication.js` | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.avail.openLicenses` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/publication.js` | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.avail.requireUrl` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/publication.js` | 设计阶段登记：首个声明卷 16（共见 2 卷：16、20），尚未实现（元数据以各卷为准） |
| `vmu.ballot.freezeMeetingLinked` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ballotbox.js` | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.freezeMode` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ballotbox.js` | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.irvInstantSingleCount` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ballotbox.js` | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.reopenFloor` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ballotbox.js` | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.ballot.reopenInitiatorScope` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ballotbox.js` | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.ballot.reopenSameMeetingOnly` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ballotbox.js` | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.biospecimen.chainGapPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.biospecimen.destroyKeepsReference` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.biospecimen.freezeThawWarnAt` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.biospecimen.ledgerDir` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.biospecimen.mappingIrreversible` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.biospecimen.requireChain` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.biospecimen.subjectRefStyle` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.budget.perTaskShare` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.budget.subagents` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.budget.tokens` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.budget.toolCalls` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.budget.turns` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.citations.allowFreeText` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.citations.idPriority` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.citations.orcid` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.citations.preferIds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.citations.requiredFields` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.citations.ror` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.citations.style` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、16），尚未实现（元数据以各卷为准） |
| `vmu.clinical.aeReportLimitHours` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.clinical.consentVersioning` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.clinical.deviationRegister` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.clinical.registrationId` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.clinical.registrationIdPattern` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.clinical.registrationRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.clinical.reportChannel` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.clinical.saeReportLimitHours` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.clinical.unblindingRequiresReason` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.collab.agreementRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.collab.authorship` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.collab.counterpartyRegistry` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.collab.dataSharingTemplate` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.collab.expiryWarnDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.collab.exportPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.collab.federationPeers` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.collab.jointAuthorshipPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.collab.reconciliationToleranceMinor` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.collab.settlementCycleDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.collusion.maxClusterSize` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.collusion.scanEveryMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.committees.kinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.committees.parentRosterSubsetOnly` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.committees.reportFormat` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.compat.enforce` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.compat.known` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.compat.known.requireCitation` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.compat.matrixSource` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.compat.unknownCombo` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.compliance.exportControlCheck` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/compliance.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.consensus.dissentRetentionMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.consensus.protocol` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.consensus.requireDissentRecord` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.consent.recheckDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.consent.required` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.consent.scopes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.control.beatStaleMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.control.canPauseRoles` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.control.degradeSteps` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.control.idleAction` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.control.idleAfterMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.control.pauseScope` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.control.stopClearsRegistry` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.control.watchdogIntervalMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.course.allowAuditors` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.allowLate` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.blindMappingRetentionMs` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.blindReview` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.cohortMax` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.enabled` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.enrollmentNeedsApproval` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.gradeChangeAdditive` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.latePenaltyRatio` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.maxAttempts` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.maxUnits` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.ontologyVersion` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.peerWeight` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.publishToLibrary` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.readingsRequired` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.requireEvidence` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.requireRubricRef` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.retentionMs` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.reviewRounds` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.reviewersPerSubmission` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.rubricRequired` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.selfReviewAllowed` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.submitMode` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.visibility` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/course.js` | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.crypto.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.crypto.requireSignedAudit` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.crypto.rotateAfterDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.crypto.timestampAuthority` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.crypto.verifyInterval` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.data.fingerprintAlgo` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.data.requireParent` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.data.retention` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.data.versionScheme` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.dedupe.crossWorkspace` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.dedupe.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.dedupe.scope` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.deprecation.allowExempt` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.deprecation.exemptList` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.deprecation.stageDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.discipline.breakerFailures` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.discipline.breakerWindowMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.discipline.halfOpenAfterMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.discipline.postmortemRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.discipline.restoreNeedsHuman` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.discipline.suspendMaxMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.ethics.approvalRef` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.ethics.dpiaRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 2 卷：16、20），尚未实现（元数据以各卷为准） |
| `vmu.ethics.dualUseReview` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.ethics.irbRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.ethics.requireApprovalFor` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.explain.correlateBy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.explain.detail` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.explain.fairnessDetail` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.explain.includeChains` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.explain.includeScores` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.explain.reasonMaxChars` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.explain.reasonRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.explain.reportFormat` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.export.format` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.export.includeHistory` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.fairness.criticalSlots` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.fairness.maxSlotsPerInstance` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.fairness.newcomerQuota` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.fairness.rebalanceEveryMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.fingerprint.algo` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.fingerprint.includeMeta` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.fingerprint.truncate` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.handover.autoOpenOnEnd` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.handover.includeMemoryScopes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.human.approvalTimeoutMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.human.dashboardScope` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.human.observerScopes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.human.onTimeout` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.human.vetoNeedsReason` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.human.vetoScope` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.identity.allowPseudonym` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.identity.auditReads` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.identity.claimMap` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.identity.localFormat` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.identity.maxMemberships` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.identity.multiMembership` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.identity.onEnd` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.identity.principalBinding` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.identity.pseudonymScopes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.identity.trustedIssuers` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.import.onConflict` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.import.previewOnly` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.incident.disclosureDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.incident.freezeCapabilities` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.incident.notifyContacts` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.index.rebuildBatch` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.index.staleTolerance` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.index.verifyChecksum` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.instruments.attachCapture` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.blockOnOverdue` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.calibrationDueDays` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.capabilityTags` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.dataCaptureRef` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.downtimePolicy` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.hashAlgo` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.ledgerDir` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.maxHoldHours` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.overbookRatio` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.priorityPolicy` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.requireCalibration` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.requireOwner` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.reservationHorizonDays` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.reserve` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.scheduleMaintenance` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.instruments.waitlistPolicy` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/instruments.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.ip.contributors` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.ip.hold` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.ip.ownership` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.ip.recordSearch` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.ip.transfer` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/ip.js` | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.legalentity.crossBorderApproverRoles` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.legalentity.crossBorderGate` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.legalentity.invoiceTaxSlots` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.legalentity.registryDir` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.legalentity.requireEntity` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.legalentity.taxIdStyle` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.license.attributionRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.license.codeDefault` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 2 卷：16、20），尚未实现（元数据以各卷为准） |
| `vmu.license.default` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 2 卷：16、20），尚未实现（元数据以各卷为准） |
| `vmu.license.incompatiblePolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.lifecycle.alpha` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.lifecycle.dedupeKeys` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.lifecycle.powerTarget` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.lifecycle.preregLock` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.lifecycle.searchSources` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.lifecycle.topicRequiredFields` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.lifecycle.variableRoles` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.math.ad` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.ad.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.ad.gradCheck` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.artifacts` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.artifacts.dir` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.bayes` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.bayes.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.bayes.chains` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.bayes.diagnostics` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.bayes.iterations` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.bayes.pgm` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.cache` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.convergence` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.discrete` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.discrete.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.discrete.count` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.discrete.covering` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.discrete.enumerate` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.discrete.flow` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.discrete.graph` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.discrete.matroid` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.discrete.maxEnumeration` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.discrete.proof` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.discrete.scheduling` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.discrete.spectral` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.formal` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.assistants` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.coqArgs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.coqCommand` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.crossCheck` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.librarySearch` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.onDisagreement` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.skeletonStyle` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.geom` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.algebraic` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.computational` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.convex` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.differential` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.exactCoordinates` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.symbolic` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.topology` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.interval` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.jobs` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.decomp` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.eigen` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.generalized` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.leastsquares` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.precond` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.randomized` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.rank` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.solve` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.stability` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.network` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.nt` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.nt.approx` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.nt.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.nt.crypto` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.nt.diophantine` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.nt.elliptic` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.nt.factor` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.nt.modular` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.nt.primes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.nt.proofRequiredAbove` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.nt.residues` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.nt.zetafn` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.numeric` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.numeric.special` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.bvp` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.events` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.method` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.numeric` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.pde` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.reportConvergence` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.symbolic` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.tolerance` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.optim` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.backends` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.convex` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.cp` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.global` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.lp` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.mip` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.multi` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.nlp` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.robust` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.sensitivity` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.variational` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.precision` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.proof` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.report` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.report.figures` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.repro` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.sandbox` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.stats` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.stats.anova` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.stats.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.stats.causal` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.stats.doe` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.stats.effectSize` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.stats.missing` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.stats.multipleComparison` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.stats.power` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.stats.regression` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.stats.survival` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.stats.tests` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.stats.timeseries` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.assumptions` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.assumptionsPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.calculus` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.linalg` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.series` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.solve` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.special` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.tensor` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.tensor.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.units` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/mathtools.js` | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.units.constants` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.units.dimensions` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.units.solve` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.units.uncertainty` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.members.may` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.memory.compactEveryMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.mentor.graduationNeedsHuman` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.mentor.maxMenteesPerMentor` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.mentor.requireReviewBeforeGraduation` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.mentor.reviewEveryMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.metadata.customPrefix` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.metadata.strictness` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.middleware.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.middleware.onFailure` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.middleware.order` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.money.allocationRemainderPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.money.allowNegative` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.money.auditTupleFields` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.money.currencyDefault` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.money.fxMaxAgeDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.money.fxSnapshotDir` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.money.fxSource` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.money.maxAmountMinor` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.money.rejectFloatAmounts` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.money.roundingMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.money.scaleByCurrency` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.names.aliasTablePath` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.names.strict` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.names.warn` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.naming.conflictPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.notes.linkKinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.notify.channels` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.crossInstitution` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.defaultChannel` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.digestDefaultMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.dropOnFailure` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.failureKeepMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.maxSubjectsPerWatcher` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.mergeMaxPerDigest` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.mergeWindowMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.quietDefault` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.quietTimezone` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.requireReason` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.retentionMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.snrFloor` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.suppressSelfEvents` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.outreach.anonymityPreserve` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.outreach.embargoRespect` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.outreach.evidenceFidelity` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.outreach.impact` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.outreach.impactLogFields` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.outreach.impactUseInEvaluation` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.outreach.languageSet` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.outreach.mediaApprovalPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.outreach.mediaRequest` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.outreach.openReviewEnabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.outreach.publicSummaryRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 22（共见 1 卷：22），尚未实现（元数据以各卷为准） |
| `vmu.pack.format` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.pack.includeBody` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.pack.includeTrash` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.packs.allowKernelOverride` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.packs.priority` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.packs.searchPaths` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.paths.allowedRoots` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.paths.followSymlinks` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.preserve.migrateAfterYears` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.preserve.pdfProfile` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.privacy.classification` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.privacy.deidentify` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.privacy.dpEpsilon` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.privacy.kAnonK` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.privacy.minExposure` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.privacy.piiDetect` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.prompt.compatMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.prompt.order` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.prompt.sections` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.prompts.glossary.mode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 06（共见 1 卷：06），尚未实现（元数据以各卷为准） |
| `vmu.prompts.glossary.ontology` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 06（共见 1 卷：06），尚未实现（元数据以各卷为准） |
| `vmu.prompts.locale.default` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 06（共见 1 卷：06），尚未实现（元数据以各卷为准） |
| `vmu.prompts.locale.fallbackChain` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 06（共见 1 卷：06），尚未实现（元数据以各卷为准） |
| `vmu.prompts.locale.onMissing` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 06（共见 1 卷：06），尚未实现（元数据以各卷为准） |
| `vmu.prompts.overrides` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 06（共见 1 卷：06），尚未实现（元数据以各卷为准） |
| `vmu.prompts.overridesByLang` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 06（共见 1 卷：06），尚未实现（元数据以各卷为准） |
| `vmu.prompts.sections` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 06（共见 1 卷：06），尚未实现（元数据以各卷为准） |
| `vmu.provenance.depth` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.provenance.recordInputFingerprint` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.pub.retractionRequiresReason` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.pub.versionKinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.publish.jatsVersion` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/publication.js` | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.publish.requireChecklist` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/publication.js` | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.publish.versionChainStrict` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/publication.js` | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.records.body` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.chunk` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.external` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.head` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.history` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.naming` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.retention` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.trash` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.treatNegativeAsFirstClass` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/publication.js` | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.recruit.decideBy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.recruit.evidenceRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.recruit.needsHuman` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.recruit.policy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.recruit.probationPermissions` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.refs.backlinkDepth` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.refs.danglingPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.refs.requireTarget` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.replication.federationShare` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.replication.summaryEnabled` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/publication.js` | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.report.bilingual` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 06（共见 1 卷：06），尚未实现（元数据以各卷为准） |
| `vmu.report.language` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 06（共见 1 卷：06），尚未实现（元数据以各卷为准） |
| `vmu.repro.dataPointers` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.repro.includeSeed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.repro.lockEnv` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.review.conflictPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.review.mode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.review.quorum` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.review.rebuttalRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.reviewers.acknowledgement` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.reviewers.blindUnbindRequiresReason` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.reviewers.coiPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.reviewers.maxLoad` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.roles.actingMaxMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.roles.actingNeedsReason` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.roles.promotionNeedsEvidence` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.roles.recallCoolDownMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.roles.recallQuorum` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.roles.separationPairs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.roles.slotIdPattern` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.roles.termDefaultMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.roles.termMaxMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.roles.termRenewable` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.safety.askOn` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.safety.capabilityMatrix` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.safety.execAllowlist` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.safety.followSymlinks` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.safety.killSwitch` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.safety.maxCpuMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.safety.maxMemoryMb` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.safety.maxPathLength` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.safety.netPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.schedule.defaultTimezone` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.schedule.dstPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.schedule.recurrenceEnabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.scheduler.actionsAllowed` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.scheduler.maxTriggers` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.scheduler.timeSource` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.scheduler.triggers` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/scheduler.js` | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.script.stderrCap` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.script.stdoutCap` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.script.timeoutMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 2 卷：16、20），尚未实现（元数据以各卷为准） |
| `vmu.search.analyzer` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.search.maxResults` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.search.snippetLen` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.skills.catalogTtlMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.sovereignty.crossBorderAllow` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.sovereignty.exportControl` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.sovereignty.region` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.stats.correction` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.stats.effectSize` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.stats.seed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.store.autoBackup` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.backend` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.fsync` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.lock` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.lock.backoffMs` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.lock.retries` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.lock.serializeAll` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.lock.timeoutMs` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.onVersionTooHigh` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.remote` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.remote.consistency` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.remote.offlinePolicy` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.remote.url` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.root` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 2 卷：07、11），尚未实现（元数据以各卷为准） |
| `vmu.store.tmpDir` | planned | `null` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/storepolicy.js` | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.supplychain.reproducibleBuild` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.supplychain.requireLock` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.supplychain.sbomPath` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.tags.aliasTable` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.tags.controlled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.tags.maxDepth` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.tasks.create` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.templates.default` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.templates.items` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.trust.appealNeedsEvidence` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.decayOnEnd` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.displayMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.minSamples` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.useIn` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.visibility.default` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.work.autoSettle` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.work.keepEntries` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.work.pauseRule` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.work.start` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.workspace.crossWrite` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.workspace.default` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.workspace.sharedPaths` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |

**三条硬纪律（本表的门禁）**：① 表内键集合 ≡ schema 键集合（无多无少）；② 每个键都有回显＋非法拒＋热改＋审计四类断言；③ **本表不得手写第二份** —— 已由 **`scripts/generate-vmu-settings-table.mjs`** 落实 ✓✓：`--check` 未通过即红 ✗（**并已接入 T0 预检** ✓），任何人工改动都会被下一次检查抹平 ✓；④ "时间/随机"类**一律不接受用户输入**（`vmu.limits.wallClockMs` 是**框架侧上限**，不是用户可设的截止时刻 ✓）。

**两道墙钟的关系（R-a 已裁定 ✓；P3 §6）**：`vmu.limits.wallClockMs` 是**全局/阶段**兜底上限 ✓；`vmu.meetings.hardLimitMs` 是**会议级**兜底上限（默认 `1800000`，**钳制 `[300000, 7200000]`** ✓）。二者**共存**，都不把 `0` 解释成"无界" ✗（v5r 明确"不提供无界"：无界会让"卡住"永远不被发现 ✗✓）；生效值取**两者中更严者** ✓。

**键的归属（P3 §2.5／§2.6；pack 与宿主的边界 ✓）**：本表**只登记内核机制参数** ✗。① **机构语义**（席位名、编制数、`paper*`、`feedback` 规则、"何时开会/多长算停滞"等策略）⇒ **属 pack**，写进 pack 自己的设置 ✓；② **宿主职责**（`provider`／`model`／工具白名单／上下文压缩阈值）⇒ **属宿主**，vmu 不重复实现 ✗ ✓。判据一句话：**"改它会不会改变某个机构的立场或流程？"** 会 ⇒ pack ✗；不会、只改变机器行为 ⇒ 内核设置 ✓。

---

## 12. 未核项

- **热改等级的实际生效点**（哪些键真能做到 H0 立即）**未实测** ⇒ 需 P0 实现后用场景验证（本文给的是**设计承诺**）；
- **JSON Schema 投影工具**未定（Schemastery 是否自带 `toJSONSchema`，或需自写）⇒ 未核；
- **DSH settings 命名空间与本方案的对齐方式**（是否用 `settings/document-updated` 做热改入口）未核 ⇒ 见 14-§1（O1 邻近项）；
- **谁能改**的默认集合（office vs 角色槽位）为提案，待 P2 权限面落地后校准。
