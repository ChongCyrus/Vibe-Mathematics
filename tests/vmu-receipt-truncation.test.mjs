// vmu: EVERY TOOL RESULT CARRIES `receiptMeta`, AND ITS SHAPE DOES NOT DEPEND ON ITS SIZE (round 33, task-161).
//
// THE REAL-MACHINE FINDING THIS PINS (measured on hardware, then reproduced in-process): a 179,826-character receipt
// came back with NO marker at all. Through the real seam the status face has ~4,470 string leaves whose LONGEST is
// 378 characters - every leaf is under the per-leaf cap, so there was nothing to shorten and the previous version
// returned the receipt RAW and SILENT. The budget was never enforced and nothing said so.
//
// THE CONTRACT (why this fixes it without cutting harder): `receiptMeta` is ALWAYS present, with the SAME FIVE KEYS
// in both states - state is expressed by VALUE (`truncated:false` / `elided:[]` / a real `originalBytes`), never by
// the presence of a key. So a consumer can always read it, and a receipt that is far over budget with nothing
// cap-able now SAYS SO instead of being quiet.
//   · `hostElision` is always `'possible'` - the host's own later `[...]` insertion is outside this receipt;
//   · `originalBytes` is always the real serialized size (NOT null): that is what makes the wide-receipt case
//     legible ("146k bytes, nothing elided"), which is exactly what was invisible before.
//
// ★ `execute()` on a vmu tool returns a JSON STRING, not an object - it must be parsed.

import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const { boundedToolResult, toHostSpec, MAX_TOOL_RESULT_BYTES } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'host.js')).href)

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}
const META_KEYS = ['truncated', 'elided', 'hostElision', 'originalBytes', 'note']
const sameKeys = (m) => !!m && JSON.stringify(Object.keys(m).sort()) === JSON.stringify([...META_KEYS].sort())

// ---------------------------------------------------------------------------------------------------------
// A. WITHIN the budget: still carries the SAME five keys, all in their empty state
// ---------------------------------------------------------------------------------------------------------
{
  const small = { ok: true, hello: 'world' }
  const env = JSON.parse(boundedToolResult(small))
  ok(env.ok === true && env.hello === 'world', 'A1. a small result keeps its own fields untouched')
  const m = env.receiptMeta || null
  // ★ NULL-SAFE ON PURPOSE: if a mutation removes `receiptMeta` altogether (the R32 defect), this must fail as a
  // NAMED assertion below - not crash with a TypeError, which would read as "red" without naming the broken contract.
  ok(sameKeys(m),
    'A2. ★ the SAME five keys are present even when nothing was cut (shape does not depend on size)', m && Object.keys(m))
  ok(!!m && m.truncated === false && Array.isArray(m.elided) && m.elided.length === 0 && m.hostElision === 'possible' && m.note === null,
    'A3. ★ the empty state is expressed by VALUE (`truncated:false` / `elided:[]` / `note:null`), not by a missing key', m)
  ok(!!m && typeof m.originalBytes === 'number' && m.originalBytes > 0,
    'A4. `originalBytes` is a real size here too (NOT null) - the reader can always compare it to the budget', m && m.originalBytes)
}

// ---------------------------------------------------------------------------------------------------------
// B. OVER the budget with an oversized string: cut, declared INSIDE receiptMeta, shape intact
// ---------------------------------------------------------------------------------------------------------
{
  const value = { ok: true, packs: ['v5r-core'], faces: { enabled: ['status'] }, blob: 'x'.repeat(MAX_TOOL_RESULT_BYTES * 4) }
  const originalBlobLen = value.blob.length
  const env = JSON.parse(boundedToolResult(value))
  const m = env.receiptMeta
  ok(sameKeys(m), 'B1. the key set is IDENTICAL to the empty state (that is the whole point of the contract)', m && Object.keys(m))
  ok(m.truncated === true, 'B2. ★ over budget with a cap-able leaf: `truncated:true`')
  // ★ THE CONSUMER CRITERION: this is what `vmu-entry` reads off the real status face.
  ok(env.ok === true && Array.isArray(env.packs) && env.packs[0] === 'v5r-core' && env.faces && env.faces.enabled,
    'B3. ★★ THE SHAPE SURVIVES: `packs` and `faces` are still readable after elision', { packs: env.packs })
  const r = Array.isArray(m.elided) ? (m.elided.find((x) => x.path === 'blob') || null) : null
  ok(!!r && r.to === originalBlobLen && r.bytes === r.to - r.from && r.from > 0 && r.from < originalBlobLen,
    'B4. ★ `elided` names the exact leaf and the range is ACCURATE against the original', { range: r, originalBlobLen })
  ok(!!r && 'x'.repeat(r.from) === env.blob.slice(0, r.from),
    'B5. ★ the surviving value is literally the original prefix (checkable, not asserted)', { kept: r && r.from })
  ok(m.originalBytes > MAX_TOOL_RESULT_BYTES && typeof m.note === 'string' && m.note.length > 0,
    'B6. the original size travels, and the state is explained in words', { originalBytes: m.originalBytes })
  ok(m.hostElision === 'possible', 'B7. ★ the HOST boundary is named separately from our own elision', m.hostElision)
}

