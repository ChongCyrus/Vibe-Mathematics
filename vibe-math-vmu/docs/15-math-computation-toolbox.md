# vmu 15 · 数学计算工具箱（Math Computation Toolbox）

> 状态：**草案 v0.2**（新卷；task-37 起草；v0.1 → v0.2 补齐"逐条模板＋工程面细节＋反模式＋门禁判据＋接线"）
> 上位：`09-math-formalization.md`（能力面／适配器／身份／作业／判定点）、`01-philosophy.md`（R1 零策略 / R2 能力齐备 / R11 具名拒绝 / R12 可复现）、`04-settings.md`（设置命名空间与登记规则）、`05-middleware.md`、`10-packs.md`、`11-gates-and-development.md`（接缝与门禁纪律）、`07-durability-library.md`（归档布局）
> 分工：**09 卷**＝"计算/形式化的边界与判定点"；**本卷**＝"计算面有哪些族、每族怎么用、怎么被 settings/中间件/pack **替换与组合**"。
> **口径（硬性，照做）**：
> 1. 正文**可以写具体键名与具体错误码** ✓（由 task-37 回报汇总，Lead 登记进 `settings/schema.js` 与 `03-§8`）；**计划**项仍须带 ⛔。
> 2. **未实现**的能力/工具/协议/适配器一律带标记词 **⛔**（同 03 卷 §2.1"未实现者一律标 ⛔"约定）。
> 3. **已实现**的事实按代码如实写 ✓（工具 `math_computation` 的 4 个 op、8 个 P1 引擎、回执与归档、Lean 作业队列、caps 与预算闸门、`classifyOutcome` 永不反驳）。
> 4. 键全表见 **§21.6**，码全表见 **§21.7**，工具/服务/协议/适配器清单见 **§21.8**；**§18 未核项**逐条列出"没实测/没定"的东西；**§19** 给与其它卷的接线；**§20** 给可核门禁判据。

---

## 1. 定位与边界

| 问题 | 答案 |
|---|---|
| 计算面能做什么？ | 把数学**算出来**：数值、符号、统计、优化、离散、数论、几何、数值线代、微积分与微分方程、自动微分、张量、单位量纲；每次执行留成**可复核回执** ✓ |
| 计算面不能做什么？ | **不能判定真值**：计算结果≠证明（09-§8）；任何失败（缺引擎/argv 错/超时）**都不是反驳** ✓ |
| 谁决定"要不要算、用什么引擎、算多久、算到几精度"？ | settings（`vmu.math.*` 通配族）＋中间件＋pack；内核只提供**能力与闸门** ✓ |
| 一定能用吗？ | 不一定：引擎按注册顺序探测，缺一即**具名降级**（`VMU_ENGINE_UNAVAILABLE`＋建议），**绝不假装成功** ✓ |
| 结果可复现吗？ | 现状：回执含脚本路径/哈希/实际 argv，可比对 ✓；**种子、环境锁定、复现包** ⛔（§15.2） |
| 谁来兜底"跑飞了"？ | 单次超时 ✓、输出 caps ✓、预算闸门 ✓、并发上限 ✓；**CPU/内存/网络**硬限制 ⛔（§15.3） |

**三种使用方式**（同一能力面）：
1. **类型化调用** ✓：`math_computation` 的 `run`／`probe`／`install`／`receipt`（默认模式 `typed+shell`）；
2. **脚本兜底** ✓：允许 shell 式求解，但结果带"**未经工具归档**"标记（中英各一条常量）；
3. **族级扩展** ⛔：新增引擎/后端/助手适配器（§16.3 注册面设计）。

---

## 2. 总览矩阵

### 2.1 计算族 × 后端 × 成熟度 × 可调控

| # | 族 | 主要后端（现状 ✓／计划 ⛔） | 成熟度 | 可调控（通配） | 关键错误码 |
|---|---|---|---|---|---|
| 1 | 数值计算 | `python`/`octave`/`julia`/`cli` ✓ | ✓ | `vmu.math.numeric.*`、`vmu.math.precision.*` | `MATH_*`（11 个 ✓） |
| 2 | 符号计算 | `maple`/`wolfram` ✓、`sage` ⛔、`sympy` ⛔ | ◐ | `vmu.math.symbolic.*` | `MATH_ENGINE_*` ✓／⛔ |
| 3 | 统计与概率 | `r` ✓、`python` ✓、`stan`/`pymc` ⛔ | ◐ | `vmu.math.stats.*`、`vmu.math.bayes.*` | `MATH_MISSING_PACKAGES` ✓／⛔ |
| 4 | 优化 | ⛔（需 cvxpy/scipy/ortools 探测） | ⛔ | `vmu.math.optim.*` | ⛔ |
| 5 | 离散与组合 | ⛔（networkx/igraph/CP-SAT） | ⛔ | `vmu.math.discrete.*` | ⛔ |
| 6 | 数论与密码 | ⛔（sympy/gmpy2/pari） | ⛔ | `vmu.math.nt.*` | ⛔ |
| 7 | 几何与拓扑 | ⛔（shapely/sympy.geometry） | ⛔ | `vmu.math.geom.*` | ⛔ |
| 8 | 数值线性代数 | `octave`/`julia` ✓、`numpy`/`scipy` ⛔ | ◐ | `vmu.math.linalg.*` | ⛔ |
| 9 | 微分方程 | ⛔（scipy/sundials/Julia） | ⛔ | `vmu.math.ode.*` | ⛔ |
| 10 | 自动微分/张量 | ⛔（jax/pytorch/tensorflow） | ⛔ | `vmu.math.ad.*`、`vmu.math.tensor.*` | ⛔ |
| 11 | 单位与量纲 | ⛔（设计：量纲一等值） | ⛔ | `vmu.math.units.*` | ⛔ |
| 12 | 形式化与证明 | `lean` ✓；`coq`/`isabelle`/`agda`/`metamath` ⛔ | ◐ | `vmu.math.formal.*`、`vmu.math.proof.*` | `VMU_LEAN_*` ✓／⛔ |

### 2.2 工程族 × 成熟度

| 工程族 | 现状 | 说明 |
|---|---|---|
| 回执与归档 | ✓ | `Computation/<id>/`：脚本路径、脚本哈希、**实际 argv**、退出码、输出摘要 |
| 可用性探测 | ✓ | 引擎表＋宿主 `resolveExecutable`；缺席具名降级 |
| 输出上限 caps | ✓ | stdout／stderr／单文件各一常量；截断显式 |
| 超时 | ✓ | 作业级（默认 60 s）＋ Lean 单次预算；`MATH_TIMEOUT`／`VMU_LEAN_TIMEOUT` |
| 预算闸门 | ✓ | 时间/次数计入预算族，超限 `VMU_RESOURCE_BUDGET` |
| 并发作业队列 | ✓ | Lean 作业并发上限（默认 1＝串行）、`queued/running/passed/failed` |
| 事件日志上限 | ✓ | 上限常量；超出计数丢弃、不静默 |
| 路径与写保护 | ✓ | 越界 `VMU_NOT_PERMITTED` |
| 归档保留上限 | ✓ | 单次/项目级上限＋`ARCHIVE_RETENTION_EXCEEDED` **警告**（从不自动删除） |
| 脚本变更检测 | ✓ | `SCRIPT_CHANGED_SINCE_LAST_RECEIPT`／`SCRIPT_CHANGED_DURING_RUN` |
| 内容哈希缓存 | ⛔ | 现状只能"比对回执"，不能"命中即跳过" |
| 种子/确定性 | ⛔ | 不记录种子 ⇒ 含随机作业不可复现 |
| CPU/内存/网络限制 | ⛔ | 只有 caps 与超时 |
| 作业持久化/断点续算 | ⛔ | 作业在会话内存 |
| 大结果存储与引用 | ⛔ | 现状：正文落文件、审计留摘要 |
| 不收敛/数值警告分类 | ⛔ | 现状：一律"非零退出" |
| 结构化报告/Strang 模板 | ⛔ | 现状：回执 JSON＋可用性行 |

