#!/usr/bin/env node
/**
 * Regenerate the counts quoted by shipped docs FROM THE TREE (D1: derive, don't type).
 *
 *   node scripts/update-doc-counts.mjs        # rewrite the numbers in place
 *   node scripts/update-doc-counts.mjs --check # exit 1 if anything would change (used by CI habits)
 *
 * Authority: `node tests/run-tests.mjs --counts` (the gate's own job list) + `package.json#files`.
 * tests/audit-readme-counts.mjs is the guard that FAILS when a doc disagrees with either authority;
 * this script is how a maintainer fixes that red. Adding a test file therefore reddens the guard and
 * the fix is one command - the numbers can never be typed by hand again.
 *
 * Grep anchors: derive-doc-counts, update-doc-counts.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const checkOnly = process.argv.includes('--check')

const derived = JSON.parse(spawnSync(process.execPath, [join(REPO, 'tests', 'run-tests.mjs'), '--counts'], { cwd: REPO, encoding: 'utf8' }).stdout.trim())
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
const shipped = pkg.files.filter((f) => f.startsWith('tests/') && f.endsWith('.mjs'))
const shippedSuites = shipped.filter((f) => f.endsWith('.test.mjs')).length
const shippedProbes = shipped.length - shippedSuites

const edits = [
  {
    file: 'README.md',
    subs: [
      [/`TOTAL \d+`（\d+ 套件 \+ \d+ 探针\/变体）/, '`TOTAL ' + derived.total + '`（' + derived.suites + ' 套件 + ' + derived.probes + ' 探针/变体）'],
      [/\d+ 个 `tests\/\*\.mjs`（\d+ 个套件 \+ \d+ 个探针\/脚本）/, shipped.length + ' 个 `tests/*.mjs`（' + shippedSuites + ' 个套件 + ' + shippedProbes + ' 个探针/脚本）'],
    ],
  },
  {
    file: 'README.en.md',
    subs: [
      [/`TOTAL \d+ \((\d+) suites \+ (\d+) probes\/variants\)/, '`TOTAL ' + derived.total + ' (' + derived.suites + ' suites + ' + derived.probes + ' probes/variants)'],
      [/which \d+ of the `tests\/\*\.mjs` files ship in the package \(\d+ suites \+ \d+ probe\/script files\)/,
        'which ' + shipped.length + ' of the `tests/*.mjs` files ship in the package (' + shippedSuites + ' suites + ' + shippedProbes + ' probe/script files)'],
    ],
  },
  {
    file: 'docs/test-timing.md',
    subs: [
      [/\*\*\d+ 项\*\* = \d+ 套件 \+ \d+ 探针\/变体/, '**' + derived.total + ' 项** = ' + derived.suites + ' 套件 + ' + derived.probes + ' 探针/变体'],
      [/`TOTAL \d+  PASS \d+  FAIL 0  \(suites \d+ · probes \d+\)`/, '`TOTAL ' + derived.total + '  PASS ' + derived.total + '  FAIL 0  (suites ' + derived.suites + ' · probes ' + derived.probes + ')`'],
    ],
  },
  {
    file: 'docs/AUDIT-CHECKLIST.md',
    subs: [
      [/\d+ 项 = \d+ 套件 \+ \d+ 探针\/变体/, derived.total + ' 项 = ' + derived.suites + ' 套件 + ' + derived.probes + ' 探针/变体'],
    ],
  },
]

let changed = 0
for (const e of edits) {
  const p = join(REPO, e.file)
  let s = readFileSync(p, 'utf8')
  const before = s
  for (const [re, to] of e.subs) s = s.replace(re, to)
  if (s !== before) {
    changed++
    if (checkOnly) console.log('WOULD CHANGE ' + e.file)
    else { writeFileSync(p, s); console.log('updated ' + e.file) }
  }
}
console.log((checkOnly ? 'check: ' : '') + 'derived total=' + derived.total + ' suites=' + derived.suites + ' probes=' + derived.probes
  + ' | shipped tests/*.mjs=' + shipped.length + ' (' + shippedSuites + ' suites + ' + shippedProbes + ' probes/scripts) | files changed=' + changed)
process.exit(checkOnly && changed ? 1 : 0)
