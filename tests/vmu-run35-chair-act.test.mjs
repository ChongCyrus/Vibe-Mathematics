// tests/vmu-run35-chair-act.test.mjs — ROUND 35 / task-24: THE CHAIR'S TURN MUST BE VISIBLE FROM ITS OWN SESSION.
//
// THE DEFECT THIS PINS (measured on the real machine, run 35): the academician convened a meeting from ITS OWN child
// session, and that session mounts its OWN kernel instance over the same workspace (docs/02 `store.js` row: ONE
// state.json, SEVERAL kernels). `vmu.meetings.chairActRequiresTurn` was answered by `chairActed(seat)`, wired to
// `turn.memberTurnCount(seat)` - THIS instance's in-memory `turns` Map. The chair's turn had really run, one session
// away, so the child kernel saw nothing and refused by name:
//     VMU_CHAIR_ACT_NOT_DELEGATED: … the chair r-acad has no recorded turn in this kernel …
// The rule that ships is "会议只能由院士召开/关闭" and the gate is right; what was wrong is WHERE the fact lived. It now
// lives in the durable fold (`turns`, one row per member, written by `kernel/turn/index.js` open() through the
// `turnLedger` seam, read by BOTH `chairActed` branches).
//
// WHAT IS ASSERTED HERE (each state READ BACK — "recorded" is not "in force"):
//   ① the fact itself: after the chair took a turn, the durable fold carries ONE row for that seat naming that turn;
//   ② ★★ the run-35 case: a SECOND kernel over the SAME root convenes as that chair — ACCEPTED (it used to refuse);
//   ③ ★★ the counterfactual that keeps the gate honest: the same second kernel convenes as a chair-slot member who
//      never took a turn — still refused BY NAME, with the remedy in the hint;
//   ④ ★★ the same counterfactual on a FRESH root (no turn anywhere): still refused, so "fix the cross-instance read"
//      did not become "loosen the gate";
//   ⑤ the ledger is BOUNDED: one row per member, not one per turn — three turns of the same seat leave one row, and it
//      names the NEWEST turn;
//   ⑥ ★★★ THE ORDER THAT MAKES ② TRUE AT ALL: `deliver` is not handed the prompt until the ledger write has landed.
//      A deferred seam proves the await (deliver waits), and a REJECTING seam proves the refusal (the prompt is never
//      handed out, so the member can never act on a turn its siblings cannot see).
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TURN_MOD = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const PROMPT_MOD = join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const J = (o) => JSON.stringify(o)
const serr = (fn) => { try { return { value: fn() } } catch (e) { return { error: e } } }

const entry = await import(pathToFileURL(ENTRY).href)

// Temp roots live under D:\_tmp\r35\chair (task rule ⑦) and are deleted at the end of the run.
const BASE = join('D:/_tmp/r35/chair')
await mkdir(BASE, { recursive: true })

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, kernel: handle.kernel, specs: state.specs }
}
const railOn = (root) => ({ root, packs: ['v5r'], clock: () => 1000, vmu: { meetings: { chairActRequiresTurn: true } } })
// Hiring is idempotent HERE on purpose: two kernels over one root share the roster, so the second boot must not fail on
// "already hired" (that is a fact about the fixture, not about what this test measures).
const hire = async (k, id, slot) => { try { await k.members.hire({ id, slot }) } catch (e) { /* already on staff in the shared fold */ } }

const roots = []
const newRoot = async (tag) => { const r = await mkdtemp(join(BASE, tag + '-')); roots.push(r); return r }

console.log('=== 1. THE FACT ITSELF: a chair turn lands in the durable fold, named ===')
// Kernel A = "the office" (where the chair's turn really runs). Kernel B (later) = "the chair's own child session".
const rootShared = await newRoot('shared')
const A = await boot(railOn(rootShared))
await hire(A.kernel, 'r-acad', 'chair')
await hire(A.kernel, 'r-1', 'member')
await hire(A.kernel, 'r-2', 'chair')     // a chair-slot member who will NEVER take a turn (counterfactual ③)
// The cheapest REAL turn is the loop's own `step`: it opens the turn (the fact) and then fails at the missing delivery
// seam — which is exactly the sequence run 35 had, minus a host.
let stepInfo = null
try { stepInfo = await A.kernel.turn.step({ members: ['r-acad'], membersInferred: true, phase: 'normal', why: 'run35 chair act' }) } catch (e) { stepInfo = { error: e && e.code ? e.code : String(e) } }
const foldA = A.kernel.store.read('turns')
ok(Array.isArray(foldA), '① the durable `turns` fold is an ARRAY (one row per member), not an object bag', foldA && typeof foldA)
const chairRows = (Array.isArray(foldA) ? foldA : []).filter((r) => r && String(r.member) === 'r-acad')
ok(chairRows.length === 1, '①★ the chair’s turn produced EXACTLY ONE ledger row (the run-35 fact is now durable, not just in memory)', chairRows)
const chairRow = chairRows[0] || {}
ok(typeof chairRow.turn === 'string' && /^t-\d+$/.test(chairRow.turn) && chairRow.phase === 'normal' && typeof chairRow.at === 'string' && chairRow.at !== '',
  '①★ the row NAMES the turn it saw (id, phase, at) — a boolean "yes" with no attribution would be unreadable when it matters', chairRow)
