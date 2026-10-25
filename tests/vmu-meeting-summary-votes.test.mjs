#!/usr/bin/env node
// ★★ LIVE RUN 20 (the institute's own report): after `close`, `action=summary` answered `votes:0` and `motions:[]`
// while the tally receipt had said `votes:2, outcome:true` — because the field counted MINUTES VOTE EVENTS only, and
// this decision had been taken through the BALLOT BOX (no motion existed at all). Two truthful sentences about
// different records read as one contradiction.
//
// The fix is not "count differently": it is that the count NAMES ITS SOURCE and the absent half is STATED. This suite
// pins both directions, plus the MOTION case (a motion vote must still be counted after close, otherwise the new
// source label would itself be a lie).
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' [' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)) + ']'))
}
const NOW = 1_700_000_000_000
const rec = (obj) => ({ get: (k) => obj[k], all: () => obj, has: (k) => Object.prototype.hasOwnProperty.call(obj, k) })
const mk = () => createMeetings({ clock: () => NOW, settings: rec({ 'vmu.meetings.quorumCap': 0 }) })
const roster = ['acad', 'res-1', 'res-2']

// ① a ballot-box decision leaves NO motion and NO minutes vote events ⇒ the count says so, and points at the box face
{
  const svc = mk()
  const open = svc.open({ type: 'ordinary', chair: 'acad', roster })
  const s = svc.summary({ meeting: open.meeting })
  ok(s.ok === true && s.votes === 0, 'votes[-]: a meeting with no motion votes reports 0', { votes: s.votes })
  ok(s.votesSource === 'none-recorded-on-this-face',
    '★ votesSource names WHY it is 0 (no motion votes, no minutes vote events) instead of leaving a bare 0', s.votesSource)
  ok(/BALLOT BOX/.test(String(s.votesNote)) && /boxstatus|boxclose/.test(String(s.votesNote)),
    '★★ and votesNote POINTS AT the record that does hold the decision (the ballot box face), so 0 cannot be read as "nothing was decided"',
    s.votesNote)
  ok(!/BALLOT BOX/.test(String(s.votesNote)) === false && s.motions.length === 0,
    '★ the motions array is empty in this case too (so the two readings agree about WHAT is empty)', { motions: s.motions.length })
}

// ② a MOTION vote is still counted — and still counted AFTER close (the case that made the old field read 0)
{
  const svc = mk()
  const open = svc.open({ type: 'ordinary', chair: 'acad', roster })
  const mo = svc.motion({ meeting: open.meeting, member: 'acad', kind: 'ordinary', text: 'adopt the lemma' })
  svc.second({ meeting: open.meeting, member: 'res-1', motion: mo.motion })
  svc.attend({ meeting: open.meeting, member: 'acad' })
  svc.attend({ meeting: open.meeting, member: 'res-1' })
  svc.attend({ meeting: open.meeting, member: 'res-2' })
  const v = svc.vote({ meeting: open.meeting, member: 'acad', motion: mo.motion, value: true })
  ok(v && v.ok === true, '★ the motion vote was accepted (fixture precondition, not the assertion)', v && v.ok)
  const before = svc.summary({ meeting: open.meeting })
  ok(before.votes === 1 && before.votesSource === 'motion-votes-kept-after-close',
    '★★ a real motion vote is counted and the source says motion-votes', { votes: before.votes, source: before.votesSource })
  svc.close({ meeting: open.meeting })
  const after = svc.summary({ meeting: open.meeting })
  ok(after.state === 'closed' && after.votes === 1 && after.votesSource === 'motion-votes-kept-after-close',
    '★★★ AFTER close the same count still reads 1 — this is the reading that used to collapse to 0 (the record survives the archive move)',
    { state: after.state, votes: after.votes, source: after.votesSource })
  ok(after.motions.length === 1 && after.motions[0].tally && after.motions[0].tally.for === 1,
    '★ and the motion itself survives close with its tally', { motions: after.motions.length, tally: after.motions[0] && after.motions[0].tally })
}

if (failed > 0) {
  console.error('=== VMU MEETING SUMMARY VOTES: ' + passed + ' passed, ' + failed + ' failed ===')
  for (const f of failures) console.error('  FAIL ' + f)
  process.exit(1)
}
console.log('=== VMU MEETING SUMMARY VOTES: ' + passed + ' passed, 0 failed ===')
