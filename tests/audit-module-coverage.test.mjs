// tests/audit-module-coverage.test.mjs - EVERY kernel module's exports must be named by some volume.
//
// WHY. Rounds 500 to 511 walked a path: docs/02 named 24 of 84 modules by hand, then seven volumes turned out to name none of
// their module's exports, then five more, until a full sweep showed 85 modules with exports and every one of them fully named.
// That property is the point of the work - a reader can find what a module offers - so it is asserted here rather than left as
// a fact that happened to be true in the round it was measured. The check is derived from the code and the volumes, so it
// cannot go stale, and it fails the moment a new module or export appears without a volume naming it.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
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

// Boilerplate every kernel module carries, plus the declared/wired key vocabularies that appear in generated tables.
const BOILER = new Set(['apiVersion', 'refuse', 'ENFORCED_SCOPE', 'WIRED_KEYS', 'UNWIRED_REASONS', 'DECLARED_KEYS', 'EXTRA_WIRED_KEYS', 'PLANNED_KEYS'])

console.log('=== 1. THE MODULES AND THE VOLUMES ARE READ ===')
const docs = readdirSync(DOCS).filter((f) => /^\d\d-.*\.md$/.test(f)).sort()
const docText = docs.map((f) => readFileSync(join(DOCS, f), 'utf8'))
ok(docs.length >= 25, 'the volumes are read', { n: docs.length })
const mods = readdirSync(join(REPO, 'vibe-math-vmu', 'kernel')).filter((f) => f.endsWith('.js')).map((f) => 'vibe-math-vmu/kernel/' + f)
mods.push('vibe-math-vmu/math-computation.js')
ok(mods.length >= 80, 'and the kernel modules', { n: mods.length })

console.log('=== 2. EVERY MODULE WITH EXPORTS IS NAMED BY SOME VOLUME, EXPORTS AND ALL ===')
const withExports = []
const gaps = []
const stemless = []
for (const mod of mods) {
  if (!existsSync(join(REPO, mod))) continue
  const stem = mod.split('/').pop().replace('.js', '')
  const src = readFileSync(join(REPO, mod), 'utf8')
  const ex = [...new Set([...src.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]))].filter((e) => !BOILER.has(e))
  if (!ex.length) continue
  withExports.push(stem)
  const mentioning = docs.filter((f, i) => docText[i].includes(stem))
  if (!mentioning.length) { stemless.push(stem); continue }
  // the best-covering volume must name EVERY export
  const best = Math.min(...mentioning.map((f, _) => {
    const t = docText[docs.indexOf(f)]
    return ex.filter((e) => !t.includes(e)).length
  }))
  if (best > 0) gaps.push(stem + ' (' + best + ' unnamed)')
}
ok(withExports.length >= 70, 'most kernel modules publish an API', { n: withExports.length })
ok(stemless.length === 0,
  'every module with exports is named by at least one volume, so a reader can find it from the docs',
  { stemless })
ok(gaps.length === 0,
  'and within that volume every export is named, so the reader learns the whole surface rather than part of it',
  { gaps })

console.log('=== 3. AND THE COUNT IS NOT VACUOUS ===')
ok(withExports.length === mods.filter((m) => existsSync(join(REPO, m))).length,
  'the modules counted are exactly the modules present, so the sweep cannot silently skip files')

console.log('=== MODULE COVERAGE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
