// RUN 203 — run 41 / FEEDBACK40: eight readings that were silent about the one number (or the one path) a caller
// needed next. Every § below is a MEASURED defect from that run, not a hypothetical.
//
// 1.2  only the disagreement branch of `advance` said WHICH round moved; the other three moving branches said nothing,
//      so a paper that had just left reviewing for the editor read as "still round 1" with no way to tell a reading
//      from a forgotten field.
// 1.5  the rotation said r-1 reviews r-2, and the member reviewed somebody else — accepted, and the paper advanced as
//      "unanimous" with one section unread and another read twice.
// 2.3  a one-participant paper was MOVED writing → reviewing before anything could refuse it, and only the NEXT
//      advance refused: the paper sat in a stage it could never leave.
// 1.4  `proofPointerMeans` said `exists:false` means "outside the library root" while the measured pointer was INSIDE
//      the root and merely missing — two different repairs, one sentence.
// 1.3  the ballot board's refusal did not say that closing the meeting ends the debate.
// 2.1  the final-blocked hint named the KIT method (`recordConsult(...)`), which no caller can invoke.
// 2.4  the evidence teaching named only `rec-<n>` and never the other legal spelling (a file card whose name IS the
//      record id), so two different members both guessed wrong.
// 2.5  the promote description's lean-conformance route omitted that `warrant` is required there too.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const PAPER_KIT = read('vibe-math-vmu/kit/paper.js')
const PACK = read('vibe-math-vmu/packs/v5r/tools.js')
const PROMPTS = read('vibe-math-vmu/packs/v5r/prompts/v5r-paper-prompts.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
/** the pack wraps each action's payload under the action name; older suites read `receipt.advance || receipt`. */
const blockOf = (r, key) => (r && r[key]) || r

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { call, handle }
}
function tmp() { return mkdtempSync(join(tmpdir(), 'vmu-run203-')) }

async function card(call, tag) {
  const c = await call('vibe_v5_record_proposition', {
    statement: 'run203 ' + tag + ' 命题：a+b=b+a', value: 1, motive: '交换律', p: 0.9, member: 'r-1',
  })
  ok(c.ok === true, 'premise: a card exists for evidence (' + tag + ')', c)
  return c.recordId
}

test('RUN 203 §0 — every repair is on the source it belongs to (source pins)', () => {
  has(PAPER_KIT, 'const roundReading = (roundFrom, fromStage, toStage) =>', '§0a ★★ every moving advance branch shares one round reading')
  has(PAPER_KIT, 'the ROUND did not move (still ', '§0b ★ and says in words that a non-moving round is a READING, not a missing field')
  has(PAPER_KIT, "...roundReading(roundFromWriting, 'writing', 'reviewing')", '§0c ★ the writing branch states it')
  has(PAPER_KIT, "...roundReading(roundFromUnanimous, 'reviewing', 'awaiting-editor')", '§0d ★ the unanimous branch states it')
  has(PAPER_KIT, "...roundReading(roundFromCapped, 'reviewing', 'awaiting-editor')", '§0e ★ the capped branch states it')
  has(PAPER_KIT, 'function crossReviewCoverage(state)', '§0f ★★ the closed round reports WHICH part each reviewer read')
  has(PAPER_KIT, 'crossReview: coverage,', '§0g ★ and carries it on the unanimous receipt')
  has(PAPER_KIT, 'crossReview: crossReviewCoverage(state),', '§0h and on the capped one')
  has(PAPER_KIT, 'a review of a part that was not assigned is not a review of the rotation this paper assigned', '§0i ★★ `of` must match the assignment')
  has(PAPER_KIT, 'if (state.participants.length < 2) {', '§0j ★★ a one-participant paper is refused BEFORE it moves')
  has(PAPER_KIT, 'crossReviewPossible: false', '§0k and the refusal carries the fact that named the impossibility')
  has(PACK, 'it did NOT resolve because NO FILE EXISTS at that path yet', '§0l ★★ `exists:false` splits by reason (missing)')
  has(PACK, 'it did NOT resolve because the pointer is an ABSOLUTE path', '§0m (absolute)')
  has(PACK, 'CLOSING THE MEETING ENDS THE DEBATE', '§0n ★ the ballot refusal names the way out')
  has(PAPER_KIT, 'vibe_v5_paper { action: "consult"', '§0o ★ the final-blocked hint names a face a caller can invoke')
  has(PROMPTS, 'Members/<成员>/(Propos|Methods|Subproblems|Progress)/<记录 id>.md', '§0p ★★ the evidence teaching names the second legal spelling')
  has(PACK, 'ON THE lean-conformance ROUTE `warrant` IS REQUIRED TOO', '§0q ★ the promote description says the warrant is required there')
})

