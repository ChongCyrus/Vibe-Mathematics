// vmu kernel · receiptbounds — THE SIZE CONTRACT FOR ONE TOOL RESULT (extracted from `host.js`, tasks 157/161/171).
//
// WHY THIS FILE EXISTS. `host.js` hit its 1200-line hard limit (1231 after the truncation work), and this project's
// rule is that a file at the ceiling may only get SMALLER - the fix is extraction, never "record it in a backlog and
// grow". The block moved here whole: it is self-contained (JSON, plain objects, `node:crypto`).
//
// WHAT IT OWNS:
//   · `MAX_TOOL_RESULT_BYTES` (12000) and `boundedToolResult(value)` - the ONE place a tool result is serialized;
//   · STRUCTURAL, PATH-LEVEL elision: only over-long STRING LEAVES are shortened in place (over `MAX_STRING_LEAF`),
//     and each cut is recorded with EIGHT keys - `elided:[{path, from, to, bytes, keptBytes, keptHash, origHash,
//     hash}]`. No key is dropped and no array is resized, so `packs`/`faces`/`settings` stay readable: `vmu-entry`'s
//     `st.packs` is the consumer that proved it;
//   · `receiptMeta`, ALWAYS present with the SAME FIVE KEYS in both states (`truncated`, `elided`, `hostElision`,
//     `originalBytes`, `note`). State is expressed by VALUE (`truncated:false`, `elided:[]`), never by the presence
//     of a key - a conditional key is itself a shape change, which is the defect this contract removes.
//
// WHAT IT DOES NOT OWN (named, not implied):
//   · it does NOT guarantee the result fits in the budget: only cap-able leaves can be shortened, so a receipt made
//     of many small fields stays large with `truncated:false` and a real `originalBytes`. That is reported rather
//     than hidden (measured on real hardware: 179,826 characters with no cap-able leaf);
//   · it does NOT remove the HOST's own later `\n\n[...]\n\n` insertion - that is a host boundary, reported
//     SEPARATELY as `hostElision:'possible'` and never conflated with our own cuts;
//   · it does NOT make "the kept value is a prefix of the original" re-derivable for ARBITRARY content. The hashes
//     give tamper-evidence; prefix-ness is recomputable only when the material's generation rule is retained
//     (`tests/vmu-elision-prefix-recomputable.test.mjs` retains one: `'ABCDEFGHIJ' × 1400`).
//
// ZERO MECHANISM: a pure-function module - one constant plus one function, no `create*` factory, no service, nothing
// to probe (registered `EXPECT_NA` in the zero-mechanism matrix, like `timevalue`/`contentvalue`).
import { createHash } from 'node:crypto'

// vmu receipt bounds — the size contract for ONE tool result (extracted from host.js, round 32 task-157).
//
// WHY IT IS ITS OWN MODULE: `host.js` is at its 1200-line hard limit, and this project's rule is that a file at
// the ceiling may only get SMALLER - the fix is extraction, never "record it in the backlog and grow". The block
// is self-contained (JSON + plain objects only), so it moves without dragging anything with it. `host.js` keeps a
// one-line call and a re-export, so its public surface is unchanged for every existing consumer.
/**
 * ROUND 32 / task-157 — HOW BIG A TOOL RESULT MAY GET BEFORE *WE* SAY WE CUT IT.
 *
 * ★★ THE SHAPE OF A RECEIPT MUST NOT DEPEND ON ITS SIZE. My first attempt (still visible in this file's history)
 * replaced the whole receipt with a self-declaring envelope when it went over budget. That is "a payload gets heavy,
 * so the contract changes": `vibe_vmu_status` came back as `{ok, truncated, head, tail, …}` and `st.packs` was simply
 * GONE - `vmu-entry` went red at `st.packs` undefined. THREE mandated suites broke and I only found out by running
 * them; the ablation (cap call removed, in a COPY) proved the cause was mine and not another writer's. So:
 *   · the elision is STRUCTURAL and PATH-LEVEL: oversized STRING leaves are shortened in place and each one is
 *     recorded as `elided:[{path, from, to, bytes}]`. No key is dropped, no array is resized, so `packs`, `faces`,
 *     `settings` and every other field remain readable exactly as before;
 *   · only the CONTENT of the heavy part changes, and it says so (`truncated: true`).
 *
 * ★ WHY A BUDGET AT ALL: the host inserts its own `\n\n[...]\n\n` into the JSON text it receives - observed at
 * position **24 846** on a real machine. That elision happens AFTER our serialization, so it is a HOST BOUNDARY: we
 * cannot see it and do not claim to remove it (`hostElision: 'possible'` is reported SEPARATELY, never conflated
 * with our own elisions). Stopping short of it ourselves keeps the omission visible and attributable.
 * ★ MEASURED CONTEXT (why the number is what it is): a real `vibe_vmu_status` receipt is ~23.6 kB, so any budget near
 * that will fire on some legitimate configurations - which is FINE now that firing no longer changes the shape.
 */
