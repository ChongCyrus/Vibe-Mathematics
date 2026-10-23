// PHASE 12 / B1 STEP 2 — the four GATES (`packs/v5r/verification-gates.js`), each asserted BOTH ways.
// Spec source: docs/acceptance/phase12-v5r-rules-conformance.md rows B1/B8/D13 +
// docs/acceptance/conformance/lane-verified-design.md §10. Every gate is asserted to (a) refuse the wrong caller
// by a NAMED code AND (b) admit the legal caller — a gate tested only one way is the vacuous kind.
// Run: node tests/vmu-verified-gates.test.mjs     Last line: === VMU VERIFIED GATES: N passed, M failed ===
import { readFileSync } from 'node:fs'
import { createRecords } from '../vibe-math-vmu/kernel/records.js'
import { composeCardBody, VERIFIED_TRACK } from '../vibe-math-vmu/packs/v5r/verified.js'
import {
  GATE_CODES, SINGLE_WRITER, SUBJECT_FORMS, PROOF_STATE_COMPLETE, classifySubject,
  p1Intent, debateSubjectGate, singleWriter, fidelityAsked, gateCatalog,
} from '../vibe-math-vmu/packs/v5r/verification-gates.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
function eq(actual, expected, label) {
  if (actual === expected) { passed += 1 } else { failed += 1; console.log('FAIL ' + label + ' (got ' + JSON.stringify(actual) + ' want ' + JSON.stringify(expected) + ')') }
}
function refused(r, code, label, includes = '') {
  if (!r || r.allowed !== false || r.code !== code) { failed += 1; console.log('FAIL ' + label + ' (allowed=' + (r && r.allowed) + ' code=' + (r && r.code) + ' want ' + code + ')'); return r }
  if (includes && !(String(r.message) + ' ' + String(r.hint)).includes(includes)) { failed += 1; console.log('FAIL ' + label + ' (message/hint lacks ' + JSON.stringify(includes) + ': ' + r.message + ' || ' + r.hint + ')'); return r }
  passed += 1
  return r
}
function permitted(r, label) {
  if (r && r.allowed === true && r.ok === true) { passed += 1; return r }
  failed += 1; console.log('FAIL ' + label + ' (refused: ' + (r && r.code) + ' ' + (r && r.message) + ')')
  return r
}

const TRACKS = ['propositions', 'verified']
const KINDS = ['proposition', 'verified']
function mkRecords(extra = {}) {
  let t = 1000
  const settings = Object.assign({ 'vmu.records.tracks': TRACKS, 'vmu.records.allowedKinds': KINDS, 'vmu.records.requireSettledRecords': false }, extra)
  return createRecords({ clock: () => t, settings })
}
function cardRow(records, { p = 0.5, title = '命题-平方和' } = {}) {
  const rec = records.put({ track: 'propositions', kind: 'proposition', title, body: composeCardBody({ statement: '对任意 n，1+3+…+(2n-1)=n²', value: '简化围棋和式', motive: '为后续命题铺路', p }) })
  return records.get({ id: rec.id })
}

