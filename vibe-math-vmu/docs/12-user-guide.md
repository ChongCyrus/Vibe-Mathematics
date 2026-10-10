# vmu 12 · 使用说明（用户向）

> 状态：**草案 v0.1**（示例为"目标形态"；实现落地后本文需与真实 CLI/参数逐字校对）
> 上位：`01-philosophy.md`（R3 四可 / R11 具名拒绝）、`04-settings.md`（设置手册）、`05-middleware.md`（中间件手册）
> 读者：**使用者**（不一定读内核代码）。目标：**半小时内能改出一套自己的运行机制**。

---

## 1. 心智模型（先懂这三句话）

1. **vmu 本身不做研究机制**，它给你**能力**（开会、表决、归档、计算…）和**挂点**（在哪介入）；
2. **机制 ＝ settings（量）＋ 中间件（规则）＋ pack（打包好的一整套）**；
3. **改之前先看 `status`**：它告诉你当前阶段、成员、会议、预算、**以及每个设置值从哪一层来**。

---

## 2. 安装、选择与**真实接线**

```bash
# 本仓（开发/自用）
node installer.js            # 安装预设（含本包全部文件与 15 篇文档 ✓）
# 选择预设：vibe-math-vmu（GUI 预设选择器，或宿主 API agentPresets.select(agent, 'vibe-math-vmu')）
```

### 2.1 配置住在哪里（**先前本文没写，读者无法照做 ✗；2026-10-09 校准 ✓**）

vmu 是**插件**：它的配置来自**该插件在 profile 里的那一行**（`config`），**不是** `settings.yml` ✗ ——
运行时代码里**没有任何 YAML/文件读取** ✓（设置与中间件都是内存态数据 ✓）。

```yaml
# <profile>/cordis.patch.yml（或预设自带的插件行）
- insert:
    - id: vibe-math-vmu
      name: 'dsh-vibe-math/vibe-math-vmu/vibe-math-vmu.js'
      config:
        instance: my-vmu            # 可选；多实例排障用（回执里自证身份）
        root: 'D:/work/vmu-data'    # 可选；有它才有耐久库与 vibe_vmu_records
        packs: ['institute-min']    # 整合包：随包 id（解析 ./packs/<id>.js 的 PACK）或内联 manifest
        modules: ['D:/work/mod.js'] # M2 代码模块：文件路径（动态 import）或内联 { id, module }
        scripts:                    # M3 脚本：声明了才注册 vibe_vmu_script
          - id: probe
            file: node
            args: ['-e', 'console.log(JSON.stringify({ok:true,summary:"ran"}))']
            timeoutMs: 20000
        vmu:                        # settings：点分键（键名必须已登记，见 04 §11）
          'vmu.middleware.entries':
            - id: proof-gate
              kind: rules
              on: [tools/pre-execute]
              when: { all: [{ tool: ['vibe_vmu_records'] }, { not: { subject: 'has_locked_formal_proof' } }] }
              then: [{ deny: { code: VMU_NOT_PERMITTED, message: '该对象尚无定稿的形式化证明' } }]
```

> **两个必须知道的边界** ✗：
> ① **M1 规则必须内联 `when`/`then`** —— `kind:'rules'` 的条目**没有** `file:` 读取路径 ✗（写 `file:` 会被忽略）；
> ② **`config` 里的非法值目前不校验** ✗（只有工具 `vibe_vmu_set` 走 04 §11 的登记检查 ✓）⇒ 见 §10 未核项。
>
> 术语对照（本文与 03/10 一致 ✓）：`config.root`／`config.instance`／`config.packs`／`config.modules`／`config.scripts`／`config.vmu` 就是上面 `config:` 下的同名字段 ✓。

选择顺序建议：**先用现成 pack 跑通 → 再改 settings → 最后写中间件**。

---

## 3. 第一步：看与改（settings）

```yaml
# settings.yml（示例）
vmu.limits.toolCallsPerTurnCap: 12     # 单回合工具调用上限（0＝不限）
vmu.limits.maxLiveMembers: 6           # 在活成员上限（0＝不设）
vmu.middleware.entries:
  - { id: proof-gate, kind: rules, file: middleware/rules/proof-gate.yml }
vmu.packs.active: [v5r]
```
- **改完怎么知道生效**：`vibe_vmu_status` ⇒ `settings.resolved` 里能看到**值 + 来源层**；
- **热改等级**：H0 立即／H1 下一回合／H2 下一会话／H3 只读；**改了没反应会明确告诉你"需重启"**（不许静默忽略）；
- **非法值**：会**具名拒**（告诉你是哪个键、什么域、谁能改）。

