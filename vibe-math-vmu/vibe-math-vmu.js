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
import { createHostMath } from './host-math.js'
import { assertDeclared } from './settings/schema.js'
import { pathToFileURL } from 'node:url'
import { basename, isAbsolute, join } from 'node:path'
import { readFileSync } from 'node:fs'

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

  // M3 SCRIPT BRIDGE: the subprocess seam is bound whenever the context CAN carry services, and it resolves
  // the host's service AT CALL TIME (a plugin's apply can run before the service mounts; binding "absent" at
  // that instant would refuse every script run forever). Without a service the run refuses by name.
  let spawnSeam = null
  let spawnError = null
  if (ctx && typeof ctx.get === 'function') {
    try { spawnSeam = createHostSpawn({ ctx, defaultCwd: typeof config.workspace === 'string' ? config.workspace : null }) }
    catch (e) { spawnError = { code: (e && e.code) || 'VMU_ENGINE_UNAVAILABLE', message: String((e && e.message) || e) } }
  }
  // ---- PROMPT MANAGEMENT (the user's explicit clause: 通过 settings/中间件 设置·安排·管理·编辑提示词) --------
  // Sections come from the plugin's config (`promptSections`, or the legacy single `prompt` string); bindings
  // come from `config.promptBindings` OR the declared setting `vmu.prompts.bindings`; overrides come from
  // `config.promptOverrides` OR from the declared `vmu.prompts.overridesDir` (relative to `root`). The
  // EFFECTIVE text (override > section file > inline) is what the HOST systemPrompt section receives, because
  // the pipeline alone would assemble text nobody sees.
  const readRel = (rel) => {
    try { const p = root && !isAbsolute(rel) ? join(root, rel) : rel; return readFileSync(p, 'utf8') } catch { return null }
  }
  const promptSections = (() => {
    const out = []
    if (typeof config.prompt === 'string' && config.prompt.length > 0) out.push({ name: 'vmu', text: config.prompt })
    const list = config.promptSections
    if (Array.isArray(list)) {
      for (const s of list) if (s && typeof s.name === 'string') out.push(s)
    } else if (list && typeof list === 'object') {
      for (const [name, v] of Object.entries(list)) {
        if (typeof v === 'string') out.push({ name, text: v })
        else if (v && typeof v === 'object') {
          out.push({ name, text: typeof v.text === 'string' ? v.text : undefined,
            file: typeof v.file === 'string' ? v.file : undefined, order: v.order })
        }
      }
    }
    return out
  })()
  const promptOverrides = Object.assign({},
    config.promptOverrides && typeof config.promptOverrides === 'object' ? config.promptOverrides : {})
  const overridesDir = typeof settings['vmu.prompts.overridesDir'] === 'string' ? settings['vmu.prompts.overridesDir'] : null
  if (overridesDir) {
    for (const s of promptSections) {
      const text = readRel(join(overridesDir, s.name + '.md'))
      if (typeof text === 'string') promptOverrides[s.name] = text
    }
  }
  const promptBindings = Array.isArray(config.promptBindings) ? config.promptBindings
    : (Array.isArray(settings['vmu.prompts.bindings']) ? settings['vmu.prompts.bindings'] : [])
  const whoMayOverride = Array.isArray(config.whoMayOverride) ? config.whoMayOverride
    : (Array.isArray(settings['vmu.prompts.whoMayOverride']) ? settings['vmu.prompts.whoMayOverride'] : ['office'])
  const effectivePrompts = promptSections.map((s) => {
    const overridden = typeof promptOverrides[s.name] === 'string'
    const fromFile = typeof s.file === 'string'
    return {
      name: s.name,
      order: Number.isInteger(s.order) ? s.order : 600,
      text: overridden ? promptOverrides[s.name] : (typeof s.text === 'string' ? s.text : (fromFile ? (readRel(s.file) || '') : '')),
      source: overridden ? 'override' : (fromFile ? 'file' : 'inline'),
    }
  }).filter((s) => s.text.length > 0)

  // V9 MATH: the shared `math_computation` module reaches the host through an injected seam. Until now only a
  // TEST fake provided one, so the math domain and its settings were unreachable in a real session. The
  // adapter is built here, and `vmu.math.computation: 'off'` keeps it out entirely (zero mechanism).
  // Declaring math INTENT is what switches the domain on (`config.math`, or any declared `vmu.math.*` key).
  // No declaration ⇒ no math tool, exactly like scripts/packs/middleware: a default value is not a
  // declaration, and the zero-mechanism proof ("one read-only tool") must survive (docs/11 §7).
  const mathDeclared = config.math !== undefined || Object.keys(settings).some((k) => k.startsWith('vmu.math.'))
  let mathHost = null
  if (mathDeclared && settings['vmu.core.enabled'] !== false && ctx && ctx.tools && typeof ctx.tools.register === 'function' && settings['vmu.math.computation'] !== 'off') {
    try {
      mathHost = createHostMath({
        ctx, settings,
        projectRoot: typeof config.workspace === 'string' ? config.workspace : null,
        log: (m) => { try { process.stderr.write('vmu ' + String(m) + '\n') } catch { /* stderr may be gone */ } },
      })
    } catch (e) { mathHost = null }
  }

  const kernel = createKernel(Object.assign({ settings, root, spawn: spawnSeam, host: mathHost,
    sections: promptSections, bindings: promptBindings, overrides: promptOverrides, whoMayOverride, readFile: readRel },
  clock ? { clock } : {}))
  // DECLARATION IS THE CONFIGURATION. With nothing declared the preset must not even offer a settings
  // tool (the documented way to switch the first thing on is the profile's cordis.patch.yml), and the
  // middleware the configuration declares has to be ACTIVATED - that is what start() is for.
  const declared = Object.keys(settings).length > 0
  // INSTANCE IDENTITY: a profile can hold more than one vmu row (the preset's, plus a standalone one), and
  // the host keeps one registration per tool name - so without an identity the receipts look contradictory
  // (the live run showed `packs: []` from one instance and a pack rule from the other). `config.instance`
  // makes the answer unambiguous; the default is stable so tests stay deterministic.
  const instance = typeof config.instance === 'string' && config.instance.length > 0 ? config.instance : 'vmu-default'
  // The pack loader is created further down (it needs the kernel), so the adapter gets a LATE-BOUND getter:
  // the pack tool resolves it at call time, and no ordering trap is introduced (§11-§8 "TOCTOU" lessons).
  // It is offered ONLY when packs are actually declared - with no configuration the adapter must still
  // register exactly one tool (zero mechanism, R1); a management surface is not an exception to that.
  let packLoaderRef = null
  const packsDeclared = (Array.isArray(config.packs) && config.packs.length > 0) ||
    (Array.isArray(settings['vmu.packs.active']) && settings['vmu.packs.active'].length > 0)
  const adapter = createHostAdapter(Object.assign({ ctx, kernel, settings, instance, scripts: Array.isArray(config.scripts) ? config.scripts : [],
    packLoader: packsDeclared ? () => packLoaderRef : null,
    controlTool: config.control !== undefined },
  declared ? { assertDeclared } : {}))
  const started = kernel.start().catch((e) => ({ ok: false, error: String(e && e.message) }))
  // The math surface is LAZY (kernel/math.js), so the shared module registers its tool only when asked. The
  // entry asks once, and a failure is reported by name instead of leaving the tool silently absent (R11).
  const mathReady = mathHost ? Promise.resolve().then(() => kernel.math()).then(
    (surface) => ({ ok: true, tool: surface && surface.registered ? surface.registered.name : null }),
    (e) => {
      const detail = { code: (e && e.code) || 'VMU_ENGINE_UNAVAILABLE', message: String((e && e.message) || e) }
      try { process.stderr.write('vmu: the math surface was not published: ' + detail.code + ' ' + detail.message + '\n') } catch { /* stderr may be gone */ }
      return { ok: false, ...detail }
    }) : Promise.resolve({ ok: true, skipped: 'no math host seam (vmu.math.computation is off, or the host has no tools.register)' })
  // With a durable root, OPEN the store: the durable layer must exist on disk, not merely be constructible.
  // (The library writes its own files; the store is the versioned state fold - docs/07 §1.)
  const opened = (root && kernel.store && typeof kernel.store.open === 'function')
    ? Promise.resolve(kernel.store.open()).catch((e) => ({ ok: false, error: String(e && e.message) }))
    : Promise.resolve({ ok: true, skipped: 'no durable root was configured' })
  // AFTER the store is open: whatever is still in the in-flight ledger was written by an earlier process and
  // did not settle, so it is marked INTERRUPTED and reported - the "after an interruption the owner is told
  // what is unfinished" promise (docs/07 §3) becomes real instead of a reserved key nobody writes.
  const workRecovered = opened.then(async () => {
    if (!kernel.work) return { ok: true, skipped: 'no durable root: there is no in-flight ledger' }
    try { return await kernel.work.recover() } catch (e) {
      const detail = { ok: false, code: (e && e.code) || 'VMU_STORE_FAILED', message: String((e && e.message) || e) }
      try { process.stderr.write('vmu: in-flight recovery failed: ' + detail.code + ' ' + detail.message + '\n') } catch { /* stderr may be gone */ }
      return detail
    }
  })

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

  // The host section carries the EFFECTIVE text of every declared/overridden section (joined into the one
  // section name the host already accepts). No declaration ⇒ no effect at all (zero mechanism, R1).
  if (effectivePrompts.length > 0 && ctx && ctx.systemPrompt && typeof ctx.systemPrompt.section === 'function') {
    effect(() => {
      const order = typeof ctx.systemPrompt.getSectionOrder === 'function'
        ? ctx.systemPrompt.getSectionOrder('TEAM_POLICY') : undefined
      const text = effectivePrompts.map((s) => s.text).join('\n\n')
      const dispose = ctx.systemPrompt.section({ name: 'vmu', order, text })
      return typeof dispose === 'function' ? dispose : () => {}
    }, 'vmu:prompt')
  }

  // A PACK is where an institution lives (slots, tracks, rules, aliases). `config.packs` accepts either a
  // shipped pack id (resolved from packs/<id>.js) or an inline manifest; conflicts are refused (O4) and the
  // failure is visible instead of swallowed.
  const packLoader = createPackLoader({ kernel, registry: kernel.registry })
  packLoaderRef = packLoader
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
    mathHost: () => mathHost,
    mathReady: () => mathReady,
    workRecovered: () => workRecovered,
    // The entry's own prompt view: WHICH declaration produced each section's effective text (inline / file /
    // override). The kernel pipeline reports the declaring LAYER plus an `overridden` flag, which is a
    // different (and complementary) question - docs/06 §7 states both so the two are never conflated.
    prompts: () => effectivePrompts.map((s) => ({ name: s.name, order: s.order, source: s.source, chars: s.text.length })),
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
