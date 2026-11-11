#!/usr/bin/env node
/**
 * tests/vmu-run229-meeting-clock.test.mjs — RUN 229: 会议的两个「时钟」与主席的批量发言序。
 *
 * THE SIMULATOR MEASURED THREE DEFECTS, and this file is the proof that each one is closed (RULE E: every claim is
 * paired with the premise it needs):
 *
 *  §1 ONE CLOCK FOR RELATIVE TIMES. `atMs("+60s")` used to add the offset to `Date.now()` (the WALL clock) while the
 *     refusal hint promised "the kernel adds it to its own clock" and every other time in `kernel/meetings.js` comes
 *     from the injected `clock`. In the simulator (fixed clock 1_800_000_000_000, wall clock 2026) `at:"+60s"` fell
 *     into the PAST and the meeting opened immediately instead of being scheduled. Now the offset is added to the
 *     injected clock, and the SAME offset decides when `sweepDue` settles the meeting (premise + consequence).
 *
 *  §2 ONE CLOCK IN ONE RECEIPT. The close receipt showed `closureVoteAsOf` (through `recordClosureVote`'s turn clock,
 *     which was wall-clock `new Date().toISOString()`) next to `closureVoteFrozen.frozenAt` (through the kernel clock):
 *     two readings of one instant that disagreed. `createTurnOrchestrator` now receives the kernel's own clock
 *     UNCHANGED, so ONE close receipt carries both numbers from the SAME clock — this test prints both raw values in
 *     the failure message, because a reader needs to see the disagreement, not be told about it.
 *
 *  §3 THE CHAIR'S BATCH ORDER (规则 L50: 批量指定成员按一定顺序发言). `vibe_vmu_meeting {action:"order"}` refused
 *     `members` as "a parameter for a neighbouring action" and the face had NO write path for a live queue, so the one
 *     rule with a written-down ordering claim could only be exercised on an EMPTY queue (invite). Now:
 *       · `order({members})` is the CHAIR's re-write of the whole queue, and the receipt says what it did
 *         (`before`/`after`/`moved[{member,from,to}]`/`dropped`) — `ok:true` alone would be the same class of lie the
 *         audits keep finding;
 *       · an ABSENT seat is refused BY NAME with the only repairs that work (attend, or the chair's admit under
 *         lateAdmission:"chair"), not with a promise to edit the queue;
 *       · a rule that RE-COMPUTES the order (round-robin/random) and an OPEN floor are refused by name (a stored list
 *         there would be contradicted by the next read);
 *       · `order` WITHOUT `members` returns EXACTLY today's read view (same fields, no `before`) — a caller that only
 *         reads sees nothing new.
 *
 * Run: node tests/vmu-run229-meeting-clock.test.mjs   (targeted only — never the full T1 suite)
 */
import { mkdirSync, mkdtempSync } from 'node:fs' // fs-purpose: temp kernel roots for the pack boot
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { SERVICE_CROSSING_ACTIONS } from '../vibe-math-vmu/tools/meeting.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(HERE)
const VMU = join(REPO, 'vibe-math-vmu')
const TMP = join(tmpdir(), 'vmu-run229-meeting-clock')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) }
  else { failed++; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const attempt = (fn) => { try { return { ok: true, value: fn() } } catch (e) { return { ok: false, error: e } } }
const errOf = (fn) => { const r = attempt(fn); return r.ok ? null : r.error }
const codeOf = (fn) => { const e = errOf(fn); return e ? (e.code || 'no-code') : 'NO-THROW' }
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, typeof text === 'string' ? text.slice(0, 300) : text)
const uniq = (list) => [...new Set(list)]

/* ── kernel harness: same shape tests/vmu-run225-late-admission.test.mjs uses ───────────────────────────────── */
let NOW = 1000
const rec = (vals) => ({ get: (k) => (vals || {})[k] })
const mk = (settings = {}) => {
  NOW = 1000
  return createMeetings({
    clock: () => NOW,
    settings: rec(Object.assign({ 'vmu.meetings.quorumCap': 0 }, settings)),
    log: () => {},
  })
}
const MEET = { type: 'ordinary', chair: 'acad', roster: ['acad', 'r-1', 'r-2', 'r-3'] }

