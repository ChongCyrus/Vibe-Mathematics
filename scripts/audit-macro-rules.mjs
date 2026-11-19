#!/usr/bin/env node
// scripts/audit-macro-rules.mjs — TB-2795 verifier for the macro-rules conformance matrix.
//
// WHAT IT CHECKS (the four self-checks the taskbook names, plus the evidence-distribution floors):
//   1. SENTENCE CONSERVATION : the matrix has exactly one row per sentence the splitter produces (same order, same ids).
//   2. VERBATIM QUOTES       : every `句` cell is the sentence text itself (verbatim; only `|` is escaped as `\|`).
//   3. EVIDENCE              : every row has a non-empty evidence cell; a CONFORMS row must cite sim/test/real (a docs-only
//                              citation cannot carry a CONFORMS verdict — docs are not behaviour evidence).
//   4. EVIDENCE FLOORS       : ≥60% of rows carry sim or test evidence; docs-only rows ≤25%.
//   5. REAL COVERAGE (warn)  : every section should have at least one `real:` row (RUN evidence). A section with none is
//                              reported by name (the report must say WHY — "not exercised by the audited run" is a named gap,
//                              never a silent pass); `--strict-real` turns it into a failure.
//   6. IDS                   : unique, and matching the splitter's own ids.
//
// USAGE
//   node scripts/audit-macro-rules.mjs                 # verify docs/acceptance/macro-rules-conformance-matrix.md
//   node scripts/audit-macro-rules.mjs --json          # machine-readable summary
//   node scripts/audit-macro-rules.mjs --emit-sentences  # print the splitter's sentences (for the doc lane)
//   node scripts/audit-macro-rules.mjs --check         # exit 1 on any failure (warnings only for real coverage)
//   node scripts/audit-macro-rules.mjs --strict-real   # also fail when a section has no real evidence
//
// THE SPLITTER IS THE CONTRACT. It splits the rule document by Chinese sentence enders (。；！？) and enumerated markers
// (①②③…), never inside （…） or **…**, treats `#` headings / `---` / blank lines / colon-ended lead-ins as structural
// (not sentences), and merges a colon-ended fragment with the sentence it introduces. Changing the splitter changes N,
// so the matrix must be regenerated in the same commit — the gate re-derives the sentences from the document every run.

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
// The rule document lives OUTSIDE the repository in the author's workspace; a clean clone/CI has no D:/ path, so the
// gate falls back to the VENDORED copy committed with the acceptance docs (same bytes, same sentence split). The env
// override stays first for a reviewer pointing at another snapshot.
const DEV_RULE_DOC = 'D:/wd/vibemath开发/宏观层面v5r运行规则.md'
const VENDORED_RULE_DOC = join(REPO, 'docs/acceptance/macro-rules-source.md')
const RULE_DOC = process.env.MACRO_RULES_DOC || (existsSync(DEV_RULE_DOC) ? DEV_RULE_DOC : VENDORED_RULE_DOC)
const MATRIX = join(REPO, 'docs/acceptance/macro-rules-conformance-matrix.md')
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'

const args = process.argv.slice(2)
const JSON_OUT = args.includes('--json')
const EMIT = args.includes('--emit-sentences')
const STRICT_REAL = args.includes('--strict-real')

function sectionOfHeading(t) {
  if (t.includes('成员')) return 'MEM'
  if (t.includes('公共的')) return 'FPUB'
  if (t.includes('各自的文件')) return 'FSEAT'
  if (t.includes('核心推进方向')) return 'MAIN'
  if (t.includes('平时研究推进阶段')) return 'ROUT'
  if (t.includes('会议阶段')) return 'MEET'
  if (t.includes('论文阶段')) return 'PAPER'
  if (t.includes('额外的要求')) return 'EXTRA'
  return null
}

/** Split one source line into sentences. Exported because the matrix generator must use THIS function. */
export function splitLine(text) {
  let t = String(text).trim()
  if (t.startsWith('- ')) t = t.slice(2).trim()
  const out = []
  let buf = ''
  let depth = 0
  let bold = false
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i]
    if (ch === '*' && t[i + 1] === '*') {
      buf += '**'
      bold = !bold
      i += 1
      continue
    }
    if (ch === '（' || ch === '(' || ch === '【' || ch === '[') depth += 1
    else if ((ch === '）' || ch === ')' || ch === '】' || ch === ']') && depth > 0) depth -= 1
    const atTop = depth === 0 && !bold
    if (atTop && (ch === '。' || ch === '；' || ch === '！' || ch === '？')) {
      if (buf.trim()) out.push(buf.trim())
      buf = ''
      continue
    }
    if (atTop && CIRC.indexOf(ch) >= 0) {
      if (buf.trim()) out.push(buf.trim())
      buf = ch
      continue
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  // merge a colon-ended lead-in fragment into the sentence it introduces (e.g. "状态版内容包括：")
  const merged = []
  for (const s of out) {
    if (merged.length && /[：:]$/.test(merged[merged.length - 1])) merged[merged.length - 1] += s
    else merged.push(s)
  }
  return merged.filter((s) => /[\u4e00-\u9fffA-Za-z0-9]/.test(s))
}

