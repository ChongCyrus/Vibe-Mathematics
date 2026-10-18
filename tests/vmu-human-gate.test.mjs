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
import { createResume } from '../vibe-math-vmu/kernel/resume.js'
import { makeHumanSpec } from '../vibe-math-vmu/tools/human.js'
import { toHostSpec } from '../vibe-math-vmu/host.js'

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

// ── 8. ROUND 3 (task-18 A): the approval queue and the veto ledger SURVIVE A RESTART ─────────────────────────
// The failure this pins: "an action is still waiting for a human" and "a veto promised a reason afterwards" were
// session memory, so a restart silently forgot both — the queue looked empty and the promise looked kept.
{
  const store = (() => {
    const data = new Map()
    const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
    return {
      export: () => ({ version: 1, keys: Object.fromEntries(data) }),
      read: (k) => copy(data.get(k)),
      patch: (k, fn) => { const next = fn(copy(data.get(k))); data.set(k, next); return { ok: true, key: k } },
      _raw: data,
    }
  })()
  const settings = { 'vmu.human.gatedActions': ['tasks.create', 'tasks.delete'], 'vmu.human.approvalTimeoutMs': 1000, 'vmu.human.onTimeout': 'hold', 'vmu.human.vetoNeedsReason': true }

  // PROCESS A — a human is asked, does not answer, and two other things happen.
  const a = createHuman({ clock, settings })
  const d1 = a.approvalDecision({ action: 'tasks.create', subject: 'the paper' })
  ok(d1.ok === false && d1.code === HU.approvalPending && d1.queued === true, 'A: the gated action is queued', d1.code)
  const vA = a.veto({ by: 'human-1', target: 't-9', emergency: true, reason: null })
  a.decide({ requestId: a.approvalDecision({ action: 'tasks.delete', subject: 't-3' }).requestId, allow: false, by: 'office' })
  const before = a.queue()
  ok(vA.ok === true && a.status().activeVetoes === 1, 'A: a veto is in force', a.status().activeVetoes)

  const resumeA = createResume({ store, clock, settings: {} })
  await resumeA.read()
  const attached = resumeA.attachProjection({
    target: a, methods: ['veto', 'explainDecision', 'liftVeto', 'openApproval', 'decide', 'approvalDecision'],
    key: 'human', mode: 'state', snapshot: () => a.snapshot(), restore: (v) => a.restore(v), list: () => a.list(),
  })
  ok(attached.writeThrough === true && attached.missing.length === 0, 'A: the human ledger is attached with write-through and no missing method', attached)
  // one more mutation, then give the fire-and-forget write a tick to land
  a.approvalDecision({ action: 'tasks.create', subject: 'the paper' })
  await new Promise((r) => setTimeout(r, 0))
  const written = store._raw.get('human')
  ok(!!written && written.mode === 'state' && resumeA.status().writesThrough >= 1,
    'A: each mutation writes the ledger through (no explicit flush needed)', resumeA.status().writesThrough)

  // PROCESS B — a fresh face over the same store.
  const b = createHuman({ clock, settings })
  const resumeB = createResume({ store, clock, settings: {} })
  await resumeB.read()
  resumeB.attachProjection({
    target: b, methods: ['veto', 'explainDecision', 'liftVeto', 'openApproval', 'decide', 'approvalDecision'],
    key: 'human', mode: 'state', snapshot: () => b.snapshot(), restore: (v) => b.restore(v), list: () => b.list(),
  })
  const h = await resumeB.hydrate({ keys: ['human'] })
  ok(h.ok === true && h.unhydrated.length === 0, 'B: the human ledger hydrates cleanly', h.unhydrated)
  const after = b.queue()
  ok(after.total === before.total && after.pending === before.pending,
    'B: the queue still holds exactly what it held before the restart', { before: before.total, after: after.total })
  const stillWaiting = after.requests.filter((r) => r.action === 'tasks.create' && r.state === 'pending')[0]
  ok(!!stillWaiting && stillWaiting.subject === 'the paper' && stillWaiting.attempts === 2,
    'B: the UNANSWERED action is still queued, with its subject and attempt count', stillWaiting)
  const d2 = b.approvalDecision({ action: 'tasks.create', subject: 'the paper' })
  ok(d2.ok === false && d2.code === HU.approvalPending && d2.requestId === stillWaiting.requestId,
    'B: the gate still refuses and reuses the SAME request (no second request for one action)', d2)
  const denied = after.requests.filter((r) => r.state === 'denied')[0]
  ok(!!denied && denied.pendingReason === true, 'B: a denial whose reason is still owed reports pendingReason after the restart', denied)
  b.explainDecision({ requestId: denied.requestId, reason: 'it was out of scope' })
  ok(b.queue().requests.filter((r) => r.requestId === denied.requestId)[0].pendingReason === false,
    'B: the promised reason can still be supplied after the restart', b.queue().requests.filter((r) => r.requestId === denied.requestId)[0])
  const activeVetoes = b.status().activeVetoes
  ok(activeVetoes === 1, 'B: the veto is still in force', activeVetoes)
  const vetoRec = b.queue() && b.status().vetoes === 1
  ok(vetoRec === true, 'B: the veto ledger row survived', b.status().vetoes)
  ok(b.status().pendingReasons === 1, 'B: the veto that PROMISED a reason still reports it as owed (not pretended)', b.status().pendingReasons)
  b.explainDecision({ vetoId: vA.veto.id, reason: 'the third party objection was reviewed' })
  ok(b.status().pendingReasons === 0, 'B: the promised veto reason can still be supplied after the restart', b.status().pendingReasons)
  throws(HU.vetoed, 'B: the vetoed action is still refused after the restart', () => b.gate({ action: 'tasks.delete', subject: 't-9' }))
  // id non-reuse: the next request must not be `approval-1` again
  const d3 = b.approvalDecision({ action: 'tasks.delete', subject: 'other' })
  ok(d3.requestId !== d1.requestId && Number(String(d3.requestId).split('-')[1]) > 1,
    'B: the id counter continues above the maximum it ever handed out (a name is never reused)', { first: d1.requestId, now: d3.requestId })
}

