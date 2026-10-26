// tests/vmu-run43-duplicate-write.test.mjs — LIVE RUN 43 / the second door wrote a twin.
//
// Measured (run 43, the office dispatched one instruction): a member was told to write ONE progress row. It called
// `vibe_v5_record_progress` (the tool door, which takes `member`) AND put the same row in the fenced reply (the
// envelope door). Both landed: rec-1 and rec-2 — same owner, same title, one millisecond apart — and the status
// board's [当前小任务] cited rec-2 while the member's own prose said rec-1. Neither door is wrong; the pair is one act
// done twice.
//
// The fix is in the dispatch, not in the prompt: the turn knows who it is and when it opened, so the SECOND door asks
// the ledger whether the same act is already written (same owner + same track + same title + written at-or-after the
// turn opened) and SKIPS BY NAME instead of writing a twin. It never guesses and it never refuses: it reports.
//
// Run: node tests/vmu-run43-duplicate-write.test.mjs   (last line: === VMU RUN43 DUPLICATE WRITE: N passed, M failed ===)

import { createTurnOrchestrator, deliverByReturning, facesFrom } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}
const fence = (obj) => 'prose first\n\n```json\n' + JSON.stringify(obj) + '\n```\n'
const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })

/**
 * A ledger that the turn can ASK: `list()` is what the duplicate guard reads, `put()` is what the envelope writes.
 * `seed` rows are already in the ledger BEFORE the turn (they stand for the member's own tool-door write).
 */
const makeLedger = ({ seed = [], withList = true } = {}) => {
  const rows = seed.map((r) => Object.assign({ status: 'live' }, r))
  const puts = []
  const records = {
    put: async (payload) => {
      puts.push(payload)
      const id = 'rec-' + (rows.length + 1)
      rows.push({ id, track: payload.track, kind: payload.kind, title: payload.title, owner: payload.by, createdAt: Date.now(), updatedAt: Date.now() })
      return { ok: true, id }
    },
  }
  if (withList) {
    records.list = ({ track } = {}) => ({ ok: true, items: rows.filter((r) => track === undefined || r.track === track).map((r) => Object.assign({}, r)) })
  }
  const faces = facesFrom({ records })
  const seam = deliverByReturning()
  const gov = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), faces, deliver: seam })
  return { gov, puts, rows, seam }
}

const runFence = async (ledger, reply) => {
  const step1 = await ledger.gov.step({ member: 'm1', members: [{ id: 'm1' }], phase: 'normal' })
  if (!step1.ok || step1.awaiting !== true) throw new Error('precondition: the first step must await the caller, got ' + JSON.stringify(step1).slice(0, 200))
  ledger.gov.supplyMemberReply(fence(reply))
  const step2 = await ledger.gov.step({ member: 'm1', members: [{ id: 'm1' }], phase: 'normal' })
  return step2
}

console.log('=== VMU RUN43 DUPLICATE WRITE (one act, two doors) ===')

// ① THE DEFECT: the tool door already wrote this act this turn ⇒ the envelope door must not write the twin.
{
  const ledger = makeLedger({ seed: [{ id: 'rec-1', track: 'progress', kind: 'progress', title: '偶数项和·起点', owner: 'm1', createdAt: Date.now() + 60000 }] })
  const step2 = await runFence(ledger, { progress: { track: 'progress', title: '偶数项和·起点', body: '同一件事的第二次投递。' } })
  ok(step2.ok === true, '① the turn still completes (a skipped twin is not a refusal)', step2.code)
  ok(ledger.puts.length === 0, '① ★ the records face saw NO second put (the twin was not written)', ledger.puts.length)
  ok(ledger.rows.length === 1, '① ★ the ledger still holds exactly one row', ledger.rows.length)
  // The receipt keeps BOTH: `skipped` is the count and `skippedDetail` is the rows (run 37's lesson: a number alone
  // is unreadable). Read the detail.
  const skipped = (step2.receipt && Array.isArray(step2.receipt.skippedDetail)) ? step2.receipt.skippedDetail : []
  const hit = skipped.find((s) => s && s.field === 'progress')
  ok(hit !== undefined, '① the receipt NAMES the skipped field', { skippedDetail: skipped, count: step2.receipt && step2.receipt.skipped })
  ok(hit && hit.reason === 'already-written-this-turn', '① ★ with the reason that says what it is', hit && hit.reason)
  ok(hit && hit.existingId === 'rec-1', '① ★ and cites the row that already exists', hit && hit.existingId)
  ok(hit && typeof hit.means === 'string' && /ONE door/.test(hit.means), '① ★ and tells the reader how to avoid it (one act, one door)', hit && hit.means)
  ok(step2.receipt && step2.receipt.executed === 0, '① it is NOT counted as executed (no double accounting)', step2.receipt && step2.receipt.executed)
}

