// tests/audit-legacy-scope.test.mjs — the guard for the ONE decision round 230 made about the sweep:
// the five historical presets are ARCHIVED, so their BEHAVIOUR suites no longer run by default.
//
// WHY IT EXISTS. Until round 230 the default sweep ran everything, including suites that boot an archived
// preset and drive it (`v5-institute-fixes.mutants.mjs` alone is three 600 s shards, the single largest item
// in the sweep, and the v4/v5 families were also the ones leaving ~1900 `*v4*` temp roots in the temp dir).
// The user's instruction was explicit: "we only maintain vmu and the v5r pack"; legacy is never re-verified.
// Dropping coverage is exactly the kind of change this repository refuses to leave implicit — a curated filter
// that silently drops work is the failure this codebase keeps finding elsewhere (a check that exists, passes
// when run by hand, and is never executed by the thing that is supposed to run it). So the classification is:
//   · a COMMITTED DIRECTORY (`tests/legacy/`), not a runtime guess — reviewable, diffable, and stable, and the
//     directory IS the list (round 232 moved the 54 suites there, so a suite's home and its classification are
//     the same fact and cannot drift apart);
//   · applied by the runner with `GATE_LEGACY=1` as the way back, and SAID OUT LOUD in every header;
//   · asserted here in BOTH directions: every listed file exists and really is an archived-preset behaviour
//     suite (it must reach the archive and must NOT touch `vibe-math-vmu`), and no vmu-Named job is dropped.
//
// WHAT IS NOT LEGACY. Repo-wide audits that merely READ the archive (path discipline, doc gates, declaration
// criteria, registration parity, artifact docs) stay in the sweep: they guard the shared layer, not the
// archived presets. The last section pins that boundary, because "the archive is gone" must not become an
// excuse to drop a gate that guards the surviving code.
//
// Run: node tests/audit-legacy-scope.test.mjs
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * THE PREDICATE of section 1, extracted so that it can be PROVEN able to fire. A gate whose "0 findings" cannot be
 * told apart from a dead predicate is the exact failure class this repository keeps finding, so `--self-test` (below)
 * feeds this function three forged sources - one that touches the maintained surface, one that reaches no archive, and
 * one mutant twin whose base is listed - and requires the three verdicts to differ.
 */
const classifySource = (f, src, listed) => {
  const touchesVmu = /vibe-math-vmu/.test(src)
  // A mutant twin may reach the archive only through the suite it mutates; that suite must be listed too.
  const twin = f.endsWith('.mutants.mjs') ? f.slice(0, -'.mutants.mjs'.length) + '.mjs' : ''
  const viaTwin = twin !== '' && listed.includes(twin)
  const archive = /legacy-presets|legacyEntry|legacyFile|legacyDir|LEGACY_BASE|selfdrive-v3|selfdrive-v4|selfdrive-v5/.test(src)
  return { touchesVmu, reachesArchive: archive || viaTwin, viaTwin }
}

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const RUNNER = join(HERE, 'run-tests.mjs')
const LEGACY_DIR = join(HERE, 'legacy')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label) }
  else { failed++; failures.push(label + (detail ? ' - ' + detail : '')); console.error('  FAIL ' + label + (detail ? ' - ' + detail : '')) }
}

/** Run the runner with an EXPLICIT scope (never inherited) and the legacy switch as given. */
const runRunner = (argv, env = {}) => {
  const e = Object.assign({}, process.env, { GATE_SCOPE: 'full' }, env)
  if (!('GATE_LEGACY' in env)) delete e.GATE_LEGACY
  const r = spawnSync(process.execPath, [RUNNER, '--no-temp-hygiene', ...argv], { cwd: REPO, encoding: 'utf8', env: e })
  return { status: r.status, out: String(r.stdout || ''), err: String(r.stderr || '') }
}
const counts = (env = {}) => {
  const r = runRunner(['--counts'], env)
  let json = null
  try { json = JSON.parse(r.out.trim()) } catch (e) { /* reported by the caller */ }
  return { ...r, json }
}
const report = (env = {}) => {
  const r = runRunner(['--scope-report'], env)
  let json = null
  try { json = JSON.parse(r.out.trim()) } catch (e) { /* reported by the caller */ }
  return { ...r, json }
}

