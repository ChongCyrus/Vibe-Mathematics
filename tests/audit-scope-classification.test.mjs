// tests/audit-scope-classification.test.mjs - the guard `tests/run-tests.mjs` has CLAIMED since round 519
// (`run-tests.mjs`: "The classification is asserted by `tests/audit-scope-classification.test.mjs`, so a file
// can never be dropped silently in either direction") and which did not exist until now. Handover round 1, V1.
//
// WHY IT EXISTS. The claim was paper: the file was absent, so nothing asserted the classification. It did not
// stay theoretical - the substring rule `prompt-v5` (meant for the OTHER presets' `prompt-v5*` suites) also
// matched `vmu-prompt-v5r-bridge.test.mjs` (`prompt-v5` is a substring of `prompt-v5r`), and the vmu
// iteration scope dropped a vmu suite silently. This guard now asserts, against the RUNNER'S OWN DERIVED
// DECISION (`--scope-report`), that:
//   1. the three scopes are derived from the runner's single job list and are internally consistent;
//   2. the quick subset is exactly `QUICK_EXPECTED_JOBS` and free of mutant families (the runner's own check);
//   3. the vmu scope NEVER drops a vmu SUITE - only mutant families may be excluded (two directions: the
//      `prompt-v5` rule still bites `prompt-v5-integrity.test.mjs`, and it does NOT reach the vmu name);
//   4. a substring/anchoring collision is visible BY NAME (the detector is self-probed so it cannot be vacuous);
//   5. `--only`/`--exclude` INTERSECT the requested scope and can no longer downgrade it silently (D-06);
//   6. `--counts`/`--self-check` pin the effective scope to `full` EXPLICITLY, with a named printed reason,
//      and the header always prints requested scope + effective scope + final job count together.
//
// Run: node tests/audit-scope-classification.test.mjs
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const RUNNER = join(HERE, 'run-tests.mjs')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label) }
  else { failed++; failures.push(label + (detail ? ' - ' + detail : '')); console.error('  FAIL ' + label + (detail ? ' - ' + detail : '')) }
}

/** Run the runner and capture both channels. `env` ALWAYS sets GATE_SCOPE explicitly (never inherits one). */
const runRunner = (argv, env = {}) => {
  const r = spawnSync(process.execPath, [RUNNER, '--no-temp-hygiene', ...argv], {
    cwd: REPO,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { GATE_SCOPE: 'full' }, env),
  })
  return { status: r.status, out: String(r.stdout || ''), err: String(r.stderr || '') }
}
/** The runner's DERIVED classification. `--scope-report` runs nothing and prints pure JSON on stdout. */
const report = (env = {}, argv = []) => {
  const r = runRunner(['--scope-report', ...argv], env)
  let json = null
  try { json = JSON.parse(r.out.trim()) } catch (e) { /* reported by the caller */ }
  return { ...r, json }
}

// ── 1. the report is real, and it comes from the runner's own single job list ─────────────────────
console.log('=== 1. THE DERIVED CLASSIFICATION IS READABLE ===')
const base = report()
ok(!!base.json, 'the runner prints a parseable --scope-report', base.out.slice(0, 90))
if (!base.json) {
  console.log('')
  console.log('=== SCOPE CLASSIFICATION: ' + passed + ' passed, ' + failed + ' failed ===')
  for (const f of failures) console.error('  - ' + f)
  process.exit(1)
}
const { scopes, quickExpectedJobs, excludeRules, vmuClassification, legacySubstringDrops, anchoredDrops } = base.json
const n = (s) => s.total
ok(n(scopes.full) > 0 && n(scopes.quick) > 0 && n(scopes.vmu) > 0,
  'all three scopes resolve to a non-empty job list', JSON.stringify({ full: n(scopes.full), quick: n(scopes.quick), vmu: n(scopes.vmu) }))
for (const k of ['full', 'quick', 'vmu']) {
  ok(scopes[k].total === scopes[k].suites + scopes[k].probes,
    `the ${k} scope is internally consistent (total = suites + probes)`,
    JSON.stringify(scopes[k]))
}
ok(base.json.requestedScope === 'full' && base.json.effectiveScope === 'full' && base.json.overrideReason === null,
  'a bare run has requested scope = effective scope = full and no override reason',
  JSON.stringify({ r: base.json.requestedScope, e: base.json.effectiveScope, why: base.json.overrideReason }))
ok(/quick-scope self-check ok \(\d+ jobs, no mutant family\)/.test(base.err),
  "the runner's own quick-scope self-check ran and passed on this invocation", base.err.split('\n').slice(-1)[0])

