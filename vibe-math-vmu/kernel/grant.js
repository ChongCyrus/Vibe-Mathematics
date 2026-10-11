// vmu grant — TEMPORARY, SCOPED, SINGLE-COMMAND AUTHORIZATION (ported from the v5r line, #47).
//
// WHY THIS EXISTS: v5r had `vibe_v5_grant` and vmu had nothing equivalent (measured: no primitive, only weak
// traces like an idempotency `usedAt`). Its semantics were read off the reference rather than invented:
//   · the commands that may be granted are an ENUMERATED list (v5r: assign / prioritize / nudge / convene);
//   · a grant has a SCOPE (v5r: meeting / verify / once) - a window, not an open door;
//   · it expires, it is used at most once in the `once` scope, and every decision is recorded;
//   · the TARGET must be a roster member, and that is checked BEFORE anything is written (D8).
//
// WHAT IT IS NOT: not an authentication system and not a policy engine. It answers exactly one question - "may
// THIS member run THIS command right now, under a grant someone explicitly gave?" - and it answers NO by name.
//
// The framework's shape: settings may declare the allowlist and the default window, middleware may observe the
// decisions, and a pack may declare which commands its line grants. The kernel only keeps the ledger and the gate.

/** Refusal/success receipts carry the key set this call evaluated, so "so far" is never presented as "all". */
export const ENFORCED_SCOPE = 'evaluated-so-far'

/** The commands a grant may name. A pack may narrow this; it may not invent outside it without saying so. */
export const GRANTABLE_COMMANDS = Object.freeze(['assign', 'prioritize', 'nudge', 'convene'])

/** The windows a grant may use: tied to a meeting, tied to a verify round, or exactly one use. */
export const GRANT_SCOPES = Object.freeze(['meeting', 'verify', 'once'])

/** The keys this face reads. Declared here so the registry can see them (docs/04 is the human table). */
export const WIRED_KEYS = Object.freeze([
  'vmu.grant.enabled', 'vmu.grant.commands', 'vmu.grant.defaultScope', 'vmu.grant.maxOpenGrants',
])

const DEFAULTS = Object.freeze({
  'vmu.grant.enabled': false,             // zero mechanism: nothing may be granted until a pack turns it on
  'vmu.grant.commands': GRANTABLE_COMMANDS.slice(),
  'vmu.grant.defaultScope': 'once',
  'vmu.grant.maxOpenGrants': 32,
})

const str = (v) => (typeof v === 'string' ? v : '')
const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const listOr = (v) => (Array.isArray(v) ? v.map(String) : [])
const mark = (list, key) => { if (!list.includes(key)) list.push(key); return list }

