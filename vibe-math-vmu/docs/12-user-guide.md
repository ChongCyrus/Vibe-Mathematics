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
    - tool: [vibe_vmu_ballot]          # 开表决
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
