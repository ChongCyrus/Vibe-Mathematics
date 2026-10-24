// tests/vmu-turn-reply-tool.test.mjs — LANE turn-reply: the member's structured report travels through a TOOL
// (`vibe_vmu_turn { op:"reply", report:{...} }`) and the fenced json object stays supported as the COMPATIBILITY path.
//
// What this suite holds the mechanism to (docs/acceptance/conformance/lane-turn-reply.md, 08号决策 in
// vibe-math-vmu/kernel/turn/index.js):
//   ① tool-only  ⇒ the turn completes AND the fields really took effect (read back at the FACE and in status(), not
//                   merely echoed back in the receipt);
//   ② json-only  ⇒ byte-for-byte the old path (this is the regression the rest of the repository depends on);
//   ③ both, non-conflicting ⇒ merged, and the receipt STAMPS source:'tool+text' (one answer, two carriers);
//   ④ both, conflicting     ⇒ named refusal VMU_TURN_REPLY_CONFLICT naming the field, and NOTHING dispatched;
//   ⑤ neither               ⇒ VMU_TURN_NO_FENCE whose message names both channels and whose hint gives both forms;
//   ⑥ tool called outside a member turn ⇒ VMU_TURN_NO_PENDING_MEMBER (no turn is invented);
//   ⑦ tooth-proof: tearing the mechanism out turns at least three of these checks red (method documented below).
//
// Run: node tests/vmu-turn-reply-tool.test.mjs   (last line: === VMU TURN REPLY TOOL: N passed, M failed ===)

import { createTurnOrchestrator, deliverByReturning, facesFrom, mergeReplyChannels, FIELDS, RECORDED_FIELDS, REPLY_FIELDS } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { makeTurnSpec } from '../vibe-math-vmu/tools/turn.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}
const rejects = async (fn) => { try { const v = await fn(); return { caught: false, value: v } } catch (e) { return { caught: true, code: e && e.code, message: String((e && e.message) || e), hint: e && e.hint } } }
const fence = (obj) => 'some prose first\n\n```json\n' + JSON.stringify(obj, null, 2) + '\n```\n'
const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })

// ★ THE FACES ARE FAKES, AND THEY ARE THE READBACK. A receipt that says `executed: 1` proves only that the dispatcher
// believed itself; the arrays below record what actually ARRIVED at the owning face, which is the only claim this lane
// is allowed to make ("设了值" ≠ "生效了").
const makeFaces = () => {
  const spoken = []
  const records = []
  const faces = facesFrom({
    meetings: { speak: async (payload) => { spoken.push(payload); return { ok: true, spoken: spoken.length } } },
    records: { put: async (payload) => { records.push(payload); return { ok: true, put: records.length } } },
  })
  return { faces, spoken, records }
}
const makeGov = (extra = {}) => {
  const { faces, spoken, records } = makeFaces()
  const gov = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), faces, ...extra })
  return { gov, spoken, records }
}

// the tool spec exactly as host.js constructs it (same factory, same param/refused helpers)
const makeSpec = (kernel) => makeTurnSpec({
  param: (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra),
  refused: (code, message, hint) => ({ ok: false, code, message, hint }),
  TOOL_NAMES: { turn: 'vibe_vmu_turn' },
  kernel,
})
const facade = (turn) => ({ turn, members: { roster: () => [] } })

console.log('=== VMU TURN REPLY TOOL (' + FIELDS.length + ' field owners + ' + RECORDED_FIELDS.length + ' bookkeeping fields) ===')