---

## 4. 第二步：写第一条中间件（推荐从"声明式规则"开始）

```yaml
# middleware/rules/proof-gate.yml
id: proof-gate
on: [tools/pre-execute]
when:
  all:
    - tool: [vibe_vmu_meeting]         # 表决＝会议工具的一个 action（真实工具面：action: 'ballot'|'vote'|'tally'）
                                       # 注：`vibe_vmu_ballot` 作为独立工具**未实现 / 规划**，当前不存在该工具名 ✗
    - not: { subject: has_locked_formal_proof }   # 该对象没有"已定稿的正式证明/证伪"
then:
  - deny:
      code: VMU_INVALID_ARGUMENT
      message: "只有已被正式证明或证伪、且已定稿的对象才能进入表决"
```
**上线前后怎么看它**（⚠️ **校正 ✗✓**：此前这里写的 `vibe_vmu_mw {op:'validate'|'dryRun'|'status'}` 是 **⛔ 未实现**的工具 ✗ —— 真名是 `vibe_vmu_middleware`，且它**没有** validate/dryRun 动作 ✓）：
1. `vibe_vmu_middleware {action:'list'}` —— 看条目 `id`／`on`／`failure`／`enabled`／`hits`／`consecutiveFailures` ✓；
2. `vibe_vmu_middleware {action:'disable', id:'proof-gate'}` ⇒ `{action:'enable', id:'proof-gate'}` —— **禁用/启回**（禁用后行为回基线 ✓）；
3. **静态校验与干跑**（**本轮已具工具面 ✓**）：`{action:'validate', id:'proof-gate'}`（或 `rule:'<新规则 JSON>'`）⇒ 返回 `{ok, problems, vocabulary}` ✓；`{action:'dryRun', id:'proof-gate', samples:'[{"tool":"edit"}]'}` ⇒ 返回 `{ok, evaluated, hits, would}` 且**对总线零副作用** ✓（`hits` 不增 ✓）。

**写错也不会炸** ✗：中间件异常按 `failure: open|closed|abort` 处置，**并留审计**；连续失败会**熔断**并通知。

---

## 5. 第三步：管提示词（把"执行流程"交给相应负责人）—— **真实接线，2026-10-09 校准 ✓**

**段的来源（真实现 ✗✓）**：段在**插件行的 `config` 里声明**（`promptSections` ✓；旧写法 `prompt: "<单段文本>"` 仍支持 ✓），绑定与覆盖可来自 `config` **或**已声明的 settings ✓：

```yaml
# <profile>/cordis.patch.yml 的插件行 config:
        promptSections:
          - { name: charter,     text: "…（内联文本）…" }
          - { name: task-brief,  file: briefs/t-42.md }      # 相对 config.root 读取
        promptBindings:                                       # 也等价于 settings['vmu.prompts.bindings']
          - { section: task-brief, task: ['t-42'], owner: 'm-2' }
        promptOverrides:
          charter: "…（直接覆盖该段）…"
        whoMayOverride: ['office']
        vmu:
          'vmu.prompts.overridesDir': prompts/overrides        # 目录里的 <段名>.md 覆盖同名段 ✓
```

- **生效顺序（真实现）**：`promptOverrides`／`overridesDir` > 段的 `file` > 段的 `text` ✓；**宿主实际收到的是"覆盖后"的合并文本** ✓（不是原文本 ✗）——这就是"运行中编辑提示词"的落点 ✓；
- **谁看得到**：宿主 `systemPrompt` 的**一个**分节（名字 `vmu` ✓）承载全部生效段（按声明顺序拼接 ✓）；**没有声明段 ⇒ 完全不注册** ✓（零机制 ✓）；
- **验证（两种视图，别混 ✗）**：
  - `vibe_vmu_status` ⇒ **`prompt.sections[].source`**（**声明层**：`kernel`／`pack`／`settings`…）＋ **`prompt.sections[].overridden`**（该段是否被覆盖 ✓）＋ `prompt.bindings`（绑定条数 ✓）＋ `prompt.truncation`（截断计数 ✓）；
  - 入口自身视图 `handle.prompts()` ⇒ **`inline`／`file`／`override`**（这段文本究竟从哪来 ✓）；
- **回滚**：覆盖是"引用替换"，删掉覆盖文件/键即回原段 ✓（绑定与覆盖都来自配置，改回即生效 ✓）。

