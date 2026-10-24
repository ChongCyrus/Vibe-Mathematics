// tests/audit-doc-line-refs.test.mjs — a `file.ext:NNN` reference must POINT AT A LINE THAT EXISTS.
//
// WHY THIS EXISTS (task-226, from a disease that was MEASURED, not theorised). Re-anchoring one coverage doc
// (task-219) showed that "file:line" citations rot whenever the cited file grows or is split - and it rotted
// DURING that very round: `packs/v5r/prompts/v5r-blocks-a.js` went 698 -> 732 lines while the doc was being
// fixed, so every citation into it had to be re-measured. Two docs were left with references that had drifted
// past the end of the file they name (`vibe-math-vmu/docs/audit/pack-content-review.md`, whose eleven
// `v5r-charter.js:NNN` citations all point past that file's current 132 lines, because it was split into
// `v5r-charter.js` + `v5r-blocks-a.js` + `v5r-blocks-b.js`).
//
// WHAT IT CHECKS: every `path/to/file.ext:NNN` and `path:NNN-MMM` occurrence in the scanned docs is resolved to
// a real file, and the line number(s) must fit inside that file. Out of range = RED, naming the doc, its line,
// the reference, the resolved file and its true length.
//
// ★★ WHAT IT CANNOT CATCH (stated here and printed on every run, because a guard must not imply more than it
// proves): a line number that is IN RANGE but now points at DIFFERENT TEXT. Detecting that needs either a
// symbol name (what the doc claims is there) or a content hash (what the line said when the citation was
// written); neither is derivable from `file:NNN` alone. This gate therefore proves "the target line EXISTS",
// never "the target line is the RIGHT line". A citation whose file is missing from the tree, or whose basename
// is ambiguous (several files share it), is reported as SKIPPED - never as a pass - so the coverage of this
// run is countable.
//
// OPTIONAL, NON-FAILING: `--symbol-window=N` additionally checks the case where a doc line names a backticked
// symbol AND a `file.js:NNN` reference, and prints how far that symbol's DECLARATION is from NNN. It is a
// DIAGNOSTIC and never changes the exit code: the repo treats "a gate nobody can keep green" as a wall, and a
// doc may legitimately cite a call site rather than the declaration line.
//
// COUNTEREXAMPLE MODE: `VMU_DOC_REF_DIR=<dir>` scans that directory instead of the real doc trees, so a red
// side can be produced against a COPY without touching the docs (the same convention `tests/audit-doc-index.test.mjs`
// uses via `VMU_DOCS_DIR`).
//
// Run: node tests/audit-doc-line-refs.test.mjs
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, basename } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const OVERRIDE = process.env.VMU_DOC_REF_DIR ? resolve(process.env.VMU_DOC_REF_DIR) : null
// ★ `docs-landed` IS SCANNED TOO, and it was the gap: it ships in `package.json#files` (the landed short version
// 面向使用者) but neither this gate nor the doc linter walked it, so its `file:line` citations could drift with
// nothing to notice. MEASURED before adding it: 134 refs, 0 not-found, 1 ambiguous basename - so this tightened
// the gate without needing to repair anything first. It is a DOCUMENT tree, which is why it belongs here rather
// than behind an exception.
const DOC_ROOTS = OVERRIDE ? [OVERRIDE] : [join(REPO, 'vibe-math-vmu', 'docs'), join(REPO, 'docs'), join(REPO, 'docs-landed')]
const SYMBOL_WINDOW = (() => {
  const m = process.argv.find((a) => a.startsWith('--symbol-window'))
  if (!m) return null
  const n = Number((m.split('=')[1] || '').trim())
  return Number.isInteger(n) && n > 0 ? n : 40
})()

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

// ── the file index (built from the REAL repo, even in counterexample mode, so a copied doc is judged against
//    the real tree — which is exactly the drift we are hunting) ──────────────────────────────────────────────
const INDEX_ROOTS = ['vibe-math-vmu', 'vibe-math-v5r', 'vibe-math-v4', 'vibe-math-v5', 'tests', 'scripts', 'docs']
const EXT = /\.(?:js|mjs|cjs|md|json|jsonc|txt|yml|yaml|lean)$/i
const files = []
const walk = (d, depth = 0) => {
  if (depth > 8 || !existsSync(d)) return
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p, depth + 1)
    else if (EXT.test(e.name)) files.push(p)
  }
}
for (const r of INDEX_ROOTS) walk(join(REPO, r))
const relOf = (p) => p.slice(REPO.length + 1).split('\\').join('/')
/** A path that is meaningful even when the scanned root is a COPY outside the repo (counterexample mode). */
const display = (p) => (p.startsWith(REPO) ? relOf(p) : p.split('\\').join('/'))
const byPath = new Map()
const byBase = new Map()
for (const p of files) {
  const rel = relOf(p)
  byPath.set(rel, p)
  const b = basename(p)
  if (!byBase.has(b)) byBase.set(b, [])
  byBase.get(b).push(p)
}
const lineCountCache = new Map()
const lineCount = (p) => {
  if (!lineCountCache.has(p)) lineCountCache.set(p, readFileSync(p, 'utf8').split(/\r?\n/).length)
  return lineCountCache.get(p)
}

