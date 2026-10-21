// vmu kernel · activity — the ONE-SHOT, FUTURE-ONLY activity waiter (docs/08 primitives; v5r C-56 / F52).
//
// WHY THIS EXISTS. The v5r line replaced v4's `activityTimeoutMs` polling with a real wait primitive: a member asks
// for the next institute change and is woken by it instead of busy-looping (`vibe-math-v5r.js:3424-3466`, the tool at
// `vibe-math-v5r.js:11142-11151`). vmu had NO such primitive at all (measured: zero hits for
// `waitForActivity`/`notifyActivity`/`vibe_v5_wait` in the whole tree), so a member could only poll — burning tokens —
// or wait forever. For a framework whose purpose is multi-agent collaboration that is not a missing convenience, it
// is a missing primitive.
//
// THE INVARIANTS (each one is asserted, and each assertion is shown able to fail, in `tests/vmu-activity-*.test.mjs`):
//   · FUTURE-ONLY. A notification that happened BEFORE a waiter registered can never wake it. There is NO BACKLOG:
//     `notify()` with no waiters records the fact and wakes nobody, and a waiter is armed with the notification
//     sequence it could see at registration time (`openedSeq`) so a replayed note cannot resolve it. The v5r wording
//     is the requirement: historical activity is not new activity.
//   · ONE-SHOT. `notify()` takes the CURRENT generation out of the live set and resolves each waiter exactly once; a
//     second notification does not resolve it again, and a woken/timed-out/aborted waiter is unregistered at once.
//   · TIMEOUT BOUNDS `[10000, 3600000]` ms — the interval v5r refuses outside of (`vibe-math-v5r.js:3435-3439`).
//     Out of range the default is a NAMED refusal (v5r parity); `vmu.activity.timeoutPolicy='clamp'` is the other
//     declared choice, and whichever is in force is reported by `status().policy.timeoutPolicy`. The bounds themselves
//     are settings (`vmu.activity.timeoutMinMs`/`timeoutMaxMs`), never hard-coded twice.
//   · THE DISPOSER RUNS ON EVERY BRANCH. Success, timeout and abort all funnel through ONE `cleanup()` that removes
//     the waiter, calls the timer disposer and detaches the abort listener; `status().disposersCalled` counts it, so
//     the discipline is observable rather than promised (v5r's own repeated lesson: "the disposer runs in both
//     outcomes").
//   · NO TIMER, NO PRETENCE. `timer: null` is an explicit "this deployment has no timer": `wait()` then refuses by
//     name instead of handing back a promise that could never time out. An OMITTED timer means the platform timers,
//     and `status().timer.shape` says which of the two is in use.
//   · NAMED, NEVER SILENT. Every refusal carries a code, a hint and the settings keys it evaluated; `status()` reports
//     the live waiters, the last notification, the refusal counts and whether a declared `vmu.activity.wakeOn` is
//     really wired to the bus.
//
// THE TWO WAKE SOURCES (and there are only two). `notify({what})` is the imperative entry v5r used, for a producer
// that holds this service. In addition, declaring `vmu.activity.wakeOn` registers ONE bus entry (`kind:'module'`,
// `failure:'open'`, id `vmu-activity-wake`) on those registered hook names, so a REAL committed state change wakes the
// waiters without editing every producer. That handler never decides anything (it returns `undefined`), so a broken
// wake listener can never block the emitter it observes. The hook vocabulary is read from `kernel/bus.js` — the single
// source — so a typo is reported by name instead of silently subscribing to a name nobody emits. Default `[]` is zero
// mechanism: no entry, no listener.
//
// LAYERING. This module owns the WAITING MECHANISM only. Who may wait, how long, and whether "nobody else is running"
// short-circuits the wait are policy and live in settings (`vmu.activity.*`) and in the pack; WHO notifies is the
// producer's business, and this module never invents an activity to wake somebody with.
//
// FACE CONVENTIONS: literal key reads (`sget('<key>')` below, all seven listed in `ACTIVITY_KEYS`); EVERY receipt and
// EVERY refusal carries `enforced[]` (the keys THIS CALL evaluated) + `enforcedScope:'evaluated-so-far'` — the D3
// scope marker used across the kernel. `enforced[]` is the CALL's list: `vmu.activity.wakeOn` is a CONSTRUCTION-time
// key, so it is named by `keysUsed()` and never appears in a receipt's `enforced[]` (an unevaluated key must not be
// listed), and an omitted `timeoutMs` appears only when the default was actually consulted.
import { VU_HOOKS, DSH_HOOKS } from './bus.js'

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** Named refusal. `enforced` is the array of settings keys this decision really evaluated (`[]`, never `undefined`). */
export function refuse(code, message, hint, enforced) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  err.enforced = Array.isArray(enforced) ? enforced.slice() : []
  err.enforcedScope = 'evaluated-so-far'
  return err
}