### 2.3 数据与结果模型（字段级草案；标 ✓ 者已存在于回执/作业）
```js
// 已有形状（✓ 代码可核）
MathJob    = { id, kind, engine, input, timeoutMs, budget?, async?, createdAt, state, result?, error? }        // ✓
LeanJob    = { id, statement, file, state:'queued'|'running'|'passed'|'failed', exitCode, hashUnchanged, ... }   // ✓
Receipt    = { id, engine, scriptPath, scriptHash, argv:[...], exitCode, stdout?, stderr?, startedAt, endedAt }   // ✓
// 计划形状（⛔ 未实现，命名与字段待 03/04 卷落定）
ReproPack  = { proofScript|script, engineVersions:[...], deps:[...], seed, env:{...}, receiptIds:[...] }        // ⛔
ConvReport = { method, stepSize?, tolerance, residual, iterations?, converged:boolean, reason }                  // ⛔
DimValue   = { value|expr, unit, dimension, uncertainty? }                                                       // ⛔
CacheEntry = { keyHash, engineIdentity, argv, precision, receiptRef, createdAt, hits }                           // ⛔
```

### 2.4 组合模式（同一族怎么"拼"起来）

| 模式 | 语义 | 典型用途 | 现状 |
|---|---|---|---|
| **替换（replace）** | 用后端 B 顶掉默认 A | 换 `python`→`julia`；换 `lean`→`coq` ⛔ | ✓（引擎顺序族）／⛔（助手族） |
| **回退（fallback）** | A 不可用/失败 ⇒ 顺位到 B，且**具名**记录降级 | 商业引擎缺许可 ⇒ 开源引擎 | ✓（探测顺序＋具名降级） |
| **流水线（pipeline）** | A 的输出是 B 的输入（如符号化简→数值求值） | 化简→求根→验证 | ⛔（可由脚本＋回执人工串） |
| **交叉验证（cross-check）** | 同一输入两后端独立算，比对**回执哈希/数值容差** | 关键数值结论 | ⛔ |
| **多助手核对（formal cross-check）** | 同一命题两助手都接受 | 高价值定理 | ⛔（§13.1） |
| **投票（vote）** | 多后端结果取多数（**仅限计算，不得用于证明**） | 数值稳健性判断 | ⛔（且需 pack 显式开启） |
| **兜底（shell fallback）** | 类型化不可行时走 shell，结果**带未归档标记** | 探索性计算 | ✓ |

> 红线：**投票只能用于计算的一致性判断**，永远不能把"多数后端都算出来了"当作证明 ✗（09-§8）。

---

## 3. 数值计算族（Numeric）

| 条目 | 目的 | 接口形状 | 可调控（通配） | 错误码 | 成熟度 | 优先级 |
|---|---|---|---|---|---|---|
| 浮点四则/超越函数 | IEEE-754 基本运算 | `run{engine,argv|script,stdin}` | `vmu.math.numeric.*` | `MATH_*` | ✓ | P0 |
| 整数/大整数 | 精确整数、模算术基础 | 同上 | `vmu.math.numeric.*` | `MATH_*` | ✓ | P0 |
| 有理数/精确分数 | 避免浮点误差 | 同上（引擎符号能力） | `vmu.math.precision.*` | ⛔ | ⛔ | P1 |
| 高精度/任意精度 | 可设有效位数 | 同上＋精度参数 | `vmu.math.precision.*` | ⛔ | ⛔ | P1 |
| 区间算术 | 给误差**界**而非点值 | 同上＋区间语义 | `vmu.math.interval.*` | ⛔ | ⛔ | P1 |
| 误差与舍入策略 | 舍入模式/容差/有效位 | 同上 | `vmu.math.precision.*` | ⛔ | ⛔ | P1 |
| 数值稳定性 | 病态度量、条件数 | 同上 | `vmu.math.numeric.stability.*` | ⛔ | ⛔ | P2 |
| 特殊函数 | Γ/ζ/贝塞尔/椭圆积分 | 同上（引擎库） | `vmu.math.numeric.special.*` | `MATH_MISSING_PACKAGES` ✓ | ◐ | P2 |
| 随机数发生器 | 可复现随机源 | 同上＋种子参数 | `vmu.math.repro.seed.*` | ⛔ | ⛔ | P1 |
| 数值警告 | 溢出/下溢/除零/病态 | 回执中的**警告数组** | `vmu.math.numeric.warnings.*` | ⛔ | ⛔ | P2 |

- **哲学关系**：这是"算出来"的最底层；**永远不是证明**（09-§8）。区间算术把"无误差说明的点值"变成"有界结论"，但它仍是计算。
- **实现要点**：全部走同一 `run` op ⇒ 无需新工具；差异只在**argv 模板**与**精度/种子参数**上（引擎表已支持按引擎给 argv，且有 `mathEngineOverride` 逃逸口与 bad-argv 提示 ✓）。
- **依赖**：引擎表（8 个 P1 ✓）、宿主 `resolveExecutable/spawn` ✓、caps ✓、预算闸门 ✓。
- **替换与组合**：换后端＝改**引擎顺序族**（已实现）或作业级指定引擎 ✓；精度/舍入默认值＝settings 的精度子族＋中间件 `before` 注入 ⛔（中间件机制 ✓、数学示例 ⛔）；"某阶段必须给误差界"＝pack 声明 ⛔。

---

## 4. 符号计算族（Symbolic）

| 条目 | 目的 | 接口形状 | 可调控（通配） | 错误码 | 成熟度 | 优先级 |
|---|---|---|---|---|---|---|
| 化简/展开 | 表达式规范化 | `run`＋脚本 | `vmu.math.symbolic.*` | `MATH_*` | ◐ | P1 |
| 因式分解 | 多项式分解 | 同上 | `vmu.math.symbolic.*` | `MATH_*` | ◐ | P1 |
| 解方程/方程组 | 精确解集 | 同上 | `vmu.math.symbolic.solve.*` | `MATH_*` | ◐ | P1 |
| 符号微积分 | 导数/积分 | 同上 | `vmu.math.symbolic.calculus.*` | `MATH_*` | ◐ | P1 |
| 极限与级数 | 极限、泰勒/洛朗、求和、收敛判别 | 同上 | `vmu.math.symbolic.series.*` | ⛔ | ◐ | P2 |
| 符号线性代数 | 符号行列式/特征值 | 同上 | `vmu.math.symbolic.linalg.*` | ⛔ | ⛔ | P2 |
| 符号张量 | 指标与缩并 | ⛔ 无 | `vmu.math.tensor.*` | ⛔ | ⛔ | P3 |
| 假设管理 | 域/正负/非零等假设 | 作业参数**假设块** | `vmu.math.symbolic.assumptions.*` | ⛔ | ⛔ | P1 |
| 特殊函数（符号） | 化简/展开特殊函数 | 同上 | `vmu.math.symbolic.special.*` | ⛔ | ⛔ | P3 |

