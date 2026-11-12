// tests/ci-exclusions-honest.test.mjs — every CI exclusion names a machine property, and the machine can be
// asked to prove it (TB-2748).
//
// THE QUESTION THIS SUITE ANSWERS. `ci-exclusions.json` is a list of permissions to NOT run a suite on a hosted
// runner. A permission is honest only if (a) the label really selects a job the runner knows (a stale label
// widens the gate silently), (b) the thing it lacks is genuinely absent on a clean machine, and (c) it is not
// being used to delete a pure-logic assertion. Each § below tests one of those, and the absence in (b) is
// produced the way the taskbook asks: by pointing the suite at a temporary directory that does not exist, so a
// green result would mean the suite ignored its own dependency rather than that CI could run it.
//
// WHAT WOULD MAKE THIS SUITE LIE. If it only read the why text, a suite could be excluded for being
// inconvenient. So §2 measures: for every dependency row the suite is RUN with its dependency absent and must
// fail with the named thing in its own output. If someone fixes a suite so it no longer needs the corpus, the
// row stops being true here and the fix is to remove the row — not to soften this test.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs' // fs-purpose: the honest judge reads the table and builds a temporary absent-corpus tree and a lamp table
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { REPO } from './_lib/repo-root.mjs'

const RUNNER = join(REPO, 'tests', 'run-tests.mjs')
const PLAN = join(REPO, 'scripts', 'ci', 'shard-plan.mjs')
const TABLE = join(REPO, 'ci-exclusions.json')

const KINDS = ['machine-budget', 'local-corpus', 'host-install', 'out-of-repo-fixture']

let passed = 0
const failures = []
function ok(condition, label, detail) {
  if (condition) {
    passed += 1
    return
  }
  failures.push({ label, detail })
  console.log('FAIL - ' + label + (detail === undefined ? '' : ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))))
}
function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}
function spawnNode(args, env = process.env, timeout = 900000) {
  const result = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env, timeout })
  return {
    status: result.status,
    signal: result.signal,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    output: String(result.stdout || '') + String(result.stderr || ''),
  }
}
function scopeJobs(label) {
  const result = spawnNode([RUNNER, '--scope-report', '--json', '--no-temp-hygiene', '--only', label])
  if (result.status !== 0) return { status: result.status, jobs: null, output: result.output }
  let report = null
  try {
    report = JSON.parse(result.stdout)
  } catch {
    report = null
  }
  return { status: 0, jobs: report && report.final ? report.final.total : null, report }
}

const tableText = readText(TABLE)
let rows = []
if (tableText !== null) {
  try {
    rows = JSON.parse(tableText)
  } catch {
    rows = []
  }
}
const kindOf = (row) => (row && typeof row.kind === 'string' ? row.kind : '')

// ─────────────────────────── §0 the table names a kind and a missing thing ───────────────────────────
ok(Array.isArray(rows) && rows.length === 13, '§0 the table has 13 rows: 3 machine budgets + 6 corpora + 2 hosts + 2 out-of-repo fixtures', Array.isArray(rows) ? rows.length : 'not an array')
ok(rows.length > 0 && rows.every((row) => KINDS.includes(kindOf(row))), '§0 every row names one of the four machine properties', rows.filter((row) => !KINDS.includes(kindOf(row))).map((row) => row && row.label))
const countOf = (kind) => rows.filter((row) => kindOf(row) === kind).length
ok(countOf('machine-budget') === 3 && countOf('local-corpus') === 6 && countOf('host-install') === 2 && countOf('out-of-repo-fixture') === 2, '§0 the four counts are 3 / 6 / 2 / 2', [countOf('machine-budget'), countOf('local-corpus'), countOf('host-install'), countOf('out-of-repo-fixture')])
ok(rows.length > 0 && rows.every((row) => typeof row.missing === 'string' && row.missing.trim() !== ''), '§0 every row names the concrete missing thing (a permission that names nothing is a deletion)', rows.filter((row) => typeof row.missing !== 'string').map((row) => row && row.label))
ok(rows.length > 0 && rows.every((row) => typeof row.localGuard === 'string' && row.localGuard.trim() !== ''), '§0 every row has a local reader')

// ─────────────────────────── §1 every label is a real runner job (exactly one) ───────────────────────────
// `--scope-report` is the runner DECIDING what it would run; asking it is the difference between a label and a
// guess. Exactly one matters: the union compares excludedLabels.length with plan.excluded.
const absent = join(mkdtempSync(join(tmpdir(), 'ci-honest-')), 'absent')
const perLabel = []
for (const row of rows) {
  const scope = scopeJobs(row.label)
  perLabel.push({ label: row.label, kind: kindOf(row), jobs: scope.jobs, status: scope.status })
}
ok(perLabel.length > 0 && rows.length > 0 && perLabel.length === rows.length && perLabel.every((entry) => entry.status === 0), '§1 the runner answers --scope-report for every excluded label', perLabel.filter((entry) => entry.status !== 0).map((entry) => entry.label))
ok(perLabel.length > 0 && perLabel.every((entry) => entry.jobs === 1), '★ §1 every excluded label selects exactly ONE runner job (zero is a stale label; two is a union arithmetic lie)', perLabel.filter((entry) => entry.jobs !== 1).map((entry) => entry.label + ':' + entry.jobs))

