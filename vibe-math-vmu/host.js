// vmu host adapter — attaching the assembled kernel to the DSH tool surface (docs/03 §3, docs/11 §9).
import { makeTransactionSpec } from './tools/transaction.js'
import { makeTurnSpec } from './tools/turn.js'
import { makeControlSpec } from './tools/control.js'
import { makeMeetingSpec } from './tools/meeting.js'
import { makeTaskSpec } from './tools/task.js'
import { makeMinutesSpec } from './tools/minutes.js'
import { makeBoardSpec } from './tools/board.js'
import { makeBudgetSpec } from './tools/budget.js'
import { makeCitationsSpec } from './tools/citations.js'
import { makeDisciplineSpec } from './tools/discipline.js'
import { makeGovernanceSpec } from './tools/governance.js'
import { makeRatelimitSpec } from './tools/ratelimit.js'
import { makeExplainSpec } from './tools/explain.js'
import { makeProjmigrateSpec } from './tools/projmigrate.js'
import { makeBridgeSpec } from './tools/bridge.js'
import { makeExternalSpec } from './tools/external.js'
import { makeMathtoolsSpec } from './tools/mathtools.js'
import { makeAuditchainSpec } from './tools/auditchain.js'
import { makeNotifySpec } from './tools/notify.js'
import { makeCustodySpec } from './tools/custody.js'
import { makeTopologySpec } from './tools/topology.js'
import { makeFormalSpec } from './tools/formal.js'
import { makeCollabSpec } from './tools/collab.js'
import { makeReviewersSpec } from './tools/reviewers.js'
import { makeClockguardSpec } from './tools/clockguard.js'
import { makePublicationSpec } from './tools/publication.js'
import { makeFairnessSpec } from './tools/fairness.js'
import { makeHandoverSpec } from './tools/handover.js'
import { makeConferenceSpec } from './tools/conference.js'
import { makeArbitrationSpec } from './tools/arbitration.js'
import { makeCharterSpec } from './tools/charter.js'
import { makeRecruitSpec } from './tools/recruit.js'
import { makeCapacitySpec } from './tools/capacity.js'
import { makeRetentionSpec } from './tools/retention.js'
import { makeIdempotencySpec } from './tools/idempotency.js'
import { makeAuditSpec } from './tools/audit.js'
import { makeIpSpec } from './tools/ip.js'
import { makeBiddingSpec } from './tools/bidding.js'
import { makeAdmissionSpec } from './tools/admission.js'
// ROUND 2 (task-14): the four new faces' tool specs.
import { makeHumanSpec } from './tools/human.js'
import { makeChatSpec } from './tools/chat.js'
import { makeMailboxSpec } from './tools/mailbox.js'
import { makePanelSpec } from './tools/panel.js'
import { makeReportSpec } from './tools/report.js'
// ROUND 3 / task-24: the activity waiter's tool spec (vmu-activity's file).
import { makeActivitySpec } from './tools/activity.js'
// ROUND 3 / task-20: the C-45 fidelity face's tool spec (this file is mine; reader-b's sheet asked for it).
import { makeFidelitySpec } from './tools/fidelity.js'
import { makeMathadaptersSpec } from './tools/mathadapters.js'
import { makeMathjobsSpec } from './tools/mathjobs.js'
//
// TOOL SHAPE (learned from the REAL HOST, not from our own assumptions): the first scripted live run
// (SLV) showed the preset active but NO vmu tools in the agent's tool list. The cause was this file: the
// host's registration shape is the one this repository's own working preset uses
// (`vibe-math-v5r.js:10934-10938`):
//
//     ctx.effect(() => tools.register({
//       name, description, parameters,
//       output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
//       execute: async (args, exec) => JSON.stringify(result),      // ← execute, and it returns a STRING
//     }))
//
// Three details matter, and all three differ from the first version of this file:
//   · the executor is `execute(args, exec)`, NOT `handler`;
//   · the executor returns a STRING (JSON), and `output.schema` says so;
//   · `output.render` returns a CONTENT-PART ARRAY, not a string.
// A tool registered with the wrong key is accepted silently and simply never appears, which is exactly
// why a library-level test with a self-invented shape cannot catch it (the host can).
//
// The first promise still holds: INERT BY DEFAULT.
//   · `vmu.core.enabled === false`   ⇒ NOTHING registered (inert means invisible);
//   · enabled with nothing declared  ⇒ exactly ONE tool, `vibe_vmu_status`, because being able to SEE that
//     the kernel is inert is the point of the default;
//   · a tool appears only when the thing it exposes exists (no records tool without a durable root);
//   · refusals are returned as NAMED structured JSON, never swallowed.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

export const TOOL_NAMES = Object.freeze({
  status: 'vibe_vmu_status',
  set: 'vibe_vmu_set',
  middleware: 'vibe_vmu_middleware',
  records: 'vibe_vmu_records',
  script: 'vibe_vmu_script',
  pack: 'vibe_vmu_pack',
  control: 'vibe_vmu_control',
  meeting: 'vibe_vmu_meeting',
  task: 'vibe_vmu_task',
  minutes: 'vibe_vmu_minutes',
  board: 'vibe_vmu_board',
  budget: 'vibe_vmu_budget',
  citations: 'vibe_vmu_citations',
  discipline: 'vibe_vmu_discipline',
  governance: 'vibe_vmu_governance',
  ratelimit: 'vibe_vmu_ratelimit',
  explain: 'vibe_vmu_explain',
  projmigrate: 'vibe_vmu_projmigrate',
  bridge: 'vibe_vmu_bridge',
  external: 'vibe_vmu_external',
  mathtools: 'vibe_vmu_mathtools',
  auditchain: 'vibe_vmu_auditchain',
  notify: 'vibe_vmu_notify',
  transaction: 'vibe_vmu_transaction',
  custody: 'vibe_vmu_custody',
  topology: 'vibe_vmu_topology',
  formal: 'vibe_vmu_formal',
  collab: 'vibe_vmu_collab',
  reviewers: 'vibe_vmu_reviewers',
  clockguard: 'vibe_vmu_clockguard',
  publication: 'vibe_vmu_publication',
  fairness: 'vibe_vmu_fairness',
  handover: 'vibe_vmu_handover',
  conference: 'vibe_vmu_conference',
  arbitration: 'vibe_vmu_arbitration',
  charter: 'vibe_vmu_charter',
  recruit: 'vibe_vmu_recruit',
  capacity: 'vibe_vmu_capacity',
  retention: 'vibe_vmu_retention',
  idempotency: 'vibe_vmu_idempotency',
  audit: 'vibe_vmu_audit',
  ip: 'vibe_vmu_ip',
  bidding: 'vibe_vmu_bidding',
  admission: 'vibe_vmu_admission',
  // ROUND 349: the turn loop needs a real entry point. Without it the framework could run a round only from a test,
  // which is not the same as a host being able to run one - and the objective is the latter.
  turn: 'vibe_vmu_turn',
  // ROUND 2 (task-14): the four new implementation faces' tools (human/chat/mailbox/panel/report).
  human: 'vibe_vmu_human',
  chat: 'vibe_vmu_chat',
  mailbox: 'vibe_vmu_mailbox',
  panel: 'vibe_vmu_panel',
  report: 'vibe_vmu_report',
  // ROUND 3 / task-24: the activity waiter's own thin face (`vibe_vmu_wait`).
  activity: 'vibe_vmu_wait',
  // ROUND 3 / task-20: the C-45 fidelity face (declared by `vmu.math.formalVerify` being on - see its TOOL_FACES row).
  fidelity: 'vibe_vmu_fidelity',
  // ROUND 2 (task-14, Lead 裁决 B): one tool per service - the math adapters and the math jobs each get their OWN
  // thin face, because `vibe_vmu_mathtools`'s action enum must stay exactly `kernel.mathtools`'s method set.
  mathadapters: 'vibe_vmu_mathadapters',
  mathjobs: 'vibe_vmu_mathjobs',
})