export const MAX_TOOL_RESULT_BYTES = 12000
/** Per string leaf: the longest a single string value may stay before it is elided (path recorded). */
const MAX_STRING_LEAF = 2000
/** Marker text put in place of what was dropped, so the value itself says it is partial. */
const ELISION_MARKER = '…[elided]'

/**
 * ROUND 36 / task-171 — WHAT AN ELISION RECORD MUST LET A REVIEWER RE-DERIVE, AND WHAT IT CANNOT.
 *
 * A reviewer of a real receipt could check `bytes === to - from`, `to`, the kept length and the tail - but NOT "the
 * kept value is character-for-character the original's prefix", because the 14,000-character input was no longer on
 * disk. A claim nobody can re-derive from what is retained is one revision away from unverifiable.
 *
 * ★ THE HONEST DECOMPOSITION (this is the design decision, made before choosing a mechanism):
 *   · `bytes === to - from`, `from`, `to`, `keptBytes`  ->  re-derivable from the RECORD ALONE.
 *   · "the kept value is what I hashed"                 ->  re-derivable from `keptHash` (recompute over the value
 *                                                           that is actually in the receipt).  ← tamper-evidence
 *   · "the original really was `to` bytes with this hash" -> NOT re-derivable; a hash is a claim about a string
 *                                                           nobody has any more.
 *   · ★ "the kept value is a PREFIX of the original"     -> NOT re-derivable from hashes AT ALL, not even with both
 *                                                           `keptHash` and `origHash`: hashing is one-way and says
 *                                                           nothing about one string being the other's prefix.
 * ⇒ So hashes give tamper-evidence and consistency, NOT prefix-ness. Prefix-ness needs the ORIGINAL, or a RETAINED
 *   RULE that rebuilds it - which is a property of the MATERIAL, not of this module, and therefore belongs in the
 *   test/fixture that produced it (see `tests/vmu-elision-prefix-recomputable.test.mjs`, which retains a
 *   deterministic rule and rebuilds the original to verify the prefix character-for-character).
 * ★ WHAT REMAINS (named, not papered over): for arbitrary real content there is no rule to retain, so prefix-ness
 *   stays a CLAIM there. These hashes bound the damage - they make silent alteration of the kept segment detectable -
 *   which is strictly more than before, and strictly less than proof.
 */
const HASH_ALGO = 'sha256'
const dig = (s) => createHash(HASH_ALGO).update(s).digest('hex')

/**
 * Serialize a tool result. If it exceeds `MAX_TOOL_RESULT_BYTES`, shorten the LONGEST string leaves IN PLACE (never
 * keys, never array lengths) and add `truncated:true` + a path-level `elided` list. The result is still the caller's
 * object shape: every existing field is readable, which is what the consumers (`st.packs` in `vmu-entry`) require.
 *
 * ★ THE EVIDENCE IS EXACT: for each entry `{path, from, to, bytes}`, `from` is the length that REMAINS, `to` the
 * original length, and `bytes === to - from`; `path` is a dotted/bracketed locator into the returned object, so the
 * claim can be re-checked against the original rather than believed.
 * ★ A result within the budget is returned byte-identically and carries NO `truncated` key - so "always reports
 * truncated" cannot pass the assertions either.
 */
/**
 * ★★ ROUND 36 (measured): THE SERIALIZER MUST NEVER THROW.
 *
 * A rich refusal carries a `cause` - `host-spawn.js` sets `err.cause = e` - and a cause chain can contain a
 * circular reference; a host error that refers back to its own context is enough. `JSON.stringify` then throws
 * "Converting circular structure to JSON", and because that throw happens INSIDE the tool adapter's own catch
 * block, nothing catches it and the whole server dies. So the one place documented as "the ONE place a tool result
 * is serialized" was the one place that could fail to serialize at all - and the header of this very file says a
 * receipt must never change SHAPE, which a non-return is the extreme form of.
 *
 * A circular edge is REPLACED BY A NAMED MARKER rather than dropped in silence, so the receipt still says what
 * happened - the same discipline this file applies to elided text.
 */
export const CIRCULAR_MARKER = "[circular]"
export function safeStringify(value) {
  const seen = new WeakSet()
  return JSON.stringify(value, function (key, v) {
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return CIRCULAR_MARKER
      seen.add(v)
    }
    return v
  })
}

