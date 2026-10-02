// ============================================================
// math_computation — v4 WIRING suite (P1)
//
// Scope: this preset's接线 only — parameter surface, the ONE registration, prompt injection and the
// host adapter (`spawn`/`resolveExecutable`/fs) driving the SHARED module. The module's own behaviour
// is covered by the integration owner's `tests/math-computation-shared.test.mjs`; here every engine is
// a FAKE driven through the plugin's injected `subprocess` seam, so nothing real is executed.
//
// Fake-engine seam (guards.md §3): `resolveExecutable` resolves the P1 candidate names to shim paths;
// `spawn` classifies each argv against `math-engines.js` (version / licence / package probe / run) and
// records the full argv, cwd and stdio caps, plus every `terminate()` call.
//
// Run: node tests/math-computation-v4.test.mjs
//   V4_PLUGIN=<path> points the suite at a MUTATED copy (used by the sensitivity probe).
//
// Mutants this suite must kill (each makes ≥1 assertion red):
//   M1 `default-engines-dropped` — drop 'cli' from `MATH_ENGINE_ORDER` in `vibe-math-v4/math-engines.js`
//      (the real source of the default engine list: v4's `DEFAULT_PARAMS.mathEngines` is only
//      `MATH_PARAM_DEFAULTS.mathEngines.slice()`; the old text also named `defaultOn`, which does not
//      exist anywhere in the tree — a phantom anchor, corrected per the anchor-hygiene rule): the
//      "cli is ON by default" assertions (§8) go red. Measured with the corrected site: 2 named reds.
//   M2 `typed-still-shell` — call mathAvailabilityLine without the mode (or force 'typed+shell'): §12
//      finds the shell-fallback sentence in the typed prompt → red.
//   M3 `timeout-no-kill` — return the timeout without calling terminate(): §5 asserts the terminate
//      count, so dropping the kill is red (not merely a reported MATH_TIMEOUT).
//   M4 `registration-dropped` — remove registerMathComputation (or register a different name): §1
//      finds no `math_computation` tool and the description/schema parity checks fail.
//   M5 `params-not-normalized` — normalizeParam returns the raw value for the six keys: §11 sees
//      `mathMode=bogus` / `mathTimeoutMs=5` / `mathEngines='python,cli'` survive verbatim → red.
// ============================================================
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute, basename, resolve as pathResolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// V4_PERSONA_YML points the persona assertions at a MUTATED persona file (sensitivity probe).
const PERSONA_YML = process.env.V4_PERSONA_YML ? pathResolve(process.env.V4_PERSONA_YML) : join(HERE, '..', 'vibe-math-v4', 'agent.cordis.yml')
const PLUGIN = process.env.V4_PLUGIN
  ? pathToFileURL(isAbsolute(process.env.V4_PLUGIN) ? process.env.V4_PLUGIN : join(HERE, '..', process.env.V4_PLUGIN))
  : pathToFileURL(join(HERE, '..', 'vibe-math-v4', 'vibe-math-v4.js'))
const PRESET_DIR = dirname(fileURLToPath(PLUGIN))
const MODULE = await import(pathToFileURL(join(PRESET_DIR, 'math-computation.js')).href)
const ENGINES_MOD = await import(pathToFileURL(join(PRESET_DIR, 'math-engines.js')).href)
const MATH_ENGINES = ENGINES_MOD.MATH_ENGINES

let passed = 0, failed = 0
const failures = []
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; failures.push(m); console.error('  FAIL - ' + m) } }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const section = t => console.log('\n[' + t + ']')
const promptOf = e => (e && e.blocks && e.blocks[0] && e.blocks[0].text) || ''
const readIf = p => (existsSync(p) ? readFileSync(p, 'utf8') : '')

// ===============================================================
// FAKE ENGINE SEAM + MOCK HOST
// ===============================================================
function makeSubprocess(state) {
  const base = c => String(c).split(/[\\/]/).pop().replace(/\.(cmd|exe|sh|bat)$/i, '')
  const executableFor = cmd => {
    const b = base(cmd)
    if (state.cliCommands.indexOf(String(cmd)) !== -1 || state.cliCommands.indexOf(b) !== -1) return 'X:/fake/bin/' + b
    const known = []
    for (const name of Object.keys(MATH_ENGINES)) { const cands = ENGINES_MOD.mathEngineCandidates(name); if (cands) for (const x of cands) known.push(x) }
    if (known.indexOf(b) === -1) throw new Error('not found: ' + cmd)
    if (state.installed.indexOf(b) === -1) throw new Error('not found: ' + cmd)
    return 'X:/fake/bin/' + b
  }
  const engineOf = argv => {
    const b = base(argv[0])
    for (const name of Object.keys(MATH_ENGINES)) {
      const cands = ENGINES_MOD.mathEngineCandidates(name)
      if (cands && cands.indexOf(b) !== -1) return MATH_ENGINES[name]
    }
    return null
  }
  const classify = argv => {
    const d = engineOf(argv)
    const rest = argv.slice(1).join(' ')
    if (!d) return 'run'
    if (d.versionArgv && rest === d.versionArgv.join(' ')) return 'version'
    if (d.licenseProbe && rest === d.licenseProbe.argv.join(' ')) return 'licence'
    if (d.probeCode && rest.indexOf(d.probeCode) !== -1) return 'packages'
    return 'run'
  }
  return {
    async resolveExecutable(cmd) {
      if (!state.subprocessAvailable) throw new Error('no subprocess')
      return executableFor(cmd)
    },
    spawn(spec) {
      const argv0 = String((spec.argv && spec.argv[0]) || '')
      if (/powershell|cmd\.exe|\/bin\/sh|(^|\/)sh$/i.test(argv0)) {
        state.shellCalls.push(String(spec.argv[spec.argv.length - 1] || ''))
        const empty = ''
        return {
          done: Promise.resolve({ exitCode: 0, signal: null }),
          collected: { stdout: { readFrom: () => ({ text: empty, nextOffset: 0, lossy: false }) }, stderr: { readFrom: () => ({ text: empty, nextOffset: 0, lossy: false }) } },
          terminate() {},
        }
      }
      state.spawns.push({ argv: spec.argv.slice(), cwd: spec.cwd, graceMs: spec.graceMs, stdoutCap: spec.stdio && spec.stdio.stdout && spec.stdio.stdout.maxBytes })
      const kind = classify(spec.argv)
      const collect = (stdout, stderr) => ({
        done: Promise.resolve({ exitCode: 0, signal: null }),
        collected: {
          stdout: { readFrom: () => ({ text: stdout, nextOffset: stdout.length, lossy: false }) },
          stderr: { readFrom: () => ({ text: stderr, nextOffset: stderr.length, lossy: false }) },
        },
        terminate() {},
      })
      const record = { kind }
      if (kind === 'version') return collect(base(spec.argv[0]) + ' ' + state.version + '\n', '')
      if (kind === 'licence') return collect(state.licensed ? '1\n' : '0\n', '')
      if (kind === 'packages') {
        const joined = spec.argv.join(' ')
        const pairs = []
        for (const p of Object.keys(state.packages)) if (joined.indexOf(p) !== -1) pairs.push(p + ':' + (state.packages[p] ? 'ok' : 'missing'))
        return collect(pairs.join('|') + '\n', '')
      }
      // run (also: the package-manager argv an approved install plan produces)
      if (state.hang) {
        return {
          done: new Promise(() => {}),
          collected: { stdout: { readFrom: () => ({ text: 'partial', nextOffset: 7, lossy: false }) }, stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) } },
          terminate() { state.terminated.push(spec.argv.join(' ')) },
        }
      }
      if (state.argError) {
        return {
          done: Promise.resolve({ exitCode: 2, signal: null }),
          collected: { stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) }, stderr: { readFrom: () => ({ text: state.argError, nextOffset: state.argError.length, lossy: false }) } },
          terminate() {},
        }
      }
      if (state.exit !== 0) {
        return {
          done: Promise.resolve({ exitCode: state.exit, signal: null }),
          collected: { stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) }, stderr: { readFrom: () => ({ text: 'boom\n', nextOffset: 5, lossy: false }) } },
          terminate() {},
        }
      }
      const out = state.stdoutBytes > 0 ? 'x'.repeat(state.stdoutBytes) : 'ran-ok\n'
      record.argv = spec.argv.slice()
      state.runs.push(record)
      // Defer/release hook (§16): the FIRST engine run is held INSIDE spawn until the test releases
      // it, so a second session's call can be driven to completion while the first is in flight.
      if (state.holdFirstRun) {
        state.holdFirstRun = false
        state.heldRuns++
        let release
        const gate = new Promise(r => { release = r })
        state.releaseFirst = () => release()
        return {
          done: gate.then(() => ({ exitCode: 0, signal: null })),
          collected: {
            stdout: { readFrom: () => ({ text: out, nextOffset: out.length, lossy: false }) },
            stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
          },
          terminate() {},
        }
      }
      return collect(out, '')
    },
  }
}

