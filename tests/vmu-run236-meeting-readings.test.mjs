#!/usr/bin/env node
/**
 * tests/vmu-run236-meeting-readings.test.mjs — RUN 236 / FEEDBACK60 M1·M7·M8：会议读数自相矛盾（真机 run 60 实测）。
 *
 * WHAT THIS PINS (each assertion carries the premise it needs, per RULE E):
 *  §1 M7 — a NON-LATE `attend` used to answer `{late:false, lateAdmission:"chair", pendingLate:false}` and say nothing
 *     about WHY it was not late. With the default `vmu.meetings.lateAfterMs=0` nobody can be late, so `late:false` does
 *     NOT mean "on time" — it means this deployment does not measure lateness. The receipt now carries
 *     `openedAt`/`elapsedMs`/`lateAfterMs` + one `lateMeans` sentence on BOTH paths (normal and `lateAdmission:"chair"`),
 *     and the sentence names the threshold and the actual milliseconds. `lateAfterMs` itself keeps its H2 build-time
 *     snapshot semantics (not changed here).
 *  §2 M1 — `extend` with `vmu.meetings.speechExtendMs=0` returned `{ok:true, ms:60000, extensions:1, max:0}` while
 *     `status.speechExtendMs` read 0: `ok:true` + a growing `extensions` looked like a raise that never happened. When the
 *     declared step is 0 the call is now answered `applied:false` with `ms:0` and a `requestedMs` echo, and it does NOT
 *     touch the counters (`extensions` stays, `speechUsed` gains no row). A deployment that DECLARES a step still gets
 *     `applied:true`; "no step declared" keeps its named `VMU_INVALID_ARGUMENT`.
 *  §3 M8 — `turns` and `speechUsed` are two readings of the same fact. A REFUSED speak used to increment `turns` and a
 *     generic merge dropped the larger `speechUsed` count, so a run could read `turns:2` beside `speeches:1` with no way
 *     to tell which number was the account. Now the counter advances only at the ACCEPTANCE POINT, the merge takes the
 *     per-member MAX, `turns` is reconciled to `Σ speechUsed.count`, and any remainder is NAMED as `turnsUnattributed`
 *     (never silently subtracted from `turns`).
 *
 * Run: node tests/vmu-run236-meeting-readings.test.mjs   (targeted only)
 */
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

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
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, typeof text === 'string' ? text.slice(0, 240) : text)
const sumOf = (rows) => rows.reduce((s, r) => s + (Number(r && r.speeches) || 0), 0)

/* ── kernel harness: the shape tests/vmu-run225/run230 use ──────────────────────────────────────────────────── */

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
const MEET = { type: 'ordinary', chair: 'acad', roster: ['acad', 'r-1', 'r-2'] }

