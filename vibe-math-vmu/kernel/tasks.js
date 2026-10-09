// vmu tasks & stages — the ledger and the stage machine (docs/08 §4).
//
// Two things live here, and both are deliberately thin:
//   · the TASK LEDGER: create, assign, depend, transition. Dependencies are checked when work STARTS
//     (not when it is created), because "created" and "ready" are different facts; and the number of
//     open tasks can be capped as a MACHINE limit that refuses by name with the current count;
//   · the STAGE MACHINE: a declared list of stages and a `advance`/`rollback` pair around it. The
//     DEFAULT IS NO STAGES: with none declared the framework simply keeps running and does not pretend
//     to have a process (the zero-mechanism default, docs/04 §3). Whether a stage may be left is a
//     PLUGGABLE gate, which is where a pack puts rules like "no conclusion without a source id".
//
// What is NOT here: any idea of what a stage MEANS, or what should be true before leaving one. The
// kernel asks; the pack answers (R1).

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** The task state machine. `cancelled` and `done` are terminal. */
export const TASK_STATES = Object.freeze(['open', 'assigned', 'doing', 'done', 'cancelled'])

/** Allowed transitions. A transition outside this table is refused by name. */
export const TRANSITIONS = Object.freeze({
  open: ['assigned', 'doing', 'cancelled'],
  assigned: ['doing', 'open', 'cancelled'],
  doing: ['done', 'assigned', 'cancelled'],
  done: [],
  cancelled: [],
})

export function refuse(code, message, hint) {
  const err = new Error(message)
  if (hint) err.hint = hint
  err.code = code
  return err
}

/**
 * Create the ledger. `stageGate` is asked before a stage change and may refuse; `maxOpenTasks` is a
 * machine limit (0 = unlimited).
 */
