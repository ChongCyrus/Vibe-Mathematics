#!/usr/bin/env node
// vmu RUN 48 / §150.7 item 4 — TWO DIFFERENT NUMBERS WERE CALLED `turns`.
//
// THE OBSERVED PAIR (live run 48, raw log `_oneoff/vm-slv/full-1027-094115.jsonl`):
//   * `vibe_vmu_meeting {action:"close"}` on `m-r48-debate` returned `turns: 0`
//     (tool/result seq 197, at 1793066317565; `receipt.turns: 0`, closedBy "r-acad", wallMs 340828).
//   * the durable `state.json` row for the SAME meeting carried `turns: 1`, because member r-2's kernel
//     instance had recorded one speech (`speak` receipt, tool/result seq 219, at 1793066191580: `turns: 1`)
//     and written its own row through the state store.
//   * a THIRD fact also called `turns` lives in the same file: `state.json.keys.turns` is the durable
//     member-turn LEDGER (an array of `{member, turn, phase, round, at}`), and `vibe_vmu_turn {op:"status"}`
//     reports `turns` = the turn orchestrator's map size (`vibe-math-vmu/kernel/turn/index.js:2617`).
//     Neither of those is a speech count.
//
// WHAT THE NUMBER ACTUALLY IS: `m.turns`, a counter of SPEECHES held by ONE kernel instance's meeting
// object, incremented in exactly one place inside `speak()` in `vibe-math-vmu/kernel/meetings.js` (pinned by
// the one-occurrence check in part D, so this comment cannot rot with a line number) and read back by
// `speak` and by `close`. So run 48's
// disagreement is NOT two counters disagreeing: it is the SAME field read off two different kernel
// instances. The closing (office) instance had not seen r-2's speech, so its close receipt printed its own
// stale 0 while the durable row — last written by the member instance — said 1.
//
// WHAT THIS SUITE PINS:
//   (A) one instance: speak receipts climb 1 then 2, the close receipt equals the archived row (one field);
//   (B) run-48 reproduction across two kernel instances: a stale instance closes with `turns: 0` while the
//       instance that did the writing holds a row with `turns: 1` — the divergence is a SNAPSHOT fact;
//   (C) the fix that makes the two facts un-confusable: every face that prints `turns` also prints
//       `turnsCounts: "speeches"` (machine-readable name) and `turnsMeans` (prose that names SPEECHES and
//       refuses the member-turn / ledger reading) — on `close`, on `speak`, and on the status view;
//   (D) source pins: exactly one increment site, and the durable turn ledger is not the speech counter.
import { readFileSync } from 'node:fs'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + String(detail) + ']')) }
}

let NOW = 1000
const mk = (settings = {}) => createMeetings({ clock: () => NOW, settings: Object.assign({ 'vmu.meetings.quorumCap': 0 }, settings) })
const decode = (s) => JSON.parse(String(s || '[]'), (k, v) => {
  if (v && typeof v === 'object') {
    if (Array.isArray(v.__map)) return new Map(v.__map)
    if (Array.isArray(v.__set)) return new Set(v.__set)
  }
  return v
})
const archiveOf = (snap) => decode(snap.data.archive)
// The prose must NAME the counter and refuse the homonyms, without being brittle about exact English.
const MEANS_OK = (s) => typeof s === 'string' && /speech/i.test(s) && /not/i.test(s) && /turn/i.test(s)
const COUNTS_OK = (s) => s === 'speeches'

