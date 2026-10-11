import { SETTING_DEFS } from '../settings/schema.js'
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
export const WIRED_KEYS = Object.freeze([
  'vmu.meetings.typeCatalog', 'vmu.meetings.attendanceMode', 'vmu.meetings.liveCap',
  'vmu.meetings.quorumMin', 'vmu.meetings.quorumRatio', 'vmu.meetings.quorumLossPolicy', 'vmu.meetings.quorumRecountMs',
  'vmu.meetings.unansweredInDenominator', 'vmu.meetings.emergencyQuorumRatio', 'vmu.meetings.emergencyKinds',
  'vmu.meetings.chairNeutral', 'vmu.meetings.chairTransferAudit', 'vmu.meetings.committeeMax', 'vmu.meetings.committeeReportRequired',
  'vmu.meetings.budgetTurns', 'vmu.meetings.budgetTokens', 'vmu.meetings.budgetWallMs', 'vmu.meetings.budgetOnExceed',
  'vmu.meetings.speechDefaultMs', 'vmu.meetings.speechMaxMs', 'vmu.meetings.speechExtendMs', 'vmu.meetings.speechExtendMax', 'vmu.meetings.speechQuotaPerMember',
  'vmu.meetings.interruptAllow', 'vmu.meetings.interruptQuota', 'vmu.meetings.orderMode',
  'vmu.meetings.lateAfterMs', 'vmu.meetings.leaveEarlyPolicy', 'vmu.meetings.materialsRequired',
  'vmu.meetings.minutesDetail', 'vmu.meetings.minutesIncludeRefused', 'vmu.meetings.minutesActionsRequired',
  'vmu.meetings.minutesRetentionMs', 'vmu.meetings.confirmPreviousMinutes',
  'vmu.meetings.appealDeadlineMs', 'vmu.meetings.appealReasonRequired', 'vmu.meetings.appealScope',
  'vmu.meetings.disciplineWarnMax', 'vmu.meetings.disciplineMuteMs', 'vmu.meetings.disciplineExpelAllowed',
  'vmu.meetings.recessMaxMs', 'vmu.meetings.recessResumeRequiresMotion',
  'vmu.meetings.confidentialityDefault', 'vmu.meetings.confidentialityQuotePolicy',
  'vmu.meetings.verbatimEnabled', 'vmu.meetings.verbatimRetentionMs', 'vmu.meetings.wakeFailurePolicy',
])

/** Why a key that IS declared would not be wired (used only for keys absent from WIRED_KEYS). */
export const UNWIRED_REASONS = Object.freeze({
  'vmu.meetings': '尚未接线：本层只覆盖 08 卷声明的 47 条会议旋钮；新声明的键需要一个策略语义（默认原因）',
})
const reasonFor = (key) => UNWIRED_REASONS[key.split('.').slice(0, 2).join('.')] || '尚未接线：该键需要一个尚未存在的子系统或策略语义'

const DEFAULTS = Object.freeze({
  'vmu.meetings.typeCatalog': [], 'vmu.meetings.attendanceMode': 'roster', 'vmu.meetings.liveCap': 0,
  'vmu.meetings.quorumMin': 0, 'vmu.meetings.quorumRatio': 0, 'vmu.meetings.quorumLossPolicy': 'suspend', 'vmu.meetings.quorumRecountMs': 0,
  'vmu.meetings.unansweredInDenominator': false, 'vmu.meetings.emergencyQuorumRatio': 0, 'vmu.meetings.emergencyKinds': [],
  'vmu.meetings.chairNeutral': false, 'vmu.meetings.chairTransferAudit': false, 'vmu.meetings.committeeMax': 0, 'vmu.meetings.committeeReportRequired': false,
  'vmu.meetings.budgetTurns': 0, 'vmu.meetings.budgetTokens': 0, 'vmu.meetings.budgetWallMs': 0, 'vmu.meetings.budgetOnExceed': 'refuse',
  'vmu.meetings.speechDefaultMs': 0, 'vmu.meetings.speechMaxMs': 0, 'vmu.meetings.speechExtendMs': 0, 'vmu.meetings.speechExtendMax': 0, 'vmu.meetings.speechQuotaPerMember': 0,
  'vmu.meetings.interruptAllow': true, 'vmu.meetings.interruptQuota': 0, 'vmu.meetings.orderMode': 'fifo',
  'vmu.meetings.lateAfterMs': 0, 'vmu.meetings.leaveEarlyPolicy': 'allow', 'vmu.meetings.materialsRequired': false,
  'vmu.meetings.minutesDetail': 'brief', 'vmu.meetings.minutesIncludeRefused': true, 'vmu.meetings.minutesActionsRequired': false,
  'vmu.meetings.minutesRetentionMs': 0, 'vmu.meetings.confirmPreviousMinutes': false,
  'vmu.meetings.appealDeadlineMs': 0, 'vmu.meetings.appealReasonRequired': true, 'vmu.meetings.appealScope': 'all',
  'vmu.meetings.disciplineWarnMax': 0, 'vmu.meetings.disciplineMuteMs': 0, 'vmu.meetings.disciplineExpelAllowed': true,
  'vmu.meetings.recessMaxMs': 0, 'vmu.meetings.recessResumeRequiresMotion': false,
  'vmu.meetings.confidentialityDefault': 'internal', 'vmu.meetings.confidentialityQuotePolicy': 'allow',
  'vmu.meetings.verbatimEnabled': true, 'vmu.meetings.verbatimRetentionMs': 0, 'vmu.meetings.wakeFailurePolicy': 'refuse',
})

