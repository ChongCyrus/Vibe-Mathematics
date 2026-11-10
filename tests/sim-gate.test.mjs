// tests/sim-gate.test.mjs — TB-2605: the zero-token simulation becomes a PRIMARY gate.
//
// WHY THIS FILE EXISTS (every assertion traces to a defect that really happened in this repo)
//
//   · The unit suites each pin one slice. Twice in one week that was not enough: a product change made
//     `blueprint propose` stop filing the draft (TB-2613), the slice suites stayed green, and only a scenario
//     reproducing the WHOLE lifecycle noticed (mainline went exit 1 / actions-extra silently excused two refusals).
//     A gate that never runs the whole path cannot see a broken whole path.
//   · `receipts.jsonl` can be full of evidence while the prompt the member actually read said nothing (TB-2602).
//     So the gate checks the CORPUS SHAPE the runner produced, not just the exit code.
//   · A corpus that cannot be reproduced cannot be argued over. Two runs of the same input must agree: that is why
//     the last segment replays `end-to-end` twice under a frozen clock and a pinned workspace.
//   · The receipt audit A2 used to red on the English word "undefined" inside a sentence (10 findings, all prose):
//     a gate that fails on explanations teaches people to delete explanations. §1 proves the predicate in BOTH
//     directions - three real leak shapes red, prose green - so nobody can quietly weaken it later.
//
// WHAT THIS GATE IS NOT: it is not the 15-scenario contracts sweep (`tests/sim-scenario-contracts.test.mjs` owns
// that) and it does not touch a real machine. It answers one question fast: can the simulation still drive the
// whole lifecycle, produce an auditable corpus, and reproduce it?
//
// Budgets are MEASURED, not guessed (this repo's own rule: "a family budget is measured, never guessed"):
//   end-to-end        1.9 s   (gate-load amplification measured on this tree: +15 % at T1 concurrency 3)
//   meeting-matrix   12.9-17.0 s INSIDE this gate (standalone 8.4 s); the 17.0 s reading is contention from a heavy peer
//                    in the same wave (k=3), so the baseline is the concurrent maximum, not the quiet cost (see the doc)
//   audit/all        43-58 s quiet, 75.0 s under T1 concurrency 3 (measured: 75.03 s, the run that raised this cap)
//   determinism pair  2 x 1.9 s
//   => the three named segments sum to ~90 s quiet against the 150 s total backstop; audit/all's OWN segment cap is
//      150 s because this gate is itself one of T1's k=3 concurrent jobs. A timeout is a FAILURE that names the
//      segment: never a skip. Raising a cap does NOT relax the drift judgement below (drift=1.25, floor=1500 ms).
//
// A CAP ALONE IS NOT A JUDGEMENT (TB-2609 addendum): a slow machine would silently eat the headroom and nobody would
// learn that the gate got 40 % dearer. So each segment is ALSO compared against the baseline measured on this tree
// and written into docs/acceptance/sim-gate-scope.md; the reading may not exceed BASELINE_MS[name] x DRIFT_FACTOR.
// Drift is reported per segment with the excess in ms, and it is a red gate (not a warning): if the gate really
// became slower, either the code changed or the machine is competing -- both are facts someone must look at.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { requireFile } from './_lib/require-file.mjs'

// TB-2677: the checkout is derived from this file (a test that only runs on the author machine is not a gate).
const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '')
// Per-process scratch dir, NOT a shared constant: two gates running at once (a full T1 next to a hand-run gate, which
// is exactly what happened when one run finished in 13.6 s) would otherwise rm each other's corpora mid-flight and
// manufacture red or absurdly fast readings. Unique dirs make concurrency a scheduling question, not a correctness one.
const TMP = join(tmpdir(), 'sim-gate-' + process.pid)
const KEEP = process.env.SIM_KEEP_CORPUS === '1'
const NL = String.fromCharCode(10)

const SEG_MS = { e2e: 15000, meetingMatrix: 45000, auditAll: 150000, determinism: 15000 } // audit/all: quiet 43-58 s but 75.03 s under T1 k=3 concurrency, where THIS gate is one of the k
const THREE_SEGMENT_BUDGET_MS = 150000 // measured total 75.6 s (2026-11-09 19:44 quiet window): the cap is headroom for a busy machine, not a target
// The DRIFT check, not the cap, is what notices a real slowdown. Its baseline is READ FROM THE DOC, not kept here:
// a constant in the test file would let the gate and docs/acceptance/sim-gate-scope.md disagree about what "normal"
// means, which is exactly the silent cost growth this rule exists to catch.
//
// THE ALLOWANCE HAS TWO TERMS, and neither one is an exemption:
//   baseline x driftFactor  -> the COST rule: the gate may not get 25 % dearer without someone being told.
//   baseline + floorMs      -> the SCHEDULING-NOISE rule for sub-5 s segments: on a shared machine a 2.7 s run swings
//                              by ~1 s, so 1.25x of it is ±665 ms and would flip a green gate red at random. The floor
//                              is absolute, so it can never loosen a ~57 s segment: max(1.25 x 56.7 s, 56.7 s + 1.5 s) = 70.9 s.
// Both are applied as `allowed = max(baseline * driftFactor, baseline + floorMs)`; a segment is a finding only when it
// costs MORE than that. The floor defaults to 1500 ms and is read from the same doc line, so the doc and the gate still
// cannot disagree.
const SCOPE_DOC = join(REPO, 'docs/acceptance/sim-gate-scope.md')