// ── ⓪ declarations ───────────────────────────────────────────────────────────────────────────────────────
{
  eq(Object.keys(GATE_CODES).length, 5, 'exactly five gate codes are declared (B6 added SUBJECT_UNPROVEN: "declared finished" is not "proved")')
  const codes = Object.values(GATE_CODES)
  ok(codes.length > 0 && codes.every((c) => c.startsWith('VMU_PACK_V5R_')), 'every gate code wears the pack prefix (' + codes.join(', ') + ')')
  ok(new Set(codes).size === 5, 'the five codes are distinct')
  ok(Object.isFrozen(GATE_CODES) && Object.isFrozen(SUBJECT_FORMS), 'the surface is frozen (no runtime mutation of the vocabulary)')
  eq(SUBJECT_FORMS.join(','), 'card,file,statement', 'the three legal subject forms are the ones the rule names')
  eq(SINGLE_WRITER, 'promoteVerified', 'the single writer is named by contract, not by convention')
  eq(PROOF_STATE_COMPLETE, 'complete', 'the "proof is finished" state is a named constant, not a magic string buried in a branch')
  const cat = gateCatalog()
  // ★ GUARD (RULE E, shape A): assert the catalogue is NON-EMPTY in its own right, so no later
  // `.every`/`.map` over it can pass on an empty list (`[].every(fn) === true` is a vacuous green).
  ok(Array.isArray(cat) && cat.length > 0, 'the catalogue is non-empty (guard: a loop over it can never be vacuous)', cat.length)
  eq(cat.length, 4, 'the catalog lists four GATES (a gate may publish more than one code)')
  // a gate row publishes `code` and may publish `codes` (plural) — every published code must be a declared one,
  // and every declared code must be published by some gate (neither direction can go vacuous).
  const published = new Set()
  ok(cat.length > 0, 'the gate catalogue is non-empty (RULE E)', cat.length)
  for (const g of cat) for (const c of (Array.isArray(g.codes) ? g.codes : [g.code])) published.add(c)
  ok(cat.every((g) => g.code && published.has(g.code)), 'every catalog row names a declared code')
  ok(codes.every((c) => published.has(c)), 'every declared code is published by a gate row (no orphan vocabulary)', [...published].join(','))
  ok(cat.length === 4 && cat.every((g) => g.id && g.rule && g.appliesTo), 'each catalog row carries its rule text and what it applies to (non-empty by the four-gate count above)')
}

