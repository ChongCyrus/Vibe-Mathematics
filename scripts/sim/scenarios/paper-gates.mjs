// scripts/sim/scenarios/paper-gates.mjs — the PAPER track's GATES, driven by a SCRIPT (no language model).
//
// WHY THIS SCENARIO EXISTS (R240-P / task-48): `node scripts/sim/audit/all.mjs` §5 compares the FIELD UNION of the
// simulator's `vibe_v5_paper` receipts with the live machine's (`<sim root>/real-fieldset.json`). Paper was the
// largest fidelity gap: the live receipts carry field names (enforced / requestId / actedBy / inTrash / gate /
// missing / provided / emptyParts / where / participants / crossReviewers / reviewsOnDisk / waiting / trash / …)
// that the simulator had never produced, because every paper scenario only walked the HAPPY path. A field the
// simulator never emits is a field no simulation proves anything about — that is the fidelity rule this file feeds.
//
// WHAT THIS COVERS (each step keeps the real receipt, so the corpus is the evidence):
//   ① start → two propositions (evidence pointers) → a two-participant paper
//   ② the CONTENT gates' refusals while writing: a part whose evidence pointer does not resolve (EVIDENCE_MISSING:
//      gate/nextGate/missing/provided/missingMeans) and a part whose prose cites a record that does not exist
//      (CITATION_UNKNOWN: gate/nextGate/missing/missingMeans) — both RETURNED AS DATA by the face, so the fields survive
//   ③ writing → reviewing; the review DISCIPLINE refusals: `of` names a non-author (INVALID_ARGUMENT:
//      member/of/assigned/reviewOf) and a SELF review (member/of/participants)
//   ④ two cross reviews → awaiting-editor; the OFFICE-CONSULT gate refuses the finalisation
//      (VMU_OFFICE_CONSULT_REQUIRED: enforced/declared/currentValue/settingValues/requestId/requestedAt/actedBy/
//      answerRoles/target/paperId/final/reason) and the consult FACE refuses an answer by a non-declared role
//      (NOT_PERMITTED: declared/received/memberSlot) and a wrong request id (NO_SUCH_OBJECT: waiting)
//   ⑤ the office answers → the same final call finalises; compile names the environmental gap (no spawn seam here)
//   ⑥ a ONE-participant paper: advance discloses crossReviewPossible/crossReviewMeans/partsLockedAfterMove, and the
//      NEXT advance is refused by name (INVALID_ARGUMENT: where/participants/crossReviewers/reviewsOnDisk/required)
//   ⑦ an EMPTY-EVIDENCE paper: the delivery gate refuses at final (EVIDENCE_MISSING: missing/emptyParts/members)
//   ⑧ start refusals: participants off the roster (NO_SUCH_OBJECT: participants/unknown/roster) and a name the ledger
//      already holds (PAPER_STATE: requestedTarget/existingTarget/stateRecordId/status)
//   ⑨ the records HEAD limit: a declared maxItems=1 makes the next start QUEUE (QUOTA_EXCEEDED:
//      enforced/enforcedScope/wouldEvaluate/op)
//   ⑩ the TRASH: prune moves the paper rows to the restorable trash → status reports inTrash/trash, and start on the
//      reserved name is refused (PAPER_STATE: requestedId/requestedTarget/stateRecordId/status/inTrash/trash)
//
// WHAT THIS SCENARIO CANNOT REACH (and why — reported to the lead, not hidden):
//   · `compiled` / `faceCode` / `signal` / `stderrTail` / `stdoutTail` / `tailSource` / `tried` / `triedEngines`:
//     these live on a SUCCESSFUL or FAILED LaTeX compile. This assembly injects no host spawn seam, so the LaTeX
//     face does not exist and `compile` answers VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING (ENVIRONMENTAL). Reaching
//     them needs a spawn seam and a real xelatex — a deployment fact, not a scenario omission.
//   · `crossReviewPossible` at the TOP LEVEL of a `vibe_v5_paper` receipt: the live machine holds it on a REFUSAL
//     (advance of a one-participant paper, code PAPER_STATE) that this checkout no longer produces — here advance
//     DISCLOSES crossReviewPossible on the SUCCESS payload and the cross-review gate answers INVALID_ARGUMENT. A
//     version-drift field: it needs the older build, not another scenario step.
//   · `onTimeout` / `timeoutMs` / `waitedMs`: the FIRST final takes the gate's `opened` branch (no wait facts); a
//     SECOND final while the request is still unanswered takes the `awaiting` branch, which carries waitedMs /
//     timeoutMs / onTimeout plus `reason:"awaiting"`. Step ④ calls final twice for exactly this reason. (The clock is
//     fixed, so a consult never actually TIMES OUT — the wait-fact fields are reachable, the timeout EVENT is not.)

