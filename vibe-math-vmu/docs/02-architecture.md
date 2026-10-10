# vmu 02 · 架构总览

> 状态：**草案 v0.1**（待 00/01/02 三份侦察合并后升 v1.0）
> 上位：遵守 `01-philosophy.md` 的 R1..R15 与裁决记录；本文只谈"怎么搭"。

---

## 1. 四层模型

```
┌────────────────────── vmu 预设（DSH agent preset: id = vibe-math-vmu）──────────────────────┐
│ L4  Packs         v5r-pack · v3-pack · …      = settings ＋ 中间件 ＋ 提示词包 ＋（可选）脚本       │
│ L3  Middleware    M1 声明式规则 · M2 代码模块 · M3 脚本/工作流 · M4 外部插件                      │
│ L2  Settings      schema 单一源 → 默认/校验/热改/审计/文档/门禁                                   │
│ L1  Kernel        能力面（服务·工具·提示词段·耐久·原语）＋ 挂点总线（零策略）                        │
└───────────────────────────────────────────────────────────────────────────────────────────┘
     依赖方向：L4 → L3 → L2 → L1（只向下依赖；跨层调用一律经公开接口）
```

**判据**：任一设计条目先问两句 —— ①"这是**能力**还是**策略**？"（策略必须下沉）；②"**不改内核**能否改掉它？"（不能即不合格）。

---

## 2. 内核分区与模块边界（**按实际目录重写，2026-10-09 ✓**）

| 分区 | 真实模块（`vibe-math-vmu/` ✓） | 职责（**能力，不含策略**） | 对外暴露 |
|---|---|---|---|
| **A 会话与成员** | `kernel/members.js` | 角色**槽位**、编制登记、唤醒、在活上限、解聘/回收 | `vmu.members` ✓ + 钩子 |
| **B 耐久与投影** | `kernel/store.js`、**`kernel/work.js`** ✓ | `Store` 端口（fold／白名单／函数式 patch／原子写／备份／迁移）、**在途工作台账**（重启后标记 `interrupted` ✓） | `vmu.store`、`vmu.work` ✓ |
| **C 提示词管线** | `kernel/prompt/index.js` | 段注册、四维绑定、覆盖与回滚、变量白名单、截断计数、装配出口 | `vmu.prompt` ✓ + `prompt/assemble` 钩子 ✓ |
| **D 归档与记忆** | `kernel/library.js` | 成果卡、分轨记录、内容指纹（单点 sha256）、头部列表（**行数上限＋计数** ✓）、按 id 展开 | 工具面 `vibe_vmu_records` ✓ + 文件布局契约 |
| **E 会议与表决** | `kernel/meeting.js`、`kernel/ballot.js` | 召集/议程/轮次/举手/收束原语；票型/法定数/未定论/复议原语；状态机骨架 | 工厂 `kernel.meeting()`／`kernel.ballot()` ✓ + 钩子 |
| **F 任务与工作流** | `kernel/tasks.js` | 任务台账/依赖/分派、阶段机（`stageGate`）、`settle/*` | `vmu.tasks` ✓ + 钩子 |
| **G 形式化与计算** | `kernel/math.js`、`kernel/script-bridge.js`、**`host-math.js`** ✓ | 引擎适配（**数据描述表** ✓）、脚本作业桥、**真宿主接缝**（`register/params/fs/spawn` ✓） | 继承工具 `math_computation` ✓ + `vibe_vmu_script` ✓ |
| **H 资源与控制** | `kernel/bus.js`（能力/失败策略）、`host-hooks.js`（**工具预算强制** ✓）、`kernel/index.js`（**控制状态机** ✓） | 预算与上限、暂停/恢复/心跳、失败三态与熔断 | `vibe_vmu_control` ✓ + 钩子 |
| **I 总线与扩展点** | `kernel/bus.js`、`kernel/loader.js`、`kernel/rules.js`、`kernel/registry.js`、`kernel/pack.js` | 钩子统一封装、四形态中间件装载、pack 装载、公开接口版本 | `vmu.middleware` ✓ + 注册面 |