/** Every refusal code this face can raise (docs/03 §8 vocabulary, `VMU_ACTIVITY_*`). */
export const CODE = Object.freeze({
  noTimer: 'VMU_ACTIVITY_NO_TIMER',
  timerInvalid: 'VMU_ACTIVITY_TIMER_INVALID',
  invalidTimeout: 'VMU_ACTIVITY_INVALID_TIMEOUT',
  boundsInvalid: 'VMU_ACTIVITY_BOUNDS_INVALID',
  signalInvalid: 'VMU_ACTIVITY_SIGNAL_INVALID',
  aborted: 'VMU_ACTIVITY_ABORTED',
  limit: 'VMU_ACTIVITY_WAITER_LIMIT',
  disposed: 'VMU_ACTIVITY_DISPOSED',
  wakeHookUnknown: 'VMU_ACTIVITY_WAKE_HOOK_UNKNOWN',
  wakeUnwired: 'VMU_ACTIVITY_WAKE_UNWIRED',
  peerSeamFailed: 'VMU_ACTIVITY_PEER_SEAM_FAILED',
})

/**
 * The v5r interval, as the DECLARED DEFAULTS of the three bounds (`vibe-math-v5r.js:3437`). The live values come from
 * settings; these are what a deployment gets with no declaration, and they are what `status().bounds` reports.
 */
export const TIMEOUT_BOUNDS = Object.freeze({ minMs: 10000, maxMs: 3600000, defaultMs: 30000 })

/** Every `vmu.activity.*` key this module reads (docs/04). */
export const ACTIVITY_KEYS = Object.freeze([
  'vmu.activity.timeoutMs',
  'vmu.activity.timeoutMinMs',
  'vmu.activity.timeoutMaxMs',
  'vmu.activity.timeoutPolicy',
  'vmu.activity.wakeOn',
  'vmu.activity.maxWaiters',
  'vmu.activity.noPeerShortCircuit',
])

/** All seven decide something: three are the interval, one picks refuse-vs-clamp, one wires the bus wake, two bound the waiters. */
export const WIRED_ACTIVITY_KEYS = Object.freeze(ACTIVITY_KEYS.slice())

/** The id of the ONE bus entry a declared `vmu.activity.wakeOn` registers (disable it by this name to stop the wake). */
export const WAKE_ENTRY_ID = 'vmu-activity-wake'

const NOTIFICATION_RING = 20
const DEFAULT_MAX_WAITERS = 128

/** The registered hook vocabulary, from the bus registry — the single source, so a typo is refused by name. */
const KNOWN_HOOKS = new Set([...VU_HOOKS, ...DSH_HOOKS])

/**
 * Normalise the injected timer seam to `{ shape, arm(cb, ms) -> disposer }`.
 *
 * Accepted: `{ timeout(cb, ms) -> disposer }` (the v5r `ctx.timeout` shape), `{ setTimeout, clearTimeout }`,
 * a bare `(cb, ms) -> disposer` function. Omitted ⇒ the platform timers (shape `global-setTimeout`).
 * `null` ⇒ NO timer: a wait cannot time out, so `wait()` refuses by name rather than pretending.
 */
