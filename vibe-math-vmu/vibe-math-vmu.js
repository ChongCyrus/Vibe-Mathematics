// vibe-math-vmu — the vmu (vibe-math-unify) agent preset entry point.
//
// Runtime mechanism = this framework + settings + middleware (+ agent self-organisation). The framework
// provides CAPABILITIES; every policy lives in settings, middleware or a pack (docs/01 R1).
//
// WHAT THIS FILE DOES NOW (and what it deliberately does not):
//   · it ASSEMBLES the kernel (kernel/index.js) from plain config data and attaches it to the host's tool
//     surface (host.js), each registration wrapped in `ctx.effect(..., label)` with a cleanup, because the
//     host's own guidance requires exactly that (recon: host-plugin.md:54);
//   · it keeps the first promise IN THE HOST: with no configuration the preset exposes exactly ONE tool,
//     `vibe_vmu_status`, and with `vmu.core.enabled=false` it exposes NONE. Nothing is subscribed, nothing
//     is injected, no state is written;
//   · it does NOT declare a `Config` (Schemastery) export: that would require a static host import, and this
//     repository must stay loadable by plain Node (the same reason settings/schema.js takes an injected
//     carrier). Settings therefore arrive as plain data under `config.vmu`, and any host-side settings
//     service remains an optional, opportunistic seam;
//   · it does NOT reach for the math host seam: `createKernel` is given no host, so the math surface stays
//     unavailable and refuses BY NAME. Wiring a real subprocess seam is a separate, explicit step.

import { createKernel } from './kernel/index.js'
import { createHostAdapter } from './host.js'
import { attachHostHooks } from './host-hooks.js'
import { createPackLoader } from './kernel/pack.js'
import { createHostSpawn, hasHostSpawn } from './host-spawn.js'
import { assertDeclared } from './settings/schema.js'
import { pathToFileURL } from 'node:url'
import { basename } from 'node:path'

export const name = 'vibe-math-vmu'

/** Public-interface version of this preset's exposed surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/**
 * Required host services. Only the tool surface is required (without it there is nothing to attach to);
 * everything else - prompts, settings, presets - is consumed opportunistically so the preset still loads
 * in a minimal deployment instead of failing to activate.
 */
export const inject = ['tools']

/** Accept either `config.vmu = {...}` (namespaced) or a flat settings object, and copy it (never alias). */
function readSettings(config) {
  if (!config || typeof config !== 'object') return {}
  const raw = config.vmu && typeof config.vmu === 'object' ? config.vmu : config
  const out = {}
  for (const [k, v] of Object.entries(raw)) if (k.startsWith('vmu.')) out[k] = v
  return out
}

/**
 * Plugin entry point. Returns a handle for tests and diagnostics; the host only needs the effects.
 *
 * @param {object} ctx     Cordis context for this plugin row.
 * @param {object} config  The row's `config` (plain data; see the header for why there is no `Config`).
 */
