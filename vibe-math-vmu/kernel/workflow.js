// vmu kernel workflow — stage whitelist, transition gates, dependencies, retries, checkpoints, escalation,
// handover, templates and the arbitration SWITCH. It reads the whole `vmu.workflow.*` family so that every
// declared key CHANGES AN OBSERVABLE RESULT (docs/08 §4/§10/§12.4/§19.5 — referenced, never redefined).
//
// Spec: docs/08-primitives-meeting-ballot-workflow.md §4 (workflow / task board / control flow), §10 (field
//       schema), §12.4 + §19.5 (the `vmu.workflow.*` family).
// Codes (03-§8, all already registered): VMU_WORKFLOW_TRANSITION_REQUIRED / STAGE_UNKNOWN / GATE_BLOCKED /
//       GATE_NOT_MET / TASK_UNKNOWN / ESCALATION_NOT_DUE / ESCALATION_TARGET_UNKNOWN / ARBITRATION_OFF /
//       CHECKPOINT_MISSING / COMPENSATION_FAILED / DEP_TYPE_UNSUPPORTED / RETRY_EXHAUSTED / SUBTASK_DEPTH /
//       TEMPLATE_UNKNOWN / RACI_MISSING_OWNER (+ the generic VMU_INVALID_ARGUMENT / VMU_STATE / VMU_NOT_PERMITTED).
//
// STANDARD (identical to kernel/mathtools.js and kernel/records.js):
//   ① every wired key changes an observable result;
//   ② every receipt carries `enforced[]` (the keys whose rule was EVALUATED for this call) and `fired[]` (the
//      keys that materially CHANGED the outcome) — deduplicated, so "read" ≠ "did something";
//   ③ every REFUSAL carries `enforced` too — always an ARRAY (possibly empty), never `undefined`;
//   ④ the keys that are NOT wired are named with a reason and the wired/unwired partition is asserted;
//   ⑤ the only time source is the injected clock (no Date.now, no randomness — retry jitter is derived from a
//      content hash); READ paths never mutate; zero config never throws on reads.
//
// WHAT IT IS NOT: it does not define arbitration (17-§6), the handover note BODY (17-§11), the durable store
// (07) or the idempotency ledger (K6, kernel/idempotency.js) — it CONFIGURES them and references their keys.

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const apiVersion = 1

export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  err.hint = hint
  if (extra) Object.assign(err, extra)
  return err
}

/** The 23 keys docs/08 §19.5 declares as planned (the partition the standard requires). */
export const DECLARED_KEYS = Object.freeze([
  'vmu.workflow.depTypes', 'vmu.workflow.softDepsEnforced', 'vmu.workflow.stageGateMode', 'vmu.workflow.gateKinds',
  'vmu.workflow.retryMax', 'vmu.workflow.retryBaseMs', 'vmu.workflow.retryCapMs', 'vmu.workflow.retryJitterRatio',
  'vmu.workflow.taskTimeoutMs', 'vmu.workflow.checkpointEveryMs', 'vmu.workflow.compensationMode',
  'vmu.workflow.subtaskDepthMax', 'vmu.workflow.parentDoneRule', 'vmu.workflow.priorityClasses',
  'vmu.workflow.dueWarnBeforeMs', 'vmu.workflow.escalationAfterMs', 'vmu.workflow.escalationTarget',
  'vmu.workflow.arbitrationMode', 'vmu.workflow.claimRequired', 'vmu.workflow.handoverNote',
  'vmu.workflow.idempotencyKeyScope', 'vmu.workflow.templateDefault', 'vmu.workflow.templates',
])

/** Every declared key this module honours (all 23 — see tests/vmu-workflow.test.mjs). */
export const WIRED_KEYS = Object.freeze(DECLARED_KEYS.slice())

/** Per-key reasons for the declared keys NOT wired yet (empty ⇒ all 23 are wired; stated, not implied). */
export const UNWIRED_REASONS = Object.freeze({})

/** Registered core keys (settings/schema.js) this module ALSO honours — reported separately (not among the 23). */
export const EXTRA_WIRED_KEYS = Object.freeze([
  'vmu.workflow.requireEvidence', 'vmu.workflow.requireAssignee', 'vmu.workflow.gateOnOpenTasks', 'vmu.workflow.reopenPolicy',
])

const DEFAULT_STAGES = Object.freeze(['open', 'claimed', 'in-progress', 'review', 'done'])
const DEP_TYPES = Object.freeze(['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish'])
const TERMINAL = Object.freeze(['done', 'closed', 'cancelled'])
const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const numOr = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const boolOr = (v, d) => (typeof v === 'boolean' ? v : d)
const listOr = (v, d) => (Array.isArray(v) && v.length ? v.filter((x) => typeof x === 'string' && x) : d)

const DEFAULTS = Object.freeze({
  'vmu.workflow.requireEvidence': true,
  'vmu.workflow.requireAssignee': true,
  'vmu.workflow.gateOnOpenTasks': false,
  'vmu.workflow.reopenPolicy': 'deny',
  'vmu.workflow.depTypes': ['finish-to-start'],
  'vmu.workflow.softDepsEnforced': false,
  'vmu.workflow.stageGateMode': 'refuse',
  'vmu.workflow.gateKinds': ['entry', 'exit'],
  'vmu.workflow.retryMax': 0,
  'vmu.workflow.retryBaseMs': 1000,
  'vmu.workflow.retryCapMs': 60000,
  'vmu.workflow.retryJitterRatio': 0.2,
  'vmu.workflow.taskTimeoutMs': 0,
  'vmu.workflow.checkpointEveryMs': 0,
  'vmu.workflow.compensationMode': 'manual',
  'vmu.workflow.subtaskDepthMax': 2,
  'vmu.workflow.parentDoneRule': 'all-terminal',
  'vmu.workflow.priorityClasses': ['low', 'normal', 'high'],
  'vmu.workflow.dueWarnBeforeMs': 0,
  'vmu.workflow.escalationAfterMs': 0,
  'vmu.workflow.escalationTarget': 'office',
  'vmu.workflow.arbitrationMode': 'off',
  'vmu.workflow.claimRequired': false,
  'vmu.workflow.handoverNote': true,
  'vmu.workflow.idempotencyKeyScope': 'session',
  'vmu.workflow.templateDefault': '',
  'vmu.workflow.templates': [],
})

/**
 * Create the workflow service.
 * `tasks` is optional (when injected it must expose `openCount()` or `list()`); `idempotency` is the OPTIONAL
 * K6 seam (kernel/idempotency.js) whose `begin()` is called with the configured scope — referenced, not wrapped.
 */