> **与草案的差异（都按代码改 ✓）**：草案里的 `fold.js`／`migrate.js`／`records.js`／`workflow-bridge.js`／`budget.js`／`middleware/*.js` **不存在** ✗（职责已并入 `store.js`／`library.js`／`script-bridge.js`／`math.js`／`bus.js`＋`loader.js`＋`rules.js` ✓）；**而草案里没有的三个模块后来真的长了出来** ✓ —— `work.js`（在途台账 ✓）／`guard.js`（写保护与资源闸的强制点 ✓）／`lean.js`（形式化面 ✓），加上三个宿主模块 ✓。**真实 `kernel/` ＝ 17 个 `.js`（含 `prompt/index.js` 共 18 ✓）** ✓。

**分区 ↔ 公开服务 ↔ 钩子域（**按实际 emit 点重写** ✓；"未触发"＝已登记但没有生产者的钩子 ✗）**

| 分区 | 公开服务（`registry.register` 实际发布 ✓） | 实际 **emit** 的 vmu 钩子（逐条可 grep ✓） |
|---|---|---|
| A | `vmu.members` ✓ | `member/wake-before`、`member/wake-after` ✓（`members.js` ✓） |
| B | `vmu.store`、`vmu.work` ✓ | —（无钩子） |
| C | `vmu.prompt` ✓ | `prompt/assemble` ✓（`prompt/index.js` ✓）；**`prompt/section-assembled` 登记但未触发** ✗ |
| D | `vmu.library` ✓ | **`record/append-before`／`record/appended` 登记但未触发** ✗（归档走工具面 ✓，中间件暂时拦不到 ✗） |
| E | （工厂，无独立服务 ✓） | `meeting/round-start`、`meeting/round-end`、`ballot/cast`、`ballot/tally` ✓ |
| F | `vmu.tasks` ✓ | `task/assign`、`task/transition`、`settle/before`、`settle/after` ✓ |
| G | `math_computation`（工具，条件注册 ✓） | **`math/*` 无钩子** ✗（判定点外置在 pack/中间件 ✓） |
| H | —（框架级，经桥与内核 ✓） | `control/paused`、`control/resumed`、`control/heartbeat` ✓ |
| I | `vmu.middleware` ✓ | 全部钩子的**注册与路由**（不额外触发 ✓） |
| 总控 | —（`vmu.kernel`／`vmu.settings`／`vmu.bus`／`vmu.packs` **草案里写了但并未发布** ✗） | **`pack/loading`／`pack/loaded`／`budget/exceeded`／`turn/reply-parsed`／`session/flush` 登记但未触发** ✗ |

> **咬合规则（门禁）** ✓：① 03-§2 的服务表必须与 `registry.register` 一致（**待按代码重写** ✗）；② **`VU_HOOKS` 里每个钩子要么有 emit 点、要么被显式登记为"未触发"** ⇒ 由 `tests/audit-vmu-docs.test.mjs` 的**钩子生产检查**强制 ✓（新增钩子不写生产者就会红 ✓）。
> **未触发清单（6 个，诚实 ✗）**：`turn/reply-parsed`、`record/append-before`、`record/appended`、`budget/exceeded`、`pack/loading`、`pack/loaded` ＋ 宿主侧白名单 `session/flush` ✓ —— 它们**注册了默认失败策略**，但**目前没有生产者** ✗（要么接上，要么别当"可用挂点"写 ✓）。**注** ✓：`prompt/section-assembled` **已不在本清单** ✓ —— 本会话修正了装配路径的 emit 名（曾漂移为 `prompt/assemble` ✗）并给总线加了名字校验 ✓，它现在**真有生产者** ✓。

**模块规则（静态门强制）**：跨模块只经公开接口；不得直接读对方私有状态；不得隐式全局；不得循环依赖。