/** Segment the whole rule document. Returns [{id, line, section, text}]. */
export function segmentRuleDoc(raw) {
  const lines = String(raw).split('\n')
  const sectionOfLine = new Map()
  let sec = 'PRE'
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim()
    if (!t) continue
    if (t.startsWith('#')) {
      const s = sectionOfHeading(t)
      if (s) sec = s
      sectionOfLine.set(i + 1, 'HEADING')
      continue
    }
    if (/^-{3,}$/.test(t)) { sectionOfLine.set(i + 1, 'STRUCT'); continue }
    if (t === '关于辩论：') { sec = 'DEBATE'; sectionOfLine.set(i + 1, 'HEADING'); continue }
    if (!t.startsWith('-') && /[：:]$/.test(t)) { sectionOfLine.set(i + 1, 'LEADIN'); continue }
    sectionOfLine.set(i + 1, sec)
  }
  const entries = []
  const counts = new Map()
  for (let i = 0; i < lines.length; i += 1) {
    const kind = sectionOfLine.get(i + 1)
    if (!kind || kind === 'HEADING' || kind === 'STRUCT' || kind === 'LEADIN') continue
    for (const s of splitLine(lines[i])) {
      const n = (counts.get(kind) || 0) + 1
      counts.set(kind, n)
      entries.push({ id: kind + '.' + n, line: i + 1, section: kind, text: s })
    }
  }
  return entries
}

function readMatrixRows(file) {
  if (!existsSync(file)) return null
  const lines = readFileSync(file, 'utf8').split('\n')
  const rows = []
  for (const line of lines) {
    const m = /^\|\s*`([A-Z]+\.[0-9]+)`\s*\|/.exec(line)
    if (!m) continue
    // split cells on unescaped pipes
    const cells = []
    let cur = ''
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '\\' && line[i + 1] === '|') { cur += '\\|'; i += 1; continue }
      if (ch === '|') { cells.push(cur); cur = ''; continue }
      cur += ch
    }
    cells.push(cur)
    // cells[0] === '' (leading pipe), [1]=id, [2]=句, [3]=实现, [4]=证据, [5]=完整性, [6]=判定
    const cells2 = cells.slice(1).map((c) => c.trim())
    if (cells2.length < 6) continue
    rows.push({ id: cells2[0].replace(/^`|`$/g, ''), quote: cells2[1], impl: cells2[2], evidence: cells2[3], completeness: cells2[4], verdict: cells2[5] })
  }
  return rows
}