> **诚实边界** ✗：`whoMayOverride` 已传入管线并参与"谁可覆盖"判定 ✓，但**运行期没有工具面**去改提示词 ✗（改法是改配置／改覆盖文件并重启该实例 ✓）；四维绑定的**运行时注入**（按角色/阶段/成员/任务派发）验收见 06-§7 ✓。

---

## 6. 常见配方（可直接照抄）

| 想要 | 怎么做 |
|---|---|
| 收紧预算 | `vmu.limits.*` ＋ 需要时加 `budget/exceeded` 中间件做降级 |
| 表决前必须有正式证明 | §4 的 `proof-gate` |
| 冻结期不许推进发言轮 | 在 `meeting/round-complete` 上挂规则：`subject: in_frozen_ballot` ⇒ `cancel` |
| 负向知识必须归档 | 在 `record/append-before` 用 `track` 推导 ⇒ 强制分轨 |
| 阶段门禁（论文前每条结论要有出处 id） | 在 `settle/before` 用 M2 模块检查 |
| 只允许某角色召集会议 | `meeting.can-convene` ＋ `when.role` |
| 中断后继续未完成的工作 | 依赖**在途工作台账**（默认能力）：恢复时框架提示负责人"你还有未完成的工作" |
| 临时对比实验 | `vibe_vmu_set { vmu.packs.active: [] }` 或关掉某中间件（禁用后行为回基线） |
| **打开数学计算面** | 在插件行声明 `math: true`（或任一 `vmu.math.*` 键 ✓）⇒ 发布继承过来的 `math_computation`（先用 `{op:'probe'}` 列出本机可用引擎 ✓；**未声明 ⇒ 不出现** ✓，零机制不受管理面豁免 ✓） |
| **暂停/恢复整个流程** | 声明 `control: true` ⇒ `vibe_vmu_control {action:'pause', reason:'…'}`（**暂停后任务新建/转换会被具名拒** ✓）⇒ `{action:'resume'}` ✓；`{action:'beat'}` 记心跳，`vmu.limits.wallClockMs` 超时即 `stale:true` ✓ |
| **在会话里开一场会并表决** | 声明 `meetings: true`（或 `ballot: true` ✓）⇒ `vibe_vmu_meeting`：`{action:'open', agenda:'…', roster:['r-1','r-2']}` ⇒ 拿 `id` ✓；`{action:'speak', id, member:'r-1', text:'…'}` ✓；`{action:'ballot', target:'prop-1'}` ⇒ 拿 `ballotId` ✓；`{action:'vote', ballotId, member:'r-1', value:'for'}` ✓（**口语票值会被面上归一化**为 1/0 ✓，权威拒绝仍来自原语 ✓）；`{action:'tally', ballotId}` 出结果 ✓；未知 id ⇒ **`VMU_NO_SUCH_OBJECT`** ✓（先 `{action:'list'}` 看活对象 ✓） |
| **在会话里驱动任务板** | 声明 `tasks: true`（**或**给 `vmu.tasks.stages` 一个非空数组 ✓）⇒ `vibe_vmu_task`：`{action:'create', title:'…'}` ⇒ 拿 `id` ✓；`{action:'assign', id, owner}` ✓；`{action:'transition', id, to:'doing'}` ✓（**依赖/阶段门/暂停门仍由内核强制** ✓）；`{action:'brief', id}` 取该任务的执行流程 ✓；`{action:'history'}` 看轨迹 ✓ |

---

## 7. 出问题怎么查（三步）

1. **看状态**：`vibe_vmu_status`（阶段/成员/会议/预算/**设置来源**/中间件状态/最近失败）；
2. **看审计**：`status.auditTail`（谁在何时改了什么、最后一次拒绝的理由与**是哪条中间件**拦的）；
3. **看拒绝信息**：所有拒绝都**具名**（码＋原因＋建议），例如 `VMU_RESOURCE_BUDGET` 会告诉你**当前值与上限**、`VMU_NO_SUCH_OBJECT` 会给你**下一步**。

**常见困惑**
- "改了没反应" ⇒ 看热改等级（H1/H2）与是否被更高层覆盖（看 `resolved.overridden`）；
- "某个工具老被拒" ⇒ 极可能被中间件拦了，看 `traceId` 追"哪条中间件、什么条件"；
- "提示词里少了一段" ⇒ 看该段的 `scope` 是否命中当前角色/阶段/任务，或是否被覆盖。

---

## 8. 安全与边界（需要知道的事）

