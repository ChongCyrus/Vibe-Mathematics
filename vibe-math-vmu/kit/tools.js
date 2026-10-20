// vibe-math-vmu/kit/tools.js — PHASE 8 / B-2 step 1: the SHARED KIT's four tools.
//
// A kit entry is a DECLARATION of a tool that composes ALREADY-PUBLISHED kernel faces. The three anti-degeneration
// gates live in tests/audit-kit-boundaries.test.mjs:
//   1. no spawn / no filesystem / no private state in this folder (grep, calls only — comments may mention words);
//   2. every kit tool can be DISABLED by a pack (`selectKitTools({enabled})`), and the enabled list is the only switch;
//   3. a kit tool may only use error codes already registered in docs/03 — the code table belongs to the kernel.
//
// STEP 1 of B-2 fills the kit and keeps the pack untouched: the v5r wiring (deleting its own copies and importing these)
// is step 2, so this file must be usable on its own. The three CARD tools share one handler and one config table here —
// the config is the single source of both the kit entry and (later) the pack spec.

import { KIT_CARD_TOOL, KIT_SOCIAL, KIT_READ_LIBRARY, KIT_RECORD_PROGRESS } from './handlers.js'
import { KIT_LEAN, KIT_TASKS } from './extras.js'

/**
 * The three card tools differ ONLY in their declared config (track/kind/required fields/title). One table, read by
 * `kitCardHandler(name)`; the pack will later read the same table instead of carrying a second copy.
 */
export const KIT_CARD_CONFIG = Object.freeze({
  vibe_v5_record_proposition: Object.freeze({ tool: 'vibe_v5_record_proposition', track: 'propositions', kind: 'proposition', required: ['statement', 'value', 'motive', 'p'], extra: ['title', 'id'], title: 'proposition' }),
  vibe_v5_record_method: Object.freeze({ tool: 'vibe_v5_record_method', track: 'methods', kind: 'method', required: ['content', 'value', 'motive', 'p'], extra: ['title', 'type', 'notation'], title: 'method' }),
  vibe_v5_record_subproblem: Object.freeze({ tool: 'vibe_v5_record_subproblem', track: 'problems', kind: 'subproblem', required: ['statement', 'value', 'motive', 'p'], extra: ['title', 'id'], title: 'subproblem' }),
})

/** The one handler factory for the card family (an unknown name is the caller's bug, not a silent no-op). */
export function kitCardHandler(name) {
  const cfg = KIT_CARD_CONFIG[name]
  if (!cfg) throw new Error('no kit card config named ' + String(name))
  return KIT_CARD_TOOL(cfg)
}

/**
 * The kit's tool declarations. Every entry carries a `disableKey`: the FAMILY a pack switches off
 * (`v5r.records` / `v5r.social` / `v5r.library`). Nothing is enabled by default — a pack must name what it wants, which
 * is the framework's zero mechanism applied to the kit itself.
 */
export const KIT_TOOLS = Object.freeze([
  { name: 'vibe_v5_record_progress', purpose: 'append to the member research log (track/kind declared by the institute)', disableKey: 'v5r.records', run: KIT_RECORD_PROGRESS },
  { name: 'vibe_v5_say', purpose: 'speak in the group chat / private message / meeting speech (three routes)', disableKey: 'v5r.social', run: KIT_SOCIAL.say },
  { name: 'vibe_v5_message', purpose: 'relay an office/human message into the institute', disableKey: 'v5r.social', run: KIT_SOCIAL.message },
  { name: 'vibe_v5_read_library', purpose: 'read any member library (READ-ONLY)', disableKey: 'v5r.library', run: KIT_READ_LIBRARY },
  // B-3: the task board (4) and the Lean five (5) — handlers live in extras.js (extracted verbatim from the pack).
  { name: 'vibe_v5_task_create', purpose: 'create a task on the shared board (priority is stored)', disableKey: 'v5r.tasks', run: KIT_TASKS.create },
  { name: 'vibe_v5_task_list', purpose: 'list the task board (filter by status/owner/ready)', disableKey: 'v5r.tasks', run: KIT_TASKS.list },
  { name: 'vibe_v5_task_update', purpose: 'update a task by revision (claim/reassign/complete/reopen/deps)', disableKey: 'v5r.tasks', run: KIT_TASKS.update },
  { name: 'vibe_v5_task_get', purpose: 'read one task (plus its brief when present)', disableKey: 'v5r.tasks', run: KIT_TASKS.get },
  { name: 'vibe_v5_lean_run', purpose: 'submit an existing .lean file to the kernel Lean face', disableKey: 'v5r.lean', run: KIT_LEAN.run },
  { name: 'vibe_v5_lean_job', purpose: 'read one Lean job or list the queue', disableKey: 'v5r.lean', run: KIT_LEAN.job },
  { name: 'vibe_v5_lean_lib', purpose: 'read the Lean archive library', disableKey: 'v5r.lean', run: KIT_LEAN.lib },
  { name: 'vibe_v5_lean_read', purpose: 'read one archived Lean card by name', disableKey: 'v5r.lean', run: KIT_LEAN.read },
  { name: 'vibe_v5_lean_archive', purpose: 'register an existing .lean file in the archive (kind mapping)', disableKey: 'v5r.lean', run: KIT_LEAN.archive },
])

/**
 * Select the kit tools a pack enabled. A pack must name them; there is no "all by default" (that would be a mechanism
 * nobody declared). Unknown names are ignored by the kit and reported by the caller's own pack validation.
 */
export function selectKitTools({ enabled = [] } = {}) {
  const wanted = new Set(Array.isArray(enabled) ? enabled.filter((x) => typeof x === 'string') : [])
  return KIT_TOOLS.filter((t) => wanted.has(t.name))
}