// ---- (A) ONE INSTANCE: one field, two readings that agree ------------------------------------------
{
  NOW = 1000
  const A = mk()
  const o = A.open({ type: 'ordinary', chair: 'r-acad', roster: ['r-acad', 'r-2'], at: NOW })
  NOW += 1000
  A.attend({ meeting: o.meeting, member: 'r-acad', at: NOW })
  A.attend({ meeting: o.meeting, member: 'r-2', at: NOW })
  const s1 = A.speak({ meeting: o.meeting, member: 'r-acad', ms: 0, text: 'a', at: NOW })
  ok(s1.turns === 1 && s1.receipt.turns === 1, '(A) first speech receipt says turns:1 (per-speech counter)', JSON.stringify(s1.turns))
  NOW += 1000
  const s2 = A.speak({ meeting: o.meeting, member: 'r-2', ms: 0, text: 'b', at: NOW })
  ok(s2.turns === 2 && s2.receipt.turns === 2, '(A) second speech receipt says turns:2 (it counts speeches, not members)', JSON.stringify(s2.turns))
  // Fix surface: each receipt and the status view must SAY what the number counts.
  ok(COUNTS_OK(s2.turnsCounts), '(A)[fix] speak receipt carries turnsCounts:"speeches"', String(s2.turnsCounts))
  ok(MEANS_OK(s2.turnsMeans), '(A)[fix] speak receipt carries turnsMeans naming speeches + refusing member turns', String(s2.turnsMeans))
  const view = A.meetingView({ meeting: o.meeting })
  ok(view.turns === 2, '(A)[fix] status view exposes turns as the same counter (2 speeches)', JSON.stringify(view.turns))
  ok(COUNTS_OK(view.turnsCounts), '(A)[fix] status view carries turnsCounts:"speeches"', String(view.turnsCounts))
  ok(MEANS_OK(view.turnsMeans), '(A)[fix] status view carries turnsMeans', String(view.turnsMeans))
  NOW += 1000
  const c = A.close({ meeting: o.meeting, at: NOW, actor: 'r-acad' })
  ok(c.turns === 2 && c.receipt.turns === 2, '(A) close receipt reads the same m.turns (2), not a re-count', JSON.stringify(c.turns))
  ok(COUNTS_OK(c.turnsCounts), '(A)[fix] close top-level return carries turnsCounts:"speeches"', String(c.turnsCounts))
  ok(MEANS_OK(c.turnsMeans), '(A)[fix] close top-level return carries turnsMeans', String(c.turnsMeans))
  ok(COUNTS_OK(c.receipt.turnsCounts), '(A)[fix] close receipt carries turnsCounts:"speeches"', String(c.receipt.turnsCounts))
  ok(MEANS_OK(c.receipt.turnsMeans), '(A)[fix] close receipt carries turnsMeans', String(c.receipt.turnsMeans))
  const row = archiveOf(A.snapshot())[0]
  ok(row && row.turns === c.receipt.turns, '(A) the durable archived row carries the SAME field (speeches)', JSON.stringify(row && row.turns))
}

// ---- (B) RUN-48 REPRODUCTION: two kernel instances, one field, two snapshots -------------------------
// r-2's kernel instance (A) recorded the speech; the office's instance (B) booted from the pre-speech fold
// and closed. This is exactly what run 48 measured: close receipt `turns:0`, durable row `turns:1`.
{
  NOW = 1000
  const A = mk()
  const o = A.open({ type: 'ordinary', chair: 'r-acad', roster: ['r-acad', 'r-2'], at: NOW })
  NOW += 1000
  A.attend({ meeting: o.meeting, member: 'r-acad', at: NOW })
  A.attend({ meeting: o.meeting, member: 'r-2', at: NOW })
  const snapBeforeSpeech = A.snapshot()          // the fold the office instance would hydrate
  const A2 = mk()
  A2.restore(snapBeforeSpeech)
  NOW += 1000
  const speech = A.speak({ meeting: o.meeting, member: 'r-2', ms: 0, text: 'r-2 的裁决', at: NOW })
  ok(speech.turns === 1, '(B) the member instance records ONE speech (turns:1)', JSON.stringify(speech.turns))
  NOW += 1000
  const closeB = A2.close({ meeting: o.meeting, at: NOW, actor: 'r-acad' })
  ok(closeB.turns === 0, '(B) RUN-48 PAIR half 1: the stale office instance closes with turns:0', JSON.stringify(closeB.turns))
  // The writing instance's durable row: run 48 read it from the LIVE map it had written through.
  const rowA = decode(A.snapshot().data.live).get(o.meeting)
  ok(rowA && rowA.turns === 1, '(B) RUN-48 PAIR half 2: the writing instance\'s row says turns:1', JSON.stringify(rowA && rowA.turns))
  ok(closeB.meeting === o.meeting && rowA.id === o.meeting, '(B) both numbers describe the SAME meeting object', String(closeB.meeting))
  // THE HONEST READING OF THE PAIR: one field, two snapshots. The receipts must now say that out loud,
  // so a reader cannot mistake 0 for "nobody ever spoke" or compare it to the turn ledger.
  ok(COUNTS_OK(closeB.turnsCounts) && COUNTS_OK(closeB.receipt.turnsCounts), '(B)[fix] the diverging close receipt is named (turnsCounts:"speeches")')
  ok(/instance|snapshot|copy/i.test(String(closeB.turnsMeans)), '(B)[fix] the means says WHICH copy the number was read off', String(closeB.turnsMeans))
  ok(closeB.turnsMeans === closeB.receipt.turnsMeans, '(B)[fix] top-level and nested receipt agree on the means')
  // And the other instance closing the same meeting reports the larger number — same field, same code path.
  const closeA = A.close({ meeting: o.meeting, at: NOW, actor: 'r-acad' })
  ok(closeA.turns === 1, '(B) the instance that saw the speech closes with turns:1', JSON.stringify(closeA.turns))
  ok(closeB.turns !== closeA.turns, '(B) the two close receipts of one meeting disagree ONLY because of instance state')
}

