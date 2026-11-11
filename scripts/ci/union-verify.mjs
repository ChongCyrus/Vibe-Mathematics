#!/usr/bin/env node
// scripts/ci/union-verify.mjs — the arithmetic proof that eight shards ARE the gate (RUN 79 / TB-2738).
//
// WHY A SCRIPT INSTEAD OF THREE LINES OF `jq` IN THE WORKFLOW. The union job is the only place where a
// partition can be caught lying: each shard reports what it selected, and the sum must equal the plan that
// the SAME run produced. Every one of these checks has a failure behind it:
//
//   1. the eight artifacts must exist AND belong to THIS run (run_id + run_attempt + the plan hash). Reusing
//      yesterday green artifact is how "the union passed" becomes a statement about another tree;
//   2. per shard: reported selected == plan.shards[i-1].count, and reported total == plan.expected. A shard that
//      ran a different filter (or no filter) says so here;
//   3. Σ selected == plan.sums.shards == plan.expected — three numbers, one fact. Printing all three when they
//      disagree is the difference between "union mismatch" and "shard 5 lost 3 jobs";
//   4. every shard must report FAIL 0. A union that sums correctly while one shard is red is arithmetic about a
//      broken gate;
//   5. the three excluded labels must NOT appear in any shard's job list. That is a SET assertion: counting them
//      could still pass if one excluded job ran in two shards and another ran in none;
//   6. the shard job lists must be disjoint and their union must have exactly `expected` members. Together with
//      (3) and (5) this is the partition contract: every job runs in exactly one shard, and none is skipped.
//
// TWO MODES
//   write-meta --out <file> [--plan <file>]   seal an artifact to this run (env RUN_ID, RUN_ATTEMPT, HEAD_SHA)
//   --dir <download-dir> [--expected-run] [--expected-attempt]
//                                             verify the downloaded artifacts and print the proof
//
// The verifier never trusts the plan artifact blindly: it recomputes the plan sha256 and compares it with the
// hash each shard sealed itself against, so "the shards ran a plan from another run" is a NAMED red.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs' // fs-purpose: the CI union proof reads the downloaded artifacts (TB-2738)
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const argv = process.argv.slice(2)
const flag = (name) => argv.includes('--' + name)
const option = (name, fallback = null) => {
  const joined = argv.find((item) => item.startsWith('--' + name + '='))
  if (joined !== undefined) return joined.slice(name.length + 3)
  const index = argv.indexOf('--' + name)
  if (index !== -1 && index + 1 < argv.length && argv[index + 1].slice(0, 2) !== '--') return argv[index + 1]
  return fallback
}
const sha256Of = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

function writeMeta() {
  const out = option('out', 'meta.json')
  const planPath = option('plan', null)
  const runId = String(process.env.RUN_ID || '').trim()
  const runAttempt = String(process.env.RUN_ATTEMPT || '').trim()
  const headSha = String(process.env.HEAD_SHA || '').trim()
  if (runId === '' || runAttempt === '') {
    console.error('FAIL - * union: META-NO-RUN RUN_ID and RUN_ATTEMPT must be in the environment (a metadata file that cannot name its run is not a binding)')
    process.exit(1)
  }
  const absoluteOut = isAbsolute(out) ? out : join(process.cwd(), out)
  const meta = { runId, runAttempt, headSha, planSha256: null }
  if (planPath !== null) {
    const absolutePlan = isAbsolute(planPath) ? planPath : join(process.cwd(), planPath)
    if (!existsSync(absolutePlan)) {
      console.error('FAIL - * union: META-NO-PLAN cannot seal against ' + planPath + ' (the artifact would not say which plan it ran)')
      process.exit(1)
    }
    meta.planSha256 = sha256Of(absolutePlan)
  }
  writeFileSync(absoluteOut, JSON.stringify(meta, null, 2) + '\n', 'utf8')
  console.log('union-verify: sealed ' + out + ' run=' + runId + '/' + runAttempt + (meta.planSha256 ? ' plan.sha256=' + meta.planSha256.slice(0, 12) : ''))
}

