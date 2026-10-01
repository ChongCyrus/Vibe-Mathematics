# 最终论文（final paper）——四套预设的统一契约

> **这是随包发布的绑定契约。** v2 / v3 / v4 / v5 四个预设的 final-paper 参数、命令、触发时序、
> 产物与守卫都以本文为准；`实现方案.md` 与工具描述是它的实现说明，冲突时以本文为准。
>
> 本文由**用户已确认的规格**（仓库外的 `_oneoff/spec-final-paper.md`）与其后的**设计审计修订**
> （`_oneoff/spec-final-paper-v2-amendments.md`）合并而成。两份原始文件不在发布物里，所以契约
> 现在落在仓库内；两者冲突处以**修订**为准，合并时不做美化——修订推翻 v1 的地方在下面写明。
>
> 实现位置：v2/v3 的 paper 段（`/vibe paper`）、`vibe-math-v4.js` 的 paper 流程（`/v4 paper`）、
> `vibe-math-v5.js` 的 paper 流程（`/v5 paper` + `vibe_v5_paper` / `vibe_v5_finalize_paper`）。

## 1. 一句话

四个预设都**默认开启**最终论文：当各自的收口信号命中时，**先进入 paper 阶段，论文完成（或降级结束）
之后才把这次 run 标记为完成**。论文只整理已有证据，产物落在 `Paper/<运行或研究所 id>/`，
文本版永远交付，PDF 只在宿主真的检测到 LaTeX 引擎时才尝试编译。

## 2. 参数

参数进入各预设既有的参数体系（`setParams` 工具的 schema + 帮助文本 + 命令 hint），默认值如下：

| 参数 | 类型 | 默认 | 作用域 | 说明 |
|---|---|---|---|---|
| `finalPaper` | boolean | `true` | 四套 | 收口时是否**自动**撰写最终论文。`false` 只关自动触发，手动命令仍可用（返回里会写明"自动已关闭"） |
| `paperFormat` | enum `both`\|`md`\|`tex` | `both` | 四套 | 产出哪几种文本版本；`md` 不产出 tex、因此跳过编译，且**不得**报"缺 tex"警告 |
| `paperLanguage` | enum `zh`\|`en` | `zh` | 四套 | 论文语言，同时决定 LaTeX 模板（`ctexart`/`article`）与引擎优先顺序 |
| `paperCompilePdf` | boolean | `true` | 四套 | 检测到 LaTeX 时是否编译 `paper.pdf` |
| `paperLatexCommand` | string | `''` | 四套 | 强制指定**一个**引擎可执行文件；空 = 按语言自动探测。指定但解析不到时按"未检测到"降级 |
| `paperEditor` | enum | v4 `office`；v5 `academician` | **仅 v4/v5** | 定稿代表。v4：`office`（会话根/人类侧）或 `resident:<id>`；v5：`academician` 或 `office`（见 §7） |

归一化：**枚举**的非法值一律回退到上表默认值（绝不回退到更强的档位）；**未知键不会直通参数层**
（v2/v3 的参数归一化只遍历已知默认键，v4 把被忽略的键列在返回的 `ignored` 里，v5 的 set-schema 是闭集，
新键必须同时进闭集与枚举校验，参照 `quorumMode`）。**boolean** 接受 `true`/`false`；v4/v5 另外接受
`1/0/yes/no/on/off` 等拼写——命令行的 `k=v` 传的是原始字符串，`'false'` 必须真的变成 `false`，
不能保持真值；v2/v3 只接受真正的 JSON boolean，其余值回退默认。

## 3. 自动触发：用**真实的**收口信号，且先论文、后完成

各预设的收口信号以代码中的精确分支为准（v1 规格曾写成"更强的完整性判据"，那会永不触发；此处按修订修正）：

- **v2**：严格终止（任务清空且无在途）。**「论文撰写」子代理本身不计入"在途"**——否则撰写者会阻止收口。
- **v3**：`checkTermination` 的完整收口分支；真实的完整性判据是 `leftoverVerify`（不是"`Verified/` 全覆盖"）。
- **v4**：一致性会议的**一致停止票**（`finalizeMeeting` 的 `allSolved` 分支）；该分支会忽略并清空待验证对象与邮箱。
- **v5**：`checkSolved` 在**每一次解题票**上判定（不要求 verify/meeting 前置）。

**时序（修订 §A，HIGH）**：论文阶段必须发生在"标记完成"**之前**。收口分支一旦同时置
`running=false; autoDone=true`（v4）或 `phase='solved'`（v5），`startMeeting` / `wakeIfIdle` /
`onResidentEnd` / `scheduleNext` 都会拒绝，团队就再也无法合写与互审。因此：

- v4 在 `finalizeMeeting` 的 `allSolved` 分支内、v5 在 `checkSolved` 与 `finishRun` 之间**拦截**，
  先进入 paper 阶段，用既有的会议/唤醒机制完成合写与审稿，论文结束（或降级结束）后才真正置完成标志；