function makeHost(opts = {}) {
  const WS = mkdtempSync(join(tmpdir(), 'vibe-v4-math-'))
  const toolRegs = [], cmdRegs = [], spawns = [], followups = [], listeners = {}
  const state = {
    installed: (opts.installed === undefined ? ['python3', 'python'] : opts.installed).slice(),
    cliCommands: (opts.cliCommands || ['node']).slice(),
    packages: Object.assign({}, opts.packages || {}),
    licensed: opts.licensed !== false,
    version: opts.version || '1.2.3',
    exit: opts.exit === undefined ? 0 : opts.exit,
    hang: !!opts.hang,
    stdoutBytes: opts.stdoutBytes || 0,
    argError: opts.argError || null,
    subprocessAvailable: opts.subprocessAvailable !== false,
    resolveOnly: !!opts.resolveOnly,
    // audit-R2 lens-2 §19: these three WERE being passed by the test but dropped here, so the
    // fixture never reached `fs.listDir` and the retention assertion could not fire. A state
    // whitelist silently swallowing a fixture field is exactly the "test that cannot fail" trap.
    listDirEntries: opts.listDirEntries || null,
    noListDir: !!opts.noListDir,
    listDirCalls: [],
    spawns: [], terminated: [], runs: [], shellCalls: [], holdFirstRun: !!opts.holdFirstRun, heldRuns: 0, releaseFirst: null,
  }
  const subprocess = makeSubprocess(state)
  const subprocessSurface = state.resolveOnly ? { resolveExecutable: subprocess.resolveExecutable } : subprocess
  const ROOT = { id: 'sess-A', session: { id: 'sess-A', header: { cwd: WS, parentSession: undefined } } }
  // A SECOND root agent on the same ctx: v4 keys sessions by root agent id, so this is a second
  // session with its OWN `params` (audit C #2 needs two sessions in one plugin instance).
  const ROOT2 = { id: 'sess-B', session: { id: 'sess-B', header: { cwd: WS, parentSession: undefined } } }
  const ctx = {
    get(name) { return name === 'subprocess' && state.subprocessAvailable ? subprocessSurface : undefined },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
    tools: { register(s) { toolRegs.push(s) } },
    commands: { register(s) { cmdRegs.push(s) } },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label, request }) { const id = 'c' + (spawns.length + 1); spawns.push({ label, request, childId: id }); return { childId: id } },
      async sendMessage(parent, childId, blocks) { followups.push({ childId, blocks }) },
      async interrupt() {},
    },
    agents: { roots() { return [] }, get(id) { return id === 'sess-A' ? ROOT : (id === 'sess-B' ? ROOT2 : undefined) } },
    fs: {
      async resolve(rel, o) { const b = (o && o.cwd) || WS; return { targetKey: (typeof rel === 'string' && isAbsolute(rel)) ? rel.replace(/\//g, '\\') : join(b, ...String(rel).split('/')) } },
      async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
      async readText(t) { return readFileSync(t.targetKey, 'utf8') },
      async writeText(t, c) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8') },
      // `noListDir` removes the METHOD (not merely its result), so the plugin's conditional
      // pass-through can be exercised: the module must then never be given a listDir at all.
      ...(opts.noListDir ? {} : { async listDir(t) { state.listDirCalls.push(t && t.targetKey); if (state.listDirEntries) return state.listDirEntries; return [] } }),
    },
  }
  const projectRoot = join(WS, 'VibeMath', 'Projects', 'default')
  const h = {
    WS, ctx, state, ROOT, ROOT2, projectRoot, toolRegs, spawns, followups, cmdRegs, listeners,
    async cmd(rawInput) { const c = cmdRegs.find(x => x.name === 'v4'); if (!c) throw new Error('no /v4'); return await c.handler({ agent: ROOT, rawInput }) },
    async callTool(n, a, agent) { const s = toolRegs.find(x => x.name === n); if (!s) throw new Error('no tool ' + n); return JSON.parse(await s.execute(a || {}, { agent: agent || ROOT })) },
    async math(a) { return await h.callTool('math_computation', a) },
    async prompts(which, rId, arg) { return (await h.callTool('vibe_v4_prompts', Object.assign({ which, member: rId }, arg || {}))).text },
    resAgent: cid => ({ id: cid, session: { id: cid, header: { cwd: WS, parentSession: 'sess-A' } } }),
    ridOfChild(cid) { for (const sp of spawns) if (sp.childId === cid) return sp.label; return '' },
    childOf(rId) { for (const sp of spawns) if (sp.label === rId) return sp.childId; return '' },
    fireEnd(cid, reply) {
      const blocks = reply === undefined ? [] : [{ type: 'text', text: '```json\n' + JSON.stringify(reply) + '\n```' }]
      for (const fn of (listeners['subagent/end'] || [])) fn({ id: cid, runId: 'r', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: blocks })
    },
    cleanup() { try { rmSync(WS, { recursive: true, force: true }) } catch (e) { /* best effort */ } },
  }
  return h
}

async function mount(opts) {
  const h = makeHost(opts)
  const mod = await import(PLUGIN.href + '?t=' + Date.now() + Math.random())
  ;(mod.default || mod).apply(h.ctx)
  return h
}

/** Start a run so a session exists, then park the heartbeat (these tests drive calls explicitly). */
async function live(opts) {
  const h = await mount(opts)
  const before = h.spawns.length
  await h.callTool('vibe_v4_start', { problem: 'math_computation 接线验证', residentCount: 1 })
  for (let i = 0; i < 60 && h.spawns.length < before + 1; i++) await sleep(10)
  for (const sp of h.spawns.slice(before)) { h.fireEnd(sp.childId, { summary: '初始见解。', solved: false, contextPct: 10 }); await sleep(30) }
  await h.callTool('vibe_v4_set', { activityTimeoutMs: 600000 })
  for (let i = 0; i < 40; i++) { const s = await h.callTool('vibe_v4_status', {}); if (s.phase === 'active') break; await sleep(20) }
  return h
}

// ===============================================================
section('1 the tool is registered ONCE, with the shared module\'s description/schema')
{
  const h = await live()
  const keys = ["name", "description", "parameters", "execute"]
  const regs = h.toolRegs.filter(t => t.name === 'math_computation')
  assert(regs.length === 1, '★ math_computation is registered exactly once (FREEZE §4: host.register is called once)')
  assert(!!regs[0] && keys.every(k => k in regs[0]), 'the registration carries the {name,description,parameters,execute} shape')
  assert(regs[0].description === MODULE.MATH_TOOL_DESCRIPTION, '★ the description is the module\'s MATH_TOOL_DESCRIPTION verbatim (no local re-spelling)')
  assert(JSON.stringify(regs[0].parameters) === JSON.stringify(MODULE.MATH_TOOL_SCHEMA), '★ the parameters are the module\'s closed MATH_TOOL_SCHEMA verbatim')
  assert(regs[0].parameters.properties.op.enum.join(',') === 'probe,run,receipt,install', 'the op set is the frozen four')
  assert(regs[0].parameters.additionalProperties === false, 'the schema stays closed')
  const names = h.toolRegs.map(t => t.name)
  assert(names.indexOf('math_computation') !== -1 && names.filter(n => n === 'math_computation').length === 1, 'it appears once in the tool list (the tool-count snapshot +1)')
  // param visibility: paramsKeys is Object.keys(params) — the six keys must be there.
  const st = await h.callTool('vibe_v4_status', {})
  for (const k of MODULE.MATH_PARAM_NAMES) assert(st.paramsKeys.indexOf(k) !== -1, '★ status().paramsKeys exposes ' + k)
  // round-9 (F2): in a fresh workspace there is no paper state, so `paper.dir` is a PROJECTION - the
  // response must say so (reading status touches no fs and creates no directory).
  assert(!!st.paper, '* status.paper exists (the gate below must NOT silently skip its own assertions)')
  if (st.paper) {
    assert(st.paper.dirProjected === true && st.paper.dirSource === 'projection', '★ a fresh status labels paper.dir as a PROJECTION (not a real directory)')
    assert(st.paper.readSideEffect === false, '★ the paper view declares it has no read side effects')
    assert(!existsSync(join(h.projectRoot, 'Paper')), '★ merely reading status did NOT create Paper/')
  }
  // round-9 (P2/D4): the roster is single-sourced - `status` exposes a version that BUMPS whenever the
  // roster really changes (mid-flight add/remove is possible: removeMember reconciles in-flight work,
  // addMember has no verify/meeting gate), and the participant set is reported as a FROZEN snapshot.
  assert(typeof st.rosterVersion === 'number', '* status.rosterVersion is a number (the gate below must NOT silently skip its own assertions)')
  if (typeof st.rosterVersion === 'number') {
    assert(st.rosterVersion >= 0 && 'frozenParticipants' in st, '★ status exposes rosterVersion + the frozen participant set')
    const v0 = st.rosterVersion
    const hire = await h.callTool('vibe_v4_add_member', { direction: 'P2 roster-version assertion' })
    const st2 = await h.callTool('vibe_v4_status', {})
    assert(st2.rosterVersion > v0, '★ hiring mid-flight bumps rosterVersion (' + v0 + ' -> ' + st2.rosterVersion + ')')
    assert(st2.frozenParticipants === null || Array.isArray(st2.frozenParticipants), '★ with nothing frozen the field is explicitly null (not a stale set)')
    if (hire && hire.ok && hire.id) {
      await h.callTool('vibe_v4_remove_member', { id: hire.id })
      const st3 = await h.callTool('vibe_v4_status', {})
      assert(st3.rosterVersion > st2.rosterVersion, '★ firing mid-flight bumps rosterVersion too (' + st2.rosterVersion + ' -> ' + st3.rosterVersion + ')')
    }
  }
  h.cleanup()
}

// ===============================================================
section('2 op=probe: installed engines are detected, none ⇒ not available')
{
  const h = await live({ installed: ['python3', 'python', 'octave'] })
  const p = await h.math({ op: 'probe' })
  assert(p.ok === true && p.op === 'probe' && p.available === true, 'probe reports ok/available when an engine resolves')
  const py = p.engines.find(e => e.name === 'python')
  assert(!!py && py.version === '1.2.3' && /python/.test(py.path), '★ the version probe is parsed (python 1.2.3) and the path reported')
  assert(p.engines.some(e => e.name === 'octave'), 'every installed P1 engine is listed')
  assert(!p.engines.some(e => e.name === 'cli'), 'cli is never auto-detected (it needs a caller command)')
  h.cleanup()
  const h2 = await live({ installed: [] })
  const p2 = await h2.math({ op: 'probe' })
  assert(p2.ok === false && p2.code === 'MATH_ENGINE_NOT_FOUND' && p2.next && p2.next.kind === 'user-install', '★ nothing installed ⇒ MATH_ENGINE_NOT_FOUND + next.kind=user-install')
  assert(p2.next.perOs && Object.keys(p2.next.perOs).length >= 3 && Object.values(p2.next.perOs).every(v => !!v), '★ …with non-empty per-OS install commands')
  h2.cleanup()
}

// ===============================================================
section('3 op=run: argv assembly, cwd, receipt + argv echo, project file mode')
{
  const h = await live({ installed: ['python3', 'python'] })
  const r = await h.math({ op: 'run', engine: 'python', mode: 'expr', expr: '2**10' })
  assert(r.ok === true && r.engine === 'python' && r.exit === 0, 'a fake python run returns ok/exit 0')
  const sp = h.state.spawns[h.state.spawns.length - 1]
  const norm = p => String(p).replace(/\\/g, '/').replace(/\/$/, '')
  assert(norm(sp.cwd) === norm(h.projectRoot), '★ spawn cwd is the PROJECT root (' + JSON.stringify(sp.cwd) + ' vs ' + JSON.stringify(h.projectRoot) + ')')
  const runArgv = h.state.runs[h.state.runs.length - 1].argv
  assert(runArgv.length === 3 && runArgv[0] === 'X:/fake/bin/python3' && runArgv[1] === '-c' && runArgv[2] === '2**10', '★ mode=expr puts the expression in exactly ONE argv element (no shell quoting, no split)')
  assert(JSON.stringify(r.argv) === JSON.stringify(runArgv), '★ the return shell echoes the ACTUAL executed argv')
  assert(r.receipt && r.receipt.dir && existsSync(join(h.projectRoot, r.receipt.dir, 'receipt.json')), 'the receipt is archived under Computation/<id>/')
  const rec = JSON.parse(readIf(join(h.projectRoot, r.receipt.dir, 'receipt.json')))
  assert(JSON.stringify(rec.argv) === JSON.stringify(runArgv), '★ receipt.json.argv equals the executed argv element-by-element')
  assert(rec.preset === 'vibe-math-v4', '★ the receipt carries designator=vibe-math-v4')
  // mode=code: the script is materialised and its ABSOLUTE path is the last argv element
  const r2 = await h.math({ op: 'run', engine: 'python', mode: 'code', code: 'print(1+1)\n' })
  assert(r2.ok === true, 'mode=code runs')
  const argv2 = h.state.runs[h.state.runs.length - 1].argv
  assert(argv2.length === 2 && /\.py$/.test(argv2[1]) && isAbsolute(argv2[1]), '★ mode=code passes the script as an absolute path (one element)')
  assert(existsSync(argv2[1]) && /print\(1\+1\)/.test(readIf(argv2[1])), '★ the script file really exists on disk with the code (receipts are re-runnable)')
  // mode=file: an in-project file is allowed
  mkdirSync(join(h.projectRoot, 'tmp'), { recursive: true })
  writeFileSync(join(h.projectRoot, 'tmp', 'calc.py'), 'print(2+2)\n')
  const r3 = await h.math({ op: 'run', engine: 'python', mode: 'file', file: 'tmp/calc.py' })
  assert(r3.ok === true, 'mode=file with an in-project script runs')
  h.cleanup()
}

// ===============================================================
section('4 refusals: path escape, cli without command, cli+expr, policy, missing engine, no subprocess')
{
  const h = await live({ installed: ['python3', 'python'] })
  const esc = await h.math({ op: 'run', engine: 'python', mode: 'file', file: '../../../../etc/passwd' })
  assert(esc.ok === false && esc.code === 'MATH_REFUSED', '★ a file outside the project root is refused (MATH_REFUSED)')
  const esc2 = await h.math({ op: 'run', engine: 'python', mode: 'file', file: 'C:\\Windows\\evil.py' })
  assert(esc2.ok === false && esc2.code === 'MATH_REFUSED', '★ an absolute path is refused too')
  const noCmd = await h.math({ op: 'run', engine: 'cli', mode: 'code', code: 'echo hi\n' })
  assert(noCmd.ok === false && noCmd.code === 'MATH_REFUSED', '★ engine=cli without cli.command is refused')
  const cliExpr = await h.math({ op: 'run', engine: 'cli', mode: 'expr', expr: '1+1', cli: { command: 'node' } })
  assert(cliExpr.ok === false && cliExpr.code === 'MATH_REFUSED', '★ engine=cli + mode=expr is refused (cli has no eval template)')
  const before = h.state.spawns.length
  const notThere = await h.math({ op: 'run', engine: 'octave', mode: 'code', code: 'x=1\n' })
  assert(notThere.ok === false && notThere.code === 'MATH_ENGINE_NOT_FOUND', '★ a missing engine reports MATH_ENGINE_NOT_FOUND')
  // round-9 (real-engine): the guide is always per-OS; `command` itself is only offered when that
  // OS's package manager is actually resolvable (a command that cannot run is misleading).
  assert(notThere.next && notThere.next.kind === 'user-install' && notThere.next.perOs && notThere.next.perOs.windows, '★ …with per-OS user-install guidance (next.kind=user-install)')
  assert(notThere.next.packageManagerAvailable === false ? notThere.next.command === '' : typeof notThere.next.command === 'string', '★ command ⇔ package-manager availability (never a command that cannot run)')
  assert(h.state.spawns.length === before, 'a missing engine spawns nothing')
  // (a) no subprocess service at all ⇒ the host's capability flag short-circuits to
  //     MATH_NO_SUBPROCESS (not a misleading ENGINE_NOT_FOUND + "install python" guide)
  const h2 = await live({ installed: ['python3'], subprocessAvailable: false })
  const noSub = await h2.math({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' })
  assert(noSub.ok === false && noSub.code === 'MATH_NO_SUBPROCESS' && !!noSub.message, '★ a host with no subprocess service reports MATH_NO_SUBPROCESS (got ' + noSub.code + ')')
  const probeNoSub = await h2.math({ op: 'probe' })
  assert(probeNoSub.ok === false && probeNoSub.code === 'MATH_NO_SUBPROCESS', '★ …also for op=probe (the flag is checked before engine resolution)')
  h2.cleanup()
  // (b) a service that RESOLVES but cannot SPAWN ⇒ the module's MATH_NO_SUBPROCESS (the preset hands
  //     the module a null spawn result, which is its documented "host cannot execute" signal)
  const h3 = await live({ installed: ['python3'], cliCommands: ['node'], resolveOnly: true })
  const noSpawn = await h3.math({ op: 'run', engine: 'cli', mode: 'code', code: '1\n', cli: { command: 'node', argv: ['-e', '1'] } })
  assert(noSpawn.ok === false && noSpawn.code === 'MATH_NO_SUBPROCESS', '★ a host that resolves but cannot spawn reports MATH_NO_SUBPROCESS (got ' + noSpawn.code + ')')
  h3.cleanup(); h.cleanup()
}

// ===============================================================
section('5 timeout ACTIVELY terminates; non-zero exit is not success')
{
  const h = await live({ installed: ['python3', 'python'], hang: true })
  await h.callTool('vibe_v4_set', { mathTimeoutMs: 1000 })
  const t0 = Date.now()
  const r = await h.math({ op: 'run', engine: 'python', mode: 'code', code: 'while True: pass\n' })
  const dt = Date.now() - t0
  assert(r.ok === false && r.code === 'MATH_TIMEOUT' && r.timedOut === true, '★ a hanging engine reports MATH_TIMEOUT/timedOut')
  assert(h.state.terminated.length >= 1, '★ the timeout path really called handle.terminate() (an active kill, not a report)')
  assert(dt >= 900 && dt < 5000, 'the budget honoured mathTimeoutMs (elapsed ' + dt + 'ms)')
  h.cleanup()
  const h2 = await live({ installed: ['python3', 'python'], exit: 3 })
  const r2 = await h2.math({ op: 'run', engine: 'python', mode: 'code', code: 'boom\n' })
  assert(r2.ok === false && r2.code === 'MATH_NONZERO_EXIT' && r2.exit === 3, '★ a non-zero exit is MATH_NONZERO_EXIT{exit:3}, never ok:true')
  assert(/boom/.test(String(r2.stderr || '')) || /boom/.test(JSON.stringify(r2)), 'the stderr tail is returned')
  assert(r2.argv && r2.argv.length >= 2, '★ the failing call still echoes its argv (guards #19)')
  h2.cleanup()
}

// ===============================================================
section('6 oversized output: complete file on disk, truncated reply')
{
  const h = await live({ installed: ['python3', 'python'], stdoutBytes: 200 * 1024 })
  const r = await h.math({ op: 'run', engine: 'python', mode: 'code', code: 'print("x"*200000)\n' })
  assert(r.ok === true, 'a large-output run still succeeds')
  assert(r.truncated && r.truncated.stdout === true, '★ the REPLY is truncated (truncated.stdout:true)')
  assert(Array.isArray(r.warnings) && r.warnings.some(w => w.code === 'OUTPUT_TRUNCATED'), '★ …and warned (OUTPUT_TRUNCATED)')
  const outPath = join(h.projectRoot, r.receipt.dir, 'stdout.txt')
  assert(existsSync(outPath) && readFileSync(outPath, 'utf8').length >= 200 * 1024, '★ the COMPLETE output is archived on disk (>64KB), so the receipt is re-checkable')
  assert(h.state.spawns.some(s => s.stdoutCap >= 200 * 1024), '★ the preset passes the module\'s wide stdio cap through to the host (no silent 64KB collection loss)')
  h.cleanup()
}

// ===============================================================
section('7 commercial engine: licence probe gates it, never installable')
{
  const h = await live({ installed: ['matlab'], licensed: false })
  const r = await h.math({ op: 'run', engine: 'matlab', mode: 'expr', expr: '1+1' })
  assert(r.ok === false && r.code === 'MATH_ENGINE_LICENSE_REQUIRED', '★ an installed but unlicensed commercial engine reports LICENSE_REQUIRED')
  assert(r.next && r.next.kind === 'vendor' && /mathworks/.test(JSON.stringify(r.next)), '★ …with the vendor link (never an install plan)')
  const inst = await h.math({ op: 'install', engine: 'matlab', packages: ['x'], dryRun: true })
  assert(inst.ok === false && inst.code === 'MATH_REFUSED', '★ op=install on a commercial engine is REFUSED (the preset never installs it)')
  h.cleanup()
  const h2 = await live({ installed: ['matlab'], licensed: true })
  const ok = await h2.math({ op: 'run', engine: 'matlab', mode: 'expr', expr: '1+1' })
  assert(ok.ok === true, 'with a valid licence the same call runs')
  h2.cleanup()
}

// ===============================================================
section('8 cli engine: ON by default, and the two ways to disable it')
{
  const h = await live({ installed: ['python3', 'python'], cliCommands: ['node'] })
  const r = await h.math({ op: 'run', engine: 'cli', mode: 'code', code: '1+1\n', cli: { command: 'node', argv: ['-e', 'console.log(1+1)'] } })
  assert(r.ok === true, '★ engine=cli runs with the DEFAULT parameters')
  const argv = h.state.runs[h.state.runs.length - 1].argv
  // round-7 (finding 4 + live nuance): mode:'code' appends the archived script ONLY when the caller's
  // argv has no program slot. This fixture passes `-e console.log(1+1)`, i.e. the caller's argv RUNS
  // the code, so the script must NOT be appended (python/node would read it as an extra argument).
  assert(argv.length === 3 && argv[1] === '-e' && argv[2] === 'console.log(1+1)', '★ cli argv is [<resolved command>, ...cli.argv] when the caller argv already runs code (nothing shell-wrapped)')
  assert(r.cliScriptAppended === false, '★ the return shell reports cliScriptAppended=false for a caller-supplied program slot')
  // …and with NO program slot the archived script IS appended (the "run this code" flow).
  const r2 = await h.math({ op: 'run', engine: 'cli', mode: 'code', code: '1+1\n', cli: { command: 'node', argv: [] } })
  const argv2 = h.state.runs[h.state.runs.length - 1].argv
  assert(r2.ok === true && r2.cliScriptAppended === true && /script\.txt$/.test(String(argv2[argv2.length - 1])), '★ …while an empty caller argv gets the archived script appended (' + JSON.stringify(argv2) + ')')
  assert(String((r.engineInfo && r.engineInfo.name) || r.engine || '').indexOf('cli') === 0, '★ the engine is reported as cli:<command> (' + JSON.stringify(r.engineInfo && r.engineInfo.name) + ')')
  assert(r.receipt && r.receipt.dir, '★ a cli run still leaves a receipt (the difference from the host shell)')
  // (a) mathMode=typed refuses cli, with zero spawns
  await h.callTool('vibe_v4_set', { mathMode: 'typed' })
  const before = h.state.spawns.length
  const typed = await h.math({ op: 'run', engine: 'cli', mode: 'code', code: '1\n', cli: { command: 'node', argv: [] } })
  assert(typed.ok === false && typed.code === 'MATH_REFUSED' && String(typed.next && typed.next.reason) === 'policy', '★ mathMode=typed refuses engine=cli with reason=policy')
  assert(h.state.spawns.length === before, '★ …and spawns NOTHING (a policy refusal, not a late failure)')
  await h.callTool('vibe_v4_set', { mathMode: 'typed+shell' })
  // (b) removing cli from mathEngines refuses it too
  await h.callTool('vibe_v4_set', { mathEngines: ['python', 'octave'] })
  const before2 = h.state.spawns.length
  const notAllowed = await h.math({ op: 'run', engine: 'cli', mode: 'code', code: '1\n', cli: { command: 'node', argv: [] } })
  assert(notAllowed.ok === false && notAllowed.code === 'MATH_REFUSED', '★ removing cli from mathEngines refuses it as well')
  assert(h.state.spawns.length === before2, '★ …also with zero spawns')
  h.cleanup()
}

// ===============================================================
section('9 bad-argv is NOT collapsed into NONZERO_EXIT')
{
  const h = await live({ installed: ['maple'], argError: "Error, unknown option '-q'\n" })
  const r = await h.math({ op: 'run', engine: 'maple', mode: 'expr', expr: '1+1' })
  assert(r.ok === false && r.code === 'MATH_ENGINE_BAD_ARGV', '★ a usage/option error exits as MATH_ENGINE_BAD_ARGV (not plain NONZERO_EXIT)')
  assert(r.next && r.next.kind === 'engine-override', '★ next.kind=engine-override (an actionable hint)')
  assert(JSON.stringify(r.next.argv) === JSON.stringify(h.state.spawns[h.state.spawns.length - 1].argv), '★ next.argv is the ACTUAL argv (what the receipt records)')
  assert(/mathEngineOverride/.test(String(r.message || '')), '★ the message names mathEngineOverride')
  h.cleanup()
  const h2 = await live({ installed: ['python3', 'python'], exit: 3 })
  const plain = await h2.math({ op: 'run', engine: 'python', mode: 'code', code: 'x\n' })
  assert(plain.code === 'MATH_NONZERO_EXIT', 'control: a plain non-zero exit stays MATH_NONZERO_EXIT (the branches are distinct)')
  h2.cleanup()
}

// ===============================================================
section('10 package pre-check: found continues, missing stops before running')
{
  const h = await live({ installed: ['python3', 'python'], packages: { numpy: true } })
  const ok = await h.math({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n', packages: ['numpy'] })
  const pkgJson = JSON.stringify(ok.packages || {})
  assert(ok.ok === true && pkgJson.indexOf('numpy') !== -1 && !/null|missing/.test(pkgJson), '★ a present package continues and is reported as usable (' + pkgJson + ')')
  h.cleanup()
  const h2 = await live({ installed: ['python3', 'python'], packages: { sympy: false } })
  const before = h2.state.runs.length
  const miss = await h2.math({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n', packages: ['sympy'] })
  assert(miss.ok === false && miss.code === 'MATH_MISSING_PACKAGES', '★ a missing package reports MATH_MISSING_PACKAGES')
  assert(!!miss.packages && !!miss.packages.found && miss.packages.found.sympy === null, '★ the missing list names the package (found.sympy === null)')
  assert(miss.next && miss.next.kind === 'agent-install', '★ …and offers the agent-install path (plan → confirm)')
  assert(h2.state.runs.length === before, '★ the script is NOT executed when a package is missing (guards #2)')
  h2.cleanup()
}

// ===============================================================
section('11 op=install: plan → confirm, no auto-install, audit record')
{
  const h = await live({ installed: ['python3', 'python'], packages: { sympy: false } })
  const before = h.state.spawns.length
  const plan = await h.math({ op: 'install', engine: 'python', packages: ['sympy'], dryRun: true })
  assert(plan.ok === true && plan.plan && typeof plan.planToken === 'string' && plan.planToken.length >= 8, '★ op=install dryRun returns a plan + planToken')
  assert(h.state.spawns.length === before, '★ the plan installs NOTHING (zero spawns)')
  const wrong = await h.math({ op: 'install', engine: 'python', packages: ['sympy'], confirm: 'not-the-token' })
  assert(wrong.ok === false && wrong.code === 'MATH_REFUSED', '★ a wrong token is refused')
  assert(h.state.spawns.length === before, '★ …with zero spawns')
  const done = await h.math({ op: 'install', engine: 'python', packages: ['sympy'], confirm: plan.planToken })
  assert(done.ok === true, '★ the correct token executes the plan exactly once')
  assert(h.state.spawns.length === before + 1, '★ exactly one package-manager invocation (no retry)')
  const audit = readIf(join(h.projectRoot, 'Computation', 'installs', plan.planToken + '.json'))
  assert(!!audit && /"scope"/.test(audit) && /"manager"/.test(audit), '★ the audit record is written under Computation/installs/<token>.json')
  h.cleanup()
}

// ===============================================================
section('12 parameters: six keys normalized, visible, and switched through both surfaces')
{
  const h = await live({ installed: ['python3', 'python'], cliCommands: ['node'] })
  const setSpec = h.toolRegs.find(t => t.name === 'vibe_v4_set')
  for (const k of MODULE.MATH_PARAM_NAMES) assert(!!setSpec.parameters.properties[k], '★ vibe_v4_set advertises ' + k)
  assert(setSpec.parameters.additionalProperties === false, 'the set schema stays closed')
  assert(JSON.stringify(setSpec.parameters.properties.mathMode.enum) === JSON.stringify(['typed+shell', 'typed']), 'mathMode is a closed enum in the schema')
  // string coercion through the SLASH-COMMAND surface (raw strings)
  const c = await h.cmd('set mathMode=typed mathTimeoutMs=5 mathPackages=a,b mathEngines=python,cli')
  assert(c.kind === 'success', '/v4 set accepted the six math keys')
  const st = await h.callTool('vibe_v4_status', {})
  assert(/mathMode=typed/.test(st.params), '★ mathMode=typed survived the string surface')
  assert(/mathTimeoutMs=1000/.test(st.params), '★ mathTimeoutMs=5 was clamped by the shared normalizer (1000)')
  assert(/mathPackages=a,b/.test(st.params), '★ the comma string became an array')
  assert(/mathEngines=python,cli/.test(st.params), '★ mathEngines=python,cli became a filtered array')
  // invalid values degrade to the module defaults (never to something stronger)
  await h.callTool('vibe_v4_set', { mathMode: 'bogus', mathComputation: 'nonsense', mathInstallScope: 'root' })
  const st2 = await h.callTool('vibe_v4_status', {})
  assert(/mathMode=typed\+shell/.test(st2.params), '★ an unknown mathMode degrades to typed+shell')
  assert(/mathComputation=auto/.test(st2.params) && /mathInstallScope=user/.test(st2.params), '★ unknown enums degrade to the defaults')
  // mathComputation=off is a TRUE no-op: the tool refuses and no prompt line appears
  await h.callTool('vibe_v4_set', { mathComputation: 'off' })
  const off = await h.math({ op: 'probe' })
  assert(off.ok === false && off.code === 'MATH_NOT_AVAILABLE', '★ mathComputation=off makes the tool a no-op (MATH_NOT_AVAILABLE)')
  const offPrompt = await h.prompts('normal', 'r-1')
  assert(!/先 probe 再 run/.test(offPrompt) && !/math_computation/.test(offPrompt), '★ …and injects NO prompt line at all')
  h.cleanup()
}

// ===============================================================
section('13 prompt surface: zh + en availability lines, typed drops the shell fallback')
{
  const h = await live({ installed: ['python3', 'python'] })
  await h.callTool('vibe_v4_set', { mathMode: 'typed+shell' })
  const normal = await h.prompts('normal', 'r-1')
  assert(/先 probe 再 run/.test(normal), '★ the Chinese availability line reaches the round prompt')
  assert(/未经工具归档/.test(normal), '★ …including the shell-fallback rule (mathMode=typed+shell)')
  assert(/Probe first, then run/.test(normal) && /not tool-archived/.test(normal), '★ the English variant is injected as well (v4 prompts are bilingual)')
  assert(/归档即引用/.test(normal) && /不得把计算结果当成/.test(normal), '★ the rule lines include 归档即引用 and the "not a proof" rule')
  const hb = await h.prompts('heartbeat', 'r-1')
  assert(/先 probe 再 run/.test(hb), 'the heartbeat prompt also carries the line')
  await h.callTool('vibe_v4_set', { mathMode: 'typed' })
  const typed = await h.prompts('normal', 'r-1')
  assert(/先 probe 再 run/.test(typed), 'the availability line is still there in typed mode')
  assert(!/未经工具归档/.test(typed) && !/not tool-archived/.test(typed), '★ mathMode=typed injects NO shell-fallback sentence in either language (prompts.md §4-5)')
  const typedHb = await h.prompts('heartbeat', 'r-1')
  assert(!/未经工具归档/.test(typedHb) && !/not tool-archived/.test(typedHb), '★ …and the heartbeat prompt is consistent with the mode too')
  h.cleanup()
}

// ===============================================================
section('14 persona: both text blocks carry the frozen tool line (byte-identical)')
{
  const yml = readIf(PERSONA_YML)
  const line = MODULE.MATH_PERSONA_TOOL_LINE
  const hits = yml.split(line).length - 1
  assert(hits === 2, '★ MATH_PERSONA_TOOL_LINE appears verbatim in BOTH persona blocks (found ' + hits + ')')
  const first = yml.indexOf('- math_computation {op:')
  assert(first !== -1 && yml.indexOf('- math_computation {op:', first + 1) !== -1, 'the two occurrences are in the two blocks (prefix + text)')
}

// ===============================================================
section('15 P2a: scriptPath/scriptHash, the archive→edit→re-run workflow, and the persona rule')
{
  const h = await live({ installed: ['python3', 'python'] })
  // ① mode=code: the archived script original + its hash are in the return AND the receipt
  const r1 = await h.math({ op: 'run', engine: 'python', mode: 'code', code: 'print(41+1)\n' })
  assert(r1.ok === true && typeof r1.scriptPath === 'string' && r1.scriptPath.length > 0, '★ mode=code returns scriptPath (the archived script original)')
  assert(/^[0-9a-f]{64}$/.test(String(r1.scriptHash || '')), '★ …and scriptHash (sha256 of the archived code)')
  const rec1rel = join(h.projectRoot, r1.receipt.dir, 'receipt.json')
  const rec1 = JSON.parse(readIf(rec1rel))
  assert(rec1.scriptPath === r1.scriptPath && rec1.scriptHash === r1.scriptHash, '★ the receipt carries the same scriptPath/scriptHash (re-runnable evidence)')
  assert(rec1.attempt === 1 && rec1.attemptDir === r1.receipt.dir, '★ attempt 1 archives into Computation/<id>/ (attemptDir = the run dir)')
  // ② mode=file: edit the SAME source file and re-run ⇒ a NEW attempt + an explicit warning
  mkdirSync(join(h.projectRoot, 'tmp'), { recursive: true })
  const src = join(h.projectRoot, 'tmp', 'workflow.py')
  writeFileSync(src, 'print(1)\n')
  const f1 = await h.math({ op: 'run', engine: 'python', mode: 'file', file: 'tmp/workflow.py' })
  assert(f1.ok === true && f1.attempt === 1, 'precondition: the first mode=file run is attempt 1')
  const firstDir = f1.receipt.dir, firstHash = f1.scriptHash
  writeFileSync(src, 'print(2)\n')   // the agent edits the archived/original code
  const f2 = await h.math({ op: 'run', engine: 'python', mode: 'file', file: 'tmp/workflow.py' })
  assert(f2.ok === true, 'the edited script re-runs')
  assert(f2.receipt.dir !== firstDir && f2.attempt === 2 && /attempts\/2$/.test(String(f2.receipt.dir)), '★ the re-run is exactly attempt 2 in a NEW directory (append-only: attempts/<n>), never an overwrite (' + f2.receipt.dir + ')')
  assert(f2.scriptChanged === true, '★ scriptChanged:true — the receipt for the current code differs from the previous one')
  assert(!!f2.previousReceipt && String(f2.previousReceipt.scriptHash) === String(firstHash), '★ the RETURN SHELL also carries previousReceipt{runId,attempt,scriptHash} (not only the receipt file)')
  assert(Array.isArray(f2.warnings) && f2.warnings.some(w => w.code === 'SCRIPT_CHANGED_SINCE_LAST_RECEIPT'), '★ warnings carry SCRIPT_CHANGED_SINCE_LAST_RECEIPT')
  assert(String(f2.scriptHash) !== String(firstHash), '★ the new attempt records the NEW scriptHash')
  const rec2 = JSON.parse(readIf(join(h.projectRoot, f2.receipt.dir, 'receipt.json')))
  assert(rec2.previousReceipt && String(rec2.previousReceipt.scriptHash) === String(firstHash) && rec2.previousReceipt.attempt === 1 && !!rec2.previousReceipt.runId, '★ the attempt-2 receipt records previousReceipt{runId,attempt,scriptHash} pointing at attempt 1 (the old evidence is explicitly superseded)')
  assert(existsSync(join(h.projectRoot, firstDir, 'receipt.json')) && existsSync(join(h.projectRoot, f2.receipt.dir, 'receipt.json')), '★ BOTH receipts stay on disk (the old one is not deleted or rewritten)')
  // ③ the persona rule is in BOTH blocks, in both languages
  const yml = readIf(PERSONA_YML)
  for (const [name, line] of [['zh', MODULE.MATH_ARCHIVE_WORKFLOW_LINE], ['en', MODULE.MATH_ARCHIVE_WORKFLOW_LINE_EN]]) {
    const hits = yml.split(line).length - 1
    assert(hits === 2, '★ the ' + name + ' archive-workflow rule appears verbatim in BOTH persona blocks (found ' + hits + ')')
  }
  // …and the dynamic availability line carries it too (the module appends it)
  const prompt = await h.prompts('normal', 'r-1')
  assert(prompt.indexOf(MODULE.MATH_ARCHIVE_WORKFLOW_LINE.trim()) !== -1, '★ the injected availability line carries the archive-workflow rule as well')
  h.cleanup()
}

// ===============================================================
section('16 audit C #2: per-session module instances — two sessions are fully isolated (v5 structure)')
{
  // `holdFirstRun` defers the FIRST engine run inside the subprocess seam, so the test can prove
  // isolation with a REAL interleaving: A is mid-flight while B runs to completion.
  const h = await live({ installed: ['python3', 'python', 'octave'], holdFirstRun: true })
  const setA = await h.callTool('vibe_v4_set', { mathEngines: ['python'], mathMode: 'typed+shell' }, h.ROOT)
  const setB = await h.callTool('vibe_v4_set', { mathEngines: ['octave'], mathMode: 'typed' }, h.ROOT2)
  assert(setA.ok === true && setB.ok === true, 'precondition: both sessions accepted their own math parameters')
  const stA = await h.callTool('vibe_v4_status', {}, h.ROOT)
  const stB = await h.callTool('vibe_v4_status', {}, h.ROOT2)
  assert(/mathEngines=python(,|$)/.test(stA.params) && /mathEngines=octave(,|$)/.test(stB.params), 'precondition: the two sessions really hold different allow-lists (' + stA.params.match(/mathEngines=[^,]*/)[0] + ' vs ' + stB.params.match(/mathEngines=[^,]*/)[0] + ')')
  // A starts and is HELD inside spawn ...
  const pa = h.callTool('math_computation', { op: 'run', engine: 'auto', mode: 'code', code: 'print("A")\n' }, h.ROOT)
  for (let i = 0; i < 400 && !h.state.releaseFirst; i++) await sleep(5)
  assert(!!h.state.releaseFirst && h.state.heldRuns === 1, 'precondition: session A\'s engine run is held inside the subprocess seam')
  // ... B completes WHILE A is still in flight (no cross-session blocking, no shared slot)
  const rb = await h.callTool('math_computation', { op: 'run', engine: 'auto', mode: 'code', code: 'print("B")\n' }, h.ROOT2)
  assert(rb.ok === true && rb.engine === 'octave', '★ B completed with its OWN engine (octave) while A was held (' + rb.engine + ')')
  h.state.releaseFirst()
  const ra = await pa
  assert(ra.ok === true && ra.engine === 'python', '★ A resumed and still used its OWN engine (python), unaffected by B\'s in-flight call (' + ra.engine + ')')
  assert(ra.receipt.dir !== rb.receipt.dir, '★ the two calls archived into DIFFERENT run dirs (each session its own evidence): ' + ra.receipt.dir + ' vs ' + rb.receipt.dir)
  const recA = JSON.parse(readIf(join(h.projectRoot, ra.receipt.dir, 'receipt.json')))
  const recB = JSON.parse(readIf(join(h.projectRoot, rb.receipt.dir, 'receipt.json')))
  assert(JSON.stringify(recA.engine).indexOf('python') !== -1 && JSON.stringify(recB.engine).indexOf('octave') !== -1, '★ each receipt records its OWN engine (no "current session" slot to clobber)')
  assert(JSON.stringify(recA.argv).indexOf('python') !== -1 && JSON.stringify(recB.argv).indexOf('octave') !== -1, '★ each receipt echoes its own argv')
  const engineSpawns = h.state.spawns.filter(s => /python|octave/.test(String(s.argv[0])))
  const norm = p => String(p).replace(/\\/g, '/').replace(/\/$/, '')
  // round-7: EXECUTION spawns use the session's project root; DISCOVERY probes (version/licence) use
  // a guaranteed-to-exist cwd instead, because on a brand-new session that root does not exist yet.
  const versionSpawns = engineSpawns.filter(s => s.argv.indexOf('--version') !== -1)
  const execSpawns = engineSpawns.filter(s => s.argv.indexOf('--version') === -1)
  assert(execSpawns.length >= 2 && execSpawns.every(s => norm(s.cwd) === norm(h.projectRoot)), '★ every engine EXECUTION spawn went through its own session\'s project-root accessor (' + execSpawns.length + ' spawns, cwd=' + norm(execSpawns[0] && execSpawns[0].cwd) + ')')
  assert(versionSpawns.length > 0 && versionSpawns.every(s => norm(s.cwd) !== norm(h.projectRoot)), '★ discovery/version probes use a guaranteed cwd, never the (possibly missing) project root (' + versionSpawns.length + ' probes)')
  // Session B is in `typed` mode; session A must not inherit that policy either.
  const cliA = await h.callTool('math_computation', { op: 'run', engine: 'cli', mode: 'code', code: '1\n', cli: { command: 'node', argv: [] } }, h.ROOT)
  assert(cliA.code !== 'MATH_REFUSED' || !/typed/.test(String(cliA.message || '')), '★ session A is NOT in B\'s typed mode (cli refusal is not inherited)')
  h.cleanup()
}


// ===============================================================
section('19 audit R2 lens-2: listDir wiring (per-project retention) + no-listDir skip')
{
  const h = await live({ installed: ['python3', 'python'], listDirEntries: Array.from({ length: 201 }, (_, i) => ({ name: 'vibe-math-v4-proj-' + i, type: 'directory' })) })
  const r = await h.math({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' })
  assert(r.ok === true, 'the run still succeeds with listDir wired')
  assert(Array.isArray(r.warnings) && r.warnings.some(w => w.code === 'ARCHIVE_RETENTION_EXCEEDED'), '★ >200 run dirs under Computation/ ⇒ ARCHIVE_RETENTION_EXCEEDED (the per-project retention warning is reachable in v4)')
  const rec = JSON.parse(readIf(join(h.projectRoot, r.receipt.dir, 'receipt.json')))
  assert(Array.isArray(rec.warnings) && rec.warnings.some(w => w.code === 'ARCHIVE_RETENTION_EXCEEDED'), '★ …and it is recorded in the receipt')
  h.cleanup()
  const h2 = await live({ installed: ['python3', 'python'], noListDir: true })
  const r2 = await h2.math({ op: 'run', engine: 'python', mode: 'code', code: 'print(2)\n' })
  assert(r2.ok === true && !(r2.warnings || []).some(w => w.code === 'ARCHIVE_RETENTION_EXCEEDED'), '★ with NO listDir the per-project check is skipped entirely (no warning)')
  // The field must be ABSENT, not merely empty-returning: the module only calls it when present.
  assert(h2.state.listDirCalls.length === 0, '★ with NO listDir the module never queries the host at all (0 listDir calls)')
  assert(h.state.listDirCalls.length >= 1, 'with listDir wired the retention check does query the host (>=1 call)')
  h2.cleanup()
}

// ===============================================================
section('20 round-3: the archive DIRECTORIES really exist on disk (host creates missing parents)')
{
  // The real host's text write creates missing parents (dsh-fs-local `writeFileAtomic` runs
  // `mkdir(dirname, {recursive:true})`), so the module never has to mkdir. What this pins is the
  // OBSERVABLE result: after a run the archive directory and its attempt chain exist as directories.
  const h = await live({ installed: ['python3', 'python'] })
  const r = await h.math({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' })
  assert(r.ok === true, 'the run succeeds')
  const abs = (rel) => join(h.projectRoot, ...String(rel).split('/'))
  // round-4 item 3: `abs('')` is the project root, which would satisfy a bare existsSync+isDirectory
  // check - so pin the SHAPE first (a real archive path, and the same dir the receipt reference uses).
  assert(r.attemptDir.indexOf('Computation/') !== -1, '★ attemptDir is a real archive path (contains Computation/)')
  assert(r.attemptDir === r.receipt.dir, '★ attemptDir === receipt.dir (directory and receipt reference agree)')
  assert(existsSync(abs(r.attemptDir)) && statSync(abs(r.attemptDir)).isDirectory(), '★ Computation/<runId>/ exists as a DIRECTORY after the run')
  assert(existsSync(abs(r.scriptPath)) && statSync(abs(r.scriptPath)).isFile(), '★ the archived script exists on disk')
  const r2 = await h.math({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' })
  assert(r2.attempt === 2 && existsSync(abs(r2.attemptDir)) && statSync(abs(r2.attemptDir)).isDirectory(), '★ the second attempt creates Computation/<runId>/attempts/2/ as a DIRECTORY (parents included)')
  assert(existsSync(abs(r.attemptDir)), 'the first attempt directory is untouched')
  h.cleanup()
}



// ===============================================================
section('21 round-6 A: substitution-honesty rule in BOTH persona blocks AND in the injected line')
{
  const yml = readIf(PERSONA_YML)
  const zh = MODULE.MATH_SUBSTITUTION_RULE_LINE
  const en = MODULE.MATH_SUBSTITUTION_RULE_LINE_EN
  assert(!!zh && !!en, 'the shared module exports MATH_SUBSTITUTION_RULE_LINE and _EN')
  for (const [lang, line] of [['zh', zh], ['en', en]]) {
    const hits = yml.split(line).length - 1
    assert(hits === 2, '★ the ' + lang + ' substitution rule appears verbatim in BOTH persona blocks (found ' + hits + ')')
  }
  assert(/替代必须声明（诚实性）/.test(yml) && /Declare substitutions \(honesty\)/.test(yml), 'the rule is present in both languages in the persona')
  const h = await live({ installed: ['python3', 'python'] })
  const prompt = await h.prompts('normal', 'r-1')
  assert(prompt.indexOf(String(zh).trim()) !== -1, '★ the injected availability line carries the ZH substitution rule')
  assert(prompt.indexOf(String(en).trim()) !== -1, '★ the injected availability line carries the EN substitution rule')
  h.cleanup()
}

// ===============================================================
console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
process.exit(0)
