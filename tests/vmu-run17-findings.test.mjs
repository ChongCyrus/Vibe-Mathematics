#!/usr/bin/env node
// tests/vmu-run17-findings.test.mjs — the FOUR readings live run 17 reported after ⑩.1–⑩.4 all passed.
//
// Run 17 verified every shaped reading it was asked for (R17–R20) and then reported residuals about what the numbers
// MEAN. Each is pinned here at the layer that was wrong:
//
//  R21 `notified:["member-1"]` on a ruling that made NO delivery (self-addressed): the receipt claimed a recipient while
//      that member's mailbox held nothing. `notified` now lists only mailboxes written to; `notifiedMeans` explains the
//      empty list. (The behavioural half lives in tests/vmu-receipt-shapes.test.mjs, which used to pin the OLD claim.)
//  R22 `present:1` at open() while nobody attended — the chair is seated by open(), and no field said so.
//  R23 `voteFloor.effective:0` read as "the bar is very low" when it means "no bar is in force".
//  R24 `selectionIgnored.pending:null` beside a non-null `pendingMember` on the completion route: the turn id was on
//      `r.turn` as a STRING, so reading `.id` dropped it silently.
//  R25 the expired-wait hint named only one of the three accepted actor parameters.
//
// WHAT THIS DOES NOT PROVE: R21's receipt shape is asserted through the pack face elsewhere (a real boot); here only the
// rule that produced the empty list is checked. R24 is checked at source level because the completion route needs a
// settled member turn — the live run is the judge of the receipt.

import { readFileSync } from 'node:fs'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const ROOT = new URL('../', import.meta.url)
const src = (rel) => readFileSync(new URL(rel, ROOT), 'utf8')

// ── R22 + R23: the quorum reading names the chair's seat and the absence of a floor ───────────────────────────────
{
  let NOW = 5000
  const svc = createMeetings({ clock: () => NOW, settings: { get: () => undefined } })
  svc.open({ id: 'm1', roster: ['r-1', 'r-2'], chair: 'r-1', materials: 'run17' })
  const q = svc.quorum({ meeting: 'm1' })
  ok(q && q.presentBreakdown && q.presentBreakdown.chairSeated === true && q.presentBreakdown.attended === 0 && q.presentBreakdown.chair === 'r-1',
    '★★ R22: at open() the breakdown says the chair is SEATED and NOBODY has attended (the raw present:1 alone read as an arrival)',
    q && q.presentBreakdown)
  ok(q && q.present === 1 && q.presentBreakdown.attended === 0,
    'R22: `present` still counts the chair (the house may transact) — the fix is the breakdown, not the number', q && { present: q.present, attended: q.presentBreakdown.attended })
  ok(q && typeof q.presentNote === 'string' && /presentBreakdown splits/.test(q.presentNote) && /unanswered/.test(q.presentNote),
    'R22: and the note says what `present` is made of and which field splits it', q && q.presentNote)

  svc.attend({ meeting: 'm1', member: 'r-2' })
  const q2 = svc.quorum({ meeting: 'm1' })
  ok(q2 && q2.presentBreakdown.attended === 1 && q2.present === 2,
    'R22: a real attendance moves `attended` (not just `present`), so the two are not the same number twice', q2 && q2.presentBreakdown)

  ok(q && q.voteFloor && q.voteFloor.effective === 0 && /NO lower bound is in force/.test(String(q.voteFloor.effectiveNote)) && /ABSENT, not cheap/.test(String(q.voteFloor.effectiveNote)),
    '★★ R23: `effective:0` now SAYS the bar is absent rather than cheap (run 17 read minVotes:0 as a low bar)',
    q && q.voteFloor)
  ok(q && q.voteFloor.zeroBecause !== null && q.voteFloor.zeroBecause !== undefined,
    'R23: and the cause names which input was 0 (so "absent" is attributable, not asserted)', q && q.voteFloor.zeroBecause)

  const svc2 = createMeetings({ clock: () => NOW, settings: { get: (k) => (k === 'vmu.meetings.quorumMin' ? 2 : undefined) } })
  svc2.open({ id: 'm2', roster: ['r-1', 'r-2', 'r-3'], chair: 'r-1', materials: 'run17' })
  const q3 = svc2.quorum({ meeting: 'm2' })
  ok(q3 && q3.voteFloor.effective === 2 && /lower bound for a ruling is min/.test(String(q3.voteFloor.effectiveNote)),
    'R23: a NON-zero floor gets the formula sentence instead (the note cannot be a constant)', q3 && q3.voteFloor)
}

// ── R21 + R24 + R25: source-level, with the reason each could not be behavioural here ────────────────────────────
{
  const pack = src('vibe-math-vmu/packs/v5r/tools.js')
  ok(!/const notified = selfAddressed \? \[owner\]/.test(pack) && /const notified = delivery\.attempted === true && delivery\.ok === true \? \[owner\] : \[\]/.test(pack),
    '★★ R21: `notified` is built ONLY from a real delivery — the self-addressed branch no longer names the owner')
  ok(/notifiedMeans: selfAddressed/.test(pack) && /nothing to send/.test(pack),
    'R21: `notifiedMeans` explains the empty list for the self case (so empty is not read as a failure)')

  const turn = src('vibe-math-vmu/kernel/turn/index.js')
  ok(/const completedTurnId = \(\(\) => \{/.test(turn) && /pending: completedTurnId,/.test(turn),
    '★★ R24: the completion route reads the turn id through ONE reader and puts it on `selectionIgnored.pending`')
  ok(!/pending: r\.turn && r\.turn\.id !== undefined \? r\.turn\.id : null/.test(turn),
    'R24: the old `.id`-only read (which silently dropped a string id) is gone')
  ok(/pendingUnknown: completedTurnId === null/.test(turn) && /turn: completedTurnId, source: 'tool'/.test(turn),
    'R24: the same id is used by the receipt, and a genuinely unknown id is NAMED instead of left null')

  const meet = src('vibe-math-vmu/kernel/meetings.js')
  ok(/proceed\(\{ meeting, actor \| by \| member \}\)/.test(meet) && /the three names for the actor are the same thing/.test(meet),
    '★★ R25: the expired-wait hint lists all three accepted actor parameters (it named only `actor`)')
}

console.log('')
console.log('=== VMU RUN17 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('FAILED: ' + failures.join(' | ')); process.exit(1) }
