// vmu prompt pipeline — prompts as first-class, manageable data (docs/06).
//
// Why a pipeline instead of string concatenation: docs/06 §1. Every section has a name, an owner, a
// scope and a source; the assembled text is a PURE function of its inputs, so it can be snapshotted
// byte-for-byte and any drift is a red gate rather than a surprise.
//
// The invariants this module enforces (docs/06 §2, §3, §4, §5, §6):
//   1. the `state` section is IMMUTABLE: it carries read-only facts, so an override attempt is refused by
//      name (`VMU_NOT_PERMITTED`). Packs and middleware may only append;
//   2. assembly is deterministic: same inputs => same bytes (ordering, joins and trailing newline fixed);
//   3. bindings are four-dimensional with a FIXED priority `role < phase < member < task` (docs/06 §4.1);
//   4. template variables come from a whitelist; an unregistered variable is refused, and template syntax
//      inside a VALUE is escaped so a value can never inject a placeholder (docs/06 §5);
//   5. truncation is never silent: the notice goes INTO the text and the numbers go into the status
//      surface (docs/06 §6);
//   6. no host import: the pipeline is fully usable (and testable) without a host, and the host binding
//      is an injected ADAPTER seam. A missing or partial adapter is refused by name, never faked
//      (`VMU_ENGINE_UNAVAILABLE`, docs/11 §4.1).

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** Kernel-reserved order ranges (docs/06 §7). A pack may not claim a kernel range. */
export const ORDER_RANGES = Object.freeze({
  facts: [0, 199],        // state, time, budget: framework-owned
  charter: [200, 399],    // charter / role
  contract: [400, 599],   // mechanism contracts that must be replayed every turn
  pack: [600, 899],
  override: [900, 9999],  // overrides and middleware appends
})

/** The registered variable whitelist (docs/03 §4, docs/06 §5). `setting:` and `count:` take an argument. */
export const VARIABLE_WHITELIST = Object.freeze(['member', 'role', 'phase', 'time', 'pack', 'task', 'setting:', 'count:'])

/** Fixed binding priority, low to high (docs/06 §4.1). */
export const BINDING_PRIORITY = Object.freeze(['role', 'phase', 'member', 'task'])

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  return err
}

const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const escapeTemplate = (value) => String(value).replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }')
const trimTrailing = (text) => text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '') + '\n'

/**
 * Create a pipeline. `sections` are declarations (kernel and pack), `bindings` come from settings,
 * `overrideText`/`readFile` provide override content, `bus` is optional (a middleware bus from
 * kernel/bus.js) and `whoMayOverride` comes from the resolved settings.
 */
