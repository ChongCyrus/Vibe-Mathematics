// tests/vmu-run30-findings.test.mjs — LIVE RUN 30: four receipts that were right about the mechanism and wrong about
// what they said, plus one step that was named for a call nobody can make.
//
// WHAT THE RUN SAID (run 30, build 11f6be1b, the institute's own acceptance brief; log
// `_oneoff/vm-slv/full-1026-182120.jsonl`):
//   ④ THE MAIL DID NOT DISCLOSE THE OBJECT'S PROVENANCE. The office asked about `p-nope` — an id the propositions
//      library did NOT hold — and the receipt was honest (`propositionKind:"unverified"`, `propositionVerified:false`)
//      while the MAIL the two members received read exactly like a request about a registered card. Run 29 ② was the
//      same defect class on a different sentence (a fact asserted in the body, absent from the receipt). The clause is
//      now derived ONCE from `propotionOf` and carried both in the body and in `propositionClause`.
//   ② THE STEP NAMED THE WRONG PARAMETER. The face sends a singular `member` as a one-seat selection (run 29 fix A),
//      and the receipt answered "the caller named `members`" for it — a sentence describing a parameter nobody passed.
//      Three ways to name a selection now have three sentences, read BEFORE the shorthand rewrites `members`.
//   ③ `floor{satisfiedBy:false}` SAT BESIDE `ok:true`. Nothing was skipped: `floor` is the VOTE floor the CLOSING rail
//      enforces and a ruling is not a vote. The sentence saying so (`floorMeans` / `floor.means`) travels with the
//      numbers instead of being left to the doc.
//   ⑤ THE NOTICE SAID "CORRECT THE CARD" AND NAMED NO CALL. The run ended with the card still at its old p, no
//      `debate_ruling` row, and the office reporting "it said change it, but not with what". `correction` now names the
//      tool, the card id and the values this ruling produced.
//   ⑥ "closed" AND "closure vote unconfirmed" WERE BOTH TRUE AND UNRELATED. The close came back `ok:true` while
//      `closureVote{cast:false, confirmed:false, missing:["acad-01"]}`; a reader could only guess that closing moves a
//      meeting to the archive under the close RAILS while the closure VOTE is a separate unanimity mechanism. The close
//      receipt now carries the second reading and the sentence about their relation, and the closure-vote `reason` no
//      longer says "silence blocks closure" (it blocks the closure VOTE, not the close).
//
// Run: node tests/vmu-run30-findings.test.mjs        Last line: === VMU RUN30 FINDINGS: N passed, M failed ===

import { mkdtemp } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const imp = (p) => import(pathToFileURL(resolve(REPO, p)).href)

const km = await imp('vibe-math-vmu/kernel/index.js')
const pm = await imp('vibe-math-vmu/kernel/prompt/index.js')
const core = await imp('vibe-math-vmu/packs/v5r/prompts/v5r-core.js')
const sw = await imp('vibe-math-vmu/packs/v5r/middleware/prompt-switches.js')
const tm = await imp('vibe-math-vmu/tools/turn.js')
const entry = await imp('vibe-math-vmu/vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name); return true }
  failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 400) + ']'))
  console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 400) + ']'))
  return false
}

console.log('=== VMU RUN30 FINDINGS ===')

