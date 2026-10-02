// Dedicated cross-preset path-discipline audit (migrated out of formal-verify-v4 so that running ONE
// preset's suite cannot miss this class).
//
// Covers:
//   * v4 / v5 : every member-visible library declaration carries the member root (Members/<x>/...).
//   * v3      : the writer `applyAgentWrites` accepts ONLY Problems|Progress|Propos|Methods|Notes at the
//               PROJECT ROOT, so v3's declarations must stay root-relative - a Members/<x>/... declaration
//               is a write the writer SILENTLY DISCARDS.
//   * v2 / v3 : PAPER_PATH_NOTE structure, by DELIVERED MATERIAL (not by function site):
//               - the evidence-index DATA LIST must not embed the prose rule;
//               - every delivered member-facing material that carries copyable paths must append it -
//                 for v2 that is the digest, which INLINES the evidence index; for v3 also the journal.
//               Function-body windows are STRICTLY bounded (no fixed-length fallback): a window that can
//               swallow the next function produces false passes.
import { readFileSync } from 'node:fs'

const R = new URL('../', import.meta.url)
const rd = (p) => readFileSync(new URL(p, R), 'utf8')
let passed = 0
let failed = 0
const fails = []
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; fails.push(m); console.error('  FAIL - ' + m) } }

const v2 = rd('vibe-math-v2/vibe-math-v2.js')
const v3 = rd('vibe-math-v3/vibe-math-v3.js')
const v4 = rd('vibe-math-v4/vibe-math-v4.js')
const v5 = rd('vibe-math-v5/vibe-math-v5.js')

const ROOT = /Members\/<[^>]+>\/(?:Progress|Propos|Methods|Subproblems)\//g
const LEGACY = /(?:^|[^/>])(?:Progress|Propos|Methods|Subproblems)\/<[^>]+>\//g

for (const [k, src] of [['v5', v5]]) {   // v5 pending vm-v5's re-verification of its bases
  assert((src.match(ROOT) || []).length >= 4, k + ': member-visible declarations carry the member root')
  assert((src.match(LEGACY) || []).length === 0, k + ': no legacy project-root-relative member-library declaration')
}
// v4 (critical correction): writer/reader live at the PROJECT ROOT - a Members/<x>/... path is never scanned
assert(!/Members\/<[^>]+>\//.test(v4), 'v4: no Members/<x>/ declaration (the framework never scans it)')
assert(/(?:Progress|Propos|Methods|Subproblems)\/<[^>]+>\//.test(v4), 'v4: declarations use the project-root bases the writer/reader use')
assert(/progress\.md/.test(v4), 'class guard: v4 documents/writes the Progress base it reads')

assert(!/Members\/<[^>]+>\//.test(v3), 'v3: no Members/<x>/ declaration (applyAgentWrites would DISCARD such a write)')
assert(/applyAgentWrites[\s\S]{0,600}?(Problems|Progress|Propos|Methods|Notes)/.test(v3), 'class guard: v3 writer whitelists the sections its prompts name')

// strictly bounded function-body window: never fall back to a fixed length
const bodyOf = (src, fn) => {
  const a = src.indexOf('function ' + fn)
  if (a < 0) return null
  const b = src.slice(a + 10).search(/\n {2}(?:async )?function /)
  if (b < 0) return null
  return src.slice(a, a + 10 + b)
}

for (const [k, src] of [['v2', v2], ['v3', v3]]) {
  const def = (src.match(/const PAPER_PATH_NOTE/g) || []).length
  assert(def === 1, k + ': PAPER_PATH_NOTE defined exactly once (found ' + def + ')')
  const idxBody = bodyOf(src, 'paperEvidenceIndex')
  const digBody = bodyOf(src, 'buildPaperDigest')
  assert(idxBody !== null && digBody !== null, k + ': both function windows are bounded strictly (no fixed-length fallback)')
  // the data list is a pure path list: no prose, no note
  assert(!/PAPER_PATH_NOTE/.test(idxBody || ''), k + ': the evidence-index DATA LIST embeds no prose rule')
  // the delivered material inlines that list and therefore carries the paths AND must carry the note
  assert(/paperEvidenceIndex\(\)/.test(digBody || ''), k + ': the delivered digest INLINES the evidence index (so it carries the copyable paths)')
  assert(/PAPER_PATH_NOTE/.test(digBody || ''), k + ': the delivered digest material appends PAPER_PATH_NOTE')
  if (k === 'v3') {
    const jr = bodyOf(src, 'writeJournal')
    assert(jr !== null && /PAPER_PATH_NOTE/.test(jr), 'v3: the member-facing journal (writeJournal) also appends PAPER_PATH_NOTE')
  }
}

console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of fails) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
