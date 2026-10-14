// vmu kernel · control — the operational switches: what may be paused and by whom, the watchdog interval, what counts as
// idle and what happens then, the degradation ladder, and whether stopping clears the registry
// （docs/08 the control table; docs/17 owns the human veto and is referenced, not redefined）.
//
// TWO INVARIANTS WORTH STATING.
//   ① `idleAction` defaults to `notice`: an idle system is REPORTED, never quietly recessed. A machine that ends a meeting
//      on its own initiative is the failure this face exists to prevent.
//   ② `pauseScope` does NOT include the archival surface by default. Archiving is the one thing that must keep running when
//      work is halted, so pausing it is refused by name unless the declaration is changed deliberately.
//
// FACE CONVENTIONS: literal key reads; receipts carry enforced[] and fired[]; limits refused BY NAME; nothing declared means
// nothing happens (a watchdog interval of zero is no timer, not a fake beat); injected clock; reads never mutate.
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
const listOf = (v, fallback) => (Array.isArray(v) && v.length ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : fallback.slice())
const msOr = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 }

const DEGRADE_STEPS = Object.freeze(['read-only', 'report-only', 'no-spawn'])
const LOG_MAX = 200

export const CODE = Object.freeze({
  pauseScope: 'VMU_CONTROL_PAUSE_SCOPE',
  pauseRole: 'VMU_CONTROL_PAUSE_ROLE',
  degradeStep: 'VMU_CONTROL_DEGRADE_STEP',
  // ROUND 2 — the human may retune a DECLARED knob in mid-flight (task C). A key that is not in the declared
  // list, a role that may not tune, or a kernel with no settings-write seam each get their own named refusal;
  // none of them is silently ignored.
  paramUndeclared: 'VMU_CONTROL_PARAM_UNDECLARED',
  paramRole: 'VMU_CONTROL_PARAM_ROLE',
  paramUnavailable: 'VMU_CONTROL_PARAM_UNAVAILABLE',
})

