// tests/vmu-assistant-host-slice.test.mjs — GOAL 6, THE HOST SLICE (Round 4, task-29 B; Round 4b: route measured).
//
// WHAT THIS IS, AND WHAT IT IS NOT. Everything else in `tests/vmu-assistant-*.test.mjs` runs against the REAL preset
// entry but a RECORDED host context. This file is the one that can cross the last line: it drives a REAL DSH host and
// asserts the FACTS in the transcript. The division of labour with vmu-verify's framework smoke is deliberate: they own
// the framework faces, this owns the ASSISTANT face (report triggers, the parameter face, the two persona channels).
//
// THE ROUTE IS MEASURED, NOT ASSUMED — and `dsh headless` is NOT a route for this face. Read from the installed
// one-shot runner (`<dsh>/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-headless/lib/index.js`,
// `assertAdoptable`):
//     if (preset !== void 0) throw new Error(`session "…" runs under agent preset "…", which the one-shot runner
//                                            does not compose`)
// The assistant surface IS an agent preset (`vibe-math-vmu`), so a headless run can never compose it — no credential
// changes that. Mounting the plugin as a plain top-level row instead does not work either (measured):
//     vibe-math-vmu-slice (…/vibe-math-vmu.js): Error: cannot get property "systemPrompt" without inject
// because a preset scope is what provides that injected service.
//
// So the slice is driven on the route that CAN compose a preset: a RUNNING scratch `dsh web` instance, driven by the
// in-repo `scripts/dsh-drive.mjs` with an explicit `--preset`. This file never starts a server (that belongs to the
// operator / vmu-verify's smoke); it only drives and asserts.
//
// Run: node tests/vmu-assistant-host-slice.test.mjs                      (assert the route facts; slice NOT RUN)
//      node tests/vmu-assistant-host-slice.test.mjs --web-port 7791 --web-token <t> [--preset vibe-math-vmu]
//      node tests/vmu-assistant-host-slice.test.mjs --require-host       (exit ≠0 while the slice cannot run)
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const REQUIRE_HOST = process.argv.includes('--require-host')
const argOf = (name, def) => { const i = process.argv.indexOf('--' + name); return i === -1 ? def : process.argv[i + 1] }
const DSH_HOME = argOf('dsh-home', process.env.DSH_SLICE_HOME || join(process.env.TEMP || '/tmp', 'vmu-dsh-slice-home'))
const WEB_PORT = argOf('web-port', null)
const WEB_TOKEN = argOf('web-token', null)
const PRESET = argOf('preset', 'vibe-math-vmu')
// The SESSION WORKING DIRECTORY must be ASCII-only (the driver's precondition 3: a non-ASCII workspace becomes mojibake
// host-side and fails ENOENT). Kept separate from DSH_HOME so the slice's own workspace is obvious in the dump.
const WS_DIR = argOf('cwd', process.env.DSH_SLICE_WS || join(process.env.TEMP || '/tmp', 'vmu-slice-ws'))
const TIMEOUT_S = Number(argOf('timeout', '300'))
const PRINT = process.argv.includes('--print')

let passed = 0
let failed = 0
const failures = []
const notRun = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}
const stage = (n) => console.log('=== ' + n + ' ===')
/** A host-only assertion: recorded as NOT RUN (never as a pass) when the slice cannot be driven. */
const pending = (label, why) => { notRun.push({ label, why }); console.log('  n/a  ' + label + '  [NOT RUN: ' + why + ']') }

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, Object.assign({ cwd: REPO, encoding: 'utf8', timeout: TIMEOUT_S * 1000, env: Object.assign({}, process.env, { DSH_HOME }) }, opts))
/**
 * HOW TO INVOKE `dsh` WITHOUT A SHELL. On Windows `dsh` is a `.cmd`/`.ps1` shim, and `spawnSync('dsh', …)` cannot execute
 * a shim (measured: `spawnSync dsh ENOENT`). The shim only forwards to `node <dir>/node_modules/@deepseek-ai/dsh/lib/bin.js`,
 * so the CLI's own entry point is resolved from `where.exe` and run with the CURRENT node - no shell, no quoting games.
 */
