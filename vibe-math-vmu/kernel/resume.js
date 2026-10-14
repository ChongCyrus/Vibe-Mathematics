// vmu kernel · resume — SESSION RECOVERY PRIMITIVES (docs/07 §4; docs/26 §6).
//
// WHY THIS EXISTS. Round 1 measured that the durable layer was almost entirely asleep: of the twelve declared
// white-list keys (`kernel/store.js:32-50`) only `work` and `idempotency` had a writer AND a reader. A restart
// therefore lost the roster, the task board, the meetings, the ballots and the budget, and every module that
// mints ids from a process-local `seq` (e.g. `kernel/tasks.js:59,122`) started again at 1 — so an id could be
// REUSED, which the v5r lesson («names are immortal») forbids.
//
// This face is the recovery ENGINE, not a policy: it reads a durable fold, reports what a recovery would do,
// writes projections through a read-before-write gate, and refuses BY NAME whenever it cannot honestly claim a
// state was restored. It never decides anything about the institute (that is strategy, and strategy lives in
// settings/packs — docs/01).
//
// THE FOUR INVARIANTS THIS FACE ENFORCES (each one is a v5r lesson, docs/07 §4):
//   ① READ BEFORE WRITE. A snapshot that was never read must never be overwritten. `write()`/`patch()` throw
//      `VMU_RESUME_WRITE_BEFORE_READ` until a full read of the CURRENT store succeeded (the v5r
//      `V5_STATE_NOT_LOADED` rule, expressed as a named refusal on every write path).
//   ② IDS ARE NEVER REUSED. Counters are durable (`resume.counters`) and `nextId()` takes
//      max(stored, observed)+1; a journal hydration also advances the face's own `seq` because the commands are
//      REPLAYED through its public methods. A fresh process can therefore never hand out `t-1` twice.
//   ③ INTERRUPTED IS NAMED, PASSED IS EARNED. Work that survived a restart is marked `interrupted` with a reason
//      (the `work` ledger already does this) and `settleOutcome({ outcome: 'passed' })` REFUSES for such an id
//      unless the caller passes an explicit, reasoned override. Nothing silently becomes `passed`.
//   ④ NO FAKE RESTORE. `hydrate()` needs either a `restore(value)` seam (state mode) or a complete command
//      journal with a `replay(entry)` seam (journal mode). A key without an adapter, or a journal with a hole,
//      is REPORTED (`VMU_RESUME_NO_ADAPTER` / `VMU_RESUME_PROJECTION_GAP`) and `status().projection.degraded`
//      turns true — an empty roster after a restart must never look like a restored one.
//
// FACE CONVENTIONS (the same as every other vmu face): literal key reads; receipts carry enforced[]/fired[];
// refusals are named; injected clock; reads never mutate; nothing declared means nothing happens.
export const apiVersion = 1

export function refuse(code, message, hint, extra) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  if (extra !== undefined) e.detail = extra
  return e
}

// The injected clock may be numeric (the kernel's guarded clock is) or an ISO string; both must name the same
// instant (the lesson `kernel/work.js:76-83` paid for).
import { ms as toMs } from './timevalue.js'

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const boolOr = (v, d) => (typeof v === 'boolean' ? v : d)
const listOf = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [])
const natural = (v, d) => { const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : d }

/** The durable key this face owns (added to `kernel/store.js` PUBLIC_KEYS in the same round — Round 1's lesson). */
export const RESUME_KEY = 'resume'

/** The keys a projection may write. They are ALL already in the store white-list; this is not a new one. */
export const PROJECTION_KEYS = Object.freeze(['members', 'tasks', 'meetings', 'ballots', 'budget', 'phase', 'work', 'chat', 'panel', 'human'])

/** The steps of a recovery, in the order the v5r `resume()` used (docs/07 §4: one code path for both restarts). */
export const RECOVERY_STEPS = Object.freeze([
  'read',        // the durable fold is read back (nothing may be written before this succeeds)
  'roster',      // who is on the books (members projection / identity list)
  'inflight',    // in-flight work is marked interrupted BY NAME, never dropped, never guessed done
  'ledgers',     // tasks / meetings / ballots / budget / phase projections are hydrated
  'mailbox',     // unacknowledged messages are counted (an injected port; absent is REPORTED, never faked)
  'watchdogs',   // stale watchdog clocks are refreshed (an injected port)
  'flags',       // the operational flags a resumed session must know (paused scopes, degraded projections)
  'readback',    // what was written is read back and compared (drift is named)
  'outcome',     // interrupted work can never be reported as passed
])

export const CODE = Object.freeze({
  unavailable: 'VMU_RESUME_UNAVAILABLE',
  writeBeforeRead: 'VMU_RESUME_WRITE_BEFORE_READ',
  badStep: 'VMU_RESUME_BAD_STEP',
  interruptedNotPassed: 'VMU_RESUME_INTERRUPTED_NOT_PASSED',
  mailboxMissing: 'VMU_RESUME_MAILBOX_UNAVAILABLE',
  clockUnavailable: 'VMU_RESUME_CLOCK_UNAVAILABLE',
  readbackDrift: 'VMU_RESUME_READBACK_DRIFT',
  projectionGap: 'VMU_RESUME_PROJECTION_GAP',
  noAdapter: 'VMU_RESUME_NO_ADAPTER',
  queueFull: 'VMU_RESUME_QUEUE_FULL',
  // Shared with every face that exposes a snapshot/restore seam (one source of codes, never a second set):
  //   · a snapshot whose version/apiVersion/face does not match this build;
  //   · a snapshot that is missing a required collection;
  //   · a restore that cannot safely merge into live state.
  snapshotVersion: 'VMU_RESUME_SNAPSHOT_VERSION',
  snapshotIncomplete: 'VMU_RESUME_SNAPSHOT_INCOMPLETE',
  restoreConflict: 'VMU_RESUME_RESTORE_CONFLICT',
  // F18 (Round 4): a recovery is an EXCLUSIVE section. When a lock seam is injected (the repository's own
  // `vmu.store.lock` primitive), a second concurrent recovery is refused BY NAME instead of interleaving.
  busy: 'VMU_RESUME_BUSY',
  // F51 (Round 4): the live-child reconciliation needs the host to say which continuable children still exist.
  // With no such port the recovery still runs and REPORTS that it could not check (never guesses).
  childrenUnavailable: 'VMU_RESUME_CHILDREN_UNAVAILABLE',
})

/**
 * The ONE validator for face snapshots (docs/07 §4). Every face with a `snapshot()`/`restore()` seam calls it, so
 * "what a snapshot must look like" is defined once: `{ apiVersion:1, face, v:1, at, data, counters?, skipped? }`.
 * Missing collections are NAMED (`detail.missing`), never silently dropped.
 */
export function checkSnapshot(face, snap, required = []) {
  const problems = []
  if (!snap || typeof snap !== 'object') {
    throw refuse(CODE.snapshotIncomplete, 'a snapshot is required for face ' + String(face), 'pass the value returned by snapshot()', { face: String(face) })
  }
  if (snap.apiVersion !== 1 || snap.v !== 1) problems.push('apiVersion/v must be 1 (got ' + JSON.stringify(snap.apiVersion) + '/' + JSON.stringify(snap.v) + ')')
  if (String(snap.face || '') !== String(face)) problems.push('face must be "' + String(face) + '" (got ' + JSON.stringify(snap.face) + ')')
  const missing = required.filter((k) => snap.data === undefined || snap.data === null || snap.data[k] === undefined)
  if (problems.length) {
    throw refuse(CODE.snapshotVersion, 'this build cannot use the snapshot for face ' + String(face) + ': ' + problems.join('; '),
      'a version bump REQUIRES a migrator (docs/07 §2); refusing to hydrate from a snapshot we do not understand', { face: String(face), problems })
  }
  if (missing.length) {
    throw refuse(CODE.snapshotIncomplete, 'the snapshot for face ' + String(face) + ' is missing: ' + missing.join(', '),
      'a missing collection must be reported by the face, never silently treated as empty', { face: String(face), missing })
  }
  return { ok: true, face: String(face), counters: snap.counters && typeof snap.counters === 'object' ? snap.counters : {}, skipped: Array.isArray(snap.skipped) ? snap.skipped.slice() : [] }
}

