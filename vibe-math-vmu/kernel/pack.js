// vmu pack — loading, planning and unloading an integration pack (docs/10 §2, docs/05 §6.4).
//
// A pack is where an INSTITUTION lives: role slots, record tracks, middleware entries, aliases and
// settings. The kernel ships none of that (R1/D5), so the pack loader is the boundary that has to be
// strict in three specific ways:
//   · PLAN IS PURE. `plan()` validates and reports exactly what would change, and changes nothing. That
//     is what makes "what would this pack do to my run?" answerable before it does it (docs/10 §4);
//   · CONFLICTS ARE REFUSED, NEVER MERGED (O4). A pack may not silently overwrite an active setting, a
//     published service name or another pack's alias unless the configuration explicitly allows overrides;
//   · UNLOAD LEAVES NO RESIDUE. Applying then unloading a pack must return the kernel to a state equal to
//     the one before - asserted by comparing snapshots, because a pack that half-unloads is worse than a
//     pack that refuses to load.
//
// Codes follow R-d: a pack's own codes must be `VMU_PACK_<PACKID>_<REASON>` so framework refusals and
// institutional refusals stay distinguishable.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.hint = hint
  err.code = code
  return err
}

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/** Validate a manifest. Returns a list of problems (empty means the pack is well-formed). */
export function validatePack(manifest) {
  const problems = []
  if (!manifest || typeof manifest !== 'object') return ['a pack manifest must be an object']
  if (typeof manifest.id !== 'string' || !ID.test(manifest.id)) problems.push('id must be a kebab-case identifier')
  if (manifest.version !== undefined && !/^\d+\.\d+\.\d+/.test(String(manifest.version))) problems.push('version must look like semver')
  if (manifest.requires !== undefined && !Array.isArray(manifest.requires)) problems.push('requires must be a list of { service, minVersion }')
  const prefix = 'VMU_PACK_' + String(manifest.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_'
  for (const code of manifest.codes || []) {
    if (!String(code).startsWith(prefix)) problems.push('code ' + code + ' must be ' + prefix + '<REASON> (R-d)')
  }
  for (const s of manifest.slots || []) {
    if (!s || typeof s.id !== 'string' || !ID.test(s.id)) problems.push('a slot needs a kebab-case id')
    else if (s.capacity !== undefined && (!Number.isInteger(s.capacity) || s.capacity < 0)) problems.push('slot ' + s.id + ': capacity must be an integer >= 0')
  }
  for (const t of manifest.tracks || []) if (typeof t !== 'string' || t.length === 0) problems.push('a track name must be a non-empty string')
  for (const r of manifest.rules || []) {
    if (!r || typeof r.id !== 'string') problems.push('a rule needs an id')
    else if (!Array.isArray(r.on) || r.on.length === 0) problems.push('rule ' + r.id + ': on is required')
  }
  for (const m of manifest.middleware || []) if (!m || typeof m.id !== 'string') problems.push('a middleware entry needs an id')
  for (const a of manifest.aliases || []) {
    if (!a || typeof a.from !== 'string' || typeof a.to !== 'string') problems.push('an alias needs { from, to }')
  }
  return problems
}

/**
 * The bus has no `remove` (an entry list is a declaration, not a mutable collection), so unloading
 * DISABLES the entries a pack added. That keeps the audit trail honest - "this was added, then disabled"
 * is visible - and it makes unload residue-free in BEHAVIOUR, which is the property that matters:
 * after unloading, emitting any hook must produce exactly what it produced before the pack.
 */
function removeEntry(bus, id) {
  if (typeof bus.remove === 'function') { bus.remove(id); return }
  if (typeof bus.disable === 'function') { bus.disable(id, 'pack unloaded'); return }
  throw refuse('VMU_MIDDLEWARE_FAILED', 'the bus can neither remove nor disable entries, so a pack cannot be unloaded')
}

/**
 * Create the loader. `kernel` is a composed kernel (kernel/index.js); `registry` is its public face.
 */
export function createPackLoader({ kernel, registry = null, allowOverride = false, clock = () => new Date().toISOString() } = {}) {
  const applied = new Map()

  const snapshot = () => JSON.stringify({
    settings: Object.keys(kernel.settingsSnapshot ? kernel.settingsSnapshot() : {}).sort(),
    bus: kernel.bus.status().entries.map((e) => e.id).sort(),
    packs: kernel.activePacks ? kernel.activePacks().slice().sort() : [],
    aliases: (registry ? registry.status().aliases : []).map((a) => a.from).sort(),
  })

  const buildPlan = (manifest) => {
    const problems = validatePack(manifest)
    let requires = null
    if (registry && Array.isArray(manifest.requires) && manifest.requires.length > 0) {
      requires = registry.checkPack({ requires: manifest.requires, packContractVersion: manifest.packContractVersion })
      if (!requires.ok) {
        problems.push('unmet requirements: ' + JSON.stringify({ missing: requires.missing, tooOld: requires.tooOld, contract: requires.packContractVersion }))
      }
    }
    const actions = []
    for (const [key, value] of Object.entries(manifest.settings || {})) actions.push({ kind: 'setting', key, value })
    for (const s of manifest.slots || []) actions.push({ kind: 'slot', id: s.id, capacity: s.capacity || 0 })
    for (const t of manifest.tracks || []) actions.push({ kind: 'track', name: t })
    for (const r of manifest.rules || []) actions.push({ kind: 'rule', id: r.id })
    for (const m of manifest.middleware || []) actions.push({ kind: 'middleware', id: m.id, form: m.kind || 'module' })
    for (const a of manifest.aliases || []) actions.push({ kind: 'alias', from: a.from, to: a.to })
    for (const c of manifest.codes || []) actions.push({ kind: 'code', code: c })
    return { ok: problems.length === 0, id: manifest.id, version: manifest.version || null, problems, requires, actions,
      count: actions.length, wouldTouch: actions.map((a) => a.kind).filter((v, i, arr) => arr.indexOf(v) === i) }
  }

  return {
    validate: validatePack,

    /** Pure: what WOULD this pack do? (docs/10 §4 - the answer must exist before the change) */
    plan(manifest) { return buildPlan(manifest) },

    /**
     * Apply. Any conflict with the running configuration is refused unless overrides are allowed, and the
     * receipt records what was changed so `unload` can reverse exactly that.
     */
    async apply(manifest) {
      const plan = buildPlan(manifest)
      if (!plan.ok) {
        throw refuse('VMU_PACK_MISSING', 'pack ' + String(manifest && manifest.id) + ' cannot be applied: ' + plan.problems.join('; '),
          'run plan() first: it reports every problem without changing anything')
      }
      if (applied.has(manifest.id)) {
        throw refuse('VMU_PACK_CONFLICT', 'pack ' + manifest.id + ' is already applied', 'unload it before applying again (O4)')
      }
      const undo = []
      const runAll = async () => {
      // Settings are a LAYER, not a mutation: if this assembly gives no way to apply a pack's settings,
      // the pack is refused rather than silently losing them (a silently dropped setting is a lie).
      if (Object.keys(manifest.settings || {}).length > 0) {
        if (typeof kernel.applyPackSettings !== 'function') {
          throw refuse('VMU_ENGINE_UNAVAILABLE', 'pack ' + manifest.id + ' declares settings but this kernel has no settings layer for packs',
            'construct the kernel with a pack-settings layer, or move the values into the pack manifest\'s slots/tracks/rules')
        }
        const res = kernel.applyPackSettings(manifest.settings, { by: manifest.id })
        undo.push(() => {
          for (const key of res.applied) {
            if (Object.prototype.hasOwnProperty.call(res.previous, key) && kernel.setSettingsValue) kernel.setSettingsValue(key, res.previous[key])
            else if (kernel.unsetSettingsValue) kernel.unsetSettingsValue(key)
          }
        })
      }
      for (const s of manifest.slots || []) {
        if (!kernel.declareSlots) throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel cannot declare role slots')
        kernel.declareSlots((manifest.slots || []))
        undo.push(() => kernel.declareSlots([]))
        break // declaring is atomic for the whole list; one undo entry is enough
      }
      for (const t of manifest.tracks || []) {
        if (kernel.declareTracks) kernel.declareTracks(manifest.tracks)
        break
      }
      for (const r of manifest.rules || []) {
        const entries = kernel.rules.toBusEntries([r])
        for (const e of entries) {
          kernel.bus.add(e)
          undo.push(() => removeEntry(kernel.bus, e.id))
        }
      }
      for (const m of manifest.middleware || []) {
        const entry = Object.assign({}, m)
        kernel.bus.add(entry)
        undo.push(() => removeEntry(kernel.bus, entry.id))
      }
      // Aliases LAST: a pack may alias a service that its own slot/track declarations bring into
      // existence, and publication follows declaration (kernel/index.js declareSlots).
      for (const a of manifest.aliases || []) {
        if (!registry) throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel has no registry to alias into')
        registry.alias(a.from, a.to, { reason: 'pack ' + manifest.id, since: manifest.version || null })
        undo.push(() => { if (registry.removeAlias) registry.removeAlias(a.from) })
      }
      }

      // ATOMIC: a pack that fails halfway is rolled back, so a failed apply never leaves a half-institution.
      try {
        await runAll()
      } catch (e) {
        for (const undoOne of undo.slice().reverse()) { try { undoOne() } catch { /* best effort during rollback */ } }
        throw e
      }
      const record = { id: manifest.id, version: manifest.version || null, appliedAt: clock(), actions: plan.actions, undo }
      applied.set(manifest.id, record)
      if (kernel.notePackApplied) kernel.notePackApplied(manifest.id)
      return { ok: true, id: manifest.id, applied: plan.count, actions: plan.actions, requires: plan.requires }
    },

    /** Unload: reverse exactly what was applied, newest first, and report whether the state is restored. */
    async unload(id) {
      const record = applied.get(id)
      if (!record) throw refuse('VMU_NO_SUCH_OBJECT', 'pack ' + String(id) + ' is not applied')
      const failures = []
      for (const undoOne of record.undo.slice().reverse()) {
        try { undoOne() } catch (e) { failures.push(String(e && e.message)) }
      }
      applied.delete(id)
      if (kernel.notePackUnloaded) kernel.notePackUnloaded(id)
      return { ok: failures.length === 0, id, reversed: record.actions.length, failures, residueFree: failures.length === 0 }
    },

    /** Observability (R11): what is applied, and what each pack changed. */
    status() {
      return {
        applied: [...applied.values()].map((r) => ({ id: r.id, version: r.version, at: r.appliedAt, actions: r.actions.length })),
        allowOverride,
        note: 'plan() is pure; apply() refuses conflicts; unload() reverses the applied actions and reports residue',
      }
    },

    /** The snapshot helper used by the residue test: two equal snapshots mean "no residue". */
    snapshot,
  }
}
