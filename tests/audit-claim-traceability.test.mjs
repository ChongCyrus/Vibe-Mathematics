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
// PROVENANCE, IN TWO TABLES BECAUSE THERE ARE TWO DIFFERENT FACTS. Some claim ids are defined by files that are not
// code, so the walk above cannot resolve them. Round 6 kept them all in ONE table and checked them all against the
// workspace root, which was true while every one of them lived outside the repository. Then the v5r inventory moved
// IN (to `docs/acceptance/`), and the same table would have started asserting a fact that is no longer true: that a
// file inside the repo exists outside it. So the tables are split by ROOT, and each is checked against the root that
// makes its entry true. The id did not change meaning; its root did.
//
// Defined OUTSIDE the repo, with the file that defines each. Recorded, not hidden.
const EXTERNAL = {
  D11: '_oneoff/vmu/design/02-dsh-official-guidelines.md',
  D12: '_oneoff/vmu/design/02-dsh-official-guidelines.md',
  G8: '_oneoff/audit-b/repo/vibe-math-v5/实现方案.md',
  G11: '_oneoff/vmu/design/02-dsh-official-guidelines.md',
  G13: '_oneoff/vmu/design/02-dsh-official-guidelines.md',
  G17: '_oneoff/vmu/design/02-dsh-official-guidelines.md',
}
// Defined INSIDE the repo. The difference is not cosmetic: for these a reader of the repository alone CAN resolve the
// citation, which is strictly better provenance than the recorded gap that F53 used to be.
const IN_REPO = {
  // ROUND 6 recorded `docs/03`'s `F53` here as a gap, because the v5r INVENTORY then lived in the handoff volume
  // outside the repo. It was at `_handoff/vmu/03-v5r-full-inventory.md` then - and that OLD path is written here on
  // purpose, because the blanket citation update must not rewrite a record of where a file USED to be (doing so would
  // turn history into a claim that it was always in the repository). The inventory has since been moved into the
  // repository (`docs/acceptance/03-v5r-full-inventory.md`), so the gap is CLOSED and the pointer is checked against
  // the repository root instead. The citation rule is unchanged: a NEW dangling id still fails.
  F53: 'docs/acceptance/03-v5r-full-inventory.md',
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

console.log('=== 3. EVERY CLAIM ID RESOLVES IN CODE, OR IS A RECORDED NON-CODE PROVENANCE ONE ===')
const unresolved = []
for (const [f, ids] of perVolume) {
  for (const id of ids) {
    if (PERCENTILES.has(id)) continue
    if (EXTERNAL[id] || IN_REPO[id]) continue
    if (!new RegExp('\\b' + id + '\\b').test(code)) unresolved.push(f.slice(0, 2) + ':' + id)
  }
}
ok(unresolved.length === 0,
  'every claim id either appears in the code or is recorded in a provenance table, so no citation dangles',
  { unresolved })

console.log('=== 4. AND EVERY RECORDED PROVENANCE POINTER IS A FACT, EACH AGAINST ITS OWN ROOT ===')
// The same discipline the percentile and code-size allow-lists use: an allow-list is asserted to be EXACTLY the set it
// was created for, so it cannot grow into a dumping ground one convenient entry at a time.
ok(Object.keys(EXTERNAL).length === 6,
  'the EXTERNAL table is exactly the six design ids it was created for, so it cannot grow unnoticed',
  { keys: Object.keys(EXTERNAL).length })
ok(Object.keys(IN_REPO).length === 1 && IN_REPO.F53 === 'docs/acceptance/03-v5r-full-inventory.md',
  'and the IN_REPO table is exactly F53, so a file that moves cannot quietly park itself here',
  { keys: Object.keys(IN_REPO) })
const missingExternal = Object.entries(EXTERNAL).filter(([, p]) => !existsSync(join(WS, p)))
// ★ On a CLONE the private workspace tree is absent. Pretending to verify it would be a different dishonesty than
// the one this table exists to prevent, so the gap is stated in both directions: WITH the tree, every pointer must
// resolve; WITHOUT it, the six pointers are recorded-not-verified (and a PARTIAL tree is still RED, via the branch
// that applies whenever `_oneoff/` exists).
const hasPrivateTree = existsSync(join(WS, '_oneoff'))
if (hasPrivateTree) {
  ok(missingExternal.length === 0,
    'each recorded EXTERNAL file exists under the WORKSPACE root, so the pointer is a fact rather than a hope',
    { missing: missingExternal.map(([id]) => id) })
} else {
  console.log('  ★ RECORDED, NOT VERIFIED: the private workspace tree `_oneoff/` is absent (a clone is not the author\'s workspace); the six EXTERNAL design pointers stay recorded above, not asserted to exist')
  ok(missingExternal.length === Object.keys(EXTERNAL).length,
    'without the private workspace tree, the six EXTERNAL pointers are RECORDED-not-verified (the gap is named, not hidden)',
    { missing: missingExternal.map(([id]) => id) })
}
const missingInRepo = Object.entries(IN_REPO).filter(([, p]) => !existsSync(join(REPO, p)))
ok(missingInRepo.length === 0,
  'and each recorded IN_REPO file exists under the REPOSITORY root, so moving a volume in cannot leave its recorded id dangling',
  { missing: missingInRepo.map(([id]) => id) })

console.log('=== CLAIM TRACEABILITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
