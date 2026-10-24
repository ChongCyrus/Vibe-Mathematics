// tests/vmu-prompt-closure-channel.test.mjs — R15: THE CLOSURE VOTE HAS ONE FIELD, AND THE PROMPT MUST SAY SO.
//
// WHY THIS SUITE EXISTS (measured on live run 12, `_oneoff/vm-slv/full-1024-142038.jsonl`): the institute's own
// acceptance agent reported finding (c) — 「回执通道交的 solved:true 不计入结题票」. It was RIGHT, and the defect was
// in the PROMPT, not in the kernel:
//
//   · the kernel's split is explicit (`vibe-math-vmu/kernel/turn/index.js:1345-1349`): `vote_solved` IS the closure
//     vote (unanimity over the enfranchised roster) while `solved` is ONLY the per-round convergence reading;
//   · the pack's prompt offered `{"solved": false}` as an equivalent "minimal legal receipt" and then paired
//     `{"solved":false}` with 「结题表决只走回执」 (`packs/v5r/prompts/v5r-core.js`, the fixture sections);
//   · so a member that copied the sample answered `accepted:true, fields:["solved"]` and cast NO vote — `votesCast`
//     stayed 0 and the institute could not close. Only `vibe_vmu_vote` moved it.
//
// A prompt that teaches a non-voting field as the voting channel is the worst failure class this project has
// (「错的具名比不具名更糟」): the receipt is green, the mechanism is silent, and the run only ends because the agent
// tries the OTHER channel. This suite fixes the text and pins the rule:
//
//   RULE C — in any SENTENCE that talks about the closure vote, (i) `vote_solved` must be named, and (ii) a bare
//   `solved` may not appear. The sentence boundary matters: explaining the split legitimately needs both words, but
//   not in the same clause. The historical defect put a `{"solved":...}` SAMPLE inside a closure sentence.
//
// WHAT THIS SUITE CANNOT PROVE: it does not run a host and it does not prove a model obeys. It proves the TEXT the
// pack hands over obeys the rule, that the rule has teeth (synthetic offenders are caught), and that the assembled
// prompt for every seat obeys it too.
//
// Run: node tests/vmu-prompt-closure-channel.test.mjs   (last line: === VMU PROMPT CLOSURE CHANNEL: N passed, M failed ===)

import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { decideSections } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { PACK } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}

// ── THE RULE ITSELF, AS A PURE FUNCTION (so it can be tested with teeth) ────────────────────────────────────────────
const CLOSURE_WORDS = ['结题表决', '结题票', '闭题表决']
const BARE_SOLVED = /(?<!vote_)solved/
const mentionsClosure = (s) => CLOSURE_WORDS.some((w) => s.includes(w))

/** Split into clauses; the closure vocabulary and the field samples live in different clauses even in one line. */
const clauses = (text) => String(text).split(/[；;。\n]/).map((c) => c.trim()).filter((c) => c !== '')

/**
 * RULE C. Returns offenders `{ where, why, clause }`.
 *   (1) a clause that talks about the closure vote but never names `vote_solved`;
 *   (2) a clause that names BOTH the closure vote and a bare `solved` (the ambiguous pairing that cost live run 12).
 */
export function offendersOf(text, where = 'text') {
  const out = []
  for (const clause of clauses(text)) {
    if (!mentionsClosure(clause)) continue
    if (!clause.includes('vote_solved')) { out.push({ where, why: 'closure clause without vote_solved', clause: clause.slice(0, 200) }); continue }
    if (BARE_SOLVED.test(clause.replace(/vote_solved/g, ''))) out.push({ where, why: 'closure clause pairs a bare solved', clause: clause.slice(0, 200) })
  }
  return out
}

