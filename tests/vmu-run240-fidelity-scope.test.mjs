// tests/vmu-run240-fidelity-scope.test.mjs — a declaration must exempt the FACT, not the tool.
//
// WHY: `scripts/sim/audit/fidelity-declared.json` lets the fidelity gate stop failing on a live receipt field that no
// honest scenario can produce (a Lean executor this workspace does not ship, a shape an older build emitted). The
// first version exempted a WHOLE TOOL: one unreachable key silenced every other key of that tool, so the next real
// fidelity regression on it would have been invisible. RUN 240 narrowed the exemption to `keys: [...]` and this suite
// pins the three things that keep that narrow:
//   ① the gate reads `keys` at all (source pin) and keeps the un-declared keys as failures;
//   ② every declared key actually exists in the LIVE field list (a declaration about a field nobody emits is a story).
//      "The live field list" is TWO measurements, because they record different things: `real-fieldset.json` is the
//      top-level key list of each real receipt, while `compare/real-fields.jsonl` records nested leaves as dotted
//      paths (`current.bytes`). A dotted declaration is a claim about a nested leaf, so it is checked against the
//      corpus that records nested leaves; a flat declaration is checked against the flat fieldset. Invented keys on
//      either side still fail (§2b2 proves the nested source is a measurement and not a rubber stamp);
//   ③ every entry carries a kind from the file's own glossary and a reason long enough to be a reason.
//
// The live field list and the rich corpus are MEASUREMENT artefacts (scripts/sim/harvest/real.mjs writes them from real
// session logs), not repository files: a fresh clone does not have them. A missing measurement is not a pass — this
// suite used to print `skip` and exit 0, which is the exact vacuous green it exists to prevent. It now throws through
// `tests/_lib/corpus.mjs`, so the run is red and the message names the path (TB-2677 / TB-2681).
//
// Run: node tests/vmu-run240-fidelity-scope.test.mjs

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireCorpusFile } from './_lib/corpus.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const FIELDSET_PATH = requireCorpusFile('real-fieldset.json')
// Nested leaves live here: one row per real receipt with a `fields` map whose nested members are dotted paths.
const RICH_PATHS = ['compare/real-fields.jsonl', 'real-receipts.jsonl']
const read = (p) => readFileSync(join(REPO, p), 'utf8')
const readJson = (p) => JSON.parse(read(p))

let passed = 0
let failed = 0
const ok = (cond, what, detail = '') => {
  if (cond) { passed += 1; console.log('  ok   ' + what) } else { failed += 1; console.log('  FAIL ' + what + (detail ? '  [' + detail + ']' : '')) }
}

const allSrc = read('scripts/sim/audit/all.mjs')
// TB-2653 moved the measurement itself into ONE ruler (`fidelity-measure.mjs`) that both the audit and the release
// gate import. The pins below therefore name the ruler, not the old inline copy: pinning all.mjs for logic that now
// lives in the shared module would be a pin on a comment. §0a keeps the delegation itself pinned (all.mjs must go
// THROUGH the ruler), so a second private copy cannot grow back unnoticed.
const measureSrc = read('scripts/sim/audit/fidelity-measure.mjs')
const declared = readJson('scripts/sim/audit/fidelity-declared.json')
const fieldset = JSON.parse(readFileSync(FIELDSET_PATH, 'utf8'))