- v2/v3 **在停止翻转之前**派遣「论文撰写」子代理（`scheduler.running=false` 之后 `scheduleTick()` 是空操作，
  而且 v2/v3 没有激活上限处理，被拒/失败的撰写者会静默消失）。

**幂等**：同一 run 只写一次。`paper.meta.json` 记 `finalizedAt`；重复触发**只补写缺失产物**。
`finalPaper=false` 只关闭上面这条自动路径。

## 4. 手动命令

| 预设 | 命令 | 说明 |
|---|---|---|
| v2 / v3 | `/vibe paper [lang=zh\|en] [format=both\|md\|tex] [force]` | 单作者流程 |
| v4 | `/v4 paper [lang=zh\|en] [format=both\|md\|tex] [editor=office\|resident:<id>] [force]` | 团队流程，`editor=` 只作用于本次 |
| v5 | `/v5 paper [lang=zh\|en] [format=both\|md\|tex] [editor=office\|academician] [force]` | 团队流程；`editor=office` 走人工定稿路径（§7） |

- 命令行覆盖只作用于**本次**调用，不写回持久参数（v5 的 `editor=` 是一次性的）。
- 非法参数一律 `kind:'error'`（绝不静默成功）；`force` 重写已定稿的论文。
- v5 另有工具入口 `vibe_v5_paper`（与命令同义）与 `vibe_v5_finalize_paper`（所办定稿）。

## 5. 产物

目录：`Paper/<运行或研究所 id>/`（id 经各预设既有的 `slugify`/`safeId`/`idSafe` 归一化，
所有路径经同一个 `Paper/` 构造器，只写这个目录内，不污染 `Verified/`、`State/`）。

| 文件 | 何时出现 |
|---|---|
| `paper.md` | `paperFormat` 含 `md`（`both`/`md`） |
| `paper.tex` | `paperFormat` 含 `tex`（`both`/`tex`） |
| `paper.pdf` | 仅在编译器**真的跑通**时出现 |
| `paper.meta.json` | 总是：参数、触发原因、运行 id、`finalizedAt`、编译状态与引擎、v5 的咨询计数等 |
| `paper.log.md` | 总是：谁写了什么、谁提了什么意见、如何采纳（人读审计链） |
| `paper.lock.json` | 总是：该论文目录的**写锁**（持有者 / 时间 / 运行 id），并发的复写与重编译据此串行化（round-3 补记；README 的 final-paper 一节同样列出） |

宿主 fs 只支持**文本写**（没有 `writeBytes`），所以 `paper.pdf` **只能由编译器子进程**在论文目录内产生，
插件只做存在性校验，绝不自己写二进制，也**绝不覆盖已存在的 pdf**。

## 6. 论文骨架（四套一致，9 节）

1. 标题、作者（预设名 + 运行/研究所标识）、日期、摘要（原问题 + 主要结论）
2. 引言与问题背景（原问题的完整陈述）
3. **原问题的完整解法**（最终答案 + 完整推理链）
4. **已检验通过的命题**（逐条列出，含判定为真的估计值与证据来源）
5. **已解决的子问题 / 中间成果**
6. **创造或发现的有价值之物**：方法、理论、思想、有价值经验、数学理解
7. **规律总结**（从上述条目归纳出的可复用规律）
8. 讨论、局限与展望
9. 附录：证据与文件索引（`Verified/`、`Logs/`、关键卡片路径）

写法要求：只写有证据支撑的内容；**未决 / 被否证的条目必须显式标注**；不得编造。

## 7. 写作流程

**v2 / v3（单作者）**：派遣一名专职「论文撰写」子代理，输入 = 汇总材料（命题 / 子问题 / 成果 /
规律线索 + 证据索引），产出 = 完整 md 正文（含 tex 用的结构标记）；插件负责落盘 md/tex 与编译。

**v4 / v5（团队合写）**：

1. 各自写自己负责的部分（v4：各 resident 写自己库里的内容；v5：各常驻研究员/院士写自己负责的部分）；
2. **合并**（去重、统一术语、统一符号）；
3. **互检/审稿**：至少一轮交叉审阅（每人审他人的部分，指出问题并优化）；
4. **定稿**：定稿代表按 `paperEditor` 梳理成最终稿；
5. **一致认同**才定稿：所有参与成员明确表示"可交付"；有反对则继续迭代（有轮次上限，超限记警告并把分歧写进附录）。

定稿代表：

- **v4**：`paperEditor` 默认 `office`（= 会话根 / 人类侧；`facilitator` 不在编制里、没有 LLM，不能当作作者），
  另可选 `resident:<id>`。指定的 resident 已离职时**降级到 office** 并在 `paper.meta.json` 与 `paper.log.md` 记明。
