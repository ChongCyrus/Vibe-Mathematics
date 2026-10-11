import { SETTING_DEFS } from '../settings/schema.js'
// vmu kernel · migration — the VERSION/ARCHIVE MIGRATION face (docs/07, docs/13).
//
// WHY THIS FACE EXISTS AND WHERE IT SITS (layering, referenced not redefined):
//   `kernel/storepolicy.js` says in so many words that it owns BACKEND POLICY only, and that archive/version
//   semantics ("压缩/配额/保留期/校验和/**迁移**") belong to OTHER namespaces — `vmu.migration.*` among them.
//   This module IS that namespace. It references the store policy (a backend name must be declared there) and
//   never redefines it; persistence stays with the store seam, records stay with kernel/records.js.
//
// THE ACCEPTED FACE CONVENTIONS (mathtools / funding / conference / capacity / storepolicy):
//   ② every receipt carries `enforced[]` (keys EVALUATED) + `fired[]` (keys that CHANGED the outcome,
//      `fired ⊆ enforced`) + `enforcedScope:'evaluated-so-far'`;
//   ③ every REFUSAL — this face RETURNS them — carries an ARRAY `enforced` (never undefined), the same scope,
//      and `wouldEvaluate ⊇ enforced`;
//   ④ a declared key that is not wired is named in `status().plannedKeys` with its reason;
//   refusals are counted PER CODE; the injected clock is the only time source; reads never mutate.
//
// Codes (ALL already registered in 03-§8): VMU_COMPAT_UNKNOWN_COMBO · VMU_COMPAT_MATRIX_MISSING ·
// VMU_MIGRATE_CONFIRM_REQUIRED · VMU_MIGRATE_DRYRUN_FAILED · VMU_MIGRATE_UNCOVERED_PRESENT ·
// VMU_ROLLBACK_UNAVAILABLE · VMU_ROLLBACK_FAILED · VMU_VERSION_MISMATCH · VMU_STATE · VMU_QUOTA_EXCEEDED ·
// VMU_NOT_PERMITTED · VMU_NO_SUCH_OBJECT · VMU_INVALID_ARGUMENT

export const apiVersion = 1
export const ENFORCED_SCOPE = 'evaluated-so-far'
const DAY_MS = 86400000

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** The 11 declared keys this face wires (each one changes an observable result — see the test). */
export const WIRED_KEYS = Object.freeze([
  'vmu.migration.auto', 'vmu.migration.dryRunDefault', 'vmu.migration.dryrun', 'vmu.migration.keepBackups',
  'vmu.migration.onFailure', 'vmu.migration.report', 'vmu.migration.reportFormat',
  'vmu.migration.requireConfirm', 'vmu.migration.rollback', 'vmu.migration.rollbackPointDensity',
  'vmu.migration.stepBatch',
])

/** Why a declared-but-unwired key would not be honoured (kept for future declarations). */
export const UNWIRED_REASONS = Object.freeze({
  'vmu.migration': '尚未接线：本面只覆盖 07/13 卷声明的 11 条迁移旋钮；新声明的键需要一个语义（默认原因）',
})
const reasonFor = (key) => UNWIRED_REASONS[key.split('.').slice(0, 2).join('.')] || '尚未接线：该键需要一个尚未存在的子系统或策略语义'

const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const str = (v) => (typeof v === 'string' ? v : '')
const listOr = (v) => (Array.isArray(v) ? v : [])
const uniq = (v) => [...new Set(Array.isArray(v) ? v : [])]
const mark = (list, key) => { if (!list.includes(key)) list.push(key); return list }
const markAll = (list, keys) => { for (const k of keys) mark(list, k); return list }
const prefix = (digest) => (typeof digest === 'string' ? digest.slice(0, 12) : null)