export function createGrant({ clock = () => 0, log = null, settings = {}, bus = null, members = null } = {}) {
  if (typeof clock !== 'function') {
    return { ok: false, code: 'VMU_INVALID_ARGUMENT', message: 'createGrant needs a clock function',
      hint: 'pass { clock: () => ms }', enforced: [], fired: [], enforcedScope: ENFORCED_SCOPE, wouldEvaluate: [] }
  }
  const sget = (key) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? DEFAULTS[key] : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return DEFAULTS[key]
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* advisory */ } } }
  const emit = (ev) => { if (bus && typeof bus.emit === 'function') { try { bus.emit(ev) } catch (e) { /* advisory */ } } }

  const K = {
    enabled: sget('vmu.grant.enabled') === true,
    commands: listOr(sget('vmu.grant.commands')),
    defaultScope: GRANT_SCOPES.includes(sget('vmu.grant.defaultScope')) ? sget('vmu.grant.defaultScope') : 'once',
    maxOpen: intOr(sget('vmu.grant.maxOpenGrants'), 32),
  }

  const counters = { granted: 0, refused: 0, used: 0, revoked: 0, expired: 0 }
  const grants = new Map()
  let seq = 0

  const deny = (code, message, hint, enforced = [], extra = null, fired = []) => {
    counters.refused += 1
    const list = [...new Set(enforced)]
    const firedKeys = [...new Set(fired)].filter((k) => list.includes(k))
    say({ type: 'grant/refused', at: clock(), code, message, enforced: list, fired: firedKeys, enforcedScope: ENFORCED_SCOPE })
    return Object.assign({ ok: false, code, message, hint: hint || null, at: clock() },
      { enforced: list, fired: firedKeys, enforcedScope: ENFORCED_SCOPE, wouldEvaluate: list.slice() }, extra || {})
  }
  const receipt = (obj, enforced, fired) => {
    const list = [...new Set(enforced)]
    const firedKeys = [...new Set(fired)].filter((k) => list.includes(k))
    return Object.assign({ ok: true }, obj, { enforced: list, fired: firedKeys, enforcedScope: ENFORCED_SCOPE, wouldEvaluate: list.slice() })
  }

  /** Is `memberId` a roster member? Asked BEFORE anything is written (D8: a non-member is refused first). */
  const isMember = (memberId) => {
    if (members === null || members === undefined) return { known: false, ok: true }   // no roster injected: cannot check, does not block
    let roster = null
    try { roster = typeof members.roster === 'function' ? members.roster() : (Array.isArray(members) ? members : null) } catch (e) { roster = null }
    if (!Array.isArray(roster)) return { known: false, ok: true }
    const ids = roster.map((m) => String(m && m.id !== undefined ? m.id : m))
    return { known: true, ok: ids.includes(String(memberId)), ids }
  }

  const expiredAt = (g) => (g.expiresOn === null ? null : g.expiresOn)

  /** A grant is ACTIVE only while its window holds: not revoked, not expired, and not already spent in `once`. */
  const active = (g, { at = null, meeting = null, verifyTarget = null } = {}) => {
    const now = at === null ? clock() : at
    if (g.revokedAt !== null) return { active: false, reason: 'the grant was revoked' }
    if (expiredAt(g) !== null && now > expiredAt(g)) return { active: false, reason: 'the grant expired at ' + expiredAt(g) + 'ms' }
    if (g.grantScope === 'once') return g.usedAt === 0 ? { active: true, reason: 'unused, one-shot' } : { active: false, reason: 'the one-shot grant was already used' }
    if (g.grantScope === 'meeting') {
      if (meeting === null) return { active: false, reason: 'the grant is scoped to a meeting and none was named' }
      return String(g.meetingId) === String(meeting) ? { active: true, reason: 'the named meeting is in progress' } : { active: false, reason: 'the grant is scoped to meeting ' + g.meetingId }
    }
    if (g.grantScope === 'verify') {
      if (verifyTarget === null) return { active: false, reason: 'the grant is scoped to a verify target and none was named' }
      return String(g.verifyTarget) === String(verifyTarget) ? { active: true, reason: 'the named verify target is under way' } : { active: false, reason: 'the grant is scoped to verify target ' + g.verifyTarget }
    }
    return { active: false, reason: 'unknown scope: ' + g.grantScope }
  }

  const api = {
    apiVersion: 1,

    /** Give a member ONE enumerated command, inside a window. `by` is who gives it; `to` is who receives it. */
    grant({ to = null, command = null, scope = null, expiresOn = null, meetingId = null, verifyTarget = null, why = null, by = null, at = null } = {}) {
      const enforced = []
      const fired = []
      mark(enforced, 'vmu.grant.enabled')
      // ROUND 90: `commands` is EVALUATED on every grant call (the enumerated check below runs unconditionally),
      // so it belongs in `enforced` and not only in `fired` - the C2 gate caught exactly that: a key that decides
      // the outcome while missing from the list of keys the call evaluated.
      mark(enforced, 'vmu.grant.commands')
      // ROUND 91: the DEFAULT SCOPE decides the outcome when the caller names none, so it is evaluated on
      // every call and must be reported as such - the same defect the C2 gate found for commands.
      mark(enforced, 'vmu.grant.defaultScope')
      if (!K.enabled) {
        mark(fired, 'vmu.grant.enabled')
        return deny('VMU_NOT_PERMITTED', 'vmu.grant.enabled=false: this face grants nothing (zero mechanism)',
          'set vmu.grant.enabled=true in a pack to open the gate', enforced, null, fired)
      }
      const who = isMember(to)
      if (who.known && !who.ok) {
        return deny('VMU_NOT_MEMBER', 'grant target "' + String(to) + '" is not on the roster',
          'known members: ' + who.ids.join(', ') + ' - the check runs BEFORE anything is written (D8)', enforced, { to })
      }
      if (typeof command !== 'string' || !K.commands.includes(command)) {
        mark(fired, 'vmu.grant.commands')
        return deny('VMU_INVALID_ARGUMENT', 'command "' + String(command) + '" is not grantable here',
          'grantable: ' + (K.commands.join(', ') || '(none declared)') + ' (vmu.grant.commands)', enforced, { command }, fired)
      }
      const sc = scope === null ? K.defaultScope : scope
      if (!GRANT_SCOPES.includes(sc)) {
        return deny('VMU_INVALID_ARGUMENT', 'scope "' + String(sc) + '" is not one of ' + GRANT_SCOPES.join(', '),
          'a grant is a WINDOW, not an open door', enforced, { scope: sc })
      }
      if (sc === 'meeting' && (meetingId === null || String(meetingId).trim() === '')) {
        return deny('VMU_INVALID_ARGUMENT', 'scope "meeting" needs meetingId', 'name the meeting the grant is tied to', enforced, { scope: sc })
      }
      if (sc === 'verify' && (verifyTarget === null || String(verifyTarget).trim() === '')) {
        return deny('VMU_INVALID_ARGUMENT', 'scope "verify" needs verifyTarget', 'name the verify target the grant is tied to', enforced, { scope: sc })
      }
      mark(fired, 'vmu.grant.maxOpenGrants')
      // ROUND 91: 'open' must NOT depend on a window argument. Counting with active(g, {at}) and no meeting
      // made every meeting-scoped grant look closed, so the budget never triggered - the suite caught it.
      const nowForCount = at === null ? clock() : at
      const openNow = [...grants.values()].filter((g) => g.revokedAt === null && (g.expiresOn === null || nowForCount <= g.expiresOn)).length
      if (K.maxOpen > 0 && openNow >= K.maxOpen) {
        return deny('VMU_RESOURCE_BUDGET', 'too many open grants: ' + openNow + '/' + K.maxOpen + ' (vmu.grant.maxOpenGrants)',
          'vmu.grant.maxOpenGrants=' + K.maxOpen + ' is reached: revoke or let some expire - an unbounded grant ledger is an unbounded permission', enforced, { openNow, maxOpen: K.maxOpen }, fired)
      }
      const when = at === null ? clock() : at
      const g = { id: 'gr-' + (++seq), to: String(to), command, grantScope: sc, expiresOn: expiresOn === null ? null : Number(expiresOn),
        meetingId: meetingId === null ? null : String(meetingId), verifyTarget: verifyTarget === null ? null : String(verifyTarget),
        why: why === null ? null : String(why), by: by === null ? null : String(by), at: when, usedAt: 0, usedFor: null, revokedAt: null }
      if (g.expiresOn !== null && !Number.isFinite(g.expiresOn)) {
        return deny('VMU_INVALID_ARGUMENT', 'expiresOn cannot be read as an instant: ' + JSON.stringify(expiresOn),
          'pass epoch-ms or null for no expiry', enforced, { expiresOn })
      }
      grants.set(g.id, g)
      counters.granted += 1
      say({ type: 'grant/granted', at: when, id: g.id, to: g.to, command: g.command, scope: g.grantScope })
      emit({ type: 'grant/granted', id: g.id, to: g.to, command: g.command, scope: g.grantScope, at: when })
      return receipt({ grant: g.id, to: g.to, command: g.command, grantScope: g.grantScope, expiresOn: g.expiresOn, why: g.why, by: g.by, at: g.at }, enforced, fired)
    },

    /**
     * ASK whether `member` may run `command` right now. Returns { allowed, reason } - and a refusal that names
     * WHY (no grant, wrong command, expired, revoked, already used, wrong window). The `once` scope is SPENT by
     * an allowed check, because that is what "one use" means.
     */
    check({ member = null, command = null, meetingId = null, verifyTarget = null, at = null } = {}) {
      const enforced = []
      const fired = []
      mark(enforced, 'vmu.grant.enabled')
      if (!K.enabled) {
        mark(fired, 'vmu.grant.enabled')
        return deny('VMU_NOT_PERMITTED', 'vmu.grant.enabled=false: nothing may be checked (zero mechanism)',
          'turn the face on in a pack', enforced, null, fired)
      }
      mark(fired, 'vmu.grant.commands')
      const mine = [...grants.values()].filter((g) => g.to === String(member) && g.command === String(command))
      if (mine.length === 0) {
        return deny('VMU_NOT_PERMITTED', 'no grant lets ' + String(member) + ' run "' + String(command) + '"',
          'grant it explicitly first - a capability nobody gave is not implied by anything', enforced, { member, command }, fired)
      }
      for (const g of mine) {
        const a = active(g, { at, meeting: meetingId, verifyTarget })
        if (a.active) {
          if (g.grantScope === 'once') {
            g.usedAt = at === null ? clock() : at
            g.usedFor = String(command)
            counters.used += 1
          }
          say({ type: 'grant/allowed', at: clock(), id: g.id, to: g.to, command: g.command, scope: g.grantScope, reason: a.reason })
          return receipt({ allowed: true, grant: g.id, reason: a.reason, grantScope: g.grantScope, to: g.to, command: g.command }, enforced, fired)
        }
      }
      const why = mine.map((g) => g.id + ': ' + active(g, { at, meeting: meetingId, verifyTarget }).reason).join('; ')
      return deny('VMU_NOT_PERMITTED', 'the grant(s) for ' + String(member) + ' do not cover this use',
        why, enforced, { member, command }, fired)
    },

    /** Take a grant back. Revoking an unknown id is refused; revoking twice is refused (it is a fact, once). */
    revoke({ grant = null, by = null, reason = null } = {}) {
      const enforced = []
      const g = grants.get(String(grant))
      if (!g) return deny('VMU_NO_SUCH_OBJECT', 'unknown grant: ' + String(grant), 'list() shows the ledger', enforced)
      if (g.revokedAt !== null) return deny('VMU_STATE', 'grant ' + g.id + ' was already revoked', 'a revocation is recorded once', enforced)
      if (typeof reason !== 'string' || !reason.trim()) {
        return deny('VMU_INVALID_ARGUMENT', 'revoke needs a non-empty reason', 'say WHY it is taken back', enforced)
      }
      g.revokedAt = clock()
      g.revokedBy = by === null ? null : String(by)
      g.revokedWhy = String(reason)
      counters.revoked += 1
      say({ type: 'grant/revoked', at: g.revokedAt, id: g.id, by: g.revokedBy, reason: g.revokedWhy })
      return receipt({ revoked: g.id, at: g.revokedAt, by: g.revokedBy, reason: g.revokedWhy }, enforced, [])
    },

    /** The ledger, read-only. `active` is computed against the injected clock, so nothing is stale by accident. */
    list({ at = null } = {}) {
      return [...grants.values()].map((g) => Object.assign({}, g, { active: active(g, { at }).active }))
    },

    status() {
      const at = clock()
      let open = 0
      for (const g of grants.values()) if (active(g, { at }).active) open += 1
      return { at, counters: Object.assign({}, counters), open, total: grants.size,
        enabled: K.enabled, commands: K.commands.slice(), defaultScope: K.defaultScope, maxOpenGrants: K.maxOpen,
        settings: Object.assign({}, DEFAULTS, K) }
    },
  }
  return api
}

export default createGrant

/** Three ready-made (settings, call) pairs for the C2 gate scenarios (tests/audit-enforced-consistency). */
export const GATE_SCENARIOS = Object.freeze([
  { name: 'grant.grant(disabled)', settings: { 'vmu.grant.enabled': false }, call: { op: 'grant', args: { to: 'a', command: 'convene' } } },
  { name: 'grant.grant(not-grantable)', settings: { 'vmu.grant.enabled': true, 'vmu.grant.commands': ['convene'] }, call: { op: 'grant', args: { to: 'a', command: 'assign' } } },
  { name: 'grant.check(one-shot-spent)', settings: { 'vmu.grant.enabled': true }, call: { op: 'check', args: { member: 'a', command: 'convene' } } },
])
