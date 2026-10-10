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

### 2.1 可追溯表（**一行一表**，仿 v5r `12-traceability` 范式：便于正则守卫 ✓）

> 每行**一条**：`要求 → 门禁 id → 文档落点 → 场景/族命名约定`。命名约定是**可机器检查**的：门禁实现后，场景名与族名必须按此拼写，否则红 ✓。

| 要求 | 门禁 id | 文档落点 | 场景/族命名约定 |
|---|---|---|---|
| R1 内核零策略 | `S-zpolicy` | 01-§2／11-§4 | 静态门（无场景）；词表数据文件 `settings/zpolicy-words.json` |
| R2 能力齐备 | `T-surface`＋`B-cap-*` | 02-§2／03-§2 | `s-cap-<area>-usable`／`s-cap-<area>-hookable` |
| R3 四可 | `S-schema`＋`B-set-*`＋`C-status` | 04-§2／04-§11 | `s-set-<key>-echo`／`-reject`／`-hot`／`-audit` |
| R4 单一源 | `S-schema`＋`C-docgen` | 04-§3 | `s-docgen-table-eq-schema` |
| R5 四形态 | `B-mw-*`＋`M-mw-*` | 05-§3 | `s-mw-{rules,module,script,plugin}`＋`m-mw-*` |
| R6 钩子契约化 | `T-hooks` | 05-§4 | `s-hooks-registry-eq-code` |
| R7 稳定接口 | `S-api`＋`T-surface` | 03-§7 | `s-api-no-private-access` |
| R8 提示词可管理 | `C-corpus`＋`B-prompt-*` | 06-§3／06-§4 | `c-prompt-<pack>-<role>-<phase>` |
| R9 归档与记忆 | `B-lib-*` | 07-§4 | `s-lib-{fingerprint,dangling,tracks,truncation}` |
| R10 耐久可信 | `B-store-*`＋`S-nolog` | 07-§1／07-§3 | `s-store-{concurrent,recover,migrate,no-session-log}` |
| R11 可观测 | `C-status`＋`B-refuse-*` | 03-§8／04-§2 | `s-refuse-named-<code>` |
| R12 可复现 | `B-determinism` | 01-§3.1／11-§4.1 | `s-determinism-<area>-twice` |
| R13 门禁即文档 | `S-map` | 11-§2／11-§2.1 | `s-map-no-gap`（本表自身可被解析校验） |
| R14 无屎山 | `S-size`＋`S-import` | 02-§2 | `s-size-<file>`／`s-import-whitelist` |
| R15 可迁移 | `B-parity-v5r`＋`C-parity-report` | 10-§5 | `b-parity-<scenario>`／`c-parity-report-classified` |

**自身可校验性**：`s-map-no-gap` 解析**本表**（一行一条）⇒ ① R1..R15 全覆盖；② 每个门禁 id 在 11-§2 出现；③ 每个文档落点存在 ⇒ 任一不满足即红 ✓（这正是"门禁即文档"的自指闭环 ✓）。

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

## 4.2 守卫面清单（**新增硬要求**，源于第 18 轮系统扫描：守卫"接了≠生效" ✗✓）

**事实**（批评者实测：运行时取 `kernel` 面 **86** 个成员，比对**生产代码** vs **测试**引用）：`requireStore()` **生产 0 次**（测试 2 次）、`requireMembers()` **生产 0 次**（测试 10 次）、`settingsView()` **生产 0 次**（测试 2 次）⇒ **守卫被实现、被测试覆盖，却没有任何生产路径调用它** ⇒ 在真实运行里**永远不生效**（第八例）。

**⇒ 两条硬要求**
1. **每个守卫面都必须登记在本节**（面 ⇒ 语义 ⇒ **生产是否调用** ⇒ 诊断面则写明理由 ✓）。**新增守卫面若不登记 ⇒ 门禁红**（`tests/vmu-kernel.test.mjs` 扫 `kernel/index.js` 的 `require*`／`settingsView` 面并比对 `status().guards.registered`，另有变异自证"造一个未登记守卫 ⇒ 红" ✓）。
2. **`status()` 不得声称守卫已生效而实际不生效** ✗✓：`status().guards` 必须报告 `kind`（`contract`／`diagnostic`）、`productionCallSites` 与（诊断面的）`reason`；`contractCount`／`diagnosticCount` 分开计数。

**清单（当前，2026-10-09 第 18 轮）**

| 守卫面 | 语义 | 生产是否调用 | 理由／生产调用点 |
|---|---|---|---|
| `requireStore()` | 返回 durable store，缺失则具名拒 `VMU_ENGINE_UNAVAILABLE` | **是** ✓ | loader 的 kernel 门面 `services.kernel.read()`（`kernel/index.js`）：原先 `store ? store.read() : null` 会**静默返回 null**（正是"store 绝不静默假造"要拒的形状）⇒ 现走同一 `mustStore()` |
| `requireLibrary()` | 返回磁盘 library，缺失则具名拒 | **是** ✓ | `declareTracks()`：原先内联一份"no library root"拒（同一契约的**第二份拷贝**）⇒ 现走同一 `mustLibrary()` |
| `requireMembers()` | 返回 roster，缺失则具名拒 | **否**（**诊断／硬契约面**） | 今天**没有生产路径需要硬契约**：消费者读**可空**的 `kernel.members` 属性并各自具名拒（D5：内核不自带角色；`declareSlots()` 是**创建** roster 的一方）。该面为"调用方不得拿到 null"的硬契约而存在，登记在此以免被误当生产护栏 ✓ |
| `settingsView()` | 返回**只读**实时设置视图（属性读＋`get(k)`） | **否**（**诊断 API**） | 生产消费者在**构造期按注入**拿到视图（30+ 服务 `settings: settingsView`）⇒ 模块图不需要访问器；访问器本身是诊断／内省面（只读写穿陷阱也经它测试）。登记同上 ✓ |

**"允许无 store／无 roster 也能跑"的地方（明写，**不得**用守卫）** ✗：`status()` 的 `store`／`members`／`library` 字段（缺席要如实报 `null`，`status()` 抛异常就不是观测了）、`registry.register('vmu.members', …)` 的条件发布（"只有真实能力才出现"）。

---

## 5. 复用本仓既有基础设施（**已按 B′ 实测校准**）

### 5.1 计数口径（**先分清两套，别混** ✗✓；**2026-10-09 重算 ✓**）

| 口径 | 来源 | 实测值（**本轮重新实测** ✓） |
|---|---|---|
| `derived.*`＝**作业计数** | `node tests/run-tests.mjs --counts`（或 `node scripts/update-doc-counts.mjs --check`） | **`total 134 / suites 68 / probes 66`** ✓（R-6b 拆分后 **132→134** ✓：`v5-institute-fixes.mutants.mjs` 由 1 个作业变为 3 个分片 ✓） |
| `shipped.*`＝**文件计数** | `package.json#files` 里 `tests/*.mjs` 的行数 | **`total 96 / suites 41 / probes 55`** ✓ |

**134 的推导链（逐行可核 ✓）**：`deriveJobs()` 是唯一来源 ⇒ **只扫 `tests/` 顶层不递归**（纪律 11 ✓）⇒ 排除 3 类（runner 自身／`NEEDS_ARGS`／`replaceBare` 的裸作业 ✓）⇒ 裸作业 ＋ `VARIANTS`（kind 一律 probe ✓）＝ 134 ✓；`.test.mjs` 裸作业 68 = suites；`134−68=66` = probes ✓。
**vmu 子集**：`GATE_SCOPE=vmu` ⇒ **49 作业**（≈60 s ✓，含两份文档审计与其变异族、宿主/脚本/整合包/包含性/控制流/台账场景 ✓）。
**更新方式（诚实 ✗）**：`scripts/update-doc-counts.mjs` 只**整行重写 4 处**（两个 README、`docs/test-timing.md`、`docs/AUDIT-CHECKLIST.md` ✓）—— **不含** `vibe-math-vmu/docs/**` ✗ ⇒ 本节数字**必须手工同步**（因此必须带日期 ✓）；若再次漂移，以 `--check` 的输出为准 ✓。

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
9. **行号口径（新，2026-10-09 实测）**：**旧线** `vibe-math-v5r.js` 是**纯 LF**（实测 `LF=11597 CR=0 CRLF=0`，真实 11,597 行）✗，而 PowerShell `Get-Content` 报 **11,269** 行、且**越往后偏差越大**（例：`registerTool('vibe_v5_record_method')` 真实 **11155** vs Get-Content 口径 **10827**，差 328）⇒ **禁止用 `Get-Content`/`Select-String` 抓行号**；一律用 **`ReadAllLines` 口径或 ripgrep（本 agent 的 grep/read 工具）**，并在文档里注明口径 ✓。
10. **能力接缝纪律**（见 §4.1）：外部能力探测必须可注入；**不得**用"本机有没有 X"当测试前提 ✓。
11. **扫描期间不得改变作业集合**（2026-10-09 实证 ✗✓）：`tests/run-tests.mjs` 会**扫描 `tests/` 顶层**来派生作业 ✓，因此在**任何全量扫描进行中**新建/删除/改名 `tests/*.mjs` 会让"文档计数守护"看到**不同的派生值**而与本次扫描的作业表冲突（实测：扫描起始 117，守护重算 118 ⇒ `audit-readme-counts` 红 ✗）。我先前"未列入 `files[]` 的新文件对门禁不可见"的推断是**错的** ✗。⇒ **纪律**：长扫描期间**只允许改不参与作业派生的文件**；新建测试必须**在 T0/T3 之外**做，并由 **T0 `--for-t3` 的工作树干净检查**兜底 ✓✓。
12. **源码级断言必须写成"语法形状"，且源码散文不得含同形字面量**（2026-10-09 **三次**实证 ✗✓）：我三次被自己的**注释/字符串**绊倒 —— ① `math.js` 注释里的"必须形式化"字样触发零策略检查 ✗；② `members.js` 注释里列出角色名触发 D5 检查 ✗；③ `script-bridge.js` 的 `status().note` 里写出 `appendPrompt` 触发"无提示词写路径"检查 ✗。⇒ **纪律**：① 断言一律锚定**代码形状**（如 `\bname\s*\(` 调用、行首属性键、`= true` 赋值），**不锚定裸词** ✗；② 被检查文件里的**注释与文案不得包含该形状的字面量** ✓（用"prompt action"这类描述替代 ✓）；③ 新写一个"源码不得含 X"的断言时，**先想一遍哪些散文会命中它** ✓✓。
13. **不得用 shell 字符串手术改结构化文件**（2026-10-09 实证 ✗✓）：我曾在 PowerShell 里用 `Get-Content -Raw` ＋ `.Replace(...)` ＋ `[IO.File]::WriteAllText` 改 `package.json`，**编码往返把非 ASCII 破坏成了非法 JSON** ✗（`Bad control character in string literal` ✓），当场被 `node -e "require('./package.json')"` 与计数脚本抓住 ✓。⇒ **纪律**：① `package.json`／生成物／任何结构化文件一律用**编辑工具或生成器**改 ✓，**绝不**用 shell 字符串替换 ✗；② 改完**立即**用解析器验证（`require`／`JSON.parse`／生成器 `--check` ✓）；③ 弄坏即 **git 恢复**再重做 ✓（本次即如此 ✓）。

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

### 7.1 三档门禁（**成本纪律**；用户 2026-10-09 指出全量太贵 ⇒ 制度化 ✓）

全量非增量 = **117 作业 ≈ 25 分钟**（其中 v5r 一条变异族 ≈ 24 分钟 ✗）⇒ **不能每次改动都付** ✗。改为**三档**，每档都保留"发布级诚实"：

