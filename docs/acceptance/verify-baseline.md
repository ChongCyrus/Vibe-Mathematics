# vmu 验证 · 门禁 · 真机交付面 —— 交接基线

> 任务：`task-3`（vmu 验证 / 门禁 / 真机交付面：交接基线侦察）
> 仓库：`D:\wd\vibemath开发\Vibe-Mathematics`（git，分支 `main`，HEAD `6d0164e`，工作区干净）
> 侦察日期：2026-10-14 · 侦察轮**只读**，另加**两次有界实测**（§4）
> 遵守的硬约束：未修改仓库任何文件（含 `tests/`）、未 `git commit/push`、未装依赖、**未跑 `GATE_SCOPE=full` 全量 sweep**
> 唯一写入文件：本文件

---

## 0. 结论先行（TL;DR）

1. **套件不是空绿，但我这次跑到的绿是「窄绿 + 标签错」**：`GATE_SCOPE=quick` 被 `--only` **静默降级为 `full`**，所以那次「quick + vmu」实际跑的是「全量作业表 ∩ 文件名含 `vmu`」= **177 个作业全绿**，而不是 36 个的 quick 子集，也**不等于**文档定义的 `GATE_SCOPE=vmu`（256 作业）。
2. **当前 HEAD `6d0164e` 没有任何「全量非增量全绿」记录**。仓库里最后一次记录的 T3 全绿是 2026-10-09 的 `ea81436`（当时 **132** 作业，`TOTAL 132 PASS 132 FAIL 0`）；此后 22:57 的 T3 是红的（`45ec07c`，`v5-institute-fixes.mutants.mjs`），而作业数已从 132 涨到 **321**。交接时**不能**把「门禁绿」当作既成事实。
3. **发现一个「纸面守卫」**：`tests/run-tests.mjs:326` 声称 vmu 作用域的分类由 `tests/audit-scope-classification.test.mjs` 断言——**该文件在整个工作区不存在**。后果已经发生：`vmu-prompt-v5r-bridge.test.mjs` 因为名字里含 `prompt-v5`（`prompt-v5` ⊂ `prompt-v5r`）被 `GATE_SCOPE=vmu` **静默丢弃**。
4. **关键的 vmu 交付物不在版本控制里**：T0 预检 `_oneoff/vmu/tools/preflight.mjs`、17 关文档 linter `_oneoff/vmu/tools/check-docs.mjs`、唯一能选预设的真机驱动 `_oneoff/vm-drive/dsh-drive.mjs`、以及全部 `live/**` 真机证据，全在仓库**外**的 `D:\wd\vibemath开发\_oneoff\`。仓库里既没有 `_oneoff/` 也没有 `live/`（`Vibe-Mathematics\_oneoff` 实测不存在）。
5. **门禁文档自身的数字已漂移**（见 §6-R4）：`11-gates §5.1` 说 `--counts` = 249（177 套件+72 探针），实测是 **321（249 套件+72 探针）**；`docs/test-timing.md §1` 说并发 = min(4,CPU)，代码是 **min(2,CPU)**（`tests/run-tests.mjs:161`）。引用这些数字会同时误报**覆盖**和**成本**。

---

## 1. 测试结构分层

### 1.1 规模（现取，权威）

```powershell
PS> node tests/run-tests.mjs --counts
{"total":321,"suites":249,"probes":72,"incremental":false,"incrementalSkipped":0}   # EXIT=0
[stderr] run-tests: scope=full  jobs=321  concurrency=2
[stderr] run-tests: quick-scope self-check ok (36 jobs, no mutant family)
```

对照文件计数（同一批对象，口径不同，**不可混用**，`docs/audit-methodology.md:26-28`）：

| 口径 | 值 | 怎么来的 |
|---|---|---|
| 作业计数（job） | **321 = 249 套件 + 72 探针/变体** | `--counts`（唯一权威） |
| `tests/` 全部文件 | **326** | 递归列目录 |
| `tests/` 顶层 `.mjs` | **313** | 递归外的顶层；含 runner 自身与 `NEEDS_ARGS` |
| `vmu*` 顶层 `.mjs` | **167** | 任务书给的 167 与此一致 |
| quick 子集 | **36** | runner 自检硬断言 `QUICK_EXPECTED_JOBS`（`run-tests.mjs:306,791-795`） |
| vmu 子集 | **256 = 223 套件 + 33 探针** | 本次**复刻** `deriveJobs()+applyScope()` 派生（复刻对 full 给出 321，与 `--counts` 一致 ⇒ 可信） |

### 1.2 分层与代表文件（断言要点取自文件头/文档 §2.1 的可追溯表）

| 层 | 代表文件 | 断言要点（它守什么） |
|---|---|---|
| **kernel 单元** | `vmu-kernel.test.mjs`、`vmu-store.test.mjs`、`vmu-bus.test.mjs`、`vmu-transaction.test.mjs`、`vmu-scheduler.test.mjs`、`vmu-stateversion.test.mjs` | kernel 成员表 vs `status().guards.registered`（新增未登记守卫 ⇒ 红，`11-gates:118`）；store 的「并发丢写/迁移失败/无会话日志」四个场景各系一个真实缺陷（`11-gates:64`） |
| **工具面** | `vmu-<name>-tool.test.mjs`（约 30 对，如 `vmu-admission-tool`/`vmu-arbitration-tool`）、`vmu-tools-action-arity.test.mjs`、`vmu-tools-await-rejections.test.mjs`、`vmu-tools-filter.test.mjs`、`vmu-mathtools-tool.test.mjs` | 工具必须经宿主路径真被调用；动作元数（arity）与 spellings；未 await 的 rejection 不得吞；`audit-registration.mjs` L69 断言「每个注册工具都满足宿主强制输出契约」（`11-gates:56`） |
| **契约门** | `vmu-charter-contracts.test.mjs`、`vmu-turn-contracts.test.mjs`、`audit-vmu-services.test.mjs`、`audit-vmu-orphan-methods.test.mjs`、`audit-vmu-wired-union.test.mjs`、`vmu-wiring-index.test.mjs` | 「已注册的服务必须真的被构造，且每个被构造的面必须被注册并暴露」（`11-gates:61`）；孤儿方法 ⇒ 红；生成物与源码树一致 |
| **管线 / 行为** | `vmu-budget-pipeline`、`vmu-collab-pipeline`、`vmu-formal-pipeline`、`vmu-publication-pipeline`、`vmu-turn.test.mjs`、`vmu-workflow.test.mjs`、`vmu-meetings.test.mjs`、`vmu-memory.test.mjs` | 会议/表决/归档/预算/中间件/控制流的 mock 宿主场景（`11-gates:14` 的 B 类）；场景退出码非 0 且**带具名失败行** |
| **静态门（文档即门禁）** | 见 §3 全表（`audit-vmu-docs`、`audit-doc-vs-code-tables`、`audit-hook-coverage`、`audit-service-coverage`、`audit-kernel-index`、`audit-planned-*`、`audit-verbatim-claims`、`audit-claim-traceability`、`audit-vmu-release`、`audit-vmu-maturity-table`…） | 读源码/文档文本断言形状与登记一致性；失败必须具名打印**哪一条**（`11-gates:13`） |
| **变异族** | `audit-vmu-docs.mutants.mjs`、`audit-vmu-release.mutants.mjs`、`audit-vmu-services.mutants.mjs`（vmu 侧 3 族）＋ 仓库级 26+ 族 | 单点变异 + 要求守卫**按名**变红；`no named red` / `HANG` / `anchor x0` 都算失败（`11-gates:15`） |
| **e2e / 真机替代** | `vmu-entry.test.mjs`、`vmu-loader.test.mjs`、`vmu-containment.test.mjs`、`vmu-ab-v5r.test.mjs`、`vmu-ab-v5r-verification.test.mjs`、`vmu-ab-v5r-meetings.test.mjs`、`vmu-replay.test.mjs`、`vmu-repropack.test.mjs`、`vmu-prompt-v5r-bridge.test.mjs` | v5r 行为核在框架现况下可跑（P3 报告做成可执行，`11-gates:69`）；A/B 双向量化（正向 706/823 行=86%、只看散文 632/642=98%；反向 fidelity 398/1478=27%，`11-gates:327`） |

**E 类（真机）不在 `tests/` 里，也不可能在**（`11-gates:18`）。

---

## 2. 运行手册：`tests/run-tests.mjs` 的**确切**语义

### 2.1 收集规则（决定「什么算一个作业」）

- 扫 `tests/` **顶层**（不递归）所有 `.mjs`：`*.test.mjs` = **suite**，其余 = **probe**（`run-tests.mjs:738-752`）。
- 排除三类：runner 自身 `run-tests.mjs`、`NEEDS_ARGS`（当前只有 `audit-tool-exec.mjs`，必须带 `<preset-js> <tool-name>`）、`replaceBare` 的裸作业（`audit-registration.mjs`、`v5-institute-fixes.mutants.mjs`）。
- `VARIANTS`（12 条）额外登记仪器化运行，**kind 一律 probe**（`run-tests.mjs:693-723`）：`audit-registration.mjs` 四预设各一次；`audit-prompt-invariants --self-probe`；`audit-participant-set-parity --self-probe`；`v5-institute-fixes.mutants.mjs shard=0/3|1/3|2/3`；`audit-math-computation-parity --self-probe`；`math-computation-shared --self-probe`；`audit-v3-registration-parity --self-probe`（**成功 = exit 1**，用 `expectExit` 表达）。
- `NEEDS_ARGS` / `VARIANTS` 里出现**不存在的文件**，在开发检出（有 `.git`）里 ⇒ **直接 exit 2**（`run-tests.mjs:742-746,754-756`）：改名不可能悄悄把守卫踢出门禁。

### 2.2 `GATE_SCOPE`（`run-tests.mjs:276-353`）

| 值 | 语义 | 实测/派生作业数 |
|---|---|---|
| `full`（**默认**） | 恒等：跑全部作业 | **321** |
| `quick` | 白名单 `QUICK_ONLY`（v5 相关 + 共享 parity/契约 + 注册面 + 若干文档门）**减去** `QUICK_EXCLUDE`（`mutants`、`audit-math-computation-sensitivity`） | **36**（runner 自身硬断言，每次运行都校验：数量必须 = 36 且**不得含任何变异族**，`run-tests.mjs:787-801`） |
| `vmu` | **默认包含**（DEFAULT-INCLUDE）减去 `VMU_EXCLUDE` 名单；新守卫从写下那一刻起就在范围内 | **256**（223 套件 + 33 探针） |

- 也接受 `--scope quick|vmu|full`；未知值 ⇒ `exit 2`（`run-tests.mjs:349-353`）。
- `vmu` 的作用域设计理由（`run-tests.mjs:314-336`）：曾经用白名单（ALLOW-LIST），第 519 轮实测**只覆盖 254 个文件里的 139 个、漏跑 115 个**（含 `audit-zpolicy`、`audit-code-size`、`audit-dependency-cycles`…），于是改成「默认包含 + 显式排除」。
- `VMU_EXCLUDE` 实际排除 **63** 个文件；其中 vmu 相关 **4** 个：`audit-vmu-docs.mutants.mjs` / `audit-vmu-release.mutants.mjs` / `audit-vmu-services.mutants.mjs`（**有意**，变异族留给 full/incremental）＋ **`vmu-prompt-v5r-bridge.test.mjs`（意外！`prompt-v5` ⊂ `prompt-v5r`）**。

### 2.3 ⚠️ 机器模式会**静默**把作用域改回 `full`

```js
// run-tests.mjs:354-363
const MACHINE_MODE = has('counts') || has('self-check') || flag('only').length > 0
const SCOPE = MACHINE_MODE ? 'full' : GATE_SCOPE
```

- `--counts` / `--self-check` / **任何 `--only`** ⇒ 生效作用域 = `full`；`--json` **故意不在**这个名单里（`run-tests.mjs:360-361`）。
- 当请求作用域 ≠ 生效作用域时，stderr 会打一行警告（`run-tests.mjs:779-781`），但 stdout 上方的 header 仍写 `scope=<请求值>`，**极易误读**。
- **后果（本次实测命中）**：`GATE_SCOPE=quick node tests/run-tests.mjs --only vmu --json` 打印 `scope=quick jobs=177`，实际是「全量表 ∩ 名字含 `vmu`」，**不是** 36 的 quick，也**不是** 256 的 `vmu`。
- `--write-baseline` 在 `GATE_SCOPE!=full` 时**拒绝执行**并变红（`run-tests.mjs:1032-1038`）；红树也拒绝（1036-1038）。

### 2.4 其余开关（确切语义）

| 开关 | 语义 | 位置 |
|---|---|---|
| `--only <子串>` | 可重复，**OR**；匹配 `label = 文件名 + ' ' + args` 的子串 | `run-tests.mjs:104,769` |
| `--exclude <子串>` | 可重复，**OR**；命中即跳过 | `run-tests.mjs:105,770` |
| `--json` | stdout 输出机器可读汇总（`wallSeconds/sumSeconds/pass/fail/suites/probes/runs[]`）；**日志一律 stderr**；失败项额外带 `detail` | `run-tests.mjs:990-1006` |
| `--counts` | 打印派生计数 JSON 后**立即退出**（不跑作业） | `run-tests.mjs:833-840` |
| `--self-check` | 证明诊断/超时/override/incremental/headstart 机制**真的能红**（含合成失败子进程 + 睡眠作业 + 假基线） | `run-tests.mjs:599-683` |
| `--concurrency=N` | 默认 **`min(2, cpus)`** | `run-tests.mjs:161` |
| `--temp-age-hours` / `--temp-dry-run` / `--no-temp-hygiene` | 临时卫生：清扫 `os.tmpdir()` **顶层**、前缀来自 `tests/*.mjs` 的 `mkdtempSync`、且 mtime 早于阈值（默认 6h）的目录 | `run-tests.mjs:115-136` |
| 超时 | 套件默认 **180000 ms**；`*.mutants.mjs` 默认 **2400000 ms**；具名 `TIMEOUT_OVERRIDES`（`v2-fix-probes` 1200s、`v3-fix-probes` 900s、`v5-institute-fixes` 2400s、`e2e-v4-fixes` 420s、`formal-verify-v4.mutants` 900s、`run-tests.mutants` 900s） | `run-tests.mjs:164-241` |
| `GATE_SUITE_TIMEOUT_MS` / `GATE_FAMILY_TIMEOUT_MS` | 覆盖上述默认 | `run-tests.mjs:168,179` |
| `GATE_HEADSTART_MIN_MS`（默认 600000）/ `GATE_HEADSTART_MS`（默认 180000） | 最长作业先独占跑；`0` 关闭 | `run-tests.mjs:506-553` |

### 2.5 `GATE_INCREMENTAL` / `GATE_BASELINE_FILE`（增量全量）

- `GATE_INCREMENTAL=1`（**默认关**）：只在 **full** 下生效（`SCOPE!=='full'` ⇒ 不启用，`run-tests.mjs:478-480`），且 `GATE_RELEASE=1` 会**完全忽略它**（481-483）。
- **基线**：`GATE_BASELINE_FILE`，默认 `D:\_tmp\gate-full-baseline.txt`，内容是一个 commit id（`run-tests.mjs:444`）；runner **只读**它。写入方式：绿的全量 sweep 后 `git rev-parse HEAD > D:\_tmp\gate-full-baseline.txt`，或本 runner 的 `--write-baseline`（**仅 FULL+全绿**才写）。
- 跳过规则：仅当某变异族的**声明目标集**（`FAMILY_TARGETS`）中**每个**文件自基线以来都未变，才跳过该族；**作业表永不缩小**，跳过的仍计入 TOTAL 并打印 `SKIP <family> (incremental: targets unchanged …)`（`run-tests.mjs:52-67,495-503,807-814`）。
- **绝不静默欠跑**：基线不可读 / 不是 HEAD 的祖先 / `git diff|status` 失败 / 族未声明目标 / 声明目标与 runner 自己从源码重导出的目标不一致 ⇒ **该族照跑**，并在 stderr 写明原因（`run-tests.mjs:429-440,484-494`）。
- 跳过正确性有**事后自检**：任何被跳过的族的任一目标若真在变更集里 ⇒ 具名变红并退出（`run-tests.mjs:820-828`）。
- `scripts/update-doc-counts.mjs` 与 `audit-readme-counts` 会**以 `--counts` 的口径核对文档计数**，所以增量模式下 `--counts` 仍报仓库总数（`run-tests.mjs:354-363` + `docs/audit-methodology.md:61`）。

### 2.6 推荐用法（含「成本必须现场量」的纪律）

```powershell
# 编辑循环（便宜）：36 作业
$env:GATE_SCOPE='quick'; node tests/run-tests.mjs

# vmu 开发循环（256 作业，含全部共享面门禁；不含变异族）
$env:GATE_SCOPE='vmu';    node tests/run-tests.mjs

# 只跑某一类（注意：--only 会把作用域强制成 full）
node tests/run-tests.mjs --only vmu-dimension --json

# 提交前 / 发布前：全量非增量（默认即 full；发布/打标签必须显式 GATE_RELEASE=1）
$env:GATE_RELEASE='1'; node tests/run-tests.mjs

# 共享编排面改动（runner/helpers/build-preset-rows/cordis.patch.yml/installer.js/package.json）
$env:GATE_INCREMENTAL='1'; node tests/run-tests.mjs

# 快速看计数与诊断机制本身
node tests/run-tests.mjs --counts
node tests/run-tests.mjs --self-check
```

**⚠️ 成本（三个在仓库里互相矛盾的说法，一个都不要照抄）**：

| 来源 | 主张 | 判断 |
|---|---|---|
| `docs/test-timing.md:11,54` | 并发 = min(4,CPU)；321 作业 **≈121 s wall**（当前 ≈200 s） | **与代码矛盾**（`run-tests.mjs:161` 是 min(2,CPU)）；且未含现在更重的族 |
| `tests/run-tests.mjs:46-51` | 全量 **REQUIRED**；1878.1 s → ~**1447.6 s**（LPT **模拟**，那次是 **106** 作业） | 模拟值，来自旧作业表 |
| `vibe-math-vmu/docs/11-gates-and-development.md:341-343` | 2026-10-09 三次 T3（`GATE_RELEASE=1`）各 **31 min**，其中 2 次红（都是 `v5-institute-fixes.mutants.mjs`） | **唯一有记录的真实全量墙钟** |

⇒ **本轮的纪律建议**：把「全量 ≈24 分钟」当作**量级**（几十分钟），**不要**当数字引用；首次在交接树上跑 full 时**自己计时并更新** `docs/test-timing.md`。**我本轮没有跑 full**（任务禁止），所以本文件不提供 full 的实测值。

**其他必须记住的坑**：
- stdout 是**机器通道**（`--counts`/`--json` 会被脚本 `JSON.parse`），日志必须走 stderr；**`| Select-Object -First N` 会截断管道并提前杀子进程**（`exit=-1` 是截断不是失败）——`11-gates:180`。
- PowerShell 的 `>` 会把 stdout **重编码成 UTF-16LE**（本次实测：`vmu-verify-only.out.json` 首字节 `ff fe 7b 00`，`JSON.parse` 直接报 `Unexpected token '\uFFFD'`）。读回时要么 `Out-File -Encoding utf8`，要么读字节后 `toString('utf16le')`。
- 跑前先 `node scripts/clean-temp.mjs --ps` 看遗留进程：一只遗留宿主（父进程已消失、烧掉 197,410 s CPU）曾把整场门禁从 **1371 s 拖到 6705 s**（`docs/audit-methodology.md:93`）。
- 门禁启动会把 `TEMP` 指向 `D:\_tmp`（本次实测 `run-tests: temp root -> D:\_tmp`），子进程继承 ⇒ 套件临时目录落在 D 盘。

---

## 3. 静态门清单（「文档即门禁」类）

> 读法：**不变量** = 它守什么；**输入** = 它读什么（含可注入接缝）；**可证伪** = 配套变异族/自探针。

### 3.1 vmu 专属门

| 门 | 不变量 | 输入 / 接缝 | 可证伪 |
|---|---|---|---|
| `tests/audit-vmu-docs.test.mjs`（468 行） | A 设计卷 `00..N` 存在且非平凡，且**从 00 起连续编号**（是「下限+连续」**不是等号**，为了允许扩张）；B 文档里出现的每个 `VMU_*` 码都在 03 错误码表登记；C **代码能抛出的**每个 `VMU_*` 码也登记；D 文档↔模块公共面（03 §2.1 行 vs 模块导出）；E 必须声明未核项的卷（02/03/08/12…）有「未核项」节 | `VMU_DOCS_DIR`（默认 `vibe-math-vmu/docs`）、`VMU_CODE_DIR`（默认 `vibe-math-vmu`）——`:27-28`；另读 `vibe-math-vmu/host.js` 的 `TOOL_NAMES`（`:21`）与 `scripts/generate-vmu-settings-table.mjs` 的 `hasConsumer`（`:17`） | `audit-vmu-docs.mutants.mjs`（M1–M14 + 控制组，见 §4.3） |
| `tests/audit-doc-vs-code-tables.test.mjs`（147 行） | 三张自称「逐字/与代码一致」的表：① `06 §4` 的 `ORDER_RANGES` 与 `kernel/prompt/index.js` 的 `ORDER_RANGES` 同边界（`:32-38`）；② `06 §3` 的 `register()` 字段表与代码字面量块一致（**曾漏 `lang`**，`:41-45`）；③ `08 §11.4` 钩子表 ✓/✗ 与 `VU_HOOKS` 一致（`:6-7`）。**第四张（`03 §2` 服务表）按设计不完整**，断言改为「它自己明说只举 8/72」（`:8-9`） | 卷 06/08/03 + `kernel/prompt/index.js` + `kernel/bus.js` 的 `VU_HOOKS` | 属 vmu-docs 族的同批变异面 |
| `tests/audit-hook-coverage.test.mjs`（63 行） | **两个方向**：① 每个被冻结的 `VU_HOOKS` 名字必须有 `emit(` 站点（否则是纸面能力，中间件永远挂不上）；② **vmu 命名空间内的 emit 必须被冻结**（`kernel/budget.js` 的 `budget/warn` 曾被 bus 拒绝并抛出未 await 异常，`:5-6`） | `kernel/bus.js`（`VU_HOOKS` 与 `VU_NAMESPACE` 正则，`:31-33`）+ 遍历 `vibe-math-vmu/**/*.js` 找 `emit('name'`（`:41`） | 具名断言 `neverEmitted`（`:42-44`） |
| `tests/audit-service-coverage.test.mjs`（70 行） | **双向**：每个 `registry.register('vmu.x')` 的名字必须出现在某卷里（否则 pack 作者无法查它是什么）；反过来，卷里引用的服务名必须真的被注册（不能承诺不存在的服务） | `vibe-math-vmu/**/*.js` 的注册调用点（`:32-35`）+ `vibe-math-vmu/docs/NN-*.md` 全文（`:40-42`） | 具名 `unnamed`（`:42-45`） |
| `tests/audit-kernel-index.test.mjs`（68 行） | ① kernel 每个模块都有**可用头注释**（首个 `//` 块 ≥25 字符，否则索引会静默出现空行）；② `docs/02` 的 kernel 索引与目录**双向一致**——由 `scripts/generate-kernel-index.mjs --check` 生成/核对 | `vibe-math-vmu/kernel/*.js` + 生成器（`:26-40,41+`） | 生成器 `--check` 退出码 |
| `tests/audit-planned-names.test.mjs`（219 行） | 只判**两种**缺陷：① planned 行点名了一个**已注册的工具**；② planned 行点名了**已作为 action 存在**的能力而没说。**「什么都没有」的 planned 行不是缺陷**（早期版本过严已撤回，`:6-11`）。判 planned 只看 HEAD 单元格 1..3（`:12-15`） | `vibe-math-vmu/docs` 里带此类表的卷（当前 6 卷，`:17`）+ 从 host 源码读的 surface（`:37-40`） | 谓词在**合成表**上跑一遍（`:17-18`） |
| `tests/audit-planned-tools-inventory.test.mjs`（48 行） | `docs/14` 的 planned-tool 清单与各卷的 `⛔` 标记**双向**一致：卷新增 planned 工具 ⇒ 必须进清单；清单点名 ⇒ 卷必须计划它 | 卷 `NN-*.md`（排除 `28*`）里 `` `vibe_vmu_*` `` 与 `⛔` 相邻的文本（`:26-30`）+ `docs/14` | 双向具名断言 |
| `tests/audit-verbatim-claims.test.mjs`（70 行） | 任何自称「逐字/逐项来自/等于代码/与代码一致/按代码」的行，**必须点名至少一个反引号符号或路径**，且点名的路径必须能在树里解析（163 行里 110 行「什么都没说」正是要治的病，`:1-7`） | `vibe-math-vmu/docs/NN-*.md`（`:26-27`）+ 候选目录白名单（`:30-32`） | 具名 `anonymous` / `dangling` |
| `tests/audit-claim-traceability.test.mjs`（86 行） | 把「claim id 可解析」从一卷推广到全部卷；**两处假阳性显式处理**：`P50/P95` 百分位按名排除（且断言排除集非空，不能变成垃圾场）；`D11/D12/G8/G11/G13/G17` 定义在**仓库外** `_oneoff/vmu/design`，逐条列出定义文件——**「缺口被记录，不是被藏起来」**（`:1-10,39-47`） | 全部 vmu 卷 + `tests/`+`scripts/`+`vibe-math-vmu/` 的 `.mjs/.js` 源码（`:35-36`） | 具名断言 |
| `tests/audit-vmu-release.test.mjs`（103 行） | F 四种中间件形态（M1 规则/M2 模块/M3 脚本/M4 pack）各至少一个场景作业，**且该作业在 `package.json#files` 里**（形态无场景=未验证）；G `11-gates §9.6` 真机矩阵每行状态取自允许集，**每个 PASS 行必须给出非空证据路径**（PASS 不带路径正是 playbook 禁止的过度声称）；H 随包预设真的声明本包的插件行；I `docs/05` 点名四种形态 | `VMU_DOCS_DIR`、`VMU_PKG`（默认 `package.json`）、`VMU_PRESET`（默认 `agent.cordis.yml`）——`:24-28` | `audit-vmu-release.mutants.mjs` |
| `tests/audit-vmu-maturity-table.mjs`（102 行） | `22-§0.1` 自称「实测」的成熟度表**逐行**与生成设置表的「已接线/总数」对账（按 family）；漂移 ⇒ exit 1。`--quiet` 只打摘要，`--selftest` 证明它不会空过 | 生成设置表文本（`measured()`，`:20-30`）+ 卷 22 | `--selftest`（导出 `measured` 供喂坏数据） |
| `tests/audit-vmu-glossary.test.mjs` / `audit-vmu-services.test.mjs` / `audit-vmu-wired-union.test.mjs` / `audit-vmu-orphan-methods.test.mjs` | 术语表 ↔ 实现；注册⇒构造⇒暴露；wired 并集；孤儿方法 | 本轮**未逐个打开**（只按名字与 `11-gates:61` 定性）——列此以免读者以为已核 | 各自有变异族（`audit-vmu-services.mutants.mjs`） |

### 3.2 与 vmu 相邻的仓库级门（vmu 作用域会跑，vmu 改动能碰到）

`audit-preset-rows`、`audit-preset-declaration-group`、`audit-preset-mechanism`、`audit-installer-compat`、`audit-installer-policy`、`audit-installer-assertions.mutants`、`audit-readme-counts(+mutants)`、`audit-package-membership(+mutants)`、`audit-path-discipline(+mutants)`、`audit-artifact-docs(+mutants)`、`audit-status-report-fields(+mutants)`、`audit-math-computation-parity`/`-contract`（+mutants）、`audit-code-size`、`audit-dependency-cycles`、`audit-zpolicy`、`audit-engine-faces`（**引擎缺席时打印 `SKIP: no <engine>…`，不判红**，`docs/test-timing.md:66`），以及**生成物 `--check` 族**：`build-preset-rows`、`generate-{glossary-table,kernel-index,pack-persona,pack-prompts,planned-codes,planned-settings,seam-table,surface-index,vmu-settings-table,wired-schema,wiring-index,zero-mechanism-matrix}`、`update-doc-counts`（实测这 14 个脚本都实现了 `--check`）。

---

## 4. 实测记录（原样）

### 4.1 主实测：任务书建议的命令（**原样执行**）

```powershell
cd D:\wd\vibemath开发\Vibe-Mathematics
$env:GATE_SCOPE='quick'
node tests/run-tests.mjs --only vmu --json
```

**耗时 / 退出码**：进程墙钟 **145.1 s**；`EXIT=0`（JSON 内 `wallSeconds 142.4`、`sumSeconds 225.3`）。
**汇总**：`pass 177  fail 0  suites 173  probes 4  devCheckout true  incremental false`。
**失败/超时清单：空**（`exit !== expectExit` 的作业数 = 0；无 TIMEOUT）。

stderr 关键片段（**证明 §2.3 的静默降级**）：

```
run-tests: temp root -> D:\_tmp (roomier drive preferred; D:\_tmp when present)
temp-hygiene: root=D:\_tmp scanned=9159 stale=0 deleted=0 failed=0 ageHours=6
run-tests: scope=quick  jobs=177  concurrency=2
run-tests: requested scope=quick but the EFFECTIVE scope is full - machine modes (--counts / --self-check / --only)
           always run the full list BY DESIGN, so this job count is the repository count, not the scoped one
run-tests: incremental disabled -> running everything (GATE_INCREMENTAL not set (default = full sweep))
```

最慢 10 项（`--json` 的 `runs[].seconds`）：

```
 67.7s audit-vmu-docs.mutants.mjs
 60.0s vmu-wiring-index.test.mjs
 14.0s vmu-planned-settings.test.mjs
  7.9s audit-vmu-orphan-methods.test.mjs
  6.3s audit-vmu-docs.test.mjs
  3.8s vmu-planned-codes.test.mjs
  3.6s vmu-entry.test.mjs
  2.9s audit-vmu-services.mutants.mjs
  2.0s audit-vmu-release.mutants.mjs
  1.8s audit-vmu-wired-union.test.mjs
```

> 这 177 个作业**全部**名字含 `vmu`（`runs.filter(file.includes('vmu')).length === 177`），且**包含 3 个 vmu 变异族**（`--only` 不排除 `mutants`）——所以它比 `GATE_SCOPE=vmu`（256 作业，**不含**变异族）**窄**，但比 quick（36）**宽**。**两者都不是对方的替代**。

### 4.2 计数（现取，权威）

```powershell
PS> node tests/run-tests.mjs --counts
{"total":321,"suites":249,"probes":72,"incremental":false,"incrementalSkipped":0}    # EXIT=0
```

派生对照（复刻 `deriveJobs()+applyScope()`，对 full 复现 321 ⇒ 与 `--counts` 一致）：`vmuScopeJobs 256 (suites 223 / probes 33)`；`quickScopeJobs 36`；`onlyVmuJobs 177`；`vmuScope 内变异族 = 0`；**被 `GATE_SCOPE=vmu` 丢掉的 `vmu*` 文件** = `audit-vmu-docs.mutants.mjs`、`audit-vmu-release.mutants.mjs`、`audit-vmu-services.mutants.mjs`、**`vmu-prompt-v5r-bridge.test.mjs`**。

### 4.3 反「空绿」实测：直接跑一个 vmu 变异族

```powershell
PS> node tests/audit-vmu-docs.mutants.mjs
=== VMU DOCS AUDIT MUTANTS: 15 passed, 0 failed ===     # EXIT=0，WALL=40.1s
```

- 该族 **15 = M1..M14 + 控制组**；每个 mutant 都把真实设计集/模块 `cpSync` 到 scratch，**只坏一处**，用注入接缝（`VMU_DOCS_DIR`/`VMU_CODE_DIR`）让 `audit-vmu-docs.test.mjs` 变红，并**要求命中具名正则**（如 `/design set is numbered contiguously from 00/`、`/does not expose methods the contract omits/` + `/mutantExtraSurface/`），**还要求未变异的副本保持绿**（`:211-214`）。所以「15 passed」不是数退出码，是 15 条具名红 + 1 条控制绿。
- 该族**只在失败时**打印细节，绿时只有一行汇总——`--json` 模式更进一步：**通过作业的 stdout 完全不进 JSON**（只有失败项带 `detail`，`run-tests.mjs:893-896`）。⇒ **机器模式下的「绿」无法自证变异族真的跑了具名红**，审查者必须直接跑该族。
- **负载敏感实测**：同一族在门禁里 **67.7 s**、单独跑 **40.1 s**（×1.69）——与仓库自述的并发放大一致（`11-gates:119`、`docs/audit-methodology.md:93`）。

### 4.4 卫生 / 未改仓库

```powershell
PS> git -C D:\wd\vibemath开发\Vibe-Mathematics status --porcelain
（空）           # 跑测前后均为空；EXIT=0
```

- 未在 `D:\_tmp` 留下 `vmu-docs-mutants-*` 或 `vibe-gate-tex-sandbox-*`（族自己在 `:216` 清 scratch；runner 用 `process.on('exit')` 清 tex 沙箱）。
- `D:\_tmp` 当前有 **3411** 个目录（其中 `vmu-*` **1582**），但门禁卫生扫描 `scanned=9159 stale=0 deleted=0` ⇒ 都**不到 6h**，按仓库约定**不删**。
- `%TEMP%`（`C:\Users\admin\AppData\Local\Temp\1`）残留 **178** 个 `vmu-*` 目录，**176 个 >6h**（最老 2026-10-12 13:03）。其中最新的两个（`vmu-probe2-ua0M3I`/`vmu-probe-c68Uql`，12:35）**不是本轮的**（本轮 mutant scratch 有独立前缀且已自清；12:35 时我也已无 node 子进程；同机三位队友并行是更可能来源）⇒ **未删除**（非我所有，且按 `clean-temp` 约定未到阈值）。**这是观察，不是仓库违规**，但见 §6-R9。

---

## 5. 真机 / 发布交付面

### 5.1 `scripts/release-check.mjs` 的门禁条件（读全文，181 行）

| 检查 | 条件 | 位置 |
|---|---|---|
| 版本三处一致 | `package.json.version` = `package-lock.json.version` = `lock.packages[""].version` | `:29-35,123` |
| `dsh.compatNote` | 必须**提到当前版本号**（用户可见文本，历史上描述过上一版） | `:72-75,124` |
| 两份发布说明 | `docs/release-notes/RELEASE-NOTES-<v>.md` 与 `.en.md` **都存在**；各自**恰好 8 个章节、顺序与模板一致**（zh 8 / en 8，`:38-50`）；**都登记在 `package.json#files`** | `:126-132` |
| 清单 ↔ tarball | `npm pack --dry-run --json` 的包内文件必须覆盖 `files[]` 声明的每个文件（声明了但缺失 = FAIL） | `:53-56,139-142` |
| 开发专用文件 | `.gitattributes` **不得**随包（可扩展 `devOnly` 列表） | `:59-62,143` |
| 行尾 | 真实 `npm pack` + `tar -xzf` 解包后，对 `.js/.mjs/.cjs/.json/.md/.yml/.yaml/.txt/.svg` 扫 **CRLF 必须为 0**（tarball 逐字节可复现的前提） | `:65-69,145-166` |
| 线上一致性 | `--registry`：`npm view <pkg>@<v> dist.shasum` 必须等于本地 tarball 的 sha1 | `:167-173` |
| 自证非空转 | `--self-test`：对 6 组谓词各喂正/反例（版本漂移、章节截断/乱序、缺失清单、随包 devOnly、CRLF、旧 compatNote） | `:78-108` |

配套变异族：`tests/release-check.mutants.mjs`（已登记在 `FAMILY_TARGETS`，`run-tests.mjs:383`）。

**⚠️ 关键缺口**：`release-check.mjs` 是**npm 包发布**门（版本/说明/tarball），**没有任何 vmu 专属检查**；vmu 的发布形状由 `tests/audit-vmu-release.test.mjs` 负责（§3.1），而它**不检查版本号/发布说明/tarball**。两者合起来才是 vmu 的发布面，`11-gates:194-203` 的发布门禁清单把两者都列了，但**没有任何单一命令同时跑两者**（`preflight.mjs` 也不跑 `release-check`）。

### 5.2 `docs/slv-playbook.md` 的可复现步骤（121 行，逐节）

1. **§1 隔离**：克隆一份 profile（**绝不用用户的**）→ 改克隆 `package.json` 的 `name` → 从**纯 ASCII** 临时 cwd 启动 `dsh --profile <clone> --port <自有端口> --no-open` → 从 stdout 那行 `http://127.0.0.1:<port>/?token=…` 取 token。认证实测：`GET /?token=` ⇒ **303 + Set-Cookie**；带 cookie `/api/*` = 200，不带 = **401**。RPC 信封**逐字**：`POST /api/<endpoint>`，body `{"type":"client-request","rpcId":"<唯一>","method":"<同名>","payload":{"args":{…}}}`，**`payload` 必须恰好是 `{"args":{…}}`**。profile 补丁是**顶层序列**，追加行必须从**第 0 列**开始。
2. **§2 模拟声明**：根会话第一条 user message 明示「这是一次模拟测试」；**断言方式不是声称**：在 `transcript.jsonl` 里 grep **用户原句 `这是一次模拟`**，命中必须落在 `user/message` 事件，报告要写**该事件的 `seq` + 文件行号**（实测形态 `{"sink":"user/message","seq":8,…}`）。另有「模拟/取反铁律」：必须**逐一否认**新代码能达成该条件的每条路径，断言里要有**否定性证据**（`exe === null` / `tried.length === N` / `result === 'not-detected'`）。
3. **§3 驱动 CLI**：23 个开关（`--profile --port --cwd --ws --preset --task --task-file --steer --steer-after --cancel --cancel-after --timeout --max-tokens --quiet --out --jsonl --follow --follow-stream --follow-members --allow-probe-patch --token --session --resume`）；`--steer-after` 是唯一的**中途注入**通道。
4. **§4 预算**：总 ≤ **2.5 M** tokens；最小 `configure`+`status` ≤50 k；v5 启动+1 轮 ≤250 k；v4 ≤900 k；2 名常驻会议 ≤600 k。实测成本量级：最小 ≈8 s；v4 ≈100 s / 732,888 tokens；v5 ≈21–25 s / ≈150 k。**触上限 = NON-RESULT，绝不写成 PASS**。
5. **§5 能/不能**：能建立「落位与可观测性」（工具真注册并返回真实结果、研究所/邮箱路径、会议首位发言、`math_computation` 的 probe/run）；**不能**建立收敛/收口结论（必须来自随包套件）、不能验证未安装引擎（只能核对 `configured` 与 `absent[]` 的**诚实文本**）、单客户端不能验证并发。
6. **§6 中止触发表**：模拟声明没落地 ⇒ 证据失败；触上限 ⇒ NON-RESULT；疑似产品缺陷 ⇒ **先单跑复现**；宿主限制 ⇒ 诚实边界。
7. **§7 清理**：只删**自己**的 session 目录 / 含自己 sessionId 的投影缓存 / 自己克隆的 profile 与端口；**绝不按时间窗批量删**（历史上误删过别人的投影缓存）。
8. **§9 教训**：关键词计数不是站点清单；守卫必须**逐分支**验证真能变红；**「单跑绿 ≠ 门禁绿」**；stdout 是机器通道；被杀死的作业不会自清。

### 5.3 `_oneoff/vmu/live/2026-10-09/**` 证据可信度：**混合，但驱动是「脚本化 RPC 打真宿主」**

目录共 **24** 个（另有 `live/2026-10-10/` 6 个）。判定依据（每个都给出了可复核的命令行）：

| 类别 | 目录（举例） | 决定性证据 | 可信度 |
|---|---|---|---|
| **真宿主 + 直连 CLI**（`dsh` 进程本身） | `preset-registration`、`session-boot`、`session-boot-wired` | `transcript.md`：`dsh --profile vmu-slv --dump-config`（注册面 166,867 bytes 快照 `status.json`）、`dsh --profile vmu-h --help`、`dsh --profile vmu-h --json "reply: ready"`（exit 0，8 行事件） | **强**（是真宿主；但只证明「装得上 / 起得来」） |
| **真宿主 + 外部脚本驱动 RPC**（主力） | `p0-configured`、`p0-final`、`p1-durable-*`、`p2-real-hooks`、`p2-m2-in-host`、`p2-pack-in-host-single`、`p2-instance-identity`、`2026-10-10/p2-m3-stack4` | `transcript.md`：`node _oneoff/vm-drive/dsh-drive.mjs selftest --profile vmu-slv --port 7801 --preset vibe-math-vmu --task-file …`；产物有真实 `summary.json`（真 `sessionId`、token 计数、`durationSec`）与 `transcript.jsonl` | **中—强**：宿主是真的、**预设选择是程序化的 `--preset`**（不是 GUI）；这是目前唯一能到达「预设激活 + 工具面」的路径 |
| **脚本/模拟/对照** | `scripted-session`、`scripted-session-fixed`、`scripted-session-pass`、`diag-apply`、`p3-v5r-side`、`p3-vmu-side` | 目录名 + `server.log`/无 `transcript.md`；`diag-apply` 只有 `server.log`/`server2.log`/两份 `transcript*.jsonl` | **弱—中**：不能当独立真机证据，只能当对照/调试记录 |
| **失败的对照轮** | `p2-m3-in-host{,2,3}`、`p2-pack-diag` | `11-gates:321-326`：前三轮是 **NON-RESULT**，根因**先是我方接缝把诊断吞了**，后是宿主 `dsh-subprocess-local` 对 `cwd===undefined` 零容忍（`runner-launch-*.js:1509 validateNoNullByte` ← `:1520`）；第 4 轮 `p2-m3-stack4` 才 PASS | **保留对照，价值高**（记录了解除过程与宿主缺陷**仍然存在**这一诚实边界） |

**`11-gates §9.6` 真机矩阵（截至 2026-10-10，12 行）**：P0 5 行 / P1 2 行 / P2 5 行**全部 PASS 且各有证据目录**（逐行见 `11-gates:310-321`）；P3 面级+行为级 A/B **PASS**（证据 `_oneoff/vmu/design/04-v5r-contrast-live.md`，双向量化数字见 `:327`）；**P4「公开服务版本可读（`contract()`）」= 部分**（库内可读、**真机未读**）；**P5「发布清单全过 + GUI（O2 前置）」= 未做**（`11-gates:328-329`）。矩阵本身被 `audit-vmu-release.test.mjs` 的 G 项守卫（PASS 行必须带非空证据路径）⇒ 该表的**形状**不可漂移。

**真机/发布面的缺口（明写）**：
1. **没有一次 GUI 预设选择器运行**——唯一的预设激活路径是程序化 `--preset`（`dsh-drive.mjs`）；GUI 面（`11-gates §8` 的 O2）**未核**（本机 `Slots.listSubTree` 超时）。
2. **P5 未做** ⇒ 「发布清单全过」从未在真机上跑过一轮。
3. **驱动/证据/预检/文档 linter 全部在仓库外**：`_oneoff/vm-drive/dsh-drive.mjs`、`_oneoff/vmu/tools/{preflight,check-docs,read-session-log}.mjs`、`_oneoff/vmu/live/**`。`Vibe-Mathematics\_oneoff` 实测**不存在**，`11-gates:333` 自述「仓库里没有 `live/` 与 `_oneoff/`」。⇒ **一次 clone 无法复现 T0 预检，也无法复现任何真机证据**（`_oneoff` 甚至不是 git 仓库）。
4. **`audit-claim-traceability` 自己承认** `D11/D12/G8/G11/G13/G17` 定义在仓库外。
5. **若干门的最强断言依赖仓库外资产**：`audit-math-computation-parity.mjs` 读 `_oneoff/mc-P1-ready/canonical` 与 `tool-schema.json`（`:26-27,282`）、`audit-participant-set-parity` 读 `_oneoff/review/participant-set-map.md`（`:4`）、`audit-preset-mechanism` 读 `_oneoff/roster-016a2.json`（`:22,47`）。这些资产在本工作区**存在**（实测 True），所以门是绿的；但 `audit-math-computation-parity.mjs:151` 是 `if (existsSync(canon)) ok(sha(canon)===…)`，**没有 else、没有具名 SKIP** ⇒ 资产缺席时该断言**静默消失**，门照绿。
6. **当前 HEAD 无全量绿记录**：`11-gates §9.7` 记的三次 T3 都在 2026-10-09（`TOTAL 132`，21:03 的 `ea81436` 那次 132/132 绿；22:57 的 `45ec07c` 红于 `v5-institute-fixes.mutants.mjs`，判定为负载下偶发、定向单跑 4/4 具名红）。作业数此后 132 → **321**。

---

## 6. 风险与空白（按严重度排序）

**先直接回答「当前的绿是不是空绿？」**

- **不是空绿，但也不是可交接的门禁绿。** 我实测的那次：177 个真实子进程、`sum 225.3 s / wall 142.4 s`、0 失败、跑测前后 `git status` 皆空；其中 3 个 vmu 变异族**真的运行了**，我还**单独复跑**了 `audit-vmu-docs.mutants.mjs`（exit 0，`15 passed, 0 failed`，40.1 s）证明它断言的是**具名红 + 控制组绿**，不是数退出码。
- 但它**窄且标签错**：`GATE_SCOPE=quick` 被 `--only` 静默改成 `full`，实际覆盖 = 「全量表 ∩ 名字含 vmu」= 177，**既不是 36 的 quick，也不是 256 的 `GATE_SCOPE=vmu`**。它**没有**跑 vmu 作用域本应包含的共享面门禁（`audit-preset-rows`、`audit-package-membership`、`audit-readme-counts`、`audit-path-discipline`、`audit-artifact-docs`、`audit-math-computation-{parity,contract}`、`run-tests --self-check`、临时卫生…）⇒ **它不能充抵 T1，更不能充抵 T3**。
- **仍然存在「空过」的洞**：R1/R2/R7 的守卫缺失/静默跳过/机器模式看不见（下）。

| # | 风险 | 证据 | 影响 |
|---|---|---|---|
| **R1** | **当前 HEAD 从未有全量非增量全绿记录**。作业数 132→321，最后 T3 绿在 1 个旧提交上 | `11-gates:341-343`（132 作业、31 min、2 次红）；`--counts` = 321（本次） | 交接时**不能称「门禁绿」**；必须先跑一次 `GATE_RELEASE=1 node tests/run-tests.mjs` 并计时 |
| **R2** | **纸面守卫**：`run-tests.mjs:326` 声称分类由 `tests/audit-scope-classification.test.mjs` 断言，**该文件不存在**（全工作区 glob 无命中，`grep` 仅命中这行注释） | `run-tests.mjs:316-340` 的注释 vs 实测不存在 | `GATE_SCOPE=vmu`（默认开发档）的分类**无门禁**，可静默丢作业 |
| **R3** | **该洞已经造成真实丢件**：`vmu-prompt-v5r-bridge.test.mjs`（vmu R8 提示词桥）被 `VMU_EXCLUDE` 的 `prompt-v5` 子串命中而踢出 `GATE_SCOPE=vmu` | 派生：`vmuFilesDroppedFromVmuScope` 四项；`:329` 的 `'prompt-v5'` 本意是排除**别的预设**的 `prompt-v5*` | vmu 的 R8 桥接只在 full/incremental 下跑；T1（日常档）长期漏网 |
| **R4** | **门禁文档自身数字漂移**（引用即误报覆盖与成本） | `11-gates:144`（`--counts`=249，177 套件+72 探针）vs 实测 **321**（249 套件+72 探针）；`docs/test-timing.md:11`（并发 min(4,CPU)）vs `run-tests.mjs:161`（min(2,CPU)）；`test-timing.md:54`（321 作业 ≈121–200 s）vs `run-tests.mjs:46-51`（模拟 1447.6 s）vs `11-gates:341-343`（31 min）；`11-gates:212`（T1 = 117 作业 / ≈132 s）vs 派生 **256** | 读者会把 vmu 作用域当成「117 作业、2 分钟」⇒ 低估成本、高估覆盖 |
| **R5** | **机器模式静默改作用域**：`--only`/`--counts`/`--self-check` ⇒ `full`，而 header 仍印请求值 | `run-tests.mjs:354-363,774-781`；本次实测 `scope=quick jobs=177` + 警告行 | 「bounded 命令」实际变成 177–321 作业；**任务书给的建议命令就踩中了** |
| **R6** | **交付物在版本控制外**：T0 预检、17 关 doc linter、真机驱动、全部 live 证据 | `_oneoff/vmu/tools/{preflight,check-docs,read-session-log,v5r-inventory}.mjs`、`_oneoff/vm-drive/dsh-drive.mjs`；`Vibe-Mathematics\_oneoff` 不存在；`11-gates:333` 自述 | clone 无法跑 T0、无法复现真机；交接后这些资产若丢失，文档里所有「已验」都变成不可复核字符串 |
| **R7** | **仓库外条件断言静默消失**（无 else / 无具名 SKIP） | `audit-math-computation-parity.mjs:151` `if (existsSync(canon)) ok(...)`；其它同类条件见 §5.3-5 | 干净 clone 上「最强的那条断言」不跑也不报 ⇒ 空过 |
| **R8** | **真机面缺 GUI 与 P5**：只有程序化 `--preset`；`contract()` 未在真机读；发布清单未在真机跑 | `11-gates:328-329`；`session-boot-wired/notes.md:13-20`（headless 无预设旗标） | 「预设激活 + 工具面」这条链**只在脚本化 RPC 下成立**；GUI/O2 面是空白 |
| **R9** | **负载与卫生**：门禁把 `TEMP` 指向 `D:\_tmp`，历史 `C:\...\Temp` 里 178 个 `vmu-*`（176 个 >6h）**永不被卫生清扫**；同机 3 名队友并行 + 4 核机 | 本次 stderr `root=D:\_tmp scanned=9159 stale=0 deleted=0`；`%TEMP%` 实测 | 磁盘堆积、且「单跑绿/门禁红」的时序抖动风险上升（`audit-methodology:93`） |
| **R10** | **`--json` 观测缺口**：通过作业的 stdout 不进 JSON，绿时无法自证变异具名红；变异族**绿时只打一行** | `run-tests.mjs:893-896,990-1006`；`audit-vmu-docs.mutants.mjs:217-219` | 机器化审计「绿=真的具名红」需要额外直跑族 |
| **R11** | 发布面**无单一命令**同时覆盖 npm 包门与 vmu 形状门 | `release-check.mjs` 全文无 vmu；`audit-vmu-release.test.mjs` 不管版本/tarball；`11-gates:194-203` 只列命令 | 「发布前全绿」容易只跑了一半 |

### 下一轮我可以独立负责（我是团队里唯一可改 `tests/` 与门禁脚本的人）

1. 新建 `tests/audit-scope-classification.test.mjs`（把 `QUICK_ONLY/QUICK_EXCLUDE/VMU_EXCLUDE` 的分类变成**双向可断言**的机器检查：每个 `vmu*` 套件必须显式在/不在 vmu 作用域，且必须给出理由），并修掉 `prompt-v5` ⊂ `prompt-v5r` 的子串碰撞。
2. 在交接树 HEAD 上跑一次 **`GATE_RELEASE=1` 全量非增量并计时**，把真实墙钟与 `TOTAL/PASS` 写回 `docs/test-timing.md`（替换三处互相矛盾的数字）。
3. 把 T0 预检（`preflight.mjs`）与 17 关 doc linter（`check-docs.mjs`）**搬进仓库**（`scripts/` 或 `tests/`），让 clone 能自查。
4. 给仓库外条件断言加**具名 SKIP**（`audit-math-computation-parity.mjs:151` 类）。
5. 给 `run-tests.mjs` 增一条「机器模式 + 作用域同现」的**具名红或强制显式确认**，让 R5 这类误用不能静默通过。
6. 把 `release-check.mjs` 与 `audit-vmu-release.test.mjs` 串成一条 `vmu` 发布门禁命令。

---

### 附：本文件用到的关键命令清单（可直接复跑）

```powershell
cd D:\wd\vibemath开发\Vibe-Mathematics
node tests/run-tests.mjs --counts                                  # 派生计数（权威）
$env:GATE_SCOPE='quick'; node tests/run-tests.mjs --only vmu --json # 本次主实测（注意作用域被降级为 full）
node tests/audit-vmu-docs.mutants.mjs                              # 反空绿：具名红 + 控制组
node tests/audit-vmu-docs.test.mjs                                 # 单门直跑（可看到逐条 ok/FAIL）
node scripts/release-check.mjs --skip-pack                         # 发布静态门（不打包）；--self-test 自证
node tests/run-tests.mjs --self-check                              # runner 自身诊断机制
node scripts/clean-temp.mjs --ps                                   # 只读列出遗留进程
git -C . status --porcelain                                        # 必须为空
```
