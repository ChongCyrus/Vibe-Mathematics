// vmu kernel · delegation — agent-to-agent authority delegation, with S-2 enforced BY THE MACHINE.
//
// Design source: docs/17-agent-society-and-delegation.md §4 (delegation & sub-delegation) and §20.2/§21.1
// (the `vmu.delegation.*` keys and the VMU_DELEGATION_* codes).
//
// S-2 (the hard invariant this module exists for): **a delegation may only NARROW authority** —
//   `child.scope ⊆ grantor.scope`, otherwise the grant is refused BY NAME (`VMU_DELEGATION_ESCALATION`)
//   with the offending items listed; and a recipient may never sub-delegate beyond what it received.
// The rest of the design follows from the same three questions:
//   · WHO has authority?  the seat (`members.may`), a declared root (`roots` / declareAuthority),
//     or an ACTIVE inbound delegation — never a reputation score, never a wish.
//   · HOW LONG?           `defaultTtlMs` / `maxTtlMs` (clamped = narrowing + disclosed), expiry is checked
//                         against the injected clock and NEVER silent (`VMU_DELEGATION_EXPIRED` + when).
//   · HOW MUCH?           `budget.tokens/turns` with `tokenShare`/`turnsShare` bounds on sub-delegation and
//                         `onExhausted` ∈ {refuse, return}.
// Invariants (same set as the rest of the kernel — see kernel/board.js / kernel/metrics.js):
//   · every refusal is NAMED (VMU_* + hint) — never a bare exception
//   · every upper bound reports how many items were DROPPED — never silent (list()/chain()/history())
//   · zero mechanism: no grants, no seat, no roots ⇒ check() answers "no delegation" — it never pretends
//     to authorise, and it never throws
//   · the only time source is the injected `clock`; ids are deterministic (`d-1`, `d-2`, …)
//   · READ paths (check/chain/list/history/status) never mutate the recorded grants
// SCOPE SEMANTICS (important): `commands`/`resources` are OPEN vocabularies of OPAQUE strings, compared by
// LITERAL equality — the kernel does not interpret wildcards, so a parent entry `task/*` does NOT cover a
// child entry `task/1`. `status().scopeMatch` says so at runtime; the refusal names the offending item.
// SETTINGS READ CONVENTION (kernel/guard.js): the key is read as a PLAIN LITERAL, because the settings table
// and the docs audit both discover "wired" keys by scanning file text for the literal.
export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

const K_MAX_DEPTH = 'vmu.delegation.maxDepth'
const K_SUBDELEGATE = 'vmu.delegation.subdelegateAllowed'
const K_DEFAULT_TTL = 'vmu.delegation.defaultTtlMs'
const K_MAX_TTL = 'vmu.delegation.maxTtlMs'
const K_REASON_REQUIRED = 'vmu.delegation.reasonRequired'
const K_TOKEN_SHARE = 'vmu.delegation.tokenShare'
const K_TURNS_SHARE = 'vmu.delegation.turnsShare'
const K_ON_EXHAUSTED = 'vmu.delegation.onExhausted'
const K_REVOKE_BROADCAST = 'vmu.delegation.revokeBroadcast'
const K_REQUIRE_EXPLICIT = 'vmu.delegation.requireExplicitScope'
const K_AUDIT_CHAINS = 'vmu.delegation.auditChains'

const DEFAULT_LIST_CAP = 200

/** The two scope dimensions. Both are OPEN vocabularies of opaque strings — the kernel never interprets them. */
export const SCOPE_KINDS = Object.freeze(['commands', 'resources'])

/**
 * createDelegation — the delegation ledger. `members` is the seat seam (`may(id, permission)`), `roots` are
 * actors whose authority does not come from a delegation (a chair, an office), `log`/`bus` are advisory.
 */
