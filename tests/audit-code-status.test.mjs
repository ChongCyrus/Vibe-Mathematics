// tests/audit-code-status.test.mjs — 03-§8.1 (the GENERATED per-code status report) must agree with the tree.
//
// Failure class this closes (independent reviewer, round 7, re-checked twice): the hand-written table did not
// distinguish 已实现 from 提案, so "the docs call a code 提案 while the runtime throws a DIFFERENT code" had no
// line a reader - or a gate - could check (`formal.js` / volume 09 were exactly that shape). §8.1 now carries
// ONE ROW PER HAND-REGISTERED CODE: `码 | 状态(已实现 ✓/提案 ⛔) | 在哪实现（文件）| 备注`.
//
// WHAT IS VERIFIED (both directions, recomputed here rather than trusted):
//   1. every hand-registered code has exactly one row, and no row names a code outside the hand table;
//   2. a row saying **已实现 ✓** must have >= 1 location, and EVERY named file must really contain that code;
//   3. a row saying **提案 ⛔** must have NO runtime occurrence (a proposal that the code throws is RED);
//   4. every 已实现 code appears in the hand-written table (and the reverse: every hand code is in the report);
//   5. the report sits inside the PLANNED-CODES markers (so it is generated, not hand-editable).
// Plus a DELIBERATELY-WRONG self-proof: mutated in-memory copies must make the checker red by name - a checker
// that cannot fail is decoration.
//
// SEAMS (same convention as the other audits): VMU_CONTRACT points at another contract copy, VMU_CODE_DIR at
// another runtime tree, so mutant families can prove this gate bites without touching the real files.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const CONTRACT = process.env.VMU_CONTRACT ? resolve(process.env.VMU_CONTRACT) : join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md')
const CODE_DIR = process.env.VMU_CODE_DIR ? resolve(process.env.VMU_CODE_DIR) : join(REPO, 'vibe-math-vmu')
const BEGIN = '<!-- PLANNED-CODES:BEGIN'
const END = '<!-- PLANNED-CODES:END -->'
const SECTION_81 = '### 8.1 实现状态一览'

let passed = 0, failed = 0
const ok = (cond, name, detail) => { if (cond) passed++; else { failed++; console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + detail)) } }

// ---------------------------------------------------------------------------------------------------------
// independent parsers (NOT imported from the generator: a parser bug there must not hide here)
// ---------------------------------------------------------------------------------------------------------

/** Codes in the first column of a hand-written table row, in the region BEFORE the generated block. */
export function parseHandCodes(text) {
  const head = text.indexOf(BEGIN) === -1 ? text : text.slice(0, text.indexOf(BEGIN))
  const out = new Set()
  for (const row of head.matchAll(/^\|\s*([^|]*)\|/gm)) {
    for (const m of row[1].matchAll(/`(VMU_[A-Z0-9_]+)`/g)) out.add(m[1])
  }
  return out
}

/** Rows of the generated §8.1 table: code -> { status, files[], note, line }. */
export function parseStatusRows(text) {
  const start = text.indexOf(SECTION_81)
  const end = text.indexOf(END)
  const rows = new Map()
  if (start === -1 || end === -1 || end < start) return rows
  const region = text.slice(start, end)
  for (const line of region.split('\n')) {
    const m = line.match(/^\|\s*`(VMU_[A-Z0-9_]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/)
    if (!m) continue
    const code = m[1]
    const statusText = m[2]
    const implemented = /已实现/.test(statusText)
    const proposed = /提案/.test(statusText)
    const files = [...m[3].matchAll(/`([^`]+)`/g)].map((x) => x[1].replace(/\\/g, '/')).filter((f) => f.includes('/') || f.endsWith('.js'))
    rows.set(code, { code, status: implemented && !proposed ? 'implemented' : proposed && !implemented ? 'proposal' : 'BAD-STATUS', files, note: m[4].trim(), line: line.trim() })
  }
  return rows
}

/** Runtime occurrences of the given codes, as `'CODE'` / "CODE" string literals: code -> Set(relative path). */
export function findRuntimeHits(codes, { codeDir = CODE_DIR, repo = REPO } = {}) {
  const files = []
  const walk = (d, n) => {
    if (n > 4 || !existsSync(d)) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', '.git', 'docs', 'settings'].includes(e.name)) continue
      const q = join(d, e.name)
      if (e.isDirectory()) walk(q, n + 1)
      else if (e.name.endsWith('.js')) files.push(q)
    }
  }
  walk(codeDir, 0)
  const hits = new Map()
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    const rel = relative(repo, f).split('\\').join('/')
    for (const c of codes) {
      if (!(text.includes("'" + c + "'") || text.includes('"' + c + '"'))) continue
      if (!hits.has(c)) hits.set(c, new Set())
      hits.get(c).add(rel)
    }
  }
  return hits
}

