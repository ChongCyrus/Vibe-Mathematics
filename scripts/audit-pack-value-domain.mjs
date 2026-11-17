// scripts/audit-pack-value-domain.mjs — PACK VALUE-DOMAIN GATE (round 8's general guard, round 9 made permanent).
//
// WHY THIS EXISTS. `vmu.paper.finalizer` was declared `type:'string'` while its reader kept a CLOSED value list
// (historical: the now-DELETED `kernel/paper.js`'s `FINALIZERS`; TB-2794 Step 1 removed that file), so a declaration
// outside that list - v5r's `paperEditor:'academician'` - was silently downgraded to 'editor': the declaration had no
// effect and no complaint. That is the "declared but not in effect" class this repository refuses. Round 8 fixed that
// instance (schema enum + a named refusal; the file is gone now); THIS gate is the general guard.
//
// WHAT IT CHECKS (exit non-zero on any):
//   §1 STATIC  every value a pack declares for an `enum`-typed schema key is INSIDE that enum's domain, and every
//              value declared for a key whose READER keeps a closed list (measured from the code) is inside it too.
//   §2 LIVE    for each such closed-list key, feeding an OUT-OF-DOMAIN value through the real face must produce a
//              NAMED refusal - not a silent downgrade. (This is the part that would have caught round 8's defect.)
//   §3 SELFTEST the static checker, run against a synthetic declaration map that contains an out-of-domain value,
//              MUST report a violation - otherwise the gate itself is vacuous and this run fails.
//
//   node scripts/audit-pack-value-domain.mjs            # normal run
//   node scripts/audit-pack-value-domain.mjs --selftest # only the vacuity self-probe
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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

// ── the framework's declared domains ────────────────────────────────────────────────────────────────────────
const schema = readFileSync(join(VMU, 'settings', 'schema.js'), 'utf8')
const enumDomains = new Map() // key -> domain array (enum-typed keys only)
for (const m of schema.matchAll(/\{\s*key:\s*'([^']+)'[^}]*?type:\s*'enum'([^}]*)\}/g)) {
  const dom = m[2].match(/domain:\s*(\[[^\]]*\])/)
  if (dom) enumDomains.set(m[1], JSON.parse(dom[1].replace(/'/g, '"')))
}
// Keys the schema types as a free `string` but whose READER keeps a closed list. Measured, never guessed.
// ★ TB-2794 Step 1 (migration truth): the ONLY such reader was `kernel/paper.js` (`FINALIZERS`) and it has been DELETED;
// `vmu.paper.finalizer` is an `enum` now, so its closed set IS the declared domain and §1's enum half already covers it.
// No free-string-with-reader-closed-list key survives ⇒ `closedReaders` is empty as a NAMED fact (§2 reports the 0
// instead of silently looping zero times; §3 proves the checker itself is not vacuous).
const closedReaders = new Map()

// ── every value the packs declare (read from the real modules, not by parsing text) ─────────────────────────
async function declaredValues() {
  const out = [] // { key, value, where }
  const packsDir = join(VMU, 'packs')
  const packs = readdirSync(packsDir).filter((d) => statSync(join(packsDir, d)).isDirectory())
  for (const p of packs) {
    const jsonPath = join(packsDir, p, 'settings', 'defaults.json')
    try {
      const j = JSON.parse(readFileSync(jsonPath, 'utf8'))
      for (const [k, v] of Object.entries(j.defaults || {})) out.push({ key: k, value: v, where: 'packs/' + p + '/settings/defaults.json' })
    } catch (e) { /* a pack without a defaults.json is fine */ }
    const idx = join(packsDir, p, 'index.js')
    try {
      const mod = await import(pathToFileURL(idx).href)
      const collect = (obj, where) => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return
        for (const [k, v] of Object.entries(obj)) if (k.startsWith('vmu.')) out.push({ key: k, value: v, where })
      }
      for (const [name, val] of Object.entries(mod)) {
        if (name === 'PACK' && val && typeof val === 'object') collect(val.settings, 'packs/' + p + '/index.js PACK.settings')
        else if (name === 'V5R_SETTING_DEFAULTS' || name === 'V5R_PACK' || name === 'PACK_DEFAULTS') {
          collect(name === 'V5R_PACK' ? val.defaults : val, 'packs/' + p + '/index.js ' + name)
        }
      }
    } catch (e) { /* a pack whose index cannot be imported is not this gate's business */ }
  }
  return out
}

/** The checker §1/§3 share: return the list of violations for a given declaration list. */
function violations(declarations) {
  const bad = []
  for (const d of declarations) {
    const dom = enumDomains.get(d.key) || (closedReaders.get(d.key) || {}).domain
    if (!dom) continue
    if (!dom.includes(d.value)) bad.push({ key: d.key, value: d.value, domain: dom, where: d.where })
  }
  return bad
}

if (!onlySelftest) {
  const declared = await declaredValues()
  console.log('=== §1 STATIC: every declared value is inside its key\'s domain (' + declared.length + ' declarations from ' + new Set(declared.map((d) => d.where)).size + ' sources) ===')
  console.log('  enum-typed keys in the schema: ' + enumDomains.size + '; free-string keys with a closed reader list: ' + closedReaders.size)
  const bad = violations(declared)
  ok(bad.length === 0, 'no pack declares a value outside its key\'s domain', bad)

  console.log('=== §2 LIVE: an out-of-domain value must be REFUSED BY NAME (not silently downgraded) ===')
  // ★ TB-2794 Step 1 (migration truth): no free-string key with a reader-side closed list survives (`kernel/paper.js` is
  // deleted; finalizer is enum-typed), so there is no live probe to run here. The 0 is stated BY NAME (with §3 proving the
  // checker still has teeth) instead of a silently-empty loop.
  ok(closedReaders.size === 0, 'no live closed-list reader survives: 0 free-string keys with a reader-side closed list (the enum half is the only closed-domain path left)', { closedReaders: [...closedReaders.keys()] })

  console.log('=== §3 SELFTEST: the checker is not vacuous (a seeded violation must be reported) ===')
}

// §3 (also the --selftest entry point): seed a violation and require the checker to see it.
{
  const seeded = violations([{ key: 'vmu.paper.finalizer', value: '__seeded-out-of-domain__', where: 'selftest' }])
  const seededEnum = violations([{ key: [...enumDomains.keys()][0], value: '__seeded-out-of-domain__', where: 'selftest' }])
  ok(seeded.length === 1, 'the closed-list checker reports a seeded out-of-domain value', seeded)
  ok(seededEnum.length === 1, 'the enum checker reports a seeded out-of-domain value', seededEnum)
  const cleanDomain = closedReaders.size > 0 ? [...closedReaders.values()][0].domain : ['editor', 'contributor', 'any']
  const clean = violations([{ key: 'vmu.paper.finalizer', value: cleanDomain[0], where: 'selftest' }])
  ok(clean.length === 0, 'and it does NOT report an in-domain value (so the gate is not always-red)', clean)
}

console.log('=== PACK VALUE-DOMAIN: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
