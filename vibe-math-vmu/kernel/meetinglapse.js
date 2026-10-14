// vmu kernel meetinglapse — F28's bounded fallback and the declared extension step, as PURE RULES.
//
// WHY THIS FILE EXISTS (docs/02 §L174): `kernel/meetings.js` crossed the 1200-line decision line by GROWTH, not
// because its text is a contract. The split is along the rule/state seam, which is the only cut that keeps both
// halves honest:
//   · THIS module owns the RULES — when a declared bound makes a fallback due, what the fallback record looks
//     like, when a revocation is legal, and what an extension step resolves to. Every function is pure: same
//     input, same output, no clock, no store, no bus.
//   · `kernel/meetings.js` (and `kernel/ballotbox.js`) own the STATE — the live records, the minutes, the
//     counters, the broadcasts. They call these rules and keep naming the result in the kernel's D3 vocabulary.
//
// NOTHING SETTLES BY ITSELF. `lapseDueOf` only ANSWERS; the caller decides to act, and acting early is expressed
// as a refusal built by the caller. That is why a bounded fallback here is bounded (`limitMs`), NAMED (`name`),
// EXPLAINED (`why`), TIMESTAMPED (`at`) and REVOCABLE (`revocable`).
//
// VOCABULARY NOTE: the returned objects carry `keys` — the settings keys the rule actually read — and the
// STATEFUL face attaches its own evaluated-scope receipt fields to them. This module therefore never spells that
// vocabulary itself: it stays a rules module, and the face stays the single place where the receipt shape lives.

/** Public-interface version of this module's surfaces (docs/03 §7). */
export const apiVersion = 1

/** The fallback's name for a MEETING (v5r never named its hard-limit abandon; F28 requires a name). */
export const MEETING_LAPSE_NAME = 'meeting-lapse'
/** The fallback's name for an option BOARD. */
export const BALLOT_LAPSE_NAME = 'ballot-lapse'

/**
 * Is the declared bound exceeded, and what would the fallback decide? PURE.
 * `keys` lists the settings keys the answer read (the caller passes its own bound key; a constructor-declared
 * bound passes its own label so an operator can still see WHERE the bound came from).
 */
export function lapseDueOf({ limitMs, wallStartMs, now, lapse = null, name = MEETING_LAPSE_NAME, boundKey = null } = {}) {
  const keys = boundKey ? [boundKey] : []
  const elapsed = now - wallStartMs
  if (lapse && !lapse.revokedAt) {
    return { due: false, name, alreadyLapsed: true, elapsedMs: elapsed, limitMs, keys }
  }
  if (!(elapsed > limitMs)) {
    return { due: false, name, elapsedMs: elapsed, limitMs, keys }
  }
  return {
    due: true, name, at: now, revocable: true,
    why: 'the declared bound was exceeded with the ' + (name === BALLOT_LAPSE_NAME ? 'board' : 'meeting') + ' still open: ' + elapsed + ' / ' + limitMs + ' ms',
    elapsedMs: elapsed, limitMs, keys,
  }
}

/** Build the fallback RECORD from a `lapseDueOf` decision. PURE (the caller stores it). */
export function makeLapseRecord(decision, { by = null } = {}) {
  const d = decision || {}
  return {
    name: d.name || MEETING_LAPSE_NAME,
    why: d.why || '',
    at: d.at,
    revocable: true,
    elapsedMs: d.elapsedMs,
    limitMs: d.limitMs,
    by: by === null || by === undefined ? null : String(by),
    revokedAt: 0, revokedBy: null, revokeReason: null,
  }
}

/**
 * Decide a REVOCATION. PURE: it returns the validated next record (or a named refusal the caller throws) and
 * never mutates its input. A reason is mandatory — an unexplained revocation is unauditable — and a record that
 * is not `revocable` is final. Revoking twice is idempotent (`deduped`).
 */
export function revokeLapseRecord(record, { at, by = null, reason = '' } = {}) {
  if (!record) {
    return { ok: false, code: 'VMU_STATE', message: 'there is no bounded fallback to revoke', hint: 'settle it first', keys: [] }
  }
  if (record.revocable !== true) {
    return { ok: false, code: 'VMU_NOT_PERMITTED', message: 'this fallback was declared NOT revocable', hint: 'a non-revocable fallback is final', keys: [] }
  }
  if (!String(reason === undefined || reason === null ? '' : reason).trim()) {
    return { ok: false, code: 'VMU_REASON_REQUIRED', message: 'revoking a bounded fallback needs a reason',
      hint: 'say why it may continue: an unexplained revocation is unauditable', keys: [] }
  }
  if (record.revokedAt) return { ok: true, deduped: true, record: Object.assign({}, record), keys: [] }
  return {
    ok: true, deduped: false, keys: [],
    record: Object.assign({}, record, {
      revokedAt: at, revokedBy: by === null || by === undefined ? null : String(by), revokeReason: String(reason),
    }),
  }
}

