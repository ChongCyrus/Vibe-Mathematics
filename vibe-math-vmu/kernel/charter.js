// vmu kernel · charter — institutions, charters, subsidiaries, ratification, dissolution (docs/17 §15).
//
// Design source: docs/17-agent-society-and-delegation.md §15 (self-organisation / charter) and §21.3
// (the VMU_CHARTER_* codes). The charter is the RUN-TIME amendable rule set (a pack is the LOAD-TIME
// structure, docs/10): proposed → amended → ratified → IN FORCE (after `effectiveDelayMs`) → dissolved.
//
// FOUR HARD INVARIANTS (each one is a refusal, never a warning):
//   ① AN IMMUTABLE ARTICLE CANNOT BE AMENDED — `vmu.charter.immutableArticles` /
//      `vmu.charter.frozenClauses` / an article's own `immutable:true` ⇒ `VMU_CHARTER_FROZEN`, NAMING the
//      article (a change, a removal and a silent drop are all caught).
//   ② A SUB-INSTITUTION MAY NOT EXCEED ITS PARENT (the same rule as S-2, kernel/delegation.js) ⇒
//      `VMU_CHARTER_NOT_AUTHORIZED` NAMING the offending commands/resources.
//   ③ DISSOLUTION NEEDS A REASON AND IS AUDITED (`vmu.charter.dissolveRequiresReason`) ⇒ `VMU_REASON_REQUIRED`.
//   ④ A CHARTER THAT IS NOT IN FORCE MAY NOT BE CITED ⇒ `inForce()` says `false` WITH the reason and the
//      effective time; `cite()` refuses by name. Nothing pretends a draft is binding.
// Invariants (same set as the rest of the kernel — board.js / metrics.js / delegation.js / arbitration.js):
//   · every refusal is NAMED (VMU_* + hint) — never a bare exception
//   · every upper bound reports how many items were DROPPED — never silent (list()/history()/children()/articles())
//   · zero mechanism: `vmu.charter.enabled=false` (the default) ⇒ every write is refused by name and the
//     read surfaces still answer; construction never throws
//   · the only time source is the injected `clock`; ids are deterministic (`ch-1`, …); no randomness
//   · READ paths (inForce/articles/children/list/history/status/cite-with-valid-input) never mutate charters
// SETTINGS READ CONVENTION (kernel/guard.js): every key is read as a PLAIN LITERAL — the settings table and
// the docs audit both discover "wired" keys by scanning file text for the literal.
export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

const K_ENABLED = 'vmu.charter.enabled'
const K_AMEND_NEEDS_QUORUM = 'vmu.charter.amendNeedsQuorum'
const K_AMEND_NEEDS_HUMAN = 'vmu.charter.amendNeedsHuman'
const K_FROZEN = 'vmu.charter.frozenClauses'
const K_DISSOLVE_NEEDS_HUMAN = 'vmu.charter.dissolveNeedsHuman'
const K_FISSION_MAX = 'vmu.charter.fissionMax'
const K_MERGE_NEEDS_HUMAN = 'vmu.charter.mergeNeedsHuman'
const K_DEPTH_MAX = 'vmu.charter.depthMax'
const K_SPAWN_MAX = 'vmu.charter.spawnMaxChildren'
const K_PRECEDENCE = 'vmu.charter.precedence'
// The task names these eight; they are not declared in settings/planned.js yet, so they are read with defaults
// (the canonical spellings above stay authoritative where both exist — see the report).
const K_IMMUTABLE = 'vmu.charter.immutableArticles'
const K_AMEND_QUORUM = 'vmu.charter.amendQuorum'
const K_DISSOLVE_REASON = 'vmu.charter.dissolveRequiresReason'
const K_RATIFY_THRESHOLD = 'vmu.charter.ratifyThreshold'
const K_MAX_ARTICLES = 'vmu.charter.maxArticles'
const K_EFFECTIVE_DELAY = 'vmu.charter.effectiveDelayMs'
const K_PARENT_CONSENT = 'vmu.charter.requiresParentConsent'
const K_INHERIT_DELEGATION = 'vmu.charter.inheritDelegation'

const KINDS = Object.freeze(['charter', 'subsidiary'])
const STATES = Object.freeze(['proposed', 'ratified', 'in-force', 'dissolved'])
const DEFAULT_FROZEN = Object.freeze(['S-1', 'S-2', 'S-3', 'S-4', 'S-5', 'S-6'])
const DEFAULT_LIST_CAP = 200

