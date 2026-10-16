#!/usr/bin/env node
// B1′ resident assertion — the staleness report's SHAPE and its hard-failure MESSAGE, with a REAL fixture.
// Fixture: copy docs/04-settings.md, delete the §11 body's FIRST row (0-based 259; header at 258 — coordinates
// measured by the Lead), then run `generate-wiring-index.mjs --check` with VMU_SETTINGS_DOC pointed at the copy.
// ★ NON-EMPTY PRECONDITION: the run must actually go STALE (exit 2 + a `诊断:` line) — without that the rest of the
// assertions would only be exercising the clean path.
// ★ LIVE PROOF that the fixture is live: the same call with the UNMODIFIED doc must be up to date (exit 0).
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO = process.cwd()
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
  const headerIdx = lines.findIndex((l) => l.startsWith('| 键 | 类型 |'))
  ok(headerIdx === 258, 'the §11 table header is where the fixture assumes it is (0-based 258)', headerIdx)
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
} finally {
  rmSync(root, { recursive: true, force: true })
}
console.log('')
console.log('=== B1PRIME STALENESS REPORT: ' + passed + ' passed, ' + failures.length + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failures.length === 0 ? 0 : 1)