- **哲学关系**：符号结果给出**表达式等价**；"这个等价就是命题要的东西"仍需人/形式化确认；**符号反例只是线索**（09-§8）。
- **实现要点**：假设必须**显式**（禁止"通常成立"隐式默认）；假设冲突具名 ⛔。
- **依赖**：`sage` ⛔（P2 表已登记、未进 P1 顺序）、`maple`/`wolfram` ✓（商业；许可类错误具名 ✓）、`python`＋sympy ⛔（未内建探测）。
- **替换与组合**：同族可**并列多后端**（pack 声明"化简用 A、积分用 B"）⛔；中间件可强制"符号结论必须附假设清单" ⛔。

---

## 5. 统计与概率族（Statistics & Probability）

| 条目 | 目的 | 接口形状 | 可调控（通配） | 错误码 | 成熟度 | 优先级 |
|---|---|---|---|---|---|---|
| 描述统计 | 均值/方差/分位/相关 | `run`＋脚本 | `vmu.math.stats.*` | `MATH_*` | ✓（`r`/`python`） | P1 |
| 假设检验 | t/χ²/非参数/多重比较校正 | 同上 | `vmu.math.stats.tests.*` | `MATH_*` | ◐ | P1 |
| 回归 | 线性/广义/稳健/混合 | 同上 | `vmu.math.stats.regression.*` | `MATH_*` | ◐ | P1 |
| ANOVA/协方差 | 方差分解 | 同上 | `vmu.math.stats.anova.*` | ⛔ | ◐ | P2 |
| 重采样 | bootstrap/置换 | 同上 **＋种子** | `vmu.math.repro.seed.*` | ⛔ | ◐（种子 ⛔） | P1 |
| 贝叶斯推断 | 后验/区间/模型比较 | 同上（⛔ stan/pymc） | `vmu.math.bayes.*` | ⛔ | ⛔ | P2 |
| MCMC 诊断 | R̂/ESS/链收敛 | 同上 | `vmu.math.bayes.diagnostics.*` | ⛔ | ⛔ | P2 |
| 功效与样本量 | power/sample size | 同上 | `vmu.math.stats.power.*` | ⛔ | ⛔ | P2 |
| 生存分析 | KM/Cox | 同上 | `vmu.math.stats.survival.*` | ⛔ | ⛔ | P3 |
| 时间序列 | ARIMA/谱/状态空间 | 同上 | `vmu.math.stats.timeseries.*` | ⛔ | ⛔ | P3 |
| 实验设计 DOE | 因子/区组/序贯 | 同上 | `vmu.math.stats.doe.*` | ⛔ | ⛔ | P3 |
| 缺失数据 | 插补/敏感性 | 同上 | `vmu.math.stats.missing.*` | ⛔ | ⛔ | P3 |
| 因果推断 | 潜在结果/工具变量 | 同上 | `vmu.math.stats.causal.*` | ⛔ | ⛔ | P3 |
| 概率图模型 | 贝叶斯网络/因子图 | ⛔ | `vmu.math.bayes.pgm.*` | ⛔ | ⛔ | P3 |

- **哲学关系**：统计结论依赖**模型假设**；平台要求"假设＋随机性来源"可审计（R12）。它与 **08 卷的布尔概率表决**是两件事：后者是组织决策聚合，不是统计推断。
- **实现要点**：随机必须可由**种子**复现 ⛔（现状不记录种子＝最大可复现缺口）；重采样结果标注"统计量＋区间＋方法＋重复数"。
- **依赖**：`r` ✓、`python` ✓、`stan`/`pymc` ⛔。
- **替换与组合**：`r` 与 `python` 互为备份 ✓；贝叶斯后端走 `vmu.math.bayes.*` ⛔；中间件 `after` 可拒"没有假设清单的统计结论" ⛔。

---

## 6. 优化族（Optimization）

| 条目 | 目的 | 可调控 | 错误码 | 成熟度 | 优先级 |
|---|---|---|---|---|---|
| 线性规划 LP | 单纯形/内点 | `vmu.math.optim.lp.*` | ⛔ | ⛔ | P1 |
| 整数/混合整数 MIP | 分支定界 | `vmu.math.optim.mip.*` | ⛔ | ⛔ | P1 |
| 约束规划 CP-SAT | 组合约束 | `vmu.math.optim.cp.*` | ⛔ | ⛔ | P2 |
| 非线性 NLP | 梯度/无梯度 | `vmu.math.optim.nlp.*` | ⛔ | ⛔ | P2 |
| 凸优化 | DCP 建模 | `vmu.math.optim.convex.*` | ⛔ | ⛔ | P2 |
| 全局优化 | 区间/分支定界 | `vmu.math.optim.global.*` | ⛔ | ⛔ | P3 |
| 多目标 | Pareto 前沿 | `vmu.math.optim.multi.*` | ⛔ | ⛔ | P3 |
| 随机/鲁棒 | 情景/机会约束 | `vmu.math.optim.robust.*` | ⛔ | ⛔ | P3 |
| 对偶与证书 | 对偶界/不可行证书 | `vmu.math.optim.certificates.*` | ⛔ | ⛔ | P2 |
| 灵敏度分析 | 影子价格/参数扫描 | `vmu.math.optim.sensitivity.*` | ⛔ | ⛔ | P2 |

- **接口形状**：统一 `run`（模型以脚本/MPS/LP 文本给出）＋求解器参数；⛔ 将来可由 `vibe_vmu_math` ⛔（统一路由工具，未实现）提供族化签名。
- **哲学关系**：结果只能是"**在给定容差与求解器状态下的最优**"；**没有证书的最优解不是结论** ⛔（对偶/不可行证书未实现）。
- **实现要点**：求解器状态（`optimal`/`infeasible`/`unbounded`/`timeout`）、目标值、界、迭代数必须入回执 ⛔；不收敛具名 ⛔。
- **替换与组合**：换求解器＝`vmu.math.optim.backends.*` ⛔；pack 可规定"结题结论若依赖优化，必须附求解器日志摘要" ⛔。

---

## 7. 离散与组合族（Discrete & Combinatorics）

