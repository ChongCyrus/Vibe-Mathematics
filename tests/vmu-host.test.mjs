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
  const state = { specs: [], disposed: 0, effects: [], live: new Set() }
  const tools = {
    register: async (spec) => {
      state.specs.push(spec); state.live.add(spec.name)
      return () => { state.disposed++; state.live.delete(spec.name) }
    },
    // ★ PHASE 7: the host's VISIBLE table (what the model would see). retraction must change THIS, not only the receipt.
    schemas: () => [...state.live],
  }
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
  // ROUND 80: ask for FULL detail. Since the Round-34 bounding, detail:'summary' (the default) replaces the seven
  // diagnostic sections - seams among them - with a HEADLINE by design, and says so in the receipt. A test that wants to
  // read a NAMED seam must ask for full; asserting on the headline's fields would assert the wrong thing.
  const st = await call(host.state.specs[0], { detail: 'full' })
  ok(st.ok === true && st.enabled === true && st.active === false && st.registrations.length === 0,
    'the adapter alone does not start the kernel: status reports enabled, not started, nothing registered')
  ok(st.seams.host === false && st.seams.store === false, 'status names the missing seams instead of hiding them')
  const uninstalled = await adapter.uninstall()
  ok(uninstalled.ok === true && uninstalled.ownedByHost === true, 'uninstall defers to the host when ctx.effect owns the registrations')
  // Instance identity: with two vmu rows in one profile the host keeps one registration per name, so the
  // receipts must say WHICH instance answered (the live run showed contradictory-looking receipts).
  const named = hm.createHostAdapter({ ctx: fakeHost().ctx, kernel, settings: {}, instance: 'vmu-a' })
  ok(named.status().instance === 'vmu-a', 'the adapter reports its instance identity', named.status().instance)
  const namedHost = fakeHost()
  const named2 = hm.createHostAdapter({ ctx: namedHost.ctx, kernel, settings: {}, instance: 'vmu-b' })
  await named2.install()
  const namedStatus = await call(namedHost.state.specs[0])
  ok(namedStatus.instance === 'vmu-b', 'and the status TOOL receipt carries it, so a real receipt is unambiguous', namedStatus.instance)
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

