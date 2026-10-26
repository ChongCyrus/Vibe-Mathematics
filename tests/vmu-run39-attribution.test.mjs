// tests/vmu-run39-attribution.test.mjs — LIVE RUN 39 / F-10 + F-11.
//
// F-10: a member that wrote its progress through the REPLY CHANNEL (the fenced json envelope, which the prompt calls
// the membership channel) produced a row with NO author — `by:null`, so `owner:null` — while the same kind of row
// written through the tool face carries `member`. The per-member library read and the status board's "该成员最近一条"
// both filter on the author, so the institute saw a row nobody owned. The turn already knows whose turn it is.
//
// F-11: the shape refusals (NO_FENCE / BAD_JSON) already disclose that a refusal is about the REPLY only (the child
// session may have run invisible tools). An APPLY refusal — e.g. a `progress` field the records face rejects with
// VMU_INVALID_ARGUMENT — carried no such disclosure, although a tool-face write in the same turn really had landed.
//
// Run: node tests/vmu-run39-attribution.test.mjs   (last line: === VMU RUN39 ATTRIBUTION: N passed, M failed ===)

import { createTurnOrchestrator, deliverByReturning, facesFrom, FIELD_OWNERS } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}
const fence = (obj) => 'prose first\n\n```json\n' + JSON.stringify(obj) + '\n```\n'
const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })

/** Faces are FAKES and they are the readback: `records[]` is what ARRIVED at the owning face. */
const makeGov = (extra = {}, putImpl = null) => {
  const records = []
  const faces = facesFrom({
    records: { put: async (payload) => { records.push(payload); if (putImpl) return putImpl(payload); return { ok: true, put: records.length } } },
  })
  const seam = deliverByReturning()
  const gov = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), faces, deliver: seam, ...extra })
  return { gov, records, seam }
}
const runFence = async (reply) => {
  const { gov, records } = makeGov()
  const step1 = await gov.step({ member: 'm1', members: [{ id: 'm1' }], phase: 'normal' })
  if (!step1.ok || step1.awaiting !== true) throw new Error('precondition: the first step must await the caller, got ' + JSON.stringify(step1).slice(0, 200))
  gov.supplyMemberReply(fence(reply))
  const step2 = await gov.step({ member: 'm1', members: [{ id: 'm1' }], phase: 'normal' })
  return { step2, records }
}

console.log('=== VMU RUN39 ATTRIBUTION (field owners: ' + Object.keys(FIELD_OWNERS).length + ') ===')

// ① THE DEFECT ITSELF: a fenced `progress` field with no author must arrive at the records face WITH the turn's member.
{
  const { step2, records } = await runFence({ progress: { track: 'progress', title: '第5轮', body: '归纳假说已写。' } })
  ok(step2.ok === true, '① the fence reply completes (the channel itself is not the defect)', step2.code)
  ok(records.length === 1, '① the records face saw exactly one put', records.length)
  ok(records[0] && records[0].by === 'm1', '① ★ the row is attributed to the member whose turn it was (by === "m1")', records[0] && records[0].by)
  const attr = step2.receipt && Array.isArray(step2.receipt.attributed) ? step2.receipt.attributed.find((e) => e.field === 'progress') : null
  ok(attr && attr.by === 'm1', '① ★ the receipt says WHO the kernel attributed it to', step2.receipt && step2.receipt.attributed)
  ok(step2.receipt && typeof step2.receipt.attributionMeans === 'string' && /filled the author/.test(step2.receipt.attributionMeans),
    '① ★ and explains why that is not an invention', step2.receipt && step2.receipt.attributionMeans)
}

// ② A MEMBER THAT NAMES ITS OWN AUTHOR IS UNTOUCHED: the kernel fills a gap, it does not overrule a value.
{
  const { records } = await runFence({ progress: { track: 'progress', title: 'a', body: 'b', by: 'r-9' } })
  ok(records[0] && records[0].by === 'r-9', '② an explicit author wins and is not overwritten', records[0] && records[0].by)
}

// ③ THE GUARD IS BY FACE/OP, NOT "EVERY PAYLOAD": a field that is not a record write keeps its exact shape.
{
  const { records } = await runFence({ progress: 'just a string, no object at all' })
  ok(records.length === 1 && records[0] === 'just a string, no object at all',
    '③ a non-object payload is passed through untouched (the kernel does not invent an object to attribute)',
    { seen: records[0], typeof: typeof records[0] })
}

// ④ F-11: AN APPLY REFUSAL CARRIES THE SIDE-EFFECT DISCLOSURE, because the child session is equally invisible.
{
  const { gov, records } = makeGov({}, () => { const e = new Error('kind "undefined" is not allowed'); e.code = 'VMU_INVALID_ARGUMENT'; e.hint = 'pass kind; the track does not imply it'; throw e })
  await gov.step({ member: 'm1', members: [{ id: 'm1' }], phase: 'normal' })
  gov.supplyMemberReply(fence({ progress: { track: 'progress', title: 'x', body: 'y' } }))
  const step2 = await gov.step({ member: 'm1', members: [{ id: 'm1' }], phase: 'normal' })
  ok(records.length === 1, '④ the apply refusal happens AFTER the face was reached (one call arrived)', records.length)
  ok(step2.ok === false && step2.code === 'VMU_INVALID_ARGUMENT', '④ the refusal keeps its own code', step2.code)
  ok(step2.sideEffectsUnverified === true, '④ ★ the apply refusal says the side effects were NOT verified', step2.sideEffectsUnverified)
  ok(typeof step2.sideEffectsMeans === 'string' && /read the record tracks/.test(step2.sideEffectsMeans),
    '④ ★ and hands the operator the check that settles it (read the record tracks)', step2.sideEffectsMeans)
}

// ⑤ TOOTH-PROOF (the mechanism, not the wiring): the FIELD_OWNERS table really dispatches `progress` to records.put,
// so ① is about a real dispatch and not about a test-only path.
{
  ok(FIELD_OWNERS.progress && FIELD_OWNERS.progress.face === 'vmu.records' && FIELD_OWNERS.progress.op === 'put',
    '⑤ the field `progress` is declared to dispatch vmu.records.put (so ① is a real path)', FIELD_OWNERS.progress)
}

console.log('')
console.log('=== VMU RUN39 ATTRIBUTION: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.log('failed: ' + failures.join(' | ')); process.exitCode = 1 }