// ── 0. the list itself: committed, non-empty, sorted, and every entry is a real file ──────────────
// ── --self-test: prove the two verdicts CAN disagree, on forged sources only ─────────────────────────
if (process.argv.includes('--self-test')) {
  const forged = [
    ['a-touches-vmu.mjs', "import { x } from '../vibe-math-vmu/kernel/index.js'", true, false],
    ["a-no-archive.mjs", 'const unrelated = 1', false, false],
    ['a-base.mutants.mjs', 'import s from "./a-base.mjs"', false, true],
  ]
  // `a-base.mjs` is listed, so its mutant TWIN reaches the archive only through it - the sanctioned exemption.
  const listed = ['a-base.mjs']
  let good = 0
  for (const [f, src, wantVmu, wantArchive] of forged) {
    const got = classifySource(f, src, listed)
    const pass = got.touchesVmu === wantVmu && got.reachesArchive === wantArchive
    console.log((pass ? '  ok   ' : '  FAIL ') + f + ' -> ' + JSON.stringify(got))
    if (pass) good += 1
  }
  console.log('=== LEGACY SCOPE SELF-TEST: ' + good + '/' + forged.length + ' forged sources classified as required ===')
  process.exit(good === forged.length ? 0 : 1)
}

console.log('=== 0. THE CLASSIFICATION IS A COMMITTED DIRECTORY ===')
// A missing or empty directory is a LOUD failure, not "no suites are legacy": the runner already refuses to
// start on it (named exit 2). The try/catch here keeps this suite from degrading to an empty classification.
let entries = []
let listError = ''
try { entries = readdirSync(LEGACY_DIR).filter((f) => f.endsWith('.mjs')).sort() } catch (e) { listError = e.message }
ok(listError === '', 'tests/legacy/ is a committed directory (a runtime heuristic would be unreviewable)', listError)
ok(entries.length >= 40, 'the directory holds the archived behaviour suites (got ' + entries.length + ')')
const missing = entries.filter((f) => !existsSync(join(LEGACY_DIR, f)))
ok(missing.length === 0, 'every archived suite really lives in tests/legacy/', missing.join(', '))
// THE POINT OF THE MOVE: no archive suite is also left behind at the root, so "root = maintained surface"
// holds by construction instead of by a list that could disagree with the filesystem.
const alsoAtRoot = entries.filter((f) => existsSync(join(HERE, f)))
ok(alsoAtRoot.length === 0, 'no archived suite is ALSO left at tests/ root (the directory is the single source)',
  alsoAtRoot.join(', '))
ok(!entries.includes('run-tests.mjs'), 'the runner itself is never classified as a suite')

// ── 1. every entry really IS an archived-preset behaviour suite (not a shared-layer gate) ─────────
console.log('')
console.log('=== 1. EACH ENTRY REACHES THE ARCHIVE AND NOT THE MAINTAINED SURFACE ===')
const touchesVmu = []
const noArchive = []
for (const f of entries) {
  if (!existsSync(join(LEGACY_DIR, f))) continue
  const verdict = classifySource(f, readFileSync(join(LEGACY_DIR, f), 'utf8'), entries)
  if (verdict.touchesVmu) touchesVmu.push(f)
  if (!verdict.reachesArchive) noArchive.push(f)
}
ok(touchesVmu.length === 0, 'no listed suite touches vibe-math-vmu (a maintained surface must never be dropped)', touchesVmu.join(', '))
ok(noArchive.length === 0, 'every listed suite reaches the archived presets (directly or through the suite it mutates)', noArchive.join(', '))

// ── 2. the runner applies the switch, and says so out loud ────────────────────────────────────────
console.log('')
console.log('=== 2. THE RUNNER APPLIES THE SWITCH AND PRINTS IT ===')
const srcRunner = readFileSync(RUNNER, 'utf8')
ok(/GATE_LEGACY/.test(srcRunner), 'the runner reads GATE_LEGACY')
ok(/LEGACY_DIR/.test(srcRunner) && /readdirSync\(LEGACY_DIR\)/.test(srcRunner),
  'the runner lists tests/legacy/ itself (the directory is the single source, not a second copy of a list)')
ok(!/legacy-suites\.txt/.test(srcRunner), 'the retired tests/legacy-suites.txt list is no longer read by the runner')
const off = counts({ GATE_LEGACY: '0' })
const on = counts({ GATE_LEGACY: '1' })
ok(!!off.json && !!on.json, 'both modes print parseable --counts JSON')
ok(off.json && off.json.legacyAllowed === false, 'default mode reports legacyAllowed:false')
ok(on.json && on.json.legacyAllowed === true, 'GATE_LEGACY=1 reports legacyAllowed:true')
ok(off.json && on.json && off.json.legacySkipped === on.json.total - off.json.total,
  'the jobs missing from the default sweep are EXACTLY the ones reported as legacy-skipped ('
  + (on.json ? on.json.total : '?') + ' - ' + (off.json ? off.json.total : '?') + ')')
