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
//   3. bindings are four-dimensional with a FIXED priority `role < phase < member < task` (docs/06 §5);
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

/**
 * The registered variable whitelist (docs/03 §4, docs/06 §5). `setting:` and `count:` take an argument.
 * ROUND 356: `roster` joined the list because the charter's roster block must be filled EVERY turn - the original
 * states in that very block that the authoritative roster and the quorum m come from the per-turn state block and
 * that the composition may change, so freezing a snapshot into a section would publish a known-stale list. The value
 * comes from the turn loop, which knows who is seated.
 * ROUND 358: `round` and `quorum` joined for the same reason - measuring the captured texts found twenty-four literal
 * round numbers and sixty-six quorum numbers baked in, and both are facts the turn itself owns.
 * ROUND 362: `statusBlock` joined for the PER-ROUND BRIEF. The original's briefBlock builds a compact data block -
 * who you are, the round, the quorum, the roster, who is not yet on the floor, the formalisation knob, one-shot Lean
 * notices, the task board and new mail - and every one of those lines is turn data, not prose. The loop composes that
 * block from the kernel's own state and hands it over as ONE variable, so the pipeline still owns the assembly while
 * the loop owns the facts. The finer-grained alternative (a variable per datum) is recorded in docs/26 section 3.11.
 * ROUND 364: `roleLabel` joined for the per-turn HEADINGS. The source's kindLabel turns the member kind into the
 * human name used in every header (院士 / 常驻研究员 / 临时工). It is deliberately a SEPARATE variable from `role`:
 * `role` is the kind KEY that bindings select on, while `roleLabel` is what a reader sees, and mixing the two would
 * make a binding depend on display text.
 */
export const VARIABLE_WHITELIST = Object.freeze(['member', 'role', 'roleLabel', 'phase', 'time', 'pack', 'task', 'roster', 'round', 'quorum', 'statusBlock', 'setting:', 'count:'])

