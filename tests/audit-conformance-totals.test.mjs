// tests/audit-conformance-totals.test.mjs — the phase-12 rule ledger has a §7 table whose totals must equal what its own
// rows say. Hand-typed totals drift: on 2026-10-24 the table reported "23 done / 17 partial / 2 gap" while the status
// cells said 27/13/2, and after two more rows were closed it still said 2 gaps because two rows carry the word ❌ inside
// their EVIDENCE text (B2/B8 were fixed but their prose still quotes the old wording). The rule is the repository's own:
// what can be derived must be derived. So this gate derives the counts from the status cells and compares them with the
// totals row — it never trusts either side on its own.
//
// ── SELF-PROOF (`--selftest`) ──────────────────────────────────────────────────────────────────────────────
// This is a SCANNER: "<n> findings" from a broken predicate looks exactly like a clean ledger. So the derivation is a
// pure function of the ledger TEXT, and the self-test feeds it two fixtures it constructs itself: a consistent table
// (must be judged consistent) and the same table with ONE cell flipped (must be judged drifted). It also proves the two
// failure modes this gate exists for: totals that disagree with the cells, and a ❌ that appears only inside EVIDENCE
// prose. Without that pair the gate would pass on an empty table.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const LEDGER = join(REPO, 'docs', 'acceptance', 'phase12-v5r-rules-conformance.md')

const EMOJI = /^[\u2705\u26A0\u274C]/
const STATUS_OF = { '\u2705': 'done', '\u26A0': 'partial', '\u274C': 'gap' }

/** Derive the status counts from the ledger text. Pure: the same text always yields the same judgement. */
export function parseLedger(text) {
  const lines = text.split('\n')
  const totalsIdx = lines.findIndex((l) => l.startsWith('| **\u5408\u8ba1** |'))
  // The ledger has a SECOND table below the totals row (the evidence appendix) that re-uses the same rule ids on
  // purpose, so the derivation must be scoped to the MAIN table: the rows above the totals row. Reading the whole file
  // would report seven "duplicate" rule ids and would double-count the statuses of those appendix rows.
  const tableLines = totalsIdx > 0 ? lines.slice(0, totalsIdx) : lines
  const rows = []
  for (const line of tableLines) {
    const m = /^\| ([A-F]\d+) \|/.exec(line)
    if (!m) continue
    rows.push({ id: m[1], cells: line.split(' | ') })
  }
  const ids = [...new Set(rows.map((r) => r.id))]
  const counts = {}
  for (const r of rows) counts[r.id] = (counts[r.id] || 0) + 1
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
  const totalsLine = totalsIdx > 0 ? lines[totalsIdx] : null
  const totals = totalsLine === null ? null : totalsLine.split('|').map((c) => c.trim()).filter((c) => c !== '').slice(1).map((c) => Number(c.replace(/\*/g, '')))
  return { totalsIdx, rows, ids, duplicateIds: Object.entries(counts).filter(([, n]) => n > 1).map(([id, n]) => id + '×' + n), derived, totalsLine, totals }
}

/** The judgement that matters: do the typed totals equal what the cells say, and do the columns add up? */
export function judge(text) {
  const p = parseLedger(text)
  const problems = []
  if (p.totalsIdx <= 0) problems.push('no totals row')
  if (p.ids.length === 0) problems.push('no rule rows')
  if (p.duplicateIds.length > 0) problems.push('duplicate rule ids: ' + p.duplicateIds.join(','))
  if (p.derived.unmarked.length > 0) problems.push('unmarked rows: ' + p.derived.unmarked.join(','))
  if (p.totals) {
    const want = [p.ids.length, p.derived.done.length, p.derived.partial.length, p.derived.gap.length]
    if (p.totals.length !== 5) problems.push('totals row does not carry five numbers')
    else {
      if (p.totals[0] !== want[0]) problems.push('rules ' + p.totals[0] + ' != ' + want[0])
      if (p.totals[1] !== want[1]) problems.push('done ' + p.totals[1] + ' != ' + want[1])
      if (p.totals[2] !== want[2]) problems.push('partial ' + p.totals[2] + ' != ' + want[2])
      if (p.totals[3] !== want[3]) problems.push('gap ' + p.totals[3] + ' != ' + want[3])
      if (p.totals[1] + p.totals[2] + p.totals[3] + p.totals[4] !== p.totals[0]) problems.push('columns do not add up')
    }
  }
  return { ok: problems.length === 0, problems, parsed: p }
}

