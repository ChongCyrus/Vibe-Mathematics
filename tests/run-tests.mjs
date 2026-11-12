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
 *   node tests/run-tests.mjs --scope-report       # DERIVED scope classification as JSON; runs nothing
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
 *   · SCOPE SEMANTICS (handover D-06, handover round 1): `--only`/`--exclude` are ORTHOGONAL to the scope -
 *     they INTERSECT the REQUESTED scope and never override it. `--counts` and `--self-check` are
 *     REPOSITORY-WIDE and pin the effective scope to `full`, printing that pin AND its named reason on every
 *     run. The header always prints requested scope, effective scope and the final job count together, so a
 *     `scope=quick` label can never again sit beside a 177-job full-list run.
 *
 * INCREMENTAL FULL (`GATE_INCREMENTAL=1`, default OFF => today's behaviour byte-for-byte):
 *   · It SKIPS a mutant family only when every source file that family reads/copies/mutates (its target
 *     set) is outside the changed set since the recorded baseline. The JOB LIST NEVER SHRINKS: skipped
 *     families still count in TOTAL and are reported as `SKIP <family> (incremental: targets unchanged …)`.
 *   · BASELINE: a file OUTSIDE the repository, `GATE_BASELINE_FILE` (default
 *     `<scratch root>\gate-full-baseline.txt`), holding the commit of the last GREEN FULL sweep. This runner only
 *     READS it. It is written by the gate flow after a green full sweep
 *     (`git rev-parse HEAD > <scratch root>\gate-full-baseline.txt`) or by `--write-baseline`, which REFUSES to
 *     write unless the sweep is FULL and GREEN - a red or partial tree must never become a baseline.
 *   · RELEASE RULE (hard): before a commit/release/tag the FULL, non-incremental sweep is REQUIRED.
 *     `GATE_RELEASE=1` ignores `GATE_INCREMENTAL` entirely and runs everything.
 *   · NEVER SILENTLY UNDERRUN: an unreadable baseline, a baseline that is not an ancestor of HEAD, a
 *     failing `git diff`/`status`, a family with no declared targets, or ANY disagreement between the
 *     declared targets and what the harness's own source touches => that family RUNS (named reason on
 *     stderr). Declaring a SUPERSET of targets is safe; declaring a SUBSET is not - hence the re-derivation.
 *   · ROLLBACK: delete the `planIncremental(suites)` call (and its two consumers) to restore a full sweep.
 *
 * MUTANT-RESULT CACHE (`GATE_MUTANT_CACHE`, default ON; `0` disables it) — task-9/RUN 227:
 *   · The mutant families dominate the full sweep's wall time (the three `v5-institute-fixes` shards alone are
 *     ~510-570 s each), and a family's verdict is a function of
 *     the SOURCES it mutates plus its own harness - not of the rest of the tree. A family that PASSED is
 *     therefore cached under a key derived from `sha256` of (a) EVERY declared target file's CONTENT
 *     (`FAMILY_TARGETS`, the same measured superset `GATE_INCREMENTAL` uses), (b) the `*.mutants.mjs`
 *     harness's own content, (c) this runner's own content (a runner change invalidates everything) and
 *     (d) the job's ARGS (the three `v5-institute-fixes` shards are separate keys), (e) node's version.
 *   · A HIT prints `PASS <family>` with `MUTANTS SKIP (cached <key> <when>)` and counts as PASS; the TOTAL line
 *     gains `mutant cache: N hit / M miss`, so a cached sweep can NEVER be mistaken for a real one.
 *   · NEVER MASK A CHANGE: besides the content hashes, an entry records the `mtimeMs` of every target and of
 *     the harness, and a HIT requires every one of them to be UNCHANGED - so `touch <target>` (same bytes, new
 *     mtime) is a MISS and the family really runs. A target that cannot be RESOLVED (root or the archived
 *     preset base) makes its family UNCACHEABLE, so it always runs. Only PASSES are stored: a failure, a
 *     timeout or an `expectExit` job is never written.
 *   · ONLY PROVABLY-COVERED FAMILIES ARE CACHED. A family participates only when `familySkippable()` holds
 *     (declared targets cover everything re-derived from the harness's source). The B-tier families (no
 *     declared targets / nothing derivable / a derivation that exceeds the declaration) are NEVER cached and
 *     always run - a cache that guessed would be the very "skip a family that really changed" defect this
 *     runner's incremental mode was built to avoid.
 *   · `GATE_RELEASE=1` BYPASSES it (named on stderr): a release sweep must execute every family.
 *   · DIR: `<scratch root>\\gate-mutant-cache\\` (falls back to `%TEMP%\\gate-mutant-cache` when D: is absent);
 *     `GATE_MUTANT_CACHE_DIR` overrides it. Entries are plain JSON; deleting the directory is a safe ROLLBACK,
 *     and so is `GATE_MUTANT_CACHE=0` (no code change). The runner itself NEVER deletes repo files and never
 *     writes inside the repository for this.
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
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, statSync, mkdirSync, unlinkSync } from 'node:fs'
import { cpus, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ★ The runner is the one file OTHER JUDGES COPY (mutant runs, shard rehearsals), so it may not depend on a
// sibling module: `./_lib/scratch.mjs` does not travel with a copy, and a copy that cannot import dies with
// ERR_MODULE_NOT_FOUND before it prints anything. Same rule as scripts/lib/tmp-root.mjs, one line, no import:
// the scratch root is derived from the HOST and overridable — never a drive letter belonging to one laptop.
const runnerTmpRoot = () => String(process.env.VMU_TMP_ROOT || join(tmpdir(), 'vmu-gate'))
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
// ── SHARDING (`--shard i/N`, 1-based; env `GATE_SHARD=i/N`; the CLI wins when both are given) ────────────
// A shard is a PARTITION of the sweep, not a filter: every job belongs to exactly one shard and the union of
// the shards is the unsharded job list. That equality is the only thing that makes parallel execution safe to
// read, so `tests/shard-partition.test.mjs` asserts it (and reads the members from THIS runner's own plan
// instead of a copied list, because a copied list rots the moment a suite is added).
// A malformed `i/N` is a NAMED refusal rather than a silent full sweep: a typo must never turn a slice into
// the whole gate (or into an empty green shard). Exit 2 = usage, like the other argument refusals.
const parseShard = () => {
  const fromCli = flag('shard')
  const raw = fromCli.length ? fromCli[0] : String(process.env.GATE_SHARD || '')
  if (!String(raw).trim()) return null
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(raw).trim())
  const index = m ? Number(m[1]) : NaN
  const count = m ? Number(m[2]) : NaN
  if (!m || !Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index < 1 || index > count) {
    console.error('SHARD-INVALID: --shard expects i/N with 1 <= i <= N (got ' + JSON.stringify(String(raw)) + ')')
    process.exit(2)
  }
  return { index, count }
}
const SHARD = parseShard()
if (has('shard-plan') && SHARD === null) {
  console.error('SHARD-INVALID: --shard-plan needs --shard i/N - it prints the slice a run WOULD take, so it cannot guess one')
  process.exit(2)
}
// TEMP HYGIENE (task-12): a suite killed by the per-suite timeout cannot clean up, and some suites
// create many workspace dirs per run — measured here: %TEMP% held 160,923 top-level entries, 144,404 of
// them stale suite dirs (oldest ~2 weeks). Sweep the stale ones (top level, EXTRACTED suite prefixes,
// older than --temp-age-hours) and prefer the roomier drive's temp root; `os.tmpdir()` follows TEMP/TMP,
// so the suites need NO change. Hygiene must never break the sweep itself, and it reports on **stderr**
// because stdout is a MACHINE-READABLE channel here (`--counts`/`--json` are JSON.parsed by callers).
// Machine modes (`--self-check`, `--counts`) must not DELETE anything: the first is a guard the mutant
// family runs repeatedly, the second is called by scripts/update-doc-counts.mjs on every check - a sweep
// there is a surprising side effect (and a slow one). `--scope-report` reports the derived classification
// and must be equally side-effect free (it is the surface tests/audit-scope-classification.test.mjs reads).
// `--shard-plan` prints a partition and runs nothing, so it joins them: a planning call that sweeps temp
// directories is a surprising side effect, and the partition judge calls it dozens of times per second.
// Only a genuine test sweep cleans up.
if (!has('no-temp-hygiene') && !has('self-check') && !has('counts') && !has('scope-report') && !has('shard-plan')) {
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
// --concurrency=N explicitly when a faster (noisier) sweep is wanted (GATE_CONCURRENCY works too).
// MEASURED 2026-11-05 (745 jobs, same tree): k=2 wall ~16 min; k=3 wall 6 min 58 s, 745/745 green.
// k=3 is now the default because it is measurably faster AND stayed clean; k>=4 keeps the old warning
// (per-job inflation ~+15% at k=4, and k=6 produced a 180 s TIMEOUT plus a real-looking failure).
const concurrency = Math.max(1, Number(flag('concurrency')[0] || process.env.GATE_CONCURRENCY || Math.min(3, cpus().length)))

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
  // audit-generators-current.test.mjs: MEASURED 136.8 s standalone on 2026-10-22, after the archive move and the
  // tree-kill fix. It spawns every generator with --check, so its wall time tracks the number of generated
  // artifacts - and that number only grows. The 180 s default leaves it 31% headroom, so gate-load amplification
  // times it out while its own counts stay green (measured: 23/0 standalone, killed in full sweeps). Same shape as
  // run-tests.mutants.mjs above. 300 s = 2.19x the measurement, satisfying the 2x rule; only the budget moves.
  // RE-MEASURED 2026-10-24 00:10: 320.8 s standalone on this host (23/0, exit 0), i.e. the tree doubled its cost
  // in two days (the 136.8 s above was 2026-10-22, before this batch added three pack modules and a test file).
  // 300 s therefore killed it STANDALONE, not only under gate load - the shape that made the old comment's
  // "2.19x headroom" stale. 700 s = 2.18x the fresh measurement (the 2x rule), budget only.
  'audit-generators-current.test.mjs': 700000,
  // MEASURED 2026-10-24 00:00: 219.0 s standalone (16/0, exit 0) - it spawns four independent generator runs and
  // walks 30 volumes, so it outgrew the 180 s default. 480 s = 2.19x (the 2x rule), budget only.
  'b1prime-staleness-report.test.mjs': 480000,
  // MEASURED 2026-10-24 00:02: 228.0 s on THIS tree and 225.1 s on a PRISTINE `478b342a` worktree, i.e. the old
  // 180 s default was already too small before this batch - the timeout was never caused by the batch, and the
  // two readings are the evidence (a batch-caused slowdown would differ between them). 500 s = 2.19x (2x rule).
  'vmu-wiring-index.test.mjs': 500000,
  // release-ready.test.mjs: the gate suite itself. It grew a permanent red-team section (RUNS the release
  // gate against 23 attack vectors, one of which re-runs the whole audit), so it stopped fitting the 180 s
  // default: MEASURED 317 s standalone on this tree (154/0, exit 0) and KILLED at the 180 s default in the
  // first full sweep after that batch ("FAILED: release-ready.test.mjs [suite] (TIMEOUT after 180s)", its own
  // counts green in every standalone run). 800 s = 2.52x the measurement (the 2x rule), budget only: the
  // assertion set is untouched, and the red team detects a hang because a killed family reports exit 1.
  'release-ready.test.mjs': 800000,
  // mutation-evidence.test.mjs: the in-repo mutation batch. It GROWS with every taskbook that adds a mutant (43 in-repo
  // entries + 4 negative controls = 52 assertions today), and each entry runs a real mutated copy of the tree, so its
  // wall time tracks the batch size, not the machine. MEASURED 155 s standalone on 2026-11-11 (52/0, exit 0,
  // `mutation-evidence: 43 in-repo entries + 4 negative controls · 153901ms`) and KILLED at the 180 s default in the
  // full sweep - its own counts were green there, i.e. amplification by gate concurrency, not a hang. 400 s = 2.58x
  // the measurement (the 2x rule), budget only: the assertion set and the mutation semantics are untouched.
  'mutation-evidence.test.mjs': 400000,
  // sim-gate.test.mjs: the gate inside the gate. Its own internal programme is bounded by CPU cost (each
  // segment has a SEG_MS hard cap), so its outer wall time is what gate concurrency inflates. MEASURED on
  // 2026-11-12: 107 s standalone (101/0, exit 0) but 136.5 / 144.5 / 181.1 s inside three consecutive k=3
  // sweeps - the third KILLED at the 180 s default while its own counts were green, i.e. amplification by
  // the surrounding sweep (this run also had four gate scripts and a live SLV driver on the same box), not
  // a hang. 300 s = 1.66x the worst inside-gate measurement and 2.8x the standalone one; budget only, the
  // segment rulers, thresholds and assertions are untouched, and a real hang still lands as a named
  // "TIMEOUT after 300s".
  'sim-gate.test.mjs': 300000,
}
/** One place decides a job limit: explicit job value, then the named override, then (S22) the family
 *  default for `*.mutants.mjs`, then the 180 s suite default. Every layer has a safe default, so a
 *  caller never has to configure anything for a green sweep — and a family can still be caught hanging. */