export function createDelegation({ clock = () => 0, log = null, settings = {}, bus = null, members = null, roots = null } = {}) {
  if (typeof clock !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createDelegation needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
  }

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (event) => {
    if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* logging must never break the delegation it records */ } }
  }

  const maxDepth = Number.isInteger(sget(K_MAX_DEPTH, 1)) && sget(K_MAX_DEPTH, 1) >= 1 ? sget(K_MAX_DEPTH, 1) : 1
  const subdelegateAllowed = sget(K_SUBDELEGATE, false) === true
  const defaultTtlMs = Number.isInteger(sget(K_DEFAULT_TTL, 0)) && sget(K_DEFAULT_TTL, 0) >= 0 ? sget(K_DEFAULT_TTL, 0) : 0
  const maxTtlMs = Number.isInteger(sget(K_MAX_TTL, 0)) && sget(K_MAX_TTL, 0) > 0 ? sget(K_MAX_TTL, 0) : 0
  const reasonRequired = sget(K_REASON_REQUIRED, true) !== false
  const tokenShareRaw = sget(K_TOKEN_SHARE, 1)
  const tokenShare = typeof tokenShareRaw === 'number' && tokenShareRaw >= 0 && tokenShareRaw <= 1 ? tokenShareRaw : 1
  const turnsShareRaw = sget(K_TURNS_SHARE, 1)
  const turnsShare = typeof turnsShareRaw === 'number' && turnsShareRaw >= 0 && turnsShareRaw <= 1 ? turnsShareRaw : 1
  const onExhausted = sget(K_ON_EXHAUSTED, 'refuse') === 'return' ? 'return' : 'refuse'
  const revokeBroadcast = sget(K_REVOKE_BROADCAST, true) !== false
  const requireExplicitScope = sget(K_REQUIRE_EXPLICIT, true) !== false
  const auditChains = sget(K_AUDIT_CHAINS, true) !== false

  // ── state (mutated only by grant/revoke/spend/declareAuthority) ─────────────────────────────────────
  const grants = new Map()   // id -> grant
  const order = []           // ids in insertion order (deterministic listing)
  const historyRows = []     // capped audit ring (overflow counted, never silent)
  const droppedHistory = { n: 0 }
  const refusals = new Map() // CODE -> count
  const unwiredHooks = new Map() // hook name -> times the bus could not take it (a counted wiring gap)
  const declaredTopics = new Set()
  const rootAuthority = new Map() // actor -> {commands:[], resources:[]}
  let seq = 0

  if (roots && typeof roots === 'object') {
    for (const actor of Object.keys(roots)) {
      const sc = roots[actor]
      if (sc && typeof sc === 'object') rootAuthority.set(actor, { commands: strList(sc.commands), resources: strList(sc.resources) })
    }
  }

  function strList(v) { return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [] }

  const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by)
  const objOf = (map) => { const o = {}; for (const k of [...map.keys()].sort()) o[k] = map.get(k); return o }
  const sumOf = (map) => [...map.values()].reduce((a, b) => a + b, 0)

  /**
   * Named refusal helper: a refusal is COUNTED BY CODE before it is thrown.
   * D3 (round 26): the refusal carries its EVALUATION SCOPE — `enforcedScope:'evaluated-so-far'` states that any
   * key list travelling with it is "what was consulted SO FAR", never the operation's full key set.
   */
  const ENFORCED_SCOPE = 'evaluated-so-far'
  const deny = (code, message, hint) => {
    bump(refusals, code, 1)
    say({ type: 'delegation/refused', at: clock(), code, message, enforcedScope: ENFORCED_SCOPE })
    return Object.assign(refuse(code, message, hint), { enforcedScope: ENFORCED_SCOPE })
  }
  const record = (row) => {
    historyRows.push(Object.assign({ at: clock() }, row))
    while (historyRows.length > DEFAULT_LIST_CAP) { historyRows.shift(); droppedHistory.n += 1 }
  }
  /** Advisory hook: declare the topic when the bus supports it, else COUNT the wiring gap (never silent). */
  const fire = (hook, payload) => {
    if (!bus || typeof bus.emit !== 'function') { bump(unwiredHooks, hook, 1); return }
    try {
      if (!declaredTopics.has(hook) && typeof bus.declareTopic === 'function') { bus.declareTopic(hook); declaredTopics.add(hook) }
      bus.emit(hook, Object.assign({ at: clock() }, payload))
      declaredTopics.add(hook)
    } catch (e) {
      bump(unwiredHooks, hook, 1)
      say({ type: 'delegation/hook-unwired', at: clock(), hook, why: String((e && e.message) || e) })
    }
  }

  const now = () => clock()
  const normalizeScope = (scope, { label = 'scope' } = {}) => {
    if (scope === null || scope === undefined || typeof scope !== 'object') {
      throw deny('VMU_INVALID_ARGUMENT', label + ' must be an object with commands[] and/or resources[]', 'e.g. { commands: ["task/create"], resources: ["task/*"] }')
    }
    const out = { commands: strList(scope.commands), resources: strList(scope.resources) }
    if (Array.isArray(scope.commands) && out.commands.length !== scope.commands.length) {
      throw deny('VMU_INVALID_ARGUMENT', label + '.commands may only contain non-empty strings', 'the kernel treats scope entries as opaque strings')
    }
    if (Array.isArray(scope.resources) && out.resources.length !== scope.resources.length) {
      throw deny('VMU_INVALID_ARGUMENT', label + '.resources may only contain non-empty strings', 'the kernel treats scope entries as opaque strings')
    }
    return out
  }
  const emptyScope = (sc) => sc.commands.length === 0 && sc.resources.length === 0
  const missing = (child, parent) => child.filter((x) => !parent.includes(x))
  const unionScope = (a, b) => ({ commands: [...new Set(a.commands.concat(b.commands))], resources: [...new Set(a.resources.concat(b.resources))] })
  const grantOf = (id) => grants.get(id) || null
  const ancestorsOf = (grant) => {
    const out = []
    let cur = grant
    const guard = new Set([grant.id])
    while (cur && cur.parentId) {
      const parent = grants.get(cur.parentId)
      if (!parent || guard.has(parent.id)) break
      guard.add(parent.id)
      out.push(parent)
      cur = parent
    }
    return out
  }
  /** A grant is active iff it is not revoked, not expired, and NO ancestor is revoked/expired. */
  const inactiveReason = (grant) => {
    if (grant.revokedAt !== null) {
      // A cascade keeps the ORIGIN visible: an ancestor revocation is reported as such, not as "this grant".
      if (grant.revokedByAncestor) return { why: 'ancestor-revoked', at: grant.revokedAt, by: grant.revokedBy, id: grant.revokedByAncestor, of: grant.id }
      return { why: 'revoked', at: grant.revokedAt, by: grant.revokedBy, id: grant.id }
    }
    if (typeof grant.expiresAt === 'number' && now() >= grant.expiresAt) return { why: 'expired', at: grant.expiresAt, id: grant.id }
    for (const a of ancestorsOf(grant)) {
      if (a.revokedAt !== null) return { why: 'ancestor-revoked', at: a.revokedAt, by: a.revokedBy, id: a.id, of: grant.id }
      if (typeof a.expiresAt === 'number' && now() >= a.expiresAt) return { why: 'ancestor-expired', at: a.expiresAt, id: a.id, of: grant.id }
    }
    return null
  }
  const isActive = (grant) => inactiveReason(grant) === null
  const inbound = (actor) => order.map((id) => grants.get(id)).filter((g) => g && g.to === actor)
  const activeInbound = (actor) => inbound(actor).filter(isActive)
  const covering = (actor, kind, item) => activeInbound(actor).filter((g) => g.scope[kind].includes(item))

  /** Does `actor` hold authority over `item` of `kind` WITHOUT a delegation? (seat or declared root) */
  const ownAuthority = (actor, kind, item) => {
    const root = rootAuthority.get(actor)
    if (root && root[kind].includes(item)) return { ok: true, source: 'root' }
    if (members && typeof members.may === 'function') {
      try {
        const asked = members.may(actor, item)
        if (asked && asked.allowed === true) return { ok: true, source: 'seat', slot: asked.slot }
      } catch (e) { /* a seat seam that cannot answer is treated as "no authority" — fail closed */ }
    }
    return { ok: false, source: null }
  }
  const authorityOf = (actor, kind, item) => {
    const own = ownAuthority(actor, kind, item)
    if (own.ok) return own
    const via = covering(actor, kind, item)
    if (via.length) return { ok: true, source: 'delegation', grantId: via[0].id }
    return { ok: false, source: null }
  }
  const depthOf = (actor) => {
    const ins = activeInbound(actor)
    return ins.length ? Math.max(...ins.map((g) => g.depth)) + 1 : 1
  }
  const chainIds = (grant) => [grant.id].concat(ancestorsOf(grant).map((g) => g.id))
  const chainText = (grant) => chainIds(grant).join(' <- ')

  return {
    apiVersion,

    /**
     * Grant a NARROWED scope. Refused by name when the grantor has no authority over any requested item
     * (S-2), when the depth is over the declared maximum, when a cycle would form, or when a reason is missing.
     */
    grant({ from, to, scope, ttlMs = null, reason = null, budget = null, parentId = null } = {}) {
      if (typeof from !== 'string' || !from) throw deny('VMU_INVALID_ARGUMENT', 'grant needs a non-empty `from` (the grantor)', 'e.g. { from: "chair", to: "assistant", scope: {...} }')
      if (typeof to !== 'string' || !to) throw deny('VMU_INVALID_ARGUMENT', 'grant needs a non-empty `to` (the delegate)', 'e.g. { from: "chair", to: "assistant", scope: {...} }')
      if (from === to) throw deny('VMU_INVALID_ARGUMENT', 'a delegation needs two distinct parties: ' + from + ' cannot delegate to itself', 'self-delegation is a no-op that only creates a loop')
      if (reasonRequired && (typeof reason !== 'string' || !reason.trim())) {
        throw deny('VMU_DELEGATION_REASON_REQUIRED', 'a delegation must state why it exists (S-4)', 'set reason, or vmu.delegation.reasonRequired=false')
      }
      const sc = normalizeScope(scope)
      if (requireExplicitScope && emptyScope(sc)) {
        throw deny('VMU_INVALID_ARGUMENT', 'the delegated scope is empty: an explicit command and/or resource set is required', 'set vmu.delegation.requireExplicitScope=false only if an empty grant is meaningful')
      }

      // ── S-2: every requested item must be covered by the grantor's authority ─────────────────────────
      const offending = { commands: [], resources: [] }
      for (const kind of SCOPE_KINDS) for (const item of sc[kind]) if (!authorityOf(from, kind, item).ok) offending[kind].push(item)
      if (offending.commands.length || offending.resources.length) {
        const parts = []
        if (offending.commands.length) parts.push('commands[' + offending.commands.join(', ') + ']')
        if (offending.resources.length) parts.push('resources[' + offending.resources.join(', ') + ']')
        throw deny('VMU_DELEGATION_ESCALATION',
          'the delegation would EXPAND authority (S-2): ' + from + ' has no authority over ' + parts.join(' '),
          'a delegation may only narrow: ' + from + ' holds ' + describeAuthority(from) + ' — drop the offending items or delegate them from an actor that holds them')
      }

      // ── chain, depth, cycles, sub-delegation policy ─────────────────────────────────────────────────
      const inboundActive = activeInbound(from)
      const parent = parentId === null ? (inboundActive.length ? inboundActive[0] : null) : grantOf(parentId)
      if (parentId !== null) {
        if (!parent) throw deny('VMU_NO_SUCH_OBJECT', 'unknown parent delegation: ' + String(parentId), 'known: ' + (order.join(', ') || '(none)'))
        if (parent.to !== from) throw deny('VMU_STATE', 'the parent delegation is not held by ' + from + ': ' + parent.id + ' was granted to ' + parent.to, 'the parent of a sub-delegation must be held by the sub-grantor')
      }
      const depth = parent ? parent.depth + 1 : depthOf(from)
      const sub = depth > 1
      if (sub && !subdelegateAllowed) {
        throw deny('VMU_DELEGATION_DEPTH', 'sub-delegation is disabled (vmu.delegation.subdelegateAllowed=false): ' + from + ' acts under ' + chainText(parent),
          'the default is "no re-delegation" — set vmu.delegation.subdelegateAllowed=true to allow it (then vmu.delegation.maxDepth applies)')
      }
      if (depth > maxDepth) {
        throw deny('VMU_DELEGATION_DEPTH', 'delegation depth ' + depth + ' exceeds vmu.delegation.maxDepth=' + maxDepth + ' (chain ' + (parent ? chainText(parent) : from) + ')',
          'raise vmu.delegation.maxDepth, or delegate directly from an actor closer to the root')
      }
      if (parent && (to === from || ancestorsOf(parent).some((a) => a.from === to) || parent.from === to)) {
        throw deny('VMU_DELEGATION_DEPTH', 'the delegation would form a CYCLE: ' + [to, from].concat(chainIds(parent)).join(' -> '),
          'a delegation chain must stay acyclic — hand the scope to a party that is not already upstream')
      }
      if (order.some((id) => { const g = grants.get(id); return g && g.from === from && g.to === to && isActive(g) })) {
        throw deny('VMU_STATE', 'an ACTIVE delegation already exists for ' + from + ' -> ' + to, 'revoke it first, or delegate a different scope to another party')
      }

      // ── TTL (clamping NARROWS, and the clamp is disclosed) ──────────────────────────────────────────
      let ttl = ttlMs === null ? defaultTtlMs : ttlMs
      if (!(Number.isInteger(ttl) && ttl >= 0)) throw deny('VMU_INVALID_ARGUMENT', 'ttlMs must be an integer >= 0 (0 = no expiry)', 'omit it to use vmu.delegation.defaultTtlMs')
      let ttlClamped = false
      if (maxTtlMs > 0 && ttl > maxTtlMs) { ttl = maxTtlMs; ttlClamped = true }

      // ── budget (sub-delegation may only pass on a SHARE of what remains) ────────────────────────────
      const childBudget = normalizeBudget(budget, { parent, from })
      const id = 'd-' + (++seq)
      const g = {
        id, from, to,
        scope: sc,
        grantedAt: now(),
        expiresAt: ttl > 0 ? now() + ttl : null,
        ttlMs: ttl,
        depth,
        parentId: parent ? parent.id : null,
        reason: reason === null ? null : String(reason),
        budget: childBudget,
        revokedAt: null, revokedBy: null, revokedReason: null,
      }
      grants.set(id, g)
      order.push(id)
      record({ type: 'delegation/granted', id, from, to, depth, expiresAt: g.expiresAt, ttlClamped, why: g.reason })
      say({ type: 'delegation/granted', at: g.grantedAt, id, from, to, scope: sc, depth, expiresAt: g.expiresAt, why: g.reason })
      fire('delegation/granted', { id, from, to, depth, expiresAt: g.expiresAt })
      return { ok: true, id, from, to, scope: sc, grantedAt: g.grantedAt, expiresAt: g.expiresAt, ttlMs: ttl, ttlClamped, depth, parentId: g.parentId, chain: chainIds(g), reason: g.reason, budget: budgetView(g) }
    },

    /**
     * Revoke immediately (the delegate loses the authority on the NEXT check — there is no grace window).
     * Only the grantor, an actor upstream in its chain, or a declared root may revoke.
     */
    revoke({ id, by, reason = null } = {}) {
      const g = grantOf(id)
      if (!g) throw deny('VMU_NO_SUCH_OBJECT', 'unknown delegation: ' + String(id), 'known: ' + (order.join(', ') || '(none)'))
      if (typeof by !== 'string' || !by) throw deny('VMU_INVALID_ARGUMENT', 'revoke needs a non-empty `by` (who revokes)', 'the revocation is audited: docs/17 §4')
      const upstream = [g.from].concat(ancestorsOf(g).map((a) => a.from))
      const allowed = by === g.from || upstream.includes(by) || rootAuthority.has(by)
      if (!allowed) {
        throw deny('VMU_NOT_PERMITTED', by + ' may not revoke ' + g.id + ' (granted by ' + g.from + ')',
          'revocation rights belong to the grantor, an actor upstream in the chain (' + upstream.join(' -> ') + '), or a declared root')
      }
      if (g.revokedAt !== null) return { ok: true, id: g.id, already: true, revokedAt: g.revokedAt, by: g.revokedBy }
      g.revokedAt = now(); g.revokedBy = by; g.revokedReason = reason === null ? null : String(reason)
      const cascaded = []
      for (const id2 of order) {
        const child = grants.get(id2)
        if (!child || child.revokedAt !== null) continue
        if (ancestorsOf(child).some((a) => a.id === g.id)) {
          child.revokedAt = g.revokedAt; child.revokedBy = by; child.revokedReason = 'ancestor ' + g.id + ' revoked'
          child.revokedByAncestor = g.id
          cascaded.push(child.id)
        }
      }
      record({ type: 'delegation/revoked', id: g.id, from: g.from, to: g.to, by, why: g.revokedReason, cascaded })
      say({ type: 'delegation/revoked', at: g.revokedAt, id: g.id, by, why: g.revokedReason, cascaded })
      if (revokeBroadcast) fire('delegation/revoked', { id: g.id, by, cascaded })
      return { ok: true, id: g.id, revokedAt: g.revokedAt, by, reason: g.revokedReason, cascaded }
    },

    /**
     * May `actor` do `action`? Answers from the seat, a declared root, or an ACTIVE delegation — and when the
     * only covering delegation is inactive it REFUSES BY NAME (expired/revoked, with the time), never silently.
     * With no delegation and no seat authority it answers { allowed:false, source:'none' } — it never pretends.
     */
    check({ actor, action, scope = null } = {}) {
      if (typeof actor !== 'string' || !actor) throw deny('VMU_INVALID_ARGUMENT', 'check needs a non-empty `actor`', 'e.g. { actor: "assistant", action: "task/create" }')
      if (typeof action !== 'string' || !action) throw deny('VMU_INVALID_ARGUMENT', 'check needs a non-empty `action`', 'the action is an opaque string compared against scope.commands')
      const own = ownAuthority(actor, 'commands', action)
      if (own.ok) return { ok: true, allowed: true, actor, action, source: own.source, slot: own.slot || null, at: now() }

      const wanted = scope === null ? null : normalizeScope(scope, { label: 'requested scope' })
      const candidates = inbound(actor).filter((g) => g.scope.commands.includes(action))
      if (wanted) {
        for (const kind of SCOPE_KINDS) for (const item of wanted[kind]) {
          if (!candidates.some((g) => g.scope[kind].includes(item))) {
            const best = candidates[0] || null
            throw deny('VMU_DELEGATION_ESCALATION',
              'the requested scope is not covered by any delegation to ' + actor + ': ' + kind + '[' + item + ']',
              best ? 'nearest delegation ' + best.id + ' covers commands[' + best.scope.commands.join(', ') + '] resources[' + best.scope.resources.join(', ') + ']' : 'no delegation to ' + actor + ' covers ' + action)
          }
        }
      }
      if (candidates.length === 0) {
        return { ok: true, allowed: false, actor, action, source: 'none', reason: 'no delegation and no seat authority for "' + action + '"', at: now() }
      }
      const active = candidates.filter(isActive)
      if (active.length === 0) {
        const why = inactiveReason(candidates[0])
        const at = why && typeof why.at === 'number' ? why.at + 'ms' : 'unknown time'
        throw deny('VMU_DELEGATION_EXPIRED',
          'the delegation covering "' + action + '" is no longer valid: ' + (why ? why.why : 'inactive') + ' (' + (why ? why.id : '?') + ' at ' + at + ')',
          why && why.why === 'expired' ? 'grant a new delegation, or raise vmu.delegation.defaultTtlMs (it expired at ' + at + ')'
            : 'the delegation was revoked' + (why && why.by ? ' by ' + why.by : '') + ' at ' + at + ' — grant a new one if the work must continue')
      }
      const via = active[0]
      return {
        ok: true, allowed: true, actor, action, source: 'delegation', grantId: via.id,
        depth: via.depth, expiresAt: via.expiresAt,
        chain: auditChains ? chainIds(via) : null,
        at: now(),
      }
    },

    /** Read-only: the delegation chain an actor currently acts under (with per-link active flags). */
    chain({ actor, limit = DEFAULT_LIST_CAP } = {}) {
      if (typeof actor !== 'string' || !actor) throw deny('VMU_INVALID_ARGUMENT', 'chain needs a non-empty `actor`', 'e.g. { actor: "assistant" }')
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const ins = inbound(actor)
      const best = ins.find(isActive) || ins[0] || null
      if (!best) return { ok: true, actor, links: [], hops: 0, root: null, available: 0, dropped: 0, truncated: false, note: 'no delegation: this actor acts on its own seat authority' }
      const links = [best].concat(ancestorsOf(best)).map((g) => {
        const why = inactiveReason(g)
        return { id: g.id, from: g.from, to: g.to, depth: g.depth, active: why === null, expiresAt: g.expiresAt, revokedAt: g.revokedAt, revokedBy: g.revokedBy, inactiveWhy: why ? why.why : null }
      })
      const kept = links.slice(0, cap)
      return { ok: true, actor, links: kept, hops: kept.length, root: kept.length ? kept[kept.length - 1].from : null, available: links.length, dropped: links.length - kept.length, truncated: links.length > kept.length }
    },

    /** Read-only. Bounded: a `limit` below what is available reports the DROPPED count (never silent). */
    list({ limit = DEFAULT_LIST_CAP, active = null } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      let all = order.map((id) => grants.get(id)).filter(Boolean)
      if (active === true) all = all.filter(isActive)
      if (active === false) all = all.filter((g) => !isActive(g))
      const kept = all.slice(0, cap).map((g) => {
        const why = inactiveReason(g)
        return { id: g.id, from: g.from, to: g.to, scope: { commands: g.scope.commands.slice(), resources: g.scope.resources.slice() }, depth: g.depth, parentId: g.parentId, grantedAt: g.grantedAt, expiresAt: g.expiresAt, active: why === null, inactiveWhy: why ? why.why : null, reason: g.reason, budget: budgetView(g) }
      })
      return { ok: true, grants: kept, count: kept.length, available: all.length, dropped: all.length - kept.length, truncated: all.length > kept.length, configured: order.length > 0 }
    },

    /** Read-only: the audit trail (a capped ring; drops are counted). */
    history({ id = null, actor = null, limit = DEFAULT_LIST_CAP } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const rows = historyRows.filter((r) => (id === null || r.id === id) && (actor === null || r.from === actor || r.to === actor))
      const kept = rows.slice(Math.max(0, rows.length - cap)).map((r) => Object.assign({}, r))
      return { ok: true, rows: kept, count: kept.length, available: rows.length, dropped: rows.length - kept.length, ringDropped: droppedHistory.n, truncated: rows.length > kept.length }
    },

    /** Spend a delegation's budget. Exhaustion either refuses by name or RETURNS the delegation (`onExhausted`). */
    spend({ id, tokens = 0, turns = 0 } = {}) {
      const g = grantOf(id)
      if (!g) throw deny('VMU_NO_SUCH_OBJECT', 'unknown delegation: ' + String(id), 'known: ' + (order.join(', ') || '(none)'))
      if (g.revokedAt !== null) throw deny('VMU_DELEGATION_EXPIRED', 'the delegation was revoked at ' + g.revokedAt + 'ms' + (g.revokedBy ? ' by ' + g.revokedBy : ''), 'grant a new delegation if the work must continue')
      const why = inactiveReason(g)
      if (why) throw deny('VMU_DELEGATION_EXPIRED', 'the delegation is ' + why.why + ' (' + why.id + ' at ' + why.at + 'ms)', 'grant a new delegation, or raise the TTL/grant again')
      if (!(Number.isInteger(tokens) && tokens >= 0) || !(Number.isInteger(turns) && turns >= 0)) {
        throw deny('VMU_INVALID_ARGUMENT', 'spend takes non-negative integer `tokens` and `turns`', 'e.g. { id: "d-1", tokens: 100 }')
      }
      if (g.budget.tokens === null && g.budget.turns === null) return { ok: true, id: g.id, budgeted: false, note: 'this delegation carries no budget' }
      const overTokens = g.budget.tokens !== null && g.budget.spentTokens + tokens > g.budget.tokens
      const overTurns = g.budget.turns !== null && g.budget.spentTurns + turns > g.budget.turns
      if (overTokens || overTurns) {
        const remaining = budgetView(g)
        if (onExhausted === 'return') {
          const at = now()
          g.revokedAt = at; g.revokedBy = 'budget-exhausted'; g.revokedReason = 'budget exhausted on ' + g.id
          record({ type: 'delegation/returned', id: g.id, why: 'budget-exhausted', remaining })
          say({ type: 'delegation/returned', at, id: g.id, remaining })
          fire('delegation/revoked', { id: g.id, by: 'budget-exhausted', cascaded: [] })
          return { ok: true, id: g.id, exhausted: true, returned: true, remaining, at }
        }
        throw deny('VMU_DELEGATION_BUDGET', 'delegation budget exceeded: requested tokens=' + tokens + ' turns=' + turns + ' but remaining is tokensRemaining=' + remaining.tokensRemaining + ' turnsRemaining=' + remaining.turnsRemaining,
          'ask the grantor for a larger delegation, or set vmu.delegation.onExhausted=return so the delegation returns itself')
      }
      g.budget.spentTokens += tokens
      g.budget.spentTurns += turns
      const remaining = budgetView(g)
      const exhausted = (g.budget.tokens !== null && remaining.tokensRemaining <= 0) || (g.budget.turns !== null && remaining.turnsRemaining <= 0)
      record({ type: 'delegation/spent', id: g.id, tokens, turns, remaining })
      return { ok: true, id: g.id, spent: { tokens, turns }, remaining, exhausted }
    },

    /** Declare authority that does NOT come from a delegation (a chair/office seat, docs/17 §4). */
    declareAuthority({ actor, scope, reason = null } = {}) {
      if (typeof actor !== 'string' || !actor) throw deny('VMU_INVALID_ARGUMENT', 'declareAuthority needs a non-empty `actor`', 'e.g. { actor: "chair", scope: { commands: ["meeting/close"] } }')
      const sc = normalizeScope(scope, { label: 'authority scope' })
      if (emptyScope(sc)) throw deny('VMU_INVALID_ARGUMENT', 'a declared authority must contain at least one command or resource', 'an empty root authority authorises nothing')
      if (reasonRequired && (typeof reason !== 'string' || !reason.trim())) {
        throw deny('VMU_DELEGATION_REASON_REQUIRED', 'declaring root authority must state why (S-4)', 'set reason, or vmu.delegation.reasonRequired=false')
      }
      const existing = rootAuthority.get(actor) || { commands: [], resources: [] }
      rootAuthority.set(actor, unionScope(existing, sc))
      record({ type: 'delegation/authority-declared', actor, scope: sc, why: reason === null ? null : String(reason) })
      say({ type: 'delegation/authority-declared', at: now(), actor, scope: sc, why: reason })
      return { ok: true, actor, scope: rootAuthority.get(actor) }
    },

    /** Read-only self-report. */
    status() {
      const all = order.map((id) => grants.get(id)).filter(Boolean)
      const activeCount = all.filter(isActive).length
      const expiredCount = all.filter((g) => g.revokedAt === null && inactiveReason(g)).length
      const revokedCount = all.filter((g) => g.revokedAt !== null).length
      return {
        ok: true,
        configured: all.length > 0 || rootAuthority.size > 0,
        grants: { total: all.length, active: activeCount, expired: expiredCount, revoked: revokedCount },
        maxDepth, subdelegateAllowed, defaultTtlMs, maxTtlMs, reasonRequired,
        tokenShare, turnsShare, onExhausted, revokeBroadcast, requireExplicitScope, auditChains,
        scopeMatch: 'literal',
        scopeMatchNote: 'scope entries are opaque strings compared by LITERAL equality (no wildcard interpretation): a parent entry "task/*" does not cover "task/1"',
        roots: [...rootAuthority.keys()].sort(),
        membersInjected: !!(members && typeof members.may === 'function'),
        busInjected: !!(bus && typeof bus.emit === 'function'),
        listCap: DEFAULT_LIST_CAP,
        historyRows: historyRows.length,
        historyDropped: droppedHistory.n,
        refusals: objOf(refusals),
        refusalsTotal: sumOf(refusals),
        unwiredHooks: objOf(unwiredHooks),
        unwiredHooksTotal: sumOf(unwiredHooks),
        at: now(),
        note: 'S-2 is enforced here: a delegation can only narrow (docs/17 §4); an inactive delegation is reported by name, never silently ignored',
      }
    },
  }

  // ── helpers that need `grants`/`order` but are not part of the public surface ──────────────────────
  function budgetView(g) {
    const b = g.budget
    return {
      tokens: b.tokens, turns: b.turns, spentTokens: b.spentTokens, spentTurns: b.spentTurns,
      tokensRemaining: b.tokens === null ? null : Math.max(0, b.tokens - b.spentTokens),
      turnsRemaining: b.turns === null ? null : Math.max(0, b.turns - b.spentTurns),
    }
  }
  function normalizeBudget(budget, { parent, from }) {
    const out = { tokens: null, turns: null, spentTokens: 0, spentTurns: 0 }
    if (budget === null || budget === undefined) return out
    if (typeof budget !== 'object') throw deny('VMU_INVALID_ARGUMENT', 'budget must be an object with optional tokens/turns', 'e.g. { tokens: 1000, turns: 20 }')
    for (const [kind, share] of [['tokens', tokenShare], ['turns', turnsShare]]) {
      const v = budget[kind]
      if (v === null || v === undefined) continue
      if (!(Number.isInteger(v) && v >= 0)) throw deny('VMU_INVALID_ARGUMENT', 'budget.' + kind + ' must be an integer >= 0', 'omit it for "no ' + kind + ' budget"')
      if (parent) {
        const pb = budgetView(parent)
        const remain = kind === 'tokens' ? pb.tokensRemaining : pb.turnsRemaining
        if (remain !== null) {
          const allowedMax = Math.floor(remain * share)
          if (v > allowedMax) {
            throw deny('VMU_DELEGATION_BUDGET', 'sub-delegation of ' + kind + ' would exceed the parent: requested ' + v + ' but ' + parent.id + ' leaves ' + remain + ' and vmu.delegation.' + kind + 'Share=' + share + ' allows at most ' + allowedMax,
              'a sub-delegation may only pass on a SHARE of what remains (' + parent.id + '); lower the request or raise the share')
          }
        }
      }
      out[kind] = v
    }
    return out
  }
  function describeAuthority(actor) {
    const bits = []
    const root = rootAuthority.get(actor)
    if (root) bits.push('declared authority commands[' + root.commands.join(', ') + '] resources[' + root.resources.join(', ') + ']')
    const ins = activeInbound(actor)
    if (ins.length) bits.push('delegations ' + ins.map((g) => g.id + ' commands[' + g.scope.commands.join(', ') + ']').join(' + '))
    if (members && typeof members.may === 'function') {
      // Name what the SEAT actually holds when the seam can enumerate it (the refusal must be diagnosable).
      let held = null
      try {
        const roster = typeof members.roster === 'function' ? members.roster() : null
        const roles = typeof members.roles === 'function' ? members.roles() : null
        const list = Array.isArray(roster) ? roster : (roster && Array.isArray(roster.members) ? roster.members : null)
        const slots = Array.isArray(roles) ? roles : (roles && Array.isArray(roles.slots) ? roles.slots : null)
        if (list && slots) {
          const me = list.find((m) => m && m.id === actor)
          const slot = me ? slots.find((s) => s && s.id === me.slot) : null
          if (slot && Array.isArray(slot.permissions)) held = slot.permissions
        }
      } catch (e) { /* enumeration is best-effort: the generic phrase below still tells the truth */ }
      bits.push(held ? 'its seat permissions [' + held.join(', ') + ']' : 'its seat permissions (kernel.members.may)')
    }
    return bits.length ? bits.join(' + ') : 'NO authority at all'
  }
}