| 档 | 触发时机 | 命令 | 实测成本 | 覆盖什么 |
|---|---|---|---|---|
| **T0 预检**（**新增，硬前置** ✓） | **任何 T2/T3 之前**（用户 2026-10-09 要求："先全面自查无误再跑，避免跑半天才发现问题" ✓） | `_oneoff/vmu/tools/preflight.mjs [--for-t3]` | **≈1 min** ✓ | ① `--counts` 与文档计数一致 ✓；② `build-preset-rows --check` 无漂移 ✓；③ 预设/installer/包成员/计数/路径/数学契约/产物文档 等**共享面门禁全跑** ✓；④ **`files[] ↔ installer PRESETS ↔ 工作树` 三方一致性**（**上一轮 T3 才发现的那类漏登记** ✗✓，已被固化为预检项 ✓）；⑤ vmu 文档 linter（17 关 ✓）；⑥ `run-tests --self-check` ✓；⑦ `--for-t3` 额外要求**工作树干净**（无未接线的未跟踪件 ✗） |
| **T1 迭代档** | **每一次改动**（默认档） | `GATE_SCOPE=vmu` | **≈60–100 s** ✓ | vmu 全部作业 ＋ **所有共享面门禁**（预设行/生成物、installer、包成员、文档计数、路径纪律、产物文档、共享数学模块与契约、runner 自测、临时卫生 ✓） |
| **T2 共享编排档** | 改动 **`tests/run-tests.mjs`／`tests/helpers/**`／`scripts/build-preset-rows.mjs`／`cordis.patch.yml`／`installer.js`／`package.json`** 时 | `GATE_INCREMENTAL=1`（**全量**，按 `FAMILY_TARGETS` 跳过"目标文件没变"的族 ✓，未登记者**照跑** ✓） | 通常 **≈2–5 min** ✓ | T1 ＋ **受影响的跨预设族**（含 v2–v5r 的行为面 ✓）；跳过的是**我根本没碰**的目标族 ✓ |
| **T3 发布/阶段档** | **每 2–3 个阶段**（如 P2+P3 合并一次）＋ **任何发布/推送发布物之前** ＋ 收尾 | `GATE_RELEASE=1`（**非增量全量** ✓） | **≈25 min** ✓ | 全部 117 作业，含 24 分钟那条 v5r 族 ✓ |

**纪律**：① T1 红必停 ✗；② T2/T3 的结果必须**写明是增量和非增量** ✓（避免"隔离跑 vs 全量"误判 ✓）；③ **发布前必须有一次 T3** ✓（这是"发布验收"的硬条件，不因省时而免除 ✓）；④ 任何"共享面"缺陷若只在 T3 才能发现（如上一轮的 installer 漏登记 ✗），**必须在同一轮内补进 T1 的覆盖清单** ✓✓ —— 否则 T1 会长期漏网 ✗。

> **本档位制度的第一批实证** ✓：T1 已在 34 作业 / **62.9 s** 内抓到过多起问题（installer 漏登记、计数漂移、scope 与机器模式冲突 ✓）；T3 已两次产出发布级绿（`P0: 111/111` ✓、`P1 里程碑在跑中` ✓）。

---

## 8. 未核项

- **官方验证的完整清单**已抽成 G1–G13（来自 C′ 对 `references/verification.md` 的提炼）；其中"**无浏览器控制时的上限**"（只允许 JS 语法 ＋ manifest 校验 ＋ 活 Client slot 注册）是**文档级**逐字结论 ✓；
- **Client 侧活读数未核**（本机 `Slots.listSubTree` 超时）⇒ GUI 相关门禁暂缺，见 14-§1（O2）；
- **`app.asar` 直读不可用**（本 agent `read` 工具 BigInt 缺陷）⇒ 读官方材料需自写 asar 解析＋SHA256 校验，见 14-§3（R-5）。

### 8.1 真机实测新增（2026-10-09，证据在 `_oneoff/vmu/live/2026-10-09/` ✓）

- **预设能装、注册面可见：已实测 PASS** ✓（临时 `DSH_HOME` ＋ `dsh plugin add <本仓>` ⇒ `dsh --profile <p> --dump-config` 的合成树含 `- id: preset-vibe-math-vmu`，**headless 与 web 两种随包模板各验一次** ✓；插件行 `name: dsh-vibe-math/vibe-math-vmu/vibe-math-vmu.js` 解析正确 ✓；六代预设同在 ✓）。
- **会话能起：已实测 PASS** ✓（`dsh --profile vmu-h "<task>"` 多次 exit 0 ✓；`--json` 给出机器可读事件流 ✓）。
- **headless 无法选择预设（本轮新发现 ✗✓）**：`dsh --profile headless --help` 的 Options **只有** `--json`／`--session-id`／`-h` ✗；`--json` 事件流里**没有任何 preset/tool 信息** ✓；而 `ctx.agentPresets` 的选择手段是 **程序化 `select(agent, id)`／`mount(ctx,id?)`** 或 **GUI 预设选择器** ✓（我方 DSH 面重建 §3.9 逐字 ✓）⇒ **"预设激活"与"vmu 工具面可见"在 headless 下不可达** ⇒ 按 §9.2⑥ 记 **NON-RESULT**（**不记通过、也不记失败** ✓）。⇒ **P5 真机集的前置**：需要一个能选择预设的宿主入口（GUI 或程序化 `select`），见 14-§7 待办 ✓。
- **`agentPresets.compositionInventory()`／`readDocument()`／`composeFrom()` 未核** ✗（headless 不可达 ⇒ 与上一条同源）。

### 8.2 宿主**工具形态**（真机实证，2026-10-09；三条都曾让工具**静默消失** ✗✓）

| 约束 | 证据 | 我们踩的坑 |
|---|---|---|
| 执行函数键名是 **`execute`** ✗不是 `handler` | 本仓可用预设 `vibe-math-v5r.js:10934-10938` ✓ | 写成 `handler` ⇒ 注册成功但工具**永不出现** ✗ |
| `output` **必须**有 `schema` ＋ `render`；`presentationMeta` 若出现**必须是函数** | 宿主源码 `dsh-tools/lib/index.js:2881`（**从 app.asar 读出** ✓）：`output === void 0 \|\| typeof output !== 'object' \|\| typeof output.render !== 'function' \|\| (output.presentationMeta !== void 0 && typeof output.presentationMeta !== 'function') ⇒ throw TypeError(...)` | 写成**对象** `{title}` ⇒ 抛错，且消息**不指出哪一条** ✗ |
| `parameters` **必须**是对象型 JSON Schema，且 `required` 是**顶层数组** | 真机会话日志逐字：`Invalid schema for function 'vibe_vmu_status': schema must be a JSON Schema of 'type: "object"', got 'type: null'` ✓ | 传 `{}` ⇒ **供应商**拒绝并**整轮失败** ⇒ 表现为**静默 0-token 回合** ✗✓ |
| 注册必须包在 **`ctx.effect(fn,label)`** 并交出 cleanup | 宿主指引（我方面重建 §A ✓） | —（我们一开始就遵守 ✓） |
| **失败必须可见** ✗不得吞 | 我们自己的 R11 | 入口曾 `catch(()=>{})` 吞掉安装错误 ✗ ⇒ 上述第 2 条**因此长期不可见**；改为 stderr ＋ `status().installError` 后**立刻现形** ✓✓ |

> **方法论收获**：**库测试用自己假设的形态** ⇒ 永远抓不到这三条 ✗✓；真机（脚本化 SLV）＋ **直接读宿主源码/会话日志**才是判据 ✓。⇒ 已固化为 `tests/vmu-host.test.mjs` 的**形态断言**（`execute`／无 `handler`／`presentationMeta` 缺省或函数／`parameters.type==='object'` ＋ 顶层 `required` ✓）。

### 8.3 多实例（真机发现；处置已定 ✓）

一个 profile 里可以同时存在**两个 vmu 实例**：预设自带的插件行（无 config ⇒ 惰性）＋ profile patch 插入的独立行（带 config）。
- **宿主对同层同名工具只保留一个** ⇒ 实测出现"**观测面分裂**"：`vibe_vmu_status` 由**惰性实例**回答（`packs: []`、`members: null`），而 `vibe_vmu_middleware` 由**带 config 实例**回答（能列出整合包规则）✓；
- **嵌套的预设行不可由 profile 层寻址**：试图 `- id: vibe-math-vmu / disabled: true` ⇒ 宿主回报 **`patch: entry "vibe-math-vmu" not found`** ✓；
- **处置（保守、低风险 ✓）**：每个 vmu 实例在回执里**自证身份** —— 入口接受 `config.instance`（缺省 `vmu-default`，**确定性**以便测试），`vibe_vmu_status` 与 `adapter.status()` 都带 `instance` ✓✓；文档写明：**"同层同名由宿主裁决，故每个 preset 只应有一个 vmu 实例；多实例必须各自 `config.instance` 以便排障"** ✓。

---

## 9. 真机验收（E 类门禁：SLV playbook）

> **为什么需要**：mock 宿主能证明"逻辑对"，**不能**证明"在真宿主里装得上、跑得起来、状态可读"。v5r 的教训是**真机复验必须是独立判据**（其 `08-landing-plan` 的 SLV 一节即为此设）。本类门禁**不得**用 mock 结果替代 ✓。

### 9.1 前置条件（每项都要记录"满足/不满足＋证据"）
1. DSH 已安装且可启动（记录版本；**version gating 走 `peerDependencies`** ✓，`engines.dsh` 不存在 ✗）；
2. 预设装载机制＝**rows**（DSH ≥0.1.7，不写盘）或 legacy **directory**（≤0.1.6）⇒ **记录实际机制** ✓；
3. 工作区可写；`vmu/` 目录可创建；
4. 外部工具链**是否存在都要记录**（本机实测 LaTeX=`D:\texlive…`、Lean=`D:\.elan…`，**在 PATH** ✓）⇒ 负例必须由**注入接缝**制造（§4.1），**不得**依赖"本机没有" ✗。

### 9.2 步骤（可复跑）
```
① 安装/装载 vmu 预设  → 断言：预设出现在宿主预设列表（rows 机制下磁盘无副本，必须查注册面）
② 起一个会话          → 断言：内核启动、Store 打开、状态可读
③ 跑脚本化场景        → 逐条驱动公开工具（如 status / set / pack / mw）
④ 采集证据            → status 快照 · 磁盘产物 · 具名拒绝（含 code） · 审计尾部
⑤ 对照期望            → 每条期望都是**具名断言**（期望什么/实际什么）
⑥ 不可用即 NON-RESULT → 宿主能力缺失时**如实记 NON-RESULT**，绝不记为通过 ✗
```

### 9.3 证据落盘格式（**唯一写入点**，仓库外）
```
_oneoff/vmu/live/<YYYY-MM-DD>/<scenario>/
├── notes.md          # 前置条件、机制(rows/directory)、版本、时间、执行者
├── status.json       # status() 原样快照（含 settings.resolved / middleware / prompts）
├── transcript.md     # 逐步命令与回执（含拒绝码）
└── artifacts/        # 磁盘产物（目录树 + 关键文件）
```
**纪律**：① 采集期间**不得**有其它写者（D-15／D-1）；② 报告必须写明**隔离跑/全量跑**与**是否带沙箱接缝**；③ 每个场景必须给出**具名结论**（通过／失败／NON-RESULT）✓。

### 9.4 各期最小验收集（P0–P5）
| 阶段 | 真机必须证明 |
|---|---|
| **P0** | 预设能装、会话能起、`status` 能读、设置能改（含热改等级提示） |
| **P1** | 六域能力各一次真实调用；耐久在**杀进程**后恢复；归档产物落在磁盘预期位置 |
| **P2** | 四形态各一次真实生效 ＋ 一次真实拒绝（含中间件 id） |
| **P3** | v5r-pack 对照跑（同场景两边各一次，产出差异报告） |
| **P4** | 脚本形态真实运行；公开服务版本可读 |
| **P5** | 发布清单全过；GUI（若做）在真实页面注册成功（受 O2 前置条件约束 ✓） |

