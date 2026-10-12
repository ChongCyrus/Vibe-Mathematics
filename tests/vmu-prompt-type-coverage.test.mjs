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
import { CHARTER_SECTIONS, CHARTER_BINDINGS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-charter.js'
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
  extraPhases: ['heartbeat', 'paper-write', 'paper-review', 'paper-final'],
})
loop.notify('acad', '【研究所提示】demo 未生效（V5_DEMO）：示例通知')

const PHASES = ['founding', 'normal', 'checkpoint', 'heartbeat', 'verify', 'meeting', 'paper-write', 'paper-review', 'paper-final']
const ours = {}
for (const phase of PHASES) {
  const a = await loop.assemble(loop.open({
    member: 'acad', role: 'academician', roleLabel: '院士', phase,
    roster: 'acad、r-1、r-2', quorum: 2, statusBlock: '[状态] x', round: 3,
  }).turn)
  ours[phase] = String(a.text)
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
  if (/verify|vote|ballot|lean/.test(k)) return 'verify'
  return 'normal'
}

console.log('=== 1. PER-TYPE COVERAGE (the number the whole-corpus ratio cannot give) ===')
const perType = new Map()
for (const p of PROMPTS) {
  const ph = phaseOf(String(p.kind), String(p.text))
  if (!perType.has(ph)) perType.set(ph, { total: 0, hit: 0 })
  const bucket = perType.get(ph)
  const mine = norm(ours[ph] || '')
  for (const line of fixedOf(p.text)) {
    bucket.total += 1
    if (mine.includes(norm(line))) bucket.hit += 1
  }
}
const rows = [...perType.entries()].map(([ph, v]) => ({ ph, ...v, pct: Math.round(100 * v.hit / v.total) })).sort((a, b) => a.pct - b.pct)
for (const r of rows) console.log('    ' + String(r.pct).padStart(3) + '%  ' + r.ph.padEnd(16) + r.hit + '/' + r.total)
// Every type that the port assembles must reproduce most of its own corpus, and the worst type is the one to watch: a
// single headline number hides a type at forty percent behind a type at ninety-five.
const worst = rows[0]
ok(rows.length >= 6, 'the corpus spans several prompt types and each is measured on its own', { types: rows.length })
ok(worst.pct >= 40, 'even the WEAKEST prompt type reproduces at least two fifths of its own fixed prose, so no type is silently empty', { worst: worst.ph, pct: worst.pct, hit: worst.hit, total: worst.total })

console.log('=== 2. THE MEETING PROTOCOL, LINE BY LINE ===')
{
  // Fourteen lines of the densest block in the corpus, and the reason a line-level check is needed: the whole-corpus
  // ratio could not see them arrive. Each one carries a rule rather than decoration.
  const RULES = [
    '【研究所会议 mt-1 进行中 —— 院士 acad】',
    '议程与类型由本轮会议帧给出；请按议程发言，需要发言时举手。',
    '（流程：**先轮流发言**',
    '**无人举手**时会议收束。',
    '沉默本身**不会**触发任何截止；纪要会具名记下“已获得机会、选择未发言”。',
    '收束时纪要与结论写入 Shared/Meetings/<会议id>.md 并同步到群聊。',
    '请就议程发表你的意见。',
    '**要不要发言由你决定**',
    '不会因此被追问，也不会阻塞会议。',
    '**想发言就举手**',
    '**已发言者也可再次举手**',
    '**沉默不等于投票**',
    '只有当**全体有表决权者**都一致认为是真时，本所才会停下来；缺 `vote_solved`（沉默/未表态）会**阻止结题**。',
  ]
  const meeting = ours.meeting
  const missing = RULES.filter((r) => !meeting.includes(r))
  ok(missing.length === 0,
    'every rule-bearing line of the meeting protocol is present VERBATIM in the assembled meeting prompt: the invite-once-without-obligation flow, closure only when nobody raises a hand, silence triggering no deadline, the minutes naming who chose not to speak, and silence not being a vote with a missing vote_solved blocking closure',
    { checked: RULES.length, missing })
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

console.log('=== PER-TYPE COVERAGE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
