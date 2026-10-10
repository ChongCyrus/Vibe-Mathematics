// vmu kernel · skills — capability claims with evidence, third-party attestation and freshness.
// Design source: docs/17-agent-society-and-delegation.md §8 (skill library) / §9 (negotiation) / §21 codes;
//   keys: settings/planned.js vmu.skills.* (declareTtlMs, evidenceRequired, degradePolicy, requiresPermission, ...)
// Invariants:
//   · NO self-appointment: a declaration needs evidence AND at least one attestation by ANOTHER member
//   · expiry is ALWAYS self-disclosed and downgraded — a stale level never passes as valid
//   · a controlled level vocabulary is enforced by name; truncation always reports the dropped count
//   · zero mechanism: level() answers "unknown" — never the lowest level; the clock is injected; reads never mutate
export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

export const DEFAULT_LEVELS = Object.freeze(['novice', 'capable', 'expert'])
export const CODE = Object.freeze({
  evidence: 'VMU_SKILL_EVIDENCE_REQUIRED',
  selfAttest: 'VMU_SKILL_SELF_ATTEST',
  vocab: 'VMU_SKILL_VOCAB_VIOLATION',
  unknown: 'VMU_SKILL_UNKNOWN',
  degraded: 'VMU_SKILL_DEGRADED',
  retired: 'VMU_SKILL_RETIRED',
  limit: 'VMU_SKILL_LIMIT',
})
const ATTEST_CAP = 50
const EXPIRE_CAP = 200