| 条目 | 目的 | 可调控 | 错误码 | 成熟度 | 优先级 |
|---|---|---|---|---|---|
| 图论基础 | 连通/最短路/最小生成树 | `vmu.math.discrete.graph.*` | ⛔ | ⛔ | P2 |
| 网络流/匹配 | 最大流/最小费用/二分匹配 | `vmu.math.discrete.flow.*` | ⛔ | ⛔ | P2 |
| 组合计数 | 生成函数/递推/容斥 | `vmu.math.discrete.count.*` | ⛔ | ⛔ | P2 |
| 枚举与穷举 | 小规模完备搜索 | `vmu.math.discrete.enumerate.*` | ⛔ | ⛔ | P1 |
| 调度与排程 | 车间/项目排程 | `vmu.math.discrete.scheduling.*` | ⛔ | ⛔ | P3 |
| 着色/覆盖 | 图着色、精确覆盖 | `vmu.math.discrete.covering.*` | ⛔ | ⛔ | P3 |
| 拟阵与多面体 | 组合优化结构 | `vmu.math.discrete.matroid.*` | ⛔ | ⛔ | P3 |
| 谱图论 | 特征值/扩展图 | `vmu.math.discrete.spectral.*` | ⛔ | ⛔ | P3 |
| 组合证明辅助 | 双射/归纳结构化记录 | `vmu.math.discrete.proof.*` | ⛔ | ⛔ | P3 |

- **哲学关系**：**有限穷举不是无限命题的证明**（09-§8）；有限反例是**线索**，需归档＋确认。

---

## 8. 数论与密码族（Number Theory & Crypto）

| 条目 | 目的 | 可调控 | 错误码 | 成熟度 | 优先级 |
|---|---|---|---|---|---|
| 模运算 | 同余/CRT/模逆 | `vmu.math.nt.modular.*` | ⛔ | ⛔ | P1 |
| 素数 | 判定/生成/筛 | `vmu.math.nt.primes.*` | ⛔ | ⛔ | P1 |
| 因子分解 | 试除/Pollard/ECM | `vmu.math.nt.factor.*` | ⛔ | ⛔ | P2 |
| 二次剩余/符号 | Legendre/Jacobi | `vmu.math.nt.residues.*` | ⛔ | ⛔ | P2 |
| 连分数/逼近 | 有理逼近、丢番图逼近 | `vmu.math.nt.approx.*` | ⛔ | ⛔ | P3 |
| 丢番图方程 | 解的存在性搜索 | `vmu.math.nt.diophantine.*` | ⛔ | ⛔ | P2 |
| 椭圆曲线（教学） | 群运算/点计数 | `vmu.math.nt.elliptic.*` | ⛔ | ⛔ | P3 |
| ζ/L 函数（数值） | 数值求值与零点探索 | `vmu.math.nt.zetafn.*` | ⛔ | ⛔ | P3 |
| 密码学原语（教学/验证） | 哈希/签名/群运算 | `vmu.math.nt.crypto.*` | ⛔ | ⛔ | P3 |

- **安全边界（硬要求）**：密码学相关计算**不得**用于生成生产密钥材料；无网络＋沙箱（§15.3，⛔ 未实现）是当前设计约束。

---

## 9. 几何与拓扑族（Geometry & Topology）

| 条目 | 目的 | 可调控 | 错误码 | 成熟度 | 优先级 |
|---|---|---|---|---|---|
| 计算几何 | 凸包/相交/距离/三角化 | `vmu.math.geom.computational.*` | ⛔ | ⛔ | P2 |
| 符号几何 | 精确坐标几何定理 | `vmu.math.geom.symbolic.*` | ⛔ | ⛔ | P2 |
| 凸几何 | 分离定理/支撑函数 | `vmu.math.geom.convex.*` | ⛔ | ⛔ | P3 |
| 微分几何 | 曲线曲面/联络 | `vmu.math.geom.differential.*` | ⛔ | ⛔ | P3 |
| 代数几何（基础） | 理想/簇/消元 | `vmu.math.geom.algebraic.*` | ⛔ | ⛔ | P3 |
| 拓扑不变量 | 同调/基本群（有限复形） | `vmu.math.geom.topology.*` | ⛔ | ⛔ | P3 |
| 作图与可视化 | 图/表/几何图输出 | `vmu.math.report.figures.*` | ⛔ | ⛔（脚本可产文件 ✓） | P2 |

---

## 10. 数值线性代数族（Numerical Linear Algebra）

| 条目 | 目的 | 可调控 | 错误码 | 成熟度 | 优先级 |
|---|---|---|---|---|---|
| 分解 | LU/QR/Cholesky/SVD | `vmu.math.linalg.decomp.*` | ⛔ | ◐ | P1 |
| 特征值/奇异值 | 谱/条件数 | `vmu.math.linalg.eigen.*` | ⛔ | ◐ | P1 |
| 线性系统 | 直接/迭代求解 | `vmu.math.linalg.solve.*` | ⛔ | ◐ | P1 |
| 残差与稳定性 | 后向误差/条件数 | `vmu.math.linalg.stability.*` | ⛔ | ⛔ | P1 |
| 稀疏矩阵 | 存储/稀疏直接法与迭代法 | `vmu.math.linalg.sparse.*` | ⛔ | ⛔ | P2 |
| 预条件 | ILU/AMG | `vmu.math.linalg.precond.*` | ⛔ | ⛔ | P3 |
| 最小二乘/正则化 | LS/岭/LASSO | `vmu.math.linalg.leastsquares.*` | ⛔ | ⛔ | P2 |
| 秩/零空间 | 秩判定与子空间 | `vmu.math.linalg.rank.*` | ⛔ | ⛔ | P2 |
| 广义特征值 | 束/矩阵对 | `vmu.math.linalg.generalized.*` | ⛔ | ⛔ | P3 |
| 随机数值线代 | 随机 SVD/sketching | `vmu.math.linalg.randomized.*` | ⛔ | ⛔ | P3 |

- **实现要点（硬）**：任何线代结果应附**残差/条件数**，否则"算出来了"不可信 ⛔（计划：`after` 中间件默认检查）。

---

## 11. 微分方程与自动微分族（ODE/PDE & AD）

| 条目 | 目的 | 可调控 | 错误码 | 成熟度 | 优先级 |
|---|---|---|---|---|---|
| 符号 ODE/PDE | 解析解/级数解 | `vmu.math.ode.symbolic.*` | ⛔ | ⛔ | P2 |
| 数值 ODE（初值） | 刚性/非刚性 | `vmu.math.ode.numeric.*` | ⛔ | ⛔ | P1 |
| 数值 ODE（边值） | 打靶/配点 | `vmu.math.ode.bvp.*` | ⛔ | ⛔ | P2 |
| 数值 PDE | 有限差分/有限元（外部） | `vmu.math.ode.pde.*` | ⛔ | ⛔ | P3 |
| 收敛/刚性报告 | 步长/误差估计/失败原因 | `vmu.math.convergence.*` | ⛔ | ⛔ | P1 |
| 事件与不连续 | 事件检测/切换 | `vmu.math.ode.events.*` | ⛔ | ⛔ | P3 |
| 自动微分 AD | 前向/反向、梯度检查 | `vmu.math.ad.*` | ⛔ | ⛔ | P2 |
| 变分与最优控制 | 变分法/最优控制 | `vmu.math.optim.variational.*` | ⛔ | ⛔ | P3 |

- **哲学关系**：数值解**不是**解析结论；"方法＋步长＋误差估计＋不收敛原因"是结论的**代价说明** ⛔（未实现）。

---

## 12. 张量、单位与量纲、物理常数

