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

/**
 * PHASE 6 (goal-3 audit P1): one counter for topic ownership. The owner is per APPLY (`pack-id#N`), not per pack id,
 * so two kernels that apply the same pack in one process each hold their own declaration and one unload cannot revoke
 * the other's topic.
 */
let topicOwnerSeq = 0

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.hint = hint
  err.code = code
  return err
}

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/**
 * A deterministic, dependency-free LZSS codec — the engine behind `vmu.pack.compression` (task-194).
 * 04 §11 claimed `vmu.pack.compression` was 已接线 while nothing read it; it is now READ FOR REAL and it
 * CHANGES the reported/stored snapshot size. This is deliberately NOT a general-purpose archiver: it is a
 * small, exact, reversible byte reducer whose contract is asserted by tests/vmu-pack.test.mjs:
 *     decompressText(compressText(s)) === s      for every s
 * It never lies about size either: callers compare `packedBytes` with `rawBytes` and fall back to the raw form
 * when the packed form would EXPAND (JSON that carries no repetition), instead of reporting a fake saving.
 * Token layout: one flag byte, then 8 tokens; flag bit set ⇒ match token = 2 bytes (12-bit offset, 4-bit
 * length-4), bit clear ⇒ one literal byte.
 */
export function compressText(text) {
  const src = new TextEncoder().encode(String(text))
  const out = []
  let i = 0
  while (i < src.length) {
    const flagPos = out.length
    out.push(0)
    let flags = 0
    for (let b = 0; b < 8 && i < src.length; b++) {
      let bestLen = 0
      let bestOff = 0
      const maxLen = Math.min(19, src.length - i)
      const windowStart = Math.max(0, i - 4096)
      for (let j = i - 1; j >= windowStart; j--) {
        let len = 0
        while (len < maxLen && src[j + len] === src[i + len]) len += 1
        if (len > bestLen) { bestLen = len; bestOff = i - j; if (len === maxLen) break }
      }
      if (bestLen >= 4) {
        flags |= (1 << b)
        out.push(((bestLen - 4) << 4) | ((bestOff >> 8) & 0x0f))
        out.push(bestOff & 0xff)
        i += bestLen
      } else {
        out.push(src[i])
        i += 1
      }
    }
    out[flagPos] = flags
  }
  return Uint8Array.from(out)
}

export function decompressText(bytes) {
  const src = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || [])
  const out = []
  let i = 0
  while (i < src.length) {
    const flags = src[i]
    i += 1
    for (let b = 0; b < 8 && i < src.length; b++) {
      if (flags & (1 << b)) {
        const b1 = src[i]
        const b2 = src[i + 1]
        i += 2
        const len = ((b1 >> 4) & 0x0f) + 4
        const off = ((b1 & 0x0f) << 8) | b2
        const start = out.length - off
        if (off === 0 || start < 0) throw refuse('VMU_INVALID_ARGUMENT', 'compressed payload is corrupt: a match token points before the start of the stream', 'the payload did not come from compressText()')
        for (let k = 0; k < len; k++) out.push(out[start + k])
      } else {
        out.push(src[i])
        i += 1
      }
    }
  }
  return new TextDecoder().decode(Uint8Array.from(out))
}