// ---------------------------------------------------------------------------------------------------------
// C. ★★ THE REAL-MACHINE CASE: over budget and NOTHING cap-able (many small fields, no long strings)
// ---------------------------------------------------------------------------------------------------------
{
  const wide = { ok: true, packs: ['v5r-core'] }
  for (let i = 0; i < 2600; i++) wide['k' + i] = 'v' + i          // many SMALL strings: under every per-leaf cap
  const before = JSON.stringify(wide).length
  const env = JSON.parse(boundedToolResult(wide))
  const m = env.receiptMeta
  ok(before > MAX_TOOL_RESULT_BYTES,
    'C1. premise: this receipt IS far over the budget (measured on hardware: ~180k with a 378-char longest leaf)', { before, max: MAX_TOOL_RESULT_BYTES })
  ok(m.truncated === false && Array.isArray(m.elided) && m.elided.length === 0,
    'C2. ★ we cut nothing (there is nothing cap-able), so we do NOT claim we did', { truncated: m.truncated, elided: m.elided })
  ok(m.originalBytes === before,
    'C3. ★★ ...but the over-budget SIZE IS STATED - the exact fact that used to be invisible (the receipt came back raw and silent)', { stated: m.originalBytes, real: before })
  ok(typeof m.note === 'string' && m.note.length > 0 && m.hostElision === 'possible',
    'C4. ★★ and it says WHY it could not be cut, plus names the host boundary that may still cut it', { note: m.note && m.note.slice(0, 90) })
  ok(sameKeys(m) && wide.k2599 === 'v2599',
    'C5. the key set matches the other states and the wide content itself is untouched', { keys: m && Object.keys(m) })
}

// ---------------------------------------------------------------------------------------------------------
// D. THROUGH THE REAL SEAM, plus the NAMED non-object boundary
// ---------------------------------------------------------------------------------------------------------
{
  const small = { name: 'probe_small', description: 'd', parameters: {}, run: async () => ({ ok: true, n: 1 }) }
  const parsedSmall = JSON.parse(await toHostSpec(small).execute({}))
  ok(parsedSmall.ok === true && sameKeys(parsedSmall.receiptMeta),
    'D1. through `toHostSpec`, a normal tool result carries the full `receiptMeta` in its empty state', parsedSmall.receiptMeta)
  const bigSpec = { name: 'probe_big', description: 'd', parameters: {}, run: async () => ({ ok: true, packs: ['p'], blob: 'z'.repeat(MAX_TOOL_RESULT_BYTES * 4) }) }
  const parsedBig = JSON.parse(await toHostSpec(bigSpec).execute({}))
  ok(parsedBig.receiptMeta.truncated === true && parsedBig.packs && parsedBig.packs[0] === 'p',
    'D2. ★ through the REAL seam an over-budget result is declared AND still shaped', { meta: parsedBig.receiptMeta.truncated, packs: parsedBig.packs })
  // ★ NON-OBJECT RESULTS ARE A NAMED BOUNDARY, not a silent hole: a sub-object cannot be attached to a bare string, so
  // those come back without `receiptMeta` - asserted here so the boundary is visible rather than assumed.
  const strSpec = { name: 'probe_str', description: 'd', parameters: {}, run: async () => 'plain string result' }
  const parsedStr = JSON.parse(await toHostSpec(strSpec).execute({}))
  ok(parsedStr === 'plain string result',
    'D3. a non-object result is returned as-is (a NAMED boundary: no sub-object can be attached to a bare value)', parsedStr)
}

console.log('=== VMU RECEIPT TRUNCATION: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