// ── ① p1Intent：「只有辩论才能把布尔概率改成 1」────────────────────────────────────────────────────────────
{
  const records = mkRecords()
  const row = cardRow(records, { p: 0.3 })

  permitted(p1Intent({ tool: 'vibe_v5_record_proposition', args: { p: 0.3 }, card: row }), 'p=0.3 is none of this gate\'s business')
  eq(p1Intent({ tool: 't', args: { p: 0.3 }, card: row }).applicable, false, 'and it says so (applicable:false) instead of a silent "allowed"')
  permitted(p1Intent({ tool: 't', args: { p: 0 } }), 'p=0 is also outside this gate (0 is a conclusion, not a promotion)')
  eq(p1Intent({ tool: 't', args: {} }).applicable, false, 'a write with no probability at all is not judged')

  const noEv = refused(p1Intent({ tool: 'vibe_v5_record_proposition', args: { p: 1 }, card: row }), GATE_CODES.P1_NEEDS_DEBATE,
    'p=1 with NO conclusion source is refused by name', 'card=' + row.id)
  ok(String(noEv.hint).includes('debate-unanimous') && String(noEv.hint).includes('lean-conformance'),
    'the refusal hint names ALL legal evidence forms (a refusal must tell the caller how to become legal)')
  eq(noEv.keys.length, 0, 'the gate reports no keys of its own (attribution belongs to the wiring layer)')

  permitted(p1Intent({ tool: 't', args: { p: 1 }, card: row, evidence: { debate: { mode: 'unanimous', value: 1, subject: row.id, ballotId: 'b-1' } } }),
    'p=1 admitted when a debate was UNANIMOUS at 1 for this very card')
  eq(p1Intent({ tool: 't', args: { p: 1 }, card: row, evidence: { debate: { mode: 'unanimous', value: 1, subject: row.id } } }).evidenceForm, 'debate-unanimous',
    'and the receipt says WHICH form admitted it')

  refused(p1Intent({ tool: 't', args: { p: 1 }, card: row, evidence: { debate: { mode: 'split', value: 1, subject: row.id } } }), GATE_CODES.P1_NEEDS_DEBATE,
    'a split vote that happens to contain 1 is NOT "unanimous" — refused', '全体一致')
  refused(p1Intent({ tool: 't', args: { p: 1 }, card: row, evidence: { debate: { mode: 'unanimous', value: 1, subject: 'r-someone-else' } } }), GATE_CODES.P1_NEEDS_DEBATE,
    'a unanimous vote about ANOTHER card cannot promote this one')

  permitted(p1Intent({ tool: 't', args: { p: 1 }, card: row, evidence: { lean: { jobId: 'j-1', passed: true, subject: row.id, conformance: { decision: 'conform', by: 'm-1' } } } }),
    'p=1 admitted via the lean-conformance path (Lean passed AND the conformance question answered)')
  eq(p1Intent({ tool: 't', args: { p: 1 }, card: row, evidence: { lean: { jobId: 'j-1', passed: true, subject: row.id, conformance: { decision: 'conform' } } } }).evidenceForm,
    'lean-conformance', 'and the receipt names that form too')
  refused(p1Intent({ tool: 't', args: { p: 1 }, card: row, evidence: { lean: { jobId: 'j-1', passed: true, subject: row.id } } }), GATE_CODES.P1_NEEDS_DEBATE,
    '★ Lean passing ALONE is not enough — the conformance verdict is the missing half', '符合性')

  permitted(p1Intent({ tool: 't', args: { p: 1 }, card: row, evidence: { verified: { cardId: row.id, conclusion: true } } }),
    'p=1 admitted when a verified row already points at this card (the conclusion exists)')
  refused(p1Intent({ tool: 't', args: { p: 1 }, card: row, evidence: { verified: { cardId: 'r-other', conclusion: true } } }), GATE_CODES.P1_NEEDS_DEBATE,
    'a verified row for a different card is not evidence')
  refused(p1Intent({ tool: 't', args: { p: 1 }, card: row, evidence: { verified: { cardId: row.id, conclusion: false } } }), GATE_CODES.P1_NEEDS_DEBATE,
    'a verified row whose CONCLUSION is false (p=0) cannot be used to set p=1', 'conclusion')

  eq(p1Intent({ tool: 't', args: { value: '1' }, card: row, evidence: { verified: { cardId: row.id, conclusion: true } } }).p, 1,
    'a string "1" from a tool argument is read as p=1 (the face passes strings)')

  const truncated = mkRecords({ 'vmu.records.bodyCapBytes': 40 })
  const big = truncated.put({ track: 'propositions', kind: 'proposition', title: '长卡', body: composeCardBody({ statement: '长'.repeat(200), value: 'v', motive: 'm', p: 1 }) })
  const half = truncated.get({ id: big.id })
  ok(half.bodyTruncated === true, 'the records read really truncated this card (precondition)')
  const truncRefusal = refused(p1Intent({ tool: 't', args: { p: 1 }, card: half, evidence: { verified: { cardId: half.id, conclusion: true } } }), 'VMU_INVALID_ARGUMENT',
    '★ a TRUNCATED card read is refused by name FIRST — even when an evidence object is supplied', '截断')
  eq(truncRefusal.truncated, true, 'and the refusal marks the truncation so the caller cannot mistake it for "no proof"')
}

// ── ② classifySubject：三种形态必须先分对，否则闸会拒掉合法用法 ─────────────────────────────────────────────
{
  eq(classifySubject('r-abc123').form, 'card', 'an r- id classifies as a card subject')
  eq(classifySubject('  r-abc123  ').form, 'card', 'surrounding whitespace does not change the form')
  eq(classifySubject('Members/pi/Propos/p-1.md').form, 'file', 'a path classifies as a file reference')
  eq(classifySubject('Formal/pi/Thm.lean').form, 'file', 'a .lean reference classifies as a file reference')
  eq(classifySubject('对任意 n 成立').form, 'statement', 'a one-line proposition classifies as a statement')
  eq(classifySubject('').form, null, 'an empty subject has NO form (the tool\'s own required-field gate owns that)')
  eq(classifySubject(null).form, null, 'null subject has no form either')
}