**为什么必须模块化（实测依据，2026-10-09）**：`vibe-math-v5r/vibe-math-v5r.js` 是**单闭包单体** —— 只有两个模块级导出（`resolveKnownTool :93`、`__testHelpers :11478`），**其余约 11.5k 行全部在 `export function apply(ctx) :413` 一个函数体内**，45 条 `// ---- ` banner **只是同一闭包里的注释分区，不是模块边界** ✗。后果：① 任何"局部复用"都得先**抽函数**（无法 `import` 一个子系统）；② 行号/文件规模不可控（纯 LF 11,597 行 / 833 KB）；③ 跨代复用只能发生在**已抽出的少数纯件**上（`math-computation.js`、`math-engines.js`、纯算法如 `applyV5Event :589`／`judgeVerdict :6593`／`aggregateOpinion :6557`、提示词 builder 群）。
⇒ **这正是 vmu 把"模块化"写进 R14 并配静态门（单文件上限 ＋ 跨模块 import 白名单 ＋ 禁私访）的直接理由** ✓；v5r 的复用判决因此以 **"抽出重构/重写"为主、"原样复用"为辅**。

---

## 3. 与 DSH 底座的映射（关键；依据 00 号侦察，逐条带证据）

| vmu 需要 | DSH 提供什么 | vmu 怎么用 |
|---|---|---|
| 预设声明 | **bundle patch 插 `@deepseek-ai/dsh-agent-preset` 行**（`.agent-presets/` 已废，官方逐字"Nothing reads that directory any more."） | patch YAML ＋ `plugins:` 列表；行 `id` 约定 `preset-<id>`；`config.{id,plugins}` 必填、`order` 为 roster position ⚠**组语义官方写法是 YAML `group: true` ＋ `name: cordis:group`**；`apply[Symbol.for('cordis.group')]=true` 是**Loader/包源码层细节、非官方文档要求**（U1），但本仓实测**必须**保留否则预设静默不激活 |
| 配置与 schema | **官方未规定载体** ✗：真实包**两种都有**（`@deepseek-ai/schemastery` 与 zod 声明 `Config`） | **vmu 自裁选定 Schemastery 为准**（D12）；**对外投影 JSON Schema** 供文档/门禁 |
| 工具面 | `tools.register`；参数 DSL＝`parameters:{ <名>:{type,required:true,description,enum} }`（**`required` 写在参数内部**，不是顶层数组）；**`output` 必填**——源码级原因：`dsh-tools/lib/index.js:842` **无保护地**解引用 `options.output.render`，省略即 `TypeError` | 内核工具统一注册器；**`restrict` 只能减**（逐字），其"四类抛错"**未核** ✗ ⇒ 需要"加/改"的场合一律走自建注册面 |
| 提示词面 | `systemPrompt.section/context/tools/variable` ＋ `system-prompt/assemble` 瀑布 | **重要实测（B′）**：v5r **根本不调用 `systemPrompt.*`** ✗ —— 它把 persona/提示词经 **`subagents.startContinuable` 的 spec** 传入子代理。⇒ vmu **有两条可选路**：① 走 DSH 原生提示词服务（热改/段注册更自然，**vmu 倾向此路** ✓）；② 沿用 spec 注入（兼容 v5r 形态）。**无论哪条，中间件必须能在"每次装配"处介入**（对应 `prompt/assemble` vmu 钩子）|
| 拦截与改写 | `tools/pre-execute|post-execute|execute`、`agent/pre-step|request|request-error|turn-stopping` 等瀑布 | 中间件总线把这些**统一成 vmu 钩子名**，并屏蔽差异（mode/作用域/disposer） |
| 子代理 | `subagents.startContinuable/sendMessage/listChildren`、`subagent/start|end` | 成员运行时的**执行后端**；vmu 不重造子代理 |
| 团队/任务（可选） | `agentTeams.*` | 作为 **M4 外部插件**可消费的既有协作面（vmu 不强制依赖） |
| 会话与耐久 | `session/event`、`fs`、`storageDomain` | 读会话事件做**观测**；**vmu 自有状态绝不写入会话日志**（硬限制） |
| 工作流 | `workflowEngine.start` ＋ `workflow/*` | M3 脚本形态的**执行后端** |
| 设置热改 | `settings/document-updated`、`configEditor` | 热改入口候选（待 02 号提炼后定稿） |
| 资源读数 | `tokenMeter`、`toolResultPruner`、`compaction` | 预算与压缩的**上游信号**（比成员自报更可信） |

