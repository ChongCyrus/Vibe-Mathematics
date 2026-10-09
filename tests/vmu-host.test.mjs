// vmu host adapter — the capability scenario for host.js (docs/03 §3, docs/11 §9).
//
// The host-side version of the framework's first promise, plus the four DSL constraints our own DSH recon
// documented the hard way:
//   · NOTHING declared  ⇒ exactly ONE tool (`vibe_vmu_status`), because seeing that the kernel is inert is
//     the point of the default;
//   · `vmu.core.enabled=false` ⇒ ZERO registrations (inert means invisible);
//   · a tool appears only when the thing it exposes exists (no records tool without a durable root - the
//     status tool reports the missing seam instead of shipping a tool that can only refuse);
//   · every spec satisfies the tool DSL: `required` INSIDE each parameter, boolean `additionalProperties`
//     on object parameters, an `output` with schema+render, and parameters that declare type+description;
//   · refusals come back as NAMED structured failures, never swallowed.
//
// `--self-probe` copies the module, removes the "records tool only with a library" guard and requires the
// zero-mechanism assertion (host side) to fail.

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'host.js')
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

const hm = await import(pathToFileURL(MODULE).href)
const km = await import(pathToFileURL(KERNEL).href)
const { assertDeclared } = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'settings', 'schema.js')).href)
const clock = () => '2026-10-09T00:00:00.000Z'

const fakeHost = () => {
  const state = { specs: [], disposed: 0 }
  return {
    state,
    ctx: { tools: { register: async (spec) => { state.specs.push(spec); return () => { state.disposed++ } } } },
  }
}

// ---- 1. HOST-SIDE ZERO MECHANISM: nothing declared ⇒ exactly one tool, and it reports inertness ----
{
  const kernel = km.createKernel({ clock })
  const host = fakeHost()
  const adapter = hm.createHostAdapter({ ctx: host.ctx, kernel, settings: {} })
  const plan = adapter.plan()
  ok(plan.count === 1 && plan.names.join(',') === 'vibe_vmu_status',
    'with nothing declared the adapter plans exactly ONE tool (status)', plan.names.join(','))
  const installed = await adapter.install()
  ok(installed.installed === 1 && host.state.specs.length === 1, 'and it registers exactly that one')
  const st = await host.state.specs[0].handler({})
  ok(st.ok === true && st.enabled === true && st.active === false, 'status reports an enabled but inactive kernel')
  ok(st.seams.host === false && st.seams.store === false, 'status names the missing seams instead of hiding them')
  ok(typeof JSON.stringify(st) === 'string' && JSON.stringify(st).length > 10, 'the status result is serializable (tool outputs must be)')
  ok(st.note && /inert by construction/.test(st.note), 'the status result restates the zero-mechanism promise')
  await adapter.uninstall()
  ok(host.state.disposed === 1 && adapter.status().installed === false, 'uninstall calls every disposer')
}

// ---- 2. disabled ⇒ ZERO registrations ----------------------------------------------------------
{
  const kernel = km.createKernel({ clock, settings: { 'vmu.core.enabled': false } })
  const host = fakeHost()
  const adapter = hm.createHostAdapter({ ctx: host.ctx, kernel, settings: { 'vmu.core.enabled': false } })
  const plan = adapter.plan()
  ok(plan.enabled === false && plan.count === 0 && /registers nothing/.test(plan.reason),
    'a disabled kernel plans NO tools and says why', JSON.stringify(plan))
  const installed = await adapter.install()
  ok(installed.installed === 0 && host.state.specs.length === 0, 'and it registers nothing at all (inert means invisible)')
  await expectThrow(() => hm.createHostAdapter({ ctx: {}, kernel, settings: {} }).install(), 'VMU_ENGINE_UNAVAILABLE',
    'a host context without tools.register is refused by name (never invented)')
}

// ---- 3. tools appear only when the thing they expose exists ------------------------------------
{
  const bare = km.createKernel({ clock })
  const bareHost = fakeHost()
  await hm.createHostAdapter({ ctx: bareHost.ctx, kernel: bare, settings: {}, assertDeclared }).install()
  ok(bareHost.state.specs.map((s) => s.name).join(',') === 'vibe_vmu_status,vibe_vmu_set',
    'set appears with a declared-key guard, but records does NOT appear without a root',
    bareHost.state.specs.map((s) => s.name).join(','))

  const root = await mkdtemp(join(tmpdir(), 'vmu-host-'))
  const rich = km.createKernel({ clock, root, slots: [{ id: 'chair', capacity: 1 }], settings: { 'vmu.middleware.entries': [{ id: 'mw-1', on: ['tools/pre-execute'], capabilities: ['annotate'], handler: async () => undefined }] } })
  const richHost = fakeHost()
  await hm.createHostAdapter({ ctx: richHost.ctx, kernel: rich, settings: { 'vmu.middleware.entries': [{}] }, assertDeclared }).install()
  const names = richHost.state.specs.map((s) => s.name)
  ok(names.includes('vibe_vmu_records') && names.includes('vibe_vmu_middleware'),
    'records and middleware tools appear once a root and declared middleware exist', names.join(','))
  await rm(root, { recursive: true, force: true })
}

