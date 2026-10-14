// vmu meetings — THE DURABLE DOMAIN MARKER (F51 / task-89), split out of `kernel/meetings.js` (round 11).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────────────────────
// `kernel/meetings.js` crossed the 1200-line limit decided in docs/02 §L174 (it was 1244 lines after F51). The cut
// follows the cleanest seam available: F51's marker family answers ONE question — "which meeting was still open in
// the last process?" — and needs only three ports, so it never had to live inside the face.
//
// ── THE BOUNDARY (one-way; a change on the wrong side is a bug) ─────────────────────────────────────────────────
//   · `kernel/meetings.js` OWNS THE MEETING OBJECTS (`live`, `archive`), the clock and every transition. It calls
//     `markState(m, state)` at each transition site (open / suspend / recess ×2 / resume→open / close, plus
//     lapse / revokeLapse through the seam injected into `createMeetingControls`) and must never write
//     `m.domainState` itself — that would be a second implementation of the marker.
//   · THIS MODULE OWNS THE MARKER: the face label ⇒ DOMAIN label derivation (`open|lapsed|closed`), the durable
//     seam write, the read-back view (`openMeetings()`), and the self-disclosure (`status()`).
//   · The carrier is the EXISTING `meetings` projection key (Lead's ruling: no new key, no new setting): the
//     marker is a field of each meeting, so the domain envelope already carries it; the `{read(), write(rows)}`
//     seam is the declarative port for a host that wants it durable independently of the projection.
// ⇒ "what a meeting's state IS" changes in meetings.js; "what SURVIVES, and what we claim about a previous
//   process" changes here.
//
// NOTHING IS INVENTED: an unbound seam is `durableMarker:false`, an empty read is an empty institute, and an
// unreadable seam is the registered refusal `VMU_MEETINGS_MARKER_UNREADABLE` (docs/03 §8) — never a guess.

/** Public-interface version of this module's surface (docs/03 §7, D13-O3). */
export const apiVersion = 1

/**
 * `createMeetingMarker({ clock, live, archive, durable })` ⇒ `{ markState, openMeetings, stateRows, status }`.
 *
 * `live` (Map) and `archive` (array) are the face's own containers, passed by reference: the marker reads them, it
 * does not own them. `durable` is the declarative domain seam `{ read(), write(rows) }` — optional by design.
 */
export function createMeetingMarker({ clock = () => 0, live = new Map(), archive = [], durable = null } = {}) {
  let writes = 0
  let failures = 0
  let lastError = null

  const domainOf = (label) => (label === 'closed' || label === 'lapsed' ? label : 'open')
  const stateRows = () => [...live.values(), ...archive]
    .filter((m) => m && typeof m.id === 'string')
    .map((m) => ({ id: String(m.id), state: domainOf(m.domainState) }))

  /**
   * The ONE state writer. Keeps the face's own detailed label (`open|suspended|recess|lapsed|closed`) AND derives
   * the domain marker a restart question needs: a recessed or suspended meeting is still an UNCONCLUDED meeting.
   */
  const markState = (m, state) => {
    const label = String(state)
    m.state = label
    m.domainState = domainOf(label)
    m.domainStateAt = clock()
    if (durable && typeof durable.write === 'function') {
      writes += 1
      try { durable.write(stateRows()) } catch (e) { failures += 1; lastError = String((e && e.message) || e) }
    }
    return m.domainState
  }

  /**
   * WHICH MEETING IS STILL OPEN, AS OF THE LAST PROCESS. No seam ⇒ `durableMarker:false` + `meetings: []` + why;
   * a seam that reads EMPTY is an empty institute — never a meeting that is "still open" because nothing was read.
   */
  const openMeetings = () => {
    if (!durable || typeof durable.read !== 'function') {
      return { ok: true, durableMarker: false, meetings: [], source: 'none',
        note: 'no durable domain seam is bound: NOTHING is claimed about meetings from a previous process (named, not pretended)' }
    }
    let rows = null
    try { rows = durable.read() } catch (e) {
      failures += 1
      lastError = String((e && e.message) || e)
      return { ok: false, durableMarker: true, meetings: [], source: 'seam-error', code: 'VMU_MEETINGS_MARKER_UNREADABLE',
        message: lastError, note: 'the durable domain seam could not be read: refusing to guess which meeting is open' }
    }
    const list = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r.id === 'string')
    return { ok: true, durableMarker: true, source: 'durable-seam',
      meetings: list.map((r) => ({ id: String(r.id), state: domainOf(r.state) })),
      note: list.length ? 'read back from the durable domain seam' : 'the durable seam reports no meeting at all (an empty institute is not a failed read)' }
  }

  /** Self-disclosure, the G7 `status().durableLog.bound` shape: `bound:false` claims nothing about a past process. */
  const status = () => ({ bound: !!(durable && typeof durable.read === 'function'), writes, failures, lastError })

  return { markState, openMeetings, stateRows, status, mirrorVote }
}

