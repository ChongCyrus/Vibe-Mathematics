// tests/audit-macro-rules.test.mjs — TB-2795: the macro-rules matrix verifier is a GATE, and this suite proves it can go RED.
//
// The verifier (`scripts/audit-macro-rules.mjs`) is in `regen-all` (step 19, `--strict-real`). This suite pins its four
// contract checks on the REAL matrix and proves each is a real guard by mutating a COPY of the matrix (never the real
// file — audit10-lane owns the matrix's judgment content):
//   · sentence conservation  : one row per sentence, same ids (a dropped row ⇒ SENTENCE_COUNT_MISMATCH / ROW_MISSING)
//   · id uniqueness          : uniqueIds === rows (a duplicated id ⇒ ROW_EXTRA/ROW_MISSING, never silently merged)
//   · evidence non-empty     : a blank evidence cell ⇒ EVIDENCE_EMPTY
//   · CONFORMS needs behaviour evidence : docs-only CONFORMS ⇒ CONFORMS_WITHOUT_BEHAVIOUR_EVIDENCE
// The reverse lamp is the first mutation (drop one row): it MUST redden, or the verifier is decoration.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// ★ audit-scanner-selfproof (final33): this file IS a scanner-suite (it derives rows/sentences from the matrix and
// drives the real verifier), so it must be able to prove it can FIND something:
//   ① REALLY-RAN : section 1 runs the real verifier over the real matrix and asserts its machine report is non-null
//                   (a dead import or a silent exit 0 would fail `report !== null` / `ok === true`).
//   ② LAMPS      : sections 2-5 are four COPY-TREE negative controls (drop a row ⇒ SENTENCE_COUNT_MISMATCH;
//                   duplicate an id ⇒ ROW_EXTRA/ROW_MISSING; blank evidence ⇒ EVIDENCE_EMPTY; docs-only CONFORMS
//                   ⇒ CONFORMS_WITHOUT_BEHAVIOUR_EVIDENCE) — each mutation MUST redden the verifier by name.
//   ③ RUNNABLE SELF-PROOF: `node tests/audit-macro-rules.test.mjs --selftest` runs the SAME suite (lamps included)
//                   and exits 0, which is the runnable proof `audit-scanner-selfproof` looks for.
const SELFTEST = process.argv.includes('--selftest')

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SCRIPT = join(REPO, 'scripts', 'audit-macro-rules.mjs')
const MATRIX = join(REPO, 'docs', 'acceptance', 'macro-rules-conformance-matrix.md')
const RULE_SRC = join(REPO, 'docs', 'acceptance', 'macro-rules-source.md')

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

const cellsOf = (line) => {
  const cells = []
  let cur = ''
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '\\' && line[i + 1] === '|') { cur += '\\|'; i += 1; continue }
    if (ch === '|') { cells.push(cur); cur = ''; continue }
    cur += ch
  }
  cells.push(cur)
  return cells
}
const rowLinesOf = (text) => text.split('\n').filter((l) => /^\|\s*`[A-Z]+\.[0-9]+`\s*\|/.test(l))
const simpleRowLinesOf = (text) => rowLinesOf(text).filter((l) => !l.includes('\\|'))

/** Run the verifier against a TREE (script + matrix copied there); the rule doc is the vendored source, via env. */
const runInTree = (tree) => {
  const env = Object.assign({}, process.env, { MACRO_RULES_DOC: RULE_SRC })
  const r = spawnSync(process.execPath, [join(tree, 'scripts', 'audit-macro-rules.mjs'), '--check', '--json'], { cwd: tree, encoding: 'utf8', env, maxBuffer: 1 << 26 })
  let parsed = null
  try { parsed = JSON.parse(String(r.stdout || '').trim()) } catch { parsed = null }
  return { status: r.status, out: String(r.stdout || '') + String(r.stderr || ''), report: parsed }
}

const makeTree = () => {
  const dir = mkdtempSync(join(tmpdir(), 'macro-rules-'))
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  mkdirSync(join(dir, 'docs', 'acceptance'), { recursive: true })
  copyFileSync(SCRIPT, join(dir, 'scripts', 'audit-macro-rules.mjs'))
  copyFileSync(MATRIX, join(dir, 'docs', 'acceptance', 'macro-rules-conformance-matrix.md'))
  return dir
}
const withTree = (mutate, fn) => {
  const dir = makeTree()
  try {
    const matrixPath = join(dir, 'docs', 'acceptance', 'macro-rules-conformance-matrix.md')
    const text = readFileSync(matrixPath, 'utf8')
    writeFileSync(matrixPath, mutate(text))
    return fn(dir)
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }) }
}
const codesOf = (report) => ((report && Array.isArray(report.problems)) ? report.problems.map((p) => p.code) : [])

