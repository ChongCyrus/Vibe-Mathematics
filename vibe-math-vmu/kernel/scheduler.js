// vmu kernel · scheduler — time-based triggers with an INJECTED timer seam (docs/08 §5 / §12.6, docs/21 §5.3).
//
// Design source: docs/08-primitives-meeting-ballot-workflow.md §5 (control flow: pause/resume/stop/heartbeat)
// and §12.6 / §19.6 (`vmu.scheduler.*` / `vmu.schedule.*`); docs/21-observability-and-operations.md §5.3 owns
// the ALERTING rules (thresholds, inhibition, escalation) — this module only REPORTS what is due and, when
// explicitly allowed, emits a hook; it never redefines the alerting surface.
//
// FIVE HARD INVARIANTS (each one is a refusal or an explicit flag — never a pretence):
//   ① THE TIMER IS AN INJECTED SEAM. With no `timer`, the ONLY way to advance is `tick()`; `arm()` answers
//      `armed:false, mode:'tick-only'` and NEVER pretends a timer exists (a configured `timeSource:'host-timer'`
//      without a seam is refused by name: `VMU_CONTROL_NO_TIMER`).
//   ② `triggerVia` DEFAULTS TO `none`: a due item is REPORTED (`reported[]`, `VMU_SCHEDULE_OVERDUE_REPORT`),
//      and the flow is NOT triggered. Triggering requires an explicit `middleware` / `script` and goes out as
//      a `bus.emit` — the kernel never starts work on its own because a clock passed a number.
//   ③ DUE-NESS USES THE INJECTED CLOCK ONLY (`clock()` / an explicit `at`), never the real time.
//   ④ PENDING ITEMS HAVE A CAP: exceeding it is a NAMED refusal (`VMU_SCHEDULE_LIMIT`) that states current/limit.
//   ⑤ CANCELLING IS AUDITED (who / why / when) and an unknown id is refused by name; `tick()` reports
//      `fired / reported / dropped / skipped` — an overdue item is never silently discarded.
// Invariants shared with the rest of the kernel (board.js / metrics.js / delegation.js / arbitration.js / …):
//   · every refusal is NAMED (VMU_* + hint) — never a bare exception
//   · every upper bound reports how many items were DROPPED — never silent (due/list/history)
//   · zero mechanism: no seeds and no settings ⇒ everything answers empty and nothing throws
//   · READ paths (due/list/history/status) never mutate the schedule
// SETTINGS READ CONVENTION (kernel/guard.js): every key is read as a PLAIN LITERAL — the settings table and
// the docs audit both discover "wired" keys by scanning file text for the literal.
export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

// The operative names (this task) …
const K_TRIGGER_VIA = 'vmu.schedule.triggerVia'
const K_MAX_PENDING = 'vmu.schedule.maxPending'
const K_TIME_SOURCE = 'vmu.schedule.timeSource'
const K_ACTIONS = 'vmu.schedule.actionsAllowed'
const K_SEEDS = 'vmu.schedule.triggers'
const K_GRACE = 'vmu.schedule.overdueGraceMs'
const K_COALESCE = 'vmu.schedule.coalesceMissed'
const K_MAX_RECURRENCES = 'vmu.schedule.maxRecurrences'
const K_MIN_INTERVAL = 'vmu.schedule.minIntervalMs'
const K_MAX_HORIZON = 'vmu.schedule.maxHorizonMs'
const K_CANCEL_REASON = 'vmu.schedule.cancelNeedsReason'
// … and the spellings docs/08 §12.6/§19.6 declared (read as fallbacks so either registration works).
// INTEGRATOR RULING: `vmu.schedule.*` is the canonical family (docs/08 §12.6), so this alias now points at the
// canonical name. Reading an undeclared twin would force the gate to demand a second declaration for one knob.
const A_TRIGGER_VIA = 'vmu.schedule.triggerVia'
const A_MAX_PENDING = 'vmu.scheduler.maxTriggers'
const A_TIME_SOURCE = 'vmu.scheduler.timeSource'
const A_ACTIONS = 'vmu.scheduler.actionsAllowed'
const A_SEEDS = 'vmu.scheduler.triggers'

const TRIGGER_VIA = Object.freeze(['none', 'middleware', 'script'])
const TIME_SOURCES = Object.freeze(['clock', 'host-timer'])
const ACTIONS = Object.freeze(['emit-hook', 'prompt'])
const DEFAULT_LIST_CAP = 200

