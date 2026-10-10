# vmu 09 · 数学 · 形式化 · 计算（Math · Formalization · Computation）

> 状态：**草案 v0.2**（v0.1 的现状描述**全部保留**，本版只做扩充与校准）
> 上位：`01-philosophy.md`（R2 能力齐备 / R1 零策略 / R11 具名拒绝 / R12 可复现）、`02-architecture.md`（内核 G 分区）
> 立场：内核提供**计算/形式化能力与适配器接口**；**"何时要求形式化、什么算证明、要不要编译、超时多少"全部由 settings/中间件/pack 决定**。
> 复用：共享模块 `math-computation.js`（v2–v5r 共用，探测判决＝"原样复用"）＋ vmu 侧接线 `host-math.js` ✓。
> **口径（本卷与 15 卷共用）**：正文对**已实现**的键按 04 卷登记如实引用 ✓；对**计划**中的设置一律只写**通配家族**（如 `vmu.math.<族>.*`）✗ 不写具体键名 —— 具体拟增键统一在任务回报中登记，由 04 卷落定 ✓。未实现的能力/工具/协议一律带标记词 **⛔**。

---

## 1. 三个能力面（互不替代）

| 面 | 是什么 | 不是什么 | 现状 |
|---|---|---|---|
| **计算面** | 数值/符号计算、脚本化求解、单位与精度约定 | 不是"判定真值"的手段（计算结果≠证明） | ✓ 已接线（`math_computation` 工具，4 个 op） |
| **形式化面** | Lean（或其它证明助手）的归档、复用、按名取原文、编译结果 | 不是"必须使用"的强制（是否要求＝策略） | ✓ Lean；⛔ 其它助手 |
| **进程面** | 子进程/终端/外部引擎（python、octave、julia、sage、latex…）的受控封装 | 不是无限制 shell（受预算、argv 白名单与路径策略约束） | ✓ 已接线（受控 spawn 接缝） |

> 三个面**都不产出"命题为假"**：这条界线由代码保证（§8，`classifyOutcome` 恒 `isRefutation:false`）。

---

## 2. 适配器模型（能力可插拔）

```js
// 适配器接口（v0.1 提案；现状＝由共享模块的引擎表实现 compute 面 ✓，formal 面走 kernel/lean.js ✓）
interface EngineAdapter {
  name: string                     // 'python' | 'r' | 'octave' | 'julia' | 'matlab' | 'maple' | 'wolfram' | 'cli' | …
  kind: 'formal' | 'compute' | 'process'
  probe(): Promise<{ available: boolean; version?: string; reason?: string }>   // 起不来要给**具名原因**
  run(job: MathJob, ctx: JobCtx): Promise<MathJobResult>
  cancel(jobId: string): Promise<void>
}
```

- **登记顺序＝优先级** ✓：内核只按登记顺序探测与调用（现状：8 个 P1 引擎按固定顺序，`sage` 记在 P2 表里 ⛔ 未进 P1 顺序）；顺序本身由一个**引擎顺序族**设置承载（通配 `vmu.math.*` 的引擎子族；具体键名以 04 卷参数总表为准 ✓）；
- **可用性探测**：启动与按需探测 ✓；**缺席不是灾难**，而是**具名降级**（如 `VMU_EXTERNAL_UNAVAILABLE` ＋ 建议 ✓；**不是** `VMU_ENGINE_UNAVAILABLE` ✗ —— 共享码即"外部不可用"的规范名 ✓）；
- **默认零引擎**：不配置引擎 ⇒ 计算面"存在但不可用"，且**明确告知**（不许假装成功）✓；
- **商业引擎只给厂商指引** ✓（许可类错误具名，不静默跳过）。

### 2.1 能力探测必须是**可注入的接缝（seam）**（本仓实测教训，硬要求）