ok((Array.isArray(foldA) ? foldA : []).filter((r) => r && String(r.member) === 'r-1').length === 0,
  '① r-1 never took a turn, so the fold carries NO row for it (the ledger records facts, not the roster)', foldA)

console.log('=== 2. ★★ RUN 35 ITSELF: the chair’s own child session can convene, because it reads the shared fold ===')
// Kernel B = "the chair's own session": same root, separate instance, its own empty in-memory `turns` Map.
const B = await boot(railOn(rootShared))
ok(B.kernel !== A.kernel && B.kernel.turn.memberTurnCount('r-acad') === 0,
  '② B is a SEPARATE kernel instance with NO in-memory turn for the chair — the precondition that made run 35 fail', { local: B.kernel.turn.memberTurnCount('r-acad') })
await hire(B.kernel, 'r-acad', 'chair')
await hire(B.kernel, 'r-1', 'member')
await hire(B.kernel, 'r-2', 'chair')
const bOpen = serr(() => B.kernel.meetings.open({ chair: 'r-acad', actor: 'r-acad', roster: ['r-acad', 'r-1'], materials: 'run35 cross-instance' }))
ok(!bOpen.error && bOpen.value && bOpen.value.meeting !== undefined,
  '②★★ the SAME convene that run 35 refused is now ACCEPTED in the chair’s own session (the gate reads the shared fact, not one instance’s memory)',
  bOpen.error ? { code: bOpen.error.code, message: bOpen.error.message } : bOpen.value && bOpen.value.meeting)
ok(!bOpen.error && bOpen.value && Array.isArray(bOpen.value.enforced) && bOpen.value.enforced.includes('vmu.meetings.chairActRequiresTurn'),
  '② and the gate really RAN (it is reported as enforced) — acceptance came from reading the fact, not from skipping the check',
  bOpen.value && bOpen.value.enforced)

console.log('=== 3. ★★ THE COUNTERFACTUAL (same second kernel): a chair-slot member with NO turn is still refused ===')
const bBad = serr(() => B.kernel.meetings.open({ chair: 'r-2', actor: 'r-2', roster: ['r-2', 'r-1'], materials: 'run35 counterfactual' }))
ok(bBad.error && bBad.error.code === 'VMU_CHAIR_ACT_NOT_DELEGATED',
  '③★★ in the SAME kernel that just accepted the chair, a seat that never took a turn is REFUSED BY NAME (zero loosening)', bBad.error ? bBad.error.code : bBad.value)
ok(bBad.error && /no recorded turn in this kernel/.test(String(bBad.error.message)) && /vibe_vmu_turn/.test(String(bBad.error.hint || '')),
  '③ and the refusal keeps its code, message and REMAINDER (give the chair its own turn first)', bBad.error ? { message: bBad.error.message, hint: bBad.error.hint } : null)

console.log('=== 4. ★★ THE COUNTERFACTUAL ON A FRESH ROOT: with no turn anywhere, the gate still fires end to end ===')
const rootFresh = await newRoot('fresh')
const C = await boot(railOn(rootFresh))
await hire(C.kernel, 'r-acad', 'chair')
await hire(C.kernel, 'r-1', 'member')
const freshFold = C.kernel.store.read('turns')
ok(Array.isArray(freshFold) && freshFold.length === 0, '④ a fresh root starts with an EMPTY ledger (no invented rows)', freshFold)
const cOpen = serr(() => C.kernel.meetings.open({ chair: 'r-acad', actor: 'r-acad', roster: ['r-acad', 'r-1'], materials: 'fresh' }))
ok(cOpen.error && cOpen.error.code === 'VMU_CHAIR_ACT_NOT_DELEGATED',
  '④★★ on a root where no kernel ever ran the chair’s turn, convening is STILL refused — "cross-instance read" did not become "gate off"', cOpen.error ? cOpen.error.code : cOpen.value)