// ─────────────────────────── §2 the dependency suites really cannot pass without the dependency ───────────────────────────
// The absent tree is a path that was never created. Corpus suites get VMU_CORPUS_ROOT / VMU_SIM_ROOT /
// VMU_RICH_REAL pointing into it; host suites get an empty PATH and no DSH_NODE_MODULES; fixture suites get the
// template path inside it. Each suite must exit non-zero (or report a failed assertion) AND print the name of
// the thing it could not find: a failure that does not name the missing dependency would be a coincidence, not
// evidence for the row.
const baseEnv = () => ({
  ...process.env,
  VMU_CORPUS_ROOT: join(absent, 'sim'),
  VMU_SIM_ROOT: join(absent, 'sim'),
  VMU_RICH_REAL: join(absent, 'sim', 'compare', 'real-fields.jsonl'),
})
const hostEnv = () => ({ ...baseEnv(), PATH: '', Path: '', DSH_NODE_MODULES: join(absent, 'node_modules') })
const detachEnv = () => ({
  ...hostEnv(),
  LOCALAPPDATA: join(absent, 'localappdata'),
  APPDATA: join(absent, 'appdata'),
  HOME: join(absent, 'home'),
  USERPROFILE: join(absent, 'home'),
})
const fixtureEnv = () => ({ ...process.env, VMU_BRIEF_TEMPLATE_PATH: join(absent, 'taskbooks', 'RUN-BRIEF-TEMPLATE.md') })

const ABSENCE = [
  { label: 'audit-prompt-names.mjs', env: baseEnv, tokens: ['real-fieldset.json'] },
  { label: 'vmu-run240-fidelity-scope.test.mjs', env: baseEnv, tokens: ['CORPUS'] },
  { label: 'sim-compare-strict.test.mjs', env: baseEnv, tokens: ['CORPUS'] },
  { label: 'sim-fidelity-baseline.test.mjs', env: baseEnv, tokens: ['real-fields.jsonl'] },
  { label: 'sim-vs-real.test.mjs', env: baseEnv, tokens: ['CORPUS'] },
  { label: 'audit-corpus-nested-keys.test.mjs', env: baseEnv, tokens: ['real-fieldset.json'] },
  { label: 'vmu-assistant-host-slice.test.mjs', env: hostEnv, tokens: ['dsh'] },
  { label: 'e2e-f1-agent-detach.test.mjs', env: detachEnv, tokens: ['installed DSH host packages'] },
  { label: 'brief-claims-match-product.test.mjs', env: fixtureEnv, tokens: ['RUN-BRIEF-TEMPLATE.md'] },
  { label: 'run79-brief-corrections.test.mjs', env: fixtureEnv, tokens: ['RUN-BRIEF-TEMPLATE.md'] },
]
const RED_OUTPUT = /[1-9][0-9]* failed|FAIL - |: FAIL|failed:/
const absentRows = []
for (const entry of ABSENCE) {
  const run = spawnNode([join(REPO, 'tests', entry.label)], entry.env())
  const red = run.status !== 0 || RED_OUTPUT.test(run.output) || run.signal !== null
  const named = entry.tokens.some((token) => run.output.includes(token))
  absentRows.push({ label: entry.label, status: run.status, signal: run.signal, red, named, tail: run.output.trim().split('\n').slice(-3).join(' | ').slice(0, 240) })
}
ok(absentRows.length > 0 && absentRows.every((row) => row.red), '★ §2 every dependency suite is RED when its dependency is absent (a clean machine cannot pass it)', absentRows.filter((row) => !row.red).map((row) => row.label))
ok(absentRows.length > 0 && absentRows.every((row) => row.named), '★★ §2 and each red NAMES the missing thing in its own output (so the exclusion is about that thing, not about the suite being broken)', absentRows.filter((row) => !row.named).map((row) => row.label + ' :: ' + row.tail))
const absentClaims = rows.filter((row) => kindOf(row) !== 'machine-budget').map((row) => row.label)
ok(ABSENCE.length > 0 && ABSENCE.length === absentClaims.length && ABSENCE.every((entry) => absentClaims.includes(entry.label)), '★★ §2 every non-budget row has an absence probe (a row with no probe is an untested promise)', absentClaims.filter((label) => !ABSENCE.some((entry) => entry.label === label)))