- **谁能改**：默认会话根（office）；个别键可下放给角色（`vmu.safety.delegableKeys`）；
- **不可协商**：有些量是**只读**（H3）或**由框架设置**（例如"时间"不接受用户传入）；
- **不写会话日志**：vmu 状态在自有文件/存储里（**这是硬约束**，不是缺陷）；
- **能力可缺席但会明说**：没有 Lean/LaTeX 时工具**具名降级**，不会假装成功。

---

## 9. 本文档的验收判据

1. **每个配方都能照抄跑通**（配方测试：一条配方 → 一个场景）；
2. **每个"改了没反应"的疑问在 §7 有答案**（热改等级与来源可见）；
3. **每条拒绝都能在 §7 查到**（码表与 03-§8 一致）；
4. **零配置可跑**：不写任何 settings/中间件也能启动并完成一次基本循环（R2 的"默认主线"）。

---

## 10. 未核项

- **本文示例是"目标形态"**：真实 CLI/参数名落地后必须**逐字校对**（否则用户会照抄失败 ✗）；
- **GUI 设置面板是否存在未定** ⇒ 见 14-§1（O2）；无面板时"改设置"的入口以 CLI/文件为准；
- **安装路径**（本仓 installer 还是 DSH 插件安装）在 P0 前未定 ⇒ 本文暂写"二选一"；
- **常见配方尚未跑通**（配方测试待 P2/P3 补）。

> **机器可判定要求**：每个配方都要有一条可复跑**场景**（照抄即得预期结果）；每条排障结论都要能指向一条**断言**或一次**具名红**；"改了没反应"必须能由状态面**断言**解释 ✓。

---

## 11. 装配：装什么、从哪来、最小可跑

### 11.0 接线状态横幅（**先读这一节，避免"旋钮幻觉"** ✗✓）

- **大多数设置键今天没有运行时消费者** ✗（**具体数字不写死** ✗✓ —— 以 `00-§3.2` 的**生成索引**与 `docs/04 §11` 的接线列**实时为准** ✓；本节末尾的命令可随时重算 ✓）。
- **对计划键调用 `vibe_vmu_set` 会回执 `noConsumer: true`** 并说明"**改了不会有任何变化**" ✓ ⇒ **按计划键设计机制，今天不会生效** ✗（要等实现阶段）。
- **已接线键**（**派生自 `docs/04-settings.md` 的 `✅ 已接线` 行**，命令见本节末；**非凭记忆** ✗），按族列出（**数量随实现推进增长 ⇒ 永远以命令输出为准** ✓）：
  - **核心/限额（7）**：`vmu.core.enabled`｜`vmu.core.logLevel`｜`vmu.limits.maxLiveMembers`｜`vmu.limits.maxParallel`｜`vmu.limits.memoryCeilingMb`｜`vmu.limits.toolCallsPerTurnCap`｜`vmu.limits.wallClockMs`
  - **任务（2）**：`vmu.tasks.maxOpenTasks`｜`vmu.tasks.stages`
  - **会议（9）**：`vmu.meetings.hardLimitMs`｜`vmu.meetings.quorumCap`｜`vmu.meetings.quorumRule`｜`vmu.meetings.quoteDepthMax`｜`vmu.meetings.quotesPerMessageMax`｜`vmu.meetings.reconsiderFloor`｜`vmu.meetings.roundTimeoutMs`｜`vmu.meetings.verdictMaxRounds`｜`vmu.meetings.wakeRetries`
  - **中间件（4）**：`vmu.middleware.entries`｜`vmu.middleware.dryRun`｜`vmu.middleware.breakerThreshold`｜`vmu.middleware.hookTimeoutMs`
  - **提示词（4）**：`vmu.prompts.bindings`｜`vmu.prompts.overridesDir`｜`vmu.prompts.resourceSection`｜`vmu.prompts.whoMayOverride`
  - **记录（5）**：`vmu.records.tracks`｜`vmu.records.truncateMode`｜`vmu.records.fingerprintPolicy`｜`vmu.records.headListAt`｜`vmu.records.pointerPropagation`
  - **包/安全（5）**：`vmu.packs.active`｜`vmu.packs.activeOverrides`｜`vmu.packs.allowOverride`｜`vmu.safety.pathPolicy`｜`vmu.safety.delegableKeys`
  - **数学计算面（15）**：`vmu.math.mode`｜`vmu.math.computation`｜`vmu.math.engines`｜`vmu.math.packages`｜`vmu.math.installScope`｜`vmu.math.formalVerify`｜`vmu.math.timeoutMs`｜`vmu.math.compileTimeoutMs`｜`vmu.math.leanCommand`｜`vmu.math.leanArgs`｜`vmu.math.leanAsync`｜`vmu.math.leanTimeoutMs`｜`vmu.math.leanSearchPaths`｜`vmu.math.leanInitiative`｜`vmu.math.leanJobsMaxParallel`
