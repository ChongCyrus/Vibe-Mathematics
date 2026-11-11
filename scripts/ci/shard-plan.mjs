#!/usr/bin/env node
// scripts/ci/shard-plan.mjs — the CI split plan, answered by the runner, never copied from it.
//
// WHY THIS FILE CARRIES NO JOB LIST. The gate has exactly one owner of the job list: tests/run-tests.mjs
// (`deriveJobs()`). A second copy here would drift silently: rename a suite and the gate would keep running
// the old name, or run nothing at all, and both look green. So this script ASKS the runner three questions
// and never enumerates a file:
//
//   1. no filters                    → full     (`scopes.full.total`, 869 at RUN 79)
//   2. `--only <label>` per row      → does that label still resolve, and to how many jobs?
//   3. `--exclude <every label>`     → expected (post-exclusion; 866 for the three rows in ci-exclusions.json)
//
// WHY THE PLAN IS ALLOWED TO COMPUTE THE SHARD SIZES. TB-2737 cuts at one fixed point: after scope +
// `--only`/`--exclude`, BEFORE `lptOrder()`, the base order (label ASC, the order `deriveJobs()` returns)
// is cut at `k % N === i-1`. Cutting a contiguous base order modulo N distributes `expected` jobs over N
// shards with sizes that differ by at most one, so:
//
//   count(i) = floor((expected - i) / N) + 1        (1-based i; 0 when expected < i)
//
// We do not read `DURATION_WEIGHTS` and we do not time anything: both would make the plan a property of
// the machine. The plan states the arithmetic; `union` in the workflow re-derives the same number from the
// shards themselves, so a mismatch reds instead of hiding.
//
// WHY `--check` REFUSES TWO SHAPES:
//   · sum(shards.count) !== expected → some job runs in NO shard: a silent under-run that reports success;
//   · any shard == 0                → `SHARD-EMPTY`: an empty shard is green while verifying nothing
//                                     (same code TB-2737 uses runner-side).
//
// WHY A STALE EXCLUSION IS AN ERROR, NOT A WARNING. `--exclude` filters by substring; a label that
// matches no job excludes nothing and silently WIDENS the gate (the row looks like a considered decision
// and the job it meant to skip now runs, or worse, the suite it named was renamed and something else is
// skipped). The runner is the only authority that can say "this label still selects jobs", so we ask it.
//
// USAGE
//   node scripts/ci/shard-plan.mjs [--shards 8] [--exclusions ci-exclusions.json] [--check] [--json]
//   exit 0 = plan printed (and, with --check, internally consistent)
//   exit 1 = plan printed with errors (stderr has one `FAIL - * shard-plan: <CODE> …` per error)
//   exit 2 = the runner could not be asked at all (RUNNER-UNAVAILABLE) — a transient CI problem, not a red gate
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs' // fs-purpose: the CI plan reads ci-exclusions.json (RUN 79 / TB-2738)
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RUNNER = join(REPO, 'tests', 'run-tests.mjs')
const WHY_MIN = 24

const argv = process.argv.slice(2)
const flag = (name) => argv.includes('--' + name)
const option = (name, fallback) => {
  const joined = argv.find((item) => item.startsWith('--' + name + '='))
  if (joined !== undefined) return joined.slice(name.length + 3)
  const index = argv.indexOf('--' + name)
  if (index !== -1 && index + 1 < argv.length && argv[index + 1].slice(0, 2) !== '--') return argv[index + 1]
  return fallback
}

const SHARDS_RAW = option('shards', '8')
const SHARDS = Number(SHARDS_RAW)
const WANT_CHECK = flag('check')
const EXCLUSIONS = (() => {
  const raw = option('exclusions', 'ci-exclusions.json')
  return isAbsolute(raw) ? raw : join(REPO, raw)
})()

function planFail(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

// `allowZero` is for the questions where 0 is a legitimate ANSWER, not a failure: `--only <stale label>`
// exits 2 with "no suites matched … => 0 jobs" (a filter that selects nothing is how the runner reports a
// stale label), and excluding everything does the same. Treating that exit as RUNNER-UNAVAILABLE would hide
// the two failures this script exists to name (STALE-EXCLUSION / NO-JOBS) behind a transient-looking code.
function runScopeReport(extra = [], { allowZero = false } = {}) {
  const args = [RUNNER, '--scope-report', '--json', '--no-temp-hygiene', ...extra]
  const result = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.error || result.status !== 0) {
    const stderr = String(result.stderr || '')
    if (allowZero && result.status === 2 && /no suites matched|=> 0 jobs/.test(stderr)) {
      return { requestedScope: 'full', scopes: { full: { total: 0 } }, final: { total: 0 } }
    }
    const tail = stderr.trim().split('\n').filter((line) => line !== '')
    throw planFail('RUNNER-UNAVAILABLE', 'node tests/run-tests.mjs ' + ['--scope-report', ...extra].join(' ') + ' exited ' + result.status + (tail.length > 0 ? ' :: ' + tail[tail.length - 1] : ''))
  }
  let report = null
  try {
    report = JSON.parse(result.stdout)
  } catch {
    report = null
  }
  if (report === null || typeof report !== 'object') throw planFail('RUNNER-UNAVAILABLE', 'the runner printed something that is not JSON: ' + String(result.stdout).slice(0, 120))
  if (!report.scopes || !report.scopes.full || typeof report.scopes.full.total !== 'number') throw planFail('RUNNER-UNAVAILABLE', 'the scope report has no scopes.full.total')
  if (!report.final || typeof report.final.total !== 'number') throw planFail('RUNNER-UNAVAILABLE', 'the scope report has no final.total')
  return report
}

