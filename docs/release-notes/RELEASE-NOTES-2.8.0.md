# dsh-vibe-math 2.8.0 — 发布说明

> 上一版本：2.7.3。本版是**功能版**：四套预设新增「检测不到 LaTeX 引擎时怎么办」的明确指引，并修正显式指定引擎的回退语义（此前 v4/v5 会静默改用另一个引擎）。四套预设的参数名与默认值、目录结构**未变**，数据格式**仅新增一个字段**，DSH 支撑窗口不变，**无需迁移**。

## 概述

- 显式 `paperLatexCommand` 现在是「**指定即只用它**」：解析不到就按「未检测到」降级，不再悄悄改用别的引擎；四套预设与文档口径完全一致。
- 检测不到引擎时的具名警告变得**可行动**：说明已探测 PATH 与文档化的常见 TeX 根，并给出指定绝对路径的方法。
- 四套预设的提示词明确告诉代理**四步做法**（有界自查 → 把绝对路径写入 `paperLatexCommand` 并重测 → 问用户一次 → 否则照旧降级）与**三条硬边界**（不自动安装、不写工作区之外、不把「未检测到」当失败）。
- 论文元数据新增 `triedPaths`：记录本次检测**实际探测过哪些路径**（成功与失败都记录）。
- 「宿主拒绝中断」的错误带上可执行的下一步，并纳入回归防护。
- 自行运行测试套件的人会看到更稳的门禁：默认并发降低、启动时自动清扫陈旧的测试临时目录、临时根优先使用更宽裕的盘、发现疑似遗留进程时只读告警。
- 仓库行尾统一为 LF：从本版起 npm 包内容与标签**逐字节可复现**。

## 新增

- 论文编译元数据 `paper.meta.json` 的 `compile` 段新增 **`triedPaths`**（字符串数组，本次检测过程中探测过的候选路径并集）。
- 四套预设的提示词新增「引擎缺失指引」块（同一段规范文本，逐字一致）。v5 以 `paperHintBlock(lang)` 注入成员提示词。
- 中断工具失败响应新增 `next: { kind: 'reason', tool: 'vibe_math_abort', hint }`，与其它失败诊断同形。
- 随包测试工具 `scripts/clean-temp.mjs`：列出疑似遗留进程（`--ps`，只读）与清扫陈旧测试临时目录（`--dry-run` / `--age-hours=N`）。

## 变更

- **显式引擎语义统一**：`paperLatexCommand` 非空时**只用它**；解析不到 ⇒ `compile.status = 'not-detected'`，只交付 `paper.tex` 与 `paper.md`。v4/v5 此前会把该命令并入候选表，在它不可用时**回落到别的引擎**，现与 v2/v3 以及 `docs/final-paper.md` 的既有口径一致。
- **未检测到引擎的警告文案**：「未检测到 LaTeX 引擎（…）：只产出 tex+md…**已探测 PATH 与文档化的常见 TeX 根；可用 `paperLatexCommand` 指定绝对路径。**」
- **测试门禁的默认值**（仅影响自行运行套件的人）：默认并发 `min(4, cpus)` → **`min(2, cpus)`**；启动时清扫 `mtime` 早于 6 小时、且前缀取自套件自身的陈旧临时目录；临时根优先指向 `D:\_tmp`（不可用时回退，不报错）；发现疑似遗留进程时**只读告警**，绝不自动结束进程。可用 `--concurrency=N`、`--no-temp-hygiene`、`--temp-dry-run` 等开关覆盖。
- 仓库新增 `.gitattributes`：文本文件一律 LF（二进制显式标记）。此前工作区 CRLF/LF 混合，而 `npm pack` 读工作区，包内可能出现 CRLF。

## 修复

