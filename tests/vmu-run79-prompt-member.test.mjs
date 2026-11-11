#!/usr/bin/env node
// ★★★ TB-2739 (C) / RUN 79 (B4) — `member` ON `op:"prompt"` IS A SELECTOR, NOT DECORATION.
//
// MEASURED on the 79th live run: the office called `{op:"prompt", member:"r-temp", limit:9000}` and received the prompt
// of `t-13`, a turn that belonged to a DIFFERENT seat, while the receipt filled `actedForMember:"r-temp"` as though the
// page had been the temp's. Two failures in one answer: the page was a neighbour's, and the receipt said it was not.
//
// The product fix has three legs, each pinned below:
//   1. a named seat selects its OWN most recent retained prompt (never "the latest prompt in the process");
//   2. naming BOTH a turn and a seat that disagree is a NAMED refusal (a page cannot be two seats at once), and the hint
//      names the two routes that do exist;
//   3. the receipt carries `promptFor:{member,turnId,turnMember}` so a reader can check the page against the seat instead
//      of trusting an echoed name — and `promptFor:null` says "you named no seat", not "the seat you named was ignored".
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

const root = mkdtempSync(join(tmpdir(), 'vmu-run79-prompt-member-'))
const h = await boot({ root, clock: () => 1_800_000_000_000, settings: { 'vmu.turn.deliverMode': 'caller' } })

const start = await h.call('vibe_v5_start', { researcherCount: 2 })
ok(start && start.ok === true, '§0 the institute starts (chair + two researchers)', start && start.code)

// Two DIFFERENT seats must hold two DIFFERENT retained prompts before "select by seat" can mean anything. A caller-played
// dispatch parks ONE turn at a time by design (a second step is `VMU_TURN_ALREADY_PARKED`), so the first turn is closed by
// name before the second seat is dispatched — the archive keeps the prompt either way, which is what this op pages.
const stepA = await h.call('vibe_vmu_turn', { op: 'step', member: 'r-1' })
const turnA = stepA && stepA.memberPrompt && stepA.memberPrompt.turnId
const closedA = turnA ? await h.call('vibe_vmu_turn', { op: 'abandon', turn: turnA, why: 'suite: free the single parked slot' }) : null
const stepB = await h.call('vibe_vmu_turn', { op: 'step', member: 'r-acad' })
ok(stepA && stepA.ok === true && stepB && stepB.ok === true,
  '§1 two caller-played steps park prompts for two seats', { a: stepA && (stepA.code || 'ok'), b: stepB && (stepB.code || 'ok'), closed: closedA && closedA.ok })
const turnB = stepB && stepB.memberPrompt && stepB.memberPrompt.turnId
ok(typeof turnA === 'string' && typeof turnB === 'string' && turnA !== turnB,
  '§1a and the two prompts belong to two different turns', { turnA, turnB })
ok(closedA && closedA.ok === true, '§1b the first turn was closed by name (the parked slot is single by design)', closedA && closedA.code)

// Page EVERY chunk: the composed status block is appended at the END of the assembled prompt, so page one can be the
// pack's prose alone — the exact partial-read trap that produced RUN 79's V3 finding. A seat assertion over a partial
// read would be as wrong as the report it is checking.
const pageFull = async (args) => {
  let full = ''
  let cursor = 0
  let pages = 0
  let first = null
  for (;;) {
    const chunk = await h.call('vibe_vmu_turn', { op: 'prompt', ...args, offset: cursor, limit: 9000 })
    if (!chunk || chunk.ok !== true) return { chunk, full, pages }
    if (first === null) first = chunk
    const piece = String(chunk.text || '')
    full += piece
    pages += 1
    if (chunk.done === true || piece === '' || pages > 20) break
    cursor = Number(chunk.end) || cursor + piece.length
  }
  return { chunk: first, full, pages }
}

// ── §2 A NAMED SEAT SELECTS ITS OWN PROMPT (the 79th run's bug answered with "the latest") ────────────────────────
const bySeatA = await h.call('vibe_vmu_turn', { op: 'prompt', member: 'r-1', limit: 9000 })
ok(bySeatA && bySeatA.ok === true, '§2 op:"prompt" accepts `member`', bySeatA && bySeatA.code)
ok(bySeatA && bySeatA.turn === turnA,
  '★★★ §2a and the page is r-1\'s OWN turn, not the most recent turn in the process', { got: bySeatA && bySeatA.turn, want: turnA, other: turnB })
ok(bySeatA && bySeatA.promptFor && bySeatA.promptFor.member === 'r-1',
  '★★ §2b the receipt says which seat asked (`promptFor.member`)', bySeatA && bySeatA.promptFor)
ok(bySeatA && bySeatA.promptFor && bySeatA.promptFor.turnId === turnA && bySeatA.promptFor.turnMember === 'r-1',
  '★★★ §2c and which seat the ARCHIVE says assembled this text — the reader can compare the two instead of trusting the echo',
  bySeatA && bySeatA.promptFor)
ok(bySeatA && bySeatA.promptFor && typeof bySeatA.promptFor.means === 'string' && /neighbour/.test(bySeatA.promptFor.means),
  '§2d the means say the page cannot answer with a neighbour\'s biography', bySeatA && bySeatA.promptFor && bySeatA.promptFor.means)

