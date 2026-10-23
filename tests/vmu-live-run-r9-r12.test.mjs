// tests/vmu-live-run-r9-r12.test.mjs — the readings the phase-12 live run (full-1024-021750.jsonl) called misleading.
//
// THREE SEPARATE DEFECTS, ONE SUITE, because they share a single cause: A RECEIPT THAT CAN BE READ TWO WAYS. Each block
// pins the reading that was ambiguous and the field that now disambiguates it — and each one asserts the NEGATIVE too
// (the old reading must not have silently changed meaning for consumers).
//
//  R9   `speak` returned `ms:0, turns:1, tokens:0, budget:null`. With `vmu.meetings.speechDefaultMs=0` and
//       `speechMaxMs=0`, ms:0 means UNBOUNDED, not "no time"; budget:null means "no verdict was crossed", not "plenty
//       left". Both readings are now stated on the receipt (`speechBound`, `budgetDeclared`/`budgetWhy`).
//  R11  a turn whose only effect was the closure vote came back `executed:0` beside `closureVote.cast:true`, which reads
//       as "nothing happened". `effects` now lists the mechanism-level consequence; `executed` keeps its old meaning.
//  R12  `vibe_vmu_status({detail:'quorum'})` answered with the COMPLETE view (measured 154,534 bytes, byte-identical to
//       `full`) and no error, so one question cost the live run `originalBytes:223591`. The face now refuses a detail it
//       does not implement, by name, with the legal list — a slice that does not exist is an error, not a 154 KB answer.
//
// Run: node tests/vmu-live-run-r9-r12.test.mjs   (last line: === VMU LIVE RUN R9-R12: N passed, M failed ===)
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { deliverByReturning } from '../vibe-math-vmu/kernel/turn/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const makeKernel = (settings = {}) => createKernel({
  clock: () => 1000,
  settings,
  deliverTurn: deliverByReturning(),
  slots: [{ id: 'member', capacity: 0, permissions: ['speak', 'vote'] }, { id: 'chair', capacity: 1, permissions: ['convene'] }],
})

// ── R9: the speech reading ────────────────────────────────────────────────────────────────────────────────────────
console.log('=== R9. a speech receipt says whether ms:0 means "unbounded" or "no time" ===')
{
  const kernel = makeKernel({ 'vmu.meetings.allowLight': true })
  const specs = toolSpecs({ kernel, settings: {}, meetingTool: false, controlTool: true })
  const spec = (n) => specs.find((s) => s.name === n)
  await spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm1', slot: 'member', institution: 'I' })
  await spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm2', slot: 'member', institution: 'I' })
  // ★ The SERVICE meeting face is the one the live run used (the pack opens  meetings, and R9's receipt
  //  is that face's shape). Addressing it directly keeps this suite about the READING.
  const opened = kernel.meetings.open({ type: 'ordinary', chair: 'm1', roster: ['m1', 'm2'], materials: 'R9' })
  ok(opened.ok === true && typeof opened.meeting === 'string', 'a service meeting opens so a speech can be recorded', { opened })
  const attended = kernel.meetings.attend({ meeting: opened.meeting, member: 'm1' })
  ok(attended.ok === true, 'the speaker is present (attend() is the precondition of speak())', { attended: { ok: attended.ok, code: attended.code } })
  const spoke = kernel.meetings.speak({ meeting: opened.meeting, member: 'm1', text: 'R9 发言' })
  ok(spoke.ok === true, 'the speech is accepted', { spoke: { ok: spoke.ok, code: spoke.code } })
  // with no speech-time key declared, 0 is the UNBOUNDED sentinel — that is the reading the live run could not make
  ok(spoke.speechBound && typeof spoke.speechBound === 'object',
    '★ the receipt carries speechBound, so ms has a stated meaning', { speechBound: spoke.speechBound })
  ok(spoke.speechBound && spoke.speechBound.declaredMs === 0 && spoke.speechBound.unlimited === true,
    '★ declaredMs=0 + unlimited:true — ms:0 is UNBOUNDED here, not "zero time"', { speechBound: spoke.speechBound })
  ok(typeof spoke.speechBound.why === 'string' && spoke.speechBound.why.includes('UNBOUNDED'),
    'the receipt SPELLS the reading out instead of leaving it to inference', { why: spoke.speechBound.why })
  ok(spoke.budget === null && spoke.budgetDeclared === false,
    '★ budget:null is accompanied by budgetDeclared:false (a null that names itself)', { budget: spoke.budget, budgetDeclared: spoke.budgetDeclared })
  ok(typeof spoke.budgetWhy === 'string' && spoke.budgetWhy.length > 40,
    'and budgetWhy explains that null means "no verdict", not "plenty left"', { budgetWhy: spoke.budgetWhy })
  ok(spoke.receipt && spoke.receipt.speechBound && spoke.receipt.budgetDeclared === false,
    'the RECEIPT (what a later reader replays) carries the same two readings, not just the live return', { receiptKeys: spoke.receipt && Object.keys(spoke.receipt).slice(0, 8) })
  // NEGATIVE: the old words keep their old meaning for consumers that only read them
  ok(spoke.ms === 0 && spoke.budget === null,
    'the old fields are UNCHANGED (additive fix — no consumer sees a different ms/budget)', { ms: spoke.ms, budget: spoke.budget })
}

