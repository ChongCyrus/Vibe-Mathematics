// tests/vmu-approval-decision.test.mjs — task-215 ②: the FIRST dedicated suite for `kernel/human.js`'s
// `approvalDecision` gate (the earlier audit that removed its silently-dropped `byRole` argument reported that no
// `tests/vmu-human*` / `tests/vmu-approval*` file existed).
//
// WHAT THIS GATE IS. `approvalDecision({ action, subject, scope, at })` answers ONE question — "may this action
// proceed right now?" — and the answer is a DECISION OBJECT (`gate()` turns the same decision into a thrown
// refusal). Its three load-bearing properties, each pinned below:
//   §1 WHAT IT DECIDES: an ungated action runs (zero mechanism); a gated action QUEUES until a human decides; a
//      standing veto wins; a human deny is final; a full queue does not silently drop the request.
//   §2 A REFUSAL IS NAMED: every `ok:false` carries a code from the module's own closed `CODE` map plus a message,
//      and the pending branch additionally carries a `hint` telling the caller what to do.
//   §3 IT DOES NOT ADJUDICATE BY THE CALLER'S ROLE: deciding by role is POLICY and belongs outside this kernel gate
//      (the task-205 B ruling, stated at `kernel/human.js:297-301`). A `byRole` value must not change the outcome,
//      and the gate's own parameter list must not carry one.
//
// COUNTEREXAMPLE SEAM (so the red side is PROVEN, not asserted): the factory is imported from
// `process.env.VMU_HUMAN_MODULE` when set. `tests/fixtures/human-gate-counterexample.mjs` wraps the real module and
// can (a) decide BY ROLE or (b) DROP A REFUSAL — each must redden this suite. Same idiom as the repo's other
// mutation seams (`MATH_COMPUTATION_MODULE`).
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const HUMAN_SRC = join(REPO, 'vibe-math-vmu', 'kernel', 'human.js')
const SPEC = process.env.VMU_HUMAN_MODULE ? pathToFileURL(join(HERE, process.env.VMU_HUMAN_MODULE)).href : pathToFileURL(HUMAN_SRC).href
const mod = await import(SPEC)
const { createHuman, CODE } = mod

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const attempt = (fn) => { try { return { value: fn() } } catch (e) { return { code: (e && e.code) || null, message: String((e && e.message) || e), hint: e && e.hint, requestId: e && e.requestId } } }

/** A fresh gate: `task.create` is the ONE gated action, 1s timeout, queue of 1, at a controlled clock. */
const mk = (settings = {}) => {
  let t = 1000
  const h = createHuman({ clock: () => t, log: () => {}, settings: Object.assign({ 'vmu.human.gatedActions': ['task.create'], 'vmu.human.approvalTimeoutMs': 1000, 'vmu.human.approvalQueueCap': 1 }, settings) })
  return { h, tick: (ms) => { t += ms } }
}

