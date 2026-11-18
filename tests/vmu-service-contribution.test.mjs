#!/usr/bin/env node
// TB-2794 Step 0 — THE SERVICE CONTRIBUTION SEAM.
//
// WHY THIS GATE EXISTS: the research faces are moving from `kernel/` into packs, one face at a time. Before any face moves,
// the framework needs the ONE door through which a pack supplies a face, and it must be falsifiable at every point:
//   · a contributed service is visible through the SAME registry every kernel service uses (kernel.service / getters);
//   · the receipt NAMES the provider (kernel status `servicesProvided` + registry providedBy), never an anonymous face;
//   · a pack may NOT shadow a face the kernel still constructs (no dual implementation);
//   · unload retracts it — the face becomes null/absent and the status list is empty (no silent survivor);
//   · a kernel-local service can NEVER be retracted by a pack;
//   · a declared module needs the `contribute-services` capability (capability-gated like services.get).
//
// The three lamps at the end copy the tree and remove ONE ingredient each (getter fallback / unload retract / provider name)
// and require the corresponding assertion to go red — the repo's standard: every guard must be shown to fail.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SRC = join(REPO, 'vibe-math-vmu')
const KERNEL = join(SRC, 'kernel', 'index.js')
const PACK = join(SRC, 'kernel', 'pack.js')
const LOADER = join(SRC, 'kernel', 'loader.js')

let passed = 0
const failed = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed.push(name + (detail === undefined ? '' : ' — ' + JSON.stringify(detail))); console.error('  FAIL ' + name + (detail === undefined ? '' : ' — ' + JSON.stringify(detail))) }
}
const throwsCode = (fn, code, name) => {
  try { fn(); ok(false, name, 'did not throw') } catch (e) { ok(e && e.code === code, name, e && e.code) }
}
const importFrom = (dir, rel) => import(pathToFileURL(join(dir, rel)).href + '?t=' + Date.now() + Math.random())
const newTree = (tag) => {
  const root = mkdtempSync(join(tmpdir(), 'vmu-service-contribution-' + tag + '-'))
  cpSync(SRC, join(root, 'vibe-math-vmu'), { recursive: true, filter: (src) => !/[\\/]docs([\\/]|$)/.test(src) })
  return root
}

// ── 1. kernel-side seam: provide → getter/registry/status → retract ────────────────────────────────────────────────────
{
  const km = await importFrom(SRC, 'kernel/index.js')
  const k = km.createKernel({ clock: () => 1000 })
  ok(k.lean === null, 'setup: a kernel with no spawn seam constructs NO lean face (getter is null, not a fake)', k.lean)
  ok(k.status().servicesProvided.length === 0, 'setup: no contributed services before anything is provided', k.status().servicesProvided)
  const before = k.status().registry.services.filter((s) => s.name === 'vmu.lean')
  ok(before.length === 0, 'setup: the registry does not list vmu.lean yet (nothing is silently pre-published)', before)

  const provided = k.provideService({ name: 'vmu.lean', apiVersion: 1, impl: { compile: () => 'probe', apiVersion: 1 }, by: 'probe-pack' })
  ok(provided.ok === true && provided.providedBy === 'probe-pack', 'provideService returns the provider identity', provided)
  ok(k.lean && typeof k.lean.compile === 'function' && k.lean.compile() === 'probe',
    '★★★ the GETTER resolves a contributed face when the kernel has no local construction (local-absent ⇒ registry lookup)', typeof k.lean)
  const st = k.status()
  ok(st.servicesProvided.length === 1 && st.servicesProvided[0].name === 'vmu.lean' && st.servicesProvided[0].providedBy === 'probe-pack',
    '★★★ status names WHO provides the face (`servicesProvided[].providedBy`)', st.servicesProvided)
  ok(/pack/.test(String(st.servicesProvidedMeans)) && /unload/.test(String(st.servicesProvidedMeans)),
    '★★ servicesProvidedMeans says the face is pack-provided and that unload retracts it', st.servicesProvidedMeans)
  const reg = st.registry.services.filter((s) => s.name === 'vmu.lean')
  ok(reg.length === 1 && reg[0].providedBy === 'probe-pack' && reg[0].apiVersion === 1,
    '★★ the ONE registry carries the same provider/version (status cannot disagree with the registry)', reg)
  ok(k.service('vmu.lean') === k.lean, 'service(name) and the typed getter answer with the same object', typeof k.service('vmu.lean'))

  const retracted = k.retractService({ name: 'vmu.lean', by: 'probe-pack' })
  ok(retracted.ok === true && retracted.removed === true, 'retractService removes the contribution', retracted)
  ok(k.lean === null, '★★★ after retract the getter is null again (no silent survivor)', k.lean)
  ok(k.status().servicesProvided.length === 0 && k.status().registry.services.filter((s) => s.name === 'vmu.lean').length === 0,
    '★★★ after retract the status list AND the registry are empty for that name', k.status().servicesProvided)
}

// ── 2. refusals: no shadowing, no double provider, no retracting kernel-local faces ───────────────────────────────────
{
  const km = await importFrom(SRC, 'kernel/index.js')
  const k = km.createKernel({ clock: () => 1000 })
  // TB-2794 Step 4: a CORE framework face (tasks) is constructed locally for good, so it keeps the
  // no-shadow guard meaningful (no dual implementation).
  throwsCode(() => k.provideService({ name: 'vmu.tasks', apiVersion: 1, impl: { list: () => [] }, by: 'x-pack' }), 'VMU_SERVICE_CONFLICT',
    '★★ a pack may NOT shadow a face the kernel still constructs (no dual implementation)')
  throwsCode(() => k.provideService({ name: 'vmu.probe.bad name', apiVersion: 1, impl: {} , by: 'x-pack' }), 'VMU_INVALID_ARGUMENT',
    'a malformed service name is refused by name')
  throwsCode(() => k.provideService({ name: 'vmu.probe.thing', apiVersion: 0, impl: {}, by: 'x-pack' }), 'VMU_INVALID_ARGUMENT',
    'a non-integer/zero apiVersion is refused by name')
  k.provideService({ name: 'vmu.probe.thing', apiVersion: 1, impl: { ping: () => 1 }, by: 'a-pack' })
  throwsCode(() => k.provideService({ name: 'vmu.probe.thing', apiVersion: 1, impl: { ping: () => 2 }, by: 'b-pack' }), 'VMU_SERVICE_CONFLICT',
    '★★ one name has one provider (a second provide is a named conflict, never an override)')
  throwsCode(() => k.retractService({ name: 'vmu.probe.thing', by: 'b-pack' }), 'VMU_NOT_PERMITTED',
    '★★ only the contributor may retract its service')
  throwsCode(() => k.retractService({ name: 'vmu.records', by: 'a-pack' }), 'VMU_NO_SUCH_OBJECT',
    '★★ a kernel-local service is not retractable by a pack')
  // registry-level refusal too: a kernel-local entry cannot be unregistered
  throwsCode(() => k.registry.unregister('vmu.records'), 'VMU_NOT_PERMITTED', '★★ registry.unregister refuses kernel-local entries')
}

