#!/usr/bin/env node
// tests/vmu-run96-receipt-fidelity.test.mjs — ROUND 96: a refusal must name the verb it refused, and a run receipt
// must answer "what value did this print?" in ONE place.
//
// WHY (real machine, round 96): the boundary refusal on a service meeting said `action "this action"` — the member
// could not tell WHICH verb had been refused, and the receipt carried only code/message/hint even though docs/03
// promised `boundaryOnly`/`askedAction`/`registry`/`actionCrosses`. Separately, `math_computation`'s own receipt had
// no `value`/`valueMissing` at all while the policy face (kernel/math.js) answered null-with-a-reason — two entries,
// two shapes, one question. A program reading either shape had to guess.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const load = (rel) => import(pathToFileURL(join(REPO, rel)).href)
let passed = 0
let failed = 0
const ok = async (name, fn) => {
  try { await fn(); passed += 1; console.log('ok   ' + name) }
  catch (e) { failed += 1; console.log('FAIL ' + name + ' :: ' + String(e && e.message).slice(0, 300)) }
}

const meeting = await load('vibe-math-vmu/tools/meeting.js')
const { primitiveMissError, refusalDetails, makeMeetingSpec, SERVICE_CROSSING_ACTIONS } = meeting

// ── §1 the error itself names the verb and the boundary ─────────────────────────────────────────────────────
await ok('a non-crossing verb on a service id is a registry boundary, not a missing object', () => {
  const err = primitiveMissError({ id: 'm1', inService: true, action: 'agendaitems' })
  assert.equal(err.code, 'VMU_REGISTRY_BOUNDARY')
  assert.equal(err.boundaryOnly, true)
  assert.equal(err.askedAction, 'agendaitems')
  assert.equal(err.registry, 'service')
  assert.equal(err.actionCrosses, false)
  assert.match(String(err.message), /^action "agendaitems" addresses the PRIMITIVE registry only and never crosses/)
  assert.ok(String(err.hint).indexOf('SERVICE registry') >= 0)
})

await ok('a CROSSING verb is not a boundary refusal (its answer is about the service method, not the registry)', () => {
  assert.ok(SERVICE_CROSSING_ACTIONS.includes('status'))
  const err = primitiveMissError({ id: 'm1', inService: true, action: 'status' })
  assert.equal(err.code, 'VMU_NO_SUCH_OBJECT')
  assert.equal(err.boundaryOnly, false)
  assert.equal(err.actionCrosses, true)
})

await ok('refusalDetails forwards exactly the boundary facts and nothing invented', () => {
  assert.deepEqual(refusalDetails(primitiveMissError({ id: 'm1', inService: true, action: 'silent' })),
    { registry: 'service', askedAction: 'silent', actionCrosses: false, boundaryOnly: true })
  assert.equal(refusalDetails(new Error('plain')), null)
  assert.equal(refusalDetails(null), null)
})

// ── §2 the RECEIPT carries them (the round-96 defect was the receipt dropping them) ────────────────────────
const refusedOf = (code, message, hint, extra = null) => Object.assign({ ok: false, code, message, hint: hint || null }, extra || {})
const spec = makeMeetingSpec({
  param: () => ({}),
  refused: refusedOf,
  TOOL_NAMES: { meeting: 'vibe_vmu_meeting' },
  kernel: {
    liveMeeting: () => null,
    liveBallot: () => null,
    meetings: { status: () => ({ liveMeetings: ['m1'] }) },
  },
})

await ok('the face receipt names the real verb and keeps boundaryOnly/askedAction/registry/actionCrosses', async () => {
  const out = await spec.run({ action: 'agendaitems', id: 'm1' })
  assert.equal(out.ok, false)
  assert.equal(out.code, 'VMU_REGISTRY_BOUNDARY')
  assert.equal(out.boundaryOnly, true)
  assert.equal(out.askedAction, 'agendaitems')
  assert.equal(out.registry, 'service')
  assert.equal(out.actionCrosses, false)
  assert.match(String(out.message), /^action "agendaitems" /)
  assert.ok(String(out.message).indexOf('this action') < 0, 'the placeholder must never reach a member')
})

await ok('an unknown verb is named too (no "this action" placeholder ever again)', async () => {
  const out = await spec.run({ action: 'does-not-exist', id: 'm1' })
  assert.equal(out.ok, false)
  assert.ok(String(out.message).indexOf('does-not-exist') >= 0, 'got: ' + String(out.message))
})

// ── §3 one answer to "what value did this print?" ─────────────────────────────────────────────────────────
const COPIES = [
  'vibe-math-vmu/math-computation.js',
  'archive/legacy-presets/vibe-math-v2/math-computation.js',
  'archive/legacy-presets/vibe-math-v3/math-computation.js',
  'archive/legacy-presets/vibe-math-v4/math-computation.js',
  'archive/legacy-presets/vibe-math-v5/math-computation.js',
  'archive/legacy-presets/vibe-math-v5r/math-computation.js',
  'tests/fixtures/mc-P1-ready/math-computation.js',
]

await ok('printedValueOf answers the same way in all seven copies', async () => {
  for (const rel of COPIES) {
    const mod = await load(rel)
    assert.equal(typeof mod.printedValueOf, 'function', rel + ' must export printedValueOf')
    assert.deepEqual(mod.printedValueOf('1025\r\n'), { value: '1025', valueMissing: null, valueMeans: null }, rel)
    const empty = mod.printedValueOf('   \r\n')
    assert.equal(empty.value, null, rel)
    assert.equal(empty.valueMissing, 'stdout-empty', rel)
    assert.match(String(empty.valueMeans), /would have been invented/, rel)
    assert.equal(mod.printedValueOf(undefined).value, null, rel)
  }
})

await ok('the low-level receipt spreads printedValueOf (the member reads value on BOTH entries)', () => {
  const src = readFileSync(join(REPO, 'vibe-math-vmu/math-computation.js'), 'utf8')
  assert.ok(src.indexOf('...printedValueOf(String(fullOut).slice(0, MATH_CAPS.stdout)),') >= 0)
})

await ok('kernel/math.js has no second answer (it delegates and reuses valueMeans)', () => {
  const src = readFileSync(join(REPO, 'vibe-math-vmu/kernel/math.js'), 'utf8')
  assert.ok(src.indexOf('printedValueOf,') >= 0)
  assert.ok(src.indexOf('const { value, valueMissing, valueMeans } = printedValueOf(raw.stdout)') >= 0)
  assert.ok(src.indexOf("const value = printed !== '' ? printed : null") < 0, 'the inline rule must be gone')
})

// ── §4 the new code is registered where the contract lives ────────────────────────────────────────────────
await ok('VMU_REGISTRY_BOUNDARY is registered in docs/03 §8', () => {
  const doc = readFileSync(join(REPO, 'vibe-math-vmu/docs/03-interface-contract.md'), 'utf8')
  assert.ok(doc.indexOf('R96 · `VMU_REGISTRY_BOUNDARY`') >= 0)
})

console.log('ROUND 96 RECEIPT FIDELITY: ' + passed + ' passed, ' + failed + ' failed')
process.exit(failed === 0 ? 0 : 1)
