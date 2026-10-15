#!/usr/bin/env node
// vmu MEETING-ORDER GUARD — B③ order override + B④ the floor (R14 task-108 landed them; R15 task-112 puts them
// under guard here, ported from the throwaway probe `D:\_tmp\vmu-r14\order14.mjs`).
//
// WHAT THIS PROVES, and why each claim is kept APART from the receipt that claims it:
//   §1 HONESTY (R15 ①): `vote({motion:null})` records the vote (minutes + counters) but COUNTED NOTHING ⇒ the receipt
//      must not report a tally it cannot back (`tally:null` + a named `tallyNote` naming the real container). It used
//      to answer `{for:0,against:0,abstain:0}` while the call's own minutes row said a vote had happened.
//   §2 THE THREE RAILS of `overrideOrder`/`flow`: only the CHAIR (`VMU_NOT_PERMITTED`), a `why` is required
//      (`VMU_REASON_REQUIRED`), and the deployment must have DECLARED `vmu.meetings.orderMode` (`VMU_ENGINE_UNAVAILABLE`
//      — a code DEFAULT is not a declaration, so the default is "cannot override").
//   §3 THE OVERRIDE REALLY CHANGES THE ORDER (fifo `r-1,r-2` ⇒ round-robin `r-2,r-1`), and once it is in force the
//      setting is no longer consulted (`enforced[]` is EMPTY) while the override's own receipt names the key.
//   §4 THE FOUR FLOOR MODES each have an OBSERVABLE difference, and the two names the R8 ruling MERGED are refused
//      BY NAME with the replacement in the hint (never a silent alias, never a fifth mode).
//   §5 RECEIPT vs THING DONE: the audit row really lands in the minutes, the receipt ring really carries it, and the
//      override survives `restore()` — asserted separately from `ok:true`.
//   §6 `random` is DETERMINISTIC and AUDITABLE (seed + resulting order in the receipt; same inputs ⇒ same order).
//   §7 FALSIFICATION: the rails are shown to be the REFUSAL (mutant sources imported through a data: URL) — a guard
//      that cannot fail is decoration.
//
// RULE E: every collection assertion states NON-EMPTINESS in the SAME expression (and prints the count), so an empty
// collection cannot pass vacuously and the declaration-criterion fingerprint set does not grow.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++ } else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}
const codeOf = (fn) => { try { fn(); return 'NO-THROW' } catch (e) { return (e && e.code) || 'no-code' } }
const errOf = (fn) => { try { fn(); return null } catch (e) { return e } }

let NOW = 1000
/** The meetings-test harness shape: a GET-ONLY seam, so a key nobody declared reads as `undefined` (= undeclared). */
const svc = (vals = {}, seams = {}) => createMeetings(Object.assign({ clock: () => NOW, settings: { get: (k) => (vals || {})[k] } }, seams))
const ROSTER = ['acad', 'r-1', 'r-2', 'r-3']
const opened = (vals = {}, seams = {}) => {
  const t = svc(vals, seams)
  const r = t.open({ type: 'ordinary', chair: 'acad', roster: ROSTER })
  for (const m of ['r-1', 'r-2', 'r-3']) t.attend({ meeting: r.meeting, member: m })
  return { t, id: r.meeting }
}
const DECLARED = { 'vmu.meetings.quorumCap': 0, 'vmu.meetings.orderMode': 'fifo' }
const UNDECLARED = { 'vmu.meetings.quorumCap': 0 }

