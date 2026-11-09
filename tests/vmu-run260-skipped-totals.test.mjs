// tests/vmu-run260-skipped-totals.test.mjs — RUN 260 / TB-2667 (task-147): closes the ledger's last P1 open,
// `run254-leftopen-3-skipped-aggregation`.
//
// THE MEASURED GAP: "how many fields did this session skip?" had no single answer. The per-turn ledger carries
// `skipped`/`skippedFields` per row, but the rows are BOUNDED (TURN_RECEIPT_CAP = 50), so the only way to answer was to
// page through rows - and once old rows were evicted the answer silently SHRANK with nothing saying why. Worse, the
// ledger publishes `counts.notExecuted`, a loop-lifetime counter of exactly those skip events, so the two numbers a
// reader can reach disagree after an eviction and NEITHER says they are measuring different spans.
//
// THE FIX (kernel): one derivation point, `skippedTotalsReading()`, over the SAME row array `turnReceipts` publishes -
// `fields` (skip EVENTS across retained rows), `fieldsDispatchThrown` (the subset whose dispatch threw = per-turn
// `skippedFields`), `turnsWithSkips`, `scope:'retained-turn-rows'`, `retainedTurns`, `evictedTurns` and
// `evictedSkippedUnknown`. It is published as `status.skippedTotals` and hoisted to the tool receipt top level.
//
// WHAT THIS SUITE PINNED, AND HOW IT AVOIDS MEASURING ITSELF:
//   §1 the empty-state reading is well formed (0s + a named scope + a sentence, not nulls);
//   §2 the totals are CORRECT for three turns that skip 2/1/3 fields, and `fields` counts EVENTS (a field skipped in two
//      turns counts twice) while the row list still carries the per-turn readings;
//   §3 the totals are RECOMPUTED from an EXTERNAL source (the rows themselves, plus the loop's own lifetime counter)
//      instead of being compared against the receipt's own claim;
//   §4 EVICTION IS NOT SILENT: 51 turns push one row off the ledger, and the reading says which part is missing instead
//      of letting `fields` look like a session total that shrank for no reason;
//   §5 anti-lamp: `fields` cannot be the row count / turn count / lifetime counter by accident (all four numbers differ
//      in the fixtures below, so substituting any of them turns this suite red).
//
// RULE E: every `.every(...)` is preceded by an explicit non-empty assertion, and the deep comparisons live in helpers
// that never call `ok(`.
//
// Run: node tests/vmu-run260-skipped-totals.test.mjs   (last line: === VMU RUN 260 SKIPPED TOTALS: N passed, M failed ===)
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const HARNESS = pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href
const NOW = 1_800_000_000_000
const CAP = 50

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const j = (x) => JSON.stringify(x)

// ── helpers: the independent criteria live here, and NONE of them call `ok(` (RULE E) ────────────────────────────────
const fenceOf = (payload) => '```json\n' + j(payload) + '\n```'
const bootHarness = async (deliver, root) => {
  const { boot } = await import(HARNESS)
  return boot({ root, clock: () => NOW, withPrompt: true, deliver })
}
const mkKernel = (seam) => {
  const kernel = createKernel({
    clock: () => NOW, settings: {}, deliverTurn: seam,
    slots: [{ id: 'member', capacity: 2, permissions: ['speak', 'vote'] }, { id: 'chair', capacity: 1, permissions: ['convene'] }],
  })
  const specs = toolSpecs({ kernel, settings: {}, turnTool: true, meetingTool: true, controlTool: true })
  return { kernel, spec: (n) => specs.find((s) => s.name === n) }
}
/** EXTERNAL SOURCE 1: the rows themselves. Sum the per-turn list named by `key`, no receipt claim involved. */
const sumOf = (rows, key) => (Array.isArray(rows) ? rows : [])
  .reduce((n, r) => n + (r && Array.isArray(r[key]) ? r[key].length : 0), 0)
const skipCountsOf = (rows) => (Array.isArray(rows) ? rows : [])
  .map((r) => (r && Array.isArray(r.skipped) ? r.skipped.length : -1))