console.log('=== 1. M7: a NON-late attend explains itself (and 0 means "nobody is late", not "you were on time") ===')
{
  const t = mk({})
  const o = t.open(MEET)
  const at = t.attend({ meeting: o.meeting, member: 'r-1' })
  ok(at.ok === true && at.late === false, 'premise: r-1 attends on time and is NOT late', at && { ok: at.ok, late: at.late })
  ok(typeof at.openedAt === 'number' && typeof at.elapsedMs === 'number' && typeof at.lateAfterMs === 'number',
    '★ M7: the non-late receipt now carries openedAt / elapsedMs / lateAfterMs', { openedAt: at.openedAt, elapsedMs: at.elapsedMs, lateAfterMs: at.lateAfterMs })
  ok(at.lateAfterMs === 0, 'premise: the default vmu.meetings.lateAfterMs is 0 on this deployment', at.lateAfterMs)
  has(at.lateMeans, 'NOT JUDGED', '★★ M7: with a 0 threshold the sentence says the question was NEVER JUDGED (not "on time")')
  has(at.lateMeans, 'NOBODY is ever counted late', '★★ M7: the sentence says what a 0 threshold means for every member')
  // ★ TB-2694 / F75-05: the RETURN VALUE no longer carries a second FULL copy of the readings inside `receipt`
  // (that copy is what made one attend answer 16 163 B — see kernel/meetings.js `wireReads`/`wireReceipt`). The
  // assertion below therefore reads the RECORDED receipt, which still holds every reading in full; the top level of
  // the same answer carries them too, so "one reading, one wire copy" stays checkable.
  const recordedAt = (svc) => { const v = svc.receiptsView({ limit: 10 }); return (v.receipts || []).filter((r) => r && r.action === 'attend').slice(-1)[0] || null }
  const rec = recordedAt(t)
  ok(rec && rec.lateReads && Number(rec.lateReads.elapsedMs) === 0 && rec.lateMeans === at.lateMeans,
    '★ M7: the recorded receipt carries the same three readings and the same sentence', rec && rec.lateReads)

  NOW = 6000
  const at2 = t.attend({ meeting: o.meeting, member: 'r-2' })
  ok(at2.ok === true && at2.elapsedMs === 5000 && at2.late === false,
    '★★ M7: the reading grows with the clock (5000 ms after openedAt) while the VERDICT stays "not judged"', { elapsedMs: at2.elapsedMs, late: at2.late })
  has(at2.lateMeans, 'NOT JUDGED', '★★ M7: 5 s after open, `late:false` still does not claim r-2 was on time')

  const d = mk({ 'vmu.meetings.lateAfterMs': 3000 })
  const od = d.open(MEET)
  NOW = 2000
  const within = d.attend({ meeting: od.meeting, member: 'r-1' })
  ok(within.late === false && within.lateAfterMs === 3000 && within.elapsedMs === 1000,
    'premise: a declared 3000 ms threshold, arrival 1000 ms after open', { late: within.late, elapsed: within.elapsedMs })
  has(within.lateMeans, 'NOT LATE', '★ M7: inside the threshold the sentence says NOT LATE and names the threshold')
  has(within.lateMeans, '3000', '★ M7: …with the declared threshold number in it')
  NOW = 11000
  const over = d.attend({ meeting: od.meeting, member: 'r-2' })
  ok(over.late === true && over.elapsedMs === 10000, 'premise: the same 3000 ms meeting, arrival 10000 ms after open', { late: over.late, elapsed: over.elapsedMs })
  has(over.lateMeans, 'LATE', '★ M7: past the threshold the sentence says LATE')
  has(over.lateMeans, '10000', '★ M7: …and names the actual milliseconds, not just the verdict')

  const c = mk({ 'vmu.meetings.lateAfterMs': 3000 })
  const oc = c.open(Object.assign({}, MEET, { lateAdmission: 'chair' }))
  NOW = 11000
  const door = c.attend({ meeting: oc.meeting, member: 'r-1' })
  ok(door.ok === true && door.late === true && door.lateAdmission === 'chair' && door.pendingLate === true,
    'premise: a late arrival under lateAdmission:"chair" is held at the door', { late: door.late, door: door.pendingLate })
  ok(typeof door.lateMeans === 'string' && door.lateMeans.includes('LATE') && typeof door.elapsedMs === 'number' && door.elapsedMs === 10000,
    '★★ M7: the CHAIR-held path carries the same readings + sentence (it used to say only late/pendingLate)',
    { elapsedMs: door.elapsedMs, sentence: door.lateMeans && door.lateMeans.slice(0, 80) })
  // TB-2694 / F75-05: read the RECORDED door receipt (the return value's `receipt` is now a pointer, not a copy).
  const recDoor = recordedAt(c)
  ok(recDoor && recDoor.lateReads && Number(recDoor.lateReads.lateAfterMs) === 3000,
    '★ M7: the door receipt records the threshold it was judged against', recDoor && recDoor.lateReads)
}

