// vmu kernel · meetings — the meetings service: convening, the agenda, the floor and the minutes, as distinct from the
// meeting/ballot primitives in meeting.js. Spec: docs/08 (primitives, meeting and ballot) and docs/03 (the interface
// contract) for the service name a pack may require.
import { SETTING_DEFS } from '../settings/schema.js'
import { CODE as RESUME_CODE } from './resume.js'
// The leave/recess request family was extracted at the 1200-line boundary (docs/02 §L174): `kernel/meetingleave.js`
// owns the RULES, this file owns the state (records, minutes, receipts) and the receipt vocabulary.
import { createLeaveControls } from './meetingleave.js'
import { createMeetingDomains } from './meetingdomain.js'
// F28's bounded-fallback RULES and the extension-step resolution were extracted to keep this file inside the
// decided 1200-line budget (docs/02 §L174) — see `kernel/meetinglapse.js`: it holds the pure rules, this file
// holds the state (live records, minutes, counters, broadcasts) and the D3 receipt vocabulary.
import { MEETING_LAPSE_NAME, createMeetingControls } from './meetinglapse.js'
import { createMeetingMarker, mirrorVote, budgetVerdictOf, createBoxBinding, createOrderControls, strictOrderMode, meetingKeysSnapshot as keysSnapshot } from './meetingmarker.js'
// vmu kernel · meetings — the POLICY + GUARD layer that finally READS the `vmu.meetings.*` knobs.
//
// WHY: 08-academic-... (docs/08-primitives-meeting-ballot-workflow.md) declares **47 `vmu.meetings.*` keys**
// (appeal/budget/chair/committee/attendance/speech/interrupt/recess/minutes/discipline/confidentiality/
// verbatim/quorum/wake…) and, until this slice, **no runtime read a single one** ⇒ a reader believes the
// knob works. Same standard as kernel/mathtools.js (the accepted precedent ✗✓):
//   · every WIRED key changes an observable result;
//   · every receipt carries `enforced[]` listing ONLY the keys actually evaluated for that call
//     ("read the key" and "the key had an effect" must be distinguishable);
//   · nothing is read-but-inert: a declared key that is not wired is NAMED in `status().plannedKeys`
//     with its reason;
//   · named refusals counted BY CODE; caps report 现值/上限; truncation/pruning is counted;
//   · the injected clock is the only time source; read paths never mutate; zero mechanism never crashes.
//
// ONLY REFERENCES, NEVER REDEFINES (docs/08 keeps the primitives; docs/03-§8 keeps the codes):
//   the ballot counting, the task board, minutes storage, and governance belong to 08/07; this layer is the
//   POLICY SKIN over a meeting the caller owns, with every rail expressed with an ALREADY-REGISTERED code
//   (this file invents none): VMU_MEETING_* · VMU_MINUTES_* · VMU_DISCIPLINE_QUOTA · VMU_TRUST_APPEAL_WINDOW ·
//   VMU_QUOTA_EXCEEDED / VMU_QUOTA_SOFT_EXCEEDED · VMU_RESOURCE_BUDGET · VMU_NOT_PERMITTED · VMU_STATE ·
//   VMU_REASON_REQUIRED · VMU_NOT_MEMBER · VMU_NO_OPEN_MEETING · VMU_NO_SUCH_OBJECT · VMU_INVALID_ARGUMENT ·
//   VMU_ENGINE_UNAVAILABLE

export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** The 47 `vmu.meetings.*` keys this layer wires (each one changes an observable result — see the test). */
import { WIRED_KEYS, UNWIRED_REASONS, reasonFor, DEFAULTS } from './meetings-defaults.js'
export { WIRED_KEYS, UNWIRED_REASONS }

const RING = 200

