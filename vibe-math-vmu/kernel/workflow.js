// vmu kernel workflow — stage whitelist, transition gates, escalation, no stage skipping.
// Spec: docs/08-primitives-meeting-ballot-workflow.md §4 (workflow / task board / control flow),
//       §10 (field-level schema), §12.4 (vmu.workflow.* family).
// Codes: VMU_WORKFLOW_TRANSITION_REQUIRED / VMU_WORKFLOW_STAGE_UNKNOWN / VMU_WORKFLOW_GATE_BLOCKED /
//        VMU_WORKFLOW_TASK_UNKNOWN / VMU_WORKFLOW_ESCALATION_NOT_DUE (03-§8).
// Invariants: illegal moves refuse BY NAME and list the allowed next steps; a failed gate names exactly
// what is missing (evidence / assignee / open tasks); stages cannot be skipped; every truncation is
// counted; the clock is injected; `tasks` is an OPTIONAL injection; zero-config never throws on reads.

export const apiVersion = 1

export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  err.hint = hint
  if (extra) Object.assign(err, extra)
  return err
}

const DEFAULT_STAGES = Object.freeze(['open', 'claimed', 'in-progress', 'review', 'done'])
const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const boolOr = (v, d) => (typeof v === 'boolean' ? v : d)

/**
 * Create the workflow service.
 * `tasks` is optional: when injected it must expose `openCount()` or `list()`; without it the
 * `gateOnOpenTasks` gate is simply reported as "no task source" instead of crashing.
 */
