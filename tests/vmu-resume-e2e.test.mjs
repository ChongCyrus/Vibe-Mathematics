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
import { rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createStore } from '../vibe-math-vmu/kernel/store.js'
import { createWorkLedger } from '../vibe-math-vmu/kernel/work.js'
import { createMailbox } from '../vibe-math-vmu/kernel/mailbox.js'
import { createHuman, attachApprovalGate, CODE as HU } from '../vibe-math-vmu/kernel/human.js'
import { createTasks } from '../vibe-math-vmu/kernel/tasks.js'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
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
 * §⑨'s reader for a collection face's live-instance count. `meetings.snapshot()` serialises its LIVE MAP with a
 * Map/Set-aware replacer (so plain JSON could not flatten it to `{}` in silence), which means the durable form is
 * `{"__map":[[id, row], …]}`; a bare array is accepted too. Returns -1 when nothing parseable is there.
 */
function liveMeetingsIn(envOrSnapshot) {
  return liveCountIn(envOrSnapshot, 'live')
}

/** The same reader for a ballot box collection: `ballotbox.snapshot().data.boxes` (also a serialised Map). */
function liveBoxesIn(envOrSnapshot) {
  return liveCountIn(envOrSnapshot, 'boxes')
}

/** Shared reader for a collection face whose snapshot serialises its Map with the Map/Set-aware replacer. */
function liveCountIn(envOrSnapshot, field) {
  const snap = envOrSnapshot && envOrSnapshot.value ? envOrSnapshot.value : envOrSnapshot
  try {
    const parsed = JSON.parse((snap && snap.data && snap.data[field]) || '[]')
    if (Array.isArray(parsed)) return parsed.length
    if (parsed && Array.isArray(parsed.__map)) return parsed.__map.length
    return -1
  } catch (e) { return -1 }
}

/**
 * Wait until every write-through that was STARTED has settled (succeeded or failed).
 * ROUND 9 / task-70 A: the engine now exposes the primitive that does this for real (`resume.settle()`, which
 * drains the promises it started), so the drill no longer guesses a duration at all. The polling path is kept ONLY
 * as a fallback for an engine without the primitive, so no assertion here depends on a sleep being long enough.
 */
