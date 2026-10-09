# vmu 03 · 内核接口契约（公开面登记处）

> 状态：**草案 v0.1**（工具/服务清单为**首版提案**，待 `01-v5r-reuse-map.md` 合并后定稿）
> 上位：`01-philosophy.md`（R6/R7/R11/R13）、`02-architecture.md`（内核 A–I）
> 规则：**本文件登记的东西才是"公开面"**；未登记的内部实现**任何人不得依赖**（含 pack、中间件、外部插件）。

---

## 0. 三条铁律

1. **登记即公开，公开即契约**：本文件没有的符号，上层不许用；用了 ⇒ 静态门红。
2. **命名统一**：工具/服务/耐久键/错误码一律 `vibe_vmu_*` / `vmu.*` / `VMU_*`（D6）。
3. **版本化**：每个公开面带 `apiVersion`（§7）；破坏性变更 ⇒ bump ＋ 迁移说明（13 号文档）。

---

## 1. 公开面总览（七张表）

| # | 面 | 面向谁 | 在本文件的位置 | 相关文档 |
|---|---|---|---|---|
| 1 | **Services**（宿主内服务） | M4 插件、其它 DSH 插件、框架自身 | §2 | 02-§3 |
| 2 | **Tools**（模型可调用） | 成员/主代理（模型） | §3 | 12 号使用说明 |
| 3 | **Prompt sections / variables** | 提示词作者、pack | §4 | 06 号 |
| 4 | **Hooks**（可介入时机） | M1/M2 中间件 | §5（索引；全表在 05-§4） | 05 号 |
| 5 | **Durable keys ＋ 文件布局** | pack、脚本、外部工具、运维 | §6 | 07 号 |
| 6 | **Error codes** | 所有上层 | §8 | 11 号门禁 |
| 7 | **Settings keys** | 使用者 | §9（索引；全表在 04-§4） | 04 号 |

---

## 2. Services（提案；签名待定稿）

| 服务键 | 职责 | 主要方法（提案） | apiVersion |
|---|---|---|---|
| `vmu.kernel` | 生命周期与总控（启动/暂停/收束/健康） | `state()`、`pause(reason)`、`resume()`、`settle(stage)`、`health()` | 1 |
| `vmu.store` | 耐久端口（事务/版本/迁移/订阅） | `open(spec)`、`read(key)`、`write(key, value, {expect})`、`patch(key, fn)`、`subscribe(key, fn)`、`migrate()`、`export()/import()` | 1 |
| `vmu.settings` | 设置读改与审计 | `get(key)`、`resolved(key)`、`set(key, value, {layer, by, reason})`、`auditTail(n)`、`jsonSchema()` | 1 |
| `vmu.middleware` | 中间件装载与观测 | `list()`、`validate(entry)`、`dryRun(entries, samples)`、`status()`、`disable(id)` | 1 |
| `vmu.bus` | 钩子总线（内部＋DSH 桥接） | `emit(hook, payload, {scope})`、`on(hook, meta, fn)`、`trace(traceId)` | 1 |
| `vmu.prompts` | 提示词管线 | `sections()`、`register(section)`、`resolve(binding)`、`snapshot()` | 1 |
| `vmu.library` | 归档与记忆 | `list(filter)`、`expand(id)`、`fingerprint(kind, parts)`、`append(record, {track})`、`truncationReport()` | 1 |
| `vmu.meetings` | 会议/表决原语 | `convene(agenda, kind)`、`round()`、`handUp(id)`、`ballot(target, kind)`、`cast(vote)`、`tally(ballot)`、`close(ballot, reason)` | 1 |
| `vmu.tasks` | 任务与阶段 | `create(task)`、`assign(id, who)`、`transition(id, to)`、`list(filter)`、`stage()` | 1 |
| `vmu.budget` | 预算与上限 | `usage(scope)`、`check(op, scope)`、`exceeded()`、`degrade(reason)` | 1 |
| `vmu.members` | 成员与角色**槽位** | `roster()`、`roles()`、`assignRole(id, slot)`、`wake(id, ask)`、`end(id, reason)` | 1 |
| `vmu.packs` | 整合包装载 | `available()`、`active()`、`load(name, {dryRun})`、`unload(name)`、`conflicts()` | 1 |