- **派生命令（以代码/生成物为准 ✓）**：
  ```bash
  node scripts/generate-vmu-settings-table.mjs --json    # ⇒ 打印 {"keys":…,"wired":…,"notWired":…}（以输出为准；实测 1242/758/484）
  grep -n '已接线' docs/04-settings.md                    # ⇒ 51 个 ✅ 已接线 行（本节清单即由此派生）
  ```
- **判断某键今天是否可用（一条命令）**：看 `vibe_vmu_status` 回执的 **`settings.resolved`**（逐键给**值／来源层／热类别**）✓；不在其中 ⇒ 它是**计划键** ✗。

#### 配方与参数：**今天可跑 vs 计划中**（两栏法）

| 栏 | 判据 | 本手册条目 |
|---|---|---|
| **今天可跑 ✓** | 只用**已接线键**＋**已实现工具**（`vibe_vmu_status`／`set`／`middleware`／`records`／`script`／`pack`／`control`／`meeting`／`task`） | §11.1–§11.3 装配｜§12.1–§12.4 的 M1–M4 示例｜§13 的 R1–R5、R8、R11–R14、R16、R18 |
| **计划中 ✗** | 用到**计划键**或**未实现工具** | §13 的 R6（论文流水线）／R7（证明检查）／R9（复现包）／R10（统计）／R15（跨工作区，部分）／R17（归档迁移）—— 均**带标记词** |

> **纪律**：把"计划中"当旋钮用，**今天不会有任何变化** ✗；设计机制前请用 `docs/04` 接线列或 `settings.resolved` 复核 ✓。


### 11.1 三类装配面（**必须写到** ✓）

| 装配面 | 作用 | 写法要点 |
|---|---|---|
| `config.packs` | 引入**打包好的整套机制**（M4 整合包） | 数组；每个元素是一个 pack 名；顺序＝加载顺序 |
| `config.modules` | 引入**单个机制模块**（M2） | 数组；与 packs 可混用；同名以**后声明者**为准 |
| `config.scripts` | 声明**可被代理调用的 M3 脚本** | 数组；每项需 `id`（工具面用）＋启动器/超时等字段 |

**成熟度** ✓ 三类装配面**已实现**（`vibe_vmu_status` 的 `settings.resolved` 会逐键给出**值／来源层／热更新类别**）。
**⚠ 绝对不要**在本文照抄"某一层的具体键路径"：层内键名会演进 ⇒ 一律用 `vmu.<命名空间>.*` **通配**，并到 `04-settings.md` 查权威表。

### 11.2 最小可用预设：**零机制**

```yaml
# 目标形态（示意）：什么都不声明
config: {}
```

- 结果：**只注册一个工具 `vibe_vmu_status`**（让你能"看见"它活着）；
- 若把总开关关掉（`vmu.core.enabled=false`）⇒ **一个工具都不注册**；
- **成熟度** ✓ 已实现（`host.js` 只注册 `status` 的分支与"全关"分支都在）。

### 11.3 逐步加机制（推荐的成长路径）

1. 先加 **1 条 M1 规则**（最小：一个"必须具名拒绝"的约束）；
2. 再加 **1 个 M2 模块**（最小：一个在每次记录后打时间戳的钩子）；
3. 再加 **1 个 M3 脚本**（最小：`console.log("ok")`，用于打通真机 spawn）；
4. 最后用 **1 个 M4 包**把上面三样打包，供多项目复用。

---

## 12. M1／M2／M3／M4 各自的最小可跑示例

### 12.1 M1 规则（约束 + 具名拒绝）

```yaml
# 目标形态：一条规则 = 触发面 + 判定 + 拒绝码（具名）
middleware:
  - id: <规则标识>            # 通配：vmu.<ns>.*
    on: <触发面>               # 例如"提案提交前"
    when: <条件表达式>          # 例如"价值程度缺失"
    refuse: <具名码>            # 例如"字段缺失"类具名拒
```
**成熟度** ✓ 已实现（具名拒是 vmu 的硬约定）。**注意**：拒绝必须是**具名**的（R11），不得静默跳过。

### 12.2 M2 模块（钩子 + 副作用）