console.log('=== 1. HONESTY: a receipt may not report a count the call did not make ===')
{
  const a = opened(DECLARED)
  const before = a.t.status().counters.votes
  const r = a.t.vote({ meeting: a.id, member: 'acad', value: 1 })          // motion:null — an "open ballot"
  ok(r.ok === true, 'the rail still accepts a motion-less vote (it is RECORDED)', r && r.ok)
  ok(r.tally === null && r.receipt.tally === null,
    '★ the receipt claims NO tally for a motion-less vote (tally:null — never {for:0,against:0,abstain:0})', { tally: r.tally, receiptTally: r.receipt.tally })
  ok(r.counted === false && r.receipt.counted === false, 'and it says so out loud: counted:false', { counted: r.counted })
  ok(typeof r.tallyNote === 'string' && r.tallyNote.length > 0 && /ballot|box/i.test(r.tallyNote),
    'with a NAMED note that points at the real open-ballot container (kernel/ballot.js / ballotbox)', r.tallyNote)
  ok(Number(a.t.status().counters.votes) === before + 1,
    '★ the OTHER half of the same call is true and is asserted separately: the vote IS counted in the session counters', { before, after: a.t.status().counters.votes })
  const rows = a.t.minutes({ meeting: a.id }).entries.filter((e) => e.kind === 'vote')
  ok(rows.length === 1 && rows[rows.length - 1].motion === null,
    '★ and the minutes row really is written (motion:null) — the record and the receipt no longer contradict', rows.length)
  const mo = a.t.motion({ meeting: a.id, member: 'r-1', text: 'a motion' })
  const real = a.t.vote({ meeting: a.id, member: 'r-1', motion: mo.motion, value: 1 })
  ok(real.tally !== null && typeof real.tally === 'object' && Number.isFinite(real.tally.for) && real.counted === true,
    'positive control (non-vacuous): a vote ON A MOTION still reports a real numeric tally', real.tally)
}

console.log('=== 2. THE THREE RAILS (chair / why / declared) ===')
{
  const a = opened(DECLARED)
  ok(codeOf(() => a.t.overrideOrder({ meeting: a.id, by: 'r-1', why: 'x', mode: 'fifo' })) === 'VMU_NOT_PERMITTED',
    '★ overrideOrder[-]: a non-chair is refused BY NAME', codeOf(() => a.t.overrideOrder({ meeting: a.id, by: 'r-1', why: 'x', mode: 'fifo' })))
  ok(codeOf(() => a.t.flow({ meeting: a.id, mode: 'hands', by: 'r-1', why: 'x' })) === 'VMU_NOT_PERMITTED',
    '★ flow[-]: the same authority rail (no side door)')
  const e1 = errOf(() => a.t.overrideOrder({ meeting: a.id, by: 'r-1', why: 'x', mode: 'fifo' }))
  ok(!!e1 && typeof e1.hint === 'string' && e1.hint.includes('acad'), 'the refusal NAMES the declared chair in its hint', e1 && e1.hint)
  ok(Array.isArray(e1 && e1.enforced) && e1.enforced.length > 0 && e1.enforced.includes('vmu.meetings.orderMode'),
    'and it carries enforced[] naming the key (non-vacuous, count printed)', e1 && e1.enforced)
  ok(codeOf(() => a.t.overrideOrder({ meeting: a.id, by: 'acad', why: 'x', mode: 'fifo' })) === 'NO-THROW', 'the chair MAY decide')
  ok(codeOf(() => a.t.overrideOrder({ meeting: a.id, by: 'acad', mode: 'fifo' })) === 'VMU_REASON_REQUIRED', '★ overrideOrder[-]: no why ⇒ VMU_REASON_REQUIRED')
  ok(codeOf(() => a.t.flow({ meeting: a.id, mode: 'hands', by: 'acad' })) === 'VMU_REASON_REQUIRED', '★ flow[-]: no why ⇒ VMU_REASON_REQUIRED')
  ok(codeOf(() => a.t.overrideOrder({ meeting: a.id, by: 'acad', why: '   ', mode: 'fifo' })) === 'VMU_REASON_REQUIRED', 'a blank why is not a reason')
  const u = opened(UNDECLARED)
  ok(u.t.status().keys['vmu.meetings.orderMode'] === 'fifo',
    'precondition: the CODE DEFAULT (fifo) is in force although nobody declared it', u.t.status().keys['vmu.meetings.orderMode'])
  ok(codeOf(() => u.t.overrideOrder({ meeting: u.id, by: 'acad', why: 'x', mode: 'round-robin' })) === 'VMU_ENGINE_UNAVAILABLE',
    '★ undeclared key ⇒ VMU_ENGINE_UNAVAILABLE (the default is NO override)')
  ok(codeOf(() => u.t.flow({ meeting: u.id, mode: 'hands', by: 'acad', why: 'x' })) === 'VMU_ENGINE_UNAVAILABLE',
    '★ flow[-]: the same capability rail')
  const e2 = errOf(() => u.t.overrideOrder({ meeting: u.id, by: 'acad', why: 'x', mode: 'round-robin' }))
  ok(!!e2 && String(e2.message).includes('vmu.meetings.orderMode'), 'the refusal NAMES the undeclared key', e2 && e2.message)
  ok(codeOf(() => { const d = opened(DECLARED); return d.t.overrideOrder({ meeting: d.id, by: 'acad', why: 'x', mode: 'round-robin' }) }) === 'NO-THROW',
    'with the key DECLARED the same call succeeds ⇒ the rail really is the declaration')
}

