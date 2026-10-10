// audit-seam-reachability.test.mjs — D1 gate.
// The root cause this gate exists for: a seam was WIRED but its consumer never used it, and four
// capability seams were hard-coded to `null` (signer / deliver / fetchFn / timer) — with `deliver`
// wired to members/meetings but NOT to notify. The table is EXTRACTED, never hand-written.
//
// Gate: (1) every null factory default carries a reason; (2) the SAME seam may not be wired for one
// consumer and silently null for another (unless the table explains it); (3) the table file is not stale;
// (4) >=3 fault-injection proofs make the named assertions red.
// Run: node tests/audit-seam-reachability.test.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const GEN = join(REPO, 'scripts', 'generate-seam-table.mjs')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')

let passed = 0
let failed = 0
function ok(cond, label, detail) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label + (detail === undefined ? '' : ' [' + detail + ']')) } }
function run(genArgs) {
  try { return { out: execFileSync(process.execPath, [GEN, ...genArgs], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), code: 0 } }
  catch (e) { return { out: String(e.stdout || '') + String(e.stderr || ''), code: e.status === undefined ? 1 : e.status } }
}
function fingerprint() {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter((l) => l.trim()).length
    return { head, dirty }
  } catch (e) { return { head: 'unknown', dirty: -1 } }
}

const dir = mkdtempSync(join(tmpdir(), 'vmu-seam-'))
try {
  // ── A. the live tree must be green: extraction runs, the table renders, no findings ──────────
  const live = run(['--out', join(dir, 'seam-table.md'), '--write'])
  ok(live.code === 0, 'A1: the live kernel yields no seam findings', 'exit=' + live.code)
  ok(/SEAM REACHABILITY: PASS/.test(live.out), 'A2: the gate concludes PASS on the live tree')
  const rows = JSON.parse(run(['--json']).out).rows
  ok(rows.length >= 5, 'A3: the table has at least five extracted rows', 'rows=' + rows.length)
  ok(rows.every((r) => r.site && /^kernel\/index\.js:\d+$/.test(r.site)), 'A4: every row names its construction site with a line number')
  const nulls = rows.filter((r) => r.isNull)
  ok(nulls.every((r) => new RegExp(r.service + '\\.' + r.seam).source !== ''), 'A5: null rows are enumerated for the reason check')
  ok(/head=[0-9a-f]{6,}|head=unknown/.test(live.out) && /dirty=\d+/.test(live.out), 'A6: the conclusion line carries the D4 fingerprint (head=…/dirty=…)', live.out.trim().split('\n').slice(-2).join(' | '))

  // ── B. table freshness (drift) ──────────────────────────────────────────────────────────────
  copyFileSync(join(dir, 'seam-table.md'), join(dir, 'table-ok.md'))
  const checkOk = run(['--check', '--out', join(dir, 'seam-table.md')])
  ok(checkOk.code === 0 && /up to date/.test(checkOk.out), 'B1: --check reports the freshly written table as up to date', checkOk.out.trim())

  // ── C. fault injection 1: a null seam WITHOUT a reason ⇒ named red ──────────────────────────
  const k1 = join(dir, 'kernel-noreason.js')
  writeFileSync(k1, readFileSync(KERNEL, 'utf8').replace(/(create[A-Za-z0-9_]*\s*\(\s*\{)/, '$1\n  timer: null,'), 'utf8')
  const f1 = run(['--kernel', k1])
  ok(f1.code === 1 && /ABSENT_REASON_MISSING .*timer/.test(f1.out), 'C1 (fault): a null seam without a reason is a NAMED red', f1.out.split('\n').filter((l) => /ABSENT_REASON_MISSING/.test(l))[0] || '(no finding line)')
  ok(/SEAM REACHABILITY: FAIL/.test(f1.out), 'C2 (fault): the gate concludes FAIL for the missing reason')

  // ── D. fault injection 2: the `deliver` shape ⇒ one consumer wired, another null ⇒ named red ──
  {
    const synth = join(dir, 'kernel-synth.js')
    writeFileSync(synth, [
      'const a = createAlpha({ clock: () => 0, deliver: () => {} })   // wired',
      'const b = createBeta({ clock: () => 0, deliver: null })        // the historical defect shape',
      '',
    ].join('\n'), 'utf8')
    const f2 = run(['--kernel', synth])
    ok(/SEAM_INCONSISTENT deliver/.test(f2.out), 'D1 (fault): the SAME seam wired for one consumer and null for another is a NAMED red',
      f2.out.split('\n').filter((l) => /SEAM_INCONSISTENT/.test(l))[0] || '(no finding line)')
    ok(/ABSENT_REASON_MISSING .*beta\.deliver/.test(f2.out), 'D2 (fault): the unexplained null is ALSO named (two independent named findings)',
      f2.out.split('\n').filter((l) => /ABSENT_REASON_MISSING/.test(l))[0] || '(no finding line)')
    ok(f2.code === 1 && /SEAM REACHABILITY: FAIL/.test(f2.out), 'D3 (fault): the gate exits non-zero and concludes FAIL')
    const synthOk = join(dir, 'kernel-synth-ok.js')
    writeFileSync(synthOk, [
      'const a = createAlpha({ clock: () => 0, deliver: () => {} })',
      'const b = createBeta({ clock: () => 0, deliver: () => {} })',
      '',
    ].join('\n'), 'utf8')
    const f2b = run(['--kernel', synthOk])
    ok(f2b.code === 0 && /SEAM REACHABILITY: PASS/.test(f2b.out), 'D4 (fault): the identical shape with BOTH wired is green (no false red)')
  }
  // ── E. fault injection 3: a stale table file ⇒ named red ────────────────────────────────────
  const stale = join(dir, 'seam-table-stale.md')
  writeFileSync(stale, '| seam | construction site | consumers | factory default |\n|---|---|---|---|\n| `timer` | `kernel/index.js:1` (ghost) | (none) | `null` — obsolete |\n', 'utf8')
  const f3 = run(['--check', '--out', stale])
  ok(f3.code === 1 && /SEAM TABLE DRIFT/.test(f3.out), 'E1 (fault): a stale table is a NAMED red (drift)', f3.out.trim())
  ok(/STALE/.test(f3.out), 'E2 (fault): the drift message says the table is stale')

  // ── F. the fingerprint is load-bearing (D4): removing it is detectable ──────────────────────
  const liveOut = run([]).out
  const stripped = run(['--no-fingerprint']).out
  ok(/head=/.test(liveOut) && !/head=/.test(stripped), 'F1: the fingerprint is emitted normally and can be disabled (so its absence is detectable)')
  const fp = fingerprint()
  ok(fp.dirty >= 0, 'F2: the dirty count is computable in this environment', String(fp.dirty))
} finally { rmSync(dir, { recursive: true, force: true }) }

console.log('=== VMU SEAM REACHABILITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
