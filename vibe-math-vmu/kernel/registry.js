// vmu registry — the PUBLIC face: versioned services and the pack alias layer (docs/03 §7, docs/05 §6.4).
//
// D13-O3 decided that versioning is per SERVICE (`apiVersion`) plus a single `packContractVersion` for
// packs, and D6/D14 decided that old names are bridged by an ALIAS LAYER rather than by renaming things:
// the inherited math tool keeps the name `math_computation` because renaming it would break the shared
// module's byte identity, and packs written against v5r tool names are served by aliases.
//
// Three properties make this a real contract rather than a naming convention:
//   · NOTHING IS OVERRIDDEN SILENTLY (O4): registering a service twice, or aliasing onto a name that
//     already resolves, is refused by name. A pack cannot quietly replace a service it does not own;
//   · VERSIONS ARE CHECKED, NOT TRUSTED: a pack declares `requires: [{ service, minVersion }]`, and a
//     service that is missing or too old is reported with the numbers that were compared;
//   · AN ALIAS NEVER HIDES ITSELF: resolvable aliases carry `deprecated` and a reason, so a caller can be
//     told it is on a legacy name instead of discovering it in a stack trace.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** The contract packs are written against (D13-O3: one number for packs, per-service numbers inside). */
export const PACK_CONTRACT_VERSION = 1

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.hint = hint
  err.code = code
  return err
}

const NAME = /^[A-Za-z][A-Za-z0-9._:-]*$/

/**
 * Create a registry. `services` is a map of name -> implementation; each implementation must declare
 * `apiVersion` (or the registry entry must, via `{ impl, apiVersion }`).
 */
