// tests/vmu-workflow.test.mjs — independent test for kernel/workflow.js (batch-1 slice 9).
// Scenarios: legal/illegal transitions, no stage skipping, gates (assignee / evidence / open tasks),
// escalation due-time, counted truncation, zero-config, optional `tasks` injection, injected clock,
// reopen policy, read-only views.
import { createWorkflow } from '../vibe-math-vmu/kernel/workflow.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const throws = (fn) => { try { fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, msg: String(e && e.message), hint: e && e.hint, allowedNext: e && e.allowedNext, missing: e && e.missing } } }

let now = 1000
const mk = (settings = {}, opts = {}) => createWorkflow({ clock: () => now, settings, listCap: 100, ...opts })
const FLOW = { stages: ['open', 'claimed', 'in-progress', 'review', 'done'], transitions: [{ from: 'open', to: 'claimed' }, { from: 'claimed', to: 'in-progress' }, { from: 'in-progress', to: 'review' }, { from: 'review', to: 'done' }] }

// 1) zero-config: no define ⇒ named refusal with a next step; reads never crash
{
  const w = mk()
  const r = throws(() => w.advance({ taskId: 't1', to: 'open' }))
  ok(r.threw && r.code === 'VMU_WORKFLOW_TRANSITION_REQUIRED' && !!r.hint, 'no definition ⇒ named refusal + hint')
  ok(w.stages().defined === false && w.status().defined === false, 'stages/status report undefined workflow')
  ok(w.status().tasks === 0 && w.status().taskSource === 'none', 'zero-config status is safe')
}

// 2) new task must start at the first stage
{
  const w = mk(); w.define(FLOW)
  const r = throws(() => w.advance({ taskId: 't2', to: 'claimed', by: 'acad', evidence: 'e1' }))
  ok(r.threw && r.code === 'VMU_WORKFLOW_TRANSITION_REQUIRED' && r.allowedNext.includes('open'), 'new task must start at open')
}

// 3) legal transition + allowedNext + deterministic clock
{
  const w = mk(); w.define(FLOW)
  w.advance({ taskId: 't3', to: 'open', by: 'acad', evidence: 'seed' })
  const s1 = w.advance({ taskId: 't3', to: 'claimed', by: 'acad', evidence: 'e2' })
  ok(s1.stage === 'claimed' && s1.allowedNext.includes('in-progress'), 'legal transition moves and lists next')
  ok(s1.updatedAt === 1000, 'updatedAt comes from the injected clock')
}

// 4) illegal transition ⇒ named refusal listing allowed next steps
{
  const w = mk(); w.define(FLOW)
  w.advance({ taskId: 't4', to: 'open', by: 'a', evidence: 'x' })
  const r = throws(() => w.advance({ taskId: 't4', to: 'review', by: 'a', evidence: 'y' }))
  ok(r.threw && r.code === 'VMU_WORKFLOW_TRANSITION_REQUIRED' && r.allowedNext.includes('claimed'), 'illegal transition names allowed next')
}

// 5) no stage skipping (explicitly flagged in the message)
{
  const w = mk(); w.define(FLOW)
  w.advance({ taskId: 't5', to: 'open', by: 'a', evidence: 'x' })
  const r = throws(() => w.advance({ taskId: 't5', to: 'done', by: 'a', evidence: 'y' }))
  ok(r.threw && /skipping/.test(r.msg), 'stage skipping refused with explicit reason')
}

// 6) gates: assignee / evidence / open tasks each name what is missing
{
  const w = mk()
  w.define(FLOW)
  // new task with no by/evidence
  w.advance({ taskId: 'g1', to: 'open' })
  const r = throws(() => w.advance({ taskId: 'g1', to: 'claimed' }))
  ok(r.threw && r.code === 'VMU_WORKFLOW_GATE_BLOCKED' && r.missing.includes('assignee') && r.missing.includes('evidence'), 'gate names assignee+evidence')
  const g = w.gate({ taskId: 'g1' })
  ok(g.ok === false && g.missing.length >= 1, 'gate() reports missing without throwing')
  // open tasks gate
  const withTasks = mk({ 'vmu.workflow.gateOnOpenTasks': true }, { tasks: { openCount: () => 2 } })
  withTasks.define(FLOW)
  withTasks.advance({ taskId: 'g2', to: 'open', by: 'a', evidence: 'e' })
  const r2 = throws(() => withTasks.advance({ taskId: 'g2', to: 'claimed', by: 'a', evidence: 'e' }))
  ok(r2.threw && r2.missing.some((m) => String(m).startsWith('open-tasks:')), 'open-tasks gate names the count')
  // without a task source the gate says so instead of crashing
  const noSrc = mk({ 'vmu.workflow.gateOnOpenTasks': true })
  noSrc.define(FLOW)
  noSrc.advance({ taskId: 'g3', to: 'open', by: 'a', evidence: 'e' })
  const r3 = throws(() => noSrc.advance({ taskId: 'g3', to: 'claimed', by: 'a', evidence: 'e' }))
  ok(r3.threw && r3.missing.includes('task-source'), 'missing task source named (no crash)')
}

