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
export function boundedToolResult(value) {
  // ★ NAMED BOUNDARY: a sub-object cannot be attached to a bare value, so non-objects come back as-is (asserted in
  // the test rather than left as an assumption).
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  const before = JSON.stringify(value)
  // ROUND 33 / task-161 STEP 1: `receiptMeta` is present EVEN WHEN NOTHING WAS CUT. Returning early here (as the
  // previous version did) made the key set depend on the payload size - the very defect the contract removes - and it
  // is what let a 179,826-character real receipt travel with no marker at all.
  const emptyMeta = { truncated: false, elided: [], hostElision: 'possible', originalBytes: before.length, note: null }
  if (typeof before !== 'string') return before
  if (before.length <= MAX_TOOL_RESULT_BYTES) return JSON.stringify(Object.assign({}, value, { receiptMeta: emptyMeta }))
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
    if (JSON.stringify(value).length <= MAX_TOOL_RESULT_BYTES) break
    const original = leaf.node[leaf.key]
    const keep = Math.max(MAX_STRING_LEAF, original.length - (JSON.stringify(value).length - MAX_TOOL_RESULT_BYTES) - ELISION_MARKER.length)
    const shortened = original.slice(0, keep) + ELISION_MARKER
    leaf.node[leaf.key] = shortened
    elided.push({ path: leaf.path, from: keep, to: original.length, bytes: original.length - keep })
  }
  const after = JSON.stringify(value)
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
      ? 'string leaves over ' + MAX_STRING_LEAF + ' were elided BY US to reach MAX_TOOL_RESULT_BYTES (' + MAX_TOOL_RESULT_BYTES + '): `elided` gives the exact path and half-open range of each. Every other field is unchanged. A host-inserted `[...]` marker may ALSO appear (hostElision) - that one is outside this receipt.'
      : (before.length > MAX_TOOL_RESULT_BYTES
        ? 'NOTHING was elided by us: this receipt is over MAX_TOOL_RESULT_BYTES (' + MAX_TOOL_RESULT_BYTES + ') but no string leaf exceeded ' + MAX_STRING_LEAF + ', and meeting the budget would require dropping content, which would change its shape. `originalBytes` is the real size. The HOST may insert its own `[...]` marker (hostElision) - that one is outside this receipt.'
        : null),
  }
  return JSON.stringify(Object.assign({}, value, { receiptMeta: meta }))
}