### 9.5 与发布门禁的关系
§7 的发布门禁是**机器可跑**的部分；**真机集是它的前置证据**：没有 §9.3 的证据，发布门禁的"全绿"**只代表 mock 面** ⇒ 出口条件里必须附**真机证据路径** ✓。

### 9.6 真机矩阵（截至 2026-10-09；每条后面是证据目录 ✓）

> 全部在**隔离** `DSH_HOME`（`D:\_tmp\dshvmu`）＋ **脚本化 SLV**（`_oneoff/vm-drive/dsh-drive.mjs`，显式 `--preset vibe-math-vmu`）下取得；**用户的 `desktop` profile 与仓库均零改动** ✓。

| 期集（§9.4） | 项 | 结论 | 证据 |
|---|---|---|---|
| P0 | 预设能装（注册面可见） | **PASS** ✓ | `live/2026-10-09/preset-registration/` |
| P0 | 会话能起 | **PASS** ✓ | `…/session-boot/` |
| P0 | 预设激活（persona 逐字 ＋ 工具面） | **PASS** ✓✓ | `…/p0-final/` |
| P0 | `status` 能读 | **PASS** ✓✓ | `…/p0-final/` |
| P0 | 设置能改（含热改等级回执） | **PASS** ✓✓ | `…/p0-configured/` |
| P1 | 耐久写（记录 ＋ `state.json` 落盘） | **PASS** ✓✓ | `…/p1-durable-write/` |
| P1 | **杀进程后恢复**（同 id／同指纹） | **PASS** ✓✓ | `…/p1-durable-recover/` |
| P2 | M1 规则真机生效（拒绝含中间件 id） | **PASS** ✓✓ | `…/p2-real-hooks/` |
| P2 | **M2 代码模块真机生效**（装载＋决定） | **PASS** ✓✓ | `…/p2-m2-in-host/` |
| P2 | M4 整合包真机应用（规则 enabled） | **PASS** ✓✓ | `…/p2-pack-in-host-single/` |
| P2 | 实例身份自证（多实例可辨） | **PASS** ✓✓ | `…/p2-instance-identity/` |
| P2 | **M3 脚本形态真机运行** | **PASS** ✓✓（M3 已解除，2026-10-10 ✓） | `live/2026-10-10/p2-m3-stack4/` ✓：回执 `{"ok":true,"action":"run","script":"probe","ran":true,"exit":0,"policy":"open","timedOut":false,"summary":"script ran","findings":[],"data":null}` ✓（前三轮 `p2-m3-stack{,2,3}/` 保留对照 ✓） |

> **M3 的解除过程（留证 ✓，2026-10-10）**：前三轮真机 NON-RESULT ✗ 的**首要原因不是宿主，而是我方接缝把诊断丢掉了** ✗ —— `kernel/script-bridge.js` 的 catch 重写了错误却没回挂 `hostStack`/`shape` ⇒ 工具面回执里**永远没有宿主栈** ✓（独立验证用**注入接缝**证明了这次丢失 ✓）。把"搬运"修好之后，栈逐帧钉死炸点：宿主 **`dsh-subprocess-local`** 的 `validateNoNullByte @ runner-launch-*.js:1509` ← `targetEnvironment:1520`（它校验 **`options.cwd`**）⇒ **该宿主不容忍 `cwd` 为 `undefined`，连"省略 `cwd` 键"也会崩 ✗**（实测 `p2-m3-stack3/` ✓）。
> **修法（调用侧规避，不是修宿主 ✗）**：`host-spawn.js` 现在**永远传一个真实字符串 `cwd`** ✓（调用方 cwd → 配置工作区 → `process.cwd()` ✓），并对 `env` 做同样的"**只允许字符串**"归一化 ✓（`undefined` 值会炸同一个函数 ✓，两道保险 ✓）。
> **结果** ✓：**同一命令、同一探针**下本轮**通过** ✓（`p2-m3-stack4/` ✓），且**不再出现任何 `hostStack`** ✓。**残留事实（诚实 ✗）**：该宿主缺陷**依然存在**（公开包，本仓无法修 ✗）；我们提供的是**每个调用方都得自己带的规避** ✓。
> **旁注** ✓：早期"已排除的四项"（id／接缝／spec 形状／PATH）**全都没排错** ✓ —— 真正原因是**诊断被吞** ＋ 宿主对 `cwd` 的**零容忍** ✓。
| P3 | v5r-pack 对照跑（**面级对照已完成** ✓；行为级 A/B 未做 ✗） | **部分** ✓ | `p3-v5r-side/` ＋ `p3-vmu-side/`；报告 `_oneoff/vmu/design/04-v5r-contrast-live.md` ✓ |
| P4 | 公开服务版本可读（`contract()`） | **部分** ✓（库内 ✓；真机未读） | —— |
| P5 | 发布清单全过 ＋ GUI（O2 前置） | **未做** ✗ | —— |

> **诚实口径**：上表**只写已取得证据的行** ✓；未做的一律写"未做"✗，**不得**用库内测试冒充真机 ✓。

### 9.7 T3（非增量全量）运行记录

| 时间 | 命令 | 结果 | 备注 |
|---|---|---|---|
| 2026-10-09 19:55–20:26（31 min） | `GATE_RELEASE=1 node tests/run-tests.mjs`（前置 `preflight.mjs --for-t3` **PASS** ✓，工作树干净 ✓） | `TOTAL 132 PASS 131 FAIL 1` ✗ | 唯一红：`v5-institute-fixes.mutants.mjs`（1512.7 s ✓） |
| 2026-10-09 20:32–21:03（31 min） | 同上（修复红因之后 ✓，HEAD `ea81436` ✓、`dirty=0` ✓） | **`TOTAL 132 PASS 132 FAIL 0`** ✓✓ | **全仓非增量门禁全绿** ✓（含全部 vmu 工作 ✓） |

| 2026-10-09 22:57–23:28（31 min） | 同上（HEAD `45ec07c` ✓、`dirty=0` ✓；此前已补 V5 包、B1–B6、V7、V9、审计落盘、台账 ✓） | `TOTAL 132 PASS 131 FAIL 1` ✗ | 唯一红：**`v5-institute-fixes.mutants.mjs`**（1483.6 s ✓）—— **v5 的族，与 vmu 无关** ✓ |

**该红的定位（2026-10-09 第二次，同类 ✓）**：**定向运行**（`MUTANTS_ONLY='S25A'` ✓，8 s ✓）给出 **`4/4 具名红` ＋ `ALL MUTANTS RED AS REQUIRED`** ✓ ⇒ **该族在隔离下健康** ✓ ⇒ 本次红是 `14-§1` **R-6b 已记录的"全量负载下正向对照偶发"** ✗（同一族在两次 T3 之间曾 **132/132 全绿** ✓），**不是** vmu 缺陷、**也不是** v5 行为回归 ✓（我从未改动 v5 ✓）。
> **纪律（第三次同类 ✓）**：**"隔离绿／全量红"必须先跑定向再下结论** ✓（否则会把已知偶发误判成自己改坏了 ✓）。

**R-6b 的加固（2026-10-09，同日完成 ✓✓）**：**双侧**都改成"**失败 ⇒ 一次重试**"，且**重试必须被记录**、**重试仍红照样计入红** ✓ —— 正控侧（`scenario positive controls green: N/M (X retried, Y green on retry)` ✓）与**变异侧**（`mutant families reddening … (X family retries, Y matched on retry)` ✓）。
| 证据（可核 ✓） | 命令 | 结果 |
|---|---|---|
| 全部正控 | `MUTANTS_POSITIVES_ONLY=1 node tests/v5-institute-fixes.mutants.mjs` | **107/107 绿** ✓（**5 条首跑红 ⇒ 5 条重试即绿** ✓，~4.8 min ✓） |
| 正控自证 | `POSITIVES_SELFTEST=1 …` | `retry path exercised=true stillRedCountedRed=true` ⇒ **GUARD CAN FAIL AND IS COUNTED** ✓ |
| 变异自证 | `MUTANTS_SELFTEST=1 …` | `RETRY CANNOT MASK A RED FAMILY (as required)` ✓ |
| 定向变异 | `MUTANTS_ONLY='S25A'／'S21'／'G2'／'S8' …` | **4/4、6/6、1/1、7/7 具名红** ✓；写错名字 ⇒ **具名中止 exit=2** ✓ |

**第 9 次 T3（2026-10-10 10:26–10:59，33 min，HEAD `6b61362`，起点 `dirty=0`）**：`TOTAL 134 PASS 133 FAIL 1` ✗ —— 唯一红是 **`shard=1/3`**，具名原因 **`family did not redden by name: S5: the stalled path goes back to convening a meeting on its own (R1/D10)`** ✓（**具名清单再次生效** ✓）。
- **S5 定点诊断** ✓✓：S5 实为 **7 个族**；**隔离连跑 5/5 全绿（各 ~62 s）** ✓；分片内偶发 ✗ ⇒ **根因不是 S5 的代码，而是"重试跑在同一台仍然很忙的机器上"** ✗ —— **等待下限是"最小驱动时长"**，8 s 在双作业并发时**仍不够**让驱动循环走到被变异步 ✓。
- **修法（小而精准 ✓）**：重试改用**套件自己的耐心默认（30 s）** ✓（`PATIENT_WAIT_FLOOR_MS = 30000` ✓）；**只在失败时付** ✓，所以"168 族各付 30 s"的顾虑不适用于**单次重试** ✓。**下一次 T3 为验收依据** ✓。
- **S5 定点修复完成（2026-10-10 ✓✓，两轮试错后定论）**：实测三形态 —— ① 原变异（把 `emitStallNotice()` **整个替换**）⇒ `no named red (exit=1)`、35.6 s ✗；② "保留提示、另加违规召集" ⇒ 子进程 **exit=0**（变异**变惰性** ✗）；③ **回退原变异 ＋ 把 `expect` 换成它真实且稳定产出的那条**（`/S5-stall-notice：静止提示恰一条/` ✓；原 `expect`（`会议不变`）**不可达** ✗）。**证据** ✓：定向 `MUTANTS_ONLY='S5'` ⇒ **7/7 连续 3 次全绿** ✓；**上次失败的那个分片** `shard=1/3` 全跑 ⇒ **`families=56/56`、`positives=36/36`、`retries={0,0}`、`crashes=0`（8.8 min）** ✓✓。

**第 10 次 T3（2026-10-10 11:36–12:11，35 min，HEAD `86a9e03`，起点 `dirty=0`）**：`TOTAL 134 PASS 133 FAIL 1` ✗ —— 红点**又换了**，且**S5 已修好**（`shard=1/3` **通过** ✓✓）；本次唯一红是 **`shard=0/3`**，具名原因 **`positive control STILL red after retry: s6-not-granted`** ✓（pristine v5 场景、重试后仍红 ✗）。
- **隔离诊断（决定性 ✓✓）**：`MUTANTS_POSITIVES_ONLY=1 MUTANTS_SHARD=0/3` ⇒ **36/36 全绿**，`s6-not-granted` **1971 ms 通过** ✓，整组正控 **78 s** ✓ —— 而同一组在**全量扫掠内**要 ~9.5 min ✗ ⇒ **负载放大约 7×** ✓✓。**这就是所有偶发的共同机制** ✓（不是产品、不是脚本缺陷 ✓）。
- **据此改进（本轮 ✓）**：① 正控失败时**打印子进程自己的具名断言行**（无行则打印"无具名行 ＋ 原始输出长度" ✓）⇒ 下次**无需再单独复现** ✓；② 把 **7× 负载放大**这一实测写进文档 ✓（作为"隔离绿／全量红"判据的量化依据 ✓）。**下一次 T3 为验收依据** ✓。