export function createPromptPipeline({
  sections = [],
  bindings = [],
  overrides = {},
  whoMayOverride = ['office'],
  bus = null,
  readFile = null,
  counts = {},
  clock = () => new Date().toISOString(),
} = {}) {
  const registry = new Map()
  const truncation = []
  const appends = []

  const inRange = (order, name) => {
    for (const [range, [lo, hi]] of Object.entries(ORDER_RANGES)) {
      if (order >= lo && order <= hi) return range
    }
    throw refuse('VMU_INVALID_ARGUMENT', 'section ' + name + ': order ' + order + ' is outside every reserved range')
  }

  const register = (section) => {
    if (!section || typeof section !== 'object') throw refuse('VMU_INVALID_ARGUMENT', 'a section must be an object')
    const { name } = section
    if (typeof name !== 'string' || !KEBAB.test(name)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'section name must be kebab-case: ' + String(name))
    }
    const order = Number.isInteger(section.order) ? section.order : 600
    const range = inRange(order, name)
    const existing = registry.get(name)
    if (existing) {
      if (name === 'state' || existing.mutable === false) {
        throw refuse('VMU_NOT_PERMITTED', 'section ' + name + ' is immutable and cannot be re-registered',
          'immutable sections carry read-only facts (docs/06 §2 invariant 1)')
      }
      if (existing.range === 'pack' && range === 'pack') {
        throw refuse('VMU_MIDDLEWARE_FAILED', 'two pack sections claim the same name: ' + name,
          'pack conflicts are declared explicitly, never resolved silently (docs/10 §4)')
      }
    }
    const entry = {
      name,
      order,
      range,
      scope: section.scope || null,
      // `state` is immutable by construction: callers cannot opt in to overriding read-only facts.
      mutable: name === 'state' ? false : section.mutable !== false,
      source: section.source || 'kernel',
      text: typeof section.text === 'string' ? section.text : null,
      template: section.template || null,
      vars: Array.isArray(section.vars) ? section.vars.slice() : [],
      truncate: section.truncate || null,
    }
    registry.set(name, entry)
    return entry
  }

  for (const s of sections) register(s)

  // A binding that names an unknown section is a configuration defect, not a no-op: silently ignoring it
  // would let a typo switch a rule off without a trace (the same reasoning as R4 for settings keys).
  bindings.forEach((b, i) => {
    if (!b || typeof b.section !== 'string') throw refuse('VMU_INVALID_ARGUMENT', 'binding ' + i + ' must name a section')
    if (!registry.has(b.section)) {
      throw refuse('VMU_NO_SUCH_OBJECT', 'binding ' + i + ' targets an unknown section: ' + b.section,
        'register the section first; the registry is docs/06 §3')
    }
  })

  const scopeMatches = (scope, ctx) => {
    if (!scope) return true
    const hit = (dim, value) => {
      const want = scope[dim]
      if (want === undefined || want === '*') return true
      const list = Array.isArray(want) ? want : [want]
      return list.includes(value)
    }
    return hit('member', ctx.member) && hit('role', ctx.role) && hit('phase', ctx.phase) && hit('task', ctx.task)
  }

  /** Which binding dimensions match this context, lowest priority first. */
  const matchingBindings = (ctx) => {
    const scored = []
    bindings.forEach((b, i) => {
      if (!b || typeof b !== 'object' || typeof b.section !== 'string') {
        throw refuse('VMU_INVALID_ARGUMENT', 'binding ' + i + ' must name a section')
      }
      let dim = null
      if (b.task !== undefined && matches(b.task, ctx.task)) dim = 'task'
      else if (b.member !== undefined && matches(b.member, ctx.member)) dim = 'member'
      else if (b.phase !== undefined && matches(b.phase, ctx.phase)) dim = 'phase'
      else if (b.role !== undefined && matches(b.role, ctx.role)) dim = 'role'
      if (dim) scored.push({ binding: b, dim, priority: BINDING_PRIORITY.indexOf(dim), index: i })
    })
    return scored.sort((a, b) => (a.priority - b.priority) || (a.index - b.index))
  }

  function matches(want, value) {
    const list = Array.isArray(want) ? want : [want]
    return list.includes(value)
  }

  const contentOf = (entry, ctx, binding) => {
    if (binding) {
      if (typeof binding.text === 'string') return binding.text
      if (typeof binding.file === 'string') return readFile ? readFile(binding.file) : null
      return null
    }
    if (typeof overrides[entry.name] === 'string') return overrides[entry.name]
    if (entry.text !== null) return entry.text
    if (entry.template && readFile) return readFile(entry.template)
    return null
  }

  const renderVariables = (text, ctx) => {
    return text.replace(/\{\{\s*([a-zA-Z:-]+[a-zA-Z0-9:._-]*)\s*\}\}/g, (whole, raw) => {
      const key = raw.trim()
      const allowed = VARIABLE_WHITELIST.includes(key) ||
        (key.startsWith('setting:') && VARIABLE_WHITELIST.includes('setting:')) ||
        (key.startsWith('count:') && VARIABLE_WHITELIST.includes('count:'))
      if (!allowed) {
        throw refuse('VMU_INVALID_ARGUMENT', 'unregistered template variable: ' + whole,
          'the whitelist is docs/03 §4 / docs/06 §5: ' + VARIABLE_WHITELIST.join(', '))
      }
      let value
      if (key.startsWith('setting:')) value = ctx.settings ? ctx.settings[key.slice(8)] : undefined
      else if (key.startsWith('count:')) value = counts[key.slice(6)]
      else value = ctx[key]
      return value === undefined || value === null ? '' : escapeTemplate(value)
    })
  }

  const truncateText = (text, policy, name) => {
    if (!policy) return text
    const keep = Number.isInteger(policy.keepChars) ? policy.keepChars : 0
    const mode = policy.mode || 'keepChars'
    if (keep <= 0 || text.length <= keep) return text
    const dropped = text.length - keep
    let kept
    if (mode === 'keepHeadTail') {
      const head = Math.floor(keep / 2)
      kept = text.slice(0, head) + '\n…\n' + text.slice(text.length - (keep - head))
    } else if (mode === 'dropMiddle') {
      const keepEach = Math.floor(keep / 2)
      kept = text.slice(0, keepEach) + '\n…\n' + text.slice(text.length - keepEach)
    } else {
      kept = text.slice(text.length - keep)
    }
    truncation.push({ section: name, kept: kept.length, dropped, mode })
    // Never silent: the notice is part of the text AND counted in status().
    return '（已省略更早 ' + dropped + ' 字符 · kept ' + kept.length + '）\n' + kept
  }

  const pipeline = {
    register,

    /** The immutable facts block. Framework-owned, never overridable, always present. */
    setState(text) {
      if (typeof text !== 'string') throw refuse('VMU_INVALID_ARGUMENT', 'state must be a string')
      const existing = registry.get('state')
      if (existing && existing.text !== null) {
        throw refuse('VMU_NOT_PERMITTED', 'the state block is already set and is immutable')
      }
      registry.set('state', {
        name: 'state', order: 0, range: 'facts', scope: null, mutable: false,
        source: 'framework', text, template: null, vars: [], truncate: null,
      })
      return { ok: true }
    },

    /**
     * Assemble for one scope. Deterministic: the same inputs produce the same bytes (docs/06 §2 inv. 2).
     * Returns the text plus full provenance, so a snapshot can name every contributor.
     */
    async assemble(ctx = {}) {
      const settings = ctx.settings || {}
      if (bus && settings['vmu.middleware.dryRun'] === undefined) {
        const hook = await bus.emit('prompt/assemble', { ctx }, { member: ctx.member, role: ctx.role, phase: ctx.phase })
        if (hook && hook.ok === false) return { ok: false, refused: hook.refused || { code: hook.code, message: hook.message }, traceId: hook.traceId }
        for (const d of hook ? hook.decisions : []) {
          const ap = d.decision && d.decision.appendPrompt
          const list = Array.isArray(ap) ? ap : ap ? [ap] : []
          for (const item of list) {
            const name = (item && item.section) || 'middleware-append'
            const text = (item && (item.text || (item.file && readFile && readFile(item.file)))) || null
            if (text !== null) appends.push({ section: name, text, source: 'middleware:' + d.id })
          }
        }
      }

      const picked = [...registry.values()]
        .filter((e) => scopeMatches(e.scope, ctx))
        .sort((a, b) => (a.order - b.order) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

      const parts = []
      const sources = []
      for (const entry of picked) {
        // Immutable sections ignore every override, binding and append: only their own text counts.
        if (entry.name === 'state' || entry.mutable === false) {
          if (entry.text === null) continue
          parts.push('# ' + entry.name + '\n' + entry.text)
          sources.push({ section: entry.name, source: 'framework', overridden: false })
          continue
        }
        // The section's OWN content is the starting point: a declaration may carry inline `text`, a
        // `template` reference, or be overridden by reference. Bindings and middleware appends then
        // layer on top; the facts block never reaches here (handled above).
        const overrideText = overrides[entry.name]
        let text = contentOf(entry, ctx, null)
        let source = typeof overrideText === 'string' ? 'override' : entry.source
        for (const m of matchingBindings(ctx)) {
          if (m.binding.section !== entry.name) continue
          const extra = contentOf(entry, ctx, m.binding)
          if (extra === null) continue
          text = (text === null ? '' : text + '\n') + extra
          source = 'binding:' + m.dim
          sources.push({ section: entry.name, source: 'binding:' + m.dim, by: m.binding.owner || null })
        }
        for (const a of appends) {
          if (a.section !== entry.name) continue
          text = (text === null ? '' : text + '\n') + a.text
          source = a.source
        }
        if (text === null) continue
        parts.push('# ' + entry.name + '\n' + renderVariables(truncateText(text, entry.truncate, entry.name), ctx))
        sources.push({ section: entry.name, source, overridden: typeof overrideText === 'string' })
      }

      // Appends that named a section which does not exist still contribute (they are their own section).
      for (const a of appends) {
        if (picked.some((e) => e.name === a.section)) continue
        parts.push('# ' + a.section + '\n' + renderVariables(truncateText(a.text, null, a.section), ctx))
        sources.push({ section: a.section, source: a.source })
      }

      return { ok: true, text: parts.length === 0 ? '' : trimTrailing(parts.join('\n\n')), sources, truncation: truncation.slice(), at: clock() }
    },

    /** Register an override by reference (rollback = swapping the reference back; docs/06 §4.3). */
    override(section, text, by = 'office') {
      const entry = registry.get(section)
      if (!entry) throw refuse('VMU_NO_SUCH_OBJECT', 'unknown section: ' + section)
      if (entry.mutable === false) {
        throw refuse('VMU_NOT_PERMITTED', 'section ' + section + ' is immutable: read-only facts cannot be overridden',
          'append through middleware instead (docs/06 §2 invariant 1)')
      }
      if (!whoMayOverride.includes(by)) {
        throw refuse('VMU_NOT_PERMITTED', by + ' may not override section ' + section,
          'allowed: ' + whoMayOverride.join(', ') + ' (docs/06 §4.3)')
      }
      const previous = overrides[section] === undefined ? null : overrides[section]
      overrides[section] = text
      return { ok: true, section, previous, rollbackable: true }
    },

    rollback(section, previous = null) {
      if (!(section in overrides)) throw refuse('VMU_NO_SUCH_OBJECT', 'no override in effect for ' + section)
      if (previous === null) delete overrides[section]
      else overrides[section] = previous
      return { ok: true, section }
    },

    /** Byte-exact snapshots for the corpus gate (docs/06 §8 item 1). */
    async snapshot(scopes = []) {
      const out = []
      for (const s of scopes) out.push({ scope: s, text: (await pipeline.assemble(s)).text })
      return out
    },

    /**
     * Host binding seam. The pipeline never calls a host itself: it is handed an adapter, and a missing or
     * partial adapter is refused by name (docs/11 §4.1 - the absence path must be reproducible).
     */
    bindToHost(adapter) {
      const need = ['registerSection', 'onAssemble']
      const missing = !adapter ? need : need.filter((m) => typeof adapter[m] !== 'function')
      if (missing.length > 0) {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'host prompt adapter is missing or incomplete',
          'pass { registerSection, onAssemble, registerContext?, registerVariable? }; missing: ' + missing.join(','))
      }
      for (const entry of registry.values()) adapter.registerSection({ name: entry.name, order: entry.order, mutable: entry.mutable })
      adapter.onAssemble(async (ctx) => (await pipeline.assemble(ctx)).text)
      return { ok: true, sections: registry.size }
    },

    /** Observability (R11): what is registered, from where, and what was truncated. */
    status() {
      return {
        sections: [...registry.values()]
          .sort((a, b) => (a.order - b.order) || (a.name < b.name ? -1 : 1))
          .map((e) => ({ name: e.name, order: e.order, range: e.range, scope: e.scope, mutable: e.mutable,
            source: e.source, overridden: typeof overrides[e.name] === 'string' })),
        bindings: bindings.length,
        truncation: truncation.map((t) => ({ section: t.section, kept: t.kept, dropped: t.dropped, mode: t.mode })),
        middlewareAppends: appends.map((a) => ({ section: a.section, source: a.source })),
      }
    },
  }

  return pipeline
}
