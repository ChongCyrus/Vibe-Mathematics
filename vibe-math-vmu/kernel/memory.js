// vmu kernel · memory — institutional memory: lessons, anti-patterns, facts, preferences (docs/17 §9).
//
// Design source: docs/17-agent-society-and-delegation.md §9 (memory & knowledge; experience cards, freshness,
// contradictions, "memory is not authority") and §21.2 (the VMU_MEMORY_* codes). Records live in the 07 ledger
// track — this module only REFERS to 07 (`library` seam) and never redefines it.
//
// FOUR HARD INVARIANTS (each one is a refusal or an explicit flag, never a silent behaviour):
//   ① MEMORY NEVER AUTHORIZES — `may()`/`authorize()` ALWAYS refuse by name (`VMU_MEMORY_NOT_AUTHORITY`, S-3).
//   ② CONTRADICTIONS ARE NEVER SILENT — a conflicting entry is reported by `contradictions()`, blocked, or
//      auto-superseded, according to `vmu.memory.contradictionPolicy` (report | block | supersede).
//   ③ EXPIRY SELF-DISCLOSES — `recall()` marks `stale:true`, and excluding stale rows is COUNTED
//      (`excludedStale`), never a silent omission.
//   ④ `supersede()` NEEDS A REASON (`vmu.memory.supersedeNeedsReason`) ⇒ `VMU_REASON_REQUIRED`.
// Invariants (same set as the rest of the kernel — board.js / metrics.js / delegation.js / arbitration.js / charter.js):
//   · every refusal is NAMED (VMU_* + hint) — never a bare exception
//   · every upper bound reports how many items were DROPPED — never silent (recall/list/contradictions/history)
//   · zero mechanism: with no entries every READ answers empty and nothing throws; `record()` works on defaults
//   · the only time source is the injected `clock`; ids are deterministic (`m-1`, …); no randomness
//   · READ paths (recall/contradictions/list/history/status/may) never mutate the ledger
// SETTINGS READ CONVENTION (kernel/guard.js): every key is read as a PLAIN LITERAL — the settings table and the
// docs audit both discover "wired" keys by scanning file text for the literal.
export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

const K_CARD_KINDS = 'vmu.memory.cardKinds'
const K_KINDS = 'vmu.memory.kinds'
const K_REQUIRE_EVIDENCE = 'vmu.memory.requireEvidence'
const K_REQUIRE_SOURCE = 'vmu.memory.requireSource'
const K_MAX_CARDS = 'vmu.memory.maxCards'
const K_MAX_ENTRIES = 'vmu.memory.maxEntries'
const K_CARD_TTL = 'vmu.memory.cardTtlMs'
const K_TTL = 'vmu.memory.ttlMs'
const K_VISIBILITY = 'vmu.memory.visibility'
const K_SCOPE_REQUIRED = 'vmu.memory.scopeRequired'
const K_SCOPE_DEFAULT = 'vmu.memory.scopeDefault'
const K_CONTRADICTION = 'vmu.memory.contradictionPolicy'
const K_NEVER_DROP = 'vmu.memory.neverDropKinds'
const K_KEEP_EVERY = 'vmu.memory.keepEvery'
const K_COMPACTION_EVERY = 'vmu.memory.compactionEveryMs'
const K_SUPERSEDE_REASON = 'vmu.memory.supersedeNeedsReason'

const DEFAULT_KINDS = Object.freeze(['lesson', 'antipattern', 'fact', 'preference', 'obstacle', 'rejected'])
const SCOPES = Object.freeze(['institution', 'team', 'agent'])
const VISIBILITIES = Object.freeze(['private', 'institution', 'public'])
const POLICIES = Object.freeze(['report', 'block', 'supersede'])
const DEFAULT_LIST_CAP = 200

