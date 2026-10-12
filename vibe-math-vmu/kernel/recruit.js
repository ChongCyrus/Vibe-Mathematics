// vmu kernel recruit — postings, applications, scoring, offers, probation, confirmation.
//
// ★ 范围基准（2026-10-11）**复核结论：保留 ✓**（判据与依据见 docs/23-§1d）—— **它命中的是"机制"而非"领域实例"**：
//   **边界** ✗：`seats`/`facilities`（或拟人化 HR 词汇）那半**不再扩写**；新增能力前先回答"对数学研究或机制可定义性有什么用"。
// Spec: docs/17-agent-society-and-delegation.md §7 (recruitment & probation) + §21 (code table).
// INVARIANT S-1: the kernel does NOT know job titles. A title must be mapped EXPLICITLY to a role slot
// (vmu.roles.map / roleMap option); an unmapped title is refused BY NAME.
// Codes: VMU_RECRUIT_SLOT_UNKNOWN / VMU_RECRUIT_SEATS_EXCEEDED / VMU_RECRUIT_PROBATION_NOT_DUE /
//        VMU_RECRUIT_REASON_REQUIRED / VMU_RECRUIT_OFFER_EXPIRED / VMU_RECRUIT_NOT_APPLIED (03-§8).
// Invariants: named refusals; over-seating refuses with current/limit; probation cannot be cut short;
// rejection needs a reason; every truncation is counted; injected clock; zero-config never crashes;
// read-only views never mutate.

export const apiVersion = 1

export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  err.hint = hint
  if (extra) Object.assign(err, extra)
  return err
}

const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const boolOr = (v, d) => (typeof v === 'boolean' ? v : d)

/** Aggregate a score list. `trimmed` drops the min and max when at least 3 scores exist. */
export function aggregate(scores, mode = 'mean') {
  const s = (Array.isArray(scores) ? scores : []).filter((n) => typeof n === 'number' && Number.isFinite(n))
  if (!s.length) return null
  const sorted = s.slice().sort((a, b) => a - b)
  if (mode === 'median') return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  if (mode === 'trimmed') { const use = sorted.length >= 3 ? sorted.slice(1, -1) : sorted; return use.reduce((a, b) => a + b, 0) / use.length }
  return s.reduce((a, b) => a + b, 0) / s.length
}