export function createTasks({
  stages = [],
  maxOpenTasks = 0,
  stageGate = () => ({ ok: true }),
  bus = null,
  clock = () => new Date().toISOString(),
} = {}) {
  const tasks = new Map()
  const history = []
  const briefs = new Map()
  let stageIndex = stages.length > 0 ? 0 : -1
  let seq = 0

  if (!Array.isArray(stages) || stages.some((s) => typeof s !== 'string' || s.length === 0)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'stages must be a list of non-empty names (or empty for none)')
  }

  const record = (what, detail) => {
    const row = Object.assign({ at: clock(), what }, detail)
    history.push(row)
    return row
  }

  const task = (id) => {
    const t = tasks.get(id)
    if (!t) throw refuse('VMU_NO_SUCH_OBJECT', 'no task with id ' + String(id), 'call list() for the ledger')
    return t
  }

  const openCount = () => [...tasks.values()].filter((t) => t.state !== 'done' && t.state !== 'cancelled').length

  const unmetDeps = (t) => t.deps.filter((d) => {
    const dep = tasks.get(d)
    return !dep || dep.state !== 'done'
  })

  return {
    /** Declared stages (possibly none) and where the run stands. */
    stage() {
      return { current: stageIndex < 0 ? null : stages[stageIndex], index: stageIndex, stages: stages.slice(), declared: stages.length > 0 }
    },

    /** Create a task. Dependencies may name tasks that do not exist yet (they are checked at start). */
    async create({ title, objective = null, owner = null, deps = [], priority = 0 } = {}) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        throw refuse('VMU_INVALID_ARGUMENT', 'a task needs a non-empty title')
      }
      if (maxOpenTasks > 0 && openCount() >= maxOpenTasks) {
        throw refuse('VMU_RESOURCE_BUDGET', 'open tasks at the ceiling: ' + openCount() + '/' + maxOpenTasks,
          'vmu.tasks.maxOpenTasks is machine-enforced (docs/04 §11)')
      }
      const id = 't-' + (++seq)
      const t = { id, title: String(title), objective: objective === null ? null : String(objective),
        owner: owner === null ? null : String(owner), deps: Array.isArray(deps) ? deps.map(String) : [],
        priority, state: owner ? 'assigned' : 'open', createdAt: clock(), transitions: [] }
      tasks.set(id, t)
      record('task-created', { id, title: t.title, deps: t.deps.slice(), owner: t.owner })
      return { ok: true, id, state: t.state }
    },

    /** Assign (or reassign) an owner. Being assigned is a state, so it follows the transition table. */
    async assign(id, who) {
      const t = task(id)
      if (typeof who !== 'string' || who.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'assign needs a member id')
      if (bus) {
        const dec = await bus.emit('task/assign', { id, who, state: t.state }, { member: who })
        if (dec && dec.ok === false) return { ok: false, refused: dec.refused || { code: dec.code, message: dec.message } }
      }
      const from = t.state
      if (from === 'done' || from === 'cancelled') {
        throw refuse('VMU_STATE', 'a ' + from + ' task cannot be assigned', 'terminal states are terminal')
      }
      t.owner = String(who)
      if (from === 'open') t.state = 'assigned'
      t.transitions.push({ at: clock(), from, to: t.state, reason: 'assigned to ' + t.owner })
      record('task-assigned', { id, who: t.owner, state: t.state })
      return { ok: true, id, owner: t.owner, state: t.state }
    },

    /** Transition. Dependencies are enforced when work STARTS, not when it is created. */
    async transition(id, to, { reason = null } = {}) {
      const t = task(id)
      if (!TASK_STATES.includes(to)) throw refuse('VMU_INVALID_ARGUMENT', 'unknown task state: ' + String(to), TASK_STATES.join(', '))
      const from = t.state
      if (!TRANSITIONS[from].includes(to)) {
        throw refuse('VMU_STATE', 'illegal transition ' + from + ' -> ' + to, 'allowed from ' + from + ': ' + (TRANSITIONS[from].join(', ') || '(none)'))
      }
      if ((to === 'doing' || to === 'done') && unmetDeps(t).length > 0) {
        throw refuse('VMU_STATE', 'unmet dependencies for ' + id + ': ' + unmetDeps(t).join(', '),
          'a dependency must be done before the work starts or completes')
      }
      if (bus) {
        const dec = await bus.emit('task/transition', { id, from, to, reason }, {})
        if (dec && dec.ok === false) {
          record('task-transition-refused', { id, from, to, entry: dec.entry })
          return { ok: false, refused: dec.refused || { code: dec.code, message: dec.message } }
        }
      }
      t.state = to
      t.transitions.push({ at: clock(), from, to, reason: reason === null ? null : String(reason) })
      record('task-transition', { id, from, to, reason })
      return { ok: true, id, from, to }
    },

    /** The ledger, filtered. Never carries the brief text (that is fetched by id, docs/06 §4.2). */
    list(filter = {}) {
      return [...tasks.values()]
        .filter((t) => (filter.state === undefined || t.state === filter.state) &&
          (filter.owner === undefined || t.owner === filter.owner) &&
          (filter.ready === undefined || (filter.ready ? (t.state === 'open' || t.state === 'assigned') && unmetDeps(t).length === 0 : true)))
        .sort((a, b) => (b.priority - a.priority) || a.id.localeCompare(b.id))
        .map((t) => ({ id: t.id, title: t.title, state: t.state, owner: t.owner, deps: t.deps.slice(),
          ready: unmetDeps(t).length === 0, hasBrief: briefs.has(t.id) }))
    },

    /** Attach a task brief: the prompt fragment injected when the OWNER is woken (docs/06 §4.2). */
    brief(id, text, { by = null } = {}) {
      task(id)
      if (typeof text !== 'string' || text.trim().length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'a brief needs non-empty text')
      const previous = briefs.get(id) || null
      briefs.set(id, { text, by, at: clock() })
      record('brief-set', { id, by, previous: previous ? previous.at : null })
      return { ok: true, id, previous, rollbackable: true }
    },

    briefOf(id) {
      const t = task(id)
      const b = briefs.get(id)
      if (!b) throw refuse('VMU_NO_SUCH_OBJECT', 'task ' + id + ' has no brief', 'briefs are fetched by id, never guessed')
      return { ok: true, id, owner: t.owner, brief: b.text, by: b.by, at: b.at }
    },

    /** Breaks a task free of its brief (the rollback of `brief`). */
    clearBrief(id) {
      task(id)
      const previous = briefs.get(id) || null
      briefs.delete(id)
      record('brief-cleared', { id, previous: previous ? previous.at : null })
      return { ok: true, id, previous }
    },

    /**
     * Move to another stage. The `stageGate` is asked FIRST and may refuse (that is where a pack puts
     * "no conclusion without a source id"), and the bus sees `settle/before` and `settle/after`.
     */
    async advance({ to = null, reason = null } = {}) {
      if (stages.length === 0) {
        throw refuse('VMU_STATE', 'no stages were declared: this run has no stage machine',
          'declare vmu.tasks.stages to get one (the default is deliberately empty)')
      }
      const target = to === null ? stageIndex + 1 : stages.indexOf(to)
      if (target < 0 || target >= stages.length) {
        throw refuse('VMU_INVALID_ARGUMENT', 'unknown stage: ' + String(to), 'declared: ' + stages.join(', '))
      }
      if (target <= stageIndex) {
        throw refuse('VMU_STATE', 'stage ' + stages[target] + ' is not ahead of ' + stages[stageIndex],
          'use rollback() to go back explicitly')
      }
      const from = stageIndex < 0 ? null : stages[stageIndex]
      if (bus) {
        const dec = await bus.emit('settle/before', { from, to: stages[target], reason, tasks: this.list() }, { phase: from })
        if (dec && dec.ok === false) {
          record('stage-refused', { from, to: stages[target], entry: dec.entry })
          return { ok: false, refused: dec.refused || { code: dec.code, message: dec.message } }
        }
      }
      const gate = await stageGate({ from, to: stages[target], reason, tasks: this.list() })
      if (!gate || gate.ok !== true) {
        record('stage-gate-refused', { from, to: stages[target], message: gate && gate.message })
        throw refuse((gate && gate.code) || 'VMU_STATE',
          (gate && gate.message) || ('the stage gate refused to leave ' + String(from)),
          gate && gate.hint ? gate.hint : undefined)
      }
      stageIndex = target
      record('stage-advanced', { from, to: stages[target], reason })
      if (bus) await bus.emit('settle/after', { from, to: stages[target], reason }, { phase: stages[target] })
      return { ok: true, stage: stages[stageIndex], index: stageIndex, from }
    },

    /** Go back. Deliberate and audited, never implicit. */
    async rollback({ reason = null } = {}) {
      if (stages.length === 0) throw refuse('VMU_STATE', 'no stages were declared')
      if (stageIndex <= 0) throw refuse('VMU_STATE', 'already at the first stage', 'stage=' + String(stages[stageIndex]))
      const from = stages[stageIndex]
      stageIndex -= 1
      record('stage-rolled-back', { from, to: stages[stageIndex], reason })
      return { ok: true, stage: stages[stageIndex], index: stageIndex, from }
    },

    /** Observability (R11): the ledger's shape, the caps in force, and where the stages stand. */
    status() {
      const byState = {}
      for (const t of tasks.values()) byState[t.state] = (byState[t.state] || 0) + 1
      return {
        total: tasks.size,
        open: openCount(),
        maxOpenTasks,
        byState,
        briefs: briefs.size,
        stage: this.stage(),
        ready: this.list({ ready: true }).map((t) => t.id),
        blocked: [...tasks.values()].filter((t) => unmetDeps(t).length > 0).map((t) => ({ id: t.id, missing: unmetDeps(t) })),
      }
    },

    history() { return history.map((h) => Object.assign({}, h)) },
  }
}
