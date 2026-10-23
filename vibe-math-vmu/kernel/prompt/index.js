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
export const BINDING_PRIORITY = Object.freeze(['role', 'phase', 'member', 'task', 'agent'])

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
  // ★★★ PHASE 12 / R10: "the configured value, else the DECLARED default" for `{{ setting:... }}` slots. Optional, so a
  // hand-made pipeline (tests, another host) keeps the old behaviour byte for byte; the kernel injects its ONE reader
  // (kernel/settings-defaults.js `readSetting`) so this module never imports the schema table.
  settingFallback = null,
} = {}) {
  // D-13 — THE SETTINGS ARE READ LIVE, NOT SNAPSHOTTED AT CONSTRUCTION. The kernel hands this factory a
  // LIVE settings view (`settings.get(k)`), and every key below is declared hot class H1 ("next turn"):
  // snapshotting them here made a runtime `vibe_vmu_set` invisible to the prompt face while the receipt
  // claimed "every consumer reads this key live". The rule: only STRUCTURAL derivations may be cached
  // (the declared sections are REGISTERED once, below — a registration is not a value); values are read
  // per call. `settings` may be a plain object (tests) or the kernel's view, so the accessor handles both.
  const sget = (k) => {
    if (!settings || typeof settings !== 'object') return undefined
    return typeof settings.get === 'function' ? settings.get(k) : settings[k]
  }
  const localeDefaultOf = () => (typeof sget('vmu.prompts.locale.default') === 'string' ? sget('vmu.prompts.locale.default') : null)
  const localeChainOf = () => {
    const v = sget('vmu.prompts.locale.fallbackChain')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : ['zh-Hans', 'zh', 'en']
  }
  const localeOnMissingOf = () => (sget('vmu.prompts.locale.onMissing') === 'refuse' ? 'refuse' : 'warn')
  // ROUND 10 / task-74 (A1/A2): THE CONTEXT-COMPACTION GATE — v5r's two keys (v5r :1078/:1079). v5r computes
  // `soft = contextPct >= compactThreshold || roundsSinceCompact >= compactAfterRounds` (:3902-3903) and, when soft,
  // PREFIXES the member's prompt with a directive asking for a condensed self-report (:3905-3907). Same mechanism,
  // same inputs: the CALLER supplies the usage signal (`ctx.contextPct`, in PERCENT 0-100 — v5r :449 warns never to
  // treat it as a 0-1 fraction — and `ctx.round`). NO SIGNAL ⇒ no directive and `due:false`, so the host-section
  // assembly (which passes neither) stays byte-identical: the zero-mechanism default holds.
  // The values are validated ONLY when a signal is present: a deployment that never asks for compaction must not have
  // every assembly refused by a key it does not use — but once the gate IS evaluated, an out-of-domain value is
  // refused BY NAME rather than silently disabled (the round-8 finalizer defect class).
  const COMPACT_WAKES = ['normal', 'checkpoint']   // v5r :3899-3901 (meeting/verify replies are a different shape)
  const compactionOf = (ctx) => {
    const rawPct = ctx ? Number(ctx.contextPct) : NaN
    const contextPct = Number.isFinite(rawPct) ? rawPct : null
    const rawRound = ctx ? Number(ctx.round) : NaN
    const round = Number.isFinite(rawRound) ? rawRound : null
    if (contextPct === null && round === null) {
      return { due: false, reason: 'no usage signal (ctx.contextPct / ctx.round absent): the zero-mechanism default',
        contextPct: null, round: null, threshold: null, afterRounds: null, enforced: [], directive: null }
    }
    // UNDECLARED means v5r's DEFAULT (66 / 8), not "invalid": the pipeline may be handed a plain settings object
    // (tests, a pack that declares nothing), and refusing there would break every assembly the moment a caller
    // supplied a usage signal. Only a DECLARED-but-unusable value is refused (below).
    const rawThresholdValue = sget('vmu.prompt.compactThreshold')
    const rawThreshold = rawThresholdValue === undefined || rawThresholdValue === null || rawThresholdValue === ''
      ? 66 : Number(rawThresholdValue)
    const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 100 ? rawThreshold : null
    if (threshold === null) {
      // This module's `refuse()` takes (code, message, hint) only, so the evidence is attached explicitly - the
      // same `enforced`/`declared`/`value` shape the settings-refusal convention uses (and inside `detail` too, so
      // both readers of a refusal find it).
      const detail = { enforced: ['vmu.prompt.compactThreshold'], declared: ['(0,100]'], value: rawThresholdValue, enforcedScope: 'evaluated-so-far' }
      throw Object.assign(refuse('VMU_INVALID_ARGUMENT', 'vmu.prompt.compactThreshold must be a percent in (0, 100]: ' + String(rawThresholdValue),
        'v5r compactThreshold is a PERCENT 0-100 (v5r :449) and v5r :9869 refuses values <= 0'), detail, { detail })
    }
    const rawAfterValue = sget('vmu.prompt.compactAfterRounds')
    const rawAfter = rawAfterValue === undefined || rawAfterValue === null || rawAfterValue === '' ? 8 : Number(rawAfterValue)
    const afterRounds = Number.isFinite(rawAfter) && rawAfter > 0 ? Math.floor(rawAfter) : null
    if (afterRounds === null) {
      const detail = { enforced: ['vmu.prompt.compactAfterRounds'], declared: ['integer >= 1'], value: rawAfterValue, enforcedScope: 'evaluated-so-far' }
      throw Object.assign(refuse('VMU_INVALID_ARGUMENT', 'vmu.prompt.compactAfterRounds must be a positive integer: ' + String(rawAfterValue),
        'v5r compactAfterRounds is 8 (v5r :1079)'), detail, { detail })
    }
    const wake = ctx && typeof ctx.wake === 'string' && ctx.wake ? ctx.wake : 'normal'
    const wakeEligible = COMPACT_WAKES.indexOf(wake) !== -1
    const byPct = contextPct !== null && contextPct >= threshold
    const byRounds = round !== null && round >= afterRounds
    const enforced = []
    if (byPct) enforced.push('vmu.prompt.compactThreshold')
    if (byRounds) enforced.push('vmu.prompt.compactAfterRounds')
    const due = wakeEligible && (byPct || byRounds)
    return {
      due, threshold, afterRounds, contextPct, round, wake, enforced,
      reason: !wakeEligible
        ? ('wake=' + wake + ' cannot acknowledge a compaction directive (v5r :3901)')
        : (due ? (byPct ? 'contextPct ' + contextPct + ' >= ' + threshold : 'round ' + round + ' >= ' + afterRounds) : 'below both thresholds'),
      // The directive TEXT mirrors v5r :3905-3907, MINUS the two reply fields it asks for: vmu's turn parser has a
      // CLOSED field catalogue (kernel/turn/index.js, not this face), so requiring new reply fields here would make
      // every turn fail with VMU_TURN_UNKNOWN_FIELD. The member is asked for a condensed self-report instead, which
      // the panel/selfReport primitive already accepts.
      directive: due
        ? '[CONTEXT COMPACT — 你的对话已接近上限。不要重新推导历史。请把当前工作状态浓缩成一段自述（已有发现、当前方向、已记录的关键成果、下一步具体动作、未决问题），然后照常以 JSON 回答本轮。]'
        : null,
    }
  }
  const overridesByLangOf = () => {
    const v = sget('vmu.prompts.overridesByLang')
    return v && typeof v === 'object' ? v : {}
  }
  // ROUND 244: the glossary family.
  const glossaryModeOf = () => {
    const v = sget('vmu.prompts.glossary.mode')
    return ['enforce', 'warn', 'off'].includes(v) ? v : 'enforce'
  }
  // ★★★★★★★ ROUND 84 — WHICH HOST AGENT THIS ASSEMBLY IS FOR (the fifth dimension).
  // UNSET MATCHES NOBODY, deliberately: a scope that says `agent: 'x'` must not render for every agent merely because
  // nobody said which agent this is. Matching everything would inject a section into assemblies it was never meant
  // for, which is the silent-success shape this framework refuses everywhere else.
  const agentIdOf = (ctx) => {
    const fromCtx = ctx && typeof ctx.agent === 'string' ? ctx.agent.trim() : ''
    if (fromCtx) return fromCtx
    // A PER-ASSEMBLY settings view is honoured too, because `assemble` accepts one (`ctx.settings`) and a host that
    // routes several agents through one pipeline would otherwise have to rebuild the pipeline per agent.
    const perAssembly = ctx && ctx.settings && typeof ctx.settings === 'object'
      && typeof ctx.settings['vmu.prompts.agentId'] === 'string' ? ctx.settings['vmu.prompts.agentId'].trim() : ''
    if (perAssembly) return perAssembly
    const declared = sget('vmu.prompts.agentId')
    return typeof declared === 'string' ? declared.trim() : ''
  }

  const glossaryPathOf = () => {
    const v = sget('vmu.prompts.glossary.ontology')
    return typeof v === 'string' && v.trim() ? v.trim() : 'vibe-math-vmu/glossary.json'
  }
  const glossaryTraces = []
  let ontologyIds = null   // null means NOT LOADED, which §21.4 insists is different from empty
  // ROUND 242 (verified half): the declared sections and overrides.
  if (overrides === null || typeof overrides !== 'object') overrides = {}   // the kernel passes null EXPLICITLY, so the default never applied
  // STRUCTURAL: registered once below. `declaredOverrides` is kept only for the RECEIPT (`overrideMerge`);
  // the text itself is read live by `declaredOverrideOf`, so a runtime change takes effect next assembly.
  const declaredSections = Array.isArray(sget('vmu.prompts.sections')) ? sget('vmu.prompts.sections') : []
  const declaredOverridesAtConstruction = sget('vmu.prompts.overrides')
  const declaredOverrides = declaredOverridesAtConstruction && typeof declaredOverridesAtConstruction === 'object'
    ? declaredOverridesAtConstruction : {}
  const declaredOverrideOf = (name) => {
    const m = sget('vmu.prompts.overrides')
    return m && typeof m === 'object' && typeof m[name] === 'string' ? m[name] : undefined
  }
  /** The languages to try, in order, with the reason the list looks like it does. Read LIVE (D-13). */
  const langOrder = (asked) => {
    const list = []
    if (typeof asked === 'string' && asked.trim()) list.push(asked.trim())
    const fallbackDefault = localeDefaultOf()
    if (fallbackDefault && !list.includes(fallbackDefault)) list.push(fallbackDefault)
    for (const l of localeChainOf()) if (!list.includes(l)) list.push(l)
    return list
  }
  /** The override in force for one section under one language: language-level wins, then the caller's, then the declared (all LIVE). */
  const overrideFor = (name, lang) => {
    const perLang = overridesByLangOf()[name]
    if (perLang && typeof perLang === 'object') {
      for (const l of langOrder(lang)) if (typeof perLang[l] === 'string') return { text: perLang[l], source: 'byLang:' + l }
    }
    if (typeof overrides[name] === 'string') return { text: overrides[name], source: 'plain' }
    const declared = declaredOverrideOf(name)
    if (typeof declared === 'string') return { text: declared, source: 'plain:settings' }
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
    if (localeOnMissingOf() === 'refuse') {
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
    const dims = ['role', 'phase', 'member', 'task', 'agent'].filter((d) => typeof b[d] === 'string' && b[d] !== '')
    if (dims.length !== 1) {
      throw refuse('VMU_INVALID_ARGUMENT', 'a binding must name exactly one dimension', 'one of: role < phase < member < task < agent')
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
  // ★ phase-3 / task-235 — THE DISPLACEMENT RECORD. When a pack section REPLACES a mutable framework section the
  // replacement is a DECLARATION and it is REPORTED: this list is what the assembly receipt publishes
  // (`replacedSections`, next to `overrideMerge`), so "what got displaced, and by whom" is auditable.
  // ★ It is deliberately NOT `disabled`: the render loop skips a disabled section WHOLE BY NAME (`:590`), and the
  // displaced surface and its replacement SHARE the name - so putting the name here would suppress the replacement
  // as well and turn a silent overwrite into a silent NON-INJECTION (measured as the trap in task-235).
  const replacedSections = []

  const register = (section) => {
    if (!section || typeof section !== 'object') throw refuse('VMU_INVALID_ARGUMENT', 'a section must be an object')
    const { name } = section
    if (typeof name !== 'string' || !KEBAB.test(name)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'section name must be kebab-case: ' + String(name))
    }
    const order = Number.isInteger(section.order) ? section.order : 600
    const range = inRange(order, name)
    // ROUND 1 (P3) — `range` IS NOT AN INPUT (docs/06 §3: it is DERIVED from `order`). Callers used to pass
    // one anyway and the pipeline silently ignored it, which let a data pack declare `range:'pack'` with an
    // order that actually lands in a KERNEL interval (`facts`/`charter`/`contract`) - the exact claim docs/06
    // §4 rule 2 forbids. Two checks now make the declaration real:
    //   · a declared range must be a KNOWN name and must MATCH the range its order produces (a mismatch is a
    //     refusal, because otherwise the declaration is decorative data that a reader would trust);
    //   · `facts` is FRAMEWORK-OWNED (docs/06 §4): a section that labels itself as a pack's (`source`
    //     'pack:<id>') may not land there, and the hint names the interval to move into.
    const declaredRange = typeof section.range === 'string' && section.range.trim() ? section.range.trim() : null
    const declaredSource = typeof section.source === 'string' && section.source.trim() ? section.source.trim() : 'kernel'
    if (declaredRange !== null) {
      if (!Object.prototype.hasOwnProperty.call(ORDER_RANGES, declaredRange)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'section ' + name + ': unknown range "' + declaredRange + '"',
          'the declared ranges are ' + Object.keys(ORDER_RANGES).join(', '))
      }
      if (declaredRange !== range) {
        throw refuse('VMU_INVALID_ARGUMENT',
          'section ' + name + ': declares range "' + declaredRange + '" but order ' + order + ' lies in "' + range + '"',
          'range is derived from order (docs/06 §3), so the two must agree: set order inside ' + declaredRange + '=[' + ORDER_RANGES[declaredRange].join(',') + '] or drop the declaration')
      }
    }
    if (range === 'facts' && declaredSource.startsWith('pack')) {
      throw refuse('VMU_NOT_PERMITTED',
        'section ' + name + ': a pack section (source ' + declaredSource + ') may not occupy the framework-owned facts interval (order ' + order + ')',
        'facts is framework-owned (docs/06 §4 rule 2): move the order into the pack interval [600,899]')
    }
    const existing = registry.get(keyOf(name, section.lang))
    let displaced = null
    if (existing) {
      if (name === 'state' || existing.mutable === false) {
        throw refuse('VMU_NOT_PERMITTED', 'section ' + name + ' is immutable and cannot be re-registered',
          'immutable sections carry read-only facts (docs/06 §2 invariant 1)')
      }
      if (existing.range === 'pack' && range === 'pack') {
        throw refuse('VMU_MIDDLEWARE_FAILED', 'two pack sections claim the same name: ' + name,
          'pack conflicts are declared explicitly, never resolved silently (docs/10 §4)')
      }
      // ★ THIRD BRANCH (task-235) - A PACK MAY REPLACE A MUTABLE FRAMEWORK SECTION, BUT ONLY BY DECLARING IT.
      // MEASURED BEFORE THIS BRANCH EXISTED: the two guards above only cover immutable sections and pack-versus-pack,
      // so a pack section colliding with a framework one fell straight to `registry.set` below - the framework text
      // disappeared, the pack text rendered, and nothing was refused or reported. Replacing an existing surface is a
      // DEPLOYMENT DECLARATION (docs/10 §4), so the pack section must name it in `replaces`:
      //   declared   ⇒ allowed, and the receipt reports what was displaced (below);
      //   undeclared ⇒ refused BY NAME, with the hint naming the field to add.
      // ★ NOT `disable(name)` + register: the render loop skips a disabled section WHOLE by name (`:590`), and this
      // replacement shares that name - it would suppress the replacement itself and inject NOTHING, silently. The
      // record therefore lives in `replacedSections` and the section stays enabled.
      if (range === 'pack' && existing.range !== 'pack') {
        const declaredReplaces = Array.isArray(section.replaces) ? section.replaces.map(String) : []
        if (!declaredReplaces.includes(name)) {
          throw refuse('VMU_MIDDLEWARE_FAILED',
            'a pack section would replace the framework section ' + name + ' without declaring it',
            'replacing an existing surface is a DECLARATION (docs/10 §4): add replaces: ["' + name + '"] to this section (source ' + declaredSource + ')')
        }
        displaced = { section: name, displacedSource: existing.source, displacedOrder: existing.order, replacedBy: declaredSource, declaredReplaces }
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
    if (displaced) replacedSections.push(displaced)   // ★ task-235: the declaration is also a RECORD (see the receipt)
    return entry
  }

  for (const s of sections) register(s)
  // ROUND 242: a section DECLARED in settings is registered too - "settings inline" is the highest-scoring source in §11.
  for (const s of declaredSections) register(s)
  // D-13: the declared overrides are NOT copied into the caller's map any more (that froze their TEXT at
  // construction). `overrideFor` reads `vmu.prompts.overrides` live, and the caller's own map still wins.
  // The receipt keeps the two counts so a deployment can see what was declared vs what the caller set.
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
    return hit('member', ctx.member) && hit('role', ctx.role) && hit('phase', ctx.phase) && hit('task', ctx.task) && hit('agent', agentIdOf(ctx))
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
      else if (b.agent !== undefined && matches(b.agent, agentIdOf(ctx))) dim = 'agent'
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
      if (localeOnMissingOf() === 'refuse') {
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
      // ★★★ PHASE 12 / R10 (measured on a full live run): `{{ setting:... }}` READ THE RAW MAP AND IGNORED THE
      // DECLARED DEFAULT. The kernel deliberately does not materialise schema defaults into the settings object
      // (kernel/settings-defaults.js states that contract), so a deployment that configures nothing carries an empty
      // map - and every unconfigured slot rendered `〔未提供：setting:...〕` in the member's prompt. The live run fed the
      // institute `本所「〔未提供：setting:vmu.turn.instituteName〕」` while the schema declares def 'institute', i.e. a
      // PRESENT, DECLARED VALUE was reported as missing. The framework already has ONE reader for "configured value, else
      // declared default" (`readSetting`); this channel was the door that bypassed it. `settingFallback` is that reader,
      // injected by the assembler below so this module keeps zero knowledge of the schema table.
      if (key.startsWith('setting:')) {
        const sk = key.slice(8)
        value = ctx.settings ? ctx.settings[sk] : undefined
        if (value === undefined && typeof settingFallback === 'function') {
          try { value = settingFallback(sk) } catch (e) { value = undefined }
        }
      }
      else if (key.startsWith('count:')) value = counts[key.slice(6)]
      else value = ctx[key]
      if (value === undefined || value === null) {
        variableMisses.push({ variable: key, asked: whole })
        if (missingVariable === 'refuse') {
          throw refuse('VMU_PROMPT_VARIABLE_MISSING',
            'no value was supplied for ' + whole + ', so the section would have rendered an empty slot',
            'supply it in the assembly context (or in settings for a setting: variable); set vmu.prompts.missingVariable=report to record instead of refusing')
        }
        // ★★★ AN EMPTY SLOT IS A LIE THE READER CANNOT SEE. Measured on a full live run: the agents read `本所「」`, `你的雇主：`,
        // `m =  名有表决权者` and an empty roster table, and had no way to tell a missing VALUE from a formatting bug - they
        // reported it as a prompt defect, and they were right to. In `report` mode the miss was already recorded in
        // `variableMisses`, but the rendered prompt said nothing, so the one reader who needed the fact never saw it.
        // The slot now renders the fact: what is missing, and that it is a data gap rather than a bug.
        return '〔未提供：' + key + '〕'
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
  // D-13: read the glossary knobs LIVE for THIS assembly (once per call, so the run is internally stable but
  // a runtime `vibe_vmu_set` is honoured by the very next assembly).
  const glossaryMode = glossaryModeOf()
  const glossaryPath = glossaryPathOf()
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

      // ROUND 10 / task-74 (A1/A2): the compaction gate runs HERE, on the same call as the assembly, so the directive
      // and the text it prefixes can never disagree; v5r prefixes the prompt the same way (v5r :3905).
      const compaction = compactionOf(ctx)
      const assembled = parts.length === 0 ? '' : trimTrailing(parts.join('\n\n'))
      return { ok: true, text: compaction.directive ? compaction.directive + '\n\n' + assembled : assembled, sources, truncation: truncation.slice(),
        // ROUND 10: whether a compaction directive was injected, WHY, and which of the two keys fired (or would have).
        compaction,
        // ROUND 374: the auditable record of every placeholder nobody supplied. A missing value is a fact about the
        // assembly, so it is reported rather than swallowed.
        variableMisses: variableMisses.slice(),
        missingVariable: (ctx && ctx.settings && ctx.settings['vmu.prompts.missingVariable'] === 'refuse') ? 'refuse' : 'report',
        // ROUND 241: a language decision that cannot be audited is not a decision.
        locale: { asked: (ctx && ctx.lang) || null, tried: langOrder(ctx && ctx.lang), default: localeDefaultOf(), chain: localeChainOf(), onMissing: localeOnMissingOf(),
          overrideSources: [...new Set([...registry.values()].map((e) => e.name))].map((n) => ({ section: n, source: overrideFor(n, ctx && ctx.lang).source })).filter((e) => e.source !== null) },
          localeMisses: localeMisses.slice(),
        glossary: { mode: glossaryMode, path: glossaryPath, loaded: ontologyIds !== null, traces: glossaryTraces.slice() },
        overrideMerge,   // ROUND 241: what onMissing=warn recorded instead of refusing
        // ★ task-235: WHAT A PACK REPLACED, BY DECLARATION. Empty unless a pack section declared `replaces`
        // against a mutable framework section; the record names the displaced section AND where it came from.
        replacedSections: replacedSections.map((x) => Object.assign({}, x)),
        replacedCount: replacedSections.length,
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
            source: e.source, overridden: typeof overrides[e.name] === 'string' || typeof declaredOverrideOf(e.name) === 'string' })),
        bindings: bindings.length,
        truncation: truncation.map((t) => ({ section: t.section, kept: t.kept, dropped: t.dropped, mode: t.mode })),
        middlewareAppends: lastAppends.map((a) => ({ section: a.section, source: a.source })),
      // ★ ROUND 84 (C-3): THE DISPLACEMENT RECORD IS NOW ON THE STATUS SURFACE. It was already published in the
      // ASSEMBLY receipt, but `pipeline.status()` - the surface a deployment reads WITHOUT assembling - did not carry
      // it, so "what got displaced, and by whom" was auditable only if you had just assembled. C2's requirement is
      // that a declared replacement be VISIBLE, and one out-param here is enough because the kernel carries this
      // object out unchanged.
      replacedSections: replacedSections.map((r) => Object.assign({}, r)),
      replacedCount: replacedSections.length,
      }
    },
  }

  return pipeline
}
