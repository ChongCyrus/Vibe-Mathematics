// WHAT THIS PROVES, AND WHAT IT CANNOT (round 608, discipline 11.ao).
//
// This proves NO DRIFT: each generator, run bare, produces what the committed file already contains. It cannot prove the artifact is
// CORRECT, because the criterion is the generator itself - and round 606 measured exactly that blind spot: a real bug, a generator
// reading source code as data, passed this check fourteen times out of fourteen both before and after the fix, since it produced the
// same wrong output every time.
//
// THE INDEPENDENT CRITERION LIVES ELSEWHERE, and it is the OUTCOME rather than the agreement: the generated settings table's counts
// (1038 keys across 105 families, asserted against the schema) and the content of the generated schema (no source fragment admitted as
// a key). A guard may only claim what its criterion can reach, so this one claims currency.
//
// tests/audit-generators-current.test.mjs - run EVERY generator that regen-all lists, bare, and require each to verify.
//
// WHY. Nine generators were wired into regen-all and only seven had a guard: generate-pack-prompts and generate-pack-persona
// had none, so a hand edit to packs/v5r-prompts.js or packs/v5r-persona.js would have survived the whole gate. Worse, those
// two had the OPPOSITE default - they wrote unless passed --check - so running them to test them would have overwritten the
// file being tested. Round 507 made --write the opt-in everywhere, and this guard reads regen-all's own table and runs each
// generator bare, so a generator added there is covered the moment it is listed and can never be silently bypassed.
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

console.log('=== 1. REGEN-ALL S OWN TABLE IS READ ===')
const regen = readFileSync(join(REPO, 'scripts', 'regen-all.mjs'), 'utf8')
const entries = [...regen.matchAll(/\['([^']+)',\s*'(scripts\/generate-[\w-]+\.mjs)'(?:,\s*'([^']*)')?\]/g)]
  .map((m) => ({ label: m[1], script: m[2], args: (m[3] || '').trim() }))
ok(entries.length >= 11, 'regen-all lists its generators', { n: entries.length })
const missingScript = entries.filter((e) => !existsSync(join(REPO, e.script)))
ok(missingScript.length === 0, 'and every script it lists exists', { missing: missingScript.map((e) => e.script) })

console.log('=== 2. EVERY GENERATOR MAKES WRITING AN OPT-IN ===')
// a generator that overwrites by default cannot be verified without destroying the thing under test
const writeByDefault = []
for (const e of entries) {
  const src = readFileSync(join(REPO, e.script), 'utf8')
  const writesOnWriteFlag = /process\.argv\.includes\('--write'\)/.test(src)
  const checks = /--check/.test(src)
  if (!writesOnWriteFlag && !checks) writeByDefault.push(e.script)
}
ok(writeByDefault.length === 0,
  'every generator checks unless asked to write, so running one to verify it cannot overwrite what it verifies',
  { writeByDefault })

console.log('=== 3. AND NO GENERATED ARTIFACT IS STALE ===')
const stale = []
for (const e of entries) {
  try {
    execFileSync(process.execPath, [join(REPO, e.script)], { cwd: REPO, encoding: 'utf8' })
  } catch (err) {
    stale.push(e.label + ' -> ' + (String(err.stdout || '') + String(err.stderr || '')).trim().slice(0, 140))
  }
}
ok(stale.length === 0,
  'running every generator bare reports every generated artifact current, so a hand edit to one fails the gate',
  { stale })

console.log('=== GENERATORS CURRENT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