// ---- (C) THE HOMONYMS ARE NAMED, NOT RE-BRANDED ------------------------------------------------------
{
  NOW = 1000
  const A = mk()
  const o = A.open({ type: 'ordinary', chair: 'r-acad', roster: ['r-acad'], at: NOW })
  A.attend({ meeting: o.meeting, member: 'r-acad', at: NOW })
  NOW += 1000
  const c = A.close({ meeting: o.meeting, at: NOW, actor: 'r-acad' })
  // The numeric field and its name stay (a speak receipt `turns >= 1` assertion lives in
  // tests/vmu-meeting-invite.test.mjs:215 and must keep working); the ambiguity is resolved by ADDING.
  ok(typeof c.turns === 'number' && c.turns === 0, '(C) a meeting with no speeches still prints turns:0 (value + name preserved)')
  ok(typeof c.receipt.turns === 'number', '(C) the nested receipt keeps the numeric field name `turns`')
  ok(/state\.json|ledger|vibe_vmu_turn/i.test(String(c.turnsMeans)), '(C)[fix] turnsMeans names at least one of the homonyms it is NOT (state.json ledger / vibe_vmu_turn)', String(c.turnsMeans))
  const src = readFileSync(new URL('../vibe-math-vmu/kernel/meetings.js', import.meta.url), 'utf8')
  ok(/turnsMeans/.test(src) && /turnsCounts/.test(src), '(C)[fix] the means/name live in kernel/meetings.js, the source of every close/status/speak receipt')
  const turnSrc = readFileSync(new URL('../vibe-math-vmu/kernel/turn/index.js', import.meta.url), 'utf8')
  ok(/turns\.set\(turn\.id, turn\)/.test(turnSrc) && /turns: turns\.size/.test(turnSrc),
    '(C) the turn orchestrator\'s `turns` is a DIFFERENT counter (map of member turns) — still its own name')
  ok(!/turnsMeans/.test(turnSrc), '(C) the turn orchestrator is intentionally untouched (out of this write surface)')
}

// ---- (D) SOURCE PIN: ONE increment site, and it belongs to speak() -----------------------------------
{
  const src = readFileSync(new URL('../vibe-math-vmu/kernel/meetings.js', import.meta.url), 'utf8')
  // Count the CODE line only: the marker also appears inside prose (the constant's own comment/means string),
  // so a bare substring search would count documentation as an increment site.
  const hits = [...src.matchAll(/^[ 	]+m\.turns \+= 1[ 	]*$/gm)]
  ok(hits.length === 1, '(D) exactly ONE site increments the meeting speech counter', hits.length + ' sites')
  const at = hits[0].index
  const speakAt = src.indexOf('speak({ meeting, member')
  const closeAt = src.indexOf('close({ meeting, report = null')
  ok(speakAt > 0 && at > speakAt && (closeAt === -1 || at < closeAt),
    '(D) the increment site is inside speak(), before close() (speech counter, not a close-time recount)', at)
  // The counter must not be fed by the durable turn ledger: no ledger row shape is read in meetings.js.
  ok(!/phase:\s*['"]meeting['"]/.test(src), '(D) meetings.js does not synthesise turn-ledger rows (the ledger is the turn face\'s)')
}

const SRC = readFileSync(new URL('../vibe-math-vmu/kernel/meetings.js', import.meta.url), 'utf8')
ok(/turnsCounts/.test(SRC) && /turnsMeans/.test(SRC), '(fix) kernel/meetings.js carries the added names')

if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  ✗ ' + f)
}
console.log('=== VMU RUN48 CLOSE TURNS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