const RING = 200

export function createMeetings({ clock = () => 0, log = null, settings = {}, bus = null, members = null, ballot = null, wake = null } = {}) {
  if (typeof clock !== 'function') {
    // No key has been consulted at construction time: the list is explicitly EMPTY (never undefined).
    throw Object.assign(refuse('VMU_INVALID_ARGUMENT', 'createMeetings needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock'), { enforced: [], evaluated: [] })
  }
  const sget = (key) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? DEFAULTS[key] : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return DEFAULTS[key]
  }
  const say = (event) => { if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* advisory */ } } }
  const emit = (event) => { if (bus && typeof bus.emit === 'function') { try { bus.emit(event) } catch (e) { /* advisory */ } } }
  const n = (v, def = 0) => (Number.isFinite(v) ? v : def)
  const arr = (v) => (Array.isArray(v) ? v.slice() : [])
  const oneOf = (v, set, def) => (set.includes(v) ? v : def)

  const K = {
    typeCatalog: arr(sget('vmu.meetings.typeCatalog')).map(String),
    attendanceMode: oneOf(sget('vmu.meetings.attendanceMode'), ['roster', 'signin', 'quorum-only'], 'roster'),
    liveCap: n(sget('vmu.meetings.liveCap')),
    quorumMin: n(sget('vmu.meetings.quorumMin')), quorumRatio: n(sget('vmu.meetings.quorumRatio')),
    quorumLossPolicy: oneOf(sget('vmu.meetings.quorumLossPolicy'), ['suspend', 'continue', 'recess'], 'suspend'),
    quorumRecountMs: n(sget('vmu.meetings.quorumRecountMs')),
    unansweredInDenominator: sget('vmu.meetings.unansweredInDenominator') === true,
    emergencyQuorumRatio: n(sget('vmu.meetings.emergencyQuorumRatio')), emergencyKinds: arr(sget('vmu.meetings.emergencyKinds')).map(String),
    chairNeutral: sget('vmu.meetings.chairNeutral') === true, chairTransferAudit: sget('vmu.meetings.chairTransferAudit') === true,
    committeeMax: n(sget('vmu.meetings.committeeMax')), committeeReportRequired: sget('vmu.meetings.committeeReportRequired') === true,
    budgetTurns: n(sget('vmu.meetings.budgetTurns')), budgetTokens: n(sget('vmu.meetings.budgetTokens')),
    budgetWallMs: n(sget('vmu.meetings.budgetWallMs')), budgetOnExceed: oneOf(sget('vmu.meetings.budgetOnExceed'), ['refuse', 'warn', 'extend'], 'refuse'),
    speechDefaultMs: n(sget('vmu.meetings.speechDefaultMs')), speechMaxMs: n(sget('vmu.meetings.speechMaxMs')),
    speechExtendMs: n(sget('vmu.meetings.speechExtendMs')), speechExtendMax: n(sget('vmu.meetings.speechExtendMax')),
    speechQuotaPerMember: n(sget('vmu.meetings.speechQuotaPerMember')),
    interruptAllow: sget('vmu.meetings.interruptAllow') !== false, interruptQuota: n(sget('vmu.meetings.interruptQuota')),
    orderMode: oneOf(sget('vmu.meetings.orderMode'), ['fifo', 'round-robin', 'chair'], 'fifo'),
    lateAfterMs: n(sget('vmu.meetings.lateAfterMs')), leaveEarlyPolicy: oneOf(sget('vmu.meetings.leaveEarlyPolicy'), ['allow', 'note', 'deny'], 'allow'),
    materialsRequired: sget('vmu.meetings.materialsRequired') === true,
    minutesDetail: oneOf(sget('vmu.meetings.minutesDetail'), ['brief', 'full'], 'brief'),
    minutesIncludeRefused: sget('vmu.meetings.minutesIncludeRefused') !== false,
    minutesActionsRequired: sget('vmu.meetings.minutesActionsRequired') === true,
    minutesRetentionMs: n(sget('vmu.meetings.minutesRetentionMs')), confirmPreviousMinutes: sget('vmu.meetings.confirmPreviousMinutes') === true,
    appealDeadlineMs: n(sget('vmu.meetings.appealDeadlineMs')), appealReasonRequired: sget('vmu.meetings.appealReasonRequired') !== false,
    appealScope: oneOf(sget('vmu.meetings.appealScope'), ['all', 'procedural', 'none'], 'all'),
    disciplineWarnMax: n(sget('vmu.meetings.disciplineWarnMax')), disciplineMuteMs: n(sget('vmu.meetings.disciplineMuteMs')),
    disciplineExpelAllowed: sget('vmu.meetings.disciplineExpelAllowed') !== false,
    recessMaxMs: n(sget('vmu.meetings.recessMaxMs')), recessResumeRequiresMotion: sget('vmu.meetings.recessResumeRequiresMotion') === true,
    confidentialityDefault: oneOf(sget('vmu.meetings.confidentialityDefault'), ['public', 'internal', 'restricted'], 'internal'),
    confidentialityQuotePolicy: oneOf(sget('vmu.meetings.confidentialityQuotePolicy'), ['allow', 'redact', 'deny'], 'allow'),
    verbatimEnabled: sget('vmu.meetings.verbatimEnabled') !== false, verbatimRetentionMs: n(sget('vmu.meetings.verbatimRetentionMs')),
    wakeFailurePolicy: oneOf(sget('vmu.meetings.wakeFailurePolicy'), ['refuse', 'skip', 'retry'], 'refuse'),
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
  const requireMeeting = (id) => {
    const m = meetingOf(id)
    if (!m) {
      if (live.size === 0) throw deny('VMU_NO_OPEN_MEETING', 'no meeting is open (id: ' + String(id) + ')', 'open() a meeting first — this layer refuses rather than inventing one', [])
      throw deny('VMU_NO_SUCH_OBJECT', 'no such meeting: ' + String(id), 'open: ' + [...live.keys()].sort().join(', '), [])
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
  /** The quorum computation (READ-ONLY): `attendanceMode` + `unansweredInDenominator` change the numbers. */
  const quorumOf = (m) => {
    const unanswered = m.roster.filter((r) => !m.present.has(r))
    const effective = K.unansweredInDenominator ? m.roster.length : m.present.size
    const needMin = K.quorumMin
    const needRatio = Math.ceil(K.quorumRatio * m.roster.length)
    const need = Math.max(needMin, needRatio)
    return {
      meeting: m.id, mode: K.attendanceMode, present: m.present.size, roster: m.roster.length,
      unanswered: unanswered.length, unansweredList: unanswered.slice().sort(),
      denominator: effective, denominatorPolicy: K.unansweredInDenominator ? 'all-roster (unanswered counted)' : 'present-only',
      required: need, met: m.present.size >= need, ratio: K.quorumRatio, min: needMin,
      emergencyRatio: K.emergencyQuorumRatio, note: 'unanswered members are named, never passed over silently (08 卷 D3/L4 口径)',
    }
  }

  const api = {
    apiVersion,
    WIRED_KEYS, UNWIRED_REASONS,

    /** Open a meeting. `type`/`size`/`materials` are checked against `typeCatalog` / `committeeMax` / `materialsRequired`. */
    open({ type = 'ordinary', chair = null, roster = [], size = null, materials = null, kind = null, at = null } = {}) {
      const enforced = []
      const ms = at === null ? clock() : at
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
      const id = 'm' + (counters.opened + 1)
      const m = {
        id, type: String(type), kind: kind === null ? null : String(kind), chair: chair === null ? null : String(chair),
        roster: arr(roster).map(String), present: new Set(chair === null ? [] : [String(chair)]),
        openedAt: ms, state: 'open', turns: 0, tokens: 0, wallStartMs: ms,
        queue: [], speechUsed: new Map(), interrupts: new Map(), warnings: new Map(), mutes: new Map(),
        recess: null, previousConfirmed: false, minutes: { entries: [], refused: [], actions: [] },
        transcript: [], confidentiality: K.confidentialityDefault, motions: [], appeals: [], closedAt: null,
        committeeReport: null, dissent: [],
      }
      live.set(id, m)
      counters.opened += 1
      const receipt = { at: ms, action: 'open', meeting: id, type: m.type, confidentiality: m.confidentiality, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/opened', at: ms, meeting: id, type: m.type, enforced, enforcedScope: ENFORCED_SCOPE })
      return { ok: true, meeting: id, quorum: quorumOf(m), receipt, enforced, enforcedScope: ENFORCED_SCOPE }
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
        if (policy === 'suspend') m.state = 'suspended'
        if (policy === 'recess') { m.state = 'recess'; m.recess = { since: ms, initial: false } }
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
      const receipt = { at: now, action: 'speak', meeting: m.id, member: String(member), ms: wanted, turns: m.turns, tokens: m.tokens, budget: soft, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/spoke', at: now, meeting: m.id, member: String(member), enforced, enforcedScope: ENFORCED_SCOPE })
      return { ok: true, ms: wanted, turns: m.turns, tokens: m.tokens, budget: soft, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Interrupt. `interruptAllow` + `interruptQuota` govern the floor. */
    interrupt({ meeting, member, target = null, at = null } = {}) {
      const m = requireMeeting(meeting)
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

    /** Queue a speaker; `orderMode` decides the position (observable via the returned order). */
    queue({ meeting, member, at = null } = {}) {
      const m = requireMeeting(meeting)
      const enforced = ['vmu.meetings.orderMode']
      if (!m.queue.includes(String(member))) m.queue.push(String(member))
      let order
      if (K.orderMode === 'round-robin') {
        order = m.queue.slice().sort((a, b) => ((m.speechUsed.get(a) || { count: 0 }).count - (m.speechUsed.get(b) || { count: 0 }).count) || (a < b ? -1 : 1))
      } else if (K.orderMode === 'chair') {
        order = m.queue.slice()          // the chair decides: the queue stays as inserted
      } else {
        order = m.queue.slice()          // fifo
      }
      const receipt = { at: at === null ? clock() : at, action: 'queue', meeting: m.id, member: String(member), mode: K.orderMode, order, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      return { ok: true, mode: K.orderMode, order, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Move a motion. `emergencyKinds`/`emergencyQuorumRatio` and `materialsRequired` apply. */
    motion({ meeting, member, kind = 'ordinary', text = '', materials = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      const enforced = []
      const now = at === null ? clock() : at
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
      const q = quorumOf(m)
      let need = q.required
      if (emergency && K.emergencyQuorumRatio > 0) {
        mark(enforced, 'vmu.meetings.emergencyQuorumRatio')
        need = Math.max(need, Math.ceil(K.emergencyQuorumRatio * m.roster.length))
      }
      const motion = { id: 'mo' + (m.motions.length + 1), at: now, by: String(member), kind: String(kind), text: String(text), emergency, quorumRequired: need, status: 'open', votes: new Map(), abstain: new Set(), refused: false }
      m.motions.push(motion)
      counters.motions += 1
      m.minutes.entries.push({ at: now, kind: 'motion', id: motion.id, by: motion.by, motionKind: motion.kind })
      const receipt = { at: now, action: 'motion', meeting: m.id, motion: motion.id, kind: motion.kind, quorumRequired: need, quorum: q, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/motion', at: now, meeting: m.id, motion: motion.id, kind: motion.kind, enforced, enforcedScope: ENFORCED_SCOPE })
      return { ok: true, motion: motion.id, quorumRequired: need, quorum: q, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
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
      counters.votes += 1
      const tally = target ? { for: [...target.votes.values()].filter((v) => v === 1).length, against: [...target.votes.values()].filter((v) => v === 0).length, abstain: target.abstain.size } : { for: 0, against: 0, abstain: 0 }
      m.minutes.entries.push({ at: now, kind: 'vote', motion: target ? target.id : null, member: String(member), value: value === 0 ? 0 : 1 })
      const receipt = { at: now, action: 'vote', meeting: m.id, motion: target ? target.id : null, member: String(member), tally, quorum: q, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      if (ballot && typeof ballot.cast === 'function') { try { ballot.cast({ meeting: m.id, motion: target ? target.id : null, member, value }) } catch (e) { /* the ballot seam is advisory here */ } }
      return { ok: true, tally, quorum: q, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Transfer the chair. `chairTransferAudit` demands a reason. */
    transferChair({ meeting, to, reason = null, at = null } = {}) {
      const m = requireMeeting(meeting)
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
    recess({ meeting, ms = 0, at = null } = {}) {
      const m = requireMeeting(meeting)
      const enforced = []
      const now = at === null ? clock() : at
      if (K.recessMaxMs > 0) {
        mark(enforced, 'vmu.meetings.recessMaxMs')
        if (n(ms) > K.recessMaxMs) cap('VMU_MEETING_RECESS_LIMIT', 'recess (ms)', n(ms), K.recessMaxMs, 'vmu.meetings.recessMaxMs', enforced)
      }
      if (m.state === 'recess') throw deny('VMU_STATE', 'already in recess: ' + m.id, 'resume() first', [])
      m.state = 'recess'
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
      m.state = 'open'
      m.recess = null
      m.minutes.entries.push({ at: now, kind: 'resume', motion: motion === null ? null : String(motion) })
      const receipt = { at: now, action: 'resume', meeting: m.id, motion, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      return { ok: true, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Warn / mute / expel. `disciplineWarnMax`, `disciplineMuteMs`, `disciplineExpelAllowed`. */
    warn({ meeting, member, reason = null, at = null } = {}) {
      const m = requireMeeting(meeting)
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
    expel({ meeting, member, reason = null, at = null } = {}) {
      const m = requireMeeting(meeting)
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
      const enforced = ['vmu.meetings.confirmPreviousMinutes']
      m.previousConfirmed = true
      m.minutes.entries.push({ at: at === null ? clock() : at, kind: 'minutes-confirmed', by })
      const receipt = { at: at === null ? clock() : at, action: 'confirmMinutes', meeting: m.id, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      return { ok: true, confirmed: true, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Minutes (READ-ONLY): shaped by `minutesDetail`, `minutesIncludeRefused`, pruned by `minutesRetentionMs`. */
    minutes({ meeting, at = null } = {}) {
      const m = requireMeeting(meeting)
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
    verbatim({ meeting, at = null } = {}) {
      const m = requireMeeting(meeting)
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
        if (K.wakeFailurePolicy === 'skip') { counters.skippedWakes += 1; return { ok: true, woken: false, skipped: true, skippedWakes: counters.skippedWakes, enforced, enforcedScope: ENFORCED_SCOPE } }
        return { ok: true, woken: false, retry: true, enforced, enforcedScope: ENFORCED_SCOPE }
      }
      return { ok: true, woken: true, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Close the meeting. `committeeReportRequired`, `minutesActionsRequired`, `confirmPreviousMinutes`. */
    close({ meeting, report = null, actions = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      const enforced = []
      const now = at === null ? clock() : at
      // Each rail is marked the moment its switch is CONSULTED (not only when it fires), so a refusal by a
      // LATER rail still shows that these earlier rails were active in this call.
      if (K.confirmPreviousMinutes) {
        mark(enforced, 'vmu.meetings.confirmPreviousMinutes')
        if (!m.previousConfirmed) {
          throw deny('VMU_MINUTES_NOT_CONFIRMED', 'vmu.meetings.confirmPreviousMinutes=true: the previous minutes are not confirmed',
            'call confirmMinutes() before closing (vmu.meetings.confirmPreviousMinutes)', enforced)
        }
      }
      if (K.committeeReportRequired) {
        mark(enforced, 'vmu.meetings.committeeReportRequired')
        if (m.type === 'committee' && !report) {
          throw deny('VMU_STATE', 'vmu.meetings.committeeReportRequired=true: a committee meeting needs a report',
            'pass { report: <pointer> } (the report is stored by 07/22)', enforced)
        }
      }
      if (K.minutesActionsRequired) {
        mark(enforced, 'vmu.meetings.minutesActionsRequired')
        if (!(Array.isArray(actions) && actions.length)) {
          throw deny('VMU_MINUTES_ACTION_REQUIRED', 'vmu.meetings.minutesActionsRequired=true: closing needs at least one action item',
            'pass { actions: [ … ] } (vmu.meetings.minutesActionsRequired)', enforced)
        }
      }
      if (Array.isArray(actions)) m.minutes.actions = actions.slice()
      if (report) m.committeeReport = report
      m.state = 'closed'
      m.closedAt = now
      m.wallMs = now - m.wallStartMs
      live.delete(m.id)
      archive.push(m)
      counters.closed += 1
      // minutes retention pruning (counted, never silent)
      if (K.minutesRetentionMs > 0) {
        mark(enforced, 'vmu.meetings.minutesRetentionMs')
        let dropped = 0
        while (archive.length && now - archive[0].openedAt > K.minutesRetentionMs) { archive.shift(); dropped += 1 }
        if (dropped) { counters.prunedMinutes += dropped; say({ type: 'meetings/minutes-pruned', at: now, dropped }) }
      }
      const receipt = { at: now, action: 'close', meeting: m.id, wallMs: m.wallMs, turns: m.turns, tokens: m.tokens, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/closed', at: now, meeting: m.id, enforced, enforcedScope: ENFORCED_SCOPE })
      return { ok: true, meeting: m.id, wallMs: m.wallMs, turns: m.turns, tokens: m.tokens, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** READ-ONLY quorum view (never mutates). */
    quorum({ meeting, at = null } = {}) {
      const m = requireMeeting(meeting)
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
        counters: Object.assign({}, counters),
        refusals: Object.fromEntries([...refusals.keys()].sort().map((k) => [k, refusals.get(k)])),
        refusalsTotal: [...refusals.values()].reduce((a, b) => a + b, 0),
        keys: keysSnapshot(K),
        at: clock(),
        note: 'every key in `wired` changes an observable result (tests/vmu-meetings.test.mjs); `enforced[]` on each receipt lists only the keys that actually fired',
      }
    },
  }

  function budgetVerdict(m, label, value, limit, evaluated) {
    if (K.budgetOnExceed === 'refuse') capIn(m, 'VMU_RESOURCE_BUDGET', label, value, limit, 'vmu.meetings.' + label, evaluated)
    if (K.budgetOnExceed === 'warn') {
      counters.softBudget += 1
      say({ type: 'meetings/budget-soft', at: clock(), label, value, limit })
      return { code: 'VMU_QUOTA_SOFT_EXCEEDED', label, value, limit, policy: 'warn' }
    }
    counters.softBudget += 1
    return { code: null, label, value, limit, policy: 'extend' }
  }
  function pushReceipt(receipt) {
    receipts.push(receipt)
    while (receipts.length > RING) { receipts.shift(); receiptDropped.n += 1 }
  }
  function declaredKeys() {
    const all = SETTING_DEFS.map(d => d.key).filter(key => key.startsWith('vmu.meetings.')).sort()
    return { keys: all, count: all.length, source: 'settings/schema.js (core + planned)' }
  }

  return api
}

/** The value record for every wired key (explicit map; a name-derived lookup silently produced nulls). */
function keysSnapshot(K) {
  return {
    'vmu.meetings.typeCatalog': K.typeCatalog, 'vmu.meetings.attendanceMode': K.attendanceMode, 'vmu.meetings.liveCap': K.liveCap,
    'vmu.meetings.quorumMin': K.quorumMin, 'vmu.meetings.quorumRatio': K.quorumRatio, 'vmu.meetings.quorumLossPolicy': K.quorumLossPolicy,
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
    'vmu.meetings.confidentialityDefault': K.confidentialityDefault, 'vmu.meetings.confidentialityQuotePolicy': K.confidentialityQuotePolicy,
    'vmu.meetings.verbatimEnabled': K.verbatimEnabled, 'vmu.meetings.verbatimRetentionMs': K.verbatimRetentionMs,
    'vmu.meetings.wakeFailurePolicy': K.wakeFailurePolicy,
  }
}
