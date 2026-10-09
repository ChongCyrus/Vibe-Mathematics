# vmu 11 · 开发与门禁（Development & Gates）

> 状态：**草案 v0.1**
> 上位：`01-philosophy.md`（R13 门禁即文档 / R12 可复现 / R14 无屎山）、`00-README.md` §4/§6
> 一句话：**每一句"我们做到了"，都必须能指向一条会变红的检查** ✗✓。

---

## 1. 门禁的六类（缺一类就不算覆盖）

| 类型 | 手段 | 典型对象 | 红的标准 |
|---|---|---|---|
| **S 静态门** | 读源码/清单文本断言形状与登记一致性 | 命名、登记完整性、零策略词表、模块规模、schema 单一源 | 断言失败 ⇒ 具名打印**哪一条**违反 |
| **B 行为场景** | mock 宿主驱动真实插件 | 会议/表决/归档/预算/中间件/控制流 | 场景退出码非 0 且**带具名失败行** |
| **M 变异族** | 对源码做**单点变异**，要求场景**按名变红** | 每条机制至少 1 个反向变异 | `no named red` / `HANG` / `anchor x0` 均算失败 |
| **C 语料快照** | 逐字快照（提示词/回显/文档计数） | 提示词管线、状态面、README 计数 | 漂移未显式更新 ⇒ 红 |
| **T 契约门** | 公共面一致性（03 ↔ 实现 ↔ 文档） | 服务/工具/钩子/耐久键/错误码 | 悬空引用、未登记符号 ⇒ 红 |
| **E 端到端** | 真机/宿主内验收 | 安装、预设装载、GUI 可选 | 未通过 ⇒ 记为 NON-RESULT（不得当通过） |

---

## 2. R1..R15 ↔ 门禁 双向映射（**必须无空缺**）

| 要求 | 门禁（草案 id） | 怎么红 |
|---|---|---|
| **R1 内核零策略** | `S-zpolicy` | 内核源码出现代际/角色/机制专名（词表见 §4）⇒ 红；且"完成判据/门槛"硬编码 ⇒ 红 |
| **R2 能力与挂点齐备** | `T-surface` ＋ `B-cap-*` | 六域能力/钩子缺登记 ⇒ 红；每域"可用"与"可挂"场景缺一 ⇒ 红 |
| **R3 四可** | `S-schema` ＋ `B-set-*` ＋ `C-status` | 有键无 schema／无回显／无热改场景／无审计 ⇒ 红 |
| **R4 设置单一源** | `S-schema` ＋ `C-docgen` | 未声明键被读 ⇒ 红；参数表与 schema 不一致 ⇒ 红 |
| **R5 中间件四形态** | `B-mw-{rules,module,script,plugin}` ＋ `M-mw-*` | 任一形态缺示例/缺变异族 ⇒ 红 |
| **R6 钩子契约化** | `T-hooks` | 代码钩子点 ↔ 05 表 ↔ 03 索引 三处不一致 ⇒ 红 |
| **R7 稳定内部接口** | `S-api` ＋ `T-surface` | 上层引用内核私有符号 ⇒ 红；公开服务缺 `apiVersion` ⇒ 红 |
| **R8 提示词可管理** | `C-corpus` ＋ `B-prompt-*` | 快照漂移未声明／绑定与覆盖无场景 ⇒ 红 |
| **R9 归档与记忆** | `B-lib-*` | 指纹/悬空拒/分轨/截断计数 任一缺 ⇒ 红 |
| **R10 耐久可信** | `B-store-*` ＋ `S-nolog` | 并发丢写／迁移失败仍启动／**写会话日志** ⇒ 红 |
| **R11 可观测** | `C-status` ＋ `B-refuse-*` | 拒绝不带具名原因／状态面缺字段 ⇒ 红 |
| **R12 可复现** | `B-determinism` | 同 seed 两次不一致 ⇒ 红 |
| **R13 门禁即文档** | 本表自身（`S-map`） | 本表出现空缺／悬空门禁 id ⇒ 红 |
| **R14 无屎山** | `S-size` ＋ `S-import` | 单文件超限／跨模块私访／循环依赖 ⇒ 红 |
| **R15 可迁移** | `B-parity-v5r` ＋ `C-parity-report` | 对照未跑／差异未分类 ⇒ 红 |