- **v5**：`paperEditor` 默认 `academician` —— 这是**无人值守也能完成**的路径（所办是根会话，没有唤醒路径，
  自动收口触发必须用院士）。`office` 只在手动 `/v5 paper editor=office` 时可用，并且
  **所办必须先与全所交流、商讨、优化、审查**：至少 1 条所办消息（`vibe_v5_message`）**且**至少 1 次会议
  （`vibe_v5_meeting`），结论写进定稿说明，然后调用 `vibe_v5_finalize_paper`。
  两个计数记在 `paper.meta.json`；缺一即 `V5_PAPER_CONSULT_REQUIRED`（不是静默跳过）。

## 8. LaTeX 检测、编译与降级

- **检测**走 `subprocess.resolveExecutable`：`paperLatexCommand` 非空时**只用它**（不猜）；
  空则按语言探测 —— 中文 `xelatex` → `latexmk` → `pdflatex` → `lualatex` → `tectonic`
  （xelatex 对 CJK 开箱可用），英文 `pdflatex` 优先，其余同理。
- **编译**在论文目录内执行、`-interaction=nonstopmode`、跑两遍（`latexmk`/`tectonic` 用各自参数）。
- **先修复、后降级**（有收敛上限）：换引擎重试 → `nonstopmode` 重跑 → 换最小模板
  （`ctexart` / `article`）再试一次；到达上限就**保留 tex+md**，`paper.meta.json` 记
  `compile: 'failed'`（或未检测到时的 `'not-detected'`），**警告 + 上报**，但**不阻塞定稿**、
  **不抛错**、**不覆盖已有 pdf**，也绝不改写论文内容。
- `paperFormat=md` 时根本不产出 tex，编译直接 `skipped`，不得产生"缺 tex 无法编译"的警告。
- tex 模板：中文 `ctexart`（xelatex），英文 `article`；只用常见宏包（`amsmath`、`amssymb`、`amsthm`、
  `geometry`、`hyperref`、`longtable`、`booktabs`）；转义所有 `_ % & # $ { } ~ ^ \`。
- 记录：规格确认时本机**没有任何 LaTeX 引擎**，所以真机走的是"未检测到 → 只交 tex+md"分支；
  编译成功 / 修复后成功 / 持续失败三条路径由守卫里的**假编译器**覆盖（见 §10）。

## 9. 幂等与可审计

- 幂等键 = **run id + `finalizedAt` + 逐产物存在性检查**（不使用多文件稳定哈希）；
  重复触发只补写缺失产物，`force` 才重写。
- v2 的收口判据含 `agentRegistry=={}` ⇒ 撰写子代理被排除在收口判据之外（§3）；v3 在触发前已释放项目锁，
  因此论文落盘要**原子 + 幂等**（可加 paper 作用域锁），避免两个会话写同一棵树。
- 每次触发、每次派遣、每次编译、每次降级都追加 `paper.log.md`，并在活动日志里留一条。

## 10. 守卫与验证要求

每条不变式都要有断言，且要么有灵敏度探针证明它会变红，要么在探针里写明为什么不可达：

- 参数默认值 / schema 存在性 / 非法值回退；五个（v4/v5 六个）参数同时出现在工具 schema 与帮助文本里；
- 触发判定的正负用例：未收口不触发、收口触发、`finalPaper=false` 不触发、重复触发幂等；
- 内容生成：假 LLM/假成员回应驱动，断言 md/tex 两版产出、9 节骨架齐全、证据索引存在、未决项被标注；
- 编译分支：假编译器覆盖"成功 → pdf""失败 → 修复后成功""持续失败 → 降级 + 警告"三条路径；
  真机无 LaTeX 时断言走"未检测到"分支且不报错；
- 路径与越权：只写 `Paper/<id>/` 内、id 归一化（防路径逃逸）、与 `Verified/`/`State/` 不互相污染；
- 命令：`/vN paper` 的参数覆盖、`force` 与非法参数 `kind:'error'`；
- 团队流程（v4/v5）：断言"各部分 → 合并 → 互审 → 定稿"的消息序列；`paperEditor` 两种取值都可用；
  v5 选 `office` 时**确有**交流与会议记录（负用例：未咨询就定稿必须被拒），未达成一致认同时不定稿。

现有守卫：`tests/v4-final-paper.test.mjs`（v4 团队流程与产物）、`tests/e2e-v5-round2.test.mjs`
（v5 的手动/自动路径与所办咨询门）、`tests/v2-fix-probes.test.mjs` / `tests/v3-fix-probes.test.mjs`
（v2/v3 的收口派遣与降级）、`tests/audit-persona-sensitivity.mjs`（提示词面必须随新命令/工具更新）。

## 11. 纪律

- 写域按预设切分，同一文件只有一个写者；实现者**不提交**（由 Lead 统一提交并跑门禁）。
- **不得编造论文内容**：论文只整理已有证据，未决/被否证的条目显式标注。
- 成本纪律：只跑本预设相关套件 + 自建聚焦探针；全量 `run-tests`、`audit-formal-sensitivity`、
  `e2e-v4-fixes` 等慢脚本留给轮末门禁（见 `docs/test-timing.md`）。
