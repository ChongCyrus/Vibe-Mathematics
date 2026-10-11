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
    const m = line.match(/^\| `(vmu\.[a-z][a-zA-Z0-9]*)` \| \*{0,2}(\d+)\*{0,2} \| \*{0,2}(\d+)\*{0,2} \|/)
    if (m) out.push({ fam: m[1], total: Number(m[2]), wired: Number(m[3]) })
  }
  return out
}

const settingsText = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '04-settings.md'), 'utf8')
const volumeText = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '22-academic-operations.md'), 'utf8')
const start = volumeText.indexOf('### 0.1 逐族成熟度实测表')
const tableText = start < 0 ? '' : volumeText.slice(start, volumeText.indexOf('### 0.2', start) < 0 ? undefined : volumeText.indexOf('### 0.2', start))

const M = measured(settingsText)
const rows = claimed(tableText)

if (selftest) {
  const okNoRows = rows.length > 0
  const fabricated = claimed('| `vmu.demo` | 99 | 98 | x |')
  const caught = fabricated.length === 1 && (!M.has('vmu.demo') || M.get('vmu.demo').total !== 99)
  console.log('  selftest: rows found = ' + rows.length + ' -> ' + (okNoRows ? 'ok' : 'FAIL'))
  console.log('  selftest: a fabricated row is detectable -> ' + (caught ? 'ok' : 'FAIL'))
  process.exit(okNoRows && caught ? 0 : 1)
}

const drift = []
const missing = []
for (const r of rows) {
  const m = M.get(r.fam)
  if (!m) { missing.push(r.fam); continue }
  if (m.total !== r.total || m.wired !== r.wired) drift.push(r.fam + ': table says ' + r.wired + '/' + r.total + ', measured ' + m.wired + '/' + m.total)
}
if (!quiet) {
  console.log('  rows in the maturity table: ' + rows.length)
  console.log('  families not found in the settings table: ' + (missing.length ? missing.join(', ') : 'none'))
  for (const d of drift) console.log('  DRIFT ' + d)
}
console.log('=== MATURITY TABLE: ' + rows.length + ' row(s), ' + drift.length + ' drifted, ' + missing.length + ' unknown family ===')
process.exit(drift.length || missing.length ? 1 : 0)
