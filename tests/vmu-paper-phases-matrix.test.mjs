// ROUND-17 P1①: the paper phases were never rendered by any ruler (37 assemblies, 0 hits), so the B-1/B-2/B-5 fixes in
// `v5r-paper-writing/review/final-guide` were BLIND to the audit. This test renders the three paper phases through the
// same collector the section matrix uses (which now applies `decideSections` for paper turns, exactly like the turn loop)
// and asserts the three repaired facts AND the policy-filtered shape of each paper screen are what a seat reads.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
const { collect, analyzeSections, PAPER_PHASES } = await import(new URL('../scripts/sim/audit/prompt-sections.mjs', import.meta.url).href)

const got = await collect({ slots: ['chair', 'member', 'temp'], phases: ['paper-write', 'paper-review', 'paper-final'] })
const analysis = analyzeSections(got.sections)
const idsOf = (slot, phase) => got.sections.filter((s) => s.slot === slot && s.phase === phase).map((s) => s.sectionId)
const textOf = (slot, phase) => got.sections.filter((s) => s.slot === slot && s.phase === phase).map((s) => s.text).join('\n')

test('the paper phases are rendered by the matrix collector AND filtered by the same section policy', () => {
  assert.deepEqual([...PAPER_PHASES], ['paper-write', 'paper-review', 'paper-final'])
  assert.equal(got.combos.length, 3 * 3, 'three seats × three paper phases')
  assert.equal(analysis.assemblyRepeats.length, 0, 'no sentence renders twice inside one paper prompt')
  assert.equal((analysis.assemblyDups || []).length, 0, 'no assembly-level duplicate left in a paper screen')
  for (const c of got.combos) {
    const cap = c.slot === 'chair' ? 36500 : 30100
    assert.ok(c.chars > 20000 && c.chars <= cap, c.slot + '/' + c.phase + ' = ' + c.chars + ' is inside cap ' + cap)
    const ids = idsOf(c.slot, c.phase)
    // exactly ONE fixture variant, ONE reply catalogue, ONE formal status, ONE leader variant (policy picked it)
    assert.deepEqual(ids.filter((x) => /^v5r-fixture-(constraint|tools)$/.test(x)), ['v5r-fixture-tools'], c.slot + '/' + c.phase + ': tools fixture only')
    assert.deepEqual(ids.filter((x) => /reply-(spec|compact)/.test(x)), ['v5r-reply-compact'], c.slot + '/' + c.phase + ': compact catalogue only')
    assert.deepEqual(ids.filter((x) => /formal-status/.test(x)), ['v5r-formal-status-none'], c.slot + '/' + c.phase + ': one formal status')
    assert.equal(ids.filter((x) => /leaderless/.test(x)).length, 0, c.slot + '/' + c.phase + ': no leaderless variant on a leader-staffed paper turn')
    assert.equal(ids.filter((x) => /v5r-charter-taskboard-leader$/.test(x)).length, 1, c.slot + '/' + c.phase + ': exactly one student-board leader variant')
  }
})

test('B-1 (office-consult two-stage) is in the paper-final prompt', () => {
  for (const slot of ['chair', 'member', 'temp']) {
    const t = textOf(slot, 'paper-final')
    assert.ok(t.includes('VMU_OFFICE_CONSULT_REQUIRED'), slot + ': the gate code is named')
    assert.ok(t.includes('再 final 重试'), slot + ': the two-stage retry is taught')
    assert.ok(!t.includes('E4 的所办前置在本实现里未接线'), slot + ': the old contradictory sentence is gone')
  }
})

test('RUN-89: final-success chain (render → compile → reopen-closure) is taught, with the V14 consequence', () => {
  for (const slot of ['chair', 'member', 'temp']) {
    const t = textOf(slot, 'paper-final')
    assert.ok(t.includes('action:"render"'), slot + ': the render call is named')
    assert.ok(t.includes('recordIds'), slot + ': the render receipt is named')
    assert.ok(t.includes('V14 直接判 FAIL'), slot + ': the consequence of skipping render is explicit')
    assert.ok(t.includes('reopen-closure'), slot + ': the closing window comes AFTER render in the chain')
  }
})