// ---- 3b. THE RECORDS TOOL READS THE SAME SOURCE THE DATA PLANE WRITES (SLV measured: two different stores) ----
{
  const root = await mkdtemp(join(tmpdir(), 'vmu-host-records-'))
  const settings = {
    'vmu.records.tracks': ['problems'],
    'vmu.records.allowedKinds': ['problem', 'state'],
    'vmu.records.requireSettledRecords': false,
  }
  const kernel = km.createKernel({ clock: () => 1000, root, settings })
  await kernel.store.open()
  const host = fakeHost()
  await hm.createHostAdapter({ ctx: host.ctx, kernel, settings, assertDeclared }).install()
  const recSpec = host.state.specs.find((s) => s.name === 'vibe_vmu_records')
  ok(!!recSpec, 'the records tool is published with a durable root')
  const put = kernel.records.put({ track: 'problems', kind: 'problem', title: 'tool-visible', body: 'tool-body', settled: true })
  const listed = await call(recSpec, { action: 'list' })
  ok(Array.isArray(listed.records) && listed.records.some((r) => r.id === put.id),
    '★ a card written by the data plane (kernel.records) IS visible through vibe_vmu_records list (same source)',
    listed.records && listed.records.map((r) => r.id))
  const expanded = await call(recSpec, { action: 'expand', id: put.id })
  ok(expanded && expanded.ok === true && String(expanded.body) === 'tool-body',
    '★ expand returns the body instead of VMU_NO_SUCH_OBJECT', expanded && expanded.code)
  const missing = await call(recSpec, { action: 'expand', id: 'r-nope' })
  ok(missing && missing.ok === false && missing.code === 'VMU_NO_SUCH_OBJECT',
    'reverse: an id that was never written still refuses by name (no invented record)', missing && missing.code)
  try { await rm(root, { recursive: true, force: true }) } catch { /* the store may still hold the file open; the temp dir is disposable */ }
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

// ---- B1: the `set` receipt states WHEN a change lands, and H3 keys are refused by name --------------
{
  // Assembled through the ENTRY, because that is what supplies the declared-key guard to the set tool.
  const em = await import(pathToFileURL(join(KERNEL, '..', '..', 'vibe-math-vmu.js')).href)
  const h = fakeHost()
  em.apply(h.ctx, { clock: () => '2026-10-09T00:00:00.000Z', vmu: { 'vmu.limits.maxLiveMembers': 4 } })
  await new Promise((r) => setTimeout(r, 20))   // the entry registers tools inside an async effect
  const spec = h.state.specs.find((s) => s.name === 'vibe_vmu_set')
  ok(spec !== undefined, 'the set tool is registered when declared keys exist')
  if (spec) {
    const h3 = JSON.parse(await spec.execute({ key: 'vmu.safety.pathPolicy', value: 'workspace+shared' }, {}))
    ok(h3.ok === false && h3.code === 'VMU_NOT_PERMITTED' && /read-only \(H3\)/.test(String(h3.message)),
      'an H3 (framework-owned) key is refused BY NAME instead of silently ignored', JSON.stringify(h3))
    const h2 = JSON.parse(await spec.execute({ key: 'vmu.math.formalVerify', value: 'require' }, {}))
    ok(h2.ok === true && h2.appliesFrom === 'next session (restart required)' && h2.source === 'runtime',
      'an H2 key says a restart is required and reports its new source', JSON.stringify(h2))
    const h1 = JSON.parse(await spec.execute({ key: 'vmu.packs.allowOverride', value: 'true' }, {}))
    ok(h1.ok === true && h1.appliesFrom === 'next turn' && h1.hot === 'H1',
      'an H1 key says "next turn" (the receipt is per hot class)', JSON.stringify(h1))
    const h0 = JSON.parse(await spec.execute({ key: 'vmu.limits.maxLiveMembers', value: '9' }, {}))
    ok(h0.ok === true && h0.appliesFrom === 'immediately' && h0.hot === 'H0',
      'an H0 key says "immediately"', JSON.stringify(h0))
    const bad = JSON.parse(await spec.execute({ key: 'vmu.limits.notDeclared', value: '1' }, {}))
    ok(bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT', 'an undeclared key stays refused by name', JSON.stringify(bad))
    // A PLANNED key (a design-phase declaration with no consumer) must SAY that its value changes nothing:
    // an independent reviewer measured a single-digit wiring rate among declared keys, so a receipt implying
    // "the knob works" is exactly the trap docs/04 §6.3 forbids.
    // ROUND 217: the key used to be `vmu.roles.termRenewable`, which this session WIRED - so the receipt now correctly
    // says it has a consumer. The assertion is about the PLANNED branch, so it must name a key that is still planned.
    // ROUND 217: read a CURRENTLY planned key at runtime instead of naming one, because a named key gets wired and the
    // assertion then breaks for the wrong reason (it happened twice this session). The import is dynamic because this
    // suite does not otherwise import node:fs; importing it here keeps the change local and obvious.
    const { readFileSync } = await import('node:fs')
    const plannedSrc = readFileSync(new URL('../vibe-math-vmu/settings/planned.js', import.meta.url), 'utf8')
    const plannedKey = (plannedSrc.match(/key: "(vmu\.[A-Za-z0-9_.]+)"/) || [])[1]
    const planned = JSON.parse(await spec.execute({ key: plannedKey, value: '[]' }, {}))
    ok(planned.ok === true && planned.noConsumer === true && /no runtime consumer/.test(String(planned.appliesFrom)) &&
      /NO consumer yet/.test(String(planned.note)),
      'a planned key is settable but the receipt states that it has no consumer yet', JSON.stringify(planned))
  }
}

// ---- B2: middleware validate/dryRun are callable, and a dry run has NO side effects -----------------
{
  const rule = { id: 'no-edit', kind: 'rules', on: ['tools/pre-execute'],
    when: { tool: ['edit'] }, then: [{ deny: { code: 'VMU_NOT_PERMITTED', message: 'editing is closed' } }] }
  const settings = { 'vmu.middleware.entries': [rule] }
  const h = fakeHost()
  const kernel = km.createKernel({ clock: () => '2026-10-09T00:00:00.000Z', settings })
  await kernel.start()   // the entry does this too: the declared rules are compiled here
  const adapter = hm.createHostAdapter({ ctx: h.ctx, kernel, settings, instance: 'i' })
  await adapter.install()
  const spec = h.state.specs.find((s) => s.name === 'vibe_vmu_middleware')
  ok(spec !== undefined, 'the middleware tool exists once the bus has entries')
  if (spec) {
    const good = JSON.parse(await spec.execute({ action: 'validate', id: 'no-edit' }, {}))
    ok(good.ok === true && Array.isArray(good.problems) && good.problems.length === 0,
      'validate on a DECLARED rule reports no problems', JSON.stringify(good.problems))
    ok(good.vocabulary && Array.isArray(good.vocabulary.predicates) && good.vocabulary.predicates.length > 0,
      'and returns the live predicate/action vocabulary it validated against')
    const bad = JSON.parse(await spec.execute({ action: 'validate', rule: JSON.stringify({ id: 'x', kind: 'rules', on: ['tools/pre-execute'], when: { subject: 'not-a-predicate' }, then: [{ deny: { code: 'VMU_NOT_PERMITTED', message: 'x' } }] }) }, {}))
    ok(bad.ok === false && bad.problems.length > 0 && /predicate/i.test(JSON.stringify(bad.problems)),
      'validate on an unknown predicate reports the problem BY NAME', JSON.stringify(bad.problems).slice(0, 120))
    const unknown = JSON.parse(await spec.execute({ action: 'dryRun', id: 'ghost' }, {}))
    ok(unknown.ok === false && unknown.code === 'VMU_NO_SUCH_OBJECT', 'dryRun on an unknown id is refused by name', JSON.stringify(unknown))

    const before = JSON.parse(await spec.execute({ action: 'list' }, {}))
    const dry = JSON.parse(await spec.execute({ action: 'dryRun', id: 'no-edit', samples: JSON.stringify([{ tool: 'edit' }, { tool: 'pwsh' }]) }, {}))
    ok(dry.ok === true && dry.evaluated === 2 && Array.isArray(dry.would),
      'dryRun evaluates the samples and reports what WOULD happen', JSON.stringify(dry).slice(0, 160))
    const after = JSON.parse(await spec.execute({ action: 'list' }, {}))
    ok(after.entries.length === before.entries.length && after.entries.every((e) => e.hits === 0),
      'a dry run changes NOTHING on the bus (no hits, no new entries)',
      JSON.stringify({ before: before.entries.length, after: after.entries.length }))
    ok(kernel.status().rules.stats.dryRuns >= 1, 'and the dry-run counter moves (observability keeps up)')
  }
}

// ---- E-7 (task-166): the tool face and the KERNEL API give ONE answer (same code, same words) ----------
{
  const em = await import(pathToFileURL(join(KERNEL, '..', '..', 'vibe-math-vmu.js')).href)
  const h = fakeHost()
  const handle = em.apply(h.ctx, { clock: () => '2026-10-09T00:00:00.000Z', vmu: { 'vmu.limits.maxLiveMembers': 4 } })
  await new Promise((r) => setTimeout(r, 20))
  const kernel = handle.kernel
  const spec = h.state.specs.find((s) => s.name === 'vibe_vmu_set')
  ok(spec !== undefined && !!kernel, 'E-7: the entry exposes both the set tool and the kernel handle')
  if (spec && kernel) {
    // ① H3: the tool face and the kernel API must refuse with the SAME code AND the SAME message
    const viaTool = JSON.parse(await spec.execute({ key: 'vmu.safety.pathPolicy', value: 'workspace+shared' }, {}))
    let viaKernel = null
    try { kernel.setSettingsValue('vmu.safety.pathPolicy', 'workspace+shared', { by: 'office' }) } catch (e) { viaKernel = e }
    ok(viaTool.ok === false && viaTool.code === 'VMU_NOT_PERMITTED',
      'E-7/H3: the tool face refuses by name', JSON.stringify(viaTool).slice(0, 90))
    ok(viaKernel && viaKernel.code === viaTool.code && viaKernel.message === viaTool.message,
      'E-7/H3: BOTH paths answer with the same code AND the same words (was: kernel said ok/immediate)',
      JSON.stringify({ tool: [viaTool.code, viaTool.message], kernel: viaKernel && [viaKernel.code, viaKernel.message] }))
    // ② an UNDECLARED key keeps the KERNEL's code (it used to be flattened into VMU_PACK_CONFLICT) and the
    //    wording matches schema.js assertDeclared, so both boundaries read as ONE contract
    const unknown = JSON.parse(await spec.execute({ key: 'vmu.limits.notDeclared', value: '1' }, {}))
    const viaKernelUnknown = (() => { try { kernel.setSettingsValue('vmu.limits.notDeclared', 1, { by: 'office' }); return null } catch (e) { return e } })()
    ok(unknown.ok === false && unknown.code === 'VMU_INVALID_ARGUMENT' && /undeclared setting key/.test(String(unknown.message)),
      'E-7: an undeclared key reports the KERNEL code and wording (no more VMU_PACK_CONFLICT flattening)', JSON.stringify(unknown).slice(0, 110))
    ok(viaKernelUnknown && viaKernelUnknown.code === unknown.code && viaKernelUnknown.message === unknown.message,
      'E-7: the undeclared-key refusal is word-for-word the same on both paths',
      JSON.stringify({ tool: unknown.message, kernel: viaKernelUnknown && viaKernelUnknown.message }))
    // ③ the receipt's timing comes from the KERNEL's table (one source), not from a host-side copy
    const table = kernel.appliesTable()
    const h2 = JSON.parse(await spec.execute({ key: 'vmu.math.formalVerify', value: 'require' }, {}))
    const h1 = JSON.parse(await spec.execute({ key: 'vmu.packs.allowOverride', value: 'true' }, {}))
    const h0 = JSON.parse(await spec.execute({ key: 'vmu.limits.maxLiveMembers', value: '9' }, {}))
    ok(h2.appliesFrom === table.H2 && h1.appliesFrom === table.H1 && h0.appliesFrom === table.H0,
      'E-7: appliesFrom is derived from kernel.appliesTable() for every class',
      JSON.stringify({ h0: h0.appliesFrom, h1: h1.appliesFrom, h2: h2.appliesFrom }))
    ok(h2.requiresRestart === true && h1.requiresRestart === false && h0.requiresRestart === false,
      'E-7: the tool receipt carries the kernel\'s requiresRestart verdict (H2 ⇒ true)', JSON.stringify({ h2: h2.requiresRestart, h0: h0.requiresRestart }))
    ok(/exempted/.test(String(h0.ownerCheck)),
      'E-7: the tool receipt discloses the owner-check exemption (no silent bypass)', h0.ownerCheck)
    // ④ an H3 key cannot be removed through the kernel API either (same guard, disclosed)
    let unsetH3 = null
    try { kernel.unsetSettingsValue('vmu.safety.pathPolicy', { by: 'office' }) } catch (e) { unsetH3 = e }
    ok(unsetH3 && unsetH3.code === 'VMU_NOT_PERMITTED' && unsetH3.message === viaTool.message,
      'E-7: unset applies the same H3 guard with the same words', unsetH3 && unsetH3.code)
  }
}

// ── 8. ★ PHASE 7: RETRACT BY NAME, AND A PACK UNLOAD MUST CHANGE THE HOST'S VISIBLE TABLE ──────────────
{
  const kernel = km.createKernel({ clock })
  const host = fakeHost()
  const adapter = hm.createHostAdapter({ ctx: host.ctx, kernel, settings: {} })
  await adapter.install()
  const before = host.ctx.tools.schemas()
  ok(before.includes('vibe_vmu_status'), '正：retract 之前宿主可见面含该工具', before)
  const r = await adapter.retractTools(['vibe_vmu_status'])
  const after = host.ctx.tools.schemas()
  ok(r.ok === true && r.retracted.length === 1 && r.notFound.length === 0 && !after.includes('vibe_vmu_status'),
    '★ 正：retract 后 tools.schemas() 里真的没有它（宿主可见面变了）', { r, after })
  const miss = await adapter.retractTools(['vibe_vmu_not_a_tool'])
  ok(miss.ok === false && miss.notFound.includes('vibe_vmu_not_a_tool') && miss.retracted.length === 0,
    '★ 反：不存在的名字 ⇒ 具名 notFound，不静默成功', miss)
  // ② pack unload: the kernel retraction must notify the host, and the host table must follow it.
  kernel.declarePackTools([{ name: 'probe_pack_tool', description: 'probe', parameters: {}, handler: () => ({ ok: true }) }], { by: 'probe-pack' })
  await adapter.install()
  ok(host.ctx.tools.schemas().includes('probe_pack_tool'), 'pack 工具先真的出现在宿主可见面', host.ctx.tools.schemas())
  const retracted = kernel.retractPackTools(['probe_pack_tool'], { by: 'probe-pack' })
  if (retracted && retracted.hostRetract) await retracted.hostRetract
  ok(!host.ctx.tools.schemas().includes('probe_pack_tool'),
    '★ pack unload 后该工具不在宿主可见面（kernel 通知了 host）', host.ctx.tools.schemas())
}

// ── ★ PHASE 7 / round 17: ONE closure reading + compact status faces (measurable readability) ────────────────
{
  // positive: a seated member WITH the permission must be eligible and missing (not "nobody has a vote")
  const k = km.createKernel({ clock })
  k.declareSlots([{ id: 'member', label: '成员', capacity: 0, permissions: ['vote'] }])
  await k.members.hire({ id: 'member-a', slot: 'member', institution: 'sim' })
  const view = k.closureVoteView()
  ok(view && view.eligible.includes('member-a') && view.missing.includes('member-a') && view.cast === false,
    '★ 正：有票权成员在册 ⇒ closureVote.eligible 含他、missing 正确（不再误报“没人有票权”）', view)
  // reverse: no roster ⇒ eligible [] and the reason is truthful
  const bare = km.createKernel({ clock })
  const none = bare.closureVoteView()
  ok(none.eligible.length === 0 && /no member holds the closure-vote permission/.test(none.reason),
    '★ 反：真的没人有票权 ⇒ eligible:[] 且 reason 说真话', none)
  // size: the default summary and the closure-only face must really be readable (first quantification of readability)
  const host2 = fakeHost()
  const adapter2 = hm.createHostAdapter({ ctx: host2.ctx, kernel: k, settings: {} })
  await adapter2.install()
  const statusSpec = host2.state.specs.find((s) => s.name === 'vibe_vmu_status')
  const defaultText = await statusSpec.execute({}, {})
  ok(defaultText.length < 4000, '★ status 默认 summary 实测 < 4000 字符（可读，不再被宿主截断）', defaultText.length)
  const closureText = await statusSpec.execute({ detail: 'closure' }, {})
  ok(closureText.length < 1500, '★ detail:"closure" 是专门的小读数面，实测 < 1500 字符', closureText.length)
  const parsed = JSON.parse(closureText)
  ok(parsed.closureVote && parsed.closureVote.eligible.includes('member-a'),
    '★ closure 小面回的就是统一后的 reading（与 kernel 同一份输入）', parsed.closureVote)
}

// ── 9. ★ PHASE 7 (goal 4): MEMBER TOOL FACE — kernel capability, host applier, real schemas diff ────────────
{
  const kernel = km.createKernel({ clock })
  kernel.declareSlots([{ id: 'member', label: '成员', capacity: 0 }])
  await kernel.members.hire({ id: 'member-a', slot: 'member', institution: 'sim' })
  const live = new Set(['vibe_vmu_status', 'vibe_vmu_turn', 'vibe_vmu_records'])
  const agent = {
    id: 'member-a',
    ctx: { tools: {
      schemas: () => [...live].map((name) => ({ name })),
      restrict: ({ allow, deny }) => {
        if (Array.isArray(allow)) for (const n of [...live]) if (!allow.includes(n)) live.delete(n)
        if (Array.isArray(deny)) for (const n of deny) live.delete(n)
        return () => { /* the test only needs the diff */ }
      },
    } },
  }
  const ctx = Object.assign({}, fakeHost().ctx, { get: (name) => (name === 'agents' ? { get: (id) => (id === 'member-a' ? agent : null) } : null) })
  const adapter = hm.createHostAdapter({ ctx, kernel, settings: {} })
  void adapter
  const before = live.size
  const r = await kernel.applyMemberToolFace({ member: 'member-a', allow: ['vibe_vmu_status', 'vibe_vmu_turn'] })
  ok(r.ok === true && r.removed.includes('vibe_vmu_records') && r.added.length === 0 && r.visibleBefore === before && r.visibleAfter === 2,
    '★ 正：成员工具面 apply 后 schemas() 真的少了工具，且 added/removed 与前后差集一致', r)
  let missing = null
  try { await kernel.applyMemberToolFace({ member: 'no-such-member', allow: ['vibe_vmu_status'] }) } catch (e) { missing = e }
  ok(missing && missing.code === 'VMU_NO_SUCH_OBJECT', '★ 反：成员不存在 ⇒ 具名 VMU_NO_SUCH_OBJECT', missing && missing.code)
  let unknown = null
  try { await kernel.applyMemberToolFace({ member: 'member-a', allow: ['vibe_vmu_not_a_tool'] }) } catch (e) { unknown = e }
  ok(unknown && unknown.code === 'VMU_INVALID_ARGUMENT', '★ 反：未声明的面名 ⇒ 具名 VMU_INVALID_ARGUMENT', unknown && unknown.code)
  const vis = adapter.visibleToolsOf('member-a')
  ok(vis.ok === true && JSON.stringify(vis.tools) === JSON.stringify(agent.ctx.tools.schemas().map((x) => x.name)),
    '★ 正：visibleToolsOf 返回的名字集合 == schemas() 的真实结果', vis)
  const visMissing = adapter.visibleToolsOf('no-such-member')
  ok(visMissing.ok === false && visMissing.code === 'VMU_NO_SUCH_OBJECT',
    '★ 反：无 live Agent ⇒ 具名拒（不返回空数组假装“没有工具”）', visMissing)
}

// ── 10. ★ PHASE 7 (blindspot c): the set* observers are PROVEN to be called, not just declared ────────────────
{
  const seen = []
  hm.setToolExecObserver((exec) => seen.push(exec))
  const kernel = km.createKernel({ clock })
  const host = fakeHost()
  const adapter = hm.createHostAdapter({ ctx: host.ctx, kernel, settings: {} })
  await adapter.install()
  const spec = host.state.specs.find((x) => x.name === 'vibe_vmu_status')
  await spec.execute({}, {})
  ok(seen.length > 0, '★ setToolExecObserver 的 observer 被真实工具执行调用（不是只存在）', seen.length)
  const calls = []
  kernel.setPackToolRetractObserver(({ removed }) => { calls.push(removed); return { ok: true } })
  kernel.declarePackTools([{ name: 'probe_retract_tool', description: 'probe', parameters: {}, handler: () => ({ ok: true }) }], { by: 'probe-pack' })
  const retracted = kernel.retractPackTools(['probe_retract_tool'], { by: 'probe-pack' })
  if (retracted && retracted.hostRetract) await retracted.hostRetract
  ok(calls.length === 1 && calls[0].includes('probe_retract_tool'), '★ setPackToolRetractObserver 的 observer 真的被 retract 调用（含被撤名）', calls)
}

console.log('=== VMU HOST: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