export function createRecruit({ clock = () => Date.now(), log = () => {}, settings = {}, bus = null, members = null, listCap = 100 } = {}) {
  const postings = new Map()      // postingId -> { id, slot, seats, requirements[], applicants[] }
  const applications = new Map()  // applicationId -> { id, postingId, candidate, evidence, scores[], status }
  const offers = new Map()        // offerId -> { id, applicationId, expiresAt, status }
  const staff = new Map()         // memberId -> { memberId, slot, hiredAt, probationUntil, confirmedAt, by }
  let seq = 0
  let dropped = 0
  const nextId = (p) => p + '-' + (++seq)

  const cfg = () => ({
    probationMs: intOr(settings['vmu.recruit.probationMs'], 0),
    // ROUND 267 (volume 17 §L266-271): the four remaining declarations. Every one is read here and enforced or reported below.
    policy: ['closed', 'claim', 'nominate', 'open'].includes(settings['vmu.recruit.policy']) ? settings['vmu.recruit.policy'] : 'closed',
    decideBy: ['manager', 'vote', 'auction', 'human'].includes(settings['vmu.recruit.decideBy']) ? settings['vmu.recruit.decideBy'] : 'manager',
    needsHuman: boolOr(settings['vmu.recruit.needsHuman'], false),
    probationPermissions: Array.isArray(settings['vmu.recruit.probationPermissions']) ? settings['vmu.recruit.probationPermissions'].map(String) : [],
    seatsMax: intOr(settings['vmu.recruit.seatsMax'], Infinity),
    scoreRequiresRationale: boolOr(settings['vmu.recruit.scoreRequiresRationale'], true),
    scoreAggregate: ['mean', 'median', 'trimmed'].includes(settings['vmu.recruit.scoreAggregate']) ? settings['vmu.recruit.scoreAggregate'] : 'mean',
    offerExpiryMs: intOr(settings['vmu.recruit.offerExpiryMs'], 0),
    rejectNeedsReason: boolOr(settings['vmu.recruit.rejectNeedsReason'], true),
    requireEvidence: boolOr(settings['vmu.recruit.requireEvidence'], false),
    maxCandidates: intOr(settings['vmu.recruit.maxCandidates'], Infinity),
    roleMap: (settings['vmu.roles.map'] && typeof settings['vmu.roles.map'] === 'object') ? settings['vmu.roles.map'] : {},
    // ROUND 217: the appointment/term family (docs/17 §29.3). Every one of these is enforced somewhere below.
    slotIdPattern: (() => { const v = settings['vmu.roles.slotIdPattern']; try { return new RegExp(typeof v === 'string' && v ? v : '^[a-z][a-z0-9-]*$') } catch { return /^[a-z][a-z0-9-]*$/ } })(),
    termDefaultMs: intOr(settings['vmu.roles.termDefaultMs'], 0),
    termMaxMs: intOr(settings['vmu.roles.termMaxMs'], 0),
    termRenewable: boolOr(settings['vmu.roles.termRenewable'], true),
    recallQuorum: (() => { const v = settings['vmu.roles.recallQuorum']; return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0 })(),
    recallCoolDownMs: intOr(settings['vmu.roles.recallCoolDownMs'], 0),
    actingMaxMs: intOr(settings['vmu.roles.actingMaxMs'], 0),
    actingNeedsReason: boolOr(settings['vmu.roles.actingNeedsReason'], true),
    separationPairs: Array.isArray(settings['vmu.roles.separationPairs']) ? settings['vmu.roles.separationPairs'].filter((p) => p && typeof p === 'object' && p.a && p.b).map((p) => ({ a: String(p.a), b: String(p.b) })) : [],
    promotionNeedsEvidence: boolOr(settings['vmu.roles.promotionNeedsEvidence'], true),
  })

  /** S-1: map a job title to a role slot, or refuse by name. */
  const slotOf = (title) => {
    if (typeof title !== 'string' || !title) throw refuse('VMU_RECRUIT_SLOT_UNKNOWN', 'a role slot (or a mapped title) is required', 'pass slot:<id>, or declare vmu.roles.map[title]=slot', { title })
    const c = cfg()
    if (c.roleMap[title]) return c.roleMap[title]
    if (c.slotIdPattern.test(title)) return title               // ROUND 217: shape comes from vmu.roles.slotIdPattern
    throw refuse('VMU_RECRUIT_SLOT_UNKNOWN', 'job title is not mapped to a role slot: ' + title,
      'the kernel does not know titles; add vmu.roles.map[' + JSON.stringify(title) + ']=<slot>', { title, known: Object.keys(c.roleMap) })
  }

  const seatCount = (slot) => [...staff.values()].filter((s) => s.slot === slot && !s.confirmedAt === false).length + [...postings.values()].filter((p) => p.slot === slot).reduce((n, p) => n + p.seats, 0)

  function openPosting({ slot, seats = 1, requirements = [] } = {}) {
    const c = cfg()
    const realSlot = slotOf(slot)
    const wantSeats = intOr(seats, 1)
    // Occupancy = seated staff + seats already reserved by open postings for the same slot.
    const seated = [...staff.values()].filter((s) => s.slot === realSlot).length
    const reserved = [...postings.values()].filter((p) => p.slot === realSlot).reduce((n, p) => n + p.seats, 0)
    const taken = seated + reserved
    const limit = Math.min(c.seatsMax, Number.isFinite(c.seatsMax) ? c.seatsMax : Infinity)
    if (taken + wantSeats > limit) throw refuse('VMU_RECRUIT_SEATS_EXCEEDED', 'seats exceeded for slot ' + realSlot + ': current=' + taken + ' requested=' + wantSeats + ' limit=' + limit,
      'close an existing seat or raise vmu.recruit.seatsMax', { slot: realSlot, current: taken, requested: wantSeats, limit })
    const id = nextId('posting')
    postings.set(id, { id, slot: realSlot, seats: wantSeats, requirements: Array.isArray(requirements) ? requirements.slice() : [], applicants: [], openedAt: clock() })
    return { id, slot: realSlot, seats: wantSeats, taken, limit }
  }

  function apply({ postingId, candidate, evidence = null } = {}) {
    const p = postings.get(postingId)
    if (!p) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'unknown posting: ' + String(postingId), 'openPosting() first', { postingId })
    if (!candidate) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'apply needs a candidate', 'e.g. apply({postingId, candidate:"acad"})', { postingId })
    const c = cfg()
    if (p.applicants.length >= c.maxCandidates) throw refuse('VMU_RECRUIT_SEATS_EXCEEDED', 'candidate limit reached for ' + postingId + ': current=' + p.applicants.length + ' limit=' + c.maxCandidates, 'raise vmu.recruit.maxCandidates or close the posting', { postingId, current: p.applicants.length, limit: c.maxCandidates })
    if (c.requireEvidence && !evidence) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'evidence is required to apply for ' + postingId, 'pass evidence:<path|note>', { postingId, missing: ['evidence'] })
    const id = nextId('app')
    applications.set(id, { id, postingId, candidate, evidence, scores: [], status: 'applied', at: clock() })
    p.applicants.push(id)
    return { id, postingId, candidate, status: 'applied' }
  }

  function score({ applicationId, by, score: value, rationale = '' } = {}) {
    const a = applications.get(applicationId)
    if (!a) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'unknown application: ' + String(applicationId), 'apply() first', { applicationId })
    const c = cfg()
    if (typeof value !== 'number' || !Number.isFinite(value)) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'score must be a finite number', 'e.g. score({applicationId, by:"acad", score:0.8, rationale:"…"})', { applicationId })
    if (c.scoreRequiresRationale && !String(rationale || '').trim()) throw refuse('VMU_RECRUIT_REASON_REQUIRED', 'a rationale is required for scoring ' + applicationId, 'vmu.recruit.scoreRequiresRationale=true', { applicationId, missing: ['rationale'] })
    a.scores.push({ by: by || null, score: value, rationale: String(rationale || ''), at: clock() })
    return { applicationId, scores: a.scores.length, aggregate: aggregate(a.scores.map((s) => s.score), c.scoreAggregate), mode: c.scoreAggregate }
  }

  function offer({ applicationId, expiresInMs = null } = {}) {
    const a = applications.get(applicationId)
    if (!a) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'unknown application: ' + String(applicationId), 'apply() first', { applicationId })
    const c = cfg()
    const ttl = Number.isInteger(expiresInMs) ? expiresInMs : c.offerExpiryMs
    const id = nextId('offer')
    const expiresAt = ttl > 0 ? clock() + ttl : null
    offers.set(id, { id, applicationId, slot: postings.get(a.postingId).slot, expiresAt, status: 'open', at: clock() })
    a.status = 'offered'
    return { id, applicationId, expiresAt, status: 'open' }
  }

  function accept({ offerId, by } = {}) {
    // ROUND 267 (`vmu.recruit.needsHuman`): when the pack demands human approval, an acceptance with no named approver is refused
    // BY NAME rather than silently recorded as decided.
    if (cfg().needsHuman && !by) {
      throw refuse('VMU_RECRUIT_NEEDS_HUMAN', 'vmu.recruit.needsHuman=true and this acceptance names no human approver',
        'pass by: \'<human id>\', or set vmu.recruit.needsHuman=false')
    }
    const o = offers.get(offerId)
    if (!o) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'unknown offer: ' + String(offerId), 'offer() first', { offerId })
    if (o.status !== 'open') throw refuse('VMU_RECRUIT_OFFER_EXPIRED', 'offer is no longer open: ' + offerId + ' status=' + o.status, 'issue a new offer', { offerId, status: o.status })
    const c = cfg()
    if (o.expiresAt !== null && clock() > o.expiresAt) { o.status = 'expired'; throw refuse('VMU_RECRUIT_OFFER_EXPIRED', 'offer expired at ' + o.expiresAt + ' (now=' + clock() + ')', 'issue a new offer', { offerId, expiresAt: o.expiresAt }) }
    const a = applications.get(o.applicationId)
    const taken = [...staff.values()].filter((s) => s.slot === o.slot).length
    const limit = Number.isFinite(c.seatsMax) ? c.seatsMax : Infinity
    if (taken + 1 > limit) throw refuse('VMU_RECRUIT_SEATS_EXCEEDED', 'seats exceeded for slot ' + o.slot + ': current=' + taken + ' limit=' + limit, 'no seat left; close a seat or raise vmu.recruit.seatsMax', { slot: o.slot, current: taken, limit })
    o.status = 'accepted'
    const probationUntil = c.probationMs > 0 ? clock() + c.probationMs : null
    // ROUND 217: separation of duties - one instance may not hold both slots of a declared pair.
    for (const pair of c.separationPairs) {
      const other = pair.a === o.slot ? pair.b : (pair.b === o.slot ? pair.a : null)
      if (other && [...staff.values()].some((x) => x.memberId === a.candidate && x.slot === other)) {
        throw refuse('VMU_ROLE_SEPARATION_VIOLATED', 'separation of duties: ' + a.candidate + ' already holds ' + other + ' and cannot also hold ' + o.slot,
          'declare a different candidate, or drop the pair from vmu.roles.separationPairs', { memberId: a.candidate, slot: o.slot, other })
      }
    }
    // Terms: the default任期 applies when set, and the maximum clamps it (the clamp is disclosed, never silent).
    const nowAccept = clock()
    let termUntil = c.termDefaultMs > 0 ? nowAccept + c.termDefaultMs : null
    let termClamped = false
    if (termUntil !== null && c.termMaxMs > 0 && termUntil - nowAccept > c.termMaxMs) { termUntil = nowAccept + c.termMaxMs; termClamped = true }
    staff.set(a.candidate, { memberId: a.candidate, slot: o.slot, hiredAt: nowAccept, probationUntil, confirmedAt: null, by: by || null, termUntil, termClamped, recalls: 0 })
    return { memberId: a.candidate, slot: o.slot, probationUntil, confirmed: false, termUntil, termClamped }
  }

  function reject({ offerId, reason = '' } = {}) {
    const o = offers.get(offerId)
    if (!o) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'unknown offer: ' + String(offerId), 'offer() first', { offerId })
    const c = cfg()
    if (c.rejectNeedsReason && !String(reason || '').trim()) throw refuse('VMU_RECRUIT_REASON_REQUIRED', 'rejection needs a reason for ' + offerId, 'pass reason:"…" (vmu.recruit.rejectNeedsReason=true)', { offerId, missing: ['reason'] })
    o.status = 'rejected'
    o.reason = String(reason || '')
    return { offerId, status: 'rejected', reason: o.reason }
  }

  /** probation(): read-only view of a member's probation. */
  function probation({ memberId } = {}) {
    // ROUND 267 (`vmu.recruit.probationPermissions`): the declaration is a SUBSET of the superior permissions. A probation set that
    // reaches beyond them is refused by name - a probation that grants more than the post is not a probation.
    const granted = cfg().probationPermissions
    // The subset check REPORTS its verdict rather than refusing: a refusal here would need a code the registry could not accept in this
    // shape, and an unregistered code is worse than a reported finding. `probationPermissions` is still read and still observable.
    let overflow = []
    let comparable = false
    if (granted.length) {
      const superior = members && typeof members.permissionsOf === 'function' ? members.permissionsOf(memberId) : null
      if (Array.isArray(superior)) {
        comparable = true
        overflow = granted.filter((p) => !superior.includes(p))
      }
    }
    // ROUND 268 (volume 17 §L268): the declaration is a SUBSET of the superior permissions. With a superior view supplied, an
    // overflow is refused BY NAME - the key is now registered, so the refusal is permitted again.
    if (overflow.length) {
      throw refuse('VMU_RECRUIT_PROBATION_PERMISSIONS', 'vmu.recruit.probationPermissions is not a subset of the superior set: ' + overflow.join(', '),
        'declare only permissions the post itself has, or clear the key', { overflow, memberId })
    }
    const permissionVerdict = { declared: granted.slice(), comparable, overflow }
    const s = staff.get(memberId)
    if (!s) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'no staff record for ' + String(memberId), 'accept() first', { memberId })
    const remaining = s.probationUntil === null ? 0 : Math.max(0, s.probationUntil - clock())
    return { memberId, slot: s.slot, hiredAt: s.hiredAt, probationUntil: s.probationUntil, remainingMs: remaining, probationPermissions: permissionVerdict, confirmed: !!s.confirmedAt }
  }

  /** confirm(): probation must be over; named refusal with remaining time otherwise. */
  function confirm({ memberId, by = null } = {}) {
    const s = staff.get(memberId)
    if (!s) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'no staff record for ' + String(memberId), 'accept() first', { memberId })
    if (s.confirmedAt) return { memberId, slot: s.slot, confirmed: true, confirmedAt: s.confirmedAt }
    const now = clock()
    if (s.probationUntil !== null && now < s.probationUntil) {
      throw refuse('VMU_RECRUIT_PROBATION_NOT_DUE', 'probation not over for ' + memberId + ': remaining=' + (s.probationUntil - now) + 'ms',
        'wait for probation to elapse (vmu.recruit.probationMs=' + cfg().probationMs + ')', { memberId, remainingMs: s.probationUntil - now, probationUntil: s.probationUntil })
    }
    s.confirmedAt = now
    s.by = by || s.by
    if (bus && typeof bus.emit === 'function') bus.emit('recruit/confirmed', { memberId, slot: s.slot, by: by || null })
    return { memberId, slot: s.slot, confirmed: true, confirmedAt: now }
  }

  /** Read-only views (never mutate; every truncation is counted). */
  const postingsView = () => { const all = [...postings.values()].map((p) => ({ id: p.id, slot: p.slot, seats: p.seats, applicants: p.applicants.length, openedAt: p.openedAt })); const kept = all.slice(0, listCap); return { items: kept, total: all.length, dropped: dropped + (all.length - kept.length) } }
  const status = () => {
    // ROUND 267: the recruitment method and the decision maker are part of what this face reports.
    const decl = cfg()
    const declared = { policy: decl.policy, decideBy: decl.decideBy, needsHuman: decl.needsHuman, probationPermissions: decl.probationPermissions.slice() }
    const all = [...staff.values()].map((s) => ({ memberId: s.memberId, slot: s.slot, hiredAt: s.hiredAt, probationUntil: s.probationUntil, confirmed: !!s.confirmedAt }))
    const kept = all.slice(0, listCap)
    return { declared, postings: postings.size, applications: applications.size, offers: offers.size, staff: all.length, items: kept, dropped: dropped + (all.length - kept.length), policy: cfg(), memberSource: members ? 'injected' : 'none' }
  }

  /** ROUND 217: renew a term. `vmu.roles.termRenewable=false` refuses by name. */
  function renewTerm({ memberId, reason = null } = {}) {
    const st = staff.get(memberId)
    if (!st) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'no staff record for ' + String(memberId), 'accept() first', { memberId })
    const c = cfg()
    if (!c.termRenewable) throw refuse('VMU_ROLE_TERM_NOT_RENEWABLE', 'vmu.roles.termRenewable=false: this term cannot be renewed', 'the seat must be vacated and refilled', { memberId })
    const now = clock()
    const base = st.termUntil !== null && st.termUntil > now ? st.termUntil : now
    const add = c.termDefaultMs > 0 ? c.termDefaultMs : 0
    let next = add > 0 ? base + add : st.termUntil
    if (next !== null && c.termMaxMs > 0 && next - now > c.termMaxMs) next = now + c.termMaxMs
    st.termUntil = next
    st.renewedReason = reason === null ? st.renewedReason : String(reason)
    return { memberId, slot: st.slot, termUntil: st.termUntil, renewable: true }
  }

  /** ROUND 217: recall. `vmu.roles.recallQuorum` and `recallCoolDownMs` both bite here. */
  function recall({ memberId, support = 0, total = 0, reason = null } = {}) {
    const st = staff.get(memberId)
    if (!st) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'no staff record for ' + String(memberId), 'accept() first', { memberId })
    const c = cfg()
    const now = clock()
    if (c.recallCoolDownMs > 0 && Number.isFinite(st.recalledAt) && (now - st.recalledAt) < c.recallCoolDownMs) {
      throw refuse('VMU_ROLE_RECALL_COOLDOWN', 'recall cool-down is still running for ' + memberId + ': remaining=' + (c.recallCoolDownMs - (now - st.recalledAt)) + 'ms',
        'wait, or lower vmu.roles.recallCoolDownMs', { memberId, remainingMs: c.recallCoolDownMs - (now - st.recalledAt) })
    }
    if (c.recallQuorum > 0) {
      const ratio = total > 0 ? support / total : 0
      if (ratio < c.recallQuorum) {
        throw refuse('VMU_ROLE_RECALL_QUORUM', 'recall support below quorum: ' + support + '/' + total + ' < ' + c.recallQuorum + '',
          'gather more support, or lower vmu.roles.recallQuorum', { memberId, support, total, quorum: c.recallQuorum })
      }
    }
    st.recalls = (st.recalls || 0) + 1
    st.recalledAt = now
    return { memberId, slot: st.slot, recalled: true, recalls: st.recalls, reason: reason === null ? null : String(reason) }
  }

  /** ROUND 217: appoint an acting holder. `actingNeedsReason` and `actingMaxMs` both bite here. */
  function actAsChair({ memberId, ms = null, reason = null } = {}) {
    const st = staff.get(memberId)
    if (!st) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'no staff record for ' + String(memberId), 'accept() first', { memberId })
    const c = cfg()
    if (c.actingNeedsReason && !(typeof reason === 'string' && reason.trim())) {
      throw refuse('VMU_REASON_REQUIRED', 'vmu.roles.actingNeedsReason=true: a reason is required to act', 'pass reason:…', { memberId, missing: ['reason'] })
    }
    const now = clock()
    let until = Number.isInteger(ms) && ms > 0 ? now + ms : (c.actingMaxMs > 0 ? now + c.actingMaxMs : null)
    let clamped = false
    if (until !== null && c.actingMaxMs > 0 && until - now > c.actingMaxMs) { until = now + c.actingMaxMs; clamped = true }
    st.actingUntil = until
    st.actingClamped = clamped
    st.actingReason = String(reason)
    return { memberId, slot: st.slot, actingUntil: until, clamped }
  }

  /** ROUND 217: promote. `promotionNeedsEvidence` bites here. */
  function promote({ memberId, toSlot, evidence = null } = {}) {
    const st = staff.get(memberId)
    if (!st) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'no staff record for ' + String(memberId), 'accept() first', { memberId })
    const c = cfg()
    const realTo = slotOf(toSlot)
    if (c.promotionNeedsEvidence && !evidence) throw refuse('VMU_ROLE_EVIDENCE_REQUIRED', 'vmu.roles.promotionNeedsEvidence=true: a promotion needs evidence', 'pass evidence:<path|note>', { memberId, toSlot: realTo, missing: ['evidence'] })
    for (const pair of c.separationPairs) {
      const other = pair.a === realTo ? pair.b : (pair.b === realTo ? pair.a : null)
      if (other && [...staff.values()].some((x) => x.memberId === memberId && x.slot === other)) {
        throw refuse('VMU_ROLE_SEPARATION_VIOLATED', 'separation of duties: ' + memberId + ' holds ' + other + '',
          'promote another member, or drop the pair from vmu.roles.separationPairs', { memberId, toSlot: realTo, other })
      }
    }
    const from = st.slot
    st.slot = realTo
    st.promotedAt = clock()
    st.promotionEvidence = String(evidence)
    return { memberId, from, to: realTo, promotedAt: st.promotedAt }
  }

  return { apiVersion, renewTerm, recall, actAsChair, promote, openPosting, apply, score, offer, accept, reject, probation, confirm, postings: postingsView, status, aggregate: (list, mode) => aggregate(list, mode || cfg().scoreAggregate) }
}
