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
  await rm(root, { recursive: true, force: true })
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
  await rm(packRoot, { recursive: true, force: true })
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
  await rm(moduleRoot, { recursive: true, force: true })
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
  await rm(dir, { recursive: true, force: true })
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
  await rm(dir, { recursive: true, force: true })
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
  await rm(dir, { recursive: true, force: true })
}

// ---- 13. V5: the v5r-core PACK actually loads AND actually fires -------------------------------------
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-v5r-core-'))
  const h = fakeCtx()
  const handle = entry.apply(h.ctx, { clock, root: dir, packs: ['v5r-core'] })
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
  // M2 FIRES (and stays silent for other tools).
  const recordDecision = await handle.kernel.bus.emit('tools/pre-execute', { tool: 'vibe_vmu_records', args: { action: 'append' } }, {})
  ok(recordDecision.ok === false && recordDecision.refused && recordDecision.refused.code === 'VMU_PACK_V5R_CORE_NOT_SETTLED',
    'the pack-carried M2 module fires too', JSON.stringify(recordDecision.refused))
  const other = await handle.kernel.bus.emit('tools/pre-execute', { tool: 'vibe_vmu_status', args: {} }, {})
  ok(other.ok === true, 'and it stays silent for tools it does not govern (no blanket denial)')
  await rm(dir, { recursive: true, force: true })
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
  await rm(dir, { recursive: true, force: true })
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
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU ENTRY SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU ENTRY: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
