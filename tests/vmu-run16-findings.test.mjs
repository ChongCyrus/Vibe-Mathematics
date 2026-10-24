#!/usr/bin/env node
// tests/vmu-run16-findings.test.mjs — the FOUR readings live run 16's own acceptance report asked for.
//
// WHY THIS FILE EXISTS. Run 16 verified R16 (the seat) and ⑨.1/⑨.2/⑨.3 live, and then raised four residuals. Each one
// is pinned HERE at the layer that was wrong:
//
//  R17 「proceed() 造成的 waiting→open 不进 sweep.recentTransitions」 → the bounded history records EVERY state move,
//       not only the ones a pass or a touch made through syncMeeting (proceed assigns m.state directly).
//  R18 「closureVote.window:'meeting' 却读不出是哪一场会」           → the window states the scope the predicate has
//       (the SESSION), and a caller that knows the meeting gets the meeting window + the id.
//  R19 「overview 的同一行 state:'waiting' 与 status:'open' 并列」     → the marker's lifecycle is not reported under
//       a name that reads as the meeting's status.
//  R20 「sweep.at/swept 是 beat 的，recentTransitions.passAt 是触碰的」→ the reading says which clock each stamp came
//       from and reports the last transition's own instant beside the beat pass's.
//
// WHAT THIS DOES NOT PROVE: it does not run the host loop, so it cannot prove these fields reach a caller through the
// TOOL face (the live run does that); R19 is a SOURCE-level gate because the contradiction was in the READ FACE's row
// shape, which needs a full boot to observe — the live run judges the reading, this gate stops the shape coming back.

import { readFileSync } from 'node:fs'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { closureVoteOf } from '../vibe-math-vmu/kernel/turn/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

const ROOT = new URL('../', import.meta.url)
const src = (rel) => readFileSync(new URL(rel, ROOT), 'utf8')

// ── R17 + R20: one waiting meeting, proceeded by the chair ───────────────────────────────────────────────────────
{
  let NOW = 1000
  const svc = createMeetings({ clock: () => NOW, settings: { get: () => undefined } })
  svc.open({ id: 'm1', roster: ['r-1', 'r-2'], chair: 'r-1', materials: 'run16', at: NOW + 1000 })
  NOW = NOW + 2000
  const pass = svc.sweepDue({ at: NOW })
  ok(pass && pass.transitions.some((t) => t.meeting === 'm1' && t.to === 'waiting'),
    'setup: the scheduled meeting settles to WAITING through a PASS (the recorded path)', pass && JSON.stringify(pass.transitions).slice(0, 140))

  const before = svc.status()
  const beforeRows = before.sweep && Array.isArray(before.sweep.recentTransitions) ? before.sweep.recentTransitions : []
  ok(beforeRows.some((r) => r.meeting === 'm1' && r.from === 'scheduled' && r.to === 'waiting'),
    'R17 setup: the pass-driven transition IS in the bounded history (so the assertion below cannot pass on an empty list)', beforeRows.length)
  ok(!beforeRows.some((r) => r.meeting === 'm1' && r.from === 'waiting' && r.to === 'open'),
    'R17 negative control: the waiting→open transition is NOT there before anything starts the meeting', JSON.stringify(beforeRows.filter((r) => r.meeting === 'm1')))

  NOW = NOW + 500
  const proceeded = svc.proceed({ meeting: 'm1', actor: 'r-1', why: 'run16: the chair starts it' })
  ok(proceeded && proceeded.ok === true && proceeded.state === 'open', 'R17 setup: proceed() moves the meeting to open', proceeded && proceeded.state)

  const after = svc.status()
  const rows = after.sweep && Array.isArray(after.sweep.recentTransitions) ? after.sweep.recentTransitions : []
  const waitToOpen = rows.filter((r) => r.meeting === 'm1' && r.from === 'waiting' && r.to === 'open')
  ok(waitToOpen.length === 1,
    '★★ R17: a proceed()-driven waiting→open is IN the bounded history (run 16 measured it missing, while the attend path was recorded)',
    JSON.stringify(rows.filter((r) => r.meeting === 'm1')))
  ok(waitToOpen.length === 1 && waitToOpen[0].passAt === NOW,
    'R17: and it carries the instant the move happened, not the beat pass instant', waitToOpen[0] && waitToOpen[0].passAt)

  ok(after.sweep && after.sweep.lastTransitionPassAt === NOW,
    '★★ R20: the reading exposes the LAST TRANSITION instant beside the beat sweep instant, so the two clocks cannot be confused',
    after.sweep && { lastTransitionPassAt: after.sweep.lastTransitionPassAt, at: after.sweep.at, last: rows.length && rows[rows.length - 1].passAt })
  ok(after.sweep && /BEAT sweep/.test(String(after.sweep.recentTransitionsNote)) && /touch path/.test(String(after.sweep.recentTransitionsNote)),
    '★★ R20: and the note names BOTH clocks (a row\'s passAt is its own instant; at/swept describe the last beat pass)',
    after.sweep && String(after.sweep.recentTransitionsNote).slice(0, 160))
}

// ── R18: the closure window states the scope it really has ───────────────────────────────────────────────────────
{
  const votes = new Map([['r-1', true], ['r-2', true]])
  const session = closureVoteOf({ votes, roster: ['r-1', 'r-2'] })
  ok(session.window === 'session' && session.meetingId === null && /cannot name a meeting/.test(String(session.windowMeans)),
    '★★ R18: without a meeting the window is the SESSION and says it cannot name a meeting (run 16 could not tell which of four meetings it meant)', { window: session.window, meetingId: session.meetingId })
  ok(session.cast === true && session.votesCast === 2,
    'R18: the predicate itself is unchanged — the correction is the label, not the reading', { cast: session.cast, votesCast: session.votesCast })
  const named = closureVoteOf({ votes, roster: ['r-1', 'r-2'], meetingId: 'm-9' })
  ok(named.window === 'meeting' && named.meetingId === 'm-9',
    'R18: a caller that knows the meeting gets the meeting window AND the id (the field is not removed, it is sourced)', { window: named.window, meetingId: named.meetingId })
}

// ── R19: the marker lifecycle is not reported as the meeting's status ────────────────────────────────────────────
{
  const marker = src('vibe-math-vmu/kernel/meetingmarker.js')
  ok(/markerState: String\(r\.state\)/.test(marker) && !/status: String\(r\.state\)/.test(marker) && !/faceState: String\(r\.state\)/.test(marker),
    '★★ R19: the marker face names its raw lifecycle `markerState` and no longer publishes it as `status`/`faceState` (the pair that made state:\'waiting\' and status:\'open\' coexist)')
  const overview = src('vibe-math-vmu/packs/v5r/tools.js')
  ok(/markerState: m\.markerState === undefined \? null : m\.markerState/.test(overview) && /markerStateNote:/.test(overview),
    '★★ R19: the overview row reports the marker value under `markerState` WITH a note saying it is not the meeting\'s state')
  ok(!/faceState: m\.faceState === undefined/.test(overview),
    'R19: and it no longer emits the neutral name that a reader took for the meeting\'s status')
}

console.log('')
console.log('=== VMU RUN16 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('FAILED: ' + failures.join(' | ')); process.exit(1) }
