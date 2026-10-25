// vmu preset entry — the capability scenario for vibe-math-vmu.js (docs/03 §1, docs/11 §9).
//
// The entry point is where the design meets a real host, so the scenarios cover the host-visible promise,
// the host's lifecycle contract, and the shape the REAL host accepted (execute + JSON string + content-part
// render, learned from the first scripted live run and from this repo's working preset):
//   · the module loads under PLAIN NODE (no host import at all) - which is why it declares no `Config`;
//   · with no configuration it registers exactly ONE tool (`vibe_vmu_status`) and injects no prompt;
//   · with `vmu.core.enabled=false` it registers NOTHING;
//   · every registration goes through `ctx.effect(fn, label)` (labels are observable), and the host owns
//     the unwind;
//   · a prompt section is injected ONLY when the configuration declares one;
//   · declared middleware is ACTIVATED (kernel.start()) and an undeclared setting key is still refused.
//
// `--self-probe` copies the entry, removes the "prompt only when declared" condition and requires the
// zero-prompt assertion to fail.

import { createHostMath } from '../vibe-math-vmu/host-math.js'
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const ENTRY = resolve(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const SELF_PROBE = process.argv.includes('--self-probe')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

const entry = await import(pathToFileURL(ENTRY).href)
const clock = () => '2026-10-09T00:00:00.000Z'

const fakeCtx = (extra = {}) => {
  const state = { specs: [], disposed: 0, effects: [], sections: [], listeners: {} }
  return {
    state,
    ctx: Object.assign({
      effect(fn, label) { state.effects.push(label); return fn() },
      on(event, handler) { (state.listeners[event] = state.listeners[event] || []).push(handler); return () => { state.listeners[event] = state.listeners[event].filter((h) => h !== handler) } },
      tools: { register: async (spec) => { state.specs.push(spec); return () => { state.disposed++ } } },
    }, extra),
  }
}
const call = async (spec, args = {}) => JSON.parse(await spec.execute(args, {}))

// ---- 1. the entry loads under plain Node and declares the documented shape ---------------------
{
  ok(entry.name === 'vibe-math-vmu', 'the entry declares its name')
  ok(Number.isInteger(entry.apiVersion) && entry.apiVersion >= 1, 'the entry declares an api version')
  ok(Array.isArray(entry.inject) && entry.inject.includes('tools'), 'only the tool surface is REQUIRED (the rest is opportunistic)', JSON.stringify(entry.inject))
  ok(entry.Config === undefined, 'no Config export: the module must stay loadable without the host (no static Schemastery import)')
  ok(typeof entry.apply === 'function', 'the entry exposes apply(ctx, config)')
}

// ---- 2. ZERO MECHANISM IN THE HOST: no config ⇒ exactly one tool, no prompt ---------------------
{
  const host = fakeCtx()
  const handle = entry.apply(host.ctx, { clock })
  await new Promise((r) => setTimeout(r, 0))
  const names = host.state.specs.map((s) => s.name)
  ok(names.join(',') === 'vibe_vmu_status', 'with no configuration exactly ONE tool is registered (status)', names.join(','))
  ok(host.state.effects.includes('vmu:tools') && !host.state.effects.includes('vmu:prompt'),
    'the tools effect ran and NO prompt effect did', host.state.effects.join(','))
  ok(handle.kernel.status().registrations.length === 0, 'the assembled kernel registered no middleware')
  ok(handle.status().plan.count === 1, 'the adapter plan agrees with what was registered')
  const st = await call(host.state.specs[0])
  ok(st.ok === true && st.active === true && st.registrations.length === 0,
    'status reports a STARTED kernel that registered nothing (that is what zero mechanism means)',
    JSON.stringify({ active: st.active, registrations: st.registrations }))
  ok(handle.instance === 'vmu-default' && st.instance === 'vmu-default',
    'the entry defaults to a STABLE instance identity and the status receipt carries it', JSON.stringify({ handle: handle.instance, receipt: st.instance }))
  const namedCtx = fakeCtx()
  const namedHandle = entry.apply(namedCtx.ctx, { clock, instance: 'vmu-second' })
  await new Promise((r) => setTimeout(r, 10))
  ok(namedHandle.instance === 'vmu-second' && (await call(namedCtx.state.specs[0])).instance === 'vmu-second',
    'and config.instance overrides it, so two rows in one profile are distinguishable')
}

// ---- 3. disabled ⇒ nothing at all ---------------------------------------------------------------
{
  const host = fakeCtx()
  entry.apply(host.ctx, { clock, vmu: { 'vmu.core.enabled': false } })
  await new Promise((r) => setTimeout(r, 0))
  ok(host.state.specs.length === 0 && host.state.effects.length === 0,
    'a disabled kernel registers NO tools in the host (inert means invisible)', host.state.specs.length)
}

// ---- 4. declared middleware and a declared root add their tools, and the rule is live -----------
{
  const rule = { id: 'gate', kind: 'rules', on: ['tools/pre-execute'], when: { tool: ['vibe_v5_poll_vote'] }, then: [{ deny: { code: 'VMU_NOT_PERMITTED', message: 'no' } }] }
  const host = fakeCtx()
  const root = await mkdtemp(join(tmpdir(), 'vmu-entry-'))
  const handle = entry.apply(host.ctx, { clock, root, vmu: { 'vmu.middleware.entries': [rule], 'vmu.records.tracks': ['progress'] } })
  await new Promise((r) => setTimeout(r, 0))
  const names = host.state.specs.map((s) => s.name)
  ok(names.includes('vibe_vmu_middleware'), 'declared middleware adds the middleware tool', names.join(','))
  ok(names.includes('vibe_vmu_records'), 'a declared root adds the records tool', names.join(','))
  ok(names.includes('vibe_vmu_set'), 'the settings tool is present because the entry passes a declared-key guard')
  // The declared middleware must also be BRIDGED to the host hooks, or the rule exists and never fires.
  ok(handle.hooks && handle.hooks.plan().hooks.includes('tools/pre-execute'),
    'the declared host hook is planned for bridging', JSON.stringify(handle.hooks && handle.hooks.plan()))
  const denied = await handle.kernel.bus.emit('tools/pre-execute', { tool: 'vibe_v5_poll_vote' }, {})
  ok(denied.ok === false && denied.refused.code === 'VMU_NOT_PERMITTED', 'the declared M1 rule is live in the assembled kernel')
  const setTool = host.state.specs.find((s) => s.name === 'vibe_vmu_set')
  const bad = await call(setTool, { key: 'vmu.ghost.key', value: '1' })
  ok(bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT', 'an undeclared setting key is still refused by name')
  const good = await call(setTool, { key: 'vmu.meetings.wakeRetries', value: '4' })
  ok(good.ok === true && good.value === 4, 'a declared setting can be changed through the tool')
  // With a durable root the store must be OPENED, not merely constructible (P1 durability).
  const openedRes = await handle.storeOpened()
  ok(openedRes && (openedRes.opened === 'created' || openedRes.opened === 'existing') && openedRes.version === 1,
    'the store is opened when a durable root is configured (created, or the existing fold)', JSON.stringify(openedRes))
  ok(handle.kernel.store && handle.kernel.store.stats().open === true, 'and it reports itself open on disk',
    JSON.stringify(handle.kernel.store && handle.kernel.store.stats()))
  for (const cleanup of handle.cleanups) cleanup()
  ok(host.state.disposed === 0, 'with ctx.effect the host owns the unwind (our cleanup must not double-dispose)', host.state.disposed)

  // ---- 5. a prompt section ONLY when declared ---------------------------------------------------
  const quiet = fakeCtx({ systemPrompt: { section: () => () => {}, getSectionOrder: () => 5 } })
  entry.apply(quiet.ctx, { clock })
  await new Promise((r) => setTimeout(r, 0))
  ok(!quiet.state.effects.includes('vmu:prompt'), 'no prompt section is injected when none is declared', quiet.state.effects.join(','))
  const loud = fakeCtx({ systemPrompt: { section: (s) => { loud.state.sections.push(s); return () => {} }, getSectionOrder: () => 5 } })
  entry.apply(loud.ctx, { clock, prompt: 'vmu: only locked objects may be voted on' })
  ok(loud.state.sections.length === 1 && loud.state.sections[0].text.includes('locked objects'),
    'a declared prompt section IS injected, through the host service', JSON.stringify(loud.state.sections))
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

// ---- 6. a shipped PACK is applied through config.packs ------------------------------------------
{
  const host = fakeCtx()
  const packRoot = await mkdtemp(join(tmpdir(), 'vmu-entry-pack-'))
  const handle = entry.apply(host.ctx, { clock, root: packRoot, packs: ['institute-min'] })
  await new Promise((r) => setTimeout(r, 60))
  ok(handle.appliedPacks().length === 1 && handle.appliedPacks()[0].id === 'institute-min',
    'the shipped pack is applied through the entry', JSON.stringify(handle.appliedPacks()))
  ok(handle.packErrors().length === 0, 'and it applied cleanly', JSON.stringify(handle.packErrors()))
  const roles = handle.kernel.requireMembers().roles().map((r) => r.id)
  ok(roles.includes('chair') && roles.includes('member'), 'the pack declared the role slots (the kernel still names no roles)', roles.join(','))
  ok(host.state.specs.length > 0, 'tools were registered in the pack run',
    JSON.stringify({ specs: host.state.specs.map((s) => s.name), installError: handle.installError(), hooksError: handle.hooksError() }))
  const statusSpec = host.state.specs.find((s) => s.name === 'vibe_vmu_status')
  if (statusSpec) {
    const st = await call(statusSpec)
    ok(st.packs.includes('institute-min'), 'status() reports the applied pack (observation matches reality)', JSON.stringify(st.packs))
  } else {
    ok(false, 'vibe_vmu_status must be registered even in a pack-only run',
      JSON.stringify({ specs: host.state.specs.map((s) => s.name), installError: handle.installError(), status: handle.status() }))
  }
  const mwSpec = host.state.specs.find((s) => s.name === 'vibe_vmu_middleware')
  ok(mwSpec !== undefined, 'the middleware tool appears because the BUS has entries, even without a declaration',
    JSON.stringify(host.state.specs.map((s) => s.name)))
  if (mwSpec) {
    const mw = await call(mwSpec, { action: 'list' })
    ok(mw.ok === true && mw.entries.some((e) => e.id === 'institute-min-locked-vote'),
      'and the pack rule is live on the assembled bus', JSON.stringify((mw.entries || []).map((e) => e.id)))
  }
  await rm(packRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

// ---- 7. M2 code modules are loaded and put on the bus ------------------------------------------
{
  const host = fakeCtx()
  const moduleRoot = await mkdtemp(join(tmpdir(), 'vmu-entry-m2-'))
  const m2 = {
    meta: { id: 'slv-module', apiVersion: 1 },
    capabilities: ['deny', 'read-args'],
    hooks: {
      'tools/pre-execute': async (ev) => (ev.tool === 'edit' ? { deny: { code: 'VMU_PACK_SLV_M2_DENIED', message: 'm2: editing is disabled' } } : undefined),
    },
  }
  const handle = entry.apply(host.ctx, { clock, root: moduleRoot, modules: [{ id: 'slv-module', module: m2, capabilities: ['deny', 'read-args'] }] })
  await new Promise((r) => setTimeout(r, 40))
  ok(handle.moduleErrors().length === 0, 'the M2 module loads without error', JSON.stringify(handle.moduleErrors()))
  ok(handle.loadedModules().includes('slv-module'), 'and the loader records it', JSON.stringify(handle.loadedModules()))
  const decision = await handle.kernel.bus.emit('tools/pre-execute', { tool: 'edit' }, {})
  ok(decision.ok === false && decision.refused && decision.refused.code === 'VMU_PACK_SLV_M2_DENIED',
    'the M2 module decides on the assembled bus', JSON.stringify(decision.refused))
  await rm(moduleRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

// ---- 8. PROMPT MANAGEMENT: sections / bindings / overrides really reach the model -------------------
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-prompt-'))
  await mkdir(join(dir, 'briefs'), { recursive: true })
  await writeFile(join(dir, 'briefs', 't-42.md'), 'TASK-BRIEF-FROM-FILE', 'utf8')
  const sections = []
  const h = fakeCtx({ systemPrompt: { section: (s) => { sections.push(s); return () => {} }, getSectionOrder: () => 500 } })
  const handle = entry.apply(h.ctx, {
    clock, root: dir,
    promptSections: [
      { name: 'charter', text: 'CHARTER-TEXT' },
      { name: 'task-brief', file: 'briefs/t-42.md' },
    ],
    promptBindings: [{ section: 'task-brief', task: ['t-42'], owner: 'm-2' }],
  })
  await new Promise((r) => setTimeout(r, 20))
  ok(sections.length === 1, 'exactly one host systemPrompt section is registered (carrying the effective text)', sections.length)
  const text = String(sections[0] && sections[0].text)
  ok(/CHARTER-TEXT/.test(text) && /TASK-BRIEF-FROM-FILE/.test(text),
    'the inline section AND the file-backed section both reach the host, in declaration order', text.slice(0, 60))
  const st = handle.kernel.status().prompt
  ok(st.sections.length === 2 && st.bindings === 1,
    'the kernel pipeline sees the same sections and the binding count', JSON.stringify({ n: st.sections.length, b: st.bindings }))
  ok(st.sections.find((s) => s.name === 'task-brief').source !== undefined,
    'the pipeline reports each section together with its declaring layer')
  const own = handle.prompts()
  ok(own.length === 2 && own.find((s) => s.name === 'charter').source === 'inline' &&
     own.find((s) => s.name === 'task-brief').source === 'file',
    'and the entry distinguishes inline / file / override for the text that actually reaches the host',
    JSON.stringify(own))

  // An override directory wins over the declared text, and the model sees the OVERRIDE (not the original).
  await mkdir(join(dir, 'prompts', 'overrides'), { recursive: true })
  await writeFile(join(dir, 'prompts', 'overrides', 'charter.md'), 'OVERRIDDEN-CHARTER', 'utf8')
  const sections2 = []
  const h2 = fakeCtx({ systemPrompt: { section: (s) => { sections2.push(s); return () => {} } } })
  const handle2 = entry.apply(h2.ctx, {
    clock, root: dir, promptSections: [{ name: 'charter', text: 'CHARTER-TEXT' }],
    vmu: { 'vmu.prompts.overridesDir': 'prompts/overrides' },
  })
  await new Promise((r) => setTimeout(r, 20))
  const text2 = String(sections2[0] && sections2[0].text)
  ok(/OVERRIDDEN-CHARTER/.test(text2) && !/CHARTER-TEXT/.test(text2),
    'vmu.prompts.overridesDir really overrides the text that reaches the host', text2.slice(0, 40))
  ok(handle2.kernel.status().prompt.sections[0].overridden === true,
    'and the pipeline status marks the section as overridden')
  await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

// ---- 9. B2: the pack tool appears only with declared packs, and plan() is pure ----------------------
{
  const h = fakeCtx()
  const dir = await mkdtemp(join(tmpdir(), 'vmu-pack-tool-'))
  const handle = entry.apply(h.ctx, { clock, root: dir, packs: ['institute-min'] })
  await new Promise((r) => setTimeout(r, 60))
  const spec = h.state.specs.find((s) => s.name === 'vibe_vmu_pack')
  ok(spec !== undefined, 'declaring a pack makes the pack tool available')
  if (spec) {
    const list = await call(spec, { action: 'list' })
    ok(list.ok === true && Array.isArray(list.applied) && list.applied.some((a) => a.id === 'institute-min'),
      'list reports what is applied', JSON.stringify(list.applied || list).slice(0, 140))
    const inline = { id: 'inline-demo', version: '1.0.0', slots: [{ id: 'temp', capacity: 1 }] }
    const planned = await call(spec, { action: 'plan', manifest: JSON.stringify(inline) })
    ok(planned.ok === true && planned.id === 'inline-demo' && Array.isArray(planned.actions),
      'plan reports exactly what an inline manifest would change (pure)', JSON.stringify(planned).slice(0, 160))
    const beforeSlots = handle.kernel.requireMembers().roles().length
    await call(spec, { action: 'plan', manifest: JSON.stringify(inline) })
    ok(handle.kernel.requireMembers().roles().length === beforeSlots,
      'and planning TWICE changes nothing (plan is a pure report, not an apply)')
    const badJson = await call(spec, { action: 'plan', manifest: '{not json' })
    ok(badJson.ok === false && badJson.code === 'VMU_INVALID_ARGUMENT', 'a malformed manifest is refused by name', JSON.stringify(badJson))
  }
  // …and with no packs declared the tool must be absent (zero mechanism, R1).
  const plain = fakeCtx()
  entry.apply(plain.ctx, { clock })
  await new Promise((r) => setTimeout(r, 20))
  ok(!plain.state.specs.some((s) => s.name === 'vibe_vmu_pack'),
    'with no declared pack the pack tool does NOT appear (zero mechanism stays intact)',
    plain.state.specs.map((s) => s.name).join(','))
  await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

// ---- 10. V9: declaring math intent publishes the inherited math_computation tool --------------------
{
  const h = fakeCtx({ get: () => undefined })
  const handle = entry.apply(h.ctx, { clock, math: true, vmu: { 'vmu.math.timeoutMs': 12345 } })
  await new Promise((r) => setTimeout(r, 40))
  const ready = await handle.mathReady()
  ok(ready.ok === true && ready.tool === 'math_computation',
    'declaring math publishes the SHARED module\'s tool through the host adapter', JSON.stringify(ready))
  const spec = h.state.specs.find((s) => s.name === 'math_computation')
  ok(spec !== undefined && spec.parameters && spec.parameters.type === 'object' &&
     spec.parameters.additionalProperties === false && Array.isArray(spec.parameters.required),
    'the registered schema is host-shaped (object schema + additionalProperties + top-level required)',
    JSON.stringify(spec && spec.parameters).slice(0, 120))
  if (spec) {
    const probe = JSON.parse(await spec.execute({ op: 'probe' }, {}))
    ok(probe && typeof probe === 'object', 'the tool is CALLABLE end to end through the adapter (probe returns a receipt)',
      JSON.stringify(probe).slice(0, 140))
  }
  // …and the settings reach the module through host.params(): the adapter maps the declared keys.
  const mapped = handle.mathHost().params()
  ok(mapped.mathTimeoutMs === 12345, 'declared vmu.math.* keys are mapped onto the module\'s parameter names',
    JSON.stringify(mapped))
  // ROUND 215: the boundary now READS and VALIDATES two keys the shared module consumes through params(). Reading them
  // literally is deliberate: a computed `settings[key]` is invisible to the settings table's literal scan, and that table
  // is a gate, so a real carrier has to be visible to it. Validation is a real improvement too - a malformed scope used to
  // be defaulted downstream in silence, and now it is refused by name where the setting enters.
  {
    const good = createHostMath({ settings: { 'vmu.math.packages': ['alpha', ' beta '], 'vmu.math.installScope': 'system' } }).params()
    ok(Array.isArray(good.mathPackages) && good.mathPackages.join(',') === 'alpha,beta',
      'vmu.math.packages[+]: read at the boundary and normalised (trimmed, blanks dropped)', JSON.stringify(good.mathPackages))
    ok(good.mathInstallScope === 'system', 'vmu.math.installScope[+]: a valid scope passes through unchanged', String(good.mathInstallScope))
    let refused = null
    try { createHostMath({ settings: { 'vmu.math.installScope': 'banana' } }).params() } catch (e) { refused = e && e.code }
    ok(refused === 'VMU_INVALID_ARGUMENT', 'vmu.math.installScope[-]: a bad scope is refused BY NAME at the boundary', String(refused))
    let refusedPkgs = null
    try { createHostMath({ settings: { 'vmu.math.packages': 'not-a-list' } }).params() } catch (e) { refusedPkgs = e && e.code }
    ok(refusedPkgs === 'VMU_INVALID_ARGUMENT', 'vmu.math.packages[-]: a non-list is refused BY NAME at the boundary', String(refusedPkgs))
  }
  // No declaration ⇒ no math tool (zero mechanism, R1).
  const plain = fakeCtx({ get: () => undefined })
  entry.apply(plain.ctx, { clock })
  await new Promise((r) => setTimeout(r, 20))
  ok(!plain.state.specs.some((s) => s.name === 'math_computation'),
    'without a math declaration nothing is published (zero mechanism stays intact)',
    plain.state.specs.map((s) => s.name).join(','))
}

// ---- 11. V7: the control tool appears only when declared, and a pause taken through it REALLY gates work
{
  const plain = fakeCtx()
  entry.apply(plain.ctx, { clock })
  await new Promise((r) => setTimeout(r, 20))
  ok(!plain.state.specs.some((s) => s.name === 'vibe_vmu_control'),
    'without a control declaration no control tool appears (zero mechanism, R1)',
    plain.state.specs.map((s) => s.name).join(','))

  const h = fakeCtx()
  const handle = entry.apply(h.ctx, { clock, control: true })
  await new Promise((r) => setTimeout(r, 30))
  const spec = h.state.specs.find((s) => s.name === 'vibe_vmu_control')
  ok(spec !== undefined, 'declaring control publishes the control tool')
  if (spec) {
    const paused = JSON.parse(await spec.execute({ action: 'pause', reason: 'operator hold' }, {}))
    ok(paused.ok === true && paused.state === 'paused', 'pause is callable and reports the new state', JSON.stringify(paused))
    let refused = null
    try { await handle.kernel.tasks.create({ title: 'blocked work' }) } catch (e) { refused = e && e.code }
    ok(refused === 'VMU_STATE', 'a pause taken through the TOOL really blocks kernel work (not a label)', String(refused))
    const status = JSON.parse(await spec.execute({ action: 'status' }, {}))
    ok(status.state === 'paused' && status.pausedReason === 'operator hold', 'status reports the paused state and reason')
    const resumed = JSON.parse(await spec.execute({ action: 'resume' }, {}))
    ok(resumed.ok === true && resumed.state === 'running', 'resume restores running')
    const task = await handle.kernel.tasks.create({ title: 'accepted again' })
    ok(task && task.id, 'and work is accepted again after the resume')
    const beat = JSON.parse(await spec.execute({ action: 'beat', note: 'alive' }, {}))
    ok(beat.ok === true && beat.beats === 1, 'the heartbeat is callable through the tool')
  }
}

// ---- 12. the entry runs the in-flight recovery after the store opens (end to end) --------------------
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-entry-work-'))
  const h = fakeCtx()
  const handle = entry.apply(h.ctx, { clock, root: dir })
  await new Promise((r) => setTimeout(r, 60))
  const rec = await handle.workRecovered()
  ok(rec && rec.ok === true && typeof rec.recovered === 'number',
    'the entry recovers the in-flight ledger right after the store opens', JSON.stringify(rec))
  const started = await handle.kernel.work.start({ owner: 'r-1', objective: 'survive a restart' })
  ok(started.ok === true, 'and the ledger is usable through the assembled kernel')
  // A SECOND entry on the same root is the restart: the unfinished item is reported as interrupted.
  const h2 = fakeCtx()
  const handle2 = entry.apply(h2.ctx, { clock, root: dir })
  await new Promise((r) => setTimeout(r, 60))
  const rec2 = await handle2.workRecovered()
  ok(rec2 && rec2.recovered === 1 && handle2.kernel.work.interrupted()[0].owner === 'r-1',
    'a fresh entry marks the unfinished work INTERRUPTED (the "resume knows what is pending" promise)',
    JSON.stringify(rec2).slice(0, 160))
  await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

// ---- 13. V5: the v5r-core PACK actually loads AND actually fires -------------------------------------
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-v5r-core-'))
  const h = fakeCtx()
  const handle = entry.apply(h.ctx, { clock, root: dir, packs: ['v5r'] })
  await new Promise((r) => setTimeout(r, 80))
  ok(handle.packErrors().length === 0, 'v5r-core loads without error', JSON.stringify(handle.packErrors()).slice(0, 200))
  ok(handle.appliedPacks().some((p) => p.id === 'v5r-core'), 'and it is recorded as applied', JSON.stringify(handle.appliedPacks()))
  const roles = handle.kernel.requireMembers().roles().map((r) => r.id)
  ok(roles.includes('chair') && roles.includes('member') && roles.includes('temp'),
    'its slots are declared (chair/member/temp) - v5r\'s roster as opaque slots (D5)', roles.join(','))
  const st = handle.kernel.status()
  ok(st.settings.resolved['vmu.meetings.quorumRule'].source === 'pack:v5r-core' &&
     st.settings.resolved['vmu.meetings.quorumRule'].value === 'm-unanimous',
    'its settings layer is in effect and REPORTED as coming from the pack',
    JSON.stringify(st.settings.resolved['vmu.meetings.quorumRule']))
  const ids = st.bus.entries.map((e) => e.id)
  ok(ids.includes('v5r-core-no-adhoc-scripts') && ids.includes('v5r-core-settled-records-only'),
    'both its M1 rule and its M2 module are on the bus', ids.join(','))

  // M1 FIRES: script runs are refused through the real hook.
  const scriptDecision = await handle.kernel.bus.emit('tools/pre-execute', { tool: 'vibe_vmu_script', args: {} }, {})
  ok(scriptDecision.ok === false && scriptDecision.refused && scriptDecision.refused.code === 'VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS',
    'the M1 rule fires on a tool the host REALLY registers', JSON.stringify(scriptDecision.refused))
  // M2 IS CONDITIONAL ON THE DECLARED STANCE (PHASE 7 round 3 ruling): the v5r pack now declares
  // `vmu.records.requireSettledRecords: false` in its VALUE layer (drafts must be writable — the original workflow), so
  // on THIS assembly the module correctly ALLOWS the append. The gate stays TWO-WAY: a second assembly that declares
  // the stance ON must still be refused by the same code, so "allows" cannot mean "the module went dead".
  const recordDecision = await handle.kernel.bus.emit('tools/pre-execute', { tool: 'vibe_vmu_records', args: { action: 'append' } }, {})
  const stance = handle.kernel.settingsSnapshot()['vmu.records.requireSettledRecords']
  ok(stance === false && recordDecision.ok === true,
    'the pack-carried M2 module lets the append through because the declared stance is OFF (drafts are writable)', JSON.stringify(recordDecision.refused || null))
  const other = await handle.kernel.bus.emit('tools/pre-execute', { tool: 'vibe_vmu_status', args: {} }, {})
  ok(other.ok === true, 'and it stays silent for tools it does not govern (no blanket denial)')
  const dirOn = await mkdtemp(join(tmpdir(), 'vmu-entry-m2on-'))
  const hOn = fakeCtx()
  const handleOn = entry.apply(hOn.ctx, { clock, root: dirOn, packs: ['v5r'], 'vmu.records.requireSettledRecords': true })
  await handleOn.ready()
  const forced = await handleOn.kernel.bus.emit('tools/pre-execute', { tool: 'vibe_vmu_records', args: { action: 'append' } }, {})
  ok(forced.ok === false && forced.refused && forced.refused.code === 'VMU_PACK_V5R_CORE_NOT_SETTLED',
    'and it STILL fires when the same pack is assembled with the stance ON (the module is wired, not dead)', JSON.stringify(forced.refused || null))
  await rm(dirOn, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

// ---- 14. V5 second half: the v3-core PACK loads and its carried M2 rules really fire -----------------
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-v3-core-'))
  const h = fakeCtx()
  const handle = entry.apply(h.ctx, { clock, root: dir, packs: ['v3-core'] })
  await new Promise((r) => setTimeout(r, 80))
  ok(handle.packErrors().length === 0, 'v3-core loads without error', JSON.stringify(handle.packErrors()).slice(0, 220))
  const slots = handle.kernel.members ? handle.kernel.members.roles().map((r) => r.id + ':' + r.capacity) : []
  ok(slots.join(',') === 'planner:1,solver:8,verifier:3',
    'its slots are v3 roster as capacities (planner:1, solver:8, verifier:3)', slots.join(','))
  const st = handle.kernel.status()
  ok(st.settings.resolved['vmu.limits.maxLiveMembers'].source === 'pack:v3-core' &&
     st.settings.resolved['vmu.limits.maxLiveMembers'].value === 4,
    'its settings layer is in effect and attributed to the pack (maxLiveMembers <- v3 maxParallelThreshold)',
    JSON.stringify(st.settings.resolved['vmu.limits.maxLiveMembers']))
  const ids = st.bus.entries.map((e) => e.id)
  ok(ids.includes('v3-core-verifier-quorum') && ids.includes('v3-core-manual-gate'),
    'both carried M2 modules are on the bus', ids.join(','))

  // M2 #1 FIRES: a tally with fewer votes than v3's verifierCount is refused BY NAME.
  const thin = await handle.kernel.bus.emit('ballot/tally', { target: 'p-1', votes: { 'a': 'for' }, eligible: ['a', 'b', 'c'], quorumRule: 'majority' }, {})
  ok(thin.ok === false && thin.refused && thin.refused.code === 'VMU_PACK_V3_CORE_VERIFIER_QUORUM',
    'the verifier-quorum module refuses a thin tally by name', JSON.stringify(thin.refused))
  const full = await handle.kernel.bus.emit('ballot/tally', { target: 'p-1', votes: { a: 'for', b: 'for', c: 'against' }, eligible: ['a', 'b', 'c'], quorumRule: 'majority' }, {})
  ok(full.ok === true, 'and a tally with all three verifiers passes (no blanket denial)')

  // M2 #2 FIRES on the mode branch, and stays silent in auto.
  const auto = await handle.kernel.bus.emit('tools/pre-execute', { tool: 'vibe_vmu_script', args: {} }, {})
  ok(auto.ok === true, 'in mode=auto the manual gate stays silent')
  const manual = await handle.kernel.bus.emit('tools/pre-execute', { tool: 'vibe_vmu_script', args: {}, v3Mode: 'manual' }, {})
  ok(manual.ok === false && manual.refused && manual.refused.code === 'VMU_PACK_V3_CORE_MANUAL_GATE',
    'in mode=manual it refuses dispatch by name', JSON.stringify(manual.refused))

  // Unload residue and plan purity are covered by tests/vmu-pack.test.mjs; here we only need "it loaded".
  await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

// ---- 15b. the turn loop has a REAL entry point: declared only, and it reaches the loop the plugin assembled ------
{
  const plainT = fakeCtx()
  entry.apply(plainT.ctx, { clock })
  await new Promise((r) => setTimeout(r, 20))
  ok(!plainT.state.specs.map((s) => s.name).includes('vibe_vmu_turn'),
    'ROUND 349: without a declared turn intent the turn tool does not appear (zero mechanism holds)',
    plainT.state.specs.map((s) => s.name).join(','))

  const ht = fakeCtx()
  entry.apply(ht.ctx, { clock, turn: true })
  await new Promise((r) => setTimeout(r, 30))
  const turnTool = ht.state.specs.find((s) => s.name === 'vibe_vmu_turn')
  ok(!!turnTool, 'declaring the turn intent publishes the turn tool', ht.state.specs.map((s) => s.name).join(','))
  const tstate = JSON.parse(await turnTool.execute({ op: 'status' }, {}))
  ok(tstate.ok === true && tstate.status && tstate.status.policy === 'round-robin',
    'and the tool reaches the LOOP the plugin assembled, not a copy of it', JSON.stringify(tstate).slice(0, 120))
  const tstep = JSON.parse(await turnTool.execute({ op: 'step', members: [{ id: 'r-1' }], phase: 'normal' }, {}))
  ok(tstep.ok === false && tstep.code === 'VMU_ENGINE_UNAVAILABLE',
    'a round with no delivery seam is a RETURNED refusal through the plugin too, never a half-run', JSON.stringify(tstep).slice(0, 120))
}

// ---- 15. per-domain tool faces: declared only, and they really drive the kernel primitives ----------
{
  const plain = fakeCtx()
  entry.apply(plain.ctx, { clock })
  await new Promise((r) => setTimeout(r, 20))
  const plainNames = plain.state.specs.map((s) => s.name)
  ok(!plainNames.includes('vibe_vmu_meeting') && !plainNames.includes('vibe_vmu_task'),
    'without a declared meeting/task intent neither face appears (zero mechanism holds)', plainNames.join(','))

  const h = fakeCtx()
  const handle = entry.apply(h.ctx, { clock, meetings: true, tasks: true })
  await new Promise((r) => setTimeout(r, 30))
  const meet = h.state.specs.find((s) => s.name === 'vibe_vmu_meeting')
  const task = h.state.specs.find((s) => s.name === 'vibe_vmu_task')
  ok(!!meet && !!task, 'declaring the intents publishes both faces', h.state.specs.map((s) => s.name).join(','))

  const opened = JSON.parse(await meet.execute({ action: 'open', agenda: 'an agenda', roster: ['r-1', 'r-2'] }, {}))
  ok(opened.ok === true && typeof opened.id === 'string', 'open convenes the meeting and opens a round', JSON.stringify(opened))
  const spoke = JSON.parse(await meet.execute({ action: 'speak', id: opened.id, member: 'r-1', text: 'hello' }, {}))
  ok(spoke.ok === true && spoke.answered === 1, 'speak reaches the LIVE meeting by id', JSON.stringify(spoke))
  const listed = JSON.parse(await meet.execute({ action: 'list' }, {}))
  ok(listed.meetings.includes(opened.id) && handle.kernel.status().live.meetings.includes(opened.id),
    'the live registry lists it (tool face and status().live agree)', JSON.stringify(listed))
  const ghost = JSON.parse(await meet.execute({ action: 'speak', id: 'nope', member: 'r-1', text: 'x' }, {}))
  ok(ghost.ok === false && ghost.code === 'VMU_NO_SUCH_OBJECT', 'an unknown meeting id is refused BY NAME', JSON.stringify(ghost))

  const b = JSON.parse(await meet.execute({ action: 'ballot', target: 'prop-x' }, {}))
  ok(b.ok === true && typeof b.ballotId === 'string', 'ballot opens a live ballot', JSON.stringify(b))
  const vote = JSON.parse(await meet.execute({ action: 'vote', ballotId: b.ballotId, member: 'r-1', value: 'for' }, {}))
  ok(vote.ok === true, 'a vote reaches the live ballot', JSON.stringify(vote).slice(0, 120))
  const tally = JSON.parse(await meet.execute({ action: 'tally', ballotId: b.ballotId }, {}))
  ok(tally.ok === true, 'and the tally closes it through the same primitive the library level uses', JSON.stringify(tally).slice(0, 140))

  const created = JSON.parse(await task.execute({ action: 'create', title: 'probe task' }, {}))
  ok(created.ok === true && typeof created.id === 'string', 'task create works through the face', JSON.stringify(created))
  const moved = JSON.parse(await task.execute({ action: 'transition', id: created.id, to: 'doing' }, {}))
  ok(moved.ok === true, 'and the kernel still enforces the transition', JSON.stringify(moved).slice(0, 120))
  const tl = JSON.parse(await task.execute({ action: 'list' }, {}))
  ok(Array.isArray(tl.tasks) && tl.tasks.length >= 1, 'list returns the board')
  const badTask = JSON.parse(await task.execute({ action: 'transition', id: 'ghost', to: 'doing' }, {}))
  ok(badTask.ok === false && badTask.code === 'VMU_NO_SUCH_OBJECT', 'an unknown task id is refused BY NAME', JSON.stringify(badTask))
}

// ---- 16. vmu.prompts.resourceSection: off by default (prompt byte-identical), on when asked -----------
{
  const base = fakeCtx()
  const hBase = entry.apply(base.ctx, { clock, prompt: 'X' })
  await new Promise((r) => setTimeout(r, 20))
  const shape = (h) => h.prompts().map((p) => p.name + ':' + p.chars).join('|')
  const baseShape = shape(hBase)
  ok(!hBase.prompts().some((p) => p.name === 'resources'),
    'by default NO 【资源】 section is registered (the prompt is untouched)', baseShape)

  const off = fakeCtx()
  const hOff = entry.apply(off.ctx, { clock, prompt: 'X', vmu: { 'vmu.prompts.resourceSection': false } })
  await new Promise((r) => setTimeout(r, 20))
  ok(shape(hOff) === baseShape,
    'and `false` is byte-for-byte the same as absent (the default really changes nothing)', shape(hOff) + ' vs ' + baseShape)

  const on = fakeCtx()
  const hOn = entry.apply(on.ctx, { clock, prompt: 'X',
    vmu: { 'vmu.prompts.resourceSection': true, 'vmu.limits.maxParallel': 4 } })
  await new Promise((r) => setTimeout(r, 20))
  const res = hOn.prompts().find((p) => p.name === 'resources')
  ok(res && res.chars > 20 && hOn.prompts().some((p) => p.name === 'vmu'),
    'true registers the 【资源】 section alongside the others (and it carries the budget text)', JSON.stringify(hOn.prompts()))
  ok(hOn.prompts().length === hBase.prompts().length + 1,
    'exactly ONE section is added - nothing else in the pipeline moves', String(hOn.prompts().length))
}

// ---- 17. self-probe ---------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(ENTRY, 'utf8')
  const guard = "  if (typeof config.prompt === 'string' && config.prompt.length > 0 && ctx && ctx.systemPrompt &&"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the declared-prompt guard is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-entry-mut-'))
    await mkdir(join(dir, 'kernel', 'prompt'), { recursive: true })
    await mkdir(join(dir, 'settings'), { recursive: true })
    for (const f of ['bus.js', 'store.js', 'library.js', 'members.js', 'ballot.js', 'meeting.js', 'tasks.js', 'math.js', 'rules.js', 'loader.js', 'script-bridge.js', 'registry.js', 'pack.js', 'index.js']) {
      await writeFile(join(dir, 'kernel', f), await readFile(resolve(REPO, 'vibe-math-vmu', 'kernel', f), 'utf8'), 'utf8')
    }
    await writeFile(join(dir, 'kernel', 'prompt', 'index.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js'), 'utf8'), 'utf8')
    await writeFile(join(dir, 'settings', 'schema.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'settings', 'schema.js'), 'utf8'), 'utf8')
    for (const f of ['math-computation.js', 'math-engines.js']) {
      await writeFile(join(dir, f), await readFile(resolve(REPO, 'vibe-math-vmu', f), 'utf8'), 'utf8')
    }
    await writeFile(join(dir, 'host.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'host.js'), 'utf8'), 'utf8')
    await writeFile(join(dir, 'host-hooks.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'host-hooks.js'), 'utf8'), 'utf8')
    await writeFile(join(dir, 'vibe-math-vmu.js'), src.replace(guard, '  if (true &&'), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'vibe-math-vmu.js')).href + '?probe=1')
    const state = { effects: [], sections: [] }
    const ctx = { effect(fn, l) { state.effects.push(l); return fn() }, tools: { register: async () => () => {} },
      systemPrompt: { section: (s) => { state.sections.push(s); return () => {} }, getSectionOrder: () => 5 } }
    mm.apply(ctx, { clock })
    // With the guard removed a prompt section is injected although none was declared: the assertion fails.
    ok(!state.effects.includes('vmu:prompt'), 'self-probe: guard removed => the zero-prompt assertion fails (as required)', state.effects.join(','))
    await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
  console.log('=== VMU ENTRY SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

// ---- E3 (task-154): bus.emit validates the hook NAME (never a bare crash, never a silent no-op) ---------
{
  const host = fakeCtx()
  const handle = entry.apply(host.ctx, { clock })
  await new Promise((r) => setTimeout(r, 0))
  const kernel = handle.kernel
  ok(kernel && kernel.bus && typeof kernel.bus.emit === 'function', 'E3: the entry exposes a real bus')
  const grab = async (hook) => { try { await kernel.bus.emit(hook, {}, {}); return null } catch (e) { return e } }
  const n123 = await grab(123)
  ok(n123 && n123.code === 'VMU_INVALID_ARGUMENT' && /got number/.test(n123.message),
    'E3: emit(123) is a NAMED refusal (was a bare TypeError: hook.replace is not a function)', n123 && n123.message)
  ok(/NON-EMPTY STRING hook/.test(String(n123.message)) && /declareTopic/.test(String(n123.hint)),
    'E3: the refusal states the requirement in the message and the remedy in the hint', n123 && (n123.message + ' | ' + n123.hint))
  const nobj = await grab({})
  ok(nobj && nobj.code === 'VMU_INVALID_ARGUMENT' && /got object/.test(nobj.message),
    'E3: emit({}) is a NAMED refusal (was the same bare TypeError)', nobj && nobj.message)
  const nnull = await grab(null)
  ok(nnull && nnull.code === 'VMU_INVALID_ARGUMENT' && /got null/.test(nnull.message),
    'E3: emit(null) is a NAMED refusal (was "Cannot read properties of null")', nnull && nnull.message)
  const nempty = await grab('')
  ok(nempty && nempty.code === 'VMU_INVALID_ARGUMENT' && /empty\/whitespace/.test(nempty.message),
    'E3: emit("") is REFUSED (it used to be ACCEPTED, reaching no listener at all)', nempty && nempty.message)
  const nspace = await grab('   ')
  ok(nspace && nspace.code === 'VMU_INVALID_ARGUMENT', 'E3: a whitespace-only hook is refused too')
  // legal hooks keep working — a VMU hook, a declared custom topic and a host-namespace name
  const legal = await kernel.bus.emit('control/heartbeat', { beats: 1, at: clock() }, {})
  ok(legal && legal.ok !== false && typeof legal.traceId === 'string',
    'E3[+]: a legal VMU hook still runs and gets a traceId', JSON.stringify(legal).slice(0, 80))
  kernel.bus.declareTopic('custom/e3-probe')
  const custom = await kernel.bus.emit('custom/e3-probe', {}, {})
  ok(custom && custom.ok !== false, 'E3[+]: a DECLARED custom topic still runs')
  const hostHook = await kernel.bus.emit('tools/pre-execute', { tool: 'x' }, {})
  ok(hostHook && hostHook.ok !== false, 'E3[+]: a host-namespace hook still passes through')
}

// ---- E-6 (task-163): through the ENTRY, the runtime receipt matches observed behaviour ------------------
{
  const host = fakeCtx({ settings: { 'vmu.audit.chain.checkpointEvery': 100 } })
  const handle = entry.apply(host.ctx, { clock })
  await new Promise((r) => setTimeout(r, 0))
  const kernel = handle.kernel
  // H1 ⇒ live: the audit chain observes the new rhythm immediately
  const r1 = kernel.setSettingsValue('vmu.audit.chain.checkpointEvery', 11, { by: 'office' })
  ok(r1.requiresRestart === false && kernel.auditchain.status().checkpointEvery === 11,
    'entry/H1: the receipt says immediate and the consumer really observes 11', JSON.stringify({ restart: r1.requiresRestart, seen: kernel.auditchain.status().checkpointEvery }))
  // H0 ⇒ live into the bus
  const r2 = kernel.setSettingsValue('vmu.middleware.dryRun', true, { by: 'office' })
  ok(r2.requiresRestart === false && kernel.bus.isDryRun() === true && kernel.status().settings.dryRun === true,
    'entry/H0: dryRun is live in the bus AND in status()')
  // H2 ⇒ the receipt admits a restart is needed and the running kernel is unchanged
  const r3 = kernel.setSettingsValue('vmu.core.enabled', false, { by: 'office' })
  ok(r3.requiresRestart === true && kernel.enabled === true,
    'entry/H2: requiresRestart:true and the running kernel is honestly unchanged', JSON.stringify({ restart: r3.requiresRestart, enabled: kernel.enabled }))
  // the host-visible tool face keeps working after the graded writes
  const names = host.state.specs.map((s) => s.name)
  ok(names.includes('vibe_vmu_status'), 'the entry still registers its tools after graded runtime writes', names.join(','))
  // and the read-only view refuses a consumer write (through the entry's kernel)
  let err = null
  try { kernel.settingsView()['vmu.safety.pathPolicy'] = 'allow-all' } catch (e) { err = e }
  ok(err && err.code === 'VMU_NOT_PERMITTED', 'entry: a consumer cannot write kernel settings through the view', err && err.code)
  // ★★★ LIVE RUN 42 (the institute's own report, ㉝.1 item (c)2): it wrote `vmu.turn.deliverMode:"caller"`, the receipt
  // answered `applied:"immediate"` / `requiresRestart:false`, and the run kept delivering on activation. The blanket
  // `vmu.turn.*` live-reader prefix promised liveness for a family that contains a construction-read exception.
  const r4 = kernel.setSettingsValue('vmu.turn.deliverMode', 'caller', { by: 'office' })
  ok(r4.requiresRestart === true, 'entry/R42: a construction-read key does NOT promise immediate effect',
    JSON.stringify({ restart: r4.requiresRestart, applied: r4.applied }))
  ok(r4.applied === 'next-session' && r4.liveReadBy.length === 0,
    'entry/R42: the receipt reports no measured live reader for it', JSON.stringify({ applied: r4.applied, liveReadBy: r4.liveReadBy }))
  ok(typeof r4.constructionOnly === 'string' && /construction|shadows this key/.test(r4.constructionOnly) && /next start/.test(String(r4.note)),
    'entry/R42: and NAMES why (the exception travels with the receipt, not with the caller\'s memory)',
    JSON.stringify({ constructionOnly: r4.constructionOnly, note: r4.note }))
  const r5 = kernel.setSettingsValue('vmu.turn.leaderId', 'member-1', { by: 'office' })
  ok(r5.liveReadBy.length > 0 && r5.requiresRestart === false,
    'entry/R42[+]: a genuine prompt-variable key in the SAME family is still live (the exception did not become the rule)',
    JSON.stringify({ liveReadBy: r5.liveReadBy, restart: r5.requiresRestart }))
  // ★★ LIVE RUN 16 (§106) — THE FAMILY CASE. `createMeetings()` snapshots the whole `vmu.meetings.*` block into `K` at
  // construction (148 read sites), yet those keys are declared H1. Measured on the run: the institute set
  // `vmu.meetings.quorumMin:2`, the receipt answered `applied:"immediate"` / `appliesAt:"next turn"`, and EVERY later
  // meeting still reported `voteFloor.setting:0` with `zeroBecause:"…quorumMin and quorumRatio are both 0…"`.
  const r6 = kernel.setSettingsValue('vmu.meetings.quorumMin', 2, { by: 'office' })
  ok(r6.requiresRestart === true, 'entry/R16: a construction-only FAMILY member does not promise immediate effect',
    JSON.stringify({ restart: r6.requiresRestart, applied: r6.applied, appliesAt: r6.appliesAt }))
  ok(r6.applied === 'next-session' && r6.liveReadBy.length === 0,
    'entry/R16: the receipt says next-session and measures NO live reader',
    JSON.stringify({ applied: r6.applied, liveReadBy: r6.liveReadBy }))
  ok(/next start/.test(String(r6.appliesAt)) && /createMeetings/.test(String(r6.constructionOnly)),
    'entry/R16: appliesAt names "next start" and constructionOnly names the snapshotting consumer (not a generic reason)',
    JSON.stringify({ appliesAt: r6.appliesAt, constructionOnly: r6.constructionOnly }))
  ok(/next start/.test(String(r6.note)), 'entry/R16: and the note states the effect honestly', String(r6.note))
}

// ---- E-8 (task-170): the guard faces are declared, and the production path really reaches them ---------
{
  const host = fakeCtx()
  const handle = entry.apply(host.ctx, { clock })
  await new Promise((r) => setTimeout(r, 20))
  const kernel = handle.kernel
  const guards = kernel.status().guards
  ok(guards && Array.isArray(guards.registered) && guards.registered.includes('requireStore') && guards.registered.includes('requireMembers'),
    'E-8: the ENTRY-assembled kernel reports its guard-face registry', JSON.stringify(guards && guards.registered))
  ok(guards.faces.requireMembers.kind === 'diagnostic' && /NO production path REQUIRES a roster/.test(String(guards.faces.requireMembers.reason)),
    'E-8: status() says plainly that requireMembers() is a diagnostic/contract face, with the reason')
  ok(guards.faces.settingsView.kind === 'diagnostic' && /BY INJECTION/.test(String(guards.faces.settingsView.reason)),
    'E-8: settingsView() is positioned as a diagnostic API (consumers get the view by injection)')
  ok(guards.faces.requireStore.kind === 'contract' && guards.faces.requireStore.productionCallSites.length >= 1,
    'E-8: requireStore() names a real production call site')
  // (甲) BEHAVIOUR through the entry: a module calling the kernel facade with no root is refused BY NAME
  const seen = []
  const probe = { meta: { id: 'entry-guard-probe', apiVersion: 1 }, capabilities: ['read-state'],
    hooks: { 'meeting/round-start': async () => undefined },
    default: ({ kernel: face }) => {
      try { seen.push(face.read()) } catch (e) { seen.push({ code: e && e.code, message: e && e.message }) }
      return { hooks: { 'meeting/round-start': async () => undefined } }
    } }
  await kernel.loader.load({ id: 'entry-guard-probe', kind: 'module', module: probe })
  ok(seen[0] && seen[0].code === 'VMU_ENGINE_UNAVAILABLE' && /no durable root/.test(String(seen[0].message)),
    'E-8(甲) BEHAVIOUR: through the ENTRY the production facade refuses instead of returning null', JSON.stringify(seen[0]))
  let tracksErr = null
  try { kernel.declareTracks(['progress']) } catch (e) { tracksErr = e }
  ok(tracksErr && tracksErr.code === 'VMU_ENGINE_UNAVAILABLE' && /no library root/.test(tracksErr.message),
    'E-8(甲) BEHAVIOUR: declareTracks uses the library guard on the entry path too', tracksErr && tracksErr.message)
}

// ---- 14. a DATA-ONLY pack is activated through the entry, and its text reaches a REAL turn --------------
// The folder shape says a pack may contribute prompt text as DATA - no manifest, no code - and the plugin reads
// `packs/<name>/prompts/sections.json` before the kernel exists. What this section adds is the OTHER half: that naming
// such a pack in `config.packs` ACTIVATES it. Before this round it did not. The loader tried `packs/example-data/index.js`,
// then `packs/example-data.js`, and reported the name as a pack that failed to apply - while the text had in fact already
// been merged into the pipeline. A deployment would have seen an error and an empty applied list for a pack that was
// doing its job, which is the worst version of the defect: the failure report is the only thing that is wrong.
{
  const host = fakeCtx()
  const dataRoot = await mkdtemp(join(tmpdir(), 'vmu-entry-dataonly-'))
  const handle = entry.apply(host.ctx, { clock, root: dataRoot, packs: ['example-data'] })
  await new Promise((r) => setTimeout(r, 60))
  ok(handle.packErrors().length === 0,
    'E-14: a pack that carries ONLY data activates without a pack error - it has no manifest because it has no machinery',
    JSON.stringify(handle.packErrors()))
  const applied = handle.appliedPacks()
  ok(applied.length === 1 && applied[0].id === 'example-data' && applied[0].dataOnly === true && applied[0].carries.promptSections === true,
    'and it is recorded as APPLIED, marked data-only, naming what it carries - so a deployment reading the applied list is told the truth',
    JSON.stringify(applied))
  const turn = handle.kernel && handle.kernel.turn
  if (turn && typeof turn.assemble === 'function') {
    const opened = turn.open({ member: 'acad', role: 'academician', roleLabel: '院士', phase: 'normal', round: 1 })
    const asm = await turn.assemble(opened.turn)
    ok(String(asm.text).includes('这一段只出现在常规相位'),
      'E-14(甲) BEHAVIOUR: the data packs phase-bound text reaches an assembly through the ENTRY, not only through a pipeline built by hand',
      { chars: String(asm.text).length, hasMarker: String(asm.text).includes('纯数据') })
  } else {
    ok(false, 'E-14(甲) the entry must expose the turn face, or the data packs text cannot be observed end to end',
      { keys: turn ? Object.keys(turn).slice(0, 8) : null })
  }
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

// ---- 16. TWO REAL PACKS AT ONCE, which the conflict tests had never done with shipped folders ----------
// The conflict paths are covered thoroughly at the kernel and loader levels, but always with synthetic manifests. What
// had never been run is two SHIPPED pack folders in one deployment. It turns out to be the most informative case in the
// suite: institute-min and v3-core are different institutions and they CANNOT coexist by default, because both state
// preferences about the same meeting settings. The refusal is O4 working as designed - detect and name, never silently
// overwrite - and it names the overlapping keys rather than saying "conflict". A pack plus a data-only pack coexist
// cleanly, which is the pairing the folder shape exists to make possible.
{
  const run = async (packs) => {
    const host = fakeCtx()
    const twoRoot = await mkdtemp(join(tmpdir(), 'vmu-entry-twopacks-'))
    const handle = entry.apply(host.ctx, { clock, root: twoRoot, packs })
    await new Promise((r) => setTimeout(r, 200))
    const out = { errors: handle.packErrors() || [], applied: handle.appliedPacks() || [] }
    await rm(twoRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
    return out
  }
  const both = await run(['institute-min', 'v3-core'])
  ok(both.errors.length === 1 && both.errors[0].code === 'VMU_PACK_CONFLICT' && /overlaps existing settings/.test(both.errors[0].message),
    'E-16: two DIFFERENT shipped institutions refuse to coexist by default, and the refusal names the overlapping settings rather than saying "conflict"',
    JSON.stringify(both.errors).slice(0, 240))
  ok(/vmu\.meetings\./.test(String(both.errors[0].message)),
    'E-16(甲) and the named keys are the meeting settings both institutions state a preference about - which is why they cannot simply both win',
    String(both.errors[0].message).slice(0, 160))
  ok(both.applied.length === 1 && both.applied[0].id === 'institute-min',
    'E-16(乙) the FIRST pack stays applied and the second is refused, so a refusal does not take down what was already running',
    JSON.stringify(both.applied))
  const twice = await run(['institute-min', 'institute-min'])
  ok(twice.errors.length === 1 && /already applied/.test(String(twice.errors[0].message)),
    'E-16(丙) the same pack twice is refused BY NAME as already applied',
    JSON.stringify(twice.errors).slice(0, 200))
  const withData = await run(['institute-min', 'example-data'])
  ok(withData.errors.length === 0 && withData.applied.length === 2 && withData.applied[1].dataOnly === true,
    'E-16(丁) a shipped institution and a DATA-ONLY pack coexist with no error - the pairing the folder shape exists to allow',
    JSON.stringify(withData.applied))
}

// ---- 17. the DOCUMENTED escape hatch, with two real institutions, and the fact it never mentioned --------
// docs/10 tells a deployment to declare `vmu.packs.allowKernelOverride` when two packs disagree about a setting. Two
// layers enforce that rule and they read DIFFERENT key names - the loader read allowKernelOverride, the kernel read
// allowOverride - so for as long as both existed the documented name opened the first door and the second stayed shut,
// with a hint telling the operator to set the key they had just set. Both layers honour both names now. What the probe
// then showed is a fact no document stated: with the override declared, BOTH institutions apply and the LAST ONE WINS
// the overlapping settings, so the order in `config.packs` decides how the institute runs.
{
  const boot = async (packs, extra) => {
    const host = fakeCtx()
    const r = await mkdtemp(join(tmpdir(), 'vmu-entry-override-'))
    const handle = entry.apply(host.ctx, Object.assign({ clock, root: r, packs }, extra))
    await new Promise((res) => setTimeout(res, 220))
    const snap = handle.kernel.settingsSnapshot() || {}
    const val = (k) => (snap[k] && typeof snap[k] === 'object' && snap[k].value !== undefined ? snap[k].value : snap[k])
    // ROUND 9: the observable for "the ORDER decides the overlap" is `verdictMaxRounds`, NOT `quorumRule`.
    // Both packs declare `vmu.meetings.quorumRule: 'm-unanimous'`, so comparing it can never show which pack won -
    // and the only reason it ever did was that v3-core used to declare `'majority'`, an OUT-OF-DOMAIN value the
    // pack value-domain gate caught (its domain is ['m-unanimous','all-unanimous'], and `ballot.js`'s default tally
    // only records it as a label). Asserting on it again would mean propping a gate up with an illegal value.
    // `verdictMaxRounds` really differs (v3-core 5, institute-min 3), so the order is visible.
    const out = { errors: handle.packErrors() || [], applied: (handle.appliedPacks() || []).map((a) => a.id), quorum: val('vmu.meetings.quorumRule'), rounds: val('vmu.meetings.verdictMaxRounds') }
    await rm(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
    return out
  }
  const off = await boot(['institute-min', 'v3-core'], {})
  ok(off.errors.length === 1 && off.applied.length === 1,
    'E-17: without a declaration the two institutions do NOT coexist, and the refusal covers the overlapping settings only',
    JSON.stringify({ errors: off.errors.length, applied: off.applied }))
  const on = await boot(['institute-min', 'v3-core'], { vmu: { 'vmu.packs.allowKernelOverride': true } })
  ok(on.errors.length === 0 && on.applied.length === 2,
    'E-17(甲) the DOCUMENTED name alone is enough: both doors open, both institutions apply, no error - it used to open only the loaders',
    JSON.stringify(on))
  const reversed = await boot(['v3-core', 'institute-min'], { vmu: { 'vmu.packs.allowKernelOverride': true } })
  // ROUND 9: the observable is `verdictMaxRounds` (v3-core 5 / institute-min 3), NOT `quorumRule` - BOTH packs
  // declare `vmu.meetings.quorumRule: 'm-unanimous'`, so comparing it can never show which one won. It only ever
  // "worked" because v3-core used to declare `'majority'`, an OUT-OF-DOMAIN value the pack value-domain gate caught
  // (domain = ['m-unanimous','all-unanimous']; `ballot.js`'s default tally records it as a label only). Re-asserting
  // on it would mean propping the gate up with an illegal value. See docs/11 §4.2 requirement ⑥ (semantic vacuity).
  ok(reversed.errors.length === 0 && reversed.applied.length === 2 && reversed.rounds !== on.rounds,
    'E-17(乙) and the ORDER decides the overlapping settings: the last pack applied wins, so config.packs is not a set but a sequence (observed on `verdictMaxRounds`, because both packs declare the SAME `quorumRule`)',
    { forward: on.rounds, reversed: reversed.rounds })
}

// ---- 15. the data-only branch must NOT make a missing pack look like a success ------------------------
// The branch above accepts a name that carries data and has no manifest. The risk it creates is the mirror image: a name
// that carries NOTHING must still fail, or a typo in `config.packs` would produce a clean run and an empty applied list,
// and the deployment would believe a pack it never wrote was in force. Both directions are asserted, because a fix that
// widens an acceptance path is only as good as the case it still refuses.
{
  for (const name of ['no-such-pack-at-all', 'v5r-typo']) {
    const host = fakeCtx()
    const missingRoot = await mkdtemp(join(tmpdir(), 'vmu-entry-missing-'))
    const handle = entry.apply(host.ctx, { clock, root: missingRoot, packs: [name] })
    await new Promise((r) => setTimeout(r, 60))
    const errs = handle.packErrors()
    ok(errs.length === 1 && errs[0].id === name && /neither a manifest/.test(String(errs[0].message)),
      'E-15: a name with NEITHER a manifest NOR data is still refused BY NAME, so a typo cannot pass for a deployment',
      JSON.stringify(errs))
    ok(handle.appliedPacks().length === 0, 'and it is not recorded as applied (absent from the list, not silently included)',
      JSON.stringify(handle.appliedPacks()))
    await rm(missingRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}

// ---- N. the `agent/turn-stopping` bridge is attached ONLY when the report face is DECLARED (task-20 B) --------
// WHY THIS BLOCK EXISTS. The entry bridges the host's turn boundary into `kernel.report.tick()`. Attaching that
// host listener for an UNDECLARED face is invisible work that the zero-mechanism red line forbids - and "the
// kernel is switched on" is NOT a declaration. Both directions are asserted here, and the positive case proves the
// listener is not merely REGISTERED but really INVOKED (the spy would stay 0 if the handler were a no-op).
//
// TIMING (measured twice - by core and by vmu-pack): the entry attaches the listener AFTER `adapter.install()`
// resolves (`vibe-math-vmu.js` `attachReportTick`), so a SYNCHRONOUS read of `state.listeners` sees an empty array
// and would turn both directions into a race - the "no listener" case would pass VACUOUSLY and the "one listener"
// case would then call `undefined`. Every read below therefore happens after `await handle.ready()`, and the call
// itself is guarded so a broken expectation reports a clean red instead of killing the whole process.
{
  const quiet = fakeCtx()
  const quietHandle = entry.apply(quiet.ctx, { clock })
  ok(quietHandle.kernel.report && typeof quietHandle.kernel.report.tick === 'function',
    'the report face still EXISTS (it is inert, not absent) - the gate is about the listener, not the face')
  await quietHandle.ready()
  ok((quiet.state.listeners['agent/turn-stopping'] || []).length === 0,
    '★ UNDECLARED: after the entry is READY, no `agent/turn-stopping` listener is attached (none of vmu.report.* / config.report / config.faces / vmu.tools.faces names it)',
    JSON.stringify(Object.keys(quiet.state.listeners)))
  ok(quiet.state.specs.length === 1,
    '★ TDZ REGRESSION GUARD: a MINIMAL ctx assembles WITHOUT THROWING and, once ready, registers EXACTLY ONE tool (the `status` face) - the round-3 `meetings` TDZ made this exact shape throw, and core fixed it with a holder object',
    JSON.stringify(quiet.state.specs.map((s) => s.name)))

  const declared = fakeCtx()
  const declaredHandle = entry.apply(declared.ctx, { clock, vmu: { 'vmu.report.enabled': true } })
  await declaredHandle.ready()
  const handlers = declared.state.listeners['agent/turn-stopping'] || []
  ok(handlers.length === 1,
    '★ DECLARED (`vmu.report.enabled`): after ready, exactly ONE `agent/turn-stopping` listener is attached',
    JSON.stringify(Object.keys(declared.state.listeners)) + ' n=' + handlers.length)
  let ticks = 0
  const realTick = declaredHandle.kernel.report.tick.bind(declaredHandle.kernel.report)
  declaredHandle.kernel.report.tick = (arg) => { ticks += 1; return realTick(arg) }
  // GUARDED CALL: if the assertion above failed, this must not turn one red into a dead process.
  if (typeof handlers[0] === 'function') await handlers[0]()
  ok(ticks === 1,
    '★ and the attached listener REALLY calls report.tick() when the host fires the event (a registered no-op would leave this 0)',
    'ticks=' + ticks + ' handlerType=' + typeof handlers[0])
}

// ---- O. D-01, the EXECUTABLE DEFINITION of "declared in the pack manifest ⇒ the face is published" (round 3) --
// WHY THIS BLOCK EXISTS. F1's root cause was an adapter that SNAPSHOTTED settings at construction, so a settings
// key that arrived through a pack manifest (`applyPackSettings`) could never light a face. Core fixed it by reading
// `kernel.settingsView()` live. The property is only real if it is executable: declare a key AFTER the kernel is
// ready, run the NEXT install, and the face must appear. `before` also re-states the zero-declaration baseline.
{
  const h = fakeCtx()
  const handle = entry.apply(h.ctx, { clock })
  await handle.ready()
  const before = h.state.specs.map((s) => s.name)
  ok(before.length === 1 && before[0] === 'vibe_vmu_status',
    '★ D-01 BEFORE: with nothing declared, exactly ONE tool is published (the `status` face)', JSON.stringify(before))
  const applied = handle.kernel.applyPackSettings({ 'vmu.report.enabled': true }, { by: 'vmu-verify' })
  ok(applied && applied.ok !== false && applied.applied.includes('vmu.report.enabled'),
    'the pack-manifest setting is ACCEPTED (applyPackSettings is the door a pack manifest\'s settings come through)',
    JSON.stringify(applied && applied.applied))
  ok(h.state.specs.map((s) => s.name).join(',') === 'vibe_vmu_status',
    '★ and the declaration alone does NOT publish the face yet - publication happens on the NEXT install (that timing is what D-01 is about, not a defect)',
    h.state.specs.map((s) => s.name).join(','))
  await handle.adapter.install()
  const after = h.state.specs.map((s) => s.name)
  // The fake registers append-only (it is a recording stub, not the host), so this asserts APPEARANCE.
  ok(after.includes('vibe_vmu_report'),
    '★ D-01: after the NEXT install the newly declared face IS published (`vibe_vmu_report` appears) - the executable definition of "the adapter reads settings LIVE, so a pack manifest\'s declaration reaches the tool surface"',
    JSON.stringify(after))
}

console.log('=== VMU ENTRY: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
