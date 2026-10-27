// vmu G1 — the LOCAL SPAWN FALLBACK (rules ledger G1 "计算与工具"; docs/26 ROUND 82).
//
// WHY THIS TEST EXISTS: on every live run so far the math surface refused `VMU_ENGINE_UNAVAILABLE` because the
// DSH host exposes no `subprocess` service. The refusal is honest, but it also means "计算与工具" was unreachable
// in practice even though Python 3.12 is on the machine. The fix has TWO halves and this file pins both:
//   · silence keeps the conservative named refusal (a deployment that declared nothing gets no invented mechanism);
//   · a caller that DECLARED computation (the math adapter is only built when `vmu.math.*` is declared) may ask for
//     the `node:child_process` fallback, with the SAME guards (executable required, args array, cwd policy, caps,
//     killable handle, a budget that really terminates) and an explicit `seamKind` on every result.
// The seam is exercised as an injected seam: real child processes (node itself), no Lean, no host.

import { strict as assert } from 'node:assert'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const m = await import(pathToFileURL(join(ROOT, 'vibe-math-vmu', 'host-spawn.js')).href)

let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) }
  else { failed++; console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + String(detail))) }
}
const refused = async (fn) => { try { await fn(); return null } catch (e) { return e } }

const NODE = process.execPath
const noService = { get: () => null }

// ---- 1. SILENCE STAYS A NAMED REFUSAL (the default must not change) ------------------------------------------
{
  const seam = m.createHostSpawn({ ctx: noService, defaultCwd: null })
  const e = await refused(() => seam({ file: NODE, args: ['-e', 'console.log(1)'] }))
  ok(e && e.code === 'VMU_ENGINE_UNAVAILABLE', 'no service + no localFallback ⇒ VMU_ENGINE_UNAVAILABLE (unchanged)', e && e.code)
  ok(seam.seamKindOf() === null, 'and seamKindOf() says null: there is no mechanism, and the receipt can say so', seam.seamKindOf())
}

// ---- 2. THE FALLBACK REALLY RUNS A CHILD, AND NAMES ITSELF ----------------------------------------------------
{
  const seam = m.createHostSpawn({ ctx: noService, defaultCwd: null, localFallback: true })
  ok(seam.seamKindOf() === 'local-child-process', 'seamKindOf() = local-child-process when the host has no service', seam.seamKindOf())
  const out = await seam({ file: NODE, args: ['-e', 'process.stdout.write("hello-local")'] })
  ok(out && out.exitCode === 0 && out.code === 0, 'a real child process exits 0', out && { exitCode: out.exitCode, code: out.code })
  ok(out && out.stdout === 'hello-local', '★ its stdout is collected (the math surface is a text consumer)', out && out.stdout)
  ok(out && out.seamKind === 'local-child-process', '★ the RESULT says which mechanism ran, not only the status face', out && out.seamKind)
  ok(out && out.timedOut === false && out.signal === null, 'and it is not reported as a timeout', out && { timedOut: out.timedOut, signal: out.signal })
}

// ---- 3. A NON-ZERO EXIT IS A RESULT, NOT A THROW (the engine probes rely on reading `exit`) -------------------
{
  const seam = m.createHostSpawn({ ctx: noService, defaultCwd: null, localFallback: true })
  const out = await seam({ file: NODE, args: ['-e', 'process.stderr.write("bad"); process.exit(3)'] })
  ok(out && out.exitCode === 3, 'a non-zero exit code survives as a value', out && out.exitCode)
  ok(out && out.stderr === 'bad', 'and stderr is collected separately', out && out.stderr)
}

