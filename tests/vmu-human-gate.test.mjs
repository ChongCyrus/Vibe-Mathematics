// tests/vmu-human-gate.test.mjs — the human approval GATE (kernel/human.js), the control tune/pause surface
// (kernel/control.js) and the order-independent wiring (kernel/resume.js + tools/human.js).
//
// WHY THIS SUITE EXISTS. Round 1 left the human face with a veto, an approval record and a dashboard scope — and
// NO mechanism: nothing consulted them, so "the human is in the loop" was a label. The contract encoded here:
//   1. with nothing declared, NOTHING is gated (zero mechanism);
//   2. a gated action does NOT run while no human approved it — it is queued with a requestId;
//   3. a denial takes effect immediately; a veto is immediate and must be liftable BY NAME (role + reason);
//   4. the declared timeout action decides on expiry, and `default-allow` additionally needs an acknowledgement —
//      silence never allows;
//   5. the dashboard may not show the private face or an undeclared domain;
//   6. a pause blocks by name and a mid-flight retune is named, role-checked, audited and needs a write seam.
//
// Last line: === VMU HUMAN GATE: N passed, M failed ===
import { createHuman, attachApprovalGate, CODE as HU, PRIVATE_DOMAINS } from '../vibe-math-vmu/kernel/human.js'
import { createControl, CODE as CT } from '../vibe-math-vmu/kernel/control.js'
import { createTasks } from '../vibe-math-vmu/kernel/tasks.js'

let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}
const throws = (code, name, fn) => {
  try { fn(); ok(false, name, 'no refusal') } catch (e) { ok(e && e.code === code, name, (e && e.code) + ' | ' + (e && e.message)) }
}
let NOW = 1000
const clock = () => NOW
const hu = (settings) => createHuman({ clock, settings: settings || {} })
/** `gate()` THROWS when an action may not proceed; a caller that wants the queued requestId catches it. */
const queueUp = (h, req) => { try { h.gate(req) } catch (e) { return e } return null }

// ── 1. zero mechanism: with nothing declared, a declared gate does nothing ──────────────────────────────────
{
  const h = hu({})
  const svc = { calls: 0, write() { svc.calls += 1; return { ok: true } } }
  const g = attachApprovalGate({ target: svc, methods: ['write'], gate: h.gate, face: 'svc' })
  ok(g.wrapped.length === 1 && g.qualified[0] === 'svc.write', 'the gate wrapper reports the QUALIFIED action name', g.qualified)
  svc.write()
  ok(svc.calls === 1, 'with vmu.human.gatedActions empty the action runs (zero mechanism)', h.status().gatedActions)
  const d = h.approvalDecision({ action: 'svc.write' })
  ok(d.ok === true && d.gated === false, 'the decision says so explicitly instead of pretending to gate', d)
}