export function normalizeTimer(timer) {
  if (timer === null) return { shape: 'none', arm: null, injected: true }
  if (timer === undefined) {
    if (typeof setTimeout === 'function' && typeof clearTimeout === 'function') {
      return { shape: 'global-setTimeout', injected: false,
        arm: (cb, ms) => { const h = setTimeout(cb, ms); return () => { try { clearTimeout(h) } catch (e) { /* a cleanup must never throw */ } } } }
    }
    return { shape: 'none', arm: null, injected: false }
  }
  if (typeof timer === 'function') {
    return { shape: 'function->disposer', injected: true, arm: (cb, ms) => {
      const d = timer(cb, ms)
      if (typeof d !== 'function') {
        throw refuse(CODE.timerInvalid, 'the injected timer function returned no disposer',
          'a bare timer must RETURN a disposer: (cb, ms) => dispose; otherwise pass { timeout(cb, ms) -> disposer }')
      }
      return () => { try { d() } catch (e) { /* a cleanup must never throw */ } }
    } }
  }
  if (typeof timer === 'object' && typeof timer.timeout === 'function') {
    return { shape: 'timeout->disposer', injected: true, arm: (cb, ms) => {
      const d = timer.timeout(cb, ms)
      if (typeof d !== 'function') {
        throw refuse(CODE.timerInvalid, 'timer.timeout(cb, ms) returned no disposer',
          'the v5r shape is ctx.timeout(cb, ms) -> disposer; return the disposer so cleanup can run on every branch')
      }
      return () => { try { d() } catch (e) { /* a cleanup must never throw */ } }
    } }
  }
  if (typeof timer === 'object' && typeof timer.setTimeout === 'function' && typeof timer.clearTimeout === 'function') {
    return { shape: 'setTimeout+clearTimeout', injected: true,
      arm: (cb, ms) => { const h = timer.setTimeout(cb, ms); return () => { try { timer.clearTimeout(h) } catch (e) { /* a cleanup must never throw */ } } } }
  }
  throw refuse(CODE.timerInvalid, 'the injected timer is not a usable shape',
    'accepted: { timeout(cb, ms) -> disposer } | { setTimeout, clearTimeout } | (cb, ms) -> disposer | null (no timer: waits refuse by name)')
}

/** Read `vmu.activity.wakeOn` (a string or a list) and split it into known / unknown hook names. */
export function normalizeWakeOn(value) {
  const raw = value === undefined || value === null ? []
    : (Array.isArray(value) ? value : [value]).map((x) => String(x).trim()).filter(Boolean)
  const hooks = []
  const unknown = []
  for (const name of raw) {
    if (KNOWN_HOOKS.has(name)) { if (!hooks.includes(name)) hooks.push(name) } else if (!unknown.includes(name)) unknown.push(name)
  }
  return { raw, hooks, unknown }
}

/**
 * `createActivity({ clock, log, settings, bus, timer, activePeers })`.
 *   · `clock` — injected, returns milliseconds (never read at construction: a guarded clock must not be punished for
 *     a constructor that has no reason to ask the time);
 *   · `settings` — a plain object or a live view with `get(key)`, read per call (the values are NOT snapshotted, so
 *     `H1` keys really take effect on the next wait);
 *   · `bus` — optional; only used to register the ONE wake entry when `vmu.activity.wakeOn` is declared;
 *   · `timer` — optional seam (see `normalizeTimer`); omit it for the platform timers, pass `null` for "no timer";
 *   · `activePeers(me)` — optional seam returning the OTHER live members. When present, `wait()` short-circuits with
 *     `noProgress:{reason:'no-active-peer'}` instead of waiting for activity nobody can produce (v5r parity, and the
 *     reason the primitive exists: not burning tokens on an empty institute). A seam that FAILS is refused by name —
 *     a peer check that cannot run must never be silently skipped.
 */