// ── 1. TEETH: the rule must catch the two historical spellings and acquit the fixed ones ───────────────────────────
{
  const caught = (text) => offendersOf(text).length > 0
  ok(caught('结题表决请回 {"solved":false}'), 'TEETH: a closure clause naming only a bare solved is caught')
  ok(caught('{"solved":false}（结题表决只走回执；它不是工具）'), 'TEETH: the exact pre-fix line from v5r-core.js is caught')
  ok(caught('结题表决用 {"vote_solved":true}，solved 是本轮判断'), 'TEETH: a closure clause that ALSO drifts to solved is caught')
  ok(caught('结题表决回执：{"vote_solved":true} 或 {"solved":false}'), 'TEETH: offering the bare-solved sample INSIDE the closure clause is caught')
  ok(!caught('结题表决用 {"vote_solved":true}'), 'TEETH: a closure clause naming vote_solved is clean')
  ok(!caught('{"solved":false} 是你这一轮的个人判断（不计票）'), 'TEETH: a bare solved as a per-round judgement is clean (it is a real field)')
  ok(!caught('结题表决用 `{"vote_solved": true|false}`（只有它计结题票）；个人本轮判断用 `{"solved": false}`（不计票）'), 'TEETH: the fixed two-clause sentence is clean')
  ok(!caught('vote_solved: true|false  ← 会议/结题表决用'), 'TEETH: the vote_solved declaration line is clean')
  ok(CLOSURE_WORDS.length >= 3 && BARE_SOLVED.test('solved') && !BARE_SOLVED.test('vote_solved'), 'TEETH: the rule is not vacuous')
}

// ── 2. THE REAL SECTIONS OBEY IT ──────────────────────────────────────────────────────────────────────────────────
const sections = PACK.sections
{
  ok(Array.isArray(sections) && sections.length > 50, 'the pack declares its sections (the audit has something to read)', sections.length)
  const all = sections.map((s) => ({ name: s.name, text: String(s.text === undefined ? '' : s.text) }))
  const offenders = all.flatMap((s) => offendersOf(s.text, s.name))
  ok(offenders.length === 0, 'RULE C: no pack section teaches the closure vote without vote_solved (nor beside a bare solved)', offenders)
  const mentions = all.filter((s) => CLOSURE_WORDS.some((w) => s.text.includes(w)))
  const namesVote = all.filter((s) => s.text.includes('vote_solved'))
  ok(mentions.length > 0, 'the pack really does talk about the closure vote (so the rule above is not vacuous)', mentions.map((s) => s.name))
  ok(namesVote.length >= 3, 'the pack really does name vote_solved in several sections', namesVote.map((s) => s.name).slice(0, 8))
}

// ── 3. THE ASSEMBLED PROMPT FOR EVERY SEAT OBEYS IT, AND TEACHES THE SPLIT ────────────────────────────────────────
{
  const pipeline = createPromptPipeline({
    sections: PACK.sections,
    bindings: PACK.bindings,
    sectionPolicy: decideSections,
    clock: () => '2026-01-01T00:00:00.000Z',
  })
  const seats = [
    { member: 'r-1', role: 'chair', roleLabel: '院士' },
    { member: 'r-2', role: 'member', roleLabel: '常驻研究员' },
    { member: 'r-3', role: 'temp', roleLabel: '临时工' },
  ]
  // ★ RULE E: a loop over an EMPTY collection is a vacuous pass, so the set is pinned before it runs.
  ok(seats.length === 3, 'exactly the three seats under test (a shrunken set would pass the loop below vacuously)', seats.length)
  const texts = []
  for (const seat of seats) {
    const out = await pipeline.assemble({ settings: { 'vmu.v5r.fixtureMode': 'tools' }, phase: 'normal', round: 1, ...seat })
    ok(out && out.ok === true && typeof out.text === 'string' && out.text.length > 4000, 'the real policy assembles a prompt for ' + seat.role)
    texts.push({ seat: seat.role, text: out.text })
    const bad = offendersOf(out.text, 'assembled:' + seat.role)
    ok(bad.length === 0, 'RULE C holds in the assembled prompt of ' + seat.role, bad.slice(0, 2))
  }
  const chair = texts.find((t) => t.seat === 'chair').text
  ok(chair.includes('只有它计结题票'), 'the assembled prompt says vote_solved is the ONE that counts')
  ok(chair.includes('（**不计票**）'), 'and that a bare solved does NOT count')
  ok(!chair.includes('"solved": false}（结题表决'), 'the old ambiguous sample is gone from the assembled text')
  // The charter's receipt catalogue still declares `solved` — correctly, as the per-round judgement.
  const decl = chair.split('\n').filter((l) => l.includes('"solved": false') && l.includes('个人判断'))
  ok(decl.length >= 1, 'the receipt catalogue describes solved as the per-round judgement', decl.length)
}

console.log('')
console.log('=== VMU PROMPT CLOSURE CHANNEL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) console.log('failed: ' + failures.join(' | '))
process.exit(failed ? 1 : 0)