export function createMeetings({ clock = () => 0, log = null, settings = {}, bus = null, members = null, ballot = null, wake = null, durable = null, boxFor = null } = {}) {
  if (typeof clock !== 'function') {
    // No key has been consulted at construction time: the list is explicitly EMPTY (never undefined).
    throw Object.assign(refuse('VMU_INVALID_ARGUMENT', 'createMeetings needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock'), { enforced: [], evaluated: [] })
  }
  const sget = (key) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? DEFAULTS[key] : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return DEFAULTS[key]
  }
  /** B③ (Round 14): is the key *DECLARED* by this deployment? A code DEFAULT is NOT a declaration (zero mechanism). */
  const isDeclared = (key) => (settings && typeof settings.get === 'function') ? settings.get(key) !== undefined
    : !!(settings && Object.prototype.hasOwnProperty.call(settings, key) && settings[key] !== undefined)
  const say = (event) => { if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* advisory */ } } }
  // ROUND 4 / task-25: the bus takes a STRING NAME first (forwarding the event OBJECT made every emission throw and be
  // swallowed). ROUND 12 / task-97: the name-first form is what the hook audits SEE and what a pack can SUBSCRIBE to,
  // so this helper accepts BOTH - `emit('meeting/motion', {...})` (preferred) and legacy `emit({ type: '…' })`; the
  // remaining legacy call sites are part of the round-13 sweep (docs/11 §6.1's producer rules), not a silent exemption.
  const emit = (ev, payload) => {
    if (!bus || typeof bus.emit !== 'function') return
    const nameFirst = typeof ev === 'string' && ev ? ev : null
    const name = nameFirst !== null ? nameFirst : (ev && typeof ev.type === 'string' ? ev.type : null)
    const event = nameFirst !== null ? Object.assign({ type: nameFirst }, payload || {}) : ev
    if (name === null) return say({ type: 'bus/emit-failed', at: clock(), name: null, code: 'VMU_BUS_NAME_REQUIRED', message: 'a bus event needs a string name (got an object without .type)' })
    try { bus.emit(name, event) } catch (e) { say({ type: 'bus/emit-failed', at: clock(), name, code: (e && e.code) || 'VMU_BUS_EMIT_FAILED', message: String((e && e.message) || e) }) }
  }
  const n = (v, def = 0) => (Number.isFinite(v) ? v : def)
  const arr = (v) => (Array.isArray(v) ? v.slice() : [])

  // ROUND 31 (task-149 C③): the ELEVEN strict `vmu.meetings.*` domains live in
  // `kernel/meetingdomain.js` (read side REFUSES BY NAME instead of clamping); `D.values` supplies the keys
  // whose whole entry moved out below (tier/attendanceMode/quorumLossPolicy/minutesDetail/appealScope/
  // leaveApprover/confidentialityDefault/confidentialityQuotePolicy/wakeFailurePolicy).
  const D = createMeetingDomains({ sget, refuse })
  const K = {
    ...D.values,
    typeCatalog: arr(sget('vmu.meetings.typeCatalog')).map(String),
    // GAP-MTG-02 (D7/GAPS 22): the meeting TIER, and whether light procedures are allowed at all. Both are read
    // LIVE (a hot change is honoured on the next call) and together they feed ONE derived predicate below.
    // `tier` = the meeting's level; `allowLight=false` = this institution does not run light procedures, so a
    // `light` tier becomes a named configuration conflict instead of a silently weakened meeting.
    allowLight: sget('vmu.meetings.allowLight') !== false,
    // WHO MAY VOTE (A1 round 10): the DECLARED voter seats. Empty = the framework imposes no seat rule (zero
    // mechanism); a deployment/pack declares the seats its institution treats as voters. ONE criterion, TWO
    // consumers: the `vote()` gate below and `eligibleVoterIds()` (which the per-object ballot face asks for the
    // eligible list). The comparison is on the ROSTER's slot, never a role hard-coded in this file.
    eligibleSeats: arr(sget('vmu.meetings.eligibleSeats')).map(String),
    liveCap: n(sget('vmu.meetings.liveCap')),
    quorumMin: n(sget('vmu.meetings.quorumMin')), quorumRatio: n(sget('vmu.meetings.quorumRatio')),
    // ROUND 203: the quorum ceiling (declared default 3; 0 = no ceiling). `undefined` means unset -> default 3,
    // an explicit 0 is a VALUE -> no ceiling. Same unset-vs-value distinction as the other readers wired here.
    quorumCap: (() => {
      const raw = sget('vmu.meetings.quorumCap')
      return (raw === undefined || raw === null || raw === '') ? 3 : n(raw)
    })(),
    quorumRecountMs: n(sget('vmu.meetings.quorumRecountMs')),
    unansweredInDenominator: sget('vmu.meetings.unansweredInDenominator') === true,
    emergencyQuorumRatio: n(sget('vmu.meetings.emergencyQuorumRatio')), emergencyKinds: arr(sget('vmu.meetings.emergencyKinds')).map(String),
    chairNeutral: sget('vmu.meetings.chairNeutral') === true, chairTransferAudit: sget('vmu.meetings.chairTransferAudit') === true,
    committeeMax: n(sget('vmu.meetings.committeeMax')), committeeReportRequired: sget('vmu.meetings.committeeReportRequired') === true,
    budgetTurns: n(sget('vmu.meetings.budgetTurns')), budgetTokens: n(sget('vmu.meetings.budgetTokens')),
    budgetWallMs: n(sget('vmu.meetings.budgetWallMs')), budgetOnExceed: D.values.budgetOnExceed,
    // ROUND 200/201: the HARD wall-clock backstop, clamped [300000, 7200000] with default 1800000. Its contract says
    // there is no unbounded case, so 0 does NOT mean unlimited here (unlike `budgetWallMs`, the soft one). `undefined`
    // means unset (use the default); an explicit 0 is a VALUE and therefore clamps to the 300000 floor. Writing this as
    // `n(...) || 1800000` would conflate the two, because 0 is falsy - my own assertion caught exactly that.
    hardLimitMs: (() => {
      const raw = sget('vmu.meetings.hardLimitMs')
      const v = (raw === undefined || raw === null || raw === '') ? 1800000 : n(raw)
      return Math.min(7200000, Math.max(300000, v))
    })(),
    speechDefaultMs: n(sget('vmu.meetings.speechDefaultMs')), speechMaxMs: n(sget('vmu.meetings.speechMaxMs')),
    speechExtendMs: n(sget('vmu.meetings.speechExtendMs')), speechExtendMax: n(sget('vmu.meetings.speechExtendMax')),
    speechQuotaPerMember: n(sget('vmu.meetings.speechQuotaPerMember')),
    interruptAllow: sget('vmu.meetings.interruptAllow') !== false, interruptQuota: n(sget('vmu.meetings.interruptQuota')),
    // ROUND 17: NOT `oneOf` - an out-of-domain value is refused BY NAME instead of being silently replaced by `fifo`
    // (measured: `bogus` used to read back as `fifo` everywhere, including in `status().keys`). See `strictOrderMode`.
    orderMode: strictOrderMode(sget('vmu.meetings.orderMode'), refuse),
    lateAfterMs: n(sget('vmu.meetings.lateAfterMs')), leaveEarlyPolicy: D.values.leaveEarlyPolicy,
    materialsRequired: sget('vmu.meetings.materialsRequired') === true,
    minutesIncludeRefused: sget('vmu.meetings.minutesIncludeRefused') !== false,
    minutesActionsRequired: sget('vmu.meetings.minutesActionsRequired') === true,
    minutesRetentionMs: n(sget('vmu.meetings.minutesRetentionMs')), confirmPreviousMinutes: sget('vmu.meetings.confirmPreviousMinutes') === true,
    appealDeadlineMs: n(sget('vmu.meetings.appealDeadlineMs')), appealReasonRequired: sget('vmu.meetings.appealReasonRequired') !== false,
    disciplineWarnMax: n(sget('vmu.meetings.disciplineWarnMax')), disciplineMuteMs: n(sget('vmu.meetings.disciplineMuteMs')),
    disciplineExpelAllowed: sget('vmu.meetings.disciplineExpelAllowed') !== false,
    recessMaxMs: n(sget('vmu.meetings.recessMaxMs')), recessResumeRequiresMotion: sget('vmu.meetings.recessResumeRequiresMotion') === true,
    // B② (Round 10): WHO decides a leave/recess request — a DECLARED authority (chair, office as the declared
    // fallback). Read here; the decision point below names the key in `enforced[]`.
    verbatimEnabled: sget('vmu.meetings.verbatimEnabled') !== false, verbatimRetentionMs: n(sget('vmu.meetings.verbatimRetentionMs')),
    // ROUND 198: the retry policy's bound, clamped [0,10] as the key's own contract says.
    wakeRetries: Math.min(10, Math.max(0, n(sget('vmu.meetings.wakeRetries')))),
    // ROUND 199: the motion (verdict round) ceiling. `|| 3` is explicit: an unset key reads as 0 here, and the
    // contract is int >= 1 with default 3.
    verdictMaxRounds: (() => {
      const raw = sget('vmu.meetings.verdictMaxRounds')
      const v = (raw === undefined || raw === null || raw === '') ? 3 : n(raw)
      return Math.max(1, v)
    })(),
  }

  const counters = { opened: 0, closed: 0, speeches: 0, motions: 0, votes: 0, appeals: 0, warnings: 0, mutes: 0, refused: 0, prunedMinutes: 0, prunedVerbatim: 0, skippedWakes: 0, softBudget: 0 }
  const refusals = new Map()
  const receipts = []
  const receiptDropped = { n: 0 }
  const live = new Map()          // meetingId -> meeting
  const archive = []              // closed meetings (minutes retention pruning happens here)

  /**
   * Named refusal that ALWAYS carries the audit trail of the keys evaluated so far (round-12 gate
   * `audit-enforced-consistency`): a refusal with `enforced === undefined` makes "the key was read" and
   * "the key had an effect" indistinguishable exactly when a request is rejected. An explicitly EMPTY array
   * is fine — `undefined`/`null` is not. Keys enter the list at the moment they are CONSULTED (see `mark`).
   */
  const deny = (code, message, hint, enforced) => {
    counters.refused += 1
    refusals.set(code, (refusals.get(code) || 0) + 1)
    const keys = Array.isArray(enforced) ? enforced.slice() : []
    const scope = ENFORCED_SCOPE
    say({ type: 'meetings/refused', at: clock(), code, message, enforced: keys, enforcedScope: scope })
    const e = refuse(code, message, hint)
    e.enforced = keys
    e.enforcedScope = scope            // 'evaluated-so-far' — part of the refusal itself (D3)
    e.evaluated = keys.slice()
    return e
  }
  /** Evaluation point = enumeration point: call this the moment a key is consulted. */
  const mark = (list, key) => { if (!list.includes(key)) list.push(key); return list }
  /**
   * EVALUATION SCOPE (D3): `enforced` is BY DESIGN "the keys evaluated SO FAR on this call" — a refusal that
   * happens early lists less than the operation would consult if it ran on. `enforcedScope` states that out
   * loud on every receipt AND every refusal, so nobody reads a "so far" list as the operation's whole key set.
   */
  const ENFORCED_SCOPE = 'evaluated-so-far'
  const cap = (code, label, value, limit, key, evaluated) => {
    const keys = Array.isArray(evaluated) ? evaluated.slice() : []
    mark(keys, key)
    throw deny(code, label + ' exceeds ' + key + ': ' + value + ' > ' + limit, '现值=' + value + ', 上限=' + limit + ' (' + key + ')', keys)
  }
  /** A meeting-scoped refusal: recorded in the meeting's `minutes.refused` list FIRST (that is what makes
   *  `vmu.meetings.minutesIncludeRefused` observable) and then thrown as a named refusal. */
  const denyIn = (m, code, message, hint, enforced) => {
    if (m && m.minutes && Array.isArray(m.minutes.refused)) {
      m.minutes.refused.push({ at: clock(), code, message, enforced: arr(enforced) })
    }
    return deny(code, message, hint, enforced)
  }
  const capIn = (m, code, label, value, limit, key, evaluated) => {
    const hint = '现值=' + value + ', 上限=' + limit + ' (' + key + ')'
    const keys = Array.isArray(evaluated) ? evaluated.slice() : []
    mark(keys, key)
    if (m && m.minutes && Array.isArray(m.minutes.refused)) m.minutes.refused.push({ at: clock(), code, message: label + ' exceeds ' + key + ': ' + value + ' > ' + limit, enforced: keys.slice() })
    throw deny(code, label + ' exceeds ' + key + ': ' + value + ' > ' + limit, hint, keys)
  }
  const meetingOf = (id) => live.get(String(id))
  /**
   * `opts.readOnly` opts a caller into the READ surface (and into the fallback's own methods). Everything else
   * FAILS CLOSED once a meeting is lapsed: F28's fallback only means something if it actually stops the meeting,
   * and ONE guard here keeps that from having to be repeated (and forgotten) on every acting rail.
   */
  const requireMeeting = (id, opts = {}) => {
    const m = meetingOf(id)
    if (!m) {
      if (live.size === 0) throw deny('VMU_NO_OPEN_MEETING', 'no meeting is open (id: ' + String(id) + ')', 'open() a meeting first — this layer refuses rather than inventing one', [])
      throw deny('VMU_NO_SUCH_OBJECT', 'no such meeting: ' + String(id), 'open: ' + [...live.keys()].sort().join(', '), [])
    }
    if (opts.readOnly !== true && m.state === 'lapsed') {
      throw deny('VMU_STATE', 'the meeting is LAPSED by its declared bound (' + MEETING_LAPSE_NAME + '): ' + String(opts.what || 'this act') + ' is refused',
        'revokeLapse({ meeting, by, reason }) restores it (a reason is required); the record itself stays readable via minutes()/verbatim()/status()/quorum()', [])
    }
    return m
  }
  const isMember = (id) => {
    if (typeof id !== 'string' || !id) return false
    if (!members) return true
    try {
      if (typeof members.has === 'function') return members.has(id) === true
      if (typeof members.roster === 'function') return (members.roster() || []).some((x) => (x && (x.id === id || x === id)))
    } catch (e) { return true }
    return true
  }
  /** The roster row (id + slot) of a member, or null when this face has no roster to ask (same seam as `isMember`). */
  const seatRowOf = (id) => {
    if (!members || typeof members.roster !== 'function') return null
    try { return (members.roster() || []).filter((x) => x && String(x.id) === String(id))[0] || null } catch (e) { return null }
  }
  /**
   * ROUND 316: reading a MEETING RECORD (minutes, transcript) is not the act of speaking, so it is not gated by
   * membership the way the acting surface is. What gates it is the meeting's own confidentiality LEVEL: a meeting
   * opened at `restricted` (vmu.meetings.confidentialityDefault) may not be read anonymously once a roster seam is in
   * force. Without a roster seam nothing changes - mechanism follows the seam, as everywhere else in this face. The
   * level was already recorded at open() and already enforced by quote(); the two READ surfaces ignored it, which is
   * the same species of gap the A/B found in the acting surface.
   */
  const assertCanReadRecord = (m, what, by) => {
    if (m.confidentiality !== 'restricted' || !members) return
    if (!by) throw deny('VMU_MEETING_CONFIDENTIAL_DENIED', what + '() on a restricted meeting needs the acting member',
      'pass { by: "<member id>" } - the level is "' + m.confidentiality + '" (vmu.meetings.confidentialityDefault), and a restricted record is not an anonymous read', [])
    if (!isMember(String(by))) throw deny('VMU_NOT_MEMBER', 'the acting member is not on the roster: ' + String(by),
      'the roster seam rejected the actor for ' + what + '()', [])
  }
  /** The quorum computation (READ-ONLY): `attendanceMode` + `unansweredInDenominator` change the numbers. */
  const quorumOf = (m) => {
    const unanswered = m.roster.filter((r) => !m.present.has(r))
    const effective = K.unansweredInDenominator ? m.roster.length : m.present.size
    const needMin = K.quorumMin
    const needRatio = Math.ceil(K.quorumRatio * m.roster.length)
    // ROUND 203: `vmu.meetings.quorumCap` - the ceiling. The contract words it `min(cap, participants)`, so with a
    // cap in force a meeting can never require more than the people actually present; that is what stops a small
    // meeting from being permanently blocked. At 0 there is no cap and quorum CAN be lost.
    const needUncapped = Math.max(needMin, needRatio)
    const need = K.quorumCap > 0 ? Math.min(needUncapped, K.quorumCap, m.present.size) : needUncapped
    return {
      meeting: m.id, mode: K.attendanceMode, present: m.present.size, roster: m.roster.length,
      unanswered: unanswered.length, unansweredList: unanswered.slice().sort(),
      denominator: effective, denominatorPolicy: K.unansweredInDenominator ? 'all-roster (unanswered counted)' : 'present-only',
      required: need, met: m.present.size >= need, ratio: K.quorumRatio, min: needMin,
      emergencyRatio: K.emergencyQuorumRatio,
      // ★ G7 (real machine): "unanswered" used to mean "not in the PRESENT set", so after two votes it still listed a
      // member who had just voted (present stayed at 1) — a caller read that as "one person has not decided yet". The
      // present set now also records VOTERS (vote() adds the voter), and this policy field says so in words.
      unansweredPolicy: 'members who have neither attended nor voted',
      note: 'unanswered members are named, never passed over silently (08 卷 D3/L4 口径); voting counts as participation',
    }
  }

  /**
   * GAP-MTG-02 — THE tier PREDICATE (D7/GAPS 22, ported from the v5r line's S12).
   *
   * `light` = a LIGHT-PROCEDURE meeting: it may carry an agenda, rounds and ACTION ITEMS, but it may NOT produce
   * an entity conclusion. This is a DERIVED PREDICATE, not a phase: the tier is read live, so switching to
   * `formal` immediately allows the write — there is no stage machine and no timer anywhere in this rule.
   *
   * `truthWriteRefusal(what, enforced)` is the SINGLE decision point. It returns `null` when the write is
   * allowed and a NAMED refusal otherwise, and EVERY face that may write an entity conclusion calls it: the
   * `close()` rail, the resolution motion, and — through the injected `meetings` seam — `kernel/minutes.js`.
   */
  const tier = () => K.tier
  const isLight = () => K.tier === 'light'
  const truthWriteRefusal = (what, enforced = []) => {
    const base = Array.isArray(enforced) ? enforced.slice() : []
    if (isLight() && K.allowLight === false) {
      // A contradictory declaration gets its own name: "light is selected but light is not allowed".
      const e = mark(base, 'vmu.meetings.tier')
      mark(e, 'vmu.meetings.allowLight')
      return deny('VMU_MEETING_TIER_CONFLICT',
        'the tier is "light" while vmu.meetings.allowLight=false: this configuration can produce no conclusion at all (' + what + ')',
        'pick one: set vmu.meetings.tier="formal", or set vmu.meetings.allowLight=true (both are read live, so a hot change applies to the very next call)', e)
    }
    if (!isLight()) return null
    const e = mark(base, 'vmu.meetings.tier')
    return deny('VMU_MEETING_LIGHT_NO_TRUTH',
      'this is a LIGHT-procedure meeting (vmu.meetings.tier=light): ' + what + ' would be an entity conclusion, which a light meeting may not produce (D7/GAPS 22)',
      'record it as PROCESS instead (agenda, rounds and action items are always allowed), or upgrade the meeting with vmu.meetings.tier="formal" (read live, so the chair may do it at any time)', e)
  }

  /**
   * F28 — THE BOUNDED FALLBACK: bounded, NAMED and REVOCABLE.
   *
   * WHY THIS EXISTS. `vmu.meetings.hardLimitMs` was already consulted (speak/motion/vote throw
   * `VMU_RESOURCE_BUDGET` past it), but a REFUSAL is not a SETTLEMENT: the meeting stayed open forever. F28 asks
   * for the other half — a fallback that is bounded (`hardLimitMs`), NAMED, EXPLAINED, TIMESTAMPED and REVOCABLE.
   *
   * The RULES and the four methods live in `kernel/meetinglapse.js` (extracted to keep this file inside the
   * decided 1200-line budget, docs/02 §L174); this face injects its STATE seams and keeps the D3 vocabulary.
   */
  // F51 / task-89: the marker family (domain derivation, durable seam, read-back view, self-disclosure) lives in
  // `kernel/meetingmarker.js` — the boundary is written out there; this face only owns the objects and the calls.
  const marker = createMeetingMarker({ clock, live, archive, durable })
  const markState = marker.markState
  const openMeetings = marker.openMeetings
  const controls = createMeetingControls({
    requireMeeting, clock, limits: () => K, counters, say, deny, capIn, numbers: n, markState,
  })
  /**
   * The RECEIPT vocabulary stays in this face (the rules module reports only the `keys` it read): every control
   * receipt therefore leaves here with its evaluated scope attached, exactly like the face's other receipts.
   */
  const withScope = (r) => {
    const out = Object.assign({}, r)
    out.enforced = Array.isArray(r && r.keys) ? r.keys.slice() : []
    delete out.keys
    out.enforcedScope = ENFORCED_SCOPE
    return out
  }
  // B② (Round 10 split): the leave RULES live in `kernel/meetingleave.js`; this face injects its state seams, and
  // `withScope` below attaches the receipt vocabulary to whatever that module reports as `keys`.
  const leaveControls = createLeaveControls({ requireMeeting, isMember, clock, limits: () => K, deny, pushReceipt })
  const lapseDue = (a) => withScope(controls.lapseDue(a))
  const lapse = (a) => withScope(controls.lapse(a))
  const revokeLapse = (a) => withScope(controls.revokeLapse(a))
  const extend = (a) => withScope(controls.extend(a))

  // ── ROUND 12: THE `motion → box` BINDING (method, not manifest field) now lives in `kernel/meetingmarker.js` ──
  // `createBoxBinding` owns the state, the self-reported view and the named refusals; this face only CALLS it.
  const boxBinding = createBoxBinding({ clock, initial: boxFor, refuse })

  // R14 (task-108) B③/B④: RULES live in `kernel/meetingmarker.js` (this file is 1180+/1200, docs/02 §L174); the face
  // keeps the state (`m.orderOverride`), the audit rows and the receipt ledger. `isDeclared` is the capability rail.
  const orderControls = createOrderControls({ requireMeeting, clock, limits: () => K, declared: isDeclared, deny, audit: (ev) => say(withScope(ev)), pushReceipt: (row) => pushReceipt(withScope(row)) })

  // ★★★ THE MOTION'S TALLY MUST COUNT WHERE THE VOTES ACTUALLY ARE. Measured on a full live run: a motion stayed `seconded` with
  // `tally for:0` although the ballots had been cast, because this face counted `mo.votes` - and the votes live in the BALLOT BOX
  // the pack binds to the motion (the vote site's mirrorVote() writes them there; `mo.votes` fills only when a vote goes through
  // the meeting face itself). `ballot.status({boxId})` now exposes `byChoice`, so the tally asks the box first and falls back to
  // `mo.votes` only when no box is bound.
  // ★ ONE SOURCE OF TRUTH: the box holds the votes and this tally is a VIEW of it. Writing box counts back into `mo.votes` would
  // create two counts that can drift - the shape this repository keeps removing.
  const tallyOf = (meetingId, mo) => {
    const base = { for: [...mo.votes.values()].filter((v) => v === 1).length, against: [...mo.votes.values()].filter((v) => v === 0).length, abstain: mo.abstain.size }
    const boxFor = boxBinding.resolve()
    if (typeof boxFor !== 'function' || !ballot || typeof ballot.status !== 'function') return base
    const ans = boxFor({ meeting: meetingId, motion: mo.id })
    const boxId = ans && typeof ans === 'object' ? ans.boxId : ans
    if (!boxId) return base
    const st = ballot.status({ boxId })
    if (!st || st.ok !== true || !st.byChoice) return base
    const f = Number(st.byChoice['1'] || 0)
    const a = Number(st.byChoice['0'] || 0)
    if (f + a === 0) return base
    return { for: f, against: a, abstain: Number(st.abstain || 0), source: 'box', boxId: String(boxId) }
  }

  const api = {
    openMeetings,
    bindBox: boxBinding.bind,
    boxBinding: boxBinding.view,
    /** B④ THE FLOOR + B③ THE ORDER OVERRIDE: chair-only, `why` required, audited; the state is readable via `orderView`. */
    flow: (a = {}) => withScope(orderControls.flow(a)),
    overrideOrder: (a = {}) => withScope(orderControls.overrideOrder(a)),
    orderView: (a = {}) => withScope(orderControls.view(requireMeeting(a && a.meeting, { readOnly: true }))),
    apiVersion,
    WIRED_KEYS, UNWIRED_REASONS,

    /** Open a meeting. `type`/`size`/`materials` are checked against `typeCatalog` / `committeeMax` / `materialsRequired`. */
    // ★★ `reason` IS A PARAMETER BECAUSE A MEETING CONVENED BY A POLICY MUST SAY WHY. Measured on a live host:
    // `v5r.stall-meeting` computed "idle for 400000ms >= stall threshold 360000ms (v5r stallAutoMeetingMs)", returned it
    // in its decision, then called `open({ type, kind, at })` — and the reason was DROPPED, because this signature had
    // nowhere to put it. So overview / status / summary could not answer "why was this meeting opened" for exactly the
    // kind of meeting that most needs the answer. Optional, so every existing caller is unchanged.
    open({ id = null, type = 'ordinary', chair = null, roster = [], size = null, materials = null, kind = null, secretary = null, at = null, reason = null } = {}) {
      const enforced = []
      const ms = at === null ? clock() : at
      // GAP-MTG-02: a CONTRADICTORY tier declaration is refused BEFORE any state is created. Same predicate as
      // the close rail — one decision point, several call sites, so the two can never disagree.
      if (isLight() && K.allowLight === false) throw truthWriteRefusal('opening a meeting', enforced)
      if (K.typeCatalog.length) {
        mark(enforced, 'vmu.meetings.typeCatalog')
        if (!K.typeCatalog.includes(String(type))) {
          throw deny('VMU_NO_SUCH_OBJECT', 'meeting type "' + type + '" is not in vmu.meetings.typeCatalog',
            'allowed: ' + K.typeCatalog.join(', ') + ' (vmu.meetings.typeCatalog)', enforced)
        }
      }
      if (K.liveCap > 0) {
        mark(enforced, 'vmu.meetings.liveCap')
        if (live.size >= K.liveCap) cap('VMU_QUOTA_EXCEEDED', 'live meetings', live.size, K.liveCap, 'vmu.meetings.liveCap', enforced)
      }
      if (K.committeeMax > 0 && size !== null) {
        mark(enforced, 'vmu.meetings.committeeMax')
        if (n(size) > K.committeeMax) cap('VMU_QUOTA_EXCEEDED', 'committee size', n(size), K.committeeMax, 'vmu.meetings.committeeMax', enforced)
      }
      if (K.materialsRequired) {
        mark(enforced, 'vmu.meetings.materialsRequired')
        if (!materials) throw deny('VMU_STATE', 'vmu.meetings.materialsRequired=true: a meeting cannot open without materials', 'pass { materials: <pointer> } — the pointer belongs to 07/22 and is only referenced here', enforced)
      }
      // A1 round 10 — AN EXPLICIT id IS HONOURED, and a COLLISION IS REFUSED BY NAME. The vmu meeting face's
      // secretary bridge passes the primitive id in, and this used to ignore it: the tool believed it had
      // aligned two records while the service minted its own id (measured: primitive pm9 vs service m3).
      // The auto id stays the default, and the counter still advances on an explicit open so the two can
      // never mint the same name later without the guard below firing.
      const wanted = (typeof id === 'string' && id.trim() !== '') ? id.trim() : null
      const mid = wanted || ('m' + (counters.opened + 1))
      if (live.has(mid)) throw deny('VMU_CONFLICT', 'a live meeting already uses id ' + String(mid), 'open: ' + [...live.keys()].sort().join(', '), enforced)
      const m = {
        id: mid, type: String(type), kind: kind === null ? null : String(kind), chair: chair === null ? null : String(chair), secretary: secretary === null ? null : String(secretary),
        roster: arr(roster).map(String), present: new Set(chair === null ? [] : [String(chair)]),
        openedAt: ms, state: 'open', turns: 0, tokens: 0, wallStartMs: ms,
        queue: [], speechUsed: new Map(), interrupts: new Map(), warnings: new Map(), mutes: new Map(),
        recess: null, previousConfirmed: false, minutes: { entries: [], refused: [], actions: [] },
        transcript: [], confidentiality: K.confidentialityDefault, motions: [], appeals: [], closedAt: null,
        committeeReport: null, dissent: [],
        // ★ WHY this meeting was convened (null when the caller did not say). Until now this was computed by the
        // caller and discarded here, so a reader of summary()/meetingView() could see a "stall" meeting with no
        // statement of what stalled.
        reason: reason === null || reason === undefined ? null : String(reason),
      }
      live.set(mid, m)
      markState(m, 'open')
      counters.opened += 1
      const receipt = { at: ms, action: 'open', meeting: mid, type: m.type, confidentiality: m.confidentiality, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/opened', at: ms, meeting: mid, type: m.type, enforced, enforcedScope: ENFORCED_SCOPE })
      return { ok: true, meeting: mid, quorum: quorumOf(m), receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Join. `lateAfterMs` decides whether a late arrival is allowed/recorded/refused. */
    attend({ meeting, member, at = null } = {}) {
      const m = requireMeeting(meeting)
      const enforced = []
      if (typeof member !== 'string' || !member) throw deny('VMU_INVALID_ARGUMENT', 'attend needs a member id', 'e.g. { meeting: "m1", member: "r-1" }', [])
      if (!isMember(member)) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + member, 'the roster seam rejected it', [])
      const ms = at === null ? clock() : at
      if (m.state === 'recess') throw deny('VMU_STATE', 'the meeting is in recess: ' + m.id, 'resume() first (vmu.meetings.recessMaxMs / recessResumeRequiresMotion)', [])
      let late = false
      if (K.lateAfterMs > 0 && ms - m.openedAt > K.lateAfterMs) {
        mark(enforced, 'vmu.meetings.lateAfterMs')
        late = true
      }
      m.roster = m.roster.includes(member) ? m.roster : m.roster.concat([member])
      m.present.add(member)
      const q = quorumOf(m)
      const receipt = { at: ms, action: 'attend', meeting: m.id, member, late, quorum: q, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/attended', at: ms, meeting: m.id, member, late, enforced, enforcedScope: ENFORCED_SCOPE })
      return { ok: true, late, quorum: q, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Leave. `leaveEarlyPolicy` (allow/note/deny) and `quorumLossPolicy` decide the consequence. */
    leave({ meeting, member, at = null } = {}) {
      const m = requireMeeting(meeting)
      const enforced = []
      const ms = at === null ? clock() : at
      if (!m.present.has(String(member))) throw deny('VMU_NOT_MEMBER', 'member is not present: ' + String(member), 'present: ' + [...m.present].sort().join(', '), [])
      if (K.leaveEarlyPolicy !== 'allow' && m.state === 'open') {
        mark(enforced, 'vmu.meetings.leaveEarlyPolicy')
        if (K.leaveEarlyPolicy === 'deny') {
          throw deny('VMU_NOT_PERMITTED', 'vmu.meetings.leaveEarlyPolicy="deny": leaving before close() is not allowed',
            'close() the meeting first, or set vmu.meetings.leaveEarlyPolicy to "allow"/"note"', enforced)
        }
        m.minutes.entries.push({ at: ms, kind: 'left-early', member: String(member) })
      }
      m.present.delete(String(member))
      const q = quorumOf(m)
      let policy = null
      if (!q.met && K.quorumLossPolicy !== 'continue') {
        mark(enforced, 'vmu.meetings.quorumLossPolicy')
        policy = K.quorumLossPolicy
        if (policy === 'suspend') markState(m, 'suspended')
        if (policy === 'recess') { markState(m, 'recess'); m.recess = { since: ms, initial: false } }
      }
      if (K.quorumRecountMs > 0 && !q.met) {
        mark(enforced, 'vmu.meetings.quorumRecountMs')
      }
      const receipt = { at: ms, action: 'leave', meeting: m.id, member: String(member), quorum: q, policy, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/left', at: ms, meeting: m.id, member: String(member), policy, enforced, enforcedScope: ENFORCED_SCOPE })
      return { ok: true, quorum: q, quorumLost: !q.met, policy, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /**
     * Speak. Rails: `speechMaxMs` / `speechExtendMs`+`speechExtendMax` / `speechQuotaPerMember`,
     * `disciplineMuteMs` (a muted member cannot speak), `verbatimEnabled` (transcript capture),
     * `budgetTurns`/`budgetTokens`/`budgetOnExceed` (the meeting budget).
     */
    speak({ meeting, member, ms: speechMs = null, text = '', verbatim = false, tokens = 0, at = null } = {}) {
      const m = requireMeeting(meeting)
      const enforced = []
      const now = at === null ? clock() : at
      if (!m.present.has(String(member))) throw deny('VMU_NOT_MEMBER', 'speaker is not present: ' + String(member), 'attend() first', [])
      const mute = m.mutes.get(String(member))
      if (mute && now < mute.until) {
        mark(enforced, 'vmu.meetings.disciplineMuteMs')
        throw denyIn(m, 'VMU_MEETING_DISCIPLINE_DENIED', 'member is muted until ' + mute.until + ': ' + String(member),
          'vmu.meetings.disciplineMuteMs=' + K.disciplineMuteMs + ' (muted at ' + mute.at + ')', enforced)
      }
      // speech time
      const wanted = speechMs === null ? K.speechDefaultMs : n(speechMs)
      if (K.speechMaxMs > 0 && wanted > K.speechMaxMs) {
        mark(enforced, 'vmu.meetings.speechMaxMs')
        capIn(m, 'VMU_MEETING_SPEECH_TIMEBOUND', 'speech time (ms)', wanted, K.speechMaxMs, 'vmu.meetings.speechMaxMs', enforced)
      }
      if (K.speechExtendMax > 0) {
        const used = m.speechUsed.get(String(member)) || { count: 0, extensions: 0 }
        mark(enforced, 'vmu.meetings.speechExtendMax')
        if (used.extensions >= K.speechExtendMax) {
          capIn(m, 'VMU_MEETING_SPEECH_TIMEBOUND', 'speech extensions', used.extensions, K.speechExtendMax, 'vmu.meetings.speechExtendMax', enforced)
        }
        if (K.speechExtendMs > 0 && wanted > K.speechDefaultMs) {
          used.extensions += 1
          m.speechUsed.set(String(member), used)
          mark(enforced, 'vmu.meetings.speechExtendMs')
        }
      }
      if (K.speechQuotaPerMember > 0) {
        const used = m.speechUsed.get(String(member)) || { count: 0, extensions: 0 }
        mark(enforced, 'vmu.meetings.speechQuotaPerMember')
        if (used.count >= K.speechQuotaPerMember) {
          capIn(m, 'VMU_MEETING_SPEECH_TIMEBOUND', 'speeches per member', used.count, K.speechQuotaPerMember, 'vmu.meetings.speechQuotaPerMember', enforced)
        }
      }
      // meeting budget (turns/tokens/wall)
      m.turns += 1
      m.tokens += n(tokens)
      let soft = null
      if (K.budgetTurns > 0 && m.turns > K.budgetTurns) {
        mark(enforced, 'vmu.meetings.budgetTurns')
        soft = budgetVerdict(m, 'turns', m.turns, K.budgetTurns, enforced)
      }
      if (K.budgetTokens > 0 && m.tokens > K.budgetTokens) {
        mark(enforced, 'vmu.meetings.budgetTokens')
        soft = budgetVerdict(m, 'tokens', m.tokens, K.budgetTokens, enforced)
      }
      // ROUND 200: the HARD wall-clock backstop is consulted FIRST - it has no off switch, while the soft budget
      // below may refuse, warn or extend. A pack can set this key and it now changes behaviour.
      if (now - m.wallStartMs > K.hardLimitMs) {
        mark(enforced, 'vmu.meetings.hardLimitMs')
        // F28: past the declared bound this is no longer only a refusal — the meeting can be SETTLED BY NAME
        // (`lapse()`), which produces `{name, why, at, revocable}` and can be revoked with a reason.
        throw deny('VMU_RESOURCE_BUDGET', 'the meeting wall-clock HARD limit is exceeded: ' + (now - m.wallStartMs) + ' / ' + K.hardLimitMs,
          'settle it by name with lapse() (bounded fallback, revocable), or close() it explicitly; the hard limit has no off switch (vmu.meetings.hardLimitMs, clamped [300000, 7200000])', enforced)
      }
      if (K.budgetWallMs > 0 && now - m.wallStartMs > K.budgetWallMs) {
        mark(enforced, 'vmu.meetings.budgetWallMs')
        soft = budgetVerdict(m, 'wallMs', now - m.wallStartMs, K.budgetWallMs, enforced)
      }
      if (verbatim && !K.verbatimEnabled) {
        mark(enforced, 'vmu.meetings.verbatimEnabled')
        throw denyIn(m, 'VMU_NOT_PERMITTED', 'vmu.meetings.verbatimEnabled=false: verbatim capture is disabled',
          'set vmu.meetings.verbatimEnabled=true, or speak without { verbatim: true }', enforced)
      }
      const used = m.speechUsed.get(String(member)) || { count: 0, extensions: 0 }
      used.count += 1
      m.speechUsed.set(String(member), used)
      if (verbatim) for (const line of String(text).split('\n')) m.transcript.push({ at: now, member: String(member), text: line })
      m.queue = m.queue.filter((x) => x !== String(member))
      counters.speeches += 1
      const entry = { at: now, kind: 'speech', member: String(member), ms: wanted, tokens: n(tokens), verbatim: !!verbatim }
      m.minutes.entries.push(entry)
      // B④: `floor` DISCLOSES the floor in force — the `open` floor has NO queue, so nobody can be "not their turn".
      const floor = orderControls.floorOf(m)
      const receipt = { at: now, action: 'speak', meeting: m.id, member: String(member), ms: wanted, turns: m.turns, tokens: m.tokens, budget: soft, floor, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/spoke', at: now, meeting: m.id, member: String(member), floor, enforced, enforcedScope: ENFORCED_SCOPE })
      return { ok: true, ms: wanted, turns: m.turns, tokens: m.tokens, budget: soft, floor, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Interrupt. `interruptAllow` + `interruptQuota` govern the floor. */
    interrupt({ meeting, member, target = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      if (!isMember(String(member))) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + String(member), 'interrupt() acts as or on the interrupting member - the roster seam rejected this id; a non-member never votes (08 D-series)', [])
      const enforced = []
      const now = at === null ? clock() : at
      mark(enforced, 'vmu.meetings.interruptAllow')
      if (!K.interruptAllow) {
        throw deny('VMU_MEETING_INTERRUPT_DENIED', 'vmu.meetings.interruptAllow=false: interrupting is not allowed in this meeting',
          'let the current speaker finish, or set vmu.meetings.interruptAllow=true', enforced)
      }
      if (K.interruptQuota > 0) {
        const used = m.interrupts.get(String(member)) || 0
        mark(enforced, 'vmu.meetings.interruptQuota')
        if (used >= K.interruptQuota) cap('VMU_MEETING_INTERRUPT_DENIED', 'interrupts', used, K.interruptQuota, 'vmu.meetings.interruptQuota', enforced)
        m.interrupts.set(String(member), used + 1)
      }
      counters.speeches += 1
      m.minutes.entries.push({ at: now, kind: 'interrupt', member: String(member), target })
      const receipt = { at: now, action: 'interrupt', meeting: m.id, member: String(member), target, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      return { ok: true, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Queue a speaker. The position comes from the EFFECTIVE order (B③/B④): an override in force ⇒ the setting is
     * not consulted again (`enforced:[]`); `call_on` ⇒ chair-only; the `open` floor keeps NO queue. */
    queue({ meeting, member, at = null, by = null } = {}) {
      const m = requireMeeting(meeting)
      if (!isMember(String(member))) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + String(member), 'queue() acts as or on the member taking a place in the queue - the roster seam rejected this id; a non-member never votes (08 D-series)', [])
      const eff = orderControls.effective(m)
      const enforced = eff.source === 'setting' ? ['vmu.meetings.orderMode'] : []
      const actor = by === null || by === undefined || by === '' ? String(member) : String(by)
      const gate = orderControls.queueGate(m, actor)
      if (!gate.ok) throw deny(gate.code, gate.message, gate.hint, enforced)
      if (eff.queueOpen && !m.queue.includes(String(member))) m.queue.push(String(member))
      const order = orderControls.orderFor(m, m.queue)          // ALWAYS a copy: a read never reorders the queue
      const receipt = { at: at === null ? clock() : at, action: 'queue', meeting: m.id, member: String(member), by: actor, mode: eff.mode, modeSource: eff.source, queued: eff.queueOpen, seed: eff.seed, order, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      return { ok: true, mode: eff.mode, modeSource: eff.source, queued: eff.queueOpen, order, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Move a motion. `emergencyKinds`/`emergencyQuorumRatio` and `materialsRequired` apply. */
    motion({ meeting, member, kind = 'ordinary', text = '', materials = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      if (!isMember(String(member))) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + String(member), 'motion() acts as or on the member moving the motion - the roster seam rejected this id; a non-member never votes (08 D-series)', [])
      const enforced = []
      const now = at === null ? clock() : at
      // GAP-MTG-02: a RESOLUTION motion is an entity conclusion, so a light meeting refuses it through the SAME
      // predicate the close rail uses (the v5r S12/D7 rule, now a single decision point).
      if (String(kind) === 'resolution') {
        // ★ PHASE 7 修（真回归，被 vmu-meeting-parity 抓到）：★ **先问"这个会议有没有资格产生实体结论"，再问"你是谁"**。
        // 理由不是口味：★ **轻量会议【根本不能】产生实体结论，★ 与提案人是谁无关** ⇒ ★ 若先查权限，一个非 chair 成员
        // 得到的拒绝是 `VMU_NOT_PERMITTED`（"你不是主持人"），而真相是"**这个会议不允许**" ⇒ 调用方会去争取 chair 席位
        // 而不是升级会议层级。★ **拒绝要用调用者的词汇说清【真正的原因】**（红线 3）。
        const tierBlock = truthWriteRefusal('moving a resolution', enforced)
        if (tierBlock) throw tierBlock
        // ★ PHASE 7: a resolution is a RECORD write; the original allows the chair OR the secretary. The secretary is
        // DECLARED on the meeting (never inferred from a vote permission), and this check grants NOTHING about voting.
        if (m.secretary === null && String(member) !== String(m.chair)) {
          throw deny('VMU_NOT_PERMITTED', 'only the chair or the declared secretary may move a resolution: ' + String(member),
            'declare { secretary: "<member id>" } when opening the meeting, or let the chair move it', enforced)
        }
        if (m.secretary !== null && String(member) !== String(m.chair) && String(member) !== m.secretary) {
          throw deny('VMU_NOT_PERMITTED', 'only the chair or the declared secretary may move a resolution: ' + String(member),
            'secretary=' + m.secretary + '; chair=' + String(m.chair || '(none)'), enforced)
        }
      }
      const emergency = K.emergencyKinds.length > 0 && K.emergencyKinds.includes(String(kind))
      if (K.emergencyKinds.length) mark(enforced, 'vmu.meetings.emergencyKinds')
      if (String(kind) === 'emergency' && !emergency) {
        throw deny('VMU_MEETING_EMERGENCY_NOT_ALLOWED', '"emergency" is not an allowed motion kind here',
          'allowed emergency kinds: ' + (K.emergencyKinds.join(', ') || '(none — vmu.meetings.emergencyKinds is empty)'), enforced)
      }
      if (K.materialsRequired) {
        mark(enforced, 'vmu.meetings.materialsRequired')
        if (!materials) throw deny('VMU_STATE', 'vmu.meetings.materialsRequired=true: a motion needs its materials', 'pass { materials: <pointer> } (the pointer is owned by 07/22)', enforced)
      }
      // ROUND 199: `vmu.meetings.verdictMaxRounds` - the ceiling on how many times one meeting may be put to a
      // motion. The "object" of deliberation in this face is the meeting itself (a motion carries no target), and
      // saying so is the point: the ceiling is per meeting, checked before anything is created.
      if (m.motions.length >= K.verdictMaxRounds) {
        mark(enforced, 'vmu.meetings.verdictMaxRounds')
        throw deny('VMU_RESOURCE_BUDGET', 'the motion ceiling is reached for this meeting: ' + m.motions.length + ' / ' + K.verdictMaxRounds,
          'raise vmu.meetings.verdictMaxRounds, or close this meeting and open a new one (vmu.meetings.verdictMaxRounds)', enforced)
      }
      const q = quorumOf(m)
      let need = q.required
      if (emergency && K.emergencyQuorumRatio > 0) {
        mark(enforced, 'vmu.meetings.emergencyQuorumRatio')
        need = Math.max(need, Math.ceil(K.emergencyQuorumRatio * m.roster.length))
      }
      const motion = { id: 'mo' + (m.motions.length + 1), at: now, by: String(member), kind: String(kind), text: String(text), emergency, quorumRequired: need, status: 'proposed', secondedBy: null, votes: new Map(), abstain: new Set(), refused: false }
      m.motions.push(motion)
      counters.motions += 1
      m.minutes.entries.push({ at: now, kind: 'motion', id: motion.id, by: motion.by, motionKind: motion.kind })
      const receipt = { at: now, action: 'motion', meeting: m.id, motion: motion.id, kind: motion.kind, quorumRequired: need, quorum: q, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/motion', at: now, meeting: m.id, motion: motion.id, kind: motion.kind, enforced, enforcedScope: ENFORCED_SCOPE })
      // ROUND 12 / task-97 (vmu-pack's ⑤): A MID-MEETING MOTION IS OBSERVABLE. This site used to only write the local
      // log, so no middleware could react to "someone moved a motion in THIS meeting" - and the id the mirror asks
      // `boxFor` about is THIS meeting-scoped id (`mo1`), not the governance face's institute-wide `mo-1`. The event
      // therefore carries both ids a policy needs; registered in bus.js as `meeting/motion` (`failure:'open'`, so a
      // broken listener cannot stop a motion), which is what makes the pack's "propose ⇒ open a box" policy possible.
      emit('meeting/motion', { at: now, meeting: m.id, motion: motion.id, kind: motion.kind, emergency: emergency === true })
      return { ok: true, motion: motion.id, quorumRequired: need, quorum: q, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /**
     * ★ PHASE 7: SECOND a proposed motion. A motion is not votable until seconded; the proposer cannot second their own
     * motion (original semantics). Only a PROPOSED motion can be seconded.
     */
    second({ meeting, motion = null, member = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      const now = at === null ? clock() : at
      if (!isMember(String(member))) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + String(member), 'second() acts as a member', [])
      const target = motion === null ? null : m.motions.find((x) => x.id === String(motion))
      if (!target) throw deny('VMU_NO_SUCH_OBJECT', 'no such motion: ' + String(motion), 'motions: ' + (m.motions.map((x) => x.id).join(', ') || 'none'))
      if (String(member) === target.by) throw deny('VMU_NOT_PERMITTED', 'the proposer cannot second their own motion: ' + String(member), 'another member must second it')
      if (target.status !== 'proposed') throw deny('VMU_STATE', 'motion ' + target.id + ' is ' + target.status + ', not proposed', 'only a proposed motion can be seconded')
      target.status = 'seconded'
      target.secondedBy = String(member)
      m.minutes.entries.push({ at: now, kind: 'second', id: target.id, by: String(member) })
      const receipt = { at: now, action: 'second', meeting: m.id, motion: target.id, by: String(member), status: target.status, secondedBy: target.secondedBy }
      pushReceipt(receipt)
      emit('meeting/second', { at: now, meeting: m.id, motion: target.id, by: String(member) })
      return { ok: true, motion: target.id, status: target.status, secondedBy: target.secondedBy, receipt }
    },
    /**
     * ★ PHASE 7: WITHDRAW a motion. Only the proposer, and only while proposed/seconded. A withdrawn motion leaves the
     * state machine (it cannot be seconded or voted); the minutes record who withdrew it.
     */
    withdraw({ meeting, motion = null, member = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      const now = at === null ? clock() : at
      const target = motion === null ? null : m.motions.find((x) => x.id === String(motion))
      if (!target) throw deny('VMU_NO_SUCH_OBJECT', 'no such motion: ' + String(motion), 'motions: ' + (m.motions.map((x) => x.id).join(', ') || 'none'))
      if (String(member) !== target.by) throw deny('VMU_NOT_PERMITTED', 'only the proposer may withdraw motion ' + target.id + ': ' + String(member), 'proposer=' + target.by)
      if (target.status !== 'proposed' && target.status !== 'seconded') throw deny('VMU_STATE', 'motion ' + target.id + ' is ' + target.status + '; only proposed/seconded can be withdrawn', 'a voted/withdrawn motion cannot be withdrawn again')
      target.status = 'withdrawn'
      target.withdrawnAt = now
      m.minutes.entries.push({ at: now, kind: 'withdraw', id: target.id, by: String(member) })
      const receipt = { at: now, action: 'withdraw', meeting: m.id, motion: target.id, by: String(member), status: target.status }
      pushReceipt(receipt)
      emit('meeting/withdrawn', { at: now, meeting: m.id, motion: target.id, by: String(member) })
      return { ok: true, motion: target.id, status: target.status, receipt }
    },
    /**
     * Vote on a motion (or open ballot). Rails: `chairNeutral` (the chair may vote only to break a tie),
     * `unansweredInDenominator`/`attendanceMode` (through quorum), `quorumLossPolicy`/`quorumRecountMs`.
     */
    vote({ meeting, member, motion = null, value = 1, at = null } = {}) {
      const m = requireMeeting(meeting)
      const enforced = []
      const now = at === null ? clock() : at
      if (!isMember(member)) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + String(member), 'the roster seam rejected it', [])
      // THE VOTER-SEAT GATE (A1 round 10). Declared seats only; no declaration = no seat rule. The refusal NAMES the
      // slot and the seats, because the caller's next question is always "then who may vote?".
      if (K.eligibleSeats.length) {
        mark(enforced, 'vmu.meetings.eligibleSeats')
        const row = seatRowOf(member)
        const seat = row ? String(row.slot) : null
        if (!K.eligibleSeats.includes(seat)) {
          throw deny('VMU_NOT_PERMITTED',
            'this seat has no vote: "' + String(member) + '" is in slot "' + String(seat || '(unknown)') + '"; the declared voter seats are ' + K.eligibleSeats.join(' / '),
            'only the declared voter seats may vote (invitees, observers and temporary workers never vote; an authorisation cannot transfer a vote)', enforced)
        }
      }
      const q = quorumOf(m)
      if (K.quorumMin > 0) mark(enforced, 'vmu.meetings.quorumMin')
      if (K.quorumRatio > 0) mark(enforced, 'vmu.meetings.quorumRatio')
      if (!q.met) {
        if (m.state === 'suspended') {
          mark(enforced, 'vmu.meetings.quorumLossPolicy')
          throw denyIn(m, 'VMU_MEETING_QUORUM_LOST', 'quorum is lost and vmu.meetings.quorumLossPolicy="suspend"',
            '现值=' + q.present + ', 需要=' + q.required + ' (vmu.meetings.quorumLossPolicy)', enforced)
        }
        if (K.quorumRecountMs > 0) {
          mark(enforced, 'vmu.meetings.quorumRecountMs')
          throw denyIn(m, 'VMU_MEETING_QUORUM_LOST', 'quorum is not met; the next recount is in ' + K.quorumRecountMs + 'ms',
            '现值=' + q.present + ', 需要=' + q.required + ' (vmu.meetings.quorumRecountMs)', enforced)
        }
        throw denyIn(m, 'VMU_MEETING_QUORUM_LOST', 'quorum is not met: ' + q.present + '/' + q.required,
          '现值=' + q.present + ', 需要=' + q.required + ' (vmu.meetings.quorumMin/quorumRatio)', enforced)
      }
      const target = motion === null ? null : m.motions.find((x) => x.id === String(motion))
      if (motion !== null && !target) throw deny('VMU_NO_SUCH_OBJECT', 'no such motion: ' + String(motion), 'motions: ' + (m.motions.map((x) => x.id).join(', ') || 'none'), enforced)
      if (String(member) === m.chair && K.chairNeutral) {
        mark(enforced, 'vmu.meetings.chairNeutral')
        const forCount = target ? [...target.votes.values()].filter((v) => v === 1).length : 0
        const against = target ? [...target.votes.values()].filter((v) => v === 0).length : 0
        if (forCount !== against && target) {
          throw denyIn(m, 'VMU_NOT_PERMITTED', 'vmu.meetings.chairNeutral=true: the chair may vote only to break a tie',
            'current tally ' + forCount + ':' + against + ' is not tied (vmu.meetings.chairNeutral)', enforced)
        }
      }
      if (K.unansweredInDenominator) mark(enforced, 'vmu.meetings.unansweredInDenominator')
      if (K.attendanceMode !== 'roster') mark(enforced, 'vmu.meetings.attendanceMode')
      if (target) target.votes.set(String(member), value === 0 ? 0 : 1)
      // ★ G7: A VOTE IS PARTICIPATION. Without this, the quorum snapshot stayed stale after voting (present still 1,
      // unanswered still ["r-1"] although r-1 had just voted) and a caller could read "someone has not decided yet".
      m.present.add(String(member))
      counters.votes += 1
      // the receipt reports the quorum AFTER this vote, so present/unanswered cannot lag the registered vote
      const quorumAfter = quorumOf(m)
      // HONESTY (R15): with NO motion there is NO box to count, so the receipt must not report a tally it cannot back
      // (it used to answer {for:0,against:0,abstain:0} while `counters.votes` rose and the minutes row was written).
      // The real open-ballot CONTAINER is `kernel/ballot.js` (v5r pollOpen/pollVote/pollClose ≙ action ballot/vote/tally).
      const tallyNote = target ? null : 'no motion or box is open for this vote: it IS recorded (minutes + counters) but NOT counted, so no tally is claimed (tally:null)'
      const tally = target ? tallyOf(m.id, target) : null
      m.minutes.entries.push({ at: now, kind: 'vote', motion: target ? target.id : null, member: String(member), value: value === 0 ? 0 : 1 })
      const ballotMirror = mirrorVote({ ballot, boxFor: boxBinding.resolve(), counters, meeting: m.id, motionId: target ? target.id : null, member, value,
        motionText: target ? target.text : null, motionKind: target ? target.kind : null, motionEmergency: target ? target.emergency === true : false })
      const receipt = { at: now, action: 'vote', meeting: m.id, motion: target ? target.id : null, member: String(member), tally, counted: target !== null, tallyNote, quorum: quorumAfter, enforced, enforcedScope: ENFORCED_SCOPE, ballot: ballotMirror }
      pushReceipt(receipt)
      return { ok: true, tally, counted: target !== null, tallyNote, quorum: quorumAfter, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Transfer the chair. `chairTransferAudit` demands a reason. */
    transferChair({ meeting, to, reason = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      if (!isMember(String(to))) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + String(to), 'transferChair() acts as or on the member taking the chair - the roster seam rejected this id; a non-member never votes (08 D-series)', [])
      const enforced = []
      if (typeof to !== 'string' || !to) throw deny('VMU_INVALID_ARGUMENT', 'transferChair needs a target member', 'e.g. { meeting, to: "r-2", reason: "…" }', [])
      if (K.chairTransferAudit) {
        mark(enforced, 'vmu.meetings.chairTransferAudit')
        if (!(typeof reason === 'string' && reason.trim())) {
          throw deny('VMU_REASON_REQUIRED', 'vmu.meetings.chairTransferAudit=true requires a reason for the transfer',
            'pass { reason: "…" } — an unaudited chair transfer is indistinguishable from an accident', enforced)
        }
      }
      if (!m.roster.includes(to)) m.roster.push(to)
      m.chair = to
      m.present.add(to)
      m.minutes.entries.push({ at: at === null ? clock() : at, kind: 'chair-transfer', to, reason: reason === null ? null : String(reason) })
      const receipt = { at: at === null ? clock() : at, action: 'transferChair', meeting: m.id, chair: to, reason, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      return { ok: true, chair: to, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Recess. `recessMaxMs` bounds it (and `recessResumeRequiresMotion` governs resuming). */
    // B② (Round 10): the leave/recess family is implemented in `kernel/meetingleave.js` (rules); the face keeps
    // the state seams and the receipt vocabulary, so each call leaves here scope-carrying like every other receipt.
    requestLeave: (a) => withScope(leaveControls.requestLeave(a)),
    approveLeave: (a) => withScope(leaveControls.approveLeave(a)),
    leaveRequests: (a) => withScope(leaveControls.leaveRequests(a)),

    recess({ meeting, ms = 0, by = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      // ROUND 315: recess changes the process for everyone, so it is an ACT, not a read: with a roster seam in force
      // the acting member must be named and be a member. Without a seam nothing changes.
      if (members) {
        if (!by) throw deny('VMU_NOT_MEMBER', 'recess() needs the acting member: this instance has a roster seam',
          'pass { by: "<member id>" } - suspending a meeting is an act that has to be attributable (08 D-series)', [])
        if (!isMember(String(by))) throw deny('VMU_NOT_MEMBER', 'the acting member is not on the roster: ' + String(by), 'the roster seam rejected the actor for recess()', [])
      }
      const enforced = []
      const now = at === null ? clock() : at
      if (K.recessMaxMs > 0) {
        mark(enforced, 'vmu.meetings.recessMaxMs')
        if (n(ms) > K.recessMaxMs) cap('VMU_MEETING_RECESS_LIMIT', 'recess (ms)', n(ms), K.recessMaxMs, 'vmu.meetings.recessMaxMs', enforced)
      }
      if (m.state === 'recess') throw deny('VMU_STATE', 'already in recess: ' + m.id, 'resume() first', [])
      markState(m, 'recess')
      m.recess = { since: now, until: now + n(ms), motion: null, initial: true }
      m.minutes.entries.push({ at: now, kind: 'recess', ms: n(ms) })
      const receipt = { at: now, action: 'recess', meeting: m.id, until: m.recess.until, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      return { ok: true, until: m.recess.until, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Resume. `recessResumeRequiresMotion` demands a motion id (and the recess must not have overrun). */
    resume({ meeting, motion = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      const enforced = []
      const now = at === null ? clock() : at
      if (m.state !== 'recess') throw deny('VMU_STATE', 'the meeting is not in recess: ' + m.id, 'state: ' + m.state, [])
      if (K.recessMaxMs > 0 && m.recess && now - m.recess.since > K.recessMaxMs) {
        mark(enforced, 'vmu.meetings.recessMaxMs')
      }
      if (K.recessResumeRequiresMotion) {
        mark(enforced, 'vmu.meetings.recessResumeRequiresMotion')
        if (!motion) throw deny('VMU_STATE', 'vmu.meetings.recessResumeRequiresMotion=true: resuming needs a motion',
          'pass { motion: "<id>" } — a recess does not end by itself', enforced)
      }
      markState(m, 'open')
      m.recess = null
      m.minutes.entries.push({ at: now, kind: 'resume', motion: motion === null ? null : String(motion) })
      const receipt = { at: now, action: 'resume', meeting: m.id, motion, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      return { ok: true, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Warn / mute / expel. `disciplineWarnMax`, `disciplineMuteMs`, `disciplineExpelAllowed`. */
    warn({ meeting, member, by = null, reason = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      if (!isMember(String(member))) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + String(member), 'warn() acts as or on the member being warned - the roster seam rejected this id; a non-member never votes (08 D-series)', [])
      // ROUND 315: the TARGET was gated in round 314, the ACTOR was not - so an outsider could still discipline
      // members. With a roster seam in force the actor must be named AND be a member; without a seam nothing changes
      // (mechanism follows the seam: a deployment with no roster has no membership concept to enforce).
      if (members) {
        if (!by) throw deny('VMU_NOT_MEMBER', 'warn() needs the acting member: this instance has a roster seam',
          'pass { by: "<member id>" } - who disciplines must be answerable, and an unnamed actor cannot be (08 D-series)', [])
        if (!isMember(String(by))) throw deny('VMU_NOT_MEMBER', 'the acting member is not on the roster: ' + String(by), 'the roster seam rejected the actor for warn()', [])
      }
      const enforced = []
      const now = at === null ? clock() : at
      const used = (m.warnings.get(String(member)) || 0) + 1
      m.warnings.set(String(member), used)
      counters.warnings += 1
      m.minutes.entries.push({ at: now, kind: 'warn', member: String(member), count: used, reason: reason === null ? null : String(reason) })
      let escalated = null
      if (K.disciplineWarnMax > 0 && used > K.disciplineWarnMax) {
        mark(enforced, 'vmu.meetings.disciplineWarnMax')
        if (K.disciplineMuteMs > 0) {
          mark(enforced, 'vmu.meetings.disciplineMuteMs')
          m.mutes.set(String(member), { at: now, until: now + K.disciplineMuteMs })
          counters.mutes += 1
          escalated = 'muted'
        } else {
          escalated = 'warned-over-limit'
        }
      }
      const receipt = { at: now, action: 'warn', meeting: m.id, member: String(member), count: used, escalated, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      return { ok: true, count: used, escalated, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },
    expel({ meeting, member, by = null, reason = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      if (!isMember(String(member))) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + String(member), 'expel() acts as or on the member being expelled - the roster seam rejected this id; a non-member never votes (08 D-series)', [])
      // ROUND 315: expulsion is the heaviest act in the face, so its ACTOR is gated exactly as warn()'s is.
      if (members) {
        if (!by) throw deny('VMU_NOT_MEMBER', 'expel() needs the acting member: this instance has a roster seam',
          'pass { by: "<member id>" } - an expulsion no member ordered is not attributable (08 D-series)', [])
        if (!isMember(String(by))) throw deny('VMU_NOT_MEMBER', 'the acting member is not on the roster: ' + String(by), 'the roster seam rejected the actor for expel()', [])
      }
      const enforced = ['vmu.meetings.disciplineExpelAllowed']
      if (!K.disciplineExpelAllowed) {
        throw deny('VMU_MEETING_DISCIPLINE_DENIED', 'vmu.meetings.disciplineExpelAllowed=false: expulsion is not allowed',
          'use warn()/mute() instead, or set vmu.meetings.disciplineExpelAllowed=true', enforced)
      }
      const now = at === null ? clock() : at
      m.present.delete(String(member))
      m.minutes.entries.push({ at: now, kind: 'expel', member: String(member), reason: reason === null ? null : String(reason) })
      const q = quorumOf(m)
      const receipt = { at: now, action: 'expel', meeting: m.id, member: String(member), quorum: q, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      return { ok: true, quorum: q, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Quote a meeting record. `confidentialityQuotePolicy` (allow/redact/deny) decides. */
    quote({ meeting, member = null, text = '', at = null } = {}) {
      const m = requireMeeting(meeting)
      if (!isMember(String(member))) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + String(member), 'quote() acts as or on the member quoting - the roster seam rejected this id; a non-member never votes (08 D-series)', [])
      const enforced = ['vmu.meetings.confidentialityDefault', 'vmu.meetings.confidentialityQuotePolicy']
      if (K.confidentialityQuotePolicy === 'deny') {
        throw deny('VMU_MEETING_CONFIDENTIAL_DENIED', 'vmu.meetings.confidentialityQuotePolicy="deny": quoting is not allowed',
          'the meeting level is "' + m.confidentiality + '" (vmu.meetings.confidentialityDefault)', enforced)
      }
      const out = K.confidentialityQuotePolicy === 'redact' ? '[redacted]' : String(text)
      const receipt = { at: at === null ? clock() : at, action: 'quote', meeting: m.id, level: m.confidentiality, policy: K.confidentialityQuotePolicy, quoted: out, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      return { ok: true, level: m.confidentiality, policy: K.confidentialityQuotePolicy, quoted: out, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** File an appeal. `appealScope`, `appealDeadlineMs`, `appealReasonRequired`. */
    fileAppeal({ meeting = null, member, kind = 'procedural', reason = null, at = null } = {}) {
      const m = meeting === null ? null : requireMeeting(meeting)
      const enforced = ['vmu.meetings.appealScope']
      if (!isMember(String(member))) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + String(member), 'fileAppeal() acts as or on the member filing the appeal - the roster seam rejected this id; a non-member never votes (08 D-series)', [])
      const now = at === null ? clock() : at
      if (K.appealScope === 'none' || (K.appealScope === 'procedural' && String(kind) !== 'procedural')) {
        throw deny('VMU_MEETING_APPEAL_OUT_OF_SCOPE', 'appeal kind "' + kind + '" is out of scope (vmu.meetings.appealScope=' + K.appealScope + ')',
          'allowed: ' + K.appealScope, enforced)
      }
      if (m && K.appealDeadlineMs > 0) {
        mark(enforced, 'vmu.meetings.appealDeadlineMs')
        const deadline = m.openedAt + K.appealDeadlineMs
        if (now > deadline) cap('VMU_TRUST_APPEAL_WINDOW', 'appeal time (ms)', now - m.openedAt, K.appealDeadlineMs, 'vmu.meetings.appealDeadlineMs', enforced)
      }
      if (K.appealReasonRequired && !(typeof reason === 'string' && reason.trim())) {
        mark(enforced, 'vmu.meetings.appealReasonRequired')
        throw deny('VMU_REASON_REQUIRED', 'vmu.meetings.appealReasonRequired=true: an appeal needs a reason',
          'pass { reason: "…" } — an unexplained appeal cannot be adjudicated', enforced)
      }
      const appeal = { id: 'ap' + (counters.appeals + 1), at: now, by: String(member), kind: String(kind), reason: reason === null ? null : String(reason), decided: null }
      counters.appeals += 1
      if (m) { m.appeals.push(appeal); m.minutes.entries.push({ at: now, kind: 'appeal', id: appeal.id, by: appeal.by }) }
      const receipt = { at: now, action: 'fileAppeal', meeting: m ? m.id : null, appeal: appeal.id, kind: appeal.kind, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/appeal', at: now, appeal: appeal.id, enforced, enforcedScope: ENFORCED_SCOPE })
      return { ok: true, appeal: appeal.id, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Confirm the previous minutes (`confirmPreviousMinutes` gates starting new business). */
    confirmMinutes({ meeting, by = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      if (!isMember(String(by))) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + String(by), 'confirmMinutes() acts as or on the member confirming the minutes - the roster seam rejected this id; a non-member never votes (08 D-series)', [])
      const enforced = ['vmu.meetings.confirmPreviousMinutes']
      m.previousConfirmed = true
      m.minutes.entries.push({ at: at === null ? clock() : at, kind: 'minutes-confirmed', by })
      const receipt = { at: at === null ? clock() : at, action: 'confirmMinutes', meeting: m.id, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      return { ok: true, confirmed: true, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Minutes (READ-ONLY): shaped by `minutesDetail`, `minutesIncludeRefused`, pruned by `minutesRetentionMs`. */
    minutes({ meeting, by = null, at = null } = {}) {
      const m = requireMeeting(meeting, { readOnly: true })
      assertCanReadRecord(m, 'minutes', by)
      const now = at === null ? clock() : at
      const refused = m.minutes.refused.filter(() => K.minutesIncludeRefused)
      const entries = K.minutesDetail === 'full' ? m.minutes.entries.slice() : m.minutes.entries.filter((e) => e.kind !== 'speech' || e.ms > 0).slice(0, 20)
      return {
        ok: true, meeting: m.id, detail: K.minutesDetail, includeRefused: K.minutesIncludeRefused,
        entries, actions: m.minutes.actions.slice(), refused,
        confirmedPrevious: m.previousConfirmed, dissent: m.dissent.slice(),
        retentionMs: K.minutesRetentionMs, archivable: K.minutesRetentionMs > 0 && now - m.openedAt > K.minutesRetentionMs,
        note: 'minutes are OWNED by 08/07 — this view only shapes and prunes them (a pruned entry is counted)',
      }
    },

    /** Verbatim transcript (READ-ONLY; pruned by `verbatimRetentionMs`, drops counted). */
    verbatim({ meeting, by = null, at = null } = {}) {
      const m = requireMeeting(meeting, { readOnly: true })
      assertCanReadRecord(m, 'verbatim', by)
      if (!K.verbatimEnabled) return { ok: true, enabled: false, lines: [], dropped: counters.prunedVerbatim, note: 'vmu.meetings.verbatimEnabled=false: nothing is captured' }
      const now = at === null ? clock() : at
      let lines = m.transcript.slice()
      if (K.verbatimRetentionMs > 0) {
        const kept = lines.filter((l) => now - l.at <= K.verbatimRetentionMs)
        const dropped = lines.length - kept.length
        if (dropped > 0) { counters.prunedVerbatim += dropped; say({ type: 'meetings/verbatim-pruned', at: now, dropped }) }
        lines = kept
      }
      return { ok: true, enabled: true, lines, count: lines.length, retentionMs: K.verbatimRetentionMs, dropped: counters.prunedVerbatim }
    },

    /** Wake a member through the injected seam; `wakeFailurePolicy` decides what a failure means. */
    wake({ member, at = null } = {}) {
      const enforced = ['vmu.meetings.wakeFailurePolicy']
      if (typeof wake !== 'function') {
        throw deny('VMU_ENGINE_UNAVAILABLE', 'no wake seam is injected', 'inject { wake } (the member-wake surface) to use this rail', [])
      }
      const now = at === null ? clock() : at
      let out = { ok: true }
      try { out = wake({ member, at: now }) || { ok: true } } catch (e) { out = { ok: false, error: String((e && e.message) || e) } }
      if (out.ok === false) {
        if (K.wakeFailurePolicy === 'refuse') {
          throw deny('VMU_STATE', 'the wake failed and vmu.meetings.wakeFailurePolicy="refuse"',
            'seam error: ' + String(out.error || 'unknown') + ' (vmu.meetings.wakeFailurePolicy)', enforced)
        }
          // ★ task-248（Round 15）· 第 1 处【持久化】：journal 一直只写「发生过的事」（attended／left／spoke），
          // 而"我根本没被送达"也是发生在这名成员身上的事 —— 它此前不产生任何记录，于是【被问了但沉默】与
          // 【从未被唤醒】在持久层无法分辨（判定：DISTINGUISHED BUT NOT PERSISTED）。这里补上以【成员】为准的一条。
          say({ type: 'meetings/skipped', at: now, member, reason: 'wake-failure-policy=skip' })
        if (K.wakeFailurePolicy === 'skip') { counters.skippedWakes += 1; return { ok: true, woken: false, skipped: true, skippedWakes: counters.skippedWakes, enforced, enforcedScope: ENFORCED_SCOPE } }
        // ROUND 198: `retry` now has its BOUND (`vmu.meetings.wakeRetries`). The face owns the loop, marks the key the
        // moment the policy consults it, and on exhaustion records the member as `unreached` - "treated as having had
        // its chance", which is that key's own contract rather than an invention here.
        let attempts = 1
        let last = out
        mark(enforced, 'vmu.meetings.wakeRetries')
        while (last && last.ok === false && attempts <= K.wakeRetries) {
          attempts += 1
          try { last = wake({ member, at: now }) || { ok: true } } catch (e) { last = { ok: false, error: String((e && e.message) || e) } }
        }
        if (last && last.ok === false) {
          counters.unreachedWakes = (counters.unreachedWakes || 0) + 1
            // ★ task-248（Round 15）· 第 1 处【持久化】：重试用尽 ⇒ 此前只有返回值与聚合计数器知道，
            // journal 里【没有这一名成员】。补一条以成员为准的事件，带上重试次数（对齐原版把 tries 入历史）。
            say({ type: 'meetings/unreached', at: now, member, retries: attempts - 1, wakeRetries: K.wakeRetries, reason: 'wake-retries-exhausted' })
          return { ok: true, woken: false, unreached: true, retries: attempts - 1, wakeRetries: K.wakeRetries, unreachedWakes: counters.unreachedWakes, enforced, enforcedScope: ENFORCED_SCOPE }
        }
        return { ok: true, woken: true, retries: attempts - 1, wakeRetries: K.wakeRetries, enforced, enforcedScope: ENFORCED_SCOPE }
      }
      return { ok: true, woken: true, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Close the meeting. `committeeReportRequired`, `minutesActionsRequired`, `confirmPreviousMinutes`. */
    close({ meeting, report = null, actions = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      const enforced = []
      const now = at === null ? clock() : at
      // GAP-MTG-02 (D7): a `report` IS an entity conclusion, so a light (or light-disallowed) meeting refuses
      // the close that carries one BY NAME. Agenda, rounds and ACTION ITEMS remain allowed — that is what a
      // light procedure is for (v5r: 简流程＝议程＋轮询＋行动项，但不得产出实体定论).
      if (report) {
        const tierBlock = truthWriteRefusal('closing with an entity report', enforced)
        if (tierBlock) throw tierBlock
      }
      // Each rail is marked the moment its switch is CONSULTED (not only when it fires), so a refusal by a
      // LATER rail still shows that these earlier rails were active in this call.
      // ★ G7 (real machine): close answered `enforced:[]`, which reads as "nothing was evaluated". The four close rails
      // ARE consulted on every close; they were simply all at their defaults, so none fired. Marking them on
      // CONSULTATION (the same convention vote() uses for the seat key) makes the close receipt a real reading and
      // keeps `enforcedScope:'evaluated-so-far'` truthful.
      mark(enforced, 'vmu.meetings.confirmPreviousMinutes')
      if (K.confirmPreviousMinutes) {
        if (!m.previousConfirmed) {
          throw deny('VMU_MINUTES_NOT_CONFIRMED', 'vmu.meetings.confirmPreviousMinutes=true: the previous minutes are not confirmed',
            'call confirmMinutes() before closing (vmu.meetings.confirmPreviousMinutes)', enforced)
        }
      }
      mark(enforced, 'vmu.meetings.committeeReportRequired')
      if (K.committeeReportRequired) {
        if (m.type === 'committee' && !report) {
          throw deny('VMU_STATE', 'vmu.meetings.committeeReportRequired=true: a committee meeting needs a report',
            'pass { report: <pointer> } (the report is stored by 07/22)', enforced)
        }
      }
      mark(enforced, 'vmu.meetings.minutesActionsRequired')
      if (K.minutesActionsRequired) {
        if (!(Array.isArray(actions) && actions.length)) {
          throw deny('VMU_MINUTES_ACTION_REQUIRED', 'vmu.meetings.minutesActionsRequired=true: closing needs at least one action item',
            'pass { actions: [ … ] } (vmu.meetings.minutesActionsRequired)', enforced)
        }
      }
      if (Array.isArray(actions)) m.minutes.actions = actions.slice()
      if (report) m.committeeReport = report
      markState(m, 'closed')
      m.closedAt = now
      m.wallMs = now - m.wallStartMs
      live.delete(m.id)
      archive.push(m)
      counters.closed += 1
      // minutes retention pruning (counted, never silent)
      // ★ G7 ② note: this key is marked ONLY when its switch is on. The enforced-consistency gate has a rule that a
      // receipt must distinguish "the key was in force" from "the key was at its permissive default" when the
      // behaviour differs — this key DROPS minutes only when > 0, so listing it at 0 would erase that distinction
      // (the other three close rails do not change behaviour at their defaults, so they are listed on consultation).
      if (K.minutesRetentionMs > 0) {
        mark(enforced, 'vmu.meetings.minutesRetentionMs')
        let dropped = 0
        while (archive.length && now - archive[0].openedAt > K.minutesRetentionMs) { archive.shift(); dropped += 1 }
        if (dropped) { counters.prunedMinutes += dropped; say({ type: 'meetings/minutes-pruned', at: now, dropped }) }
      }
      // ★ G7: the SAME `enforced` array appeared at the top level AND inside `receipt`. The serializer used to mark a
      // second sight of a shared reference as "[circular]", so this receipt carried `enforced:"[circular]"`. Copies
      // (not a shared reference) keep both fields as readable key lists even for a serializer that marks repeats.
      const receipt = { at: now, action: 'close', meeting: m.id, wallMs: m.wallMs, turns: m.turns, tokens: m.tokens, enforced: enforced.slice(), enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/closed', at: now, meeting: m.id, enforced: enforced.slice(), enforcedScope: ENFORCED_SCOPE })
      return { ok: true, meeting: m.id, wallMs: m.wallMs, turns: m.turns, tokens: m.tokens, receipt, enforced: enforced.slice(), enforcedScope: ENFORCED_SCOPE }
    },

    /** READ-ONLY quorum view (never mutates). */
    quorum({ meeting, at = null } = {}) {
      const m = requireMeeting(meeting, { readOnly: true })
      const enforced = ['vmu.meetings.attendanceMode']
      if (K.unansweredInDenominator) mark(enforced, 'vmu.meetings.unansweredInDenominator')
      if (K.quorumMin > 0) mark(enforced, 'vmu.meetings.quorumMin')
      if (K.quorumRatio > 0) mark(enforced, 'vmu.meetings.quorumRatio')
      void at
      return Object.assign({ ok: true, enforced, enforcedScope: ENFORCED_SCOPE }, quorumOf(m))
    },

    /** READ-ONLY: the receipt ring (bounded; drops counted). */
    receiptsView({ limit = 50 } = {}) {
      const capN = Number.isInteger(limit) && limit > 0 ? limit : 50
      const kept = receipts.slice(Math.max(0, receipts.length - capN)).map((r) => Object.assign({}, r))
      return { ok: true, receipts: kept, count: kept.length, available: receipts.length, dropped: receipts.length - kept.length, ringDropped: receiptDropped.n, enforcedScope: ENFORCED_SCOPE }
    },

    /** ★ PHASE 7: one meeting's OBSERVABLE state — who records (chair/secretary) and every motion's state. */
    /**
     * READ-ONLY: who may vote under the DECLARED voter seats. `restricted:false` means no seat rule is declared
     * (the framework imposes none); `restricted:true` + `ids` is the eligible list a ballot takes. This is the
     * SECOND consumer of the one criterion (`K.eligibleSeats`) — the first is the `vote()` gate above.
     */
    eligibleVoterIds() {
      if (!K.eligibleSeats.length) return { ok: true, restricted: false, seats: [], ids: [] }
      const roster = (members && typeof members.roster === 'function') ? (members.roster() || []) : []
      const ids = roster
        .filter((x) => x && String(x.state) === 'live' && K.eligibleSeats.includes(String(x.slot)))
        .map((x) => String(x.id))
      return { ok: true, restricted: true, seats: K.eligibleSeats.slice(), ids }
    },

    /**
     * READ-ONLY: one meeting's DECISION summary — motions with their votes — for a live meeting or an archived
     * one. The face used to have no summary at all (`meetingView` shows motion STATE, not votes), so a caller
     * asking "what was voted and how" had to reconstruct it from minutes.
     */
    summary({ meeting = null } = {}) {
      const id = String(meeting)
      const m = live.get(id) || archive.filter((x) => String(x.id) === id)[0] || null
      if (!m) {
        throw deny('VMU_NO_SUCH_OBJECT', 'no such meeting: ' + id,
          'live: ' + ([...live.keys()].sort().join(', ') || '(none)') + (archive.length ? '; archived: ' + archive.map((x) => String(x.id)).sort().join(', ') : ''))
      }
      const motions = (m.motions || []).map((mo) => {
        const voters = [...mo.votes.entries()].map(([memberId, value]) => ({ member: memberId, value }))
        return {
          id: mo.id, by: mo.by, kind: mo.kind, text: mo.text, status: mo.status, secondedBy: mo.secondedBy || null,
          tally: tallyOf(m.id, mo),
          votes: voters, abstentions: [...mo.abstain],
        }
      })
      return {
        ok: true, id: m.id, meeting: m.id, kind: m.kind, state: m.state, reason: m.reason === undefined ? null : m.reason,
        chair: m.chair || null, secretary: m.secretary || null,
        motions, votes: (m.minutes && Array.isArray(m.minutes.entries)) ? m.minutes.entries.filter((e) => e && e.kind === 'vote').length : 0,
        closedAt: m.closedAt || null,
      }
    },

    meetingView({ meeting = null } = {}) {
      const m = requireMeeting(meeting, { readOnly: true })
      // ★★★ SAME SELF-DESCRIPTION AS meeting.js status(): THE SERVICE REGISTRY IS THE PATH THE LIVE RUN ACTUALLY USED. Adding
      // loop/note only to meeting.js#status() would have left them with no consumer here - tools/meeting.js returns
      // primitive.status() for the PRIMITIVE registry (line 174) but THIS view for the SERVICE registry (line 182), and
      // vibe_v5_meeting creates service meetings. So the wording has to exist on both read faces or it is a mechanism
      // with no consumer for the only path that mattered.
      return { ok: true, meeting: m.id, state: m.state,
        loop: 'meeting-ask-answer',
        note: '★ motions/votes/state here describe the MEETING’s own ask()+answer()+motion cycle. A member answering a vibe_vmu_turn prompt is a DIFFERENT loop: read vibe_vmu_turn’s receipts (awaiting/memberPrompt/deliveryPath) for that one. hasDeliverSeam on the primitive face refers to open({deliver}), not to the turn loop’s deliveryPath.', reason: m.reason === undefined ? null : m.reason, chair: m.chair || null, secretary: m.secretary || null,
        motions: m.motions.map((x) => ({ id: x.id, by: x.by, kind: x.kind, status: x.status, secondedBy: x.secondedBy || null, withdrawnAt: x.withdrawnAt || null })) }
    },
    /** READ-ONLY self-report: WIRED list, the declared-but-unwired list (per key + reason), counters, values. */
    status() {
      const declared = declaredKeys()
      const wired = WIRED_KEYS.slice()
      const plannedKeys = declared.keys.filter((k) => !wired.includes(k))
      return {
        ok: true, apiVersion,
        wired, wiredCount: wired.length,
        plannedKeys, plannedCount: plannedKeys.length, plannedSource: declared.source,
        unwiredReasons: Object.fromEntries(plannedKeys.map((k) => [k, reasonFor(k)])),
        declaredMeetingKeys: declared.count,
        // `overlapWithWired` is `plannedKeys ∩ wired` (must be empty); `wiredNotDeclared` is the other direction.
        overlapWithWired: plannedKeys.filter((k) => wired.includes(k)),
        wiredNotDeclared: declared.count > 0 ? wired.filter((k) => !declared.keys.includes(k)) : [],
        complementOk: plannedKeys.length + wired.length === declared.count && plannedKeys.filter((k) => wired.includes(k)).length === 0,
        liveMeetings: [...live.keys()].sort(), archived: archive.length,
        // F28: a lapse is a first-class state an operator must be able to SEE (not infer from a missing meeting).
        lapsedMeetings: [...live.values()].filter((m) => m.lapse && !m.lapse.revokedAt).map((m) => m.id).sort(),
        // F51 (task-89): the durable-domain-marker SELF-DISCLOSURE, owned by `kernel/meetingmarker.js` —
        // `bound:false` means nothing is claimed about a previous process (the G7 `durableLog.bound` shape).
        durableMarker: marker.status(),
      // ROUND 12 / task-97: the `motion → box` binding is READABLE here (bound? who set it? when? how many changes?) -
      // unbound must be visible, exactly like `durableMarker.bound === false`.
      boxBinding: boxBinding.view(),
        lapses: Number(counters.lapses || 0), lapseRevocations: Number(counters.lapseRevocations || 0),
        // GAP-MTG-02 (D7): the tier is part of the observable state, and a contradictory declaration is visible
        // here BEFORE anyone hits the refusal (an operator must be able to see why a close would be refused).
        tier: K.tier, allowLight: K.allowLight, isLight: isLight(),
        tierConflict: isLight() && K.allowLight === false,
        counters: Object.assign({}, counters),
        refusals: Object.fromEntries([...refusals.keys()].sort().map((k) => [k, refusals.get(k)])),
        refusalsTotal: [...refusals.values()].reduce((a, b) => a + b, 0),
        keys: keysSnapshot(K),
        at: clock(),
        note: 'every key in `wired` changes an observable result (tests/vmu-meetings.test.mjs); `enforced[]` on each receipt lists only the keys that actually fired',
      }
    },

    /**
     * PERSISTENCE SEAM v1 (kernel/resume.js interface). TWO deliberate choices:
     *   · the DECLARED KEYS (`WIRED_KEYS` / the 47 `vmu.meetings.*` values in `K`) are NOT snapshotted — they
     *     come from settings/pack and are re-resolved on restore, so an old declaration can never overwrite a
     *     newer configuration (v5r-reader-a's rule for this layer);
     *   · the live meetings are serialised through a Map/Set-aware replacer, because their queues, mutes,
     *     warnings, interrupts and motion votes are Maps/Sets that plain JSON would flatten to `{}` in silence.
     */
    snapshot() {
      const ser = (v) => JSON.stringify(v, (k, val) => {
        if (val instanceof Map) return { __map: [...val.entries()] }
        if (val instanceof Set) return { __set: [...val.values()] }
        return val
      })
      const maxId = [...live.keys()].reduce((mx, id) => Math.max(mx, Number(String(id).replace(/[^0-9]/g, '')) || 0), 0)
      return { apiVersion, face: 'meetings', v: 1, at: clock(),
        data: { live: ser(live), archive: ser(archive), receipts: ser(receipts) },
        counters: { meeting: maxId },
        session: { counters: Object.assign({}, counters), receiptDropped: receiptDropped.n },
        skipped: [{ what: 'policy', why: 'the 47 declared vmu.meetings.* values come from settings/pack and are re-resolved on restore (a snapshot must not pin them)' },
          { what: 'members/ballot/wake/bus', why: 'injected seams are re-bound by the host, never serialised' },
          { what: 'refusals', why: 'the refusal counter map is a session-scoped diagnostic and is rebuilt from new refusals' }] }
    },

    /** Hydrate a `snapshot()`. Merge-safe while nothing is live, idempotent on the same snapshot, else named conflict. */
    restore(snap) {
      if (!snap || typeof snap !== 'object') return { ok: false, restored: false, code: RESUME_CODE.snapshotIncomplete, message: 'no snapshot to restore', missing: ['snapshot'] }
      if (snap.face !== 'meetings') return { ok: false, restored: false, code: RESUME_CODE.snapshotVersion, message: 'not a meetings snapshot (face=' + String(snap.face) + ')' }
      if (Number(snap.v) !== 1) return { ok: false, restored: false, code: RESUME_CODE.snapshotVersion, message: 'unsupported snapshot version ' + String(snap.v) }
      const d = snap.data
      const missing = ['live'].filter((k) => !d || d[k] === undefined)
      if (missing.length) return { ok: false, restored: false, code: RESUME_CODE.snapshotIncomplete, message: 'snapshot is missing ' + missing.join(', '), missing }
      if (live.size > 0) {
        const same = JSON.stringify(d) === JSON.stringify(api.snapshot().data)
        if (!same) return { ok: false, restored: false, code: RESUME_CODE.restoreConflict,
          message: 'this policy layer already holds ' + live.size + ' live meeting(s): refusing to half-overwrite them',
          hint: 'close them first, or restore into a fresh instance' }
      }
      const de = (s) => JSON.parse(String(s || '[]'), (k, val) => {
        if (val && typeof val === 'object') {
          if (Array.isArray(val.__map)) return new Map(val.__map)
          if (Array.isArray(val.__set)) return new Set(val.__set)
        }
        return val
      })
      live.clear()
      for (const [k, v] of de(d.live)) live.set(String(k), v)
      archive.length = 0
      const arch = de(d.archive)
      if (Array.isArray(arch)) for (const a of arch) archive.push(a)
      receipts.length = 0
      const rec = de(d.receipts)
      if (Array.isArray(rec)) for (const r of rec) receipts.push(r)
      const fromSnap = Number((snap.counters && snap.counters.meeting) || 0)
      const maxId = [...live.keys()].reduce((mx, id) => Math.max(mx, Number(String(id).replace(/[^0-9]/g, '')) || 0), 0)
      const countersIn = (snap.session && snap.session.counters) || {}
      for (const k of Object.keys(counters)) counters[k] = Number(countersIn[k] !== undefined ? countersIn[k] : counters[k]) || 0
      receiptDropped.n = Number((snap.session && snap.session.receiptDropped) || 0) || 0
      return { ok: true, restored: true, restored_items: ['live', 'archive', 'receipts'],
        counters: { meeting: Math.max(fromSnap, maxId) }, skipped: (snap.skipped || []).slice(),
        liveMeetings: [...live.keys()].sort() }
    },

    /**
     * GAP-MTG-02 (D7): the tier and its DERIVED predicate, exported so other faces can consult the SAME single
     * decision point instead of re-implementing "may this meeting write conclusions?". `truthWriteRefusal`
     * returns `null` when the write is allowed and a NAMED refusal otherwise (see the predicate above).
     */
    tier,
    isLight,
    truthWriteRefusal,
    /** F28: the bounded fallback — predicate, settle-by-name, revoke-with-a-reason (see the block above). */
    lapseDue,
    lapse,
    revokeLapse,
    /** GAP-MTG-05: the declared extension step, as a command rather than an implicit arithmetic branch. */
    extend,
  }

  function budgetVerdict(m, label, value, limit, evaluated) {
    return budgetVerdictOf({ K, capIn, counters, say, clock }, m, label, value, limit, evaluated)
  }
  function pushReceipt(receipt) {
    receipts.push(receipt)
    while (receipts.length > RING) { receipts.shift(); receiptDropped.n += 1 }
  }
  function declaredKeys() {
    const all = SETTING_DEFS.map(d => d.key).filter(key => key.startsWith('vmu.meetings.'))
    // ROUND 74 + the single-table refactor: SETTING_DEFS is CORE + PLANNED, so it already
    // carries the wired keys; WIRED_KEYS is kept as an explicit net because counting only the
    // generated planned set once silently became zero the moment the wired keys moved into the
    // schema (measured: nine module suites red). The union cannot lose a key either way.
    for (const k of WIRED_KEYS) if (!all.includes(k)) all.push(k)
    all.sort()
    return { keys: all, count: all.length, source: 'settings/schema.js (core + planned) + WIRED_KEYS' }
  }

  return api
}