function jobLimit(job) {
  if (job.timeoutMs) return job.timeoutMs
  if (TIMEOUT_OVERRIDES[baseOf(job.file)]) return TIMEOUT_OVERRIDES[baseOf(job.file)]
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
  // MEASURED 317 s standalone on 2026-11-10 (154/0): the gate suite now RUNS the release gate against 23
  // attack vectors, so leaving it at the default weight (2) started it last and cost the tail it was
  // meant to avoid. Only the ORDER moves (LPT), never what runs.
  'release-ready.test.mjs': 317,
  // MEASURED 155 s standalone on 2026-11-11 (52/0). Without a weight it starts LAST and pays its whole wall as tail;
  // the mutation batch only grows (43 in-repo entries today), so the weight tracks it. Order only, never what runs.
  'mutation-evidence.test.mjs': 155,
  'e2e-v5-round2.test.mjs': 47.0,
  'v2-fix-probes.test.mjs': 40.3,
}
const DEFAULT_WEIGHT = 2
const weightOf = (j) => DURATION_WEIGHTS[baseOf(j.file)] || DEFAULT_WEIGHT
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
  'audit-preset-rows', 'audit-status-report-fields', 'audit-artifact-docs', 'audit-enum-branches',
  'audit-doc-planned-claims', 'audit-cross-volume-refs', 'audit-docs-entry-template']