console.log('=== 3. THE OVERRIDE REALLY CHANGES THE ORDER (and the setting stops being consulted) ===')
{
  const a = opened(DECLARED)
  a.t.speak({ meeting: a.id, member: 'r-1' })
  a.t.speak({ meeting: a.id, member: 'r-1' })                    // r-1 has spoken twice ⇒ round-robin sorts it last
  const q1 = a.t.queue({ meeting: a.id, member: 'r-1' })
  const q2 = a.t.queue({ meeting: a.id, member: 'r-2' })
  ok(q1.order.length > 0 && q2.order.join(',') === 'r-1,r-2',
    'precondition: under the DECLARED fifo setting the queue is the insertion order', q2.order)
  ok(q2.enforced.length > 0 && q2.enforced.includes('vmu.meetings.orderMode'),
    'under the setting, enforced[] names the key (count printed)', q2.enforced)
  const ov = a.t.overrideOrder({ meeting: a.id, by: 'acad', why: 'fairness: r-1 has spoken twice', mode: 'round-robin' })
  ok(ov.ok === true && ov.mode === 'round-robin' && ov.previous === 'fifo', 'the override reports what it replaced', { mode: ov.mode, previous: ov.previous })
  const q3 = a.t.queue({ meeting: a.id, member: 'r-1' })
  ok(q3.order.length === 2 && q3.order.join(',') === 'r-2,r-1',
    '★ THE ORDER REALLY CHANGED: round-robin puts the less-used speaker first', q3.order)
  ok(q3.mode === 'round-robin' && q3.modeSource === 'override', 'the effective mode reports its SOURCE', { mode: q3.mode, source: q3.modeSource })
  ok(q3.enforced.length === 0,
    '★ with the override in force the setting is NOT consulted again (enforced[] empty: read ≠ had effect)', q3.enforced)
  const view = a.t.orderView({ meeting: a.id })
  ok(view.ok === true && view.source === 'override' && view.order.join(',') === 'r-2,r-1', 'the per-meeting state is READABLE (orderView)', view)
  ok(ov.enforced.length === 1 && ov.enforced[0] === 'vmu.meetings.orderMode',
    "the override receipt names `vmu.meetings.orderMode` in enforced[]", ov.enforced)
}