- 症状：把 `paperLatexCommand` 设成一个**不存在的路径**，v4/v5 仍会用系统里另一个引擎编译出 PDF（用户以为指定的引擎生效了）。现在按「未检测到」降级，并给出可行动警告。守卫：`tests/v4-final-paper.test.mjs`、`tests/e2e-v5-round2.test.mjs`。
- 症状：检测不到引擎时只报「未检测到」，用户不知道**找过哪里**。现在 `triedPaths` 记录实际探测路径，警告说明探测范围。守卫：`tests/v2-fix-probes.test.mjs`、`tests/v3-fix-probes.test.mjs`、`tests/v4-final-paper.test.mjs`、`tests/e2e-v5-round2.test.mjs`。
- 症状：四套预设的「引擎缺失」指引缺失或彼此不一致。现在四套都有同一段规范文本，并有逐字一致性检查。守卫：`tests/audit-prompt-invariants.mjs`（不变量 I15）。
- 回归防护补强（**行为未变**）：把「宿主拒绝中断」这条失败路径纳入守卫（`VIBE_MATH_INTERRUPT_FAILED` ＋ `next.tool = 'vibe_math_abort'`）。守卫：`tests/v2v3-interrupt.mutants.mjs` 与两个数学套件的对应断言。
- 测试基础设施修复：套件被超时终止时无法自清，导致临时目录长期累积（实测顶层曾达 24 万项）。现在每次门禁启动自动清扫陈旧目录。守卫：`scripts/clean-temp.mjs --self-test`、`tests/temp-hygiene.mutants.mjs`。
- 测试时序修复：个别套件在并行负载下会在「所等事件发生之前」结束（单跑全绿、门禁偶发红）。现在相关循环以墙钟截止、等待窗口设有下限，并有按实测定值的超时预算。守卫：`tests/run-tests.mutants.mjs`（5/5）及上述套件自身的断言。

## 兼容性与迁移

- 破坏性变更：**无**。参数名与默认值、目录结构未变；`triedPaths` 是纯新增字段，旧 `paper.meta.json` 仍可读。
- 需要注意的行为变化：若你此前**故意**把 `paperLatexCommand` 指向不可用的值并依赖「回落到可用引擎」，本版会改为按「未检测到」降级——这是与 `docs/final-paper.md` 一致的修正。想要自动选择引擎，请把该参数留空。
- 迁移：无需迁移。
- DSH 支撑窗口不变（见 `package.json` 的 `engines.dsh`）。

## 已知限制

- **非标准位置的 TeX 仍不会被自动发现**：默认探测只覆盖 PATH 与文档化的常见安装根。装在其它的目录（例如把 TeX Live 装在盘符根下的自定义目录）请用 `paperLatexCommand` 指定绝对路径；本机实测非标准位置默认探测不到。
- 随包套件**不覆盖宿主层行为**：「中断后调用方被丢弃」这类行为需要真机才能观察，未纳入随包断言。
- v4 的收尾备注存在一个已知小问题：最终文稿的「未检测到/编译失败」备注字段可能为空（备注在编译结果确定之前组装）。不影响定稿与降级行为，已记录待修。
- 缺少 Lean / LaTeX 等引擎的机器上，相关套件会**响亮跳过**，不会静默通过。
- 本版未在真机重跑完整研究流程；引擎探测面覆盖「有引擎」与「无引擎」两种情形。

## 验证方式

- `node tests/run-tests.mjs` —— 全部通过（**105** 项：44 套件 + 61 探针）。
- `node scripts/update-doc-counts.mjs --check` —— 退出 0（文档派生计数与仓库一致）。
- 跨预设提示词逐字一致：`node tests/audit-prompt-invariants.mjs`（不变量 I15）与 `node tests/audit-prompt-invariants.mjs --self-probe`（11/11）。
- 显式引擎语义：`node tests/v4-final-paper.test.mjs`、`node tests/e2e-v5-round2.test.mjs`，以及 `node tests/v4-final-paper.mutants.mjs`（2/2 具名红）。
- 中断失败诊断：`node tests/v2v3-interrupt.mutants.mjs`（2/2 具名红）。
- 测试环境卫兵：`node scripts/clean-temp.mjs --self-test`、`node tests/temp-hygiene.mutants.mjs`（4/4 具名红）。
- 打包一致性：`npm pack --dry-run` 的清单与 `package.json#files` 一致（声明了但缺失 = 0），且包内文本行尾统一为 LF。

## 依赖

- 无新增运行时依赖；DSH 支撑窗口不变。
