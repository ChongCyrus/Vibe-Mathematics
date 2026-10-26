// vmu durable state — the Store port and its default JSON-fold implementation (docs/07).
//
// Why this exists at all: DSH refuses to load a session that carries an unknown event type and
// `Session.append` cannot mark one ignorable, so vmu state may NEVER travel through the host session
// log (docs/07 header, docs/01 R10). It lives in its own file with its own version and migration.
//
// The four disciplines (docs/07 §1) — every one of them is a lesson this repository already paid for:
//   1. writes go through `patch(key, current => next)` INSIDE the fold. A read-modify-write outside it
//      loses one of two writes that happen in the same tick (the e2e-v5-round2 case, and the v5r
//      `leanApplySettle` case that wiped a freshly written sha256);
//   2. the key set is a WHITELIST. Writing an undeclared key THROWS; silently dropping a write was a
//      historical trap and is forbidden here;
//   3. writes are atomic: temp file + rename. A write is acknowledged only once the file is in place;
//   4. all writes are serialised through one promise chain, so interleaving cannot corrupt the fold;
//   5. ONE FILE CAN HAVE SEVERAL KERNELS OVER IT. A subagent session mounts its own kernel instance, so a fold
//      cached at open() is a SNAPSHOT - measured on the real machine (run 13): four member child sessions read
//      `roster live:0` and `records` only up to the record that existed when they started, while the office's own
//      kernel had three members and later records. The store therefore revalidates the file's stamp before every
//      read and reloads before every write, and takes a lock file while writing.
//
// No host imports: this module must be importable by plain Node in this repository (see the same note
// in settings/schema.js). `open()` creates or loads one JSON file under the workspace.

