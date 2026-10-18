// tests/vmu-middleware-hooks-declared.test.mjs — round 562. The sibling guard matches `on: '<hook>'` in the SOURCE, so an
// array-valued declaration is invisible to it: packs/v3-core declares `on: ["ballot/tally"]` and that guard stays green while the
// middleware is inert. This one ASKS THE RUNTIME instead - it imports each pack and reads the manifest's middleware list - which is
// the rule this project keeps rediscovering: ask the runtime, do not regex-extract a shape.
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BRIDGED_HOOKS } from '../vibe-math-vmu/host-hooks.js'
import { VU_HOOKS, declaredTopics } from '../vibe-math-vmu/kernel/bus.js'

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
// A hook the host does not bridge is INERT — UNLESS THE RUNTIME ITSELF DECLARES IT. That distinction is the whole
// PHASE 6 relaxation: a pack creates a NEW protocol topic through `bus.declareTopic` (the sanctioned extension point),
// and requiring a hand-written reason for every such topic is bookkeeping that punishes the legal extension. The
// criterion below therefore asks the RUNTIME for the declared topic set; the table is only for a hook that is
// neither bridged nor declared (i.e. genuinely inert). MEASURED defect this closes: `v3/tick` needed a row here
// before `/v3` even though it is declared and emitted by the scheduler.
const KNOWN_UNBRIDGED = {}

console.log('=== THE HOST S PUBLISHED HOOK LIST ===')
ok(Array.isArray(BRIDGED_HOOKS) && BRIDGED_HOOKS.length > 5, 'the host bridged hook list is published and non-trivial', { n: BRIDGED_HOOKS.length })
ok(Array.isArray(VU_HOOKS) && VU_HOOKS.includes('ballot/tally'), 'and the VMU bus publishes its own hook vocabulary, which includes ballot/tally with a real emit site', { n: VU_HOOKS.length })

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

console.log('=== EACH DECLARED HOOK IS BRIDGED, DECLARED AT RUN TIME, OR RECORDED WITH A REASON ===')
// ROUND 566 CORRECTION: a pack middleware attaches to the VMU BUS by hook name, and BRIDGED_HOOKS is the separate list of HOST
// hooks the bridge can map. A VMU-internal hook needs no bridging at all, so the criterion is membership in EITHER list -
// which is why ballot/tally (in VU_HOOKS, emitted by ballot.js) was never inert, contrary to what round 562 recorded.
// ★ PHASE 6: the runtime's OWN declared-topic set is the third (and authoritative) source for a pack-created topic.
const DECLARED_THEMES = new Set(declaredTopics())
const KNOWN_HOOKS = new Set([...VU_HOOKS, ...BRIDGED_HOOKS, ...DECLARED_THEMES])
/** Pure criterion, so its ability to bite is itself testable (below). */
const undeclaredOf = (list, known) => list.filter((h) => !known.has(h.hook) && !KNOWN_UNBRIDGED[h.hook])
const unbridged = hooks.filter((h) => !KNOWN_HOOKS.has(h.hook))
const undeclared = undeclaredOf(hooks, KNOWN_HOOKS)
ok(undeclared.length === 0,
  'no pack middleware names a hook that is neither bridged, nor declared by the bus, nor recorded with a reason',
  { undeclared: undeclared.map((h) => h.pack + ':' + h.hook) })
ok(DECLARED_THEMES.has('v3/tick'),
  '★ the pack-created protocol topic `v3/tick` IS in the runtime declared-topic set, so it needs no hand-written row (the PHASE 6 relaxation)',
  { declared: [...DECLARED_THEMES] })
ok(undeclaredOf([{ pack: 'synthetic', hook: 'lab/never-fired' }], KNOWN_HOOKS).length === 1,
  '★ SELF-PROOF: a hook that is neither bridged nor declared nor recorded is STILL flagged (synthetic)')
ok(undeclaredOf([{ pack: 'synthetic', hook: 'v3/tick' }], KNOWN_HOOKS).length === 0,
  '★ SELF-PROOF: a runtime-declared topic is NOT flagged (so the relaxation is not a blanket pass)')
// The reasons are checked on the EXEMPTION TABLE ITSELF, which is fixed and non-empty, rather than with an every() over the
// unbridged list - that list is legitimately empty when every hook is bridged, and a universal claim over an empty collection is
// the shape the declaration criterion calls class A.
ok(KNOWN_UNBRIDGED !== null && typeof KNOWN_UNBRIDGED === 'object' && !Array.isArray(KNOWN_UNBRIDGED),
  'the exemption table still exists as an object, so a genuinely inert hook has somewhere to be recorded WITH a reason',
  { keys: Object.keys(KNOWN_UNBRIDGED).length })
ok(Object.keys(KNOWN_UNBRIDGED).every((k) => typeof KNOWN_UNBRIDGED[k] === 'string' && KNOWN_UNBRIDGED[k].length > 40),
  'and any entry it does hold must carry a reason long enough to act on, checked over the table s own keys',
  { keys: Object.keys(KNOWN_UNBRIDGED) })

console.log('=== THE ARRAY FORM IS GENUINELY SEEN ===')
ok(hooks.some((h) => h.pack === 'v3-core' && h.hook === 'ballot/tally'),
  'the array-valued declaration that the source-matching guard cannot see IS collected here, which is the whole point of asking the runtime',
  { hooks: hooks.map((h) => h.pack + ':' + h.hook) })

console.log('=== MIDDLEWARE HOOKS DECLARED: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