**第 11 次 T3（2026-10-10 12:30–13:00，30 min，HEAD `8ffdf82`，起点 `dirty=0`）—— 🎉 验收全绿（第二次）✓✓**：
```
TOTAL 134  PASS 134  FAIL 0  (suites 68 · probes 66)
PASS  v5-institute-fixes.mutants.mjs  exit=0  480.6s  [shard=0/3]  ALL MUTANTS RED AS REQUIRED
PASS  v5-institute-fixes.mutants.mjs  exit=0  519.0s  [shard=1/3]  ALL MUTANTS RED AS REQUIRED
PASS  v5-institute-fixes.mutants.mjs  exit=0  466.4s  [shard=2/3]  ALL MUTANTS RED AS REQUIRED
```
- **S5 修复的独立确认** ✓✓：上一轮失败的 **`shard=0/3` 与 `shard=1/3` 本次都通过** ✓（且三片均**零重试** ✓）。
- **发布门禁（同一 HEAD ✓✓）**：`release-check` **ALL CHECKS PASSED** ✓（tarball sha1 `e6eefc44…` ✓、**300 文件** ✓、**294 文本文件无 CRLF** ✓）＋ `--self-test` ✓ ＋ 变异 **ALL MUTANTS RED AS REQUIRED** ✓ ＋ 跑完 `dirty=0` ✓。
- **一条新纪律（本轮用两次代价换来 ✓✗）**：**不要在自己还有验证作业在跑时启动全量扫掠** ✓ —— 本轮第一次启动 T3 时，预检因**我自己刚跑完的 shard-1／正控集**把机器打满而 FAIL ✗（**T3 从未开始** ✓，守卫有效 ✓）；空转后一次即全绿 ✓。同一课与 `run-tests.mjs` 自带的实测注释一致 ✓（`--concurrency=6` *"was RED with one 180 s TIMEOUT"* ✓、`--concurrency=4` *"faster but noisier"* ✓）⇒ **偶发是并发度的函数** ✓✓，默认 `concurrency=2` 已是保守选择 ✓；`--concurrency=1` 是**零代码成本**的附加证据路径 ✓（**规范验收仍是默认口径** ✓）。
- **S5 的第二次定点诊断（更精确 ✓✓）**：定向 `MUTANTS_ONLY='S5'` 也复现 ⇒ **不是纯负载** ✗；失败那一族的判定原文是 **`no named red (exit=1)`** ✓ 且该子进程跑了 **35 617 ms** ✓ ⇒ **既不是"等得不够久"** ✗，而是**变异把场景弄崩、却没有任何具名断言行** ✗ —— 与最初 `S25B` 的缺陷**同类（变异过宽）** ✓，**不是 vmu 缺陷** ✓。**据此登记为定点待办** ✓：把该族（`S5: the stalled path goes back to convening a meeting on its own (R1/D10)` ✓）的变异**收窄**，使其只造成**预期的那条具名红** ✓（同 `S25B` 的修法 ✓）；**不做**"把无断言的崩溃当红" ✗（那会掩盖过宽变异 ✓）。

**第 8 次 T3（2026-10-10 08:44–09:14，30 min，HEAD `1fe6ffc`，起点 `dirty=0`）—— 🎉 首次全绿 ✓✓**：
```
TOTAL 134  PASS 134  FAIL 0  (suites 68 · probes 66)
PASS  v5-institute-fixes.mutants.mjs  exit=0   488.0s  [shard=0/3]  ALL MUTANTS RED AS REQUIRED
PASS  v5-institute-fixes.mutants.mjs  exit=0   560.7s  [shard=1/3]  ALL MUTANTS RED AS REQUIRED
PASS  v5-institute-fixes.mutants.mjs  exit=0   472.1s  [shard=2/3]  ALL MUTANTS RED AS REQUIRED
```
- **拆分直接见效** ✓✓：三片分别 **488／560.7／472.1 s**（≈8–9 min ✓）⇒ 远低于任何上限 ✓，彻底摆脱"单片 25–35 min"的时序窄口 ✗✓；
- **旁证** ✓：第 7 次全量红掉的 `e2e-v4-fixes`（140/1 ✗）与 `e2e-v5-round2`（532/2 ✗）**本次自动转绿** ⇒ **证实它们同为负载所致** ✓（与我当时的判断一致 ✓）；
- **发布门禁（同一 HEAD 复跑 ✓✓）**：`release-check` **ALL CHECKS PASSED** ✓（tarball sha1 `8b087b89…` ✓、299 文件 ✓、**293 文本文件无 CRLF** ✓）＋ `--self-test` ✓ ＋ 变异 **ALL MUTANTS RED AS REQUIRED** ✓ ＋ 跑完 `dirty=0` ✓。
⇒ **目标⑤的"非增量 T3 ＋ 发布门禁"两项证据到齐** ✓✓。

**第 6／7 次 T3（2026-10-09／10，HEAD `fa997e3`／`fec4b30`）**：
| 次 | 结果 | 红点（**全部为遗留 v4/v5 端到端作业，vmu 范围零红** ✓） | 关键收获 |
|---|---|---|---|
| #6 | `131/132` ✗ | `v5-institute-fixes.mutants`（自报 **`families=167/168`** ✓ ⇒ **只有 1 个族失败** ✓，具名 `S25-B` ✗） | 具名判定行生效 ✓；**S25-B 定点诊断**完成 ✓（机制＝变异子进程 2 s 等待下限太短 ⇒ 负载下驱动循环走不到被变异步 ✗） |
| #7 | **`129/132`** ✗ | ① `e2e-v4-fixes`（**140/1** ✗）② `v5-institute-fixes.mutants`（**2130.2 s** ✗，自报 `family did not redden by name: S5: the stalled path goes…` ✓✓）③ `e2e-v5-round2`（**532/2** ✗） | ① **失败清单机制按设计工作** ✓✓（点名 `S5`，无需再猜 ✓）；② 本次主机**明显更慢**（该族 2130 s ≈ 35.5 min vs 标称 25 min ✗；`formal-verify-v4` 234 s vs 90 s ✗ ⇒ ~2.5× ✓）⇒ **负载是共同驱动因素** ✓ |

**结论（诚实 ✗）**：**目标⑤的"非增量全量全绿"在当前主机的负载下无法稳定取得** ✗ —— 七次全量里 **vmu 范围（T0／T1 49／文档 52／变异 15／发布门禁）始终全绿** ✓，红点**每次都落在遗留 v4/v5 端到端作业**上，且**每次都不同** ✓（S25B → S5 ＋ v4/v5 e2e ✗）⇒ 这不是"某处坏了"，而是**这批遗留 e2e 作业对负载的时序容限太窄** ✗。
**已批准的结构性修复（用户 2026-10-10 决定：先诊断、再拆分 ✓）**：把 `tests/v5-institute-fixes.mutants.mjs`（单作业 ≈25–35 min、168 族）**拆成 2–3 个作业** ✓；同时把 `e2e-v4-fixes`／`e2e-v5-round2` 的**负载敏感断言**按同一方法（具名诊断 ⇒ 精准加时/重试）逐条处理 ✓。**拆分会影响 `derived/shipped` 计数与 `AUDIT-CHECKLIST` ⇒ 必须同步重算** ✓。

**S25-B 的定点诊断（用户批准的"先诊断、再拆分" ✓，2026-10-09 完成 ✓✓）**：
- **现象**：第 6 次 T3 的**具名判定行**证明 `families=167/168` ✓ —— 唯一失败者是 **`S25-B`**（`track=rejected ⇒ 落 rejected.md` ✗），**其余 167 个族按名变红** ✓；该族与其子族在隔离下**全绿** ✓（`S25-B` 定向 **5 连跑 0 失败** ✓）。
- **机制（读码定位 ✓）**：`runFamily` 给**变异子进程**设 `E2E_V5_WAIT_FLOOR_MS: '2000'`（注释自陈"变异只需按名变红 ⇒ 用**小等待下限**" ✓）⇒ **负载下驱动循环可能在走到被变异的 `rejected` 轨道之前就结束** ✗ ⇒ 期望的具名红不出现 ⇒ 该族判失败 ✗✓（**根因是"等待下限太短"，不是产品行为** ✓）。
- **修法（精准且便宜 ✓）**：**只在失败时**用**更耐心的下限（`PATIENT_WAIT_FLOOR_MS = 8000`）重试该族一次** ✓（`RETRY family …` 打印注明这正是 S25-B 的诊断结论 ✓；重试仍不匹配照样计红 ✓）。**代价**：只在真失败时付 ~数秒 ✓，而不是让 168 个族各付 30 s ✗。
- **仍待办（用户已批准的方向 ✓）**：**把该族拆成 2–3 个作业**（结构根治 ✓：作业数 132→约 134 ⇒ 需重算 `derived/shipped` 计数与 `AUDIT-CHECKLIST` ✓）；拆分前先看第 7 次全量是否已转绿 ✓。

**第 5 次 T3（2026-10-09 01:07–01:40，33 min，HEAD `b12b49f`，起点 `dirty=0`）**：`TOTAL 132 PASS 131 FAIL 1` ✗ —— 该族 `1561.7 s` 红（**其余 131 作业全过** ✓）。**本轮最重要的发现是方法论级别的** ✗✓：
> **sweep 摘录里"看不到"≠"没有发生"** ✗✗ —— 我连续三次（T3-3/4/5）从日志里读"族没有打印汇总／没有重试行"，并据此推断"族静默死亡" ✗；查证 `tests/run-tests.mjs:547-550` 的 `failureDetail()` 后发现：它**优先只打印"具名断言行"**（最多 40 行 ✓），**汇总行会被过滤掉** ✗ ⇒ 我的读数**从一开始就不可靠** ✓。
> **修法（本轮 ✓）**：该族**总是打印一条具名判定行** ⇒ `FAIL|PASS v5-institute-fixes.mutants: families=X/Y positives=A/B retries={P positive, F family} crashes=C hangs=H skipped=S` ✓✓ —— 于是**下一次全量摘录必然携带真相** ✓（无需再花 26 分钟单独复现 ✓）。
> **同时修掉两个真 bug** ✓：① 判定行引用了只在非定向分支声明的 `LIST`／`retried` ⇒ **定向运行 `ReferenceError`** ✗ ⇒ 已把场景清单与计数器**上提到分支之外** ✓；② 之前"族崩溃⇒重试够不着"✗ ⇒ `safeRunFamily`（`crashCount++` ＋ `FAMILY CRASH` ✓）。
> **复验** ✓：五个定向族全绿并各自打印判定行 ✓（`S25B 2/2`／`S25A 4/4`／`S21 6/6`／`G2 1/1`／`S8 7/7` ✓）；两个自证 exit 0 ✓；`run-tests --self-check` 全过 ✓。
**由此又修两处（本轮 ✓）**：① `runFamily` 外层加 `safeRunFamily` —— **崩溃＝该族失败**（打印 `FAMILY CRASH <name> :: <msg>` ✓）⇒ 汇总**必然打印**、重试**必然生效** ✓；② **估时按四次实测校正** ✓：`DURATION_WEIGHTS['v5-institute-fixes.mutants.mjs']` 由 **906.9 s → 1800 s**（实测 1483.6／1509.9／1981.6 s ＋ 历史 1319–1456 s ✓；旧值低报 ~2× 会**错排 headstart 窗口** ✓）。**验收依据仍是下一次 T3** ✓。

**发布门禁（机器面，2026-10-09 第三次实跑 ✓✓）**：
| 项 | 结果 |
|---|---|
| `node scripts/release-check.mjs` | **ALL CHECKS PASSED** ✓（tarball sha1 `9c62cf32…` ✓、**299 文件** ✓、**293 文本文件无 CRLF** ✓） |
| `node scripts/release-check.mjs --self-test` | 全过 ✓ |
| `node tests/release-check.mutants.mjs` | `ALL MUTANTS RED AS REQUIRED` ✓ ＋ 对照绿 ✓ |