function verify() {
  const dir = option('dir', null)
  if (dir === null) {
    console.error('FAIL - * union: USAGE use `--dir <download-dir>` to verify, or `write-meta --out <file>` to seal an artifact')
    process.exit(2)
  }
  const root = isAbsolute(dir) ? dir : join(process.cwd(), dir)
  const errors = []
  const addError = (code, message) => errors.push({ code, message })

  // The download dir is REQUIRED: "there is no directory" must never read as "no artifacts, therefore zero
  // shards, therefore a clean sum". Refuse by name, then read without a fallback.
  if (!existsSync(root)) {
    console.error('FAIL - * union: NO-DOWNLOAD-DIR ' + root + ' does not exist — download the shard artifacts into it (actions/download-artifact) or pass the right --dir; an absent dir is not an empty sum')
    process.exit(2)
  }
  const subdirs = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  const planDirs = subdirs.filter((name) => name.startsWith('shard-plan-'))
  const suiteDirs = subdirs.filter((name) => name.startsWith('suite-'))

  // ① the plan artifact, sealed to this run
  let plan = null
  let planMeta = null
  let planHash = null
  if (planDirs.length !== 1) {
    addError('PLAN-ARTIFACT', 'expected exactly one shard-plan artifact, found ' + planDirs.length + (planDirs.length > 0 ? ': ' + planDirs.join(', ') : '') + ' — a union without the plan is a sum without a denominator')
  } else {
    const planDir = join(root, planDirs[0])
    const planPath = join(planDir, 'shard-plan.json')
    const metaPath = join(planDir, 'meta.json')
    if (!existsSync(planPath) || !existsSync(metaPath)) {
      addError('PLAN-ARTIFACT', 'the plan artifact ' + planDirs[0] + ' is missing shard-plan.json or meta.json')
    } else {
      planHash = sha256Of(planPath)
      planMeta = readJson(metaPath)
      try {
        plan = readJson(planPath)
      } catch (error) {
        addError('PLAN-INVALID', 'shard-plan.json is not JSON: ' + error.message)
      }
      if (planMeta.planSha256 !== planHash) {
        addError('PLAN-HASH-MISMATCH', 'the plan artifact says planSha256=' + prefix(planMeta.planSha256) + ' but the file hashes to ' + prefix(planHash) + ' — the artifact was altered after it was sealed')
      }
    }
  }

  const expectedRun = option('expected-run', planMeta ? String(planMeta.runId) : null)
  const expectedAttempt = option('expected-attempt', planMeta ? String(planMeta.runAttempt) : null)
  if (expectedRun !== null && planMeta !== null && String(planMeta.runId) !== String(expectedRun)) {
    addError('RUN-MISMATCH', 'union belongs to run ' + expectedRun + ' but the plan artifact says ' + planMeta.runId)
  }
  if (expectedAttempt !== null && planMeta !== null && String(planMeta.runAttempt) !== String(expectedAttempt)) {
    addError('RUN-MISMATCH', 'union belongs to attempt ' + expectedAttempt + ' but the plan artifact says ' + planMeta.runAttempt)
  }
  // ★ the sealed head is redundancy, not a barrier: the artifact names cannot carry another tree's
  // green shards, but when the union is assembled somewhere else the payload should SAY that the
  // plan was sealed against a different head instead of leaving it to be inferred from a green sum.
  const expectedHead = String(process.env.HEAD_SHA || '').trim()
  if (expectedHead !== '' && planMeta !== null && planMeta.headSha) {
    if (String(planMeta.headSha) !== expectedHead) {
      addError('HEAD-MISMATCH', 'the plan artifact is sealed to head ' + prefix(planMeta.headSha) + ' but this job runs head ' + prefix(expectedHead) + ' — a union over another tree cannot vouch for this one')
    }
  }
  if (plan === null) {
    return finish(errors, null, null)
  }
  if (plan.ok !== true || !Array.isArray(plan.shards) || !plan.sums) {
    addError('PLAN-INVALID', 'the plan is not a green plan (ok=' + JSON.stringify(plan.ok) + ', shards=' + Array.isArray(plan.shards) + ', sums=' + Boolean(plan.sums) + ')')
    return finish(errors, plan, null)
  }

  // ② the eight shard artifacts, each parsed by its own name, and each sealed to the SAME run + SAME plan
  const byIndex = new Map()
  for (const name of suiteDirs) {
    const match = /^suite-(\d+)-(\d+)-(\d+)$/.exec(name)
    if (!match) {
      addError('ARTIFACT-COUNT', 'artifact directory ' + name + ' does not look like suite-<run_id>-<attempt>-<shard>; the union cannot tell which shard it is')
      continue
    }
    const index = Number(match[3])
    if (byIndex.has(index)) {
      addError('EXTRA-SHARD', 'shard ' + index + ' appears twice (' + byIndex.get(index).name + ', ' + name + ') — one of them is a leftover artifact')
      continue
    }
    byIndex.set(index, { name, dir: join(root, name), runId: match[1], attempt: match[2] })
  }
  const expectedShards = plan.shardCount
  const missing = []
  for (let i = 1; i <= expectedShards; i += 1) if (!byIndex.has(i)) missing.push(String(i))
  if (missing.length > 0) {
    addError('MISSING-SHARD', 'shard(s) ' + missing.join(',') + ' of ' + expectedShards + ' are missing from the artifacts: the sum cannot cover the plan without them')
  }

  const reports = []
  const allLabels = []
  const excludedLabels = Array.isArray(plan.exclusions) ? plan.exclusions.map((row) => String(row.label)) : []
  for (let i = 1; i <= expectedShards; i += 1) {
    const found = byIndex.get(i)
    if (!found) continue
    if (String(expectedRun) !== found.runId || String(expectedAttempt) !== found.attempt) {
      addError('RUN-MISMATCH', 'shard ' + i + ' artifact ' + found.name + ' belongs to ' + found.runId + '/' + found.attempt + ', not ' + expectedRun + '/' + expectedAttempt + ' — an old green shard must never be summed into this run')
    }
    const metaPath = join(found.dir, 'shard-meta.json')
    const reportPath = join(found.dir, 'shard-report.json')
    if (!existsSync(metaPath)) {
      addError('META-MISSING', 'shard ' + i + ' has no shard-meta.json, so nothing ties it to run ' + expectedRun + '/' + expectedAttempt)
    } else {
      const meta = readJson(metaPath)
      if (String(meta.runId) !== String(expectedRun) || String(meta.runAttempt) !== String(expectedAttempt)) {
        addError('RUN-MISMATCH', 'shard ' + i + ' meta says run ' + meta.runId + '/' + meta.runAttempt + ', expected ' + expectedRun + '/' + expectedAttempt)
      }
      if (meta.planSha256 !== planHash) {
        addError('PLAN-HASH-MISMATCH', 'shard ' + i + ' sealed against plan ' + prefix(meta.planSha256) + ' but the plan artifact is ' + prefix(planHash) + ' — this shard planned a different tree')
      }
    }
    if (!existsSync(reportPath)) {
      addError('SHARD-REPORT-MISSING', 'shard ' + i + ' has no shard-report.json: it either crashed before the sweep or its log was mistaken for a report')
      continue
    }
    let report = null
    try {
      report = readJson(reportPath)
    } catch (error) {
      addError('SHARD-REPORT-MISSING', 'shard ' + i + ' report is not JSON (' + error.message + ')')
      continue
    }
    const planned = plan.shards[i - 1]
    const reported = report && report.shard ? report.shard : null
    if (!reported) {
      addError('SHARD-SELECTED-MISMATCH', 'shard ' + i + ' report carries no shard identity, so its number cannot be tied to the plan')
      continue
    }
    if (Number(reported.index) !== i || Number(reported.count) !== expectedShards) {
      addError('SHARD-SELECTED-MISMATCH', 'shard ' + i + ' reports identity ' + reported.index + '/' + reported.count + ', expected ' + i + '/' + expectedShards)
    }
    if (Number(reported.selected) !== Number(planned.count)) {
      addError('SHARD-SELECTED-MISMATCH', 'shard ' + i + ' selected ' + reported.selected + ' but the plan gives it ' + planned.count)
    }
    if (Number(reported.total) !== Number(plan.expected)) {
      addError('SHARD-TOTAL-MISMATCH', 'shard ' + i + ' ran against ' + reported.total + ' post-exclusion jobs, the plan says ' + plan.expected + ' — the shard used different filters')
    }
    if (Number(report.fail) !== 0) {
      addError('SHARD-RED', 'shard ' + i + ' reports fail=' + report.fail + '; a union over a red shard is arithmetic about a broken gate')
    }
    const runs = Array.isArray(report.runs) ? report.runs : []
    if (runs.length !== Number(reported.selected)) {
      addError('SHARD-REPORT-TRUNCATED', 'shard ' + i + ' says selected=' + reported.selected + ' but its report lists ' + runs.length + ' run(s)')
    }
    for (const run of runs) {
      // ★ the runner's `--json` splits a job into { file, args[] }: the file is a BASENAME and the
      // arguments live beside it. Rebuilding the label from `file` alone would collapse every
      // parameterised job onto one name — a partition that is correct then looks like DUPLICATE-JOB.
      // This must stay the same definition as label() in tests/run-tests.mjs.
      const label = labelOfRun(run)
      allLabels.push(label)
      for (const excluded of excludedLabels) {
        if (excluded !== '' && label.includes(excluded)) {
          addError('EXCLUSION-PRESENT', 'shard ' + i + ' ran ' + label + ', which the plan excludes (' + excluded + ') — an exclusion that does not exclude is a gate with a hole')
        }
      }
    }
    reports.push({ i, selected: Number(reported.selected), fail: Number(report.fail), runs: runs.length })
  }

  // ③ three numbers, one fact
  const sumSelected = reports.reduce((total, report) => total + report.selected, 0)
  if (sumSelected !== plan.sums.shards || sumSelected !== plan.expected || plan.sums.shards !== plan.expected) {
    addError('UNION-SUM-MISMATCH', 'Σ selected=' + sumSelected + ', plan.sums.shards=' + plan.sums.shards + ', plan.expected=' + plan.expected + ' — all three must be the same number')
  }

  // ④ the partition contract: no duplicate job, and the union has exactly `expected` distinct members
  const unique = new Set(allLabels)
  if (unique.size !== allLabels.length) {
    const seen = new Set()
    const duplicates = []
    for (const label of allLabels) {
      if (seen.has(label)) duplicates.push(label)
      seen.add(label)
    }
    addError('DUPLICATE-JOB', 'the same job appears in more than one shard: ' + [...new Set(duplicates)].slice(0, 8).join(', ') + ' — the partition is not disjoint')
  }
  if (unique.size !== plan.expected) {
    const difference = unique.size - plan.expected
    addError('UNION-SET-MISMATCH', 'the union of the shard job lists has ' + unique.size + ' distinct job(s), the plan expects ' + plan.expected + ' — ' + (difference > 0 ? difference + ' job(s) ran in more than one shard or outside the plan' : (-difference) + ' job(s) ran in no shard'))
  }
  if (excludedLabels.length !== Number(plan.excluded)) {
    addError('EXCLUSION-COUNT-MISMATCH', 'the plan excluded ' + plan.excluded + ' job(s) but names ' + excludedLabels.length + ' label(s)')
  }

  return finish(errors, plan, reports)
}