export function createWorkflow({ clock = () => 0, log = () => {}, settings = {}, bus = null, tasks = null, listCap = 100, idempotency = null } = {}) {
  let def = null                       // { stages, transitions, gates, dependencies }
  const state = new Map()              // taskId -> { stage, by, evidence[], updatedAt, startedAt, escalatedAt, reopened, priority, parent, attempts, checkpoints[], lastCheckpointAt }
  const templates = new Map()          // templateId -> template object
  const compensations = new Map()      // name -> fn
  const refusals = new Map()
  const counters = { advances: 0, refusals: 0, retries: 0, checkpoints: 0, escalations: 0, handovers: 0, instantiations: 0, spawns: 0, compensations: 0, arbitrations: 0 }
  const history = []
  let historyDropped = 0

  const sget = (key) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? DEFAULTS[key] : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return DEFAULTS[key]
  }
  const cfg = () => ({
    // core (registered) keys
    requireEvidence: boolOr(sget('vmu.workflow.requireEvidence'), DEFAULTS['vmu.workflow.requireEvidence']),
    requireAssignee: boolOr(sget('vmu.workflow.requireAssignee'), DEFAULTS['vmu.workflow.requireAssignee']),
    gateOnOpenTasks: boolOr(sget('vmu.workflow.gateOnOpenTasks'), DEFAULTS['vmu.workflow.gateOnOpenTasks']),
    reopenPolicy: sget('vmu.workflow.reopenPolicy') || DEFAULTS['vmu.workflow.reopenPolicy'],
    // the declared family
    depTypes: listOr(sget('vmu.workflow.depTypes'), DEFAULTS['vmu.workflow.depTypes']),
    softDepsEnforced: boolOr(sget('vmu.workflow.softDepsEnforced'), DEFAULTS['vmu.workflow.softDepsEnforced']),
    stageGateMode: sget('vmu.workflow.stageGateMode') === 'advisory' ? 'advisory' : 'refuse',
    gateKinds: listOr(sget('vmu.workflow.gateKinds'), DEFAULTS['vmu.workflow.gateKinds']),
    retryMax: intOr(sget('vmu.workflow.retryMax'), DEFAULTS['vmu.workflow.retryMax']),
    retryBaseMs: intOr(sget('vmu.workflow.retryBaseMs'), DEFAULTS['vmu.workflow.retryBaseMs']),
    retryCapMs: intOr(sget('vmu.workflow.retryCapMs'), DEFAULTS['vmu.workflow.retryCapMs']),
    retryJitterRatio: Math.min(1, Math.max(0, numOr(sget('vmu.workflow.retryJitterRatio'), DEFAULTS['vmu.workflow.retryJitterRatio']))),
    taskTimeoutMs: intOr(sget('vmu.workflow.taskTimeoutMs'), DEFAULTS['vmu.workflow.taskTimeoutMs']),
    checkpointEveryMs: intOr(sget('vmu.workflow.checkpointEveryMs'), DEFAULTS['vmu.workflow.checkpointEveryMs']),
    compensationMode: sget('vmu.workflow.compensationMode') === 'registered' ? 'registered' : 'manual',
    subtaskDepthMax: intOr(sget('vmu.workflow.subtaskDepthMax'), DEFAULTS['vmu.workflow.subtaskDepthMax']),
    parentDoneRule: sget('vmu.workflow.parentDoneRule') === 'any-terminal' ? 'any-terminal' : 'all-terminal',
    priorityClasses: listOr(sget('vmu.workflow.priorityClasses'), DEFAULTS['vmu.workflow.priorityClasses']),
    dueWarnBeforeMs: intOr(sget('vmu.workflow.dueWarnBeforeMs'), DEFAULTS['vmu.workflow.dueWarnBeforeMs']),
    escalationAfterMs: intOr(sget('vmu.workflow.escalationAfterMs'), DEFAULTS['vmu.workflow.escalationAfterMs']),
    escalationTarget: sget('vmu.workflow.escalationTarget') === undefined ? DEFAULTS['vmu.workflow.escalationTarget'] : sget('vmu.workflow.escalationTarget'),
    arbitrationMode: sget('vmu.workflow.arbitrationMode') === 'on' ? 'on' : 'off',
    claimRequired: boolOr(sget('vmu.workflow.claimRequired'), DEFAULTS['vmu.workflow.claimRequired']),
    handoverNote: boolOr(sget('vmu.workflow.handoverNote'), DEFAULTS['vmu.workflow.handoverNote']),
    idempotencyKeyScope: sget('vmu.workflow.idempotencyKeyScope') === 'durable' ? 'durable' : 'session',
    templateDefault: typeof sget('vmu.workflow.templateDefault') === 'string' ? sget('vmu.workflow.templateDefault') : '',
    templates: Array.isArray(sget('vmu.workflow.templates')) ? sget('vmu.workflow.templates') : [],
  })

  const uniq = (arr) => [...new Set(arr)].sort()
  const say = (row) => { try { if (typeof log === 'function') log(row) } catch (e) { /* logging never breaks the flow */ } }
  const remember = (row) => { history.push(Object.assign({ at: clock() }, row)); while (history.length > 200) { history.shift(); historyDropped += 1 } }
  /**
   * Refuse BY NAME and report the keys EVALUATED so far (`enforced`) — always an array, deduplicated (standard
   * ②③). The refusal is counted by code and audited, so the rejection path is as inspectable as the happy path.
   */
  const deny = (code, message, hint, extra, enforced = []) => {
    const list = uniq(Array.isArray(enforced) ? enforced : [])
    refusals.set(code, (refusals.get(code) || 0) + 1)
    counters.refusals += 1
    say({ type: 'workflow/refused', at: clock(), code, message, enforced: list })
    return refuse(code, message, hint, Object.assign({}, extra, { enforced: list }))
  }
  const receipt = (obj, enforced, fired) => Object.assign({}, obj, { enforced: uniq(enforced), fired: uniq(fired) })

  const allowFrom = (from) => (def ? def.transitions.filter((t) => t.from === from).map((t) => t.to) : [])
  const has = (taskId) => state.has(taskId)
  const terminal = (taskId) => { const s = state.get(taskId); return !!s && TERMINAL.includes(s.stage) }
  const childrenOf = (taskId) => [...state.entries()].filter(([, s]) => s.parent === taskId).map(([id]) => id)
  const depthOf = (taskId) => { let d = 0; let cur = state.get(taskId); while (cur && cur.parent) { d += 1; cur = state.get(cur.parent) } return d }
  const openCount = () => {
    if (!tasks) return null
    try {
      if (typeof tasks.openCount === 'function') return intOr(tasks.openCount(), null)
      if (typeof tasks.list === 'function') { const l = tasks.list(); const items = Array.isArray(l) ? l : (l && l.items) || []; return items.filter((t) => t && t.state !== 'done' && t.state !== 'closed').length }
    } catch { return null }
    return null
  }
  /** Deterministic pseudo-jitter (NO randomness): derived from sha-like content hash of taskId + attempt. */
  const jitter = (taskId, attempt, ratio) => {
    if (!(ratio > 0)) return 0
    let h = 2166136261
    const text = String(taskId) + '#' + attempt
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
    const unit = (h % 1000) / 1000                    // 0..0.999
    return Math.round((unit * 2 - 1) * ratio * 1000)  // ±ratio·1000 ms, deterministic
  }
  const depList = () => (def && Array.isArray(def.dependencies) ? def.dependencies : [])
  /** Evaluate dependencies for a task: hard ones always matter, soft ones only when enforced. */
  const depCheck = (taskId) => {
    const c = cfg()
    const enforced = ['vmu.workflow.depTypes']
    const fired = []
    const blocking = []
    const advisory = []
    for (const d of depList()) {
      if (d.to !== taskId) continue
      const met = terminal(d.from)
      if (met) continue
      if (d.soft && !c.softDepsEnforced) { advisory.push(d.from); fired.push('vmu.workflow.softDepsEnforced'); continue }
      blocking.push(d.from)
    }
    if (blocking.length) fired.push('vmu.workflow.depTypes')
    return { blocking, advisory, enforced, fired }
  }
  /** The gate for a task: missing[] names exactly WHAT is missing (evidence keys are named individually). */
  const gateCheck = (taskId) => {
    const c = cfg()
    const s = state.get(taskId)
    const missing = []
    const labels = []
    if (c.requireAssignee && !(s && s.by)) { missing.push('assignee'); labels.push('vmu.workflow.requireAssignee') }
    if (c.requireEvidence && !(s && s.evidence && s.evidence.length)) { missing.push('evidence'); labels.push('vmu.workflow.requireEvidence') }
    if (c.gateOnOpenTasks) { const n = openCount(); labels.push('vmu.workflow.gateOnOpenTasks'); if (n === null) missing.push('task-source'); else if (n > 0) missing.push('open-tasks:' + n) }
    if (def && def.gates && def.gates[taskId]) {
      const need = def.gates[taskId]
      const keys = Array.isArray(need) ? need : (Array.isArray(need.need) ? need.need : [])
      for (const k of keys) {
        labels.push('vmu.workflow.requireEvidence')
        if (!(s && s.evidence && s.evidence.some((e) => String(e).includes(k)))) missing.push('evidence:' + k)
      }
    }
    return { ok: missing.length === 0, missing, labels }
  }
  const timedOut = (taskId) => {
    const c = cfg()
    const s = state.get(taskId)
    if (!s || c.taskTimeoutMs <= 0) return false
    return clock() - s.startedAt > c.taskTimeoutMs
  }
  const view = (taskId, { enforced = [], fired = [] } = {}) => {
    const s = state.get(taskId)
    if (!s) throw deny('VMU_WORKFLOW_TASK_UNKNOWN', 'no workflow state for task ' + String(taskId), 'advance() the task first; this view only reads existing state', { taskId }, [])
    const c = cfg()
    const out = {
      taskId, stage: s.stage, by: s.by, evidence: s.evidence.slice(), updatedAt: s.updatedAt, startedAt: s.startedAt,
      allowedNext: allowFrom(s.stage), priority: s.priority, parent: s.parent, depth: depthOf(taskId),
      attempts: s.attempts, children: childrenOf(taskId), timedOut: timedOut(taskId),
      lastCheckpointAt: s.lastCheckpointAt, escalatedAt: s.escalatedAt, reopened: s.reopened,
    }
    return receipt(out, enforced, fired)
  }

  /** Define (or redefine) the workflow: stages are a whitelist, transitions the only legal moves. */
  function define({ stages = DEFAULT_STAGES, transitions = [], gates = {}, dependencies = [] } = {}) {
    const enforced = ['vmu.workflow.depTypes', 'vmu.workflow.gateKinds']
    const fired = []
    const list = Array.isArray(stages) && stages.length ? stages.slice() : DEFAULT_STAGES.slice()
    const tx = (Array.isArray(transitions) ? transitions : []).map((t) => ({ from: t.from, to: t.to, name: t.name || (t.from + '->' + t.to) }))
    for (const t of tx) {
      if (!list.includes(t.from) || !list.includes(t.to)) {
        fired.push('vmu.workflow.gateKinds')
        throw deny('VMU_WORKFLOW_STAGE_UNKNOWN', 'transition references an undeclared stage: ' + t.from + '->' + t.to, 'declare the stage in `stages` first', { stages: list }, enforced)
      }
    }
    const c = cfg()
    const deps = []
    for (const d of (Array.isArray(dependencies) ? dependencies : [])) {
      // dependencies connect TASK ids (evaluated at advance() time): only the shape and the TYPE are checked here
      if (!d || typeof d.from !== 'string' || !d.from || typeof d.to !== 'string' || !d.to) {
        fired.push('vmu.workflow.depTypes')
        throw deny('VMU_INVALID_ARGUMENT', 'a dependency needs non-empty `from` and `to` task ids', 'dependencies connect TASK ids, not stage names (the type is governed by vmu.workflow.depTypes)', { dependency: d }, enforced)
      }
      const type = d.type === undefined ? c.depTypes[0] : d.type
      if (!c.depTypes.includes(type)) {
        fired.push('vmu.workflow.depTypes')
        throw deny('VMU_WORKFLOW_DEP_TYPE_UNSUPPORTED', 'dependency type "' + String(type) + '" is not allowed (vmu.workflow.depTypes)', 'allowed: ' + c.depTypes.join(', '), { from: d.from, to: d.to, type, allowed: c.depTypes.slice() }, enforced)
      }
      deps.push({ from: d.from, to: d.to, type, soft: d.soft === true })
    }
    const gateSpec = {}
    for (const [taskId, g] of Object.entries(gates || {})) {
      const kind = g && typeof g === 'object' && !Array.isArray(g) ? (g.kind === undefined ? 'entry' : g.kind) : 'entry'
      if (!c.gateKinds.includes(kind)) {
        fired.push('vmu.workflow.gateKinds')
        throw deny('VMU_WORKFLOW_GATE_NOT_MET', 'gate kind "' + String(kind) + '" is not allowed (vmu.workflow.gateKinds)', 'allowed kinds: ' + c.gateKinds.join(', '), { taskId, kind, allowed: c.gateKinds.slice() }, enforced)
      }
      gateSpec[taskId] = g
    }
    def = { stages: list, transitions: tx, gates: gateSpec, dependencies: deps }
    remember({ type: 'workflow/defined', stages: list.length, transitions: tx.length, dependencies: deps.length })
    return receipt({ stages: list.slice(), transitions: tx.map((t) => t.name), dependencies: deps.map((d) => d.from + '->' + d.to + (d.soft ? '(soft)' : '')), gateKinds: c.gateKinds.slice() }, enforced, fired)
  }

  /** Read-only: current stage of a task (named refusal when the task has no workflow state). */
  function stage({ taskId } = {}) {
    const s = state.get(taskId)
    if (!s) throw deny('VMU_WORKFLOW_TASK_UNKNOWN', 'no workflow state for task ' + String(taskId), 'advance() the task first; stage() only reads existing state', { taskId }, [])
    const enforced = ['vmu.workflow.taskTimeoutMs']
    const fired = timedOut(taskId) ? ['vmu.workflow.taskTimeoutMs'] : []
    return view(taskId, { enforced, fired })
  }

  /** Move a task to `to`: whitelisted, gated (deps + gates), no skipping, timeout-aware. */
  function advance({ taskId, to, by = null, evidence = null, priority = null, parent = null } = {}) {
    const enforced = []
    const fired = []
    const c = cfg()
    enforced.push('vmu.workflow.taskTimeoutMs', 'vmu.workflow.depTypes', 'vmu.workflow.softDepsEnforced', 'vmu.workflow.stageGateMode', 'vmu.workflow.priorityClasses', 'vmu.workflow.subtaskDepthMax', 'vmu.workflow.parentDoneRule')
    if (!def) {
      fired.push('vmu.workflow.stageGateMode')
      throw deny('VMU_WORKFLOW_TRANSITION_REQUIRED', 'no workflow defined: cannot advance ' + String(taskId), 'call define({stages,transitions}) first', { taskId, to }, enforced)
    }
    if (!def.stages.includes(to)) {
      fired.push('vmu.workflow.gateKinds')
      throw deny('VMU_WORKFLOW_STAGE_UNKNOWN', 'unknown stage: ' + String(to), 'declared stages: ' + def.stages.join('|'), { taskId, to, stages: def.stages.slice() }, enforced)
    }
    if (priority !== null && !c.priorityClasses.includes(priority)) {
      fired.push('vmu.workflow.priorityClasses')
      throw deny('VMU_INVALID_ARGUMENT', 'priority "' + String(priority) + '" is not in vmu.workflow.priorityClasses', 'allowed: ' + c.priorityClasses.join(', '), { taskId, priority, allowed: c.priorityClasses.slice() }, enforced)
    }
    const s = state.get(taskId)
    if (!s) {
      if (to !== def.stages[0]) {
        fired.push('vmu.workflow.stageGateMode')
        throw deny('VMU_WORKFLOW_TRANSITION_REQUIRED', 'a new task must start at ' + def.stages[0] + ', not ' + to, 'allowed next: ' + def.stages[0], { taskId, to, from: null, allowedNext: [def.stages[0]] }, enforced)
      }
      if (parent !== null) {
        if (!state.has(parent)) throw deny('VMU_WORKFLOW_TASK_UNKNOWN', 'unknown parent task: ' + String(parent), 'create the parent first', { taskId, parent }, enforced)
        const childDepth = depthOf(parent) + 1
        enforced.push('vmu.workflow.subtaskDepthMax')
        if (c.subtaskDepthMax > 0 && childDepth > c.subtaskDepthMax) {
          fired.push('vmu.workflow.subtaskDepthMax')
          throw deny('VMU_WORKFLOW_SUBTASK_DEPTH', 'subtask depth ' + childDepth + '/' + c.subtaskDepthMax + ' exceeded for ' + taskId + ' (vmu.workflow.subtaskDepthMax)', 'flatten the breakdown, or raise vmu.workflow.subtaskDepthMax', { taskId, parent, depth: childDepth, limit: c.subtaskDepthMax }, enforced)
        }
        counters.spawns += 1
      }
      state.set(taskId, {
        stage: to, by: by, evidence: evidence ? [String(evidence)] : [], updatedAt: clock(), startedAt: clock(),
        escalatedAt: null, reopened: 0, priority: priority === null ? c.priorityClasses[Math.min(1, c.priorityClasses.length - 1)] : priority,
        parent: parent === null ? null : parent, attempts: 0, checkpoints: [], lastCheckpointAt: null,
      })
      counters.advances += 1
      remember({ type: 'workflow/advance', taskId, to, by, created: true })
      if (bus && typeof bus.emit === 'function') bus.emit('workflow/advance', { taskId, to, by })
      return view(taskId, { enforced, fired })
    }
    const allowed = allowFrom(s.stage)
    if (!allowed.includes(to)) {
      fired.push('vmu.workflow.stageGateMode')
      throw deny('VMU_WORKFLOW_TRANSITION_REQUIRED', 'illegal transition ' + s.stage + '->' + to + (def.stages.indexOf(to) > def.stages.indexOf(s.stage) + 1 ? ' (stage skipping is not allowed)' : ''),
        'allowed from ' + s.stage + ': ' + (allowed.length ? allowed.join('|') : '(terminal stage)'), { taskId, from: s.stage, to, allowedNext: allowed.slice() }, enforced)
    }
    if (timedOut(taskId)) {
      fired.push('vmu.workflow.taskTimeoutMs')
      throw deny('VMU_STATE', 'task ' + taskId + ' timed out: ' + (clock() - s.startedAt) + 'ms > ' + c.taskTimeoutMs + 'ms (vmu.workflow.taskTimeoutMs)',
        'raise vmu.workflow.taskTimeoutMs, or advance/reset the task before the deadline', { taskId, ageMs: clock() - s.startedAt, limitMs: c.taskTimeoutMs }, enforced)
    }
    if (c.claimRequired && !s.by && !by) {
      fired.push('vmu.workflow.claimRequired')
      throw deny('VMU_WORKFLOW_GATE_BLOCKED', 'claim required before advancing ' + taskId, 'pass by:<member> to claim this task (vmu.workflow.claimRequired)', { taskId, missing: ['claim'] }, enforced)
    }
    const deps = depCheck(taskId)
    enforced.push(...deps.enforced)
    fired.push(...deps.fired)
    if (deps.blocking.length) {
      fired.push('vmu.workflow.depTypes')
      throw deny('VMU_WORKFLOW_GATE_BLOCKED', 'dependencies not met for ' + taskId + ' -> ' + to + ': waiting for ' + deps.blocking.join(', '),
        'finish ' + deps.blocking.join(' / ') + ' first (vmu.workflow.depTypes / vmu.workflow.softDepsEnforced)', { taskId, to, blockedBy: deps.blocking.slice() }, enforced)
    }
    const g = gateCheck(taskId)
    enforced.push(...g.labels)
    if (!g.ok) {
      fired.push('vmu.workflow.stageGateMode')
      if (c.stageGateMode === 'refuse') {
        throw deny('VMU_WORKFLOW_GATE_BLOCKED', 'gate not satisfied for ' + taskId + ' -> ' + to + ': missing ' + g.missing.join(', '),
          'provide ' + g.missing.join(' / ') + ' before advancing (vmu.workflow.stageGateMode=refuse)', { taskId, to, missing: g.missing.slice() }, enforced)
      }
    }
    if (TERMINAL.includes(to)) {
      const kids = childrenOf(taskId)
      const unfinished = kids.filter((k) => !terminal(k))
      if (kids.length && unfinished.length) {
        enforced.push('vmu.workflow.parentDoneRule')
        const blocked = c.parentDoneRule === 'all-terminal' ? unfinished.length > 0 : unfinished.length === kids.length
        if (blocked) {
          fired.push('vmu.workflow.parentDoneRule')
          throw deny('VMU_WORKFLOW_GATE_BLOCKED', 'parent completion rule "' + c.parentDoneRule + '" not met for ' + taskId + ': unfinished children ' + unfinished.join(', '),
            'finish ' + (c.parentDoneRule === 'all-terminal' ? 'every' : 'at least one') + ' child first, or change vmu.workflow.parentDoneRule', { taskId, to, unfinished: unfinished.slice(), rule: c.parentDoneRule }, enforced)
        }
      }
    }
    if (to === def.stages[0] && s.stage !== def.stages[0]) {
      enforced.push('vmu.workflow.reopenPolicy')
      if (c.reopenPolicy === 'deny') {
        fired.push('vmu.workflow.reopenPolicy')
        throw deny('VMU_WORKFLOW_TRANSITION_REQUIRED', 'reopen denied by policy for ' + taskId, 'vmu.workflow.reopenPolicy=' + c.reopenPolicy, { taskId, from: s.stage, to }, enforced)
      }
      s.reopened += 1
    }
    s.stage = to
    if (by) s.by = by
    if (priority !== null) s.priority = priority
    if (evidence) s.evidence.push(String(evidence))
    s.updatedAt = clock()
    counters.advances += 1
    remember({ type: 'workflow/advance', taskId, to, by, advisory: g.ok ? [] : g.missing.slice() })
    if (bus && typeof bus.emit === 'function') bus.emit('workflow/advance', { taskId, to, by })
    const out = view(taskId, { enforced, fired })
    if (!g.ok && c.stageGateMode === 'advisory') {
      out.blocked = true
      out.advisory = g.missing.slice()
      out.gateMode = 'advisory'
      fired.push('vmu.workflow.stageGateMode')
      out.fired = uniq(fired)
    }
    if (deps.advisory.length) { out.softBlockedBy = deps.advisory.slice() }
    return out
  }

  /** gate(): read-only evaluation, never throws for a missing gate (names exactly what is missing). */
  function gate({ taskId } = {}) {
    if (!state.has(taskId)) throw deny('VMU_WORKFLOW_TASK_UNKNOWN', 'no workflow state for task ' + String(taskId), 'advance() the task first', { taskId }, [])
    const g = gateCheck(taskId)
    const c = cfg()
    const deps = depCheck(taskId)
    const enforced = ['vmu.workflow.requireEvidence', 'vmu.workflow.requireAssignee', 'vmu.workflow.gateOnOpenTasks', 'vmu.workflow.gateKinds', 'vmu.workflow.depTypes', 'vmu.workflow.softDepsEnforced', 'vmu.workflow.stageGateMode']
    const fired = []
    if (g.missing.includes('assignee')) fired.push('vmu.workflow.requireAssignee')
    if (g.missing.some((m) => String(m).startsWith('evidence'))) fired.push('vmu.workflow.requireEvidence')
    if (g.missing.some((m) => String(m).startsWith('open-tasks') || m === 'task-source')) fired.push('vmu.workflow.gateOnOpenTasks')
    if (deps.blocking.length) fired.push('vmu.workflow.depTypes')
    if (deps.advisory.length) fired.push('vmu.workflow.softDepsEnforced')
    return receipt({ taskId, ok: g.ok && deps.blocking.length === 0, missing: g.missing.slice(), blockedBy: deps.blocking.slice(), advisory: deps.advisory.slice(), gateMode: c.stageGateMode, policy: Object.assign({}, c) }, enforced, fired)
  }

  /** retry(): bounded by retryMax; the delay is exponential with a DETERMINISTIC jitter (no randomness). */
  function retry({ taskId, reason = '' } = {}) {
    const enforced = ['vmu.workflow.retryMax', 'vmu.workflow.retryBaseMs', 'vmu.workflow.retryCapMs', 'vmu.workflow.retryJitterRatio']
    const fired = []
    const s = state.get(taskId)
    if (!s) throw deny('VMU_WORKFLOW_TASK_UNKNOWN', 'no workflow state for task ' + String(taskId), 'advance() the task first', { taskId }, enforced)
    const c = cfg()
    if (c.retryMax <= 0 || s.attempts >= c.retryMax) {
      fired.push('vmu.workflow.retryMax')
      throw deny('VMU_WORKFLOW_RETRY_EXHAUSTED', 'retry not allowed for ' + taskId + ': ' + s.attempts + '/' + c.retryMax + ' attempts (vmu.workflow.retryMax)',
        c.retryMax <= 0 ? 'retries are disabled (vmu.workflow.retryMax=0) — set a positive limit to allow them' : 'the retry budget is exhausted; escalate instead', { taskId, attempts: s.attempts, limit: c.retryMax }, enforced)
    }
    s.attempts += 1
    const raw = c.retryBaseMs * Math.pow(2, s.attempts - 1)
    const capped = Math.min(raw, c.retryCapMs)
    if (raw > c.retryCapMs) fired.push('vmu.workflow.retryCapMs')
    const jit = jitter(taskId, s.attempts, c.retryJitterRatio)
    if (jit !== 0) fired.push('vmu.workflow.retryJitterRatio')
    const delayMs = Math.max(0, capped + jit)
    counters.retries += 1
    s.updatedAt = clock()
    remember({ type: 'workflow/retry', taskId, attempt: s.attempts, delayMs, reason })
    if (bus && typeof bus.emit === 'function') bus.emit('workflow/retry', { taskId, attempt: s.attempts, delayMs })
    return receipt({ taskId, attempt: s.attempts, limit: c.retryMax, baseMs: c.retryBaseMs, capMs: c.retryCapMs, jitterMs: jit, delayMs, nextRetryAt: clock() + delayMs, capped: raw > c.retryCapMs, reason }, enforced, fired)
  }

  /** checkpoint(): records a checkpoint; `checkpointEveryMs` decides when the NEXT one is automatic. */
  function checkpoint({ taskId, note = '' } = {}) {
    const enforced = ['vmu.workflow.checkpointEveryMs']
    const fired = []
    const s = state.get(taskId)
    if (!s) throw deny('VMU_WORKFLOW_TASK_UNKNOWN', 'no workflow state for task ' + String(taskId), 'advance() the task first', { taskId }, enforced)
    const c = cfg()
    const at = clock()
    if (s.lastCheckpointAt === null) fired.push('vmu.workflow.checkpointEveryMs')
    s.checkpoints.push({ at, note: String(note) })
    if (s.checkpoints.length > 20) s.checkpoints.shift()
    s.lastCheckpointAt = at
    counters.checkpoints += 1
    remember({ type: 'workflow/checkpoint', taskId, at })
    return receipt({ taskId, at, note: String(note), checkpoints: s.checkpoints.length, everyMs: c.checkpointEveryMs, nextDueAt: c.checkpointEveryMs > 0 ? at + c.checkpointEveryMs : null, automatic: c.checkpointEveryMs > 0 }, enforced, fired)
  }
  /** Read-only: is a checkpoint due? `checkpointEveryMs=0` means "never automatic" (disclosed). */
  function checkpointDue({ taskId } = {}) {
    const enforced = ['vmu.workflow.checkpointEveryMs']
    const s = state.get(taskId)
    if (!s) throw deny('VMU_WORKFLOW_TASK_UNKNOWN', 'no workflow state for task ' + String(taskId), 'advance() the task first', { taskId }, enforced)
    const c = cfg()
    if (c.checkpointEveryMs <= 0) return receipt({ taskId, due: false, everyMs: 0, automatic: false }, enforced, [])
    const since = s.lastCheckpointAt === null ? s.startedAt : s.lastCheckpointAt
    const due = clock() - since >= c.checkpointEveryMs
    return receipt({ taskId, due, everyMs: c.checkpointEveryMs, ageMs: clock() - since, automatic: true }, enforced, due ? ['vmu.workflow.checkpointEveryMs'] : [])
  }

  /** registerCompensation(): with `compensationMode=registered` only a REGISTERED action may compensate. */
  function registerCompensation({ name, action } = {}) {
    const enforced = ['vmu.workflow.compensationMode']
    if (typeof name !== 'string' || !name) throw deny('VMU_INVALID_ARGUMENT', 'registerCompensation needs a non-empty `name`', 'the name is what compensate() looks up', {}, enforced)
    if (typeof action !== 'function') throw deny('VMU_INVALID_ARGUMENT', 'registerCompensation needs an `action` function', 'pass the compensating action itself', { name }, enforced)
    compensations.set(name, action)
    return receipt({ name, registered: compensations.size, mode: cfg().compensationMode }, enforced, ['vmu.workflow.compensationMode'])
  }
  /** compensate(): manual or registered, per `compensationMode` (a failure is never silent). */
  function compensate({ taskId, reason = '', action = null } = {}) {
    const enforced = ['vmu.workflow.compensationMode']
    const fired = []
    const s = state.get(taskId)
    if (s === undefined && taskId !== undefined && taskId !== null && !state.has(taskId)) {
      throw deny('VMU_WORKFLOW_TASK_UNKNOWN', 'no workflow state for task ' + String(taskId), 'advance() the task first', { taskId }, enforced)
    }
    const c = cfg()
    if (c.compensationMode === 'registered') {
      fired.push('vmu.workflow.compensationMode')
      const fn = action === null ? null : compensations.get(action)
      if (!fn) {
        throw deny('VMU_WORKFLOW_COMPENSATION_FAILED', 'compensation action "' + String(action) + '" is not registered (vmu.workflow.compensationMode=registered)',
          'registered actions: ' + ([...compensations.keys()].join(', ') || '(none)'), { taskId, action, mode: c.compensationMode }, enforced)
      }
      let result = null
      try { result = fn({ taskId, reason }) } catch (e) {
        throw deny('VMU_WORKFLOW_COMPENSATION_FAILED', 'the compensating action failed: ' + String((e && e.message) || e), 'fix the action and retry the compensation', { taskId, action }, enforced)
      }
      counters.compensations += 1
      return receipt({ taskId, mode: c.compensationMode, action, result: result === undefined ? null : result, reason }, enforced, fired)
    }
    counters.compensations += 1
    return receipt({ taskId, mode: c.compensationMode, action: null, note: 'manual compensation recorded', reason }, enforced, fired)
  }

  /** escalate(): only due after escalationAfterMs of no movement; the target is validated and self-disclosed. */
  function escalate({ taskId, reason = '' } = {}) {
    const enforced = ['vmu.workflow.escalationAfterMs', 'vmu.workflow.escalationTarget']
    const fired = []
    const s = state.get(taskId)
    if (!s) throw deny('VMU_WORKFLOW_TASK_UNKNOWN', 'no workflow state for task ' + String(taskId), 'advance() the task first', { taskId }, enforced)
    const c = cfg()
    if (!['chair', 'office', 'user'].includes(c.escalationTarget)) {
      fired.push('vmu.workflow.escalationTarget')
      throw deny('VMU_WORKFLOW_ESCALATION_TARGET_UNKNOWN', 'unknown escalation target: ' + String(c.escalationTarget), 'vmu.workflow.escalationTarget ∈ {chair,office,user}', { target: c.escalationTarget }, enforced)
    }
    const age = clock() - s.updatedAt
    if (c.escalationAfterMs > 0 && age < c.escalationAfterMs) {
      fired.push('vmu.workflow.escalationAfterMs')
      throw deny('VMU_WORKFLOW_ESCALATION_NOT_DUE', 'escalation not due for ' + taskId + ': age=' + age + 'ms threshold=' + c.escalationAfterMs + 'ms',
        'wait ' + (c.escalationAfterMs - age) + 'ms or lower vmu.workflow.escalationAfterMs', { taskId, ageMs: age, thresholdMs: c.escalationAfterMs }, enforced)
    }
    s.escalatedAt = clock()
    counters.escalations += 1
    remember({ type: 'workflow/escalate', taskId, reason, target: c.escalationTarget })
    if (bus && typeof bus.emit === 'function') bus.emit('workflow/escalate', { taskId, reason, target: c.escalationTarget })
    return receipt({ taskId, escalatedAt: s.escalatedAt, reason, target: c.escalationTarget }, enforced, fired)
  }

  /** arbitrate(): arbitration is a SWITCH here; the arbitration BODY is defined in 17-§6 (referenced only). */
  function arbitrate({ taskId = null, reason = '' } = {}) {
    const enforced = ['vmu.workflow.arbitrationMode']
    const c = cfg()
    if (c.arbitrationMode !== 'on') {
      throw deny('VMU_WORKFLOW_ARBITRATION_OFF', 'arbitration is off (vmu.workflow.arbitrationMode=off)', 'set vmu.workflow.arbitrationMode=on to enable it; the arbitration body is defined in 17-§6', { taskId }, enforced)
    }
    counters.arbitrations += 1
    return receipt({ taskId, arbitration: 'enabled', mode: c.arbitrationMode, reason, body: '17-§6' }, enforced, ['vmu.workflow.arbitrationMode'])
  }

  /** handover(): `handoverNote` decides whether an unexplained handover is allowed (the NOTE BODY is 17-§11). */
  function handover({ taskId, to = null, note = null } = {}) {
    const enforced = ['vmu.workflow.handoverNote']
    const fired = []
    const s = state.get(taskId)
    if (!s) throw deny('VMU_WORKFLOW_TASK_UNKNOWN', 'no workflow state for task ' + String(taskId), 'advance() the task first', { taskId }, enforced)
    const c = cfg()
    if (typeof to !== 'string' || !to) throw deny('VMU_INVALID_ARGUMENT', 'handover needs a non-empty `to`', 'name the member who takes over', { taskId }, enforced)
    if (c.handoverNote && (typeof note !== 'string' || !note.trim())) {
      fired.push('vmu.workflow.handoverNote')
      throw deny('VMU_WORKFLOW_GATE_NOT_MET', 'handover of ' + taskId + ' requires a note (vmu.workflow.handoverNote=true)', 'write why and what is left; the note body is defined in 17-§11', { taskId, to }, enforced)
    }
    s.by = to
    s.updatedAt = clock()
    counters.handovers += 1
    remember({ type: 'workflow/handover', taskId, to, noted: !!note })
    return receipt({ taskId, from: null, to, note: note === null ? null : String(note), noteRequired: c.handoverNote }, enforced, fired)
  }

  /** Publish/instantiate a work-item template (`templates` + `templateDefault`). */
  function publishTemplate({ id, title = null, stages = null } = {}) {
    const enforced = ['vmu.workflow.templates']
    if (typeof id !== 'string' || !id) throw deny('VMU_INVALID_ARGUMENT', 'publishTemplate needs a non-empty `id`', 'the id is what instantiate() looks up', {}, enforced)
    templates.set(id, { id, title: title === null ? id : String(title), stages: Array.isArray(stages) ? stages.slice() : null })
    return receipt({ id, published: templates.size, templates: listTemplates().count, defaultId: cfg().templateDefault || null }, enforced, ['vmu.workflow.templates'])
  }
  function instantiate({ template = null, taskId = null, priority = null } = {}) {
    const enforced = ['vmu.workflow.templates', 'vmu.workflow.templateDefault', 'vmu.workflow.priorityClasses']
    const fired = []
    const c = cfg()
    const declared = new Map()
    for (const t of c.templates) if (t && typeof t.id === 'string') declared.set(t.id, t)
    for (const [id, t] of templates.entries()) declared.set(id, t)
    let chosen = template
    if (chosen === null || chosen === undefined || chosen === '') {
      chosen = c.templateDefault
      if (chosen) fired.push('vmu.workflow.templateDefault')
    }
    if (!chosen) {
      fired.push('vmu.workflow.templates')
      throw deny('VMU_WORKFLOW_TEMPLATE_UNKNOWN', 'no template given and vmu.workflow.templateDefault is empty', 'declare templates in vmu.workflow.templates or set vmu.workflow.templateDefault; known: ' + ([...declared.keys()].join(', ') || '(none)'), { known: [...declared.keys()] }, enforced)
    }
    if (!declared.has(chosen)) {
      fired.push('vmu.workflow.templates')
      throw deny('VMU_WORKFLOW_TEMPLATE_UNKNOWN', 'unknown template: ' + String(chosen), 'known templates: ' + ([...declared.keys()].join(', ') || '(none)'), { template: chosen, known: [...declared.keys()] }, enforced)
    }
    if (priority !== null && !c.priorityClasses.includes(priority)) {
      fired.push('vmu.workflow.priorityClasses')
      throw deny('VMU_INVALID_ARGUMENT', 'priority "' + String(priority) + '" is not in vmu.workflow.priorityClasses', 'allowed: ' + c.priorityClasses.join(', '), { priority, allowed: c.priorityClasses.slice() }, enforced)
    }
    counters.instantiations += 1
    return receipt({ ok: true, template: chosen, taskId, priority: priority === null ? c.priorityClasses[Math.min(1, c.priorityClasses.length - 1)] : priority, templateBody: declared.get(chosen) }, enforced, fired)
  }
  function listTemplates() {
    const declared = cfg().templates.filter((t) => t && typeof t.id === 'string')
    const merged = new Map(declared.map((t) => [t.id, t]))
    for (const [id, t] of templates.entries()) merged.set(id, t)
    return receipt({ templates: [...merged.values()], count: merged.size, defaultId: cfg().templateDefault || null }, ['vmu.workflow.templates', 'vmu.workflow.templateDefault'], [])
  }

  /** Read-only: is a task due soon? `dueWarnBeforeMs=0` disables the warning (disclosed). */
  function due({ taskId, dueAt = null } = {}) {
    const enforced = ['vmu.workflow.dueWarnBeforeMs']
    if (!state.has(taskId)) throw deny('VMU_WORKFLOW_TASK_UNKNOWN', 'no workflow state for task ' + String(taskId), 'advance() the task first', { taskId }, enforced)
    const c = cfg()
    if (!Number.isFinite(dueAt)) return receipt({ taskId, dueAt: null, warn: false, windowMs: c.dueWarnBeforeMs, reason: 'no deadline given' }, enforced, [])
    const left = dueAt - clock()
    const warn = c.dueWarnBeforeMs > 0 && left <= c.dueWarnBeforeMs
    return receipt({ taskId, dueAt, leftMs: left, overdue: left < 0, warn, windowMs: c.dueWarnBeforeMs }, enforced, warn ? ['vmu.workflow.dueWarnBeforeMs'] : [])
  }

  /** Read-only: the priority queue (ordering is governed by `priorityClasses`). */
  function queue() {
    const c = cfg()
    const items = [...state.entries()].map(([taskId, s]) => ({ taskId, stage: s.stage, priority: s.priority, updatedAt: s.updatedAt }))
      .filter((x) => !TERMINAL.includes(x.stage))
      .sort((a, b) => {
        const pa = c.priorityClasses.indexOf(a.priority); const pb = c.priorityClasses.indexOf(b.priority)
        return (pb - pa) || (a.updatedAt - b.updatedAt) || (a.taskId < b.taskId ? -1 : 1)
      })
    return receipt({ queue: items, count: items.length, classes: c.priorityClasses.slice() }, ['vmu.workflow.priorityClasses'], [])
  }

  /** The K6 scope this workflow uses for its idempotency keys (referenced, never re-implemented). */
  function idempotencyScope() {
    const c = cfg()
    return receipt({ scope: c.idempotencyKeyScope, seam: idempotency ? 'injected' : 'none', ledger: 'kernel/idempotency.js (K6, referenced)' }, ['vmu.workflow.idempotencyKeyScope'], [])
  }
  /** Guard an operation with the K6 ledger at the configured scope (no-op when no ledger is injected). */
  function idempotent({ key, op = null, payload = null } = {}) {
    const enforced = ['vmu.workflow.idempotencyKeyScope']
    const c = cfg()
    if (typeof key !== 'string' || !key) throw deny('VMU_INVALID_ARGUMENT', 'idempotent needs a non-empty `key`', 'the key is looked up in the K6 ledger under the configured scope', { op }, enforced)
    if (!idempotency || typeof idempotency.begin !== 'function') {
      return receipt({ key, scope: c.idempotencyKeyScope, guarded: false, seam: 'none', note: 'no idempotency seam was injected: the workflow runs unguarded (K6 not consulted)' }, enforced, [])
    }
    let r
    try { r = idempotency.begin({ key, scope: c.idempotencyKeyScope, payload: payload === null ? { op } : payload }) } catch (e) { if (e && e.code) throw e; throw deny('VMU_STATE', 'the idempotency seam failed: ' + String((e && e.message) || e), 'fix the K6 ledger, or run without it', { key }, enforced) }
    return receipt({ key, scope: c.idempotencyKeyScope, guarded: true, deduplicated: r.deduplicated === true, state: r.state, result: r.result === undefined ? null : r.result }, enforced, r.deduplicated === true ? ['vmu.workflow.idempotencyKeyScope'] : [])
  }

  /** Read-only views (never mutate). */
  const stages = () => receipt({
    stages: def ? def.stages.slice() : [], transitions: def ? def.transitions.map((t) => t.name) : [],
    dependencies: def ? def.dependencies.map((d) => ({ from: d.from, to: d.to, type: d.type, soft: d.soft })) : [], defined: !!def,
  }, ['vmu.workflow.depTypes'], [])
  function status() {
    const c = cfg()
    const all = [...state.entries()].map(([taskId, s]) => ({ taskId, stage: s.stage, by: s.by, evidence: s.evidence.length, updatedAt: s.updatedAt, escalatedAt: s.escalatedAt, reopened: s.reopened, priority: s.priority, parent: s.parent, attempts: s.attempts, timedOut: timedOut(taskId) }))
    const kept = all.slice(0, listCap)
    // E4 (round 15): the key tables, the unwiredReasons map and the file-derived registry are IMMUTABLE, so they
    // are computed once at construction (STATIC_STATUS) instead of on every call. Before this, `status()` spent
    // ~1310 of ~1500 µs re-reading settings/planned.js + settings/schema.js and re-running two regex scans, which
    // made a read-only view ~570x slower than records.list(). Arrays/objects are still COPIED per call so the
    // returned value keeps its "fresh object, callers cannot mutate our state" semantics, and every field keeps
    // exactly the same meaning. Only the genuinely dynamic fields are computed here.
    const S = STATIC_STATUS
    return {
      defined: !!def, tasks: all.length, items: kept, dropped: all.length - kept.length,
      policy: Object.assign({}, c), taskSource: tasks ? 'injected' : 'none',
      declaredKeys: S.declaredKeys.slice(), declaredCount: S.declaredCount,
      wired: S.wired.slice(), wiredCount: S.wiredCount,
      unwiredKeys: S.unwiredKeys.slice(), unwiredCount: S.unwiredCount,
      unwiredReasons: Object.assign({}, S.unwiredReasons),
      extraWired: S.extraWired.slice(), extraWiredCount: S.extraWiredCount,
      partitionOk: S.partitionOk,
      complementOk: S.complementOk,
      registry: { source: S.registry.source, declaredWorkflowKeys: S.registry.declaredWorkflowKeys, undocumented: S.registry.undocumented.slice() },
      counters: Object.assign({}, counters),
      refusals: Object.fromEntries([...refusals.keys()].sort().map((k) => [k, refusals.get(k)])),
      refusalsTotal: [...refusals.values()].reduce((a, b) => a + b, 0),
      compensations: [...compensations.keys()].sort(), templates: listTemplates().count,
      idempotencySeam: idempotency ? 'injected' : 'none',
      historyRows: history.length, historyDropped,
      at: clock(),
      note: 'every key in `wired` changes an observable result (asserted by tests/vmu-workflow.test.mjs); `enforced[]` lists the keys EVALUATED for a call, `fired[]` the ones that changed its outcome, and every REFUSAL carries an `enforced` array',
    }
  }
  function declaredRegistry() {
    try {
      const here = dirname(fileURLToPath(import.meta.url))
      const p = join(here, '..', 'settings', 'planned.js')
      const q = join(here, '..', 'settings', 'schema.js')
      const keys = new Set()
      if (existsSync(p)) for (const m of readFileSync(p, 'utf8').matchAll(/key: "(vmu\.workflow\.[^"]+)"/g)) keys.add(m[1])
      if (existsSync(q)) for (const m of readFileSync(q, 'utf8').matchAll(/'(vmu\.workflow\.[A-Za-z0-9_.]+)'/g)) keys.add(m[1])
      const all = [...keys].sort()
      return { source: 'settings/planned.js + settings/schema.js', declaredWorkflowKeys: all.length, undocumented: all.filter((k) => !DECLARED_KEYS.includes(k) && !EXTRA_WIRED_KEYS.includes(k)) }
    } catch (e) {
      return { source: 'error:' + String((e && e.message) || e), declaredWorkflowKeys: DECLARED_KEYS.length, undocumented: [] }
    }
  }

  /** IMMUTABLE status furniture, computed ONCE (E4 fix). The registry snapshot is taken at construction time:
   *  it mirrors the settings files as they were when this service was built (documented, observable via `source`),
   *  which is exactly the trade-off the E4 ruling asks for - a read-only view must not do file I/O per call. */
  const STATIC_STATUS = (() => {
    const wired = WIRED_KEYS.slice()
    const unwiredKeys = DECLARED_KEYS.filter((k) => !wired.includes(k))
    return {
      declaredKeys: DECLARED_KEYS.slice(), declaredCount: DECLARED_KEYS.length,
      wired, wiredCount: wired.length,
      unwiredKeys, unwiredCount: unwiredKeys.length,
      unwiredReasons: Object.fromEntries(unwiredKeys.map((k) => [k, UNWIRED_REASONS[k] || '尚未接线（本批未覆盖）'])),
      extraWired: EXTRA_WIRED_KEYS.slice(), extraWiredCount: EXTRA_WIRED_KEYS.length,
      partitionOk: wired.length + unwiredKeys.length === DECLARED_KEYS.length,
      complementOk: wired.every((k) => !unwiredKeys.includes(k)) && wired.length + unwiredKeys.length === DECLARED_KEYS.length,
      registry: declaredRegistry(),
    }
  })()

  return {
    apiVersion,
    define, stage, advance, gate, escalate, stages, status,
    retry, checkpoint, checkpointDue, registerCompensation, compensate,
    arbitrate, handover, publishTemplate, instantiate, listTemplates,
    due, queue, idempotencyScope, idempotent,
  }
}

