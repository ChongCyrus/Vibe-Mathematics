// tests/vmu-run236-c6-proof-gate.test.mjs — C6 pinned on a REAL assembly (task-25 / RUN 236).
//
// THE RULE (宏观 v5r 规则 L14): 命题库平时只记证明/证伪尝试；真正会证时，才写【正式证明字段】，而且只有含
// 写完的正式证明/证伪内容的卡才能进辩论。So a card may DECLARE `proof_state:"complete"` only alongside
// EVIDENCE — a `proof_ref` to a written proof or a settled PASSED `lean_job` — and the paper's delivery gate
// separately demands that every part file at least one evidence entry.
//
// THE AUDIT'S COMPLAINT (docs/acceptance/sim-audit-rules.md, C6 = PROSE-ONLY): the earlier probe watched
// `record_proposition {proof_state:"complete", proof_ref}` answer `ok:true` and concluded "there is no gate
// deciding when a declaration becomes a formal-proof field". The gate exists; what was missing was an
// observation that the DECLARATION is recorded but its LOCK is deferred until the pointer resolves.
//
// WHAT IS PINNED HERE (real kernel + real tool registry; every assertion guards non-emptiness first):
//   ① a `complete` declaration with NO evidence is REFUSED by name, and the sentence names `proof_ref` and
//      `lean_job` (the two admissible evidences) — never a bare "invalid";
//   ② `lean_conformance` ALONE is refused as "a claim, not evidence" (a word cannot replace the registration);
//   ③ a `complete` declaration WITH a `proof_ref` that does not resolve is ACCEPTED AS WRITTEN but NOT LOCKED:
//      `proofGate.locked:false`, `proofLockDeferred:true`, `proofLockDeferredReason:"missing"`, and the receipt
//      carries the measured pointer check (`proofStateEvidence.pointerCheck.resolved:false`);
//   ④ the paper face REQUIRES nothing at part time but NAMES the later gate (`evidenceGate.gate:"evidence"`,
//      `requiredAt:"render/final"`, `satisfiedNow:false`) — two faces, two questions;
//   ⑤ the pure delivery gate `checkQuality` (the one the render/final path calls) answers a paper whose parts
//      filed no evidence with `gate:"evidence"`, `nextGate:"required-line"`, `emptyParts:["r-1"]`, an EMPTY
//      `missing` list and the sentence explaining that empty is on purpose.
//
// Run: node tests/vmu-run236-c6-proof-gate.test.mjs

import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const TMP = __tmpRoot() + '/vmu-run236'

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 700)))
  }
}

const HARNESS = await import(pathToFileURL(join(REPO, 'scripts/sim/harness.mjs')).href)
const PQ = await import(pathToFileURL(join(REPO, 'vibe-math-vmu/packs/v5r/paper-quality.js')).href)
mkdirSync(TMP, { recursive: true })
const root = mkdtempSync(join(TMP, 'c6-'))
const h = await HARNESS.boot({ root })
const as = (id) => ({ as: { agent: { id } } })

const start = await h.call('vibe_v5_start', { problem: 'C6 真装配：正式证明字段的证据门', researcherCount: 2 })
ok(start && start.ok === true, 'premise: the institute is founded on a real kernel', start && { ok: start.ok, hired: start.hired })

const base = { member: 'r-1', statement: 'C6 待验命题', value: '待验命题的陈述', motive: '测试正式证明字段的证据门', p: 0.5 }

// ── ① complete with no evidence is refused by name ───────────────────────────────────
const bare = await h.call('vibe_v5_record_proposition', Object.assign({}, base, { proof_state: 'complete' }), as('r-1'))
ok(bare && bare.ok === false, 'a `complete` declaration with NO evidence is REFUSED', bare && { ok: bare.ok, code: bare.code })
ok(bare && bare.code === 'VMU_INVALID_ARGUMENT', 'the refusal is the named code VMU_INVALID_ARGUMENT', bare && bare.code)
ok(bare && typeof bare.message === 'string' && bare.message.includes('proof_state') && bare.message.includes('proof_ref') && bare.message.includes('lean_job'),
  'the sentence names the declared field AND both admissible evidences (proof_ref / lean_job)', bare && bare.message)
ok(bare && typeof bare.hint === 'string' && bare.hint.includes('proof_ref') && bare.hint.includes('vibe_v5_lean_run'),
  'the hint names the two routes that satisfy the gate (write the proof, or register a Lean run)', bare && bare.hint)

// ── ② lean_conformance alone is a claim, not evidence ────────────────────────────────
const wordOnly = await h.call('vibe_v5_record_proposition', Object.assign({}, base, { proof_state: 'complete', lean_conformance: 'conform' }), as('r-1'))
ok(wordOnly && wordOnly.ok === false, '`lean_conformance` ALONE is refused', wordOnly && { ok: wordOnly.ok, code: wordOnly.code })
ok(wordOnly && typeof wordOnly.message === 'string' && wordOnly.message.includes('claim') && wordOnly.message.includes('not evidence'),
  'the sentence says it is a claim, not evidence', wordOnly && wordOnly.message)
ok(wordOnly && typeof wordOnly.hint === 'string' && wordOnly.hint.includes('lean_job'),
  'the hint names the field that would make it evidence (lean_job)', wordOnly && wordOnly.hint)