export function createRegistry({ services = {}, tools = {}, clock = () => new Date().toISOString() } = {}) {
  const entries = new Map()
  const aliases = new Map()

  /** Fuzzy suggestion: a typo must be recoverable from the message (docs/02 §5 "errors must self-serve"). */
  const editDistance = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i].concat(new Array(b.length).fill(0)))
    for (let j = 0; j <= b.length; j++) dp[0][j] = j
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      }
    }
    return dp[a.length][b.length]
  }

  const suggest = (name) => {
    const seg = String(name).toLowerCase().split('.').pop()
    const prefix = seg.slice(0, Math.max(3, seg.length - 1))
    return [...entries.keys()].filter((k) => {
      const ks = k.toLowerCase().split('.').pop()
      return ks.startsWith(prefix) || editDistance(ks, seg) <= 2
    })
  }

  const entryOf = (name) => {
    const e = entries.get(name)
    if (!e) {
      const near = suggest(name)
      throw refuse('VMU_NO_SUCH_OBJECT', 'no such service or tool: ' + String(name),
        near.length ? 'did you mean: ' + near.join(', ') : 'known: ' + [...entries.keys()].join(', '))
    }
    return e
  }

  const registry = {
    packContractVersion: PACK_CONTRACT_VERSION,

    /** Publish a service or tool. Re-publication is a conflict, never a silent override (O4). */
    register(name, impl, { apiVersion: version, kind = 'service', description = null } = {}) {
      if (typeof name !== 'string' || !NAME.test(name)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'a registered name must be a dotted identifier: ' + String(name))
      }
      if (entries.has(name)) {
        throw refuse('VMU_MIDDLEWARE_FAILED', 'the name ' + name + ' is already registered',
          'overriding a published service silently is forbidden (O4); publish under a new name and alias it')
      }
      const v = version !== undefined ? version : (impl && impl.apiVersion)
      if (!Number.isInteger(v) || v < 1) {
        throw refuse('VMU_INVALID_ARGUMENT', 'service ' + name + ' must declare an integer apiVersion',
          'per-service versioning is the public contract (D13-O3)')
      }
      const record = { name, kind, apiVersion: v, description: description || (impl && impl.description) || null, at: clock(), impl: impl || {} }
      entries.set(name, record)
      return { ok: true, name, kind, apiVersion: v, packContractVersion: PACK_CONTRACT_VERSION }
    },

    /** Bridge a legacy name to a canonical one. Shadowing an existing name is refused. */
    alias(from, to, { deprecated = true, reason = 'legacy name', since = null } = {}) {
      if (!NAME.test(String(from))) throw refuse('VMU_INVALID_ARGUMENT', 'alias name must be a dotted identifier: ' + String(from))
      if (entries.has(from)) {
        throw refuse('VMU_MIDDLEWARE_FAILED', 'the alias ' + from + ' would SHADOW a published name',
          'aliases map legacy names; a published name is never hidden (O4)')
      }
      if (!entries.has(to)) {
        throw refuse('VMU_NO_SUCH_OBJECT', 'the alias target is not published: ' + String(to),
          'publish the canonical service first')
      }
      if (aliases.has(from)) throw refuse('VMU_MIDDLEWARE_FAILED', 'the alias ' + from + ' already exists')
      aliases.set(from, { from, to, deprecated: deprecated === true, reason: String(reason), since, at: clock() })
      return { ok: true, from, to, deprecated: deprecated === true }
    },

    /** Remove an alias. Used by pack unload, so a pack leaves no published name behind (O4). */
    removeAlias(from) {
      const a = aliases.get(from)
      if (!a) throw refuse('VMU_NO_SUCH_OBJECT', 'no alias named ' + String(from), 'known aliases: ' + ([...aliases.keys()].join(', ') || '(none)'))
      aliases.delete(from)
      return { ok: true, from, to: a.to }
    },

    /** Resolve any name (canonical or alias) to its canonical entry, reporting the alias that was used. */
    resolve(name) {
      const direct = entries.get(name)
      if (direct) return { name: direct.name, kind: direct.kind, apiVersion: direct.apiVersion, viaAlias: null }
      const a = aliases.get(name)
      if (!a) {
        entryOf(name) // throws with suggestions
      }
      const target = entries.get(a.to)
      return { name: target.name, kind: target.kind, apiVersion: target.apiVersion,
        viaAlias: { from: a.from, deprecated: a.deprecated, reason: a.reason } }
    },

    /** Get an implementation, optionally requiring a minimum version. */
    get(name, { minVersion = 0 } = {}) {
      const resolved = registry.resolve(name)
      if (Number(minVersion) > resolved.apiVersion) {
        throw refuse('VMU_NO_SUCH_OBJECT',
          name + ' is at apiVersion ' + resolved.apiVersion + ' but ' + minVersion + ' is required',
          'the pack needs a newer service; see the contract() for what this build publishes')
      }
      return entries.get(resolved.name).impl
    },

    /** The published contract: what a pack may rely on, with aliases marked as such. */
    contract() {
      return {
        packContractVersion: PACK_CONTRACT_VERSION,
        services: [...entries.values()].map((e) => ({ name: e.name, kind: e.kind, apiVersion: e.apiVersion, description: e.description })),
        aliases: [...aliases.values()].map((a) => ({ from: a.from, to: a.to, deprecated: a.deprecated, reason: a.reason })),
      }
    },

    /**
     * Check a pack's declared requirements against this build: `requires: [{ service, minVersion, kind? }]`.
     * Missing and too-old requirements are reported WITH the numbers, and nothing is silently satisfied.
     */
    checkPack(manifest = {}) {
      const requires = Array.isArray(manifest.requires) ? manifest.requires : []
      const missing = []
      const tooOld = []
      const satisfied = []
      for (const req of requires) {
        if (!req || typeof req.service !== 'string') { missing.push({ service: String(req && req.service), reason: 'malformed requirement' }); continue }
        let resolved
        try { resolved = registry.resolve(req.service) } catch (e) {
          missing.push({ service: req.service, reason: 'not published' })
          continue
        }
        const min = Number.isInteger(req.minVersion) ? req.minVersion : 0
        if (min > resolved.apiVersion) tooOld.push({ service: resolved.name, required: min, published: resolved.apiVersion })
        else satisfied.push({ service: resolved.name, viaAlias: resolved.viaAlias, apiVersion: resolved.apiVersion })
      }
      const packContractRequired = Number.isInteger(manifest.packContractVersion) ? manifest.packContractVersion : 0
      const contractTooOld = packContractRequired > PACK_CONTRACT_VERSION
      return {
        ok: missing.length === 0 && tooOld.length === 0 && !contractTooOld,
        missing, tooOld, satisfied,
        packContractVersion: { required: packContractRequired, published: PACK_CONTRACT_VERSION, tooOld: contractTooOld },
      }
    },

    /** Observability (R11): the published surface, the alias table and the deprecation notices. */
    status() {
      return {
        packContractVersion: PACK_CONTRACT_VERSION,
        services: [...entries.values()].map((e) => ({ name: e.name, kind: e.kind, apiVersion: e.apiVersion })),
        aliases: [...aliases.values()].map((a) => Object.assign({}, a, { impl: undefined })),
        deprecatedInUse: [...aliases.values()].filter((a) => a.deprecated).map((a) => a.from),
      }
    },
  }

  for (const [name, impl] of Object.entries(services)) registry.register(name, impl, { kind: 'service' })
  for (const [name, t] of Object.entries(tools)) registry.register(name, t.impl === undefined ? t : t.impl, { kind: 'tool', apiVersion: t.apiVersion })

  return registry
}
