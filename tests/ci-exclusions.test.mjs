// tests/ci-exclusions.test.mjs — the CI gate keeps its promises (RUN 79 / TB-2738 / TB-2748).
//
// WHAT THIS SUITE POLICES. Four things a hosted-CI gate usually loses silently:
//
//   ① the exclusion table could name a suite that no longer exists. `--exclude` filters by substring, so a
//      stale label excludes nothing and the gate widens — while the row still reads like a decision;
//   ② the plan could be a second copy of the job list. Then renaming a suite makes the CI run the old name (or
//      nothing) and still report green. The plan must ASK tests/run-tests.mjs;
//   ③ the docs could stop saying what CI does NOT prove, while the green check keeps being read as release
//      approval. The sentence below is an INPUT to this suite, not decoration;
//   ④ an exclusion could silently become a way to delete a pure-logic assertion. Every row must name a KIND of
//      machine property (TB-2748) and the suite's own source must mention the missing thing, so a logic suite
//      wearing a dependency label reds as EXCLUSION-NOT-EVIDENCED instead of disappearing.
//
// It also runs its own small lamps (fake label, short why, empty guard, empty table, too many shards) so the
// plan cannot pass by printing a pretty JSON object and exiting 0.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs' // fs-purpose: the CI suite reads ci-exclusions.json, the plan, the docs and gate.yml, and synthesizes artifact dirs
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { REPO } from './_lib/repo-root.mjs'

const PLAN = join(REPO, 'scripts', 'ci', 'shard-plan.mjs')
const UNION = join(REPO, 'scripts', 'ci', 'union-verify.mjs')
const RUNNER = join(REPO, 'tests', 'run-tests.mjs')
const TABLE = join(REPO, 'ci-exclusions.json')
const DOCS = join(REPO, 'docs', 'acceptance', 'ci-gate.md')
const WORKFLOW = join(REPO, '.github', 'workflows', 'gate.yml')

const EXCLUSION_SENTENCE = 'CI 绿只证明另一台干净机器也能绿；可发布仍只由本地 `release-ready.mjs` + 真机前置决定'

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

