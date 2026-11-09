// tests/sim-scenario-contracts.test.mjs — THE CONTRACTS EVERY SCENARIO IS HELD TO, ACROSS ALL OF THEM.
//
// WHY: `tests/sim-mainline.test.mjs` and `tests/sim-end-to-end.test.mjs` each pin ONE scenario. The failure this
// suite exists for was not in one scenario: it was in the CONTRACT between the scenarios and the runner.
//
//   ① RUN 255 made `vibe_v5_blueprint` propose fs-first: a `text`-only propose answers
//      `{ok:true, filed:false, id:null, draftMdMissing:true}` and every later `read`/`adopt` refuses
//      VMU_INVALID_ARGUMENT for a null id. `mainline`, `records-blueprint`, `actions-extra` and `feedback63` all
//      still proposed text-only, and the two `VMU_INVALID_ARGUMENT`s that followed looked like PRODUCT bugs while the
//      scenarios stayed green. A fix that only repaired `mainline` (TB-2625) would have left the same latent drift in
//      the other three - so this suite refuses to let ANY scenario propose a blueprint draft it never wrote.
//   ② The runner's `expectedRefusals` matcher was a PREDICATE: one `{tool, code}` entry forgave every later refusal
//      of that tool+code. `actions-extra` declared `vibe_v5_blueprint`/`VMU_INVALID_ARGUMENT` once for a
//      missing-argument probe and that single entry also excused the two REAL drift refusals above - the scenario was
//      green while its blueprint chain never held. The verdict layer now consumes one prediction per refusal and
//      reports a refusal forgiven by an ALREADY-SPENT prediction as `advisory` (non-zero ⇒ not green). This suite
//      asserts the total across all scenarios is ZERO: every predicted refusal has to be nameable by a prediction of
//      its own, not by generalization.
//   ③ A hook that has never carried a failure into the exit code is a claim. `SIM_SELFTEST_FAILURE` is that hook's
//      own proof, run here in subprocesses: with it the run is red BY NAME (headline `1 FAILED`, exit 1), without it
//      the same scenario is green. It only ever ADDS a failure, so it cannot be used to launder a real one.
//
// WHAT IT DOES NOT DO: it does not read the product source, does not edit product code, and does not loosen any
// scenario by name - the static scan is over ALL `scripts/sim/scenarios/*.mjs`, and the list of offenders is what has
// to be empty, not a shorter allow-list.
//
// Run: node tests/sim-scenario-contracts.test.mjs      (T1: no network, no LaTeX, no model)

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { corpusRoot } from './_lib/corpus.mjs'

// TB-2677: derived from this file + the one corpus-root helper; the scratch dir is per-process so two contract sweeps
// on the same machine cannot delete each other's corpora.
const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '')
const TMP = join(tmpdir(), 'sim-contracts-' + process.pid)
const SCEN_DIR = join(REPO, 'scripts/sim/scenarios')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 700)))
  }
}

const scenarios = readdirSync(SCEN_DIR).filter((f) => f.endsWith('.mjs')).sort()
const source = (f) => readFileSync(join(SCEN_DIR, f), 'utf8')
const scenariosNamed = scenarios.map((f) => f.replace(/\.mjs$/, ''))

// ── ① NO SCENARIO PROPOSES A BLUEPRINT DRAFT IT NEVER WROTE ────────────────────────────────────────────────────
// Count-based on purpose: a JS parser here would either be a dependency or a 200-line trap. The fact is simple -
// every proposal needs a member-written `mdPath` (or an explicit `materialize:true` opt-in for a legacy text-only
// contract), so the number of `action: 'propose'` calls in a file may not exceed the number of `mdPath` arguments
// plus the number of explicit `materialize` opt-ins.
const proposeFiles = []
const offenders = []
for (const f of scenarios) {
  const text = source(f)
  if (!text.includes('vibe_v5_blueprint')) continue
  const proposes = (text.match(/action:\s*'propose'/g) || []).length + (text.match(/action:\s*"propose"/g) || []).length
  if (proposes === 0) continue
  proposeFiles.push(f.replace(/\.mjs$/, ''))
  const mdPaths = (text.match(/mdPath\s*:/g) || []).length
  const materialize = (text.match(/materialize\s*:\s*true/g) || []).length
  if (proposes > mdPaths + materialize) offenders.push({ scenario: f, proposes, mdPaths, materialize })
}
ok(offenders.length === 0, 'every blueprint proposal names a member file (fs-first: mdPath, or an explicit materialize:true)', offenders)
ok(proposeFiles.length >= 4, 'the scan actually found the blueprint scenarios (a scan that matches nothing proves nothing)', proposeFiles)