console.log('=== §1 WHAT IT DECIDES (the contract, branch by branch) ===')
{
  // (a) an action that is NOT gated runs: that is the zero-mechanism default, and it says so.
  const { h: h1 } = mk()
  const notGated = h1.approvalDecision({ action: 'task.list', subject: 's1' })
  ok(notGated.ok === true && notGated.gated === false && /zero mechanism/.test(String(notGated.note || '')),
    '★ an UNGATED action is allowed, and the decision NAMES the zero-mechanism reason ("not in vmu.human.gatedActions")', notGated)

  // (b) a gated action with no human decision QUEUES — it does not run, and it says the wait is real.
  const { h: h2 } = mk()
  const pending = h2.approvalDecision({ action: 'task.create', subject: 's1' })
  ok(pending.ok === false && pending.code === CODE.approvalPending && pending.queued === true && pending.state === 'pending' && typeof pending.requestId === 'string',
    '★ a GATED action with no decision is QUEUED (ok:false, state=pending, a requestId to decide, `hint` telling the human how)', pending)

  // (c) the SAME request, after a human allows it, is allowed — and the queue produced exactly one request.
  const { h: h3 } = mk()
  const first = h3.approvalDecision({ action: 'task.create', subject: 's1' })
  const asked = attempt(() => h3.gate({ action: 'task.create', subject: 's1' }))
  ok(asked.code === CODE.approvalPending, 'and `gate()` throws the same decision as a NAMED refusal (pending), so a wrapper cannot act on it silently', asked)
  const allowed = h3.decide({ requestId: first.requestId, allow: true })
  ok(allowed.ok === true, 'a human `decide({allow:true})` is accepted', allowed)
  const after = h3.approvalDecision({ action: 'task.create', subject: 's1' })
  ok(after.ok === true && after.allowed === true && after.state === 'allowed' && after.requestId === first.requestId,
    '★ after that decision the SAME action is ALLOWED, on the SAME request id (no second request is invented)', after)
  ok(after.fired !== undefined || after.enforced !== undefined,
    'and the decision carries its accounting fields (`enforced`/`fired`) so a caller can see what was consulted', after)

  // (d) a human DENY is final and keeps the reason.
  const { h: h4 } = mk()
  const r4 = h4.approvalDecision({ action: 'task.create', subject: 's2' })
  h4.decide({ requestId: r4.requestId, allow: false, reason: 'not now' })
  const denied = h4.approvalDecision({ action: 'task.create', subject: 's2' })
  ok(denied.ok === false && denied.code === CODE.approvalDenied && denied.state === 'denied' && denied.reason === 'not now',
    '★ a human DENY is a NAMED refusal (`VMU_HUMAN_APPROVAL_DENIED`) that keeps the reason', denied)

  // (e) a STANDING VETO beats everything, including an ungated action.
  const { h: h5 } = mk()
  const v = h5.veto({ by: 'h1', scope: 'institution', target: 't-1', reason: 'stop' })
  ok(v.ok === true, 'a human veto is recorded', v)
  const vetoed = h5.approvalDecision({ action: 'task.list', subject: 't-1' })
  ok(vetoed.ok === false && vetoed.code === CODE.vetoed && vetoed.gated === true && vetoed.veto && vetoed.veto.reason === 'stop',
    '★ a standing VETO is a NAMED refusal (`VMU_HUMAN_VETOED`) that carries the veto record — and it applies to an action that is not even gated', vetoed)

  // (f) a FULL queue refuses instead of silently dropping the request.
  const { h: h6 } = mk({ 'vmu.human.approvalQueueCap': 1 })
  h6.approvalDecision({ action: 'task.create', subject: 'a' })
  const full = h6.approvalDecision({ action: 'task.create', subject: 'b' })
  ok(full.ok === false && full.code === CODE.queueFull && /NOT queued and NOT run/.test(String(full.message || '')),
    '★ a FULL queue refuses by name (`VMU_HUMAN_QUEUE_FULL`) and says the action was neither queued nor run (no silent drop)', full)

  // (g) a missing action name is a PROGRAMMING error and throws by name.
  const { h: h7 } = mk()
  const noAction = attempt(() => h7.approvalDecision({}))
  ok(noAction.code === 'VMU_INVALID_ARGUMENT' && /needs an action name/.test(String(noAction.message || '')),
    '★ calling it without an action THROWS by name (`VMU_INVALID_ARGUMENT`) — it never guesses what was meant', noAction)
}