export function createSkills({ clock = () => 0, log = null, settings = {}, bus = null, members = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createSkills needs a clock function', 'pass { clock: () => ms }')

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const firstOf = (keys, def) => { for (const k of keys) { const v = sget(k, undefined); if (v !== undefined) return v } return def }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging must not break skills */ } } }
  const memberIds = () => {
    if (Array.isArray(members)) return members.map((m) => (typeof m === 'string' ? m : (m && m.id) || '')).filter(Boolean)
    if (members && typeof members.list === 'function') { try { const l = members.list(); if (Array.isArray(l)) return l.map((m) => (typeof m === 'string' ? m : (m && m.id) || '')).filter(Boolean) } catch (e) { /* no list */ } }
    return null
  }

  const cfg = () => ({
    levels: (() => { const v = sget('vmu.skills.levels', null); return Array.isArray(v) && v.length ? v.slice() : DEFAULT_LEVELS.slice() })(),
    evidenceRequired: sget('vmu.skills.evidenceRequired', true) !== false,
    selfAttestAllowed: sget('vmu.skills.selfAttestAllowed', false) === true,
    freshnessMs: (() => { const v = firstOf(['vmu.skills.freshnessMs', 'vmu.skills.declareTtlMs'], 0); return Number.isFinite(v) && v > 0 ? v : 0 })(),
    maxSkillsPerMember: (() => { const v = sget('vmu.skills.maxSkillsPerMember', 50); return Number.isInteger(v) && v > 0 ? v : 50 })(),
    aggregate: (() => { const a = sget('vmu.skills.aggregate', 'latest'); return ['latest', 'max'].includes(a) ? a : 'latest' })(),
    degradePolicy: sget('vmu.skills.degradePolicy', 'one-step'),
    requiresPermission: sget('vmu.skills.requiresPermission', true) !== false,
    negotiationRounds: (() => { const v = sget('vmu.skills.negotiationRounds', 0); return Number.isInteger(v) && v >= 0 ? v : 0 })(),
  })

  const decls = []          // append-only: { id, memberId, skill, level, evidence[], declaredAt, verifiedAt, verifiedBy, status, retiredAt }
  const attests = []        // append-only: { id, declId, by, note, at }
  let dropped = 0
  let seq = 0
  const key = (m, s) => m + '\u0000' + s
  const forMemberSkill = (memberId, skill) => decls.filter((d) => d.memberId === memberId && d.skill === skill && d.retiredAt == null)
  const levelIndex = (levels, lv) => levels.indexOf(lv)
  const downgrade = (levels, lv) => {
    const i = levelIndex(levels, lv)
    if (i <= 0) return null
    return levels[i - 1]
  }
  // one source of truth for "what is this level worth right now?" — used by level(), expire(), needed(), list()
  const resolve = (memberId, skill, at) => {
    const c = cfg()
    const rows = forMemberSkill(memberId, skill)
    if (!rows.length) return { known: false, reason: 'no-declaration', code: CODE.unknown, level: null, stale: false, gated: false }
    const cRows = rows.slice().sort((a, b) => (a.declaredAt - b.declaredAt) || (a.id < b.id ? -1 : 1))
    const picked = c.aggregate === 'max'
      ? cRows.slice().sort((a, b) => (levelIndex(c.levels, b.level) - levelIndex(c.levels, a.level)) || (b.declaredAt - a.declaredAt))[0]
      : cRows[cRows.length - 1]
    const declared = picked.level
    if (!picked.verifiedBy) return { known: false, reason: 'awaiting-attestation', code: CODE.unknown, level: null, declared, stale: false, gated: true, required: 'an attestation by another member', id: picked.id }
    const fresh = c.freshnessMs > 0 ? (at - (picked.verifiedAt || picked.declaredAt)) <= c.freshnessMs : true
    if (!fresh) {
      const eff = c.degradePolicy === 'hold' ? declared : downgrade(c.levels, declared)
      return { known: true, reason: 'stale', code: CODE.degraded, level: eff, declared, stale: true, degraded: eff !== declared, gated: false, id: picked.id, verifiedBy: picked.verifiedBy, ageMs: at - (picked.verifiedAt || picked.declaredAt), freshnessMs: c.freshnessMs }
    }
    return { known: true, reason: 'verified', level: declared, declared, stale: false, gated: false, id: picked.id, verifiedBy: picked.verifiedBy, verifiedAt: picked.verifiedAt || picked.declaredAt }
  }

  return {
    apiVersion,

    /** Declare a capability. Evidence is required; the claim stays UNVERIFIED until someone else attests. */
    declare({ memberId, skill, level, evidence = null } = {}) {
      if (typeof memberId !== 'string' || !memberId) throw refuse('VMU_INVALID_ARGUMENT', 'declare needs a memberId', 'e.g. { memberId: "m1", skill: "lean", level: "capable", evidence: ["proof-1"] }')
      if (typeof skill !== 'string' || !skill) throw refuse('VMU_INVALID_ARGUMENT', 'declare needs a non-empty skill', 'e.g. skill: "lean"')
      const c = cfg()
      if (typeof level !== 'string' || !c.levels.includes(level)) throw refuse(CODE.vocab, 'level not in the controlled vocabulary: ' + String(level), 'levels: ' + c.levels.join(', '))
      const ev = Array.isArray(evidence) ? evidence.filter(Boolean) : (typeof evidence === 'string' && evidence ? [evidence] : [])
      if (c.evidenceRequired && ev.length === 0) throw refuse(CODE.evidence, 'a capability claim needs evidence (vmu.skills.evidenceRequired=true)', 'attach artefacts/receipts; a bare claim is not accepted')
      const mine = decls.filter((d) => d.memberId === memberId && d.retiredAt == null)
      if (mine.length >= c.maxSkillsPerMember) throw refuse(CODE.limit, 'member ' + memberId + ' already holds ' + mine.length + '/' + c.maxSkillsPerMember + ' live declarations', 'retire one, or raise vmu.skills.maxSkillsPerMember')
      const at = clock()
      const id = 'sk-' + (++seq)
      const rec = { id, memberId, skill, level, evidence: ev, declaredAt: at, verifiedAt: null, verifiedBy: null, status: 'unverified', retiredAt: null }
      decls.push(rec)
      say({ type: 'skills/declare', at, memberId, skill, level, id, status: 'unverified' })
      if (bus && typeof bus.emit === 'function') { try { bus.emit({ type: 'skills/declare', at, memberId, skill, level }) } catch (e) { /* advisory */ } }
      return { ok: true, id, memberId, skill, level, status: 'unverified', note: 'awaiting an attestation by another member (self-appointment is forbidden)', evidence: ev.length }
    },

    /** Someone else vouches for a declaration. Self-attestation is refused unless explicitly allowed. */
    attest({ memberId, skill, by, note = null } = {}) {
      if (typeof memberId !== 'string' || !memberId) throw refuse('VMU_INVALID_ARGUMENT', 'attest needs a memberId', 'e.g. { memberId: "m1", skill: "lean", by: "m2" }')
      if (typeof skill !== 'string' || !skill) throw refuse('VMU_INVALID_ARGUMENT', 'attest needs a non-empty skill', 'e.g. skill: "lean"')
      if (typeof by !== 'string' || !by) throw refuse('VMU_INVALID_ARGUMENT', 'attest needs a `by` (the witnessing member)', 'the witness must be identified')
      const c = cfg()
      if (by === memberId && !c.selfAttestAllowed) throw refuse(CODE.selfAttest, 'self-attestation is forbidden: ' + memberId, 'ask another member to attest (vmu.skills.selfAttestAllowed=false)')
      const ids = memberIds()
      if (ids && !ids.includes(by)) throw refuse('VMU_NO_SUCH_OBJECT', 'the witness is not a known member: ' + by, 'known members: ' + ids.join(', '))
      const rows = forMemberSkill(memberId, skill)
      if (!rows.length) throw refuse(CODE.unknown, 'no live declaration for ' + memberId + '/' + skill, 'declare first (declare()), then attest it')
      const target = rows.slice().sort((a, b) => (b.declaredAt - a.declaredAt) || (a.id < b.id ? -1 : 1))[0]
      const at = clock()
      const id = 'at-' + (++seq)
      attests.push({ id, declId: target.id, by, note, at })
      target.verifiedAt = at
      target.verifiedBy = by
      target.status = 'verified'
      let droppedNow = 0
      if (attests.length > ATTEST_CAP) { const over = attests.length - ATTEST_CAP; attests.splice(0, over); dropped += over; droppedNow = over }
      say({ type: 'skills/attest', at, memberId, skill, by, declId: target.id, dropped: droppedNow })
      return { ok: true, id, declId: target.id, memberId, skill, level: target.level, status: 'verified', by, dropped: droppedNow, truncated: droppedNow > 0 }
    },

    /** Read-only. Zero mechanism answers "unknown" — never the lowest level. */
    level({ memberId, skill } = {}) {
      if (typeof memberId !== 'string' || !memberId) throw refuse('VMU_INVALID_ARGUMENT', 'level needs a memberId', 'e.g. { memberId: "m1", skill: "lean" }')
      if (typeof skill !== 'string' || !skill) throw refuse('VMU_INVALID_ARGUMENT', 'level needs a non-empty skill', 'e.g. skill: "lean"')
      const c = cfg()
      const r = resolve(memberId, skill, clock())
      if (!r.known) {
        return {
          ok: true, memberId, skill, known: false, level: null, code: CODE.unknown, stale: false, gated: !!r.gated,
          reason: r.reason, note: r.gated ? 'declared but still awaiting an attestation by another member' : 'unknown: no declaration exists — this is NOT the lowest level (' + c.levels[0] + ')',
          declaredLevel: r.declared === undefined ? null : r.declared, aggregate: c.aggregate,
        }
      }
      return {
        ok: true, memberId, skill, known: true, level: r.level, declaredLevel: r.declared, stale: !!r.stale, degraded: !!r.degraded,
        code: r.stale ? CODE.degraded : undefined, reason: r.reason, verifiedBy: r.verifiedBy,
        ageMs: r.stale ? r.ageMs : undefined, freshnessMs: c.freshnessMs || undefined,
        note: r.stale ? ('stale: the attestation is older than ' + c.freshnessMs + 'ms — the level is downgraded to "' + String(r.level) + '", not silently accepted') : undefined,
        requiresPermission: c.requiresPermission,
      }
    },

    /** Read-only. Reports which verified claims are stale at `at` (capped, with the dropped count). */
    expire({ at = null, limit = EXPIRE_CAP } = {}) {
      const when = Number.isFinite(at) ? at : clock()
      if (Number.isFinite(at) && at < 0) throw refuse('VMU_INVALID_ARGUMENT', 'at must be a non-negative ms timestamp', 'omit it to use the clock')
      const cap = Number.isInteger(limit) && limit > 0 ? limit : EXPIRE_CAP
      const seen = new Set()
      const rows = []
      for (const d of decls) {
        if (d.retiredAt != null) continue
        const k = key(d.memberId, d.skill)
        if (seen.has(k)) continue
        seen.add(k)
        const r = resolve(d.memberId, d.skill, when)
        if (r.known && r.stale) rows.push({ memberId: d.memberId, skill: d.skill, declaredLevel: r.declared, effectiveLevel: r.level, ageMs: r.ageMs, verifiedBy: r.verifiedBy, code: CODE.degraded })
        else if (r.gated) rows.push({ memberId: d.memberId, skill: d.skill, declaredLevel: r.declared, effectiveLevel: null, gated: true, reason: 'awaiting-attestation', code: CODE.unknown })
      }
      rows.sort((a, b) => (b.ageMs || 0) - (a.ageMs || 0) || (a.memberId < b.memberId ? -1 : 1))
      const kept = rows.slice(0, cap)
      return { ok: true, at: when, items: kept, count: kept.length, dropped: rows.length - kept.length, truncated: rows.length > kept.length, freshnessMs: cfg().freshnessMs }
    },

    /** Read-only. Who can cover what — capability only; permission is a separate gate (17-§9). */
    needed({ taskId = null, tags = null, skills = null, at = null } = {}) {
      const when = Number.isFinite(at) ? at : clock()
      const want = Array.isArray(skills) ? skills.slice() : (Array.isArray(tags) ? tags.slice() : [])
      const c = cfg()
      const matches = []
      const covered = new Set()
      for (const d of decls) {
        if (d.retiredAt != null) continue
        if (want.length && !want.includes(d.skill)) continue
        const r = resolve(d.memberId, d.skill, when)
        if (!r.known) continue
        matches.push({ memberId: d.memberId, skill: d.skill, level: r.level, stale: !!r.stale, verifiedBy: r.verifiedBy })
        covered.add(d.skill)
      }
      matches.sort((a, b) => (a.skill < b.skill ? -1 : 1) || (a.memberId < b.memberId ? -1 : 1))
      return {
        ok: true, taskId, requested: want, matches, missing: want.filter((s) => !covered.has(s)),
        note: 'capability != permission: acting also needs the permission gate (vmu.skills.requiresPermission=' + c.requiresPermission + ')',
        requiresPermission: c.requiresPermission, negotiationRounds: c.negotiationRounds, at: when,
      }
    },

    /** Read-only. Retire a claim by name (kept for the audit trail). */
    retire({ memberId, skill } = {}) {
      if (typeof memberId !== 'string' || !memberId || typeof skill !== 'string' || !skill) throw refuse('VMU_INVALID_ARGUMENT', 'retire needs memberId and skill', 'e.g. { memberId: "m1", skill: "lean" }')
      const rows = forMemberSkill(memberId, skill)
      if (!rows.length) throw refuse(CODE.unknown, 'no live declaration for ' + memberId + '/' + skill, 'list() shows the live claims')
      const at = clock()
      for (const d of rows) { d.retiredAt = at; d.status = 'retired' }
      say({ type: 'skills/retire', at, memberId, skill, count: rows.length, code: CODE.retired })
      return { ok: true, memberId, skill, retired: rows.length, code: CODE.retired }
    },

    /** Read-only. */
    list() {
      const c = cfg()
      const rows = decls.map((d) => {
        const r = resolve(d.memberId, d.skill, clock())
        return { id: d.id, memberId: d.memberId, skill: d.skill, declaredLevel: d.level, status: d.retiredAt ? 'retired' : d.status, stale: !!r.stale, effectiveLevel: r.known ? r.level : null, verifiedBy: d.verifiedBy }
      })
      rows.sort((a, b) => (a.memberId < b.memberId ? -1 : 1) || (a.skill < b.skill ? -1 : 1) || (a.id < b.id ? -1 : 1))
      return { ok: true, declarations: rows, count: rows.length, attestations: attests.length, droppedFromCap: dropped, levels: c.levels, aggregate: c.aggregate, selfAttestAllowed: c.selfAttestAllowed, requiresPermission: c.requiresPermission }
    },

    /** Read-only self-disclosure. */
    status() {
      const c = cfg()
      return {
        ok: true,
        declarations: decls.filter((d) => !d.retiredAt).length,
        retired: decls.filter((d) => d.retiredAt != null).length,
        verified: decls.filter((d) => !d.retiredAt && d.verifiedBy).length,
        unverified: decls.filter((d) => !d.retiredAt && !d.verifiedBy).length,
        attestations: attests.length, droppedFromCap: dropped,
        levels: c.levels, aggregate: c.aggregate,
        evidenceRequired: c.evidenceRequired, selfAttestAllowed: c.selfAttestAllowed,
        freshnessMs: c.freshnessMs, maxSkillsPerMember: c.maxSkillsPerMember, degradePolicy: c.degradePolicy,
        noSelfAppointment: c.selfAttestAllowed === false,
        selfDisclosure: '不得自封：声明需证据＋至少一名他人见证；过期一律自曝并降级',
        requiresPermission: c.requiresPermission, capabilityIsNotPermission: true,
        zeroMechanismWhenEmpty: true, unknownIsNotLowest: true, membersKnown: memberIds() !== null,
        at: clock(),
      }
    },
  }
}