// Pure so the self-proof can feed it measurements instead of re-running the world. `spec` is the parsed
// `gate-baselines` line; `segments` is `[{name, elapsed}]`. Returns the per-segment rows, the segments with no
// documented baseline, and the findings (segments that exceeded their allowance).
function driftFindings(segments, spec) {
  const factor = Number.isFinite(spec.drift) ? spec.drift : 1.25
  const floorMs = Number.isFinite(spec.floor) ? spec.floor : 1500
  const rows = segments.map((s) => {
    const base = Number.isFinite(spec[s.name]) && spec[s.name] > 0 ? spec[s.name] : null
    const allowed = base === null ? null : Math.max(base * factor, base + floorMs)
    return {
      name: s.name,
      elapsed: s.elapsed,
      baseline: base,
      allowed: allowed === null ? null : Math.round(allowed),
      ratio: base === null ? null : Math.round((s.elapsed / base) * 100) / 100,
      excess: allowed === null ? null : Math.round(s.elapsed - allowed),
    }
  })
  return {
    rows,
    factor,
    floorMs,
    unbaselined: rows.filter((r) => r.baseline === null).map((r) => r.name),
    drifted: rows.filter((r) => r.allowed !== null && r.elapsed > r.allowed),
  }
}

let passed = 0
let failed = 0
const failures = []

function ok(condition, label, detail) {
  if (condition) {
    passed += 1
    console.log('  ok   ' + label)
  } else {
    failed += 1
    failures.push({ label, detail })
    console.log('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 900)))
  }
}

function sha256(text) {
  return 'sha256:' + createHash('sha256').update(text).digest('hex')
}
function readText(file) {
  // Every caller reads an artifact this gate JUST produced (a segment's corpus/REPORT/AUDIT.md) or a repo source it
  // pins. A missing file must be a NAMED refusal ("REQUIRED FILE MISSING: …"), never a silent '' that lets the next
  // comparison pass against nothing. (audit-no-silent-reads.test.mjs flags the old try/catch-to-null shape by name.)
  return requireFile(file, 'the gate reads an artifact it just produced, or a repo source it pins by content')
}
function readJson(file, fallback = null) {
  const text = readText(file)
  try { return JSON.parse(text) } catch { return fallback }
}
function readJsonl(file) {
  const text = readText(file)
  return text.split(NL).filter((line) => line.trim() !== '').map((line) => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
}

/** One segment: its own clock, its own timeout, and a name in every failure message. */
const segments = []
function runSegment(name, budgetMs, body) {
  const startedAt = Date.now()
  const outcome = body()
  const elapsed = Date.now() - startedAt
  const timedOut = outcome !== null && outcome !== undefined && outcome.timedOut === true
  segments.push({ name, elapsed, budgetMs, timedOut })
  ok(!timedOut, 'segment ' + name + ' finished within its ' + budgetMs + ' ms budget', timedOut ? { elapsed, budgetMs } : undefined)
  ok(elapsed <= budgetMs, 'segment ' + name + ' elapsed ' + elapsed + ' ms <= ' + budgetMs + ' ms', { name, elapsed, budgetMs })
  return outcome
}

/** Spawn one node process; a timeout is reported, never swallowed. `env` is merged over the inherited environment. */
function spawnNode(args, timeoutMs, env) {
  const startedAt = Date.now()
  const options = { cwd: REPO, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }
  if (env) options.env = Object.assign({}, process.env, env)
  const result = spawnSync(process.execPath, args, options)
  const elapsed = Date.now() - startedAt
  const timedOut = Boolean(result.error && result.error.code === 'ETIMEDOUT')
  return { status: result.status, signal: result.signal, timedOut, elapsed, stdout: result.stdout || '', stderr: result.stderr || '' }
}

function rmrf(dir) {
  try { rmSync(dir, { recursive: true, force: true }) } catch (e) { /* nothing left to clean */ }
}

// ── 0) preflight ─────────────────────────────────────────────────────────────────────────────────────────────────
console.log('== sim gate (TB-2605)')
console.log('   repo: ' + REPO)
rmrf(TMP)
mkdirSync(TMP, { recursive: true })

ok(existsSync(join(REPO, 'scripts', 'sim', 'run.mjs')), 'the runner exists at scripts/sim/run.mjs')
ok(existsSync(join(REPO, 'scripts', 'sim', 'audit', 'all.mjs')), 'the audit suite exists at scripts/sim/audit/all.mjs')
const nodeMajor = Number(String(process.versions.node).split('.')[0])
ok(nodeMajor >= 20, 'node ' + process.versions.node + ' supports --import (>= 20.6)', { node: process.versions.node })

// ── 1) the audit's own predicate, proved in both directions ─────────────────────────────────────────────────────
// A2's subject is a VALUE, not a word. If this section ever goes green with the old substring predicate, the gate
// stops being able to tell "a field was serialised as a placeholder" from "a sentence used the word undefined".
const AUDIT = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'audit', 'receipts.mjs')).href)
const { leaks } = AUDIT.__test
const LEAK_POSITIVES = [
  { note: 'undefined' },
  { owner: { id: '[object Object]' } },
  { produced: 'NaN' },
  { json: '{"id": undefined}' },
]
const PROSE = 'rows whose `track` is undefined are excluded by default'
// The sentence moved from host.js to kernel/records.js in a product refactor; the fixture must follow the file that
// SHIPS it today, otherwise this proof silently stops being about real product prose.
const proseSource = ['vibe-math-vmu/host.js', 'vibe-math-vmu/kernel/records.js']
  .map((rel) => ({ rel, text: readText(join(REPO, rel)) || '' }))
  .find((entry) => entry.text.includes(PROSE)) || null
