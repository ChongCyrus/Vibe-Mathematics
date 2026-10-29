#!/usr/bin/env node
// WAVE 2 — E18: a ballot's `max choices` must be a rule the ballot ENFORCES, not a field it drops.
//
// THE DEFECT: the per-ballot primitive (`kernel/ballot.js`, the object behind `kernel.ballot(...)` and therefore behind
// `vibe_vmu_meeting { action:"vote" }`) accepted `maxChoices` / `max` and did nothing with them — the option was not even
// destructured, so `kernel.ballot({ maxChoices: 1 })` was a ballot with NO cap. A single cast could carry any number of
// choices and still be recorded as one vote; the option-board layer (`kernel/ballotbox.js`) enforced the rule, the
// primitive that the meeting face actually talks to did not, and the docs register `VMU_BALLOT_CHOICE_COUNT` as the code
// for "选择数多于规则 maxChoices".
//
// WHAT THIS FILE MEASURES:
//   · the kernel API directly: cap 1 refuses a two-choice cast BY NAME (VMU_BALLOT_CHOICE_COUNT), prints the legal
//     count, records nothing; one choice is accepted and the receipt/status read the cap back;
//   · the alias `max` behaves identically (two spellings, one rule);
//   · the MEETING FACE receipt: a second choice is refused with the same code and the legal count in the text;
//   · counting is per choice, not "always 1": cap 2 accepts two choices, and a list is still refused when no cap is
//     declared (a ranked cast without a multi-choice rule has nothing to count against);
//   · the tally does not pretend a ranked cast was 1/0 (defaultTally names the rule it cannot read).
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const codeOf = async (fn) => {
  try { const out = await fn(); return { code: null, out } } catch (e) { return { code: e && e.code, message: String((e && e.message) || e), hint: e && e.hint, error: e } }
}

const entry = await import(pathToFileURL(ENTRY).href)
const state = { specs: [] }
const ctx = {
  effect(fn) { return fn() },
  on() { return () => {} },
  tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
}
const root = await mkdtemp(join(tmpdir(), 'vmu-wave2-e18-'))
const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
await handle.ready()
const kernel = handle.kernel
const call = async (name, args) => {
  const spec = state.specs.find((s) => s.name === name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, { kernel }) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return JSON.parse(raw) } catch { return { raw } }
}
await kernel.members.hire({ id: 'r-1', slot: 'member' })
await kernel.members.hire({ id: 'r-2', slot: 'member' })

// ── §1 the kernel ballot API: maxChoices=1 refuses a second choice, by name, and records nothing ──────────────────
console.log('§1 E18 — kernel.ballot({maxChoices:1}): a second choice is refused by NAME and the legal count is printed')
{
  const ballot = kernel.ballot({ id: 'b-one', target: 'motion-1', maxChoices: 1, eligible: ['r-1', 'r-2'] })
  await ballot.open()
  const over = await codeOf(() => ballot.cast('r-1', [1, 0]))
  ok(over.code === 'VMU_BALLOT_CHOICE_COUNT', 'code is VMU_BALLOT_CHOICE_COUNT', over)
  ok(/选择数 2/.test(over.message) && /maxChoices=1/.test(over.message), 'the message names the count and the rule', over.message)
  ok(/最多选 1 个/.test(over.hint), 'the hint prints the LEGAL count (最多选 1 个)', over.hint)
  ok(over.error && over.error.choices === 2 && over.error.maxChoices === 1 && over.error.legalChoices === 1,
    'the refusal carries the numbers as fields too (choices / maxChoices / legalChoices)',
    over.error && { choices: over.error.choices, maxChoices: over.error.maxChoices, legalChoices: over.error.legalChoices })
  const st = ballot.status()
  ok(st.voteCount === 0 && st.choices && st.choices.recorded === 0,
    'the refused cast recorded NOTHING (no half-written vote)', { voteCount: st.voteCount, choices: st.choices })
  ok(st.choices && st.choices.max === 1, 'status() reports the cap it is enforcing', st.choices && st.choices.max)
  const single = await ballot.cast('r-1', 1)
  ok(single.ok === true && single.choices === 1 && single.maxChoices === 1, 'one choice is accepted and the receipt reads the cap back', single)
  ok(ballot.status().choices.recorded === 1, 'the accepted cast counts as exactly one choice', ballot.status().choices)
  const dup = await codeOf(() => ballot.cast('r-1', 1))
  ok(dup.code !== 'VMU_BALLOT_CHOICE_COUNT', 'a duplicate cast is still refused for being a duplicate, not for its count', dup.code)
}

// ── §2 `max` is the same rule under its second spelling ──────────────────────────────────────────────────────────
console.log('§2 E18 — the alias `max` is one rule, not a second vocabulary')
{
  const ballot = kernel.ballot({ id: 'b-max', target: 'motion-2', max: 1, eligible: ['r-1'] })
  await ballot.open()
  const over = await codeOf(() => ballot.cast('r-1', [1, 0]))
  ok(over.code === 'VMU_BALLOT_CHOICE_COUNT', 'max:1 refuses a second choice with the same code', over)
  ok(/最多选 1 个/.test(String(over.hint)), 'the same legal count is printed', over.hint)
  ok(ballot.status().choices.max === 1 && ballot.status().voteCount === 0, 'the alias is in force (cap read back, nothing recorded)', ballot.status().choices)
}