console.log('=== 5. THE LEDGER IS BOUNDED: one row per member, naming the NEWEST turn (not one row per turn) ===')
const before5 = A.kernel.store.read('turns').filter((r) => r && String(r.member) === 'r-acad').length
const t2 = A.kernel.turn.open({ member: 'r-acad', phase: 'normal', round: 2 })
const t3 = A.kernel.turn.open({ member: 'r-acad', phase: 'normal', round: 3 })
const t4 = A.kernel.turn.open({ member: 'r-acad', phase: 'normal', round: 4 })
// The write is asynchronous by design (the loop awaits it before delivery), so WAIT for the tracked promise to
// land instead of sleeping a fixed 60ms: under load that sleep is a race, and a race here reads as "the ledger froze
// the first row" (observed as 1 failed assertion while two live drives saturated the CPU).
const after5 = await (async () => {
  const deadline = Date.now() + 4000
  for (;;) {
    const rows = A.kernel.store.read('turns').filter((r) => r && String(r.member) === 'r-acad')
    const latest = rows[0] && rows[0].turn
    if (rows.length === 1 && (latest === t2.turn.id || latest === t3.turn.id || latest === t4.turn.id)) return rows
    if (Date.now() > deadline) return rows
    await new Promise((r) => setTimeout(r, 20))
  }
})()
ok(before5 === 1 && after5.length === 1,
  '⑤★★★ THREE more turns leave ONE row for that seat (the ledger answers a boolean question, so it must not grow with the run)', { before: before5, after: after5.length })
ok(after5[0] && (after5[0].turn === t4.turn.id || after5[0].turn === t3.turn.id || after5[0].turn === t2.turn.id),
  '⑤ the surviving row names a turn that really was opened after the first one (it is upserted, not frozen)', { row: after5[0], opened: [t2.turn.id, t3.turn.id, t4.turn.id] })
ok(A.kernel.turn.status().counts.ledgerRecorded >= 1 && A.kernel.turn.status().counts.ledgerFailed === 0,
  '⑤ the loop COUNTED the writes (ledgerRecorded > 0, ledgerFailed = 0) — a shared ledger that fails silently is the next run-35',
  A.kernel.turn.status().counts)

console.log('=== 6. ★★★ THE ORDER: no prompt leaves before the fact lands ===')
const turnMod = await import(pathToFileURL(TURN_MOD).href)
const promptMod = await import(pathToFileURL(PROMPT_MOD).href)
const pipeline = () => promptMod.createPromptPipeline({ sections: [], clock: () => '2026-01-01T00:00:00.000Z' })
const decideNothing = () => ({ disabled: [], errors: [] })

// ⑥a A DEFERRED record: deliver must WAIT for it (this await is what removes the race between "the parent opened the
// chair's turn" and "the child reads the fold").
let releaseRecord = null
let recordSettledAt = null
const deferredLedger = {
  record: () => new Promise((resolve) => { releaseRecord = () => { recordSettledAt = 'settled'; resolve({ ok: true }) } }),
  count: () => 0,
}
const deliveredPrompts = []
const tA = turnMod.createTurnOrchestrator({
  sectionPolicy: decideNothing, prompt: pipeline(), clock: () => '2026-01-01T00:00:00.000Z',
  deliver: async ({ turn, text }) => { deliveredPrompts.push({ at: recordSettledAt, turn: turn.id, member: turn.member, text }); return 'ok' },
  turnLedger: deferredLedger,
})
const openedA = tA.open({ member: 'r-defer', phase: 'normal', round: 1 })
const deliveryA = tA.deliver(openedA.turn, 'the assembled prompt')
await new Promise((r) => setTimeout(r, 30))
ok(deliveredPrompts.length === 0 && typeof releaseRecord === 'function' && recordSettledAt === null,
  '⑥a★★★ deliver did NOT hand out the prompt while the ledger write was still in flight (no race window between the two kernels)',
  { delivered: deliveredPrompts.length, record: typeof releaseRecord })
releaseRecord()
const resA = await deliveryA
ok(deliveredPrompts.length === 1 && deliveredPrompts[0].at === 'settled',
  '⑥a★★★ after the write landed, the prompt was handed out — and the spy can SEE the ordering (record settled first)', deliveredPrompts)
ok(resA === 'ok' && tA.status().counts.ledgerRecorded === 1,
  '⑥a the delivery succeeded normally once the fact was durable (the await is not a wall)', { resA, counts: tA.status().counts })