// A file may not carry the fs-first self-check HELPER without the code that makes a failure loud, and vice versa.
// (Pairing, not a list of names: a new scenario joins by using the construct, not by being added here.)
const helperFiles = scenarios.filter((f) => source(f).includes('filedOf(')).map((f) => f.replace(/\.mjs$/, ''))
const markerFiles = scenarios.filter((f) => source(f).includes('SIM_BLUEPRINT_FS_FIRST_CONTRACT')).map((f) => f.replace(/\.mjs$/, ''))
ok(helperFiles.length >= 3, 'the fs-first self-check helper is present in the scenarios that file drafts', helperFiles)
ok(JSON.stringify(helperFiles) === JSON.stringify(markerFiles), 'every `filedOf` reading ships the named failure code, and every named code reads a receipt', { helperFiles, markerFiles })

// The scenarios that do self-check have to RETURN the list, or run.mjs never sees it.
const returnsFailures = helperFiles.filter((f) => /failures,/.test(source(f + '.mjs')))
ok(helperFiles.length > 0 && returnsFailures.length === helperFiles.length, 'a scenario that self-checks returns `failures` (an unreturned check is a comment)', { helperFiles, returnsFailures })

// ── ② EVERY PREDICTED REFUSAL IS NAMEABLE: run all scenarios, advisory total must be zero ───────────────────────
function runScenario(name, outDir, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join('scripts/sim/run.mjs'), '--scenario', name, '--out', outDir], {
      cwd: REPO,
      env: Object.assign({}, process.env, env || {}),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (b) => { out += String(b) })
    child.stderr.on('data', (b) => { err += String(b) })
    child.on('close', (code) => resolve({ code, out, err }))
  })
}

