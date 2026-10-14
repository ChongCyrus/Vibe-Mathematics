// vmu durable values — VALUE IDENTITY PRIMITIVES, split out of `kernel/resume.js` (round 9, task-70).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────────────────────
// `kernel/resume.js` crossed the 1200-line limit set by docs/02. The first cut moved the EXIT CONTRACT
// (`kernel/resumeflush.js`); this second, smaller cut moves the four primitives that answer one question —
// "are these two durable values the SAME value, and what number does this id end with?" — and that are pure by
// construction: no store, no clock, no face, no refusal codes (that is why they can live outside the engine and
// are unit-testable on their own).
//
// ── THE BOUNDARY ────────────────────────────────────────────────────────────────────────────────────────────────
//   · `kernel/resume.js` OWNS the engine: projections, the read-before-write latch, recovery, the durable writer.
//   · THIS MODULE OWNS identity/equality of the VALUES those things persist:
//       `stableStringify` — deterministic JSON (key order must never decide whether two snapshots compare equal);
//       `contentDigest`   — a cheap FNV-1a + length identity (it only has to detect DRIFT, not resist forgery);
//       `clone`           — the deep JSON-safe copy (a projection must never keep a live reference into a face);
//       `idSuffix`        — the last `N` of an id (`t-12` ⇒ 12), used to reconcile a durable counter with reality.
//   ⇒ A change to WHAT is persisted belongs in resume.js; a change to HOW two persisted values are compared
//     belongs here. `resume.js` re-exports `contentDigest`/`idSuffix`, so no caller's import path changes.

/** Public-interface version of this module's surface (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** Deterministic JSON: key order must never decide whether two snapshots compare equal. */
export function stableStringify(value) {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'
}

/** A cheap, dependency-free content identity (FNV-1a + length). It only has to detect DRIFT, not resist forgery. */
export function contentDigest(value) {
  const s = stableStringify(value)
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h.toString(16).padStart(8, '0') + ':' + s.length
}

/** Deep, JSON-safe copy: a projection must never keep a live reference into the face it snapshotted. */
export function clone(value) {
  if (value === undefined) return undefined
  try { return JSON.parse(JSON.stringify(value)) } catch (e) { return undefined }
}

/** The last `N` suffix of an id (`t-12` ⇒ 12), or null. Used to reconcile a durable counter with reality. */
export function idSuffix(id) {
  const m = /(\d+)\s*$/.exec(String(id === undefined || id === null ? '' : id))
  return m ? Number(m[1]) : null
}

export default contentDigest