// ── 3. pack manifest services: apply → visible + named; unload → gone ────────────────────────────────────────────────
{
  const km = await importFrom(SRC, 'kernel/index.js')
  const packm = await importFrom(SRC, 'kernel/pack.js')
  const k = km.createKernel({ clock: () => 1000 })
  const loader = packm.createPackLoader({ kernel: k, registry: k.registry })
  const manifest = { id: 'probe-pack', version: '1.0.0', services: [{ name: 'vmu.probe.pack', apiVersion: 1, create: () => ({ ping: () => 42 }) }] }
  const plan = loader.plan(manifest)
  ok(plan.ok === true && plan.actions.some((a) => a.kind === 'service' && a.name === 'vmu.probe.pack'),
    '★★ plan() reports the contributed service before any change (pure answer first)', plan.actions.filter((a) => a.kind === 'service'))
  const applied = await loader.apply({ ...manifest })
  ok(applied.ok === true && applied.services.some((s) => s.name === 'vmu.probe.pack'),
    '★ apply() reports the contributed service', applied.services)
  ok(k.service('vmu.probe.pack') && k.service('vmu.probe.pack').ping() === 42, '★★★ the pack-contributed face is LIVE after apply', k.service('vmu.probe.pack'))
  ok(k.status().servicesProvided.some((s) => s.name === 'vmu.probe.pack' && s.providedBy === 'probe-pack'),
    '★★ status names the pack as provider after apply', k.status().servicesProvided)
  const un = await loader.unload('probe-pack')
  ok(un.ok === true, 'unload reports success', un)
  ok(k.service('vmu.probe.pack') === null && k.lean === null,
    '★★★ after unload the contributed face is NOT resolvable (named absence, not a stale object)', k.service('vmu.probe.pack'))
  ok(k.status().servicesProvided.length === 0 && k.status().registry.services.filter((s) => s.name === 'vmu.probe.pack').length === 0,
    '★★★ unload leaves servicesProvided EMPTY and the registry without the name', k.status().servicesProvided)
  // the shape gate refuses a malformed declaration at PLAN time (not half-applied)
  const bad = loader.plan({ id: 'bad-svc', services: [{ name: 'not-dotted', apiVersion: 1, create: () => ({}) }] })
  ok(bad.ok === false && bad.problems.some((p) => /contributed service/.test(p)),
    '★★ a malformed contributed service is a PLAN problem (refused before any side effect)', bad.problems)
}

// ── 4. declared-module path: api.services.provide is capability-gated and stamps the module as provider ─────────────
{
  const km = await importFrom(SRC, 'kernel/index.js')
  const loaderm = await importFrom(SRC, 'kernel/loader.js')
  const k = km.createKernel({ clock: () => 1000 })
  const loader = loaderm.createLoader({
    services: {
      setting: () => undefined,
      kernel: Object.freeze({}),
      get: (n) => k.service(n),
      names: () => [],
      provide: (name, impl, meta) => k.provideService({ name, impl, apiVersion: meta.apiVersion, by: meta.by }),
      retract: (name, meta) => k.retractService({ name, by: meta.by }),
    },
  })
  const withCap = {
    meta: { id: 'service-provider', apiVersion: 1 }, capabilities: ['contribute-services'],
    hooks: { 'turn/reply-parsed': async (flat) => flat.api.services.provide('vmu.probe.module', { ping: () => 7 }, { apiVersion: 1 }) },
  }
  const rec = await loader.load({ kind: 'module', id: 'service-provider', module: withCap })
  const out = await rec.handlers['turn/reply-parsed']({ payload: {} })
  ok(out && out.ok === true && out.providedBy === 'module:service-provider',
    '★★★ a declared module contributes a service, and the loader stamps module:<id> as provider', out)
  ok(k.status().servicesProvided.some((s) => s.name === 'vmu.probe.module' && s.providedBy === 'module:service-provider'),
    '★★ the module provider reaches status', k.status().servicesProvided)
  const withoutCap = {
    meta: { id: 'no-capability', apiVersion: 1 }, capabilities: ['trigger-workflow'],
    hooks: { 'turn/reply-parsed': async (flat) => flat.api.services.provide('vmu.probe.denied', {}, { apiVersion: 1 }) },
  }
  const rec2 = await loader.load({ kind: 'module', id: 'no-capability', module: withoutCap })
  let denied = null
  try { await rec2.handlers['turn/reply-parsed']({ payload: {} }) } catch (e) { denied = e }
  ok(denied && denied.code === 'VMU_NOT_PERMITTED', '★★ without the contribute-services capability the provide is a named refusal', denied && denied.code)
  ok(k.service('vmu.probe.denied') === null, '★★ and nothing was published by the denied module', k.service('vmu.probe.denied'))
}

