// vmu panel — the MEMBER STATE PANEL primitive (docs/17 §19, docs/08 §2).
//
// WHY THIS EXISTS, AND WHAT IT ADDS TO THE v5r LINE. The v5r `self_report` recorded `overall`, `subgoal`,
// `plan` and `status` per member. It had NO independent field for "the sub-task I am executing right now":
// the running work had to be inferred from `plan[]` + `status` + the task board, which meant a manager could
// not read "who is doing what at this instant" from one place. D-08 baseline B makes that the ONE new field
// here (`subtasks`), beside the three the v5r line already had.
//
// THE INVARIANTS:
//   · APPEND-ONLY. Every accepted change appends to that member's history; the latest row is derived, never
//     rewritten. A view never carries private message content (the v5r G5 boundary);
//   · THE FRAMEWORK WRITES THE TIMES. Any caller-supplied `...At`/`...Ms` is refused BY NAME (I-3);
//   · DEVIATION IS RECORDED, NEVER SWALLOWED. If one member overwrites an `overall` authored by someone
//     else, the previous value and its author are kept in `deviation` (retrievable) — policy
//     `vmu.panel.deviationPolicy` can instead REFUSE the write by name;
//   · VIEWING IS AUDITED. `view()` writes who looked at whom; the audit is capped and the drops are COUNTED;
//   · NO SECOND SOURCE OF TRUTH. When a `members` seam is injected, the four v5r-compatible fields are
//     mirrored into `members.selfReport` (which keeps its own ledger and emits its own hook) and this module
//     reports `mirrored:true`; when the seam is absent this panel's ledger is the authority and it says so.
//
// The panel does NOT decide who may write whose row: that is policy (a pack/host guard), and the `by` fact
// is recorded verbatim so an auditor can see exactly who claimed what.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** The five fields. `subtasks` is the one the v5r line was missing (D-08 baseline B). */
export const PANEL_FIELDS = Object.freeze(['overall', 'subgoal', 'plan', 'status', 'subtasks'])

/** A running sub-task's state. `running` is what "正在执行的子任务" means; the others are the lifecycle. */
export const PANEL_SUBTASK_STATES = Object.freeze(['planned', 'running', 'blocked', 'done'])

/** Every `vmu.panel.*` key this module reads (docs/04). */
export const PANEL_KEYS = Object.freeze([
  'vmu.panel.auditCap',
  'vmu.panel.subtasksMax',
  'vmu.panel.deviationPolicy',
  'vmu.panel.historyCap',
])

/** All four keys decide something: caps bound the ledgers (counted drops), the policy picks refuse-vs-record. */
export const WIRED_PANEL_KEYS = Object.freeze(PANEL_KEYS.slice())
export const PLANNED_PANEL_KEYS = Object.freeze([])

/**
 * Named refusal (codes are registered in docs/03 §8). Like `kernel/chat.js`, EVERY refusal states its
 * evaluated scope (D3): `enforced[]` (empty when this decision read no settings key, never `undefined`)
 * plus `enforcedScope`.
 */
export function refuse(code, message, hint, enforced) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  err.enforced = Array.isArray(enforced) ? enforced.slice() : []
  err.enforcedScope = 'evaluated-so-far'
  return err
}

const TIME_KEY = /(At|Ms)$/i
const clone = (v) => JSON.parse(JSON.stringify(v))
const FIELDS_MIRRORED = Object.freeze(['overall', 'subgoal', 'plan', 'status'])   // what members.selfReport takes

/**
 * `createPanel({ clock, log, settings, bus, members })`.
 *   · `members` — the optional mirror seam (`members.selfReport(id, fields, { by })`);
 *   · `bus` — only used when NO mirror seam is bound: the panel then emits `member/self-report` itself, so a
 *     reviewer still sees one report event per accepted write. With the seam bound the seam owns the event.
 */