/**
 * ROUND 1 / K1 (D-01) — THE ONE declared-intent → tool-face MAP.
 *
 * WHY THIS EXISTS. Forty-five faces were published while thirty-five of them could never be registered on a real
 * host: `vibe-math-vmu.js` handed `createHostAdapter` four hard-coded booleans, this file forwarded those four, and
 * every other gate below defaulted to `false`. The faces existed, were documented in docs/03 §3.1 and had their own
 * `tests/vmu-*-tool.test.mjs` - and were dead on the wire.
 *
 * The fix is DATA, not more booleans: one row per face, each row naming WHERE that face's intent may come from
 * (docs/03 §3.1 ∩ the `vmu.<family>.*` settings families ∩ the preset row's `config` keys). `resolveFaces()` reads the
 * three sources; `toolSpecs()` asks it; `status().faces` reports the outcome, INCLUDING the faces that were declared
 * but unavailable and the faces disabled by name - so nothing silently vanishes.
 *
 * ZERO MECHANISM IS UNCHANGED: with no config and no settings only `status` resolves, hence exactly ONE tool (R1).
 *
 * Row fields: `face` (key; also the legacy `<face>Tool` flag), `name` (published tool name), `families` (declared
 * `vmu.<family>.` prefixes that count as an intent), `config` (preset-row config keys that count as an intent),
 * `always` (only `status`), `extraIntent(ctx)` / `surface(ctx)` for the faces whose declaration or precondition is not
 * a plain family, and `make(ctx)` for the domain faces.
 */
export const TOOL_FACES = Object.freeze([
  { face: 'status', name: TOOL_NAMES.status, always: true, families: [], config: [] },
  { face: 'set', name: TOOL_NAMES.set, families: [], config: [],
    extraIntent: (c) => (c.declaredKeys > 0 ? 'declared-keys' : null) },
  { face: 'middleware', name: TOOL_NAMES.middleware, families: ['vmu.middleware.'], config: ['middleware'],
    // D-01 + the bus: an entry that is ALREADY ON THE BUS is a declaration too (a pack or an M2 module can add one
    // after the kernel is built, and the management face must follow reality, not only the config key).
    extraIntent: (c) => {
      const entries = c.kernel && c.kernel.bus && typeof c.kernel.bus.status === 'function' ? (c.kernel.bus.status().entries || []) : []
      return entries.length > 0 ? 'surface:bus-entries' : null
    } },
  { face: 'records', name: TOOL_NAMES.records, families: ['vmu.records.'], config: ['records'],
    extraIntent: (c) => (c.kernel && c.kernel.library ? 'surface:library' : null),
    surface: (c) => (!c.kernel || !c.kernel.library ? 'this kernel has no durable root, so it has no library to list or expand (docs/03 §3.1)' : null) },
  { face: 'script', name: TOOL_NAMES.script, families: [], config: ['scripts'],
    extraIntent: (c) => (c.scripts.length > 0 ? 'config:scripts' : null),
    surface: (c) => (c.scripts.length > 0 ? null : 'no scripts were declared in this profile row') },
  { face: 'pack', name: TOOL_NAMES.pack, families: ['vmu.packs.'], config: ['packs'],
    extraIntent: (c) => (c.packLoader ? 'surface:packLoader' : null),
    surface: (c) => (c.packLoader ? null : 'the entry did not hand this adapter a pack loader') },
  { face: 'control', name: TOOL_NAMES.control, families: ['vmu.limits.', 'vmu.control.'], config: ['control'], make: makeControlSpec },
  { face: 'turn', name: TOOL_NAMES.turn, families: ['vmu.turn.'], config: ['turn'], make: makeTurnSpec },
  { face: 'meeting', name: TOOL_NAMES.meeting, families: ['vmu.meetings.', 'vmu.ballot.'], config: ['meetings', 'ballot'], make: makeMeetingSpec },
  { face: 'task', name: TOOL_NAMES.task, families: ['vmu.tasks.'], config: ['tasks'], make: makeTaskSpec },
  { face: 'minutes', name: TOOL_NAMES.minutes, families: ['vmu.minutes.'], config: ['minutes'], make: makeMinutesSpec },
  { face: 'board', name: TOOL_NAMES.board, families: ['vmu.board.'], config: ['board'], make: makeBoardSpec },
  { face: 'budget', name: TOOL_NAMES.budget, families: ['vmu.budget.'], config: ['budget'], make: makeBudgetSpec },
  { face: 'citations', name: TOOL_NAMES.citations, families: ['vmu.citations.', 'vmu.cite.'], config: ['citations'], make: makeCitationsSpec },
  { face: 'discipline', name: TOOL_NAMES.discipline, families: ['vmu.discipline.'], config: ['discipline'], make: makeDisciplineSpec },
  { face: 'governance', name: TOOL_NAMES.governance, families: ['vmu.agenda.', 'vmu.motions.'], config: ['governance'], make: makeGovernanceSpec },
  { face: 'ratelimit', name: TOOL_NAMES.ratelimit, families: ['vmu.ratelimit.'], config: ['ratelimit'], make: makeRatelimitSpec },
  { face: 'explain', name: TOOL_NAMES.explain, families: ['vmu.explain.'], config: ['explain'], make: makeExplainSpec },
  { face: 'projmigrate', name: TOOL_NAMES.projmigrate, families: ['vmu.state.', 'vmu.projmigrate.'], config: ['projmigrate'], make: makeProjmigrateSpec },
  { face: 'bridge', name: TOOL_NAMES.bridge, families: ['vmu.script.', 'vmu.bridge.'], config: ['bridge'], make: makeBridgeSpec },
  { face: 'external', name: TOOL_NAMES.external, families: ['vmu.external.'], config: ['external'], make: makeExternalSpec },
  { face: 'mathtools', name: TOOL_NAMES.mathtools, families: ['vmu.math.'], config: ['mathtools'], make: makeMathtoolsSpec },
  { face: 'auditchain', name: TOOL_NAMES.auditchain, families: ['vmu.audit.chain.', 'vmu.audit.chain'], config: ['auditchain'], make: makeAuditchainSpec },
  { face: 'notify', name: TOOL_NAMES.notify, families: ['vmu.notify.'], config: ['notify'], make: makeNotifySpec },
  { face: 'transaction', name: TOOL_NAMES.transaction, families: ['vmu.transaction.'], config: ['transaction'], make: makeTransactionSpec },
  { face: 'custody', name: TOOL_NAMES.custody, families: ['vmu.custody.', 'vmu.anonymity.'], config: ['custody'], make: makeCustodySpec },
  { face: 'topology', name: TOOL_NAMES.topology, families: ['vmu.topology.'], config: ['topology'], make: makeTopologySpec },
  { face: 'formal', name: TOOL_NAMES.formal, families: ['vmu.formal.'], config: ['formal'], make: makeFormalSpec },
  { face: 'collab', name: TOOL_NAMES.collab, families: ['vmu.collab.', 'vmu.agreements.'], config: ['collab'], make: makeCollabSpec },
  { face: 'reviewers', name: TOOL_NAMES.reviewers, families: ['vmu.review.', 'vmu.reviewers.'], config: ['reviewers'], make: makeReviewersSpec },
  { face: 'clockguard', name: TOOL_NAMES.clockguard, families: ['vmu.clock.'], config: ['clockguard'], make: makeClockguardSpec },
  { face: 'publication', name: TOOL_NAMES.publication, families: ['vmu.publication.', 'vmu.outreach.', 'vmu.dissemination.'], config: ['publication'], make: makePublicationSpec },
  { face: 'fairness', name: TOOL_NAMES.fairness, families: ['vmu.fairness.'], config: ['fairness'], make: makeFairnessSpec },
  { face: 'handover', name: TOOL_NAMES.handover, families: ['vmu.handover.'], config: ['handover'], make: makeHandoverSpec },
  { face: 'conference', name: TOOL_NAMES.conference, families: ['vmu.conference.'], config: ['conference'], make: makeConferenceSpec },
  { face: 'arbitration', name: TOOL_NAMES.arbitration, families: ['vmu.arbitration.', 'vmu.conflict.'], config: ['arbitration'], make: makeArbitrationSpec },
  { face: 'charter', name: TOOL_NAMES.charter, families: ['vmu.charter.'], config: ['charter'], make: makeCharterSpec },
  { face: 'recruit', name: TOOL_NAMES.recruit, families: ['vmu.admission.', 'vmu.recruit.'], config: ['recruit'], make: makeRecruitSpec },
  { face: 'capacity', name: TOOL_NAMES.capacity, families: ['vmu.capacity.'], config: ['capacity'], make: makeCapacitySpec },
  { face: 'retention', name: TOOL_NAMES.retention, families: ['vmu.records.retention.', 'vmu.quota.', 'vmu.prune.'], config: ['retention'], make: makeRetentionSpec },
  { face: 'idempotency', name: TOOL_NAMES.idempotency, families: ['vmu.idempotency.'], config: ['idempotency'], make: makeIdempotencySpec },
  { face: 'audit', name: TOOL_NAMES.audit, families: ['vmu.audit.'], config: ['audit'], make: makeAuditSpec },
  { face: 'ip', name: TOOL_NAMES.ip, families: ['vmu.ip.'], config: ['ip'], make: makeIpSpec },
  { face: 'bidding', name: TOOL_NAMES.bidding, families: ['vmu.auction.', 'vmu.bidding.'], config: ['bidding'], make: makeBiddingSpec },
  { face: 'admission', name: TOOL_NAMES.admission, families: ['vmu.admission.'], config: ['admission'], make: makeAdmissionSpec },
  // ---- ROUND 2 (task-14): the four new faces --------------------------------------------------------------
  // Intent sources follow D-01 (a `vmu.<family>.*` declaration, a `config.<face>` key, `vmu.tools.faces`, or an
  // explicit flag). `human` also lights on `vmu.resume.*` because the SAME tool face carries the recovery verbs.
  { face: 'human', name: TOOL_NAMES.human, families: ['vmu.human.', 'vmu.resume.'], config: ['human', 'resume'], make: makeHumanSpec },
  { face: 'chat', name: TOOL_NAMES.chat, families: ['vmu.chat.'], config: ['chat'], make: makeChatSpec },
  { face: 'mailbox', name: TOOL_NAMES.mailbox, families: ['vmu.mailbox.'], config: ['mailbox'], make: makeMailboxSpec },
  { face: 'panel', name: TOOL_NAMES.panel, families: ['vmu.panel.'], config: ['panel'], make: makePanelSpec },
  { face: 'report', name: TOOL_NAMES.report, families: ['vmu.report.'], config: ['report'], make: makeReportSpec },
  // ROUND 3 / task-24: the activity waiter. NOTE (measured interaction, not a defect): declaring
  // `vmu.activity.wakeOn` really adds a bus entry, so the D-01 `middleware` face's bus-entries intent lights up
  // together with this one - an honest reflection of "there is an entry on the bus".
  { face: 'activity', name: TOOL_NAMES.activity, families: ['vmu.activity.'], config: ['activity'], make: makeActivitySpec },
  // ROUND 3 / task-20 (reader-b's sheet): the fidelity face has NO settings family of its own - its enforcement is
  // deliberately not configurable - so it is declared by the EXISTING formalisation policy being ON
  // (`vmu.math.formalVerify ∈ {encourage, require}`; the default `off` publishes nothing, keeping the zero-mechanism
  // red line). `families: []` is on purpose: listing `vmu.math.formalVerify` there would light the face even when the
  // key says `off`.
  { face: 'fidelity', name: TOOL_NAMES.fidelity, families: [], config: ['fidelity'],
    extraIntent: (c) => (['encourage', 'require'].includes(c.settings['vmu.math.formalVerify']) ? 'setting:vmu.math.formalVerify=' + c.settings['vmu.math.formalVerify'] : null),
    make: makeFidelitySpec },
  { face: 'mathadapters', name: TOOL_NAMES.mathadapters, families: ['vmu.math.adapters.'], config: ['mathadapters'], make: makeMathadaptersSpec },
  { face: 'mathjobs', name: TOOL_NAMES.mathjobs, families: ['vmu.math.jobs.'], config: ['mathjobs'], make: makeMathjobsSpec },
])

