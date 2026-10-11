// vmu kernel · discipline — the failure discipline of a member: a circuit breaker, its half-open probe, the cap on a
// suspension, whether restoring needs a human, and whether a failure must be post-mortemed
// （docs/17 the discipline table; docs/08 owns the vote side, docs/20 the privacy side）.
//
// WHAT IT IS: a per-subject failure counter with a window, the point at which it opens the breaker, how long until a
// half-open probe is allowed, how long a suspension may last, who may restore, and whether closing a failure demands a
// write-up. It decides DISCIPLINE only - it never removes a seat (kernel/recruit.js owns seats) and never votes
// (kernel/ballot.js owns votes).
//
// FACE CONVENTIONS: literal key reads; receipts carry enforced[] and fired[]; limits are refused BY NAME; a threshold of
// zero means the mechanism is OFF (never "zero failures allowed"); injected clock; read-only surfaces never mutate.
export const apiVersion = 1

export function refuse(code, message, hint, extra) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  if (extra !== undefined) e.detail = extra
  return e
}

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const boolOr = (v, d) => (typeof v === 'boolean' ? v : d)
const intOr = (v, d) => (Number.isInteger(v) ? v : d)
const msOr = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 }

export const CODE = Object.freeze({
  breakerOpen: 'VMU_DISCIPLINE_BREAKER_OPEN',
  suspendOverCap: 'VMU_DISCIPLINE_SUSPEND_OVER_CAP',
  restoreNeedsHuman: 'VMU_DISCIPLINE_RESTORE_NEEDS_HUMAN',
  postmortemRequired: 'VMU_DISCIPLINE_POSTMORTEM_REQUIRED',
})