// ① TOOL ONLY: the report is recorded, the turn completes, and the fields REALLY take effect.
{
  const seam = deliverByReturning()
  const { gov, spoken } = makeGov({ deliver: seam })
  const step1 = await gov.step({ members: [{ id: 'm1' }], phase: 'normal' })
  ok(step1.ok === true && step1.awaiting === true, '① step 1 returns the member prompt (caller-played seam)', { code: step1.code })

  const rec = await gov.supplyStructuredReply({ say: 'tool says hello', solved: true })
  ok(rec.ok === true && rec.accepted === true && rec.source === 'tool',
    '① ★ the structured report is ACCEPTED and stamped source:"tool"', { code: rec.code })
  ok(Array.isArray(rec.fields) && rec.fields.includes('say') && rec.fields.includes('solved'),
    '① ★ and the receipt names the fields it took (say + solved)', rec.fields)
  ok(rec.readback && rec.readback.source === 'tool' && rec.readback.member === 'm1',
    '① ★ the READBACK (slot as it really stands) names the member it will answer for', rec.readback)

  const step2 = await gov.step({ members: [{ id: 'm1' }], phase: 'normal' })
  ok(step2.ok === true && step2.receipt && step2.receipt.completed === true && step2.receipt.source === 'tool',
    '① ★ step 2 completes the REPORTED turn instead of asking for a new prompt', step2.receipt)
  // ★ PHASE 12 / run 35 item 2 — CONTRACT CHANGE, and this suite had pinned the OLD dispatch. A BARE-STRING `say` carries
  // no meeting reference, so dispatching it handed `undefined` to the meeting service, which threw "no such meeting:
  // undefined"; that throw then CONSUMED the held turn (the member's next reply read "there is nothing to answer").
  // The dispatcher now SKIPS such a field BY NAME and keeps the sentence on the receipt, so nothing is dropped silently
  // and the turn survives. The face itself stays reachable - block ①b dispatches one and reads it back.
  ok(spoken.length === 0 && Array.isArray(step2.receipt.skippedDetail) && step2.receipt.skippedDetail.some((s) => s.field === 'say' && s.reason === 'no-meeting-bound'),
    '① ★★ a bare-string `say` is NOT dispatched (it has no meeting to attach to) - it is skipped BY NAME', { spoken, skipped: step2.receipt.skippedDetail })
  ok(Array.isArray(step2.receipt.notes) && step2.receipt.notes.some((n) => n.text === 'tool says hello'),
    '① ★★ and the sentence is NOT lost: the same receipt keeps it under its own field name', step2.receipt.notes)
  ok(step2.receipt.fields.includes('say') && step2.receipt.fields.includes('solved'),
    '① ★★ the completed receipt carries both fields (dispatched one + bookkeeping one)', step2.receipt.fields)
  ok(gov.structuredReply() === null,
    '① the slot was CONSUMED: a second step cannot replay the same report')
  const st = gov.status()
  ok(st && st.solvedThisRound && st.solvedThisRound.m1 === true,
    '① the bookkeeping field landed in the kernel status too (solved is per-round state, read back as such)', st && st.solvedThisRound)
}

// ①b THE FACE IS STILL REACHABLE: a `say` that NAMES its meeting is dispatched exactly as before. Without this block the
// skip in ① could be satisfied by a dead path (the mechanism-with-no-consumer class), so the positive case is asserted
// against the consumer's own array, not against the receipt.
{
  const seam = deliverByReturning()
  const { gov, spoken } = makeGov({ deliver: seam })
  await gov.step({ members: [{ id: 'm1' }], phase: 'normal' })
  const said = { meeting: 'm-1', by: 'm1', text: 'a real speech' }
  const rec = await gov.supplyStructuredReply({ say: said })
  ok(rec.ok === true && rec.accepted === true, '①b a meeting-carrying `say` is accepted', { code: rec.code })
  const step2 = await gov.step({ members: [{ id: 'm1' }], phase: 'normal' })
  ok(step2.ok === true && step2.receipt.completed === true, '①b and the round completes', step2.receipt && step2.receipt.completed)
  ok(spoken.length === 1 && spoken[0] && spoken[0].meeting === 'm-1' && spoken[0].text === 'a real speech',
    '①b ★★ it REACHED the meetings face with its own meeting reference (the skip is not a dead path)', spoken)
  ok(Array.isArray(step2.receipt.skippedDetail) && step2.receipt.skippedDetail.length === 0,
    '①b ★ nothing was skipped when the reference was present', step2.receipt.skippedDetail)
}

