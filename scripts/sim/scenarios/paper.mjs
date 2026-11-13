// scripts/sim/scenarios/paper.mjs — the PAPER track, end to end, driven by a SCRIPT (no language model).
//
// WHAT THIS COVERS (each step keeps the real receipt, so the corpus is the evidence):
//   ① institute/start (the roster the paper's participants must come from: r-acad + r-1 + r-2)
//   ② record/proposition ×2 — one evidence record per writing participant
//   ③ paper start with TWO participants (r-1, r-2)
//   ④ part ×2, each carrying `evidence: ["rec-<n>"]` (the pointer is resolved at part time)
//   ⑤ status → requiredLines / reachableMoves (the content gate's requirement, read before it can refuse)
//   ⑥ advance → writing→reviewing (roundFrom/roundTo/roundMoved + the reviewOf rotation)
//   ⑦ the NAMED refusal of `review {decision:...}`: `decision` belongs to `final`, and this face never reads it
//   ⑧ review ×2 (deliverable) → advance → reviewing→awaiting-editor with `unanimous` + `crossReview` coverage
//   ⑨ final REFUSED by the office-consult gate (code VMU_OFFICE_CONSULT_REQUIRED, final.blockedBy
//      "office-consult", the requestId it opened) — the office has not answered yet
//   ⑩ consult_state → consult (the office answers by its DECLARED ROLE "office": the office is the session
//      running the work, so it has no roster seat) → final finalized:true
//   ⑪ render → the math counts (inline/display spans, caret/underscore escaping, repaired unicode glyphs)
//   ⑫ compile → this assembly injects no spawn seam, so the LaTeX face does not exist:
//      VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING. That is ENVIRONMENTAL (run.mjs counts it separately, and the
//      finalisation is finalised with pdfEnvironmentMissing:true, not rolled back)
//   ⑬ status → pdfCompiled (no PDF row: the compile never ran) + reachableMoves (the finalised paper takes
//      compile / final{decision:"revise"} / status)
//
// WHY TWO EXPECTED REFUSALS DO NOT GO THROUGH `h.call`: `harness.call` appends EVERY call — refusals included —
// to `h.receipts`, and `run.mjs` exits non-zero when a non-environmental refusal is in that ledger. The two
// refusals exercised here are EXPECTED mechanism facts (they are the gates' own names), so they are executed
// against the SAME registered tool spec (`h.specOf(name).execute`, the exact function `h.call` calls) and their
// receipts are recorded in `steps` + `highlights` instead of being counted as unexpected mechanism failures.
// Every other call goes through `h.call`.

/**
 * @param {{ call: Function, specOf: Function, receipts: Array, kernel: any, tree: Function, prompts?: any }} h
 * @param {{ log?: Function }} [opts]
 */