/** createMemory — the institutional memory ledger. `library` (07) and `trust` (17 §5) are optional seams. */
export function createMemory({ clock = () => 0, log = null, settings = {}, bus = null, library = null, trust = null } = {}) {
  if (typeof clock !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createMemory needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
  }

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (event) => {
    if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* logging must never break the memory it records */ } }
  }

  const kindsRaw = sget(K_CARD_KINDS, null)
  const kindsAlias = sget(K_KINDS, null)
  const kinds = strList(kindsRaw).length ? strList(kindsRaw) : (strList(kindsAlias).length ? strList(kindsAlias) : DEFAULT_KINDS.slice())
  const requireEvidence = sget(K_REQUIRE_EVIDENCE, true) !== false
  const requireSource = sget(K_REQUIRE_SOURCE, false) === true
  const maxCardsRaw = sget(K_MAX_CARDS, null)
  const maxEntries = nonNegInt(maxCardsRaw !== null ? maxCardsRaw : sget(K_MAX_ENTRIES, 0), 0)
  const ttlRaw = sget(K_CARD_TTL, null)
  const ttlDefault = nonNegInt(ttlRaw !== null && ttlRaw !== 0 ? ttlRaw : sget(K_TTL, 0), 0)
  const visibilityRaw = sget(K_VISIBILITY, 'institution')
  const defaultVisibility = VISIBILITIES.includes(visibilityRaw) ? visibilityRaw : 'institution'
  const scopeRequired = sget(K_SCOPE_REQUIRED, true) !== false
  const scopeDefaultRaw = sget(K_SCOPE_DEFAULT, 'institution')
  const scopeDefault = SCOPES.includes(scopeDefaultRaw) ? scopeDefaultRaw : 'institution'
  const policyRaw = sget(K_CONTRADICTION, 'report')
  const contradictionPolicy = POLICIES.includes(policyRaw) ? policyRaw : 'report'
  const neverDropKinds = strList(sget(K_NEVER_DROP, ['rejected', 'obstacle']))
  const keepEverySetting = nonNegInt(sget(K_KEEP_EVERY, 0), 0)
  const compactionEveryMs = nonNegInt(sget(K_COMPACTION_EVERY, 0), 0)
  const supersedeNeedsReason = sget(K_SUPERSEDE_REASON, true) !== false

  function strList(v) { return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [] }
  function nonNegInt(v, def) { return Number.isInteger(v) && v >= 0 ? v : def }

  // ── state (mutated only by record/supersede/expire/compact) ────────────────────────────────────────
  const entries = new Map()
  const order = []
  const historyRows = []
  const droppedHistory = { n: 0 }
  const refusals = new Map()
  const unwired = new Map()
  const declaredTopics = new Set()
  let seq = 0

  const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by)
  const objOf = (map) => { const o = {}; for (const k of [...map.keys()].sort()) o[k] = map.get(k); return o }
  const sumOf = (map) => [...map.values()].reduce((a, b) => a + b, 0)
  const now = () => clock()
  const entryOf = (id) => entries.get(id) || null

  const deny = (code, message, hint) => {
    bump(refusals, code, 1)
    say({ type: 'memory/refused', at: now(), code, message })
    return refuse(code, message, hint)
  }
  const record_ = (row) => {
    historyRows.push(Object.assign({ at: now() }, row))
    while (historyRows.length > DEFAULT_LIST_CAP) { historyRows.shift(); droppedHistory.n += 1 }
  }
  const fire = (hook, payload) => {
    if (!bus || typeof bus.emit !== 'function') { bump(unwired, 'bus:' + hook, 1); return }
    try {
      if (!declaredTopics.has(hook) && typeof bus.declareTopic === 'function') { bus.declareTopic(hook); declaredTopics.add(hook) }
      bus.emit(hook, Object.assign({ at: now() }, payload))
      declaredTopics.add(hook)
    } catch (e) {
      bump(unwired, 'bus:' + hook, 1)
      say({ type: 'memory/hook-unwired', at: now(), hook, why: String((e && e.message) || e) })
    }
  }
  const norm = (text) => String(text).trim().toLowerCase().replace(/\s+/g, ' ')
  const isStale = (e, at = now()) => typeof e.expiresAt === 'number' && at >= e.expiresAt
  /** "Live" = not superseded and not expired (stale rows are still returned, but flagged). */
  const isLive = (e, at = now()) => e.state === 'active' && !isStale(e, at)
  const stateOf = (e, at = now()) => (e.state === 'superseded' ? 'superseded' : (e.state === 'expired' || isStale(e, at) ? 'expired' : 'active'))
  const view = (e, at = now()) => ({
    id: e.id, kind: e.kind, text: e.text, by: e.by, scope: e.scope, visibility: e.visibility,
    tags: e.tags.slice(), evidence: e.evidence.slice(), recordedAt: e.recordedAt, expiresAt: e.expiresAt,
    stale: isStale(e, at), state: stateOf(e, at),
    supersededAt: e.supersededAt, supersededBy: e.supersededBy, supersedeReason: e.supersedeReason,
  })
  const liveSameKey = (kind, scope, exceptId = null) => order
    .map((id) => entries.get(id))
    .filter((e) => e && e.id !== exceptId && e.kind === kind && e.scope === scope && isLive(e))
  /** Deterministic contradiction pairs: same scope+kind, both live, different normalised text. */
  const pairList = () => {
    const out = []
    const keys = new Map()
    for (const id of order) {
      const e = entries.get(id)
      if (!e || !isLive(e)) continue
      const key = e.scope + '|' + e.kind
      if (!keys.has(key)) keys.set(key, [])
      keys.get(key).push(e)
    }
    for (const key of [...keys.keys()].sort()) {
      const list = keys.get(key)
      for (let i = 0; i < list.length; i++) {
        for (let k = i + 1; k < list.length; k++) {
          if (norm(list[i].text) === norm(list[k].text)) continue
          out.push({ a: list[i].id, b: list[k].id, scope: list[i].scope, kind: list[i].kind, detectedAt: Math.max(list[i].recordedAt, list[k].recordedAt) })
        }
      }
    }
    return out
  }
  /** INVARIANT ①: the refusal is a closure (not a method), so `may` and `authorize` cannot drift apart. */
  const refuseAuthority = (opts = {}) => {
    const actor = opts && opts.actor !== undefined ? String(opts.actor) : 'null'
    const action = opts && opts.action !== undefined ? String(opts.action) : 'null'
    throw deny('VMU_MEMORY_NOT_AUTHORITY', 'memory never authorizes: may(' + actor + ', ' + action + ') is refused (S-3)',
      'S-3: authority comes from the seat (kernel/members.js may) or a delegation (kernel/delegation.js) — a remembered fact, preference or anti-pattern confers nothing (docs/17 §9)')
  }

  return {
    apiVersion,

    /**
     * INVARIANT ①: memory NEVER authorizes. This method exists so the rule is machine-checkable: every call
     * refuses by name. Authority comes from a SEAT (the members surface) or a delegation - never from a memory.
     * (The seat key is spelled here WITHOUT quotes on purpose: the wired-key detector scans quoted literals, and
     *  quoting it would make the settings table claim this module READS a key it does not read.)
     */
    may({ actor = null, action = null, scope = null } = {}) {
      return refuseAuthority({ actor, action, scope })
    },

    /** Alias of `may()` — kept because callers may reach for "authorize" first; the refusal is identical. */
    authorize(opts = {}) {
      return refuseAuthority(opts)
    },

    /** Record a card. Contradictions are handled per `vmu.memory.contradictionPolicy` (never silently). */
    record({ kind, text, by, evidence = null, scope = null, visibility = null, ttlMs = null, tags = null, supersedes = null } = {}) {
      if (typeof kind !== 'string' || !kind) throw deny('VMU_INVALID_ARGUMENT', 'record needs a non-empty `kind`', 'declared kinds: ' + kinds.join(', '))
      if (!kinds.includes(kind)) throw deny('VMU_MEMORY_CARD_INVALID', 'unknown memory kind: ' + kind, 'declared kinds: ' + kinds.join(', ') + ' (vmu.memory.cardKinds / vmu.memory.kinds)')
      if (typeof text !== 'string' || !text.trim()) throw deny('VMU_MEMORY_CARD_INVALID', 'record needs a non-empty text', 'a card without a statement cannot be recalled (docs/17 §9)')
      if (typeof by !== 'string' || !by.trim()) throw deny('VMU_MEMORY_CARD_INVALID', 'record needs a non-empty `by` (who learned it)', 'every card names its author (auditability)')
      // `scopeRequired=true` means an EXPLICIT scope must be given; the default only fills the gap when the
      // requirement is relaxed (otherwise a "scoped" memory would silently become the default scope).
      if (scopeRequired && (scope === null || typeof scope !== 'string' || !scope.trim())) {
        throw deny('VMU_MEMORY_KEY_UNSCOPED', 'a memory entry needs an explicit scope (vmu.memory.scopeRequired=true)',
          'pass scope: one of ' + SCOPES.join(', ') + ' — the scope is what keeps memories from bleeding across agents and institutions')
      }
      const sc = scope === null ? scopeDefault : scope
      if (typeof sc !== 'string' || !SCOPES.includes(sc)) throw deny('VMU_INVALID_ARGUMENT', 'unknown scope: ' + String(sc), 'declared scopes: ' + SCOPES.join(', '))
      const vis = visibility === null ? defaultVisibility : visibility
      if (!VISIBILITIES.includes(vis)) throw deny('VMU_INVALID_ARGUMENT', 'unknown visibility: ' + String(vis), 'declared: ' + VISIBILITIES.join(', '))
      const ev = evidence === null ? [] : (Array.isArray(evidence) ? strList(evidence) : (typeof evidence === 'string' && evidence ? [evidence] : []))
      if ((requireEvidence || requireSource) && ev.length === 0) {
        throw deny('VMU_MEMORY_CARD_INVALID', 'this card needs evidence (vmu.memory.requireEvidence=true' + (requireSource ? ' / vmu.memory.requireSource=true' : '') + ')',
          'pass evidence: ["<library id>"] — an unsourced memory is an opinion (docs/17 §9)')
      }
      if (ev.length && library && typeof library.list === 'function') {
        try {
          const known = new Set((library.list() || []).map((r) => (r && (r.id || r.key)) || null).filter(Boolean))
          const unknown = ev.filter((x) => !known.has(x))
          if (unknown.length) throw deny('VMU_MEMORY_CARD_INVALID', 'unknown library evidence: ' + unknown.join(', '), 'known ids: ' + ([...known].join(', ') || '(none)'))
        } catch (e) {
          if (e && e.code) throw e
          bump(unwired, 'library-seam', 1)   // a seam that cannot answer is a COUNTED wiring gap
        }
      }
      const ttl = ttlMs === null ? ttlDefault : ttlMs
      if (!(Number.isInteger(ttl) && ttl >= 0)) throw deny('VMU_INVALID_ARGUMENT', 'ttlMs must be an integer >= 0 (0 = never expires)', 'omit it to use vmu.memory.cardTtlMs / vmu.memory.ttlMs')
      if (maxEntries > 0 && countLive() >= maxEntries) {
        throw deny('VMU_STATE', 'the memory is full: ' + countLive() + '/' + maxEntries + ' live entries (vmu.memory.maxCards / vmu.memory.maxEntries)',
          'supersede or expire stale cards, or raise the cap — forgetting must be explicit (never a silent eviction)')
      }
      const t = now()
      const id = 'm-' + (++seq)
      const e = {
        id, kind: String(kind), text: String(text), by: String(by), scope: sc, visibility: vis,
        tags: strList(tags), evidence: ev, recordedAt: t,
        expiresAt: ttl > 0 ? t + ttl : null, state: 'active',
        supersededAt: null, supersededBy: null, supersedeReason: null,
      }
      const sameKey = liveSameKey(e.kind, e.scope)
      const conflicts = sameKey.filter((other) => norm(other.text) !== norm(e.text))
      const autoSuperseded = []
      // Validate the explicit `supersedes` targets BEFORE inserting, so a refused call changes nothing.
      const supersedeTargets = supersedes === null ? [] : (Array.isArray(supersedes) ? strList(supersedes) : [supersedes])
      for (const sid of supersedeTargets) {
        if (!entryOf(sid)) throw deny('VMU_NO_SUCH_OBJECT', 'cannot supersede unknown entry: ' + String(sid), 'known: ' + (order.join(', ') || '(none)'))
      }
      if (conflicts.length && contradictionPolicy === 'block') {
        // An EXPLICIT `supersedes` list is the sanctioned way through a block: the older card is named and
        // replaced. Only UNRESOLVED contradictions are refused.
        const unresolved = conflicts.filter((other) => !supersedeTargets.includes(other.id))
        if (unresolved.length) {
          throw deny('VMU_STATE', 'a contradicting ' + kind + ' already exists in scope ' + sc + ': ' + unresolved.map((x) => x.id + ' ("' + x.text.slice(0, 40) + '")').join(', '),
            'vmu.memory.contradictionPolicy=block — supersede the older card explicitly with supersede({ id, by, reason }) or pass supersedes: [<id>], or switch the policy to report/supersede')
        }
      }
      if (conflicts.length && contradictionPolicy === 'supersede') {
        for (const other of conflicts) {
          other.state = 'superseded'; other.supersededAt = t; other.supersededBy = id
          other.supersedeReason = 'auto: contradictionPolicy=supersede (new card ' + id + ')'
          autoSuperseded.push(other.id)
          record_({ type: 'memory/superseded', id: other.id, by: 'system', why: other.supersedeReason, auto: true })
        }
      }
      entries.set(id, e)
      order.push(id)
      for (const sid of supersedeTargets) {
        const old = entryOf(sid)
        old.state = 'superseded'; old.supersededAt = t; old.supersededBy = id; old.supersedeReason = 'replaced by ' + id
        record_({ type: 'memory/superseded', id: old.id, by: e.by, why: old.supersedeReason, auto: false })
      }
      record_({ type: 'memory/recorded', id, kind: e.kind, scope: e.scope, by: e.by, contradictions: conflicts.map((x) => x.id), autoSuperseded })
      say({ type: 'memory/recorded', at: t, id, kind: e.kind, scope: e.scope, by: e.by })
      fire('memory/recorded', { id, kind: e.kind, scope: e.scope })
      return {
        ok: true, id, kind: e.kind, scope: e.scope, visibility: e.visibility, recordedAt: t, expiresAt: e.expiresAt,
        contradictions: conflicts.map((x) => x.id), policy: contradictionPolicy, autoSuperseded, at: t,
      }
    },

    /**
     * Recall cards. INVARIANT ③: stale rows are returned with `stale:true`; excluding them is COUNTED.
     * Visibility is enforced without silent omission: what is filtered out is reported by count.
     */
    recall({ query = null, tags = null, kind = null, scope = null, actor = null, limit = 100, includeStale = true, excludeStale = false } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : (limit === 0 ? 0 : 100)
      const wantTags = tags === null ? [] : (Array.isArray(tags) ? strList(tags) : (typeof tags === 'string' && tags ? [tags] : []))
      const needle = typeof query === 'string' && query.trim() ? norm(query) : null
      const at = now()
      let staleCount = 0
      let excludedStale = 0
      let excludedByVisibility = 0
      let excludedSuperseded = 0
      let excludedExpired = 0
      const matched = []
      for (const id of order) {
        const e = entries.get(id)
        if (!e) continue
        if (kind !== null && e.kind !== kind) continue
        if (scope !== null && e.scope !== scope) continue
        if (wantTags.length && !wantTags.every((t) => e.tags.includes(t))) continue
        if (needle !== null && !norm(e.text).includes(needle)) continue
        if (e.state === 'superseded') { excludedSuperseded += 1; continue }
        if (e.state === 'expired') { excludedExpired += 1; continue }   // only an explicit expire() sweeps
        const stale = isStale(e, at)
        if (stale) {
          staleCount += 1
          if (excludeStale || !includeStale) { excludedStale += 1; continue }
        }
        if (e.visibility === 'private' && actor !== null && e.by !== actor) { excludedByVisibility += 1; continue }
        if (e.visibility === 'private' && actor === null) { excludedByVisibility += 1; continue }
        matched.push(view(e, at))
      }
      const kept = matched.slice(0, cap)
      return {
        ok: true, entries: kept, count: kept.length, available: matched.length,
        dropped: matched.length - kept.length, truncated: matched.length > kept.length,
        stale: staleCount, excludedStale, excludedExpired, excludedByVisibility, excludedSuperseded,
        note: 'memory is advice, not authority (S-3) — a stale card says `stale:true`, and a swept one is counted as excluded',
      }
    },

    /** INVARIANT ④: supersede needs a reason (and the act is audited). */
    supersede({ id, by, reason = null } = {}) {
      const e = entryOf(id)
      if (!e) throw deny('VMU_NO_SUCH_OBJECT', 'unknown memory entry: ' + String(id), 'known: ' + (order.join(', ') || '(none)'))
      if (typeof by !== 'string' || !by.trim()) throw deny('VMU_INVALID_ARGUMENT', 'supersede needs a non-empty `by`', 'the act is audited')
      if (supersedeNeedsReason && (typeof reason !== 'string' || !reason.trim())) {
        throw deny('VMU_REASON_REQUIRED', 'superseding ' + e.id + ' requires a reason (vmu.memory.supersedeNeedsReason)',
          'say what changed — a corrected memory must be explainable (invariant ④)')
      }
      if (e.state === 'superseded') return { ok: true, id: e.id, already: true, supersededAt: e.supersededAt, supersededBy: e.supersededBy }
      e.state = 'superseded'
      e.supersededAt = now()
      e.supersededBy = String(by)
      e.supersedeReason = reason === null ? null : String(reason)
      record_({ type: 'memory/superseded', id: e.id, by: String(by), why: e.supersedeReason, auto: false })
      say({ type: 'memory/superseded', at: e.supersededAt, id: e.id, by: String(by), why: e.supersedeReason })
      fire('memory/superseded', { id: e.id, by: String(by) })
      return { ok: true, id: e.id, supersededAt: e.supersededAt, by: String(by), reason: e.supersedeReason, at: e.supersededAt }
    },

    /** INVARIANT ② (read-only): every live contradiction pair, visible on demand. */
    contradictions({ id = null, limit = DEFAULT_LIST_CAP } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const all = pairList().filter((p) => id === null || p.a === id || p.b === id)
      const kept = all.slice(0, cap)
      return {
        ok: true, pairs: kept, count: kept.length, available: all.length, dropped: all.length - kept.length,
        truncated: all.length > kept.length, policy: contradictionPolicy,
        note: contradictionPolicy === 'report'
          ? 'contradictionPolicy=report: contradicting cards coexist and MUST be resolved by a human or an explicit supersede (nothing is hidden)'
          : 'contradictionPolicy=' + contradictionPolicy,
      }
    },

    /** Sweep stale entries into `state:'expired'` (counted; nothing disappears silently). */
    expire({ at = null } = {}) {
      const when = Number.isInteger(at) && at >= 0 ? at : now()
      const expired = []
      for (const id of order) {
        const e = entries.get(id)
        if (!e || e.state !== 'active') continue
        if (isStale(e, when)) { e.state = 'expired'; expired.push(e.id) }
      }
      if (expired.length) {
        record_({ type: 'memory/expired', ids: expired, at: when })
        say({ type: 'memory/expired', at: when, ids: expired })
        fire('memory/expired', { ids: expired })
      }
      return { ok: true, at: when, expired, count: expired.length, note: expired.length ? 'stale entries are now marked expired (they remain listed, never dropped)' : 'nothing was stale' }
    },

    /**
     * Compaction: keep every `keepEvery`-th entry per kind, but NEVER drop a kind listed in
     * `vmu.memory.neverDropKinds` (negative knowledge is the most valuable) — a request that would is refused.
     */
    compact({ keepEvery = null, budget = null, by = 'office', dropKinds = null } = {}) {
      const every = keepEvery === null ? keepEverySetting : keepEvery
      if (!(Number.isInteger(every) && every >= 0)) throw deny('VMU_INVALID_ARGUMENT', 'keepEvery must be an integer >= 0 (0 = no compaction)', 'omit it to use vmu.memory.keepEvery')
      if (budget !== null && !(Number.isInteger(budget) && budget >= 0)) throw deny('VMU_INVALID_ARGUMENT', 'budget must be an integer >= 0 when given', 'the budget is a maximum number of entries to keep')
      const explicitDrop = strList(dropKinds)
      const protectedRequested = explicitDrop.filter((k) => neverDropKinds.includes(k))
      if (protectedRequested.length) {
        throw deny('VMU_MEMORY_COMPACTION_REFUSED', 'compaction may not drop protected kinds: ' + protectedRequested.join(', '),
          'vmu.memory.neverDropKinds protects negative knowledge and CANNOT be lifted by request — negative knowledge is the most valuable memory (docs/17 §9)')
      }
      if (explicitDrop.length && !kinds.includes(explicitDrop[0])) {
        throw deny('VMU_INVALID_ARGUMENT', 'unknown kind in dropKinds: ' + explicitDrop[0], 'declared kinds: ' + kinds.join(', '))
      }
      const at = now()
      const dropped = []
      const neverDropped = []
      if (every === 0 && budget === null && explicitDrop.length === 0) {
        return { ok: true, kept: order.length, dropped: [], neverDropped: [], refused: [], note: 'no compaction requested (keepEvery=0)' }
      }
      const byKind = new Map()
      for (const id of order) {
        const e = entries.get(id)
        if (!e || e.state !== 'active') continue
        if (!byKind.has(e.kind)) byKind.set(e.kind, [])
        byKind.get(e.kind).push(e)
      }
      let keptCount = 0
      for (const kind of [...byKind.keys()].sort()) {
        const list = byKind.get(kind)
        const protectedKind = neverDropKinds.includes(kind)
        list.forEach((e, index) => {
          // PROTECTED KINDS ARE NEVER DROPPED (not by the stride, not by the budget, not by an explicit
          // request) — they are kept and reported in `neverDropped`, so the protection is observable.
          if (protectedKind) { neverDropped.push(e.id); keptCount += 1; return }
          const keepByStride = every > 0 ? index % every === 0 : true
          const keepByBudget = budget === null ? true : keptCount < budget
          const explicitlyDropped = explicitDrop.includes(e.kind)
          if (!explicitlyDropped && keepByStride && keepByBudget) { keptCount += 1; return }
          e.state = 'superseded'
          e.supersededAt = at
          e.supersededBy = String(by)
          e.supersedeReason = explicitlyDropped
            ? 'compacted (explicit dropKinds request)'
            : 'compacted (keepEvery=' + every + (budget === null ? '' : ', budget=' + budget) + ')'
          dropped.push(e.id)
        })
      }
      if (dropped.length) {
        record_({ type: 'memory/compacted', by: String(by), dropped, kept: keptCount, neverDropped })
        say({ type: 'memory/compacted', at, by: String(by), dropped, kept: keptCount })
        fire('memory/compacted', { dropped, kept: keptCount })
      }
      return {
        ok: true, at, kept: keptCount, dropped, droppedCount: dropped.length, neverDropped, refused: protectedRequested,
        note: 'compaction only moves entries to `superseded` (nothing is deleted) and protected kinds are never dropped',
      }
    },

    /** Read-only. Bounded: a `limit` below what is available reports the DROPPED count (never silent). */
    list({ limit = DEFAULT_LIST_CAP, kind = null, scope = null, state = null } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const at = now()
      let all = order.map((id) => entries.get(id)).filter(Boolean)
      if (kind !== null) all = all.filter((e) => e.kind === kind)
      if (scope !== null) all = all.filter((e) => e.scope === scope)
      if (state !== null) all = all.filter((e) => stateOf(e, at) === state)
      const kept = all.slice(0, cap).map((e) => view(e, at))
      return { ok: true, entries: kept, count: kept.length, available: all.length, dropped: all.length - kept.length, truncated: all.length > kept.length, configured: order.length > 0 }
    },

    /** Read-only: the audit trail (a capped ring; drops are counted). */
    history({ id = null, limit = DEFAULT_LIST_CAP } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const rows = historyRows.filter((r) => id === null || r.id === id || (Array.isArray(r.ids) && r.ids.includes(id)))
      const kept = rows.slice(Math.max(0, rows.length - cap)).map((r) => Object.assign({}, r))
      return { ok: true, rows: kept, count: kept.length, available: rows.length, dropped: rows.length - kept.length, truncated: rows.length > kept.length, ringDropped: droppedHistory.n }
    },

    /** Read-only self-report. */
    status() {
      const at = now()
      const all = order.map((id) => entries.get(id)).filter(Boolean)
      const live = all.filter((e) => isLive(e, at))
      return {
        ok: true,
        configured: all.length > 0,
        kinds: kinds.slice(), requireEvidence, requireSource, maxEntries, ttlDefault, defaultVisibility, scopeRequired, scopeDefault,
        contradictionPolicy, neverDropKinds: neverDropKinds.slice(), keepEvery: keepEverySetting, compactionEveryMs, supersedeNeedsReason,
        entries: {
          total: all.length, live: live.length,
          superseded: all.filter((e) => e.state === 'superseded').length,
          expired: all.filter((e) => stateOf(e, at) === 'expired').length,
          private: all.filter((e) => e.visibility === 'private').length,
        },
        contradictions: pairList().length,
        listCap: DEFAULT_LIST_CAP,
        historyRows: historyRows.length,
        historyDropped: droppedHistory.n,
        refusals: objOf(refusals),
        refusalsTotal: sumOf(refusals),
        unwired: objOf(unwired),
        unwiredTotal: sumOf(unwired),
        libraryInjected: !!(library && typeof library.list === 'function'),
        trustInjected: !!(trust && typeof trust === 'object'),
        trustUsedForAuthority: false,
        at,
        note: 'memory is advice, never authority (S-3); contradictions are reportable, expiry is disclosed, superseding needs a reason',
      }
    },
  }

  // ── helper that needs `entries`/`order` but is not part of the public surface ───────────────────────
  function countLive() {
    const at = now()
    return order.map((id) => entries.get(id)).filter((e) => e && isLive(e, at)).length
  }
}