/** Every published face key, in publication order: the ONE list a caller (or a gate) can iterate. */
export const FACE_KEYS = Object.freeze(TOOL_FACES.map((f) => f.face))

/** Resolve a requested face name (`minutes`, `vibe_vmu_minutes`, `minutesTool`) to its canonical key, or null. */
export function faceKeyOf(requested) {
  const raw = String(requested === undefined || requested === null ? '' : requested).trim()
  if (!raw) return null
  const bare = raw.endsWith('Tool') ? raw.slice(0, -4) : raw
  const row = TOOL_FACES.find((f) => f.face === bare || f.name === raw || f.name === bare)
  return row ? row.face : null
}

/**
 * ROUND 1 / K1 — which faces are DECLARED, which are AVAILABLE, and which a deployment DISABLED BY NAME.
 *
 * Returns `{ enabled, disabled, unavailable, unknownDisabled, sources }`:
 *   · `enabled`     - what `toolSpecs()` may publish;
 *   · `disabled`    - `vmu.core.facesDisabled` at work (named, never silent);
 *   · `unavailable` - DECLARED but the runtime precondition is absent (e.g. `records` without a durable root);
 *   · `unknownDisabled` - a name in `facesDisabled` that matches no face (reported, so a typo is visible).
 */
export function resolveFaces({ config = {}, settings = {}, kernel = null, explicit = {}, declaredKeys = 0, scripts = [], packLoader = null } = {}) {
  const cfg = config && typeof config === 'object' ? config : {}
  const disableList = Array.isArray(settings['vmu.core.facesDisabled']) ? settings['vmu.core.facesDisabled'] : []
  const disabledKeys = new Set(disableList.map(faceKeyOf).filter(Boolean))
  const unknownDisabled = disableList.filter((d) => !faceKeyOf(d))
  // `vmu.tools.faces`: the universal door (face keys, tool names, or `*`), so every published face has at least one
  // declaration path even when its family happens to declare no keys of its own.
  const listedFaces = Array.isArray(settings['vmu.tools.faces']) ? settings['vmu.tools.faces'] : null
  const listedKeys = listedFaces ? new Set(listedFaces.map(faceKeyOf).filter(Boolean)) : null
  const listedAll = !!(listedFaces && listedFaces.includes('*'))
  const declaredSettingKeys = Object.keys(settings || {})
  const cfgFaces = Array.isArray(cfg.faces) ? new Set(cfg.faces.map(faceKeyOf).filter(Boolean)) : null
  const c = { config: cfg, settings, kernel, declaredKeys, declaredSettingKeys, scripts: Array.isArray(scripts) ? scripts : [], packLoader, listedAll, listedKeys, cfgFaces }
  const enabled = []
  const disabled = []
  const unavailable = []
  const sources = {}
  for (const row of TOOL_FACES) {
    if (disabledKeys.has(row.face)) {
      disabled.push({ face: row.face, name: row.name, code: 'VMU_NOT_PERMITTED', reason: 'disabled by vmu.core.facesDisabled' })
      continue
    }
    // 1) an explicit flag wins (a caller can ask for ONE face with no declaration; the unit tests do exactly that).
    if (explicit && explicit[row.face] === true) { enabled.push(row.face); sources[row.face] = 'explicit-flag'; continue }
    // 2) a declaration, in the order D-01 names its sources: setting list > config list > config key > settings family.
    let why = null
    if (row.always) why = 'always (the inert default must be observable)'
    else if (listedAll || (listedKeys && listedKeys.has(row.face))) why = 'setting:vmu.tools.faces'
    else if (cfgFaces && cfgFaces.has(row.face)) why = 'config.faces'
    else if ((row.config || []).some((k) => cfg[k] !== undefined)) why = 'config:' + (row.config || []).filter((k) => cfg[k] !== undefined).join('|')
    else if ((row.families || []).some((p) => declaredSettingKeys.some((k) => k.startsWith(p)))) why = 'setting:' + (row.families || []).find((p) => declaredSettingKeys.some((k) => k.startsWith(p))) + '*'
    else if (typeof row.extraIntent === 'function') why = row.extraIntent(c)
    if (!why) continue
    // 3) a declared face whose runtime precondition is absent is REPORTED, never silently dropped.
    const missing = typeof row.surface === 'function' ? row.surface(c) : null
    if (missing) { unavailable.push({ face: row.face, name: row.name, code: 'VMU_ENGINE_UNAVAILABLE', reason: missing, declaredBy: why }); continue }
    enabled.push(row.face)
    sources[row.face] = why
  }
  return { enabled, disabled, unavailable, unknownDisabled, sources }
}