// ── 4b. TB-2794 Step 2 (round-8 audit, P2): the pack's create() CANNOT reach the registry, and residueFree is a
// FULL-TABLE claim (an unattributed registration must make the unload receipt FALSE, not be invisible).
{
  const km = await importFrom(SRC, 'kernel/index.js')
  const packm = await importFrom(SRC, 'kernel/pack.js')
  const k = km.createKernel({ clock: () => 1000 })
  const loader = packm.createPackLoader({ kernel: k, registry: k.registry })
  let seen = null
  await loader.apply({ id: 'facade-pack', version: '1.0.0', services: [{ name: 'vmu.probe.facade', apiVersion: 1,
    create: (ctx) => { seen = ctx; return { ping: () => 1 } } }] })
  ok(seen && typeof seen === 'object' && seen.kernel === undefined && seen.registry === undefined,
    '★★★ P2: create() receives a RESTRICTED facade — no raw kernel, no registry (the bypass path is not reachable)',
    seen && Object.keys(seen))
  ok(seen && typeof seen.facade === 'object' && typeof seen.facade.service === 'function' && typeof seen.facade.settingsSnapshot === 'function' && typeof seen.facade.provideService === 'function',
    '★★ P2: the facade exposes only the declared seams (service/settingsSnapshot/log/provide/retract/adapter)',
    seen && seen.facade && Object.keys(seen.facade))
  throwsCode(() => { throw Object.assign(new Error('x'), { code: 'VMU_ENGINE_UNAVAILABLE' }) }, 'VMU_ENGINE_UNAVAILABLE', 'sanity: throwsCode works')
  // a registration made BETWEEN apply and unload is NOT attributed to the pack — residueFree must still be false
  k.registry.register('vmu.tp.bypass', { ping: () => 'survives' }, { apiVersion: 1, providedBy: 'unattributed' })
  const un = await loader.unload('facade-pack')
  ok(un && un.residueFree === false && Array.isArray(un.residue) && un.residue.includes('vmu.tp.bypass'),
    '★★★ P2: residueFree is computed from the FULL registry table — an unattributed registration makes it FALSE and is NAMED',
    un && { residueFree: un.residueFree, residue: un.residue })
  ok(k.service('vmu.tp.bypass') !== null,
    '★★ P2: and the receipt did not silently remove the unattributed service (it names the residue; cleanup is its owner)')
  k.registry.unregister('vmu.tp.bypass')
  // aliases targeting a service make unregister a NAMED VMU_ENGINE_UNAVAILABLE (docs/03), and the hint says remove it first
  k.provideService({ name: 'vmu.probe.aliastarget', apiVersion: 1, impl: { ping: () => 1 }, by: 'alias-pack' })
  k.registry.alias('vmu.probe.legacy', 'vmu.probe.aliastarget', { reason: 'test' })
  throwsCode(() => k.retractService({ name: 'vmu.probe.aliastarget', by: 'alias-pack' }), 'VMU_ENGINE_UNAVAILABLE',
    '★★ P2: unregistering a service still targeted by an alias is VMU_ENGINE_UNAVAILABLE (docs/03), never VMU_MIDDLEWARE_FAILED')
  k.registry.removeAlias('vmu.probe.legacy')
}

// ── 4c. TB-2794 Step 3: the two research faces are PACK-CONTRIBUTED (v5r PACK.services), not kernel-local.
{
  const km = await importFrom(SRC, 'kernel/index.js')
  const packm = await importFrom(SRC, 'kernel/pack.js')
  const v5r = await importFrom(SRC, 'packs/v5r/prompts/v5r-core.js')
  const mk = async (settings = {}) => {
    const k = km.createKernel({ clock: () => 1000, root: mkdtempSync(join(tmpdir(), 'vmu-step3-')), settings })
    const loader = packm.createPackLoader({ kernel: k, registry: k.registry })
    return { k, loader }
  }
  {
    const { k, loader } = await mk()
    ok(k.reviewers === null && k.publication === null,
      '★★ Step3: a NO-PACK kernel has no reviewers/publication face (absence, not a stub)', { reviewers: k.reviewers, publication: k.publication })
    ok(k.status().registry.services.filter((s) => s.name === 'vmu.reviewers' || s.name === 'vmu.publication').length === 0,
      '★★ Step3: and the registry does not publish those names either')
    const applied = await loader.apply(v5r.PACK)
    const appliedStep3 = (applied.services || []).filter((x) => x.name === 'vmu.reviewers' || x.name === 'vmu.publication')
    ok(applied.ok === true && appliedStep3.length === 2,
      '★★ Step3: the v5r pack APPLIES its two contributed services (no local-name CONFLICT — the local construction is gone)',
      applied && applied.services)
    ok(k.reviewers !== null && k.publication !== null && typeof k.reviewers.register === 'function' && typeof k.publication.register === 'function',
      '★★ Step3: the getters resolve the CONTRIBUTED faces', { reviewers: !!k.reviewers, publication: !!k.publication })
    const provided = k.status().servicesProvided.map((s) => s.name).filter((n) => n === 'vmu.reviewers' || n === 'vmu.publication').sort()
    ok(provided.join(',') === 'vmu.publication,vmu.reviewers', '★★ Step3: servicesProvided names both, with the pack as owner', k.status().servicesProvided)
    const reg = k.status().registry.services.filter((s) => s.name === 'vmu.reviewers' || s.name === 'vmu.publication')
    ok(reg.length === 2 && reg.every((s) => s.providedBy === 'v5r-core'), '★★ Step3: registry providedBy = the pack id', reg)
    const un = await loader.unload(v5r.PACK.id)
    ok(un.ok === true && un.residueFree === true, '★★ Step3: unload is residue-free (the full-table scan agrees)', un)
    ok(k.reviewers === null && k.publication === null &&
      k.status().registry.services.filter((s) => s.name === 'vmu.reviewers' || s.name === 'vmu.publication').length === 0,
      '★★ Step3: after unload the faces are GONE (getter null, registry absent), not silently surviving', { reviewers: k.reviewers, publication: k.publication })
  }
  // P3 (product audit): unload with the REQUEST id ("v5r") instead of the manifest id ("v5r-core") must name the real
  // applied ids in its hint — the caller cannot discover the manifest id from a bare VMU_NO_SUCH_OBJECT with hint:null.
  {
    const { k, loader } = await mk()
    await loader.apply(v5r.PACK)
    let err = null
    try { await loader.unload('v5r') } catch (e) { err = e }
    ok(err && err.code === 'VMU_NO_SUCH_OBJECT' && typeof err.hint === 'string' && err.hint.includes(v5r.PACK.id),
      '★★ P3: unload with the request id names the REAL applied ids in the hint (no hint:null dead end)', err && { code: err.code, hint: err.hint, facts: err.facts })
    await loader.unload(v5r.PACK.id)
  }

  // lifecycle: the publication seam is a RESOLVER (pack applies after createLifecycle). A criterion, not a snapshot.
  {
    const lm = await importFrom(SRC, 'kernel/lifecycle.js')
    let calls = 0
    const stages = [{ id: 'L1', name: 'a', requires: [], gates: [] }, { id: 'L2', name: 'b', requires: [], gates: ['publication'] }]
    const lc = lm.createLifecycle({ clock: () => 1000, settings: { 'vmu.lifecycle.stages': stages },
      publication: () => ({ check: () => { calls += 1; return { ok: true } } }) })
    const first = lc.advance({ studyId: 's1', to: 'L1' })
    const advanced = lc.advance({ studyId: 's1', to: 'L2' })
    ok(first.ok === true && advanced.ok === true && calls === 1,
      '★★ Step3: lifecycle UNWRAPS the publication resolver at use time (a pack-applied face is visible to a constructed loop)', { advanced, calls })
  }
  // approval gate: the pack attaches the kernel's OWN gate to its contributed publication face
  {
    const { k, loader } = await mk({ 'vmu.human.gatedActions': ['vmu.publication.register'] })
    await loader.apply(v5r.PACK)
    let gateCode = null
    try { await k.publication.register({ id: 'p-gate', title: 'T' }) } catch (e) { gateCode = e && e.code }
    ok(typeof gateCode === 'string' && gateCode.indexOf('VMU_HUMAN_') === 0,
      '★★ Step3: the pack-attached approval gate wraps the CONTRIBUTED publication face (gated action refuses by name)', gateCode)
  }
}