test('RUN-89: the pre-final SELF-CHECK names cross-review, grade line, glyph and revise-recheck', () => {
  for (const slot of ['chair', 'member', 'temp']) {
    const t = textOf(slot, 'paper-final')
    assert.ok(t.includes('调用 final 前的自检清单'), slot + ': the checklist is a named block')
    assert.ok(t.includes('VMU_PAPER_CROSS_REVIEW_UNMET'), slot + ': cross-review refusal is named')
    assert.ok(t.includes('证据等级：'), slot + ': the per-section grade line is named')
    assert.ok(t.includes('glyphsUnrepaired'), slot + ': the glyph reading is named')
    assert.ok(t.includes('必须重审并重新 final'), slot + ': revise forces re-review + re-final')
  }
})

test('per-screen distribution: review carries the cross-review self-check, write carries the grade-line rule', () => {
  for (const slot of ['chair', 'member', 'temp']) {
    const rev = textOf(slot, 'paper-review')
    assert.ok(rev.includes('crossReviewers'), slot + '/review: crossReviewers read face is named')
    assert.ok(rev.includes('VMU_PAPER_CROSS_REVIEW_UNMET'), slot + '/review: the refusal code is named')
    const wr = textOf(slot, 'paper-write')
    assert.ok(wr.includes('证据等级：'), slot + '/write: the per-section grade line is named')
    assert.ok(wr.includes('VMU_PAPER_GRADE_LINE_MISSING'), slot + '/write: the missing-grade refusal is named')
  }
})

test('RUN-90: first final may be refused as gates=[] by office-consult, and the cap path is gated by VMU_REVIEW_STALE', () => {
  for (const slot of ['chair', 'member', 'temp']) {
    const t = textOf(slot, 'paper-final')
    assert.ok(t.includes('`gates` 为空 `[]`'), slot + ': the empty gates[] reading is named')
    assert.ok(t.includes('四门尚未评估') || t.includes('四门未评估'), slot + ': the four gates are explicitly NOT evaluated')
    assert.ok(t.includes('VMU_REVIEW_STALE'), slot + ': the stale-vote gate is named')
    assert.ok(t.includes('只对当前指纹的票生效'), slot + ': cap only applies to current-fingerprint votes')
  }
})

test('RUN-91: reachableMoves is read BEFORE acting, and reviewing+false uses the chair four-step loop (no author self-edit)', () => {
  for (const slot of ['chair', 'member', 'temp']) {
    const rev = textOf(slot, 'paper-review')
    assert.ok(rev.includes('reachableMoves'), slot + '/review: reachableMoves is named')
    assert.ok(rev.includes('不能改 part'), slot + '/review: the unreachable self-edit is denied')
    assert.ok(rev.includes('打回 `writing`'), slot + '/review: the chair advance-back step is named')
    const fin = textOf(slot, 'paper-final')
    assert.ok(fin.includes('reachableMoves') && fin.includes('唯一可达动作清单'), slot + '/final: read the moves before acting')
  }
})

test('RUN-92: gatesEvaluated:false is the four-gates-not-run reading, and requiredLines is taught as a TIMING fact', () => {
  for (const slot of ['chair', 'member', 'temp']) {
    const t = textOf(slot, 'paper-final')
    assert.ok(t.includes('gatesEvaluated:false'), slot + ': the receipt field is named')
    assert.ok(t.includes('四门尚未评估'), slot + ': the four gates are explicitly not run')
    assert.ok(t.includes('promote 与 `requiredLines` 的时序'), slot + ': promote-after-final is named as timing')
    assert.ok(t.includes('satisfiedInBody') && t.includes('capturedAtFinal'), slot + ': the timing read fields are named')
  }
})

test('B-2 (advance→reviewing precondition) is in the paper-review prompt', () => {
  for (const slot of ['chair', 'member', 'temp']) {
    const t = textOf(slot, 'paper-review')
    assert.ok(t.includes('`advance` 到 `reviewing`'), slot + ': the precondition is explicit')
    assert.ok(t.includes('VMU_PACK_V5R_CORE_PAPER_STATE'), slot + ': the refusal a writing-phase review gets is named')
  }
})

test('B-5 (titles are identity; characters belong in the body) is in the paper-write prompt', () => {
  for (const slot of ['chair', 'member', 'temp']) {
    const t = textOf(slot, 'paper-write')
    assert.ok(t.includes('标题保持稳定'), slot + ': titles stay stable')
    assert.ok(t.includes('身份键'), slot + ': the title is named as the identity key')
  }
})
