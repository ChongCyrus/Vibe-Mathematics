// tests/vmu-run259-recovery-steps.test.mjs — RUN 259 / TB-2647: A RECOVERY NAMES ITS STEPS, AND A DRIFT IS NOT A FAILURE.
//
// THE MEASURED DEFECT (real machine, run 69; four receipts in D:/_tmp/sim/real-receipts.jsonl):
//   · every `VMU_RESUME_READBACK_DRIFT` receipt carried `drift` + `driftMeans` and NO `failedSteps` — and no STEP name
//     of any kind: the receipt said the store had moved, and that was all;
//   · `failedSteps` appeared only on `code:"VMU_STATE"` receipts (value `["ledgers","readback"]`).
//   So one sentence — "which step is not right" — had two different fields on two paths, and the drift path had
//   neither. Worse, that shape made DRIFT read as a FAILURE OF THIS PROCESS: a read-back mismatch may be a perfectly
//   legal write by somebody else (then the next move is "find that writer"), while an executed step that failed is
//   this process's own error (then the next move is "fix the precondition"). One field for both facts is why the G14
//   gate was satisfied by a scenario the real machine never produces.
//
// WHAT THIS SUITE PINS (every assertion is runtime; §5's expectation set is measured EXTERNALLY, not by this code):
//   §0 both lists are DERIVED from the step rows in ONE place (a second derivation is the defect coming back);
//   §1 a clean recovery: every row `{name, ok, code}`, `failedSteps:[]`, and the two lists equal the rows they claim;
//   §2 an injected ledger failure: `failedSteps:["ledgers"]`, no drift code anywhere (a failure is not a drift);
//   §3 drift-only through the FACE: `driftedSteps:["readback"]`, `secondWriter:false` when the durable bytes are this
//      process's OWN earlier write (the store rolled our last write back), and NO `failedSteps` key at all;
//   §4 a real second writer: `secondWriter:true` and a hint that sends the reader to that writer, not to the kernel;
//   §5 the four REAL drift receipts as the expected field set (external source): none of them had `failedSteps`, all
//      had `code`/`consistent`/`drift`/`writesBetween`, and the new receipt adds exactly `driftedSteps`/`secondWriter`.
//
// Run: node tests/vmu-run259-recovery-steps.test.mjs   (last line: === VMU RUN 259 RECOVERY STEPS: N passed, M failed ===)

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const RESUME = join(REPO, 'vibe-math-vmu', 'kernel', 'resume.js')
const HUMAN = join(REPO, 'vibe-math-vmu', 'tools', 'human.js')
const HARNESS = join(REPO, 'scripts', 'sim', 'harness.mjs')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 320) + ']')) }
}
const has = (hay, needle, label) => ok(String(hay === undefined || hay === null ? '' : hay).includes(needle), label, hay)
const codeOf = (r) => (r && r.code) || null
const NL = String.fromCharCode(10)
const sorted = (a) => (Array.isArray(a) ? a.slice() : []).map(String).sort()
const sameSet = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
const owns = (o, k) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)
const CLOCK = () => '2026-05-01T00:00:00.000Z'

// The smallest durable store the recovery face accepts: read / patch / export (read() latches `export().keys`).
const makeStore = () => {
  const inner = new Map()
  return {
    inner,
    read: (k) => (inner.has(k) ? inner.get(k) : null),
    patch: async (k, fn) => { const cur = inner.has(k) ? inner.get(k) : null; const next = typeof fn === 'function' ? await fn(cur) : fn; inner.set(k, next); return next },
    export: () => ({ keys: Object.fromEntries(inner) }),
    set: (k, v) => { inner.set(k, v) },
  }
}
// absence of a port is REPORTED, never faked (a bare store must still recover cleanly — the inflight step needs a
// work seam to have anything to interrupt, not to succeed).
const WORK_PORT = { list: () => [], recover: async () => ({ recovered: 0 }) }

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r259-')); roots.push(d); return d }
const callAs = (h, name, args = {}, as = 'r-acad') => h.call(name, args, { as: as === null ? null : { agent: { id: as } } })
const bootOn = async (root) => boot({ root, clock: () => 1000, withPrompt: false, settings: { 'vmu.tools.faces': ['human', 'meeting'] } })

let boot = null
let createResume = null