ok(proseSource !== null, 'the prose fixture is the sentence the product really ships (located in source)', { prose: PROSE })
ok(leaks({ note: PROSE }).length === 0, 'A2: prose that uses the word undefined stays GREEN', leaks({ note: PROSE }))
ok(LEAK_POSITIVES.length >= 3, 'precondition: there are leak fixtures to inject (an empty fixture list would pass this whole block overwhelmingly)', LEAK_POSITIVES.length)
for (const fixture of LEAK_POSITIVES) {
  const found = leaks(fixture)
  ok(found.length > 0, 'A2: leak shape ' + JSON.stringify(fixture) + ' is named as a leak', found)
}
// And prove the audit pipeline (not just the helper) files it as an A2 finding with tool + field named.
const fixtureCorpus = join(TMP, 'leak-fixture')
mkdirSync(join(fixtureCorpus, 'steps'), { recursive: true })
const fixtureRows = LEAK_POSITIVES.map((value, i) => ({ seq: i + 1, tool: 'vibe_v5_probe', as: null, args: { i }, receipt: Object.assign({ ok: true }, value) }))
writeFileSync(join(fixtureCorpus, 'receipts.jsonl'), fixtureRows.map((row) => JSON.stringify(row)).join(NL) + NL)
writeFileSync(join(fixtureCorpus, 'manifest.json'), JSON.stringify({ scenario: 'leak-fixture' }))
const fixtureReport = AUDIT.audit(fixtureCorpus)
const a2 = fixtureReport.findings.filter((f) => f.check === 'A2')
ok(a2.length > 0 && a2.length === LEAK_POSITIVES.length, 'A2 names every injected leak (' + LEAK_POSITIVES.length + ') through the audit entry point', { a2: a2.length, findings: fixtureReport.findings.slice(0, 4) })
ok(a2.every((f) => f.tool === 'vibe_v5_probe'), 'A2 findings name the tool that produced the value', a2.map((f) => f.tool))
ok(a2.every((f) => Array.isArray(f.leaks) && f.leaks.length > 0 && typeof f.leaks[0].path === 'string'), 'A2 findings name the field path inside the receipt', a2.map((f) => f.leaks))

const proseCorpus = join(TMP, 'prose-fixture')
mkdirSync(join(proseCorpus, 'steps'), { recursive: true })
writeFileSync(join(proseCorpus, 'receipts.jsonl'), JSON.stringify({ seq: 1, tool: 'vibe_vmu_records', as: null, args: {}, receipt: { ok: true, note: PROSE } }) + NL)
writeFileSync(join(proseCorpus, 'manifest.json'), JSON.stringify({ scenario: 'prose-fixture' }))
const proseReport = AUDIT.audit(proseCorpus)
ok(proseReport.findings.filter((f) => f.check === 'A2').length === 0, 'A2 leaves a corpus full of explanatory prose GREEN', proseReport.findings.slice(0, 4))

// ── 2) segment one: the whole lifecycle, once, on the real kernel ───────────────────────────────────────────────
const OUT_E2E = join(TMP, 'corpus-e2e')
const e2eRun = runSegment('end-to-end', SEG_MS.e2e, () => spawnNode(['scripts/sim/run.mjs', '--scenario', 'end-to-end', '--out', OUT_E2E], SEG_MS.e2e))
ok(e2eRun.status === 0, 'end-to-end exits 0 (a shipped scenario that cannot finish is a gate failure, not a warning)', { status: e2eRun.status, stderr: e2eRun.stderr.slice(-600) })
// ★ TB-2648 §7 MIXED-GEN — the gate reads pairs.jsonl, receipts.jsonl and prompts/ as ONE corpus. Prove they came from
// one run BEFORE comparing anything: otherwise a red gate could be describing the runner's write order (or a previous
// generation's files) rather than the code under test. The criterion is byte equality with the generator's recorded
// digests; `MIXED-GEN CORPUS` in the message is the verdict token.
const { checkCorpus: checkCorpusGeneration } = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'corpus-stamp.mjs')).href)
const e2eGeneration = checkCorpusGeneration(OUT_E2E)
ok(e2eGeneration.ok, 'the e2e corpus is ONE generation: manifest digests == bytes on disk (a mixed corpus is not comparable)', e2eGeneration)
const e2eManifest = readJson(join(OUT_E2E, 'manifest.json'), {}) || {}
const e2eReceipts = readJsonl(join(OUT_E2E, 'receipts.jsonl'))
const e2eReport = readText(join(OUT_E2E, 'REPORT.md')) || ''
ok(e2eManifest.scenario === 'end-to-end', 'the corpus records which scenario made it', { scenario: e2eManifest.scenario })
ok(Number.isInteger(e2eManifest.receipts) && e2eManifest.receipts >= 40, 'end-to-end wrote >= 40 real receipts (measured 45)', { receipts: e2eManifest.receipts })
ok(e2eReceipts.length === e2eManifest.receipts, 'the receipt file agrees with the manifest count', { file: e2eReceipts.length, manifest: e2eManifest.receipts })
ok(e2eManifest.refusals && e2eManifest.refusals.mechanism === 0, 'zero MECHANISM refusals (an unexpected refusal is a defect)', e2eManifest.refusals)
ok(e2eManifest.refusals && e2eManifest.refusals.advisory === 0, 'zero ADVISORY matches (no prediction was spent twice)', e2eManifest.refusals)
ok(e2eManifest.selfChecks && e2eManifest.selfChecks.failed === 0, 'the scenario in-file contract checks all passed', e2eManifest.selfChecks)
ok(e2eManifest.pairs && e2eManifest.pairs.rows >= 40, 'the paired corpus has >= 40 rows (measured 47)', e2eManifest.pairs && { rows: e2eManifest.pairs.rows })
ok(e2eManifest.pairs && e2eManifest.pairs.files === e2eManifest.pairs.rows, 'every pair has its prompt file on disk', e2eManifest.pairs)
ok(e2eManifest.pairs && e2eManifest.pairs.unpaired === 0, 'no receipt was silently left unpaired', e2eManifest.pairs && e2eManifest.pairs.unpairedSeqs)
ok(e2eReport.includes('## pairs ('), 'REPORT.md carries the pairs section a reader can audit', { reportChars: e2eReport.length })
ok(e2eReport.includes('predicted refusals:'), 'REPORT.md states the predicted-refusal ledger (pinned/inferred/advisory)', {})
const promptFiles = (() => { try { return readdirSync(join(OUT_E2E, 'prompts')).filter((f) => f.endsWith('.txt')) } catch { return [] } })()
ok(promptFiles.length >= 6, 'the corpus contains the prompts the seats really read (>= 6)', { promptFiles: promptFiles.length })
const e2eAudit = AUDIT.audit(OUT_E2E)
ok(e2eAudit.findings.length === 0, 'the receipt audit finds nothing in the corpus the gate just produced', e2eAudit.findings.slice(0, 6))
const finalReceipt = e2eReceipts.filter((r) => r.receipt && r.receipt.final && r.receipt.final.finalized === true)
ok(finalReceipt.length === 1, 'the lifecycle really REACHED the end (one final, finalized)', { found: finalReceipt.length })
const finalBody = finalReceipt.length ? finalReceipt[0].receipt.final : {}
ok(Array.isArray(finalBody.toolchainAbsent) && finalBody.toolchainAbsent.includes('latex'), 'the missing PDF toolchain is NAMED in the final receipt (environment, not a silent gap)', finalBody.toolchainAbsent)
ok(finalBody.pdfEnvironmentMissing === true, 'the corpus records the PDF path as an environment absence', { pdfEnvironmentMissing: finalBody.pdfEnvironmentMissing })

