// ============================================================================
// audit-prompt-duplication.mjs — shipped invariant for v2/v3/v4 (v5 has its own,
// tests/audit-v5-prompt-duplication.mjs): every preset's injected toolkit prompt
// text exists TWICE in its `agent.cordis.yml` (two agent-instructions entries:
// office + members). In these three presets the SECOND entry continues with more
// YAML after the shared toolkit text, so the invariant is stated as:
//   (1) the two copies share a substantial COMMON PREFIX of prompt lines (≥ 60% of
//       the shorter copy, and every line the first copy adds beyond the prefix is
//       pure YAML scaffolding — never prompt prose), and
//   (2) the review-10 clauses (V2-1 disclosures, V2-3 path bases) are present inside
//       that shared prefix, i.e. in BOTH copies.
// No YAML anchor is used on purpose (it would change what the loader expands).
// Falsifiability: `tests/audit-prompt-duplication.mutants.mjs` (single-copy edit ⇒ named red).
// Run: node tests/audit-prompt-duplication.mjs [--json]
// ============================================================================
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PRESETS = ['vibe-math-v2', 'vibe-math-v3', 'vibe-math-v4']
// In-memory single-site mutation for the mutants driver: [preset, from, to] (first occurrence only).
const MUT = process.env.PROMPT_DUP_MUTATE ? JSON.parse(process.env.PROMPT_DUP_MUTATE) : null
const SKIP_CLAUSES = process.env.PROMPT_DUP_SKIP_CLAUSES === '1'

const PATH_CLAUSES = [
  ['V2-3 base statement', /every path here is resolved against the SESSION WORKING DIRECTORY/],
  ['V2-3 short-form equivalence', /names the SAME file/],
]
// Clause expectations are CODE-TRUTH-DRIVEN, not global: a DISCLOSURE is required only in presets
// whose code actually implements that behaviour, and the guard checks BOTH directions (prompt
// declares it ⇔ the JS carries the behaviour marker, re-measured every run). Asserting all three
// disclosures for v4 would be a WRONG invariant — v4 implements none of them (it only has the
// post-compaction recap, which is a follow-up window) — so the expectation is parameterised, not
// silently weakened.
const DISCLOSURES = [
  ['V2-1 paper force-finalise / reaping disclosure', /DISCLOSURE \(existing behaviour\): the FINAL PAPER/, /reapedThisRun|forcedAfterCap/],
  ['V2-1 auto-resolve disclosure', /DISCLOSURE \(existing behaviour\): switching the mode to `auto`/, /auto-resolved/],
  ['V2-1 progress-push disclosure', /DISCLOSURE \(existing behaviour\): the framework itself pushes a progress/, /\u8fdb\u5ea6\u66f4\u65b0\uff1a/],
]
const EXPECTED = {
  'vibe-math-v2': [true, true, true],
  'vibe-math-v3': [true, true, true],
  'vibe-math-v4': [false, false, false],
}
const normLine = (l) => l.replace(/\s+/g, ' ').replace(/\{\{cwd\}\}|\{\{model\}\}/g, '<T>').trim()
const SCAFFOLD = /^(-|#|\s*$)|^(suffix|text|priority|config|name|id|content|role):|^You are a coding agent powered by/

const failures = []
let passed = 0
const check = (cond, msg) => { if (cond) passed += 1; else failures.push(msg) }
const report = []

for (const preset of PRESETS) {
  const rel = preset + '/agent.cordis.yml'
  const abs = join(REPO, rel)
  if (!existsSync(abs)) { check(false, rel + ' is missing'); continue }
  let text = readFileSync(abs, 'utf8')
  if (MUT && MUT[0] === preset) {
    const i = text.indexOf(MUT[1])
    if (i === -1) { check(false, preset + ': mutant anchor not found (harness problem)'); continue }
    text = text.slice(0, i) + MUT[2] + text.slice(i + MUT[1].length)
  }
  const lines = text.split('\n')
  const starts = []
  lines.forEach((l, i) => { if (/## Vibe Math V\d+ toolkit/.test(l) || /This session includes "Vibe Math V/.test(l)) starts.push(i) })
  const heads = []
  for (const s of starts) if (!heads.length || s - heads[heads.length - 1] > 3) heads.push(s)
  check(heads.length === 2, preset + ': exactly TWO toolkit prompt copies (got ' + heads.length + ' at ' + JSON.stringify(heads.map((h) => h + 1)) + ')')
  if (heads.length !== 2) { report.push({ preset, copies: heads.length }); continue }
  const A = lines.slice(heads[0], heads[1]).map(normLine).filter((x) => x)
  const B = lines.slice(heads[1]).map(normLine).filter((x) => x)
  let common = 0
  while (common < A.length && common < B.length && A[common] === B[common]) common += 1
  const shared = A.slice(0, common).join(' ')
  const tailA = A.slice(common)
  const shorter = Math.min(A.length, B.length)
  const ratio = common / Math.max(1, shorter)
  check(ratio >= 0.6, preset + ': the two copies share a substantial common prefix (' + common + '/' + shorter + ' = ' + ratio.toFixed(2) + ' ≥ 0.60)')
  const proseTail = tailA.filter((l) => !SCAFFOLD.test(l))
  check(proseTail.length === 0, preset + ': everything the first copy adds beyond the shared prefix is YAML scaffolding, not prompt prose (' + proseTail.length + ' prose line(s) left'
    + (proseTail.length ? ': ' + JSON.stringify(proseTail.slice(0, 2).map((x) => x.slice(0, 60))) : '') + ')')
  if (!SKIP_CLAUSES) {
    for (const [name, re] of PATH_CLAUSES) check(re.test(shared), preset + ': ' + name + ' present in BOTH copies (inside the shared prefix)')
    // bidirectional: the prompt declares the behaviour ⇔ the JS carries its marker
    const jsAbs = join(REPO, preset, preset + '.js')
    const js = existsSync(jsAbs) ? readFileSync(jsAbs, 'utf8') : ''
    check(!!js, preset + ': the JS source is readable for the code-truth check')
    DISCLOSURES.forEach(([name, promptRe, codeRe], i) => {
      const expected = EXPECTED[preset][i]
      const inCode = codeRe.test(js)
      check(inCode === expected, preset + ': code-truth for "' + name + '" (expected=' + expected + ', code marker present=' + inCode + ')')
      if (expected) check(promptRe.test(shared), preset + ': ' + name + ' present in BOTH copies (inside the shared prefix)')
      else check(!promptRe.test(shared), preset + ': ' + name + ' must NOT be declared here (the code does not implement it)')
    })
  }
  report.push({ preset, copies: 2, sharedLines: common, ratio: Number(ratio.toFixed(3)) })
}

if (process.argv.includes('--json')) console.log(JSON.stringify({ passed, failed: failures.length, failures, report }))
else {
  console.log('v2/v3/v4 prompt duplication audit')
  for (const r of report) console.log('  ' + r.preset + ': copies=' + r.copies + ' sharedLines=' + r.sharedLines + ' ratio=' + r.ratio)
  for (const f of failures) console.log('  FAIL - ' + f)
  console.log((failures.length ? 'FAILED' : 'ALL GREEN') + ' — passed=' + passed + ' failed=' + failures.length)
}
process.exit(failures.length ? 1 : 0)