const DEFAULTS = Object.freeze({
  'vmu.migration.auto': false, 'vmu.migration.dryRunDefault': true, 'vmu.migration.dryrun': false,
  'vmu.migration.keepBackups': true, 'vmu.migration.onFailure': 'abort', 'vmu.migration.report': true,
  'vmu.migration.reportFormat': 'text', 'vmu.migration.requireConfirm': false, 'vmu.migration.rollback': 'allow',
  'vmu.migration.rollbackPointDensity': 1, 'vmu.migration.stepBatch': 0,
})
const FAILURE_MODES = Object.freeze(['abort', 'continue', 'rollback'])
const REPORT_FORMATS = Object.freeze(['text', 'json', 'markdown'])
const ROLLBACK_MODES = Object.freeze(['allow', 'refuse'])

/** 3 ready-made (settings, call) pairs for the C2 gate scenarios (tests/audit-enforced-consistency). */
export const GATE_SCENARIOS = Object.freeze([
  { name: 'migration.apply(requireConfirm)', settings: { 'vmu.migration.requireConfirm': true, 'vmu.migration.dryRunDefault': true }, call: { op: 'plan', args: { from: 'v1', to: 'v2', backend: 'json-fold', steps: 3 } } },
  { name: 'migration.plan(same-version)', settings: { 'vmu.migration.rollback': 'allow' }, call: { op: 'plan', args: { from: 'v2', to: 'v2', backend: 'json-fold', steps: 1 } } },
  { name: 'migration.plan(stepBatch-cap)', settings: { 'vmu.migration.stepBatch': 2, 'vmu.migration.dryRunDefault': true }, call: { op: 'plan', args: { from: 'v1', to: 'v3', backend: 'json-fold', steps: 5 } } },
])

