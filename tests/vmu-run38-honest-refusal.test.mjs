// tests/vmu-run38-honest-refusal.test.mjs — LIVE RUN 38: "NOTHING TO APPLY" WAS A CLAIM THE KERNEL COULD NOT MAKE.
//
// WHAT THE RUN SAID (run 38, the institute's own feedback row r-9):
//   a member turn was refused with `VMU_TURN_NO_FENCE` whose message ended "…so there is nothing to apply". The office
//   read that sentence as a statement about SIDE EFFECTS ("the member did nothing") and reported it as a contradiction
//   with the record track, which it had already been able to read. The message was making a claim about a turn it had
//   only seen the TEXT of: when the member turn is played by an independent child session, any tool that child ran is
//   invisible from the parent kernel. A shape refusal must not pretend to be a side-effect verdict.
//
// WHAT IS ASSERTED HERE:
//   §1 the refusal still carries the SAME named code, and its message no longer asserts that nothing happened - it says
//      which claim it is making (the reply was not usable) and points at the check that settles the rest (record tracks);
//   §2 the refusal object itself carries `sideEffectsUnverified:true` + a sentence, so a programmatic reader is not
//      left to parse the prose; the hint still names BOTH ways to answer;
//   §3 `counts.replyParseFailedLast` (the readout `vibe_vmu_turn {op:"status"}` exposes) carries the same disclosure
//      next to the member's own words — the record is of an unparsed ANSWER, not of a silent member;
//   §4 the success path is untouched: a reply that DOES parse produces fields and no parse-failure record.
//
// Run: node tests/vmu-run38-honest-refusal.test.mjs     Last line: === VMU RUN38 HONEST REFUSAL: N passed, M failed ===

import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 400)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 400)))
  return false
}
const rejects = async (fn) => { try { await fn(); return { caught: false } } catch (e) { return { caught: true, code: e && e.code, message: String((e && e.message) || e), error: e } } }

const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })
const faces = { 'vmu.meetings': { speak: async () => ({ ok: true }) } }
const PROSE = '第一句：我打算先用望远镜求和。第二句：再用归纳法核对。第三句：最后做小 n 数值验证。'

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §1 THE REFUSAL'S MESSAGE NAMES THE CLAIM IT CAN MAKE.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('=== 1. THE REFUSAL NO LONGER CLAIMS "NOTHING HAPPENED" ===')
{
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), faces })
  const r = await rejects(() => t.parse(PROSE))
  ok(r.caught && r.code === 'VMU_TURN_NO_FENCE', '①-1 the NAMED code is unchanged (a consumer keying on it still works)', { code: r.code })
  const msg = String(r.message || '')
  ok(!/nothing to apply/i.test(msg),
    '★★★ ①-2 the sentence "so there is nothing to apply" is GONE - the kernel is not claiming anything about side effects', msg.slice(0, 300))
  ok(/no usable reply|没有可用的回执对象/i.test(msg),
    '★★★ ①-3 it says what it does know: this turn ended with no usable reply', msg.slice(0, 300))
  ok(/own session|自己会话/.test(msg) && /record tracks/i.test(msg),
    '★★ ①-4 and it names the part it cannot see (the child session) plus the check that settles it (the record tracks)', msg.slice(0, 400))
  ok(/tool report/i.test(msg) && /(fenced|json)/i.test(msg),
    '①-5 both channels are still named, as the reply-channel teaching requires', msg.slice(0, 300))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §2 THE FAILURE RECEIPT CARRIES THE DISCLOSURE, NOT ONLY THE PROSE.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('')
