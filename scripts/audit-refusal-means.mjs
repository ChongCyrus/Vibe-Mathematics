#!/usr/bin/env node
// scripts/audit-refusal-means.mjs — TB-2792 / C#25: every refusal code the v5r pack can EMIT must carry a `means`,
// and every code's hint must exist in BOTH forms (short one-liner + full superset with REACHABLE INSTEAD).
//
// WHY THIS IS A GATE, NOT A STYLE NOTE. The round-4..8 audits measured 186 refusal receipts of which 6 carried
// `means`, and no receipt distinguished a one-line hint from a full one. The defect is not wording: a receipt whose
// code is not explained forces a reader to guess why a legal-looking call was refused, and a paragraph-shaped hint is
// unreadable inside a compact tool receipt. So the code table (`V5R_REFUSAL_MEANS` in packs/v5r/tools.js) is checked
// AGAINST THE PACK'S OWN SOURCES: the distinct codes are DISCOVERED from refusal construction sites, never listed by
// hand here.
//
// THE EXEMPTION LEDGER IS SMALL AND NAMED. A code that genuinely cannot carry a `means` must be listed in
// `V5R_REFUSAL_MEANS_EXEMPT` WITH the reason (it is printed, so "forgotten" and "deliberate" stay distinguishable).
//
//   node scripts/audit-refusal-means.mjs            # check, exit 1 on any violation
//   node scripts/audit-refusal-means.mjs --json     # machine-readable report
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PRODUCT_ROOT = join(REPO, 'vibe-math-vmu')
// The TOOL-FACING surface the corpus receipts come from: the pack, the host pre-gates/seams, the kernel tool modules
// (tools/*.js), the kit and the domain extensions. `prompts/` is included on purpose: a refusal shape TAUGHT there is
// still a code the corpus can read back. `docs/` and the generated packs/*-prompts.js are prose/data, not construction sites.
const PRODUCT_SOURCE_DIRS = ['tools', 'kit', 'packs/v5r']
const PRODUCT_SOURCE_FILES = ['host.js', 'host-pack-tools.js', 'host-deliver.js', 'host-hooks.js', 'host-children.js', 'host-spawn.js', 'host-math.js', 'vibe-math-vmu.js']

/** The ONE exemption ledger lives in the shared module (`vibe-math-vmu/refusal-means.js`); this re-export keeps the
 *  audit's old name working. It is intentionally tiny: every entry must carry the reason the code cannot be explained. */
export { REFUSAL_MEANS_EXEMPT as V5R_REFUSAL_MEANS_EXEMPT } from '../vibe-math-vmu/refusal-means.js'

const walkJs = (d) => {
  const out = []
  if (!existsSync(d)) return out
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) out.push(...walkJs(p))
    else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js')) out.push(p)
  }
  return out
}

/** The refusal-construction sites in one source: `refuse('CODE'`, `refusalReceipt('CODE'`, `code: 'CODE'`,
 *  `|| 'CODE'` (a defaulted code) and `code = 'CODE'`. These are the places a receipt can get its code from. */