```yaml
# 目标形态：一个模块 = 若干钩子 + 每钩子的动作
modules:
  - id: <模块标识>
    hooks:
      - on: <钩子名>
        do: <动作名>
```
**成熟度** ✓ 已实现（`vibe_vmu_middleware` 可查询/试跑中间件面）。

### 12.3 M3 脚本（真机 spawn）

```jsonc
// 目标形态：声明一个可运行脚本，然后运行它
{ "action": "list" }                                   // 看已声明脚本
{ "action": "run", "id": "<脚本 id>" }                  // 运行
```
**成熟度** ✓ 已实现（`vibe_vmu_script`；真机已跑通：`ran:true / exit:0`）。
**排障要点** ✓：脚本最终由**宿主子进程服务**启动 ⇒ 必须能给一个**真实字符串 cwd**（缺 cwd 会触发宿主缺陷，见 §16）。

### 12.4 M4 整合包（把机制打包）

```yaml
# 目标形态：一个包 = 元信息 + 成员（规则/模块/脚本/设置默认值）
packs:
  - id: <包标识>
    rules: [ <M1 规则标识>… ]
    modules: [ <M2 模块标识>… ]
    scripts: [ <M3 脚本 id>… ]
    defaults: { vmu.<ns>.*: <默认值> }
```
**成熟度** ✓ 已实现（`vibe_vmu_pack`）。

---

## 13. 配方集（**≥15 条，可复制**）

> 约定：所有片段用 `vmu.<ns>.*` **通配**；具体键名以 `04-settings.md` 为准。每条末尾给**用到的工具面**。
> **成熟度图例**：✓＝已实现；✗＝**规划/未实现**（这些行的工具名都带了标记词）。

### R1 零机制最小预设（✓）
```yaml
config: {}          # 只注册 vibe_vmu_status
```
工具：`vibe_vmu_status`

### R2 单一 M1 规则：拒绝"空价值"（✓）
```yaml
middleware:
  - id: rule-no-empty-value
    on: proposal.beforeRecord
    when: "value == null"
    refuse: <具名码：字段缺失>
```
工具：`vibe_vmu_middleware`、`vibe_vmu_records`

### R3 单一 M2 模块：记录后打时间戳（✓）
```yaml
modules:
  - id: mod-stamp
    hooks: [ { on: record.afterWrite, do: appendTimestamp } ]
```
工具：`vibe_vmu_middleware`

### R4 单一 M3 脚本：真机自检（✓）
```jsonc
{ "action": "run", "id": "selftest" }     // 期望 {"ok":true,"ran":true,"exit":0}
```
工具：`vibe_vmu_script`

### R5 学术评审会（✓ 会议面）
```yaml
vmu.meeting.*: { quorum: <整数>, recordPolicy: <记名|不记名> }
```
```jsonc
{ "action": "open",  "kind": "review" }     // 开会（kind 取值以 04 为准）
{ "action": "close" }                       // 收束并落纪要
```
工具：`vibe_vmu_meeting`、`vibe_vmu_records`

### R6 论文写作流水线（**规划 ✗ 未实现**）
> 目标形态：把"证据 → 提纲 → 草稿 → 编译 → 归档"串成一条 pack。
```yaml
packs: [ <论文流水线包标识> ]     # 规划：尚未接线
```
工具：`vibe_vmu_pack`（已实现）＋ 论文编译工具（**规划**）

### R7 证明检查流水线（**规划 ✗ 未实现**）
> 目标形态：形式化检查作为"可拒绝"的一步，挂在提案入档前。
```yaml
middleware: [ { id: <证明检查规则>, on: proposal.beforeRecord, refuse: <具名码> } ]   # 规划
```

### R8 多代理辩论（✓ 会议 + 记录面）
```jsonc
{ "action": "open", "kind": "debate" }
{ "action": "list" }
```
工具：`vibe_vmu_meeting`、`vibe_vmu_records`

### R9 复现包生成（**规划 ✗ 未实现**）
> 目标形态：把"输入数据 + 脚本 + 环境指纹 + 结果哈希"打成一个可复跑包。

### R10 数据统计分析（**规划 ✗ 未实现**）
> 目标形态：`math_computation` 面（探针/运行）＋统计脚本模板。

### R11 任务板驱动的分工（✓）
```jsonc
{ "action": "create", "subject": "<任务>" }
{ "action": "list" }
{ "action": "update", "id": "<任务 id>", "state": "<状态>" }
```
工具：`vibe_vmu_task`

