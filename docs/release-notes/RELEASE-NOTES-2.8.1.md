# dsh-vibe-math 2.8.1 — 发布说明

> 上一版本：2.8.0。本版是**补丁版**：修掉 2.8.0 说明里如实写出的那条「已知限制」——v4 的最终文稿此前**不会**说明「本机没有 LaTeX 引擎」或「PDF 编译失败」；并把发布前的逐项核对做成一条命令。参数名与默认值、数据格式与目录结构**未变**，DSH 支撑窗口不变，**无需迁移**。

## 概述

- v4 交付的 `paper.md` 与 `paper.tex` 现在**各自写明编译结果**：未检测到引擎（只产出 tex+md），或 PDF 编译失败并已保留 tex/md。
- 该说明**只写一次**（定稿可重入 ⇒ 幂等），不改变论文的章节结构与其它字段。
- 2.8.0 说明中的「已知限制」第 3 条（v4 收尾备注可能为空）**已解决**。
- 新增 `scripts/release-check.mjs`：把发布前必须逐项核对的检查做成一条命令。

## 新增

- `scripts/release-check.mjs`：核对版本**三处一致**、当前版本两份发布说明的**章节顺序**、两份是否登记进 `package.json#files`、`dsh.compatNote` 是否提到当前版本、`npm pack` 的**声明了但缺失 = 0**、开发专用文件是否**不随包**、包内文本是否**无 CRLF**；开关 `--skip-pack`（只做静态检查）、`--registry`（发布后比对线上 `dist.shasum` 与本地 tarball）、`--self-test`（自证判据非空转）。

## 变更

- v4 的论文交付物多一条结果说明（细节见「修复」）。除该说明外，论文的章节顺序、固定文案与其它字段均未变。

## 修复

- 症状：v4 的用户读完 `paper.md` / `paper.tex` 也不知道**PDF 为什么没有产出**——只有 `paper.log.md` 里留了一行。原因：论文正文在**编译之前**组装，因此正文里那两条依赖编译结果的条目在正常流程中**恒空**。现在定稿在编译之后把结果**补写**进交付物：`paper.md` 末尾增一条要点，`paper.tex` 在 `\end{document}` 之前插入一行注释（`% …`），两者**各恰好一次**（重入不重复）。守卫：`tests/v4-final-paper.test.mjs`（`★ [deliverable/v4] … (once each; md=1 tex=1)`）、`tests/v4-final-paper.mutants.mjs`（**3/3** 具名红：把中文说明置空 ⇒ 该断言按名变红，实测 `md=0 tex=0`）。
- 发布流程缺陷（工具面）：发布前的逐项核对此前只能手工做、容易漏。现在由 `scripts/release-check.mjs` 一条命令完成，并由 **4** 条单点变异保证它本身不是空转。守卫：`tests/release-check.mutants.mjs`（**4/4** 具名红）。

## 兼容性与迁移

- 破坏性变更：**无**。
- 纯新增：交付物里的一行结果说明；一个随包脚本。
- 迁移：无需迁移；既有 `paper.meta.json` 与目录结构不变。
- DSH 支撑窗口不变（见 `package.json` 的 `engines.dsh`）。

## 已知限制

- **非标准位置的 TeX 仍不会被自动发现**：默认探测只覆盖 PATH 与文档化的常见安装根；装在其它目录请用 `paperLatexCommand` 指绝对路径。
- 随包套件**不覆盖宿主层行为**（例如「中断后调用方被丢弃」），这类行为需要真机才能观察。
- 缺少 Lean / LaTeX 等引擎的机器上，相关套件会**响亮跳过**，不会静默通过。
- 本版未在真机重跑完整研究流程。

## 验证方式

- `node tests/run-tests.mjs` —— 全部通过（**106** 项：44 套件 + 62 探针）。
- `node scripts/update-doc-counts.mjs --check` —— 退出 0（文档派生计数与仓库一致）。
- `node scripts/release-check.mjs` —— 退出 0；发布后 `node scripts/release-check.mjs --registry` 再比对线上 shasum 与本地 tarball 的字节一致性。
- v4 交付物说明：`node tests/v4-final-paper.test.mjs`、`node tests/v4-final-paper.mutants.mjs`（3/3 具名红）。
- 发布检查本身：`node scripts/release-check.mjs --self-test`（15 条）与 `node tests/release-check.mutants.mjs`（4/4 具名红）。

## 依赖

- 无新增运行时依赖；DSH 支撑窗口不变。