// ── 2b) the pairs promise must BITE: every receipt text sits in its next prompt byte-for-byte ────────────────────
// The corpus says "the seat really read this". That claim is only worth something if the check that makes it can
// fail. So the section first verifies every shipped row, then shifts ONE span by one byte in a copy and requires the
// check to name exactly that row - a span check that never fails is a comment.
const e2ePairs = readJsonl(join(OUT_E2E, 'pairs.jsonl'))
// A row carries a span only when the receipt text really occurs in the next prompt (`containsReceipt`); a corpus
// where every row claimed a span would be suspicious, so the check is: span => byte-identical, no span => the row
// must say so. Both directions are asserted.
const spanFailures = (rows) => {
  const bad = []
  for (const row of rows) {
    const prompt = row.nextPrompt && row.nextPrompt.text
    const span = row.receiptSpan
    if (!span) {
      if (row.containsReceipt === true) bad.push({ pairIndex: row.pairIndex, why: 'claims containsReceipt but has no span' })
      continue
    }
    if (typeof prompt !== 'string' || !Number.isInteger(span.start) || !Number.isInteger(span.end)) {
      bad.push({ pairIndex: row.pairIndex, why: 'span without prompt text or with non-integer offsets' })
      continue
    }
    const slice = prompt.slice(span.start, span.end)
    if (slice !== row.receiptText) bad.push({ pairIndex: row.pairIndex, start: span.start, end: span.end, got: slice.slice(0, 60), want: String(row.receiptText).slice(0, 60) })
  }
  return bad
}
ok(e2ePairs.length >= 40, 'the pairing file has one row per receipt (>= 40)', { rows: e2ePairs.length })
const spannedPairs = e2ePairs.filter((row) => Boolean(row.receiptSpan))
ok(spannedPairs.length >= 5, 'at least five receipts are literally present in the prompt the seat read (measured 7)', { spanned: spannedPairs.length })
const shippedSpanBad = spanFailures(e2ePairs)
ok(shippedSpanBad.length === 0, 'every receipt text with a span is found byte-for-byte inside the next prompt', shippedSpanBad.slice(0, 3))
const shiftTarget = spannedPairs.length > 0 ? spannedPairs[0] : null
// Guarded, not assumed: if a corpus carried no span at all the assertion above is already red, and this check must
// report that fact instead of dying on `undefined.receiptSpan` and taking the rest of the gate (drift included) down.
const shifted = shiftTarget === null ? e2ePairs : e2ePairs.map((row) => (row === shiftTarget ? Object.assign({}, row, { receiptSpan: { start: row.receiptSpan.start, end: row.receiptSpan.end + 1 } }) : row))
const shiftedBad = shiftTarget === null ? [] : spanFailures(shifted)
ok(shiftTarget !== null && shiftedBad.length === 1 && shiftedBad[0].pairIndex === shiftTarget.pairIndex, 'a one-byte span shift is caught on exactly that row', { target: shiftTarget === null ? null : shiftTarget.pairIndex, bad: shiftedBad.slice(0, 3) })

// ── 2c) the refusal ledger must BITE: one blanket declaration cannot forgive a whole scenario ─────────────────────
// TB-2601's ledger is the reason a prediction is a quota, not a pardon. The proof is a scenario COPY whose
// `expectedRefusals` is reduced to a single wildcard `{}` (the shape an earlier version would have accepted as a
// blanket excuse). Under the ledger the first refusal spends it and the rest are reported as advisory matches, so
// the run must exit 1; under the old substring/predicate matcher the same corpus exits 0. The shipped file is not
// edited: the copy lives in the temp tree and run.mjs is pointed at it with SIM_SCEN_DIR.
const MUT_SCEN = join(TMP, 'mut-scenarios')
const OUT_BLANKET = join(TMP, 'corpus-blanket')
const shippedRefusals = readText(join(REPO, 'scripts/sim', 'scenarios', 'refusals.mjs')) || ''
const blanketSource = shippedRefusals
  .replace('const expectedRefusals = []', 'const expectedRefusals = [{}]')
  .replace('expectedRefusals.push({ tool, code: out.code, why })', 'void 0')