export function boundedToolResult(value) {
  // ★ NAMED BOUNDARY: a sub-object cannot be attached to a bare value, so non-objects come back as-is (asserted in
  // the test rather than left as an assumption).
  if (value === null || typeof value !== 'object') return safeStringify(value)
  const before = safeStringify(value)
  // ROUND 33 / task-161 STEP 1: `receiptMeta` is present EVEN WHEN NOTHING WAS CUT. Returning early here (as the
  // previous version did) made the key set depend on the payload size - the very defect the contract removes - and it
  // is what let a 179,826-character real receipt travel with no marker at all.
  const emptyMeta = { truncated: false, elided: [], hostElision: 'possible', originalBytes: before.length, note: null }
  if (typeof before !== 'string') return before
  if (before.length <= MAX_TOOL_RESULT_BYTES) return safeStringify(Object.assign({}, value, { receiptMeta: emptyMeta }))
  // Collect string leaves longest-first, then shorten until the serialization fits (bounded work, deterministic).
  const leaves = []
  const seen = new WeakSet()
  const collect = (node, path) => {
    if (node === null || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) return node.forEach((v, i) => collect(v, path + '[' + i + ']'))
    for (const k of Object.keys(node)) {
      const v = node[k]
      const p = path ? path + '.' + k : k
      if (typeof v === 'string' && v.length > MAX_STRING_LEAF) leaves.push({ node, key: k, path: p, len: v.length })
      else collect(v, p)
    }
  }
  collect(value, '')
  leaves.sort((a, b) => b.len - a.len)
  const elided = []
  for (const leaf of leaves) {
    if (safeStringify(value).length <= MAX_TOOL_RESULT_BYTES) break
    const original = leaf.node[leaf.key]
    const keep = Math.max(MAX_STRING_LEAF, original.length - (safeStringify(value).length - MAX_TOOL_RESULT_BYTES) - ELISION_MARKER.length)
    const shortened = original.slice(0, keep) + ELISION_MARKER
    leaf.node[leaf.key] = shortened
    // ROUND 36 / task-171: the record carries BOTH hashes plus the two lengths, with the algorithm named, so a
    // reviewer can (a) recompute `keptHash` over the value actually present - proving the kept segment is the one
    // this record describes - and (b) compare `origHash`/`origBytes` against a re-derivable original when the
    // material's generation rule is retained. See the block comment above for what this does NOT prove.
    elided.push({
      path: leaf.path,
      from: keep,
      to: original.length,
      bytes: original.length - keep,
      keptBytes: shortened.length,
      keptHash: dig(shortened),
      origHash: dig(original),
      hash: HASH_ALGO,
    })
  }
  const after = safeStringify(value)
  // ★★ ROUND 33 / task-161 — THE REAL-MACHINE FINDING, AND WHY THE CONTRACT FIXES IT.
  // Measured on real hardware: a 179,826-character receipt came back with NO marker of any kind. Reproduced in-process
  // through the real seam: the status face has 4,470 string leaves whose LONGEST is 378 characters - every leaf is
  // under the per-leaf cap, so there is NOTHING to shorten, and the previous version returned the receipt RAW and
  // SILENT. The budget was never enforced and nobody could tell. This is not a threshold problem: on a receipt that
  // is large because it has many SMALL fields, a budget cannot be met without dropping content, which the ruling
  // forbids (the shape must not move).
  // So the fix is to stop being silent, not to cut harder: `receiptMeta` is ALWAYS present and says the truth in
  // both states. `originalBytes` is ALWAYS the serialized size (not `null`) precisely so that a reader can see
  // "146,146 bytes, truncated:false, elided:[]" and understand that this receipt is far over the budget, nothing
  // could be elided without changing its shape, and the host may cut it. `truncated:false` + `elided:[]` + a real
  // size is a complete, honest answer - silence was not.
  // ★ THE SHAPE IS CONSTANT: the same five keys exist whether or not we cut anything, so a consumer can read them
  // without a conditional (this is why the field lives in a sub-object instead of being added at the top level).
  const meta = {
    truncated: elided.length > 0,
    elided,
    hostElision: 'possible',
    originalBytes: before.length,
    note: elided.length > 0
      // ★★ ROUND 34 / task-165 — WORDING CORRECTED AGAINST MEASUREMENT (Lead's finding, real hardware). This used to
      // say the leaves were elided "to REACH MAX_TOOL_RESULT_BYTES", which claims the budget was MET. Measured with a
      // 14,000-character leaf, the receipt still came back at ~181.7 kB afterwards, because every REMAINING leaf is
      // under the per-leaf cap and cannot be shortened without dropping content (which would change the shape). So
      // `truncated:true` means "leaves were elided per this contract", NOT "we got under the budget" - and a note
      // that says otherwise is a declaration that disagrees with the implementation.
      ? 'the string leaves over ' + MAX_STRING_LEAF + ' were elided BY US TOWARD MAX_TOOL_RESULT_BYTES (' + MAX_TOOL_RESULT_BYTES + '): `elided` gives the exact path and half-open range of each. ONLY cap-able leaves can be shortened, so this does NOT claim the budget was reached - `originalBytes` is the size before, and every other field is unchanged. A host-inserted `[...]` marker may ALSO appear (hostElision) - that one is outside this receipt.'
      : (before.length > MAX_TOOL_RESULT_BYTES
        ? 'NOTHING was elided by us: this receipt is over MAX_TOOL_RESULT_BYTES (' + MAX_TOOL_RESULT_BYTES + ') but no string leaf exceeded ' + MAX_STRING_LEAF + ', and meeting the budget would require dropping content, which would change its shape. `originalBytes` is the real size. The HOST may insert its own `[...]` marker (hostElision) - that one is outside this receipt.'
        : null),
  }
  return safeStringify(Object.assign({}, value, { receiptMeta: meta }))
}
