// vmu kernel · projmigrate — version migration for the KERNEL'S OWN persisted documents
// (idempotency ledger projections, audit-ring snapshots, …).
// Why: kernel-owned documents carry their own `version`, so a version bump would otherwise make old
// projections unreadable and silently break cross-restart idempotency (only flagged by `durable:false`).
// Discipline is the SAME as stateversion (referenced, not redefined): explicit from→to steps with who/when/why.
// Invariants:
//   · an unknown version / unknown kind is REFUSED BY NAME — never treated as the current version
//   · migrations are EXPLICIT (each step records from→to + by + at + why); nothing is rewritten implicitly
//   · a failed migration leaves the original document BYTE-IDENTICAL (no half-migrated state)
//   · after a successful migration the checksum is RECOMPUTED (an old checksum mismatch is expected)
//   · already at the target version ⇒ idempotent noop
//   · no migration path ⇒ REFUSED BY NAME, naming "v1→v3 has no path" — documents are never silently dropped
//   · cycles and the step cap are refused with current/limit; the clock is injected; reads never mutate
import { checksumOf } from './idempotency.js'

export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

// Codes are all already registered in 03-§8 (stateversion uses the same set).
export const CODE = Object.freeze({
  unknown: 'VMU_COMPAT_UNKNOWN_COMBO',
  noPath: 'VMU_NOT_FOUND',
  stepFailed: 'VMU_MIGRATE_DRYRUN_FAILED',
  downgrade: 'VMU_INDEX_STALE',
  budget: 'VMU_RESOURCE_BUDGET',
})