export function refusalCodesIn(src) {
  const out = []
  const push = (m) => { if (m && /^VMU_/.test(m[1])) out.push(m[1]) }
  for (const re of [
    /\b(?:refuse|refusalReceipt)\s*\(\s*'([A-Z][A-Z0-9_]+)'/g,
    /\bcode\s*:\s*'([A-Z][A-Z0-9_]+)'/g,
    /\|\|\s*'([A-Z][A-Z0-9_]+)'/g,
    /\bcode\s*=\s*'([A-Z][A-Z0-9_]+)'/g,
  ]) for (const m of src.matchAll(re)) push(m)
  return out
}

/** Distinct codes + their construction-site counts, from sources ({file, src}). */
export function discoverRefusalCodes(sources) {
  const codes = new Map()
  for (const f of sources) {
    for (const code of refusalCodesIn(String(f.src))) {
      const row = codes.get(code) || { code, sites: 0, files: [] }
      row.sites += 1
      if (!row.files.includes(f.file)) row.files.push(f.file)
      codes.set(code, row)
    }
  }
  return codes
}

const SHORT_MAX = 96
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim()

/** The whole audit, as a pure function so a fixture/table mutation can be judged red (the lamp in the test). */
export function auditRefusalMeans({ sources, table, exempt = {} }) {
  const codes = discoverRefusalCodes(sources)
  const violations = []
  const missing = []
  const missingExempt = []
  const badShort = []
  const badFull = []
  const badMeans = []
  let coveredSites = 0
  let totalSites = 0
  for (const row of codes.values()) {
    totalSites += row.sites
    const entry = table[row.code]
    if (exempt[row.code]) { missingExempt.push({ code: row.code, reason: String(exempt[row.code]) }); continue }
    if (!entry) { missing.push(row.code); violations.push(row.code + ': no `means` entry (emitted by ' + row.files.join(', ') + ')'); continue }
    const means = oneLine(entry.means)
    const short = oneLine(entry.short)
    const reachable = oneLine(entry.reachable)
    if (means.length < 24) { badMeans.push(row.code); violations.push(row.code + ': `means` is too short to explain anything (' + means.length + ' chars)') }
    if (!short) { badShort.push(row.code); violations.push(row.code + ': no short hint') }
    else if (short.length > SHORT_MAX) { badShort.push(row.code); violations.push(row.code + ': short hint is ' + short.length + ' chars (> ' + SHORT_MAX + ') — that is a paragraph, not a one-liner') }
    else if (/REACHABLE INSTEAD/i.test(short)) { badShort.push(row.code); violations.push(row.code + ': short hint contains REACHABLE INSTEAD — it is a copy of the FULL form, so the two forms are not distinct') }
    if (!reachable) { badFull.push(row.code); violations.push(row.code + ': no REACHABLE INSTEAD clause for the full hint') }
    if (short && reachable && short === reachable) { badShort.push(row.code); violations.push(row.code + ': short hint equals the reachable clause — the short form is a copy, not a one-liner') }
    coveredSites += row.sites
  }
  return {
    ok: violations.length === 0,
    distinct: { total: codes.size, covered: codes.size - missing.length - missingExempt.length, missing: missing.slice(), exempt: missingExempt.slice() },
    receipts: { totalSites, coveredSites, coverage: totalSites === 0 ? 0 : coveredSites / totalSites },
    violations,
    codes: [...codes.values()].sort((a, b) => (a.code < b.code ? -1 : 1)),
  }
}

export function readProductSources(root = PRODUCT_ROOT) {
  const files = []
  for (const d of PRODUCT_SOURCE_DIRS) files.push(...walkJs(join(root, d)))
  for (const f of PRODUCT_SOURCE_FILES) files.push(join(root, f))
  return files.map((f) => ({ file: f, src: readFileSync(f, 'utf8') }))
}
/** Kept for the pack-scoped callers/tests: the v5r pack folder only. */
export function readPackSources(root = join(PRODUCT_ROOT, 'packs', 'v5r')) {
  return walkJs(root).map((f) => ({ file: f, src: readFileSync(f, 'utf8') }))
}

export function auditPackRefusalMeans({ table, exempt = V5R_REFUSAL_MEANS_EXEMPT, root = PRODUCT_ROOT } = {}) {
  return auditRefusalMeans({ sources: readPackSources(join(root, 'packs', 'v5r')), table, exempt })
}
/** Round-10 boundary: the SAME audit over the WHOLE tool-facing surface (host pre-gates + kernel tool modules + pack). */
export function auditProductRefusalMeans({ table, exempt, root = PRODUCT_ROOT } = {}) {
  return auditRefusalMeans({ sources: readProductSources(root), table, exempt })
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────────
const isMain = (() => {
  try { return process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1]) }
  catch { return false }
})()
if (isMain || (process.argv[1] && String(process.argv[1]).endsWith('audit-refusal-means.mjs'))) {
  const { REFUSAL_MEANS, REFUSAL_MEANS_EXEMPT } = await import('../vibe-math-vmu/refusal-means.js')
  const report = auditProductRefusalMeans({ table: REFUSAL_MEANS, exempt: REFUSAL_MEANS_EXEMPT })
  const asJson = process.argv.includes('--json')
  if (asJson) console.log(JSON.stringify(report, null, 1))
  else {
    console.log('refusal means: distinct codes ' + report.distinct.covered + '/' + report.distinct.total
      + ' covered' + (report.distinct.exempt.length ? ' (' + report.distinct.exempt.length + ' named exempt)' : '')
      + ' | receipts ' + report.receipts.coveredSites + '/' + report.receipts.totalSites
      + ' (' + (report.receipts.coverage * 100).toFixed(1) + '%)')
    for (const v of report.violations) console.error('  VIOLATION ' + v)
    if (report.violations.length === 0) console.log('REFUSAL MEANS: PASS (' + report.distinct.total + ' codes, both hint forms present)')
  }
  process.exit(report.ok ? 0 : 1)
}