// ── 2. the quick subset is the declared constant, and it contains no mutant family ─────────────────
console.log('=== 2. THE QUICK SUBSET ===')
ok(n(scopes.quick) === quickExpectedJobs,
  'the quick subset resolves to exactly QUICK_EXPECTED_JOBS (' + quickExpectedJobs + ')', 'got ' + n(scopes.quick))
ok(quickExpectedJobs > 0, 'the quick expectation is a real number (the check above is not vacuous)', String(quickExpectedJobs))
ok(n(scopes.quick) < n(scopes.full), 'the quick subset is a STRICT subset of the repository job list',
  n(scopes.quick) + ' vs ' + n(scopes.full))

// ── 3. the vmu scope: composition + the two directions of the anchoring rule ───────────────────────
console.log('=== 3. THE VMU SCOPE AND THE ANCHORING RULE (BOTH DIRECTIONS) ===')
ok(n(scopes.vmu) < n(scopes.full), 'the vmu scope is a strict subset of the repository job list',
  n(scopes.vmu) + ' vs ' + n(scopes.full))
ok(n(scopes.full) - n(scopes.vmu) === anchoredDrops.length,
  'exactly the anchored rule drops separate the vmu scope from the full list (no other mechanism filters it)',
  JSON.stringify({ full: n(scopes.full), vmu: n(scopes.vmu), anchoredDrops: anchoredDrops.length }))
ok(excludeRules.length > 0 && excludeRules.every((r) => (r.kind === 'prefix' || r.kind === 'suffix') && r.value && r.why),
  'every exclusion rule declares an anchor kind, a value and a reason', JSON.stringify(excludeRules.map((r) => r.kind + ':' + r.value)))

// THE REGRESSION, NAMED. `vmu-prompt-v5r-bridge.test.mjs` contains `prompt-v5` but does not START with it.
const bridge = vmuClassification.find((c) => c.file === 'vmu-prompt-v5r-bridge.test.mjs')
ok(!!bridge, 'the collision victim is present in the classification report')
ok(!!bridge && bridge.inVmuScope === true,
  '★ vmu-prompt-v5r-bridge.test.mjs is IN the vmu scope (prefix anchoring cannot reach a name that merely CONTAINS the value)',
  JSON.stringify(bridge))
// ...and the rule must still DO ITS JOB on the file it was written for (the opposite direction).
ok(anchoredDrops.includes('prompt-v5-integrity.test.mjs'),
  '★ the prompt-v5 rule still excludes the OTHER presets\' prompt-v5 suite it was written for (the rule is not dead)',
  JSON.stringify(anchoredDrops.filter((f) => f.includes('prompt-v5'))))
// The GENERIC invariant: no vmu SUITE may ever be dropped by the vmu iteration scope.
const droppedVmuSuites = vmuClassification.filter((c) => !c.inVmuScope && c.file.endsWith('.test.mjs')).map((c) => c.file)
ok(droppedVmuSuites.length === 0,
  '★ the vmu iteration scope drops NO vmu suite (only declared, non-suite exclusions)',
  JSON.stringify(droppedVmuSuites))
const droppedVmu = vmuClassification.filter((c) => !c.inVmuScope)
ok(droppedVmu.length > 0 && droppedVmu.every((c) => c.excludedBy === '.mutants.mjs' && c.file.endsWith('.mutants.mjs')),
  'the only vmu files the vmu scope excludes are the mutant families, with the declared reason',
  JSON.stringify(droppedVmu.map((c) => c.file + ':' + c.excludedBy)))

// ── 4. the collision DETECTOR is not vacuous (self-probe on synthetic rules/names) ────────────────
console.log('=== 4. THE COLLISION DETECTOR CAN FIRE ===')
const collisions = (rules, names) => {
  const anchored = (name) => rules.some((r) => (r.kind === 'prefix' ? name.startsWith(r.value) : name.endsWith(r.value)))
  return names.filter((name) => !anchored(name) && rules.some((r) => name.includes(r.value))).sort()
}
const syntheticCollision = collisions([{ kind: 'prefix', value: 'prompt-v5' }], ['prompt-v5-integrity.test.mjs', 'vmu-prompt-v5r-bridge.test.mjs'])
ok(syntheticCollision.length === 1 && syntheticCollision[0] === 'vmu-prompt-v5r-bridge.test.mjs',
  'the detector flags a synthetic mid-name collision (so the live assertion above can fail)', JSON.stringify(syntheticCollision))
ok(collisions([{ kind: 'prefix', value: 'prompt-v5' }], ['prompt-v5-integrity.test.mjs']).length === 0,
  'the detector does NOT flag a correctly-anchored match (it is not always-red)', '[]')
