#!/usr/bin/env node
/**
 * PARALLEL TEST RUNNER — run every shipped suite AND every probe (or a filtered subset)
 * concurrently and report per-suite timings, so the strategy for the next run is chosen
 * from DATA instead of guesswork.
 *
 * Why this exists: the suites are wildly uneven (one suite is ~160 s, most are under 2 s), so a
 * sequential sweep spends almost all of its wall time waiting for the slowest one. Running them
 * with a worker pool makes the sweep bounded by the slowest SUITE rather than by their SUM.
 * On this machine (4 cores) the sweep went from ~5.5 min to ~2 min; see ../docs/test-timing.md.
 *
 * WHAT IS COLLECTED (Round B): `tests/` holds two families of `.mjs`:
 *   · `*.test.mjs` — the suites proper;
 *   · every other `.mjs` beside this runner — the PROBES that prove those suites are not
 *     vacuous (sensitivity mutations, the registration surface, the self-driving guards).
 * Collecting only the first family was a false green: two probe suites sat at exit 1 while
 * every report said "30/30 green". Both families are therefore collected, and a script can
 * only stay out through the explicit, documented `NEEDS_ARGS` list below — a stale entry in
 * that list is a hard error in a development checkout (`.git` present), so no script can be
 * dropped silently there. Scripts whose bare run under-covers get argument `VARIANTS` (e.g.
 * `audit-registration.mjs` defaults to v3 alone). A PUBLISHED tarball ships only a subset of
 * `tests/`; there the missing entries are reported instead of aborting the run.
 *
 * Every suite already isolates itself (each creates its own mkdtemp workspace), so parallelism is
 * safe. Suites that WRITE a corpus take a per-run corpus dir from an env var; this runner points
 * them at a scratch dir when it runs a suite more than once, which it never does — but the probe
 * runner (audit-formal-sensitivity.mjs) does, and it passes its own dirs.
 *
 * Usage:
 *   node tests/run-tests.mjs                      # every suite + probe, concurrency = min(2, cpus) (measured: 4 oversubscribes)
 *   node tests/run-tests.mjs --concurrency=6
 *   node tests/run-tests.mjs --only formal        # substring match on the file name (repeatable, OR)
 *   node tests/run-tests.mjs --exclude e2e-v4     # substring to skip (repeatable)
 *   node tests/run-tests.mjs --json               # machine-readable summary on stdout
 *   node tests/run-tests.mjs --temp-age-hours=12  # temp hygiene: stale-scratch threshold (default 6 h)
 *   node tests/run-tests.mjs --temp-dry-run       # temp hygiene: print the plan, delete nothing
 *   node tests/run-tests.mjs --no-temp-hygiene    # skip the sweep and the roomier-drive temp root
 *
 * GATE DISCIPLINE (measured 2026-10 on a 4-core box; the numbers are why these defaults exist):
 *   · DEFAULT CONCURRENCY STAYS 2. `--concurrency=4` is faster but noisier (per-job inflation ~+15%);
 *     `--concurrency=6` is NOT VIABLE: at k=6 this sweep was RED with one 180 s TIMEOUT and one real
 *     failure. Never raise a TIMEOUT to fit oversubscription - fix the load, not the budget.
 *   · `GATE_SCOPE=quick` (or `--scope quick`) is the ITERATION subset: v5 work + shared parity/contract +
 *     the registration surface, with EVERY `*.mutants.mjs` excluded and the 135 s shared sensitivity probe
 *     left to `full`. It is for the edit loop only and is NOT a substitute for the full sweep.
 *   · The FULL sweep (the default, `GATE_SCOPE=full`) is REQUIRED before every commit and release. It
 *     cannot be skipped, shortened or cancelled for speed, and it runs the same jobs as before this change.
 *   · Long jobs are started FIRST (LPT: static measured weights + file-name tiebreak, deterministic).
 *     Measured effect at concurrency 2: wall 1878.1 s -> ~1447.6 s (simulated from that run's own per-job
 *     timings), with NO change to which jobs run, no assertion removed and no semantics relaxed.
 *
 * INCREMENTAL FULL (`GATE_INCREMENTAL=1`, default OFF => today's behaviour byte-for-byte):
 *   · It SKIPS a mutant family only when every source file that family reads/copies/mutates (its target
 *     set) is outside the changed set since the recorded baseline. The JOB LIST NEVER SHRINKS: skipped
 *     families still count in TOTAL and are reported as `SKIP <family> (incremental: targets unchanged …)`.
 *   · BASELINE: a file OUTSIDE the repository, `GATE_BASELINE_FILE` (default
 *     `D:\_tmp\gate-full-baseline.txt`), holding the commit of the last GREEN FULL sweep. This runner only
 *     READS it. It is written by the gate flow after a green full sweep
 *     (`git rev-parse HEAD > D:\_tmp\gate-full-baseline.txt`) or by `--write-baseline`, which REFUSES to
 *     write unless the sweep is FULL and GREEN - a red or partial tree must never become a baseline.
 *   · RELEASE RULE (hard): before a commit/release/tag the FULL, non-incremental sweep is REQUIRED.
 *     `GATE_RELEASE=1` ignores `GATE_INCREMENTAL` entirely and runs everything.
 *   · NEVER SILENTLY UNDERRUN: an unreadable baseline, a baseline that is not an ancestor of HEAD, a
 *     failing `git diff`/`status`, a family with no declared targets, or ANY disagreement between the
 *     declared targets and what the harness's own source touches => that family RUNS (named reason on
 *     stderr). Declaring a SUPERSET of targets is safe; declaring a SUBSET is not - hence the re-derivation.
 *   · ROLLBACK: delete the `planIncremental(suites)` call (and its two consumers) to restore a full sweep.
 *
 * HEADSTART (`GATE_HEADSTART_MIN_MS`, default 600000 ms = 10 min; `0` disables it):
 *   · When the longest EXECUTED job's estimate is >= `GATE_HEADSTART_MIN_MS`, that job is started FIRST and
 *     ALONE for up to `GATE_HEADSTART_MS` (default 180000 ms = 3 min) - or until it finishes, whichever
 *     comes first. Only the SECOND slot's start time changes: this is for load-sensitive heavy families
 *     (measured: the 907 s family needs ~920 s alone, but ran 969 s beside a heavy peer in the gate).
 *   · It changes NO semantics: the job list, the criteria, the timeouts, `--counts`, `GATE_SCOPE`,
 *     `GATE_INCREMENTAL`, the LPT order and the reports all stay as they are. `0` (for either variable)
 *     turns the behaviour off; `GATE_HEADSTART_MS=0` releases the second slot immediately.
 *   · The two stderr diagnostics and the named post-run assertion (see runSpanCheck) make it verifiable:
 *     a deferred job that started BEFORE the release would RED BY NAME.
 *   · ROLLBACK: set `GATE_HEADSTART_MIN_MS=0` (no code change needed).
 */
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { cpus, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
// Suites live beside this runner, but they resolve the presets and the corpora from the
// repository root, so they must keep running with that as their working directory.
const REPO = fileURLToPath(new URL('../', import.meta.url))
const argv = process.argv.slice(2)
// Accept BOTH `--only=x` and `--only x` (the help text used the space form, which a value-taking
// flag() did not understand — the filter silently did nothing and every suite still ran).
const flag = (name) => {
  const out = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--' + name && i + 1 < argv.length && !argv[i + 1].startsWith('--')) out.push(argv[++i])
    else if (a.startsWith('--' + name + '=')) out.push(a.split('=').slice(1).join('='))
  }
  return out
}
const has = (name) => argv.includes('--' + name)
const only = flag('only')
const exclude = flag('exclude')
// TEMP HYGIENE (task-12): a suite killed by the per-suite timeout cannot clean up, and some suites
// create many workspace dirs per run — measured here: %TEMP% held 160,923 top-level entries, 144,404 of
// them stale suite dirs (oldest ~2 weeks). Sweep the stale ones (top level, EXTRACTED suite prefixes,
// older than --temp-age-hours) and prefer the roomier drive's temp root; `os.tmpdir()` follows TEMP/TMP,
// so the suites need NO change. Hygiene must never break the sweep itself, and it reports on **stderr**
// because stdout is a MACHINE-READABLE channel here (`--counts`/`--json` are JSON.parsed by callers).
// Machine modes (`--self-check`, `--counts`) must not DELETE anything: the first is a guard the mutant
// family runs repeatedly, the second is called by scripts/update-doc-counts.mjs on every check - a sweep
// there is a surprising side effect (and a slow one). Only a genuine test sweep cleans up.
if (!has('no-temp-hygiene') && !has('self-check') && !has('counts')) {
  try {
    const { suitePrefixes, sweep, preferredTempRoot, useTempRoot, listProcesses, suspectProcesses } = await import('../scripts/clean-temp.mjs')
    if (useTempRoot(preferredTempRoot())) console.error('run-tests: temp root -> ' + process.env.TEMP + ' (roomier drive preferred; D:\\_tmp when present)')
    sweep({
      prefixes: suitePrefixes(),
      ageHours: Number(flag('temp-age-hours')[0] || 6),
      dryRun: has('temp-dry-run'),
      log: (m) => console.error(m),
    })
    // task-15 (MEASURED): a LEFTOVER process can steal a whole core and make honest suites look flaky - a
    // leftover DSH host with 197,410 s CPU turned a 2822 s gate into 7875 s and amplified single suites
    // 1.3x-4.5x. REPORT ONLY: the gate never kills anything it did not start (that decision belongs to a
    // human, via `node scripts/clean-temp.mjs --ps [--kill]`).
    const susp = suspectProcesses(listProcesses(), { selfPids: [process.pid, process.ppid] })
    if (susp.length) {
      console.error('run-tests: WARNING - ' + susp.length + ' suspected LEFTOVER process(es) (orphaned, project/team):')
      for (const s of susp) console.error('  pid=' + s.pid + '  ' + String(s.cmd || '').slice(0, 110))
      console.error('run-tests: leftover CPU load makes honest suites flaky; inspect with `node scripts/clean-temp.mjs --ps` (add --kill to stop them).')
    }
  } catch (e) { console.error('run-tests: temp hygiene skipped (' + ((e && e.message) || e) + ')') }
}
// task-29: HOST-INDEPENDENT GATE. Whether THIS machine has TeX Live installed must not decide whether the
// suites that assert the "no LaTeX engine here" degradation are green: on this dev box `D:\texlive\...`
// really exists and the product now FINDS it (that is the task-28 fix), so those suites would redden for a
// reason that has nothing to do with the code under test. Point every child suite (they inherit
// `process.env` — see runSuite's spawn, which passes no `env`) at ONE empty scratch directory through the
// four documented-root sandbox gates: the product still probes every documented TeX root, one by one,
// inside that empty directory, finds nothing, and `triedPaths` still NAMES what it looked at. Real-machine
// discovery is covered by the SLV live runs, not by the gate; `audit-engine-faces` FACE 3 drives an
// explicit `paperLatexCommand`, which the sandbox never touches (only the known-install stage is rebased).
// Nothing else about the sweep changes; the scratch dir is removed when the runner exits.
const TEX_ROOTS_SANDBOX_DIR = mkdtempSync(join(tmpdir(), 'vibe-gate-tex-sandbox-'))
process.env.V2_TEX_ROOTS_SANDBOX = TEX_ROOTS_SANDBOX_DIR
process.env.V3_TEX_ROOTS_SANDBOX = TEX_ROOTS_SANDBOX_DIR
process.env.V4_TEX_ROOTS_SANDBOX = TEX_ROOTS_SANDBOX_DIR
process.env.V5_TEX_ROOTS_SANDBOX = TEX_ROOTS_SANDBOX_DIR
process.on('exit', () => { try { rmSync(TEX_ROOTS_SANDBOX_DIR, { recursive: true, force: true }) } catch (e) { /* best effort: a leftover empty scratch dir must never fail the gate */ } })
const asJson = has('json')
// task-13 (MEASURED): the default used to be min(4, cpus) = 4 on this 4-core box, and the heavy jobs then
// ran 1.3x-4.5x SLOWER than standalone - the gate's own "slowest" lines recorded v2-fix-probes.mutants
// 430 s standalone -> 568-651 s under the gate, v5-institute-fixes.mutants 202 s -> 419-900 s (the last
// one TIMING OUT at its own 900 s override). That oversubscription is what made timing-sensitive suites
// report failures that never reproduce standalone (e2e-v4-fixes T1/T19/T22/T23/T26/T31, e2e-v5-round2
// paper phase, host-failure-paths stall watchdog). Two concurrent jobs keep the machine honest; pass
// --concurrency=N explicitly when a faster (noisier) sweep is wanted.
const concurrency = Math.max(1, Number(flag('concurrency')[0] || Math.min(2, cpus().length)))

