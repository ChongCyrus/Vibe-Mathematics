// TB-2719 / RUN 76 收口 — PROMPT DETERMINISM: the same seat, phase and round must assemble the SAME bytes under a
// different injected clock. The audit suite (`scripts/audit-prompt-budget.mjs`), the RUN 247 water levels and the parity
// corpus all hash/re-measure assembled prompts; a wall-clock leak anywhere would make those numbers move under a fixed
// source tree, which is exactly the class of "the measurement moved but nobody edited anything" defect this pins.
//
// What is checked (assembled prompts, not section sources):
//   §1 nine pairs (3 seats × normal/meeting/paper-review) under clock=5000ms vs clock=6000ms: byte-identical.
//   §2 with a clock-derived, named timestamp in the status block: the ONLY differing lines are those timestamp lines;
//      masking them makes the pair identical (so the difference is designed, not leaked).
//   §3 round 3 vs round 4 under one clock: the only differing lines are the named round headings (designed).
//   §4 THE LAMP: a synthetic section whose text contains `Date.now()` must be reported as a LEAK by this same
//      comparator (otherwise §1's "0 diffs" would be vacuous). The leaking section is built in this test only — no
//      prompt file is touched (TB-2719 write domain forbids it).
//
// Run: node tests/vmu-run77-prompt-determinism.test.mjs
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { CHARTER_SECTIONS, CHARTER_BINDINGS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-charter.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { decideSections } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { inboxBlock } from '../vibe-math-vmu/packs/v5r/notices.js'

const SETTINGS = {
  'vmu.turn.instituteName': 'institute', 'vmu.turn.objective': 'probe', 'vmu.turn.leaderId': 'acad',
  'vmu.turn.maxParallel': 3, 'vmu.turn.toolCallsPerTurnCap': 0, 'vmu.turn.memoryCeilingMb': 0,
  'vmu.pointer.propagation': true, 'vmu.turn.feedback': true, 'vmu.meetings.verdictMaxRounds': 3,
  'vmu.turn.replyCatalogue': 'compact',
  'vmu.turn.protocolPath': 'VibeMath/Projects/default/Institutes/institute/Shared/Protocol.md',
  'vmu.turn.verifyTarget': 'p-lemma-a', 'vmu.turn.verifyKindLabel': '命题',
  'vmu.turn.formalRootRel': 'VibeMath/Projects/default/Institutes/institute/Formal/',
  'vmu.turn.meetingId': 'mt-1',
}
const SEATS = [
  { member: 'acad', role: 'academician', roleLabel: '院士' },
  { member: 'r-1', role: 'researcher', roleLabel: '研究员' },
  { member: 't-1', role: 'temp', roleLabel: '临时工' },
]
const PHASES = ['normal', 'meeting', 'paper-review']

const ISO = (ms) => new Date(ms).toISOString()
const PRINT = process.env.TB2719_PRINT === '1'
// A line is a DESIGNED timestamp when it is a status reading stamped by the assembly clock (`（读于 <iso>）`) or an
// ISO-8601 stamp. Anything else that moves with the clock is a LEAK.
const isDesignedTime = (line) => /（读于 \d{4}-\d{2}-\d{2}T[\d:.]+Z）/.test(line) || /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(line)
const isDesignedRound = (line) => /第 ?\d+ ?轮|round[:： ]?\d+/i.test(line)
const maskTime = (line) => line.replace(/（读于 \d{4}-\d{2}-\d{2}T[\d:.]+Z）/, '（读于 <T>）').replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '<T>')
const maskRound = (line) => line.replace(/第 ?\d+ ?轮/g, '第 <N> 轮').replace(/round[:： ]?\d+/gi, 'round:<N>')

/** Line-by-line comparison. Returns every differing line and a leak verdict for the given classifier. */
export function diffPromptPair(aText, bText, isDesigned = isDesignedTime, mask = maskTime) {
  const a = String(aText).split('\n')
  const b = String(bText).split('\n')
  const diffs = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue
    const designed = isDesigned(a[i] ?? '') && isDesigned(b[i] ?? '')
    diffs.push({ line: i + 1, a: a[i] ?? '<missing>', b: b[i] ?? '<missing>', designed })
  }
  const maskedEqual = mask(aText) === mask(bText)
  return { diffs, leaks: diffs.filter((d) => !d.designed), maskedEqual }
}