console.log('=== 4. THE FOUR FLOOR MODES (each with a different observable) + the merged names ===')
{
  const seen = {}
  const o = opened(DECLARED)
  o.t.flow({ meeting: o.id, mode: 'open', by: 'acad', why: 'free discussion' })
  const qo = o.t.queue({ meeting: o.id, member: 'r-1' })
  seen.open = { queued: qo.queued, order: qo.order, mode: qo.mode }
  ok(qo.queued === false && qo.order.length === 0, 'open: `queue()` stores NOTHING (queued:false, order:[])', qo)
  const sp = o.t.speak({ meeting: o.id, member: 'r-2' })
  ok(sp.ok === true && sp.floor.queueOpen === false && sp.floor.mode === 'open',
    'open: a member who never queued speaks WITHOUT a "not your turn" refusal, and `floor` discloses the open floor', sp.floor)
  const h = opened(DECLARED)
  h.t.flow({ meeting: h.id, mode: 'hands', by: 'acad', why: 'hands up' })
  h.t.queue({ meeting: h.id, member: 'r-2' })
  const hq = h.t.queue({ meeting: h.id, member: 'r-1' })
  seen.hands = { order: hq.order, queued: hq.queued }
  ok(hq.queued === true && hq.order.join(',') === 'r-2,r-1',
    'hands: ONE AT A TIME in hand-raise (arrival) order, and any member queues themselves (self-service)', hq.order)
  const rr = opened(DECLARED)
  rr.t.flow({ meeting: rr.id, mode: 'round_robin', by: 'acad', why: 'fair rounds' })
  rr.t.speak({ meeting: rr.id, member: 'r-1' })
  rr.t.queue({ meeting: rr.id, member: 'r-1' })
  const rrq = rr.t.queue({ meeting: rr.id, member: 'r-2' })
  seen.round_robin = { order: rrq.order }
  ok(rrq.order.join(',') === 'r-2,r-1', 'round_robin: a member who has already spoken sorts AFTER one who has not', rrq.order)
  const c = opened(DECLARED)
  const fc = c.t.flow({ meeting: c.id, mode: 'call_on', by: 'acad', why: 'chair calls the roll' })
  ok(fc.order === 'chair' && fc.queueOpen === true, 'call_on installs the chair rule (the queue still exists)', fc.order)
  ok(codeOf(() => c.t.queue({ meeting: c.id, member: 'r-1' })) === 'VMU_NOT_PERMITTED',
    'call_on: a member may NOT take a place by themselves (BY NAME)')
  const cc = c.t.queue({ meeting: c.id, member: 'r-1', by: 'acad' })
  seen.call_on = { order: cc.order, selfService: false }
  ok(cc.ok === true && cc.order.join(',') === 'r-1', 'call_on: the CHAIR puts the speaker in the queue', cc.order)
  const modes = Object.keys(seen)
  ok(modes.length === 4 && modes.indexOf('open') !== -1 && modes.indexOf('hands') !== -1 && modes.indexOf('round_robin') !== -1 && modes.indexOf('call_on') !== -1,
    'precondition: all four floor modes were exercised (non-empty, count printed)', modes)
  ok(seen.open.queued === false && seen.hands.queued === true && seen.call_on.selfService === false &&
     seen.round_robin.order.join(',') === 'r-2,r-1' && seen.hands.order.join(',') === 'r-2,r-1',
    '★ the four modes differ observably: open=no queue · hands=arrival order+self-service · round_robin=speech-count · call_on=chair-only', seen)
  const t0 = svc(DECLARED)
  const r0 = t0.open({ type: 'ordinary', roster: ROSTER })          // no chair declared
  t0.attend({ meeting: r0.meeting, member: 'r-1' })
  ok(codeOf(() => t0.flow({ meeting: r0.meeting, mode: 'call_on', by: 'acad', why: 'x' })) === 'VMU_ENGINE_UNAVAILABLE',
    'call_on with NO declared chair ⇒ VMU_ENGINE_UNAVAILABLE (an undeclared authority is not invented)')
  const a = opened(DECLARED)
  ok(codeOf(() => a.t.flow({ meeting: a.id, mode: 'nonsense', by: 'acad', why: 'x' })) === 'VMU_INVALID_ARGUMENT', '★ unknown flow mode ⇒ VMU_INVALID_ARGUMENT')
  ok(codeOf(() => a.t.overrideOrder({ meeting: a.id, mode: 'nonsense', by: 'acad', why: 'x' })) === 'VMU_INVALID_ARGUMENT', '★ unknown order mode ⇒ VMU_INVALID_ARGUMENT')
  const e1 = errOf(() => a.t.flow({ meeting: a.id, mode: 'single', by: 'acad', why: 'x' }))
  ok(e1 && e1.code === 'VMU_INVALID_ARGUMENT' && String(e1.hint).includes('hands'),
    '★ the MERGED name `single` is refused and its hint names the mode that replaced it (hands)', e1 && e1.hint)
  const e2 = errOf(() => a.t.flow({ meeting: a.id, mode: 'directed', by: 'acad', why: 'x' }))
  ok(e2 && e2.code === 'VMU_INVALID_ARGUMENT' && String(e2.hint).includes('call_on'),
    '★ the MERGED name `directed` is refused and its hint names `call_on`', e2 && e2.hint)
}

