/**
 * packs/v5r/prompts/v5r-paper-prompts.js — PHASE 7 round 8: THE PAPER PROMPTS (writing / cross-review / final).
 *
 * WHY A SEPARATE MODULE AND WHY `v5r-fixture:paper`: this pack is SOURCE-DERIVED (`v5r-charter.js` is transcribed
 * from the original and gated verbatim by the T71 parity check), so new prose may NOT go into the charter. These three
 * sections are the same shape as the tool-discovery sections: `source: 'v5r-fixture:…'`, one UNIQUE first-line marker
 * each, no template placeholders, and a `scope` that limits them to ONE phase — the prompt pipeline already matches
 * `scope.phase`, so no kernel change is needed (the pack merely SPEAKS the phase it declares in `V5R_PHASES`).
 *
 * THE CONTENT IS THE ORIGINAL'S, NOT AN INVENTION: the writing/review/final prompts were read from
 * `vibe-math-v5r.js:8012-8110` (paperWritePrompt / paperReviewPrompt / paperFinalPrompt). What changed is that the
 * vmu side has TOOLS now, so each prompt states the CONTRACT it actually participates in — and the numbers it quotes
 * (`PAPER_MAX_ROUNDS`, the review rule, the section titles) come from `../paper.js`, the single source of truth, rather
 * than being hand-copied here.
 *
 * ★ THE ONE RULE THE PROMPTS MUST NOT VAGUE UP: `deliverable` is the ONLY thing `paper.advance` reads out of a review
 * ("只有全体参与成员都投 true 才进 awaiting-editor" — the original's own sentence). A member who answers "差不多可以"
 * has said NOTHING: `deliverable` must be a real boolean, and an unstated verdict is refused by name.
 */
import { PAPER_MAX_ROUNDS, PAPER_SECTIONS, PAPER_ENGINE_ORDER } from '../paper.js'

const SECTION_LIST = PAPER_SECTIONS.map((s, i) => (i + 1) + '. ' + s).join('\n')

/** ★ WRITING (phase `paper-write`): what to write, what may be cited, and the exact reply contract. */
export const v5rPaperWriteSection = Object.freeze({
  // NAME COLLISION, MEASURED AND AVOIDED: the source-derived charter already carries sections named
  // `v5r-paper-write` / `-review` / `-final` (the original's charter blocks for those phases). Re-using those names made
  // the loader report `VMU_PACK_CONFLICT two packs declare the same prompt section` — the guide sections therefore get
  // their own `-guide` names, and they coexist with the charter blocks instead of shadowing them.
  name: 'v5r-paper-writing-guide',
  order: 606,
  range: 'pack',
  source: 'v5r-fixture:paper',
  scope: Object.freeze({ phase: 'paper-write' }),
  text: [
    '【最终论文·撰写】',
    '本所的结论已经达成，现在一起写**最终论文**（最多 ' + PAPER_MAX_ROUNDS + ' 轮打磨）。你要写的是「你自己库里已有证据支撑」的部分，不是整篇论文。',
    '',
    '论文的九个章节（全所合并后按此排序）：',
    SECTION_LIST,
    '',
    '写作要求：',
    '· 只写有证据的内容：引用你的命题卡/方法卡/子问题卡与进展日志、以及你参与的表决记录；证据放进 evidence 列表，附录会逐条索引。',
    '· **不得编造**：没有证据的推测不要写成结论；未决或被否证的条目必须显式标注「未定论 / 已被否证」。',
    '· 若这是第 2 轮及以后：上一轮互审给你的意见会随本轮状态给出；据此修订，若不同意该意见，在 limits 里写明理由。',
    '· 语言与格式沿用本次论文的声明（中文论文的 PDF 用 xelatex，英文用 pdflatex）。',
    '',
    '工具与回执契约：',
    '· 需要把一条支撑命题正式落库时用 `vibe_v5_record_proposition`（p=1/0 表示判定级证据，中间值表示不确定估计）；',
    '· 需要与同事对齐时用 `vibe_v5_say`；不确定自己有哪些工具时用 `vibe_v5_tool_help`。',
    '· 写完这部分，调用工具 `vibe_v5_paper`，action 为 `part`：',
    '    vibe_v5_paper { action: "part", target: "本次论文的目标对象", part: "你这部分的标题",',
    '                    body: "你对原问题完整解法的贡献（推理链与结论，只写有证据的）；可分段写方法/规律/局限；证据路径写在正文里" }',
    '· `target` 必须填（论文流程按目标对象定位这一篇；不填会被具名拒，绝不替你猜是哪一篇）。',
    '· ★ 它**是**一个工具：早先靠回执字段 `paper_part` 提交的做法已经取消，回执里写那个字段会被判 `VMU_TURN_UNKNOWN_FIELD`。',
  ].join('\n'),
})

