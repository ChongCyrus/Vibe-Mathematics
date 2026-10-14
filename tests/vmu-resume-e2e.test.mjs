// tests/vmu-resume-e2e.test.mjs — ROUND 8 / task-62: the GOAL 1 END-TO-END DRILL.
//
// One reproducible scenario that puts "resume" and "human intervention" together over a REAL durable store on
// disk (createStore → <root>/vmu/state.json, atomic temp+rename) and REAL faces (work ledger, mailbox, human
// gate, tasks, control, storepolicy lock, ids minter, resume engine):
//
//   ① boot an institute: recover, dispatch work, leave mail unacknowledged, PAUSE, inject a human instruction, resume;
//   ② a gated action is attempted and DOES NOT RUN (it queues);
//   ③ RESTART: a brand-new set of instances opens the SAME store file;
//   ④ assert the restart: pendingWork named + interrupted, unacked-mail count, the recovery lock taken and
//      released, re-dispatch offered ONLY to the missing member and BOUNDED by a durable counter,
//      restart.generation incremented;
//   ⑤ the human half: the approval queue is still queued (requestId reused, pendingReason kept), the veto is
//      still in force and can still be lifted, and the un-approved action REALLY had not run;
//   ⑥ a third boot: the durable bound stops a crash loop from re-dispatching forever.
//
// WHAT THIS FILE IS NOT: it does not drive a host (no subagents), so "re-dispatch" is a recorded callback, not a
// real child spawn; `chat` is absent, so `inject` takes the mailbox path; time is the injected clock.
//
// TWO PROCESS-BOUNDARY FACTS THE DRILL HAS TO HONOUR (both are findings, not conveniences):
//   · A write-through is ASYNC (`store.patch` → real file I/O). A "restart" that opens the file in the same tick
//     would see nothing. `settle()` waits for the durable writes to land, exactly as a real process exit would.
//   · A JOURNAL projection has NO write-through: nothing is durable until the assembly calls
//     `resume.snapshot({ key })`. `quiesce()` is that graceful-exit flush, and the drill ASSERTS the gap (2i)
//     before using it, so "the journal survived the restart" is never mistaken for "recording is durable".
//
// Last line: === VMU GOAL1 E2E: N passed, M failed ===
import { rmSync, mkdirSync } from 'node:fs'
import { createStore } from '../vibe-math-vmu/kernel/store.js'
import { createWorkLedger } from '../vibe-math-vmu/kernel/work.js'
import { createMailbox } from '../vibe-math-vmu/kernel/mailbox.js'
import { createHuman, attachApprovalGate, CODE as HU } from '../vibe-math-vmu/kernel/human.js'
import { createTasks } from '../vibe-math-vmu/kernel/tasks.js'
import { createControl } from '../vibe-math-vmu/kernel/control.js'
import { createStorePolicy } from '../vibe-math-vmu/kernel/storepolicy.js'
import { createResume } from '../vibe-math-vmu/kernel/resume.js'
import { createDurableCommitLog } from '../vibe-math-vmu/kernel/ballot.js'
import { bindIds, hydrateIds } from '../vibe-math-vmu/kernel/ids.js'
import { makeHumanSpec } from '../vibe-math-vmu/tools/human.js'