| 条目 | 目的 | 可调控 | 错误码 | 成熟度 | 优先级 |
|---|---|---|---|---|---|
| 张量库 | 指标运算/缩并/广播 | `vmu.math.tensor.*` | ⛔ | ⛔ | P3 |
| 单位换算 | 单位系统与换算 | `vmu.math.units.*` | ⛔ | ⛔ | P1 |
| 量纲检查 | 等式两侧量纲一致 | `vmu.math.units.dimensions.*` | ⛔ | ⛔ | P1 |
| 物理常数库 | 常量＋不确定度＋来源 | `vmu.math.units.constants.*` | ⛔ | ⛔ | P2 |
| 不确定度传播 | 一阶/蒙特卡洛 | `vmu.math.units.uncertainty.*` | ⛔ | ⛔ | P2 |
| 单位感知的求解 | 带单位的方程组 | `vmu.math.units.solve.*` | ⛔ | ⛔ | P3 |

- **实现要点（设计）**：量纲是**一等值**（`DimValue`），不是注释；量纲不一致**具名拒** ⛔；常数必须带来源与不确定度。

---

## 13. 形式化与证明族（Formalization & Proof）

### 13.1 助手适配层

| 助手 | 现状 | 判"通过"的规则（必须逐助手显式声明） | 备注 |
|---|---|---|---|
| **Lean** | ✓ 已接线 | **退出 0 且内容哈希未变** ✓ | 唯一有真实接线者；8 个同族设置已接线（见 09-§12） |
| **Coq / Rocq** | ⛔ 未实现 | 需声明（不得继承 Lean 规则） | 契约见 09-§2.2 |
| **Isabelle** | ⛔ 未实现 | 同上（批处理＋镜像语义需建模） | — |
| **Agda** | ⛔ 未实现 | 同上（错误码映射单独设计） | 无内建 `sorry` 等价物 |
| **Metamath** | ⛔ 未实现 | 同上（验证器极轻；库检索另议） | — |

- **拟增工具（⛔ 全部未实现，仅设计名）**：`vibe_vmu_math` ⛔（计算面统一路由）、`vibe_vmu_math_job` ⛔（作业队列/取消/续算）、`vibe_vmu_math_cache` ⛔（缓存维护）、`vibe_vmu_formal` ⛔（多助手作业面）、`vibe_vmu_formal_search` ⛔（定理库检索）、`vibe_vmu_units` ⛔（单位与量纲）。
- **替换与组合**：选择助手＝settings/pack（`vmu.math.formal.*`）⛔；多助手并列＋**交叉核对** ⛔；"某阶段必须形式化"＝pack 声明（09-§5）✓ 机制。

### 13.2 证明作业队列
- **状态机** ✓：`queued → running → passed | failed`；未结束即结算 ⇒ `VMU_LEAN_NOT_SETTLED` ✓；
- **异步/查询/取消** ✓；**并发上限** ✓（默认 1）；**事件日志上限** ✓；
- **持久化/断点/跨重启** ⛔（作业在会话内存）。

### 13.3 证明质量检查
| 检查 | 目的 | 现状 | 备注 |
|---|---|---|---|
| 编译与检查 | 内核接受 | ✓（Lean） | `VMU_LEAN_EXIT_NONZERO`／`VMU_LEAN_SPAWN_FAILED` |
| 内容未变 | 通过必须针对**同一份**文件 | ✓ | `VMU_LEAN_HASH_CHANGED` |
| `sorry`/`admit` 检测 | 未完成证明不得冒充通过 | ⛔ | 计划：文本＋AST 双路 |
| 公理/依赖审计 | 用了哪些公理/`unsafe`/外部假设 | ⛔ | 需输出依赖图 |
| 定理库检索 | 按陈述找定理（Loogle/Mathlib 风格） | ⛔ | 需索引与相似度策略 |
| 证明骨架生成 | 可填空的 `have/suffices` 结构 | ⛔ | 需与提示词管线协作 |
| 反例与反驳 | 构造 `¬P` 的显式证据 | ⛔ | 现状只能区分"缺陷 vs 结果" ✓ |
| 形式化↔非形式化对照 | 命题原文与形式陈述逐句对照 | ⛔ | 建议入论文阶段检查（09-§7） |
| 复现包 | 证明脚本＋引擎版本＋依赖＋种子 | ⛔ | 见 §15.2 |

### 13.4 "反驳"的唯一合法路径（设计）
1. 计算/搜索得到**线索**（数值反例、模型反例）⇒ 归档为回执 ✓；
2. 形式化"`¬P` 可证"⇒ 归档为**已证 ¬P**（需要助手侧支持）⛔；
3. 表决/论文引用时，**只能**引用 2 类产物作为反驳依据；1 类只能作为"需要进一步验证"的线索 ✓。
> 纪律：**编译失败、超时、缺引擎、argv 错**永远不进入这条路径 ✓（`isRefutation:false`）。

---

## 14. 深度专题（缓存／复现／沙箱／队列／报告）

### 14.1 计算缓存（按内容哈希）⛔
- **目的**：同脚本＋同引擎＋同参数＋同输入 ⇒ 复用回执，省时间与预算；
- **现状** ✓：回执＋归档（含脚本哈希与**实际 argv**，可**比对**）；**没有命中即跳过的缓存** ⛔；
- **设计**：缓存键＝脚本哈希＋引擎身份（名＋版本）＋argv＋stdin＋精度/容差/种子参数；**身份全等**才可命中；损坏 ⇒ 具名码（回报列表）；
- **可调控**：`vmu.math.cache.*`（开关/上限/失效/是否允许跨项目复用）。

### 14.2 复现与确定性
- **现状**：默认不引入随机 ✓；**不记录种子** ⛔ ⇒ 含随机作业不可复现（最大缺口）；
- **设计**：显式随机必须带种子入回执；未声明种子的随机作业具名拒；确定性策略（线程数、排序、浮点环境、并行归约顺序）由 `vmu.math.repro.*` 声明；
- **复现包**（`ReproPack` ⛔）：脚本＋引擎版本＋依赖清单＋种子＋环境指纹＋回执引用；目标：在另一台机器上**一条命令**重放。

### 14.3 沙箱与资源限制
- **现状** ✓：受控目录、路径越界具名拒、输出 caps、单次超时、预算闸门、并发上限、**无网络**（设计前提）；
- **现状 ✗**：CPU 时间/内存/网络**无硬限制** ⛔；沙箱拒绝无独立码 ⛔；
- **设计**：`vmu.math.sandbox.*` 声明式限制（CPU/内存/墙钟/线程/网络/文件句柄），越限具名；**默认无网络**且不可被 pack 打开 ⛔（需内核闸门）。

### 14.4 作业队列、持久化与大结果
- **现状** ✓：Lean 队列（并发上限、状态、事件日志上限）；
- **现状 ✗**：持久化/断点续算 ⛔；**大结果存储与引用**（内容寻址令牌）⛔；跨会话作业列表 ⛔；
- **设计**：`vmu.math.jobs.*`（持久化目录/保留策略/恢复语义）；大结果一律落文件＋回执给引用，**审计不落全文** ✓（现状已如此）。

### 14.5 错误、警告与不收敛
- **现状** ✓：11 个 `MATH_*`、9 个 `VMU_LEAN_*`、通用闸门码；引擎 stderr 原样回显（含 argv 与 `mathEngineOverride` 提示）；商业引擎许可具名；
- **现状 ✗**：**不收敛**无独立分类 ⛔；数值警告无结构字段 ⛔；精度丢失无警告码 ⛔；
- **设计**：不收敛/精度丢失/量纲不符/假设冲突/缓存损坏各自具名（回报列表），并区分**警告**与**拒绝**。

