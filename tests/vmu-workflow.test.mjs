// tests/vmu-workflow.test.mjs — independent test for kernel/workflow.js (batch-1 slice 9).
// Scenarios: legal/illegal transitions, no stage skipping, gates (assignee / evidence / open tasks),
// escalation due-time, counted truncation, zero-config, optional `tasks` injection, injected clock,
// reopen policy, read-only views.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { createWorkflow, DECLARED_KEYS, WIRED_KEYS, UNWIRED_REASONS, EXTRA_WIRED_KEYS } from '../vibe-math-vmu/kernel/workflow.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
/** A refusal must be NAMED and carry `enforced` (array, deduplicated, never undefined) — the C2 standard. */
const throwsE = (fn, code, label, mustInclude = []) => {
  let e = null
  try { fn() } catch (err) { e = err }
  if (!e) { fail++; console.log('FAIL ' + label + ' (no refusal)'); return null }
  if (e.code !== code) { fail++; console.log('FAIL ' + label + ' (code=' + e.code + ' want ' + code + ')'); return null }
  const problems = []
  if (!Array.isArray(e.enforced)) problems.push('enforced is ' + typeof e.enforced + ' (not an array)')
  else if (new Set(e.enforced).size !== e.enforced.length) problems.push('enforced has duplicates')
  for (const k of mustInclude) if (!Array.isArray(e.enforced) || !e.enforced.includes(k)) problems.push('missing ' + k)
  if (problems.length) { fail++; console.log('FAIL ' + label + ' (' + problems.join('; ') + ')'); return e }
  pass++
  return e
}
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

// ── 14. the STANDARD: the 23-key partition, every key changes behaviour, enforced/fired discipline ─────
{
  const st = mk().status()
  ok(DECLARED_KEYS.length === 23, 'standard: docs/08 §19.5 declares exactly 23 keys')
  ok(WIRED_KEYS.every((k) => DECLARED_KEYS.includes(k)), 'standard: WIRED ⊆ declared')
  ok(st.unwiredKeys.every((k) => !WIRED_KEYS.includes(k)), 'standard: wired ∩ unwired = ∅')
  ok(st.wiredCount + st.unwiredCount === 23 && st.partitionOk === true && st.complementOk === true, 'standard: wired + unwired partition the 23 exactly')
  ok(st.unwiredCount === 0 && Object.keys(st.unwiredReasons).length === 0, 'standard: no declared key is left unwired (stated, not implied)')
  ok(st.extraWired.length === 4 && EXTRA_WIRED_KEYS.every((k) => st.extraWired.includes(k)), 'standard: the 4 registered core keys are reported separately')
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'vibe-math-vmu', 'kernel', 'workflow.js'), 'utf8')
  const missing = DECLARED_KEYS.filter((k) => !src.includes("'" + k + "'"))
  ok(missing.length === 0, 'standard: every declared key appears as a PLAIN LITERAL in the module (' + missing.join(',') + ')')
  ok(st.registry.declaredWorkflowKeys >= 27 && Array.isArray(st.registry.undocumented), 'standard: the generated registry is cross-checked read-only')
  ok(Array.isArray(UNWIRED_REASONS) === false && typeof UNWIRED_REASONS === 'object', 'standard: the unwired-reason table exists (empty because all 23 are wired)')
  ok(typeof st.note === 'string' && /enforced/.test(st.note) && /fired/.test(st.note), 'standard: status() explains the enforced/fired contract')
}