const ROOT = 'D:/_tmp/vmu-goal1-e2e'
const line = (s) => console.log('  ' + s)
let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}
const refuses = async (code, name, fn) => {
  try { await fn(); ok(false, name, 'no refusal') } catch (e) { ok(e && e.code === code, name, (e && e.code) + ' | ' + (e && e.message)); return e }
}
let T = 1750000000000
const clock = () => (T += 1000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const bus = { events: [], emit: (name, payload) => { bus.events.push({ name, payload }); return Promise.resolve({ ok: true }) } }
const inbox = []            // the fake deliver seam: what the mailbox would hand to a member
const reassignCalls = []    // the fake re-dispatch policy: what the assembly WOULD rebuild
const ROSTER = [{ id: 'r-1', childId: 'c-live' }, { id: 'r-2', childId: 'c-gone' }]

/**
 * Section ⑦'s fake HOST commit-log store: the REAL protocol (`kernel/ballot.js createDurableCommitLog`) needs
 * only `append(record) -> {ticket}` and `readAll() -> [record]`. Tickets are allocated by the STORE (that is what
 * makes two processes' commits distinguishable); the outcome row reuses the intent's ticket.
 */
function makeCommitStore() {
  const rows = []
  return {
    rows,
    append(rec) {
      const given = rec && rec.ticket !== null && rec.ticket !== undefined ? Number(rec.ticket) : null
      const ticket = Number.isFinite(given) ? given : rows.length + 1
      rows.push(Object.assign({}, rec, { ticket }))
      return { ticket }
    },
    readAll() { return rows.map((r) => Object.assign({}, r)) },
  }
}

/**
 * Wait until every write-through that was STARTED has settled (succeeded or failed). The count is a real
 * observable (`status().writesThrough` / `.writeThroughFailures`); the loop never guesses a duration, it just
 * refuses to read the store while a durable write is still in flight.
 */
async function settle(resume, floor = 0) {
  for (let i = 0; i < 250; i += 1) {
    const s = resume.status()
    if (s.writesThrough + s.writeThroughFailures >= floor) return s
    await sleep(2)
  }
  return resume.status()
}

// ── the boot function: everything a fresh process builds, over the SAME store file ──────────────────────────
// `opts.root` / `opts.queue` exist for section ⑦ (the G7 positive control): a second store root and a BOUND
// durable commit log. The main three-boot timeline passes neither, so its wiring is bit-for-bit what it was.
async function boot(tag, opts = {}) {
  const root = opts.root || ROOT
  const store = createStore({ root, clock })
  await store.open()
  bindIds({ store, clock, log: { append: () => {} } })
  await hydrateIds()
  const work = createWorkLedger({ store, clock })
  const mailbox = createMailbox({ clock, log: () => {}, settings: {}, bus, store, durableQueue: opts.queue || null, deliver: (msg) => { inbox.push(msg); return true } })
  const human = createHuman({ clock, settings: { 'vmu.human.gatedActions': ['tasks.create'], 'vmu.human.approvalTimeoutMs': 0, 'vmu.human.vetoNeedsReason': true } })
  const ctrl = createControl({ clock, settings: { 'vmu.control.pauseScope': ['tasks'], 'vmu.control.canPauseRoles': ['office'] }, bus, log: null })
  const tasks = createTasks({ clock, isPaused: () => ctrl.status().paused.length > 0 })
  attachApprovalGate({ target: tasks, methods: ['create'], gate: human.gate, face: 'tasks', subjectOf: (m, a) => (a && a.title) || null })
  const lock = createStorePolicy({ settings: { 'vmu.store.lock': true }, clock, log: () => {} })
  const resume = createResume({
    store, work, control: ctrl, settings: {}, bus, clock, log: { append: () => {} },
    lock,
    mailbox: () => { const out = []; for (const [m, info] of Object.entries(mailbox.boxes())) if (info.pending) for (const e of mailbox.pending(m)) out.push({ id: e.id, member: m }); return out },
    roster: () => ROSTER,
    children: { parentId: () => 'root-session', list: async () => ['c-live'] },
    // maxAttempts 2 on purpose: boot 1 re-provisions the missing child (attempt 1), boot 2 offers it ONE more
    // time (attempt 2) and boot 3 must refuse to offer it again — that is the durable bound, measured.
    reassign: { maxAttempts: 2, apply: async (req) => { reassignCalls.push(req); return { ok: true } } },
  })
  await resume.read()      // the assembly's start path: read before any write
  // the assembly's projection wiring: tasks = journal, human/mailbox = state + WRITE-THROUGH
  resume.attachProjection({ target: tasks, methods: ['create', 'assign', 'transition', 'brief', 'clearBrief', 'advance', 'rollback'], key: 'tasks', mode: 'journal', list: () => tasks.list() })
  resume.attachProjection({ target: human, methods: ['veto', 'explainDecision', 'liftVeto', 'openApproval', 'decide', 'approvalDecision'], key: 'human', mode: 'state', snapshot: () => human.snapshot(), restore: (v) => human.restore(v), list: () => human.queue().requests })
  // the mailbox face self-persists on `persist()`; wiring it as a state projection makes every mutation write through
  // (without this row, mail sent and not explicitly persisted dies with the process — measured in this drill).
  resume.attachProjection({ target: mailbox, methods: ['send', 'ack'], key: 'mailbox', mode: 'state', snapshot: () => mailbox.snapshot(), restore: (v) => mailbox.hydrate(v), list: () => [] })
  const recovery = await resume.recover({ reason: 'kernel-start' })
  const humanTool = makeHumanSpec({
    param: (t, d, o) => Object.assign({ type: t, description: d }, o || {}),
    refused: (code, message, hint) => ({ ok: false, code, message, hint }),
    TOOL_NAMES: { human: 'vibe_vmu_human' },
    kernel: { human, mailbox, chat: { send: () => ({ ok: false, code: 'VMU_CHAT_NOT_IN_THIS_DRILL' }) }, recovery: resume },
  })
  return { tag, store, work, mailbox, human, ctrl, tasks, lock, resume, humanTool, recovery }
}

/**
 * The assembly's GRACEFUL-EXIT path, i.e. what a real process does before it dies: let the async state
 * write-throughs land, then FLUSH every journal projection by name (the journal has no write-through at all).
 */
async function quiesce(K, journal = [], floor = 0) {
  const s = await settle(K.resume, floor)
  for (const key of journal) await K.resume.snapshot({ key })
  return s
}

// ── ⓪ clean slate ──────────────────────────────────────────────────────────────────────────────────────────
rmSync(ROOT, { recursive: true, force: true })
mkdirSync(ROOT, { recursive: true })
line('store root: ' + ROOT + ' (fresh)')

// ── ① BOOT 1: recover, dispatch, mail, PAUSE, inject, resume ───────────────────────────────────────────────
console.log('\n[1] boot 1 — recover, dispatch work, leave mail unread, pause, inject, resume')
const A = await boot('boot-1')
ok(A.recovery.ok === true && A.resume.status().restart.generation === 1 && A.recovery.unhydrated.length === 0,
  '1a the first boot recovers cleanly on a BRAND-NEW store (generation 1: a first start is still a recorded recovery)',
  { ok: A.recovery.ok, unhydrated: A.recovery.unhydrated, restart: A.resume.status().restart })
const re1 = A.recovery.steps.filter((s) => s.step === 'reassign')[0]
ok(re1.applied.length === 1 && re1.applied[0].member === 'r-2' && re1.applied[0].attempt === 1 && reassignCalls.length === 1,
  '1b the FIRST start already reconciles the roster: the one missing child is offered to the policy (attempt 1)',
  { applied: re1.applied, calls: reassignCalls.length })

const started = await A.work.start({ owner: 'r-1', kind: 'proof', objective: 'prove lemma L' })
ok(started.ok === true && typeof started.entry.id === 'string', '1c dispatched work is registered in the durable in-flight ledger', started.entry)
line('work: ' + started.entry.id + ' owner=' + started.entry.owner + ' kind=' + started.entry.kind)

const sent = A.mailbox.send('office', { to: 'r-1', text: 'please report the blockers', kind: 'notice' })
ok(sent.ok === true && A.mailbox.pending('r-1').length === 1, '1d the office queued one durable mail entry for r-1 (unacknowledged)', sent)

const paused = A.ctrl.pause({ scope: 'tasks', byRole: 'office', reason: 'maintenance' })
ok(paused.ok === true, '1e the human PAUSED the task surface', paused)
// NAMED OBSERVATION (the drill measured it, so it is asserted as it IS, not as one might wish): the approval gate
// wraps `tasks.create` OUTSIDE the pause check, so a paused attempt is refused by the GATE, and it opens a request
// while it does. The pause still holds — 1g shows nothing was created.
await refuses(HU.approvalPending, '1f an attempt while paused is refused by name (the gate runs BEFORE the pause check)',
  () => A.tasks.create({ title: 'while paused' }))
ok(A.tasks.list().length === 0, '1g nothing was created while paused', A.tasks.list().length)

const injected = await A.humanTool.run({ action: 'inject', text: 'deadline moved: report by Friday', to: 'r-1', why: 'e2e step 1' })
ok(injected.ok === true && injected.via === 'mailbox' && injected.from === 'office',
  '1h the human INJECTED an instruction mid-run (mailbox path, office voice)', injected)
ok(A.mailbox.pending('r-1').length === 2, '1i the injection is a second unread entry (the restart must count 2)', A.mailbox.pending('r-1').length)

const resumed = A.ctrl.resume({ scope: 'tasks', byRole: 'office' })
ok(resumed.ok === true && typeof resumed.heldMs === 'number', '1j the human RESUMED the surface (with an auditable hold time)', resumed)

// ── ② the gated action really does not run ─────────────────────────────────────────────────────────────────
console.log('\n[2] the approval gate — a real action is attempted and must NOT run')
await refuses(HU.approvalPending, '2a creating a gated task is refused while no human approved it',
  () => A.tasks.create({ title: 'the paper' }))
ok(A.tasks.list().length === 0, '2b the board is EMPTY: the action did not run (the gate is real)', A.tasks.list().length)
const queued = A.human.queue()
ok(queued.pending === 2 && queued.requests.some((r) => r.subject === 'the paper'),
  '2c the queue holds the waiting request(s); the paused attempt ALSO opened one (the gate runs before the pause check)', queued.requests.map((r) => r.subject))
const pendingRequestId = queued.requests.filter((r) => r.subject === 'the paper')[0].requestId
line('human queue: ' + queued.requests.map((r) => r.subject + '#' + r.requestId + '(' + r.state + ')').join(' '))

const veto = A.human.veto({ by: 'human-1', target: 't-9', emergency: true })
const deniedRid = A.human.approvalDecision({ action: 'tasks.create', subject: 'something else' }).requestId
A.human.decide({ requestId: deniedRid, allow: false, by: 'office' })
ok(A.human.status().pendingReasons === 1, '2d the veto that promised a reason is recorded as owing one', A.human.status().pendingReasons)
ok(A.human.queue().requests.filter((r) => r.requestId === deniedRid)[0].pendingReason === true,
  '2e the denial that promised a reason is recorded as owing one too', A.human.queue().requests.filter((r) => r.requestId === deniedRid)[0])
line('human: total=' + A.human.queue().total + ' pending=' + A.human.queue().pending + ' activeVetoes=' + A.human.status().activeVetoes + ' vetoPendingReasons=' + A.human.status().pendingReasons)

// WRITE-THROUGH, MEASURED BEFORE THE RESTART AND WITHOUT ANY EXPLICIT snapshot() CALL: if this were false, the
// human half below would survive for a reason the drill did not test (an explicit flush), i.e. it would prove nothing.
const stA = await settle(A.resume, 5)
ok(stA.writesThrough >= 5 && stA.writeThroughFailures === 0,
  '2f every wrapped human/mailbox mutation was followed by one state write (write-through, no explicit snapshot)',
  { writesThrough: stA.writesThrough, failures: stA.writeThroughFailures, writes: stA.writes })
const foldA = A.store.export().keys
ok(foldA.human && foldA.human.mode === 'state' && foldA.human.key === 'human' && foldA.human.value &&
  foldA.human.value.face === 'human' && foldA.human.value.data.approvals.length === 3 && foldA.human.value.data.vetoes.length === 1,
  '2g the human ledger is ALREADY a real state envelope in the fold (3 requests + 1 veto durable before the restart)',
  foldA.human && { mode: foldA.human.mode, key: foldA.human.key, digest: foldA.human.digest, value: foldA.human.value && { face: foldA.human.value.face, approvals: (foldA.human.value.data || {}).approvals && foldA.human.value.data.approvals.length, vetoes: (foldA.human.value.data || {}).vetoes && foldA.human.value.data.vetoes.length } })
ok(foldA.mailbox && foldA.mailbox.mode === 'state' && foldA.mailbox.key === 'mailbox',
  '2h the mailbox snapshot is durable too (2 unacknowledged entries live in the fold)', foldA.mailbox && { mode: foldA.mailbox.mode, key: foldA.mailbox.key })
// THE NAMED GAP: the journal key is still the store's seed. Nothing there is durable until the assembly flushes it.
ok(Array.isArray(foldA.tasks) && foldA.tasks.length === 0,
  '2i NAMED GAP: the `tasks` journal has NO write-through — it is still the empty seed in the fold', foldA.tasks)
await quiesce(A, ['tasks'], 5)
const journalA = A.store.read('tasks')
ok(!!journalA && journalA.mode === 'journal' && journalA.entries.length === 2 && journalA.entries.every((e) => e.failed === true),
  '2j the assembly\'s exit flush makes the journal durable: 2 recorded REFUSED commands, both marked failed (they are history, not state)',
  journalA && { entries: journalA.entries.map((e) => e.method + ':' + e.failed) })

// ── ③ RESTART: brand-new instances over the very same store file ───────────────────────────────────────────
console.log('\n[3] RESTART — a new process opens the same store file')
const B = await boot('boot-2')
const rec = B.recovery
ok(rec.ok === true, '3a the second boot recovers successfully', rec.steps.map((s) => s.step + '=' + s.ok))
line('recovery steps: ' + rec.steps.map((s) => s.step + (s.ok ? '✓' : '✗')).join(' '))
const ledgerStep = rec.steps.filter((s) => s.step === 'ledgers')[0]
const taskRow = ledgerStep.hydrated.filter((h) => h.key === 'tasks')[0]
ok(ledgerStep.ok === true && taskRow && taskRow.hydrated === true && taskRow.skippedFailed === 2,
  '3b the task journal hydrated, applied 0 commands and SKIPPED the 2 failed (refused) ones it had recorded',
  { ok: ledgerStep.ok, tasks: taskRow, unhydrated: ledgerStep.unhydrated })
ok(ledgerStep.hydrated.filter((h) => h.key === 'human' && h.hydrated === true).length === 1 &&
  ledgerStep.hydrated.filter((h) => h.key === 'mailbox' && h.hydrated === true).length === 1,
  '3c the two STATE projections were restored from their envelopes (human, mailbox)', ledgerStep.hydrated)
ok(B.resume.status().restart.generation === 2,
  '3d restart.generation is DURABLE and incremented (2)', B.resume.status().restart)
ok(B.resume.restart().durableKey === 'resume' && B.resume.status().restart.reason === 'kernel-start',
  '3e the marker is derived from the durable key and names the reason', B.resume.status().restart)

const inflight = B.resume.status().inflight
ok(inflight.interrupted.length === 1 && inflight.interrupted[0].owner === 'r-1' && /kernel-start/.test(String(inflight.interrupted[0].reason)),
  '4a pendingWork: the dispatched work is INTERRUPTED and NAMED after the restart', inflight.interrupted)
ok(inflight.pending.length === 1 && inflight.pendingNow === 0,
  '4b pendingWork: it FOUND one item and nothing is left open', inflight)
ok(inflight.unackedMail === 2 && inflight.unackedMailSource === 'port',
  '4c unacknowledged mail is counted after the restart (2: the request + the injected instruction)', inflight)
const lockState = B.resume.status().lock
ok(lockState.attached === true && lockState.acquisitions === 1 && lockState.releases === 1 && lockState.held === false && B.lock.status().locks === 0,
  '4d the recovery took the REAL store lock and released it in the finally', lockState)
ok(B.resume.status().ports.lock === true && B.resume.status().ports.roster === true && B.resume.status().ports.children === true && B.resume.status().ports.mailbox === true,
  '4e the wired recovery ports are visible (lock/roster/children/mailbox)', B.resume.status().ports)

const re = rec.steps.filter((s) => s.step === 'reassign')[0]
ok(re && re.attached === true && reassignCalls.length === 2 && reassignCalls.every((c) => c.member === 'r-2') && !reassignCalls.some((c) => c.member === 'r-1'),
  '4f re-dispatch was offered ONLY to the missing member (r-2), never to the live one (r-1)', { calls: reassignCalls })
ok(re && re.applied.length === 1 && re.applied[0].member === 'r-2' && re.applied[0].attempt === 2,
  '4g the offer carries the member and the attempt number, counted ACROSS the restart (1 → 2)', re && re.applied)
ok(B.resume.status().reassignAttempts['r-2'] === 2, '4h the attempt counter is durable and readable', B.resume.status().reassignAttempts)

// ── ④ the HUMAN half across the restart ────────────────────────────────────────────────────────────────────
console.log('\n[4] the human half across the restart')
const q2 = B.human.queue()
const stillQueued = q2.requests.filter((r) => r.state === 'pending' && r.subject === 'the paper')[0]
ok(q2.pending === 2 && !!stillQueued && stillQueued.requestId === pendingRequestId,
  '5a the pending approval is STILL queued, with the SAME requestId after the restart', { pending: q2.pending, requestId: stillQueued && stillQueued.requestId, before: pendingRequestId })
ok(!!stillQueued && stillQueued.action === 'tasks.create' && stillQueued.attempts === 1,
  '5b its action and attempt count survived too', stillQueued)
const deniedRow = q2.requests.filter((r) => r.state === 'denied')[0]
ok(!!deniedRow && deniedRow.pendingReason === true && B.human.status().pendingReasons === 1,
  '5c the denial that still OWES a reason reports pendingReason after the restart', { deniedRow, vetoPendingReasons: B.human.status().pendingReasons })
ok(B.human.status().activeVetoes === 1 && B.human.status().vetoes === 1,
  '5d the veto is still in force and its ledger row survived', B.human.status())
await refuses(HU.vetoed, '5e the vetoed target is still refused after the restart', () => B.human.gate({ action: 'tasks.delete', subject: 't-9' }))
const lifted = B.human.liftVeto({ vetoId: veto.veto.id, by: 'office', reason: 'the objection was reviewed' })
ok(lifted.ok === true && B.human.status().activeVetoes === 0, '5f the veto can still be LIFTED after the restart (role + reason)', lifted)

// the un-approved action still has not run, and after an explicit allow it does — across the restart
ok(B.tasks.list().length === 0, '6a the board is STILL empty: the un-approved action never ran, even across a restart', B.tasks.list().length)
await refuses(HU.approvalPending, '6b the gate still refuses (same queued request, no second one)',
  () => B.tasks.create({ title: 'the paper' }))
ok(B.human.queue().requests.filter((r) => r.subject === 'the paper').length === 1, '6c no duplicate request was opened by the retry',
  B.human.queue().requests.filter((r) => r.subject === 'the paper').length)
B.human.decide({ requestId: pendingRequestId, allow: true, by: 'office', reason: 'approved after review' })
const made = await B.tasks.create({ title: 'the paper' })
ok(made.ok === true && made.id === 't-1', '6d once a human ALLOWS it, the same call succeeds (and mints the first id)', made)
ok(B.tasks.list().length === 1, '6e and the task really exists on the restarted board', B.tasks.list())
B.human.explainDecision({ vetoId: veto.veto.id, reason: 'reviewed' })
ok(B.human.status().pendingReasons === 0, '6f the promised veto reason can still be discharged after the restart', B.human.status().pendingReasons)

// ── ⑤ a THIRD boot: the durable bound stops a crash loop from re-dispatching forever ───────────────────────
console.log('\n[5] third boot — the re-dispatch bound is durable')
await quiesce(B, ['tasks'], 5)
const C = await boot('boot-3')
const re3 = C.recovery.steps.filter((s) => s.step === 'reassign')[0]
ok(C.recovery.ok === true && C.resume.status().restart.generation === 3,
  '7a the third boot recovers cleanly and the generation keeps counting restarts (3)',
  { ok: C.recovery.ok, unhydrated: C.recovery.unhydrated, generation: C.resume.status().restart.generation })
ok(reassignCalls.length === 2 && re3.applied.length === 0 && re3.exhausted.length === 1 && re3.exhausted[0].attempts === 2,
  '7b the third boot does NOT re-dispatch r-2 again (the durable counter is exhausted at maxAttempts 2)', { calls: reassignCalls.length, re3 })
ok(/crash loop/.test(String(re3.exhausted[0].reason)), '7c the exhaustion names its reason', re3.exhausted[0].reason)
ok(C.resume.status().restart.reassignExhausted === 1, '7d the marker reports it', C.resume.status().restart)
ok(C.tasks.list().length === 1 && C.human.queue().total === 3,
  '7e the board (rebuilt by replaying the journal) and the human ledger (restored from its envelope) both survived the third boot',
  { tasks: C.tasks.list().length, queue: C.human.queue().total })

// ── ⑥ the durable artifact is one real file ────────────────────────────────────────────────────────────────
console.log('\n[6] the durable artifact')
const stats = C.store.stats()
ok(stats.open === true && stats.version === 1 && typeof stats.file === 'string' && stats.file.indexOf('state.json') !== -1,
  '8a the state lives in ONE real file that the third process opened', stats)
line('store file: ' + stats.file + ' keys=' + stats.keys)
const raw = C.store.export()
ok(!!raw.keys.resume && !!raw.keys.work && !!raw.keys.human && !!raw.keys.mailbox && !!raw.keys.tasks,
  '8b the durable keys that carried the scenario all exist (resume/work/human/mailbox/tasks)', Object.keys(raw.keys))
line('durable keys: ' + Object.keys(raw.keys).sort().join(','))

// ── ⑦ POSITIVE CONTROL for G7 (asked by v5r-reader-c, Round 8): bind the REAL durable commit log ──────────
// The question: does wiring the mailbox to a durable commit log CHANGE either projection contract? The answer
// must be no — the state faces must still write through on their own, and the journal must still need the
// explicit flush. This is the cross-face positive control for G7's rewrite: it uses the REAL protocol
// (`createDurableCommitLog` from kernel/ballot.js) over a fake host store, and touches no other file.
console.log('\n[7] G7 positive control — durable commit log BOUND: both projection contracts unchanged')
const QROOT = 'D:/_tmp/vmu-goal1-e2e-queue'
rmSync(QROOT, { recursive: true, force: true })
mkdirSync(QROOT, { recursive: true })
const commitStore = makeCommitStore()
const qlog = createDurableCommitLog({ store: commitStore, clock, name: 'mailbox' })
ok(qlog.durable === true && qlog.status().durable === true && qlog.status().appended === 0,
  '9a the commit log is really durable (the REAL protocol from kernel/ballot.js, over a host store)', qlog.status())

const Q = await boot('boot-q1', { root: QROOT, queue: qlog })
ok(Q.recovery.ok === true && Q.resume.status().restart.generation === 1 && Q.recovery.unhydrated.length === 0,
  '9b a first boot with the queue BOUND still recovers cleanly (binding it is not a recovery port)',
  { ok: Q.recovery.ok, unhydrated: Q.recovery.unhydrated })
const qsent = Q.mailbox.send('office', { to: 'r-1', text: 'committed through the log', kind: 'notice' })
ok(qsent.ok === true && Q.mailbox.pending('r-1').length === 1,
  '9c the send still DELIVERS (the commit log wraps the body, it does not replace it)', qsent)
const qrec = qlog.recover()
const qrows = commitStore.rows
ok(qlog.status().appended === 1 && qrows.length === 2 && qrows[0].op && qrows[0].op.kind === 'mailbox-send' &&
  qrows[1].done === true && qrows[1].outcome === 'accepted' && qrec.pending.length === 0 && qrec.reason === 'the durable log is settled',
  '9d G7 recorded the INTENT then the OUTCOME (one appended intent + 2 host rows: mailbox-send / accepted; no pending commit)',
  { appended: qlog.status().appended, rows: qrows, recover: qrec })
await refuses(HU.approvalPending, '9e the approval gate still refuses the un-approved action with the queue bound',
  () => Q.tasks.create({ title: 'queued paper' }))

const qst = await settle(Q.resume, 2)
ok(qst.writesThrough >= 2 && qst.writeThroughFailures === 0,
  '9f CONTRACT 1 UNCHANGED: the state faces still WRITE THROUGH on every wrapped mutation (no explicit snapshot)',
  { writesThrough: qst.writesThrough, failures: qst.writeThroughFailures })
const qfold = Q.store.export().keys
ok(qfold.mailbox && qfold.mailbox.mode === 'state' && qfold.mailbox.value &&
  qfold.mailbox.value.data.boxes['r-1'] && qfold.mailbox.value.data.boxes['r-1'].length === 1,
  '9g CONTRACT 1 UNCHANGED: the mailbox state envelope is in the fold, without any snapshot() call',
  qfold.mailbox && { mode: qfold.mailbox.mode, boxes: qfold.mailbox.value && Object.keys(qfold.mailbox.value.data.boxes) })
ok(Array.isArray(qfold.tasks) && qfold.tasks.length === 0,
  '9h CONTRACT 2 UNCHANGED: the journal is STILL not written through (a commit log does not make it durable)', qfold.tasks)
await Q.resume.snapshot({ key: 'tasks' })
const qj = Q.store.read('tasks')
ok(!!qj && qj.mode === 'journal' && qj.entries.length === 1 && qj.entries[0].failed === true,
  '9i CONTRACT 2 UNCHANGED: the journal becomes durable only on the explicit flush (1 recorded refused command)',
  qj && { entries: qj.entries.map((e) => e.method + ':' + e.failed) })

const qlog2 = createDurableCommitLog({ store: commitStore, clock, name: 'mailbox' })
const Q2 = await boot('boot-q2', { root: QROOT, queue: qlog2 })
const qin = Q2.resume.status().inflight
ok(Q2.recovery.ok === true && qin.unackedMail === 1 && qin.unackedMailSource === 'port',
  '9j after the restart the unread mail comes from the STATE projection (1), not from the commit log', qin)
ok(qlog2.recover().pending.length === 0 && qin.unackedMail === 1,
  '9k the two durabilities are DIFFERENT things: the commit log says "settled" while 1 mail is still UNREAD',
  { log: qlog2.recover(), unackedMail: qin.unackedMail })

console.log('\n  boundaries (what this drill does NOT prove): no host/subagents ⇒ re-dispatch is a recorded callback;')
console.log('  no real child spawn; `inject` used the mailbox path (chat was present but refusing); time is the injected clock;')
console.log('  a journal projection is durable only after the assembly flushes it (`snapshot({key})`) — the journal has no write-through.')

const guard = process.argv.includes('--self-probe')
if (guard) {
  console.log('=== VMU GOAL1 E2E SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}
console.log('\n=== VMU GOAL1 E2E: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
