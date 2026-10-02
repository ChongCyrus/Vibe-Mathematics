// Fake host seam for the math_computation shared module (integration owner).
//
// Purpose: drive `registerMathComputation(host)` with NO real engine and NO real subprocess, so
// every branch (probe / run / receipt / install, all 11 failure codes, timeout, truncation, argv
// echo, bad-argv) is testable on a machine with nothing installed. Owner suites that test a
// PRESET's wiring use the preset's own injected subprocess service instead; this seam tests the
// shared module itself.
//
// Lives under tests/helpers/ so the flat `*.mjs` scan in tests/run-tests.mjs does not treat it as
// a suite (it only reads files directly inside tests/).
import { createHash } from 'node:crypto'

export const FAKE_ROOT = 'X:/fake/project'

const VERSION_MARKERS = ['--version', 'disp(version)', '$Version']
const LICENCE_MARKERS = ["disp(license('test','MATLAB'))", 'printf("1")', 'Print[$LicenseType]']
const PACKAGE_MARKERS = ['importlib.util', 'requireNamespace', "pkg('list')", 'find_package', "license('test'", 'with(', 'Needs[']

export function makeFakeHost(opts = {}) {
  const installed = (opts.installed || ['python3', 'python', 'Rscript', 'octave', 'julia', 'matlab', 'maple', 'wolframscript']).slice()
  const engineFor = (cmd) => {
    const base = String(cmd).split(/[\\/]/).pop()
    const map = { python3: 'python', python: 'python', py: 'python', Rscript: 'r', R: 'r', octave: 'octave', 'octave-cli': 'octave', julia: 'julia', matlab: 'matlab', maple: 'maple', wolframscript: 'wolfram', WolframKernel: 'wolfram', math: 'wolfram' }
    if (map[base]) return map[base]
    for (const name of Object.keys(map)) if (base.indexOf(name) === 0) return map[name]
    return null
  }
  const files = new Map(Object.entries(opts.files || {}))
  const state = {
    files,
    registrations: [],
    spawns: [],
    listDirCalls: [],
    logs: [],
    version: opts.version || '1.2.3',
    packages: Object.assign({}, opts.packages || {}), // { name: 'present' | 'missing' | null }
    licence: opts.licence !== false,
    exit: opts.exit === undefined ? 0 : opts.exit,
    hang: !!opts.hang,
    hangProbe: !!opts.hangProbe,
    versionProbeFails: !!opts.versionProbeFails,
    // round-7: the real host intermittently answers a spawn with NULL early in a session. The first
    // `nullSpawnTimes` spawns return null so a test can prove the retry recovers from it.
    nullSpawnTimes: Number(opts.nullSpawnTimes) || 0,
    // round-7 (live root cause): the real host answers a spawn whose cwd does NOT exist with
    // `spawned:true, exit:null` (retries cannot help). `projectRoot` can be pointed at a
    // non-existent path to emulate a FRESH workspace.
    projectRoot: opts.projectRoot || '/fake/project',
    freshRoot: opts.projectRoot || null,
    // round-7: null answers ONLY for package probes (classify === 'packages'), so a test can isolate
    // "the precheck could not run" from "the engine could not be probed".
    packageProbeNullTimes: Number(opts.packageProbeNullTimes) || 0,
    stdoutBytes: opts.stdoutBytes || 0,
    argError: opts.argError || null,
    probeCalls: 0,
  }

  const classify = (argv) => {
    const joined = argv.join(' ')
    if (LICENCE_MARKERS.some((m) => joined.indexOf(m) !== -1)) return 'licence'
    if (PACKAGE_MARKERS.some((m) => joined.indexOf(m) !== -1)) return 'packages'
    if (VERSION_MARKERS.some((m) => joined.indexOf(m) !== -1)) return 'version'
    return 'run'
  }

  const host = {
    register(name, description, parameters, handler) {
      state.registrations.push({ name, description, parameters, handler })
    },
    params: () => (typeof opts.params === 'function' ? opts.params() : (opts.params || {})),
    projectRoot: () => state.freshRoot || opts.root || FAKE_ROOT,
    designator: opts.designator || 'vibe-math-v2',
    writeText: async (rel, text) => { files.set(String(rel).replace(/\\/g, '/'), String(text)); state.rootCreated = true; return true },
    // Optional capability flag (INTERFACE-FREEZE §4): a host that knows it has no subprocess service
    // says so, and the module reports MATH_NO_SUBPROCESS instead of a misleading ENGINE_NOT_FOUND.
    hasSubprocess: ('hasSubprocess' in opts) ? (() => opts.hasSubprocess) : undefined,
    readText: async (rel) => { const v = files.get(String(rel).replace(/\\/g, '/')); return v === undefined ? undefined : v },
    exists: async (rel) => files.has(String(rel).replace(/\\/g, '/')),
    // Optional DSH-fs-like listing (real API: ctx.fs.resolve + listDir, entries {name,type}).
    // Present only when the test asks for it, so "no listDir => no project-level retention check"
    // is testable.
    listDir: ('listDir' in opts) ? (async (rel) => {
      state.listDirCalls.push(String(rel))
      if (typeof opts.listDir === 'function') return opts.listDir(rel)
      return (opts.listDir || []).slice()
    }) : undefined,
    // round-7 (fix 2): OPTIONAL bundled-runtime discovery. `runtimeRoots` are absolute roots and
    // `absTree` maps an absolute directory to its entries, so a test can fake DSH's layout
    // (`<root>/dsh-runtimes/<tree>/dependencies/python/python.exe`).
    runtimeRoots: ('runtimeRoots' in opts) ? (async () => (opts.runtimeRoots || [])) : undefined,
    // round-B (F4): OPTIONAL per-engine install roots. When supplied, the module uses THESE instead of
    // this process's environment, so a test never depends on the ambient machine's %ProgramFiles% /
    // %LOCALAPPDATA% (or on which engines the developer happens to have installed).
    installRoots: opts.installRoots ? (async (engine) => (opts.installRoots[engine] || [])) : undefined,
    listDirAbs: opts.absTree ? (async (abs) => (opts.absTree[String(abs).replace(/\\/g, '/')] || [])) : undefined,
    resolveExecutable: async (cmd) => {
      if (opts.resolveThrows) throw new Error('resolve failed: ' + cmd)
      const raw = String(cmd)
      const base = raw.split(/[\\/]/).pop()
      // round-6 (B): an explicit path map lets a test place the interpreter in a conda-style
      // directory or next to a `uv` binary - the manager dispatch reads those facts.
      if (opts.resolveMap && Object.prototype.hasOwnProperty.call(opts.resolveMap, base)) return opts.resolveMap[base]
      // A caller-supplied path (engine='cli') is accepted as-is: that is the whole point of the
      // escape hatch - the tool only has to resolve the command, not know the engine.
      if (raw.indexOf('/') !== -1 || raw.indexOf('\\') !== -1) return raw
      let ok = installed.indexOf(base) !== -1
      if (!ok && opts.cliCommands && opts.cliCommands.indexOf(base) !== -1) ok = true
      if (!ok) throw new Error('not found: ' + cmd)
      return '/fake/bin/' + base
    },
    spawn: async ({ argv, cwd, timeoutMs, stdoutCap, stderrCap }) => {
      if (state.nullSpawnTimes > 0) { state.nullSpawnTimes--; state.spawns.push({ argv: argv.slice(), cwd, timeoutMs, stdoutCap, stderrCap, nullSpawn: true }); return null }
      state.spawns.push({ argv: argv.slice(), cwd, timeoutMs, stdoutCap, stderrCap })
      // Emulate the real host: a spawn whose cwd does not exist answers with exit:null. Note the
      // host's writeText creates parent directories (writeFileAtomic), so a RUN (which writes the
      // receipt first) legitimately makes the project root exist before it spawns.
      if (state.freshRoot && !state.rootCreated && String(cwd) === String(state.freshRoot)) return { exit: null, timedOut: false, killed: false, ms: 130, stdout: '', stderr: '' }
      const kind = classify(argv)
      if (kind === 'packages' && state.packageProbeNullTimes > 0) { state.packageProbeNullTimes--; state.spawns[state.spawns.length - 1].nullSpawn = true; return null }
      if (kind === 'version') {
        if (state.hangProbe) return { exit: null, timedOut: true, killed: true, ms: timeoutMs, stdout: '', stderr: '' }
        // round-7: a DETERMINISTIC probe failure (engine resolved, probe exits non-zero, no version).
        if (state.versionProbeFails) return { exit: 1, timedOut: false, killed: false, ms: 5, stdout: '', stderr: 'probe boom' }
        const exeName = String(argv[0] || 'engine').split(/[\\/]/).pop()
        return { exit: 0, timedOut: false, killed: false, ms: 5, stdout: exeName + ' ' + state.version + '\n', stderr: '' }
      }
      if (kind === 'licence') {
        if (!state.licence) return { exit: 1, timedOut: false, killed: false, ms: 5, stdout: '0\n', stderr: '' }
        return { exit: 0, timedOut: false, killed: false, ms: 5, stdout: '1\n', stderr: '' }
      }
      if (kind === 'packages') {
        const pairs = []
        const joined = argv.join(' ')
        for (const name of Object.keys(state.packages)) {
          if (joined.indexOf(name) === -1) continue
          const v = state.packages[name]
          const present = (v === true || v === 'present' || v === 'ok')
          pairs.push(name + ':' + (present ? 'ok' : 'missing'))
        }
        return { exit: 0, timedOut: false, killed: false, ms: 5, stdout: pairs.join('|') + '\n', stderr: '' }
      }
      // run
      if (state.hang) return { exit: null, timedOut: true, killed: true, ms: timeoutMs, stdout: 'partial', stderr: '' }
      if (state.argError) return { exit: 2, timedOut: false, killed: false, ms: 9, stdout: '', stderr: state.argError }
      // P2a: simulate "another member edits the source while this run is in flight".
      if (opts.mutateOnRun && opts.mutateOnRun.rel) files.set(String(opts.mutateOnRun.rel).replace(/\\/g, '/'), String(opts.mutateOnRun.text == null ? '' : opts.mutateOnRun.text))
      // Audit-A: simulate the source being DELETED mid-run (a change, not "no change").
      if (opts.deleteOnRun && opts.deleteOnRun.rel) files.delete(String(opts.deleteOnRun.rel).replace(/\\/g, '/'))
      const out = state.stdoutBytes > 0 ? 'x'.repeat(state.stdoutBytes) : 'ran-ok\n'
      if (state.exit !== 0) return { exit: state.exit, timedOut: false, killed: false, ms: 9, stdout: '', stderr: 'boom' }
      return { exit: 0, timedOut: false, killed: false, ms: 9, stdout: out, stderr: '' }
    },
    log: (kind, msg) => { state.logs.push({ kind, msg }) },
  }

  state.handler = () => state.registrations[0] && state.registrations[0].handler
  state.call = async (args) => {
    const reg = state.registrations[0]
    if (!reg) throw new Error('makeFakeHost: nothing registered yet - call registerMathComputation(host) first')
    return await reg.handler(args)
  }
  state.file = (rel) => files.get(String(rel).replace(/\\/g, '/'))
  state.engineFor = engineFor
  return state.__host ? state : Object.assign(state, { host })
}

export function sha256(s) { return createHash('sha256').update(String(s)).digest('hex') }
