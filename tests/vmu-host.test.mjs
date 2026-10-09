// vmu host adapter — the capability scenario for host.js (docs/03 §3, docs/11 §9).
//
// This suite is deliberately written against the HOST'S shape, not against our own invention. The first
// scripted live run (SLV) found that a tool registered with the wrong executor key is accepted and simply
// never appears, so the assertions here are:
//   · the executor is `execute` and there is NO `handler` (that mismatch is what the real host exposed);
//   · `output.render` returns a CONTENT-PART ARRAY, and `execute` returns a JSON STRING whose schema says
//     `type: 'string'` - exactly the shape this repository's working preset uses (vibe-math-v5r.js);
//   · registrations go through `ctx.effect(..., label)` when the host offers it (the host unwinds them),
//     and fall back to disposers otherwise;
//   · NOTHING declared ⇒ exactly ONE tool (`vibe_vmu_status`); `vmu.core.enabled=false` ⇒ ZERO;
//   · a tool appears only when the thing it exposes exists;
//   · refusals come back as NAMED JSON, never swallowed.
//
// `--self-probe` copies the module, removes the "records tool only with a library" guard and requires the
// host-side zero-mechanism assertion to fail.

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

const fakeHost = ({ withEffect = true } = {}) => {
  const state = { specs: [], disposed: 0, effects: [] }
  const tools = { register: async (spec) => { state.specs.push(spec); return () => { state.disposed++ } } }
  const ctx = withEffect
    ? { tools, effect(fn, label) { state.effects.push(label); return fn() } }
    : { tools }
  return { state, ctx }
}
const call = async (spec, args = {}) => JSON.parse(await spec.execute(args, {}))

// ---- 1. HOST-SIDE ZERO MECHANISM: nothing declared ⇒ exactly one tool, and it reports inertness ----
{
  const kernel = km.createKernel({ clock })
  const host = fakeHost()
  const adapter = hm.createHostAdapter({ ctx: host.ctx, kernel, settings: {} })
  const plan = adapter.plan()
  ok(plan.count === 1 && plan.names.join(',') === 'vibe_vmu_status',
    'with nothing declared the adapter plans exactly ONE tool (status)', plan.names.join(','))
  const installed = await adapter.install()
  ok(installed.installed === 1 && host.state.specs.length === 1 && installed.ownedByHost === true,
    'it registers exactly that one, and the HOST owns the unwind (ctx.effect)')
  ok(host.state.effects.join(',') === 'vmu:tool:vibe_vmu_status',
    'each registration is wrapped in ctx.effect with its own label', host.state.effects.join(','))
  const st = await call(host.state.specs[0])
  ok(st.ok === true && st.enabled === true && st.active === false && st.registrations.length === 0,
    'the adapter alone does not start the kernel: status reports enabled, not started, nothing registered')
  ok(st.seams.host === false && st.seams.store === false, 'status names the missing seams instead of hiding them')
  const uninstalled = await adapter.uninstall()
  ok(uninstalled.ok === true && uninstalled.ownedByHost === true, 'uninstall defers to the host when ctx.effect owns the registrations')
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
  ok(installed.installed === 0 && host.state.specs.length === 0 && host.state.effects.length === 0,
    'and it registers nothing at all (inert means invisible)')
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
  const rich = km.createKernel({ clock, root, settings: { 'vmu.middleware.entries': [{}] } })
  const richHost = fakeHost()
  await hm.createHostAdapter({ ctx: richHost.ctx, kernel: rich, settings: { 'vmu.middleware.entries': [{}] }, assertDeclared }).install()
  const names = richHost.state.specs.map((s) => s.name)
  ok(names.includes('vibe_vmu_records') && names.includes('vibe_vmu_middleware'),
    'records and middleware tools appear once a root and declared middleware exist', names.join(','))
  await rm(root, { recursive: true, force: true })
}