ok(blanketSource !== shippedRefusals && blanketSource.includes('expectedRefusals = [{}]'), 'the blanket mutation changed the copy (otherwise the next assertion proves nothing)', { bytes: blanketSource.length })
mkdirSync(MUT_SCEN, { recursive: true })
writeFileSync(join(MUT_SCEN, 'refusals-blanket.mjs'), blanketSource)
const blanketRun = spawnNode(['scripts/sim/run.mjs', '--scenario', 'refusals-blanket', '--out', OUT_BLANKET], SEG_MS.e2e, { SIM_SCEN_DIR: MUT_SCEN })
const blanketManifest = readJson(join(OUT_BLANKET, 'manifest.json'), {}) || {}
const blanketLedger = blanketManifest.refusals || {}
ok(blanketRun.status !== 0, 'one blanket expectedRefusals declaration does NOT forgive a whole scenario (exit != 0)', { status: blanketRun.status, ledger: blanketLedger, stderr: blanketRun.stderr.slice(-400) })
ok(blanketLedger.advisory > 0 || blanketLedger.unpredicted > 0, 'the ledger names the extra refusals instead of pardoning them (advisory/unpredicted > 0)', blanketLedger)

// ── 3) segment two: the meeting matrix, a different slice of the same kernel ───────────────────────────────────
const OUT_MM = join(TMP, 'corpus-meeting-matrix')
const mmRun = runSegment('meeting-matrix', SEG_MS.meetingMatrix, () => spawnNode(['scripts/sim/run.mjs', '--scenario', 'meeting-matrix', '--out', OUT_MM], SEG_MS.meetingMatrix))
ok(mmRun.status === 0, 'meeting-matrix exits 0', { status: mmRun.status, stderr: mmRun.stderr.slice(-600) })
const mmManifest = readJson(join(OUT_MM, 'manifest.json'), {}) || {}
ok(mmManifest.refusals && mmManifest.refusals.mechanism === 0, 'meeting-matrix has zero mechanism refusals', mmManifest.refusals)
ok(Number.isInteger(mmManifest.receipts) && mmManifest.receipts >= 80, 'meeting-matrix wrote >= 80 receipts (measured 89)', { receipts: mmManifest.receipts })
ok(mmManifest.pairs && mmManifest.pairs.rows >= 100, 'meeting-matrix produced the paired corpus too (measured 115 rows)', mmManifest.pairs && { rows: mmManifest.pairs.rows })
ok(mmManifest.selfChecks && mmManifest.selfChecks.failed === 0, 'meeting-matrix in-file contract checks passed', mmManifest.selfChecks)

// ── 4) segment three: the audit suite over every scenario (rule coverage, action coverage, fidelity) ──────────
const OUT_AUDIT = join(TMP, 'audit')
const auditRun = runSegment('audit/all', SEG_MS.auditAll, () => spawnNode(['scripts/sim/audit/all.mjs', '--out', OUT_AUDIT], SEG_MS.auditAll))
const auditReport = readText(join(OUT_AUDIT, 'AUDIT.md')) || ''
const auditLines = auditReport.split(NL)
const auditFails = auditLines.filter((line) => line.trim().startsWith('FAIL ') || line.startsWith('  FAIL '))
ok(auditRun.status === 0, 'audit/all exits 0 (scenarios + A1-A5 + rule coverage + action coverage + fidelity)', { status: auditRun.status, fails: auditFails.slice(0, 6), stderr: auditRun.stderr.slice(-600) })
ok(auditReport.length > 2000, 'audit/all wrote its report (AUDIT.md)', { chars: auditReport.length })
for (const heading of ['## 1. scenarios', '## 2. receipt audit', '## 3. rule coverage', '## 4. action coverage', '## 5. fidelity']) {
  ok(auditReport.includes(heading), 'AUDIT.md contains the section "' + heading + '"', { heading })
}
ok(!auditReport.includes('AUDIT: FAIL'), 'AUDIT.md does not end on a FAIL verdict', auditFails.slice(0, 6))
ok(auditReport.includes('- end-to-end: OK'), 'AUDIT.md counts end-to-end as OK', {})
ok(auditReport.includes('- meeting-matrix: OK'), 'AUDIT.md counts meeting-matrix as OK', {})

// WARNINGS ARE DEBT, NOT DECORATION (audit14-p2-1-stale-declaration-keys, lead ruling 2026-11-09): a declaration key
// that no longer absorbs a gap means the exemption outlived the fact it was written for — and the NEXT drift would hide
// under it. The audit reports that as a WARN (`fidelity declarations that name keys which are no longer gaps`), so the
// gate reads the machine-readable verdict block and requires warnings === 0. Closing the gate with a WARN still lit is
// exactly the "known red" this project keeps out of gates.
const auditBlock = (() => {
  const match = auditReport.match(/```json audit-report\n([\s\S]*?)\n```/)
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
})()
const auditWarns = auditLines.filter((line) => line.trim().startsWith('WARN'))
ok(auditBlock !== null, 'AUDIT.md carries a machine-readable audit-report block', { chars: auditReport.length })
ok(auditBlock && auditBlock.checks && auditBlock.checks.warnings === 0, 'audit warnings are 0: a stale declaration key is debt, not a note', auditWarns.slice(0, 6))