// ── ② THE STEP NAMES THE PARAMETER THE CALLER ACTUALLY USED ────────────────────────────────────────────────────────
// A recording delivery seam: each member runs in its own child session, so a step really settles and really reports.
{
  const prompt = () => pm.createPromptPipeline({ sections: core.v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })
  const kernel = km.createKernel({
    clock: () => 1000,
    sectionPolicy: sw.decideSections,
    prompt: prompt(),
    deliverTurn: async ({ turn }) => ({ reply: JSON.stringify({ say: 'noted' }), deliveryPath: 'activation', childId: 'child-' + (turn && turn.member), stopReason: 'completed' }),
  })
  kernel.declareSlots([{ id: 'chair' }, { id: 'member' }])
  for (const id of ['m-a', 'm-b', 'm-c']) await kernel.members.hire({ id, slot: id === 'm-a' ? 'chair' : 'member', institution: 'sim' })
  const face = tm.makeTurnSpec({
    param: (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra),
    refused: (code, message, hint) => ({ ok: false, code, message, hint }),
    TOOL_NAMES: { turn: 'vibe_vmu_turn' },
    kernel,
  })

  const single = await face.run({ op: 'step', member: 'm-b', why: 'run 30 ② singular' })
  ok(single && single.ok === true && typeof single.requestedMembersNote === 'string',
    '② the singular call settles and the receipt carries `requestedMembersNote`', single && { ok: single.ok, code: single.code, message: String(single.message || '').slice(0, 200), keys: single && Object.keys(single).slice(0, 12) })
  const noteSingle = String((single && single.requestedMembersNote) || '')
  ok(noteSingle.includes('`member`') && noteSingle.includes('SINGULAR'),
    '② the note for a singular call names `member` (SINGULAR) — it does not credit `members`, which the caller never passed', { note: noteSingle.slice(0, 220) })
  ok(!noteSingle.includes('the caller named `members`'),
    '② ★ the run-30 sentence is gone: a call that passed no `members` is not described as having named `members`', { note: noteSingle.slice(0, 220) })

  const listed = await face.run({ op: 'step', members: ['m-c'], why: 'run 30 ② list' })
  const noteListed = String((listed && listed.requestedMembersNote) || '')
  ok(listed && listed.ok === true && noteListed.includes('the caller named `members`') && !noteListed.includes('SINGULAR'),
    '② a `members` list keeps its own sentence — the two shapes are distinguishable, so the note describes the CALL', { note: noteListed.slice(0, 220) })

  const nobody = await face.run({ op: 'step', why: 'run 30 ② roster default' })
  const noteNobody = String((nobody && nobody.requestedMembersNote) || '')
  ok(nobody && nobody.ok === true && nobody.requestedMembersSource === 'roster-default' && noteNobody.includes('EMPTY by design'),
    '② with nobody named the roster default keeps its "EMPTY by design" sentence (the run-40 pin is untouched)', { source: nobody && nobody.requestedMembersSource })
}

// ── ④ / ③ / ⑤ / ⑥: the pack faces, driven through the host (the same functions the wire exposes) ────────────────────
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true }
  try { return { parsed: JSON.parse(await spec.execute(args, {})) } } catch (e) { return { parsed: undefined, code: e && e.code, message: e && e.message, hint: e && e.hint } }
}
const R = (r) => r.parsed || { ok: false, code: r.code, message: r.message, hint: r.hint }

const root = await mkdtemp(join('D:/_tmp', 'vmu-run30-'))
const b = await boot({ root, packs: ['v5r'] })
const kernel = b.handle.kernel
for (const id of ['acad-01', 'res-01', 'res-02']) await kernel.members.hire({ id, slot: id === 'acad-01' ? 'chair' : 'member' })

