// vmu scripts (M3) — the capability scenario for host-spawn.js and the `vibe_vmu_script` tool.
//
// The host's subprocess service is faked here (the documented seam discipline), so every path is
// reproducible on any machine:
//   · the seam is built ONLY when the host exposes a subprocess service; otherwise the bridge refuses by
//     name (VMU_ENGINE_UNAVAILABLE) - never faked;
//   · argv is assembled from file + args; a host that throws while validating (documented: it validates
//     argv/cwd/env BEFORE a handle exists) becomes a NAMED refusal;
//   · output comes from the host's collected reader, and the two ending kinds are distinguished: a clean
//     exit with `exitCode`, a budget expiry as `timedOut: true` (which the bridge turns into
//     VMU_JOB_TIMEOUT), and a host error as a named failure;
//   · the `vibe_vmu_script` tool appears ONLY when scripts are declared, its results are returned to the
//     caller, and a script that prints something unstructured is refused by name.
//
// `--self-probe` copies host-spawn.js, removes the "no subprocess service" refusal and requires the
// corresponding assertion to fail.

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const SPAWN_MODULE = resolve(REPO, 'vibe-math-vmu', 'host-spawn.js')
const HOST_MODULE = resolve(REPO, 'vibe-math-vmu', 'host.js')
const KERNEL = resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
const SELF_PROBE = process.argv.includes('--self-probe')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const expectThrow = async (fn, code, name) => {
  try { await fn(); failed++; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

const sm = await import(pathToFileURL(SPAWN_MODULE).href)
const hm = await import(pathToFileURL(HOST_MODULE).href)
const km = await import(pathToFileURL(KERNEL).href)
const clock = () => '2026-10-09T00:00:00.000Z'

/** A fake host subprocess service with the documented shape (spawn -> handle with done + collected). */
const fakeSubprocess = ({ exitCode = 0, stdout = '{"ok":true,"summary":"done"}', stderr = '', neverSettles = false, throwOnSpawn = null } = {}) => {
  const calls = []
  const service = {
    spawn(spec) {
      calls.push(spec)
      if (throwOnSpawn) throw new Error(throwOnSpawn)
      const handle = {
        done: neverSettles ? new Promise(() => {}) : Promise.resolve({ exitCode, signal: null }),
        collected: {
          stdout: { readFrom: () => ({ text: stdout }) },
          stderr: { readFrom: () => ({ text: stderr }) },
        },
      }
      return handle
    },
  }
  return { service, calls, ctx: { get: (name) => (name === 'subprocess' ? service : undefined) } }
}

// ---- 1. the seam exists only when the host has a service ----------------------------------------
{
  ok(sm.hasHostSpawn(fakeSubprocess().ctx) === true, 'a host with a subprocess service is detected')
  ok(sm.hasHostSpawn({ get: () => undefined }) === false, 'a host without one is detected too')
  await expectThrow(async () => sm.createHostSpawn({ ctx: { get: () => undefined } }), 'VMU_ENGINE_UNAVAILABLE',
    'building the seam without a service is refused by name (never faked)')
}

// ---- 2. argv, output and the two ending kinds ---------------------------------------------------
{
  const fake = fakeSubprocess({ exitCode: 0, stdout: '{"ok":true,"summary":"ran"}' })
  const seam = sm.createHostSpawn({ ctx: fake.ctx, defaultCwd: 'D:/ws' })
  const out = await seam({ file: 'audit.mjs', args: ['--x', 7], timeoutMs: 5000, env: { A: '1' } })
  ok(fake.calls.length === 1 && fake.calls[0].argv.join(',') === 'audit.mjs,--x,7', 'argv is assembled from file + args (stringified)',
    JSON.stringify(fake.calls[0] && fake.calls[0].argv))
  ok(fake.calls[0].cwd === 'D:/ws' && fake.calls[0].graceMs === 5000, 'cwd defaults and the budget is handed to the host as graceMs')
  ok(fake.calls[0].stdio && fake.calls[0].stdio.stdout && fake.calls[0].stdio.stdout.maxBytes > 0,
    'output caps are declared (a tiny cap would silently truncate a receipt)')
  ok(out.code === 0 && out.timedOut === false && out.stdout === '{"ok":true,"summary":"ran"}', 'a clean exit returns the collected output', JSON.stringify(out))

  const slow = sm.createHostSpawn({ ctx: fakeSubprocess({ neverSettles: true }).ctx, delay: () => Promise.resolve() })
  const timedOut = await slow({ file: 'slow.mjs', timeoutMs: 10 })
  ok(timedOut.timedOut === true && timedOut.code === null, 'a budget expiry is reported as timedOut (the bridge turns it into VMU_JOB_TIMEOUT)')

  const bad = sm.createHostSpawn({ ctx: fakeSubprocess({ throwOnSpawn: 'argv[0] is not executable' }).ctx })
  await expectThrow(async () => bad({ file: 'nope' }), 'VMU_INVALID_ARGUMENT',
    'a host that refuses the spawn (validating before any handle exists) becomes a NAMED refusal')

  const inline = sm.createHostSpawn({ ctx: fakeSubprocess().ctx })
  await expectThrow(async () => inline({ inline: 'console.log(1)' }), 'VMU_INVALID_ARGUMENT',
    'an inline script is refused: the host spawns executables, not evaluated text')
}

// ---- 3. the vibe_vmu_script TOOL: only when declared, results to the caller only ----------------
{
  const kernel = km.createKernel({ clock })
  const bare = fakeSubprocess()
  const specsBare = hm.toolSpecs({ kernel, settings: {}, instance: 'i' })
  ok(!specsBare.some((s) => s.name === 'vibe_vmu_script'), 'with no declared scripts the script tool does not appear')

  const declared = [{ id: 'audit', file: 'audit.mjs', args: ['--scope', 'records'], timeoutMs: 5000 }]
  const specs = hm.toolSpecs({ kernel: km.createKernel({ clock, spawn: sm.createHostSpawn({ ctx: bare.ctx }) }), settings: {}, instance: 'i', scripts: declared })
  const tool = specs.find((s) => s.name === 'vibe_vmu_script')
  ok(tool !== undefined, 'a declared script adds the script tool')
  const hostSpec = hm.toHostSpec(tool)
  const list = JSON.parse(await hostSpec.execute({ action: 'list' }, {}))
  ok(list.ok === true && list.scripts[0].id === 'audit' && list.scripts[0].timeoutMs === 5000, 'list reports the declared scripts', JSON.stringify(list.scripts))
  const unknown = JSON.parse(await hostSpec.execute({ action: 'run', id: 'ghost' }, {}))
  ok(unknown.ok === false && unknown.code === 'VMU_NO_SUCH_OBJECT', 'running an undeclared id is refused by name', JSON.stringify(unknown))
  const ran = JSON.parse(await hostSpec.execute({ action: 'run', id: 'audit', args: '["--extra"]' }, {}))
  ok(ran.ok === true && ran.ran === true && ran.summary === 'done', 'a declared script runs and its STRUCTURED result comes back', JSON.stringify(ran))
  ok(bare.calls.length === 1 && bare.calls[0].argv.join(',') === 'audit.mjs,--scope,records,--extra',
    'the declared args and the extra args reach the host in order',
    JSON.stringify({ calls: bare.calls.length, argv: bare.calls[0] && bare.calls[0].argv, receipt: ran }))

  // an unstructured script is refused by name (the bridge's structured-result contract)
  const chatty = fakeSubprocess({ stdout: 'all good, nothing to report' })
  const chattyKernel = km.createKernel({ clock, spawn: sm.createHostSpawn({ ctx: chatty.ctx }) })
  const chattyTool = hm.toHostSpec(hm.toolSpecs({ kernel: chattyKernel, settings: {}, instance: 'i', scripts: declared }).find((s) => s.name === 'vibe_vmu_script'))
  const refused = JSON.parse(await chattyTool.execute({ action: 'run', id: 'audit' }, {}))
  ok(refused.ok === false && refused.code === 'VMU_INVALID_ARGUMENT', 'an unstructured script result is refused by name', JSON.stringify(refused))
}

// ---- 4. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(SPAWN_MODULE, 'utf8')
  const guard = "  if (!sub || typeof sub.spawn !== 'function') {"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the missing-service refusal is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-spawn-mut-'))
    await writeFile(join(dir, 'host-spawn.js'), src.replace(guard, '  if (false) {'), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'host-spawn.js')).href + '?probe=1')
    let refused = null
    try { mm.createHostSpawn({ ctx: { get: () => undefined } }) } catch (e) { refused = e.code }
    // With the guard removed the seam is built without a service: the assertion MUST fail.
    ok(refused === 'VMU_ENGINE_UNAVAILABLE', 'self-probe: guard removed => the no-service assertion fails (as required)', String(refused))
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU SCRIPT SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU SCRIPT: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