// ── 4d. TB-2794 Step 4: formal + fidelity are pack-contributed; the turn face map resolves pack faces at DISPATCH time.
{
  const km = await importFrom(SRC, 'kernel/index.js')
  const packm = await importFrom(SRC, 'kernel/pack.js')
  const v5r = await importFrom(SRC, 'packs/v5r/prompts/v5r-core.js')
  const mk = async () => {
    const k = km.createKernel({ clock: () => 1000, root: mkdtempSync(join(tmpdir(), 'vmu-step4-')) })
    return { k, loader: packm.createPackLoader({ kernel: k, registry: k.registry }) }
  }
  {
    const { k, loader } = await mk()
    ok(k.formal === null && k.fidelity === null,
      '★★ Step4: a NO-PACK kernel has no formal/fidelity face (absence, not a stub)', { formal: !!k.formal, fidelity: !!k.fidelity })
    ok(k.fidelityLoad().code === 'VMU_ENGINE_UNAVAILABLE',
      '★★ Step4: without a pack the fidelity-load receipt is a NAMED unavailable (never a fake loaded:0)', k.fidelityLoad())
    const applied = await loader.apply(v5r.PACK)
    ok(applied.ok === true && applied.services.some((s) => s.name === 'vmu.formal') && applied.services.some((s) => s.name === 'vmu.fidelity'),
      '★★ Step4: v5r publishes formal/fidelity through the service seam (no local-name CONFLICT)', applied.services.map((s) => s.name))
    ok(!!k.formal && !!k.fidelity && typeof k.formal.check === 'function' && typeof k.fidelity.applyAbstention === 'function',
      '★★ Step4: the getters resolve the contributed faces', { formal: !!k.formal, fidelity: !!k.fidelity })
    const prov = k.status().servicesProvided.map((s) => s.name)
    ok(prov.includes('vmu.formal') && prov.includes('vmu.fidelity'), '★★ Step4: servicesProvided names both', prov)
    const reg = k.status().registry.services.filter((s) => s.name === 'vmu.formal' || s.name === 'vmu.fidelity')
    ok(reg.length === 2 && reg.every((s) => s.providedBy === 'v5r-core'), '★★ Step4: registry providedBy = the pack id', reg)
    const load = k.fidelityLoad()
    ok(load.status !== 'pending' && load.code !== 'VMU_ENGINE_UNAVAILABLE',
      '★★ Step4: the CONTRIBUTOR starts the load and the kernel DELEGATES its receipt (no pending-after-apply, no fake loaded:0)', load)
    const un = await loader.unload(v5r.PACK.id)
    ok(un.ok === true && un.residueFree === true && k.formal === null && k.fidelity === null,
      '★★ Step4: unload retracts both faces residue-free', { residueFree: un.residueFree, formal: !!k.formal, fidelity: !!k.fidelity })
  }
  // The turn resolver, through the REAL entry (runtime.json reply fields are folded there): a pack "formal" reply field
  // must dispatch to vmu.formal.check, not face-not-wired. This is the criterion for "construction-time snapshot ⇒ lazy".
  const bootEntry = async (dir) => {
    const entry = await importFrom(dir, 'vibe-math-vmu.js')
    const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async () => () => {} } }
    const h = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: mkdtempSync(join(tmpdir(), 'vmu-step4-boot-')) })
    await h.ready()
    await h.kernel.store.open()
    return h.kernel
  }
  {
    const k = await bootEntry(SRC)
    const out = await k.turn.apply({ formal: { statement: 'P', proof: 'theorem t : True := trivial' } }, null, 'r-1')
    const skip = out.skipped[0] || null
    ok(out.executed.length === 1 && skip === null && out.executed[0].face === 'vmu.formal',
      '★★★ Step4: a PACK formal reply field reaches vmu.formal.check at dispatch time (the face map is NOT a construction snapshot)',
      { executed: out.executed.map((e) => e.face), skipped: out.skipped })
  }
}


