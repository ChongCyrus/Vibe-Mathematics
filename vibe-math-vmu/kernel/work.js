// vmu work ledger — the IN-FLIGHT ledger (docs/07 §3). "Interrupted work is known after a restart."
//
// Why this exists: `work` was a reserved durable key that NOTHING ever wrote, so the promise "after an
// interruption the framework tells the owner what is still unfinished" (docs/08 §5, the v5r lesson) had no
// implementation at all. This module makes it real:
//
//   start()     register an in-flight item (owner, kind, objective, startedAt)
//   settle()    remove it (the work finished)
//   interrupt() mark one item as interrupted (a named reason, never a silent drop)
//   recover()   called AFTER the store is opened: EVERY item still present at startup is by definition
//               interrupted by a host that ended - so they are marked and reported, not guessed
//   list()/status()  the observable surface
//
// Everything is written through `store.patch(key, fn)` (a FUNCTIONAL change inside the fold), which is the
// repository's proven way to keep two same-tick writers from losing each other's work.

/** Public-interface version of this module's surfaces (docs/03 §7). */
export const apiVersion = 1

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.hint = hint
  err.code = code
  return err
}

export const WORK_KEY = 'work'

// Same reason as meeting.js: the injected clock may be numeric (the kernel's guarded clock is), and
// `Date.parse(<number>)` is NaN - which used to collapse the id suffix to a constant.
import { ms as toMs } from './timevalue.js'

export function createWorkLedger({ store, clock = () => new Date().toISOString(), isPaused = () => false } = {}) {
  if (!store || typeof store.patch !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the work ledger needs a durable store',
      'construct the kernel with { root } - an in-flight ledger that forgets on exit would be a lie')
  }
  let seq = 0
  /**
   * LENIENT read: used by the OBSERVATION surface. A store that is not open yet must not turn `status()` into
   * a throw - observability that can break the thing it observes is worse than no observability (R11).
   */
  const readAll = () => {
    try {
      const value = store.read(WORK_KEY)
      return Array.isArray(value) ? value.map((e) => Object.assign({}, e)) : []
    } catch { return [] }
  }
  /** STRICT read: used by every WRITE path. Durable work without an OPEN store is an error, named with a hint. */
  const readStrict = () => {
    try {
      const value = store.read(WORK_KEY)
      return Array.isArray(value) ? value.map((e) => Object.assign({}, e)) : []
    } catch (e) {
      throw refuse('VMU_STORE_FAILED', 'the in-flight ledger needs an OPEN store: ' + String((e && e.message) || e),
        'call kernel.store.open() first - the entry point does it when a durable root is configured')
    }
  }
  const write = (list) => store.patch(WORK_KEY, () => list)

  return {
    async start({ owner, kind = 'work', objective = null, id = null } = {}) {
      if (isPaused()) {
        throw refuse('VMU_STATE', 'the kernel is paused: no new in-flight work is registered',
          'resume() first (vibe_vmu_control {action:"resume"})')
      }
      if (typeof owner !== 'string' || owner.trim().length === 0) {
        throw refuse('VMU_INVALID_ARGUMENT', 'in-flight work needs a non-empty owner (docs/07 §3)',
          'the owner is who must be told "you still have unfinished work" after a restart')
      }
      // RULE F caught this in the SAME round it was written: `toMs(clock()) || 0` turned an unparseable clock
      // into a silent zero. A clock the host injected that cannot be read is a host error, not something to
      // absorb, so it refuses by name - and the id suffix is then built from a value that is actually finite.
      const startedMs = toMs(clock())
      if (!Number.isFinite(startedMs)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'the injected clock must return finite epoch-ms or an ISO timestamp',
          'the work ledger refuses to absorb an unreadable clock as zero; received: ' + JSON.stringify(clock()))
      }
      const entry = {
        id: typeof id === 'string' && id.length > 0 ? id : 'w-' + (++seq) + '-' + Math.abs(startedMs).toString(36),
        owner: String(owner),
        kind: String(kind),
        objective: objective === null ? null : String(objective),
        startedAt: clock(),
        interrupted: false,
        interruptedAt: null,
        interruptedReason: null,
      }
      await write(readStrict().concat([entry]))
      return { ok: true, entry: Object.assign({}, entry) }
    },

    async settle(id, { outcome = null } = {}) {
      const all = readStrict()
      const found = all.find((e) => e.id === id)
      if (!found) {
        throw refuse('VMU_NO_SUCH_OBJECT', 'no in-flight entry with id ' + String(id),
          'known: ' + (all.map((e) => e.id).join(', ') || '(none)'))
      }
      const rest = all.filter((e) => e.id !== id)
      await write(rest)
      return { ok: true, id, settled: Object.assign({}, found), outcome: outcome === null ? null : String(outcome),
        remaining: rest.length }
    },

    async interrupt(id, reason = 'host-ended') {
      const all = readStrict()
      const found = all.find((e) => e.id === id)
      if (!found) throw refuse('VMU_NO_SUCH_OBJECT', 'no in-flight entry with id ' + String(id))
      if (found.interrupted) return { ok: true, id, already: true, entry: Object.assign({}, found) }
      const next = all.map((e) => (e.id === id
        ? Object.assign({}, e, { interrupted: true, interruptedAt: clock(), interruptedReason: String(reason) })
        : e))
      await write(next)
      return { ok: true, id, entry: Object.assign({}, next.find((e) => e.id === id)) }
    },

    /**
     * Called AFTER the store is open. Anything still listed was written by a PREVIOUS process: by definition
     * it did not settle, so it is marked interrupted with a named reason and reported (never silently dropped,
     * never guessed as "probably done").
     */
    async recover({ reason = 'host-ended-before-settle' } = {}) {
      const all = readStrict()
      const pending = all.filter((e) => !e.interrupted)
      if (pending.length === 0) return { ok: true, recovered: 0, entries: all, note: 'nothing was in flight' }
      const at = clock()
      const next = all.map((e) => (e.interrupted ? e
        : Object.assign({}, e, { interrupted: true, interruptedAt: at, interruptedReason: String(reason) })))
      await write(next)
      return { ok: true, recovered: pending.length, entries: next.map((e) => Object.assign({}, e)),
        note: pending.length + ' in-flight item(s) survived a restart and are marked interrupted: the owner is told, nothing is silently dropped' }
    },

    list() { return readAll() },
    pending() { return readAll().filter((e) => !e.interrupted) },
    interrupted() { return readAll().filter((e) => e.interrupted) },

    status() {
      const all = readAll()
      return { entries: all.length, interrupted: all.filter((e) => e.interrupted).length,
        pending: all.filter((e) => !e.interrupted).length,
        note: 'durable in-flight ledger (docs/07 §3); recover() runs after the store opens, so a restart marks whatever did not settle' }
    },
  }
}
