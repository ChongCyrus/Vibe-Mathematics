// tests/sim-harness-shape.test.mjs — TB-2630: the 0-token simulator can reproduce the ADAPTER's two named refusals,
// and keeps them distinct from the MEMBER's oldest one.
//
// WHY THIS SUITE EXISTS (one sentence per measured failure it locks down):
//
//   ① THE SIMULATOR COULD NOT SHOW A SHAPE DEFECT AT ALL. `scripts/sim/harness.mjs` flattened an unrecognised reply
//      object with `String(reply)` into the literal `[object Object]` — 15 characters of prose the kernel happily
//      parsed. So the one thing RUN 254 P1-6 needed to prove end-to-end ("the host handed back a shape this kernel
//      cannot read") could only be pinned on a raw kernel seam, never through the simulator. The harness now PASSES
//      THE OBJECT THROUGH as a named marker and the seam THROWS it, so a receipt says `VMU_TURN_DELIVERY_SHAPE`.
//   ② `null` WAS INDISTINGUISHABLE FROM PROSE. `null` fell through to the empty string, so "the adapter sent nothing"
//      and "the member wrote nothing" looked the same in the corpus. It is now `VMU_TURN_DELIVERY_NO_PAYLOAD`, a
//      DIFFERENT code from `VMU_TURN_DELIVERY_SHAPE`: wrong thing sent ≠ nothing sent, and the fixes differ.
//   ③ THE THREE CODES MUST NOT COLLAPSE INTO ONE. `VMU_TURN_NO_FENCE` (a member wrote prose without the fence) is the
//      kernel's judgement on a perfectly good adapter; the two DELIVERY codes are the adapter's own failures. A
//      harness that reported NO_FENCE for junk would be blaming the member for a broken adapter — this suite asserts
//      the three names are distinct AND that the prose path still reaches NO_FENCE untouched.
//   ④ A PIN THAT THE OLD BEHAVIOUR SURVIVES THE EDIT. The last section restores the legacy `String()` flattening into
//      a copy of the harness and shows the suite's own assertions go red (>=3 of them) plus the end-to-end receipt
//      falls back to `VMU_ENGINE_UNAVAILABLE`. A test that cannot fail is a comment.
//
// WHAT IT DOES NOT CLAIM: the kernel's own delivery door (`kernel/turn/index.js`) ALSO calls the shape error for
// `null`, because it names the fault from `String(null)`. The harness is deliberately FINER (silence vs junk); the
// parity assertions below read the kernel seam directly and assert the codes that are truly shared, instead of
// pretending the two layers are identical.
//
// Run: node tests/sim-harness-shape.test.mjs   (targeted; part of the T1 sweep, ~10s, no network, no LaTeX)

import { tmpdir } from 'node:os'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TMP = join(tmpdir(), 'sim-tests-shape-' + process.pid)

const HARNESS = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href)
const { createTurnOrchestrator } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href)
const { createPromptPipeline } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')).href)
const HARNESS_SRC = readFileSync(join(REPO, 'scripts', 'sim', 'harness.mjs'), 'utf8')
const SCENARIO_DIR = join(REPO, 'scripts', 'sim', 'scenarios')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 500)))
  return false
}

const SHAPE = 'VMU_TURN_DELIVERY_SHAPE'
const NO_PAYLOAD = 'VMU_TURN_DELIVERY_NO_PAYLOAD'
const NO_FENCE = 'VMU_TURN_NO_FENCE'
const ENVELOPE = { output: [{ type: 'text', text: 'hi' }] }
const JUNK = { foo: 'bar', n: 2 }

mkdirSync(TMP, { recursive: true })
const mkRoot = async (tag) => mkdtemp(join(TMP, tag + '-'))
const bootWith = async (deliver) => HARNESS.boot({
  root: await mkRoot('ws'),
  clock: () => Date.parse('2026-01-01T00:00:00.000Z'),
  deliver,
})
// One drive is the smallest end-to-end act that crosses the delivery seam: a failing shape must surface on the
// receipt the tool returns, not only in a side ledger.
const driveOnce = async (h) => {
  const started = await h.call('vibe_v5_start', { researcherCount: 1 })
  if (!started || started.ok !== true) return { error: 'start refused: ' + JSON.stringify(started).slice(0, 200) }
  const drive = await h.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: 'TB-2630 shape probe' })
  return { drive, receipt: (drive && drive.receipts && drive.receipts[0]) || {}, row: h.delivered[h.delivered.length - 1] || {} }
}