function runPlan(args) {
  const result = spawnSync(process.execPath, [PLAN, ...args], { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  let plan = null
  try {
    plan = JSON.parse(result.stdout)
  } catch {
    plan = null
  }
  return { status: result.status, stderr: String(result.stderr || ''), stdout: String(result.stdout || ''), plan }
}

// ─────────────────────────── §0 the table itself ───────────────────────────
const tableText = readText(TABLE)
ok(tableText !== null, '★ ci-exclusions.json exists')
let rows = []
if (tableText !== null) {
  try {
    rows = JSON.parse(tableText)
  } catch {
    rows = []
  }
}
ok(Array.isArray(rows) && rows.length > 0, '★ the table is a non-empty array', Array.isArray(rows) ? rows.length : 'not an array')
ok(rows.length > 0 && rows.every((row) => row && typeof row.label === 'string' && row.label.trim() !== ''), 'every row has a label')
ok(rows.length > 0 && rows.every((row) => row && typeof row.why === 'string'), 'every row has a why')
ok(rows.length > 0 && rows.every((row) => row && typeof row.localGuard === 'string' && row.localGuard.trim() !== ''), 'every row has a localGuard — a CI exclusion with no local reader is a deleted assertion')
const shortWhy = Array.isArray(rows) ? rows.filter((row) => row && typeof row.why === 'string' && [...row.why].length < 24) : []
ok(shortWhy.length === 0, '★ every why is at least 24 characters and names a machine property', shortWhy.map((row) => row.label + ':' + [...String(row.why)].length))
// ★ TB-2748: a row is a permission to run nothing, so it must NAME the kind of machine property and the
// concrete missing thing. The kind counts are pinned: three reviewed machine budgets, six locally captured
// corpora, two DSH host installations, two out-of-repo fixtures. A row that moves between kinds silently is a
// different decision than the one this table made, and a row with no `missing` names no thing at all.
const KINDS = ['machine-budget', 'local-corpus', 'host-install', 'out-of-repo-fixture']
const kindOf = (row) => (row && typeof row.kind === 'string' ? row.kind : '')
ok(rows.length > 0 && rows.every((row) => KINDS.includes(kindOf(row))), 'every row names one of the four machine properties: ' + KINDS.join(', '), rows.filter((row) => !KINDS.includes(kindOf(row))).map((row) => row && row.label))
const kindCount = (kind) => rows.filter((row) => kindOf(row) === kind).length
ok(kindCount('machine-budget') === 3, '★ exactly the three reviewed machine budgets are excluded (a new budget row is a deliberate decision, not a default)', kindCount('machine-budget'))
ok(kindCount('local-corpus') === 6, '★ six suites measure a locally captured corpus that a hosted runner never has', kindCount('local-corpus'))
ok(kindCount('host-install') === 2, '★ two suites need an installed DSH host', kindCount('host-install'))
ok(kindCount('out-of-repo-fixture') === 2, '★ two suites read the out-of-repo taskbooks fixture', kindCount('out-of-repo-fixture'))
ok(rows.length > 0 && rows.every((row) => row && typeof row.missing === 'string' && row.missing.trim() !== ''), 'every row names the concrete missing thing it cannot get on CI', rows.filter((row) => !row || typeof row.missing !== 'string').map((row) => row && row.label))
const labels = Array.isArray(rows) ? rows.map((row) => row && row.label) : []
for (const required of ['sim-gate.test.mjs', 'audit-math-computation-sensitivity.mjs', 'mutation-evidence.test.mjs']) {
  ok(labels.includes(required), 'the table still names ' + required)
}
ok(new Set(labels).size === labels.length, 'no label is listed twice')
ok(labels.length > 0 && labels.every((label) => /\.mjs$/.test(label) || /\.test\.mjs$/.test(label)), 'every label looks like a runner job name', labels)

// ─────────────────────────── §1+§2 the plan asks the runner, and the arithmetic holds ───────────────────────────
const planSource = readText(PLAN)
ok(planSource !== null, '★ scripts/ci/shard-plan.mjs exists')
if (planSource !== null) {
  ok(planSource.includes('--scope-report'), 'the plan asks the runner for the machine report instead of guessing')
  ok(planSource.includes('--only') && planSource.includes('--exclude'), 'the plan proves each exclusion still selects jobs and measures the post-exclusion count')
  ok(planSource.includes('STALE-EXCLUSION'), 'the plan names STALE-EXCLUSION (the failure mode where an exclusion quietly widens the gate)')
  ok(planSource.includes('SHARD-EMPTY'), 'the plan names SHARD-EMPTY (an empty shard is a green check that verifies nothing)')
  ok(planSource.includes('EXCLUSION-NOT-EVIDENCED'), '★ TB-2748: the plan refuses a dependency label the suite source never mentions (a logic suite must not vanish behind a dependency decision)')
  ok(planSource.includes('MACHINE-BUDGET-UNLISTED'), '★ TB-2748: a new machine-budget row must be added to the reviewed allow-list deliberately')
  ok(planSource.includes('EXCLUSION-KIND'), '★ TB-2748: every row states one of four kinds of machine property')
  ok(!/tests\/[A-Za-z0-9._-]+\.test\.mjs/.test(planSource), '★★ the plan carries NO copied suite list (a second list would silently replace the runner)')
}

const strict = runPlan(['--check', '--json'])
ok(strict.status === 0, '★★ shard-plan --check exits 0 on the committed table', { status: strict.status, stderr: strict.stderr.trim(), plan: strict.plan })
if (strict.plan) {
  ok(strict.plan.ok === true, 'the plan reports ok:true')
  ok(strict.plan.full > 0 && strict.plan.expected > 0 && strict.plan.excluded > 0, 'the plan counts full, excluded and expected', { full: strict.plan.full, excluded: strict.plan.excluded, expected: strict.plan.expected })
  ok(strict.plan.full - strict.plan.excluded === strict.plan.expected, '★ full - excluded === expected')
  ok(Array.isArray(strict.plan.exclusions) && strict.plan.exclusions.length > 0 && strict.plan.exclusions.length === rows.length, 'the plan reports one row per exclusion')
  ok(Array.isArray(strict.plan.exclusions) && strict.plan.exclusions.length > 0 && strict.plan.exclusions.every((row) => row && typeof row.jobs === 'number' && row.jobs >= 1), '★★ every exclusion label still selects at least one job in the runner (no stale label)', strict.plan.exclusions)
  ok(Array.isArray(strict.plan.exclusions) && strict.plan.exclusions.length > 0 && strict.plan.exclusions.every((row) => row && KINDS.includes(row.kind)), '★ the plan echoes each row\'s kind, so a reader does not have to re-open the table', strict.plan.exclusions && strict.plan.exclusions.map((row) => row && row.kind))
  ok(Array.isArray(strict.plan.exclusions) && strict.plan.exclusions.every((row) => row && row.jobs === 1), '★ every excluded label is exactly ONE runner job (the union compares excludedLabels.length with plan.excluded)', strict.plan.exclusions && strict.plan.exclusions.map((row) => row && row.label + ':' + row.jobs))
  ok(Array.isArray(strict.plan.shards) && strict.plan.shards.length === 8, 'the plan has eight shards')
  ok(Array.isArray(strict.plan.shards) && strict.plan.shards.every((shard) => shard && shard.count > 0), '★ every shard has work to do', strict.plan.shards)
  ok(strict.plan.sums && strict.plan.sums.shards === strict.plan.expected, '★★ the shard sizes sum to expected — every job runs in exactly one shard', strict.plan.sums)
  ok(strict.plan.sums && strict.plan.sums.expected === strict.plan.expected, 'the plan states the expected total twice and it agrees (the union job compares against this)')
  ok(Array.isArray(strict.plan.errors) && strict.plan.errors.length === 0, 'the plan reports no errors')
}

// ─────────────────────────── §3 the docs sentence is an input ───────────────────────────
const doc = readText(DOCS)
ok(doc !== null && doc.trim() !== '', '★ docs/acceptance/ci-gate.md exists and is not empty')
if (doc) {
  ok(doc.includes(EXCLUSION_SENTENCE), '★★★ the docs still say, verbatim, that CI green does not mean releasable', '"CI 绿只证明另一台干净机器也能绿；可发布仍只由本地 `release-ready.mjs` + 真机前置决定"')
  ok(doc.includes('STALE-EXCLUSION'), 'the docs explain what a stale exclusion means')
  ok(doc.includes('SHARD-EMPTY'), 'the docs explain why an empty shard is not green')
  ok(doc.includes('union'), 'the docs describe the union check')
  ok(doc.includes('尚未真跑') || doc.includes('抓到过'), 'the docs record honestly whether CI has caught anything yet (task: no bare green check)')
  ok(doc.includes('release-ready.mjs'), 'the docs name the local release gate that does decide releasability')
}

// ─────────────────────────── §4 the workflow keeps its own promises ───────────────────────────
const workflow = readText(WORKFLOW)
ok(workflow !== null && workflow.trim() !== '', '★ .github/workflows/gate.yml exists and is not empty')
if (workflow) {
  const optOutLines = workflow.split('\n').filter((line) => /^\s*continue-on-error\s*:/.test(line))
  ok(optOutLines.length === 0, '★★ no step may opt out with continue-on-error', optOutLines)
  ok(/^\s*permissions:\s*$/m.test(workflow) && /^\s*contents:\s*read\s*$/m.test(workflow), 'permissions are contents: read')
  const usesLines = workflow.split('\n').filter((line) => /^\s*(-\s+)?uses:/.test(line))
  ok(usesLines.length > 0 && usesLines.every((line) => /@v\d+\s*$/.test(line.trim())), '★★ every action is pinned to a major tag (never @latest)', usesLines)
  ok(!usesLines.some((line) => /@latest/.test(line)), 'no action uses @latest')
  ok(/^ {2}static:\s*$/m.test(workflow), 'the workflow has the static job')
  ok(/^ {2}partition:\s*$/m.test(workflow), 'the workflow has the partition job')
  ok(/needs:\s*static/.test(workflow), 'partition runs after static')
  ok(/node scripts\/ci\/shard-plan\.mjs --check/.test(workflow), 'partition runs the plan with --check')
  ok(/set -o pipefail/.test(workflow), 'the plan step sets pipefail, so tee cannot swallow its exit status', 'without it a red plan would be artifacted and the step would pass')
  ok(/workflow_dispatch:/.test(workflow) && /pull_request:/.test(workflow) && /push:/.test(workflow), 'the gate runs on push, pull_request and workflow_dispatch')
  ok(/concurrency:/.test(workflow) && /cancel-in-progress:\s*true/.test(workflow), 'a superseded run is cancelled instead of queueing')
  ok(/node-version:/.test(workflow), 'the workflow pins a node version')

  // The second step (TB-2737 landed `--shard`): the shards and the union are wired, and the artifacts are
  // sealed to this run. These assertions are structural because the parts that matter are names and flags: an
  // artifact name without run_id is how a union sums yesterday's green shard into today's gate.
  ok(/^ {2}suite:\s*$/m.test(workflow), 'the workflow has the suite job')
  ok(/^ {2}union:\s*$/m.test(workflow), 'the workflow has the union job')
  ok(/--shard \$\{\{ matrix\.shard \}\}\/8/.test(workflow), 'each suite shard runs the runner with --shard i/8', workflow.split('\n').filter((line) => line.includes('--shard')).slice(0, 2))
  // ★ TB-2748: the exclusions are DERIVED from the table, not a second hand-written list. A workflow that names
  // its own exclusions drifts from the table the partition job proved, and the union then measures a different
  // gate than the one the plan sealed. The count assertion is the old shape's fingerprint and must be gone.
  ok(workflow.includes("require('./ci-exclusions.json')"), '★★ each shard derives its --exclude flags from ci-exclusions.json (one table, not two lists)', workflow.split('\n').filter((line) => line.includes('--exclude')).slice(0, 4))
  ok(/--exclude sim-gate\.test\.mjs/.test(workflow) === false, '★★ the workflow no longer hand-copies the three exclusion labels', workflow.split('\n').filter((line) => line.includes('sim-gate.test.mjs')).slice(0, 2))
  ok(workflow.includes('$EXCLUDES'), 'the derived flags are passed to the runner as one shell variable')
  ok((workflow.match(/--exclude /g) || []).length <= 2, 'the shard step names --exclude at most twice: once in the table reader, not once per row', (workflow.match(/--exclude .*/g) || []).slice(0, 4))
  ok(workflow.includes('"$RUNNER_TEMP/shard-report.json"'), '★ TB-2748: shard artifacts are written outside the checkout (a 0-byte untracked report made repo-hygiene red on CI)')
  ok(workflow.includes('"$RUNNER_TEMP/shard-log.txt"') && workflow.includes('"$RUNNER_TEMP/shard-meta.json"'), '★ the shard log and seal also live under RUNNER_TEMP')
  ok(/name: suite-\$\{\{ env\.RUN_ID \}\}-\$\{\{ env\.RUN_ATTEMPT \}\}-\$\{\{ matrix\.shard \}\}/.test(workflow), '★★ shard artifacts embed run_id and attempt in their name')
  ok(/name: shard-plan-\$\{\{ env\.RUN_ID \}\}-\$\{\{ env\.RUN_ATTEMPT \}\}/.test(workflow), 'the plan artifact is sealed to this run by name')
  ok(/union-verify\.mjs write-meta/.test(workflow), 'the plan and every shard are sealed by union-verify write-meta')
  ok(/needs: suite/.test(workflow), 'union runs after the suite matrix')
  ok(/if: always\(\)/.test(workflow), 'union runs even when a shard failed, so the red can name the shard')
  ok(/node scripts\/ci\/union-verify\.mjs/.test(workflow) && /--dir "\$RUNNER_TEMP\/ci-artifacts"/.test(workflow), 'union verifies the downloaded artifacts with union-verify, from outside the checkout')
  ok(/VMU_CORPUS_ROOT: \$\{\{ runner\.temp \}\}\/sim-corpus/.test(workflow), '★ TB-2748: the suite job exports an EMPTY writable corpus root, so a corpus-BUILDING suite does not mkdir at a filesystem root')
  ok(/--expected-run "\$RUN_ID"/.test(workflow) && /--expected-attempt "\$RUN_ATTEMPT"/.test(workflow), 'union expects THIS run and THIS attempt, not whatever artifact happens to be around')
  ok(/pattern: '\*-\$\{\{ env\.RUN_ID \}\}-\$\{\{ env\.RUN_ATTEMPT \}\}\*'/.test(workflow), 'union downloads only artifacts whose names carry this run_id and attempt')
  ok(/GATE_RELEASE: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.full_release && '1' \|\| '0' \}\}/.test(workflow), 'GATE_RELEASE is set only for a manual release dispatch')
  ok(!/\|\|\s*true/.test(workflow), '★★ no step swallows its exit status with || true (a red plan must stay red)')
  ok(/union-summary\.json/.test(workflow), 'the union proof is artifacted so a red survives the log')
}