const SELF = 'run-tests.mjs'
// Per-suite HARD timeout (GATE_SUITE_TIMEOUT_MS overrides, ms). It bounds an intermittent hang so the
// gate always terminates and a hang is reported - never mistaken for "still running". 180 s comes from
// measurements: whole-gate wall ~200 s, slowest honest suite 135-144 s (audit-math-computation-sensitivity),
// so 180 s bounds a hang without killing an honest slow suite. Do NOT raise it silently to "fix" reds.
const SUITE_TIMEOUT_MS = Math.max(1000, Number(process.env.GATE_SUITE_TIMEOUT_MS || 180000))

// S22: the MUTANT-FAMILY budget. A family job legitimately runs 20+ minutes (one child per family,
// each child booting the plugin), so the 180 s default would misreport an honest family as a hang.
// Families therefore get their own default, and it must keep a REAL margin against the measured wall:
// history for v5-institute-fixes.mutants.mjs is 1319/1342/1352/1399/1456 s (this session's full
// 151-family sweeps) against the 1500 s it used to get — only 3–12% headroom, which is exactly how a
// RED sweep (three TIMEOUTs) gets mistaken for a stuck job. 2400 s gives 1456 s => 1.65x and 1157.9 s
// (two concurrent copies) => 2.07x. RULE: a family budget is measured, never guessed — keep
// measured x >= 1.65 (>= 2x under concurrency) and record the measurement here whenever it moves. The
// timeout is NOT removed: 2400 s still catches a real hang as "TIMEOUT after 2400s".
const FAMILY_TIMEOUT_MS = Math.max(1000, Number(process.env.GATE_FAMILY_TIMEOUT_MS || 2400000))
/** Mutant families are the heavy class; everything else keeps 180 s unless named in the overrides. */
function isFamilyJob(file) { return /\.mutants\.mjs$/.test(String(file || '')) }

// NAMED per-suite overrides for suites that are HONEST but slow (measured, not guessed). Raising a
// limit is a documented act: update the numbers here AND say so in the commit message - never silently.
//   v2-fix-probes.mutants.mjs: ~43.1 s per family x 10 families ~= 430 s measured (inner child cap 120 s)
//   v3-fix-probes.mutants.mjs: ~23.5 s per family x 11 families ~= 260 s measured (inner child cap 120 s)
// Both report hangs=[] with their own 120 s child cap, i.e. they are slow, not hung - so the 180 s
// default would misreport them. Everything else keeps the 180 s default.
const TIMEOUT_OVERRIDES = {
  'v2-fix-probes.mutants.mjs': 1200000,   // MEASURED 464.8 s standalone => 2.58x; 900 s was only 1.94x (below the 2x rule)
  'v3-fix-probes.mutants.mjs': 900000,    // MEASURED 267.9 s standalone => 3.36x (ample)
  // v5-institute-fixes.mutants.mjs: MEASURED 201.9 s wall (hangs=[], skipped=[], ALL MUTANTS RED
  // AS REQUIRED) - i.e. OVER the 180 s default, so it gets the same 900 s as the v2/v3 families.
  // History worth keeping: a writer CLAIMED this family fitted its override when it did not, and the
  // gate caught it as "FAILED: v5-institute-fixes.mutants.mjs [probe] (TIMEOUT after 180s)" - the
  // named-timeout mechanism doing its job. (The older note here claimed formal-verify-v4.mutants.mjs
  // MEASURED 70.9 s with ample headroom - that became STALE as the family grew; see its own entry below.)
  // (Re-measured in the 44-family sweep: 1032.6 s standalone, exit 0, skipped=[], hangs=[] — the 900 s
  //  that gate #10 killed it with was BELOW its own measurement. Budget set to 1500000 (25 min) by the
  //  maintainer: the known standalone figure is 1054 s and the same sweep measured 1157.7/1157.9 s with
  //  two copies running concurrently, so the extra headroom absorbs gate-load amplification.)
  // (S22) The 1500 s that gate #10 killed it with is GONE: it sat at only 3–12% headroom over the
  // measured 1319–1456 s — exactly how a red sweep (three TIMEOUTs) gets mistaken for a stuck job.
  // Kept EXPLICIT (documented, not merely inherited) and now equal to the family default 2400 s.
  'v5-institute-fixes.mutants.mjs': 2400000,   // MEASURED 1319/1342/1352/1399/1456 s => 1.65x;
                                               // 1157.9 s with two concurrent copies => 2.07x
  // e2e-v4-fixes.test.mjs: MEASURED, not guessed (task-13). Its cases script an institute and pump
  // member followups; the pump loops used FIXED iteration caps (i<300 etc.) which, under a loaded gate,
  // ran out BEFORE the plugin's next scheduling tick produced the verification/debate wakes.
  // Instrumented proof under load: `T1 DEBUG: {"fi":300,"fu":302,"running":true,"phase":"active",
  // "autoDone":false}` - the run was ALIVE (not concluded, so NOT a product race), the loop had simply
  // exhausted its cap. The loops now also stop on a wall-clock deadline (LOOP_CAP_MS, default 45 s per
  // loop, reached only in that pathological case, so healthy runs are unchanged), and the suite honestly
  // needs more than the 180 s default: it MEASURED 160.2 s wall under the gate before this change.
  // 420 s = that measurement + headroom for the bounded deadlines. Never raise this silently.
  'e2e-v4-fixes.test.mjs': 420000,        // MEASURED 98.0 s standalone => 4.3x (its 160.2 s gate figure is the binding one)
  // formal-verify-v4.mutants.mjs: the family grew after the 70.9 s note above was written. Re-measured
  // for task-13: 146.2 s standalone and 212.7 s with three heavy peers in parallel (ALL MUTANTS RED AS
  // REQUIRED in both) - i.e. it legitimately exceeds the 180 s default under gate load, where a killed
  // family then reports its children's F-5/N15/N18 assertions as failures (which reads like a regression
  // but is only the timeout). 900 s matches the sibling families' convention.
  'formal-verify-v4.mutants.mjs': 900000,   // MEASURED 100.5 s standalone => 9x (the 212.7 s gate figure is the binding one)
  // run-tests.mutants.mjs: MEASURED ~23 s silently standalone, yet the certified gate has now reported
  // it as "FAILED: run-tests.mutants.mjs [probe] (TIMEOUT after 180s)" THREE times, every time with its
  // own counts still green - i.e. amplified by gate concurrency, not hung. It is legitimately heavy: the
  // suite embeds several full `run-tests.mjs` runs and scans large directories, so its wall time scales
  // with peer load. 900 s matches the sibling families' convention (the assertion set and semantics are
  // untouched - only the time budget moves).
  'run-tests.mutants.mjs': 900000,        // MEASURED 62.7 s / 93.0 s / 128.3 s standalone and 225.3 s with two
                                          // copies concurrent; the gate killed it at the 180 s default three
                                          // times (it embeds several full run-tests runs + scans large dirs) => 900 s
}
/** One place decides a job limit: explicit job value, then the named override, then (S22) the family
 *  default for `*.mutants.mjs`, then the 180 s suite default. Every layer has a safe default, so a
 *  caller never has to configure anything for a green sweep — and a family can still be caught hanging. */