**约定**：所有方法**只返回结构化数据**（无副作用者返回快照）；**带副作用者必须返回"发生了什么"的可审计摘要**；任何拒绝都必须带 `{ok:false, code, message, hint?}`。

---

## 3. Tools（`vibe_vmu_*`；首版提案）

> 目标：**能力齐备但不内置策略**；工具只回答"能做"，"是否/何时做"由中间件与提示词决定。
> **别名层**：pack 可声明映射（如 `vibe_v5_say → vibe_vmu_say`），使旧语料/旧提示词可复用（D6）。

| 工具 | 语义（一句话） | 必填 | 具名拒（示例） |
|---|---|---|---|
| `vibe_vmu_status` | 只读总览：阶段/成员/会议/表决/预算/设置生效值/中间件状态 | — | — |
| `vibe_vmu_report` | 面向人的报告（可裁剪字段） | — | — |
| `vibe_vmu_set` | 改设置（受权限与热改等级约束，全程审计） | `key`/`pairs` | `VMU_INVALID_ARGUMENT`、`VMU_NOT_PERMITTED` |
| `vibe_vmu_members` | 花名册与角色槽位（只读） | — | — |
| `vibe_vmu_hire` / `vibe_vmu_fire` | 增/减成员（走内核槽位；**"临时工"由 pack 定义**） | `slot`/`id` | `VMU_RESOURCE_BUDGET`、`VMU_STATE` |
| `vibe_vmu_say` | 发消息（群聊/私聊；可被中间件拦截） | `text` | `VMU_NOT_PERMITTED` |
| `vibe_vmu_meeting` | 会议原语：召集/议程/举手/收束 | `op` | `VMU_STATE`、`VMU_NOT_PERMITTED` |
| `vibe_vmu_ballot` | 表决原语：开板/投票/计票/结束 | `op`,`target` | `VMU_STATE`、`VMU_NOT_PERMITTED` |
| `vibe_vmu_record_progress` | 记录（`track` 分轨，截断计数） | `content` | `VMU_INVALID_ARGUMENT` |
| `vibe_vmu_record_{proposition,method,subproblem}` | 成果卡（库） | `statement` 等 | `VMU_INVALID_ARGUMENT` |
| `vibe_vmu_read_library` | 读库：`{list:true}`＝头部列表；`{id}`＝展开 | — | `VMU_NO_SUCH_OBJECT`（悬空 id 必须具名拒） |
| `vibe_vmu_task` | 任务：建/派/迁移/查 | `op` | `VMU_STATE` |
| `vibe_vmu_lean_lib` / `vibe_vmu_lean_read` / `vibe_vmu_lean_archive` | 形式化面（复用 sha256 内容身份） | 视 op | `VMU_LEAN_*` |
| `vibe_vmu_pause` / `vibe_vmu_resume` | 暂停/恢复调度（含"待续标记"语义） | — | `VMU_STATE` |
| `vibe_vmu_pack` | 整合包：查看/装载/卸载（含 dry-run） | `op` | `VMU_PACK_*` |
| `vibe_vmu_mw` | 中间件：查看/校验/干跑/禁用 | `op` | `VMU_MIDDLEWARE_*` |

