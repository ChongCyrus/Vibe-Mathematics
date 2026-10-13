// tests/audit-table-integrity.test.mjs — a blank line between two table rows truncates the table, and every row after it becomes
// invisible to any scanner. Round 556 found one by hand in the interface contract and round 557 found nine across eight volumes.
// Unlike the stale-marker report this is unambiguous - a blank line inside a table is always wrong - so it FAILS rather than
// reporting, and nothing can be lost by removing one.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = execFileSync('git', ['-c', 'core.quotePath=false', 'ls-files', '*.md'], { cwd: REPO, encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter(Boolean).map((s) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s))

console.log('=== EVERY MARKDOWN FILE IS SCANNED ===')
ok(files.length >= 100, 'the markdown set is walked', { n: files.length })
const breaks = []
let rows = 0
for (const f of files) {
  let L
  try { L = readFileSync(join(REPO, f), 'utf8').split('\n') } catch { continue }
  for (let i = 0; i < L.length; i++) {
    if (!/^\s*\|/.test(L[i])) continue
    rows += 1
    if (L[i + 1] !== undefined && L[i + 1].trim() === '' && L[i + 2] !== undefined && /^\s*\|/.test(L[i + 2])) {
      breaks.push(f + ':' + (i + 1))
    }
  }
}
ok(rows > 5000, 'the scan really covered the tables, so a clean result is not an empty scan', { rows })
ok(breaks.length === 0,
  'and no table is split by a blank line, because every row after such a line is invisible to a scanner', { breaks: breaks.slice(0, 10) })

console.log('=== TABLE INTEGRITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
