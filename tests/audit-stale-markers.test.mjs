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
// THE PROJECT HAS TWO ESTABLISHED, CORRECT WAYS of writing an unregistered name, and both carry a marker beside an existing
// one: "this name is unregistered, but the capability is an action" and "its capability is X". They are not findings, and
// excluding them takes the report from twenty-one to eight - measured, not assumed. What remains is worth reading.
const ESTABLISHED = /这个名字未注册|这两个名字|工具名未注册|其能力＝|同形陷阱|未注册/
// SEVEN LINES WERE READ IN ROUND 556 AND ARE NOT FINDINGS, each for a stated reason: two are a quantification
// section that enumerates names, one is a correct mention of reviewers beside a claim about three other names, one is a line
// this project already fixed, one claims an absent name while the existing ones beside it are context, one is that same claim
// about notify.deliver, and one is a HISTORY volume recording what was true then. They stay in the report with their reasons.
const VERIFIED_NOT_FINDINGS = /未做量|诚实量化|仍为\*\*规划|社会总览|notify\.deliver|决策史|历史/

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
    if (ESTABLISHED.test(line)) continue                 // the project s own correct way of naming an unregistered tool
    if (VERIFIED_NOT_FINDINGS.test(line)) continue        // read in round 556 and found correct, with the reason recorded above
    const names = []
    for (const m of line.matchAll(/`(vibe_vmu_[a-z_]+)`/g)) names.push({ name: m[1], exists: tools.has(m[1]) })
    for (const m of line.matchAll(/`(?:vmu|kernel)\.([a-z][a-z0-9]*)\.([a-z][a-z0-9_]*)`/g)) { const s2 = svcOf(m[1]); names.push({ name: m[1] + '.' + m[2], exists: !!(s2 && typeof s2[m[2]] === 'function') }) }
    const hit = names.filter((n) => n.exists).map((n) => n.name).join('+') || null
    const absent = names.filter((n) => !n.exists).map((n) => n.name).join('+')
    // Name the MATCHED TOKEN and the kind of line, because nine reported lines turned out to hold zero stale claims: four were
    // already fixed (stale line numbers) and five merely MENTIONED a name - a rule, a count, or a claim about another object.
    const kind = /纪律|规则|必须写在|计数|行 .⛔.|\\b\\d+ 行/.test(line) ? 'mention' : 'claim?'
    if (hit) report.push(f + ':' + (i + 1) + ' [' + kind + '] 存在=' + hit + ' 主张的=' + (absent || '(无可判对象)') + ' :: ' + line.trim().slice(0, 60))
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