async function buildPair({ seats = SEATS, phases = PHASES, clockMs, statusBlock, round = 3, sections = CHARTER_SECTIONS, extraNames = [] }) {
  // Synthetic probe sections are not in the pack's policy table, so they must be enabled explicitly by name.
  const policy = (args) => {
    const base = decideSections(args)
    return { decisions: [...base.decisions, ...extraNames.map((name) => ({ name, enabled: true }))], errors: base.errors }
  }
  const loop = createTurnOrchestrator({
    prompt: createPromptPipeline({ sections, bindings: CHARTER_BINDINGS, clock: () => ISO(clockMs) }),
    settings: SETTINGS, sectionPolicy: policy, noticeBlock: inboxBlock,
    extraPhases: ['heartbeat', 'paper-write', 'paper-review', 'paper-final'],
  })
  const out = {}
  for (const seat of seats) for (const phase of phases) {
    const a = await loop.assemble(loop.open(Object.assign({
      phase, meetingState: phase === 'meeting' ? 'first' : undefined,
      roster: 'acad、r-1、t-1', quorum: 2, statusBlock, round,
    }, seat)).turn)
    out[seat.member + '/' + phase] = String(a.text)
  }
  return out
}

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label) } else { failed++; console.error('  FAIL ' + label, detail === undefined ? '' : detail) }
}

// ── the control: assemble each side once and compare.
const A = await buildPair({ clockMs: 5000, statusBlock: '[状态] x' })
const B = await buildPair({ clockMs: 6000, statusBlock: '[状态] x' })

test('§1 same seat/phase assembles byte-identical prompts under clock 5000 vs 6000', () => {
  ok(Object.keys(A).length === 9 && Object.keys(B).length === 9, 'nine pairs were assembled (' + Object.keys(A).length + ')')
  for (const key of Object.keys(A)) {
    const r = diffPromptPair(A[key], B[key])
    if (PRINT) console.log('  §1 ' + key + ' lines=' + A[key].split('\n').length + ' sha=' + createHash('sha256').update(A[key]).digest('hex').slice(0, 16))
    ok(r.diffs.length === 0, key + ': byte-identical under two clocks', r.diffs.slice(0, 2).map((d) => 'L' + d.line + ' ' + JSON.stringify(d.a) + ' != ' + JSON.stringify(d.b)).join(' ; '))
  }
})

// ── §2 a NAMED timestamp line may move; nothing else may.
const statusA = '[状态] x\n[论文] （读于 ' + ISO(5000) + '）'
const statusB = '[状态] x\n[论文] （读于 ' + ISO(6000) + '）'
const T1 = await buildPair({ clockMs: 5000, statusBlock: statusA })
const T2 = await buildPair({ clockMs: 6000, statusBlock: statusB })

test('§2 with a clock-derived status timestamp, only the named timestamp lines differ', () => {
  ok(Object.keys(T1).length === 9, 'nine pairs were assembled for §2 (' + Object.keys(T1).length + ')')
  let namedDiffs = 0
  for (const key of Object.keys(T1)) {
    const r = diffPromptPair(T1[key], T2[key])
    ok(r.leaks.length === 0, key + ': every differing line is a NAMED timestamp (no clock leak)', r.leaks.slice(0, 2).map((d) => 'L' + d.line + ' ' + JSON.stringify(d.a)).join(' ; '))
    ok(r.maskedEqual, key + ': masking the timestamp makes the pair identical')
    if (PRINT) for (const d of r.diffs) console.log('  §2 ' + key + ' L' + d.line + ' A=' + JSON.stringify(d.a) + ' B=' + JSON.stringify(d.b))
    namedDiffs += r.diffs.length
    for (const d of r.diffs) ok(isDesignedTime(d.a) || isDesignedTime(d.b), key + ': L' + d.line + ' is classified as designed time')
  }
  ok(namedDiffs > 0, 'the clock actually reached the prompt (otherwise §2 asserts nothing)', namedDiffs)
})