// The page really is that seat's: the composed status line names the seat it was assembled for. Read the WHOLE archived
// string (the block sits near the end — a first-page read would answer the same "absent" the 79th run answered).
const statusLineOf = (text) => String(text || '').split('\n').find((line) => line.startsWith('[状态] 你是')) || ''
const fullA = await pageFull({ member: 'r-1' })
const lineA = statusLineOf(fullA.full)
ok(fullA.full.length > 0 && lineA.includes('r-1'),
  '★★★ §2e the whole page\'s status line names r-1 (`[状态] 你是 …`) — the selection is visible in the text, not only in a field',
  { line: lineA, chars: fullA.full.length, pages: fullA.pages })

const bySeatB = await h.call('vibe_vmu_turn', { op: 'prompt', member: 'r-acad', limit: 9000 })
ok(bySeatB && bySeatB.ok === true && bySeatB.turn === turnB,
  '★★ §2f the other seat gets ITS turn (selection is per seat, not "whoever is newest")', { got: bySeatB && bySeatB.turn, want: turnB })
const fullB = await pageFull({ member: 'r-acad' })
const lineB = statusLineOf(fullB.full)
ok(lineB.includes('r-acad'), '★★ §2g and its status line names r-acad', { line: lineB })
ok(fullA.full !== fullB.full && lineA !== lineB,
  '★★ §2h the two seats were handed two DIFFERENT prompts (a selector that returns one text for every seat is decoration)',
  { a: fullA.full.length, b: fullB.full.length, lineA, lineB })

// ── §3 TURN + SEAT THAT DISAGREE IS A NAMED REFUSAL WITH A ROUTE OUT ──────────────────────────────────────────────
const crossed = await h.call('vibe_vmu_turn', { op: 'prompt', turn: turnA, member: 'r-acad' })
ok(crossed && crossed.ok === false && crossed.code === 'VMU_INVALID_ARGUMENT',
  '★★★ §3 asking for r-1\'s turn AS r-acad is refused by name, not answered with one of the two', crossed && (crossed.code || crossed.ok))
const crossedHint = String((crossed && (crossed.hint || crossed.message)) || '')
ok(/REACHABLE INSTEAD/.test(crossedHint) && /drop `member`/.test(crossedHint) && /drop `turn`/.test(crossedHint),
  '★★ §3a and the hint names the two pages the caller could actually have asked for', { hint: crossedHint })
ok(!(crossed && crossed.ok === true), '★ §3b the refusal carries no text at all (a clipped page would be the worst answer)', crossed && Object.keys(crossed || {}))

// ── §4 A SEAT WITH NOTHING RETAINED IS REFUSED AND THE REFUSAL NAMES WHO IS RETAINED ──────────────────────────────
const ghost = await h.call('vibe_vmu_turn', { op: 'prompt', member: 'r-nobody' })
ok(ghost && ghost.ok === false && ghost.code === 'VMU_NO_SUCH_OBJECT',
  '★★ §4 a seat with no retained prompt is refused by name', ghost && (ghost.code || ghost.ok))
const ghostHint = String((ghost && (ghost.hint || ghost.message)) || '')
ok(/retained seats:/.test(ghostHint) && /r-1/.test(ghostHint),
  '★★ §4a and the refusal names the seats that ARE retained, so the caller does not have to guess', { hint: ghostHint })

// ── §5 NO `member` MEANS "THE LATEST PAGE", AND THE RECEIPT SAYS SO INSTEAD OF INVENTING ONE ──────────────────────
const latest = await h.call('vibe_vmu_turn', { op: 'prompt', limit: 9000 })
ok(latest && latest.ok === true && latest.promptFor === null,
  '★★ §5 without a seat the page is the latest prompt and `promptFor` is null (no echoed name that was never honoured)', latest && latest.promptFor)
const byTurn = await h.call('vibe_vmu_turn', { op: 'prompt', turn: turnA, limit: 9000 })
ok(byTurn && byTurn.ok === true && byTurn.turn === turnA && byTurn.promptFor === null,
  '★ §5a addressing by turn alone still works and stays silent about seats', { turn: byTurn && byTurn.turn, promptFor: byTurn && byTurn.promptFor })

// ── §6 SOURCE GUARDS: the three legs are in the product, not only in this suite's expectations ────────────────────
import { readFileSync } from 'node:fs'
const src = readFileSync(join(REPO, 'vibe-math-vmu', 'tools', 'turn.js'), 'utf8')
ok(/wantMember/.test(src) && /IS A SELECTOR, NOT DECORATION/.test(src),
  '§6 the face records that a seat is a selector (the 79th run\'s failure mode is written down where it is fixed)')
ok(/promptFor\s*\}/.test(src), '§6a the receipt spreads `promptFor` into the page')
ok(/REACHABLE INSTEAD: drop `member`/.test(src), '§6b the disagreement refusal carries its two routes in source')

console.log('')
console.log(passed + ' passed / ' + failures.length + ' failed')
if (failures.length > 0) {
  for (const f of failures) console.log('FAILED: ' + f)
  process.exit(1)
}