export function createActivity({
  clock = () => 0,
  log = () => {},
  settings = {},
  bus = null,
  timer,
  activePeers = null,
} = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createActivity needs a clock function', 'pass { clock: () => ms }')
  if (activePeers !== null && typeof activePeers !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'activePeers must be a function when given', 'pass (me) => [otherIds], or omit it')
  }
  if (typeof settings !== 'object' || settings === null) throw refuse('VMU_INVALID_ARGUMENT', 'settings must be an object or a settings view', 'pass {} for the declared defaults')

  const timerSeam = normalizeTimer(timer)
  const timerShape = timerSeam.shape
  const arm = timerSeam.arm

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (what) => { try { if (typeof log === 'function') log(what) } catch (e) { /* logging must never break a wait */ } }

  const naturalKey = (key, def) => { const n = Number(sget(key, def)); return Number.isSafeInteger(n) && n > 0 ? n : def }
  const policyOf = () => ({
    timeoutMs: naturalKey('vmu.activity.timeoutMs', TIMEOUT_BOUNDS.defaultMs),
    timeoutMinMs: naturalKey('vmu.activity.timeoutMinMs', TIMEOUT_BOUNDS.minMs),
    timeoutMaxMs: naturalKey('vmu.activity.timeoutMaxMs', TIMEOUT_BOUNDS.maxMs),
    timeoutPolicy: sget('vmu.activity.timeoutPolicy', 'refuse') === 'clamp' ? 'clamp' : 'refuse',
    maxWaiters: (() => { const n = Number(sget('vmu.activity.maxWaiters', DEFAULT_MAX_WAITERS)); return Number.isSafeInteger(n) && n >= 0 ? n : DEFAULT_MAX_WAITERS })(),
    noPeerShortCircuit: sget('vmu.activity.noPeerShortCircuit', true) !== false,
  })

  const waiters = new Set()          // live entries: { id, member, reason, at, timeoutMs, openedSeq, wake }
  const notes = []                   // the notification ring (bounded, drops COUNTED)
  const refusals = new Map()
  let lastRefusal = null
  let lastNotification = null
  let notifySeq = 0
  let waitSeq = 0
  let ringDropped = 0
  let waitersOpened = 0
  let woken = 0
  let timedOutCount = 0
  let abortedCount = 0
  let skippedNoPeer = 0
  let clampedCount = 0
  let disposersCalled = 0
  let disposed = false

  const note = (code, message) => {
    refusals.set(code, (refusals.get(code) || 0) + 1)
    lastRefusal = { code, message: String(message === undefined ? '' : message), at: clock() }
    return code
  }

  // ---- notification ---------------------------------------------------------------------------------------
  const notifyImpl = ({ what = 'state-change', at = null, source = 'caller' } = {}) => {
    if (disposed) throw refuse(CODE.disposed, 'this activity face was disposed: it can no longer notify', 'construct a new kernel before notifying waiters')
    notifySeq += 1
    const seq = notifySeq
    const when = Number.isFinite(Number(at)) ? Number(at) : clock()
    const noteRow = { seq, what: String(what === undefined || what === null || what === '' ? 'state-change' : what), at: when, source: String(source) }
    lastNotification = noteRow
    notes.push(noteRow)
    if (notes.length > NOTIFICATION_RING) { const over = notes.length - NOTIFICATION_RING; notes.splice(0, over); ringDropped += over }
    // ONE-SHOT, FUTURE-ONLY: take the CURRENT generation and clear the set. Nothing is queued for a waiter that is
    // not here yet — this line is what makes the absence of a backlog structural rather than a promise.
    const pending = Array.from(waiters)
    waiters.clear()
    for (const w of pending) {
      try { w.wake(noteRow) } catch (e) { say('activity: a waiter failed while being woken: ' + String((e && e.message) || e)) }
    }
    say('activity/notify seq=' + seq + ' what=' + noteRow.what + ' woken=' + pending.length)
    // A notify consults no settings key, so its `enforced[]` is EXPLICITLY empty (never `undefined`, never absent).
    return { ok: true, notified: pending.length, seq, what: noteRow.what, at: when, source: noteRow.source, waiters: waiters.size,
      enforced: [], enforcedScope: 'evaluated-so-far' }
  }

  // ---- the wake subscription (opt-in, named, fail-visible) -------------------------------------------------
  const wakeDeclared = normalizeWakeOn(sget('vmu.activity.wakeOn', []))
  const wakeProblems = []
  let wakeEntryId = null
  if (wakeDeclared.raw.length > 0) {
    if (wakeDeclared.unknown.length > 0) {
      wakeProblems.push({ code: CODE.wakeHookUnknown,
        message: 'vmu.activity.wakeOn names hooks that are not registered: ' + wakeDeclared.unknown.join(', '),
        hint: 'registered hooks come from kernel/bus.js (HOOK_REGISTRY); e.g. chat/sent, mailbox/delivered, panel/written' })
    }
    if (wakeDeclared.hooks.length > 0) {
      if (!bus || typeof bus.add !== 'function') {
        wakeProblems.push({ code: CODE.wakeUnwired,
          message: 'vmu.activity.wakeOn is declared (' + wakeDeclared.hooks.join(', ') + ') but no bus was injected, so nothing subscribes: only an explicit notify() can wake a waiter',
          hint: 'construct the kernel with a bus, or drop vmu.activity.wakeOn' })
      } else {
        try {
          const entry = bus.add({
            id: WAKE_ENTRY_ID, kind: 'module', on: wakeDeclared.hooks, order: 900,
            // `failure:'open'` because this listener OBSERVES: a broken wake must never refuse the producer's write.
            failure: 'open',
            handler: (frame) => { notifyImpl({ what: 'hook:' + String((frame && frame.hook) || 'unknown'), source: 'bus' }); return undefined },
          })
          wakeEntryId = entry && entry.id ? entry.id : WAKE_ENTRY_ID
        } catch (e) {
          wakeProblems.push({ code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED',
            message: 'the wake subscription could not be registered: ' + String((e && e.message) || e),
            hint: 'the bus refused the entry; fix vmu.activity.wakeOn (or the duplicate id ' + WAKE_ENTRY_ID + ')' })
        }
      }
    }
  }

  // ---- notification ---------------------------------------------------------------------------------------
  const activity = {
    /** Wake the CURRENT waiters with one notification. A notification nobody is waiting for is recorded, and wakes nobody. */
    notify({ what = 'state-change', at = null, source = 'caller' } = {}) {
      return notifyImpl({ what, at, source })
    },

    /**
     * The one-shot, future-only wait. Resolves `{ ok:true, timedOut:false, notified:{what,seq,at} }` on the first
     * notification that arrives AFTER this call, `{ ok:true, timedOut:true }` on the timeout, and returns
     * `{ ok:true, timedOut:false, noProgress:{reason:'no-active-peer'} }` immediately when the injected peer seam
     * says nobody else is running. Aborting REJECTS with the NAMED code `VMU_ACTIVITY_ABORTED`, keeping the signal's
     * `reason` on the error as `abortReason`/`cause` (v5r rejects with the raw reason when it is an Error; the code
     * stays named here because a DOMException's numeric `code` would cross the tool face unnamed).
     */
    wait({ timeoutMs, signal = null, member = null, reason = '' } = {}) {
      if (disposed) throw refuse(CODE.disposed, 'this activity face was disposed: it can no longer wait', 'construct a new kernel before waiting')
      const keys = []
      const p = policyOf()
      keys.push('vmu.activity.timeoutPolicy')
      let ms
      if (timeoutMs === undefined || timeoutMs === null) { ms = p.timeoutMs; keys.push('vmu.activity.timeoutMs') } else { ms = Number(timeoutMs) }
      if (!Number.isSafeInteger(ms)) {
        note(CODE.invalidTimeout, 'timeout_ms must be an integer, got ' + JSON.stringify(timeoutMs))
        throw refuse(CODE.invalidTimeout, 'timeout_ms must be an integer number of milliseconds (got ' + JSON.stringify(timeoutMs) + ')',
          'the v5r interval is 10000 through 3600000 and the declared default is ' + p.timeoutMs, keys)
      }
      keys.push('vmu.activity.timeoutMinMs', 'vmu.activity.timeoutMaxMs')
      if (p.timeoutMinMs <= 0 || p.timeoutMaxMs < p.timeoutMinMs) {
        note(CODE.boundsInvalid, 'declared bounds are unusable: [' + p.timeoutMinMs + ', ' + p.timeoutMaxMs + ']')
        throw refuse(CODE.boundsInvalid, 'the declared timeout bounds are unusable: [' + p.timeoutMinMs + ', ' + p.timeoutMaxMs + ']',
          'vmu.activity.timeoutMinMs must be a positive integer and <= vmu.activity.timeoutMaxMs', keys)
      }
      let clamped = false
      if (ms < p.timeoutMinMs || ms > p.timeoutMaxMs) {
        if (p.timeoutPolicy === 'clamp') { ms = Math.min(Math.max(ms, p.timeoutMinMs), p.timeoutMaxMs); clamped = true; clampedCount += 1 }
        else {
          note(CODE.invalidTimeout, 'timeout_ms ' + ms + ' outside [' + p.timeoutMinMs + ', ' + p.timeoutMaxMs + ']')
          throw refuse(CODE.invalidTimeout, 'timeout_ms must be an integer from ' + p.timeoutMinMs + ' through ' + p.timeoutMaxMs + ' (the v5r interval); got ' + ms,
            'pass a value inside the interval, or set vmu.activity.timeoutPolicy=clamp so the value is clamped BY NAME instead', keys)
        }
      }
      if (signal !== null && signal !== undefined && (typeof signal !== 'object' || typeof signal.aborted !== 'boolean')) {
        note(CODE.signalInvalid, 'signal is not AbortSignal-shaped')
        throw refuse(CODE.signalInvalid, 'signal must be an AbortSignal-shaped object (an `aborted` boolean)',
          'omit it, or pass a real AbortSignal — v5r passes the tool context signal', keys)
      }
      if (arm === null) {
        note(CODE.noTimer, 'no timer is available')
        throw refuse(CODE.noTimer, 'no timer is available: this face was built with timer:null, and a wait that cannot time out is refused rather than faked',
          'construct the face without `timer` (platform timers) or inject { timeout(cb, ms) -> disposer }', keys)
      }
      keys.push('vmu.activity.maxWaiters')
      if (p.maxWaiters > 0 && waiters.size >= p.maxWaiters) {
        note(CODE.limit, 'waiter limit ' + waiters.size + '/' + p.maxWaiters)
        throw refuse(CODE.limit, 'waiter limit reached: ' + waiters.size + '/' + p.maxWaiters + ' (vmu.activity.maxWaiters)',
          'let an existing wait finish, or raise vmu.activity.maxWaiters (0 means unlimited)', keys)
      }
      const memberId = member === undefined || member === null ? '' : String(member)
      const why = reason === undefined || reason === null ? '' : String(reason)

      // The peer check: v5r returns immediately when nobody else is running, instead of waiting for activity that
      // cannot happen. It runs ONLY when a seam was injected, and it is reported either way. `noPeerShortCircuit` is
      // in this call's `enforced[]` exactly when a seam exists — that is when its value decides something here.
      let peerCheck = typeof activePeers === 'function' ? 'seam' : 'no-seam'
      if (typeof activePeers === 'function') {
        keys.push('vmu.activity.noPeerShortCircuit')
        if (p.noPeerShortCircuit) {
          let peers = null
          try { peers = activePeers(memberId === '' ? null : memberId) } catch (e) {
            note(CODE.peerSeamFailed, 'the activePeers seam threw: ' + String((e && e.message) || e))
            throw refuse(CODE.peerSeamFailed, 'the injected activePeers seam failed: ' + String((e && e.message) || e),
              'a peer check that cannot run is refused, never skipped: fix the seam or drop vmu.activity.noPeerShortCircuit', keys)
          }
          if (!Array.isArray(peers)) {
            note(CODE.peerSeamFailed, 'the activePeers seam did not return a list')
            throw refuse(CODE.peerSeamFailed, 'the injected activePeers seam must return a list of member ids, got ' + (peers === null ? 'null' : typeof peers),
              'return [ids] of the OTHER live members; a missing answer is refused rather than read as "nobody"', keys)
          }
          const others = peers.map(String).filter((id) => id !== memberId)
          if (others.length === 0) {
            skippedNoPeer += 1
            peerCheck = 'no-active-peer'
            say('activity/wait no-active-peer member=' + (memberId || '(none)'))
            return Promise.resolve({ ok: true, action: 'wait', timedOut: false, noProgress: { reason: 'no-active-peer', peers: 0,
              message: '没有其他在活同伴可以等待：先让事情发生（发言／派任务／招人），不要在这里空等' },
              waitedMs: 0, waiters: waiters.size, timeoutMs: ms, clamped, member: memberId || null, reason: why, peerCheck,
              enforced: keys.slice(), enforcedScope: 'evaluated-so-far' })
          }
          peerCheck = 'peers=' + others.length
        }
      }

      const openedSeq = notifySeq
      waitersOpened += 1
      const entry = { id: 'w' + (++waitSeq), member: memberId, reason: why, at: clock(), timeoutMs: ms, openedSeq, wake: null, fail: null }
      const openedAt = entry.at

      return new Promise((resolve, reject) => {
        let done = false
        let timerDisposer = null
        /** The ONE cleanup: waiter, timer disposer, abort listener. Idempotent, and it never throws. */
        const cleanup = () => {
          waiters.delete(entry)
          if (timerDisposer) {
            const d = timerDisposer
            timerDisposer = null
            disposersCalled += 1
            try { d() } catch (e) { /* a cleanup must never throw into a settle path */ }
          }
          if (signal && typeof signal.removeEventListener === 'function') {
            try { signal.removeEventListener('abort', onAbort) } catch (e) { /* the signal may already be gone */ }
          }
        }
        const settle = (fn) => { if (done) return; done = true; cleanup(); fn() }
        const elapsed = () => { const now = Number(clock()); return Number.isFinite(now) && Number.isFinite(openedAt) ? Math.max(0, now - openedAt) : 0 }

        entry.wake = (n) => {
          if (done) return
          // FUTURE-ONLY, second lock: only a notification NEWER than this waiter's opening sequence may resolve it.
          if (!n || !(n.seq > openedSeq)) return
          settle(() => {
            woken += 1
            resolve({ ok: true, action: 'wait', timedOut: false, notified: { what: n.what, seq: n.seq, at: n.at },
              waitedMs: elapsed(), waiters: waiters.size, timeoutMs: ms, clamped, member: memberId || null, reason: why, peerCheck,
              enforced: keys.slice(), enforcedScope: 'evaluated-so-far' })
          })
        }
        function onAbort() {
          settle(() => {
            abortedCount += 1
            const whyAbort = signal && signal.reason
            // v5r rejects with the signal reason when it is an Error (`vibe-math-v5r.js:3449-3451`). We keep the
            // reason — as the message, in `abortReason`, and as `cause` — but the CODE is always named: a bare
            // `AbortController.abort()` reason is a DOMException whose `code` is the NUMBER 20, and an unnamed
            // numeric code crossing the tool face is exactly the silent-unnamed-refusal shape this project refuses.
            const named = refuse(CODE.aborted,
              'the wait was aborted' + (whyAbort instanceof Error ? ': ' + whyAbort.message
                : (whyAbort === undefined ? ' (signal)' : ': ' + String(whyAbort))),
              'the signal reason is preserved as abortReason/cause; drop the signal or handle VMU_ACTIVITY_ABORTED')
            named.abortReason = whyAbort === undefined ? 'signal' : whyAbort
            if (whyAbort instanceof Error) named.cause = whyAbort
            reject(named)
          })
        }
        const onTimeout = () => settle(() => {
          timedOutCount += 1
          resolve({ ok: true, action: 'wait', timedOut: true, waitedMs: elapsed(), waiters: waiters.size, timeoutMs: ms, clamped,
            member: memberId || null, reason: why, peerCheck, enforced: keys.slice(), enforcedScope: 'evaluated-so-far' })
        })
        // `dispose()` reaches a live waiter through this hook: a wait that ends because its owner left is REJECTED by
        // name, not silently timed out, and it goes through the same `settle` ⇒ the same disposer discipline.
        entry.fail = (err) => settle(() => { reject(err) })

        // FUTURE-ONLY MARKER — registration order IS the invariant: the waiter records the notification sequence it
        // could see (`openedSeq`) and joins the live set; a notification that already happened lives only in
        // `lastNotification`/the ring and can never resolve it. `tests/vmu-activity-falsify.test.mjs` mutates the
        // line below into the historical-replay defect and requires the same probe to go RED.
        waiters.add(entry)
        if (signal) {
          if (signal.aborted === true) { onAbort(); return }
          if (typeof signal.addEventListener === 'function') { try { signal.addEventListener('abort', onAbort) } catch (e) { /* a broken signal must not leak a waiter */ } }
        }
        try {
          timerDisposer = arm(onTimeout, ms)
        } catch (err) {
          if (signal && typeof signal.removeEventListener === 'function') { try { signal.removeEventListener('abort', onAbort) } catch (e) { /* ★ ROUND 84: the reason is stated - this runs while HANDLING an arming failure, so a throw here would replace the real error with a cleanup error; the listener is owner-supplied and its removal must never mask why the arm failed */ } }
          waiters.delete(entry)
          done = true
          reject(err)
          return
        }
        // A pathological timer that fires DURING arming has already settled: the disposer it just returned must still
        // run, or the "every branch cleans up" invariant would have a hole exactly where it is hardest to see.
        if (done && timerDisposer) {
          const d = timerDisposer
          timerDisposer = null
          disposersCalled += 1
          // ★ ROUND 84: THE REASON IS STATED, LIKE ITS FOUR SIBLINGS. Every other disposer call in this file says WHY it
          // tolerates a throw (`:131`/`:141`/`:399`/`:402`) - a disposer is owner-supplied teardown, and its failure must
          // not take down the wait it belongs to. This one said only "ignore", which reads as an oversight rather than a
          // decision; the same rule applies here, and now it says so.
          try { d() } catch (e) { /* the disposer is owner-supplied teardown: a throw here must not surface as a wait failure, exactly as on the other disposal branches (see :131/:141/:399/:402) */ }
        }
      })
    },

    /**
     * Terminate every pending wait by name and stop the wake subscription. Idempotent. Pending waiters are REJECTED
     * with `VMU_ACTIVITY_DISPOSED` (a wait that ends because its owner left is not a satisfied wait), and their timer
     * disposers run like on every other branch.
     */
    dispose({ reason = 'disposed' } = {}) {
      if (disposed) return { ok: true, disposed: true, alreadyDisposed: true, closedWaiters: 0, wakeEntry: wakeEntryId,
        enforced: [], enforcedScope: 'evaluated-so-far' }
      disposed = true
      const pending = Array.from(waiters)
      waiters.clear()
      for (const w of pending) {
        try {
          if (typeof w.fail === 'function') w.fail(refuse(CODE.disposed, 'the wait ended because its activity face was disposed: ' + String(reason),
            'construct a new kernel before waiting again; a disposed wait is never reported as a satisfied one'))
        } catch (e) { say('activity: a waiter failed to close during dispose: ' + String((e && e.message) || e)) }
      }
      if (wakeEntryId !== null && bus && typeof bus.disable === 'function') {
        try { bus.disable(wakeEntryId, 'activity disposed: ' + String(reason)) } catch (e) { say('activity: could not disable ' + wakeEntryId + ': ' + String((e && e.message) || e)) }
      }
      say('activity/dispose closed=' + pending.length + ' reason=' + String(reason))
      return { ok: true, disposed: true, closedWaiters: pending.length, wakeEntry: wakeEntryId,
        enforced: [], enforcedScope: 'evaluated-so-far' }
    },

    /** Read-only self-disclosure: the live waiters, the last notification, the policy, and what is really wired. */
    status() {
      const p = policyOf()
      return {
        ok: true, apiVersion,
        waiters: waiters.size,
        waitersList: [...waiters].map((w) => ({ id: w.id, member: w.member || null, reason: w.reason || '', at: w.at, timeoutMs: w.timeoutMs })),
        opened: waitersOpened, woken, timedOut: timedOutCount, aborted: abortedCount, skippedNoPeer, clamped: clampedCount,
        notifications: notifySeq,
        lastNotification: lastNotification ? Object.assign({}, lastNotification) : null,
        notificationRing: notes.slice(-5).map((n) => Object.assign({}, n)),
        ringDropped,
        disposersCalled,
        refusals: Object.fromEntries(refusals),
        lastRefusal: lastRefusal ? Object.assign({}, lastRefusal) : null,
        policy: p, bounds: TIMEOUT_BOUNDS,
        timer: { shape: timerShape, injected: timerSeam.injected },
        wake: { declared: wakeDeclared.raw.slice(), accepted: wakeDeclared.hooks.slice(), wired: wakeEntryId !== null,
          entryId: wakeEntryId, problems: wakeProblems.map((x) => Object.assign({}, x)),
          reason: wakeDeclared.raw.length === 0 ? 'wake-on-not-declared' : (wakeEntryId !== null ? 'wired' : 'declared-but-unwired'),
          hint: wakeDeclared.raw.length === 0
            ? 'zero mechanism: wait() can still wait and time out, but only an explicit notify() can wake it before the timeout; declare vmu.activity.wakeOn to subscribe to committed events'
            : null },
        peerCheck: { seam: typeof activePeers === 'function', shortCircuit: p.noPeerShortCircuit },
        invariants: { futureOnly: true, oneShot: true, noBacklog: true, disposerOnEveryBranch: true, readsArePure: true },
        registeredHooks: KNOWN_HOOKS.size,
        disposed,
        at: clock(),
      }
    },

    /** The seven keys this face reads (docs/04 §11). */
    keysUsed() { return ACTIVITY_KEYS.slice() },

    /** Wired vs planned, so a reader never has to infer which keys decide something. */
    partition() { return { wired: WIRED_ACTIVITY_KEYS.slice(), planned: [], unwired: [] } },

    /** The live policy view (what the next wait will use). */
    config() { return policyOf() },

    /** Refusal counts by code (observability, same discipline as the other faces). */
    refusals() { return Object.fromEntries(refusals) },
  }

  return activity
}

export default createActivity
