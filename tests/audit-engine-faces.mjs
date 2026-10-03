#!/usr/bin/env node
/**
 * REAL-ENGINE FACES (task-3) — presence-detected, loud-SKIP guards for the three "engine faces" that the
 * scripted live validation could only sample: numeric (python/Rscript), Lean (lean), LaTeX (xelatex).
 *
 * Rules:
 *   · an engine that is NOT resolvable ⇒ print `SKIP: … (<reason>)` and do not fail (the gate must never
 *     be red on a machine without engines, and must never be silently green either);
 *   · an engine that IS resolvable ⇒ run it for real (real binary, real subprocess) and assert;
 *   · every assertion below has a SINGLE-SITE NAMED-RED proof reachable via `--self-probe` (env seams:
 *     MATH_COMPUTATION_MODULE / V4_PLUGIN / V5_PLUGIN point the child at a one-site mutant copy).
 *
 * Usage: node tests/audit-engine-faces.mjs [--self-probe]
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
let passed = 0, failed = 0
const failures = []
const skips = []
const ok = (cond, label, detail) => { if (cond) { passed++; console.log('  ok   ' + label) } else { failed++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')) } }
const skip = (face, reason) => { skips.push(face + ': ' + reason); console.log('  SKIP: no ' + face + ' on this machine (' + reason + ')') }
const read = (env, rel) => {
  const v = process.env[env]
  return readFileSync(v ? (resolve(REPO, v)) : join(REPO, rel), 'utf8')
}

/** Resolve an executable: absolute candidates first, then PATH (with Windows extensions). */
function which(cmd) {
  if (!cmd) return null
  if (/[\\/]/.test(cmd) || /^[A-Za-z]:/.test(cmd)) return existsSync(cmd) ? cmd : null
  const exts = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : ['']
  for (const dir of String(process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':')) {
    if (!dir) continue
    for (const ext of exts) {
      const p = join(dir, cmd + ext)
      try { if (existsSync(p) && statSync(p).isFile()) return p } catch (e) { /* keep looking */ }
    }
  }
  const w = spawnSync('where', [cmd], { encoding: 'utf8' })
  if (w.status === 0) { const first = String(w.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]; if (first && existsSync(first)) return first }
  return null
}
const resolveFirst = (...cmds) => { for (const c of cmds) { const p = which(c); if (p) return p } return null }

const PY = resolveFirst(String(process.env.LOCALAPPDATA || '') + '\\Programs\\Python\\Python312\\python.exe', 'python', 'python3')
const RC = resolveFirst('C:\\Program Files\\R\\R-4.6.1\\bin\\Rscript.exe', 'Rscript')
const LEAN = resolveFirst('D:\\.elan\\bin\\lean.exe', 'lean')
const XELATEX = resolveFirst('D:\\texlive\\2025\\bin\\windows\\xelatex.exe', 'xelatex')