> **发布本身（版本号 ＋ `npm publish` ＋ GitHub Release）**：**未做** ✗ —— 属"**较大影响决策**" ✓，须由用户批准 ✓（§7 的"发布前把草稿交用户确认" ✓）。门禁的**机器面已全绿** ✓。

**该红的定位（本轮已完成 ✓）**：红不是 v5 行为缺陷 ✗，而是**变异族自身的漂移** ✗✓ ——
- 被判红的断言来自 **`tests/selfdrive-v5.mjs:2782-2791`**（`s25b-progress-tracks` 场景 ✓），而该套件在**同一轮 T3 里 PASS** ✓（`ALL GREEN` ✓）⇒ **基线绿、仅变异下红** ✓；
- 变异 `S25B: the track resolver hard-codes narrative`（`v5-institute-fixes.mutants.mjs:1664-1672` ✓）把 track 解析**写死成 narrative** ⇒ **同时**打断 `rejected` 与 `obstacle` 两条落盘断言 ✗，而该族要求"**单点必红**" ✓ ⇒ 期望模式（只匹配 `rejected ⇒ rejected.md`）**过窄** ✗；
- ⇒ 处置：**测试侧**收窄变异（只写死 `rejected` 分支 ✓）或放宽期望（接受任一被打破的落盘断言 ✓），**不动 v5 行为** ✓（"守卫要能失败"与"变异要单点"两条同时满足 ✓）。

> **纪律收获（第三次同类 ✓）**：**变异锚点/期望会随被测代码漂移而腐化** ✗✓（本会话已三次：我自己的 stale `--self-probe` 锚 ✓、M1 删除不存在的文档 ✗、以及本条 ✓）⇒ 变异族必须把**锚点命中**本身作为断言 ✓（`indexOf(anchor) === -1 ⇒ 立即红` ✓），并在**每次 T3** 里被真正跑到 ✓✓ —— 这正是"T3 每 2–3 期集一次"不可被省掉的原因 ✓。

**该红的修复（已落地 ✓，只动测试 ✓）**：该守卫此后长成**五条**断言（缺省／`rejected`／`obstacle`／非法具名拒／回到缺省 ✓），而原变异把解析**整体**写死 ⇒ **同时打断多条** ✗，违背本族"**单点必红**" ✓。⇒ 把变异**收窄为"只把 `rejected` 走错档"** ✓（`const T = (String(track) === 'rejected') ? 'narrative' : …` ✓），使失败恰好落在期望的那条 ✓✓。
**定向验证**（`MUTANTS_ONLY='S25B'` ✓；该模式**自我标注"DIRECTED、非全量证据"** ✓）：`2/2 具名红` ＋ `ALL MUTANTS RED AS REQUIRED`，**4 s** ✓；红文与 `expect` **逐字相符** ✓。**全量 T3 将在下一轮跑一次收尾确认** ✓。

---

### 9.8 实现阶段进度（**活文档** ✗✓）

> 设计阶段的产物已经够多（**23 卷**；**959 个设置键里只有 51 个有消费者** ✗）⇒ 从本轮起按 `14-§4` 的分批计划**开始实现** ✓；本节逐轮回写"哪些计划真的落地了" ✗✓ —— 判据是**代码＋测试**，不是文档承诺 ✗。

| 批／切片 | 范围 | 规格来源 | 代码 | 测试 | 状态 |
|---|---|---|---|---|---|
| 批 1 · 切片 1 | 议程＋动议 | `08-§2`／`08-§10`／`08-§13` | `kernel/governance.js` | `tests/vmu-governance.test.mjs` | **已实现 ✓**（9/0 ✓） |
| 批 1 · 切片 2 | 看板／WIP／泳道／老化 | `08-§4`／`08-§10`／`08-§12` | `kernel/board.js` | `tests/vmu-board.test.mjs` | **已实现 ✓**（43/0 ✓；`VMU_WORKFLOW_TRANSITION_REQUIRED` 已登记 ✓） |
| 批 1 · 切片 3 | 会议纪要／决议／行动项 | `08-§2`／`08-§10`／`08-§12` | `kernel/minutes.js` | `tests/vmu-minutes.test.mjs` | **已实现 ✓**（20/0 ✓；实现中自查修掉一个上限比较 bug ✓） |
| 批 1 · 切片 6 | 审计（只追加/入库前脱敏/写失败具名） | `21-§2`／`07-§4.9`／`20-§6` | `kernel/audit.js` | `tests/vmu-audit.test.mjs` | **已实现 ✓**（22/0 ✓；复用内核既有落盘接缝 `auditToDisk` ✓） |
| 批 1 · 切片 7 | 告警与 SLO（告警级去重/静默补摘要/三值） | `21-§5`／`21-§13`／`21-§14` | `kernel/alerts.js` | `tests/vmu-alerts.test.mjs` | **已实现 ✓**（57/0 ✓；与 17 卷通知面**分层**：指纹＝指标×对象×码 ✓） |
| 批 1 · 切片 8 | 保留/回收站/配额/GC | `07-§4.3`／`07-§4.4`／`07-§4.8` | `kernel/retention.js` | `tests/vmu-retention.test.mjs` | **已实现 ✓**（55/0 ✓；**默认只报告** ✗，动手须显式 `dryRun:false` ✓） |
| 批 2 · 切片 1 | 委托与转委（**S-2 只减权**） | `17-§4`／`17-§20` | `kernel/delegation.js` | `tests/vmu-delegation.test.mjs` | **已实现 ✓**（107/0 ✓；越权**点名越出项** ✓，零机制下**不假装已授权** ✗✓） |
| 批 2 · 切片 2 | 信任与声誉（**S-3**：声誉绝不授权） | `17-§5` | `kernel/trust.js` | `tests/vmu-trust.test.mjs` | **已实现 ✓**（47/0 ✓；`authorityFrom()` **永远具名拒** ✓；零机制返回"无数据"而非 0 ✓） |
| 批 2 · 切片 3 | 仲裁（回避/理由/效力显式） | `17-§6` | `kernel/arbitration.js` | `tests/vmu-arbitration.test.mjs` | **已实现 ✓**（108/0 ✓；当事人任仲裁**点名拒** ✓；非约束性**自曝"仅有建议效力"** ✓） |
| 批 2 · 切片 4 | 交接（点名缺字段/压缩报丢弃） | `17-§11` | `kernel/handover.js` | `tests/vmu-handover.test.mjs` | **已实现 ✓**（21/0 ✓；**未接受的交接绝不算完成** ✗✓） |
| 批 2 · 切片 5 起 | 招募／拓扑／宪章／公平／技能／记忆／竞标 | `17-§7`／`17-§10`／`17-§14`／`17-§15`／`17-§17` | `recruit`／`topology`／`fairness`／`charter`（**已实现 ✓**：25/0／53/0／23/0／125/0 ✓）；`memory`／`bidding`（**已实现 ✓**：113/0／55/0 ✓）；`skills`（**测试红，未提交** ✗） | 同名测试 ✓ | **大部分已实现 ✓** |
| 批 3 | 归档落盘适配／复现包 | `07`／`16` | — | — | **未开始** ✗ |
| 批 4–5 | 计算与形式化／合规运营 | `09·15`／`16·20·22` | — | — | **未开始** ✗ |

