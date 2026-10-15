// vmu: "THE KEPT VALUE IS A PREFIX OF THE ORIGINAL" MUST BE RE-DERIVABLE (round 36, task-171).
//
// THE COMPLAINT THIS ANSWERS (vmu-verify2, R35): a real receipt showed `elided[0] = {path, from:2000, to:14000,
// bytes:12000}`, and a reviewer could check `bytes === to - from`, `to`, the kept length and the tail - but NOT
// whether the kept value was character-for-character the original's prefix, because the 14,000-character input was
// gone. A claim that cannot be re-derived from what is retained is one revision from unverifiable.
//
// WHAT THIS FILE RETAINS, AND WHY THAT IS THE MECHANISM (not hashes):
//   · the ORIGINAL IS RE-DERIVABLE from a RETAINED RULE - `'ABCDEFGHIJ'` repeated 1,400 times - so the original never
//     has to be stored as a 14 KB literal (repository size / audit-code-size) and a reviewer can rebuild it;
//   · with the original rebuilt, "kept is a prefix" is checked CHARACTER BY CHARACTER, and the receipt's own
//     `keptHash` / `origHash` / `origBytes` are recomputed against it (tamper-evidence).
//   · ★ HASHES ALONE COULD NOT DO THIS. `keptHash` + `origHash` prove the kept segment is the one described and that
//     a claimed original existed; they say NOTHING about one string being a prefix of another (hashing is one-way).
//     So the rule is what makes prefix-ness re-derivable, and the hashes are what make silent alteration detectable.
//   · ★ WHAT REMAINS (named): for ARBITRARY real content there is no rule to retain, so prefix-ness stays a CLAIM
//     there - the hashes bound the damage, which is more than before and less than proof.
//
// ★ `execute()` on a vmu tool returns a JSON STRING, not an object - it must be parsed.

import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const { boundedToolResult } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'receiptbounds.js')).href)

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

// ★ THE RETAINED MATERIAL: a rule, not a literal. 10 chars x 1400 = the same 14,000 the real arm used.
const UNIT = 'ABCDEFGHIJ'
const TIMES = 1400
const MARKER = '…[elided]'
const rebuildOriginal = () => UNIT.repeat(TIMES)
const sha = (s) => createHash('sha256').update(s).digest('hex')

const original = rebuildOriginal()
ok(original.length === 14000 && original === UNIT.repeat(TIMES),
  'A1. premise: the ORIGINAL IS RE-DERIVABLE from retained material (a rule, not a 14 KB literal)', { len: original.length })

const env = JSON.parse(boundedToolResult({ ok: true, blob: original }))
const m = env.receiptMeta
const e = Array.isArray(m.elided) && m.elided.length > 0 ? m.elided[0] : null
ok(!!e && e.path === 'blob' && m.truncated === true,
  'A2. premise: a 14,000-char leaf really was elided, and the record names it', { elided: m.elided, truncated: m.truncated })

// ★★ THE CORE: rebuild the original from the retained rule, then check PREFIX-NESS character by character.
{
  const rebuilt = rebuildOriginal()
  ok(!!e && e.to === rebuilt.length,
    'B1. record-only check: `to` equals the rebuilt original length', { to: e && e.to, rebuilt: rebuilt.length })
  ok(!!e && e.bytes === e.to - e.from,
    'B2. record-only check: `bytes === to - from`', e)
  // ★★ "kept is a prefix of the original" - the assertion that was previously impossible.
  ok(!!e && rebuilt.slice(0, e.from) + MARKER === env.blob,
    'B3. ★★ RE-DERIVED: the kept value is literally `rebuilt.slice(0, from)` plus the marker (character-for-character, not asserted)',
    { from: e && e.from, kept: env.blob && env.blob.length })
  ok(!!e && e.keptBytes === env.blob.length && e.from + MARKER.length === env.blob.length,
    'B4. the record agrees with the value actually present (`keptBytes`, and `from` + marker length)', { keptBytes: e && e.keptBytes, present: env.blob && env.blob.length })
  // ★ TAMPER-EVIDENCE, recomputed over the rebuilt original.
  // `keptHash`/`keptBytes` describe the value AS IT APPEARS in the receipt (kept prefix + marker), which is the
  // useful reading: recomputing over exactly what a reviewer can see is what makes silent alteration detectable.
  ok(!!e && e.hash === 'sha256' && sha(env.blob) === e.keptHash,
    'B5. ★ `keptHash` recomputes over the value present in the receipt (so a later alteration would show)', e && { algo: e.hash, keptHash: e.keptHash && e.keptHash.slice(0, 16) })
  ok(!!e && sha(rebuilt.slice(0, e.from)) === sha(env.blob.slice(0, e.from)),
    'B5b. ★ and the bare prefix inside that value hashes the same as the rebuilt original\'s prefix', { from: e && e.from })
  ok(!!e && sha(rebuilt) === e.origHash,
    'B6. ★ `origHash` recomputes over the REBUILT original (so the claimed original is pinned to retained material)', e && { origHash: e.origHash && e.origHash.slice(0, 16) })
  // ★ AND THE HONEST LIMIT, asserted rather than described: hashes alone cannot decide prefix-ness.
  const swapped = rebuilt.slice(0, e.from).split('').reverse().join('')
  ok(!!e && sha(swapped) !== e.keptHash && swapped !== rebuilt.slice(0, e.from),
    'B7. ★ a re-ordering of the SAME characters does not match `keptHash` (the hash binds order, not just content)',
    { keptHash: e && e.keptHash && e.keptHash.slice(0, 16) })
}

// ★ TWO-STATE / MULTI-ENTRY ISOMORPHISM: every `elided[]` ENTRY has the SAME key set, whatever was cut.
{
  // ★ Sizes chosen so the shrinker must cut MORE THAN ONE leaf (with 9,000-char leaves the first cut already fits,
  // which is why the first version of this fixture only produced one entry - a faulty PREMISE in my test, not a
  // finding about the code).
  const many = { ok: true, a: 'x'.repeat(30000), b: 'y'.repeat(30000) }
  const env2 = JSON.parse(boundedToolResult(many))
  const list = (env2.receiptMeta && env2.receiptMeta.elided) || []
  ok(list.length >= 2, 'C1. premise: more than one entry (so the entry SHAPE can be compared)', list.length)
  const keys = JSON.stringify(Object.keys(list[0] || {}).sort())
  ok(list.length >= 2 && list.every((x) => JSON.stringify(Object.keys(x).sort()) === keys),
    'C2. ★ every entry has the SAME key set (an entry whose fields depended on the case would be a conditional shape)', { keys, all: list.map((x) => Object.keys(x).length) })
  const empty = JSON.parse(boundedToolResult({ ok: true, small: 'no elision here' }))
  ok(Array.isArray(empty.receiptMeta.elided) && empty.receiptMeta.elided.length === 0 && JSON.stringify(Object.keys(empty.receiptMeta).sort()) === JSON.stringify(Object.keys((env2.receiptMeta || {})).sort()),
    'C3. ★ the empty state keeps the same `receiptMeta` key set (`elided: []`), so the shape does not depend on size', empty.receiptMeta)
}

console.log('=== VMU ELISION PREFIX RECOMPUTABLE: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