// ── ③ debateSubjectGate：「含正式证明且写完才能用于辩论」 ─────────────────────────────────────────────────
{
  const debate = { type: 'debate', id: 'mt-1' }
  permitted(debateSubjectGate({ meeting: { type: 'ordinary' }, subject: 'r-abc' }), 'a non-debate meeting is outside this gate')
  eq(debateSubjectGate({ meeting: { type: 'academic' }, subject: 'r-abc' }).applicable, false, 'and it reports applicable:false')
  permitted(debateSubjectGate({ meeting: debate, subject: '' }), 'an empty subject is left to the tool\'s required-field gate (named, not duplicated)')

  const cardEvidence = { card: { id: 'r-abc', p: 0.6, proofRef: 'Members/pi/Propos/r-abc.md', proofState: 'complete' } }
  // ★ B6 / R18: a DECLARATION is not a PROOF. The card claims `proofState=complete`, but no machine evidence
  // (a passing Lean job, or a verified conclusion row) backs it ⇒ refused by NAME with its own code, and the
  // refusal must tell the two legal ways to become legitimate. This assertion replaces the old one that let a
  // self-declaration through — the old green was the defect.
  const declaredOnly = debateSubjectGate({ meeting: debate, subject: 'r-abc', evidence: cardEvidence })
  refused(declaredOnly, GATE_CODES.DEBATE_SUBJECT_UNPROVEN, '★ 声明不是证明：proofState=complete 但没有机器证据 ⇒ 具名拒', '两条合法路径')
  eq(declaredOnly.declared, true, 'the refusal carries the fact that a declaration WAS present')
  eq(declaredOnly.declaredState, 'complete', 'and which declared state it saw (so the reader can act)')
  permitted(debateSubjectGate({
    meeting: debate, subject: 'r-abc',
    evidence: { card: { id: 'r-abc', p: 0.6, proofRef: 'Members/pi/Propos/r-abc.md', proofState: 'complete' }, lean: { jobId: 'j-0', passed: true } },
  }), 'a declaration BACKED by machine evidence may enter the debate (evidence outranks self-report)')

  const halfBaked = { card: { id: 'r-abc', p: 0.6, proofRef: 'Members/pi/Propos/r-abc.md', proofState: 'attempt' } }
  refused(debateSubjectGate({ meeting: debate, subject: 'r-abc', evidence: halfBaked }), GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
    '★ a half-finished proof (proofState=attempt) is NOT a debate subject — the rule says 写完 rather than 半成品', '三种合法形态')
  const noRef = { card: { id: 'r-abc', p: 0.6 } }
  refused(debateSubjectGate({ meeting: debate, subject: 'r-abc', evidence: noRef }), GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
    'a card with no proof reference at all is refused by name', 'proofRef=空')
  permitted(debateSubjectGate({ meeting: debate, subject: 'r-abc', evidence: { card: { id: 'r-abc' }, verified: { cardId: 'r-abc', conclusion: true } } }),
    'a verified conclusion row on that card satisfies the proof requirement')
  eq(debateSubjectGate({ meeting: debate, subject: 'r-abc', evidence: { card: { id: 'r-abc' }, lean: { jobId: 'j-1', passed: true } } }).proofVia, 'lean-passed',
    'a PASSING Lean job satisfies it too (and the receipt says so)')
  refused(debateSubjectGate({ meeting: debate, subject: 'r-abc' }), GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
    'no card evidence at all is refused (never guessed as "no proof")', 'records.get')
  refused(debateSubjectGate({ meeting: debate, subject: 'r-abc', evidence: { card: { id: 'r-abc', bodyTruncated: true } } }), 'VMU_INVALID_ARGUMENT',
    'a truncated card read is refused by truncation, not judged', '截断')

  permitted(debateSubjectGate({ meeting: debate, subject: 'Members/pi/Propos/p-1.md', evidence: { file: { name: 'p-1.md', readable: true, bytes: 1200 } } }),
    'a readable non-empty file reference is admitted')
  const fileOk = debateSubjectGate({ meeting: debate, subject: 'Members/pi/Propos/p-1.md', evidence: { file: { readable: true, bytes: 1200 } } })
  eq(fileOk.proofContentChecked, false, '★ but the receipt HONESTLY says the file CONTENT was not checked (the gate can only prove existence)')
  ok(String(fileOk.note).includes('由辩论中的人核'), 'and it names who has to check the content instead')
  refused(debateSubjectGate({ meeting: debate, subject: 'Members/pi/Propos/p-1.md', evidence: { file: { readable: false, bytes: 0 } } }),
    GATE_CODES.DEBATE_SUBJECT_NO_PROOF, 'an unreadable/empty file reference is refused', 'bytes=0')
  refused(debateSubjectGate({ meeting: debate, subject: 'Members/pi/Propos/p-1.md' }), GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
    'a file reference with NO evidence is refused (not assumed readable)', 'file:')

  const stmt = permitted(debateSubjectGate({ meeting: debate, subject: '对任意 n，1+3+…+(2n-1)=n²' }),
    '★ a one-line proposition is LEGAL per the rule and must NOT be refused')
  eq(stmt.provenance, 'none', 'but its provenance is recorded as none (no addressable carrier)')
  eq(stmt.proofChecked, false, 'and the receipt says the proof was not checked')
  ok(String(stmt.note).includes('命题卡 id'), 'the note tells the caller how to become checkable (pass a card id or file ref)')
}

