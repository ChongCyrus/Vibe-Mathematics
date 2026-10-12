// vmu kernel · identity — WHO a member is, where that identity came from, and how it ends（docs/17 the identity table;
// docs/20 supplies the privacy side and docs/08 the ballot side, neither of which is redefined here）.
//
// WHAT IT IS: principal binding to a host subject, the issuers whose claims are trusted, the mapping from claims to role
// SLOTS, multiple institutional memberships with their cap, pseudonyms and the scopes where they are allowed, the
// disposition applied when a membership ends, and whether reads of identity are audited.
//
// FACE CONVENTIONS (the same as kernel/collab.js, kernel/funding.js, kernel/publication.js):
//   ① every key is read with a LITERAL access - the settings table decides "wired" by scanning file text, and that table
//      is a gate;
//   ② receipts carry `enforced[]` (keys EVALUATED) and `fired[]` (keys that CHANGED the outcome);
//   ③ a limit the machine cannot enforce is refused BY NAME;
//   ④ nothing declared ⇒ nothing happens: no issuer list means no issuer check, not a silent pass or a silent refusal;
//   ⑤ injected clock; read-only surfaces never mutate; every truncation is counted.
export const apiVersion = 1

export function refuse(code, message, hint, extra) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  if (extra !== undefined) e.detail = extra
  return e
}

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const boolOr = (v, d) => (typeof v === 'boolean' ? v : d)
const intOr = (v, d) => (Number.isInteger(v) ? v : d)
const listOf = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [])

export const CODE = Object.freeze({
  principalRequired: 'VMU_IDENTITY_PRINCIPAL_REQUIRED',
  issuerUntrusted: 'VMU_IDENTITY_ISSUER_UNTRUSTED',
  claimUnmapped: 'VMU_IDENTITY_CLAIM_UNMAPPED',
  membershipCap: 'VMU_IDENTITY_MEMBERSHIP_CAP',
  multiMembershipOff: 'VMU_IDENTITY_MULTI_MEMBERSHIP_OFF',
  pseudonymNotAllowed: 'VMU_IDENTITY_PSEUDONYM_NOT_ALLOWED',
  pseudonymScope: 'VMU_IDENTITY_PSEUDONYM_SCOPE',
})

