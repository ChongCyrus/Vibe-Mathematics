// tests/audit-hook-coverage.test.mjs - a frozen hook must have an emit site, and a vmu-namespace emit must be frozen.
//
// WHY THIS EXISTS. docs/05 section 5.2 reported two hooks whose names were frozen while nothing emitted them; a scan found
// FOUR, plus a live bug the volume did not know about: kernel/budget.js emitted `budget/warn`, which is inside VMU's own
// namespace but was not frozen, so the bus refused it and the un-awaited call threw on the ordinary budget-warning path.
// Both directions of the same defect are now checked, and the second direction is the one that keeps it from returning.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

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
const bus = readFileSync(join(VMU, 'kernel', 'bus.js'), 'utf8')
const hm = /VU_HOOKS = Object\.freeze\(\[([\s\S]{0,2400}?)\]\)/.exec(bus)
const frozen = hm ? [...hm[1].matchAll(/'([a-z][a-z0-9/-]+)'/g)].map((m) => m[1]) : []
const vn = /const VU_NAMESPACE = (\/\^?[^\n]+)/.exec(bus)
const sources = walk('vibe-math-vmu').filter((f) => /\.js$/.test(f)).map((f) => ({ f: f.replace(/\\/g, '/'), t: readFileSync(join(REPO, f), 'utf8') }))

console.log('=== 1. THE FROZEN SET AND THE NAMESPACE RULE ARE READABLE ===')
ok(frozen.length >= 20, 'the kernel publishes its frozen hook names', { frozen: frozen.length })
ok(!!vn, 'and the namespace rule that decides which emits the bus validates', { rule: vn && vn[1].slice(0, 60) })

console.log('=== 2. EVERY FROZEN HOOK IS EMITTED SOMEWHERE ===')
const neverEmitted = frozen.filter((h) => !sources.some((s) => new RegExp("emit\\(\\s*'" + h + "'").test(s.t)))
ok(neverEmitted.length === 0,
  'no frozen hook is a paper capability: each one is emitted by some module, so middleware can actually attach to it',
  { neverEmitted })

console.log('=== 3. EVERY EMIT INSIDE A VMU NAMESPACE IS FROZEN ===')
// the bus refuses these at runtime, so an unfrozen one is a thrown error on a live path, not a style question
const regex = vn ? new RegExp(vn[1].replace(/^\/\^?/, '').replace(/\/$/, '')) : null
const unfrozen = new Set()
for (const s of sources) {
  for (const m of s.t.matchAll(/emit\(\s*'([^']+)'/g)) {
    const h = m[1]
    if (frozen.includes(h)) continue
    if (regex && !regex.test(h)) continue // a foreign namespace belongs to the substrate and is passed through
    unfrozen.add(h + '  (' + s.f + ')')
  }
}
ok(unfrozen.size === 0,
  'and nothing emits an unfrozen name in VMU s own namespace, which the bus refuses - this is how budget/warn threw on every budget warning',
  { unfrozen: [...unfrozen] })

console.log('=== HOOK COVERAGE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