### R12 控制与暂停/恢复（✓）
```jsonc
{ "action": "pause" }   { "action": "resume" }   { "action": "stop" }
```
工具：`vibe_vmu_control`

### R13 设置热更新与回读（✓）
```jsonc
{ "action": "set",  "patch": { "vmu.<ns>.*": <值> } }
{ "action": "get" }          // 回读 status，确认值与来源层
```
工具：`vibe_vmu_set`、`vibe_vmu_status`

### R14 记录与检索（✓）
```jsonc
{ "action": "append", "kind": "progress", "text": "<正文>" }
{ "action": "query",  "kind": "progress", "limit": <整数> }
```
工具：`vibe_vmu_records`

### R15 多实例 / 多工作区（✓＋**规划 ✗ 部分**）
```yaml
vmu.core.*: { instanceId: <标识>, workspace: <路径> }   # 多实例已实现；跨工作区检索为规划
```

### R16 性能与预算调优（✓）
```yaml
vmu.budget.*: { maxTokens: <整数>, timeoutMs: <整数> }
```
工具：`vibe_vmu_set`、`vibe_vmu_status`

### R17 归档与迁移入口（**规划 ✗ 未实现**）
> 目标形态：一键导出/导入整套机制与记录（含版本号与校验）。

### R18 自定义提示词段（✓ 片段注入）
```yaml
vmu.prompt.*: { sections: [ <段名>… ], order: <整数> }
```
工具：`vibe_vmu_set`

---

## 14. 参数速查（**通配**，权威表在 04）

| 家族（通配） | 管什么 | 热点 |
|---|---|---|
| `vmu.core.*` | 总开关、实例、工作区 | 热 |
| `vmu.budget.*` | 预算/超时 | 热 |
| `vmu.meeting.*` | 法定人数、记名策略、议程 | 半热 |
| `vmu.record.*` | 记录种类、保留策略 | 半热 |
| `vmu.script.*` | 脚本启动器、超时、输出上限 | 冷 |
| `vmu.pack.*` | 包加载顺序与默认值 | 冷 |
| `vmu.prompt.*` | 提示词段与顺序 | 半热 |

> **不要**把上表当作逐键清单：具体键名一律以 `04-settings.md` 为准；本文只给**家族**。

---

## 15. 命令速查（**只列已实现**）

**已实现 ✓**：`vibe_vmu_status`｜`vibe_vmu_set`｜`vibe_vmu_middleware`｜`vibe_vmu_records`｜`vibe_vmu_script`｜`vibe_vmu_pack`｜`vibe_vmu_control`｜`vibe_vmu_meeting`｜`vibe_vmu_task`。

**规划 ✗ 尚未接线（目标形态，未实现）**：论文编译工具、证明检查工具、复现包工具、统计分析工具、归档迁移工具 —— 以上均为 **roadmap 项**，**当前不可调用**。

---

## 16. 排障（错误码 → 处置）

| 具名码 | 何时出现 | 处置 |
|---|---|---|
| `VMU_ENGINE_UNAVAILABLE` | 宿主没有子进程服务，或可执行文件解析不到 | 确认宿主暴露 `subprocess` 服务；给**绝对路径**启动器 |
| `VMU_INVALID_ARGUMENT` | 参数形状/取值不合法（含未登记 action） | 照 §15 清单核对 action 与字段 |
| `VMU_MIDDLEWARE_FAILED` | 中间件或 spawn 过程中宿主抛错 | 看回执里的 `hostStack`/`shape`；对照下面一条 |
| `VMU_JOB_TIMEOUT` | 超过预算（预算同时作为终止期限） | 提高 `vmu.budget.*` 或缩短脚本 |
| `VMU_WRITE_FAILED` | 记录/产物写入失败 | 检查工作区权限与路径 |

**已知宿主缺陷（调用侧规避 ✓）**：脚本 spawn 若**不给 cwd**（或给 `undefined`），宿主 `dsh-subprocess-local` 的 `validateNoNullByte` 会抛 `Cannot read properties of undefined (reading 'includes')`。
⇒ **规避**：接缝永远传**真实字符串 cwd**（调用方 cwd → 配置工作区 → 进程 cwd）。**这属宿主缺陷，不是本仓可修项** ✗。

---

## 17. 安全与权限

- **默认只读**：零机制预设只给"看见"的能力 ✓；
- **写操作必须过中间件**：任何写入前可挂 M1 规则拦截（具名拒）；
- **脚本执行是最高权限面**：只允许**声明过**的脚本 id，且启动器应为**绝对路径** ✓；
- **不落任何隐式状态**：配置是内存态；没有 YAML 隐式读取 ⇒ 不存在"配置文件被偷偷改"的路径 ✓。

