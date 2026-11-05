// tests/vmu-run240-fidelity-scope.test.mjs — a declaration must exempt the FACT, not the tool.
//
// WHY: `scripts/sim/audit/fidelity-declared.json` lets the fidelity gate stop failing on a live receipt field that no
// honest scenario can produce (a Lean executor this workspace does not ship, a shape an older build emitted). The
// first version exempted a WHOLE TOOL: one unreachable key silenced every other key of that tool, so the next real
// fidelity regression on it would have been invisible. RUN 240 narrowed the exemption to `keys: [...]` and this suite
// pins the three things that keep that narrow:
//   ① the gate reads `keys` at all (source pin) and keeps the un-declared keys as failures;
//   ② every declared key actually exists in the LIVE field list (a declaration about a field nobody emits is a story);
//   ③ every entry carries a kind from the file's own glossary and a reason long enough to be a reason.
//
// The live field list is a MEASUREMENT artefact (scripts/sim/harvest/real.mjs writes it from real session logs), not a
// repository file: a fresh clone does not have it. When it is absent the key-existence checks cannot run, and saying
// "passed" would be the exact vacuous green this suite exists to prevent — so they are SKIPPED and counted as skipped.
//
// Run: node tests/vmu-run240-fidelity-scope.test.mjs

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const FIELDSET_PATH = 'D:/_tmp/sim/real-fieldset.json'
const read = (p) => readFileSync(join(REPO, p), 'utf8')
const readJson = (p) => JSON.parse(read(p))

let passed = 0
let failed = 0
let skipped = 0
const ok = (cond, what, detail = '') => {
  if (cond) { passed += 1; console.log('  ok   ' + what) } else { failed += 1; console.log('  FAIL ' + what + (detail ? '  [' + detail + ']' : '')) }
}
const skip = (what, why) => { skipped += 1; console.log('  skip ' + what + (why ? '  [' + why + ']' : '')) }

const allSrc = read('scripts/sim/audit/all.mjs')
const declared = readJson('scripts/sim/audit/fidelity-declared.json')
const haveFieldset = existsSync(FIELDSET_PATH)
const fieldset = haveFieldset ? JSON.parse(readFileSync(FIELDSET_PATH, 'utf8')) : {}

console.log('--- 0. the gate reads a key list, not just a tool name')
ok(allSrc.includes('Array.isArray(declRow.keys)'), '§0a the gate parses declRow.keys')
ok(allSrc.includes('const residual = residualOf(gap)'), '§0b a declared key is removed from the gap and the REST stays a failure')
ok(allSrc.includes("missing.push(tool + ' missing ' + residual.join('/'))"), '§0c what remains undeclared is still reported as a gap')
ok(allSrc.includes('declarations that name keys which are no longer gaps'), '§0d a stale key declaration is a warning (the file cannot rot silently)')
ok(allSrc.includes('Array.from(new Set(staleKeyDeclarations)).sort()'), '§0e the stale-key warning is de-duplicated and sorted')

