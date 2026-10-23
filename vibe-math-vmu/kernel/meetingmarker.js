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
    // ★★★ "WHICH MEETING IS STILL OPEN" MUST NOT INCLUDE CLOSED ONES. This function's own name and doc promise OPEN meetings, and
    // the filter only checked that `id` is a string - so a closed meeting was reported as still open. Measured on a full live run:
    // `vibe_v5_report` said "会议：开着的 2 场" while `m1` was closed and only `m2` was open, and the agent could see the
    // contradiction in the same receipt.
    // ★ AND THE EXCLUSION IS COUNTED, not silently dropped: `closedCount` says how many rows were read back and left out, so a
    // reader can tell "one meeting open" from "one open and one closed".
    // ★ EXCLUDE `closed` ONLY - NOT `lapsed`. The domain has three states (open|lapsed|closed); a LAPSED meeting is still a
    // meeting that needs attention (it can be revived), and `vmu-resume-e2e:14b` asserts that lapsed and open stay
    // DISTINGUISHABLE through this view. What must not appear is a meeting that is OVER. My first cut filtered to 'open' only,
    // which broke that distinction - the test was right and the filter was too broad.
    const openRows = list.filter((r) => domainOf(r.state) !== 'closed')
    return { ok: true, durableMarker: true, source: 'durable-seam',
      meetings: openRows.map((r) => ({ id: String(r.id), state: domainOf(r.state) })),
      readBack: list.length, closedCount: list.length - openRows.length,
      note: openRows.length
        ? 'read back from the durable domain seam'
        : (list.length
          ? 'the durable seam reports ' + list.length + ' meeting(s), none of them still open'
          : 'the durable seam reports no meeting at all (an empty institute is not a failed read)') }
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
export function mirrorVote({ ballot = null, boxFor = null, counters = {}, meeting = null, motionId = null, member = null, value = 1,
  motionText = null, motionKind = null, motionEmergency = false } = {}) {
  if (!ballot || typeof ballot.cast !== 'function') {
    counters.ballotMirrorSkipped = (counters.ballotMirrorSkipped || 0) + 1
    return { mirrored: false, reason: 'no-seam' }
  }
  if (typeof boxFor !== 'function') {
    counters.ballotMirrorFailed = (counters.ballotMirrorFailed || 0) + 1
    return { mirrored: false, reason: 'no-binding', code: 'VMU_MEETING_BOX_UNWIRED' }
  }
  let boxId = null
  let wire = { value, choice: null, by: null }
  try {
    // ROUND 13 B: the motion's OWN facts are passed through (the face already holds them) — pure data, not policy.
    const bound = boxFor({ meeting, motion: motionId, member, value, text: motionText, kind: motionKind, emergency: motionEmergency })
    if (bound === null || bound === undefined) {
      counters.ballotMirrorFailed = (counters.ballotMirrorFailed || 0) + 1
      return { mirrored: false, reason: 'unmapped', code: 'VMU_MEETING_BOX_UNMAPPED' }
    }
    if (typeof bound === 'string') boxId = bound
    else if (bound && typeof bound === 'object') {
      boxId = bound.boxId === undefined || bound.boxId === null ? null : String(bound.boxId)
      wire = { value: bound.value === undefined ? value : bound.value,
        choice: bound.choice === undefined ? null : bound.choice,
        by: bound.by === undefined ? null : bound.by }
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
    // ROUND 13 A (the root cause of `VMU_CONFLICT`): the box face reads `choice` (and requires `by`), while this
    // face's vocabulary is `value` (0|1). The binder may answer with either: `choice` WINS, `value` is the fallback.
    const r = ballot.cast({ meeting, motion: motionId, member, value: wire.value,
      choice: wire.choice === null || wire.choice === undefined ? wire.value : wire.choice, by: wire.by, boxId })
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
    'vmu.meetings.tier': K.tier, 'vmu.meetings.allowLight': K.allowLight, 'vmu.meetings.eligibleSeats': K.eligibleSeats,
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
    // ★ PHASE 12: the chair rails and the schedule/wait keys. They were ABSENT here when the rails landed (the
    // snapshot is a hand list), so `status().keys` silently under-reported them while `WIRED_KEYS` claimed them —
    // exactly the "the diagnostic surface is part of the system under test" failure. The suite's
    // `status().keys` size check now pins the two lists together.
    'vmu.meetings.conveneRequiresChair': K.conveneRequiresChair, 'vmu.meetings.closeRequiresChair': K.closeRequiresChair,
    'vmu.meetings.extendRequiresChair': K.extendRequiresChair, 'vmu.meetings.extendCeilingMs': K.extendCeilingMs,
    'vmu.meetings.scheduleAllowed': K.scheduleAllowed, 'vmu.meetings.waitOnDueMs': K.waitOnDueMs,
    'vmu.meetings.waitDecisionRequiresChair': K.waitDecisionRequiresChair,
    'vmu.meetings.waitForAll': K.waitForAll,
    'vmu.meetings.leaveApprover': K.leaveApprover,
    'vmu.meetings.confidentialityDefault': K.confidentialityDefault, 'vmu.meetings.confidentialityQuotePolicy': K.confidentialityQuotePolicy,
    'vmu.meetings.verbatimEnabled': K.verbatimEnabled, 'vmu.meetings.verbatimRetentionMs': K.verbatimRetentionMs,
    'vmu.meetings.wakeFailurePolicy': K.wakeFailurePolicy,
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ROUND 14 (task-108) · B③ `overrideOrder` + B④ `flow` — THE ORDER/FLOOR RULES (the FACE keeps the state).
 *
 * WHY THIS FAMILY LIVES HERE. `kernel/meetings.js` was at 1180/1200 lines (docs/02 §L174, enforced by
 * tests/audit-code-size.test.mjs) when B③/B④ landed, and this module is already the face's helper home
 * (`mirrorVote`, `budgetVerdictOf`, `createBoxBinding`, `meetingKeysSnapshot`). The seam is the one
 * `kernel/meetingleave.js` uses: THIS module owns the RULES; `kernel/meetings.js` owns the STATE (live records,
 * minutes, receipts, counters) and injects its own seams. The only field written here is `m.orderOverride`, the
 * slot this family owns — the marker slot (`m.domainState`) stays `createMeetingMarker`'s alone.
 *
 * ONE SLOT, ONE SET OF RAILS. `flow` and `overrideOrder` write the SAME per-meeting slot ("who decides the order"
 * is ONE decision), so both pass ONE authority rail (the chair of THAT meeting, declared at `open({chair})` and
 * never invented), ONE reason rail (`why` required) and ONE capability rail (`vmu.meetings.orderMode` must be
 * DECLARED by the deployment: undeclared ⇒ the override does not exist — zero mechanism, never a silent fallback).
 * `flow` is therefore NOT a side door around B③.
 *
 * B④ — THE FOUR FLOOR MODES, AND WHY ONLY FOUR (R8 ruling, docs/08 §25.14 B-4). The old vocabulary had six names;
 * two pairs were INDISTINGUISHABLE (`single`＝`hands`, `directed`＝`call_on`: the same behaviour under two names),
 * and a mode that cannot state an observable difference is MERGED rather than kept. Each surviving mode changes
 * something a caller can SEE:
 *   · `open`        — there is NO QUEUE: `queue()` reports `queued:false` + `order:[]` and stores nothing, so no
 *                     member can be "not their turn" (the only mode in which the queue stays empty);
 *   · `hands`       — one at a time, in HAND-RAISE order (arrival order IS the hand's time), and ANY member may
 *                     take a place (self-service);
 *   · `round_robin` — one at a time, by SPEECHES ALREADY GIVEN ascending (the face's existing branch): a member who
 *                     has spoken twice sorts after one who has not, whatever the arrival order was;
 *   · `call_on`     — one at a time, and the place is DESIGNATED BY THE CHAIR: only the chair may put a member in
 *                     the queue (a non-chair is refused BY NAME), and the queue keeps the chair's order.
 * The two merged names are NOT accepted as aliases: they are refused BY NAME with the merge story in the hint, so a
 * caller of the old six-name vocabulary learns which mode replaced it instead of being quietly honoured.
 *
 * B③ — `random` IS DETERMINISTIC AND AUDITABLE. No randomness is read anywhere (no `Math.random`): a member's rank
 * is a djb2 fingerprint of `seed|member` (the same dependency-free hash shape `kernel/bidding.js#fingerprintOf`
 * uses), so (a) the same inputs produce the same order twice, (b) the receipt AND the audit row carry BOTH the
 * `seed` and the resulting `order`, and (c) adding or removing a member does not re-shuffle anybody else's rank (a
 * per-member key rather than a position in a shuffled list).
 */

/** B③: the VALUE DOMAIN of `vmu.meetings.orderMode` — the three legacy orders plus `random`. */
export const ORDER_MODES = Object.freeze(['fifo', 'round-robin', 'chair', 'random'])

/**
 * ROUND 17 / task-118: the STRICT reader for `vmu.meetings.orderMode` - the twin of `oneOf` (meetings.js:128), which
 * replaced an out-of-domain value with the default SILENTLY. MEASURED before this change (D:\_tmp\v17\
 * repro-orderMode.mjs): `bogus`, `fifo` and "key absent" all produced the SAME queue order, and `status().keys`
 * reported `"fifo"` for a deployment that had declared `bogus` - a status field stating a value nobody declared.
 * Same defect class the round-8 `vmu.paper.finalizer` fix closed (paper.js:118-131 refuses by name there).
 * `refuse` is INJECTED: this stays the one place that owns the vocabulary (ORDER_MODES) while the throwing mechanism
 * stays the face's. `undefined`/`null`/`''` mean "not declared" -> the declared code default (zero mechanism).
 */
export function strictOrderMode(raw, refuse) {
  if (raw === undefined || raw === null || raw === '') return 'fifo'
  const v = String(raw)
  if (ORDER_MODES.indexOf(v) !== -1) return v
  throw refuse('VMU_INVALID_ARGUMENT',
    'vmu.meetings.orderMode=' + JSON.stringify(raw) + ' is outside the declared domain ' + ORDER_MODES.join('|'),
    'declare one of ' + ORDER_MODES.join('|') + ' - an undecidable speaker order must not be silently replaced by the default (removing the key yields the code default fifo)')
}

/** B④: the FOUR floor modes that survive the R8 merge (docs/08 §25.14 B-4). */
export const FLOW_MODES = Object.freeze(['open', 'hands', 'round_robin', 'call_on'])

/** The two names the R8 ruling MERGED: each maps to the mode that replaced it (used for a NAMED refusal, not an alias). */
export const FLOW_MERGED = Object.freeze({ single: 'hands', directed: 'call_on' })

/** Which order rule a floor mode installs; `null` = NO queue at all (the `open` floor). */
export const FLOW_ORDER = Object.freeze({ open: null, hands: 'fifo', round_robin: 'round-robin', call_on: 'chair' })

/** A deterministic, dependency-free fingerprint (djb2 hex) — the seed/rank primitive of `random` (no `Math.random`). */
export function orderSeedOf(text) {
  let h = 5381
  const s = String(text === null || text === undefined ? '' : text)
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

/**
 * The `random` order: sort by the member's own `fingerprint(seed|member)`. STABLE under insertion/removal (a member's
 * rank does not move when somebody else joins), deterministic (same seed + same members ⇒ same order), and the exact
 * order is what the caller reports — nothing here reads a clock or a random source.
 */
export function randomOrderOf(list, seed) {
  const rank = (id) => parseInt(orderSeedOf(String(seed) + '|' + String(id)), 16)
  return (Array.isArray(list) ? list.slice() : []).sort((a, b) => (rank(a) - rank(b)) || (a < b ? -1 : 1))
}

/**
 * `createOrderControls({ requireMeeting, clock, limits, declared, deny, audit, pushReceipt })` ⇒
 * `{ flow, overrideOrder, effective, orderFor, floorOf, queueGate, view, ORDER_KEY }`.
 *
 * Injected seams (all owned by the meeting face):
 *   · `requireMeeting(id)`          — resolves the record (and fails closed on a lapsed meeting);
 *   · `clock()`                     — the instant normaliser (the only time source);
 *   · `limits()`                    — a GETTER over the live settings (`orderMode` is read from the face's config
 *                                     object, which is built ONCE at construction). ★ ROUND 17: the previous wording
 *                                     claimed "read LIVE, so a hot change is honoured" - MEASURED FALSE
 *                                     (D:\_tmp\v17\repro-orderMode.mjs: a fifo instance whose settings were hot-changed
 *                                     to `round-robin` still produced the fifo order `r-2,r-1`, while a fresh instance
 *                                     declaring round-robin produced `r-1,r-2`). The refusal for an out-of-domain value
 *                                     now happens at that same construction-time read (`strictOrderMode`).;
 *   · `declared(key)`               — is the key DECLARED by this deployment? (the capability rail; a code default is not a declaration);
 *   · `deny(code,msg,hint,keys)`    — the face's named refusal (it attaches the evaluated scope);
 *   · `audit(row)`                  — the face's audit log for the append-only row;
 *   · `pushReceipt(row)`            — the face's bounded receipt ledger.
 *
 * VOCABULARY NOTE (the same seam `kernel/meetingleave.js` uses): everything returned here reports `keys` — the
 * settings keys the rule actually read — and the FACADE maps that into its own `enforced[]`/`enforcedScope` fields.
 * This module never spells that vocabulary itself, so it carries no second implementation of the receipt envelope.
 */
export function createOrderControls({ requireMeeting, clock = () => 0, limits = () => ({}), declared = () => false,
  deny, audit = () => {}, pushReceipt = () => {} } = {}) {
  const ORDER_KEY = 'vmu.meetings.orderMode'
  const keys = () => [ORDER_KEY]

  /** THE single decision point: which order rule binds THIS meeting right now, and where it came from. */
  const effective = (m) => {
    const o = m && m.orderOverride ? m.orderOverride : null
    if (o) return { source: o.source, mode: o.mode, order: o.order, queueOpen: o.order !== null,
      by: o.by === undefined ? null : o.by, why: o.why === undefined ? null : o.why, at: o.at === undefined ? null : o.at, seed: o.seed || null }
    const setting = String((limits() || {}).orderMode || 'fifo')
    // A setting-level `random` still needs a DERIVED seed (per meeting, deterministic) so the receipt can carry it.
    const seed = setting === 'random' ? orderSeedOf(String(m.id) + '|setting|random') : null
    return { source: 'setting', mode: setting, order: setting, queueOpen: true, by: null, why: null, at: null, seed }
  }

  /** The seed of a `random` order: the override's frozen seed, or (setting-level `random`) a per-meeting one. */
  const seedOf = (m, eff) => eff.seed || orderSeedOf([String(m.id), 'setting', String(eff.order)].join('|'))

  /** Order `list` under the effective rule — ALWAYS a fresh array (a read never reorders the stored queue). */
  const orderFor = (m, list) => {
    const eff = effective(m)
    const base = Array.isArray(list) ? list.slice() : []
    if (!eff.queueOpen) return []
    if (eff.order === 'round-robin') {
      const used = (id) => ((m.speechUsed && m.speechUsed.get(id)) || { count: 0 }).count
      return base.sort((a, b) => (used(a) - used(b)) || (a < b ? -1 : 1))
    }
    if (eff.order === 'random') return randomOrderOf(base, seedOf(m, eff))
    return base                        // fifo / chair: the arrival (hand-raise) order stands; `call_on` decides WHO arrives
  }

  /** The floor as DISCLOSED on a `speak()` receipt: what is in force, and how many wait. */
  const floorOf = (m) => {
    const eff = effective(m)
    return { mode: eff.mode, source: eff.source, order: eff.order, queueOpen: eff.queueOpen,
      waiting: Array.isArray(m.queue) ? m.queue.length : 0 }
  }

  /**
   * THE `call_on` GATE — the observable difference of the designated-speaker floor. Only the chair puts a member in
   * the queue; with no chair declared NOBODY may (an authority that was never declared is not invented).
   */
  const queueGate = (m, actor) => {
    const eff = effective(m)
    if (!eff.queueOpen || eff.order !== 'chair') return { ok: true }
    if (m.chair === null || m.chair === undefined) {
      return { ok: false, code: 'VMU_ENGINE_UNAVAILABLE',
        message: 'the floor mode is call_on but no chair is declared for this meeting: no one may designate who speaks next',
        hint: 'open the meeting with { chair: "<member id>" } — the kernel never invents an authority (08 §25.14 A)' }
    }
    if (String(m.chair) !== String(actor)) {
      return { ok: false, code: 'VMU_NOT_PERMITTED',
        message: 'the floor mode is call_on: only the CHAIR may put a speaker in the queue: ' + String(actor),
        hint: 'the declared chair of this meeting is ' + String(m.chair) }
    }
    return { ok: true }
  }

  /** THE authority rail shared by `flow` and `overrideOrder`: named actor → the chair of THIS meeting → declaration. */
  const rails = (m, by) => {
    const who = String(by === null || by === undefined ? '' : by).trim()
    if (!who) throw deny('VMU_INVALID_ARGUMENT', 'changing the order/floor needs { by } (who is deciding)',
      'an override without an actor cannot be audited', keys())
    if (m.chair === null || m.chair === undefined) {
      throw deny('VMU_ENGINE_UNAVAILABLE', 'no chair is declared for this meeting: no one may decide the order of speakers',
        'open the meeting with { chair: "<member id>" } — the kernel never invents an authority (08 §25.14 A/B-3)', keys())
    }
    if (String(m.chair) !== who) {
      throw deny('VMU_NOT_PERMITTED', 'only the CHAIR may decide the order of speakers: ' + who,
        'the declared chair of this meeting is ' + String(m.chair), keys())
    }
    if (!declared(ORDER_KEY)) {
      throw deny('VMU_ENGINE_UNAVAILABLE', ORDER_KEY + ' is not declared by this deployment: the order/floor override is not enabled',
        'declare ' + ORDER_KEY + ' (settings/pack) to enable overrides — nothing declared means the capability does not exist, and the default is NO override', keys())
    }
    return who
  }

  /** The ONE reason rail (both acts are procedural changes to other members' standing). */
  const reasonOf = (why, what) => {
    const reason = String(why === null || why === undefined ? '' : why).trim()
    if (!reason) throw deny('VMU_REASON_REQUIRED', what + ' needs { why }',
      'an unexplained change of who speaks when is exactly the silence the audit row exists for', keys())
    return reason
  }

  /** Commit the override: the slot, the append-only minutes row, the audit event and the receipt — all four. */
  const commit = (m, rec, receipt) => {
    m.orderOverride = rec
    if (m.minutes && Array.isArray(m.minutes.entries)) m.minutes.entries.push({ at: rec.at, kind: rec.source === 'flow' ? 'floor-flow' : 'order-override',
      by: rec.by, why: rec.why, mode: rec.mode, order: rec.order, previous: rec.previous, seed: rec.seed })
    audit({ type: rec.source === 'flow' ? 'meetings/floor-flow' : 'meetings/order-override', at: rec.at, meeting: String(m.id),
      mode: rec.mode, order: rec.order, previous: rec.previous, by: rec.by, why: rec.why, seed: rec.seed, keys: keys() })
    pushReceipt(receipt)
  }

  /**
   * B④ `flow({ meeting, mode, by, why })` — set the FLOOR: `open` / `hands` / `round_robin` / `call_on`. An unknown
   * mode (and a MERGED name) is `VMU_INVALID_ARGUMENT`; the merged name's hint names the mode that replaced it.
   */
  const flow = ({ meeting, mode = null, by = null, why = '', at = null } = {}) => {
    const m = requireMeeting(meeting)
    const want = String(mode === null || mode === undefined ? '' : mode).trim()
    const merged = Object.prototype.hasOwnProperty.call(FLOW_MERGED, want) ? FLOW_MERGED[want] : null
    if (merged) {
      throw deny('VMU_INVALID_ARGUMENT', 'flow mode "' + want + '" does not exist: it was MERGED into "' + merged + '" (R8 ruling)',
        want === 'single'
          ? 'both were "one at a time, by hand-raise order", differing only in the name — pass mode:"hands"'
          : 'both were "the chair designates who speaks next", differing only in the name — pass mode:"call_on"', keys())
    }
    if (!FLOW_MODES.includes(want)) {
      throw deny('VMU_INVALID_ARGUMENT', 'flow needs { mode } ∈ ' + FLOW_MODES.join('|'), 'got ' + JSON.stringify(mode), keys())
    }
    const who = rails(m, by)
    const reason = reasonOf(why, 'changing the floor mode')
    const now = at === null ? clock() : at
    const previous = effective(m).mode
    const order = FLOW_ORDER[want]
    const seed = orderSeedOf([String(m.id), 'flow', want, who, reason, String(now)].join('|'))
    const rec = { source: 'flow', flow: want, mode: want, order, by: who, why: reason, at: now, previous, seed }
    const receipt = { at: now, action: 'flow', meeting: String(m.id), mode: want, order, queueOpen: order !== null, previous,
      by: who, why: reason, seed, orderNow: orderFor(m, m.queue || []), keys: keys() }
    commit(m, rec, receipt)
    return { ok: true, meeting: String(m.id), mode: want, order, queueOpen: order !== null, previous, by: who, why: reason,
      seed, orderNow: receipt.orderNow, receipt, keys: keys() }
  }

  /**
   * B③ `overrideOrder({ meeting, by, why, mode })` — override the ORDER for this meeting: `fifo` / `round-robin` /
   * `chair` / `random`. The override WINS over `vmu.meetings.orderMode` (the setting is not consulted again until
   * the override is replaced), and `enforced[]` names the key that was read to authorise it.
   */
  const overrideOrder = ({ meeting, by = null, why = '', mode = null, at = null } = {}) => {
    const m = requireMeeting(meeting)
    const want = String(mode === null || mode === undefined ? '' : mode).trim()
    if (!ORDER_MODES.includes(want)) {
      throw deny('VMU_INVALID_ARGUMENT', 'overrideOrder needs { mode } ∈ ' + ORDER_MODES.join('|'), 'got ' + JSON.stringify(mode), keys())
    }
    const who = rails(m, by)
    const reason = reasonOf(why, 'overriding the speaking order')
    const now = at === null ? clock() : at
    const before = effective(m)
    const seed = orderSeedOf([String(m.id), 'override', want, who, reason, String(now)].join('|'))
    const rec = { source: 'override', mode: want, order: want, by: who, why: reason, at: now, previous: before.mode, seed }
    const orderNow = orderFor(m, m.queue || [])
    const receipt = { at: now, action: 'override-order', meeting: String(m.id), mode: want, previous: before.mode,
      previousSource: before.source, by: who, why: reason, seed, order: orderNow, keys: keys() }
    commit(m, rec, receipt)
    return { ok: true, meeting: String(m.id), mode: want, previous: before.mode, previousSource: before.source,
      by: who, why: reason, seed, order: orderNow, receipt, keys: keys() }
  }

  /** READ-ONLY: the effective rule + the order it produces for the current queue (nothing is written). */
  const view = (m) => Object.assign({ ok: true, meeting: m && m.id !== undefined ? String(m.id) : null },
    effective(m), { order: orderFor(m, (m && m.queue) || []), keys: keys() })

  return { flow, overrideOrder, effective, orderFor, floorOf, queueGate, view, ORDER_KEY }
}

export default createMeetingMarker
