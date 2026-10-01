// tests/math-computation-v5.test.mjs — v5 wiring + seam for `math_computation` (P1).
//
// WHAT THIS SUITE OWNS (docs/math-computation.md, _oneoff/mc-P1-ready/{INTERFACE-FREEZE,guards}.md):
//   · v5-specific: the six frozen params reach DEFAULT_PARAMS + normalizeMathParams + the CLOSED
//     `vibe_v5_set` schema + `visibleParams`; the shared module is registered once on v5's single
//     `registerTool` layer; `mkdirs()` creates `Computation/`.
//   · the seam: `projectRoot()` is the INSTITUTE root (receipts in
//     <institute>/Computation/<runId>/), `writeText/readText/exists` are institute-relative and
//     re-guarded, `spawn` returns FULL output and KILLS on timeout, a host without a subprocess
//     service yields MATH_NO_SUBPROCESS instead of a crash.
//   · behaviour through that seam (fake engines only — no real engine is ever touched): probe
//     hit/miss, packages, commercial licences, timeout, non-zero exit, oversized output,
//     refusal paths, argv assembly + echo, cli default-on and both ways to disable it,
//     install plan→confirm, and the prompt/persona surfaces per `mathMode`/`mathComputation`.
//
// MUTANTS (guards.md §4 style; run with V5_PRESET_DIR pointing at a patched copy):
//   M1 drop the six math keys from `visibleParams`        ⇒ "status shows all six" red
//   M2 drop them from the closed `vibe_v5_set` schema     ⇒ "schema advertises all six" red
//   M3 bypass `normalizeMathParams` (raw values pass)     ⇒ normalisation assertions red
//   M4 seam `writeText` writes under the WORKSPACE root   ⇒ receipt-under-institute red
//   M5 drop the availability line from the prompts        ⇒ prompt assertions red
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PRESET_DIR = process.env.V5_PRESET_DIR || join(HERE, '..', 'vibe-math-v5')
// The module files sit NEXT TO the plugin, so both URLs are derived from the plugin path.
const PLUGIN_URL = pathToFileURL(process.env.V5_PLUGIN ? String(process.env.V5_PLUGIN) : join(PRESET_DIR, 'vibe-math-v5.js')).href
const PRESET_URL = new URL('./', PLUGIN_URL).href

const pluginModule = await import(PLUGIN_URL)
const math = await import(PRESET_URL + 'math-computation.js')
const engines = await import(PRESET_URL + 'math-engines.js')