const byteLength = (s) => new TextEncoder().encode(String(s)).length

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
  // PHASE 6 / goal-3 audit P1: a pack may declare the packs it must not coexist with. Names are pack ids (kebab-case),
  // unique, and never itself — the enforcement is in buildPlan()/apply(), so plan() and apply() cannot disagree.
  if (manifest.excludes !== undefined) {
    if (!Array.isArray(manifest.excludes)) problems.push('excludes must be a list of pack ids')
    else {
      const seen = new Set()
      for (const x of manifest.excludes) {
        if (typeof x !== 'string' || !ID.test(x)) problems.push('excludes entries must be pack ids (kebab-case): ' + JSON.stringify(x))
        else if (x === manifest.id) problems.push('a pack cannot exclude itself (' + x + ')')
        else if (seen.has(x)) problems.push('excludes lists ' + x + ' twice')
        seen.add(x)
      }
    }
  }
  for (const r of manifest.rules || []) {
    if (!r || typeof r.id !== 'string') problems.push('a rule needs an id')
    else if (!Array.isArray(r.on) || r.on.length === 0) problems.push('rule ' + r.id + ': on is required')
  }
  for (const m of manifest.middleware || []) {
    if (!m || typeof m.id !== 'string') { problems.push('a middleware entry needs an id'); continue }
    // D-03: the bus runs `rules` and `module` only. `script`/`plugin` have real carriers OUTSIDE the bus
    // (kernel/script-bridge.js + `vibe_vmu_script`; a DSH plugin consuming published services), and the bus
    // itself does not load files - so a pack entry must bring a handler, not a path.
    const kind = m.kind === undefined ? 'module' : m.kind
    if (kind !== 'rules' && kind !== 'module') {
      problems.push('middleware ' + m.id + ': kind must be rules|module (got ' + JSON.stringify(m.kind) + '); script/plugin are not bus kinds (D-03)')
    } else if (kind !== 'rules' && typeof m.handler !== 'function' && m.module === undefined && typeof m.file !== 'string') {
      // ROUND 10: TWO accepted shapes. An INLINE `handler` is added to the bus as-is (its handler sees the bus
      // envelope only). A MODULE (`module: { meta, capabilities, hooks }`) or a `file` is routed through
      // `kernel/loader.js` in apply(), which validates it AND attaches `api` - the only way a middleware can
      // reach a service (`api.services.get`, capability-gated). Neither shape may be a bare path: the bus never
      // loads files itself.
      problems.push('middleware ' + m.id + ': a non-rules entry needs a handler function, or a module object / file for kernel/loader.js to load (the bus itself does not load files)')
    }
  }
  // ROUND 596 — PROMPT-PIPELINE POLICIES ARE NOT BUS ENTRIES. `prompt/assemble` is not a registered bus hook, so an entry like
  // v5r.prompt-switches cannot be added to the bus at all: it belongs to the prompt pipeline, where `sectionPolicy` consumes it.
  // ROUND 1 (D-03/P1): a declared policy is now CONSUMED BY apply() through the loader's `onPromptPolicy` sink, so it must carry
  // the function that will be registered - `apply` - and not merely an id. A policy nobody can consume is a named refusal.
  for (const pp of manifest.promptPolicies || []) {
    if (!pp || typeof pp.id !== 'string') { problems.push('a prompt policy entry needs an id'); continue }
    if (typeof pp.apply !== 'function') problems.push('prompt policy ' + pp.id + ': needs an apply({settings,turn}) function; the loader hands it to onPromptPolicy')
  }
  for (const a of manifest.aliases || []) {
    if (!a || typeof a.from !== 'string' || typeof a.to !== 'string') problems.push('an alias needs { from, to }')
  }
  // PHASE 6 / P0-10 — PACK-DECLARED TOOL FACE. A pack may state the tool NAMES it publishes; the framework must
  // never learn an institution's vocabulary, so the manifest field is the only place those names are written.
  // Validated here (plan sees it before apply), then held by kernel.declarePackTools and published by host.js.
  {
    const seen = new Set()
    for (const t of manifest.tools || []) {
      if (!t || typeof t !== 'object') { problems.push('a tool entry must be an object'); continue }
      const name = typeof t.name === 'string' ? t.name : ''
      if (!/^[a-z][a-z0-9_]{2,63}$/.test(name)) {
        problems.push('tool ' + JSON.stringify(t.name) + ': name must be lowercase [a-z0-9_], 3..64 chars (e.g. vibe_math_status)')
        continue
      }
      if (seen.has(name)) problems.push('tool name is declared twice in the same manifest: ' + name)
      seen.add(name)
      if (typeof t.description !== 'string' || t.description.trim() === '') problems.push('tool ' + name + ': needs a non-empty description (the model reads it)')
      if (typeof t.handler !== 'function') problems.push('tool ' + name + ': needs a handler function (the framework cannot execute a name)')
      if (t.parameters !== undefined && (t.parameters === null || typeof t.parameters !== 'object' || Array.isArray(t.parameters))) {
        problems.push('tool ' + name + ': parameters must be an object map of parameter definitions')
      }
    }
  }
  // PHASE 6 (goal-3 audit P1): the protocol TOPICS this pack introduces. Declared here so `plan` shows them, applied
  // on the runtime bus with THIS pack as owner, and retracted by the unload undo. A topic name has the same shape the
  // bus requires (domain/name, kebab-case), and the same name twice is refused rather than merged.
  {
    const seenTopics = new Set()
    for (const topic of manifest.topics || []) {
      if (typeof topic !== 'string' || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(topic)) {
        problems.push('topic ' + JSON.stringify(topic) + ': must look like domain/name with kebab-case on both sides')
        continue
      }
      if (seenTopics.has(topic)) problems.push('topic is declared twice in the same manifest: ' + topic)
      seenTopics.add(topic)
    }
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
/**
 * ROUND 342 - COLLECT THE SECTIONS PACKS DECLARE. Pure on purpose: the pipeline registers a section when it is
 * CONSTRUCTED and cannot unregister one, while a pack must leave no residue on unload - so a section cannot be an
 * apply-time side effect. It is a declaration the assembly collects BEFORE building the kernel.
 * A malformed declaration, or two packs claiming one name, is refused by name rather than resolved silently.
 */
export function collectPackSections(manifests = []) {
  const list = Array.isArray(manifests) ? manifests : []
  const out = []
  for (const m of list) {
    if (!m || !Array.isArray(m.sections)) continue
    for (const s of m.sections) {
      if (!s || typeof s.name !== 'string' || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s.name)) {
        throw refuse('VMU_PACK_INVALID', 'a declared prompt section needs a kebab-case name', 'offender: pack ' + String(m.id))
      }
      if (out.some((x) => x.name === s.name)) {
        throw refuse('VMU_PACK_CONFLICT', 'two packs declare the same prompt section: ' + s.name, 'conflicts are declared explicitly (docs/10 section 4)')
      }
      out.push(s)
    }
  }
  return out
}

/**
 * D-02 — THE ONE PRIORITY, low to high: `pack 默认 < preset Config < 会话 settings < 运行时 set`.
 * A pack's own `settings` are therefore the LOWEST layer: a key already owned by a higher layer is
 * SHADOWED (the higher layer wins — no silent overwrite, so O4 is not violated), while a key owned by
 * another pack (or by the pack-defaults layer) is a REAL conflict and is refused by name.
 */
export const SETTING_LAYERS = Object.freeze(['schema', 'pack', 'preset', 'session', 'runtime'])