/** Deterministic JSON: key order must never decide whether two snapshots compare equal. */
function stableStringify(value) {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'
}

/** A cheap, dependency-free content identity (FNV-1a + length). It only has to detect DRIFT, not resist forgery. */
export function contentDigest(value) {
  const s = stableStringify(value)
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h.toString(16).padStart(8, '0') + ':' + s.length
}

/** Deep, JSON-safe copy: a projection must never keep a live reference into the face it snapshotted. */
function clone(value) {
  if (value === undefined) return undefined
  try { return JSON.parse(JSON.stringify(value)) } catch (e) { return undefined }
}

/** The last `N` suffix of an id (`t-12` ⇒ 12), or null. Used to reconcile a durable counter with reality. */
export function idSuffix(id) {
  const m = /(\d+)\s*$/.exec(String(id === undefined || id === null ? '' : id))
  return m ? Number(m[1]) : null
}

/**
 * The pure part of a projection wrapper (no store, so it is unit-testable on its own).
 *
 * `mode:'journal'` records each wrapped call and hydration REPLAYS the commands through the target's own public
 * methods — which is what makes a face's process-local `seq` advance to the recorded maximum again instead of
 * restarting at 1. `mode:'state'` snapshots a value and needs a `restore(value)` seam to hydrate.
 *
 * A journal that had to drop old entries is marked `incomplete`: replay can no longer rebuild the state, and
 * `hydrate` refuses it by name instead of producing a plausible, wrong institute.
 */
export function createProjection({ key, mode = 'journal', snapshot = null, restore = null, list = null, replay = null, cap = 5000 } = {}) {
  if (!str(key)) throw refuse('VMU_INVALID_ARGUMENT', 'a projection needs a key', 'pass { key: "tasks" }')
  if (mode !== 'journal' && mode !== 'state') throw refuse('VMU_INVALID_ARGUMENT', 'unknown projection mode: ' + String(mode), 'one of journal, state')
  let seq = 0
  let dropped = 0
  const entries = []
  const st = { key, mode, seq, entries, dropped, incomplete: false, restored: 0, at: null }

  const projection = {
    key,
    mode,
    // The mutable counters live ON the projection (not only in the closure): `envelope()` and `replayable()`
    // read them through `this`, and an unset field used to make `incomplete === undefined` look "not incomplete".
    seq: 0,
    dropped: 0,
    incomplete: false,
    /** Record one journal entry. `args` are cloned: a projection owns its own copy of history. */
    record(method, args, result, replayable = true) {
      if (mode !== 'journal') return null
      seq += 1
      const clonedArgs = clone(Array.isArray(args) ? args : [])
      entries.push({ seq, method: String(method), args: clonedArgs === undefined ? null : clonedArgs, unserializable: clonedArgs === undefined, replayable: replayable !== false, result: clone(result) === undefined ? null : clone(result), at: null })
      if (entries.length > cap) { const drop = entries.length - cap; entries.splice(0, drop); dropped += drop; this.incomplete = true }
      this.seq = seq
      this.dropped = dropped
      return entries[entries.length - 1]
    },
    /** Stamp the wall-clock of the last record (the clock is injected; the projection never reads a real one). */
    stamp(stampValue) { if (entries.length && entries[entries.length - 1].at === null) entries[entries.length - 1].at = stampValue; return entries[entries.length - 1] || null },
    entries() { return entries.map((e) => Object.assign({}, e)) },
    size() { return entries.length },
    /** Is this journal replayable end to end? A dropped head makes it incomplete, and that is REPORTED. */
    replayable() { return mode !== 'journal' || !this.incomplete },
    /** The envelope this projection persists under its durable key. */
    envelope() { return { v: 1, mode: this.mode, key: this.key, seq: this.seq, dropped: this.dropped, incomplete: this.incomplete, entries: entries.map((e) => Object.assign({}, e)), value: undefined, digest: null } },
    /** Restore an envelope read from the store (a restarted process sees exactly what the previous one wrote). */
    adopt(env) {
      if (!env || typeof env !== 'object' || env.key !== key) return { ok: false, reason: 'envelope does not belong to this projection' }
      this.mode = env.mode === 'state' ? 'state' : 'journal'
      this.seq = natural(env.seq, 0)
      this.dropped = natural(env.dropped, 0)
      this.incomplete = env.incomplete === true
      entries.length = 0
      if (Array.isArray(env.entries)) for (const e of env.entries) entries.push(Object.assign({}, e))
      return { ok: true, seq: this.seq, entries: entries.length, incomplete: this.incomplete }
    },
    /** A state-mode envelope (the other durable shape). */
    stateEnvelope(value) { return { v: 1, mode: 'state', key: this.key, seq: this.seq, dropped: this.dropped, incomplete: false, entries: [], value: clone(value), digest: contentDigest(value) } },
    /**
     * Is the journal replayable end to end? A dropped head makes it incomplete; a NON-REPLAYABLE command (one
     * with side effects outside the face: host IO, a clock-dependent branch, an external call) makes the replay
     * stop being a reconstruction. Both are NAMED, because "looks restored, silently missing one entry" is the
     * exact failure this face exists to prevent.
     */
    gap() {
      if (this.mode !== 'journal') return null
      if (this.incomplete) return { kind: 'truncated-head', dropped: this.dropped, note: 'the journal dropped its oldest entries, so a replay cannot rebuild the state' }
      for (let i = 0; i < entries.length; i += 1) if (entries[i].seq !== i + 1) return { kind: 'hole', at: entries[i].seq, expected: i + 1 }
      if (entries.length > 0 && entries[entries.length - 1].seq !== this.seq) return { kind: 'tail', at: this.seq, have: entries[entries.length - 1].seq }
      const notReplayable = entries.filter((e) => e.replayable === false).map((e) => e.method)
      if (notReplayable.length) {
        return { kind: 'non-replayable', methods: [...new Set(notReplayable)], note: 'these commands have effects outside the face, so replaying them is not a reconstruction: it is refused rather than silently skipped' }
      }
      const unserializable = entries.filter((e) => e.unserializable === true).map((e) => e.method)
      if (unserializable.length) {
        return { kind: 'unserializable-args', methods: [...new Set(unserializable)], note: 'a recorded command had arguments that could not be persisted, so it cannot be replayed faithfully' }
      }
      return null
    },
    snapshot,
    restore,
    list,
    replay,
  }
  return projection
}

/**
 * Wrap the named mutating methods of a face so every call is recorded into a projection.
 * Returns `{ wrapped, missing, projection, unwrap }` — a method name that does not exist is REPORTED, never
 * silently skipped (a typo in the assembly list would otherwise lose durability for that method).
 */
export function attachProjection({ target, methods = [], projection, onError = null, nonReplayable = [], after = null } = {}) {
  if (!target || typeof target !== 'object') throw refuse('VMU_INVALID_ARGUMENT', 'attachProjection needs a target object')
  if (!projection || typeof projection.record !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'attachProjection needs a projection from createProjection()')
  const cannotReplay = new Set(listOf(nonReplayable))
  const wrapped = []
  const missing = []
  const originals = new Map()
  let replaying = false
  const runAfter = (name) => {
    if (typeof after !== 'function' || replaying) return
    try {
      const r = after(name)
      // A write-through is asynchronous by nature; a rejected promise must be REPORTED, never left unhandled.
      if (r && typeof r.catch === 'function') r.catch((e) => { if (typeof onError === 'function') onError(e) })
    } catch (e) { if (typeof onError === 'function') onError(e) }
  }
  for (const name of listOf(methods)) {
    const original = target[name]
    if (typeof original !== 'function') { missing.push(name); continue }
    originals.set(name, original)
    const record = (args, result) => {
      if (replaying) return
      try { projection.record(name, args, result, !cannotReplay.has(name)) } catch (e) { if (typeof onError === 'function') onError(e) }
      runAfter(name)
    }
    target[name] = function wrappedMethod(...args) {
      let out
      try { out = original.apply(this, args) } catch (e) { record(args, { ok: false, error: String((e && e.code) || '') }); throw e }
      if (out && typeof out.then === 'function') {
        return out.then((result) => { record(args, result); return result }, (e) => { record(args, { ok: false, error: String((e && e.code) || '') }); throw e })
      }
      record(args, out)
      return out
    }
    wrapped.push(name)
  }
  return {
    wrapped,
    missing,
    projection,
    /** Hydration replays through the wrapped methods without re-recording them (otherwise every restart would double the journal). */
    async replayAll(seam) {
      replaying = true
      const applied = []
      try {
        for (const entry of projection.entries()) {
          if (typeof seam !== 'function') { applied.push({ seq: entry.seq, applied: false, reason: 'no replay seam' }); continue }
          await seam(entry)
          applied.push({ seq: entry.seq, applied: true, method: entry.method })
        }
      } finally { replaying = false }
      return applied
    },
    unwrap() {
      for (const [name, original] of originals) target[name] = original
      return wrapped.slice()
    },
  }
}