export function createDiscipline({ clock = () => 0, log = null, settings = {}, bus = null, listCap = 100 } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createDiscipline needs a clock function', 'pass { clock: () => ms }')
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging never breaks the face */ } } }

  const cfg = () => ({
    breakerFailures: intOr(sget('vmu.discipline.breakerFailures', 0), 0),
    breakerWindowMs: msOr(sget('vmu.discipline.breakerWindowMs', 0)),
    halfOpenAfterMs: msOr(sget('vmu.discipline.halfOpenAfterMs', 0)),
    suspendMaxMs: msOr(sget('vmu.discipline.suspendMaxMs', 0)),
    restoreNeedsHuman: boolOr(sget('vmu.discipline.restoreNeedsHuman'), true),
    postmortemRequired: boolOr(sget('vmu.discipline.postmortemRequired'), true),
  })

  const subjects = new Map()   // id -> { id, failures[], suspendedUntil, suspendedClamped, openUntil, postmortems[], at }
  let dropped = 0

  const of = (id) => {
    const key = String(id)
    if (!subjects.has(key)) subjects.set(key, { id: key, failures: [], suspendedUntil: null, suspendedClamped: false, openUntil: null, postmortems: [], at: clock() })
    return subjects.get(key)
  }

  /** The breaker state at a moment. `breakerFailures: 0` means the breaker is OFF, not "zero are allowed". */
  const breakerState = (s, at) => {
    const c = cfg()
    if (c.breakerFailures <= 0) return { enabled: false, state: 'off', failures: s.failures.length }
    const windowStart = c.breakerWindowMs > 0 ? at - c.breakerWindowMs : -Infinity
    const recent = s.failures.filter((f) => f >= windowStart).length
    if (recent >= c.breakerFailures) {
      if (s.openUntil !== null && at >= s.openUntil) return { enabled: true, state: 'half-open', failures: recent, threshold: c.breakerFailures, openUntil: s.openUntil }
      return { enabled: true, state: 'open', failures: recent, threshold: c.breakerFailures, openUntil: s.openUntil }
    }
    return { enabled: true, state: 'closed', failures: recent, threshold: c.breakerFailures }
  }

  /**
   * Record a failure. When the recent count reaches `breakerFailures` inside `breakerWindowMs`, the breaker OPENS and the
   * next attempt is refused by name until `halfOpenAfterMs` has passed.
   */
  function recordFailure({ subject, kind = null, detail = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.discipline.breakerFailures', 'vmu.discipline.breakerWindowMs', 'vmu.discipline.halfOpenAfterMs']
    const fired = []
    const s = of(subject)
    const at = clock()
    // The pre-state must be taken BEFORE this failure is recorded: taking it afterwards put the new failure inside the
    // window, so both states read open and the opening branch could never fire.
    const before = breakerState(s, at)
    s.failures.push(at)
    while (s.failures.length > 500) { s.failures.shift(); dropped += 1 }
    const after = breakerState(s, at)
    if (after.state === 'open' && before.state !== 'open') {
      s.openUntil = c.halfOpenAfterMs > 0 ? at + c.halfOpenAfterMs : null
      fired.push('vmu.discipline.breakerFailures')
      if (c.halfOpenAfterMs > 0) fired.push('vmu.discipline.halfOpenAfterMs')
      say({ type: 'discipline/breaker-opened', at, subject: s.id, failures: after.failures, threshold: c.breakerFailures })
    }
    return { ok: true, subject: s.id, kind: kind === null ? null : String(kind), detail: detail === null ? null : String(detail),
      failures: after.failures, breaker: breakerState(s, at), enforced, fired }
  }

  /** May this subject act? The breaker answers, and the refusal names the threshold and the window. */
  function mayAct({ subject } = {}) {
    const c = cfg()
    const s = of(subject)
    const at = clock()
    const state = breakerState(s, at)
    const enforced = ['vmu.discipline.breakerFailures', 'vmu.discipline.breakerWindowMs', 'vmu.discipline.halfOpenAfterMs']
    if (state.state === 'open') {
      throw refuse(CODE.breakerOpen, 'the breaker is OPEN for ' + s.id + ': ' + state.failures + ' failure(s) against a threshold of ' + state.threshold,
        'wait for the half-open probe, or record a post-mortem and restore it explicitly', { subject: s.id, failures: state.failures, threshold: state.threshold, openUntil: state.openUntil, enforced, fired: ['vmu.discipline.breakerFailures'] })
    }
    if (s.suspendedUntil !== null && at < s.suspendedUntil) {
      throw refuse(CODE.breakerOpen, 'the subject is suspended until ' + s.suspendedUntil + ' (now=' + at + ')',
        'wait, or restore it deliberately', { subject: s.id, suspendedUntil: s.suspendedUntil, enforced, fired: [] })
    }
    return { ok: true, subject: s.id, state: state.state, failures: state.failures, enforced, fired: [] }
  }

  /** Suspend a subject. `suspendMaxMs` = 0 means no cap is declared; a positive cap CLAMPS and says so. */
  function suspend({ subject, ms = null, reason = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.discipline.suspendMaxMs']
    const fired = []
    const s = of(subject)
    const at = clock()
    const asked = msOr(ms)
    let until = asked > 0 ? at + asked : (c.suspendMaxMs > 0 ? at + c.suspendMaxMs : null)
    let clamped = false
    if (until !== null && c.suspendMaxMs > 0 && until - at > c.suspendMaxMs) { until = at + c.suspendMaxMs; clamped = true; fired.push('vmu.discipline.suspendMaxMs') }
    s.suspendedUntil = until
    s.suspendedClamped = clamped
    say({ type: 'discipline/suspended', at, subject: s.id, until, clamped, reason: reason === null ? null : String(reason) })
    return { ok: true, subject: s.id, suspendedUntil: until, clamped, capMs: c.suspendMaxMs, reason: reason === null ? null : String(reason), enforced, fired }
  }

  /**
   * Restore a subject. `restoreNeedsHuman` is the point: a machine cannot restore itself, so the caller must say a HUMAN
   * decided - and when `postmortemRequired` is on, the write-up must exist as well.
   */
  function restore({ subject, byHuman = null, postmortem = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.discipline.restoreNeedsHuman', 'vmu.discipline.postmortemRequired']
    const fired = []
    const s = of(subject)
    if (c.restoreNeedsHuman && byHuman !== true) {
      fired.push('vmu.discipline.restoreNeedsHuman')
      throw refuse(CODE.restoreNeedsHuman, 'vmu.discipline.restoreNeedsHuman=true: a restore must be decided by a human',
        'pass byHuman:true once a human has actually decided (the face cannot tell who you are)', { subject: s.id, enforced, fired })
    }
    const pm = postmortem === null || postmortem === undefined ? null : String(postmortem)
    if (c.postmortemRequired && !str(pm)) {
      fired.push('vmu.discipline.postmortemRequired')
      throw refuse(CODE.postmortemRequired, 'vmu.discipline.postmortemRequired=true: a restore needs a post-mortem',
        'pass postmortem:<reference to the write-up>', { subject: s.id, enforced, fired })
    }
    if (pm) s.postmortems.push({ ref: str(pm), at: clock() })
    s.suspendedUntil = null
    s.suspendedClamped = false
    s.openUntil = null
    s.failures = []
    return { ok: true, subject: s.id, restored: true, postmortems: s.postmortems.length, enforced, fired }
  }

  const status = () => ({
    ok: true,
    subjects: subjects.size, dropped,
    policy: cfg(),
    breakerOffMeansOff: cfg().breakerFailures === 0,
    readsArePure: true,
    items: [...subjects.values()].slice(0, listCap).map((s) => ({ id: s.id, failures: s.failures.length, breaker: breakerState(s, clock()), suspendedUntil: s.suspendedUntil, postmortems: s.postmortems.length })),
    at: clock(),
  })

  return { apiVersion, recordFailure, mayAct, suspend, restore, status }
}