// ── ④ singleWriter：定论只有一个写入器 ────────────────────────────────────────────────────────────────────
{
  permitted(singleWriter({ track: 'propositions', kind: 'proposition', writer: 'records.put' }), 'a write to the CARD track is none of this gate\'s business')
  eq(singleWriter({ track: 'propositions', writer: 'anything' }).applicable, false, 'and it reports applicable:false')
  refused(singleWriter({}), GATE_CODES.VERIFIED_SINGLE_WRITER, 'writing the verified track without naming a writer is refused', SINGLE_WRITER)
  refused(singleWriter({ writer: 'records.put', cardId: 'r-1' }), GATE_CODES.VERIFIED_SINGLE_WRITER,
    '★ any other entry point is refused BY NAME and the message names the offender', 'records.put')
  permitted(singleWriter({ writer: SINGLE_WRITER, cardId: 'r-1', by: 'chair', at: 2000 }), 'the sanctioned writer is admitted')

  const records = mkRecords()
  const row = cardRow(records, { p: 1 })
  const ledger = [{ cardId: row.id, p: 1, warrant: { id: 'w-1', subject: row.id }, source: 'debate-unanimous', at: 2000, conclusion: true }]
  const allowedWithExisting = permitted(singleWriter({ records: records, writer: SINGLE_WRITER, cardId: 'nonexistent', by: 'chair' }),
    'the writer gate does not require the card to exist (that is promoteVerified\'s own precondition)')
  ok(allowedWithExisting.existing === undefined, 'and it reports no existing row for a random id')
  void ledger
  eq(singleWriter({ writer: SINGLE_WRITER, cardId: 'r-1', track: VERIFIED_TRACK }).track, VERIFIED_TRACK, 'an explicit verified-track write is reported back')
}