// ── 5) the replay segment: same input twice must produce the same corpus ──────────────────────────────────────
// The corpus is produced twice from a pinned clock and a wiped workspace, then compared. The product USED to mint
// `consult-<seq4>-<rand4>` from Math.random and every content hash downstream of that id moved with it; TB-2634
// replaced that with a deterministic FNV-1a digest (kit/paper.js), so the ids are now a REPLAYABLE fact rather than a
// declared uncertainty. The replay still pins the clock (and the seeded Math.random, as a belt-and-braces guard for
// the four named survivors), and the normalization below stays as a safety net. A single unexplained byte still
// fails: `unexplainedDiff` returns null only when every difference is one of the declared substitutions. On top of
// that, the id sequences themselves are compared raw (below), so a reintroduced random id cannot hide inside the
// normalization -- that is the assertion the old "random ids exist" check was silently standing in for.
const FREEZE = join(TMP, 'freeze-replay.mjs')
writeFileSync(FREEZE, [
  'const ZERO = 1_800_000_000_000',
  'const RealDate = Date',
  'class FixedDate extends RealDate {',
  '  constructor(...args) { if (args.length === 0) super(ZERO); else super(...args) }',
  '  static now() { return ZERO }',
  '}',
  'globalThis.Date = FixedDate',
  'try { performance.now = () => 0 } catch (e) {}',
  'let seed = 0x2f6e2b1',
  'const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }',
  'Math.random = rnd',
  '',
].join(NL))
const freezeUrl = pathToFileURL(FREEZE).href
const DET_ROOT = join(TMP, 'det-ws')
const DET_A = join(TMP, 'det-a')
const DET_B = join(TMP, 'det-b')
const replay = runSegment('determinism', SEG_MS.determinism, () => {
  const first = spawnNode(['--import', freezeUrl, 'scripts/sim/run.mjs', '--scenario', 'end-to-end', '--out', DET_A, '--root', DET_ROOT], SEG_MS.determinism)
  if (first.status !== 0) return first
  rmrf(DET_ROOT)
  return spawnNode(['--import', freezeUrl, 'scripts/sim/run.mjs', '--scenario', 'end-to-end', '--out', DET_B, '--root', DET_ROOT], SEG_MS.determinism)
})
ok(replay.status === 0, 'the frozen replay ran twice and both runs exited 0', { status: replay.status, stderr: replay.stderr.slice(-600) })
const replayManifest = readJson(join(DET_A, 'manifest.json'), {}) || {}
// `stamp` in run.mjs is `new Date().toISOString().replace(/[:.]/g, '-')`, so a frozen clock shows up as this exact
// string. The colon-free form is asserted (not a prefix) because it also proves nothing else re-stamped the manifest.
ok(replayManifest.startedAt === '2027-01-15T08-00-00-000Z', 'the replay clock really was frozen (manifest.startedAt is the pinned instant)', { startedAt: replayManifest.startedAt })
const CONSULT_ID = /consult-\d{4}-[0-9a-f]{4}/g
const HASH = /sha256:[0-9a-f]{64}/g
const BARE_HASH = /"[0-9a-f]{64}"/g
const normalize = (text) => text.replace(CONSULT_ID, 'consult-NNNN-XXXX').replace(HASH, 'sha256:HASH').replace(BARE_HASH, '"HASH"')
/** null when the two texts differ ONLY by the two declared product facts; otherwise the first unexplained offset. */
function unexplainedDiff(a, b) {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return null
  let at = 0
  while (at < Math.min(na.length, nb.length) && na[at] === nb[at]) at += 1
  return { at, a: na.slice(Math.max(0, at - 80), at + 80), b: nb.slice(Math.max(0, at - 80), at + 80) }
}
const replayPromptsA = readText(join(DET_A, 'prompts.jsonl')) || ''
const replayPromptsB = readText(join(DET_B, 'prompts.jsonl')) || ''
ok(replayPromptsA.length > 1000 && replayPromptsA === replayPromptsB, 'replay: prompts.jsonl is BYTE-identical between the two runs (no substitution needed)', { shaA: sha256(replayPromptsA).slice(0, 20), shaB: sha256(replayPromptsB).slice(0, 20) })
const replayPairsA = readText(join(DET_A, 'pairs.jsonl')) || ''
const replayPairsB = readText(join(DET_B, 'pairs.jsonl')) || ''
const pairsDiff = unexplainedDiff(replayPairsA, replayPairsB)
ok(replayPairsA.length > 1000, 'replay: pairs.jsonl exists and is non-trivial', { bytes: replayPairsA.length })
ok(pairsDiff === null, 'replay: pairs.jsonl differs ONLY by the declared product facts (random consult ids + their hashes)', pairsDiff === null ? undefined : pairsDiff)
const replayReceiptsA = readText(join(DET_A, 'receipts.jsonl')) || ''
const replayReceiptsB = readText(join(DET_B, 'receipts.jsonl')) || ''
const receiptsDiff = unexplainedDiff(replayReceiptsA, replayReceiptsB)
ok(receiptsDiff === null, 'replay: receipts.jsonl differs ONLY by the declared product facts', receiptsDiff === null ? undefined : receiptsDiff)
// TB-2634 (md-lane) made the id deterministic: `vibe-math-vmu/kit/paper.js` mints `consult-<seq4>-<hash4>` with an
// FNV-1a digest and the only remaining `Math.random` call sites are the four named survivors. So the old assertion --
// "the corpus contains RANDOM ids, therefore it was really run" -- now describes a shape the product no longer has,
// and its name would send the next reader looking for randomness that is gone. The replacement keeps the teeth the
// old one had (a hand-written corpus cannot satisfy it either) by asking the question that is still answerable: do
// TWO separate runs, from a pinned clock and a wiped workspace, mint the SAME ids in the SAME order? A reintroduced
// Math.random makes the two id sequences diverge and turns this red; a fabricated corpus that never ran the paper
// path has no ids at all and turns the first line red.
const consultIdsOf = (text) => text.match(CONSULT_ID) || []
const consultIdsA = consultIdsOf(replayPairsA)
const consultIdsB = consultIdsOf(replayPairsB)
ok(consultIdsA.length > 0, 'replay: the corpus does contain consult ids (measured, not assumed)', { ids: consultIdsA.length, sample: consultIdsA.slice(0, 3) })
ok(consultIdsA.join(NL) === consultIdsB.join(NL), 'replay: the two runs mint the SAME consult ids in the same order -- the id is deterministic (TB-2634), so a reintroduced Math.random turns this red', { a: consultIdsA.slice(0, 4), b: consultIdsB.slice(0, 4), countA: consultIdsA.length, countB: consultIdsB.length })
ok(sha256(normalize(replayPairsA)) === sha256(normalize(replayPairsB)), 'replay: the normalized pairs corpus has one sha256, so a future divergence is a red gate', { normalizedSha: sha256(normalize(replayPairsA)).slice(0, 20) })

