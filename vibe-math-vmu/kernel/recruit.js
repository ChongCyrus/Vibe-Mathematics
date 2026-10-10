// vmu kernel recruit — postings, applications, scoring, offers, probation, confirmation.
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
    seatsMax: intOr(settings['vmu.recruit.seatsMax'], Infinity),
    scoreRequiresRationale: boolOr(settings['vmu.recruit.scoreRequiresRationale'], true),
    scoreAggregate: ['mean', 'median', 'trimmed'].includes(settings['vmu.recruit.scoreAggregate']) ? settings['vmu.recruit.scoreAggregate'] : 'mean',
    offerExpiryMs: intOr(settings['vmu.recruit.offerExpiryMs'], 0),
    rejectNeedsReason: boolOr(settings['vmu.recruit.rejectNeedsReason'], true),
    requireEvidence: boolOr(settings['vmu.recruit.requireEvidence'], false),
    maxCandidates: intOr(settings['vmu.recruit.maxCandidates'], Infinity),
    roleMap: (settings['vmu.roles.map'] && typeof settings['vmu.roles.map'] === 'object') ? settings['vmu.roles.map'] : {},
  })

  /** S-1: map a job title to a role slot, or refuse by name. */
  const slotOf = (title) => {
    if (typeof title !== 'string' || !title) throw refuse('VMU_RECRUIT_SLOT_UNKNOWN', 'a role slot (or a mapped title) is required', 'pass slot:<id>, or declare vmu.roles.map[title]=slot', { title })
    const c = cfg()
    if (c.roleMap[title]) return c.roleMap[title]
    if (/^[a-z][a-z0-9-]*$/.test(title)) return title          // already looks like a slot id
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
    staff.set(a.candidate, { memberId: a.candidate, slot: o.slot, hiredAt: clock(), probationUntil, confirmedAt: null, by: by || null })
    return { memberId: a.candidate, slot: o.slot, probationUntil, confirmed: false }
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
    const s = staff.get(memberId)
    if (!s) throw refuse('VMU_RECRUIT_NOT_APPLIED', 'no staff record for ' + String(memberId), 'accept() first', { memberId })
    const remaining = s.probationUntil === null ? 0 : Math.max(0, s.probationUntil - clock())
    return { memberId, slot: s.slot, hiredAt: s.hiredAt, probationUntil: s.probationUntil, remainingMs: remaining, confirmed: !!s.confirmedAt }
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
    const all = [...staff.values()].map((s) => ({ memberId: s.memberId, slot: s.slot, hiredAt: s.hiredAt, probationUntil: s.probationUntil, confirmed: !!s.confirmedAt }))
    const kept = all.slice(0, listCap)
    return { postings: postings.size, applications: applications.size, offers: offers.size, staff: all.length, items: kept, dropped: dropped + (all.length - kept.length), policy: cfg(), memberSource: members ? 'injected' : 'none' }
  }

  return { apiVersion, openPosting, apply, score, offer, accept, reject, probation, confirm, postings: postingsView, status, aggregate: (list, mode) => aggregate(list, mode || cfg().scoreAggregate) }
}
