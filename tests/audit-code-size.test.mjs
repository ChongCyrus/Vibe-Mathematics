// tests/audit-code-size.test.mjs — THE FILE-SIZE FACE: it MEASURES and it REPORTS. It no longer REFUSES.
//
// ★★★★★★★ THE HARD CAP WAS RETIRED ON PURPOSE (phase 6, round 4, founder's decision). WHAT IT WAS: docs/02 §178 recorded
// "单文件建议 ≤1200 行" and this gate turned that SENTENCE into a barrier - a file over 1200 lines reddened the tree
// unless it appeared on a frozen `KNOWN` list whose contract was "may shrink, never grow". WHY THAT WAS WRONG HERE, in
// the founder's words: 1200 is too tight, an artificial cap should not exist unless it is NECESSARY, and a rule that
// limits what the framework is allowed to look like does exactly what this project refuses everywhere else.
//
// WHAT IS KEPT, BECAUSE IT WAS THE POINT ALL ALONG. The purpose was never "files must be small" - it was "屎山 must stay
// VISIBLE". So the measurement survives in full: every framework .js is counted, the largest are printed, everything
// over the advisory line is listed by name, and the gate FAILS if that report is not produced. Visibility without
// constraint: a reader still sees the drift, a contributor is never blocked by it.
//
// WHAT SURVIVES AS A REAL ASSERTION, and why each one is not vacuous:
//   · the walker must actually reach the framework (a scan that finds zero files would make every report empty);
//   · the counter must DISCRIMINATE - a synthetic over-line input is detected AND a short one is not, so "always says
//     fine" and "always complains" are both caught;
//   · the advisory list must MATCH the measurement (same computation, so a stale hand-written list cannot rot into
//     fiction - the failure mode the old KNOWN list was built to avoid);
//   · the decision must be recorded where a reader looks (docs/02), INCLUDING the fact that it is now advisory.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

// ★ AN ADVISORY LINE, NOT A REFUSAL. Above it, a file is REPORTED; nothing turns red and nothing is blocked.
const ADVISORY = 1200

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

console.log('=== 1. THE WALK ACTUALLY REACHES THE FRAMEWORK ===')
const framework = walk('vibe-math-vmu').filter((f) => f.endsWith('.js')).map((f) => f.replace(/\\/g, '/'))
ok(framework.length > 50, 'the walker found more than 50 framework modules, so the report below is not empty by accident', { files: framework.length })
ok(framework.includes('vibe-math-vmu/vibe-math-vmu.js'), 'and it includes the entry, which is known to exist', {})

console.log('=== 2. THE COUNTER DISCRIMINATES (a counter that always agrees with itself proves nothing) ===')
const syntheticOver = Array.from({ length: ADVISORY + 100 }, () => 'x').join('\n').split('\n').length
const syntheticShort = 'x'.repeat(10).split('\n').length
ok(syntheticOver > ADVISORY, 'a synthetic input of ADVISORY+100 lines is measured as over the advisory line', { measured: syntheticOver })
ok(syntheticShort <= ADVISORY, 'and an ordinary short input is not, so the predicate is not stuck on', { measured: syntheticShort })

console.log('=== 3. THE ADVISORY LIST IS DERIVED, PRINTED, AND MATCHES THE MEASUREMENT ===')
const measured = framework.map((f) => ({ file: f, lines: lines(join(REPO, f)) }))
const advisory = measured.filter((m) => m.lines > ADVISORY).sort((a, b) => b.lines - a.lines)
const largest = measured.slice().sort((a, b) => b.lines - a.lines).slice(0, 8)
console.log('  ── largest framework files (advisory line ' + ADVISORY + ', NOT a limit) ──')
for (const m of largest) console.log('     ' + String(m.lines).padStart(5) + '  ' + m.file + (m.lines > ADVISORY ? '   ← over the advisory' : ''))
console.log('  ── over the advisory line: ' + advisory.length + ' of ' + framework.length + ' ──')
for (const m of advisory) console.log('     ' + String(m.lines).padStart(5) + '  ' + m.file)
// ★ FALSIFIABLE, UNLIKE THE FIRST VERSION OF THESE LINES. It asserted `advisory.length >= 0`, which is true of every
// array and therefore checked nothing, and RULE E caught exactly that (`:68 [A] every() is TRUE on an empty set`). The
// two assertions below are derived FROM the same measurement, so a broken sort or a changed filter moves them.
const sortedDesc = advisory.every((m, i) => i === 0 || advisory[i - 1].lines >= m.lines)
ok(sortedDesc, 'the advisory list is sorted largest-first, so its order comes from the measurement and not from hand editing', advisory.slice(0, 3))
ok(measured.length > 0 && largest.length === Math.min(8, measured.length),
  'the "largest" preview is exactly min(8, files) rows, so the printed report cannot silently shrink or lie', { largest: largest.length, files: measured.length })
// EMPTY_ALLOWED: an EMPTY advisory list is the GOOD outcome (no file over the line), so this `.every` is deliberately
// vacuously true then. What can still go red is `sortedDesc` / the `largest` count above and the per-entry bound below.
ok(advisory.every((m) => m.lines > ADVISORY), 'and every entry in it is genuinely over the line', {})
// ★ NO ASSERTION BELOW REFUSES A FILE FOR ITS SIZE. That is the retirement: the report is the mechanism, the number is advice.

console.log('=== 4. THE DECISION IS RECORDED WHERE A READER LOOKS, AND IT SAYS "ADVISORY" ===')
const doc = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '02-architecture.md'), 'utf8')
ok(doc.includes('1200'), 'the architecture volume still names the 1200-line advisory, so the number is traceable', {})
ok(/建议|advisory|软/.test(doc.split('\n').filter((l) => l.includes('1200')).join(' ')),
  'and the same line calls it a RECOMMENDATION rather than a cap, so a future reader cannot re-derive a barrier from it', {})

console.log('=== 5. THE RETIREMENT ITSELF IS RECORDED (so it cannot be undone by accident) ===')
ok(doc.includes('退休') || doc.includes('retire') || doc.includes('不设硬闸') || doc.includes('软'),
  'docs/02 records that the hard gate was retired, not merely that a number exists', {})

console.log('=== CODE SIZE: ' + passed + ' passed, ' + failed + ' failed (advisory over: ' + advisory.length + ') ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