async function settle(resume, floor = 0) {
  if (typeof resume.settle === 'function') { await resume.settle(); return resume.status() }
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
  // §⑪ (task-87 C): the SEED CENSUS needs a projection attached for an arbitrary `PROJECTION_KEYS` entry so a
  // FRESH store can be asked "what does your initial seed look like to hydrate()?". The stub is deliberately
  // tiny and honest: a state projection with a real snapshot/restore seam, and NO method for `phase` (the engine
  // already registers `phase` as its own journal projection, so wrapping a method there would be a lie).
  for (const key of (Array.isArray(opts.extraProjections) ? opts.extraProjections : [])) {
    if (key === 'tasks' || key === 'human' || key === 'mailbox') continue
    const stub = { touched: 0, touch() { stub.touched += 1; return { ok: true } } }
    resume.attachProjection({ target: stub, methods: key === 'phase' ? [] : ['touch'], key, mode: 'state',
      snapshot: () => ({ touched: stub.touched }), restore: () => ({ ok: true, restored: [] }), list: () => [] })
  }
  // §⑨ (task-70 B): a MULTI-INSTANCE collection face, attached EXACTLY the way the shipped assembly attaches it
  // (`kernel/index.js`: `methodsOf[face] || []`). `opts.meetings.methods` is what that list is — `[]` reproduces the
  // assembly, a filled list reproduces the fix. The face is real (`kernel/meetings.js`), not a stub.
  const meetingsFace = opts.meetings ? createMeetings({ clock, log: () => {}, settings: {}, bus }) : null
  if (meetingsFace) {
    resume.attachProjection({ target: meetingsFace, methods: (opts.meetings && opts.meetings.methods) || [], key: 'meetings', mode: 'state',
      snapshot: () => meetingsFace.snapshot(), restore: (v) => meetingsFace.restore(v), list: () => [] })
  }
  const recovery = await resume.recover({ reason: 'kernel-start' })
  const humanTool = makeHumanSpec({
    param: (t, d, o) => Object.assign({ type: t, description: d }, o || {}),
    refused: (code, message, hint) => ({ ok: false, code, message, hint }),
    TOOL_NAMES: { human: 'vibe_vmu_human' },
    kernel: { human, mailbox, chat: { send: () => ({ ok: false, code: 'VMU_CHAT_NOT_IN_THIS_DRILL' }) }, recovery: resume },
  })
  return { tag, store, work, mailbox, human, ctrl, tasks, lock, resume, humanTool, recovery, meetings: meetingsFace }
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

// ── ⑧ THE EXIT CONTRACT (task-70 A): settle() then flushAll(), and the NEXT READER must see it ─────────────
// The engine primitive (`settle`/`flushAll`/`exit`) is new in round 9; the SHIPPED assembly does not call it yet —
// core is wiring `kernel/index.js` `shutdown()` ← `host.js` `uninstall()`. So this section asserts the half that IS
// ready (drain × flush × a second reader sees it) and REPORTS the assembly half as a NAMED gap: a source probe that
// flips to a positive contract the moment the call site lands. Nothing here claims the assembly flushes until then.
console.log('\n[8] the exit contract — settle() + flushAll(): the next reader must see it')
const EROOT = 'D:/_tmp/vmu-goal1-e2e-exit'
rmSync(EROOT, { recursive: true, force: true })
mkdirSync(EROOT, { recursive: true })
const E = await boot('boot-e1', { root: EROOT })
ok(E.recovery.ok === true, '10a a fresh boot for the exit drill recovers cleanly', E.recovery.unhydrated)

E.mailbox.send('office', { to: 'r-1', text: 'the exit contract', kind: 'notice' })
const inFlight = E.resume.status().pendingWrites
ok(inFlight >= 1, '10b the write-through is IN FLIGHT in the SAME tick as the mutation (registered synchronously: nothing slept, nothing polled)',
  { pendingWrites: inFlight })
const foldBefore = E.store.export().keys
ok(!(foldBefore.mailbox && foldBefore.mailbox.mode === 'state'),
  '10c …and the fold does NOT hold it yet — so the next assertion is about settle(), not about luck', foldBefore.mailbox)

await refuses(HU.approvalPending, '10d a gated action is refused (this also records a JOURNAL entry)',
  () => E.tasks.create({ title: 'exit paper' }))
const st = await E.resume.settle()
ok(st.ok === true && st.settled === true && st.pending === 0 && st.writeThroughFailures === 0,
  '10e settle() drains them: ONE await, no sleep, no polling — "is it durable now?" is a FACT', st)
const foldAfter = E.store.export().keys
ok(foldAfter.mailbox && foldAfter.mailbox.mode === 'state' && foldAfter.human && foldAfter.human.mode === 'state',
  '10f and the two STATE envelopes are on disk right after that single await',
  { mailbox: foldAfter.mailbox && foldAfter.mailbox.mode, human: foldAfter.human && foldAfter.human.mode })
ok(Array.isArray(foldAfter.tasks) && foldAfter.tasks.length === 0,
  '10g settle() is NOT a flush: the journal key is still the empty seed (the two halves are different work)', foldAfter.tasks)

const fl = await E.resume.flushAll()
ok(fl.ok === true && fl.failed.length === 0 && fl.flushed.some((f) => f.key === 'tasks' && f.entries === 1) &&
  fl.skipped.some((s) => s.key === 'human' && /writes through/.test(String(s.reason))),
  '10h flushAll() writes the JOURNAL and NAMES why the state keys need no flush', fl)

// THE NEXT READER: a brand-new store instance over the same file (not this process's in-memory fold).
const reader = createStore({ root: EROOT, clock })
await reader.open()
const seenTasks = reader.read('tasks')
const seenMail = reader.read('mailbox')
ok(!!seenTasks && seenTasks.mode === 'journal' && seenTasks.entries.length === 1 && seenTasks.entries[0].failed === true,
  '10i the NEXT READER sees the flushed journal in the file (a second store instance, not our fold)',
  seenTasks && { mode: seenTasks.mode, entries: seenTasks.entries.map((e) => e.method + ':' + e.failed) })
ok(!!seenMail && seenMail.mode === 'state' && seenMail.value.data.boxes['r-1'] && seenMail.value.data.boxes['r-1'].length === 1,
  '10j …and the mail that was only write-through is there for the next reader too', seenMail && { mode: seenMail.mode })
if (typeof reader.close === 'function') await reader.close()

const ex = await E.resume.exit({ reason: 'drill-exit' })
ok(ex.ok === true && ex.writeThrough.settled === true && ex.writeThrough.pending === 0 && ex.journal.failed.length === 0 &&
  typeof ex.writeThrough.waitedMs === 'number' && ex.reason === 'drill-exit',
  '10k exit() reports BOTH halves and its `ok` is their AND (never "at least one worked")', ex)

// THE SHIPPED-ASSEMBLY HALF. A SOURCE PROBE (weaker than a behaviour assertion, and labelled as such): core owns
// the call site; a future round should replace this with a behavioural assertion (`kernel.shutdown()` ⇒
// `status().shutdown.ok`). Until it lands, the gap is PRINTED, not silently passed.
const seamSources = [['kernel/index.js', 'vibe-math-vmu/kernel/index.js'], ['host.js', 'vibe-math-vmu/host.js'], ['vibe-math-vmu.js', 'vibe-math-vmu/vibe-math-vmu.js']]
  .map(([name, rel]) => [name, readFileSync(new URL('../' + rel, import.meta.url), 'utf8')])
const exitCallers = seamSources.filter(([, src]) => /recovery\.(exit|flushAll|settle)\(|resumeService\.(exit|flushAll|settle)\(/.test(src)).map(([n]) => n)
if (exitCallers.length > 0) {
  ok(true, '10l the SHIPPED assembly CALLS the exit seam (' + exitCallers.join(', ') + '): the engine primitive is wired')
} else {
  line('NAMED GAP (an observation, NOT an assertion, and NOT "verified"): the SHIPPED assembly does not call the exit seam yet.')
  line('  probe: ' + seamSources.map(([n]) => n).join(' / ') + ' ⇒ 0 call sites for recovery.{exit,flushAll,settle}(); core owns this wiring.')
  line('  proven here: the engine primitive exists, drains and flushes, and the NEXT READER sees its result (10a–10k).')
}

// ── ⑨ MULTI-INSTANCE FACES (task-70 B): the COLLECTION is the registry — the METHOD LIST is what is missing ──
// Round 6 named "multi-instance `meeting`/`ballot` cannot be projected". The truth is sharper, and this section
// measures it on the REAL `kernel/meetings.js` face: the collection IS the registry (one `open()` per meeting, one
// `snapshot()/restore()` for all of them), and the assembly's `methodsOf[face] || []` leaves that collection with
// NO WRAPPED METHOD ⇒ the write-through never fires ⇒ the declared projection is never written. No new registry
// mechanism is needed; the method list is. (a) proves the defect, (b) proves the fix with the same code path.
console.log('\n[9] multi-instance faces — the collection IS the registry; the method list is what is missing')
const MROOT = 'D:/_tmp/vmu-goal1-e2e-meetings'
rmSync(MROOT, { recursive: true, force: true })
mkdirSync(MROOT, { recursive: true })
const M1 = await boot('boot-m1', { root: MROOT, meetings: { methods: [] } })
ok(M1.recovery.ok === true, '11a a boot that attaches `meetings` the way the SHIPPED assembly does still recovers cleanly', M1.recovery.unhydrated)
const mA = M1.meetings.open({ type: 'ordinary', chair: 'm-1', roster: ['m-1', 'm-2'] })
const mB = M1.meetings.open({ type: 'ordinary', chair: 'm-3', roster: ['m-3', 'm-4'] })
ok(mA.ok === true && mB.ok === true && mA.meeting === 'm1' && mB.meeting === 'm2',
  '11b TWO live meetings exist at once (multi-instance: the collection is the registry)', { a: mA.meeting, b: mB.meeting })
await M1.resume.settle()
const mfold1 = M1.store.export().keys
// ADAPTIVE DEFECT PROBE (not a desired invariant): it asserts the shape that is THERE. Today the assembly-shape
// attachment writes nothing; the moment core fills `methodsOf`, THIS SAME BOOT starts writing through and the
// probe flips to the closed form by itself — so a fix never leaves a misleading red behind.
const shippedShapeWrote = !!mfold1.meetings && mfold1.meetings.mode === 'state'
if (shippedShapeWrote) {
  ok(liveMeetingsIn(mfold1.meetings) === 2,
    '11c CLOSED: the assembly-shape attachment now DOES write through (methodsOf carries the face) — both meetings are in the envelope',
    { key: mfold1.meetings && mfold1.meetings.mode, live: liveMeetingsIn(mfold1.meetings) })
} else {
  ok(Array.isArray(mfold1.meetings) && mfold1.meetings.length === 0,
    '11c DEFECT MEASURED: the durable `meetings` key is still the store SEED — a DECLARED projection that was never written',
    { key: mfold1.meetings })
}
const mex1 = await M1.resume.exit({ reason: 'drill-exit-1' })
const reader1 = createStore({ root: MROOT, clock })
await reader1.open()
const seenMeetings1 = reader1.read('meetings')
if (shippedShapeWrote) {
  ok(mex1.ok === true && liveMeetingsIn(seenMeetings1) === 2,
    '11d CLOSED: the exit flush finds the collection already durable and the next reader sees both meetings',
    { nextReader: liveMeetingsIn(seenMeetings1) })
} else {
  ok(mex1.ok === true && Array.isArray(seenMeetings1) && seenMeetings1.length === 0,
    '11d the EXIT FLUSH does not save it either: state keys land in `skipped[]` by contract, so "core landed the exit flush" ≠ "this face is durable"',
    { skipped: mex1.journal.skipped.filter((s) => s.key === 'meetings'), nextReader: seenMeetings1 })
}
if (typeof reader1.close === 'function') await reader1.close()

// (b) THE FIX: same face, same seams, only the method list filled in — what `methodsOf` must carry.
const MMETHODS = ['open', 'close', 'attend', 'motion']
const M2 = await boot('boot-m2', { root: MROOT, meetings: { methods: MMETHODS } })
M2.meetings.open({ type: 'ordinary', chair: 'm-1', roster: ['m-1', 'm-2'] })
M2.meetings.open({ type: 'ordinary', chair: 'm-3', roster: ['m-3', 'm-4'] })
await M2.resume.settle()
const mfold2 = M2.store.export().keys
ok(!!mfold2.meetings && mfold2.meetings.mode === 'state' && liveMeetingsIn(mfold2.meetings) === 2,
  '11e FIX MEASURED: with the method list filled in, the write-through lands and BOTH meetings are in the envelope',
  mfold2.meetings && { mode: mfold2.meetings.mode, live: liveMeetingsIn(mfold2.meetings) })
await M2.resume.exit({ reason: 'drill-exit-2' })
const M3 = await boot('boot-m3', { root: MROOT, meetings: { methods: MMETHODS } })
const ledgers3 = M3.recovery.steps.filter((s) => s.step === 'ledgers')[0]
const mRow = ledgers3.hydrated.filter((h) => h.key === 'meetings')[0]
ok(M3.recovery.ok === true && !!mRow && mRow.hydrated === true && liveMeetingsIn(M3.meetings.snapshot()) === 2,
  '11f …and after a RESTART the collection hydrates BOTH meetings ⇒ multi-instance durability needs NO registry mechanism, only the method list',
  { ok: M3.recovery.ok, row: mRow, live: liveMeetingsIn(M3.meetings.snapshot()) })

// ── ⑩ THE REAL ASSEMBLY, TWO KERNELS, ONE STORE (task-78 B): is multi-instance recovery truly there? ────────
// Rounds 8/9 built the faces by hand. This section uses the SHIPPED ENTRY (`vibe-math-vmu.js apply(ctx, config)`)
// with a minimal fake host ctx — the same shape `vmu-entry.test.mjs` uses — and boots TWO kernel instances over ONE
// real store root: the first opens two meetings and two ballot boxes, calls the shipped `kernel.shutdown()`, and
// the second is asserted to find all of them. That also replaces the round-9 SOURCE PROBE for the exit seam with a
// BEHAVIOURAL assertion: `shutdown()` really runs, and the next reader really sees the result.
console.log('\n[10] the REAL assembly — two kernel instances over one store (task-78 B)')
const entryMod = await import(new URL('../vibe-math-vmu/vibe-math-vmu.js', import.meta.url).href)
const fakeCtx = (extra = {}) => {
  const state = { specs: [], disposed: 0, effects: [], listeners: {} }
  return {
    state,
    ctx: Object.assign({
      effect(fn, label) { state.effects.push(label); return fn() },
      on(event, handler) { (state.listeners[event] = state.listeners[event] || []).push(handler); return () => {} },
      tools: { register: async (spec) => { state.specs.push(spec); return () => { state.disposed += 1 } } },
    }, extra),
  }
}
const KROOT = 'D:/_tmp/vmu-goal1-e2e-kernel'
rmSync(KROOT, { recursive: true, force: true })
mkdirSync(KROOT, { recursive: true })
/**
 * WAIT FOR THE ENTRY'S STARTUP CHAIN. `apply()` returns synchronously, but the chain it starts is
 * `store.open()` (real fs) → `hydrateIds()` → `recovery.recover()` (vibe-math-vmu.js:562-595). A single
 * `setTimeout(0)` is NOT enough: the fold is still unread, the read-before-write latch is armed only by
 * `recover()`, and every write-through is then refused by name (`VMU_RESUME_WRITE_BEFORE_READ`) — measured here
 * as `generation: 0` plus a `store is not open` crash. So readiness is POLLED on two real observables.
 */
const readyKernel = async (K) => {
  for (let i = 0; i < 300; i += 1) {
    const stats = K.kernel.store && typeof K.kernel.store.stats === 'function' ? K.kernel.store.stats() : null
    if (stats && stats.open === true && K.kernel.recovery.status().restart.generation >= 1) return true
    await sleep(5)
  }
  return false
}
const k1host = fakeCtx()
const K1 = entryMod.apply(k1host.ctx, { clock, root: KROOT, packs: ['v5r'] })
ok(await readyKernel(K1), '12a the SHIPPED entry assembles a real kernel whose startup chain finishes (store open ⇒ recover ⇒ generation 1)',
  { generation: K1.kernel.recovery.status().restart.generation, unhydrated: K1.kernel.recovery.status().unhydrated })

// THE ROUND-9 DEFECT, CHECKED BEHAVIOURALLY: a declared state face must have WRAPPED methods (the wrapper's
// after-hook is the only thing that writes a state projection through).
const wrappedOf = (k, face) => ((k.status().projections || {}).wrappedMethods || []).filter((w) => w.face === face)[0]
const wMeetings = wrappedOf(K1.kernel, 'meetings')
ok(!!wMeetings && Array.isArray(wMeetings.methods) && wMeetings.methods.length > 0,
  '12b the assembly WRAPS real methods for `meetings` (the `methodsOf[face] || []` defect is gone)',
  wMeetings && { face: wMeetings.face, mode: wMeetings.mode, methods: wMeetings.methods.slice(0, 8), wrapped: wMeetings.wrapped })

const km1 = K1.kernel.meetings.open({ type: 'ordinary', chair: 'r-1', roster: ['r-1', 'r-2'] })
const km2 = K1.kernel.meetings.open({ type: 'ordinary', chair: 'r-3', roster: ['r-3'] })
const kb1 = K1.kernel.ballotbox.open({ question: 'adopt the roadmap?', options: ['for', 'against'] })
const kb2 = K1.kernel.ballotbox.open({ question: 'extend the deadline?', options: ['yes', 'no'] })
ok(km1.ok === true && km2.ok === true && kb1.ok === true && kb2.ok === true,
  '12c TWO meetings and TWO ballot boxes are live in the first kernel (multi-instance)',
  { meetings: [km1.meeting, km2.meeting], boxes: [kb1.id, kb2.id] })

const k1shutdown = await K1.kernel.shutdown({ reason: 'drill-exit-kernel-1' })
ok(k1shutdown.ok === true && K1.kernel.status().shutdown && K1.kernel.status().shutdown.ok === true &&
  K1.kernel.recovery.status().pendingWrites === 0,
  '12d BEHAVIOURAL (not a source probe): the shipped `kernel.shutdown()` runs, reports ok, and left no write-through in flight',
  { receipt: { ok: k1shutdown.ok, failed: (k1shutdown.failed || []).length }, pendingWrites: K1.kernel.recovery.status().pendingWrites })

const kreader = createStore({ root: KROOT, clock })
await kreader.open()
const kSeenMeetings = kreader.read('meetings')
const kSeenBoxes = kreader.read('ballotbox')
ok(!!kSeenMeetings && kSeenMeetings.mode === 'state' && liveMeetingsIn(kSeenMeetings) === 2,
  '12e the NEXT READER (a raw store over the same root) sees BOTH MEETINGS as a written state envelope',
  { meetings: liveMeetingsIn(kSeenMeetings), mode: kSeenMeetings && kSeenMeetings.mode })
if (typeof kreader.close === 'function') await kreader.close()

// ADAPTIVE DEFECT PROBE (like 11c/11d): the v5r pack DECLARES `ballots` while the assembly's adapter table keys
// `ballotbox`; if that is still so, the two live boxes above are never projected. It asserts the shape that is
// THERE, so it flips to the closed form by itself once the key is aligned.
const kProj = K1.kernel.status().projections || {}
const boxAttached = (kProj.attached || []).includes('ballotbox')
if (boxAttached) {
  ok(!!kSeenBoxes && kSeenBoxes.mode === 'state' && liveBoxesIn(kSeenBoxes) === 2,
    '12f CLOSED: `ballotbox` is attached and its envelope carries BOTH boxes across the shutdown',
    { boxes: liveBoxesIn(kSeenBoxes) })
} else {
  const named = (kProj.notAttached || []).filter((n) => n.face === 'ballots')[0]
  ok((kProj.declared || []).includes('ballots') && !!named && !boxAttached && (!kSeenBoxes || liveBoxesIn(kSeenBoxes) === 0),
    '12f DEFECT MEASURED: the pack declares `ballots` but the adapter table keys `ballotbox` ⇒ the two live boxes are NEVER projected (declared, not attached)',
    { declared: kProj.declared, notAttached: named, nextReader: kSeenBoxes })
}

const k2host = fakeCtx()
const K2 = entryMod.apply(k2host.ctx, { clock, root: KROOT, packs: ['v5r'] })
ok(await readyKernel(K2), '12g a SECOND kernel instance over the same store finishes its startup chain (generation 2)',
  { generation: K2.kernel.recovery.status().restart.generation, unhydrated: K2.kernel.recovery.status().unhydrated })
ok(liveMeetingsIn(K2.kernel.meetings.snapshot()) === 2,
  '12h CROSS-INSTANCE RECOVERY HOLDS for the meetings collection: both meetings are there in the second kernel ⇒ "the collection face IS the registry" is confirmed on the REAL assembly (no new registry mechanism needed)',
  { meetings: liveMeetingsIn(K2.kernel.meetings.snapshot()) })
const k2rows = K2.kernel.recovery.status().hydrated.filter((h) => h.key === 'meetings')
ok(k2rows.length === 1 && k2rows[0].hydrated === true && k2rows[0].mode === 'state' && K2.kernel.recovery.status().unhydrated.length === 0,
  '12i the meetings collection is reported HYDRATED in the second kernel (named, not inferred)',
  { rows: k2rows.map((h) => h.key + ':' + h.mode + ':' + h.hydrated), unhydrated: K2.kernel.recovery.status().unhydrated })
ok(liveBoxesIn(K2.kernel.ballotbox.snapshot()) === 2,
  '12j …and the TWO BALLOT BOXES come back in the second kernel too (the pack now declares `ballotbox`, so 12f takes the CLOSED branch)',
  { boxes: liveBoxesIn(K2.kernel.ballotbox.snapshot()) })

// ── ⑪ SEED CENSUS (task-87 C): EVERY projection key on a FRESH store must report a clean first run ──────────
// Round 8 fixed the `[]`-seeded keys and Round 10 fixed the `{}`-seeded one; this census asks the question ONCE for
// every key in `PROJECTION_KEYS`, so that class cannot survive in a shape nobody happened to test. It also proves
// the tolerance is NARROW: a NON-empty foreign value under the same keys must still be a NAMED gap.
console.log('\n[11] seed census — every PROJECTION_KEY on a FRESH store must report a clean first run (task-87 C)')
const SEED_ROOT = 'D:/_tmp/vmu-goal1-e2e-seeds'
const seedKeys = ['members', 'tasks', 'meetings', 'ballotbox', 'budget', 'phase', 'work', 'chat', 'panel', 'human']
const seedRows = []
for (const key of seedKeys) {
  const root = SEED_ROOT + '/' + key
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  const S = await boot('seed-' + key, { root, extraProjections: [key] })
  const led = S.recovery.steps.filter((s) => s.step === 'ledgers')[0]
  const row = (led.hydrated || []).filter((h) => h.key === key)[0]
  const bad = (led.unhydrated || []).filter((u) => u.key === key)[0]
  seedRows.push({ key, ok: S.recovery.ok, hydrated: row && row.hydrated, seeded: row && row.seeded, gap: bad && bad.code })
}
ok(seedRows.length > 0 && seedRows.length === seedKeys.length && seedRows.every((r) => r.ok === true && r.hydrated === false && ['null', 'empty-array', 'empty-object'].includes(r.seeded) && !r.gap),
  '13a ALL ' + seedKeys.length + ' projection keys report a CLEAN FIRST RUN on a fresh store (no initial container is read as a projection gap): ' + seedKeys.join(','),
  seedRows)

/** The counter-case helper: write a NON-empty foreign value under a key, then boot and read what hydrate() says. */
const foreignUnder = async (label, key, value) => {
  const root = SEED_ROOT + '/foreign-' + label
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  const raw = createStore({ root, clock })
  await raw.open()
  await raw.patch(key, () => value)
  if (typeof raw.close === 'function') await raw.close()
  const F = await boot('seed-foreign-' + label, { root, extraProjections: [key] })
  const led = F.recovery.steps.filter((s) => s.step === 'ledgers')[0]
  return { ok: F.recovery.ok, gap: (led.unhydrated || []).filter((u) => u.key === key)[0] }
}
const fTasks = await foreignUnder('array', 'tasks', [{ id: 't-99' }])
ok(fTasks.ok === false && !!fTasks.gap && fTasks.gap.code === 'VMU_RESUME_PROJECTION_GAP' && /array\[1\]/.test(String(fTasks.gap.value)),
  '13b a NON-empty bare ARRAY under `tasks` is still a NAMED gap (the tolerance did not become "exists ⇒ pass")', fTasks)
const fBudget = await foreignUnder('object', 'budget', { spent: 5 })
ok(fBudget.ok === false && !!fBudget.gap && fBudget.gap.code === 'VMU_RESUME_PROJECTION_GAP',
  '13c a NON-empty plain OBJECT under `budget` is still a NAMED gap (only an EMPTY container counts as a first run)', fBudget)

// ── ⑫ F51: WHICH MEETING IS STILL OPEN, ACROSS A RESTART (task-89) ─────────────────────────────────────────
// The face now keeps a DOMAIN marker (`open|lapsed|closed`) written by ONE function (`markState`) at every state
// transition, and reads it back through a declarative domain seam (`{read(), write(rows)}`). The shipped kernel
// does not wire the seam yet (that is one line in `kernel/index.js`), so this section wires it with a REAL FILE —
// which is exactly the contract the face declares, and the reason the assertions below are about the SEAM, not
// about a mock: a second face instance with no live meetings reads the states from disk.
console.log('\n[12] F51 domain marker — which meeting is still open, across a restart (task-89)')
const F51_ROOT = 'D:/_tmp/vmu-goal1-e2e-f51'
rmSync(F51_ROOT, { recursive: true, force: true })
mkdirSync(F51_ROOT, { recursive: true })
const markerFile = F51_ROOT + '/domain-marker.json'
const durableSeam = {
  read: () => { try { return JSON.parse(readFileSync(markerFile, 'utf8')) } catch (e) { return [] } },
  write: (rows) => { writeFileSync(markerFile, JSON.stringify(rows), 'utf8') },
}
const F = createMeetings({ clock, log: () => {}, settings: { 'vmu.meetings.hardLimitMs': 1000 }, bus, durable: durableSeam })
const fOpen = F.open({ type: 'ordinary', chair: 'r-1', roster: ['r-1'] })
const fLapse = F.open({ type: 'ordinary', chair: 'r-2', roster: ['r-2'] })
const BIG = 1750000000000 + 10000000
const due = F.lapseDue({ meeting: fLapse.meeting, at: BIG })
const lapsed = due.due === true ? F.lapse({ meeting: fLapse.meeting, at: BIG }) : null
ok(fOpen.ok === true && fLapse.ok === true && !!lapsed && lapsed.ok === true,
  '14a the face opens two meetings and the bounded fallback really lapses one of them',
  { open: fOpen.meeting, lapse: fLapse.meeting, due: due.due, lapsed: lapsed && lapsed.settlement })

const afterLapse = F.openMeetings()
const rowLapsed = afterLapse.meetings.filter((m) => m.id === fLapse.meeting)[0]
const rowOpen = afterLapse.meetings.filter((m) => m.id === fOpen.meeting)[0]
ok(afterLapse.ok === true && afterLapse.durableMarker === true && !!rowLapsed && rowLapsed.state === 'lapsed' && !!rowOpen && rowOpen.state === 'open',
  '14b `lapsed` and `open` are DISTINGUISHABLE in the durable marker (the meeting that lapsed is not reported as open)',
  { meetings: afterLapse.meetings, bound: F.status().durableMarker })

const revived = F.revokeLapse({ meeting: fLapse.meeting, by: 'r-2', reason: 'the bound was reviewed' })
const rowRevived = F.openMeetings().meetings.filter((m) => m.id === fLapse.meeting)[0]
ok(revived.ok === true && !!rowRevived && rowRevived.state === 'open',
  '14c `revokeLapse` returns the meeting to `open` in the marker (the fallback stays revocable by name)',
  { revoked: revived.ok, row: rowRevived })

// ① CROSS-RESTART: a NEW face instance, no live meetings at all, reads the states from the same store.
const F2 = createMeetings({ clock, log: () => {}, settings: { 'vmu.meetings.hardLimitMs': 1000 }, bus, durable: durableSeam })
const crossRestart = F2.openMeetings()
ok(crossRestart.ok === true && crossRestart.durableMarker === true &&
  crossRestart.meetings.some((m) => m.id === fOpen.meeting && m.state === 'open') &&
  crossRestart.meetings.some((m) => m.id === fLapse.meeting && m.state === 'open') &&
  F2.status().durableMarker.bound === true,
  '14d CROSS-RESTART: a second face instance (no live meetings) reads both meetings back from the durable seam',
  { meetings: crossRestart.meetings, source: crossRestart.source })

// ④ AN EMPTY READ MUST NOT INVENT A MEETING, and an UNBOUND seam must self-disclose (never a silent claim).
const emptyFace = createMeetings({ clock, log: () => {}, settings: {}, bus, durable: { read: () => [], write: () => {} } })
const e0 = emptyFace.openMeetings()
const unboundFace = createMeetings({ clock, log: () => {}, settings: {}, bus })
const u0 = unboundFace.openMeetings()
ok(e0.ok === true && e0.durableMarker === true && e0.meetings.length === 0 && /no meeting at all/.test(String(e0.note)) &&
  u0.ok === true && u0.durableMarker === false && u0.meetings.length === 0 && unboundFace.status().durableMarker.bound === false,
  '14e an EMPTY durable read is an empty institute (no meeting is invented as "still open") and an UNBOUND seam says so (durableMarker:false)',
  { empty: { meetings: e0.meetings, note: e0.note }, unbound: { bound: unboundFace.status().durableMarker.bound, note: u0.note } })

// ── ⑬ THE BALLOT MIRROR MUST BE VISIBLE (round 11 fix; the defect reader-b's e2e found) ────────────────────
// `vote()` mirrors the vote into an injected `ballot` seam. It used to `catch {}` a refusal, so a vote that never
// reached a box still came back `ok:true` — "the receipt says success while nothing was done". The mirror outcome
// is now NAMED in the receipt (and counted) in all four shapes: refused / threw / no seam / worked.
console.log('\n[13] the ballot mirror must be VISIBLE — a refusing seam is not swallowed (round 11 fix)')
const ballotFace = (ballot) => createMeetings({ clock, log: () => {}, settings: {}, bus, ballot })
const openOne = (face) => face.open({ type: 'ordinary', chair: 'r-1', roster: ['r-1', 'r-2'] })
const refusingFace = ballotFace({ cast: () => ({ ok: false, code: 'NO_BOX_FOR_MOTION' }) })
const refusingVote = refusingFace.vote({ meeting: openOne(refusingFace).meeting, member: 'r-2', value: 1 })
ok(refusingVote.ok === true && refusingVote.receipt.ballot.mirrored === false && refusingVote.receipt.ballot.reason === 'refused' &&
  refusingVote.receipt.ballot.code === 'NO_BOX_FOR_MOTION',
  '15a a REFUSING ballot seam is NAMED in the receipt (mirrored:false + the seam\'s own code) instead of being swallowed',
  refusingVote.receipt.ballot)

const throwingFace = ballotFace({ cast: () => { const e = new Error('no box for this motion'); e.code = 'NO_BOX_FOR_MOTION'; throw e } })
const throwingVote = throwingFace.vote({ meeting: openOne(throwingFace).meeting, member: 'r-2', value: 1 })
ok(throwingVote.ok === true && throwingVote.receipt.ballot.mirrored === false && throwingVote.receipt.ballot.reason === 'threw' &&
  throwingVote.receipt.ballot.code === 'NO_BOX_FOR_MOTION',
  '15b a THROWING ballot seam is disclosed too (reason:threw + the code) — the old `catch {}` swallowed exactly this',
  throwingVote.receipt.ballot)

const noSeamFace = ballotFace(null)
const noSeamVote = noSeamFace.vote({ meeting: openOne(noSeamFace).meeting, member: 'r-2', value: 1 })
ok(noSeamVote.ok === true && noSeamVote.receipt.ballot.mirrored === false && noSeamVote.receipt.ballot.reason === 'no-seam',
  '15c with NO seam the meeting still counts the vote, but the receipt discloses `mirrored:false (no-seam)`',
  noSeamVote.receipt.ballot)

const workingFace = ballotFace({ cast: () => ({ ok: true }) })
const workingVote = workingFace.vote({ meeting: openOne(workingFace).meeting, member: 'r-2', value: 1 })
ok(workingVote.ok === true && workingVote.receipt.ballot.mirrored === true && workingVote.receipt.ballot.reason === 'cast-without-motion',
  '15d POSITIVE: a working seam reports `mirrored:true` (the disclosure does not cry wolf)',
  workingVote.receipt.ballot)

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
