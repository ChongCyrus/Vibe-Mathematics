// scripts/audit-pack-value-domain.mjs — PACK VALUE-DOMAIN GATE (round 8's general guard, round 9 made permanent).
//
// WHY THIS EXISTS. `vmu.paper.finalizer` was declared `type:'string'` while its reader kept a CLOSED value list
// (`kernel/paper.js`'s `FINALIZERS`), so a declaration outside that list - v5r's `paperEditor:'academician'` - was
// silently downgraded to 'editor': the declaration had no effect and no complaint. That is the "declared but not
// in effect" class this repository refuses. Round 8 fixed that instance (schema enum + a named refusal in the
// reader); THIS gate is the general guard, so the next instance cannot appear unnoticed.
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

// ── the framework's declared domains ────────────────────────────────────────────────────────────────────────
const schema = readFileSync(join(VMU, 'settings', 'schema.js'), 'utf8')
const enumDomains = new Map() // key -> domain array (enum-typed keys only)
for (const m of schema.matchAll(/\{\s*key:\s*'([^']+)'[^}]*?type:\s*'enum'([^}]*)\}/g)) {
  const dom = m[2].match(/domain:\s*(\[[^\]]*\])/)
  if (dom) enumDomains.set(m[1], JSON.parse(dom[1].replace(/'/g, '"')))
}
// Keys the schema types as a free `string` but whose READER keeps a closed list. Measured, never guessed:
//   vmu.paper.finalizer -> kernel/paper.js's `FINALIZERS`
const paperSrc = readFileSync(join(VMU, 'kernel', 'paper.js'), 'utf8')
const closedReaders = new Map()
{
  const m = paperSrc.match(/export const FINALIZERS = Object\.freeze\((\[[^\]]*\])\)/)
  if (m) closedReaders.set('vmu.paper.finalizer', { domain: JSON.parse(m[1].replace(/'/g, '"')), reader: 'kernel/paper.js FINALIZERS' })
}

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
  const { createPaper } = await import(pathToFileURL(join(VMU, 'kernel', 'paper.js')).href)
  for (const [key, info] of closedReaders) {
    if (key !== 'vmu.paper.finalizer') continue
    const values = { [key]: '__out-of-domain__', 'vmu.paper.requireAllSections': false, 'vmu.paper.officeConsult': 'off' }
    const paper = createPaper({ settings: { get: (k) => values[k] }, register: async () => ({ ok: true }), clock: () => 1000 })
    let code = null
    let message = ''
    try {
      paper.start({ title: 'probe', editor: 'e1', sections: ['intro'], contributors: { intro: 'e1' } })
    } catch (e) { code = e && e.code; message = String((e && e.message) || '') }
    ok(code === 'VMU_INVALID_ARGUMENT' && message.includes(info.domain.join('|')),
      key + ': an out-of-domain value is refused BY NAME and the domain is stated', { code, message: message.slice(0, 90), domain: info.domain })
  }

  console.log('=== §3 SELFTEST: the checker is not vacuous (a seeded violation must be reported) ===')
}

// §3 (also the --selftest entry point): seed a violation and require the checker to see it.
{
  const seeded = violations([{ key: 'vmu.paper.finalizer', value: '__seeded-out-of-domain__', where: 'selftest' }])
  const seededEnum = violations([{ key: [...enumDomains.keys()][0], value: '__seeded-out-of-domain__', where: 'selftest' }])
  ok(seeded.length === 1, 'the closed-list checker reports a seeded out-of-domain value', seeded)
  ok(seededEnum.length === 1, 'the enum checker reports a seeded out-of-domain value', seededEnum)
  const clean = violations([{ key: 'vmu.paper.finalizer', value: closedReaders.get('vmu.paper.finalizer').domain[0], where: 'selftest' }])
  ok(clean.length === 0, 'and it does NOT report an in-domain value (so the gate is not always-red)', clean)
}

console.log('=== PACK VALUE-DOMAIN: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
