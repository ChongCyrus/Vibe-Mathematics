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

## 2. 安装与选择

```bash
# 本仓（开发/自用）
node installer.js            # 或按仓库 README 的安装方式
# 选择预设：vibe-math-vmu；再选择整合包（pack）
```
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
**上线前三件事**（都会告诉你"会命中谁、会做什么"）：
1. `vibe_vmu_mw {op:'validate', id:'proof-gate'}` —— 静态校验；
2. `vibe_vmu_mw {op:'dryRun', id:'proof-gate'}` —— **干跑，不产生副作用**；
3. `vibe_vmu_mw {op:'status'}` —— 看命中次数与最近失败。

**写错也不会炸** ✗：中间件异常按 `failure: open|closed|abort` 处置，**并留审计**；连续失败会**熔断**并通知。

---

## 5. 第三步：管提示词（把"执行流程"交给相应负责人）

```yaml
vmu.prompts.bindings:
  # 给某角色加评审规则
  - { section: reviewer-rubric, role: reviewer, file: rubrics/reviewer.md }
  # 给某任务派发执行流程（负责人唤醒时注入）
  - { section: task-brief, task: ['t-42'], owner: 'm-2', file: tasks/t-42.md }
```
- 覆盖：把同名文件放进 `vmu.prompts.overridesDir` 即可覆盖（**状态块不可覆盖**，只能追加）；
- 回滚：覆盖是"引用替换"，改回引用即可（审计里有旧引用）；
- 验证：`vibe_vmu_status` ⇒ `prompts.sections` 看**来源**（内核/pack/中间件/覆盖文件）。

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
