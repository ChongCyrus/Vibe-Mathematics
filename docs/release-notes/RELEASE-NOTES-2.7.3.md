# dsh-vibe-math 2.7.3 — 发布说明

> 上一版本：2.7.2。本版是**补丁版：只包含修复、口径纠正与验证深度**——v5 研究所的**轮次计数与邮箱投递**不再出错、论文定稿与任务 CAS 的失败有具名后果、v4 的 Lean 库索引与项目标记写失败不再静默、安装器对外输出统一为中文标签并做到"一个动作一行"、文档中残留的**旧邮箱顺序**全部纠正并有自动配对检查防止回潮。四套预设的**参数默认值、数据格式与目录结构未变**（由 `tests/audit-math-computation-contract.mjs` 与 `tests/audit-math-computation-parity.mjs` 断言）；新增内容都是**附加**或**仅测试面**的，旧读者不受影响。**无破坏性变更**，DSH 支撑窗口不变，**无需迁移**。

## 概述

- **邮箱不再丢消息**：确认（ack）改为**只在发送成功之后**发生；未被确认的消息保持 pending，会在下一次成功唤醒时重新投递。重复抑制由**注入标记**（`inboxInjected` / `inboxSuppressed`）负责，一轮之内不会把同一条消息 prepend 两遍。
- **轮次编号可预期**：新成员的创立提示词带上它**实际开始的轮次**（从 `轮次 1` 起，不再出现 `轮次 0`）；**失败**的启动不再消耗轮次，也不会**抹掉或重置**既有成员的轮次计数（宿主丢失子会话后重建，提示词仍继续编号，例如 `轮次 2`）。
- **论文定稿失败可追溯**：必需产物（`paper.md` / `paper.tex` / `paper.meta.json` / `paper.log.md`）写入失败时给出**具名告警恰好一次**，点名产物与恢复途径；产物清单**只列真正落盘的**文件；重跑定稿**幂等**补齐缺失产物，且不会重复告警。
- **任务 CAS 拒绝不留半成品**：`expected_revision` 过期被拒时，任务**保持不变**（`revision` / `ownerId` / `status` 回读一致）。
- **成员路径契约不一致会被点名**：文档写的成员库根与框架实际读写的根不一致时按名给出提示，并且该提示**现在会进入 `report()` 的诊断**（此前只是入队、从不显现）。
- **v4 索引写失败有具名后果**：Lean 库索引写失败**恰好具名一次**，带 `lib=` / `proved=`，并说明"索引在下次成功重建前**是陈旧的**"；该单点覆盖全部调用方，且**不影响返回值**（工具照旧返回扫描计数）。
- **v4 项目标记写失败有具名后果**：当前项目标记 `.current` 写失败**具名一次**，并说明后果——下一个会话可能加载到上一个项目。
- **文档不再描述会丢消息的顺序**：计划书、架构图、伪代码块与守卫清单中残留的旧邮箱顺序（先确认再构造）已全部改为"**先构造；仅在发送成功后确认；同一轮不重复 prepend**"，并有自动的**文案↔代码配对检查**（旧措辞回来即失败，并要求实现锚点 `if (ok && prompt.pending.length) await ackPending(`）。

## 新增

- 随包文档 `docs/status-report-fields.md` 新增**逐预设机器面字段表**（name / scope / which-views / meaning 四列）：v2 **20** 行、v3 **25** 行、v5 **43** 行（按 `status()` 的顶层键派生），v4 则**明确声明它不暴露 `fieldScopes`**；该表由守卫**双向**核对（每个源码字段都有文档行；每条文档行都指向真实源码字段）。
- 门禁的**验证深度**：现在运行 **101 项作业 = 44 个套件 + 57 个探针/变体**（上一版 2.7.2 为 **65 项 = 44 + 21**，按该标签树的作业清单规则复算），其中包含随包发布的**变异族**（`tests/*.mutants.mjs`）与 `--self-probe` 模式：它们对**变异后的副本**运行并要求出现**具名失败**，而不是只看退出码。
- **可指向副本的审计缝**：多个审计可通过环境变量指向变异副本（例如 `MATH_COMPUTATION_MODULE`、`V5_PLUGIN`、`PERSONA_ROOT`、`INSTALLER_JS`），无需修改仓库文件即可复现证据。
- **文档计数改为派生并全量扫描**：live 文档里出现的每个 `TOTAL <n>` 必须等于 `node tests/run-tests.mjs --counts` 的派生值；时间必须引用**各族自己打印**的 `TOTAL WALL TIME` 行；**冻结的历史发布说明按名豁免**（豁免清单本身也断言非空）。

## 变更

- **邮箱顺序口径**：v5 计划书、架构图与守卫清单统一为"**先构造、后确认**"，并在计划书中以可检索的代码顺序给出（取待投递 → 组成框头块 → 构造本轮提示词 → 发送 → 仅成功时确认）。
- **安装器对外输出统一为中文标签**：面向用户的日志**标签**不得是纯 ASCII（英文领域词夹在中文标签里仍合规）；**恢复与清理各自恰好报告一次**；"同一版本的既有备份不算失败"改为在**报告层**判定，而不是匹配日志文字。
- **校验口径更保守**：确认为"检查存在性"而非"求解版本"的约束保持原样，不引入会改变判定结果的"简化"。

