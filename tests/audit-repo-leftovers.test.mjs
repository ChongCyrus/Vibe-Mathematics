// vibe-math-vmu — A TEST OR A PROBE MUST NOT LEAVE RUNTIME STATE INSIDE THE REPO.
//
// WHY THIS EXISTS (phase 12, measured): while three lanes were writing, the repo root grew a `vmu/` directory
// containing `state.json` and `audit/1970-01-01.jsonl` with `"ts":1000` — i.e. somebody booted the real kernel with a
// fake clock and `root` pointing at the WORKING DIRECTORY instead of a temp directory. The store writes
// `<root>/vmu/state.json` (`vibe-math-vmu/kernel/store.js:122`) and the audit writer writes `<root>/vmu/audit/…`
// (`vibe-math-vmu/kernel/index.js:516`), so a probe whose root is `.` silently plants runtime state in the repo.
//
// That is the same failure the user names "调试期的临时改动不要留下": it is invisible in `git diff` (untracked), it is
// easy to commit by accident (`git add -A`), and in the SLV workspaces it is the difference between "the run wrote
// state" and "the run wrote state into the source tree".
//
// WHAT THIS TEST DOES: asserts the repo worktree contains no runtime-state artefacts OUTSIDE the normal fixture areas.
//   · no `<repo>/vmu/` directory at all (the exact measured leftover);
//   · no file named `state.json` and no `audit/*.jsonl` anywhere in the worktree except under `tests/`, `node_modules/`,
//     `archive/` and `.git/` (those are fixture/generated areas; tests are expected to use tmpdirs but a test-local
//     fixture is not the bug this gate is about).
//
// WHY THE EXCLUSIONS ARE RIGHT: the failure mode is a REAL kernel writing at a REAL path that happens to be the repo.
// A file under `tests/` was placed there by a test author on purpose and is reviewed with the test; a file under
// `tests/tmp-…/` is transient. Neither can be confused with the plugin writing next to its own source.
//
// WHAT IT DOES NOT PROVE: that every test uses a temp root (this only sees leftovers that survive the run), and nothing
// about generated dirs that are gitignored on purpose (`VibeMath/`, `tests/_selfdrive_log.json` — the latter is a host
// runtime log, already ignored, and is deliberately NOT gated here).
//
// Run: node tests/audit-repo-leftovers.test.mjs

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'tests', 'archive', 'coverage', '.cache'])
const MAX_DEPTH = 4

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail ? ' :: ' + detail : '')) }
}

// ── the scanner is PURE with respect to `root`, which is what makes `--self-test` possible ───────────────────────
const scanLeftovers = (root) => {
  const found = []
  const walk = (dir, depth) => {
    if (depth > MAX_DEPTH) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const abs = join(dir, e.name)
      if (e.isDirectory()) {
        if (EXCLUDED_DIRS.has(e.name)) continue
        walk(abs, depth + 1)
      } else if (e.isFile()) {
        if (e.name === 'state.json') { found.push(relative(root, abs) + ' (kernel/store.js:122)'); continue }
        const parent = dirname(abs)
        if (e.name.endsWith('.jsonl') && parent.endsWith('audit')) found.push(relative(root, abs) + ' (kernel/index.js:516)')
      }
    }
  }
  walk(root, 0)
  if (existsSync(join(root, 'vmu'))) found.push('vmu/ (the measured leftover: a probe rooted at ".")')
  if (existsSync(join(root, 'audit'))) found.push('audit/ (a hand-added runtime audit dir)')
  return found
}