/** createScheduler — `timer` is an OPTIONAL injected seam: `{arm,disarm}` | `{schedule,cancel}` | `{set,clear}` | `{setTimeout,clearTimeout}`. */
export function createScheduler({ clock = () => 0, log = null, settings = {}, bus = null, timer = null, isPaused = null } = {}) {
  if (typeof clock !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createScheduler needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
  }

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const either = (canonical, alias, def) => {
    const a = sget(canonical, undefined)
    if (a !== undefined) return a
    const b = sget(alias, undefined)
    return b === undefined ? def : b
  }
  const say = (event) => {
    if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* logging must never break the schedule it records */ } }
  }

  const triggerViaRaw = either(K_TRIGGER_VIA, A_TRIGGER_VIA, 'none')
  const triggerVia = TRIGGER_VIA.includes(triggerViaRaw) ? triggerViaRaw : 'none'
  const maxPendingRaw = either(K_MAX_PENDING, A_MAX_PENDING, 8)
  const maxPending = Number.isInteger(maxPendingRaw) && maxPendingRaw >= 0 ? maxPendingRaw : 8
  const timeSourceRaw = either(K_TIME_SOURCE, A_TIME_SOURCE, 'clock')
  const timeSource = TIME_SOURCES.includes(timeSourceRaw) ? timeSourceRaw : 'clock'
  const actionsRaw = either(K_ACTIONS, A_ACTIONS, ACTIONS.slice())
  const actionsAllowed = Array.isArray(actionsRaw) && actionsRaw.length ? actionsRaw.filter((x) => typeof x === 'string' && x) : ACTIONS.slice()
  const seedsRaw = either(K_SEEDS, A_SEEDS, null)
  const overdueGraceMs = nonNegInt(sget(K_GRACE, 0), 0)
  const coalesceMissed = sget(K_COALESCE, true) !== false
  const maxRecurrences = nonNegInt(sget(K_MAX_RECURRENCES, 0), 0)
  const minIntervalMs = nonNegInt(sget(K_MIN_INTERVAL, 0), 0)
  const maxHorizonMs = nonNegInt(sget(K_MAX_HORIZON, 0), 0)
  const cancelNeedsReason = sget(K_CANCEL_REASON, true) !== false

  function nonNegInt(v, def) { return Number.isInteger(v) && v >= 0 ? v : def }

  // ── state (mutated only by once/every/cancel/tick/arm/disarm) ──────────────────────────────────────
  const items = new Map()
  const order = []
  const historyRows = []
  const droppedHistory = { n: 0 }
  const refusals = new Map()
  const unwired = new Map()
  const declaredTopics = new Set()
  const handles = new Map()   // itemId -> timer handle
  let seq = 0
  const counts = { fired: 0, reported: 0, dropped: 0, skipped: 0, coalesced: 0 }

  const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by)
  const objOf = (map) => { const o = {}; for (const k of [...map.keys()].sort()) o[k] = map.get(k); return o }
  const sumOf = (map) => [...map.values()].reduce((a, b) => a + b, 0)
  const now = () => clock()
  const itemOf = (id) => items.get(id) || null
  const pendingItems = () => order.map((id) => items.get(id)).filter((it) => it && it.state === 'pending')

  const deny = (code, message, hint) => {
    bump(refusals, code, 1)
    say({ type: 'schedule/refused', at: now(), code, message })
    return refuse(code, message, hint)
  }
  const record_ = (row) => {
    historyRows.push(Object.assign({ at: now() }, row))
    while (historyRows.length > DEFAULT_LIST_CAP) { historyRows.shift(); droppedHistory.n += 1 }
  }
  const fire = (hook, payload) => {
    if (!bus || typeof bus.emit !== 'function') { bump(unwired, 'bus:' + hook, 1); return false }
    try {
      if (!declaredTopics.has(hook) && typeof bus.declareTopic === 'function') { bus.declareTopic(hook); declaredTopics.add(hook) }
      bus.emit(hook, Object.assign({ at: now() }, payload))
      declaredTopics.add(hook)
      return true
    } catch (e) {
      bump(unwired, 'bus:' + hook, 1)
      say({ type: 'schedule/hook-unwired', at: now(), hook, why: String((e && e.message) || e) })
      return false
    }
  }
  /** The injected timer seam: tolerate the four shapes a host may offer, and say which one was found. */
  const timerShape = () => {
    if (!timer || typeof timer !== 'object') return null
    if (typeof timer.arm === 'function' && typeof timer.disarm === 'function') return 'arm/disarm'
    if (typeof timer.schedule === 'function' && typeof timer.cancel === 'function') return 'schedule/cancel'
    if (typeof timer.set === 'function' && typeof timer.clear === 'function') return 'set/clear'
    if (typeof timer.setTimeout === 'function' && typeof timer.clearTimeout === 'function') return 'setTimeout/clearTimeout'
    return null
  }
  const timerCall = (atMs, onFire) => {
    const delayMs = Math.max(0, atMs - now())
    const shape = timerShape()
    if (shape === 'arm/disarm') return timer.arm({ at: atMs, delayMs, onFire })
    if (shape === 'schedule/cancel') return timer.schedule(atMs, onFire)
    if (shape === 'set/clear') return timer.set(atMs, onFire)
    if (shape === 'setTimeout/clearTimeout') return timer.setTimeout(onFire, delayMs)
    return null
  }
  const timerClear = (handle) => {
    const shape = timerShape()
    if (handle === null || handle === undefined) return false
    try {
      if (shape === 'arm/disarm') return timer.disarm(handle) !== false
      if (shape === 'schedule/cancel') return timer.cancel(handle) !== false
      if (shape === 'set/clear') return timer.clear(handle) !== false
      if (shape === 'setTimeout/clearTimeout') return timer.clearTimeout(handle) !== false
    } catch (e) { bump(unwired, 'timer-seam', 1); return false }
    return false
  }
  const normalizeAt = (value, label) => {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return Date.parse(value)
    throw deny('VMU_SCHEDULE_WINDOW_INVALID', label + ' must be milliseconds or an ISO timestamp', 'e.g. { inMs: 60000 } or { at: 1700000000000 }')
  }
  const checkAction = (what) => {
    if (typeof what !== 'string' || !what.trim()) throw deny('VMU_INVALID_ARGUMENT', 'a trigger needs a non-empty `what` (the hook name or prompt label)', 'e.g. { what: "lab/heartbeat" }')
    if (what.includes('/')) {
      const domain = what.split('/')[0]
      const kind = ['prompt', 'emit-hook'].includes(domain) ? (domain === 'prompt' ? 'prompt' : 'emit-hook') : 'emit-hook'
      if (!actionsAllowed.includes(kind)) {
        throw deny('VMU_SCHEDULE_TRIGGER_FORBIDDEN', 'action "' + kind + '" is not allowed by vmu.schedule.actionsAllowed: ' + what,
          'allowed actions: ' + actionsAllowed.join(', ') + ' — a trigger may emit a hook or a prompt, never change state')
      }
    }
  }
  const register = ({ kind, atMs, intervalMs, what, payload, by, maxRuns }) => {
    if (maxPending > 0 && pendingItems().length >= maxPending) {
      throw deny('VMU_SCHEDULE_LIMIT', 'too many pending triggers: ' + pendingItems().length + '/' + maxPending + ' (vmu.schedule.maxPending / vmu.scheduler.maxTriggers)',
        'cancel a pending trigger, or raise the cap — the kernel never silently drops a scheduled item')
    }
    const id = 's-' + (++seq)
    const it = {
      id, kind, what: String(what), payload: payload && typeof payload === 'object' ? Object.assign({}, payload) : null,
      atMs, intervalMs: intervalMs === null ? null : intervalMs, runs: 0, maxRuns,
      state: 'pending', createdAt: now(), createdBy: by === null || by === undefined ? null : String(by),
      cancelledAt: null, cancelledBy: null, cancelReason: null, completedAt: null, completedReason: null,
    }
    items.set(id, it)
    order.push(id)
    record_({ type: 'schedule/registered', id, kind, what: it.what, atMs, intervalMs, maxRuns })
    say({ type: 'schedule/registered', at: it.createdAt, id, kind, atMs })
    return it
  }

  const api = {
    apiVersion,

    /** One-shot trigger at an absolute time (`at`) or after a delay (`inMs`). */
    once({ at = null, inMs = null, what, payload = null, by = null } = {}) {
      if (at === null && inMs === null) throw deny('VMU_SCHEDULE_WINDOW_INVALID', 'once() needs `at` or `inMs`', 'e.g. once({ inMs: 60000, what: "lab/heartbeat" })')
      if (at !== null && inMs !== null) throw deny('VMU_INVALID_ARGUMENT', 'pass either `at` or `inMs`, not both', 'they are two spellings of the same instant')
      checkAction(what)
      const atMs = at !== null ? normalizeAt(at, 'at') : now() + normalizeAt(inMs, 'inMs')
      if (maxHorizonMs > 0 && atMs > now() + maxHorizonMs) {
        throw deny('VMU_SCHEDULE_WINDOW_INVALID', 'the trigger is beyond the horizon: ' + atMs + ' > now+' + maxHorizonMs + 'ms (vmu.schedule.maxHorizonMs)',
          'schedule it closer, or raise vmu.schedule.maxHorizonMs')
      }
      const it = register({ kind: 'once', atMs, intervalMs: null, what, payload, by, maxRuns: 1 })
      return { ok: true, id: it.id, kind: it.kind, what: it.what, at: atMs, triggerVia, willTrigger: triggerVia !== 'none', now: now() }
    },

    /** Recurring trigger. `intervalMs` is mandatory and floor-checked; `maxRuns` bounds the repetitions. */
    every({ intervalMs, what, payload = null, by = null, at = null, maxRuns = null } = {}) {
      if (!(Number.isInteger(intervalMs) && intervalMs > 0)) {
        throw deny('VMU_SCHEDULE_RECURRENCE_INVALID', 'every() needs a positive integer intervalMs', 'e.g. every({ intervalMs: 60000, what: "lab/heartbeat" })')
      }
      if (minIntervalMs > 0 && intervalMs < minIntervalMs) {
        throw deny('VMU_SCHEDULE_RECURRENCE_INVALID', 'intervalMs ' + intervalMs + ' is below the floor ' + minIntervalMs + ' (vmu.schedule.minIntervalMs)',
          'raise the interval, or lower vmu.schedule.minIntervalMs — a hot loop is never a schedule')
      }
      checkAction(what)
      const runs = maxRuns === null ? maxRecurrences : maxRuns
      if (!(Number.isInteger(runs) && runs >= 0)) throw deny('VMU_INVALID_ARGUMENT', 'maxRuns must be an integer >= 0 (0 = unlimited)', 'omit it to use vmu.schedule.maxRecurrences')
      const start = at === null ? now() + intervalMs : normalizeAt(at, 'at')
      if (maxHorizonMs > 0 && start > now() + maxHorizonMs) {
        throw deny('VMU_SCHEDULE_WINDOW_INVALID', 'the first run is beyond the horizon: ' + start + ' > now+' + maxHorizonMs + 'ms (vmu.schedule.maxHorizonMs)', 'schedule it closer, or raise the horizon')
      }
      const it = register({ kind: 'every', atMs: start, intervalMs, what, payload, by, maxRuns: runs })
      return { ok: true, id: it.id, kind: it.kind, what: it.what, nextAt: start, intervalMs, maxRuns: runs, triggerVia, willTrigger: triggerVia !== 'none' }
    },

    /** READ-ONLY: what is due at `at` (defaults to the injected clock). Nothing is advanced or fired. */
    due({ at = null, limit = DEFAULT_LIST_CAP } = {}) {
      const when = at === null ? now() : normalizeAt(at, 'at')
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const all = pendingItems().filter((it) => it.atMs <= when)
        .map((it) => ({ id: it.id, kind: it.kind, what: it.what, at: it.atMs, overdueMs: when - it.atMs, runs: it.runs, armed: handles.has(it.id) }))
      const kept = all.slice(0, cap)
      return {
        ok: true, at: when, due: kept, count: kept.length, available: all.length,
        dropped: all.length - kept.length, truncated: all.length > kept.length,
        triggerVia, willTrigger: triggerVia !== 'none',
        note: triggerVia === 'none'
          ? 'triggerVia=none: due items are REPORTED only — the flow is not triggered (vmu.schedule.triggerVia)'
          : 'triggerVia=' + triggerVia + ': a tick() emits the hook through the bus',
      }
    },

    /**
     * Advance to `at` (defaults to the injected clock) and process what is due. The ONLY advancing call:
     * with no timer seam this is how time moves. Reports fired / reported / dropped / skipped — never silent.
     */
    tick({ at = null } = {}) {
      const when = at === null ? now() : normalizeAt(at, 'at')
      const paused = typeof isPaused === 'function' ? !!isPaused() : false
      const fired = []
      const reported = []
      const dropped = []
      const skipped = []
      let coalesced = 0
      const dueList = pendingItems().filter((it) => it.atMs <= when)
      for (const it of dueList) {
        if (paused) {
          counts.skipped += 1
          skipped.push({ id: it.id, why: 'kernel-paused' })
          record_({ type: 'schedule/skipped', id: it.id, why: 'kernel-paused', at: when })
          continue
        }
        const overdueMs = when - it.atMs
        if (overdueGraceMs > 0 && overdueMs > overdueGraceMs) {
          it.state = 'cancelled'
          it.cancelledAt = when
          it.cancelledBy = 'scheduler'
          it.cancelReason = 'overdue by ' + overdueMs + 'ms > ' + overdueGraceMs + 'ms (vmu.schedule.overdueGraceMs)'
          counts.dropped += 1
          dropped.push({ id: it.id, what: it.what, overdueMs, reason: it.cancelReason })
          record_({ type: 'schedule/dropped', id: it.id, overdueMs, why: it.cancelReason, at: when })
          say({ type: 'schedule/dropped', at: when, id: it.id, code: 'VMU_SCHEDULE_OVERDUE_REPORT', why: it.cancelReason })
          continue
        }
        // How many intervals were missed (a recurring item coalesces them into ONE run, and says so).
        let missed = 0
        if (it.kind === 'every' && it.intervalMs > 0 && overdueMs >= it.intervalMs) {
          missed = Math.floor(overdueMs / it.intervalMs)
          if (coalesceMissed) coalesced += missed
        }
        it.runs += 1
        const event = {
          type: 'schedule/due', at: when, id: it.id, what: it.what, kind: it.kind, runs: it.runs,
          triggerVia, missed, payload: it.payload,
        }
        if (triggerVia === 'none') {
          counts.reported += 1
          reported.push({ id: it.id, what: it.what, overdueMs, runs: it.runs, missed, code: 'VMU_SCHEDULE_OVERDUE_REPORT' })
          say(Object.assign({ code: 'VMU_SCHEDULE_OVERDUE_REPORT' }, event))
        } else {
          const delivered = fire(it.what, { scheduleId: it.id, what: it.what, kind: it.kind, runs: it.runs, missed, triggerVia, payload: it.payload })
          if (delivered) {
            counts.fired += 1
            fired.push({ id: it.id, what: it.what, runs: it.runs, missed, via: triggerVia })
          } else {
            counts.skipped += 1
            skipped.push({ id: it.id, what: it.what, why: 'bus-unsupported-or-failed' })
            say({ type: 'schedule/skipped', at: when, id: it.id, why: 'bus-unsupported-or-failed' })
          }
        }
        const done = it.kind === 'once' || (it.maxRuns > 0 && it.runs >= it.maxRuns)
        if (done) {
          it.state = 'completed'
          it.completedAt = when
          it.completedReason = it.kind === 'once'
            ? (triggerVia === 'none' ? 'one-shot reported (triggerVia=none: nothing was triggered)' : 'one-shot fired')
            : 'maxRuns reached (' + it.maxRuns + ')'
        } else {
          it.atMs = it.atMs + it.intervalMs * (coalesceMissed && missed > 0 ? missed + 1 : 1)
        }
        record_({ type: 'schedule/tick', id: it.id, runs: it.runs, at: when, delivered: triggerVia !== 'none' && fired.some((x) => x.id === it.id), missed })
      }
      return {
        ok: true, at: when, paused,
        fired, reported, dropped, skipped,
        firedCount: fired.length, reportedCount: reported.length, droppedCount: dropped.length, skippedCount: skipped.length,
        coalesced, pending: pendingItems().length, triggerVia,
        note: triggerVia === 'none'
          ? 'triggerVia=none: due items were REPORTED, not triggered (set vmu.schedule.triggerVia to middleware|script to emit hooks)'
          : 'due items were emitted through the bus (' + fired.length + ' fired, ' + skipped.length + ' skipped)',
      }
    },

    /** Cancel an item. AUDITED (who/why/when); an unknown id is refused by name. */
    cancel({ id, by, reason = null } = {}) {
      const it = itemOf(id)
      if (!it) throw deny('VMU_NO_SUCH_OBJECT', 'unknown scheduled item: ' + String(id), 'known: ' + (order.join(', ') || '(none)'))
      if (typeof by !== 'string' || !by.trim()) throw deny('VMU_INVALID_ARGUMENT', 'cancel needs a non-empty `by` (who cancels)', 'the cancellation is audited: who / why / when')
      if (cancelNeedsReason && (typeof reason !== 'string' || !reason.trim())) {
        throw deny('VMU_REASON_REQUIRED', 'cancelling ' + it.id + ' requires a reason (vmu.schedule.cancelNeedsReason)', 'say why the trigger is withdrawn — a cancellation must be explainable')
      }
      if (it.state === 'cancelled') return { ok: true, id: it.id, already: true, cancelledAt: it.cancelledAt, cancelledBy: it.cancelledBy }
      if (it.state === 'completed') throw deny('VMU_STATE', it.id + ' already completed: it cannot be cancelled', 'schedule a new trigger instead')
      it.state = 'cancelled'
      it.cancelledAt = now()
      it.cancelledBy = String(by)
      it.cancelReason = reason === null ? null : String(reason)
      const cleared = timerClear(handles.get(it.id))
      handles.delete(it.id)
      record_({ type: 'schedule/cancelled', id: it.id, by: it.cancelledBy, why: it.cancelReason, at: it.cancelledAt, timerCleared: cleared })
      say({ type: 'schedule/cancelled', at: it.cancelledAt, id: it.id, by: it.cancelledBy, why: it.cancelReason })
      return { ok: true, id: it.id, cancelledAt: it.cancelledAt, by: it.cancelledBy, reason: it.cancelReason, timerCleared: cleared }
    },

    /**
     * Ask the INJECTED timer to wake us for the earliest pending item. NO SEAM ⇒ `armed:false`,
     * `mode:'tick-only'` — the module never pretends a timer exists.
     */
    arm({ id = null } = {}) {
      const shape = timerShape()
      if (shape === null) {
        if (timeSource === 'host-timer') {
          throw deny('VMU_CONTROL_NO_TIMER', 'vmu.schedule.timeSource=host-timer but no timer seam was injected',
            'pass { timer: { arm, disarm } } (or schedule/cancel, set/clear, setTimeout/clearTimeout) — or set timeSource back to "clock" and drive the schedule with tick()')
        }
        return { ok: true, armed: false, mode: 'tick-only', armedIds: [], note: 'no timer seam was injected: advance the schedule with tick({ at })' }
      }
      const targets = id === null
        ? pendingItems().filter((it) => !handles.has(it.id)).sort((a, b) => (a.atMs - b.atMs) || (a.id < b.id ? -1 : 1)).slice(0, 1)
        : (itemOf(id) ? [itemOf(id)] : [])
      if (id !== null && targets.length === 0) throw deny('VMU_NO_SUCH_OBJECT', 'unknown scheduled item: ' + String(id), 'known: ' + (order.join(', ') || '(none)'))
      const armedList = []
      for (const it of targets) {
        if (it.state !== 'pending') continue
        let handle = null
        try {
          handle = timerCall(it.atMs, () => { try { api.tick({ at: null }) } catch (e) { /* a throw here must not escape the host timer */ } })
        } catch (e) {
          bump(unwired, 'timer-seam', 1)
          say({ type: 'schedule/timer-unwired', at: now(), id: it.id, why: String((e && e.message) || e) })
          continue
        }
        if (handle === null || handle === undefined) { bump(unwired, 'timer-seam', 1); continue }
        handles.set(it.id, handle)
        armedList.push(it.id)
        record_({ type: 'schedule/armed', id: it.id, at: it.atMs, shape })
      }
      return { ok: true, armed: armedList.length > 0, mode: 'host-timer', shape, armedIds: armedList, at: now() }
    },

    /** Disarm the timer handle of one item (or all): this does NOT cancel the item itself. */
    disarm({ id = null } = {}) {
      if (id === null) {
        const all = [...handles.keys()]
        for (const key of all) { timerClear(handles.get(key)); handles.delete(key) }
        return { ok: true, disarmed: all, count: all.length, note: 'handles released; the items themselves are still pending (use cancel to withdraw them)' }
      }
      if (!handles.has(id)) return { ok: true, id, disarmed: [], already: true }
      const cleared = timerClear(handles.get(id))
      handles.delete(id)
      return { ok: true, id, disarmed: [id], timerCleared: cleared }
    },

    /** READ-ONLY. Bounded: a `limit` below what is available reports the DROPPED count (never silent). */
    list({ limit = DEFAULT_LIST_CAP, state = null, kind = null } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      let all = order.map((id) => items.get(id)).filter(Boolean)
      if (typeof state === 'string' && state) all = all.filter((it) => it.state === state)
      if (typeof kind === 'string' && kind) all = all.filter((it) => it.kind === kind)
      const kept = all.slice(0, cap).map((it) => ({
        id: it.id, kind: it.kind, what: it.what, at: it.atMs, intervalMs: it.intervalMs, runs: it.runs, maxRuns: it.maxRuns,
        state: it.state, createdBy: it.createdBy, createdAt: it.createdAt, armed: handles.has(it.id),
        cancelledAt: it.cancelledAt, cancelledBy: it.cancelledBy, cancelReason: it.cancelReason,
        completedAt: it.completedAt, completedReason: it.completedReason,
      }))
      return { ok: true, items: kept, count: kept.length, available: all.length, dropped: all.length - kept.length, truncated: all.length > kept.length, configured: order.length > 0 }
    },

    /** READ-ONLY: the audit trail (a capped ring; drops are counted). */
    history({ id = null, limit = DEFAULT_LIST_CAP } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIST_CAP
      const rows = historyRows.filter((r) => id === null || r.id === id)
      const kept = rows.slice(Math.max(0, rows.length - cap)).map((r) => Object.assign({}, r))
      return { ok: true, rows: kept, count: kept.length, available: rows.length, dropped: rows.length - kept.length, truncated: rows.length > kept.length, ringDropped: droppedHistory.n }
    },

    /** READ-ONLY self-report. */
    status() {
      const all = order.map((id) => items.get(id)).filter(Boolean)
      return {
        ok: true,
        configured: order.length > 0,
        triggerVia, timeSource, maxPending, actionsAllowed: actionsAllowed.slice(),
        overdueGraceMs, coalesceMissed, maxRecurrences, minIntervalMs, maxHorizonMs, cancelNeedsReason,
        timerInjected: !!timer, timerShape: timerShape(), timerHandles: handles.size,
        items: {
          total: all.length, pending: all.filter((it) => it.state === 'pending').length,
          cancelled: all.filter((it) => it.state === 'cancelled').length,
          completed: all.filter((it) => it.state === 'completed').length,
          armed: handles.size,
        },
        ticks: Object.assign({}, counts),
        listCap: DEFAULT_LIST_CAP,
        historyRows: historyRows.length,
        historyDropped: droppedHistory.n,
        refusals: objOf(refusals),
        refusalsTotal: sumOf(refusals),
        unwired: objOf(unwired),
        unwiredTotal: sumOf(unwired),
        paused: typeof isPaused === 'function' ? !!isPaused() : null,
        at: now(),
        note: triggerVia === 'none'
          ? 'triggerVia=none: the scheduler REPORTS what is due; it never starts work by itself (docs/08 §5)'
          : 'triggerVia=' + triggerVia + ': due items are emitted as bus hooks (the kernel still does not execute them)',
      }
    },
  }

  // ── declarative seeds from `vmu.schedule.triggers` / `vmu.scheduler.triggers` ──────────────────────
  if (Array.isArray(seedsRaw)) {
    for (const seed of seedsRaw) {
      if (!seed || typeof seed !== 'object') continue
      try {
        if (seed.kind === 'every' || Number.isInteger(seed.intervalMs)) api.every({ intervalMs: seed.intervalMs, what: seed.what, payload: seed.payload, by: seed.by === undefined ? 'settings' : seed.by, at: seed.at === undefined ? null : seed.at, maxRuns: seed.maxRuns === undefined ? null : seed.maxRuns })
        else api.once({ at: seed.at === undefined ? null : seed.at, inMs: seed.inMs === undefined ? null : seed.inMs, what: seed.what, payload: seed.payload, by: seed.by === undefined ? 'settings' : seed.by })
      } catch (e) {
        // A bad seed is COUNTED and reported through the audit log — it is never swallowed silently.
        bump(unwired, 'seed-rejected', 1)
        say({ type: 'schedule/seed-rejected', at: now(), code: (e && e.code) || null, why: String((e && e.message) || e) })
      }
    }
  }

  return api
}