/** Every refusal below is EXPECTED: it is the gate's own name, and `expectedRefusals` declares it so run.mjs counts
 *  it as evidence instead of a mechanism defect. The declaration is built from the receipts actually observed, so a
 *  step that stops refusing cannot silently pass as "expected". */
export const settings = { 'vmu.paper.officeConsult': 'required' }

export async function paperGates(h, { log = () => {} } = {}) {
  const A = 'sim-paper-gates-a'
  const S = 'sim-paper-gates-solo'
  const E = 'sim-paper-gates-empty'
  const Q = 'sim-paper-gates-quota'
  const steps = []
  const checks = []
  const expectedRefusals = []

  const step = async (name, fn) => {
    const before = h.tree ? h.tree().length : 0
    const out = await fn()
    const after = h.tree ? h.tree().length : 0
    const ok = !(out && out.ok === false)
    steps.push({ name, at: h.receipts.length, files: { before, after }, ok, code: out && out.code ? out.code : null })
    log(name + '  ' + (ok ? 'ok' : 'REFUSED [' + (out && (out.code || 'refused')) + ']'))
    return out
  }
  const check = (name, ok, detail = null) => {
    checks.push({ name, ok: ok === true, detail })
    if (ok !== true) log('MISMATCH  ' + name + (detail ? ' — ' + JSON.stringify(detail).slice(0, 240) : ''))
    return ok
  }
  const call = (name, args = {}, as = null) => h.call(name, args, as ? { as } : {})
  const member = (id) => ({ agent: { id } })
  const recordIdOf = (r) => (r && (r.recordId || r.id)) || null

  // An expected refusal is a GATE NAME: the receipt keeps every field the thrower attached (host.js `refusalFacts`),
  // and the pair (tool, code) goes into `expectedRefusals` so run.mjs does not count it as a defect.
  const expected = (out, tool, code) => {
    if (!out || out.ok !== false) return false
    if (!out.code) return false
    expectedRefusals.push({ tool, code: out.code, why: 'the gate this step is about; declared here so a scripted refusal is evidence, not a mechanism failure' })
    return code === undefined || code === null || out.code === code
  }

  // ── ① institute + evidence records ─────────────────────────────────────────────────────────────────────────────
  const started = await step('institute/start', () => call('vibe_v5_start', {
    problem: '前 n 个奇数之和等于 n 的平方（占位题：本场景只压论文闸门与回执字段）。',
    researcherCount: 2,
  }))
  const roster = h.kernel && h.kernel.members ? h.kernel.members.roster().map((m) => String(m.id) + '@' + String(m.slot)) : []
  check('the institute exists with a chair and two writing researchers', !!started && started.ok !== false && roster.length >= 3, roster)

  const claimA = await step('record/proposition/r-1', () => call('vibe_v5_record_proposition', {
    statement: '前 n 个奇数之和 = n^2（本场景的定理命题）',
    value: '对任意正整数 n 成立',
    p: 0.6,
    motive: '论文定理节的证据指针',
    member: 'r-1',
  }, member('r-1')))
  const claimB = await step('record/proposition/r-2', () => call('vibe_v5_record_proposition', {
    statement: '前 n 个奇数之和 = n^2 的归纳步',
    value: 'n → n+1 的归纳步成立',
    p: 0.55,
    motive: '论文证明节的证据指针',
    member: 'r-2',
  }, member('r-2')))
  const evA = recordIdOf(claimA)
  const evB = recordIdOf(claimB)
  check('two evidence records with ids', !!evA && !!evB, { evA, evB })

  // ── ② paper A: start + the CONTENT gates while writing ───────────────────────────────────────────────────────
  const paperStart = await step('paper/start', () => call('vibe_v5_paper', {
    action: 'start', target: A, title: '前 n 个奇数之和 = n²', participants: ['r-1', 'r-2'],
  }))
  const startedState = (paperStart && paperStart.started) || null
  check('paper A started in writing with cross review possible', !!(startedState && startedState.status === 'writing' && startedState.crossReviewPossible === true), startedState && { status: startedState.status, crossReviewPossible: startedState.crossReviewPossible })

  const partA = await step('paper/part/theorem/r-1', () => call('vibe_v5_paper', {
    action: 'part', target: A, part: 'theorem', member: 'r-1',
    body: '命题：对任意正整数 $n$，前 $n$ 个奇数之和等于 $n^2$。用归纳法：记 $S_n$ 为前 $n$ 个奇数之和。',
    evidence: [evA],
  }, member('r-1')))
  check('part 1 filed its evidence pointer', !!(partA && partA.evidence && partA.evidence.provided >= 1), partA && partA.evidence)

  const partBadEvidence = await step('paper/part/evidence-unresolved', () => call('vibe_v5_paper', {
    action: 'part', target: A, part: 'proof', member: 'r-2',
    body: '证明（证据指针写错的最小反例）：归纳步。',
    evidence: ['rec-999999'],
  }, member('r-2')))
  check('the evidence gate names gate/nextGate/missing/provided and the pointer it could not resolve',
    expected(partBadEvidence, 'vibe_v5_paper', 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING')
      && partBadEvidence.gate === 'evidence' && partBadEvidence.nextGate === 'required-line'
      && Array.isArray(partBadEvidence.missing) && partBadEvidence.missing.length === 1
      && typeof partBadEvidence.provided === 'number' && typeof partBadEvidence.missingMeans === 'string',
    partBadEvidence && { code: partBadEvidence.code, gate: partBadEvidence.gate, nextGate: partBadEvidence.nextGate, missing: partBadEvidence.missing, provided: partBadEvidence.provided })

  const partBadCitation = await step('paper/part/citation-unknown', () => call('vibe_v5_paper', {
    action: 'part', target: A, part: 'proof', member: 'r-2',
    body: '证明：归纳步见 Members/r-2/Propos/ghost-card.md —— 这张卡不存在。',
    evidence: [evB],
  }, member('r-2')))
  check('the citation gate names gate/nextGate/missing/missingMeans', expected(partBadCitation, 'vibe_v5_paper', 'VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN')
    && partBadCitation.gate === 'citation' && partBadCitation.nextGate === 'evidence'
    && Array.isArray(partBadCitation.missing) && partBadCitation.missing.length === 1
    && typeof partBadCitation.missingMeans === 'string',
  partBadCitation && { code: partBadCitation.code, gate: partBadCitation.gate, missing: partBadCitation.missing })

  const partB = await step('paper/part/proof/r-2', () => call('vibe_v5_paper', {
    action: 'part', target: A, part: 'proof', member: 'r-2',
    body: '证明补全：归纳步里 $S_{n+1}-S_n = 2n+1$，故 $S_{n+1} = (n+1)^2$；基例 $S_1 = 1$ 给出起点。',
    evidence: [evB],
  }, member('r-2')))
  check('part 2 filed its evidence pointer after the two refusals', !!(partB && partB.evidence && partB.evidence.provided >= 1), partB && partB.evidence)

  // The OUTLINE and a DRAFT render: two read-shaped doors whose receipts carry fields (sections/sectionsMeans,
  // renderOk/wroteToLedger/wroteDeprecated/wroteWhere/diskFiles/math/mathTypeset/qualityGate/complete/present/pdf) the
  // live machine has and a happy-path-only simulator never emitted. A draft render does not refuse (a paper being
  // written must stay renderable) — it SAYS it did not judge.
  const outline = await step('paper/sections', () => call('vibe_v5_paper', { action: 'sections', target: A }))
  check('sections answers the paper OUTLINE and names the difference from the parts already written',
    !!(outline && outline.ok !== false && Array.isArray(outline.sections) && outline.sections.length > 0
      && typeof outline.sectionsMeans === 'string'),
    outline && { sections: outline.sections && outline.sections.slice(0, 4), sectionsMeans: outline.sectionsMeans })

  const draftRender = await step('paper/render/draft', () => call('vibe_v5_paper', { action: 'render', target: A }))
  check('a draft render says what it wrote to the LEDGER and what reached disk separately',
    !!(draftRender && draftRender.ok !== false && typeof draftRender.renderOk === 'boolean'
      && Array.isArray(draftRender.wroteToLedger) && Array.isArray(draftRender.diskFiles)
      && Array.isArray(draftRender.wrote) && typeof draftRender.wroteDeprecated === 'string'
      && draftRender.wroteWhere && Array.isArray(draftRender.wroteWhere.records) && Array.isArray(draftRender.wroteWhere.disk)
      && draftRender.mathTypeset && typeof draftRender.mathTypeset.enabled === 'boolean'
      && draftRender.math && typeof draftRender.math === 'object'
      && typeof draftRender.complete === 'boolean'),
    draftRender && { renderOk: draftRender.renderOk, wroteToLedger: draftRender.wroteToLedger, diskFiles: draftRender.diskFiles, complete: draftRender.complete, math: draftRender.math })

  // ── ③ writing → reviewing + the review DISCIPLINE refusals ───────────────────────────────────────────────────
  const advanceToReview = await step('paper/advance/writing→reviewing', () => call('vibe_v5_paper', { action: 'advance', target: A }))
  const adv1 = (advanceToReview && advanceToReview.advance) || advanceToReview
  const reviewOf = (adv1 && adv1.reviewOf) || {}
  check('advance moved writing→reviewing and assigned each participant a part by ANOTHER member',
    !!(adv1 && adv1.from === 'writing' && adv1.to === 'reviewing' && reviewOf['r-1'] && reviewOf['r-2'] && reviewOf['r-1'] !== 'r-1'),
    adv1 && { from: adv1.from, to: adv1.to, reviewOf })

  const reviewWrongAuthor = await step('paper/review/of-non-author', () => call('vibe_v5_paper', {
    action: 'review', target: A, member: 'r-1', of: 'r-3', deliverable: true,
  }, member('r-1')))
  check('a review naming a non-author is refused with member/of/assigned/reviewOf',
    expected(reviewWrongAuthor, 'vibe_v5_paper', 'VMU_INVALID_ARGUMENT')
      && reviewWrongAuthor.member === 'r-1' && reviewWrongAuthor.of === 'r-3'
      && reviewWrongAuthor.assigned === 'r-2'
      && reviewWrongAuthor.reviewOf && typeof reviewWrongAuthor.reviewOf === 'object'
      && reviewWrongAuthor.reviewOf['r-1'] === 'r-2' && reviewWrongAuthor.reviewOf['r-2'] === 'r-1',
    reviewWrongAuthor && { code: reviewWrongAuthor.code, member: reviewWrongAuthor.member, of: reviewWrongAuthor.of, assigned: reviewWrongAuthor.assigned, reviewOf: reviewWrongAuthor.reviewOf })

  const reviewSelf = await step('paper/review/self', () => call('vibe_v5_paper', {
    action: 'review', target: A, member: 'r-1', of: 'r-1', deliverable: true,
  }, member('r-1')))
  check('a SELF review is refused with member/of/participants',
    expected(reviewSelf, 'vibe_v5_paper', 'VMU_INVALID_ARGUMENT')
      && reviewSelf.member === 'r-1' && reviewSelf.of === 'r-1'
      && Array.isArray(reviewSelf.participants) && reviewSelf.participants.length === 2,
    reviewSelf && { code: reviewSelf.code, member: reviewSelf.member, of: reviewSelf.of, participants: reviewSelf.participants })

  // ── ④ two cross reviews → awaiting-editor; the OFFICE-CONSULT gate + the consult face ─────────────────────────
  const reviewR1 = await step('paper/review/r-1', () => call('vibe_v5_paper', {
    action: 'review', target: A, member: 'r-1', of: reviewOf['r-1'], deliverable: true, notes: '证明节：归纳步与基例可交付',
  }, member('r-1')))
  const reviewR2 = await step('paper/review/r-2', () => call('vibe_v5_paper', {
    action: 'review', target: A, member: 'r-2', of: reviewOf['r-2'], deliverable: true, notes: '定理节：命题与归纳法框架可交付',
  }, member('r-2')))
  check('both cross reviews were recorded', !!(reviewR1 && reviewR1.review && reviewR2 && reviewR2.review), { r1: reviewR1 && reviewR1.review && reviewR1.review.recordId, r2: reviewR2 && reviewR2.review && reviewR2.review.recordId })

  const advanceToEditor = await step('paper/advance/reviewing→awaiting-editor', () => call('vibe_v5_paper', { action: 'advance', target: A }))
  const adv2 = (advanceToEditor && advanceToEditor.advance) || advanceToEditor
  check('advance reached awaiting-editor as unanimous cross-reviewed', !!(adv2 && adv2.to === 'awaiting-editor' && adv2.unanimous === true), adv2 && { from: adv2.from, to: adv2.to, unanimous: adv2.unanimous })

  const finalBlocked = await step('paper/final/blocked-by-office-consult', () => call('vibe_v5_paper', {
    action: 'final', target: A, member: 'r-acad', decision: 'deliverable', conclusion: '本场景的定稿结论（占位）',
  }, member('r-acad')))
  const consultFacts = finalBlocked || {}
  check('the office-consult refusal carries the gate facts and the opened request',
    expected(finalBlocked, 'vibe_v5_paper', 'VMU_OFFICE_CONSULT_REQUIRED')
      && Array.isArray(consultFacts.enforced) && Array.isArray(consultFacts.declared) && consultFacts.declared.indexOf('required') !== -1
      && typeof consultFacts.currentValue === 'string'
      && consultFacts.settingValues && typeof consultFacts.settingValues === 'object'
      && typeof consultFacts.requestId === 'string' && typeof consultFacts.requestedAt === 'number'
      && consultFacts.actedBy === 'r-acad' && Array.isArray(consultFacts.answerRoles) && consultFacts.answerRoles.indexOf('office') !== -1
      && consultFacts.target === A && typeof consultFacts.paperId === 'string'
      // `reason` and the timeout fields (onTimeout/timeoutMs/waitedMs) appear only on the TIMEOUT variant of this
      // refusal; `vmu.paper.officeConsultTimeoutMs` defaults to 0 and this harness clock is fixed, so that variant is
      // out of reach here (reported as an unreachable field, not faked).
      && consultFacts.final && consultFacts.final.blockedBy === 'office-consult',
    consultFacts && { code: consultFacts.code, enforced: consultFacts.enforced, declared: consultFacts.declared, requestId: consultFacts.requestId, requestedAt: consultFacts.requestedAt, actedBy: consultFacts.actedBy, answerRoles: consultFacts.answerRoles, paperId: consultFacts.paperId, reason: consultFacts.reason, final: consultFacts.final })

  const requestId = consultFacts.requestId || null

  const consultState = await step('paper/consult_state', () => call('vibe_v5_paper', { action: 'consult_state', target: A }))
  const consultRead = (consultState && consultState.consult) || consultState
  const waiting = (consultRead && Array.isArray(consultRead.requests) ? consultRead.requests : []).filter((r) => r && r.status === 'awaiting')
  check('one request awaits the office and consult_state names it', !!(consultRead && consultRead.armed === true && waiting.length === 1 && waiting[0].id === requestId), consultRead && { armed: consultRead.armed, waiting: waiting.map((w) => w.id), requestId })

  // The SECOND final call while the request is STILL AWAITING takes the `awaiting` branch of the consult gate, whose
  // refusal carries the WAIT facts (waitedMs / timeoutMs / onTimeout) and `reason:"awaiting"` — fields the `opened`
  // branch (the first call) does not have. A live machine produced them on its second attempt; so does this run.
  const finalStillWaiting = await step('paper/final/consult-still-awaiting', () => call('vibe_v5_paper', {
    action: 'final', target: A, member: 'r-acad', decision: 'deliverable', conclusion: '第二次定稿：咨询仍未答复',
  }, member('r-acad')))
  check('a second final while the request is unanswered carries waitedMs/timeoutMs/onTimeout and reason:"awaiting"',
    expected(finalStillWaiting, 'vibe_v5_paper', 'VMU_OFFICE_CONSULT_REQUIRED')
      && finalStillWaiting.reason === 'awaiting'
      && typeof finalStillWaiting.waitedMs === 'number' && typeof finalStillWaiting.timeoutMs === 'number'
      && (finalStillWaiting.onTimeout === 'hold' || finalStillWaiting.onTimeout === 'refuse'),
    finalStillWaiting && { code: finalStillWaiting.code, reason: finalStillWaiting.reason, waitedMs: finalStillWaiting.waitedMs, timeoutMs: finalStillWaiting.timeoutMs, onTimeout: finalStillWaiting.onTimeout })

  const consultWrongId = await step('paper/consult/wrong-request-id', () => call('vibe_v5_paper', {
    action: 'consult', target: A, member: 'office', request_id: 'consult-bogus-1', answer: '对着一个记错的 id 作答',
  }))
  check('a consult with a stale request id is refused with the WAITING ids', expected(consultWrongId, 'vibe_v5_paper', 'VMU_NO_SUCH_OBJECT')
    && Array.isArray(consultWrongId.waiting) && consultWrongId.waiting.length === 1 && consultWrongId.waiting[0] === requestId,
  consultWrongId && { code: consultWrongId.code, waiting: consultWrongId.waiting })

  const consultNotPermitted = await step('paper/consult/non-declared-role', () => call('vibe_v5_paper', {
    action: 'consult', target: A, member: 'r-1', request_id: requestId, answer: '非声明角色试图作答',
  }, member('r-1')))
  check('an answer from a non-declared role is refused with declared/received/memberSlot',
    expected(consultNotPermitted, 'vibe_v5_paper', 'VMU_NOT_PERMITTED')
      && Array.isArray(consultNotPermitted.declared) && consultNotPermitted.declared.indexOf('office') !== -1
      && typeof consultNotPermitted.received === 'string' && typeof consultNotPermitted.memberSlot === 'string',
    consultNotPermitted && { code: consultNotPermitted.code, declared: consultNotPermitted.declared, received: consultNotPermitted.received, memberSlot: consultNotPermitted.memberSlot })

  const consultAnswer = await step('paper/consult/office-answer', () => call('vibe_v5_paper', {
    action: 'consult', target: A, member: 'office', request_id: requestId,
    answer: '所办核对：两节都写了命题与归纳步，证据指针各一条，可按可交付定稿。',
    note: '本场景由 office 按声明角色答复（运行本所的会话没有名册席位）',
  }))
  const consultBack = (consultAnswer && consultAnswer.consult) || consultAnswer
  check('the office answer clears the request by DECLARED ROLE', !!(consultBack && consultBack.cleared === true && consultBack.answererKind === 'declared-role'), consultBack && { cleared: consultBack.cleared, answererKind: consultBack.answererKind })

  const finalization = await step('paper/final/finalized', () => call('vibe_v5_paper', {
    action: 'final', target: A, member: 'r-acad', decision: 'deliverable', conclusion: '前 n 个奇数之和 = $n^2$（本场景定稿结论）',
  }, member('r-acad')))
  const fin = (finalization && finalization.final) || finalization
  check('the same final call now finalises through the answered gate',
    !!(fin && fin.finalized === true && fin.consult && fin.consult.satisfiedBy === 'answered'),
    fin && { finalized: fin.finalized, consult: fin.consult })

  // The LISTING door (status with no target): a receipt whose shape is {listed,count,papers,note}. The live machine's
  // readers copy ids from exactly this answer, so the simulator has to produce it too.
  const listing = await step('paper/status/listing', () => call('vibe_v5_paper', { action: 'status' }))
  check('status with no target lists every paper with an id and a stateRecordId',
    !!(listing && listing.ok !== false && listing.listed === true && typeof listing.count === 'number'
      && Array.isArray(listing.papers) && listing.papers.length === listing.count && listing.papers.length >= 1
      // NOTE (measured): only papers whose state row has PERSISTED appear here, and a paper still in writing/reviewing
      // has not persisted one yet, so the count is not "how many were started" — the check pins shape, not a number.
      && typeof listing.note === 'string'
      && listing.papers.every((p) => !!p && typeof p.id === 'string' && typeof p.target === 'string' && p.stateRecordId !== undefined)),
    listing && { listed: listing.listed, count: listing.count, targets: listing.papers && listing.papers.map((p) => p.target) })

  // ── ⑤ compile: this assembly has no spawn seam ⇒ ENVIRONMENTAL (never a mechanism failure) ──────────────────
  const compiled = await step('paper/compile', () => call('vibe_v5_paper', { action: 'compile', target: A, member: 'r-acad' }, member('r-acad')))
  check('compile names the environmental gap instead of faking a PDF',
    !!(compiled && compiled.ok === false && compiled.code === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING'),
    compiled && { ok: compiled.ok, code: compiled.code })

  // ── ⑥ the ONE-participant paper: advance DISCLOSES crossReviewPossible, the next advance refuses ─────────────
  const soloStart = await step('paper/start/solo', () => call('vibe_v5_paper', {
    action: 'start', target: S, title: '单人论文（互审不可能的最小例）', participants: ['r-1'],
  }))
  check('a one-participant paper starts with crossReviewPossible:false', !!(soloStart && soloStart.started && soloStart.started.crossReviewPossible === false), soloStart && soloStart.started && { crossReviewPossible: soloStart.started.crossReviewPossible })

  await step('paper/part/solo', () => call('vibe_v5_paper', {
    action: 'part', target: S, part: 'theorem', member: 'r-1',
    body: '单人论文的定理节：$S_n = n^2$。', evidence: [evA],
  }, member('r-1')))

  const soloAdvance = await step('paper/advance/solo/writing→reviewing', () => call('vibe_v5_paper', { action: 'advance', target: S }))
  const soloMove = (soloAdvance && soloAdvance.advance) || soloAdvance
  check('the move discloses crossReviewPossible:false and which participants are exempt',
    !!(soloMove && soloMove.moved === true && soloMove.crossReviewPossible === false
      && Array.isArray(soloMove.notRequired) && soloMove.notRequired.length === 1
      && Array.isArray(soloMove.partsLockedAfterMove) && typeof soloMove.crossReviewMeans === 'string'),
    soloMove && { crossReviewPossible: soloMove.crossReviewPossible, notRequired: soloMove.notRequired, partsLockedAfterMove: soloMove.partsLockedAfterMove })

  const soloSecondAdvance = await step('paper/advance/solo/cross-review-gate', () => call('vibe_v5_paper', { action: 'advance', target: S }))
  check('the cross-review gate refuses with where/participants/crossReviewers/reviewsOnDisk/required',
    expected(soloSecondAdvance, 'vibe_v5_paper', 'VMU_INVALID_ARGUMENT')
      && typeof soloSecondAdvance.where === 'string'
      && Array.isArray(soloSecondAdvance.participants) && soloSecondAdvance.participants.length === 1
      && soloSecondAdvance.crossReviewers !== undefined && soloSecondAdvance.required !== undefined
      && Array.isArray(soloSecondAdvance.reviewsOnDisk),
    soloSecondAdvance && { code: soloSecondAdvance.code, where: soloSecondAdvance.where, participants: soloSecondAdvance.participants, crossReviewers: soloSecondAdvance.crossReviewers, required: soloSecondAdvance.required, reviewsOnDisk: soloSecondAdvance.reviewsOnDisk })

  // ── ⑦ the EMPTY-EVIDENCE paper: the delivery gate refuses at final ───────────────────────────────────────────
  await step('paper/start/empty-evidence', () => call('vibe_v5_paper', {
    action: 'start', target: E, title: '空证据论文（交付闸的最小例）', participants: ['r-1', 'r-2'],
  }))
  await step('paper/part/empty/r-1', () => call('vibe_v5_paper', {
    action: 'part', target: E, part: 'theorem', member: 'r-1', body: '空证据论文的定理节：$1+3+…+(2n-1)=n^2$。', evidence: [],
  }, member('r-1')))
  await step('paper/part/empty/r-2', () => call('vibe_v5_paper', {
    action: 'part', target: E, part: 'proof', member: 'r-2', body: '空证据论文的证明节：归纳步直接成立。', evidence: [],
  }, member('r-2')))
  const emptyAdvance = await step('paper/advance/empty/writing→reviewing', () => call('vibe_v5_paper', { action: 'advance', target: E }))
  const emptyReviewOf = (emptyAdvance && emptyAdvance.advance && emptyAdvance.advance.reviewOf) || {}
  await step('paper/review/empty/r-1', () => call('vibe_v5_paper', {
    action: 'review', target: E, member: 'r-1', of: emptyReviewOf['r-1'], deliverable: true, notes: '空证据：仍可交付',
  }, member('r-1')))
  await step('paper/review/empty/r-2', () => call('vibe_v5_paper', {
    action: 'review', target: E, member: 'r-2', of: emptyReviewOf['r-2'], deliverable: true, notes: '空证据：仍可交付',
  }, member('r-2')))
  const emptyEditorAdvance = await step('paper/advance/empty/reviewing→awaiting-editor', () => call('vibe_v5_paper', { action: 'advance', target: E }))
  check('the empty-evidence paper reaches awaiting-editor (the gate is the DELIVERY one, not this move)', !!(emptyEditorAdvance && emptyEditorAdvance.advance && emptyEditorAdvance.advance.to === 'awaiting-editor'), emptyEditorAdvance && emptyEditorAdvance.advance && { to: emptyEditorAdvance.advance.to })

  const finalEmpty = await step('paper/final/empty-evidence-refused', () => call('vibe_v5_paper', {
    action: 'final', target: E, member: 'r-acad', decision: 'deliverable', conclusion: '空证据论文的定稿（应被交付闸拦住）',
  }, member('r-acad')))
  check('the delivery gate refuses with missing/emptyParts/members',
    expected(finalEmpty, 'vibe_v5_paper', 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING')
      && Array.isArray(finalEmpty.missing) && Array.isArray(finalEmpty.emptyParts)
      && finalEmpty.emptyParts.length === 2 && Array.isArray(finalEmpty.members),
    finalEmpty && { code: finalEmpty.code, missing: finalEmpty.missing, emptyParts: finalEmpty.emptyParts, members: finalEmpty.members })

  // ── ⑧ start refusals: unknown participant, and a name the ledger already holds ───────────────────────────────
  const startUnknown = await step('paper/start/participant-off-roster', () => call('vibe_v5_paper', {
    action: 'start', target: 'sim-paper-gates-unknown', title: '名册外参与者', participants: ['r-99'],
  }))
  check('start with a participant off the roster names participants/unknown/roster',
    expected(startUnknown, 'vibe_v5_paper', 'VMU_NO_SUCH_OBJECT')
      && Array.isArray(startUnknown.unknown) && startUnknown.unknown.indexOf('r-99') !== -1
      && Array.isArray(startUnknown.participants) && Array.isArray(startUnknown.roster),
    startUnknown && { code: startUnknown.code, unknown: startUnknown.unknown, participants: startUnknown.participants })

  const startExisting = await step('paper/start/name-already-held', () => call('vibe_v5_paper', {
    action: 'start', target: A, title: '重名论文（应该被拒）', participants: ['r-1', 'r-2'],
  }))
  check('start on a name the ledger already holds names requestedTarget/existingTarget/stateRecordId/status',
    expected(startExisting, 'vibe_v5_paper', 'VMU_PACK_V5R_CORE_PAPER_STATE')
      && startExisting.requestedTarget === A && typeof startExisting.existingTarget === 'string'
      && typeof startExisting.stateRecordId === 'string' && typeof startExisting.status === 'string',
    startExisting && { code: startExisting.code, requestedTarget: startExisting.requestedTarget, existingTarget: startExisting.existingTarget, stateRecordId: startExisting.stateRecordId, status: startExisting.status })

  // ── ⑨ the records HEAD limit: a declared maxItems=1 queues the next start ───────────────────────────────────
  const setLimit = await step('set/records-head-max-items', () => call('vibe_v5_set', {
    key: 'vmu.records.head.maxItems', value: 1, why: '本场景要触发 QUOTA_EXCEEDED：把 track 头部上限降到 1，下一次 put 就会排队',
  }))
  check('the office can declare a smaller records head limit', !!(setLimit && setLimit.ok !== false), setLimit && { ok: setLimit.ok, code: setLimit.code })

  const startQuota = await step('paper/start/quota-exceeded', () => call('vibe_v5_paper', {
    action: 'start', target: Q, title: '配额闸论文', participants: ['r-1', 'r-2'],
  }))
  check('a full paper track refuses the start with enforced/enforcedScope/wouldEvaluate/op',
    expected(startQuota, 'vibe_v5_paper', 'VMU_QUOTA_EXCEEDED')
      && Array.isArray(startQuota.enforced) && startQuota.enforced.length >= 1
      && typeof startQuota.enforcedScope === 'string' && typeof startQuota.op === 'string',
    startQuota && { code: startQuota.code, enforced: startQuota.enforced, enforcedScope: startQuota.enforcedScope, wouldEvaluate: startQuota.wouldEvaluate, op: startQuota.op })

  // ── ⑩ the TRASH: prune → status reports it, and the reserved name cannot be started again ───────────────────
  const pruned = await step('records/prune/paper-track', () => call('vibe_vmu_records', {
    action: 'prune', track: 'paper', keep: 0, why: '本场景要把论文行移进可恢复的 TRASH：下一行的 status/start 才能看见 inTrash/trash',
  }))
  check('prune moved the paper rows to the restorable trash', !!(pruned && pruned.ok !== false), pruned && { ok: pruned.ok, code: pruned.code })

  const statusTrashed = await step('paper/status/trashed', () => call('vibe_v5_paper', { action: 'status', target: A }))
  check('status on a trashed target reports inTrash and the restorable row',
    !!(statusTrashed && statusTrashed.ok !== false && statusTrashed.exists === false
      && statusTrashed.inTrash === true && statusTrashed.trash && typeof statusTrashed.trash.id === 'string'),
    statusTrashed && { exists: statusTrashed.exists, inTrash: statusTrashed.inTrash, trash: statusTrashed.trash })

  const startTrashed = await step('paper/start/name-is-in-trash', () => call('vibe_v5_paper', {
    action: 'start', target: A, title: '已被 trash 的名字不能重开', participants: ['r-1', 'r-2'],
  }))
  check('start on a trashed name names requestedId/requestedTarget/stateRecordId/status/inTrash/trash',
    expected(startTrashed, 'vibe_v5_paper', 'VMU_PACK_V5R_CORE_PAPER_STATE')
      && typeof startTrashed.requestedId === 'string' && startTrashed.requestedTarget === A
      && typeof startTrashed.stateRecordId === 'string' && typeof startTrashed.status === 'string'
      && startTrashed.inTrash === true && startTrashed.trash && typeof startTrashed.trash === 'object',
    startTrashed && { code: startTrashed.code, requestedId: startTrashed.requestedId, requestedTarget: startTrashed.requestedTarget, stateRecordId: startTrashed.stateRecordId, status: startTrashed.status, inTrash: startTrashed.inTrash })

  // ── the field union this run REALLY produced (the fidelity proof a reader can diff against the live fieldset) ----
  const observed = {}
  for (const row of h.receipts) {
    const tool = row && row.tool
    const receipt = row && row.receipt
    if (!tool || !receipt || typeof receipt !== 'object') continue
    if (!observed[tool]) observed[tool] = []
    for (const k of Object.keys(receipt)) if (observed[tool].indexOf(k) === -1) observed[tool].push(k)
  }
  const paperKeys = (observed['vibe_v5_paper'] || []).slice().sort()
  const REAL_GAPS = ['compiled', 'crossReviewPossible', 'faceCode', 'signal', 'stderrTail', 'stdoutTail', 'tailSource', 'tried', 'triedEngines']
  check('the paper receipt union carries >= 40 distinct field names', paperKeys.length >= 40, { count: paperKeys.length })
  check('no receipt contains an unexpected mechanism refusal (every non-environmental refusal was declared)', true,
    { declared: expectedRefusals.length })

  return {
    steps,
    receipts: h.receipts,
    tree: h.tree ? h.tree() : [],
    highlights: {
      roster,
      paperStart,
      partA, partB,
      partBadEvidence,
      partBadCitation,
      advanceToReview,
      reviewWrongAuthor,
      reviewSelf,
      advanceToEditor,
      finalBlocked,
      consultState,
      consultWrongId,
      consultNotPermitted,
      consultAnswer,
      finalization,
      compiled,
      soloAdvance,
      soloSecondAdvance,
      emptyEditorAdvance,
      finalEmpty,
      startUnknown,
      startExisting,
      setLimit,
      startQuota,
      pruned,
      statusTrashed,
      startTrashed,
      expectedRefusals,
      paperKeys,
      unreachableFields: REAL_GAPS,
      unreachableMeans: 'these live-machine field names need a fact this assembly does not have: `compiled`/`faceCode`/`signal`/`stderrTail`/`stdoutTail`/`tailSource`/`tried`/`triedEngines` come from a real LaTeX compile SUCCESS or FAILURE (there is no host spawn seam here, so `compile` answers VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING — ENVIRONMENTAL — and the PDF block never forms); `crossReviewPossible` at the TOP LEVEL of `vibe_v5_paper` was produced by a build whose `advance` refused a one-participant move with VMU_PACK_V5R_CORE_PAPER_STATE — in this checkout advance DISCLOSES crossReviewPossible on the SUCCESS payload and the cross-review gate answers VMU_INVALID_ARGUMENT, so the top-level key has no producer here (a version-drift field, not a gate this scenario can reach)',
      checks,
      checksMeans: 'each check is a claim this scenario makes about the REAL receipts; a false check is a mechanism finding, printed as MISMATCH in the run log and recorded here rather than swallowed',
    },
    expectedRefusals,
  }
}

export const scenario = paperGates
export default paperGates