export async function paper(h, { log = () => {} } = {}) {
  const T = 'sim-paper-paper'
  const steps = []
  const checks = []

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

  // The tool spec and the EXACT execute() the harness uses — but this helper does NOT append to h.receipts, so an
  // expected refusal can be captured with the fields a reader needs (`final.blockedBy`, `requestId`, `hint`).
  const execAs = (as) => (as === null ? { kernel: h.kernel } : { kernel: h.kernel, agent: as.agent })
  const expectRefusal = async (name, args, { as = null, code = null } = {}) => {
    const spec = h.specOf(name)
    if (!spec) return { ok: false, code: 'NO-SUCH-TOOL', message: name }
    let receipt = null
    let thrown = null
    try {
      const raw = await spec.execute(args, execAs(as))
      receipt = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) { thrown = e }
    const got = thrown ? { ok: false, code: (thrown && thrown.code) || null, message: String((thrown && thrown.message) || thrown), hint: (thrown && thrown.hint) || null } : receipt
    const actual = got && got.code ? String(got.code) : null
    const matched = got && got.ok === false && (code === null || actual === code)
    if (!matched) {
      log('MISMATCH  expected refusal ' + String(code) + ' from ' + name + ', got ' + String(actual) + ' (ok=' + String(got && got.ok) + ')')
    }
    return {
      ok: matched, refused: true, expectedCode: code, code: actual,
      message: got && got.message ? String(got.message) : null,
      hint: got && got.hint ? String(got.hint) : null,
      // Fields the host's flattened `h.call` receipt would drop (they live on the refusal body).
      final: got && got.final ? got.final : null,
      requestId: got && got.requestId ? String(got.requestId) : null,
      settingValues: got && got.settingValues ? got.settingValues : null,
      answerRoles: got && Array.isArray(got.answerRoles) ? got.answerRoles.slice() : null,
      thrown: thrown !== null,
    }
  }

  // ── ① the institute exists (and the roster paper.start validates participants against) ─────────────────────────
  const started = await step('institute/start', () => call('vibe_v5_start', {
    problem: '前 n 个奇数之和等于 n 的平方（占位题：本场景只压论文机制，不压数学）。',
    researcherCount: 2,
  }))
  const roster = h.kernel && h.kernel.members ? h.kernel.members.roster().map((m) => String(m.id) + '@' + String(m.slot)) : []

  // ── ② one evidence record per writing participant ──────────────────────────────────────────────────────────────
  const claimA = await step('record/proposition/r-1', () => call('vibe_v5_record_proposition', {
    statement: '前 n 个奇数之和 = n^2（对任意正整数 n）',
    value: '对任意正整数 n 成立',
    p: 0.6,
    motive: '论文定理节要引用的那条记录（本场景的 evidence 指针）',
    member: 'r-1',
  }, member('r-1')))
  const claimB = await step('record/proposition/r-2', () => call('vibe_v5_record_proposition', {
    statement: '前 n 个奇数之和 = n^2 的归纳步',
    value: 'n → n+1 的归纳步成立',
    p: 0.55,
    motive: '论文证明节要引用的那条记录（本场景的 evidence 指针）',
    member: 'r-2',
  }, member('r-2')))
  const evA = recordIdOf(claimA)
  const evB = recordIdOf(claimB)
  check('two evidence records with ids', !!evA && !!evB, { evA, evB })

  // ── ③ two participants (cross review needs two: a one-participant paper can never pass 互审) ───────────────────
  const paperStart = await step('paper/start', () => call('vibe_v5_paper', {
    action: 'start',
    target: T,
    title: '前 n 个奇数之和 = n²',
    participants: ['r-1', 'r-2'],
  }))
  check('paper started in writing with crossReviewPossible', !!(paperStart && paperStart.started && paperStart.started.status === 'writing' && paperStart.started.crossReviewPossible === true),
    paperStart && paperStart.started ? { status: paperStart.started.status, crossReviewPossible: paperStart.started.crossReviewPossible } : paperStart)

  // ── ④ each participant writes ONE part and files the record it used as evidence ───────────────────────────────
  // The prose deliberately exercises the tex pass: paired $…$ inline math, a $$…$$ display block, a bare caret
  // OUTSIDE math (read back as proseCarets) and a unicode math glyph (read back as glyphsRepaired).
  const bodyA = '命题：对任意正整数 $n$，前 $n$ 个奇数之和等于 $n^2$。用归纳法：记 $S_n$ 为前 $n$ 个奇数之和，则\n'
    + '$$ S_{n+1} = S_n + (2n+1) = n^2 + 2n + 1 = (n+1)^2 $$\n'
    + '基例 $S_1 = 1$ 成立；归纳步如上，结论对全部 $n \\ge 1$ 成立（正文里的 ≥ 号会被排版层改写，量测 glyphsRepaired）；'
    + '正文里另外保留一个裸 caret 写法 n^2，量测 proseCarets。\n'
    // TB-2786 (RUN 84 attempt-1 V22): `final` reads a NAMED grade line out of each part BODY (a card grade is not a
    // body line). The line travels with the prose; 证据等级：draft 是四值里最保守的那个。
    + '证据等级：draft'
  const partA = await step('paper/part/theorem/r-1', () => call('vibe_v5_paper', {
    action: 'part', target: T, part: 'theorem', member: 'r-1', body: bodyA, evidence: [evA],
  }, member('r-1')))
  check('part 1 filed its evidence pointer', !!(partA && partA.evidence && partA.evidence.provided === 1), partA && partA.evidence)
  const partB = await step('paper/part/proof/r-2', () => call('vibe_v5_paper', {
    action: 'part', target: T, part: 'proof', member: 'r-2',
    body: '证明补全：归纳步里 $S_{n+1}-S_n = 2n+1$，故 $S_{n+1} = (n+1)^2$；基例 $S_1 = 1$ 给出起点。\n证据等级：draft',
    evidence: [evB],
  }, member('r-2')))
  check('part 2 filed its evidence pointer', !!(partB && partB.evidence && partB.evidence.provided === 1), partB && partB.evidence)

  // ── ⑤ the content gate's requirement is READ before it can refuse ─────────────────────────────────────────────
  const statusDraft = await step('paper/status/draft', () => call('vibe_v5_paper', { action: 'status', target: T }))
  check('status reads requiredLines (verified track is empty ⇒ count 0)', !!(statusDraft && statusDraft.requiredLines && statusDraft.requiredLines.count === 0),
    statusDraft && statusDraft.requiredLines ? { count: statusDraft.requiredLines.count, items: statusDraft.requiredLines.items } : statusDraft && statusDraft.requiredLines)
  check('a draft takes part/advance', !!(statusDraft && statusDraft.reachableMoves && Array.isArray(statusDraft.reachableMoves.moves) && statusDraft.reachableMoves.moves.indexOf('advance') !== -1),
    statusDraft && statusDraft.reachableMoves && statusDraft.reachableMoves.moves)

  // ── ⑥ writing → reviewing: the rotation is the paper's own assignment ─────────────────────────────────────────
  const advanceToReview = await step('paper/advance/writing→reviewing', () => call('vibe_v5_paper', { action: 'advance', target: T }))
  const adv1 = (advanceToReview && advanceToReview.advance) || advanceToReview
  check('advance moved writing→reviewing with a round reading', !!(adv1 && adv1.from === 'writing' && adv1.to === 'reviewing' && typeof adv1.roundFrom === 'number' && typeof adv1.roundTo === 'number' && typeof adv1.roundMoved === 'boolean'),
    adv1 ? { from: adv1.from, to: adv1.to, roundFrom: adv1.roundFrom, roundTo: adv1.roundTo, roundMoved: adv1.roundMoved } : adv1)
  const reviewOf = (adv1 && adv1.reviewOf) || {}
  check('review rotation assigns a part by ANOTHER member to each participant',
    !!reviewOf['r-1'] && !!reviewOf['r-2'] && reviewOf['r-1'] !== 'r-1' && reviewOf['r-2'] !== 'r-2', reviewOf)

  // ── ⑦ the named refusal: `decision` belongs to `final`, this face never reads it ──────────────────────────────
  const decisionRefusal = await step('paper/review/decision-refused', () => expectRefusal('vibe_v5_paper', {
    action: 'review', target: T, member: 'r-1', decision: 'deliverable',
  }, { as: member('r-1'), code: 'VMU_INVALID_ARGUMENT' }))
  check('review{decision} is refused BY NAME with the repair (deliverable:true|false)',
    !!(decisionRefusal.ok && /deliverable/.test(String(decisionRefusal.message || '')) && /deliverable/.test(String(decisionRefusal.hint || ''))),
    { code: decisionRefusal.code, message: decisionRefusal.message, hint: decisionRefusal.hint })

  // ── ⑧ both cross reviews, deliverable, on this round ──────────────────────────────────────────────────────────
  const reviewR1 = await step('paper/review/r-1', () => call('vibe_v5_paper', {
    action: 'review', target: T, member: 'r-1', deliverable: true, notes: '定理节：命题与归纳法框架可交付',
  }, member('r-1')))
  const reviewR2 = await step('paper/review/r-2', () => call('vibe_v5_paper', {
    action: 'review', target: T, member: 'r-2', deliverable: true, notes: '证明节：归纳步与基例可交付',
  }, member('r-2')))
  check('both reviews name the OTHER author (no self review)',
    !!(reviewR1 && reviewR1.review && reviewR1.review.of && reviewR1.review.of !== 'r-1' && reviewR2 && reviewR2.review && reviewR2.review.of && reviewR2.review.of !== 'r-2'),
    { r1: reviewR1 && reviewR1.review, r2: reviewR2 && reviewR2.review })

  const advanceToEditor = await step('paper/advance/reviewing→awaiting-editor', () => call('vibe_v5_paper', { action: 'advance', target: T }))
  const adv2 = (advanceToEditor && advanceToEditor.advance) || advanceToEditor
  check('advance reached awaiting-editor as unanimous cross-reviewed',
    !!(adv2 && adv2.to === 'awaiting-editor' && adv2.unanimous === true), adv2 ? { from: adv2.from, to: adv2.to, unanimous: adv2.unanimous, refusers: adv2.refusers, notYetReviewed: adv2.notYetReviewed } : adv2)
  check('crossReview coverage: every part was read by a NON-author, nothing uncovered',
    !!(adv2 && adv2.crossReview && Array.isArray(adv2.crossReview.uncovered) && adv2.crossReview.uncovered.length === 0 && Array.isArray(adv2.crossReview.parts) && adv2.crossReview.parts.length === 2),
    adv2 && adv2.crossReview)

  // ── ⑨ the office-consult gate refuses the finalisation (the office has not answered yet) ──────────────────────
  const consultRefusal = await step('paper/final/blocked-by-office-consult', () => expectRefusal('vibe_v5_paper', {
    action: 'final', target: T, member: 'r-acad', decision: 'deliverable', conclusion: '本场景的定稿结论（占位）',
  }, { as: member('r-acad'), code: 'VMU_OFFICE_CONSULT_REQUIRED' }))
  check('the refusal names the gate and the opened request (final.blockedBy="office-consult")',
    !!(consultRefusal.final && consultRefusal.final.blockedBy === 'office-consult' && consultRefusal.final.finalized === false && consultRefusal.requestId),
    { blockedBy: consultRefusal.final && consultRefusal.final.blockedBy, finalized: consultRefusal.final && consultRefusal.final.finalized, requestId: consultRefusal.requestId })

  // ── ⑩ read the waiting request, then answer it as the office (declared role, no roster seat) ──────────────────
  const consultState = await step('paper/consult_state', () => call('vibe_v5_paper', { action: 'consult_state', target: T }))
  const consultRead = (consultState && consultState.consult) || consultState
  const waiting = (consultRead && Array.isArray(consultRead.requests) ? consultRead.requests : []).filter((r) => r && r.status === 'awaiting')
  check('the gate is armed and exactly one request is awaiting the office',
    !!(consultRead && consultRead.armed === true && waiting.length === 1 && waiting[0].id === consultRefusal.requestId),
    consultRead ? { armed: consultRead.armed, waiting: waiting.map((w) => w.id), expected: consultRefusal.requestId } : consultRead)

  const requestId = consultRefusal.requestId || (waiting[0] && waiting[0].id) || null
  const consultAnswer = await step('paper/consult/office-answer', () => call('vibe_v5_paper', {
    action: 'consult', target: T, member: 'office', request_id: requestId,
    answer: '所办核对：两节都写了命题与归纳步，证据指针各一条，可按可交付定稿。',
    note: '本场景由 office 按声明角色答复（运行本所的会话没有名册席位）',
  }))
  const consultBack = (consultAnswer && consultAnswer.consult) || consultAnswer
  check('the office answer is recorded by DECLARED ROLE and clears the request',
    !!(consultBack && consultBack.cleared === true && consultBack.answererKind === 'declared-role' && consultBack.latestAnswer && consultBack.latestAnswer.answer),
    consultBack ? { cleared: consultBack.cleared, answererKind: consultBack.answererKind, requestId: consultBack.requestId } : consultBack)

  // ── ⑪ the same final call now finalises (the gate is satisfied by the durable consult row) ────────────────────
  const finalization = await step('paper/final/finalized', () => call('vibe_v5_paper', {
    action: 'final', target: T, member: 'r-acad', decision: 'deliverable', conclusion: '前 n 个奇数之和 = $n^2$（本场景定稿结论）',
  }, member('r-acad')))
  const fin = (finalization && finalization.final) || finalization
  check('final finalized through the answered gate (consult.satisfiedBy="answered")',
    !!(fin && fin.finalized === true && fin.consult && fin.consult.satisfiedBy === 'answered' && fin.consult.answeredBy === 'office'),
    fin ? { finalized: fin.finalized, consult: fin.consult } : fin)
  check('the PDF gap is ENVIRONMENTAL, not a rollback (pdfEnvironmentMissing true, rolledBack null)',
    !!(fin && fin.pdfEnvironmentMissing === true && fin.rolledBack === null && fin.pdf && fin.pdf.code === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING'),
    fin ? { pdfEnvironmentMissing: fin.pdfEnvironmentMissing, rolledBack: fin.rolledBack, pdfCode: fin.pdf && fin.pdf.code } : fin)

  // ── ⑫ render: the tex pass reports what it had to repair ──────────────────────────────────────────────────────
  const rendered = await step('paper/render', () => call('vibe_v5_paper', { action: 'render', target: T, member: 'r-acad' }, member('r-acad')))
  const math = (rendered && rendered.math) || null
  check('render wrote md/tex/meta records for the finalised paper and the gate judged it',
    !!(rendered && rendered.renderOk !== true && rendered.complete !== true && Array.isArray(rendered.missing) && rendered.missing.indexOf('pdf') !== -1 && rendered.qualityGate && rendered.qualityGate.ok === true && rendered.qualityGate.checked === true),
    rendered ? { renderOk: rendered.renderOk, missing: rendered.missing, qualityGate: rendered.qualityGate } : rendered)
  check('render.math counts the formulas it typeset (inline, display) and the glyphs/carets it repaired',
    !!(math && math.inlineMathSpans >= 1 && math.displayMathSpans === 1 && math.glyphsRepaired >= 1 && math.proseCarets >= 1),
    math ? { inlineMathSpans: math.inlineMathSpans, displayMathSpans: math.displayMathSpans, glyphsRepaired: math.glyphsRepaired, proseCarets: math.proseCarets } : math)

  // ── ⑬ compile: no spawn seam in this assembly ⇒ the LaTeX face does not exist (ENVIRONMENTAL) ─────────────────
  const compiled = await step('paper/compile', () => call('vibe_v5_paper', { action: 'compile', target: T, member: 'r-acad' }, member('r-acad')))
  check('compile names the environmental gap instead of faking a PDF',
    !!(compiled && compiled.ok === false && compiled.code === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING'),
    compiled ? { ok: compiled.ok, code: compiled.code, message: compiled.message } : compiled)

  // ── ⑭ status: the finalised paper's remaining moves and the PDF archive answer ───────────────────────────────
  const statusEnd = await step('paper/status/finalized', () => call('vibe_v5_paper', { action: 'status', target: T }))
  const paperState = (statusEnd && statusEnd.paper) || null
  const pdfCompiled = (statusEnd && statusEnd.pdfCompiled) || null
  check('status reads finalized and offers compile / revise / status',
    !!(paperState && paperState.status === 'finalized' && statusEnd.reachableMoves && Array.isArray(statusEnd.reachableMoves.moves)
      && statusEnd.reachableMoves.moves.indexOf('compile') !== -1 && statusEnd.reachableMoves.moves.indexOf('final{decision:"revise"}') !== -1),
    { status: paperState && paperState.status, moves: statusEnd && statusEnd.reachableMoves && statusEnd.reachableMoves.moves })
  check('status.pdfCompiled says no PDF row exists (the compile never ran in this assembly)',
    !!(pdfCompiled && pdfCompiled.produced === false && pdfCompiled.recordId === null && typeof pdfCompiled.means === 'string'
      && pdfCompiled.means.indexOf('no compile is on file') !== -1),
    pdfCompiled ? { produced: pdfCompiled.produced, recordId: pdfCompiled.recordId, finalPdfRecordId: pdfCompiled.finalPdfRecordId === undefined ? null : pdfCompiled.finalPdfRecordId, compiledAfterFinal: pdfCompiled.compiledAfterFinal === undefined ? null : pdfCompiled.compiledAfterFinal } : pdfCompiled)

  // ── the prompt the chair/member seat WOULD read (paper phase text is part of the corpus) ─────────────────────
  const promptChars = {}
  if (h.prompts && h.prompts.assembleFor) {
    for (const seat of ['chair', 'member']) {
      const text = await h.prompts.assembleFor({ seat, phase: 'normal' })
      promptChars[seat] = String(text || '').length
    }
  }

  return {
    steps,
    ids: {
      paper: T,
      propositions: [evA, evB],
      paperStart: (paperStart && paperStart.started && paperStart.started.id) || null,
      parts: [partA && partA.part && partA.part.recordId, partB && partB.part && partB.part.recordId],
      reviews: [reviewR1 && reviewR1.review && reviewR1.review.recordId, reviewR2 && reviewR2.review && reviewR2.review.recordId],
      consultRequest: requestId,
      stateRecord: statusEnd && statusEnd.paper ? statusEnd.paper.stateRecordId || null : null,
    },
    receipts: h.receipts,
    promptChars,
    tree: h.tree ? h.tree() : [],
    highlights: {
      roster,
      started,
      claimA, claimB,
      paperStart,
      partA, partB,
      statusDraft,
      advanceToReview,
      decisionRefusal,
      reviewR1, reviewR2,
      advanceToEditor,
      consultRefusal,
      consultState,
      consultAnswer,
      finalization,
      rendered,
      compiled,
      statusEnd,
      checks,
      checksMeans: 'each check is a claim this scenario makes about the REAL receipts; a false check is a mechanism finding, printed as MISMATCH in the run log and recorded here rather than swallowed',
    },
  }
}

export default paper
