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
| `vmu.records.pointerPropagation` | bool | `true` | — | 会话 | H1 | office | ✅ 已接线 | `packs/institute-min.js` | P3/S21：头部列表为默认信息通道；关＝零注入且提示词逐字回退 |
| `vmu.records.meetingKeepEvery` | int ≥1 | `5` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | P3：每 N 场会议保留一次归档（v5r 的 meetingKeepEvery） |
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
| `vmu.math.compileTimeoutMs` | int ≥0 | `0` | — | 会话 | H0 | office | ✅ 已接线 | `kernel/math.js` | 编译超时；0＝作业级默认 |
| `vmu.math.formalVerify` | enum | `off` | `off`∣`encourage`∣`require` | 会话 | H2 | office | ✅ 已接线 | `kernel/lean.js` | P3：判定时的形式化要求；默认 off＝零策略 |
| `vmu.math.leanCommand` | string | `lean` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/lean.js` | P3：Lean 命令名（命令模板可覆盖） |
| `vmu.math.leanArgs` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/lean.js` | P3：Lean 附加参数（显式 -R/--root 优先于 searchPaths） |
| `vmu.math.leanTimeoutMs` | int ≥0 | `120000` | — | 会话 | H0 | office | ✅ 已接线 | `kernel/lean.js` | P3：单次 Lean 编译预算 |
| `vmu.math.leanAsync` | bool | `true` | — | 会话 | H2 | office | ✅ 已接线 | `kernel/lean.js` | P3：后台队列编译；只有"退出 0 且文件内容哈希未变"才可标 passed |
| `vmu.math.leanInitiative` | enum | `normal` | `off`∣`normal`∣`eager` | 会话 | H2 | office | ✅ 已接线 | `kernel/lean.js` | P3：日常形式化积极性（与 formalVerify 判定时要求正交） |
| `vmu.math.leanSearchPaths` | string[] | `[]` | — | 会话 | H1 | office | ✅ 已接线 | `kernel/lean.js` | P3：额外 -R 根（去重后注入，自动 VibMath 根之前） |
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
| `vmu.agenda.carryOnAdjourn` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.agenda.maxItems` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.agenda.ownerRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.agenda.reorderAudit` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.agenda.splitDepthMax` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.agenda.timeboxRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.arbitration.binding` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.arbitration.mode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.arbitration.recordInMinutes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.archive.package` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.archive.package.includeEnvironment` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.archive.package.style` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.attendance.excusedCounts` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.attendance.markMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.attendance.reportLate` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.auction.bidWindowMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.auction.claimFirst` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.auction.closeRule` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.auction.dirtyWorkQuota` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.auction.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.auction.fairnessPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.auction.maxBidCost` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.auction.maxOpenAuctions` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.auction.requirePlan` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.auction.rotationWindow` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.audit.dir` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.audit.exportScope` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.audit.level` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.audit.recountRoles` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.audit.redactKeys` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.audit.retentionDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、20），尚未实现（元数据以各卷为准） |
| `vmu.audit.rotateBytes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.audit.rotateDaily` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.audit.sensitiveFields` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.audit.traceKeepMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.authorship.creditRoles` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.authorship.requireCredit` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.avail.requireUrl` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 2 卷：16、20），尚未实现（元数据以各卷为准） |
| `vmu.ballot.abstainAllowed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.abstainCountsForFloor` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.auditReadOnly` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.auditRetentionMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.freezeMeetingLinked` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.freezeMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.irvInstantSingleCount` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.method` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.minVotes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.minVotesRatio` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.processReadingsVisible` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.proxyChainMaxDepth` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.proxyMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.quadraticCreditCap` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.quotaSeats` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.recuseDeclareMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.recusePublic` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.reopenFloor` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.ballot.reopenInitiatorScope` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.ballot.reopenSameMeetingOnly` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.rollCallOrder` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.roundsMax` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.runoffTopN` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.secrecy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.ballot.secrecyRecordFact` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.tieRule` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.ballot.vetoMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.board.agingWarnMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.board.columns` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.board.moveRequiresTransition` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.board.swimlanes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.board.wipDefault` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.board.wipPerColumn` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.budget.fairnessPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.budget.onExceed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.budget.perTaskShare` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.budget.reserveRatio` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.budget.subagents` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.budget.tokens` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.budget.toolCalls` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.budget.turns` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.budget.warnAtRatio` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.charter.amendNeedsHuman` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.charter.amendNeedsQuorum` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.charter.depthMax` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.charter.dissolveNeedsHuman` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.charter.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.charter.fissionMax` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.charter.frozenClauses` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.charter.mergeNeedsHuman` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.charter.precedence` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.charter.spawnMaxChildren` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.citations.allowFreeText` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.citations.idPriority` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.citations.orcid` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.citations.preferIds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.citations.requiredFields` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.citations.ror` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.citations.style` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、16），尚未实现（元数据以各卷为准） |
| `vmu.collab.exportPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.collab.federationPeers` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.collusion.maxClusterSize` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.collusion.maxMutualShare` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.collusion.minEvidence` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.collusion.onSuspect` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.collusion.scanEveryMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.collusion.windowMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.committees.kinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.committees.parentRosterSubsetOnly` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.committees.reportFormat` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.compat.enforce` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.compat.known` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.compat.known.requireCitation` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.compat.matrixSource` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.compat.unknownCombo` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.conflict.appealToHuman` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.conflict.arbiterMustDiffer` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.conflict.arbiterRule` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.conflict.classes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.conflict.cooldownMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.conflict.escalateMaxPerSubject` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.conflict.hearingNeedsMinutes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.conflict.maxOpen` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
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
| `vmu.course.allowAuditors` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.allowLate` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.blindMappingRetentionMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.blindReview` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.cohortMax` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.enrollmentNeedsApproval` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.gradeChangeAdditive` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.latePenaltyRatio` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.maxAttempts` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.maxUnits` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.ontologyVersion` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.peerWeight` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.publishToLibrary` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.readingsRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.requireEvidence` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.requireRubricRef` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.retentionMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.reviewRounds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.reviewersPerSubmission` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.rubricRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.selfReviewAllowed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.submitMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.course.visibility` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.crypto.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.crypto.requireSignedAudit` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.crypto.rotateAfterDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.crypto.signingKeyId` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.crypto.timestampAuthority` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.crypto.verifyInterval` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.data.fingerprintAlgo` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.data.requireParent` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.data.retention` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.data.versionScheme` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.dedupe.crossWorkspace` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.dedupe.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.dedupe.scope` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.delegation.auditChains` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.delegation.defaultTtlMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.delegation.maxDepth` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.delegation.maxTtlMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.delegation.onExhausted` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.delegation.reasonRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.delegation.requireExplicitScope` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.delegation.revokeBroadcast` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.delegation.subdelegateAllowed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.delegation.tokenShare` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.delegation.turnsShare` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
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
| `vmu.fairness.minShares` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.fairness.newcomerQuota` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.fairness.rebalanceEveryMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.fingerprint.algo` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.fingerprint.includeMeta` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.fingerprint.truncate` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.funding.requiredFields` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.gc.autoRun` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.gc.exemptMarkers` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.gc.graceDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.gc.scope` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.handover.acceptTimeoutMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.handover.autoOpenOnEnd` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.handover.includeKinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.handover.includeMemoryScopes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.handover.onTimeout` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.handover.packBudgetBytes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.handover.requireFingerprint` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.handover.requiredFields` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
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
| `vmu.math.ad` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.ad.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.ad.gradCheck` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.artifacts` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.artifacts.dir` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.artifacts.maxAttemptsPerRun` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.artifacts.maxFileMb` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.artifacts.maxRuns` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.bayes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.bayes.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.bayes.chains` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.bayes.diagnostics` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.bayes.iterations` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.bayes.pgm` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.cache` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.cache.crossProject` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.cache.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.cache.maxEntries` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.cache.onCorrupt` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.convergence` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.convergence.policy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.discrete` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
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
| `vmu.math.formal` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.assistants` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.axiomAudit` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.coqArgs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.coqCommand` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.coqTimeoutMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.crossCheck` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.librarySearch` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.onDisagreement` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.requireAll` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.skeletonStyle` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.formal.sorryPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.geom` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.algebraic` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.computational` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.convex` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.differential` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.exactCoordinates` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.symbolic` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.geom.topology` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.interval` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.interval.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.jobs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.jobs.dir` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.jobs.logMax` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.jobs.maxParallel` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.jobs.persist` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.decomp` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.eigen` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.generalized` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.leastsquares` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.precond` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.randomized` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.rank` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.requireResidual` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.solve` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.sparse` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.linalg.stability` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.network` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.nt` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
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
| `vmu.math.numeric` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.numeric.special` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.numeric.stability` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.numeric.warnings` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.bvp` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.events` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.method` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.numeric` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.pde` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.reportConvergence` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.symbolic` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.ode.tolerance` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.optim` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.backends` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.certificates` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.convex` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.cp` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.global` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.lp` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.mip` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.multi` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.nlp` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.robust` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.sensitivity` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.timeLimitMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.tolerance` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.optim.variational` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.precision` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.precision.digits` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.precision.mode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.precision.rounding` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.precision.tolerance` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.proof` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.report` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.report.figures` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.report.includeRepro` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.report.language` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.report.style` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.repro` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.repro.deterministic` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.repro.packOnSuccess` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.repro.requireSeed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.repro.seed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.sandbox` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.sandbox.cpuMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.sandbox.memoryMb` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.sandbox.network` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.sandbox.threads` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.sandbox.wallMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.stats` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
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
| `vmu.math.symbolic` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.assumptions` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.assumptionsPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.calculus` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.linalg` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.series` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.solve` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.symbolic.special` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.tensor` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.tensor.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.units` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.math.units.constants` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.units.constantsSource` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.units.dimensions` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.units.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.units.solve` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 15（共见 1 卷：15），尚未实现（元数据以各卷为准） |
| `vmu.math.units.strictDimensions` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 1 卷：09），尚未实现（元数据以各卷为准） |
| `vmu.math.units.uncertainty` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 09（共见 2 卷：09、15），尚未实现（元数据以各卷为准） |
| `vmu.meetings.appealDeadlineMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.appealReasonRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.appealScope` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.attendanceMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.budgetOnExceed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.budgetTokens` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.budgetTurns` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.budgetWallMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.chairNeutral` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.chairTransferAudit` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.committeeMax` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.committeeReportRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.confidentialityDefault` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.confidentialityQuotePolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.confirmPreviousMinutes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.disciplineExpelAllowed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.disciplineMuteMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.disciplineWarnMax` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.emergencyKinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.emergencyQuorumRatio` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.interruptAllow` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.interruptQuota` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.lateAfterMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.leaveEarlyPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.liveCap` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.materialsRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.minutesActionsRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.minutesDetail` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.minutesIncludeRefused` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.minutesRetentionMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.orderMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.quorumLossPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.quorumMin` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.quorumRatio` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.quorumRecountMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.recessMaxMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.recessResumeRequiresMotion` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.speechDefaultMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.speechExtendMax` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.speechExtendMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.speechMaxMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.speechQuotaPerMember` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.typeCatalog` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.unansweredInDenominator` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.verbatimEnabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.verbatimRetentionMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.meetings.wakeFailurePolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.members.may` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.memory.cardKinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.memory.cardTtlMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.memory.compactEveryMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.memory.compactionEveryMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.memory.keepEvery` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.memory.maxCards` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.memory.neverDropKinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.memory.requireEvidence` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.memory.scopeRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.memory.visibility` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.mentor.graduationNeedsHuman` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.mentor.maxMenteesPerMentor` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.mentor.requireReviewBeforeGraduation` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.mentor.reviewEveryMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.metadata.customPrefix` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.metadata.strictness` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.metrics.allowTrigger` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.metrics.exportFormat` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.metrics.indicators` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.metrics.windowMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.middleware.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.middleware.onFailure` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.middleware.order` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.migration.auto` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.migration.dryRunDefault` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.migration.dryrun` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.migration.keepBackups` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.migration.onFailure` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.migration.report` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.migration.reportFormat` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.migration.requireConfirm` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.migration.rollback` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.migration.rollbackPointDensity` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.migration.stepBatch` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.minutes.actionsOwnerRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.minutes.confirmPreviousRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.minutes.dissentMandatory` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.minutes.dueRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.motions.amendFriendlyInline` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.motions.amendSubstantiveMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.motions.expireMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.motions.maxOpen` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.motions.privilegedKinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.motions.proceduralKinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.motions.secondThreshold` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.motions.tabledMax` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.motions.withdrawable` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.names.aliasTablePath` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.names.strict` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 2 卷：07、13），尚未实现（元数据以各卷为准） |
| `vmu.names.warn` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 13（共见 1 卷：13），尚未实现（元数据以各卷为准） |
| `vmu.naming.conflictPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.notes.linkKinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.notify.channels` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.crossInstitution` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.dedupWindowMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.defaultChannel` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.digestDefaultMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.dropOnFailure` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.enabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.failureKeepMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.maxSubjectsPerWatcher` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.maxWatchers` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.mergeMaxPerDigest` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.mergeWindowMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.priorityFloor` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.quietDefault` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.quietTimezone` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.requireReason` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.retentionMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.snrFloor` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.notify.suppressSelfEvents` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.pack.compression` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
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
| `vmu.provenance.depth` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.provenance.recordInputFingerprint` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.pub.retractionRequiresReason` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.pub.versionKinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.quota.hardBytes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.quota.onExceed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.quota.softBytes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.quota.warnAt` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.allowedKinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.body` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.body.chunkedReturn` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.body.noticeStyle` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.bodyCapBytes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.chunk` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.chunk.chunkBytes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.chunk.thresholdBytes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.expandThreshold` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.external` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.external.allowedSchemes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.external.verifyExists` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.head` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.head.maxItems` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.head.sort` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.headFields` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.history` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.history.depth` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.history.storeMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.naming` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.naming.conflictSuffix` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.naming.maxLength` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.naming.slugPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.retention` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.retention.keepEvery` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.retention.maxBytes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.retention.permanentMarker` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.retention.tierThreshold` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.trash` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.trash.autoPurge` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.trash.countInQuota` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.trash.retainDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.records.treatNegativeAsFirstClass` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.recruit.decideBy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.recruit.evidenceRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.recruit.maxCandidates` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.recruit.needsHuman` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.recruit.policy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.recruit.probationMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.recruit.probationPermissions` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.refs.backlinkDepth` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.refs.danglingPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.refs.requireTarget` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.relations.backlinkMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.relations.centralityEnabled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.relations.controlledVocab` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.relations.crossTrack` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.relations.cycleDetection` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.relations.pathMaxDepth` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.relations.staleAfterDays` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.relations.types` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.relations.weightRange` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.repro.dataPointers` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.repro.includeSeed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.repro.lockEnv` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.review.conflictPolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.review.mode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.review.quorum` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.review.rebuttalRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
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
| `vmu.schedule.triggerVia` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.scheduler.actionsAllowed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.scheduler.maxTriggers` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.scheduler.timeSource` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.scheduler.triggers` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.script.stderrCap` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.script.stdoutCap` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.script.timeoutMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 2 卷：16、20），尚未实现（元数据以各卷为准） |
| `vmu.search.analyzer` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.search.maxResults` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.search.snippetLen` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.skills.catalogTtlMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.skills.declareTtlMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.skills.degradePolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.skills.evidenceRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.skills.negotiationRounds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.skills.requiresPermission` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.sovereignty.crossBorderAllow` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.sovereignty.exportControl` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.sovereignty.region` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.stats.correction` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.stats.effectSize` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.stats.seed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 16（共见 1 卷：16），尚未实现（元数据以各卷为准） |
| `vmu.store.autoBackup` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.backend` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.fsync` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.lock` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.lock.backoffMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.lock.retries` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.lock.serializeAll` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.lock.timeoutMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.onVersionTooHigh` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.remote` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.remote.consistency` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.remote.offlinePolicy` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.remote.url` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.root` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.store.tmpDir` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.supplychain.reproducibleBuild` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.supplychain.requireLock` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.supplychain.sbomPath` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 20（共见 1 卷：20），尚未实现（元数据以各卷为准） |
| `vmu.tags.aliasTable` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.tags.controlled` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.tags.maxDepth` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.tasks.create` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.templates.default` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.templates.items` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.topology.autoSelect` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.topology.budgetMultiplier` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.topology.maxDepth` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.topology.mode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.topology.starCenterSlot` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.appealNeedsEvidence` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.appealWindowMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.decayOnEnd` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.displayMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.evidenceRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.halfLifeMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.minSamples` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.selfScoreAllowed` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.useIn` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.useInArbitration` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.useInAuction` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.trust.useInSelection` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.visibility.default` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.work.autoSettle` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.work.keepEntries` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.work.pauseRule` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 07（共见 1 卷：07），尚未实现（元数据以各卷为准） |
| `vmu.work.start` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 17（共见 1 卷：17），尚未实现（元数据以各卷为准） |
| `vmu.workflow.arbitrationMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.checkpointEveryMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.claimRequired` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.workflow.compensationMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.depTypes` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.dueWarnBeforeMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.escalationAfterMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.workflow.escalationTarget` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 2 卷：08、17），尚未实现（元数据以各卷为准） |
| `vmu.workflow.gateKinds` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.handoverNote` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.idempotencyKeyScope` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.parentDoneRule` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.priorityClasses` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.retryBaseMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.retryCapMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.retryJitterRatio` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.retryMax` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.softDepsEnforced` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.stageGateMode` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.subtaskDepthMax` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.taskTimeoutMs` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.templateDefault` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
| `vmu.workflow.templates` | planned | `null` | — | 会话 | H1 | office | ⚠️ 未接线（改了不会有行为变化） | — | 设计阶段登记：首个声明卷 08（共见 1 卷：08），尚未实现（元数据以各卷为准） |
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