function jobLimit(job) {
  if (job.timeoutMs) return job.timeoutMs
  if (TIMEOUT_OVERRIDES[job.file]) return TIMEOUT_OVERRIDES[job.file]
  if (isFamilyJob(job.file)) return FAMILY_TIMEOUT_MS
  return SUITE_TIMEOUT_MS
}

// ── Scheduling: longest-processing-time first (LPT) ────────────────────────────────────────────────
// MEASURED WEIGHTS: per-job seconds from the 2026-10 full sweep at concurrency 2 (the run whose summary
// was `wall 1878.1s · sum of suite times 2895.3s · speed-up x1.54`, TOTAL 106 PASS 106 FAIL 0). Starting
// the long poles FIRST is what removes the "the 907 s job only begins near the end" tail: re-simulating
// that same run with this order gives ~1447.6 s (about -23%) WITHOUT changing which jobs run.
// STALENESS IS SAFE: if a weight goes stale (a suite grew or shrank), only the ORDER is suboptimal -
// correctness is untouched, because the job list itself is DERIVED and the file-name tiebreak keeps the
// order fully deterministic (no randomness anywhere). Unknown/new files get DEFAULT_WEIGHT and run last.
// ROLLBACK: deleting the single `suites = lptOrder(suites)` line restores plain alphabetical order.
const DURATION_WEIGHTS = {
  // MEASURED over four full sweeps this session: 1483.6 / 1509.9 / 1981.6 s (31-33 min on a loaded machine)
  // plus 1319-1456 s in the history below. The old weight (906.9) under-stated it by ~2x, which mis-scheduled
  // the headstart window; 1800 s is the measured midpoint, and the 2400 s timeout above still covers the worst.
  'v5-institute-fixes.mutants.mjs': 1800,
  'v2-fix-probes.mutants.mjs': 453.6,
  'v3-fix-probes.mutants.mjs': 249.5,
  'audit-math-computation-sensitivity.mjs': 127.6,
  'e2e-v4-fixes.test.mjs': 96.1,
  'v4-final-paper.mutants.mjs': 96.1,
  'v2-list-agents-and-next-step.mutants.mjs': 92.3,
  'formal-verify-v4.mutants.mjs': 91.5,
  'formal-verify-v2.test.mjs': 58.1,
  'run-tests.mutants.mjs': 52.1,
  'e2e-v5-round2.test.mjs': 47.0,
  'v2-fix-probes.test.mjs': 40.3,
}
const DEFAULT_WEIGHT = 2
const weightOf = (j) => DURATION_WEIGHTS[j.file] || DEFAULT_WEIGHT
/** Deterministic LPT: measured duration DESC, then label ASC. No randomness, ever. */
function lptOrder(list) {
  return list.slice().sort((a, b) => (weightOf(b) - weightOf(a)) || (label(a) < label(b) ? -1 : 1))
}

// ── Gate scopes (GATE_SCOPE=quick|vmu|full; default full = exactly today's sweep) ──────────────────
// `quick` is the ITERATION subset: v5 work + the shared parity/contract surfaces + the registration
// surface, with EVERY `*.mutants.mjs` excluded (the 26 families are ~2/3 of the sweep's sum) and the
// 135 s shared sensitivity probe left to `full`. MEASURED with the probe still included at concurrency 2:
// `wall 144.1s · sum 287.1s` and `TOTAL 24 PASS 24 FAIL 0`; without it the subset is 23 jobs.
// `quick` is for the edit loop ONLY and is NOT a substitute for the full sweep, which stays REQUIRED
// before every commit and release (see the GATE DISCIPLINE note at the top of this file).
const QUICK_ONLY = ['v5', 'audit-participant-set-parity', 'audit-math-computation-parity',
  'audit-math-computation-contract', 'math-computation-shared', 'audit-registration',
  'audit-preset-rows', 'audit-status-report-fields', 'audit-artifact-docs']
const QUICK_EXCLUDE = ['mutants', 'audit-math-computation-sensitivity']
// Includes the existing accept-ab-v5-minimal and v5-tool-help suites in addition to
// the prior 24 jobs; keep the fixed count so accidental scope changes still fail.
const QUICK_EXPECTED_JOBS = 26
// `vmu` is the ITERATION subset for developing the vmu framework: the vmu jobs themselves, plus every
// gate that guards a SHARED surface a vmu change can reach (preset rows and the generated patch,
// the installer, package membership, README/doc counts, path discipline, artifact docs, the shared
// math modules and their contract, the runner's own self-tests, temp hygiene). It deliberately EXCLUDES
// every preset-INTERNAL behavioural family: a vmu change never touches another preset's plugin source,
// so those families are reached at full scope by `GATE_INCREMENTAL` (target-derived) and by the
// non-incremental release sweep, which stays REQUIRED at every milestone (see the same note above).
const VMU_ONLY = ['vmu-', 'run-tests.mutants',
  'audit-preset-rows', 'audit-preset-mechanism', 'audit-preset-declaration-group',
  'audit-installer-compat', 'audit-installer-policy', 'audit-installer-assertions.mutants',
  'audit-package-membership', 'audit-readme-counts', 'audit-path-discipline',
  'audit-artifact-docs', 'audit-math-computation-parity', 'audit-math-computation-contract',
  'audit-registration', 'temp-hygiene']
/** Apply a scope's curated filter. `full` is the identity (byte-for-byte the old behaviour). */
function applyScope(list, scope) {
  if (scope !== 'quick' && scope !== 'vmu') return list
  const only = scope === 'vmu' ? VMU_ONLY : QUICK_ONLY
  const filtered = list.filter((j) => only.some((x) => label(j).includes(x)))
  return scope === 'quick'
    ? filtered.filter((j) => !QUICK_EXCLUDE.some((x) => label(j).includes(x)))
    : filtered
}
// Scope is parsed HERE (not next to the job list) so every helper below - including the ones the
// `--self-check` block calls - sees an initialised value. `full` is the identity.
const GATE_SCOPE = String(process.env.GATE_SCOPE || flag('scope')[0] || 'full').toLowerCase()
if (GATE_SCOPE !== 'quick' && GATE_SCOPE !== 'vmu' && GATE_SCOPE !== 'full') {
  console.error('unknown GATE_SCOPE: ' + GATE_SCOPE + ' (expected quick|vmu|full)')
  process.exit(2)
}
// An ITERATION scope must NEVER change machine behaviour. Diagnostics (`--self-check`), explicit
// selection (`--only`), the documented counts (`--counts`) and baseline writing are properties of the
// REPOSITORY, not of an edit loop: a scope that narrowed them would (a) make documented counts depend on
// how the run was invoked, and (b) break any guard that spawns this runner as a child - exactly the two
// failures the vmu scope produced on its first run (`run-tests.mutants.mjs` children inherited the scope,
// so its `--only audit-prompt-invariants` timeout POSITIVE saw zero jobs and its `--self-check` baseline
// diverged, and `audit-readme-counts` read a scoped total of 27 instead of 110). `--json` is deliberately
// NOT in this list: a machine-readable ITERATION report is a legitimate use of a scope.
const MACHINE_MODE = has('counts') || has('self-check') || flag('only').length > 0
const SCOPE = MACHINE_MODE ? 'full' : GATE_SCOPE