console.log('=== 5. RECEIPT vs THING DONE (audit row / receipt ring / restore) ===')
{
  const a = opened(DECLARED)
  const before = a.t.minutes({ meeting: a.id }).entries.filter((e) => e.kind === 'order-override').length
  const ov = a.t.overrideOrder({ meeting: a.id, by: 'acad', why: 'audited because', mode: 'round-robin' })
  const rows = a.t.minutes({ meeting: a.id }).entries.filter((e) => e.kind === 'order-override')
  ok(rows.length === before + 1 && rows[rows.length - 1].by === 'acad' && rows[rows.length - 1].why === 'audited because',
    '★ THE AUDIT ROW LANDED (minutes), asserted apart from the receipt that says ok (count printed)', rows.length)
  const ring = a.t.receiptsView({}).receipts.filter((r) => r.action === 'override-order')
  ok(ring.length > 0 && ring[ring.length - 1].enforced.includes('vmu.meetings.orderMode'),
    '★ the RECEIPT RING carries the act (action + enforced, non-vacuous)', ring.length)
  ok(ov.receipt.at === rows[rows.length - 1].at && ov.receipt.mode === rows[rows.length - 1].mode,
    'the receipt and the audit row describe the SAME act (same instant, same mode)')
  const ff = a.t.flow({ meeting: a.id, mode: 'open', by: 'acad', why: 'opening the floor' })
  const ringFlow = a.t.receiptsView({}).receipts.filter((r) => r.action === 'flow')
  ok(ff.receipt.mode === 'open' && ringFlow.length > 0 && ringFlow[ringFlow.length - 1].mode === 'open',
    'flow() lands in the receipt ring too, with its mode', ringFlow.length)
  ok(a.t.queue({ meeting: a.id, member: 'r-1' }).queued === false, 'and the effect is real: the open floor keeps no queue')
  const snap = a.t.snapshot()
  const serialized = String((snap && snap.data && snap.data.live) || '')
  ok(snap.face === 'meetings' && serialized.length > 0 && serialized.includes('orderOverride'),
    'the override RIDES THE RECORD into the snapshot (durable-shaped, not a face-level side table)', serialized.length)
  const fresh = svc(DECLARED)
  const restored = fresh.restore(snap)
  const after = fresh.queue({ meeting: a.id, member: 'r-1' })
  ok(restored.ok === true && after.modeSource === 'flow' && after.mode === 'open' && after.queued === false,
    '★ the override SURVIVES restore: the next process honours the LAST act, not the setting',
    { restored: restored.ok, mode: after.mode, source: after.modeSource, queued: after.queued })
}

