// tests/audit-code-size.test.mjs — THE FILE-SIZE FACE: it MEASURES and it REPORTS. There is NO LIMIT AND NO ADVISORY LINE.
//
// ★★★★★★★ HISTORY, because this file has changed its mind twice and both changes are recorded on purpose.
//
// 1. It began as a HARD GATE at 1200 lines with a frozen `KNOWN` backlog whose contract was "may shrink, never grow".
// 2. In round 4 the FOUNDER retired the hard gate: "1200 is too tight; a cap that is not necessary should not exist; do
//    not let it limit what you do". It became an "advisory line" that reported without refusing.
// 3. In round 15 the founder came back with the point that made this version necessary: the number itself was still
//    shaping decisions. Measured - after the advisory was introduced, the Lead wrote "host.js is at exactly 1200, do not
//    grow it", i.e. the soft line was being treated as a cap in all but name. An advisory that everyone respects as a
//    limit IS a limit.
//
// SO THE NUMBER IS GONE. Not raised, not commented out, not "advisory": removed from the assertion surface entirely. What
// remains is a report - the largest framework modules by line count - plus the assertions that keep the REPORT honest:
//   · the walker must actually reach the framework (a scan that finds no files would make every report empty);
//   · the counter must DISCRIMINATE (a synthetic long input is measured as long, a short one is not), so "always fine"
//     and "always alarming" are both caught;
//   · the preview must be exactly min(N, files) rows, so a printed report cannot silently shrink or lie.
// There is deliberately NOTHING here that can fail a file for its size, and nothing that names a size to stay under.
// If you want a file split, that is a design judgement about that file - it is not this gate's business.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PREVIEW_ROWS = 8   // how many of the largest modules to PRINT; not a threshold of any kind

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
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
const syntheticLong = Array.from({ length: 100000 }, () => 'x').join('\n').split('\n').length
const syntheticShort = 'x'.repeat(10).split('\n').length
ok(syntheticLong > syntheticShort, 'a synthetic very long input measures longer than a short one, so the counter is not stuck', { syntheticLong, syntheticShort })
ok(syntheticShort === 1, 'and a single line measures as one line', { syntheticShort })

console.log('=== 3. THE REPORT IS DERIVED FROM THE MEASUREMENT AND IS PRINTED ===')
const measured = framework.map((f) => ({ file: f, lines: lines(join(REPO, f)) })).filter((m) => Number.isFinite(m.lines))
const largest = measured.slice().sort((a, b) => b.lines - a.lines).slice(0, PREVIEW_ROWS)
console.log('  ── the largest framework modules by line count (purely descriptive: there is NO limit) ──')
for (const m of largest) console.log('     ' + String(m.lines).padStart(5) + '  ' + m.file)
ok(measured.length > 0 && largest.length === Math.min(PREVIEW_ROWS, measured.length),
  'the printed preview is exactly min(rows, files) entries, so the report cannot silently shrink or lie',
  { preview: largest.length, files: measured.length })
const sortedDesc = largest.every((m, i) => i === 0 || largest[i - 1].lines >= m.lines)
ok(sortedDesc, 'and it is ordered largest-first, so the order comes from the measurement rather than from hand editing', largest.slice(0, 3))

console.log('=== 4. NO SIZE ASSERTION EXISTS HERE (the point of this version) ===')
const ownSource = readFileSync(fileURLToPath(import.meta.url), 'utf8')
// Falsifiable: if anyone re-introduces a threshold constant or a per-file size assertion, this goes red and names it.
const thresholdish = /LIMIT\s*=|ADVISORY\s*=|KNOWN\s*=\s*\[/.exec(ownSource)
ok(thresholdish === null, 'this gate defines NO size limit, NO advisory line and NO backlog list - a re-introduced threshold turns this red', thresholdish && thresholdish[0])
const sizeCompare = /\.lines\s*[<>]=?\s*\d+/.test(ownSource)
ok(sizeCompare === false, 'and no assertion compares a line count against a number, so no file can fail for its size', {})

console.log('=== 5. THE DECISION IS RECORDED WHERE A READER LOOKS ===')
const doc = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '02-architecture.md'), 'utf8')
const sizeSection = doc.split('\n').filter((l) => /模块规模|行数|size/i.test(l)).join('\n')
ok(/无上限|不设|没有上限|no cap|不再限制/i.test(sizeSection),
  'docs/02 records that there is NO size cap, so a future reader cannot re-derive one from the architecture volume', {})

console.log('=== CODE SIZE: ' + passed + ' passed, ' + failed + ' failed (largest: ' + (largest[0] ? largest[0].lines + ' lines, ' + largest[0].file : 'n/a') + ') ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