// ── ⑤ fidelityAsked：lean 通过但 p≠1 必须先核描述符合性（D13 的 pack 侧消费者）─────────────────────────
{
  eq(fidelityAsked({ cardId: 'r-1', leanPassed: false, p: 0.4 }).required, false, 'no passing Lean job ⇒ nothing to ask')
  eq(fidelityAsked({ cardId: 'r-1', leanPassed: true, p: 1 }).required, false, 'p=1 ⇒ the lean path already concluded; no question')
  const ask = fidelityAsked({ cardId: 'r-1', leanPassed: true, p: 0.62 })
  eq(ask.required, true, '★ Lean passed but p≠1 ⇒ the conformance question is REQUIRED')
  eq(ask.code, GATE_CODES.FIDELITY_ASK_REQUIRED, 'and it carries the named code (the caller must surface it, not drop it)')
  ok(String(ask.question).includes('定义') && String(ask.question).includes('符合'), 'the question is the rule\'s own question about propositions/definitions')
  eq(ask.options.join(','), 'conform,defect', 'with exactly the two legal answers')
  eq(ask.consumer, 'kernel/fidelity.js 的 passedWithdrawnFor（撤回标记）＋ 辩论裁决的 formal 字段',
    'and it names its consumers (red line ④: no mechanism without a consumer)')

  eq(fidelityAsked({ cardId: 'r-1', leanPassed: true, p: 0.62, answered: { decision: 'conform', by: 'm-1' } }).required, false,
    'a recorded conform verdict resolves the question')
  eq(fidelityAsked({ cardId: 'r-1', leanPassed: true, p: 0.62, answered: { decision: 'defect', by: 'm-1' } }).required, false,
    'a recorded defect verdict resolves it too (the proof gets withdrawn instead)')
  const withdrawn = fidelityAsked({ cardId: 'r-1', leanPassed: true, p: 0.62, withdrawnFor: () => ({ withdrawn: true, markerId: 'mk-1' }) })
  eq(withdrawn.required, false, '★ a WITHDRAWN proof is no longer a debate basis ⇒ no question (the fidelity consumer earns its keep)')
  eq(withdrawn.resolved, true, 'and the receipt says it was resolved by withdrawal')
  ok(String(withdrawn.reason).includes('撤回'), 'the reason names the withdrawal')
  eq(fidelityAsked({ cardId: 'r-1', leanPassed: true, p: 0.62, withdrawnFor: () => null }).required, true,
    'a non-withdrawn proof keeps the question open')
  eq(fidelityAsked({ cardId: 'r-1', leanPassed: true, p: 0.62, withdrawnFor: () => { throw new Error('seam exploded') } }).required, true,
    'a throwing withdrawal seam is treated as "not withdrawn" (the question stays open — never silently resolved)')
  eq(fidelityAsked({ cardId: 'r-1', leanPassed: true, p: 0.62, withdrawnFor: { cardId: 'r-1', withdrawn: true } }).required, false,
    'the object form of the marker is accepted too')
  eq(fidelityAsked({ cardId: 'r-1', leanPassed: true, p: 0.62, withdrawnFor: { cardId: 'r-OTHER', withdrawn: true } }).required, true,
    'a marker for ANOTHER card does not resolve this one')
}

// ── ⑥ 纪律：谓词不虚报强制执行（`enforced` 归接线层），且四条闸都没有生产调用方 ────────────────────────────
{
  const src = readFileSync(new URL('../vibe-math-vmu/packs/v5r/verification-gates.js', import.meta.url), 'utf8')
  ok(!/enforced/.test(src), 'the gate module never claims `enforced` — a pure predicate cannot attribute enforcement; it returns `keys` and the wiring layer fills enforced[]')
  ok(/export function p1Intent/.test(src) && /export function debateSubjectGate/.test(src) && /export function singleWriter/.test(src) && /export function fidelityAsked/.test(src),
    'the four gates are exported as named functions (no default export, no class)')
  // The loop runs over a LITERAL four names (never over the derived catalog), so it cannot be vacuously empty;
  // the catalog is then asserted to publish exactly those names — a fifth gate or a renamed one fails the eq.
  const IDS = ['p1Intent', 'debateSubjectGate', 'singleWriter', 'fidelityAsked']
  const callers = gateCatalog().map((g) => g.id)
  // ★ GUARD (RULE E, shape A): the derived caller list must be non-empty BEFORE it is compared, so
  // "the catalogue published nothing" can never satisfy the equality below by accident.
  ok(Array.isArray(callers) && callers.length > 0, 'the derived caller list is non-empty (guard before the equality)', callers.length)
  eq(callers.slice().sort().join(','), IDS.slice().sort().join(','), 'the catalog publishes exactly the four gates the wiring layer calls')
  for (let i = 0; i < IDS.length; i += 1) {
    const id = IDS[i]
    const out = { p1Intent: () => p1Intent({ args: {} }), debateSubjectGate: () => debateSubjectGate({}), singleWriter: () => singleWriter({ track: 'propositions' }), fidelityAsked: () => fidelityAsked({}) }[id]()
    ok(Array.isArray(out.keys), id + ' returns a `keys` array (attribution slot for the caller)')
    ok(typeof out.allowed === 'boolean', id + ' returns a boolean `allowed` (the only thing a caller needs to branch on)')
  }
}

console.log('=== VMU VERIFIED GATES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
