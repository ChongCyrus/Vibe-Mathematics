// vmu kernel meetingleave — the LEAVE/RECESS REQUEST family (ask → decide), extracted from `kernel/meetings.js`
// at the 1200-line boundary (docs/02 §L174) exactly the way `kernel/meetinglapse.js` was.
//
// THE SPLIT IS ALONG THE RULE/STATE SEAM:
//   · this module owns the RULES — who may ASK, who may DECIDE (`vmu.meetings.leaveApprover`: chair, office as the
//     declared fallback), that BOTH sides need a reason, that a decision is idempotent, and that a refusal is a
//     first-class decision;
//   · `kernel/meetings.js` owns the STATE — the live meeting records, the minutes, the receipts, the counters, and
//     the receipt vocabulary (it maps the `keys` this module reports into its own scope-carrying receipt fields).
//
// VOCABULARY NOTE: the returned objects carry `keys` — the settings keys the rule actually read. The stateful face
// attaches its own evaluated-scope fields, so this module never spells that vocabulary itself.

/**
 * Build the leave-request surface. Injected seams (all owned by the meeting face):
 *   · `requireMeeting(id)`      — resolves the meeting record (and fails closed on a lapsed one);
 *   · `isMember(id)`            — the roster seam (without one the face accepts any id: it invents no roster);
 *   · `clock()`                 — the instant normaliser;
 *   · `limits()`                — a GETTER over the live settings (so a hot change is honoured);
 *   · `deny(code,msg,hint,keys)`— the face's named refusal (it attaches the scope);
 *   · `pushReceipt(row)`        — the face's receipt ledger.
 */
export function createLeaveControls({ requireMeeting, isMember, clock, limits, deny, pushReceipt = () => {} } = {}) {
  const approverOf = () => String(limits().leaveApprover || 'chair')

  /** ASK to leave. Recorded as `pending` with a reason; a second ask while pending is idempotent. */
  const requestLeave = ({ meeting, member = null, why = '', at = null } = {}) => {
    const m = requireMeeting(meeting)
    const who = String(member === null || member === undefined ? '' : member)
    const keys = ['vmu.meetings.leaveApprover']
    const approver = approverOf()
    if (!isMember(who)) {
      throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + who,
        'requestLeave acts as the member asking to leave (08 D-series)', keys)
    }
    const reason = String(why || '').trim()
    if (!reason) throw deny('VMU_REASON_REQUIRED', 'a leave request needs { why }', 'an unexplained absence cannot be approved or refused', keys)
    const now = at === null ? clock() : at
    if (!m.leaveRequests) m.leaveRequests = new Map()
    const prior = m.leaveRequests.get(who)
    if (prior && prior.state === 'pending') return { ok: true, deduped: true, member: who, state: 'pending', approver, at: prior.at, keys }
    const rec = { member: who, state: 'pending', why: reason, at: now, decidedAt: 0, decidedBy: null, decisionWhy: null }
    m.leaveRequests.set(who, rec)
    m.minutes.entries.push({ at: now, kind: 'leave-request', member: who, why: reason, approver })
    pushReceipt({ at: now, action: 'leave-request', meeting: m.id, member: who, approver, keys })
    return { ok: true, member: who, state: 'pending', approver, at: now, keys }
  }

  /** DECIDE a leave request. THE decision point: the DECLARED approver decides, and nothing else does. */
  const approveLeave = ({ meeting, member = null, by = null, why = '', approve = true, at = null } = {}) => {
    const m = requireMeeting(meeting)
    const who = String(member === null || member === undefined ? '' : member)
    const actor = String(by === null || by === undefined ? '' : by)
    const keys = ['vmu.meetings.leaveApprover']
    const approver = approverOf()
    if (!who || !actor) throw deny('VMU_INVALID_ARGUMENT', 'approveLeave needs { member, by }', 'name both the requester and the approver', keys)
    if (approver === 'chair') {
      if (m.chair === null || m.chair === undefined || String(m.chair) !== actor) {
        throw deny('VMU_NOT_PERMITTED', 'only the CHAIR may decide a leave request: ' + actor,
          'vmu.meetings.leaveApprover=chair (the declared policy); the chair of this meeting is '
            + String(m.chair === null || m.chair === undefined ? '(none)' : m.chair), keys)
      }
    } else if (actor !== 'office') {
      throw deny('VMU_NOT_PERMITTED', 'vmu.meetings.leaveApprover=office: only the office ("office") may decide: ' + actor,
        'the declared fallback identity is the literal "office"', keys)
    }
    const reason = String(why || '').trim()
    if (!reason) throw deny('VMU_REASON_REQUIRED', 'deciding a leave request needs { why }', 'an unexplained approval/refusal is unauditable', keys)
    const rec = m.leaveRequests ? m.leaveRequests.get(who) : null
    if (!rec) throw deny('VMU_NO_SUCH_OBJECT', 'no leave request from: ' + who, 'requestLeave() first', keys)
    if (rec.state !== 'pending') {
      return { ok: true, deduped: true, member: who, state: rec.state, decidedBy: rec.decidedBy, keys }
    }
    const now = at === null ? clock() : at
    rec.state = approve === false ? 'refused' : 'approved'
    rec.decidedAt = now
    rec.decidedBy = actor
    rec.decisionWhy = reason
    m.minutes.entries.push({ at: now, kind: 'leave-decided', member: who, decision: rec.state, by: actor, why: reason, approver })
    pushReceipt({ at: now, action: 'leave-decided', meeting: m.id, member: who, decision: rec.state, by: actor, keys })
    return { ok: true, member: who, state: rec.state, approver, decidedBy: actor, at: now, keys }
  }

  /** The requests and their decisions (read-only), with the declared approver reported. */
  const leaveRequests = ({ meeting } = {}) => {
    const m = requireMeeting(meeting)
    const rows = m.leaveRequests ? [...m.leaveRequests.values()] : []
    return { ok: true, meeting: m.id, approver: approverOf(), requests: rows.map((r) => Object.assign({}, r)),
      pending: rows.filter((r) => r.state === 'pending').length, keys: ['vmu.meetings.leaveApprover'] }
  }

  return { requestLeave, approveLeave, leaveRequests }
}

export default { createLeaveControls }