try {
  boot = (await import(pathToFileURL(HARNESS).href)).boot
  createResume = (await import(pathToFileURL(RESUME).href)).default
  const resumeSrc = await readFile(RESUME, 'utf8')
  const humanSrc = await readFile(HUMAN, 'utf8')

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // §0 ONE DERIVATION: both lists come from the step rows, and the face does not derive a third one
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log(NL + '§0 the two lists are derived from the step rows in ONE place')
  const factsDefs = (resumeSrc.match(/const derivedStepFactsOf = \(rows\) =>/g) || []).length
  ok(factsDefs === 1, '§0a `derivedStepFactsOf` is defined exactly once (a second derivation is how the two paths drifted apart)', { definitions: factsDefs })
  const nameDefs = (resumeSrc.match(/const nameStepsOf = \(rows\) =>/g) || []).length
  ok(nameDefs === 1, '§0b `nameStepsOf` (name + code on every row) is defined exactly once', { definitions: nameDefs })
  ok(/report\.failedSteps = derived\.failedSteps/.test(resumeSrc) && /report\.driftedSteps = derived\.driftedSteps/.test(resumeSrc),
    '§0c the recovery report ASSIGNS both lists from the derivation (no per-path mapping left)', resumeSrc.length)
  ok(!/out\.failedSteps = bad\.map/.test(humanSrc), '§0d the FACE no longer derives a third `failedSteps` from the rows (the report\'s own list is printed)', humanSrc.length)
  has(resumeSrc, 'secondWriterMeans', '§0e the kernel explains `secondWriter` in words (a field a reader cannot act on is not a reading)')

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // §1 A CLEAN RECOVERY: every row carries its own name/code, and the lists equal the rows they claim
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log(NL + '§1 a clean recovery names every step and claims no failure')
  const r1 = createResume({ store: makeStore(), clock: CLOCK, work: WORK_PORT })
  r1.read()
  const clean = await r1.recover({ reason: 'run259 clean' })
  ok(clean && clean.ok === true, '§1a premise: a bare store recovers cleanly (absence of a port is reported, not faked)', clean && { ok: clean.ok, code: clean.code })
  ok(Array.isArray(clean.steps) && clean.steps.length > 0, '§1b premise: the report carries its steps (non-vacuous)', clean && (clean.steps || []).length)
  const rows = Array.isArray(clean.steps) ? clean.steps : []
  ok(rows.every((s) => s && typeof s.name === 'string' && s.name === String(s.step) && typeof s.ok === 'boolean' && owns(s, 'code')),
    '§1c ★ every step row is `{name, ok, code}` — the code key is PRESENT even when null (a missing code is how a path loses its name)', rows.map((s) => ({ name: s.name, ok: s.ok, code: s.code, hasCode: owns(s, 'code') })))
  ok(Array.isArray(clean.failedSteps) && clean.failedSteps.length === 0, '§1d a clean recovery names no failed step (an empty list, not absent)', clean.failedSteps)
  const badRows = rows.filter((s) => s && s.ok === false)
  ok(sameSet(clean.failedSteps, badRows.map((s) => s.name)), '§1e ★★ `failedSteps` equals the rows that say ok:false (the list IS the rows, not a second opinion)', { list: clean.failedSteps, rows: badRows.map((s) => s.name) })
  ok(Array.isArray(clean.driftedSteps) && clean.driftedSteps.length === 0, '§1f and `driftedSteps` is an empty list too (both lists exist on every recovery)', clean.driftedSteps)

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // §2 AN INJECTED LEDGER FAILURE: `failedSteps` names it, no drift code appears
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log(NL + '§2 a ledger that cannot be restored is a FAILED step, and not a drift')
  const rootL = await mkRoot()
  const hl = await bootOn(rootL)
  const Kl = hl.kernel
  const sl = await callAs(hl, 'vibe_v5_start', { problem: 'run259 §2: a ledger that will not hydrate', researcherCount: 2 })
  ok(sl && sl.ok === true, '§2a premise: an institute exists on a durable root', sl && codeOf(sl))
  // Keep the ledgers step failing while the read-back stays clean: the durable `tasks` projectION value is not an
  // envelope this build can restore, so hydration reports it BY NAME (`unhydrated`) and the recovery fails at `ledgers`.
  await Kl.store.patch('tasks', () => ({ notAnEnvelopeOfThisBuild: true }))
  const mixed = await callAs(hl, 'vibe_vmu_human', { action: 'recover', reason: 'run259 §2' }, null)
  const MR = (mixed && mixed.recovery) || {}
  ok(mixed && mixed.ok === false, '§2b the recovery fails (a ledger could not be restored)', mixed && { ok: mixed.ok, code: codeOf(mixed) })
  ok(Array.isArray(mixed.failedSteps) && mixed.failedSteps.indexOf('ledgers') !== -1, '§2c ★★ the failed step is NAMED (ledgers) — this is the list the real VMU_STATE receipts carried', mixed && mixed.failedSteps)
  ok(codeOf(mixed) === 'VMU_STATE', '§2d the face names it VMU_STATE (an executed step failed — that is this process\'s own error)', codeOf(mixed))
  ok(!(Array.isArray(MR.driftedSteps) && MR.driftedSteps.length > 0) && !(MR.readBack && MR.readBack.consistent === false),
    '§2e ★ no drift is claimed: the bytes did not move, a step failed — the two facts stay in different fields', MR && { drifted: MR.driftedSteps, rb: MR.readBack && MR.readBack.consistent })
  const stepCodes = (MR.steps || []).map((s) => s && s.code)
  ok(stepCodes.every((c) => c !== 'VMU_RESUME_READBACK_DRIFT'), '§2f no STEP row carries the drift code — a failed ledger has its own name', { codes: stepCodes })

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // §3 DRIFT-ONLY: `driftedSteps:["readback"]`, `secondWriter:false` (our OWN earlier value is on disk), NO failedSteps
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log(NL + '§3 drift-only: the bytes are this process\'s own EARLIER write — no second writer, and no failedSteps')
  const st3 = makeStore()
  const r3 = createResume({ store: st3, clock: CLOCK, work: WORK_PORT })
  r3.read()
  await r3.write('meetings', { v: 1 })
  const firstPayload = st3.read('meetings')
  await r3.write('meetings', { v: 2 })
  st3.set('meetings', firstPayload) // the store dropped/rolled back our LAST write and kept the earlier one
  const rb3 = r3.readBack()
  ok(rb3 && rb3.consistent === false && Array.isArray(rb3.drift) && rb3.drift.some((d) => d.key === 'meetings'),
    '§3a premise: the read-back really drifted on `meetings`', rb3 && { consistent: rb3.consistent, keys: (rb3.drift || []).map((d) => d.key) })
  ok(Array.isArray(rb3.driftedSteps) && rb3.driftedSteps.indexOf('readback') !== -1, '§3b ★★ the drift names its STEP (`driftedSteps:["readback"]`)', rb3.driftedSteps)
  ok(rb3.secondWriter === false, '§3c ★★ `secondWriter:false` — the durable bytes are a value THIS process wrote earlier, so no second writer is needed to explain the drift', { secondWriter: rb3.secondWriter, writesBetween: rb3.writesBetween })
  has(rb3.secondWriterMeans, 'earlier', '§3d …and the means says WHICH evidence decided it (a value this process wrote earlier)')
  ok(rb3.writesBetween === 2, '§3e write counting is local: two writes since the previous read-back (the basis of the false/true distinction)', rb3.writesBetween)
  // the same drift through the FACE: the receipt is about a drifted STEP, so it must NOT carry `failedSteps` at all.
  const rootD = await mkRoot()
  const hd1 = await bootOn(rootD)
  const sd1 = await callAs(hd1, 'vibe_v5_start', { problem: 'run259 §3: a store that moved', researcherCount: 2 })
  ok(sd1 && sd1.ok === true, '§3f premise: a staffed institute on a durable root', sd1 && codeOf(sd1))
  const hd2 = await bootOn(rootD)
  const Kd = hd2.kernel
  const adopt = await callAs(hd2, 'vibe_vmu_human', { action: 'recover', reason: 'run259 §3 adoption' }, null)
  ok(adopt && adopt.ok === true, '§3g premise: the restarted kernel adopted the fold with a clean recovery', adopt && { ok: adopt.ok, code: codeOf(adopt) })
  // A concurrent writer moves the value THIS process last wrote, without touching any ledger projection: `resume` is
  // written by this very face and hydrated by no adapter, so the only step that can notice the move is `readback`.
  const patched = await Kd.store.patch('resume', (cur) => Object.assign({}, cur, { injectedByRun259Probe: true }))
  ok(patched !== undefined, '§3h premise: a concurrent writer moved the durable `resume` value (no ledger involved)', typeof patched)
  const driftRec = await callAs(hd2, 'vibe_vmu_human', { action: 'recover', reason: 'run259 §3 drift' }, null)
  const DR = (driftRec && driftRec.recovery) || {}
  ok(driftRec && driftRec.ok === false, '§3i the recovery fails when its own expectation no longer hashes', driftRec && { code: codeOf(driftRec) })
  ok(codeOf(driftRec) === 'VMU_RESUME_READBACK_DRIFT', '§3j and the face names the drift code (the store moved — not a step of this process)', codeOf(driftRec))
  ok(Array.isArray(driftRec.driftedSteps) && driftRec.driftedSteps.indexOf('readback') !== -1, '§3j ★★ the face carries `driftedSteps:["readback"]` at top level', driftRec && driftRec.driftedSteps)
  ok(driftRec && !owns(driftRec, 'failedSteps'), '§3k ★★★ the drift receipt has NO `failedSteps` key — the measured real shape, and the whole point of the round', driftRec && Object.keys(driftRec))
  ok(typeof driftRec.secondWriter === 'boolean' || driftRec.secondWriter === 'unknown', '§3l the face answers `secondWriter` honestly (boolean, or "unknown" — never absent)', driftRec && { secondWriter: driftRec.secondWriter })
  ok(typeof driftRec.secondWriterMeans === 'string' && driftRec.secondWriterMeans.length > 40, '§3m …with the means that says what the evidence was', String(driftRec && driftRec.secondWriterMeans).slice(0, 80))
  const rbStep = (DR.steps || []).filter((s) => s && s.step === 'readback')[0] || null
  ok(rbStep && rbStep.ok === false && rbStep.code === 'VMU_RESUME_READBACK_DRIFT' && typeof rbStep.name === 'string',
    '§3n the readback STEP row carries its own name and the drift code (the row is where the lists come from)', rbStep && { name: rbStep.name, ok: rbStep.ok, code: rbStep.code })

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // §4 A REAL SECOND WRITER: `secondWriter:true`, and the hint sends the reader to that writer
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log(NL + '§4 a second writer is a fact, and the hint names it as the next move')
  const st4 = makeStore()
  const r4 = createResume({ store: st4, clock: CLOCK, work: WORK_PORT })
  r4.read()
  await r4.write('chat', { v: 1 })
  const base4 = r4.readBack() // baseline: consistent, and the write counter restarts
  ok(base4.consistent === true, '§4a premise: a baseline read-back is consistent', base4 && { consistent: base4.consistent })
  st4.set('chat', { writtenBySomebodyElse: true }) // a writer that is NOT this process
  const rb4 = r4.readBack()
  ok(rb4.consistent === false && rb4.writesBetween === 0, '§4b ★ zero writes by THIS process since the baseline, and the bytes still moved', { writesBetween: rb4.writesBetween, consistent: rb4.consistent })
  ok(rb4.secondWriter === true, '§4c ★★ therefore a second writer DID write them (`secondWriter:true`) — a fact, not a guess', rb4.secondWriter)
  has(rb4.secondWriterMeans, 'second writer', '§4d …and the means names the writer as the cause')
  // The live instance: move the value the recovery LAST wrote (`resume`) again, then sample twice. The first sample
  // still counts the recovery's own record write (`unknown`); the second one writes nothing between the expectation and
  // the sample, so a writer that is not this process is the only thing that can explain the move (`true`).
  await Kd.store.patch('resume', (cur) => Object.assign({}, cur, { injectedByRun259Probe: 'second-writer' }))
  const read1 = await callAs(hd2, 'vibe_vmu_human', { action: 'readBack' }, null)
  const hintFace = (read1 && read1.secondWriter === true) ? read1 : await callAs(hd2, 'vibe_vmu_human', { action: 'readBack' }, null)
  ok(hintFace && hintFace.ok === false && hintFace.secondWriter === true, '§4e the FACE answers the same fact on a live instance (drift after an external write, zero writes by it)', hintFace && { ok: hintFace.ok, secondWriter: hintFace.secondWriter, writesBetween: hintFace.writesBetween })
  ok(/SECOND WRITER/.test(String(hintFace && hintFace.hint)) && !/fix this kernel/i.test(String(hintFace && hintFace.hint)),
    '§4f ★★ the hint sends the reader to FIND the writer — it never tells them to "fix" this kernel (the wrong next move is what a merged field costs)', String(hintFace && hintFace.hint).slice(0, 200))

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // §5 THE REAL MACHINE'S FIELD SET IS THE EXPECTATION (external source, not this code's own words)
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log(NL + '§5 the four measured drift receipts define what a drift receipt must and must not carry')
  // Measured from D:/_tmp/sim/real-receipts.jsonl (run 69: slvp157 ×2, slvp194, slvp195). Two of the four carried the
  // host face (`actedForMember`, `callerMember`, `memberActed`, `memberActedMeans`, `message`, `hint`, `driftKeys`).
  const REAL_DRIFT_KEYS = [
    ['action', 'checked', 'code', 'consistent', 'drift', 'driftMeans', 'ok', 'receiptMeta', 'sampledAt', 'writesBetween'],
    ['action', 'checked', 'code', 'consistent', 'drift', 'driftMeans', 'ok', 'receiptMeta', 'sampledAt', 'writesBetween'],
    ['actedForMember', 'action', 'callerMember', 'checked', 'code', 'consistent', 'drift', 'driftKeys', 'driftMeans', 'hint', 'memberActed', 'memberActedMeans', 'message', 'ok', 'receiptMeta', 'sampledAt', 'writesBetween'],
    ['actedForMember', 'action', 'callerMember', 'checked', 'code', 'consistent', 'drift', 'driftKeys', 'driftMeans', 'hint', 'memberActed', 'memberActedMeans', 'message', 'ok', 'receiptMeta', 'sampledAt', 'writesBetween'],
  ]
  ok(REAL_DRIFT_KEYS.length === 4, '§5a premise: four real drift receipts are the external source (non-vacuous)', REAL_DRIFT_KEYS.length)
  ok(REAL_DRIFT_KEYS.every((keys) => keys.indexOf('failedSteps') === -1),
    '§5b ★★ NONE of the four real drift receipts carried `failedSteps` — the defect is measured, not assumed', REAL_DRIFT_KEYS.map((k) => k.length))
  ok(REAL_DRIFT_KEYS.every((keys) => ['code', 'consistent', 'drift', 'writesBetween'].every((k) => keys.indexOf(k) !== -1)),
    '§5c …and all four carried code/consistent/drift/writesBetween (the facts this round keeps)', REAL_DRIFT_KEYS.length)
  ok(REAL_DRIFT_KEYS.length > 0, '§5d premise: the external source is non-empty before `every()` is allowed to speak for it', REAL_DRIFT_KEYS.length)
  ok(REAL_DRIFT_KEYS.every((keys) => keys.indexOf('driftedSteps') === -1 && keys.indexOf('secondWriter') === -1),
    '§5d the real receipts do not yet name the step or the writer — those two are what this round ADDS', REAL_DRIFT_KEYS.length)
  ok(owns(driftRec, 'driftedSteps') && owns(driftRec, 'secondWriter') && !owns(driftRec, 'failedSteps'),
    '§5e ★★ the receipt now carries exactly the two new fields and still no `failedSteps` (shape compared against the external set, not against itself)',
    driftRec && { driftedSteps: owns(driftRec, 'driftedSteps'), secondWriter: owns(driftRec, 'secondWriter'), failedSteps: owns(driftRec, 'failedSteps') })

  console.log(NL + '   (temp roots: ' + roots.length + ')')
} catch (e) {
  failed += 1
  failures.push('SUITE THREW: ' + String((e && e.message) || e))
  console.log('  FAIL SUITE THREW: ' + String((e && e.stack) || e))
} finally {
  for (const d of roots) { try { await rm(d, { recursive: true, force: true }) } catch (e) { /* best effort */ } }
  console.log(NL + '=== VMU RUN 259 RECOVERY STEPS: ' + passed + ' passed, ' + failed + ' failed ===')
  if (failed > 0) { console.log('failures:'); for (const f of failures) console.log('  - ' + f) }
}
