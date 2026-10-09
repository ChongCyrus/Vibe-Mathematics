// vibe-math-vmu — the vmu (vibe-math-unify) agent preset entry point.
//
// DESIGN (see vibe-math-vmu/docs/):
//   Runtime mechanism = this framework + settings + middleware (+ agent self-organisation).
//   The framework provides CAPABILITIES and HOOKS only; every policy lives in settings,
//   middleware (declarative rules / code modules / scripts and workflows / external
//   plugins) or a pack. See 01-philosophy.md R1 (kernel holds no policy) and
//   02-architecture.md for the kernel partitions A-I.
//
// P0 SKELETON — ZERO MECHANISM, ON PURPOSE:
//   This entry point deliberately registers nothing yet. It exists so the preset can be
//   wired (preset row, exports, installer, tests, README) and load in a real host before
//   any capability is added. The first real increments, in documented order, are:
//     1. settings/schema.js  — the single source of truth for every tunable (04-§3),
//        with the JSON Schema projection used by docs, gates and domain checks;
//     2. kernel/store.js     — the Store port with the JSON-fold default (07-§1);
//     3. kernel/bus.js       — the vmu hook bus wrapping the host waterfalls (05-§4);
//     4. kernel/prompt/*.js  — the prompt pipeline (06);
//     5. the capability surfaces A-I (02-§2), each with a scenario and a mutant family.
//   Nothing here may encode a generation-specific decision (R1): v5r behaviour is
//   reproduced by the v5r pack, never by this file.

export const name = 'vibe-math-vmu'

/** Public-interface version of this preset's exposed surfaces (03-§7, D13-O3). */
export const apiVersion = 1

/**
 * Host services this plugin consumes. Empty at P0: the skeleton registers nothing, so it
 * needs nothing. It grows deliberately, one capability at a time, and the growth must be
 * reflected in 03-§2 (the public-surface registry) in the same change.
 */
export const inject = []

/**
 * Plugin entry point.
 *
 * @param {object} ctx     Cordis context for this plugin row.
 * @param {object} config  The row's `config` (validated against `Config` once declared).
 */
export function apply(ctx, config) {
  // P0: intentionally empty. No tools, no services, no event listeners, no state.
  // The preset must load cleanly and stay inert until a capability or a pack is added.
  return undefined
}