/**
 * Resolve one extension step against the DECLARED steps and ceilings (GAP-MTG-05's `extend`). PURE:
 *   · an explicit `requestedMs` is used as given; otherwise the declared step (`declaredStepMs`) and then the
 *     declared default (`defaultStepMs`) are read IN THAT ORDER, and whichever was read is reported in `keys`;
 *   · no declared step at all ⇒ a named refusal — the rule never invents a duration;
 *   · `maxExtensions` (per member) and `maxMs` (per extension) are ceilings, and a breach carries the
 *     current/limit pair so the caller's refusal can be as specific as `capIn` needs.
 */
export function extensionPlan({ requestedMs = null, declaredStepMs = 0, defaultStepMs = 0, extensions = 0, maxExtensions = 0, maxMs = 0 } = {}) {
  const keys = []
  if (maxExtensions > 0) {
    keys.push('vmu.meetings.speechExtendMax')
    if (extensions >= maxExtensions) {
      return { ok: false, code: 'VMU_MEETING_SPEECH_TIMEBOUND', label: 'speech extensions', value: extensions, limit: maxExtensions,
        capKey: 'vmu.meetings.speechExtendMax',
        message: 'speech extensions exceeds vmu.meetings.speechExtendMax: ' + extensions + ' > ' + maxExtensions,
        hint: '现值=' + extensions + ', 上限=' + maxExtensions + ' (vmu.meetings.speechExtendMax)', keys }
    }
  }
  let step = 0
  if (requestedMs === null || requestedMs === undefined) {
    if (declaredStepMs > 0) { step = declaredStepMs; keys.push('vmu.meetings.speechExtendMs') }
    else if (defaultStepMs > 0) { step = defaultStepMs; keys.push('vmu.meetings.speechDefaultMs') }
  } else {
    step = requestedMs
  }
  if (!(step > 0)) {
    return { ok: false, code: 'VMU_INVALID_ARGUMENT', keys,
      message: 'no extension step is declared: set vmu.meetings.speechExtendMs (or pass { ms })',
      hint: 'extend() needs a positive duration — it will not invent one' }
  }
  if (maxMs > 0) {
    keys.push('vmu.meetings.speechMaxMs')
    if (step > maxMs) {
      return { ok: false, code: 'VMU_MEETING_SPEECH_TIMEBOUND', label: 'extension (ms)', value: step, limit: maxMs,
        capKey: 'vmu.meetings.speechMaxMs',
        message: 'extension (ms) exceeds vmu.meetings.speechMaxMs: ' + step + ' > ' + maxMs,
        hint: '现值=' + step + ', 上限=' + maxMs + ' (vmu.meetings.speechMaxMs)', keys }
    }
  }
  return { ok: true, ms: step, keys }
}

/**
 * THE FACADE the stateful face wires in: the four methods (`lapseDue`/`lapse`/`revokeLapse`/`extend`) built from
 * the pure rules above plus the face's own seams. `kernel/meetings.js` owns the STATE and injects it: `requireMeeting`
 * (which already fails closed on a lapsed meeting), the live `limits()` (a getter, so a hot settings change is
 * honoured), `counters`, `say`, `deny`, `capIn` and the numeric coercion. This keeps the 1200-line budget while
 * leaving ONE place where the fallback's behaviour is written down.
 */
