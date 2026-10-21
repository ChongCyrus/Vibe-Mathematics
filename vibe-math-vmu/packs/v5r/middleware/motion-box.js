/**
 * v5r's MOTION ⇒ BOX policy (Round 12/13, task-97; Lead ruling: opening a box is POLICY, the kernel only offers the
 * seam).
 *
 * WHAT IT DOES. When a motion is moved inside a meeting (`meeting/motion`), this pack
 *   ① opens ONE ballot box for that motion, and
 *   ② lazily binds the kernel's `boxFor` seam (`vmu.meetings`'s `bindBox()`) to a lookup that answers "which box is this
 *      motion's?" - so a vote cast in the meeting is MIRRORED into that motion's box instead of being reported as
 *      `VMU_MEETING_BOX_UNWIRED`.
 *
 * WHY `meeting/motion` AND NOT `motion/propose`: those are two different objects. `motion/propose` is the
 * INSTITUTE-WIDE governance motion (`mo-1`); the meeting's own motion is `mo1` and is the id the vote mirror asks
 * `boxFor` about. Subscribing to the wrong one produced a policy whose boxes could never match (measured in
 * round 12: `boxFor({motion:'mo1'})` vs a map keyed by `mo-1`).
 *
 * WHERE THE POLICY LIVES: the kernel CALLS `boxFor` and holds no option set and no mapping. Every judgement here -
 * which box, which vocabulary, who may bind - is this institution's.
 *
 * ★ PROVENANCE (nothing invented): v5r's motion face was SECONDING-based (`motion`/`second`, carried once the
 * threshold is met) - it never put a motion to an option vote. So there is NO v5r value for an option set, and this
 * file does not pretend there is. `MOTION_BOX_OPTIONS` is THIS PACK'S POLICY, and it deliberately speaks the
 * meeting's own vocabulary (`value` 1/0 = for/against) so the mirror's cast lands in the box without a translation
 * table nobody could verify.
 *
 * ★ LAZY BINDING, ON PURPOSE (measured): the loader hands a module factory `{ hooks, log, kernel, setting }` -
 * there is NO `api` at load time, so a module CANNOT call a service while loading. The binding therefore happens on
 * the first `meeting/motion`, where `api.services` is available; `bindBox` is idempotent and self-reporting
 * (`boxBinding()`), so it is checked before every bind.
 *
 * ★ R13 PENDING (named, not faked): the hook payload carries `{ at, meeting, motion, kind, emergency }` - the motion
 * TEXT is not among them yet (v5r-reader-a is adding a passthrough). The question therefore names the motion by id,
 * deliberately NOT `undefined`, which is what a premature `flat.text` would produce.
 */

/** THIS PACK'S POLICY - not a v5r constant (v5r seconded motions instead of voting on them). */
export const MOTION_BOX_OPTIONS = Object.freeze(['1', '0'])

/** The box question until the motion text reaches this hook (then: the motion's own text). */
export function motionBoxQuestion({ motion, text } = {}) {
  const t = typeof text === 'string' && text.trim() ? text.trim() : null
  return t || 'Motion ' + String(motion) + '?'
}

/** meeting|motion → boxId. In-memory policy state: a restart re-opens on the next motion (durability of the binding
 *  belongs to the assembly's record, not to this module - named, not pretended). */
const boxByMotion = new Map()
const keyOf = (meeting, motion) => String(meeting) + '|' + String(motion)

/**
 * The lookup the kernel calls at vote time: `boxFor({meeting, motion, member, value})` → `{boxId, value, by}` | null.
 * The vocabulary is forwarded as-is (the meeting speaks 1/0 and the box's options are that same pair) - see the
 * provenance note above. Returning `null` for an unmapped motion is the NAMED `VMU_MEETING_BOX_UNMAPPED` case, not
 * a failure.
 */
export function boxForMeetingMotion({ meeting, motion, value, member } = {}) {
  const boxId = boxByMotion.get(keyOf(meeting, motion))
  if (!boxId) return null
  return { boxId, value, by: member || null }
}

/** The M2 module object `kernel/pack.js` hands to `kernel/loader.js` (module shape: it needs `api.services`). */
export const V5R_MOTION_BOX = Object.freeze({
  meta: Object.freeze({ id: 'v5r.motion-box', apiVersion: 1 }),
  capabilities: Object.freeze(['trigger-workflow', 'record']),
  hooks: Object.freeze({
    'meeting/motion': async (flat = {}) => {
      // ★ A NAMED REFUSAL, NOT A TypeError. The loader can call this hook with whatever context it is handed, and
      // reading `flat.api.services` off a context that has no `api` threw "Cannot read properties of undefined" -
      // a crash where the contract says a refusal must be named and say what is missing.
      const services = flat && flat.api && flat.api.services
      if (!services || typeof services.get !== 'function') {
        return { ok: false, reason: 'the motion box needs the pack api (flat.api.services); this loader handed it none', code: 'VMU_ENGINE_UNAVAILABLE', motion: flat && flat.motion }
      }
      const meetings = services.get('vmu.meetings')
      const ballotbox = services.get('vmu.ballotbox')
      const opened = ballotbox.open({ question: motionBoxQuestion(flat), options: MOTION_BOX_OPTIONS.slice() })
      if (!opened || opened.ok !== true) {
        return { ok: false, reason: 'the box was refused by name', code: (opened && opened.code) || null, motion: flat.motion }
      }
      boxByMotion.set(keyOf(flat.meeting, flat.motion), opened.boxId)
      const boundBefore = meetings.boxBinding().bound === true
      if (!boundBefore) meetings.bindBox(boxForMeetingMotion)
      return { ok: true, meeting: flat.meeting, motion: flat.motion, boxId: opened.boxId,
        boundBefore, boundNow: meetings.boxBinding().bound === true }
    },
  }),
})