/** Fixed binding priority, low to high (docs/06 §5). */
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
  // ROUND 241: the locale family needs somewhere to read from; before this the pipeline had no settings handle at all.
  settings = {},
  clock = () => new Date().toISOString(),
} = {}) {
  const localeDefault = typeof settings['vmu.prompts.locale.default'] === 'string' ? settings['vmu.prompts.locale.default'] : null
  const localeChain = Array.isArray(settings['vmu.prompts.locale.fallbackChain'])
    ? settings['vmu.prompts.locale.fallbackChain'].filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
    : ['zh-Hans', 'zh', 'en']
  const localeOnMissing = settings['vmu.prompts.locale.onMissing'] === 'refuse' ? 'refuse' : 'warn'
  const overridesByLang = settings['vmu.prompts.overridesByLang'] && typeof settings['vmu.prompts.overridesByLang'] === 'object'
    ? settings['vmu.prompts.overridesByLang'] : {}
  // ROUND 244: the glossary family.
  const glossaryMode = ['enforce', 'warn', 'off'].includes(settings['vmu.prompts.glossary.mode']) ? settings['vmu.prompts.glossary.mode'] : 'enforce'
  const glossaryPath = typeof settings['vmu.prompts.glossary.ontology'] === 'string' && settings['vmu.prompts.glossary.ontology'].trim()
    ? settings['vmu.prompts.glossary.ontology'].trim() : 'vibe-math-vmu/glossary.json'
  const glossaryTraces = []
  let ontologyIds = null   // null means NOT LOADED, which §21.4 insists is different from empty
  // ROUND 242 (verified half): the declared sections and overrides.
  if (overrides === null || typeof overrides !== 'object') overrides = {}   // the kernel passes null EXPLICITLY, so the default never applied
  const declaredSections = Array.isArray(settings['vmu.prompts.sections']) ? settings['vmu.prompts.sections'] : []
  const declaredOverrides = settings['vmu.prompts.overrides'] && typeof settings['vmu.prompts.overrides'] === 'object'
    ? settings['vmu.prompts.overrides'] : {}
  /** The languages to try, in order, with the reason the list looks like it does. */
  const langOrder = (asked) => {
    const list = []
    if (typeof asked === 'string' && asked.trim()) list.push(asked.trim())
    if (localeDefault && !list.includes(localeDefault)) list.push(localeDefault)
    for (const l of localeChain) if (!list.includes(l)) list.push(l)
    return list
  }
  /** The override in force for one section under one language: the language-level one wins, then the plain one. */
  const overrideFor = (name, lang) => {
    const perLang = overridesByLang[name]
    if (perLang && typeof perLang === 'object') {
      for (const l of langOrder(lang)) if (typeof perLang[l] === 'string') return { text: perLang[l], source: 'byLang:' + l }
    }
    if (typeof overrides[name] === 'string') return { text: overrides[name], source: 'plain' }
    return { text: null, source: null }
  }
  const registry = new Map()
  // ROUND 243 (§21.1): the registry is keyed by NAME **and** LANG, so the same name may carry several languages. The
  // language-less entry is the language-agnostic fallback the volume describes.
  const keyOf = (name, lang) => String(name) + '\u0000' + String(lang === undefined || lang === null ? '' : lang)
  const langOf = (entry) => (entry && typeof entry.lang === 'string' && entry.lang.trim() ? entry.lang.trim() : null)
  const byName = (name) => [...registry.values()].filter((e) => e.name === name)
  const hasName = (name) => byName(name).length > 0
  /** Which entry renders for this name under this language: the resolved order first, the language-less one last. */
  const pickFor = (name, lang) => {
    const all = byName(name)
    if (!all.length) return null
    for (const l of langOrder(lang)) { const hit = all.find((e) => e.lang === l); if (hit) return hit }
    const agnostic = all.find((e) => e.lang === null)
    if (agnostic) return agnostic
    // ROUND 243: entries exist for this name but none is in the resolved order - THIS is where on-missing belongs now, because
    // picking the best entry means a mismatched section would otherwise never be looked at.
    const langs = all.map((e) => e.lang).filter(Boolean)
    if (localeOnMissing === 'refuse') {
      throw refuse('VMU_NO_SUCH_OBJECT', 'no text for this section in the resolved languages: ' + name + ' exists as ' + langs.join(', '),
        'asked=' + String(lang || '') + ', tried=' + langOrder(lang).join(' > ') + ' (vmu.prompts.locale.onMissing=refuse)')
    }
    localeMisses.push({ section: name, langs, tried: langOrder(lang) })
    return null
  }
  const truncation = []
  const localeMisses = []   // ROUND 241: what onMissing=warn recorded instead of refusing
  // The appends of the LAST assembly only. This used to be a single pipeline-scoped array that every
  // `assemble()` call pushed into and never reset, so a middleware append made once stayed in the prompt
  // FOREVER and the prompt grew monotonically (found by the dry-run assertion in tests/vmu-prompt.test.mjs).
  let lastAppends = []

  const inRange = (order, name) => {
    for (const [range, [lo, hi]] of Object.entries(ORDER_RANGES)) {
      if (order >= lo && order <= hi) return range
    }
    throw refuse('VMU_INVALID_ARGUMENT', 'section ' + name + ': order ' + order + ' is outside every reserved range')
  }

  /**
   * ROUND 383: register a BINDING into the live pipeline, symmetric with `register`. A pack is loaded after the
   * kernel (its apply may need the kernel), so without this a late-registered charter section would assemble with
   * whatever baseline text it carries - which is how a researcher once received the academician's charter. The raw
   * binding shape is the same one the factory and the tests use: `{ section, <one dimension>: value, text }`.
   */
  const bind = (b) => {
    if (!b || typeof b !== 'object') throw refuse('VMU_INVALID_ARGUMENT', 'a binding must be an object')
    if (typeof b.section !== 'string' || !KEBAB.test(b.section)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'a binding must name its section in kebab-case: ' + String(b && b.section))
    }
    const dims = ['role', 'phase', 'member', 'task'].filter((d) => typeof b[d] === 'string' && b[d] !== '')
    if (dims.length !== 1) {
      throw refuse('VMU_INVALID_ARGUMENT', 'a binding must name exactly one dimension', 'one of: role < phase < member < task')
    }
    bindings.push(b)
    return { section: b.section, dim: dims[0], total: bindings.length }
  }

  /**
   * ROUND 386 - THE OFF SWITCH (docs/26 section 3.26). The source gates several blocks and its off state is ZERO
   * INJECTION: the block produces nothing at all, not even its heading, so the prompt returns byte for byte to what it
   * was before the block existed. Measured, that was NOT what this pipeline did: overriding a section with an empty
   * string still emitted its `# name` heading, and re-registering it did the same. Disabling is therefore a state of
   * its own, and enabling restores the section unchanged rather than re-registering it.
   */
  const disabled = new Set()
  const disable = (name) => {
    if (typeof name !== "string" || !registry.has(keyOf(name, undefined))) {
      throw refuse("VMU_NO_SUCH_OBJECT", "no such section to disable: " + String(name))
    }
    disabled.add(name)
    return { ok: true, section: name, disabled: true }
  }
  const enable = (name) => { disabled.delete(name); return { ok: true, section: name, disabled: false } }
  const isDisabled = (name) => disabled.has(name)

  const register = (section) => {
    if (!section || typeof section !== 'object') throw refuse('VMU_INVALID_ARGUMENT', 'a section must be an object')
    const { name } = section
    if (typeof name !== 'string' || !KEBAB.test(name)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'section name must be kebab-case: ' + String(name))
    }
    const order = Number.isInteger(section.order) ? section.order : 600
    const range = inRange(order, name)
    const existing = registry.get(keyOf(name, section.lang))
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
      // ROUND 241: the language the section's text is written in, so `vmu.prompts.locale.onMissing` has something to check.
    // MEASURED: without this the check read `undefined` and never fired at all.
    lang: typeof section.lang === 'string' && section.lang.trim() ? section.lang.trim() : null,
    terms: Array.isArray(section.terms) ? section.terms.map(String) : [],   // ROUND 244: the ids this section cites
    text: typeof section.text === 'string' ? section.text : null,
      template: section.template || null,
      vars: Array.isArray(section.vars) ? section.vars.slice() : [],
      truncate: section.truncate || null,
    }
    registry.set(keyOf(name, langOf(entry)), entry)
    return entry
  }

  for (const s of sections) register(s)
  // ROUND 242: a section DECLARED in settings is registered too - "settings inline" is the highest-scoring source in §11.
  for (const s of declaredSections) register(s)
  // The CALLER wins: a declared override only fills a key the caller left empty.
  for (const [k, v] of Object.entries(declaredOverrides)) if (typeof v === 'string' && overrides[k] === undefined) overrides[k] = v
  const overrideMerge = { declared: Object.keys(declaredOverrides).length, fromCaller: Object.keys(overrides).length }

  // A binding that names an unknown section is a configuration defect, not a no-op: silently ignoring it
  // would let a typo switch a rule off without a trace (the same reasoning as R4 for settings keys).
  bindings.forEach((b, i) => {
    if (!b || typeof b.section !== 'string') throw refuse('VMU_INVALID_ARGUMENT', 'binding ' + i + ' must name a section')
    if (!hasName(b.section)) {
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
    // ROUND 241: the language-level override wins when the resolved language matches.
    const ov = overrideFor(entry.name, ctx && ctx.lang)
    if (ov.text !== null) return ov.text
    // ROUND 241: and the SAME round closes the gap it would otherwise leave: a section that declares the language of its text
    // is checked against the resolved order, and the declaration decides what a mismatch means.
    if (typeof entry.lang === 'string' && entry.lang.trim() && !langOrder(ctx && ctx.lang).includes(entry.lang.trim())) {
      if (localeOnMissing === 'refuse') {
        throw refuse('VMU_NO_SUCH_OBJECT', 'no text for this section in the resolved languages: ' + entry.name + ' is ' + entry.lang.trim(),
          'asked=' + String((ctx && ctx.lang) || '') + ', tried=' + langOrder(ctx && ctx.lang).join(' > ') + ' (vmu.prompts.locale.onMissing=refuse)')
      }
      localeMisses.push({ section: entry.name, lang: entry.lang.trim(), tried: langOrder(ctx && ctx.lang) })
    }
    if (entry.text !== null) return entry.text
    if (entry.template && readFile) return readFile(entry.template)
    return null
  }

  // ROUND 374: a placeholder whose value nobody supplied used to render as an empty string SILENTLY, which measured
  // out as live text like "hired by  " and "debate round limit  ". Nothing here is allowed to fail silently, so every
  // miss is recorded on the assembly result, and `vmu.prompts.missingVariable` decides whether a miss is merely
  // recorded or refused by name. The default is 'report' for one migration step: the pack has holes to close first,
  // and the gate asserts that once those holes are closed the 'refuse' mode passes too.
  const variableMisses = []

  const renderVariables = (text, ctx) => {
    // The policy is read from the CALL's settings, not from a factory-scope value: `ctx` exists only per assembly.
    const missingVariable = ctx && ctx.settings && ctx.settings['vmu.prompts.missingVariable'] === 'refuse' ? 'refuse' : 'report'
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
      if (value === undefined || value === null) {
        variableMisses.push({ variable: key, asked: whole })
        if (missingVariable === 'refuse') {
          throw refuse('VMU_PROMPT_VARIABLE_MISSING',
            'no value was supplied for ' + whole + ', so the section would have rendered an empty slot',
            'supply it in the assembly context (or in settings for a setting: variable); set vmu.prompts.missingVariable=report to record instead of refusing')
        }
        return ''
      }
      return escapeTemplate(value)
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
    bind,
    disable,
    enable,

    /** The immutable facts block. Framework-owned, never overridable, always present. */
    setState(text) {
      if (typeof text !== 'string') throw refuse('VMU_INVALID_ARGUMENT', 'state must be a string')
      const existing = registry.get(keyOf('state', null))
      if (existing && existing.text !== null) {
        throw refuse('VMU_NOT_PERMITTED', 'the state block is already set and is immutable')
      }
      registry.set(keyOf('state', null), {
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
      // PER-ASSEMBLY, never pipeline-scoped: an append must not survive into the next prompt.
      const appends = []
      lastAppends = appends
      // MIDDLEWARE CAN ALWAYS SEE THE ASSEMBLY HOOK. Two defects are fixed here (independent verification,
      // task-40/38): the emitted name was `prompt/assemble`, which is NOT in the frozen `VU_HOOKS` set (the
      // registry declares `prompt/section-assembled`), so the emit reached no listener and middleware could not
      // influence the prompt at all; and the guard ran the hook only while `vmu.middleware.dryRun` was
      // UNDEFINED, so setting it to `false` - the natural way to say "no dry run" - silently disabled middleware
      // control. Dry run now means what the docs say: the hook IS called, and its effects are simply not applied.
      if (bus) {
        const dry = settings['vmu.middleware.dryRun'] === true
        const hook = await bus.emit('prompt/section-assembled', { ctx, dryRun: dry },
          { member: ctx.member, role: ctx.role, phase: ctx.phase })
        if (hook && hook.ok === false) return { ok: false, refused: hook.refused || { code: hook.code, message: hook.message }, traceId: hook.traceId }
        for (const d of (!dry && hook ? hook.decisions : [])) {
          const ap = d.decision && d.decision.appendPrompt
          const list = Array.isArray(ap) ? ap : ap ? [ap] : []
          for (const item of list) {
            const name = (item && item.section) || 'middleware-append'
            const text = (item && (item.text || (item.file && readFile && readFile(item.file)))) || null
            if (text !== null) appends.push({ section: name, text, source: 'middleware:' + d.id })
          }
        }
      }

      // ROUND 243: one entry per NAME, chosen for the resolved language. Renders BOTH languages would be worse than either.
  const picked = [...new Set([...registry.values()].map((e) => e.name))]
    .map((n) => pickFor(n, ctx && ctx.lang))
    .filter((e) => e !== null)
        .filter((e) => scopeMatches(e.scope, ctx))
        .sort((a, b) => (a.order - b.order) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  // ROUND 244: §21.4. Placed after the pick deliberately: these are the sections that will actually render.
  let glossaryRefusal = null
  if (glossaryMode !== 'off') {
    if (ontologyIds === null && !readFile) {
      // A CAPABILITY GAP, not a broken declaration: traced, and assembly continues. Refusing here would make the glossary
      // mandatory for every pipeline, which is not what the key says.
      glossaryTraces.push({ what: 'ontology-unchecked', path: glossaryPath, mode: glossaryMode, reason: 'no reader is available in this pipeline' })
    } else if (ontologyIds === null) {
      try {
        const rawGloss = await readFile(glossaryPath, 'utf8')
        const parsed = JSON.parse(typeof rawGloss === 'string' ? rawGloss : String(rawGloss))
        const terms = parsed && parsed.terms ? parsed.terms : {}
        ontologyIds = new Set(Array.isArray(terms)
          ? terms.map((x) => (x && x.id) || x).filter(Boolean).map(String)
          : Object.keys(terms).map(String))
      } catch (e) {
        // §21.4: an unreadable ontology is NOT "no terms".
        glossaryTraces.push({ what: 'ontology-unreadable', path: glossaryPath, mode: glossaryMode, reason: String((e && e.message) || e) })
      }
    }
    const unreadable = glossaryTraces.some((x) => x.what === 'ontology-unreadable')
    if (unreadable && glossaryMode === 'enforce') {
      glossaryRefusal = { code: 'VMU_NO_SUCH_OBJECT', message: 'vmu.prompts.glossary.mode=enforce and the ontology cannot be read: ' + glossaryPath,
        hint: 'fix the path or the file, or set vmu.prompts.glossary.mode=warn to continue and trace it' }
    } else if (ontologyIds !== null) {
      for (const entry of picked) {
        const terms = Array.isArray(entry.terms) ? entry.terms : []
        const unknown = terms.filter((x) => !ontologyIds.has(String(x)))
        if (!unknown.length) continue
        if (glossaryMode === 'enforce') {
          glossaryRefusal = { code: 'VMU_INVALID_ARGUMENT', message: 'section ' + entry.name + ' cites terms outside the ontology: ' + unknown.join(', '),
            hint: 'add them to ' + glossaryPath + ', or set vmu.prompts.glossary.mode=warn' }
          break
        }
        glossaryTraces.push({ what: 'term-unknown', section: entry.name, terms: unknown })
      }
    }
    if (glossaryRefusal) {
      return { ok: false, refused: glossaryRefusal,
        glossary: { mode: glossaryMode, path: glossaryPath, loaded: ontologyIds !== null, traces: glossaryTraces.slice() } }
    }
  }
      const parts = []
      const sources = []
      for (const entry of picked) {
        // A disabled section is skipped WHOLE, heading included: that is what zero injection means (round 386).
        if (disabled.has(entry.name)) continue
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
        const overrideText = overrideFor(entry.name, ctx && ctx.lang).text
        let text = contentOf(entry, ctx, null)
        let source = typeof overrideText === 'string' ? 'override' : entry.source
        // ROUND 374 - CORRECTED AFTER AN INDEPENDENT PACK AUDIT. A binding means "this section says something different
        // for this role / phase / member / task", so it REPLACES the section's own text and at most ONE binding may win.
        // The code here used to APPEND every matching binding, which measured out as a researcher receiving three
        // identities and three different quorums inside one charter - eighteen and a half thousand characters saying at
        // once that the reader was the academician, r-1, r-2 and r-3, with m equal to 1, 2 and 3. BINDING_PRIORITY is
        // low to high (role < phase < member < task), so the MOST SPECIFIC dimension wins; a tie on the same dimension
        // is REFUSED rather than silently picked, because a silent pick is the same class of bug the append was.
        // Middleware `appends` keep their append semantics on top of the winner.
        const matches = matchingBindings(ctx).filter((m) => m.binding.section === entry.name)
        if (matches.length) {
          const rankOf = (m) => BINDING_PRIORITY.indexOf(m.dim)
          const top = Math.max(...matches.map(rankOf))
          const winners = matches.filter((m) => rankOf(m) === top)
          if (winners.length > 1) {
            throw refuse('VMU_PROMPT_BINDING_CONFLICT',
              'two bindings tie for section ' + entry.name + ' on the same dimension (' + winners[0].dim + ')',
              'give one of them a more specific dimension; priority is ' + BINDING_PRIORITY.join(' < '))
          }
          const extra = contentOf(entry, ctx, winners[0].binding)
          if (extra !== null) {
            text = extra
            source = 'binding:' + winners[0].dim
            sources.push({ section: entry.name, source: 'binding:' + winners[0].dim, by: winners[0].binding.owner || null })
          }
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

      return { ok: true, text: parts.length === 0 ? '' : trimTrailing(parts.join('\n\n')), sources, truncation: truncation.slice(),
        // ROUND 374: the auditable record of every placeholder nobody supplied. A missing value is a fact about the
        // assembly, so it is reported rather than swallowed.
        variableMisses: variableMisses.slice(),
        missingVariable: (ctx && ctx.settings && ctx.settings['vmu.prompts.missingVariable'] === 'refuse') ? 'refuse' : 'report',
        // ROUND 241: a language decision that cannot be audited is not a decision.
        locale: { asked: (ctx && ctx.lang) || null, tried: langOrder(ctx && ctx.lang), default: localeDefault, chain: localeChain, onMissing: localeOnMissing,
          overrideSources: [...new Set([...registry.values()].map((e) => e.name))].map((n) => ({ section: n, source: overrideFor(n, ctx && ctx.lang).source })).filter((e) => e.source !== null) },
          localeMisses: localeMisses.slice(),
        glossary: { mode: glossaryMode, path: glossaryPath, loaded: ontologyIds !== null, traces: glossaryTraces.slice() },
        overrideMerge,   // ROUND 241: what onMissing=warn recorded instead of refusing
        enforced: ['vmu.prompts.locale.default', 'vmu.prompts.locale.fallbackChain', 'vmu.prompts.overridesByLang'], at: clock() }
    },

    /** Register an override by reference (rollback = swapping the reference back; docs/06 §6). */
    override(section, text, by = 'office') {
      const entry = pickFor(section, undefined)
      if (!entry) throw refuse('VMU_NO_SUCH_OBJECT', 'unknown section: ' + section)
      if (entry.mutable === false) {
        throw refuse('VMU_NOT_PERMITTED', 'section ' + section + ' is immutable: read-only facts cannot be overridden',
          'append through middleware instead (docs/06 §2 invariant 1)')
      }
      if (!whoMayOverride.includes(by)) {
        throw refuse('VMU_NOT_PERMITTED', by + ' may not override section ' + section,
          'allowed: ' + whoMayOverride.join(', ') + ' (docs/06 §6)')
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
        middlewareAppends: lastAppends.map((a) => ({ section: a.section, source: a.source })),
      }
    },
  }

  return pipeline
}
