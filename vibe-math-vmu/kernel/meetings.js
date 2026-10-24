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

// ★ R25 (live run 17, the institute's own report): the kernel has always accepted the actor under three
// spellings (`actor`, `by`, `member` — `who = actor ?? by ?? member`), but every chair rail hint named only
// `actor`, so a caller who had passed `member:` was told to pass a parameter it had already passed. One phrase,
// used by every rail, so the vocabulary cannot drift rail by rail.
const ACTOR_ALIASES = 'the actor is accepted as actor, by or member (the three names are the same person)'

export function createMeetings({ clock = () => 0, log = null, settings = {}, bus = null, members = null, ballot = null, wake = null, durable = null, boxFor = null, foreignIds = null } = {}) {
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
  /**
   * A MEETING TIME, AS A NUMBER OF MILLISECONDS. `at` used to be stored exactly as it arrived, so an ISO-8601 string
   * from a model silently became a STRING `openedAt` (and `ms + budgetWallMs` string-CONCATENATED, turning a wall bound
   * into `"2026-10-24T10:00:00+08:001800000"`). Models do pass ISO strings — the rule for scheduling says "a time", not
   * "epoch milliseconds" — so the framework accepts both forms and REFUSES anything else by name. Coercing a bad value
   * to 0 (what `n()` above does) would schedule the meeting in 1970, i.e. "open now" with a receipt claiming a start
   * time; that is the silent fake success this project forbids.
   */
  const atMs = (value, what = 'at') => {
    if (Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const trimmed = value.trim()
      // ★ R2 of the phase-12 live run: a JSON round-trip turns a number into a STRING, and the live run passed
      // `at: "1792779800000"` — a perfectly usable epoch-millisecond instant that was refused. A time that can be
      // recovered exactly must not be refused for its spelling; `Date.parse` alone does not recognise it.
      if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        const asNumber = Number(trimmed)
        if (Number.isFinite(asNumber)) return asNumber
      }
      const parsed = Date.parse(trimmed)
      if (Number.isFinite(parsed)) return parsed
      throw deny('VMU_INVALID_ARGUMENT', what + ' is not a usable time: "' + trimmed + '"',
        'pass epoch milliseconds (number or numeric string), or an ISO-8601 timestamp such as "2026-10-24T10:00:00+08:00"', [])
    }
    throw deny('VMU_INVALID_ARGUMENT', what + ' must be epoch milliseconds or an ISO-8601 string; got ' + (value === null ? 'null' : typeof value),
      'pass epoch milliseconds, or an ISO-8601 timestamp string', [])
  }
  /**
   * ROUND 13 (phase 12): a MILLISECOND read with an absent-value answer, expressed as `(key, default)` so the
   * generated settings table can RECOVER the default. `--check` refused the first version of `extendCeilingMs`,
   * which wrote the default inside an IIFE (`raw === undefined ? 14400000 : n(raw)`): the collector reads an
   * absent-value literal off the shape of the call, and an IIFE has no shape to read, so the key would have been
   * emitted with `type:'object'` - a declaration contradicting its own numeric default (exactly the failure class
   * the OBJECT_FALLBACKS invariant exists to stop). The fix is to WRITE the default where it can be read, not to
   * name a fallback for it: the type here is knowable, so pretending it is not would hide a real fact.
   * Same absent-vs-value distinction as every other reader in this table: unset (undefined/null/'') ⇒ the default;
   * a declared 0 is a VALUE (it then clamps up to the floor), not "use the default".
   */
  const msOr = (key, def) => {
    const raw = sget(key)
    return (raw === undefined || raw === null || raw === '') ? def : n(raw)
  }
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
    // ★ A4 「临时工：…**默认不参与会议**」: the DECLARED NON-ATTENDING seats. Empty = the framework imposes no
    // seat rule (zero mechanism); a pack declares which slots its institution keeps out of meetings (v5r:
    // `temp`). ONE consumer: the `attend()` gate below. The vocabulary is the PACK's — this file only compares
    // the roster's `slot`, exactly the way `eligibleSeats` (vote) and `capUniverse` (denominator) already do.
    attendDeniedSeats: arr(sget('vmu.meetings.attendDeniedSeats')).map(String),
    liveCap: n(sget('vmu.meetings.liveCap')),
    quorumMin: n(sget('vmu.meetings.quorumMin')), quorumRatio: n(sget('vmu.meetings.quorumRatio')),
    // ★ PHASE 12 / LIVE RUN 7 item f: the institution's quorum RULE, read here so `quorum().met` can honour it (the
    // ballot face read it already; the meeting face did not, which is why 「未到齐 ⇒ 法定人数不成立」 had no landing
    // point). Unset keeps the declared default; the value is echoed in `quorum().rule`/`metPolicy`/`metBecause`.
    quorumRule: (() => { const v = sget('vmu.meetings.quorumRule'); return v === undefined || v === null ? 'm-unanimous' : String(v) })(),
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
    // ★ PHASE 12: the three rails behind 「会议只能由院士召开和关闭、延长」. The CAPABILITY is here (a named refusal
    // that names who may act); the DECLARATION that a real institute has a chair-only convene is the PACK's job
    // (`packs/v5r/settings/defaults.json`). All three default OFF so no existing caller changes behaviour — the
    // v5r pack turns them on, which is what makes them have a consumer (a key nobody sets is a mechanism with none).
    conveneRequiresChair: sget('vmu.meetings.conveneRequiresChair') === true,
    closeRequiresChair: sget('vmu.meetings.closeRequiresChair') === true,
    extendRequiresChair: sget('vmu.meetings.extendRequiresChair') !== false,
    // ROUND 12: the ceiling for a meeting-level extension. `hardLimitMs` itself has no off switch (its contract says
    // so); extension therefore adds a DECLARED step to a meeting's own bound, never removes the ceiling. R13: read
    // through `msOr` so the default is recoverable by the settings-table generator (see that helper's note).
    extendCeilingMs: Math.min(86400000, Math.max(3000000, msOr('vmu.meetings.extendCeilingMs', 14400000))),
    // ★★ PHASE 12 D1 — 预约时间 + 到点人未齐的等待阶段（v5r 规则：「院士可以预约会议的召开时间（预约时负责
    // 人可设置预约时间、等待阶段、未到齐超时自决）」）。
    // ★ 能力在这里（内核状态机 + 具名拒），**时长与权轨是设置**。三个键的关系要说清，否则读者会把它们当成重复：
    //   · `scheduleAllowed`  —— 能力闸：false ⇒ `open({ at: 未来 })` 名拒「不能预约」，而不是把预约悄悄当成立即召开；
    //   · `waitOnDueMs`      —— 到点但法定人数不足时最多等多久；超时后**不替院士决定**，只把 `waitDecisionDue` 置真；
    //   · `waitDecisionRequiresChair` —— 「超时后接着开／散会／休会」只能由该会主席决定（proceed 的权轨）。
    // ★ 全为离线可测的纯状态转移：到点（clock 越过 scheduledFor）不靠定时器，而是在下一次读写该会议时惰性结算
    //   （`syncMeeting`）。理由与本仓既有的 lapse 一致：**没有后台定时器**，就不会有"进程被杀后会议永远卡在等待"。
    scheduleAllowed: sget('vmu.meetings.scheduleAllowed') !== false,
    waitOnDueMs: Math.min(86400000, Math.max(0, msOr('vmu.meetings.waitOnDueMs', 300000))),
    waitDecisionRequiresChair: sget('vmu.meetings.waitDecisionRequiresChair') !== false,
    // ★★ R3 OF THE PHASE-12 LIVE RUN: 「未到齐」的判据是**出勤完整性**，不是表决下限。
    // 实测：三个会议的 quorum 块全是 `min:0, required:0, met:true`（框架默认 quorumMin=0＝不设下限），
    // 于是「到点未到齐 ⇒ 等待」永远不成立，`waiting` 状态不可达 ⇒ 「未到齐超时自决」这条规则整条空转。
    // 这两个概念本来就不同：法定人数决定"能不能表决"，到齐与否决定"要不要等"。规则原文说的是后者。
    //   · true（默认）—— 名册上有人没到 ⇒ waiting；全部到齐才开场；
    //   · false        —— 只要达到法定人数即可开场（旧行为，供"不等齐"的部署选择）。
    waitForAll: sget('vmu.meetings.waitForAll') !== false,
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
  let lastSweep = null           // the LAST `sweepDue` pass (reported by status(); see live run 10, finding F)
  // ★ LIVE RUN 13 (the institute's own report, ⑦.5): `status()` replayed the LAST pass only, so a transition from an
  // earlier pass was invisible ('痕迹只挂在 beat 回执上'). A bounded history keeps those traces readable without turning
  // a receipt into a log: the most recent 20 transitions, with a count of what the bound dropped.
  const sweepHistory = []
  let sweepHistoryDropped = 0
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
  /** The meeting's OWN wall bound. `open()` freezes `wallLimitMs = hardLimitMs`; `extendWall()` raises it. A meeting
   *  opened by an older writer (or by a test) has no field, and then the configured hard limit is the bound — that
   *  fallback is why `extendWall` could be added without rewriting one existing meeting record. */
  const wallLimitOf = (m) => (m && Number.isFinite(m.wallLimitMs)) ? m.wallLimitMs : K.hardLimitMs
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
    // ★ PHASE 12 D1: EVERY TOUCH settles the scheduled start first (see `syncMeeting`), so a caller never sees a
    // meeting as "still scheduled" after its time has passed merely because nothing else happened to run.
    syncMeeting(m, opts.at === undefined ? null : opts.at)
    // ★ A SCHEDULED / WAITING MEETING IS NOT RUNNING. Reading it is fine (that is how a caller finds out), but acting
    // in it is refused BY NAME with the way out — before this rail an agent could speak into a meeting whose start
    // time had not arrived, which is precisely what "预约" is supposed to prevent.
    // ★ ONE ACT IS EXEMPT AND IT IS THE ONE THE WAIT EXISTS FOR: `attend`. Blocking it made 等待 a dead end — the
    // quorum could only ever shrink relative to the roster, nothing else may act in the meeting, and the chair's
    // `proceed()` was the only exit; the "wait a bit for the latecomers" state could not in fact wait for a latecomer
    // to arrive. Callers pass `allowPending` deliberately (see `attend`), so the exemption is explicit at the call
    // site, not a silent hole in this rail.
    if (opts.readOnly !== true && opts.allowPending !== true && (m.state === 'scheduled' || m.state === 'waiting')) {
      const q = quorumOf(m)
      if (m.state === 'scheduled') {
        throw deny('VMU_STATE', 'meeting ' + m.id + ' is SCHEDULED for ' + new Date(m.scheduledFor).toISOString() + ' and has not started: ' + String(opts.what || 'this act') + ' is refused',
          'it starts by itself when the clock reaches that time (vmu.meetings.scheduleAllowed); reads (status/summary/meetingView/quorum) work now', [])
      }
      // ★ LIVE RUN 13 (the institute's own report, item 3 under "与规则不符"): the message quoted the FLOOR as the reason
      // ('quorum requires 0') while refusing — the floor was MET, and the real blocker was the INSTITUTION rule (unanimity).
      // It now names the rule that is actually unmet and prints the floor separately, so the two can never be confused.
      throw deny('VMU_STATE', 'meeting ' + m.id + ' is WAITING for its scheduled start: ' + q.present + '/' + q.roster + ' present; the floor (quorum) requires ' + q.required + ' and ' + (q.met === true ? 'IS met' : 'is NOT met') + ', but the institution rule is not: ' + ((q.unanimity && q.unanimity.because) ? String(q.unanimity.because) : 'not everyone has attended or voted yet') + ' — ' + String(opts.what || 'this act') + ' is refused',
        m.waitDecisionDue === true
          ? 'the wait has EXPIRED: the chair decides — proceed({ meeting, actor | by | member }) / lapse({ meeting, by, reason }) / recess({ meeting, by }) (the three names for the actor are the same thing)'
          : 'the wait is still running (vmu.meetings.waitOnDueMs): the chair may proceed early, or wait it out - ' + ACTOR_ALIASES, [])
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
  /**
   * ★ PHASE 12 / live run 7 (agent feedback item c): `waitDueAt` — WHEN the chair's decision falls due.
   *
   * The waiting receipt carried `waitStartedAt` and a boolean `waitDecisionDue`, so a reader could see that the wait was
   * running but never WHEN it ends — the rule's 「超过一定时间仍未到齐」 had no landing point on any read face, and the
   * agent reported the missing field by name. It is DERIVED from the two facts that already exist (`waitStartedAt` and
   * the declared `vmu.meetings.waitOnDueMs`), so this adds no state: a value that cannot be re-derived would be a second
   * copy of the truth.
   */
  const waitDueOf = (m) => {
    if (!m || m.state !== 'waiting' || !Number.isFinite(m.waitStartedAt)) return null
    return K.waitOnDueMs > 0 ? m.waitStartedAt + K.waitOnDueMs : null
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
    //
    // ★ ROUND 12 (phase 12, rule D12): 「表决人数下限 = min(用户设置数, 院士+常驻研究员数)」. The old third term was
    // `m.present.size`, which made the "lower bound" vacuous: required could never exceed the people already in the
    // room, so with a cap in force quorum was ALWAYS met on arrival and one voter could carry a closure vote. Measured
    // before this change: roster 2, cap 3, one present ⇒ required 1, met true, `close()` succeeded on one voice.
    // The min's right-hand side is now the ELIGIBLE UNIVERSE — the members who could ever vote, i.e. the roster
    // intersected with `vmu.meetings.eligibleSeats` (v5r: chair + member; temps hold slot `temp` and are therefore
    // excluded, which is exactly the rule's 「院士+常驻研究员」). Presence is no longer part of the formula: a lower
    // bound that shrinks to whoever showed up is not a lower bound. At `quorumCap: 0` nothing is capped.
    const needUncapped = Math.max(needMin, needRatio)
    const capUniverse = (() => {
      if (!m.roster.length) return { n: 0, source: 'empty-roster' }
      if (!K.eligibleSeats.length) return { n: m.roster.length, source: 'roster (no voter seats declared)' }
      const list = (members && typeof members.roster === 'function') ? (members.roster() || []) : []
      const seatOf = new Map(list.filter(Boolean).map((x) => [String(x.id), String(x.slot)]))
      const eligible = m.roster.filter((r) => K.eligibleSeats.includes(seatOf.get(String(r))))
      // A roster id the members service cannot resolve is COUNTED AS ELIGIBLE: shrinking the denominator on a lookup
      // miss would quietly make the meeting easier to close, which is the failure direction that matters.
      const unresolved = m.roster.filter((r) => !seatOf.has(String(r))).length
      return { n: eligible.length + unresolved, source: unresolved ? 'seats + unresolved roster ids' : 'seats' }
    })()
    const need = K.quorumCap > 0 ? Math.min(needUncapped, K.quorumCap, capUniverse.n) : needUncapped
    // ★ PHASE 12 / LIVE RUN 7 (agent feedback item f): `met` was `present.size >= need`, so with the floor at 0 it was
    // ALWAYS true — "未到齐" (present 1 of roster 2) and "法定人数" were decoupled readings of one meeting, and the
    // accepted rule 「未到齐则法定人数不成立」 had no landing point. ★ FIRST ATTEMPT (kept as a recorded lesson): folding
    // the institution's unanimity rule INTO `met` deadlocked the face — `met` gates `vote()`, so requiring "nobody
    // unanswered" before anyone may cast a vote means the house can never fill up. The two questions are therefore kept
    // APART and BOTH NAMED: `met` stays the FLOOR (may this house transact at all), while `unanimity.met` is the
    // institution's rule (rule `vmu.meetings.quorumRule`, which this face did not read before this change).
    const allIn = unanswered.length === 0
    const unanimityRule = K.quorumRule === 'm-unanimous' || K.quorumRule === 'all-unanimous'
    const met = m.present.size >= need
    return {
      cap: K.quorumCap, capUniverse: capUniverse.n, capUniverseSource: capUniverse.source,
      capPolicy: K.quorumCap > 0 ? 'min(quorumMin/quorumRatio need, vmu.meetings.quorumCap, eligible members in the roster)' : 'uncapped (vmu.meetings.quorumCap = 0)',
      meeting: m.id, mode: K.attendanceMode, present: m.present.size, roster: m.roster.length,
      // ★★ PHASE 12 / R22 (the institute's own run-17 report, item 3): `present:1` at open() while nobody had
      // attended — because open() seats the chair in the present set. The number is right about "may this house
      // transact", but a reader took it as "one member showed up", and no field said otherwise. The breakdown is
      // reported so the chair's automatic membership cannot be mistaken for an arrival. Derived, never stored.
      presentBreakdown: (() => {
        const chairIn = m.chair !== null && m.chair !== undefined && m.present.has(String(m.chair))
        return { chairSeated: chairIn, attended: m.present.size - (chairIn ? 1 : 0), chair: m.chair === undefined ? null : m.chair }
      })(),
      presentNote: 'present = chair (seated by open(), so the house can transact at all) + members who attended or voted; presentBreakdown splits them, and `unanswered` names who has done neither',
      unanswered: unanswered.length, unansweredList: unanswered.slice().sort(),
      denominator: effective, denominatorPolicy: K.unansweredInDenominator ? 'all-roster (unanswered counted)' : 'present-only',
      required: need, met: met, ratio: K.quorumRatio, min: needMin,
      // ★ LIVE RUN 7 item f: the FLOOR and the RULE are separate, named readings. `metPolicy` says what `met` answers
      // (`met` gates `vote()`, so it may only ever be the floor question); `unanimity` carries the institution's rule
      // (rule `vmu.meetings.quorumRule`), which is what 「未到齐 ⇒ 法定人数不成立」 lands on.
      rule: K.quorumRule,
      floorMet: met,
      metIs: 'the FLOOR question only (present >= required) — it is NOT the institution rule; with required=0 it is true while nobody has attended. Read unanimity.met / the pack rule for the real threshold',
      metPolicy: 'met = (present >= required) — the FLOOR question (may this house transact at all); it deliberately '
        + 'does NOT fold in the institution\'s unanimity rule, because `met` gates vote() and requiring full attendance '
        + 'before the first vote would deadlock the house. The rule is `unanimity` below.',
      unanimity: {
        rule: K.quorumRule, ruleIsUnanimity: unanimityRule,
        met: unanimityRule ? (met && allIn) : met,
        unanswered: unanswered.slice().sort(),
        policy: unanimityRule
          ? 'the institution\'s rule is unanimity: the quorum counts as established only when EVERY roster member has '
            + 'attended or voted AND the floor is met (「未到齐则法定人数不成立」)'
          : 'the institution\'s rule (' + String(K.quorumRule) + ') is not unanimity: only the floor applies',
        because: unanimityRule
          ? (met && allIn ? 'every roster member attended or voted and the floor is met'
            : (met ? 'the floor is met, but not everyone has attended or voted yet: ' + unanswered.slice().sort().join(', ')
              : 'the floor is not met: present ' + m.present.size + ' < required ' + need))
          : (met ? null : 'the floor is not met: present ' + m.present.size + ' < required ' + need),
      },
      // ★ LIVE RUN 7 (agent feedback item d/f): `required:0` with no derivation read as "no floor at all". The rule's
      // formula is 「min(用户设置数, 院士+常驻研究员数)」, and every input is already in scope here, so the derivation is
      // reported instead of left for a reader to infer: a 0 now says WHICH input was 0.
      voteFloor: {
        setting: needMin, ratioNeed: needRatio, eligibleUniverse: capUniverse.n, cap: K.quorumCap,
        effective: need,
        formula: K.quorumCap > 0
          ? 'min(max(quorumMin, ceil(quorumRatio*roster)), quorumCap, eligible universe)'
          : 'max(quorumMin, ceil(quorumRatio*roster)) [uncapped: quorumCap = 0]',
        zeroBecause: need === 0
          ? (needMin === 0 && needRatio === 0 ? 'vmu.meetings.quorumMin and quorumRatio are both 0: the deployment declared no floor' : null)
          : null,
        // ★★ PHASE 12 / R23 (the institute's own run-17 report, item 7): `effective:0` reads as "the bar is very
        // low" when it means "this deployment set no bar at all". The cause is named so a reader does not have to
        // infer it from `zeroBecause` existing or not.
        effectiveNote: need === 0
          ? 'NO lower bound is in force (effective 0 means the bar is ABSENT, not cheap): read zeroBecause for which input was 0'
          : 'the lower bound for a ruling is min(max(quorumMin, ceil(quorumRatio*roster)), quorumCap, eligible universe) — see formula',
      },
      emergencyRatio: K.emergencyQuorumRatio,
      // ★ G7 (real machine): "unanswered" used to mean "not in the PRESENT set", so after two votes it still listed a
      // member who had just voted (present stayed at 1) — a caller read that as "one person has not decided yet". The
      // present set now also records VOTERS (vote() adds the voter), and this policy field says so in words.
      unansweredPolicy: 'members who have neither attended nor voted',
      note: 'unanswered members are named, never passed over silently (08 卷 D3/L4 口径); voting counts as participation',
    }
  }

  /**
   * ★★ PHASE 12 D1 — THE SCHEDULED START, EVALUATED LAZILY ON THE NEXT TOUCH.
   *
   * WHY LAZY AND NOT A TIMER: this face owns no background timer anywhere (the same reason `lapse` is computed on
   * demand). A timer would mean "a meeting that must start while nobody is looking", and a process restart would
   * leave it stranded — the failure mode the whole project refuses. So the clock is read whenever the meeting is
   * touched and the transition is applied then, which is deterministic, replayable and unit-testable without fakes.
   *
   * THE THREE TRANSITIONS, and what they are NOT:
   *   scheduled --(due, quorum met)--> open      (a scheduled meeting is NOT already running; it cannot be spoken in)
   *   scheduled --(due, quorum short)--> waiting (still not running; `waitStartedAt` records when the wait began)
   *   waiting   --(waitOnDueMs elapsed)--> waiting + waitDecisionDue=true
   * ★ THE LAST ONE DELIBERATELY CHANGES NOTHING ELSE. The rule says 「此时院士自行决定怎么做」 — so the framework
   * does NOT auto-open, auto-lapse or auto-extend; it only makes the deadline VISIBLE on every read face and lets
   * `proceed()` (chair-gated) be the one way out. Deciding for the chair would be a mechanism with no authorization.
   *
   * ★ IT REPORTS WHAT IT DID. `syncMeeting` returns the transition it applied (or null) so a caller can tell "the
   * meeting was already open" from "this touch is what opened it" — a silent transition is indistinguishable from a
   * bug when a receipt is missing.
   */
  const syncMeetingInner = (m, at = null) => {
    if (!m || (m.state !== 'scheduled' && m.state !== 'waiting')) return null
    const now = at === null ? clock() : n(at)
    // ★ R3: 「未到齐」= 名册上还有人不 present（或部署把 `vmu.meetings.waitForAll` 关掉，则回落到法定人数）。
    // 判据只在这里算一次，两个分支共用 —— 否则 `scheduled⇒waiting` 与 `waiting⇒open` 会用两套口径，
    // 那是本仓反复记过的"同一概念两处各写"。
    const arrived = () => {
      if (K.waitForAll === false) return quorumOf(m).met
      const roster = m.roster instanceof Set ? [...m.roster] : (Array.isArray(m.roster) ? m.roster : [])
      if (roster.length === 0) return quorumOf(m).met
      return roster.every((id) => m.present.has(id))
    }
    if (m.state === 'scheduled') {
      if (!Number.isFinite(m.scheduledFor) || now < m.scheduledFor) return null
      const q = quorumOf(m)
      m.activatedAt = now
      m.waitStartedAt = now
      if (arrived()) {
        m.state = 'open'
        m.startedLate = true
        markState(m, 'open')
        say({ type: 'meetings/started', at: now, meeting: m.id, scheduledFor: m.scheduledFor, waitedMs: 0, quorum: q, present: m.present.size, rosterSize: (m.roster instanceof Set ? m.roster.size : (m.roster || []).length), enforcedScope: ENFORCED_SCOPE })
        return 'started'
      }
      m.state = 'waiting'
      markState(m, 'waiting')
      say({ type: 'meetings/waiting', at: now, meeting: m.id, scheduledFor: m.scheduledFor, quorum: q, present: m.present.size, rosterSize: (m.roster instanceof Set ? m.roster.size : (m.roster || []).length), absent: (m.roster instanceof Set ? [...m.roster] : (m.roster || [])).filter((id) => !m.present.has(id)), waitOnDueMs: K.waitOnDueMs, enforcedScope: ENFORCED_SCOPE })
      return 'waiting'
    }
    // state === 'waiting'
    // ★★ THE WAIT EXISTS TO BE SATISFIED. A latecomer who arrives during the wait must be able to turn it into a
    // running meeting, so the quorum is re-checked BEFORE the deadline logic — otherwise the only exit from `waiting`
    // is the chair's `proceed()`, i.e. the state that exists to wait for people could not be resolved by a person
    // arriving. Measured: without this branch `attend()` added the member, the quorum became met, and the meeting
    // still reported `waiting` forever (the assertion below went red with `settled:null`).
    if (arrived()) {
      m.state = 'open'
      m.startedLate = true
      markState(m, 'open')
      say({ type: 'meetings/started', at: now, meeting: m.id, scheduledFor: m.scheduledFor, waitedMs: now - (Number.isFinite(m.waitStartedAt) ? m.waitStartedAt : now), quorum: quorumOf(m), via: 'latecomer', enforcedScope: ENFORCED_SCOPE })
      return 'started'
    }
    if (m.waitDecisionDue === true) return null
    if (K.waitOnDueMs > 0 && now - m.waitStartedAt < K.waitOnDueMs) return null
    m.waitDecisionDue = true
    say({ type: 'meetings/wait-expired', at: now, meeting: m.id, scheduledFor: m.scheduledFor, waitedMs: now - m.waitStartedAt,
      waitOnDueMs: K.waitOnDueMs, quorum: quorumOf(m), enforcedScope: ENFORCED_SCOPE,
      note: 'the framework does not decide: the chair proceeds (proceed), lapses (lapse) or recesses (recess)' })
    return 'wait-expired'
  }

  // ★★★ ROUND 14 (live run 14, finding ⑧.4): the cross-pass history only ever recorded transitions found by a
  // sweepDue() PASS — but a meeting also moves on the TOUCH path (attend/speak/proceed call syncMeeting), and that is
  // exactly what the live run did: m75 went scheduled→waiting through `speak`, so `sweep.recentTransitions` stayed
  // `[]` while its own note promised "a transition from an earlier pass is still visible here". A history that only
  // remembers one of the two ways a state can move is a false reading, not a small one.
  // The recorder now sits at syncMeeting — the ONE place a state moves — so both paths are recorded, once.
  const recordTransition = (m, before, now) => {
    sweepHistory.push({ passAt: now, meeting: m.id, from: before, to: m.state,
      waitDecisionDue: m.waitDecisionDue === true,
      scheduledFor: m.scheduledFor === undefined ? null : m.scheduledFor,
      dueAt: m.waitStartedAt === undefined ? null : m.waitStartedAt })
    if (sweepHistory.length > 20) { sweepHistory.shift(); sweepHistoryDropped += 1 }
  }
  const syncMeeting = (m, at = null) => {
    const before = m && m.state
    const atNow = at === null ? clock() : n(at)
    const out = syncMeetingInner(m, at)
    if (out !== null && m && m.state !== before) recordTransition(m, before, atNow)
    return out
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
  // ★ THE LOGIC LIVES IN THE EXPORTED PURE FUNCTION `tallyOfMotion` (end of file), so its fallback branches can be UNIT-TESTED.
  // Measured: 'box-empty' and 'box-status-unreadable' could not be reached through the public face at all, because the pack's
  // motion-box middleware lazily REBINDS on every motion - a hand-set binding to a bogus box id was overwritten before the tally ran.
  // A branch no test can reach is a branch nobody has checked; the export is what makes checking it possible.
  const tallyOf = (meetingId, mo) => tallyOfMotion({ meetingId, mo, boxFor: boxBinding.resolve(), ballot })

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
    // ★ 2026-10-23 (v5r rules conformance): `subject` — WHAT this meeting is about, as a reference (a record/card id,
    // a file path, or a one-line statement). The institution vocabulary ("a debate has an extra field naming the
    // object under debate") is the PACK's; the FRAMEWORK only has to be able to carry such a reference and hand it
    // back on every read face. Without it a debate meeting could not say what was being debated anywhere a reader
    // looks, and the pack's `vibe_v5_meeting` had a `target` parameter with no consumer at all (declared, not wired).
    // ★ the implementation is the hoisted `openSeq` below (see the note there): D6 needs `close()` to open the
    // next meeting of a sequence through the SAME code path, and a literal's method cannot be reused.
    open: openSeq,

    /**
     * ★★★ LIVE RUN 29: the ids THIS service holds, so the OTHER meeting registry (the primitive one at
     * `vibe_vmu_meeting {action:"open"}`) can refuse/mint around them. Read-only and sorted: it exists to make
     * "one visible name = one meeting" checkable from both sides, not to expose the meetings themselves.
     */
    liveIds: () => [...live.keys()].sort(),

    /**
     * ★★ PHASE 12 D1 — 「未到齐超时，此时院士自行决定怎么做」的唯一出口。
     *
     * WHY THIS IS A METHOD AND NOT AN AUTOMATIC TRANSITION: the rule gives the DECISION to the chair. The framework's
     * job is to make the deadline visible (`waitDecisionDue` on every read face) and to provide exactly one way out
     * that records WHO took it. Doing it automatically would be the framework deciding, which the rule does not say.
     *
     * WHAT THE CHAIR CAN ALSO DO (deliberately NOT re-implemented here): `lapse()` ends the meeting, `recess()` pauses
     * it. Those already exist and are their own audited acts; `proceed` only answers "start anyway".
     *
     * ★ TWO REFUSALS THAT MATTER: (1) a meeting that is not WAITING cannot be proceeded (an already-open meeting does
     * not need it, and a scheduled one whose time has not come is not "late"); (2) when the chair rail is on, an
     * anonymous or non-chair actor is refused — an override of quorum is an authority act, and the receipt must say
     * whose. `beforeDeadline` is recorded, so "the chair jumped the gun" is distinguishable from "the chair decided
     * after the declared wait" — a silent early start would look identical to an on-time one in the minutes.
     */
    /**
     * ★ LIVE RUN 9, finding F: a WAITING meeting's deadline was only ever evaluated when something else happened to
     * TOUCH that meeting (`requireMeeting` calls `syncMeeting`). So "the wait expired" was a fact nobody learned until
     * an unrelated call arrived — the state that exists to wait had no clock of its own. This is the clock: one pass over
     * the live meetings, each settled through the SAME `syncMeeting` the touch path uses (no second transition rule,
     * no second authority). It never DECIDES anything for the chair — `waitDecisionDue` becomes true and the chair still
     * has to proceed/lapse/recess — it only makes the deadline observable on schedule.
     */
    sweepDue({ at = null } = {}) {
      const now = at === null ? clock() : atMs(at)
      const transitions = []
      for (const mm of [...live.values()]) {
        if (mm.state !== 'waiting' && mm.state !== 'scheduled') continue
        const before = mm.state
        const dueBefore = mm.waitDecisionDue === true
        syncMeeting(mm, now)
        if (mm.state !== before || (mm.waitDecisionDue === true && dueBefore !== true)) {
          transitions.push({ meeting: mm.id, from: before, to: mm.state, waitDecisionDue: mm.waitDecisionDue === true,
            scheduledFor: mm.scheduledFor === undefined ? null : mm.scheduledFor,
            dueAt: mm.waitStartedAt === undefined ? null : mm.waitStartedAt })
        }
      }
      const pass = { at: now, swept: transitions.length, transitions,
        note: transitions.length === 0
          ? 'no scheduled or waiting meeting changed state at this instant (the pass still ran)'
          : 'settled by the same syncMeeting the touch path uses; a due WAIT still needs the chair to decide (proceed/lapse/recess)' }
      // ★ LIVE RUN 10, finding F: the pass existed but its trace was nowhere a reader could see it, so "the deadline was
      // observed" remained an article of faith. lastSweep is the memory of the LAST pass and status() reports it.
      lastSweep = pass
      // the per-transition history is recorded by `recordTransition` inside `syncMeeting` (the ONE place a state
      // moves), so it also catches the touch path; pushing again here would double-count the same transition.
      return pass
    },

    proceed({ meeting = null, actor = null, by = null, member = null, at = null, why = null } = {}) {
      const mid = String(meeting)
      const m = meetingOf(mid)
      if (!m) throw deny('VMU_NO_SUCH_OBJECT', 'no such meeting: ' + mid, 'open: ' + ([...live.keys()].sort().join(', ') || '(none)'), [])
      const now = at === null ? clock() : atMs(at)
      syncMeeting(m, now)
      const enforced = []
      // ★ AUTHORITY BEFORE STATE (R5 of the phase-12 live run). Measured before this reordering: with the state gate
      // first, a non-chair got the SAME `VMU_STATE` as the chair, so "only the chair may decide" was unobservable —
      // the authority rail was shadowed by the state rail and a caller could not tell which one it hit. Ordering the
      // seat check first makes the two refusals distinguishable (`VMU_NOT_PERMITTED` names the chair, `VMU_STATE`
      // describes the state) and stops a passer-by from learning the meeting's phase. Same shape as `verdict_final`,
      // whose seat gate was never shadowed. Authority-first is also the framework's general convention for acts that
      // confer power; state remains the gate for acts that need the meeting to BE in a phase.
      // ★ LIVE RUN 13 (the institute's own report, item 2): the agent passed `member: "member-1"` — the name every OTHER
      // meeting act uses — and was told 'the chair needs to name itself', which reads as 'you named nobody'. The caller HAD
      // named itself, in the parameter this face does not accept. `member` is now accepted as an alias for `actor` (preference
      // order unchanged: actor, then by, then member) and the hint names the parameter so the next caller does not guess.
      const who = (actor === null || actor === undefined)
        ? ((by === null || by === undefined)
            ? ((member === null || member === undefined) ? null : String(member))
            : String(by))
        : String(actor)
      if (K.waitDecisionRequiresChair) {
        mark(enforced, 'vmu.meetings.waitDecisionRequiresChair')
        if (m.chair !== null) {
          if (who === null) {
            throw deny('VMU_NOT_PERMITTED', 'vmu.meetings.waitDecisionRequiresChair=true: starting a waiting meeting needs the chair to name itself',
              'pass { actor: "' + m.chair + '" } - ' + ACTOR_ALIASES + '; overriding an unmet quorum is an authority act and must be attributable', enforced)
          }
          if (who !== m.chair) {
            throw deny('VMU_NOT_PERMITTED', 'only the meeting’s chair may start a waiting meeting: actor ' + who + ' != chair ' + m.chair,
              'pass { actor: "' + m.chair + '" } - ' + ACTOR_ALIASES + ' (vmu.meetings.waitDecisionRequiresChair)', enforced)
          }
        }
      }
      if (m.state !== 'waiting') {
        throw deny('VMU_STATE', 'proceed() only applies to a meeting WAITING for its scheduled start: ' + mid + ' is ' + m.state,
          m.state === 'scheduled' ? 'its start time has not arrived yet; nothing is late' : 'the meeting is already running — just act in it', enforced)
      }
      const beforeDeadline = m.waitDecisionDue !== true
      const waitedMs = Number.isFinite(m.waitStartedAt) ? now - m.waitStartedAt : 0
      // ★★★ PHASE 12 / R17 (the institute's own run-16 report, item 1): the state DID move here, and the bounded
      // transition history did not see it. The recorder sat inside syncMeeting, so the touch path through
      // syncMeeting (attend/speak) was recorded while proceed() — which assigns m.state directly — was not. Measured
      // in that run: m90 went waiting→open through proceed and sweep.recentTransitions still had only
      // scheduled→waiting, while m87/m89's attend-driven waiting→open WERE listed. A history that lists one of the
      // two ways a state moves is a false reading.
      const beforeState = m.state
      m.state = 'open'
      m.activatedAt = now
      m.startedLate = true
      markState(m, 'open')
      recordTransition(m, beforeState, now)
      const whyText = (why === null || why === undefined) ? null : String(why)
      m.minutes.entries.push({ at: now, kind: 'proceeded', by: who, why: whyText, waitedMs, beforeDeadline, quorum: quorumOf(m) })
      // ★ LIVE RUN 9, finding E: the agent read "proceed succeeded" and asked whether the roster had been checked.
      // Refusing would be wrong (proceeding IS the chair's override of an unmet quorum — that is what 等待 exists for),
      // but the receipt has to SAY so: `quorum.met` alone is easy to read as "the institution rule was satisfied".
      const qAfter = quorumOf(m)
      const overrodeQuorum = qAfter.met !== true
      // ★ LIVE RUN 10, finding E: a boolean plus a prose note still left the reader asking "WHICH rule let this continue".
      // The override is now a record: the rule that authorises it, the floor that was not met, and who present count it had.
      // ★★ FINDING (b) OF THE INSTITUTE'S OWN ACCEPTANCE REPORT (phase 12, live run 12): the agent read the proceed
      // receipt, saw `overrodeQuorum:false` + `overrode:null`, and reported that the promised record was missing. The
      // record EXISTED but under a different name than the one a reader would look at: the ledger promises
      // `overrodeQuorum{by,rule,floor,present}`, while the CODE put the record on `overrode` and kept `overrodeQuorum`
      // as a boolean. Two names for one fact, and the name that promised the record delivered a flag — a reader cannot
      // be blamed for calling that missing. `overrodeQuorum` is now the RECORD (null when the floor was met, which is
      // a fact and not an absence), the flag moves to `overrodeQuorumFlag`, and `overrode` stays as a compatibility
      // alias so nothing that already reads it breaks.
      // ★ LIVE RUN 13 (the institute's own report, item 4 / ⑦.4): `proceed()` recorded an override ONLY when the FLOOR was
      // unmet, so 'the chair started a meeting before everyone had attended or voted' — an override of the INSTITUTION rule,
      // which the rule text asks to be recorded — came back `overrodeQuorum: null` and read as 'nothing was overridden'.
      // The record now names WHICH rule authorised the start (floor, then the institution rule), and carries `beforeDeadline`
      // so 'started early' and 'started after the deadline' are distinguishable without arithmetic on the clock.
      const unanimityUnmet = !!(qAfter.unanimity && qAfter.unanimity.met !== true)
      const overrodeRecord = overrodeQuorum
        ? { by: who, rule: 'meetings.proceed: the chair may start a meeting after its declared wait even when the floor is unmet', whichRule: 'floor', floor: qAfter.required, present: qAfter.present, waitedMs, beforeDeadline }
        : (unanimityUnmet
            ? { by: who, rule: 'meetings.proceed: the chair may start a meeting before the institution rule is met (unanimity of attendance/votes)', whichRule: 'institution-rule', unmetRule: 'unanimity', floor: qAfter.required, floorMet: qAfter.met === true, present: qAfter.present, roster: qAfter.roster, unanswered: (qAfter.unansweredList || []).slice(), waitedMs, beforeDeadline }
            : null)
      const receipt = { at: now, action: 'proceed', meeting: m.id, by: who, why: whyText, waitedMs, beforeDeadline, scheduledFor: m.scheduledFor, quorum: qAfter, overrodeQuorum: overrodeRecord, overrodeQuorumFlag: overrodeRecord !== null, overrode: overrodeRecord, overrodeNote: overrodeRecord === null ? null : (overrodeRecord.whichRule === 'floor' ? 'the meeting started WITHOUT its quorum: the chair used proceed() to start it anyway (this is the chair\'s authority act, recorded in minutes as `proceeded`)' : 'the meeting started with the FLOOR met but the institution rule (unanimity) unmet: the chair used proceed() to start it early, which is the same authority act and is recorded here so it is not read as "nothing was overridden"'), enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/proceeded', at: now, meeting: m.id, by: who, why: whyText, waitedMs, beforeDeadline, quorum: quorumOf(m), enforced, enforcedScope: ENFORCED_SCOPE })
      return Object.assign({ ok: true, meeting: m.id, state: m.state, startedLate: true, receipt }, receipt)
    },

    /** Join. `lateAfterMs` decides whether a late arrival is allowed/recorded/refused. */
    attend({ meeting, member, at = null } = {}) {
      // ★ EXEMPT FROM THE "no act before it starts" RAIL, on purpose: attending is how a waiting meeting gets its
      // quorum, so it is the one act that must work while the meeting is still scheduled/waiting.
      const m = requireMeeting(meeting, { allowPending: true })
      const enforced = []
      if (typeof member !== 'string' || !member) throw deny('VMU_INVALID_ARGUMENT', 'attend needs a member id', 'e.g. { meeting: "m1", member: "r-1" }', [])
      if (!isMember(member)) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + member, 'the roster seam rejected it', [])
      // ★ A4: a seat the institution keeps out of meetings cannot take a seat here. This is the missing MACHINE
      // gate behind 「临时工默认不参与会议」 — before it, the only expression of that rule was prose.
      // FAIL-OPEN ON AN UNRESOLVABLE SLOT on purpose: membership was already validated above, and a roster seam
      // that cannot report a slot must not silently deny attendance (that would be a silent refusal).
      if (K.attendDeniedSeats.length) {
        const list = (members && typeof members.roster === 'function') ? (members.roster() || []) : []
        const row = list.find((x) => x && String(x.id) === String(member))
        const slot = row ? String(row.slot || '') : ''
        if (slot && K.attendDeniedSeats.includes(slot)) {
          mark(enforced, 'vmu.meetings.attendDeniedSeats')
          throw deny('VMU_NOT_PERMITTED', 'this seat does not attend meetings: "' + String(member) + '" is in slot "' + slot + '"',
            'the declared non-attending seats are ' + K.attendDeniedSeats.join(', ') + ' (vmu.meetings.attendDeniedSeats)', enforced)
        }
      }
      const ms = at === null ? clock() : atMs(at)
      if (m.state === 'recess') throw deny('VMU_STATE', 'the meeting is in recess: ' + m.id, 'resume() first (vmu.meetings.recessMaxMs / recessResumeRequiresMotion)', [])
      let late = false
      if (K.lateAfterMs > 0 && ms - m.openedAt > K.lateAfterMs) {
        mark(enforced, 'vmu.meetings.lateAfterMs')
        late = true
      }
      m.roster = m.roster.includes(member) ? m.roster : m.roster.concat([member])
      m.present.add(member)
      // ★ SETTLE THE SCHEDULE ON THIS TOUCH. "The last person arrived ⇒ the meeting starts" is exactly what 等待 is
      // FOR; without this line the quorum could only be improved by an act that the rail forbids, so a waiting meeting
      // could never start by itself and the chair's `proceed()` was the only exit. `syncMeeting` reports what it did,
      // and the receipt repeats it, so "this attendance is what opened the meeting" is not silent.
      const settled = (m.state === 'scheduled' || m.state === 'waiting') ? syncMeeting(m, ms) : null
      const q = quorumOf(m)
      const receipt = { at: ms, action: 'attend', meeting: m.id, member, late, quorum: q, state: m.state, settled, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/attended', at: ms, meeting: m.id, member, late, state: m.state, settled, enforced, enforcedScope: ENFORCED_SCOPE })
      return { ok: true, late, quorum: q, state: m.state, settled, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Leave. `leaveEarlyPolicy` (allow/note/deny) and `quorumLossPolicy` decide the consequence. */
    leave({ meeting, member, at = null } = {}) {
      const m = requireMeeting(meeting)
      const enforced = []
      const ms = at === null ? clock() : atMs(at)
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
      const now = at === null ? clock() : atMs(at)
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
      // ★ PHASE 12: the bound is the MEETING's own (`wallLimitOf`), so a declared extension really moves it. The key
      // marked is `hardLimitMs` because that is what froze the bound at open; when the bound was raised the receipt
      // says so by naming both numbers in the refusal message, so a reader can tell "raised" from "never raised".
      if (now - m.wallStartMs > wallLimitOf(m)) {
        mark(enforced, 'vmu.meetings.hardLimitMs')
        // F28: past the declared bound this is no longer only a refusal — the meeting can be SETTLED BY NAME
        // (`lapse()`), which produces `{name, why, at, revocable}` and can be revoked with a reason.
        throw deny('VMU_RESOURCE_BUDGET', 'the meeting wall-clock HARD limit is exceeded: ' + (now - m.wallStartMs) + ' / ' + wallLimitOf(m) + (wallLimitOf(m) !== K.hardLimitMs ? ' (extended from ' + K.hardLimitMs + ')' : ''),
          'settle it by name with lapse() (bounded fallback, revocable), or close() it explicitly; the hard limit has no off switch (vmu.meetings.hardLimitMs, clamped [300000, 7200000]) and extension is capped by vmu.meetings.extendCeilingMs', enforced)
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
      // ★ R9 OF THE PHASE-12 LIVE RUN: `ms:0` and `budget:null` read as "no time" and "nothing to report", but with
      // `vmu.meetings.speechDefaultMs=0` they mean "NO BOUND IS DECLARED" — 0 is the unbounded sentinel on this key
      // (unlike `budgetWallMs`, whose 0 means "no bound at all"). A reading that can be read two ways is the defect,
      // so the receipt now says which one it is instead of leaving the model to infer it from a zero.
      const speechBound = Object.freeze({
        declaredMs: K.speechDefaultMs,
        maxMs: K.speechMaxMs,
        unlimited: K.speechDefaultMs === 0 && K.speechMaxMs === 0,
        why: (K.speechDefaultMs === 0 && K.speechMaxMs === 0)
          ? 'no speech-time bound is declared (vmu.meetings.speechDefaultMs=0 and vmu.meetings.speechMaxMs=0): ms:0 means UNBOUNDED, not "zero time"'
          : null,
      })
      const budgetDeclared = soft !== null
      const budgetWhy = budgetDeclared ? null
        : 'no meeting budget was crossed and none is declared (vmu.meetings.budgetTurns/budgetTokens/budgetWallMs are 0, or their thresholds were not reached) — budget:null means "no verdict", not "plenty left"'
      const receipt = { at: now, action: 'speak', meeting: m.id, member: String(member), ms: wanted, turns: m.turns, tokens: m.tokens, budget: soft, budgetDeclared, budgetWhy, speechBound, floor, enforced, enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/spoke', at: now, meeting: m.id, member: String(member), floor, enforced, enforcedScope: ENFORCED_SCOPE })
      return { ok: true, ms: wanted, turns: m.turns, tokens: m.tokens, budget: soft, budgetDeclared, budgetWhy, speechBound, floor, receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    },

    /** Interrupt. `interruptAllow` + `interruptQuota` govern the floor. */
    interrupt({ meeting, member, target = null, at = null } = {}) {
      const m = requireMeeting(meeting)
      if (!isMember(String(member))) throw deny('VMU_NOT_MEMBER', 'not a member of this instance: ' + String(member), 'interrupt() acts as or on the interrupting member - the roster seam rejected this id; a non-member never votes (08 D-series)', [])
      const enforced = []
      const now = at === null ? clock() : atMs(at)
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
      const now = at === null ? clock() : atMs(at)
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
      const now = at === null ? clock() : atMs(at)
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
      const now = at === null ? clock() : atMs(at)
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
      const now = at === null ? clock() : atMs(at)
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
      // ★★ FINDING (b), second half: the same report said "提案表决回执里没有 overrode 标记". It is TRUE that a vote
      // receipt has no override record — and that is CORRECT, because a vote cannot override a floor: only `proceed()`
      // may start a meeting without quorum. The defect was that the field was simply ABSENT, so "no override" and
      // "this face forgot to report" looked identical. It is now explicitly `null` WITH a note that says which act
      // would have recorded one, whenever the floor is in fact unmet at this vote.
      const overrodeAtVote = quorumAfter.met === true ? null : {
        by: null, rule: null, floor: quorumAfter.required, present: quorumAfter.present, waitedMs: null,
        note: 'the floor is NOT met at this vote (present ' + quorumAfter.present + ' < required ' + quorumAfter.required + '); a vote does not override it — only meetings.proceed() may start a meeting without its quorum, so no override is recorded on this receipt' }
      const receipt = { at: now, action: 'vote', meeting: m.id, motion: target ? target.id : null, member: String(member), tally, counted: target !== null, tallyNote, quorum: quorumAfter, overrodeQuorum: overrodeAtVote, enforced, enforcedScope: ENFORCED_SCOPE, ballot: ballotMirror }
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
      const now = at === null ? clock() : atMs(at)
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
      const now = at === null ? clock() : atMs(at)
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
      const now = at === null ? clock() : atMs(at)
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
      const now = at === null ? clock() : atMs(at)
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
      const now = at === null ? clock() : atMs(at)
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
      const now = at === null ? clock() : atMs(at)
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
      const now = at === null ? clock() : atMs(at)
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
      const now = at === null ? clock() : atMs(at)
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
    close({ meeting, report = null, actions = null, at = null, actor = null } = {}) {
      const m = requireMeeting(meeting)
      const enforced = []
      const now = at === null ? clock() : atMs(at)
      // PHASE 12 - only the chair closes: capability here, policy in the pack (vmu.meetings.closeRequiresChair).
      // ORDER MATTERS: ask WHO is closing before asking WHAT the close carries, so a non-chair caller is told
      // it lacks the seat rather than that its report is malformed (the same lesson as motion() below).
      if (K.closeRequiresChair) {
        mark(enforced, 'vmu.meetings.closeRequiresChair')
        const who = (actor === null || actor === undefined) ? null : String(actor)
        const seat = (m.chair === null || m.chair === undefined) ? null : String(m.chair)
        // A CHAIRLESS MEETING HAS NO AUTHORITY TO PROTECT, so this rail does not apply to it (the same boundary as
        // `open`: `v5r.stall-meeting` convenes one from `control/idle`, and refusing to close it would leave an
        // un-closeable record behind — a rail that creates garbage is worse than no rail). A meeting WITH a chair
        // can only be closed by that chair, and only while naming it: refusing here also means the close receipt
        // can never print `closedBy` as a guess.
        if (seat !== null) {
          if (who === null) {
            throw deny('VMU_NOT_PERMITTED', 'vmu.meetings.closeRequiresChair=true: closing needs the chair to name itself; the chair of ' + m.id + ' is ' + seat,
              'pass { actor: "' + seat + '" } - ' + ACTOR_ALIASES + '; the close receipt records who closed (vmu.meetings.closeRequiresChair)', enforced)
          }
          if (who !== seat) {
            throw deny('VMU_NOT_PERMITTED', 'only the declared chair may close this meeting: ' + who + ' != ' + seat,
              'the chair of ' + m.id + ' is ' + seat + ' - ' + ACTOR_ALIASES + ' (vmu.meetings.closeRequiresChair)', enforced)
          }
        }
      }
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
      const closedBy = (actor === null || actor === undefined) ? null : String(actor)
      const receipt = { at: now, action: 'close', meeting: m.id, closedBy, wallMs: m.wallMs, turns: m.turns, tokens: m.tokens, enforced: enforced.slice(), enforcedScope: ENFORCED_SCOPE }
      // ★★ PHASE 12 D6 — 「允许一次性设置连续展开的多个会议」: closing this meeting OPENS the next one it was convened
      // with. Two failure directions are treated differently on purpose: (1) a next meeting that cannot open (quota, a
      // type that left the catalogue) does NOT un-close this one — the closure already happened and reverting it would
      // be a lie about a past fact; it is reported as `nextMeetingError` with its own code. (2) `sequenceIndex` advances
      // only when a meeting really opened, so a refused advance stays visible (it is retried on the next close) instead
      // of vanishing.
      const advanced = advanceSequence(m, now)
      if (advanced.meeting) {
        receipt.nextMeeting = advanced.meeting
        receipt.sequence = { index: advanced.index, total: advanced.total, next: advanced.next === undefined ? null : advanced.next }
      } else if (advanced.error) {
        receipt.nextMeetingError = advanced.error
      }
      pushReceipt(receipt)
      say({ type: 'meetings/closed', at: now, meeting: m.id, closedBy, enforced: enforced.slice(), enforcedScope: ENFORCED_SCOPE })
      // NO `enforced` list on the advance event: advancing is decided by the call that declared the sequence, not by
      // a settings key, so naming one would be a false audit trail. The sequence length is not bounded either - the
      // rule asks for "several consecutive meetings in one call", not for a quota, and a bound no rule requires would
      // be policy the pack never asked for.
      if (advanced.meeting)
      say({ type: 'meetings/sequence-advanced', at: now, from: m.id, meeting: advanced.meeting, index: advanced.index, total: advanced.total, enforcedScope: ENFORCED_SCOPE })
      return { ok: true, meeting: m.id, closedBy, wallMs: m.wallMs, turns: m.turns, tokens: m.tokens, nextMeeting: advanced.meeting || null, nextMeetingError: advanced.error || null, receipt, enforced: enforced.slice(), enforcedScope: ENFORCED_SCOPE }
    },

    /**
     * RAISE THE MEETING'S OWN WALL BOUND - the rule (the academician may extend the meeting's time bound).
     *
     * TWO BOUNDS, TWO FACES, ON PURPOSE - AND THEREFORE TWO NAMES. The service's `extend()` (built below at the
     * `createLapseControls` seam) lengthens ONE MEMBER'S SPEECH SLOT (`speechExtendMs/Max`); this one lengthens the
     * MEETING. The first draft of this method was ALSO called `extend` and was silently shadowed by that const in the
     * returned object - a same-word-two-meanings bug found by a red test, not by reading. Hence `extendWall`, and the
     * tool face's `extendlimit`, so no reader has to guess which bound a call moves.
     * WHY A SEPARATE CEILING. `hardLimitMs` is documented as having no off switch. An extension therefore ADDS a
     * declared step to the meeting's own bound and can never remove the ceiling: past `extendCeilingMs` the refusal
     * names both numbers, so "how far can I go" is answerable before the call rather than after it.
     */
    extendWall({ meeting, ms = null, at = null, actor = null, why = null } = {}) {
      const m = requireMeeting(meeting)
      const enforced = []
      const now = at === null ? clock() : atMs(at)
      if (m.state !== 'open' && m.state !== 'recess') {
        throw deny('VMU_STATE', 'only an open (or recessed) meeting can be extended: ' + m.id + ' is ' + m.state,
          'reopen() it first, or open a new meeting', enforced)
      }
      mark(enforced, 'vmu.meetings.extendRequiresChair')
      if (K.extendRequiresChair) {
        const who = (actor === null || actor === undefined) ? null : String(actor)
        const seat = (m.chair === null || m.chair === undefined) ? null : String(m.chair)
        if (seat === null) {
          throw deny('VMU_ENGINE_UNAVAILABLE', 'vmu.meetings.extendRequiresChair=true: this meeting declares no chair, so no one may extend it',
            'convene with { chair: "<member id>" } - the kernel never invents an authority (vmu.meetings.extendRequiresChair)', enforced)
        }
        if (who === null) {
          throw deny('VMU_NOT_PERMITTED', 'vmu.meetings.extendRequiresChair=true: extending needs the chair to name itself; the chair of ' + m.id + ' is ' + seat,
            'pass { actor: "' + seat + '" } - ' + ACTOR_ALIASES + ' (vmu.meetings.extendRequiresChair)', enforced)
        }
        if (who !== seat) {
          throw deny('VMU_NOT_PERMITTED', 'only the declared chair may extend this meeting: ' + who + ' != ' + seat,
            'the chair of ' + m.id + ' is ' + seat + ' - ' + ACTOR_ALIASES + ' (vmu.meetings.extendRequiresChair)', enforced)
        }
      }
      // The step is REQUIRED and must be positive: "extend it a bit" is not a declared amount.
      if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) {
        throw deny('VMU_INVALID_ARGUMENT', 'extend needs a positive step in ms; got ' + String(ms),
          'e.g. { ms: 600000 } adds ten minutes to this meeting wall bound (vmu.meetings.extendCeilingMs caps the total)', enforced)
      }
      const before = wallLimitOf(m)
      const after = before + Number(ms)
      if (after > K.extendCeilingMs) {
        mark(enforced, 'vmu.meetings.extendCeilingMs')
        throw deny('VMU_RESOURCE_BUDGET', 'the extended wall bound would pass the ceiling: ' + after + ' / ' + K.extendCeilingMs + ' (from ' + before + ' + ' + Number(ms) + ')',
          'the ceiling is vmu.meetings.extendCeilingMs; close this meeting and open a new one instead of extending without bound', enforced)
      }
      m.wallLimitMs = after
      m.extendedMs = (Number(m.extendedMs) || 0) + Number(ms)
      m.extensions = (Number(m.extensions) || 0) + 1
      const receipt = { at: now, action: 'extend', meeting: m.id, ms: Number(ms), wallLimitMs: after, extendedMs: m.extendedMs, extensions: m.extensions, actor: (actor === null || actor === undefined) ? null : String(actor), why: why === null ? null : String(why), enforced: enforced.slice(), enforcedScope: ENFORCED_SCOPE }
      pushReceipt(receipt)
      say({ type: 'meetings/extended', at: now, meeting: m.id, ms: Number(ms), wallLimitMs: after, extendedMs: m.extendedMs, actor: receipt.actor, enforced: enforced.slice(), enforcedScope: ENFORCED_SCOPE })
      return { ok: true, meeting: m.id, wallLimitMs: after, extendedMs: m.extendedMs, extensions: m.extensions, receipt, enforced: enforced.slice(), enforcedScope: ENFORCED_SCOPE }
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
        ok: true, id: m.id, meeting: m.id, type: m.type, kind: m.kind, state: m.state, reason: m.reason === undefined ? null : m.reason,
        title: m.title === undefined ? null : m.title,
        materials: m.materials === undefined ? null : m.materials,
        subject: m.subject === undefined ? null : m.subject,
        sequence: seqInfo(m),
        // ★ PHASE 12 D1: the schedule is part of the DECISION record — a reader must be able to tell a scheduled
        // meeting from a running one, and a late start from an on-time one, without asking a second face.
        scheduledFor: m.scheduledFor === undefined ? null : m.scheduledFor,
        activatedAt: m.activatedAt === undefined ? null : m.activatedAt,
        startedLate: m.startedLate === true,
        waitStartedAt: m.waitStartedAt === undefined ? null : m.waitStartedAt,
        waitDueAt: waitDueOf(m),
        waitDecisionDue: m.waitDecisionDue === true,
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
      return { ok: true, meeting: m.id, type: m.type, state: m.state,
        title: m.title === undefined ? null : m.title,
        materials: m.materials === undefined ? null : m.materials,
        subject: m.subject === undefined ? null : m.subject,
        sequence: seqInfo(m),
        // ★ PHASE 12 D1: the schedule's state on the view the live run actually reads.
        scheduledFor: m.scheduledFor === undefined ? null : m.scheduledFor,
        activatedAt: m.activatedAt === undefined ? null : m.activatedAt,
        startedLate: m.startedLate === true,
        waitStartedAt: m.waitStartedAt === undefined ? null : m.waitStartedAt,
        waitDueAt: waitDueOf(m),
        waitDecisionDue: m.waitDecisionDue === true,
        loop: 'meeting-ask-answer',
        note: '★ motions/votes/state here describe the MEETING’s own ask()+answer()+motion cycle. A member answering a vibe_vmu_turn prompt is a DIFFERENT loop: read vibe_vmu_turn’s receipts (awaiting/memberPrompt/deliveryPath) for that one. hasDeliverSeam on the primitive face refers to open({deliver}), not to the turn loop’s deliveryPath.', reason: m.reason === undefined ? null : m.reason, chair: m.chair || null, secretary: m.secretary || null,
        motions: m.motions.map((x) => ({ id: x.id, by: x.by, kind: x.kind, status: x.status, secondedBy: x.secondedBy || null, withdrawnAt: x.withdrawnAt || null })) }
    },
    /** READ-ONLY self-report: WIRED list, the declared-but-unwired list (per key + reason), counters, values. */
    status() {
      // ★ PHASE 12 D1: settle every scheduled/waiting meeting before reporting, so `scheduledMeetings` /
      // `waitDecisionDue` are the CURRENT facts rather than a snapshot of the last time someone touched that meeting.
      for (const m of live.values()) syncMeeting(m, null)
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
        // ★ PHASE 12 D1: a scheduled / waiting meeting is live but NOT runnable, and an operator must be able to see
        // the difference without opening each one. `waitDecisionDue` is the actionable half: those are the meetings
        // where the framework is deliberately waiting for a human decision.
        // ★ LIVE RUN 10, finding F: the due-clock pass must be READABLE, not merely to exist. `ran:false` is the honest
        // state of a process that has not swept yet (not "nothing was due").
        sweep: Object.assign(
          lastSweep === null
            ? { ran: false, at: null, swept: 0, transitions: [], note: 'no sweep pass has run in this process yet - the kernel runs one on every beat() (there is no timer by design)' }
            : Object.assign({ ran: true }, lastSweep),
          { recentTransitions: sweepHistory.slice(), recentTransitionsDropped: sweepHistoryDropped,
            // ★★★ PHASE 12 / R20 (run-16 report, item 4): TWO CLOCKS APPEARED IN ONE OBJECT. `at`/`swept` come from the
            // last BEAT sweep, while a row's passAt comes from whichever path moved the meeting (the beat pass OR the
            // touch path: attend/speak/proceed). In that run the two disagreed by tens of seconds while nothing named
            // the difference, so "sweep.at" looked like the instant the transition happened. Both are labelled now.
            lastTransitionPassAt: sweepHistory.length === 0 ? null : sweepHistory[sweepHistory.length - 1].passAt,
            recentTransitionsNote: 'this is the BOUNDED history (last 20 transitions across all state-moving paths); each row carries its OWN passAt, which is the instant THAT transition was recorded - it is not `at`, because `at`/`swept`/`transitions` describe the last BEAT sweep only, while a meeting also moves on the touch path (attend/speak/proceed)' }),
        scheduledMeetings: [...live.values()].filter((m) => m.state === 'scheduled').map((m) => ({ meeting: m.id, status: String(m.state), scheduledFor: m.scheduledFor === undefined ? null : m.scheduledFor })).sort((a, b) => String(a.meeting).localeCompare(String(b.meeting))),
        waitingMeetings: [...live.values()].filter((m) => m.state === 'waiting').map((m) => ({ meeting: m.id, status: String(m.state), scheduledFor: m.scheduledFor === undefined ? null : m.scheduledFor, waitStartedAt: m.waitStartedAt === undefined ? null : m.waitStartedAt, waitDueAt: waitDueOf(m), waitDecisionDue: m.waitDecisionDue === true, quorum: quorumOf(m) })).sort((a, b) => String(a.meeting).localeCompare(String(b.meeting))),
        waitDecisionDue: [...live.values()].filter((m) => m.state === 'waiting' && m.waitDecisionDue === true).map((m) => m.id).sort(),
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
        keys: keysSnapshot(K, WIRED_KEYS),
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

  // ★★ PHASE 12 D6 turned this from an object-literal METHOD into a NAMED, HOISTED function: a sequence advances
  // by OPENING the next meeting, and a sibling method cannot call another sibling method inside the same literal.
  // Declaring it here is the smallest change that lets `close()` reuse the ONE open implementation — a second open
  // path would have to keep the rails, the ids and the receipts in step by hand, which is how the two-loops confusion
  // earlier in this project started.
  function openSeq({ id = null, type = 'ordinary', chair = null, roster = [], size = null, materials = null, kind = null, secretary = null, at = null, reason = null, subject = null, title = null, actor = null, sequence = null, adoptForeign = false } = {}) {

    const enforced = []
    const ms = at === null ? clock() : atMs(at)
    // ★★ PHASE 12 D1 — 预约：`at` 指向未来 ⇒ 会议先处于 scheduled 态，**不是**"一个 openedAt 在未来的已开会议"。
    // 差别是实打实的：旧实现把未来的 `at` 直接写进 openedAt，于是一个"预约"会议可以立刻被发言、投票、关闭，
    // 预约只是个装饰字段。现在它有自己的状态，而状态由 `syncMeeting` 在到点时结算。
    // ★ 能力可以关掉（`vmu.meetings.scheduleAllowed=false`），**关掉时是具名拒，不是把预约悄悄变成立即召开**
    //   —— 后者会让调用方以为会议已按预约时间排好，实际已经开着（假绿）。
    const scheduledFor = ms > clock() ? ms : null
    if (scheduledFor !== null) {
      mark(enforced, 'vmu.meetings.scheduleAllowed')
      if (!K.scheduleAllowed) {
        throw deny('VMU_STATE', 'vmu.meetings.scheduleAllowed=false: a meeting cannot be SCHEDULED (requested at ' + new Date(ms).toISOString() + ', now ' + new Date(clock()).toISOString() + ')',
          'open it now by omitting { at } (an `at` in the future would otherwise create a meeting that pretends to be scheduled)', enforced)
      }
    }
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
    // ★ PHASE 12 — 「会议只能由院士（= 本会主席）召开」的内核承载：能力在这里（具名拒，并说出谁可以），
    // 「本所的主席只有院士」这条政策在 pack 的 defaults.json 里声明。★ 第三件不做：不在这里查
    // 「actor 是不是院士」——那是 pack 的名册知识，内核若硬编码一个角色名，第二个 pack 就抄不动了。
    // ★ WHAT THIS RAIL CAN AND CANNOT DO, said plainly (a security argument must cover the ACTUAL authorization, not
    // the part it finds convenient). WHEN A CONVENE INSTALLS A CHAIR, that chair is an authority, so the convene must
    // name it and must come FROM it: ① no actor ⇒ refused (an anonymous convene could install any chair); ② actor ≠
    // chair ⇒ refused (convening ON BEHALF of another chair is the forgery this rule is about). A CHAIRLESS CONVENE
    // IS NOT THIS RAIL'S BUSINESS: `v5r.stall-meeting` opens one from `control/idle`, where no member exists at all,
    // and a kernel cannot tell a workflow from a member. That split is deliberate and documented on both sides:
    // 「只有院士（a seat）能召开」is enforced where the caller id AND the slot are both known — the pack's tool face
    // (`requireChairSeat` in packs/v5r/tools.js); the kernel guards the shape it can actually see.
    if (K.conveneRequiresChair) {
      mark(enforced, 'vmu.meetings.conveneRequiresChair')
      const who = (actor === null || actor === undefined) ? null : String(actor)
      const seat = (chair === null || chair === undefined) ? null : String(chair)
      if (seat !== null) {
        if (who === null) {
          throw deny('VMU_NOT_PERMITTED', 'vmu.meetings.conveneRequiresChair=true: a convene that installs a chair must name that chair as its actor',
            'pass { actor: "<member id>" } together with { chair: "<the same id>" } - ' + ACTOR_ALIASES + ' (vmu.meetings.conveneRequiresChair)', enforced)
        }
        if (who !== seat) {
          throw deny('VMU_NOT_PERMITTED', 'only the member who takes the chair may convene this meeting: actor ' + who + ' != chair ' + seat,
            'pass { actor: x, chair: x } - ' + ACTOR_ALIASES + '; convening ON BEHALF of another chair is exactly what this rail refuses (vmu.meetings.conveneRequiresChair)', enforced)
        }
        chair = who
      }
    }
    // ★ WHERE this meeting is about something (a debate's object, a closure's proposition, a paper's draft), the
    // reference is CARRIED and READ BACK, never inferred. A non-string is refused by name rather than stringified:
    // `String({})` would silently store "[object Object]" and every later reader would trust it.
    if (subject !== null && subject !== undefined && typeof subject !== 'string') {
      throw deny('VMU_INVALID_ARGUMENT', 'subject must be a string reference (a card id, a file path, or a one-line statement); got ' + typeof subject,
        'pass subject:"<what this meeting is about>" or omit it', enforced)
    }
    const subjectRef = (subject === null || subject === undefined || String(subject).trim() === '') ? null : String(subject).trim()
    // ★ PHASE 12 D3 — 「院士设：标题、类型、内容事项…」. `materials` carries the AGENDA; a meeting's TITLE is a separate
    // thing a reader looks for in a list, so it gets its own carried field instead of being re-derived from the first
    // line of the agenda (re-derivation is a hardcoded rule that looks like data). Same refusal discipline as
    // `subject`: a non-string is named, never stringified into "[object Object]".
    if (title !== null && title !== undefined && typeof title !== 'string') {
      throw deny('VMU_INVALID_ARGUMENT', 'title must be a string; got ' + typeof title,
        'pass title:"<one line naming this meeting>" or omit it', enforced)
    }
    const titleRef = (title === null || title === undefined || String(title).trim() === '') ? null : String(title).trim()
    // ★ PHASE 12 D3 — 「内容事项」 WAS VALIDATED AND THEN DROPPED. `materials` only decided whether opening was ALLOWED
    // (`vmu.meetings.materialsRequired`) and then never reached the meeting object: measured, `m.materials` had ZERO
    // readers, so a chair could state the agenda and no read face could ever return it. It is carried as the POINTER
    // the docs already say it is (07/22 owns the text), so the head view stays a pointer and the rule's "set the
    // agenda" becomes observable. Non-string is refused by name, same discipline as title/subject.
    if (materials !== null && materials !== undefined && typeof materials !== 'string') {
      throw deny('VMU_INVALID_ARGUMENT', 'materials must be a string pointer to the agenda (a card id or a file path); got ' + typeof materials,
        'pass materials:"<agenda pointer>" or omit it', enforced)
    }
    const materialsRef = (materials === null || materials === undefined || String(materials).trim() === '') ? null : String(materials).trim()
    // ★★ PHASE 12 D6 — 「允许一次性设置连续展开的多个会议」. `sequence` lists the meetings that FOLLOW this one
    // (this call opens the first). Every entry is validated NOW, not when its turn comes: a typo in entry 3 must be
    // refused while the chair is still looking at the call, not three meetings later when nobody remembers it.
    // A descriptor may NOT carry chair/actor — those are inherited from the closing meeting, because a per-entry
    // chair would be a second convene path that never passed the convene rail.
    const seqEntries = normalizeSequence(sequence, enforced)
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
    // ★★★ LIVE RUN 29 (the institute's own report, ㉑.5/㉑.6): TWO REGISTRIES, ONE VISIBLE NAME SPACE. The primitive
    // meeting registry (`kernel/meeting.js`, reachable as `vibe_vmu_meeting {action:"open", id}`) and this SERVICE both
    // hand out ids that a caller reads as "the meeting" — so an explicit `m111` on the primitive face and a minted
    // `m111` here denoted two different meetings with one name, and the agent's own report recorded it as a collision it
    // could not resolve. Each registry only guarded its OWN table. The `foreignIds` seam (supplied by the kernel) lets
    // this one see the other's live ids, so ONE NAME ALWAYS MEANS ONE MEETING: an explicit id that the other registry
    // holds is refused by name (never silently re-pointed), and a MINTED id steps past it.
    // ★★ `adoptForeign`: the ONE caller allowed to share an id with the other registry is the documented BRIDGE
    // (`vibe_vmu_meeting {action:"open", id}` creates the primitive meeting first and then records the SAME id here so a
    // tool-declared secretary can be honoured — tools/meeting.js). That call is one deliberate act; two SEPARATE opens
    // that happen to pick the same name are the defect this guard exists for. The flag is the bridge saying so out loud.
    const foreign = adoptForeign ? [] : (() => { try { const v = typeof foreignIds === 'function' ? foreignIds() : null; return Array.isArray(v) ? v.map(String) : [] } catch { return [] } })()
    const taken = (x) => live.has(x) || foreign.includes(x)
    if (wanted !== null && taken(wanted)) {
      throw deny('VMU_CONFLICT', 'a live meeting already uses id ' + String(wanted),
        // ★ LIVE RUN 31: the DECISIVE sentence comes first and the full id list last. Measured in the institute's
        // report: the hint opened with m1…m115 and the one sentence that said WHICH registry owned the id was at the
        // end of a 115-item list, so the answer to "why was this refused" was the hardest part to find.
        (foreign.includes(wanted)
          ? 'that id belongs to the PRIMITIVE meeting registry (vibe_vmu_meeting action:"open"), which is a different table — pass another id. Service ids in use: ' + ([...live.keys()].sort().join(', ') || '(none)')
          : 'choose another id; live service meetings: ' + ([...live.keys()].sort().join(', ') || '(none)')), enforced)
    }
    let mid = wanted || ('m' + (counters.opened + 1))
    if (wanted === null) {
      // a MINTED id must not collide with the other registry either: advance the counter rather than hand back a name
      // that already denotes a meeting elsewhere (silently reusing it would be the same defect with a luckier order).
      let guard = 0
      while (taken(mid) && guard < 10000) { counters.opened += 1; mid = 'm' + (counters.opened + 1); guard += 1 }
    }
    if (live.has(mid)) throw deny('VMU_CONFLICT', 'a live meeting already uses id ' + String(mid), 'open: ' + [...live.keys()].sort().join(', '), enforced)
    const m = {
      id: mid, type: String(type), kind: kind === null ? null : String(kind), chair: chair === null ? null : String(chair), secretary: secretary === null ? null : String(secretary),
      roster: arr(roster).map(String), present: new Set(chair === null ? [] : [String(chair)]),
      openedAt: ms, state: scheduledFor === null ? 'open' : 'scheduled', turns: 0, tokens: 0, wallStartMs: ms,
      // ★ PHASE 12 D1 — the schedule's own state. `startedLate` is not decoration: a scheduled meeting that had to
      // wait is a different institutional fact from one that started on time, and the minutes must be able to say so.
      // `activatedAt` is when it actually became runnable (null while scheduled); `waitStartedAt`/`waitDecisionDue`
      // exist only after a due-but-incomplete start.
      scheduledFor, activatedAt: scheduledFor === null ? ms : null, startedLate: false,
      waitStartedAt: null, waitDecisionDue: false,
      // ★ the meeting's OWN wall bound (frozen at open) plus who convened it; `extend()` raises the first.
      wallLimitMs: K.hardLimitMs, openedBy: (actor === null || actor === undefined) ? null : String(actor), extendedMs: 0,
      queue: [], speechUsed: new Map(), interrupts: new Map(), warnings: new Map(), mutes: new Map(),
      recess: null, previousConfirmed: false, minutes: { entries: [], refused: [], actions: [] },
      transcript: [], confidentiality: K.confidentialityDefault, motions: [], appeals: [], closedAt: null,
      committeeReport: null, dissent: [],
      // ★ WHY this meeting was convened (null when the caller did not say). Until now this was computed by the
      // caller and discarded here, so a reader of summary()/meetingView() could see a "stall" meeting with no
      // statement of what stalled.
      reason: reason === null || reason === undefined ? null : String(reason),
      // ★ WHAT this meeting is about, when the convenor said so (null = not stated, never guessed).
      subject: subjectRef,
      title: titleRef,
      materials: materialsRef,
      // ★★ PHASE 12 D6: the follow-ups this meeting was opened with, and how many are still pending.
      // `close()` advances this list; without it the rule sentence had no implementation at all.
      sequence: seqEntries, sequenceIndex: 0, sequenceTotal: seqEntries.length,
    }
    live.set(mid, m)
    markState(m, m.state)
    counters.opened += 1
    const receipt = { at: ms, action: 'open', meeting: mid, type: m.type, title: m.title, materials: m.materials, subject: m.subject, openedBy: m.openedBy, state: m.state, scheduledFor: m.scheduledFor, confidentiality: m.confidentiality, sequence: { index: 0, total: 1 + seqEntries.length }, enforced, enforcedScope: ENFORCED_SCOPE }
    pushReceipt(receipt)
    say({ type: m.state === 'scheduled' ? 'meetings/scheduled' : 'meetings/opened', at: ms, meeting: mid, type: m.type, title: m.title, materials: m.materials, subject: m.subject, openedBy: m.openedBy, scheduledFor: m.scheduledFor, enforced, enforcedScope: ENFORCED_SCOPE })
    // ★ type/subject are ALSO at the top level, not only inside `receipt`: a caller that asked for them should not
    // have to know the receipt envelope's shape to read back what it just set (the same reason `attend` returns `late`).
    return { ok: true, meeting: mid, type: m.type, title: m.title, materials: m.materials, subject: m.subject, openedBy: m.openedBy, state: m.state, scheduledFor: m.scheduledFor, wallLimitMs: m.wallLimitMs, sequence: { index: 0, total: 1 + seqEntries.length, next: seqEntries.length ? seqEntries[0] : null }, quorum: quorumOf(m), receipt, enforced, enforcedScope: ENFORCED_SCOPE }
    
  }

  // ★★ PHASE 12 D6 — the meeting SEQUENCE. 「允许一次性设置连续展开的多个会议（例如先进行学术交流会议
  // 再开展未来规划交流和任务安排分配会议）」: one call declares the follow-ups, and each close advances one step.
  //
  // WHY THE DESCRIPTORS ARE VALIDATED UP FRONT AND SHAPED NARROWLY: they are installed later, at a moment when nobody is
  // reading the original call any more. So the vocabulary is closed (an unknown key is refused by name, never ignored),
  // the type is checked against the SAME catalogue `open()` uses, and chair/actor are not settable per entry.
  const SEQUENCE_KEYS = ['type', 'kind', 'materials', 'subject', 'size', 'secretary', 'roster', 'reason', 'at']
  function normalizeSequence(raw, enforced) {
    const ev = Array.isArray(enforced) ? enforced : []
    if (raw === null || raw === undefined) return []
    if (!Array.isArray(raw)) {
      throw deny('VMU_INVALID_ARGUMENT', 'sequence must be an ARRAY of meeting descriptors (the meetings that FOLLOW this one); got ' + typeof raw,
        'pass sequence: [{ type: "academic" }, { type: "planning" }] — several consecutive meetings in one call', ev)
    }
    if (!raw.length) return []
    return raw.map((e, i) => {
      if (!e || typeof e !== 'object' || Array.isArray(e)) {
        throw deny('VMU_INVALID_ARGUMENT', 'sequence[' + i + '] must be an OBJECT (a meeting descriptor); got ' + (Array.isArray(e) ? 'array' : typeof e),
          'e.g. { type: "academic", materials: "…" }', ev)
      }
      for (const k of Object.keys(e)) {
        if (!SEQUENCE_KEYS.includes(k)) {
          throw deny('VMU_INVALID_ARGUMENT', 'sequence[' + i + '] has an unknown key "' + k + '"',
            'allowed: ' + SEQUENCE_KEYS.join(', ') + ' — chair/actor are inherited from the meeting this sequence was convened with', ev)
        }
      }
      if (e.type !== undefined && K.typeCatalog.length && !K.typeCatalog.includes(String(e.type))) {
        throw deny('VMU_NO_SUCH_OBJECT', 'sequence[' + i + '] type "' + e.type + '" is not in vmu.meetings.typeCatalog',
          'allowed: ' + K.typeCatalog.join(', ') + ' (vmu.meetings.typeCatalog)', ev)
      }
      if (e.at !== undefined && e.at !== null) {
        try { atMs(e.at) } catch (err) {
          throw deny('VMU_INVALID_ARGUMENT', 'sequence[' + i + '].at is not a time: ' + String(e.at),
            'pass epoch milliseconds or an ISO-8601 string, or omit it to start right after the previous meeting closes', ev)
        }
      }
      return Object.assign({}, e)
    })
  }
  /**
   * The sequence as a READER sees it: how many meetings the chair declared, how many are still pending, and the next
   * one's type/kind/subject (never its materials text — the head view of a meeting is a pointer, not the content).
   * 「布置了序列」与「序列还剩几场」必须能读回，否则这个能力只在开会那一瞬可见。
   */
  function seqInfo(m) {
    const seq = Array.isArray(m && m.sequence) ? m.sequence : []
    const idx = Number.isFinite(Number(m && m.sequenceIndex)) ? Number(m.sequenceIndex) : 0
    const nx = seq[idx] || null
    return {
      total: 1 + seq.length,
      index: idx,
      remaining: Math.max(0, seq.length - idx),
      next: nx ? { type: nx.type === undefined ? null : nx.type, kind: nx.kind === undefined ? null : nx.kind, subject: nx.subject === undefined ? null : nx.subject } : null,
    }
  }
  /**
   * Open the next meeting this one was convened with. Returns `{meeting}` on success (and advances the counter on the
   * CLOSED meeting, so a second close cannot replay it), or `{error:{code,message,index,total}}` — a named failure,
   * never a silent no-op. `done:true` says "there was nothing left", which is a different fact from "one was attempted
   * and refused".
   */
  function advanceSequence(m, now) {
    const seq = Array.isArray(m && m.sequence) ? m.sequence : []
    const idx = Number.isFinite(Number(m && m.sequenceIndex)) ? Number(m.sequenceIndex) : 0
    const total = seq.length
    if (idx >= total) return { meeting: null, done: true, index: idx, total }
    const e = seq[idx]
    try {
      const opened = openSeq(Object.assign({}, e, {
        chair: m.chair === undefined ? null : m.chair,
        secretary: (e.secretary === undefined ? m.secretary : e.secretary),
        roster: (Array.isArray(e.roster) ? e.roster : (Array.isArray(m.roster) ? m.roster.slice() : [])),
        actor: (m.chair === undefined || m.chair === null) ? null : String(m.chair),
        at: (e.at === undefined ? null : e.at),
        reason: (e.reason === undefined || e.reason === null || String(e.reason).trim() === '')
          ? ('the next meeting in the sequence set when ' + String(m.id) + ' was convened')
          : e.reason,
        sequence: seq.slice(idx + 1),
      }))
      m.sequenceIndex = idx + 1
      return { meeting: opened.meeting, type: opened.type, state: opened.state, index: idx + 1, total, next: seq[idx + 1] || null }
    } catch (err) {
      return {
        meeting: null, index: idx, total,
        error: { code: (err && err.code) ? String(err.code) : 'VMU_MIDDLEWARE_FAILED', message: String((err && err.message) || err), index: idx, total },
      }
    }
  }

  return api
}

/**
 * THE MOTION TALLY, AS A PURE FUNCTION. Every return names its SOURCE and, when it falls back, WHY - measured while auditing the
 * ballot vote-right enforcement: the meeting's own \`mo.votes\` count used to come back with no \`source\` at all, while the box path
 * carried \`source:'box'\`, so a reader could not tell "the box was consulted and had nothing" from "there is no box". That matters
 * for the enforcement itself: when the vote-right test REFUSES a ballot the vote never reaches the box, the box stays empty, and the
 * silent fallback is exactly where a bypass would hide.
 *
 * EXPORTED (and declared at the END of this file, which is fine - function declarations hoist) so the four fallback branches are
 * reachable by a test. The closure above calls it with the real seams; a test calls it with fakes.
 */
export function tallyOfMotion({ meetingId, mo, boxFor, ballot }) {
  const base = {
    for: [...mo.votes.values()].filter((v) => v === 1).length,
    against: [...mo.votes.values()].filter((v) => v === 0).length,
    abstain: mo.abstain.size,
    source: 'meeting',
  }
  if (typeof boxFor !== 'function' || !ballot || typeof ballot.status !== 'function') return Object.assign(base, { fallback: 'no-box-binding' })
  const ans = boxFor({ meeting: meetingId, motion: mo.id })
  const boxId = ans && typeof ans === 'object' ? ans.boxId : ans
  if (!boxId) return Object.assign(base, { fallback: 'motion-has-no-box' })
  const st = ballot.status({ boxId })
  if (!st || st.ok !== true || !st.byChoice) return Object.assign(base, { fallback: 'box-status-unreadable' })
  const f = Number(st.byChoice['1'] || 0)
  const a = Number(st.byChoice['0'] || 0)
  if (f + a === 0) return Object.assign(base, { fallback: 'box-empty', boxId: String(boxId) })
  return { for: f, against: a, abstain: Number(st.abstain || 0), source: 'box', boxId: String(boxId) }
}
