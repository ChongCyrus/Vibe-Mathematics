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
import { assertDeclared } from './settings/schema.js'

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

  const kernel = createKernel(Object.assign({ settings, root }, clock ? { clock } : {}))
  // DECLARATION IS THE CONFIGURATION. With nothing declared the preset must not even offer a settings
  // tool (the documented way to switch the first thing on is the profile's cordis.patch.yml), and the
  // middleware the configuration declares has to be ACTIVATED - that is what start() is for.
  const declared = Object.keys(settings).length > 0
  const adapter = createHostAdapter(Object.assign({ ctx, kernel, settings },
    declared ? { assertDeclared } : {}))
  const started = kernel.start().catch((e) => ({ ok: false, error: String(e && e.message) }))

  const effect = (fn, label) => {
    if (ctx && typeof ctx.effect === 'function') return ctx.effect(fn, label)
    return fn() // a context without effect() still works: the cleanup is returned to the caller
  }

  const cleanups = []
  // INERT MEANS INVISIBLE: when the kernel is switched off, not even an effect is registered.
  const switchedOff = settings['vmu.core.enabled'] === false
  let installError = null
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

  return {
    kernel,
    adapter,
    /** Resolves once the tools are registered and the declared middleware is activated. */
    ready: () => Promise.all([started, Promise.resolve(adapter.status())]).then(([, st]) => st),
    started: () => started,
    status: () => Object.assign(adapter.status(), { installError }),
    installError: () => installError,
    cleanups,
  }
}