## 修复

- **v5 邮箱：失败的唤醒会丢消息** → 确认只在发送成功后发生，未确认的消息留在队列里等下一次成功唤醒重投；同一轮不重复 prepend。守卫：`tests/e2e-v5-round2.test.mjs`（失败的唤醒后消息仍为 pending）与随包族 `tests/v5-institute-fixes.mutants.mjs`。
- **v5 轮次编号** → 创立提示词带真实轮次；失败启动不消耗轮次、不重置既有计数；重建继续编号。守卫：`tests/e2e-v5-round2.test.mjs`（重建后的提示词读作 `轮次 2`）与 `tests/v5-institute-fixes.mutants.mjs`（两条 `spawnMember` 族）。
- **v5 论文定稿** → 必需产物写失败具名一次（点名产物与恢复途径）；产物清单只含真正落盘项；重跑幂等、不重复告警。守卫：随包套件 `tests/e2e-v5-round2.test.mjs`。
- **v5 任务 CAS** → 过期 `expected_revision` 被拒后任务保持原状（回读 `revision` / `ownerId` / `status` 验证）。守卫：`tests/v5-institute-fixes.mutants.mjs`（CAS 相关族）。
- **v5 成员路径契约** → 文档根与实际读写根不一致时按名提示，并**进入 `report()` 诊断**（此前入队后从不显现）。守卫：`tests/e2e-v5-round2.test.mjs` 与 `tests/audit-v5-integrity.mjs`。
- **v4 Lean 库索引写失败静默** → 单点具名一次，带 `lib=` / `proved=` 与"陈旧至下次成功重建"的后果，覆盖全部调用方，且不改变返回值。守卫：`tests/formal-verify-v4.test.mjs`（Lean 库索引那一段）与随包族 `tests/formal-verify-v4.mutants.mjs`（第 8 条族按名变红）。
- **v4 当前项目标记 `.current` 写失败静默** → 具名一次并说明后果（下一个会话可能加载上一个项目）。守卫：`tests/formal-verify-v4.test.mjs`（当前项目标记那一段）与 `tests/formal-verify-v4.mutants.mjs`。
- **名册与验证面** → 公布的**投票者集合**被断言与其 `voterCount` 一致且 id 互异；**职员人设**被断言确实进入每位成员的人设与提示词。守卫：`tests/audit-participant-set-parity.mjs`、`tests/audit-persona-surface.test.mjs`。
- **安装器（见"变更"）** → 恢复/清理各恰好一次、"既有备份不算失败"在报告层判定。守卫：`tests/audit-installer-policy.test.mjs`、`tests/audit-installer-compat.test.mjs` 与随包族 `tests/audit-installer-assertions.mutants.mjs`。
- **文档口径漂移** → 8 处仍描述旧邮箱顺序的位置全部纠正，并加上文案↔代码配对检查。守卫：`tests/audit-v5-integrity.mjs`。

## 兼容性与迁移

- **破坏性变更：无。** 四套预设的参数默认值、数据格式、目录结构均未改变。
- **纯新增**：本版新增的文档与验证面（字段表、变异族与自探针、可指向副本的审计缝）都不改变运行时契约；新增响应字段若有也是**附加**的。
- **迁移：无需迁移。**
- DSH 支撑窗口与 2.7.2 相同（见 `package.json` 的 `engines.dsh`）。

## 已知限制

- **本机没有 Lean / LaTeX 引擎，也没有 Octave / Julia / MATLAB / Maple / Wolfram**：这些面**未在本机执行**；插件会如实报告——用 `configured` 列出配置启用的引擎，用 `absent[]`（每项带 `why`）说明本机为何没有。
- **两次脚本化的端到端真机运行（v4 与 v5）因资源上限（token 上限 / 墙钟）中止，按"非结果"记录，而不是通过**：因此**容量拒绝、打断、项目切换失败、安装器自检与 `/compact`** 的行为覆盖依靠**随包套件**；那两次运行提供的是**落位与可观测性**证据。
- **引擎版本号未观测**：因为本机没有安装任何受支持的引擎，本版无法给出引擎版本读数。
- **商业引擎模板**仍需在持证机器上确认，默认标记为需人工确认。
- **2.7.0 之前的发布说明仅提供中文**（英文历史索引见 `README.en.md`）。

## 验证方式

- `node tests/run-tests.mjs` —— 期望 `TOTAL 101 PASS 101 FAIL 0`（44 个套件 + 57 个探针/变体）。
- 针对性守卫入口：`node tests/audit-v5-integrity.mjs --self-probe`（8/8）、`node tests/audit-participant-set-parity.mjs --self-probe`（6/6）、`node tests/audit-math-computation-parity.mjs --self-probe`（8/8）、`node tests/audit-persona-surface.test.mjs`（276/0）。
- 随包**变异族**（`tests/*.mutants.mjs`）各自对单点变异要求**具名失败**；`--self-probe` 模式对变异副本运行并要求具名断言变红。
- 宿主机：DSH **0.2.0-rc.2**。
- 真机引擎：**未安装、未执行**（见"已知限制"）；引擎存在性一律以列目录/探测证明，绝不假设路径存在。

## 依赖

- **无新增运行时依赖**；DSH 支撑窗口不变。