// ── SELF-TEST: two fixtures the gate builds itself, so a dead predicate cannot read as a clean ledger ──────
if (process.argv.slice(2).includes('--selftest')) {
  const head = '| 规则 | 内容 | 状态 |\n| --- | --- | --- |\n'
  const consistent = head
    + '| A1 | rule one | \u2705 **done** |\n'
    + '| A2 | rule two | \u26A0 **partial** — the old wording said \u274C here |\n'
    + '| A3 | rule three | \u274C **gap** |\n'
    + '| **\u5408\u8ba1** | **3** | **1** | **1** | **1** | **0** |\n'
  const drifted = head
    + '| A1 | rule one | \u2705 **done** |\n'
    + '| A2 | rule two | \u26A0 **partial** — the old wording said \u274C here |\n'
    + '| A3 | rule three | \u2705 **done** |\n' // flipped: the typed totals below now over-report one gap
    + '| **\u5408\u8ba1** | **3** | **1** | **1** | **1** | **0** |\n'
  const cases = [
    ['a CONSISTENT table is judged consistent', () => judge(consistent).ok === true, JSON.stringify(judge(consistent).problems)],
    ['a ❌ inside EVIDENCE prose does not make the row a gap', () => judge(consistent).parsed.derived.gap.length === 1, JSON.stringify(judge(consistent).parsed.derived)],
    ['FLIPPING ONE CELL reddens the gate', () => judge(drifted).ok === false, JSON.stringify(judge(drifted).problems)],
    ['and it says WHICH count drifted rather than "totals wrong"', () => judge(drifted).problems.some((p) => /^gap /.test(p)), JSON.stringify(judge(drifted).problems)],
    ['an EMPTY table is refused instead of passing vacuously', () => judge(head).ok === false, JSON.stringify(judge(head).problems)],
    ['a MISSING totals row is refused', () => judge(head + '| A1 | x | \u2705 **done** |\n').ok === false, 'no totals row'],
  ]
  let bad = 0
  for (const [label, fn, detail] of cases) {
    const got = (() => { try { return fn() } catch (e) { return 'threw: ' + e.message } })()
    if (got !== true) { bad++; console.log('SELFTEST FAIL ' + label + ' - ' + detail) } else console.log('SELFTEST ok   ' + label)
  }
  console.log('SELFTEST ' + (bad === 0 ? 'PASS' : 'FAIL (' + bad + ')'))
  process.exit(bad === 0 ? 0 : 1)
}

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const text = readFileSync(LEDGER, 'utf8')
const P = parseLedger(text)
const { rows, ids, derived, totalsLine, totals } = P

// ── 1. the table is there and has the shape this gate assumes ──────────────────────────────────────────────
ok(P.totalsIdx > 0, 'the totals row sits below the rule rows it summarises', P.totalsIdx)
ok(ids.length >= 40, 'the rule table has its rows (>= 40 distinct rule ids)', { n: ids.length })

// a rule id must appear ONCE; the table is the authority for "which rules exist"
ok(P.duplicateIds.length === 0, 'no rule id appears twice (a duplicated id would make the derivation ambiguous)', P.duplicateIds)

// ── 2. every row carries a status marker, so the counts can be derived at all ──────────────────────────────
ok(derived.unmarked.length === 0,
  'every rule row carries an explicit \u2705/\u26A0/\u274C status marker in some cell (otherwise the totals cannot be derived)',
  derived.unmarked)

// ── 3. the totals row equals the derivation ───────────────────────────────────────────────────────────────
ok(!!totalsLine, 'the ledger has a totals row (`| **\u5408\u8ba1** |`)')
if (totalsLine) {
  // | **合计** | **42** | **23** | **17** | **2** | **0** |
  ok(totals.length === 5 && totals.every((n) => Number.isFinite(n)),
    'the totals row carries five numbers (rules / done / partial / gap / todo)', totals)
  if (totals.length === 5) {
    const want = [ids.length, derived.done.length, derived.partial.length, derived.gap.length]
    ok(totals[0] === want[0], 'total rule count matches the rows it summarises', { typed: totals[0], derived: want[0] })
    ok(totals[1] === want[1], 'done count matches the status cells', { typed: totals[1], derived: want[1] })
    ok(totals[2] === want[2], 'partial count matches the status cells', { typed: totals[2], derived: want[2] })
    ok(totals[3] === want[3], 'gap count matches the status cells (a fixed row must lose its \u274C)', { typed: totals[3], derived: want[3] })
    ok(totals[1] + totals[2] + totals[3] + totals[4] === totals[0],
      'the four status columns add up to the rule count (no row is counted twice or dropped)',
      { sum: totals[1] + totals[2] + totals[3] + totals[4], rules: totals[0] })
  }
}

// ── 4. TEETH: the same judge really goes red on a drifted totals row, and really separates the status cell from prose ──
const driftedLine = '| **\u5408\u8ba1** | **' + ids.length + '** | **1** | **1** | **0** | **0** |'
const driftedText = text.replace(totalsLine, driftedLine)
ok(judge(driftedText).ok === false,
  'TEETH: with the real ledger\'s totals row replaced by a drifted one, the judge goes RED (it is measuring, not echoing)',
  judge(driftedText).problems.slice(0, 3))
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