const unescapeCell = (s) => String(s).replace(/\\\|/g, '|').replace(/`/g, '').trim()

function main() {
  if (!existsSync(RULE_DOC)) {
    console.log(JSON.stringify({ ok: false, error: 'rule document not found: ' + RULE_DOC }))
    process.exitCode = 2
    return
  }
  const entries = segmentRuleDoc(readFileSync(RULE_DOC, 'utf8'))
  if (EMIT) {
    if (JSON_OUT) console.log(JSON.stringify(entries, null, 1))
    else entries.forEach((e) => console.log(e.id + '\t' + e.text))
    return
  }
  const rows = readMatrixRows(MATRIX)
  const problems = []
  const warnings = []
  const stats = { sentences: entries.length, rows: rows ? rows.length : 0 }
  if (!rows) {
    problems.push({ code: 'NO_MATRIX', message: 'matrix missing: ' + MATRIX })
  } else {
    stats.uniqueIds = new Set(rows.map((r) => r.id)).size
    if (rows.length !== entries.length) problems.push({ code: 'SENTENCE_COUNT_MISMATCH', message: 'rows ' + rows.length + ' != sentences ' + entries.length })
    const byId = new Map(rows.map((r) => [r.id, r]))
    for (const e of entries) {
      const r = byId.get(e.id)
      if (!r) { problems.push({ code: 'ROW_MISSING', message: 'no row for sentence ' + e.id }); continue }
      if (unescapeCell(r.quote) !== e.text) problems.push({ code: 'QUOTE_NOT_VERBATIM', message: e.id + ': quote differs from the sentence' })
    }
    for (const r of rows) if (!byId.has(r.id)) problems.push({ code: 'ROW_EXTRA', message: 'row ' + r.id + ' has no sentence' })
    const verdicts = {}
    let evSimTest = 0
    let evDocsOnly = 0
    let realRows = 0
    for (const r of rows) {
      const ev = r.evidence || ''
      const isSim = /(^|[^a-z])sim:|§sim|sim round|round-\d+/.test(ev)
      const isTest = /(^|[^a-z])test:/.test(ev)
      const isReal = /(^|[^a-z])real:/.test(ev)
      const isDocs = /(^|[^a-z])docs:/.test(ev)
      if (!ev.trim()) problems.push({ code: 'EVIDENCE_EMPTY', message: r.id + ': evidence is empty' })
      if (isSim || isTest) evSimTest += 1
      if (isDocs && !isSim && !isTest && !isReal) evDocsOnly += 1
      if (isReal) realRows += 1
      const verdict = String(r.verdict).replace(/\*/g, '').trim()
      verdicts[verdict] = (verdicts[verdict] || 0) + 1
      if (String(r.verdict).replace(/\*/g,'').trim() === 'CONFORMS' && !(isSim || isTest || isReal)) {
        problems.push({ code: 'CONFORMS_WITHOUT_BEHAVIOUR_EVIDENCE', message: r.id + ': CONFORMS needs sim/test/real evidence (docs-only is not behaviour evidence)' })
      }
      if (!/^(CONFORMS|GAP|HALF-BUILT|NOT-APPLICABLE)$/.test(String(r.verdict).replace(/\*/g,'').trim())) problems.push({ code: 'VERDICT_INVALID', message: r.id + ': ' + r.verdict })
      if ((/^(GAP|HALF-BUILT)$/.test(String(r.verdict).replace(/\*/g,'').trim())) && !/owner/i.test(r.impl + ' ' + r.completeness)) warnings.push({ code: 'NO_OWNER_IN_ROW', message: r.id + ': GAP/HALF-BUILT row should name an owner' })
    }
    stats.verdicts = verdicts
    stats.evidence = { simOrTest: evSimTest, simOrTestRatio: +(evSimTest / rows.length).toFixed(3), docsOnly: evDocsOnly, docsOnlyRatio: +(evDocsOnly / rows.length).toFixed(3), realRows }
    if (evSimTest / rows.length < 0.6) problems.push({ code: 'SIM_TEST_FLOOR', message: 'sim/test coverage ' + evSimTest + '/' + rows.length + ' < 60%' })
    if (evDocsOnly / rows.length > 0.25) problems.push({ code: 'DOCS_CEILING', message: 'docs-only ' + evDocsOnly + '/' + rows.length + ' > 25%' })
    const bySection = {}
    for (const e of entries) bySection[e.section] = bySection[e.section] || []
    for (const r of rows) { const sec = r.id.split('.')[0]; if (!(bySection[sec] || []).includes('real')) continue }
    const realBySection = {}
    for (const r of rows) { const sec = r.id.split('.')[0]; realBySection[sec] = realBySection[sec] || 0; if (/(^|[^a-z])real:/.test(r.evidence || '')) realBySection[sec] += 1 }
    stats.realBySection = realBySection
    const noReal = Object.keys(bySection).filter((s) => (realBySection[s] || 0) === 0)
    stats.sectionsWithoutReal = noReal
    if (noReal.length) warnings.push({ code: 'SECTION_WITHOUT_REAL', message: 'sections with no real RUN evidence: ' + noReal.join(', ') + ' (the report must name why)' })
  }
  stats.problems = problems
  stats.warnings = warnings
  stats.ok = problems.length === 0 && (!STRICT_REAL || warnings.every((w) => w.code !== 'SECTION_WITHOUT_REAL'))
  if (JSON_OUT) console.log(JSON.stringify(stats, null, 1))
  else {
    console.log('macro rules: ' + stats.sentences + ' sentence(s), ' + stats.rows + ' row(s)')
    if (stats.evidence) console.log('evidence: sim/test ' + stats.evidence.simOrTest + '/' + stats.rows + ' (' + Math.round(stats.evidence.simOrTestRatio * 100) + '%), docs-only ' + stats.evidence.docsOnly + ', real rows ' + stats.evidence.realRows)
    if (stats.verdicts) console.log('verdicts: ' + Object.entries(stats.verdicts).map(([k, v]) => k + ' ' + v).join(' · '))
    for (const w of warnings) console.log('WARN  ' + w.code + ': ' + w.message)
    for (const p of problems) console.log('FAIL  ' + p.code + ': ' + p.message)
    console.log(stats.ok ? 'MACRO RULES: PASS' : 'MACRO RULES: FAIL (' + problems.length + ' problem(s))')
  }
  if (!stats.ok) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
export { main as runMacroRulesAudit }