console.log('\n=== 2. M1: `extend` with a declared step of 0 grants NOTHING and must not read like a raise ===')
{
  const t = mk({})
  const o = t.open(MEET)
  const e = t.extend({ meeting: o.meeting, member: 'r-1', by: 'acad', ms: 60000 })
  ok(e.ok === true && e.applied === false, '★★ M1: the call still succeeds but says applied:false', e && { ok: e.ok, applied: e.applied })
  ok(e.ms === 0 && e.requestedMs === 60000 && e.speechExtendMs === 0,
    '★★ M1: ms:0 (granted) beside requestedMs:60000 (asked) and speechExtendMs:0 (why)', { ms: e.ms, requestedMs: e.requestedMs, declared: e.speechExtendMs })
  ok(e.extensions === 0 && e.max === 0,
    '★★ M1: the counters did NOT move (extensions stayed 0; the ceiling is the declared 0)', { extensions: e.extensions, max: e.max })
  has(e.appliedMeans, 'granted NO speech time', '★★ M1: appliedMeans states plainly that no speech time was granted')
  has(e.appliedMeans, 'extendlimit', '★ M1: …and points at the command that DOES move a bound (the meeting wall clock)')
  ok(e.receipt && e.receipt.action === 'extend' && e.receipt.applied === false && e.receipt.ms === 0 && e.receipt.requestedMs === 60000,
    '★ M1: the recorded receipt says the same (action/applied/ms/requestedMs)', e.receipt)

  const view = t.meetingView({ meeting: o.meeting })
  ok(Array.isArray(view.speechUsed) && view.speechUsed.length === 0,
    '★★ M1: no speechUsed row was created — a grant of 0 ms is not a grant', view.speechUsed)
  const sum = t.summary({ meeting: o.meeting })
  ok(sum.speechExtendMs === 0 && sum.speechExtendMax === 0 && sum.speechUsed.length === 0,
    '★ M1: the read face keeps saying speechExtendMs/Max=0 — the receipt and the status now AGREE',
    { declared: sum.speechExtendMs, max: sum.speechExtendMax, used: sum.speechUsed })

  const twice = t.extend({ meeting: o.meeting, member: 'r-1', by: 'acad', ms: 60000 })
  ok(twice.ok === true && twice.applied === false && twice.extensions === 0,
    '★ M1: repeating the call still grants nothing and does not inflate `extensions`', { extensions: twice.extensions })

  const d = mk({ 'vmu.meetings.speechExtendMs': 60000, 'vmu.meetings.speechExtendMax': 1 })
  const od = d.open(MEET)
  const granted = d.extend({ meeting: od.meeting, member: 'r-1', by: 'acad' })
  ok(granted.ok === true && granted.applied === true && granted.ms === 60000 && granted.extensions === 1 && granted.max === 1,
    '★★ M1 premise (unchanged): a deployment that DECLARES 60000/1 still gets applied:true with the declared step',
    { applied: granted.applied, ms: granted.ms, extensions: granted.extensions, max: granted.max })
  const dview = d.meetingView({ meeting: od.meeting })
  ok(dview.speechUsed.length === 1 && dview.speechUsed[0].extensions === 1 && dview.speechUsed[0].speeches === 0,
    '★ M1: the grant is visible on the read face (extensions 1, speeches 0)', dview.speechUsed)

  const n = mk({})
  const on = n.open(MEET)
  ok(codeOf(() => n.extend({ meeting: on.meeting, member: 'r-1', by: 'acad' })) === 'VMU_INVALID_ARGUMENT',
    '★ M1 premise (unchanged): with NO step declared and none passed, the call still refuses by name')
  const err = errOf(() => n.extend({ meeting: on.meeting, member: 'r-1', by: 'acad' }))
  has(err && err.message, 'no extension step is declared', '★ M1: …and the message still names the missing step')
}