console.log('=== 6. `random` IS DETERMINISTIC AND AUDITABLE ===')
{
  const a = opened(DECLARED)
  for (const m of ['r-1', 'r-2', 'r-3']) a.t.queue({ meeting: a.id, member: m })
  const ov = a.t.overrideOrder({ meeting: a.id, by: 'acad', why: 'randomise the round', mode: 'random' })
  ok(typeof ov.seed === 'string' && /^[0-9a-f]{8}$/.test(ov.seed), 'the receipt carries a derived SEED (8 hex; no Math.random)', ov.seed)
  const r1 = a.t.queue({ meeting: a.id, member: 'r-1' })
  const r2 = a.t.queue({ meeting: a.id, member: 'r-2' })
  ok(r1.order.length === 3 && r2.order.length === 3, 'precondition: the queue is non-empty (3 members)', { a: r1.order, b: r2.order })
  ok(r1.order.join(',') === r2.order.join(','), '★ the SAME inputs give the SAME order twice (deterministic)', { first: r1.order, second: r2.order })
  const sorted = r1.order.slice().sort().join(',')
  ok(r1.order.length === 3 && sorted === ['r-1', 'r-2', 'r-3'].sort().join(','),
    'the random order is a PERMUTATION of exactly the queued members (nobody invented, nobody lost)', r1.order)
  ok(r1.receipt.seed === ov.seed && r1.order.join(',') === ov.receipt.order.join(','),
    'the override receipt records the seed AND the resulting order; `queue()` reports the same seed and order',
    { queueSeed: r1.receipt.seed, overrideSeed: ov.seed })
  const beforeRanks = r1.order.filter((x) => x !== 'r-3')
  a.t.queue({ meeting: a.id, member: 'r-4' })
  const r3 = a.t.queue({ meeting: a.id, member: 'r-1' })
  const afterRanks = r3.order.filter((x) => x !== 'r-3' && x !== 'r-4')
  ok(beforeRanks.length > 0 && afterRanks.length > 0 && afterRanks.join(',') === beforeRanks.join(','),
    '★ a member joining does NOT re-shuffle the ranks of the others (per-member key, not a shuffled position)', { beforeRanks, afterRanks })
}

console.log('=== 7. FALSIFICATION: the rails ARE the refusal (mutants imported via data: URL) ===')
{
  const src = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'meetingmarker.js'), 'utf8')
  const mutA = src.replace('if (!declared(ORDER_KEY)) {', 'if (false) {')
  const mutB = src.replace('if (String(m.chair) !== who) {', 'if (false) {')
  ok(mutA !== src && mutB !== src, 'the mutation anchors are present in the real module (the mutants are real edits)', { a: mutA !== src, b: mutB !== src })
  const asModule = (text) => import('data:text/javascript;base64,' + Buffer.from(text, 'utf8').toString('base64'))
  const realMod = await asModule(src)
  const noCap = await asModule(mutA)
  const noChair = await asModule(mutB)
  const deny = (code, message, hint, keys) => Object.assign(new Error(message), { code, enforced: keys })
  const drive = (mod, declared, by) => {
    const m = { id: 'm1', chair: 'acad', queue: [], speechUsed: new Map(), minutes: { entries: [] } }
    const c = mod.createOrderControls({ requireMeeting: () => m, clock: () => 1000, limits: () => ({ orderMode: 'fifo' }), declared, deny })
    return c.overrideOrder({ meeting: 'm1', by, why: 'x', mode: 'round-robin' })
  }
  ok(codeOf(() => drive(realMod, () => false, 'acad')) === 'VMU_ENGINE_UNAVAILABLE', 'real: the undeclared key REFUSES (capability rail)')
  ok(codeOf(() => drive(noCap, () => false, 'acad')) === 'NO-THROW',
    '★ MUTANT no-cap: with the rail removed the same call SUCCEEDS ⇒ the rail is the refusal, not a coincidence')
  ok(codeOf(() => drive(realMod, () => true, 'r-1')) === 'VMU_NOT_PERMITTED', 'real: a non-chair REFUSES (authority rail)')
  ok(codeOf(() => drive(noChair, () => true, 'r-1')) === 'NO-THROW',
    '★ MUTANT no-chair: with the authority rail removed the non-chair SUCCEEDS ⇒ that rail is the refusal')
}

console.log('')
console.log('=== VMU MEETING ORDER: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f) }
process.exit(failed === 0 ? 0 : 1)