// ---- 4. THE GUARDS ARE THE HOST PATH'S GUARDS ------------------------------------------------------------------
{
  const seam = m.createHostSpawn({ ctx: noService, defaultCwd: null, localFallback: true })
  const missingExe = await refused(() => seam({ args: ['--version'] }))
  ok(missingExe && missingExe.code === 'VMU_INVALID_ARGUMENT', 'no executable ⇒ VMU_INVALID_ARGUMENT (never argv[0]="--version")', missingExe && missingExe.code)
  const badArgs = await refused(() => seam({ file: NODE, args: { a: 1 } }))
  ok(badArgs && badArgs.code === 'VMU_INVALID_ARGUMENT', 'non-array args ⇒ VMU_INVALID_ARGUMENT (a tool argument must not kill the host)', badArgs && badArgs.code)
  const inline = await refused(() => seam({ file: NODE, inline: 'console.log(1)' }))
  ok(inline && inline.code === 'VMU_INVALID_ARGUMENT', 'inline text ⇒ refused: this seam spawns files, not evaluated text', inline && inline.code)
}

// ---- 5. ENOENT IS NAMED, WITH `commandNotFound` (the engine probe reads this) ----------------------------------
{
  const seam = m.createHostSpawn({ ctx: noService, defaultCwd: null, localFallback: true })
  const e = await refused(() => seam({ file: 'vmu-definitely-no-such-program-xyz', args: [] }))
  ok(e && e.code === 'VMU_ENGINE_UNAVAILABLE', 'a program that is not on this machine ⇒ VMU_ENGINE_UNAVAILABLE', e && e.code)
  ok(e && e.commandNotFound === true, '★ and commandNotFound:true (not only a message)', e && e.commandNotFound)
  ok(e && e.seamKind === 'local-child-process', 'the refusal names the mechanism too', e && e.seamKind)
}

// ---- 6. THE BUDGET REALLY TERMINATES THE PROCESS ---------------------------------------------------------------
{
  const seam = m.createHostSpawn({ ctx: noService, defaultCwd: null, localFallback: true })
  const t0 = Date.now()
  const out = await seam({ file: NODE, args: ['-e', 'setTimeout(() => {}, 60000)'], timeoutMs: 150 })
  const ms = Date.now() - t0
  ok(out && out.timedOut === true, 'a budget expiry is reported as timedOut:true', out && out.timedOut)
  ok(ms < 5000, '★ and it did NOT wait for the child: the process was killed (' + ms + ' ms)', ms)
  ok(out && out.killed === 'budget', 'the killed-by field names the budget (a kill is recorded, not implied)', out && out.killed)
}

// ---- 7. THE HANDLE IS KILLABLE (the job faces cancel through it) ----------------------------------------------
{
  const seam = m.createHostSpawn({ ctx: noService, defaultCwd: null, localFallback: true })
  let handle = null
  const out = await seam({ file: NODE, args: ['-e', 'setTimeout(() => {}, 60000)'] }, (h) => { handle = h; setTimeout(() => h.terminate(), 120) })
  ok(handle && typeof handle.terminate === 'function' && typeof handle.pid === 'number', 'onHandle receives a real handle with a pid and terminate()', handle && { pid: handle.pid, keys: Object.keys(handle) })
  ok(out && out.timedOut === false && out.killed === 'terminate', 'terminate() ends the run and the record says terminate (not a timeout)', out && { timedOut: out.timedOut, killed: out.killed })
}

// ---- 8. OUTPUT CAPS ARE REAL (a too-small cap truncates and COUNTS) -------------------------------------------
{
  const seam = m.createHostSpawn({ ctx: noService, defaultCwd: null, localFallback: true, stdoutCapBytes: 16 })
  const out = await seam({ file: NODE, args: ['-e', 'process.stdout.write("x".repeat(100))'] })
  ok(out && out.stdout.length === 16, '★ stdout is capped at the configured bytes', out && out.stdout.length)
}

