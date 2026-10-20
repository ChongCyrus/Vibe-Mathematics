/**
 * packs/v5r/middleware/paper-dispatch.js — PHASE 7 round 9: THE REPLY → PAPER-SUBSYSTEM WIRING.
 *
 * WHY THIS FILE EXISTS (the gap the previous round named): the three paper prompts (`paper-write` / `paper-review` /
 * `paper-final`) tell a member to answer with a JSON object (`paper_part` / `paper_review` / `paper_final`), and the
 * paper subsystem (`../paper.js`) can record each of those — but NOTHING connected the two. A prompt that promises a
 * contract no code consumes is exactly the "says it can, cannot do it" defect this repo bans. This module closes it on
 * the ONE hook where a parsed reply is still actionable: `turn/reply-parsed`.
 *
 * THE FOUR RULES (each is asserted in tests/vmu-v5r-tools.test.mjs):
 *   ① ONLY THE CURRENT PHASE'S FIELD IS DISPATCHED. A reply carrying `paper_part` in an `normal` turn is NOT recorded;
 *      it is recorded as a NAMED refusal (`phase-mismatch`) so the mistake is visible instead of silently dropped.
 *   ② A MALFORMED reply (the field present but the subsystem refuses it — missing title/content, non-boolean
 *      `deliverable`, a final decision by a non-chair) is recorded as a NAMED failure with the subsystem's own code.
 *   ③ IDEMPOTENT per (turn, phase): the same turn's reply dispatched twice writes ONE record — the second call answers
 *      `duplicate:true` and touches nothing.
 *   ④ VISIBLE: every dispatch outcome (ok / skipped / refused) lands in `paperDispatchStatus()`, so `status()` can
 *      report "the last paper reply was refused because …" without reading the log.
 *
 * WHERE THE FACES COME FROM. The loader hands a module `{ hooks, log, kernel, setting }` at load time, and a hook's
 * flattened payload carries `api` (capability-gated services). The paper subsystem needs the records face (the paper's
 * storage), the members face (the chair check) and the latex face (the PDF). This module RESOLVES those defensively and
 * refuses BY NAME when a required face is absent — it never invents one.
 */
import { createPaperSubsystem } from '../paper.js'

/** The phase → reply-field mapping. ONE table, so the prompt contract and the dispatcher cannot drift. */
export const PAPER_REPLY_FIELDS = Object.freeze([
  { phase: 'paper-write', field: 'paper_part', method: 'recordPart', target: (r) => r && r.target },
  { phase: 'paper-review', field: 'paper_review', method: 'recordReview', target: (r) => r && r.target },
  { phase: 'paper-final', field: 'paper_final', method: 'recordFinal', target: (r) => r && r.target },
])

const FIELD_NAMES = Object.freeze(PAPER_REPLY_FIELDS.map((row) => row.field))

/** What the last dispatch did — the status-readable half of rule ④. */
const last = { at: null, phase: null, field: null, ok: null, code: null, reason: null, member: null, turn: null }
/** Rule ③: (turn|phase) → the outcome of its first dispatch. */
const seen = new Map()

export function paperDispatchStatus() {
  return { last: Object.assign({}, last), seen: seen.size, fields: FIELD_NAMES.slice() }
}

/** Test seam: forget the idempotency ledger (a test must be able to re-run the same turn). */
export function resetPaperDispatch() {
  for (const k of [...seen.keys()]) seen.delete(k)
  Object.assign(last, { at: null, phase: null, field: null, ok: null, code: null, reason: null, member: null, turn: null })
  return { ok: true, cleared: true }
}

const note = (outcome) => {
  Object.assign(last, { at: null, ...outcome })
  return outcome
}

/** Resolve the kernel-ish object the paper subsystem needs, from whatever the hook payload really carries. */
function resolveFaces(flat) {
  const kernel = (flat && (flat.kernel || (flat.api && flat.api.kernel))) || null
  if (kernel && kernel.records) return kernel
  const services = flat && flat.api && flat.api.services
  if (services && typeof services.get === 'function') {
    const records = services.get('vmu.records')
    if (records) {
      const members = services.get('vmu.members') || null
      const latex = services.get('vmu.latex') || null
      return { records, members, latex, settingsSnapshot: () => { try { const s = services.get('vmu.settings'); return s && typeof s.snapshot === 'function' ? s.snapshot() : {} } catch { return {} } } }
    }
  }
  return null
}

/**
 * The dispatch body, pure over its inputs so the tests can drive it WITHOUT a bus: `{ phase, reply, turn, member }`.
 * Returns a NAMED outcome in every branch (ok / skipped / duplicate / refused).
 */
