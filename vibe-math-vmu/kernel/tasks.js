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

// ROUND 2 (task-10 A): the durable projection seam. `snapshot()`/`restore()` are what make a restart keep the
// board, and the id counter is reconciled with `observeIds` so a restart can never mint `t-1` twice.
// NOTE (named reason, not an omission): this face keeps its own PER-INSTANCE counter instead of the shared
// `kernel/ids.js` minter, because two ledgers built in one process must each start at `t-1` (existing suites and
// the A/B harness depend on it). The counter is persisted per instance through `snapshot()` and restored through
// `restore()`, and the shared durable counter is fed with `observeIds` as a floor for any other face.
import { observeIds, idNumber } from './ids.js'
import { checkSnapshot } from './resume.js'

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

/** D3 (round 26): the refusal states its EVALUATION SCOPE — `enforcedScope:'evaluated-so-far'` says in words
 *  that any key list travelling with it is "what was consulted SO FAR", never the operation's full key set. */
export const ENFORCED_SCOPE = 'evaluated-so-far'

export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  if (hint) err.hint = hint
  err.code = code
  if (extra !== undefined) err.detail = extra
  err.enforcedScope = ENFORCED_SCOPE
  return err
}

/**
 * F35 (Round 5): the dependency graph must stay a DAG. `unmetDeps` only answers "is this dependency finished
 * yet" at start time, so a cycle used to be constructible and simply never became ready — a silent deadlock.
 *
 * Pure and EXPORTED (another face may reuse the same rule): returns the CYCLE PATH (`['t-2','t-1','t-2']`) that
 * would be created by adding the edges `startId -> deps`, or null when the addition keeps the graph acyclic.
 * `getDeps(id)` supplies the existing edges, so the search needs no ledger.
 */
export function findDependencyCycle(startId, deps, getDeps) {
  const start = String(startId)
  const walk = (from, seen) => {
    const node = String(from)
    if (node === start) return [start]
    if (seen.has(node)) return null
    seen.add(node)
    const next = typeof getDeps === 'function' ? getDeps(node) : null
    for (const d of (Array.isArray(next) ? next : [])) {
      const sub = walk(d, seen)
      if (sub) return [node].concat(sub)
    }
    return null
  }
  for (const d of (Array.isArray(deps) ? deps : [])) {
    if (String(d) === start) return [start, start]          // self-loop is a cycle of length 1
    const sub = walk(d, new Set())
    if (sub) return [start].concat(sub)
  }
  return null
}

/** F39 (Round 5): the team-board scope contract, shared by the creator's declaration and the advisory view. */
export function normalizeWriteScope(raw) {
  const t = String(raw === undefined || raw === null ? '' : raw).trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  if (!t) return undefined
  if (t.startsWith('/') || /^[a-z]:/i.test(t)) return undefined
  for (const seg of t.split('/')) if (seg === '' || seg === '.' || seg === '..') return undefined
  return t
}
export function scopesOverlap(a, b) {
  const ap = String(a).split('/')
  const bp = String(b).split('/')
  const n = Math.min(ap.length, bp.length)
  for (let i = 0; i < n; i += 1) if (ap[i] !== bp[i]) return false
  return true
}

/**
 * Create the ledger. `stageGate` is asked before a stage change and may refuse; `maxOpenTasks` is a
 * machine limit (0 = unlimited).
 */