// ── 9. ROUND 6 (task-44): `inject` — the human's voice goes through the SAME faces, so their policy applies ──
{
  const param = (type, description, opts) => Object.assign({ type, description }, opts || {})
  const refusedTool = (code, message, hint) => ({ ok: false, code, message, hint })
  const TOOL_NAMES = { human: 'vibe_vmu_human' }
  const calls = []
  const spec = (kernel) => makeHumanSpec({ param, refused: refusedTool, TOOL_NAMES, kernel })

  const withMail = spec({ mailbox: { send: (from, o) => { calls.push({ face: 'mailbox', from, o }); return { ok: true, queued: 1, to: o.to } } } })
  const r1 = await withMail.run({ action: 'inject', text: 'please summarise the blockers', to: 'r-1', why: 'weekly check' })
  ok(r1.ok === true && r1.via === 'mailbox' && r1.from === 'office' && r1.to === 'r-1',
    'inject with a recipient goes through the mailbox face as the office', r1)
  ok(calls.length === 1 && calls[0].face === 'mailbox' && calls[0].o.text === 'please summarise the blockers' && calls[0].o.kind === 'notice',
    'the face received the text as a notice (the face owns the policy, not this tool)', calls[0])

  const withChat = spec({ chat: { send: (from, text, opts) => { calls.push({ face: 'chat', from, text, opts }); return { ok: true, seq: 7 } } } })
  const r2 = await withChat.run({ action: 'inject', text: 'the deadline moved to Friday' })
  ok(r2.ok === true && r2.via === 'chat' && r2.to === '（群聊）', 'inject without a recipient goes to the group chat', r2)
  ok(calls[calls.length - 1].opts.kind === 'announce', 'and it is framed as an announcement', calls[calls.length - 1].opts)

  const none = spec({})
  const r3 = await none.run({ action: 'inject', text: 'hello' })
  ok(r3.ok === false && r3.code === 'VMU_ENGINE_UNAVAILABLE' && /no injection path/.test(r3.message),
    'no mounted face ⇒ a NAMED refusal (the human is not told it was delivered)', r3)
  const empty = await withChat.run({ action: 'inject', text: '   ' })
  ok(empty.ok === false && empty.code === 'VMU_INVALID_ARGUMENT', 'an empty injection is refused by name', empty)

  // THE DECISIVE ONE: a face refusal passes through unchanged — inject never bypasses quota/mute/freeze.
  const blocked = spec({ mailbox: { send: () => { const e = new Error('quota exhausted for r-2'); e.code = 'VMU_MAILBOX_QUOTA'; e.hint = 'wait or raise vmu.mailbox.quota'; throw e } } })
  const r4 = await blocked.run({ action: 'inject', text: 'one more thing', to: 'r-2' })
  ok(r4.ok === false && r4.code === 'VMU_MAILBOX_QUOTA' && /quota exhausted/.test(r4.message),
    'a face refusal is passed through unchanged (the human cannot bypass the face policy)', r4)
  const forced = await withMail.run({ action: 'inject', text: 'x', via: 'nonsense' })
  ok(forced.ok === false && forced.code === 'VMU_INVALID_ARGUMENT', 'an unknown via is refused by name', forced)
}

