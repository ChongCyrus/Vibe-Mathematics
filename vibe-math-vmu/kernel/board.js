// vmu kernel · board — kanban columns, WIP limits, swimlanes, aging.
// Design source: docs/08-primitives-meeting-ballot-workflow.md §4 / §10.5 / §12.4 / §19.5.
//   Board schema (§10.5): columns[{id,name,wipLimit,order}], swimlanes[], agingWarnMs
//   Settings (§19.5): vmu.board.columns | wipDefault | wipPerColumn | swimlanes | agingWarnMs | moveRequiresTransition
// Invariants (same set as the rest of the kernel):
//   · every refusal is NAMED (VMU_* + hint) — never a bare exception
//   · every upper bound reports how many items were DROPPED — never silent
//   · unconfigured ⇒ zero mechanism: no columns, moves refused by name, nothing throws
//   · the only time source is the injected `clock` (never reads real time)
//   · columns() / aging() / status() are READ-ONLY (they never mutate state)
export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

const WIP_CODE = 'VMU_WORKFLOW_WIP_LIMIT'
const TRANSITION_CODE = 'VMU_WORKFLOW_TRANSITION_REQUIRED'
const AGING_CAP = 200

export function createBoard({ clock = () => 0, log = null, settings = {}, bus = null, tasks = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createBoard needs a clock function', 'pass { clock: () => ms }')

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (event) => { if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* logging must never break the board */ } } }

  const added = []          // columns added at runtime (settings columns are the base)
  const wipOverride = {}    // columnId -> limit (runtime)
  const where = new Map()   // taskId -> columnId
  const movedAt = new Map() // taskId -> ms of last move

  const baseColumns = () => {
    const c = sget('vmu.board.columns', [])
    if (!Array.isArray(c)) return []
    return c.filter((x) => x && typeof x.id === 'string' && x.id).map((x) => ({
      id: x.id,
      name: typeof x.name === 'string' && x.name ? x.name : x.id,
      wipLimit: Number.isInteger(x.wipLimit) && x.wipLimit >= 0 ? x.wipLimit : null,
      order: Number.isInteger(x.order) ? x.order : 0,
    }))
  }
  const allColumns = () => baseColumns().concat(added).slice().sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : 1))
  const columnById = (id) => allColumns().find((c) => c.id === id) || null

  const wipFor = (col) => {
    if (Object.prototype.hasOwnProperty.call(wipOverride, col.id)) return wipOverride[col.id]
    const per = sget('vmu.board.wipPerColumn', {})
    if (per && typeof per === 'object' && Number.isInteger(per[col.id])) return per[col.id]
    if (Number.isInteger(col.wipLimit)) return col.wipLimit
    const d = sget('vmu.board.wipDefault', 0)
    return Number.isInteger(d) && d >= 0 ? d : 0
  }

  // occupancy comes from the injected ledger when it can answer, else from our own move map
  const occupantsOf = (columnId) => {
    if (tasks && typeof tasks.list === 'function') {
      try {
        const all = tasks.list()
        if (Array.isArray(all)) return all.filter((t) => t && t.wipColumn === columnId).map((t) => t.id)
      } catch (e) { /* fall through to the local map (the board must work standalone) */ }
    }
    const out = []
    for (const [taskId, col] of where.entries()) if (col === columnId) out.push(taskId)
    return out
  }

  return {
    apiVersion,

    /** Read-only. Ordering is deterministic (order, then id). */
    columns() {
      const cols = allColumns().map((c) => {
        const wip = wipFor(c)
        const occupants = occupantsOf(c.id)
        return { id: c.id, name: c.name, order: c.order, wipLimit: wip, occupants: occupants.length, tasks: occupants }
      })
      return { ok: true, columns: cols, count: cols.length }
    },

    addColumn({ id, name, wipLimit = null, order = null } = {}) {
      if (typeof id !== 'string' || !id) throw refuse('VMU_INVALID_ARGUMENT', 'addColumn needs a non-empty string id', 'e.g. { id: "doing", name: "Doing" }')
      if (typeof name !== 'string' || !name) throw refuse('VMU_INVALID_ARGUMENT', 'addColumn needs a non-empty string name', 'e.g. { id: "doing", name: "Doing" }')
      if (wipLimit !== null && !(Number.isInteger(wipLimit) && wipLimit >= 0)) throw refuse('VMU_INVALID_ARGUMENT', 'wipLimit must be an integer >= 0 (0 = unlimited)', 'omit it for unlimited')
      if (order !== null && !Number.isInteger(order)) throw refuse('VMU_INVALID_ARGUMENT', 'order must be an integer when given', 'omit it to keep the current order')
      if (columnById(id)) throw refuse('VMU_INVALID_ARGUMENT', 'column already exists: ' + id, 'available: ' + allColumns().map((c) => c.id).join(', ') || '(none)')
      added.push({ id, name, wipLimit, order: order === null ? added.length : order })
      say({ type: 'board/column-added', at: clock(), column: id })
      return { ok: true, id, columns: allColumns().map((c) => c.id) }
    },

    /** Move a task between columns. WIP and (optionally) the state transition are gates. */
    move({ taskId, toColumn, by = null, transition = null } = {}) {
      if (typeof taskId !== 'string' || !taskId) throw refuse('VMU_INVALID_ARGUMENT', 'move needs a non-empty taskId', 'pass { taskId, toColumn }')
      const cols = allColumns()
      if (!cols.length) throw refuse('VMU_INVALID_ARGUMENT', 'no columns configured: the board is empty (zero mechanism)', 'configure vmu.board.columns or call addColumn first')
      const col = columnById(toColumn)
      if (!col) throw refuse('VMU_INVALID_ARGUMENT', 'unknown column: ' + String(toColumn), 'available: ' + cols.map((c) => c.id).join(', '))
      const from = where.has(taskId) ? where.get(taskId) : null

      if (from !== null && from !== col.id) {
        const requires = sget('vmu.board.moveRequiresTransition', true) !== false
        if (requires) {
          const seam = tasks && typeof tasks.canTransition === 'function' ? tasks : null
          if (seam) {
            const dec = seam.canTransition({ task: taskId, from, to: col.id, reason: 'board.move' })
            if (dec && dec.ok === false) return { ok: false, refused: { code: (dec.refused && dec.refused.code) || dec.code || TRANSITION_CODE, message: (dec.refused && dec.refused.message) || dec.message || ('transition refused ' + from + ' -> ' + col.id), hint: (dec.refused && dec.refused.hint) || dec.hint } }
          } else if (!transition) {
            throw refuse(TRANSITION_CODE, 'moving ' + taskId + ' from ' + from + ' to ' + col.id + ' requires a state transition', 'either inject a tasks ledger with canTransition(), or pass { transition: true } to declare it explicitly')
          }
        }
      }

      const wip = wipFor(col)
      const occupants = occupantsOf(col.id).filter((id) => id !== taskId)
      if (wip > 0 && occupants.length >= wip) {
        throw refuse(WIP_CODE, 'column ' + col.id + ' is at its WIP limit: ' + occupants.length + '/' + wip, 'finish or move an item first, or raise vmu.board.wipPerColumn.' + col.id)
      }

      const at = clock()
      where.set(taskId, col.id)
      movedAt.set(taskId, at)
      say({ type: 'board/moved', at, task: taskId, from, to: col.id, by })
      if (bus && typeof bus.emit === 'function') { try { bus.emit({ type: 'board/moved', at, task: taskId, from, to: col.id }) } catch (e) { /* bus is advisory */ } }
      return { ok: true, task: taskId, from, to: col.id, occupants: occupants.length + 1, wip: wip }
    },

    setWip({ column, limit } = {}) {
      const col = columnById(column)
      if (!col) throw refuse('VMU_INVALID_ARGUMENT', 'unknown column: ' + String(column), 'available: ' + allColumns().map((c) => c.id).join(', ') || '(none)')
      if (!(Number.isInteger(limit) && limit >= 0)) throw refuse('VMU_INVALID_ARGUMENT', 'limit must be an integer >= 0 (0 = unlimited)', 'e.g. { column: "' + col.id + '", limit: 2 }')
      wipOverride[col.id] = limit
      say({ type: 'board/wip-set', at: clock(), column: col.id, limit })
      return { ok: true, column: col.id, wipLimit: limit }
    },

    /** Read-only. */
    swimlanes() {
      const s = sget('vmu.board.swimlanes', [])
      const lanes = Array.isArray(s) ? s.filter((x) => typeof x === 'string' && x) : []
      return { ok: true, swimlanes: lanes.slice(), count: lanes.length }
    },

    /** Read-only. Returns at most AGING_CAP items and REPORTS how many were dropped. */
    aging({ warnMs = null, limit = AGING_CAP } = {}) {
      const cap = Number.isInteger(limit) && limit > 0 ? limit : AGING_CAP
      const warn = Number.isInteger(warnMs) && warnMs >= 0 ? warnMs : (Number.isInteger(sget('vmu.board.agingWarnMs', 0)) ? sget('vmu.board.agingWarnMs', 0) : 0)
      const now = clock()
      const all = []
      for (const [taskId, col] of where.entries()) {
        const since = movedAt.has(taskId) ? movedAt.get(taskId) : now
        const ageMs = Math.max(0, now - since)
        if (warn > 0 && ageMs < warn) continue
        all.push({ task: taskId, column: col, since, ageMs })
      }
      all.sort((a, b) => (b.ageMs - a.ageMs) || (a.task < b.task ? -1 : 1))
      const kept = all.slice(0, cap)
      return { ok: true, agingWarnMs: warn, items: kept, count: kept.length, dropped: all.length - kept.length, truncated: all.length > kept.length }
    },

    /** Read-only snapshot. */
    status() {
      const cols = allColumns()
      const occupancy = {}
      let total = 0
      for (const c of cols) { const n = occupantsOf(c.id).length; occupancy[c.id] = n; total += n }
      const s = sget('vmu.board.swimlanes', [])
      const lanes = Array.isArray(s) ? s.length : 0
      return {
        ok: true,
        configured: cols.length > 0,
        columns: cols.length,
        occupancy,
        tracked: total,
        swimlanes: lanes,
        agingWarnMs: Number.isInteger(sget('vmu.board.agingWarnMs', 0)) ? sget('vmu.board.agingWarnMs', 0) : 0,
        moveRequiresTransition: sget('vmu.board.moveRequiresTransition', true) !== false,
        tasksInjected: !!(tasks && typeof tasks.list === 'function'),
        at: clock(),
      }
    },
  }
}
