# vmu 09 · 数学 · 形式化 · 计算（Math · Formalization · Computation）

> 状态：**草案 v0.1**
> 上位：`01-philosophy.md`（R2 能力齐备 / R1 零策略 / R11 具名拒绝）、`02-architecture.md`（内核 G 分区）
> 立场：内核提供**计算/形式化能力与适配器接口**；**"何时要求形式化、什么算证明、要不要编译、超时多少"全部由 settings/中间件/pack 决定**。
> 复用：本仓已有共享模块 `math-computation.js` 与 `docs/math-computation.md`（v2–v5r 共用）⇒ vmu **优先复用**（B′ 侦察会给判决表）。

---

## 1. 三个能力面（互不替代）

| 面 | 是什么 | 不是什么 |
|---|---|---|
| **计算面** | 数值/符号计算、脚本化求解、单位与精度约定 | 不是"判定真值"的手段（计算结果≠证明） |
| **形式化面** | Lean（或其它证明助手）的归档、复用、按名取原文、编译结果 | 不是"必须使用"的强制（是否要求＝策略） |
| **进程面** | 子进程/终端/外部引擎（sympy、sage、lean、latex…）的受控封装 | 不是无限制 shell（受预算与路径策略约束） |

---

## 2. 适配器模型（能力可插拔）

```js
// 适配器接口（提案）
interface EngineAdapter {
  name: string                     // 'lean' | 'sympy' | 'cli' | 'internal' | …
  kind: 'formal' | 'compute' | 'process'
  probe(): Promise<{ available: boolean; version?: string; reason?: string }>   // 起不来要给**具名原因**
  run(job: MathJob, ctx: JobCtx): Promise<MathJobResult>
  cancel(jobId: string): Promise<void>
}
```
- **注册表**：`vmu.math.engines[]`（顺序＝优先级）；内核只按注册顺序探测与调用；
- **可用性探测**：启动与按需探测；**缺席不是灾难**，而是**具名降级**（如 `VMU_LEAN_NOT_FOUND` ＋ 建议）；
- **默认零引擎**：不配置引擎 ⇒ 计算面"存在但不可用"，且**明确告知**（不许假装成功）。

### 2.1 能力探测必须是**可注入的接缝（seam）**（本仓实测教训，硬要求）

