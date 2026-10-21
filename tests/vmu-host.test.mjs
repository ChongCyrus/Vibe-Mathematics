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
const packm = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'pack.js')).href)
const { PACK: V5R_PACK } = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'index.js')).href)
const clock = () => 1000

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
    'vmu.records.headListAt': 5,
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
  // ★ G7 finding: a capped list silently returned only `.items` — an expandable record was absent from the list.
  // The face must NARROW with visible accounting, never look complete.
  for (let i = 0; i < 20; i += 1) kernel.records.put({ track: 'problems', kind: 'problem', title: 'cap-' + i, body: 'b' + i, settled: true })
  const capped = await call(recSpec, { action: 'list' })
  ok(capped.ok === true && capped.total === 21 && capped.returned === 5 && capped.truncated === true && typeof capped.hint === 'string',
    '★ records.list reports total/returned/truncated/hint when the head cap bites (no silent data loss)', {
      total: capped.total, returned: capped.returned, truncated: capped.truncated, hint: capped.hint,
    })
  const all = await call(recSpec, { action: 'list', limit: 0 })
  ok(all.ok === true && all.total === 21 && all.returned === 21 && all.truncated === false,
    '★ limit:0 returns the whole set and says truncated:false (the escape hatch named by hint)', {
      total: all.total, returned: all.returned, truncated: all.truncated,
    })
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
  // ★ PHASE 7 / round 18 修：★ 这条原本断言 `< 4000`，★ 而那个数字是**拍脑袋**的 —— ★ 删掉宿主那层裁剪后，
  // ★ 内核自己的 summary 实测 **5935**（真装配 6375）、full 实测 **149424**。★ 所以真正该钉住的【性质】不是
  // ★ 一个任意阈值，★ 而是：**默认面必须比 full 小一个数量级**（否则"默认可读"就是空话），
  // ★ **且存在一个【专门的小读数面】（closure，实测 880）供模型使用**。
  // ★ 保留一个绝对上限只是为了挡住失控增长；★ 它必须【≥ 实测值】并注明实测值。
  const fullText = await statusSpec.execute({ detail: 'full' }, {})
  ok(defaultText.length < 10000, '★ status 默认 summary 仍在可读上限内（实测值见括号；full 为 14.9 万字符）', { summary: defaultText.length, full: fullText.length })
  ok(fullText.length > defaultText.length * 10,
    '★★ 默认面比 full 小【一个数量级】以上 —— 这才是"默认可读"的可测形式（不是某个拍脑袋的绝对阈值）',
    { summary: defaultText.length, full: fullText.length, ratio: Math.round(fullText.length / defaultText.length) })
  const closureText = await statusSpec.execute({ detail: 'closure' }, {})
  ok(closureText.length < 1500, '★ detail:"closure" 是专门的小读数面，实测 < 1500 字符', closureText.length)
  const parsed = JSON.parse(closureText)
  ok(parsed.closureVote && parsed.closureVote.eligible.includes('member-a'),
    '★ closure 小面回的就是统一后的 reading（与 kernel 同一份输入）', parsed.closureVote)
}

