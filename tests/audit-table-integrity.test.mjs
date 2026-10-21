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
// WHAT THIS RULE IS FOR, AND WHAT IT MUST NOT FLAG. The harm is concrete: a table whose rows are separated by a blank
// line, because a scanner that reads a table BLOCK stops at the blank and everything after it becomes invisible. A
// blank line between TWO tables is a different thing entirely - markdown needs it, and the following block is a
// self-contained table that a scanner sees in full. The first version could not tell those apart, and it fired on the
// second kind the moment a repository-root docs directory joined the tracked set: an acceptance report where a
// summary table follows the readings table directly, with no heading in between. The exemption is therefore stated as
// a fact about the FOLLOWING BLOCK rather than as a list of files or directories - a blank line counts as a break only
// when what follows is not a new table, i.e. not a header row followed by a delimiter row.
const isDelimiterRow = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line) && /-/.test(line)
const startsNewTable = (L, i) => /^\s*\|/.test(L[i]) && L[i + 1] !== undefined && isDelimiterRow(L[i + 1])
// SELF-PROOF: the two shapes must be told apart by that predicate BEFORE its silence is allowed to mean anything.
ok(startsNewTable(['| a | b |', '|---|---|', '| 1 | 2 |'], 0) === true &&
  startsNewTable(['| 1 | 2 |', '', '| 3 | 4 |'], 0) === false,
  'the predicate calls a header+delimiter pair a new table and an orphaned row a split, so the exemption cannot swallow the harm it exists to catch',
  { newTable: startsNewTable(['| a | b |', '|---|---|'], 0), orphaned: startsNewTable(['| 1 | 2 |', '', '| 3 | 4 |'], 0) })
const breaks = []
let breaksExempted = 0
let rows = 0
for (const f of files) {
  let L
  try { L = readFileSync(join(REPO, f), 'utf8').split('\n') } catch { continue }
  for (let i = 0; i < L.length; i++) {
    if (!/^\s*\|/.test(L[i])) continue
    rows += 1
    if (L[i + 1] !== undefined && L[i + 1].trim() === '' && L[i + 2] !== undefined && /^\s*\|/.test(L[i + 2])) {
      if (startsNewTable(L, i + 2)) { breaksExempted += 1; continue }
      breaks.push(f + ':' + (i + 1))
    }
  }
}
ok(rows > 5000, 'the scan really covered the tables, so a clean result is not an empty scan', { rows })
ok(breaks.length === 0,
  'and no table is split by a blank line, because every row after such a line is invisible to a scanner',
  { breaks: breaks.slice(0, 10), breaksExempted })

console.log('=== EVERY ROW IN A TABLE HAS AS MANY CELLS AS ITS HEADER ===')
// ROUND 601: the acceptance summary in docs/00 had five structural defects the blank-line rule cannot see - a two-cell row under a
// three-column header, duplicated rows, and rows with a fourth cell. Markdown renders those unpredictably, and the page in question is
// the one a reader uses to decide whether the project demonstrates what it claims. Scoped to vibe-math-vmu/docs on purpose: a
// repo-wide count finds two hundred and ten offending lines, almost all in other projects' archives, so a repo-wide gate would be
// noise. This is a gate, not a report, because a row whose cell count differs from its header is always wrong.
const cellCount = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').length
// SELF-PROOF (11.aj): the counter must measure a known-good row before its silence means anything.
ok(cellCount('| a | b | c |') === 3 && cellCount('| a | b |') === 2 && cellCount('| a | b | c | d |') === 4,
  'the cell counter reads a three-, two- and four-cell row correctly, so a clean result is not a counter that always answers the same',
  { three: cellCount('| a | b | c |'), two: cellCount('| a | b |'), four: cellCount('| a | b | c | d |') })
const scoped = files.filter((f) => f.startsWith('vibe-math-vmu/'))
ok(scoped.length >= 15, 'the scoped set is the vmu documentation, and it is not empty', { n: scoped.length })
const mismatched = []
let scopedRows = 0
for (const f of scoped) {
  let L
  try { L = readFileSync(join(REPO, f), 'utf8').split('\n') } catch { continue }
  let i = 0
  while (i < L.length) {
    if (!/^\s*\|/.test(L[i])) { i++; continue }
    const start = i
    while (i < L.length && /^\s*\|/.test(L[i])) i++
    const block = L.slice(start, i)
    if (block.length < 3) continue
    const want = cellCount(block[0])
    for (let j = 2; j < block.length; j++) {
      scopedRows += 1
      const got = cellCount(block[j])
      if (got !== want) mismatched.push(f + ':' + (start + j + 1) + ' header=' + want + ' row=' + got)
    }
  }
}
ok(scopedRows > 500, 'the scoped scan really covered the vmu tables', { scopedRows })
// REPORT, NOT A GATE. The rule finds real defects - two rows in docs/00 with a missing cell, alongside five in the acceptance summary
// that were fixed the same round - but it also flags rows whose CELL CONTENT legitimately contains a pipe, which it cannot tell apart
// from a short row. 11.aj says a structural check must err toward false alarms, and 11.am says a criterion with false positives is a
// report rather than a verdict, so this prints its count and a sample instead of failing the gate. The blank-line rule above stays a
// hard gate because that one is unambiguous.
console.log('  column-count mismatches in the vmu set: ' + mismatched.length + ' of ' + scopedRows + ' rows')
for (const m of mismatched.slice(0, 12)) console.log('      ' + m)
// ★ REMOVED `ok(true, 'reported rather than gated...')`. It described itself honestly, but it still added a
// passing assertion that could never fail, which inflates the count without checking anything. The report above
// (the row count and the first twelve mismatches) is the output; there is no assertion here to make, so there is
// none. If this ever becomes gateable, it becomes a real ok(...) rather than a literal true.

console.log('=== TABLE INTEGRITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