// ② JSON ONLY: the compatibility path, unchanged. Same seam, same turn, a fenced object in the text reply.
{
  const seam = deliverByReturning()
  const { gov, spoken } = makeGov({ deliver: seam })
  await gov.step({ members: [{ id: 'm1' }], phase: 'normal' })
  const supplied = gov.supplyMemberReply(fence({ say: 'json says hi' }))
  ok(supplied && supplied.ok === true, '② the text reply is accepted by the legacy verb (supplyMemberReply)')
  const step2 = await gov.step({ members: [{ id: 'm1' }], phase: 'normal' })
  ok(step2.ok === true && step2.receipt.source === 'text',
    '② ★ the json path still runs, and says so (source:"text")', step2.receipt)
  ok(step2.receipt.fields.includes('say') && spoken.length === 0 &&
    Array.isArray(step2.receipt.notes) && step2.receipt.notes.some((n) => n.text === 'json says hi'),
    '② ★★ the json `say` travels the SAME path: not dispatched (no meeting), kept on the receipt', { spoken, notes: step2.receipt.notes })
  ok(step2.receipt.completed === undefined,
    '② the ordinary round is NOT reported as a report-completion (shape stays distinct)')
}

// ③ BOTH, NON-CONFLICTING ⇒ merged, source:'tool+text'. This is the SUBAGENT route: the member reports through the
// tool while its turn is in flight, and its returned text ALSO carries a fenced object. One answer, two carriers.
{
  const { faces, spoken } = makeFaces()
  let gov = null
  const deliver = async ({ turn }) => {
    if (typeof gov.supplyStructuredReply === 'function') {
      await gov.supplyStructuredReply({ say: 'tool half', solved: true }, { forMember: turn.member })
    }
    // ★ the payload must NAME its meeting: a reply carries no meeting reference, so a meetings-face field without one is
    // skipped by name (run 35 item 2) - and `input` maps to that same face, so the positive case has to carry it too.
    return { reply: fence({ input: { meeting: 'm-1', kind: 'note' } }), childId: 'child-1', stopReason: 'end' }
  }
  gov = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), faces, deliver })
  const r = await gov.run({ member: 'm1', phase: 'normal' })
  ok(r.ok === true && r.source === 'tool+text',
    '③ ★★ both channels present, non-conflicting ⇒ merged and stamped source:"tool+text"', { source: r.source, code: r.code })
  ok(r.fields.includes('say') && r.fields.includes('solved') && r.fields.includes('input'),
    '③ the merged reply carries every field from both channels', r.fields)
  ok(r.textIgnored !== true && Array.isArray(r.textOnlyFields) && r.textOnlyFields.includes('input'),
    '③ the receipt names which fields came ONLY from the text (input)', r.textOnlyFields)
  // ★ ORDER IS THE MERGED REPLY'S KEY ORDER, NOT THE CHANNEL ORDER (the merge lays the text keys down first and the
  // tool report overwrites in place), so this asserts WHAT arrived at the face, not in which of the two orders.
  // ★ Only the OBJECT field (`input`, which carries its own shape) reaches a face; the bare-string `say` is skipped by
  // name and kept on the receipt - the same contract as ①/②, read back at the consumer and on the ledger of skips.
  ok(spoken.length === 1 && spoken.some((s) => s && s.meeting === 'm-1' && s.kind === 'note'),
    '③ ★★ the text-only `input` (which names its meeting) really reached its face', spoken)
  ok(Array.isArray(r.notes) && r.notes.some((n) => n.text === 'tool half'),
    '③ ★★ the skipped `say` line is still readable on the merged receipt', r.notes)
  // and the merge rule itself, at its own boundary: equal values collapse, differing values refuse.
  const same = mergeReplyChannels({ say: 'a' }, { say: 'a' })
  ok(same.ok === true && same.conflicts.length === 0 && same.fields.join(',') === 'say',
    '③ equal values on both channels collapse into ONE field (not a duplicate, not a conflict)', same.fields)
}