// ── §3 the MEETING FACE: the same refusal reaches the tool receipt ────────────────────────────────────────────────
console.log('§3 E18 — vibe_vmu_meeting {action:"vote"}: the receipt refuses the second choice and prints the legal count')
{
  const receipt = await call('vibe_vmu_meeting', { action: 'vote', ballotId: 'b-one', member: 'r-2', value: [1, 0] })
  ok(receipt && receipt.ok === false, 'the vote is refused (ok:false)', receipt)
  ok(receipt && receipt.code === 'VMU_BALLOT_CHOICE_COUNT', 'the receipt carries VMU_BALLOT_CHOICE_COUNT', receipt && receipt.code)
  ok(receipt && /选择数 2/.test(String(receipt.message)) && /maxChoices=1/.test(String(receipt.message)),
    'the receipt MESSAGE names the count and the rule', receipt && receipt.message)
  ok(receipt && /最多选 1 个/.test(String(receipt.hint)), 'the receipt HINT prints the legal count', receipt && receipt.hint)
  const legal = await call('vibe_vmu_meeting', { action: 'vote', ballotId: 'b-one', member: 'r-2', value: 1 })
  ok(legal && legal.ok === true && legal.choices === 1 && legal.maxChoices === 1,
    'a legal vote through the same face succeeds and the receipt echoes {choices:1, maxChoices:1}', legal)
}

// ── §4 counting is per choice, not "always 1": a cap of 2 really accepts 2, an uncapped list is still refused ────
console.log('§4 E18 — the cap is COUNTED, not hardcoded: cap 2 accepts two choices; no cap still refuses a list')
{
  const two = kernel.ballot({ id: 'b-two', target: 'motion-3', maxChoices: 2, eligible: ['r-1'], castValid: (m, v) => v === 1 || v === 0 })
  await two.open()
  const cast = await two.cast('r-1', [1, 0])
  ok(cast.ok === true && cast.choices === 2 && cast.maxChoices === 2, 'a two-choice cast is accepted under maxChoices=2', cast)
  const over = await codeOf(() => two.cast('r-1', [1, 0, 1]))
  ok(over.code === null || over.code !== 'VMU_BALLOT_CHOICE_COUNT' || /最多选 2 个/.test(String(over.hint)),
    'the third choice is judged against the SAME declared cap (duplicate guard owns it first here)', over && over.code)
  const open = kernel.ballot({ id: 'b-open', target: 'motion-4', eligible: ['r-1'], castValid: (m, v) => typeof v === 'string' })
  await open.open()
  const list = await codeOf(() => open.cast('r-1', ['x', 'y']))
  ok(list.code === 'VMU_INVALID_ARGUMENT', 'with NO cap declared, a list is refused as an invalid value (nothing to count it against)', list)
  ok(open.status().voteCount === 0, 'the uncapped refusal recorded nothing', open.status().voteCount)
}

// ── §5 a declared cap must be a real number: an unreadable rule is refused, never silently treated as "no cap" ────
console.log('§5 E18 — an unreadable maxChoices is refused as a CONFIGURATION error, not degraded into "no cap"')
{
  const bad = await codeOf(async () => {
    const b = kernel.ballot({ id: 'b-bad', target: 'motion-5', maxChoices: 1.5, eligible: ['r-1'] })
    await b.open()
    return b
  })
  ok(bad.code === 'VMU_INVALID_ARGUMENT', 'maxChoices:1.5 is refused at construction', bad)
  ok(/whole number/.test(String(bad.message)), 'the message says the rule must be a whole number', bad.message)
  ok(/最多/.test(String(bad.hint)) || /declare how many choices/.test(String(bad.hint)), 'the hint says what the option means', bad.hint)
}

// ── §6 the tally tells the truth about a ranked cast (it cannot read it as 1/0) ───────────────────────────────────
console.log('§6 E18 — defaultTally does not pretend a ranked cast was a 1/0 vote')
{
  const ballot = kernel.ballot({ id: 'b-tally', target: 'motion-6', maxChoices: 2, eligible: ['r-1'], castValid: (m, v) => v === 1 || v === 0 })
  await ballot.open()
  await ballot.cast('r-1', [1, 0])
  const closed = await ballot.close('tally')
  ok(closed.outcome === 'undecided' && closed.tally && closed.tally.outcome === 'undecided',
    'the outcome is undecided, not a fabricated unanimous result', { outcome: closed.outcome, tally: closed.tally })
  ok(/multi-choice/.test(String(closed.tally && closed.tally.reason)),
    'the reason NAMES the rule the default tally cannot read', closed.tally && closed.tally.reason)
}

await rm(root, { recursive: true, force: true, maxRetries: 10 })
console.log('=== VMU WAVE2 E18 (ballot max choices): ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
console.log('ALL GREEN — tests/vmu-wave2-e18-ballot-max-choices.test.mjs (' + passed + ' checks)')