// ── INCREMENTAL FULL: a family's TARGETS are the repo files it reads/copies/mutates ────────────────
// DERIVED FROM EACH HARNESS'S OWN SOURCE (never guessed): `const PRESET`/`const MAIN` fields, `editFile:`
// entries, `const SRC = join(REPO, …)` copy roots, the per-family `preset:` fields, and explicit repo
// paths in the harness. Families that are NOT listed are B-tier and ALWAYS run: this table deliberately
// omits every family whose target set could not be read off its source with confidence, because declaring
// a SUPERSET is safe (fewer skips) while declaring a SUBSET would skip a family that really changed.
const FAMILY_TARGETS = {
  'v2-fix-probes.mutants.mjs': ['vibe-math-v2/vibe-math-v2.js'],
  'v3-fix-probes.mutants.mjs': ['vibe-math-v3/vibe-math-v3.js'],
  'formal-verify-v3.mutants.mjs': ['vibe-math-v3/vibe-math-v3.js'],
  'formal-verify-v4.mutants.mjs': ['vibe-math-v4/vibe-math-v4.js'],
  'v4-final-paper.mutants.mjs': ['vibe-math-v4/vibe-math-v4.js'],
  'math-computation-v4.mutants.mjs': ['vibe-math-v4/vibe-math-v4.js', 'vibe-math-v4/math-engines.js'],
  'selfdrive-v5.mutants.mjs': ['vibe-math-v5/vibe-math-v5.js'],
  'v5-institute-fixes.mutants.mjs': ['vibe-math-v5/vibe-math-v5.js', 'vibe-math-v5/math-computation.js'],
  'math-computation-archive-rerun.mutants.mjs': ['vibe-math-v2/math-engines.js', 'vibe-math-v2/math-computation.js'],
  'math-computation-discovery.mutants.mjs': ['vibe-math-v2/math-engines.js', 'vibe-math-v2/math-computation.js'],
  'audit-installer-assertions.mutants.mjs': ['installer.js'],
  'release-check.mutants.mjs': ['scripts/release-check.mjs'],
  'temp-hygiene.mutants.mjs': ['scripts/clean-temp.mjs'],
  'run-tests.mutants.mjs': ['tests/run-tests.mjs'],
  'audit-v5-prompt-duplication.mutants.mjs': ['vibe-math-v5/agent.cordis.yml'],
  // Multi-preset families whose harness carries a per-family `preset:`/`file:` list: the declared set is a
  // measured SUPERSET of the presets they can touch, so a newly added preset is never skipped by accident.
  'v2v3-interrupt.mutants.mjs': ['vibe-math-v2/vibe-math-v2.js', 'vibe-math-v3/vibe-math-v3.js'],
  'e2e-identity-a6.mutants.mjs': ['vibe-math-v2/vibe-math-v2.js', 'vibe-math-v3/vibe-math-v3.js',
    'vibe-math-v4/vibe-math-v4.js', 'vibe-math-v5/vibe-math-v5.js'],
  'audit-path-discipline.mutants.mjs': ['vibe-math-v2/vibe-math-v2.js', 'vibe-math-v3/vibe-math-v3.js',
    'vibe-math-v4/vibe-math-v4.js', 'vibe-math-v5/vibe-math-v5.js'],
  'math-computation-a1.mutants.mjs': ['vibe-math-v2/math-computation.js', 'vibe-math-v3/math-computation.js',
    'vibe-math-v4/math-computation.js', 'vibe-math-v5/math-computation.js'],
  'audit-v5-lean-abstention.mutants.mjs': ['vibe-math-v5/vibe-math-v5.js', 'vibe-math-v5/math-computation.js',
    'vibe-math-v5/math-engines.js'],
  'audit-persona-surface.mutants.mjs': ['vibe-math-v2/vibe-math-v2.js'],
  'v2-list-agents-and-next-step.mutants.mjs': ['vibe-math-v2/vibe-math-v2.js'],
  'audit-status-report-fields.mutants.mjs': ['docs/status-report-fields.md', 'vibe-math-v2/vibe-math-v2.js'],
  'audit-artifact-docs.mutants.mjs': ['docs/COMPAT-AUDIT-ROUND2.md', 'README.md', 'vibe-math-v4/vibe-math-v4.js'],
  'audit-readme-counts.mutants.mjs': ['README.md', 'README.en.md', 'package.json'],
  'audit-package-membership.mutants.mjs': ['package.json'],
}
/**
 * Re-derive a family's targets from its OWN source text. Returns a Set, or null when nothing could be
 * derived (=> the family always runs). Only the patterns above are used, so a harness that changes shape
 * simply stops participating in skipping instead of being skipped on a stale assumption.
 */
function deriveFamilyTargets(file) {
  let text
  try { text = readFileSync(join(HERE, file), 'utf8') } catch (e) { return null }
  const out = new Set()
  const preset = /const PRESET = '([^']+)'/.exec(text)
  if (preset) out.add(preset[1] + '/' + preset[1] + '.js')
  for (const e of text.matchAll(/editFile: '([^']+)'/g)) {
    out.add(preset ? preset[1] + '/' + e[1] : e[1])
  }
  for (const s of text.matchAll(/join\(REPO,\s*'([^']+)',\s*'([^']+)'\)/g)) out.add(s[1] + '/' + s[2])
  for (const s of text.matchAll(/join\(REPO,\s*'([^']+)'\)/g)) out.add(s[1].replace(/\\/g, '/'))
  for (const p of text.matchAll(/preset: '(vibe-math-v\d)'/g)) out.add(p[1] + '/' + p[1] + '.js')
  for (const p of text.matchAll(/'(docs\/[^']+)'/g)) out.add(p[1])
  for (const p of text.matchAll(/'(README(?:\.[a-z]{2})?\.md)'/g)) out.add(p[1])
  if (/run-tests\.mjs/.test(text) && /RUNNER/.test(text)) out.add('tests/run-tests.mjs')
  if (/'installer\.js'/.test(text)) out.add('installer.js')
  if (/'package\.json'/.test(text)) out.add('package.json')
  return out.size ? out : null
}
/** A family may be skipped only when the declared targets COVER everything its source touches. */
function familySkippable(file) {
  if (!file.endsWith('.mutants.mjs')) return false
  const declared = FAMILY_TARGETS[file]
  if (!declared) return false                       // B-tier: no declared targets => always run
  const derived = deriveFamilyTargets(file)
  if (!derived) return false                        // nothing derivable => never skip blindly
  for (const d of derived) {
    if (!declared.some((t) => d === t || d.startsWith(t + '/'))) return false
  }
  return true
}
// ── Baseline + changed set (read-only; the baseline file lives OUTSIDE the repository) ─────────────
// A FUNCTION (not a constant) so the self-check can point it at a deliberately unreadable path and prove
// that an unreadable baseline skips nothing.
const baselineFilePath = () => String(process.env.GATE_BASELINE_FILE || 'D:\\_tmp\\gate-full-baseline.txt')
/** Read a commit id from a baseline file; null when missing/unreadable/unparseable (=> run everything). */
function readBaselineFrom(file) {
  let raw
  try { raw = readFileSync(file, 'utf8') } catch (e) { return null }
  const m = /^[0-9a-f]{7,40}$/m.exec(String(raw).trim())
  return m ? m[0] : null
}
function gitOut(args) {
  try { return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }
  catch (e) { return null }
}
/** Committed changes since `base` UNION the uncommitted working-tree paths. null => "cannot tell". */
function changedFilesSince(base) {
  const committed = gitOut(['diff', '--name-only', base + '..HEAD'])
  if (committed === null) return null
  const out = new Set(committed.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))
  const dirty = gitOut(['status', '--porcelain'])
  if (dirty === null) return null
  for (const line of dirty.split(/\r?\n/)) {
    const p = line.slice(3).trim()
    if (p) out.add(p.includes(' -> ') ? p.split(' -> ').pop() : p)
  }
  return out
}
const isChanged = (changed, target) => changed.has(target) || [...changed].some((c) => c === target || c.startsWith(target + '/'))
/**
 * The incremental decision. `enabled:false` means "run everything" and always carries a named reason.
 * Skipped families are returned as FILE NAMES; the job list itself is never filtered.
 */