---

## 3. 每篇文档的验收判据索引（与 00-§3 联动）

| 文档 | 它承诺什么 | 对应门禁 |
|---|---|---|
| 03 接口契约 | 公开面 = 实现 = 文档 | `T-surface`、`S-api`、`S-map` |
| 04 设置 | 四可 ＋ 单一源 | `S-schema`、`B-set-*`、`C-docgen` |
| 05 中间件 | 四形态 ＋ 钩子契约 ＋ 失败语义 | `T-hooks`、`B-mw-*`、`M-mw-*` |
| 06 提示词 | 段/绑定/覆盖/快照 | `C-corpus`、`B-prompt-*` |
| 07 耐久归档 | 不丢写、可恢复、指纹、截断计数 | `B-store-*`、`B-lib-*` |
| 08 原语 | 零策略 ＋ 判定点可接管 ＋ 拒绝不污染 | `S-zpolicy`、`B-meeting-*` |
| 09 数学形式化 | 缺席降级、身份一致、编译失败≠否定 | `B-math-*` |
| 10 整合包 | 装载/冲突/对照/接线 | `B-pack-*`、`B-parity-v5r` |

---

## 4. "零策略"词表（`S-zpolicy`；草案，待裁 O5）

- **代际词**：`v5r`、`v5`、`v4`、`v3`、`v2`、`vibe-math-vN`（出现在**内核**目录即红；出现在 `packs/**` 则正常）；
- **角色专名**：`院士`、`academician`、`研究员`、`临时工`、`temp`；
- **机制专名**：`求真表决`、`冻结期`、`论文`、`纪要`、`复议`、`附议`…
- **例外机制**：内核契约里**允许**出现的**通用词**（`member`/`role slot`/`ballot`/`meeting`/`stage`/`record`…）；
- **词表维护**：新增限制**必须**同时更新本文与 `S-zpolicy` 的例外清单，否则误报/漏报。

---

## 4.1 环境接缝（Seam）门禁（**新增硬要求**，源于 2026-10-09 实测）

**事实**：本机 **LaTeX 在 `D:\texlive\2025\bin\windows\`、Lean 在 `D:\.elan\bin\`，均在 PATH 上**；而仓库测试里那条 `★ no LaTeX on this host` 之所以存在，是因为**运行器用 `V*_TEX_ROOTS_SANDBOX` 把引擎根 pin 成空**（并另有 I20 门要求"每个探测点都受该接缝管辖"＋对应变异族）。

**⇒ vmu 的三条硬要求**
1. **一切外部能力（引擎/PATH/版本/编译/网络/时钟/随机）都必须经可注入接缝**；产品代码**不得**直接读 `PATH`/`env` 下判定（必须先过接缝）；
2. **"存在"与"缺席"两条路径都必须能在任意机器上确定性复现**（注入假引擎 / 注空根）；
3. **接缝本身要门禁**：探测点绕过接缝 ⇒ 红；并给"绕过 ⇒ 不能再 pin 出缺席态"的变异族（照抄 I20 做法）。

**上报口径纪律**（本轮实测踩到）：`★ … on this host` 一类断言在 **runner 里**（有沙箱）与**直接单跑脚本时**（无沙箱）结果相反 ⇒ 报告必须写明**隔离跑/全量跑**与**是否带沙箱接缝**，否则会把"环境差异"误报成"产品缺陷" ✗✓。

---

## 5. 复用本仓既有基础设施（**已按 B′ 实测校准**）

### 5.1 计数口径（**先分清两套，别混** ✗✓）

| 口径 | 来源 | 实测值 |
|---|---|---|
| `derived.*`＝**作业计数** | `node tests/run-tests.mjs --counts` | **`total 107 / suites 45 / probes 62`** |
| `shipped.*`＝**文件计数** | `package.json#files` 里 `tests/*.mjs` 的行数 | **`total 71 / suites 18 / probes 53`** |