/** createCharter — the institution/charter ledger. `delegation` is the (optional) scope seam for `inheritDelegation`. */
export function createCharter({ clock = () => 0, log = null, settings = {}, bus = null, members = null, delegation = null } = {}) {
  if (typeof clock !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createCharter needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
  }

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (event) => {
    if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* logging must never break the charter it records */ } }
  }

  const enabled = sget(K_ENABLED, false) === true
  const amendNeedsQuorum = sget(K_AMEND_NEEDS_QUORUM, true) !== false
  const amendNeedsHuman = sget(K_AMEND_NEEDS_HUMAN, false) === true
  const frozenSetting = strList(sget(K_FROZEN, DEFAULT_FROZEN.slice()))
  const immutableSetting = strList(sget(K_IMMUTABLE, []))
  const frozenArticles = [...new Set((frozenSetting.length ? frozenSetting : DEFAULT_FROZEN.slice()).concat(immutableSetting))]
  const dissolveNeedsHuman = sget(K_DISSOLVE_NEEDS_HUMAN, true) !== false
  const dissolveRequiresReason = sget(K_DISSOLVE_REASON, true) !== false
  const fissionMax = nonNegInt(sget(K_FISSION_MAX, 0), 0)
  const mergeNeedsHuman = sget(K_MERGE_NEEDS_HUMAN, true) !== false
  const depthMax = nonNegInt(sget(K_DEPTH_MAX, 1), 1)
  const spawnMaxChildren = nonNegInt(sget(K_SPAWN_MAX, 0), 0)
  const precedence = sget(K_PRECEDENCE, 'charter-over-pack') === 'pack-over-charter' ? 'pack-over-charter' : 'charter-over-pack'
  const amendQuorumRaw = sget(K_AMEND_QUORUM, 0)
  const amendQuorum = typeof amendQuorumRaw === 'number' && amendQuorumRaw >= 0 && amendQuorumRaw <= 1 ? amendQuorumRaw : 0
  const ratifyRaw = sget(K_RATIFY_THRESHOLD, 0.5)
  const ratifyThreshold = typeof ratifyRaw === 'number' && ratifyRaw > 0 && ratifyRaw <= 1 ? ratifyRaw : 0.5
  const maxArticles = nonNegInt(sget(K_MAX_ARTICLES, 0), 0)
  const effectiveDelayMs = nonNegInt(sget(K_EFFECTIVE_DELAY, 0), 0)
  const requiresParentConsent = sget(K_PARENT_CONSENT, true) !== false
  const inheritDelegation = sget(K_INHERIT_DELEGATION, false) === true

  function strList(v) { return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [] }
  function nonNegInt(v, def) { return Number.isInteger(v) && v >= 0 ? v : def }

  // ── state (mutated only by propose/amend/ratify/dissolve) ──────────────────────────────────────────
  const charters = new Map()
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
  const charterOf = (id) => charters.get(id) || null

  const deny = (code, message, hint) => {
    bump(refusals, code, 1)
    say({ type: 'charter/refused', at: now(), code, message })
    return refuse(code, message, hint)
  }
  const record = (row) => {
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
      say({ type: 'charter/hook-unwired', at: now(), hook, why: String((e && e.message) || e) })
    }
  }
  const requireEnabled = () => {
    if (!enabled) {
      throw deny('VMU_CHARTER_NOT_AUTHORIZED', 'the charter mechanism is disabled (vmu.charter.enabled=false): no institution may be created or changed',
        'set vmu.charter.enabled=true to give the society a constitution (zero mechanism = no charter exists)')
    }
  }
  const requireCharter = (id) => {
    const c = charterOf(id)
    if (!c) throw deny('VMU_NO_SUCH_OBJECT', 'unknown charter: ' + String(id), 'known: ' + (order.join(', ') || '(none)'))
    return c
  }
  const normalizeScope = (scope, label = 'authority') => {
    if (scope === null || scope === undefined) return { commands: [], resources: [] }
    if (typeof scope !== 'object') throw deny('VMU_INVALID_ARGUMENT', label + ' must be an object with commands[] and/or resources[]', 'e.g. { commands: ["task/create"], resources: ["task/1"] }')
    const out = { commands: strList(scope.commands), resources: strList(scope.resources) }
    if (Array.isArray(scope.commands) && out.commands.length !== scope.commands.length) throw deny('VMU_INVALID_ARGUMENT', label + '.commands may only contain non-empty strings', 'entries are opaque strings')
    if (Array.isArray(scope.resources) && out.resources.length !== scope.resources.length) throw deny('VMU_INVALID_ARGUMENT', label + '.resources may only contain non-empty strings', 'entries are opaque strings')
    return out
  }
  const normalizeArticles = (articles, label = 'articles') => {
    if (articles === null || articles === undefined) return []
    if (!Array.isArray(articles)) throw deny('VMU_INVALID_ARGUMENT', label + ' must be an array of { id, text, immutable? }', 'e.g. [{ id: "A-1", text: "…" }]')
    const out = []
    for (const a of articles) {
      if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !a.id) throw deny('VMU_INVALID_ARGUMENT', label + ': every article needs a non-empty string id', 'e.g. { id: "A-1", text: "…" }')
      if (out.some((x) => x.id === a.id)) throw deny('VMU_INVALID_ARGUMENT', 'duplicate article id: ' + a.id, 'article ids must be unique inside one charter')
      out.push({ id: a.id, text: a.text === null || a.text === undefined ? null : String(a.text), immutable: a.immutable === true || frozenArticles.includes(a.id) })
    }
    return out
  }
  const scopeMissing = (child, parent) => {
    const out = { commands: [], resources: [] }
    for (const kind of ['commands', 'resources']) for (const item of child[kind]) if (!parent[kind].includes(item)) out[kind].push(item)
    return out
  }
  const hasMissing = (m) => m.commands.length > 0 || m.resources.length > 0
  const missingText = (m) => {
    const parts = []
    if (m.commands.length) parts.push('commands[' + m.commands.join(', ') + ']')
    if (m.resources.length) parts.push('resources[' + m.resources.join(', ') + ']')
    return parts.join(' ')
  }
  const ancestorsOf = (c) => {
    const out = []
    let cur = c
    const seen = new Set([c.id])
    while (cur && cur.parentId) { const p = charters.get(cur.parentId); if (!p || seen.has(p.id)) break; seen.add(p.id); out.push(p); cur = p }
    return out
  }
  const childrenOf = (id) => order.map((x) => charters.get(x)).filter((c) => c && c.parentId === id)
  /** The authority a parent actually holds: its own ∪ inherited ancestry ∪ (optionally) its delegations. */
  const effectiveAuthority = (c) => {
    const own = c.authority || { commands: [], resources: [] }
    let out = { commands: own.commands.slice(), resources: own.resources.slice() }
    if (inheritDelegation) {
      for (const a of ancestorsOf(c)) {
        out = { commands: [...new Set(out.commands.concat(a.authority.commands))], resources: [...new Set(out.resources.concat(a.authority.resources))] }
      }
      if (delegation && typeof delegation.list === 'function') {
        try {
          const res = delegation.list({ active: true, limit: 1000 })
          const grants = res && Array.isArray(res.grants) ? res.grants : []
          for (const g of grants) {
            if (!g || g.to !== c.id || !g.scope) continue
            out = { commands: [...new Set(out.commands.concat(strList(g.scope.commands)))], resources: [...new Set(out.resources.concat(strList(g.scope.resources)))] }
          }
        } catch (e) {
          bump(unwired, 'delegation-seam', 1)   // a seam that cannot answer is a COUNTED wiring gap
        }
      }
    }
    return out
  }
  const isInForce = (c, at = now()) => {
    if (c.state === 'dissolved') return { inForce: false, reason: 'dissolved', effectiveAt: c.inForceAt }
    if (c.state === 'proposed') return { inForce: false, reason: 'not-ratified', effectiveAt: null }
    if (typeof c.inForceAt === 'number' && at < c.inForceAt) return { inForce: false, reason: 'not-yet-effective', effectiveAt: c.inForceAt }
    return { inForce: true, reason: null, effectiveAt: c.inForceAt }
  }
  const view = (c) => ({
    id: c.id, kind: c.kind, parentId: c.parentId, depth: c.depth, text: c.text, state: c.state, version: c.version,
    articles: c.articles.map((a) => ({ id: a.id, immutable: a.immutable, hasText: a.text !== null })),
    authority: { commands: c.authority.commands.slice(), resources: c.authority.resources.slice() },
    by: c.by, proposedAt: c.proposedAt, ratifiedAt: c.ratifiedAt, inForceAt: c.inForceAt,
    amendedAt: c.amendedAt, dissolvedAt: c.dissolvedAt, dissolvedBy: c.dissolvedBy, dissolveReason: c.dissolveReason, successor: c.successor,
    inForce: isInForce(c).inForce,
  })

  return {
    apiVersion,

    /**
     * Propose a charter — or a SUB-INSTITUTION (kind='subsidiary'), whose authority must be a SUBSET of its
     * parent's (invariant ②) and whose parent must itself be IN FORCE (invariant ④).
     */
    propose({ kind = 'charter', text, by, parentId = null, articles = null, authority = null, consent = null, effectiveAtMs = null } = {}) {
      requireEnabled()
      if (!KINDS.includes(kind)) throw deny('VMU_INVALID_ARGUMENT', 'unknown charter kind: ' + String(kind), 'declared kinds: ' + KINDS.join(', '))
      if (typeof text !== 'string' || !text.trim()) throw deny('VMU_INVALID_ARGUMENT', 'propose needs a non-empty text (what this charter says)', 'e.g. { kind: "charter", text: "…", by: "office" }')
      if (typeof by !== 'string' || !by.trim()) throw deny('VMU_INVALID_ARGUMENT', 'propose needs a non-empty `by` (the proposer is audited)', 'the charter history must name who proposed it')
      const arts = normalizeArticles(articles)
      if (maxArticles > 0 && arts.length > maxArticles) {
        throw deny('VMU_INVALID_ARGUMENT', 'too many articles: ' + arts.length + '/' + maxArticles + ' (vmu.charter.maxArticles)', 'split the charter, or raise vmu.charter.maxArticles')
      }
      const scope = normalizeScope(authority)
      let parent = null
      if (kind === 'subsidiary') {
        if (typeof parentId !== 'string' || !parentId) throw deny('VMU_INVALID_ARGUMENT', 'a subsidiary needs a parentId', 'e.g. { kind: "subsidiary", parentId: "ch-1", … }')
        parent = requireCharter(parentId)
        const f = isInForce(parent)
        if (!f.inForce) {
          throw deny('VMU_STATE', 'the parent ' + parent.id + ' is not in force (' + f.reason + (f.effectiveAt !== null ? ', effective at ' + f.effectiveAt + 'ms' : '') + '): a sub-institution may not be created under it',
            'a charter must be ratified and past its effective delay before it can found anything (invariant ④)')
        }
        const depth = parent.depth + 1
        if (depth > depthMax) {
          throw deny('VMU_CHARTER_DEPTH', 'sub-institution depth ' + depth + ' exceeds vmu.charter.depthMax=' + depthMax + ' (parent ' + parent.id + ' at depth ' + parent.depth + ')',
            'raise vmu.charter.depthMax, or found the institution under a shallower parent')
        }
        if (spawnMaxChildren > 0 && childrenOf(parent.id).length >= spawnMaxChildren) {
          throw deny('VMU_CHARTER_NOT_AUTHORIZED', 'the parent ' + parent.id + ' already has ' + childrenOf(parent.id).length + '/' + spawnMaxChildren + ' children (vmu.charter.spawnMaxChildren)',
            'dissolve a sibling institution first, or raise vmu.charter.spawnMaxChildren')
        }
        if (requiresParentConsent) {
          const consenter = consent && typeof consent.by === 'string' ? consent.by : null
          if (!consenter) {
            throw deny('VMU_CHARTER_NOT_AUTHORIZED', 'the parent ' + parent.id + ' has not consented: vmu.charter.requiresParentConsent=true',
              'pass consent: { by: "<the parent institution or its authorised actor>" } — a subsidiary is not founded unilaterally')
          }
        }
        // INVARIANT ② (S-2): a sub-institution may only NARROW.
        const parentScope = effectiveAuthority(parent)
        const missing = scopeMissing(scope, parentScope)
        if (hasMissing(missing)) {
          throw deny('VMU_CHARTER_NOT_AUTHORIZED', 'the subsidiary would EXCEED its parent ' + parent.id + ': ' + missingText(missing),
            'S-2 (kernel/delegation.js): a sub-institution may only narrow — the parent holds commands[' + parentScope.commands.join(', ') + '] resources[' + parentScope.resources.join(', ') + ']')
        }
      } else if (parentId !== null) {
        throw deny('VMU_INVALID_ARGUMENT', 'only kind="subsidiary" may declare a parentId', 'drop parentId, or use kind: "subsidiary"')
      }
      const id = 'ch-' + (++seq)
      const c = {
        id, kind, parentId: parent ? parent.id : null, depth: parent ? parent.depth + 1 : 0,
        text: String(text), articles: arts, authority: scope,
        state: 'proposed', version: 1, by: String(by), proposedAt: now(),
        votes: [], ratifiedAt: null, inForceAt: null, amendedAt: null,
        dissolvedAt: null, dissolvedBy: null, dissolveReason: null, successor: null,
        consent: consent && typeof consent === 'object' ? { by: consent.by === undefined ? null : String(consent.by) } : null,
        explicitEffectiveAt: Number.isInteger(effectiveAtMs) && effectiveAtMs >= 0 ? effectiveAtMs : null,
      }
      charters.set(id, c)
      order.push(id)
      record({ type: 'charter/proposed', id, kind, by: c.by, parentId: c.parentId, articles: arts.map((a) => a.id) })
      say({ type: 'charter/proposed', at: c.proposedAt, id, kind, by: c.by })
      fire('charter/proposed', { id, kind, parentId: c.parentId })
      return { ok: true, id, kind, state: c.state, version: c.version, articles: arts.map((a) => a.id), authority: { commands: scope.commands.slice(), resources: scope.resources.slice() }, depth: c.depth, at: now() }
    },

    /**
     * Amend a proposal/charter. INVARIANT ①: an immutable article may not be changed, removed or dropped —
     * the refusal NAMES it. Amendments create a NEW VERSION; the old version is never overwritten.
     */
    amend({ id, patch, by, approval = null } = {}) {
      requireEnabled()
      const c = requireCharter(id)
      if (typeof by !== 'string' || !by.trim()) throw deny('VMU_INVALID_ARGUMENT', 'amend needs a non-empty `by`', 'every amendment is audited')
      if (c.state === 'dissolved') throw deny('VMU_STATE', 'charter ' + c.id + ' is dissolved: it can no longer be amended', 'propose a new charter instead')
      if (!patch || typeof patch !== 'object') throw deny('VMU_INVALID_ARGUMENT', 'amend needs a `patch` object', 'e.g. { patch: { text: "…" }, by: "office" }')

      // ── INVARIANT ①: immutable articles ────────────────────────────────────────────────────────────
      const frozenIds = new Set(c.articles.filter((a) => a.immutable).map((a) => a.id).concat(frozenArticles))
      const touched = []
      if (Array.isArray(patch.articles)) {
        const next = normalizeArticles(patch.articles, 'patch.articles')
        const nextIds = new Set(next.map((a) => a.id))
        for (const a of next) {
          const before = c.articles.find((x) => x.id === a.id)
          if (frozenIds.has(a.id) && (!before || before.text !== a.text)) touched.push(a.id)
        }
        for (const a of c.articles) if (!nextIds.has(a.id) && frozenIds.has(a.id)) touched.push(a.id)
      }
      if (Array.isArray(patch.removeArticles)) {
        for (const rid of strList(patch.removeArticles)) if (frozenIds.has(rid) && c.articles.some((a) => a.id === rid)) touched.push(rid)
      }
      if (Array.isArray(patch.addArticles)) {
        for (const a of normalizeArticles(patch.addArticles, 'patch.addArticles')) if (frozenIds.has(a.id)) touched.push(a.id)
      }
      if (touched.length) {
        throw deny('VMU_CHARTER_FROZEN', 'immutable article(s) may not be amended: ' + [...new Set(touched)].join(', '),
          'these articles are frozen by vmu.charter.immutableArticles / vmu.charter.frozenClauses or by their own immutable:true — a frozen article survives every vote (invariant ①)')
      }

      // ── quorum / human gates ───────────────────────────────────────────────────────────────────────
      const appr = approval && typeof approval === 'object' ? approval : null
      if (amendNeedsQuorum) {
        const support = appr && Number.isFinite(appr.support) ? appr.support : null
        const eligible = appr && Number.isFinite(appr.eligible) ? appr.eligible : null
        if (support === null || eligible === null || eligible <= 0) {
          throw deny('VMU_CHARTER_QUORUM', 'amending ' + c.id + ' needs an approval record (vmu.charter.amendNeedsQuorum=true)',
            'pass approval: { support: <n>, eligible: <n> } — an amendment without a recorded vote cannot be audited')
        }
        const share = support / eligible
        if (share < amendQuorum) {
          throw deny('VMU_CHARTER_QUORUM', 'the amendment of ' + c.id + ' has ' + support + '/' + eligible + ' support (' + share.toFixed(2) + ') but vmu.charter.amendQuorum=' + amendQuorum,
            'gather more support, lower vmu.charter.amendQuorum, or drop the amendment')
        }
      }
      if (amendNeedsHuman && !(appr && appr.human === true)) {
        throw deny('VMU_NOT_PERMITTED', 'amending ' + c.id + ' needs human approval (vmu.charter.amendNeedsHuman=true)',
          'pass approval: { human: true } once a human has approved — the kernel never invents a human decision')
      }

      // ── apply (new version; history preserved) ─────────────────────────────────────────────────────
      if (typeof patch.text === 'string' && patch.text.trim()) c.text = patch.text
      if (Array.isArray(patch.articles)) c.articles = normalizeArticles(patch.articles, 'patch.articles')
      if (Array.isArray(patch.addArticles)) {
        const add = normalizeArticles(patch.addArticles, 'patch.addArticles').filter((a) => !c.articles.some((x) => x.id === a.id))
        c.articles = c.articles.concat(add)
      }
      if (Array.isArray(patch.removeArticles)) {
        const remove = new Set(strList(patch.removeArticles))
        c.articles = c.articles.filter((a) => !remove.has(a.id))
      }
      if (maxArticles > 0 && c.articles.length > maxArticles) {
        throw deny('VMU_INVALID_ARGUMENT', 'the amendment would leave ' + c.articles.length + ' articles (' + maxArticles + ' allowed by vmu.charter.maxArticles)', 'remove an article first, or raise vmu.charter.maxArticles')
      }
      if (patch.authority !== undefined) {
        const next = normalizeScope(patch.authority, 'patch.authority')
        if (c.parentId) {
          const parent = charterOf(c.parentId)
          const parentScope = effectiveAuthority(parent)
          const missing = scopeMissing(next, parentScope)
          if (hasMissing(missing)) {
            throw deny('VMU_CHARTER_NOT_AUTHORIZED', 'the amendment would make ' + c.id + ' EXCEED its parent ' + parent.id + ': ' + missingText(missing),
              'S-2: a sub-institution may only narrow — the parent holds commands[' + parentScope.commands.join(', ') + '] resources[' + parentScope.resources.join(', ') + ']')
          }
        }
        c.authority = next
      }
      c.version += 1
      c.amendedAt = now()
      record({ type: 'charter/amended', id: c.id, by: String(by), version: c.version, articles: c.articles.map((a) => a.id) })
      say({ type: 'charter/amended', at: c.amendedAt, id: c.id, by: String(by), version: c.version })
      fire('charter/amended', { id: c.id, version: c.version, by: String(by) })
      return { ok: true, id: c.id, version: c.version, articles: c.articles.map((a) => ({ id: a.id, immutable: a.immutable })), text: c.text, at: c.amendedAt }
    },

    /** Ratify a proposal: `votes` is a list (or a tally) judged against `vmu.charter.ratifyThreshold`. */
    ratify({ id, by, votes = null } = {}) {
      requireEnabled()
      const c = requireCharter(id)
      if (typeof by !== 'string' || !by.trim()) throw deny('VMU_INVALID_ARGUMENT', 'ratify needs a non-empty `by`', 'the ratifier is audited')
      if (c.state === 'dissolved') throw deny('VMU_STATE', 'charter ' + c.id + ' is dissolved', 'nothing to ratify')
      const tally = normalizeVotes(votes)
      const total = tally.for + tally.against
      if (total === 0) {
        throw deny('VMU_CHARTER_QUORUM', 'ratifying ' + c.id + ' needs at least one decisive vote', 'pass votes: [{ by: "x", choice: "for" }] — silence is not consent (docs/08 I-3)')
      }
      const share = tally.for / total
      c.votes = tally.rows
      if (share < ratifyThreshold) {
        throw deny('VMU_CHARTER_QUORUM', 'charter ' + c.id + ' got ' + tally.for + '/' + total + ' decisive support (' + share.toFixed(2) + ') but vmu.charter.ratifyThreshold=' + ratifyThreshold,
          'gather more support, or lower vmu.charter.ratifyThreshold — an unratified charter is NOT in force (invariant ④)')
      }
      c.state = 'ratified'
      c.ratifiedAt = now()
      const base = c.explicitEffectiveAt === null ? c.ratifiedAt + effectiveDelayMs : c.explicitEffectiveAt
      c.inForceAt = base
      record({ type: 'charter/ratified', id: c.id, by: String(by), for: tally.for, against: tally.against, abstain: tally.abstain, inForceAt: c.inForceAt })
      say({ type: 'charter/ratified', at: c.ratifiedAt, id: c.id, by: String(by), inForceAt: c.inForceAt })
      fire('charter/ratified', { id: c.id, inForceAt: c.inForceAt })
      return {
        ok: true, id: c.id, state: c.state, ratifiedAt: c.ratifiedAt, inForceAt: c.inForceAt,
        tally, share: Number(share.toFixed(6)), threshold: ratifyThreshold,
        inForceNow: isInForce(c).inForce,
        note: c.inForceAt > c.ratifiedAt ? 'the charter takes effect at ' + c.inForceAt + 'ms (vmu.charter.effectiveDelayMs)' : 'the charter is in force immediately',
      }
    },

    /**
     * INVARIANT ④ (read-only): is this charter in force? With no id it lists what IS in force.
     * The answer is explicit — a draft is never reported as binding.
     */
    inForce({ id = null, at = null } = {}) {
      const when = Number.isInteger(at) && at >= 0 ? at : now()
      if (id === null) {
        const rows = order.map((x) => charters.get(x)).filter((c) => c && isInForce(c, when).inForce).map((c) => ({ id: c.id, version: c.version, kind: c.kind, effectiveAt: c.inForceAt }))
        return { ok: true, at: when, count: rows.length, inForce: rows, configured: enabled }
      }
      const c = requireCharter(id)
      const f = isInForce(c, when)
      return {
        ok: true, id: c.id, inForce: f.inForce, state: c.state, version: c.version, effectiveAt: f.effectiveAt,
        reason: f.reason, at: when,
        note: f.inForce
          ? 'charter ' + c.id + ' v' + c.version + ' is in force'
          : 'charter ' + c.id + ' is NOT in force (' + f.reason + (f.effectiveAt !== null ? ', effective at ' + f.effectiveAt + 'ms' : '') + ') — do not rely on it',
      }
    },

    /** Cite a charter (or one of its articles). INVARIANT ④: a charter that is not in force may not be cited. */
    cite({ id, articleId = null, by = null } = {}) {
      const c = requireCharter(id)
      const f = isInForce(c)
      if (!f.inForce) {
        throw deny('VMU_STATE', 'charter ' + c.id + ' may not be cited: it is not in force (' + f.reason + (f.effectiveAt !== null ? ', effective at ' + f.effectiveAt + 'ms' : '') + ')',
          'ratify it and wait for the effective delay (vmu.charter.effectiveDelayMs); a draft has no authority to lend (invariant ④)')
      }
      let article = null
      if (articleId !== null) {
        article = c.articles.find((a) => a.id === articleId) || null
        if (!article) throw deny('VMU_NO_SUCH_OBJECT', 'unknown article ' + String(articleId) + ' in ' + c.id, 'articles: ' + (c.articles.map((a) => a.id).join(', ') || '(none)'))
      }
      return { ok: true, id: c.id, version: c.version, inForceAt: c.inForceAt, article: article ? { id: article.id, text: article.text, immutable: article.immutable } : null, by: by === null ? null : String(by), at: now() }
    },

    /**
     * Dissolve an institution. INVARIANT ③: a reason is required and the act is audited; the human gate and
     * live children are refused by name.
     */
    dissolve({ id, by, reason = null, human = false, successor = null, cascade = false } = {}) {
      requireEnabled()
      const c = requireCharter(id)
      if (typeof by !== 'string' || !by.trim()) throw deny('VMU_INVALID_ARGUMENT', 'dissolve needs a non-empty `by`', 'the dissolution is audited')
      if (c.state === 'dissolved') return { ok: true, id: c.id, already: true, dissolvedAt: c.dissolvedAt, by: c.dissolvedBy }
      if (dissolveRequiresReason && (typeof reason !== 'string' || !reason.trim())) {
        throw deny('VMU_REASON_REQUIRED', 'dissolving ' + c.id + ' requires a reason (vmu.charter.dissolveRequiresReason)', 'state why the institution ends — the reason is recorded (invariant ③)')
      }
      if (dissolveNeedsHuman && human !== true) {
        throw deny('VMU_CHARTER_DISSOLVE_DENIED', 'dissolving ' + c.id + ' needs human approval (vmu.charter.dissolveNeedsHuman=true)',
          'pass human: true once a human has decided — the kernel never invents a human decision')
      }
      const kids = childrenOf(c.id).filter((k) => k.state !== 'dissolved')
      if (kids.length && !cascade) {
        throw deny('VMU_CHARTER_DISSOLVE_DENIED', 'charter ' + c.id + ' still has ' + kids.length + ' live sub-institution(s): ' + kids.map((k) => k.id).join(', '),
          'dissolve the children first (or pass cascade: true to dissolve the whole branch — each child is audited)')
      }
      if (successor !== null) {
        const s = requireCharter(successor)
        if (s.id === c.id || ancestorsOf(s).some((a) => a.id === c.id) || s.parentId === c.id || (isDescendant(s, c.id))) {
          throw deny('VMU_STATE', 'the successor ' + s.id + ' is inside the branch being dissolved: succession would inherit itself',
            'name a successor outside the dissolved branch (docs/17 §15 succession)')
        }
        if (!isInForce(s).inForce) throw deny('VMU_STATE', 'the successor ' + s.id + ' is not in force: it cannot inherit', 'ratify the successor first')
      }
      const at = now()
      const dissolved = []
      if (cascade && kids.length) {
        for (const k of kids) { k.state = 'dissolved'; k.dissolvedAt = at; k.dissolvedBy = String(by); k.dissolveReason = 'cascade from ' + c.id; dissolved.push(k.id) }
      }
      c.state = 'dissolved'
      c.dissolvedAt = at
      c.dissolvedBy = String(by)
      c.dissolveReason = reason === null ? null : String(reason)
      c.successor = successor === null ? null : String(successor)
      record({ type: 'charter/dissolved', id: c.id, by: String(by), why: c.dissolveReason, successor: c.successor, cascaded: dissolved })
      say({ type: 'charter/dissolved', at, id: c.id, by: String(by), why: c.dissolveReason, cascaded: dissolved })
      fire('charter/dissolved', { id: c.id, by: String(by), cascaded: dissolved })
      return { ok: true, id: c.id, dissolvedAt: at, by: String(by), reason: c.dissolveReason, successor: c.successor, cascaded: dissolved, at }
    },

    /** Read-only: the articles of a charter (bounded; drops are counted). */
    articles({ id, limit = DEFAULT_LIST_CAP } = {}) {
      const c = requireCharter(id)
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const all = c.articles
      const kept = all.slice(0, cap)
      return {
        ok: true, id: c.id, version: c.version, articles: kept.map((a) => ({ id: a.id, text: a.text, immutable: a.immutable })),
        count: kept.length, available: all.length, dropped: all.length - kept.length, truncated: all.length > kept.length,
      }
    },

    /** Read-only: children of an institution (bounded; drops are counted). */
    children({ id, limit = DEFAULT_LIST_CAP } = {}) {
      const c = requireCharter(id)
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const all = childrenOf(c.id)
      const kept = all.slice(0, cap)
      return { ok: true, id: c.id, children: kept.map(view), count: kept.length, available: all.length, dropped: all.length - kept.length, truncated: all.length > kept.length }
    },

    /** Read-only. Bounded: a `limit` below what is available reports the DROPPED count (never silent). */
    list({ limit = DEFAULT_LIST_CAP, state = null, kind = null } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      let all = order.map((x) => charters.get(x)).filter(Boolean)
      if (typeof state === 'string' && state) all = all.filter((c) => c.state === state)
      if (typeof kind === 'string' && kind) all = all.filter((c) => c.kind === kind)
      const kept = all.slice(0, cap).map(view)
      return { ok: true, charters: kept, count: kept.length, available: all.length, dropped: all.length - kept.length, truncated: all.length > kept.length, configured: enabled, inForce: kept.filter((c) => c.inForce).length }
    },

    /** Read-only: the audit trail (a capped ring; drops are counted). */
    history({ id = null, limit = DEFAULT_LIST_CAP } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const rows = historyRows.filter((r) => id === null || r.id === id)
      const kept = rows.slice(Math.max(0, rows.length - cap)).map((r) => Object.assign({}, r))
      return { ok: true, rows: kept, count: kept.length, available: rows.length, dropped: rows.length - kept.length, truncated: rows.length > kept.length, ringDropped: droppedHistory.n }
    },

    /** Read-only self-report. */
    status() {
      const all = order.map((x) => charters.get(x)).filter(Boolean)
      return {
        ok: true,
        configured: enabled,
        enabled, amendNeedsQuorum, amendNeedsHuman, amendQuorum, ratifyThreshold, maxArticles, effectiveDelayMs,
        dissolveNeedsHuman, dissolveRequiresReason, requiresParentConsent, inheritDelegation,
        depthMax, spawnMaxChildren, fissionMax, mergeNeedsHuman, precedence,
        immutableArticles: frozenArticles.slice(),
        charters: {
          total: all.length,
          proposed: all.filter((c) => c.state === 'proposed').length,
          ratified: all.filter((c) => c.state === 'ratified').length,
          inForce: all.filter((c) => c.state !== 'dissolved' && isInForce(c).inForce).length,
          subsidiaries: all.filter((c) => c.kind === 'subsidiary').length,
          dissolved: all.filter((c) => c.state === 'dissolved').length,
        },
        listCap: DEFAULT_LIST_CAP,
        historyRows: historyRows.length,
        historyDropped: droppedHistory.n,
        refusals: objOf(refusals),
        refusalsTotal: sumOf(refusals),
        unwired: objOf(unwired),
        unwiredTotal: sumOf(unwired),
        membersInjected: !!(members && typeof members.may === 'function'),
        delegationInjected: !!(delegation && typeof delegation.list === 'function'),
        at: now(),
        note: 'a charter is amendable at run time and only binding once ratified AND past its effective delay (docs/17 §15)',
      }
    },
  }

  // ── helpers that need `charters` but are not part of the public surface ─────────────────────────────
  function isDescendant(candidate, ancestorId) {
    return ancestorsOf(candidate).some((a) => a.id === ancestorId)
  }
  function normalizeVotes(votes) {
    const out = { for: 0, against: 0, abstain: 0, rows: [] }
    if (votes === null || votes === undefined) return out
    if (typeof votes === 'number') {
      if (!Number.isFinite(votes) || votes < 0) throw deny('VMU_INVALID_ARGUMENT', 'a numeric `votes` must be a non-negative decisive support count', 'or pass an array of { by, choice }')
      out.for = Math.floor(votes)
      return out
    }
    if (typeof votes === 'object' && !Array.isArray(votes)) {
      const f = Number.isFinite(votes.for) ? votes.for : 0
      const a = Number.isFinite(votes.against) ? votes.against : 0
      const ab = Number.isFinite(votes.abstain) ? votes.abstain : 0
      if (f < 0 || a < 0 || ab < 0) throw deny('VMU_INVALID_ARGUMENT', 'vote counts must be >= 0', 'e.g. { for: 3, against: 1, abstain: 1 }')
      return { for: f, against: a, abstain: ab, rows: [] }
    }
    if (!Array.isArray(votes)) throw deny('VMU_INVALID_ARGUMENT', '`votes` must be an array, a tally object or a number', 'e.g. [{ by: "alpha", choice: "for" }]')
    for (const v of votes) {
      if (!v || typeof v !== 'object' || typeof v.by !== 'string' || !v.by) throw deny('VMU_INVALID_ARGUMENT', 'every vote needs a non-empty `by`', 'e.g. { by: "alpha", choice: "for" }')
      const choice = v.choice === 'against' ? 'against' : (v.choice === 'abstain' ? 'abstain' : 'for')
      out[choice] += 1
      out.rows.push({ by: v.by, choice, at: now() })
    }
    return out
  }
}
