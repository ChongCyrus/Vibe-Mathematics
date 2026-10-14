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
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import zlib from 'node:zlib'

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
// PLAYBOOK §4: a scripted run MUST carry an explicit token cap. The default is a small, deliberate number rather than
// "no cap" (0 means uncapped in the driver): a slice that runs away must be cancelled, and the cap hit is reported.
const MAX_TOKENS = Number(argOf('max-tokens', '60000'))
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
/**
 * THE SESSION LOG IS THE EVIDENCE THE ACCOUNTING DEMANDS (seq + line for every tool/call & tool/result, plus the
 * assistant's own words). It is a MULTI-FRAME zstd file, so it must be split on the zstd magic before each frame is
 * decoded - exactly the technique `scripts/dsh-drive.mjs:213-215` uses (`zstdDecompressSync` alone stops at frame 1 and
 * yields only the session header, which is how a plain decode produced a misleadingly tiny result once).
 */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
function decodeZstdFrames(buf) {
  const parts = []; let off = 0
  while (off < buf.length) {
    const n = buf.indexOf(ZSTD_MAGIC, off + 4)
    const slice = n === -1 ? buf.subarray(off) : buf.subarray(off, n)
    try { parts.push(zlib.zstdDecompressSync(slice)) } catch { /* skip an undecodable frame */ }
    if (n === -1) break
    off = n
  }
  return Buffer.concat(parts).toString('utf8')
}
function findSessionLog(home, sessionId) {
  const root = join(home, 'sessions')
  const walk = (d, out = []) => { try { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p) } } catch { /* none */ } return out }
  return walk(root).find((p) => p.includes(sessionId) && /session.*jsonl/.test(p)) || null
}
/** { file, lines, events, toolCalls[{line,seq,name}], toolResults[{line,seq}], assistant[] } - all with line numbers. */
function readSessionLog(home, sessionId) {
  // THE LOG IS FLUSHED AT TURN END, so a read taken the instant the driver exits can MISS it (measured: an earlier
  // version reported `sessionLog:null` and silently produced an empty accounting, which reads like "no tool calls").
  // Retry briefly by sleeping in a child process (this script is synchronous), then give up by NAME.
  let file = null
  for (let attempt = 0; attempt < 15 && !file; attempt++) {
    file = findSessionLog(home, sessionId)
    if (!file) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},200)'], { timeout: 2000 })
  }
  if (!file) { console.log('  NOT-FOUND: session log for ' + sessionId + ' under ' + join(home, 'sessions') + ' (accounting unavailable, stated by name)'); return { file: null, lines: 0, events: [], toolCalls: [], toolResults: [], assistant: [] } }
  const text = decodeZstdFrames(readFileSync(file))
  const raw = text.split('\n').filter(Boolean)
  const events = []; const toolCalls = []; const toolResults = []; const assistant = []
  raw.forEach((l, i) => {
    let e; try { e = JSON.parse(l) } catch { return }
    events.push(e)
    const seq = e.seq ?? e.data?.seq ?? '?'
    if (e.type === 'tool/call') toolCalls.push({ line: i + 1, seq, name: e.data?.name })
    if (e.type === 'tool/result') toolResults.push({ line: i + 1, seq })
    if (e.type === 'assistant/message') { const t = (e.data?.message?.content ?? []).map((c) => c.text ?? '').join(''); if (t.trim()) assistant.push(t) }
  })
  return { file, lines: raw.length, events, toolCalls, toolResults, assistant }
}
const lineOf = (events, typeFilters) => { const i = events.findIndex((e) => typeFilters.some((f) => String(e.type).includes(f))); return i === -1 ? null : i + 1 }

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
  // PLAYBOOK §2: the FIRST user message must say this is a SIMULATED TEST (its `user/message` seq + line number are
  // part of the evidence). The tools are NAMED EXPLICITLY (round-5 lesson: a vague prompt produced `toolCalls:0`, which
  // cannot be told apart from "the faces were never published").
  '【模拟测试 / SIMULATED TEST】This is a scripted acceptance slice for the vmu assistant face, NOT a research task.',
  'Call these tools IN ORDER and print the first 80 characters of each JSON result verbatim (if one is missing or refuses, say so and continue):',
  '1. `vibe_vmu_status`',
  '2. `vibe_vmu_chat` with {"action":"list"}',
  '3. `vibe_vmu_panel` with {"action":"status"}',
  '4. `vibe_vmu_report` with {"action":"status"}',
  '5. `vibe_vmu_report` with {"action":"tick","metrics":"{\\"artifacts\\":9}"}',
  'Then answer in ONE sentence: are you the institute office (assistant/external interface) or a member, and do you vote?',
].join('\n')
if (WEB_PORT && WEB_TOKEN && existsSync(DRIVER)) {
  // THE ROUTE THAT CAN COMPOSE THE PRESET: a running scratch `dsh web` instance, driven by the in-repo driver with an
  // explicit `--preset`. The server is NOT started here (that belongs to the operator / verify's smoke).
  try { mkdirSync(WS_DIR, { recursive: true }) } catch (e) { /* reported by the driver if it matters */ }
  const outDir = join(process.env.TEMP || '/tmp', 'vmu-host-slice-' + Date.now())
  // THE DRIVER APPENDS TO `<out>/transcript.jsonl` AS ITS FIRST ACT (the auth step is already logged), so the directory
  // must exist BEFORE it starts - measured: without this it dies with `ENOENT ... transcript.jsonl` right after auth,
  // i.e. before any model turn (a free failure, but a wasted attempt).
  try { mkdirSync(outDir, { recursive: true }) } catch (e) { /* the driver will report it if it matters */ }
  const drive = spawnSync(process.execPath, [DRIVER, '--port', String(WEB_PORT), '--token', String(WEB_TOKEN), '--cwd', WS_DIR,
    '--preset', PRESET, '--task', SLICE_TASK, '--out', outDir, '--timeout', String(TIMEOUT_S),
    // PLAYBOOK §4: the driver must be given an explicit token cap on every run (0 would mean "no cap").
    '--max-tokens', String(MAX_TOKENS),
    '--jsonl', join(outDir, 'transcript.jsonl')],
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
  // MULTI-FACE LIT (the fact vmu-verify needs for its matrix) - read from the SESSION LOG, which is the authoritative
  // record with `seq` + line numbers. Prose mentions are NOT calls: only `tool/call` events count.
  const sessionId = (transcript.match(/"sessionId"\s*:\s*"([^"]+)"/) || [])[1] || null
  const sess = sessionId ? readSessionLog(DSH_HOME, sessionId) : { file: null, lines: 0, events: [], toolCalls: [], toolResults: [], assistant: [] }
  const calledFaces = [...new Set(sess.toolCalls.map((t) => t.name).filter(Boolean))].sort()
  const vmuFaces = calledFaces.filter((n) => /^vibe_vmu_/.test(n))
  ok(vmuFaces.length >= 3, 'HOST: at least three vmu faces were really CALLED in the session (multi-face lit)', { called: calledFaces })
  ok(calledFaces.indexOf('vibe_vmu_report') !== -1 && sess.toolResults.length > 0,
    'HOST: the report face was really CALLED and produced a tool/result', { called: calledFaces, results: sess.toolResults.length })
  console.log('  FACES CALLED: ' + JSON.stringify(calledFaces))
  // THE ACCOUNTING THE LEAD ASKED FOR: every tool/call & tool/result with its seq + line number.
  console.log('  TOOL EVIDENCE: ' + JSON.stringify({
    sessionLog: sess.file, lines: sess.lines, events: sess.events.length,
    calls: sess.toolCalls.map((t) => ({ name: t.name, seq: t.seq, line: t.line })),
    results: sess.toolResults.map((r) => ({ seq: r.seq, line: r.line })),
    firstUserMessage: (() => { const i = sess.events.findIndex((e) => e.type === 'user/message'); return i === -1 ? null : { line: i + 1, seq: sess.events[i].seq ?? sess.events[i].data?.seq ?? '?' } })(),
  }))
  // WHEN NOTHING WAS CALLED, THE MODEL'S OWN WORDS ARE THE FINDING (and they distinguish the two possible causes:
  // "the faces are in the tool list but the model would not call them" vs "the faces were never published").
  if (sess.toolCalls.length === 0) {
    const words = sess.assistant.join('\n').trim()
    console.log('  FINDING (no tool call): the model said: ' + JSON.stringify(words.slice(0, 700)))
    ok(/vibe_vmu_report/.test(words) && /(not available|no such tool|unavailable|未提供|不可用|没有)/i.test(words) === false && words.length > 0,
      'HOST: with zero tool calls, the model\'s OWN WORDS are recorded as the finding (not silently passed)', { chars: words.length })
  }
  // THE EVIDENCE DIGEST: provider/model, the session, and the token readings the host emitted (whatever it emits - the
  // absence of a field is reported as absent, never invented).
  const pick = (re) => { const m = transcript.match(re); return m ? m[0] : null }
  const digest = {
    preset: PRESET, port: WEB_PORT, sessionId,
    model: pick(/"model"\s*:\s*"[^"]+"/), provider: pick(/"provider"\s*:\s*"[^"]+"/),
    usage: pick(/"tokens"\s*:\s*\{[^}]*\}/), turns: pick(/"rounds?"\s*:\s*\d+/),
    tokenCap: MAX_TOKENS, tokenCapHit: /"tokenCapHit"\s*:\s*true/.test(transcript),
    toolCalls: sess.toolCalls.length, facesCalled: calledFaces,
    transcriptEvents: pick(/"transcriptEvents"\s*:\s*\d+/),
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