export function createResume({ store = null, work = null, control = null, identity = null, mailbox = null, watchdogs = null,
  lock = null, children = null, roster = null, reassign = null, faces = {}, settings = {}, bus = null, clock = () => 0, log = null, listCap = 100 } = {}) {
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging never breaks the face */ } } }
  // Hook producers must pass the NAME first (`kernel/bus.js` refuses a non-string hook) and catch the async
  // rejection on the promise: a `{ type: … }` object is swallowed by the bus and never reaches any middleware.
  const emit = (name, payload) => {
    if (!bus || typeof bus.emit !== 'function') return null
    try {
      const r = bus.emit(name, payload)
      if (r && typeof r.catch === 'function') r.catch(() => {})
      return r
    } catch (e) { return null }
  }

  const cfg = () => ({
    autoRecover: sget('vmu.resume.autoRecover') !== false,
    projections: listOf(sget('vmu.resume.projections')),
    keepRecoveries: natural(sget('vmu.resume.keepRecoveries'), 20),
    readBack: sget('vmu.resume.readBack') !== false,
    journalCap: natural(sget('vmu.resume.journalCap'), 5000),
    // State projections are written after every wrapped mutation unless this is switched off (a face that is
    // hydratable but never written is durable in appearance only).
    writeThrough: sget('vmu.resume.writeThrough') !== false,
  })

  // ── the read-before-write latch (invariant ①) ───────────────────────────────────────────────────────────────
  let readOk = false
  let readAt = null
  let readKeys = []
  let readDigest = null
  let writeRefusals = 0
  let writes = 0
  let writesThrough = 0
  let writeThroughFailures = 0
  let readBacks = 0
  let readBackFailures = 0
  let lastDrift = null
  let phaseValue = null          // the institute phase this session knows about (durable under `phase`)
  // task-52 B: the RE-DISPATCH attempt counters, durable across restarts (that is what makes "never loop forever"
  // a mechanism instead of a promise). The mapping lives in the `resume` key.
  const reassignAttempts = new Map()
  const expectations = new Map()   // key -> digest of what we last wrote (read-back compares against it)

  const stamp = () => {
    const ms = toMs(clock())
    if (!Number.isFinite(ms)) {
      throw refuse(CODE.clockUnavailable, 'the injected clock must return finite epoch-ms or an ISO timestamp',
        'the recovery face refuses to absorb an unreadable clock as zero; received: ' + JSON.stringify(clock()))
    }
    return ms
  }

  const projections = new Map()   // key -> { projection, target?, wrapper? }

  const projectionFor = (key, adapter) => {
    if (projections.has(key)) return projections.get(key).projection
    const a = adapter || {}
    const p = createProjection({ key, mode: a.mode === 'state' ? 'state' : 'journal', snapshot: a.snapshot || null, restore: a.restore || null, list: a.list || null, replay: a.replay || null, cap: cfg().journalCap })
    projections.set(key, { projection: p, adapter: a, target: null, wrapper: null })
    return p
  }

  // registered adapters from the construction map
  for (const [key, adapter] of Object.entries(faces || {})) projectionFor(key, adapter)

  const requireStore = (what) => {
    if (!store || typeof store.patch !== 'function' || typeof store.read !== 'function') {
      throw refuse(CODE.unavailable, 'the recovery face needs a durable store for ' + what,
        'construct the kernel with { root } - a recovery that cannot read a fold would be a claim, not a recovery')
    }
  }

  /** Read the WHOLE durable fold and latch it. Nothing may be written before this returns ok. */
  function read() {
    requireStore('a read')
    let fold = null
    try {
      fold = typeof store.export === 'function' ? store.export() : null
    } catch (e) {
      throw refuse(CODE.unavailable, 'the durable fold could not be read: ' + String((e && e.message) || e),
        'open the store first; refusing to continue with an unread fold', { error: String((e && e.code) || '') })
    }
    if (!fold || typeof fold !== 'object' || typeof fold.keys !== 'object' || fold.keys === null) {
      throw refuse(CODE.unavailable, 'the durable fold has no keys object', 'refusing to treat an unreadable fold as an empty one')
    }
    readKeys = Object.keys(fold.keys)
    readDigest = contentDigest(fold.keys)
    readOk = true
    readAt = stamp()
    // adopt any envelope this face owns, and any projection envelope found under a projection key
    const own = fold.keys[RESUME_KEY]
    if (own && typeof own === 'object' && own.counters && typeof own.counters === 'object') {
      for (const [kind, n] of Object.entries(own.counters)) if (Number.isInteger(Number(n))) counters.set(String(kind), Number(n))
    }
    // The recovery HISTORY is adopted too, so a second session APPENDS to it instead of resetting a record that
    // an operator may be reading (bounded by `vmu.resume.keepRecoveries`).
    if (own && typeof own === 'object' && Array.isArray(own.recoveries)) {
      state.recoveries = own.recoveries.slice(-natural(sget('vmu.resume.keepRecoveries'), 20))
    }
    // A re-dispatch counter that did NOT survive the restart would let a crash loop re-dispatch forever.
    if (own && typeof own === 'object' && own.reassignAttempts && typeof own.reassignAttempts === 'object') {
      for (const [member, n] of Object.entries(own.reassignAttempts)) if (Number.isInteger(Number(n))) reassignAttempts.set(String(member), Number(n))
    }
    for (const [key, holder] of projections) {
      const env = fold.keys[key]
      if (env && typeof env === 'object' && env.v === 1 && env.key === key) holder.projection.adopt(env)
    }
    return { ok: true, read: true, at: readAt, keys: readKeys.slice(), digest: readDigest, entry: fold.keys[RESUME_KEY] !== undefined }
  }

  const requireRead = (what) => {
    if (!readOk) {
      writeRefusals += 1
      throw refuse(CODE.writeBeforeRead, 'refusing to ' + what + ': the durable fold was never read successfully in this lifetime',
        'call resume.read() (or resume.recover()) first - an unread snapshot must never be overwritten (the v5r V5_STATE_NOT_LOADED rule)')
    }
  }

  /** The gated write. THE ONLY path this face has into durable state. */
  async function write(key, value) {
    requireStore('a write')
    requireRead('write durable key ' + String(key))
    // The WHITE-LIST is the store's own contract (`store.patch` refuses an undeclared key by name); this face
    // does not keep a second list, because a second list is how a key gets lost.
    const at = stamp()
    const payload = Object.assign({}, clone(value), { wroteAt: at })
    await store.patch(String(key), () => payload)
    writes += 1
    expectations.set(String(key), contentDigest(payload))
    return { ok: true, key: String(key), at, digest: contentDigest(payload) }
  }

  /** Functional write inside the fold — the repository's proven shape for same-tick writers. */
  async function patch(key, fn) {
    requireStore('a patch')
    requireRead('patch durable key ' + String(key))
    if (typeof fn !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'patch needs a function: (current) => next')
    const at = stamp()
    await store.patch(String(key), fn)
    writes += 1
    return { ok: true, key: String(key), at }
  }

  // ── durable counters: the answer to "ids restart at 1" (invariant ②) ────────────────────────────────────────
  const counters = new Map()
  const counterEnvelope = () => ({ v: 1, mode: 'counters', key: RESUME_KEY, counters: Object.fromEntries([...counters.entries()].sort()), ...(state.recoveries.length ? { recoveries: state.recoveries.slice() } : {}) })
  /** Take the maximum of what we stored and what we SEE, then hand out max+1. Reuse is impossible by construction. */
  function nextId(kind, prefix = null) {
    const k = str(kind)
    if (!k) throw refuse('VMU_INVALID_ARGUMENT', 'nextId needs a kind', 'e.g. nextId("task", "t-")')
    requireRead('allocate an id for ' + k)
    const n = Math.max(0, counters.get(k) || 0) + 1
    counters.set(k, n)
    return (prefix === null ? k + '-' : String(prefix)) + n
  }
  /** Reconcile a counter with ids that actually exist (called after a hydration, or by a face on demand). */
  function observeIds(kind, ids) {
    const k = str(kind)
    if (!k) throw refuse('VMU_INVALID_ARGUMENT', 'observeIds needs a kind')
    requireRead('observe ids for ' + k)
    let max = counters.get(k) || 0
    const seen = []
    for (const id of (Array.isArray(ids) ? ids : [])) { const n = idSuffix(id); if (n !== null) { seen.push(n); if (n > max) max = n } }
    const raised = max !== (counters.get(k) || 0)
    counters.set(k, max)
    return { ok: true, kind: k, counter: max, observed: seen.length, raised }
  }

  // ── the institute phase: a first-class durable value this engine owns ───────────────────────────────────────
  // `phase` is a declared white-list key that NO kernel module writes (Round 2 measured it). Rather than leave a
  // "hydratable but never written" row, the engine owns it: `setPhase()` writes through the read gate, `phase()`
  // reads the session value, and `read()`/`hydrate()` adopt whatever is on disk. Wiring the CALLS (kernel
  // start/pause/stop) belongs to the assembly — the primitive exists and is testable here.
  const PHASE_FACE = {
    key: 'phase',
    mode: 'state',
    snapshot: () => ({ apiVersion: 1, face: 'phase', v: 1, at: stamp(), data: { phase: phaseValue }, counters: {}, skipped: [] }),
    restore: (snap) => {
      phaseValue = snap && snap.data && snap.data.phase !== undefined ? snap.data.phase : null
      return { ok: true, restored: ['phase'], phase: phaseValue }
    },
    list: () => (phaseValue === null ? [] : [{ id: String(phaseValue) }]),
  }
  projectionFor('phase', PHASE_FACE)
  /** Set the institute phase. Goes through the read-before-write gate; the previous value is reported back. */
  async function setPhase(value, { why = null } = {}) {
    requireRead('set the institute phase')
    const prev = phaseValue
    phaseValue = value === null || value === undefined ? null : String(value)
    let r
    try {
      r = await snapshot({ key: 'phase' })
    } catch (e) {
      phaseValue = prev   // a refused write must not leave the in-memory value ahead of the durable one
      throw e
    }
    say({ type: 'resume/phase', at: r.at, from: prev, to: phaseValue, why: why === null ? null : String(why) })
    return { ok: true, from: prev, to: phaseValue, at: r.at, why: why === null ? null : String(why), enforced: ['phase'], fired: [] }
  }
  const phase = () => phaseValue

  // ── projection attach (used at assembly; no face module has to be edited) ───────────────────────────────────
  // NOTE: the FACE seam is destructured as `snapshotSeam` — calling it `snapshot` would shadow this engine's own
  // `snapshot({key})` writer, and the write-through would then call the face's seam (returning a value, not a
  // promise) instead of persisting anything. That defect was measured by the round-3 durable-ledger suite.
  function attachProjectionTo({ target, methods = [], key, mode = 'journal', snapshot: snapshotSeam = null, restore = null, list = null, replay = null, nonReplayable = [] } = {}) {
    const p = projectionFor(key, { mode, snapshot: snapshotSeam, restore, list, replay })
    const holder = projections.get(key)
    holder.target = target || null
    const onProjectionError = (e) => {
      say({ type: 'resume/projection-error', at: stamp(), key, error: String((e && e.message) || e) })
      emit('resume/projection-error', { at: stamp(), key, error: String((e && e.message) || e) })
    }
    // WRITE-THROUGH for state projections: a face that hands us `snapshot()`/`restore()` seams is made durable
    // WITHOUT editing it — every wrapped mutation is followed by one state write. Without this, a state face
    // wired only through `faces{}` would be hydratable but never written, i.e. durable in appearance only.
    const after = (mode === 'state' && typeof snapshotSeam === 'function' && cfg().writeThrough)
      ? (name) => snapshot({ key }).then((r) => { writesThrough += 1; return r }, (e) => { writeThroughFailures += 1; onProjectionError(e) })
      : null
    const w = attachProjection({ target, methods, projection: p, nonReplayable, after, onError: onProjectionError })
    if (!replay && target && mode === 'journal') {
      // The natural replay seam: call the named method again with the recorded args.
      w.replaySeam = async (entry) => {
        const fn = target[entry.method]
        if (typeof fn !== 'function') throw refuse(CODE.noAdapter, 'the face has no method ' + entry.method + ' to replay', 'provide an explicit replay(entry) seam')
        return await fn.apply(target, Array.isArray(entry.args) ? entry.args : [])
      }
    }
    holder.wrapper = w
    return { ok: true, key, mode, wrapped: w.wrapped, missing: w.missing, writeThrough: !!after }
  }

  // ── snapshot / hydrate ──────────────────────────────────────────────────────────────────────────────────────
  /** Snapshot one projection to its durable key (state mode) or flush the journal envelope (journal mode). */
  async function snapshot({ key } = {}) {
    const k = str(key)
    if (!k) throw refuse('VMU_INVALID_ARGUMENT', 'snapshot needs a key', 'e.g. { key: "tasks" }')
    const holder = projections.get(k)
    if (!holder) throw refuse(CODE.noAdapter, 'no projection is registered for key ' + k, 'pass it in faces{} or via attachProjection()', { key: k })
    const a = holder.adapter || {}
    if (holder.projection.mode === 'state') {
      const value = typeof a.snapshot === 'function' ? a.snapshot() : (holder.target && typeof a.list === 'function' ? a.list() : undefined)
      if (value === undefined) throw refuse(CODE.noAdapter, 'state projection ' + k + ' has no snapshot() seam', 'provide snapshot() or a list() on the target')
      const env = holder.projection.stateEnvelope(value)
      await write(k, env)
      return { ok: true, key: k, mode: 'state', digest: env.digest, items: Array.isArray(value) ? value.length : null }
    }
    const env = holder.projection.envelope()
    await write(k, env)
    return { ok: true, key: k, mode: 'journal', seq: env.seq, entries: env.entries.length, incomplete: env.incomplete }
  }

  /** Read the durable envelope for a key WITHOUT hydrating (a read-only view for the report). */
  function projectionOf({ key } = {}) {
    requireRead('inspect a projection')
    const k = str(key)
    const env = store.read(k)
    if (env === undefined || env === null) return { ok: true, key: k, present: false, note: 'nothing was ever projected under ' + k }
    return { ok: true, key: k, present: true, mode: env.mode, seq: env.seq, entries: Array.isArray(env.entries) ? env.entries.length : 0, incomplete: env.incomplete === true, digest: env.digest || null }
  }

  /**
   * Hydrate what was projected. A key with no adapter, no `restore`/`replay` seam, or a truncated journal is
   * REPORTED — the caller learns exactly which parts of the institute did NOT come back.
   */
  async function hydrate({ keys = null } = {}) {
    requireRead('hydrate')
    const wanted = Array.isArray(keys) && keys.length ? keys.map(String) : [...projections.keys()]
    const hydrated = []
    const unhydrated = []
    for (const k of wanted) {
      const holder = projections.get(k)
      const a = holder ? (holder.adapter || {}) : {}
      if (!holder) { unhydrated.push({ key: k, code: CODE.noAdapter, reason: 'no projection adapter is registered for this key' }); continue }
      const env = store.read(k)
      if (env === undefined || env === null) { hydrated.push({ key: k, hydrated: false, reason: 'nothing was projected (a first run)' }); continue }
      if (env.mode === 'state') {
        if (typeof a.restore !== 'function') { unhydrated.push({ key: k, code: CODE.noAdapter, reason: 'state projection needs a restore(value) seam on the face' }); continue }
        let r
        try {
          r = a.restore(env.value)
        } catch (e) {
          // A face that THROWS during restore is named too: one broken face must not abort the whole recovery, and
          // it must never look restored (the two failure styles are both honoured here).
          unhydrated.push({ key: k, code: (e && e.code) || CODE.noAdapter, reason: String((e && e.message) || e), detail: null })
          continue
        }
        // A face may REFUSE to restore (version/conflict/missing) and reports that by RETURNING `{ok:false, code}`.
        // Treating that as success would be exactly the "looks restored" lie this face exists to prevent.
        if (r && r.ok === false) {
          unhydrated.push({ key: k, code: r.code || CODE.noAdapter, reason: r.message || 'the face refused to restore this snapshot', detail: r.detail || null })
          continue
        }
        hydrated.push({ key: k, hydrated: true, mode: 'state', items: Array.isArray(env.value) ? env.value.length : null,
          restored: r && r.restored !== undefined ? r.restored : null, skipped: (r && Array.isArray(r.skipped)) ? r.skipped : [] })
        continue
      }
      // A key written by SOMEBODY ELSE (e.g. `work.js` writes a bare array under `work`) is not a projection
      // envelope. `adopt()` refuses it, and that refusal must be NAMED here: silently treating a foreign value as
      // an empty journal would report "hydrated, 0 entries" for a ledger that actually holds unfinished work.
      const adopted = holder.projection.adopt(env)
      if (adopted && adopted.ok === false) {
        unhydrated.push({ key: k, code: CODE.projectionGap, reason: 'the durable value under this key is not a projection envelope: ' + String(adopted.reason || 'unrecognised shape'), value: env && typeof env === 'object' ? (Array.isArray(env) ? 'array[' + env.length + ']' : Object.keys(env).slice(0, 6).join(',')) : typeof env })
        continue
      }
      const gap = holder.projection.gap()
      if (gap) { unhydrated.push({ key: k, code: CODE.projectionGap, reason: 'the journal cannot be replayed: ' + JSON.stringify(gap), gap }); continue }
      const seam = typeof a.replay === 'function' ? a.replay : (holder.wrapper && holder.wrapper.replaySeam ? holder.wrapper.replaySeam : null)
      if (typeof seam !== 'function') { unhydrated.push({ key: k, code: CODE.noAdapter, reason: 'journal projection needs a replay(entry) seam (or a wrapped target)' }); continue }
      let applied
      try {
        applied = holder.wrapper ? await holder.wrapper.replayAll(seam) : await replayEntries(holder.projection.entries(), seam)
      } catch (e) {
        // A replay that throws leaves the face HALF rebuilt: that is not a restoration, so the key is named
        // unhydrated and the recovery continues with the remaining keys (the caller decides what to do).
        unhydrated.push({ key: k, code: (e && e.code) || CODE.projectionGap, reason: 'the journal replay failed: ' + String((e && e.message) || e),
          replayed: holder.projection.entries().length })
        continue
      }
      // After a replay the face's own sequence has advanced with the commands, so the durable counter is reconciled.
      let reconciled = null
      if (typeof a.list === 'function') {
        try { reconciled = observeIds(k === 'tasks' ? 'task' : k, (a.list() || []).map((x) => x && x.id)) } catch (e) { reconciled = { ok: false, reason: String((e && e.message) || e) } }
      }
      hydrated.push({ key: k, hydrated: true, mode: 'journal', entries: applied.length, incomplete: false, reconciled })
    }
    // The result is also the face's observable state: a standalone hydrate() must be visible in status(), not
    // only a hydrate() that ran inside recover().
    state.hydrated = hydrated
    state.unhydrated = unhydrated
    return { ok: unhydrated.length === 0, hydrated, unhydrated }
  }
  async function replayEntries(entries, seam) {
    const applied = []
    for (const entry of entries) { await seam(entry); applied.push(entry.seq) }
    return applied
  }

  // ── read-back consistency (invariant ④) ─────────────────────────────────────────────────────────────────────
  /** Re-read the fold and compare it against what this process last wrote. Drift is named, never smoothed over. */
  function readBack() {
    readBacks += 1
    if (!store || typeof store.read !== 'function') return { ok: false, code: CODE.unavailable, consistent: false, note: 'no durable store to read back' }
    const drift = []
    for (const [key, expected] of expectations) {
      let actual
      try { actual = store.read(key) } catch (e) { drift.push({ key, reason: 'unreadable: ' + String((e && e.message) || e) }); continue }
      const d = contentDigest(actual)
      if (d !== expected) drift.push({ key, expected, actual: d })
    }
    const consistent = drift.length === 0
    if (!consistent) { readBackFailures += 1; lastDrift = drift }
    return { ok: consistent, consistent, checked: expectations.size, drift, code: consistent ? null : CODE.readbackDrift }
  }

  // ── the recovery itself ────────────────────────────────────────────────────────────────────────────────────
  const state = {
    recoveries: [],
    lastRecovery: null,
    seq: 0,
    interrupted: new Map(),   // id -> { id, owner, reason, at }
    hydrated: [],
    unhydrated: [],
    mailbox: null,
    watchdogs: null,
    children: null,
    inflight: null,
    reassign: null,
    flags: null,
    readBack: null,
  }

  /** Read-only: what WOULD happen. No writes, no side effects (safe to call from an operator surface). */
  function recoverPlan({ reason = 'host-ended' } = {}) {
    const plan = { ok: true, reason: String(reason), steps: [], storeAttached: !!store, willWrite: false,
      // `vmu.resume.autoRecover` is consumed by the kernel start path (it decides whether to call recover() at
      // all); it is READ here too, so the declared knob has a consumer in this very file.
      autoRecover: cfg().autoRecover, willAutoRecover: cfg().autoRecover && !!store }
    if (!store) {
      plan.steps.push({ step: 'read', ok: false, code: CODE.unavailable, note: 'no durable store was injected: there is nothing to resume (reported, not faked)' })
      plan.steps.push({ step: 'roster', ok: false, note: 'no durable fold to read a roster from' })
      return plan
    }
    try { read() } catch (e) { plan.steps.push({ step: 'read', ok: false, code: e.code, message: String(e.message) }); return plan }
    plan.steps.push({ step: 'read', ok: true, keys: readKeys.slice() })
    const inflight = typeof work?.list === 'function' ? work.list() : []
    plan.steps.push({ step: 'inflight', ok: true, pending: inflight.filter((e) => !e.interrupted).length, interrupted: inflight.filter((e) => e.interrupted).length })
    const roster = identity && typeof identity.list === 'function' ? identity.list() : null
    plan.steps.push({ step: 'roster', ok: roster !== null, members: roster ? (roster.members || roster).length : null, note: roster === null ? 'no roster seam: the members projection is the remaining source' : null })
    const projected = []
    for (const [key, holder] of projections) {
      const env = store.read(key)
      projected.push({ key, present: env !== undefined && env !== null, mode: holder.projection.mode, entries: env && Array.isArray(env.entries) ? env.entries.length : 0, incomplete: !!(env && env.incomplete) })
    }
    plan.steps.push({ step: 'ledgers', ok: true, projections: projected })
    plan.steps.push({ step: 'mailbox', ok: !!mailbox, attached: !!mailbox, note: mailbox ? null : 'no mailbox port: unacknowledged mail cannot be counted (reported, never faked)' })
    plan.steps.push({ step: 'watchdogs', ok: !!watchdogs, attached: !!watchdogs })
    plan.steps.push({ step: 'readback', ok: true, declared: cfg().readBack })
    plan.willWrite = true
    return plan
  }

  // ── F18: the recovery is an EXCLUSIVE section ────────────────────────────────────────────────────────────────
  // A real user for the repository's lock primitive (`kernel/storepolicy.js:138` acquire / `:168` release), and a
  // `finally` that covers EVERY exit: the happy path, every early return, and every throw. With `vmu.store.lock`
  // undeclared the primitive is a zero-mechanism pass-through (`locked:false`) and the release is still called,
  // which is exactly what makes "one shape, always released" checkable rather than argued.
  const lockState = { attached: false, name: 'recovery', held: false, acquisitions: 0, releases: 0, busyRefusals: 0, lastError: null }
  function acquireRecoveryLock() {
    if (!lock || typeof lock.acquire !== 'function') return null
    lockState.attached = true
    let r
    try {
      r = lock.acquire({ name: lockState.name, by: 'resume' })
    } catch (e) {
      lockState.busyRefusals += 1
      lockState.lastError = String((e && e.message) || e)
      throw refuse(CODE.busy, 'the recovery lock could not be taken: ' + lockState.lastError,
        'inspect the lock seam; refusing to run a recovery without the exclusivity it was asked to provide')
    }
    if (!r || r.ok === false) {
      lockState.busyRefusals += 1
      lockState.lastError = String((r && r.message) || 'lock refused')
      throw refuse(CODE.busy, 'another recovery holds the lock: ' + lockState.lastError,
        'wait for the in-flight recovery to finish, or raise vmu.store.lock.timeoutMs',
        { holder: (r && r.holder) || null, attempts: (r && r.attempts) || null, waitedMs: (r && r.waitedMs) || null, lockCode: (r && r.code) || null })
    }
    lockState.acquisitions += 1
    lockState.held = r.locked === true     // `false` = the primitive is a declared no-op (vmu.store.lock off)
    return r
  }

  /**
   * F51: the ONE restart marker, read from the DURABLE record — "this session continued an institute that was
   * already running, this is generation N, and here is what the restart cost (interrupted work, unhydrated faces)".
   * It is derived from `recoveries[]` under the `resume` key, so it survives the restart it describes.
   */
  function restartMarker() {
    const last = state.recoveries.length ? state.recoveries[state.recoveries.length - 1] : null
    return {
      durableKey: RESUME_KEY,
      generation: state.recoveries.length,
      restarted: state.recoveries.length > 0,
      at: last ? last.at : null,
      reason: last ? last.reason : null,
      interrupted: last ? Number(last.interrupted) || 0 : 0,
      unhydrated: last && Array.isArray(last.unhydrated) ? last.unhydrated.slice() : [],
      missingChildren: state.children && Array.isArray(state.children.missing) ? state.children.missing.slice() : [],
      reassigned: state.reassign ? state.reassign.applied.length : 0,
      reassignExhausted: state.reassign ? state.reassign.exhausted.length : 0,
      readBack: last && last.readBack !== undefined ? last.readBack : null,
      phase: phaseValue,
      note: last
        ? 'this process resumed an existing institute; the marker itself is durable under the "' + RESUME_KEY + '" key'
        : 'no recovery has run in this process (a first start, not a resume)',
    }
  }
  function releaseRecoveryLock() {
    if (!lock || typeof lock.release !== 'function') return
    try {
      lock.release({ name: lockState.name })
      lockState.releases += 1
      lockState.held = false
    } catch (e) {
      // A release that throws must be VISIBLE: a stuck lock is worse than a missing one, and swallowing it here
      // would make the next recovery look like a deadlock with no explanation.
      lockState.lastError = String((e && e.message) || e)
      say({ type: 'resume/lock-release-failed', at: stamp(), error: lockState.lastError })
      emit('resume/lock-release-failed', { at: stamp(), error: lockState.lastError })
    }
  }

  /**
   * The session recovery: read → rebuild → mark interrupted BY NAME → hydrate → refresh → read back.
   * Wrapped so the lock is released on EVERY exit (return or throw). The body is `recoverUnlocked`.
   */
  async function recover(args = {}) {
    const acquired = acquireRecoveryLock()
    try {
      return await recoverUnlocked(args)
    } finally {
      if (acquired !== null) releaseRecoveryLock()
    }
  }

  async function recoverUnlocked({ reason = 'host-ended', steps = null } = {}) {
    const want = Array.isArray(steps) && steps.length ? steps.map(String) : RECOVERY_STEPS.slice()
    for (const s of want) if (!RECOVERY_STEPS.includes(s)) throw refuse(CODE.badStep, 'unknown recovery step: ' + s, 'known: ' + RECOVERY_STEPS.join(', '))
    const report = { ok: true, id: 'rec-' + (++state.seq), at: stamp(), reason: String(reason), storeAttached: !!store, steps: [], wrote: [] }
    if (!store) {
      report.ok = false
      report.code = CODE.unavailable
      report.steps.push({ step: 'read', ok: false, code: CODE.unavailable, note: 'no durable store: nothing to resume (a claim of recovery would be a lie)' })
      report.note = 'no durable store was injected; the recovery is a no-op and says so'
      state.lastRecovery = report
      return report
    }
    // ① read
    const r = read()
    report.steps.push({ step: 'read', ok: true, at: r.at, keys: r.keys, digest: r.digest })

    // ② roster
    // ② roster — NOTE: the local is `rosterRows`, because `roster` is the PORTS' name (a shadowing bug of exactly
    // the kind the write-through fix measured: a local variable silently replaced the injected seam).
    let rosterRows = null
    try {
      if (identity && typeof identity.list === 'function') { const l = identity.list(); rosterRows = Array.isArray(l) ? l : (l && (l.members || l.roster)) || null }
    } catch (e) { rosterRows = null }
    const membersEnv = store.read('members')
    report.steps.push({ step: 'roster', ok: true, viaSeam: rosterRows !== null, seamCount: rosterRows ? rosterRows.length : null,
      projected: membersEnv !== undefined && membersEnv !== null, note: rosterRows === null && (membersEnv === undefined || membersEnv === null) ? 'no roster seam AND no members projection: the roster cannot be restored (reported, not faked)' : null })

    // ②b live-child reconciliation (F51-adjacent): the host is asked which continuable children STILL EXIST, and
    // every roster member holding a childId the host no longer lists is NAMED. The engine never spawns — that is
    // the assembly's policy — so this step turns "restart" into an actionable, auditable fact instead of a guess.
    //
    // ROSTER SOURCE, in order: the explicit `roster` port (rows carry `childId`; `members.roster()` is the natural
    // one) → the attached members projection's list() → the identity seam (which has ids but NO childId, so it can
    // only answer "no member holds a child" — reported as `rosterSource` so the difference is visible).
    let childReport = { attached: false, code: CODE.childrenUnavailable, parentId: null, live: 0, checked: 0, missing: [], rosterSource: null, note: 'no children port: which member children survived a restart cannot be checked (reported, never guessed)' }
    const childrenList = typeof children === 'function' ? children : (children && typeof children.list === 'function' ? (p) => children.list(p) : null)
    if (childrenList) {
      try {
        let heldRows = []
        let source = 'none'
        if (typeof roster === 'function') { const r = await roster(); if (Array.isArray(r)) { heldRows = r; source = 'roster-port' } }
        else if (rosterRows && Array.isArray(rosterRows)) { heldRows = rosterRows; source = 'identity-seam' }        if (source === 'none' || !heldRows.some((m) => m && m.childId)) {
          const h = projections.get('members')
          try {
            const l = h && h.adapter && typeof h.adapter.list === 'function' ? h.adapter.list() : null
            if (Array.isArray(l) && l.length) { heldRows = l; source = 'members-projection' }
          } catch (e) { /* keep the previous source */ }
        }
        const parentId = typeof (children && children.parentId) === 'function' ? children.parentId() : null
        const live = listOf(await childrenList(parentId))
        const held = heldRows.filter((m) => m && m.childId)
        const missing = held.filter((m) => live.indexOf(String(m.childId)) === -1).map((m) => ({ member: String(m.id), childId: String(m.childId) }))
        childReport = { attached: true, code: null, parentId: parentId === undefined ? null : parentId, live: live.length, checked: held.length, missing, rosterSource: source,
          note: missing.length ? 'these members hold a childId the host no longer lists: the assembly must re-provision them (the engine does NOT spawn)' : (held.length ? 'every roster child is still live' : (source === 'identity-seam' ? 'the identity seam carries no childId: wire the roster port (members.roster()) to reconcile children' : 'no roster member holds a childId yet')) }
      } catch (e) {
        childReport = { attached: false, code: (e && e.code) || CODE.childrenUnavailable, parentId: null, live: 0, checked: 0, missing: [], rosterSource: null, note: 'the children port failed: ' + String((e && e.message) || e) }
      }
    }
    state.children = childReport
    report.steps.push({ step: 'children', ok: true, ...childReport })

    // ②c RE-DISPATCH (task-52 B): the engine NEVER spawns. What it can do is OFFER the missing members to a
    // policy the ASSEMBLY declared, count the attempts DURABLY (so a crash loop cannot re-dispatch forever), and
    // report what happened. No policy declared ⇒ nothing is attempted and the step says so.
    const reassignApply = reassign && typeof reassign.apply === 'function' ? reassign.apply : null
    const reassignMax = (() => { const v = Number(reassign && reassign.maxAttempts); return Number.isInteger(v) && v > 0 ? v : 1 })()
    let reReport = { attached: false, policy: reassignMax, requested: childReport.missing.length, applied: [], exhausted: [], failed: [],
      note: 'no re-dispatch policy was declared: the missing members are only NAMED (the assembly decides whether to rebuild them)' }
    if (reassignApply) {
      for (const miss of childReport.missing) {
        const used = reassignAttempts.get(String(miss.member)) || 0
        if (used >= reassignMax) {
          reReport.exhausted.push({ member: miss.member, childId: miss.childId, attempts: used, reason: 'the declared maxAttempts (' + reassignMax + ') is reached; the durable counter is what stops a crash loop from re-dispatching forever' })
          continue
        }
        reassignAttempts.set(String(miss.member), used + 1)
        try {
          await reassignApply({ member: miss.member, childId: miss.childId, attempt: used + 1, maxAttempts: reassignMax, reason: 'restart-reconciliation' })
          reReport.applied.push({ member: miss.member, childId: miss.childId, attempt: used + 1 })
        } catch (e) {
          reReport.failed.push({ member: miss.member, childId: miss.childId, attempt: used + 1, code: (e && e.code) || 'VMU_STATE', message: String((e && e.message) || e) })
        }
      }
      reReport.attached = true
      reReport.note = reReport.exhausted.length
        ? 'some members are EXHAUSTED: their re-dispatch counter reached the declared bound (they stay named, never silently retried)'
        : 'every missing member was offered to the declared policy exactly once (attempts are counted durably)'
    }
    state.reassign = reReport
    report.steps.push({ step: 'reassign', ok: true, ...reReport })

    // ③ in-flight work — named interruption, never silently passed
    let interrupted = []
    if (work && typeof work.list === 'function') {
      const before = work.list()
      const pending = before.filter((e) => !e.interrupted)
      let recovered = 0
      if (work && typeof work.recover === 'function' && want.includes('inflight')) {
        try {
          const w = await work.recover({ reason: 'host-ended-before-settle:' + String(reason) })
          recovered = Number(w && w.recovered) || 0
        } catch (e) { report.steps.push({ step: 'inflight', ok: false, code: (e && e.code) || 'VMU_STATE', message: String((e && e.message) || e) }) }
      }
      for (const e of (typeof work.list === 'function' ? work.list() : [])) {
        if (e && e.interrupted) state.interrupted.set(String(e.id), { id: String(e.id), owner: e.owner === undefined ? null : String(e.owner), reason: e.interruptedReason === undefined ? null : String(e.interruptedReason), at: e.interruptedAt === undefined ? null : e.interruptedAt })
      }
      interrupted = [...state.interrupted.values()]
      // v5r's `pendingWork` in one readable place: WHO still has unfinished work, what the restart did to it, and
      // (after the recovery) what is STILL pending — the three facts an operator asks for in that order.
      const stillPending = (typeof work.list === 'function' ? work.list() : []).filter((e) => e && !e.interrupted)
      state.inflight = {
        pending: pending.map((e) => ({ id: String(e.id), owner: e.owner === undefined ? null : String(e.owner), kind: String(e.kind || ''), objective: e.objective === undefined ? null : e.objective })),
        interrupted: interrupted.map((x) => ({ id: x.id, owner: x.owner, reason: x.reason })),
        pendingNow: stillPending.length,
        note: 'the durable in-flight ledger: `pending` is what the restart FOUND, `interrupted` is what it ended, `pendingNow` is what is still open',
      }
      report.steps.push({ step: 'inflight', ok: true, pending: pending.length, marked: recovered, interrupted: interrupted.length, named: interrupted.map((x) => x.id + (x.reason ? '(' + x.reason + ')' : '')) })
    } else {
      state.inflight = { pending: [], interrupted: [], note: 'no in-flight ledger seam: pending work cannot be listed (reported, never guessed)' }
      report.steps.push({ step: 'inflight', ok: false, code: CODE.unavailable, note: 'no in-flight ledger seam: interrupted work cannot be named' })
    }

    // ④ ledgers (hydrate the projections)
    const h = await hydrate({})
    state.hydrated = h.hydrated
    state.unhydrated = h.unhydrated
    report.steps.push({ step: 'ledgers', ok: h.ok, hydrated: h.hydrated, unhydrated: h.unhydrated })

    // ⑤ mailbox — the port may be an object with `pending()` or a bare function returning the entries.
    let mb = { attached: false, code: CODE.mailboxMissing, pending: null, ids: [] }
    const mailboxPending = typeof mailbox === 'function' ? mailbox : (mailbox && typeof mailbox.pending === 'function' ? () => mailbox.pending() : null)
    if (mailboxPending) {
      try {
        const list = await mailboxPending()
        const arr = Array.isArray(list) ? list : []
        mb = { attached: true, source: 'port', pending: arr.length, ids: arr.slice(0, listCap).map((m) => String(m && m.id)) }
      } catch (e) { mb = { attached: false, code: CODE.mailboxMissing, source: 'port', pending: null, error: String((e && e.message) || e) } }
    } else {
      // NO PORT: the mailbox face is SELF-PERSISTING (`kernel/mailbox.js:452-462` writes its own `mailbox` key, and
      // `ack()` SPLICES entries out of `boxes` at `:363`), so the durable key itself answers "how much mail is
      // still unacknowledged". Reading it needs no new face method and no new wiring — the count is a FACT, not a
      // derived guess. Both stored shapes are accepted (a bare face snapshot, or a state-projection envelope).
      let raw = null
      try { raw = store.read('mailbox') } catch (e) { raw = null }
      const face = raw && raw.mode === 'state' && raw.value ? raw.value : raw
      if (face && face.face === 'mailbox' && face.data && face.data.boxes && typeof face.data.boxes === 'object') {
        const entries = []
        for (const [member, rows] of Object.entries(face.data.boxes)) {
          for (const e of (Array.isArray(rows) ? rows : [])) entries.push({ id: String((e && e.id) || ''), member: String(member) })
        }
        mb = { attached: true, source: 'durable-mailbox-key', pending: entries.length, ids: entries.slice(0, listCap).map((e) => e.id) }
      } else {
        mb = { attached: false, code: CODE.mailboxMissing, source: 'durable-mailbox-key', pending: null, ids: [],
          note: 'no mailbox port AND no durable mailbox key in this store: unacknowledged mail cannot be counted' }
      }
    }
    state.mailbox = mb
    // The unacked-mail count belongs with the other "what survived the restart" facts (task-52 A).
    if (state.inflight) {
      state.inflight.unackedMail = mb.attached ? mb.pending : null
      state.inflight.unackedMailSource = mb.source || null
    }
    // An ABSENT count is reported (named code) but does not fail the recovery: the recovery itself worked, and
    // saying otherwise would make every store-only deployment look broken.
    report.steps.push({ step: 'mailbox', ok: true, attached: mb.attached, pending: mb.pending, source: mb.source || null, code: mb.attached ? null : CODE.mailboxMissing,
      note: mb.attached ? ('unacknowledged mail is counted from ' + mb.source + ' (it stays durably queued; an ack happens only after a successful delivery)') : 'unacknowledged mail cannot be counted (no port, no durable key)' })

    // ⑥ watchdogs
    let wd = { attached: false, targets: 0, refreshed: [] }
    if (watchdogs && typeof watchdogs.targets === 'function' && typeof watchdogs.touch === 'function') {
      try {
        const targets = listOf(await watchdogs.targets())
        for (const t of targets) await watchdogs.touch(t)
        wd = { attached: true, targets: targets.length, refreshed: targets.slice(0, listCap) }
      } catch (e) { wd = { attached: false, targets: 0, refreshed: [], error: String((e && e.message) || e) } }
    }
    state.watchdogs = wd
    report.steps.push({ step: 'watchdogs', ok: true, attached: wd.attached, refreshed: wd.refreshed.length,
      note: wd.attached ? null : 'no watchdog port: a stale meet/verify clock cannot be refreshed (reported, never guessed)' })

    // ⑦ flags (the operational facts a resumed session must know)
    let flags = null
    try { flags = control && typeof control.status === 'function' ? { paused: control.status().paused || [] } : null } catch (e) { flags = null }
    state.flags = flags
    report.steps.push({ step: 'flags', ok: true, paused: flags ? flags.paused.length : null, degraded: state.unhydrated.length > 0 })

    // ⑧ read-back
    let rb = null
    if (cfg().readBack && want.includes('readback')) {
      rb = readBack()
      report.steps.push({ step: 'readback', ok: rb.consistent, checked: rb.checked, drift: rb.drift, code: rb.code })
    }
    state.readBack = rb

    // ⑨ outcome guard
    report.steps.push({ step: 'outcome', ok: true, interrupted: interrupted.length,
      note: interrupted.length ? 'interrupted work is NAMED; settleOutcome({outcome:"passed"}) refuses for these ids unless explicitly overridden' : 'nothing was interrupted' })

    report.ok = report.steps.every((s) => s.ok !== false)
    report.interrupted = interrupted
    report.hydrated = h.hydrated
    report.unhydrated = h.unhydrated
    report.readBack = rb
    // the recovery record is durable (bounded) — this is the write that the read-gate protects
    try {
      const env = Object.assign(counterEnvelope(), {
        recoveries: state.recoveries.concat([{ id: report.id, at: report.at, reason: report.reason, interrupted: interrupted.length, unhydrated: h.unhydrated.map((u) => u.key), readBack: rb ? rb.consistent : null }]).slice(-cfg().keepRecoveries),
        // DURABLE re-dispatch counters (task-52 B): a crash loop must not be able to re-dispatch forever.
        reassignAttempts: Object.fromEntries([...reassignAttempts.entries()].sort()),
      })
      await write(RESUME_KEY, env)
      state.recoveries = env.recoveries
      report.wrote.push(RESUME_KEY)
    } catch (e) {
      report.ok = false
      report.steps.push({ step: 'record', ok: false, code: (e && e.code) || 'VMU_STATE', message: String((e && e.message) || e) })
    }
    state.lastRecovery = report
    say({ type: 'resume/recovered', at: report.at, id: report.id, reason: report.reason, interrupted: interrupted.length, unhydrated: h.unhydrated.length, ok: report.ok })
    emit('resume/recovered', { at: report.at, id: report.id, ok: report.ok, interrupted: interrupted.length })
    if (h.unhydrated.length) {
      say({ type: 'resume/degraded', at: report.at, unhydrated: h.unhydrated.map((u) => u.key) })
      emit('resume/degraded', { at: report.at, unhydrated: h.unhydrated })
    }
    return report
  }

  /**
   * The outcome guard (invariant ③). Work that was interrupted after a restart may NOT be reported as passed
   * without an explicit, reasoned override — the exact failure mode ("it probably finished") the v5r line paid for.
   */
  function settleOutcome({ id, outcome, explicit = false, reason = null } = {}) {
    const key = String(id === undefined || id === null ? '' : id)
    if (!key) throw refuse('VMU_INVALID_ARGUMENT', 'settleOutcome needs an id', 'pass the work/ledger id')
    const known = state.interrupted.get(key)
    const isPassed = String(outcome) === 'passed' || outcome === true
    if (known && isPassed && explicit !== true) {
      throw refuse(CODE.interruptedNotPassed, 'work ' + key + ' was INTERRUPTED and cannot be reported as passed',
        'pass { explicit: true, reason: "..." } only when the pass was re-established by a fresh, recorded check',
        { id: key, interruptedReason: known.reason, interruptedAt: known.at })
    }
    if (known && isPassed && explicit === true && !str(reason)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'an explicit override of an interrupted outcome needs a reason',
        'pass { reason: "why this is really passed" } - the override is auditable', { id: key })
    }
    return { ok: true, id: key, outcome: String(outcome), interrupted: !!known, override: !!(known && isPassed && explicit === true), reason: reason === null ? null : String(reason), enforced: [CODE.interruptedNotPassed], fired: known ? [CODE.interruptedNotPassed] : [] }
  }

  function interrupted() { return [...state.interrupted.values()].map((x) => Object.assign({}, x)) }

  function status() {
    const projectionsView = [...projections.entries()].map(([key, holder]) => ({
      key, mode: holder.projection.mode, entries: holder.projection.size(), incomplete: holder.projection.incomplete, dropped: holder.projection.dropped,
      hasTarget: !!holder.target, hasRestore: typeof (holder.adapter || {}).restore === 'function', hasReplay: typeof (holder.adapter || {}).replay === 'function' || !!(holder.wrapper && holder.wrapper.replaySeam),
    }))
    const declared = cfg().projections
    return {
      ok: true,
      storeAttached: !!store,
      read: readOk, readAt, readKeys: readKeys.slice(), readDigest,
      counters: Object.fromEntries([...counters.entries()].sort()),
      recoveries: state.recoveries.length, lastRecoveryAt: state.lastRecovery ? state.lastRecovery.at : null, lastRecoveryOk: state.lastRecovery ? state.lastRecovery.ok : null,
      interrupted: state.interrupted.size, interruptedIds: [...state.interrupted.keys()].slice(0, listCap),
      projections: projectionsView,
      declaredProjections: declared.slice(),
      undeclaredProjections: projectionsView.map((p) => p.key).filter((k) => declared.length > 0 && declared.indexOf(k) === -1),
      hydrated: state.hydrated, unhydrated: state.unhydrated,
      projection: { degraded: state.unhydrated.length > 0, unhydratedKeys: state.unhydrated.map((u) => u.key) },
      mailbox: state.mailbox, watchdogs: state.watchdogs, children: state.children, flags: state.flags,
      // v5r's `pendingWork` view + which recovery ports this assembly actually wired (an UNWIRED port is visible
      // here instead of being silently claimed by the service description).
      inflight: state.inflight,
      // task-52 B: what the declared re-dispatch policy did (or that none was declared), plus the durable counters.
      reassign: state.reassign,
      reassignAttempts: Object.fromEntries([...reassignAttempts.entries()].sort().slice(0, listCap)),
      ports: {
        store: !!store, work: !!work, control: !!control, identity: !!identity, lock: !!lock,
        mailbox: !!(typeof mailbox === 'function' || (mailbox && typeof mailbox.pending === 'function')),
        watchdogs: !!(watchdogs && typeof watchdogs.targets === 'function' && typeof watchdogs.touch === 'function'),
        children: !!(typeof children === 'function' || (children && typeof children.list === 'function')),
        roster: typeof roster === 'function' || Array.isArray(roster),
      },
      phase: phaseValue,
      // F18/F51: the exclusivity the recovery ran under, and the durable marker that says this session is a resume.
      lock: Object.assign({}, lockState),
      restart: restartMarker(),
      writes, writesThrough, writeThroughFailures, writeRefusals, readBacks, readBackFailures, lastDrift,
      policy: cfg(),
      neverWritesBeforeRead: true,
      interruptedNeverPassesSilently: true,
      readsArePure: true,
      at: readOk ? readAt : stamp(),
      listCap,
    }
  }

  return {
    apiVersion,
    read,
    write,
    patch,
    recover,
    recoverPlan,
    snapshot,
    hydrate,
    projectionOf,
    attachProjection: attachProjectionTo,
    nextId,
    observeIds,
    setPhase,
    phase,
    restart: restartMarker,
    settleOutcome,
    interrupted,
    readBack,
    status,
    history: () => state.recoveries.map((r) => Object.assign({}, r)),
    keysUsed: () => [RESUME_KEY, 'phase'],
  }
}

export default createResume
