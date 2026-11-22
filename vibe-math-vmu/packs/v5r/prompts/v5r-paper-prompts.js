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
    '· 只写有证据的内容：引用你的命题卡/方法卡/子问题卡与进展日志、以及你参与的表决记录；证据放进 `evidence` 列表，附录会逐条索引——**不写 evidence 的部分会让 `render` 被具名拒 `VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING`**（"全文没有任何证据条目"），这不是格式偏好，是交付门。',
    '· **证据指针在你写 `part` 的那一刻就被核对**：`evidence` 里写的是**记录 id**（`rec-<n>`），不是磁盘上的文件名。指向不存在或轨不对的记录会**当场**被具名拒 `VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING`（回执点名每一条坏指针与原因），别指望把伪造引用留到渲染再发现——那时全文、互审、所办咨询都已白做。正确顺序：先建记录（`vibe_v5_record_proposition` 等，拿到它的 `rec-<n>`），再写带该 id 的 `part`。',
    '· ★ **`evidence` 收两种写法、指同一条记录**：① 记录 id `rec-<n>`（先 `vibe_v5_record_*` 落卡再引用）；② 以记录 id 命名的文件卡路径 `Members/<成员>/(Propos|Methods|Subproblems|Progress)/<记录 id>.md`（文件名就是记录 id，可带 `#锚点`，轨要对）。**自起的文件名**（如 `Members/<你的 id>/Propos/<任意名>.md`）与**摘要**不收，会被具名拒 `VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING`。',
    '· ★ **自起的文件名不是证据**：`Members/<你的 id>/Propos/<任意名>.md` 这种自己起的名字即使真实存在，`evidence` 也不收（附录按【记录行】索引）——会被判「这是文件卡，不是记录行」。要引用自己的卡，就把它写成记录行并用那个 `rec-<n>`，或用上一条第 ② 种写法（文件名就是记录 id）。',
    '· `render` 回执的 `wrote` 是**归档条目种类**（写在 paper 轨的 md/tex/meta），不是磁盘文件；磁盘上的 `.tex`/`.pdf` 只在 `compile` 跑过之后出现在 `Paper/<论文 id>/` 里（回执 `wroteWhere.disk` 会说）。',
    '· ★ 所办咨询（`vmu.paper.officeConsult`）：定稿前要问所办，所办就是**运行本所的会话**（不是坐着的研究员，名册上没有 office 席）——由它调用 `vibe_v5_paper { action:"consult", target, member:"office", request_id, answer, note }` 答复；回执的 `answererKind:"declared-role"` 说明答复者按声明角色作答，而不是某个座位。',
    '· **不得编造**：没有证据的推测不要写成结论；未决或被否证的条目必须显式标注「未定论 / 已被否证」。',
    '· **系统梳理**：动笔前把**原问题**与所里已有的**全部有价值产物**——命题卡、方法卡、子问题卡、进展日志、表决记录、形式化证据——过一遍，按九个章节归位；缺证据的章节明写「未定论」，不要用概括性套话填补。',
    '· **分工与合并**：全所已把章节**分派**给各成员，各写自己负责的部分（`action:"part"`），由定稿代表把各部分**合并**成一篇；你不要改写别人负责的章节，发现缺口就在互审里指出。',
    '· ★ **一位成员只有一个部分槽位**：`action:"part"` 写的是**你自己那一段**，同一位成员再调一次是**替换**上一段的正文，不会变成第二段（回执的 `replaced` 会给 `oldBytes → newBytes` 并明说「it did not add a second section」）。要写多节就把它们写进这一段正文里分小节；第 2/3 轮打磨也是**改这一段**，不是新增。动笔前用 `vibe_v5_paper { action:"status", target }` 看清现在正文里是哪几段、分别是谁的。',
    '· ★ **标题保持稳定；实验性字符只放正文**：`part` 的 `part`（标题）是这一段的**身份键**——同一成员再调用是替换同一条，标题一改就会在 paper-state 里留下一条新的 live 行（RUN 88 实测 F-87-02：把 ⨀ 写进标题后返工改标题，旧行仍 live）。所以标题只写普通文字，**表外字符/返工内容一律写进 `body`**，标题不要跟着一个字一个字改。',
    '· 若这是第 2 轮及以后：上一轮互审给你的意见会随本轮状态给出；据此修订，若不同意该意见，在 limits 里写明理由。',
    '· 语言与格式沿用本次论文的声明（中文论文的 PDF 用 xelatex，英文用 pdflatex）。',
    // ★★★ RUN 217 (run 54 / FEEDBACK53 ①-4, MEASURED): the members wrote `Σ_{i=1}^{n}` as bare text, so every `^` and `_`
    // was escaped into literal characters and the PDF printed the formula's own escaping. The convention (paired `$`) was
    // never taught anywhere; two `≥` glyphs also vanished because the font lacks them. This line is the teaching.
    '· ★ **公式一律写成成对 `$…$`（行内）/ 成对 `$$…$$`（display）**：成对符号之间的内容**原样**交给 LaTeX（`^` 上标、`_` 下标）；符号之外的 `^`/`_` 会被转义成**字面文本**，公式在 PDF 里就读成文本——回执 `math` 块里 `inlineMathSpans`/`displayMathSpans` 为 0、`proseCarets`/`proseUnderscores` 非 0，就是这件事发生了。**正文一律用 LaTeX 命令、不写裸 unicode 数学符号**（`ℤ`→`\\mathbb{Z}`、`⌊`→`\\lfloor`、`⌋`→`\\rfloor`、`∅`→`\\varnothing`、`∉`→`\\notin`、`①`→`1`）；`$…$` 里的 `^`/`_` 同样。回执 `math.glyphsRepaired` 的替换表只是**兜底、不是保证**——未覆盖的字形会被 xelatex **静默丢掉**。',
    '· ★ **PDF 的数字以回执为准**：定稿回执的 `pdf` 块是**那一次**编译（`pdf.produced` / `pdfBytes` / `engine`）；之后若有人对同一篇跑过 `compile`，磁盘上的文件就换了，此时以 `vibe_v5_paper { action:"status" }` 的 `pdfCompiled` 为准（它给的是**最新**一次编译，并用 `compiledAfterFinal` 说明这是不是定稿那次）。不要按旧记忆引用字节数。',
    '',
    '· ★ **每一节正文必须有「`证据等级：`」行**（缺任一节 ⇒ `VMU_PAPER_GRADE_LINE_MISSING`）；证据指针写 rec id 或以记录 id 命名的文件卡路径。',
    '工具与回执契约：',
    '· 需要把一条支撑命题正式落库时用 `vibe_v5_record_proposition`（p=1/0 表示判定级证据，中间值表示不确定估计）；',
    '· 需要与同事对齐时用 `vibe_v5_say`；不确定自己有哪些工具时用 `vibe_v5_tool_help`。',
    '· 写完这部分，调用工具 `vibe_v5_paper`，action 为 `part`：',
    '    vibe_v5_paper { action: "part", target: "本次论文的目标对象", part: "你这部分的标题",',
    '                    body: "你对原问题完整解法的贡献（推理链与结论，只写有证据的）；可分段写方法/规律/局限；正文引用证据写 rec-<n> 或以记录 id 命名的文件卡路径",',
    '                    evidence: ["rec-<n>"] }',
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
    '· ★ **前置：主席必须先把论文 `advance` 到 `reviewing`，再派 review 回合**——在 `writing` 期投 `review` 会被 `VMU_PACK_V5R_CORE_PAPER_STATE` 具名拒（RUN 88 实测：两席各白跑一个回合）。评审是 `reviewing` 阶段的行为；若你还是 `writing`，先把稿件交主席推进。',
    '请审阅**分配给你的那一位同事**写的部分，判断它是否可以交付。审阅要点：证据是否充分；是否与已定论的表决一致；有无编造或未标注的未决项；术语与符号是否清楚。',
    '',
    '· **面向读者的四项质量要求**：**系统**（从原问题到结论走得通）、**正确**（每条论断都有证据）、**完整**（所有有价值的产物都收进来）、**严谨清晰**（术语与符号交代清楚）——逐项落进你的评审意见：这四项是**人判**的，没有自动判定这四条的算法，靠你与同事的互审（不满足就投 `false` 并写清理由）。但**交付**另有一条机器门：进入 `awaiting-editor`／`finalized` 后渲染时，`paper.js` 的 `qualityGate` 会按四条具名规则拒交——小节标题缺失、引用指向不存在的记录（`CITATION_UNKNOWN`）、某个部分没有任何证据（`EVIDENCE_MISSING`，拒因点名是哪个部分——一个部分有证据不能替另一个部分作证）、正文漏掉本所真的已 verified 的结论或已解子问题（`VERIFIED_MISSING`，判据是**正文里是否出现该结论的标题**——渲染时 §3/§4 的自动填充只进渲染文件，不能代替正文）；还在撰写／互审的稿子可自由渲染（门会跳过并写明 `draft:<status>`）。',
    '',
    '· 审完怎么合并：全体 `true` 后论文进入 `awaiting-editor`，由定稿主体（主席席，即院士）按章节顺序把各部分合并成一篇；你只对自己的评审负责，不改别人的正文——要改由作者在下一轮改。',
    '',
    '· ★ **调用 final 前的互审自检**：至少两位**不同**、且都不是本节作者的成员投了 `deliverable:true`（看 gate detail 的 `crossReviewers`/`required`；否则 `VMU_PAPER_CROSS_REVIEW_UNMET`）。',
    '★ `deliverable` 的确切含义（这条决定论文能不能往下走）：',
    '· `deliverable: true` = 「这一部分现在就可以原样进入最终稿」；',
    '· `deliverable: false` = 「必须修改」（把要改什么写进 comments）；',
    '· **只有全体参与成员都投 true**，论文才会进入定稿（awaiting-editor）；任何一个人 false，就回到写作再打磨一轮（上限 ' + PAPER_MAX_ROUNDS + ' 轮）；到上限仍未全体一致时，未处理的 false 作为**警告**列出、论文仍进定稿（`forcedAfterCap`）——那不是「全体可交付」，回执会写明。',
    '· **互审必须由别人做**（这条和上面那条合起来才算数）：审自己写的部分会被具名拒（`VMU_INVALID_ARGUMENT`，message 说「a paper part cannot be reviewed by its author」）；而且至少要**两位不同**的成员各自审了**别人的**部分并投 true，论文才算通过互审。单人论文（participants 只有一位）永远进不了 awaiting-editor，会被具名拒「一位参与者的论文无法通过互审」——修复只有两条：再邀请一位成员参与（start 的 participants 至少两位），或让另一位成员评审这一部分（review 的 `of` 指向别人的 part）。',
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
    '全体参与成员已在互审中表示“可交付”。请你作为定稿代表做**最后一次**把关：核对合并稿与互审意见，确认没有编造、没有未标注的未决项、没有与表决记录矛盾之处，然后给出决定。若已到互审轮次上限，未处理的 false 会作为警告列出——那种情况下定稿仍可进行，但回执会写明这是上限强制，不是「全体可交付」。',
    '',
    '谁可以拍板：',
    '· 本流程的**定稿席位就是院士（即主席席）**——运行时纸面装配里 `finalizerSlot: "chair"`；其他席位调用 `final` 会被具名拒（`VMU_NOT_PERMITTED`，回执指出你的席位）。',
    '· ★ **定稿前的所办咨询是必过门（两段式，不是可预先清空的 pending）**：`vmu.paper.officeConsult:"required"` 的部署里，**首次** `final {decision:"deliverable"}` 必然被 `VMU_OFFICE_CONSULT_REQUIRED` 拦——正确顺序是 **final → 被拦 → 所办 `vibe_v5_paper {action:"consult", …}` 作答 → 再 final 重试**；`consult_state` 的 `awaiting` 为空只说明**当前没有待答问询**，不等于这道门已经过（RUN 88 实测：把它当「门已过」会误判）。',
    '· ★ **首次 final 可能只回 `VMU_OFFICE_CONSULT_REQUIRED`（`gates` 为空 `[]`、四门尚未评估）**——这是**前置闸整体拒交**，不是「没有其它 blocker」；所办 consult 后**第二次 final 才会评估四门**（cross-review／证据等级行／字形等）。不要把 `gates=[]` 读成绿灯。',
    '· ★ **定稿后重投（V21）的判据**：结题票只走 `vibe_vmu_vote`，以回执字段 `vote_solved` 判定（`vote_solved` 是书账字段，永不单独计票；四票 `at`/`votersAsOf` **都晚于 paper-state 的 `finalizedAt`**，`voteStaleness.afterFinalization:true` 是旁证）；pdf 行的定稿时刻若面未暴露 `compiledAt`，按 **PRODUCT-MISSING** 记录（不要去找一个不存在的字段）。',
    '· ★ **cap 前先过 `VMU_REVIEW_STALE`**：作者改了 `part`（新指纹）或 `final{decision:"revise"}` 打回后，**旧评审票全部作废**（回执 `VMU_REVIEW_STALE`）——必须让评审按**新指纹**重投 `deliverable:true`，再 `advance`/`final`。**`round≥3` 的 cap 强制（advance 直接进 awaiting-editor）只对当前指纹的票生效**：旧票不作数，不重投不能靠 cap 过关。',
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
    '· ★ **定稿主体只有主席席（即院士）**；所办只做归档与流程（留痕、索引、对外转达），**不代签**：所办调 `final` 会被角色门禁具名拒（`VMU_NOT_PERMITTED`）——**所办作为定稿人（E4）**在本实现里未接线（所办调 final 会被角色门禁拒）；这与**定稿前的 office-consult 咨询门**是两件事——后者是必过的（见上一条）。',
    '· ★ **final 成功后的标准链（按序，不可跳）**：① `vibe_v5_paper { action:"render", target }` —— 产出 `recordIds{md,tex,meta}`；② `compile` —— 产出 PDF；③ 最后 `vibe_vmu_turn { op:"reopen-closure" }` 开结题窗口。**不 render = 标准链未走完、没有 `recordIds`，V14 直接判 FAIL**（RUN 89 实测：二次 final 成功后直接去开结题窗口 ⇒ render=0，V14/V20 未绿）。',
    '· ★ **调用 final 前的自检清单（缺一条先补齐，别拿 final 试错）**：① **互审已成立**——至少两位**不同**、且都不是本节作者的成员投了 `deliverable:true`（看 gate detail 的 `crossReviewers`/`required`；否则 `VMU_PAPER_CROSS_REVIEW_UNMET`）；② **每一节正文都有「证据等级：」行**（缺任一节 ⇒ `VMU_PAPER_GRADE_LINE_MISSING`）；③ **没有未覆盖字形**（gate 报 `glyphsUnrepaired` 就按 hint 改写，再走 `revise`）；④ **`final { decision:"revise" }` 之后必须重审并重新 final**（revise 会让旧结论作废）。',
    '· ★ 产物四件：md / tex / pdf / meta。渲染会写出 md、tex、meta；**pdf 由内核的 LaTeX 编译执行器产出**（引擎顺序 ' + PAPER_ENGINE_ORDER.zh.join(' → ') + '）。执行器是否可用要看部署：可用时定稿回执写 `pdf.produced:true` 与 `pdfBytes`（并给出 `engine`）；不可用时回执**具名说明为什么没产出**，不会假装四件齐全。**以回执为准，不要预先假定不可用**。',
  ].join('\n'),
})

/** The three sections, in phase order, for a manifest that wants them as a group. */
export const V5R_PAPER_PROMPT_SECTIONS = Object.freeze([v5rPaperWriteSection, v5rPaperReviewSection, v5rPaperFinalSection])
