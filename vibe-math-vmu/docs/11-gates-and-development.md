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
| P2 | **M3 脚本形态真机运行** | **NON-RESULT** ✗ | `live/2026-10-09/p2-m3-in-host{,2,3}/` |

> **M3 的 NON-RESULT 细节（诚实记账）**：脚本工具本身在真机**存在且可用** ✓（`action=list` 返回声明的 `probe` ✓）；`action=run` 走到宿主 `subprocess.spawn` 后，宿主**内部**抛
> `Cannot read properties of undefined (reading 'includes')` ✗。我们传入的 spec（`argv`／`cwd`／`stdio:{stdin,stdout.maxBytes,stderr.maxBytes}`／`graceMs`）与**本仓可用预设 v5r 的调用逐字段一致** ✓，且已按 v5r 的做法先 `resolveExecutable(argv[0])` ✓；⇒ **高度怀疑是隔离 `DSH_HOME` 下 provider 的环境差异**（scrubbed parent env 缺项 ✗），**不是** vmu 规格问题 ✓。按 §9.2⑥ 记 **NON-RESULT**，并记录下一步诊断（对照非隔离 home 复跑 / 读 provider 的环境读取点 ✓）。
>
> **已排除的四项（2026-10-09 追加 ✓）**：① 不是 id 查找 ✗（`list` 正确 ✓）；② 不是"接缝未绑定" ✗（该缺陷已修，错误随之前进 ✓）；③ 不是 spec 形状 ✗（与 v5r 逐字段相同 ✓）；④ **不是 PATH 缺失** ✗（在脚本声明里显式给出 776 字符的 `env.PATH` 后，仍是同一个 TypeError ✓，证据 `live/2026-10-09/p2-m3-env/` ✓）。⇒ 剩余可能是 provider 的**平台/容器模式探测**路径或该 provider 版本的缺陷 ✗；**本项不再占用真机轮次** ✗，成果：库级＋单元级 M3 全绿 ✓，真机如实记 NON-RESULT ✓。
| P3 | v5r-pack 对照跑（**面级对照已完成** ✓；行为级 A/B 未做 ✗） | **部分** ✓ | `p3-v5r-side/` ＋ `p3-vmu-side/`；报告 `_oneoff/vmu/design/04-v5r-contrast-live.md` ✓ |
| P4 | 公开服务版本可读（`contract()`） | **部分** ✓（库内 ✓；真机未读） | —— |
| P5 | 发布清单全过 ＋ GUI（O2 前置） | **未做** ✗ | —— |

> **诚实口径**：上表**只写已取得证据的行** ✓；未做的一律写"未做"✗，**不得**用库内测试冒充真机 ✓。

### 9.7 T3（非增量全量）运行记录

| 时间 | 命令 | 结果 | 备注 |
|---|---|---|---|
| 2026-10-09 19:55–20:26（31 min） | `GATE_RELEASE=1 node tests/run-tests.mjs`（前置 `preflight.mjs --for-t3` **PASS** ✓，工作树干净 ✓） | `TOTAL 132 PASS 131 FAIL 1` ✗ | 唯一红：`v5-institute-fixes.mutants.mjs`（1512.7 s ✓） |
| 2026-10-09 20:32–21:03（31 min） | 同上（修复红因之后 ✓，HEAD `ea81436` ✓、`dirty=0` ✓） | **`TOTAL 132 PASS 132 FAIL 0`** ✓✓ | **全仓非增量门禁全绿** ✓（含全部 vmu 工作 ✓） |

**P5 发布门禁（机器面，2026-10-09 实跑 ✓✓）**：
| 项 | 命令 | 结果 |
|---|---|---|
| 静态检查 ＋ 真实 `npm pack` ＋ tarball 行尾扫描 | `node scripts/release-check.mjs` | **ALL CHECKS PASSED** ✓（tarball sha1 `d2420a2b…` ✓、**296 文件** ✓、**290 文本文件无 CRLF** ✓） |
| 谓词非空证明 | `node scripts/release-check.mjs --self-test` | 全过 ✓（含"过时 compatNote 会被抓" ✓） |
| 变异族 | `node tests/release-check.mutants.mjs` | `ALL MUTANTS RED AS REQUIRED` ✓ ＋ 对照绿 ✓ |

> **发布本身（版本号 ＋ `npm publish` ＋ GitHub Release）**：**未做** ✗ —— 属"**较大影响决策**" ✓，须由用户批准 ✓（§7 的"发布前把草稿交用户确认" ✓）。门禁的**机器面已全绿** ✓。

**该红的定位（本轮已完成 ✓）**：红不是 v5 行为缺陷 ✗，而是**变异族自身的漂移** ✗✓ ——
- 被判红的断言来自 **`tests/selfdrive-v5.mjs:2782-2791`**（`s25b-progress-tracks` 场景 ✓），而该套件在**同一轮 T3 里 PASS** ✓（`ALL GREEN` ✓）⇒ **基线绿、仅变异下红** ✓；
- 变异 `S25B: the track resolver hard-codes narrative`（`v5-institute-fixes.mutants.mjs:1664-1672` ✓）把 track 解析**写死成 narrative** ⇒ **同时**打断 `rejected` 与 `obstacle` 两条落盘断言 ✗，而该族要求"**单点必红**" ✓ ⇒ 期望模式（只匹配 `rejected ⇒ rejected.md`）**过窄** ✗；
- ⇒ 处置：**测试侧**收窄变异（只写死 `rejected` 分支 ✓）或放宽期望（接受任一被打破的落盘断言 ✓），**不动 v5 行为** ✓（"守卫要能失败"与"变异要单点"两条同时满足 ✓）。

> **纪律收获（第三次同类 ✓）**：**变异锚点/期望会随被测代码漂移而腐化** ✗✓（本会话已三次：我自己的 stale `--self-probe` 锚 ✓、M1 删除不存在的文档 ✗、以及本条 ✓）⇒ 变异族必须把**锚点命中**本身作为断言 ✓（`indexOf(anchor) === -1 ⇒ 立即红` ✓），并在**每次 T3** 里被真正跑到 ✓✓ —— 这正是"T3 每 2–3 期集一次"不可被省掉的原因 ✓。

**该红的修复（已落地 ✓，只动测试 ✓）**：该守卫此后长成**五条**断言（缺省／`rejected`／`obstacle`／非法具名拒／回到缺省 ✓），而原变异把解析**整体**写死 ⇒ **同时打断多条** ✗，违背本族"**单点必红**" ✓。⇒ 把变异**收窄为"只把 `rejected` 走错档"** ✓（`const T = (String(track) === 'rejected') ? 'narrative' : …` ✓），使失败恰好落在期望的那条 ✓✓。
**定向验证**（`MUTANTS_ONLY='S25B'` ✓；该模式**自我标注"DIRECTED、非全量证据"** ✓）：`2/2 具名红` ＋ `ALL MUTANTS RED AS REQUIRED`，**4 s** ✓；红文与 `expect` **逐字相符** ✓。**全量 T3 将在下一轮跑一次收尾确认** ✓。