console.log('\n=== 3. M8: `turns` and `speechUsed` are ONE account on the face a run reads ===')
{
  const t = mk({})
  const o = t.open(MEET)
  t.attend({ meeting: o.meeting, member: 'r-1' })
  t.attend({ meeting: o.meeting, member: 'r-2' })
  const s1 = t.speak({ meeting: o.meeting, member: 'r-1', text: 'first' })
  const s2 = t.speak({ meeting: o.meeting, member: 'r-2', text: 'second' })
  ok(s1.ok === true && s2.ok === true, 'premise: two speeches are accepted', { a: s1.ok, b: s2.ok })

  const v = t.meetingView({ meeting: o.meeting })
  ok(Array.isArray(v.speechUsed) && v.speechUsed.length === 2, 'premise: both members have a speechUsed row', v && v.speechUsed)
  ok(v.speechUsed.every((r) => r.speeches === 1), 'premise: one speech each', v && v.speechUsed)
  ok(v.turns === 2 && v.turnsAccounted === 2 && v.turnsUnattributed === 0,
    '★★ M8: turns === Σ speechUsed.count and nothing is unattributed', { turns: v.turns, accounted: v.turnsAccounted, unattributed: v.turnsUnattributed })
  ok(sumOf(v.speechUsed) === v.turns, '★★ M8: the two readings are one account (Σ rows === turns)', { sum: sumOf(v.speechUsed), turns: v.turns })
  ok(typeof v.turnsUnattributedMeans === 'string' && v.turnsUnattributedMeans.includes('0 means every counted turn'),
    '★★ M8: the face explains what turnsUnattributed means instead of leaving the reader to guess', v.turnsUnattributedMeans)

  // the refusal has to be PROVOKED on purpose: verbatim capture is ON by default on this kernel, so the fixture turns
  // it off for its own deployment rather than assuming a refusal it never produced.
  const tv = mk({ 'vmu.meetings.verbatimEnabled': false })
  const ot = tv.open(MEET)
  tv.attend({ meeting: ot.meeting, member: 'r-1' })
  tv.attend({ meeting: ot.meeting, member: 'r-2' })
  tv.speak({ meeting: ot.meeting, member: 'r-1', text: 'kept' })
  tv.speak({ meeting: ot.meeting, member: 'r-2', text: 'kept too' })
  const refused = errOf(() => tv.speak({ meeting: ot.meeting, member: 'r-1', text: 'not recorded', verbatim: true }))
  ok(refused && refused.code === 'VMU_NOT_PERMITTED', 'premise: a verbatim speech is REFUSED on a deployment with verbatimEnabled=false', refused && refused.code)
  const v2 = tv.meetingView({ meeting: ot.meeting })
  ok(v2.turns === 2 && v2.turnsAccounted === 2 && v2.turnsUnattributed === 0,
    '★★ M8: a REFUSED speak leaves BOTH readings untouched (before the fix it added an unattributed turn)',
    { turns: v2.turns, accounted: v2.turnsAccounted, unattributed: v2.turnsUnattributed })

  const sum = tv.summary({ meeting: ot.meeting })
  ok(sum.turns === v2.turns && sum.turnsAccounted === v2.turnsAccounted && sum.turnsUnattributed === v2.turnsUnattributed,
    '★ M8: summary() reads the same three numbers as meetingView()', { sum: [sum.turns, sum.turnsAccounted, sum.turnsUnattributed] })
  ok(Array.isArray(sum.speechUsed) && sum.speechUsed.length === 2, 'premise: summary carries the speech rows too', sum && sum.speechUsed)

  // ── the merge: two instances, one floor. A stale local row must not outvote a larger stored count.
  const A = mk({})
  const oa = A.open(MEET)
  A.attend({ meeting: oa.meeting, member: 'r-1' })
  A.speak({ meeting: oa.meeting, member: 'r-1', text: 'A-one' })
  const B = mk({})
  const r1 = B.restoreReload(A.snapshot())
  ok(r1.ok === true && r1.adoptedLive === 1, 'premise: the second kernel adopts the live meeting', { ok: r1.ok, adopted: r1.adoptedLive })
  B.attend({ meeting: oa.meeting, member: 'r-2' })
  B.speak({ meeting: oa.meeting, member: 'r-1', text: 'B-one' })
  B.speak({ meeting: oa.meeting, member: 'r-2', text: 'B-two' })
  const bv = B.meetingView({ meeting: oa.meeting })
  ok(bv.turns === 3 && bv.turnsAccounted === 3, 'premise: the stored side has turns 3 with three recorded speeches', { turns: bv.turns, accounted: bv.turnsAccounted })

  const r2 = A.restoreReload(B.snapshot())
  ok(r2.ok === true && r2.mergedLive === 1, 'premise: the reload MERGES the same-id live row', { merged: r2.mergedLive })
  ok(Array.isArray(r2.mergedFields) && r2.mergedFields.some((f) => String(f).includes('speechUsed')),
    '★★ M8: the merge NAMES speechUsed as a field it merged (before the fix it was silently dropped)',
    r2.mergedFields)
  const av = A.meetingView({ meeting: oa.meeting })
  const r1row = Array.isArray(av.speechUsed) ? av.speechUsed.find((r) => r.member === 'r-1') : null
  ok(r1row && r1row.speeches === 2,
    '★★ M8: the stored LARGER count wins (r-1: 2, not the local 1) — the old generic merge kept the local row',
    av.speechUsed)
  ok(av.turns === 3 && av.turnsAccounted === sumOf(av.speechUsed) && av.turnsUnattributed === 0,
    '★★ M8: after the merge turns === Σ count with nothing left unexplained',
    { turns: av.turns, accounted: av.turnsAccounted, unattributed: av.turnsUnattributed, rows: av.speechUsed })
}

console.log('\n──────────────────────────────────────────────────────────────')
console.log('RUN 236 meeting-readings: ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
} else {
  console.log('RESULT: PASS')
}
