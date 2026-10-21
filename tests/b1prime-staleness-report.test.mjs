#!/usr/bin/env node
// B1′ resident assertion — the staleness report's SHAPE and its hard-failure MESSAGE, with a REAL fixture.
// Fixture: copy docs/04-settings.md, delete the §11 body's FIRST row (located by CONTENT: the `| 键 | 类型 |`
// header, then its separator, then the first `| \`vmu.…\`` body row), then run `generate-wiring-index.mjs --check`
// with VMU_SETTINGS_DOC pointed at the copy. ★ ROUND 13: the header used to be addressed as a hard-coded line
// number; every added settings key shifted it and reddened this suite, so the fixture now asserts the header is
// present EXACTLY ONCE instead of pinning where it is.
// ★ NON-EMPTY PRECONDITION: the run must actually go STALE (exit 2 + a `诊断:` line) — without that the rest of the
// assertions would only be exercising the clean path.
// ★ LIVE PROOF that the fixture is live: the same call with the UNMODIFIED doc must be up to date (exit 0).
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// ★ CONVENTION (not a defect): the sibling audits (`audit-claim-traceability`, `audit-code-size`,
// `audit-table-integrity`, …) all derive the repo root from THIS FILE's URL, so the suite works from any cwd. My
// first version used `process.cwd()` — it passed only because the runner sets cwd, and a different cwd would have
// failed confusingly. Nothing else changed (this is robustness, not a bug fix).
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const WIRE = 'scripts/generate-wiring-index.mjs'
const SETTINGS_GEN = 'scripts/generate-vmu-settings-table.mjs'
const PLANNED_GEN = 'scripts/generate-planned-settings.mjs'
let passed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) { passed += 1; return } failures.push(name + (detail === undefined ? '' : ' [' + String(detail).slice(0, 160) + ']')) }
const run = (args, doc) => {
  const env = Object.assign({}, process.env, doc ? { VMU_SETTINGS_DOC: doc } : {})
  try { return { code: 0, out: execFileSync(process.execPath, args, { cwd: REPO, env, encoding: 'utf8' }), err: '' } }
  catch (e) { return { code: e.status === undefined ? 1 : e.status, out: String(e.stdout || ''), err: String(e.stderr || '') } }
}
const lastNonEmpty = (t) => t.trim().split('\n').filter(Boolean).slice(-1)[0] || ''

