// tests/vmu-middleware-hooks-bridged.test.mjs — ONE guard for a class this round found by hand: a pack middleware declares
// `on: '<hook>'`, and the host's bridge does not know that hook, so the middleware NEVER FIRES in a real preset. The pack's
// prompt-switch middleware has declared `on: 'turn.assemble'` all along while the host bridges `system-prompt/assemble` and
// `prompt/assemble`; its own comment says the tests drive it and the plugin does not, which is exactly what this guard makes
// impossible to leave unnoticed.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
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
const walk = (d, acc = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (e.name.endsWith('.js')) acc.push(p)
  }
  return acc
}

console.log('=== 1. THE BRIDGE KNOWS SOME HOOKS ===')
ok(Array.isArray(BRIDGED_HOOKS) && BRIDGED_HOOKS.length >= 8,
  'the host bridge publishes the hooks it maps, so the declaration can be checked against it', { n: BRIDGED_HOOKS.length })
ok(BRIDGED_HOOKS.includes('prompt/assemble') && BRIDGED_HOOKS.includes('system-prompt/assemble'),
  'and it includes the two assembly points, which is where a prompt middleware belongs', { hooks: BRIDGED_HOOKS.slice(0, 14) })

console.log('=== 2. EVERY PACK MIDDLEWARE DECLARES A BRIDGED HOOK ===')
{
  const files = walk(join(REPO, 'vibe-math-vmu', 'packs'))
  const declared = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    // A HOOK NAME IS area/action IN THE HOST'S VOCABULARY. The first version of this guard also matched `on: '1.0.0'`,
    // a version field; and the defect it was written for used a DOT (turn.assemble) where the host uses a SLASH, which is
    // exactly the mismatch that made the declaration inert - so anything of the form a.b or a/b is a candidate.
    for (const m of src.matchAll(/on:\s*'([^']+)'/g)) {
      if (!/^[a-z][a-z0-9-]*[./][a-z][a-z0-9-]*$/.test(m[1])) continue
      declared.push({ file: f.replace(REPO, '').replace(/\\/g, '/'), hook: m[1] })
    }
  }
  ok(declared.length > 0, 'at least one pack middleware states the hook it contributes', { n: declared.length })
  const unbridged = declared.filter((d) => !BRIDGED_HOOKS.includes(d.hook))
  ok(unbridged.length === 0,
    'and every one of them names a hook the host actually bridges, so a declaration cannot be inert', { unbridged })
}

console.log('=== 3. THE GUARD WOULD BITE ===')
{
  const synthetic = "export const mw = Object.freeze({ id: 'x', on: 'not/a/real/hook', apply: () => {} })"
  const found = [...synthetic.matchAll(/on:\s*'([^']+)'/g)].map((m) => m[1]).filter((h) => !BRIDGED_HOOKS.includes(h))
  ok(found.length === 1, 'a declaration naming an unbridged hook IS reported by the same predicate', { found })
  const good = "export const mw = Object.freeze({ id: 'x', on: 'prompt/assemble', apply: () => {} })"
  const okOne = [...good.matchAll(/on:\s*'([^']+)'/g)].map((m) => m[1]).filter((h) => !BRIDGED_HOOKS.includes(h))
  ok(okOne.length === 0, 'and a bridged one is not', { okOne })
}

console.log('=== MIDDLEWARE HOOKS BRIDGED: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