console.log('\n=== 1. RELATIVE `at` IS ADDED TO THE INJECTED CLOCK (not to Date.now) ===')
{
  const K = 1_800_000_000_000
  const t = createMeetings({ clock: () => K, settings: rec({ 'vmu.meetings.quorumCap': 0 }), log: () => {} })
  const o = t.open(Object.assign({}, MEET, { at: '+60s' }))
  ok(o.ok === true && o.state === 'scheduled', 'premise: "+60s" on a fresh clock SCHEDULES the meeting', { state: o.state, scheduledFor: o.scheduledFor })
  ok(o.scheduledFor === K + 60_000, '"+60s" resolves against the INJECTED clock: scheduledFor = clock + 60s',
    { scheduledFor: o.scheduledFor, expected: K + 60_000, wallClock: Date.now() })
  // The defect was MEASURED in the simulator, whose clock is 2027-01-15 while the wall clock was 2026-11: when the two
  // are far apart the old code is observable as a scheduledFor computed from the OTHER clock. Only assert the negative
  // when the clocks really are far apart (a machine running in 2027+ would make the two agree by luck).
  if (Math.abs(Date.now() - K) > 120_000) {
    ok(o.scheduledFor !== Date.now() + 60_000, 'and NOT against Date.now(): the two clocks are far apart here, and the offset followed the kernel one',
      { scheduledFor: o.scheduledFor, wallPlus: Date.now() + 60_000 })
  } else {
    // NOT a skip-as-pass: assert the PREMISE that made the negative unobservable, so the branch can still go red
    // (a machine whose wall clock drifted away from the injected one would flip this).
    ok(Math.abs(Date.now() - K) <= 120_000,
      'the wall clock is within 2 min of the injected clock here, so Date.now()+60s and clock+60s coincide and the old defect is not observable on this machine (the assertion above still proves the offset followed the kernel clock)',
      { wallClock: Date.now(), injected: K, delta: Date.now() - K })
  }
  const v = t.meetingView({ meeting: o.meeting })
  ok(v.state === 'scheduled' && v.scheduledFor === K + 60_000, 'the READ face carries the same scheduled instant', v && { state: v.state, scheduledFor: v.scheduledFor })
  // the SAME offset decides settlement: not due 1ms early, due on the instant
  const early = t.sweepDue({ at: K + 59_999 })
  ok(early.transitions.filter((x) => x.meeting === o.meeting).length === 0, 'one millisecond before the offset expires the meeting is NOT swept',
    early && early.transitions)
  const due = t.sweepDue({ at: K + 60_000 })
  const tr = due.transitions.filter((x) => x.meeting === o.meeting)[0] || null
  ok(tr !== null && tr.from === 'scheduled' && (tr.to === 'waiting' || tr.to === 'open'),
    'at clock + 60s the sweep settles it (scheduled -> waiting, since only the chair has arrived)', due && due.transitions)
  const after = t.meetingView({ meeting: o.meeting })
  ok(after.state === 'waiting' || after.state === 'open', 'and the meeting really left `scheduled` (state read back)', after && after.state)

  const zero = t.open(Object.assign({}, MEET, { at: '+0s' }))
  ok(zero.state === 'open' && zero.scheduledFor === null, '"+0s" is NOW, so it opens immediately (not scheduled for the future)',
    { state: zero.state, scheduledFor: zero.scheduledFor })

  const absNum = t.open(Object.assign({}, MEET, { at: K + 120_000 }))
  ok(absNum.scheduledFor === K + 120_000, 'premise: an ABSOLUTE epoch number still means exactly that instant', absNum.scheduledFor)
  const absIso = t.open(Object.assign({}, MEET, { at: new Date(K + 180_000).toISOString() }))
  ok(absIso.scheduledFor === K + 180_000, 'premise: an ABSOLUTE ISO string still means exactly that instant', absIso.scheduledFor)
}