export function createIdentity({ clock = () => 0, log = null, settings = {}, bus = null, listCap = 100 } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createIdentity needs a clock function', 'pass { clock: () => ms }')
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging never breaks the face */ } } }

  const cfg = () => ({
    principalBinding: ['off', 'advisory', 'required'].includes(sget('vmu.identity.principalBinding')) ? sget('vmu.identity.principalBinding') : 'off',
    trustedIssuers: listOf(sget('vmu.identity.trustedIssuers')),
    claimMap: (() => { const v = sget('vmu.identity.claimMap'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {} })(),
    multiMembership: boolOr(sget('vmu.identity.multiMembership'), false),
    maxMemberships: (() => { const v = intOr(sget('vmu.identity.maxMemberships', 1), 1); return v >= 1 ? v : 1 })(),
    allowPseudonym: boolOr(sget('vmu.identity.allowPseudonym'), false),
    pseudonymScopes: listOf(sget('vmu.identity.pseudonymScopes')),
    onEnd: ['archive', 'handover', 'both'].includes(sget('vmu.identity.onEnd')) ? sget('vmu.identity.onEnd') : 'both',
    auditReads: sget('vmu.identity.auditReads') !== false,
  })

  const members = new Map()     // memberId -> { id, principal, issuer, claims{}, memberships[], pseudonyms[], endedAt, disposition }
  const readAudit = []          // every identity READ, when vmu.identity.auditReads is on
  let reads = 0
  let dropped = 0

  /** `auditReads` decides whether a read is recorded. A read that is audited says so in its own receipt. */
  const noteRead = (what, who) => {
    reads += 1
    const c = cfg()
    if (!c.auditReads) return { audited: false, enforced: ['vmu.identity.auditReads'], fired: ['vmu.identity.auditReads'] }
    const rec = { what, who: who === undefined ? null : String(who), at: clock() }
    readAudit.push(rec)
    while (readAudit.length > 500) { readAudit.shift(); dropped += 1 }
    return { audited: true, enforced: ['vmu.identity.auditReads'], fired: [] }
  }

  const memberOf = (id) => {
    const m = members.get(String(id))
    if (!m) throw refuse('VMU_INVALID_ARGUMENT', 'unknown member: ' + String(id), 'declare it with bindPrincipal or addMembership first', { id: String(id) })
    return m
  }
  const ensure = (id) => {
    const key = String(id)
    if (!members.has(key)) members.set(key, { id: key, principal: null, issuer: null, claims: {}, memberships: [], pseudonyms: [], endedAt: null, disposition: null })
    return members.get(key)
  }

  /**
   * Bind a member to a host principal. `principalBinding` is the decision: off records it without coupling, advisory
   * accepts a missing principal, required refuses one - the three states are distinct on purpose.
   */
  function bindPrincipal({ memberId, principal = null, issuer = null, claims = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.identity.principalBinding', 'vmu.identity.trustedIssuers']
    const fired = []
    const m = ensure(memberId)
    const p = str(principal)
    if (!p) {
      if (c.principalBinding === 'required') {
        fired.push('vmu.identity.principalBinding')
        throw refuse(CODE.principalRequired, 'vmu.identity.principalBinding=required: a host principal is required',
          'pass principal:<subject id>, or change the binding mode deliberately', { memberId: m.id, enforced, fired })
      }
    }
    // trustedIssuers: an EMPTY list means no issuer checking at all (zero mechanism); a non-empty list is enforced.
    const iss = str(issuer)
    if (c.trustedIssuers.length > 0) {
      if (!iss || !c.trustedIssuers.includes(iss)) {
        fired.push('vmu.identity.trustedIssuers')
        throw refuse(CODE.issuerUntrusted, 'the issuer is not trusted: ' + (iss || '(none)'),
          'trusted: ' + c.trustedIssuers.join(', ') + ' (vmu.identity.trustedIssuers)', { memberId: m.id, issuer: iss || null, enforced, fired })
      }
    }
    if (p) m.principal = p
    if (iss) m.issuer = iss
    if (claims && typeof claims === 'object' && !Array.isArray(claims)) m.claims = Object.assign({}, m.claims, claims)
    // claimMap: claims map to role SLOTS. An unmapped claim is REPORTED, never silently turned into a slot.
    const slots = []
    const unmapped = []
    for (const [claim, value] of Object.entries(m.claims)) {
      const slot = c.claimMap[claim]
      if (slot === undefined && c.claimMap[claim + '=' + String(value)] !== undefined) { slots.push(String(c.claimMap[claim + '=' + String(value)])); continue }
      if (slot === undefined) { unmapped.push(claim); continue }
      const mapped = String(slot)
      if (String(value) === 'true' || String(value) === mapped || c.claimMap[claim] === mapped) slots.push(mapped)
    }
    return { ok: true, memberId: m.id, principal: m.principal, issuer: m.issuer, binding: c.principalBinding,
      slots, unmappedClaims: unmapped, enforced, fired }
  }

  /** Add an institutional membership. `multiMembership` and `maxMemberships` both bite here. */
  function addMembership({ memberId, institution, since = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.identity.multiMembership', 'vmu.identity.maxMemberships']
    const fired = []
    const m = ensure(memberId)
    const inst = str(institution)
    if (!inst) throw refuse('VMU_INVALID_ARGUMENT', 'addMembership needs an institution', 'pass { institution: "Uni" }')
    const existing = m.memberships.map((x) => x.institution)
    if (existing.includes(inst)) return { ok: true, memberId: m.id, institution: inst, memberships: existing.slice(), alreadyMember: true, enforced, fired }
    if (!c.multiMembership && m.memberships.length >= 1) {
      fired.push('vmu.identity.multiMembership')
      throw refuse(CODE.multiMembershipOff, 'vmu.identity.multiMembership=false: ' + m.id + ' already belongs to ' + existing.join(', '),
        'set vmu.identity.multiMembership=true deliberately, or end the current membership first', { memberId: m.id, existing, enforced, fired })
    }
    if (m.memberships.length + 1 > c.maxMemberships) {
      fired.push('vmu.identity.maxMemberships')
      throw refuse(CODE.membershipCap, 'membership cap reached: ' + m.memberships.length + '/' + c.maxMemberships,
        'end one membership, or raise vmu.identity.maxMemberships', { memberId: m.id, count: m.memberships.length, cap: c.maxMemberships, enforced, fired })
    }
    m.memberships.push({ institution: inst, since: Number.isFinite(since) ? Number(since) : clock() })
    return { ok: true, memberId: m.id, institution: inst, memberships: m.memberships.map((x) => x.institution), alreadyMember: false, enforced, fired }
  }

  /** A pseudonym, when `allowPseudonym` is on AND the scope is one of the declared ones. */
  function pseudonymFor({ memberId, scope = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.identity.allowPseudonym', 'vmu.identity.pseudonymScopes']
    const fired = []
    const m = memberOf(memberId)
    if (!c.allowPseudonym) {
      fired.push('vmu.identity.allowPseudonym')
      throw refuse(CODE.pseudonymNotAllowed, 'vmu.identity.allowPseudonym=false: no pseudonym is issued', 'set the key deliberately if pseudonyms are wanted', { memberId: m.id, enforced, fired })
    }
    const sc = str(scope)
    if (!sc || !c.pseudonymScopes.includes(sc)) {
      fired.push('vmu.identity.pseudonymScopes')
      throw refuse(CODE.pseudonymScope, 'pseudonym scope is not declared: ' + (sc || '(none)'),
        'declared scopes: ' + (c.pseudonymScopes.join(', ') || '(none)') + ' (vmu.identity.pseudonymScopes)', { memberId: m.id, scope: sc || null, enforced, fired })
    }
    const known = m.pseudonyms.find((x) => x.scope === sc)
    if (known) return { ok: true, memberId: m.id, scope: sc, pseudonym: known.pseudonym, reused: true, enforced, fired }
    const pseudonym = 'anon-' + String(m.id).replace(/[^A-Za-z0-9]+/g, '').slice(0, 8) + '-' + String(m.pseudonyms.length + 1)
    m.pseudonyms.push({ scope: sc, pseudonym, at: clock() })
    return { ok: true, memberId: m.id, scope: sc, pseudonym, reused: false, enforced, fired }
  }

  /** End a membership. `onEnd` says what happens to the record: archive, handover, or both. */
  function endMembership({ memberId, reason = null } = {}) {
    const c = cfg()
    const m = memberOf(memberId)
    const at = clock()
    m.endedAt = at
    m.disposition = c.onEnd
    say({ type: 'identity/membership-ended', at, memberId: m.id, onEnd: c.onEnd, reason: reason === null ? null : String(reason) })
    return { ok: true, memberId: m.id, endedAt: at, disposition: c.onEnd,
      archive: c.onEnd === 'archive' || c.onEnd === 'both', handover: c.onEnd === 'handover' || c.onEnd === 'both',
      enforced: ['vmu.identity.onEnd'], fired: [] }
  }

  /** Read-only. With `auditReads` on, the read itself is recorded and the receipt says so. */
  function member({ memberId } = {}) {
    const m = memberOf(memberId)
    const audit = noteRead('member', m.id)
    return { ok: true, memberId: m.id, principal: m.principal, issuer: m.issuer, memberships: m.memberships.map((x) => Object.assign({}, x)),
      pseudonyms: m.pseudonyms.map((x) => Object.assign({}, x)), endedAt: m.endedAt, disposition: m.disposition,
      enforced: ['vmu.identity.auditReads'], fired: audit.fired, audited: audit.audited }
  }

  const status = () => ({
    ok: true,
    members: members.size, reads, readsAudited: readAudit.length, dropped,
    policy: cfg(),
    readAuditTail: readAudit.slice(-5).map((x) => Object.assign({}, x)),
    readsArePure: true,
    noIssuerListMeansNoCheck: cfg().trustedIssuers.length === 0,
    at: clock(),
    listCap,
  })


  /**
   * ROUND 480: read-only roster, capped by `listCap`. docs/03 planned a read-only members surface and nothing exposed
   * one, while this object knew every member privately. Bounded on purpose: a roster that cannot be capped is a dump.
   */
  function list() {
    const rows = [...members.values()].slice(0, listCap).map((m) => ({
      id: m.id,
      principal: m.principal === undefined ? null : m.principal,
      memberships: Array.isArray(m.memberships) ? m.memberships.slice() : [],
      pseudonym: m.pseudonym === undefined ? null : m.pseudonym,
    }))
    return { ok: true, total: members.size, returned: rows.length, capped: members.size > rows.length, members: rows }
  }
  return { apiVersion, bindPrincipal, addMembership, pseudonymFor, endMembership, member, status, list }
}