test('RUN 203 §1 — a move says whether the ROUND moved, and a closed round says who read what', async () => {
  const dir = tmp()
  const { call } = await assemble(dir)
  const target = 'run203-paper'
  const started = await call('vibe_v5_paper', { action: 'start', target, participants: ['r-1', 'r-2'] })
  ok(started.ok === true, 'premise: the paper started with two participants', started)
  const rec = await card(call, 'evidence')
  await call('vibe_v5_paper', { action: 'part', target, part: 'p1', body: '第一节的推导', evidence: [rec], member: 'r-1' })
  await call('vibe_v5_paper', { action: 'part', target, part: 'p2', body: '第二节的推导', evidence: [rec], member: 'r-2' })

  const moved = blockOf(await call('vibe_v5_paper', { action: 'advance', target }), 'advance')
  ok(moved.moved === true, '§1a the paper moved writing → reviewing', moved)
  ok(moved.roundFrom === 1 && moved.roundTo === 1, '§1b ★ the receipt states the round it read on both sides', moved)
  ok(moved.roundMoved === false, '§1c ★ and that the ROUND did not move while the STAGE did', moved)
  has(moved.roundMeans, 'the ROUND did not move', '§1d ★ in words, with the stage move beside it')
  has(moved.roundMeans, 'opened the first cycle', '§1e (round 1 is the opening cycle)')

  const reviewOf = moved.reviewOf || {}
  for (const member of ['r-1', 'r-2']) {
    const assigned = reviewOf[member]
    ok(typeof assigned === 'string' && assigned !== member, '§1f premise: ' + member + ' is assigned another member\'s part', reviewOf)
    const rv = await call('vibe_v5_paper', { action: 'review', target, of: assigned, member, deliverable: true, comments: '读过了' })
    ok(rv.ok === true, '§1g premise: ' + member + ' filed a review OF THE ASSIGNED PART', rv)
  }
  const closed = blockOf(await call('vibe_v5_paper', { action: 'advance', target }), 'advance')
  ok(closed.moved === true && closed.to === 'awaiting-editor', '§1h the round closed for the editor', closed)
  ok(closed.roundMoved === false && closed.roundFrom === closed.roundTo, '§1i ★ the closing move says the round did not move', closed)
  has(closed.roundMeans, 'closed a cycle without opening another', '§1j ★ with the reason the numbers are equal (RUN 203: the sentence follows the STAGE, not the round number)')
  const cov = closed.crossReview || {}
  ok(Array.isArray(cov.parts) && cov.parts.length === 2, '§1k ★★ the receipt lists each part and its reviewer', cov)
  ok(cov.parts.every((p) => typeof p.reviewer === 'string' && p.reviewer !== p.author), '§1l ★ every listed reviewer is NOT the author', cov.parts)
  ok(Array.isArray(cov.uncovered) && cov.uncovered.length === 0, '§1m ★ nothing is uncovered when the rotation was followed', cov)
  has(cov.uncoveredMeans, 'empty ON PURPOSE', '§1n and the empty list says it is a value, not an omission')
})