const locateCli = () => {
  const found = spawnSync('where.exe', ['dsh'], { encoding: 'utf8' })
  const shim = String(found.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || null
  if (!shim) return null
  const bin = join(dirname(shim), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  return { bin: existsSync(bin) ? bin : null, shim }
}
const CLI = locateCli()
const dsh = (args) => (CLI && CLI.bin ? run(process.execPath, [CLI.bin].concat(args)) : run('dsh', args, { shell: true }))
const readText = (p) => { try { return readFileSync(p, 'utf8') } catch { return '' } }

// ── 1. THE ENVIRONMENT, ASSERTED (this part always runs) ─────────────────────────────────────────────────────────
stage('1. THE HOST PRECONDITIONS, MEASURED (named, never assumed)')
const version = dsh(['--version'])
ok(version.status === 0 && /\d+\.\d+\.\d+/.test(String(version.stdout || '')),
  '`dsh` is on PATH and reports a version (a scripted live run needs a real host)', { status: version.status, out: String(version.stdout || version.error || '').trim().slice(0, 80) })

const template = dsh(['--dump-default-config', '--profile', 'headless'])
ok(template.status === 0 || /\w/.test(String(template.stdout || '')),
  'the shipped `headless` template composes (kept as a route FACT, even though it cannot host this face: see §2)',
  { status: template.status })

try { mkdirSync(DSH_HOME, { recursive: true }) } catch (e) { /* reported below */ }
ok(existsSync(DSH_HOME), 'an ISOLATED `DSH_HOME` is usable, so a slice never touches the operator\'s own profile', { DSH_HOME })
ok(resolve(DSH_HOME) !== resolve(join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')),
  'and it is NOT the operator\'s own DSH_HOME (the driver\'s precondition 2: never the user\'s profile)')

// ── 2. WHICH RUNNER CAN HOST THE ASSISTANT FACE (read from the installed host code) ───────────────────────────────
stage('2. THE ROUTE, MEASURED AGAINST THE INSTALLED HOST')
const runnerFile = CLI && CLI.shim
  ? join(dirname(CLI.shim), 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-headless', 'lib', 'index.js')
  : null
const runnerSrc = runnerFile ? readText(runnerFile) : ''
if (runnerSrc) {
  ok(/one-shot runner does not compose/.test(runnerSrc),
    'the installed one-shot runner REFUSES a session that runs under an agent preset — so `dsh headless` cannot host the assistant face',
    { file: runnerFile })
  ok(/assertAdoptable/.test(runnerSrc) && /agentPreset/.test(runnerSrc),
    'and the refusal is about the PRESET (assertAdoptable/currentPreset), not about credentials: no key can change it')
} else {
  pending('the installed one-shot runner refuses preset sessions', 'the runner file was not readable from the resolved `dsh` shim')
}
// The provider fact measured on this machine (recorded, not asserted as a permanent state): a profile with the plugin
// installed still reports NO_ADAPTER until the provider's own key is present in the launching environment.
const providerNote = 'MEASURED: with `dsh plugin --profile <p> add dsh-opencode-go` installed and the operator\'s credentials copied into the scratch DSH_HOME, the run still reports `NO_ADAPTER: no adapter registered for provider "dsh-opencode-go"`; the plugin\'s own README documents `OPENCODE_API_KEY` in the environment for the headless flow.'
console.log('  NOTE: ' + providerNote)

// ── 3. THE SLICE (drivable only on the route that composes a preset) ──────────────────────────────────────────────
stage('3. THE SLICE ITSELF: REPORT TRIGGERS / PARAMETER FACE / BOTH PERSONA CHANNELS, IN A REAL HOST')
const DRIVER = join(REPO, 'scripts', 'dsh-drive.mjs')
const SLICE_TASK = [
  'Scripted acceptance slice. Do EXACTLY this and nothing else:',
  'call `vibe_vmu_report` with {"action":"status"} and quote the first 200 characters of the JSON result verbatim;',
  'then call it with {"action":"tick","metrics":"{\\"artifacts\\":9}"} and quote the first 200 characters verbatim;',
  'then answer in ONE sentence: are you the institute office (assistant/external interface) or a member, and do you vote?',
].join('\n')
if (WEB_PORT && WEB_TOKEN && existsSync(DRIVER)) {
  // THE ROUTE THAT CAN COMPOSE THE PRESET: a running scratch `dsh web` instance, driven by the in-repo driver with an
  // explicit `--preset`. The server is NOT started here (that belongs to the operator / verify's smoke).
  try { mkdirSync(WS_DIR, { recursive: true }) } catch (e) { /* reported by the driver if it matters */ }
  const outDir = join(process.env.TEMP || '/tmp', 'vmu-host-slice-' + Date.now())
  const drive = spawnSync(process.execPath, [DRIVER, '--port', String(WEB_PORT), '--token', String(WEB_TOKEN), '--cwd', WS_DIR,
    '--preset', PRESET, '--task', SLICE_TASK, '--out', outDir, '--timeout', String(TIMEOUT_S)],
  { cwd: REPO, encoding: 'utf8', timeout: (TIMEOUT_S + 60) * 1000 })
  const dump = readText(join(outDir, 'transcript.jsonl'))
  const summary = readText(join(outDir, 'summary.json'))
  const transcript = String(drive.stdout || '') + '\n' + String(drive.stderr || '') + '\n' + dump + '\n' + summary
  ok(drive.status === 0, 'the driven real session finished under preset ' + PRESET, { status: drive.status, tail: transcript.trim().slice(-200) })
  ok(/vibe_vmu_report/.test(transcript), 'HOST: the assistant face is REACHABLE in a real session (the tool was really called)')
  ok(/v5r-artifact-threshold|【成果阈值】/.test(transcript) && /drives"?\s*:\s*false/.test(transcript),
    'HOST: a threshold report really fired from a real metric, and its receipt says drives:false')
  ok(/liveReadBy/.test(transcript) && /"appended"\s*:\s*true/.test(transcript),
    'HOST: the parameter face went through the kernel writer and left an audit row')
  ok(/office|所办/.test(transcript) && /不投票|no vote|不参与研究/.test(transcript),
    'HOST: the SYSTEM PROMPT channel reached the model (it answers as the office, not as a voting member)')
  // THE EVIDENCE DIGEST: provider/model, the session, and the token readings the host emitted (whatever it emits - the
  // absence of a field is reported as absent, never invented).
  const pick = (re) => { const m = transcript.match(re); return m ? m[0] : null }
  const digest = {
    preset: PRESET, port: WEB_PORT, sessionId: pick(/"sessionId"\s*:\s*"[^"]+"/),
    model: pick(/"model"\s*:\s*"[^"]+"/), provider: pick(/"provider"\s*:\s*"[^"]+"/),
    usage: pick(/"usage"\s*:\s*\{[^}]*\}/), turns: pick(/"rounds?"\s*:\s*\d+/),
    dumpDir: outDir, ws: WS_DIR,
  }
  console.log('  EVIDENCE: ' + JSON.stringify(digest))
  if (PRINT) {
    console.log('----- transcript excerpt (first 600 chars) -----')
    console.log(transcript.slice(0, 600))
    console.log('----- end excerpt · ' + transcript.length + ' chars -----')
  }
} else {
  const PRE = 'NO PRESET-CAPABLE RUNNER WAS HANDED OVER: `dsh headless` refuses any session under an agent preset (measured in §2), so the assistant face needs a RUNNING scratch `dsh web` instance driven with `--preset ' + PRESET + '` (scripts/dsh-drive.mjs). ' + providerNote
  console.log('  HOST SLICE: NOT RUN — ' + PRE)
  for (const label of [
    'vibe_vmu_report is present in a REAL session and answers `action:"status"`',
    'a threshold report fires in a REAL session from a real metric (receipt shows fired[]/drives:false)',
    'the parameter face sends a change through the kernel writer (hot/appliesAt/liveReadBy + audit:appended)',
    'the turn channel reaches the model (the round prompt carries the reporting duty)',
    'the SYSTEM PROMPT channel reaches the model (the assistant answers AS the office: no research, no vote)',
  ]) pending(label, 'no preset-capable runner was handed over (see the named precondition above)')
  if (REQUIRE_HOST) { failed++; failures.push('HOST SLICE REQUIRED BUT NOT RUN: ' + PRE) }
}

console.log('')
console.log('=== VMU ASSISTANT HOST SLICE: ' + passed + ' passed, ' + failed + ' failed, ' + notRun.length + ' not-run' + (REQUIRE_HOST ? ' (--require-host)' : '') + ' ===')
if (notRun.length) console.log('HOST SLICE: NOT RUN — ' + notRun.length + ' host-only assertions pending (named above)')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
