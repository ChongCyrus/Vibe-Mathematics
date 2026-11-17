// tests/audit-refusal-means.test.mjs — TB-2792 / C#25 + ROUND-10 boundary: means coverage + hint short/full for the
// WHOLE tool-facing refusal surface (pack, host pre-gates, kernel tool modules), judged against the sources' OWN
// construction sites (never a hand list), with reverse lamps and a host-boundary integration check.
//
// THE MEASURED DEFECT (round-4..8 audits): 186 refusal receipts of which 6 carried `means`; no short/full distinction.
// Round-10 boundary: after the pack-side fix, another 80 corpus refusals (host pre-gates + kernel tool modules) were
// still undecorated — so the table + decorator moved to `vibe-math-vmu/refusal-means.js` and the HOST tool boundary
// decorates every receipt/throw. This suite pins BOTH halves:
//   · coverage: every code discovered on the tool-facing surface has means + short + REACHABLE INSTEAD (100%),
//   · runtime: a host-serialized refusal (thrown or returned) carries means/hintShort/hintFull,
//   · lamps: delete one means ⇒ RED naming it; short written as a copy of full ⇒ RED.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditProductRefusalMeans, discoverRefusalCodes, readProductSources } from '../scripts/audit-refusal-means.mjs'
import { REFUSAL_MEANS, REFUSAL_MEANS_EXEMPT, decorateRefusal, decorateThrownRefusal } from '../vibe-math-vmu/refusal-means.js'
import { V5R_REFUSAL_MEANS } from '../vibe-math-vmu/packs/v5r/tools.js'
import { toHostSpec } from '../vibe-math-vmu/host.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
// ★ audit-scanner-selfproof: this file IS a scanner (it derives the code set from the product's own sources), so it
// must be able to prove it can FIND something. The lamp sections below are that proof; `--selftest` runs this same
// suite (lamps included), so `node tests/audit-refusal-means.test.mjs --selftest` exiting 0 is the runnable self-proof.
const SELFTEST = process.argv.includes('--selftest')
let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.log('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}
const clone = (o) => JSON.parse(JSON.stringify(o))

// ---- 1. REAL TREE: every discovered code on the TOOL-FACING surface has a means + both hint forms ----------------
console.log('=== 1. means coverage across the whole tool-facing surface (distinct codes + receipt sites) ===')
{
  const report = auditProductRefusalMeans({ table: REFUSAL_MEANS, exempt: REFUSAL_MEANS_EXEMPT })
  ok(report.distinct.total >= 60, 'the tool-facing surface really exposes ~70 distinct refusal codes (non-vacuous discovery)', report.distinct.total)
  ok(report.ok === true, 'every discovered code carries a means + a short + a REACHABLE INSTEAD full clause', report.violations.slice(0, 5))
  ok(report.distinct.covered === report.distinct.total, 'distinct-code coverage is 100% (RUNTIME corpus口径: every code the host can receive)', report.distinct)
  ok(report.receipts.coverage === 1, 'receipt-weighted coverage is 100% (every construction site of a covered code)', report.receipts)
  ok(Object.keys(REFUSAL_MEANS_EXEMPT).length === 0, 'the named exemption ledger is EMPTY today (no code ships without a means)', REFUSAL_MEANS_EXEMPT)
  console.log('  ★ distinct codes covered=' + report.distinct.covered + '/' + report.distinct.total
    + ' | refusal sites covered=' + report.receipts.coveredSites + '/' + report.receipts.totalSites
    + ' (' + (report.receipts.coverage * 100).toFixed(1) + '%)')
  // the pack's public name for the table must be the SAME data, not a forked copy.
  // ★ RULE E shape B (G4, real fix — no whitelist): two EMPTY objects stringify-equal, so the equality below would be
  // vacuous if either side were empty. Assert BOTH sides are non-empty first; then the comparison compares real data.
  const sharedCodes = Object.keys(REFUSAL_MEANS)
  const packCodes = Object.keys(V5R_REFUSAL_MEANS)
  ok(sharedCodes.length > 0 && packCodes.length > 0,
    'C#25 非空前置（shape B）：共享表与 pack 导出都非空，下面的相等比较才有对象',
    { shared: sharedCodes.length, pack: packCodes.length })
  ok(JSON.stringify(V5R_REFUSAL_MEANS) === JSON.stringify(REFUSAL_MEANS),
    'packs/v5r/tools.js re-exports the SHARED table (one source; no second copy to drift)', { pack: Object.keys(V5R_REFUSAL_MEANS).length, shared: Object.keys(REFUSAL_MEANS).length })
}

// ---- 2. HOST BOUNDARY: a THROWN refusal is decorated before the host serializes it --------------------------------
console.log('=== 2. host boundary: thrown refusal ⇒ means + hintShort/hintFull in the receipt the model reads ===')
{
  const legacy = 'call another face; this seat may not call this one'
  const spec = {
    name: 'probe_thrown_refusal',
    description: 'probe',
    parameters: {},
    run: async () => { throw Object.assign(new Error('this seat may not call it'), { code: 'VMU_TOOL_NOT_IN_FACE', hint: legacy }) },
  }
  const raw = await toHostSpec(spec, null).execute({}, {})
  const receipt = JSON.parse(raw)
  ok(receipt.ok === false && receipt.code === 'VMU_TOOL_NOT_IN_FACE', 'the host still receives the same named refusal', { ok: receipt.ok, code: receipt.code })
  ok(typeof receipt.means === 'string' && receipt.means.length > 24, 'the host receipt carries a means sentence (kernel/host tool refusals are no longer undecorated)', receipt.means)
  ok(typeof receipt.hintShort === 'string' && receipt.hintShort.length <= 96 && !/REACHABLE INSTEAD/.test(receipt.hintShort),
    'the host receipt carries the SHORT form (one line)', receipt.hintShort)
  ok(String(receipt.hintFull).includes(legacy) && /REACHABLE INSTEAD/.test(String(receipt.hintFull)) && receipt.hint === receipt.hintFull,
    'the host receipt carries the FULL form as a superset (old hint preserved + REACHABLE INSTEAD) and `hint` defaults to it', { hint: String(receipt.hint).slice(0, 60) })
}

// ---- 3. HOST BOUNDARY: a RETURNED {ok:false} receipt is decorated as well ------------------------------------------
console.log('=== 3. host boundary: returned refusal receipt ⇒ decorated before serialization ===')
{
  const legacy = 'the object is closed; reopen it first'
  const spec = { name: 'probe_returned_refusal', description: 'probe', parameters: {}, run: async () => ({ ok: false, code: 'VMU_STATE', message: 'closed', hint: legacy }) }
  const receipt = JSON.parse(await toHostSpec(spec, null).execute({}, {}))
  ok(receipt.ok === false && typeof receipt.means === 'string' && typeof receipt.hintShort === 'string' && String(receipt.hintFull).includes(legacy),
    'a RETURNED refusal from any tool module is decorated by the same host seam', { means: String(receipt.means).slice(0, 40) })
}

// ---- 4. LAMPS ------------------------------------------------------------------------------------------------------
console.log('=== 4. lamps: a deleted means and a short-copy-of-full are RED, naming the code ===')
{
  const table = clone(REFUSAL_MEANS)
  const victim = 'VMU_STATE'
  delete table[victim]
  const report = auditProductRefusalMeans({ table })
  ok(report.ok === false && report.distinct.missing.includes(victim) && report.violations.some((v) => v.includes(victim)),
    'lamp ①: removing one means makes the audit RED and NAMES the code (no silent pass)', { missing: report.distinct.missing, violations: report.violations.slice(0, 2) })
  ok(report.distinct.covered === report.distinct.total - 1, 'lamp ①: the uncovered count moves by exactly one (no collateral silent gaps)', report.distinct)
}
{
  const table = clone(REFUSAL_MEANS)
  table['VMU_STATE'].short = table['VMU_STATE'].means + ' REACHABLE INSTEAD: ' + table['VMU_STATE'].reachable
  const report = auditProductRefusalMeans({ table })
  ok(report.ok === false && report.violations.some((v) => v.includes('VMU_STATE') && /(REACHABLE INSTEAD|one-liner)/.test(v)),
    'lamp ②: a short form that copies the full form is RED (the two forms must be distinct)', report.violations.filter((v) => v.includes('VMU_STATE')))
  const table2 = clone(REFUSAL_MEANS)
  table2['VMU_CONFLICT'].short = 'x'.repeat(200)
  const report2 = auditProductRefusalMeans({ table: table2 })
  ok(report2.ok === false && report2.violations.some((v) => v.includes('VMU_CONFLICT') && /one-liner/.test(v)),
    'lamp ②b: a short form longer than a line is RED (a paragraph is not a short form)', report2.violations.filter((v) => v.includes('VMU_CONFLICT')))
}

// ---- 5. RUNTIME dual form + honest absence + thrown decoration (unit level, both forms always readable) -----------
console.log('=== 5. runtime dual form: full is the default, short is selectable, both always readable ===')
{
  const legacy = 'the meeting is closed; reopen it or convene a new one'
  const full = decorateRefusal({ ok: false, code: 'VMU_STATE', message: 'closed', hint: legacy })
  ok(full.hintForm === 'full' && full.hint === full.hintFull && typeof full.means === 'string' && full.means.length > 24,
    'full is the DEFAULT form and lands in `hint`, with a means sentence', { form: full.hintForm })
  ok(String(full.hintFull).includes(legacy) && /REACHABLE INSTEAD/.test(full.hintFull), 'full is a SUPERSET (old hint kept + REACHABLE INSTEAD)', full.hintFull)
  ok(typeof full.hintShort === 'string' && full.hintShort.length <= 96 && !/REACHABLE INSTEAD/.test(full.hintShort), 'short is a one-liner, distinct from full', full.hintShort)
  const short = decorateRefusal({ ok: false, code: 'VMU_STATE', message: 'closed', hint: legacy }, { form: 'short' })
  ok(short.hint === short.hintShort && short.hintForm === 'short', 'a compact caller gets the SHORT form in `hint`', { hint: short.hint })
  ok(String(short.hintFull).includes(legacy) && /REACHABLE INSTEAD/.test(short.hintFull), 'choosing short does not lose the full text', short.hintFull)
  ok(short.means === full.means, 'both forms report the SAME means', { same: short.means === full.means })
  const unknown = decorateRefusal({ ok: false, code: 'VMU_NOT_A_REAL_CODE_TB2792', message: 'x', hint: 'y' })
  ok(unknown.means === null && unknown.meansMissing === true, 'an UNKNOWN code carries an HONEST absence (means:null + meansMissing), never a fabricated sentence', { means: unknown.means })
  const thrown = decorateThrownRefusal(Object.assign(new Error('closed'), { code: 'VMU_MEMBER_SESSION_NOT_LIVE', hint: legacy }))
  ok(thrown && typeof thrown.means === 'string' && typeof thrown.hintShort === 'string' && typeof thrown.hintFull === 'string',
    'a THROWN refusal is decorated too (host.refusalFacts copies own enumerable facts)', { means: thrown && String(thrown.means).slice(0, 40) })
}

// ---- 6. table invariants -------------------------------------------------------------------------------------------
console.log('=== 6. table invariants: distinct short/full per code, means explains it, no stale direction ===')
{
  const entries = Object.entries(REFUSAL_MEANS)
  const shortEqFull = entries.filter(([, v]) => String(v.short).trim() === String(v.means).trim())
  ok(entries.length >= 60 && shortEqFull.length === 0, 'no short form merely restates the means (every form says something different)', shortEqFull.map(([k]) => k))
  const noReach = entries.filter(([, v]) => !String(v.reachable || '').trim())
  ok(noReach.length === 0, 'every code names a reachable alternative (REACHABLE INSTEAD is never dropped)', noReach.map(([k]) => k))
  const discovered = discoverRefusalCodes(readProductSources(join(REPO, 'vibe-math-vmu')))
  const extra = [...discovered.keys()].filter((c) => !REFUSAL_MEANS[c] && !REFUSAL_MEANS_EXEMPT[c])
  ok(extra.length === 0, 'every DISCOVERED code has a table entry or a named exemption (the table cannot go stale in the other direction)', extra)
}

console.log('=== REFUSAL MEANS' + (SELFTEST ? ' (--selftest)' : '') + ': ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
