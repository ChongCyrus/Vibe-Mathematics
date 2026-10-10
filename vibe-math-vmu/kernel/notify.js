// vmu kernel · notify — watcher subscriptions, dedup, quiet hours, digests and delivery.
// Design source: docs/17-agent-society-and-delegation.md §29 (notify/subscription & signal-to-noise);
//   thresholds/suppression/escalation belong to volume 21 §5.3 — referenced, never redefined here.
// Layering (deliberate): NOTIFY fingerprints a notification as watcher×event×object;
//   the ALERT layer (volume 21) fingerprints metric×object×code. This module only does the former.
// Invariants:
//   · deliver() is an injected seam: without it emit/flush REFUSE BY NAME and nothing pretends to be sent
//   · quiet hours block DELIVERY only — events are still recorded and counted; on resume a digest is REQUIRED
//   · a failed delivery never blocks the caller, but it is recorded and counted (onFailure policy)
//   · subscriptions must name a registered hook; unknown events are refused WITH the registered list
//   · dedup, truncation and suppression are all counted; the clock is injected; default is off; reads never mutate
export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

export const CODE = Object.freeze({
  noTransport: 'VMU_NOTIFY_NO_TRANSPORT',
  unregistered: 'VMU_NOTIFY_EVENT_UNREGISTERED',
  limit: 'VMU_NOTIFY_LIMIT',
  watchUnknown: 'VMU_WATCH_UNKNOWN',
  deliveryFailed: 'VMU_NOTIFY_DELIVERY_FAILED',
})
const DEFAULT_MAX_WATCHERS = 100
const DEFAULT_MAX_REGISTER = 500