export function createProjectionMigrator({ clock = () => 0, log = null, settings = {}, bus = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createProjectionMigrator needs a clock function', 'pass { clock: () => ms }')

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging must not break migration */ } } }

  const stepCap = (() => {
    const a = sget('vmu.projection.maxMigrationSteps', undefined)
    const b = sget('vmu.state.maxMigrationSteps', undefined)
    const v = a === undefined ? b : a
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 16
  })()

  const kinds = new Map()   // kind -> { version, fingerprint, steps: Map(from -> {to, run, by, why}), checksum }
  const history = []

  const entryOf = (kind) => {
    const e = kinds.get(String(kind))
    if (!e) throw refuse(CODE.unknown, 'unknown projection kind: ' + String(kind), 'registered kinds: ' + (kinds.size ? [...kinds.keys()].join(', ') : '(none)'))
    return e
  }
  const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)))
  const checksumFor = (e, doc) => (typeof e.checksum === 'function' ? e.checksum(doc) : checksumOf(doc))

  /** Breadth-first, explicit search for from→to. Returns [] when already at `to`. */
  const chain = (e, from, to) => {
    if (from === to) return []
    const queue = [[from, []]]
    const seen = new Set([from])
    while (queue.length) {
      const [at, path] = queue.shift()
      if (path.length >= stepCap) throw refuse(CODE.budget, 'migration step cap reached: ' + stepCap + '/' + stepCap, 'raise vmu.projection.maxMigrationSteps, or migrate in stages')
      const step = e.steps.get(at)
      if (!step) continue
      const next = path.concat([{ from: at, to: step.to, by: step.by, why: step.why, run: step.run }])
      if (step.to === to) return next
      if (next.length > stepCap) throw refuse(CODE.budget, 'migration step cap reached: ' + stepCap + '/' + stepCap, 'raise vmu.projection.maxMigrationSteps, or migrate in stages')
      if (seen.has(step.to)) { history.push({ type: 'cycle', at: clock(), from: step.to }); continue }
      seen.add(step.to)
      queue.push([step.to, next])
    }
    // a chain that loops back onto itself is reported as a cycle by name, not as a silent dead end
    const cyc = e.steps.get(from)
    if (cyc && cyc.to === from) throw refuse(CODE.noPath, 'cycle in the migration chain: ' + from + '→' + cyc.to + ' (no path from ' + from + ' to ' + to + ')', 'break the cycle: a migration step must move forward')
    throw refuse(CODE.noPath, 'no migration path: ' + from + '→' + to + ' has no path', 'register the missing step(s); the document is NOT dropped and NOT treated as ' + to)
  }
  const toVersion = (v) => {
    const n = typeof v === 'string' && /^v?\d+$/.test(v) ? Number(String(v).replace(/^v/, '')) : v
    return Number.isInteger(n) ? n : null
  }
  const apply = (e, kind, doc, target) => {
    const from = toVersion(doc && doc.version)
    if (from === null) throw refuse(CODE.unknown, 'document has no usable version field: kind=' + kind, 'a projection document must carry an integer `version`; it is never assumed to be current')
    if (from === target) return { ok: true, kind, noop: true, version: target, doc, checksum: checksumFor(e, doc), note: 'already at the target version: nothing was rewritten' }
    const steps = chain(e, from, target)
    const prevChecksum = checksumFor(e, doc)
    let work = clone(doc)                           // the ORIGINAL is never touched
    const applied = []
    for (const s of steps) {
      let out
      try { out = s.run(work) }
      catch (err) {
        history.push({ type: 'failed', at: clock(), kind, from, to: target, at_step: s.from + '→' + s.to })
        say({ type: 'projmigrate/failed', at: clock(), kind, from, to: target, step: s.from + '→' + s.to })
        throw refuse(CODE.stepFailed, 'migration failed at ' + s.from + '→' + s.to + ': ' + (err && err.message ? err.message : String(err)), 'the original document is unchanged (byte-identical) — fix the step and retry')
      }
      if (!out || typeof out !== 'object') throw refuse(CODE.stepFailed, 'migration step ' + s.from + '→' + s.to + ' did not return a document', 'the original document is unchanged')
      work = out
      applied.push({ from: s.from, to: s.to, by: s.by || null, at: clock(), why: s.why || null })
    }
    if (toVersion(work.version) !== target) throw refuse(CODE.stepFailed, 'the chain ended at v' + String(work.version) + ' instead of v' + target, 'every step must set `version` to its own `to`')
    const nextChecksum = checksumFor(e, work)
    history.push({ type: 'migrated', at: clock(), kind, from, to: target, steps: applied.length })
    say({ type: 'projmigrate/migrated', at: clock(), kind, from, to: target, steps: applied.length })
    if (bus && typeof bus.emit === 'function') { try { bus.emit({ type: 'projmigrate/migrated', kind, from, to: target }) } catch (e) { /* advisory */ } }
    return {
      ok: true, kind, migrated: true, from, to: target, steps: applied, doc: work,
      checksum: nextChecksum, previousChecksum: prevChecksum, checksumChanged: prevChecksum !== nextChecksum,
      note: 'the checksum was RECOMPUTED after migration; an old checksum not matching is expected',
    }
  }

  return {
    apiVersion,

    /** Register the CURRENT version of a kernel-owned projection kind, with its explicit migration steps. */
    register({ kind, version, fingerprint = null, migrate = [], checksum = null } = {}) {
      if (typeof kind !== 'string' || !kind) throw refuse('VMU_INVALID_ARGUMENT', 'register needs a kind', 'e.g. { kind: "idempotency", version: 2, migrate: [{ from: 1, to: 2, run, by, why }] }')
      const v = toVersion(version)
      if (!Number.isInteger(v)) throw refuse(CODE.unknown, 'register needs an integer version: ' + String(version), 'the current version must be explicit; it is never assumed')
      if (kinds.has(kind)) throw refuse(CODE.unknown, 'projection kind already registered: ' + kind, 'registered kinds: ' + [...kinds.keys()].join(', '))
      if (!Array.isArray(migrate)) throw refuse('VMU_INVALID_ARGUMENT', 'migrate must be a list of steps', 'each step: { from, to, run, by, why }')
      const steps = new Map()
      for (const s of migrate) {
        const f = toVersion(s && s.from); const t = toVersion(s && s.to)
        if (!Number.isInteger(f) || !Number.isInteger(t)) throw refuse(CODE.unknown, 'a migration step needs integer from/to', 'e.g. { from: 1, to: 2, run(doc), by: "office", why: "shape v2" }')
        if (typeof s.run !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'a migration step needs a run(doc) function: ' + f + '→' + t, 'the step must be explicit, never implicit')
        if (!s.why) throw refuse('VMU_INVALID_ARGUMENT', 'a migration step needs a `why` (who/why is audited): ' + f + '→' + t, 'an unexplained rewrite is indistinguishable from corruption')
        if (steps.has(f)) throw refuse(CODE.unknown, 'two steps start at v' + f + ' for kind ' + kind, 'each from-version may have only one successor (cycles are refused)')
        steps.set(f, { to: t, run: s.run, by: s.by || null, why: String(s.why) })
      }
      kinds.set(kind, { version: v, fingerprint, steps, checksum })
      say({ type: 'projmigrate/registered', at: clock(), kind, version: v, steps: steps.size })
      return { ok: true, kind, version: v, steps: steps.size, fingerprint }
    },

    /** Read a persisted projection: migrate explicit steps when needed. The input doc is never mutated. */
    read({ kind, doc } = {}) {
      if (typeof kind !== 'string' || !kind) throw refuse('VMU_INVALID_ARGUMENT', 'read needs a kind', 'e.g. { kind: "idempotency", doc }')
      if (!doc || typeof doc !== 'object') throw refuse('VMU_INVALID_ARGUMENT', 'read needs a document object', 'a projection is an object with a `version`')
      const e = entryOf(kind)
      return apply(e, kind, doc, e.version)
    },

    /** Upgrade a document to an explicit target version (downgrades are refused unless allowed). */
    upgrade({ kind, doc, to, allowDowngrade = false } = {}) {
      if (typeof kind !== 'string' || !kind) throw refuse('VMU_INVALID_ARGUMENT', 'upgrade needs a kind', 'e.g. { kind: "idempotency", doc, to: 2 }')
      const e = entryOf(kind)
      const target = toVersion(to)
      if (!Number.isInteger(target)) throw refuse(CODE.unknown, 'upgrade needs an integer target version: ' + String(to), 'the current version is ' + e.version)
      const from = toVersion(doc && doc.version)
      if (from !== null && target < from && !allowDowngrade) throw refuse(CODE.downgrade, 'downgrade refused: v' + from + ' → v' + target, 'pass { allowDowngrade: true } to force it (it is recorded and disclosed)')
      return apply(e, kind, doc, target)
    },

    /** Read-only. */
    status() {
      const rows = [...kinds.entries()].map(([kind, e]) => ({ kind, version: e.version, steps: [...e.steps.keys()].map((f) => f + '→' + e.steps.get(f).to) }))
      return {
        ok: true,
        kinds: rows, kindCount: rows.length,
        maxMigrationSteps: stepCap,
        unknownVersionRefused: true, unknownKindRefused: true,
        migrationsAreExplicit: true, silentDropForbidden: true,
        failedMigrationLeavesOriginalUntouched: true, checksumRecomputedAfterMigration: true,
        idempotentNoopAtTarget: true, readsArePure: true,
        history: history.length, historyDropped: 0,
        note: 'kernel-owned projections (idempotency ledger, audit-ring snapshots) are versioned HERE; business state stays with stateversion',
        at: clock(),
      }
    },
  }
}