// 7) escalation: not due ⇒ named refusal with ages; due ⇒ succeeds with target
{
  const w = mk({ 'vmu.workflow.escalationAfterMs': 5000, 'vmu.workflow.escalationTarget': 'chair' })
  w.define(FLOW)
  w.advance({ taskId: 'e1', to: 'open', by: 'a', evidence: 'x' })
  now = 2000
  const r = throws(() => w.escalate({ taskId: 'e1', reason: 'stuck' }))
  ok(r.threw && r.code === 'VMU_WORKFLOW_ESCALATION_NOT_DUE' && /age=/.test(r.msg), 'escalation not due refused with ages')
  now = 9000
  const e = w.escalate({ taskId: 'e1', reason: 'stuck' })
  ok(e.escalatedAt === 9000 && e.target === 'chair', 'escalation due succeeds with target')
  now = 1000
}

// 8) claimRequired
{
  const w = mk({ 'vmu.workflow.claimRequired': true })
  w.define(FLOW)
  w.advance({ taskId: 'c1', to: 'open', evidence: 'x' })
  const r = throws(() => w.advance({ taskId: 'c1', to: 'claimed', evidence: 'y' }))
  ok(r.threw && r.code === 'VMU_WORKFLOW_GATE_BLOCKED' && r.missing.includes('claim'), 'claim required before advancing')
}

// 9) reopenPolicy: deny refuses, allow permits
{
  const deny = mk({ 'vmu.workflow.reopenPolicy': 'deny' })
  deny.define({ stages: ['open', 'done'], transitions: [{ from: 'open', to: 'done' }, { from: 'done', to: 'open' }] })
  deny.advance({ taskId: 'r1', to: 'open', by: 'a', evidence: 'e' })
  deny.advance({ taskId: 'r1', to: 'done', by: 'a', evidence: 'e' })
  const r = throws(() => deny.advance({ taskId: 'r1', to: 'open', by: 'a', evidence: 'e' }))
  ok(r.threw && r.code === 'VMU_WORKFLOW_TRANSITION_REQUIRED', 'reopen denied by policy')
  const allow = mk({ 'vmu.workflow.reopenPolicy': 'allow' })
  allow.define({ stages: ['open', 'done'], transitions: [{ from: 'open', to: 'done' }, { from: 'done', to: 'open' }] })
  allow.advance({ taskId: 'r2', to: 'open', by: 'a', evidence: 'e' })
  allow.advance({ taskId: 'r2', to: 'done', by: 'a', evidence: 'e' })
  ok(allow.advance({ taskId: 'r2', to: 'open', by: 'a', evidence: 'e' }).stage === 'open', 'reopen allowed by policy')
}

// 10) unknown stage / unknown task ⇒ named refusals
{
  const w = mk(); w.define(FLOW)
  const a = throws(() => w.advance({ taskId: 'u1', to: 'nope' }))
  ok(a.threw && a.code === 'VMU_WORKFLOW_STAGE_UNKNOWN', 'unknown stage named refusal')
  const b = throws(() => w.stage({ taskId: 'ghost' }))
  ok(b.threw && b.code === 'VMU_WORKFLOW_TASK_UNKNOWN', 'unknown task named refusal')
}

// 11) counted truncation in status()
{
  const w = createWorkflow({ clock: () => now, settings: {}, listCap: 2 })
  w.define(FLOW)
  for (const t of ['x1', 'x2', 'x3', 'x4']) w.advance({ taskId: t, to: 'open', by: 'a', evidence: 'e' })
  const s = w.status()
  ok(s.tasks === 4 && s.items.length === 2 && s.dropped === 2, 'status reports dropped count')
}

// 12) read-only views never mutate
{
  const w = mk(); w.define(FLOW)
  w.advance({ taskId: 'v1', to: 'open', by: 'a', evidence: 'e' })
  const before = JSON.stringify({ s: w.status(), st: w.stage({ taskId: 'v1' }), g: w.gate({ taskId: 'v1' }), d: w.stages() })
  w.status(); w.stage({ taskId: 'v1' }); w.gate({ taskId: 'v1' }); w.stages()
  ok(JSON.stringify({ s: w.status(), st: w.stage({ taskId: 'v1' }), g: w.gate({ taskId: 'v1' }), d: w.stages() }) === before, 'reads are side-effect free')
}

// 13) define rejects transitions that reference undeclared stages
{
  const w = mk()
  const r = throws(() => w.define({ stages: ['a', 'b'], transitions: [{ from: 'a', to: 'z' }] }))
  ok(r.threw && r.code === 'VMU_WORKFLOW_STAGE_UNKNOWN', 'define validates transition stages')
}

console.log('=== VMU WORKFLOW: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)
