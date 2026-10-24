#!/usr/bin/env node
// tests/vmu-run13-findings.test.mjs — the FIVE readings that live run 13's own acceptance report asked for.
//
// WHY THIS FILE EXISTS. The phase-12 closure was premature exactly once, because "the machine criteria are green" was
// mistaken for "the rule set was accepted". The institute's own report is now the criterion, and every item it raised
// gets a gate HERE, at the layer that was wrong:
//
//  ⑧-a 「等待期里动作被拒，但理由说『quorum requires 0』」  → the refusal must name the FLOOR and the INSTITUTION RULE
//                                                            separately, and must say the floor IS met.
//  ⑧-b 「主席提前自决，overrodeQuorum 是 null」              → proceeding with the institution rule unmet must RECORD the
//                                                            override, naming WHICH rule authorised the start.
//  ⑧-c 「proceed 给了 member 却被说『主席没报名』」           → `member` is accepted as the same thing as `actor`.
//  ⑦.5 「sweep 痕迹只挂在 beat 回执上」                      → status() carries a BOUNDED history of transitions, so a
//                                                            transition from an earlier pass stays readable.
//  ⑦.3 「显式传 members 时 selectionIgnored 不出现」          → the pure reader names the held prompt, and only calls a
//                                                            selection ignored when it actually drops a pending turn.
//
// WHAT THIS DOES NOT PROVE: it does not run the host loop, so it cannot prove the fields reach a caller through the
// TOOL face (the live run does that). It proves the kernel's own readings, which is the layer each finding blamed.

import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { selectionReadingsOf } from '../vibe-math-vmu/kernel/turn/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const errOf = (fn) => { try { fn(); return null } catch (e) { return e } }
const codeOf = (fn) => { const e = errOf(fn); return e === null ? 'NO-THROW' : (e.code || 'no-code') }

let NOW = 1000
const settings = { get: () => undefined }
const svc = createMeetings({ clock: () => NOW, settings })

// ── ⑧-c / ⑧-b: one waiting meeting, with the floor met and the institution rule unmet ─────────────────────────
const opened = svc.open({ id: 'm1', roster: ['r-1', 'r-2'], chair: 'r-1', materials: 'run13', at: NOW + 1000 })
ok(opened && opened.ok === true, 'setup: a meeting can be scheduled', opened && opened.code)
NOW = NOW + 2000
const pass = svc.sweepDue({ at: NOW })
ok(pass && pass.transitions.some((t) => t.meeting === 'm1' && t.to === 'waiting'),
  'setup: the scheduled meeting settles to WAITING at its start time', pass && JSON.stringify(pass.transitions).slice(0, 160))

// ── ⑧-a: the refusal names the rule that is actually unmet ───────────────────────────────────────────────────
const railErr = errOf(() => svc.speak({ meeting: 'm1', by: 'r-1', text: 'premature' }))
ok(railErr !== null && railErr.code === 'VMU_STATE', '(a) acting in a waiting meeting is refused by name', railErr && railErr.code)
const railMsg = railErr ? String(railErr.message) : ''
ok(/the floor \(quorum\) requires \d+ and IS met/.test(railMsg),
  '★ (a) the message says the FLOOR is met, so "quorum requires 0" can no longer be read as the reason', railMsg.slice(0, 260))
ok(/the institution rule is not:/.test(railMsg),
  '★ (a) and it names the institution rule as the real blocker', railMsg.slice(0, 320))
ok(!/quorum requires \d+ — /.test(railMsg),
  '(a) the old wording that blamed the floor is gone (a floor of 0 with "refused" was self-contradictory)', railMsg.slice(0, 200))

// ── ⑧-c: `member` is accepted as the same thing as `actor` ─────────────────────────────────────────────────
const proceed = svc.proceed({ meeting: 'm1', member: 'r-1', why: 'run13: the chair names itself with `member`' })
ok(proceed && proceed.ok === true, '(c) proceed accepts `member` as the chair name (no "you named nobody" refusal)', proceed && proceed.code)
ok(proceed && proceed.by === 'r-1', '(c) and the receipt attributes the act to that member', proceed && proceed.by)
ok(proceed && proceed.state === 'open', '(c) the meeting really started', proceed && proceed.state)

