// vmu pack — `v3-core`: v3's institution as an INSTITUTIONAL PACK (docs/10 §5, the V5 deliverable's second half).
//
// v3 is a DIFFERENT institution from v5r (see _oneoff/vmu/design/01-v5r-reuse-map.md and the v3 preset):
//   · planner / solver / verifier instead of chair / member / temp;
//   · a scheduler with `maxParallelThreshold` and a planning horizon instead of an academic assembly;
//   · verdicts aggregated from N independent verifiers (`verifierCount`) with a debate round cap;
//   · `mode: manual | auto` - a HUMAN gate before work is dispatched.
//
// WHAT THIS PACK DOES, and why it carries CODE rather than M1 rules:
//   v3's defining rules are QUANTITATIVE and STATEFUL ("at least N verifiers must have voted", "in manual mode
//   nothing runs until a human says go"). The M1 predicate DSL cannot count votes, and inventing a decorative
//   rule just to have one would be exactly the kind of lie this repository refuses. So the pack carries two M2
//   modules instead - which is itself the point: A PACK IS JS, so it can carry behaviour, not only data.
//
// HONEST BOUNDARIES ✗ (docs/10 §5.3): this is NOT v3 and NOT a behavioural-equivalence proof. It is v3's
// INSTITUTION expressible on this framework: its slots, its mechanism defaults, its record tracks, and two of
// its rules. The behavioural A/B (P3) is separate work.

/** The stance codes live in the pack's own namespace (R-d); digits are fine (`vmu` precedent: VMU_PACK_V5R_*). */
export const PACK = Object.freeze({
  id: 'v3-core',
  version: '1.0.0',
  packContractVersion: 1,
  description: 'v3 的机构语义包：planner/solver/verifier 三槽位、法定 verifier 数、manual 门、v3 的机制默认',

  // NOTE (the v5r-core lesson): a pack must NOT require a service it is itself the first to introduce -
  // `vmu.members` appears only after somebody declares slots. `v3-core` BRINGS the roster, so it requires only
  // what other PACKS/the profile must already provide.
  requires: [
    { service: 'vmu.tasks', minVersion: 1 },
    { service: 'vmu.middleware', minVersion: 1 },
  ],

  codes: [
    'VMU_PACK_V3_CORE_VERIFIER_QUORUM',
    'VMU_PACK_V3_CORE_MANUAL_GATE',
  ],

  // Mechanisms only (docs/04 §11 ownership rule). The declared keys are ones the framework ALREADY enforces
  // (so they really do something); the `vmu.v3.*` keys are pack-owned and are read by the modules below.
  settings: {
    'vmu.limits.maxLiveMembers': 4,        // <- v3 `maxParallelThreshold: 4` (a real concurrency gate)
    'vmu.meetings.verdictMaxRounds': 5,    // <- v3 `debateMaxRounds: 5` (the analogue, not an identity)
    'vmu.meetings.quorumRule': 'majority', // <- v3 collects independent verdicts and aggregates them
    'vmu.records.tracks': ['propos', 'problems', 'directions', 'journal', 'verified'],
    // PACK-OWNED keys (read by the modules in this file; `setting()` sees them like any other):
    'vmu.v3.verifierCount': 3,             // v3 `verifierCount: 3` - who must report before a verdict counts
    'vmu.v3.solverMaxRounds': 3,           // v3 `solverMaxRounds: 3`
    'vmu.v3.planningHorizon': 3,           // v3 `planningHorizon: 3`
    'vmu.v3.promoteValueThreshold': 0.7,   // v3 `promoteValueThreshold: 0.7`
    'vmu.v3.mode': 'auto',                 // v3 `mode: auto | manual`
  },

  // v3's roster, as OPAQUE SLOTS (D5: the kernel never learns what a "solver" is).
  slots: [
    { id: 'planner', label: '规划', capacity: 1, permissions: ['plan', 'dispatch', 'gate'] },
    { id: 'solver', label: '求解', capacity: 8, permissions: ['solve', 'propose', 'record'] },
    { id: 'verifier', label: '验证', capacity: 3, permissions: ['verify', 'vote', 'refute'] },
  ],

  // v3's durable tracks (docs/07 §4.2): negative knowledge gets its own file, never a footnote.
  tracks: ['propos', 'problems', 'directions', 'journal', 'verified'],

  // No M1 rule on purpose (see the header): v3's rules need counting and state, so they are code. The M1-in-a-
  // pack path is demonstrated by `packs/v5r-core.js`.
  rules: [],

  // ── M2 modules carried by the pack ──────────────────────────────────────────────────────────────────
  middleware: [
    {
      // v3's `verifierCount`: a verdict only counts once the required number of INDEPENDENT verifiers reported.
      // The bus hands a non-rules entry `{ hook, payload, ctx, dryRun, traceId, setting }` (kernel/bus.js).
      id: 'v3-core-verifier-quorum',
      kind: 'module',
      order: 150,
      on: ['ballot/tally'],
      failure: 'closed',
      capabilities: ['read-args', 'deny'],
      handler: async ({ payload, setting }) => {
        const need = Number((setting && setting('vmu.v3.verifierCount')) || 0) || 3
        const votes = (payload && payload.votes) || {}
        const cast = Object.keys(votes).length
        if (cast >= need) return undefined
        return {
          deny: {
            code: 'VMU_PACK_V3_CORE_VERIFIER_QUORUM',
            message: 'v3-core：裁定需要 ' + need + ' 名独立验证者表态，目前只有 ' + cast + ' 票',
            hint: '继续唤醒 verifier 席位（vmu.v3.verifierCount 可调），或把该对象记为未定论',
          },
        }
      },
    },
    {
      // v3's `mode: manual` - the human gate. The module reads the pack setting, and ALSO accepts the mode from
      // the event payload so a caller (or a test) can exercise both branches without mutating pack settings.
      id: 'v3-core-manual-gate',
      kind: 'module',
      order: 160,
      on: ['tools/pre-execute'],
      failure: 'closed',
      capabilities: ['read-args', 'deny'],
      handler: async ({ payload, setting }) => {
        const tool = payload && payload.tool
        if (tool !== 'vibe_vmu_script') return undefined
        const mode = String((payload && payload.v3Mode) || (setting && setting('vmu.v3.mode')) || 'auto')
        if (mode !== 'manual') return undefined
        return {
          deny: {
            code: 'VMU_PACK_V3_CORE_MANUAL_GATE',
            message: 'v3-core：mode=manual ⇒ 未经人工放行不得派发/运行工作',
            hint: '用 vibe_vmu_set 把 vmu.v3.mode 切回 auto，或显式放行后再调用',
          },
        }
      },
    },
  ],

  // v3's own tool names, bridged to PUBLISHED SERVICES (an alias target must be a service, not a tool).
  aliases: [
    { from: 'vibe_math_set_params', to: 'vmu.middleware' },
    { from: 'vibe_math_set_mode', to: 'vmu.middleware' },
    { from: 'vibe_math_status', to: 'vmu.tasks' },
  ],
})

export default PACK
