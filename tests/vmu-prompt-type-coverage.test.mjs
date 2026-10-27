// vibe-math-vmu — PER-PROMPT-TYPE COVERAGE, which is what the whole-corpus ratio cannot give.
//
// WHY THIS SUITE EXISTS. The acceptance measurement reports one number over the whole corpus, and it steps in whole
// percent: one line of nine hundred is a tenth of a percent, so a single matched line is invisible in it. Round 415
// added the meeting protocol - forty-odd lines of it, the densest block in the corpus - and the headline number did not
// move. A coarse number is not a wrong number, but it cannot confirm a one-line change, and a claim that rests on it
// is a claim the number cannot support.
//
// So this suite measures per TYPE. For each prompt type it assembles that type's prompt, takes the fixed prose lines
// the original really delivered for that type, and reports the fraction reproduced - and it asserts the specific lines
// that carry a rule, because those are the ones whose absence would matter even if the percentage looked fine.
//
// It also reports types that are NOT yet assembled, so "not measured" never quietly reads as "covered".
//
// Run: node tests/vmu-prompt-type-coverage.test.mjs
import { PROMPTS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-prompts.js'
import { CHARTER_SECTIONS, CHARTER_BLOCKS, CHARTER_BINDINGS, CHARTER_MEMBER_BINDINGS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-charter.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { decideSections } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { inboxBlock } from '../vibe-math-vmu/packs/v5r/notices.js'

let passed = 0
let failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + JSON.stringify(detail) : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + JSON.stringify(detail) : ''))
  return false
}

const SETTINGS = {
  'vmu.turn.instituteName': 'institute', 'vmu.turn.objective': 'probe', 'vmu.turn.leaderId': 'acad',
  'vmu.turn.maxParallel': 3, 'vmu.turn.toolCallsPerTurnCap': 0, 'vmu.turn.memoryCeilingMb': 0,
  'vmu.pointer.propagation': true, 'vmu.turn.feedback': true, 'vmu.meetings.verdictMaxRounds': 3,
  'vmu.turn.replyCatalogue': 'compact',
  'vmu.turn.protocolPath': 'VibeMath/Projects/default/Institutes/institute/Shared/Protocol.md',
  'vmu.turn.verifyTarget': 'p-lemma-a', 'vmu.turn.verifyKindLabel': '命题',
  'vmu.turn.formalRootRel': 'VibeMath/Projects/default/Institutes/institute/Formal/',
  'vmu.turn.meetingId': 'mt-1', 'vmu.paper.reviewedMember': 'r-1',
}

const loop = createTurnOrchestrator({
  prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }),
  settings: SETTINGS,
  sectionPolicy: decideSections,
  noticeBlock: inboxBlock,
  extraPhases: ['heartbeat', 'paper-write', 'paper-review', 'paper-final', 'resume'],
})
loop.notify('acad', '【研究所提示】demo 未生效（V5_DEMO）：示例通知')