/**
 * ROUND 142 — normalise a requested tool filter against the published surface.
 *
 * WHY IT EXISTS: the A/B verdict table recorded this as a SPECIFIED GAP (vmu published the tool NAMES while the
 * half that would consume them was missing). The v5r line has the same capability, its behaviour was measured
 * first, and that measurement is exactly why this implementation differs: there, a requested name that is NOT
 * known makes the WHOLE filter undefined - one typo silently removes every restriction and nothing says so.
 * Here an unknown name is refused BY NAME, listing the unknown ones and the known surface, because a filter that
 * quietly stops filtering is worse than one that says it did not understand you.
 *
 * Also deliberately NOT conflated: absent (no restriction) is `null`, an explicitly empty list is `[]`.
 * Everything dropped - empty entries, duplicates - is COUNTED in `dropped`, never silently lost.
 *
 * `known` defaults to the published surface and may be a Set, an array, or the TOOL_NAMES object itself. When it is
 * explicitly EMPTY the check cannot be made, so the list passes through with `checked:false` rather than every name
 * being refused (an unchecked pass-through that SAYS it is unchecked).
 */
export function sanitizeToolFilter(filter, known = TOOL_NAMES) {
  const surface = known instanceof Set ? [...known]
    : Array.isArray(known) ? known.map(String)
      : (known && typeof known === 'object' ? Object.values(known).map(String) : [])
  const raw = filter === undefined || filter === null ? []
    : Array.isArray(filter) ? filter : String(filter).split(',')
  const cleaned = []
  const unknown = []
  let empty = 0
  let duplicate = 0
  for (const item of raw) {
    const name = String(item === undefined || item === null ? '' : item).trim()
    if (name === '') { empty += 1; continue }
    if (cleaned.indexOf(name) !== -1) { duplicate += 1; continue }
    if (surface.length > 0 && surface.indexOf(name) === -1) { unknown.push(name); continue }
    cleaned.push(name)
  }
  if (unknown.length > 0) {
    const err = new Error('unknown tool name(s) in the filter: ' + unknown.join(', '))
    err.code = 'VMU_INVALID_ARGUMENT'
    err.hint = 'known tools: ' + surface.join(', ')
      + ' - a filter that silently DROPPED them would stop filtering without saying so (the v5r line collapses the whole filter here)'
    err.unknown = unknown.slice()
    err.known = surface.slice()
    throw err
  }
  const noRestriction = filter === undefined || filter === null
  return { ok: true, filter: noRestriction ? null : cleaned, checked: surface.length > 0, dropped: { empty, duplicate } }
}

/**
 * The host-verified output envelope: a JSON string rendered as one text part.
 *
 * The host's exact predicate (`dsh-tools/lib/index.js:2881`, read from the installed asar) is:
 *   output === undefined || typeof output !== 'object' || typeof output.render !== 'function'
 *     || (output.presentationMeta !== undefined && typeof output.presentationMeta !== 'function')
 *     ⇒ throw TypeError('tool "<name>" must declare output { schema, render, presentationMeta? }')
 * So `presentationMeta`, when present, must be a FUNCTION - an object is rejected, and the message does
 * not say which clause failed. That is exactly the defect the first scripted live run exposed; this file
 * therefore omits it (as the repository's working preset does).
 */
export const OUTPUT = Object.freeze({
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: String(value) }],
})

const param = (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra)

/**
 * The tool catalogue. Each entry carries an internal `run(args, exec)` returning a plain object; the
 * adapter turns it into the host shape (`execute` returning JSON). Filtering by what actually exists keeps
 * the surface honest (docs/04 §11 ownership: mechanism only).
 *
 * ROUND 1 / K1 (D-01): which faces appear is resolved from DECLARATIONS by `resolveFaces()` (above), not from forty
 * hand-passed booleans. The legacy `<face>Tool: true` flags are still accepted (they land in `...faceFlags`) because a
 * caller that wants ONE face with no declaration is a legitimate case - and the per-face unit tests rely on it. The
 * `faces` option lets a caller hand in an already-resolved set (the adapter resolves once and passes it down, so
 * install() and plan() cannot disagree).
 */
