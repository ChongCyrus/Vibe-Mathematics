// tests/vmu-middleware-hooks-declared.test.mjs — round 562. The sibling guard matches `on: '<hook>'` in the SOURCE, so an
// array-valued declaration is invisible to it: packs/v3-core declares `on: ["ballot/tally"]` and that guard stays green while the
// middleware is inert. This one ASKS THE RUNTIME instead - it imports each pack and reads the manifest's middleware list - which is
// the rule this project keeps rediscovering: ask the runtime, do not regex-extract a shape.
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BRIDGED_HOOKS } from '../vibe-math-vmu/host-hooks.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKS = join(REPO, 'vibe-math-vmu', 'packs')
// A hook the host does not bridge is INERT. It may still be a legitimate pack preference the framework has not built yet, but then
// it must be declared here with a reason - silence is what made this class invisible.
const KNOWN_UNBRIDGED = {
  'ballot/tally': 'packs/v3-core declares a pack-wide verifier quorum at ballot tallying. The host offers no ballot tally event yet, so that middleware never fires. Recorded as a real interface gap rather than deleted, because the pack states a preference the framework has not built.',
}

console.log('=== THE HOST S PUBLISHED HOOK LIST ===')
ok(Array.isArray(BRIDGED_HOOKS) && BRIDGED_HOOKS.length > 5, 'the bridged hook list is published and non-trivial', { n: BRIDGED_HOOKS.length })

console.log('=== EVERY PACK S MANIFEST, READ FROM THE RUNTIME ===')
const hooks = []
let packs = 0
for (const d of readdirSync(PACKS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
  const entry = join(PACKS, d, 'index.js')
  if (!existsSync(entry)) continue
  let mod
  try { mod = await import(pathToFileURL(entry).href) } catch { continue }
  const man = mod.PACK || mod.V5R_PACK || mod.default || null
  if (!man) continue
  packs += 1
  const mw = Array.isArray(man.middleware) ? man.middleware : []
  for (const m of mw) {
    const on = m && m.on
    const list = Array.isArray(on) ? on : typeof on === 'string' ? [on] : []
    for (const h of list) hooks.push({ pack: d, hook: h, id: (m && m.id) || '?' })
  }
}
ok(packs >= 3, 'the packs with manifests were enumerated', { packs })
ok(hooks.length >= 3, 'and their middleware declarations were collected, in either shape', { n: hooks.length, hooks: hooks.map((h) => h.pack + ':' + h.hook) })

console.log('=== EACH DECLARED HOOK IS BRIDGED, OR DECLARED WITH A REASON ===')
const unbridged = hooks.filter((h) => !BRIDGED_HOOKS.includes(h.hook))
const undeclared = unbridged.filter((h) => !KNOWN_UNBRIDGED[h.hook])
ok(undeclared.length === 0,
  'no pack middleware names a hook the host never fires without a recorded reason, so an inert declaration cannot pass unnoticed',
  { undeclared: undeclared.map((h) => h.pack + ':' + h.hook) })
// The reasons are checked on the EXEMPTION TABLE ITSELF, which is fixed and non-empty, rather than with an every() over the
// unbridged list - that list is legitimately empty when every hook is bridged, and a universal claim over an empty collection is
// the shape the declaration criterion calls class A.
const reasons = Object.entries(KNOWN_UNBRIDGED)
ok(reasons.length > 0 && reasons.every(([, why]) => typeof why === 'string' && why.length > 40),
  'and each recorded exemption carries a reason long enough to act on rather than a bare acknowledgement, checked on the table itself',
  { recorded: reasons.map(([h]) => h) })

console.log('=== THE ARRAY FORM IS GENUINELY SEEN ===')
ok(hooks.some((h) => h.pack === 'v3-core' && h.hook === 'ballot/tally'),
  'the array-valued declaration that the source-matching guard cannot see IS collected here, which is the whole point of asking the runtime',
  { hooks: hooks.map((h) => h.pack + ':' + h.hook) })

console.log('=== MIDDLEWARE HOOKS DECLARED: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