// ── shared helpers ────────────────────────────────────────────────────────────────────────────────
/** A REAL subprocess service in the shape the presets expect (resolveExecutable/spawn/done/collected). */
function realSubprocess() {
  return {
    async resolveExecutable(cmd) { const p = which(cmd); if (!p) throw new Error('not found on PATH: ' + cmd); return p },
    spawn({ argv, cwd, stdio, graceMs }) {
      const child = spawn(argv[0], argv.slice(1), { cwd, windowsHide: true })
      let out = '', err = ''
      const cap = 1 << 20
      child.stdout.on('data', (d) => { if (out.length < cap) out += String(d) })
      child.stderr.on('data', (d) => { if (err.length < cap) err += String(d) })
      const done = new Promise((res) => {
        child.on('error', (e) => res({ exitCode: null, signal: null, error: String((e && e.message) || e) }))
        child.on('close', (code, signal) => res({ exitCode: code, signal: signal || null }))
      })
      return {
        done,
        terminate() { try { child.kill('SIGKILL') } catch (e) { /* best effort */ } },
        collected: { stdout: { readFrom: () => ({ text: out }) }, stderr: { readFrom: () => ({ text: err }) } },
      }
    },
  }
}
/** Minimal cordis-shaped ctx (modeled on tests/audit-tool-exec.mjs, but with a REAL subprocess). */
const FS_TRACE = []
function makeCtx(WS) {
  const regs = []
  const ctx = {
    get(n) { if (n === 'subprocess') return realSubprocess(); return undefined },
    on() {}, effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    tools: { register(spec) { regs.push(spec) } },
    commands: { register() {} },
    timeout(fn, ms) { const t = setTimeout(fn, ms); return () => clearTimeout(t) },
    subagents: { list() { return ['spawn'] }, async startContinuable() { return { childId: 'c1' } }, async sendMessage() {}, async followup() {}, interrupt() {} },
    agents: { roots() { return [] }, get() { return undefined } },
    fs: {
      async resolve(rel, o) { const s = String(rel); const abs = isAbsolute(s) ? s : join((o && o.cwd) || WS, ...s.split('/')); FS_TRACE.push('resolve:' + abs + ' exists=' + existsSync(abs)); return abs },
      async stat(t) { FS_TRACE.push('stat:' + t + ' exists=' + existsSync(t)); try { return statSync(t).isDirectory() ? { type: 'directory' } : { type: 'file' } } catch (e) { return undefined } },
      async readText(t) { FS_TRACE.push('readText:' + t); return readFileSync(t, 'utf8') },
      async writeText(t, c) { mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c, 'utf8') },
      async listDir(t) { try { return readdirSync(t, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) } catch (e) { return [] } },
    },
  }
  return { ctx, regs }
}
async function registeredTool(presetRel, name, WS) {
  const { ctx, regs } = makeCtx(WS)
  // `resolve`, not `join`: a seam value may be an ABSOLUTE path, and join(REPO, abs) mangles it.
  const mod = await import(pathToFileURL(resolve(REPO, presetRel)).href + '?t=' + Date.now())
  ;(mod.default || mod).apply(ctx)
  return regs.find((s) => s.name === name) || null
}
const parse = (raw) => { try { return JSON.parse(String(raw)) } catch (e) { return { __unparsed: String(raw).slice(0, 300) } } }

