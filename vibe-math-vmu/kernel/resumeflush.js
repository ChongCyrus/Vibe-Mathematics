// vmu recovery — THE EXIT CONTRACT (task-70 A), split out of `kernel/resume.js` at a MODULE boundary.
//
// ── WHY THIS FILE EXISTS AS A MODULE ────────────────────────────────────────────────────────────────────────────
// `kernel/resume.js` crossed the 1200-line limit set by docs/02 in round 9 (measured, not guessed). The split is
// not "move some lines somewhere": it follows the one seam that is already clean, because the two halves talk
// through explicit ports instead of shared state.
//
// ── THE BOUNDARY (one-way; a change on the wrong side is a bug) ─────────────────────────────────────────────────
//   · `kernel/resume.js` OWNS THE PROJECTIONS: which keys exist, each key's mode, when a mutation is recorded, the
//     write-through registration, the read-before-write latch, and the durable writer (`snapshot({key})`).
//   · THIS MODULE OWNS ONLY THE EXIT SEMANTICS: what "a clean exit" means —
//       `settle()`   drains the write-through promises the ENGINE started (they end in real file I/O);
//       `flushAll()` writes every JOURNAL projection and NAMES why a state projection needs nothing here;
//       `exit()`     settle, then flush, with `ok` = the AND of both halves.
//     It never imports the engine, never touches a face, and never decides WHAT to project: it is handed
//     `snapshot({key})`, the key list + each key's mode, the LIVE `pendingWrites` Set, the counters, the read gate
//     and the refusal codes. ⇒ "which keys exist" changes in resume.js; "what a clean exit means" changes here.
//
// ── TWO RULES THAT ARE NOT NEGOTIABLE ───────────────────────────────────────────────────────────────────────────
//   ① NOTHING HERE THROWS ON FAILURE. `exit()` is called from a host DISPOSE path, where a throw is likely to be
//      swallowed or to abort the rest of the teardown (core's requirement). Failures come back in `failed[]` with
//      their code, and `ok` goes `false` so the assembly can name them loudly.
//   ② THE CLOCK IS NEVER READ FOR REAL, AND NEVER LEAKS `NaN`. `waitedMs` is a diagnostic measured on the INJECTED
//      clock through `msStrict`; an uninterpretable instant is a NAMED refusal that degrades the diagnostic to
//      `null` (`clockNote` carries why) — see `audit-declaration-criterion` RULE F.
import { msStrict } from './timevalue.js'

/** Public-interface version of this module's surface (docs/03 §7, D13-O3). */
export const apiVersion = 1

/**
 * `createExitContract({ clock, stamp, snapshot, keyList, modeOf, keyExists, pendingWrites, counters, storeReady,
 * requireRead, codes })` ⇒ `{ settle, flushAll, exit, status }`.
 *
 * Every port is a FUNCTION so the engine can hand over live views (a counter that keeps counting, a Set that keeps
 * filling) without this module holding a reference to engine internals.
 */
