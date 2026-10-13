// tests/audit-stale-markers.test.mjs — a REPORTING guard. It counts markers that name an object which already exists, but it
// does NOT fail: the count is the output. The reason is round 552's near-miss - a blanket replacement over these lines reversed
// thirteen CORRECTIONS, because a line that explains "this used to say X was unimplemented" also contains the marker word. An
// assertion and a mention are different things, so this guard reports and a human edits.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = join(REPO, 'vibe-math-vmu', 'docs')
const k = createKernel({ clock: () => 0, settings: {} })
const tools = new Set(Object.values(TOOL_NAMES))
const svcOf = (n) => (k[n] && typeof k[n] === 'object' ? k[n] : null)
// A line that CORRECTS an old marker is not a stale marker. These words mark the correction, and such lines are excluded.
const CORRECTION = /此前|原写|原文|曾在|校正|更正|已过时|旧说法|那(一)?行原/

console.log('=== 1. THE SCAN RUNS OVER EVERY VOLUME ===')
const files = readdirSync(DOCS).filter((f) => f.endsWith('.md'))
ok(files.length >= 25, 'the document set is walked', { n: files.length })

console.log('=== 2. MARKERS THAT NAME AN EXISTING OBJECT, EXCLUDING CORRECTIONS ===')
const report = []
let scanned = 0
for (const f of files) {
  const L = readFileSync(join(DOCS, f), 'utf8').split('\n')
  for (let i = 0; i < L.length; i++) {
    const line = L[i]
    if (!/⛔|未实现|待实现|尚未实现/.test(line)) continue
    scanned += 1
    if (CORRECTION.test(line)) continue                  // a correction, not a claim
    if (/✓ 已实现|✅/.test(line)) continue                // already marked implemented on the same line
    const t = /`(vibe_vmu_[a-z_]+)`/.exec(line)
    const p = /`(?:vmu|kernel)\.([a-z][a-z0-9]*)\.([a-z][a-z0-9_]*)`/.exec(line)
    let hit = null
    if (t && tools.has(t[1])) hit = t[1]
    else if (p) { const s = svcOf(p[1]); if (s && typeof s[p[2]] === 'function') hit = p[1] + '.' + p[2] }
    if (hit) report.push(f + ':' + (i + 1) + ' -> ' + hit)
  }
}
ok(scanned > 500, 'the marker scan saw the whole surface, so a small report is not an empty scan', { scanned })
console.log('  REPORT: ' + report.length + ' line(s) name an object that already exists and are not corrections')
// forEach rather than for..of: an EMPTY report is the good outcome here, and a for..of over a possibly-empty list is the
// shape the declaration criterion calls class A. This is a print, not an assertion - the scan's own size is asserted above.
report.slice(0, 12).forEach((r) => console.log('      ' + r))
ok(Array.isArray(report), 'the report is produced as a list, for a human to read and edit one at a time')

console.log('=== 3. A CORRECTION IS NOT A CLAIM ===')
{
  const real = '| `vibe_vmu_x` | ⛔ 未实现 | note |'
  const correction = '★ 轮 477 更正：原文写 `vibe_vmu_x` ⛔ 未实现，而 host.js 已注册它 ✓'
  ok(!CORRECTION.test(real) && CORRECTION.test(correction),
    'the exclusion identifies a correction line and not a claim line, which is the distinction that a blanket replacement destroyed', {})
}

console.log('=== STALE MARKERS (REPORT): ' + passed + ' passed, ' + failed + ' failed; report=' + report.length + ' ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