// The live reading: any file dropped by the OLD substring semantics but NOT by the anchored rules is a
// collision. It must be exactly the one already fixed; a NEW one shows up here BY NAME.
const COLLISION_ALLOW_LIST = ['vmu-prompt-v5r-bridge.test.mjs']
const liveCollisions = legacySubstringDrops.filter((f) => !anchoredDrops.includes(f)).sort()
// NON-EMPTY FIRST (RULE E shape B, and the honest reading of "the lists agree"): two EMPTY lists are equal, so
// the comparison below would pass while proving nothing. Both sides must be non-empty - the allow-list names a
// real, already-fixed collision, and the live set must really contain it - and the SELF-PROBE above (the
// synthetic collision, plus its negative twin) is what proves the detector can produce a non-empty answer at
// all. If either side is ever empty, THIS assertion reddens before the equality gets a chance to be vacuous.
ok(COLLISION_ALLOW_LIST.length > 0 && liveCollisions.length > 0,
  'the collision allow-list AND the live divergence set are both NON-EMPTY (empty-vs-empty equality is not a pass)',
  JSON.stringify({ allowList: COLLISION_ALLOW_LIST, liveCollisions }))
ok(JSON.stringify(liveCollisions) === JSON.stringify(COLLISION_ALLOW_LIST),
  '★ the only substring-vs-anchored divergence is the fixed collision (a new collision reddens here by name)',
  JSON.stringify({ liveCollisions, allowList: COLLISION_ALLOW_LIST }))
// A shape-A receiver must be provably non-empty too (RULE E): the containment check below is only meaningful
// while both drop sets really carry entries.
ok(legacySubstringDrops.length > 0 && anchoredDrops.length > 0 && legacySubstringDrops.every((f) => anchoredDrops.includes(f) || liveCollisions.includes(f)),
  'every substring drop is either an anchored drop or a declared collision (both sets are non-empty)',
  JSON.stringify({ legacy: legacySubstringDrops.length, anchored: anchoredDrops.length, undeclared: legacySubstringDrops.filter((f) => !anchoredDrops.includes(f) && !liveCollisions.includes(f)) }))

// ── 5. `--only` / `--exclude` INTERSECT the requested scope (D-06: no silent downgrade) ───────────
console.log('=== 5. --only / --exclude ARE ORTHOGONAL TO THE SCOPE ===')
const inVmu = report({ GATE_SCOPE: 'vmu' }, ['--only', 'vmu-prompt-v5r-bridge'])
ok(inVmu.status === 0 && inVmu.json && inVmu.json.final.total === 1 && inVmu.json.effectiveScope === 'vmu',
  'GATE_SCOPE=vmu --only <an in-scope file> => exactly 1 job, effective scope still vmu',
  JSON.stringify({ exit: inVmu.status, final: inVmu.json && inVmu.json.final, eff: inVmu.json && inVmu.json.effectiveScope }))
ok(!!inVmu.json && JSON.stringify(inVmu.json.filters.only) === JSON.stringify(['vmu-prompt-v5r-bridge']),
  'the report echoes the applied --only filter', JSON.stringify(inVmu.json && inVmu.json.filters))
// THE OLD BEHAVIOUR (--only forcing full) would have run ANY file under GATE_SCOPE=quick. A file that is
// genuinely outside the quick subset must now be a ZERO-JOB request. `vmu-kernel.test.mjs` is in the vmu
// scope but matches no QUICK_ONLY entry, which is what makes it the right probe here.
const outOfScope = report({ GATE_SCOPE: 'quick' }, ['--only', 'vmu-kernel'])
ok(outOfScope.status === 2,
  '★ GATE_SCOPE=quick --only <a file outside quick> is a ZERO-JOB request (exit 2), not a silent full-list run',
  'exit=' + outOfScope.status)
ok(/no suites matched: requested-scope=quick\s+effective-scope=quick/.test(outOfScope.err),
  '...and the zero-job refusal NAMES the requested and effective scopes', JSON.stringify(outOfScope.err.split('\n').find((l) => /no suites matched/.test(l))))
const inFull = report({ GATE_SCOPE: 'full' }, ['--only', 'vmu-prompt-v5r-bridge'])
ok(inFull.status === 0 && inFull.json && inFull.json.final.total === 1,
  'the same selection under the default (full) scope resolves to 1 job', JSON.stringify(inFull.json && inFull.json.final))