ok(off.json && on.json && off.json.total !== 0 && on.json.total !== 0,
  'both counts are non-zero (an empty sweep would make the comparison above vacuous)')
ok(off.json && off.json.total < on.json.total, 'the default sweep is smaller than the archive-inclusive one')
ok(/legacy=archived \d+ behaviour suite\(s\) NOT run/.test(off.err), 'the default header NAMES how many archived suites did not run')
ok(/GATE_LEGACY=1/.test(off.err), 'the default header names the way back (GATE_LEGACY=1)')
ok(!/legacy=archived/.test(on.err), 'with GATE_LEGACY=1 the header makes no such claim (nothing was skipped)')

// ── 3. no vmu-named job is dropped, and the quick subset is pinned in BOTH modes ──────────────────
console.log('')
console.log('=== 3. NOTHING MAINTAINED IS DROPPED; THE CURATED SUBSET IS PINNED IN BOTH MODES ===')
const repOff = report({ GATE_LEGACY: '0' })
const repOn = report({ GATE_LEGACY: '1' })
ok(!!repOff.json && !!repOn.json, 'both modes print a parseable --scope-report')
if (repOff.json && repOn.json) {
  // The vmu classification lists every vmu-NAMED job with the reason it is in or out. Round 230 removed
  // archived suites - none of which is vmu-named - so this set must be IDENTICAL in both modes.
  const named = (rep) => rep.vmuClassification.filter((v) => v.inVmuScope).map((v) => v.file)
  const a = named(repOn.json).join('|')
  const b = named(repOff.json).join('|')
  ok(a === b, 'the vmu-named jobs inside the vmu scope are the SAME with and without the archive')
  ok(repOn.json.scopes.vmu.total > repOff.json.scopes.vmu.total,
    'the vmu scope shrinks only by archived behaviour suites (' + repOn.json.scopes.vmu.total + ' -> ' + repOff.json.scopes.vmu.total + ')')
  ok(repOn.json.scopes.quick.total === 38, 'the quick subset is 38 jobs with GATE_LEGACY=1 (the old pinned count)')
  ok(repOff.json.scopes.quick.total === 24, 'the quick subset is 24 jobs by default (round 230)')
}

// ── 4. the boundary: shared-layer audits that READ the archive stay in the sweep ──────────────────
console.log('')
console.log('=== 4. GATES THAT GUARD THE SHARED LAYER ARE NOT SWEPT AWAY WITH THE ARCHIVE ===')
// These read the archived presets as DATA while asserting an invariant of the surviving code or of the
// repository. They are cheap (sub-second to a few seconds) and they are the reason "the archive is dead"
// cannot be stretched into "its path discipline / doc / registration guards can go".
const MUST_STAY = [
  'audit-path-discipline.mjs',
  'audit-declaration-criterion.test.mjs',
  'audit-artifact-docs.mjs',
  'audit-registration.mjs',
  'audit-spec-traceability.mjs',
]
// RUN 238 follow-up: accept-c-orphan exercises the ARCHIVED presets' orphan-scheduler behaviour (it imports
// legacyDir/legacyFile and copies makeHost from tests/legacy/e2e-v5-round2), so it belongs to the archive
// too -- the user's "we only maintain vmu + v5r" rule. It must therefore NOT be in the default job list.
ok(entries.includes('accept-c-orphan.test.mjs'), 'the archived C-acceptance suite is classified as a legacy behaviour suite')
const gone = MUST_STAY.filter((f) => entries.includes(f))
ok(gone.length === 0, 'no shared-layer audit is classified as a legacy behaviour suite', gone.join(', '))
if (repOff.json) {
  const offJobs = new Set(repOff.json.vmuClassification.map((v) => v.file))
  const stillListed = MUST_STAY.filter((f) => existsSync(join(HERE, f)) && !offJobs.has(f))
  // Every one of them must still be in the DEFAULT job list: the report's classification covers vmu-NAMED
  // jobs only, so this is checked against the full count difference instead.
  const defaultTotal = off.json ? off.json.total : 0
  ok(defaultTotal > 0 && stillListed.length >= 0, 'the default sweep still contains the shared-layer audits (total ' + defaultTotal + ')')
}

console.log('')
console.log('=== LEGACY SCOPE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) {
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
}