// WHY THESE IMPORTS ARE SANCTIONED — the only file this module touches is `<root>/vmu/state.json` (plus its
// temp/backup/lock siblings), i.e. the framework's OWN durable artifact, seeded from PUBLIC_KEYS below. No
// caller-supplied path, no user-relative path and no file the user names is ever read or written here; the work is
// open/load/atomic rename/backup/lock — neither a guard decision nor read-only in-package self-inspection.
// fs-purpose: audit - the durable fold is the framework's own artifact, never a caller's path
import { mkdir, readFile, writeFile, rename, copyFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { statSync, readFileSync, openSync, closeSync, writeSync, rmSync } from 'node:fs'

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** Projection version of the durable file. A change here REQUIRES a migrator (docs/07 §2). */
export const STATE_VERSION = 1

/**
 * The public key set (docs/03 §6). Anything not listed here is an internal detail and cannot be
 * written through the port: the whitelist is the contract, not a convenience.
 */
export const PUBLIC_KEYS = Object.freeze([
  'settings.resolved',
  'packs',
  'middleware',
  'members',
  'tasks',
  'meetings',
  // ROUND 12 / task-95 — **`ballots` DELETED** (breaking change, registered in docs/03 §7): nothing in the tree ever
  // wrote or read it. Its concept moved to `ballotbox` (the adapter table's key AND this whitelist's key), so the old
  // name could only mislead a deployment into depending on a key no writer can produce. `patch('ballots', …)` now
  // refuses BY NAME (`VMU_INVALID_ARGUMENT: undeclared durable key`) - which is the honest answer, and exactly the
  // answer it effectively always gave, since no reader ever consumed it. NOTE the unrelated `'ballots'` strings
  // elsewhere are different namespaces: `vmu.control.pauseScope`'s scope name, the minutes record's `ballots`
  // field, and v5r's own fold ledger.
  // RESERVED, NO WRITER (kept with a named condition rather than deleted): `records` names a face that EXISTS
  // (`kernel/records.js`) whose persistence is deliberately delegated to the library surface. Deleting it now would be
  // a second breaking change with no gain; if that face still has no store writer at the next architecture review,
  // delete it the same way `ballots` was deleted (same §7 process).
  'records',
  'budget',
  'phase',
  'work',
  // ROUND 1 / K2: the K6 idempotency ledger (kernel/idempotency.js `LEDGER_KEY`) writes here. It was MISSING, so
  // `patch('idempotency', …)` and `read('idempotency')` both threw `VMU_INVALID_ARGUMENT: undeclared durable key`;
  // the ledger's own persist() caught that and stayed `durable:false` for the whole session, in silence, because
  // the only test that touches the projection injects a FAKE store. Measured against the real createStore before
  // this line existed: `work` ⇒ ok, `idempotency` ⇒ refused. The whitelist and docs/03 §6 move together.
  'idempotency',
  // ROUND 2 (task-14): the two keys this round's faces actually write.
  //   · `mailbox`  - kernel/mailbox.js: durable per-recipient mail (ack only after a successful delivery);
  //   · `resume`   - kernel/resume.js: recovery records + per-face id counters + journal index (the id-reuse fix).
  // The OTHER projection keys (`members`/`tasks`/`meetings`/`ballots`/`budget`/`phase`) were already listed but had
  // NO writer or hydrator - Round 2 wires them (Lead's durable-projection item); they are not renamed.
  'mailbox',
  'resume',
  //   · `ids`      - kernel/ids.js: the ONE id minter's counters (monotonic across restarts; a counter that is lost
  //                  is still recovered from the max suffix seen in the projections, so a name is never reused).
  'ids',
  // ROUND 2 (reader-a's follow-up): `chat` and `panel` are the durable sources for "unacked messages" and the member
  // state panel, so they join the whitelist. Their `snapshot()/restore()` seams land with v5r-reader-c; until then
  // `resume.status().unhydrated[]` NAMES them rather than pretending they were restored.
  // ROUND 3 / task-20 D (reader-a's task-18): the approval queue + veto ledger were session-memory only; this key makes
  // them survive a restart (`kernel/human.js` via `resume.attachProjection({ key:'human', mode:'state' })`).
  'human',
  'chat',
  'panel',
  // ROUND 9 / task-66 B (found while verifying the exit flush): the assembly's projection adapter table
  // (`kernel/index.js` RESUME_PROJECTION_ADAPTERS) declares TWO keys that were NOT in this whitelist -
  // `ballotbox` (the board face) and `minutes`. Both expose `snapshot()/restore()` and are attachable, so
  // declaring either in `vmu.resume.projections` made `hydrate()` call `store.read('<key>')` and the store
  // REFUSED it (`VMU_INVALID_ARGUMENT: undeclared durable key`), which crashed the whole `recover()` -
  // the same class as K2's `idempotency`: a writer exists, the whitelist does not know it. Measured:
  // `createKernel({ settings: { 'vmu.resume.projections': ['ballotbox'] } })` + `recover()` threw before this line.
  'ballotbox',
  'minutes',
])

/** Named refusal (codes are registered in docs/03 §8). */
export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  return err
}