export function apply(ctx, config = {}) {
  const settings = readSettings(config)
  const root = typeof config.root === 'string' && config.root.length > 0 ? config.root : null
  const clock = typeof config.clock === 'function' ? config.clock : undefined

  // M3 SCRIPT BRIDGE: the subprocess seam is built from the HOST's service when it exists; without it the
  // bridge stays unbound and every run is refused by name (VMU_ENGINE_UNAVAILABLE), never faked.
  let spawnSeam = null
  let spawnError = null
  if (hasHostSpawn(ctx)) {
    try { spawnSeam = createHostSpawn({ ctx, defaultCwd: typeof config.workspace === 'string' ? config.workspace : null }) }
    catch (e) { spawnError = { code: (e && e.code) || 'VMU_ENGINE_UNAVAILABLE', message: String((e && e.message) || e) } }
  }
  const kernel = createKernel(Object.assign({ settings, root, spawn: spawnSeam }, clock ? { clock } : {}))
  // DECLARATION IS THE CONFIGURATION. With nothing declared the preset must not even offer a settings
  // tool (the documented way to switch the first thing on is the profile's cordis.patch.yml), and the
  // middleware the configuration declares has to be ACTIVATED - that is what start() is for.
  const declared = Object.keys(settings).length > 0
  // INSTANCE IDENTITY: a profile can hold more than one vmu row (the preset's, plus a standalone one), and
  // the host keeps one registration per tool name - so without an identity the receipts look contradictory
  // (the live run showed `packs: []` from one instance and a pack rule from the other). `config.instance`
  // makes the answer unambiguous; the default is stable so tests stay deterministic.
  const instance = typeof config.instance === 'string' && config.instance.length > 0 ? config.instance : 'vmu-default'
  const adapter = createHostAdapter(Object.assign({ ctx, kernel, settings, instance, scripts: Array.isArray(config.scripts) ? config.scripts : [] },
    declared ? { assertDeclared } : {}))
  const started = kernel.start().catch((e) => ({ ok: false, error: String(e && e.message) }))
  // With a durable root, OPEN the store: the durable layer must exist on disk, not merely be constructible.
  // (The library writes its own files; the store is the versioned state fold - docs/07 §1.)
  const opened = (root && kernel.store && typeof kernel.store.open === 'function')
    ? Promise.resolve(kernel.store.open()).catch((e) => ({ ok: false, error: String(e && e.message) }))
    : Promise.resolve({ ok: true, skipped: 'no durable root was configured' })

  const effect = (fn, label) => {
    if (ctx && typeof ctx.effect === 'function') return ctx.effect(fn, label)
    return fn() // a context without effect() still works: the cleanup is returned to the caller
  }

  const cleanups = []
  // INERT MEANS INVISIBLE: when the kernel is switched off, not even an effect is registered.
  const switchedOff = settings['vmu.core.enabled'] === false
  let installError = null
  // The BRIDGE: the declared middleware must fire on REAL host events, not only on the internal bus.
  const hooks = attachHostHooks({ ctx, kernel, settings })
  let hooksResult = null
  let hooksError = null
  if (!switchedOff && hooks.plan().count > 0) {
    effect(() => {
      try {
        hooksResult = hooks.attach()
      } catch (e) {
        hooksError = { code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e), hint: (e && e.hint) || null }
        try { process.stderr.write('vmu: hook bridging failed: ' + hooksError.code + ' ' + hooksError.message + '\n') } catch { /* stderr may be gone */ }
      }
      return () => { try { hooks.detach() } catch { /* the host is going away anyway */ } }
    }, 'vmu:hooks')
  }
  if (!switchedOff) {
    effect(() => {
      const installing = adapter.install()
      const cleanup = () => { try { adapter.uninstall() } catch { /* the host is going away anyway */ } }
      cleanups.push(cleanup)
      // A registration that fails must SAY SO (R11: a silent failure is worse than a named one). The first
      // scripted live run found this the hard way: the tools never appeared and nothing was logged.
      installing.catch((e) => {
        installError = { code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e), hint: (e && e.hint) || null }
        try { process.stderr.write('vmu: tool registration failed: ' + installError.code + ' ' + installError.message + '\n') } catch { /* stderr may be gone */ }
      })
      return cleanup
    }, 'vmu:tools')
  }

  // A prompt section is injected ONLY when the configuration declares one (zero mechanism otherwise).
  if (typeof config.prompt === 'string' && config.prompt.length > 0 && ctx && ctx.systemPrompt &&
      typeof ctx.systemPrompt.section === 'function') {
    effect(() => {
      const order = typeof ctx.systemPrompt.getSectionOrder === 'function'
        ? ctx.systemPrompt.getSectionOrder('TEAM_POLICY') : undefined
      const dispose = ctx.systemPrompt.section({ name: 'vmu', order, text: config.prompt })
      return typeof dispose === 'function' ? dispose : () => {}
    }, 'vmu:prompt')
  }

  // A PACK is where an institution lives (slots, tracks, rules, aliases). `config.packs` accepts either a
  // shipped pack id (resolved from packs/<id>.js) or an inline manifest; conflicts are refused (O4) and the
  // failure is visible instead of swallowed.
  const packLoader = createPackLoader({ kernel, registry: kernel.registry })
  const packsWanted = Array.isArray(config.packs) ? config.packs : []
  const appliedPacks = []
  const packErrors = []
  if (!switchedOff && packsWanted.length > 0) {
    effect(() => {
      const run = (async () => {
        for (const wanted of packsWanted) {
          try {
            const manifest = typeof wanted === 'string'
              ? (await import('./packs/' + wanted + '.js')).PACK
              : wanted
            const res = await packLoader.apply(manifest)
            appliedPacks.push({ id: res.id, applied: res.applied })
          } catch (e) {
            const id = typeof wanted === 'string' ? wanted : (wanted && wanted.id)
            packErrors.push({ id, code: (e && e.code) || 'VMU_PACK_MISSING', message: String((e && e.message) || e) })
            try { process.stderr.write('vmu: pack ' + id + ' was not applied: ' + ((e && e.code) || '') + ' ' + String((e && e.message) || e) + '\n') } catch { /* stderr may be gone */ }
          }
        }
        // AFTER the packs settle: a pack can make tools available that did not exist at install time (bus
        // entries, a roster, a durable root). install() is serialised and idempotent.
        try { await adapter.install() } catch (e) {
          packErrors.push({ id: '(reinstall)', code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e) })
        }
        // ...and a pack can add BUS ENTRIES, whose hooks must now be bridged too (a rule that exists but is
        // not bridged is a rule that silently never fires).
        try { hooks.refresh() } catch (e) {
          packErrors.push({ id: '(hooks)', code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e) })
        }
      })()
      void run
      return () => {
        for (const a of appliedPacks.slice()) { try { packLoader.unload(a.id) } catch { /* going away */ } }
      }
    }, 'vmu:packs')
  }

  // M2 CODE MODULES: `config.modules` accepts an inline module object or `{ id, file }` (a path, imported
  // dynamically). They go through the same loader as everything else - mandatory meta/capabilities/registered
  // hooks - and land on the same bus, so ordering, capabilities, failure policies and traces are shared.
  const modulesWanted = Array.isArray(config.modules) ? config.modules : []
  const loadedModules = []
  const moduleErrors = []
  const moduleEntryIds = []
  if (!switchedOff && modulesWanted.length > 0) {
    effect(() => {
      const run = (async () => {
        const specs = []
        for (const m of modulesWanted) {
          // The loader insists on `kind: 'module'` (its own guard): an entry without it is refused with a
          // named error, which is how this wiring mistake was found.
          if (typeof m === 'string') specs.push({ kind: 'module', id: basename(m, '.js'), file: m })
          else if (m && m.module) specs.push(Object.assign({ kind: 'module' }, m))
          else if (m && m.file) specs.push({ kind: 'module', id: m.id || basename(m.file, '.js'), file: m.file, capabilities: m.capabilities })
          else specs.push(Object.assign({ kind: 'module' }, m))
        }
        try {
          const busEntries = await kernel.loader.toBusEntries(specs, {
            importModule: (file) => import(pathToFileURL(file).href),
          })
          for (const e of busEntries) { kernel.bus.add(e); moduleEntryIds.push(e.id) }
          for (const s of specs) loadedModules.push(s.id)
          // A module can make tools available too (a bus with entries), so reinstall - it is serialised -
          // and re-bridge, because the module's hooks must fire on the host.
          try { await adapter.install() } catch (e) {
            moduleErrors.push({ id: '(reinstall)', code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e) })
          }
          try { hooks.refresh() } catch (e) {
            moduleErrors.push({ id: '(hooks)', code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e) })
          }
        } catch (e) {
          moduleErrors.push({ id: '(load)', code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e) })
          try { process.stderr.write('vmu: a code module was not loaded: ' + ((e && e.code) || '') + ' ' + String((e && e.message) || e) + '\n') } catch { /* stderr may be gone */ }
        }
      })()
      void run
      return () => {
        for (const id of moduleEntryIds.splice(0)) { try { kernel.bus.disable(id, 'vmu modules unloaded') } catch { /* going away */ } }
      }
    }, 'vmu:modules')
  }

  return {
    kernel,
    adapter,
    instance,
    loadedModules: () => loadedModules.slice(),
    moduleErrors: () => moduleErrors.slice(),
    packLoader: () => packLoader,
    appliedPacks: () => appliedPacks.slice(),
    packErrors: () => packErrors.slice(),
    hooks,
    hooksResult: () => hooksResult,
    hooksError: () => hooksError,
    /** Resolves once the tools are registered and the declared middleware is activated. */
    ready: () => Promise.all([started, opened, Promise.resolve(adapter.status())]).then(([, , st]) => st),
    started: () => started,
    storeOpened: () => opened,
    status: () => Object.assign(adapter.status(), { installError }),
    installError: () => installError,
    cleanups,
  }
}