export function toolSpecs({ kernel, settings = {}, assertDeclared = null, log = () => {}, instance = null, scripts = [], packLoader = null, config = {}, faces = null, mergeReport = null, ...faceFlags }) {
  // A refusal carries the four documented fields, plus - when the caller has them - host-side DIAGNOSTICS
  // (the host's own stack and the exact request shape we passed). They are added ONLY when present, so no
  // existing refusal changes shape. Without this the live M3 diagnosis died at the tool boundary: the seam
  // carried `hostStack`/`shape`, the tool face dropped them (task-33's finding).
  // ROUND 2 (Lead, `vmu-refusals-guide` ≥80%): A REFUSAL MUST CARRY A NEXT STEP. Forty-six of the forty-nine
  // hint-less refusals measured by that guide were `VMU_INVALID_ARGUMENT` raised on the ONE parameter-validation path
  // (a caller that passes only `{ action }`), and that path forwarded `hint: null`. The defaults below are the
  // ACTIONABLE next step for the code in question - not placeholder strings - and an explicit hint always wins. The
  // measurement and its threshold are untouched (the probe was not edited).
  const DEFAULT_HINTS = Object.freeze({
    VMU_INVALID_ARGUMENT: 'pass `action` PLUS the parameters docs/18 §1 lists for that action (this face refuses by name rather than guessing a default)',
    VMU_HUMAN_VETOED: 'the veto must be lifted first: vibe_vmu_human { action:"liftVeto", id:"<vetoId>", reason:"…" } — the lifting role must be listed in vmu.human.vetoLiftRoles',
    VMU_RESUME_UNAVAILABLE: 'construct the kernel with { store } (a durable root): the recovery face cannot exist without one (docs/07 §3)',
    VMU_MEETING_TOO_SMALL: 'add participants until the declared quorum is met — the threshold is policy (pack/middleware), the code is registered by the kernel (docs/08 §3)',
  })
  const refused = (code, message, hint, extra = null) => Object.assign({ ok: false, code, message, hint: hint || DEFAULT_HINTS[code] || null },
    extra && typeof extra === 'object'
      ? Object.assign({},
        extra.hostStack ? { hostStack: String(extra.hostStack).slice(0, 2000) } : {},
        extra.shape ? { shape: extra.shape } : {})
      : {})
  const specs = []
  // D-01: ONE resolution, computed here and handed to every gate below as `on(face)`. `faceFlags` carries the legacy
  // `<face>Tool` booleans; `faces` is an already-resolved set from the adapter (so install() and plan() agree).
  const explicit = {}
  for (const row of TOOL_FACES) if (faceFlags[row.face + 'Tool'] === true) explicit[row.face] = true
  // The settings face's declaration is the DECLARED-KEY GUARD itself: the entry passes `assertDeclared` exactly when a
  // deployment declared settings, and a caller that passes it is asking for the face (this is the pre-existing contract).
  if (typeof assertDeclared === 'function') explicit.set = true
  const faceResolution = faces || resolveFaces({ config, settings, kernel, explicit, declaredKeys: Object.keys(settings || {}).length, scripts, packLoader })
  const enabledFaces = new Set(faceResolution.enabled)
  const on = (face) => enabledFaces.has(face)

  // 1) status — ALWAYS available when the kernel is enabled: it is how the inert default is observable.
  // It also PROVES WHICH INSTANCE answered: a profile can hold two vmu rows (the preset's and a standalone
  // one), the host keeps one registration per name, and without an identity the receipts look contradictory.
  if (on('status')) specs.push({
    name: TOOL_NAMES.status,
    description: 'vmu 内核状态：装配了哪些服务/接缝、注册了哪些中间件、生效的整合包、实例身份、以及是否"零机制惰性"。只读。',
    parameters: {},
    run: async () => {
      try {
        const out = Object.assign({ ok: true, instance }, kernel.status())
        // ROUND 1 / K1 (D-01): WHICH faces exist and WHY the other ones do not. A face that silently disappears is
        // exactly the failure this map exists to end, so the answer travels with the status receipt.
        out.faces = { enabled: faceResolution.enabled, disabled: faceResolution.disabled, unavailable: faceResolution.unavailable,
          unknownDisabled: faceResolution.unknownDisabled, sources: faceResolution.sources,
          published: specs.map((s) => s.name) }
        // ROUND 1 / K5 (D-02): the ENTRY's pack-merge report - the priority ladder, the per-key layer, the NAMED
        // conflicts and the declared overrides. It is surfaced HERE, by the host face, because the kernel never acts on
        // it: the entry refused/shadowed at merge time, and `tests/vmu-seam-params-consumed.test.mjs` forbids a kernel
        // seam that only `kernel/index.js` reads.
        if (typeof mergeReport === 'function') out.settingsMerge = mergeReport()
        return out
      } catch (e) {
        return refused('VMU_MIDDLEWARE_FAILED', 'status() failed: ' + String(e && e.message))
      }
    },
  })

  // 2) set — only with a declared-key guard (an undeclared key is a defect, never a default: R4).
  if (on('set') && typeof assertDeclared === 'function') {
    specs.push({
      name: TOOL_NAMES.set,
      description: '改一个 vmu 设置。未声明的键一律具名拒；回执含热改等级与可改者。★ 调用方可给 `by`／`reason` 声明**真实归属**（给了 `by` ⇒ 走声明所有者的真检查；不给 ⇒ office 路径，回执以 `ownerCheck` **具名披露**该豁免）。',
      parameters: {
        key: param('string', '设置键，必须已在 docs/04 §11 登记', { required: true }),
        value: param('string', '新值（按声明的类型解析：布尔/数字/JSON 数组或对象/字符串）'),
        // ROUND 7 / task-57 (vmu-assistant's live finding): the published schema had `additionalProperties:false` and
        // did NOT accept `by`/`reason`, so a caller could not declare WHO made the change - the receipt could only say
        // `ownerCheck:"exempted (no \`by\` given: office path, DISCLOSED)"`. The kernel's setter has always taken
        // `{ by }` (the declared-owner check is its single source), so the fix is to let the CALLER reach it: with
        // `by`, the owner check is a REAL check on the declared owner; without it, the office path is unchanged and
        // still disclosed. `reason` travels into the runtime-write ledger for the same auditability.
        by: param('string', '谁在改（可选）。给了就走声明所有者的真检查；不给＝office 路径（回执具名披露豁免）'),
        reason: param('string', '为什么改（可选）。进运行期写入台账，便于审计追问'),
      },
      run: async ({ key, value, by, reason } = {}) => {
        try {
          assertDeclared(key)
        } catch (e) {
          return refused(e.code || 'VMU_INVALID_ARGUMENT', String(e.message), e.hint)
        }
        const def = (kernel.settingDef ? kernel.settingDef(key) : null) || null
        // TASK-166: the hot-class/owner contract is NOT enforced here any more — it lives INSIDE
        // kernel.setSettingsValue()/unsetSettingsValue() (the single source), so the tool face and the kernel
        // API cannot answer the same (key, value) pair differently. This face only PARSES the value.
        let parsed = value
        if (typeof value === 'string') {
          const t = def ? def.type : null
          if (t === 'boolean') parsed = value === 'true'
          else if (t === 'natural' || t === 'positiveInteger') parsed = Number(value)
          else if (t === 'stringList' || t === 'objectList') { try { parsed = JSON.parse(value) } catch { return refused('VMU_INVALID_ARGUMENT', 'value must be JSON for ' + t) } }
        }
        let setReceipt = null
        try {
          // ROUND 7 / task-57: pass the caller's attribution THROUGH to the one owner-check implementation. `by`
          // absent stays the office path (unchanged, disclosed); `by` present makes the declared-owner check real.
          // `reason` rides along so the runtime-write ledger can answer "why", not only "who".
          setReceipt = kernel.setSettingsValue(key, parsed, { by: by === undefined ? null : by, reason: reason === undefined ? null : reason })
        } catch (e) {
          // The kernel's code and words are preserved (it used to be flattened into VMU_PACK_CONFLICT, which
          // hid the H3/unknown-key/owner refusals behind a code that meant something else).
          return refused(e && e.code ? e.code : 'VMU_PACK_CONFLICT', String(e.message), e.hint)
        }
        log('vmu set ' + key)
        // The receipt says exactly WHEN the new value takes effect, per its declared hot class, so a reader
        // never has to guess whether a change was ignored (H2 ⇒ a new session is required, and we say so).
        // The table comes from the KERNEL (one source); this face only formats it.
        const APPLIES = (kernel.appliesTable ? kernel.appliesTable() : null)
          || (kernel.status && kernel.status().settings && kernel.status().settings.applies) || {}
        const resolved = kernel.status ? (kernel.status().settings.resolved || {})[key] : null
        // A PLANNED KEY is a design-phase declaration with NO consumer yet (settings/planned.js, docs/04 §6.3).
        // The receipt must SAY so: "settable but inert" is exactly the trap the manual forbids. `noConsumer` is
        // present only for planned keys, so no other receipt changes shape.
        const planned = !!(def && def.planned === true)
        return { ok: true, key, value: parsed, hot: def ? def.hot : null, who: def ? def.who : null,
          // `ownerCheck` is copied from the kernel receipt: an absent `by` is an EXPLICIT exemption, disclosed,
          // never a silent bypass of the owner check.
          ownerCheck: setReceipt ? setReceipt.ownerCheck : null,
          // ROUND 7 / task-57: the attribution the CALLER declared travels back on the receipt (null when it declared
          // none - which is the disclosed office path, not a silent bypass).
          by: by === undefined ? null : by,
          reason: reason === undefined ? null : reason,
          requiresRestart: setReceipt ? setReceipt.requiresRestart === true : false,
          appliesFrom: planned ? 'never yet (planned key: no runtime consumer)'
            : (def ? (APPLIES[def.hot] || 'unknown hot class') : 'unknown (undeclared key)'),
          source: resolved ? resolved.source : null,
          ...(planned ? { noConsumer: true } : {}),
          note: planned
            ? 'this key is DECLARED BY THE DESIGN (settings/planned.js, docs/04 §6.3) and has NO consumer yet: setting it changes nothing until it is implemented'
            : 'settings.resolved in vibe_vmu_status shows every key with its value, source and hot class' }
      },
    })
  }

  // 3) middleware — when middleware was declared OR the bus already has entries (a PACK can add them, and
  // observability must follow reality, not only the declaration).
  const declaredEntries = Array.isArray(settings['vmu.middleware.entries']) ? settings['vmu.middleware.entries'] : []
  const busEntries = kernel.bus && kernel.bus.status ? (kernel.bus.status().entries || []) : []
  if (on('middleware') && kernel.bus) {
    specs.push({
      name: TOOL_NAMES.middleware,
      description: 'vmu 中间件：action=list|disable|enable|validate|dryRun（四形态共用一条总线）。validate/dryRun 只读、无副作用。',
      parameters: {
        action: param('string', 'list（默认）｜disable｜enable｜validate｜dryRun', { required: true, enum: ['list', 'disable', 'enable', 'validate', 'dryRun'] }),
        id: param('string', '中间件条目 id（disable/enable/dryRun 用；dryRun 也可改用 rule）'),
        rule: param('string', 'validate/dryRun：M1 规则的 JSON 文本（不传 id 时使用）'),
        samples: param('string', 'dryRun：事件样本的 JSON 数组（每个元素是一次事件对象）'),
      },
      run: async ({ action = 'list', id, rule, samples } = {}) => {
        try {
          const parseJson = (text, what) => {
            try { return JSON.parse(String(text)) } catch { return refused('VMU_INVALID_ARGUMENT', what + ' must be valid JSON') }
          }
          const ruleFor = () => {
            if (typeof rule === 'string' && rule.trim().length > 0) return parseJson(rule, 'rule')
            if (id && kernel.rules && typeof kernel.rules.get === 'function') {
              const found = kernel.rules.get(id)
              if (!found) return refused('VMU_NO_SUCH_OBJECT', 'no M1 rule with id ' + String(id),
                'declared rules: ' + (kernel.rules.ids ? kernel.rules.ids().join(', ') : 'unknown'))
              return found
            }
            return refused('VMU_INVALID_ARGUMENT', 'validate/dryRun need a rule (JSON) or an id',
              'pass rule: "<json>" for a new rule, or id: "<declared id>" to inspect one in place')
          }
          if (action === 'list') return Object.assign({ ok: true, action }, kernel.bus.status())
          if (action === 'disable' || action === 'enable') {
            if (!id) return refused('VMU_INVALID_ARGUMENT', 'disable/enable 需要 id')
            return Object.assign({ ok: true, action }, { result: action === 'disable' ? kernel.bus.disable(id, 'disabled by tool') : kernel.bus.enable(id) })
          }
          if (action === 'validate') {
            const parsed = ruleFor()
            if (parsed && parsed.ok === false) return parsed
            const problems = kernel.rules.validate ? kernel.rules.validate(parsed) : []
            return { ok: problems.length === 0, action, problems, vocabulary: kernel.rules.vocabulary ? kernel.rules.vocabulary() : null }
          }
          if (action === 'dryRun') {
            const parsed = ruleFor()
            if (parsed && parsed.ok === false) return parsed
            // DRY-RUN HAS NO SIDE EFFECTS: the rules engine counts the run and returns what WOULD happen.
            let list = []
            if (typeof samples === 'string' && samples.trim().length > 0) {
              const arr = parseJson(samples, 'samples')
              if (arr && arr.ok === false) return arr
              list = Array.isArray(arr) ? arr : [arr]
            }
            const out = kernel.rules.dryRun(parsed, list)
            return Object.assign({ ok: out.ok !== false, action }, out)
          }
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_NO_SUCH_OBJECT', String(e.message), e.hint)
        }
      },
    })
  }

  // 4) records — only when a durable library exists (no root ⇒ no records tool at all, see the header).
  if (on('records') && kernel.library) {
    specs.push({
      name: TOOL_NAMES.records,
      description: 'vmu 记录面：list（头部列表，不含正文）｜expand（按 id 取正文，超限计数）｜append（写入并回指纹）。',
      parameters: {
        action: param('string', 'list（默认）｜expand｜append', { required: true, enum: ['list', 'expand', 'append'] }),
        id: param('string', '记录 id（expand 必填）'),
        kind: param('string', 'append：proposition｜method｜subproblem', { enum: ['proposition', 'method', 'subproblem'] }),
        statement: param('string', 'append：陈述'),
        proof: param('string', 'append：证明/方法正文'),
      },
      run: async ({ action = 'list', id, kind, statement, proof } = {}) => {
        try {
          if (action === 'list') return Object.assign({ ok: true, action }, { records: await kernel.library.list() })
          if (action === 'expand') return Object.assign({ ok: true, action }, await kernel.library.expand(id))
          if (action === 'append') return Object.assign({ ok: true, action }, await kernel.library.append({ kind, statement, proof }))
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_INVALID_ARGUMENT', String(e.message), e.hint)
        }
      },
    })
  }

  // 5) scripts (M3) — only when the configuration DECLARES scripts. Results go back to the caller and
  // nowhere else: this tool has no prompt path at all (docs/06 §5).
  if (on('script') && Array.isArray(scripts) && scripts.length > 0) {
    specs.push({
      name: TOOL_NAMES.script,
      description: '列出或运行本次运行声明的 M3 脚本。action=list|run；结果只回给调用方，**绝不自动进入提示词**。',
      parameters: {
        action: param('string', 'list（默认）｜run', { required: true, enum: ['list', 'run'] }),
        id: param('string', '脚本 id（run 必填）'),
        args: param('string', 'JSON 数组形式的附加参数（可选）'),
      },
      run: async ({ action = 'list', id, args } = {}) => {
        try {
          if (action === 'list') {
            return { ok: true, action, scripts: scripts.map((s) => ({ id: s && s.id, file: s && s.file, timeoutMs: (s && s.timeoutMs) || null })) }
          }
          if (action !== 'run') return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
          const script = scripts.find((s) => s && s.id === id)
          if (!script) {
            return refused('VMU_NO_SUCH_OBJECT', 'no declared script with id ' + String(id),
              'declared: ' + scripts.map((s) => s && s.id).join(', '))
          }
          let extra = []
          if (typeof args === 'string' && args.trim().length > 0) {
            try { extra = JSON.parse(args) } catch { return refused('VMU_INVALID_ARGUMENT', 'args must be a JSON array of strings') }
            if (!Array.isArray(extra)) return refused('VMU_INVALID_ARGUMENT', 'args must be a JSON array of strings')
          }
          // Build the request CONDITIONALLY: the bridge's validator refuses a present-but-wrong cwd, so an
          // absent optional field must stay absent (null is not a string).
          const request = {
            file: script.file,
            args: (script.args || []).concat(extra.map(String)),
            timeoutMs: script.timeoutMs || 0,
            failure: script.failure || 'open',
          }
          if (typeof script.cwd === 'string' && script.cwd.length > 0) request.cwd = script.cwd
          if (script.env && typeof script.env === 'object' && !Array.isArray(script.env)) {
            // Same rule as the spawn seam, applied at the SOURCE: only strings can be environment variables. An
            // `undefined` value used to be forwarded verbatim and made the host throw inside its own validation
            // (the live M3 root cause). Primitives are coerced; anything else is dropped, never shipped broken.
            const env = {}
            for (const [k, v] of Object.entries(script.env)) {
              if (typeof v === 'string') env[k] = v
              else if (typeof v === 'number' || typeof v === 'boolean') env[k] = String(v)
            }
            if (Object.keys(env).length > 0) request.env = env
          }
          const result = await kernel.bridge.run(request)
          return Object.assign({ ok: true, action, script: id }, result)
        } catch (e) {
          return refused(e.code || 'VMU_MIDDLEWARE_FAILED', String(e.message), e.hint, e)
        }
      },
    })
  }

  // 6) packs (M4) — only when the entry handed us a loader. `plan` is PURE (it reports exactly what would
  // change), `apply` refuses conflicts (O4) and `unload` reverses what was applied, so the promote flow the
  // pack manual describes ("plan ⇒ apply") finally has a callable surface instead of a library-only one.
  if (on('pack') && typeof packLoader === 'function') {
    specs.push({
      name: TOOL_NAMES.pack,
      description: 'vmu 整合包：action=list|plan|apply|unload。plan 只读（报告会改什么），apply 冲突即具名拒，unload 逐个回滚。',
      parameters: {
        action: param('string', 'list（默认）｜plan｜apply｜unload', { required: true, enum: ['list', 'plan', 'apply', 'unload'] }),
        id: param('string', 'unload 必填；也可给随包整合包 id（plan/apply 时按 ./packs/<id>.js 解析）'),
        manifest: param('string', 'plan/apply：内联 manifest 的 JSON 文本'),
      },
      run: async ({ action = 'list', id, manifest } = {}) => {
        try {
          const loader = packLoader()
          if (!loader) return refused('VMU_ENGINE_UNAVAILABLE', 'no pack loader in this assembly')
          if (action === 'list') return Object.assign({ ok: true, action }, loader.status())
          const parsed = (() => {
            if (typeof manifest === 'string' && manifest.trim().length > 0) {
              try { return JSON.parse(manifest) } catch { return refused('VMU_INVALID_ARGUMENT', 'manifest must be valid JSON') }
            }
            return null
          })()
          if (parsed && parsed.ok === false) return parsed
          const resolved = parsed
          if (!resolved) {
            return refused('VMU_INVALID_ARGUMENT', 'plan/apply need an inline manifest (manifest: "<json>")',
              'a pack SHIPPED as ./packs/<id>.js is loaded by the profile row via config.packs; this tool inspects and loads inline manifests')
          }
          if (action === 'plan') return Object.assign({ ok: true, action }, loader.plan(resolved))
          if (action === 'apply') return Object.assign({ ok: true, action }, await loader.apply(resolved))
          if (action === 'unload') {
            if (!id) return refused('VMU_INVALID_ARGUMENT', 'unload needs id')
            return Object.assign({ ok: true, action }, await loader.unload(id))
          }
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_PACK_MISSING', String(e.message), e.hint)
        }
      },
    })
  }

  // 7) control flow (docs/08 §5) — only when the configuration declares control intent. A pause is a GATE:
  // while paused the kernel refuses task mutations by name, and the bus is told so middleware can react.
  // ROUND 349 — THE TURN TOOL (docs/26 §3.4). The loop existed as a service and as a test harness; this is what makes
  // it reachable from a real session. Declared like every other face: only offered when the configuration asks for it,
  // because with nothing declared the preset must still register exactly one tool (R1 zero mechanism).

  // 8) per-domain tool faces (docs/03 §3.1): meetings/ballots and the task board, addressable from a session.
  // They appear ONLY when the configuration declares the intent (zero mechanism, R1): a meeting face needs a
  // declared meeting intent, a task face needs a declared task board (or declared stages). They never invent
  // state - they call the SAME kernel primitives the library level exposes, by id.
















  if (on('transaction')) specs.push(makeTransactionSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('custody')) specs.push(makeCustodySpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('topology')) specs.push(makeTopologySpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('formal')) specs.push(makeFormalSpec({ param, refused, TOOL_NAMES, kernel }))

  // ROUND 538: the tool specs live in tools/<key>.js so this file stays inside the decided 1200-line limit. The CONDITIONS
  // stay here: which intent declares a tool is policy, and policy belongs with the host.
  if (on('turn')) specs.push(makeTurnSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('control')) specs.push(makeControlSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('meeting')) specs.push(makeMeetingSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('task')) specs.push(makeTaskSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('minutes')) specs.push(makeMinutesSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('board')) specs.push(makeBoardSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('budget')) specs.push(makeBudgetSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('citations')) specs.push(makeCitationsSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('discipline')) specs.push(makeDisciplineSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('governance')) specs.push(makeGovernanceSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('ratelimit')) specs.push(makeRatelimitSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('explain')) specs.push(makeExplainSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('projmigrate')) specs.push(makeProjmigrateSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('bridge')) specs.push(makeBridgeSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('external')) specs.push(makeExternalSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('mathtools')) specs.push(makeMathtoolsSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('auditchain')) specs.push(makeAuditchainSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('notify')) specs.push(makeNotifySpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('collab')) specs.push(makeCollabSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('reviewers')) specs.push(makeReviewersSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('clockguard')) specs.push(makeClockguardSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('publication')) specs.push(makePublicationSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('fairness')) specs.push(makeFairnessSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('handover')) specs.push(makeHandoverSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('conference')) specs.push(makeConferenceSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('arbitration')) specs.push(makeArbitrationSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('charter')) specs.push(makeCharterSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('recruit')) specs.push(makeRecruitSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('capacity')) specs.push(makeCapacitySpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('retention')) specs.push(makeRetentionSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('idempotency')) specs.push(makeIdempotencySpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('audit')) specs.push(makeAuditSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('ip')) specs.push(makeIpSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('bidding')) specs.push(makeBiddingSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('admission')) specs.push(makeAdmissionSpec({ param, refused, TOOL_NAMES, kernel }))
  // ROUND 2 (task-14): the four new faces.
  if (on('human')) specs.push(makeHumanSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('chat')) specs.push(makeChatSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('mailbox')) specs.push(makeMailboxSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('panel')) specs.push(makePanelSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('report')) specs.push(makeReportSpec({ param, refused, TOOL_NAMES, kernel }))
  // ROUND 3 / task-24: the activity waiter's face.
  if (on('activity')) specs.push(makeActivitySpec({ param, refused, TOOL_NAMES, kernel }))
  // ROUND 3 / task-20: the fidelity face (published only when the formalisation policy is on).
  if (on('fidelity')) specs.push(makeFidelitySpec({ param, refused, TOOL_NAMES, kernel }))
  // ROUND 2 (task-14, Lead 裁决 B): one tool per service - adapters and jobs are separate faces on purpose.
  if (on('mathadapters')) specs.push(makeMathadaptersSpec({ param, refused, TOOL_NAMES, kernel }))
  if (on('mathjobs')) specs.push(makeMathjobsSpec({ param, refused, TOOL_NAMES, kernel }))

  return specs
}

