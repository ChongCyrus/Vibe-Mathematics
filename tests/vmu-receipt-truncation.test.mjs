// vmu: A TRUNCATED TOOL RESULT MUST DECLARE ITSELF *WITHOUT CHANGING THE RECEIPT'S SHAPE* (round 32, task-157).
//
// THE DEFECT THIS PINS (mine, caught by the mandated suites and proved by ablation): the first implementation
// replaced the WHOLE receipt with `{ok, truncated, head, tail, …}` when it went over budget, so `st.packs` vanished
// and `vmu-entry` went red at `st.packs` undefined. "A payload got heavy, so the contract changed" is not acceptable:
//   · the elision must be STRUCTURAL - oversized STRING leaves shortened IN PLACE, no key dropped, no array resized;
//   · `elided` must be PATH-level: {path, from, to, bytes} naming WHICH value was cut and by how much;
//   · every other field (packs / faces / settings) stays readable - that is the consumer requirement;
//   · a result we did NOT cut carries NO `truncated` (reverse assertion);
//   · the HOST's own later `[...]` insertion is a separate fact (`hostElision`), never conflated with ours.
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

// ---------------------------------------------------------------------------------------------------------
// A. WITHIN the budget: byte-identical, NO `truncated` (the reverse assertion)
// ---------------------------------------------------------------------------------------------------------
{
  const small = { ok: true, hello: 'world' }
  const raw = JSON.stringify(small)
  const got = boundedToolResult(small)
  ok(got === raw, 'A1. a small result is serialized byte-identically (the budget changes nothing until it binds)', { len: raw.length })
  ok(!('truncated' in JSON.parse(got)),
    'A2. ★ REVERSE: a receipt we did NOT cut carries no `truncated` key ("always reports truncated" cannot pass)')
}

// ---------------------------------------------------------------------------------------------------------
// B. OVER the budget, with an oversized string: cut, declared, AND the shape survives
// ---------------------------------------------------------------------------------------------------------
{
  const value = { ok: true, packs: ['v5r-core'], faces: { enabled: ['status'] }, blob: 'x'.repeat(MAX_TOOL_RESULT_BYTES * 4) }
  const originalBlobLen = value.blob.length
  const got = boundedToolResult(value)
  const env = JSON.parse(got)
  ok(env.truncated === true, 'B1. ★ over budget the result IS declared as truncated', { max: MAX_TOOL_RESULT_BYTES })
  // ★ THE CONSUMER CRITERION - this is the assertion `vmu-entry` exercises against the real status face.
  ok(env.ok === true && Array.isArray(env.packs) && env.packs[0] === 'v5r-core' && env.faces && env.faces.enabled,
    'B2. ★★ THE SHAPE SURVIVES: `packs` and `faces` are still readable after elision (this is what broke when the whole receipt was replaced)',
    { packs: env.packs, faces: env.faces })
  ok(Array.isArray(env.elided) && env.elided.length > 0 && env.elided.every((r) => typeof r.path === 'string' && r.path.length > 0 && Number.isInteger(r.from) && Number.isInteger(r.to) && Number.isInteger(r.bytes)),
    'B3. ★ `elided` is a non-empty list of PATH-level integer ranges (which value, and by how much)', env.elided)
  // ★ NULL-SAFE ON PURPOSE: if a mutation removes the declaration entirely, these must fail as NAMED assertions on
  // B1/B3 - not crash with a TypeError, which would read as "red" without saying which contract broke.
  const r = Array.isArray(env.elided) ? (env.elided.find((x) => x.path === 'blob') || null) : null
  ok(!!r, 'B4. ★ the path names the exact leaf that was cut (`blob`)', env.elided)
  ok(!!r && r.to === originalBlobLen && r.bytes === r.to - r.from && r.from > 0 && r.from < originalBlobLen,
    'B5. ★ the range is ACCURATE against the original: `to` is its real length, `bytes === to - from`, and the kept part is a real prefix', { range: r, originalBlobLen })
  ok(!!r && typeof env.blob === 'string' && env.blob.length === r.from + '…[elided]'.length && 'x'.repeat(r.from) === env.blob.slice(0, r.from),
    'B6. ★ the surviving value is literally the original prefix (checkable, not asserted)', { kept: r && r.from })
  ok(env.hostElision === 'possible',
    'B7. ★ the HOST BOUNDARY is named separately: we do not claim to have prevented the host\'s own later `[...]`', env.hostElision)
  ok(typeof env.originalBytes === 'number' && env.originalBytes > MAX_TOOL_RESULT_BYTES,
    'B8. the envelope still reports the ORIGINAL size, so a reader can see how much was there', env.originalBytes)
  ok(got.length <= MAX_TOOL_RESULT_BYTES * 2,
    'B9. the kept result is materially smaller than the original (the elision actually binds)', { before: env.originalBytes, after: got.length })
}