// ④ AN OBJECT NOBODY CAN CHECK IS REFUSED BEFORE ANY MAIL EXISTS ────────────────────────────────────────────────────
{
  // ── OLD INTENT (RUN 30 §④): a meeting that declared NO debate subject accepted an unregistered one-line object as
  // `propositionKind:"unverified"` and the MAIL had to disclose 「尚未在命题库登记」 so the member knew the target was not
  // on the propositions track. MEASURED ON THE 69TH REAL MACHINE (RUN 249 / A, rec-3): `vibe_v5_verdict_ask` with
  // `p-rulecheck-不存在` returned `ok:true`, `propositionKind:"unverified"` and delivered mail while its own description
  // promised `VMU_ASK_UNKNOWN_PROPOSITION`. NEW SEMANTICS: the ask is REFUSED by name and NO mail is delivered — the
  // disclosure moved from inside the mail to the refusal itself. SAME THING PROVEN: the caller learns the object is not
  // on the propositions track, and (stronger than before) every member is spared a request for a ruling on a target that
  // cannot be aggregated; a REGISTERED card still gets no disclaimer and still reaches the members.
  const convened = await call(b, 'vibe_v5_meeting', { agenda: '验收 run30 ④', type: 'ordinary', member: 'acad-01' })
  const mid = R(convened).meeting
  ok(typeof mid === 'string' && mid.length > 0, '④ a meeting was convened (no debate subject declared)', { meeting: mid, code: R(convened).code })
  for (const m of ['acad-01', 'res-01', 'res-02']) await call(b, 'vibe_vmu_meeting', { action: 'attend', id: mid, member: m })
  await call(b, 'vibe_vmu_meeting', { action: 'speak', id: mid, member: 'res-01', text: 'one-line target' })
  const inboxBefore = R(await call(b, 'vibe_v5_inbox', { member: 'res-01', status: 'all' }))
  const rowsBefore = Array.isArray(inboxBefore.rows) ? inboxBefore.rows.length : -1
  ok(rowsBefore >= 1, '④ precondition: the member already has mail (the convening invitation), so "no new mail" is measurable', { rows: rowsBefore })

  const refused = R(await call(b, 'vibe_v5_verdict_ask', { meeting: mid, proposition_id: 'p-typo-30' }))
  ok(refused.ok === false && refused.code === 'VMU_ASK_UNKNOWN_PROPOSITION',
    '④ an unregistered one-line object is REFUSED by name — the face no longer mails every member about a target it cannot check', { ok: refused.ok, code: refused.code })
  ok(typeof refused.message === 'string' && refused.message.includes('p-typo-30') && refused.message.includes('NO debate subject'),
    '④ the refusal carries the fact the old mail disclaimer carried: the object is not a card, not a file, and this meeting declared NO debate subject', { message: String(refused.message || '').slice(0, 240) })
  ok(typeof refused.hint === 'string' && /record the proposition first/.test(refused.hint) && /FILE/.test(refused.hint),
    '④ ★ the hint names the reachable repairs (record the card first / the meeting object / a FILE reference), so the refusal is a next move, not a dead end', { hint: String(refused.hint || '').slice(0, 260) })

  const inboxAfter = R(await call(b, 'vibe_v5_inbox', { member: 'res-01', status: 'all' }))
  const rowsAfter = Array.isArray(inboxAfter.rows) ? inboxAfter.rows.length : -1
  const carriesClause = (Array.isArray(inboxAfter.rows) ? inboxAfter.rows : []).some((e) => String((e && e.subject) || '').includes('尚未在命题库登记'))
  ok(rowsAfter === rowsBefore,
    '④ ★ NOTHING was mailed: the member mailbox row count is unchanged by the refused ask (old intent: the member must not be asked to rule on an uncheckable object)', { before: rowsBefore, after: rowsAfter })
  ok(!carriesClause,
    '④ ★ and no row carries the old 「尚未在命题库登记」 disclaimer — the disclosure is the refusal now, so it cannot be mistaken for a mail that was sent', { carriesClause })

  // …and a REGISTERED card needs no disclaimer and is still accepted + mailed: the fix is a refusal of the uncheckable
  // shape, not a slogan or a blanket closure of the face.
  const card = R(await call(b, 'vibe_v5_record_proposition', { track: 'propositions', statement: 'p-r30 is one thing', value: 'objects', motive: 'run30 ④', p: 0.5, member: 'res-01' }))
  ok(card.ok === true && typeof card.recordId === 'string', '④ setup: a card was recorded', { ok: card.ok, recordId: card.recordId, code: card.code })
  const askedCard = R(await call(b, 'vibe_v5_verdict_ask', { meeting: mid, proposition_id: card.recordId }))
  ok(askedCard.ok === true && askedCard.propositionKind === 'card' && askedCard.propositionClause === null,
    '④ a card the library HOLDS is still accepted with NO disclaimer (clause null) — the check follows the provenance, and the refusals above did not narrow the legal shapes', { kind: askedCard.propositionKind, clause: askedCard.propositionClause, code: askedCard.code })
  ok(askedCard.mail && !String(askedCard.mail.text || '').includes('尚未在命题库登记'),
    '④ ★ the card mail carries no "not registered" clause — the fix is a disclosure, not a slogan', { tail: String(askedCard.mail && askedCard.mail.text || '').slice(-180) })
}