const QUICK_EXCLUDE = ['mutants', 'audit-math-computation-sensitivity']
// S24: PR #14 brought `tests/legacy/v5-meeting-attribution.test.mjs` into the curated quick subset (a new
// suite is on purpose — it is the regression test for the reply-attribution fix), so 23 -> 24.
// S29: PR #18 (applied as its own two commits) brought two more v5 suites into the curated subset —
// `tests/legacy/accept-ab-v5-minimal.test.mjs` (the acceptance harness for the ask-retry cap and unowned-task
// dispatch) and `tests/legacy/v5-tool-help.test.mjs` (the tool-help surface) — so 24 -> 26. Both are new
// regression tests, which is the same "on purpose" case as S24, not a drifted filter.
// S30 (round 137): `tests/vmu-ab-v5r.test.mjs` - the v5r/vmu A/B verdict table - contains `v5r`, so the
// curated `v5` prefix picks it up too, and it belongs there: it is fast and it is the file an edit to either
// side should re-run. 26 -> 27, deliberately. 27 -> 28, deliberately: `audit-enum-branches` joined the curated
// quick subset in round 160, because it is fast and it checks a defect family that has now appeared five times.
// 28 -> 29, deliberately: `audit-doc-planned-claims` joined in round 180, when the premise it asserts - that a
// generated ✅ means the key is really read - finally held for all twelve faces, so the check could stop reporting and
// start failing, and it is fast enough (it reads the docs).
// 29 -> 30, deliberately: `audit-cross-volume-refs` joined in round 181. It checks identifiers (section pointers) rather
// than prose, it found one dangling reference in 518 - including one inside a kernel comment - and it is fast.
// 30 -> 31, deliberately: `audit-docs-entry-template` joined in round 187. It enforces that every capability entry in the
// design volumes carries a maturity marker - the difference between "designed" and "works today" - over 171 entries,
// with a selftest and an end-to-end control both proving it can fail.
// 37 -> 38, deliberately: `tests/vmu-v5r-verdict-final.test.mjs` joined in phase 12 with the 辩论最终裁决 trigger (the
// pack tool that reads the chair, calls `rulePropositionProbability` and mails the card owner). Its NAME contains `v5r`,
// so the curated `v5` prefix picks it up - the same "on purpose" case as S30, not a drifted filter.
// 38 -> 24, deliberately (round 230): the ARCHIVED PRESETS left the sweep, so the fourteen curated `v5`-and-friends
// entries that only exercised an archived preset went with them (`v5-meeting-attribution`, `v5-tool-help`,
// `math-computation-shared`, `audit-status-report-fields`, `audit-v5-*`, …). The maintained surface is vmu + its v5r
// pack; the archived presets are covered on demand by `GATE_LEGACY=1`. Verified: every removed entry now lives in
// `tests/legacy/` (the directory is the list, round 232) and no vmu-named job was dropped
// (`tests/audit-legacy-scope.test.mjs`).
const QUICK_EXPECTED_JOBS = 24
// The same subset when `GATE_LEGACY=1` brings the archived behaviour suites back (38 = before round 230).
const QUICK_EXPECTED_JOBS_LEGACY = 38
// `vmu` is the ITERATION subset for developing the vmu framework: the vmu jobs themselves, plus every
// gate that guards a SHARED surface a vmu change can reach (preset rows and the generated patch,
// the installer, package membership, README/doc counts, path discipline, artifact docs, the shared
// math modules and their contract, the runner's own self-tests, temp hygiene). It deliberately EXCLUDES
// every preset-INTERNAL behavioural family: a vmu change never touches another preset's plugin source,
// so those families are reached at full scope by `GATE_INCREMENTAL` (target-derived) and by the
// non-incremental release sweep, which stays REQUIRED at every milestone (see the same note above).
// VMU scope = DEFAULT-INCLUDE, with an explicit EXCLUDE list (round 519).
//
// WHY THIS IS INVERTED. This scope used to be an ALLOW-LIST (`VMU_ONLY`). An allow-list silently drops every suite that
// did not exist when it was written: measured in round 519, it covered 139 of the 254 files in tests/ and left 115 unrun -
// including `audit-zpolicy` (the R1 zero-policy gate), `audit-code-size` (the R14 size gate), `audit-dependency-cycles`,
// `audit-prompt-invariants`, `audit-planned-names`, and EVERY guard added during the round-500s. The scoped run was then
// cited as gate evidence, which is exactly the paper-capability failure this repository keeps finding elsewhere: a check
// that exists, passes when run by hand, and is never executed by the thing that is supposed to run it.
//
// The EXCLUDE list names only what is genuinely outside this preset: the acceptance and end-to-end suites for v2..v5r, the
// long sensitivity probes, and the mutant families (the FULL sweep runs those). What is NOT listed is included, so a new
// guard is in scope from the moment it is written. The classification is asserted by
// `tests/audit-scope-classification.test.mjs`, so a file can never be dropped silently in either direction.
// EVERY RULE IS EXPLICITLY ANCHORED, and it matches the FILE NAME ONLY. Substring matching was a defect
// (round 1 of the handover): the value `prompt-v5` - meant for the OTHER presets' `prompt-v5*` suites - also
// matched `vmu-prompt-v5r-bridge.test.mjs` (`prompt-v5` is a substring of `prompt-v5r`), so a vmu suite was
// dropped from its own iteration scope silently. A PREFIX rule cannot reach a name that merely CONTAINS its
// value, which is exactly the property `tests/audit-scope-classification.test.mjs` now asserts in both
// directions (`prompt-v5-integrity.test.mjs` OUT, `vmu-prompt-v5r-bridge.test.mjs` IN).
const VMU_EXCLUDE = [
  // acceptance / end-to-end suites for the other presets
  { kind: 'prefix', value: 'accept-', why: 'v2..v5r acceptance suites' },
  { kind: 'prefix', value: 'e2e-', why: 'v2..v5r end-to-end suites' },
  { kind: 'prefix', value: 'selfdrive-', why: 'v2..v5r self-driving mock-host suites' },
  { kind: 'prefix', value: 'formal-verify', why: "the other presets' formal-verification suites" },
  { kind: 'prefix', value: 'v2-fix', why: 'v2 fix probes' },
  { kind: 'prefix', value: 'v3-fix', why: 'v3 fix probes' },
  { kind: 'prefix', value: 'v4-final', why: 'v4 final-paper suites' },
  { kind: 'prefix', value: 'roundC-fix', why: 'round-C fix probes' },
  { kind: 'prefix', value: 'prompt-v5', why: "the OTHER presets' prompt-v5 suites (PREFIX-anchored on purpose: a vmu name such as vmu-prompt-v5r-bridge must stay IN scope)" },
  // the other presets' own math-computation suites (the parity and contract gates stay IN scope)
  { kind: 'prefix', value: 'math-computation-v', why: "the other presets' math-computation suites" },
  { kind: 'prefix', value: 'math-computation-a', why: 'the math-computation archive-rerun family' },
  { kind: 'prefix', value: 'math-computation-b', why: 'the math-computation b-family' },
  // long sensitivity probes
  { kind: 'prefix', value: 'audit-math-computation-sensitivity', why: 'long sensitivity probe (full/incremental only)' },
  { kind: 'prefix', value: 'audit-formal-sensitivity', why: 'long sensitivity probe (full/incremental only)' },
  { kind: 'prefix', value: 'audit-persona-sensitivity', why: 'long sensitivity probe (full/incremental only)' },
  // mutant families: the FULL sweep runs these, the iteration scope does not
  { kind: 'suffix', value: '.mutants.mjs', why: 'mutant families run at full/incremental scope' },
]
/** The anchored matcher, per rule kind. `prefix` = startsWith (NOT includes), `suffix` = endsWith. */
const EXCLUDE_MATCH = {
  prefix: (name, v) => name.startsWith(v),
  suffix: (name, v) => name.endsWith(v),
}
/** The FIRST anchored rule that excludes `file`, or null. Reads the FILE NAME, never the label with args. */
function vmuExcludeRule(file) {
  return VMU_EXCLUDE.find((r) => EXCLUDE_MATCH[r.kind](file, r.value)) || null
}
/** Apply a scope's curated filter. `full` is the identity (byte-for-byte the old behaviour). */
function applyScope(list, scope) {
  if (scope !== 'quick' && scope !== 'vmu') return list
  if (scope === 'vmu') return list.filter((j) => !vmuExcludeRule(baseOf(j.file)))
  const only = QUICK_ONLY
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
// SCOPE SEMANTICS (handover D-06). Two different things used to be one:
//   · REPOSITORY-WIDE MODES (`--counts`, `--self-check`) report properties of the REPOSITORY, not of an edit
//     loop, so they pin the effective scope to `full`. That pin is now EXPLICIT: the reason and both scope
//     names are printed on every such run (see the header below). Without the pin, a guard that spawns this
//     runner as a child inherits the scope - the incident that produced the rule: `run-tests.mutants.mjs`
//     children inherited the vmu scope, its `--only audit-prompt-invariants` timeout POSITIVE saw ZERO jobs,
//     its `--self-check` baseline diverged, and `audit-readme-counts` read a scoped total of 27 instead of 110.
//   · `--only` / `--exclude` are NOT repository-wide. They are ORTHOGONAL to the scope and INTERSECT with the
//     REQUESTED one, so `GATE_SCOPE=vmu --only <file>` runs that file iff the vmu scope contains it. They no
//     longer downgrade the scope behind the reader's back: `GATE_SCOPE=quick --only vmu-...` is now simply a
//     zero-job request, not a silent 177-job full-list run labelled `scope=quick`.
// `--json` is deliberately NOT repository-wide: a machine-readable ITERATION report is a legitimate use of a scope.
const REPO_WIDE_MODES = ['counts', 'self-check'].filter((m) => has(m))
const MACHINE_MODE = REPO_WIDE_MODES.length > 0
const SCOPE = MACHINE_MODE ? 'full' : GATE_SCOPE
// The override is NAMED HERE, at the point the scope is decided, because `--self-check` exits from its own
// block long before the job-list header is printed: a reason that only appeared in the header would be
// invisible in exactly the mode whose override a reader most needs to understand.
if (SCOPE !== GATE_SCOPE) {
  console.error('run-tests: SCOPE OVERRIDE (named reason): ' + REPO_WIDE_MODES.map((m) => '--' + m).join(', ')
    + ' report properties of the REPOSITORY, not of an edit loop => effective scope forced to full (requested '
    + GATE_SCOPE + ', effective ' + SCOPE + '). NOTE: --only/--exclude are NOT repository-wide; they intersect with the REQUESTED scope.')
}

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
const baselineFilePath = () => String(process.env.GATE_BASELINE_FILE || join(runnerTmpRoot(), 'gate-full-baseline.txt'))
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
    if (FAMILY_TARGETS[baseOf(j.file)].some((t) => isChanged(changed, t))) continue
    skipped.push(j.file)
  }
  return { enabled: true, reason: '', baseline, changed, skipped, ranBecause }
}