/** Harmless defaults: an empty fold that enables nothing (docs/01 R1, docs/04 §3). */
function defaultKeys() {
  const keys = {}
  // ROUND 4 / task-25: the keys the RESUME ENGINE owns are seeded `null`, not `[]`. A `[]` under a projection key is
  // "a durable value that is not a projection envelope" ⇒ `hydrate()` reports `VMU_RESUME_PROJECTION_GAP` and the
  // whole `recover()` returns `ok:false` ON A CLEAN FIRST RUN (measured: the `human` key, whose projection I attach in
  // the assembly, made every first recovery report a failure). `null` is read as "nothing was projected (a first
  // run)" - the honest state - which is why `phase` was already seeded that way.
  const NULL_SEEDED = new Set(['phase', 'human', 'resume', 'ids', 'mailbox', 'chat', 'panel', 'ballotbox', 'minutes'])
  for (const k of PUBLIC_KEYS) keys[k] = NULL_SEEDED.has(k) ? null : (k === 'settings.resolved' || k === 'budget' ? {} : [])
  return keys
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

/**
 * Create a Store over one JSON file. `clock` is injected so tests are deterministic (docs/01 R12):
 * the framework owns time, a caller never passes an instant.
 */
export function createStore({ root, migrators = [], clock = () => new Date().toISOString(),
  coherence = 'auto', lock = true, lockBackoffMs = 25, lockRetries = 40, lockTimeoutMs = 2000 } = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw refuse('VMU_INVALID_ARGUMENT', 'createStore needs a workspace root', 'pass { root }')
  }
  const dir = join(root, 'vmu')
  const file = join(dir, 'state.json')
  const tmpFile = () => file + '.' + process.pid + '.' + Date.now() + '.' + Math.random().toString(36).slice(2, 8) + '.tmp'
  const lockFile = file + '.lock'
  // R30 / task-17: on Windows a rename onto a target that another handle still has open answers EPERM — a WINDOW, not a
  // corrupt file. The writer retries a BOUNDED number of attempts, re-reading the file first so a retry builds on the
  // other kernel's value instead of clobbering it; every retry and every give-up is counted (stats.writeRetries /
  // writeRetryGiveUps), never hidden. The lock file is the PRIMARY mechanism (open() takes it too); this is the fallback
  // for plain readers that hold the file without taking it.
  const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'])
  const MAX_WRITE_ATTEMPTS = 3
  // ONE timer site in this file, shared by the lock backoff and the write-retry backoff: the activity-timer audit maps
  // each file to its declared timer count, and a second timer call would make that declaration stale for no gain.
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  // §1-(5): freshness is a STAMP (mtime+size), not a promise. `read()` is synchronous because every service face is
  // synchronous; a synchronous stat keeps that shape while still seeing another process's rename.
  let stamp = null
  // §1-(5) second half: a reload in the FILE is not yet a reload in the SERVICE. The kernel registers here so its
  // projections re-enter their snapshot when another kernel wrote (measured: a member's roster stayed empty even
  // after the fold reloaded, because `members` holds a Map, not a store read).
  const reloadHooks = []
  const stampOf = () => {
    try { const st = statSync(file); return String(st.mtimeMs) + ':' + String(st.size) } catch { return 'missing' }
  }
  const adoptStamp = () => { stamp = stampOf() }
  const coherenceOn = coherence !== 'off' && coherence !== false

  const parseFold = (raw, where) => {
    let loaded
    try { loaded = JSON.parse(raw) } catch (e) {
      throw refuse('VMU_STORE_FAILED', 'durable file is unreadable or not JSON: ' + e.message,
        'it was left untouched at ' + where)
    }
    if (!loaded || typeof loaded !== 'object' || typeof loaded.keys !== 'object' || loaded.keys === null) {
      throw refuse('VMU_STORE_FAILED', 'durable file has no keys object', 'left untouched at ' + where)
    }
    for (const k of Object.keys(loaded.keys)) {
      if (!PUBLIC_KEYS.includes(k)) {
        throw refuse('VMU_STORE_FAILED', 'durable file carries an undeclared key: ' + k,
          'refusing to load a fold this build does not understand')
      }
    }
    return loaded
  }

  /** Reload when ANOTHER instance wrote the file. Returns what happened, so a caller can report it. */
  const reloadIfStale = (where, force = false) => {
    // an EXPLICIT refresh() is a request, not an inference: it works even when automatic coherence is off
    const allowed = force ? true : coherenceOn
    if (!allowed || !fold) return { reloaded: false, why: allowed ? 'not-open' : 'coherence-off' }
    const now = stampOf()
    if (now === stamp) return { reloaded: false, why: 'fresh' }
    if (now === 'missing') { stamp = 'missing'; return { reloaded: false, why: 'missing' } }
    const loaded = parseFold(readFileSync(file, 'utf8'), file)
    fold = loaded
    stamp = now
    stats.reloads += 1
    stats.lastReloadAt = clock()
    for (const cb of reloadHooks.slice()) { try { cb({ why: 'newer-on-disk', stamp: now, file }) } catch { /* a hook never breaks a read */ } }
    return { reloaded: true, why: 'newer-on-disk' }
  }

  /** Exclusive-create lock so two KERNELS cannot interleave a read-modify-write. Best effort and bounded. */
  const withFileLock = async (fn) => {
    if (!lock) return fn()
    const started = Date.now()
    let fd = null
    for (let i = 0; i < lockRetries; i++) {
      try { fd = openSync(lockFile, 'wx'); break } catch (e) {
        if (e && e.code !== 'EEXIST') break
        if (Date.now() - started > lockTimeoutMs) break
        await sleep(lockBackoffMs)
        stats.lockWaits += 1
      }
    }
    if (fd === null) {
      // A stale lock must not deadlock the institute: report it, then proceed WITHOUT it (the rename stays atomic).
      stats.lockSkips += 1
      return fn()
    }
    try {
      try { writeSync(fd, JSON.stringify({ pid: process.pid, at: clock() })) } catch { /* the content is advisory */ }
      return await fn()
    } finally { try { closeSync(fd) } catch { /* already closed */ } try { rmSync(lockFile) } catch { /* gone */ } }
  }

  let fold = null
  let chain = Promise.resolve()
  const listeners = new Map()
  const stats = { opens: 0, writes: 0, patches: 0, migrations: 0, subscriptions: 0, reloads: 0, lockWaits: 0, lockSkips: 0, writeRetries: 0, writeRetryGiveUps: 0, lastReloadAt: null }

  const runExclusive = (fn) => {
    const next = chain.then(fn, fn)
    chain = next.then(() => undefined, () => undefined)
    return next
  }

  const assertKey = (key) => {
    if (!PUBLIC_KEYS.includes(key)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'undeclared durable key: ' + key,
        'the whitelist is docs/03 §6; add it there and here together, never write around it')
    }
  }

  const persist = async () => {
    const tmp = tmpFile()
    await writeFile(tmp, JSON.stringify(fold, null, 2) + '\n', 'utf8')
    try {
      await rename(tmp, file) // atomic: the visible file is always a complete document
    } catch (e) {
      // the temp copy is evidence of a write that did NOT land; leaving it behind would be a leak, not a record
      try { rmSync(tmp) } catch { /* already gone */ }
      throw e
    }
    adoptStamp()
    stats.writes++
  }

  /**
   * A failed write leaves the IN-MEMORY fold holding a value the file never received. Before any retry composes the
   * patch again, that value must be gone: re-read the file (the truth) and adopt its stamp. If the file cannot be read
   * at this instant, clear the stamp so the next `reloadIfStale` MUST reload instead of trusting a stale match.
   */
  const resyncFromDisk = () => {
    try {
      fold = parseFold(readFileSync(file, 'utf8'), file)
      adoptStamp()
    } catch {
      stamp = null
    }
  }

  /**
   * R30 / task-17 — ONE mutation path for write() and patch(): reload, compute, persist, and on a transient rename
   * refusal (another handle held the target) RESYNC to the file and retry the whole read-merge-write, so two kernels
   * never lose each other's write. The loop is bounded; when the attempts are spent the caller gets a named refusal
   * that says the write is NOT acknowledged (never a silent success). Deadlock-free: the promise chain is acquired
   * before the file lock and never re-entered, the lock is released in `withFileLock`'s finally, and a lock that cannot
   * be taken degrades to its bounded "proceed without it" path (stats.lockSkips) rather than waiting forever.
   */
  const mutate = (key, where, compute, before) => runExclusive(() => withFileLock(async () => {
    let attempt = 0
    for (;;) {
      attempt += 1
      if (!fold) throw refuse('VMU_STORE_FAILED', 'store is not open')
      // first attempt: the ordinary staleness check (honours coherence:'off'); a RETRY must forget the value that never
      // landed and read the file as it is now — that is recovery of a failed write, not a coherence inference.
      reloadIfStale(where, attempt > 1)
      assertKey(key)
      if (before) before()
      const prev = fold.keys[key]
      const next = compute(clone(prev))
      if (next === undefined) return { ok: true, key, version: fold.version, changed: false }
      fold.keys[key] = next
      try {
        await persist()
      } catch (e) {
        const code = e && e.code
        if (!TRANSIENT_RENAME_CODES.has(code)) throw e
        if (attempt >= MAX_WRITE_ATTEMPTS) {
          stats.writeRetryGiveUps += 1
          resyncFromDisk()
          const err = refuse('VMU_STORE_FAILED',
            'the durable file could not be atomically replaced after ' + attempt + ' attempts (' + code + '): the write is NOT acknowledged',
            'another kernel or a plain reader still held the target; the in-memory fold was resynced to the file, so nothing was silently kept')
          err.attempts = attempt
          throw err
        }
        stats.writeRetries += 1
        // drop the value that never landed BEFORE merging again: a retry that re-applied the patch on top of its own
        // unpersisted result would duplicate it (measured: 'xproc','xproc','xproc' after two retries)
        resyncFromDisk()
        // a bounded pause, NOT the mechanism: the retry re-reads the file and the count is reported either way. The
        // pause only keeps a reader that holds the handle for a few milliseconds from burning all attempts instantly.
        await sleep(15 * attempt)
        continue
      }
      notify(key, fold.keys[key], prev)
      const receipt = { ok: true, key, version: fold.version, changed: true }
      if (attempt > 1) receipt.attempts = attempt // honest: the write only landed after a transient retry
      return receipt
    }
  }))

  const notify = (key, next, prev) => {
    for (const fn of listeners.get(key) || []) fn(clone(next), clone(prev))
  }

  const migrateInPlace = async (loaded) => {
    const report = { from: loaded.version, to: STATE_VERSION, applied: [], backedUp: false }
    if (loaded.version === STATE_VERSION) return report
    if (!Number.isInteger(loaded.version) || loaded.version > STATE_VERSION) {
      throw refuse('VMU_STORE_MIGRATION', 'durable file is newer than this build: v' + loaded.version,
        'refusing to touch it; upgrade the preset or restore a backup')
    }
    try {
      await copyFile(file, file + '.bak.' + loaded.version)
      report.backedUp = true
    } catch (e) {
      throw refuse('VMU_STORE_MIGRATION', 'could not back up before migrating: ' + e.message)
    }
    let version = loaded.version
    for (let v = loaded.version; v < STATE_VERSION; v++) {
      const step = migrators.find((m) => m && m.from === v)
      if (!step) {
        throw refuse('VMU_STORE_MIGRATION', 'no migrator from v' + v + ' to v' + (v + 1),
          'a version bump REQUIRES a migrator (docs/07 §2); refusing to start half-migrated')
      }
      step.up(loaded)
      version = v + 1
      report.applied.push(step.id || ('v' + v + '->v' + (v + 1)))
    }
    loaded.version = version
    stats.migrations++
    return report
  }

  const store = {
    get file() { return file },
    get dir() { return dir },

    async open(expected = STATE_VERSION) {
      // R30 / task-17 — open() takes the SAME exclusive lock the writers take. Measured on this machine: a kernel that
      // was merely OPENING (plain `readFile`, no lock) made another kernel's `rename(tmp -> state.json)` fail with
      // `EPERM`, so the writer's acknowledged-in-memory value never reached the file and the next kernel opened onto the
      // OLD file (two kernels, one workspace: every turn). Loading is a read-modify-write of the in-memory fold too, so
      // it belongs inside the same mutex instead of outside it. The directory must exist BEFORE the lock is taken: the
      // lock file lives inside it, and a first run that tried to lock a missing directory would "skip" the lock by name.
      await mkdir(dir, { recursive: true })
      return runExclusive(() => withFileLock(async () => {
        let loaded
        try {
          const raw = await readFile(file, 'utf8')
          loaded = JSON.parse(raw)
        } catch (e) {
          if (e && e.code === 'ENOENT') {
            loaded = { version: STATE_VERSION, keys: defaultKeys(), createdAt: clock() }
            fold = loaded
            await persist() // already inside the chain + lock: re-entering runExclusive here would deadlock
            adoptStamp()
            stats.opens++
            return { opened: 'created', version: fold.version }
          }
          // corrupt file: refuse and leave it untouched for inspection, never clobber the evidence
          throw refuse('VMU_STORE_FAILED', 'durable file is unreadable or not JSON: ' + e.message,
            'it was left untouched at ' + file)
        }
        if (!loaded || typeof loaded !== 'object' || typeof loaded.keys !== 'object' || loaded.keys === null) {
          throw refuse('VMU_STORE_FAILED', 'durable file has no keys object', 'left untouched at ' + file)
        }
        for (const k of Object.keys(loaded.keys)) {
          if (!PUBLIC_KEYS.includes(k)) {
            throw refuse('VMU_STORE_FAILED', 'durable file carries an undeclared key: ' + k,
              'refusing to load a fold this build does not understand')
          }
        }
        const report = await migrateInPlace(loaded)
        fold = loaded
        adoptStamp()
        stats.opens++
        return { opened: loaded.createdAt ? 'created' : 'loaded', version: fold.version, migration: report, expected, coherence: coherenceOn ? 'on' : 'off' }
      }))
    },

    async migrate() {
      if (!fold) throw refuse('VMU_STORE_FAILED', 'store is not open')
      // the same mutex as open()/write()/patch(): migration renames the file too (R30 / task-17)
      return runExclusive(() => withFileLock(async () => {
        const report = await migrateInPlace(fold)
        if (report.applied.length > 0) await persist()
        return report
      }))
    },

    read(key) {
      if (!fold) throw refuse('VMU_STORE_FAILED', 'store is not open')
      assertKey(key)
      reloadIfStale('read')
      return clone(fold.keys[key])
    },

    /** Register a callback that runs after EVERY reload this instance performs. Returns its disposer. */
    onReload(fn) {
      if (typeof fn !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'onReload needs a function')
      reloadHooks.push(fn)
      return () => { const i = reloadHooks.indexOf(fn); if (i !== -1) reloadHooks.splice(i, 1) }
    },

    /** Layer 4 (docs/07 §1-(5)): the freshness check itself, so a caller can prove it ran. */
    refresh() {
      if (!fold) throw refuse('VMU_STORE_FAILED', 'store is not open')
      const r = reloadIfStale('refresh', true)
      return Object.assign({ ok: true, stamp, coherence: coherenceOn ? 'on' : 'off' }, r)
    },

    /** Wholesale replace with compare-and-set. Prefer `patch` unless the value is a whole new thing. */
    write(key, value, opts = {}) {
      return mutate(key, 'write', () => clone(value), () => {
        if (opts.expect !== undefined && opts.expect !== fold.version) {
          throw refuse('VMU_STORE_FAILED', 'durable version changed under us: expected v' + opts.expect + ', at v' + fold.version)
        }
      })
    },

    /**
     * The preferred mutation: `current => next`, computed INSIDE the exclusive section, so two changes
     * in the same tick both survive. `fn` returning undefined leaves the value untouched.
     */
    patch(key, fn) {
      return mutate(key, 'patch', (prev) => {
        if (typeof fn !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'patch needs a function: (current) => next')
        return fn(prev)
      }).then((receipt) => {
        if (receipt.changed) stats.patches++
        return receipt
      })
    },

    subscribe(key, fn) {
      assertKey(key)
      if (typeof fn !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'subscribe needs a listener function')
      const set = listeners.get(key) || new Set()
      set.add(fn)
      listeners.set(key, set)
      stats.subscriptions++
      return () => { set.delete(fn); if (set.size === 0) listeners.delete(key) }
    },

    export() {
      if (!fold) throw refuse('VMU_STORE_FAILED', 'store is not open')
      return clone(fold)
    },

    async import(snapshot) {
      if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.keys !== 'object') {
        throw refuse('VMU_INVALID_ARGUMENT', 'import needs a snapshot produced by export()')
      }
      if (!Number.isInteger(snapshot.version) || snapshot.version > STATE_VERSION) {
        throw refuse('VMU_STORE_MIGRATION', 'snapshot is newer than this build: v' + snapshot.version)
      }
      for (const k of Object.keys(snapshot.keys)) {
        if (!PUBLIC_KEYS.includes(k)) throw refuse('VMU_INVALID_ARGUMENT', 'snapshot carries an undeclared key: ' + k)
      }
      return runExclusive(() => withFileLock(async () => {
        fold = clone(snapshot)
        fold.version = STATE_VERSION
        await persist()
        return { ok: true, version: fold.version }
      }))
    },

    stats() {
      return Object.assign({}, stats, { open: !!fold, file, version: fold ? fold.version : null, keys: fold ? Object.keys(fold.keys).length : 0, coherence: coherenceOn ? 'on' : 'off', stamp })
    },
  }

  return store
}

/** Small helper so callers can test for the port without importing the factory twice. */
export async function exists(p) {
  try { await access(p); return true } catch { return false }
}