export function createNotify({ clock = () => 0, log = null, settings = {}, bus = null, deliver = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createNotify needs a clock function', 'pass { clock: () => ms }')

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging must never break notify */ } } }

  const cfg = () => ({
    enabled: sget('vmu.notify.enabled', false) === true,
    dedupWindowMs: (() => { const v = sget('vmu.notify.dedupWindowMs', 0); return Number.isFinite(v) && v > 0 ? v : 0 })(),
    digestWindowMs: (() => { const v = sget('vmu.notify.digestWindowMs', 0); return Number.isFinite(v) && v > 0 ? v : 0 })(),
    quiet: sget('vmu.notify.quiet', false) === true,
    maxWatchers: (() => { const v = sget('vmu.notify.maxWatchers', DEFAULT_MAX_WATCHERS); return Number.isInteger(v) && v > 0 ? v : DEFAULT_MAX_WATCHERS })(),
    maxRegister: (() => { const v = sget('vmu.notify.maxRegister', DEFAULT_MAX_REGISTER); return Number.isInteger(v) && v > 0 ? v : DEFAULT_MAX_REGISTER })(),
    onFailure: (() => { const v = sget('vmu.notify.onFailure', 'log'); return ['log', 'throw'].includes(v) ? v : 'log' })(),
    priorityFloor: (() => { const v = sget('vmu.notify.priorityFloor', 0); return Number.isInteger(v) ? v : 0 })(),
    registeredEvents: (() => {
      const a = sget('vmu.notify.registeredEvents', undefined)
      if (Array.isArray(a)) return a.slice()
      const b = sget('vmu.hooks.registered', undefined)   // the hook registry (volume 05) is the canonical source
      if (Array.isArray(b)) return b.slice()
      return null
    })(),
  })

  const watchers = []          // { id, subject, events[], channel, quiet, digest, priorityFloor, createdAt }
  const register = []          // every recorded notification: { id, watcherId, event, object, fingerprint, at, delivered, suppressed, reason }
  const digests = []           // per-watcher pending digest counts: { watcherId, since, counts{}, lastAt }
  const seen = new Map()       // fingerprint -> last delivery time (dedup window)
  let dropped = 0
  let deduped = 0
  let suppressed = 0
  let delivered = 0
  let failures = 0
  let seq = 0

  const isQuiet = (w, at) => cfg().quiet || (w && w.quiet === true)
  const fingerprintOf = (w, event, object) => String(w.subject) + '\u0000' + String(event) + '\u0000' + String(object)
  const requiresTransport = () => {
    if (typeof deliver === 'function') return
    throw refuse(CODE.noTransport, 'no delivery transport was injected: nothing is sent (and nothing is pretended)', 'pass { deliver: (note) => … } when creating the module')
  }
  const noteDigest = (w, event, at) => {
    let d = digests.find((x) => x.watcherId === w.id)
    if (!d) { d = { watcherId: w.id, since: at, counts: {}, lastAt: at }; digests.push(d) }
    d.counts[event] = (d.counts[event] || 0) + 1
    d.lastAt = at
    return d
  }

  return {
    apiVersion,

    /** Subscribe a subject to registered events. */
    watch({ subject, events, channel = 'default', quiet = false, digest = false, priorityFloor = null } = {}) {
      if (typeof subject !== 'string' || !subject) throw refuse('VMU_INVALID_ARGUMENT', 'watch needs a subject', 'e.g. { subject: "m1", events: ["task.assigned"] }')
      if (!Array.isArray(events) || events.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'watch needs a non-empty events list', 'e.g. events: ["task.assigned"]')
      const c = cfg()
      const known = c.registeredEvents
      if (known) {
        const bad = events.filter((e) => !known.includes(e))
        if (bad.length) throw refuse(CODE.unregistered, 'these events are not registered hooks: ' + bad.join(', '), 'registered events: ' + (known.length ? known.join(', ') : '(none)') + ' — register the hook first (volume 05)')
      }
      if (watchers.length >= c.maxWatchers) throw refuse(CODE.limit, 'watcher limit reached: ' + watchers.length + '/' + c.maxWatchers, 'unwatch first, or raise vmu.notify.maxWatchers')
      if (typeof channel !== 'string' || !channel) throw refuse('VMU_INVALID_ARGUMENT', 'channel must be a non-empty string', 'e.g. channel: "default"')
      if (priorityFloor !== null && !Number.isInteger(priorityFloor)) throw refuse('VMU_INVALID_ARGUMENT', 'priorityFloor must be an integer when given', 'omit it to inherit vmu.notify.priorityFloor')
      const at = clock()
      const id = 'w-' + (++seq)
      const w = { id, subject, events: events.slice(), channel, quiet: quiet === true, digest: digest === true, priorityFloor: Number.isInteger(priorityFloor) ? priorityFloor : c.priorityFloor, createdAt: at }
      watchers.push(w)
      say({ type: 'notify/watch', at, subject, events: w.events, channel })
      return { ok: true, id, subject, events: w.events.slice(), channel, quiet: w.quiet, digest: w.digest, priorityFloor: w.priorityFloor, watchers: watchers.length }
    },

    unwatch({ id } = {}) {
      if (typeof id !== 'string' || !id) throw refuse('VMU_INVALID_ARGUMENT', 'unwatch needs an id', 'list() shows the watcher ids')
      const i = watchers.findIndex((w) => w.id === id)
      if (i < 0) throw refuse(CODE.watchUnknown, 'no watcher with id ' + id, 'list() shows the watcher ids')
      const [gone] = watchers.splice(i, 1)
      say({ type: 'notify/unwatch', at: clock(), id, subject: gone.subject })
      return { ok: true, id, subject: gone.subject, watchers: watchers.length }
    },

    /** Record (always) and deliver (when allowed). A failed delivery never blocks the caller. */
    emit({ event, object = null, payload = null } = {}) {
      if (typeof event !== 'string' || !event) throw refuse('VMU_INVALID_ARGUMENT', 'emit needs an event name', 'e.g. { event: "task.assigned", object: "T-1" }')
      const c = cfg()
      if (!c.enabled) return { ok: true, enabled: false, recorded: 0, delivered: 0, deduped: 0, suppressed: 0, failures: 0, note: 'notifications are off (default; zero mechanism)' }
      const known = c.registeredEvents
      if (known && !known.includes(event)) throw refuse(CODE.unregistered, 'event is not a registered hook: ' + event, 'registered events: ' + (known.length ? known.join(', ') : '(none)'))
      const priority = payload && Number.isInteger(payload.priority) ? payload.priority : 0
      const at = clock()
      const targets = watchers.filter((w) => w.events.includes(event) && priority >= (w.priorityFloor || 0))
      let deliveredNow = 0, suppressedNow = 0, dedupedNow = 0, failuresNow = 0, recordedNow = 0
      for (const w of targets) {
        const fp = fingerprintOf(w, event, object)
        const quiet = isQuiet(w, at)
        let isDup = false
        if (c.dedupWindowMs > 0) {
          const last = seen.get(fp)
          if (Number.isFinite(last) && (at - last) <= c.dedupWindowMs) isDup = true
        }
        const rec = { id: 'n-' + (++seq), watcherId: w.id, subject: w.subject, event, object, fingerprint: fp, at, delivered: false, suppressed: quiet || isDup, reason: quiet ? 'quiet' : (isDup ? 'dedup' : null) }
        register.push(rec)
        recordedNow += 1
        if (register.length > c.maxRegister) { const over = register.length - c.maxRegister; register.splice(0, over); dropped += over }
        if (quiet) { suppressed += 1; suppressedNow += 1; noteDigest(w, event, at); continue }   // recorded, not delivered
        if (isDup) { deduped += 1; dedupedNow += 1; noteDigest(w, event, at); continue }
        if (typeof deliver !== 'function') { rec.suppressed = true; rec.reason = 'no-transport'; suppressed += 1; suppressedNow += 1; noteDigest(w, event, at); requiresTransport() }   // named refusal, after recording
        try {
          deliver({ id: rec.id, channel: w.channel, subject: w.subject, event, object, payload, fingerprint: fp, at })
          rec.delivered = true
          delivered += 1; deliveredNow += 1
          seen.set(fp, at)
        } catch (err) {
          failures += 1; failuresNow += 1
          rec.delivered = false; rec.reason = 'delivery-failed'
          rec.error = { code: (err && err.code) || CODE.deliveryFailed, message: err && err.message ? err.message : String(err) }
          say({ type: 'notify/delivery-failed', at, watcherId: w.id, event, object, code: rec.error.code })
          if (c.onFailure === 'throw') throw refuse(rec.error.code, 'delivery failed and vmu.notify.onFailure=throw: ' + rec.error.message, 'set onFailure=log to keep business running')
        }
      }
      say({ type: 'notify/emit', at, event, object, targets: targets.length, delivered: deliveredNow, suppressed: suppressedNow, deduped: dedupedNow, failures: failuresNow })
      if (bus && typeof bus.emit === 'function') {
        // BUS CONTRACT: `async emit(hook, payload = {}, opts = {})` (bus.js:254) and the hook is used as a
        // STRING (bus.js:272 `hook.replace(/[^a-z]+/gi, '-')`). This forward used to pass an OBJECT
        // (`{type:'notify/emit',…}`), so the real bus threw `TypeError: hook.replace is not a function`; and
        // because `emit` is ASYNC, the rejection escaped the surrounding try/catch and surfaced as a bare crash.
        // The module's own tests used a stub bus that accepted anything, which is why this stayed hidden.
        // Fixed shape: a string hook + a payload; a refusal/rejection from the bus is ADVISORY (recorded, never
        // fatal) - an observability forward must never take the caller down.
        try {
          const forwarded = bus.emit('notify/emit', { at, event, object, delivered: deliveredNow })
          if (forwarded && typeof forwarded.then === 'function') {
            forwarded.then(undefined, (e) => say({ type: 'notify/bus-forward-failed', at, event, object, code: (e && e.code) || CODE.deliveryFailed, message: String((e && e.message) || e) }))
          }
        } catch (e) {
          say({ type: 'notify/bus-forward-failed', at, event, object, code: (e && e.code) || CODE.deliveryFailed, message: String((e && e.message) || e) })
        }
      }
      return { ok: true, enabled: true, event, object, targets: targets.length, recorded: recordedNow, delivered: deliveredNow, suppressed: suppressedNow, deduped: dedupedNow, failures: failuresNow }
    },

    /** Deliver the pending digest summaries (REQUIRED after a quiet period). */
    flush({ at = null } = {}) {
      const when = Number.isFinite(at) ? at : clock()
      if (Number.isFinite(at) && at < 0) throw refuse('VMU_INVALID_ARGUMENT', 'at must be a non-negative ms timestamp', 'omit it to use the clock')
      const c = cfg()
      if (digests.length === 0) return { ok: true, enabled: c.enabled, digests: [], delivered: 0, failures: 0, dropped: 0 }
      if (!c.enabled) throw refuse('VMU_NOTIFY_DISABLED', 'notifications are off: there is nothing to flush', 'enable vmu.notify.enabled first')
      requiresTransport()
      const out = []
      let deliveredNow = 0, failuresNow = 0
      for (const d of digests.slice()) {
        const w = watchers.find((x) => x.id === d.watcherId)
        if (!w) { continue }
        const total = Object.values(d.counts).reduce((a, b) => a + b, 0)
        const note = { id: 'd-' + (++seq), channel: w.channel, subject: w.subject, kind: 'digest', since: d.since, at: when, counts: Object.assign({}, d.counts), total }
        try { deliver(note); deliveredNow += 1; out.push({ watcherId: w.id, subject: w.subject, total, counts: note.counts }) }
        catch (err) {
          failuresNow += 1
          say({ type: 'notify/digest-failed', at: when, watcherId: w.id, code: (err && err.code) || CODE.deliveryFailed })
          if (c.onFailure === 'throw') throw refuse((err && err.code) || CODE.deliveryFailed, 'digest delivery failed and vmu.notify.onFailure=throw', 'set onFailure=log to keep business running')
        }
      }
      for (const d of digests.slice()) { const i = digests.indexOf(d); if (i >= 0) digests.splice(i, 1) }
      return { ok: true, enabled: true, at: when, digests: out, delivered: deliveredNow, failures: failuresNow, dropped }
    },

    /** Read-only. */
    list() {
      const c = cfg()
      return {
        ok: true, watchers: watchers.map((w) => ({ id: w.id, subject: w.subject, events: w.events.slice(), channel: w.channel, quiet: w.quiet, digest: w.digest, priorityFloor: w.priorityFloor })),
        registered: register.slice(-20).map((r) => ({ id: r.id, watcherId: r.watcherId, event: r.event, object: r.object, at: r.at, delivered: r.delivered, suppressed: r.suppressed, reason: r.reason })),
        registerSize: register.length, pendingDigests: digests.length,
        deduped, suppressed, delivered, failures, droppedFromCap: dropped,
        enabled: c.enabled, registeredEvents: c.registeredEvents,
      }
    },

    /** Read-only self-disclosure (including the deliberate layering with the alert face). */
    status() {
      const c = cfg()
      return {
        ok: true,
        enabled: c.enabled, defaultOff: true,
        watchers: watchers.length, registerSize: register.length, pendingDigests: digests.length,
        deduped, suppressed, delivered, failures, droppedFromCap: dropped,
        dedupWindowMs: c.dedupWindowMs, digestWindowMs: c.digestWindowMs, quiet: c.quiet, onFailure: c.onFailure,
        maxWatchers: c.maxWatchers, maxRegister: c.maxRegister,
        fingerprintScope: 'watcher×event×object',
        alertFingerprintScope: 'metric×object×code (volume 21) — deliberately layered',
        layeringNote: 'thresholds / suppression / escalation belong to volume 21 §5.3 and are NOT redefined here',
        transportInjected: typeof deliver === 'function',
        eventRegistryKnown: Array.isArray(c.registeredEvents),
        registeredEvents: c.registeredEvents,
        quietBlocksDeliveryOnly: true, failedDeliveryDoesNotBlock: c.onFailure === 'log',
        digestRequiredAfterQuiet: true, readsArePure: true,
        at: clock(),
      }
    },
  }
}