**工具面纪律**（对 DSH 的对接约束，**来源已分级标注** ✓）：
- **参数 DSL（源码级）**：`parameters: { <名>: { type, required: true, description, enum } }` —— **`required` 写在参数内部**，**不是**顶层 `required[]` 数组 ✗；
- **`output` 必填（源码级，非文档级）**：`dsh-tools/lib/index.js:842` **无保护地**解引用 `options.output.render`（`L849` 解引用 `.schema`）⇒ 省略 `output` 必然 `TypeError`；
- **`additionalProperties: false`** 的价值（第一方包注释）：保证"日志快照 == 模型以为自己写的内容"⇒ vmu 工具**默认收紧**；
- **四条更细的硬约束（C′ 终版，源码级）** ✗✓：① **对象型参数必须显式写布尔 `additionalProperties`**（`dsh-tools/.../schema.js:158-160`）；② **参数级 `required` 只能写 `true`**；③ **`type` 与 `oneOf` 不可同时出现**；④ `output` 的强制是**显式守卫**：`dsh-tools/lib/index.js:2881` `throw new TypeError('tool "<name>" must declare output { schema, render, presentationMeta? }')` ✓；
- **`restrict` 只能减**（官方逐字）；其"四类输入抛错"的说法**未核** ✗ ⇒ 需要"加/改"的场合由 vmu **自建注册面**负责，不依赖 DSH restrict；
- 每个工具都必须有：**具名拒**、`status` 可观测面、以及"被中间件拦截时"的审计留痕。

---

## 4. Prompt sections / variables（索引）

| 段名（提案） | 用途 | 可变点 | 绑定维度 |
|---|---|---|---|
| `charter` | 章程/规章（**内容由 pack 给**） | 全文覆盖 | 角色槽位 |
| `role` | 角色说明 | 全文覆盖 | 角色槽位 |
| `state` | 状态块（只读事实） | 不得覆盖（框架注入） | 阶段/成员 |
| `hooks-contract` | 钩子/中间件机制说明 | 覆盖 | 全局 |
| `library-index` | 归档头部列表（S21 思路） | 模板 | 成员/阶段 |
| `stage-guidance` | 阶段指引 | 覆盖 | 阶段 |
| `task-brief` | 当前任务简报 | 模板＋注入 | 任务 |

**变量**：`{{member}}`、`{{role}}`、`{{phase}}`、`{{time}}`、`{{setting:key}}`、`{{count:...}}`、`{{pack}}` —— **白名单制**，未登记变量即拒（防注入）。
**纪律**：状态块**不得**由 pack/中间件覆盖（保证 R11 只读事实可信）。

---

## 5. Hooks（索引）

完整表在 `05-middleware.md` §4（DSH 底座钩子 ＋ vmu 内部钩子）。**登记规则**：新增钩子必须**同时**更新 03（索引）与 05（全表），否则门禁红。

---

## 6. Durable keys 与文件布局契约（公开部分）

```
<workspace>/
├── vmu/                          # 内核工作区（公开布局，pack/脚本可读）
│   ├── state.json                # 单一 fold 投影（＋版本号/迁移记录）
│   ├── settings.resolved.json    # 生效设置与来源（只读镜像）
│   ├── packs/<name>/             # 已装载 pack 的清单与来源
│   └── audit/                    # 设置/中间件/拒绝 审计（只增）
├── Members/<id>/
│   ├── Progress/{progress,routes,obstacles,rejected,state}.md
│   ├── Propos/ · Methods/ · Subproblems/
│   └── Profile.md
└── Shared/                       # 所级共享（会议纪要/决议/形式化/论文…）
```
**公开键（提案）**：`phase`、`members[]`（含角色槽位与待续标记）、`tasks[]`、`meetings[]`、`ballots[]`、`records[]`（含指纹）、`budget`、`settings.resolved`、`middleware[]`、`packs[]`。
**纪律**：① **绝不**把自有状态写进 DSH 会话日志（硬限制）；② 键的增删属**破坏性变更** ⇒ 走 §7；③ 截断一律**计数**（见 07 号）。

---

## 7. 版本化与废弃