export function createWorkflow({ clock = () => Date.now(), log = () => {}, settings = {}, bus = null, tasks = null, listCap = 100 } = {}) {
  let def = null                       // { stages, transitions, gates }
  const state = new Map()              // taskId -> { stage, by, evidence[], updatedAt, escalatedAt, reopened }

  const cfg = () => ({
    requireEvidence: boolOr(settings['vmu.workflow.requireEvidence'], true),
    requireAssignee: boolOr(settings['vmu.workflow.requireAssignee'], true),
    gateOnOpenTasks: boolOr(settings['vmu.workflow.gateOnOpenTasks'], false),
    escalationAfterMs: intOr(settings['vmu.workflow.escalationAfterMs'], 0),
    escalationTarget: settings['vmu.workflow.escalationTarget'] || null,
    claimRequired: boolOr(settings['vmu.workflow.claimRequired'], false),
    reopenPolicy: settings['vmu.workflow.reopenPolicy'] || 'deny',   // deny | allow | gate
  })

  const allowFrom = (from) => (def ? def.transitions.filter((t) => t.from === from).map((t) => t.to) : [])

  /** Define (or redefine) the workflow. Stages are a whitelist; transitions are the only legal moves. */
  function define({ stages = DEFAULT_STAGES, transitions = [], gates = {} } = {}) {
    const list = Array.isArray(stages) && stages.length ? stages.slice() : DEFAULT_STAGES.slice()
    const tx = (Array.isArray(transitions) ? transitions : []).map((t) => ({ from: t.from, to: t.to, name: t.name || (t.from + '->' + t.to) }))
    for (const t of tx) {
      if (!list.includes(t.from) || !list.includes(t.to)) throw refuse('VMU_WORKFLOW_STAGE_UNKNOWN', 'transition references an undeclared stage: ' + t.from + '->' + t.to, 'declare the stage in `stages` first', { stages: list })
    }
    def = { stages: list, transitions: tx, gates: gates || {} }
    return { stages: list.slice(), transitions: tx.map((t) => t.name) }
  }

  function openCount() {
    if (!tasks) return null
    try {
      if (typeof tasks.openCount === 'function') return intOr(tasks.openCount(), null)
      if (typeof tasks.list === 'function') { const l = tasks.list(); const items = Array.isArray(l) ? l : (l && l.items) || []; return items.filter((t) => t && t.state !== 'done' && t.state !== 'closed').length }
    } catch { return null }
    return null
  }

  /** Evaluate the gate for a task; returns {ok:false, missing:[...]} instead of throwing. */
  function gateCheck(taskId) {
    const c = cfg()
    const s = state.get(taskId)
    const missing = []
    if (c.requireAssignee && !(s && s.by)) missing.push('assignee')
    if (c.requireEvidence && !(s && s.evidence && s.evidence.length)) missing.push('evidence')
    if (c.gateOnOpenTasks) { const n = openCount(); if (n === null) missing.push('task-source'); else if (n > 0) missing.push('open-tasks:' + n) }
    if (def && def.gates && def.gates[taskId]) { const need = def.gates[taskId]; if (Array.isArray(need)) for (const k of need) if (!(s && s.evidence && s.evidence.some((e) => String(e).includes(k)))) missing.push('evidence:' + k) }
    return { ok: missing.length === 0, missing }
  }

  /** Read-only: current stage of a task (named refusal when the task has no workflow state). */
  function stage({ taskId } = {}) {
    const s = state.get(taskId)
    if (!s) throw refuse('VMU_WORKFLOW_TASK_UNKNOWN', 'no workflow state for task ' + String(taskId), 'advance() the task first; stage() only reads existing state', { taskId })
    return { taskId, stage: s.stage, by: s.by, evidence: s.evidence.slice(), updatedAt: s.updatedAt, allowedNext: allowFrom(s.stage) }
  }

  /** Move a task to `to`. Gated, whitelisted, no skipping. */
  function advance({ taskId, to, by = null, evidence = null } = {}) {
    if (!def) throw refuse('VMU_WORKFLOW_TRANSITION_REQUIRED', 'no workflow defined: cannot advance ' + String(taskId), 'call define({stages,transitions}) first', { taskId, to })
    if (!def.stages.includes(to)) throw refuse('VMU_WORKFLOW_STAGE_UNKNOWN', 'unknown stage: ' + String(to), 'declared stages: ' + def.stages.join('|'), { taskId, to, stages: def.stages.slice() })
    const c = cfg()
    const s = state.get(taskId)
    if (!s) {
      if (to !== def.stages[0]) throw refuse('VMU_WORKFLOW_TRANSITION_REQUIRED', 'a new task must start at ' + def.stages[0] + ', not ' + to, 'allowed next: ' + def.stages[0], { taskId, to, from: null, allowedNext: [def.stages[0]] })
      state.set(taskId, { stage: to, by: by, evidence: evidence ? [String(evidence)] : [], updatedAt: clock(), escalatedAt: null, reopened: 0 })
      return stage({ taskId })
    }
    const allowed = allowFrom(s.stage)
    if (!allowed.includes(to)) {
      throw refuse('VMU_WORKFLOW_TRANSITION_REQUIRED', 'illegal transition ' + s.stage + '->' + to + (def.stages.indexOf(to) > def.stages.indexOf(s.stage) + 1 ? ' (stage skipping is not allowed)' : ''),
        'allowed from ' + s.stage + ': ' + (allowed.length ? allowed.join('|') : '(terminal stage)'), { taskId, from: s.stage, to, allowedNext: allowed.slice() })
    }
    if (c.claimRequired && !s.by && !by) throw refuse('VMU_WORKFLOW_GATE_BLOCKED', 'claim required before advancing ' + taskId, 'pass by:<member> to claim this task', { taskId, missing: ['claim'] })
    const g = gateCheck(taskId)
    if (!g.ok) throw refuse('VMU_WORKFLOW_GATE_BLOCKED', 'gate not satisfied for ' + taskId + ' -> ' + to + ': missing ' + g.missing.join(', '),
      'provide ' + g.missing.join(' / ') + ' before advancing', { taskId, to, missing: g.missing.slice() })
    if (to === def.stages[0] && s.stage !== def.stages[0]) {           // reopen
      if (c.reopenPolicy === 'deny') throw refuse('VMU_WORKFLOW_TRANSITION_REQUIRED', 'reopen denied by policy for ' + taskId, 'vmu.workflow.reopenPolicy=' + c.reopenPolicy, { taskId, from: s.stage, to })
      s.reopened += 1
    }
    s.stage = to
    if (by) s.by = by
    if (evidence) s.evidence.push(String(evidence))
    s.updatedAt = clock()
    if (bus && typeof bus.emit === 'function') bus.emit('workflow/advance', { taskId, to, by })
    return stage({ taskId })
  }

  /** gate(): read-only evaluation, never throws for a missing gate (names what is missing). */
  function gate({ taskId } = {}) {
    if (!state.has(taskId)) throw refuse('VMU_WORKFLOW_TASK_UNKNOWN', 'no workflow state for task ' + String(taskId), 'advance() the task first', { taskId })
    const g = gateCheck(taskId)
    return { taskId, ok: g.ok, missing: g.missing.slice(), policy: cfg() }
  }

  /** escalate(): only due after escalationAfterMs of no movement; named refusal when not due. */
  function escalate({ taskId, reason = '' } = {}) {
    const s = state.get(taskId)
    if (!s) throw refuse('VMU_WORKFLOW_TASK_UNKNOWN', 'no workflow state for task ' + String(taskId), 'advance() the task first', { taskId })
    const c = cfg()
    const age = clock() - s.updatedAt
    if (c.escalationAfterMs > 0 && age < c.escalationAfterMs) {
      throw refuse('VMU_WORKFLOW_ESCALATION_NOT_DUE', 'escalation not due for ' + taskId + ': age=' + age + 'ms threshold=' + c.escalationAfterMs + 'ms',
        'wait ' + (c.escalationAfterMs - age) + 'ms or lower vmu.workflow.escalationAfterMs', { taskId, ageMs: age, thresholdMs: c.escalationAfterMs })
    }
    s.escalatedAt = clock()
    const target = c.escalationTarget
    if (bus && typeof bus.emit === 'function') bus.emit('workflow/escalate', { taskId, reason, target })
    return { taskId, escalatedAt: s.escalatedAt, reason, target }
  }

  /** Read-only views (never mutate). */
  const stages = () => ({ stages: def ? def.stages.slice() : [], transitions: def ? def.transitions.map((t) => t.name) : [], defined: !!def })
  const status = () => {
    const all = [...state.entries()].map(([taskId, s]) => ({ taskId, stage: s.stage, by: s.by, evidence: s.evidence.length, updatedAt: s.updatedAt, escalatedAt: s.escalatedAt, reopened: s.reopened }))
    const kept = all.slice(0, listCap)
    return { defined: !!def, tasks: all.length, items: kept, dropped: all.length - kept.length, policy: cfg(), taskSource: tasks ? 'injected' : 'none' }
  }

  return { apiVersion, define, stage, advance, gate, escalate, stages, status }
}