const distinctFieldNames = (rows) => {
  const seen = new Set()
  for (const r of (Array.isArray(rows) ? rows : [])) {
    for (const e of (r && Array.isArray(r.skipped) ? r.skipped : [])) seen.add(String(e && e.field))
  }
  return Array.from(seen).sort()
}
const sameJson = (a, b) => j(a) === j(b)
const contains = (hay, needle) => typeof hay === 'string' && hay.indexOf(needle) !== -1
const occurrences = (src, needle) => String(src).split(needle).length - 1
/** The one derivation point's own body, cut out of the kernel source (a SOURCE fact, not a receipt claim). */
const bodyBetween = (src, startNeedle, endNeedle) => {
  const a = src.indexOf(startNeedle)
  const b = a < 0 ? -1 : src.indexOf(endNeedle, a)
  return a < 0 || b < 0 ? '' : src.slice(a, b)
}
const mkRoot = (tag) => mkdtempSync(join(tmpdir(), 'vmu-run260-' + tag + '-'))

// ── 0. ONE DERIVATION POINT: the kernel derives it, the face forwards it, nobody re-tallies ───────────────────────────
console.log('=== 0. the total has ONE derivation point (a source fact, not a promise) ===')
{
  const kernelSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
  const faceSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'tools', 'turn.js'), 'utf8')
  const body = bodyBetween(kernelSrc, 'const skippedTotalsReading = () =>', 'const run = async (spec) =>')

  ok(occurrences(kernelSrc, 'const skippedTotalsReading = () =>') === 1,
    '§0a. `skippedTotalsReading` is defined exactly ONCE in the kernel')
  ok(occurrences(kernelSrc, 'skippedTotals: skippedTotalsReading()') === 1,
    '§0b. and the status publishes THAT function (not a second inline tally)', { hits: occurrences(kernelSrc, 'skippedTotals: skippedTotalsReading()') })
  ok(occurrences(kernelSrc, "scope: 'retained-turn-rows'") === 1,
    '§0c. the scope string is declared once, so "bounded" cannot disagree with itself')
  ok(contains(body, 'Array.from(turnReceipts.values())') && contains(body, '.skipped.length') && contains(body, '.skippedFields.length') && contains(body, 'turns.size'),
    '§0d. ★★ its body reads the SAME row array and the SAME turn registry the ledger publishes (`turnReceipts`, `turns`)',
    { body: body.length })
  ok(occurrences(kernelSrc, 'evictedSkippedUnknown: evictedTurns > 0') === 1,
    '§0e. the "is this the whole session?" flag is derived from the eviction count, not asserted by hand')
  ok(occurrences(faceSrc, 'status.skippedTotals') === 2 && occurrences(faceSrc, 'return { ok: true, status, turns: perTurn, skippedTotals,') === 1,
    '§0f. the tool face only FORWARDS it (one read, one hoist) — no second aggregation on the face',
    { reads: occurrences(faceSrc, 'status.skippedTotals'), hoists: occurrences(faceSrc, 'return { ok: true, status, turns: perTurn, skippedTotals,') })
}

// ── 1. THE EMPTY STATE IS WELL FORMED (not nulls a reader has to guess about) ────────────────────────────────────────
console.log('=== 1. a fresh loop answers 0 — with a named scope and a sentence ===')
{
  const fresh = mkKernel(async () => fenceOf({}))
  const status = fresh.kernel.turn.status()
  const totals = status.skippedTotals || {}
  const receipt = await fresh.spec(TOOL_NAMES.turn).run({ op: 'status' })

  ok(totals.fields === 0 && totals.turnsWithSkips === 0 && totals.fieldsDispatchThrown === 0,
    '§1a. no turn, no skip: `fields`/`turnsWithSkips`/`fieldsDispatchThrown` are all 0', { totals: { fields: totals.fields, turnsWithSkips: totals.turnsWithSkips, thrown: totals.fieldsDispatchThrown } })
  ok(totals.scope === 'retained-turn-rows', '§1b. the scope NAMES the bound instead of leaving it to the reader', { scope: totals.scope })
  ok(totals.retainedTurns === 0 && totals.evictedTurns === 0 && totals.evictedSkippedUnknown === false,
    '§1c. nothing retained, nothing evicted, and the "unknown part" flag is FALSE (nothing is missing)',
    { retainedTurns: totals.retainedTurns, evictedTurns: totals.evictedTurns, unknown: totals.evictedSkippedUnknown })
  ok(typeof totals.means === 'string' && totals.means.length > 80 && contains(totals.means, 'BOUNDED'),
    '§1d. ★ a sentence travels with the numbers and says they are BOUNDED', { means: totals.means && totals.means.slice(0, 100) })
  ok(receipt.ok === true && sameJson(receipt.skippedTotals, status.skippedTotals),
    '§1e. ★★ the tool receipt HOISTS the very same object (`skippedTotals`) — one reading, two places to find it')
  ok(typeof receipt.status.skippedTotalsMeans === 'string' && contains(receipt.status.skippedTotalsMeans, 'retained'),
    '§1f. and a top-level-style sentence names what `scope` bounds (retained rows)', { means: receipt.status.skippedTotalsMeans && receipt.status.skippedTotalsMeans.slice(0, 100) })
  ok(receipt.status.turns === 0 && Array.isArray(receipt.turns) && receipt.turns.length === 0,
    '§1g. the OLD readings still mean what they meant: `status.turns` is a COUNT, the receipt-level `turns` is the row list')
}