// ---- 4. the DSL constraints (from our own recon) hold for EVERY spec ---------------------------
{
  const root = await mkdtemp(join(tmpdir(), 'vmu-host-dsl-'))
  const kernel = km.createKernel({ clock, root, settings: { 'vmu.middleware.entries': [{}] } })
  const host = fakeHost()
  await hm.createHostAdapter({ ctx: host.ctx, kernel, settings: { 'vmu.middleware.entries': [{}] }, assertDeclared }).install()
  ok(host.state.specs.length >= 3, 'several tools registered for the DSL audit', host.state.specs.length)
  for (const spec of host.state.specs) {
    ok(typeof spec.name === 'string' && spec.name.startsWith('vibe_vmu_'), spec.name + ': named in the vmu namespace')
    ok(typeof spec.description === 'string' && spec.description.length > 10, spec.name + ': carries a description')
    ok(spec.output && spec.output.schema && typeof spec.output.render === 'function',
      spec.name + ': declares output { schema, render } (omitting it is a host-level TypeError)')
    ok(spec.parameters === undefined || (typeof spec.parameters === 'object' && !Array.isArray(spec.parameters)),
      spec.name + ': parameters is an object map, not a top-level required[] array')
    for (const [pname, p] of Object.entries(spec.parameters || {})) {
      ok(typeof p.type === 'string' && typeof p.description === 'string' && typeof p.required === 'boolean',
        spec.name + '.' + pname + ': declares type + description + required INSIDE the parameter', JSON.stringify(p))
      if (p.type === 'object') ok(typeof p.additionalProperties === 'boolean', spec.name + '.' + pname + ': object params must declare boolean additionalProperties')
    }
  }
  await rm(root, { recursive: true, force: true })
}

// ---- 5. refusals are named, and the receipts are useful ----------------------------------------
{
  const kernel = km.createKernel({ clock })
  const host = fakeHost()
  await hm.createHostAdapter({ ctx: host.ctx, kernel, settings: {}, assertDeclared }).install()
  const setTool = host.state.specs.find((s) => s.name === 'vibe_vmu_set')
  const bad = await setTool.handler({ key: 'vmu.nope.nothing', value: '1' })
  ok(bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT', 'an undeclared key is refused BY NAME (R4)', JSON.stringify(bad))
  const good = await setTool.handler({ key: 'vmu.meetings.quorumCap', value: '7' })
  ok(good.ok === true && good.value === 7 && good.hot === 'H1' && good.who === 'role:chair',
    'a declared key is applied, with its hot class and who-may-change-it in the receipt', JSON.stringify(good))
  ok(kernel.settingsSnapshot()['vmu.meetings.quorumCap'] === 7, 'the value is actually in force')
  const statusTool = host.state.specs.find((s) => s.name === 'vibe_vmu_status')
  ok((await statusTool.handler({})).ok === true, 'status still works after a set')
}

// ---- 6. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = '  if (kernel.library) {'
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the library guard is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-host-mut-'))
    await mkdir(join(dir, 'kernel', 'prompt'), { recursive: true })
    await mkdir(join(dir, 'settings'), { recursive: true })
    for (const f of ['bus.js', 'store.js', 'library.js', 'members.js', 'ballot.js', 'meeting.js', 'tasks.js', 'math.js', 'rules.js', 'loader.js', 'script-bridge.js', 'registry.js', 'index.js']) {
      await writeFile(join(dir, 'kernel', f), await readFile(resolve(REPO, 'vibe-math-vmu', 'kernel', f), 'utf8'), 'utf8')
    }
    await writeFile(join(dir, 'kernel', 'prompt', 'index.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js'), 'utf8'), 'utf8')
    await writeFile(join(dir, 'settings', 'schema.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'settings', 'schema.js'), 'utf8'), 'utf8')
    for (const f of ['math-computation.js', 'math-engines.js']) {
      await writeFile(join(dir, f), await readFile(resolve(REPO, 'vibe-math-vmu', f), 'utf8'), 'utf8')
    }
    await writeFile(join(dir, 'host.js'), src.replace(guard, '  if (true) {'), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'host.js')).href + '?probe=1')
    const kk = await import(pathToFileURL(join(dir, 'kernel', 'index.js')).href + '?probe=1')
    const kernel = kk.createKernel({ clock })
    const host = fakeHost()
    await mm.createHostAdapter({ ctx: host.ctx, kernel, settings: {} }).install()
    const names = host.state.specs.map((s) => s.name)
    // With the guard removed the records tool appears with no durable root: the assertion MUST fail.
    ok(names.join(',') === 'vibe_vmu_status', 'self-probe: guard removed => the host-side zero-mechanism assertion fails (as required)', names.join(','))
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU HOST SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU HOST: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
