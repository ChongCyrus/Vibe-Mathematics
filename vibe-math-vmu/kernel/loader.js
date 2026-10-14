// vmu loader — loading M2 code modules (docs/05 §6.1, §9).
//
// A code module is the escape hatch for logic a declarative rule cannot express, so the loader's job is
// to make that escape hatch SAFE and BOUNDED:
//   · a module must declare `meta.apiVersion` and `capabilities`; a missing or unknown declaration is
//     refused by name, never defaulted (the same discipline as settings keys, R4);
//   · every hook a module subscribes to must be a REGISTERED hook (a vmu hook or a documented host
//     substrate hook). A typo therefore fails at load time instead of silently never firing;
//   · the module receives a FROZEN api facade and nothing else: no framework internals, no free
//     variables, no host handle. What is not handed over cannot be relied upon, which is what keeps the
//     kernel's public surface meaningful (R7);
//   · a module that throws while loading is refused by name and the framework survives - failure
//     isolation starts at load time, not only at hook time.
//
// Honest limitation, documented: M1 dry-run is PROVABLY side-effect free because rules are data. An M2
// dry-run can only promise that the loader passes `dryRun: true` and reports what the module returned;
// a module that ignores the flag is a module bug, and the loader says so in its status.

import { VU_HOOKS, DSH_HOOKS as BUS_DSH_HOOKS, HOOK_PREFIXES, isDeclaredTopic } from './bus.js'

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/**
 * Host-substrate hooks a module may subscribe to (docs/05 §4.1), DERIVED from the single hook registry
 * in kernel/bus.js (decision D-04). `workflow/*` is accepted by prefix (`HOOK_PREFIXES`).
 * Re-exported here because this is the list a MODULE author reads (docs/19 names `DSH_HOOKS`).
 */
export const DSH_HOOKS = BUS_DSH_HOOKS

/** The api keys a module may rely on, and nothing else. */
export const API_KEYS = Object.freeze(['log', 'setting', 'kernel', 'dryRun', 'traceId', 'hook', 'services'])

const CAPABILITIES = Object.freeze(['read-state', 'read-args', 'deny', 'cancel', 'rewrite-args', 'rewrite-result',
  'append-prompt', 'record', 'notify', 'set-setting', 'trigger-workflow', 'annotate'])

export const FRAMEWORK_API_VERSION = 1

export function refuse(code, message, hint) {
  const err = new Error(message)
  if (err.hint === undefined) err.hint = hint
  err.code = code
  return err
}

/**
 * Is this a hook the framework knows how to fire? (docs/05 §4)
 *
 * ROUND 4 (Lead adjudication ②): a topic DECLARED with `bus.declareTopic(name)` is also a hook a module may
 * subscribe to. Before this, a declared topic could be emitted but a module declaring it was refused by this
 * very function ("unregistered hook") - declared but unusable, the class this repository keeps catching. The
 * set lives in kernel/bus.js and is process-wide, so every bus instance agrees on it.
 */
export function isRegisteredHook(hook) {
  if (typeof hook !== 'string' || hook.length === 0) return false
  if (VU_HOOKS.includes(hook)) return true
  if (DSH_HOOKS.includes(hook)) return true
  if (HOOK_PREFIXES.some((p) => hook.startsWith(p))) return true
  if (isDeclaredTopic(hook)) return true
  return false
}

/** Static validation of one M2 declaration (docs/05 §9 step 1 + §6.1). */
export function validateModule(entry, module) {
  const problems = []
  if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) problems.push('entry.id is required')
  if (!module || typeof module !== 'object') { problems.push('the module must export an object or a factory'); return problems }
  const meta = module.meta
  if (!meta || typeof meta !== 'object') problems.push('the module must export meta = { id, apiVersion }')
  else {
    if (typeof meta.id !== 'string' || meta.id.length === 0) problems.push('meta.id is required')
    if (entry && meta.id && entry.id && !String(meta.id).startsWith(String(entry.id).split('.').slice(0, 1)[0])) {
      problems.push('meta.id (' + meta.id + ') does not match the entry id (' + entry.id + ')')
    }
    if (!Number.isInteger(meta.apiVersion)) problems.push('meta.apiVersion is required (an integer)')
    else if (meta.apiVersion > FRAMEWORK_API_VERSION) {
      problems.push('meta.apiVersion ' + meta.apiVersion + ' is newer than this framework (' + FRAMEWORK_API_VERSION + ')')
    }
  }
  const caps = module.capabilities
  if (!Array.isArray(caps) || caps.length === 0) problems.push('the module must declare capabilities (a non-empty list)')
  else for (const c of caps) if (!CAPABILITIES.includes(c)) problems.push('unknown capability: ' + c)
  const hooks = module.hooks
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) problems.push('the module must export hooks = { <hook>: handler }')
  else {
    const keys = Object.keys(hooks)
    if (keys.length === 0) problems.push('the module declares no hooks')
    for (const h of keys) {
      if (!isRegisteredHook(h)) problems.push('unregistered hook: ' + h + ' (see docs/05 §4; a typo would silently never fire)')
      else if (typeof hooks[h] !== 'function') problems.push('hook ' + h + ' must be a function')
    }
  }
  if (entry && Array.isArray(entry.capabilities) && Array.isArray(caps)) {
    const undeclared = caps.filter((c) => !entry.capabilities.includes(c))
    if (undeclared.length > 0) problems.push('the module uses capabilities the entry did not declare: ' + undeclared.join(', '))
  }
  return problems
}