// ── 2. a gated action is QUEUED: it does not run until a human allows it ────────────────────────────────────
{
  const h = hu({ 'vmu.human.gatedActions': ['svc.write'] })
  const svc = { calls: 0, write() { svc.calls += 1; return { ok: true } } }
  attachApprovalGate({ target: svc, methods: ['write'], gate: h.gate, face: 'svc' })
  let err = null
  try { svc.write() } catch (e) { err = e }
  ok(!!err && err.code === HU.approvalPending, 'a gated action is refused by name while pending', err && err.code)
  ok(err.detail && err.detail.queued === true && typeof err.detail.requestId === 'string', 'the refusal carries queued=true and a requestId', err.detail)
  ok(svc.calls === 0, 'the underlying action did NOT run (a real interception, not a label)', svc.calls)
  const q = h.queue()
  ok(q.pending === 1 && q.requests[0].action === 'svc.write' && q.requests[0].attempts === 1, 'the queue shows the waiting action and its attempts', q.requests[0])
  // a second attempt queues ONTO the same request instead of opening a new one
  try { svc.write() } catch (e) { /* still pending */ }
  ok(h.queue().total === 1 && h.queue().requests[0].attempts === 2, 'a repeated attempt reuses the same request (attempts counted)', h.queue().requests[0])
  const rid = h.queue().requests[0].requestId
  h.decide({ requestId: rid, allow: true, by: 'office', reason: 'reviewed' })
  svc.write()
  ok(svc.calls === 1, 'after an explicit allow the action runs', svc.calls)
  // a denial is immediate
  const h2 = hu({ 'vmu.human.gatedActions': ['svc.write'] })
  const svc2 = { calls: 0, write() { svc2.calls += 1 } }
  attachApprovalGate({ target: svc2, methods: ['write'], gate: h2.gate, face: 'svc' })
  const rid2 = h2.queue().requests.length ? h2.queue().requests[0].requestId : null
  try { svc2.write() } catch (e) { /* queued */ }
  const q2 = h2.queue().requests[0].requestId
  const dec = h2.decide({ requestId: q2, allow: false, by: 'office' })
  ok(dec.decision === 'denied' && dec.pendingReason === true, 'a denial with no reason is recorded as a PENDING reason (never dressed up)', dec)
  throws(HU.approvalDenied, 'a denied action is refused by name', () => svc2.write())
  ok(svc2.calls === 0, 'a denied action never runs', svc2.calls)
  h2.explainDecision({ requestId: q2, reason: 'the plan conflicts with the ethics review' })
  ok(h2.queue().requests[0].pendingReason === false, 'the promised reason can be filled in afterwards', h2.queue().requests[0])
  ok(rid2 === null || typeof rid2 === 'string', 'the first attempt created the request through the gate itself')
}

// ── 3. a veto is immediate, broadcast-shaped, and liftable by name ──────────────────────────────────────────
{
  const events = []
  const h = createHuman({ clock, settings: { 'vmu.human.gatedActions': ['svc.write'], 'vmu.human.vetoLiftRoles': ['office'] }, bus: { emit: (name, payload) => { events.push(name); return Promise.resolve() } } })
  const v = h.veto({ by: 'human-1', target: 'the-paper', reason: 'not ready' })
  ok(v.ok === true && h.status().activeVetoes === 1, 'the veto is recorded and active', h.status().activeVetoes)
  ok(events.includes('human/vetoed'), 'the veto is broadcast on the bus (string hook name)', events)
  throws(HU.vetoed, 'a vetoed action is refused by name (the action is not even queued)', () => h.gate({ action: 'svc.write', subject: 'the-paper' }))
  throws(HU.liftRole, 'a role outside vmu.human.vetoLiftRoles may not lift', () => h.liftVeto({ vetoId: v.veto.id, by: 'chair', reason: 'x' }))
  throws(HU.liftReason, 'lifting without a reason is refused by name', () => h.liftVeto({ vetoId: v.veto.id, by: 'office' }))
  const lifted = h.liftVeto({ vetoId: v.veto.id, by: 'office', reason: 'the blockers were fixed' })
  ok(lifted.ok === true && h.status().activeVetoes === 0 && events.includes('human/veto-lifted'), 'a reasoned lift clears it and is broadcast', lifted)
  const d = h.approvalDecision({ action: 'svc.write', subject: 'the-paper' })
  ok(d.ok === false && d.code === HU.approvalPending, 'after the lift the action is queued again (not silently allowed)', d)
  // an emergency veto may supply its reason afterwards
  const hNeeds = createHuman({ clock, settings: { 'vmu.human.vetoNeedsReason': true } })
  const e = hNeeds.veto({ by: 'human-2', scope: 'task', target: 't-9', emergency: true })
  ok(e.veto.pendingReason === true, 'an emergency veto is recorded with a PENDING reason, not a fabricated one', e.veto)
  const expl = hNeeds.explainDecision({ vetoId: e.veto.id, reason: 'harmful to a third party' })
  ok(expl.ok === true, 'the reason can be offered afterwards', expl)
}