export function createControl({ clock = () => 0, log = null, settings = {}, bus = null, listCap = 100, approval = null, setSetting = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createControl needs a clock function', 'pass { clock: () => ms }')
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging never breaks the face */ } } }
  // Hook producers pass the NAME first (`kernel/bus.js` refuses a non-string hook) and catch the async rejection
  // on the promise: an object-shaped emit is swallowed by the bus and never reaches any middleware.
  const emit = (name, payload) => {
    if (!bus || typeof bus.emit !== 'function') return null
    try {
      const r = bus.emit(name, payload)
      if (r && typeof r.catch === 'function') r.catch(() => {})
      return r
    } catch (e) { return null }
  }

  const cfg = () => ({
    pauseScope: listOf(sget('vmu.control.pauseScope'), ['tasks', 'meetings', 'ballots', 'work']),
    watchdogIntervalMs: msOr(sget('vmu.control.watchdogIntervalMs')),
    idleAfterMs: msOr(sget('vmu.control.idleAfterMs')),
    idleAction: ['notice', 'recess', 'none'].includes(sget('vmu.control.idleAction')) ? sget('vmu.control.idleAction') : 'notice',
    degradeSteps: Array.isArray(sget('vmu.control.degradeSteps')) ? sget('vmu.control.degradeSteps').filter((x) => DEGRADE_STEPS.includes(x)) : [],
    canPauseRoles: listOf(sget('vmu.control.canPauseRoles'), ['office', 'chair']),
    stopClearsRegistry: sget('vmu.control.stopClearsRegistry') !== false,
    // ROUND 2 (task C): who may retune a declared knob, and WHICH knobs exist as tunable at all.
    canSetRoles: listOf(sget('vmu.control.canSetRoles'), ['office']),
    tunableKeys: listOf(sget('vmu.control.tunableKeys'), []),
  })

  const paused = new Map()    // scope -> { scope, byRole, reason, at }
  const registry = new Set()  // what stop() would clear, when it is declared to
  const trail = []            // the tune audit trail (bounded), so "who changed what, from what" survives the call
  let degradedTo = 0
  let stops = 0
  let dropped = 0

  /** Pause a surface. `canPauseRoles` decides who may, `pauseScope` decides what may be paused at all. */
  function pause({ scope = null, byRole = null, reason = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.control.canPauseRoles', 'vmu.control.pauseScope']
    const fired = []
    const sc = str(scope)
    if (!sc) throw refuse('VMU_INVALID_ARGUMENT', 'pause needs a scope', 'e.g. pause({ scope: "tasks", byRole: "chair" })')
    if (!c.pauseScope.includes(sc)) {
      fired.push('vmu.control.pauseScope')
      throw refuse(CODE.pauseScope, 'the scope is not in vmu.control.pauseScope: ' + sc,
        'declared scopes: ' + c.pauseScope.join(', ') + ' (archiving is deliberately absent: it must keep running when work halts)', { scope: sc, declared: c.pauseScope.slice(), enforced, fired })
    }
    const role = str(byRole)
    if (!role || !c.canPauseRoles.includes(role)) {
      fired.push('vmu.control.canPauseRoles')
      throw refuse(CODE.pauseRole, 'this role may not pause: ' + (role || '(none)'),
        'may pause: ' + c.canPauseRoles.join(', ') + ' (vmu.control.canPauseRoles)', { byRole: role || null, declared: c.canPauseRoles.slice(), enforced, fired })
    }
    const at = clock()
    const rec = { scope: sc, byRole: role, reason: reason === null ? null : String(reason), at }
    paused.set(sc, rec)
    say({ type: 'control/paused', at, scope: sc, byRole: role })
    emit('control/scope-paused', { at, scope: sc, byRole: role, reason: rec.reason })
    return { ok: true, scope: sc, byRole: role, reason: rec.reason, at, enforced, fired }
  }

  /** Resume a surface. Read-only with respect to the declaration: it removes a pause, nothing else. */
  function resume({ scope = null, byRole = null } = {}) {
    const c = cfg()
    const sc = str(scope)
    if (!paused.has(sc)) return { ok: true, scope: sc, resumed: false, note: 'that scope was not paused', enforced: ['vmu.control.canPauseRoles'], fired: [] }
    const role = str(byRole)
    if (!role || !c.canPauseRoles.includes(role)) {
      throw refuse(CODE.pauseRole, 'this role may not resume: ' + (role || '(none)'),
        'may pause/resume: ' + c.canPauseRoles.join(', ') + ' (vmu.control.canPauseRoles)', { byRole: role || null, enforced: ['vmu.control.canPauseRoles'], fired: ['vmu.control.canPauseRoles'] })
    }
    const rec = paused.get(sc)
    paused.delete(sc)
    // The resume is as auditable as the pause: who lifted what, and how long it was held (task C: 留痕).
    const at = clock()
    say({ type: 'control/resumed', at, scope: sc, byRole: role, pausedAt: rec ? rec.at : null })
    emit('control/scope-resumed', { at, scope: sc, byRole: role, pausedAt: rec ? rec.at : null })
    return { ok: true, scope: sc, resumed: true, byRole: role, pausedAt: rec ? rec.at : null, heldMs: rec ? at - rec.at : null, enforced: ['vmu.control.canPauseRoles'], fired: [] }
  }

  /**
   * Mid-flight retune of a DECLARED knob (task C). Three refusals, all named: the key must be in the declared
   * `vmu.control.tunableKeys` (an empty list means "no tuning"), the role must be in `vmu.control.canSetRoles`,
   * and the kernel must have been given a settings-write seam — a face that cannot write must not pretend it did.
   */
  function tune({ key = null, value = undefined, byRole = null } = {}) {
    const c = cfg()
    const k = str(key)
    const role = str(byRole)
    if (!k) throw refuse('VMU_INVALID_ARGUMENT', 'tune needs a key', 'e.g. tune({ key: "vmu.control.idleAfterMs", value: 60000, byRole: "office" })')
    if (!c.tunableKeys.length || !c.tunableKeys.includes(k)) {
      say({ type: 'control/param-refused', at: clock(), key: k, code: CODE.paramUndeclared, byRole: role || null })
      emit('control/param-refused', { at: clock(), key: k, code: CODE.paramUndeclared, byRole: role || null })
      throw refuse(CODE.paramUndeclared, 'the key is not in vmu.control.tunableKeys: ' + k,
        c.tunableKeys.length ? 'tunable: ' + c.tunableKeys.join(', ') : 'the declared list is EMPTY, so no parameter may be changed at all',
        { key: k, declared: c.tunableKeys.slice(), enforced: ['vmu.control.tunableKeys'], fired: [CODE.paramUndeclared] })
    }
    if (!role || !c.canSetRoles.includes(role)) {
      say({ type: 'control/param-refused', at: clock(), key: k, code: CODE.paramRole, byRole: role || null })
      emit('control/param-refused', { at: clock(), key: k, code: CODE.paramRole, byRole: role || null })
      throw refuse(CODE.paramRole, 'this role may not change parameters: ' + (role || '(none)'),
        'may tune: ' + c.canSetRoles.join(', ') + ' (vmu.control.canSetRoles)', { byRole: role || null, declared: c.canSetRoles.slice(), enforced: ['vmu.control.canSetRoles'], fired: [CODE.paramRole] })
    }
    if (typeof setSetting !== 'function') {
      throw refuse(CODE.paramUnavailable, 'this kernel has no settings-write seam, so ' + k + ' cannot be changed',
        'the kernel passes setSetting when it builds the control face; a face that cannot write must say so')
    }
    const before = sget(k, undefined)
    let outcome
    try { outcome = setSetting(k, value) } catch (e) {
      throw refuse(CODE.paramUnavailable, 'the settings-write seam refused ' + k + ': ' + String((e && e.message) || e),
        'the key may be frozen (H0) or unknown to the schema', { key: k, error: String((e && e.code) || '') })
    }
    const rec = { key: k, from: before === undefined ? null : before, to: value, byRole: role, at: clock() }
    trail.push(rec)
    if (trail.length > LOG_MAX) { trail.shift(); dropped += 1 }
    say({ type: 'control/param-set', at: rec.at, key: k, byRole: role })
    emit('control/param-set', { at: rec.at, key: k, value, byRole: role })
    return { ok: true, key: k, from: rec.from, to: value, byRole: role, at: rec.at, seam: outcome === undefined ? 'set' : outcome, enforced: ['vmu.control.tunableKeys', 'vmu.control.canSetRoles'], fired: [] }
  }

  /** May this scope act? A paused surface says so by name, and the refusal names who paused it. */
  function mayAct({ scope = null } = {}) {
    const sc = str(scope)
    const rec = paused.get(sc)
    if (rec) {
      throw refuse('VMU_CONTROL_PAUSED', 'scope is paused: ' + sc + ' (by ' + rec.byRole + ')',
        'resume it with resume({ scope, byRole })', { scope: sc, byRole: rec.byRole, pausedAt: rec.at })
    }
    // The human approval gate, when the kernel wired one: a paused scope is the control face's own gate, and a
    // gated action is the human's. Both are consulted here so a caller has ONE question to ask ("may I act?").
    if (typeof approval === 'function') approval({ action: 'control.' + (sc || 'scope'), subject: sc || null })
    return { ok: true, scope: sc, paused: false, enforced: [], fired: [] }
  }

  /**
   * The watchdog. `watchdogIntervalMs: 0` means there is NO timer - this face reports that rather than pretending a beat
   * happened, because the design volume says so explicitly ("0＝无定时器").
   */
  function watchdog({ lastBeatAt = null, at = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.control.watchdogIntervalMs']
    if (c.watchdogIntervalMs === 0) {
      return { ok: true, timer: false, due: false, note: 'vmu.control.watchdogIntervalMs=0: there is no watchdog timer', enforced, fired: ['vmu.control.watchdogIntervalMs'] }
    }
    const now = Number.isFinite(at) ? Number(at) : clock()
    if (lastBeatAt === null || !Number.isFinite(Number(lastBeatAt))) {
      return { ok: true, timer: true, due: true, reason: 'no beat has ever been recorded', intervalMs: c.watchdogIntervalMs, enforced, fired: [] }
    }
    const elapsed = now - Number(lastBeatAt)
    return { ok: true, timer: true, due: elapsed >= c.watchdogIntervalMs, elapsedMs: elapsed, intervalMs: c.watchdogIntervalMs, enforced, fired: [] }
  }

  /**
   * The idle decision. `idleAfterMs: 0` means idleness is not defined, so nothing happens. `idleAction` decides what is
   * REPORTED - and the default `notice` never recesses anything: this face has no power to end a meeting by itself.
   */
  function idleState({ lastActivityAt = null, at = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.control.idleAfterMs', 'vmu.control.idleAction']
    if (c.idleAfterMs === 0) {
      return { ok: true, idle: false, action: 'none', note: 'vmu.control.idleAfterMs=0: idleness is not defined', enforced, fired: ['vmu.control.idleAfterMs'] }
    }
    const now = Number.isFinite(at) ? Number(at) : clock()
    const elapsed = lastActivityAt === null || !Number.isFinite(Number(lastActivityAt)) ? null : now - Number(lastActivityAt)
    const isIdle = elapsed !== null && elapsed >= c.idleAfterMs
    if (!isIdle) return { ok: true, idle: false, elapsedMs: elapsed, afterMs: c.idleAfterMs, action: 'none', enforced, fired: [] }
    const act = c.idleAction
    return { ok: true, idle: true, elapsedMs: elapsed, afterMs: c.idleAfterMs, action: act,
      notice: act === 'notice' ? 'idle for ' + elapsed + 'ms; this is a NOTICE only - nothing is recessed automatically (vmu.control.idleAction)' : null,
      recessed: false,
      note: act === 'recess' ? 'the declaration asks for a recess, but this face RECORDS the decision and does not end a meeting: that belongs to the meeting face' : (act === 'none' ? 'the declaration asks for nothing' : 'notice only'),
      enforced, fired: act === 'notice' ? [] : ['vmu.control.idleAction'] }
  }

  /** Degrade one step. `degradeSteps` is the declared ladder; a step outside it is refused by name. */
  function degrade({ step = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.control.degradeSteps']
    const s = str(step)
    if (c.degradeSteps.length === 0) {
      throw refuse(CODE.degradeStep, 'vmu.control.degradeSteps is empty: no degradation is declared',
        'declare the ladder deliberately (subset of ' + DEGRADE_STEPS.join(', ') + ')', { declared: [], enforced, fired: ['vmu.control.degradeSteps'] })
    }
    if (!c.degradeSteps.includes(s)) {
      throw refuse(CODE.degradeStep, 'the degradation step is not declared: ' + (s || '(none)'),
        'declared ladder: ' + c.degradeSteps.join(' -> ') + ' (vmu.control.degradeSteps)', { step: s || null, declared: c.degradeSteps.slice(), enforced, fired: ['vmu.control.degradeSteps'] })
    }
    degradedTo = c.degradeSteps.indexOf(s) + 1
    say({ type: 'control/degraded', at: clock(), step: s, level: degradedTo })
    return { ok: true, step: s, level: degradedTo, ladder: c.degradeSteps.slice(), enforced, fired: [] }
  }

  /** Stop. `stopClearsRegistry` is the declared behaviour, and the receipt states what actually happened. */
  function stop() {
    const c = cfg()
    const cleared = c.stopClearsRegistry ? registry.size : 0
    if (c.stopClearsRegistry) registry.clear()
    stops += 1
    paused.clear()
    degradedTo = 0
    return { ok: true, stopped: true, cleared, registrySize: registry.size, stopClearsRegistry: c.stopClearsRegistry,
      enforced: ['vmu.control.stopClearsRegistry'], fired: c.stopClearsRegistry ? [] : ['vmu.control.stopClearsRegistry'] }
  }

  /** Registration is the face's own bookkeeping, used only to make `stopClearsRegistry` observable. */
  function register({ id = null } = {}) {
    const key = str(id)
    if (!key) throw refuse('VMU_INVALID_ARGUMENT', 'register needs an id', 'pass { id: "..." }')
    registry.add(key)
    return { ok: true, id: key, registrySize: registry.size, enforced: [], fired: [] }
  }

  const status = () => ({
    ok: true,
    paused: [...paused.values()].map((x) => Object.assign({}, x)),
    registrySize: registry.size, degradedLevel: degradedTo, stops, dropped,
    // ROUND 2: the tune surface, so an operator sees both the declaration and what was actually changed.
    tunableKeys: cfg().tunableKeys.slice(), canSetRoles: cfg().canSetRoles.slice(),
    tuned: trail.length, lastTune: trail.length ? Object.assign({}, trail[trail.length - 1]) : null,
    approvalGateAttached: typeof approval === 'function',
    settingsWriteSeam: typeof setSetting === 'function',
    policy: cfg(),
    archivingNeverPausedByDefault: !cfg().pauseScope.includes('archive'),
    idleNeverRecessesByItself: true,
    readsArePure: true,
    at: clock(),
    listCap,
  })

  return { apiVersion, pause, resume, mayAct, watchdog, idleState, degrade, stop, register, tune, tuneTrail: () => trail.map((t) => Object.assign({}, t)), status }
}
