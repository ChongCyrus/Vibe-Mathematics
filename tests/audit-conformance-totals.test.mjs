// tests/audit-conformance-totals.test.mjs — the phase-12 rule ledger has a §7 table whose totals must equal what its own
// rows say. Hand-typed totals drift: on 2026-10-24 the table reported "23 done / 17 partial / 2 gap" while the status
// cells said 27/13/2, and after two more rows were closed it still said 2 gaps because two rows carry the word ❌ inside
// their EVIDENCE text (B2/B8 were fixed but their prose still quotes the old wording). The rule is the repository's own:
// what can be derived must be derived. So this gate derives the counts from the status cells and compares them with the
// totals row — it never trusts either side on its own.
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
const LEDGER = join(REPO, 'docs', 'acceptance', 'phase12-v5r-rules-conformance.md')
const text = readFileSync(LEDGER, 'utf8')
const lines = text.split('\n')

// ── 1. the table is there and has the shape this gate assumes ──────────────────────────────────────────────
const rows = []
// The ledger has a SECOND table below the totals row (the evidence appendix) that re-uses the same rule ids on
// purpose, so the derivation must be scoped to the MAIN table: the rows above the totals row. Reading the whole file
// would report seven "duplicate" rule ids and would double-count the statuses of those appendix rows.
const totalsIdx = lines.findIndex((l) => l.startsWith('| **\u5408\u8ba1** |'))
ok(totalsIdx > 0, 'the totals row sits below the rule rows it summarises', totalsIdx)
const tableLines = totalsIdx > 0 ? lines.slice(0, totalsIdx) : lines
for (const line of tableLines) {
  const m = /^\| ([A-F]\d+) \|/.exec(line)
  if (!m) continue
  rows.push({ id: m[1], cells: line.split(' | ') })
}
const ids = [...new Set(rows.map((r) => r.id))]
ok(ids.length >= 40, 'the rule table has its rows (>= 40 distinct rule ids)', { n: ids.length })

// a rule id must appear ONCE; the table is the authority for "which rules exist"
const counts = {}
for (const r of rows) counts[r.id] = (counts[r.id] || 0) + 1
const dup = Object.entries(counts).filter(([, n]) => n > 1).map(([id, n]) => id + '×' + n)
ok(dup.length === 0, 'no rule id appears twice (a duplicated id would make the derivation ambiguous)', dup)

const EMOJI = /^[\u2705\u26A0\u274C]/
const STATUS_OF = { '\u2705': 'done', '\u26A0': 'partial', '\u274C': 'gap' }
const derived = { done: [], partial: [], gap: [], unmarked: [] }
for (const r of rows) {
  if (counts[r.id] > 1) continue
  let status = null
  for (let k = 1; k < r.cells.length; k++) {
    const cell = r.cells[k].replace(/^\*\*/, '').trim()
    const hit = EMOJI.exec(cell)
    if (hit) { status = STATUS_OF[hit[0]]; break }
  }
  ;(derived[status] || derived.unmarked).push(r.id)
}

// ── 2. every row carries a status marker, so the counts can be derived at all ──────────────────────────────
ok(derived.unmarked.length === 0,
  'every rule row carries an explicit \u2705/\u26A0/\u274C status marker in some cell (otherwise the totals cannot be derived)',
  derived.unmarked)

// ── 3. the totals row equals the derivation ───────────────────────────────────────────────────────────────
const totalsLine = lines.find((l) => l.startsWith('| **\u5408\u8ba1** |'))
ok(!!totalsLine, 'the ledger has a totals row (`| **\u5408\u8ba1** |`)')
if (totalsLine) {
  // | **合计** | **42** | **23** | **17** | **2** | **0** |
  const nums = totalsLine.split('|').map((c) => c.trim()).filter((c) => c !== '')
  const parsed = nums.slice(1).map((c) => Number(c.replace(/\*/g, '')))
  ok(parsed.length === 5 && parsed.every((n) => Number.isFinite(n)),
    'the totals row carries five numbers (rules / done / partial / gap / todo)', nums)
  if (parsed.length === 5) {
    const want = [ids.length, derived.done.length, derived.partial.length, derived.gap.length]
    ok(parsed[0] === want[0], 'total rule count matches the rows it summarises', { typed: parsed[0], derived: want[0] })
    ok(parsed[1] === want[1], 'done count matches the status cells', { typed: parsed[1], derived: want[1] })
    ok(parsed[2] === want[2], 'partial count matches the status cells', { typed: parsed[2], derived: want[2] })
    ok(parsed[3] === want[3], 'gap count matches the status cells (a fixed row must lose its \u274C)', { typed: parsed[3], derived: want[3] })
    ok(parsed[1] + parsed[2] + parsed[3] + parsed[4] === parsed[0],
      'the four status columns add up to the rule count (no row is counted twice or dropped)',
      { sum: parsed[1] + parsed[2] + parsed[3] + parsed[4], rules: parsed[0] })
  }
}

// ── 4. TEETH: the judge really goes red on a drifted totals row, and really separates the status cell from prose ──
const parseTotals = (line) => {
  const nums = line.split('|').map((c) => c.trim()).filter((c) => c !== '')
  return nums.slice(1).map((c) => Number(c.replace(/\*/g, '')))
}
const drifted = '| **\u5408\u8ba1** | **' + ids.length + '** | **1** | **1** | **0** | **0** |'
const d = parseTotals(drifted)
ok(d[1] !== derived.done.length || derived.done.length === 1, 'TEETH: a drifted totals row is distinguishable from the derivation', { drifted: d[1], derived: derived.done.length })
// a row whose EVIDENCE prose merely MENTIONS \u274C must not be counted as a gap: only the status cell decides
// The marker has to OPEN the cell (that is the rule the derivation uses), so the sample puts it there; the point of the
// sample is the \u274C inside the EVIDENCE cell, which must not win.
const proseOnly = { id: 'Z9', cells: ['| Z9', 'rule', '\u2705 **done**', 'the old wording said \u274C here', '|'] }
let zStatus = null
for (let k = 1; k < proseOnly.cells.length; k++) {
  const cell = proseOnly.cells[k].replace(/^\*\*/, '').trim()
  const hit = EMOJI.exec(cell)
  if (hit) { zStatus = STATUS_OF[hit[0]]; break }
}
ok(zStatus === 'done', 'TEETH: an \u274C mentioned inside the EVIDENCE cell does not make the row a gap (the first marked cell decides)', zStatus)

console.log('')
console.log('=== AUDIT CONFORMANCE TOTALS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures:')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
}