**107 的推导链（逐行可核）**：`deriveJobs()` 是唯一来源（`tests/run-tests.mjs:668`）⇒ **只扫 `tests/` 顶层不递归**（`:669`）⇒ 排除 3 类（runner 自身／`NEEDS_ARGS`＝`audit-tool-exec.mjs`／`replaceBare`＝`audit-registration.mjs`，`:680`）⇒ `101 − 3 = 98` 裸作业 ＋ `VARIANTS` **9 条**（`:683-692`，**kind 一律 probe**，注释点名"按文件名分类会把 suites 灌水"）⇒ **98+9=107**；`.test.mjs` 裸作业 45 = suites；`107−45=62` = probes ✓。
**注意**：`tests/helpers/doc-counts-format.mjs:6-7` 有 VOCABULARY 警告；`scripts/update-doc-counts.mjs:56-65` 只**整行重写 4 处**（两个 README、`docs/test-timing.md`、`docs/AUDIT-CHECKLIST.md`）✓。

### 5.2 可原样复用的**通用基础设施** ✓

| 资产 | 规模 | 为何通用 |
|---|---|---|
| `tests/run-tests.mjs` | 978 行 | 并行 runner（LPT 调度、gate scope、增量/全量、HEADSTART、`--counts`/`--self-check`）；**与预设代数完全解耦**（文件名约定＋目录扫描） |
| `tests/run-tests.mutants.mjs` | 5.5 KB | 对 runner 自身的变异族（证明其判红能力） |
| `tests/helpers/doc-counts-format.mjs` | 41 行 | **单一定义**所有计数句子（writer/guard/mutant 三方共用） |
| `tests/helpers/math-computation-fake-seam.mjs` | 167 行 | **假宿主接缝范本**：不装任何引擎也能驱动全分支 ⇒ **正对应 §4.1 的接缝要求** ✓ |
| `audit-package-membership`／`audit-path-discipline`／`audit-artifact-docs`／`audit-status-report-fields`／`audit-engine-faces` | 57 行／5 KB／7 KB／9.3 KB／298 行 | 机制级守卫（包成员资格、路径纪律、产物文档、status/report 字段、真引擎三面＋`SKIP` 不算红）⇒ **模式直接照抄** |
| 28 个 `*.mutants.mjs`（实测） | — | "具名单点变异 ＋ 要求守卫变红"的**范式**可复用（内容需重写） |

**预设接线专用守卫（每次加预设都要跑，7 个）** ✗✓：`audit-preset-rows.test.mjs`、`audit-preset-declaration-group.test.mjs`、`audit-preset-mechanism.test.mjs`、`audit-installer-compat.test.mjs`、`audit-installer-policy.test.mjs`、`audit-installer-assertions.mutants.mjs`、`audit-readme-counts.mjs`。

### 5.3 必须**重建**的（与具体代强耦合）✗

- 全部 `*-v5*`／`*-v4*`／`e2e-v*`／`formal-verify-v*`／`math-computation-v*`：**断言的是某代源码的具体文本与行号** ⇒ 内容重写（例：`e2e-v5-round2` 218 KB、`selfdrive-v5`＋mutants 285 KB、`v5-institute-fixes.mutants` 118 KB）；
- **`tests/audit-v5-integrity.mjs` 的双重身份陷阱** ✗✓：前半是 **v5** 的通用静态自检，文末 `:1448-1449` 起却是**只对 v5r 生效的 R10/S4–S15 门禁**（读 `v5rRaw` 逐条正则）。**要复用 v5r 的不变量，必须把这 900+ 行门禁一起搬走**，否则会**静默丢掉**所有"由门禁锁死"的不变量。