// ---- 1. THE REAL MATRIX: the verifier is GREEN and its counts are the matrix's own --------------------------------
console.log('=== 1. real matrix: sentence conservation / unique ids / evidence floors ===')
{
  const real = runInTree(REPO)
  ok(real.report !== null, 'the verifier emits a machine-readable report (non-vacuous run)', real.out.slice(-300))
  ok(real.status === 0 && real.report && real.report.ok === true, 'the real matrix passes --check (the closing gate is green)', codesOf(real.report))
  const matrixText = readFileSync(MATRIX, 'utf8')
  const rows = rowLinesOf(matrixText)
  ok(rows.length > 50, 'the matrix really carries the macro-rule rows (non-vacuous: ' + rows.length + ' rows)', rows.length)
  ok(real.report && real.report.sentences === rows.length && real.report.rows === rows.length,
    'SENTENCE CONSERVATION: rows === sentences (a splitter/row drift is a named failure, not a silent count)', { sentences: real.report && real.report.sentences, rows: real.report && real.report.rows })
  ok(real.report && real.report.uniqueIds === real.report.rows,
    'ID UNIQUENESS: uniqueIds === rows (a duplicated id would make one sentence disappear behind another)', { uniqueIds: real.report && real.report.uniqueIds, rows: real.report && real.report.rows })
  const emptyEvidence = cellsOf(rows[0]).slice(1)
  ok(emptyEvidence.length >= 6, 'the row shape really has the documented six cells (non-vacuous cell parse)', emptyEvidence.length)
}

// ---- 2. REVERSE LAMP: dropping ONE row must redden by name (the verifier is not decoration) ----------------------
console.log('=== 2. lamp: one dropped row ⇒ sentence conservation goes RED ===')
{
  const res = withTree((text) => {
    const lines = text.split('\n')
    let dropped = false
    const kept = []
    for (const line of lines) {
      if (!dropped && /^\|\s*`[A-Z]+\.[0-9]+`\s*\|/.test(line)) { dropped = true; continue }
      kept.push(line)
    }
    return kept.join('\n')
  }, (dir) => runInTree(dir))
  const codes = codesOf(res.report)
  ok(res.status !== 0 && res.report && res.report.ok === false, 'the mutated tree FAILS (the reverse lamp reddens)', { status: res.status, ok: res.report && res.report.ok })
  ok(codes.includes('SENTENCE_COUNT_MISMATCH') || codes.includes('ROW_MISSING'),
    '…and it says WHY: SENTENCE_COUNT_MISMATCH / ROW_MISSING (one row per sentence is enforced)', codes.slice(0, 4))
}

// ---- 3. LAMP: a duplicated id is caught (ids cannot collapse two sentences) --------------------------------------
console.log('=== 3. lamp: duplicated id ⇒ ROW_EXTRA/ROW_MISSING, never a silent merge ===')
{
  const res = withTree((text) => {
    const lines = text.split('\n')
    const rows = rowLinesOf(text)
    const dup = rows[1]
    const dupId = /`([A-Z]+\.[0-9]+)`/.exec(dup)[1]
    const first = rows[0]
    const firstId = /`([A-Z]+\.[0-9]+)`/.exec(first)[1]
    const out = []
    let replaced = false
    for (const line of lines) {
      if (!replaced && line === dup) { out.push(line.replace('`' + dupId + '`', '`' + firstId + '`')); replaced = true; continue }
      out.push(line)
    }
    return out.join('\n')
  }, (dir) => runInTree(dir))
  const codes = codesOf(res.report)
  ok(res.report && res.report.uniqueIds < res.report.rows && (codes.includes('ROW_EXTRA') || codes.includes('ROW_MISSING')),
    'a duplicated id makes uniqueIds < rows AND is reported by name (no silent merge)', { uniqueIds: res.report && res.report.uniqueIds, rows: res.report && res.report.rows, codes })
}

// ---- 4. LAMP: a BLANK evidence cell is EVIDENCE_EMPTY --------------------------------------------------------------
console.log('=== 4. lamp: blank evidence cell ⇒ EVIDENCE_EMPTY ===')
{
  const res = withTree((text) => {
    const lines = text.split('\n')
    const target = simpleRowLinesOf(text).find((l) => {
      const c = cellsOf(l)
      return c.length >= 7 && c[4].trim() !== ''
    })
    const cells = cellsOf(target)
    cells[4] = ' '
    return lines.map((l) => (l === target ? cells.join('|') : l)).join('\n')
  }, (dir) => runInTree(dir))
  const codes = codesOf(res.report)
  ok(res.status !== 0 && codes.includes('EVIDENCE_EMPTY'), 'a blank evidence cell is a NAMED failure (evidence cannot be empty)', codes.slice(0, 4))
}

// ---- 5. LAMP: CONFORMS with docs-only evidence is refused ----------------------------------------------------------
console.log('=== 5. lamp: CONFORMS with docs-only evidence ⇒ CONFORMS_WITHOUT_BEHAVIOUR_EVIDENCE ===')
{
  const res = withTree((text) => {
    const lines = text.split('\n')
    const target = simpleRowLinesOf(text).find((l) => {
      const c = cellsOf(l)
      if (c.length < 7) return false
      const verdict = c[6].replace(/\*/g, '').trim()
      const ev = c[4]
      return verdict === 'CONFORMS' && !/(^|[^a-z])(sim:|test:|real:)/.test(ev)
    })
    if (!target) return text
    const cells = cellsOf(target)
    cells[4] = ' docs: the design volumes say so (mutation: not behaviour evidence) '
    return lines.map((l) => (l === target ? cells.join('|') : l)).join('\n')
  }, (dir) => runInTree(dir))
  const mutated = res.report && res.report.evidence && res.report.evidence.docsOnly > 0
  ok(res.status !== 0 && (codesOf(res.report).includes('CONFORMS_WITHOUT_BEHAVIOUR_EVIDENCE') || mutated),
    'a CONFORMS row backed only by docs is refused (docs are not behaviour evidence)', codesOf(res.report).slice(0, 4))
}

console.log('=== MACRO RULES GATE' + (SELFTEST ? ' (--selftest)' : '') + ': ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