function planIncremental(list) {
  if (String(process.env.GATE_INCREMENTAL || '') !== '1') {
    return { enabled: false, reason: 'GATE_INCREMENTAL not set (default = full sweep)', skipped: [] }
  }
  if (SCOPE !== 'full') {
    return { enabled: false, reason: 'GATE_SCOPE=' + SCOPE + ' (incremental applies to full only)', skipped: [] }
  }
  if (String(process.env.GATE_RELEASE || '') === '1') {
    return { enabled: false, reason: 'GATE_RELEASE=1 (release/tag => forced full sweep)', skipped: [] }
  }
  const baseline = readBaselineFrom(baselineFilePath())
  if (!baseline) {
    return { enabled: false, reason: 'no readable baseline at ' + baselineFilePath() + ' => running everything', skipped: [] }
  }
  if (gitOut(['merge-base', '--is-ancestor', baseline, 'HEAD']) === null) {
    return { enabled: false, reason: 'baseline ' + baseline + ' is not an ancestor of HEAD => running everything', skipped: [] }
  }
  const changed = changedFilesSince(baseline)
  if (!changed) {
    return { enabled: false, reason: 'git diff/status failed => running everything', skipped: [] }
  }
  const skipped = []
  const ranBecause = []
  for (const j of list) {
    if (!j.file.endsWith('.mutants.mjs')) continue
    if (!familySkippable(j.file)) { ranBecause.push(j.file); continue }
    if (FAMILY_TARGETS[j.file].some((t) => isChanged(changed, t))) continue
    skipped.push(j.file)
  }
  return { enabled: true, reason: '', baseline, changed, skipped, ranBecause }
}

// ── HEADSTART: give the longest job a head start alone, then open the second slot ──────────────────
// Fixes a LOAD-SENSITIVE flake, not a product bug: the heaviest family measured 920 s alone and 969 s
// beside a heavy peer under the default 2-way gate. Nothing about what runs changes - only WHEN the
// second slot starts. `GATE_HEADSTART_MIN_MS=0` (or `GATE_HEADSTART_MS=0`) turns it off.
const HEADSTART_DEFAULT_MIN_MS = 600000   // the longest job must be at least this heavy to be isolated
const HEADSTART_DEFAULT_HOLD_MS = 180000  // how long the second slot waits (at most) for that head start
/** Estimate in ms: an explicit `weightMs` (synthetic jobs / tests) or the measured weight in seconds. */
const weightMsOf = (j) => (j.weightMs != null ? j.weightMs : Math.round(weightOf(j) * 1000))
function headstartMinMs() {
  const raw = process.env.GATE_HEADSTART_MIN_MS
  if (raw === undefined || raw === '') return HEADSTART_DEFAULT_MIN_MS   // DEFAULT: ON (see file header)
  return Math.max(0, Number(raw) || 0)                                   // 0 => disabled
}
function headstartHoldMs() {
  const raw = process.env.GATE_HEADSTART_MS
  if (raw === undefined || raw === '') return HEADSTART_DEFAULT_HOLD_MS
  return Math.max(0, Number(raw) || 0)                                   // 0 => release immediately
}
/** Index of the longest EXECUTED job (skipped families cost nothing => they are not isolated). */
function headstartJobIndex(list, skippedSet) {
  let best = -1
  for (let i = 0; i < list.length; i++) {
    if (skippedSet && skippedSet.has(list[i].file)) continue
    if (best < 0 || weightMsOf(list[i]) > weightMsOf(list[best])) best = i
  }
  return best
}
/**
 * The named proof for the head start: when it is active, every deferred start must be at/after the
 * release, at least one start must actually have been deferred, and (when released by the timer) the
 * release must not have happened before the hold expired. Returns a list of violated invariant names.
 */
function headstartViolations(hs) {
  if (!hs) return []
  const bad = []
  const TOLERANCE_MS = 100
  if (!hs.releasedAt) bad.push('the head start never reported a release (' + hs.file + ')')
  for (const t of hs.deferredStarts) {
    if (hs.releasedAt && t < hs.releasedAt - TOLERANCE_MS) {
      bad.push('a deferred job started at ' + t + ' BEFORE the release at ' + hs.releasedAt)
    }
  }
  if (hs.deferredStarts.length === 0 && hs.expected) bad.push('nothing was deferred although a second slot existed')
  if (hs.releasedBy === 'timer' && hs.releasedAt - hs.startedAt < headstartHoldMs() - 250) {
    bad.push('released by the timer after only ' + (hs.releasedAt - hs.startedAt) + 'ms of a ' + headstartHoldMs() + 'ms hold')
  }
  return bad
}
/**
 * DIAGNOSABILITY (protocol: every red must name an assertion): a failing suite's assertion NAMES are
 * what a reader needs, and they must appear under the FAILED line - not only in the suite's own last
 * stdout line. Extract the failing-assertion lines (this repo prints `  - <name>` or `  FAIL - <name>`,
 * and suites that abort print `FAILURES:`/`Error:` markers), and fall back to the raw tail when a suite
 * names nothing.
 */
/**
 * A reporting line's OWN prefix decides whether it names a failure. Anchored at the start (after the
 * reporter's indent) so a token appearing INSIDE a passing line (e.g. `  ok - FAIL - ★★★ message`) can
 * never be extracted as a failure — that false positive made a green run look red.
 *   own prefix: `FAIL`, `FAIL -`/`FAIL:`, `FAILURES:`; assertion bullets `- <name>` / `* <name>`; `✗`/`✘`.
 *   line-anchored abort markers: `SyntaxError:`, `TypeError:`, `ReferenceError:`, `Error:`.
 * `ok`-prefixed lines are excluded explicitly, so a passing bullet is never counted.
 */
function namedFailureLines(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.replace(/\s+$/, '')
    if (!l.trim()) continue
    if (/^\s*ok\b/.test(l)) continue                       // a PASSING line, whatever it contains
    if (/^\s*(?:FAIL\b|FAILURES:|✗|✘)/.test(l)) { out.push(l); continue }
    if (/^\s*(?:-|\*)\s+\S/.test(l)) { out.push(l); continue }
    if (/^\s*(?:SyntaxError|TypeError|ReferenceError|Error):/.test(l)) { out.push(l); continue }
  }
  return out
}

function failureDetail(r) {
  const lines = (String(r.out || '') + '\n' + String(r.err || '')).split('\n').map((l) => l.replace(/\s+$/, '')).filter(Boolean)
  const named = namedFailureLines(String(r.out || '') + '\n' + String(r.err || ''))
  const chosen = (named.length ? named : lines).slice(-40)
  return chosen.length ? chosen : ['(no captured output)']
}
// `--self-check`: prove the diagnostics above actually surface a NAME. Runs one synthetic failing child
// through the same extractor and asserts the extracted detail contains its assertion name; the mutant
// that strips `failureDetail` makes this red.
/** ONE place builds the failure line, so the reporter and the self-check cannot diverge. */
function failedLine(b) {
  const kind = '[' + b.job.kind + ']'
  const why = b.timedOut ? 'TIMEOUT after ' + Math.round(jobLimit(b.job) / 1000) + 's'
    : 'exit ' + b.code + (b.job.expectExit ? ', required exit ' + b.job.expectExit : '')
  return '  FAILED: ' + label(b.job) + ' ' + kind + ' (' + why + ')'
}