// ── R11: the turn receipt's effects ──────────────────────────────────────────────────────────────────────────────
console.log('=== R11. a turn whose only effect is the closure vote says so ===')
{
  const kernel = makeKernel()
  const specs = toolSpecs({ kernel, settings: {}, turnTool: true, controlTool: true })
  const spec = (n) => specs.find((s) => s.name === n)
  await spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm1', slot: 'member', institution: 'I' })
  await spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm2', slot: 'member', institution: 'I' })
  const handed = await spec(TOOL_NAMES.turn).run({ op: 'step', phase: 'founding' })
  ok(handed.awaiting === true, 'the member turn is handed back to the caller (caller-played route)', { awaiting: handed.awaiting })
  const reply = JSON.stringify({ vote_solved: true })
  const stepped = await spec(TOOL_NAMES.turn).run({ op: 'step', phase: 'founding', reply })
  ok(stepped.ok === true, 'a reply carrying only vote_solved is accepted', { ok: stepped.ok, code: stepped.code, message: stepped.message })
  const rec = stepped.receipt || null
  ok(rec !== null, 'the round produced a receipt', { receipt: rec })
  const effects = (rec && rec.effects) || []
  ok(Array.isArray(effects) && effects.length === 1 && effects[0].kind === 'closure-vote',
    '★ effects names the mechanism-level consequence the closure vote had', { effects })
  ok(effects[0] && effects[0].member === 'm1' && effects[0].solved === true,
    'and the effect says WHO voted and WHAT they voted', { effect: effects[0] })
  ok(rec && rec.executed === 0,
    '★ executed still counts FIELD_OWNERS actions only (0 here) — the two statements no longer contradict, they answer two questions',
    { executed: rec && rec.executed })
  const st = kernel.status({ detail: 'summary' })
  const rec2 = st.closureVoteRecorded || (st.closureVote && st.closureVote.recorded) || {}
  ok(rec2.m1 === true,
    'the vote really landed (the receipt is not reporting an effect that did not happen)', { recorded: rec2 })
}