### 14.6 报告模板
- **现状** ✓：回执 JSON＋可用性行（提示词注入用）＋归档目录；
- **现状 ✗**：结构化**计算报告**（问题/方法/参数/精度/容差/残差/收敛/复现指引）⛔；**Strang 风格**"问题—方法—验证—结论"模板 ⛔；
- **可调控**：`vmu.math.report.*`（语言、详略、是否附复现指引、是否附求解器日志摘要）。

### 14.7 预算与配额（现状 ✓）
- 时间/次数计入预算族；超限 ⇒ `VMU_RESOURCE_BUDGET`（具名，无副作用残留）；
- **建议**：族级配额（每族可用引擎/次数）在 pack 层声明 ⛔；内核只认总闸门 ✓。

---

### 14.8 引擎选择算法（确定性、可解释）
1. **候选集**：族要求的后端 ∩ 登记表 ∩ `vmu.math.engines` 顺序（已实现 ✓）；
2. **可用性**：`probe()` 逐候选；不可用 ⇒ 记**具名原因**（`MATH_ENGINE_NOT_FOUND`／`LICENSE_REQUIRED`／`UNUSABLE`）并继续 ✓；
3. **能力匹配**：候选是否声明该操作（现状：靠 argv 模板是否支持 ✓；⛔ 无能力声明表）；
4. **成本/预算**：超时与预算闸门 ✓（⛔ 无成本模型）；
5. **选定**：第一个通过者；**全无可选** ⇒ `VMU_ENGINE_UNAVAILABLE`（**不静默换 shell**，除非 mode 允许且结果带标记 ✓）；
6. **回执**：写明**实际选定**的引擎与 argv ✓（调用方无需猜）。

> 纪律：选择过程必须**可复现**（同输入同顺序）✓；任何"跳过某后端"的决定都要具名 ✓。

---

## 15. 可调控性总纲（替换 / 组合 / 扩展）

### 15.1 三层职责
| 层 | 决定什么 | 现状 |
|---|---|---|
| **settings**（`vmu.math.*` 通配族） | 引擎与优先级、超时、精度/容差、安装作用域、缓存/复现/沙箱/报告策略 | ✓ 已有 6＋8 个已实现键（见 09-§12）；⛔ 其余族待 04 卷登记 |
| **中间件** | 作业前后插入检查（预算/证据/残差/量纲）、改写 job/result、具名拒绝 | ✓ 机制可用（05 卷）；⛔ 数学族示例待写 |
| **pack** | 组织级策略：某阶段必须形式化、形式化权重、必须附复现包/证书 | ✓ 机制可用（10 卷）；⛔ 数学族 pack 待写 |

### 15.2 替换 / 组合矩阵（每族都能被这三层改）
| 想要的效果 | 层 | 做法（通配） | 现状 |
|---|---|---|---|
| 换后端（python→julia） | settings | 引擎顺序族／作业级引擎参数 | ✓ |
| 同族并列（化简 A、积分 B） | pack | 按操作分派不同引擎（`vmu.math.symbolic.*`） | ⛔ |
| 强制前置（先量纲检查） | 中间件 | `before` 插入量纲检查 | ⛔（检查器未实现） |
| 强制后置（必须给残差） | 中间件 | `after` 校验回执字段 | ⛔ |
| 要求误差界 | 中间件＋settings | 区间语义＋`vmu.math.interval.*` | ⛔ |
| 把"必须形式化"写进流程 | pack | 阶段策略（09-§5）＋`vmu.math.formal.*` | ✓ 机制／⛔ 族键 |
| 关闭外部进程 | settings＋中间件 | 清空引擎表／`before` 直接拒 ⇒ **具名降级** | ✓（不是假成功） |
| 只允许离线/无网络 | settings＋内核闸门 | `vmu.math.network.*`＋内核强制 | ⛔ |
| 加一个引擎/助手 | 代码扩展 | 适配器注册面（§16.3） | ⛔ |

### 15.3 扩展点与"不可关闭"清单
- **脚本/插件可扩展** ✓：脚本桥（`vibe_vmu_script`）调用外部工具并把结果**归档为回执**；
- **内核实名强制（任何 settings/pack 都不能关）** ✓：内容身份与回执字段、`isRefutation:false`、越界路径拒、输出 caps、结算唯一规则、预算具名拒；
- **需要代码的扩展** ⛔：新引擎适配器、新助手适配器、缓存后端、作业持久化后端、单位/量纲系统、沙箱强制器。

---

## 16. 成熟度、优先级与路线

### 16.1 成熟度总表
| 等级 | 含义 | 本卷条目 |
|---|---|---|
| **✓ 已实现** | 代码可核、有测试 | `math_computation` 4 op；8 个 P1 引擎与 argv 模板；回执＋归档＋保留警告；caps；超时/预算闸门；Lean 作业队列＋8 键；`classifyOutcome` 永不反驳；可用性行；越界拒 |
| **◐ 部分** | 靠引擎能力可用，族语义未建 | 数值、符号、统计、数值线代（分解/特征值/求解）、特殊函数 |
| **⛔ 未实现** | 仅设计 | 优化、离散、数论、几何、ODE/PDE、AD/张量、单位量纲、其它助手、证明质量检查、缓存、种子/复现包、CPU/内存/网络限制、作业持久化、大结果引用、不收敛分类、结构化报告 |

### 16.2 优先级建议
- **P0**：维持现状 ＋ **真机首跑**（一次真实计算/Lean 编译）＋ 回执/caps 的真机核验；
- **P1**：种子与复现、缓存、不收敛/精度丢失具名、单位与量纲、线代残差后置检查、符号/统计族语义；
- **P2**：优化、离散、几何、ODE、AD、其它助手适配、证明质量检查、报告模板；
- **P3**：张量、PGM、PDE、拓扑、随机/鲁棒优化、谱图论。

---

## 17. 与其它卷的接线
| 卷 | 关系 |
|---|---|
| 03 接口契约 | `math_computation` 参数与错误码登记；未实现能力一律 ⛔ |
| 04 设置 | 本卷所有通配族的**具体键名**由 04 卷落定（本卷只给族） |
| 05 中间件 | `before/after` 插入预算/证据/残差/量纲检查（机制 ✓，数学示例 ⛔） |
| 07 归档库 | `Computation/<id>/`（回执）与 `Shared/Formal/{Lib,Proved}/`（形式化） |
| 08 会议/表决 | 辩论与结题的布尔聚合在 08 卷；本卷只提供**可选证据**（计算回执/形式化身份） |
| 10 整合包 | "某阶段必须形式化""必须附证书/复现包"等组织策略 |
| 11 门禁 | 接缝纪律（I20 同族）、回执/身份/预算/结算规则的具名红 |
| 12 用户指南 | 面向用户的最小用法：探测→运行→取回执 |
| 13 迁移 | 从 v5r 的 `math_computation` 迁移：行为一致＋新增族 |
| 14 路线图 | 本卷 §18 未核项应并入 14 卷登记 |

---