**事实**（2026-10-09 实测）：本机 **LaTeX 在 `D:\texlive\2025\bin\windows\`、Lean 在 `D:\.elan\bin\`，两者都在 PATH 上**。
但仓库测试里长期存在一条 `★ no LaTeX on this host` 断言 ⇒ 它**不是**环境缺失，而是**运行器故意 pin 空引擎根**：

- `tests/run-tests.mjs` 设 `V*_TEX_ROOTS_SANDBOX=<空根>`；相关套件同样 pin（注释逐字：*"the documented TeX Live roots are sandboxed too (the product's own list now covers D:/C:/texlive)"*）；
- 且有**专门门禁**（`audit-prompt-invariants.mjs` 的 I20）要求：**每个"已知安装探测点"都必须受该 env 接缝管辖**，并配"忽略该接缝 ⇒ 不再能 pin 出 not-detected"的变异族。

**⇒ vmu 的设计要求（写入门禁）**
1. **一切能力探测都可注入**：引擎探测、PATH 扫描、版本读取、编译执行 —— 全部经**可替换的探测器接口**；测试**不依赖本机装没装**；
2. **两条路径都必须可确定性测试**：`存在`（注入假引擎/假 PATH）与`缺席`（注入空根）**都能**在任意机器上跑出；
3. **不得**用"本机没有 X"当作测试前提；缺失路径必须由**配置/注入**制造（R12 可复现）；
4. **接缝本身要门禁**：探测点若绕过接缝 ⇒ 红（照抄 I20 的做法）；并给"绕过即不再能 pin"的变异族。

---

## 3. 内容身份（形式化面的关键纪律，源自 v5r/PR#16）

- **单一哈希来源**：复用既有 `sha256`（**不另造指纹**）；归档记录携带 `{name, file, kind, sha256, summary}`；
- **读面只读回、绝不重算**（避免读写不一致）；
- **代码正文不进"头部列表"**（目录只给身份；正文按名取回）；
- **撤回/失效要清空 sha256**（否则"内容身份"骗人）；且**级联影响要显式声明**（v5r 只记录不联动，vmu 要求**写明策略**）；
- **写一律走 fold 内函数式变更**（否则同 tick 覆盖会抹掉刚写入的 sha256 —— 本仓实测过）。

---

## 4. 作业（Jobs）与预算

`MathJob = { id, kind, engine, input, timeoutMs, budget?, async?, createdAt, state, result?, error? }`
- **同步/异步**：编译类默认异步（可配）；异步必须可查询状态与取消；
- **预算**：每个作业计入 `vmu.budget`（时间/次数）；超限 ⇒ **具名拒**（`VMU_RESOURCE_BUDGET`）＋ 建议；
- **隔离**：作业在受控目录内运行；路径策略与写保护由 `vmu.safety.*` 决定；
- **审计**：作业起止、命令摘要、结果摘要入审计（**不落全文**，正文放文件）。

---

## 5. 判定点（策略全部外置）

| 判定点 | 内核默认 | 典型 pack/中间件用法 |
|---|---|---|
| `math.require-formalization` | 不要求 | pack 决定"某阶段必须形式化" |
| `math.accept-as-proof` | 只承认"已归档且编译通过"的结论 | 允许/禁止非形式化证明（人证）作为依据 |
| `math.compile-policy` | 不自动编译 | 自动编译＋失败重试 N 次＋失败算"形式化缺陷"而非"否定" |
| `math.engine-choice` | 按注册顺序 | 指定引擎、按成本选择、禁某引擎 |
| `math.on-unavailable` | 具名降级并继续 | 阻塞、换引擎、上报 |
| `math.timeout-policy` | 用作业级 timeout | 全局上限、分级超时 |

---

## 6. 具名拒绝与错误码（登记进 03-§8）

`VMU_LEAN_NOT_FOUND`（无工具链）、`VMU_LEAN_COMPILE_FAILED`（编译失败，**不是否定**）、`VMU_ENGINE_UNAVAILABLE`、`VMU_JOB_TIMEOUT`、`VMU_JOB_CANCELLED`、`VMU_MATH_INVALID_INPUT`、`VMU_RESOURCE_BUDGET`（共用）。
**纪律**：编译失败必须**与"命题为假"区分**（沿用 v5r 的"形式化缺陷非反驳"纪律）。

---

## 7. 与归档/论文/表决的接线

- 形式化归档路径与只读面：`Shared/Formal/{Lib,Proved}/`（公开布局，见 07-§6 扩展）；
- **表决用形式化权重**由中间件决定（内核不内置"形式化更高权重"）；
- **论文阶段**可要求"每条结论带出处 id ＋（可选）形式化身份"⇒ 由 `settle/before` 钩子检查（08-§4.2）。

---

## 8. 门禁（本篇验收判据）

1. **缺席路径**：**由注入制造**（pin 空引擎根/空 PATH），而不是依赖机器：全部相关工具**具名降级**且不崩 ✓；
   *（本机实测 LaTeX=D:\texlive、Lean=D:\.elan 均在 PATH ⇒ **绝不能**用"本机没有"当负例前提 ✗；见 §2.1）*
2. **身份一致**：归档回执的 `sha256` ≡ 读面看到的 ≡ 编译记录（三处一致）；
3. **函数式变更**：同 tick 两次归档不互相覆盖（并发门禁）；
4. **编译失败 ≠ 否定**：断言文案与结论字段都区分（具名红）；
5. **预算**：超限 ⇒ 具名拒 且 无副作用残留；
6. **可复现**：同输入两次作业结果一致（除显式时间/随机）；
7. **策略外置**：内核中找不到"必须形式化""形式化权重"等字样（R1 静态门）。

---

## 9. 未核项

- **数学计算面已接入真机（2026-10-09 ✓）**：`host-math.js` 把宿主接缝（`register/params/projectRoot/writeText/readText/exists/listDir/resolveExecutable/spawn/log` ✓）接到共享模块 ✓ ⇒ **6 个 `vmu.math.*` 键**（`computation`／`mode`／`engines`／`timeoutMs`／`packages`／`installScope` ✓）经 `host.params()` 真正生效 ✓；出现条件＝声明 `math: true` 或任一 `vmu.math.*` ✓（零机制 ✓）。路径逃逸**具名拒** ✓（`VMU_NOT_PERMITTED` ✓）。
- **本机工具链的真实运行仍未实测** ✗：vmu 侧从未跑过一次真实编译/证明 ✓（负例一律由**注入接缝**制造 ✓，见 §2.1 ✓）；且**真实计算依赖子进程服务** ✗（M3 真机 NON-RESULT ⇒ 目标机上的 provider 内部报错 ✓，见 11-§9.6 ✓）⇒ 本机 `probe` 可跑、**真实 run 待该缺陷解决** ✓。
- **8 个 `vmu.math.lean*` 键仍未接线** ✗（`formalVerify`／`leanCommand`／`leanArgs`／`leanTimeoutMs`／`leanAsync`／`leanInitiative`／`leanSearchPaths`／`leanJobsMaxParallel` ＋ `compileTimeoutMs` ✓）：Lean 面在 vmu 里**只有适配器与 `settled()` 规则**（R-b ✓），**没有**编译/作业队列 ✗ ⇒ 04 §11 的"接线"列已逐键标注 ✓。
- **Lean 侧复用细节未核**：v5r 的 `sha256Hex` 是**自实现**（非复用 DSH 能力）⇒ vmu 是否沿用待定；
- **引擎适配器的能力边界**（哪些计算必须走内部模块 vs 外部进程）未定；
- **作业持久化**（异步作业跨重启）语义未定。

> **未核登记处**：以上各项已并入 **14-§2（U1–U12）** 与 **14-§1（O1–O7，均已裁定为 D13）** ✓。