/** The rank of a per-key source string, or null when the source is unknown (then the conservative path runs). */
export function settingLayerRank(source) {
  const s = String(source === undefined || source === null ? '' : source)
  if (s === 'schema' || s === 'default') return 0
  if (s === 'pack' || s.startsWith('pack:')) return 1
  if (s === 'preset' || s === 'config') return 2
  if (s === 'session') return 3
  if (s === 'runtime') return 4
  return null
}

/**
 * COMPOSE PACK PROMPT POLICIES INTO ONE `sectionPolicy` (D-03 / P1).
 *
 * A pack declares `promptPolicies: [{ id, apply({settings,turn}) -> {decisions,errors} }]`; the loader
 * hands each one to its `onPromptPolicy` sink, and the ENTRY composes them into the single function the
 * turn loop consults. Pure, no kernel, no pipeline: the same shape `decideSections` returns, merged —
 * a later policy wins for the same section NAME, and every policy's errors are kept.
 * A policy that THROWS becomes a named error in that same `errors` list (`VMU_PACK_PROMPT_POLICY_FAILED`),
 * which the turn loop forwards as a refusal - it is never silently skipped.
 * An empty list returns null, so "no pack declares a policy" stays the framework's zero mechanism
 * (the turn loop only asks when `typeof sectionPolicy === 'function'`).
 */
export function composePromptPolicies(policies = []) {
  // TWO DECLARED SHAPES, ONE INTENT: a policy ENTRY (`{ id, apply }`, what a manifest declares) and a bare
  // policy FUNCTION (what a folder record's `policyModule` exports, e.g. v5r's `decideSections`). A bare
  // function must be wrapped, because `fn.apply` is Function.prototype.apply and calling it with one argument
  // would invoke the policy with NO settings at all - a silent no-op dressed as a policy.
  const list = (Array.isArray(policies) ? policies : [policies])
    .map((p) => (typeof p === 'function' ? { id: p.name || 'policy', apply: p } : p))
    .filter((p) => p && typeof p.apply === 'function')
  if (list.length === 0) return null
  return ({ settings = {}, turn = {} } = {}) => {
    const byName = new Map()
    const errors = []
    for (const p of list) {
      // A POLICY THAT THROWS IS A NAMED REFUSAL, NEVER A SILENT SKIP. The turn loop already forwards every entry of
      // `errors` through its own `fail()` (code/message/hint), so catching here is what turns a policy bug into a
      // refusal the caller can read. Swallowing it would deliver a prompt assembled by a policy that ran halfway -
      // the "declared but ineffective" class this project keeps finding. The code is `VMU_PACK_`-namespaced like the
      // sink-less refusal above (a `VMU_*` code outside that family must be registered in docs/03 §8).
      let out
      try {
        out = p.apply({ settings, turn }) || {}
      } catch (e) {
        errors.push({
          code: 'VMU_PACK_PROMPT_POLICY_FAILED',
          message: 'prompt policy ' + String(p.id) + ' threw while deciding sections: ' + String((e && e.message) || e),
          hint: 'a prompt policy must return {decisions,errors} from apply({settings,turn}); a throwing policy is refused by name rather than skipped (the prompt is not assembled from a half-run policy)',
        })
        continue
      }
      for (const d of out.decisions || []) byName.set(d.name, d)
      for (const de of out.errors || []) errors.push(de)
    }
    return { decisions: [...byName.values()], errors }
  }
}