/**
 * ONE job as the runner labels it: `file + ' ' + args.join(' ')` (same definition as `label()` in
 * `tests/run-tests.mjs`). A run row is `{ file, args }` — the file is a basename, the arguments sit
 * beside it; reading `file` alone makes four parameterised suites (audit-registration,
 * audit-prompt-invariants, audit-math-computation-parity, audit-participant-set-parity) look like
 * one job each, so a CORRECT partition trips DUPLICATE-JOB and UNION-SET-MISMATCH.
 */
function labelOfRun(run) {
  const file = String((run && run.file) || '')
  const args = run && Array.isArray(run.args) ? run.args : []
  return file + (args.length > 0 ? ' ' + args.join(' ') : '')
}

function prefix(value) {
  return value === null || value === undefined ? String(value) : String(value).slice(0, 12) + '…'
}

function finish(errors, plan, reports) {
  const ok = errors.length === 0
  const summary = {
    ok,
    shardCount: plan && plan.shardCount !== undefined ? plan.shardCount : null,
    expected: plan ? plan.expected : null,
    sums: plan ? plan.sums : null,
    selected: Array.isArray(reports) ? reports.reduce((total, report) => total + report.selected, 0) : null,
    perShard: reports,
    errors,
  }
  console.log(JSON.stringify(summary, null, 2))
  if (!ok) {
    for (const error of errors) console.error('FAIL - * union: ' + error.code + ' ' + error.message)
    process.exit(1)
  }
  const perShard = (reports || []).map((report) => report.i + ':' + report.selected).join(' ')
  console.error('union-verify: ' + summary.shardCount + ' shards, per-shard selected ' + perShard + ', Σ=' + summary.selected + ' == plan.sums.shards=' + plan.sums.shards + ' == plan.expected=' + plan.expected + ' ok')
}

// The workflow spells the mode as a bare word (`union-verify.mjs write-meta --out …`) so the YAML reads like
// an action; accept both spellings rather than making the workflow remember a dash.
if (argv[0] === 'write-meta' || flag('write-meta')) writeMeta()
else verify()