// ── 4e. TB-2794 Step 5: lean + mathjobs are pack-contributed (engine stays in kernel); lean declines without a spawn seam.
{
  const km = await importFrom(SRC, 'kernel/index.js')
  const packm = await importFrom(SRC, 'kernel/pack.js')
  const v5r = await importFrom(SRC, 'packs/v5r/prompts/v5r-core.js')
  const mk = async () => {
    const k = km.createKernel({ clock: () => 1000, root: mkdtempSync(join(tmpdir(), 'vmu-step5-')) })
    return { k, loader: packm.createPackLoader({ kernel: k, registry: k.registry }) }
  }
  {
    const { k, loader } = await mk()
    ok(k.lean === null && k.mathjobs === null,
      '★★ Step5: a NO-PACK kernel has no lean/mathjobs face (absence, not a stub)', { lean: !!k.lean, mathjobs: !!k.mathjobs })
    ok(k.status().registry.services.filter((s) => s.name === 'vmu.lean' || s.name === 'vmu.mathjobs').length === 0,
      '★★ Step5: and the registry does not publish either name')
    const applied = await loader.apply(v5r.PACK)
    ok(applied.ok === true && applied.services.some((s) => s.name === 'vmu.mathjobs' && s.contributed === true),
      '★★ Step5: v5r publishes vmu.mathjobs (no local-name CONFLICT)', applied.services)
    // No spawn seam in this fixture ⇒ the OPTIONAL lean contribution DECLINES, by name (the old kernel created no lean
    // face without a seam either; publishing an inert face would make tools believe a capability exists).
    ok(applied.services.some((s) => s.name === 'vmu.lean' && s.contributed === false && s.reason === 'optional-declined') && k.lean === null,
      '★★ Step5: without a spawn seam the OPTIONAL lean contribution declines by name and no face is published', applied.services)
    ok(!!k.mathjobs && typeof k.mathjobs.submit === 'function', '★★ Step5: the contributed mathjobs face resolves')
    const reg = k.status().registry.services.filter((s) => s.name === 'vmu.mathjobs')
    ok(reg.length === 1 && reg[0].providedBy === 'v5r-core', '★★ Step5: registry providedBy = the pack id (LEAN has no row without a seam)', reg)
    const un = await loader.unload(v5r.PACK.id)
    ok(un.ok === true && un.residueFree === true && k.mathjobs === null,
      '★★ Step5: unload retracts mathjobs residue-free', { residueFree: un.residueFree, mathjobs: !!k.mathjobs })
  }
  // With a spawn seam the lean face IS contributed and KEEPS its own registry row (the pre-Step-5 bug: vmu.lean had none).
  {
    const k = km.createKernel({ clock: () => 1000, root: mkdtempSync(join(tmpdir(), 'vmu-step5b-')), spawn: async () => ({ exitCode: 0, stdout: '', stderr: '', ms: 1 }) })
    const loader = packm.createPackLoader({ kernel: k, registry: k.registry })
    const applied = await loader.apply(v5r.PACK)
    ok(!!k.lean && typeof k.lean.policy === 'function', '★★ Step5: with a spawn seam the contributed Lean face exists (policy seam present)', { lean: !!k.lean })
    const reg = k.status().registry.services.filter((s) => s.name === 'vmu.lean')
    ok(reg.length === 1 && reg[0].providedBy === 'v5r-core', '★★★ Step5: vmu.lean finally has a REGISTRY ROW (it had none before the migration) with the pack as owner', reg)
    ok(k.status().servicesProvided.some((s) => s.name === 'vmu.lean'), '★★ Step5: servicesProvided names the lean contribution')
    // policy keys are read by the PACK wrapper, not the kernel engine
    const used = k.lean.keysUsed()
    ok(used.includes('vmu.math.leanCommand') && used.includes('vmu.math.formalVerify') && used.includes('vmu.math.leanInitiative'),
      '★★ Step5: face keysUsed reports engine keys AND the two policy keys the wrapper read', used)
    await loader.unload(v5r.PACK.id)
    ok(k.lean === null && k.status().registry.services.filter((s) => s.name === 'vmu.lean').length === 0,
      '★★ Step5: after unload the lean face and its registry row are gone')
  }
}


// ── 5. LAMPS: remove one ingredient in a COPY and require the matching assertion to go red ──────────────────────────
for (const [tag, mutate, expectedRed] of [
  ['getter-fallback', (dir) => {
    const p = join(dir, 'vibe-math-vmu', 'kernel', 'index.js')
    const s = readFileSync(p, 'utf8')
    // the getter stops resolving contributed faces (the pre-Step-0 shape)
    writeFileSync(p, s.replace("    get lean() { return resolveFace(null, 'vmu.lean') },", '    get lean() { return null },'), 'utf8')
  }, 'getter resolves contributed face'],
  ['unload-retract', (dir) => {
    const p = join(dir, 'vibe-math-vmu', 'kernel', 'pack.js')
    const s = readFileSync(p, 'utf8')
    writeFileSync(p, s.replace("        undo.push(() => { try { return kernel.retractService({ name: svc.name, by: manifest.id }) } catch { /* unload must still proceed; the failure is not silent because the next status shows it */ } })", ''), 'utf8')
  }, 'status list empty after unload'],
  ['provider-name', (dir) => {
    const p = join(dir, 'vibe-math-vmu', 'kernel', 'index.js')
    const s = readFileSync(p, 'utf8')
    // keep the map but stop naming the provider in the registry (the status/registry disagreement this gate forbids)
    writeFileSync(p, s.replace("registry.register(key, impl, { apiVersion: v, providedBy: by === null || by === undefined ? '(unattributed)' : String(by) })", 'registry.register(key, impl, { apiVersion: v })'), 'utf8')
  }, 'registry names the provider'],
]) {
  const dir = newTree(tag)
  try {
    mutate(dir)
    let red = null
    try {
      const km = await importFrom(join(dir, 'vibe-math-vmu'), 'kernel/index.js')
      const packm = tag === 'unload-retract' ? await importFrom(join(dir, 'vibe-math-vmu'), 'kernel/pack.js') : null
      const k = km.createKernel({ clock: () => 1000 })
      if (tag === 'getter-fallback') {
        k.provideService({ name: 'vmu.lean', apiVersion: 1, impl: { compile: () => 'probe' }, by: 'probe-pack' })
        if (k.lean === null) red = 'getter resolves contributed face'
      } else if (tag === 'unload-retract') {
        const loader = packm.createPackLoader({ kernel: k, registry: k.registry })
        await loader.apply({ id: 'lamp-pack', version: '1.0.0', services: [{ name: 'vmu.probe.lamp', apiVersion: 1, create: () => ({ ping: () => 1 }) }] })
        await loader.unload('lamp-pack')
        if (k.status().servicesProvided.length !== 0) red = 'status list empty after unload'
      } else {
        k.provideService({ name: 'vmu.probe.named', apiVersion: 1, impl: { ping: () => 1 }, by: 'probe-pack' })
        const reg = k.status().registry.services.filter((s) => s.name === 'vmu.probe.named')
        if (!(reg.length === 1 && reg[0].providedBy === 'probe-pack')) red = 'registry names the provider'
      }
    } catch (e) { red = 'threw: ' + (e && e.code) + ' ' + (e && e.message) }
    ok(red === expectedRed, '★★★ LAMP(' + tag + '): removing ONE ingredient reddens the matching assertion', red)
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
  }
}

