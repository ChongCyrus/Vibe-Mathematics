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
//   4. all writes are serialised through one promise chain, so interleaving cannot corrupt the fold.
//
// No host imports: this module must be importable by plain Node in this repository (see the same note
// in settings/schema.js). `open()` creates or loads one JSON file under the workspace.

import { mkdir, readFile, writeFile, rename, copyFile, access } from 'node:fs/promises'
import { join } from 'node:path'

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
  'ballots',
  'records',
  'budget',
  'phase',
  'work',
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
  for (const k of PUBLIC_KEYS) keys[k] = k === 'phase' ? null : (k === 'settings.resolved' || k === 'budget' ? {} : [])
  return keys
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

/**
 * Create a Store over one JSON file. `clock` is injected so tests are deterministic (docs/01 R12):
 * the framework owns time, a caller never passes an instant.
 */
export function createStore({ root, migrators = [], clock = () => new Date().toISOString() } = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw refuse('VMU_INVALID_ARGUMENT', 'createStore needs a workspace root', 'pass { root }')
  }
  const dir = join(root, 'vmu')
  const file = join(dir, 'state.json')
  const tmpFile = () => file + '.' + process.pid + '.' + Date.now() + '.tmp'

  let fold = null
  let chain = Promise.resolve()
  const listeners = new Map()
  const stats = { opens: 0, writes: 0, patches: 0, migrations: 0, subscriptions: 0 }

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
    await rename(tmp, file) // atomic: the visible file is always a complete document
    stats.writes++
  }

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
      await mkdir(dir, { recursive: true })
      let loaded
      try {
        const raw = await readFile(file, 'utf8')
        loaded = JSON.parse(raw)
      } catch (e) {
        if (e && e.code === 'ENOENT') {
          loaded = { version: STATE_VERSION, keys: defaultKeys(), createdAt: clock() }
          fold = loaded
          await runExclusive(() => persist())
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
      stats.opens++
      return { opened: loaded.createdAt ? 'created' : 'loaded', version: fold.version, migration: report, expected }
    },

    async migrate() {
      if (!fold) throw refuse('VMU_STORE_FAILED', 'store is not open')
      return runExclusive(async () => {
        const report = await migrateInPlace(fold)
        if (report.applied.length > 0) await persist()
        return report
      })
    },

    read(key) {
      if (!fold) throw refuse('VMU_STORE_FAILED', 'store is not open')
      assertKey(key)
      return clone(fold.keys[key])
    },

    /** Wholesale replace with compare-and-set. Prefer `patch` unless the value is a whole new thing. */
    write(key, value, opts = {}) {
      return runExclusive(async () => {
        if (!fold) throw refuse('VMU_STORE_FAILED', 'store is not open')
        assertKey(key)
        if (opts.expect !== undefined && opts.expect !== fold.version) {
          throw refuse('VMU_STORE_FAILED', 'durable version changed under us: expected v' + opts.expect + ', at v' + fold.version)
        }
        const prev = fold.keys[key]
        fold.keys[key] = clone(value)
        await persist()
        notify(key, fold.keys[key], prev)
        return { ok: true, key, version: fold.version, changed: true }
      })
    },

    /**
     * The preferred mutation: `current => next`, computed INSIDE the exclusive section, so two changes
     * in the same tick both survive. `fn` returning undefined leaves the value untouched.
     */
    patch(key, fn) {
      return runExclusive(async () => {
        if (!fold) throw refuse('VMU_STORE_FAILED', 'store is not open')
        assertKey(key)
        if (typeof fn !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'patch needs a function: (current) => next')
        const prev = fold.keys[key]
        const next = fn(clone(prev))
        if (next === undefined) return { ok: true, key, version: fold.version, changed: false }
        fold.keys[key] = next
        stats.patches++
        await persist()
        notify(key, next, prev)
        return { ok: true, key, version: fold.version, changed: true }
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
      return runExclusive(async () => {
        fold = clone(snapshot)
        fold.version = STATE_VERSION
        await persist()
        return { ok: true, version: fold.version }
      })
    },

    stats() {
      return Object.assign({}, stats, { open: !!fold, file, version: fold ? fold.version : null, keys: fold ? Object.keys(fold.keys).length : 0 })
    },
  }

  return store
}

/** Small helper so callers can test for the port without importing the factory twice. */
export async function exists(p) {
  try { await access(p); return true } catch { return false }
}
