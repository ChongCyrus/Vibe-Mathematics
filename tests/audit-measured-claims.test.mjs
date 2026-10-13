// tests/audit-measured-claims.test.mjs - a line that says it was measured by the generator must not carry hand-written numbers.
//
// WHY. docs/04 said "现状（由生成器实测，勿手写 ✗）: the settings table has 1147 keys, 1028 wired, 119 not wired, 96 planned" -
// and the generator reports 1151 with 1029 wired and 122 declared-but-not-wired. The line instructing the reader not to
// hand-write numbers was itself hand-written and stale, three times over. Numbers that a generator can produce are not
// repeated here; they are replaced by a pointer to the generated table, which is the reading that cannot go stale.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const DOCS = join(REPO, 'vibe-math-vmu', 'docs')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

console.log('=== 1. THE VOLUMES ARE READ ===')
const docs = readdirSync(DOCS).filter((f) => /^\d\d-.*\.md$/.test(f)).sort()
ok(docs.length >= 25, 'the volumes are read', { n: docs.length })

console.log('=== 2. A LINE THAT CLAIMS GENERATOR PROVENANCE CARRIES NO HAND-WRITTEN COUNT ===')
// A claim of provenance is phrases like "由生成器实测" / "勿手写" / "由生成器产出"; such a line may cite a table but must not
// assert a number of its own, because nothing keeps that number true.
const CLAIM = /由生成器实测|勿手写|由生成器产出|生成器原文/
const offenders = []
for (const f of docs) {
  const L = readFileSync(join(DOCS, f), 'utf8').split('\n')
  L.forEach((l, i) => {
    if (!CLAIM.test(l)) return
    if (!/[0-9]/.test(l)) return
    // a pointer to a generated table is fine; a bare count is not
    if (/见 .*生成|见本节末尾|见 .*索引|生成式|BEGIN GENERATED/.test(l)) return
    // The gate-count line cannot be generated: it is a runtime report, and the line says so and defers to --check. Accepting
    // that pointer is more honest than forbidding the line from existing.
    if (/以 .*--check.* 的输出为准|只能由运行实报/.test(l)) return
    // A line that defers to the generator by naming it is giving the pointer this check asks for.
    if (/node scripts\/generate-[\w-]+\.mjs/.test(l)) return
    // A HISTORICAL NOTE IS NOT A COUNT. A line that records which numbers it used to carry is explaining a correction; the
    // exemption is asserted below so it cannot silently widen.
    if (/原先写|曾写|本格原先|本行原先|更正/.test(l)) return
    offenders.push(f.slice(0, 2) + ':' + (i + 1) + '  ' + l.trim().slice(0, 120))
  })
}
let historical = 0
for (const f of docs) for (const l of readFileSync(join(DOCS, f), 'utf8').split('\n')) if (CLAIM.test(l) && /原先写|曾写|本格原先|本行原先|更正/.test(l)) historical += 1
ok(historical >= 1, 'at least one historical note exists, which is what the exemption above rests on', { historical })

ok(offenders.length === 0,
  'no line claims generator provenance while asserting a count of its own: such a count is hand-written whatever the line says',
  { offenders })

console.log('=== 3. AND THE GENERATOR S OWN NUMBERS ARE READABLE WHERE THEY MATTER ===')
// the settings count is the one that was wrong; it must now be reachable from the generated table, not asserted in prose
const d4 = readFileSync(join(DOCS, '04-settings.md'), 'utf8')
ok(/BEGIN GENERATED: settings-index/.test(d4) || /设置家族索引/.test(d4),
  'the settings volume points at a generated table rather than asserting its own totals')

console.log('=== MEASURED CLAIMS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