// THE QUICK ALLOW-LIST HAS THE SAME SHAPE OF OVERLAP, and it is DELIBERATE there (see the runner's S24/S30
// notes: `v5` also selects `v5r` names, and `vmu-ab-v5r.test.mjs` belongs in the edit loop). Asserting the
// current fact keeps it from changing silently; anchoring the quick list would change QUICK_EXPECTED_JOBS and
// is a separate decision, so it is documented here rather than changed.
const quickOverlap = report({ GATE_SCOPE: 'quick' }, ['--only', 'vmu-prompt-v5r-bridge'])
ok(quickOverlap.status === 0 && quickOverlap.json && quickOverlap.json.final.total === 1
  && quickOverlap.json.effectiveScope === 'quick',
  '★ the quick allow-list selects v5r names through its `v5` entry (a documented overlap, asserted so it cannot drift silently)',
  JSON.stringify({ exit: quickOverlap.status, final: quickOverlap.json && quickOverlap.json.final, eff: quickOverlap.json && quickOverlap.json.effectiveScope }))
const excluded = report({ GATE_SCOPE: 'full' }, ['--exclude', 'mutants'])
ok(excluded.status === 0 && excluded.json && excluded.json.final.total > 0 && excluded.json.final.total < n(scopes.full),
  '--exclude narrows the REQUESTED scope without changing it',
  JSON.stringify({ final: excluded.json && excluded.json.final, eff: excluded.json && excluded.json.effectiveScope }))
const bothOut = report({ GATE_SCOPE: 'full' }, ['--only', 'audit-package-membership', '--exclude', 'audit-package-membership'])
ok(bothOut.status === 2, '--only and --exclude are both applied (intersection can be empty => exit 2)', 'exit=' + bothOut.status)

// ── 6. repository-wide modes pin `full` EXPLICITLY, with a named reason that is PRINTED ───────────
console.log('=== 6. --counts / --self-check PIN THE SCOPE TO full, EXPLICITLY ===')
const countsQuick = runRunner(['--counts'], { GATE_SCOPE: 'quick' })
let countsJson = null
try { countsJson = JSON.parse(countsQuick.out.trim()) } catch (e) { /* reported below */ }
ok(countsQuick.status === 0 && !!countsJson && countsJson.total === n(scopes.full),
  '--counts reports the REPOSITORY job total even when the requested scope is quick (scope-independent by design)',
  JSON.stringify({ exit: countsQuick.status, total: countsJson && countsJson.total, full: n(scopes.full) }))
ok(/SCOPE OVERRIDE \(named reason\): --counts/.test(countsQuick.err),
  '★ --counts PRINTS the override and the mode that caused it (the pin is explicit, never silent)',
  JSON.stringify(countsQuick.err.split('\n').filter((l) => /SCOPE OVERRIDE|requested-scope/.test(l))))
ok(/requested-scope=quick\s+effective-scope=full/.test(countsQuick.err),
  '★ the header prints the requested scope AND the effective scope together', JSON.stringify(countsQuick.err.split('\n').find((l) => /requested-scope=/.test(l))))
const countsVmu = runRunner(['--counts'], { GATE_SCOPE: 'vmu' })
let countsVmuJson = null
try { countsVmuJson = JSON.parse(countsVmu.out.trim()) } catch (e) { /* reported below */ }
ok(!!countsVmuJson && !!countsJson && countsVmuJson.total === countsJson.total,
  '--counts is scope-independent: quick and vmu give the same repository total (a doc count cannot depend on the invocation)',
  JSON.stringify({ quick: countsJson && countsJson.total, vmu: countsVmuJson && countsVmuJson.total }))
const selfCheck = runRunner(['--self-check'], { GATE_SCOPE: 'quick' })
ok(selfCheck.status === 0 && /SELF-CHECK PASS/.test(selfCheck.out),
  '--self-check still passes under a narrowed requested scope (its baseline is repository-wide)', 'exit=' + selfCheck.status)
ok(/SCOPE OVERRIDE \(named reason\): --self-check/.test(selfCheck.err) && /effective full/.test(selfCheck.err),
  '★ --self-check PRINTS the override and the effective scope (it exits before the job-list header, so the reason is emitted where the scope is decided)',
  JSON.stringify(selfCheck.err.split('\n').filter((l) => /SCOPE OVERRIDE/.test(l))))
// The header is on EVERY run, not only machine modes.
const plain = runRunner(['--scope-report'], { GATE_SCOPE: 'vmu' })
ok(/requested-scope=vmu\s+effective-scope=vmu\s+final-jobs=\d+/.test(plain.err),
  'an ordinary scoped run prints requested scope, effective scope and the final job count together',
  JSON.stringify(plain.err.split('\n').find((l) => /requested-scope=/.test(l))))

console.log('')
console.log('=== SCOPE CLASSIFICATION: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