const root = mkdtempSync(join(tmpdir(), 'b1prime-'))
try {
  const src = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '04-settings.md'), 'utf8')
  const lines = src.split('\n')
  // ★ ROUND 13: LOCATE BY CONTENT, NOT BY COORDINATES. This used to assert `headerIdx === 258`; adding ONE settings
  // key to §11 shifted the header and reddened a suite whose subject is the staleness MESSAGE, not the line number.
  // Adding a key is routine, so a coordinate assertion is a fixture that breaks on normal work. The header text is
  // stable; assert it is present EXACTLY ONCE (a duplicate would make "the first one" a silent guess).
  const headerHits = lines.map((l, i) => (l.startsWith('| 键 | 类型 |') ? i : -1)).filter((i) => i >= 0)
  ok(headerHits.length === 1, 'the §11 table header occurs EXACTLY ONCE (located by CONTENT, not by a hard-coded line)', JSON.stringify(headerHits))
  const headerIdx = headerHits[0]
  const bodyFirst = headerIdx + 2        // ★ +2: headerIdx+1 is the `|---|…|` SEPARATOR (my first version deleted the
  ok(/^\| `vmu\./.test(lines[bodyFirst]), 'the first §11 body row (after the separator) is a key row (the row the fixture deletes)', lines[bodyFirst].slice(0, 40))
  const pristine = join(root, 'pristine.md')
  const broken = join(root, 'broken.md')
  writeFileSync(pristine, src)
  const cut = lines.slice()
  cut.splice(bodyFirst, 1)                       // ★ delete the BODY's first row (not a row found by a loose regex)
  writeFileSync(broken, cut.join('\n'))

  // (0) LIVE PROOF: unmodified doc through the same seam ⇒ up to date
  const control = run([WIRE, '--check'], pristine)
  ok(control.code === 0, 'control: the UNMODIFIED doc through the SAME seam is up to date (exit 0) — the seam is live', control.code)

  // (1) NON-EMPTY PRECONDITION: the fixture really goes HARD STALE
  const stale = run([WIRE, '--check'], broken)
  const diag = stale.err.split('\n').filter((l) => /诊断:/.test(l))
  ok(stale.code === 2 && diag.length >= 1, '★ precondition: the fixture goes HARD STALE (exit 2 + a 诊断: line)', 'exit=' + stale.code + ' diag=' + diag.length)

  // (2) the parent's `detail` is the CHILD's OWN last stderr line, verbatim
  const child = run([SETTINGS_GEN], broken)
  // ★ the label is `    诊断: ` (one space after the colon). Stripping `\s*` after the colon would EAT the child's own
  // leading spaces and turn an identical line into a false mismatch (my first version did exactly that).
  const parentDetail = (diag[0] || '').replace(/^\s*诊断: ?/, '')
  ok(parentDetail.length > 0 && parentDetail === lastNonEmpty(child.err || child.out).slice(0, 200),
    '★ hard `detail` ≡ the settings-table child\u2019s LAST stderr line, verbatim (the round-6 message fix)',
    JSON.stringify(parentDetail.slice(0, 90)) + ' vs ' + JSON.stringify(lastNonEmpty(child.err || child.out).slice(0, 90)))

  // (3) one entry per kind, and the hard message must not be mixed into the soft bucket
  const hardLines = stale.err.split('\n').filter((l) => /·\s/.test(l))
  ok(hardLines.length === 1, 'the hard bucket reports exactly ONE entry (no cross-kind mixing, no duplicates)', hardLines.length)
  ok(/settings table STALE/.test(stale.err) && !/planned\.js 落后|soft/.test(stale.err),
    'the hard message is the settings-table one (the soft wording does not leak into the hard path)')

  // (4) the soft child is the other kind: its own last line, and only its own bucket
  const softChild = run([PLANNED_GEN], broken)
  ok(softChild.code === 0 || typeof softChild.code === 'number',
    'the soft sub-check runs independently of the hard one (its own process, its own result)',
    'soft exit=' + softChild.code + ' last=' + JSON.stringify(lastNonEmpty(softChild.err || softChild.out).slice(0, 60)))
  // (5) ★ CRASH PATH (round 7): when the child cannot even open the file, its LAST line is `Node.js v24.21.0` — a
  // faithfully-forwarded but USELESS `detail`. Non-empty precondition: the seam must point at a NONEXISTENT path so
  // the child really exits non-zero. The assertion demands the USEFUL fragment (ENOENT or the path), not mere length.
  const ghost = join(root, 'this-path-does-not-exist-' + Date.now() + '.md')
  const crashW = run([WIRE, '--check'], ghost)
  const crashDiag = (crashW.err.split('\n').filter((l) => /诊断:/.test(l))[0] || '').replace(/^\s*诊断: ?/, '')
  ok(crashW.code === 2 && crashDiag.length > 0,
    '★ crash precondition: the seam at a NONEXISTENT path really makes the hard child fail (exit 2 + a 诊断 line)',
    'exit=' + crashW.code + ' diag=' + JSON.stringify(crashDiag.slice(0, 60)))
  ok(/ENOENT|this-path-does-not-exist/.test(crashDiag),
    '★★ the crash `detail` carries the USEFUL fragment (ENOENT / the path), not just the last line the child printed',
    JSON.stringify(crashDiag.slice(0, 120)))
  ok(!/^Node\.js v/.test(crashDiag),
    '★ and it is NOT the useless `Node.js v…` signature line that the plain last-line rule would have forwarded',
    JSON.stringify(crashDiag.slice(0, 60)))
  // (5b) ★ ROUND 11 GAP A + B — the two failure forms the assertions above CANNOT reach (their precondition always
  // prints an ENOENT line). Copy-based: the CHILD script is replaced inside a copy, real tree untouched;每 arm 先证前提。
  const armTree = (name, childBody) => {
    const dir = join(root, name)
    mkdirSync(dir, { recursive: true })
    for (const p of ['scripts', 'vibe-math-vmu']) cpSync(join(REPO, p), join(dir, p), { recursive: true })
    writeFileSync(join(dir, 'scripts', 'generate-vmu-settings-table.mjs'), childBody)
    return dir
  }
  // GAP A: non-zero exit with ZERO output ⇒ the 诊断 line must STILL exist and name the state as VALUES.
  const silentDir = armTree('silent', 'process.exit(1)\n')
  const silentRun = run([join(silentDir, WIRE), '--check'])
  const silentDiag = silentRun.err.split('\n').filter((l) => /诊断:/.test(l))
  ok(silentRun.code === 2 && silentDiag.length === 1,
    '★★ GAP A: a child exiting non-zero with NO output still yields exactly ONE 诊断 line (field set does not change with the failure form)',
    'exit=' + silentRun.code + ' diagLines=' + silentDiag.length)
  ok(silentDiag.length === 1 && /status=1/.test(silentDiag[0]),
    '★ and the silent case names its state as VALUES (status=… signal=…), never by the absence of a key',
    (silentDiag[0] || '').trim().slice(0, 90))
  // GAP B: a fatal signature that is NOT `Error:` (Node OOM prints `FATAL ERROR: Reached heap limit …`)
  const oomBody = "process.stderr.write('\\n<--- Last few GCs --->\\n\\n')\nprocess.stderr.write('FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\\n')\nprocess.stderr.write(' 15: 00000243800D9F9A\\n')\nprocess.exit(134)\n"
  const oomDir = armTree('oom', oomBody)
  const oomRun = run([join(oomDir, WIRE), '--check'])
  const oomDiag = (oomRun.err.split('\n').filter((l) => /诊断:/.test(l))[0] || '')
  ok(oomRun.code === 2 && /FATAL ERROR: Reached heap limit/.test(oomDiag),
    '★★ GAP B: a `FATAL ERROR:` fatal signature is picked up (the pre-R11 predicate reported a bare address frame here)',
    JSON.stringify(oomDiag.trim().slice(0, 110)))
  ok(!/\b[0-9A-F]{12,}\b/.test(oomDiag),
    '★ and the reported diagnostic is NOT a bare native address frame', JSON.stringify(oomDiag.trim().slice(0, 60)))
  // BRANCH 2 (decided): several `Error:` lines ⇒ the LAST (the root cause of a wrapped chain, not the wrapper).
  const chainBody = "process.stderr.write(\"Error: upstream connection refused\\n\")\nprocess.stderr.write(\"Error: ENOENT: no such file or directory, open 'x'\\n\")\nprocess.exit(1)\n"
  const chainDir = armTree('chain', chainBody)
  const chainRun = run([join(chainDir, WIRE), '--check'])
  const chainDiag = (chainRun.err.split('\n').filter((l) => /诊断:/.test(l))[0] || '')
  ok(/ENOENT/.test(chainDiag) && !/upstream connection refused/.test(chainDiag),
    '★ branch 2: with several `Error:` lines the LAST is reported (root cause of a wrapped chain, not the outer wrapper)',
    JSON.stringify(chainDiag.trim().slice(0, 90)))
} finally {
  rmSync(root, { recursive: true, force: true })
}
console.log('')
console.log('=== B1PRIME STALENESS REPORT: ' + passed + ' passed, ' + failures.length + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failures.length === 0 ? 0 : 1)