function readExclusions() {
  let text = null
  try {
    text = readFileSync(EXCLUSIONS, 'utf8')
  } catch (error) {
    throw planFail('EXCLUSIONS-UNREADABLE', 'cannot read ' + EXCLUSIONS + ' (' + error.code + ')')
  }
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw planFail('EXCLUSIONS-SHAPE', EXCLUSIONS + ' is not JSON: ' + error.message)
  }
  const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.exclusions) ? parsed.exclusions : null
  if (list === null) throw planFail('EXCLUSIONS-SHAPE', 'expected a JSON array of {label, why, localGuard} rows (or {exclusions: [...]})')
  return list
}

const errors = []
const warnings = []
const entries = []
let full = null
let expected = null
let shards = []
let sums = { shards: 0, expected: null }

try {
  if (!Number.isInteger(SHARDS) || SHARDS < 2) throw planFail('SHARD-COUNT', '--shards must be an integer >= 2 (got ' + SHARDS_RAW + ')')
  const rows = readExclusions()
  const fullReport = runScopeReport()
  full = fullReport.scopes.full.total
  if (fullReport.requestedScope !== undefined && fullReport.requestedScope !== 'full') {
    errors.push({ code: 'PLAN-REQUIRES-FULL', message: 'the runner is in scope ' + fullReport.requestedScope + ': the plan must count the full list, so run it without GATE_SCOPE / --scope' })
  }

  for (const [index, row] of rows.entries()) {
    const label = row && typeof row.label === 'string' ? row.label.trim() : ''
    const why = row && typeof row.why === 'string' ? row.why : ''
    const guard = row && typeof row.localGuard === 'string' ? row.localGuard.trim() : ''
    const whyChars = [...why].length
    if (label === '') {
      errors.push({ code: 'EXCLUSION-SHAPE', message: 'row ' + index + ' has no label' })
      continue
    }
    if (whyChars < WHY_MIN) {
      errors.push({ code: 'WHY-TOO-SHORT', label, chars: whyChars, min: WHY_MIN, message: 'the why for ' + label + ' is ' + whyChars + ' chars (< ' + WHY_MIN + '): name the machine property it measures, or nobody can tell this apart from a broken suite that was silenced' })
    }
    if (guard === '') {
      errors.push({ code: 'GUARD-EMPTY', label, message: 'the localGuard for ' + label + ' is empty: a CI exclusion with no local reader is a deleted assertion' })
    }
    const only = runScopeReport(['--only', label], { allowZero: true })
    const jobs = only.final.total
    if (jobs === 0) {
      errors.push({ code: 'STALE-EXCLUSION', label, message: 'the runner selects 0 jobs for ' + label + ' — excluding it would silently widen the gate; the label may name a suite that was renamed or removed' })
    }
    entries.push({ label, whyChars, jobs })
  }

  const labels = entries.map((entry) => entry.label)
  const excludedReport = labels.length > 0 ? runScopeReport(labels.flatMap((label) => ['--exclude', label]), { allowZero: true }) : fullReport
  expected = excludedReport.final.total

  const claimed = entries.reduce((total, entry) => total + entry.jobs, 0)
  if (claimed !== full - expected) {
    warnings.push({ code: 'EXCLUSION-OVERLAP', message: 'the rows select ' + claimed + ' jobs in total but only ' + (full - expected) + ' jobs left the list: labels are substrings and may overlap, or the runner changed between the questions' })
  }

  shards = []
  for (let i = 1; i <= SHARDS; i += 1) shards.push({ i, count: expected >= i ? Math.floor((expected - i) / SHARDS) + 1 : 0 })
  sums = { shards: shards.reduce((total, shard) => total + shard.count, 0), expected }

  if (WANT_CHECK) {
    if (expected <= 0) {
      errors.push({ code: 'NO-JOBS', message: 'the post-exclusion plan selects 0 jobs: everything is excluded, so the gate would pass by doing nothing' })
    }
    if (sums.shards !== expected) {
      errors.push({ code: 'PLAN-SUM-MISMATCH', message: 'the shards sum to ' + sums.shards + ' but the post-exclusion list has ' + expected + ' jobs: ' + (expected - sums.shards) + ' would run in no shard at all' })
    }
    const empties = shards.filter((shard) => shard.count === 0).map((shard) => String(shard.i))
    if (empties.length > 0) {
      errors.push({ code: 'SHARD-EMPTY', message: 'shard(s) ' + empties.join(',') + ' of ' + SHARDS + ' select 0 of ' + expected + ' jobs: an empty shard reports green while verifying nothing' })
    }
  }
} catch (error) {
  errors.push({ code: error.code || 'PLAN-FAILED', message: error.message })
}

const runnerDown = errors.some((error) => error.code === 'RUNNER-UNAVAILABLE')
const plan = {
  ok: errors.length === 0,
  shardCount: SHARDS,
  full,
  excluded: full !== null && expected !== null ? full - expected : null,
  expected,
  exclusions: entries,
  shards,
  sums,
  warnings,
  errors,
}

console.log(JSON.stringify(plan, null, 2))
if (errors.length > 0) {
  for (const error of errors) console.error('FAIL - * shard-plan: ' + error.code + ' ' + error.message)
  process.exit(runnerDown ? 2 : 1)
}
console.error('shard-plan: full=' + full + ' excluded=' + plan.excluded + ' expected=' + expected + ' shards=' + SHARDS + (WANT_CHECK ? ' ok' : ' (use --check to enforce the sum and the empty-shard rule)'))
