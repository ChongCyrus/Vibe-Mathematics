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
// settings/schema.js（示意）
import { Schema } from '@deepseek-ai/schemastery'      // 选定载体（真实包两种写法都有）
export const Settings = Schema.object({
  'vmu.limits.toolCallsPerTurnCap': Schema.natural().default(0).description('单回合工具调用上限；0＝不限'),
  'vmu.limits.maxLiveMembers':      Schema.natural().default(0).description('本所在活成员上限；0＝不设'),
  'vmu.meetings.quorumRule':        Schema.union([Schema.const('m-unanimous'), Schema.const('all-unanimous')]).default('m-unanimous'),
  'vmu.prompts.overridesDir':       Schema.string().default('prompts/overrides'),
  'vmu.middleware.entries':         Schema.array(Schema.object({ /* 见 05 手册 */ })).default([]),
  'vmu.packs.active':               Schema.array(Schema.string()).default([]),
  // …
})
export const SettingsJsonSchema = toJsonSchema(Settings)   // 单向派生；文档/门禁/域检查共用
```

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

> 未标等级的键**不得**上线（静态门红）。H2/H3 必须给出**用户可见提示**，不许"改了没反应"。

---

## 6. 审计与"谁能改"

- **写权限**：默认 **office（会话根）**；`vmu.safety.delegableKeys` 可把某些键下放给"角色槽位"（例如让某角色改自己的提示词覆盖）。
- **审计面**：`status().settings.auditTail`（尾 N 条）＋耐久全量；字段见 §2。
- **拒收**：未声明键、域外值、无权限者、H3 键 ⇒ 一律**具名拒**并说明原因与"谁可以改"。

---

## 7. 文档自动生成（R4 的落地方式）

`schema → 参数表` 每行字段：**键 / 类型 / 默认 / 域 / 作用域 / 热改等级 / since / 谁能改 / 说明 / 示例**。
**门禁**：① 表中键集合 ≡ schema 键集合（无多无少）；② 每个键在测试中至少有"回显＋非法拒＋热改"三条断言；③ 表内示例必须可跑（配方测试）。

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

## 11. 未核项

- **热改等级的实际生效点**（哪些键真能做到 H0 立即）**未实测** ⇒ 需 P0 实现后用场景验证（本文给的是**设计承诺**）；
- **JSON Schema 投影工具**未定（Schemastery 是否自带 `toJSONSchema`，或需自写）⇒ 未核；
- **DSH settings 命名空间与本方案的对齐方式**（是否用 `settings/document-updated` 做热改入口）未核 ⇒ 见 14-§1（O1 邻近项）；
- **谁能改**的默认集合（office vs 角色槽位）为提案，待 P2 权限面落地后校准。