/** ★ CROSS-REVIEW (phase `paper-review`): what to judge, and what `deliverable` means. */
export const v5rPaperReviewSection = Object.freeze({
  name: 'v5r-paper-review-guide',
  order: 607,
  range: 'pack',
  source: 'v5r-fixture:paper',
  scope: Object.freeze({ phase: 'paper-review' }),
  text: [
    '【最终论文·互审】',
    '请审阅**分配给你的那一位同事**写的部分，判断它是否可以交付。审阅要点：证据是否充分；是否与已定论的表决一致；有无编造或未标注的未决项；术语与符号是否清楚。',
    '',
    '★ `deliverable` 的确切含义（这条决定论文能不能往下走）：',
    '· `deliverable: true` = 「这一部分现在就可以原样进入最终稿」；',
    '· `deliverable: false` = 「必须修改」（把要改什么写进 comments）；',
    '· **只有全体参与成员都投 true**，论文才会进入定稿（awaiting-editor）；任何一个人 false，就回到写作再打磨一轮（上限 ' + PAPER_MAX_ROUNDS + ' 轮）。',
    '· **必须显式二选一**：含糊的「差不多可以」不算可交付；`deliverable` 必须是 true 或 false，缺省/字符串会被具名拒（"未表态不算可交付"）。',
    '',
    '工具与回执契约：',
    '· 写完评审意见，调用工具 `vibe_v5_paper`，action 为 `review`：',
    '    vibe_v5_paper { action: "review", target: "本次论文的目标对象", member: "你的成员 id",',
    '                    deliverable: true, comments: "具体意见（指出问题、给出可执行的修改建议）" }',
    '· 想先核对证据可读任何人的成果库（`vibe_v5_read_library`）；不确定工具时用 `vibe_v5_tool_help`。',
    '· ★ 它**是**一个工具：早先靠回执字段 `paper_review` 提交的做法已经取消，回执里写那个字段会被判 `VMU_TURN_UNKNOWN_FIELD`。',
  ].join('\n'),
})

/** ★ FINAL (phase `paper-final`): what the editor checks, who decides, and the office precondition this pack NAMES. */
export const v5rPaperFinalSection = Object.freeze({
  name: 'v5r-paper-final-guide',
  order: 608,
  range: 'pack',
  source: 'v5r-fixture:paper',
  scope: Object.freeze({ phase: 'paper-final' }),
  text: [
    '【最终论文·定稿】',
    '全体参与成员已在互审中表示「可交付」。请定稿代表做**最后一次**把关：核对合并稿与互审意见，确认没有编造、没有未标注的未决项、没有与表决记录矛盾之处，然后给出决定。',
    '',
    '谁可以拍板：',
    '· 本流程的定稿代表是**院士（chair 席）**；其他席位的定稿会被具名拒（仅 chair 席可定稿）。',
    '· 若本次论文声明由**所办（office）**定稿：原版要求**所办先与全所交流（至少一条所办消息）并至少召开一次会议**，结论写进定稿说明——★ 这条前置在本实现里**未接线**（会以具名说明拒绝 office 定稿），不要在未咨询、未开会的情况下声称已定稿。',
    '',
    '定稿前检查清单：',
    '· 每个参与成员的部分都在（合并稿里按成员列示）；',
    '· 互审没有未处理的 false（达到轮次上限仍有的分歧会作为警告列出）；',
    '· 证据索引与正文结论一一对应，未决项均已标注。',
    '',
    '决定与回执契约：',
    '· `decision: "deliverable"` = 定稿通过；`decision: "revise"` = 打回再写一轮（未到轮次上限时）；两者只能二选一。',
    '· 调用工具 `vibe_v5_paper`，action 为 `final`：',
    '    vibe_v5_paper { action: "final", target: "本次论文的目标对象", member: "你的成员 id",',
    '                    decision: "deliverable", note: "定稿说明（含对最后分歧的处理）", conclusion: "论文结论的正式陈述" }',
    '· ★ 它**是**一个工具：早先靠回执字段 `paper_final` 提交的做法已经取消，回执里写那个字段会被判 `VMU_TURN_UNKNOWN_FIELD`。',
    '· ★ **只有学术委员会主席席可以定稿**；其他席位调用 `final` 会被具名拒绝（VMU_NOT_PERMITTED，并指出你的席位）。',
    '· ★ 产物四件：md / tex / pdf / meta。渲染会写出 md、tex、meta；**pdf 需要内核的 LaTeX 编译执行器**，本内核尚无此能力（会具名说明），所以定稿回执不会声称四件齐全。中文论文的引擎顺序是 ' + PAPER_ENGINE_ORDER.zh.join(' → ') + '。',
  ].join('\n'),
})

/** The three sections, in phase order, for a manifest that wants them as a group. */
export const V5R_PAPER_PROMPT_SECTIONS = Object.freeze([v5rPaperWriteSection, v5rPaperReviewSection, v5rPaperFinalSection])
