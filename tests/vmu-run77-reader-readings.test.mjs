// tests/vmu-run77-reader-readings.test.mjs — RUN 77 / TB-2724 (task-207): FOUR READER-SIDE READINGS.
//
// The 77th live run (build f84f6a31) left four defects, all of the same shape: a fact the office could produce had no
// readable form at the place a reader looks.
//
//   A (notices):  a turn with ZERO unsettled rows rendered NO `[新到的消息]` block at all and the receipt said
//                 `{lines:0, rendered:false, blockChars:0}` — so "checked, nothing waiting" and "the channel never ran"
//                 looked identical, even though the prompt teaches that an empty queue still renders a NAMED empty.
//                 Now it does, and the receipt names the three facts separately (`lines`, `rendered`, `blockChars`,
//                 plus `namedEmpty` for "this block is the empty sentence, not a queue").
//
//   B (live status): the `[蓝图]` group vanished from every assembly because `renderLiveStatus` skipped every null
//                 group. A null group that NAMES a why is a READING (no current blueprint rev 0, md not on disk), not
//                 noise. Now only the blueprint group speaks this round; paper/closure keep the RUN-258 silent skip.
//
//   C (notEligible): r-temp judged (`solvedThisRound` carried it) but `closureVote.notEligible` showed a bare id, while
//                 the Means sentence promised "recorded, neither counted nor listed as missing" — a promise the value
//                 did not carry. Each row is now `{member, solved, why}`; the board face keeps the name array and adds
//                 `notEligibleJudged` beside it.
//
//   D (status size): `vibe_vmu_turn{op:"status"}` measured 51 988 B and the host cut it at 12 000, so the board fields
//                 competed with the per-turn ledger for the budget. `detail:"board"` returns ONLY the four blocks a
//                 board renders — assembled in the same place, from the same reading, so the values are JSON-identical
//                 to the full status's same keys — and the invalid value is refused by name.
//
// §0 the four repairs are named shapes in the source
// §A empty queue ⇒ named empty block, and the receipt names it
// §B [蓝图] named absence, and unnamed absences stay silent
// §C notEligible carries the judgement (member + solved + why)
// §D detail:"board" is the same four blocks under a bounded receipt
//
// Run: node tests/vmu-run77-reader-readings.test.mjs   Last line: N passed, M failed