// ── FACE 1: numeric (python / Rscript) — real binaries, real subprocess ───────────────────────────
console.log('=== FACE 1: numeric engines (real binaries) ===')
if (!PY && !RC) {
  skip('numeric engine', 'neither python nor Rscript resolved (PATH + known absolute locations checked)')
} else {
  const WS = mkdtempSync(join(tmpdir(), 'engine-num-'))
  try {
    const M = await import(pathToFileURL(process.env.MATH_COMPUTATION_MODULE ? resolve(REPO, process.env.MATH_COMPUTATION_MODULE) : join(REPO, 'vibe-math-v2/math-computation.js')).href + '?t=' + Date.now())
    const engines = []
    if (PY) engines.push('python')
    if (RC) engines.push('r')
    const handlers = {}
    const host = {
      register: (name, desc, schema, fn) => { handlers[name] = fn },   // the host registers the tool handler
      params: () => ({ mathEngines: engines.slice(), mathMode: 'typed+shell', mathTimeoutMs: 60000, mathPackages: [], mathInstallScope: 'user' }),
      projectRoot: () => WS,
      exists: async (rel) => existsSync(resolve(WS, rel)) || existsSync(rel),
      readText: async (rel) => { try { return readFileSync(resolve(WS, rel), 'utf8') } catch (e) { return undefined } },
      writeText: async (rel, text) => { const abs = resolve(WS, rel); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, text, 'utf8'); return abs },
      resolveExecutable: async (cmd) => which(cmd) || undefined,
      // NOTE the contract difference: the MODULE's host `spawn` returns a plain result
      // ({exit,timedOut,killed,ms,stdout,stderr}), while the PRESET's ctx subprocess service returns a
      // handle ({done,terminate,collected}). Both are exercised here, each in its own shape.
      spawn: async ({ argv, cwd, timeoutMs, stdoutCap, stderrCap }) => {
        const t0 = Date.now()
        const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', timeout: Math.max(1000, Number(timeoutMs) || 60000), maxBuffer: 8 << 20, windowsHide: true })
        return {
          exit: r.status === null ? null : r.status,
          timedOut: !!(r.error && r.error.code === 'ETIMEDOUT'),
          killed: false,
          ms: Date.now() - t0,
          stdout: String(r.stdout || '').slice(0, Number(stdoutCap) || undefined),
          stderr: String(r.stderr || '').slice(0, Number(stderrCap) || undefined),
        }
      },
      listDirAbs: async (abs) => { try { return readdirSync(abs, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) } catch (e) { return [] } },
      runtimeRoots: async () => [],
      log: () => {},
    }
    M.registerMathComputation(host)
    const call = (args) => handlers[M.MATH_TOOL_NAME](args, { id: 'probeProj', session: { id: 'S', header: { cwd: WS } } })
    for (const eng of engines) {
      const p = await call({ op: 'probe', engine: eng })
      const entry = (p.engines || []).find((e) => e.name === eng)
      ok(!!entry && Array.isArray(p.configured) && p.configured.indexOf(eng) !== -1 && ['path', 'host-runtime', 'known-install'].indexOf(entry.foundVia) !== -1,
        '★ engine-faces numeric(' + eng + '): probe reports `configured` and a valid `foundVia` (' + String(entry && entry.foundVia) + ')')
      const code = eng === 'python' ? 'print(6*7)\n' : 'cat(6*7)\n'
      const r = await call({ op: 'run', engine: eng, mode: 'code', code: code })
      ok(r.ok === true && typeof r.runId === 'string' && r.runId && Number(r.attempt) >= 1 && r.exit === 0,
        '★ engine-faces numeric(' + eng + '): a real mode:\'code\' run returns runId/attempt/exit=0 (' + JSON.stringify({ runId: r.runId, attempt: r.attempt, exit: r.exit }) + ')')
      ok(String(r.stdout || '').indexOf('42') !== -1, '★ engine-faces numeric(' + eng + '): the real computation returned 42', JSON.stringify(String(r.stdout || '').slice(0, 80)))
    }
  } finally { rmSync(WS, { recursive: true, force: true }) }
}