/**
 * ROUND 11 FIX (reader-b's e2e) + ROUND 12 (task-92): mirror one vote into the injected `ballot` seam and RETURN
 * what actually happened — `{ mirrored, reason, code? }`. The call site used to be `try { … } catch {}`, so a refused
 * or throwing seam left `vote()` reporting success while nothing reached a box. A seam that refuses is not an error
 * of the MEETING (the vote is the face's own record, so `ok` stays true), but it must never be INVISIBLE.
 *
 * ── THE `motion→box` BINDING (R1: OPENING A BOX IS POLICY, NOT KERNEL MECHANISM) ────────────────────────────────
 * `boxFor({meeting, motion, member, value})` is a DECLARED callback (pack/consumer) answering which box a motion
 * belongs to: a `boxId`, or `{boxId, value, by}` when the box's option vocabulary differs from the meeting's 0/1.
 * This module only CALLS it — it never opens a box, never invents a mapping, never caches one. ⇒ Asking twice for
 * the same motion is IDEMPOTENT BY CONSTRUCTION: same answer, same box, the vote lands once and no second box
 * appears. Every failure is a NAMED code: `VMU_MEETING_BOX_UNWIRED` (nothing declared),
 * `VMU_MEETING_BOX_UNMAPPED` (declared, answered "no box"), `VMU_MEETING_BOX_BINDING_FAILED` (the callback threw;
 * its own `code` wins when it carries one).
 */
export function mirrorVote({ ballot = null, boxFor = null, counters = {}, meeting = null, motionId = null, member = null, value = 1 } = {}) {
  if (!ballot || typeof ballot.cast !== 'function') {
    counters.ballotMirrorSkipped = (counters.ballotMirrorSkipped || 0) + 1
    return { mirrored: false, reason: 'no-seam' }
  }
  if (typeof boxFor !== 'function') {
    counters.ballotMirrorFailed = (counters.ballotMirrorFailed || 0) + 1
    return { mirrored: false, reason: 'no-binding', code: 'VMU_MEETING_BOX_UNWIRED' }
  }
  let boxId = null
  let wire = { value, by: null }
  try {
    const bound = boxFor({ meeting, motion: motionId, member, value })
    if (bound === null || bound === undefined) {
      counters.ballotMirrorFailed = (counters.ballotMirrorFailed || 0) + 1
      return { mirrored: false, reason: 'unmapped', code: 'VMU_MEETING_BOX_UNMAPPED' }
    }
    if (typeof bound === 'string') boxId = bound
    else if (bound && typeof bound === 'object') {
      boxId = bound.boxId === undefined || bound.boxId === null ? null : String(bound.boxId)
      wire = { value: bound.value === undefined ? value : bound.value, by: bound.by === undefined ? null : bound.by }
    }
    if (!boxId) {
      counters.ballotMirrorFailed = (counters.ballotMirrorFailed || 0) + 1
      return { mirrored: false, reason: 'unmapped', code: 'VMU_MEETING_BOX_UNMAPPED' }
    }
  } catch (e) {
    counters.ballotMirrorFailed = (counters.ballotMirrorFailed || 0) + 1
    return { mirrored: false, reason: 'binding-threw', code: (e && e.code) || 'VMU_MEETING_BOX_BINDING_FAILED', message: String((e && e.message) || e) }
  }
  try {
    const r = ballot.cast({ meeting, motion: motionId, member, value: wire.value, by: wire.by, boxId })
    if (r && r.ok === false) {
      counters.ballotMirrorFailed = (counters.ballotMirrorFailed || 0) + 1
      return { mirrored: false, reason: 'refused', code: r.code || null, boxId }
    }
    return { mirrored: true, reason: 'cast', boxId, code: null }
  } catch (e) {
    counters.ballotMirrorFailed = (counters.ballotMirrorFailed || 0) + 1
    return { mirrored: false, reason: 'threw', code: (e && e.code) || null, boxId, message: String((e && e.message) || e) }
  }
}