// ── 5b. TB-2794 Step 3 LAMPS (four): each copy removes ONE ingredient and requires a real red ────────────────────────
{
  // ① no services declaration in the pack: no faces (the declaration is what publishes them)
  const dir = newTree('step3-no-services')
  try {
    const cp = join(dir, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-core.js')
    writeFileSync(cp, readFileSync(cp, 'utf8').replace('\n  services: [', '\n  servicesOff: ['), 'utf8')
    const km = await importFrom(join(dir, 'vibe-math-vmu'), 'kernel/index.js')
    const packm = await importFrom(join(dir, 'vibe-math-vmu'), 'kernel/pack.js')
    const v5r = await importFrom(join(dir, 'vibe-math-vmu'), 'packs/v5r/prompts/v5r-core.js')
    const k = km.createKernel({ clock: () => 1000, root: join(dir, 'root') })
    const loader = packm.createPackLoader({ kernel: k, registry: k.registry })
    await loader.apply(v5r.PACK)
    ok(k.reviewers === null && k.publication === null,
      'LAMP(step3-no-services): without PACK.services the faces are absent — the declaration is load-bearing', { reviewers: !!k.reviewers, publication: !!k.publication })
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 10 }) }
  // ② no attachApprovalGate in the pack: the contributed face is NOT gated
  const dir2 = newTree('step3-no-gate')
  try {
    const cp = join(dir2, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-core.js')
    writeFileSync(cp, readFileSync(cp, 'utf8').replace('facade.attachApprovalGate({', 'void ({'), 'utf8')
    const km = await importFrom(join(dir2, 'vibe-math-vmu'), 'kernel/index.js')
    const packm = await importFrom(join(dir2, 'vibe-math-vmu'), 'kernel/pack.js')
    const v5r = await importFrom(join(dir2, 'vibe-math-vmu'), 'packs/v5r/prompts/v5r-core.js')
    const k = km.createKernel({ clock: () => 1000, root: join(dir2, 'root'), settings: { 'vmu.human.gatedActions': ['vmu.publication.register'] } })
    const loader = packm.createPackLoader({ kernel: k, registry: k.registry })
    await loader.apply(v5r.PACK)
    let code = null
    try { await k.publication.register({ id: 'g', title: 'T' }) } catch (e) { code = e && e.code }
    ok(typeof code !== 'string' || code.indexOf('VMU_HUMAN_') !== 0,
      'LAMP(step3-no-gate): without the pack-attached gate the action is NOT refused by the human gate (the attach is load-bearing)', code)
  } finally { rmSync(dir2, { recursive: true, force: true, maxRetries: 10 }) }
  // ③ unload does not retract a contributed service: residue survives (the full-table receipt must catch it)
  const dir3 = newTree('step3-unload-retract')
  try {
    const cp = join(dir3, 'vibe-math-vmu', 'kernel', 'pack.js')
    writeFileSync(cp, readFileSync(cp, 'utf8').replace("        undo.push(() => { try { return kernel.retractService({ name: svc.name, by: manifest.id }) } catch { /* unload must still proceed; the failure is not silent because the next status shows it */ } })", ''), 'utf8')
    const km = await importFrom(join(dir3, 'vibe-math-vmu'), 'kernel/index.js')
    const packm = await importFrom(join(dir3, 'vibe-math-vmu'), 'kernel/pack.js')
    const k = km.createKernel({ clock: () => 1000, root: join(dir3, 'root') })
    const loader = packm.createPackLoader({ kernel: k, registry: k.registry })
    await loader.apply({ id: 'lamp3-pack', version: '1.0.0', services: [{ name: 'vmu.probe.step3', apiVersion: 1, create: () => ({ ping: () => 1 }) }] })
    await loader.unload('lamp3-pack')
    ok(k.service('vmu.probe.step3') !== null,
      'LAMP(step3-unload-retract): without the undo the contributed service SURVIVES unload — the retract is load-bearing', k.status().servicesProvided)
  } finally { rmSync(dir3, { recursive: true, force: true, maxRetries: 10 }) }
  // ④ lifecycle snapshots the seam instead of unwrapping the resolver: a pack-applied face is invisible
  const dir4 = newTree('step3-lifecycle-snapshot')
  try {
    const cp = join(dir4, 'vibe-math-vmu', 'kernel', 'lifecycle.js')
    writeFileSync(cp, readFileSync(cp, 'utf8').replace("const seam = kind === 'publication' ? publicationOf() : domaingate", "const seam = kind === 'publication' ? publication : domaingate"), 'utf8')
    const lm = await importFrom(join(dir4, 'vibe-math-vmu'), 'kernel/lifecycle.js')
    const stages = [{ id: 'L1', name: 'a', requires: [], gates: [] }, { id: 'L2', name: 'b', requires: [], gates: ['publication'] }]
    const lc = lm.createLifecycle({ clock: () => 1000, settings: { 'vmu.lifecycle.stages': stages }, publication: () => ({ check: () => ({ ok: true }) }) })
    lc.advance({ studyId: 's1', to: 'L1' })
    const adv = lc.advance({ studyId: 's1', to: 'L2' })
    ok(adv.ok === false && adv.code === 'VMU_EXTERNAL_UNAVAILABLE',
      'LAMP(step3-lifecycle-snapshot): a snapshot seam treats the resolver as the face and refuses — the unwrap is load-bearing', adv)
  } finally { rmSync(dir4, { recursive: true, force: true, maxRetries: 10 }) }
}