let passed = 0
let failed = 0
const failures = []
function assert(cond, msg) {
  if (cond) { passed += 1; console.log('  ok - ' + msg) }
  else { failed += 1; failures.push(msg); console.log('  FAIL - ' + msg) }
}
function section(t) { console.log('\n' + t) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// v5 mixes separators (a Windows cwd + '/'-joined segments), so path comparisons normalise.
const N = (p) => String(p == null ? '' : p).replace(/\\/g, '/')

// ── fake engine seam (guards.md §3) ─────────────────────────────────────────────────────────────
// Nothing is ever executed: `resolveExecutable` answers from the `installed` map and `spawn`
// synthesises the engine's behaviour (version/licence/package/run) from the request argv.
function makeSeam(opts) {
  const o = opts || {}
  const installed = o.installed || {}
  const calls = []
  const state = { terminated: 0, handshakes: 0 }
  const engineOfCandidate = (cand) => Object.keys(engines.MATH_ENGINES).find((n) => (engines.MATH_ENGINES[n].candidates || []).indexOf(cand) !== -1)
  const VERSION_OUT = {
    python: 'Python 3.11.4\n', r: 'R version 4.3.1 (2023-06-16) -- "Beagle Scouts"\n',
    octave: 'GNU Octave, version 8.4.0\n', julia: 'julia version 1.10.2\n',
    matlab: '24.1.0.2625469 (R2024a)\n', maple: 'Maple 2024.1\n', wolfram: '14.0.0 for Linux x86 (64-bit)\n',
  }
  // Which candidate resolves for each installed engine (the FIRST candidate, like a real PATH).
  const resolvedFor = {}
  for (const name of Object.keys(installed)) {
    const d = engines.MATH_ENGINES[name]
    if (d && d.candidates && d.candidates.length) resolvedFor[name] = d.candidates[0]
  }
  return {
    calls, state,
    get runCalls() { return calls.filter((c) => c.kind === 'run') },
    async resolveExecutable(cmd) {
      const c = String(cmd == null ? '' : cmd)
      if (o.unresolvable && o.unresolvable.indexOf(c) !== -1) throw new Error('ENOENT: ' + c)
      if (o.resolveAll) return 'C:/fake/' + c
      for (const name of Object.keys(resolvedFor)) if (resolvedFor[name] === c) return 'C:/fake/' + c
      throw new Error('ENOENT: ' + c)
    },
    spawn(spec) {
      if (o.noSpawn) return null
      const argv = (spec.argv || []).map(String)
      const exe = argv[0] || ''
      const cand = exe.replace(/^[A-Za-z]:[\\/]fake[\\/]/, '')
      const eng = engineOfCandidate(cand) || (o.cliName && cand === o.cliName ? 'cli' : null)
      const joined = argv.join(' ')
      let kind = 'run'
      if (argv[1] === '--version' || joined.indexOf('disp(version)') !== -1 || joined.indexOf('$Version') !== -1) kind = 'version'
      else if (joined.indexOf("license('test','MATLAB')") !== -1 || joined.indexOf('Print[$LicenseType]') !== -1 || (eng === 'maple' && joined.indexOf('printf("1")') !== -1)) kind = 'license'
      else if (/importlib\.util|requireNamespace|pkg\('list'\)|Base\.find_package|license\('test',|with\(p\)|Needs\[/.test(joined)) kind = 'package'
      const rec = { argv, cwd: spec.cwd, kind, engine: eng, stdio: spec.stdio }
      calls.push(rec)
      let exit = 0
      let stdout = ''
      let stderr = ''
      if (kind === 'version') {
        stdout = VERSION_OUT[eng] || '1.0.0\n'
        if (o.versionFails && o.versionFails.indexOf(eng) !== -1) { exit = 1; stdout = 'boom\n' }
      } else if (kind === 'license') {
        const ok = !(o.unlicensed && o.unlicensed.indexOf(eng) !== -1)
        stdout = eng === 'matlab' ? (ok ? '1\n' : '0\n') : (ok ? 'Licensed\n' : 'Unlicensed\n')
      } else if (kind === 'package') {
        const st = o.packageState || {}
        stdout = Object.keys(st).map((p) => p + ':' + (st[p] ? 'ok' : 'missing')).join('|') + '|'
      } else {
        exit = Number(o.runExit) || 0
        stdout = o.runStdout === undefined ? (eng === 'cli' ? 'cli-ok\n' : 'answer: 4\n') : String(o.runStdout)
        stderr = o.runStderr === undefined ? '' : String(o.runStderr)
        if (o.badArgv) { exit = 2; stderr = "Error, unknown option `-q'\n" }
        if (o.bigStdout) stdout = 'x'.repeat(o.bigStdout)
      }
      const box = { stdout, stderr }
      const ring = (which) => ({ readFrom: () => ({ text: box[which] }) })
      if (o.hang && kind === 'run') {
        let release = null
        const done = new Promise((resolve) => { release = resolve })
        state.handshakes += 1
        return {
          done,
          collected: { stdout: ring('stdout'), stderr: ring('stderr') },
          terminate() { state.terminated += 1; release({ exitCode: null, signal: 'SIGTERM' }) },
        }
      }
      return {
        done: Promise.resolve({ exitCode: exit, signal: null }),
        collected: { stdout: ring('stdout'), stderr: ring('stderr') },
        terminate() { state.terminated += 1 },
      }
    },
  }
}

// ── minimal v5 host ─────────────────────────────────────────────────────────────────────────────
function makeHost(seam) {
  const WS = mkdtempSync(join(tmpdir(), 'vibe-v5mc-'))
  const toolRegs = []
  const commandRegs = []
  const spawns = []
  const wakes = []
  const listeners = {}
  const liveAgents = new Map()
  const ROOT_SESSION = { header: { cwd: WS }, id: 'sess-mc' }
  const ROOT = { id: 'sess-mc', options: {}, session: ROOT_SESSION }
  const ctx = {
    get(name) {
      if (name === 'subprocess') return seam
      return undefined
    },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
    tools: { register(spec) { toolRegs.push(spec); return () => {} } },
    commands: { register(spec) { commandRegs.push(spec); return () => {} } },
    subagents: {
      list() { return [] },
      async startContinuable({ label, request }) {
        const id = 'c' + (spawns.length + 1)
        const child = { id, session: { header: { cwd: WS, parentSession: ROOT.id } }, options: {} }
        liveAgents.set(id, child)
        spawns.push({ label, childId: id, persona: request && request.persona, ended: false })
        return { childId: id, messageId: 'm' + spawns.length }
      },
      async sendMessage(parent, childId, blocks) { wakes.push({ childId, blocks }); return 'w' + wakes.length },
      interrupt() {},
      async drainContinuableChildren(parent, ids) { for (const i of ids) liveAgents.delete(i) },
    },
    agents: { roots() { return [ROOT] }, get(id) { return id === ROOT.id ? ROOT : liveAgents.get(id) }, list() { return [ROOT, ...liveAgents.values()] } },
    fs: {
      async resolve(rel, o2) {
        const b = (o2 && o2.cwd) || WS
        const p = (typeof rel === 'string' && isAbsolute(rel)) ? rel.replace(/\//g, '\\') : join(b, ...String(rel).split('/'))
        return { targetKey: p, displayPath: p }
      },
      async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
      async readText(t) { return readFileSync(t.targetKey, 'utf8') },
      async writeText(t, c) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8') },
      async listDir(t) { if (!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
    },
  }
  pluginModule.apply(ctx)
  const inst = () => join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute')
  async function callTool(name, args, agent) {
    const spec = toolRegs.find((x) => x.name === name)
    if (!spec) throw new Error('no tool ' + name)
    const raw = await spec.execute(args || {}, { agent: agent || ROOT })
    return JSON.parse(raw)
  }
  async function callMath(args) { return await callTool('math_computation', args) }
  const childOf = (member) => { const s = spawns.find((x) => x.label.indexOf('vibe5 ' + member + ' ') !== -1); return s ? s.childId : null }
  function fireEnd(childId, reply) {
    const blocks = reply === undefined ? [] : [{ type: 'text', text: '```json\n' + JSON.stringify(reply) + '\n```' }]
    for (const h of (listeners['subagent/end'] || [])) h({ id: childId, runId: 'r', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: blocks })
  }
  async function settleSpawns() {
    for (const sp of spawns.slice()) {
      if (sp.ended) continue
      sp.ended = true
      fireEnd(sp.childId, { progress: memberOf(sp.childId) + '：初始见解。', solved: false, contextPct: 10 })
      await sleep(15)
    }
  }
  function memberOf(childId) { const s = spawns.find((x) => x.childId === childId); const m = s ? /vibe5 (\S+) /.exec(s.label) : null; return m ? m[1] : '' }
  async function nextWakeFor(member, budgetMs) {
    const deadline = Date.now() + (budgetMs || 3000)
    while (Date.now() < deadline) {
      const i = wakes.findIndex((w) => memberOf(w.childId) === member)
      if (i !== -1) { const w = wakes.splice(i, 1)[0]; return { childId: w.childId, text: (w.blocks && w.blocks[0] && w.blocks[0].text) || '' } }
      await sleep(10)
    }
    return null
  }
  return { WS, ctx, ROOT, toolRegs, commandRegs, spawns, wakes, callTool, callMath, inst, childOf, fireEnd, settleSpawns, nextWakeFor }
}

const INST = (h) => h.inst()
const receiptDir = (h, id) => join(INST(h), 'Computation', id)
const listReceipts = (h) => { const d = join(INST(h), 'Computation'); return existsSync(d) ? readdirSync(d) : [] }

// ===============================================================================================
console.log('-- math_computation v5 wiring (P1) --')

// ---------- 1. the six params: defaults, normalisation, closed schema, visibleParams ----------
section('1 the six frozen params reach every v5 surface')
{
  const seam = makeSeam({ installed: {} })
  const h = makeHost(seam)
  const st = await h.callTool('vibe_v5_status', {})
  const p = st.params
  assert(math.MATH_PARAM_NAMES.every((k) => p[k] !== undefined),
    '★ visibleParams exposes all six math keys (/v5 status can see them): ' + JSON.stringify({ c: p.mathComputation, m: p.mathMode, e: p.mathEngines, t: p.mathTimeoutMs, k: p.mathPackages, s: p.mathInstallScope }))
  assert(p.mathComputation === math.MATH_PARAM_DEFAULTS.mathComputation && p.mathMode === math.MATH_PARAM_DEFAULTS.mathMode &&
    p.mathTimeoutMs === math.MATH_PARAM_DEFAULTS.mathTimeoutMs && p.mathInstallScope === math.MATH_PARAM_DEFAULTS.mathInstallScope,
    'the defaults come from the shared module')
  assert(JSON.stringify(p.mathEngines) === JSON.stringify(math.MATH_PARAM_DEFAULTS.mathEngines),
    'the default engine list (incl. cli) is the frozen one: ' + JSON.stringify(p.mathEngines))
  const setSpec = h.toolRegs.find((t) => t.name === 'vibe_v5_set')
  const props = setSpec.parameters.properties
  assert(math.MATH_PARAM_NAMES.every((k) => Object.prototype.hasOwnProperty.call(props, k)),
    '★ the CLOSED vibe_v5_set schema advertises all six math keys')
  assert(JSON.stringify((props.mathComputation || {}).enum) === JSON.stringify(['off', 'auto', 'on']) &&
    JSON.stringify((props.mathMode || {}).enum) === JSON.stringify(['typed', 'typed+shell']) &&
    JSON.stringify((props.mathInstallScope || {}).enum) === JSON.stringify(['user', 'system']),
    'the three math enums are frozen in the schema')
  const mspec = h.toolRegs.find((t) => t.name === 'math_computation')
  assert(!!mspec, 'the shared module registered math_computation on the v5 tool surface')
  assert(mspec.description === math.MATH_TOOL_DESCRIPTION, 'the tool description is the frozen shared string')
  assert(JSON.stringify(Object.keys(mspec.parameters.properties)) === JSON.stringify(Object.keys(math.MATH_TOOL_SCHEMA.properties)),
    'the registered parameter schema is the module’s frozen schema')
  // Normalisation goes through the shared module (explicit coercion, no raw leakage).
  const r1 = await h.callTool('vibe_v5_set', { mathEngines: 'python, cli, nope', mathMode: 'nonsense', mathTimeoutMs: 400, mathPackages: 'numpy, sympy', mathInstallScope: 'system', mathComputation: 'bogus' })
  assert(JSON.stringify(r1.params.mathEngines) === JSON.stringify(['python', 'cli']),
    '★ mathEngines: a comma string is split and unknown engines are dropped (' + JSON.stringify(r1.params.mathEngines) + ')')
  assert(r1.params.mathMode === 'typed+shell', 'a bogus mathMode falls back to the documented default')
  assert(r1.params.mathComputation === 'auto', 'a bogus mathComputation falls back to auto')
  assert(r1.params.mathTimeoutMs === 1000, 'mathTimeoutMs below 1000 is raised to 1000')
  assert(JSON.stringify(r1.params.mathPackages) === JSON.stringify(['numpy', 'sympy']), 'mathPackages accepts a comma string')
  assert(r1.params.mathInstallScope === 'system', 'mathInstallScope=system is accepted (per call)')
  // A partial tuning must NOT reset the other math keys.
  const r2 = await h.callTool('vibe_v5_set', { maxParallel: 3 })
  assert(r2.params.mathMode === 'typed+shell' && JSON.stringify(r2.params.mathEngines) === JSON.stringify(['python', 'cli']),
    '★ an unrelated tuning call does not reset the math keys (' + JSON.stringify(r2.params.mathEngines) + ')')
  for (const k of math.MATH_PARAM_NAMES) {
    // The audit's I14 invariant: every advertised key must be accepted by normalizeParams.
    const probe = await h.callTool('vibe_v5_set', { [k]: k === 'mathEngines' ? ['python'] : k === 'mathPackages' ? ['numpy'] : k === 'mathTimeoutMs' ? 5000 : k === 'mathComputation' ? 'on' : k === 'mathMode' ? 'typed' : 'user' })
    assert(probe.ok === true && probe.params[k] !== undefined, 'the closed schema accepts ' + k)
  }
}

// ---------- 2. probe: hit / miss with the per-OS user-install guide ----------
section('2 op=probe reports availability, and a missing engine comes with the guide')
{
  const miss = makeHost(makeSeam({ installed: {} }))
  const r0 = await miss.callMath({ op: 'probe' })
  assert(r0.ok === false && r0.code === 'MATH_ENGINE_NOT_FOUND' && r0.next && r0.next.kind === 'user-install',
    '★ no engine ⇒ MATH_ENGINE_NOT_FOUND + next.kind=user-install (' + JSON.stringify({ c: r0.code, n: r0.next && r0.next.kind }) + ')')
  assert(!!(r0.next && r0.next.perOs && r0.next.perOs.windows && r0.next.perOs.linux),
    'the guide carries per-OS install commands')
  const hit = makeHost(makeSeam({ installed: { python: true } }))
  const r1 = await hit.callMath({ op: 'probe' })
  assert(r1.ok === true && r1.engines.some((e) => e.name === 'python' && /3\.11/.test(e.version)),
    'probe reports python + its version (' + JSON.stringify(r1.engines) + ')')
}

// ---------- 3. run: three modes, argv assembly, receipt under the INSTITUTE root ----------
section('3 op=run: argv assembly, cwd, receipt paths (institute root)')
{
  const seam = makeSeam({ installed: { python: true, octave: true } })
  const h = makeHost(seam)
  const code = 'print(6*7)\n'
  const rCode = await h.callMath({ op: 'run', engine: 'python', mode: 'code', code })
  assert(rCode.ok === true && rCode.exit === 0 && rCode.receipt && rCode.receipt.dir.indexOf('Computation/') === 0,
    'mode=code runs and archives a receipt (' + JSON.stringify({ ok: rCode.ok, dir: rCode.receipt && rCode.receipt.dir }) + ')')
  const run1 = seam.runCalls[0]
  assert(run1 && N(run1.cwd) === N(INST(h)), '★ the engine runs with cwd = the INSTITUTE root (' + run1.cwd + ')')
  assert(N(run1.argv[1]) === N(join(INST(h), rCode.receipt.dir, 'script.py')),
    '★ argv carries the ABSOLUTE script path the tool wrote (' + JSON.stringify(run1.argv.slice(1)) + ')')
  assert(existsSync(join(INST(h), rCode.receipt.dir, 'script.py')) && existsSync(join(INST(h), rCode.receipt.json)) && existsSync(join(INST(h), rCode.receipt.md)),
    'script + receipt.json + receipt.md really exist under <institute>/' + rCode.receipt.dir)
  assert(JSON.stringify(rCode.argv) === JSON.stringify(run1.argv),
    '★ the return shell echoes the EXACT argv that ran')
  const parsed = JSON.parse(readFileSync(join(INST(h), rCode.receipt.json), 'utf8'))
  assert(JSON.stringify(parsed.argv) === JSON.stringify(run1.argv) && parsed.preset === 'vibe-math-v5' && N(parsed.cwd) === N(INST(h)),
    '★ receipt.json carries the actual argv, the preset designator and the institute cwd')
  // mode=expr: ONE argv element, never shell-concatenated.
  const rExpr = await h.callMath({ op: 'run', engine: 'python', mode: 'expr', expr: '2 ** 10' })
  const exprCall = seam.runCalls[seam.runCalls.length - 1]
  assert(rExpr.ok === true && exprCall.argv.indexOf('2 ** 10') !== -1 && exprCall.argv.indexOf('-c') !== -1,
    'mode=expr substitutes the expression into ONE argv element (' + JSON.stringify(exprCall.argv) + ')')
  // mode=file: inside the institute is allowed, outside is refused.
  mkdirSync(join(INST(h), 'Problems'), { recursive: true })
  writeFileSync(join(INST(h), 'Problems', 'calc.py'), 'print(1)\n', 'utf8')
  const rFile = await h.callMath({ op: 'run', engine: 'python', mode: 'file', file: 'Problems/calc.py' })
  assert(rFile.ok === true, 'mode=file runs a script inside the project')
  const rEsc = await h.callMath({ op: 'run', engine: 'python', mode: 'file', file: '../../../../etc/evil.py' })
  assert(rEsc.ok === false && rEsc.code === 'MATH_REFUSED', '★ a path escaping the project is REFUSED (' + JSON.stringify(rEsc).slice(0, 90) + ')')
  const rAbs = await h.callMath({ op: 'run', engine: 'python', mode: 'file', file: 'C:/etc/evil.py' })
  assert(rAbs.ok === false && rAbs.code === 'MATH_REFUSED', 'an absolute path is refused')
  assert(listReceipts(h).length >= 2 && existsSync(join(INST(h), 'Computation')), 'receipts live in <institute>/Computation/')
}

// ---------- 4. packages: present ⇒ continue, missing ⇒ no execution + install plan hint ----------
section('4 packages')
{
  const ok0 = makeHost(makeSeam({ installed: { python: true }, packageState: { numpy: true } }))
  const r0 = await ok0.callMath({ op: 'probe', engine: 'python', packages: ['numpy'] })
  assert(r0.ok === true && r0.packages && r0.packages.found && r0.packages.found.numpy === 'present',
    'a present package is reported found (' + JSON.stringify(r0.packages) + ')')
  const seam = makeSeam({ installed: { python: true }, packageState: { sympy: false } })
  const h = makeHost(seam)
  const r1 = await h.callMath({ op: 'run', engine: 'python', mode: 'code', code: 'x=1\n', packages: ['sympy'] })
  assert(r1.ok === false && r1.code === 'MATH_MISSING_PACKAGES' && JSON.stringify(r1.missing) === JSON.stringify(['sympy']),
    '★ a missing package ⇒ MATH_MISSING_PACKAGES{missing:[sympy]}')
  assert(r1.next && r1.next.kind === 'agent-install' && r1.next.dryRun === true,
    'the next step is an AGENT INSTALL PLAN (dry run), never an automatic install')
  assert(seam.runCalls.length === 0, '★ the script was NOT executed when a package is missing')
}

// ---------- 5. commercial engines: licence probe, vendor guidance, never an install plan --------
section('5 commercial engines')
{
  const seam = makeSeam({ installed: { matlab: true }, unlicensed: ['matlab'] })
  const h = makeHost(seam)
  const r = await h.callMath({ op: 'run', engine: 'matlab', mode: 'code', code: 'disp(1)\n' })
  assert(r.ok === false && r.code === 'MATH_ENGINE_LICENSE_REQUIRED' && r.next && r.next.kind === 'vendor' && /mathworks/.test(r.next.url || ''),
    '★ an installed-but-unlicensed matlab ⇒ LICENSE_REQUIRED + the vendor link (' + JSON.stringify(r.next) + ')')
  const inst = await h.callMath({ op: 'install', engine: 'matlab', packages: ['MATLAB'] })
  assert(inst.ok === false && inst.code === 'MATH_REFUSED',
    '★ commercial engines are NEVER installable, even through op=install (' + JSON.stringify(inst).slice(0, 90) + ')')
  assert(seam.runCalls.length === 0, 'no engine ran in either case')
}

// ---------- 6. timeout ⇒ MATH_TIMEOUT + the process is actually terminated ----------
section('6 timeout')
{
  const seam = makeSeam({ installed: { python: true }, hang: true })
  const h = makeHost(seam)
  const t0 = Date.now()
  const r = await h.callMath({ op: 'run', engine: 'python', mode: 'code', code: 'while True: pass\n', timeoutMs: 1000 })
  const ms = Date.now() - t0
  assert(r.ok === false && r.code === 'MATH_TIMEOUT' && r.timedOut === true,
    '★ a hanging engine ⇒ MATH_TIMEOUT with timedOut:true (' + JSON.stringify({ c: r.code, t: r.timedOut, ms }) + ')')
  assert(seam.state.terminated >= 1, '★ the process was KILLED (terminate called ' + seam.state.terminated + 'x)')
  assert(ms < 4000, 'the timeout is honoured (took ' + ms + 'ms)')
}

// ---------- 7. non-zero exit ----------
section('7 non-zero exit')
{
  const seam = makeSeam({ installed: { python: true }, runExit: 3, runStderr: 'division by zero\n' })
  const h = makeHost(seam)
  const r = await h.callMath({ op: 'run', engine: 'python', mode: 'code', code: '1/0\n' })
  assert(r.ok === false && r.code === 'MATH_NONZERO_EXIT' && r.exit === 3 && /division by zero/.test(r.stderr || ''),
    '★ exit 3 ⇒ MATH_NONZERO_EXIT{exit:3} with the stderr tail (' + JSON.stringify({ c: r.code, e: r.exit }) + ')')
  assert(seam.runCalls.length === 1, 'a failed run is NOT retried automatically')
}

// ---------- 8. oversized output: truncated in the shell, COMPLETE on disk -----------------------
section('8 oversized output')
{
  const seam = makeSeam({ installed: { python: true }, bigStdout: 200 * 1024 })
  const h = makeHost(seam)
  const r = await h.callMath({ op: 'run', engine: 'python', mode: 'code', code: 'print("x"*200000)\n' })
  assert(r.ok === true && r.truncated && r.truncated.stdout === true && r.warnings && r.warnings[0] && r.warnings[0].code === 'OUTPUT_TRUNCATED',
    '★ oversized stdout: ok:true + truncated.stdout + OUTPUT_TRUNCATED warning (' + JSON.stringify({ t: r.truncated, w: r.warnings && r.warnings[0] && r.warnings[0].code }) + ')')
  assert(String(r.stdout).length <= math.MATH_CAPS.stdout, 'the RETURN shell is capped at ' + math.MATH_CAPS.stdout + ' bytes')
  const disk = readFileSync(join(INST(h), r.receipt.dir, 'stdout.txt'), 'utf8')
  assert(disk.length > 64 * 1024 && disk.length === 200 * 1024,
    '★ the FULL output is on disk (' + disk.length + ' bytes) — the seam must not pre-truncate')
}

// ---------- 9. cli: default ON, and the two ways to disable it ----------------------------------
section('9 cli is a tool path: default on, disabled by mathMode or by the engine list')
{
  const seam = makeSeam({ installed: {}, resolveAll: true })
  const h = makeHost(seam)
  const r = await h.callMath({ op: 'run', engine: 'cli', mode: 'code', code: 'ignored-by-cli\n', cli: { command: 'my-tool', argv: ['--json', 'q'] } })
  assert(r.ok === true && r.engineInfo && r.engineInfo.name === 'cli:my-tool' && r.engineInfo.source === 'cli',
    '★ engine=cli runs by default and is recorded as cli:<command> (' + JSON.stringify(r.engineInfo) + ')')
  const cliCall = seam.runCalls[seam.runCalls.length - 1]
  assert(JSON.stringify(cliCall.argv) === JSON.stringify(['C:/fake/my-tool', '--json', 'q']),
    'cli argv is exactly [command, ...cli.argv] (' + JSON.stringify(cliCall.argv) + ')')
  assert(r.receipt && existsSync(join(INST(h), r.receipt.json)), 'a cli run still leaves a receipt (that is the difference from a bare shell)')
  const beforeTyped = seam.calls.length
  await h.callTool('vibe_v5_set', { mathMode: 'typed' })
  const rTyped = await h.callMath({ op: 'run', engine: 'cli', mode: 'code', code: 'x\n', cli: { command: 'my-tool', argv: [] } })
  assert(rTyped.ok === false && rTyped.code === 'MATH_REFUSED' && /mathMode|policy|禁用/.test(String(rTyped.message || '')),
    '★ mathMode=typed refuses engine=cli as a policy refusal (' + JSON.stringify({ c: rTyped.code, m: rTyped.message }) + ')')
  assert(seam.calls.length === beforeTyped, '★ the refused cli run executed NOTHING')
  await h.callTool('vibe_v5_set', { mathMode: 'typed+shell', mathEngines: ['python'] })
  const rNoCli = await h.callMath({ op: 'run', engine: 'cli', mode: 'code', code: 'x\n', cli: { command: 'my-tool', argv: [] } })
  assert(rNoCli.ok === false && rNoCli.code === 'MATH_REFUSED',
    '★ removing cli from mathEngines refuses it too (' + JSON.stringify(rNoCli).slice(0, 90) + ')')
  assert(seam.calls.length === beforeTyped, 'no call ran for either disable path')
  const rExpr = await h.callMath({ op: 'run', engine: 'cli', mode: 'expr', expr: '1+1', cli: { command: 'my-tool', argv: [] } })
  assert(rExpr.ok === false && rExpr.code === 'MATH_REFUSED', 'cli + mode=expr is refused')
  const rNoCmd = await h.callMath({ op: 'run', engine: 'cli', mode: 'code', code: 'x\n' })
  assert(rNoCmd.ok === false && rNoCmd.code === 'MATH_REFUSED', 'cli without cli.command is refused')
}

// ---------- 10. bad argv ⇒ MATH_ENGINE_BAD_ARGV with the argv + override hint -------------------
section('10 usage/option errors are diagnosable, not collapsed into NONZERO_EXIT')
{
  const seam = makeSeam({ installed: { maple: true }, badArgv: true })
  const h = makeHost(seam)
  const r = await h.callMath({ op: 'run', engine: 'maple', mode: 'code', code: 'x := 1;\n' })
  assert(r.ok === false && r.code === 'MATH_ENGINE_BAD_ARGV',
    '★ a usage/option error ⇒ MATH_ENGINE_BAD_ARGV, not a bare NONZERO_EXIT (' + r.code + ')')
  assert(r.next && r.next.kind === 'engine-override' && JSON.stringify(r.next.argv) === JSON.stringify(r.argv) && /mathEngineOverride/.test(String(r.message || '')),
    '★ next.kind=engine-override carries the EXACT argv + the mathEngineOverride hint (' + JSON.stringify(r.next && r.next.argv) + ')')
  const plain = makeHost(makeSeam({ installed: { python: true }, runExit: 3, runStderr: 'boom\n' }))
  const r2 = await plain.callMath({ op: 'run', engine: 'python', mode: 'code', code: '1/0\n' })
  assert(r2.code === 'MATH_NONZERO_EXIT', 'a plain non-zero exit is still MATH_NONZERO_EXIT (' + r2.code + ')')
}

// ---------- 11. no subprocess service ⇒ MATH_NO_SUBPROCESS (never a crash) -----------------------
section('11 a host without a subprocess service degrades honestly')
{
  // `resolveExecutable` works but `spawn` answers null: the module must map that to
  // MATH_NO_SUBPROCESS instead of throwing (engine=cli skips the version probe, so the run
  // stage is what is exercised).
  const h = makeHost(makeSeam({ resolveAll: true, noSpawn: true }))
  const r = await h.callMath({ op: 'run', engine: 'cli', mode: 'code', code: 'print(1)\n', cli: { command: 'my-tool', argv: [] } })
  assert(r.ok === false && r.code === 'MATH_NO_SUBPROCESS',
    '★ no subprocess service ⇒ MATH_NO_SUBPROCESS, not an exception (' + JSON.stringify(r) + ')')
}

// ---------- 12. params gating: mathComputation=off + mathTimeoutMs ------------------------------
section('12 mathComputation gates the whole tool')
{
  const seam = makeSeam({ installed: { python: true } })
  const h = makeHost(seam)
  await h.callTool('vibe_v5_set', { mathComputation: 'off' })
  const before = seam.calls.length   // ready() may already have probed while the default was auto
  const r = await h.callMath({ op: 'probe' })
  assert(r.ok === false && r.code === 'MATH_NOT_AVAILABLE' && r.next && r.next.kind === 'enable',
    '★ mathComputation=off ⇒ MATH_NOT_AVAILABLE + an enable hint (' + JSON.stringify(r).slice(0, 110) + ')')
  assert(seam.calls.length === before, 'nothing ran while the tool is off')
  await h.callTool('vibe_v5_set', { mathComputation: 'auto' })
  const r2 = await h.callMath({ op: 'probe' })
  assert(r2.ok === true, 'turning it back on re-enables the tool')
}

// ---------- 13. install is two-step; system scope only when explicit; audit on disk -----------
section('13 op=install: plan → confirm, user scope by default, never remembered')
{
  const seam = makeSeam({ installed: { python: true } })
  const h = makeHost(seam)
  // Only the PACKAGE MANAGER calls matter here (session start already probed the engines).
  const pkgCalls = () => seam.calls.filter((c) => c.argv.indexOf('numpy') !== -1)
  const plan = await h.callMath({ op: 'install', engine: 'python', packages: ['numpy'] })
  assert(plan.ok === true && typeof plan.planToken === 'string' && plan.planToken.length >= 16 && plan.plan && plan.plan.scope === 'user',
    '★ op=install without confirm returns a PLAN + planToken (scope user by default) (' + JSON.stringify({ t: plan.planToken && plan.planToken.slice(0, 8), s: plan.plan && plan.plan.scope }) + ')')
  assert(pkgCalls().length === 0, '★ the dry-run installed NOTHING (zero package-manager calls)')
  assert(JSON.stringify(plan.plan.commands[0].argv).indexOf('--user') !== -1 && !/sudo|--scope machine/.test(JSON.stringify(plan.plan.commands)),
    'the user-scope plan uses the user install argv (' + JSON.stringify(plan.plan.commands[0].argv) + ')')
  const wrong = await h.callMath({ op: 'install', engine: 'python', packages: ['numpy'], confirm: 'deadbeef' })
  assert(wrong.ok === false && wrong.code === 'MATH_REFUSED' && pkgCalls().length === 0,
    '★ a mismatched planToken ⇒ MATH_REFUSED with zero calls (' + JSON.stringify(wrong).slice(0, 90) + ')')
  const done = await h.callMath({ op: 'install', engine: 'python', packages: ['numpy'], confirm: plan.planToken })
  assert(done.ok === true && done.executed === true && pkgCalls().length === 1,
    '★ the exact planToken executes the plan exactly once (' + JSON.stringify({ ok: done.ok, calls: pkgCalls().length }) + ')')
  const installCall = pkgCalls()[0]
  assert(JSON.stringify(installCall.argv) === JSON.stringify(plan.plan.commands[0].argv),
    'the executed argv is byte-for-byte the planned one')
  const auditPath = join(INST(h), 'Computation', 'installs', plan.planToken + '.json')
  assert(existsSync(auditPath), '★ an audit record is written to Computation/installs/<planToken>.json')
  const audit = JSON.parse(readFileSync(auditPath, 'utf8'))
  assert(audit.before !== undefined && audit.after !== undefined && audit.rollback && Array.isArray(audit.rollback.commands) &&
    audit.installed && JSON.stringify(audit.installed) === JSON.stringify(['numpy']) && audit.network === 'not-enforced-by-plugin',
    '★ the audit carries before/after, the uninstall commands, the package list and the network note')
  // system scope: only when named on THAT call, and it is never remembered.
  const sys = await h.callMath({ op: 'install', engine: 'python', packages: ['numpy'], scope: 'system' })
  assert(sys.ok === true && JSON.stringify(sys.plan.commands[0].argv).indexOf('--user') === -1 && !/sudo/.test(JSON.stringify(sys.plan.commands)),
    'scope=system is honoured only when explicitly given (' + JSON.stringify(sys.plan.commands[0].argv) + ')')
  const again = await h.callMath({ op: 'install', engine: 'python', packages: ['numpy'] })
  assert(JSON.stringify(again.plan.commands[0].argv).indexOf('--user') !== -1,
    '★ system scope is NOT remembered: the next call is user again')
}

// ---------- 14. prompts + persona: dynamic line, mode discipline, static tool line -----------
section('14 prompt + persona surfaces')
{
  const seam = makeSeam({ installed: { python: true } })
  const h = makeHost(seam)
  await h.callTool('vibe_v5_start', { problem: '数学计算提示词测试', researcherCount: 1 })
  await h.settleSpawns()
  const ask = async (member) => {
    await h.callTool('vibe_v5_say', { to: member, text: '请继续推进。' })
    const w = await h.nextWakeFor(member, 3000)
    if (!w) return ''
    h.fireEnd(w.childId, { progress: '收到。', solved: false, contextPct: 10 })
    await sleep(20)
    return w.text
  }
  const shellish = await ask('r-1')
  assert(/先 probe 再 run/.test(shellish) && /math_computation/.test(shellish),
    '★ the member prompt carries the availability line (' + JSON.stringify(shellish.slice(-200)) + ')')
  assert(shellish.includes(math.MATH_SHELL_RULE_LINE), 'mathMode=typed+shell advertises the shell fallback + its labelling rule')
  assert(/python 3\.11/.test(shellish), 'the line names the detected engine/version')
  await h.callTool('vibe_v5_set', { mathMode: 'typed' })
  const typed = await ask('r-1')
  assert(typed.includes('math_computation') && !typed.includes(math.MATH_SHELL_RULE_LINE),
    '★ mathMode=typed KEEPS the tool line but mentions NO shell fallback')
  await h.callTool('vibe_v5_set', { mathComputation: 'off' })
  const off = await ask('r-1')
  assert(!/math_computation/.test(off), '★ mathComputation=off means ZERO mention in the prompt')
  // persona: the frozen tool line, once per block (prefix + text).
  const yml = readFileSync(join(PRESET_DIR, 'agent.cordis.yml'), 'utf8')
  const occurrences = yml.split(math.MATH_PERSONA_TOOL_LINE).length - 1
  assert(occurrences === 2, '★ the persona carries MATH_PERSONA_TOOL_LINE in BOTH blocks (found ' + occurrences + ')')
  // P1 decision: no new /v5 subcommand ⇒ hint/usage stay untouched.
  const cmd = h.commandRegs.find((c) => c.name === 'v5')
  assert(cmd && !/math/i.test(String((cmd.input && cmd.input.hint) || '')), 'the /v5 hint was NOT touched by P1 (' + (cmd && cmd.input && cmd.input.hint) + ')')
}

// ---------- 15. P2a: scriptPath/scriptHash, append-only attempts, scriptChanged -----------------
section('15 P2a archive workflow: scriptPath/scriptHash, new attempt per re-run, persona rule')
{
  const seam = makeSeam({ installed: { python: true } })
  const h = makeHost(seam)
  const code = 'print(6*7)\n'
  const r0 = await h.callMath({ op: 'run', engine: 'python', mode: 'code', code })
  assert(!!r0.scriptPath && /^[0-9a-f]{64}$/.test(String(r0.scriptHash)) && r0.scriptPath === r0.receipt.dir + '/script.py',
    '★ mode=code exposes scriptPath + scriptHash (' + JSON.stringify({ p: r0.scriptPath, n: String(r0.scriptHash).slice(0, 8) }) + ')')
  const rec0 = JSON.parse(readFileSync(join(INST(h), r0.receipt.json), 'utf8'))
  assert(rec0.scriptPath === r0.scriptPath && rec0.scriptHash === r0.scriptHash,
    '★ the receipt carries the same scriptPath/scriptHash (evidence is re-checkable)')
  const disk = readFileSync(join(INST(h), r0.scriptPath), 'utf8')
  assert(createHash('sha256').update(disk).digest('hex') === r0.scriptHash,
    '★ scriptHash is literally the sha256 of the archived script bytes')
  // mode=file is keyed by PATH: editing the file and re-running stays on the same archive id but
  // lands in a NEW attempt (P2a append-only).
  mkdirSync(join(INST(h), 'Problems'), { recursive: true })
  const srcPath = join(INST(h), 'Problems', 'calc2.py')
  writeFileSync(srcPath, 'print(1)\n', 'utf8')
  const f1 = await h.callMath({ op: 'run', engine: 'python', mode: 'file', file: 'Problems/calc2.py' })
  writeFileSync(srcPath, 'print(2)\n', 'utf8')
  const f2 = await h.callMath({ op: 'run', engine: 'python', mode: 'file', file: 'Problems/calc2.py' })
  assert(f1.baseRunDir === f2.baseRunDir && f1.attemptDir !== f2.attemptDir && f2.attempt === 2,
    '★ an edited file re-run stays on the same archive id as a NEW attempt (' + JSON.stringify({ a1: f1.attemptDir, a2: f2.attemptDir, n: f2.attempt }) + ')')
  assert(f1.scriptChanged === false && f2.scriptChanged === true &&
    (f2.warnings || []).some((w) => w.code === 'SCRIPT_CHANGED_SINCE_LAST_RECEIPT'),
    '★ scriptChanged:true + SCRIPT_CHANGED_SINCE_LAST_RECEIPT (an old receipt never silently stands for new code)')
  assert(existsSync(join(INST(h), f1.attemptDir, 'receipt.json')) && existsSync(join(INST(h), f2.attemptDir, 'receipt.json')),
    'append-only: the first attempt is still on disk (never overwritten)')
  const f1rec = JSON.parse(readFileSync(join(INST(h), f1.attemptDir, 'receipt.json'), 'utf8'))
  assert(f1rec.scriptHash === f1.scriptHash && f1.scriptHash !== f2.scriptHash,
    'the two attempts record different script hashes')
  // persona: the workflow rule reaches BOTH blocks, in both languages.
  const yml = readFileSync(join(PRESET_DIR, 'agent.cordis.yml'), 'utf8')
  const zh = yml.split(math.MATH_ARCHIVE_WORKFLOW_LINE).length - 1
  const en = yml.split(math.MATH_ARCHIVE_WORKFLOW_LINE_EN).length - 1
  assert(zh === 2 && en === 2, '★ the persona carries the archive workflow rule in BOTH blocks (zh×' + zh + ', en×' + en + ')')
}

console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed > 0) { console.log('\nFAILURES:'); for (const f of failures) console.log('  - ' + f) }
process.exit(failed > 0 ? 1 : 0)