// ---------------------------------------------------------------------------------------------------------
// C. LARGE but with nothing cap-able: we cut nothing (no `truncated`) yet still name the host boundary
// ---------------------------------------------------------------------------------------------------------
{
  const wide = { ok: true, rows: Array.from({ length: 4000 }, (_, i) => ({ i, tag: 't' + i })) }
  const length = JSON.stringify(wide).length
  const env = JSON.parse(boundedToolResult(wide))
  ok(length > MAX_TOOL_RESULT_BYTES,
    'C1. premise: this result IS over the budget (otherwise the case below is vacuous)', { length, max: MAX_TOOL_RESULT_BYTES })
  ok(!('truncated' in env),
    'C2. ★ we cut nothing (no oversized string leaf), so `truncated` must NOT appear - a claim we did not earn')
  // ★ NAMED GAP, NOT PAPERED OVER: on this shape we also do NOT add `hostElision`, because adding keys to a receipt
  // we did not cut broke `vmu-entry` (EXIT=1) and `vmu-host` (106/1) - consumers observe the key set, and the ruling
  // is that the shape must not move. So the host boundary is unnamed HERE (reported as a finding) instead of
  // re-breaking the consumers to name it.
  ok(env.rows && env.rows.length === 4000 && !('hostElision' in env),
    'C3. ★ the array shape is untouched (4000 rows) and NO keys were added to an uncut receipt (consumers observe the key set - see the named gap in the report)',
    { rows: env.rows && env.rows.length, hostElision: env.hostElision })
}

// ---------------------------------------------------------------------------------------------------------
// D. THROUGH THE REAL SEAM
// ---------------------------------------------------------------------------------------------------------
{
  const small = { name: 'probe_small', description: 'd', parameters: {}, run: async () => ({ ok: true, n: 1 }) }
  const rawSmall = await toHostSpec(small).execute({})
  const parsedSmall = typeof rawSmall === 'string' ? JSON.parse(rawSmall) : rawSmall
  ok(parsedSmall && parsedSmall.ok === true && !('truncated' in parsedSmall),
    'D1. through `toHostSpec`, a normal tool result is unchanged and undeclared', parsedSmall)
  const bigSpec = { name: 'probe_big', description: 'd', parameters: {}, run: async () => ({ ok: true, packs: ['p'], blob: 'z'.repeat(MAX_TOOL_RESULT_BYTES * 4) }) }
  const parsedBig = JSON.parse(await toHostSpec(bigSpec).execute({}))
  ok(parsedBig && parsedBig.truncated === true && parsedBig.packs && parsedBig.packs[0] === 'p' && Array.isArray(parsedBig.elided),
    'D2. ★ through the REAL seam, an over-budget result arrives self-declared AND still shaped', { truncated: parsedBig && parsedBig.truncated, packs: parsedBig && parsedBig.packs })
}

console.log('=== VMU RECEIPT TRUNCATION: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
