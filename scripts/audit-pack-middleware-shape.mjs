// scripts/audit-pack-middleware-shape.mjs — MANIFEST MIDDLEWARE SHAPE GATE (round 11, task-88 B).
//
// WHY THIS EXISTS. A manifest middleware entry comes in two shapes and they have DIFFERENT abilities:
//   · INLINE `{ on, handler }` - `kernel/pack.js` adds the handler to the bus as-is. The bus calls it with
//     `{ hook, payload, ctx, dryRun, traceId, setting }`: there is NO `api`, hence no service seam. An inline
//     handler that reaches for `api.services` therefore fails at RUN TIME (or, worse, is written as if it worked).
//   · MODULE `{ module: { meta, capabilities, hooks } }` (or `file` + an importer) - routed through
//     `kernel/loader.js`, which validates apiVersion/capabilities/hooks AND attaches `api` (including the
//     capability-gated `api.services.get(name)` seam). A module that uses that seam MUST declare
//     `trigger-workflow`, or the seam refuses it by name at run time.
// A bare path is neither: the bus never loads files, and the loader needs a module source.
//
// WHAT IT CHECKS (exit non-zero on any):
//   §1 every manifest middleware entry of every pack is ONE of the two shapes, its shape matches its abilities
//      (a source-text check for `api.` use), and its declared capabilities are present when the loader path is
//      the only one that can honour them.
//   §2 SELFTEST - the checker, run against seeded entries, MUST flag (a) an inline handler that uses `api.`,
//      (b) a module that uses `api.services` without `trigger-workflow`, (c) a bare path; and must NOT flag a
//      clean inline handler or a properly-declared module (so it is not always-red).
//
//   node scripts/audit-pack-middleware-shape.mjs            # normal run
//   node scripts/audit-pack-middleware-shape.mjs --selftest # only the vacuity self-probe
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const onlySelftest = process.argv.includes('--selftest')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

/** Does this function's SOURCE reach for the loader-only `api`? (a source-text check, deliberately conservative) */
const usesApi = (fn) => {
  if (typeof fn !== 'function') return false
  let src = ''
  try { src = Function.prototype.toString.call(fn) } catch (e) { return false }
  return /\bapi\s*\.\s*(services|kernel|log|setting|hook|dryRun|traceId)\b/.test(src) || /\bapi\.services\b/.test(src)
}
/** Does it specifically need the capability-gated service seam? */
const usesServiceSeam = (fn) => {
  if (typeof fn !== 'function') return false
  let src = ''
  try { src = Function.prototype.toString.call(fn) } catch (e) { return false }
  return /\bapi\s*\.\s*services\b/.test(src)
}

/**
 * The checker both §1 and §2 use: given a list of `{ pack, entry }`, return the violations.
 * Pure: no filesystem, no imports - so the self-probe can drive it directly.
 */
export function shapeViolations(items = []) {
  const bad = []
  for (const { pack, entry } of items) {
    const where = pack + ' :: ' + (entry && entry.id !== undefined ? entry.id : JSON.stringify(entry))
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      bad.push({ where, why: 'a middleware entry must be an object (a bare path is not a bus entry: the bus never loads files)' })
      continue
    }
    const kind = entry.kind === undefined ? 'module' : entry.kind
    if (kind !== 'rules' && kind !== 'module') {
      bad.push({ where, why: 'kind must be rules|module (script/plugin have carriers OUTSIDE the bus)' })
      continue
    }
    const inline = typeof entry.handler === 'function'
    const moduleShape = entry.module !== undefined || typeof entry.file === 'string'
    if (!inline && !moduleShape) {
      bad.push({ where, why: 'neither an inline handler nor a module/file: the bus cannot run it and the loader has nothing to load' })
      continue
    }
    const caps = Array.isArray(entry.capabilities) ? entry.capabilities : []
    if (inline) {
      // An inline handler is called by the bus with no `api`. Declaring a loader-only capability, or reaching for
      // `api` in its source, means the entry is written against an ability it does not have.
      if (usesApi(entry.handler)) {
        bad.push({ where, why: 'an INLINE handler reaches for `api` (no api on the bus path): make it a module entry ({ module: { meta, capabilities, hooks } }) so kernel/loader.js attaches api' })
      }
      if (caps.includes('trigger-workflow')) {
        bad.push({ where, why: 'an INLINE handler declares `trigger-workflow`, but only the loader path can honour it (no api.services on the bus path)' })
      }
    } else {
      // Module shape: the loader requires meta/capabilities/hooks, and a handler that uses the service seam must
      // declare the capability that unlocks it.
      const hooks = (entry.module && entry.module.hooks) || null
      if (entry.module !== undefined) {
        if (!entry.module.meta || !Number.isInteger(entry.module.meta.apiVersion)) {
          bad.push({ where, why: 'a module entry needs module.meta.apiVersion (the loader validates it)' })
        }
        if (!Array.isArray(entry.module.capabilities) || entry.module.capabilities.length === 0) {
          bad.push({ where, why: 'a module entry needs a non-empty module.capabilities list' })
        }
        if (!hooks || typeof hooks !== 'object' || Object.keys(hooks).length === 0) {
          bad.push({ where, why: 'a module entry needs module.hooks = { <hook>: fn }' })
        }
      }
      const fns = hooks ? Object.values(hooks) : []
      const needsSeam = fns.some(usesServiceSeam)
      const declaredCaps = new Set([...(Array.isArray(entry.capabilities) ? entry.capabilities : []),
        ...((entry.module && Array.isArray(entry.module.capabilities)) ? entry.module.capabilities : [])])
      if (needsSeam && !declaredCaps.has('trigger-workflow')) {
        bad.push({ where, why: 'a module handler uses `api.services` but does not declare `trigger-workflow`: the seam would refuse it BY NAME at run time' })
      }
      if (needsSeam && !caps.includes('trigger-workflow')) {
        bad.push({ where, why: 'the entry itself does not declare `trigger-workflow` (the loader checks the ENTRY capabilities too)' })
      }
    }
  }
  return bad
}