// ── ③ complete + an UNRESOLVED proof_ref: recorded as written, lock deferred ─────────
const deferred = await h.call('vibe_v5_record_proposition', Object.assign({}, base, {
  statement: 'C6 有指针但文件不存在的命题', proof_state: 'complete', proof_ref: 'Members/r-1/Propos/does-not-exist.md',
}), as('r-1'))
ok(deferred && deferred.ok === true, 'the card IS filed when the pointer is well formed (a declaration is recorded as written)',
  deferred && { ok: deferred.ok, code: deferred.code, message: deferred.message })
ok(deferred && deferred.proofState === 'complete', 'the receipt echoes the declaration (proofState:"complete")', deferred && deferred.proofState)
ok(deferred && deferred.proofGate && deferred.proofGate.locked === false, 'the card is NOT locked (proofGate.locked:false)',
  deferred && deferred.proofGate)
ok(deferred && deferred.proofLockDeferred === true && deferred.proofLockDeferredReason === 'missing',
  'the deferred lock is FLAGGED and its reason is NAMED (proofLockDeferred:true, reason:"missing")',
  deferred && { deferred: deferred.proofLockDeferred, reason: deferred.proofLockDeferredReason })
const check = deferred && deferred.proofStateEvidence && deferred.proofStateEvidence.pointerCheck
ok(Boolean(check), 'the receipt carries the MEASURED pointer check (proofStateEvidence.pointerCheck)', deferred && deferred.proofStateEvidence)
ok(check && check.resolved === false && check.exists === false, 'the pointer check measured that the proof file does not exist (resolved:false/exists:false)',
  check && { resolved: check.resolved, exists: check.exists, reason: check.reason })
ok(check && check.reason === 'missing', 'the measured reason is `missing`, not a silent false', check && check.reason)
ok(Boolean(deferred && deferred.proofLockDeferredMeans) && typeof deferred.proofLockDeferredMeans === 'string' && deferred.proofLockDeferredMeans.length > 0,
  'the receipt explains WHY an unresolved pointer is not locked (a lock would make it uncorrectable)', deferred && deferred.proofLockDeferredMeans)

// ── ④ the paper face requires nothing at part time but NAMES the later gate ──────────
const paperStart = await h.call('vibe_v5_paper', { action: 'start', target: 'c6-paper', participants: ['r-1', 'r-2'] })
ok(paperStart && paperStart.ok === true, 'premise: a paper exists', paperStart && { ok: paperStart.ok, code: paperStart.code })
const part = await h.call('vibe_v5_paper', { action: 'part', target: 'c6-paper', member: 'r-1', part: '§1 引言', body: '这一段没有 evidence 条目。' }, as('r-1'))
ok(part && part.ok === true, 'a part WITHOUT evidence is accepted at part time (this face requires nothing)',
  part && { ok: part.ok, code: part.code, message: part.message })
const partRecord = part && part.part
ok(partRecord && typeof partRecord.recordId === 'string' && partRecord.recordId !== '', 'the part row has an id (usable as the gate input)', partRecord && partRecord.recordId)
const gate = part && part.evidenceGate
ok(Boolean(gate), 'the part receipt NAMES the later gate (evidenceGate)', part && part.evidenceGate)
ok(gate && gate.gate === 'evidence', 'evidenceGate.gate === "evidence"', gate)
ok(gate && gate.requiredAt === 'render/final', 'evidenceGate.requiredAt names where it will refuse (render/final)', gate && gate.requiredAt)
ok(gate && gate.satisfiedNow === false, 'evidenceGate.satisfiedNow === false (the part filed nothing)', gate && gate.satisfiedNow)
ok(part && part.evidence && part.evidence.provided === 0, 'the receipt counts the evidence it got (provided:0)', part && part.evidence)

// ── ⑤ the pure delivery gate answers the SAME verdict with named fields ──────────────
const view = PQ.createRecordsView({ kernel: h.kernel })
const verdict = PQ.checkQuality({
  md: '这一段没有 evidence 条目。',
  state: { status: 'awaiting-editor', parts: { 'r-1': { recordId: partRecord.recordId, round: 1 } } },
  view,
})
ok(verdict && verdict.ok === false, 'the delivery gate REFUSES a paper whose only part filed no evidence', verdict && { ok: verdict.ok, code: verdict.code })
ok(verdict && verdict.code === 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING', 'the refusal carries the named code', verdict && verdict.code)
ok(verdict && verdict.gate === 'evidence' && verdict.nextGate === 'required-line',
  'the refusal NAMES its gate and the gate after it (gate:"evidence", nextGate:"required-line")', verdict && { gate: verdict.gate, nextGate: verdict.nextGate })
ok(verdict && Array.isArray(verdict.emptyParts) && verdict.emptyParts.length > 0 && verdict.emptyParts.includes('r-1'),
  'the refusal names the EMPTY part(s) instead of a vague "missing evidence"', verdict && verdict.emptyParts)
ok(verdict && Array.isArray(verdict.missing) && verdict.missing.length === 0,
  '`missing` is EMPTY on purpose (no record id failed to resolve) — the two lists answer different questions', verdict && verdict.missing)
ok(verdict && typeof verdict.missingMeans === 'string' && verdict.missingMeans.includes('empty ON PURPOSE'),
  'the receipt says WHY `missing` is empty instead of leaving the reader to guess', verdict && verdict.missingMeans)
ok(verdict && typeof verdict.message === 'string' && verdict.message.includes('r-1') && verdict.message.includes('证据'),
  'the message names the part and the evidence rule in prose', verdict && verdict.message)

console.log('\n=== vmu-run236 C6 proof gate: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures: ' + JSON.stringify(failures))
  process.exitCode = 1
}