## 18. 未核项
1. **真机首跑未做** ⛔：从未跑过一次真实计算/Lean 编译（负例一律由注入接缝制造）⇒ 8 个 P1 引擎的**真实可用性**未知；
2. **引擎版本敏感性**未核 ⛔：同脚本在不同版本下结果差异未测；
3. **caps 真实触发**未核 ⛔：64KB/64KB/4MB 在大输出下的行为未实测；
4. **归档保留上限**未核 ⛔：达到上限时的警告路径未实测；
5. **并发作业**未核 ⛔：并发上限 >1 的资源争用未测（默认串行）；
6. **种子与确定性**未实现 ⛔ ⇒ 含随机作业**不可复现**（最重要缺口）；
7. **不收敛/精度丢失/量纲不符/假设冲突**四类**无独立码** ⛔；
8. **缓存键设计**未定 ⛔（是否含宿主环境/引擎版本精度未决）；
9. **其它助手**未实现 ⛔，且"通过"判据必须逐助手显式声明（不得继承 Lean）；
10. **`sorry`/`admit` 检测**未实现 ⛔ ⇒ 当前**不得**把"编译通过"叙述为"命题已证明"；
11. **公理/依赖审计**未实现 ⛔；
12. **定理库检索**未实现 ⛔；
13. **单位与量纲**未实现 ⛔（设计：量纲一等值＋具名拒）；
14. **报告模板（Strang 风格）**未实现 ⛔；
15. **计划键名未登记** ⛔：本卷只用通配族，具体键由 04 卷在收到回报后落定；
16. **多助手交叉核对**未实现 ⛔：两个助手对同一命题给不同结果时的**处置策略**未定（是否阻塞结论？谁裁决？）；
17. **无网络强制**未实现 ⛔：需要内核级闸门，不能只靠 pack。

> **登记处**：本卷未核项与 09-§12、**14-§2** 互为索引；族级新增项在 task-37 回报中汇总。

---

## 19. 门禁建议（供 11 卷登记，全部可核）

> **验收判据（机器可判定 ✓）**：本卷每条"能力存在"的声明都必须能写成一条**断言** ⇒ 写不出的就是**未核项** ✗（转 §18 ✓）；违反即门禁**红** ✓；拒绝必须**具名**（`VMU_*` ＋ hint ✓）；每个族至少给一个可复现**场景**（引擎缺失／超时／不收敛／量纲不匹配 ✓）。
1. **回执完整**：每次执行必产回执，且含脚本哈希＋**实际 argv**＋退出码 ⇒ 缺一即红 ✓；
2. **身份一致**：回执哈希 ≡ 归档读面 ≡ 编译记录（三处一致）✓；
3. **缺席路径可注入**：空引擎根/空 PATH 下具名降级且不崩；**不得**依赖"本机没有 X" ✓；
4. **不假装成功**：无引擎时**绝不**返回成功态 ✓；
5. **结算唯一规则**：`passed` 只能由"退出 0 且哈希未变"产出（绕过即红）✓；
6. **失败≠反驳**：所有非 ok 结果的 `isRefutation` 必须为 false（含超时/argv/缺包/许可）✓；
7. **预算无残留**：超限拒绝后无副作用残留（无半成品归档）✓；
8. **caps 显式**：超限是显式截断（回执标出），不得静默丢 ✓；
9. **策略外置**：内核中不得出现"必须形式化/形式化权重"字样 ✓；
10. **族键不写死**：文档正文不得出现**计划**中的具体键名（只有通配）✓；
11. **聚合闸门**：被跳过的能力必须具名（"计划/未实现"⛔）而不是缺省成功 ✓。

---

## 20. 反模式（评审直接打回）
| 反模式 | 为什么错 | 正确做法 |
|---|---|---|
| 把"编译通过"当"命题已证明" | 未做 `sorry` 检测 ⛔ | 只能说"内核接受了该文件"；命题真伪另行判定 |
| 把计算结果当证明 | 计算≠真值（09-§8） | 计算只作证据/线索，须归档＋复核 |
| 把失败当反驳 | 缺引擎/超时/argv 错都不是数学结论 | `isRefutation:false`；具名降级 |
| 隐式假设 | "通常成立"会悄悄改变命题 | 假设显式入作业参数与回执 |
| 无种子随机 | 结果不可复现（R12） | 种子入回执；未声明即拒 ⛔ |
| 无残差线代 | "算出来"无从判断可信度 | 附残差/条件数 ⛔ |
| 无收敛报告 ODE | 数值解被当成解析结论 | 方法/步长/误差/不收敛原因 ⛔ |
| shell 兜底结果冒充归档结果 | 绕过回执与身份 | 带"未经工具归档"标记 ✓（已实现） |
| 用"本机没装"当测试前提 | 不可复现、掩盖真实缺陷 | 注入接缝制造缺席 ✓ |
| 在正文写死计划键名 | 冻结未定名、审计打回 | 只用通配，键名回报后由 04 卷落定 ✓ |

---

## 21. 附录

### 21.1 条目模板（新增族照此写）
```
名称 / 目的 / 接口形状（op 或工具名＋参数） / 可调控参数（通配） / 错误码 /
哲学关系（是否可能被误当证明） / 实现要点 / 依赖（引擎/适配器/宿主接缝） /
成熟度（✓|◐|⛔） / 优先级（P0–P3）
```

### 21.2 通配命名规约
- 计算族：`vmu.math.<族>.*`；子族再分级 `vmu.math.<族>.<子族>.*`；
- 工程族：`vmu.math.<cache|repro|precision|sandbox|jobs|report>.*`；
- 横向闸门：`vmu.budget.*`、`vmu.safety.*`；
- **禁止**正文写计划中的**具体**键名 ✗（只在回报里给）。

### 21.3 错误码规约
- 已实现：`MATH_*`（11 ✓）、`VMU_LEAN_*`（9 ✓）、`VMU_ENGINE_UNAVAILABLE`／`VMU_JOB_TIMEOUT`／`VMU_RESOURCE_BUDGET`／`VMU_NOT_PERMITTED`／`VMU_INVALID_ARGUMENT` ✓；
- 计划：按族登记（`VMU_MATH_<族>_*` ⛔、`VMU_FORMAL_<事由>` ⛔），具体码在 task-37 回报中列全后由 03 卷落定；
- **纪律**：警告与拒绝分开（保留上限只警告；类型/权限/预算必拒）。

### 21.4 术语
| 术语 | 含义 |
|---|---|
| 引擎（engine） | 计算后端（python/r/octave/julia/matlab/maple/wolfram/cli ✓；sage ⛔） |
| 适配器（adapter） | 统一 `probe/commandFor/submit/status/list/settle/keysUsed` 的接缝 |
| 回执（receipt） | 一次执行的 JSON 记录（脚本/哈希/argv/退出码/摘要）✓ |
| 结算（settle） | 判定作业"通过"的唯一动作（Lean：退出 0 且哈希未变）✓ |
| 缺陷（defect） | 工具链层面的失败（缺引擎/超时/argv 错），**不是**数学结论 ✓ |
| 反驳（refutation） | 只有"已证 ¬P"才算；计算线索不算 ✓ |
| 复现包（ReproPack） | 脚本＋版本＋依赖＋种子＋环境指纹 ⛔ |