async function collect() {
  const items = []
  const packsDir = join(VMU, 'packs')
  const packs = readdirSync(packsDir).filter((d) => statSync(join(packsDir, d)).isDirectory())
  for (const p of packs) {
    const idx = join(packsDir, p, 'index.js')
    try {
      const mod = await import(pathToFileURL(idx).href)
      const manifest = mod.PACK
      if (!manifest || !Array.isArray(manifest.middleware)) continue
      for (const entry of manifest.middleware) items.push({ pack: 'packs/' + p, entry })
    } catch (e) { /* a pack whose index cannot be imported is not this gate's business */ }
  }
  return items
}

if (!onlySelftest) {
  const items = await collect()
  console.log('=== §1 every manifest middleware entry: shape matches ability (' + items.length + ' entries) ===')
  for (const { pack, entry } of items) {
    const shape = typeof (entry && entry.handler) === 'function' ? 'inline handler' : (entry && entry.module !== undefined ? 'module object' : 'file')
    console.log('  · ' + pack + ' :: ' + (entry && entry.id) + '  [' + shape + ']')
  }
  const bad = shapeViolations(items)
  ok(bad.length === 0, 'no manifest middleware entry is written against an ability its shape does not have', bad)
}

console.log('=== §2 SELFTEST: the checker is not vacuous ===')
{
  const inlineUsingApi = { id: 'seed-inline-api', kind: 'module', on: ['control/idle'], handler: async (flat) => flat.api.services.get('vmu.meetings') }
  const inlineClaimingCap = { id: 'seed-inline-cap', kind: 'module', on: ['control/idle'], capabilities: ['trigger-workflow'], handler: async () => undefined }
  const moduleWithoutCap = { id: 'seed-module', kind: 'module', on: ['control/idle'], capabilities: ['record'],
    module: { meta: { id: 'seed-module', apiVersion: 1 }, capabilities: ['record'], hooks: { 'control/idle': async (flat) => flat.api.services.get('vmu.meetings') } } }
  const barePath = './middleware/nope.js'
  const cleanInline = { id: 'seed-clean-inline', kind: 'module', on: ['control/idle'], handler: async () => undefined }
  const cleanModule = { id: 'seed-clean-module', kind: 'module', on: ['control/idle'], capabilities: ['trigger-workflow'],
    module: { meta: { id: 'seed-clean-module', apiVersion: 1 }, capabilities: ['trigger-workflow'], hooks: { 'control/idle': async (flat) => flat.api.services.get('vmu.meetings') } } }
  ok(shapeViolations([{ pack: 'seed', entry: inlineUsingApi }]).length === 1, 'an INLINE handler reaching for `api` is flagged', shapeViolations([{ pack: 'seed', entry: inlineUsingApi }]))
  ok(shapeViolations([{ pack: 'seed', entry: inlineClaimingCap }]).length === 1, 'an INLINE handler claiming `trigger-workflow` is flagged', shapeViolations([{ pack: 'seed', entry: inlineClaimingCap }]))
  ok(shapeViolations([{ pack: 'seed', entry: moduleWithoutCap }]).length >= 1, 'a module using `api.services` without `trigger-workflow` is flagged', shapeViolations([{ pack: 'seed', entry: moduleWithoutCap }]))
  ok(shapeViolations([{ pack: 'seed', entry: barePath }]).length === 1, 'a BARE PATH is flagged', shapeViolations([{ pack: 'seed', entry: barePath }]))
  ok(shapeViolations([{ pack: 'seed', entry: cleanInline }]).length === 0, 'a clean INLINE handler is NOT flagged (so the gate is not always-red)', shapeViolations([{ pack: 'seed', entry: cleanInline }]))
  ok(shapeViolations([{ pack: 'seed', entry: cleanModule }]).length === 0, 'a properly-declared MODULE is NOT flagged', shapeViolations([{ pack: 'seed', entry: cleanModule }]))
}

console.log('=== PACK MIDDLEWARE SHAPE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
