/**
 * packs/v3/prompts/paper.js — PHASE 6 / P1-6：**v3 最终论文的三段静态骨架**。
 *
 * ★ 对应的 v3 构件：
 *   - `buildPaperDigest()` 的材料分节（`vibe-math-v3/vibe-math-v3.js:4484-4545`）；
 *   - `PAPER_PATH_NOTE`（`:4465`）——"成员文件工具按会话 cwd 解析"的路径说明；
 *   - `PAPER_SKELETON` 的固定九节（`:5617-5627`）与 `PAPER_NO_EVIDENCE`（`:5628`）；
 *   - `paperWriterPrompt` 里的 LaTeX 缺失四步指引（`:4559`，与 v5r 的 `LATEX_ENGINE_NOTE` 同源）。
 *
 * ★ 只给"收口后撰写"这一种相位用：三段都 `scope.role = 'paper-writer'`，别的回合整段不出现。
 *   九节骨架**逐字**保留 v3 的九个 `## ` 标题（它们是 md/tex 两次生成的共同键，改一个就会让
 *   正文与骨架对不上）；材料本体是本轮动态生成的，段里只说明它的结构。
 *
 * ★ 没有模板变量：材料由调度器经状态块/appendPrompt 注入，段不占地。
 */

/** 材料分节说明书（v3 `buildPaperDigest` 的 7 个 `[...]` 块 + 路径说明）。 */
export const V3_PAPER_MATERIAL = Object.freeze({
  name: 'v3-paper-material',
  order: 704,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: 'paper-writer' }),
  text: [
    '## v3 论文｜材料（MATERIAL 说明书）',
    '你收到的 `MATERIAL` 只含**确实存在**的证据（由调度器从记录面与证据索引现算），分七块：',
    '- `PRESET`／`PROJECT`：这份材料属于哪个预设、哪个项目。',
    '- `[ORIGINAL PROBLEMS]`：原问题——id/状态/优先级/依赖/来源/陈述，及每个问题的方向与解法候选（概率、状态）。',
    '- `[PROPOSITIONS]`：命题——id/概率/状态/优先级/价值关键性/来源/陈述；已检验通过的证明/证伪条目会单列。',
    '- `[METHODS / ARTEFACTS]`：方法卡（项目级＋全局）——id/标题/类型/状态/可信断言/应用次数/核心内容。',
    '- `[STILL UNVERIFIED]`：**仍未验证**的对象清单。这是本机构判定"能否收口"的完整性判据；它们必须在论文里标为**未决**。',
    '- `[UNRESOLVED / REFUTED]`：未定论或已被否证的命题/解法。必须显式标注，**不得**当成已成立结论。',
    '- `[EVIDENCE INDEX]`：只列存在的文件路径（Verified/、Logs/、关键卡片、计算回执）。',
    '',
    '★ **路径说明**：成员/子代理的文件工具按**会话工作目录**解析相对路径，所以材料里列出的相对路径都必须先拼上**项目根的绝对前缀**再使用；计算产物用回执里的绝对字段（回执里的 `scriptAbs`），或把回执的 `cwd` 与 `scriptPath` 拼起来。',
  ].join('\n'),
})

/** 固定九节骨架（v3 `PAPER_SKELETON`，逐字保留标题与规格）。 */
export const V3_PAPER_SKELETON = Object.freeze({
  name: 'v3-paper-skeleton',
  order: 705,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: 'paper-writer' }),
  text: [
    '## v3 论文｜固定九节（只用这些 `## ` 标题，按此顺序）',
    '1. `## 摘要` —— 标题、作者、日期、摘要（原问题 + 主要结论）；作者/日期由框架补，你写摘要正文。',
    '2. `## 引言与问题背景` —— 原问题的完整陈述。',
    '3. `## 原问题的完整解法` —— 最终答案 + 完整推理链。',
    '4. `## 已检验通过的命题` —— 逐条列出，含判定为真的估计值与证据来源。',
    '5. `## 已解决的子问题与中间成果`。',
    '6. `## 创造或发现的有价值之物` —— 方法、理论、思想、有价值经验、数学理解。',
    '7. `## 规律总结` —— 从上述条目归纳出的可复用规律。',
    '8. `## 讨论、局限与展望`。',
    '9. `## 附录：证据与文件索引` —— 指向 Verified/、Logs/、关键卡片路径。',
    '',
    '★ 没有任何证据的节，正文必须**正好**是这行：`（本节暂无证据支持的内容——不编造。）`。',
  ].join('\n'),
})

/** LaTeX 缺失时的有界处置（四步 + 三条硬边界 + 适用条件包装；v3 与 v5r 同源）。 */
export const V3_PAPER_LATEX = Object.freeze({
  name: 'v3-paper-latex',
  order: 706,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: 'paper-writer' }),
  text: [
    '## v3 论文｜LaTeX 缺失时的处置（**以下这段仅在你参与论文写作或编译时适用**；其他阶段可忽略）',
    '检测不到 LaTeX 引擎时：',
    '1. 只在**文档化的常见 TeX 根与 PATH** 上做有界核查（例如 `where xelatex`、`latexmk --version`），**不要全盘扫描**——最常见的情形是引擎装了但不在 PATH：TeX Live 若装在 Windows 的某个**盘根**下，看该盘根里的 `texlive/<年份>/bin/windows`；类 Unix 看 `/usr/local/texlive/<年份>/bin/*`、`/opt/texlive/<年份>/bin/*`；macOS 看 `/Library/TeX/texbin`。',
    '2. 找到绝对路径后写进 `paperLatexCommand` 配置并重新检测，再继续。',
    '3. 仍找不到就**如实上报**（由所办/人类向用户确认安装）。',
    '4. 尚无回应则按既定降级：只交付 `paper.tex` 与 `paper.md`，不阻塞定稿。',
    '',
    '**三条硬边界**：① 绝不自动安装；② 绝不写工作区之外；③ **绝不把"未检测到"当失败**。',
  ].join('\n'),
})

export const V3_PAPER_SECTIONS = Object.freeze([V3_PAPER_MATERIAL, V3_PAPER_SKELETON, V3_PAPER_LATEX])

export default V3_PAPER_SECTIONS