export function createExitContract({
  clock = () => Date.now(),
  stamp = () => clock(),
  snapshot = null,
  keyList = () => [],
  modeOf = () => 'journal',
  keyExists = () => true,
  pendingWrites = new Set(),
  counters = () => ({ writesThrough: 0, writeThroughFailures: 0 }),
  storeReady = () => false,
  requireRead = () => {},
  codes = {},
} = {}) {
  if (typeof snapshot !== 'function') throw new Error('createExitContract needs a snapshot({key}) writer')

  /**
   * A NON-THROWING guarded clock read, for `settle()` only. `settle()` runs on a host DISPOSE path (where a throw
   * is likely to be swallowed or to abort the rest of the teardown), and it reads the clock solely for the
   * `waitedMs` diagnostic — so an uninterpretable instant is NAMED through the registered refusal (`msStrict`) and
   * the diagnostic degrades to `null`. It is never silently propagated as `NaN`.
   */
  const readClock = () => {
    try { return { ok: true, ms: msStrict(clock(), 'the injected recovery clock') } }
    catch (e) { return { ok: false, code: (e && e.code) || codes.clockUnavailable || 'VMU_RESUME_CLOCK_UNAVAILABLE', message: String((e && e.message) || e) } }
  }

  /**
   * Drain the write-throughs THIS engine started. The promise set is registered SYNCHRONOUSLY by the engine, so
   * "is it durable now?" has a truthful answer in the same tick as the mutation — and one `await` replaces the
   * "sleep long enough / poll `status().writesThrough`" guessing that a caller would otherwise have to do.
   */
  async function settle() {
    const t0 = readClock()
    let rounds = 0
    // A write-through cannot start another mutation by construction, but the drain is bounded anyway: an unbounded
    // loop on a shutdown path is its own failure mode.
    while (pendingWrites.size > 0 && rounds < 10000) {
      rounds += 1
      await Promise.allSettled([...pendingWrites])
    }
    const t1 = readClock()
    const c = counters()
    return {
      ok: c.writeThroughFailures === 0, settled: true, rounds, pending: pendingWrites.size,
      // The framework never reads a real clock: `waitedMs` is measured on the INJECTED one (in a drill whose clock
      // advances one tick per call it is therefore a tick count, not wall time).
      waitedMs: t0.ok && t1.ok ? Math.max(0, t1.ms - t0.ms) : null,
      clockNote: t0.ok && t1.ok ? null : (t0.message || t1.message),
      writesThrough: c.writesThrough, writeThroughFailures: c.writeThroughFailures,
      note: pendingWrites.size ? 'the drain did not converge: writes are still in flight' : 'every write-through this engine started has landed',
    }
  }

  /**
   * Write every JOURNAL projection under its durable key. A state projection needs nothing here — it wrote through
   * on every mutation — which is exactly why it lands in `skipped[]` BY NAME instead of being silently skipped.
   * `{ keys: [...] }` narrows the flush; the default is every key the engine registered, in attach order.
   */
  async function flushAll({ keys = null } = {}) {
    const flushed = []
    const failed = []
    const skipped = []
    // NO STORE PORT AT ALL is not a flush failure: it is a memory-only engine, and the honest answer is the one
    // `createDurableCommitLog` already gives without a store ("the seam is absent, not pretended"). Naming it here
    // is what lets the assembly tell "there is no durable root" apart from "the flush failed".
    if (!storeReady()) {
      return { ok: true, flushed, failed, skipped: [{ key: null, reason: 'no durable store port is attached: the projections are memory-only, so there is nothing to flush (named, never pretended)' }], at: stamp(),
        note: 'the durable seam is absent, not pretended' }
    }
    try { requireRead('flush every journal projection') } catch (e) {
      return { ok: false, flushed, failed: [{ key: null, code: (e && e.code) || codes.writeBeforeRead || 'VMU_RESUME_WRITE_BEFORE_READ', message: String((e && e.message) || e) }], skipped, at: stamp(),
        note: 'the durable fold was never read in this lifetime: refusing to overwrite an unread snapshot' }
    }
    const want = Array.isArray(keys) && keys.length ? keys.map(String) : keyList()
    for (const k of want) {
      if (!keyExists(k)) { skipped.push({ key: k, reason: 'no projection adapter is registered for this key' }); continue }
      if (modeOf(k) !== 'journal') { skipped.push({ key: k, reason: 'a state projection writes through on every mutation: it is already durable and needs no flush' }); continue }
      try {
        const r = await snapshot({ key: k })
        flushed.push({ key: k, entries: r.entries, seq: r.seq, incomplete: r.incomplete === true })
      } catch (e) {
        failed.push({ key: k, code: (e && e.code) || codes.unavailable || 'VMU_RESUME_UNAVAILABLE', message: String((e && e.message) || e) })
      }
    }
    return { ok: failed.length === 0, flushed, failed, skipped, at: stamp(),
      note: failed.length ? 'some journal projections could NOT be flushed: this exit is NOT a successful exit' : 'every journal projection is on disk under its durable key' }
  }

  /** The one call the assembly makes on the way out. `ok` is the AND of both halves — never "at least one worked". */
  async function exit({ reason = null } = {}) {
    const wt = await settle()
    const jr = await flushAll()
    return {
      ok: wt.ok === true && jr.ok === true, at: stamp(),
      reason: reason === null || reason === undefined ? null : String(reason),
      writeThrough: { settled: wt.settled === true, waitedMs: wt.waitedMs, pending: wt.pending, failures: wt.writeThroughFailures },
      journal: { flushed: jr.flushed, failed: jr.failed, skipped: jr.skipped },
      note: jr.failed.length || wt.ok !== true
        ? 'the exit is NOT clean: the failures are named in writeThrough/journal'
        : 'write-throughs drained and every journal projection flushed',
    }
  }

  /** Read-only view of the contract itself: how many write-throughs are in flight right now, and what is flushed. */
  const status = () => {
    const c = counters()
    return { apiVersion, pendingWrites: pendingWrites.size, writesThrough: c.writesThrough, writeThroughFailures: c.writeThroughFailures,
      journalKeys: keyList().filter((k) => modeOf(k) === 'journal'), stateKeys: keyList().filter((k) => modeOf(k) !== 'journal') }
  }

  return { settle, flushAll, exit, status, readClock }
}

export default createExitContract