console.log('--- 0. the gate reads a key list, not just a tool name')
ok(allSrc.includes('measureFidelity({ rich, simFields, declared, baseline })'), '§0a the audit measures through the one shared ruler, not a private copy')
ok(measureSrc.includes('Array.isArray(declRow.keys)'), '§0b the ruler parses declRow.keys')
ok(measureSrc.includes('const byDecl = declRow !== undefined && (declKeys === null || declKeys.includes(k))') && measureSrc.includes('if (byDecl) { declaredGapPaths.push'), '§0c a declared key removes only ITSELF from the gap and the REST stays a candidate')
ok(measureSrc.includes('gaps.push({ tool, field: k })'), '§0d what remains undeclared is still reported as a gap')
ok(allSrc.includes('declarations that name keys which are no longer gaps'), '§0e a stale key declaration is a warning (the file cannot rot silently)')
ok(measureSrc.includes('Array.from(new Set(staleDeclaredKeys)).sort()'), '§0f the stale-key warning is de-duplicated and sorted')

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
// Dotted leaves (`current.bytes`) never appear in the flat fieldset by construction (it lists top-level keys), so
// checking them there would call every honest nested declaration "invented". Build the dotted side from the rich
// corpus instead — the same measurement the parity differ reads. `invented` on either side is still a failure.
const richPath = (() => {
  try {
    return requireCorpusFile(RICH_PATHS[0])
  } catch {
    return requireCorpusFile(RICH_PATHS[1])
  }
})()
const richKeys = new Map()
if (richPath) {
  for (const line of readFileSync(richPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue
    let row
    try { row = JSON.parse(line) } catch { continue }
    if (!row || !row.tool) continue
    if (!richKeys.has(row.tool)) richKeys.set(row.tool, new Set())
    const set = richKeys.get(row.tool)
    for (const k of Object.keys(row.fields || {})) set.add(k)
    for (const k of Array.isArray(row.keys) ? row.keys : []) set.add(k)
  }
}
const seenNested = (t, k) => Boolean(richKeys.has(t) && richKeys.get(t).has(k))
{
  const unknownTool = tools.filter((t) => liveKeys(t).length === 0)
  ok(unknownTool.length === 0, '§2a a declaration names a tool the live machine actually called', unknownTool.join(', '))
  ok(declaredWithKeys.length > 0, '§2b0 the key-scoped list is not empty (the loop below runs zero times otherwise)', String(declaredWithKeys.length))
  const phantom = []
  const unverifiable = []
  for (const t of declaredWithKeys) {
    for (const k of declared[t].keys) {
      if (k.includes('.')) {
        if (!richPath) unverifiable.push(t + '.' + k)
        else if (!seenNested(t, k)) phantom.push(t + '.' + k)
      } else if (!liveKeys(t).includes(k)) {
        phantom.push(t + '.' + k)
      }
    }
  }
  ok(phantom.length === 0, '§2b no declared key is invented: each one was seen in a real receipt', phantom.slice(0, 6).join(', '))
  ok(unverifiable.length === 0, '§2b1 every dotted declaration is verifiable here (no nested corpus means no green)', unverifiable.slice(0, 6).join(', '))
  // RULE E again, one level down: the dotted branch of the loop above must not be a rubber stamp. A leaf the live
  // machine never emitted has to be rejected by the same function that accepts `current.bytes`; otherwise the
  // branch would pass on any dotted string and the exemption could name fields nobody ever produced.
  const realLeaf = ['vibe_v5_blueprint', 'current.bytes']
  ok(seenNested(realLeaf[0], realLeaf[1]), '§2b2 the nested source really contains a declared leaf', realLeaf.join('.'))
  ok(!seenNested('vibe_v5_blueprint', 'current.noSuchLeafAtAll'), '§2b2 the nested source is not a rubber stamp: an invented leaf is rejected')
  const overBroad = declaredWithKeys.filter((t) => liveKeys(t).length > 0 && declared[t].keys.length >= liveKeys(t).length)
  ok(overBroad.length === 0, '§2c no entry exempts every key of a tool (that would be a whole-tool declaration in disguise)', overBroad.join(', '))
  const dupes = declaredWithKeys.filter((t) => new Set(declared[t].keys).size !== declared[t].keys.length)
  ok(dupes.length === 0, '§2d no key is listed twice', dupes.join(', '))
  const emptyKeys = declaredWithKeys.filter((t) => declared[t].keys.length === 0)
  ok(emptyKeys.length === 0, '§2e an entry that exempts nothing is noise and must be dropped', emptyKeys.join(', '))
}

console.log('')
console.log('=== VMU RUN 240 FIDELITY SCOPE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
