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
 * ROUND 11 FIX (the defect reader-b's e2e found): mirror one vote into the injected `ballot` seam and RETURN what
 * actually happened — `{ mirrored, reason, code? }`. The call site used to be `try { … } catch {}`, so a refused or
 * throwing seam left `vote()` reporting success while nothing reached a box. A seam that refuses is not an error of
 * the MEETING (the vote is the face's own record, so `ok` stays true), but it must never be INVISIBLE: it is named
 * here and counted (`counters.ballotMirrorFailed` / `ballotMirrorSkipped`).
 */
export function mirrorVote({ ballot = null, counters = {}, meeting = null, motionId = null, member = null, value = 1 } = {}) {
  if (!ballot || typeof ballot.cast !== 'function') {
    counters.ballotMirrorSkipped = (counters.ballotMirrorSkipped || 0) + 1
    return { mirrored: false, reason: 'no-seam' }
  }
  try {
    const r = ballot.cast({ meeting, motion: motionId, member, value })
    if (r && r.ok === false) {
      counters.ballotMirrorFailed = (counters.ballotMirrorFailed || 0) + 1
      return { mirrored: false, reason: 'refused', code: r.code || null }
    }
    return { mirrored: true, reason: motionId ? 'cast' : 'cast-without-motion', code: null }
  } catch (e) {
    counters.ballotMirrorFailed = (counters.ballotMirrorFailed || 0) + 1
    return { mirrored: false, reason: 'threw', code: (e && e.code) || null, message: String((e && e.message) || e) }
  }
}

export default createMeetingMarker