// ── 2. CORRECTNESS: three turns skipping 2 / 1 / 3 fields ⇒ fields:6, turnsWithSkips:3 ────────────────────────────────
console.log('=== 2. three turns skipping 2/1/3 fields add up — and EVENTS are counted, not field names ===')
{
  const root = mkRoot('sum')
  try {
    // Deterministic skips with NO live model: a meeting-bound field in a turn with no meeting is skipped BY NAME
    // (`no-meeting-bound`), it does not throw, and the turn still completes. No field has to apply for that: a turn made
    // only of named skips is a settled turn, not a failed one (run254 §6f pinned the same path).
    const queued = [
      fenceOf({ say: 'no meeting here', input: 'no meeting either' }),
      fenceOf({ say: 'again, still no meeting' }),
      fenceOf({ say: 'x', motion: { text: 'propose?' }, input: 'y' }),
    ]
    const h = await bootHarness(async () => (queued.length > 0 ? queued.shift() : fenceOf({})), root)
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    const steps = []
    for (let i = 0; i < 3; i += 1) steps.push(await h.call('vibe_vmu_turn', { op: 'step', member: 'r-1', phase: 'normal' }))

    ok(steps.length === 3 && steps.every((s) => s && s.ok === true),
      '§2a. all three turns SETTLED (a skipped field is not a failed turn)', { oks: steps.map((s) => s && s.ok) })
    const receipt = await h.call('vibe_vmu_turn', { op: 'status' })
    const totals = receipt.skippedTotals || {}
    const rows = Array.isArray(receipt.turns) ? receipt.turns : []

    ok(rows.length === 3, '§2b. the ledger really holds three rows (non-empty guard before summing them)', { rows: rows.length })
    ok(totals.fields === 6, '§2c. ★★★ `fields` = 2 + 1 + 3 = 6 skipped-field EVENTS', { fields: totals.fields })
    ok(totals.turnsWithSkips === 3, '§2d. ★★ `turnsWithSkips` = 3 (every turn skipped at least one field)', { turnsWithSkips: totals.turnsWithSkips })
    const perTurn = skipCountsOf(rows)
    ok(sameJson(perTurn, [2, 1, 3]), '§2e. ★★ the per-turn rows say exactly 2/1/3 — the total is their sum, not a separate story', { perTurn })
    ok(totals.fieldsDispatchThrown === 0,
      '§2f. `fieldsDispatchThrown` is 0 here: these skips were BY NAME, not throws — the two lists are not the same list', { thrown: totals.fieldsDispatchThrown })
    ok(totals.retainedTurns === 3 && totals.evictedTurns === 0 && totals.evictedSkippedUnknown === false,
      '§2g. nothing evicted yet, so the reading says the total IS the session so far',
      { retainedTurns: totals.retainedTurns, evictedTurns: totals.evictedTurns, unknown: totals.evictedSkippedUnknown })

    // THE 口径: events vs distinct names. `say` was skipped in TWO turns; if the total counted distinct field names it
    // would be 3, not 6. Both numbers are asserted, so the chosen rule is visible rather than assumed.
    const names = distinctFieldNames(rows)
    ok(names.length === 3 && totals.fields === 6,
      '§2h. ★★★ the rule is EVENTS: 6 skips from 3 distinct field names (say in two turns counts twice)',
      { distinctNames: names, fields: totals.fields })
    ok(contains(totals.means, 'EVENTS') && contains(totals.means, 'counts twice'),
      '§2i. and the sentence states that rule in words, so a reader does not have to infer it from the number')

    // ── 3. EXTERNAL RECOMPUTATION: does the total match an independent traversal? ─────────────────────────────────────
    console.log('=== 3. the total is recomputed from external sources, not trusted ===')
    const externalSum = sumOf(rows, 'skipped')
    ok(externalSum === totals.fields,
      '§3a. ★★★ summing the rows\' own `skipped` lengths reproduces `fields` exactly', { externalSum, fields: totals.fields })
    ok(sumOf(rows, 'skippedFields') === totals.fieldsDispatchThrown,
      '§3b. and the same traversal of `skippedFields` reproduces `fieldsDispatchThrown`', { externalSum: sumOf(rows, 'skippedFields'), thrown: totals.fieldsDispatchThrown })
    ok(h.kernel.turn.status().counts.notExecuted === totals.fields,
      '§3c. ★★ the loop\'s INDEPENDENT lifetime counter agrees while nothing was evicted (two sources, one number)',
      { notExecuted: h.kernel.turn.status().counts.notExecuted, fields: totals.fields })
    ok(totals.fields !== rows.length && totals.fields !== totals.turnsWithSkips,
      '§3d. the number is not the row count (3) nor the turn-with-skips count (3) — it is the field total (6)',
      { fields: totals.fields, rows: rows.length, turnsWithSkips: totals.turnsWithSkips })
    ok(totals.scope === 'retained-turn-rows' && contains(totals.means, 'neither a session total nor an upper bound'),
      '§3e. the scope word and the sentence agree about what the number is bounded to')
  } finally {
    try { rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

// ── 4. EVICTION IS NOT SILENT: 51 turns push the oldest row out and the reading NAMES the missing part ───────────────
console.log('=== 4. past the retainer cap, the total says what it no longer covers ===')
{
  // A kernel whose seam answers immediately, so 51 settled turns are cheap; every turn skips `say` (no meeting bound),
  // and every third one also skips `motion`. Over 51 turns that is 34 + 17 = 68 events, of which the FIRST turn's 1
  // event falls off with the evicted row: the retained total must be 67, NOT 68 and NOT the 50 rows.
  const replies = []
  for (let i = 1; i <= CAP + 1; i += 1) {
    replies.push(fenceOf(i % 3 === 0 ? { say: 'no meeting', motion: { text: 'no meeting' } } : { say: 'no meeting' }))
  }
  const { kernel, spec } = mkKernel(async () => (replies.length > 0 ? replies.shift() : fenceOf({})))
  await spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm1', slot: 'member', institution: 'I' })
  for (let i = 0; i < CAP + 1; i += 1) await spec(TOOL_NAMES.turn).run({ op: 'step', phase: 'normal', member: 'm1' })

  const status = kernel.turn.status()
  const totals = status.skippedTotals || {}
  const rows = Array.isArray(status.turnReceipts) ? status.turnReceipts : []
  const lifetime = status.counts.notExecuted

  ok(status.turns === CAP + 1, '§4a. the loop really opened 51 turns', { turns: status.turns })
  ok(rows.length === CAP, '§4b. but the ledger retains only the last 50 rows (the retainer is real, not hypothetical)', { rows: rows.length })
  ok(totals.retainedTurns === CAP && totals.evictedTurns === 1,
    '§4c. ★★★ retainedTurns/evictedTurns name the exact difference (50 / 1)', { retainedTurns: totals.retainedTurns, evictedTurns: totals.evictedTurns })
  ok(rows.length > 0, '§4d. non-empty guard before traversing the rows', { rows: rows.length })
  ok(totals.fields === sumOf(rows, 'skipped') && totals.fields === 67,
    '§4e. ★★★ `fields` is exactly the retained rows\' sum (67 of the 68 events), recomputed externally',
    { fields: totals.fields, externalSum: sumOf(rows, 'skipped') })
  ok(totals.fields !== rows.length, '§4f. ★★ and it is NOT the row count (67 ≠ 50), so "fields = how many rows" cannot pass', { fields: totals.fields, rows: rows.length })
  ok(lifetime === 68 && totals.fields < lifetime,
    '§4g. ★★★ the loop\'s lifetime counter still says 68 while the bounded total says 67 — the gap is the evicted part',
    { lifetime, fields: totals.fields })
  ok(totals.evictedSkippedUnknown === true,
    '§4h. ★★★ `evictedSkippedUnknown:true` — the reading declares that the dropped row\'s skips are NOT separately attributable here', { unknown: totals.evictedSkippedUnknown })
  ok(contains(totals.means, 'evicted') || contains(totals.means, 'retainer'),
    '§4i. the sentence names the eviction as the reason a total can shrink, instead of leaving it unexplained')
  ok(contains(totals.means, 'not recoverable from here') && contains(totals.means, 'neither a session total nor an upper bound'),
    '§4j. ★★ and it refuses the two wrong readings (session total, upper bound) in words', { means: totals.means && totals.means.slice(0, 140) })
  ok(totals.scope === 'retained-turn-rows' && totals.evictedSkippedUnknown === (totals.evictedTurns > 0),
    '§4k. the scope word and the flag are the same claim, computed from the same derivation')
  ok(rows.length > 0 && rows.every((r) => r && Array.isArray(r.skipped) && Array.isArray(r.skippedFields)),
    '§4l. the OLD per-turn readings are still on every row (the aggregate was added, not substituted)')
  ok(sumOf(rows, 'skippedFields') === totals.fieldsDispatchThrown,
    '§4m. `fieldsDispatchThrown` follows the same external traversal (0 throws in these replies — a sum, not an assumed 0)',
    { thrown: totals.fieldsDispatchThrown, external: sumOf(rows, 'skippedFields') })
}

// ── 5. ANTI-LAMP: the four candidate numbers are all different in these fixtures ──────────────────────────────────────
console.log('=== 5. the total cannot be one of the nearby numbers by accident ===')
{
  const root = mkRoot('lamp')
  try {
    const queued = [
      fenceOf({ say: 'a', input: 'a' }),
      fenceOf({ say: 'b' }),
      fenceOf({ say: 'c', motion: { text: 'c' }, input: 'c' }),
    ]
    const h = await bootHarness(async () => (queued.length > 0 ? queued.shift() : fenceOf({})), root)
    await h.call('vibe_v5_start', { problem: 'P', researcherCount: 2 })
    for (let i = 0; i < 3; i += 1) await h.call('vibe_vmu_turn', { op: 'step', member: 'r-1', phase: 'normal' })
    const receipt = await h.call('vibe_vmu_turn', { op: 'status' })
    const t = receipt.skippedTotals || {}
    const rows = Array.isArray(receipt.turns) ? receipt.turns : []
    const candidates = { fields: t.fields, rows: rows.length, opened: receipt.status.counts.opened, lifetime: receipt.status.counts.notExecuted, turnsWithSkips: t.turnsWithSkips }
    ok(candidates.fields === 6, '§5a. fixture: 2 + 1 + 3 skips (the same shape as §2, through a different reply queue)', { candidates })
    ok(candidates.rows === 3 && candidates.opened === 3 && candidates.lifetime === 6,
      '§5b. the neighbours are 3 / 3 / 6, so the row count (3) and the lifetime counter (6) differ from each other',
      { candidates })
    ok(candidates.fields !== candidates.rows && candidates.fields !== candidates.opened && candidates.fields !== candidates.turnsWithSkips,
      '§5c. ★★ `fields` (6) is not the row count, the opened-turn count, or the turn-with-skips count (all 3)')
    ok(contains(t.means, 'dedupe') || contains(t.means, 'dedupe the `field`'),
      '§5d. the sentence even tells a reader how to get field NAMES from the rows, since the total deliberately counts events', { means: t.means && t.means.slice(0, 160) })
  } finally {
    try { rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

console.log('')
console.log('=== VMU RUN 260 SKIPPED TOTALS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  · ' + f)
  process.exitCode = 1
}