async function pool(items, size, fn) {
  const results = new Array(items.length)
  let next = 0
  const workers = new Array(Math.min(size, items.length)).fill(0).map(async () => {
    while (next < items.length) {
      const i = next
      next += 1
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
const runs = await pool(scenariosNamed, 4, async (name) => {
  const outDir = join(TMP, 'corpus-' + name)
  const res = await runScenario(name, outDir)
  let manifest = null
  try { manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')) } catch { manifest = null }
  return { name, code: res.code, outDir, manifest, err: res.err }
})

const redScenarios = runs.filter((r) => r.code !== 0).map((r) => ({ scenario: r.name, exit: r.code, advisory: r.manifest && r.manifest.refusals ? r.manifest.refusals.advisory : null, mechanism: r.manifest && r.manifest.refusals ? r.manifest.refusals.mechanism : null, selfChecks: r.manifest && r.manifest.selfChecks ? r.manifest.selfChecks : null }))
ok(redScenarios.length === 0, 'every scenario exits 0 (a red one is named with its exit, advisory, mechanism and self-check counts)', redScenarios)
ok(runs.length > 0 && runs.every((r) => r.manifest !== null), 'every scenario wrote a manifest (a scene that dies before its corpus cannot be audited)', runs.filter((r) => r.manifest === null).map((r) => r.name))

const advisoryTotal = runs.reduce((n, r) => n + (r.manifest && r.manifest.refusals ? r.manifest.refusals.advisory || 0 : 0), 0)
const advisoryDetail = runs.filter((r) => r.manifest && r.manifest.advisoryMatches && r.manifest.advisoryMatches.length > 0).map((r) => ({ scenario: r.name, advisoryMatches: r.manifest.advisoryMatches }))
ok(advisoryTotal === 0, 'no refusal is forgiven by a prediction that was already spent (advisory total across all scenarios)', { advisoryTotal, advisoryDetail })
const mechanismTotal = runs.reduce((n, r) => n + (r.manifest && r.manifest.refusals ? r.manifest.refusals.mechanism || 0 : 0), 0)
ok(mechanismTotal === 0, 'no scenario produced an unpredicted mechanism refusal', { mechanismTotal })
const selfCheckRed = runs.filter((r) => r.manifest && r.manifest.selfChecks && r.manifest.selfChecks.failed > 0).map((r) => ({ scenario: r.name, selfChecks: r.manifest.selfChecks }))
ok(selfCheckRed.length === 0, 'no scenario reported a failed contract self-check', selfCheckRed)
const pinnedTotal = runs.reduce((n, r) => n + (r.manifest && r.manifest.refusals ? r.manifest.refusals.pinned || 0 : 0), 0)
const inferredTotal = runs.reduce((n, r) => n + (r.manifest && r.manifest.refusals ? r.manifest.refusals.inferred || 0 : 0), 0)
ok(pinnedTotal + inferredTotal > 20, 'the prediction ledger actually matched refusals (a matcher that matches nothing would pass everything)', { pinnedTotal, inferredTotal })
ok(pinnedTotal > 0, 'at least one scenario NAMES its refusal by seq (the pinned form is reachable, not theoretical)', { pinnedTotal })

// ── ②b THE HINT-LESS REFUSAL CENSUS (lead follow-up on TB-2602) ────────────────────────────────────────────────
// A named refusal whose receipt carries NO hint is a different fact from a pairing defect: the code says what broke,
// and the reader has to invent the next move. It is neither automatically green nor automatically red - it is a
// CENSUS. This block counts the fact across every scenario corpus (not just end-to-end), writes the number to disk so
// the report can quote it, and cross-checks the one place the pair corpus publishes the same count. A future scenario
// that starts refusing without a hint moves this number, which is exactly what a census is for.
const LF = String.fromCharCode(10)
const census = runs.map((r) => {
  let lines = []
  try {
    lines = readFileSync(join(r.outDir, 'receipts.jsonl'), 'utf8').split(LF).filter((line) => line.trim() !== '').map((line) => JSON.parse(line))
  } catch { lines = [] }
  const hintless = lines.filter((line) => line.receipt && line.receipt.ok === false && typeof line.receipt.code === 'string' && line.receipt.code !== '' && !(typeof line.receipt.hint === 'string' && line.receipt.hint !== ''))
  return {
    scenario: r.name,
    receipts: lines.length,
    hintless: hintless.length,
    codes: Array.from(new Set(hintless.map((line) => line.receipt.code))).slice(0, 8),
    pairRows: r.manifest && r.manifest.pairs && r.manifest.pairs.classes ? r.manifest.pairs.classes.refusalNoHint : null,
  }
})
const censusTotal = census.reduce((n, row) => n + row.hintless, 0)
const censusFile = join(corpusRoot(), 'refusal-hint-census.txt')
mkdirSync(dirname(censusFile), { recursive: true })
writeFileSync(censusFile, census.map((row) => row.scenario + '  ' + row.receipts + ' receipts · ' + row.hintless + ' hint-less named refusal(s)' + (row.codes.length > 0 ? ' [' + row.codes.join(', ') + ']' : '')).join(LF) + LF + 'total: ' + censusTotal + ' across ' + census.length + ' scenarios' + LF)
ok(census.length === runs.length && runs.length >= 14, 'the census read every scenario corpus, not a sample', { scenarios: census.length, scenariosNamed: scenariosNamed.length })
const censusDisagrees = census.filter((row) => row.hintless > 0 && row.pairRows !== null && Number(row.pairRows) !== row.hintless)
ok(censusDisagrees.length === 0, 'where the pair corpus publishes a refusalNoHint class, it equals this census (two independent readings of the same fact)', censusDisagrees)
console.log('  --- hint-less named refusals: ' + censusTotal + ' across ' + census.length + ' scenarios (written to ' + censusFile + ')')

// ── ③ THE HOOK'S OWN PROOF: SIM_SELFTEST_FAILURE turns a green scenario red BY NAME ────────────────────────────
const greenOut = join(TMP, 'hook-green')
const green = await runScenario('mainline', greenOut)
const greenReport = readFileSync(join(greenOut, 'REPORT.md'), 'utf8')
ok(green.code === 0, 'without SIM_SELFTEST_FAILURE the scenario exits 0', { exit: green.code })
ok(/scenario self-checks: ok/.test(greenReport), 'without the switch the report says the self-checks are ok', greenReport.split(String.fromCharCode(10)).slice(0, 8))

const redOut = join(TMP, 'hook-red')
const red = await runScenario('mainline', redOut, { SIM_SELFTEST_FAILURE: 'SIM_SELFTEST_HOOK_PROOF' })
const redReport = readFileSync(join(redOut, 'REPORT.md'), 'utf8')
ok(red.code === 1, 'with SIM_SELFTEST_FAILURE the same scenario exits 1 (the hook reaches the exit code)', { exit: red.code })
ok(/scenario self-checks: 1 FAILED/.test(redReport), 'with the switch the report headline says 1 FAILED', redReport.split(String.fromCharCode(10)).slice(0, 8))
ok(redReport.includes('SIM_SELFTEST_HOOK_PROOF'), 'with the switch the injected code is NAMED in the report, not just counted', redReport.includes('SIM_SELFTEST_HOOK_PROOF'))
const redManifest = JSON.parse(readFileSync(join(redOut, 'manifest.json'), 'utf8'))
ok(redManifest.selfChecks && redManifest.selfChecks.failed === 1 && redManifest.selfChecks.codes[0] === 'SIM_SELFTEST_HOOK_PROOF', 'the manifest carries the self-check failure code (the audit can read it without parsing prose)', redManifest.selfChecks)
ok(green.code === 0 && red.code === 1, 'the ONLY difference between the two runs is the switch (same scenario, same command line)', { green: green.code, red: red.code })

// ── cleanup ────────────────────────────────────────────────────────────────────────────────────────────────────
try { rmSync(TMP, { recursive: true, force: true }) } catch { /* a leftover temp dir is not a contract defect */ }
for (const r of runs) {
  try { rmSync(r.outDir, { recursive: true, force: true }) } catch { /* ditto */ }
}

console.log('')
console.log('=== sim scenario contracts: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exitCode = 1