// ── MUTANT-RESULT CACHE (task-9): fingerprint, entry, lookup, store ────────────────────────────────
// One key answers one question: "have these exact bytes, under this exact runner, already passed?" The entry
// additionally records the mtime of every input, so a TOUCH is a MISS even when the bytes are identical: the
// cache may replace a RUN, never a CHANGE. Only `storeMutantCacheEntry` writes; a torn/partial entry can only
// produce a MISS (JSON.parse failure), never a false hit.
const MUTANT_CACHE_SCHEMA = 'mutant-cache/1'
const MUTANT_CACHE_VERSION = '1'
const mutantCacheEnabled = () => String(process.env.GATE_MUTANT_CACHE || '') !== '0'
function mutantCacheDir() {
  const explicit = String(process.env.GATE_MUTANT_CACHE_DIR || '').trim()
  if (explicit) return explicit
  const preferred = join(runnerTmpRoot(), 'gate-mutant-cache')
  try { mkdirSync(preferred, { recursive: true }); return preferred } catch (e) { /* D: absent/read-only => %TEMP% */ }
  const fallback = join(tmpdir(), 'gate-mutant-cache')
  mkdirSync(fallback, { recursive: true })
  return fallback
}
let runnerDigestCache = null
/** `sha256` of THIS file: any runner edit invalidates every entry (the harness's own behaviour changed). */
function runnerDigest() {
  if (runnerDigestCache === null) {
    try { runnerDigestCache = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 16) }
    catch (e) { runnerDigestCache = 'UNREADABLE' }
  }
  return runnerDigestCache
}
// The archived-preset base, MIRRORED here instead of imported: `tests/run-tests.mutants.mjs` copies this
// runner into a temp directory and runs that copy's `--self-check`, where a relative import of
// `./_lib/legacy-presets.mjs` cannot resolve (the copy would die before printing anything and the mutant
// proof would pass/fail for the wrong reason). These two values MUST match
// `tests/_lib/legacy-presets.mjs` (`LEGACY_BASE` / `LEGACY_PRESET_NAMES`); the seam stays the harnesses'
// single source of truth, and this runner only needs to know WHERE a target can live.
const LEGACY_BASE = (() => {
  const fromEnv = process.env.VMU_LEGACY_BASE
  return typeof fromEnv === 'string' && fromEnv.trim() !== '' ? fromEnv.trim() : 'archive/legacy-presets'
})()
const LEGACY_PRESET_NAMES = ['vibe-math-v2', 'vibe-math-v3', 'vibe-math-v4', 'vibe-math-v5', 'vibe-math-v5r']
const legacyFile = (name, rel) => join(REPO, LEGACY_BASE, name, rel)
/**
 * WHERE a declared target really lives. The five historical presets are ARCHIVED (G4) and `FAMILY_TARGETS`
 * still spells them repo-relative, so a target is looked up at the root FIRST and then under the archived
 * base the harnesses read from - hashing `vibe-math-v4/vibe-math-v4.js` when the bytes live under
 * `archive/legacy-presets/vibe-math-v4/` would produce a stable "MISSING" hash and a cache that never
 * notices a real edit. The resolved SHAPE (`root`/`legacy`) is part of the cache key, so moving a preset
 * between the two locations invalidates every entry as well. An unresolvable target returns null, which
 * makes its family UNCACHEABLE (it always runs).
 */
function resolveTargetFile(rel) {
  const atRoot = join(REPO, rel)
  if (existsSync(atRoot)) return { rel, kind: 'root', abs: atRoot }
  const slash = rel.indexOf('/')
  if (slash > 0 && LEGACY_PRESET_NAMES.includes(rel.slice(0, slash))) {
    const abs = legacyFile(rel.slice(0, slash), rel.slice(slash + 1))
    if (existsSync(abs)) return { rel, kind: 'legacy', abs }
  }
  return null
}
/** Content + mtime of one RESOLVED file. Only called on a resolution that already proved the file exists. */
function fingerprintOf(file) {
  const st = statSync(file.abs)
  return { hash: createHash('sha256').update(readFileSync(file.abs)).digest('hex'), mtimeMs: Math.round(st.mtimeMs) }
}
/**
 * The cache KEY, as a pure function of what the verdict depends on: the schema/version, the runner's own bytes,
 * the node version, the harness's path+bytes+args, and every target's resolved location+bytes. MTIMES ARE NOT
 * PART OF IT on purpose: a touch with identical bytes must reuse the same key and be caught by the entry's
 * stored mtimes (reason `target-changed:`), so the two proofs stay independent instead of colliding.
 */
function mutantPlanKey(parts) {
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 20)
}
/**
 * The cache plan for ONE family job, or null when the family must not be cached at all. Coverage comes from
 * `familySkippable()` - the SAME predicate the incremental planner uses - so the cache and the incremental
 * skip can never disagree about which families may be replaced by a stored verdict. A target that resolves
 * NOWHERE makes the family uncacheable (always runs): a cache may not hash a path it could not find, because
 * a missing target means "I cannot prove what this harness mutates", not "nothing changed".
 */
function mutantCachePlan(job) {
  if (job.eval || !familySkippable(job.file)) return null
  const resolved = FAMILY_TARGETS[baseOf(job.file)].slice().sort().map(resolveTargetFile)
  if (resolved.some((r) => r === null)) return null
  const harnessRel = 'tests/' + job.file
  const harness = fingerprintOf({ rel: harnessRel, kind: 'root', abs: join(REPO, harnessRel) })
  const mtimes = {}
  const kinds = {}
  const rows = []
  const parts = [MUTANT_CACHE_SCHEMA, 'v=' + MUTANT_CACHE_VERSION, 'runner=' + runnerDigest(),
    'node=' + process.version, 'harness=' + harnessRel + ':' + harness.hash, 'args=' + job.args.join(' ')]
  for (const t of resolved) {
    const f = fingerprintOf(t)
    mtimes[t.rel] = f.mtimeMs
    kinds[t.rel] = t.kind
    rows.push({ rel: t.rel, kind: t.kind, hash: f.hash })
    parts.push('target=' + t.kind + ':' + t.rel + ':' + f.hash)
  }
  return {
    key: mutantPlanKey(parts),
    file: job.file, args: job.args.join(' '), targets: resolved.map((r) => r.rel), mtimes, kinds, rows,
    harnessHash: harness.hash, harnessMtimeMs: harness.mtimeMs,
  }
}
function mutantCacheEntryPath(dir, plan) { return join(dir, plan.key + '.json') }
/**
 * Look a plan up. A hit requires: the same schema/key/identity, a stored PASS, the same harness bytes+mtime,
 * and EVERY target's stored location AND mtime equal to the current one. Any disagreement is a MISS with a
 * named reason (`GATE_MUTANT_CACHE_VERBOSE=1` prints it), so a cache never converts a change into a pass.
 */
function readMutantCacheEntry(dir, plan) {
  let entry
  try { entry = JSON.parse(readFileSync(mutantCacheEntryPath(dir, plan), 'utf8')) }
  catch (e) { return { hit: false, reason: 'no-entry' } }
  if (!entry || entry.schema !== MUTANT_CACHE_SCHEMA) return { hit: false, reason: 'schema' }
  if (entry.key !== plan.key) return { hit: false, reason: 'key' }
  if (entry.file !== plan.file || entry.args !== plan.args) return { hit: false, reason: 'identity' }
  if (entry.ok !== true) return { hit: false, reason: 'stored-result-is-not-a-pass' }
  if (entry.harnessHash !== plan.harnessHash || entry.harnessMtimeMs !== plan.harnessMtimeMs) return { hit: false, reason: 'mutants-harness-changed' }
  for (const t of plan.targets) {
    if (!entry.mtimes || entry.mtimes[t] !== plan.mtimes[t]) return { hit: false, reason: 'target-changed:' + t }
    if (!entry.kinds || entry.kinds[t] !== plan.kinds[t]) return { hit: false, reason: 'target-moved:' + t }
  }
  return { hit: true, entry }
}
/**
 * Store a PASS. `ok=false` is a NO-OP by contract (a failure must never become a cache entry), and the caller
 * passes the REAL verdict so this cannot be forgotten. Returns true when an entry was written.
 */
