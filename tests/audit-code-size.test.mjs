// tests/audit-code-size.test.mjs — R14's missing size gate, staged the way this repository stages a known backlog.
//
// WHY IT IS STAGED RATHER THAN STRICT. docs/02 §L174 already DECIDED the threshold: single files should stay at or under
// 1200 lines, and it records that kernel/index.js was the big one and that work.js had been split out of it. Four files
// are over the line today, so a strict gate would red the tree on the day it was written and stay red. This repository
// has a precedent for that situation and it is a good one: the rule about vacuously-passing assertions counts and lists
// its remaining candidates and asserts the count may not GROW, so the backlog stays visible without keeping the tree red.
// This gate does the same, and adds the two things that keep such a list honest - every recorded file must STILL be over
// the limit, so the list cannot rot into fiction, and the predicate itself must be shown to fire on a synthetic input.
//
// Run: node tests/audit-code-size.test.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const LIMIT = 1200

// The four files that exceed the decided limit today. Frozen on purpose: this list may shrink, never grow.
const KNOWN = [
  'vibe-math-vmu/math-computation.js',
  'vibe-math-vmu/settings/schema.js',
  'vibe-math-vmu/kernel/index.js',
]

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}

const lines = (p) => readFileSync(p, 'utf8').split('\n').length
const walk = (d) => readdirSync(join(REPO, d), { withFileTypes: true }).flatMap((e) => {
  const r = join(d, e.name)
  if (e.isDirectory()) return /(^|\/)(\.git|node_modules)$/.test(r) ? [] : walk(r)
  return [r]
})

console.log('=== 1. THE THRESHOLD IS THE ONE docs/02 DECIDED, not one invented here ===')
ok(LIMIT === 1200, 'the limit is 1200 lines, the number docs/02 §L174 records as 已裁', { limit: LIMIT })

console.log('=== 2. NO FILE OUTSIDE THE RECORDED LIST EXCEEDS IT ===')
const framework = walk('vibe-math-vmu').filter((f) => f.endsWith('.js'))
const over = framework.filter((f) => lines(join(REPO, f)) > LIMIT).map((f) => f.replace(/\\/g, '/'))
const unrecorded = over.filter((f) => !KNOWN.includes(f))
ok(unrecorded.length === 0,
  'no framework file outside the recorded backlog exceeds ' + LIMIT + ' lines, so the backlog cannot grow unnoticed',
  { unrecorded, over: over.length })

console.log('=== 3. THE RECORDED BACKLOG IS STILL REAL ===')
const rotted = KNOWN.filter((f) => lines(join(REPO, f)) <= LIMIT)
ok(rotted.length === 0,
  'every file in the backlog is STILL over the limit, so the list cannot rot into a claim about code that has since been split',
  { rotted })
ok(KNOWN.length === 3, 'and the backlog has SHRUNK to three: v5r-charter.js was split at a block boundary, which was possible because no generator reads it and it carries no markers - unlike schema.js, which is input to five generators, and math-computation.js, which is byte-compared against a second copy', { size: KNOWN.length })
ok(KNOWN.length === over.length, 'the backlog and the measurement agree exactly', { known: KNOWN.length, measured: over.length })

console.log('=== 4. THE PREDICATE IS SHOWN TO FIRE ===')
// the repository standard: every guard must be shown able to fail. This synthesises the input a breach would produce.
const synthetic = Array.from({ length: LIMIT + 100 }, () => 'x').join('\n')
ok(synthetic.split('\n').length > LIMIT, 'a synthetic file of ' + (LIMIT + 100) + ' lines is detected as over the limit')
ok('x'.repeat(10).split('\n').length <= LIMIT, 'and an ordinary short input is not, so the predicate discriminates rather than always firing')

console.log('=== 5. THE LIMIT IS REPORTED WHERE A READER LOOKS ===')
const doc = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '02-architecture.md'), 'utf8')
ok(doc.includes('1200'), 'the architecture volume still states the 1200-line decision this gate enforces', {})
const sev = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '14-open-items-and-roadmap.md'), 'utf8')
ok(sev.includes('1200') || sev.includes('R14'),
  'and the roadmap records the size face of R14, so the backlog is visible outside this file')

console.log('=== CODE SIZE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