export async function dispatchPaperReply({ phase, reply, turn = null, member = null, flat = null } = {}) {
  const fieldsInReply = FIELD_NAMES.filter((f) => reply && typeof reply === 'object' && reply[f] !== undefined)
  if (fieldsInReply.length === 0) return note({ ok: true, skipped: true, reason: 'no paper field in the reply', phase: phase || null, turn, member, field: null, code: null })
  const row = PAPER_REPLY_FIELDS.filter((r) => r.phase === phase)[0] || null
  if (!row) {
    // ① a paper field OUTSIDE its phase: visible, never recorded
    return note({ ok: false, skipped: true, code: 'VMU_PACK_V5R_CORE_PAPER_STATE', phase: phase || null, field: fieldsInReply[0], turn, member,
      reason: 'the reply carries ' + fieldsInReply.join('/') + ' but the phase is "' + String(phase) + '": only paper-write/paper-review/paper-final replies are dispatched' })
  }
  if (fieldsInReply.length > 1) {
    return note({ ok: false, skipped: true, code: 'VMU_PACK_V5R_CORE_PAPER_STATE', phase, field: fieldsInReply.join(','), turn, member,
      reason: 'the reply carries more than one paper field (' + fieldsInReply.join(', ') + '): a turn answers exactly one paper stage' })
  }
  const field = row.field
  const body = reply[field]
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return note({ ok: false, skipped: true, code: 'VMU_INVALID_ARGUMENT', phase, field, turn, member,
      reason: field + ' must be an object, got ' + (body === null ? 'null' : Array.isArray(body) ? 'array' : typeof body) })
  }
  const key = String(turn === null || turn === undefined ? '(no-turn)' : turn) + '|' + String(phase)
  if (seen.has(key)) {
    // ③ the SAME turn dispatched twice: nothing is written the second time
    return note({ ok: true, duplicate: true, skipped: true, phase, field, turn, member, code: null, reason: 'turn ' + String(turn) + ' was already dispatched for ' + phase })
  }
  const faces = resolveFaces(flat || {})
  if (!faces) {
    return note({ ok: false, code: 'VMU_ENGINE_UNAVAILABLE', phase, field, turn, member,
      reason: 'no records face is reachable from this hook, so the paper subsystem cannot be built' })
  }
  const paper = createPaperSubsystem({ kernel: faces })
  const target = faceTargetOf(body) || null
  if (!target) {
    return note({ ok: false, code: 'VMU_INVALID_ARGUMENT', phase, field, turn, member,
      reason: field + ' does not name its paper target (pass target:"…"; this face never guesses which paper)' })
  }
  try {
    let out = null
    if (row.method === 'recordPart') {
      out = paper.recordPart({ target, member, ...body })
    } else if (row.method === 'recordReview') {
      out = paper.recordReview({ target, member, ...body })
    } else {
      out = await paper.recordFinal({ target, member, ...body })
    }
    seen.set(key, { ok: true, at: null })
    return note({ ok: true, phase, field, turn, member, code: null, reason: null, result: out, target })
  } catch (e) {
    // ② a malformed reply: named, with the subsystem's own code — and NOT marked as dispatched (a corrected retry on
    // the same turn must be possible)
    return note({ ok: false, code: (e && e.code) || 'VMU_INVALID_ARGUMENT', phase, field, turn, member, target,
      reason: String((e && e.message) || e) })
  }
}

const faceTargetOf = (body) => (body && typeof body.target === 'string' && body.target.trim() !== '' ? body.target.trim() : null)

/**
 * ★ PHASE 7 round 11 — REGISTER THE DISPATCH STATUS WITH THE KERNEL, AT LOAD TIME.
 *
 * The kernel exposes `setPaperDispatchStatus(fn)` and its `status()` shows a `paperDispatch` segment ONLY while a
 * source is registered (zero mechanism). The loader calls a module's `default({hooks, log, kernel, setting})` when it
 * loads a MODULE-SHAPED entry (`kernel/loader.js:182-184`), and that call receives the kernel — which makes it the one
 * place where a pack can both register and stay inside its own folder.
 *
 * ★ WHAT THIS CANNOT DO, MEASURED (named, not hidden): `kernel/loader.js` has NO dispose contract, and pack unload
 * only runs its ACTION undos (bus-entry removal); no hook fires on unload (`kernel/bus.js` declares `pack/loading` and
 * `pack/loaded` only). So a pack-loaded module cannot clear the kernel's status source by itself — `unload` therefore
 * needs ONE kernel line: clearing `paperDispatchStatusSource` in `notePackUnloaded` (or in the unload path). Until that
 * line lands, `releasePaperDispatch(kernel)` is the documented manual clear, and the round report names the gap.
 */
export function installPaperDispatch({ kernel } = {}) {
  if (!kernel || typeof kernel.setPaperDispatchStatus !== 'function') {
    return { ok: false, code: 'VMU_ENGINE_UNAVAILABLE', registered: false, reason: 'this kernel has no setPaperDispatchStatus (older assembly)' }
  }
  const r = kernel.setPaperDispatchStatus(paperDispatchStatus)
  return { ok: r && r.ok === true, registered: !!(r && r.ok === true), status: r }
}

/** The manual counterpart (what the one-line kernel fix will call on unload): remove the segment entirely. */
export function releasePaperDispatch({ kernel } = {}) {
  if (!kernel || typeof kernel.setPaperDispatchStatus !== 'function') return { ok: false, code: 'VMU_ENGINE_UNAVAILABLE', cleared: false }
  const r = kernel.setPaperDispatchStatus(null)
  return { ok: r && r.ok === true, cleared: !!(r && r.source === false) }
}

/**
 * The M2 module object `kernel/pack.js` hands to `kernel/loader.js`.
 * `default` is the LOAD-TIME factory: the loader passes it the kernel, so registration happens exactly when the pack is
 * applied — and the hooks it returns are the ones the bus runs.
 */
export const V5R_PAPER_DISPATCH = Object.freeze({
  meta: Object.freeze({ id: 'v5r.paper-dispatch', apiVersion: 1 }),
  capabilities: Object.freeze(['record']),
  hooks: Object.freeze({
    'turn/reply-parsed': async (flat = {}) => {
      const reply = (flat && flat.fields) || (flat && flat.reply) || null
      return await dispatchPaperReply({
        phase: flat && flat.phase,
        reply,
        turn: flat && flat.turn,
        member: flat && flat.member,
        flat,
      })
    },
  }),
  /** the load-time factory the loader calls with `{hooks, log, kernel, setting}` */
  default: installPaperDispatch,
})