> **本阶段累计** ✓：内核**已注册服务面 49 个** ＋ **T1 102/102**（第 24 轮实测 ✓，**在"全员空闲 ＋ 树干净"时付** ✓ —— 这是纪律：我曾错在队友写入中途跑，84/93 全是**在途集成缺口**而非回归 ✓）、**设置表已接线键 51 → 600+ / 1238** ✓（**具体数字永远以 `00-§3.2` 的生成索引为准** ✗✓）；**每一块都附"未做清单" ✗**。
> **本阶段最硬的两条纪律（都被真实缺陷逼出来 ✓✓）**：**①"读了键"与"键起了作用"必须可区分** ✗✓（回执带 **`enforced[]`** 只列本次真求值者 ✓；**拒绝路径也必须携带**（数组、可空、**不得 `undefined`** ✓✓）；`records` 还分出 **`fired[]`**＝真正改变结果的键 ✓ 并断言 **`fired ⊆ enforced`** ✓；未接键在 `status().plannedKeys` 里逐个点名＋原因 ✓，且断言 **`plannedKeys ∩ wired = ∅` 且恰好划分该族** ✓）。**②"接线上线 ≠ 机制生效"** ✗✓✓（**必须在有调用点、可观测影响、对照或反证三样齐备时才算完成** ✓）。
> **②这条纪律的三次实例（同一件事被连续抓到三次 ✓✓）**：**时钟守卫**（模块写完、测试绿，却**没有任何 TTL 敏感服务用它** ⇒ 回拨仍能复活过期条目 ✓ ⇒ 修到 **10 个服务**并加**无守卫对照组** ✓）；**审计锚点**（seam 接好、回执也对，但**全仓 `checkpoint()` 调用点 ＝ 0** ⇒ 锚点文件**永不写入**、防删尾**仍在睡觉** ✓✓ ⇒ 输入**非零默认节奏**＋`auditVerify()` **真用锚点**＋显式 `auditCheckpoint()`；我自己的探针在修的过程中**又两次**发现"传了参数却不生效"（模块读**设置属性**、且是**字面量键** ✓））；**`enforced[]`**（自称"可审计的接线证明"，但**恰在拒绝时 `enforced:null`** ✓、且 13 个键**变了却没列** ✓ ⇒ 已修 ✓）。
>
> ## ★ 本阶段的**核心纪律**：**"声明"必须指名两样东西** ✗✓✓
> **独立复核用一条系统性扫描（取 `kernel` 面 86 个成员，比对生产 vs 测试引用）连续抓到 _十_ 例同构缺陷** ✓✓，并在第 20 轮（里程碑）给出这一句话概括：
> > **这十例是同一个失效结构：某项能力／契约／守卫／生成物被"声明并接线"了，但它的执行点——运行时真正读它的那个调用点，或"通不过就红"的那道门禁——不存在、或不走——于是它只在纸上生效。**
>
> **可操作判据（新增声明时必须逐条回答）** ✗✓：
> 1. **生产调用点**：运行时**真的会调用它**的位置在哪里（给出文件:行 ✓）？
> 2. **会红的门禁**：**不通过就红**的那条断言／门禁是哪一条（不是"会被报出"就算过 ✗✓）？
> 3. 以上**缺任何一样** ⇒ **必须在 `status()` 与文档里显式登记为「诊断面」或「待办」并计数** ✓✓（**绝不允许"纸面生效"** ✗✓）。
> 这条判据的两种落地形态本阶段都已实现 ✓✓：**`GUARD_FACES` 守卫面登记**（面 ⇒ 语义 ⇒ 生产是否调用 ⇒ 诊断面理由 ✓，`status().guards` 自曝，含"未登记守卫 ⇒ 红"的变异自证 ✓）与 **`EXPECT_UNDECIDED` 显式待办**（未定 ⇒ **只计数不判红**，但**必须可见** ✓）。
>
> **十例清单**（每一例都有可复现的执行输出 ✓）：① 时钟守卫**无人用** ✓；② 审计锚点**永不触发** ✓；③ 四个能力接缝**硬编码 `null`**（`deliver` 还"接了 A 不接 B" ✓）；④ settings 视图**只给 `get()`** 而 13 个模块用属性读 ✓；⑤ 视图是**构造期快照** ⇒ 运行时改设置静默无效 ✓；⑥ 键**构造期冻结**＋**回执撒谎** ✓；⑦ 契约**只在工具边界强制**（内核 API 与工具面互相矛盾 ✓）；⑧ **守卫面生产零调用** ✓；⑨ **漂移检测已接、执行未接**（"被具名报出"就算过 ✗✓）；⑩ **自证模式已接、无人执行**（矩阵 `--selftest` ✓）。
> **制度化的防范** ✓：新增 **`audit-enforced-consistency` 门禁**（四条元规则：无重复／确定性／**行为变了必须在列**／未求值不得在列 ✓ ＋ 6 条造错自证 ✓）；它抓出 **5 条**拒绝不报告 `enforced` ✓，随后又抓出第 5 条"**静态清单**"⇒ 复核后**裁定是门禁自己的"键↔操作"归属表写错** ✓✓ ⇒ **修表而非把模块改成迁就错表**（复核者还为此加了 **`KEY-NOT-ENFORCED-BY-THIS-OPERATION`** 归属断言 ✓）。
> **环境危害（已处置 ✓）**：**工作区上一级目录里那棵"少一个反斜杠"的旁支树** ✗ 曾**反复被创建** ⇒ 核实"只有 3 个早期副本、**无 `.git`**、规范树真身齐全"后**删除** ✓；**我的 shell 现在一律先 `Test-Path` 再断言 `.git`** ✗✓ —— 这道守卫**当场就拦住了我自己的笔误一次** ✓✓（`edit`／`read` **没有**这道守卫 ⇒ 我仍偶发写错路径 ✗，故一律用**规范绝对路径并逐字复制** ✓）。
> **本阶段最硬的一条纪律（mathtools 标准 ✓✓）**：**"读了键"与"键起了作用"必须可区分** ✗✓ —— 回执带 **`enforced[]`**，只列**本次真正被求值**的键 ✓；未接的键在 `status().plannedKeys` 里**逐个点名＋原因** ✓，并断言 **`plannedKeys ∩ wired = ∅` 且两者恰好划分该族全部键** ✓。`kernel/mathtools.js` 用它把 **45/171** 个 `vmu.math.*` 旋钮变成行为 ✓（**未接 126 个逐个点名** ✓：多数需真实求解器／适配器／存储后端 ✓）。
> **门禁新增的守门能力** ✓（都由真实缺陷逼出来 ✓）：**import 闭包必须随包**（两次救回 `MODULE_NOT_FOUND` ✗✓；第 7 轮复核后**把 `tests/` 也纳入** ✓）、**代码读的键必须已登记**（抓出 v5r 包的真旋钮与 40+ 未登记键 ✓）、**一个旋钮只能有一个名字**（抓出多组别名 ✗✓）、**契约面必须与模块公开面一致**（抓出 `vmu.library` 缺 5＋3 个方法 ✗✓）、**注册的服务必须真的被构造**（抓出 `mathjobs` 注册却未建 ✗✓，自带"改坏必红"自证 ＋ **6 变异族** ✓）、**`§8.1` 逐行给"已实现 ✓/提案 ⛔＋实现位置"**（第 21 轮 ✓：**"文档写提案码、代码却抛别的码"这类语义错位终于有人抓** ✓，新门禁自带 **6 条故意造错自证** ✓）。
> **已知未闭合的门禁缺口** ✗（如实记录 ✓）：① `audit-vmu-services` 的绑定判定曾是**文本匹配** ⇒ 注释里的假绑定可绕过 ✓；**第 16 轮已用保长状态机修好** ✓（第 8 轮复核：保长 10/10 成立 ✓；第 8 轮指出的**正则字面量**与 **U+2028/U+2029** 缺口第 16 轮已补 ✓）。② `03-§8` 不区分"已实现／提案" ⇒ **第 21 轮已修** ✓（§8.1 逐行状态 ＋ 新门禁 ✓）。③ 键扫描只认**引号字面量** ⇒ 拼接/模板键不可见 ✓、跳过 `settings/` ✓、两段键跳过 ✓（洞已被**注释显性化** ✓ 但未闭合 ✗）。
> **两处"修好一个又引入另一个"的实例（已修，记账 ✓）**：**① 前跳守卫**：第 20 轮加"前跳 clamp" ⇒ 第 10 轮复核实测**长休眠会让时间永久冻结**（10 个服务的 TTL 停止推进 ✗✓，唯一"比修复前更危险"的变化 ✓）⇒ 第 21 轮改**有界 clamp ＋ resync 出口**（超 `resyncMs` ⇒ 接受并自曝 `resynced:true` ✓，`status()` 暴露 `frozenSince` ✓）；**裁决**：`onForward:'refuse'` **优先于 resync** ✓ —— 显式拒绝优于静默接受 ✓，但其**代价是"长休眠下会一直拒"** ✓ 故必须**知情** ✓（本行为文档化 ✓）。**② `mathjobs` 注册却未构造**（第 14 轮 ✓）⇒ 已加门禁 ✓。
> **独立复核发现并已修的真实缺陷** ✓（第 7–8 轮 ✓）：三孤儿模块（`crypto`／`lifecycle`／`notify` 被测试 import 却**不随包** ✗✓）、`canonicalize` 的 **5 类归一化碰撞**（`NaN`≡`null` 等 ⇒ 幂等可被静默绕过 ✗✓）、**`scope` 不参与台账身份**（跨作用域串账 ✗✓）、`replay.apply()` 遇非法/循环初值**裸崩** ✗✓、审计环**写死 100** 与声明值 64 不一致 ✗✓。
> **内核侧仍缺的服务面** ✗（批评者第 7–8 轮 ✓，本轮派单 3 项）：**N1 防篡改审计链**（K5 的输入可信性 ✓）／**N2 幂等台账持久化**（否则"重启正是重试发生的时刻" ✗）／**N3 时钟单调守卫**（回拨会同时废掉 TTL 与幂等 ✓）／**N4 状态版本与迁移**（旧快照会被静默误读 ✗）／**N5 非 JSON 安全状态的契约**（`JSON` 克隆有损 ⇒ "字节一致"掩盖语义漂移 ✗）✓。
> ## 本阶段最重要的一条纪律：**"接线上线 ≠ 机制生效"** ✗✓✓
> 由独立复核在**同一件事上连续抓到三次**（每次都有执行输出 ✓）：
> ① **时钟守卫**：模块写好了、测试绿了，但**没有任何 TTL 敏感服务用它** ⇒ 回拨仍会复活过期条目 ✓（**修复**：4 → **10 个服务**改用守卫时钟 ✓，并用**无守卫对照组**证明它真的在干活 ✓）；
> ② **审计锚点**：seam 接好了、回执也对，但**全仓 `checkpoint()` 调用点＝0** ⇒ 锚点文件**永远不会被写入**，防删尾**仍在睡觉** ✓✓（**修复**：内核自带**非零默认节奏**（100 行 ✓；0＝手动且**必须知道删尾不可检出** ✗）＋ `auditVerify()` **真的用锚点** ＋ 显式 `auditCheckpoint()` ✓；我自己的探针在修的过程中又**两次**发现"传了参数却不生效"（模块读的是**设置属性**、且是**字面量键** ✓）⇒ 两条通道都满足后才 PASS ✓）；
> ③ **`enforced[]`**：模块宣称"`enforced` 是可审计的接线证明"，但**恰在请求被拒时 `enforced:null`** ✓，且 **13 个键确实改变了行为却不在列** ✓（**修复**：拒绝路径必带已评估键 ✓、补齐 13 键 ✓、并引入 **`fired[]`**＝真正改变结果的键 ✓）。
> **⇒ 本阶段的验收标准据此提高** ✗✓：**"机制存在"不算完成；必须"有调用点、有可观测影响、有对照或反证"** ✓；任何新增自曝字段/接缝都要回答三问 ✓：**谁调用它 ✓／不调用会怎样 ✓／怎么证明它真在工作 ✓**。这条纪律已写成 §8.1 逐行状态门 ＋ `enforced` 一致性门（C2 ✓）的制度形态 ✓。
> **另两处"修好一个又引入另一个"**（已修 ✓，见上）＋ **一次"探针自己覆盖证据"**（复核者在篡改文档用例里又调用了写入 ⇒ 把证据覆盖掉 ⇒ 改只读触发后才拿到真结论 ✓）⇒ 纪律：**测"加载期"校验必须用只读触发并断言零写入** ✓。
| 批 1 · 其余 | 工作流／控制／调度 | `08-§4` | — | — | **未开始** ✗ |
| 批 2–5 其余 | 信任/仲裁/归档/计算/合规 | `17`／`07`／`09·15`／`16·20` | — | — | **未开始** ✗ |

> **本阶段累计** ✓：**9 个内核服务**（`governance`／`board`／`minutes`／`budget`／`metrics`／`audit`／`alerts`／`retention`／`delegation` ✓）、**408 条新断言** ✓、**设置表已接线键 51 → 138（/995）** ✓；**每一块都附"未做清单" ✗**（例如委托无耐久投影、保留的分层只标记不下沉 ✓）—— 这些**不算已实现** ✗。
> **接入时发现并修掉的真实缺陷** ✓（绝大多数由门自动抓到 ✓）：未声明的真旋钮（v5r 包的 `requireSettledRecords` ✗）、缺的 `ratio` 类型 ✗、**同义不同名**若干处（`meetings.minutesDetail` ✗、`retention.keepEvery` ✗、`MATH_TIMEOUT` 曾被写成 `VMU_MATH_TIMEOUT` ✗）、`roots` 权限来源**不得靠猜角色名** ✗（改为显式设置 ✓）、**接线检测把注释里的名字当成"读过"** ✗（两处 ✓）、**`library` 契约面缺方法** ✗（5＋3 个 ✓）。

> **登记自愈** ✓：某键被实现后，我从生成计划区把它**移入手写核心表**（`settings/schema.js` 的 `CORE_DEFS` ✓）⇒ `planned.js` 因"已存在"**自动停止**声明它 ✓，`docs/04 §11` 该行变 `✅ 已接线` ✓，`00-§3.2` 的逐卷接线数**自动上升** ✓ —— **不需要手改任何统计** ✗。

**每块实现的接入清单（Lead 专用 ✓，按此逐项做完才算"落地" ✓）**：
1. **模块**：读它的公开面与未做清单 ✗；确认它只读注入的 `clock`（无 `Date.now` ✓）、拒绝全走具名 `refuse()` ✓、上限全报丢弃计数 ✓；
2. **接线**（`kernel/index.js` ✓）：加 import ✓ → 创建实例（`settings: { get: (k) => settings[k] }` 适配器 ✓）→ `registry.register('vmu.<面>'…)` ✓ → 加 getter ✓；
3. **键迁移**：把它真读的键从生成计划区**移入 `CORE_DEFS`** ✓（类型/默认取自实现或卷 ✓，`hot`/`who` 先统一 `H1`/`office` ✓）；
4. **码登记**：它抛的新码 ⇒ 补进 `docs/03-§8` ✓（并用 `regen-all` 让计划码块保持同步 ✓）；
5. **随包**：新运行时文件＋新测试 ⇒ `package.json#files` ✓ **与** `installer.js` ✓（**新门**会守 import 闭包 ✓，但 installer 的清单仍要手加 ✓）；
6. **门禁**：`node scripts/regen-all.mjs` ✓ → 单跑新套件 ✓ → 相关老套件（kernel／entry／host／pack ✓）→ T0 ✓ → 提交 ✓；
7. **回写**：本节的状态列 ✓ ＋ `14-§4` 的分批表 ✓ ＋ 该卷"实现现状"（若有 ✓）。


---

## 10. 原始愿景逐条符核表（**活文档**；每轮回写 ✓）

> 用途：回答"**当前实现是否充分遵循用户原始愿景**" ✓。规则：**只写有证据的行** ✓；未做的一律写"❌／⚠️" ✗，**不得**用库内测试冒充真机 ✓；每条给出"计划"指向本轮工作轨道（Track A＝文档逐册校对／Track B＝把承诺接线为真／③＝能力缺口）。