console.log('=== 1. replyTextOf returns FOUR answers, and the two faults are not the same answer ===')
ok(typeof HARNESS.replyTextOf === 'function', 'the boundary function is exported (a test can read it without booting a kernel)')
ok(HARNESS.replyTextOf('member prose') === 'member prose', 'a bare string is the reply TEXT, untouched (the member judgement is not pre-empted)')
ok(HARNESS.replyTextOf([{ type: 'text', text: 'block text' }]) === 'block text', 'ContentBlock[] is an ACCEPTED shape and becomes text')
ok(HARNESS.replyTextOf({ text: 'via text' }) === 'via text', '{text} is an ACCEPTED shape')
ok(HARNESS.replyTextOf({ reply: 'via reply' }) === 'via reply', '{reply} is an ACCEPTED shape')
const envMark = HARNESS.replyTextOf(ENVELOPE)
ok(envMark && typeof envMark === 'object' && envMark.code === SHAPE,
  'an unrecognised object becomes a NAMED shape fault, not text', envMark)
ok(envMark.shape === 'delivery-envelope' && Array.isArray(envMark.keys) && envMark.keys.indexOf('output') >= 0,
  'the marker names the shape it saw and the keys it carried', envMark && { shape: envMark.shape, keys: envMark.keys })
ok(envMark.value === ENVELOPE && envMark.value.output[0].text === 'hi',
  'the ORIGINAL structure is passed through (identity preserved) so a later gate can name it', envMark && envMark.value)
const junkMark = HARNESS.replyTextOf(JUNK)
ok(junkMark && junkMark.code === SHAPE && junkMark.shape === 'object' && junkMark.keys.indexOf('foo') >= 0,
  'any other object is the same named shape fault, with its own keys', junkMark && { code: junkMark.code, keys: junkMark.keys })
const nullMark = HARNESS.replyTextOf(null)
const undefMark = HARNESS.replyTextOf(undefined)
ok(nullMark && nullMark.code === NO_PAYLOAD && nullMark.shape === 'no-payload' && nullMark.keys.length === 0,
  'null is NO PAYLOAD — a different fact from a wrong shape', nullMark)
ok(undefMark && undefMark.code === NO_PAYLOAD, 'undefined is the same NO PAYLOAD fact', undefMark && undefMark.code)
ok(SHAPE !== NO_PAYLOAD && SHAPE !== NO_FENCE && NO_PAYLOAD !== NO_FENCE,
  'the three names are distinct: wrong shape / nothing sent / member wrote prose', { SHAPE, NO_PAYLOAD, NO_FENCE })
ok(typeof HARNESS.replyTextOf(ENVELOPE) !== 'string' && HARNESS.replyTextOf(ENVELOPE) !== '[object Object]',
  'no object is ever flattened into the 15-character [object Object] fabrication', HARNESS.replyTextOf(ENVELOPE))

console.log('=== 2. END-TO-END: the seam refuses by name, through the real tool registry ===')
// DEPENDENCY (named, not waived): these two assertions are the taskbook's end-to-end criterion and stay STRICT. They
// are red until task-112 (TB-2632, state-lane) makes `kernel/turn/index.js` stop re-labelling the adapter's own codes
// as VMU_ENGINE_UNAVAILABLE; the harness side is already correct and `h.delivered[].faultCode` proves it. Removing or
// relaxing them would turn a product gap into a green ticket — the one thing this lane must not do.
{
  const { drive, receipt, row } = await driveOnce(await bootWith(async () => ENVELOPE))
  ok(drive && receipt.code === SHAPE,
    'a host envelope drives a receipt whose code is VMU_TURN_DELIVERY_SHAPE (the old UNAVAILABLE is gone)',
    receipt && { code: receipt.code, message: String(receipt.message || '').slice(0, 140) })
  ok(row.replyShape === 'shape-error' && row.replyChars === 0 && row.faultCode === SHAPE,
    'the delivered ledger records the fault shape, a fault code, and invents no character count', row && { replyShape: row.replyShape, replyChars: row.replyChars, faultCode: row.faultCode })
  ok(row.reply && row.reply.value === ENVELOPE,
    'the receipt-side ledger still carries the original structure, not a stringified copy', row && row.reply && row.reply.shape)
  ok(drive && drive.roundsRun === 0, 'no round is claimed to have run on a shape the boundary cannot read', drive && drive.roundsRun)
}
{
  const { receipt, row } = await driveOnce(await bootWith(async () => null))
  ok(receipt.code === NO_PAYLOAD,
    'a null reply drives VMU_TURN_DELIVERY_NO_PAYLOAD — silence at the adapter is named as such',
    receipt && { code: receipt.code, message: String(receipt.message || '').slice(0, 140) })
  ok(row.replyShape === 'no-payload' && row.faultCode === NO_PAYLOAD,
    'and the ledger distinguishes it from the shape-error row', row && { replyShape: row.replyShape, faultCode: row.faultCode })
}
{
  const { receipt } = await driveOnce(await bootWith(async () => 'a plain answer without a fence'))
  ok(receipt.code === NO_FENCE,
    'prose without a fence is STILL VMU_TURN_NO_FENCE: the adapter answers are not allowed to swallow the member judgement',
    receipt && { code: receipt.code, message: String(receipt.message || '').slice(0, 140) })
}

