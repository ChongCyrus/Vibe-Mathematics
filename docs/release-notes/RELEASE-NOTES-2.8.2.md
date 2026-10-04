# dsh-vibe-math 2.8.2 — 发布说明

> 上一版本：2.8.1。本版是**补丁版**，修两处 v5 的「交付物与诊断」问题：`triedPaths` 不再出现**不可能路径**；v5 交付的 `paper.md`／`paper.tex` 也会写明「未检测到引擎／编译失败」（2.8.1 只做了 v4，本版补齐）。参数名与默认值、数据格式与目录结构**未变**，DSH 支撑窗口不变，**无需迁移**。

## 概述

- 显式 `paperLatexCommand` 现在被**单独探测**：`paper.meta.json` 的 `compile.triedPaths` 不再出现「已知 TeX 根 ＋ 你给的绝对路径」这种不可能路径。
- v5 交付的 `paper.md` 与 `paper.tex` 现在**各自写明**编译结果（未检测到引擎 ⇒ 只产出 tex+md；编译失败 ⇒ 已保留 tex/md），**恰好一次**且定稿重入不重复 ⇒ 与 2.8.1 的 v4 行为**对齐**。
- 其余行为不变：本机 TeX 装在非标准位置时，仍请用 `paperLatexCommand` 指定绝对路径。

## 新增

- 无。（本版为修复版：没有新增参数、字段或工具。）

## 变更

- v5 的 `paper.md`／`paper.tex` 多一行结果说明（随 `paperLanguage` 中英各一）。除此之外，论文的章节顺序、固定文案与其它字段均未变。

## 修复

- 症状：把 `paperLatexCommand` 设为**绝对**路径后，`paper.meta.json` 的 `compile.triedPaths` 里出现 `…\MiKTeX\miktex\bin\x64\Z:/no/such/xelatex.exe` 这类**不可能路径**——而 `triedPaths` 正是「找过哪里」的字段，会误导用户。原因：显式值被当作**命令名**拿去和已知安装根拼候选。现在显式值被**单独探测**，`triedPaths` 只记录真正探过的候选。真机实测（pin 到 2.8.1 后复现）：坏路径 ⇒ `status="not-detected"`、`triedPaths=["Z:/…"]`；真引擎 ⇒ `status="compiled"`、`paper.pdf` 150,044 B。守卫：`tests/e2e-v5-round2.test.mjs`（`★ [task-17/v5]`）、`tests/v5-institute-fixes.mutants.mjs`。
- 症状：v5 交付的 `paper.md`／`paper.tex` **不说** PDF 为什么没有产出（此前只有 `compile` 元数据与日志里有）。原因：论文正文在**编译之前**组装。现在定稿在编译之后把结果**补写**进交付物（`paper.md` 末尾一条要点；`paper.tex` 在 `\end{document}` 之前插一行 `%` 注释），**各恰好一次**、重入不重复。守卫：`tests/e2e-v5-round2.test.mjs`（`★ [task-18/v5]`）、`tests/v5-institute-fixes.mutants.mjs`（**16/16** 具名红）。

## 兼容性与迁移

- 破坏性变更：**无**。
- 纯新增：交付物里的一行结果说明（仅 v5）。
- 迁移：无需迁移；既有 `paper.meta.json` 仍可读。
- DSH 支撑窗口不变（见 `package.json` 的 `engines.dsh`）。

## 已知限制

- **非标准位置的 TeX 仍不会被自动发现**：默认探测只覆盖 PATH 与文档化的常见安装根；装在其它目录请用 `paperLatexCommand` 指绝对路径。
- 随包套件**不覆盖宿主层行为**（例如「中断后调用方被丢弃」），这类行为需要真机才能观察。
- **根代理提问会阻塞整所流程**（运维注意项，不改产品）：答复到达前其余流程停摆；长跑时请把问题与验收条件一次说清。详见 [`slv-playbook.md`](./slv-playbook.md) §5。
- 缺少 Lean / LaTeX 等引擎的机器上，相关套件会**响亮跳过**，不会静默通过。

## 验证方式

- `node tests/run-tests.mjs` —— 全部通过（**106** 项：44 套件 + 62 探针）。
- `node scripts/release-check.mjs` —— 退出 0（版本三处一致／两份说明章节顺序／`files[]` 登记／包内无 CRLF）；发布后 `node scripts/release-check.mjs --registry` 再比对线上 `dist.shasum` 与本地 tarball。
- 本版两处修复：`node tests/e2e-v5-round2.test.mjs`（`★ [task-17/v5]`、`★ [task-18/v5]`）与 `node tests/v5-institute-fixes.mutants.mjs`（**16/16** 具名红）。
- 真机复测方式：用 registry 上的精确版本（`-Pin <version>`）跑一个**精简**论文任务（跳过研究），约 **8 分钟**，核对 `compile` 段与 `paper.pdf` 是否存在。

## 依赖

- 无新增运行时依赖；DSH 支撑窗口不变。
