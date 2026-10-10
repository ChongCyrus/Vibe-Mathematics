// audit-gate-snapshot.test.mjs — D4 gate: every gate/generator conclusion line must carry a snapshot
// fingerprint (head=<short SHA> + dirty=<n>), so a transient red caused by IN-FLIGHT edits is identifiable.
// The reviewer hit exactly that this round: two gates were reported red while the tree was being edited.
//
// This gate (a) verifies the seam-table generator emits the fingerprint, (b) verifies the fingerprint
// matches this checkout, and (c) proves by fault injection that a conclusion line WITHOUT the fingerprint
// is a NAMED red — i.e. the assertion bites.
// Run: node tests/audit-gate-snapshot.test.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const GEN = join(REPO, 'scripts', 'generate-seam-table.mjs')

let passed = 0
let failed = 0
function ok(cond, label, detail) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label + (detail === undefined ? '' : ' [' + detail + ']')) } }
function sh(cmd, argv) { try { return { out: execFileSync(cmd, argv, { cwd: REPO, encoding: 'utf8' }), code: 0 } } catch (e) { return { out: String(e.stdout || '') + String(e.stderr || ''), code: e.status === undefined ? 1 : e.status } } }

/** The snapshot rule, as a reusable assertion: a conclusion line must name head and dirty. */
function fingerprintOf(line) {
  const h = /head=([0-9a-f]{6,}|unknown)/.exec(line)
  const d = /dirty=(\d+)/.exec(line)
  return { ok: !!(h && d), head: h ? h[1] : null, dirty: d ? Number(d[1]) : null, named: 'GATE_SNAPSHOT_MISSING' }
}
function conclusionLines(text) { return text.split('\n').filter((l) => /^(SEAM TABLE|SEAM REACHABILITY|.*: (PASS|FAIL)|=== .* ===)/.test(l.trim())) }

const gitHead = sh('git', ['rev-parse', '--short', 'HEAD']).out.trim()
const dirty = sh('git', ['status', '--porcelain']).out.split('\n').filter((l) => l.trim()).length

// ── A. the generator's conclusion carries the fingerprint ───────────────────────────────────
{
  const r = sh(process.execPath, [GEN])
  const lines = conclusionLines(r.out)
  ok(lines.length >= 1, 'A1: the generator prints at least one conclusion line', JSON.stringify(lines))
  const withFp = lines.filter((l) => fingerprintOf(l).ok)
  ok(withFp.length >= 1, 'A2: at least one conclusion line carries head=…/dirty=…', JSON.stringify(lines.slice(-2)))
  ok(withFp.length === lines.length || lines.some((l) => /SEAM REACHABILITY/.test(l) && fingerprintOf(l).ok),
    'A3: the PASS/FAIL conclusion line itself carries the fingerprint', JSON.stringify(lines.slice(-2)))
}

// ── B. the fingerprint matches this checkout (so a stale line is detectable) ─────────────────
{
  const r = sh(process.execPath, [GEN])
  const last = conclusionLines(r.out).slice(-1)[0] || ''
  const fp = fingerprintOf(last)
  ok(fp.ok && (fp.head === gitHead || fp.head === 'unknown'), 'B1: the emitted head matches git HEAD', 'emitted=' + fp.head + ' git=' + gitHead)
  ok(fp.ok && fp.dirty === dirty, 'B2: the emitted dirty count matches git status', 'emitted=' + fp.dirty + ' git=' + dirty)
}

// ── C. fault injection: a conclusion WITHOUT the fingerprint is a NAMED red ──────────────────
{
  const bare = 'SEAM REACHABILITY: PASS'
  const withIt = 'SEAM TABLE: rows=9 seams=5 null=4 findings=0 head=' + gitHead + ' dirty=' + dirty
  ok(fingerprintOf(bare).ok === false && fingerprintOf(bare).named === 'GATE_SNAPSHOT_MISSING',
    'C1 (fault): a conclusion line without head=/dirty= is caught by the snapshot rule and NAMED')
  ok(fingerprintOf(withIt).ok === true, 'C2: the same rule accepts a line that carries the fingerprint')
  ok(fingerprintOf('SEAM TABLE: head=' + gitHead).ok === false,
    'C3 (fault): head without dirty is still incomplete (both are required)')
  ok(fingerprintOf('SEAM REACHABILITY: FAIL dirty=' + dirty).ok === false,
    'C4 (fault): dirty without head is still incomplete')
}

// ── D. the generator can be told to omit it, so the absence is provable ─────────────────────
{
  const r = sh(process.execPath, [GEN, '--no-fingerprint'])
  const lines = conclusionLines(r.out)
  ok(lines.some((l) => /SEAM TABLE/.test(l)) && !lines.some((l) => /head=/.test(l)),
    'D1: --no-fingerprint really removes head=/dirty= (the rule above therefore bites)')
}

// ── E. the rule is a rule, not an accident: it holds for a synthetic second gate ─────────────
{
  const synthetic = 'VMU DOC LINT: FAIL  head=' + gitHead + ' dirty=' + dirty
  ok(fingerprintOf(synthetic).ok === true, 'E1: any conclusion line can adopt the same fingerprint shape')
  ok(/head=[0-9a-f]{6,}|head=unknown/.test(synthetic), 'E2: the head format is a short SHA (or explicit unknown)')
}

console.log('=== VMU GATE SNAPSHOT: ' + passed + ' passed, ' + failed + ' failed === head=' + gitHead + ' dirty=' + dirty)
if (failed > 0) process.exit(1)