test('RUN 203 §2 — a review of a part the rotation did not assign is refused by name, and nothing is written', async () => {
  const dir = tmp()
  const { call } = await assemble(dir)
  const target = 'run203-rotation'
  await call('vibe_v5_paper', { action: 'start', target, participants: ['r-1', 'r-2', 'r-3'] })
  const rec = await card(call, 'rotation')
  for (const m of ['r-1', 'r-2', 'r-3']) await call('vibe_v5_paper', { action: 'part', target, part: 'p-' + m, body: m + ' 的部分', evidence: [rec], member: m })
  const moved = blockOf(await call('vibe_v5_paper', { action: 'advance', target }), 'advance')
  const assigned = moved.reviewOf['r-1']
  ok(typeof assigned === 'string', 'premise: the rotation assigned r-1 a part', moved.reviewOf)
  const wrong = ['r-1', 'r-2', 'r-3'].filter((m) => m !== 'r-1' && m !== assigned)[0]
  const bad = await call('vibe_v5_paper', { action: 'review', target, of: wrong, member: 'r-1', deliverable: true, comments: '读了别人的部分' })
  ok(bad.ok !== true, '§2a ★★ the mismatched review is refused', bad)
  ok(String(bad.code || '') === 'VMU_INVALID_ARGUMENT', '§2b ★★ by name (VMU_INVALID_ARGUMENT), not filed as a verdict', bad)
  has(bad.message, assigned, '§2c ★ the message names the part it should have read')
  has(bad.message, wrong, '§2d and the part it named instead')
  has(bad.hint, 'of:"' + assigned + '"', '§2e ★ the hint is the exact argument to send instead')
  const status = blockOf(await call('vibe_v5_paper', { action: 'status', target }), 'status')
  const rows = (status.state || status).reviews || {}
  ok(Object.keys(rows).length === 0, '§2f ★ nothing was written: the reviews map is still empty', rows)
})

test('RUN 203 §3 — a paper that cannot be cross-reviewed is refused where the impossibility is known', async () => {
  const dir = tmp()
  const { call } = await assemble(dir)
  const target = 'run203-solo'
  const started = await call('vibe_v5_paper', { action: 'start', target, participants: ['r-1'] })
  ok(started.ok === true, 'premise: a one-participant paper can be started', started)
  const rec = await card(call, 'solo')
  await call('vibe_v5_paper', { action: 'part', target, part: 'p1', body: '唯一的一节', evidence: [rec], member: 'r-1' })
  const refused = blockOf(await call('vibe_v5_paper', { action: 'advance', target }), 'advance')
  ok(refused.ok !== true, '§3a ★★ the advance is refused', refused)
  ok(String(refused.code || '') === 'VMU_PACK_V5R_CORE_PAPER_STATE', '§3b ★★ by name (paper STATE), before any move', refused)
  ok(refused.crossReviewPossible === false, '§3c ★ the refusal carries the fact that made it impossible', refused)
  has(refused.message, 'fewer than two', '§3d ★ and says why in words')
  const status = blockOf(await call('vibe_v5_paper', { action: 'status', target }), 'status')
  const st = status.paper || status.state || status
  ok(st.status === 'writing', '§3e ★★ the paper did NOT move: it is still in "writing"', st.status)
})

test('RUN 203 §4 — the pointer means splits by REASON (missing is not outside-the-library)', async () => {
  const dir = tmp()
  const { call, handle } = await assemble(dir)
  for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) {
    await handle.kernel.members.hire({ id, slot, institution: 'sim' })
  }
  const card1 = await call('vibe_v5_record_proposition', {
    statement: 'run203 指针命题 一', value: 1, motive: '测试', p: 0.9,
    proof_ref: 'Members/r-acad/Propos/run203-ghost.md#证明', proof_state: 'complete', member: 'r-acad',
  })
  ok(card1.ok === true, 'premise: a card declaring a pointer at a file that does not exist', card1)
  const gate = await call('vibe_v5_meeting', {
    member: 'r-acad', type: 'debate', subject: card1.recordId, agenda: '辩论这张卡', title: 'run203 指针',
  })
  ok(gate.ok === true, 'premise: a debate meeting can be convened over that card', gate)
  const subjectGate = gate.subjectGate || (gate.meeting && gate.meeting.subjectGate) || null
  ok(subjectGate !== null, 'premise: the convene receipt carries subjectGate', { keys: Object.keys(gate) })
  const pp = subjectGate.proofPointer
  const means = String(subjectGate.proofPointerMeans || '')
  ok(pp && pp.reason === 'missing', '§4a premise: the pointer is well formed and MISSING (not outside)', pp)
  ok(pp.insideLibrary === true, '§4b premise: the library says the path is INSIDE its root', pp)
  has(means, 'NO FILE EXISTS at that path yet', '§4c ★★ the means names the MISSING case')
  has(means, 'inside the library root', '§4d ★ and says the pointer WAS inside the root')
  ok(!/not inside the library root$/.test(means), '§4e ★★ the old contradiction is gone (missing is not "outside")', means)
})