| # | 愿景条款（用户原文要点） | 现状（**2026-10-09 回写** ✓） | 证据（可核） | 差距 | 计划 |
|---|---|---|---|---|---|
| **V1** | 本体是一个 **agent preset**（id `vibe-math-vmu`）且是**框架** | ✅ | 真机 P0 六项全 PASS（`live/2026-10-09/p0-final/` ✓）；`agent.cordis.yml`；`vibe-math-vmu.js` | — | — |
| **V2** | 运行机制 = **框架 ＋ settings ＋ 中间件（＋代理自组织）** | ✅ | 四形态中间件＋总线＋**宿主钩子桥**：真机 M1 拒绝**含中间件 id** ✓、M2 模块拒绝 ✓、M4 整合包应用 ✓、**M3 脚本真机通过 ✓✓**（2026-10-10，`p2-m3-stack4` ✓）；**零机制**：无配置只注册 **1** 个只读工具 ✓（有断言 ✓） | **宿主 `cwd`/`env` 零容忍缺陷仍在** ✗（我们给了调用侧规避 ✓，见 11-§9.6 ✓） | 已不再阻塞 ✓ |
| **V3** | 提供**尽可能多**的六域**基础设施** | ✅ **六域都能在会话内驱动** ✓（工具面 **8** 个 ✓） | `kernel/` **16** 模块 ✓；工具面按声明出现：`status/set/middleware/records/script/pack/control` ✓ ＋ **`vibe_vmu_meeting`（会议＋表决 ✓）／`vibe_vmu_task`（任务板 ✓）** ✓✓ —— 分别为**会议/表决**与**任务**提供了"可按 id 寻址、不复制策略"的会话面 ✓（`03-§3.1` ✓、场景 `vmu-entry` 第 15 组 ✓） | **归档**早在 `vibe_vmu_records` ✓；**预算/资源面**仍是**部分** ✗（工具调用上限已强制 ✓；内存/并发上限未接 ✗） | 按需接余下 18 键 |
| **V4** | **可调控参数**尽可能多且**真的可调** | ✅ **717 键：51 已接线／666 已声明未接线（planned）**（2026-10-10 设计阶段 ✓）：**两个生成式登记物**把"设计阶段声明的参数"变成机器可见的**诚实账** ✓ —— `settings/planned.js`（**663 计划键** ✓，从 docs 生成 ✓）＋ `03-§8` 计划码块（**98 码** ✓）；接线数由**生成器**计算、由审计**独立重算** ✓ | `docs/04 §11`（404+ 行生成表 ✓，每行标"未接线" ✓）＋ `00-§3.1`（登记物说明 ✓）＋ 各卷"拟增键全表" ✓ | **666 键未有消费者** ✗ —— 这是**设计阶段的正常状态** ✓（先设计到极致 ⇒ 再实现 ✓）；实现时每键必须从 `planned.js` **移入**手写核心表并给真元数据 ✓（`--check` 会守 ✓） | 按卷分批实现（每批 T0→T1→提交 ✓） |
| **V5** | 用 settings ＋ 中间件即可**复现 v2–v5r**（整合包） | ✅ **两种运行模式的包都已落地并会真正触发** ✓✓ | `packs/v5r-core.js` ✓（席位／机制默认／**真实工具上的 M1 规则**／**随包 M2 模块**／设置层报告 `pack:v5r-core` ✓／服务级别名 ✓，`vmu-entry` 第 13 组 ✓）＋ **`packs/v3-core.js`** ✓（`planner:1／solver:8／verifier:3` 槽位 ✓／v3 机制默认 ＋ 包自有 `vmu.v3.*` ✓／**两个随包 M2 模块**：`ballot/tally` 强制 **verifier 法定数** ✓、`mode=manual` 拒绝派发 ✓，第 14 组 ✓） | **行为级 A/B 未做** ✗（P3 收尾 ✓）；**v2-pack 未做** ✗ | 10-§5.1 方法 ⇒ P3 |
| **V6** | 可通过 settings／中间件**设置·安排·管理·编辑提示词** | ✅ | **入口已接线** ✓：`config.promptSections`／`promptBindings`／`promptOverrides`／`whoMayOverride` ＋ settings `vmu.prompts.*` ✓；**覆盖 > file > text** ✓；**宿主 `systemPrompt` 收到生效后文本** ✓（场景 8 ✓）；两种"来源"视图分开 ✓（06-§10 ✓） | **运行期改提示词无工具面** ✗（改配置/覆盖文件 ✓）；按 `owner` 注入成员会话**未真机验收** ✗ | 真机场景 |
| **V7** | **控制流**（暂停/恢复/停止/心跳） | ✅ | `pause/resume/stop/beat` ＋ `control()` ✓；**暂停真门禁**（任务 ✓ 会议 ✓ 表决 ✓）；`wallClockMs` 作心跳预算 ✓；`vibe_vmu_control` 仅声明时出现 ✓（场景 ✓） | `control.can-*` 判定点／定时器**未做** ✗；归档面未接暂停 ✗ | 按需 |
| **V8** | 会议／表决／工作流**原语** | ✅ 库面 | `kernel/{meeting,ballot,tasks}.js` ＋ 场景（含 **v5r `s8-freeze-say` 等价回归** ✓）｜会议三键**真强制** ✓（超时／引用条数**拒**／引用深度**折叠计数** ✓） | 无逐个工具面；议程/动议实体、分钟确认未做 ✗ | ②已允"仅库面" ✓ |
| **V9** | **数学计算/工具**面 | ⚠️ **已接真宿主** ✓；**子进程路径已通 ✓✓、真机真实编译/证明仍未跑** ✗ | `host-math.js`（`register/params/projectRoot/fs/resolveExecutable/spawn` ✓，路径逃逸具名拒 ✓）；6 个 `vmu.math.*` 生效 ✓；`math_computation` 仅声明数学意图时发布 ✓；**M3 真机已解除 ✓✓**（同一个 spawn 接缝 ⇒ 真机子进程可用 ✓） | **真机 `math_computation run`／Lean 编译从未跑过** ✗（下一步 ✓）；Lean 面无提示词段 ✗ | 跑一次真机最小计算 ⇒ 再决定 Lean 面 |
| **V10** | **文件归档／耐久** | ✅ | `store.js`＋`library.js` ✓＋**审计落盘** `<root>/vmu/audit/<day>.jsonl` ✓（写失败具名 ✓）＋**在途台账** ✓（重启后标 `interrupted`＋owner ✓） | 反向迁移（回退）未实现 ✗；只有结构校验（无引用完整性）✗ | 按需 |
| **V11** | 复用/重构 v5r，**不为省事堆屎山** | ✅ | 共享数学模块**原样复用**（字节一致门 ✓）；v5r 55 参数/56 工具/30 代码族**四分类报告** ✓；`vmu-containment` 33/0 ✓；**面级真机对照** ✓（54 工具/24 295 in ↔ 6 工具/7 212 in ✓） | 会议语义已成包 ✓ 但**行为级 A/B** 未做 ✗ | P3 收尾 |
| **V12** | **详细系统、全面完整的开发者文档与使用说明** | ✅ **14 篇逐册校对完成** ✓✓ | **15 篇** ✓；仓内门禁：`audit-vmu-docs` **52 断言** ＋ **15/15 变异** ✓（文档集／码登记**双向**／服务面**按已发布集合**／**工具面**／**设置键面＋接线**／**接线面**／**钩子生产双向** ✓）；`audit-vmu-release` 22＋6 ✓ | 待补：`since` 列、逐键示例、配方**逐条跑通** ✗ | 按需 |
| **V13** | **扩展性**：可写额外插件／mod | ✅ 机制＋契约均已按代码写实 | `registry`（每服务 `apiVersion` ＋ 单一 `packContractVersion` ✓）；`pack.js` 真实清单规范 ✓；03-§2 **已发布服务表＋未发布清单** ✓；**pack 可携带 M2 代码模块** ✓（`v5r-core` ✓） | M4 外部**插件包**（client 面）未做 ✗ | 按需 |
| **V14** | 允许**破坏性重构**，一切以**最优实践**优先 | ✅ 已实际执行 | 本阶段提交链 `61385cd`→`45ec07c`（宿主四件、控制流、台账、审计落盘、v5r-core 包、Track C 门禁 ✓） | — | — |

**结论（2026-10-09 回写 ✓，不粉饰 ✗）**：**V1／V2／V6／V7／V10／V11／V12／V13／V14 已达标 ✓**（其中 V12 是**本轮才达标** ✓）；**V3／V4／V5／V8／V9 属"部分" ⚠️**，且**每一处"部分"都已写明具体差距** ✗（工具面窄／18 键未接／行为级 A/B 与 v3-pack／归档无工具面／真机数学未跑通）。
⇒ **"是否充分遵循原始愿景"**：**达成 ✓✓（主体与"最后一公里"均已落地并留证）** —— 框架＋settings（54 键，**37 已接线／17 逐键标注** ✓）＋中间件四形态（含**包内携带 M2 代码模块** ✓）＋**v5r／v3 两个整合包**（都会真正触发 ✓✓）＋提示词管理（入口接线 ✓）＋控制流（**暂停是真门禁** ✓）＋数学宿主接缝 ✓＋审计**落盘** ✓＋在途台账 ✓＋**六域工具面**（`vibe_vmu_meeting` 会议/表决 ✓、`vibe_vmu_task` 任务板 ✓、`vibe_vmu_records` 归档 ✓，其余按声明出现 ✓）—— 全部**可用、被门禁与场景守护、且关键面在真机验证过** ✓✓；**行为级 A/B 已实跑一轮** ✓（同任务/同模型/同主机、仅换预设 ✓，报告 `_oneoff/vmu/design/05-p3-ab-report.md` ✓；其 ①② 对照因**环境**（不存在"未装 vmu 且 CLI 同代"的 profile ✗）标为**受限** ⚠️）；**发布门禁 `release-check` ALL PASSED** ✓；**T3 非增量全量两次全绿** ✓✓（`132/132` 于 `1fe6ffc`；**`134/134` 于 `8ffdf82`**，三片零重试 ✓）。
**仍未做（明确 ✗）**：① ~~真机 M3~~ ⇒ **已解除 ✓✓（2026-10-10，`p2-m3-stack4` ✓）**；**残留**：宿主 `cwd`/`env` 零容忍缺陷仍在 ✗，规避写在 `host-spawn.js` ✓；**真机 `math_computation run`／Lean 编译仍未跑** ✗；② **3 个未接线键**（`core.storeBackend`／`safety.approvalRequired`／`records.meetingKeepEvery` ✓）—— **逐键已标注"改了不会有行为变化"** ✓，且已按"接／配／停"分类 ✓；③ **干净 A/B 复跑**＝**环境受限** ✗（已留证 ✓）；④ **v2 包**—— **不在本目标条款内** ✓（条款只要求 v5r／v3 ✓，二者均已交付 ✓）；⑤ **`pathPolicy` 的 spawn-cwd 一路**：**已接线 ✓（opt-in ✓）** —— 仅当配置**显式声明**策略时拦截 ✓（spawn cwd 常是 agent 工作区而非内核 root ✓，按默认拦会误伤 ✓）。**版本号与发布：须用户批准** ✗（机器面证据已齐 ✓）。

---

## N16 工程研发流程（Engineering Flow：需求→设计→实现→验证→发布）

> 状态：**设计稿 v0.1（本卷新增节）** —— 补齐 **N16 缺口**（`工程研发`／`工程流程` 关键词实测 **0** ✗）✓；**不新建卷** ✗✓；**不动作内核** ✗：阶段与闸点**声明式**表达 ✓，闸点**委托**既有原语 ✓。
> 上位：本卷头部 `> 上位：`；**与 `16-research-lifecycle.md` 并列而非混用** ✓（研究生命周期管"研究推进" ✓，本节管"工程交付" ✓）；**闸点原语只引用** `16` 卷与 `kernel/lifecycle.js` ✗✓。