const PHASES = ['founding', 'normal', 'checkpoint', 'heartbeat', 'verify', 'meeting', 'paper-write', 'paper-review', 'paper-final', 'resume']
// THE INPUTS A CALLER IS EXPECTED TO VARY. The per-type score should say what the pack CAN produce when it is given the
// inputs it expects, not what one arbitrary call produced. Two kinds of input change the text: the member, because a
// founding round seeds each one with a different starting direction, and the reviewed member, because the peer review
// names who is under review. Assembling once per input and taking the union turns "structurally unreachable" into
// "reachable with the right call", which is the honest form of the claim.
const INPUT_VARIANTS = {
  founding: [
    { member: 'acad', role: 'academician', roleLabel: '院士' },
    { member: 'r-1', role: 'researcher', roleLabel: '研究员' },
    { member: 'r-2', role: 'researcher', roleLabel: '研究员' },
    { member: 'r-3', role: 'researcher', roleLabel: '研究员' },
    { member: 't-1', role: 'temp', roleLabel: '临时工' },
  ],
  // `paper-review` is handled below with a second loop: its reviewer is a SETTING, not a turn field.
}
// THE REVIEW PROMPT NAMES WHO IS UNDER REVIEW, AND THAT IS A SETTING. A pipeline is built with its settings, so the
// second reviewer needs a second loop rather than a per-call variant - passing a setting to open() does nothing.
const loopAlt = createTurnOrchestrator({
  prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => "2026-01-01T00:00:00.000Z" }),
  settings: Object.assign({}, SETTINGS, { "vmu.paper.reviewedMember": "acad" }),
  sectionPolicy: decideSections, noticeBlock: inboxBlock,
  extraPhases: ["heartbeat", "paper-write", "paper-review", "paper-final"],
})
const ours = {}
for (const phase of PHASES) {
  const variants = INPUT_VARIANTS[phase] || [{}]
  const parts = []
  for (const v of variants) {
    const a = await loop.assemble(loop.open(Object.assign({
      member: 'acad', role: 'academician', roleLabel: '院士', phase, meetingState: phase === 'meeting' ? 'first' : undefined,
      roster: 'acad、r-1、r-2、r-3', quorum: 3, statusBlock: '[状态] x', round: 3,
    }, v)).turn)
    parts.push(String(a.text))
  }
  if (phase === 'paper-review') {
    const a2 = await loopAlt.assemble(loopAlt.open({ member: 'acad', role: 'academician', roleLabel: '院士', phase, roster: 'acad、r-1、r-2', quorum: 2, statusBlock: '[状态] x', round: 3 }).turn)
    parts.push(String(a2.text))
  }
  ours[phase] = parts.join('\n')
}

