// ROUND-17 P1①: the paper phases were never rendered by any ruler (37 assemblies, 0 hits), so the B-1/B-2/B-5 fixes in
// `v5r-paper-writing/review/final-guide` were BLIND to the audit. This test renders the three paper phases through the
// same collector the section matrix uses and asserts the three repaired facts are really in the text a seat reads.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
const { collect, PAPER_PHASES } = await import(new URL('../scripts/sim/audit/prompt-sections.mjs', import.meta.url).href)

const got = await collect({ slots: ['chair', 'member', 'temp'], phases: ['paper-write', 'paper-review', 'paper-final'] })
const textOf = (slot, phase) => got.sections.filter((s) => s.slot === slot && s.phase === phase).map((s) => s.text).join('\n')

test('the paper phases are rendered by the matrix collector (not blind any more)', () => {
  assert.deepEqual([...PAPER_PHASES], ['paper-write', 'paper-review', 'paper-final'])
  assert.ok(got.combos.length > 0, 'precondition (RULE E shape A): at least one combo exists before the loop walks them — an empty list must not make the assertions vacuous')
  assert.equal(got.combos.length, 9, 'three seats × three paper phases (literal 9: a positive-integer guard — RULE E cannot see `3 * 3` as a non-empty precondition for the loop below, and an empty combos list would make that loop vacuously pass)')
  for (const c of got.combos) {
    assert.ok(c.chars > 1000, c.slot + '/' + c.phase + ' is a real assembly, not an empty slice')
    assert.ok(c.headings > 10, c.slot + '/' + c.phase + ' has sections')
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
