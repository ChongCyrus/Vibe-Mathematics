// tests/audit-maturity-table.mjs — does the measured maturity table in volume 22 still match the settings table?
//
// ROUND 272. Round 271 corrected four rows of that table and found they were wrong for two different reasons: four keys were wired two
// rounds earlier and the table was never updated, and five phantom service names left the registry and changed three denominators. A
// table that calls itself MEASURED has to be re-measured whenever keys are wired or registrations are corrected, and nothing enforced
// that. This probe does: it reads each row of §0.1 and compares its two numbers with the settings table, per family. The numbers are
// identifiers, not prose, which is what makes the check trustworthy - the same reason the cross-volume reference audit works.
//
// Strict by default (exit 1 on any drift). `--quiet` prints only the summary. `--selftest` proves the check cannot pass vacuously.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const quiet = process.argv.includes('--quiet')
const selftest = process.argv.includes('--selftest')

/** Wired and total counts per family, from the generated settings table (the same source the volume's rows should mirror). */
export function measured(docText) {
  const fams = new Map()
  for (const line of docText.split('\n')) {
    const m = line.match(/^\| `(vmu\.[a-z][a-zA-Z0-9]*)\.([a-zA-Z0-9_.]+)` \|/)
    if (!m) continue
    const fam = m[1]
    if (!fams.has(fam)) fams.set(fam, { total: 0, wired: 0 })
    const s = fams.get(fam)
    s.total += 1
    if (line.includes('✅ 已接线')) s.wired += 1
  }
  return fams
}

/** The rows of the maturity table: family, key count, wired count. */
export function claimed(tableText) {
  const out = []
  for (const line of tableText.split('\n')) {
    const m = line.match(/^\| `(vmu\.[a-z][a-zA-Z0-9]*)` \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \|([^|]*)\|([^|]*)\|/)
    if (m) out.push({ fam: m[1], total: Number(m[2]), wired: Number(m[3]), verdict: m[5].trim() })
  }
  return out
}

/**
 * ROUND 273: the VERDICT must agree with the numbers. A row claiming "fully wired" while its counts disagree, or "genuine gap" while
 * keys are wired, is the same class of defect as a receipt field that misreports - right data, wrong claim. The table uses exactly three
 * verdict shapes, so the rule is mechanical:
 *   · 已接线   -> wired === total
 *   · 部分     -> 0 < wired < total
 *   · 真实缺口 -> wired === 0
 */
export function verdictOf(row) {
  const v = row.verdict
  if (v.includes('真实缺口')) return row.wired === 0 ? null : 'says 真实缺口 but ' + row.wired + ' key(s) are wired'
  if (v.includes('部分')) return row.wired > 0 && row.wired < row.total ? null : 'says 部分 but the counts are ' + row.wired + '/' + row.total
  if (v.includes('已接线')) return row.wired === row.total ? null : 'says 已接线 but the counts are ' + row.wired + '/' + row.total
  return 'no recognisable verdict: ' + JSON.stringify(v).slice(0, 60)
}

const settingsText = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '04-settings.md'), 'utf8')
const volumeText = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '22-academic-operations.md'), 'utf8')
const start = volumeText.indexOf('### 0.1 逐族成熟度实测表')
const tableText = start < 0 ? '' : volumeText.slice(start, volumeText.indexOf('### 0.2', start) < 0 ? undefined : volumeText.indexOf('### 0.2', start))

const M = measured(settingsText)
const rows = claimed(tableText)

if (selftest) {
  const okNoRows = rows.length > 0
  // The fabricated row must have the SAME five-cell shape the parser now requires, or the fixture itself goes stale (this selftest caught
  // exactly that when the verdict cell was added).
  const fabricated = claimed('| `vmu.demo` | 99 | 98 | x | ★ **已接线 ✓** |')
  const caught = fabricated.length === 1 && (!M.has('vmu.demo') || M.get('vmu.demo').total !== 99)
  // ROUND 273: the verdict rule must also be provably non-vacuous - a row whose numbers are right but whose claim is wrong must be caught.
  const wrongClaim = verdictOf({ fam: 'vmu.x', total: 9, wired: 7, verdict: '★ **已接线 ✓**' })
  const rightClaim = verdictOf({ fam: 'vmu.x', total: 9, wired: 7, verdict: '⚠️ **部分**' })
  const gapClaim = verdictOf({ fam: 'vmu.x', total: 4, wired: 0, verdict: '✗ **真实缺口**' })
  const verdictRule = wrongClaim !== null && rightClaim === null && gapClaim === null
  console.log('  selftest: rows found = ' + rows.length + ' -> ' + (okNoRows ? 'ok' : 'FAIL'))
  console.log('  selftest: a fabricated row is detectable -> ' + (caught ? 'ok' : 'FAIL'))
  console.log('  selftest: a wrong verdict with right numbers is caught -> ' + (verdictRule ? 'ok' : 'FAIL'))
  process.exit(okNoRows && caught && verdictRule ? 0 : 1)
}

const drift = []
const missing = []
const misclaimed = []
for (const r of rows) {
  const bad = verdictOf(r)
  if (bad) misclaimed.push(r.fam + ': ' + bad)
  const m = M.get(r.fam)
  if (!m) { missing.push(r.fam); continue }
  if (m.total !== r.total || m.wired !== r.wired) drift.push(r.fam + ': table says ' + r.wired + '/' + r.total + ', measured ' + m.wired + '/' + m.total)
}
if (!quiet) {
  console.log('  rows in the maturity table: ' + rows.length)
  console.log('  families not found in the settings table: ' + (missing.length ? missing.join(', ') : 'none'))
  for (const d of drift) console.log('  DRIFT ' + d)
  for (const c of misclaimed) console.log('  MISCLAIM ' + c)
}
console.log('=== MATURITY TABLE: ' + rows.length + ' row(s), ' + drift.length + ' drifted, ' + misclaimed.length + ' misclaimed, ' + missing.length + ' unknown family ===')
process.exit(drift.length || misclaimed.length || missing.length ? 1 : 0)