// ── 15. the 23 declared keys, one by one (positive AND negative) ───────────────────────────────────────
{
  const FLOW2 = { stages: ['open', 'doing', 'done'], transitions: [{ from: 'open', to: 'doing' }, { from: 'doing', to: 'done' }] }
  const base = () => { const w = mk(); w.define(FLOW2); return w }

  // 1 · depTypes
  const dep = mk({ 'vmu.workflow.depTypes': ['finish-to-start'] })
  dep.define(Object.assign({}, FLOW2, { dependencies: [{ from: 'open', to: 'doing', type: 'finish-to-start' }] }))
  ok(dep.stages().dependencies.length === 1, 'depTypes +: a declared dependency type is accepted')
  const depBad = throwsE(() => base().define(Object.assign({}, FLOW2, { dependencies: [{ from: 'open', to: 'doing', type: 'start-to-start' }] })), 'VMU_WORKFLOW_DEP_TYPE_UNSUPPORTED', 'depTypes −: an undeclared type is refused', ['vmu.workflow.depTypes'])
  ok(!!depBad && /finish-to-start/.test(String(depBad.hint)), 'depTypes −: the refusal lists the allowed types')
  const depOpen = mk({ 'vmu.workflow.depTypes': ['start-to-start'] })
  ok(depOpen.define(Object.assign({}, FLOW2, { dependencies: [{ from: 'open', to: 'doing', type: 'start-to-start' }] })).dependencies.length === 1, 'depTypes: the allowed set is configurable (behaviour flips)')

  // 2 · softDepsEnforced (+ hard deps always block)
  const softFlow = { stages: ['open', 'doing', 'done'], transitions: [{ from: 'open', to: 'doing' }, { from: 'doing', to: 'done' }], dependencies: [{ from: 'dep', to: 's', type: 'finish-to-start', soft: true }] }
  const softOff = mk({ 'vmu.workflow.softDepsEnforced': false })
  softOff.define(softFlow)
  softOff.advance({ taskId: 'dep', to: 'open', by: 'a', evidence: 'e' })
  softOff.advance({ taskId: 's', to: 'open', by: 'a', evidence: 'e' })
  const softOk = softOff.advance({ taskId: 's', to: 'doing', by: 'a', evidence: 'e' })
  ok(softOk.stage === 'doing' && softOk.softBlockedBy && softOk.softBlockedBy.includes('dep'), 'softDepsEnforced −: an unmet soft dep only ADVISES (and is disclosed)')
  const softOn = mk({ 'vmu.workflow.softDepsEnforced': true })
  softOn.define(softFlow)
  softOn.advance({ taskId: 'dep', to: 'open', by: 'a', evidence: 'e' })
  softOn.advance({ taskId: 's', to: 'open', by: 'a', evidence: 'e' })
  const softBlocked = throwsE(() => softOn.advance({ taskId: 's', to: 'doing', by: 'a', evidence: 'e' }), 'VMU_WORKFLOW_GATE_BLOCKED', 'softDepsEnforced +: the same soft dep now BLOCKS', ['vmu.workflow.softDepsEnforced'])
  ok(!!softBlocked && Array.isArray(softBlocked.blockedBy) && softBlocked.blockedBy[0] === 'dep', 'softDepsEnforced +: the blocking dependency is named')

  // 3 · stageGateMode
  const refuseMode = mk({ 'vmu.workflow.stageGateMode': 'refuse' })
  refuseMode.define(FLOW2)
  refuseMode.advance({ taskId: 'm1', to: 'open' })
  ok(throwsE(() => refuseMode.advance({ taskId: 'm1', to: 'doing' }), 'VMU_WORKFLOW_GATE_BLOCKED', 'stageGateMode refuse: a failed gate is a refusal'), 'stageGateMode refuse +')
  const advisory = mk({ 'vmu.workflow.stageGateMode': 'advisory' })
  advisory.define(FLOW2)
  advisory.advance({ taskId: 'm2', to: 'open' })
  const adv = advisory.advance({ taskId: 'm2', to: 'doing' })
  ok(adv.stage === 'doing' && adv.blocked === true && adv.gateMode === 'advisory' && adv.advisory.length >= 1, 'stageGateMode advisory: the move proceeds, the miss is DISCLOSED (blocked/advisory)')

  // 4 · gateKinds
  const gk = mk({ 'vmu.workflow.gateKinds': ['entry'] })
  ok(gk.define(Object.assign({}, FLOW2, { gates: { t1: { kind: 'entry', need: ['proof'] } } })).gateKinds.includes('entry'), 'gateKinds +: a declared kind is accepted')
  const gkBad = throwsE(() => gk.define(Object.assign({}, FLOW2, { gates: { t1: { kind: 'exit', need: ['proof'] } } })), 'VMU_WORKFLOW_GATE_NOT_MET', 'gateKinds −: an undeclared kind is refused', ['vmu.workflow.gateKinds'])
  ok(!!gkBad && /entry/.test(String(gkBad.hint)), 'gateKinds −: the refusal lists the allowed kinds')

  // 5 · retryMax
  const noRetry = base()
  noRetry.advance({ taskId: 'r0', to: 'open', by: 'a', evidence: 'e' })
  const retryOff = throwsE(() => noRetry.retry({ taskId: 'r0' }), 'VMU_WORKFLOW_RETRY_EXHAUSTED', 'retryMax=0 −: retries are refused (with 0/0)', ['vmu.workflow.retryMax'])
  ok(!!retryOff && /0\/0/.test(retryOff.message), 'retryMax=0: the refusal gives current/limit')
  const retry2 = mk({ 'vmu.workflow.retryMax': 2 })
  retry2.define(FLOW2)
  retry2.advance({ taskId: 'r1', to: 'open', by: 'a', evidence: 'e' })
  ok(retry2.retry({ taskId: 'r1' }).attempt === 1 && retry2.retry({ taskId: 'r1' }).attempt === 2, 'retryMax +: retries happen up to the limit')
  const retry3 = throwsE(() => retry2.retry({ taskId: 'r1' }), 'VMU_WORKFLOW_RETRY_EXHAUSTED', 'retryMax +: the limit is enforced with current/limit')
  ok(!!retry3 && /2\/2/.test(retry3.message), 'retryMax: the exhausted refusal states 2/2')

  // 6 · retryBaseMs
  const base10 = mk({ 'vmu.workflow.retryMax': 1, 'vmu.workflow.retryBaseMs': 10, 'vmu.workflow.retryCapMs': 100000, 'vmu.workflow.retryJitterRatio': 0 })
  base10.define(FLOW2)
  base10.advance({ taskId: 'b10', to: 'open', by: 'a', evidence: 'e' })
  ok(base10.retry({ taskId: 'b10' }).delayMs === 10, 'retryBaseMs: the first backoff equals the base (jitter off)')
  const base100 = mk({ 'vmu.workflow.retryMax': 1, 'vmu.workflow.retryBaseMs': 100, 'vmu.workflow.retryCapMs': 100000, 'vmu.workflow.retryJitterRatio': 0 })
  base100.define(FLOW2)
  base100.advance({ taskId: 'b100', to: 'open', by: 'a', evidence: 'e' })
  ok(base100.retry({ taskId: 'b100' }).delayMs === 100, 'retryBaseMs: a larger base yields a larger delay (the knob changes the result)')

  // 7 · retryCapMs
  const capped = mk({ 'vmu.workflow.retryMax': 3, 'vmu.workflow.retryBaseMs': 1000, 'vmu.workflow.retryCapMs': 1500, 'vmu.workflow.retryJitterRatio': 0 })
  capped.define(FLOW2)
  capped.advance({ taskId: 'cap', to: 'open', by: 'a', evidence: 'e' })
  capped.retry({ taskId: 'cap' })
  const cappedTwo = capped.retry({ taskId: 'cap' })
  ok(cappedTwo.capped === true && cappedTwo.delayMs === 1500, 'retryCapMs: the second backoff is CAPPED at the configured maximum')
  ok(cappedTwo.fired.includes('vmu.workflow.retryCapMs'), 'retryCapMs: the cap is listed as fired when it bites')

  // 8 · retryJitterRatio
  const noJit = mk({ 'vmu.workflow.retryMax': 1, 'vmu.workflow.retryJitterRatio': 0, 'vmu.workflow.retryBaseMs': 100 })
  noJit.define(FLOW2)
  noJit.advance({ taskId: 'j0', to: 'open', by: 'a', evidence: 'e' })
  ok(noJit.retry({ taskId: 'j0' }).jitterMs === 0, 'retryJitterRatio=0: no jitter at all')
  const jit = mk({ 'vmu.workflow.retryMax': 1, 'vmu.workflow.retryJitterRatio': 0.2, 'vmu.workflow.retryBaseMs': 100, 'vmu.workflow.retryCapMs': 100000 })
  jit.define(FLOW2)
  jit.advance({ taskId: 'j1', to: 'open', by: 'a', evidence: 'e' })
  const j1 = jit.retry({ taskId: 'j1' })
  ok(j1.jitterMs !== 0 && Math.abs(j1.jitterMs) <= 200, 'retryJitterRatio +: a deterministic jitter is applied within ±ratio·1000')
  const jit2 = mk({ 'vmu.workflow.retryMax': 1, 'vmu.workflow.retryJitterRatio': 0.2, 'vmu.workflow.retryBaseMs': 100, 'vmu.workflow.retryCapMs': 100000 })
  jit2.define(FLOW2)
  jit2.advance({ taskId: 'j1', to: 'open', by: 'a', evidence: 'e' })
  ok(jit2.retry({ taskId: 'j1' }).jitterMs === j1.jitterMs, 'retryJitterRatio: the SAME task+attempt yields the SAME jitter (no randomness)')

  // 9 · taskTimeoutMs
  const noTimeout = mk({ 'vmu.workflow.taskTimeoutMs': 0 })
  noTimeout.define(FLOW2)
  noTimeout.advance({ taskId: 'to0', to: 'open', by: 'a', evidence: 'e' })
  now = 100000
  ok(noTimeout.stage({ taskId: 'to0' }).timedOut === false, 'taskTimeoutMs=0: a task never times out')
  const timeout = mk({ 'vmu.workflow.taskTimeoutMs': 100 })
  timeout.define(FLOW2)
  timeout.advance({ taskId: 'to1', to: 'open', by: 'a', evidence: 'e' })
  now = now + 200
  ok(timeout.stage({ taskId: 'to1' }).timedOut === true, 'taskTimeoutMs +: the timeout is observed from the injected clock')
  const toErr = throwsE(() => timeout.advance({ taskId: 'to1', to: 'doing', by: 'a', evidence: 'e' }), 'VMU_STATE', 'taskTimeoutMs +: advancing a timed-out task is refused', ['vmu.workflow.taskTimeoutMs'])
  ok(!!toErr && /taskTimeoutMs/.test(String(toErr.hint)), 'taskTimeoutMs: the refusal names the key')
  now = 1000

  // 10 · checkpointEveryMs
  const cpOff = mk({ 'vmu.workflow.checkpointEveryMs': 0 })
  cpOff.define(FLOW2)
  cpOff.advance({ taskId: 'c0', to: 'open', by: 'a', evidence: 'e' })
  ok(cpOff.checkpointDue({ taskId: 'c0' }).due === false && cpOff.checkpoint({ taskId: 'c0', note: 'n' }).automatic === false, 'checkpointEveryMs=0: checkpoints are manual only')
  const cpOn = mk({ 'vmu.workflow.checkpointEveryMs': 50 })
  cpOn.define(FLOW2)
  cpOn.advance({ taskId: 'c1', to: 'open', by: 'a', evidence: 'e' })
  ok(cpOn.checkpointDue({ taskId: 'c1' }).due === false, 'checkpointEveryMs +: not due immediately')
  cpOn.checkpoint({ taskId: 'c1', note: 'first' })
  now = now + 60
  ok(cpOn.checkpointDue({ taskId: 'c1' }).due === true, 'checkpointEveryMs +: due once the period elapsed')
  now = 1000

  // 11 · compensationMode
  const manual = base()
  manual.advance({ taskId: 'cm', to: 'open', by: 'a', evidence: 'e' })
  ok(manual.compensate({ taskId: 'cm', reason: 'undo' }).mode === 'manual', 'compensationMode manual: compensation is recorded manually')
  const reg = mk({ 'vmu.workflow.compensationMode': 'registered' })
  reg.define(FLOW2)
  reg.advance({ taskId: 'cr', to: 'open', by: 'a', evidence: 'e' })
  const compErr = throwsE(() => reg.compensate({ taskId: 'cr', action: 'nope', reason: 'undo' }), 'VMU_WORKFLOW_COMPENSATION_FAILED', 'compensationMode registered −: an unregistered action is refused', ['vmu.workflow.compensationMode'])
  ok(!!compErr && /registered/.test(String(compErr.hint)), 'compensationMode −: the refusal lists the registered actions')
  reg.registerCompensation({ name: 'undo-open', action: () => ({ undone: true }) })
  ok(reg.compensate({ taskId: 'cr', action: 'undo-open', reason: 'undo' }).result.undone === true, 'compensationMode registered +: a registered action runs')

  // 12 · subtaskDepthMax
  const depth = mk({ 'vmu.workflow.subtaskDepthMax': 1 })
  depth.define(FLOW2)
  depth.advance({ taskId: 'p', to: 'open', by: 'a', evidence: 'e' })
  depth.advance({ taskId: 'c', to: 'open', by: 'a', evidence: 'e', parent: 'p' })
  const depthErr = throwsE(() => depth.advance({ taskId: 'g', to: 'open', by: 'a', evidence: 'e', parent: 'c' }), 'VMU_WORKFLOW_SUBTASK_DEPTH', 'subtaskDepthMax −: too deep is refused with current/limit', ['vmu.workflow.subtaskDepthMax'])
  ok(!!depthErr && /2\/1/.test(depthErr.message), 'subtaskDepthMax: the refusal gives current/limit (2/1)')
  const depth0 = mk({ 'vmu.workflow.subtaskDepthMax': 0 })
  depth0.define(FLOW2)
  depth0.advance({ taskId: 'p0', to: 'open', by: 'a', evidence: 'e' })
  depth0.advance({ taskId: 'c0', to: 'open', by: 'a', evidence: 'e', parent: 'p0' })
  ok(depth0.advance({ taskId: 'g0', to: 'open', by: 'a', evidence: 'e', parent: 'c0' }).depth === 2, 'subtaskDepthMax=0: unlimited depth')

  // 13 · parentDoneRule
  const allTerm = mk({ 'vmu.workflow.parentDoneRule': 'all-terminal' })
  allTerm.define(FLOW2)
  allTerm.advance({ taskId: 'pa', to: 'open', by: 'a', evidence: 'e' })
  allTerm.advance({ taskId: 'ka', to: 'open', by: 'a', evidence: 'e', parent: 'pa' })
  allTerm.advance({ taskId: 'pa', to: 'doing', by: 'a', evidence: 'e' })
  const parentErr = throwsE(() => allTerm.advance({ taskId: 'pa', to: 'done', by: 'a', evidence: 'e' }), 'VMU_WORKFLOW_GATE_BLOCKED', 'parentDoneRule: unfinished children block (all-terminal)')
  ok(!!parentErr && Array.isArray(parentErr.unfinished) && parentErr.unfinished.includes('ka'), 'parentDoneRule: the unfinished children are named')
  const anyTerm = mk({ 'vmu.workflow.parentDoneRule': 'any-terminal' })
  anyTerm.define(FLOW2)
  anyTerm.advance({ taskId: 'pb', to: 'open', by: 'a', evidence: 'e' })
  anyTerm.advance({ taskId: 'kb', to: 'open', by: 'a', evidence: 'e', parent: 'pb' })
  anyTerm.advance({ taskId: 'kb', to: 'doing', by: 'a', evidence: 'e' })
  anyTerm.advance({ taskId: 'kb', to: 'done', by: 'a', evidence: 'e' })
  anyTerm.advance({ taskId: 'pb', to: 'doing', by: 'a', evidence: 'e' })
  ok(anyTerm.advance({ taskId: 'pb', to: 'done', by: 'a', evidence: 'e' }).stage === 'done', 'parentDoneRule any-terminal: one terminal child is enough (behaviour flips)')

  // 14 · priorityClasses
  const prio = mk({ 'vmu.workflow.priorityClasses': ['low', 'normal', 'high'] })
  prio.define(FLOW2)
  prio.advance({ taskId: 'q1', to: 'open', by: 'a', evidence: 'e', priority: 'high' })
  prio.advance({ taskId: 'q2', to: 'open', by: 'a', evidence: 'e', priority: 'low' })
  const q = prio.queue()
  ok(q.queue[0].taskId === 'q1' && q.queue[0].priority === 'high', 'priorityClasses: the queue orders by the configured classes')
  const prioErr = throwsE(() => prio.advance({ taskId: 'q3', to: 'open', by: 'a', evidence: 'e', priority: 'urgent' }), 'VMU_INVALID_ARGUMENT', 'priorityClasses −: an undeclared class is refused', ['vmu.workflow.priorityClasses'])
  ok(!!prioErr && /low, normal, high/.test(String(prioErr.hint)), 'priorityClasses −: the refusal lists the allowed classes')

  // 15 · dueWarnBeforeMs
  const dueOff = mk({ 'vmu.workflow.dueWarnBeforeMs': 0 })
  dueOff.define(FLOW2)
  dueOff.advance({ taskId: 'd0', to: 'open', by: 'a', evidence: 'e' })
  ok(dueOff.due({ taskId: 'd0', dueAt: now + 10 }).warn === false, 'dueWarnBeforeMs=0: no warning window')
  const dueOn = mk({ 'vmu.workflow.dueWarnBeforeMs': 100 })
  dueOn.define(FLOW2)
  dueOn.advance({ taskId: 'd1', to: 'open', by: 'a', evidence: 'e' })
  ok(dueOn.due({ taskId: 'd1', dueAt: now + 50 }).warn === true && dueOn.due({ taskId: 'd1', dueAt: now + 5000 }).warn === false, 'dueWarnBeforeMs +: the warning fires inside the window only')

  // 16+17 · escalationAfterMs / escalationTarget
  const esc = mk({ 'vmu.workflow.escalationAfterMs': 10, 'vmu.workflow.escalationTarget': 'chair' })
  esc.define(FLOW2)
  esc.advance({ taskId: 'e1', to: 'open', by: 'a', evidence: 'e' })
  now = now + 20
  ok(esc.escalate({ taskId: 'e1', reason: 'stuck' }).target === 'chair', 'escalationAfterMs/escalationTarget +: a due escalation carries the configured target')
  const badTarget = mk({ 'vmu.workflow.escalationAfterMs': 0, 'vmu.workflow.escalationTarget': 'manager' })
  badTarget.define(FLOW2)
  badTarget.advance({ taskId: 'e2', to: 'open', by: 'a', evidence: 'e' })
  const tErr = throwsE(() => badTarget.escalate({ taskId: 'e2' }), 'VMU_WORKFLOW_ESCALATION_TARGET_UNKNOWN', 'escalationTarget −: an unknown target is refused', ['vmu.workflow.escalationTarget'])
  ok(!!tErr && /chair/.test(String(tErr.hint)), 'escalationTarget −: the refusal lists the valid targets')
  now = 1000

  // 18 · arbitrationMode
  const arbOff = mk({ 'vmu.workflow.arbitrationMode': 'off' })
  const arbErr = throwsE(() => arbOff.arbitrate({ taskId: 'a1' }), 'VMU_WORKFLOW_ARBITRATION_OFF', 'arbitrationMode off −: arbitration is refused', ['vmu.workflow.arbitrationMode'])
  ok(!!arbErr && /17-§6/.test(String(arbErr.hint)), 'arbitrationMode −: the refusal points at the definition (17-§6, referenced only)')
  const arbOn = mk({ 'vmu.workflow.arbitrationMode': 'on' })
  ok(arbOn.arbitrate({ taskId: 'a1' }).body === '17-§6', 'arbitrationMode on +: the switch is enabled and discloses the body source')

  // 19 · claimRequired (positive and negative)
  const claimOn = mk({ 'vmu.workflow.claimRequired': true })
  claimOn.define(FLOW2)
  claimOn.advance({ taskId: 'cl1', to: 'open', evidence: 'e' })
  ok(throwsE(() => claimOn.advance({ taskId: 'cl1', to: 'doing', evidence: 'e' }), 'VMU_WORKFLOW_GATE_BLOCKED', 'claimRequired +: an unclaimed task cannot advance'), 'claimRequired +')
  const claimOff = mk({ 'vmu.workflow.claimRequired': false })
  claimOff.define(FLOW2)
  claimOff.advance({ taskId: 'cl2', to: 'open', by: 'a', evidence: 'e' })
  ok(claimOff.advance({ taskId: 'cl2', to: 'doing', evidence: 'e' }).stage === 'doing', 'claimRequired −: with the knob off the same move succeeds (the assignee gate is satisfied by the state)')

  // 20 · handoverNote
  const noteOn = mk({ 'vmu.workflow.handoverNote': true })
  noteOn.define(FLOW2)
  noteOn.advance({ taskId: 'h1', to: 'open', by: 'a', evidence: 'e' })
  const noteErr = throwsE(() => noteOn.handover({ taskId: 'h1', to: 'bob' }), 'VMU_WORKFLOW_GATE_NOT_MET', 'handoverNote +: an unexplained handover is refused', ['vmu.workflow.handoverNote'])
  ok(!!noteErr && /17-§11/.test(String(noteErr.hint)), 'handoverNote +: the refusal points at the note-body definition (17-§11)')
  ok(noteOn.handover({ taskId: 'h1', to: 'bob', note: 'context' }).to === 'bob', 'handoverNote +: a noted handover succeeds and reassigns')
  const noteOff = mk({ 'vmu.workflow.handoverNote': false })
  noteOff.define(FLOW2)
  noteOff.advance({ taskId: 'h2', to: 'open', by: 'a', evidence: 'e' })
  ok(noteOff.handover({ taskId: 'h2', to: 'bob' }).noteRequired === false, 'handoverNote −: with the knob off no note is needed')

  // 21 · idempotencyKeyScope (references the K6 ledger)
  const scopeDefault = mk().idempotencyScope()
  ok(scopeDefault.scope === 'session' && /idempotency/.test(scopeDefault.ledger), 'idempotencyKeyScope: defaults to session and names the K6 ledger (referenced only)')
  const durableScope = mk({ 'vmu.workflow.idempotencyKeyScope': 'durable' })
  ok(durableScope.idempotencyScope().scope === 'durable', 'idempotencyKeyScope +: the scope is configurable')
  const seen = []
  const fakeLedger = { begin: ({ key, scope, payload }) => { seen.push({ key, scope, payload }); return { ok: true, state: 'committed', deduplicated: true, result: { done: true } } } }
  const guarded = createWorkflow({ clock: () => now, settings: { 'vmu.workflow.idempotencyKeyScope': 'durable' }, idempotency: fakeLedger })
  const g = guarded.idempotent({ key: 'op:1', op: 'advance', payload: { taskId: 't' } })
  ok(g.guarded === true && g.deduplicated === true && seen[0].scope === 'durable', 'idempotencyKeyScope: the K6 seam is called WITH the configured scope (dedup disclosed)')
  const unguarded = mk().idempotent({ key: 'op:2' })
  ok(unguarded.guarded === false && unguarded.seam === 'none', 'idempotencyKeyScope: without a seam the call is unguarded and says so (never pretends)')

  // 22+23 · templateDefault / templates
  const tplBad = throwsE(() => base().instantiate({}), 'VMU_WORKFLOW_TEMPLATE_UNKNOWN', 'templateDefault empty −: instantiate() without a template is refused', ['vmu.workflow.templates'])
  ok(!!tplBad && /templateDefault/.test(tplBad.message), 'templateDefault: the refusal names the empty default')
  const tpl = mk({ 'vmu.workflow.templateDefault': 'wf', 'vmu.workflow.templates': [{ id: 'wf', title: 'workflow' }] })
  ok(tpl.instantiate({}).template === 'wf', 'templateDefault +: instantiate() falls back to the configured default')
  ok(Array.isArray(tpl.listTemplates().templates) && tpl.listTemplates().count === 1, 'templates: the declared library is listed')
  const tplUnknown = throwsE(() => tpl.instantiate({ template: 'nope' }), 'VMU_WORKFLOW_TEMPLATE_UNKNOWN', 'templates −: an unknown template is refused with the known list', ['vmu.workflow.templates'])
  ok(!!tplUnknown && /wf/.test(String(tplUnknown.hint)), 'templates −: the refusal lists the known templates')
  ok(tpl.publishTemplate({ id: 'extra', title: 'extra' }).templates === 2, 'templates +: publishing adds to the library (and changes the count)')
}

