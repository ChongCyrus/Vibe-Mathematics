#!/usr/bin/env node
// ★ TB-2739 (D) / RUN 79 — THE SMALL `detail:"closure"` RECEIPT MUST NOT ANSWER A SMALLER QUESTION THAN THE BOARD.
//
// RUN 79's V4 read `closureVote.notEligible` off the `board` slice and PASSED, while the taskbook asked whether the same row
// also reaches the `closure` slice (the one an office reaches for when it only wants the vote). Two slices built from one
// reading must agree — a reader who picks the narrow slice must not lose the row that says WHY a seat could not vote.
// This suite pins: same `notEligible` value on both slices, same means string, and the narrow receipt stays small enough
// for the host bound (a slice that carries everything is not a slice).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

const { boot } = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href)

let passed = 0
const failures = []
const ok = (cond, label, extra) => {
  if (cond) { passed += 1; console.log('ok ' + passed + ' - ' + label); return }
  failures.push(label)
  console.log('FAIL - ' + label + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)))
}

const root = mkdtempSync(join(tmpdir(), 'vmu-run79-closure-detail-'))
const h = await boot({ root, clock: () => 1_800_000_000_000, settings: { 'vmu.turn.deliverMode': 'caller' } })
const start = await h.call('vibe_v5_start', { researcherCount: 2 })
ok(start && start.ok === true, '§0 the institute starts', start && start.code)
const hired = await h.call('vibe_v5_hire', { slot: 'temp', to: 'r-temp', purpose: 'a seat that may speak but has no closure-vote permission', initial_task: 'read the ledger and report what is open' })
ok(hired && hired.ok === true, '§0a a temp seat joins (the seat with no closure-vote permission)', hired && hired.code)

const closure = await h.call('vibe_vmu_turn', { op: 'status', detail: 'closure' })
const board = await h.call('vibe_vmu_turn', { op: 'status', detail: 'board' })
ok(closure && closure.ok === true && closure.detail === 'closure', '§1 the narrow closure slice is served', closure && (closure.code || closure.detail))
ok(closure && closure.closureVote && typeof closure.closureVote === 'object', '§2 it carries `closureVote`', closure && Object.keys(closure || {}))

// ── §3 THE ROW ITSELF ──────────────────────────────────────────────────────────────────────────────────────────────
ok(closure && closure.closureVote && Object.prototype.hasOwnProperty.call(closure.closureVote, 'notEligible'),
  '★★★ §3 the closure slice carries `closureVote.notEligible` (RUN 79 V4 read it off the board; the narrow slice must not lose it)',
  closure && closure.closureVote && Object.keys(closure.closureVote))
ok(closure && typeof closure.closureVote.notEligibleMeans === 'string' && closure.closureVote.notEligibleMeans !== '',
  '★★ §3a with the means that explain what an empty row means (not "no reason exists")', closure && closure.closureVote && closure.closureVote.notEligibleMeans)
ok(Array.isArray(closure.closureVote.notEligible), '§3b the row is a LIST (a seat per row), not a count', closure && closure.closureVote.notEligible)

// ── §4 TWO SLICES, ONE READING ────────────────────────────────────────────────────────────────────────────────────
ok(board && board.ok === true && board.closureVote && Array.isArray(board.closureVote.notEligible),
  '§4 the board slice carries the same row', board && board.closureVote && board.closureVote.notEligible)
ok(JSON.stringify(closure.closureVote.notEligible) === JSON.stringify(board.closureVote.notEligible),
  '★★★ §4a the two slices report the SAME value (a slice may narrow the receipt, never fork the reading)',
  { closure: closure.closureVote.notEligible, board: board.closureVote.notEligible })
ok(String(closure.closureVote.notEligibleMeans) === String(board.closureVote.notEligibleMeans),
  '★★ §4b and the same means text, so two readers cannot explain one row two ways')

// ── §5 A SLICE THAT CARRIES EVERYTHING IS NOT A SLICE ────────────────────────────────────────────────────────────
const closureBytes = JSON.stringify(closure).length
const boardBytes = JSON.stringify(board).length
ok(closureBytes < boardBytes,
  '★ §5 the narrow slice is smaller than the board slice (it exists to fit a bound, not to restate the board)',
  { closureBytes, boardBytes })
ok(closure && !Object.prototype.hasOwnProperty.call(closure, 'turnReceipts'),
  '★ §5a and it does not smuggle the whole turn list in')

console.log('')
console.log(passed + ' passed / ' + failures.length + ' failed')
if (failures.length > 0) {
  for (const f of failures) console.log('FAILED: ' + f)
  process.exit(1)
}
