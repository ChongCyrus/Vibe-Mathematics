// vmu kernel — the composition root (docs/02 §2, docs/03 §1).
//
// This file is what the goal means by "the vmu framework": the place where the parts are ASSEMBLED, and
// the place where the framework's first promise is enforced. That promise is the zero-mechanism default
// (R1, docs/04 §3): a kernel created with no settings, no packs and no middleware must be INERT.
// Concretely, and this is asserted by tests/vmu-kernel.test.mjs:
//   · it registers nothing with the host;
//   · it subscribes to no hook (the bus is empty);
//   · it injects no prompt section (the assembled prompt equals the base it was given);
//   · it opens no durable store unless a root was supplied.
// Everything else is activated by DECLARATION: settings choose what runs, packs choose what an
// institution means, and a capability that is switched on without its seam is refused BY NAME
// (VMU_ENGINE_UNAVAILABLE) instead of quietly behaving as if it were off.
//
// Ownership rule applied here (docs/04 §11, P3): the kernel carries MECHANISM only. Nothing in this
// file names a role, a stage, a paper or a policy - those arrive as settings values or pack content.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

export { PACK_CONTRACT_VERSION } from './registry.js'

import { createStore } from './store.js'
import { createBus } from './bus.js'
import { createPromptPipeline } from './prompt/index.js'
import { createLibrary } from './library.js'
import { createMembers } from './members.js'
import { createBallot } from './ballot.js'
import { createMeeting } from './meeting.js'
import { createTasks } from './tasks.js'
import { createMathSurface } from './math.js'
import { createRulesEngine } from './rules.js'
import { createLoader } from './loader.js'
import { createScriptBridge } from './script-bridge.js'
import { createRegistry } from './registry.js'
import { SETTING_DEFS } from '../settings/schema.js'

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.hint = hint
  err.code = code
  return err
}

/**
 * MECHANISM-level named predicates the kernel provides (docs/05 §5.2: `subject` predicates are the
 * kernel's, so a pack can name a mechanism without inventing one). Each reads the EFFECT and expresses no
 * opinion: "there is a settled formal proof for this object" and "the ballot is frozen" are machine facts,
 * not academic judgements. A pack may add its own through `subjects`, and an unknown name is still refused.
 */
export const DEFAULT_SUBJECTS = Object.freeze({
  has_locked_formal_proof: (ev) => !!(ev && (ev.locked === true || (ev.subject && ev.subject.settled === true))),
  in_frozen_ballot: (ev) => !!(ev && ev.frozen === true),
})

/**
 * Assemble the kernel.
 *
 * `host` is the optional capability seam (register/spawn). `settings` is the RESOLVED settings map (the
 * caller owns layering). `root` is the durable root; without it there is no store, and asking for one is
 * refused by name rather than silently creating a memory-only store that pretends to be durable.
 */