/**
 * `budgetVerdictOf(env, m, label, value, limit, evaluated)` — the per-meeting budget decision, moved here in round 12
 * when `kernel/meetings.js` crossed 1200 lines again (it was 1207 after the `meeting/motion` emit). The rule is the
 * same one that produced this module in round 11: a cohesive decision that needs only ports lives in its own module
 * rather than pushing the face over the limit. `env` carries the face's own closures so NOTHING is re-implemented:
 * `{ K, capIn, counters, say, clock }`. Refusals stay named (`VMU_RESOURCE_BUDGET` through `capIn`) and the warn /
 * extend branches keep their exact former shape.
 */
export function budgetVerdictOf(env, m, label, value, limit, evaluated) {
  const { K, capIn, counters, say, clock } = env
  if (K.budgetOnExceed === 'refuse') capIn(m, 'VMU_RESOURCE_BUDGET', label, value, limit, 'vmu.meetings.' + label, evaluated)
  if (K.budgetOnExceed === 'warn') {
    counters.softBudget += 1
    say({ type: 'meetings/budget-soft', at: clock(), label, value, limit })
    return { code: 'VMU_QUOTA_SOFT_EXCEEDED', label, value, limit, policy: 'warn' }
  }
  counters.softBudget += 1
  return { code: null, label, value, limit, policy: 'extend' }
}

/**
 * `createBoxBinding({ clock, initial, refuse })` ⇒ `{ bind, view, resolve }` — the `motion → box` binding family,
 * moved here in round 12 when `kernel/meetings.js` crossed 1200 lines again (1245). It belongs with `mirrorVote`:
 * "who supplies the box for a mirrored vote" is the same concern as "what happens when they cannot".
 *
 * THE BINDING IS A METHOD, NOT A MANIFEST FIELD (Lead ruling (i)): every seam in this repo is a capability-gated
 * service method (R10's `api.services.get`), and a manifest field would be a SECOND parallel channel; a method can
 * also be REVOKED, SELF-REPORTED and asserted - the same discipline as G7's `durableLog.bound` and F51's
 * `durableMarker` ("if it is not wired, that must be READABLE"). THE POLICY STAYS OUTSIDE: the face only CALLS the
 * callback; opening/closing a box is the caller's act (`mirrorVote`, whose three named outcomes are
 * `VMU_MEETING_BOX_UNWIRED` / `VMU_MEETING_BOX_UNMAPPED` / `VMU_MEETING_BOX_BINDING_FAILED`).
 *
 * Bind, replace or CLEAR the callback. Unbound is a first-class, NAMED state (`VMU_MEETING_BOX_UNWIRED` at vote
 * time, `status().boxBinding.bound === false`), never a silent no-op; a non-callable argument is refused BY NAME,
 * because a binding that cannot answer is exactly the silence this method exists to prevent. `refuse` is injected
 * by the face so the code literal stays single-sourced.
 */
export function createBoxBinding({ clock, initial = null, refuse }) {
  let binding = typeof initial === 'function' ? initial : null
  let source = typeof initial === 'function' ? 'injected' : null
  let at = null
  let changes = 0
  const view = () => ({ bound: typeof binding === 'function', source, at, changes })
  const resolve = () => binding
  const bind = (fn = null) => {
    if (fn !== null && fn !== undefined && typeof fn !== 'function') {
      throw refuse('VMU_INVALID_ARGUMENT', 'bindBox needs a function (or null to unbind)',
        'pass ({meeting, motion, member, value}) => boxId | {boxId, value, by} | null')
    }
    const next = typeof fn === 'function' ? fn : null
    const had = typeof binding === 'function'
    binding = next
    source = next === null ? null : 'method'
    at = clock()
    changes += 1
    return { ok: true, bound: next !== null, replaced: had && next !== null, at, changes,
      note: next === null
        ? 'unbound: the next vote reports VMU_MEETING_BOX_UNWIRED (named, not silent)'
        : 'bound by method: this face only CALLS the callback (opening a box is the caller\'s act)' }
  }
  return { bind, view, resolve }
}