/** THE CHECKER (pure): report rows vs the tree. Returns named failures; an empty list means "agrees". */
export function evaluateCodeStatus({ handCodes, rows, hits }) {
  const failures = []
  for (const c of handCodes) if (!rows.has(c)) failures.push('MISSING-ROW: ' + c)
  for (const c of rows.keys()) if (!handCodes.has(c)) failures.push('EXTRA-ROW-NOT-IN-HAND-TABLE: ' + c)
  for (const [c, r] of rows) {
    const files = hits.get(c) || new Set()
    if (r.status === 'BAD-STATUS') { failures.push('STATUS-NOT-已实现/提案: ' + c + ' (' + r.line.slice(0, 60) + ')'); continue }
    if (r.status === 'implemented') {
      if (files.size === 0) failures.push('SAYS-IMPLEMENTED-BUT-CODE-NEVER-OCCURS: ' + c)
      if (r.files.length === 0) failures.push('IMPLEMENTED-WITHOUT-LOCATION: ' + c)
      for (const f of r.files) if (!files.has(f)) failures.push('LOCATION-DOES-NOT-CONTAIN-THE-CODE: ' + c + ' -> ' + f)
      if (!handCodes.has(c)) failures.push('IMPLEMENTED-NOT-IN-HAND-TABLE: ' + c)
    } else {
      if (files.size > 0) failures.push('SAYS-PROPOSAL-BUT-CODE-THROWS-IT: ' + c + ' (' + [...files].sort().join(', ') + ')')
      if (r.files.length > 0) failures.push('PROPOSAL-WITH-LOCATIONS: ' + c)
    }
  }
  return failures
}

// ---------------------------------------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------------------------------------
const text = readFileSync(CONTRACT, 'utf8')
const handCodes = parseHandCodes(text)
const rows = parseStatusRows(text)
const hits = findRuntimeHits(handCodes)
const implemented = [...rows].filter(([, r]) => r.status === 'implemented').map(([c]) => c)
const proposed = [...rows].filter(([, r]) => r.status === 'proposal').map(([c]) => c)

ok(text.includes(BEGIN) && text.includes(END), 'the PLANNED-CODES marker pair exists (the report is generated, not hand-editable)')
ok(text.includes(SECTION_81), 'the §8.1 status section exists')
ok(handCodes.size >= 100, 'the hand-written table was parsed (>= 100 registered codes)', String(handCodes.size))
ok(rows.size === handCodes.size, 'one §8.1 row per hand-registered code', 'rows=' + rows.size + ' hand=' + handCodes.size)
ok(rows.size > 0 && implemented.length + proposed.length === rows.size, 'every row carries exactly one of 已实现 ✓ / 提案 ⛔', 'implemented=' + implemented.length + ' proposal=' + proposed.length)
ok(implemented.length > 0 && proposed.length > 0, 'both states are present (the report is not trivially one-sided)', 'implemented=' + implemented.length + ' proposal=' + proposed.length)

const failures = evaluateCodeStatus({ handCodes, rows, hits })
ok(failures.length === 0, 'the §8.1 report agrees with the runtime code (both directions)', failures.slice(0, 3).join(' | '))

