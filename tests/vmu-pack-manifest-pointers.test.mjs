// tests/vmu-pack-manifest-pointers.test.mjs — every module pointer a pack manifest declares must resolve, and the
// manifest must be read by ENUMERATING it at runtime rather than pattern-matching the source: the pointer is a value, not a
// string literal, so a regex found nothing when this was checked by hand in round 544.
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

console.log('=== 1. EVERY PACK IS ENUMERATED AT RUNTIME ===')
const dirs = readdirSync(PACKS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
ok(dirs.length >= 1, 'there is at least one pack directory to read', { dirs })

console.log('=== 2. ITS MANIFEST IS AN OBJECT WITH POINTERS THAT RESOLVE ===')
let ptrTotal = 0
for (const d of dirs) {
  const entry = join(PACKS, d, 'index.js')
  if (!existsSync(entry)) continue
  let mod = null
  try { mod = await import('file://' + entry.replace(/\\/g, '/')) } catch (e) { ok(false, d + ': the pack imports', { err: String(e.message).slice(0, 120) }); continue }
  const manifest = mod.V5R_PACK || mod.PACK || mod.default || null
  ok(!!manifest && typeof manifest === 'object', d + ': the pack exports a manifest object', { keys: manifest ? Object.keys(manifest).length : 0 })
  if (!manifest) continue
  const ptr = Object.entries(manifest).filter(([, v]) => typeof v === 'string' && /\.js$/.test(v))
  ptrTotal += ptr.length
  const missing = ptr.filter(([, v]) => !existsSync(join(PACKS, d, v)))
  ok(missing.length === 0, d + ': every module pointer resolves to a real file', { pointers: ptr.map((p) => p[0] + '=' + p[1]), missing })
}

console.log('=== 3. AND THE COUNT IS NOT ZERO ===')
ok(ptrTotal >= 3, 'the check above is not vacuous: at least three pointers were found', { ptrTotal })

console.log('=== PACK MANIFEST POINTERS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