| 面 | 版本字段 | 兼容策略 |
|---|---|---|
| Services | `apiVersion`（每服务） | 只增方法＝minor；改签名/删方法＝major（bump ＋ 迁移说明） |
| Tools | 工具描述里写明可用版本；`vibe_vmu_*` 名称稳定 | 改名＝新工具 ＋ 旧名进入**别名层**弃用期 |
| Prompt sections | 段名稳定；内容可变属 pack 事 | 删段＝major |
| Durable keys | `state.version` 整数 ＋ `migrate()` | 每次 bump 必须提供**前向迁移**与**回退说明** |
| Error codes | 登记表（§8）| 只增；改语义＝新码 |

---

## 8. Error codes（提案；登记表）

| 码 | 语义 | 何时 | 是否必须具名解释 |
|---|---|---|---|
| `VMU_INVALID_ARGUMENT` | 参数非法（域外/缺失/类型） | 所有工具入口 | ✅ |
| `VMU_NOT_MEMBER` | 调用者不是可识别成员/角色 | 需要身份的操作 | ✅ |
| `VMU_NOT_PERMITTED` | 权限不足（含中间件拦截） | 写/管操作 | ✅（须说明**谁能做**） |
| `VMU_NO_SUCH_OBJECT` | 对象不存在（悬空 id） | 读/引用 | ✅（须给**下一步**） |
| `VMU_STATE` | 状态不允许该操作 | 阶段/流程约束 | ✅ |
| `VMU_RESOURCE_BUDGET` | 触达预算/上限（机器强制） | 工具调用/新建成员/内存 | ✅（须给**当前值与上限**） |
| `VMU_PACK_CONFLICT` / `VMU_PACK_MISSING` | 整合包冲突/缺失 | 装载 | ✅ |
| `VMU_MIDDLEWARE_REJECTED` | 中间件**显式**拒绝 | 钩子 | ✅（须给**中间件 id**） |
| `VMU_MIDDLEWARE_FAILED` | 中间件异常（按失败策略处置） | 钩子 | ✅（须给**原始错误**） |
| `VMU_STORE_FAILED` / `VMU_STORE_MIGRATION` | 耐久写失败/迁移失败 | 耐久层 | ✅ |
| `VMU_LEAN_*` | 形式化面（找不到/编译失败/无工具链…） | Lean 工具 | ✅ |

**纪律**：**任何"拒绝"都必须具名**（R11）；不得返回"空成功"或近似物（沿用 v5r 的 S21 纪律）。

---

## 9. Settings keys（索引）

全表在 `04-settings.md` §4（命名空间 `vmu.*`）。**登记规则**：新增键必须同时更新 04 与 §6 的公开键清单（如涉及耐久）⇒ 否则门禁红。

---

## 10. 本文件的验收判据（门禁）

1. **登记完整性**：源码中出现的公开符号 ∈ 本文件（多一个/少一个 ⇒ 红）；
2. **README/文档引用一致**：02/04/05/06/07 引用的服务/工具/钩子/键**都存在**（悬空引用 ⇒ 红）；
3. **命名合规**：`vibe_vmu_*` / `vmu.*` / `VMU_*` 之外的前缀 ⇒ 红；
4. **版本字段**：每个 Service 有 `apiVersion`；docker 键有 `state.version`；
5. **具名拒覆盖**：每个工具的每条拒绝路径都有登记码 ⇒ 红/绿可判。

---

## 11. 未核项

- 本文 §2 的服务/工具清单为**首版提案**，签名待 P0 实现时定稿；
- **工具参数 DSL 的细节**（`required` 位置、`additionalProperties` 行为）为**源码级**证据（官方文档未明文）⇒ 见 14-§2（U3）；
- **`restrict` 的"四类输入抛错"未核**（官方仅逐字支持"只能减"）⇒ 见 14-§2（U2）；
- 公开接口**版本化粒度**（按服务/按 pack 契约）待裁 ⇒ 见 14-§1（O3）。