// ── 6) the budget is a gate too ────────────────────────────────────────────────────────────────────────────────
const threeSegments = segments.filter((s) => s.name === 'end-to-end' || s.name === 'meeting-matrix' || s.name === 'audit/all')
const threeTotal = threeSegments.reduce((sum, s) => sum + s.elapsed, 0)
ok(threeSegments.length === 3, 'the three named segments all ran (none skipped, none replaced)', threeSegments.map((s) => s.name))
ok(threeSegments.every((s) => s.timedOut === false), 'no segment timed out (a timeout is a failure that names the segment)', threeSegments.filter((s) => s.timedOut))
ok(threeTotal < THREE_SEGMENT_BUDGET_MS, 'the three segments together cost ' + threeTotal + ' ms < ' + THREE_SEGMENT_BUDGET_MS + ' ms budget', { threeTotal, budget: THREE_SEGMENT_BUDGET_MS, segments: threeSegments })
ok(segments.some((s) => s.name === 'determinism'), 'the replay segment ran as part of this gate', segments.map((s) => s.name))

// Drift: measured here, judged against docs/acceptance/sim-gate-scope.md. A segment may cost up to driftFactor x its
// documented baseline; past that the message names the segment and the excess in ms, because "the gate got slower"
// is useless until someone knows WHICH part got slower. This is a red gate, not a warning: either the code changed
// or the machine is competing, and both are facts a reader must be told before trusting a green run.
const scopeText = readText(SCOPE_DOC) || ''
const baselineMatch = /<!--\s*gate-baselines:\s*([^>]+?)\s*-->/.exec(scopeText)
const baselineSpec = baselineMatch === null ? {} : Object.fromEntries(
  (baselineMatch[1] || '').trim().split(/\s+/).filter(Boolean).map((pair) => {
    const at = pair.indexOf('=')
    return at < 0 ? [pair, NaN] : [pair.slice(0, at), Number(pair.slice(at + 1))]
  }),
)
const driftFactor = Number.isFinite(baselineSpec.drift) ? baselineSpec.drift : 1.25
const driftFloorMs = Number.isFinite(baselineSpec.floor) ? baselineSpec.floor : 1500
ok(baselineMatch !== null, 'the documented baseline line exists in docs/acceptance/sim-gate-scope.md', { found: baselineMatch === null ? null : baselineMatch[0] })
ok(Number.isFinite(baselineSpec.floor) && baselineSpec.floor > 0, 'the documented line carries the sub-5 s noise floor (floor=<ms>), so doc and gate agree on the second allowance term', { floor: baselineSpec.floor, factor: baselineSpec.drift })
const drift = driftFindings(segments.map((s) => ({ name: s.name, elapsed: s.elapsed })), baselineSpec)
ok(drift.unbaselined.length === 0, 'every segment this gate ran has a documented baseline to drift against', { unbaselined: drift.unbaselined, names: drift.rows.map((r) => r.name) })
ok(drift.drifted.length === 0, 'no segment drifted past its documented allowance (baseline x ' + driftFactor + ', floored at baseline + ' + driftFloorMs + ' ms)' + (drift.drifted.length === 0 ? '' : ' -- ' + drift.drifted.map((d) => d.name + ': ' + d.elapsed + ' ms vs baseline ' + d.baseline + ' ms (allowed ' + d.allowed + ' ms, ' + d.excess + ' ms over)').join('; ')), { drift: drift.rows, driftFactor, driftFloorMs })