// ── ⑧-b: the override is RECORDED, and it names which rule authorised the start ─────────────────────────────
ok(proceed && proceed.overrodeQuorum !== null && typeof proceed.overrodeQuorum === 'object',
  '★ (b) starting with the institution rule unmet produces a RECORD on `overrodeQuorum` (not null)', proceed && JSON.stringify(proceed.overrodeQuorum))
ok(proceed && proceed.overrodeQuorum && proceed.overrodeQuorum.whichRule === 'institution-rule',
  '★ (b) the record names WHICH rule was overridden (institution-rule, not the floor)', proceed && proceed.overrodeQuorum && proceed.overrodeQuorum.whichRule)
ok(proceed && proceed.overrodeQuorum && proceed.overrodeQuorum.unmetRule === 'unanimity' && proceed.overrodeQuorum.floorMet === true,
  '(b) and it carries the institution rule by name plus the fact that the FLOOR was met - the two can no longer be confused',
  proceed && JSON.stringify(proceed.overrodeQuorum))
ok(proceed && proceed.overrodeQuorumFlag === true, '(b) the compatibility flag agrees with the record', proceed && proceed.overrodeQuorumFlag)
ok(proceed && proceed.overrodeQuorum && proceed.overrodeQuorum.beforeDeadline === true,
  '(b) `beforeDeadline` is inside the record, so "started early" is readable without clock arithmetic',
  proceed && String(proceed.overrodeQuorum && proceed.overrodeQuorum.beforeDeadline))
ok(proceed && proceed.overrodeQuorum && proceed.overrodeQuorum.by === 'r-1',
  '(b) the record is attributable', proceed && proceed.overrodeQuorum && proceed.overrodeQuorum.by)

// ── the OTHER half of ⑧-b: when the FLOOR itself is unmet, the record must say so instead
// (the two branches have to be distinguishable, or "overrodeQuorum is set" would prove nothing about which rule)
const floored = createMeetings({ clock: () => NOW, settings: { get: (k) => (k === 'vmu.meetings.quorumMin' ? 2 : undefined) } })
const opened2 = floored.open({ id: 'm3', roster: ['r-1', 'r-2'], chair: 'r-1', materials: 'run13b', at: NOW + 1000 })
ok(opened2 && opened2.ok === true, 'setup: a second meeting can be scheduled under a declared floor of 2', opened2 && opened2.code)
NOW = NOW + 2000
floored.sweepDue({ at: NOW })
const proceedFloor = floored.proceed({ meeting: 'm3', actor: 'r-1', why: 'run13: the floor is unmet, not just unanimity' })
ok(proceedFloor && proceedFloor.ok === true, 'control: proceed still works when the FLOOR is unmet (that is the chair override)', proceedFloor && proceedFloor.code)
ok(proceedFloor && proceedFloor.overrodeQuorum && proceedFloor.overrodeQuorum.whichRule === 'floor',
  '★ (b) the SAME field names the FLOOR branch when the floor is what was overridden - one field, two distinguishable rules',
  proceedFloor && JSON.stringify(proceedFloor.overrodeQuorum))
ok(proceedFloor && proceedFloor.overrodeQuorum && proceedFloor.overrodeQuorum.floor === 2 && proceedFloor.overrodeQuorum.present === 1,
  '(b) the floor record carries the floor and the presence count that did not meet it',
  proceedFloor && JSON.stringify(proceedFloor.overrodeQuorum))

// ── ⑦.5: status() carries a bounded history, so an earlier pass's transition is still readable ──────────────
const after = svc.status({})
ok(after && after.sweep && Array.isArray(after.sweep.recentTransitions),
  '★ (⑦.5) status() exposes `recentTransitions` (the bounded history) beside the last pass', after && after.sweep && Object.keys(after.sweep).join(','))