/**
 * The host's parameter shape, learned the hard way from the live run:
 *   Invalid schema for function 'vibe_vmu_status': schema must be a JSON Schema of 'type: "object"',
 *   got 'type: null'
 * The PROVIDER (not the host) rejects a function whose parameter schema is not an object schema, and it
 * rejects the WHOLE REQUEST - which shows up as a silent zero-token turn. So every tool's parameters are
 * published as `{ type:'object', properties, required, additionalProperties:false }`, with `required` as
 * the top-level array (exactly what the repository's working preset builds via objParams()).
 */
export function toHostParameters(params = {}) {
  const properties = {}
  const required = []
  for (const [name, def] of Object.entries(params)) {
    const { required: isRequired, ...rest } = def
    properties[name] = rest
    if (isRequired === true) required.push(name)
  }
  return { type: 'object', properties, additionalProperties: false, required }
}

/** Turn an internal spec into the HOST's shape (the one the real host accepted for v5r). */
export function toHostSpec(spec) {
  return {
    name: spec.name,
    description: spec.description,
    parameters: toHostParameters(spec.parameters || {}),
    output: OUTPUT,
    execute: async (args, exec) => {
      try {
        return JSON.stringify(await spec.run(args || {}, exec))
      } catch (e) {
        return JSON.stringify({ ok: false, code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED',
          message: String((e && e.message) || e), hint: (e && e.hint) || null })
      }
    },
  }
}