// ── 5c. TB-2794 Step 4 LAMPS (four) ───────────────────────────────────────────────────────────────────────────────────
{
  // ① no services declaration for formal/fidelity: no faces
  const dir = newTree('step4-no-services')
  try {
    const cp = join(dir, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-core.js')
    let src = readFileSync(cp, 'utf8')
    src = src.replace("name: 'vmu.formal', apiVersion: 1,", "nameOff: 'vmu.formal', apiVersion: 1,")
    src = src.replace("name: 'vmu.fidelity', apiVersion: 1,", "nameOff: 'vmu.fidelity', apiVersion: 1,")
    writeFileSync(cp, src, 'utf8')
    const km = await importFrom(join(dir, 'vibe-math-vmu'), 'kernel/index.js')
    const packm = await importFrom(join(dir, 'vibe-math-vmu'), 'kernel/pack.js')
    const v5r = await importFrom(join(dir, 'vibe-math-vmu'), 'packs/v5r/prompts/v5r-core.js')
    const k = km.createKernel({ clock: () => 1000, root: join(dir, 'root') })
    const loader = packm.createPackLoader({ kernel: k, registry: k.registry })
    try { await loader.apply(v5r.PACK) } catch { /* the mutated declaration is refused; the point is absence */ }
    ok(k.formal === null && k.fidelity === null,
      'LAMP(step4-no-services): without the service declarations the faces are ABSENT — the declaration is load-bearing', { formal: !!k.formal, fidelity: !!k.fidelity })
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 10 }) }
  // ② contributor does not start the durable load: the kernel receipt stays pending (never a silent loaded)
  const dir2 = newTree('step4-no-load')
  try {
    const cp = join(dir2, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-core.js')
    writeFileSync(cp, readFileSync(cp, 'utf8').replace("if (typeof f.startLoad === 'function') f.startLoad()", ''), 'utf8')
    const km = await importFrom(join(dir2, 'vibe-math-vmu'), 'kernel/index.js')
    const packm = await importFrom(join(dir2, 'vibe-math-vmu'), 'kernel/pack.js')
    const v5r = await importFrom(join(dir2, 'vibe-math-vmu'), 'packs/v5r/prompts/v5r-core.js')
    const k = km.createKernel({ clock: () => 1000, root: join(dir2, 'root') })
    const loader = packm.createPackLoader({ kernel: k, registry: k.registry })
    await loader.apply(v5r.PACK)
    ok(k.fidelityLoad().status === 'pending',
      'LAMP(step4-no-load): without the contributor start the receipt stays PENDING — the delegated load is load-bearing', k.fidelityLoad())
  } finally { rmSync(dir2, { recursive: true, force: true, maxRetries: 10 }) }
  // ③ unload does not retract: the contributed face survives
  const dir3 = newTree('step4-unload-retract')
  try {
    const cp = join(dir3, 'vibe-math-vmu', 'kernel', 'pack.js')
    writeFileSync(cp, readFileSync(cp, 'utf8').replace("        undo.push(() => { try { return kernel.retractService({ name: svc.name, by: manifest.id }) } catch { /* unload must still proceed; the failure is not silent because the next status shows it */ } })", ''), 'utf8')
    const km = await importFrom(join(dir3, 'vibe-math-vmu'), 'kernel/index.js')
    const packm = await importFrom(join(dir3, 'vibe-math-vmu'), 'kernel/pack.js')
    const k = km.createKernel({ clock: () => 1000, root: join(dir3, 'root') })
    const loader = packm.createPackLoader({ kernel: k, registry: k.registry })
    await loader.apply({ id: 'lamp4-pack', version: '1.0.0', services: [{ name: 'vmu.probe.step4', apiVersion: 1, create: () => ({ ping: () => 1 }) }] })
    await loader.unload('lamp4-pack')
    ok(k.service('vmu.probe.step4') !== null,
      'LAMP(step4-unload-retract): without the undo the contributed face SURVIVES unload — the retract is load-bearing', k.status().servicesProvided)
  } finally { rmSync(dir3, { recursive: true, force: true, maxRetries: 10 }) }
  // ④ turn face map is a construction snapshot (resolver removed): the pack formal reply field goes back to face-not-wired
  const dir4 = newTree('step4-snapshot-resolver')
  try {
    const cp = join(dir4, 'vibe-math-vmu', 'kernel', 'index.js')
    const src4 = readFileSync(cp, 'utf8')
    writeFileSync(cp, src4.replace('    resolveService: (name) => resolveFace(null, name),', ''), 'utf8')
    const entry = await importFrom(join(dir4, 'vibe-math-vmu'), 'vibe-math-vmu.js')
    const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async () => () => {} } }
    const h = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: join(dir4, 'boot-root') })
    await h.ready(); await h.kernel.store.open()
    const out = await h.kernel.turn.apply({ formal: { statement: 'P', proof: 'theorem t : True := trivial' } }, null, 'r-1')
    ok(out.executed.length === 0 && out.skipped[0] && out.skipped[0].code === 'VMU_TURN_FACE_NOT_WIRED',
      'LAMP(step4-resolver): a construction-time face map reports the pack formal field as face-not-wired — the lazy resolver is load-bearing',
      out.skipped)
  } finally { rmSync(dir4, { recursive: true, force: true, maxRetries: 10 }) }
}