### 21.5 标记词表
| 标记 | 含义 |
|---|---|
| ✓ | 已实现（代码可核、有测试） |
| ◐ | 部分：靠引擎能力可用，族语义/策略未建 |
| ⛔ | 未实现（仅设计；同行出现的能力/工具/协议名都是计划） |

### 21.6 键全表（**已实现 14 个**在此；**拟增全表见 09 附录 B**，两卷共用同一份登记）
| 键 | 类型 | 默认 | 现状 |
|---|---|---|---|
| `vmu.math.computation` | string | `auto` | ✓ |
| `vmu.math.mode` | string | `typed+shell` | ✓ |
| `vmu.math.engines` | string[] | 8 个 P1 引擎顺序 | ✓ |
| `vmu.math.timeoutMs` | integer | `60000` | ✓ |
| `vmu.math.packages` | string[] | `[]` | ✓ |
| `vmu.math.installScope` | string | `user` | ✓ |
| `vmu.math.leanCommand` | string | `lean` | ✓ |
| `vmu.math.leanArgs` | string[] | 内置模板 | ✓ |
| `vmu.math.leanTimeoutMs` | integer | 宿主接线 | ✓ |
| `vmu.math.leanAsync` | boolean | `true` | ✓ |
| `vmu.math.leanInitiative` | string | `normal` | ✓ |
| `vmu.math.leanSearchPaths` | string[] | `[]` | ✓ |
| `vmu.math.leanJobsMaxParallel` | integer | `1` | ✓ |
| `vmu.math.compileTimeoutMs` | integer | 未消费 | ✓ 接线／⛔ 消费 |

**拟增键族（具体键名与类型/默认/域见 09 附录 B）**：`vmu.math.precision.*`、`vmu.math.interval.*`、`vmu.math.numeric.warnings`、`vmu.math.symbolic.*`、`vmu.math.stats.*`、`vmu.math.bayes.*`、`vmu.math.optim.*`、`vmu.math.discrete.*`、`vmu.math.nt.*`、`vmu.math.geom.*`、`vmu.math.linalg.*`、`vmu.math.ode.*`、`vmu.math.convergence.*`、`vmu.math.ad.*`、`vmu.math.tensor.*`、`vmu.math.units.*`、`vmu.math.formal.*`、`vmu.math.jobs.*`、`vmu.math.cache.*`、`vmu.math.repro.*`、`vmu.math.sandbox.*`、`vmu.math.artifacts.*`、`vmu.math.report.*` ⛔。

### 21.7 错误码（**已实现全表**在此；**拟增码表见 09 附录 C**）
| 族 | 码 | 现状 |
|---|---|---|
| 计算面（共享模块 11 个） | `MATH_NOT_AVAILABLE`、`MATH_ENGINE_NOT_FOUND`、`MATH_ENGINE_LICENSE_REQUIRED`、`MATH_ENGINE_UNUSABLE`、`MATH_MISSING_PACKAGES`、`MATH_TIMEOUT`、`MATH_NONZERO_EXIT`、`MATH_ENGINE_BAD_ARGV`、`MATH_REFUSED`、`MATH_INVALID_ARGUMENT`、`MATH_NO_SUBPROCESS` | ✓ |
| vmu 归类 | `VMU_ENGINE_UNAVAILABLE` | ✓ |
| Lean 面（9 个） | `VMU_LEAN_NOT_FOUND`、`VMU_LEAN_EXIT_NONZERO`、`VMU_LEAN_TIMEOUT`、`VMU_LEAN_SPAWN_FAILED`、`VMU_LEAN_FILE_REQUIRED`、`VMU_LEAN_FILE_UNREADABLE`、`VMU_LEAN_STATEMENT_REQUIRED`、`VMU_LEAN_HASH_CHANGED`、`VMU_LEAN_NOT_SETTLED` | ✓ |
| 通用闸门 | `VMU_RESOURCE_BUDGET`、`VMU_NOT_PERMITTED`、`VMU_INVALID_ARGUMENT`、`VMU_JOB_TIMEOUT` | ✓ |
| 警告常量（非错误码） | `ARCHIVE_RETENTION_EXCEEDED`、`SCRIPT_CHANGED_SINCE_LAST_RECEIPT`、`SCRIPT_CHANGED_DURING_RUN` | ✓ |

### 21.8 工具 / 服务 / 协议 / 适配器清单（含 ✓✗）
| 类别 | 名称 | 现状 |
|---|---|---|
| 工具 | `math_computation`（op：`run`／`probe`／`install`／`receipt`） | ✓ |
| 工具 | `vibe_vmu_script`（脚本桥，可调外部工具并归档回执）／`vibe_vmu_set`／`vibe_vmu_middleware`／`vibe_vmu_pack`／`vibe_vmu_status`／`vibe_vmu_records`／`vibe_vmu_task`／`vibe_vmu_meeting`／`vibe_vmu_control` | ✓ |
| 工具（计划） | `vibe_vmu_math` ⛔、`vibe_vmu_math_job` ⛔、`vibe_vmu_math_cache` ⛔、`vibe_vmu_formal` ⛔、`vibe_vmu_formal_search` ⛔、`vibe_vmu_units` ⛔ | ⛔ |
| 内核服务 | `kernel/math.js`（`createMathSurface`／`classifyOutcome`／`settled`）、`kernel/lean.js`（`createLeanFace`）、`host-math.js`、共享 `math-computation.js`／`math-engines.js` | ✓ |
| 内核服务（计划） | `kernel/math-backends` ⛔、`kernel/formal-adapters` ⛔、`kernel/math-cache` ⛔、`kernel/math-jobs` ⛔、`kernel/units` ⛔、`kernel/math-report` ⛔ | ⛔ |
| 协议/形状 | `MathJob` ✓、`Receipt` ✓、`LeanJob` ✓、`EngineAdapter`（compute 面＝引擎表 ✓） | ✓ |
| 协议/形状（计划） | `FormalAdapter` ⛔、`ReproPack` ⛔、`ConvReport` ⛔、`DimValue` ⛔、`CacheEntry` ⛔、`EngineCapability` ⛔ | ⛔ |
| 引擎适配器 | P1：`python`／`r`／`octave`／`julia`／`matlab`／`maple`／`wolfram`／`cli` | ✓ |
| 引擎适配器 | P2：`sage` | ⛔（已登记、未进 P1 顺序） |
| 引擎适配器（计划） | `sympy` ⛔、`maxima` ⛔、`gap` ⛔、`pari/gp` ⛔、`numpy` ⛔、`scipy` ⛔、`statsmodels` ⛔、`pandas` ⛔、`pymc` ⛔、`stan` ⛔、`cvxpy` ⛔、`highs` ⛔、`ortools` ⛔、`networkx` ⛔、`igraph` ⛔、`shapely` ⛔、`sundials` ⛔、`jax` ⛔、`pytorch` ⛔、`tensorflow` ⛔、`unitful` ⛔、`astropy.units` ⛔、`pint` ⛔、`codata` ⛔ | ⛔ |
| 助手适配器 | `lean` | ✓ |
| 助手适配器（计划） | `coq`/`rocq` ⛔、`isabelle` ⛔、`agda` ⛔、`metamath` ⛔ | ⛔ |
