// vibe-math-vmu/packs/_kit/tools.js — PHASE 8 / B-1: the SHARED KIT skeleton (no tools moved yet; B-2 moves record_*).
//
// A kit entry is a DECLARATION of a tool that composes ALREADY-PUBLISHED kernel faces. The three anti-degeneration
// gates live in tests/audit-kit-boundaries.test.mjs:
//   1. no spawn / no filesystem / no private state in this folder (grep, calls only — comments may mention words);
//   2. every kit tool can be DISABLED by a pack (`selectKitTools({enabled})`), and the enabled list is the only switch;
//   3. a kit tool may only use error codes already registered in docs/03 — the code table belongs to the kernel.
//
// B-1 deliberately exports an EMPTY array: it is the skeleton plus the gates, not a tool migration. B-2 fills it and
// requires each moved pack tool to keep v5r behaviour byte-identical.

/** The kit's tool declarations. Each entry: { name, purpose, disableKey, run? } — run is supplied by the pack that enables it. */
export const KIT_TOOLS = Object.freeze([])

/**
 * Select the kit tools a pack enabled. A pack must name them; there is no "all by default" (that would be a mechanism
 * nobody declared). Unknown names are ignored by the kit and reported by the caller's own pack validation.
 */
export function selectKitTools({ enabled = [] } = {}) {
  const wanted = new Set(Array.isArray(enabled) ? enabled.filter((x) => typeof x === 'string') : [])
  return KIT_TOOLS.filter((t) => wanted.has(t.name))
}
