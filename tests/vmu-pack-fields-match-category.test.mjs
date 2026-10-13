// tests/vmu-pack-fields-match-category.test.mjs — round 597, generalised in 598 to EVERY pack.
//
// Round 596 found that v5r's prompt-pipeline policy was declared under `middleware`, so the pack loader handed it to the bus, which
// must refuse it - and the whole pack's apply threw, which is how a pack that could not load looked like a naming nit for three
// rounds. This decides the category by ASKING THE BUS at runtime rather than re-implementing its rules, which would be the obvious
// approach and the one most likely to drift from the bus it is meant to police.
//
// Round 598 named each pack's OWN manifest export: v5r/index.js exports BOTH PACK (which belongs to v5r-core) and V5R_PACK, so
// `m.PACK || m.V5R_PACK` silently audited the wrong object and reported v5r as carrying bus middleware it does not carry.
import { readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateEntry, VU_HOOKS } from '../vibe-math-vmu/kernel/bus.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKS = join(HERE, '..', 'vibe-math-vmu', 'packs')
// each pack's OWN manifest export, NAMED rather than guessed - the round-598 error was taking whichever key came first
const OWN_EXPORT = { 'v5r': 'V5R_PACK', 'v3-core': 'PACK', 'institute-min': 'PACK' }
const hooks = VU_HOOKS instanceof Map ? [...VU_HOOKS.keys()] : (Array.isArray(VU_HOOKS) ? VU_HOOKS : Object.keys(VU_HOOKS || {}))
const problemsOf = (entry) => {
  const r = validateEntry(entry)
  return Array.isArray(r) ? r : (r && Array.isArray(r.problems) ? r.problems : [])
}

console.log('=== 1. THE VALIDATOR IS USABLE, SO THE CHECK ASKS THE RUNTIME ===')
ok(hooks.length > 0, 'the bus publishes its registered hooks, so a category can be decided rather than assumed', { n: hooks.length })
ok(hooks.includes('ballot/tally'), 'and the list names hooks packs actually use, so it is the real vocabulary', {})
ok(!hooks.includes('prompt/assemble'), 'while prompt/assemble is NOT among them, which is why a prompt-policy entry cannot be a bus entry', {})

console.log('=== 2. EVERY MANIFEST-BEARING PACK WAS FOUND AND READ ===')
const dirs = readdirSync(PACKS).filter((d) => existsSync(join(PACKS, d, 'index.js')))
ok(dirs.length >= 3, 'at least three pack folders ship a manifest, so the audited set is not empty', { dirs })
const read = []
for (const d of dirs) {
  const mod = await import(pathToFileURL(join(PACKS, d, 'index.js')).href)
  const key = OWN_EXPORT[d] && mod[OWN_EXPORT[d]] ? OWN_EXPORT[d] : Object.keys(mod).find((k) => /PACK/.test(k))
  const man = key ? mod[key] : null
  ok(man !== null && typeof man === 'object', 'pack ' + d + ' exports a manifest named ' + (key || '(none)'), { exports: Object.keys(mod) })
  if (man) read.push({ dir: d, manifest: man })
}
ok(read.length > 0, 'and each was read, so what follows is measured on real manifests', { n: read.length })

console.log('=== 3. NO PACK DECLARES A BUS-REFUSED ENTRY AS MIDDLEWARE ===')
const refusals = []
read.forEach(({ dir, manifest }) => {
  const mw = Array.isArray(manifest.middleware) ? manifest.middleware : []
  mw.forEach((e) => {
    const pr = problemsOf(e)
    if (pr.length) refusals.push({ dir, id: e && e.id, problems: pr.slice(0, 2) })
  })
})
ok(refusals.length === 0,
  'no pack hands the bus an entry the bus would refuse, which is the shape that made the v5r pack unable to load',
  { refusals })

console.log('=== 4. AND NO PACK DECLARES A BUS-ACCEPTED ENTRY AS A PROMPT POLICY ===')
const misplaced = []
read.forEach(({ dir, manifest }) => {
  const pp = Array.isArray(manifest.promptPolicies) ? manifest.promptPolicies : []
  pp.forEach((e) => {
    if (problemsOf(e).length === 0) misplaced.push({ dir, id: e && e.id })
  })
})
ok(misplaced.length === 0,
  'and nothing declared as a prompt policy is in fact a valid bus entry, so the two fields stay distinguishable',
  { misplaced })

console.log('=== 5. THE PREDICATE WOULD BITE ===')
{
  const bad = { id: 'x.bad', kind: 'module', on: 'prompt/assemble' }
  const good = { id: 'x.good', kind: 'rules', on: 'ballot/tally', when: {}, then: [{ deny: { code: 'VMU_NOT_PERMITTED' } }] }
  ok(problemsOf(bad).length > 0, 'the entry that broke the v5r pack is refused by the validator, so this check would have caught it', { problems: problemsOf(bad).slice(0, 2) })
  ok(problemsOf(good).length === 0, 'and a legitimate bus entry is accepted, so the check does not simply refuse everything', { problems: problemsOf(good) })
}

console.log('=== PACK FIELDS MATCH CATEGORY: ' + passed + ' passed, ' + failed + ' failed; packs=' + read.length + ' refusals=' + refusals.length + ' misplaced=' + misplaced.length + ' ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