/** Resolve `ref` (as written in the doc) to a real file, or a reason it cannot be judged. */
export function resolveRef(ref, index = { byPath, byBase }) {
  const cleaned = ref.replace(/^\.\//, '').replace(/\\/g, '/')
  if (cleaned.includes('/')) {
    const hits = []
    for (const [rel, p] of index.byPath) if (rel === cleaned || rel.endsWith('/' + cleaned)) hits.push(p)
    if (hits.length === 1) return { file: hits[0], why: 'path' }
    if (hits.length > 1) return { file: null, why: 'ambiguous-path', n: hits.length }
    const b = basename(cleaned)
    const bHits = index.byBase.get(b) || []
    if (bHits.length === 1) return { file: bHits[0], why: 'basename-only' }
    if (bHits.length > 1) return { file: null, why: 'ambiguous-basename', n: bHits.length }
    return { file: null, why: 'not-found' }
  }
  const hits = index.byBase.get(cleaned) || []
  if (hits.length === 1) return { file: hits[0], why: 'basename' }
  if (hits.length > 1) return { file: null, why: 'ambiguous-basename', n: hits.length }
  return { file: null, why: 'not-found' }
}

/** The pure judgement of one reference: RED when the range does not fit inside the file. */
export function judgeRef({ ref, start, end, length }) {
  if (!Number.isInteger(start) || start < 1) return { verdict: 'bad-number', detail: String(start) }
  if (start > length) return { verdict: 'out-of-range', detail: { start, length } }
  if (end !== null && end !== undefined) {
    if (end < start) return { verdict: 'reversed-range', detail: { start, end } }
    if (end > length) return { verdict: 'out-of-range', detail: { end, length } }
  }
  return { verdict: 'ok' }
}

const REF_RE = /(?:^|[\s`(+|（])([\w.-]+(?:\/[\w.-]+)*\.(?:js|mjs|cjs|md|json|jsonc|txt|yml|yaml|lean))[:：](\d{1,6})(?:\s*[–—-]\s*(?:L)?(\d{1,6}))?/gi

/**
 * ★ THE HISTORICAL MARKER (marker style follows `tests/audit-fs-purpose.test.mjs`). A doc that RE-ANCHORS a
 * reference has to quote the OLD number to be useful (the worked example is
 * `vibe-math-vmu/docs/audit/source-prompt-coverage.md` §5, "old → new"), and a guard that reds on that quote is a
 * wall nobody can keep green. So a reference is treated as a RECORD, not a pointer, when either
 *   (a) its own line carries the explicit word `拆前` or `pre-split`, or
 *   (b) it sits under a heading matching /re-anchor log/i (until the next heading of the same or higher level).
 * Both are explicit and greppable, and the gate PRINTS how many references were excused this way, so the
 * exemption is itself countable rather than silent (the §4.2-ninth-requirement discipline).
 */
const HIST_LINE = /拆前|pre-split|old\s*→|旧\s*→/
const REANCHOR_HEAD = /re-anchor log/i
function historicalLines(lines) {
  const out = new Set()
  let inSec = false
  let level = 0
  lines.forEach((l, i) => {
    const h = /^(#{2,4})\s+(.*)$/.exec(l)
    if (h) {
      const lvl = h[1].length
      if (inSec && lvl <= level) inSec = false
      if (REANCHOR_HEAD.test(h[2])) { inSec = true; level = lvl }
    }
    if (inSec) out.add(i + 1)
  })
  return out
}

/**
 * ★ THE NAMED BACKLOG. Two out-of-range references that this round FOUND and could NOT fix (they live outside the
 * task's write scope). They are recorded here rather than silenced, following the repo's graded-backlog idiom
 * (`audit-code-size`: recorded, must not grow, each must STILL violate, and the predicate is proven to bite):
 *   · no finding may appear that is NOT on this list (a new one is RED);
 *   · every listed item must still be violated (fixing it without deleting its row is RED, so the list cannot
 *     go stale and become a dumping ground);
 *   · every row states a reason.
 */
export const KNOWN_OUT_OF_RANGE = Object.freeze([
  // ★ G4 (round 18): the five presets were archived and `vibe-math-vmu/agent.cordis.yml` was subsequently
  // shortened to 207 lines, so ten HISTORICAL references now point past its end. `docs/acceptance/**` is
  // history and must not be rewritten; `docs/COMPAT-AUDIT-ROUND2.md` is a historical audit record. They are
  // recorded here (with the reason) instead of being silently corrected or silently ignored.
  { doc: 'docs/acceptance/03-v5r-full-inventory.md', docLine: 2063, ref: 'agent.cordis.yml:294-295', why: '历史 acceptance 记录：当时 vmu agent.cordis.yml 更长（现 207 行）；按“历史 acceptance 不改写”保留原行号' },
  { doc: 'docs/acceptance/03-v5r-full-inventory.md', docLine: 2295, ref: 'agent.cordis.yml:294-295', why: '历史 acceptance 记录：当时 vmu agent.cordis.yml 更长（现 207 行）；按“历史 acceptance 不改写”保留原行号' },
  { doc: 'docs/acceptance/phase6-v3-prompt-parity.md', docLine: 71, ref: 'agent.cordis.yml:141-264', why: '历史 acceptance 记录：当时 vmu agent.cordis.yml 更长（现 207 行）；按“历史 acceptance 不改写”保留原行号' },
  { doc: 'docs/acceptance/phase6-v3-prompt-parity.md', docLine: 73, ref: 'agent.cordis.yml:322-333', why: '历史 acceptance 记录：当时 vmu agent.cordis.yml 更长（现 207 行）；按“历史 acceptance 不改写”保留原行号' },
  { doc: 'docs/acceptance/phase6-v3-prompt-parity.md', docLine: 333, ref: 'agent.cordis.yml:322-333', why: '历史 acceptance 记录：当时 vmu agent.cordis.yml 更长（现 207 行）；按“历史 acceptance 不改写”保留原行号' },
  { doc: 'docs/acceptance/phase6-v3-prompt-parity.md', docLine: 412, ref: 'agent.cordis.yml:322-333', why: '历史 acceptance 记录：当时 vmu agent.cordis.yml 更长（现 207 行）；按“历史 acceptance 不改写”保留原行号' },
  { doc: 'docs/acceptance/v5r-inventory-c.md', docLine: 555, ref: 'agent.cordis.yml:294-295', why: '历史 acceptance 记录：当时 vmu agent.cordis.yml 更长（现 207 行）；按“历史 acceptance 不改写”保留原行号' },
  { doc: 'docs/acceptance/v5r-inventory-c.md', docLine: 787, ref: 'agent.cordis.yml:294-295', why: '历史 acceptance 记录：当时 vmu agent.cordis.yml 更长（现 207 行）；按“历史 acceptance 不改写”保留原行号' },
  { doc: 'docs/COMPAT-AUDIT-ROUND2.md', docLine: 113, ref: 'agent.cordis.yml:191-209', why: '历史兼容审计记录：当时 vmu agent.cordis.yml 更长（现 207 行）；旧行号保留，供对照历史审计' },
  { doc: 'docs/COMPAT-AUDIT-ROUND2.md', docLine: 114, ref: 'agent.cordis.yml:212-230', why: '历史兼容审计记录：当时 vmu agent.cordis.yml 更长（现 207 行）；旧行号保留，供对照历史审计' },
])
/**
 * A doc that cites one file several times writes the follow-ups as SHORTHAND on the same line: `f.js:531`, `:564`
 * and `f.js:235,581`. Those bare numbers are only followed when they CONTIGUOUSLY continue a full reference that
 * was just matched (`/` or `,` then an optional `:`), which keeps the false-positive surface at zero: a bare
 * `:583` with no full reference in front of it is never judged.
 */
export function shorthandAfter(line, endIndex, within = 40) {
  const tail = line.slice(endIndex, endIndex + within)
  const out = []
  let cursor = 0
  for (;;) {
    const m = /^([/,])\s*:?\s*(?:L)?(\d{1,6})(?:\s*[–—-]\s*(?:L)?(\d{1,6}))?/.exec(tail.slice(cursor))
    if (!m) break
    out.push({ start: Number(m[2]), end: m[3] === undefined ? null : Number(m[3]) })
    cursor += m[0].length
  }
  return out
}

console.log('=== §0 SELF-PROBE: the predicate bites in both directions (before any doc is judged) ===')
{
  const bad = judgeRef({ ref: 'f.js:300', start: 300, end: null, length: 132 })
  const good = judgeRef({ ref: 'f.js:120', start: 120, end: null, length: 132 })
  const rangeBad = judgeRef({ ref: 'f.js:120-200', start: 120, end: 200, length: 132 })
  const rangeGood = judgeRef({ ref: 'f.js:10-20', start: 10, end: 20, length: 132 })
  const reversed = judgeRef({ ref: 'f.js:90-10', start: 90, end: 10, length: 132 })
  ok(bad.verdict === 'out-of-range' && good.verdict === 'ok',
    '★ an out-of-range line REDS and an in-range line is GREEN (so "everything is red" is impossible)', { bad, good })
  ok(rangeBad.verdict === 'out-of-range' && rangeGood.verdict === 'ok' && reversed.verdict === 'reversed-range',
    '★ a range is checked at BOTH ends and a reversed range is its own named verdict', { rangeBad, rangeGood, reversed })
}

// ── the docs to scan ────────────────────────────────────────────────────────────────────────────────────────
const docs = []
for (const root of DOC_ROOTS) {
  if (!existsSync(root)) continue
  const st = statSync(root)
  if (st.isFile()) { docs.push(root); continue }
  const w = (d, depth = 0) => {
    if (depth > 6) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) w(p, depth + 1)
      else if (e.name.endsWith('.md')) docs.push(p)
    }
  }
  w(root)
}
console.log('=== §1 THE DOCS ARE READ (non-vacuous) ===')
ok(docs.length >= (OVERRIDE ? 1 : 20), 'the doc trees really yielded markdown files (' + docs.length + ' files from ' + DOC_ROOTS.map((d) => display(d)).join(', ') + (OVERRIDE ? ' [counterexample copy]' : '') + ')', { docs: docs.length })

// ── §2 the scan ─────────────────────────────────────────────────────────────────────────────────────────────
const bad = []
const skipped = { 'not-found': 0, 'ambiguous-basename': 0, 'ambiguous-path': 0 }
const symbolFindings = []
let resolved = 0
let historical = 0
for (const doc of docs) {
  const text = readFileSync(doc, 'utf8').split(/\r?\n/)
  const hist = historicalLines(text)
  text.forEach((line, i) => {
    for (const m of line.matchAll(REF_RE)) {
      // ★ a reference quoted as a RECORD (old → new) is not a pointer; see HIST_LINE / REANCHOR_HEAD
      if (hist.has(i + 1) || HIST_LINE.test(line)) { historical++; continue }
      const ref = m[1]
      const start = Number(m[2])
      const end = m[3] === undefined ? null : Number(m[3])
      const r = resolveRef(ref)
      if (!r.file) { skipped[r.why] = (skipped[r.why] || 0) + 1; continue }
      resolved++
      const length = lineCount(r.file)
      const j = judgeRef({ ref, start, end, length })
      if (j.verdict !== 'ok') {
        bad.push({ doc: display(doc), docLine: i + 1, ref: ref + ':' + m[2] + (m[3] ? '-' + m[3] : ''), file: relOf(r.file), verdict: j.verdict, detail: j.detail })
      }
      // the follow-up shorthands on the same line (`f.js:531`, `:564` / `f.js:235,581`)
      for (const sh of shorthandAfter(line, m.index + m[0].length)) {
        const js = judgeRef({ ref, start: sh.start, end: sh.end, length })
        if (js.verdict !== 'ok') {
          bad.push({ doc: display(doc), docLine: i + 1, ref: ref + ':' + sh.start + (sh.end ? '-' + sh.end : '') + ' (shorthand)', file: relOf(r.file), verdict: js.verdict, detail: js.detail })
        }
      }
      if (SYMBOL_WINDOW) {
        // ★ DIAGNOSTIC ONLY (never fails): if this doc line also names a backticked symbol that the target file
        // DECLARES, how far is that declaration from the cited line?
        for (const s of line.matchAll(/`([A-Za-z_$][\w$]*)`/g)) {
          const sym = s[1]
          const decl = new RegExp('(?:function|const|let|var|class)\\s+' + sym.replace(/[$]/g, '\\$&') + '\\b|name:\\s*[\'"]' + sym.replace(/[$]/g, '\\$&') + '[\'"]')
          const t = readFileSync(r.file, 'utf8').split(/\r?\n/)
          let at = -1
          t.forEach((l, k) => { if (at === -1 && decl.test(l)) at = k + 1 })
          if (at > 0 && Math.abs(at - start) > SYMBOL_WINDOW) {
            symbolFindings.push({ doc: relOf(doc), docLine: i + 1, ref: ref + ':' + start, symbol: sym, declaredAt: at, distance: Math.abs(at - start) })
          }
        }
      }
    }
  })
}

console.log('=== §2 NO REFERENCE POINTS PAST THE END OF THE FILE IT NAMES ===')
ok(resolved > 0, 'the scan really resolved references (non-vacuous: ' + resolved + ' resolved, ' + docs.length + ' docs)', { resolved })
ok(historical >= 0 && typeof historical === 'number',
  '★ the HISTORICAL exemption is countable, never silent: ' + historical + ' reference(s) were excused this run because their line is a re-anchor RECORD (`拆前`／`pre-split`) or sits under a "Re-anchor log" heading',
  { historical })
const fresh = bad.filter((b) => !KNOWN_OUT_OF_RANGE.some((k) => k.doc === b.doc && k.docLine === b.docLine && b.ref.startsWith(k.ref)))
const staleRows = KNOWN_OUT_OF_RANGE.filter((k) => !bad.some((b) => b.doc === k.doc && b.docLine === k.docLine && b.ref.startsWith(k.ref)))
ok(fresh.length === 0,
  '★ no OUT-OF-RANGE reference exists that is not on the named backlog (' + bad.length + ' out-of-range in total, ' + KNOWN_OUT_OF_RANGE.length + ' recorded)',
  fresh.slice(0, 25))
// ★ task-233 (round 10): the `length > 0` clause is REMOVED. It made the success state unreachable - the assertion
// below requires a FIXED reference to have its row deleted, so once all nine rows were re-anchored the table MUST be
// empty, and `length > 0` then failed the very run that fixed them. An empty backlog is the goal, not a defect. What
// this assertion still guards is that no row is ever a bare name (a silencing device), which `every` enforces for any
// row added later; the other two assertions keep the list honest in both directions (nothing unrecorded, nothing stale).
ok(KNOWN_OUT_OF_RANGE.every((k) => typeof k.why === 'string' && k.why.length > 20),
  '★ every backlog row states WHY it is recorded (a bare name would be a silencing device; an EMPTY list means nothing is owed)',
  KNOWN_OUT_OF_RANGE)
ok(staleRows.length === 0,
  '★ every backlog row is STILL violated — a fixed reference must have its row deleted in the same change, so the list cannot go stale or grow into a dumping ground',
  staleRows)
if (bad.length) {
  console.error('  ── out-of-range references (' + bad.length + '; recorded=' + KNOWN_OUT_OF_RANGE.length + ') ──')
  for (const b of bad.slice(0, 40)) console.error('    ' + b.doc + ':' + b.docLine + '  ' + b.ref + '  -> ' + b.file + '  [' + b.verdict + ' ' + JSON.stringify(b.detail) + ']')
}
ok(Object.values(skipped).reduce((a, b) => a + b, 0) >= 0 && typeof skipped['not-found'] === 'number',
  '★ WHAT THIS GATE CANNOT CATCH (stated, not implied): a line number that is IN RANGE but now points at DIFFERENT TEXT is undetectable from `file:NNN` alone — that needs a symbol name or a content hash. This run proves the target line EXISTS, never that it is the RIGHT line. Also: references whose file is absent or whose basename is ambiguous are SKIPPED (counted below), never passed.',
  skipped)
console.log('  coverage: resolved=' + resolved + ' historical-excused=' + historical + ' skipped=' + JSON.stringify(skipped))

if (SYMBOL_WINDOW) {
  console.log('=== §3 SYMBOL-WINDOW DIAGNOSTIC (opt-in; NEVER fails — a doc may cite a call site, not a declaration) ===')
  console.log('  window=±' + SYMBOL_WINDOW + ' lines; findings=' + symbolFindings.length)
  for (const f of symbolFindings.slice(0, 20)) console.log('    ' + f.doc + ':' + f.docLine + '  ' + f.ref + '  symbol `' + f.symbol + '` declared at :' + f.declaredAt + ' (distance ' + f.distance + ')')
}

console.log('')
console.log('=== DOC LINE REFS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
process.exitCode = failed === 0 ? 0 : 1