// ② A DIFFERENT TITLE IS A DIFFERENT ACT: the second door still writes.
{
  const ledger = makeLedger({ seed: [{ id: 'rec-1', track: 'progress', kind: 'progress', title: '别的题目', owner: 'm1', createdAt: Date.now() + 60000 }] })
  const step2 = await runFence(ledger, { progress: { track: 'progress', title: '偶数项和·起点', body: '新题目。' } })
  ok(step2.ok === true, '② completes', step2.code)
  ok(ledger.puts.length === 1, '② a different title is a different act, so it is written', ledger.puts.length)
  ok(ledger.puts[0] && ledger.puts[0].by === 'm1', '② and still attributed', ledger.puts[0] && ledger.puts[0].by)
}

// ③ A DIFFERENT OWNER IS A DIFFERENT ACT (the guard is per-member, not per-title).
{
  const ledger = makeLedger({ seed: [{ id: 'rec-1', track: 'progress', kind: 'progress', title: '偶数项和·起点', owner: 'r-9', createdAt: Date.now() + 60000 }] })
  const step2 = await runFence(ledger, { progress: { track: 'progress', title: '偶数项和·起点', body: '同一标题，另一作者。' } })
  ok(step2.ok === true, '③ completes', step2.code)
  ok(ledger.puts.length === 1, '③ another member\'s row with the same title does not suppress this one', ledger.puts.length)
}

// ④ A ROW FROM BEFORE THIS TURN IS NOT A TWIN (the ledger may hold an old row with the same title).
{
  const ledger = makeLedger({ seed: [{ id: 'rec-1', track: 'progress', kind: 'progress', title: '偶数项和·起点', owner: 'm1', createdAt: Date.now() - 3600000 }] })
  const step2 = await runFence(ledger, { progress: { track: 'progress', title: '偶数项和·起点', body: '这一轮才写的。' } })
  ok(step2.ok === true, '④ completes', step2.code)
  ok(ledger.puts.length === 1, '④ an old row does not count as "this turn" (only at-or-after open)', ledger.puts.length)
}

// ⑤ A LEDGER THAT CANNOT BE ASKED DEGRADES TO THE OLD BEHAVIOUR — it must not invent a skip.
{
  const ledger = makeLedger({ withList: false, seed: [{ id: 'rec-1', track: 'progress', kind: 'progress', title: '偶数项和·起点', owner: 'm1', createdAt: Date.now() + 60000 }] })
  const step2 = await runFence(ledger, { progress: { track: 'progress', title: '偶数项和·起点', body: '读不到账本时照写。' } })
  ok(step2.ok === true, '⑤ completes', step2.code)
  ok(ledger.puts.length === 1, '⑤ with no readable ledger the write happens (a guard that cannot ask does not pretend)', ledger.puts.length)
}

// ⑥ THE GUARD ONLY LOOKS AT RECORD WRITES: a `say` field on a turn with no meeting is still skipped by its own rule.
{
  const ledger = makeLedger({})
  const step2 = await runFence(ledger, { say: 'I read the card and I am continuing.' })
  ok(step2.ok === true, '⑥ completes', step2.code)
  // `skipped` is the COUNT; the rows live in `skippedDetail`. Reading the count property as an array would be
  // always-empty and the assertion below would pass without evidence (RULE E caught exactly that).
  const count = (step2.receipt && typeof step2.receipt.skipped === 'number') ? step2.receipt.skipped : null
  const skipped = (step2.receipt && Array.isArray(step2.receipt.skippedDetail)) ? step2.receipt.skippedDetail : []
  ok(count === skipped.length, '⑥ the receipt count and its detail rows agree', { count, rows: skipped.length })
  ok(skipped.every((s) => s.field !== 'progress'), '⑥ no records skip was invented for a non-record field', skipped)
}

console.log('\n=== VMU RUN43 DUPLICATE WRITE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('failures: ' + failures.join(' | ')); process.exitCode = 1 }