import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { liveStatusReadings, renderLiveStatus, createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { boundedToolResult, MAX_TOOL_RESULT_BYTES } from '../vibe-math-vmu/kernel/receiptbounds.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const section = (name) => console.log('\n' + name)
const J = (o) => JSON.stringify(o)
const HEADER = '[新到的消息]'
const NAMED_EMPTY = HEADER + ' （无未结算行）'
/** originalBytes the HOST would report, measured on a copy so the guard does not mutate the value under test. */
const boundedBytes = (value) => {
  const copy = JSON.parse(JSON.stringify(value))
  const bounded = JSON.parse(boundedToolResult(copy))
  return bounded && bounded.receiptMeta ? bounded.receiptMeta.originalBytes : null
}

const entry = await import(pathToFileURL(ENTRY).href)
const turnSource = readFileSync(TURN, 'utf8')
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r77-rr-')); roots.push(d); return d }
const boot = async () => {
  const root = await mkRoot()
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  await handle.kernel.store.open()
  const specOf = (name) => specs.filter((s) => s && s.name === name)[0] || null
  const callJson = async (name, args) => {
    const spec = specOf(name)
    if (!spec) throw new Error('no such face ' + name)
    const raw = await spec.execute(args, { kernel: handle.kernel })
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  }
  return { root, handle, K: handle.kernel, specOf, callJson }
}
const assemblyText = async (k, member) => {
  const opened = await k.turn.open({ member, role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 1 })
  const asm = await k.turn.assemble(opened.turn)
  return { text: String(asm.text || ''), notices: asm.notices || null }
}
const fakePrompt = { assemble: async () => ({ ok: true, text: '', sources: [], instructionDelivered: false }) }
const orchFor = (K) => createTurnOrchestrator({ prompt: fakePrompt, deliver: async () => '', faces: K.faces, settings: {}, clock: () => 1000 })

try {
  // ── §0 NAMED SHAPES ───────────────────────────────────────────────────────────────────────────────────────
  section('§0 the four repairs are named shapes in the source')
  ok(turnSource.includes('namedEmpty'), '§0a the assembly receipt names the empty-sentence case (`namedEmpty`)')
  ok(turnSource.includes('INBOX_HEADER') && turnSource.includes('（无未结算行）'),
    '§0b the empty queue renders the SAME header the queue renders, plus the named-empty sentence')
  ok(turnSource.includes("'no-current-blueprint'") && turnSource.includes('无现行版'),
    '§0c the blueprint null group has its own named reading (`无现行版`)')
  ok(turnSource.includes('no-closure-vote-permission') && turnSource.includes('solvedThisRound'),
    '§0d notEligible rows are built from the vote AND the judgement (`solvedThisRound`)')
  ok(turnSource.includes('detail') && turnSource.includes('known detail values: board'),
    '§0e the kernel refuses an unknown status detail and lists the legal one')

  // ── §A EMPTY QUEUE ⇒ NAMED EMPTY ─────────────────────────────────────────────────────────────────────────
  section('§A a member with zero unsettled rows still gets the named empty block')
  {
    const b = await boot()
    const empty = await assemblyText(b.K, 'm-1')
    // ★ Scoped to the START of the prompt on purpose: the v5r prompt TEACHES this sentence
    // (`vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js:1042`), so a bare `includes` would pass on the teaching text
    // alone. The assembly prepends the notice block, so the claim "the BLOCK rendered the empty sentence" is
    // `text.startsWith(...)`.
    ok(empty.text.startsWith(NAMED_EMPTY), '§0a1 the prompt STARTS with the named empty sentence (the block, not the teaching text)', empty.text.slice(0, 120))
    ok(empty.notices && empty.notices.lines === 0 && empty.notices.rendered === true && empty.notices.blockChars > 0,
      '§0a2 the receipt says lines=0 AND rendered=true AND blockChars>0 - the three facts are separate', empty.notices)
    ok(empty.notices && empty.notices.namedEmpty === true, '§0a3 and the receipt says this block is the empty sentence', empty.notices)
    ok(empty.text.includes('[新到的消息/通知]') === false || true, '§0a4 (record only: legacy header spelling is not asserted)')

    await b.K.mailbox.send('office', { to: 'm-2', kind: 'meeting-appointment', channel: 'mail', subject: '会议预约：探针会', text: '会议探针会已预约。' })
    const busy = await assemblyText(b.K, 'm-2')
    ok(busy.text.startsWith(HEADER) && busy.text.startsWith(NAMED_EMPTY) === false,
      '§0a5 with a real unread row the block starts with the header and NOT with the named-empty sentence', busy.notices)
    ok(busy.text.split('\n')[1] && busy.text.split('\n')[1].includes('会议预约：探针会'),
      '§0a6 the row itself is line 2 of the block (the header was not rendered instead of the row)')
    ok(busy.notices && busy.notices.lines >= 1 && busy.notices.rendered === true && busy.notices.namedEmpty === false,
      '§0a7 and the receipt distinguishes a real queue from the empty sentence', busy.notices)
  }

  // ── §B [蓝图] NAMED ABSENCE ───────────────────────────────────────────────────────────────────────────────
  section('§B the blueprint group states its named absence; unnamed absences stay silent')
  {
    const b = await boot()
    const liveEmpty = liveStatusReadings({ records: b.K.records })
    ok(liveEmpty.blueprint && liveEmpty.blueprint.value === null && liveEmpty.blueprint.why === 'no-current-blueprint',
      '§0b1 an empty world names the blueprint why (`no-current-blueprint`)', liveEmpty.blueprint)
    ok(renderLiveStatus(liveEmpty) === '[蓝图] 无现行版（rev 0，md 未落盘）',
      '§0b2 and that why renders as ONE named line, not silence', renderLiveStatus(liveEmpty))
    const orch = orchFor(b.K)
    const opened = orch.open({ member: 'r-acad', phase: 'normal', role: 'academician', roleLabel: '院士', rosterIds: ['r-acad', 'r-1'], round: 1 })
    const asm = await orch.assemble(opened.turn)
    ok(asm.text.includes('[蓝图]') && asm.text.includes('无现行版'),
      '§0b3 the assembled prompt carries the same line (the reading reached the reader)', { chars: asm.text.length })
    ok(asm.text.includes('[论文]') === false && asm.text.includes('[结题]') === false,
      '§0b4 while the unnamed paper/closure groups stay silent (scope decision: only [蓝图] speaks this round)')

    const liveOther = Object.assign({}, liveEmpty, {
      blueprint: Object.assign({}, liveEmpty.blueprint, { why: 'md-parser-unavailable' }),
    })
    ok(renderLiveStatus(liveOther) === '[蓝图] 读数不可得：md-parser-unavailable',
      '§0b5 any OTHER why is reported by name as unavailable, not guessed at', renderLiveStatus(liveOther))

    const liveWhyLess = Object.assign({}, liveEmpty, {
      blueprint: Object.assign({}, liveEmpty.blueprint, { why: '' }),
    })
    ok(renderLiveStatus(liveWhyLess) === '',
      '§0b6 a null group with NO why stays silent - the zero mechanism is preserved where nothing is named', renderLiveStatus(liveWhyLess))
  }

  // ── §C notEligible CARRIES THE JUDGEMENT ──────────────────────────────────────────────────────────────────
  section('§C a judgement from outside the electorate is recorded WITH its value')
  {
    const b = await boot()
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-temp', 'temp']]) {
      const hired = await b.K.members.hire({ id, slot, institution: 'sim' })
      ok(hired && hired.ok !== false, '§0c0 seat ' + id + ' hired as ' + slot)
    }
    const applied = await b.K.turn.apply({ vote_solved: true, solved: true }, null, 'r-temp')
    ok(applied && applied.ok === true, '§0c1 the temp seat CAN record a judgement without a permission gate (the gate is on the tool)')
    const view = b.K.closureVoteView()
    ok(Array.isArray(view.notEligible) && view.notEligible.length === 1 && view.notEligible[0].member === 'r-temp'
      && view.notEligible[0].solved === true && view.notEligible[0].why === 'no-closure-vote-permission',
      '§0c2 notEligible names member + the judgement (true) + why it does not count', view.notEligible)
    ok(view.votesCast === 0 && Array.isArray(view.missing) && view.missing.length > 0,
      '§0c3 the temp judgement is still NOT counted and NOT treated as a cast vote', { votesCast: view.votesCast, missing: view.missing })

    const st = b.K.turn.status({ roster: ['r-acad', 'r-1', 'r-temp'], may: (id) => id !== 'r-temp' })
    ok(st.closureVote && Array.isArray(st.closureVote.notEligible)
      && st.closureVote.notEligible.some((e) => e && e.member === 'r-temp' && e.solved === true),
      '§0c4 the kernel status reading carries the same judged row', st.closureVote && st.closureVote.notEligible)

    const board = b.K.turn.status({ roster: ['r-acad', 'r-1', 'r-temp'], may: (id) => id !== 'r-temp', detail: 'board' })
    ok(board && board.ok === true && board.detail === 'board', '§0c5 the board slice is readable from the kernel status')

    // A seat that merely JUDGED (solved, no vote_solved) appears the same way — the row carries solved:false.
    //
    // ★ THIS COMMENT USED TO REPORT A PRODUCT GAP; THE GAP IS NOW CLOSED (TB-2724 follow-up, Lead).
    // It read: the TOOL face replaces `closureVote` with `kernel.closureVoteView()`, whose `closureVoteInput()` passed
    // only the durable closure-vote rows, so a judgement written ONLY through `solved` had no durable vote row and was
    // missing from the tool face's notEligible. The 77th run recorded exactly that shape
    // (`solvedThisRound {"r-temp": false}`) and the receipt was narrower than its own Means sentence. `closureVoteInput()`
    // now reads the same session map the turn-level reading reads, so BOTH faces list the judged seat — asserted below
    // on both, because "the office can produce it" is not the same fact as "a reader can read it".
    const c = await boot()
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-temp', 'temp']]) await c.K.members.hire({ id, slot, institution: 'sim' })
    await c.K.turn.apply({ solved: false }, null, 'r-temp')
    const cTurn = c.K.turn.status({ roster: ['r-acad', 'r-1', 'r-temp'], may: (id) => id !== 'r-temp' })
    ok(Array.isArray(cTurn.closureVote.notEligible) && cTurn.closureVote.notEligible.length === 1
      && cTurn.closureVote.notEligible[0].member === 'r-temp' && cTurn.closureVote.notEligible[0].solved === false,
      '§0c6 a judgement that is NOT a vote still reaches the turn reading notEligible with solved:false', cTurn.closureVote.notEligible)
    const cTool = await c.callJson('vibe_vmu_turn', { op: 'status', detail: 'board' })
    ok(cTool && cTool.closureVote && Array.isArray(cTool.closureVote.notEligible)
      && cTool.closureVote.notEligible.some((e) => e && e.member === 'r-temp' && e.solved === false && e.why === 'no-closure-vote-permission'),
      '§0c6b and the TOOL face carries the same judged row (the receipt is no longer narrower than its Means sentence)',
      cTool && cTool.closureVote && cTool.closureVote.notEligible)
    await c.K.turn.apply({ vote_solved: true }, null, 'r-1')
    const cTurn2 = c.K.turn.status({ roster: ['r-acad', 'r-1', 'r-temp'], may: (id) => id !== 'r-temp' })
    ok(cTurn2.closureVote.notEligible.length === 1 && cTurn2.closureVote.notEligible[0].member === 'r-temp'
      && cTurn2.closureVote.votesCast === 1,
      '§0c7 an ENFRANCHISED seat that votes is counted, never listed as not eligible',
      { notEligible: cTurn2.closureVote.notEligible, votesCast: cTurn2.closureVote.votesCast })
  }

  // ── §D detail:"board" ────────────────────────────────────────────────────────────────────────────────────
  section('§D detail:"board" returns the same four blocks under a smaller receipt')
  {
    const b = await boot()
    const full = await b.callJson('vibe_vmu_turn', { op: 'status' })
    const board = await b.callJson('vibe_vmu_turn', { op: 'status', detail: 'board' })
    ok(full && full.ok !== false && board && board.ok === true, '§0d1 both readings succeed')
    ok(board.detail === 'board' && typeof board.detailMeans === 'string' && board.detailMeans.trim() !== '',
      '§0d2 the board receipt says which slice it is, in words', board.detailMeans)
    const keys = ['turnLoop', 'memberWorkShare', 'closureVote', 'liveReadings']
    ok(keys.every((k) => Object.prototype.hasOwnProperty.call(board, k)),
      '§0d3 all four board blocks are present on the slice (a fresh world may read liveReadings:null, but the KEY is there)',
      keys.filter((k) => !Object.prototype.hasOwnProperty.call(board, k)))
    // The full tool receipt keeps the kernel reading under `status` (the round-240 projection does not flatten it).
    ok(keys.every((k) => J(board[k]) === J(full.status[k])),
      '§0d4 and each is JSON-identical to the SAME key of the full reading (one computation, two slices)',
      { differ: keys.filter((k) => J(board[k]) !== J(full.status[k])) })
    ok(full.status.turnReceipts !== undefined && board.turnReceipts === undefined && board.memberSessions === undefined,
      '§0d5 the ledger fields the board does not render are NOT in the board slice')
    const fullBytes = Number(full.receiptMeta && full.receiptMeta.originalBytes)
    const boardBytes = Number(board.receiptMeta && board.receiptMeta.originalBytes)
    ok(Number.isFinite(fullBytes) && fullBytes > 0 && Number.isFinite(boardBytes) && boardBytes > 0,
      '§0d6 both receipts report their own originalBytes (the number the host bounds)', { fullBytes, boardBytes })
    ok(boardBytes < MAX_TOOL_RESULT_BYTES,
      '§0d7 the board slice fits under the host bound on its own (12 000 B)', { boardBytes })
    ok(boardBytes * 2 < fullBytes,
      '§0d8 and it is less than half the full status (the measured defect was a 51 988 B receipt)', { fullBytes, boardBytes })
  }

  section('§D the invalid detail is refused by name')
  {
    const b = await boot()
    const refused = await b.callJson('vibe_vmu_turn', { op: 'status', detail: 'nope' })
    ok(refused && refused.ok === false && refused.code === 'VMU_INVALID_ARGUMENT',
      '§0d9 an unknown detail is refused as VMU_INVALID_ARGUMENT', refused && { code: refused.code })
    const hint = String(refused && (refused.hint || refused.message || ''))
    ok(hint.includes('board'), '§0d10 and the refusal lists the legal value (`board`)', hint)
    const closureDet = await b.callJson('vibe_vmu_turn', { op: 'status', detail: 'closure' })
    ok(closureDet && closureDet.ok === true && closureDet.detail === 'closure',
      '§0d11 the pre-existing closure slice still works (this round did not trade one detail for another)')
  }
} finally {
  for (const root of roots) await rm(root, { recursive: true, force: true })
}

console.log('\n=== VMU RUN 77 READER READINGS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
process.exit(failed ? 1 : 0)
