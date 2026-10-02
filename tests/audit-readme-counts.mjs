#!/usr/bin/env node
/**
 * README/COUNT CONSISTENCY — the numbers quoted in shipped docs are DERIVED, not typed.
 *
 * DEFECT CLASS: "documented count drifts from the tree" (D1). README quoted `TOTAL 57` (39 suites /
 * 18 probes, "18 items ship") while the runner produced 65, then 83, and `docs/test-timing.md` and
 * `docs/AUDIT-CHECKLIST.md` disagreed with each other. The authority is
 * `node tests/run-tests.mjs --counts` (the same job list the gate runs) plus `package.json#files`
 * for the shipped count — this guard fails when any of the three docs disagrees with either.
 *
 * Run: node tests/audit-readme-counts.mjs
 * Env (mutant harness): COUNTS_README / COUNTS_README_EN / COUNTS_TIMING / COUNTS_CHECKLIST override paths.
 */
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
let passed = 0, failed = 0
const failures = []
const ok = (cond, label, detail) => { if (cond) passed++; else { failed++; failures.push(label + (detail ? ' — ' + detail : '')) } }

const derivedRaw = spawnSync(process.execPath, [join(HERE, 'run-tests.mjs'), '--counts'], { cwd: REPO, encoding: 'utf8' })
let derived = null
try { derived = JSON.parse(String(derivedRaw.stdout || '').trim()) } catch (e) { /* reported below */ }
ok(!!derived && derived.total > 0 && derived.suites > 0,
  'the runner --counts mode produces the derived totals (suites/probes/total)', String(derivedRaw.stdout || '').slice(0, 70))

const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
const shippedTests = pkg.files.filter((f) => f.startsWith('tests/') && f.endsWith('.mjs'))
const shippedSuites = shippedTests.filter((f) => f.endsWith('.test.mjs')).length
const shippedProbes = shippedTests.length - shippedSuites
ok(shippedTests.length > 0 && shippedSuites > 0, 'package.json#files yields the shipped tests split',
  JSON.stringify({ shipped: shippedTests.length, suites: shippedSuites, probes: shippedProbes }))

const read = (envName, rel) => {
  const v = process.env[envName]
  return readFileSync(v ? (isAbsolute(v) ? v : join(REPO, v)) : join(REPO, rel), 'utf8')
}
const zh = read('COUNTS_README', 'README.md')
const en = read('COUNTS_README_EN', 'README.en.md')
const tt = read('COUNTS_TIMING', 'docs/test-timing.md')
const ck = read('COUNTS_CHECKLIST', 'docs/AUDIT-CHECKLIST.md')

if (derived) {
  const zhNeedle = '`TOTAL ' + derived.total + '`（' + derived.suites + ' 套件 + ' + derived.probes + ' 探针/变体）'
  ok(zh.indexOf(zhNeedle) !== -1, '★ README.md quotes the DERIVED totals', 'looked for ' + zhNeedle)
  const zhShipNeedle = shippedTests.length + ' 个 `tests/*.mjs`'
  ok(zh.indexOf(zhShipNeedle) !== -1, '★ README.md quotes the DERIVED shipped-tests count', 'looked for ' + zhShipNeedle)
  const enNeedle = 'TOTAL ' + derived.total
  ok(en.indexOf(enNeedle) !== -1, '★ README.en.md quotes the derived TOTAL', 'looked for ' + enNeedle)
  const enShipNeedle = shippedTests.length + ' of the `tests/*.mjs` files ship'
  ok(en.indexOf(enShipNeedle) !== -1, '★ README.en.md quotes the derived shipped count', 'looked for ' + enShipNeedle)
  const ttNeedle = '**' + derived.total + ' 项** = ' + derived.suites + ' 套件 + ' + derived.probes + ' 探针/变体'
  ok(tt.indexOf(ttNeedle) !== -1, '★ docs/test-timing.md quotes the derived counts', 'looked for ' + ttNeedle)
  const ckNeedle = derived.total + ' 项 = ' + derived.suites + ' 套件 + ' + derived.probes + ' 探针/变体'
  ok(ck.indexOf(ckNeedle) !== -1, '★ docs/AUDIT-CHECKLIST.md quotes the derived counts', 'looked for ' + ckNeedle)
  ok(!/TOTAL 57/.test(zh), 'the stale README claim (TOTAL 57) is gone')
  ok(!/TOTAL 65  PASS 65/.test(tt), 'the old test-timing baseline row (TOTAL 65 PASS 65) is gone')
  ok(!/\*\*65 项\*\* = 44 套件 \+ 21/.test(tt + ck), 'no bolded stale 65-item claim remains (prose mentions of the migration are fine)')
}

console.log('')
console.log('=== README COUNTS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