// ---- 4. the HOST shape (the mismatch the real host exposed) -------------------------------------
{
  const root = await mkdtemp(join(tmpdir(), 'vmu-host-shape-'))
  const kernel = km.createKernel({ clock, root, settings: { 'vmu.middleware.entries': [{}] } })
  const host = fakeHost()
  await hm.createHostAdapter({ ctx: host.ctx, kernel, settings: { 'vmu.middleware.entries': [{}] }, assertDeclared }).install()
  ok(host.state.specs.length >= 3, 'several tools registered for the shape audit', host.state.specs.length)
  for (const spec of host.state.specs) {
    ok(typeof spec.name === 'string' && spec.name.startsWith('vibe_vmu_'), spec.name + ': named in the vmu namespace')
    ok(typeof spec.description === 'string' && spec.description.length > 10, spec.name + ': carries a description')
    ok(typeof spec.execute === 'function', spec.name + ': the executor is `execute` (handler is silently ignored by the host)')
    ok(spec.handler === undefined, spec.name + ': no stray `handler` key')
    ok(spec.output && spec.output.schema && spec.output.schema.type === 'string',
      spec.name + ': output.schema says the executor returns a string')
    const rendered = spec.output.render(undefined, '{"ok":true}')
    ok(Array.isArray(rendered) && rendered[0] && rendered[0].type === 'text' && rendered[0].text === '{"ok":true}',
      spec.name + ': output.render returns a CONTENT-PART ARRAY', JSON.stringify(rendered))
    // The PROVIDER rejects a function whose parameter schema is not an object schema, and it rejects the
    // whole request (a silent zero-token turn). So parameters must be an object schema with a top-level
    // `required` array, and the properties must NOT carry a stray `required` key.
    ok(spec.parameters && spec.parameters.type === 'object',
      spec.name + ': parameters is an OBJECT schema (a non-object schema kills the request)', JSON.stringify(spec.parameters).slice(0, 80))
    ok(Array.isArray(spec.parameters.required) && spec.parameters.additionalProperties === false,
      spec.name + ': parameters declares a top-level required[] and closes additionalProperties')
    for (const [pname, p] of Object.entries(spec.parameters.properties || {})) {
      ok(typeof p.type === 'string' && typeof p.description === 'string',
        spec.name + '.' + pname + ': declares type + description in the property schema', JSON.stringify(p))
      ok(p.required === undefined, spec.name + '.' + pname + ': no stray `required` inside the property schema')
      if (p.type === 'object') ok(typeof p.additionalProperties === 'boolean', spec.name + '.' + pname + ': object params must declare boolean additionalProperties')
    }
    ok(spec.parameters.required.every((r) => Object.prototype.hasOwnProperty.call(spec.parameters.properties, r)),
      spec.name + ': every required name is a declared property', JSON.stringify(spec.parameters.required))
  }
  // a host WITHOUT ctx.effect still works, and then WE hold the disposers
  const plain = fakeHost({ withEffect: false })
  const kernel2 = km.createKernel({ clock })
  const adapter2 = hm.createHostAdapter({ ctx: plain.ctx, kernel: kernel2, settings: {} })
  await adapter2.install()
  ok(adapter2.status().ownedByHost === false, 'without ctx.effect the adapter reports that it owns the registrations')
  await adapter2.uninstall()
  ok(plain.state.disposed === 1, 'and its uninstall really calls the disposer', plain.state.disposed)
  await rm(root, { recursive: true, force: true })
}

// ---- 5. refusals are named JSON, and the receipts are useful ------------------------------------
{
  const kernel = km.createKernel({ clock })
  const host = fakeHost()
  await hm.createHostAdapter({ ctx: host.ctx, kernel, settings: {}, assertDeclared }).install()
  const setTool = host.state.specs.find((s) => s.name === 'vibe_vmu_set')
  const bad = await call(setTool, { key: 'vmu.nope.nothing', value: '1' })
  ok(bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT', 'an undeclared key is refused BY NAME (R4)', JSON.stringify(bad))
  const good = await call(setTool, { key: 'vmu.meetings.quorumCap', value: '7' })
  ok(good.ok === true && good.value === 7 && good.hot === 'H1' && good.who === 'role:chair',
    'a declared key is applied, with its hot class and who-may-change-it in the receipt', JSON.stringify(good))
  ok(kernel.settingsSnapshot()['vmu.meetings.quorumCap'] === 7, 'the value is actually in force')
  const statusTool = host.state.specs.find((s) => s.name === 'vibe_vmu_status')
  ok((await call(statusTool)).ok === true, 'status still works after a set')
  ok((await call(statusTool)).note && /inert by construction/.test((await call(statusTool)).note),
    'the status result restates the zero-mechanism promise')
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