export function createPanel({
  clock = () => new Date(0).toISOString(),
  log = () => {},
  settings = {},
  bus = null,
  members = null,
} = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createPanel needs a clock function', 'pass { clock }')

  const readKey = (k) => {
    if (settings && typeof settings.get === 'function') {
      const v = settings.get(k)
      if (v !== undefined) return v
    }
    if (settings && Object.prototype.hasOwnProperty.call(settings, k)) return settings[k]
    const short = k.split('.').pop()
    const nested = (settings && (settings.panel || settings)) || {}
    if (nested && Object.prototype.hasOwnProperty.call(nested, short)) return nested[short]
    return undefined
  }
  const numKey = (k, d) => { const n = Number(readKey(k)); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d }
  const auditCapOf = () => numKey('vmu.panel.auditCap', 200)
  const subtasksMaxOf = () => numKey('vmu.panel.subtasksMax', 32)
  const historyCapOf = () => numKey('vmu.panel.historyCap', 200)
  const deviationPolicyOf = () => (readKey('vmu.panel.deviationPolicy') === 'refuse' ? 'refuse' : 'record')

  const rows = new Map()          // member -> state row
  const history = new Map()       // member -> append-only entries
  const viewAudit = []
  const dropped = { history: 0, audit: 0 }
  const refusals = new Map()

  const note = (code) => { refusals.set(code, (refusals.get(code) || 0) + 1); return code }

  const rowOf = (member) => {
    const id = String(member)
    if (!rows.has(id)) {
      rows.set(id, { member: id, overall: '', overallAt: 0, overallBy: '', subgoal: '', subgoalAt: 0,
        plan: [], planAt: 0, status: '', statusAt: 0, subtasks: [], subtasksAt: 0, updatedAt: 0, updatedBy: '', deviation: null })
    }
    return rows.get(id)
  }

  const pushHistory = (id, entry) => {
    const list = history.get(id) || []
    list.push(entry)
    const cap = historyCapOf()
    if (cap > 0 && list.length > cap) {
      const over = list.length - cap
      dropped.history += over
      list.splice(0, over)
    }
    history.set(id, list)
    return entry
  }

  const normalizeSubtasks = (input) => {
    const list = Array.isArray(input) ? input : [input]
    const out = []
    for (const raw of list) {
      if (raw === null || raw === undefined) continue
      if (typeof raw === 'string') { out.push({ id: '', title: raw, state: 'running', note: '' }); continue }
      if (typeof raw !== 'object') throw refuse('VMU_INVALID_ARGUMENT', 'a subtask must be a string or {title,state}', 'got ' + JSON.stringify(raw))
      const state = String(raw.state === undefined || raw.state === null || raw.state === '' ? 'running' : raw.state)
      if (!PANEL_SUBTASK_STATES.includes(state)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'unknown subtask state: ' + state, 'one of ' + PANEL_SUBTASK_STATES.join(', '))
      }
      const title = String(raw.title === undefined || raw.title === null ? '' : raw.title).trim()
      if (!title) throw refuse('VMU_INVALID_ARGUMENT', 'a subtask needs a title', 'pass { title } for every running sub-task')
      out.push({ id: String(raw.id || ''), title, state, note: String(raw.note || '') })
    }
    return out
  }

  const run = (raw) => (typeof raw === 'string' ? raw.trim() : String(raw === undefined || raw === null ? '' : raw))

  const emitReport = (id, fields, by) => {
    if (typeof bus !== 'object' || bus === null || typeof bus.emit !== 'function') return false
    try { bus.emit('member/self-report', { member: id, fields: Object.keys(fields), by: by === undefined ? null : by }) ; return true } catch (e) { return false }
  }

  /**
   * The ONE hook helper (string topic FIRST: an object-shaped emit is rejected by the bus and then swallowed by
   * the caller's catch, so it never reaches a subscriber). Registered names: `panel/write-before` (blockable),
   * `panel/written`, `panel/viewed`.
   */
  const emitHook = (topic, payload, scope) => {
    if (typeof bus !== 'object' || bus === null || typeof bus.emit !== 'function') return null
    try {
      // Topic LITERALS: the hook-coverage gate reads `bus.emit('<name>'` from the source (see kernel/chat.js).
      if (topic === 'panel/write-before') return bus.emit('panel/write-before', payload, scope || {})
      if (topic === 'panel/written') return bus.emit('panel/written', payload, scope || {})
      if (topic === 'panel/viewed') return bus.emit('panel/viewed', payload, scope || {})
      return null
    } catch (e) { return null }
  }

  const panel = {
    /**
     * Write a member's panel. Partial patches are allowed; a same-value patch is `deduped` and appends NO
     * history (an idempotent resubmission is not a new fact).
     */
    async set(member, fields, { by = null, reason = '', source = 'self' } = {}) {
      const id = String(member === undefined || member === null ? '' : member)
      if (!id) throw refuse('VMU_INVALID_ARGUMENT', 'a panel write needs a member id', 'pass the member whose row is written')
      const patch = fields || {}
      const stampKeys = Object.keys(patch).filter((k) => TIME_KEY.test(String(k)))
      if (stampKeys.length) {
        note('VMU_PANEL_TIME_KEY')
        throw refuse('VMU_PANEL_TIME_KEY', 'time is set by the framework: ' + stampKeys.join(', ') + ' is refused',
          'the per-field ...At is written from the injected clock; never send one')
      }
      const unknown = Object.keys(patch).filter((k) => !PANEL_FIELDS.includes(k))
      if (unknown.length) {
        note('VMU_PANEL_UNKNOWN_FIELD')
        throw refuse('VMU_PANEL_UNKNOWN_FIELD', 'unknown panel field(s): ' + unknown.join(', '),
          'allowed: ' + PANEL_FIELDS.join(', '))
      }
      if (!Object.keys(patch).length) throw refuse('VMU_INVALID_ARGUMENT', 'an empty panel write is refused', 'pass at least one of ' + PANEL_FIELDS.join(', '))

      const row = rowOf(id)
      const src = ['self', 'negotiated', 'academician', 'framework'].includes(String(source)) ? String(source) : 'self'
      const byId = by === null || by === undefined ? '' : String(by)
      const changes = []
      const next = Object.assign({}, row)

      // The BEFORE hook: a middleware may block this write by name. A refusal leaves the row untouched.
      const blocked = emitHook('panel/write-before', { member: id, fields: Object.keys(patch), by: byId || null }, { member: id })
      if (blocked && blocked.ok === false) {
        const code = (blocked.refused && blocked.refused.code) || blocked.code || 'VMU_NOT_PERMITTED'
        const msg = (blocked.refused && blocked.refused.message) || blocked.message || 'a middleware refused this panel write'
        note(code)
        throw refuse(code, msg, 'the panel/write-before hook refused it (docs/05 §5)')
      }

      for (const k of PANEL_FIELDS) {
        if (patch[k] === undefined) continue
        if (k === 'plan') {
          const val = Array.isArray(patch[k]) ? patch[k].map((x) => String(x)) : [String(patch[k])]
          if (JSON.stringify(row.plan) === JSON.stringify(val)) continue
          changes.push({ field: k, from: clone(row.plan), to: clone(val) })
          next.plan = val
          next.planAt = clock()
          continue
        }
        if (k === 'subtasks') {
          const val = normalizeSubtasks(patch[k])
          const max = subtasksMaxOf()
          if (max > 0 && val.length > max) {
            note('VMU_PANEL_CAP_REACHED')
            throw refuse('VMU_PANEL_CAP_REACHED', 'too many running sub-tasks: ' + val.length + ' > ' + max + ' (vmu.panel.subtasksMax)',
              'close the ones that are done, or raise the cap; the list is bounded so the panel stays readable',
              ['vmu.panel.subtasksMax'])
          }
          if (JSON.stringify(row.subtasks) === JSON.stringify(val)) continue
          changes.push({ field: k, from: clone(row.subtasks), to: clone(val) })
          next.subtasks = val
          next.subtasksAt = clock()
          continue
        }
        const val = run(patch[k])
        if (String(row[k] || '') === val) continue
        changes.push({ field: k, from: String(row[k] || ''), to: val })
        next[k] = val
        next[k + 'At'] = clock()
      }

      if (!changes.length) {
        return { ok: true, deduped: true, member: id, fields: panel.fieldsOf(next), times: panel.timesOf(next),
          subtasks: clone(next.subtasks), deviation: next.deviation || null, mirrored: false,
          message: 'the panel row did not change: a same-value write is idempotent and appends no history' }
      }

      // DEVIATION (v5r G6): someone other than the author overwrites `overall`.
      const ov = changes.filter((c) => c.field === 'overall')[0]
      if (ov) {
        const author = String(row.overallBy || '')
        if (author && byId && author !== byId) {
          if (deviationPolicyOf() === 'refuse') {
            note('VMU_PANEL_DEVIATION')
            throw refuse('VMU_PANEL_DEVIATION',
              'the overall goal of ' + id + ' was set by ' + author + ': ' + byId + ' may not overwrite it (vmu.panel.deviationPolicy=refuse)',
              'change the policy to "record" to allow an audited deviation, or have ' + author + ' update it',
              ['vmu.panel.deviationPolicy'])
          }
          next.deviation = { at: clock(), by: byId, keptValue: author === '' ? '' : String(row.overall || ''),
            keptAt: Number(row.overallAt || 0), keptBy: author, reason: String(reason || '') }
        }
        next.overallBy = src === 'academician' ? 'academician' : (byId || String(next.overallBy || ''))
      }
      next.updatedAt = clock()
      next.updatedBy = byId
      for (const c of changes) pushHistory(id, { at: clock(), by: byId, field: c.field, from: c.from, to: c.to, reason: String(reason || ''), source: src })
      rows.set(id, next)

      // MIRROR into the v5r-compatible face when a seam is bound (only its four fields; `subtasks` stays here).
      let mirrored = false
      let mirrorSkipped = null
      const mirroredFields = {}
      for (const k of FIELDS_MIRRORED) if (patch[k] !== undefined) mirroredFields[k] = clone(next[k])
      if (typeof members === 'object' && members !== null && typeof members.selfReport === 'function') {
        if (Object.keys(mirroredFields).length) {
          try {
            await members.selfReport(id, mirroredFields, { by: byId || undefined })
            mirrored = true
          } catch (e) {
            mirrorSkipped = { what: 'members.selfReport', why: String((e && e.code) || (e && e.message) || e) }
          }
        }
      } else {
        emitReport(id, mirroredFields, byId)
      }

      const enforced = ['vmu.panel.subtasksMax'].concat(ov ? ['vmu.panel.deviationPolicy'] : [])
      emitHook('panel/written', { member: id, changed: changes.map((c) => c.field), mirrored }, { member: id })
      return { ok: true, member: id, changed: changes.map((c) => c.field), fields: panel.fieldsOf(next), times: panel.timesOf(next),
        subtasks: clone(next.subtasks), deviation: next.deviation || null, mirrored, mirrorSkipped, enforced }
    },

    /** The v5r-shaped field view of a row (private plan/status live here; message content never does). */
    fieldsOf(row) {
      return { overall: row.overall || '', subgoal: row.subgoal || '', plan: Array.isArray(row.plan) ? clone(row.plan) : [], status: row.status || '' }
    },
    timesOf(row) {
      return { overallAt: Number(row.overallAt || 0), subgoalAt: Number(row.subgoalAt || 0), planAt: Number(row.planAt || 0), subtasksAt: Number(row.subtasksAt || 0) }
    },

    /** Read one member's panel (no audit: a single self-read is not a surveillance event; `view()` is). */
    get(member) {
      const id = String(member === undefined || member === null ? '' : member)
      if (!rows.has(id)) {
        return { ok: true, member: id, known: false, overall: '', subgoal: '', plan: [], status: '', subtasks: [],
          times: { overallAt: 0, subgoalAt: 0, planAt: 0, subtasksAt: 0 }, updatedAt: 0, updatedBy: '', deviation: null }
      }
      const row = rows.get(id)
      return Object.assign({ ok: true, member: id, known: true }, panel.fieldsOf(row),
        { subtasks: clone(row.subtasks), times: panel.timesOf(row), updatedAt: Number(row.updatedAt || 0), updatedBy: row.updatedBy || '', deviation: row.deviation || null })
    },

    /**
     * Institute-wide view. WRITES AN AUDIT ROW (who looked at whom) — the v5r G6 lesson that a manager's
     * read right is separate from a member's notification duty, and that looking is itself auditable.
     */
    view({ viewer = null, ids = null } = {}) {
      const wanted = Array.isArray(ids) && ids.length ? ids.map(String) : [...rows.keys()].sort()
      const roster = wanted.map((id) => panel.get(id))
      const at = clock()
      viewAudit.push({ at, by: viewer === null || viewer === undefined ? null : String(viewer), saw: wanted.slice() })
      emitHook('panel/viewed', { viewer: viewer === null || viewer === undefined ? null : String(viewer), saw: wanted.slice() },
        viewer === null || viewer === undefined ? {} : { member: String(viewer) })
      const cap = auditCapOf()
      if (cap > 0 && viewAudit.length > cap) {
        const over = viewAudit.length - cap
        dropped.audit += over
        viewAudit.splice(0, over)
        log('panel: view audit cap ' + cap + ' reached — dropped ' + over + ' row(s) (total ' + dropped.audit + ')')
      }
      return { ok: true, at, viewer: viewer === null || viewer === undefined ? null : String(viewer),
        roster, count: roster.length, running: roster.reduce((n, r) => n + (r.subtasks || []).filter((s) => s.state === 'running').length, 0),
        auditTail: panel.audit().slice(-20), dropped: Object.assign({}, dropped) }
    },

    /** One member's append-only history, OLDEST FIRST (the order an auditor reads). */
    history(member) {
      const id = String(member === undefined || member === null ? '' : member)
      return { ok: true, member: id, entries: (history.get(id) || []).map((e) => Object.assign({}, e)), dropped: dropped.history }
    },

    audit() { return viewAudit.map((a) => Object.assign({}, a)) },

    /** A dashboard row per known member: the three D-08 fields plus the v5r two, with counts. */
    board() {
      return [...rows.keys()].sort().map((id) => {
        const row = rows.get(id)
        return { member: id, overall: row.overall || '', plan: clone(row.plan), subtasks: clone(row.subtasks),
          running: row.subtasks.filter((s) => s.state === 'running').length, blocked: row.subtasks.filter((s) => s.state === 'blocked').length,
          updatedAt: Number(row.updatedAt || 0), updatedBy: row.updatedBy || '', deviation: !!row.deviation }
      })
    },

    status() {
      return { ok: true, apiVersion, members: rows.size, viewAudit: viewAudit.length, historyEntries: [...history.values()].reduce((n, l) => n + l.length, 0),
        policy: { auditCap: auditCapOf(), subtasksMax: subtasksMaxOf(), historyCap: historyCapOf(), deviationPolicy: deviationPolicyOf() },
        mechanism: { hasMembersSeam: !!(members && typeof members.selfReport === 'function'),
          hasBus: !!(bus && typeof bus.emit === 'function'), clockInjected: true, mirrored: !!(members && typeof members.selfReport === 'function') },
        dropped: Object.assign({}, dropped), refusals: Object.fromEntries(refusals) }
    },

    keysUsed() {
      return { 'vmu.panel.auditCap': true, 'vmu.panel.subtasksMax': true, 'vmu.panel.deviationPolicy': true, 'vmu.panel.historyCap': true }
    },

    partition() {
      return { wired: WIRED_PANEL_KEYS.slice(), planned: PLANNED_PANEL_KEYS.map((x) => (Array.isArray(x) ? x[0] : x)), unwired: [] }
    },

    config() {
      return { auditCap: auditCapOf(), subtasksMax: subtasksMaxOf(), historyCap: historyCapOf(), deviationPolicy: deviationPolicyOf() }
    },

    refusals: () => Object.fromEntries(refusals),
  }

  return panel
}

export default createPanel