// ③ THE FLOOR TRAVELS WITH ITS OWN SENTENCE ─────────────────────────────────────────────────────────────────────────
// ⑤ THE NOTICE NAMES THE CALL THAT CORRECTS THE CARD
{
  const card = R(await call(b, 'vibe_v5_record_proposition', { track: 'propositions', statement: 'odds sum to 2', value: 'odds', motive: 'run30 ③⑤', p: 0.5, member: 'res-01' }))
  // An ORDINARY meeting is enough for the ruling face: `vibe_v5_verdict_final` aggregates verdicts over a meeting, and
  // the v5r proof gate guards `type:"debate"` at CONVENING time (a card at p=0.5 has no finished proof yet, so a debate
  // meeting would be refused THERE — that gate is a different mechanism from this receipt).
  const mid = R(await call(b, 'vibe_v5_meeting', { agenda: '验收 run30 ③⑤', type: 'ordinary', member: 'acad-01' })).meeting
  for (const m of ['acad-01', 'res-01', 'res-02']) await call(b, 'vibe_vmu_meeting', { action: 'attend', id: mid, member: m })
  await call(b, 'vibe_vmu_meeting', { action: 'speak', id: mid, member: 'res-01', text: 'debate a' })
  await call(b, 'vibe_vmu_meeting', { action: 'speak', id: mid, member: 'res-02', text: 'debate b' })
  const ruled = R(await call(b, 'vibe_v5_verdict_final', {
    meeting: mid, proposition_id: card.recordId, owner: 'res-01',
    verdicts: [{ member: 'res-01', p: 0.5, reason: 'a' }, { member: 'res-02', p: 0.5, reason: 'b' }],
  }))
  ok(ruled.ok === true && ruled.mode === 'mean' && ruled.decided === false,
    '③ setup: the ruling is a MEAN and `decided:false` (the two verdicts disagree)', { ok: ruled.ok, code: ruled.code, mode: ruled.mode })
  ok(ruled.ok === true && ruled.floor && ruled.floor.readable === true && typeof ruled.floor.means === 'string' && ruled.floor.means.includes('GATES this ruling'),
    '③ `floor.means` says WHICH floor it is AND that it gates this ruling (rule L47), instead of leaving the number unexplained', { means: String((ruled.floor || {}).means || '').slice(0, 200) })
  const floorMeans = String((ruled.floor && ruled.floor.means) || '')
  ok(floorMeans.includes('signed counts SIGNATURES') && ruled.floor.gate && ruled.floor.gate.enforced === true,
    '③ ★ the sentence names the SIGNER set (filed members + the signing chair) and the receipt carries the executed gate (`floor.gate`), so `ok:true` can no longer read as a skipped gate', { means: floorMeans.slice(0, 240) })
  ok(ruled.floor.satisfiedBy === true && ruled.floor.gate.signed === 3 && ruled.floor.gate.required === 3,
    '③ ★ 三席所里两位成员交裁决 + 主席签字 = 3 = m ⇒ floor 真的满足（不再是结构性 false 的自述读数）',
    ruled.floor.gate && { signed: ruled.floor.gate.signed, required: ruled.floor.gate.required, satisfiedBy: ruled.floor.satisfiedBy })
  ok(typeof ruled.floorMeans === 'string' && ruled.floor && ruled.floorMeans === ruled.floor.means,
    '③ `floorMeans` is carried at the top level too (the pair `satisfiedBy`/`ok` is what a reader actually misreads)')
  ok(ruled.floor.satisfiedBy === false || ruled.floor.satisfiedBy === true, '③ `satisfiedBy` is a boolean (measured, not asserted)')
  ok(ruled.correction && ruled.correction.needed === true && ruled.correction.tool === 'vibe_v5_record_proposition',
    '⑤ the receipt names the tool that corrects the card', { correction: ruled.correction && { tool: ruled.correction.tool, needed: ruled.correction.needed } })
  ok(ruled.correction.cardId === card.recordId && ruled.correction.onRecord === true,
    '⑤ `correction.cardId` is the card this ruling is about (the holder knows WHICH row to edit)', { cardId: ruled.correction.cardId, recordId: card.recordId })
  ok(typeof ruled.correction.call === 'string' && ruled.correction.call.includes('vibe_v5_record_proposition') && ruled.correction.call.includes('p: ') && ruled.correction.call.includes('debate_ruling'),
    '⑤ ★ `correction.call` is an executable call carrying the ruled p and a `debate_ruling` row — "correct it, with what" is answerable from the receipt', { call: String(ruled.correction.call || '').slice(0, 260) })
  ok(ruled.correction.call.includes(String(ruled.value)),
    '⑤ the call carries the value THIS ruling produced (not a template with a placeholder)', { value: ruled.value, call: String(ruled.correction.call || '').slice(0, 200) })
  ok(typeof ruled.correction.means === 'string' && ruled.correction.means.includes('does not write the card'),
    '⑤ `correction.means` says this face does not write the card itself (the notice is the framework act, the edit is the holder act)', { means: String(ruled.correction.means || '').slice(0, 200) })
}