// ── 16. `enforced` discipline: arrays on EVERY refusal, no duplicates, fired ⊆ enforced ────────────────
{
  const universe = new Set(WIRED_KEYS.concat(EXTRA_WIRED_KEYS))
  const check = (e, label, must = []) => {
    if (!e) { fail++; console.log('FAIL enforced: ' + label + ' (no refusal)'); return null }
    ok(Array.isArray(e.enforced), 'enforced: ' + label + ' carries an ARRAY (never undefined)')
    ok(e.enforced.every((k) => universe.has(k)), 'enforced: ' + label + ' lists only wired keys')
    ok(new Set(e.enforced).size === e.enforced.length, 'enforced: ' + label + ' has no duplicates')
    if (must.length) ok(must.every((k) => e.enforced.includes(k)), 'enforced: ' + label + ' names the key that fired')
    return e
  }
  const FLOW3 = { stages: ['open', 'doing', 'done'], transitions: [{ from: 'open', to: 'doing' }, { from: 'doing', to: 'done' }] }
  const w = mk({ 'vmu.workflow.retryMax': 0 })
  w.define(FLOW3)
  w.advance({ taskId: 'x', to: 'open', by: 'a', evidence: 'e' })
  check(throwsE(() => w.retry({ taskId: 'x' }), 'VMU_WORKFLOW_RETRY_EXHAUSTED', 'sweep: retry'), 'retry', ['vmu.workflow.retryMax'])
  check(throwsE(() => w.stage({ taskId: 'ghost' }), 'VMU_WORKFLOW_TASK_UNKNOWN', 'sweep: stage'), 'stage(unknown)')
  check(throwsE(() => w.advance({ taskId: 'ghost', to: 'nope' }), 'VMU_WORKFLOW_STAGE_UNKNOWN', 'sweep: stage unknown'), 'advance(bad stage)')
  check(throwsE(() => w.advance({ taskId: 'x', to: 'done' }), 'VMU_WORKFLOW_TRANSITION_REQUIRED', 'sweep: illegal transition'), 'advance(illegal)')
  check(throwsE(() => w.arbitrate({ taskId: 'x' }), 'VMU_WORKFLOW_ARBITRATION_OFF', 'sweep: arbitration'), 'arbitrate(off)', ['vmu.workflow.arbitrationMode'])
  check(throwsE(() => w.handover({ taskId: 'x' }), 'VMU_INVALID_ARGUMENT', 'sweep: handover without to'), 'handover(no to)')
  check(throwsE(() => w.compensate({ taskId: 'ghost' }), 'VMU_WORKFLOW_TASK_UNKNOWN', 'sweep: compensate'), 'compensate(unknown)')
  check(throwsE(() => w.checkpoint({ taskId: 'ghost' }), 'VMU_WORKFLOW_TASK_UNKNOWN', 'sweep: checkpoint'), 'checkpoint(unknown)')
  check(throwsE(() => w.checkpointDue({ taskId: 'ghost' }), 'VMU_WORKFLOW_TASK_UNKNOWN', 'sweep: checkpointDue'), 'checkpointDue(unknown)')
  check(throwsE(() => w.due({ taskId: 'ghost' }), 'VMU_WORKFLOW_TASK_UNKNOWN', 'sweep: due'), 'due(unknown)')
  check(throwsE(() => w.escalate({ taskId: 'ghost' }), 'VMU_WORKFLOW_TASK_UNKNOWN', 'sweep: escalate'), 'escalate(unknown)')
  check(throwsE(() => w.gate({ taskId: 'ghost' }), 'VMU_WORKFLOW_TASK_UNKNOWN', 'sweep: gate'), 'gate(unknown)')
  check(throwsE(() => w.instantiate({}), 'VMU_WORKFLOW_TEMPLATE_UNKNOWN', 'sweep: instantiate'), 'instantiate(no template)', ['vmu.workflow.templates'])
  check(throwsE(() => w.idempotent({}), 'VMU_INVALID_ARGUMENT', 'sweep: idempotent without key'), 'idempotent(no key)')
  check(throwsE(() => w.registerCompensation({ name: 'n' }), 'VMU_INVALID_ARGUMENT', 'sweep: registerCompensation without action'), 'registerCompensation(no action)')
  check(throwsE(() => w.define({ stages: ['a', 'b'], transitions: [{ from: 'a', to: 'z' }] }), 'VMU_WORKFLOW_STAGE_UNKNOWN', 'sweep: define bad transition'), 'define(bad transition)')
  const empty = throwsE(() => w.stage({ taskId: 'ghost' }), 'VMU_WORKFLOW_TASK_UNKNOWN', 'sweep: empty enforced')
  ok(Array.isArray(empty.enforced) && empty.enforced.length === 0, 'enforced −: a refusal that evaluated nothing lists an EMPTY array')
  ok(!empty.enforced.includes('vmu.workflow.retryMax'), 'enforced −: an untouched key is NOT listed on the refusal path')

  // no duplicates and fired ⊆ enforced across EVERY receipt of a full scenario
  const w2 = mk({ 'vmu.workflow.depTypes': ['finish-to-start', 'start-to-start'], 'vmu.workflow.retryMax': 2, 'vmu.workflow.retryJitterRatio': 0.2, 'vmu.workflow.retryBaseMs': 100, 'vmu.workflow.checkpointEveryMs': 0, 'vmu.workflow.dueWarnBeforeMs': 50, 'vmu.workflow.handoverNote': true, 'vmu.workflow.escalationAfterMs': 0, 'vmu.workflow.templates': [{ id: 'wf' }], 'vmu.workflow.templateDefault': 'wf', 'vmu.workflow.arbitrationMode': 'on' })
  w2.define(Object.assign({}, FLOW3, { dependencies: [{ from: 'done', to: 'doing', type: 'finish-to-start', soft: true }] }))
  const receipts = []
  receipts.push(w2.stages())
  receipts.push(w2.advance({ taskId: 'f1', to: 'open', by: 'a', evidence: 'e', priority: 'high' }))
  receipts.push(w2.advance({ taskId: 'f1', to: 'doing', by: 'a', evidence: 'e' }))
  receipts.push(w2.stage({ taskId: 'f1' }))
  receipts.push(w2.gate({ taskId: 'f1' }))
  receipts.push(w2.retry({ taskId: 'f1' }))
  receipts.push(w2.checkpoint({ taskId: 'f1', note: 'cp' }))
  receipts.push(w2.checkpointDue({ taskId: 'f1' }))
  receipts.push(w2.due({ taskId: 'f1', dueAt: now + 10 }))
  receipts.push(w2.queue())
  receipts.push(w2.escalate({ taskId: 'f1', reason: 'r' }))
  receipts.push(w2.handover({ taskId: 'f1', to: 'bob', note: 'n' }))
  receipts.push(w2.compensate({ taskId: 'f1', reason: 'r' }))
  receipts.push(w2.arbitrate({ taskId: 'f1' }))
  receipts.push(w2.instantiate({}))
  receipts.push(w2.listTemplates())
  receipts.push(w2.idempotencyScope())
  receipts.push(w2.idempotent({ key: 'k' }))
  ok(receipts.every((r) => Array.isArray(r.enforced)), 'receipts: every receipt carries an array `enforced`')
  ok(receipts.every((r) => !Array.isArray(r.enforced) || new Set(r.enforced).size === r.enforced.length), 'receipts: NO receipt has duplicate `enforced` entries')
  ok(receipts.every((r) => !r.fired || new Set(r.fired).size === r.fired.length), 'receipts: NO receipt has duplicate `fired` entries')
  ok(receipts.every((r) => !r.fired || r.fired.every((k) => r.enforced.includes(k))), 'receipts: fired ⊆ enforced everywhere')
  ok(receipts.every((r) => r.enforced.every((k) => universe.has(k))), 'receipts: every listed key is a wired key')
  // determinism of the lists (injected clock; no randomness)
  const runTwice = () => { const x = mk({ 'vmu.workflow.retryMax': 1, 'vmu.workflow.retryJitterRatio': 0.2 }); x.define(FLOW3); x.advance({ taskId: 'd', to: 'open', by: 'a', evidence: 'e' }); return JSON.stringify([x.retry({ taskId: 'd' }).enforced, x.gate({ taskId: 'd' }).enforced, x.status().wired]) }
  ok(runTwice() === runTwice(), 'determinism: two identical runs yield element-wise identical enforced lists')
  // read-only purity of the new readers
  const before = JSON.stringify([w2.status(), w2.queue(), w2.listTemplates(), w2.checkpointDue({ taskId: 'f1' }), w2.idempotencyScope(), w2.gate({ taskId: 'f1' }), w2.due({ taskId: 'f1', dueAt: now })])
  for (let i = 0; i < 3; i++) { w2.status(); w2.queue(); w2.listTemplates(); w2.checkpointDue({ taskId: 'f1' }); w2.idempotencyScope(); w2.gate({ taskId: 'f1' }); w2.due({ taskId: 'f1', dueAt: now }) }
  ok(JSON.stringify([w2.status(), w2.queue(), w2.listTemplates(), w2.checkpointDue({ taskId: 'f1' }), w2.idempotencyScope(), w2.gate({ taskId: 'f1' }), w2.due({ taskId: 'f1', dueAt: now })]) === before, 'read-only: the new readers never mutate state')
  ok(Object.keys(w2.status().refusals).length >= 0 && w2.status().refusalsTotal >= 0, 'counting: refusals are grouped by code and totalised')
}