/**
 * Install the tools into a host context. Registrations go through `ctx.effect(..., label)` when the host
 * offers it - the host's own guidance requires that, and it is what unwinds them on subtree unload - and
 * fall back to keeping the returned disposers otherwise.
 */
export function createHostAdapter({ ctx, kernel, settings = {}, assertDeclared = null, defineTool = null, log = () => {}, instance = null, scripts = [], packLoader = null, config = {}, faces = null, mergeReport = null, ...faceFlags } = {}) {
  const disposers = []
  const registered = []
  const failures = []
  let installed = false
  let ownedByHost = false
  let chain = Promise.resolve()

  // ROUND 1 / K1 (D-01): the face set is resolved ONCE here and handed to `toolSpecs`, so what `plan()` promises and
  // what `install()` registers can never disagree (the same "one fact, one source" rule the seams follow). The legacy
  // `<face>Tool` flags still travel through `...faceFlags`, so an existing caller (and the unit tests) keeps working.
  const resolveFaceSet = () => (faces || resolveFaces({
    config, settings, kernel, explicit: (() => {
      const e = {}
      for (const row of TOOL_FACES) if (faceFlags[row.face + 'Tool'] === true) e[row.face] = true
      // The `set` face is declared by the presence of the declared-key guard (see toolSpecs), so plan() and install()
      // agree on it instead of one of them dropping it.
      if (typeof assertDeclared === 'function') e.set = true
      return e
    })(),
    declaredKeys: Object.keys(settings || {}).length, scripts, packLoader,
  }))
  const enabledFaceSet = () => { const r = resolveFaceSet(); return r.enabled }

  const specs = () => (settings['vmu.core.enabled'] === false ? [] : toolSpecs({ kernel, settings, assertDeclared, log, instance, scripts, packLoader, config, mergeReport, ...faceFlags, faces: (() => { const r = resolveFaceSet(); return r })() }))

  const doInstall = async () => {
    if (!ctx || !ctx.tools || typeof ctx.tools.register !== 'function') {
      throw Object.assign(new Error('the host context has no tools.register'), { code: 'VMU_ENGINE_UNAVAILABLE',
        hint: 'pass a DSH context; the adapter never invents a tool surface' })
    }
    const raw = specs()
    // ROUND 478: the filter published in round 142 finally has a consumer. `vmu.tools.enabled` narrows the surface;
    // absent (null) means no restriction and an explicit [] means nothing registers - the distinction
    // sanitizeToolFilter was written to preserve. An unknown name is refused BY NAME and the refusal is recorded
    // in failures and logged, never swallowed: a filter that quietly stops filtering is the failure this
    // mechanism exists to prevent.
    const declared = settings && Object.prototype.hasOwnProperty.call(settings, 'vmu.tools.enabled') ? settings['vmu.tools.enabled'] : null
    let filterResult = null
    try {
      filterResult = sanitizeToolFilter(declared, TOOL_NAMES)
    } catch (e) {
      // sanitizeToolFilter REFUSES an unknown name by throwing. FAIL-CLOSED: an unusable filter must never widen
      // the surface, so nothing registers and the refusal is recorded where install problems are already reported.
      filterResult = { ok: false, refused: { code: (e && e.code) || 'VMU_INVALID_ARGUMENT', message: (e && e.message) || String(e), hint: (e && e.hint) || 'vmu.tools.enabled must list published tool names' } }
    }
    if (!filterResult.ok) {
      const refused = filterResult.refused
      failures.push({ name: '(tool filter)', code: refused.code, message: refused.message, hint: refused.hint || null })
      log('vmu.tools.enabled refused, nothing will register: ' + String(refused.message))
    }
    const wanted = filterResult.ok ? filterResult.filter : []
    const list = wanted === null ? raw : raw.filter((s) => wanted.includes(s.name))
    if (list.length === 0) {
      installed = true
      log('vmu is disabled: nothing registered')
      return { ok: true, installed: 0, names: [], note: 'vmu.core.enabled = false: the adapter registers nothing' }
    }
    const hasEffect = typeof ctx.effect === 'function'
    ownedByHost = hasEffect
    failures.length = 0
    for (const spec of list) {
      // IDEMPOTENT: a later call may find tools that only became available afterwards (a pack can add bus
      // entries after install), and already-registered names are skipped instead of colliding.
      if (registered.includes(spec.name)) continue
      const hostSpec = typeof defineTool === 'function' ? defineTool(toHostSpec(spec)) : toHostSpec(spec)
      try {
        if (hasEffect) {
          // The host owns the unwind through ctx.effect; ctx.effect returns the callback's value, which
          // here is the promise from tools.register().
          const dispose = await ctx.effect(() => ctx.tools.register(hostSpec), 'vmu:tool:' + spec.name)
          if (typeof dispose === 'function') disposers.push(dispose)
        } else {
          const dispose = await ctx.tools.register(hostSpec)
          if (typeof dispose === 'function') disposers.push(dispose)
        }
        registered.push(spec.name)
      } catch (e) {
        // ONE registration may fail without killing the rest: the host refuses a duplicate name in the same
        // layer ("duplicates within one layer fail"), and a second vmu instance is a real scenario. The
        // failure stays NAMEABLE instead of being swallowed (R11).
        failures.push({ name: spec.name, code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e) })
        log('vmu tool ' + spec.name + ' was not registered: ' + String((e && e.message) || e))
      }
    }
    installed = true
    return { ok: failures.length === 0, installed: registered.length, names: registered.slice(), ownedByHost, failures: failures.map((f) => Object.assign({}, f)) }
  }

  return {
    /** What WOULD be registered (pure: no host calls) - the host-side zero-mechanism proof. */
    plan() {
      const disabled = settings['vmu.core.enabled'] === false
      const list = specs()
      const r = resolveFaceSet()
      return { enabled: !disabled, names: list.map((s) => s.name), count: list.length,
        // ROUND 1 / K1 (D-01): the faces that are enabled, the ones DISABLED BY NAME and the ones declared but
        // UNAVAILABLE (with the reason). `enabledFaceSet()` is the resolved list; `list` is what was published.
        faces: { enabled: enabledFaceSet(), disabled: r.disabled, unavailable: r.unavailable, unknownDisabled: r.unknownDisabled, sources: r.sources },
        reason: disabled ? 'vmu.core.enabled = false: the adapter registers nothing' : undefined }
    },

    /**
     * Register the available tools. Installs are SERIALISED through one promise chain: a pack applied just
     * after install can make a tool available, and two concurrent installs would register the same name
     * twice (the first version of this did exactly that).
     */
    install() {
      chain = chain.then(() => doInstall())
      return chain
    },

    async uninstall() {
      if (ownedByHost) {
        registered.length = 0
        installed = false
        return { ok: true, ownedByHost: true, note: 'the host unwinds these registrations through ctx.effect' }
      }
      const failures2 = []
      for (const d of disposers.splice(0)) { try { d() } catch (e) { failures2.push(String(e && e.message)) } }
      registered.length = 0
      installed = false
      return { ok: failures2.length === 0, failures: failures2 }
    },

    status() {
      return { instance, installed, ownedByHost, registered: registered.slice(), failures: failures.map((f) => Object.assign({}, f)), plan: this.plan(),
        note: 'with nothing declared only vibe_vmu_status is registered; with vmu.core.enabled=false nothing is; execute() returns a JSON string rendered as one text part; a registration that fails is named in `failures` and does not stop the others' }
    },
  }
}