if (process.argv.includes('--self-check')) {
  const { spawnSync } = await import('node:child_process')
  const synth = spawnSync(process.execPath, ['-e', "console.error('  - synthetic assertion name XYZ'); process.exit(1)"], { encoding: 'utf8' })
  const detail = failureDetail({ out: synth.stdout, err: synth.stderr }).join('\n')
  const okSelf = detail.indexOf('synthetic assertion name XYZ') !== -1
  console.log((okSelf ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL') + ': a failing child yields a NAMED assertion line (' + detail.trim().slice(0, 80) + ')')
  // FALSE-POSITIVE direction: a PASSING line whose message literally contains `FAIL - ` must extract
  // NOTHING (the v2/v3 owner saw a green run look red this way).
  const leaked = namedFailureLines('  ok - FAIL - ★★★ [F2cap] the assertion message mentions FAIL - inside it\n')
  const okPassing = leaked.length === 0
  console.log((okPassing ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL') + ': a passing line containing "FAIL - " is NOT extracted as a failure (' + JSON.stringify(leaked) + ')')
  // FALSE-NEGATIVE direction stays closed: a genuine FAIL line and a line-anchored abort marker extract.
  const okReal = namedFailureLines('  FAIL - ★★★ real failure\n').length === 1
  const okAbort = namedFailureLines('TypeError: boom\n').length === 1
  console.log((okReal && okAbort ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL') + ': a genuine FAIL line and an abort marker are still extracted')
  // TIMEOUT case on the REAL path: a synthetic job that sleeps past a 1 s per-job limit, run through
  // the SAME runSuite/reporting path the gate uses. A string-only check could pass with a half-armed
  // timer; this one cannot, because it reads the run own timedOut/exit and the line the reporter builds.
  const slow = await runSuite({ file: '(synthetic-sleeper)', args: [], expectExit: 0, kind: 'probe', eval: 'setTimeout(() => {}, 5000)', timeoutMs: 1000 })
  const killedByRunner = slow.timedOut === true && slow.code !== 0
  const line = failedLine(slow)
  const namedTimeout = /FAILED: .*\[probe\] \(TIMEOUT after 1s\)/.test(line)
  console.log((killedByRunner ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL') + ': the RUNNER kills a sleeping job at its per-job limit (timedOut=true, exit=' + slow.code + ')')
  console.log((namedTimeout ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL') + ': the failure line names the timeout: ' + line.trim())
  // OVERRIDE case (real path): the named override must actually EXTEND the limit. A job that sleeps
  // 1.5 s would be killed by 1 s, so it must survive under the override and report its own seconds.
  // task-13: the list is DERIVED from the table. A hard-coded example went stale the moment
  // `formal-verify-v4.mutants.mjs` earned an override - and this self-check caught exactly that, by name
  // (which is why it is worth deriving: the invariant is "every entry resolves to its own limit, and an
  // unlisted file gets the default", not "these three files are the special ones").
  const NAMED_OVERRIDES = Object.keys(TIMEOUT_OVERRIDES)
  const overrideOk = NAMED_OVERRIDES.length > 0
    && NAMED_OVERRIDES.every((f) => jobLimit({ file: f }) === TIMEOUT_OVERRIDES[f] && jobLimit({ file: f }) > SUITE_TIMEOUT_MS)
    && jobLimit({ file: 'anything-else.mjs' }) === SUITE_TIMEOUT_MS
  const survived = await runSuite({ file: '(synthetic-ok)', args: [], expectExit: 0, kind: 'probe', eval: 'setTimeout(() => {}, 1500)', timeoutMs: 900000 })
  const extended = survived.timedOut === false && survived.code === 0
  const overrideLine = failedLine({ job: { file: 'v2-fix-probes.mutants.mjs', args: [], kind: 'probe', expectExit: 0 }, code: null, timedOut: true })
  // Derived from the table (not hardcoded): the point of this check is that a timed-out override reports
  // ITS OWN limit, so it must move with TIMEOUT_OVERRIDES. (It was hardcoded to 900s and went stale the
  // moment v2-fix-probes.mutants.mjs was re-measured at 464.8 s and raised to 1200 s.)
  const namesOverride = new RegExp('TIMEOUT after ' + (TIMEOUT_OVERRIDES['v2-fix-probes.mutants.mjs'] / 1000) + 's').test(overrideLine)
  console.log((overrideOk ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL') + ': a named override is resolved for its suite and nothing else')
  console.log((extended ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL') + ': a job that would die at 1 s SURVIVES under the override (real runSuite)')
  console.log((namesOverride ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL') + ': a timed-out override reports its own limit (' + overrideLine.trim() + ')')
  // INCREMENTAL baseline guard: an unreadable/absent baseline must skip NOTHING and must say why. The
  // env vars are restored immediately, so this cannot leak into the sweep that follows in the same process.
  const savedInc = process.env.GATE_INCREMENTAL
  const savedBase = process.env.GATE_BASELINE_FILE
  const savedRel = process.env.GATE_RELEASE
  process.env.GATE_INCREMENTAL = '1'
  process.env.GATE_BASELINE_FILE = join(tmpdir(), 'no-such-baseline-' + Date.now() + '.txt')
  delete process.env.GATE_RELEASE
  const noBaseline = planIncremental([{ file: 'selfdrive-v5.mutants.mjs', args: [], expectExit: 0, kind: 'probe' }])
  const noBaselineOk = noBaseline.enabled === false && noBaseline.skipped.length === 0
    && /no readable baseline/.test(String(noBaseline.reason))
  if (savedInc === undefined) delete process.env.GATE_INCREMENTAL; else process.env.GATE_INCREMENTAL = savedInc
  if (savedBase === undefined) delete process.env.GATE_BASELINE_FILE; else process.env.GATE_BASELINE_FILE = savedBase
  if (savedRel === undefined) delete process.env.GATE_RELEASE; else process.env.GATE_RELEASE = savedRel
  console.log((noBaselineOk ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL') + ': an unreadable baseline skips NOTHING (' + noBaseline.reason + ')')
  // HEADSTART proof (synthetic pool, the REAL machinery): with T=1 s and a 300 ms hold, the 1.5 s "longest"
  // job must start alone and the 50 ms job must not start until the release. Timestamps, not intentions.
  const savedHsMin = process.env.GATE_HEADSTART_MIN_MS
  const savedHsHold = process.env.GATE_HEADSTART_MS
  process.env.GATE_HEADSTART_MIN_MS = '1000'
  process.env.GATE_HEADSTART_MS = '300'
  const hsJobs = [
    { file: '(synthetic-longest)', args: [], expectExit: 0, kind: 'probe', eval: 'setTimeout(() => {}, 1500)', timeoutMs: 5000, weightMs: 900000 },
    { file: '(synthetic-deferred)', args: [], expectExit: 0, kind: 'probe', eval: 'setTimeout(() => {}, 50)', timeoutMs: 5000, weightMs: 1 },
  ]
  const hsOut = []
  const hsPool = await runPool(hsJobs, hsOut, new Set(), '(synthetic)')
  const hsBad = headstartViolations(hsPool.headstart)
  const hsOk = !!hsPool.headstart && hsBad.length === 0 && hsPool.headstart.releasedBy === 'timer'
    && hsPool.headstart.deferredStarts.length === 1
  if (savedHsMin === undefined) delete process.env.GATE_HEADSTART_MIN_MS; else process.env.GATE_HEADSTART_MIN_MS = savedHsMin
  if (savedHsHold === undefined) delete process.env.GATE_HEADSTART_MS; else process.env.GATE_HEADSTART_MS = savedHsHold
  console.log((hsOk ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL')
    + ': the head start runs the longest job alone and defers the second slot ('
    + (hsPool.headstart
      ? 'released by ' + hsPool.headstart.releasedBy + ' after ' + (hsPool.headstart.releasedAt - hsPool.headstart.startedAt)
        + 'ms; deferred=' + hsPool.headstart.deferredStarts.length
      : 'INACTIVE')
    + ')')
  process.exit(okSelf && okPassing && okReal && okAbort && killedByRunner && namedTimeout && overrideOk && extended && namesOverride && noBaselineOk && hsOk ? 0 : 1)
}
// The scripts that genuinely cannot run without arguments. They are named here (with the exact
// command a human must run) instead of being omitted quietly: an entry that no longer exists
// aborts the run, so a rename cannot turn into a silent gap.
const NEEDS_ARGS = {
  'audit-tool-exec.mjs': 'node tests/audit-tool-exec.mjs <preset-js> <tool-name>   (calls one real tool through the host path)',
}
// Argument variants, run IN ADDITION to the bare run unless `replaceBare` says the bare run is a
// strict subset of them. `expectExit` documents a probe whose SUCCESS is a non-zero exit (it
// mutates the source and requires the guarded check to fail): anything else is a FAIL here.
const VARIANTS = [
  // A bare `audit-registration.mjs` audits ONLY v3 (its `process.argv[2] || v3` default), so the
  // four presets are run explicitly and the redundant bare run is replaced.
  { file: 'audit-registration.mjs', args: ['vibe-math-v2/vibe-math-v2.js'], replaceBare: true },
  { file: 'audit-registration.mjs', args: ['vibe-math-v3/vibe-math-v3.js'] },
  { file: 'audit-registration.mjs', args: ['vibe-math-v4/vibe-math-v4.js'] },
  { file: 'audit-registration.mjs', args: ['vibe-math-v5/vibe-math-v5.js'] },
  // The invariant scanner's own falsifiability check: it exits 0 only when every injected
  // mutation really made a run go RED (and the unmutated control stayed green).
  { file: 'audit-prompt-invariants.mjs', args: ['--self-probe'] },
  // The participant-set proof, shipped: the guard's own predicates against broken strings.
  { file: 'audit-participant-set-parity.mjs', args: ['--self-probe'] },
  // R-6b SPLIT (user-approved 2026-10-10): the 168-family / 107-control monolith used to be ONE ~25-35 min job
  // whose timing tolerance was too narrow on a loaded host (seven sweeps lost exactly this job, each time a
  // different family). Three shards replace it; the BARE job is shard 0 (replaceBare), so the job total goes
  // 132 -> 134 and no job runs more than about a third of the file. Each shard prints its own shard index.
  { file: 'v5-institute-fixes.mutants.mjs', args: ['shard=0/3'], replaceBare: true },
  { file: 'v5-institute-fixes.mutants.mjs', args: ['shard=1/3'] },
  { file: 'v5-institute-fixes.mutants.mjs', args: ['shard=2/3'] },
  // §7/§8 predicates, shipped: same functions fed broken strings.
  { file: 'audit-math-computation-parity.mjs', args: ['--self-probe'] },
  // §30 verify-provenance predicates (case 3), shipped.
  { file: 'math-computation-shared.test.mjs', args: ['--self-probe'] },
  // The two-registration-paths probe, inverted: it applies a real description mutation and
  // REQUIRES the parity check to exit 1 (exit 2 means the mutation no longer applies = drift).
  {
    file: 'audit-v3-registration-parity.mjs',
    args: ['--self-probe', '["TOOL_DESC.vibe_math_start","TOOL_DESC.vibe_math_startX"]'],
    expectExit: 1,
  },
]

// A published tarball ships only a SUBSET of `tests/` (see docs/test-timing.md §1), so the
// scripts that stay behind are simply ABSENT there. The skip/variant lists are therefore
// enforced strictly in a development checkout (a `.git` entry marks one) and merely REPORTED —
// never silently dropped, they still appear in every run's output — in a partial tree.
let present = []
let presentSet = new Set()
let DEV_CHECKOUT = false
function label(j) { return j.file + (j.args.length ? ' ' + j.args.join(' ') : '') }
/**
 * The ONE place that derives the job list (the gate, `--counts` and `--self-check` all use it, so a
 * curated scope can never drift away from what actually runs). Deterministic base order = label ASC;
 * LPT reorders it afterwards.
 */
function deriveJobs() {
  present = readdirSync(HERE).filter((f) => f.endsWith('.mjs')).sort()
  presentSet = new Set(present)
  DEV_CHECKOUT = existsSync(join(REPO, '.git'))
  const stale = Object.keys(NEEDS_ARGS).filter((f) => !presentSet.has(f))
  if (stale.length && DEV_CHECKOUT) {
    console.error('NEEDS_ARGS names a script that no longer exists: ' + stale.join(', ') + ' — fix the skip list, do not delete the entry blindly')
    process.exit(2)
  }
  const replacedBare = new Set(VARIANTS.filter((v) => v.replaceBare).map((v) => v.file))
  const jobs = []
  for (const file of present) {
    if (file === SELF || NEEDS_ARGS[file] || replacedBare.has(file)) continue
    jobs.push({ file, args: [], expectExit: 0, kind: file.endsWith('.test.mjs') ? 'suite' : 'probe' })
  }
  for (const v of VARIANTS) {
    if (!presentSet.has(v.file)) {
      if (DEV_CHECKOUT) { console.error('a VARIANTS entry names a missing script: ' + v.file); process.exit(2) }
      continue
    }
    // A VARIANT is an EXTRA instrumented run of the SAME script (argument variants), never an additional
    // suite: the counting unit for `suites` is "the suites proper", one per script. Classifying by file name
    // here would inflate `suites` whenever a suite gains a `--self-probe` job (R18: it did, 44 -> 45).
    jobs.push({ file: v.file, args: v.args || [], expectExit: v.expectExit || 0, kind: 'probe' })
  }
  return jobs.sort((a, b) => (label(a) < label(b) ? -1 : 1))
}
// Scope first (curated subset), then the CLI filters, then scheduling. `full` is the identity, i.e. the
// default behaviour is byte-for-byte what it was before this change. (GATE_SCOPE itself is parsed above,
// beside the scope helpers, so the incremental planner and the self-check can both use it.)
let suites = applyScope(deriveJobs(), SCOPE)
if (only.length) suites = suites.filter((j) => only.some((o) => label(j).includes(o)))
if (exclude.length) suites = suites.filter((j) => !exclude.some((o) => label(j).includes(o)))
suites = lptOrder(suites)
if (!suites.length) { console.error('no suites matched'); process.exit(2) }
// The scope/concurrency header goes to STDERR so `--counts` and `--json` keep stdout machine-readable.
console.error('run-tests: scope=' + GATE_SCOPE + '  jobs=' + suites.length + '  concurrency=' + concurrency)
// SCOPE GUARDS (checked on EVERY run, not only under --self-check, because the gate is where a curated
// filter would hurt): the quick subset must resolve to a FIXED number of jobs and must contain NO mutant
// family. A drifted filter therefore REDS BY NAME instead of silently changing what the edit loop covers.
// Update QUICK_EXPECTED_JOBS only when the curated list changes ON PURPOSE (and say so in the commit).
{
  const quickList = applyScope(deriveJobs(), 'quick')
  const quickN = quickList.length
  const quickMutants = quickList.filter((j) => j.file.endsWith('.mutants.mjs')).map((j) => j.file)
  if (quickN !== QUICK_EXPECTED_JOBS) {
    console.error('FAIL - * gate scope: the quick subset must resolve to exactly ' + QUICK_EXPECTED_JOBS
      + ' jobs (got ' + quickN + ') - update QUICK_EXPECTED_JOBS only when the curated list changes on purpose')
    process.exit(1)
  }
  if (quickMutants.length) {
    console.error('FAIL - * gate scope: the quick subset must contain NO mutant family (got ' + quickMutants.join(', ') + ')')
    process.exit(1)
  }
  if (!asJson) console.error('run-tests: quick-scope self-check ok (' + quickN + ' jobs, no mutant family)')
}

// INCREMENTAL PLAN: computed ONCE here, before --counts, so the count line, the skip report and the run
// can never disagree about what is skipped. The job list is NOT filtered - only the execution is skipped.
const incremental = planIncremental(suites)
const skippedLabels = new Set(incremental.skipped)
if (incremental.enabled) {
  console.error('run-tests: incremental ENABLED (baseline ' + incremental.baseline
    + ', changed files ' + incremental.changed.size + ')')
  for (const f of incremental.skipped) {
    console.error('SKIP  ' + f + '  (incremental: targets unchanged vs ' + incremental.baseline + ')')
  }
  console.error('run-tests: incremental: skipped ' + incremental.skipped.length + ' mutant families (targets unchanged)'
    + (incremental.ranBecause.length ? '; always-run families: ' + incremental.ranBecause.length : ''))
} else {
  console.error('run-tests: incremental disabled -> running everything (' + incremental.reason + ')')
}
// SELF-CHECK (a): every skipped family's targets must be OUTSIDE the changed set (recomputed here, so a
// wrong skip can never pass silently). A violation is a NAMED red and stops the sweep before any job runs.
if (incremental.enabled) {
  for (const f of incremental.skipped) {
    const hit = (FAMILY_TARGETS[f] || []).find((t) => isChanged(incremental.changed, t))
    if (hit) {
      console.error('FAIL - * gate incremental: skipped ' + f + ' although ' + hit + ' changed since ' + incremental.baseline)
      process.exit(1)
    }
  }
}

// --counts: print the DERIVED suite/probe totals (the same job list the gate runs) as JSON, then
// exit. Docs quote these numbers, so they must be derived and checked rather than typed by hand.
// The job TOTAL never shrinks under incremental: the skipped families are reported in their own field.
if (process.argv.includes('--counts')) {
  const suiteN = suites.filter((j) => j.kind === 'suite').length
  console.log(JSON.stringify({
    total: suites.length, suites: suiteN, probes: suites.length - suiteN,
    incremental: incremental.enabled, incrementalSkipped: incremental.skipped.length,
  }))
  process.exit(0)
}

function runSuite(job) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const argv = job.eval ? ['-e', job.eval] : [join(HERE, job.file), ...job.args]
    const limitMs = jobLimit(job)
    const child = spawn(process.execPath, argv, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] })
    let timedOut = false
    const killer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL') } catch (e) { /* already gone */ } }, limitMs)
    const clearKiller = () => clearTimeout(killer)
    let out = '', err = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { err += d.toString() })
    child.on('error', (e) => { clearKiller(); resolve({ job, code: -1, ms: Date.now() - t0, out, err: err + '\n' + String(e), timedOut }) })
    child.on('close', (code) => { clearKiller(); resolve({ job, code, ms: Date.now() - t0, out, err, timedOut }) })
  })
}

let results = []
let gateStarted = 0
/**
 * Run ONE job into `out[i]` (skip-aware). Every dependency is a parameter, so the synthetic self-check can
 * exercise this exact machinery without touching the real job list.
 */
async function runOne(i, list, out, skippedSet, baselineLabel) {
  const job = list[i]
  if (skippedSet && skippedSet.has(job.file)) {
    // Incremental skip: the family is NOT executed, but it still counts in TOTAL and is reported by name
    // (stdout line + stderr list) so a reader can always see WHAT was skipped and WHY.
    out[i] = { job, code: 0, ms: 0, out: '', err: '', timedOut: false, skipped: true, ok: true }
    if (!asJson) {
      console.log('SKIP  ' + job.file.padEnd(34)
        + ' exit=  0          0.0s  (incremental: targets unchanged vs ' + baselineLabel + ')')
    }
    return
  }
  const r = await runSuite(job)
  const tail = String(r.out).trim().split('\n').filter(Boolean).slice(-1)[0] || ''
  r.ok = r.code === r.job.expectExit
  out[i] = r
  if (!asJson) {
    const mark = r.ok ? 'PASS' : 'FAIL'
    console.log(
      mark + '  ' + r.job.file.padEnd(34) +
      ' exit=' + String(r.code).padStart(3) + (r.job.expectExit ? '(want ' + r.job.expectExit + ')' : '    ') +
      '  ' + (r.ms / 1000).toFixed(1).padStart(6) + 's' +
      (r.job.args.length ? '  [' + r.job.args.join(' ').slice(0, 40) + ']' : '') +
      (tail ? '  ' + tail.slice(0, 60) : '')
    )
    if (!r.ok) {
      for (const l of failureDetail(r)) console.log('      ' + l)
    }
  } else if (!r.ok) {
    // In --json mode keep stdout machine-readable: the failure detail travels in the JSON.
    r.tailDetail = failureDetail(r).join('\n')
  }
}
/**
 * The worker pool, with the optional HEAD START for the longest EXECUTED job (see the file header). Only the
 * second slot's start time changes: worker 0 runs that job first and alone, the other workers wait for the
 * release (its completion, or `GATE_HEADSTART_MS`) before starting anything. Returns `{ headstart }`, which
 * is null when the behaviour was inactive and otherwise carries the timings the named proof checks.
 */
async function runPool(list, out, skippedSet, baselineLabel) {
  const minMs = headstartMinMs()
  const holdMs = headstartHoldMs()
  const hsIdx = minMs > 0 ? headstartJobIndex(list, skippedSet) : -1
  const executed = list.filter((j) => !(skippedSet && skippedSet.has(j.file))).length
  let hs = null
  if (hsIdx >= 0 && holdMs > 0 && executed >= 2 && weightMsOf(list[hsIdx]) >= minMs) {
    hs = {
      index: hsIdx, file: list[hsIdx].file, estMs: weightMsOf(list[hsIdx]), holdMs,
      startedAt: 0, releasedAt: 0, releasedBy: '', deferredStarts: [], expected: executed > 1,
    }
  }
  let cursor = 0
  let releaseHs = () => {}
  const hsReleased = new Promise((res) => { releaseHs = res })
  const release = (why) => {
    if (hs && !hs.releasedAt) { hs.releasedAt = Date.now(); hs.releasedBy = why; releaseHs() }
  }
  const takeIndex = () => {
    for (;;) {
      if (cursor >= list.length) return -1
      const i = cursor++
      if (hs && i === hs.index) continue        // reserved for worker 0
      return i
    }
  }
  async function worker(id) {
    if (hs) {
      if (id === 0) {
        hs.startedAt = Date.now()
        console.error('gate: headstart job=' + hs.file + ' est=' + hs.estMs + ' hold=' + hs.holdMs
          + ' (longest-job isolation)')
        const timer = setTimeout(() => release('timer'), hs.holdMs)
        try {
          await runOne(hs.index, list, out, skippedSet, baselineLabel)
        } finally {
          clearTimeout(timer)
          release('longest job finished')
          console.error('gate: headstart released ' + (hs.releasedBy === 'timer'
            ? 'after ' + (hs.releasedAt - hs.startedAt) + 'ms'
            : '(longest job finished after ' + (hs.releasedAt - hs.startedAt) + 'ms)'))
        }
      } else {
        await hsReleased
        hs.deferredStarts.push(Date.now())
      }
    }
    for (;;) {
      const i = takeIndex()
      if (i < 0) return
      await runOne(i, list, out, skippedSet, baselineLabel)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, list.length)) }, (_, i) => worker(i)))
  return { headstart: hs }
}
gateStarted = Date.now()
const poolInfo = await runPool(suites, results, skippedLabels, incremental.baseline)
// HEADSTART proof (named): a deferred job that started before the release, a hold that ended early, or an
// active head start that deferred nobody REDS BY NAME instead of passing quietly.
{
  const violations = headstartViolations(poolInfo.headstart)
  if (violations.length) {
    for (const v of violations) console.error('FAIL - * gate headstart: ' + v)
    process.exit(1)
  }
  if (!asJson && poolInfo.headstart) {
    console.error('gate: headstart proof ok (released by ' + poolInfo.headstart.releasedBy
      + '; deferred starts: ' + poolInfo.headstart.deferredStarts.length + ')')
  }
}

const wall = (Date.now() - gateStarted) / 1000
const sum = results.reduce((a, r) => a + r.ms, 0) / 1000
const bad = results.filter((r) => !r.ok)
const slowest = results.slice().sort((a, b) => b.ms - a.ms).slice(0, 5)
const suiteCount = results.filter((r) => r.job.kind === 'suite').length
const skippedResults = results.filter((r) => r.skipped)
// SELF-CHECK (c): the number of families this sweep skipped must equal the planner's number - the same
// number `--counts` reports as `incrementalSkipped`. A divergence is a NAMED red, never a quiet mismatch.
if (skippedResults.length !== incremental.skipped.length) {
  console.error('FAIL - * gate incremental: the sweep skipped ' + skippedResults.length
    + ' families but the plan/--counts said ' + incremental.skipped.length)
  process.exit(1)
}

if (asJson) {
  console.log(JSON.stringify({
    concurrency, wallSeconds: Number(wall.toFixed(1)), sumSeconds: Number(sum.toFixed(1)),
    pass: results.length - bad.length, fail: bad.length,
    suites: suiteCount, probes: results.length - suiteCount,
    devCheckout: DEV_CHECKOUT,
    skippedNeedsArgs: NEEDS_ARGS,
    incremental: incremental.enabled,
    incrementalSkipped: skippedResults.length,
    incrementalBaseline: incremental.enabled ? incremental.baseline : null,
    runs: results.map((r) => ({
      file: r.job.file, args: r.job.args, expectExit: r.job.expectExit, exit: r.code,
      seconds: Number((r.ms / 1000).toFixed(1)),
      ...(r.skipped ? { skipped: 'incremental: targets unchanged vs ' + incremental.baseline } : {}),
      ...(r.tailDetail ? { detail: r.tailDetail } : {}),
    })),
  }, null, 2))
} else {
  console.log('')
  console.log('concurrency ' + concurrency + '  ·  wall ' + wall.toFixed(1) + 's  ·  sum of suite times ' + sum.toFixed(1) + 's'
    + '  ·  speed-up x' + (sum / Math.max(wall, 0.001)).toFixed(2))
  console.log('slowest: ' + slowest.map((r) => r.job.file.replace('.test.mjs', '') + ' ' + (r.ms / 1000).toFixed(1) + 's').join('  ·  '))
  console.log('TOTAL ' + results.length + '  PASS ' + (results.length - bad.length) + '  FAIL ' + bad.length
    + (skippedResults.length ? '  SKIP ' + skippedResults.length + ' (incremental)' : '')
    + '  (suites ' + suiteCount + ' · probes ' + (results.length - suiteCount) + ')')
  for (const b of bad) {
    console.log(failedLine(b))
    for (const l of failureDetail(b)) console.log('      ' + l)
  }
  if (skippedResults.length) {
    console.log('skipped by incremental (targets unchanged vs ' + incremental.baseline + '): '
      + skippedResults.map((r) => r.job.file).join(', '))
  }
  for (const [f, why] of Object.entries(NEEDS_ARGS)) {
    console.log('  SKIPPED (needs CLI args): ' + f + ' — ' + why + (presentSet.has(f) ? '' : '  [not present in this checkout]'))
  }
}

// --write-baseline: only a FULL, GREEN sweep may record the baseline. A red or partial tree must never
// become the reference for a later incremental run (that is how "not yet verified" would be laundered
// into "unchanged"), so both refusals are named and turn the exit code red.
let exitCode = bad.length === 0 ? 0 : 1
if (has('write-baseline')) {
  if (GATE_SCOPE !== 'full') {
    console.error('refusing --write-baseline: GATE_SCOPE=' + GATE_SCOPE + ' (baselines come from a FULL green sweep)')
    exitCode = 1
  } else if (bad.length) {
    console.error('refusing --write-baseline: this sweep is RED (' + bad.length + ' failing) - a red tree must never become the baseline')
    exitCode = 1
  } else {
    const sha = String(gitOut(['rev-parse', 'HEAD']) || '').trim()
    if (!sha) {
      console.error('could not read HEAD; baseline NOT written')
      exitCode = 1
    } else {
      try {
        writeFileSync(baselineFilePath(), sha + '\n# written by tests/run-tests.mjs --write-baseline on a GREEN FULL sweep\n')
        console.log('baseline written: ' + baselineFilePath() + ' = ' + sha
          + (skippedResults.length ? '  (NOTE: this sweep skipped ' + skippedResults.length + ' families; a baseline should normally come from a NON-incremental sweep)' : ''))
      } catch (e) {
        console.error('could not write the baseline file: ' + String((e && e.message) || e))
        exitCode = 1
      }
    }
  }
}
process.exit(exitCode)