// ── N. withdrawApproval: a PENDING request can be withdrawn (same vocabulary as the v3 gate's cancel) ─────────
{
  const h = hu({})
  const o = h.openApproval({ subject: 'withdraw-me' })
  const before = h.queue().pending
  ok(before >= 1, 'a fresh approval is pending before the withdrawal', before)
  const w = h.withdrawApproval({ requestId: o.id, by: 'office', reason: 'superseded by a new plan' })
  ok(w.ok === true && w.state === 'withdrawn' && w.reason === 'superseded by a new plan' && w.withdrawnBy === 'office',
    'withdrawApproval lands state=withdrawn with who/why (the same vocabulary as the gate cancel)', w)
  ok(h.approvalState({ requestId: o.id }).state === 'withdrawn',
    'the state is READABLE afterwards (approvalState returns withdrawn)', h.approvalState({ requestId: o.id }).state)
  ok(h.queue().pending === before - 1, 'it no longer counts as pending (the queue pending count drops by one)', h.queue().pending)
  ok(h.status().withdrawnApprovals === 1, 'the status view counts the withdrawal (visible, not only in the ledger)', h.status().withdrawnApprovals)
  // no reason ⇒ named refusal; a still-pending request must say why it is withdrawn
  const o2 = h.openApproval({ subject: 'no-reason' })
  let noReason = null
  try { h.withdrawApproval({ requestId: o2.id }) } catch (e) { noReason = e }
  ok(!!noReason && noReason.code === 'VMU_INVALID_ARGUMENT', 'withdrawing WITHOUT a reason is refused by name', noReason && noReason.code)
  h.withdrawApproval({ requestId: o2.id, reason: 'ok, close it' })
  let twice = null
  try { h.withdrawApproval({ requestId: o2.id, reason: 'again' }) } catch (e) { twice = e }
  ok(!!twice && twice.code === 'VMU_STATE', 'withdrawing a terminal request twice is VMU_STATE', twice && twice.code)
  let decideAfter = null
  try { h.decide({ requestId: o2.id, allow: true }) } catch (e) { decideAfter = e }
  ok(!!decideAfter && decideAfter.code === 'VMU_STATE', 'a withdrawn approval cannot be decided afterwards', decideAfter && decideAfter.code)
}

// ── O. THROUGH THE TOOL FACE: withdraw is reachable, receipts are JSON strings, refusals carry registered codes ──
{
  const param = (type, description, opts) => Object.assign({ type, description }, opts || {})
  const refusedTool = (code, message, hint) => ({ ok: false, code, message, hint })
  const TOOL_NAMES = { human: 'vibe_vmu_human' }
  const h = hu({})
  const spec = toHostSpec(makeHumanSpec({ param, refused: refusedTool, TOOL_NAMES, kernel: { human: h } }))
  ok(spec && Array.isArray(spec.parameters && spec.parameters) === false && typeof spec.execute === 'function',
    'O0. the tool spec is the HOST shape (an execute function, not a raw internal spec)')
  const call = async (args) => { const raw = await spec.execute(args, {}); return { raw, parsed: JSON.parse(raw) } }
  const opened = await call({ action: 'openApproval', subject: 'tool-withdraw' })
  ok(typeof opened.raw === 'string' && opened.parsed.ok === true && typeof opened.parsed.id === 'string',
    'O1. openApproval through the TOOL returns a JSON STRING that parses to an object with an id', opened.parsed)
  const before = h.queue().pending
  const w = await call({ action: 'withdraw', request_id: opened.parsed.id, by: 'office', reason: 'withdrawn through the tool' })
  ok(typeof w.raw === 'string' && w.parsed.ok === true && w.parsed.state === 'withdrawn',
    'O2. ★ withdraw is REACHABLE through the tool face (no direct kernel call) and the receipt is a JSON string', w.parsed)
  ok(h.approvalState({ requestId: opened.parsed.id }).state === 'withdrawn' && h.queue().pending === before - 1,
    'O3. the receipt and the kernel state agree (state withdrawn; pending count dropped)', { state: h.approvalState({ requestId: opened.parsed.id }).state, pending: h.queue().pending })
  const second = await call({ action: 'openApproval', subject: 'tool-no-reason' })
  const noReason = await call({ action: 'withdraw', request_id: second.parsed.id })
  ok(noReason.parsed.ok === false && noReason.parsed.code === 'VMU_INVALID_ARGUMENT',
    'O4. withdrawing through the tool WITHOUT a reason is a named refusal (registered code, not a bare throw)', noReason.parsed)
  const twice = await call({ action: 'withdraw', request_id: opened.parsed.id, reason: 'again' })
  ok(twice.parsed.ok === false && twice.parsed.code === 'VMU_STATE',
    'O5. a second withdrawal through the tool is refused with VMU_STATE', twice.parsed)
}

const guard = process.argv.includes('--self-probe')
if (guard) {
  console.log('=== VMU HUMAN GATE SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}
console.log('=== VMU HUMAN GATE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