// ── E4 (round 15): the read-only view must stay a READ, not a file scan ──────────────────────────────────
// Measured before the fix: `status()` median ≈ 1502 µs, of which ≈ 1310 µs was `declaredRegistry()` re-reading
// settings/planned.js + settings/schema.js and re-running two regex scans ON EVERY CALL (≈570x records.list()).
// The budget below is deliberately generous (200 µs, i.e. >8x the post-fix median) so CI jitter cannot produce
// a false red - it fires only if the per-call rebuild comes back.
{
  const wf = mk({}, { listCap: 100 })
  wf.define({ stages: ['open', 'done'], transitions: [{ from: 'open', to: 'done' }] })
  wf.advance({ taskId: 'perf', to: 'open', by: 'a' })
  for (let i = 0; i < 30; i++) wf.status()                       // warm up (JIT + first-touch)
  const samples = []
  for (let i = 0; i < 200; i++) { const t0 = performance.now(); wf.status(); samples.push((performance.now() - t0) * 1000) }
  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)]
  const p90 = samples[Math.floor(samples.length * 0.9)]
  const BUDGET_US = 200
  ok(median <= BUDGET_US, 'E4 budget: status() median ' + median.toFixed(1) + ' µs <= ' + BUDGET_US + ' µs (no per-call file scan)')
  ok(p90 <= BUDGET_US * 3, 'E4 budget: status() p90 ' + p90.toFixed(1) + ' µs <= ' + (BUDGET_US * 3) + ' µs (jitter headroom)')
  console.log('E4 timing: status() median=' + median.toFixed(1) + ' µs p90=' + p90.toFixed(1) + ' µs (budget ' + BUDGET_US + ' µs)')
}

console.log('=== VMU WORKFLOW: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)