console.log('=== 2. THE FAILURE RECEIPT SAYS WHAT IT VERIFIED ===')
{
  const deliver = async () => ({ reply: '```json { not json at all ```', childId: 'child-bad-38', stopReason: 'completed', deliveryPath: 'activation' })
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver, faces })
  const r = await t.step({ members: ['r-3'], why: '要一个围栏 json 里的 say' })
  ok(r && r.ok === false && (r.code === 'VMU_TURN_NO_FENCE' || r.code === 'VMU_TURN_BAD_JSON'), '②-1 a bad envelope is still refused by name', r && r.code)
  ok(r && r.receipt === null, '②-2 the refusal still reports receipt:null (a refused round has no receipt)', r && r.receipt)
  ok(r && r.sideEffectsUnverified === true,
    '★★★ ②-3 `sideEffectsUnverified:true` reaches the FAILURE RECEIPT (a disclosure that stops one layer down is the run-23/run-29 family)', r && r.sideEffectsUnverified)
  ok(r && typeof r.sideEffectsMeans === 'string' && /REPLY SHAPE/i.test(r.sideEffectsMeans) && /child session/i.test(r.sideEffectsMeans) && /record track/i.test(r.sideEffectsMeans),
    '★★★ ②-4 the sentence says the claim is about the REPLY SHAPE, names the invisible child session, and points at the record tracks', r && r.sideEffectsMeans && r.sideEffectsMeans.slice(0, 200))
  ok(r && typeof r.hint === 'string' && /op:\s*"?reply"?/i.test(r.hint) && /fence/i.test(r.hint),
    '★ ②-5 the hint still gives BOTH ways to answer (tool report and fenced json), so the fix is executable', r && r.hint && r.hint.slice(0, 200))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §3 THE STATUS READOUT SEPARATES "UNPARSED" FROM "DID NOTHING".
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n=== 3. counts.replyParseFailedLast CARRIES THE SAME DISCLOSURE ===')
{
  const deliver = async () => ({ reply: PROSE, childId: 'child-prose-38', stopReason: 'completed', deliveryPath: 'activation' })
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver, faces })
  const s = await t.step({ members: ['r-1'], why: '要一个围栏 json 里的 say' })
  ok(s && s.ok === false && s.code === 'VMU_TURN_NO_FENCE', '③-1 the round is refused with the same named code', s && { ok: s.ok, code: s.code })
  const st = await t.status()
  const last = st && st.counts && st.counts.replyParseFailedLast
  ok(!!last && last.turn && last.member === 'r-1', '③-2 the record still names the turn and the member', last && { turn: last.turn, member: last.member })
  ok(last && last.replyExcerpt && last.replyExcerpt.includes('望远镜'),
    '★ ③-3 the member\'s own words are still there ("it answered in prose" stays readable)', last && last.replyExcerpt && last.replyExcerpt.slice(0, 80))
  ok(last && last.sideEffectsUnverified === true,
    '★★★ ③-4 the record carries `sideEffectsUnverified:true` - a reader cannot mistake it for a side-effect verdict', last && last.sideEffectsUnverified)
  ok(last && typeof last.means === 'string' && /not a claim that nothing happened/i.test(last.means) && /record tracks/i.test(last.means),
    '★★★ ③-5 its sentence says explicitly that it is NOT a claim that nothing happened, and where to settle it', last && last.means)
  ok(last && typeof last.means === 'string' && /ANSWERED/.test(last.means) && /not a delivery failure/i.test(last.means),
    '③-6 while still saying it was an ANSWER (not a silent member) and not a delivery failure', last && last.means)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §4 THE SUCCESS PATH IS UNTOUCHED.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n=== 4. A PARSABLE REPLY PRODUCES FIELDS AND NO PARSE-FAILURE RECORD ===')
{
  const deliver = async () => ({ reply: JSON.stringify({ say: '第 6 轮：交换图已通，下一步补自然性。' }), childId: 'child-ok-38', stopReason: 'completed', deliveryPath: 'activation' })
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver, faces })
  const s = await t.step({ members: ['r-2'], why: '要一个围栏 json 里的 say' })
  ok(s && s.ok === true, '④-1 the round completes', s && s.ok)
  ok(s && s.receipt && Array.isArray(s.receipt.fields) && s.receipt.fields.includes('say'),
    '④-2 the parsed field reaches the receipt, as before', s && s.receipt && s.receipt.fields)
  const st = await t.status()
  ok(st && st.counts && st.counts.replyParseFailed === 0 && !st.counts.replyParseFailedLast,
    '④-3 a clean round leaves the failure record empty (the disclosure only appears when a refusal happened)', st && st.counts && st.counts.replyParseFailed)
}

console.log('\n=== VMU RUN38 HONEST REFUSAL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('\nFAILURES:'); for (const f of failures) console.error('  - ' + f); process.exitCode = 1 }