### 5.4 其它复用 ✓
| 资产 | 用法 |
|---|---|
| mock 宿主 harness（`selfdrive-v5.mjs` 模式） | **照抄结构**（mock `subagents`/`tools`/`systemPrompt`） |
| 语料快照 `prompt-corpus-*/` | 新建 `prompt-corpus-vmu/`（或**显式**复用，见 10-§6 第 9 步） |
| `scripts/update-doc-counts.mjs` ＋ `audit-readme-counts.mjs`(＋mutants) | **直接复用** |
| `audit-v5-integrity.mjs --self-probe` 范式 | **照抄**：门禁自身要有唯一点变异自证 |
| `scripts/release-check.mjs`、`docs/release-playbook.md` | 复用并扩展 vmu 步骤 |

---

## 6. 纪律（沿用本仓已验证的硬规矩，全部保留）

1. **未验证的改动不得留在树里**；**红树不得提交**；**红树不得写基线**；
2. **门禁期间不写文件**（D-1）；
3. **一律 `*> 文件` 再筛**（`| Select-Object -First N` 会截断管道并提前杀子进程 ⇒ `exit=-1` 是截断不是失败）；
4. **内容锚点优先**（编辑后行号失效）；
5. **同一文件多片串行**（派单前先查写者）；
6. **报告必须写明"隔离跑/全量跑"**；
7. **未亲见标未核**；**注释里不要写会被门禁计数的代码字面量**（本仓实测两次踩坑 ✗）；
8. **具名红**：任何失败必须能说出"哪条断言、期望什么、实际什么"；
9. **行号口径（新，2026-10-09 实测）**：`vibe-math-v5r.js` 是**纯 LF**（实测 `LF=11597 CR=0 CRLF=0`，真实 11,597 行）✗，而 PowerShell `Get-Content` 报 **11,269** 行、且**越往后偏差越大**（例：`registerTool('vibe_v5_record_method')` 真实 **11155** vs Get-Content 口径 **10827**，差 328）⇒ **禁止用 `Get-Content`/`Select-String` 抓行号**；一律用 **`ReadAllLines` 口径或 ripgrep（本 agent 的 grep/read 工具）**，并在文档里注明口径 ✓。
10. **能力接缝纪律**（见 §4.1）：外部能力探测必须可注入；**不得**用"本机有没有 X"当测试前提 ✓。

---

## 7. 发布门禁（Release Gate）

```
node tests/run-tests.mjs --counts          # 作业/套件/探针计数
GATE_RELEASE=1 node tests/run-tests.mjs    # 全量非增量（红树拒绝写基线）
node scripts/update-doc-counts.mjs --check # 文档计数一致
node tests/audit-v5-integrity.mjs --self-probe   # 门禁自证（每条门都有唯一点变异）
node scripts/release-check.mjs             # 发布前清单
```
**出口条件**：以上全绿 ＋ 本表 `§2` 无空缺 ＋ 变更日志/文档同步 ＋（若有 pack）对照报告已生成并分类。

---

## 8. 未核项

- **官方验证的完整清单**已抽成 G1–G13（来自 C′ 对 `references/verification.md` 的提炼）；其中"**无浏览器控制时的上限**"（只允许 JS 语法 ＋ manifest 校验 ＋ 活 Client slot 注册）是**文档级**逐字结论 ✓；
- **Client 侧活读数未核**（本机 `Slots.listSubTree` 超时）⇒ GUI 相关门禁暂缺，见 14-§1（O2）；
- **`app.asar` 直读不可用**（本 agent `read` 工具 BigInt 缺陷）⇒ 读官方材料需自写 asar 解析＋SHA256 校验，见 14-§3（R-5）。