// ⑥ THE CLOSE RECEIPT CARRIES THE CLOSURE VOTE, AND NAMES THEIR RELATION ────────────────────────────────────────────
{
  const mid = R(await call(b, 'vibe_v5_meeting', { agenda: '验收 run30 ⑥', type: 'ordinary', member: 'acad-01' })).meeting
  for (const m of ['acad-01', 'res-01', 'res-02']) await call(b, 'vibe_vmu_meeting', { action: 'attend', id: mid, member: m })
  const before = R(await call(b, 'vibe_vmu_status', { detail: 'closure' }))
  const closed = R(await call(b, 'vibe_vmu_meeting', { action: 'close', id: mid, member: 'acad-01', reason: 'run30 ⑥' }))
  ok(closed.ok === true && closed.closeSemantics === 'service-archives',
    '⑥ setup: the service meeting closes (the archive semantics are unchanged)', { ok: closed.ok, code: closed.code, semantics: closed.closeSemantics })
  ok(closed.closureVote && typeof closed.closureVote === 'object',
    '⑥ ★ the close receipt carries the CLOSURE VOTE reading beside the close result (run 30 saw one and had to hunt for the other)', { closureVote: closed.closureVote && Object.keys(closed.closureVote).slice(0, 8) })
  ok(typeof closed.closureVoteNote === 'string' && /not a requirement of this close/i.test(String(closed.closureVoteNote || '')),
    '⑥ ★ `closureVoteNote` says the closure vote neither gated nor was gated by this close — "closed" ≠ "unanimously judged solved"', { note: String(closed.closureVoteNote || '').slice(0, 220) })
  ok(typeof closed.closureVoteNote === 'string' && closed.closureVoteNote.includes('enforced'),
    '⑥ the note names the close RAILS (`enforced`) so a reader can see WHICH mechanism decided the close', { note: String(closed.closureVoteNote || '').slice(0, 260) })
  const reason = String((before.closureVote && before.closureVote.reason) || '')
  ok(reason.length === 0 || reason.includes('CLOSURE VOTE'),
    '⑥ the closure-vote `reason` no longer says "silence blocks closure" (it says which of the two the silence blocks)', { reason: reason.slice(0, 200) })
  ok(before.closureVote && before.closureVote.cast === false && Array.isArray(before.closureVote.missing),
    '⑥ setup: at close time the closure vote is real and unmet (cast:false with a named missing set)', { cast: before.closureVote && before.closureVote.cast, missing: before.closureVote && before.closureVote.missing })
}

console.log('')
if (failed) {
  console.error('FAILURES:')
  for (const f of failures) console.error('  FAIL ' + f)
  console.error('=== VMU RUN30 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ===')
  process.exit(1)
} else {
  console.log('=== VMU RUN30 FINDINGS: ' + passed + ' passed, 0 failed ===')
}