/** The value record for every wired key (explicit map; a name-derived lookup silently produced nulls). */
export function meetingKeysSnapshot(K) {
  return {
    'vmu.meetings.wakeRetries': K.wakeRetries, 'vmu.meetings.verdictMaxRounds': K.verdictMaxRounds, 'vmu.meetings.hardLimitMs': K.hardLimitMs,
    'vmu.meetings.tier': K.tier, 'vmu.meetings.allowLight': K.allowLight,
    'vmu.meetings.typeCatalog': K.typeCatalog, 'vmu.meetings.attendanceMode': K.attendanceMode, 'vmu.meetings.liveCap': K.liveCap,
    'vmu.meetings.quorumMin': K.quorumMin, 'vmu.meetings.quorumRatio': K.quorumRatio, 'vmu.meetings.quorumLossPolicy': K.quorumLossPolicy, 'vmu.meetings.quorumCap': K.quorumCap,
    'vmu.meetings.quorumRecountMs': K.quorumRecountMs, 'vmu.meetings.unansweredInDenominator': K.unansweredInDenominator,
    'vmu.meetings.emergencyQuorumRatio': K.emergencyQuorumRatio, 'vmu.meetings.emergencyKinds': K.emergencyKinds,
    'vmu.meetings.chairNeutral': K.chairNeutral, 'vmu.meetings.chairTransferAudit': K.chairTransferAudit,
    'vmu.meetings.committeeMax': K.committeeMax, 'vmu.meetings.committeeReportRequired': K.committeeReportRequired,
    'vmu.meetings.budgetTurns': K.budgetTurns, 'vmu.meetings.budgetTokens': K.budgetTokens, 'vmu.meetings.budgetWallMs': K.budgetWallMs,
    'vmu.meetings.budgetOnExceed': K.budgetOnExceed,
    'vmu.meetings.speechDefaultMs': K.speechDefaultMs, 'vmu.meetings.speechMaxMs': K.speechMaxMs, 'vmu.meetings.speechExtendMs': K.speechExtendMs,
    'vmu.meetings.speechExtendMax': K.speechExtendMax, 'vmu.meetings.speechQuotaPerMember': K.speechQuotaPerMember,
    'vmu.meetings.interruptAllow': K.interruptAllow, 'vmu.meetings.interruptQuota': K.interruptQuota, 'vmu.meetings.orderMode': K.orderMode,
    'vmu.meetings.lateAfterMs': K.lateAfterMs, 'vmu.meetings.leaveEarlyPolicy': K.leaveEarlyPolicy, 'vmu.meetings.materialsRequired': K.materialsRequired,
    'vmu.meetings.minutesDetail': K.minutesDetail, 'vmu.meetings.minutesIncludeRefused': K.minutesIncludeRefused,
    'vmu.meetings.minutesActionsRequired': K.minutesActionsRequired, 'vmu.meetings.minutesRetentionMs': K.minutesRetentionMs,
    'vmu.meetings.confirmPreviousMinutes': K.confirmPreviousMinutes,
    'vmu.meetings.appealDeadlineMs': K.appealDeadlineMs, 'vmu.meetings.appealReasonRequired': K.appealReasonRequired, 'vmu.meetings.appealScope': K.appealScope,
    'vmu.meetings.disciplineWarnMax': K.disciplineWarnMax, 'vmu.meetings.disciplineMuteMs': K.disciplineMuteMs,
    'vmu.meetings.disciplineExpelAllowed': K.disciplineExpelAllowed,
    'vmu.meetings.recessMaxMs': K.recessMaxMs, 'vmu.meetings.recessResumeRequiresMotion': K.recessResumeRequiresMotion,
    'vmu.meetings.leaveApprover': K.leaveApprover,
    'vmu.meetings.confidentialityDefault': K.confidentialityDefault, 'vmu.meetings.confidentialityQuotePolicy': K.confidentialityQuotePolicy,
    'vmu.meetings.verbatimEnabled': K.verbatimEnabled, 'vmu.meetings.verbatimRetentionMs': K.verbatimRetentionMs,
    'vmu.meetings.wakeFailurePolicy': K.wakeFailurePolicy,
  }
}

export default createMeetingMarker
