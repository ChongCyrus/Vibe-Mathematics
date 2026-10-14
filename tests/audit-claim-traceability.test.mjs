// tests/audit-claim-traceability.test.mjs - generalised from one volume to all of them.
//
// Two false-positive classes were found while generalising, and both are handled explicitly rather than by loosening the
// pattern into uselessness:
//   · PERCENTILES: docs/21 writes "the 7-day P95 of the refusal rate" and "hook latency distribution (P50/P95/max)". P50 and
//     P95 are not claim ids. They are excluded by name, and the exclusion is asserted to be non-empty so it cannot silently
//     grow into a dumping ground.
//   · DESIGN IDS: D11, D12, G8, G11, G13 and G17 are defined in the design volumes OUTSIDE this repository, under the
//     workspace root's _oneoff/vmu/design. An in-repo volume citing them cannot be resolved by a reader of the repo alone,
//     so they are listed here with the file that defines them - the gap is recorded, not hidden.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const DOCS = join(REPO, 'vibe-math-vmu', 'docs')
const WS = join(REPO, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const walk = (d) => readdirSync(join(REPO, d), { withFileTypes: true }).flatMap((e) => {
  const r = join(d, e.name)
  if (e.isDirectory()) return /(^|\/)(\.git|node_modules)$/.test(r) ? [] : walk(r)
  return [r]
})
const code = [...walk('tests'), ...walk('scripts'), ...walk('vibe-math-vmu')]
  .filter((f) => /\.(mjs|js)$/.test(f)).map((f) => readFileSync(join(REPO, f), 'utf8')).join('\n')

// Not claim ids: latency percentiles, asserted to be exactly this set.
const PERCENTILES = new Set(['P50', 'P95'])
// Defined outside the repo, with the file that defines each. Recorded, not hidden.
const EXTERNAL = {
  D11: '_oneoff/vmu/design/02-dsh-official-guidelines.md',
  D12: '_oneoff/vmu/design/02-dsh-official-guidelines.md',
  G8: '_oneoff/audit-b/repo/vibe-math-v5/实现方案.md',
  G11: '_oneoff/vmu/design/02-dsh-official-guidelines.md',
  G13: '_oneoff/vmu/design/02-dsh-official-guidelines.md',
  G17: '_oneoff/vmu/design/02-dsh-official-guidelines.md',
  // ROUND 6: `docs/03` cites `F53` - an entry number of the v5r INVENTORY, which lives in the handoff volume
  // outside the repo (`_handoff/vmu/03-v5r-full-inventory.md`), exactly like the design ids above. Listing it here
  // is what this table is FOR: the citation is useful provenance, so it is recorded rather than deleted, and the
  // discovery rule stays strict (a NEW dangling id still fails).
  F53: '_handoff/vmu/03-v5r-full-inventory.md',
}

console.log('=== 1. THE VOLUMES AND THEIR CLAIM IDS ARE READ ===')
const volumes = readdirSync(DOCS).filter((f) => /^\d\d-.*\.md$/.test(f)).sort()
ok(volumes.length >= 25, 'every volume is read', { volumes: volumes.length })
const perVolume = new Map()
for (const f of volumes) {
  const t = readFileSync(join(DOCS, f), 'utf8')
  const ids = [...new Set([...t.matchAll(/\b([CDFG]\d{1,2}[a-z]?)\b/g)].map((m) => m[1]))]
  if (ids.length) perVolume.set(f, ids)
}
const totalIds = [...perVolume.values()].reduce((n, a) => n + a.length, 0)
ok(perVolume.size >= 15 && totalIds >= 100, 'the volumes cite claims by id', { volumes: perVolume.size, ids: totalIds })

console.log('=== 2. THE EXCLUSION LIST IS EXACTLY THE PERCENTILES ===')
ok(PERCENTILES.size === 2 && PERCENTILES.has('P50') && PERCENTILES.has('P95'),
  'the only ids excluded as percentiles are P50 and P95, so the exclusion cannot grow into a dumping ground')

console.log('=== 3. EVERY CLAIM ID RESOLVES IN CODE, OR IS A RECORDED EXTERNAL ONE ===')
const unresolved = []
for (const [f, ids] of perVolume) {
  for (const id of ids) {
    if (PERCENTILES.has(id)) continue
    if (EXTERNAL[id]) continue
    if (!new RegExp('\\b' + id + '\\b').test(code)) unresolved.push(f.slice(0, 2) + ':' + id)
  }
}
ok(unresolved.length === 0,
  'every claim id either appears in the code or is listed as defined outside the repository, so no citation dangles',
  { unresolved })

console.log('=== 4. AND EVERY RECORDED EXTERNAL ID REALLY EXISTS OUTSIDE ===')
const missingExternal = Object.entries(EXTERNAL).filter(([, p]) => !existsSync(join(WS, p)))
ok(missingExternal.length === 0,
  'each recorded external definition file exists, so the pointer is a fact rather than a hope',
  { missing: missingExternal.map(([id]) => id) })

console.log('=== CLAIM TRACEABILITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