console.log('=== 3. PARITY: read the kernel door directly, assert only the codes the two layers truly share ===')
const makeLoop = (deliver) => createTurnOrchestrator({
  sectionPolicy: () => ({ decisions: [] }),
  prompt: createPromptPipeline({ sections: [{ name: 'v5r-charter-opening', order: 100, text: 'OPENING' }], bindings: [], clock: () => '2026-01-01T00:00:00.000Z' }),
  deliver,
})
const kernelRow = async (deliver) => {
  const out = await makeLoop(deliver).drive({ members: ['r-1'], rounds: 1, phase: 'normal' })
  return (out && out.receipts && out.receipts[0]) || {}
}
{
  const row = await kernelRow(async () => ENVELOPE)
  ok(row.code === SHAPE, 'the kernel door refuses the same envelope with the SAME code the harness cannot rewrite', row && { code: row.code })
  ok(String(row.message || '').includes('an object with keys [output]'),
    'and the kernel names the keys it actually received', String(row.message || '').slice(0, 160))
  const proseRow = await kernelRow(async () => 'a plain answer without a fence')
  ok(proseRow.code === NO_FENCE, 'the control reads the kernel prose refusal too (both layers agree on the member judgement)', proseRow && { code: proseRow.code })
}
{
  const row = await kernelRow(async () => null)
  // Recorded DIVERGENCE, asserted rather than papered over: the kernel names null as a shape error (`String(null)`),
  // the harness names it as NO PAYLOAD. Both are named refusals; the harness one tells the reader which fix applies.
  ok(row.code === SHAPE && row.code !== NO_PAYLOAD,
    'the kernel collapses null into the shape code (got=null); the harness is FINER and says NO PAYLOAD — asserted, not assumed',
    row && { kernelCode: row.code, harnessCode: NO_PAYLOAD, means: 'kernel/turn/index.js names the fault from String(null); the simulator separates silence from junk' })
}

console.log('=== 4. THE SEAM IS THE ONLY DOOR: source and scenario guards ===')
ok(HARNESS_SRC.includes("code: 'VMU_TURN_DELIVERY_SHAPE'") && HARNESS_SRC.includes("code: 'VMU_TURN_DELIVERY_NO_PAYLOAD'"),
  'both codes are WRITTEN in the harness source, not only mentioned in prose')
ok(HARNESS_SRC.indexOf('VMU_TURN_DELIVERY_NO_PAYLOAD') < HARNESS_SRC.indexOf("Array.isArray(reply.output) ? 'delivery-envelope'"),
  'the NO PAYLOAD branch is evaluated BEFORE the object branch (otherwise null is swallowed and the code is dead)')
ok(HARNESS_SRC.includes('if (fault !== null) throw namedFault('),
  'a named fault is THROWN at the seam (a marker read only by the ledger would never reach a receipt)')
ok(HARNESS_SRC.includes('err.code = fault.code') && HARNESS_SRC.includes('err.deliveryPath'),
  'the thrown error carries the code and the delivery path it came from (the receipt can say where it broke)')
{
  // No scenario may quietly depend on the new throw: none of them pass a `deliver` function today (the delegated path
  // is exercised from tests, not from the 15 lifecycle scenarios), so this change cannot reshape a sweep baseline.
  const offenders = readdirSync(SCENARIO_DIR).filter((f) => f.endsWith('.mjs')).filter((f) => {
    const src = readFileSync(join(SCENARIO_DIR, f), 'utf8')
    return /(^|[^A-Za-z0-9_.])deliver\s*:/.test(src) && !src.includes('deliverMode')
  })
  ok(offenders.length === 0, 'no lifecycle scenario passes a deliver seam (so no sweep baseline could shift silently)', offenders)
}
{
  // The two scenarios the taskbook names must still be green AFTER the seam starts throwing: a named fault only fires
  // when a scenario supplied a broken adapter, and none does.
  for (const name of ['turns', 'end-to-end']) {
    const out = spawnSync(process.execPath, [join('scripts', 'sim', 'run.mjs'), '--scenario', name, '--out', join(TMP, 'run-' + name)], {
      cwd: REPO, encoding: 'utf8', timeout: 45000, maxBuffer: 64 * 1024 * 1024,
      env: Object.assign({}, process.env, { DSH_SIM_ZERO_TOKEN: '1' }),
    })
    ok(out.status === 0, 'scenario ' + name + ' still exits 0 with the new seam', { status: out.status, tail: String(out.stdout || out.stderr || '').slice(-300) })
  }
}

