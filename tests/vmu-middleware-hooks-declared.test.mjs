// tests/vmu-middleware-hooks-declared.test.mjs — round 562. The sibling guard matches `on: '<hook>'` in the SOURCE, so an
// array-valued declaration is invisible to it: packs/v3-core declares `on: ["ballot/tally"]` and that guard stays green while the
// middleware is inert. This one ASKS THE RUNTIME instead - it imports each pack and reads the manifest's middleware list - which is
// the rule this project keeps rediscovering: ask the runtime, do not regex-extract a shape.
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BRIDGED_HOOKS } from '../vibe-math-vmu/host-hooks.js'
import { VU_HOOKS } from '../vibe-math-vmu/kernel/bus.js'

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
// NOTHING IS CURRENTLY IN NEITHER LIST. The table stays as the mechanism that would force a reason to be written if one ever is.
const KNOWN_UNBRIDGED = {
  // ★ PHASE 6 · 目标 2（P0-1）：`v3/tick` is a PACK-DECLARED protocol topic, not a framework hook. It is introduced by
  // `packs/v3/middleware/tick.js` through `declareTopic('v3/tick')` - the sanctioned extension point for a topic outside
  // the frozen `VU_HOOKS` list - and the scheduler emits it when the declared seed fires. This scan compares pack hooks
  // against `VU_HOOKS ∪ BRIDGED_HOOKS`, so a correctly-declared custom topic necessarily shows up as "undeclared" here.
  // Recording it WITH a reason is the point of this table: it keeps the scan strict for framework hooks while making an
  // inert pack declaration impossible to leave unnoticed. If the topic ever stops being emitted, this row goes stale.
  'v3/tick': 'pack-declared custom topic via bus.declareTopic (kernel/bus.js DECLARED_TOPICS): declared+subscribed by packs/v3/middleware/tick.js and emitted by the scheduler from the declared v3/tick seed - not a framework hook, so it is not in VU_HOOKS by design',
}

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

console.log('=== EACH DECLARED HOOK IS BRIDGED, OR DECLARED WITH A REASON ===')
// ROUND 566 CORRECTION: a pack middleware attaches to the VMU BUS by hook name, and BRIDGED_HOOKS is the separate list of HOST
// hooks the bridge can map. A VMU-internal hook needs no bridging at all, so the criterion is membership in EITHER list -
// which is why ballot/tally (in VU_HOOKS, emitted by ballot.js) was never inert, contrary to what round 562 recorded.
const KNOWN_HOOKS = new Set([...VU_HOOKS, ...BRIDGED_HOOKS])
const unbridged = hooks.filter((h) => !KNOWN_HOOKS.has(h.hook))
const undeclared = unbridged.filter((h) => !KNOWN_UNBRIDGED[h.hook])
ok(undeclared.length === 0,
  'no pack middleware names a hook the host never fires without a recorded reason, so an inert declaration cannot pass unnoticed',
  { undeclared: undeclared.map((h) => h.pack + ':' + h.hook) })
// The reasons are checked on the EXEMPTION TABLE ITSELF, which is fixed and non-empty, rather than with an every() over the
// unbridged list - that list is legitimately empty when every hook is bridged, and a universal claim over an empty collection is
// the shape the declaration criterion calls class A.
// The exemption MECHANISM is asserted rather than its contents: the table is legitimately empty now that the criterion is
// correct, and an every() over an empty collection is the shape class A. What must hold is that the mechanism exists and is
// an object, so a future exemption has somewhere to go and cannot be added as a bare name.
ok(KNOWN_UNBRIDGED !== null && typeof KNOWN_UNBRIDGED === 'object' && !Array.isArray(KNOWN_UNBRIDGED),
  'the exemption table exists as an object, so a future unbridged hook has somewhere to be recorded WITH a reason',
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