### 3.0 C′ 终版纠正（**覆盖上表与主纲 §10.2 中已过时的表述** ✗✓）

> 来源：`design/02-dsh-official-guidelines.md`（**138 KB / 2,084 行**，17 个规范文件经 **SHA256 逐文件校验 `17/17 HASH-OK`**）＋ `design/00` 早期侦察。**冲突处以 C′ 终版为准。**

| # | 我此前的表述 | **纠正后的事实（带证据）** |
|---|---|---|
| 1 | "兼容性走 `engines.dsh` ＋ `dsh.minVersion/testedVersion/compatibility`" | **DSH 全仓不存在这三个字段** ✗：全归档 `minVersion` 只命中第三方 `got/semver/http2-wrapper`；唯一 `engines` 提法是**否定式**（`dsh-app-boot/README.md:52`：*"These checks use peer declarations, not `engines.dsh`…"*）⇒ **DSH 的版本门禁走 `peerDependencies`** ✓。本仓 `package.json` 里那些字段只对**本仓 installer/CI** 有意义（**未核**，见 14-§2） |
| 2 | "层序＝空根→bundles→profile→home→`--patch`" | **没有 CLI `--patch` 层**（全归档 0 命中）✗；实际：**bundle → profile `cordis.patch.yml` → home `$DSH_HOME/cordis.patch.yml`（home 优先级更高）** ✓；**空/纯注释 patch 会导致启动失败** ⇒ 禁用要写 `[]` ✓ |
| 3 | "`apply[Symbol.for('cordis.group')]=true` 只是源码层细节、非官方要求" | **机制本身已被源码证实为真实** ✓：`cordis-plugin-loader/src/config/group.ts:7` `static readonly key = Symbol.for('cordis.group')`；`dsh-agent-preset/lib/index.js:12` `static [EntryGroup.key] = true;`（且需配 `static inject = ["agentPresets"]`）⇒ **仅当自写"config 即子条目列表"的插件类时需要**；YAML 层用 `group: true` ＋ `name: cordis:group` 即可 ✓ |
| 4 | 预设 `config` 字段"名称/描述/顺序/plugins" | **逐字 schema 只有 5 键**：`id: z.string().required()`／`name`／`description`／`order: z.number()`／`plugins: z.array(z.any()).required()` ✓ |
| 5 | `order` 语义未明 | **逐字实现**：`rows.sort((a,b)=>(a.order??Infinity)-(b.order??Infinity)||a.id.localeCompare(b.id))` ⇒ **无范围限制**、未给的**排最后**、同值按 **id 字典序** ✓ |
| 6 | "`output` 强制（源码级）" | **更强**：`dsh-tools/lib/index.js:2881` 有**显式守卫** `throw new TypeError('tool "<name>" must declare output { schema, render, presentationMeta? }')` ✓；另三条硬约束：对象型参数**必须显式写布尔 `additionalProperties`**（`schema.js:158-160`）、参数级 `required` **只能写 `true`**、**`type` 与 `oneOf` 不可同时出现** ✓ |
| 7 | "官方规范＝3 套 skill" | **实为 4 套** ✗：另有 **`agent-experience/SKILL.md`**（工具定义/skill/工作流写作规范）＋ **`templates/mcp/*`（2 文件）** ✓ |

**陈旧副本警告** ✗✓：`_oneoff/vm-verify/p-agent-preset-0.1.7-rc.2/package/skills/` **不可再用**（与归档内文件 SHA256 **DIFF**，且缺 `agent-experience/SKILL.md` 与 `references/user-actions.md`）；归档内实际版本为 **`0.2.0-rc.2`** ✓。

**并发写入记录** ✗✓：同一交付物 `design/02-…md` 曾被**两个只读员先后写入**（32,213 B → 52,010 B → **138,210 B**）；**终版取代并解决了前一版的 4 个未核项**（U1 group symbol／U3 output 强制／U6 `templates/mcp`／U7 `packages.md`）。两者**均已结束**，当前磁盘版本＝终版 ✓（其 SHA256 前 16 位 `C588398BF9054076`，写入后未再变动 ✓）。

