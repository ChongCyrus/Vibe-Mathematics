// tests/vmu-run66-reply-bound.test.mjs — LIVE RUN 66 / F-57.
//
// WHAT THE OFFICE SAW: a member answered with 2,679 characters. The step receipt carried `replyExcerpt` (the reply the
// member wrote) and `replyLength: 2679`, and the excerpt ended MID-JSON — the office had to notice the cut by eye and
// could not tell from the receipt alone (a) that it WAS cut, (b) how much was missing, or (c) where the remainder
// lives. `replyLength` next to an excerpt that stops at 2,000 does not say which of the two numbers is the whole.
//
// THE RULE (ROUND 67): a bound that is not declared is a silent cut. The excerpt declares itself — `replyTruncated`
// says whether this text is the whole reply, `replyLimitChars` says where the cut sits, and when it cuts, the means
// sentence names the remainder's home (the member's own session, which this kernel does not copy).
//
// WHAT THIS SUITE PROVES:
//   1. a reply longer than the bound: `replyTruncated === true`, `replyLimitChars === 2000`, excerpt length is exactly
//      the limit, and `replyLength` is the FULL length (not the excerpt's);
//   2. the means sentence says it was CUT and names where the remainder lives (`member's own session`, `delivery.childId`);
//   3. a short reply says `replyTruncated === false` and that the excerpt IS the whole reply — the same field answers
//      both branches, so a reader never has to compare lengths to decide;
//   4. the PARSE-FAILED diagnostic carries the same two fields (the refusal path is where a cut is most dangerous:
//      the member's words are the only evidence the turn happened);
//   5. nothing else about the receipt moves: the parsed fields still apply, and `ok` is still true.
//
// Run: node tests/vmu-run66-reply-bound.test.mjs   (last line: === VMU RUN66 REPLY BOUND: N passed, M failed ===)

import { createTurnOrchestrator, facesFrom } from '../vibe-math-vmu/kernel/turn/index.js'
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
const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })
const faces = () => facesFrom({ records: { put: async () => ({ ok: true, put: 1 }) } })

/** The ACTIVATION route: the seam returns the member's raw text, which is the path that carries `replyExcerpt`. */
const makeGov = (text) => createTurnOrchestrator({
  sectionPolicy: DECIDE_SECTIONS,
  prompt: pipeline(),
  faces: faces(),
  deliver: async () => ({ reply: text, childId: 'child-r66', stopReason: 'completed', deliveryPath: 'activation' }),
})

console.log('=== VMU RUN66 REPLY BOUND (a declared cut, and where the rest lives) ===')

// ── 1 + 2 + 5: a long reply is declared as cut, and the remainder has a named home ───────────────────────────
{
  // 2,436 characters: longer than the 2,000 bound, with the parseable object inside the first 2,000 (exactly the shape
  // the office hit — the excerpt cut mid-object while the parse had the whole text).
  const longReply = 'prose first\n\n```json\n' + JSON.stringify({ say: 'x'.repeat(1200) }) + '\n```\n' + 'y'.repeat(900)
  const t = makeGov(longReply)
  const s = await t.step({ members: ['r-1'], why: 'reply bound: long text' })
  const r = s && s.receipt
  ok(s && s.ok === true, '① the long reply still applies (the bound is about the RECEIPT, not the parse)', s && s.code)
  ok(r && r.replyTruncated === true, '① the receipt DECLARES the cut (replyTruncated:true)', r && { replyTruncated: r.replyTruncated, replyLength: r.replyLength })
  ok(r && r.replyLimitChars === 2000, '① the limit is a field, not folklore (replyLimitChars:2000)', r && r.replyLimitChars)
  ok(r && r.replyLength === longReply.length, '① replyLength is the FULL length, not the excerpt', r && { replyLength: r.replyLength, expected: longReply.length })
  ok(r && typeof r.replyExcerpt === 'string' && r.replyExcerpt.length === r.replyLimitChars, '① the excerpt is exactly the limit long (so the two numbers cannot be confused)', r && r.replyExcerpt && r.replyExcerpt.length)
  ok(r && typeof r.replyExcerptMeans === 'string' && /CUT at replyLimitChars/.test(r.replyExcerptMeans), '② the means sentence says CUT (not merely "bounded")', r && r.replyExcerptMeans)
  ok(r && typeof r.replyExcerptMeans === 'string' && /member's own session/.test(r.replyExcerptMeans), "② the means names where the remainder lives (the member's own session)", r && r.replyExcerptMeans)
  ok(r && typeof r.replyExcerptMeans === 'string' && /delivery\.childId/.test(r.replyExcerptMeans), '② ★ and names the readable pointer to that session', r && r.replyExcerptMeans)
  ok(r && Array.isArray(r.fields) && r.fields.includes('say'), '⑤ the parsed fields still arrive alongside the excerpt', r && r.fields)
}

// ── 3: a short reply says it is the whole thing (one field answers both branches) ───────────────────────────
{
  const shortReply = JSON.stringify({ say: 'short' })
  const t = makeGov(shortReply)
  const s = await t.step({ members: ['r-1'], why: 'reply bound: short text' })
  const r = s && s.receipt
  ok(r && r.replyTruncated === false, '③ a short reply says replyTruncated:false', r && r.replyTruncated)
  ok(r && r.replyLength === r.replyExcerpt.length, '③ on the short branch the two lengths agree (sanity, not the reader\'s job)', r && { replyLength: r.replyLength, excerpt: r.replyExcerpt && r.replyExcerpt.length })
  ok(r && typeof r.replyExcerptMeans === 'string' && /complete/.test(r.replyExcerptMeans), '③ the means says the reply is complete', r && r.replyExcerptMeans)
  ok(r && typeof r.replyExcerptMeans === 'string' && !/CUT at/.test(r.replyExcerptMeans), '③ and does NOT claim a cut that did not happen', r && r.replyExcerptMeans)
}

// ── 4: the PARSE-FAILED diagnostic carries the same two fields ──────────────────────────────────────────────
{
  const prose = 'no fence here, just prose. ' + 'z'.repeat(2500)
  const t = makeGov(prose)
  const s = await t.step({ members: ['r-1'], why: 'reply bound: unparseable text' })
  ok(s && s.ok === false, '④ a reply with no parseable shape is refused (precondition for the diagnostic)', s && s.code)
  const st = await t.status()
  const diag = st && st.counts && st.counts.replyParseFailedLast
  ok(diag && diag.replyTruncated === true, '④ the refusal diagnostic declares the cut too (the member\'s words are the evidence)', diag && { replyTruncated: diag.replyTruncated, replyLength: diag.replyLength })
  ok(diag && diag.replyLimitChars === 2000, '④ and names the same limit', diag && diag.replyLimitChars)
  ok(diag && diag.replyLength === prose.length, '④ with the full length recorded', diag && { replyLength: diag.replyLength, expected: prose.length })
  ok(diag && typeof diag.replyExcerpt === 'string' && diag.replyExcerpt.length === 2000, '④ and the same bounded excerpt', diag && diag.replyExcerpt && diag.replyExcerpt.length)
}

console.log('')
console.log('=== VMU RUN66 REPLY BOUND: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('FAILURES: ' + JSON.stringify(failures, null, 2)); process.exitCode = 1 }
