// vibe-math-vmu/kernel/reviewers.js — the reviewer market (volume 16 §L297-§L305, family G1).
//
// ROUND 279. Built as its OWN face because the wiring bookkeeping is per family (round 275) and the neighbouring conference face pins an
// exact count of ITS OWN keys with no cross-family tier. The volume gives the schema, the three field-level rules and the defaults:
//   schema   reviewers[{ id, expertise[], load, conflicts[] }] | reviewAssignment{ reviewerId, submissionId, mode, blind, ... }
//   rules    ① COI: a conflict that hits the subject must RECUSE, otherwise a named refusal
//            ② the blind mapping follows `mode`, and the mapping table and every UNBINDING must be traced (who, when)
//            ③ load: a per-reviewer concurrent assignment cap
//   keys     vmu.review.mode (single-blind), vmu.review.conflictPolicy (recuse), vmu.review.quorum,
//            vmu.reviewers.maxLoad (3), vmu.reviewers.coiPolicy (deny), vmu.reviewers.blindUnbindRequiresReason (true)
//   codes    VMU_COI_VIOLATION, VMU_REVIEWER_OVERLOADED, VMU_BLIND_UNBIND_DENIED
export const apiVersion = 1

export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  if (extra) Object.assign(err, extra)
  return err
}

export const MODES = Object.freeze(['single-blind', 'double-blind', 'open'])
export const COI_POLICIES = Object.freeze(['deny', 'ask'])