export function createTasks({
  stages = [],
  maxOpenTasks = 0,
  requireExpectedRevision = false,
  stageGate = () => ({ ok: true }),
  isPaused = () => false,
  bus = null,
  clock = () => new Date().toISOString(),
  // ROUND 10 / task-74 (A5): the LIVE settings view (or a plain object in tests). The one key this face reads is
  // `vmu.tasks.memberMayRejectAssign`, and it is read HERE rather than passed as a boolean snapshot for the same
  // reason every other face reads live: a runtime `vibe_vmu_set` must be visible to the next call, not next boot.
  settings = null,
} = {}) {
  const sget = (k, d) => {
    const s = settings
    if (!s || typeof s !== 'object') return d
    const v = typeof s.get === 'function' ? s.get(k) : s[k]
    return v === undefined ? d : v
  }
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

  // ROUND 318: the A/B found that a task update carried no revision at all, so two writers could lose one
  // another - v5r REQUIRES the revision the caller saw. The same idea already exists in this kernel (bid
  // revisions in bidding.js, staleness windows in capacity.js); here it is a precondition with a named refusal,
  // plus a switch (`vmu.tasks.requireExpectedRevision`) that can demand it. Default OFF keeps every existing
  // caller working; the refusal happens either way when a caller DOES state a revision and states a stale one.
  function requireFresh(t2, expected) {
    if (expected === undefined || expected === null) {
      if (requireExpectedRevision) {
        throw refuse('VMU_TASK_STALE_REVISION', 'this face requires the revision you saw: task ' + t2.id + ' is at revision ' + t2.revision,
          'pass { expectedRevision: ' + t2.revision + ' } (vmu.tasks.requireExpectedRevision=true)')
      }
      return
    }
    if (Number(expected) !== t2.revision) {
      throw refuse('VMU_TASK_STALE_REVISION', 'stale write refused: task ' + t2.id + ' is at revision ' + t2.revision + ', you expected ' + Number(expected),
        're-read the task and retry with the current revision - a stale write is refused by name, never merged')
    }
  }
  function bump(t2) { t2.revision += 1 }

  const openCount = () => [...tasks.values()].filter((t) => t.state !== 'done' && t.state !== 'cancelled').length

  const unmetDeps = (t) => t.deps.filter((d) => {
    const dep = tasks.get(d)
    return !dep || dep.state !== 'done'
  })

  /**
   * F35: refuse a dependency edge set that would close a cycle. `findDependencyCycle` (module scope, exported)
   * does the walk; this only turns its answer into the face's named refusal.
   */
  const cycleRefusal = (id, cycle) => refuse('VMU_TASK_DEPENDENCY_CYCLE',
    'dependency cycle: ' + cycle.join(' -> '),
    'remove one of these edges so the graph stays a DAG; the cycle is ' + JSON.stringify(cycle),
    { id: String(id), cycle })

  /** Normalise a caller's list, REPORTING what was dropped (a silently dropped scope is a silent policy change). */
  function normalizeScopes(raw) {
    const kept = []
    const skipped = []
    for (const item of (Array.isArray(raw) ? raw : [])) {
      const n = normalizeWriteScope(item)
      if (n === undefined) { skipped.push({ what: String(item), why: 'empty, absolute, drive-lettered or containing a . or .. segment' }); continue }
      if (kept.indexOf(n) === -1) kept.push(n)
    }
    return { scopes: kept, skipped }
  }
  /** The ADVISORY view: which live tasks declare overlapping write scopes. Never refuses anything. */
  function writeScopeConflicts() {
    const live = [...tasks.values()].filter((t) => t.state !== 'done' && t.state !== 'cancelled' && Array.isArray(t.writeScopes) && t.writeScopes.length)
    const out = []
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        for (const a of live[i].writeScopes) for (const b of live[j].writeScopes) {
          if (scopesOverlap(a, b)) out.push({ a: live[i].id, b: live[j].id, scopeA: a, scopeB: b })
        }
      }
    }
    return out
  }

  return {
    /** Declared stages (possibly none) and where the run stands. */
    stage() {
      return { current: stageIndex < 0 ? null : stages[stageIndex], index: stageIndex, stages: stages.slice(), declared: stages.length > 0 }
    },

    /** Create a task. Dependencies may name tasks that do not exist yet (they are checked at start). */
    async create({ title, objective = null, owner = null, deps = [], priority = 0, writeScopes = [] } = {}) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        throw refuse('VMU_INVALID_ARGUMENT', 'a task needs a non-empty title')
      }
      // CONTROL FLOW IS A GATE (docs/08 §5): a paused kernel does not accept new work, and says so by name.
      if (isPaused()) throw refuse('VMU_STATE', 'the kernel is paused: no new task is accepted',
        'resume() first (vibe_vmu_control {action:"resume"}); a pause that does not block work is a label, not control')
      if (maxOpenTasks > 0 && openCount() >= maxOpenTasks) {
        throw refuse('VMU_RESOURCE_BUDGET', 'open tasks at the ceiling: ' + openCount() + '/' + maxOpenTasks,
          'vmu.tasks.maxOpenTasks is machine-enforced (docs/04 §11)')
      }
      const id = 't-' + (++seq)
      // The durable counter tracks the highest id this process ever minted, so a restart that hydrates from the
      // projection can reconcile it with reality (never reusing a name).
      observeIds('task', [id])
      const depList = Array.isArray(deps) ? deps.map(String) : []
      // F35: a self-loop is constructible at creation (a caller may name the id it is about to get), so the same
      // DAG guard runs here as in setDependencies.
      const cycle = findDependencyCycle(id, depList, (x) => { const known = tasks.get(String(x)); return known ? known.deps : null })
      if (cycle) throw cycleRefusal(id, cycle)
      const scopeNorm = normalizeScopes(writeScopes)
      const t = { id, title: String(title), objective: objective === null ? null : String(objective),
        owner: owner === null ? null : String(owner), deps: depList, writeScopes: scopeNorm.scopes,
        priority, state: owner ? 'assigned' : 'open', createdAt: clock(), transitions: [], revision: 1 }
      tasks.set(id, t)
      record('task-created', { id, title: t.title, deps: t.deps.slice(), owner: t.owner, writeScopes: t.writeScopes.slice() })
      return { ok: true, id, state: t.state, deps: t.deps.slice(), writeScopes: t.writeScopes.slice(), skippedScopes: scopeNorm.skipped }
    },

    /**
     * F35 (Round 5): replace a task's dependency edges. This is the mutation path where a REAL cycle can be
     * introduced (t-1 -> t-2 while t-2 -> t-1), so the DAG guard runs here with the live graph and refuses BY
     * NAME with the cycle path. Compare-and-set like every other mutation: a stale revision is refused.
     */
    async setDependencies(id, deps, { expectedRevision = null } = {}) {
      const t = task(id)
      requireFresh(t, expectedRevision)
      const nextDeps = (Array.isArray(deps) ? deps : []).map(String)
      const cycle = findDependencyCycle(t.id, nextDeps, (x) => { const known = tasks.get(String(x)); return known ? known.deps : null })
      if (cycle) throw cycleRefusal(t.id, cycle)
      const before = t.deps.slice()
      t.deps = nextDeps
      bump(t)
      record('task-deps-set', { id: t.id, from: before, to: t.deps.slice() })
      return { ok: true, id: t.id, deps: t.deps.slice(), revision: t.revision }
    },

    /**
     * ★★ CHANGE AN EXISTING TASK'S PRIORITY. Until now priority could only be set at CREATE time: `list()` sorts by it
     * (`(b.priority - a.priority)`), so the field mattered, but nothing could move an existing row - and a pack face
     * (`vibe_v5_prioritize`) therefore registered the absence in its NAMED GAPS and archived orders without applying them.
     * Measured on a full live run: an agent set priorities, read the board back, saw `current: null`, and reported the tool
     * as not working. It was right: the capability was missing from the kernel, which is where capability belongs.
     * ★ Same compare-and-set discipline as every other mutation here, so a stale view cannot silently overwrite a newer
     * revision, and the change is RECORDED rather than inferred from the final state.
     */
    async setPriority(id, priority, { expectedRevision = null, by = null } = {}) {
      const t = task(id)
      requireFresh(t, expectedRevision)
      const n = Number(priority)
      if (!Number.isFinite(n)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'setPriority needs a finite number, got ' + JSON.stringify(priority),
          'priority is a number; the board sorts DESC by it (kernel/tasks.js list())')
      }
      const before = t.priority
      t.priority = n
      bump(t)
      record('task-priority-set', { id: t.id, from: before, to: n, by })
      return { ok: true, id: t.id, priority: t.priority, previous: before, revision: t.revision }
    },

    /** F39: the advisory overlap view (read-only; never refuses anything). Read by `status().writeScopeConflicts`. */
    writeScopeConflicts,

    /** Assign (or reassign) an owner. Being assigned is a state, so it follows the transition table. */
    async assign(id, who, { expectedRevision = null } = {}) {
      const t = task(id)
      requireFresh(t, expectedRevision)
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
      bump(t)
      record('task-assigned', { id, who: t.owner, state: t.state })
      // ROUND 10 / task-74 (A5): the receipt says whether the assignee may OBJECT (v5r :9555-9562 records and
      // broadcasts an objection, and the task still runs). The declaration is read here as well as in
      // `objectAssign()` so a caller never has to guess which door is open.
      return { ok: true, id, owner: t.owner, state: t.state,
        mayObject: sget('vmu.tasks.memberMayRejectAssign', true) !== false,
        enforced: ['vmu.tasks.memberMayRejectAssign'] }
    },

    /**
     * ROUND 10 / task-74 (A5) — OBJECT TO AN ASSIGNMENT. v5r's `reject_assign` reply field (v5r :9555-9562): the
     * member says "I object to task X because …", the objection is recorded and broadcast to the voters, and the
     * task STILL RUNS (v5r's own wording: 任务仍会执行). This is NOT a refusal of the assignment - it is a voiced,
     * attributable dissent, which is why it is a separate verb rather than a `transition`.
     *
     * THE DECLARATION is `vmu.tasks.memberMayRejectAssign` (v5r :1066, default true). ★ MEASURED DIFFERENCE: v5r
     * DROPS the field silently when the declaration is false; here it is refused BY NAME - "the members may not
     * object" is a decision, and a silently swallowed objection is the state this repository forbids.
     *
     * The objection goes through the face's OWN append-only ledger (`record`), so it survives restart with the rest
     * of the history and is readable via `history()`. v5r ALSO broadcasts it, so the registered hook
     * `task/assign-objected` (kernel/bus.js: `failure:'open'`, NOT blockable - a broken listener cannot stop the
     * task) is emitted here; the middleware decides the audience.
     */
    async objectAssign(id, { by = null, why = null } = {}) {
      const t = task(id)
      const who = String(by || '').trim()
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'objectAssign needs by', 'the objecting member is recorded')
      if (sget('vmu.tasks.memberMayRejectAssign', true) === false) {
        throw refuse('VMU_NOT_PERMITTED', 'vmu.tasks.memberMayRejectAssign=false: members may not object to an assignment',
          'the declaration closes this door on purpose; the assignment stands as made',
          { enforced: ['vmu.tasks.memberMayRejectAssign'], id, by: who })
      }
      const reason = String(why === null || why === undefined ? '' : why)
      const at = clock()
      record('assign-objected', { id, by: who, why: reason, state: t.state, owner: t.owner })
      // ROUND 10 / task-74 (the broadcast half, Lead-assigned): v5r RECORDED and BROADCAST the objection while the
      // task still ran (v5r :9560). `task/assign-objected` is registered in kernel/bus.js with `failure:'open'` and
      // NOT blockable, so a broken listener cannot stop the task - and the middleware, not this face, decides the
      // audience (v5r broadcast to voters; a ledger face has no roster, so it does not invent a recipient list).
      const hasBus = !!(bus && typeof bus.emit === 'function')
      let decided = null
      if (hasBus) {
        try { decided = await bus.emit('task/assign-objected', { at, id, by: who, why: reason, state: t.state, owner: t.owner }, { member: who }) } catch (e) { decided = null }
      }
      return { ok: true, id, state: t.state, owner: t.owner, objection: { by: who, why: reason, at },
        broadcast: hasBus
          ? { attempted: true, hook: 'task/assign-objected', emitted: true,
            middleware: decided && decided.decisions ? decided.decisions.length : 0,
            audience: 'the middleware decides the audience (v5r broadcast to voters; this face has no roster, so it invents no recipient list)' }
          : { attempted: false, hook: 'task/assign-objected', emitted: false,
            reason: 'no bus seam is bound on this tasks face: the objection is on the ledger (history()) but nothing was broadcast' },
        enforced: ['vmu.tasks.memberMayRejectAssign'], fired: ['vmu.tasks.memberMayRejectAssign'],
        note: 'the task still runs (v5r :9560)' }
    },

    /** Transition. Dependencies are enforced when work STARTS, not when it is created. */
    async transition(id, to, { reason = null, expectedRevision = null } = {}) {
      const t = task(id)
      requireFresh(t, expectedRevision)
      if (!TASK_STATES.includes(to)) throw refuse('VMU_INVALID_ARGUMENT', 'unknown task state: ' + String(to), TASK_STATES.join(', '))
      // A pause also freezes transitions (finishing work is work); `settle/before` stays reachable because it
      // is a STAGE move, and a pause must not be a way to bypass the stage gate either way (docs/08 §5).
      if (isPaused()) throw refuse('VMU_STATE', 'the kernel is paused: task ' + id + ' cannot move to ' + String(to),
        'resume() first (vibe_vmu_control {action:"resume"})')
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
      bump(t)
      record('task-transition', { id, from, to, reason })
      return { ok: true, id, from, to }
    },

    /** The ledger, filtered. Never carries the brief text (that is fetched by id, docs/08). */
    list(filter = {}) {
      return [...tasks.values()]
        .filter((t) => (filter.state === undefined || t.state === filter.state) &&
          (filter.owner === undefined || t.owner === filter.owner) &&
          (filter.ready === undefined || (filter.ready ? (t.state === 'open' || t.state === 'assigned') && unmetDeps(t).length === 0 : true)))
        .sort((a, b) => (b.priority - a.priority) || a.id.localeCompare(b.id))
        .map((t) => ({ id: t.id, title: t.title, state: t.state, owner: t.owner, revision: t.revision, deps: t.deps.slice(),
          ready: unmetDeps(t).length === 0, hasBrief: briefs.has(t.id),
          // F39: advisory only - visible so a colleague can see what someone else says they will touch.
          writeScopes: Array.isArray(t.writeScopes) ? t.writeScopes.slice() : [] }))
    },

    /** Attach a task brief: the prompt fragment injected when the OWNER is woken (docs/08; the fragment side is docs/06). */
    brief(id, text, { by = null, expectedRevision = null } = {}) {
      requireFresh(task(id), expectedRevision)
      if (typeof text !== 'string' || text.trim().length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'a brief needs non-empty text')
      const previous = briefs.get(id) || null
      briefs.set(id, { text, by, at: clock() })
      bump(task(id))
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
    clearBrief(id, { expectedRevision = null } = {}) {
      requireFresh(task(id), expectedRevision)
      const previous = briefs.get(id) || null
      briefs.delete(id)
      bump(task(id))
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
        // F35/F39 (Round 5): the two graph guarantees, stated as facts an operator can read.
        dag: 'dependency cycles are refused at create/setDependencies (VMU_TASK_DEPENDENCY_CYCLE with the cycle path)',
        writeScopes: 'advisory only: declared by the task creator, never enforced; overlaps are listed below',
        writeScopeConflicts: writeScopeConflicts(),
      }
    },

    history() { return history.map((h) => Object.assign({}, h)) },

    /**
     * A pure snapshot of the board (docs/07 §4). It carries NO host seam (bus/clock/isPaused are injected) and
     * nothing derived from settings: those are re-established by the kernel, not restored from disk.
     */
    snapshot() {
      const ids = [...tasks.keys()]
      return {
        apiVersion: 1, face: 'tasks', v: 1, at: clock(),
        data: {
          tasks: [...tasks.values()].map((t) => JSON.parse(JSON.stringify(t))),
          history: history.map((h) => Object.assign({}, h)),
          briefs: [...briefs.entries()].map(([id, b]) => [id, JSON.parse(JSON.stringify(b))]),
          stageIndex,
          stages: stages.slice(),
        },
        counters: { task: ids.reduce((mx, id) => Math.max(mx, idNumber(id) || 0), seq) },
        skipped: [],
      }
    },

    /**
     * Put a board back. Idempotent for the same snapshot; a DIFFERENT snapshot is refused while this ledger
     * already holds tasks unless the caller asks for a replace — a silent half-overwrite is the failure this
     * refusal exists to prevent.
     */
    restore(snap, { replace = false } = {}) {
      const checked = checkSnapshot('tasks', snap, ['tasks', 'history', 'briefs'])
      const incoming = Array.isArray(snap.data.tasks) ? snap.data.tasks : []
      if (tasks.size > 0 && !replace) {
        const same = JSON.stringify([...tasks.values()]) === JSON.stringify(incoming)
        if (same) return { ok: true, restored: [], skipped: [], idempotent: true, counters: { task: seq } }
        throw refuse('VMU_RESUME_RESTORE_CONFLICT', 'this ledger already holds ' + tasks.size + ' task(s): restoring a different snapshot needs { replace: true }',
          'stop/clear the ledger first, or pass { replace: true } deliberately - a silent half-overwrite is refused by name')
      }
      const skipped = []
      tasks.clear()
      for (const t of incoming) {
        if (!t || typeof t.id !== 'string') { skipped.push({ what: 'tasks[]', why: 'an entry without a string id' }); continue }
        tasks.set(t.id, JSON.parse(JSON.stringify(t)))
      }
      history.length = 0
      for (const h of (Array.isArray(snap.data.history) ? snap.data.history : [])) history.push(Object.assign({}, h))
      briefs.clear()
      for (const pair of (Array.isArray(snap.data.briefs) ? snap.data.briefs : [])) {
        if (!Array.isArray(pair) || pair.length !== 2) { skipped.push({ what: 'briefs[]', why: 'not a [id, brief] pair' }); continue }
        briefs.set(String(pair[0]), JSON.parse(JSON.stringify(pair[1])))
      }
      if (Number.isInteger(snap.data.stageIndex) && snap.data.stageIndex >= -1 && snap.data.stageIndex < stages.length) stageIndex = snap.data.stageIndex
      else if (snap.data.stageIndex !== undefined) skipped.push({ what: 'stageIndex', why: 'out of range for the declared stage list (' + snap.data.stageIndex + ')' })
      // The id counter takes the MAX of the snapshot's counter and the ids that actually exist: this is what makes
      // "names are immortal" true across a restart.
      const declared = Number((checked.counters || {}).task)
      seq = Math.max(Number.isInteger(declared) ? declared : 0, [...tasks.keys()].reduce((mx, id) => Math.max(mx, idNumber(id) || 0), 0))
      observeIds('task', [...tasks.keys()])
      return { ok: true, restored: ['tasks', 'history', 'briefs', 'stageIndex'], skipped, counters: { task: seq } }
    },
  }
}