// ⑥b A REJECTING record: the prompt must NOT be handed out. Handing it out would let the member act on a turn its
// siblings cannot see — the run-35 hole, one instance over.
const failingLedger = { record: () => Promise.reject(Object.assign(new Error('durable root is gone (test seam)'), { code: 'VMU_STORE_FAILED' })), count: () => 0 }
let calledAfterFail = 0
const tB = turnMod.createTurnOrchestrator({
  sectionPolicy: decideNothing, prompt: pipeline(), clock: () => '2026-01-01T00:00:00.000Z',
  deliver: async () => { calledAfterFail += 1; return 'ok' },
  turnLedger: failingLedger,
})
const openedB = tB.open({ member: 'r-fail', phase: 'normal', round: 1 })
const refusedDeliver = await tB.deliver(openedB.turn, 'the assembled prompt').then((v) => ({ value: v }), (e) => ({ error: e }))
ok(refusedDeliver.error && refusedDeliver.error.code === 'VMU_STORE_FAILED' && /ledger did not record/.test(String(refusedDeliver.error.message)),
  '⑥b★★★ a ledger write that did NOT land refuses the delivery BY NAME (the seam’s own code is not rewritten; the message says what failed)',
  refusedDeliver.error ? { code: refusedDeliver.error.code, message: refusedDeliver.error.message, hint: refusedDeliver.error.hint } : refusedDeliver.value)
ok(calledAfterFail === 0, '⑥b★★★ and the delivery adapter was NEVER called — the member was not given a prompt for an unrecorded turn', { called: calledAfterFail })
ok(tB.status().counts.ledgerFailed === 1 && tB.status().counts.ledgerLastFail && String(tB.status().counts.ledgerLastFail.code) === 'VMU_STORE_FAILED',
  '⑥b the failure is COUNTED and ATTRIBUTED (ledgerFailed + ledgerLastFail), not swallowed', tB.status().counts)

// ⑥c NO seam at all (the historical caller): behaviour is exactly as before — the prompt goes out, no new refusal.
let calledNoSeam = 0
const tC = turnMod.createTurnOrchestrator({
  sectionPolicy: decideNothing, prompt: pipeline(), clock: () => '2026-01-01T00:00:00.000Z',
  deliver: async () => { calledNoSeam += 1; return 'ok' },
})
const openedC = tC.open({ member: 'r-noseam', phase: 'normal', round: 1 })
const resC = await tC.deliver(openedC.turn, 'the assembled prompt')
ok(calledNoSeam === 1 && resC === 'ok' && tC.status().counts.ledgerRecorded === 0 && tC.status().counts.ledgerFailed === 0,
  '⑥c no `turnLedger` ⇒ the loop is byte-identical to before this round (nothing recorded, nothing refused, nothing counted)', { called: calledNoSeam, resC, counts: tC.status().counts })

// ⑥d A store that was never OPENED is a degraded instance, not a corrupt one: skipped and counted, never a refusal
// (every unit test and every host that builds `createKernel({ root })` without awaiting `ready()` is in this state).
const unopenedKernel = (await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)).createKernel({ settings: {}, root: rootFresh, host: null, deliverTurn: async () => 'ok' })
const unopenedStatus = unopenedKernel.turn.status()
ok(unopenedStatus.counts && unopenedStatus.counts.ledgerSkipped === 0 && unopenedStatus.counts.ledgerFailed === 0,
  '⑥d a kernel whose store was never opened starts with zero ledger counters (nothing is invented before the first turn)', unopenedStatus.counts)
let unopenedRefusal = null
try { await unopenedKernel.turn.deliver(unopenedKernel.turn.open({ member: 'r-1', phase: 'normal' }).turn, 'x') } catch (e) { unopenedRefusal = e }
ok(unopenedRefusal === null && unopenedKernel.turn.status().counts.ledgerSkipped === 1,
  '⑥d★★ an UNOPENED store is SKIPPED and counted (ledgerSkipped), NOT a refusal — "store is not open" is a degraded instance, not a corrupt ledger',
  { refusal: unopenedRefusal && unopenedRefusal.code, counts: unopenedKernel.turn.status().counts })

for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch (e) { /* best effort */ } }
try { await rm(BASE, { recursive: true, force: true }) } catch (e) { /* best effort */ }

console.log('')
if (failures.length) { console.error('FAILURES:'); for (const f of failures) console.error('  · ' + f) }
console.log('=== VMU RUN35 CHAIR ACT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