// ---- 9. WHEN THE HOST *HAS* THE SERVICE IT WINS, AND SAYS SO ---------------------------------------------------
{
  const record = []
  const sub = {
    async resolveExecutable(cmd) { return cmd },
    spawn() {
      record.push('host')
      return { done: Promise.resolve({ exitCode: 0 }), collected: { stdout: { readFrom: () => ({ text: 'HOST' }) }, stderr: { readFrom: () => ({ text: '' }) } } }
    },
  }
  const seam = m.createHostSpawn({ ctx: { get: () => sub }, defaultCwd: null, localFallback: true })
  ok(seam.seamKindOf() === 'host-subprocess', 'with a service the kind is host-subprocess', seam.seamKindOf())
  const out = await seam({ file: NODE, args: ['-e', '1'] })
  ok(out && out.stdout === 'HOST' && record.length === 1, '★ the host path ran (the fallback is not preferred, only a fallback)', record.length)
  ok(out && !('seamKind' in out), 'the host path does not claim a fallback kind (absence is honest here)')
}

// ---- 10. THE MATH ADAPTER BINDS THE FALLBACK, AND status.math NAMES THE MECHANISM ----------------------------
{
  const math = await import(pathToFileURL(join(ROOT, 'vibe-math-vmu', 'host-math.js')).href)
  const registered = []
  const ctx = {
    get: () => null,
    tools: { register: (spec) => registered.push(spec) },
    effect: (fn) => fn(),
    workspace: ROOT,
  }
  const host = math.createHostMath({ ctx, settings: { 'vmu.math.computation': 'python' }, projectRoot: ROOT })
  ok(typeof host.seamKindOf === 'function' && host.seamKindOf() === 'local-child-process',
    '★ createHostMath reports local-child-process on a host with no subprocess service', host && typeof host.seamKindOf === 'function' ? host.seamKindOf() : 'no seamKindOf')
  const resolved = await host.resolveExecutable('python')
  ok(resolved === 'python', 'resolveExecutable falls back to the NAME (the probe then really runs it), never a fake path', resolved)
  const run = await host.spawn({ argv: [NODE, '-e', 'process.stdout.write("engine")'] })
  ok(run && run.exit === 0 && /engine/.test(run.stdout), 'the math host can really run a program through the fallback', run && { exit: run.exit, stdout: run.stdout })
  ok(run && run.seamKind === 'local-child-process', 'and the run result carries seamKind', run && run.seamKind)
  // Registration happens when the shared math module loads (createMathSurface calls host.register), not at
  // adapter construction - so this file asserts the ADAPTER's own facts and leaves the tool face to §11.
  ok(host.projectRoot() === ROOT && host.designator === 'vibe-math-vmu', 'the adapter is bound to this project root', host.projectRoot())
}

// ---- 11. status.math.spawnSeamKind IS READ ON THE BOUNDED FACE TOO --------------------------------------------
{
  const { createKernel } = await import(pathToFileURL(join(ROOT, 'vibe-math-vmu', 'kernel', 'index.js')).href)
  const fakeHost = { register: () => ({ ok: true }), spawn: async () => ({ exit: 0 }), seamKindOf: () => 'local-child-process' }
  // ★ ROOT-THIS-AT-A-TMPDIR: a kernel with `root: <repo>` opens a store and plants `<repo>/vmu/state.json`. The repo
  // leftover audit caught exactly that ("a probe rooted at '.' plants it here"), so this kernel is rooted in its own
  // temp directory and the temp directory is removed afterwards.
  const tmpRoot = mkdtempSync(join(tmpdir(), 'vmu-g1-'))
  let k = null
  try {
    k = createKernel({ root: tmpRoot, host: fakeHost })
    const s = k.status()
    ok(s && s.math && s.math.spawnSeamKind === 'local-child-process', '★ status.math.spawnSeamKind names the mechanism', s && s.math && s.math.spawnSeamKind)
    ok(s && s.math && typeof s.math.spawnSeamKindMeans === 'string' && /local-child-process/.test(s.math.spawnSeamKindMeans),
      'and the means sentence explains both kinds', s && s.math && s.math.spawnSeamKindMeans)
  } finally { rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 10 }) }
}

console.log('\n=== VMU RUN82 LOCAL SPAWN: ' + passed + ' passed, ' + failed + ' failed ===')
assert.equal(failed, 0)
