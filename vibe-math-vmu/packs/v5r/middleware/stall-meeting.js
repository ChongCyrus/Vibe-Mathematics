/**
 * v5r's STALL ⇒ CONVENE middleware (Round 10, task-76; Lead ruling (a)).
 *
 * WHAT IT REPRODUCES. v5r's `stallAutoMeetingMs: 360000` (vibe-math-v5r.js:1083) meant: after 360 s without
 * progress the institute AUTOMATICALLY CONVENES a meeting. The threshold is not invented - it is v5r's own value,
 * and v5r's neighbouring entry is `activityTimeoutMs: 120000` (:1082), i.e. exactly 3 x the idle threshold. This
 * module therefore computes `3 × vmu.control.idleAfterMs` instead of hard-coding 360000: a deployment that
 * declares a different idle threshold gets a proportionally different stall threshold, and the number stays
 * traceable to v5r.
 *
 * WHY IT IS A MODULE AND NOT AN INLINE HANDLER. vmu's control face deliberately cannot convene anything
 * (`kernel/control.js`'s `idleState()` always reports `recessed:false`; R1: the framework recommends, it does not
 * drive). The sanctioned shape is: the KERNEL reports idleness through the registered `control/idle` hook (edge
 * triggered, once per episode), and THE PACK decides what the institution does about it. Deciding is not enough -
 * it has to ACT - so this module goes through `kernel/loader.js`, which attaches `api` (including the
 * capability-gated `api.services.get(name)` seam). An inline `{ on, handler }` manifest entry never sees `api`,
 * which is exactly why `kernel/pack.js` routes module-shaped entries through the loader.
 *
 * CAPABILITIES. `trigger-workflow` unlocks the service seam (without it the seam refuses BY NAME, never silently);
 * `record` documents that the decision is reported back to the bus receipt.
 */

/** v5r :1082 / :1083, as a RATIO so no number is invented here. */
export const STALL_RATIO = 3

/**
 * The pure decision: should this idle edge convene a meeting? No kernel, no clock, no I/O.
 * `afterMs` is the declared idle threshold; `elapsedMs` is how long the institute has been idle.
 */
export function stallDecision(input) {
  // ★ A DEFAULT PARAMETER DOES NOT CATCH `null`. `stallDecision({ elapsedMs = 0, afterMs = 0 } = {})` looked safe
  // and threw a TypeError on `stallDecision(null)`, because destructuring applies its default only for undefined.
  // The contract says a refusal is named, so a non-object input is reported as "idleness is not declared" rather
  // than crashing - the decision is "do not convene", which is the safe answer here, and the reason says why.
  const { elapsedMs = 0, afterMs = 0 } = (input && typeof input === 'object') ? input : {}
  const idleAfterMs = Number(afterMs || 0)
  const elapsed = Number(elapsedMs || 0)
  const stallAfterMs = STALL_RATIO * idleAfterMs
  if (input !== undefined && input !== null && typeof input !== 'object') return { convene: false, stallAfterMs: 0, reason: 'the idle measurement must be an object ({ elapsedMs, afterMs }); got ' + typeof input }
  if (!(idleAfterMs > 0)) return { convene: false, stallAfterMs: 0, reason: 'idleness is not declared (vmu.control.idleAfterMs = 0)' }
  if (!(elapsed >= stallAfterMs)) return { convene: false, stallAfterMs, reason: 'idle for ' + elapsed + 'ms, short of the stall threshold ' + stallAfterMs + 'ms' }
  return { convene: true, stallAfterMs, reason: 'idle for ' + elapsed + 'ms >= stall threshold ' + stallAfterMs + 'ms (v5r stallAutoMeetingMs)' }
}