export function createKernel({
  host = null,
  settings = {},
  root = null,
  clock = () => new Date().toISOString(),
  sections = [],
  bindings = [],
  overrides = null,
  whoMayOverride = ['office'],
  readFile = null,
  migrators = undefined,
  counters = {},
  subjects = {},
  log = () => {},
  stageGate,
  slots = [],
  maxLiveMembers = undefined,
  tracks = undefined,
  stages = undefined,
  maxOpenTasks = undefined,
  middleware = [],
  spawn = null,
  deliver = null,
  bus: injectedBus = null,
} = {}) {
  const enabled = settings['vmu.core.enabled'] !== false
  const dryRun = settings['vmu.middleware.dryRun'] === true

  if (!enabled) {
    // Disabled means INERT, and it says so: no store, no bus, no hooks, no prompt work.
    return {
      enabled: false,
      async start() { return { ok: true, enabled: false, registered: [], note: 'vmu.core.enabled = false: the kernel does nothing' } },
      async stop() { return { ok: true, enabled: false } },
      status() { return { enabled: false, active: false, bus: { entries: [] }, note: 'disabled by vmu.core.enabled' } },
      refuses() { throw refuse('VMU_STATE', 'the kernel is disabled (vmu.core.enabled = false)',
        'enable it before asking for services; a disabled kernel never half-works') },
    }
  }

  const store = root
    ? createStore({ root, migrators, clock })
    : null

  const bus = injectedBus || createBus({
    entries: middleware,
    settings,
    clock,
    onAudit: (row) => log('audit ' + JSON.stringify(row)),
  })

  const prompt = createPromptPipeline({ sections, bindings, overrides, whoMayOverride, bus, readFile, clock })

  let library = root
    ? createLibrary({
      root,
      tracks: tracks || settings['vmu.records.tracks'],
      headListAt: settings['vmu.records.headListAt'],
      truncateMode: settings['vmu.records.truncateMode'],
      fingerprintPolicy: settings['vmu.records.fingerprintPolicy'],
      clock,
    })
    : null

  // `members` and `library` are re-declarable: a PACK owns the institution (slots, tracks), so applying a
  // pack must be able to declare them. Re-declaring a library rebuilds its index from disk, so no record
  // is lost by the swap (docs/10 §2).
  let members = createMembersList({ slots, maxLiveMembers, deliver, bus, clock, settings })
  const packNotes = []
  const tasks = createTasks({
    stages: stages || settings['vmu.tasks.stages'] || [],
    maxOpenTasks: maxOpenTasks !== undefined ? maxOpenTasks : (settings['vmu.tasks.maxOpenTasks'] || 0),
    stageGate,
    bus,
    clock,
  })

  const rules = createRulesEngine({ subjects: Object.assign({}, DEFAULT_SUBJECTS, subjects), counters, settings, clock })
  const loader = createLoader({
    services: { kernel: Object.freeze({ read: () => (store ? store.read() : null) }), setting: (k) => settings[k] },
    log,
    dryRun,
    clock,
  })
  const bridge = createScriptBridge({ spawn, defaultTimeoutMs: settings['vmu.math.timeoutMs'] || undefined, dryRun, clock })
  const registry = createRegistry({})
  // Publish what this assembly actually offers (M4, D13-O3): a pack can then DECLARE `requires` and be
  // checked, instead of discovering a missing service at the first hook. Only real capabilities appear.
  if (library) registry.register('vmu.library', { apiVersion: 1 }, { kind: 'service', description: 'records, content identity, head list' })
  if (members) registry.register('vmu.members', { apiVersion: 1 }, { kind: 'service', description: 'role slots and roster' })
  registry.register('vmu.tasks', { apiVersion: 1 }, { kind: 'service', description: 'task ledger and stage machine' })
  registry.register('vmu.prompt', { apiVersion: 1 }, { kind: 'service', description: 'prompt sections, bindings, overrides' })
  registry.register('vmu.middleware', { apiVersion: 1 }, { kind: 'service', description: 'the hook bus and its four forms' })
  if (root) registry.register('vmu.store', { apiVersion: 1 }, { kind: 'service', description: 'durable, versioned state' })
  if (host) registry.register('math_computation', { apiVersion: 1 }, { kind: 'tool', description: 'the inherited math tool, name unchanged (D14)' })

  const packs = []
  const registrations = []
  let started = false

  function createMembersList(opts) {
    const declaredSlots = opts.slots && opts.slots.length ? opts.slots : []
    const cap = opts.maxLiveMembers !== undefined ? opts.maxLiveMembers : (opts.settings['vmu.limits.maxLiveMembers'] || 0)
    if (declaredSlots.length === 0 && cap === 0) {
      // Nothing declared: no roster, no wake seam, no cost. Members become real only when a pack asks.
      return null
    }
    return createMembers({ slots: declaredSlots, maxLiveMembers: cap, deliver: opts.deliver, bus: opts.bus, clock: opts.clock })
  }

  /** Lazy math surface: asking for it without a host seam is refused by name (never faked). */
  const mathSurface = () => {
    if (!host) {
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'the math surface needs a host seam (register/spawn)',
        'construct the kernel with { host } (docs/11 §4.1) or leave vmu.math.computation off')
    }
    return createMathSurface({ host, settings })
  }

  const kernel = {
    enabled: true,
    bus,
    prompt,
    store,
    // Getters, not captured values: a pack can re-declare the institution (slots/tracks) AFTER the kernel
    // was constructed, so the public surface must always reflect the CURRENT surfaces (docs/10 §2).
    get library() { return library },
    get members() { return members },
    tasks,
    rules,
    loader,
    bridge,
    registry,

    /** Per-object primitives: the kernel supplies the factory, the pack supplies the policy. */
    ballot: (opts = {}) => createBallot(Object.assign({ quorumRule: settings['vmu.meetings.quorumRule'], bus, clock }, opts)),
    meeting: (opts = {}) => createMeeting(Object.assign({ bus, clock, deliver }, opts)),

    /**
     * Start: register the middleware the settings DECLARE, and nothing else. With an empty declaration
     * this is a no-op that returns the empty list, which is the zero-mechanism proof at the assembly
     * level (the host is never touched).
     */
    async start() {
      if (started) return { ok: true, already: true, registered: registrations.slice() }
      started = true
      const declared = Array.isArray(settings['vmu.middleware.entries']) ? settings['vmu.middleware.entries'] : []
      for (const entry of declared) {
        if (!entry || typeof entry !== 'object') {
          throw refuse('VMU_INVALID_ARGUMENT', 'a middleware entry must be an object', JSON.stringify(entry))
        }
        if (entry.kind === 'rules') {
          for (const e of kernel.rules.toBusEntries([entry])) bus.add(e)
        } else {
          bus.add(entry)
        }
        registrations.push(entry.id)
      }
      return { ok: true, enabled: true, registered: registrations.slice(), dryRun,
        note: registrations.length === 0 ? 'no middleware declared: the kernel registered nothing' : undefined }
    },

    async stop() {
      started = false
      registrations.length = 0
      return { ok: true, stopped: true }
    },

    /** The capability seams, refused by name when they are missing (docs/11 §4.1). */
    math: mathSurface,
    requireStore() {
      if (!store) {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel has no durable root',
          'construct it with { root } - a store is never silently faked in memory')
      }
      return store
    },
    requireLibrary() {
      if (!library) {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel has no library root',
          'construct it with { root } so records can be kept on disk')
      }
      return library
    },
    requireMembers() {
      if (!members) {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'no roles were declared, so there is no roster',
          'declare role slots (a pack does this) before asking for members (D5: the kernel ships no roles)')
      }
      return members
    },

    /**
     * Apply a pack. Conflicts are REFUSED, never silently merged (O4): two declarations of the same key
     * is a configuration defect, and the message names both sides.
     */
    usePack(pack = {}) {
      const id = pack.id
      if (typeof id !== 'string' || id.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'a pack needs an id')
      if (packs.includes(id)) throw refuse('VMU_PACK_CONFLICT', 'pack ' + id + ' is already active', 'unload it first (O4: no silent re-application)')
      const conflicts = []
      for (const key of Object.keys(pack.settings || {})) {
        if (Object.prototype.hasOwnProperty.call(settings, key)) conflicts.push({ key, already: 'settings' })
      }
      const codePrefix = 'VMU_PACK_' + String(id).toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_'
      for (const code of pack.codes || []) {
        if (!String(code).startsWith(codePrefix)) {
          conflicts.push({ key: code, already: 'pack codes must be ' + codePrefix + '<REASON> (R-d)' })
        }
      }
      if (conflicts.length > 0 && settings['vmu.packs.allowOverride'] !== true) {
        throw refuse('VMU_PACK_CONFLICT', 'pack ' + id + ' conflicts with the active configuration',
          JSON.stringify(conflicts))
      }
      packs.push(id)
      for (const alias of pack.aliases || []) registry.alias(alias.from, alias.to, { reason: 'pack ' + id })
      return { ok: true, id, active: packs.slice(), declaredCodes: (pack.codes || []).length }
    },

    activePacks() { return packs.slice() },

    /** A pack declares the institution's ROLE SLOTS; the kernel only holds them (D5). */
    declareSlots(list = []) {
      members = list.length > 0
        ? createMembers({
          slots: list,
          maxLiveMembers: maxLiveMembers !== undefined ? maxLiveMembers : (settings['vmu.limits.maxLiveMembers'] || 0),
          deliver,
          bus,
          clock,
        })
        : null
      // Publication follows DECLARATION: a service that did not exist a moment ago must appear in the
      // contract as soon as it does, otherwise a pack's alias to it is refused for the wrong reason.
      if (members) {
        try { registry.register('vmu.members', { apiVersion: 1 }, { kind: 'service', description: 'role slots and roster' }) }
        catch (e) { if (!e || !/already registered/.test(String(e.message))) throw e }
      }
      return { ok: true, slots: list.length, hasRoster: members !== null }
    },

    /** A pack declares the record TRACKS. Rebuilding the library re-reads the directory, so nothing is lost. */
    declareTracks(list = []) {
      if (!root) {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel has no library root, so tracks cannot be declared',
          'construct it with { root }')
      }
      if (list.length === 0) {
        throw refuse('VMU_INVALID_ARGUMENT', 'a pack must declare at least one track', 'tracks are a closed set (docs/07 §4.2)')
      }
      library = createLibrary({
        root,
        tracks: list.slice(),
        headListAt: settings['vmu.records.headListAt'],
        truncateMode: settings['vmu.records.truncateMode'],
        fingerprintPolicy: settings['vmu.records.fingerprintPolicy'],
        clock,
      })
      return { ok: true, tracks: library.status ? list.slice() : list.slice() }
    },

    /** The settings this assembly was constructed with (used by pack planning and residue checks). */
    settingsSnapshot() { return Object.assign({}, settings) },

    /**
     * Apply a pack's settings as a LAYER on the constructed values (docs/10 §2). Conflicts are refused
     * unless the configuration explicitly allows overrides (O4), and the caller gets back exactly what it
     * must restore: the pre-existing values for the keys it overwrote. Keys the pack introduced are simply
     * removed on rollback, so no phantom setting survives an unload.
     */
    applyPackSettings(incoming = {}, { by = null } = {}) {
      const applied = []
      const previous = {}
      for (const [key, value] of Object.entries(incoming)) {
        const existed = Object.prototype.hasOwnProperty.call(settings, key)
        if (existed && settings['vmu.packs.allowOverride'] !== true) {
          throw refuse('VMU_PACK_CONFLICT', 'pack setting ' + key + ' would overwrite an active value',
            'declare vmu.packs.allowOverride to make the override explicit (O4)')
        }
        if (existed) previous[key] = settings[key]
        settings[key] = value
        applied.push(key)
      }
      packNotes.push({ id: by, at: clock(), what: 'settings-applied', keys: applied.slice() })
      return { ok: true, applied, previous }
    },

    /** The two primitives a pack rollback needs, so an unload can restore or remove a setting exactly. */
    setSettingsValue(key, value) { settings[key] = value; return { ok: true, key } },
    unsetSettingsValue(key) { delete settings[key]; return { ok: true, key } },

    /** The declaration of a setting (hot class, who may change it) - used by the host tool for its receipt. */
    settingDef(key) { return SETTING_DEFS.find((d) => d.key === key) || null },

    /** Pack bookkeeping: what was applied and unloaded is part of the audit trail, not a side note. */
    notePackApplied(id) { packNotes.push({ id, at: clock(), what: 'applied' }); return { ok: true } },
    notePackUnloaded(id) { packNotes.push({ id, at: clock(), what: 'unloaded' }); return { ok: true } },
    packNotes() { return packNotes.map((n) => Object.assign({}, n)) },

    /** Observability (R11): the whole assembly in one place, with each part reporting its own state. */
    status() {
      return {
        enabled: true,
        active: started,
        settings: { keys: Object.keys(settings).length, engineEnabled: enabled, dryRun },
        registrations: registrations.slice(),
        // `packs` must reflect what is ACTUALLY applied - including packs applied through the pack loader,
        // which records itself in the notes; a status that only tracks usePack() would under-report.
        packs: [...new Set(packs.concat(packNotes.filter((n) => n.what === 'applied').map((n) => n.id)))],
        bus: bus.status ? bus.status() : { entries: [] },
        prompt: prompt.status ? prompt.status() : null,
        store: store ? store.stats() : null,
        // The library's own status() is ASYNC (it rebuilds the index from disk), so this synchronous view
        // only reports presence and asks the caller to await requireLibrary().status() for the detail.
        library: library ? { present: true, detail: 'await requireLibrary().status() for tracks/records/kinds/truncation' } : null,
        members: members ? members.status() : null,
        tasks: tasks.status(),
        rules: rules.status(),
        loader: loader.status(),
        bridge: bridge.status(),
        registry: registry.status(),
        seams: { host: !!host, store: !!store, library: !!library, members: !!members, spawn: !!spawn, deliver: !!deliver },
        note: 'a kernel with no declarations is inert by construction (zero mechanism, R1)',
      }
    },
  }

  return kernel
}