// ── R12: the status face's detail vocabulary ─────────────────────────────────────────────────────────────────────
console.log('=== R12. detail: a slice that does not exist is REFUSED, not answered with everything ===')
{
  const kernel = makeKernel()
  const specs = toolSpecs({ kernel, settings: {}, turnTool: false, meetingTool: false, controlTool: false, statusTool: true })
  const status = specs.find((s) => s.name === TOOL_NAMES.status)
  ok(status !== undefined && typeof status.run === 'function', 'the status face exists', { names: specs.map((s) => s.name).slice(0, 4) })
  for (const bogus of ['quorum', 'phase', 'formal', 'paper']) {
    // ★ A REFUSAL RECEIPT, not a thrown error (the face wrapper turns a throw into VMU_MIDDLEWARE_FAILED and drops the
    // code, measured), so the assertion reads the receipt the model would actually see.
    const out = await status.run({ detail: bogus })
    ok(out && out.ok === false && out.code === 'VMU_INVALID_ARGUMENT',
      '★ detail:"' + bogus + '" (never implemented) is refused by name instead of returning 154 KB of everything',
      { out: { ok: out && out.ok, code: out && out.code }, bytes: JSON.stringify(out).length })
    ok(out && JSON.stringify(out).length < 600,
      '★ and the refusal itself is small — one question must not cost a context window', { bytes: JSON.stringify(out).length })
    ok(out && typeof out.hint === 'string' && out.hint.includes('summary') && out.hint.includes('closure'),
      'and the refusal names the LEGAL values, so the caller can retry without guessing', { hint: out && String(out.hint).slice(0, 120) })
  }
  const closure = await status.run({ detail: 'closure' })
  ok(closure && closure.ok === true && closure.closureVote !== undefined,
    'detail:"closure" still answers the reading the live run actually wanted', { keys: closure && Object.keys(closure) })
  ok(JSON.stringify(closure).length < 4000,
    '★ and it is bounded (the live run paid 223,591 bytes for one question)', { bytes: JSON.stringify(closure).length })
  const summary = await status.run({ detail: 'summary' })
  ok(summary && summary.ok === true, 'detail:"summary" (the default) is untouched', { ok: summary && summary.ok })
}

// ── R8: the ruling's SENTENCE (the card holder reads the text, not the JSON) ─────────────────────────────────────
console.log('=== R8. a mean ruling must not read as an imperative decision ===')
{
  const MV = await import('../vibe-math-vmu/kernel/meetingverdict.js')
  const mean = MV.rulePropositionProbability({ verdicts: [{ member: 'm1', p: 0.8, reason: '甲' }, { member: 'm2', p: 0.4, reason: '乙' }], propositionId: 'p-1', owner: 'm1', from: 'acad' })
  ok(mean && mean.decided === false && mean.estimate === true,
    'the aggregation is honest in JSON: a mean is decided:false / estimate:true', { decided: mean.decided, estimate: mean.estimate })
  ok(typeof mean.notice.text === 'string' && mean.notice.text.includes('decided:false'),
    '★ and the NOTICE TEXT says the same thing — the sentence used to be a bare imperative',
    { text: mean.notice.text.slice(-90) })
  ok(mean.notice.text.includes('不是全体一致的裁定') && mean.notice.text.includes('没有任何成员主张这个数值'),
    'the caveat names WHY the number is not a decision, in words a card holder can act on', { text: mean.notice.text.slice(-90) })
  const unanimous = MV.rulePropositionProbability({ verdicts: [{ member: 'm1', p: 1, reason: '甲' }, { member: 'm2', p: 1, reason: '乙' }], propositionId: 'p-1', owner: 'm1', from: 'acad' })
  ok(unanimous.notice.text.includes('故请把相应命题卡的布尔概率改为') && !unanimous.notice.text.includes('decided:false'),
    '★ NEGATIVE: a UNANIMOUS ruling keeps its imperative and gains NO caveat (the caveat is not decoration)',
    { text: unanimous.notice.text })
  ok(unanimous.decided === true && unanimous.enforceable === true,
    'and a unanimous ruling stays enforceable', { decided: unanimous.decided })
  // a caller who supplies their own template may place {caveat}; unknown fields stay VISIBLE by contract
  const custom = MV.rulePropositionProbability({ verdicts: [{ member: 'm1', p: 0.2, reason: '甲' }, { member: 'm2', p: 0.6, reason: '乙' }], propositionId: 'p-1', owner: 'm1', from: 'acad', template: '裁定 {value}。{caveat}' })
  ok(custom.notice.text.startsWith('裁定 0.4') && custom.notice.text.includes('decided:false'),
    'a pack-supplied template can place {caveat} where it wants', { text: custom.notice.text.slice(0, 60) })
}

console.log('')
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error(' - ' + f) }
console.log('=== VMU LIVE RUN R9-R12: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