export function createPackLoader({ kernel, registry = null, allowOverride = false, clock = () => new Date().toISOString(), onPromptPolicy = null, settingSource = null } = {}) {
  const applied = new Map()
  /** PHASE 6 (goal-3 audit P1): the `excludes` list each applied pack declared, so BOTH directions are checkable. */
  const appliedExcludes = new Map()
  /** The mutual-exclusion check used by plan() and apply() alike (one implementation, so they cannot disagree). */
  const exclusionConflicts = (manifest) => {
    const m = manifest && typeof manifest === 'object' ? manifest : {}
    const own = Array.isArray(m.excludes) ? m.excludes.map(String) : []
    const out = []
    for (const [appliedId, list] of appliedExcludes.entries()) {
      if (own.includes(appliedId)) out.push('this pack excludes ' + appliedId + ', which is already applied')
      if (list.includes(String(m.id))) out.push(appliedId + ' excludes this pack, and it is already applied')
    }
    return out
  }
  // Per-pack record of what the settings layer did: applied keys, and keys SHADOWED by a higher layer (D-02).
  const settingsResolution = new Map()

  const snapshot = () => JSON.stringify({
    settings: Object.keys(kernel.settingsSnapshot ? kernel.settingsSnapshot() : {}).sort(),
    bus: kernel.bus.status().entries.map((e) => e.id).sort(),
    packs: kernel.activePacks ? kernel.activePacks().slice().sort() : [],
    aliases: (registry ? registry.status().aliases : []).map((a) => a.from).sort(),
  })

  /**
   * `vmu.pack.compression` — read FOR REAL (task-194) from the running settings layer, per call, so a hot
   * change is honoured. Absent/false ⇒ the raw snapshot is reported (zero-mechanism unchanged).
   */
  /** The running settings snapshot, read per call exactly as compressionOn does (ROUND 296). */
  const settingsNow = () => (typeof kernel.settingsSnapshot === 'function' ? kernel.settingsSnapshot() : null) || {}

  /**
   * ROUND 296 (`vmu.packs.allowKernelOverride`): the declaration that governs the setting-overlap refusal docs/10 §L80 calls O4.
   * An explicit caller flag still wins, because it is the more deliberate act; the declaration is the default.
   */
  const overrideAllowed = () => {
    const snap = settingsNow()
    // TWO DECLARED KEYS, ONE INTENT. `vmu.packs.allowKernelOverride` is the name the pack handbook documents and this
  // loader reads; `vmu.packs.allowOverride` is the name the KERNEL's own settings application reads. Both are declared
  // in the schema and both meant the same thing, so a deployment that declared the documented one had the loader open
  // the first door and the kernel shut the second - with a hint naming the other key. This layer now honours either, so
  // the name a reader finds in the pack volume actually works. Neither is removed: they are two doors to one decision
  // and the finer `activeOverrides` list sits beside them.
  return allowOverride === true || snap['vmu.packs.allowKernelOverride'] === true || snap['vmu.packs.allowOverride'] === true
  }

  /** ROUND 296 (`vmu.packs.priority`): the declared pack priority, used only to order what status() reports. */
  const priorityOf = (manifest) => {
    if (Number.isInteger(manifest && manifest.priority)) return manifest.priority
    const snap = settingsNow()
    return Number.isInteger(snap['vmu.packs.priority']) ? snap['vmu.packs.priority'] : 0
  }

  const compressionOn = () => {
    const snap = typeof kernel.settingsSnapshot === 'function' ? kernel.settingsSnapshot() : null
    return !!snap && snap['vmu.pack.compression'] === true
  }
  /** The snapshot in its PACKED form: exact, reversible, and honest about whether packing actually helped. */
  const snapshotPacked = () => {
    const raw = snapshot()
    const rawBytes = byteLength(raw)
    const on = compressionOn()
    const packed = compressText(raw)
    const helps = packed.length < rawBytes
    const applied = on && helps
    return {
      compression: on, algorithm: 'lzss-12/4', applied, helps,
      rawBytes, candidateBytes: packed.length, packedBytes: applied ? packed.length : rawBytes,
      ratio: Number(((applied ? packed.length : rawBytes) / (rawBytes || 1)).toFixed(4)),
      exact: decompressText(packed) === raw,
      base64: typeof Buffer !== 'undefined' ? Buffer.from(packed).toString('base64') : null,
    }
  }

  const buildPlan = (manifest) => {
    // A non-object manifest is normalised FIRST: `plan(undefined)` used to die on `manifest.settings` with a
    // bare TypeError (a nameless crash instead of a named refusal — the zero-mechanism matrix caught the
    // sibling case in the returned shape below).
    const m = manifest && typeof manifest === 'object' ? manifest : {}
    const problems = validatePack(m)
    // ROUND 20c (task-128): THE PLAN PATH MUST RUN THE RULE VALIDATOR TOO. `validatePack` above is a PURE function
    // that has no kernel, so for an M1 rule it can only require `on` (that line) - while `apply()` compiles every
    // rule through `kernel.rules`, which ADDITIONALLY requires `when` and scans `when.subject` against the kernel's
    // NAMED predicates. So `plan()` answered `problems: []` for manifests `apply()` then refused, and the refusal's
    // own hint promised "every problem" (see the hint below). `kernel.rules.validate(rule)` is the module's own
    // single call that already covers BOTH halves; its comment records that this exact asymmetry was fixed ONCE at
    // the rules layer ("the predicate scan used to live only inside toBusEntries, so validate() said fine") while
    // the pack layer kept bypassing it. The seam is OPTIONAL - a loader built without a kernel keeps the previous
    // behaviour - so this cannot turn a working assembly into a refused one.
    if (kernel && kernel.rules && typeof kernel.rules.validate === 'function') {
      // ROUND 21 (task-130): the rules a manifest DECLARES live in TWO places - `manifest.rules[]` and a
      // `middleware` entry carrying `kind:'rules'` (a shape `validatePack` explicitly allows: "the bus runs `rules`
      // and `module` only"). Both are compiled by `kernel.rules.toBusEntries` in `apply()`, so BOTH must be
      // validated here or `plan` would again promise less than `apply` delivers (and, for the middleware shape, it
      // was worse than a plan/apply asymmetry: such an entry used to never fire at all).
      const declaredRules = [
        ...(m.rules || []),
        ...(m.middleware || []).filter((x) => x && typeof x === 'object' && x.kind === 'rules'),
      ]
      for (const r of declaredRules) {
        if (!r || typeof r !== 'object') continue
        let found = []
        // A validator that THROWS must not be reported as "no problems": the thrown text becomes the problem, so
        // the failure stays visible instead of silently passing the rule.
        try { found = kernel.rules.validate(r) || [] } catch (e) { found = ['the rule validator threw: ' + String(e && e.message)] }
        for (const p of found) problems.push('rule ' + String(r.id === undefined ? '(no id)' : r.id) + ': ' + String(p))
      }
    }
    let requires = null
    if (registry && Array.isArray(m.requires) && m.requires.length > 0) {
      requires = registry.checkPack({ requires: m.requires, packContractVersion: m.packContractVersion })
      if (!requires.ok) {
        problems.push('unmet requirements: ' + JSON.stringify({ missing: requires.missing, tooOld: requires.tooOld, contract: requires.packContractVersion }))
      }
    }
    const actions = []
    for (const [key, value] of Object.entries(m.settings || {})) actions.push({ kind: 'setting', key, value })
    for (const s of m.slots || []) actions.push({ kind: 'slot', id: s.id, capacity: s.capacity || 0 })
    for (const t of m.tracks || []) actions.push({ kind: 'track', name: t })
    for (const r of m.rules || []) actions.push({ kind: 'rule', id: r.id })
    for (const mm of m.middleware || []) actions.push({ kind: 'middleware', id: mm.id, form: mm.kind || 'module' })
    for (const pp of m.promptPolicies || []) actions.push({ kind: 'prompt-policy', id: pp.id, form: 'pipeline', consumer: typeof onPromptPolicy === 'function' ? 'onPromptPolicy' : null })
    for (const a of m.aliases || []) actions.push({ kind: 'alias', from: a.from, to: a.to })
    for (const c of m.codes || []) actions.push({ kind: 'code', code: c })
    // PHASE 6 / P0-10: a declared tool is an ACTION of this pack, so plan() shows it before apply publishes it.
    for (const t of m.tools || []) actions.push({ kind: 'tool', name: t.name })
    // PHASE 6 (goal-3 audit P1): a declared topic is an action too, with the bus as its only consumer.
    for (const topic of m.topics || []) actions.push({ kind: 'topic', name: topic, consumer: 'kernel.bus.declareTopic' })
    // D-03/P1: a declared prompt policy needs a CONSUMER. `plan()` says so rather than letting apply() be the
    // first place the gap appears; it stays a warning (not a problem) because the manifest is well-formed —
    // what is missing is the assembly's sink, which the caller may add before applying.
    const warnings = []
    if ((m.promptPolicies || []).length > 0 && typeof onPromptPolicy !== 'function') {
      warnings.push('this loader has no onPromptPolicy sink, so applying would refuse by name (VMU_PACK_PROMPT_POLICY_UNCONSUMED); pass onPromptPolicy(policy) when constructing the pack loader')
    }
    /**
     * ROUND 136: a pack may carry the prompt TEXT it needs - the v5r pack does - and until this block existed the
     * field would have been dropped IN SILENCE, because `validatePack` does not police extra keys and docs/10 §
     * says so in as many words. That is precisely the "declaration with no effect" this project keeps finding, so
     * the field is now VALIDATED (it must name a module, a source and a count) and it appears in the plan as an
     * action of its own: a loader, and a reader of the plan, can both see that the pack carries text and how much.
     */
    if (m.prompts) {
      const pp = m.prompts
      const count = Number(pp.count)
      if (typeof pp.module !== 'string' || pp.module.trim() === '') problems.push('prompts.module must be a module specifier')
      if (typeof pp.source !== 'string' || pp.source.trim() === '') problems.push('prompts.source must name where the text came from')
      if (!Number.isInteger(count) || count < 0) problems.push('prompts.count must be a non-negative integer (got ' + JSON.stringify(pp.count) + ')')
      actions.push({
        kind: 'prompts', module: String(pp.module || ''),
        count: Number.isInteger(count) ? count : 0, source: String(pp.source || ''),
        chars: Number.isInteger(Number(pp.chars)) ? Number(pp.chars) : null,
      })
    }
    // PHASE 6 (goal-3 audit P1): a pack's excluded peers must be checked in BOTH directions (the applied pack may
    // name this one instead). Every conflict is a named problem, so plan() reports it before apply() refuses.
    const exclusionProblems = exclusionConflicts(m)
    for (const p of exclusionProblems) problems.push('EXCLUDES: ' + p)
    // THE NAMED REFUSAL (task-159): a plan that cannot be built is a refusal and MUST carry a code —
    // `{ ok:false, problems:[…] }` without one left the caller holding a nameless error (the matrix finding).
    // The code is the SAME one `apply()` uses for the very same `problems` (module consistency), and the
    // nested `refused{}` mirrors the house style of returned refusals elsewhere in the kernel.
    // An EXCLUDES conflict is a pack conflict (the registered code for "two packs cannot coexist"), not a missing pack.
    const ok = problems.length === 0
    const code = ok ? null : (exclusionProblems.length > 0 ? 'VMU_PACK_CONFLICT' : 'VMU_PACK_MISSING')
    const message = ok ? null : 'pack ' + String(m.id === undefined ? '(no id)' : m.id) + ' cannot be planned: ' + problems.join('; ')
    const hint = ok ? null : (exclusionProblems.length > 0
      ? 'the two packs declare each other (or one declares the other) in `excludes`; unload the applied one first - a coexistence would silently replace tracks/slots and run two institutions at once'
      : 'fix the manifest problems they are listed in `problems`; plan() is PURE (nothing was applied)')
    return {
      ok, code, message, hint,
      refused: ok ? null : { code, message, hint },
      id: m.id, version: m.version || null, problems, warnings, requires, actions,
      count: actions.length, wouldTouch: actions.map((a) => a.kind).filter((v, i, arr) => arr.indexOf(v) === i),
    }
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
      // ROUND 496: pack/loading and pack/loaded were frozen WITH default policies and nothing emitted them, so "pack-loading
      // intervention" was a paper capability. loading fires before any change is made and MAY refuse; loaded fires after.
      const busOf = () => (kernel && kernel.bus && typeof kernel.bus.emit === 'function' ? kernel.bus : null)
      const bus = busOf()
      if (bus) {
        const pre = await bus.emit('pack/loading', { id: manifest && manifest.id, manifest }, {})
        if (pre && pre.ok === false) throw refuse((pre.refused && pre.refused.code) || pre.code || 'VMU_PACK_CONFLICT', (pre.refused && pre.refused.message) || pre.message || 'a middleware refused pack/loading', (pre.refused && pre.refused.hint) || null)
      }
      const plan = buildPlan(manifest)
      if (!plan.ok) {
        throw refuse(plan.code || 'VMU_PACK_MISSING', 'pack ' + String(manifest && manifest.id) + ' cannot be applied: ' + plan.problems.join('; '),
          // ROUND 20c (task-128): this hint used to promise "it reports EVERY problem" - and that was false in
          // both directions: before the fix `plan` did not even run the M1 rule validator (see `buildPlan`), and
          // it still cannot see a middleware MODULE's problems, which only `kernel/loader` finds at apply time
          // (measured: `plan` is clean while apply refuses with `invalid M2 module … hook … must be a function`).
          // A hint that promises more than the verb can do is the same defect class as the code it explains.
          'run plan() first: it reports the manifest problems it can SEE without changing anything (validatePack plus the M1 rule validator, kernel.rules.validate); a middleware MODULE is validated by kernel/loader at apply time, so that half can still refuse later')
      }
      if (applied.has(manifest.id)) {
        throw refuse('VMU_PACK_CONFLICT', 'pack ' + manifest.id + ' is already applied', 'unload it before applying again (O4)')
      }
      const undo = []
      const runAll = async () => {
      // Settings are a LAYER, not a mutation: if this assembly gives no way to apply a pack's settings,
      // the pack is refused rather than silently losing them (a silently dropped setting is a lie).
      if (Object.keys(manifest.settings || {}).length > 0) {
      // D-02 — ONE PRIORITY (`pack 默认 < preset Config < 会话 settings < 运行时 set`). With a per-key source
      // seam (`settingSource`) a key already owned by a HIGHER layer is SHADOWED: that layer wins, nothing is
      // silently overwritten (so O4 stays intact), and status() reports it. A key owned by ANOTHER pack (or by
      // the pack-defaults layer) is a REAL conflict and is refused by name. Without the seam the previous
      // conservative behaviour is kept unchanged: any overlap is a named refusal unless overrides are declared.
      const snapBefore = settingsNow()
      const overlapping = Object.keys(manifest.settings).filter((k) => Object.prototype.hasOwnProperty.call(snapBefore, k))
      const force = overrideAllowed()
      const shadowed = []
      const conflicts = []
      if (!force) {
        for (const key of overlapping) {
          const rank = settingLayerRank(typeof settingSource === 'function' ? settingSource(key) : null)
          if (rank !== null && rank > 1) shadowed.push({ key, value: snapBefore[key], source: String(settingSource(key)) })
          else if (rank === 0) { /* schema default: the pack layer sits ABOVE it, so the pack value applies */ }
          else conflicts.push(key)
        }
      }
      if (conflicts.length > 0 && !force) {
        throw refuse('VMU_PACK_CONFLICT', 'pack ' + manifest.id + ' overlaps existing settings: ' + conflicts.join(', '),
          'declare vmu.packs.allowKernelOverride=true (or pass { allowOverride: true }) to allow the override (O4: never silently)')
      }
        if (typeof kernel.applyPackSettings !== 'function') {
          throw refuse('VMU_ENGINE_UNAVAILABLE', 'pack ' + manifest.id + ' declares settings but this kernel has no settings layer for packs',
            'construct the kernel with a pack-settings layer, or move the values into the pack manifest\'s slots/tracks/rules')
        }
        const shadowedKeys = new Set(shadowed.map((s) => s.key))
        const toApply = Object.fromEntries(Object.entries(manifest.settings).filter(([k]) => !shadowedKeys.has(k)))
        if (Object.keys(toApply).length > 0) {
          const res = kernel.applyPackSettings(toApply, { by: manifest.id })
          undo.push(() => {
            for (const key of res.applied) {
              if (Object.prototype.hasOwnProperty.call(res.previous, key) && kernel.setSettingsValue) kernel.setSettingsValue(key, res.previous[key])
              else if (kernel.unsetSettingsValue) kernel.unsetSettingsValue(key)
            }
          })
        }
        settingsResolution.set(manifest.id, {
          applied: Object.keys(toApply).map((k) => ({ key: k, value: toApply[k], source: 'pack:' + manifest.id })),
          shadowed: shadowed.slice(),
        })
      }
      // PHASE 6 (goal-3 audit P1): declare this pack's protocol topics BEFORE its middleware is loaded, because the
      // loader's `isRegisteredHook()` consults the process-wide declared-topic set. The undo retracts exactly this
      // pack's ownership, so an unload leaves no topic registered (and a later kernel in the same process does not
      // inherit it). A pack that declares topics on a bus without that capability is refused by name.
      const declaredTopics = Array.isArray(manifest.topics) ? manifest.topics : []
      if (declaredTopics.length > 0) {
        if (!kernel.bus || typeof kernel.bus.declareTopic !== 'function' || typeof kernel.bus.retractTopicsOwnedBy !== 'function') {
          throw refuse('VMU_ENGINE_UNAVAILABLE', 'pack ' + manifest.id + ' declares topics but this kernel bus cannot declare/retract them',
            'use the kernel bus from kernel/index.js (declareTopic/retractTopicsOwnedBy), or drop the topics field')
        }
        const topicOwner = manifest.id + '#' + (++topicOwnerSeq)
        for (const topic of declaredTopics) kernel.bus.declareTopic(topic, { by: topicOwner })
        undo.push(() => kernel.bus.retractTopicsOwnedBy(topicOwner))
      }
      for (const s of manifest.slots || []) {
        if (!kernel.declareSlots) throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel cannot declare role slots')
        kernel.declareSlots((manifest.slots || []))
        undo.push(() => kernel.declareSlots([]))
        break // declaring is atomic for the whole list; one undo entry is enough
      }
      for (const t of manifest.tracks || []) {
        if (!kernel.declareTracks) continue
        kernel.declareTracks(manifest.tracks)
        // PHASE 6 (goal-3 audit, half-built pair): slots had an undo and tracks did not, so an unload left the
        // rebuilt library in place. The kernel restores its construction-time tracks and this is the reverse entry.
        if (typeof kernel.retractTracks === 'function') undo.push(() => kernel.retractTracks())
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
        // ROUND 10 (Lead ruling (a), core's `api.services` seam): a manifest middleware entry comes in TWO shapes.
        //   · INLINE (`{ on, handler }`) - the historical shape: the bus gets the handler as-is. Its handler sees
        //     the bus envelope only (`{ hook, payload, ctx, dryRun, traceId, setting }`), so it can DECIDE but
        //     cannot reach a service.
        //   · MODULE (`{ module: { meta, capabilities, hooks } }`, or a `file` with an importer) - must go through
        //     `kernel/loader`, which validates apiVersion/capabilities/hooks AND hands the handler `api` -
        //     including the capability-gated `api.services.get(name)` seam. Adding such an entry straight to the
        //     bus would give it no `api` at all (and `bus.add` would refuse it for lacking a handler), so a pack
        //     could never implement an institution policy that has to ACT (e.g. "a stalled institute convenes").
        // The entry keeps its own `order`/`failure`; the loader turns one module into one bus entry per hook.
        // ROUND 21 (task-130): A `kind:'rules'` MIDDLEWARE ENTRY IS AN M1 RULE, NOT A RAW BUS ENTRY. It used to fall
        // through to `bus.add(rawEntry)` below - and `kernel/bus.js` EXEMPTS `kind:'rules'` from its "must have a
        // handler" rule, so the entry landed on the bus with NO handler: at emit time the bus only recorded
        // `audit({what:'middleware/skipped', why:'no handler attached'})` and the rule NEVER FIRED - not even when it
        // was perfectly valid. Measured independently by two people (two predicates x two emit modes): the same rule
        // in `rules[]` denies by name, the same rule declared here stays silent, while its entry really is on the bus.
        // (The two deny codes that experiment used are probe FIXTURES, not codes this file can throw, so they are
        // deliberately NOT written as literals here: a quoted code in a comment reads as "this file can throw it",
        // and the doc gate that polices registered codes scans the whole file text. See the gate note in the report.)
        // That is a "declared but ineffective" policy - the class this project keeps catching. It now goes
        // through the SAME call `manifest.rules` uses above, so one route validates, compiles, and hands the bus a
        // real handler.
        // ★ THIS IS A BEHAVIOUR CHANGE (such rules now really fire). Accepted because NO shipped pack uses this shape:
        // their `kind:'rules'` fields live INSIDE `rules[]` entries, and `middleware[]` has zero of them (measured).
        if (m && typeof m === 'object' && m.kind === 'rules') {
          if (!kernel.rules || typeof kernel.rules.toBusEntries !== 'function') {
            throw refuse('VMU_ENGINE_UNAVAILABLE', 'pack ' + manifest.id + ' declares an M1 rule as a middleware entry (' + String(m.id) + ') but this kernel has no rules engine',
              'the rules engine compiles a rule into its bus entry; without it the entry would reach the bus with no handler and silently never fire')
          }
          const entries = kernel.rules.toBusEntries([m])
          for (const e of entries) {
            kernel.bus.add(e)
            undo.push(() => removeEntry(kernel.bus, e.id))
          }
          continue
        }
        const isModuleShape = m && typeof m === 'object' && !m.handler && (m.module !== undefined || typeof m.file === 'string')
        if (isModuleShape) {
          if (!kernel.loader || typeof kernel.loader.toBusEntries !== 'function') {
            throw refuse('VMU_ENGINE_UNAVAILABLE', 'pack ' + manifest.id + ' declares an M2 module (' + String(m.id) + ') but this kernel has no loader',
              'an inline { on, handler } entry needs no loader; a module-shaped entry does, because only the loader attaches `api` (and the service seam)')
          }
          // ROUND 20 (task-125): `kind` IS OPTIONAL AND DEFAULTS TO `module` - `validatePack` above decides the
          // shape with `m.kind === undefined ? 'module' : m.kind`, and the manifest table documents the field as
          // `kind?`. But the loader refuses anything that does not SAY `kind: 'module'` (kernel/loader.js), so
          // handing the raw entry over made the documented default INEFFECTIVE: every module-shaped middleware
          // entry that omitted `kind` was refused by name, and because a module is the only shape that ever gets
          // `api` (and so `api.services`), an inline pack could not carry a policy that has to ACT. The entry's own
          // `config.modules` path already normalises exactly this way, so the default is applied here too.
          const spec = m.kind === undefined ? Object.assign({ kind: 'module' }, m) : m
          const entries = await kernel.loader.toBusEntries([spec])
          for (const e of entries) {
            kernel.bus.add(e)
            undo.push(() => removeEntry(kernel.bus, e.id))
          }
          continue
        }
        const entry = Object.assign({}, m)
        kernel.bus.add(entry)
        undo.push(() => removeEntry(kernel.bus, entry.id))
      }
      // PHASE 6 / P0-10 — THE PACK DECLARES ITS TOOL FACE, the kernel holds it, the host publishes it. One call for
      // the whole list (declaring is atomic) and one undo entry, so an unload removes exactly what apply added.
      for (const t of manifest.tools || []) {
        if (typeof kernel.declarePackTools !== 'function') {
          throw refuse('VMU_ENGINE_UNAVAILABLE', 'pack ' + manifest.id + ' declares tools but this kernel cannot hold tool declarations',
            'construct the kernel with declarePackTools() (kernel/index.js), or drop the tools field')
        }
        const declared = kernel.declarePackTools(manifest.tools, { by: manifest.id })
        undo.push(() => { const r = kernel.retractPackTools(declared.declared, { by: manifest.id }); return r && r.hostRetract ? r.hostRetract : undefined })
        break // one call declares the whole list; one undo entry is enough
      }
      // D-03/P1 — A DECLARED PROMPT POLICY IS CONSUMED, OR THE PACK IS REFUSED BY NAME. These entries are not
      // bus entries (their hook is the prompt pipeline's `prompt/section-assembled` path, not a bus hook); the
      // loader hands each one to the assembly's `onPromptPolicy` sink, which registers it into the section
      // policy the turn loop consults. A sink-less loader refusing is what keeps this from being a paper form.
      const promptPolicies = Array.isArray(manifest.promptPolicies) ? manifest.promptPolicies : []
      if (promptPolicies.length > 0) {
        if (typeof onPromptPolicy !== 'function') {
          throw refuse('VMU_PACK_PROMPT_POLICY_UNCONSUMED',
            'pack ' + manifest.id + ' declares prompt policies (' + promptPolicies.map((p) => p.id).join(', ') + ') but this loader has no prompt-policy consumer',
            'pass onPromptPolicy(policy) when constructing the pack loader, and compose the collected policies into the section policy the turn loop consults (kernel/pack.js composePromptPolicies)')
        }
        for (const policy of promptPolicies) {
          const dispose = onPromptPolicy(policy)
          undo.push(() => { if (typeof dispose === 'function') dispose() })
        }
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
      // ROUND 496: the other half of the paper capability - pack/loaded fires once every manifest is in place.
      if (bus) await bus.emit('pack/loaded', { id: manifest && manifest.id, applied: plan.count }, {})
      } catch (e) {
        for (const undoOne of undo.slice().reverse()) { try { undoOne() } catch { /* best effort during rollback */ } }
        throw e
      }
      const resolution = settingsResolution.get(manifest.id) || { applied: [], shadowed: [] }
      const record = { id: manifest.id, version: manifest.version || null, appliedAt: clock(), actions: plan.actions, undo, priority: priorityOf(manifest), resolution }
      applied.set(manifest.id, record)
      appliedExcludes.set(manifest.id, Array.isArray(manifest.excludes) ? manifest.excludes.map(String) : [])
      if (kernel.notePackApplied) kernel.notePackApplied(manifest.id)
      return { ok: true, id: manifest.id, applied: plan.count, actions: plan.actions, requires: plan.requires,
        settings: { applied: resolution.applied.length, shadowed: resolution.shadowed.slice() },
        promptPolicies: (Array.isArray(manifest.promptPolicies) ? manifest.promptPolicies : []).map((p) => p.id) }
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
      appliedExcludes.delete(id)
      settingsResolution.delete(id)
      if (kernel.notePackUnloaded) kernel.notePackUnloaded(id)
      return { ok: failures.length === 0, id, reversed: record.actions.length, failures, residueFree: failures.length === 0 }
    },

    /** Observability (R11): what is applied, what each pack changed, and every key's SOURCE LAYER (D-02). */
    status() {
      const snap = settingsNow()
      const resolved = {}
      for (const key of Object.keys(snap).sort()) {
        const source = typeof settingSource === 'function' ? settingSource(key) : null
        resolved[key] = { value: snap[key], source: source === null || source === undefined ? 'unreported' : String(source), rank: settingLayerRank(source) }
      }
      return {
        // ROUND 296: ordered by the declared priority (higher first), then by id, so the report is deterministic.
      applied: [...applied.values()]
        .map((r) => ({ id: r.id, version: r.version, at: r.appliedAt, actions: r.actions.length, priority: r.priority,
          settingsApplied: r.resolution ? r.resolution.applied.length : 0, settingsShadowed: r.resolution ? r.resolution.shadowed.length : 0 }))
        .sort((a, b) => (b.priority - a.priority) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      allowKernelOverride: overrideAllowed(),
        allowOverride,
        // D-02: the ONE priority, and the per-key view a reader can diff. `layers` is low -> high.
        layers: SETTING_LAYERS.slice(),
        settings: { resolved, shadowed: [...settingsResolution.values()].flatMap((r) => r.shadowed) },
        snapshot: snapshotPacked(),
        note: 'plan() is pure; apply() refuses conflicts; unload() reverses the applied actions and reports residue; `snapshot.compression` reports vmu.pack.compression (LZSS-12/4, exact); `settings.resolved` reports each key\'s source layer (D-02)',
      }
    },

    /** The packed snapshot on demand (same contract as status().snapshot: exact and honest about savings). */
    packed: () => snapshotPacked(),

    /** The snapshot helper used by the residue test: two equal snapshots mean "no residue". */
    snapshot,
  }
}
