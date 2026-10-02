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
 *   node tests/run-tests.mjs                      # every suite + probe, concurrency = min(4, cpus)
 *   node tests/run-tests.mjs --concurrency=6
 *   node tests/run-tests.mjs --only formal        # substring match on the file name (repeatable, OR)
 *   node tests/run-tests.mjs --exclude e2e-v4     # substring to skip (repeatable)
 *   node tests/run-tests.mjs --json               # machine-readable summary on stdout
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { cpus } from 'node:os'
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
const asJson = has('json')
const concurrency = Math.max(1, Number(flag('concurrency')[0] || Math.min(4, cpus().length)))

const SELF = 'run-tests.mjs'
// Per-suite HARD timeout (GATE_SUITE_TIMEOUT_MS overrides, ms). It bounds an intermittent hang so the
// gate always terminates and a hang is reported - never mistaken for "still running". 180 s comes from
// measurements: whole-gate wall ~200 s, slowest honest suite 135-144 s (audit-math-computation-sensitivity),
// so 180 s bounds a hang without killing an honest slow suite. Do NOT raise it silently to "fix" reds.
const SUITE_TIMEOUT_MS = Math.max(1000, Number(process.env.GATE_SUITE_TIMEOUT_MS || 180000))

// NAMED per-suite overrides for suites that are HONEST but slow (measured, not guessed). Raising a
// limit is a documented act: update the numbers here AND say so in the commit message - never silently.
//   v2-fix-probes.mutants.mjs: ~43.1 s per family x 10 families ~= 430 s measured (inner child cap 120 s)
//   v3-fix-probes.mutants.mjs: ~23.5 s per family x 11 families ~= 260 s measured (inner child cap 120 s)
// Both report hangs=[] with their own 120 s child cap, i.e. they are slow, not hung - so the 180 s
// default would misreport them. Everything else keeps the 180 s default.
const TIMEOUT_OVERRIDES = {
  'v2-fix-probes.mutants.mjs': 900000,
  'v3-fix-probes.mutants.mjs': 900000,
}
/** One place decides a job limit: explicit job value, then the named override, then the default. */
function jobLimit(job) { return job.timeoutMs || TIMEOUT_OVERRIDES[job.file] || SUITE_TIMEOUT_MS }
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
  const overrideOk = jobLimit({ file: 'v2-fix-probes.mutants.mjs' }) === 900000 && jobLimit({ file: 'anything-else.mjs' }) === SUITE_TIMEOUT_MS
  const survived = await runSuite({ file: '(synthetic-ok)', args: [], expectExit: 0, kind: 'probe', eval: 'setTimeout(() => {}, 1500)', timeoutMs: 900000 })
  const extended = survived.timedOut === false && survived.code === 0
  const overrideLine = failedLine({ job: { file: 'v2-fix-probes.mutants.mjs', args: [], kind: 'probe', expectExit: 0 }, code: null, timedOut: true })
  const namesOverride = /TIMEOUT after 900s/.test(overrideLine)
  console.log((overrideOk ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL') + ': a named override is resolved for its suite and nothing else')
  console.log((extended ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL') + ': a job that would die at 1 s SURVIVES under the override (real runSuite)')
  console.log((namesOverride ? 'SELF-CHECK PASS' : 'SELF-CHECK FAIL') + ': a timed-out override reports its own limit (' + overrideLine.trim() + ')')
  process.exit(okSelf && okPassing && okReal && okAbort && killedByRunner && namedTimeout && overrideOk && extended && namesOverride ? 0 : 1)
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
  // The two-registration-paths probe, inverted: it applies a real description mutation and
  // REQUIRES the parity check to exit 1 (exit 2 means the mutation no longer applies = drift).
  {
    file: 'audit-v3-registration-parity.mjs',
    args: ['--self-probe', '["TOOL_DESC.vibe_math_start","TOOL_DESC.vibe_math_startX"]'],
    expectExit: 1,
  },
]

const present = readdirSync(HERE).filter((f) => f.endsWith('.mjs')).sort()
const presentSet = new Set(present)
// A published tarball ships only a SUBSET of `tests/` (see docs/test-timing.md §1), so the
// scripts that stay behind are simply ABSENT there. The skip/variant lists are therefore
// enforced strictly in a development checkout (a `.git` entry marks one) and merely REPORTED —
// never silently dropped, they still appear in every run's output — in a partial tree.
const DEV_CHECKOUT = existsSync(join(REPO, '.git'))
const stale = Object.keys(NEEDS_ARGS).filter((f) => !presentSet.has(f))
if (stale.length && DEV_CHECKOUT) {
  console.error('NEEDS_ARGS names a script that no longer exists: ' + stale.join(', ') + ' — fix the skip list, do not delete the entry blindly')
  process.exit(2)
}
function label(j) { return j.file + (j.args.length ? ' ' + j.args.join(' ') : '') }
const replacedBare = new Set(VARIANTS.filter((v) => v.replaceBare).map((v) => v.file))
let suites = []
for (const file of present) {
  if (file === SELF || NEEDS_ARGS[file] || replacedBare.has(file)) continue
  suites.push({ file, args: [], expectExit: 0, kind: file.endsWith('.test.mjs') ? 'suite' : 'probe' })
}
for (const v of VARIANTS) {
  if (!presentSet.has(v.file)) {
    if (DEV_CHECKOUT) { console.error('a VARIANTS entry names a missing script: ' + v.file); process.exit(2) }
    continue
  }
  suites.push({ file: v.file, args: v.args || [], expectExit: v.expectExit || 0, kind: v.file.endsWith('.test.mjs') ? 'suite' : 'probe' })
}
suites.sort((a, b) => (label(a) < label(b) ? -1 : 1))
if (only.length) suites = suites.filter((j) => only.some((o) => label(j).includes(o)))
if (exclude.length) suites = suites.filter((j) => !exclude.some((o) => label(j).includes(o)))
if (!suites.length) { console.error('no suites matched'); process.exit(2) }

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

const results = []
let cursor = 0
const started = Date.now()
async function worker(id) {
  for (;;) {
    const i = cursor++
    if (i >= suites.length) return
    const r = await runSuite(suites[i])
    const tail = String(r.out).trim().split('\n').filter(Boolean).slice(-1)[0] || ''
    r.ok = r.code === r.job.expectExit
    results[i] = r
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
}
await Promise.all(Array.from({ length: Math.min(concurrency, suites.length) }, (_, i) => worker(i)))

const wall = (Date.now() - started) / 1000
const sum = results.reduce((a, r) => a + r.ms, 0) / 1000
const bad = results.filter((r) => !r.ok)
const slowest = results.slice().sort((a, b) => b.ms - a.ms).slice(0, 5)
const suiteCount = results.filter((r) => r.job.kind === 'suite').length

if (asJson) {
  console.log(JSON.stringify({
    concurrency, wallSeconds: Number(wall.toFixed(1)), sumSeconds: Number(sum.toFixed(1)),
    pass: results.length - bad.length, fail: bad.length,
    suites: suiteCount, probes: results.length - suiteCount,
    devCheckout: DEV_CHECKOUT,
    skippedNeedsArgs: NEEDS_ARGS,
    runs: results.map((r) => ({
      file: r.job.file, args: r.job.args, expectExit: r.job.expectExit, exit: r.code,
      seconds: Number((r.ms / 1000).toFixed(1)),
      ...(r.tailDetail ? { detail: r.tailDetail } : {}),
    })),
  }, null, 2))
} else {
  console.log('')
  console.log('concurrency ' + concurrency + '  ·  wall ' + wall.toFixed(1) + 's  ·  sum of suite times ' + sum.toFixed(1) + 's'
    + '  ·  speed-up x' + (sum / Math.max(wall, 0.001)).toFixed(2))
  console.log('slowest: ' + slowest.map((r) => r.job.file.replace('.test.mjs', '') + ' ' + (r.ms / 1000).toFixed(1) + 's').join('  ·  '))
  console.log('TOTAL ' + results.length + '  PASS ' + (results.length - bad.length) + '  FAIL ' + bad.length
    + '  (suites ' + suiteCount + ' · probes ' + (results.length - suiteCount) + ')')
  for (const b of bad) {
    console.log(failedLine(b))
    for (const l of failureDetail(b)) console.log('      ' + l)
  }
  for (const [f, why] of Object.entries(NEEDS_ARGS)) {
    console.log('  SKIPPED (needs CLI args): ' + f + ' — ' + why + (presentSet.has(f) ? '' : '  [not present in this checkout]'))
  }
}
process.exit(bad.length === 0 ? 0 : 1)