ok(after && after.sweep && after.sweep.recentTransitions.some((tr) => tr.meeting === 'm1' && tr.from === 'scheduled' && tr.to === 'waiting'),
  '★ (⑦.5) a transition from an EARLIER pass is still visible (m1 scheduled→waiting)', after && JSON.stringify((after.sweep.recentTransitions || []).slice(0, 3)))
ok(after && after.sweep && typeof after.sweep.recentTransitionsNote === 'string' && /BOUNDED/.test(after.sweep.recentTransitionsNote),
  '(⑦.5) the history announces its own bound (no silent truncation)', after && after.sweep && after.sweep.recentTransitionsNote)
ok(after && after.sweep && after.sweep.transitions !== undefined && Array.isArray(after.sweep.transitions),
  '(⑦.5) the LAST pass is still described on its own (`transitions`), so history did not replace it', after && Object.keys(after.sweep).join(','))

// ── ⑦.3: the selection reader ────────────────────────────────────────────────────────────────────────────────
const noHeld = selectionReadingsOf(null, ['r-2'])
ok(noHeld.pending === null && noHeld.selectionIgnored === null && noHeld.superseded === null,
  '⑦.3 setup: with nothing held the readings are all null (no invented pending)', JSON.stringify(noHeld))
const sameMember = selectionReadingsOf({ member: 'r-1', turnId: 't-1' }, ['r-1'])
ok(sameMember.pending && sameMember.pending.member === 'r-1' && sameMember.pending.turn === 't-1',
  '★ (⑦.3) `pending` NAMES the prompt the caller is holding (turn + member), instead of `pending: null`',
  JSON.stringify(sameMember.pending))
ok(sameMember.selectionIgnored === null && sameMember.selectionApplied === true,
  '(⑦.3) a selection that MATCHES the held prompt ignores nothing (the field cannot fire on a happy path)', JSON.stringify(sameMember))
const otherMember = selectionReadingsOf({ member: 'r-1', turnId: 't-7' }, ['r-2'])
ok(otherMember.selectionIgnored !== null,
  '★★ (⑦.3) a selection that EXCLUDES the held member is reported as ignored - this is the exact call live run 13 could not read',
  JSON.stringify(otherMember.selectionIgnored))
ok(otherMember.selectionIgnored && otherMember.selectionIgnored.pendingMember === 'r-1' && otherMember.selectionIgnored.pending === 't-7',
  '(⑦.3) it names the member AND the turn that is about to be dropped', JSON.stringify(otherMember.selectionIgnored))
ok(otherMember.selectionIgnored && Array.isArray(otherMember.selectionIgnored.requested) && otherMember.selectionIgnored.requested.join(',') === 'r-2',
  '(⑦.3) and it echoes what the caller asked for', JSON.stringify(otherMember.selectionIgnored && otherMember.selectionIgnored.requested))
ok(otherMember.superseded && otherMember.superseded.member === 'r-1' && otherMember.superseded.turn === 't-7',
  '★★ (⑦.3) the dropped turn is NAMED in `superseded` - it no longer vanishes', JSON.stringify(otherMember.superseded))
ok(otherMember.selectionApplied === false, '(⑦.3) and `selectionApplied` agrees', String(otherMember.selectionApplied))
const noSelection = selectionReadingsOf({ member: 'r-1', turnId: 't-1' }, [])
ok(noSelection.selectionIgnored === null && noSelection.pending && noSelection.pending.member === 'r-1',
  '⑦.3 control: with NO explicit selection nothing is "ignored" (the default roster is not a caller asking for somebody)',
  JSON.stringify(noSelection))
const bareTurn = selectionReadingsOf({ member: 'r-1' }, ['r-2'])
ok(bareTurn.selectionIgnored && bareTurn.selectionIgnored.pending === null,
  '⑦.3: an unknown turn id stays null rather than being invented', JSON.stringify(bareTurn.selectionIgnored))

console.log('')
if (failures.length) { console.error('FAILURES:'); for (const f of failures) console.error('  · ' + f) }
console.log('=== VMU RUN13 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
