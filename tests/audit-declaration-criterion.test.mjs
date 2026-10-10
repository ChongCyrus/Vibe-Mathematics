// tests/audit-declaration-criterion.test.mjs — the "declaration must name its execution point" gate
// (task-177, the tenth case of this stage).
//
// WHY: `scripts/generate-zero-mechanism-matrix.mjs` implemented a `--selftest` mode, it passed when run
// by hand, and yet NOTHING in `tests/**` ever executed it — a self-proof mode with no execution point.
// The same shape recurs throughout this stage, so this gate turns the discipline into machine criteria:
//
//   RULE A — every self-proof mode a script implements (`--selftest`, `--check`, `--json` diagnostics…)
//            MUST be really executed by at least one gate.            (missing ⇒ RED)
//   RULE B — every module/kernel that exposes a registry/manifest MUST have a gate that reconciles
//            "declared" against "fact".                                (missing ⇒ RED)
//   RULE C — every self-reported `status()` field (`usedByProduction`/`verifiedBy`/`scanned`…) MUST have
//            a gate that scans it.                                     (missing ⇒ RED)
//
// It also REALLY RUNS the matrix `--selftest` and asserts exit 0 (that is the execution point for the
// tenth case). Three deliberately broken fixtures prove the checker itself can fail (a green checker that
// cannot go red is worthless).
import { readdirSync, readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SCRIPTS = join(REPO, 'scripts')
const TESTS = join(REPO, 'tests')

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const red = (violations, label) => { if (violations.length === 0) { pass++ } else { fail++; console.log('FAIL ' + label + ' ⇒ ' + violations.join('; ')) } }

const readIf = (p) => { try { return readFileSync(p, 'utf8') } catch { return '' } }
const listFiles = (dir, filter) => { try { return readdirSync(dir).filter(filter).map((f) => join(dir, f)) } catch { return [] } }

// ── the checkers (pure functions over a file inventory, so fixtures can drive them) ────────────────────

/** Flags a script implements: `--selftest`, `--check`, `--json`, `--kernel`, `--write`, … */
export function flagsOf(src) {
  const out = new Set()
  for (const m of String(src).matchAll(/--([a-z][a-z0-9-]{2,})/g)) out.add('--' + m[1])
  return [...out].sort()
}

/** The "self-proof" modes that MUST have an execution point. */
export const SELF_PROOF_FLAGS = Object.freeze(['--selftest'])
/** Diagnostic modes that count as an execution point when a gate really runs them. */
export const DIAGNOSTIC_FLAGS = Object.freeze(['--check', '--json', '--kernel', '--verify'])

/** RULE A: every script with a self-proof mode must be executed by >=1 gate (tests/**, or by this run). */
export function auditSelfProofExecution({ scriptFiles, gateSources, evidence = [], selfProof = SELF_PROOF_FLAGS, diagnostic = DIAGNOSTIC_FLAGS }) {
  const violations = []
  const coverage = []
  for (const f of scriptFiles) {
    const src = readIf(f)
    const flags = flagsOf(src)
    const script = basename(f)
    const selfProofs = flags.filter((x) => selfProof.includes(x))
    const diags = flags.filter((x) => diagnostic.includes(x))
    if (selfProofs.length === 0) continue
    for (const flag of selfProofs) {
      // Evidence is stronger than a mention: `evidence` records flags THIS gate really executed.
      const ranHere = evidence.some((e) => basename(e.script) === script && e.flag === flag)
      const executed = ranHere || gateSources.some((g) => g.src.includes(script) && (g.src.includes(flag) || new RegExp(flag.replace(/-/g, '\\-') + '\\b').test(g.src)))
      if (!executed) violations.push(script + ' implements ' + flag + ' but no gate executes it')
      coverage.push({ script, flag, executed, executedHere: ranHere, kind: 'self-proof' })
    }
    for (const flag of diags) {
      // Diagnostics are covered when the gate NAMES the flag for this script (the correct form observed in
      // audit-seam-reachability.test.mjs for generate-seam-table).
      const executed = gateSources.some((g) => g.src.includes(script) && g.src.includes(flag))
      coverage.push({ script, flag, executed, kind: 'diagnostic' })
    }
  }
  return { violations, coverage }
}

/** RULE B: a module exposing a registry/manifest needs a gate that reconciles declaration vs fact. */
export function auditRegistryReconciliation({ sources, gateSources, registryMarkers = ['GUARD_FACES', 'EXPECT', 'REGISTRY', 'MANIFEST'] }) {
  const violations = []
  const coverage = []
  for (const s of sources) {
    const found = registryMarkers.filter((m) => new RegExp('\\b' + m + '\\b').test(s.src))
    if (found.length === 0) continue
    // A reconciliation gate mentions the marker AND maps declaration -> fact (some comparison/scan words).
    const gate = gateSources.find((g) => found.some((m) => g.src.includes(m)) && /compare|declar|fact|scan|reconcil|must match|diff/i.test(g.src))
    if (!gate) violations.push(basename(s.file) + ' exposes ' + found.join('/') + ' but no gate reconciles declaration vs fact')
    coverage.push({ file: basename(s.file), markers: found, reconciledBy: gate ? basename(gate.file) : null })
  }
  return { violations, coverage }
}

/** RULE C: a self-reported status() field needs a gate that scans it. */
export function auditSelfReportedStatus({ sources, gateSources, fields = ['usedByProduction', 'verifiedBy', 'scanned'] }) {
  const violations = []
  const coverage = []
  for (const s of sources) {
    const reported = fields.filter((f) => s.src.includes(f))
    if (reported.length === 0) continue
    for (const f of reported) {
      const gate = gateSources.some((g) => g.src.includes(f))
      if (!gate) violations.push(basename(s.file) + ' reports status field "' + f + '" but no gate scans it')
      coverage.push({ file: basename(s.file), field: f, scannedByGate: gate })
    }
  }
  return { violations, coverage }
}

// ── real inventory ────────────────────────────────────────────────────────────────────────────────────

const scriptFiles = listFiles(SCRIPTS, (f) => f.endsWith('.mjs'))
const gateFiles = listFiles(TESTS, (f) => f.endsWith('.mjs') && f !== 'audit-declaration-criterion.test.mjs').concat([join(TESTS, 'run-tests.mjs')]).filter((f) => existsSync(f))
const gateSources = gateFiles.map((f) => ({ file: f, src: readIf(f) }))
// The kernel lives under the preset directory (vibe-math-vmu/kernel), NOT at the repo root: an earlier
// draft scanned the wrong path and produced a VACUOUSLY green audit — the non-vacuity assertions below
// exist so that mistake can never pass again.
const kernelFiles = listFiles(join(REPO, 'vibe-math-vmu', 'kernel'), (f) => f.endsWith('.js'))
const sourceFiles = kernelFiles.concat(scriptFiles).map((f) => ({ file: f, src: readIf(f) }))
ok(kernelFiles.length > 0, 'the inventory really found kernel sources under vibe-math-vmu/kernel (non-vacuous scan)')
ok(sourceFiles.length > 0 && sourceFiles.every((s) => s.src.length > 0), 'every scanned source was actually read (non-vacuous)')

// 0) THE TENTH CASE, FIRST: really run the matrix self-test (this IS the execution point) and record the
//    evidence that rule A then credits. A flag that is only MENTIONED is not evidence; running it is.
const executedEvidence = []
let matrixSelftest = null
{
  const script = join(SCRIPTS, 'generate-zero-mechanism-matrix.mjs')
  const r = spawnSync(process.execPath, [script, '--selftest'], { cwd: REPO, encoding: 'utf8' })
  matrixSelftest = r
  const line = 'node scripts/generate-zero-mechanism-matrix.mjs --selftest ⇒ exit=' + r.status + ' | ' + String(r.stdout || '').trim().split('\n').slice(-1)[0]
  console.log('  EXECUTED: ' + line)
  if (r.status === 0) executedEvidence.push({ script, flag: '--selftest' })
  ok(r.status === 0, 'the matrix --selftest really runs green from the gate (exit 0)')
}

// 1) RULE A on the real tree (crediting the evidence above)
const ruleA = auditSelfProofExecution({ scriptFiles, gateSources, evidence: executedEvidence })
red(ruleA.violations, 'RULE A (every self-proof mode has an execution point)')
ok(ruleA.coverage.some((c) => c.script === 'generate-zero-mechanism-matrix.mjs' && c.flag === '--selftest' && c.executed === true && c.executedHere === true), 'the tenth case is covered: the matrix --selftest is executed BY THIS GATE')

// 2) RULE B / RULE C on the real tree (kernel sources + generator scripts)
const ruleB = auditRegistryReconciliation({ sources: sourceFiles, gateSources })
const ruleC = auditSelfReportedStatus({ sources: sourceFiles, gateSources })
console.log('  RULE B coverage: ' + JSON.stringify(ruleB.coverage))
console.log('  RULE C coverage: ' + JSON.stringify(ruleC.coverage))
red(ruleB.violations, 'RULE B (registries are reconciled against fact)')
red(ruleC.violations, 'RULE C (self-reported status fields are scanned by a gate)')
// The two surfaces this stage actually has must be named in the coverage (a green audit that covers
// nothing is not a pass):
ok(ruleB.coverage.some((c) => c.markers.includes('EXPECT') && c.reconciledBy), 'the EXPECT registry in the matrix generator is reconciled by a named gate')
ok(ruleC.coverage.some((c) => ['usedByProduction', 'verifiedBy'].includes(c.field) && c.scannedByGate === true), 'the self-reported usedByProduction/verifiedBy surface is scanned by a gate')

// 3) the same tenth-case evidence, restated (the run itself happened in block 0 above)
ok(matrixSelftest && matrixSelftest.status === 0 && String(matrixSelftest.stdout || '').includes('GREEN'), 'the recorded --selftest output says GREEN')

// 4) three deliberately broken fixtures: a checker that cannot go red is worthless
{
  const dir = mkdtempSync(join(tmpdir(), 'decl-criterion-'))
  try {
    // fixture A: a script with --selftest that no gate runs
    const fakeScript = join(dir, 'generate-fake.mjs')
    writeFileSync(fakeScript, "if (process.argv.includes('--selftest')) { console.log('ok'); process.exit(0) }\n", 'utf8')
    const a = auditSelfProofExecution({ scriptFiles: [fakeScript], gateSources: [{ file: 'none', src: 'nothing here' }] })
    ok(a.violations.length === 1 && /generate-fake\.mjs implements --selftest but no gate executes it/.test(a.violations[0]), 'fixture A: an unexecuted --selftest is flagged by name')
    const aFixed = auditSelfProofExecution({ scriptFiles: [fakeScript], gateSources: [{ file: 'gate', src: 'spawn(node, ["scripts/generate-fake.mjs", "--selftest"])' }] })
    ok(aFixed.violations.length === 0, 'fixture A (control): a gate that runs it clears the violation')

    // fixture B: a registry with no declaration-vs-fact reconciliation
    const b = auditRegistryReconciliation({ sources: [{ file: 'fake-kernel.js', src: 'export const GUARD_FACES = [1,2,3]\n' }], gateSources: [{ file: 'gate', src: 'import { GUARD_FACES } from "x"' }] })
    ok(b.violations.length === 1 && /GUARD_FACES/.test(b.violations[0]), 'fixture B: a registry without a reconciliation gate is flagged')
    const bFixed = auditRegistryReconciliation({ sources: [{ file: 'fake-kernel.js', src: 'export const GUARD_FACES = [1]\n' }], gateSources: [{ file: 'gate', src: 'GUARD_FACES: reconcile declaration vs fact (scan)' }] })
    ok(bFixed.violations.length === 0, 'fixture B (control): a reconciliation gate clears it')

    // fixture C: a self-reported status field with no scanning gate
    const c = auditSelfReportedStatus({ sources: [{ file: 'fake-kernel.js', src: 'function status(){ return { usedByProduction: true } }' }], gateSources: [{ file: 'gate', src: 'assert(x === 1)' }] })
    ok(c.violations.length === 1 && /usedByProduction/.test(c.violations[0]), 'fixture C: an unscanned status field is flagged')
    const cFixed = auditSelfReportedStatus({ sources: [{ file: 'fake-kernel.js', src: 'function status(){ return { usedByProduction: true } }' }], gateSources: [{ file: 'gate', src: 'assert(status().usedByProduction === true)' }] })
    ok(cFixed.violations.length === 0, 'fixture C (control): a scanning gate clears it')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('  RULE A coverage: ' + JSON.stringify(ruleA.coverage.filter((c) => c.kind === 'self-proof')))
console.log('=== DECLARATION CRITERION: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)