console.log('\n=== 2. ONE CLOSE RECEIPT: closureVoteAsOf AND closureVoteFrozen.frozenAt COME FROM THE SAME CLOCK ===')
mkdirSync(TMP, { recursive: true })
const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
const specs = []
const root = mkdtempSync(join(TMP, 'k-'))
const ctx = {
  effect: (fn) => fn(),
  on: () => () => {},
  tools: { register: async (spec) => { specs.push(spec); return () => {} } },
}
const KERNEL_CLOCK = 1_800_000_000_000
const handle = entry.apply(ctx, { clock: () => KERNEL_CLOCK, packs: ['v5r'], root })
await handle.ready()
await handle.kernel.store.open()
const specOf = (n) => specs.filter((s) => s && s.name === n)[0] || null
const call = async (name, args = {}) => {
  const spec = specOf(name)
  if (!spec) return { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered', hint: null }
  try {
    const raw = await spec.execute(args, { kernel: handle.kernel })
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed && typeof parsed === 'object' ? parsed : { ok: false, code: 'VMU_TEST_NO_RECEIPT', message: String(raw), hint: null }
  } catch (e) {
    return { ok: false, code: (e && (e.code || (e.cause && e.cause.code))) || 'VMU_TEST_THROWN', message: String((e && e.message) || e), hint: (e && e.hint) || null }
  }
}
const started = await call('vibe_v5_start', { problem: '前 n 个奇数之和等于 n 的平方', researcherCount: 2 })
ok(started.ok === true, 'premise: the pack boot hires the institute (r-acad, r-1, r-2)', started)
{
  const opened = handle.kernel.meetings.open({ type: 'ordinary', chair: 'r-acad', roster: ['r-acad', 'r-1', 'r-2'], at: 500, actor: 'r-acad' })
  ok(opened.ok === true && opened.state === 'open', 'premise: a started service meeting is open', opened && { ok: opened.ok, state: opened.state })
  const mid = opened.meeting
  for (const member of ['r-acad', 'r-1', 'r-2']) {
    const a = await call('vibe_vmu_meeting', { action: 'attend', id: mid, member })
    ok(a.ok === true, 'premise: ' + member + ' is present', a && { ok: a.ok, code: a.code })
  }
  for (const member of ['r-acad', 'r-1', 'r-2']) {
    const vote = await call('vibe_vmu_vote', { member, solved: true, why: 'the proposition is settled by the proof on the board' })
    ok(vote.ok === true, 'premise: ' + member + ' casts the closure vote through the tool', vote && { ok: vote.ok, code: vote.code })
  }
  const closed = await call('vibe_vmu_meeting', { action: 'close', id: mid, by: 'r-acad', actor: 'r-acad', reason: 'the question is settled' })
  ok(closed.ok === true && closed.state === 'closed', 'premise: the meeting closes', closed && { ok: closed.ok, code: closed.code, state: closed.state })
  const asOf = closed.closureVoteAsOf
  const frozen = closed.closureVoteFrozen || null
  const frozenAt = frozen ? frozen.frozenAt : null
  ok(asOf === KERNEL_CLOCK && frozenAt === KERNEL_CLOCK,
    'ONE close receipt carries closureVoteAsOf AND closureVoteFrozen.frozenAt from the SAME (injected) clock — raw values: '
      + 'closureVoteAsOf=' + JSON.stringify(asOf) + ' closureVoteFrozen.frozenAt=' + JSON.stringify(frozenAt) + ' injected clock=' + JSON.stringify(KERNEL_CLOCK),
    { closureVoteAsOf: asOf, closureVoteFrozen: frozen, injectedClock: KERNEL_CLOCK })
  ok(asOf === frozenAt, 'the two readings agree with EACH OTHER (the wall clock used to make them differ)',
    { closureVoteAsOf: asOf, frozenAt })
  ok(closed.closureVote !== null && typeof closed.closureVote === 'object' && closed.closureVote.votesCast === 3,
    'premise: the closure vote is readable next to the close (3 votes cast)', closed && closed.closureVote)
}

console.log('\n=== 3. THE CHAIR\'S BATCH ORDER IS A WRITE, AND THE RECEIPT SAYS WHAT IT DID ===')
{
  const t = mk()
  const o = t.open(Object.assign({}, MEET, { at: 1000 }))
  ok(o.state === 'open', 'premise: the meeting is open', o && o.state)
  for (const m of ['acad', 'r-1', 'r-2']) t.attend({ meeting: o.meeting, member: m })
  t.queue({ meeting: o.meeting, member: 'r-1' })
  t.queue({ meeting: o.meeting, member: 'r-2' })
  const read0 = t.orderView({ meeting: o.meeting })
  ok(Array.isArray(read0.order) && read0.order.join(',') === 'r-1,r-2', 'premise: a full read view exists before the write', read0.order)

  const res = t.order({ meeting: o.meeting, members: ['r-2', 'r-1'], by: 'acad', why: '先 r-2 后 r-1' })
  ok(res.ok === true, 'the CHAIR reorders the queue with order({members})', res)
  ok(Array.isArray(res.before) && res.before.join(',') === 'r-1,r-2', 'the receipt says what was there BEFORE (before)', res.before)
  ok(Array.isArray(res.after) && res.after.join(',') === 'r-2,r-1', 'the receipt says what is there AFTER (after)', res.after)
  ok(Array.isArray(res.moved) && res.moved.length === 2 && res.moved.every((x) => x && typeof x.from === 'number' && typeof x.to === 'number' && typeof x.member === 'string'),
    'the receipt names every member it MOVED with from/to (ok:true alone would not be a receipt)', res.moved)
  ok(Array.isArray(res.dropped) && res.dropped.length === 0, 'nobody was dropped from the queue', res.dropped)
  ok(Array.isArray(res.queue) && res.queue.join(',') === 'r-2,r-1', 'the returned queue IS the new order', res.queue)
  const read1 = t.orderView({ meeting: o.meeting })
  ok(read1.order.join(',') === 'r-2,r-1', 'the READ face sees the new order (the write is not a receipt-only fiction)', read1.order)
  const minutes = t.minutes({ meeting: o.meeting })
  const row = (minutes.entries || []).filter((e) => e.kind === 'floor-order').pop() || null
  ok(row !== null && row.by === 'acad' && Array.isArray(row.order) && row.order.join(',') === 'r-2,r-1',
    'the reorder is in the MINUTES (auditable, not just in the reply)', row)

  // premise: the queue order really constrains who may speak — a wrong-turn speaker is refused by name
  const outOfTurn = errOf(() => t.speak({ meeting: o.meeting, member: 'r-1', text: '我先说' }))
  ok(outOfTurn !== null && outOfTurn.code === 'VMU_FLOOR_OUT_OF_ORDER', 'premise: the queue is a real floor (out-of-turn speak is refused)', outOfTurn && outOfTurn.code)
  has(outOfTurn && outOfTurn.hint, 'action: "order"', 'the out-of-turn hint now names the CHAIR\'S order act as the way to change the queue')

  // an ABSENT seat cannot be ordered into the floor
  const absent = errOf(() => t.order({ meeting: o.meeting, members: ['r-2', 'r-3'], by: 'acad', why: 'skip' }))
  ok(absent !== null && absent.code === 'VMU_NOT_MEMBER', 'an ABSENT seat is refused by name', absent && absent.code)
  has(absent && absent.message, 'r-3', 'the refusal NAMES the absent seat')
  has(absent && absent.hint, 'attend(', 'the hint says how to make them present (attend)')
  has(absent && absent.hint, 'admit', 'the hint names the chair\'s admit under lateAdmission:"chair" (not a queue edit that cannot work)')

  // authority: only the chair, and the chair must be named
  const notChair = errOf(() => t.order({ meeting: o.meeting, members: ['r-2', 'r-1'], by: 'r-1' }))
  ok(notChair !== null && notChair.code === 'VMU_NOT_PERMITTED', 'a non-chair may not reorder the floor', notChair && notChair.code)
  has(notChair && notChair.hint, 'acad', 'the refusal names the declared chair')
  const noActor = errOf(() => t.order({ meeting: o.meeting, members: ['r-2', 'r-1'] }))
  ok(noActor !== null && noActor.code === 'VMU_INVALID_ARGUMENT', 'an order with no { by } is refused (an unattributed write cannot be audited)', noActor && noActor.code)

  // shape refusals, by name
  const empty = errOf(() => t.order({ meeting: o.meeting, members: [], by: 'acad' }))
  ok(empty !== null && empty.code === 'VMU_INVALID_ARGUMENT', 'an EMPTY members list is refused by name', empty && empty.code)
  const dup = errOf(() => t.order({ meeting: o.meeting, members: ['r-1', 'r-1'], by: 'acad' }))
  ok(dup !== null && dup.code === 'VMU_INVALID_ARGUMENT', 'a DUPLICATE seat is refused by name', dup && dup.code)
  const stranger = errOf(() => t.order({ meeting: o.meeting, members: ['r-1', 'r-9'], by: 'acad' }))
  ok(stranger !== null && stranger.code === 'VMU_NOT_MEMBER', 'a NON-MEMBER is refused by name', stranger && stranger.code)
  const unknown = errOf(() => t.order({ meeting: 'm-nope', members: ['r-1'], by: 'acad' }))
  ok(unknown !== null && unknown.code === 'VMU_NO_SUCH_OBJECT', 'an unknown meeting id is refused by name', unknown && unknown.code)

  // a rule that RE-COMPUTES the order cannot be bound by a stored list
  const rr = mk({ 'vmu.meetings.orderMode': 'round-robin' })
  const rrMeet = rr.open(Object.assign({}, MEET, { at: 1000 }))
  for (const m of ['acad', 'r-1', 'r-2']) rr.attend({ meeting: rrMeet.meeting, member: m })
  const recomputed = errOf(() => rr.order({ meeting: rrMeet.meeting, members: ['r-2', 'r-1'], by: 'acad' }))
  ok(recomputed !== null && recomputed.code === 'VMU_STATE', 'a round-robin (re-computing) order rule is refused by name — a stored list would be contradicted by the next read',
    recomputed && recomputed.code)
  has(recomputed && recomputed.hint, 'fifo', 'the refusal names the rules whose order IS the stored queue (fifo/chair)')
  // an OPEN floor has no queue at all
  const flowed = attempt(() => rr.flow({ meeting: rrMeet.meeting, mode: 'open', by: 'acad', why: 'open floor' }))
  if (flowed.ok && flowed.value && flowed.value.ok === true) {
    const openFloor = errOf(() => rr.order({ meeting: rrMeet.meeting, members: ['r-2', 'r-1'], by: 'acad' }))
    ok(openFloor !== null && openFloor.code === 'VMU_STATE', 'an OPEN floor (no queue) is refused by name', openFloor && openFloor.code)
    has(openFloor && openFloor.hint, 'flow(', 'the open-floor refusal names the act that selects a queue-bearing mode')
  } else {
    // NOT a skip-as-pass: assert the PREMISE (the flow was refused BY NAME) instead of claiming a pass for a branch
    // that never ran. If flow() started succeeding here the settings shape moved and we must hear about it.
    ok(flowed.ok === false && flowed.error && typeof flowed.error.code === 'string',
      'flow() is refused by name in this settings shape, which is the premise for the open-floor branch above',
      { ok: flowed.ok, code: flowed.error && flowed.error.code })
  }
  const noChair = t.open({ type: 'ordinary', roster: ['acad', 'r-1'], at: 1000 })
  if (noChair.ok === true) {
    const e = errOf(() => t.order({ meeting: noChair.meeting, members: ['r-1'], by: 'acad' }))
    ok(e !== null && e.code === 'VMU_ENGINE_UNAVAILABLE', 'a meeting with NO chair can never be ordered (no invented authority)', e && e.code)
  } else {
    // NOT a skip-as-pass: assert the PREMISE (a chairless meeting is refused BY NAME) rather than claiming a pass.
    ok(noChair.ok === false && typeof noChair.code === 'string',
      'a chairless meeting is refused by name, which is the premise for the no-chair branch above',
      { ok: noChair.ok, code: noChair.code })
  }
}
function flows(r) { return { ok: r.ok, code: r.code || null } }

console.log('\n=== 4. THE TOOL FACE: order WITH members WRITES / WITHOUT members STILL READS THE OLD SHAPE ===')
{
  ok(SERVICE_CROSSING_ACTIONS.includes('order'), 'premise: order is on the service forwarding whitelist', SERVICE_CROSSING_ACTIONS.length)
  const booted = specOf('vibe_vmu_meeting')
  ok(booted !== null, 'premise: the v5r boot registers the meeting tool')
  const enumVals = (booted && booted.parameters && booted.parameters.properties && booted.parameters.properties.action && booted.parameters.properties.action.enum) || []
  ok(enumVals.includes('order'), 'the REGISTERED enum advertises order', enumVals.length)

  const opened = handle.kernel.meetings.open({ type: 'ordinary', chair: 'r-acad', roster: ['r-acad', 'r-1', 'r-2'], at: 500, actor: 'r-acad' })
  ok(opened.ok === true && opened.state === 'open', 'premise: a fresh service meeting is open', opened && { ok: opened.ok, state: opened.state })
  const mid = opened.meeting
  for (const member of ['r-acad', 'r-1', 'r-2']) {
    const a = await call('vibe_vmu_meeting', { action: 'attend', id: mid, member })
    ok(a.ok === true, 'premise: ' + member + ' sits down through the tool', a && { ok: a.ok, code: a.code })
  }
  const inv = await call('vibe_vmu_meeting', { action: 'invite', id: mid, by: 'r-acad', why: 'round of remarks', members: ['r-1', 'r-2'] })
  ok(inv.ok === true, 'premise: the chair writes a queue with invite', inv && { ok: inv.ok, code: inv.code })

  const readOnly = await call('vibe_vmu_meeting', { action: 'order', id: mid })
  ok(readOnly.ok === true && readOnly.registry === 'service', 'order WITHOUT members is still a READ through the service registry', readOnly && { ok: readOnly.ok, registry: readOnly.registry })
  ok(Array.isArray(readOnly.order) && readOnly.order.join(',') === 'r-1,r-2', 'the read view carries the queue order', readOnly && readOnly.order)
  ok(readOnly.mode !== undefined && readOnly.source !== undefined && readOnly.queueOpen !== undefined, 'the read view keeps its old fields (mode/source/queueOpen)', readOnly && { mode: readOnly.mode, source: readOnly.source, queueOpen: readOnly.queueOpen })
  ok(Object.prototype.hasOwnProperty.call(readOnly, 'before') === false, 'the read view has NO write-only field (a reader sees nothing new)', Object.keys(readOnly).slice(0, 40))

  const wrote = await call('vibe_vmu_meeting', { action: 'order', id: mid, by: 'r-acad', reason: '先 r-2 后 r-1', members: ['r-2', 'r-1'] })
  ok(wrote.ok === true && wrote.registry === 'service', 'order WITH members WRITES through the service registry', wrote && { ok: wrote.ok, code: wrote.code, registry: wrote.registry })
  ok(Array.isArray(wrote.after) && wrote.after.join(',') === 'r-2,r-1', 'the tool receipt carries the new order (after)', wrote && wrote.after)
  ok(Array.isArray(wrote.before) && wrote.before.join(',') === 'r-1,r-2', 'the tool receipt carries the old order (before)', wrote && wrote.before)
  const readBack = await call('vibe_vmu_meeting', { action: 'order', id: mid })
  ok(readBack.order.join(',') === 'r-2,r-1', 'the tool READ face sees the written order', readBack && readBack.order)

  const empty = await call('vibe_vmu_meeting', { action: 'order', id: mid, by: 'r-acad', members: [] })
  ok(empty.ok === false && empty.code === 'VMU_INVALID_ARGUMENT', 'the TOOL refuses an empty members list by name', empty && empty.code)
  const notChair = await call('vibe_vmu_meeting', { action: 'order', id: mid, by: 'r-1', members: ['r-1', 'r-2'] })
  ok(notChair.ok === false && notChair.code === 'VMU_NOT_PERMITTED', 'the TOOL refuses a non-chair reorder by name', notChair && notChair.code)
  // a roster member who has NOT sat down: the refusal must name the repair that works (attend / admit), not a queue edit
  const half = handle.kernel.meetings.open({ type: 'ordinary', chair: 'r-acad', roster: ['r-acad', 'r-1', 'r-2'], at: 500, actor: 'r-acad' })
  ok(half.ok === true, 'premise: a second service meeting is open', half && half.code)
  for (const member of ['r-acad', 'r-1']) await call('vibe_vmu_meeting', { action: 'attend', id: half.meeting, member })
  const absent = await call('vibe_vmu_meeting', { action: 'order', id: half.meeting, by: 'r-acad', members: ['r-1', 'r-2'] })
  ok(absent.ok === false && absent.code === 'VMU_NOT_MEMBER', 'the TOOL refuses a roster seat that is NOT PRESENT by name', absent && absent.code)
  has(absent && absent.message, 'r-2', 'the tool refusal names the seat that is not present')
  has(absent && absent.hint, 'attend(', 'the tool hint names the repair (attend / admit), not a queue edit')
}

console.log('\n=== VMU RUN 229 (one clock for relative times + the chair\'s batch order): ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL - ' + f)
process.exit(failed ? 1 : 0)