// ── 6b) the drift rule's own self-proof: does the floor still let the COST rule bite? ───────────────────────────
// Two proofs are needed, and neither may be a tautology:
//   (i)  a REAL segment dragged past its allowance is a finding. The wrapper sleeps, then imports the scenario runner,
//        so the measured elapsed is the real e2e run plus the sleep - measured, not synthesised. The sleep is DERIVED
//        from the documented allowance (allowance - baseline + 1500 ms), not the fixed 2000 from the old 2280 ms
//        calibration: once the baseline moved, a fast 2.0 s run + 2000 ms landed INSIDE the 4189 ms allowance and the
//        proof failed for the right reason (the drag no longer exceeded the rule it is supposed to exceed).
//   (ii) a LARGE segment is judged by the cost term, not by the floor: the floor only ever raises the allowance to
//        max(baseline*1.25, baseline+1500), which for a ~57 s segment is the 1.25x term. The two numbers fed below are
//        DERIVED from the documented baseline, not hard-coded: the allowance is defined against the baseline, so the
//        fixed +13000/+8000 pair silently stopped proving anything when the baseline moved (49.8 s -> 56.7 s after the
//        nested-path fidelity rewrite). "inside" sits at 64 % of the cost allowance (+16 % of baseline, inside the
//        1.25x rule by definition); "past" sits 1000 ms beyond the allowance, i.e. past BOTH terms. Asserting the
//        inside case stays GREEN is what proves the floor did not turn the gate into a wall: +16 % growth on a long
//        segment is not drift under a 1.25x cost rule, and claiming otherwise would mean "no cost growth at all".
const slowWrapper = join(TMP, 'slow-segment.mjs')
writeFileSync(slowWrapper, [
  '// self-proof wrapper: sleep, then run the real scenario runner so the measured elapsed is real work + the sleep',
  'await new Promise((r) => setTimeout(r, Number(process.env.SIM_SLOW_MS || 0)))',
  'process.argv = [process.argv[0], "run.mjs"].concat(String(process.env.SIM_SLOW_ARGS || "").split(" ").filter(Boolean))',
  'await import(process.env.SIM_SLOW_TARGET)',
  '',
].join(NL))
const e2eBase = Number(baselineSpec['end-to-end'])
const e2eAllowed = Math.max(Math.round(e2eBase * driftFactor), Math.round(e2eBase + driftFloorMs))
const dragMs = Math.ceil(e2eAllowed - e2eBase) + 1500
const slowStart = Date.now()
const slowRun = spawnSync(process.execPath, [slowWrapper], {
  cwd: REPO,
  encoding: 'utf8',
  timeout: SEG_MS.e2e + 10000,
  maxBuffer: 64 * 1024 * 1024,
  env: {
    ...process.env,
    SIM_SLOW_MS: String(dragMs),
    SIM_SLOW_ARGS: '--scenario end-to-end --out ' + join(TMP, 'slow-e2e'),
    SIM_SLOW_TARGET: pathToFileURL(join(REPO, 'scripts/sim/run.mjs')).href,
  },
})
const slowElapsed = Date.now() - slowStart
const slowProof = driftFindings([{ name: 'end-to-end', elapsed: slowElapsed }], baselineSpec)
ok(slowRun.status === 0, 'self-proof (i): the dragged end-to-end run still exits 0, so the slow reading is a real run and not a crashed one', { status: slowRun.status, elapsed: slowElapsed })
ok(slowProof.drifted.length === 1 && slowProof.drifted[0].name === 'end-to-end', 'self-proof (i): end-to-end dragged past its documented allowance (real run + ' + dragMs + ' ms sleep) is judged a drift (the floor does not swallow a real slowdown)', { elapsed: slowElapsed, baseline: e2eBase, allowed: slowProof.rows[0].allowed, dragMs })
const auditElapsed = (segments.find((s) => s.name === 'audit/all') || {}).elapsed || 0
const auditBase = Number(baselineSpec['audit/all'])
// Both shifts are computed FROM the documented baseline: the allowance is defined against the baseline, so a fixed
// +13000 ms would quietly stop being "past the allowance" the day the baseline moves - which it did (49.8 s -> 56.7 s).
const auditAllowed = Math.max(Math.round(auditBase * driftFactor), Math.round(auditBase + driftFloorMs))
const pastMs = Math.ceil(auditAllowed - auditBase) + 1000
const insideMs = Math.round((auditAllowed - auditBase) * 0.64)
const bigProof = driftFindings([
  { name: 'audit/all', elapsed: auditBase + pastMs },
  { name: 'audit/all', elapsed: auditBase + insideMs },
], baselineSpec)
ok(auditBase > 0 && bigProof.rows[0].allowed === Math.round(auditBase * driftFactor), 'self-proof (ii): for a large segment the allowance is the 1.25x cost term, not the +' + driftFloorMs + ' ms floor', { baseline: auditBase, allowed: bigProof.rows[0].allowed, floorTerm: Math.round(auditBase + driftFloorMs) })
ok(bigProof.drifted.length === 1 && bigProof.drifted[0].elapsed === auditBase + pastMs, 'self-proof (ii): audit/all at allowance + 1000 ms (' + pastMs + ' ms over the documented baseline) is a drift', { baseline: auditBase, shifted: auditBase + pastMs, allowed: bigProof.rows[0].allowed, measuredThisRun: auditElapsed })
ok(bigProof.rows[1].elapsed <= bigProof.rows[1].allowed, 'self-proof (ii): audit/all at +16 % (' + insideMs + ' ms, inside the 1.25x cost tolerance) is NOT a drift -- the absolute floor must not turn a cost gate into "no growth at all"', { elapsed: auditBase + insideMs, allowed: bigProof.rows[1].allowed })

if (!KEEP) {
  rmrf(TMP)
} else {
  console.log('   kept: ' + TMP)
}

console.log('=== sim gate: ' + passed + ' passed, ' + failed + ' failed ===')
// Printed AFTER the summary on purpose: `tests/run-tests.mjs` keeps only the LAST stdout line of a passing
// suite, so this is the one place where a full-suite run (T1 at concurrency 3) leaves its per-segment
// timings behind. Without it the only k=3 timing evidence is a red drift line, i.e. we would learn what the
// segments cost exactly when it is already too late to compare (RUN 269: one 14352 ms meeting-matrix spike
// under four concurrent lanes, three dedicated k=3 runs green — the number we lacked was the cost, not the verdict).
console.log('   segments: ' + segments.map((s) => s.name + '=' + s.elapsed + 'ms/' + s.budgetMs + 'ms').join('  '))
if (failed > 0) {
  for (const f of failures) console.log('  failed: ' + f.label)
  process.exitCode = 1
}
