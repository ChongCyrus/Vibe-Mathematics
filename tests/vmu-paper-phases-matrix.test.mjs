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