/** The M2 module object `kernel/pack.js` hands to `kernel/loader.js`. */
export const V5R_STALL_MEETING = Object.freeze({
  meta: Object.freeze({ id: 'v5r.stall-meeting', apiVersion: 1 }),
  capabilities: Object.freeze(['trigger-workflow', 'record']),
  hooks: Object.freeze({
    'control/idle': async (flat = {}) => {
      // ★ LIVE RUN 9, finding F: the wait deadline must be observable without an unrelated call touching the meeting.
      // The idle edge is the natural clock for it (nothing else is happening), and the sweep is the KERNEL's pass — this
      // module does not decide anything, it only asks the face to settle its own meetings on time. A face without
      // `sweepDue` (an older assembly) is reported, never silently skipped.
      const meetingsFace = flat.api && flat.api.services && typeof flat.api.services.get === 'function'
        ? flat.api.services.get('vmu.meetings') : null
      const swept = (meetingsFace && typeof meetingsFace.sweepDue === 'function')
        ? meetingsFace.sweepDue({ at: flat.at === undefined ? null : flat.at })
        : { swept: 0, transitions: [], note: 'this assembly publishes no meetings.sweepDue, so due waits were NOT swept' }
      const decision = stallDecision(flat)
      if (!decision.convene) return { ok: true, convened: false, reason: decision.reason, swept: swept.swept, sweptTransitions: swept.transitions }
      // The seam is capability-gated: with no `trigger-workflow` this throws a NAMED refusal, and an unpublished
      // name throws VMU_NO_SUCH_OBJECT listing what IS published - never a silent null.
      const meetings = flat.api.services.get('vmu.meetings')
      // ★★★ LIVE RUN 15 (the institute's own report, item ① 「重要例外」): this path opened a meeting with
      // `{chair:null, roster:0}` and the transcript therefore showed a convene that no chair performed — the one place
      // where 「会议只能由院士召开」 did not hold. The kernel rail cannot catch it (a chairless convene installs no
      // authority, so there is nothing to check), and that is WHY the rule has to be completed here, in the pack that
      // knows the institution's seats. Two outcomes, both named:
      //   · a chair IS seated ⇒ the meeting is convened UNDER that chair's authority and `convenedBy` records that the
      //     trigger was automatic ('v5r.stall-meeting'), so "the chair did this" and "this happened on the chair's
      //     behalf" never look identical;
      //   · NO chair is seated ⇒ this is a LEADERLESS institute, a configuration v5r supports and whose whole point is
      //     that an idle institute must still be able to meet. Refusing outright would freeze it; convening silently is
      //     what run 15 caught. So it convenes WITH THE EXCEPTION NAMED: `chair:null` + `convenedBy:'v5r.stall-meeting'`
      //     + a reading that says no chair authority exists, i.e. this meeting cannot be closed or advanced by a chair.
      let chairId = null
      try {
        const members = flat.api.services.get('vmu.members')
        const roster = members && typeof members.roster === 'function' ? members.roster() : []
        const chairRow = (Array.isArray(roster) ? roster : []).find((r) => r && r.slot === 'chair' && r.id)
        chairId = chairRow ? String(chairRow.id) : null
      } catch { chairId = null }
      const chairlessNote = chairId === null
        ? 'NO CHAIR IS SEATED (leaderless institute): this meeting was convened automatically and has NO chair authority — it cannot be closed or advanced by a chair, and any reader that needs to know who convened it must read convenedBy'
        : null
      // ★ THE REASON GOES WITH THE MEETING, not only into this handler's return value. It used to be computed here and
      // returned to the bus while the meeting itself recorded nothing, so `summary`/`status` could show a "stall" meeting
      // with no statement of what stalled — measured on a live host, and the reader had no way to tell why it was opened.
      const opened = await meetings.open({ type: 'ordinary', kind: 'stall', chair: chairId, actor: chairId, convenedBy: 'v5r.stall-meeting', at: flat.at === undefined ? null : flat.at, reason: decision.reason })
      return { ok: true, convened: true, swept: swept.swept, sweptTransitions: swept.transitions, stallAfterMs: decision.stallAfterMs,
        chair: chairId, convenedBy: 'v5r.stall-meeting', chairless: chairId === null, chairlessNote,
        convenedByMeans: chairId === null
          ? 'the idle threshold triggered this convene with NO chair seated; the meeting records convenedBy so it is never mistaken for a chair\'s own act, and it carries no chair authority'
          : 'the idle threshold triggered this convene; the meeting is seated under the institute\'s chair, and convenedBy says the trigger was automatic rather than the chair calling for it',
        meetingId: opened && (opened.meetingId || opened.id) ? (opened.meetingId || opened.id) : null, reason: decision.reason }
    },
  }),
})