console.log('--- 1. every entry is a key list with a real reason')
const tools = Object.keys(declared).filter((k) => !k.startsWith('_'))
ok(tools.length > 0, '§1a there is at least one declaration', String(tools.length))
const declaredWithKeys = tools.filter((t) => Array.isArray(declared[t].keys))
// RULE E: every assertion below quantifies over this list, so an EMPTY list would make them all pass while
// checking nothing. The file is supposed to keep at least one key-scoped entry (the preferred shape), so the
// list being empty is itself a failure, stated once here instead of being implied by the loop.
ok(declaredWithKeys.length > 0, '§1b0 at least one declaration is key-scoped (the loops below quantify over this list)', String(declaredWithKeys.length))
const wholeTool = tools.filter((t) => !Array.isArray(declared[t].keys))
// Two honest shapes only: key-scoped (the preferred one) and whole-tool — and whole-tool is legitimate ONLY when every
// call of that tool dies at the same named engine-unavailable refusal, i.e. the tool cannot run on this machine at all.
// A whole-tool entry for a tool the simulator CAN call would silence its future regressions, which is what RUN 240 fixed.
const badWhole = wholeTool.filter((t) => !String(declared[t].wholeTool || '').trim() || !/VMU_ENGINE_UNAVAILABLE/.test(String(declared[t].wholeTool)))
ok(badWhole.length === 0, '§1b a whole-tool entry explains that EVERY call stops at VMU_ENGINE_UNAVAILABLE', badWhole.join(', '))
ok(declaredWithKeys.length > 0, '§1b2 at least one entry is key-scoped', String(declaredWithKeys.length))
const kinds = declared._kinds || {}
const badKind = tools.filter((t) => !declared[t].kind || !Object.prototype.hasOwnProperty.call(kinds, declared[t].kind))
ok(badKind.length === 0, '§1c every kind comes from the file own glossary', badKind.join(', '))
const shortNote = tools.filter((t) => String(declared[t].note || '').trim().length < 20)
ok(shortNote.length === 0, '§1d every note is long enough to be a reason (>=20 chars)', shortNote.join(', '))
const NAMES_EVIDENCE = /\.(js|mjs|json|md)\b|seam|executor|service|spawn|deployment|workspace/i
const namesAFile = tools.filter((t) => NAMES_EVIDENCE.test(String(declared[t].note || '') + ' ' + String(declared[t].wholeTool || '')))
ok(tools.length > 0 && namesAFile.length === tools.length, '§1e every note names the file, seam or service that makes the field unreachable', tools.filter((t) => !NAMES_EVIDENCE.test(String(declared[t].note || '') + ' ' + String(declared[t].wholeTool || ''))).join(', '))
ok(Object.keys(kinds).includes('superseded-shape'), '§1f the glossary separates "an older build emitted this" from "this workspace cannot run it"', Object.keys(kinds).join(','))

console.log('--- 2. the declared keys are LIVE fields, and the exemption stays smaller than the tool')
const liveKeys = (t) => {
  const row = fieldset[t]
  if (Array.isArray(row)) return row
  return row && Array.isArray(row.keys) ? row.keys : []
}
if (!haveFieldset) {
  skip('§2a-e declared keys exist in the live field list / exemption is narrower than the tool', 'no ' + FIELDSET_PATH + ' (run scripts/sim/harvest/real.mjs)')
} else {
  const unknownTool = tools.filter((t) => liveKeys(t).length === 0)
  ok(unknownTool.length === 0, '§2a a declaration names a tool the live machine actually called', unknownTool.join(', '))
  ok(declaredWithKeys.length > 0, '§2b0 the key-scoped list is not empty (the loop below runs zero times otherwise)', String(declaredWithKeys.length))
  const phantom = []
  for (const t of declaredWithKeys) for (const k of declared[t].keys) if (!liveKeys(t).includes(k)) phantom.push(t + '.' + k)
  ok(phantom.length === 0, '§2b no declared key is invented: each one was seen in a real receipt', phantom.slice(0, 6).join(', '))
  const overBroad = declaredWithKeys.filter((t) => liveKeys(t).length > 0 && declared[t].keys.length >= liveKeys(t).length)
  ok(overBroad.length === 0, '§2c no entry exempts every key of a tool (that would be a whole-tool declaration in disguise)', overBroad.join(', '))
  const dupes = declaredWithKeys.filter((t) => new Set(declared[t].keys).size !== declared[t].keys.length)
  ok(dupes.length === 0, '§2d no key is listed twice', dupes.join(', '))
  const emptyKeys = declaredWithKeys.filter((t) => declared[t].keys.length === 0)
  ok(emptyKeys.length === 0, '§2e an entry that exempts nothing is noise and must be dropped', emptyKeys.join(', '))
}

console.log('')
console.log('=== VMU RUN 240 FIDELITY SCOPE: ' + passed + ' passed, ' + failed + ' failed, ' + skipped + ' skipped ===')
process.exit(failed ? 1 : 0)