console.log('=== 5. MUTATION: restore the legacy String() flattening and watch this suite go red ===')
{
  const mutDir = await mkRoot('mutated')
  // The copy must NOT also copy `settings.mjs`: the mutation only touches replyTextOf, and a copied neighbour would
  // re-resolve `settings.mjs`'s own relative imports against the temp dir (the first version of this section died with
  // ERR_MODULE_NOT_FOUND and proved nothing). Point the copy at the REAL settings module by URL instead.
  const harnessPath = join(REPO, 'scripts', 'sim', 'harness.mjs')
  const settingsUrl = pathToFileURL(join(REPO, 'scripts', 'sim', 'settings.mjs')).href
  const src = readFileSync(harnessPath, 'utf8')
  if (!src.includes("from './settings.mjs'")) {
    ok(false, 'the mutation can find the settings import it must repoint', { file: 'scripts/sim/harness.mjs' })
  }
  // The two legacy behaviours, restored verbatim: silence becomes the empty string, an object becomes String(obj).
  const legacy = src
    .replace("from './settings.mjs'", "from '" + settingsUrl + "'")
    // REPO is derived from the file's OWN location (`join(dirname(import.meta.url), '..', '..')`), so a copy in the temp
    // dir would look for `vibe-math-vmu/` under D:/_tmp and die with ERR_MODULE_NOT_FOUND before proving anything. Pin the
    // real repo into the copy instead: the mutation is about replyTextOf, not about path derivation.
    .replace(/export const REPO = join\(dirname\(fileURLToPath\(import\.meta\.url\)\), '\.\.', '\.\.'\)/, 'export const REPO = ' + JSON.stringify(REPO))
    .replace(/if \(reply === undefined \|\| reply === null\) \{[\s\S]*?\n  \}\n/, 'if (reply === undefined || reply === null) return \'\'\n')
    .replace(/return \{\n    code: 'VMU_TURN_DELIVERY_SHAPE',[\s\S]*?\n  \}\n\}/, 'return String(reply)\n}')
  writeFileSync(join(mutDir, 'harness.mjs'), legacy)
  ok(legacy.includes('export const REPO = ' + JSON.stringify(REPO)), 'the mutated copy is pointed at the REAL repo (a copy that dies on import proves nothing)', { repo: REPO })
  const mutated = await import(pathToFileURL(join(mutDir, 'harness.mjs')).href + '?mut=' + Date.now())
  const mutEnvelope = mutated.replyTextOf(ENVELOPE)
  const mutNull = mutated.replyTextOf(null)
  ok(mutEnvelope === '[object Object]',
    'MUTATION ①: with String() restored, the envelope becomes the 15-character [object Object] again (assertion 1 red)', mutEnvelope)
  ok(mutNull === '',
    'MUTATION ②: with the fall-through restored, null becomes the empty string again (assertion 2 red)', JSON.stringify(mutNull))
  ok(typeof mutEnvelope !== 'object' || mutEnvelope.code === undefined,
    'MUTATION ③: and no named code survives at the boundary (assertions 1-6 would be red)', { code: (mutEnvelope || {}).code })
  {
    const h = await mutated.boot({ root: await mkRoot('ws-legacy'), clock: () => Date.parse('2026-01-01T00:00:00.000Z'), deliver: async () => ENVELOPE })
    const { receipt } = await driveOnce(h)
    // MEASURED: with the legacy flattening the receipt is NO LONGER the shape code. It becomes `VMU_TURN_NO_FENCE` —
    // the adapter's junk arrives as the member's prose, so the kernel blames the MEMBER for a broken ADAPTER. That
    // misattribution is the reason the marker exists; the assertion names the failure mode instead of pinning one code.
    ok(receipt.code !== SHAPE && (receipt.code === NO_FENCE || receipt.code === 'VMU_ENGINE_UNAVAILABLE'),
      'MUTATION ④: with String() restored the end-to-end receipt is no longer the shape code — the adapter defect is blamed on the member (NO_FENCE) or collapses to UNAVAILABLE',
      receipt && { code: receipt.code, means: 'the 15-character [object Object] is legal prose to the member judgement, which is exactly why flattening hid the defect' })
  }
  rmSync(mutDir, { recursive: true, force: true })
}

rmSync(TMP, { recursive: true, force: true })
console.log('')
console.log('=== sim harness shape: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error(failed + ' assertion(s) failed — the simulator can no longer reproduce the adapter refusals by name.')
  process.exitCode = 1
}