---

## 18. 多实例与多工作区

- 同一宿主可跑多个实例 ⇒ 用 `vmu.core.*` 的实例标识隔离 ✓；
- 工作区必须**绝对路径**、建议 **ASCII**（非 ASCII 在真机装置里曾引发工具面路径问题）✓；
- **跨工作区检索**为**规划项 ✗**（当前不可用）。

---

## 19. 反模式（照抄会踩）

1. 把 `settings.yml` 当配置源 ✗（vmu 是插件，配置在**插件行**的 `config`）；
2. 在规则里**静默跳过**而非具名拒 ✗；
3. 用**裸命令名**做脚本启动器（必须解析成绝对路径）✓✗；
4. 不给 cwd 就跑脚本（触发宿主缺陷）✗；
5. 把"未实现工具"当可用工具写进自动化 ✗（本文已用标记词标注）。

---

## 20. 未核项（增补·细化版）

> 每条给：**未核的是什么／为什么未核／如何验证（可执行）／谁负责／何时必须核／不核的后果**。
> **编号登记见 14-§2**（未决项按主题 T1–T10 登记；本卷的 U1–U6 与 11.0 的接线状态一并在此追溯）。

### U1 §13 的规划配方（R6 论文流水线、R7 证明检查、R9 复现包、R10 统计分析、R15 跨工作区、R17 归档迁移）
- **未核**：这些配方的**工具面尚未实现** ✗ ⇒ 照抄**必然失败**。
- **为什么未核**：实现排期未到（属 14 卷 roadmap）。
- **如何验证**：工具面落地后，为每条配方补一条**可复跑场景**（照抄即得预期结果）。
- **谁负责**：配方作者（本卷）＋ 工具面实现者。**何时必须核**：该工具面进入门禁前。
- **不核的后果**：用户照抄失败 ⇒ 手册失去可信度。

### U2 §14 参数家族表 vs 设置手册（04）逐键表
- **未核**：家族集合与逐键表是否**逐项一致**。
- **为什么未核**：逐键表归设置卷，且命名规范正在统一（`settings/schema.js` 防撞车）。
- **如何验证**：脚本比对"本文家族集合"⊆"04 家族集合"，要求差集为空。
- **谁负责**：设置卷维护者。**何时必须核**：每次键改名／新增键的提交。
- **不核的后果**：用户按家族去 04 找不到对应键。

### U3 §16 错误码表的完整性
- **未核**：表只覆盖**真机已实测**的具名码；其余码未纳入。
- **为什么未核**：`03` 是码的权威，本卷不重复登记。
- **如何验证**：以 03 码表为源，逐码检查本卷是否给出"处置"；缺则补。
- **谁负责**：03 维护者（权威）＋本卷（处置）。**何时必须核**：03 码表变更时。
- **不核的后果**：用户拿到码却不知怎么办。

### U4 脚本可观测性（`list` 只给 `{id,file,timeoutMs}`）
- **未核**：是否暴露"实际 argv／启动器"。
- **为什么未核**：观测面字段设计未定（见 14-T8）。
- **如何验证**：落地后断言 `list` 回执含**脱敏** argv 摘要（敏感值掩码）。
- **谁负责**：工具面实现者。**何时必须核**：观测面进入排期时。
- **不核的后果**：成功路径不可观测 ⇒ 只能等失败回执。

### U5 多实例／多工作区的实例标识语义
- **未核**：同一宿主多会话下 `vmu.core.*` 实例标识的隔离边界。
- **为什么未核**：跨工作区检索为规划项。
- **如何验证**：两个实例并发跑同一配方，断言各自记录**互不串写**。
- **谁负责**：存储层维护者。**何时必须核**：多实例进入真机矩阵时。
- **不核的后果**：记录串写 ⇒ 审计不可信。

### U6 宿主 cwd 缺陷的上游状态
- **未核**：宿主未来是否修掉 `validateNoNullByte(undefined)` 的行为。
- **为什么未核**：属上游。
- **如何验证**：宿主升级后，用"不传 cwd"的调用探一次；不再抛错即**可移除调用侧规避**。
- **谁负责**：宿主维护方（本仓只做规避与记录）。**何时必须核**：宿主每次大版本升级后。
- **不核的后果**：规避代码长期留存，语义比设计更宽。