console.log('=== §2 EVERY REFUSAL IS NAMED (closed code set, message, and a way forward) ===')
{
  const { h } = mk({ 'vmu.human.approvalQueueCap': 1 })
  h.veto({ by: 'h1', scope: 'institution', target: 'v', reason: 'r' })
  h.approvalDecision({ action: 'task.create', subject: 'q1' })
  const decisions = [
    h.approvalDecision({ action: 'task.list', subject: 'v' }),        // vetoed
    h.approvalDecision({ action: 'task.create', subject: 'q1' }),    // pending
    h.approvalDecision({ action: 'task.create', subject: 'q2' }),    // queue full
  ]
  const codes = new Set(Object.values(CODE))
  ok(decisions.length > 0 && decisions.every((d) => d.ok === false),
    'the refusals really are refusals (control: nothing silently allowed in this fixture)', decisions.map((d) => d.code))
  ok(decisions.filter((d) => typeof d.code === 'string' && codes.has(d.code)).length === decisions.length,
    '★ every refusing decision carries a code from the module\u2019s own closed `CODE` map (no bare ok:false)', decisions.map((d) => d.code))
  ok(decisions.filter((d) => typeof d.message === 'string' && d.message.length > 10).length === decisions.length,
    'and every one carries a human-readable message', decisions.map((d) => d.message))
  const pending = decisions.find((d) => d.code === CODE.approvalPending)
  ok(pending && typeof pending.hint === 'string' && pending.hint.length > 10,
    '★ a QUEUED action additionally carries a `hint` (the caller is told how to unblock it, not just that it failed)', pending)
}

console.log('=== §3 IT DOES NOT ADJUDICATE BY THE CALLER\u2019S ROLE (policy lives outside this gate) ===')
{
  // (a) structural: the gate's own parameter list must not declare a role. This is the signal that once DISAPPEARED
  // silently (task-205 B): a `byRole` computed upstream and read-and-ignored here.
  const src = readFileSync(HUMAN_SRC, 'utf8')
  const decl = /function approvalDecision\(([^)]*)\)/.exec(src)
  ok(!!decl, 'the gate is declared as `function approvalDecision(...)` (located, so the next check is not vacuous)', decl && decl[1])
  ok(decl && !/byRole/.test(decl[1]),
    '★ the gate\u2019s parameter list carries NO `byRole` — deciding by role is POLICY and lives outside this kernel gate (kernel/human.js:297-301)',
    decl && decl[1])
  ok(/DECIDING BY ROLE IS POLICY/.test(src),
    'and the ruling is written in the code next to it (so the next reader meets it where the decision is made)', {})

  // (b) behavioural: the SAME action under two DIFFERENT caller roles must give the SAME decision.
  const { h: hA } = mk()
  const { h: hB } = mk()
  const roleA = hA.approvalDecision({ action: 'task.create', subject: 's', byRole: 'chair' })
  const roleB = hB.approvalDecision({ action: 'task.create', subject: 's', byRole: 'temp' })
  const strip = (d) => ({ ok: d.ok, code: d.code, gated: d.gated, state: d.state })
  ok(JSON.stringify(strip(roleA)) === JSON.stringify(strip(roleB)),
    '★ the outcome is IDENTICAL for two different `byRole` values (an extra role argument cannot change the verdict)',
    { chair: strip(roleA), temp: strip(roleB) })

  const { h: hC } = mk()
  hC.veto({ by: 'h1', scope: 'institution', target: 's', reason: 'r' })
  const unGatedA = hC.approvalDecision({ action: 'task.list', subject: 's', byRole: 'temp' })
  const unGatedB = hC.approvalDecision({ action: 'task.list', subject: 's', byRole: 'chair' })
  ok(unGatedA.code === unGatedB.code && unGatedA.code === CODE.vetoed,
    'and the veto outcome is likewise role-blind (control: the veto still bites, so the check is not vacuous)',
    { temp: unGatedA.code, chair: unGatedB.code })
}

console.log('')
console.log('=== VMU APPROVAL DECISION: ' + passed + ' passed, ' + failed + ' failed' + (process.env.VMU_HUMAN_MUTANT ? ' [mutant=' + process.env.VMU_HUMAN_MUTANT + ']' : '') + ' ===')
if (failed) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
process.exitCode = failed === 0 ? 0 : 1