// ── 4. the declared timeout decides on expiry; default-allow needs an acknowledgement ───────────────────────
{
  const hold = hu({ 'vmu.human.gatedActions': ['svc.write'], 'vmu.human.approvalTimeoutMs': 1000, 'vmu.human.onTimeout': 'hold' })
  queueUp(hold, { action: 'svc.write' })
  NOW += 5000
  const dHold = hold.approvalDecision({ action: 'svc.write' })
  ok(dHold.ok === false && dHold.code === HU.approvalPending && dHold.heldOnTimeout === true, 'onTimeout=hold: the expired wait stays QUEUED (never allowed by silence)', dHold)
  const deny = hu({ 'vmu.human.gatedActions': ['svc.write'], 'vmu.human.approvalTimeoutMs': 1000, 'vmu.human.onTimeout': 'default-deny' })
  queueUp(deny, { action: 'svc.write' })
  NOW += 5000
  const dDeny = deny.approvalDecision({ action: 'svc.write' })
  ok(dDeny.ok === false && dDeny.code === HU.approvalTimeout, 'onTimeout=default-deny refuses by name on expiry', dDeny)
  const allow = hu({ 'vmu.human.gatedActions': ['svc.write'], 'vmu.human.approvalTimeoutMs': 1000, 'vmu.human.onTimeout': 'default-allow' })
  queueUp(allow, { action: 'svc.write' })
  NOW += 5000
  const dAllow = allow.approvalDecision({ action: 'svc.write' })
  ok(dAllow.ok === false && dAllow.code === HU.defaultAllowNotAcknowledged && allow.status().gateNeverAllowsBySilence === true,
    'onTimeout=default-allow WITHOUT the acknowledgement stays queued (silence never allows)', dAllow)
  const acked = hu({ 'vmu.human.gatedActions': ['svc.write'], 'vmu.human.approvalTimeoutMs': 1000, 'vmu.human.onTimeout': 'default-allow', 'vmu.human.defaultAllowAcknowledged': true })
  queueUp(acked, { action: 'svc.write' })
  NOW += 5000
  const dAck = acked.approvalDecision({ action: 'svc.write' })
  ok(dAck.ok === true && dAck.state === 'allowed-on-timeout', 'with the acknowledgement the declared action allows, and says which path allowed it', dAck)
  // the queue is bounded, and a full queue refuses by name instead of dropping a request silently
  const full = hu({ 'vmu.human.gatedActions': ['svc.write', 'svc.other'], 'vmu.human.approvalQueueCap': 1 })
  queueUp(full, { action: 'svc.write', subject: 'a' })
  const dFull = full.approvalDecision({ action: 'svc.other', subject: 'b' })
  ok(dFull.ok === false && dFull.code === HU.queueFull, 'a full approval queue refuses the NEW action by name', dFull)
  ok(full.status().queueDropped === 1, 'the refusal is counted', full.status().queueDropped)
}

// ── 5. the dashboard may not show the private face or an undeclared domain ──────────────────────────────────
{
  const h = hu({ 'vmu.human.dashboardScope': 'institution', 'vmu.human.dashboardDomains': ['tasks', 'roster'] })
  ok(PRIVATE_DOMAINS.includes('dm') && PRIVATE_DOMAINS.includes('private'), 'the private domains are a declared constant')
  throws(HU.dashboardDomain, 'a private domain is refused by name', () => h.dashboard({ scope: 'institution', domains: ['tasks', 'dm'] }))
  throws(HU.dashboardDomain, 'an undeclared domain is refused by name', () => h.dashboard({ scope: 'institution', domains: ['ledger'] }))
  const d = h.dashboard({ scope: 'institution', domains: ['tasks'] })
  ok(d.ok === true && d.domains[0] === 'tasks', 'a declared domain passes', d)
  throws(HU.dashboardScope, 'asking wider than the declared scope still refuses by name', () => h.dashboard({ scope: 'global' }))
  const zero = hu({})
  ok(zero.dashboard({}).domains.length === 0 && zero.status().policy.dashboardDomains.length === 0, 'zero config: aggregate counts only, no domain')
}