function storeMutantCacheEntry(dir, plan, ms, ok) {
  if (!ok) return false
  const entry = {
    schema: MUTANT_CACHE_SCHEMA, version: MUTANT_CACHE_VERSION, key: plan.key,
    file: plan.file, args: plan.args, ok: true, ms: Math.round(ms),
    at: new Date().toISOString(), atMs: Date.now(),
    runner: runnerDigest(), node: process.version,
    targets: plan.targets, mtimes: plan.mtimes, kinds: plan.kinds,
    harnessHash: plan.harnessHash, harnessMtimeMs: plan.harnessMtimeMs,
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(mutantCacheEntryPath(dir, plan), JSON.stringify(entry, null, 2))
  return true
}
/** Bound the directory: entries are one-per-(content,args) key, so only content churn accumulates them. */
function pruneMutantCache(dir, keep = 200) {
  let names
  try { names = readdirSync(dir).filter((f) => f.endsWith('.json')) } catch (e) { return 0 }
  if (names.length <= keep) return 0
  const rows = names.map((f) => { try { return { f, t: statSync(join(dir, f)).mtimeMs } } catch (e) { return { f, t: 0 } } })
  rows.sort((a, b) => a.t - b.t)
  let n = 0
  for (const r of rows.slice(0, rows.length - keep)) { try { unlinkSync(join(dir, r.f)); n++ } catch (e) { /* best effort */ } }
  return n
}
/**
 * The sweep's cache state. Declared HERE (before the `--self-check` block, which drives `runOne` through the
 * synthetic pool) and FILLED by the planning block further down, so the reporter can read it from any path.
 * `hitsByIndex` maps a job index to its hit (printed as PASS + `MUTANTS SKIP`); `freeLabels` lets the head
 * start know a cached job costs nothing; `plans` is what a finished family stores its PASS under.
 */
const mutantCache = { enabled: false, dir: '', hits: 0, misses: 0, plans: new Map(), hitsByIndex: new Map(), freeLabels: new Set() }

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
/** Index of the longest EXECUTED job (skipped/cached jobs cost nothing => they are not isolated). */
function headstartJobIndex(list, skippedSet) {
  let best = -1
  for (let i = 0; i < list.length; i++) {
    if (costFree(skippedSet, list[i])) continue
    if (best < 0 || weightMsOf(list[i]) > weightMsOf(list[best])) best = i
  }
  return best
}
/**
 * Does this job cost nothing? Two different reasons, ONE predicate: an incremental skip (named by FILE) and a
 * mutant-cache hit (named by LABEL, because the three `v5-institute-fixes` shards share a file name). `label()`
 * contains a space whenever args exist, so a label can never collide with a bare file name.
 */
function costFree(freeSet, job) {
  return !!freeSet && (freeSet.has(job.file) || freeSet.has(label(job)))
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
  // MUTANT-RESULT CACHE (task-9): the directions that make the cache TRUSTWORTHY, exercised on a TEMP dir
  // (never the real cache dir, never a repo file): a stored PASS round-trips; a changed target content is a
  // different KEY; a touched target (identical bytes, new mtime) is a MISS; a FAILED result is never stored;
  // and `GATE_MUTANT_CACHE=0` really disables it. Without these, "cached" could mean "silently stale".
  const savedCacheEnv = process.env.GATE_MUTANT_CACHE
  const cacheTmp = mkdtempSync(join(tmpdir(), 'gate-mutant-cache-selftest-'))
  const cacheFamilies = readdirSync(HERE).filter((f) => f.endsWith('.mutants.mjs')).sort().filter((f) => familySkippable(f))
  // Prefer a REAL cacheable family (it proves the resolution + fingerprint path against the checkout). In a
  // published tarball, or in the temp-dir COPY that `run-tests.mutants.mjs` self-checks, none may be available
  // - so the mechanics are exercised on a SYNTHETIC plan instead of turning a missing fixture into a red.
  let cachePlan = null
  for (const f of cacheFamilies) {
    const p = mutantCachePlan({ file: f, args: [], expectExit: 0 })
    if (p) { cachePlan = p; break }
  }
  const cachePlanReal = !!(cachePlan && cacheFamilies.includes(cachePlan.file) && cachePlan.key)
  if (!cachePlan) {
    cachePlan = {
      key: mutantPlanKey(['synthetic-self-check']), file: 'synthetic.mutants.mjs', args: '',
      targets: ['synthetic/target.js'], mtimes: { 'synthetic/target.js': 1 }, kinds: { 'synthetic/target.js': 'root' },
      harnessHash: 'synthetic-harness', harnessMtimeMs: 1,
    }
  }
  let cacheOk = false
  let cacheDetail = 'no cacheable family in this checkout; mechanics exercised on a synthetic plan'
  {
    const missEmpty = readMutantCacheEntry(cacheTmp, cachePlan)
    const wrote = storeMutantCacheEntry(cacheTmp, cachePlan, 1234, true)
    const hitStored = readMutantCacheEntry(cacheTmp, cachePlan)
    const failPlan = Object.assign({}, cachePlan, { key: 'f'.repeat(20) })
    const refusedFail = storeMutantCacheEntry(cacheTmp, failPlan, 9, false)
    const failedFileGone = !existsSync(mutantCacheEntryPath(cacheTmp, failPlan))
    const touchedTarget = cachePlan.targets[0]
    const touched = Object.assign({}, cachePlan, { mtimes: Object.assign({}, cachePlan.mtimes) })
    touched.mtimes[touchedTarget] = Number(cachePlan.mtimes[touchedTarget]) + 1
    const missTouch = readMutantCacheEntry(cacheTmp, touched)
    const missKey = readMutantCacheEntry(cacheTmp, Object.assign({}, cachePlan, { key: 'deadbeefdeadbeefdead' }))
    const storedText = readFileSync(mutantCacheEntryPath(cacheTmp, cachePlan), 'utf8')
    writeFileSync(mutantCacheEntryPath(cacheTmp, cachePlan), JSON.stringify(Object.assign({}, JSON.parse(storedText), { ok: false })))
    const missNotPass = readMutantCacheEntry(cacheTmp, cachePlan)
    // The key must be CONTENT-sensitive (an edit to a target or the harness material) and mtime-INsensitive
    // (a touch keeps the key and is caught by the stored mtimes) - the two proofs are independent by design.
    const keyBase = ['schema', 'v=1', 'runner=r', 'node=n', 'harness=tests/x.mutants.mjs:h0', 'args=']
    const keySameBytes = mutantPlanKey(keyBase.concat(['target=root:t.js:h1']))
    const keyEditedTarget = mutantPlanKey(keyBase.concat(['target=root:t.js:h2']))
    const keyEditedHarness = mutantPlanKey(['schema', 'v=1', 'runner=r', 'node=n', 'harness=tests/x.mutants.mjs:h9', 'args='].concat(['target=root:t.js:h1']))
    const keyIgnoresMtime = mutantPlanKey(keyBase.concat(['target=root:t.js:h1'])) === keySameBytes
    const legacyResolved = resolveTargetFile('vibe-math-v5/vibe-math-v5.js')
    const bogusResolved = resolveTargetFile('no-such-preset/no-such.js')
    process.env.GATE_MUTANT_CACHE = '0'
    const killSwitch = mutantCacheEnabled() === false
    if (savedCacheEnv === undefined) delete process.env.GATE_MUTANT_CACHE; else process.env.GATE_MUTANT_CACHE = savedCacheEnv
    cacheOk = missEmpty.hit === false && wrote === true && hitStored.hit === true
      && refusedFail === false && failedFileGone === true
      && missTouch.hit === false && /target-changed/.test(String(missTouch.reason))
      && missKey.hit === false && missNotPass.hit === false && killSwitch
      && keyEditedTarget !== keySameBytes && keyEditedHarness !== keySameBytes && keyIgnoresMtime
      && bogusResolved === null && (!legacyResolved || legacyResolved.kind === 'legacy')
    cacheDetail = (cachePlanReal ? '' : 'synthetic plan (this checkout has no resolvable cacheable family); ') + cachePlan.file + ': empty=miss; store+read=hit; touch=' + missTouch.reason
      + '; a failed run is not stored=' + failedFileGone + '; a non-pass entry is ignored=' + (missNotPass.hit === false)
      + '; a target edit changes the key=' + (keyEditedTarget !== keySameBytes)
      + '; a harness edit changes the key=' + (keyEditedHarness !== keySameBytes)
      + '; the key hashes content rows only (a touch keeps it)=' + keyIgnoresMtime
      + '; an unresolvable target makes the family uncacheable=' + (bogusResolved === null)
      + '; archived presets resolve through the legacy base=' + (legacyResolved === null ? 'absent-in-this-checkout' : legacyResolved.kind)
      + '; GATE_MUTANT_CACHE=0 disables=' + killSwitch
  }
  rmSync(cacheTmp, { recursive: true, force: true })
  console.log((cacheOk ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL') + ': the mutant cache hits only on unchanged bytes AND unchanged mtimes (' + cacheDetail + ')')
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
  process.exit(okSelf && okPassing && okReal && okAbort && killedByRunner && namedTimeout && overrideOk && extended && namesOverride && noBaselineOk && cacheOk && hsOk ? 0 : 1)
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
 * The FILE NAME of a job, without its directory. Every table in this runner (timeouts, duration weights, hang
 * probes, mutant-family targets, the scope rules) is keyed by a suite's own name, so a job that lives in a
 * subdirectory - `tests/legacy/` since round 232 - must look itself up by name, not by path. Without this the
 * archived suites would silently fall back to the default timeout and would never share a family with a root
 * job that names the same file.
 */
function baseOf(file) { return file.includes('/') ? file.slice(file.lastIndexOf('/') + 1) : file }
// ── LEGACY PRESETS ARE ARCHIVED (decision of the user, round 230: "we only maintain vmu and the v5r pack") ──
// The five historical presets live under `archive/legacy-presets/` and are no longer maintained: no feature
// work, no re-verification. Their BEHAVIOUR suites (the ones that boot an archived preset and drive it, plus
// their mutant families) are therefore NOT part of the default sweep. They are not deleted, and they are not
// silently dropped either: the DIRECTORY (`tests/legacy/`, round 232) is the list, and `tests/audit-legacy-scope.test.mjs` checks it
// both directions, the runner prints how many it skipped and how to run them, and `GATE_LEGACY=1` runs them
// exactly as before. Repo-wide audits that merely READ the archive (path discipline, doc gates, declaration
// criteria, registration parity) stay IN the sweep: they guard the shared layer, not the archived presets.
const LEGACY_DIR = join(HERE, 'legacy')
const LEGACY_ALLOW = String(process.env.GATE_LEGACY || '') === '1'
let legacySet = null
let legacySkipped = 0
/**
 * The archived behaviour suites, read ONCE from `tests/legacy/`. The DIRECTORY IS THE LIST: a suite is archived
 * iff it lives there, so a new archived suite cannot be added without also moving it (and a file that stays at
 * the root is, by construction, part of the maintained surface). A missing or empty directory is a NAMED red,
 * never an empty set - an empty set would silently restore the old full sweep.
 */
function legacySuites() {
  if (legacySet !== null) return legacySet
  let names = []
  try { names = readdirSync(LEGACY_DIR).filter((f) => f.endsWith('.mjs')).sort() } catch (e) {
    console.error('FAIL - * legacy scope: cannot list ' + LEGACY_DIR + ' (' + e.message + ')')
    process.exit(2)
  }
  legacySet = new Set(names)
  if (!legacySet.size) {
    console.error('FAIL - * legacy scope: ' + LEGACY_DIR + ' holds no suites - an empty directory would silently restore the old full sweep')
    process.exit(2)
  }
  return legacySet
}

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
  const legacy = legacySuites()
  legacySkipped = 0
  for (const file of present) {
    if (file === SELF || NEEDS_ARGS[file] || replacedBare.has(file)) continue
    jobs.push({ file, args: [], expectExit: 0, kind: file.endsWith('.test.mjs') ? 'suite' : 'probe' })
  }
  // THE ARCHIVED SUITES COME FROM THE DIRECTORY (round 232): `tests/legacy/` is the list, so they are appended
  // with a path (`legacy/<name>`) rather than removed from a flat sweep. Skipped by default; `GATE_LEGACY=1` runs
  // them exactly as they ran from the root before the move (same name, same args, same timeouts - see baseOf).
  for (const name of legacy) {
    if (name === SELF || NEEDS_ARGS[name] || replacedBare.has(name)) continue
    if (!LEGACY_ALLOW) { legacySkipped++; continue }
    jobs.push({ file: 'legacy/' + name, args: [], expectExit: 0, kind: name.endsWith('.test.mjs') ? 'suite' : 'probe' })
  }
  for (const v of VARIANTS) {
    // A VARIANT may name a root script or an archived one; the latter now lives under `legacy/`.
    const vFile = presentSet.has(v.file) ? v.file : (legacy.has(v.file) ? 'legacy/' + v.file : null)
    if (vFile === null) {
      if (DEV_CHECKOUT) { console.error('a VARIANTS entry names a missing script: ' + v.file); process.exit(2) }
      continue
    }
    // A VARIANT of an archived preset is archived too: the shards and self-probes below belong to the legacy
    // behaviour suites, so they follow the same switch as the suite list. (Measured: v5-institute-fixes alone is
    // three 600 s shards, the single largest item in the sweep.)
    if (!LEGACY_ALLOW && legacy.has(v.file)) { legacySkipped++; continue }
    // A VARIANT is an EXTRA instrumented run of the SAME script (argument variants), never an additional
    // suite: the counting unit for `suites` is "the suites proper", one per script. Classifying by file name
    // here would inflate `suites` whenever a suite gains a `--self-probe` job (R18: it did, 44 -> 45).
    jobs.push({ file: vFile, args: v.args || [], expectExit: v.expectExit || 0, kind: 'probe' })
  }
  return jobs.sort((a, b) => (label(a) < label(b) ? -1 : 1))
}
// Scope first (curated subset), then the CLI filters, then scheduling. `full` is the identity, i.e. the
// default behaviour is byte-for-byte what it was before the scope change. (GATE_SCOPE itself is parsed
// above, beside the scope helpers, so the incremental planner and the self-check can both use it.)
//
// `--only`/`--exclude` are applied to the scope-filtered list, i.e. they INTERSECT the requested scope;
// they never widen it and never downgrade it. They match the LABEL (file name + args), so a variant can be
// selected by its own arguments.
const filters = []
let suites = applyScope(deriveJobs(), SCOPE)
if (only.length) { suites = suites.filter((j) => only.some((o) => label(j).includes(o))); filters.push('--only ' + only.join('|')) }
if (exclude.length) { suites = suites.filter((j) => !exclude.some((o) => label(j).includes(o))); filters.push('--exclude ' + exclude.join('|')) }
// The generic refusal stays HERE, on the filtered list and before any slicing: it means "the FILTERS matched
// nothing", which is a different fact from "this shard is empty" (that one is named below, because an empty
// shard is a configuration that would otherwise show up GREEN in CI while proving nothing).
if (!suites.length) {
  console.error('no suites matched: requested-scope=' + GATE_SCOPE + '  effective-scope=' + SCOPE
    + (filters.length ? '  filters=[' + filters.join(' ') + ']' : '')
    + ' => 0 jobs (the filters intersect the requested scope; nothing to run)')
  process.exit(2)
}
// ── THE SHARD CUT: after scope + --only/--exclude, BEFORE `lptOrder()` ──────────────────────────────────
// `lptOrder()` is an EXECUTION order (measured duration DESC). Cutting after it would make a shard's membership
// depend on the weight table and on whichever machine measured it: two shards would stop being complements,
// and a weight update would silently move jobs between CI runners. Cut in the DETERMINISTIC BASE ORDER instead
// (`deriveJobs()` is label ASC; `applyScope` and the CLI filters preserve it), taking the jobs whose position k
// satisfies `k % N === i-1`. That formula IS the partition contract: every job appears in exactly one shard,
// and the union is the unsharded list - asserted by tests/shard-partition.test.mjs, never assumed.
// The three machine/report modes are NOT sharded: they report the repository (or its scoped classification),
// not a slice. `--shard` is named as IGNORED there so a reader cannot mistake a full report for a shard's, and
// their stdout stays byte-identical with and without `--shard` (the judge asserts exactly that).
let shardInfo = null
if (SHARD !== null) {
  const reportModes = ['counts', 'self-check', 'scope-report'].filter((m) => has(m))
  if (reportModes.length) {
    console.error('run-tests: shard=' + SHARD.index + '/' + SHARD.count + ' IGNORED (--' + reportModes.join(', --')
      + ' reports the repository, not a shard; the output below is the unsharded answer)')
  } else {
    // WHY the two combinations below are REFUSED, not "supported with a caveat":
    // `GATE_INCREMENTAL=1` SKIPS jobs, and a skipped job is absent from its shard - so "the shards sum to the
    // total", the only property that proves the partition safe, becomes false, and a green shard could be green
    // because its work never ran. A curated scope shrinks the denominator the same way (the shards would sum to
    // a subset, not the full sweep). Both refuse BY NAME because a silent fallback is exactly how a partial
    // sweep gets read as a full one.
    if (GATE_SCOPE !== 'full') {
      console.error('SHARD-SCOPE-UNSUPPORTED: --shard partitions the FULL sweep; GATE_SCOPE=' + GATE_SCOPE
        + ' would make the shards sum to a curated subset, not the full job list. Run the shards with GATE_SCOPE=full.')
      process.exit(2)
    }
    if (String(process.env.GATE_INCREMENTAL || '') === '1') {
      console.error('SHARD-INCREMENTAL-UNSUPPORTED: --shard cannot be combined with GATE_INCREMENTAL=1 - incremental '
        + 'SKIPS jobs, so the shards would no longer sum to the full job list and a green shard could be green because '
        + 'its work never ran. Run the shards with the incremental plan off (GATE_RELEASE=1 also disables it).')
      process.exit(2)
    }
    const base = suites.slice()
    const selected = base.filter((j, k) => k % SHARD.count === SHARD.index - 1)
    if (!selected.length) {
      console.error('SHARD-EMPTY: --shard ' + SHARD.index + '/' + SHARD.count + ' selected 0 of ' + base.length
        + ' job(s) - an EMPTY shard would show up GREEN in CI while proving nothing, so this exits 2 instead of using '
        + 'the generic "no suites matched" (that one means the FILTERS matched nothing). Check that N <= the job count.')
      process.exit(2)
    }
    shardInfo = { index: SHARD.index, count: SHARD.count, selected: selected.length, total: base.length }
    suites = selected
    if (has('shard-plan')) {
      // The judge's ONLY source of shard membership: the runner's own answer, in the deterministic base order
      // (before LPT), so a partition can be verified without running a single job.
      console.log(JSON.stringify({
        shard: shardInfo,
        baseOrder: 'label ASC (deriveJobs(), after scope + --only/--exclude, before lptOrder)',
        jobs: suites.map((j) => label(j)),
      }, null, 2))
      process.exit(0)
    }
  }
}
suites = lptOrder(suites)
// The scope/concurrency header goes to STDERR so `--counts` and `--json` keep stdout machine-readable.
// THE LEGACY LINE IS KEPT BYTE-FOR-BYTE (guards parse it); the SCOPE LINE below is the authoritative one:
// it always prints the REQUESTED scope, the EFFECTIVE scope and the FINAL job count TOGETHER, so a reader can
// never mistake the requested scope for the one that ran. (The old header printed only the requested scope
// beside a job count derived from the effective one - which is what made `scope=vmu jobs=236` read as a scope
// that did nothing, and `scope=quick jobs=177` read as a scoped run.)
if (legacySkipped > 0) {
  console.error('run-tests: legacy=archived ' + legacySkipped + ' behaviour suite(s) NOT run (the five historical presets are '
    + 'archived; the maintained surface is vibe-math-vmu + its v5r pack). They live in tests/legacy/ (the '
    + 'directory IS the list). Run them with GATE_LEGACY=1.')
}
// SELF-PROOF for a shard: `shard=i/N selected=K of M` is appended to BOTH header lines and to the TOTAL line,
// so a shard's log can never be passed off as a full sweep (and a shard that selected everything says so too).
const shardProof = shardInfo
  ? '  shard=' + shardInfo.index + '/' + shardInfo.count + ' selected=' + shardInfo.selected + ' of ' + shardInfo.total
  : ''
console.error('run-tests: scope=' + GATE_SCOPE + '  jobs=' + suites.length + '  concurrency=' + concurrency + shardProof)
console.error('run-tests: requested-scope=' + GATE_SCOPE + '  effective-scope=' + SCOPE + '  final-jobs=' + suites.length
  + (filters.length ? '  filters=[' + filters.join(' ') + ']' : '') + shardProof)
// The override itself was already NAMED where the scope was decided (above, so `--self-check` sees it too);
// this header is the one line that always carries requested scope + effective scope + final job count.
// SCOPE GUARDS (checked on EVERY run, not only under --self-check, because the gate is where a curated
// filter would hurt): the quick subset must resolve to a FIXED number of jobs and must contain NO mutant
// family. A drifted filter therefore REDS BY NAME instead of silently changing what the edit loop covers.
// Update QUICK_EXPECTED_JOBS only when the curated list changes ON PURPOSE (and say so in the commit).
{
  const quickList = applyScope(deriveJobs(), 'quick')
  const quickN = quickList.length
  const quickMutants = quickList.filter((j) => j.file.endsWith('.mutants.mjs')).map((j) => j.file)
  // TWO pinned counts, one switch: with `GATE_LEGACY=1` the archived behaviour suites are back, so the curated
  // quick subset is the old 38; without it the archived entries are gone and it is 24. Both are pinned so a
  // drifted filter still reds by name in EITHER mode, and the header says which count applies.
  const quickExpected = LEGACY_ALLOW ? QUICK_EXPECTED_JOBS_LEGACY : QUICK_EXPECTED_JOBS
  if (quickN !== quickExpected) {
    console.error('FAIL - * gate scope: the quick subset must resolve to exactly ' + quickExpected
      + ' jobs (got ' + quickN + ', GATE_LEGACY=' + (LEGACY_ALLOW ? '1' : '0') + ') - update '
      + (LEGACY_ALLOW ? 'QUICK_EXPECTED_JOBS_LEGACY' : 'QUICK_EXPECTED_JOBS')
      + ' only when the curated list changes on purpose')
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

// --scope-report: print the DERIVED classification as JSON and run NOTHING. This is the surface
// `tests/audit-scope-classification.test.mjs` reads, so the guard asserts the runner's OWN decision instead of
// re-implementing (and drifting from) it. It deliberately does NOT pin the scope: it reports what the
// REQUESTED scope + filters would run, which is how the `--only` orthogonality is verified.
if (has('scope-report')) {
  const jobs = deriveJobs()
  const summarize = (list) => ({
    total: list.length,
    suites: list.filter((j) => j.kind === 'suite').length,
    probes: list.filter((j) => j.kind === 'probe').length,
  })
  const vmuJobs = jobs.filter((j) => j.file.includes('vmu'))
  console.log(JSON.stringify({
    requestedScope: GATE_SCOPE,
    effectiveScope: SCOPE,
    overrideReason: SCOPE === GATE_SCOPE ? null : REPO_WIDE_MODES.map((m) => '--' + m),
    filters: { only, exclude },
    final: summarize(suites),
    scopes: {
      full: summarize(applyScope(jobs, 'full')),
      quick: summarize(applyScope(jobs, 'quick')),
      vmu: summarize(applyScope(jobs, 'vmu')),
    },
    // The EFFECTIVE pinned count for THIS mode (see the two-constant guard above): a report consumer must not
    // compare a legacy-inclusive quick list against the round-230 default constant.
    quickExpectedJobs: LEGACY_ALLOW ? QUICK_EXPECTED_JOBS_LEGACY : QUICK_EXPECTED_JOBS,
    quickExpectedJobsByMode: { legacyOff: QUICK_EXPECTED_JOBS, legacyOn: QUICK_EXPECTED_JOBS_LEGACY },
    legacyAllowed: LEGACY_ALLOW,
    excludeRules: VMU_EXCLUDE,
    // every vmu-NAMED job (`vmu*` and `audit-vmu-*`): in the vmu scope, or out WITH the anchored rule that
    // excluded it. The collision victim is a `vmu*` suite and the mutant families are `audit-vmu-*`, so the
    // question "which vmu jobs does the vmu scope drop, and why" needs BOTH shapes.
    vmuClassification: vmuJobs.map((j) => {
      // ★ Round 232: the scope rules are matched against the suite's NAME (`baseOf`), because the archived
      // presets' jobs now carry a `legacy/` prefix. `file` keeps the path so a reader can still find the file;
      // `name` is what the rules actually saw, and it is what the classification ties must be read against.
      const r = vmuExcludeRule(baseOf(j.file))
      return { file: j.file, name: baseOf(j.file), inVmuScope: !r, excludedBy: r ? r.value : null, excludedWhy: r ? r.why : null }
    }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.file < b.file ? -1 : 1)),
    // The collision detector's raw material: what the OLD unanchored `.includes()` semantics would have
    // dropped vs what the ANCHORED rules drop. The two must differ by exactly `collisionAllowList` below
    // (empty when the rules are collision-free); a NEW collision shows up here by name.
    // Both lists are NAMES (not paths): the question is "would this suite's name have been dropped", and after
    // round 232 a path prefix (`legacy/`) must not be able to make a substring rule look like an anchor rule.
    legacySubstringDrops: jobs.filter((j) => VMU_EXCLUDE.some((r) => baseOf(j.file).includes(r.value))).map((j) => baseOf(j.file)).sort(),
    anchoredDrops: jobs.filter((j) => vmuExcludeRule(baseOf(j.file))).map((j) => baseOf(j.file)).sort(),
  }, null, 2))
  process.exit(0)
}

// --counts: print the DERIVED suite/probe totals (the same job list the gate runs) as JSON, then
// exit. Docs quote these numbers, so they must be derived and checked rather than typed by hand.
// The job TOTAL never shrinks under incremental: the skipped families are reported in their own field.
// REPOSITORY-WIDE BY DESIGN: it always reports the FULL job list (see REPO_WIDE_MODES above), so a doc count
// never depends on how the run was invoked. The SCOPED count, if you need one, is what `--scope-report` prints.
if (process.argv.includes('--counts')) {
  const suiteN = suites.filter((j) => j.kind === 'suite').length
  console.log(JSON.stringify({
    total: suites.length, suites: suiteN, probes: suites.length - suiteN,
    incremental: incremental.enabled, incrementalSkipped: incremental.skipped.length,
    legacySkipped: LEGACY_ALLOW ? 0 : legacySkipped, legacyAllowed: LEGACY_ALLOW,
  }))
  process.exit(0)
}

// ── MUTANT-RESULT CACHE: plan BEFORE any job starts (the reporter prints each hit) ─────────────────
// Families the incremental planner already skipped are NOT cache misses: they never ran, so this block must
// not credit a stored verdict for them either. A cache hit still counts in TOTAL and is still listed by name -
// only its EXECUTION is replaced by a stored PASS. `GATE_RELEASE=1` bypasses the cache entirely (named), and a
// family whose targets cannot be proven to cover its harness's source (`mutantCachePlan` returns null) always
// runs. Both facts are printed, because a silent cache is indistinguishable from a silent under-run.
{
  const familyJobs = suites.filter((j) => isFamilyJob(j.file) && !j.eval)
  const releaseSweep = String(process.env.GATE_RELEASE || '') === '1'
  if (familyJobs.length && releaseSweep) {
    console.error('run-tests: mutant cache BYPASSED (GATE_RELEASE=1 => a release sweep executes every family)')
  } else if (familyJobs.length && !mutantCacheEnabled()) {
    console.error('run-tests: mutant cache DISABLED (GATE_MUTANT_CACHE=0) => every family runs')
  } else if (familyJobs.length) {
    mutantCache.dir = mutantCacheDir()
    let uncached = 0
    for (let i = 0; i < suites.length; i++) {
      const job = suites[i]
      if (!isFamilyJob(job.file) || job.eval) continue
      if (skippedLabels.has(job.file)) continue              // incremental skip: not a cache decision at all
      const plan = mutantCachePlan(job)
      if (!plan) { uncached++; continue }                    // B-tier / underivable: never cached, always runs
      mutantCache.plans.set(i, plan)
      const verdict = readMutantCacheEntry(mutantCache.dir, plan)
      if (verdict.hit) {
        mutantCache.hits++
        mutantCache.hitsByIndex.set(i, { key: plan.key, at: verdict.entry.at })
        mutantCache.freeLabels.add(label(job))
        console.error('MUTANTS SKIP (cached ' + plan.key + ' ' + verdict.entry.at + ')  ' + label(job))
      } else {
        mutantCache.misses++
        if (String(process.env.GATE_MUTANT_CACHE_VERBOSE || '') === '1') {
          console.error('run-tests: mutant cache MISS (' + verdict.reason + ')  ' + label(job) + '  key=' + plan.key)
        }
      }
    }
    mutantCache.enabled = true
    console.error('run-tests: mutant cache ' + mutantCache.hits + ' hit / ' + mutantCache.misses + ' miss'
      + (uncached ? '  /  ' + uncached + ' family job(s) not cacheable (always run)' : '')
      + '  dir=' + mutantCache.dir + '  (GATE_MUTANT_CACHE=0 disables; GATE_MUTANT_CACHE_VERBOSE=1 names each miss)')
    const pruned = pruneMutantCache(mutantCache.dir)
    if (pruned) console.error('run-tests: mutant cache pruned ' + pruned + ' ancient entries (kept the newest 200)')
  }
}

function runSuite(job) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const argv = job.eval ? ['-e', job.eval] : [join(HERE, job.file), ...job.args]
    const limitMs = jobLimit(job)
    const child = spawn(process.execPath, argv, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] })
    let timedOut = false
    // ★ KILL THE WHOLE TREE, NOT JUST THE CHILD. `child.kill()` stops the suite it was pointed at and leaves
    // any process THAT suite spawned running - and audit-generators-current spawns every generator, so a
    // timeout there used to leave generate-wiring-index and generate-vmu-settings-table alive as orphans. Those
    // orphans then competed with the NEXT sweep, which timed out again on an honest suite: one timeout became a
    // cascade of them. This was measured, not inferred - hunting the orphans down and killing them made the same
    // suite finish in 164 s and the sweep go clean. The timeout budget itself is deliberately NOT raised here.
    const killer = setTimeout(() => {
      timedOut = true
      if (process.platform === 'win32' && child.pid) {
        try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }) } catch { /* already gone */ }
      }
      try { child.kill('SIGKILL') } catch (e) { /* already gone */ }
    }, limitMs)
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
  const cached = mutantCache.hitsByIndex.get(i)
  if (cached) {
    // A cache HIT: reported exactly like a PASS, but the marker says the family did NOT execute. The stored
    // verdict was keyed on bytes + mtimes of the harness and every declared target, and only a PASS is stored.
    out[i] = { job, code: 0, ms: 0, out: '', err: '', timedOut: false, cached: { key: cached.key, at: cached.at }, ok: true }
    if (!asJson) {
      console.log('PASS  ' + job.file.padEnd(34) + ' exit=  0            0.0s'
        + (job.args.length ? '  [' + job.args.join(' ').slice(0, 40) + ']' : '')
        + '  MUTANTS SKIP (cached ' + cached.key + ' ' + cached.at + ')')
    }
    return
  }
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
  // STORE ONLY A PASS. A timeout, a non-zero exit or a job that expects a non-zero exit never becomes a cache
  // entry, so no stored verdict can ever launder a failure into a later "PASS". A write failure is a named
  // stderr note and NEVER changes the verdict: the family really ran.
  const plan = mutantCache.plans.get(i)
  if (plan && r.ok && !r.timedOut && r.job.expectExit === 0) {
    try { storeMutantCacheEntry(mutantCache.dir, plan, r.ms, true) }
    catch (e) { console.error('run-tests: mutant cache write FAILED (' + ((e && e.message) || e) + ') — the family ran and PASSED; only its entry is missing') }
  }
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
async function runPool(list, out, skippedSet, baselineLabel, freeSet) {
  const free = freeSet || skippedSet     // cost-free jobs = incremental skips AND mutant-cache hits
  const minMs = headstartMinMs()
  const holdMs = headstartHoldMs()
  const hsIdx = minMs > 0 ? headstartJobIndex(list, free) : -1
  const executed = list.filter((j) => !costFree(free, j)).length
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
const poolInfo = await runPool(suites, results, skippedLabels, incremental.baseline,
  new Set([...skippedLabels, ...mutantCache.freeLabels]))
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
    // A machine report carries the shard identity too: `null` means the WHOLE sweep ran (not "an unknown slice").
    shard: shardInfo,
    // A machine report must carry the same honesty the human TOTAL line does: hits/misses and the cache dir.
    mutantCache: {
      enabled: mutantCache.enabled,
      dir: mutantCache.enabled ? mutantCache.dir : null,
      hits: mutantCache.hits, misses: mutantCache.misses, version: MUTANT_CACHE_VERSION,
    },
    runs: results.map((r) => ({
      file: r.job.file, args: r.job.args, expectExit: r.job.expectExit, exit: r.code,
      seconds: Number((r.ms / 1000).toFixed(1)),
      ...(r.skipped ? { skipped: 'incremental: targets unchanged vs ' + incremental.baseline } : {}),
      ...(r.cached ? { cached: r.cached.key, cachedAt: r.cached.at } : {}),
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
    + '  (suites ' + suiteCount + ' · probes ' + (results.length - suiteCount) + ')'
    + shardProof
    // HONESTY LINE: a cached sweep must never read like an executed one. Hits and misses are always both shown,
    // and the hit count is the number of families whose execution was REPLACED by a stored verdict.
    + (mutantCache.enabled ? '  ·  mutant cache: ' + mutantCache.hits + ' hit / ' + mutantCache.misses + ' miss' : ''))
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
