// TB-2717 / RUN 76 — three prompt-side facts the machine had to guess:
//   ① `phase` is a CLOSED set of four full names (`heartbeat` / `paper-write` / `paper-review` / `paper-final`);
//      `review` / `write` / `final` are process words, not phases (run 76: `phase:"review"` -> `VMU_INVALID_ARGUMENT
//      unknown phase: review`), and the `paper-review` round's product is a REVIEW BALLOT (not `vote_solved`).
//   ② the closure ballot has THREE names at three layers: the ACTION is `vibe_vmu_vote` (meeting skeleton), the reply
//      FIELD is `vote_solved`, and `set_solved` does not exist (old taskbook wording).
//   ③ after `round` increments (advance's disagreement bounce, or `final{revise}` sending it back) EVERY review ballot
//      from the previous round is void — re-vote in the new round even if the text is byte-identical; the members named
//      in the receipt's `stale` array are the ones who have NOT yet voted in this round.
//
// The assertions run on the ASSEMBLED prompts (not the section source), because that is what a seat actually reads.
//
// Run: node tests/vmu-run77-prompt-phase-and-votes.test.mjs
import { test } from 'node:test'

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
const loop = createTurnOrchestrator({
  prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }),
  settings: SETTINGS,
  sectionPolicy: decideSections,
  noticeBlock: inboxBlock,
  extraPhases: ['heartbeat', 'paper-write', 'paper-review', 'paper-final'],
})
const SEATS = [
  { member: 'acad', role: 'academician', roleLabel: '院士' },
  { member: 'r-1', role: 'researcher', roleLabel: '研究员' },
  { member: 't-1', role: 'temp', roleLabel: '临时工' },
]
const texts = {}
for (const seat of SEATS) {
  for (const phase of ['normal', 'meeting', 'paper-review', 'paper-final']) {
    const a = await loop.assemble(loop.open(Object.assign({
      phase,
      meetingState: phase === 'meeting' ? 'first' : undefined,
      roster: 'acad、r-1、t-1', quorum: 2, statusBlock: '[状态] x', round: 3,
    }, seat)).turn)
    texts[seat.member + '/' + phase] = String(a.text)
  }
}
const all = Object.values(texts).join('\n')
const says = (t, n) => typeof t === 'string' && t.includes(n)
const denies = (t, n) => typeof t === 'string' && !t.includes(n)

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label) } else { failed++; console.error('  FAIL ' + label, detail === undefined ? '' : detail) }
}

test('§1 every seat is taught the closed four-name phase set', () => {
  for (const seat of SEATS) {
    const t = texts[seat.member + '/normal']
    ok(says(t, '派回合的 `phase` 是闭集，只有四个全名'), seat.member + ': the phase rule is in the assembled prompt')
    for (const name of ['`heartbeat`', '`paper-write`', '`paper-review`', '`paper-final`']) ok(says(t, name), seat.member + ': names ' + name)
    ok(says(t, '`review`') && says(t, '不是 phase'), seat.member + ': review is denied as a phase name')
    ok(says(t, '`VMU_INVALID_ARGUMENT unknown phase`'), seat.member + ': names the rejection a bad phase earns')
    ok(says(t, '评审票'), seat.member + ': says the paper-review product is a review ballot')
  }
  // negative: no prompt shows a SHORT name as a phase (the old RUN 76 mistake must not be re-taught as an example)
  for (const short of ['review', 'write', 'final']) {
    ok(denies(all, 'phase:"' + short + '"'), 'no assembled prompt uses phase:"' + short + '" (short name) as an example')
    ok(denies(all, "phase:'" + short + "'"), "no assembled prompt uses phase:'" + short + "' (short name) as an example")
  }
  // strict: the closed-set list itself must name exactly the four full names — a short name INSIDE the list is the
  // exact relapse this pin exists for (the four names live between 「只有四个全名」 and the following 「——」).
  for (const seat of SEATS) {
    const t = texts[seat.member + '/normal']
    const seg = t.split('只有四个全名')[1].split('——')[0]
    for (const name of ['`heartbeat`', '`paper-write`', '`paper-review`', '`paper-final`']) ok(seg.includes(name), seat.member + ': closed-set list contains ' + name)
    for (const short of ['`review`', '`write`', '`final`']) ok(!seg.includes(short), seat.member + ': closed-set list does not contain a short name ' + short)
  }
})

test('§2 the closure ballot three-way mapping is in the meeting prompt', () => {
  const t = texts['acad/meeting']
  ok(says(t, '结题票三处对照'), 'the meeting prompt carries the three-way mapping')
  ok(says(t, '`vibe_vmu_vote`'), 'names the ACTION surface (meeting skeleton vibe_vmu_vote)')
  ok(says(t, '`vote_solved`'), 'names the reply FIELD (vote_solved)')
  ok(says(t, '`set_solved` **未登记**'), 'names set_solved as unregistered (old taskbook wording; TB-2725 wording)')
  // negative: set_solved must never appear as a callable field/action
  ok(denies(all, '"set_solved": true'), 'no prompt shows set_solved as a reply field')
  ok(denies(all, 'action:"set_solved"'), 'no prompt shows set_solved as an action')
  ok(says(t, '旧任务书'), 'the denial is labelled as the old taskbook wording')
})

test('§3 the round-void sentence is taught with the paper-review ballot', () => {
  for (const seat of SEATS) {
    const t = texts[seat.member + '/paper-review']
    ok(says(t, 'round 递增后旧票作废'), seat.member + ': the round-void rule is in the paper-review prompt')
    ok(says(t, '上一轮评审票全部作废'), seat.member + ': says every previous-round review ballot is void')
    ok(says(t, '即使正文一字未改，也要在本轮重新投'), seat.member + ': says unchanged text still needs a re-vote')
    ok(says(t, '`stale`'), seat.member + ': names the stale array')
    ok(says(t, '还没在本轮投的人'), seat.member + ': explains stale = members who have not voted in this round')
    // the same section must tie the phase word and the ballot field together
    ok(says(t, 'paper-review') && says(t, 'vote_solved'), seat.member + ': paper-review and vote_solved co-occur in one section')
    ok(says(t, '不是拒绝'), seat.member + ': warns stale is not a refusal')
  }
})

test('§4 the phase and round teachings do not contradict the live receipt vocabulary', () => {
  // `venue` facts: VMU_INVALID_ARGUMENT is a real receipt code, and `stale` is a real receipt key.
  ok(says(all, 'VMU_INVALID_ARGUMENT'), 'the real receipt code is used')
  ok(says(all, '`stale`'), 'the real receipt key is used')
  ok(denies(all, '(unspecified)'), 'no prompt prints an unresolved template slot')
})

test('§5 summary', () => {
  console.log('\n=== TB-2717 phase / votes / round: ' + passed + ' passed, ' + failed + ' failed ===')
  if (failed !== 0) throw new Error(failed + ' assertion(s) failed')
})