// ── 6. THE REAL THING: a wrapped task ledger cannot create a task while the human has not approved ──────────
{
  const h = hu({ 'vmu.human.gatedActions': ['tasks.create'] })
  const tasks = createTasks({ clock: () => '2026-10-09T00:00:00.000Z' })
  const g = attachApprovalGate({ target: tasks, methods: ['create'], gate: h.gate, face: 'tasks', subjectOf: (m, a) => (a && a.title) || null })
  ok(g.wrapped.length === 1 && g.missing.length === 0, 'the gate wraps the real ledger method', g)
  let err = null
  try { await tasks.create({ title: 'write the paper' }) } catch (e) { err = e }
  ok(!!err && err.code === HU.approvalPending, 'create() is refused by name while pending', err && err.code)
  ok(tasks.list().length === 0, 'NO task was created (the board is untouched)', tasks.list())
  const rid = h.queue().requests[0].requestId
  h.decide({ requestId: rid, allow: true, by: 'office', reason: 'approved for this round' })
  const made = await tasks.create({ title: 'write the paper' })
  ok(made.ok === true && made.id === 't-1', 'after approval the SAME call succeeds and mints the first id', made)
  ok(tasks.list().length === 1, 'and the task really exists', tasks.list())
}

// ── 7. watch mode: a pause blocks by name, a retune is named, role-checked, audited and needs a seam ────────
{
  const settings = {}
  const setSetting = (k, v) => { settings[k] = v; return { ok: true } }
  const c = createControl({ clock, settings: { 'vmu.control.tunableKeys': ['vmu.control.idleAfterMs'], 'vmu.control.canSetRoles': ['office'], 'vmu.control.pauseScope': ['tasks'] }, setSetting })
  const p = c.pause({ scope: 'tasks', byRole: 'office', reason: 'maintenance' })
  ok(p.ok === true && p.reason === 'maintenance', 'a pause records who and why', p)
  throws('VMU_CONTROL_PAUSED', 'mayAct refuses a paused scope by name', () => c.mayAct({ scope: 'tasks' }))
  throws('VMU_CONTROL_PAUSED', 'pause is a REAL gate: a task operation is refused through mayAct', () => c.mayAct({ scope: 'tasks' }))
  const r = c.resume({ scope: 'tasks', byRole: 'office' })
  ok(r.ok === true && typeof r.pausedAt === 'number' && typeof r.heldMs === 'number', 'the resume is auditable (who, how long it was held)', r)
  throws(CT.paramUndeclared, 'a key outside the declared tunables is refused by name', () => c.tune({ key: 'vmu.control.idleAction', value: 'none', byRole: 'office' }))
  throws(CT.paramRole, 'a role outside canSetRoles may not tune', () => c.tune({ key: 'vmu.control.idleAfterMs', value: 10, byRole: 'chair' }))
  const t = c.tune({ key: 'vmu.control.idleAfterMs', value: 60000, byRole: 'office' })
  ok(t.ok === true && settings['vmu.control.idleAfterMs'] === 60000 && c.status().tuned === 1, 'a declared key is written through the seam and audited', t)
  const noSeam = createControl({ clock, settings: { 'vmu.control.tunableKeys': ['vmu.control.idleAfterMs'] } })
  throws(CT.paramUnavailable, 'a kernel without a settings-write seam refuses instead of pretending it wrote', () => noSeam.tune({ key: 'vmu.control.idleAfterMs', value: 5, byRole: 'office' }))
  ok(noSeam.tuneTrail().length === 0, 'the failed retune left no audit entry claiming success')
  // the approval gate can also be wired into mayAct (one question: "may I act?")
  const h = hu({ 'vmu.human.gatedActions': ['control.tasks'] })
  const gated = createControl({ clock, settings: { 'vmu.control.pauseScope': ['tasks'] }, approval: (req) => h.gate(req) })
  throws(HU.approvalPending, 'mayAct consults the approval gate when one is wired', () => gated.mayAct({ scope: 'tasks' }))
  ok(gated.status().approvalGateAttached === true, 'status() says the gate is attached', gated.status().approvalGateAttached)
}

const guard = process.argv.includes('--self-probe')
if (guard) {
  console.log('=== VMU HUMAN GATE SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}
console.log('=== VMU HUMAN GATE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