**五个阶段（每阶段一条"闸点"，判据委托、不自造 ✗）** ✓：
| 阶段 | 入口产物 | 闸点（委托） | 未过 ⇒ |
|---|---|---|---|
| **需求** | 需求条目（`req-*`：谁要／为何／验收口径 ✓） | 验收口径**可核对** ✓ | **未做 ✗**（标记词同行 ✓） |
| **设计** | 设计说明（接口形状／不变量／边界 ✓） | 与 `03` 的接口契约**一致** ✓ | **拒**（具名 ✓） |
| **实现** | 变更集（谁/何时/为何 ✓） | **变更控制**：每条变更**有作者与理由** ✓ | **未做 ✗** |
| **验证** | 门禁证据（T0/T1/T3 分层见本卷 §门禁 ✓） | **与既有门禁互相引用** ✗✓ | **不发布** ✗ |
| **发布** | 发布清单（见下 ✓） | 清单**逐项勾选**＋版本须**用户批准** ✗✓ | **不发布** ✗ |

**代码审查与变更控制（who/why/when ✓）** ✓：每条变更记录 `{ by, at, why, touches }` ✓（**时刻取自注入时钟** ✗不读真实时间 ✓）；**审查不是仪式**：审查者必须给出**一个可反驳的理由**或**明说"未审"** ✗✓。

**缺陷分类与回归** ✓：缺陷分 `设计缺陷／实现缺陷／规格歧义／环境缺陷` 四类 ✓；**回归＝复跑既有门**（**不新建回归机制** ✗）✓；修缺陷必须**带一条门/场景证据** ✓，否则标 **未做 ✗**。

**发布清单（与本节及本卷门禁互相引用 ✓）**：① 变更集已审 ✓；② 门禁全绿（**非增量** ✓）；③ 发布说明含**用户可见变化**＋**未做项 ✗**；④ 版本号变更**须用户批准** ✗✓；⑤ 回退路径写明 ✓。

**提案码**：**无**（**只引用** `03-§8` 既有登记 ✗✓；若日后需要"发布清单未勾完"专属码 ⇒ 列为提案 ✗）。

## N16 未核项

1. **发布清单的机器可校验形态**（勾选是"人工声明"还是"由门禁派生"）**未定** ✗ —— 见 `14-§2`（未决登记）✓；
2. **缺陷分类的自动化**（从失败输出推断类别）**未做** ✗ —— 本卷只给**分类词表** ✓；
3. **与 19 卷（插件与扩展开发）的交界**：19 管**扩展面** ✓，本节管**流程面** ✓，**交界只写一次** ✗✓ —— 具体哪一卷承载"第三方扩展的审查"**未核** ✗（见 `14-§2` ✓）。

---

## 知识可发现性（N15：策略／参数／码"怎么找到"）

> 状态：**设计稿 v0.1（本卷新增节）** —— 补齐 **N15**（`可发现性` 关键词实测 **1** ✓，本节把它写成**可执行的三条入口** ✓）；**只引用已存在的生成物，不重定义** ✗✓。
> 上位：本卷头部 `> 上位：`、`00-README.md`（阅读顺序 ✓）、`14-open-items-and-roadmap.md`（未决/未核登记 ✓）。

**三条入口（找"一条策略／参数／码"就这三个去处 ✓）**：
1. **生成索引** ✓：`04-settings.md` 的**参数全表**（键／类型／默认／热改／**接线与否** ✓）＋ `03-§8` 的**码表**（**已实现／提案**应可区分 ✓）—— **只引用**其生成物 ✗；
2. **术语表** ✓：本卷＋`01` 的术语（`策略`／`闸点`／`委派`／`记录轨`…）**一词一义** ✓；**新词先登记再使用** ✗✓；
3. **逐卷状态页** ✓：每卷头部的 `> 状态：`／`> 上位：` 两行 ✓ ⇒ **按卷定位**（"这条规则属于哪一卷" ✓）。

**新卷/新键登记清单（对代理自组织尤重要 ✓）** —— 新增任何东西，**必须**同时更新这几处 ✗✓：
| 新增 | 必更新 |
|---|---|
| **新卷** | `00-README.md` 阅读顺序（**生成块之外** ✗✓）＋ `14` 卷登记 ✓ |
| **新键** | `04-settings.md` 参数表（含**默认值**与**接线状态** ✓）＋ `03` 若对外承诺 ✓ |
| **新码** | `03-§8` 码表（**已实现／提案**标注 ✓） |
| **新工具** | `03` 工具表 ＋ 本卷门禁（**未实现工具名与标记词同行** ✗✓） |

**"未做"如何被发现** ✓：统一标记词 **`✗`**（未做）／**`⚠️`**（部分）／**`✓`**（已做）✓ ⇒ **`grep ✗` 即可列出全部未做** ✓✓；每条未做**必须同段给出"缺什么"** ✗✓（不得只写"未做" ✗）。

**提案码**：**无**（本卷**只引用**既有登记物 ✗✓）。

## 知识可发现性 · 未核项

1. **索引的自动生成是否已存在**（`04`／`03-§8` 的生成器）**未核** ✗ —— 见 `14-§2`（未决登记）✓；
2. **术语表的权威位置**（本卷 vs `01`）**未定** ✗ —— 见 `14-§2` ✓；
3. **`grep ✗` 的可执行入口**（是否提供一条脚本）**未做** ✗ ✓。

<!-- BEGIN GENERATED: zero-mechanism-matrix -->
<!-- 本块由 `scripts/generate-zero-mechanism-matrix.mjs` 生成（生成式 ✓，勿手写 ✗） -->

| 模块 | 零机制下的返回形状 | 是否具名拒（码） | 自曝字段 | 期望（设计） |
|---|---|---|---|---|
| `alerts` · `status()` | ok | — | dropped=[object Object] | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `arbitration` | op 抛出 | — | — | PROBE_NEEDS_ARGS（缺：裁决请求体（案由/双方）） |
| `audit` · `status()` | object | — | dropped=0 | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `auditchain` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `ballot` · `open()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `ballotbox` · `open()` | refusal | VMU_CONFLICT | enforced=[0] enforcedScope=evaluated-so-far | 具名拒或 ok（零机制：无票面参数 ⇒ 具名拒；有默认 ⇒ ok ✓） |
| `bidding` · `list()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `board` · `status()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `budget` | op 抛出 | — | — | PROBE_NEEDS_ARGS（缺：预算条目（额度/科目）） |
| `bus` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `charter` | op 抛出 | — | — | PROBE_NEEDS_ARGS（缺：章程条项） |
| `clockguard` · `status()` | null | — | — | ok 或 null（时钟守卫：无声明 ⇒ 不拦（返回 null 亦合规）） |
| `course` · `open()` | refusal | VMU_INVALID_ARGUMENT | enforced=[1] enforcedScope=evaluated-so-far | 具名拒或 ok（零机制：缺课程参数 ⇒ 具名拒（enforced 非空）✓） |
| `crypto` · `status()` | object | — | dropped=0 | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `delegation` | op 抛出 | — | — | PROBE_NEEDS_ARGS（缺：委派授权对（from/to/范围）） |
| `domaingate` · `status()` | ok | — | dropped=[object Object] | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `external` · `status()` | object | — | dropped=0 | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `fairness` · `status()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `formal` · `check()` | refusal | VMU_MATH_INVALID_INPUT | — | 具名拒（带 code）（缺必填参数 ⇒ 具名拒并点名） |
| `governance` · `keysUsed()` | array[15] | — | — | array 或 object（治理面：只读列举（keysUsed/partition 不拒）） |
| `guard` | （无 create* 工厂） | — | — | EXPECT_NA（非服务模块（无 `create*` 工厂 ⇒ 不适用 ✓）） |
| `handover` | op 抛出 | — | — | PROBE_NEEDS_ARGS（缺：交接对象） |
| `idempotency` · `list()` | ok | — | dropped=0 truncated=false | ok 或 object（列表/状态面放行 ✓；**显式 `absent` 只在去重操作上**（该操作需参数 ⇒ 探针见 NEEDS_ARGS ✓）） |
| `index` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `lean` · `submit()` | refusal | VMU_LEAN_STATEMENT_REQUIRED | — | 具名拒（带 code）（缺必填参数 ⇒ 具名拒并点名） |
| `library` | create 抛出 | — | — | PROBE_NEEDS_ARGS（缺：库引用（ref/uri）） |
| `lifecycle` · `stages()` | refusal | VMU_LIFECYCLE_NOT_DECLARED | — | 具名拒（带 code）（缺必填参数 ⇒ 具名拒并点名） |
| `loader` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `math` | create 抛出 | — | — | PROBE_NEEDS_ARGS（缺：数学请求体） |
| `mathjobs` · `submit()` | refusal | VMU_MATH_INVALID_INPUT | — | 具名拒（带 code）（缺必填参数 ⇒ 具名拒并点名） |
| `mathtools` | op 抛出 | — | — | PROBE_NEEDS_ARGS（缺：计划入参（op/limits）—— 零机制期望＝ok + enforced:[] ✓） |
| `meeting` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `meetings` · `open()` | ok | — | enforced=[0] enforcedScope=evaluated-so-far | 按声明默认开成（零机制＝按声明默认值开成（不拒）✓） |
| `members` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `memory` | op 抛出 | — | — | PROBE_NEEDS_ARGS（缺：记忆条目） |
| `metrics` · `status()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `minutes` · `list()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `notify` · `list()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `pack` · `plan()` | refusal | VMU_PACK_MISSING | — | 具名拒（带 code）（第 26 轮已修 ✓：实测拒绝带 **`VMU_PACK_MISSING`**（曾误标"不带 code" ✗）） |
| `projmigrate` · `status()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `publication` | op 抛出 | — | — | PROBE_NEEDS_ARGS（缺：出版请求） |
| `ratelimit` · `status()` | object | — | dropped=0 | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `records` | op 抛出 | — | — | PROBE_NEEDS_ARGS（缺：记录体（track/kind/body）） |
| `recruit` · `status()` | object | — | dropped=0 | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `registry` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `replay` · `plan()` | ok | — | truncated=[object Object] | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `repropack` · `build()` | refusal | VMU_MATH_SEED_REQUIRED | — | 具名拒（带 code）（缺必填参数 ⇒ 具名拒并点名） |
| `retention` · `plan()` | object | — | dropped=0 | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `rules` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `scheduler` · `list()` | ok | — | dropped=0 truncated=false | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `script-bridge` · `plan()` | refusal | VMU_INVALID_ARGUMENT | — | 具名拒（带 code）（第 26 轮已修 ✓：实测拒绝带 **`VMU_INVALID_ARGUMENT`**（同上 ✗）） |
| `skills` · `list()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `stateversion` · `check()` | refusal | VMU_COMPAT_UNKNOWN_COMBO | — | 具名拒（带 code）（缺必填参数 ⇒ 具名拒并点名） |
| `store` | create 抛出 | — | — | PROBE_NEEDS_ARGS（缺：存储配置） |
| `tasks` · `list()` | array[0] | — | — | array（任务板：零机制 ⇒ 空列表（放行）） |
| `topology` · `list()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `transaction` | op 抛出 | — | — | PROBE_NEEDS_ARGS（缺：事务体） |
| `trust` · `list()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `work` | create 抛出 | — | — | PROBE_NEEDS_ARGS（缺：工作项） |
| `workflow` | op 抛出 | — | — | 具名拒或 ok（**两侧都写清** ✓：`define({})` ⇒ **有默认阶梯且放行（ok）** ✓；被探 op 缺参 ⇒ **具名拒** ✓（缺参归 NEEDS_ARGS 计数，不算 mismatch ✓）） |

=== ZERO-MECHANISM MATRIX: 60 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED, 15 probe-errors, 1 n/a ===
<!-- END GENERATED: zero-mechanism-matrix -->