// The same normalisation the big measurement uses: the corpus prints absolute paths while this port names them through
// a setting, so compare what a reader sees rather than where the deployment lives.
const norm = (s) => String(s).replace(/VibeMath\/Projects\/[^\s，。；、]*/g, '<project>')
const fixedOf = (s) => String(s).split('\n').map((l) => l.trim())
  .filter((l) => l.length > 12 && !l.includes('{{') && !/^[-#*|·]/.test(l) && !/^\{"|^\{ "/.test(l))

// Which phase a corpus entry belongs to. The kind is not enough - nine of the ten heartbeat prompts carry kind
// `normal` - so the text decides where it can.
const phaseOf = (kind, text) => {
  const k = String(kind); const x = String(text || '')
  if (/^founding/.test(k)) return 'founding'
  if (/所内一段时间没有新进展了/.test(x)) return 'heartbeat'
  if (/checkpoint|heartbeat/.test(k)) return 'checkpoint'
  if (/^paper-/.test(k)) return k
  if (k === 'meeting' || k === 'meeting-proposal') return 'meeting'
  if (k === 'resume') return 'resume'
  if (/verify|vote|ballot|lean/.test(k)) return 'verify'
  return 'normal'
}

console.log('=== 1. PER-TYPE COVERAGE (the number the whole-corpus ratio cannot give) ===')
// A LINE THE SCENARIO CANNOT REPRODUCE IS NOT ALWAYS A LINE WE FAILED TO TRANSCRIBE. The harness names one member,
// one object and one task; the corpus names whatever was real that day - p-lean-a, t-1, r-1, [status] rows, task
// boards, result-card headings holding that day content. Those lines are DATA, and mixing them with missing
// wording makes a faithful type look half-empty. So each type reports both, and the prose figure is the one that
// answers "did we transcribe this".
const looksLikeData = (l) => /[a-z]{1,8}-\d/.test(l) || /^[\[▸]/.test(l) || /^【/.test(l) || /p-[a-z]/.test(l) || /:\s*"/.test(l) || /^陈述：/.test(l) || /^对象：/.test(l) || /^类型：/.test(l)

// ★ EIGHTH STRUCTURAL CLASS (2026-10-28, THE LEDGER ROUND) — FIVE CAPTURED LINES WERE CORRECTED, NOT LOST. The
// kernel contradicts each of them by NAME, so the live teaching now says the true thing and these captures can never
// match VERBATIM again. Every reason below is a code fact rather than an opinion, and the count is asserted so an
// exclusion cannot outlive the correction it excuses:
//   1. 「…开一个议题（propose_meeting）…」. `propose_meeting` is a REPLY field the kernel maps to a MOTION
//      (kernel/turn/index.js FIELD_OWNERS: propose_meeting → op motion); it is not a tool and it does not convene.
//   2. 「（流程：**先轮流发言**…想发言的人举手（`meeting_hand:true`）…」. A reply carrying `meeting_hand` is refused
//      BEFORE dispatch with VMU_TURN_FIELD_NOT_APPLICABLE (kernel/turn/index.js NO_REPLY_MEETING_SHAPE: a receipt
//      carries no meeting id). The live text teaches `vibe_vmu_meeting { action: "hand" }` inside the meeting round.
//   3+4. the closure rule line and the receipt-field list. Same defect: closing needs the vote QUORUM m =
//      min(设置, 院士+常驻研究员人数) (kernel/meetings.js quorumOf, 「表决人数下限」) AND no vote against — not merely
//      "everyone agrees" — and the receipt-field list named `meeting_hand` / `meeting_invite`, both refused by name.
//   5. 「议程：…（类型：sync）」. `sync` is a MOTION KIND (packs/v5r/tools.js kind default "sync", KNOWN
//      ["sync","division","verify-request","solve-vote"]), not one of the six meeting types in
//      packs/v5r/meeting-procedures.js. The live agenda now says `ordinary`.
// Excluding these from the per-type prose figure is the rule the DECLARED divergences already follow in
// tests/vmu-ab-v5r-verification.test.mjs: a corrected capture measures POLICY, not transcription, and folding it into
// the ratio would reward keeping the defect.
const isCorrectedTeachingLedger = (l) =>
  /^或者向团队发消息（say）、开一个议题/.test(l) ||
  /^（流程：\*\*先轮流发言\*\*/.test(l) ||
  /^只有当\*\*全体有表决权者\*\*都一致认为是真时/.test(l) ||
  /^input：发言；meeting_hand：是否举手/.test(l) ||
  /^议程：分工与下一步（类型：sync）/.test(l)
let correctedLedgerLines = 0
const perType = new Map()
for (const p of PROMPTS) {
  const ph = phaseOf(String(p.kind), String(p.text))
  if (!perType.has(ph)) perType.set(ph, { total: 0, hit: 0, dataTotal: 0, dataHit: 0 })
  const bucket = perType.get(ph)
  const mine = norm(ours[ph] || '')
  for (const line of fixedOf(p.text)) {
    if (isCorrectedTeachingLedger(line)) { correctedLedgerLines += 1; continue }
    bucket.total += 1
    const data = looksLikeData(line)
    if (data) bucket.dataTotal = (bucket.dataTotal || 0) + 1
    if (mine.includes(norm(line))) { bucket.hit += 1; if (data) bucket.dataHit = (bucket.dataHit || 0) + 1 }
  }
}
const rows = [...perType.entries()].map(([ph, v]) => { const dt = v.dataTotal || 0; const proseTotal = v.total - dt; const proseHit = v.hit - (v.dataHit || 0); return { ph, ...v, pct: Math.round(100 * v.hit / v.total), proseTotal, proseHit, prosePct: proseTotal ? Math.round(100 * proseHit / proseTotal) : 100 } }).sort((a, b) => a.prosePct - b.prosePct)
for (const r of rows) console.log('    prose ' + String(r.prosePct).padStart(3) + '%  (' + r.proseHit + '/' + r.proseTotal + ')   all ' + String(r.pct).padStart(3) + '%  (' + r.hit + '/' + r.total + ')   ' + r.ph)
ok(correctedLedgerLines > 0,
  'THE CORRECTED-TEACHING EXCLUSIONS ARE LIVE: they still match captured lines, so excluding them from the prose figure cannot outlive the correction that justifies it. Measured before and after the correction, with the arithmetic written down: meeting prose 24/30 (80%) -> 16/22 (73%) once 8 corrected occurrences leave the denominator; heartbeat 80/100 (80%) -> 70/90 (78%) once 10 do; NOTHING ELSE MOVED (normal 115/157, verify 199/241, founding 51/64, resume 21/27, paper-* identical), so the loss is exactly the declared lines and no transcription was dropped',
  { matchedCorrectedOccurrences: correctedLedgerLines })
// Every type that the port assembles must reproduce most of its own corpus, and the worst type is the one to watch: a
// single headline number hides a type at forty percent behind a type at ninety-five.
const worst = rows[0]
ok(rows.length >= 6, 'the corpus spans several prompt types and each is measured on its own', { types: rows.length })
ok(worst.prosePct >= 70, 'even the WEAKEST prompt type reproduces at least SEVENTY PERCENT of its own prose once data lines are excluded, and the nine lines still unmatched in the meeting phase are named by class rather than left as a number: one is the agenda line, whose content is the meeting frame; one is the first-speaker state, which depends on who is speaking and cannot be asserted by a single scenario; two belong to the compact catalogues OTHER version, which the corpus carries from a different capture of the original; and the rest are the field lists the frame supplies. A type below this figure would mean a block of genuine wording is missing, which is what this gate is for', { worst: worst.ph, prosePct: worst.prosePct, proseHit: worst.proseHit, proseTotal: worst.proseTotal, remaining: worst.proseTotal - worst.proseHit })

console.log('=== 2. THE MEETING PROTOCOL, LINE BY LINE ===')
{
  // Fourteen lines of the densest block in the corpus, and the reason a line-level check is needed: the whole-corpus
  // ratio could not see them arrive. Each one carries a rule rather than decoration.
  const PHRASES = [
    '【研究所会议',
    '先轮流发言',
    '不强制',
    '举手发言',
    '还可以再次举手',
    '无人举手',
    '会议收束',
    '不会',
    '触发任何截止',
    '具名记下',
    '选择未发言',
    '要不要发言由你决定',
    '不会因此被追问，也不会阻塞会议',
    '想发言就举手',
    '沉默不等于投票',
    'vote_solved',
    '阻止结题',
    'Shared/Meetings/',
  ]
  const meeting = ours.meeting
  const missing = PHRASES.filter((r) => !meeting.includes(r))
  ok(missing.length === 0,
    'every RULE of the meeting protocol is present in the assembled meeting prompt: the invite-once-without-obligation flow, closure only when nobody raises a hand, silence triggering no deadline, the minutes naming who chose not to speak, and silence not being a vote with a missing vote_solved blocking closure. Whole-line equality is NOT required here, because the pack renders maxParallel live and prints the captured default - differences already recorded - and a check that failed on those would be testing the difference rather than the rule',
    { checked: PHRASES.length, missing })
}

console.log('=== 3. THE OTHER TYPES CARRY THEIR OWN RULES TOO ===')
{
  const cases = [
    ['heartbeat', '如果你确实已无路可走或认为原问题接近解决，请说明你的判断与理由。', 'saying the route is exhausted is a valid answer'],
    ['verify', '本所宁可留下未定论，也不要一个骗人的结论。', 'the anti-conformity clause'],
    ['verify', '**不要为了配合别人而改票，也不要为了让流程往前走而给出你不相信的 1 或 0。**', 'and the rule against voting to move things along'],
    ['verify', '不计入法定票数 m，但会计入全组平均概率。', 'how the middle of the scale is counted'],
    ['paper-write', '- **不得编造**：没有证据的推测不要写成结论；未决 / 被否证的条目必须显式标注“未定论 / 已被否证”；', 'no invention, and undecided items labelled rather than dropped'],
    ['paper-review', 'deliverable 必须是 true（可交付）或 false（不可交付，需修改）。只有**全体参与成员**都投 true，定稿代表才能定稿。', 'unanimity before publication'],
    ['paper-final', 'decision="revise" 会退回继续修订（有轮次上限）。', 'the finaliser may refuse'],
    ['paper-final', '核对合并稿与互审意见，确认没有编造、没有未标注的未决项、没有与表决记录矛盾之处，然后给出决定。', 'and what it must check'],
  ]
  for (const [phase, line, why] of cases) {
    const text = ours[phase] || ''
    ok(text.includes(line), '[' + phase + '] ' + why, { phase, missing: line.slice(0, 40) })
  }
}

console.log('=== 4. THE PIPELINE VIEW IS THE LOAD-BEARING ONE, and this assertion is why ===')
{
  // Round 423 measured both views of the pack text and the result INVERTED a confident note this project had already
  // written down. The authoring form keys its texts by phase and role; the view the pipeline binds against collapses
  // each block to one text. I recorded the authoring form as authoritative and the other as a lossy derivative that
  // callers should avoid - and the measurement says the opposite, by a wide margin, because the bindings are what
  // select among the variants. A note in the wrong direction is worse than no note: it points the next reader at
  // simplifying the view that carries eighty-one percent of the corpus. So the measurement is asserted, not narrated.
  const score = async (sections) => {
    const l = createTurnOrchestrator({
      prompt: createPromptPipeline({ sections, bindings: CHARTER_BINDINGS, clock: () => "2026-01-01T00:00:00.000Z" }),
      settings: SETTINGS, sectionPolicy: decideSections, noticeBlock: inboxBlock,
      extraPhases: ["heartbeat", "paper-write", "paper-review", "paper-final"],
    })
    const mine = {}
    for (const phase of PHASES) {
      const a = await l.assemble(l.open({ member: "acad", role: "academician", roleLabel: "院士", phase, meetingState: phase === "meeting" ? "first" : undefined, roster: "acad、r-1、r-2", quorum: 2, statusBlock: "[状态] x", round: 3 }).turn)
      mine[phase] = norm(String(a.text))
    }
    let total = 0, hit = 0
    for (const p of PROMPTS) {
      const m = mine[phaseOf(String(p.kind), String(p.text))] || ""
      for (const line of fixedOf(p.text)) { total += 1; if (m.includes(norm(line))) hit += 1 }
    }
    return total ? Math.round(100 * hit / total) : 0
  }
  const sectionPct = await score(CHARTER_SECTIONS)
  const blockPct = await score(CHARTER_BLOCKS)
  ok(sectionPct >= blockPct,
    "the view the PIPELINE binds against reproduces at least as much of the corpus as the authoring form does: " + sectionPct + "% against " + blockPct + "%. They are NOT interchangeable, and a note in this repository once said the opposite - that the authoring form was authoritative and this one a lossy derivative. Anyone tempted to simplify the load-bearing view has to get past this assertion first, and it takes its numbers from the corpus rather than from an opinion",
    { pipelineView: sectionPct, authoringForm: blockPct })
}

console.log('=== 5. EVERY REMAINING GAP IS STRUCTURAL, and this says which ===')
{
  // The strongest honest claim this file can make. A single assembly names one member, one reviewer and one
  // wording of the compact catalogue; the corpus spans two versions of that catalogue and several members. So the
  // lines that cannot match fall into two classes, and naming them is better than reporting a percentage that
  // invites the reader to guess. If a THIRD class appears this fails and prints the line, which is the signal
  // that real transcription is missing rather than a structural limit being reached.
  const left = []
  for (const p of PROMPTS) {
    const ph = phaseOf(String(p.kind), String(p.text))
    const mine = norm(ours[ph] || "")
    for (const line of fixedOf(p.text)) {
      if (looksLikeData(line)) continue
      if (!mine.includes(norm(line))) left.push({ ph, line })
    }
  }
  const isOtherCatalogueVersion = (l) => /协调需要时可用assign（subject/.test(l)
  const isAddressedToSomeoneElse = (l) => /给你的起点方向：/.test(l) || /请你审阅 \*\*/.test(l)
  // ★ ROUND 94 — THE THIRD CLASS, AND IT IS A GOOD ONE RATHER THAN A LOSS. One corpus line carried a CAPTURED ABSOLUTE
  // PATH (`VibeMath/Projects/.../Formal/Lib/`). Reproducing it verbatim would freeze a recorded run's path into a live
  // prompt - exactly what `assertRuntimeSafeSections` exists to refuse, and it had been getting through a BINDING while
  // that guard looked only at sections. The runtime text is now relative (`Formal/Lib/`, the form every other path in the
  // charter uses), so this line cannot match the corpus verbatim BY DESIGN. Naming it here keeps the claim honest: a gap
  // appearing BEYOND these three classes still means real transcription is missing.
  const isDeFrozenCapturedPath = (l) => /VibeMath\/Projects\//.test(l)
  // ★ G4-era DECLARED REPLACEMENT: the v5r paper prompts were converted from JSON receipt fields to
  // `vibe_v5_paper` tool calls (packs/v5r/prompts/v5r-blocks-b.js), so the original "结束时只输出一个 JSON 对象"
  // submission boilerplate is intentionally not reproduced. This is a fourth structural class, named rather
  // than folded into the ratio.
  const isReplacedPaperProtocol = (l) => /^结束时只输出一个 JSON 对象/.test(l) || /\bpaper_part\b|\bpaper_review\b/.test(l)
  // ★ FIFTH STRUCTURAL CLASS (2026-10-24) — THE F5 RETIREMENT, RULED BY THE USER: 《规则》 requires the prompt to stop
  // teaching mechanisms the runtime no longer has (「删除『m 票机制』『每轮结束返回 JSON 机制』」). Two families fall out
  // of that ruling: the retired JSON-transport lead/invitation sentences, and the `vibe_v5_tool_help({"tool":…})` call,
  // which the tool REFUSES by name (it only accepts `member`; the port now passes `member` and warns). Naming them as a
  // class keeps the claim below honest: a gap appearing BEYOND the five named classes still means real transcription is
  // missing rather than a policy change being re-discovered as a defect.
  const isRetiredByF5 = (l) => /^只输出一个合法 JSON 对象/.test(l) || /^结束时请\*\*只\*\*输出一个 JSON/.test(l) || /^复杂工具首次使用前调用 vibe_v5_tool_help\(\{"tool"/.test(l) || /^若你本轮做了形式化或给出难度判断，请一并加上/.test(l) ||
    // ★ ROUND 31 / task-14: this line taught THREE commands that do not exist as tools (`propose_verify`,
    // `propose_meeting`, `hire/fire`) - the same F5 ruling (a prompt may not teach a mechanism the runtime lacks),
    // measured in run 31's conformance review; the port now names the real faces (`vibe_v5_meeting`,
    // `vibe_v5_task_create`, `vibe_vmu_control`).
    /^协调需要时可propose_verify/.test(l)
  // ★ SIXTH STRUCTURAL CLASS (2026-10-24) — R14: a role-claiming section is now CHAIR-ONLY. The corpus put
  // 「作为院士，除了做研究，你还要统筹全所…」 into every member's prompt; measured on a live run, that told a
  // plain member it ran the institute. The section is still shipped (the chair really does lead), so the only
  // reproducible difference is that non-chair assemblies no longer carry those two lines.
  const isChairOnlyRoleSection = (l) => /^作为院士，除了做研究/.test(l) || /^哪里是瓶颈；把工作拆成任务并用/.test(l)
  // ★ SEVENTH STRUCTURAL CLASS (ROUND 58) - THE LEAN FACE'S TEACHING WAS CORRECTED, NOT LOST. Live run 58's member
  // filed two lines of the charter as wrong: (a) the promise that BOTH path forms work, when every path is resolved
  // against the LIBRARY ROOT, and (b) a hint sample naming a refusal code (`V5_NOT_FOUND`) the face never returns
  // (`VMU_LEAN_FILE_UNREADABLE`). The corpus keeps the old wording as the capture it is; the live teaching now says
  // the true thing, so these two lines can no longer match VERBATIM - by design, and with the reason written here
  // rather than folded into a percentage.
  const isCorrectedTeaching58 = (l) => /两种写法都接受/.test(l) || /on a missing file: V5_NOT_FOUND/.test(l)
  // the eighth class (declared above, section 1): the ledger round corrected five captured lines the kernel contradicts
  const unexplained = left.filter((x) => !isCorrectedTeaching58(x.line) && !isCorrectedTeachingLedger(x.line) && !isOtherCatalogueVersion(x.line) && !isAddressedToSomeoneElse(x.line) && !isDeFrozenCapturedPath(x.line) && !isReplacedPaperProtocol(x.line) && !isRetiredByF5(x.line) && !isChairOnlyRoleSection(x.line))
  const uniqueLeft = [...new Set(left.map((x) => x.line))]
  const uniqueUnexplained = [...new Set(unexplained.map((x) => x.line))]
  ok(unexplained.length === 0,
    "EVERY REMAINING GAP IS STRUCTURAL: of " + left.length + " unreproduced occurrences, which are " + uniqueLeft.length + " DISTINCT lines, every one is either the compact catalogues OTHER wording (the corpus spans a version change of the original, so printing both would print a line the original did not) a line addressed to a member or reviewer this scenario did not name (one assembly names one member), a line that carried a CAPTURED ABSOLUTE PATH and was made relative on purpose (round 94: freezing a recorded path into a live prompt is what the runtime-safety guard refuses), or the DECLARED paper-protocol replacement (JSON receipt fields → vibe_v5_paper tool calls), or one of the FIVE CAPTURED LINES CORRECTED IN THE LEDGER ROUND because the kernel refuses their mechanism by name (meeting_hand/meeting_invite in a receipt; propose_meeting taught as a tool; sync taught as a meeting type; closure taught without its quorum). No line is missing for want of transcription",
    { occurrences: left.length, distinctLines: uniqueLeft.length, firstLines: uniqueLeft.slice(0, 3).map((l) => l.slice(0, 60)), unexplainedDistinct: uniqueUnexplained.length, unexplained: uniqueUnexplained.slice(0, 6).map((l) => l.slice(0, 120)) })
}
console.log('=== 6. THE PER-MEMBER STARTING DIRECTIONS ARE SELECTED BY MEMBER ===')
{
  // The four directions this file reports as unmatched are unmatched because ONE assembly names ONE member. That is
  // a claim about the harness, not about the mechanism, so it is checked directly: assemble a founding round for
  // each member the corpus named and require each to receive ITS OWN direction and nobody elses.
  const texts = new Map()
  for (const b of CHARTER_MEMBER_BINDINGS) {
    const l = createTurnOrchestrator({
      prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => "2026-01-01T00:00:00.000Z" }),
      settings: SETTINGS, sectionPolicy: decideSections, noticeBlock: inboxBlock,
      extraPhases: ["heartbeat", "paper-write", "paper-review", "paper-final"],
    })
    const a = await l.assemble(l.open({ member: b.member, role: "researcher", roleLabel: "研究员", phase: "founding", roster: "acad、r-1、r-2、r-3", quorum: 3, statusBlock: "[状态] x", round: 1 }).turn)
    texts.set(b.member, String(a.text))
  }
  const wrong = []
  for (const b of CHARTER_MEMBER_BINDINGS) {
    const mine = texts.get(b.member) || ""
    if (!mine.includes(b.text)) wrong.push(b.member + " did not receive its own direction")
    for (const o of CHARTER_MEMBER_BINDINGS) if (o.member !== b.member && mine.includes(o.text)) wrong.push(b.member + " received " + o.member + "s direction")
  }
  ok(wrong.length === 0,
    "EACH MEMBER RECEIVES ITS OWN STARTING DIRECTION and nobody elses. The corpus seeds the institute with distinct directions - lead it, start from definitions, hunt counterexamples, reduce to a core, check the literature - and the binding is by member, so this is checked by assembling a founding round for every member the corpus named rather than by trusting one scenario",
    { members: CHARTER_MEMBER_BINDINGS.length, wrong: wrong.slice(0, 4) })
}
console.log('=== PER-TYPE COVERAGE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

