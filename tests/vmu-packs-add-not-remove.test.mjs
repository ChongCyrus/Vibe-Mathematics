// tests/vmu-packs-add-not-remove.test.mjs — ★ "the SETTINGS face may only ADD packs, never remove one"
//
// WHY THIS FILE EXISTS: `vibe-math-vmu.js:827-832` makes the deployment list (`config.packs`) the BASELINE and lets the
// settings key (`vmu.packs.active`) only contribute ids the deployment did not already have. That behaviour had NEITHER
// a document NOR an assertion (R25 review), and it is exactly the kind of rule that a future refactor would quietly
// invert (a "settings win" reading is the intuitive-looking wrong answer).
//
// THE THREE FACTS (each with a NON-EMPTY precondition, so "nothing was installed at all" cannot pass):
//   ADD     - settings-only id  => really loaded (a v5r entry reaches the BUS) and its source is named `vmu.packs.active`
//   REMOVE  - a deployment id absent from the settings list => STILL loaded, and WHY is readable (`via: config.packs`)
//   BOTH    - declared by both => loaded ONCE and the source stays `config.packs` (deployment owns the baseline)
//
// ★ THE SETTLE PRECONDITION IS BUILT IN (R24: the install is fire-and-forget relative to `ready()`; measured 0 -> 1 on
// `packErrors`). Reading these observables immediately after `ready()` used to measure the probe's own race.
// Run:      node tests/vmu-packs-add-not-remove.test.mjs
// Mutants:  node tests/vmu-packs-add-not-remove.mutants.mjs   (copies only; proves both directions can redden)
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const argOf = (name, def) => { const i = process.argv.indexOf('--' + name); return i === -1 ? def : process.argv[i + 1] }
const PKG = argOf('pkg', join(REPO, 'vibe-math-vmu'))
const mod = await import(pathToFileURL(join(PKG, 'vibe-math-vmu.js')).href)

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label) } else { failed++; console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}
const settle = async (h) => { await h.ready(); await new Promise((r) => setTimeout(r, 300)) }
const build = async (config) => {
  const root = mkdtempSync(join(tmpdir(), 'vmu-addnotremove-'))
  const ctx = { effect: (fn) => fn(), on: () => () => {}, tools: { register: async () => () => {} } }
  const h = mod.apply(ctx, Object.assign({ clock: () => 1000000, deliver: () => {}, root }, config))
  await settle(h)
  const merge = typeof h.packMerge === 'function' ? h.packMerge() : {}
  const sources = Array.isArray(merge.packSources) ? merge.packSources : []
  const applied = typeof h.appliedPacks === 'function' ? h.appliedPacks() : []
  const entries = (h.kernel.bus.status().entries || []).map((e) => e.id)
  const packEntries = entries.filter((id) => /artifact-counter/.test(String(id)))   // a v5r-only module: the pack really reached the bus
  return { root, merge, sources, applied, entries, packEntries }
}
const cleanup = (b) => { try { rmSync(b.root, { recursive: true, force: true }) } catch { /* best effort */ } }

console.log('=== 1. ADD: a settings-only id really loads, and its SOURCE is named ===')
const add = await build({ packs: [], vmu: { 'vmu.packs.active': ['v5r'] } })
ok(add.applied.length > 0, 'precondition: something really applied (the arm is non-empty)', add.applied)
ok(add.packEntries.length > 0, '★ the settings-only pack reached the BUS (not merely a settings table)', add.packEntries)
ok(add.sources.some((s) => s.id === 'v5r' && s.via === 'vmu.packs.active'),
  '★ and its source is named `vmu.packs.active` (a reader can tell where the request came from)', add.sources)

console.log('\n=== 2. REMOVE-ATTEMPT: a deployment id missing from the settings list is NOT removed ===')
const rem = await build({ packs: ['v5r'], vmu: { 'vmu.packs.active': [] } })
ok(rem.applied.length > 0, 'precondition: the deployment pack really applied (non-empty)', rem.applied)
ok(rem.packEntries.length > 0, '★ the deployment pack is STILL on the bus although the settings list is empty', rem.packEntries)
ok(rem.sources.some((s) => s.id === 'v5r' && s.via === 'config.packs'),
  '★ and WHY is readable: the source still says `config.packs` (not silently ignored)', rem.sources)
ok(JSON.stringify(rem.packEntries.slice().sort()) === JSON.stringify(add.packEntries.slice().sort()),
  'the removal attempt changed NOTHING about what is loaded (same entry set as the ADD arm)', { rem: rem.packEntries, add: add.packEntries })

console.log('\n=== 3. BOTH: declared by both => ONE load, source stays the deployment ===')
const both = await build({ packs: ['v5r'], vmu: { 'vmu.packs.active': ['v5r'] } })
const v5rSrc = both.sources.filter((s) => s.id === 'v5r')
ok(both.applied.length > 0, 'precondition: something applied (non-empty)', both.applied)
ok(v5rSrc.length === 1, '★ exactly ONE request entry for an id declared by both (no double load)', both.sources)
ok(v5rSrc.length === 1 && v5rSrc[0].via === 'config.packs',
  '★ and its source stays `config.packs` (the deployment owns the baseline)', v5rSrc)
ok(JSON.stringify(both.entries.length) === JSON.stringify(rem.entries.length),
  'the both-declared arm has the same number of bus entries as the deployment-only arm (one load, not two)', { both: both.entries.length, rem: rem.entries.length })

console.log('\n=== 4. NO-OP: nothing declared anywhere stays silent (the rule must not manufacture a load) ===')
const none = await build({ packs: [], vmu: {} })
ok(none.entries.length === 0 && none.applied.length === 0, 'with nothing declared there is nothing loaded and nothing applied', { entries: none.entries.length, applied: none.applied.length })

for (const b of [add, rem, both, none]) cleanup(b)
console.log('\n=== VMU PACKS ADD-NOT-REMOVE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