export function createMeetingControls({
  requireMeeting, clock, limits, counters = {}, say = () => {}, deny, capIn,
  numbers = (v) => Number(v),
} = {}) {
  const limitOf = () => Number(limits().hardLimitMs)

  const lapseDue = (a) => {
    const args = a || {}
    const m = requireMeeting(args.meeting, { readOnly: true })
    const limitMs = limitOf()
    const d = lapseDueOf({ limitMs, wallStartMs: m.wallStartMs,
      now: args.at === undefined || args.at === null ? clock() : args.at, lapse: m.lapse, boundKey: 'vmu.meetings.hardLimitMs' })
    const out = { due: d.due, name: d.name, meeting: m.id, elapsedMs: d.elapsedMs, limitMs, keys: d.keys.slice() }
    if (d.alreadyLapsed) out.alreadyLapsed = true
    if (d.due) { out.at = d.at; out.revocable = d.revocable; out.why = d.why }
    return out
  }

  const lapse = (a) => {
    const args = a || {}
    // readOnly: the fallback's OWN methods must be able to inspect a lapsed meeting (dedupe, revocation).
    const m = requireMeeting(args.meeting, { readOnly: true })
    if (m.lapse && !m.lapse.revokedAt) return { ok: true, deduped: true, meeting: m.id, lapse: Object.assign({}, m.lapse) }
    const decision = lapseDue({ meeting: m.id, at: args.at })
    if (!decision.due) {
      throw deny('VMU_STATE', 'the bounded fallback is NOT due yet: ' + decision.elapsedMs + ' / ' + decision.limitMs + ' ms (nothing settles silently)',
        'keep the meeting open, or close() it explicitly — the fallback only fires past vmu.meetings.hardLimitMs', decision.keys)
    }
    const rec = makeLapseRecord(decision, { by: args.by })
    m.lapse = rec
    m.state = 'lapsed'
    m.minutes.entries.push({ at: rec.at, kind: 'lapse', name: rec.name, why: rec.why, revocable: true, limitMs: rec.limitMs, elapsedMs: rec.elapsedMs })
    counters.lapses = (counters.lapses || 0) + 1
    say({ type: 'meetings/lapse', at: rec.at, meeting: m.id, name: rec.name, revocable: true, limitMs: rec.limitMs, elapsedMs: rec.elapsedMs })
    return { ok: true, meeting: m.id, lapse: Object.assign({}, rec), settlement: 'lapsed-by-declared-bound',
      keys: decision.keys.slice() }
  }

  const revokeLapse = (a) => {
    const args = a || {}
    const m = requireMeeting(args.meeting, { readOnly: true })
    const at = args.at === undefined || args.at === null ? clock() : args.at
    const verdict = revokeLapseRecord(m.lapse, { at, by: args.by, reason: args.reason })
    if (verdict.ok !== true) throw deny(verdict.code, verdict.message, verdict.hint, verdict.keys || [])
    if (verdict.deduped) return { ok: true, deduped: true, meeting: m.id, lapse: Object.assign({}, m.lapse) }
    m.lapse = verdict.record
    m.state = 'open'
    m.minutes.entries.push({ at: m.lapse.revokedAt, kind: 'lapse-revoked', name: m.lapse.name, by: m.lapse.revokedBy, why: m.lapse.revokeReason })
    counters.lapseRevocations = (counters.lapseRevocations || 0) + 1
    say({ type: 'meetings/lapse-revoked', at: m.lapse.revokedAt, meeting: m.id, name: m.lapse.name, by: m.lapse.revokedBy })
    return { ok: true, meeting: m.id, lapse: Object.assign({}, m.lapse), keys: ['vmu.meetings.hardLimitMs'] }
  }

  const extend = (a) => {
    const args = a || {}
    const k = limits()
    const m = requireMeeting(args.meeting)
    const member = String(args.member === undefined || args.member === null ? '' : args.member)
    if (!member) throw deny('VMU_INVALID_ARGUMENT', 'extend needs { member }', 'name whose speech is extended', [])
    const used = m.speechUsed.get(member) || { count: 0, extensions: 0 }
    const plan = extensionPlan({ requestedMs: args.ms === undefined || args.ms === null ? null : numbers(args.ms),
      declaredStepMs: k.speechExtendMs, defaultStepMs: k.speechDefaultMs, extensions: used.extensions,
      maxExtensions: k.speechExtendMax, maxMs: k.speechMaxMs })
    if (plan.ok !== true) {
      // A ceiling breach keeps writing the refusal into the minutes (capIn throws); anything else is a plain deny.
      if (plan.capKey) capIn(m, plan.code, plan.label, plan.value, plan.limit, plan.capKey, plan.keys)
      throw deny(plan.code, plan.message, plan.hint, plan.keys)
    }
    used.extensions += 1
    m.speechUsed.set(member, used)
    m.minutes.entries.push({ at: clock(), kind: 'extend', by: args.by === undefined || args.by === null ? null : String(args.by), member, ms: plan.ms })
    counters.extensions = (counters.extensions || 0) + 1
    return { ok: true, meeting: m.id, member, ms: plan.ms, extensions: used.extensions, max: k.speechExtendMax,
      keys: plan.keys.slice() }
  }

  return { lapseDue, lapse, revokeLapse, extend }
}

export default { lapseDueOf, makeLapseRecord, revokeLapseRecord, extensionPlan, createMeetingControls }