### 3.1 五条"不许依赖"的硬限制 ⇒ 设计对策

| 限制（侦察实测） | vmu 对策 |
|---|---|
| **不得**往会话日志追加自定义 `type`（毁可恢复性） | 自有 `Store` ＋ 文件布局；会话日志只读不写 |
| `guard` **同步且单调**（只能加否认） | 需要"询问后再决定"的场合一律走 **waterfall 钩子**，不用 guard |
| `restrict` **只能减**，四类输入会抛 | 工具面"加/改"由 vmu 自建注册面负责；`restrict` 只做减法 |
| waterfall **必须 `return next()`** 才放行 | 总线在**包装层**统一保证（中间件作者不必懂 DSH 细节） |
| UI 插件**禁 import Harness Client 包、禁 iframe** | GUI 面板按官方 `ui-plugin` 规范；首个交付不依赖 GUI（见 01-O2） |

---

## 4. 运行时骨架（草案）

```
DSH boot
  └─ bundle patch 装载 vmu 插件（＋ 选中的 pack）
       ├─ L1 内核：Store 载入/迁移 → 投影重建 → 能力面注册（服务/工具/提示词段）→ 总线登记
       ├─ L2 设置：schema 解析 → 分层合并（pack默认 < 预设Config < 会话Settings < 运行时set）→ 生效＋审计
       ├─ L3 中间件：清单解析 → 顺序/作用域/失败策略 → 逐条装载（M1/M2/M3/M4）→ dry-run 校验
       └─ L4 pack：声明式规则 ＋ 模块 ＋ 提示词包 ＋（可选）脚本 → 组装出"一套运行机制"
运行中
  ├─ 成员回合：唤醒 → 提示词装配（C）→ 模型 → 工具执行（H 门 + L3 钩子）→ 回复解析（vmu 钩子）→ 状态推进
  ├─ 会议/表决/任务/阶段：原语 + 状态机骨架（E/F）→ 具体规则由 L3 决定
  └─ 观测：status/报告统一只读面（R11）
停机/崩溃
  └─ Store flush → 恢复时迁移 + 投影重建 + 一致性校验（R10）
```

---

## 5. 扩展点全景（给 pack/中间件/插件作者看的一张图）

| 想要做的事 | 用哪一层 | 入口 |
|---|---|---|
| 改一个阈值/开关 | **L2** | settings 键（schema 声明即得校验/文档/回显/审计） |
| "某条件下拒绝/放行某工具" | **L3-M1** | 声明式规则 `on: tools/pre-execute` |
| 改提示词措辞/追加规则段 | **L2+L3-M1** | 提示词覆盖 ＋ 段注册 |
| "完全换一套会议规则" | **L4** | pack 里的中间件组合 |
| 复杂控制器（读状态决定行为） | **L3-M2** | 代码模块（声明能力清单＋失败隔离） |
| 把一段流程交给脚本 | **L3-M3** | workflow 桥（结构化返回，不进提示词） |
| 加新工具/新面板 | **L3-M4** | 额外 DSH 插件消费 vmu **公开服务**（版本化） |
| 复现历史某代行为 | **L4** | 该代的 pack（首个＝v5r-pack） |

---

## 6. 目录布局（**按实际树重写，2026-10-09 ✓**）