// ★ SELF-PROOF (audit-scanner-selfproof, round 17): a gate that only ever says "0 findings" must be able to show
// its predicate FIRES. The trees below plant every shape it looks for AND the exclusion that must stay silent, so
// "no leftovers" is distinguishable from "the walk never looked" (the failure class this repository paid for three
// times: a filter that matched nothing reported nothing).
if (process.argv.includes('--self-test')) {
  const dir = mkdtempSync(join(tmpdir(), 'leftovers-selftest-'))
  let bad = 0
  const check = (cond, name, detail) => { console.log((cond ? 'PASS ' : 'FAIL - ') + name + (detail === undefined ? '' : ' :: ' + detail)); if (!cond) bad += 1 }
  try {
    mkdirSync(join(dir, 'clean', 'pkg'), { recursive: true })
    writeFileSync(join(dir, 'clean', 'pkg', 'readme.md'), 'nothing to see\n')
    check(scanLeftovers(join(dir, 'clean')).length === 0,
      'a clean tree yields ZERO findings (the predicate is not always-true)', JSON.stringify(scanLeftovers(join(dir, 'clean'))))
    mkdirSync(join(dir, 'dirty', 'vmu'), { recursive: true })
    writeFileSync(join(dir, 'dirty', 'vmu', 'state.json'), '{"ts":1000}\n')
    mkdirSync(join(dir, 'dirty', 'audit'), { recursive: true })
    writeFileSync(join(dir, 'dirty', 'audit', '1970-01-01.jsonl'), '{"ts":1000}\n')
    const dirty = scanLeftovers(join(dir, 'dirty'))
    check(dirty.some((x) => /state\.json/.test(x)), '★ the exact measured leftover (vmu/state.json) IS reported', JSON.stringify(dirty))
    check(dirty.some((x) => /audit/.test(x) && /\.jsonl/.test(x)), '★ an audit/*.jsonl is reported', JSON.stringify(dirty))
    mkdirSync(join(dir, 'excluded', 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(dir, 'excluded', 'node_modules', 'pkg', 'state.json'), '{}\n')
    mkdirSync(join(dir, 'excluded', 'real'), { recursive: true })
    writeFileSync(join(dir, 'excluded', 'real', 'state.json'), '{}\n')
    const excluded = scanLeftovers(join(dir, 'excluded'))
    check(!excluded.some((x) => /node_modules/.test(x)), '★★ node_modules/ stays EXCLUDED (a dependency tree is not a leftover)', JSON.stringify(excluded))
    check(excluded.some((x) => /real[\\/]state\.json/.test(x)), '★★ a real state.json OUTSIDE the exclusions IS reported (the exclusion is not a blanket)', JSON.stringify(excluded))
    console.log('SELFTEST ' + (bad === 0 ? 'PASS' : 'FAIL (' + bad + ')'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  process.exit(bad === 0 ? 0 : 1)
}

// ── 1. the exact measured leftover ────────────────────────────────────────────────────────────────────────────────
const rootVmu = join(REPO, 'vmu')
ok(!existsSync(rootVmu),
  'no <repo>/vmu/ directory (the store writes <root>/vmu/state.json — a probe rooted at "." plants it here)',
  existsSync(rootVmu) ? 'found ' + rootVmu + ' :: delete it and re-run the probe with a tmpdir root' : '')

// ── 2. any runtime-state file outside the fixture areas ───────────────────────────────────────────────────────────
const offenders = scanLeftovers(REPO)
ok(offenders.length === 0,
  'no runtime-state file (state.json / audit/*.jsonl) outside tests/, node_modules/, archive/',
  offenders.length ? offenders.join(' | ') : '')

// ── 3. the two paths the store would use are not writable sources ─────────────────────────────────────────────────
// A cheap structural guard: the store's directory name and the audit directory name must not exist as tracked-looking
// dirs at the top level. This catches the case where someone adds `<repo>/audit/` by hand.
const rootAudit = join(REPO, 'audit')
ok(!existsSync(rootAudit), 'no <repo>/audit/ directory at the top level', existsSync(rootAudit) ? 'found ' + rootAudit : '')

// ── 4. this test does not accidentally rely on a build step ──────────────────────────────────────────────────────
// (the assertion above walks the worktree; if the repo root could not be stat'd, everything above would be vacuous)
let rootIsDir = false
try { rootIsDir = statSync(REPO).isDirectory() } catch {}
ok(rootIsDir, 'the repo root resolved (so the walk above was not vacuous)', REPO)

console.log('\n=== VMU REPO LEFTOVERS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.log('FAIL ' + failures.join(' | ')); process.exit(1) }
process.exit(0)
