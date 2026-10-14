// tests/vmu-turn-notice-source.test.mjs — Round 8 / task-59 A: F44's POSITIVE path.
//
// THE GAP THIS CLOSES. Round 7 wired an EXTERNAL notice source into the turn assembly (the Lean face's durable
// `takeNoticesFor(member)`), and core could only prove 3 of its 6 intended facts: "the seam is consumed" and "a
// failing source is NAMED". The POSITIVE half - "an announcement really reaches the text delivered to the member" -
// was NOT proven (the block it handed in never entered the assembly context).
//
// THE REAL SHAPE (measured): `createTurnOrchestrator(...).open({member, phase, statusBlock})` CONSTRUCTS the turn
// and returns `{ok, turn}`; the text comes from `assemble(turn)` ⇒ `{ok, text}` (`kernel/turn/index.js:316/336/396`).
// Driving only `open()` would test the constructor, not the delivery - which is exactly the mistake the R7 attempt
// made. Both channels are covered: the framework fallback (notices join the status block) and the pack wording
// (a `noticeBlock` receives them and the block is PREPENDED to the text).
//
// Run: node tests/vmu-turn-notice-source.test.mjs
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

/** A minimal-but-honest prompt pipeline: it assembles the status block it is given and RECORDS what it saw. */
function fakePrompt() {
  const seen = []
  return {
    seen,
    prompt: {
      disable: () => {},
      assemble: async (args) => { seen.push(args); return { ok: true, text: 'ASSEMBLED<' + String(args.statusBlock) + '>' } },
    },
  }
}
/** the real shape: construct the turn, then assemble its text */
const turnText = async (orch, spec) => {
  const o = await orch.open(spec)
  if (!o || o.ok !== true) return { ok: false, open: o }
  const a = await orch.assemble(o.turn)
  return { ok: !!a && a.ok === true, text: a && a.text, assembled: a, turn: o.turn }
}

// ── 1. POSITIVE PATH, status-block channel: the announcement is in the delivered text
console.log('=== 1. a notice source line REALLY reaches the assembled text (status-block channel) ===')
{
  const { prompt, seen } = fakePrompt()
  let calls = 0
  const LINE = '【公告】job-7 settled: passed'
  const orch = createTurnOrchestrator({
    prompt,
    settings: {},
    deliver: async () => 'ok',
    noticeSource: (member) => { calls += 1; return member === 'm-1' && calls === 1 ? [LINE] : [] },
  })
  const r = await turnText(orch, { member: 'm-1', phase: 'normal', statusBlock: 'BASE-STATUS' })
  ok(r.ok === true && typeof r.text === 'string',
    'the real shape (open ⇒ assemble) returns the delivered text', r && { ok: r.ok, text: String(r.text).slice(0, 90) })
  ok(String(r.text).includes(LINE),
    '★ THE POSITIVE PATH: the announcement is IN the text that would be delivered to the member', String(r.text).slice(0, 220))
  ok(String(r.text).includes('BASE-STATUS'),
    'and the turn\'s own status block is still there (the notice is ADDED, not substituted)')
  const last = seen[seen.length - 1]
  ok(!!last && String(last.statusBlock).includes(LINE),
    '★ the notice travelled THROUGH the status block handed to the prompt pipeline (the mechanic R7 could not show)',
    last && String(last.statusBlock).slice(0, 150))
  ok(calls === 1, 'the source was consulted exactly once for this assembly', calls)

  const r2 = await turnText(orch, { member: 'm-1', phase: 'normal', statusBlock: 'BASE-2' })
  ok(r2.ok === true && !String(r2.text).includes(LINE),
    '★ a take-once source is really ONE-SHOT: the second assembly does not repeat the announcement', String(r2.text).slice(0, 130))
  ok(calls === 2, 'and the source was consulted again (once per assembly, not cached forever)', calls)
}

// ── 2. POSITIVE PATH, pack channel: with a noticeBlock the lines are PREPENDED as their own block
console.log('=== 2. with a noticeBlock the announcement is PREPENDED as its own block ===')
{
  const { prompt, seen } = fakePrompt()
  const blockCalls = []
  const orch = createTurnOrchestrator({
    prompt,
    settings: {},
    deliver: async () => 'ok',
    noticeSource: () => ['【公告】A', '【公告】B'],
    noticeBlock: (lines) => { blockCalls.push(lines.slice()); return 'NOTICE-BLOCK(' + lines.join('|') + ')' },
  })
  const r = await turnText(orch, { member: 'm-1', phase: 'normal', statusBlock: 'BASE-STATUS' })
  ok(blockCalls.length === 1 && blockCalls[0].length === 2,
    'the pack\'s noticeBlock received BOTH lines, in one call', blockCalls)
  ok(String(r.text).startsWith('NOTICE-BLOCK(') && String(r.text).includes('【公告】A') && String(r.text).includes('【公告】B'),
    '★ the block is prepended to the delivered text, so the announcement leads the prompt', String(r.text).slice(0, 170))
  const last = seen[seen.length - 1]
  ok(!!last && String(last.statusBlock) === 'BASE-STATUS',
    'and the notices were kept OUT of the status block (corpus wording: block first, then the round)',
    last && String(last.statusBlock).slice(0, 90))
}

// ── 3. the failing-source half (kept as a regression: it was the only half proven in R7)
console.log('=== 3. a THROWING source is NAMED, never swallowed ===')
{
  const { prompt } = fakePrompt()
  const orch = createTurnOrchestrator({
    prompt,
    settings: {},
    deliver: async () => 'ok',
    noticeSource: () => { throw new Error('durable queue is gone') },
  })
  let threw = null
  try { await turnText(orch, { member: 'm-1', phase: 'normal', statusBlock: 'BASE' }) } catch (e) { threw = e }
  ok(!!threw && threw.code === 'VMU_ENGINE_UNAVAILABLE' && String(threw.message).includes('notice source'),
    '★ a source that throws refuses BY NAME (the announcement is not dropped silently)',
    threw && { code: threw.code, message: String(threw.message).slice(0, 90) })
}

// ── 4. a source that returns a non-array / blank lines contributes nothing and does not crash
console.log('=== 4. a non-array or blank-only answer contributes nothing ===')
{
  const { prompt } = fakePrompt()
  const orch = createTurnOrchestrator({ prompt, settings: {}, deliver: async () => 'ok', noticeSource: () => ['  ', '', null, 42] })
  const r = await turnText(orch, { member: 'm-1', phase: 'normal', statusBlock: 'BASE' })
  ok(r.ok === true && String(r.text).includes('BASE') && !String(r.text).includes('42'),
    'blank/non-string entries are ignored, and the turn still assembles', String(r.text).slice(0, 130))
  const { prompt: p2 } = fakePrompt()
  const orch2 = createTurnOrchestrator({ prompt: p2, settings: {}, deliver: async () => 'ok', noticeSource: () => 'not-an-array' })
  const r2 = await turnText(orch2, { member: 'm-1', phase: 'normal', statusBlock: 'BASE' })
  ok(r2.ok === true, 'a non-array answer is tolerated (it simply declares nothing)', r2)
}

console.log('')
console.log('=== TURN NOTICE SOURCE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