export function createReviewers({ clock = () => 0, log = () => {}, settings = {}, bus = null } = {}) {
  const cfg = () => ({
    mode: MODES.includes(settings['vmu.review.mode']) ? settings['vmu.review.mode'] : 'single-blind',
    conflictPolicy: ['recuse', 'ask', 'allow'].includes(settings['vmu.review.conflictPolicy']) ? settings['vmu.review.conflictPolicy'] : 'recuse',
    quorum: Number.isInteger(settings['vmu.review.quorum']) && settings['vmu.review.quorum'] >= 0 ? settings['vmu.review.quorum'] : 0,
    maxLoad: Number.isInteger(settings['vmu.reviewers.maxLoad']) && settings['vmu.reviewers.maxLoad'] > 0 ? settings['vmu.reviewers.maxLoad'] : 3,
    coiPolicy: COI_POLICIES.includes(settings['vmu.reviewers.coiPolicy']) ? settings['vmu.reviewers.coiPolicy'] : 'deny',
    blindUnbindRequiresReason: settings['vmu.reviewers.blindUnbindRequiresReason'] !== false,
    // ROUND 283 (volume 16 §L302): optional acknowledgement/remuneration registration, off by default.
    acknowledgement: settings['vmu.reviewers.acknowledgement'] === true,
  })

  const reviewers = new Map()      // id -> { id, expertise[], conflicts[] }
  const assignments = new Map()    // assignmentId -> { id, reviewerId, submissionId, mode, blind, assignedAt, unboundAt, unbindReason, unboundBy }
  const trace = []
  const acknowledgements = []   // ROUND 283: only ever written when the declaration allows it
  const counts = { registered: 0, assigned: 0, refused: 0, unbound: 0, acknowledged: 0 }
  const keysUsed = new Set()

  const say = (row) => { try { log(row) } catch (e) { /* a throwing log seam must not corrupt the face */ } }
  const deny = (code, message, hint, extra) => {
    counts.refused += 1
    trace.push({ at: clock(), type: 'reviewers/refused', code, message })
    say({ type: 'reviewers/refused', at: clock(), code, message })
    return refuse(code, message, hint, extra)
  }
  const str = (v) => (typeof v === 'string' ? v : '')
  const listOr = (v) => (Array.isArray(v) ? v.map(String) : [])

  /** Rule ①'s data: an expertise list and a conflict list, kept per reviewer. */
  function register({ id = null, expertise = [], conflicts = [] } = {}) {
    const rid = str(id).trim()
    if (!rid) return deny('VMU_INVALID_ARGUMENT', 'a reviewer needs an id', 'pass { id, expertise[], conflicts[] }')
    const rec = { id: rid, expertise: listOr(expertise), conflicts: listOr(conflicts), at: clock() }
    reviewers.set(rid, rec)
    counts.registered += 1
    if (bus && typeof bus.emit === 'function') bus.emit('reviewers/registered', { id: rid, at: clock() })
    return Object.assign({ ok: true }, rec)
  }

  /** The live load of a reviewer: assignments not yet unbound. */
  const loadOf = (id) => [...assignments.values()].filter((a) => a.reviewerId === id && a.unboundAt === null).length

  /**
   * Rule ① and rule ③: a conflicted reviewer cannot be assigned (named refusal), and a reviewer at the declared cap cannot be either.
   * Rule ②: the assignment records the blind mode it was made under, so the mapping is auditable.
   */
  function assign({ reviewerId = null, submissionId = null, subjectOfConflicts = null } = {}) {
    const c = cfg()
    keysUsed.add('vmu.review.mode').add('vmu.review.conflictPolicy').add('vmu.reviewers.maxLoad').add('vmu.reviewers.coiPolicy')
    const rid = str(reviewerId).trim()
    const sid = str(submissionId).trim()
    if (!rid) return deny('VMU_INVALID_ARGUMENT', 'an assignment needs a reviewerId', 'pass { reviewerId, submissionId }')
    if (!sid) return deny('VMU_INVALID_ARGUMENT', 'an assignment needs a submissionId', 'pass { reviewerId, submissionId }')
    const rec = reviewers.get(rid)
    if (!rec) return deny('VMU_INVALID_ARGUMENT', 'unknown reviewer: ' + rid, 'register the reviewer first (volume 16 §L298)')
    // ① COI: the conflict list is checked against the subject being reviewed.
    const subjects = new Set([sid, ...listOr(subjectOfConflicts)])
    const hit = rec.conflicts.filter((x) => subjects.has(x))
    if (hit.length && c.conflictPolicy === 'recuse') {
      return deny('VMU_COI_VIOLATION', 'reviewer ' + rid + ' has a declared conflict with ' + hit.join(', '),
        'recusal is required (vmu.review.conflictPolicy=recuse; volume 16 §L301 rule ①)', { reviewerId: rid, conflict: hit })
    }
    // ③ load
    const load = loadOf(rid)
    if (load >= c.maxLoad) {
      return deny('VMU_REVIEWER_OVERLOADED', 'reviewer ' + rid + ' is at the declared concurrent cap',
        'load=' + load + ', cap=' + c.maxLoad + ' (vmu.reviewers.maxLoad)', { reviewerId: rid, load, cap: c.maxLoad })
    }
    const id = 'ra-' + (assignments.size + 1)
    const blind = c.mode !== 'open'
    const row = { id, reviewerId: rid, submissionId: sid, mode: c.mode, blind, assignedAt: clock(), unboundAt: null, unbindReason: null, unboundBy: null }
    assignments.set(id, row)
    counts.assigned += 1
    trace.push({ at: clock(), type: 'reviewers/assigned', id, reviewerId: rid, submissionId: sid, mode: c.mode, blind })
    return Object.assign({ ok: true, conflictChecked: hit.length > 0, coiPolicy: c.coiPolicy, load: load + 1, cap: c.maxLoad }, row)
  }

  /** Rule ②: unbinding is what breaks the blind, so it needs a reason and it is traced with who did it. */
  function unbind({ assignmentId = null, reason = null, by = null } = {}) {
    const c = cfg()
    keysUsed.add('vmu.reviewers.blindUnbindRequiresReason')
    const a = assignments.get(str(assignmentId))
    if (!a) return deny('VMU_INVALID_ARGUMENT', 'no such assignment: ' + String(assignmentId), 'assign() first')
    if (a.unboundAt !== null) return Object.assign({ ok: true, alreadyUnbound: true }, a)
    const hasReason = typeof reason === 'string' && reason.trim() !== ''
    if (a.blind && c.blindUnbindRequiresReason && !hasReason) {
      return deny('VMU_BLIND_UNBIND_DENIED', 'unbinding a blind assignment requires a reason',
        'pass reason:<why the blind is being broken> (vmu.reviewers.blindUnbindRequiresReason=true; §L301 rule ②)', { assignmentId: a.id })
    }
    a.unboundAt = clock()
    a.unbindReason = hasReason ? reason.trim() : null
    a.unboundBy = str(by) || null
    counts.unbound += 1
    trace.push({ at: clock(), type: 'reviewers/unbound', id: a.id, reason: a.unbindReason, by: a.unboundBy, wasBlind: a.blind })
    return Object.assign({ ok: true }, a)
  }

  /** `vmu.review.quorum`: how many finished reviews a submission needs. Zero (the default) means no quorum is demanded. */
  function quorumMet({ submissionId = null, completed = 0 } = {}) {
    const c = cfg()
    keysUsed.add('vmu.review.quorum')
    const n = Number.isInteger(completed) && completed >= 0 ? completed : 0
    return { ok: true, submissionId: str(submissionId) || null, completed: n, quorum: c.quorum, met: c.quorum === 0 ? true : n >= c.quorum,
      note: c.quorum === 0 ? 'vmu.review.quorum=0: no quorum is required' : null }
  }

  /**
   * ROUND 283 (`vmu.reviewers.acknowledgement`): an OPTIONAL acknowledgement/remuneration entry. Declared off, registering one is
   * refused by name - the declaration decides, and nothing silent happens either way.
   */
  function acknowledge({ reviewerId = null, submissionId = null, kind = 'acknowledgement', note = null } = {}) {
    const c = cfg()
    keysUsed.add('vmu.reviewers.acknowledgement')
    if (!c.acknowledgement) {
      return deny('VMU_NOT_PERMITTED', 'vmu.reviewers.acknowledgement=false: this register is off',
        'set vmu.reviewers.acknowledgement=true to keep acknowledgement or remuneration entries')
    }
    const rid = str(reviewerId).trim()
    if (!rid) return deny('VMU_INVALID_ARGUMENT', 'an acknowledgement needs a reviewerId', 'pass { reviewerId, submissionId, kind }')
    const row = { reviewerId: rid, submissionId: str(submissionId) || null,
      kind: ['acknowledgement', 'remuneration'].includes(kind) ? kind : 'acknowledgement',
      note: typeof note === 'string' && note.trim() ? note.trim() : null, at: clock() }
    acknowledgements.push(row)
    counts.acknowledged += 1
    trace.push({ at: clock(), type: 'reviewers/acknowledged', reviewerId: rid, kind: row.kind })
    return Object.assign({ ok: true }, row)
  }

  /** Read-only. `trace()` is the audit surface rule ② demands. */
  const reviewerView = (id) => { const r = reviewers.get(str(id)); return r ? Object.assign({}, r, { load: loadOf(r.id) }) : null }
  const status = () => ({
    ok: true, apiVersion, config: cfg(), reviewers: reviewers.size, assignments: assignments.size,
    liveAssignments: [...assignments.values()].filter((a) => a.unboundAt === null).length,
    counts: Object.assign({}, counts), keysUsed: [...keysUsed].sort(),
    blindTraced: trace.every((r) => r.type !== 'reviewers/unbound' || !r.wasBlind || r.reason !== null),
    zeroMechanism: reviewers.size === 0 && assignments.size === 0,
  })
  const traceView = (limit = 100) => trace.slice(-limit)

  return { apiVersion, register, assign, unbind, acknowledge, acknowledgements: (limit = 100) => acknowledgements.slice(-limit),
    quorumMet, reviewerView, status, trace: traceView, keysUsed: () => [...keysUsed].sort() }
}