**事实**（2026-10-09 实测）：本机 **LaTeX 在 `D:\texlive\2025\bin\windows\`、Lean 在 `D:\.elan\bin\`，两者都在 PATH 上**。
但仓库测试里长期存在一条 `★ no LaTeX on this host` 断言 ⇒ 它**不是**环境缺失，而是**运行器故意 pin 空引擎根**：

- `tests/run-tests.mjs` 设 sandbox 根（空根 env 接缝）；相关套件同样 pin；
- 且有**专门门禁**（`audit-prompt-invariants.mjs` 的 I20）要求：**每个"已知安装探测点"都必须受该 env 接缝管辖**，并配"忽略该接缝 ⇒ 不再能 pin 出 not-detected"的变异族。

**⇒ vmu 的设计要求（写入门禁）**
1. **一切能力探测都可注入** ✓：引擎探测、PATH 扫描、版本读取、编译执行 —— 全部经**可替换的探测器接口**（现状：宿主接缝 `resolveExecutable/spawn` 由接线方注入，测试用假接缝 ✓）；
2. **两条路径都必须可确定性测试** ✓：`存在`（注入假引擎/假 PATH）与`缺席`（注入空根）**都能**在任意机器上跑出；
3. **不得**用"本机没有 X"当作测试前提 ✗；缺失路径必须由**配置/注入**制造（R12 可复现）；
4. **接缝本身要门禁**：探测点若绕过接缝 ⇒ 红（照抄 I20 的做法）；并给"绕过即不再能 pin"的变异族。

### 2.2 形式化适配层（多助手）

| 助手 | 形态 | 现状 |
|---|---|---|
| **Lean** | 编译作业队列 ＋ 内容哈希结算 | ✓ 已接线（`kernel/lean.js`＋8 键） |
| **Coq / Rocq** | 同样的 `submit/status/settle` 作业面，argv 由适配器给出 | ⛔ 未实现（仅设计） |
| **Isabelle** | 同上（批处理镜像；会话/堆镜像概念需单独建模） | ⛔ 未实现 |
| **Agda** | 同上（无内建 `sorry` 语义等价物，需按错误码映射） | ⛔ 未实现 |
| **Metamath** | 同上（验证器极轻；`set.mm` 库规模巨大，检索策略另议） | ⛔ 未实现 |

**统一适配器契约（草案，供 15 卷细化）**：`probe()`／`commandFor(statement|file)`／`submit()`／`status()`／`list()`／`settle()`／`keysUsed()`；**判"通过"的规则必须逐助手显式声明**（Lean 现为"退出 0 **且** 内容哈希未变" ✓，其余助手不得继承该规则而不声明 ✗）。

---

## 3. 内容身份（形式化面的关键纪律，源自 v5r/PR#16）

- **单一哈希来源** ✓：复用既有 sha256（`createHash('sha256')`，**不另造指纹**）；归档记录携带 `{name, file, kind, sha256, summary}`；
- **回执（receipt）含 `scriptPath`／`scriptHash`／实际 `argv`** ✓：一次执行＝一份可复核 JSON（归档于 `Computation/<id>/`）；
- **读面只读回、绝不重算** ✓（避免读写不一致）；
- **代码正文不进"头部列表"** ✓（目录只给身份；正文按名取回）；
- **撤回/失效要清空 sha256** ✓（否则"内容身份"骗人）；且**级联影响要显式声明**（v5r 只记录不联动，vmu 要求**写明策略**）✓；
- **写一律走 fold 内函数式变更** ✓（否则同 tick 覆盖会抹掉刚写入的身份 —— 本仓实测过）；
- **脚本变更可核** ✓：`SCRIPT_CHANGED_SINCE_LAST_RECEIPT`／`SCRIPT_CHANGED_DURING_RUN` 两条**具名警告**（只警告、不删除）；
- **归档保留上限** ✓：单次运行尝试数、项目级运行数各有**上限常量**，越限给 `ARCHIVE_RETENTION_EXCEEDED` **警告**（工具**从不**自动删除）⇒ 清理策略仍是外部策略；
- **按内容哈希的计算缓存** ⛔ 未实现（现状是"回执＋归档"而非"命中即跳过"；见 15 卷 §14）。

---

## 4. 作业（Jobs）与预算

```js
MathJob = { id, kind, engine, input, timeoutMs, budget?, async?, createdAt, state, result?, error? }
```

- **同步/异步** ✓：编译类默认异步（`leanAsync` 默认 true）；异步必须可查询状态与取消 ✓；
- **作业状态机（Lean 现状 ✓）**：`queued → running → passed | failed`；未结束即结算 ⇒ `VMU_LEAN_NOT_SETTLED`；
- **预算** ✓：每个作业计入 `vmu.budget.*`（时间/次数，通配）；超限 ⇒ **具名拒**（`VMU_RESOURCE_BUDGET`）＋ 建议；
- **单次超时** ✓：作业级 `timeoutMs`（默认 60 s，宿主可调）⇒ 到点 `MATH_TIMEOUT`／`VMU_LEAN_TIMEOUT`；
- **输出上限** ✓：stdout／stderr／单文件各有 **cap 常量**（截断是显式的，不静默）；
- **并发** ✓：Lean 侧有**并发上限**（默认 1＝串行）；计算面并发由调用方组织；
- **事件日志上限** ✓：Lean 作业事件日志有常量上限（超出计数丢弃、不静默）；
- **隔离** ✓：作业在受控目录内运行；路径策略与写保护由 `vmu.safety.*` 决定（越界 ⇒ `VMU_NOT_PERMITTED`）；
- **审计** ✓：作业起止、命令摘要、结果摘要入审计（**不落全文**，正文放文件）；
- **持久化/断点续算** ⛔ 未实现（现状：作业只存在于本次会话内存）。

---

## 5. 判定点（策略全部外置）

| 判定点 | 内核默认（现状 ✓） | 典型 pack/中间件用法 | 参数口径 |
|---|---|---|---|
| 是否要求形式化 | **不要求**（`REQUIRE_FORMALIZATION=false` ✓） | pack 决定"某阶段必须形式化" | `vmu.math.<formal-policy>.*`（通配） |
| 什么算证明 | 只承认"已归档且**编译通过且哈希未变**"的结论 ✓ | 允许/禁止非形式化证明（人证）作为依据 | `vmu.math.<accept-policy>.*` |
| 编译策略 | 不自动编译（编译超时由宿主接线 ✓） | 自动编译＋失败重试 N 次＋失败算"形式化缺陷"而非"否定" | `vmu.math.<compile-policy>.*` |
| 引擎选择 | 按登记顺序 ✓ | 指定引擎、按成本选择、禁某引擎 | 引擎顺序族（通配 `vmu.math.*` 的引擎子族；键名见 04 卷）✓ |
| 引擎缺失 | **具名降级并继续**（`ON_UNAVAILABLE='degrade'` ✓） | 阻塞、换引擎、上报 | `vmu.math.<on-unavailable>.*` |
| 超时策略 | 用作业级 timeout（默认 60 s ✓） | 全局上限、分级超时 | 超时子族（通配；键名见 04 卷）✓ ＋ `vmu.budget.*` |
| 计算模式 | `typed+shell`（默认 ✓） | 只允许类型化、或允许 shell 兜底（**兜底结果带"未经工具归档"标记** ✓） | 模式子族（通配；键名见 04 卷）✓ |
| 安装/依赖 | 不装（只出安装计划；`user` 作用域默认 ✓） | 允许按需安装／离线白名单 | 包清单与安装作用域子族（通配；键名见 04 卷）✓ |

> **R1 静态门**：内核里找不到"必须形式化""形式化权重"这类策略字样；上表右侧的**具体键名一律不在内核**。

---

## 6. 具名拒绝与错误码（登记进 03-§8）

**已实现（代码可核）**：
- 计算面（共享模块的 11 个）：`MATH_NOT_AVAILABLE`、`MATH_ENGINE_NOT_FOUND`、`MATH_ENGINE_LICENSE_REQUIRED`、`MATH_ENGINE_UNUSABLE`、`MATH_MISSING_PACKAGES`、`MATH_TIMEOUT`、`MATH_NONZERO_EXIT`、`MATH_ENGINE_BAD_ARGV`、`MATH_REFUSED`、`MATH_INVALID_ARGUMENT`、`MATH_NO_SUBPROCESS`；
- vmu 归类与形式化：**`VMU_EXTERNAL_UNAVAILABLE`**（**接缝/引擎不可用的统一共享码** ✓；历史提案 `VMU_ENGINE_UNAVAILABLE` **当前未使用** ✗）、`VMU_LEAN_NOT_FOUND`、`VMU_LEAN_EXIT_NONZERO`、`VMU_LEAN_TIMEOUT`、`VMU_LEAN_SPAWN_FAILED`、`VMU_LEAN_FILE_REQUIRED`（**提案码，当前未使用** ✗：参数级错误统一用 **`VMU_MATH_INVALID_INPUT`** ✓）、`VMU_LEAN_FILE_UNREADABLE`、`VMU_LEAN_STATEMENT_REQUIRED`（**提案码，当前未使用** ✗：同上 ✓）、`VMU_LEAN_HASH_CHANGED`、`VMU_LEAN_NOT_SETTLED`；
- 通用闸门：`VMU_RESOURCE_BUDGET`、`VMU_NOT_PERMITTED`、`VMU_INVALID_ARGUMENT`、`VMU_JOB_TIMEOUT`。

**纪律** ✓：编译失败必须**与"命题为假"区分**（沿用 v5r 的"形式化缺陷非反驳"纪律；代码层面由 `classifyOutcome` 保证）；引擎缺失必须**具名**（不许报告为成功）。

**计划中的错误码族** ⛔：见 15 卷（按"族"登记，具体码在任务回报中列出并由 03 卷落定）。

---

## 7. 与归档/论文/表决的接线

- 形式化归档路径与只读面：`Shared/Formal/{Lib,Proved}/`（公开布局，见 07-§6 扩展）✓；
- 计算归档：`Computation/<id>/`（回执＋脚本＋实际 argv）✓；
- **表决用形式化权重**由中间件决定（内核不内置"形式化更高权重"）✓；
- **论文阶段**可要求"每条结论带出处 id ＋（可选）形式化身份"⇒ 由 `settle/before` 钩子检查（08-§4.2）✓；
- **会议/表决面**：辩论与结题表决的布尔概率聚合属 08 卷；本卷只提供"形式化身份"作为可选证据 ✓。

---

## 8. 计算↔形式化对照与"反驳"的边界

| 情形 | 平台怎么说 | 现状 |
|---|---|---|
| 计算得出反例（数值/符号） | 只能是**线索**：需要独立可复核记录（回执）＋人工/形式化确认 | ✓ 回执可核；⛔ 反例流水线（自动构造＋验证）未实现 |
| 编译失败 / argv 错 / 引擎缺席 | **形式化缺陷**，`isRefutation:false` | ✓ 代码保证 |
| 编译退出 0 但文件被改动 | **不算通过**（`VMU_LEAN_HASH_CHANGED`） | ✓ |
| 助手说"命题为假"（如 `¬P` 可证） | 这才是**反驳**：需显式归档为"已证 ¬P" | ⛔ 尚未建模（15 卷 §13 给出设计） |
| 非形式化论证 | 默认**不作为依据**；是否接受＝策略 | ✓ 默认不要求也不禁止（零策略） |

---

## 9. 复现与审计留痕

- **一次执行＝一份回执** ✓（脚本路径、脚本哈希、实际 argv、退出码、输出摘要）；
- **环境锁定与"复现包"生成** ⛔ 未实现（15 卷给出设计：证明脚本 ＋ 引擎版本 ＋ 依赖清单 ＋ 种子）；
- **随机性**：默认**不引入随机**；显式随机必须写进回执并可由种子复现 ⛔（种子策略未实现）；
- **审计不落全文** ✓（正文放文件，审计留摘要与身份）。

---

## 10. 可调控性：三层（settings / 中间件 / pack）

| 层 | 能做什么 | 不能做什么 | 现状 |
|---|---|---|---|
| **settings**（`vmu.math.*` 通配族） | 选引擎与优先级、超时、精度/容差策略、安装作用域、能力开关 | 不能改"判据"（哪些结论算证据由中间件/pack 定） | ✓ 已有 6＋8 个已实现键；⛔ 其余族待登记 |
| **中间件**（`vmu.middleware.*`，通配） | 在作业前后插入检查（预算、策略、证据要求）、改写 job/result、拒绝 | 不能伪造引擎结果或哈希 | ✓ 机制已实现（05 卷）；⛔ 尚无"数学专用中间件"示例 |
| **pack**（`vmu.pack.*`，通配） | 定义/替换/组合"某个阶段必须形式化""形式化权重"等组织级策略 | 不能越过内核闸门（预算/路径/身份） | ✓ 机制已实现（10 卷）；⛔ 数学族 pack 待写 |

**必须内核实名强制（不可被 settings 关闭）**：内容身份规则、`isRefutation:false`、回执必须含实际 argv、越界路径拒、输出 cap、`settled` 的唯一规则、预算具名拒。**可扩展**：新引擎适配器、新助手适配器、脚本桥（`vibe_vmu_script` ✓ 已实现）调用外部工具。

---

## 11. 门禁（本篇验收判据）

1. **缺席路径**：**由注入制造**（pin 空引擎根/空 PATH），而不是依赖机器：全部相关工具**具名降级**且不崩 ✓；
   *（本机实测 LaTeX=D:\texlive、Lean=D:\.elan 均在 PATH ⇒ **绝不能**用"本机没有"当负例前提 ✗；见 §2.1）*
2. **身份一致**：回执的 `scriptHash` ≡ 读面看到的 ≡ 编译记录（三处一致）✓；
3. **函数式变更**：同 tick 两次归档不互相覆盖（并发门禁）✓；
4. **编译失败 ≠ 否定**：断言文案与结论字段都区分（具名红）✓；
5. **预算**：超限 ⇒ 具名拒 且 无副作用残留 ✓；
6. **可复现**：同输入两次作业结果一致（除显式时间/随机）✓（回执可比对）；
7. **策略外置**：内核中找不到"必须形式化""形式化权重"等字样（R1 静态门）✓；
8. **结算唯一规则**：`passed` 只能由"退出 0 且哈希未变"产出；任何绕过 ⇒ 具名红 ✓；
9. **接缝纪律**：探测点绕过注入接缝 ⇒ 具名红（照抄 I20）✓；
10. **本卷与 15 卷口径**：正文不含**计划**中的具体键名（只有通配）✓；未实现项带 ⛔ ✓。

---

## 12. 多助手选择准则（选择是策略，不是内核偏好）

| 助手 | 证据强度（本仓口径） | 适合的命题类型 | 成本 | 可审计性 | 现状 |
|---|---|---|---|---|---|
| **Lean** | 内核接受＋哈希未变的文件 ✓ | 依赖类型论可表达的现代数学（分析/代数/组合） | 中高（编译慢） | 高（脚本＋哈希＋作业日志 ✓） | ✓ 已接线 |
| **Coq / Rocq** | 需显式声明判据 ⛔ | 类型论；证明脚本结构化强 | 中 | 中高（计划） | ⛔ |
| **Isabelle** | 同上 ⛔ | 高阶逻辑、自动化强（Sledgehammer 风格） | 高（批处理） | 中（计划） | ⛔ |
| **Agda** | 同上 ⛔ | 依赖类型；计算即证明风格 | 中高 | 中（计划） | ⛔ |
| **Metamath** | 同上 ⛔ | 集合论/元数学；极小可信基 | 低（验证极快） | 高（计划） | ⛔ |

- **原则**：内核**不预置**"哪个助手更强"；选与不选、单用与并列，全部由 pack/settings 决定 ✓（R1）。
- **多助手一致性**：同一命题两助手**都接受** ⇒ 证据更强（可作 pack 的加分条件）⛔；**不一致** ⇒ **必须阻塞**而不是"多数决" ⛔（处置策略未定，见 §16 与任务回报⑥）。
- **判据不可继承**：每个助手的"通过"必须逐助手显式声明（Lean 现为"退出 0 且哈希未变" ✓）✗ 不许把 Lean 的规则套到别人身上。

---

## 13. 证明资产的生命周期（创建 → 结算 → 归档 → 复用 → 撤回/失效）

| 阶段 | 产物 | 现状 |
|---|---|---|
| 创建（尝试） | 陈述＋文件（草稿可失败） | ✓（`statement`＋`file` 必填，缺一具名拒） |
| 编译/检查 | 退出码＋stdout/stderr 摘要 | ✓ |
| **结算** | `passed` ⟺ 退出 0 **且** 内容哈希未变 | ✓（唯一规则） |
| 归档 | `Shared/Formal/{Lib,Proved}/`＋身份（名称/文件/类别/摘要/哈希） | ✓ |
| 复用 | **按名取原文**（不凭记忆复述、不重算） | ✓ |
| 撤回/失效 | 清空哈希（否则身份骗人）＋**级联声明** | ✓ 清空；⛔ 级联策略未落地（只记录不联动） |

- **级联策略必须在 pack 层声明** ⛔：撤回一条引理时，引用它的结论是"标记待复核"还是"自动失效"，内核不预置 ✗；
- **审计留痕** ✓：作业起止、命令摘要、结果摘要；**不落全文**（正文在文件里）。

---

## 14. 计算与形式化的协同工作流（五步，每步都有闸门）

1. **探测**（`probe` ✓）：有哪些引擎/助手可用；缺席 ⇒ 具名降级（不阻塞探索，但**不得**当作"已算"）；
2. **线索**（`run` ✓）：数值/符号/穷举给出**候选结论**；回执归档（脚本哈希＋实际 argv）✓；
3. **形式化尝试**（提交作业 ✓，若策略要求）：把命题写成形式陈述；失败＝**形式化缺陷**（不是否定）✓；
4. **结算与归档**（`settle`＋归档 ✓）：只有"退出 0 且哈希未变"才能 `passed` ✓；
5. **引用与复核**（论文/表决/会议）：引用**归档身份**（名称＋哈希），由中间件决定"是否要求形式化身份" ✓。

> 红线：第 2 步的产物**永远不能**单独充当第 4 步的证据（计算≠证明）✓；第 3 步的失败**永远不能**充当"命题为假" ✗。

---

## 15. 与 15 卷的索引（能力面 ↔ 族）

| 能力面（本卷） | 对应族（15 卷） |
|---|---|
| 计算面：数值/符号 | 15-§3 数值、15-§4 符号 |
| 计算面：统计/优化/离散/数论/几何 | 15-§5 ～ 15-§9 |
| 计算面：数值线代/微分方程/自动微分/张量 | 15-§10 ～ 15-§12 |
| 形式化面：助手适配 | 15-§13.1（Lean ✓；其余 ⛔） |
| 形式化面：作业队列/质量检查 | 15-§13.2、15-§13.3 |
| 进程面：引擎与沙箱 | 15-§2.2、15-§14.3 |
| 工程面：回执/缓存/复现/预算/报告 | 15-§2.2、15-§14 |

---

## 16. 未核项

- **数学计算面已接入真机（2026-10-09 ✓）**：`host-math.js` 把宿主接缝（`register/params/projectRoot/writeText/readText/exists/listDir/resolveExecutable/spawn/log` ✓）接到共享模块 ✓ ⇒ **6 个已实现键**（计算开关／模式／引擎表／超时／包清单／安装作用域）经宿主参数真正生效 ✓；出现条件＝声明数学能力或任一同族键 ✓（零机制 ✓）。路径逃逸**具名拒** ✓。
- **本机工具链的真实运行仍未实测** ✗：vmu 侧从未跑过一次真实编译/证明 ✓（负例一律由**注入接缝**制造 ✓，见 §2.1 ✓）；**但子进程路径已在真机打通 ✓✓**（2026-10-10：M3 脚本真机**通过** ✓，`11-§9.6` ✓；那是**同一个 spawn 接缝** ✓）⇒ 仍未做的只剩"跑一次真实计算/Lean 编译"本身 ✗。
- **8 个 Lean 键已由 `kernel/lean.js` 真接线** ✓（命令／参数／超时／异步／主动性／搜索路径／并发上限 ＋ 编译超时 ✓）：Lean 面现有**编译作业队列**（`submit/status/list/settle/keysUsed/policy/commandFor` ✓）；`passed` **收窄为"退出 0 **且** 内容哈希未变"** ✓；`leanAsync=true` 入队即返回、`false` 同步等待；并发上限默认 1＝串行；搜索路径去重后注入在**自动根之前**；主动性开关与形式化要求**正交**（`off` ⇒ 零策略 ✓）；测试 `tests/vmu-lean.test.mjs`（**假 `spawn` 接缝**）⇒ `ALL GREEN` ✓。**未做 ✗**：真机 Lean 未跑 ✗；**仍未接提示词段** ✗（无 Lean 段）；编译超时由**数学宿主**接线 ✓、**本面未消费** ✗。
- **Lean 侧复用细节未核**：v5r 的 sha256 是**自实现**（非复用 DSH 能力）⇒ vmu 是否沿用待定 ✗。
- **引擎适配器的能力边界**（哪些计算必须走内部模块 vs 外部进程）未定 ✗；**作业持久化**语义未定 ✗；**内容哈希缓存**、**种子/确定性策略**、**沙箱资源限制（CPU/内存/网络）**、**大结果存储与引用**、**单位与量纲检查**、**符号假设管理**、**不收敛分类**、**Strang 报告模板**、**其它证明助手适配**、**定理库检索**、**`sorry/admit` 检测**、**公理/依赖审计** 全部 ⛔ 未实现（设计见 **15 卷**）。

> **未核登记处**：以上各项已并入 **14-§2（U1–U12）** 与 **14-§1（O1–O7，均已裁定为 D13）** ✓；本版新增的族级未核项登记在 **15 卷 §18**。

---

## 附录 A：**已实现键面**（14 个；逐键口径）

> 说明：Compute 6 键由 `host-math.js` 接线 ✓；Lean 8 键由 `kernel/lean.js` 接线 ✓（该文件是**唯一口径**：每个键只在一处被读 ⇒ `keysUsed()` 与实现必然一致 ✓）。

| # | 键 | 类型 | 默认 | 域/枚举 | 谁改 | 热改 | 说明 |
|---|---|---|---|---|---|---|---|
| A1 | `vmu.math.computation` | string | `auto` | `auto`｜`off`｜`on` | 院士/pack | 需重启 | 计算面出现条件（零机制：声明即出现） ✓ |
| A2 | `vmu.math.mode` | string | `typed+shell` | `typed+shell`｜`typed` | 院士/pack | 热改 | 是否允许 shell 兜底（兜底结果带"未经工具归档"标记） ✓ |
| A3 | `vmu.math.engines` | string[] | 8 个 P1 引擎顺序 | 引擎名数组 | 院士/pack | 热改 | **顺序即优先级** ✓ |
| A4 | `vmu.math.timeoutMs` | integer | `60000` | ≥1000 | 院士/pack | 热改 | 单次作业超时 ✓ |
| A5 | `vmu.math.packages` | string[] | `[]` | 包名 | 院士/pack | 热改 | 缺包⇒`MATH_MISSING_PACKAGES`（只出安装计划） ✓ |
| A6 | `vmu.math.installScope` | string | `user` | `user`｜`project`｜`none` | 院士 | 热改 | 安装作用域 ✓ |
| A7 | `vmu.math.leanCommand` | string | `lean` | 可执行名/绝对路径 | 院士 | 热改 | Lean 命令 ✓ |
| A8 | `vmu.math.leanArgs` | string[] | 内置模板 | argv | 院士 | 热改 | 额外参数（注入在自动根之前） ✓ |
| A9 | `vmu.math.leanTimeoutMs` | integer | 由宿主接线 | ≥1000 | 院士 | 热改 | 单次编译预算 ✓ |
| A10 | `vmu.math.leanAsync` | boolean | `true` | true/false | 院士 | 热改 | 入队即返回 / 同步等待 ✓ |
| A11 | `vmu.math.leanInitiative` | string | `normal` | `off`｜`normal`｜`high` | 院士 | 热改 | 与"是否要求形式化"**正交**（`off`⇒零策略） ✓ |
| A12 | `vmu.math.leanSearchPaths` | string[] | `[]` | 路径数组 | 院士 | 热改 | 去重后注入在自动根**之前** ✓ |
| A13 | `vmu.math.leanJobsMaxParallel` | integer | `1` | ≥1 | 院士 | 热改 | 并发上限（1＝串行） ✓ |
| A14 | `vmu.math.compileTimeoutMs` | integer | 未消费 | ≥1000 | 数学宿主接线 ✓ | 热改 | 编译超时（本面未消费 ⛔ 见 §16） |

**纪律**：A1–A14 都在**设置层**；内核里**没有**"必须形式化/形式化权重"字样（R1 静态门 ✓）。

---

## 附录 B：**拟增键全表**（计划 ⛔，供 04 卷登记）

> 约定：`类型`／`默认`／`域`／`谁改`／`说明`。**键名前缀统一 `vmu.math.*`**；未标 ⛔ 者为已实现（见附录 A）。

### B.1 数值与精度（⛔ 全部未实现）
| 键 | 类型 | 默认 | 域 | 谁改 | 说明 |
|---|---|---|---|---|---|
| `vmu.math.precision.mode` | string | `double` | `double`｜`extended`｜`arbitrary` | 院士/pack | 精度模式 ⛔ |
| `vmu.math.precision.digits` | integer | `15` | ≥1 | 院士 | 有效位数 ⛔ |
| `vmu.math.precision.rounding` | string | `nearest` | `nearest`｜`up`｜`down`｜`toward-zero` | 院士 | 舍入模式 ⛔ |
| `vmu.math.precision.tolerance` | number | `1e-12` | >0 | 院士 | 通用容差 ⛔ |
| `vmu.math.interval.enabled` | boolean | `false` | — | 院士/pack | 区间算术（给误差界） ⛔ |
| `vmu.math.numeric.warnings` | string | `record` | `record`｜`refuse` | 院士 | 数值警告处置 ⛔ |

### B.2 符号与假设（⛔）
| 键 | 类型 | 默认 | 域 | 谁改 | 说明 |
|---|---|---|---|---|---|
| `vmu.math.symbolic.backend` | string | `auto` | `auto`｜引擎名 | 院士 | 符号后端 ⛔ |
| `vmu.math.symbolic.assumptions` | string[] | `[]` | 表达式 | 院士/成员 | 显式假设清单 ⛔ |
| `vmu.math.symbolic.assumptionsPolicy` | string | `allow-empty` | `require`｜`allow-empty` | pack | 是否强制假设 ⛔ |

### B.3 统计与贝叶斯（⛔）
| 键 | 类型 | 默认 | 域 | 谁改 | 说明 |
|---|---|---|---|---|---|
| `vmu.math.stats.backend` | string | `auto` | `auto`｜`r`｜`python` | 院士 | 统计后端 ⛔ |
| `vmu.math.stats.multipleComparison` | string | `none` | `none`｜`holm`｜`bh` | 院士 | 多重比较校正 ⛔ |
| `vmu.math.stats.effectSize` | boolean | `false` | — | 院士 | 是否要求效应量 ⛔ |
| `vmu.math.bayes.backend` | string | `auto` | `auto`｜`stan`｜`pymc` | 院士 | 贝叶斯后端 ⛔ |
| `vmu.math.bayes.chains` | integer | `4` | ≥1 | 院士 | 链数 ⛔ |
| `vmu.math.bayes.iterations` | integer | `2000` | ≥100 | 院士 | 迭代数 ⛔ |
| `vmu.math.bayes.diagnostics` | string | `warn` | `warn`｜`refuse` | 院士 | R̂/ESS 不达标处置 ⛔ |

### B.4 优化／离散／数论／几何（⛔）
| 键 | 类型 | 默认 | 域 | 谁改 | 说明 |
|---|---|---|---|---|---|
| `vmu.math.optim.backend` | string | `auto` | `auto`｜`scipy`｜`cvxpy`｜`ortools`｜`highs` | 院士 | 优化后端 ⛔ |
| `vmu.math.optim.tolerance` | number | `1e-8` | >0 | 院士 | 最优性容差 ⛔ |
| `vmu.math.optim.timeLimitMs` | integer | `60000` | ≥0 | 院士 | 求解时限 ⛔ |
| `vmu.math.optim.certificates` | string | `prefer` | `require`｜`prefer`｜`off` | pack | 是否要求对偶/不可行证书 ⛔ |
| `vmu.math.discrete.backend` | string | `auto` | `auto`｜`networkx`｜`igraph`｜`ortools` | 院士 | 离散后端 ⛔ |
| `vmu.math.discrete.maxEnumeration` | integer | `1000000` | ≥0 | 院士 | 穷举上限（超限具名拒） ⛔ |
| `vmu.math.nt.backend` | string | `auto` | `auto`｜`sympy`｜`pari`｜`gmpy2` | 院士 | 数论后端 ⛔ |
| `vmu.math.nt.proofRequiredAbove` | integer | `0` | ≥0 | pack | 超过该规模必须给证书 ⛔ |
| `vmu.math.geom.backend` | string | `auto` | `auto`｜`sympy`｜`shapely` | 院士 | 几何后端 ⛔ |
| `vmu.math.geom.exactCoordinates` | boolean | `true` | — | 院士 | 精确坐标优先 ⛔ |

### B.5 数值线代／微分方程／自动微分／张量（⛔）
| 键 | 类型 | 默认 | 域 | 谁改 | 说明 |
|---|---|---|---|---|---|
| `vmu.math.linalg.backend` | string | `auto` | `auto`｜`numpy`｜`scipy`｜`octave`｜`julia` | 院士 | 线代后端 ⛔ |
| `vmu.math.linalg.requireResidual` | boolean | `true` | — | pack | 必须附残差/条件数 ⛔ |
| `vmu.math.linalg.sparse` | boolean | `false` | — | 院士 | 稀疏路径 ⛔ |
| `vmu.math.ode.backend` | string | `auto` | `auto`｜`scipy`｜`julia`｜`sundials` | 院士 | ODE 后端 ⛔ |
| `vmu.math.ode.method` | string | `` | 方法名 | 院士 | 求解方法 ⛔ |
| `vmu.math.ode.tolerance` | number | `1e-8` | >0 | 院士 | 误差容差 ⛔ |
| `vmu.math.ode.reportConvergence` | string | `warn` | `require`｜`warn` | pack | 收敛报告要求 ⛔ |
| `vmu.math.convergence.policy` | string | `warn` | `warn`｜`refuse` | 院士 | 不收敛处置 ⛔ |
| `vmu.math.ad.backend` | string | `auto` | `auto`｜`jax`｜`torch`｜`tensorflow` | 院士 | AD 后端 ⛔ |
| `vmu.math.ad.gradCheck` | boolean | `false` | — | 院士 | 梯度检查 ⛔ |
| `vmu.math.tensor.backend` | string | `auto` | `auto`｜`numpy`｜`jax`｜`torch` | 院士 | 张量后端 ⛔ |

### B.6 单位与量纲（⛔）
| 键 | 类型 | 默认 | 域 | 谁改 | 说明 |
|---|---|---|---|---|---|
| `vmu.math.units.enabled` | boolean | `false` | — | 院士/pack | 量纲一等值 ⛔ |
| `vmu.math.units.strictDimensions` | string | `warn` | `require`｜`warn` | pack | 量纲不一致处置 ⛔ |
| `vmu.math.units.constantsSource` | string | `builtin` | `builtin`｜`codata` | 院士 | 常数来源 ⛔ |
| `vmu.math.units.uncertainty` | string | `off` | `off`｜`first-order`｜`monte-carlo` | 院士 | 不确定度传播 ⛔ |

### B.7 形式化（多助手）与证明质量（⛔，Lean 面已有 8 键见附录 A）
| 键 | 类型 | 默认 | 域 | 谁改 | 说明 |
|---|---|---|---|---|---|
| `vmu.math.formal.assistants` | string[] | `['lean']` | 助手名 | 院士/pack | 启用助手集合 ⛔ |
| `vmu.math.formal.requireAll` | boolean | `false` | — | pack | 是否要求全部助手接受 ⛔ |
| `vmu.math.formal.onDisagreement` | string | `block` | `block`｜`report` | pack | 助手结论矛盾处置 ⛔ |
| `vmu.math.formal.sorryPolicy` | string | `forbid` | `forbid`｜`warn`｜`allow` | pack | `sorry`/`admit` 策略 ⛔ |
| `vmu.math.formal.axiomAudit` | string | `report` | `require`｜`report`｜`off` | pack | 公理/依赖审计 ⛔ |
| `vmu.math.formal.librarySearch` | string | `off` | `off`｜`loogle`｜`mathlib` | 院士 | 定理库检索 ⛔ |
| `vmu.math.formal.skeletonStyle` | string | `off` | `off`｜`have`｜`suffices` | 院士 | 证明骨架风格 ⛔ |
| `vmu.math.formal.crossCheck` | boolean | `false` | — | pack | 多助手交叉核对 ⛔ |
| `vmu.math.formal.coqCommand`／`isabelleCommand`／`agdaCommand`／`metamathCommand` | string | 同名词 | 可执行名/路径 | 院士 | 各助手命令 ⛔ |
| `vmu.math.formal.coqArgs`／`isabelleArgs`／`agdaArgs`／`metamathArgs` | string[] | `[]` | argv | 院士 | 各助手参数 ⛔ |
| `vmu.math.formal.coqTimeoutMs`／`isabelleTimeoutMs`／`agdaTimeoutMs`／`metamathTimeoutMs` | integer | `180000` | ≥1000 | 院士 | 各助手超时 ⛔ |

### B.8 工程面：作业／缓存／复现／沙箱／报告（⛔）
| 键 | 类型 | 默认 | 域 | 谁改 | 说明 |
|---|---|---|---|---|---|
| `vmu.math.jobs.maxParallel` | integer | `1` | ≥1 | 院士 | 作业并发（Lean 面已实现同名语义 ✓） |
| `vmu.math.jobs.persist` | boolean | `false` | — | 院士 | 作业持久化 ⛔ |
| `vmu.math.jobs.dir` | string | `State/math-jobs` | 相对项目根 | 院士 | 持久化目录 ⛔ |
| `vmu.math.jobs.logMax` | integer | `200` | ≥1 | 院士 | 事件日志上限 ⛔ |
| `vmu.math.cache.enabled` | boolean | `false` | — | 院士 | 内容哈希缓存 ⛔ |
| `vmu.math.cache.maxEntries` | integer | `500` | ≥0 | 院士 | 缓存条目上限 ⛔ |
| `vmu.math.cache.crossProject` | boolean | `false` | — | 院士 | 跨项目复用 ⛔ |
| `vmu.math.cache.onCorrupt` | string | `evict` | `evict`｜`refuse` | 院士 | 损坏处置 ⛔ |
| `vmu.math.repro.seed` | integer | `null` | ≥0 | 院士/成员 | 随机种子（null＝无随机） ⛔ |
| `vmu.math.repro.requireSeed` | boolean | `false` | — | pack | 有随机必须声明种子 ⛔ |
| `vmu.math.repro.deterministic` | boolean | `false` | — | 院士 | 确定性策略（线程/归约顺序） ⛔ |
| `vmu.math.repro.packOnSuccess` | boolean | `false` | — | pack | 成功即产复现包 ⛔ |
| `vmu.math.sandbox.wallMs` | integer | `0` | ≥0（0＝不限） | 院士 | 墙钟限制 ⛔ |
| `vmu.math.sandbox.cpuMs` | integer | `0` | ≥0 | 院士 | CPU 时间限制 ⛔ |
| `vmu.math.sandbox.memoryMb` | integer | `0` | ≥0 | 院士 | 内存限制 ⛔ |
| `vmu.math.sandbox.threads` | integer | `0` | ≥0 | 院士 | 线程限制 ⛔ |
| `vmu.math.sandbox.network` | string | `off` | `off`｜`allowlist` | 内核闸门 | 网络策略（默认关，pack 不可打开） ⛔ |
| `vmu.math.artifacts.dir` | string | `Computation` | 相对项目根 | 院士 | 归档目录 ⛔（现状路径已实现 ✓，键未暴露） |
| `vmu.math.artifacts.maxFileMb` | number | `4` | >0 | 院士 | 单文件上限（现状有 cap 常量 ✓，键未暴露 ⛔） |
| `vmu.math.artifacts.maxAttemptsPerRun` | integer | `20` | ≥1 | 院士 | 单次运行尝试上限（现状常量 ✓，键未暴露 ⛔） |
| `vmu.math.artifacts.maxRuns` | integer | `200` | ≥1 | 院士 | 项目级运行上限（现状常量 ✓，键未暴露 ⛔） |
| `vmu.math.report.style` | string | `receipt` | `receipt`｜`strang`｜`full` | 院士 | 报告风格 ⛔ |
| `vmu.math.report.language` | string | `zh` | `zh`｜`en` | 院士 | 报告语言 ⛔ |
| `vmu.math.report.includeRepro` | boolean | `false` | — | 院士 | 附复现指引 ⛔ |

---

## 附录 C：**拟增错误码表**（计划 ⛔，供 03-§8 登记）

| 码 | 语义 | 级别 | 备注 |
|---|---|---|---|
| `VMU_MATH_UNSUPPORTED_OP` | 该族/该 op 未实现 | 拒绝 | 计划 ⛔（现在只有 4 个 op ✓） |
| `VMU_MATH_PRECISION_LOST` | 精度不足/有效位不足 | 警告 | 计划 ⛔ |
| `VMU_MATH_INTERVAL_EMPTY` | 区间为空（约束不可满足） | 拒绝 | 计划 ⛔ |
| `VMU_MATH_DIMENSION_MISMATCH` | 量纲不一致 | 拒绝 | 计划 ⛔ |
| `VMU_MATH_ASSUMPTION_CONFLICT` | 符号假设自相矛盾 | 拒绝 | 计划 ⛔ |
| `VMU_MATH_NONCONVERGENT` | 迭代/求解不收敛 | 拒绝/警告（按策略） | 计划 ⛔ |
| `VMU_MATH_SINGULAR_MATRIX` | 奇异/秩亏 | 拒绝 | 计划 ⛔ |
| `VMU_MATH_RESIDUAL_TOO_LARGE` | 残差超容差 | 拒绝 | 计划 ⛔ |
| `VMU_MATH_CACHE_CORRUPT` | 缓存条目损坏 | 拒绝/淘汰（按策略） | 计划 ⛔ |
| `VMU_MATH_REPRO_MISMATCH` | 重放结果与回执不一致 | 拒绝 | 计划 ⛔ |
| `VMU_MATH_SEED_REQUIRED` | 有随机但未声明种子 | 拒绝 | 计划 ⛔ |
| `VMU_MATH_SANDBOX_DENIED` | 沙箱拒绝（越界/网络/资源） | 拒绝 | 计划 ⛔ |
| `VMU_MATH_RESOURCE_LIMIT` | 触达 CPU/内存/线程上限 | 拒绝 | 计划 ⛔ |
| `VMU_MATH_ARTIFACT_TOO_LARGE` | 结果超单文件上限 | 拒绝 | 计划 ⛔（现状：cap 显式截断 ✓） |
| `VMU_MATH_JOB_PERSIST_FAILED` | 作业持久化失败 | 拒绝 | 计划 ⛔ |
| `VMU_FORMAL_NOT_FOUND` | 非 Lean 助手未安装 | 拒绝 | 计划 ⛔（Lean 已有 `VMU_LEAN_NOT_FOUND` ✓） |
| `VMU_FORMAL_ADAPTER_UNSUPPORTED` | 助手适配器不支持该操作 | 拒绝 | 计划 ⛔ |
| `VMU_FORMAL_SORRY_FOUND` | 证明含 `sorry`/`admit` | 拒绝/警告（按策略） | 计划 ⛔ |
| `VMU_FORMAL_AXIOM_UNTRUSTED` | 使用了未登记公理/`unsafe` | 拒绝/警告 | 计划 ⛔ |
| `VMU_FORMAL_LIBRARY_NOT_INDEXED` | 定理库未建索引 | 拒绝 | 计划 ⛔ |
| `VMU_FORMAL_DISAGREEMENT` | 多助手结论不一致 | 拒绝（默认阻塞） | 计划 ⛔ |
| `VMU_FORMAL_SKELETON_UNAVAILABLE` | 无法生成骨架 | 警告 | 计划 ⛔ |
| `VMU_FORMAL_REPRO_INCOMPLETE` | 复现包缺项（版本/依赖/种子） | 拒绝 | 计划 ⛔ |

> 已实现码（勿重复登记）：`MATH_*` 11 个、`VMU_LEAN_*` 9 个（其中 `VMU_LEAN_FILE_REQUIRED`／`VMU_LEAN_STATEMENT_REQUIRED` **为提案码、当前未使用** ✗：参数级错误统一 `VMU_MATH_INVALID_INPUT` ✓）、**`VMU_EXTERNAL_UNAVAILABLE`**（接缝/引擎不可用的统一共享码 ✓；历史提案 `VMU_ENGINE_UNAVAILABLE` **当前未使用** ✗）、`VMU_JOB_TIMEOUT`、`VMU_RESOURCE_BUDGET`、`VMU_NOT_PERMITTED`、`VMU_INVALID_ARGUMENT`。

---

## 附录 D：多助手适配器契约（⛔ 除 Lean 外均未实现）

```js
// FormalAdapter（计划 ⛔）：与 compute 面的 EngineAdapter 同形，但多一个"证据判据"声明
interface FormalAdapter {
  name: 'lean' | 'coq' | 'isabelle' | 'agda' | 'metamath'
  probe(): Promise<{ available: boolean; version?: string; reason?: string }>
  /** 该助手判"通过"的规则（**必须逐助手显式声明**，不得继承 Lean） */
  settleRule(): 'exit-0-and-content-hash-unchanged' | string
  commandFor(target: { statement?: string; file: string }): { command: string; argv: string[]; cwd: string }
  submit(job): Promise<{ id: string; state: string }>
  status(id): Promise<object>; list(): Promise<object[]>; cancel(id): Promise<void>
  /** 质量检查：未完成证明/公理/依赖（⛔ 未实现） */
  qualityReport?(id): Promise<{ sorry: boolean; axioms: string[]; deps: string[] }>
}
```

| 助手 | `settleRule()` 建议 | 质量检查 | 现状 |
|---|---|---|---|
| Lean | `exit-0-and-content-hash-unchanged` ✓ | `sorry`/公理审计 ⛔ | ✓ 接线 |
| Coq | `exit-0`＋脚本哈希未变（待声明） | `admit`/`Axiom` ⛔ | ⛔ |
| Isabelle | 批处理退出码＋镜像指纹（待声明） | 内部 `sorry` 语义 ⛔ | ⛔ |
| Agda | `exit-0`＋无 `postulate`（待声明） | `postulate` ⛔ | ⛔ |
| Metamath | 验证器 `verify proof *` 全通过（待声明） | 未证 `$p` 语句 ⛔ | ⛔ |

---

## 附录 E：族 × 键族命中表（本卷 ↔ 15 卷）

| 族（15 卷节） | 键族 | 已实现 | 计划 |
|---|---|---|---|
| 数值 §3 | `vmu.math.numeric.*`／`precision.*`／`interval.*` | `timeoutMs`／`engines` ✓ | 精度/区间/警告 ⛔ |
| 符号 §4 | `vmu.math.symbolic.*` | — | 全部 ⛔（引擎能力可用 ◐） |
| 统计 §5 | `vmu.math.stats.*`／`bayes.*`／`repro.seed.*` | — | 全部 ⛔ |
| 优化 §6 | `vmu.math.optim.*` | — | 全部 ⛔ |
| 离散 §7 | `vmu.math.discrete.*` | — | 全部 ⛔ |
| 数论 §8 | `vmu.math.nt.*` | — | 全部 ⛔ |
| 几何 §9 | `vmu.math.geom.*` | — | 全部 ⛔ |
| 数值线代 §10 | `vmu.math.linalg.*` | — | 全部 ⛔ |
| 微分方程 §11 | `vmu.math.ode.*`／`convergence.*` | — | 全部 ⛔ |
| 自动微分/张量 §12 | `vmu.math.ad.*`／`tensor.*` | — | 全部 ⛔ |
| 单位量纲 §12 | `vmu.math.units.*` | — | 全部 ⛔ |
| 形式化 §13 | `vmu.math.formal.*`＋Lean 键族 | 8 个 Lean 键 ✓ | 多助手/质量检查 ⛔ |
| 工程面 §14 | `vmu.math.jobs.*`／`cache.*`／`repro.*`／`sandbox.*`／`artifacts.*`／`report.*` | 超时/预算/caps/归档 ✓ | 其余 ⛔ |