// ─────────────────────────── §5 in-suite lamps: the plan must red for each failure ───────────────────────────
const scratch = mkdtempSync(join(tmpdir(), 'ci-exclusions-'))
function tableFile(name, value) {
  const path = join(scratch, name)
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8')
  return path
}
const realRows = Array.isArray(rows) ? rows : []
const whyOf = (row) => (row && typeof row.why === 'string' ? row.why : 'This row exists only as a lamp for the CI exclusions suite.')
const guardOf = (row) => (row && typeof row.localGuard === 'string' ? row.localGuard : 'node tests/ci-exclusions.test.mjs (lamp)')

try {
  const stale = realRows.map((row, index) => ({
    label: index === 0 ? 'suite-that-no-longer-exists.test.mjs' : row.label,
    kind: row.kind,
    missing: row.missing,
    why: whyOf(row),
    localGuard: guardOf(row),
  }))
  const staleRun = runPlan(['--check', '--exclusions', tableFile('stale.json', stale)])
  ok(staleRun.status !== 0, '★★ a stale label makes the plan fail (exit != 0)', { status: staleRun.status, stderr: staleRun.stderr.trim() })
  ok(staleRun.stderr.includes('STALE-EXCLUSION'), '★★★ and the failure names STALE-EXCLUSION', staleRun.stderr.trim().split('\n').slice(0, 4).join(' | '))
  ok(staleRun.plan !== null && Array.isArray(staleRun.plan.errors) && staleRun.plan.errors.some((error) => error.code === 'STALE-EXCLUSION'), 'the JSON also carries STALE-EXCLUSION, so a reader sees the code not only the prose')

  const shortTable = realRows.map((row, index) => ({
    label: row.label,
    kind: row.kind,
    missing: row.missing,
    why: index === 0 ? 'too short' : whyOf(row),
    localGuard: guardOf(row),
  }))
  const shortRun = runPlan(['--check', '--exclusions', tableFile('short.json', shortTable)])
  ok(shortRun.status !== 0, '★★ a why under 24 characters fails the plan', { status: shortRun.status })
  ok(shortRun.stderr.includes('WHY-TOO-SHORT'), '★★★ and the failure names WHY-TOO-SHORT', shortRun.stderr.trim().split('\n').slice(0, 4).join(' | '))

  const noGuard = realRows.map((row, index) => ({
    label: row.label,
    kind: row.kind,
    missing: row.missing,
    why: whyOf(row),
    localGuard: index === 0 ? '' : guardOf(row),
  }))
  const guardRun = runPlan(['--check', '--exclusions', tableFile('noguard.json', noGuard)])
  ok(guardRun.status !== 0 && guardRun.stderr.includes('GUARD-EMPTY'), '★★ an empty localGuard fails the plan and names GUARD-EMPTY', { status: guardRun.status })

  const emptyRun = runPlan(['--check', '--exclusions', tableFile('empty.json', [])])
  ok(emptyRun.status === 0, '★★ an empty table is consistent: excluding nothing must not break the plan', { status: emptyRun.status, stderr: emptyRun.stderr.trim() })
  ok(emptyRun.plan !== null && emptyRun.plan.expected === emptyRun.plan.full, '★ with no exclusions expected equals full')
  ok(emptyRun.plan !== null && emptyRun.plan.sums.shards === emptyRun.plan.expected, 'the empty-table plan still sums to its expected total')

  // The two TB-2748 lamps: the table must not be able to silence a pure-logic suite. A logic suite wearing a
  // `local-corpus` label fails EXCLUSION-NOT-EVIDENCED (its source never mentions a corpus), and a new
  // machine-budget row fails MACHINE-BUDGET-UNLISTED (budgets are reviewed, not declared).
  const logicRow = {
    label: 'vmu-records.test.mjs',
    kind: 'local-corpus',
    missing: 'a corpus this suite never reads — the label is a costume',
    why: 'This row is a lamp: a pure-logic suite must not be able to hide behind a dependency label it never uses.',
    localGuard: 'node tests/vmu-records.test.mjs (lamp)',
  }
  const logicRun = runPlan(['--check', '--exclusions', tableFile('logic.json', [...realRows, logicRow])])
  ok(logicRun.status !== 0, '★★★ TB-2748: a pure-logic suite added to the table makes the plan FAIL instead of disappearing', { status: logicRun.status })
  ok(logicRun.stderr.includes('EXCLUSION-NOT-EVIDENCED'), '★★★ and the red names EXCLUSION-NOT-EVIDENCED (the suite source never mentions the claimed dependency)', logicRun.stderr.trim().split('\n').slice(0, 6).join(' | '))
  const budgetRow = {
    label: 'vmu-records.test.mjs',
    kind: 'machine-budget',
    missing: 'a wall-clock budget nobody reviewed',
    why: 'This row is a lamp: "it is slow here" is not a property of the suite, so a new budget row is a decision.',
    localGuard: 'node tests/vmu-records.test.mjs (lamp)',
  }
  const budgetRun = runPlan(['--check', '--exclusions', tableFile('budget.json', [...realRows, budgetRow])])
  ok(budgetRun.status !== 0, '★★ TB-2748: an unreviewed machine-budget row fails the plan', { status: budgetRun.status })
  ok(budgetRun.stderr.includes('MACHINE-BUDGET-UNLISTED'), '★★★ and the red names MACHINE-BUDGET-UNLISTED', budgetRun.stderr.trim().split('\n').slice(0, 6).join(' | '))
  const kindless = realRows.map((row, index) => ({
    label: row.label,
    missing: row.missing,
    why: whyOf(row),
    localGuard: guardOf(row),
    ...(index === 0 ? {} : { kind: row.kind }),
  }))
  const kindlessRun = runPlan(['--check', '--exclusions', tableFile('kindless.json', kindless)])
  ok(kindlessRun.status !== 0 && kindlessRun.stderr.includes('EXCLUSION-KIND'), '★★ a row with no kind fails the plan (a row with no stated reason is a suite someone silenced)', { status: kindlessRun.status })

  const tooMany = runPlan(['--check', '--shards', '2000'])
  ok(tooMany.status !== 0, '★★ more shards than jobs fails instead of leaving empty shards', { status: tooMany.status })
  ok(tooMany.stderr.includes('SHARD-EMPTY'), '★★★ and the failure names SHARD-EMPTY', tooMany.stderr.trim().split('\n').slice(0, 4).join(' | '))
} finally {
  try {
    rmSync(scratch, { recursive: true, force: true })
  } catch {
    /* the runner keeps its own temp hygiene; this file is ours to remove */
  }
}