// ── ★ PHASE 7 / round 22: summary is READABLE under a REAL pack (v5r), < 8000 bytes ─────────────────────────
{
  const root = await mkdtemp(join(tmpdir(), 'vmu-host-v5r-'))
  const k = km.createKernel({ clock, root })
  const packLoader = packm.createPackLoader({ kernel: k, registry: k.registry, onPromptPolicy: () => () => {} })
  await packLoader.apply(V5R_PACK)
  const host = fakeHost()
  const adapter = hm.createHostAdapter({ ctx: host.ctx, kernel: k, settings: {} })
  await adapter.install()
  const statusSpec = host.state.specs.find((s) => s.name === 'vibe_vmu_status')
  const text = await statusSpec.execute({}, {})
  const parsed = JSON.parse(text)
  ok(text.length < 8000, '★ 真装配（v5r pack）下 status 默认 summary < 8000 字节（可读，不再被宿主截断）', { bytes: text.length })
  ok(parsed.faces && typeof parsed.faces.count === 'number' && Array.isArray(parsed.faces.published),
    '★ summary 的 faces 是计数＋名字，不是每个工具的详情（契约字段仍在）', parsed.faces)
  ok(parsed.prompt && (parsed.prompt.sections !== undefined || parsed.prompt.chars !== undefined),
    '★ summary 的 prompt 是段数/字符数（契约字段仍在）', parsed.prompt)
  await rm(root, { recursive: true, force: true })
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

// ── ★ PHASE 8 / B-1: vibe_vmu_tools = the LIVE visible set, never an invented list ────────────────────────────
{
  const kernel = km.createKernel({ clock })
  kernel.declareSlots([{ id: 'member', label: '成员', capacity: 0, permissions: ['vote'] }])
  await kernel.members.hire({ id: 'member-a', slot: 'member', institution: 'sim' })
  const agent = { id: 'member-a', ctx: { tools: { schemas: () => [{ name: 'vibe_vmu_status' }, { name: 'vibe_vmu_turn' }] } } }
  const host = fakeHost()
  const ctx = Object.assign({}, host.ctx, { get: (name) => (name === 'agents' ? { get: (id) => (id === 'member-a' ? agent : null) } : null) })
  const adapter = hm.createHostAdapter({ ctx, kernel, settings: { 'vmu.members.maxTempPerMember': 1, 'vmu.turn.deliveryTimeoutMs': 1 } })
  await adapter.install()
  const spec = host.state.specs.find((s) => s.name === 'vibe_vmu_tools')
  ok(spec !== undefined, '★ 声明 members 面时内核自省工具真的发布', host.state.specs.map((s) => s.name))
  const parsed = JSON.parse(await spec.execute({ member: 'member-a' }, {}))
  ok(parsed.ok === true && parsed.count === 2 && parsed.tools.map((t) => t.name).join(',') === 'vibe_vmu_status,vibe_vmu_turn',
    '★ 正：返回集合 == visibleToolsOf 的实际集合', parsed)
  ok(parsed.tools.every((t) => typeof t.purpose === 'string' && t.purpose.length > 0),
    '★ 每项都有一句用途（来自 host 发布的描述，不是编造）', parsed.tools)
  const bareHost = fakeHost()
  const noAgent = hm.createHostAdapter({ ctx: bareHost.ctx, kernel, settings: { 'vmu.members.maxTempPerMember': 1 } })
  await noAgent.install()
  const bareSpec = bareHost.state.specs.find((s) => s.name === 'vibe_vmu_tools')
  const refusal = JSON.parse(await bareSpec.execute({ member: 'member-a' }, {}))
  ok(refusal.ok === false && refusal.code === 'VMU_NO_SUCH_OBJECT',
    '★ 反：无 live Agent ⇒ 具名拒（不返回空清单假装成功）', refusal)
}

// ── ★ PHASE 8 / round 37: vibe_vmu_vote writes through the SAME function as the reply path ────────────────────
{
  const k = km.createKernel({ clock })
  k.declareSlots([{ id: 'member', label: '成员', capacity: 0, permissions: ['vote'] }, { id: 'temp', label: '临时', capacity: 2, permissions: [] }])
  await k.members.hire({ id: 'member-a', slot: 'member', institution: 'sim' })
  await k.members.hire({ id: 'temp-a', slot: 'temp', institution: 'sim' })
  const host = fakeHost()
  const adapter = hm.createHostAdapter({ ctx: host.ctx, kernel: k, settings: { 'vmu.turn.closureVotePermission': 'vote', 'vmu.members.maxTempPerMember': 1 } })
  await adapter.install()
  const vote = host.state.specs.find((s) => s.name === 'vibe_vmu_vote')
  ok(vote !== undefined, '★ 正：turn 面声明时 vibe_vmu_vote 真的发布', host.state.specs.map((s) => s.name))
  const beforeWrites = k.turn.status().closureVoteWrites
  // reply path FIRST (this turn has no tool vote yet), then the tool path: both increment the SAME counter.
  const viaReply = await k.turn.apply({ vote_solved: false }, null, 'member-a')
  const afterReply = k.turn.status().closureVoteWrites
  ok(afterReply === beforeWrites + 1 && k.turn.status().closureVoteVotes.get('member-a') === false,
    '★ 正：回执路径 ⇒ 同一 writer 计数 +1，账本写入 false',
    JSON.stringify({ viaReply, beforeWrites, afterReply, votes: Object.fromEntries(k.turn.status().closureVoteVotes) }))
  const viaTool = JSON.parse(await vote.execute({ member: 'member-a', solved: true, why: 'tool' }, {}))
  const afterTool = k.turn.status().closureVoteWrites
  ok(viaTool.ok === true && afterTool === afterReply + 1 && k.turn.status().closureVoteVotes.get('member-a') === true,
    '★ 正：投票工具路径 ⇒ 同一 writer 计数再 +1，同一条记录覆盖为 true（跨回合最新票生效）', JSON.stringify({ viaTool, afterReply, afterTool }))
  const denied = JSON.parse(await vote.execute({ member: 'temp-a', solved: true }, {}))
  ok(denied.ok === false && denied.code === 'VMU_NOT_PERMITTED',
    '★ 反：非票权席位（temp）调 vote ⇒ 具名拒（复用 may 资格判断）', denied)
  const unknown = JSON.parse(await vote.execute({ member: 'ghost-x', solved: true }, {}))
  ok(unknown.ok === false && unknown.code === 'VMU_NO_SUCH_OBJECT',
    '★ 反：不在册成员 ⇒ VMU_NO_SUCH_OBJECT（不是空票）', unknown)
  let badName = null
  try { k.validateToolFaceNames(['ghost-tool']) } catch (e) { badName = e }
  ok(badName && badName.code === 'VMU_INVALID_ARGUMENT', '★ 反：allow 里的未注册名 ⇒ 具名拒（validateToolFaceNames）', badName && badName.code)
  ok(k.validateToolFaceNames(['vibe_vmu_vote']).ok === true, '★ 正：已注册名通过目录校验', k.validateToolFaceNames(['vibe_vmu_vote']))
  // ★ PHASE 8 / round 39: ONE TURN, ONE CHANNEL. Tool path writes false; the SAME turn's reply vote_solved:true must be
  // ignored (bookkeeping kept:false). A DIFFERENT turn (no prior tool write) still records the reply field.
  const sameTurn = await k.turn.recordClosureVote('member-a', false, 'tool')
  const replySame = await k.turn.apply({ vote_solved: true }, null, 'member-a')
  ok(sameTurn.ok === true && k.turn.status().closureVoteVotes.get('member-a') === false &&
    Array.isArray(replySame.bookkeeping) && replySame.bookkeeping.some((b) => b.field === 'vote_solved' && b.kept === false),
    '★ 正：同回合工具票 false ⇒ 回执 vote_solved:true 被忽略且 bookkeeping 记 kept:false', JSON.stringify({ sameTurn, replySame, votes: Object.fromEntries(k.turn.status().closureVoteVotes) }))
  const k2 = km.createKernel({ clock })
  k2.declareSlots([{ id: 'member', label: '成员', capacity: 0, permissions: ['vote'] }])
  await k2.members.hire({ id: 'member-a', slot: 'member', institution: 'sim' })
  const replyOnly = await k2.turn.apply({ vote_solved: true }, null, 'member-a')
  ok(k2.turn.status().closureVoteVotes.get('member-a') === true && replyOnly.ok === true,
    '★ 反：没有工具票的回合 ⇒ 回执 vote_solved 仍生效（旧路径零机制）', JSON.stringify({ replyOnly, votes: Object.fromEntries(k2.turn.status().closureVoteVotes) }))
}
{
  const kernel = km.createKernel({ clock })
  kernel.declareSlots([
    { id: 'member', label: '成员', capacity: 0, permissions: ['vote'] },
    { id: 'temp', label: '临时', capacity: 0, permissions: [] },
  ])
  // declaration BEFORE the member is seated: the pull resolver must still apply it on the next request
  kernel.declarePackToolFaces({ member: { deny: ['vibe_v5_say'] } }, { by: 'probe-pack' })
  await kernel.members.hire({ id: 'member-a', slot: 'member', institution: 'sim' })
  await kernel.members.hire({ id: 'temp-b', slot: 'temp', institution: 'sim' })
  const mkAgent = (id, names) => ({ id, ctx: { tools: { schemas: () => names.map((name) => ({ name })), restrict: () => () => {} } } })
  const agentA = mkAgent('member-a', ['vibe_v5_say', 'vibe_vmu_status'])
  const agentB = mkAgent('temp-b', ['vibe_v5_say', 'vibe_vmu_status'])
  const listeners = {}
  const state = { specs: [], live: new Set() }
  const ctx = {
    tools: { register: async (s) => { state.specs.push(s); state.live.add(s.name); return () => {} }, schemas: () => [...state.live] },
    effect: (fn) => fn(),
    on: (event, fn) => { (listeners[event] = listeners[event] || []).push(fn) },
    get: (name) => (name === 'agents' ? { get: (id) => ({ 'member-a': agentA, 'temp-b': agentB }[id] || null) } : null),
  }
  const adapter = hm.createHostAdapter({ ctx, kernel, settings: { 'vmu.members.maxTempPerMember': 1 } })
  await adapter.install()
  const hook = (listeners['system-prompt/assemble'] || [])[0]
  ok(typeof hook === 'function', '★ 订阅到了 system-prompt/assemble（pull 钩子存在）', Object.keys(listeners))
  const runHook = async (agent, tools) => {
    const assembly = { tools: tools.map((name) => ({ name })) }
    const out = await hook(assembly, { agent }, () => Promise.resolve(assembly))
    return out.tools.map((t) => t.name)
  }
  const aTools = await runHook(agentA, ['vibe_v5_say', 'vibe_vmu_status'])
  ok(aTools.join(',') === 'vibe_vmu_status', '★ 正：member 槽的 deny 在请求前生效（可见集 == deny 的补集）', aTools)
  const bTools = await runHook(agentB, ['vibe_v5_say', 'vibe_vmu_status'])
  ok(bTools.join(',') === 'vibe_v5_say,vibe_vmu_status', '★ 反：另一个 agent 的可见集不受影响（不串）', bTools)
  kernel.setMemberToolOverride({ member: 'member-a', all: true })
  const none = await runHook(agentA, ['vibe_v5_say', 'vibe_vmu_status'])
  ok(none.length === 0, '★ 正：tools:"none" 的 per-turn override ⇒ 可见集为空', none)
  kernel.clearMemberToolOverride('member-a')
  const restored = await runHook(agentA, ['vibe_v5_say', 'vibe_vmu_status'])
  ok(restored.join(',') === 'vibe_vmu_status', '★ 反：override 清除后恢复为槽 deny 的补集', restored)
  // ★ PHASE 9 / round 4: the SAME effective list is rendered into the prompt block; no second table.
  const runOut = async (agent, tools) => {
    const assembly = { tools: tools.map((name) => ({ name })) }
    const out = await hook(assembly, { agent }, () => Promise.resolve(assembly))
    const block = (out.sections || []).find((s) => s.name === 'v5r-effective-tools')
    return { out, block }
  }
  const roleOut = await runOut(agentA, ['vibe_v5_say', 'vibe_vmu_status'])
  ok(roleOut.block && /【本轮你实际能调用的工具｜member】1 个：vibe_vmu_status/.test(roleOut.block.text),
    '★ 正：角色收窄回合的提示词块 == wire（同源，只有 vibe_vmu_status）', roleOut.block && roleOut.block.text)
  kernel.setMemberToolOverride({ member: 'member-a', allow: ['vibe_vmu_status'] })
  const allowOut = await runOut(agentA, ['vibe_v5_say', 'vibe_vmu_status'])
  ok(allowOut.block && /1 个：vibe_vmu_status/.test(allowOut.block.text) && allowOut.out.tools.map((t) => t.name).join(',') === 'vibe_vmu_status',
    '★ 正：tools:{allow} 回合的提示词块 == wire（都只有 allow 的名字）', allowOut.block && allowOut.block.text)
  kernel.clearMemberToolOverride('member-a')
  kernel.setMemberToolOverride({ member: 'member-a', all: true })
  const noneOut = await runOut(agentA, ['vibe_v5_say', 'vibe_vmu_status'])
  ok(noneOut.block && /【本轮你实际能调用的工具｜member】0 个/.test(noneOut.block.text) && noneOut.out.tools.length === 0,
    '★ 反 2：tools:"none" 回合提示词块说 0 个（不退化成空块/沿用上次）', noneOut.block && noneOut.block.text)
  kernel.clearMemberToolOverride('member-a')
  ok(kernel.toolFacePull && kernel.toolFacePull().effectiveBlock === 'appended',
    '★ 无 pack 占位段 ⇒ 记录 effectiveBlock=appended（不静默）', kernel.toolFacePull && kernel.toolFacePull().effectiveBlock)
  const placeholder = { tools: [{ name: 'vibe_v5_say' }, { name: 'vibe_vmu_status' }], sections: [{ name: 'v5r-effective-tools', text: 'OLD' }] }
  const replacedOut = await hook(placeholder, { agent: agentA }, () => Promise.resolve(placeholder))
  const replacedBlocks = (replacedOut.sections || []).filter((s) => s.name === 'v5r-effective-tools')
  ok(replacedBlocks.length === 1 && /vibe_vmu_status/.test(replacedBlocks[0].text) && !/OLD/.test(replacedBlocks[0].text),
    '★ 正：pack 提供占位段 ⇒ 原段被替换（不是追加第二段）', replacedBlocks.map((s) => s.text))
  // ★ PHASE 9 / round 5: mail notice must actually enter the member prompt (non-urgent: notice only; urgent: body).
  kernel.mailbox.send('chair', { to: 'member-a', subject: '非紧急进展同步', text: '今日进度已记录', kind: 'notice' })
  const plainMail = await runOut(agentA, ['vibe_v5_say', 'vibe_vmu_status'])
  const plainBlock = (plainMail.out.sections || []).find((s) => s.name === 'v5r-mail-notice')
  ok(plainBlock && /你收到 1 条新留言/.test(plainBlock.text) && !/今日进度已记录/.test(plainBlock.text),
    '★ 正：非紧急留言 ⇒ 提示词出现“收到 N 条留言”，但不带正文', plainBlock && plainBlock.text)
  kernel.mailbox.send('chair', { to: 'member-a', subject: '紧急：请立刻回复', text: '紧急正文内容', kind: 'notice', urgent: true })
  const urgentMail = await runOut(agentA, ['vibe_v5_say', 'vibe_vmu_status'])
  const urgentBlock = (urgentMail.out.sections || []).find((s) => s.name === 'v5r-mail-notice')
  ok(urgentBlock && /紧急正文内容/.test(urgentBlock.text),
    '★ 正：紧急留言 ⇒ 提示词带正文', urgentBlock && urgentBlock.text)
  ok(kernel.mailbox.status().delivery && kernel.mailbox.status().delivery.flushCalls >= 2 && kernel.mailbox.status().delivery.sent >= 2,
    '★ 诊断计数：deliverable/flush/sent 可读（不再靠猜）', kernel.mailbox.status().delivery)
  const zero = km.createKernel({ clock })
  zero.declareSlots([{ id: 'member', label: '成员', capacity: 0 }])
  await zero.members.hire({ id: 'member-a', slot: 'member', institution: 'sim' })
  const zeroView = (() => { try { return zero.resolveMemberToolDeny('member-a') } catch (e) { return { error: e.code } } })()
  ok(!zeroView.source, '★ 反：无 pack 声明 ⇒ resolver 不产生 deny（零机制）', zeroView)
}

// ── PHASE 8 / goal 10 (round 37): the host EXECUTES the pack's toolPresentation declaration ────────────────────────
// One assertion per mode, plus the negative shapes that matter: nothing declared (zero mechanism) and an explicit
// `native` (same effect, different semantics — the receipt says which one happened).
{
  const mkCapture = (withPresentAs) => {
    const seen = []; const presentCalls = []
    const tools = { register: (spec) => { seen.push(spec); return () => {} } }
    if (withPresentAs) tools.presentAs = (mode) => { presentCalls.push(mode); return () => {} }
    return { ctx: { effect: (fn) => fn(), tools }, seen, presentCalls }
  }
  const mkKernel = (decl) => {
    const k = km.createKernel({ clock })
    k.declarePackTools([
      { name: 'probe_pres_a', description: 'declared face', handler: () => ({ ok: true }) },
      { name: 'probe_pres_b', description: 'other face', handler: () => ({ ok: true }) },
    ], { by: 'p-pres' })
    if (decl) k.declarePackToolPresentation(decl, { by: 'p-pres' })
    return k
  }
  // 反 1: NOTHING declared ⇒ no deferLoading anywhere, presentAs never called.
  {
    const cap = mkCapture(true)
    const receipt = await hm.createHostAdapter({ ctx: cap.ctx, kernel: mkKernel(null), settings: {} }).install()
    const sa = cap.seen.filter((s) => s.name === 'probe_pres_a')[0]
    ok(sa && sa.deferLoading === undefined && cap.presentCalls.length === 0 && receipt.presentation && receipt.presentation.mode === null,
      '★ 反（零机制）：不声明 ⇒ spec 无 deferLoading、不调 presentAs、回执 presentation.mode=null', receipt && receipt.presentation)
  }
  // 正: `defer` names ONE face ⇒ only that spec gets deferLoading (per-tool, not per-batch).
  {
    const cap = mkCapture(true)
    const receipt = await hm.createHostAdapter({ ctx: cap.ctx, kernel: mkKernel({ mode: 'defer', faces: ['probe_pres_a'] }), settings: {} }).install()
    const sa = cap.seen.filter((s) => s.name === 'probe_pres_a')[0]
    const sb = cap.seen.filter((s) => s.name === 'probe_pres_b')[0]
    ok(sa && sa.deferLoading === true && sb && sb.deferLoading === undefined && cap.presentCalls.length === 0 && receipt.presentation.mode === 'defer',
      '★★ 正（defer）：声明的那一个 spec 带 deferLoading:true，同批其它 face 不带，且不调 presentAs', receipt && receipt.presentation)
  }
  // 反 2: explicit `native` ⇒ same EFFECT as nothing declared; the receipt records the distinct semantic.
  {
    const cap = mkCapture(true)
    const receipt = await hm.createHostAdapter({ ctx: cap.ctx, kernel: mkKernel({ mode: 'native' }), settings: {} }).install()
    const sa = cap.seen.filter((s) => s.name === 'probe_pres_a')[0]
    ok(sa && sa.deferLoading === undefined && cap.presentCalls.length === 0 && receipt.presentation.mode === 'native',
      '★ 反（native）：效果与"不声明"相同（无 deferLoading、不调 presentAs），回执记录 mode=native（语义不同）', receipt && receipt.presentation)
  }
  // 正: `ptc` ⇒ install does NOT guess on the entry ctx; it defers to the per-AGENT assemble hook.
  {
    const cap = mkCapture(true)
    const receipt = await hm.createHostAdapter({ ctx: cap.ctx, kernel: mkKernel({ mode: 'ptc' }), settings: {} }).install()
    ok(cap.presentCalls.length === 0 && receipt.presentation.deferredToHook === true && receipt.presentation.mode === 'ptc',
      '★★ 正（ptc）：安装时不在入口 ctx 上猜；标记 deferredToHook，真正应用留给 per-agent assemble hook', { calls: cap.presentCalls, presentation: receipt.presentation })
  }
  // 反 3: install cannot know an agent ctx at install time; it must NOT fake native and must NOT mark failure. The NAMED
  // unapplied entry is produced later, by the hook, when that agent really lacks presentAs.
  {
    const cap = mkCapture(false)
    const receipt = await hm.createHostAdapter({ ctx: cap.ctx, kernel: mkKernel({ mode: 'ptc' }), settings: {} }).install()
    const rows = receipt.presentation && Array.isArray(receipt.presentation.unapplied) ? receipt.presentation.unapplied : []
    ok(receipt.ok === true && receipt.presentation.deferredToHook === true && rows.length === 0,
      '★★ 反（不静默降级）：安装时入口 ctx 没有 presentAs 也不再假装应用；deferredToHook 交给 agent hook，届时无 presentAs 才具名 VMU_ENGINE_UNAVAILABLE', rows)
  }
}

// ── PHASE 9 / new goal round 1: PTC changes the wire; the block must not claim "wire-identical" ────────────────────
{
  const mkPtc = async (withPresentAs) => {
    const listeners = {}
    const presentCalls = []
    const agent = { id: 'member-a', ctx: { tools: {
      schemas: () => [{ name: 'vibe_v5_say' }, { name: 'vibe_vmu_status' }],
      restrict: () => () => {},
      ...(withPresentAs ? { presentAs: async (mode) => { presentCalls.push(mode); return () => {} } } : {}),
    } } }
    const ctx = {
      tools: { register: async () => () => {} },
      effect: (fn) => fn(),
      on: (event, fn) => { (listeners[event] = listeners[event] || []).push(fn) },
      get: (name) => (name === 'agents' ? { get: (id) => (id === 'member-a' ? agent : null) } : null),
    }
    const k = km.createKernel({ clock })
    k.declareSlots([{ id: 'member', label: '成员', capacity: 1 }])
    await k.members.hire({ id: 'member-a', slot: 'member', institution: 'sim' })
    k.declarePackToolPresentation({ mode: 'ptc' }, { by: 'p-ptc' })
    await hm.createHostAdapter({ ctx, kernel: k, settings: {} }).install()
    const hook = (listeners['system-prompt/assemble'] || [])[0]
    const assembly = { tools: [{ name: 'vibe_v5_say' }, { name: 'vibe_vmu_status' }] }
    const out = await hook(assembly, { agent }, () => Promise.resolve(assembly))
    const block = (out.sections || []).find((s) => s.name === 'v5r-effective-tools')
    return { block, presentCalls, kernel: k }
  }
  const ptc = await mkPtc(true)
  ok(ptc.presentCalls.includes('ptc') && ptc.block && /【本轮工具呈现｜member】/.test(ptc.block.text) &&
    /run_code 呈现/.test(ptc.block.text) && /呈现方式的差异，不是收窄/.test(ptc.block.text) &&
    !/与你这回合的 wire 完全一致/.test(ptc.block.text),
    '★ 正（ptc）：块如实说“以 run_code 呈现”，且不写“wire 完全一致”这句错话', ptc.block && ptc.block.text)
  ok(ptc.block && /vibe_v5_say/.test(ptc.block.text) && /vibe_vmu_status/.test(ptc.block.text),
    '★ 正（ptc）：可代码调用的名字仍来自同一个 effectiveNames', ptc.block && ptc.block.text)
  const native = await mkPtc(false)
  ok(native.presentCalls.length === 0 && native.block && /【本轮你实际能调用的工具｜member】2 个：vibe_v5_say、vibe_vmu_status/.test(native.block.text) &&
    /这份列表与你这回合的 wire 完全一致/.test(native.block.text) && !/run_code|呈现/.test(native.block.text),
    '★ 反（ptc 未应用）：没有 presentAs ⇒ 回落 native 逐字形状（wire 真的没变）', native.block && native.block.text)
  const hostSrc = await readFile(join(REPO, 'vibe-math-vmu', 'host.js'), 'utf8')
  ok((hostSrc.match(/const effectiveNames =/g) || []).length === 1,
    '★ 名字只有一个来源：源码里 effectiveNames 只声明一次，块与 wire 只能从它取名字', (hostSrc.match(/const effectiveNames =/g) || []).length)
}

// ── PHASE 9+ / G5: every TOOL_NAMES row is either REGISTERED or has an explicit false family/surface ───────────────
{
  const settings = { 'vmu.tools.faces': ['*'], 'vmu.tools.allowAll': true }
  const faces = hm.resolveFaces({ settings })
  const kernel = km.createKernel({ clock })
  const specs = hm.toolSpecs({ kernel, settings, faces, assertDeclared: () => true }).map((s) => s.name)
  const missing = Object.values(hm.TOOL_NAMES).filter((n) => !specs.includes(n))
  const explained = missing.map((n) => (faces.unavailable || []).find((u) => u.name === n) || null)
  ok(missing.length === 3 &&
    missing.includes(hm.TOOL_NAMES.records) && missing.includes(hm.TOOL_NAMES.script) && missing.includes(hm.TOOL_NAMES.pack) &&
    explained.every((u) => u && u.code === 'VMU_ENGINE_UNAVAILABLE' && typeof u.reason === 'string'),
    '★ 门禁：每个 TOOL_NAMES 要么注册，要么有明确的家族/surface 条件为假；未注册的 3 个各自带原因', {
      missing, reasons: explained.map((u) => u && { name: u.name, declaredBy: u.declaredBy, reason: u.reason }),
    })
}

// ── ★ PHASE 9 / round 5: `*` is a DECISION, not a typo; and "in effect" must be visible ─────────────────────────
{
  const unconfirmed = hm.resolveFaces({ settings: { 'vmu.tools.faces': ['*'] } })
  ok(unconfirmed.toolsWildcardUnconfirmed === true && unconfirmed.toolsWildcardInEffect === false &&
    unconfirmed.enabled.includes('status') && !unconfirmed.enabled.includes('mailbox'),
    '★ 反：`*` 未确认（allowAll 非 true）⇒ 不生效，只留下 always 的 status 面，并带 toolsWildcardUnconfirmed', unconfirmed)
  const confirmed = hm.resolveFaces({ settings: { 'vmu.tools.faces': ['*'], 'vmu.tools.allowAll': true } })
  ok(confirmed.toolsWildcardInEffect === true && confirmed.toolsWildcardUnconfirmed === false && confirmed.enabled.length > 1,
    '★ 正：`*` + allowAll:true ⇒ 全开生效，toolsWildcardInEffect:true', { enabled: confirmed.enabled.length, toolsWildcardInEffect: confirmed.toolsWildcardInEffect })
  const unused = hm.resolveFaces({ settings: { 'vmu.tools.allowAll': true } })
  ok(unused.toolsAllowAllUnused === true && unused.toolsWildcardInEffect === false,
    '★ 反：allowAll:true 但 faces 没有 `*` ⇒ 标记 unused（不让人以为它生效了）', unused)
  const h = fakeHost()
  const adapter = hm.createHostAdapter({ ctx: h.ctx, kernel: km.createKernel({ clock }), settings: { 'vmu.tools.faces': ['*'] } })
  const receipt = await adapter.install()
  ok(receipt.ok === false && (receipt.failures || []).some((f) => f.name === '(tools wildcard)' && /allowAll/.test(f.hint || '')),
    '★ 反：install 对未确认的 `*` 报具名 problem（hint 指向 allowAll），不静默全开', receipt.failures)
  const h2 = fakeHost()
  const adapter2 = hm.createHostAdapter({ ctx: h2.ctx, kernel: km.createKernel({ clock }), settings: { 'vmu.tools.faces': ['*'], 'vmu.tools.allowAll': true } })
  await adapter2.install()
  const statusSpec = h2.state.specs.find((s) => s.name === 'vibe_vmu_status')
  const summary = JSON.parse(await statusSpec.execute({ detail: 'summary' }, {}))
  ok(summary.toolsWildcardInEffect === true,
    '★ 正：status() 顶层暴露 toolsWildcardInEffect:true（生效可见，summary 重塑后仍在）', summary.toolsWildcardInEffect)
}

// ★ G6 tier 2 (measured on a real machine): (a) `wait` was silently dropped from `vmu.tools.faces` (the face id is
// `activity`); (b) after a member turn's identity was lost (the outer step timed out and cleared the active member),
// the host pull returned the FULL 87-tool catalogue, so the per-role narrowing was bypassable from inside a member
// turn. Both are asserted here: an unknown face name is a NAMED refusal, and a member's face may NARROW or stay the
// same, never WIDEN.
{
  // (a) unknown face name vs the two spellings that ARE valid (face key, tool name)
  const bad = hm.resolveFaces({ settings: { 'vmu.tools.faces': ['wait'] } })
  ok(Array.isArray(bad.unknownListed) && bad.unknownListed.join(',') === 'wait' && !bad.enabled.includes('activity'),
    '★ G6 反：`vmu.tools.faces:["wait"]`（面 id 是 activity）⇒ unknownListed:["wait"]，不再静默丢弃', bad.unknownListed)
  const goodFace = hm.resolveFaces({ settings: { 'vmu.tools.faces': ['activity'] } })
  ok(goodFace.unknownListed.length === 0 && goodFace.enabled.includes('activity'),
    '★ G6 正：面 id `activity` ⇒ 生效且无未知名', { enabled: goodFace.enabled, unknown: goodFace.unknownListed })
  const goodTool = hm.resolveFaces({ settings: { 'vmu.tools.faces': ['vibe_vmu_wait'] } })
  ok(goodTool.unknownListed.length === 0 && goodTool.enabled.includes('activity'),
    '★ G6 正：工具名拼写 `vibe_vmu_wait` 也被识别（映射到 activity 面）', goodTool.enabled)
  const hBad = fakeHost()
  const adapterBad = hm.createHostAdapter({ ctx: hBad.ctx, kernel: km.createKernel({ clock }), settings: { 'vmu.tools.faces': ['wait'] } })
  let threw = null
  try { adapterBad.plan() } catch (e) { threw = e }
  ok(threw && threw.code === 'VMU_INVALID_ARGUMENT' && /unknown tool face name/.test(String(threw.message)) && /activity/.test(String(threw.hint)),
    '★ G6 反：装配时未知名 ⇒ 具名拒 VMU_INVALID_ARGUMENT（hint 列出已知面/工具名），不是"少一个面照跑"',
    threw && { code: threw.code, hint: String(threw.hint).slice(0, 120) })

  // (b) sticky narrow face: first request narrow, then the member identity is lost ⇒ stays narrow; root unaffected
  const roster = [{ id: 'r-1', state: 'live', slot: 'member' }]
  const full = ['vibe_vmu_task', 'vibe_vmu_turn', 'vibe_vmu_meeting', 'host_tool_x']
  let current = 'r-1'
  let session = 'child-1'
  let handler = null
  const stub = {
    members: { roster: () => roster },
    memberSession: (id) => (id === 'r-1' ? session : null),
    resolveMemberToolDeny: () => (current ? { allow: ['vibe_vmu_task'], deny: [], slot: 'member' } : { deny: [], slot: 'member' }),
    memberToolOverride: (m) => (m === 'r-1' && current ? { all: false, allow: ['vibe_vmu_task'], deny: [] } : null),
    currentTurnMember: () => current,
    noteToolFacePull: () => {}, toolFacePull: () => ({}), status: () => ({}),
    packTools: () => [], setToolFaceCatalogue: () => {}, setToolFaceDescriptions: () => {},
    setMemberToolFaceApplier: () => {}, setToolFacePullRegistered: () => {}, setPackToolRetractObserver: () => {},
  }
  const ctx = { effect(fn) { return fn() }, get() { return null }, root: null, on(ev, fn) { if (ev === 'system-prompt/assemble') handler = fn; return () => {} } }
  const adapter = hm.createHostAdapter({
    ctx, kernel: stub, settings: { 'vmu.core.enabled': true },
    faces: { enabled: ['status'], disabled: [], unavailable: [], unknownDisabled: [], unknownListed: [], sources: {} },
  })
  void adapter
  const agent = { id: 'child-1', ctx: { tools: { restrict: () => () => {}, schemas: () => [] } } }
  const asm = (withMember) => ({
    sections: withMember ? [{ name: 'v5r-role-block', text: '【本轮面向的成员】代号：r-1' }] : [],
    contexts: [],
    tools: full.map((name) => ({ name })),
  })
  const first = await handler(asm(true), { agent }, async () => asm(true))
  ok(first.tools.length === 1 && first.tools[0].name === 'vibe_vmu_task',
    '★ G6 正：成员首次请求的 wire 只挂 allow 面（1 个）', first.tools.map((t) => t && t.name))
  current = null  // the outer step timed out: its finally cleared the active member
  session = null  // the learned session map no longer answers
  const second = await handler(asm(false), { agent }, async () => asm(false))
  ok(second.tools.length === 1 && second.tools[0].name === 'vibe_vmu_task',
    '★ G6 反（本轮最严重）：成员身份丢失后 wire 仍只挂窄面，绝不回落到全开（修前这里变成 4/87 个宿主工具）',
    second.tools.map((t) => t && t.name))
  const rootAgent = { id: 'session-root', ctx: { tools: { restrict: () => () => {}, schemas: () => [] } } }
  const root = await handler(asm(false), { agent: rootAgent }, async () => asm(false))
  ok(root.tools.length === 4 && full.length === 4,
    '★ G6 正：root（session-…）的 wire 不受 sticky 影响，仍是全量（fixture 4 个）', root.tools.length)

  // ★ G7 ⑥ (mirror of the wire leak): the effective-tools section is PER-AGENT and used to be MUTATED IN PLACE, so the
  // next assembly (root) inherited the last member's block. Same shared section object: member first, then root.
  {
    let handler2 = null
    const sharedSection = { name: 'v5r-effective-tools', text: '【本轮你实际能调用的工具｜占位段】' }
    const stub2 = {
      members: { roster: () => [{ id: 'r-1', state: 'live', slot: 'member' }] },
      memberSession: (id) => (id === 'r-1' ? 'child-9' : null),
      resolveMemberToolDeny: () => ({ allow: ['vibe_vmu_task'], deny: [], slot: 'member' }),
      memberToolOverride: () => ({ all: false, allow: ['vibe_vmu_task'], deny: [] }),
      currentTurnMember: () => 'r-1',
      noteToolFacePull: () => {}, toolFacePull: () => ({}), status: () => ({}),
      packTools: () => [], setToolFaceCatalogue: () => {}, setToolFaceDescriptions: () => {},
      setMemberToolFaceApplier: () => {}, setToolFacePullRegistered: () => {}, setPackToolRetractObserver: () => {},
    }
    const ctx2 = { effect(fn) { return fn() }, get() { return null }, root: null, on(ev, fn) { if (ev === 'system-prompt/assemble') handler2 = fn; return () => {} } }
    hm.createHostAdapter({
      ctx: ctx2, kernel: stub2, settings: { 'vmu.core.enabled': true },
      faces: { enabled: ['status'], disabled: [], unavailable: [], unknownDisabled: [], unknownListed: [], sources: {} },
    })
    const memberAgent = { id: 'child-9', ctx: { tools: { restrict: () => () => {}, schemas: () => [] } } }
    const rootAgent2 = { id: 'session-root', ctx: { tools: { restrict: () => () => {}, schemas: () => [] } } }
    const assembly = () => ({ sections: [sharedSection], contexts: [], tools: full.map((name) => ({ name })) })
    const memberOut = await handler2(assembly(), { agent: memberAgent }, async () => assembly())
    const memberText = String((memberOut.sections.find((s) => s && s.name === 'v5r-effective-tools') || {}).text || '')
    const rootOut = await handler2(assembly(), { agent: rootAgent2 }, async () => assembly())
    const rootText = String((rootOut.sections.find((s) => s && s.name === 'v5r-effective-tools') || {}).text || '')
    ok(/｜member】/.test(memberText) && !/｜member】/.test(rootText),
      '★ G7 ⑥: the shared section object does NOT leak the member block into the ROOT assembly (per-agent, copy-on-write)',
      { memberText: memberText.slice(0, 90), rootText: rootText.slice(0, 90) })
    ok(!/｜member】/.test(JSON.stringify(rootOut.sections)),
      '★ G7 ⑥: no root prompt section anywhere contains the member-only block (slv-inspect criterion, held locally)')
  }
}

console.log('=== VMU HOST: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