// ── FACE 2: Lean — real lean through the REGISTERED tool handler ──────────────────────────────────
console.log('=== FACE 2: Lean (real toolchain; registered-handler contract) ===')
if (!LEAN) {
  skip('lean', 'lean did not resolve (PATH + D:\\.elan\\bin\\lean.exe checked)')
} else {
  const WS = mkdtempSync(join(tmpdir(), 'engine-lean-'))
  try {
    // (a) DIRECT real Lean run. The good/bad pair is its own control: the good file must exit 0 and the
    // wrong proof must exit non-zero with the toolchain's own error line. Written with Buffer.from(...,'utf8')
    // (NO BOM): PowerShell's Set-Content -Encoding utf8 writes a BOM and Lean answers "1:0: expected token".
    const good = 'theorem t : 1 + 1 = 2 := rfl\n'
    const bad = 'theorem t : 1 + 1 = 3 := rfl\n'
    writeFileSync(join(WS, 'Good.lean'), Buffer.from(good, 'utf8'))
    writeFileSync(join(WS, 'Bad.lean'), Buffer.from(bad, 'utf8'))
    const g = spawnSync(LEAN, [join(WS, 'Good.lean')], { encoding: 'utf8', windowsHide: true })
    ok(g.status === 0, '★ engine-faces lean: a correct one-line theorem compiles with the REAL toolchain (exit 0; ' + JSON.stringify(String(g.stdout || '').trim().slice(0, 60)) + ')')
    const b = spawnSync(LEAN, [join(WS, 'Bad.lean')], { encoding: 'utf8', windowsHide: true })
    const bMsg = String(b.stderr || '') + String(b.stdout || '')
    ok(b.status !== 0 && /error/i.test(bMsg),
      '★ engine-faces lean: a WRONG proof fails with the toolchain\'s own error (exit ' + String(b.status) + '; ' + JSON.stringify(bMsg.split('\n')[0].slice(0, 80)) + ')')
    // (b) the REGISTERED tool handler is reachable and enforces its NAMED path contract.
    const tool = await registeredTool(process.env.V4_PLUGIN || 'vibe-math-v4/vibe-math-v4.js', 'vibe_v4_lean_run', WS)
    ok(!!tool, '★ engine-faces lean: the registered tool \`vibe_v4_lean_run\` is reachable (spec found)')
    const agent = { id: 'S', options: {}, session: { id: 'S', header: { cwd: WS } } }
    const esc = parse(await tool.execute({ name: 'probeProj', file: '../../../../escape.lean' }, { agent }))
    ok(esc && esc.ok === false && esc.code === 'V4_INVALID_ARGUMENT',
      '★ engine-faces lean: the handler NAMES its path contract (an out-of-tree file ⇒ V4_INVALID_ARGUMENT; ' + JSON.stringify({ ok: esc && esc.ok, code: esc && esc.code }) + ')')
    console.log('  note: the handler\'s FILE-EXECUTION path is not reachable from a minimal ctx: workspaceRoot()')
    console.log('        reads the root agent (vibe-math-v4.js:338) and falls back to process.cwd() here, so the')
    console.log('        tool resolved the file under the repo tree. The real toolchain is exercised directly above;')
    console.log('        the handler contributes reachability + the named argument contract.')
  } finally { rmSync(WS, { recursive: true, force: true }) }
}

// ── FACE 3: LaTeX — real xelatex detection + named degradation ────────────────────────────────────
console.log('=== FACE 3: LaTeX (real xelatex detection + named degradation) ===')
if (!XELATEX) {
  skip('xelatex', 'xelatex did not resolve (PATH + D:\\texlive\\2025\\bin\\windows checked)')
} else {
  const WS = mkdtempSync(join(tmpdir(), 'engine-latex-'))
  try {
    const start = await registeredTool(process.env.V5_PLUGIN || 'vibe-math-v5/vibe-math-v5.js', 'vibe_v5_paper', WS)
    const setP = await registeredTool(process.env.V5_PLUGIN || 'vibe-math-v5/vibe-math-v5.js', 'vibe_v5_set', WS)
    ok(!!start, '★ engine-faces latex: the registered tool `vibe_v5_paper` is reachable (spec found)')
    const agent = { id: 'S', options: {}, session: { id: 'S', header: { cwd: WS } } }
    if (setP) { try { await setP.execute({ name: 'probeProj', params: { paperLatexCommand: XELATEX } }, { agent }) } catch (e) { /* fall through to the start assertion */ } }
    const r = parse(await start.execute({ name: 'probeProj' }, { agent }))
    ok(r && r.ok === true && r.started === true,
      '★ engine-faces latex: with an ABSOLUTE `paperLatexCommand` the paper entry starts directly (' + JSON.stringify({ ok: r && r.ok, started: r && r.started }) + ')')
    if (setP) { try { await setP.execute({ name: 'probeProj', params: { paperLatexCommand: 'Z:/definitely/not/here/xelatex.exe' } }, { agent }) } catch (e) { /* ignore */ } }
    const bad = parse(await start.execute({ name: 'probeProj' }, { agent }))
    ok(bad && typeof bad === 'object' && bad.ok === true && (bad.started === true || bad.code === undefined),
      '★ engine-faces latex: a NONEXISTENT `paperLatexCommand` neither crashes nor raises an error code (entry stays ok:true, code undefined) (' + JSON.stringify({ ok: bad && bad.ok, code: bad && bad.code, note: String(bad && bad.note || '').slice(0, 50) }) + ')')
    console.log('  note: the LaTeX COMPILE (paper writer subagent) is not reachable from this probe; it asserts the ENTRY only — crash-freedom and no error code. The named degradation for an unresolvable command is a COMPILE-time behaviour (docs/final-paper.md) and is deliberately NOT claimed here.')
  } finally { rmSync(WS, { recursive: true, force: true }) }
}