// ④ BOTH, CONFLICTING ⇒ named refusal, and NOTHING is dispatched.
{
  const { faces, spoken } = makeFaces()
  let gov = null
  const deliver = async ({ turn }) => {
    if (typeof gov.supplyStructuredReply === 'function') {
      await gov.supplyStructuredReply({ say: 'tool half', solved: true }, { forMember: turn.member })
    }
    return { reply: fence({ say: 'text half' }), childId: 'child-1', stopReason: 'end' }
  }
  gov = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), faces, deliver })
  const res = await rejects(() => gov.run({ member: 'm1', phase: 'normal' }))
  ok(res.caught === true && res.code === 'VMU_TURN_REPLY_CONFLICT',
    '④ ★★ conflicting values on the SAME field ⇒ named refusal VMU_TURN_REPLY_CONFLICT', { code: res.code })
  ok(typeof res.message === 'string' && res.message.includes('say'),
    '④ ★ the refusal NAMES the conflicting field', res.message)
  ok(spoken.length === 0,
    '④ ★ nothing was dispatched before the refusal (no half-applied turn)', spoken)
}

// ⑤ NEITHER ⇒ VMU_TURN_NO_FENCE, with a message that names both channels and a hint that gives both forms.
{
  const seam = deliverByReturning()
  const { gov, spoken } = makeGov({ deliver: seam })
  await gov.step({ members: [{ id: 'm1' }], phase: 'normal' })
  gov.supplyMemberReply('just prose, no json at all, and no tool report either')
  const step2 = await gov.step({ members: [{ id: 'm1' }], phase: 'normal' })
  ok(step2.ok === false && step2.code === 'VMU_TURN_NO_FENCE',
    '⑤ ★ neither channel ⇒ VMU_TURN_NO_FENCE (the code is unchanged)', { code: step2.code })
  ok(typeof step2.message === 'string' && step2.message.includes('工具汇报') && step2.message.includes('围栏 JSON'),
    '⑤ ★ the message names BOTH missing channels (tool report + fenced json)', step2.message)
  ok(typeof step2.hint === 'string' && step2.hint.includes('op:"reply"') && /json/i.test(step2.hint),
    '⑤ ★★ the hint gives the tool form AND the json compatibility form', step2.hint)
  ok(spoken.length === 0, '⑤ nothing was dispatched', spoken)
}

// ⑥ A REPORT WITH NO OPEN MEMBER TURN ⇒ VMU_TURN_NO_PENDING_MEMBER. The tool must not invent a turn, and the refusal
// must reach the caller through the TOOL's returned shape (not as a thrown engine error).
{
  const { gov } = makeGov({ deliver: deliverByReturning() })
  const direct = await rejects(() => gov.supplyStructuredReply({ say: 'out of nowhere' }))
  ok(direct.caught === true && direct.code === 'VMU_TURN_NO_PENDING_MEMBER',
    '⑥ ★ a report with no open turn is REFUSED BY NAME (kernel level)', { code: direct.code })

  const spec = makeSpec(facade(gov))
  const viaTool = await spec.run({ op: 'reply', report: { say: 'out of nowhere' } }, { agent: { id: 'session-root' } })
  ok(viaTool && viaTool.ok === false && viaTool.code === 'VMU_TURN_NO_PENDING_MEMBER',
    '⑥ ★★ the TOOL answers the same code instead of throwing (the caller can read it)', viaTool)
  ok(typeof viaTool.hint === 'string' && viaTool.hint.includes('awaiting:true') && viaTool.hint.includes('fenced-json'),
    '⑥ the refusal hint keeps the KERNEL wording (the tool passes it through, it does not re-decide)', viaTool.hint)

  // and the counterpart: with a turn genuinely open, a MEMBER caller may report through the same spec (G6 guard opened
  // for op:"reply" only - step/drive stay root-only).
  const seam2 = deliverByReturning()
  const w = makeGov({ deliver: seam2 })
  await w.gov.step({ members: [{ id: 'm1' }], phase: 'normal' })
  const memberSpec = makeSpec(facade(w.gov))
  const memberRes = await memberSpec.run({ op: 'reply', report: { say: 'from the member itself' } }, { agent: { id: 'child-1' } })
  ok(memberRes && memberRes.ok === true && memberRes.accepted === true,
    '⑥ ★ a MEMBER caller can report (op:"reply" is member-safe), unlike step/drive', memberRes)
  const memberStep = await memberSpec.run({ op: 'step' }, { agent: { id: 'child-1' } })
  ok(memberStep && memberStep.ok === false && memberStep.code === 'VMU_NOT_PERMITTED',
    '⑥ ★★ …while step from a member is still VMU_NOT_PERMITTED (the engine stays root-only)', memberStep)
}