```
vibe-math-vmu/                     # 随包发布（package.json#files ✓）
├── vibe-math-vmu.js               # 插件入口 apply(ctx, config)：装配内核/适配器/桥/整合包/提示词/数学/台账 ✓
├── host.js                        # 宿主工具面（6 个工具的 spec 与注册，幂等串行 ✓）
├── host-hooks.js                  # 宿主钩子桥（含**工具预算强制**与 control 钩子挂载 ✓）
├── host-spawn.js                  # 子进程接缝（调用时解析可执行文件 ✓）
├── host-math.js                   # 共享数学模块的**真宿主接缝** ✓
├── math-computation.js / math-engines.js   # 共享模块（**原样复用**，字节一致门 ✓）
├── settings/schema.js             # L2：**54 个手写核心键** ＋ 由 `settings/planned.js` 组成的**计划键**（合计 717 键 ✓；含 hot／who／doc ✓）
├── settings/planned.js            # **生成物**：设计阶段声明的计划键（由 `scripts/generate-planned-settings.mjs` 从 docs 生成 ✓）
├── kernel/                        # L1（17 个 `.js`；含 `prompt/index.js` 共 18 ✓）
│   ├── index.js  bus.js  store.js  work.js  library.js  members.js
│   ├── meeting.js  ballot.js  tasks.js  math.js  rules.js
│   ├── loader.js  script-bridge.js  registry.js  pack.js
│   └── prompt/index.js
├── packs/institute-min.js         # L4 示例整合包（真实 JS manifest ✓；`_template` **未提供** ✗）
├── docs/00..14                    # 本套文档（15 篇；仓内门禁守卫 ✓）
└── agent.cordis.yml               # 预设声明（插件行 ＋ persona ✓）

（仓库根，非本包）tests/            # 门禁：vmu 场景 ＋ 两份文档审计 ＋ 发布形状 ✓
```
> **与草案的差异** ✓：草案里的 `package.json`（bundle manifest）／`cordis.patch.yml`／`preset-declaration.js`／`index.js`／`middleware/`／`prompts/`／`packs/*.yml` **都不存在** ✗ —— 本包是**预设自带的插件目录**（声明在 `agent.cordis.yml` ✓），中间件与提示词段**不落盘**（来自 `config.vmu` ✓，见 12-§2.1 ✓）。

---

## 7. 待决（**全部已裁 ✓**，与 01-§5 D13 同步）

1. **模块规模上限与 import 白名单** ⇒ **已裁**：单文件建议 ≤1200 行（`kernel/index.js` 为大头、已拆出 `work.js` ✓）；跨模块**只经公开接口**（静态门：`audit-vmu-docs` 的服务面 ＋ 模块清单检查 ✓）。
2. **总线封装深度** ⇒ **已裁 D13-O7**：只暴露 vmu 钩子名；"原生 DSH 事件透传"默认关闭、需显式开启 ✓。
3. **pack 加载时机** ⇒ **已裁**：**boot 期**（`config.packs` ✓）＋ 运行期可对**内联 manifest** 做 `plan/apply/unload` ✓（`vibe_vmu_pack` 工具 ✓）。
4. **提示词作用域模型** ⇒ **已裁 D13-O6**：固定优先级 `角色 < 阶段 < 成员 < 任务`，不做任意嵌套 ✓（`BINDING_PRIORITY` ✓）。

---

## 8. 本篇的验收判据

1. **分层不越界**：任一设计条目的"能力 vs 策略"归属可一句话判定（§1 判据）；
2. **模块边界可验**：A–I 每区有模块名与"对外暴露"列，且静态门能证明"跨模块无私访/无循环"；
3. **底座映射可核**：§3 每一行都有 DSH 侧证据（文档级或源码级，**已分标注**）；
4. **硬限制有对策**：§3.1 五条限制**各有**对策，且对策不依赖被禁行为；
5. **扩展点可走**：§5 表中每一行都能在 03–10 号文档里找到对应的登记项（无悬空）。

---

## 9. 未核项

- 本文引用的 DSH 侧事实中，**文档级**与**源码级**证据已分别标注；其中 `restrict` 的"四类输入抛错"**未核**（官方仅逐字支持"只能减"）⇒ 见 14-§2（U1–U7）；
- **GUI 面（`dsh.client`）的活 Slot/Theme 读数未核**（本机 Client Inspect 超时）⇒ 见 14-§1（O2）；
- **`app.asar` 内文件无法用本 agent 的 `read` 工具直读**（BigInt 缺陷，已登记 14-§3 R-5）。

> **机器可判定要求**：本篇每条验收判据都要能说出"**哪条断言、期望什么、实际什么**"（具名红 ✗）；每个**场景**都要可复跑；分层判据要能被 `S-*` 静态门与 `B-*` 行为门分别证明 ✓。