// ── §3 a different round may move the round heading; nothing else may.
const R3 = await buildPair({ clockMs: 5000, statusBlock: '[状态] x', round: 3 })
const R4 = await buildPair({ clockMs: 5000, statusBlock: '[状态] x', round: 4 })

test('§3 round 3 vs round 4: only the named round headings differ', () => {
  ok(Object.keys(R3).length === 9, 'nine pairs were assembled for §3 (' + Object.keys(R3).length + ')')
  for (const key of Object.keys(R3)) {
    const r = diffPromptPair(R3[key], R4[key], isDesignedRound, maskRound)
    if (PRINT) for (const d of r.diffs) console.log('  §3 ' + key + ' L' + d.line + ' A=' + JSON.stringify(d.a) + ' B=' + JSON.stringify(d.b))
    ok(r.leaks.length === 0, key + ': the only differing lines are round headings (no round leak)', r.leaks.slice(0, 2).map((d) => 'L' + d.line + ' ' + JSON.stringify(d.a)).join(' ; '))
    ok(r.maskedEqual, key + ': masking the round number makes the pair identical')
  }
})

// ── §4 THE LAMP: a section that reads Date.now() must be caught as a LEAK. This section lives only in the test.
// The lamp section is rebuilt for each assembly and calls Date.now() at that moment, so the two sides really do
// carry different wall-clock values (a 5ms gap guarantees the millisecond differs).
const makeLeakSection = () => ({
  name: 'tb2719-clock-leak-probe', order: 842, range: 'pack',
  text: '时钟泄漏探针 ' + Date.now(),
})
const L1 = await buildPair({ clockMs: 5000, statusBlock: '[状态] x', sections: [...CHARTER_SECTIONS, makeLeakSection()], extraNames: ['tb2719-clock-leak-probe'] })
await new Promise((r) => setTimeout(r, 5))
const L2 = await buildPair({ clockMs: 6000, statusBlock: '[状态] x', sections: [...CHARTER_SECTIONS, makeLeakSection()], extraNames: ['tb2719-clock-leak-probe'] })
const STATIC_SECTION = { name: 'tb2719-static-probe', order: 843, range: 'pack', text: '静态探针' }
const CTRL1 = await buildPair({ clockMs: 5000, statusBlock: '[状态] x', sections: [...CHARTER_SECTIONS, STATIC_SECTION], extraNames: ['tb2719-static-probe'] })
const CTRL2 = await buildPair({ clockMs: 6000, statusBlock: '[状态] x', sections: [...CHARTER_SECTIONS, STATIC_SECTION], extraNames: ['tb2719-static-probe'] })

test('§4 the lamp: Date.now() in a section is reported as a leak (the §1 zeros are not vacuous)', () => {
  const key = 'acad/normal'
  const r = diffPromptPair(L1[key], L2[key])
  if (PRINT) for (const d of r.diffs) console.log('  §4 LEAK L' + d.line + ' A=' + JSON.stringify(d.a) + ' B=' + JSON.stringify(d.b))
  ok(r.leaks.length > 0, 'a section that calls Date.now() is reported as a LEAK', r.diffs.slice(0, 2).map((d) => 'L' + d.line + ' ' + JSON.stringify(d.a) + ' != ' + JSON.stringify(d.b)).join(' ; '))
  ok(!r.maskedEqual, 'masking timestamps cannot hide the leaking section')
  // the same comparator still passes a static section — the lamp is specific, not a blanket failure
  const rc = diffPromptPair(CTRL1[key], CTRL2[key])
  ok(rc.diffs.length === 0, 'the control: a static synthetic section stays identical')
})

test('§5 summary', () => {
  console.log('\n=== TB-2719 prompt determinism: ' + passed + ' passed, ' + failed + ' failed ===')
  if (failed !== 0) throw new Error(failed + ' assertion(s) failed')
})