/**
 * Create a loader. `services` is the read-only kernel facade handed to modules; `log` is the logger;
 * `dryRun` is the session-wide dry-run flag from settings.
 */
export function createLoader({ services = {}, log = () => {}, dryRun = false, clock = () => new Date().toISOString() } = {}) {
  const loaded = new Map()
  const stats = { loads: 0, refusals: 0, dryRuns: 0 }

  /**
   * The frozen facade: exactly API_KEYS, nothing else, and not rewritable by the module.
   *
   * ROUND 10 / task-74 (Lead ruling (a)): `services` is the CAPABILITY-GATED door to the assembled services.
   * Measured gap it closes (vmu-pack): an M2 module could see `api:[log,setting,kernel,dryRun,traceId,hook]` and
   * `kernel:{read}` only, so a middleware that must IMPLEMENT AN INSTITUTION POLICY ("a stalled institute
   * convenes") could not reach any service - and the alternatives (putting the policy in the control face, or a
   * `convene` action in M1) would move policy into the kernel, which R1 forbids. The gate is the module's own
   * declaration: `trigger-workflow` (a capability that already existed and had no consumer) is what unlocks it.
   * ★ BOTH directions are NAMED: a module without the capability gets `VMU_NOT_PERMITTED`; a capability-holding
   * module asking for a service this assembly does not publish gets `VMU_NO_SUCH_OBJECT`. Neither is a silent null.
   */
  const makeApi = (entry, hook, traceId, caps = []) => Object.freeze({
    hook,
    traceId,
    dryRun,
    log: (msg) => log('[' + entry.id + '] ' + String(msg)),
    setting: (key) => services.setting ? services.setting(key) : undefined,
    kernel: services.kernel || Object.freeze({}),
    services: Object.freeze({
      get: (name) => {
        const wanted = String(name === undefined || name === null ? '' : name).trim()
        if (!wanted) throw refuse('VMU_INVALID_ARGUMENT', 'services.get needs a service name', 'e.g. services.get("vmu.meetings")')
        if (!Array.isArray(caps) || caps.indexOf('trigger-workflow') === -1) {
          throw Object.assign(refuse('VMU_NOT_PERMITTED', 'this module may not reach services: it did not declare the trigger-workflow capability',
            'declare capabilities: ["trigger-workflow", …] in the module meta (docs/05 §6.1)'),
          { enforced: ['capabilities.trigger-workflow'], enforcedScope: 'evaluated-so-far', service: wanted })
        }
        const svc = typeof services.get === 'function' ? services.get(wanted) : null
        if (!svc) {
          throw Object.assign(refuse('VMU_NO_SUCH_OBJECT', 'no service is published under that name in this assembly: ' + wanted,
            'published: ' + (typeof services.names === 'function' ? services.names().join(', ') : '(none)')),
          { enforced: ['capabilities.trigger-workflow'], enforcedScope: 'evaluated-so-far', service: wanted })
        }
        return svc
      },
      names: () => (typeof services.names === 'function' ? services.names().slice() : []),
    }),
  })

  const loader = {
    validate: validateModule,
    isRegisteredHook,

    /**
     * Load one module. `importModule` is injected so the loader stays testable and host-agnostic;
     * with `entry.file` and no importer the load is refused by name (docs/11 §4.1).
     */
    async load(entry, { importModule = null } = {}) {
      if (!entry || entry.kind !== 'module') {
        throw refuse('VMU_MIDDLEWARE_FAILED', 'the loader only loads kind: module entries', 'this entry is kind=' + String(entry && entry.kind))
      }
      let module
      try {
        if (entry.module !== undefined) module = entry.module
        else if (typeof importModule === 'function' && typeof entry.file === 'string') module = await importModule(entry.file)
        else {
          throw refuse('VMU_ENGINE_UNAVAILABLE', 'no module source and no importer for entry ' + entry.id,
            'pass entry.module or { importModule, file } - the loader does not reach into the host')
        }
      } catch (e) {
        stats.refusals++
        if (e && e.code) throw e
        throw refuse('VMU_MIDDLEWARE_FAILED', 'loading ' + entry.id + ' threw: ' + String(e && e.message),
          'a module that throws while loading must not take the framework down')
      }
      const problems = validateModule(entry, module)
      if (problems.length > 0) {
        stats.refusals++
        throw refuse('VMU_MIDDLEWARE_FAILED', 'invalid M2 module ' + entry.id + ': ' + problems.join('; '),
          'see docs/05 §6.1: meta.apiVersion, capabilities and REGISTERED hooks are mandatory')
      }
      let produced
      try {
        produced = typeof module.default === 'function'
          ? module.default({ hooks: module.hooks, log, kernel: services.kernel || Object.freeze({}), setting: services.setting })
          : module
      } catch (e) {
        stats.refusals++
        throw refuse('VMU_MIDDLEWARE_FAILED', 'the factory of ' + entry.id + ' threw: ' + String(e && e.message),
          'failure isolation starts at load time')
      }
      const hooks = (produced && produced.hooks) || module.hooks
      const handlers = {}
      for (const [hook, fn] of Object.entries(hooks)) {
        handlers[hook] = async (raw) => {
          const traceId = raw && raw.traceId ? raw.traceId : null
          if (dryRun) stats.dryRuns++
          // The bus calls a handler with an ENVELOPE ({ hook, payload, ctx, ... }), while a module is
          // written against a FLAT event. Flatten for the module and keep the original under `raw`, so
          // both styles work and nobody has to know the bus's shape.
          const envelope = raw && typeof raw === 'object' ? raw : {}
          const flat = Object.assign({}, envelope.payload || envelope)
          const ctx = envelope.ctx || {}
          if (flat.member === undefined) flat.member = envelope.member !== undefined ? envelope.member : ctx.member
          if (flat.role === undefined) flat.role = envelope.role !== undefined ? envelope.role : ctx.role
          if (flat.phase === undefined) flat.phase = envelope.phase !== undefined ? envelope.phase : ctx.phase
          flat.hook = envelope.hook !== undefined ? envelope.hook : hook
          flat.raw = envelope
          flat.api = makeApi(entry, hook, traceId, Array.isArray(module.capabilities) ? module.capabilities : [])
          return fn(flat)
        }
      }
      stats.loads++
      const record = { id: entry.id, apiVersion: module.meta.apiVersion, capabilities: module.capabilities.slice(),
        hooks: Object.keys(handlers), file: entry.file || null, at: clock(), handlers }
      loaded.set(entry.id, record)
      return record
    },

    /** Turn loaded modules into bus entries: M2 and M1 share one bus, ordering and policies included. */
    async toBusEntries(entries = [], opts = {}) {
      const out = []
      for (const entry of entries) {
        const record = await loader.load(entry, opts)
        for (const hook of record.hooks) {
          out.push({ id: record.id + '::' + hook, kind: 'module', on: [hook], order: entry.order, failure: entry.failure,
            capabilities: entry.capabilities || record.capabilities, handler: record.handlers[hook] })
        }
      }
      return out
    },

    get(id) {
      const r = loaded.get(id)
      if (!r) throw refuse('VMU_NO_SUCH_OBJECT', 'no module loaded with id ' + String(id))
      return Object.assign({}, r)
    },

    /** Observability (R11): what is loaded, and the honest M2 dry-run caveat. */
    status() {
      return {
        loaded: [...loaded.values()].map((r) => Object.assign({}, r)),
        frameworkApiVersion: FRAMEWORK_API_VERSION,
        dryRun,
        stats: Object.assign({}, stats),
        note: 'M2 dry-run passes dryRun:true and reports what a module returned; unlike M1 it cannot be PROVEN side-effect free, because code may ignore the flag.',
      }
    },

    /** The api keys a module may rely on (documented surface, R7). */
    apiKeys() { return API_KEYS.slice() },
  }

  return loader
}
