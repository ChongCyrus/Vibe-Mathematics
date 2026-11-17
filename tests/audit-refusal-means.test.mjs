// tests/audit-refusal-means.test.mjs — TB-2792 / C#25: means coverage + hint short/full, judged against the pack's
// OWN refusal-construction sites (never a hand list), with reverse lamps.
//
// THE DEFECT THIS PINS (round-4..8 audits): 186 refusal receipts, only 6 carried `means`; hints had no short/full
// distinction. The coverage judgement is BY DISTINCT CODE (the acceptance口径), with the receipt-weighted coverage
// reported as the second口径; the mechanism lives in packs/v5r/tools.js (`V5R_REFUSAL_MEANS` + decorateRefusal) and is
// wired into `withActingSeatGate`, so every pack-tool receipt/throw passes through it.
//
// LAMPS (both required by the taskbook):
//   ① delete one `means` from the table ⇒ a violation NAMING that code (red);
//   ② write the short form as a copy of the full form ⇒ red (the two forms must be distinct).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditPackRefusalMeans, discoverRefusalCodes, readPackSources } from '../scripts/audit-refusal-means.mjs'
import { V5R_REFUSAL_MEANS, decorateRefusal, decorateThrownRefusal } from '../vibe-math-vmu/packs/v5r/tools.js'

// ★ audit-scanner-selfproof: this file IS a scanner (it derives the code set from the pack's own sources), so it must
// be able to prove it can FIND something. The two lamp sections are that proof; `--selftest` runs this same suite
// (lamps included) so `node tests/audit-refusal-means.test.mjs --selftest` exiting 0 is the runnable self-proof.
const SELFTEST = process.argv.includes('--selftest')

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
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

// ---- 1. REAL TREE: every discovered code has a means, and both hint forms are present/well-shaped ----------------
console.log('=== 1. means coverage (distinct codes) + receipt-weighted coverage ===')
{
  const report = auditPackRefusalMeans({ table: V5R_REFUSAL_MEANS })
  ok(report.distinct.total >= 40, 'the pack really exposes ~42 distinct refusal codes (non-vacuous discovery)', report.distinct.total)
  ok(report.ok === true, 'every discovered code carries a means + a short + a REACHABLE INSTEAD full clause', report.violations.slice(0, 5))
  ok(report.distinct.covered === report.distinct.total, 'distinct-code coverage is 100%', report.distinct)
  ok(report.receipts.coverage === 1, 'receipt-weighted coverage is 100% (every construction site of a covered code)', report.receipts)
  console.log('  ★ distinct codes covered=' + report.distinct.covered + '/' + report.distinct.total
    + ' | receipts covered=' + report.receipts.coveredSites + '/' + report.receipts.totalSites
    + ' (' + (report.receipts.coverage * 100).toFixed(1) + '%)')
}

// ---- 2. LAMP ①: deleting ONE means is RED and names that code ------------------------------------------------------
console.log('=== 2. lamp: a deleted means is a named red ===')
{
  const table = clone(V5R_REFUSAL_MEANS)
  const victim = 'VMU_STATE'
  delete table[victim]
  const report = auditPackRefusalMeans({ table })
  ok(report.ok === false && report.distinct.missing.includes(victim) && report.violations.some((v) => v.includes(victim)),
    'removing one means makes the audit RED and NAMES the code (no silent pass)', { missing: report.distinct.missing, violations: report.violations.slice(0, 2) })
  ok(report.distinct.covered === report.distinct.total - 1, 'the uncovered count moves by exactly one (no collateral silent gaps)', report.distinct)
}

// ---- 3. LAMP ②: short written as a copy of the full form is RED -----------------------------------------------------
console.log('=== 3. lamp: short == full copy is red (the two forms must be distinct) ===')
{
  const table = clone(V5R_REFUSAL_MEANS)
  const victim = 'VMU_STATE'
  table[victim].short = table[victim].means + ' REACHABLE INSTEAD: ' + table[victim].reachable
  const report = auditPackRefusalMeans({ table })
  ok(report.ok === false && report.violations.some((v) => v.includes(victim) && /(REACHABLE INSTEAD|one-liner)/.test(v)),
    'a short hint that merely copies the full form is RED (it is not a one-liner)', report.violations.filter((v) => v.includes(victim)))
  const table2 = clone(V5R_REFUSAL_MEANS)
  table2['VMU_CONFLICT'].short = 'x'.repeat(200)
  const report2 = auditPackRefusalMeans({ table: table2 })
  ok(report2.ok === false && report2.violations.some((v) => v.includes('VMU_CONFLICT') && /one-liner/.test(v)),
    'a short hint longer than a line is RED (a paragraph is not a short form)', report2.violations.filter((v) => v.includes('VMU_CONFLICT')))
}