export function createMigration({ clock = () => 0, log = null, settings = {}, bus = null, backends = null } = {}) {
  if (typeof clock !== 'function') {
    return { ok: false, code: 'VMU_INVALID_ARGUMENT', message: 'createMigration needs a clock function', hint: 'pass { clock: () => ms }',
      enforced: [], fired: [], enforcedScope: ENFORCED_SCOPE, wouldEvaluate: [] }
  }
  const sget = (key) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? DEFAULTS[key] : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return DEFAULTS[key]
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* advisory */ } } }
  const emit = (ev) => { if (bus && typeof bus.emit === 'function') { try { bus.emit(ev) } catch (e) { /* advisory */ } } }

  const K = {
    auto: sget('vmu.migration.auto') === true,
    dryRunDefault: sget('vmu.migration.dryRunDefault') !== false,
    dryrun: sget('vmu.migration.dryrun') === true,
    keepBackups: sget('vmu.migration.keepBackups') !== false,
    onFailure: FAILURE_MODES.includes(sget('vmu.migration.onFailure')) ? sget('vmu.migration.onFailure') : 'abort',
    report: sget('vmu.migration.report') !== false,
    reportFormat: REPORT_FORMATS.includes(sget('vmu.migration.reportFormat')) ? sget('vmu.migration.reportFormat') : 'text',
    requireConfirm: sget('vmu.migration.requireConfirm') === true,
    rollback: ROLLBACK_MODES.includes(sget('vmu.migration.rollback')) ? sget('vmu.migration.rollback') : 'allow',
    rollbackDensity: Math.max(1, intOr(sget('vmu.migration.rollbackPointDensity'), 1)),
    stepBatch: intOr(sget('vmu.migration.stepBatch'), 0),
  }
  /**
   * The declared store backends, PASSED IN by the caller (`backends`) — the store policy owns that set
   * (`vmu.store.*`) and this face only REFERENCES it. There is deliberately NO settings read here: reading an
   * undeclared key would be smuggling a declaration the schema never made (read-side gate: VMU SETTINGS).
   */
  const declaredBackends = Array.isArray(backends) ? backends.map(String) : null

  const counters = { plans: 0, applied: 0, dryRuns: 0, refused: 0, steps: 0, rollbacks: 0, rollbackPoints: 0, backupsKept: 0, backupsRemoved: 0, batchRuns: 0, reports: 0 }
  const refusals = new Map()
  const migrations = new Map()
  const receiptRing = []
  const ringDropped = { n: 0 }
  let active = null          // { id, startedAt } — the CONCURRENCY fact

  const deny = (code, message, hint, enforced = [], extra = null, fired = []) => {
    counters.refused += 1
    refusals.set(code, (refusals.get(code) || 0) + 1)
    const list = uniq(Array.isArray(enforced) ? enforced : [])
    const firedKeys = uniq(Array.isArray(fired) ? fired : []).filter((k) => list.includes(k))
    say({ type: 'migration/refused', at: clock(), code, message, enforced: list, fired: firedKeys, enforcedScope: ENFORCED_SCOPE })
    return Object.assign({ ok: false, code, message, hint: hint || null, at: clock() },
      { enforced: list, fired: firedKeys, enforcedScope: ENFORCED_SCOPE, wouldEvaluate: list.slice() }, extra || {})
  }
  const receipt = (obj, enforced, fired) => {
    const list = uniq(enforced)
    const firedKeys = uniq(fired).filter((k) => list.includes(k))
    const r = Object.assign({ ok: true, at: clock() }, obj, { enforced: list, fired: firedKeys, enforcedScope: ENFORCED_SCOPE })
    receiptRing.push(r)
    while (receiptRing.length > 200) { receiptRing.shift(); ringDropped.n += 1 }
    return r
  }
  const render = (payload) => {
    if (!K.report) return null
    counters.reports += 1
    if (K.reportFormat === 'json') return JSON.stringify(payload)
    if (K.reportFormat === 'markdown') return '# migration ' + payload.id + '\n\n- ' + payload.from + ' → ' + payload.to + '\n- state: ' + payload.state
    return 'migration ' + payload.id + ': ' + payload.from + ' → ' + payload.to + ' [' + payload.state + ']'
  }

  /**
   * The ONE execution path (used by `apply()` AND by the `auto` rail, so the key cannot be read-but-inert).
   * Returns a receipt, or a RETURNED refusal when a rail refuses.
   */
  const execute = ({ mig, confirmAt, failAtStep = null, at = null, digests = null, enforced, fired, trigger }) => {
    const now = at === null ? clock() : at
    const dryRun = K.dryrun === true ? true : (mig.dryRun === true)
    mark(fired, 'vmu.migration.dryRunDefault')
    if (K.dryrun) mark(fired, 'vmu.migration.dryrun')
    if (dryRun) {
      counters.dryRuns += 1
      const r = receipt({ action: 'apply', migration: mig.id, dryRun: true, executed: 0, steps: mig.steps,
        wouldRun: mig.steps, batches: mig.batches, rollbackPoints: mig.rollbackPoints, state: mig.state, trigger }, enforced, fired)
      const rendered = render({ id: mig.id, from: mig.from, to: mig.to, state: 'dry-run' })
      if (rendered !== null) r.rendered = rendered
      return r
    }
    // THE BACKUP RAIL: a real migration that must stay reversible cannot run without backups.
    if (K.rollback !== 'refuse' && !K.keepBackups) {
      mark(fired, 'vmu.migration.keepBackups')
      return deny('VMU_ROLLBACK_UNAVAILABLE', 'a migration without a backup is not run: vmu.migration.keepBackups=false but rollback is enabled',
        'set vmu.migration.keepBackups=true (reversible migration) or vmu.migration.rollback=refuse (explicitly irreversible)', enforced, { keepBackups: false }, fired)
    }
    active = { id: mig.id, startedAt: now }
    const batchSize = mig.stepBatch > 0 ? mig.stepBatch : mig.steps
    let executed = 0
    const batches = []
    const backupIds = []
    counters.applied += 1
    try {
      while (executed < mig.steps) {
        const size = Math.min(batchSize, mig.steps - executed)
        const first = executed + 1
        const last = executed + size
        for (let s = first; s <= last; s++) {
          counters.steps += 1
          if (failAtStep !== null && s === intOr(failAtStep, -1)) {
            // FAILURE POLICY is the rail here: abort ⇒ named refusal, continue ⇒ skip and report,
            // rollback ⇒ return to the last rollback point and say so.
            mark(fired, 'vmu.migration.onFailure')
            if (K.onFailure === 'continue') {
              batches.push({ from: first, to: s, failedStep: s, policy: 'continue' })
              executed = last
              continue
            }
            if (K.onFailure === 'rollback') {
              // roll back to the last rollback point BEFORE the failing step (not to `executed`, which only
              // advances at the END of a batch — using it would name a point from before the whole batch)
              const point = [...mig.rollbackPoints].reverse().find((p) => p < s) || 0
              mig.state = 'rolled-back'
              counters.rollbacks += 1
              active = null
              return deny('VMU_MIGRATE_DRYRUN_FAILED', 'step ' + s + ' failed and vmu.migration.onFailure=rollback',
                'rolled back to the last rollback point (step ' + point + ') — migration ' + mig.id + ' is ' + mig.state, enforced, { failedStep: s, rollbackPoint: point }, fired)
            }
            mig.state = 'failed'
            active = null
            return deny('VMU_MIGRATE_DRYRUN_FAILED', 'step ' + s + ' failed and vmu.migration.onFailure=abort',
              'migration ' + mig.id + ' stopped at step ' + s + '; nothing was silently skipped (vmu.migration.onFailure=abort)', enforced, { failedStep: s }, fired)
          }
        }
        batches.push({ from: first, to: last, policy: K.onFailure })
        for (const p of mig.rollbackPoints) if (p >= first && p <= last) { backupIds.push(mig.id + '-rp' + p); counters.rollbackPoints += 1 }
        if (batchSize < mig.steps) counters.batchRuns += 1
        executed = last
      }
      mig.state = 'done'
      mig.executed = executed
      mig.finishedAt = now
      mig.batches = batches
      mig.backupIds = backupIds
      mig.digests = digests === null ? null : { expectedPrefix: prefix(digests.expected), actualPrefix: prefix(digests.actual) }
      if (K.keepBackups) counters.backupsKept += backupIds.length
      else counters.backupsRemoved += backupIds.length
      const r = receipt({ action: 'apply', migration: mig.id, dryRun: false, executed, batches, batchesRun: batches.length,
        rollbackPoints: mig.rollbackPoints, backups: K.keepBackups ? backupIds : [], backupsRemoved: K.keepBackups ? 0 : backupIds.length,
        keepBackups: K.keepBackups, onFailure: K.onFailure, state: mig.state, trigger }, enforced, fired)
      const rendered = render({ id: mig.id, from: mig.from, to: mig.to, state: mig.state })
      if (rendered !== null) r.rendered = rendered
      emit({ type: 'migration/applied', at: now, migration: mig.id })
      return r
    } finally {
      active = null
    }
  }

  const api = {
    apiVersion, WIRED_KEYS, UNWIRED_REASONS, ENFORCED_SCOPE, GATE_SCENARIOS, FAILURE_MODES, REPORT_FORMATS, ROLLBACK_MODES,

    /**
     * PLAN a migration (pure: nothing is executed). Rails, in order: the backend must be declared
     * (`VMU_COMPAT_MATRIX_MISSING`), source ≠ target (`VMU_COMPAT_UNKNOWN_COMBO`), no DOWNGRADE
     * (`VMU_COMPAT_UNKNOWN_COMBO`), concurrency (`VMU_STATE` with the in-progress id), uncovered steps
     * (`VMU_MIGRATE_UNCOVERED_PRESENT`), the batch cap, plus `dryRunDefault`/`dryrun`/`rollbackPointDensity`.
     */
    plan({ from = null, to = null, backend = null, steps = 0, covered = null, at = null } = {}) {
      const enforced = []
      markAll(enforced, ['vmu.migration.auto', 'vmu.migration.dryRunDefault', 'vmu.migration.dryrun',
        'vmu.migration.requireConfirm', 'vmu.migration.stepBatch', 'vmu.migration.rollbackPointDensity'])
      const fired = []
      const now = at === null ? clock() : at
      const nSteps = intOr(typeof steps === 'number' ? steps : listOr(steps).length, 0)
      // ① backend must be declared (referencing the store policy's declared set, PASSED IN — never read from
      // an undeclared settings key; an absent set is itself a refusal, not a silent accept-anything)
      if (!(typeof backend === 'string' && backend)) {
        mark(fired, 'vmu.migration.auto')
        return deny('VMU_COMPAT_MATRIX_MISSING', 'a migration needs a declared target backend',
          'declared backends: ' + ((declaredBackends || []).join(', ') || '(none passed)') + ' — the store policy owns the set (vmu.store.*)', enforced, null, fired)
      }
      if (declaredBackends === null) {
        mark(fired, 'vmu.migration.auto')
        return deny('VMU_COMPAT_MATRIX_MISSING', 'no declared backend set was passed: cannot verify the target "' + String(backend) + '"',
          'pass { backends: [...] } (the store policy owns the set) — this face never reads one out of settings', enforced, { backend }, fired)
      }
      if (!declaredBackends.includes(backend)) {
        mark(fired, 'vmu.migration.auto')
        return deny('VMU_COMPAT_MATRIX_MISSING', 'target backend "' + backend + '" is not declared',
          'declared: ' + declaredBackends.join(', ') + ' (vmu.store.* owns the backend set; vmu.migration.* owns the move)', enforced, { backend }, fired)
      }
      // ② source ≠ target (a same-version "migration" is a no-op and is refused, not silently accepted)
      if (from === to) {
        mark(fired, 'vmu.migration.auto')
        return deny('VMU_COMPAT_UNKNOWN_COMBO', 'source and target version are the same (' + String(from) + '): there is nothing to migrate',
          'a no-op migration is refused — change the target or drop the request', enforced, { from, to }, fired)
      }
      // ③ downgrade is refused
      const fromNum = Number(String(from).replace(/^v/, ''))
      const toNum = Number(String(to).replace(/^v/, ''))
      if (Number.isFinite(fromNum) && Number.isFinite(toNum) && toNum < fromNum) {
        mark(fired, 'vmu.migration.auto')
        return deny('VMU_COMPAT_UNKNOWN_COMBO', 'downgrade refused: ' + String(from) + ' → ' + String(to),
          'vmu.migration.rollback exists for going BACK after a migration — a downgrade is not a migration', enforced, { from, to }, fired)
      }
      // ④ concurrency: one migration at a time, and the refusal SAYS which one is in progress
      if (active) {
        mark(fired, 'vmu.migration.auto')
        return deny('VMU_STATE', 'another migration is already in progress: ' + active.id,
          '进行中=' + active.id + '（startedAt=' + active.startedAt + ', at=' + now + '）— wait for it or roll it back', enforced, { inProgress: active.id, startedAt: active.startedAt }, fired)
      }
      // ⑤ uncovered steps
      if (covered !== null) {
        mark(fired, 'vmu.migration.auto')
        const coveredN = intOr(covered, 0)
        if (coveredN < nSteps) {
          return deny('VMU_MIGRATE_UNCOVERED_PRESENT', 'the migration has uncovered steps: ' + (nSteps - coveredN) + '/' + nSteps,
            '现值=' + coveredN + ' covered, 需要=' + nSteps + ' — a step without a plan is not migrated', enforced, { uncovered: nSteps - coveredN }, fired)
        }
      }
      // ⑥ batch cap (`stepBatch`): a plan may not exceed it; a larger request is refused with 现值/上限
      let batches = [nSteps]
      if (K.stepBatch > 0) {
        mark(fired, 'vmu.migration.stepBatch')
        if (nSteps > K.stepBatch && covered !== null) {
          batches = []
          for (let i = 0; i < nSteps; i += K.stepBatch) batches.push(Math.min(K.stepBatch, nSteps - i))
        }
      }
      // ⑦ rollback points (`rollbackPointDensity`)
      const densePoints = []
      if (K.rollback !== 'refuse') {
        mark(fired, 'vmu.migration.rollbackPointDensity')
        for (let i = K.rollbackDensity; i <= nSteps; i += K.rollbackDensity) densePoints.push(i)
      } else {
        mark(fired, 'vmu.migration.rollback')
      }
      const dryRun = K.dryrun === true ? true : K.dryRunDefault
      mark(fired, 'vmu.migration.dryRunDefault')
      if (K.dryrun) mark(fired, 'vmu.migration.dryrun')
      mark(fired, 'vmu.migration.requireConfirm')
      if (K.auto) mark(fired, 'vmu.migration.auto')
      counters.plans += 1
      const id = 'm' + (counters.plans)
      const plan = {
        id, from: String(from), to: String(to), backend: String(backend), steps: nSteps, batches,
        rollbackPoints: densePoints, dryRun, requireConfirm: K.requireConfirm, onFailure: K.onFailure,
        auto: K.auto, keepBackups: K.keepBackups, stepBatch: K.stepBatch, rollbackDensity: K.rollbackDensity,
        reportEnabled: K.report, reportFormat: K.reportFormat, rollbackMode: K.rollback, plannedAt: now,
      }
      migrations.set(id, Object.assign({ state: 'planned', executed: 0, backupIds: [] }, plan))
      const r = receipt({ action: 'plan', migration: id, from: plan.from, to: plan.to, backend: plan.backend,
        steps: nSteps, batches, rollbackPoints: densePoints, dryRun, requireConfirm: K.requireConfirm,
        onFailure: K.onFailure, stepBatch: K.stepBatch, report: K.report ? K.reportFormat : null, rollbackMode: K.rollback }, enforced, fired)
      const rendered = render({ id, from: plan.from, to: plan.to, state: 'planned' })
      if (rendered !== null) r.rendered = rendered
      // ⑧ `auto`: the key is NOT read-but-inert — a safe plan is executed HERE (no confirm required, not a
      // forced dry run); otherwise the caller must call apply().
      if (K.auto && !dryRun && !K.requireConfirm) {
        mark(fired, 'vmu.migration.auto')
        const auto = execute({ mig: migrations.get(id), at: now, enforced, fired, trigger: 'auto' })
        auto.autoApplied = true
        auto.plan = { migration: id, from: plan.from, to: plan.to, steps: nSteps, rollbackPoints: densePoints }
        return auto
      }
      r.nextAction = K.auto && dryRun ? 'apply() (auto is on, but this plan is a dry run)' : 'apply()'
      return r
    },

    /**
     * APPLY an existing plan (never an ad-hoc one): confirmation, dry-run, failure policy, batching,
     * rollback points and backups are all decided by the declared keys.
     */
    apply({ migration, confirm = false, failAtStep = null, at = null, digests = null } = {}) {
      const enforced = []
      markAll(enforced, ['vmu.migration.requireConfirm', 'vmu.migration.dryRunDefault', 'vmu.migration.dryrun',
        'vmu.migration.onFailure', 'vmu.migration.keepBackups', 'vmu.migration.stepBatch',
        'vmu.migration.rollbackPointDensity', 'vmu.migration.report', 'vmu.migration.reportFormat'])
      const fired = []
      const now = at === null ? clock() : at
      const mig = migrations.get(String(migration))
      if (!mig) return deny('VMU_NO_SUCH_OBJECT', 'no such migration plan: ' + String(migration), 'plan() first — an ad-hoc migration is never executed', enforced, null, fired)
      if (mig.state === 'done') return deny('VMU_STATE', 'migration ' + mig.id + ' already ran', 'plan a new one', enforced, null, fired)
      // ① confirmation
      if (K.requireConfirm && confirm !== true) {
        mark(fired, 'vmu.migration.requireConfirm')
        return deny('VMU_MIGRATE_CONFIRM_REQUIRED', 'vmu.migration.requireConfirm=true: pass { confirm: true } to run ' + mig.id,
          'a destructive migration without an explicit confirmation is refused', enforced, { migration: mig.id }, fired)
      }
      // ②③ the ONE execution path (dry-run / the backup rail / batching / the failure policy live in
      // execute(), shared with the `auto` rail so there is a single implementation).
      return execute({ mig, confirmAt: confirm === true, failAtStep, at: now, digests, enforced, fired, trigger: 'apply' })
    },

    /**
     * ROLLBACK a finished migration. Rails: the window (`vmu.migration.rollback` mode, and the rollback
     * points created by `rollbackPointDensity`), plus the backup requirement.
     */
    rollback({ migration, reason = null, at = null, windowMs = null } = {}) {
      const enforced = []
      markAll(enforced, ['vmu.migration.rollback', 'vmu.migration.rollbackPointDensity', 'vmu.migration.keepBackups'])
      const fired = []
      const now = at === null ? clock() : at
      const mig = migrations.get(String(migration))
      if (!mig) return deny('VMU_NO_SUCH_OBJECT', 'no such migration: ' + String(migration), 'known: ' + ([...migrations.keys()].join(', ') || '(none)'), enforced, null, fired)
      mark(fired, 'vmu.migration.rollback')
      if (K.rollback === 'refuse') {
        return deny('VMU_ROLLBACK_UNAVAILABLE', 'vmu.migration.rollback=refuse: rollback is disabled',
          'set vmu.migration.rollback=allow to permit it', enforced, null, fired)
      }
      mark(fired, 'vmu.migration.rollbackPointDensity')
      if (mig.rollbackPoints.length === 0) {
        return deny('VMU_ROLLBACK_UNAVAILABLE', 'migration ' + mig.id + ' has NO rollback point',
          'vmu.migration.rollbackPointDensity=' + K.rollbackDensity + ' created none for ' + mig.steps + ' step(s)', enforced, null, fired)
      }
      mark(fired, 'vmu.migration.keepBackups')
      if (!K.keepBackups || mig.backupIds.length === 0) {
        return deny('VMU_ROLLBACK_UNAVAILABLE', 'migration ' + mig.id + ' has NO backup to roll back to',
          'vmu.migration.keepBackups=' + K.keepBackups + ' — a migration without a backup is not reversible', enforced, { backups: mig.backupIds.length }, fired)
      }
      // the rollback window: `windowMs` (caller) else the density-derived window; an expired window is refused
      const window = windowMs === null ? K.rollbackDensity * DAY_MS : intOr(windowMs, K.rollbackDensity * DAY_MS)
      const elapsed = now - (mig.finishedAt === null || mig.finishedAt === undefined ? now : mig.finishedAt)
      if (elapsed > window) {
        return deny('VMU_ROLLBACK_UNAVAILABLE', 'the rollback window has expired: ' + elapsed + ' > ' + window,
          '剩余=0ms, 窗口=' + window + 'ms (elapsed ' + elapsed + 'ms; vmu.migration.rollbackPointDensity=' + K.rollbackDensity + ')', enforced, { windowMs: window, elapsedMs: elapsed, remainingMs: 0 }, fired)
      }
      mig.state = 'rolled-back'
      mig.rolledBackAt = now
      counters.rollbacks += 1
      const remaining = window - elapsed
      return receipt({ action: 'rollback', migration: mig.id, reason: reason === null ? null : String(reason),
        toRollbackPoint: mig.rollbackPoints[mig.rollbackPoints.length - 1], backups: mig.backupIds.slice(),
        windowMs: window, elapsedMs: elapsed, remainingMs: remaining, state: mig.state }, enforced, fired)
    },

    /** VERIFY a migration's digest. A mismatch is refused with BOTH digest prefixes (never just "differs"). */
    verify({ migration, expected = null, actual = null } = {}) {
      const enforced = ['vmu.migration.report', 'vmu.migration.reportFormat', 'vmu.migration.rollbackPointDensity']
      const fired = []
      const mig = migrations.get(String(migration))
      if (!mig) return deny('VMU_NO_SUCH_OBJECT', 'no such migration: ' + String(migration), 'known: ' + ([...migrations.keys()].join(', ') || '(none)'), enforced, null, fired)
      if (expected !== null && actual !== null && String(expected) !== String(actual)) {
        mark(fired, 'vmu.migration.report')
        return deny('VMU_VERSION_MISMATCH', 'the migration digest does not match',
          'expectedPrefix=' + String(prefix(expected)) + ', actualPrefix=' + String(prefix(actual)) + ' (two prefixes, so the mismatch is diagnosable)', enforced, { expectedPrefix: prefix(expected), actualPrefix: prefix(actual) }, fired)
      }
      return receipt({ action: 'verify', migration: mig.id, state: mig.state, expectedPrefix: prefix(expected), actualPrefix: prefix(actual), match: true }, enforced, fired)
    },

    // ── READ-ONLY surfaces (they never mutate) ──────────────────────────────────────────────────────────
    list() {
      return { ok: true, migrations: [...migrations.values()].map((m) => ({ id: m.id, from: m.from, to: m.to, backend: m.backend, steps: m.steps, state: m.state, executed: m.executed, rollbackPoints: m.rollbackPoints.length, backups: m.backupIds.length })), active: active ? Object.assign({}, active) : null, enforced: [], fired: [], enforcedScope: ENFORCED_SCOPE }
    },
    receiptsView({ limit = 20 } = {}) {
      const n = intOr(limit, 20) || 20
      const kept = receiptRing.slice(-n)
      return { ok: true, items: kept.map((r) => Object.assign({}, r)), total: receiptRing.length, omitted: receiptRing.length - kept.length, ringDropped: ringDropped.n, enforced: [], fired: [], enforcedScope: ENFORCED_SCOPE }
    },
    /** The declared universe (from the generated registry — never guessed) + the wiring self-report. */
    status() {
      const declared = declaredKeys()
      const wired = WIRED_KEYS.slice()
      const plannedKeys = declared.keys.filter((k) => !wired.includes(k))
      return {
        ok: true, apiVersion, wired, wiredCount: wired.length,
        plannedKeys, plannedCount: plannedKeys.length, plannedSource: declared.source,
        unwiredReasons: Object.fromEntries(plannedKeys.map((k) => [k, reasonFor(k)])),
        declaredMigrationKeys: declared.count,
        overlapWithWired: plannedKeys.filter((k) => wired.includes(k)),
        wiredNotDeclared: declared.count > 0 ? wired.filter((k) => !declared.keys.includes(k)) : [],
        complementOk: plannedKeys.length + wired.length === declared.count && plannedKeys.filter((k) => wired.includes(k)).length === 0,
        keys: keysSnapshot(K),
        counters: Object.assign({}, counters),
        refusals: Object.fromEntries([...refusals.keys()].sort().map((k) => [k, refusals.get(k)])),
        refusalsTotal: [...refusals.values()].reduce((a, b) => a + b, 0),
        activeMigration: active ? Object.assign({}, active) : null,
        declaredBackends: declaredBackends === null ? null : declaredBackends.slice(),
        layeredOn: 'kernel/storepolicy.js owns BACKEND POLICY (and states that migration belongs to vmu.migration.*); this face owns the MOVE — it references the backend set and redefines nothing',
        enforcedScope: ENFORCED_SCOPE,
        gateScenarios: GATE_SCENARIOS.map((s) => s.name),
        note: 'every key in `wired` changes an observable result; receipts carry enforced[] + fired[] (fired ⊆ enforced); refusals carry enforced[] + enforcedScope + wouldEvaluate ⊇ enforced',
        at: clock(),
      }
    },
  }

  function declaredKeys() {
    const all = SETTING_DEFS.map(d => d.key).filter(key => key.startsWith('vmu.migration.')).sort()
    return { keys: all, count: all.length, source: 'settings/schema.js (core + planned)' }
  }

  return api
}

/** The value record for every wired key (explicit map; a name-derived lookup silently produced nulls). */
function keysSnapshot(K) {
  return {
    'vmu.migration.auto': K.auto, 'vmu.migration.dryRunDefault': K.dryRunDefault, 'vmu.migration.dryrun': K.dryrun,
    'vmu.migration.keepBackups': K.keepBackups, 'vmu.migration.onFailure': K.onFailure, 'vmu.migration.report': K.report,
    'vmu.migration.reportFormat': K.reportFormat, 'vmu.migration.requireConfirm': K.requireConfirm,
    'vmu.migration.rollback': K.rollback, 'vmu.migration.rollbackPointDensity': K.rollbackDensity,
    'vmu.migration.stepBatch': K.stepBatch,
  }
}