// ── --self-probe: one SINGLE-SITE named-red proof per face (env seams point a child at a mutant copy) ──
if (process.argv.includes('--self-probe')) {
  const { copyFileSync, cpSync } = await import('node:fs')
  const child = (env) => spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, env) })
  const namedIn = (out) => (label) => String(out).split('\n').filter((l) => /^\s*FAIL\b/.test(l)).some((l) => l.indexOf(label) !== -1)
  let probeBad = 0
  const cases = [
    { face: 'numeric', env: 'MATH_COMPUTATION_MODULE', file: 'vibe-math-v2/math-computation.js', from: 'runId: runId, attempt: attempt,', to: 'runIdX: runId, attempt: attempt,', label: 'engine-faces numeric', engines: [PY, RC] },
    { face: 'lean', env: 'V4_PLUGIN', file: 'vibe-math-v4/vibe-math-v4.js', from: 'if(norm!==root&&norm.indexOf(root+\'/\')!==0) return null', to: 'if(false) return null', label: 'engine-faces lean', engines: [LEAN] },
    { face: 'latex', env: 'V5_PLUGIN', file: 'vibe-math-v5/vibe-math-v5.js', from: 'ok: true, started: true, id: p.id,', to: 'ok: false, started: true, id: p.id,', label: 'engine-faces latex', engines: [XELATEX] },
  ]
  for (const c of cases) {
    if (!c.engines.some(Boolean)) { console.log('SELF-PROBE SKIP (' + c.face + '): the engine is absent, so the mutant cannot be exercised'); continue }
    const src = readFileSync(join(REPO, c.file), 'utf8')
    if (src.indexOf(c.from) === -1) { console.log('SELF-PROBE FAIL (' + c.face + '): anchor missing: ' + c.from); probeBad++; continue }
    // Copy the WHOLE source directory: the module/preset imports its siblings (math-engines.js,
    // math-computation.js, …), so a bare copy in a temp dir would crash instead of reddening.
    const dirRoot = mkdtempSync(join(tmpdir(), 'engine-mut-' + c.face + '-'))
    const dir = join(dirRoot, c.file.split('/')[0])
    cpSync(join(REPO, c.file.split('/')[0]), dir, { recursive: true })
    const dst = join(dir, c.file.split('/').pop())
    writeFileSync(dst, src.replace(c.from, c.to), 'utf8')
    const r = child({ [c.env]: dst })
    const out = String(r.stdout || '') + String(r.stderr || '')
    const named = namedIn(out)(c.label) && r.status !== 0
    console.log((named ? 'SELF-PROBE PASS' : 'SELF-PROBE FAIL') + ': the one-site ' + c.face + ' mutant reddens its named assertion')
    if (!named) for (const l of out.split('\n').filter((l) => /^\s*FAIL\b/.test(l)).slice(0, 3)) console.log('      child FAIL line: ' + l.trim().slice(0, 140))
    if (!named) probeBad++
    rmSync(dirRoot, { recursive: true, force: true })
  }
  console.log('')
  console.log('=== ENGINE FACES SELF-PROBE: ' + (cases.length - probeBad) + '/' + cases.length + ' as required ===')
  process.exit(probeBad === 0 ? 0 : 1)
}
console.log('')
console.log('=== ENGINE FACES: ' + passed + ' passed, ' + failed + ' failed, ' + skips.length + ' skipped ===')
for (const s of skips) console.log('  SKIPPED -> ' + s)
if (failed) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