// ── 5d. TB-2794 Step 5 LAMPS (four) ───────────────────────────────────────────────────────────────────────────────────
{
  // ① no services declarations for lean/mathjobs
  const dir = newTree('step5-no-services')
  try {
    const cp = join(dir, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-core.js')
    let src = readFileSync(cp, 'utf8')
    src = src.replace("name: 'vmu.lean', apiVersion: 1,", "nameOff: 'vmu.lean', apiVersion: 1,")
    src = src.replace("name: 'vmu.mathjobs', apiVersion: 1,", "nameOff: 'vmu.mathjobs', apiVersion: 1,")
    writeFileSync(cp, src, 'utf8')
    const km = await importFrom(join(dir, 'vibe-math-vmu'), 'kernel/index.js')
    const packm = await importFrom(join(dir, 'vibe-math-vmu'), 'kernel/pack.js')
    const v5r = await importFrom(join(dir, 'vibe-math-vmu'), 'packs/v5r/prompts/v5r-core.js')
    const k = km.createKernel({ clock: () => 1000, root: join(dir, 'root'), spawn: async () => ({ exitCode: 0 }) })
    const loader = packm.createPackLoader({ kernel: k, registry: k.registry })
    try { await loader.apply(v5r.PACK) } catch { /* refused declaration; absence is the point */ }
    ok(k.mathjobs === null && k.lean === null,
      'LAMP(step5-no-services): without the declarations both faces are ABSENT — the declaration is load-bearing', { mathjobs: !!k.mathjobs, lean: !!k.lean })
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 10 }) }
  // ② the child budget IGNORES the injected timer (uses the platform timer): the injection is load-bearing
  const dir2 = newTree('step5-timer')
  try {
    const jbPath = join(dir2, 'vibe-math-vmu', 'kernel', 'jobbudget.js')
    const jsrc = readFileSync(jbPath, 'utf8')
    writeFileSync(jbPath, jsrc.replace("const setT = typeof timer === 'function' ? timer : defaultTimer", "const setT = defaultTimer  /* lamp: injected timer ignored */"), 'utf8')
    const bm = await importFrom(join(dir2, 'vibe-math-vmu'), 'kernel/jobbudget.js')
    let calls = 0
    const fakeTimer = (cb, ms) => { calls += 1; const h = setTimeout(cb, ms); return () => clearTimeout(h) }
    const withBudget = bm.createChildBudget({ timer: fakeTimer })
    await withBudget({ call: async () => ({ exitCode: 0, stdout: '', stderr: '' }), timeoutMs: 50, label: 'lamp' })
    ok(calls === 0,
      'LAMP(step5-timer): with the injected timer IGNORED the seam is never called — the injection is load-bearing', { calls })
  } finally { rmSync(dir2, { recursive: true, force: true, maxRetries: 10 }) }
  // ③ unload does not retract the contributed mathjobs service
  const dir3 = newTree('step5-unload-retract')
  try {
    const cp = join(dir3, 'vibe-math-vmu', 'kernel', 'pack.js')
    writeFileSync(cp, readFileSync(cp, 'utf8').replace("        undo.push(() => { try { return kernel.retractService({ name: svc.name, by: manifest.id }) } catch { /* unload must still proceed; the failure is not silent because the next status shows it */ } })", ''), 'utf8')
    const km = await importFrom(join(dir3, 'vibe-math-vmu'), 'kernel/index.js')
    const packm = await importFrom(join(dir3, 'vibe-math-vmu'), 'kernel/pack.js')
    const k = km.createKernel({ clock: () => 1000, root: join(dir3, 'root') })
    const loader = packm.createPackLoader({ kernel: k, registry: k.registry })
    await loader.apply({ id: 'lamp5-pack', version: '1.0.0', services: [{ name: 'vmu.probe.step5', apiVersion: 1, create: () => ({ ping: () => 1 }) }] })
    await loader.unload('lamp5-pack')
    ok(k.service('vmu.probe.step5') !== null,
      'LAMP(step5-unload-retract): without the undo the contributed face SURVIVES unload — the retract is load-bearing', k.status().servicesProvided)
  } finally { rmSync(dir3, { recursive: true, force: true, maxRetries: 10 }) }
  // ④ policy wrapper removed: leanInitiative/formalVerify settings stop being honoured (engine reads no policy key)
  const dir4 = newTree('step5-policy')
  try {
    const lp = join(dir4, 'vibe-math-vmu', 'packs', 'research-core', 'lean-face.js')
    writeFileSync(lp, readFileSync(lp, 'utf8')
      .replace("formalVerify: String(settings['vmu.math.formalVerify'] || 'off'),", "formalVerify: 'off',")
      .replace("leanInitiative: String(settings['vmu.math.leanInitiative'] || 'normal'),", "leanInitiative: 'normal',"), 'utf8')
    const lm = await importFrom(join(dir4, 'vibe-math-vmu'), 'packs/research-core/lean-face.js')
    const face = lm.createLeanResearchFace({ facade: {
      settingsSnapshot: () => ({ 'vmu.math.formalVerify': 'require', 'vmu.math.leanInitiative': 'eager' }),
      spawn: async () => ({ exitCode: 0, stdout: '', stderr: '', ms: 1 }), clock: () => 1000,
      spawnHandle: null, timer: null, ids: null, fs: null, root: null, log: () => {},
    } })
    const pol = face && typeof face.policy === 'function' ? face.policy() : null
    ok(pol && pol.formalVerify === 'off',
      'LAMP(step5-policy): with the wrapper CONSTANT the deployed policy is ignored — the settings-to-policy read is load-bearing', pol)
  } finally { rmSync(dir4, { recursive: true, force: true, maxRetries: 10 }) }
}


console.log('\n=== VMU SERVICE CONTRIBUTION: ' + passed + ' passed, ' + failed.length + ' failed ===')
for (const f of failed) console.error('  - ' + f)
process.exit(failed.length === 0 ? 0 : 1)