// ─────────────────────────── §6 the union arithmetic, rehearsed locally ───────────────────────────
// A union job is only worth having if a wrong sum actually reds. So we build the same artifacts the workflow
// uploads: the real plan from shard-plan, and for each shard the runner's own `--shard-plan` selection (same
// code path the shard job runs). Then the verifier must be green once and red four ways.
const RUN_ID = '424242'
const RUN_ATTEMPT = '7'
const sealEnv = { ...process.env, RUN_ID, RUN_ATTEMPT, HEAD_SHA: 'cafebabe' }
function spawnNode(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env })
  return { status: result.status, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') }
}
function unionRun(root, env = sealEnv) {
  const result = spawnNode([UNION, '--dir', root, '--expected-run', RUN_ID, '--expected-attempt', RUN_ATTEMPT], env)
  let summary = null
  try {
    summary = JSON.parse(result.stdout)
  } catch {
    summary = null
  }
  return { ...result, summary }
}
function seal(root, planPath, name = 'meta.json') {
  return spawnNode([UNION, 'write-meta', '--out', join(root, name), '--plan', planPath], sealEnv)
}
const unionRoot = mkdtempSync(join(tmpdir(), 'ci-union-'))
try {
  const artifacts = join(unionRoot, 'artifacts')
  const planDir = join(artifacts, 'shard-plan-' + RUN_ID + '-' + RUN_ATTEMPT)
  mkdirSync(planDir, { recursive: true })
  const planRun = spawnNode([PLAN, '--check'])
  ok(planRun.status === 0, '★ §6 the plan used for the rehearsal is green', { status: planRun.status, stderr: planRun.stderr.trim() })
  const planPath = join(planDir, 'shard-plan.json')
  writeFileSync(planPath, planRun.stdout, 'utf8')
  const plan = JSON.parse(planRun.stdout)
  const sealedPlan = seal(planDir, planPath)
  ok(sealedPlan.status === 0, 'the plan artifact seals itself to the run (write-meta)', { status: sealedPlan.status, stderr: sealedPlan.stderr.trim() })

  const excludedLabels = realRows.map((row) => row.label)
  ok(excludedLabels.length === plan.excluded, 'the rehearsal excludes exactly the plan\'s rows (one table, used twice)', { fromTable: excludedLabels.length, planExcluded: plan.excluded })
  const disagreements = []
  const rehearsalLabels = []
  const rehearsalShapeProblems = []
  const plannedLabels = []
  let shardsBuilt = 0
  for (let i = 1; i <= plan.shardCount; i += 1) {
    const selection = spawnNode([RUNNER, '--shard-plan', '--shard', i + '/' + plan.shardCount, '--no-temp-hygiene', ...excludedLabels.flatMap((label) => ['--exclude', label])])
    if (selection.status !== 0) {
      disagreements.push('shard ' + i + ' selection failed: ' + selection.stderr.trim().slice(0, 160))
      continue
    }
    const selected = JSON.parse(selection.stdout)
    plannedLabels.push(...selected.jobs)
    if (selected.shard.selected !== plan.shards[i - 1].count) {
      disagreements.push('shard ' + i + ' selected ' + selected.shard.selected + ', plan says ' + plan.shards[i - 1].count)
    }
    const shardDir = join(artifacts, 'suite-' + RUN_ID + '-' + RUN_ATTEMPT + '-' + i)
    mkdirSync(shardDir, { recursive: true })
    const report = {
      pass: selected.jobs.length,
      fail: 0,
      shard: selected.shard,
      // ★ The rehearsal must use the SHAPE the runner's `--json` really prints: `{ file, args[] }` with
      // `file` a BASENAME and the arguments beside it. Writing the whole label into `file` (what this
      // drill did before RUN 79) made the rehearsal a different object from the product — so a label
      // only the drill ever produced looked green while the product shape red.
      runs: selected.jobs.map((label) => {
        const parts = String(label).split(' ')
        return { file: parts[0], args: parts.slice(1), exit: 0 }
      }),
    }
    for (const row of report.runs) {
      rehearsalLabels.push(row.file + (row.args.length > 0 ? ' ' + row.args.join(' ') : ''))
      if (row.file.includes(' ')) rehearsalShapeProblems.push('a rehearsal row put arguments inside `file`: ' + row.file)
    }
    writeFileSync(join(shardDir, 'shard-report.json'), JSON.stringify(report, null, 2), 'utf8')
    const sealedShard = seal(shardDir, planPath, 'shard-meta.json')
    if (sealedShard.status !== 0) disagreements.push('shard ' + i + ' seal failed')
    shardsBuilt += 1
  }
  ok(shardsBuilt === plan.shardCount, '★ §6 the rehearsal built one artifact per shard', { built: shardsBuilt, planned: plan.shardCount })
  // ★★ The drill is evidence only if it is the SAME SHAPE as the product. Two lamps:
  // (a) no rehearsal row may hide arguments inside `file` — that was the pre-RUN-79 shape, and a drill
  //     that invents its own shape cannot see a bug that lives in the product's shape;
  // (b) rebuilding the label from { file, args } must reproduce exactly the runner's own selection.
  ok(rehearsalShapeProblems.length === 0, '★★ the rehearsal speaks the runner\'s real runs shape: basename in `file`, arguments in `args`', rehearsalShapeProblems.slice(0, 3))
  const rebuilt = [...rehearsalLabels].sort()
  const planned = [...plannedLabels].sort()
  ok(
    rebuilt.length === planned.length && rebuilt.every((label, index) => label === planned[index]),
    '★★ rebuilding each label from { file, args } reproduces the runner\'s own selection exactly (a drill shape that differs from the product hides product bugs)',
    {
      rebuilt: rebuilt.length,
      planned: planned.length,
      onlyInRebuilt: rebuilt.filter((label) => !planned.includes(label)).slice(0, 3),
      onlyInPlanned: planned.filter((label) => !rebuilt.includes(label)).slice(0, 3),
    },
  )
  ok(disagreements.length === 0, '★★ every shard selection matches the plan — the proof line the union compares is the number the shard itself printed', disagreements)

  const green = unionRun(artifacts)
  ok(green.status === 0, '★★★ §6 the union is green when the eight artifacts ARE the plan', { status: green.status, stderr: green.stderr.trim() })
  ok(green.summary !== null && green.summary.ok === true, 'the union prints ok:true in its JSON summary')
  ok(green.summary !== null && green.summary.selected === plan.expected, '★ Σ selected equals plan.expected', green.summary && { selected: green.summary.selected, expected: plan.expected })
  ok(green.summary !== null && green.summary.sums && green.summary.sums.shards === plan.expected, 'plan.sums.shards equals plan.expected in the same proof')
  ok(
    green.summary !== null && Array.isArray(green.summary.perShard) && green.summary.perShard.length === plan.shardCount && green.summary.perShard.every((row) => row.selected === plan.shards[row.i - 1].count),
    '★ every per-shard number in the proof equals its plan row',
    green.summary && green.summary.perShard,
  )

  // RED A: a shard artifact is missing. The sum would still be a number; it must not be a green number.
  const missingRoot = join(unionRoot, 'red-missing')
  cpSync(artifacts, missingRoot, { recursive: true })
  rmSync(join(missingRoot, 'suite-' + RUN_ID + '-' + RUN_ATTEMPT + '-3'), { recursive: true, force: true })
  const missing = unionRun(missingRoot)
  ok(missing.status !== 0, '★★ §6 a missing shard reds the union', { status: missing.status })
  ok(missing.summary !== null && missing.summary.errors.some((error) => error.code === 'MISSING-SHARD'), '★★★ and the red names MISSING-SHARD', missing.summary && missing.summary.errors.map((error) => error.code))
  ok(missing.summary !== null && missing.summary.errors.some((error) => error.code === 'UNION-SUM-MISMATCH' && error.message.includes(String(plan.expected))), 'the sum red prints plan.expected, so the reader sees the size of the hole', missing.stderr.trim().split('\n').slice(0, 4))

  // RED B: one shard reports a failure. Correct arithmetic over a red shard is not a green gate.
  const redRoot = join(unionRoot, 'red-shard')
  cpSync(artifacts, redRoot, { recursive: true })
  const redPath = join(redRoot, 'suite-' + RUN_ID + '-' + RUN_ATTEMPT + '-5', 'shard-report.json')
  const redReport = JSON.parse(readFileSync(redPath, 'utf8'))
  redReport.fail = 1
  writeFileSync(redPath, JSON.stringify(redReport, null, 2), 'utf8')
  const red = unionRun(redRoot)
  ok(red.status !== 0, '★★ §6 a shard with fail>0 reds the union', { status: red.status })
  ok(red.summary !== null && red.summary.errors.some((error) => error.code === 'SHARD-RED'), '★★★ and the red names SHARD-RED plus the shard index', red.summary && red.summary.errors.map((error) => error.code))

  // RED C: an excluded label appears in a shard job list. This is a set assertion: counting would still pass if
  // the same excluded job also appeared elsewhere.
  const leakRoot = join(unionRoot, 'red-leak')
  cpSync(artifacts, leakRoot, { recursive: true })
  const leakPath = join(leakRoot, 'suite-' + RUN_ID + '-' + RUN_ATTEMPT + '-2', 'shard-report.json')
  const leakReport = JSON.parse(readFileSync(leakPath, 'utf8'))
  leakReport.runs.push({ file: 'tests/audit-math-computation-sensitivity.mjs', args: [], exit: 0 })
  writeFileSync(leakPath, JSON.stringify(leakReport, null, 2), 'utf8')
  const leak = unionRun(leakRoot)
  ok(leak.status !== 0, '★★ §6 an excluded label inside a shard reds the union', { status: leak.status })
  ok(leak.summary !== null && leak.summary.errors.some((error) => error.code === 'EXCLUSION-PRESENT'), '★★★ and the red names EXCLUSION-PRESENT with the label', leak.summary && leak.summary.errors.map((error) => error.code))

  // RED D: a shard sealed itself to another run. The artifacts are byte-identical; only the run id differs.
  const foreignRoot = join(unionRoot, 'red-run')
  cpSync(artifacts, foreignRoot, { recursive: true })
  const foreignMetaPath = join(foreignRoot, 'suite-' + RUN_ID + '-' + RUN_ATTEMPT + '-4', 'shard-meta.json')
  const foreignMeta = JSON.parse(readFileSync(foreignMetaPath, 'utf8'))
  foreignMeta.runId = '111111'
  writeFileSync(foreignMetaPath, JSON.stringify(foreignMeta, null, 2), 'utf8')
  const foreign = unionRun(foreignRoot)
  ok(foreign.status !== 0, '★★ §6 a shard from another run reds the union', { status: foreign.status })
  ok(foreign.summary !== null && foreign.summary.errors.some((error) => error.code === 'RUN-MISMATCH'), '★★★ and the red names RUN-MISMATCH (an old green shard is not evidence about this tree)', foreign.summary && foreign.summary.errors.map((error) => error.code))

  // RED E: the plan was sealed against another head. The artifact names cannot carry another tree's green
  // shards, so this is redundancy rather than a barrier — but a union assembled from a different tree should
  // SAY it, not leave the reader to infer it from a green sum.
  const headRoot = join(unionRoot, 'red-head')
  cpSync(artifacts, headRoot, { recursive: true })
  const headMetaPath = join(headRoot, 'shard-plan-' + RUN_ID + '-' + RUN_ATTEMPT, 'meta.json')
  const headMeta = JSON.parse(readFileSync(headMetaPath, 'utf8'))
  headMeta.headSha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
  writeFileSync(headMetaPath, JSON.stringify(headMeta, null, 2), 'utf8')
  const head = unionRun(headRoot, { ...process.env, HEAD_SHA: 'cafebabe' })
  ok(head.status !== 0, '★★ §6 a plan sealed to another head reds the union', { status: head.status })
  ok(
    head.summary !== null && head.summary.errors.some((error) => error.code === 'HEAD-MISMATCH' && error.message.includes('deadbeef')),
    '★★★ and the red names HEAD-MISMATCH with the sealed head (the union says which tree it really describes)',
    head.summary && head.summary.errors.map((error) => error.code),
  )
  const headSame = unionRun(headRoot, { ...process.env, HEAD_SHA: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' })
  ok(headSame.status === 0, '★ the same-head case stays green: HEAD-MISMATCH is not a blanket red for every union run', { status: headSame.status, codes: headSame.summary && headSame.summary.errors && headSame.summary.errors.map((error) => error.code) })

  // RED G (TB-2748): the plan was NEVER sealed to a head — the seal step was skipped or ran without HEAD_SHA.
  // That is an upstream gap, not a wrong tree: it must be named HEAD-UNSEALED, not folded into HEAD-MISMATCH.
  const unsealedRoot = join(unionRoot, 'red-unsealed')
  cpSync(artifacts, unsealedRoot, { recursive: true })
  const unsealedPath = join(unsealedRoot, 'shard-plan-' + RUN_ID + '-' + RUN_ATTEMPT, 'meta.json')
  const unsealedMeta = JSON.parse(readFileSync(unsealedPath, 'utf8'))
  delete unsealedMeta.headSha
  writeFileSync(unsealedPath, JSON.stringify(unsealedMeta, null, 2), 'utf8')
  const unsealed = unionRun(unsealedRoot)
  ok(unsealed.status !== 0, '★★ TB-2748: an unsealed plan reds the union (it proves a sum, not a tree)', { status: unsealed.status })
  ok(
    unsealed.summary !== null && unsealed.summary.errors.some((error) => error.code === 'HEAD-UNSEALED') && !unsealed.summary.errors.some((error) => error.code === 'HEAD-MISMATCH'),
    '★★★ and the red is HEAD-UNSEALED, NOT HEAD-MISMATCH: a missing seal is an upstream gap, not a wrong tree',
    unsealed.summary && unsealed.summary.errors.map((error) => error.code),
  )

  // RED H (TB-2748): this union runs without HEAD_SHA. It cannot compare its sealed head with the tree it is
  // reading, so it must say HEAD-UNKNOWN rather than pass as if the comparison had happened.
  const unknown = unionRun(artifacts, (() => {
    const env = { ...sealEnv }
    delete env.HEAD_SHA
    return env
  })())
  ok(unknown.status !== 0, '★★ TB-2748: a union with no HEAD_SHA reds (a union that cannot name its tree cannot vouch for it)', { status: unknown.status })
  ok(
    unknown.summary !== null && unknown.summary.errors.some((error) => error.code === 'HEAD-UNKNOWN') && !unknown.summary.errors.some((error) => error.code === 'HEAD-MISMATCH'),
    '★★★ and the red is HEAD-UNKNOWN, not HEAD-MISMATCH',
    unknown.summary && unknown.summary.errors.map((error) => error.code),
  )

  // RED F: one shard reports a parameterised job with its arguments DROPPED (the pre-RUN-79 shape where the
  // whole label lived in `file`). The union must NOTICE: a reader that only looks at `file` cannot tell
  // `audit-registration.mjs vibe-math-v2/...` from `audit-registration.mjs vibe-math-v3/...`, so a union that
  // does not red here would silently accept six jobs as one.
  const argsRoot = join(unionRoot, 'red-args')
  cpSync(artifacts, argsRoot, { recursive: true })
  let argsDropped = 0
  for (let i = 1; i <= plan.shardCount; i += 1) {
    const reportPath = join(argsRoot, 'suite-' + RUN_ID + '-' + RUN_ATTEMPT + '-' + i, 'shard-report.json')
    if (!existsSync(reportPath)) continue
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))
    let touched = false
    report.runs = report.runs.map((row) => {
      if (row.args && row.args.length > 0 && !touched) {
        touched = true
        argsDropped += 1
        return { file: row.file, args: [], exit: row.exit }
      }
      return row
    })
    if (touched) {
      writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
      break
    }
  }
  ok(argsDropped === 1, '§6 the rehearsal really found a parameterised job to damage (one label carries arguments)', { dropped: argsDropped })
  const argsRun = unionRun(argsRoot)
  ok(argsRun.status !== 0, '★★ §6 dropping one job\'s arguments reds the union (six parameterised suites must not collapse into six names)', { status: argsRun.status })
  ok(
    argsRun.summary !== null && argsRun.summary.errors.some((error) => error.code === 'UNION-SET-MISMATCH'),
    '★★★ and the red names UNION-SET-MISMATCH, so the reader learns the union counts JOBS not file names',
    argsRun.summary && argsRun.summary.errors.map((error) => error.code),
  )
} finally {
  try {
    rmSync(unionRoot, { recursive: true, force: true })
  } catch {
    /* the runner keeps its own temp hygiene; this directory is ours to remove */
  }
}

console.log('')
if (failures.length > 0) {
  console.log('failed:')
  for (const failure of failures) console.log('  - ' + failure.label)
  console.log('=== CI EXCLUSIONS: ' + passed + ' passed, ' + failures.length + ' failed ===')
  process.exitCode = 1
} else {
  console.log('=== CI EXCLUSIONS: ' + passed + ' passed, 0 failed ===')
}