// ---- 4. RUNTIME: the dual-form receipt is usable, and full is a SUPERSET of the old hint -----------------------------
console.log('=== 4. runtime dual form: means + hintShort/hintFull, full preserves the old hint ===')
{
  const legacy = 'the meeting is closed; reopen it or convene a new one'
  const full = decorateRefusal({ ok: false, code: 'VMU_STATE', message: 'closed', hint: legacy })
  ok(typeof full.means === 'string' && full.means.length > 24, 'a refused receipt carries a means sentence', full.means)
  ok(full.hintForm === 'full' && full.hint === full.hintFull, 'the DEFAULT form is full and lands in `hint`', { form: full.hintForm, hint: String(full.hint).slice(0, 60) })
  ok(String(full.hintFull).includes(legacy) && /REACHABLE INSTEAD/.test(full.hintFull),
    'the full hint is a SUPERSET: the OLD hint text is kept AND a REACHABLE INSTEAD clause is added', full.hintFull)
  ok(typeof full.hintShort === 'string' && full.hintShort.length <= 96 && !/REACHABLE INSTEAD/.test(full.hintShort),
    'the short hint is a one-liner, distinct from the full form', full.hintShort)

  const short = decorateRefusal({ ok: false, code: 'VMU_STATE', message: 'closed', hint: legacy }, { form: 'short' })
  ok(short.hint === short.hintShort && short.hintForm === 'short', 'a compact/tool-face caller gets the SHORT form in `hint`', { hint: short.hint })
  ok(String(short.hintFull).includes(legacy) && /REACHABLE INSTEAD/.test(short.hintFull),
    '…and choosing short does NOT lose the full text (hintFull is still there)', short.hintFull)
  ok(short.means === full.means, 'both forms report the SAME means (the explanation does not change with the form)', { shortMeans: short.means === full.means })

  const unknown = decorateRefusal({ ok: false, code: 'VMU_NOT_A_REAL_CODE_TB2792', message: 'x', hint: 'y' })
  ok(unknown.means === null && unknown.meansMissing === true, 'an UNKNOWN code carries an HONEST absence (means:null + meansMissing), never a fabricated sentence', { means: unknown.means, meansMissing: unknown.meansMissing })

  const thrown = decorateThrownRefusal(Object.assign(new Error('closed'), { code: 'VMU_MEMBER_SESSION_NOT_LIVE', hint: legacy }))
  ok(thrown && typeof thrown.means === 'string' && thrown.means.length > 24 && typeof thrown.hintShort === 'string' && typeof thrown.hintFull === 'string',
    'a THROWN refusal is decorated too (the host copies own enumerable facts to the receipt)', { means: thrown && String(thrown.means).slice(0, 40) })
}

// ---- 5. the table is the ONLY sentence source: no per-call duplication needed --------------------------------------
console.log('=== 5. table invariants: distinct short/full per code, means explains the code rather than restating it ===')
{
  const entries = Object.entries(V5R_REFUSAL_MEANS)
  const shortEqFull = entries.filter(([, v]) => String(v.short).trim() === String(v.means).trim())
  ok(entries.length >= 40 && shortEqFull.length === 0, 'no short form merely restates the means (every form says something different)', shortEqFull.map(([k]) => k))
  const noReach = entries.filter(([, v]) => !String(v.reachable || '').trim())
  ok(noReach.length === 0, 'every code names a reachable alternative (REACHABLE INSTEAD is never dropped)', noReach.map(([k]) => k))
  const discovered = discoverRefusalCodes(readPackSources(join(REPO, 'vibe-math-vmu', 'packs', 'v5r')))
  const extra = [...discovered.keys()].filter((c) => !V5R_REFUSAL_MEANS[c])
  ok(extra.length === 0, 'every DISCOVERED code has a table entry (the table cannot go stale in the other direction)', extra)
}

console.log('=== REFUSAL MEANS' + (SELFTEST ? ' (--selftest)' : '') + ': ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