// ⑦ TOOTH-PROOF. The mechanism has teeth only if REMOVING it turns checks red. Method (deliberately NOT applied to the
// repository - a torn copy is built in memory here, and this suite must never leave the repo torn):
//   (a) in vibe-math-vmu/kernel/turn/index.js: delete `supplyStructuredReply`, `completeStructuredReply`,
//       `structuredReply` from the returned object; delete `replyFromChannels`' report branch (leave `parse(raw)`);
//       delete the `awaitingStructuredReport()` guard at the top of `step`; delete `consumePending` from
//       deliverByReturning.  ⇒ ①'s readback/completion checks, ③'s merge, ⑥'s member acceptance all go red.
//   (b) in vibe-math-vmu/tools/turn.js: delete the `op === 'reply'` block and the `op !== 'reply'` allowance in the G6
//       guard.  ⇒ ⑥'s tool-level checks go red.
// Here the tear is a Proxy that hides the three verbs (a), which is exactly the state (a)'s deletion produces.
const tornKernel = (gov) => new Proxy(gov, {
  get(target, key) {
    if (key === 'supplyStructuredReply' || key === 'completeStructuredReply' || key === 'structuredReply') return undefined
    return Reflect.get(target, key)
  },
  has(target, key) {
    if (key === 'supplyStructuredReply' || key === 'completeStructuredReply' || key === 'structuredReply') return false
    return Reflect.has(target, key)
  },
})
const probe = async (torn) => {
  const wrap = (gov) => (torn ? tornKernel(gov) : gov)
  // p1: a report can be RECORDED for the open turn
  const a = makeGov({ deliver: deliverByReturning() })
  const govA = wrap(a.gov)
  await govA.step({ members: [{ id: 'm1' }], phase: 'normal' })
  let accepts = false
  try { const r = await govA.supplyStructuredReply({ say: 'x' }); accepts = r && r.accepted === true } catch { accepts = false }
  // p2: a reported turn is COMPLETED by step (not re-prompted)
  let completes = false
  try { const s = await govA.step({ members: [{ id: 'm1' }], phase: 'normal' }); completes = !!(s && s.receipt && s.receipt.completed === true) } catch { completes = false }
  // p3: tool + text merge and stamp source:'tool+text'
  const b = makeFaces()
  let govB = null
  const deliverB = async ({ turn }) => {
    if (typeof govB.supplyStructuredReply === 'function') await govB.supplyStructuredReply({ say: 'tool half' }, { forMember: turn.member })
    return { reply: fence({ input: { kind: 'note' } }), childId: 'child-1', stopReason: 'end' }
  }
  govB = wrap(createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), faces: b.faces, deliver: deliverB }))
  let merges = false
  try { const r = await govB.run({ member: 'm1', phase: 'normal' }); merges = r && r.source === 'tool+text' } catch { merges = false }
  // p4: the TOOL face accepts a report
  const c = makeGov({ deliver: deliverByReturning() })
  await c.gov.step({ members: [{ id: 'm1' }], phase: 'normal' })
  const specC = makeSpec(facade(wrap(c.gov)))
  const viaTool = await specC.run({ op: 'reply', report: { say: 'y' } }, { agent: { id: 'session-root' } })
  const faceAccepts = !!(viaTool && viaTool.ok === true && viaTool.accepted === true)
  return { accepts, completes, merges, faceAccepts }
}
{
  const real = await probe(false)
  const torn = await probe(true)
  ok(real.accepts === true && real.completes === true && real.merges === true && real.faceAccepts === true,
    '⑦ 正：the intact mechanism passes all four probes (record→complete→merge→tool)', real)
  const flipped = Object.keys(real).filter((k) => real[k] === true && torn[k] === false)
  ok(flipped.length >= 3,
    '⑦ ★★ 反：tearing the mechanism out turns at least THREE checks red (' + flipped.join(',') + ')', { real, torn })
}

console.log('=== VMU TURN REPLY TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) console.log('FAILURES: ' + failures.join(' | '))
process.exit(failed === 0 ? 0 : 1)