// the two directions the task names explicitly, as their own named assertions
ok(implemented.every((c) => handCodes.has(c)), 'every 已实现 code appears in the hand-written 03-§8 table')
ok([...handCodes].every((c) => rows.has(c)), 'reverse: every hand-written code appears in the report (implemented or proposal)')
const located = implemented.filter((c) => (rows.get(c).files || []).length > 0)
ok(located.length === implemented.length, 'every 已实现 code names at least one implementation file', 'located=' + located.length + '/' + implemented.length)

// ---------------------------------------------------------------------------------------------------------
// SELF-PROOF: deliberately wrong in-memory copies must go RED by name
// ---------------------------------------------------------------------------------------------------------
const clone = (m) => new Map([...m].map(([k, v]) => [k, Object.assign({}, v, { files: v.files.slice() })]))
const sampleImpl = implemented[0]
const sampleProp = proposed[0]
const selfProofs = [
  ['an implemented code flipped to 提案 while the runtime throws it', () => {
    const m = clone(rows); const r = m.get(sampleImpl); r.status = 'proposal'; r.files = []
    return evaluateCodeStatus({ handCodes, rows: m, hits })
  }, /SAYS-PROPOSAL-BUT-CODE-THROWS-IT/],
  ['a proposal flipped to 已实现 with a location that does not contain the code', () => {
    const m = clone(rows); const r = m.get(sampleProp); r.status = 'implemented'; r.files = ['kernel/this-file-does-not-contain-the-code.js']
    return evaluateCodeStatus({ handCodes, rows: m, hits })
  }, /SAYS-IMPLEMENTED-BUT-CODE-NEVER-OCCURS|LOCATION-DOES-NOT-CONTAIN-THE-CODE/],
  ['an 已实现 row with no location at all', () => {
    const m = clone(rows); m.get(sampleImpl).files = []
    return evaluateCodeStatus({ handCodes, rows: m, hits })
  }, /IMPLEMENTED-WITHOUT-LOCATION/],
  ['a dropped row (the report lost a registered code)', () => {
    const m = clone(rows); m.delete(sampleImpl)
    return evaluateCodeStatus({ handCodes, rows: m, hits })
  }, /MISSING-ROW/],
  ['an extra row for a code that is not in the hand-written table', () => {
    const m = clone(rows); m.set('VMU_GHOST_NOT_REGISTERED', { code: 'VMU_GHOST_NOT_REGISTERED', status: 'proposal', files: [], note: '', line: '' })
    return evaluateCodeStatus({ handCodes, rows: m, hits })
  }, /EXTRA-ROW-NOT-IN-HAND-TABLE/],
  ['a location file that exists but lacks the code', () => {
    const m = clone(rows)
    m.get(sampleImpl).files = ['kernel/budget.js']
    const wrong = evaluateCodeStatus({ handCodes, rows: m, hits })
    // only meaningful if the sample code really is NOT in that file
    return hits.get(sampleImpl) && !hits.get(sampleImpl).has('kernel/budget.js') ? wrong : null
  }, /LOCATION-DOES-NOT-CONTAIN-THE-CODE/],
]
for (const [label, run, expect] of selfProofs) {
  const res = run()
  if (res === null) { ok(true, 'self-proof skipped (the sample code is in the probe file)', label); continue }
  const named = res.find((f) => expect.test(f))
  ok(res.length > 0 && !!named, 'self-proof: ' + label + ' ⇒ RED by name', named || ('got ' + JSON.stringify(res.slice(0, 2))))
  console.log('self-proof red (' + res.length + ' failure(s)): ' + label + ' :: ' + (named || 'NO NAMED FAILURE'))
}
// and the checker must be GREEN on the untouched copy (so the self-proof reds come from the mutation, not the base)
ok(evaluateCodeStatus({ handCodes, rows: clone(rows), hits }).length === 0, 'control: the untouched report stays GREEN')

console.log('')
console.log('§8.1 rows=' + rows.size + ' (implemented=' + implemented.length + ', proposal=' + proposed.length + ')')
if (implemented.length) console.log('sample 已实现 row: ' + rows.get(implemented[0]).line.slice(0, 140))
if (proposed.length) console.log('sample 提案 row: ' + rows.get(proposed[0]).line.slice(0, 140))
console.log('=== VMU CODE STATUS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