// ─────────────────────────── §3 machine budgets are reviewed, and the source really measures one ───────────────────────────
// A budget row is a different promise: the machine is not missing anything, the measurement is real but local.
// The honest judge cannot time every job here, so it checks the two things that keep a budget row honest: the
// label is in the reviewed allow-list, and the suite source really contains a budget/threshold measurement.
const budgets = rows.filter((row) => kindOf(row) === 'machine-budget').map((row) => row.label)
const REVIEWED = ['sim-gate.test.mjs', 'audit-math-computation-sensitivity.mjs', 'mutation-evidence.test.mjs']
ok(budgets.length > 0 && budgets.length === REVIEWED.length && budgets.every((label) => REVIEWED.includes(label)), '★ §3 the machine-budget rows are exactly the three reviewed ones', budgets)
const BUDGET_SOURCE = /budget|threshold|sensitivity|mutation/i
const budgetSources = budgets.map((label) => ({ label, source: readText(join(REPO, 'tests', label)) }))
ok(budgetSources.length > 0 && budgetSources.every((entry) => typeof entry.source === 'string' && BUDGET_SOURCE.test(entry.source)), '★ §3 every budget row points at a suite whose source measures a budget, a threshold or a mutation cost', budgetSources.filter((entry) => typeof entry.source !== 'string' || !BUDGET_SOURCE.test(entry.source)).map((entry) => entry.label))

// ─────────────────────────── §4 the table cannot silence a pure-logic suite ───────────────────────────
// The lamp: add a suite that runs in milliseconds and reads no machine state, wearing a dependency label. The
// plan must red, because a permission that no source can evidence is how an assertion disappears. Both labels
// are tried, so neither costume works.
const scratch = mkdtempSync(join(tmpdir(), 'ci-honest-lamp-'))
function lampFile(name, extra) {
  const path = join(scratch, name)
  writeFileSync(path, JSON.stringify([...rows, extra], null, 2), 'utf8')
  return path
}
const logic = {
  label: 'vmu-records.test.mjs',
  kind: 'local-corpus',
  missing: 'a corpus this suite never reads',
  why: 'This lamp suite is pure logic: the label is a costume, and the plan must refuse to let it disappear.',
  localGuard: 'node tests/vmu-records.test.mjs (lamp)',
}
const logicPlan = spawnNode([PLAN, '--check', '--exclusions', lampFile('logic-corpus.json', logic)])
ok(logicPlan.status !== 0, '★★★ §4 a pure-logic suite added with a local-corpus label makes --check FAIL', { status: logicPlan.status })
ok(logicPlan.stderr.includes('EXCLUSION-NOT-EVIDENCED'), '★★★ §4 and the failure names EXCLUSION-NOT-EVIDENCED (the source never mentions the dependency)', logicPlan.stderr.trim().split('\n').slice(0, 5).join(' | '))
const budgetLamp = { ...logic, kind: 'machine-budget', missing: 'a budget nobody reviewed', why: 'This lamp claims a machine budget for a pure-logic suite: the allow-list must refuse it.' }
const budgetPlan = spawnNode([PLAN, '--check', '--exclusions', lampFile('logic-budget.json', budgetLamp)])
ok(budgetPlan.status !== 0 && budgetPlan.stderr.includes('MACHINE-BUDGET-UNLISTED'), '★★ §4 a pure-logic suite wearing a machine-budget label is refused as MACHINE-BUDGET-UNLISTED', { status: budgetPlan.status })
try {
  rmSync(scratch, { recursive: true, force: true })
} catch {
  /* ours to remove; the plan does not write here */
}

// ─────────────────────────── §5 the plan echoes the same table ───────────────────────────
const plan = spawnNode([PLAN, '--check'])
let planJson = null
try {
  planJson = JSON.parse(plan.stdout)
} catch {
  planJson = null
}
ok(plan.status === 0 && planJson !== null && planJson.ok === true, '★ §5 the plan is green on the committed table', { status: plan.status, stderr: plan.stderr.trim() })
ok(planJson !== null && Array.isArray(planJson.exclusions) && rows.length > 0 && planJson.exclusions.length === rows.length, '★ §5 the plan reports exactly the rows this suite just probed', planJson && planJson.exclusions && planJson.exclusions.length)
ok(planJson !== null && planJson.expected === planJson.full - rows.length, '★ §5 every row removes exactly one job from the gate', planJson && { full: planJson.full, expected: planJson.expected, rows: rows.length })

console.log('')
if (failures.length > 0) {
  console.log('failed:')
  for (const failure of failures) console.log('  - ' + failure.label)
  console.log('=== CI EXCLUSIONS HONEST: ' + passed + ' passed, ' + failures.length + ' failed ===')
  process.exitCode = 1
} else {
  console.log('=== CI EXCLUSIONS HONEST: ' + passed + ' passed, 0 failed ===')
}
