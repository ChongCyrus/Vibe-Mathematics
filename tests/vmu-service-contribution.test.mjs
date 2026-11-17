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
  throwsCode(() => k.provideService({ name: 'vmu.formal', apiVersion: 1, impl: { check: () => null }, by: 'x-pack' }), 'VMU_SERVICE_CONFLICT',
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

// ── 5. LAMPS: remove one ingredient in a COPY and require the matching assertion to go red ──────────────────────────
for (const [tag, mutate, expectedRed] of [
  ['getter-fallback', (dir) => {
    const p = join(dir, 'vibe-math-vmu', 'kernel', 'index.js')
    const s = readFileSync(p, 'utf8')
    // the getter stops resolving contributed faces (the pre-Step-0 shape)
    writeFileSync(p, s.replace("    get lean() { return resolveFace(lean, 'vmu.lean') },", '    get lean() { return lean },'), 'utf8')
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

console.log('\n=== VMU SERVICE CONTRIBUTION: ' + passed + ' passed, ' + failed.length + ' failed ===')
for (const f of failed) console.error('  - ' + f)
process.exit(failed.length === 0 ? 0 : 1)
