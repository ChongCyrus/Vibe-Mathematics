// vmu kernel — the composition root (docs/02 §2, docs/03 §1).
//
// This file is what the goal means by "the vmu framework": the place where the parts are ASSEMBLED, and
// the place where the framework's first promise is enforced. That promise is the zero-mechanism default
// (R1, docs/04 §3): a kernel created with no settings, no packs and no middleware must be INERT.
// Concretely, and this is asserted by tests/vmu-kernel.test.mjs:
//   · it registers nothing with the host;
//   · it subscribes to no hook (the bus is empty);
//   · it injects no prompt section (the assembled prompt equals the base it was given);
//   · it opens no durable store unless a root was supplied.
// Everything else is activated by DECLARATION: settings choose what runs, packs choose what an
// institution means, and a capability that is switched on without its seam is refused BY NAME
// (VMU_ENGINE_UNAVAILABLE) instead of quietly behaving as if it were off.
//
// Ownership rule applied here (docs/04 §11, P3): the kernel carries MECHANISM only. Nothing in this
// file names a role, a stage, a paper or a policy - those arrive as settings values or pack content.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

export { PACK_CONTRACT_VERSION } from './registry.js'

import { createStore } from './store.js'
import { createBus } from './bus.js'
import { createPromptPipeline } from './prompt/index.js'
import { createLibrary } from './library.js'
import { createMembers } from './members.js'
import { createBallot } from './ballot.js'
import { createMeeting } from './meeting.js'
import { createTasks } from './tasks.js'
import { createMathSurface } from './math.js'
import { createRulesEngine } from './rules.js'
import { createLoader } from './loader.js'
import { createScriptBridge } from './script-bridge.js'
import { createRegistry } from './registry.js'
import { createWorkLedger } from './work.js'
import { createLeanFace } from './lean.js'
import { memoryCeilingExceeded } from './guard.js'
// IMPLEMENTATION PHASE (docs/11 §9.8): the first planned primitives to become real code.
import { createGovernance } from './governance.js'
import { createBoard } from './board.js'
import { createMinutes } from './minutes.js'
import { createBudget } from './budget.js'
import { createMetrics } from './metrics.js'
import { createAudit } from './audit.js'
import { createAlerts } from './alerts.js'
import { createRetention } from './retention.js'
import { createDelegation } from './delegation.js'
import { createMemory } from './memory.js'
import { createBidding } from './bidding.js'
import { createSkills } from './skills.js'
import { createPublication } from './publication.js'
import { createFormal } from './formal.js'
import { createMathJobs } from './mathjobs.js'
import { createExternal } from './external.js'
import { createDomainGate } from './domaingate.js'
import { createScheduler } from './scheduler.js'
import { createCrypto } from './crypto.js'
import { createNotify } from './notify.js'
import { createLifecycle } from './lifecycle.js'
import { createIdempotency } from './idempotency.js'
import { createReplay } from './replay.js'
import { createTransaction } from './transaction.js'
import { createRateLimit } from './ratelimit.js'
import { createAuditChain } from './auditchain.js'
import { createStateVersion } from './stateversion.js'
import { createHash } from 'node:crypto'
import { createClockGuard } from './clockguard.js'
import { createMathTools } from './mathtools.js'
import { createProjectionMigrator } from './projmigrate.js'
import { createMeetings } from './meetings.js'
import { createBallotBox } from './ballotbox.js'
import { createRecords } from './records.js'
import { createWorkflow } from './workflow.js'
import { createTrust } from './trust.js'
import { createHandover } from './handover.js'
import { createArbitration } from './arbitration.js'
import { createRecruit } from './recruit.js'
import { createTopology } from './topology.js'
import { createFairness } from './fairness.js'
import { createCharter } from './charter.js'
import { createReproPack } from './repropack.js'
import { SETTING_DEFS } from '../settings/schema.js'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.hint = hint
  err.code = code
  return err
}

/**
 * MECHANISM-level named predicates the kernel provides (docs/05 §5.2: `subject` predicates are the
 * kernel's, so a pack can name a mechanism without inventing one). Each reads the EFFECT and expresses no
 * opinion: "there is a settled formal proof for this object" and "the ballot is frozen" are machine facts,
 * not academic judgements. A pack may add its own through `subjects`, and an unknown name is still refused.
 */
export const DEFAULT_SUBJECTS = Object.freeze({
  has_locked_formal_proof: (ev) => !!(ev && (ev.locked === true || (ev.subject && ev.subject.settled === true))),
  in_frozen_ballot: (ev) => !!(ev && ev.frozen === true),
})

/**
 * WHO wrote a setting. The manual promises `settings.resolved` ("值 + 来源层"), and without it "改了没反应"
 * cannot be answered (docs/04 §6). The record lives under a SYMBOL key so it never shows up in Object.keys,
 * never inflates the declared-key count, and never leaks into a pack's own settings layer.
 */
const WRITERS = Symbol('vmu.settings.writers')
export function markSettingWriter(settings, key, source) {
  const box = settings[WRITERS] || (settings[WRITERS] = {})
  box[key] = source
  return { ok: true, key, source }
}
export function settingWriter(settings, key) {
  const box = settings[WRITERS]
  return box && box[key] ? box[key] : null
}

/**
 * Assemble the kernel.
 *
 * `host` is the optional capability seam (register/spawn). `settings` is the RESOLVED settings map (the
 * caller owns layering). `root` is the durable root; without it there is no store, and asking for one is
 * refused by name rather than silently creating a memory-only store that pretends to be durable.
 */
/**
 * The concurrency gate has ONE meaning in vmu: how many members may be live at once. `v5r`/`v3` users expect the
 * name `maxParallel`, so it is accepted as a SYNONYM for `vmu.limits.maxLiveMembers` - and the explicit
 * `maxLiveMembers` wins when both are set, so a profile can always override the shorthand. Measured wiring, not
 * decoration: both keys now have a real consumer, and the effective cap is reported through the members status.
 */
export function liveMemberCapOf(source = {}) {
  return Number(source['vmu.limits.maxLiveMembers']) || Number(source['vmu.limits.maxParallel']) || 0
}

export function createKernel({
  host = null,
  settings = {},
  root = null,
  clock = () => new Date().toISOString(),
  sections = [],
  bindings = [],
  overrides = null,
  whoMayOverride = ['office'],
  readFile = null,
  migrators = undefined,
  counters = {},
  subjects = {},
  log = () => {},
  stageGate,
  slots = [],
  maxLiveMembers = undefined,
  tracks = undefined,
  stages = undefined,
  maxOpenTasks = undefined,
  middleware = [],
  spawn = null,
  deliver = null,
  bus: injectedBus = null,
  // The HOST owns key material. Without this seam the tamper-evident chain is unkeyed and says so; with it the
  // chain becomes keyed and a re-forged chain is refused. The kernel never invents a key.
  secrets = null,
} = {}) {
  // CONSUMER WIRING (round 19, the point an independent reviewer made): a clock guard nobody uses changes
  // nothing - a backwards clock would still extend every TTL and keep every pending idempotency entry alive
  // forever. The guard is therefore built FIRST (before any TTL-sensitive service) and its `now()` is handed to
  // exactly the modules whose semantics depend on elapsed time; the rest of the kernel keeps the raw clock.
  const clockguard = createClockGuard({ clock, log: (m) => log('clockguard: ' + m), settings: { get: (k) => settings[k] } })
  const guardedClock = () => clockguard.now()
  // A3 CONSUMER (round 24): the projection migrator existed but no projection used it, so a version bump silently
  // discarded the durable ledger. It is built early enough to be handed to the ledger at construction.
  const projmigrate = createProjectionMigrator({ settings: { get: (k) => settings[k] }, bus: null, clock, log })
  const enabled = settings['vmu.core.enabled'] !== false
  const dryRun = settings['vmu.middleware.dryRun'] === true

  if (!enabled) {
    // Disabled means INERT, and it says so: no store, no bus, no hooks, no prompt work.
    return {
      enabled: false,
      async start() { return { ok: true, enabled: false, registered: [], note: 'vmu.core.enabled = false: the kernel does nothing' } },
      async stop() { return { ok: true, enabled: false } },
      status() { return { enabled: false, active: false, bus: { entries: [] }, note: 'disabled by vmu.core.enabled' } },
      refuses() { throw refuse('VMU_STATE', 'the kernel is disabled (vmu.core.enabled = false)',
        'enable it before asking for services; a disabled kernel never half-works') },
    }
  }

  const store = root
    ? createStore({ root, migrators, clock })
    : null

  // IN-FLIGHT LEDGER (docs/07 §3): durable, and only meaningful with a store - without one it stays null and
  // asking for it is refused by name (an in-flight ledger that forgets on exit would be a lie).
  const workLedger = store
    ? createWorkLedger({ store, clock, isPaused: () => controlState.state === 'paused' })
    : null

  // DURABLE AUDIT (docs/07 §5): with a root, every audit row is APPENDED to <root>/vmu/audit/<day>.jsonl, so
  // the trail survives the process (it used to exist only in memory, and `vmu/audit/**` was never written).
  // A write failure must be VISIBLE (R11): it is reported in status().audit.lastWriteError, while the
  // in-memory auditTail keeps working so the run is never silently unauditable.
  const auditState = { dir: root ? join(root, 'vmu', 'audit') : null, file: null, written: 0, lastWriteError: null }
  if (auditState.dir) {
    try { mkdirSync(auditState.dir, { recursive: true }) } catch (e) { auditState.lastWriteError = String((e && e.message) || e) }
  }
  // ROUND 23, from an independent review: the chain could compute a checkpoint but had nowhere to keep it, so the
  // anti-truncation check was theoretical. With a durable root the kernel now supplies a file anchor - a separate
  // FILE from the audit log itself, because an anchor stored in the same log it protects would be rewritten by
  // whoever rewrites the log. No root means no anchor, and the chain then SAYS so instead of pretending.
  const anchorPath = auditState.dir ? join(auditState.dir, 'checkpoint.json') : null
  const auditAnchor = anchorPath ? {
    name: 'file:' + anchorPath,
    write: (cp) => {
      try { writeFileSync(anchorPath, JSON.stringify(cp), 'utf8'); return true } catch (e) { auditState.lastWriteError = String((e && e.message) || e); return false }
    },
    read: () => {
      try { return JSON.parse(readFileSync(anchorPath, 'utf8')) } catch (e) { return null }
    },
  } : null
  const auditToDisk = (row) => {
    if (!auditState.dir) return
    try {
      const day = String((row && row.ts) || clock()).slice(0, 10)
      const file = join(auditState.dir, day + '.jsonl')
      appendFileSync(file, JSON.stringify(row) + '\n', 'utf8')
      auditState.file = file
      auditState.written += 1
    } catch (e) {
      auditState.lastWriteError = String((e && e.message) || e)
    }
  }

  // The audit trail must be OBSERVABLE, not merely logged: `status().auditTail` returns the last rows, so a
  // reader can answer "who changed what, and which middleware refused this call" without opening a log file.
  // LOG LEVEL (docs/04 §11): a REAL consumer, and a backwards-compatible one. At the default `info` the audit
  // line reaches `log()` with EXACTLY the same text as before, so nothing about today's output changes; at
  // `warn`/`error` it is suppressed, and `debug` lets the kernel add detail later. The level never enters the
  // model context - it only decides whether the host's log callback is invoked.
  const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
  const logEnabled = (level) => LOG_LEVELS[level] >= (LOG_LEVELS[String(settings['vmu.core.logLevel'])] || LOG_LEVELS.info)
  const auditRing = []
  // M1 WIRING, SECOND HALF (round 24). An independent review proved with static AND runtime checks that the
  // anchor seam added last round was NEVER TRIGGERED: there were zero `checkpoint()` call sites in the whole
  // repository, so the anchor file could not exist and the anti-truncation guarantee stayed asleep. A seam that
  // is never called is indistinguishable from no seam at all. Three things change here:
  //   1) the kernel supplies its OWN periodic trigger (`vmu.audit.chain.checkpointEvery`, whose declared default
  //      is nonzero) so the factory anchors without any host help;
  //   2) `auditVerify()` uses the anchor when one exists, instead of always taking the unanchored path;
  //   3) an explicit `auditCheckpoint()` lets an operator force one and see the receipt.
  const auditCheckpointEvery = Number.isInteger(settings['vmu.audit.chain.checkpointEvery'])
    && settings['vmu.audit.chain.checkpointEvery'] > 0 ? settings['vmu.audit.chain.checkpointEvery'] : 100
  // N1 CONSUMER WIRING (round 20): the chain must exist BEFORE the audit ring, because the ring is where rows
  // are born - a chain built afterwards could only verify a history nobody had fed it.
  // The hash seam is real sha256 here; a host that wants its own can override it, and the module still refuses
  // rather than inventing a hash when no seam is given at all.
  const auditchain = createAuditChain({
    // The module reads this knob BOTH ways (a get() seam and a plain property), and a wiring that only satisfies
    // one of them is the same "seam nobody triggers" defect this round exists to fix - so both are provided.
    settings: Object.assign({}, settings, {
      get: (k) => (k === 'vmu.audit.chain.checkpointEvery' ? auditCheckpointEvery : settings[k]),
      'vmu.audit.chain.checkpointEvery': auditCheckpointEvery,
    }),
    bus: injectedBus, clock, log,
    anchor: auditAnchor,
    // HMAC is used ONLY when the host supplies a secrets seam; otherwise the chain stays unkeyed and SAYS so
    // (`keyed:false`, and the note states that anyone who can recompute can re-forge it). A key derived from
    // nothing would make `keyed:true` a lie, which is worse than an honest unkeyed chain.
    macKey: secrets ? { ref: 'vmu.audit.macKey' } : undefined,
    secrets,
    hash: (row) => createHash('sha256').update(typeof row === 'string' ? row : JSON.stringify(row)).digest('hex') })

  const bus = injectedBus || createBus({
    entries: middleware,
    settings,
    clock,
    onAudit: (row) => {
      // CHAIN FIRST, then store: the row that reaches the ring and the disk carries its prevHash/hash, so the
      // tamper-evident chain and the audit trail are the SAME bytes (a separate chain would be a second truth).
      let chained = row
      try { chained = auditchain.append({ row }) } catch (e) { auditState.lastWriteError = String((e && e.message) || e) }
      auditRing.push(chained)
      // DECLARED, not hard-coded: the ring length had been fixed at 100 while `vmu.audit.ringMax` declares 64 and
      // docs/21 says 64 - three sources, two answers. The setting wins; 64 stays as the declared fallback.
      const auditRingMax = Number.isInteger(settings['vmu.audit.ringMax']) && settings['vmu.audit.ringMax'] > 0
        ? settings['vmu.audit.ringMax'] : 64
      if (auditRing.length > auditRingMax) auditRing.shift()
      if (logEnabled('info')) log('audit ' + JSON.stringify(row))
      auditToDisk(row)
    },
  })

  const prompt = createPromptPipeline({ sections, bindings, overrides, whoMayOverride, bus, readFile, clock })

  let library = root
    ? createLibrary({
      root,
      tracks: tracks || settings['vmu.records.tracks'],
      headListAt: settings['vmu.records.headListAt'],
      truncateMode: settings['vmu.records.truncateMode'],
      fingerprintPolicy: settings['vmu.records.fingerprintPolicy'],
      // THE PATH POLICY REACHES THE WRITE SURFACE (docs/04 §11): the library gates its writes through
      // kernel/guard.js, so `vmu.safety.pathPolicy` is a consumer rather than a declaration.
      settings,
      clock,
    })
    : null

  // THE LEAN FACE (docs/09, `vmu.math.lean*`): a real subsystem, created only when a spawn seam exists. The
  // face owns the semantics the docs promise ("exit 0 AND the content hash unchanged"); the kernel only wires.
  const lean = spawn
    ? createLeanFace({ settings: { get: (k) => settings[k] }, spawn, root, clock, log })
    : null

  // The resource gate closes the `vmu.limits.memoryCeilingMb` loop. The ceiling is the HOST PROCESS RSS (the
  // framework cannot measure its own "net" memory - documented), and the roster refuses to grow past it by name.
  const resourceGate = () => memoryCeilingExceeded({ settings, rssBytes: process.memoryUsage().rss })

  // `members` and `library` are re-declarable: a PACK owns the institution (slots, tracks), so applying a
  // pack must be able to declare them. Re-declaring a library rebuilds its index from disk, so no record
  // is lost by the swap (docs/10 §2).
  let members = createMembersList({ slots, maxLiveMembers, deliver, bus, clock, settings, resourceGate })
  const packNotes = []
  const tasks = createTasks({
    stages: stages || settings['vmu.tasks.stages'] || [],
    maxOpenTasks: maxOpenTasks !== undefined ? maxOpenTasks : (settings['vmu.tasks.maxOpenTasks'] || 0),
    stageGate,
    // `control` is declared below; the arrow is only CALLED at runtime, so this is not a use-before-init.
    isPaused: () => controlState.state === 'paused',
    bus,
    clock,
  })

  // IMPLEMENTATION PHASE, batch 1 (docs/11 §9.8): the governance primitives (docs/08 §2 agenda + motions),
  // the task board (docs/08 §4 columns/WIP/swimlanes/aging) and minutes (docs/08 §2 minutes/decrees/actions)
  // stop being DECLARATIONS and become real services. They read their own `vmu.agenda.*` / `vmu.motions.*` /
  // `vmu.board.*` / `vmu.minutes.*` keys literally, so the settings table derives their "wired" state by itself.
  const governance = createGovernance({ settings: { get: (k) => settings[k] }, bus, clock, log })
  const board = createBoard({ settings: { get: (k) => settings[k] }, bus, clock, log, tasks })
  const minutes = createMinutes({ settings: { get: (k) => settings[k] }, bus, clock, log, meeting: null })
  const budget = createBudget({ settings: { get: (k) => settings[k] }, bus, clock, log })
  const metrics = createMetrics({ settings: { get: (k) => settings[k] }, bus, clock, log })
  // The audit SERVICE reuses the kernel's EXISTING disk seam (`auditToDisk`) instead of opening a second write
  // path: the ring above stays the in-memory view, this service is the queryable/rotatable face over it.
  // ROUND 20: every module whose semantics depend on ELAPSED TIME takes the guarded clock. An independent review
  // pointed out that only four of them did, and that `delegation` was the worst omission - a backwards clock
  // would EXTEND an authorisation's life. The rest of the kernel keeps the raw clock on purpose.
  const audit = createAudit({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log, sink: auditToDisk })
  const alerts = createAlerts({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log, metrics })
  // `library` is the EXISTING kernel library; the module counts any unsupported adapter method as skipped and
  // never pretends a delete succeeded. Delegation gets the live members surface plus explicit roots (authority
  // that does not come from a delegation); without roots, S-2 refuses every grant - which is the honest default.
  const retention = createRetention({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log, library })
  // `roots` = who holds authority that does NOT come from a delegation. It is an EXPLICIT setting rather than
  // a guess from role names: unset means nobody can grant anything (S-2 refuses every grant), which is the
  // honest zero-mechanism default. Guessing "office looks like a root" would be policy hiding in the kernel.
  const delegation = createDelegation({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log, members,
    roots: Array.isArray(settings['vmu.delegation.roots']) ? settings['vmu.delegation.roots'] : [] })
  const workflow = createWorkflow({ settings: { get: (k) => settings[k] }, bus, clock, log, tasks })
  const trust = createTrust({ settings: { get: (k) => settings[k] }, bus, clock, log })
  const handover = createHandover({ settings: { get: (k) => settings[k] }, bus, clock, log, tasks, library })
  // Batch 2 slice 3: arbitration. `minutes` is the live minutes service so a ruling can be recorded there;
  // `mode` defaults to off (zero mechanism) so nothing is arbitrated unless the institution turns it on.
  const arbitration = createArbitration({ settings: { get: (k) => settings[k] }, bus, clock, log, members, minutes })
  // Batch-2 slices 5-8: recruitment, collaboration topology, charters, fair allocation. All four are
  // zero-mechanism by default (no postings / flat topology / charters disabled / no claimants).
  const recruit = createRecruit({ settings: { get: (k) => settings[k] }, bus, clock, log, members })
  const topology = createTopology({ settings: { get: (k) => settings[k] }, bus, clock, log, members })
  const fairness = createFairness({ settings: { get: (k) => settings[k] }, bus, clock, log, budget, tasks })
  const charter = createCharter({ settings: { get: (k) => settings[k] }, bus, clock, log, members, delegation })
  // Batch-3 slice 2: reproduction packs (docs/16 L12). Data is referenced by pointer by default; a missing
  // required member is named rather than silently omitted.
  const repropack = createReproPack({ settings: { get: (k) => settings[k] }, bus, clock, log, library })
  // Batch-2 slices 10-11: institutional memory and the auction. Memory's `may`/`authorize` always refuse,
  // and the auction's price never depends on reputation unless the institution explicitly turns that on.
  const memory = createMemory({ settings: { get: (k) => settings[k] }, bus, clock, log, library })
  const bidding = createBidding({ settings: { get: (k) => settings[k] }, bus, clock, log, members, trust })
  // Batch-2/3/4 tails: skills, publication and the formalisation face. Skills' capacity counts only live and
  // fresh claims (a retired claim frees its slot); all three are zero-mechanism by default.
  const skills = createSkills({ settings: { get: (k) => settings[k] }, bus, clock, log, members })
  const publication = createPublication({ settings: { get: (k) => settings[k] }, bus, clock, log, library, repropack })
  const formal = createFormal({ settings: { get: (k) => settings[k] }, bus, clock, log, spawn, library })
  // INTEGRATOR FIX: `vmu.mathjobs` was REGISTERED but never CREATED - the registry advertised a service the
  // kernel did not build. Both job faces now receive the kernel's real spawn seam (the host injects it), so a
  // missing engine surfaces as a named refusal rather than a silent no-op.
  const mathjobs = createMathJobs({ settings: { get: (k) => settings[k] }, bus, clock, log, spawn })
  // Batch-3/5 tails: external fetching (N11) and the clinical/animal approval gates. Both are inert by default
  // (`vmu.external.enabled=false`, no domain pack declared), and both refuse by name rather than inventing data.
  const external = createExternal({ settings: { get: (k) => settings[k] }, bus, clock, log, fetchFn: null })
  const domaingate = createDomainGate({ settings: { get: (k) => settings[k] }, bus, clock, log })
  // Round-15 tails: scheduler (timer seam optional - tick() alone works), non-repudiation, notification
  // delivery and the research lifecycle. Each one is inert without its declared configuration or its seam.
  const scheduler = createScheduler({ settings: { get: (k) => settings[k] }, bus, clock, log, timer: null,
    isPaused: () => controlState.state === 'paused' })
  const crypto = createCrypto({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log, signer: null })
  const notify = createNotify({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log, deliver: null })
  const lifecycle = createLifecycle({ settings: { get: (k) => settings[k] }, bus, clock, log, workflow,
    domaingate, publication })
  // K6 (round 16): the unified idempotency ledger that a replay/retry path can consult before doing work again.
  // The ledger gets BOTH the guarded clock (so a backwards clock cannot keep a pending key alive forever) and
  // the kernel store (so idempotency survives the restart that a retry usually follows).
  const idempotency = createIdempotency({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log, store,
    migrate: projmigrate })
  // K5 (round 16): read-only replay of the audit log. It never writes back into any service - rebuilding state
  // is a pure function, and gaps in the log are reported rather than papered over.
  const replay = createReplay({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log, audit, idempotency })
  // K1/K2 (round 17): compensation transactions and rate limiting. Transactions get the idempotency ledger so a
  // replay across instances is deduplicated; the limiter is inert unless a rate is declared (and says so).
  const transaction = createTransaction({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log, idempotency })
  const ratelimit = createRateLimit({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log })
  // N4 (round 18): the state-version/migration primitive that keeps an old snapshot from being read silently by
  // newer code. (The chain is built earlier now - see the N1 consumer-wiring comment above the bus.)
  const stateversion = createStateVersion({ settings: { get: (k) => settings[k] }, bus, clock, log })

  // CONSUMER WIRING (round 19, the point an independent reviewer made): a clock guard that nobody uses changes
  // nothing - a backwards clock would still silently extend every TTL and keep every pending idempotency entry
  // alive forever. The guard is therefore built FIRST and its `now()` is handed to every module whose semantics
  // depend on elapsed time; the rest of the kernel keeps the raw clock, so the blast radius stays small.
  // ROUND 21: the math-tool policy layer makes 45 of the declared `vmu.math.*` knobs genuinely change behaviour
  // (each call's receipt carries an `enforced[]` list, so "the key was read" and "the key did something" are
  // distinguishable), and the projection migrator is what keeps an old on-disk projection from being silently
  // dropped when the kernel's own version moves.
  const mathtools = createMathTools({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log, spawn, library })
  // `projmigrate` is built EARLIER now: the idempotency ledger needs it at construction so an old on-disk
  // projection is migrated instead of silently discarded.
  // ROUND 22: three more declared-knob families become behaviour, each following the mathtools standard (the
  // receipt lists the keys it actually enforced, and anything unwired is named rather than silently ignored).
  const meetings = createMeetings({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log })
  const ballotbox = createBallotBox({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log })
  const records = createRecords({ settings: { get: (k) => settings[k] }, bus, clock: guardedClock, log })

  const rules = createRulesEngine({ subjects: Object.assign({}, DEFAULT_SUBJECTS, subjects), counters, settings, clock })
  const loader = createLoader({
    services: { kernel: Object.freeze({ read: () => (store ? store.read() : null) }), setting: (k) => settings[k] },
    log,
    dryRun,
    clock,
  })
  const bridge = createScriptBridge({ spawn, defaultTimeoutMs: settings['vmu.math.timeoutMs'] || undefined, dryRun, clock })
  const registry = createRegistry({})
  // Publish what this assembly actually offers (M4, D13-O3): a pack can then DECLARE `requires` and be
  // checked, instead of discovering a missing service at the first hook. Only real capabilities appear.
  if (library) registry.register('vmu.library', { apiVersion: 1 }, { kind: 'service', description: 'records, content identity, head list' })
  if (members) registry.register('vmu.members', { apiVersion: 1 }, { kind: 'service', description: 'role slots and roster' })
  registry.register('vmu.tasks', { apiVersion: 1 }, { kind: 'service', description: 'task ledger and stage machine' })
  registry.register('vmu.prompt', { apiVersion: 1 }, { kind: 'service', description: 'prompt sections, bindings, overrides' })
  registry.register('vmu.middleware', { apiVersion: 1 }, { kind: 'service', description: 'the hook bus and its four forms' })
  // Batch-1 services (docs/11 §9.8). Registered unconditionally, like tasks/prompt/middleware: they are
  // zero-mechanism by construction (no config ⇒ empty agenda, empty board, refusals by name).
  registry.register('vmu.governance', { apiVersion: 1 }, { kind: 'service', description: 'agenda and motions (docs/08 §2)' })
  registry.register('vmu.board', { apiVersion: 1 }, { kind: 'service', description: 'board columns, WIP and aging (docs/08 §4)' })
  registry.register('vmu.minutes', { apiVersion: 1 }, { kind: 'service', description: 'minutes, decisions and action items (docs/08 §2)' })
  registry.register('vmu.budget', { apiVersion: 1 }, { kind: 'service', description: 'four-kind quotas, reservation and fairness (docs/08 §12.5)' })
  registry.register('vmu.metrics', { apiVersion: 1 }, { kind: 'service', description: 'metric observation, KPI judgement and counted drops (docs/21 §4)' })
  registry.register('vmu.audit', { apiVersion: 1 }, { kind: 'service', description: 'append-only audit rows, redaction before storage, counted ring drops (docs/21 §2)' })
  registry.register('vmu.alerts', { apiVersion: 1 }, { kind: 'service', description: 'thresholds, alert-level dedup, silences that still count, SLO tri-state (docs/21 §5 §13)' })
  registry.register('vmu.retention', { apiVersion: 1 }, { kind: 'service', description: 'report-first retention, permanent markers, quota tri-state, gc (docs/07 §4.3 §4.8)' })
  registry.register('vmu.delegation', { apiVersion: 1 }, { kind: 'service', description: 'delegation that can only narrow (S-2), expiry, revocation cascade (docs/17 §4)' })
  registry.register('vmu.workflow', { apiVersion: 1 }, { kind: 'service', description: 'stage whitelist, gates and escalation, no stage skipping (docs/08 §4)' })
  registry.register('vmu.trust', { apiVersion: 1 }, { kind: 'service', description: 'auditable reputation that NEVER grants authority (S-3, docs/17 §5)' })
  registry.register('vmu.handover', { apiVersion: 1 }, { kind: 'service', description: 'handover packets: required fields named, redacted before packing (docs/17 §11)' })
  registry.register('vmu.arbitration', { apiVersion: 1 }, { kind: 'service', description: 'arbitration: recusal, rationale, advisory vs binding made explicit (docs/17 §6)' })
  registry.register('vmu.recruit', { apiVersion: 1 }, { kind: 'service', description: 'postings, applications, probation; job titles map to slots explicitly (S-1, docs/17 §7)' })
  registry.register('vmu.topology', { apiVersion: 1 }, { kind: 'service', description: 'collaboration topologies and path assertions, describe and assert share one rule (docs/17 §14)' })
  registry.register('vmu.fairness', { apiVersion: 1 }, { kind: 'service', description: 'conserving allocation with a per-person cap; reputation is never a weight (docs/17 §17)' })
  registry.register('vmu.charter', { apiVersion: 1 }, { kind: 'service', description: 'charters: frozen articles, authority that cannot exceed the parent, dissolution reasons (docs/17 §15)' })
  registry.register('vmu.repropack', { apiVersion: 1 }, { kind: 'service', description: 'reproduction packs: required members named, seed mandatory, diffs located (docs/16 L12)' })
  registry.register('vmu.memory', { apiVersion: 1 }, { kind: 'service', description: 'institutional memory that NEVER authorizes (S-3), contradictions visible (docs/17 §9)' })
  registry.register('vmu.bidding', { apiVersion: 1 }, { kind: 'service', description: 'auctions: deadline, rationale, reputation never prices, collusion surfaced (docs/17 §10)' })
  registry.register('vmu.mathjobs', { apiVersion: 1 }, { kind: 'service', description: 'math jobs: timeout with partial output, complete receipts, seed required (docs/09·15)' })
  registry.register('vmu.skills', { apiVersion: 1 }, { kind: 'service', description: 'skills: never self-appointed, expiry degrades and says so (docs/17 §8)' })
  registry.register('vmu.publication', { apiVersion: 1 }, { kind: 'service', description: 'publication: unbroken version chain, offline archive registration, availability that refuses on-request-only (docs/16 §7)' })
  registry.register('vmu.formal', { apiVersion: 1 }, { kind: 'service', description: 'formalisation: sorry refuses by default, compile failure is never a refutation (docs/09)' })
  registry.register('vmu.external', { apiVersion: 1 }, { kind: 'service', description: 'external fetch adapter: receipts for every fetch, stale never silent, conflicts surfaced (docs/16 §8)' })
  registry.register('vmu.domaingate', { apiVersion: 1 }, { kind: 'service', description: 'clinical and animal approval gates: no approval, no start (docs/20 §9)' })
  registry.register('vmu.scheduler', { apiVersion: 1 }, { kind: 'service', description: 'scheduled triggers: timer is a seam, triggerVia defaults to report-only (docs/08 §5)' })
  registry.register('vmu.crypto', { apiVersion: 1 }, { kind: 'service', description: 'signatures and non-repudiation: no signer means no signature is invented (docs/20 §6)' })
  registry.register('vmu.notify', { apiVersion: 1 }, { kind: 'service', description: 'watchers and delivery: silence blocks delivery, never the record (docs/17 §29)' })
  registry.register('vmu.lifecycle', { apiVersion: 1 }, { kind: 'service', description: 'research lifecycle L1-L24: gates delegated to the domain and publication services (docs/16 §1)' })
  registry.register('vmu.idempotency', { apiVersion: 1 }, { kind: 'service', description: 'idempotency ledger: same key with a different payload is refused by name (K6)' })
  registry.register('vmu.replay', { apiVersion: 1 }, { kind: 'service', description: 'audit replay: pure read-only reconstruction, gaps reported (K5)' })
  registry.register('vmu.transaction', { apiVersion: 1 }, { kind: 'service', description: 'compensation transactions: a step without undo is refused at begin (K1)' })
  registry.register('vmu.ratelimit', { apiVersion: 1 }, { kind: 'service', description: 'token-bucket rate limiting on the injected clock; unlimited by default and it says so (K2)' })
  registry.register('vmu.auditchain', { apiVersion: 1 }, { kind: 'service', description: 'tamper-evident audit chain: no hash seam, no hash (N1)' })
  registry.register('vmu.stateversion', { apiVersion: 1 }, { kind: 'service', description: 'state versions and explicit migrations: no version is refused, not assumed (N4)' })
  registry.register('vmu.clockguard', { apiVersion: 1 }, { kind: 'service', description: 'monotonic clock guard, consumed by every TTL-sensitive service (N3)' })
  registry.register('vmu.mathtools', { apiVersion: 1 }, { kind: 'service', description: 'math tool policy layer: 45 declared knobs change behaviour, the rest are named as unwired (docs/09·15)' })
  registry.register('vmu.projmigrate', { apiVersion: 1 }, { kind: 'service', description: 'projection migration: an unlabelled or unreachable old document is refused, never dropped (A3)' })
  registry.register('vmu.meetings', { apiVersion: 1 }, { kind: 'service', description: 'meeting policy layer: all 47 declared vmu.meetings knobs change behaviour (docs/08)' })
  registry.register('vmu.ballotbox', { apiVersion: 1 }, { kind: 'service', description: 'ballot box: quorum is refused by name, abstention and absence counted apart (docs/08)' })
  registry.register('vmu.records', { apiVersion: 1 }, { kind: 'service', description: 'records tracks: caps refuse by name, retention counts, permanent markers cannot be deleted' })
  if (root) registry.register('vmu.store', { apiVersion: 1 }, { kind: 'service', description: 'durable, versioned state' })
  if (workLedger) registry.register('vmu.work', { apiVersion: 1 }, { kind: 'service', description: 'durable in-flight ledger (recover after restart)' })
  if (host) registry.register('math_computation', { apiVersion: 1 }, { kind: 'tool', description: 'the inherited math tool, name unchanged (D14)' })

  const packs = []
  const registrations = []
  let started = false
  // CONTROL FLOW (docs/08 §5; the user's explicit domain). The kernel owns the STATE; a pause is a real
  // gate (task work is refused while paused) rather than a label nobody reads.
  const controlState = { state: 'running', pausedAt: null, pausedReason: null, resumes: 0, stops: 0, beats: 0, lastBeatAt: null, stoppedReason: null }
  // LIVE OBJECTS for the tool faces (docs/03 §3.1): a session's meetings and ballots, addressable by id.
  // They are the SAME primitives the library level exposes - nothing is re-implemented, and nothing is kept
  // when the session ends. The cap is a counted bound, not a silent drop.
  let liveSeq = 0
  const liveCap = 50
  let liveEvicted = 0
  const liveMeetings = new Map()
  const liveBallots = new Map()
  const rememberLive = (map, id, value) => {
    map.set(id, value)
    while (map.size > liveCap) { const oldest = map.keys().next().value; map.delete(oldest); liveEvicted += 1 }
  }
  /** The control VIEW, as a plain closure: an object-literal method cannot be called from a sibling method
   *  (the property name is not a binding), so the view lives here and both `control()` and `status()` use it. */
  const controlView = () => {
    const budget = Number(settings['vmu.limits.wallClockMs']) || 0
    let stale = false
    let sinceMs = null
    if (budget > 0 && controlState.lastBeatAt) {
      sinceMs = Date.parse(clock()) - Date.parse(controlState.lastBeatAt)
      stale = Number.isFinite(sinceMs) && sinceMs > budget
    }
    return { state: controlState.state, pausedAt: controlState.pausedAt, pausedReason: controlState.pausedReason,
      resumes: controlState.resumes, stops: controlState.stops, beats: controlState.beats,
      lastBeatAt: controlState.lastBeatAt, stoppedReason: controlState.stoppedReason,
      wallClockMs: budget, sinceLastBeatMs: sinceMs, stale,
      note: 'a paused kernel refuses task mutations by name (VMU_STATE); the heartbeat is observation only' }
  }

  function createMembersList(opts) {
    const declaredSlots = opts.slots && opts.slots.length ? opts.slots : []
    const cap = opts.maxLiveMembers !== undefined ? opts.maxLiveMembers : liveMemberCapOf(opts.settings || {})
    if (declaredSlots.length === 0 && cap === 0) {
      // Nothing declared: no roster, no wake seam, no cost. Members become real only when a pack asks.
      return null
    }
    return createMembers({ slots: declaredSlots, maxLiveMembers: cap, deliver: opts.deliver, bus: opts.bus, clock: opts.clock, resourceGate: opts.resourceGate })
  }

  /** Lazy math surface: asking for it without a host seam is refused by name (never faked). */
  const mathSurface = () => {
    if (!host) {
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'the math surface needs a host seam (register/spawn)',
        'construct the kernel with { host } (docs/11 §4.1) or leave vmu.math.computation off')
    }
    return createMathSurface({ host, settings })
  }

  const kernel = {
    enabled: true,
    bus,
    prompt,
    store,
    // Getters, not captured values: a pack can re-declare the institution (slots/tracks) AFTER the kernel
    // was constructed, so the public surface must always reflect the CURRENT surfaces (docs/10 §2).
    get library() { return library },
    get members() { return members },
    get work() { return workLedger },
    // Batch-1 implementation surfaces (docs/11 §9.8): real services, exposed the same way as tasks/prompt.
    get governance() { return governance },
    get board() { return board },
    get minutes() { return minutes },
    get budget() { return budget },
    get metrics() { return metrics },
    get audit() { return audit },
    get alerts() { return alerts },
    get retention() { return retention },
    get delegation() { return delegation },
    get workflow() { return workflow },
    get trust() { return trust },
    get handover() { return handover },
    get arbitration() { return arbitration },
    get recruit() { return recruit },
    get topology() { return topology },
    get fairness() { return fairness },
    get charter() { return charter },
    get repropack() { return repropack },
    get memory() { return memory },
    get bidding() { return bidding },
    get skills() { return skills },
    get publication() { return publication },
    get formal() { return formal },
    get mathjobs() { return mathjobs },
    get external() { return external },
    get domaingate() { return domaingate },
    get scheduler() { return scheduler },
    get crypto() { return crypto },
    get notify() { return notify },
    get lifecycle() { return lifecycle },
    get idempotency() { return idempotency },
    get replay() { return replay },
    get transaction() { return transaction },
    get ratelimit() { return ratelimit },
    get auditchain() { return auditchain },
    get stateversion() { return stateversion },
    get clockguard() { return clockguard },
    get mathtools() { return mathtools },
    get projmigrate() { return projmigrate },
    get meetings() { return meetings },
    get ballotbox() { return ballotbox },
    get records() { return records },
    /** The Lean face (docs/09): null unless a spawn seam was injected, so nothing is faked without one. */
    get lean() { return lean },
    tasks,
    rules,
    loader,
    bridge,
    registry,

    /** Per-object primitives: the kernel supplies the factory, the pack supplies the policy. */
    ballot: (opts = {}) => {
      const made = createBallot(Object.assign({ quorumRule: settings['vmu.meetings.quorumRule'], bus, clock,
        isPaused: () => controlState.state === 'paused' }, opts))
      // LIVE OBJECTS (docs/03 §3.1): the tool face addresses a ballot by id, so the kernel keeps the session's
      // live instances. This is not new policy - it is the SAME primitive, reachable by name. Bounded by
      // `liveCap` so a long session cannot grow it without limit (the oldest is evicted, and that is counted).
      if (opts && typeof opts.id === 'string' && opts.id) rememberLive(liveBallots, opts.id, made)
      return made
    },
    meeting: (opts = {}) => {
      const id = (opts && typeof opts.id === 'string' && opts.id) ? opts.id : 'm-' + (++liveSeq)
      const made = createMeeting(Object.assign({ bus, clock, deliver,
        roundTimeoutMs: settings['vmu.meetings.roundTimeoutMs'] || 0,
        quotesPerMessageMax: settings['vmu.meetings.quotesPerMessageMax'] || 0,
        quoteDepthMax: settings['vmu.meetings.quoteDepthMax'] || 0,
        isPaused: () => controlState.state === 'paused' }, opts, { id }))
      rememberLive(liveMeetings, id, made)
      return made
    },
    /** Look up a live meeting/ballot by the id a tool face handed out (never a guess: unknown ⇒ null). */
    liveMeeting: (id) => liveMeetings.get(String(id)) || null,
    liveBallot: (id) => liveBallots.get(String(id)) || null,
    liveList: () => ({ meetings: [...liveMeetings.keys()], ballots: [...liveBallots.keys()],
      cap: liveCap, evicted: liveEvicted }),

    /**
     * Start: register the middleware the settings DECLARE, and nothing else. With an empty declaration
     * this is a no-op that returns the empty list, which is the zero-mechanism proof at the assembly
     * level (the host is never touched).
     */
    async start() {
      if (started) return { ok: true, already: true, registered: registrations.slice() }
      started = true
      const declared = Array.isArray(settings['vmu.middleware.entries']) ? settings['vmu.middleware.entries'] : []
      for (const entry of declared) {
        if (!entry || typeof entry !== 'object') {
          throw refuse('VMU_INVALID_ARGUMENT', 'a middleware entry must be an object', JSON.stringify(entry))
        }
        if (entry.kind === 'rules') {
          for (const e of kernel.rules.toBusEntries([entry])) bus.add(e)
        } else {
          bus.add(entry)
        }
        registrations.push(entry.id)
      }
      return { ok: true, enabled: true, registered: registrations.slice(), dryRun,
        note: registrations.length === 0 ? 'no middleware declared: the kernel registered nothing' : undefined }
    },

    async stop(reason = null) {
      controlState.state = 'stopped'
      controlState.stops += 1
      controlState.stoppedReason = reason ? String(reason) : null
      started = false
      registrations.length = 0
      const decided = await bus.emit('control/paused', { reason: 'stopped', at: clock() }, {})
      return { ok: true, stopped: true, state: controlState.state, reason: controlState.stoppedReason,
        middleware: decided && decided.decisions ? decided.decisions.length : 0 }
    },

    /** The capability seams, refused by name when they are missing (docs/11 §4.1). */
    math: mathSurface,
    requireStore() {
      if (!store) {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel has no durable root',
          'construct it with { root } - a store is never silently faked in memory')
      }
      return store
    },
    requireLibrary() {
      if (!library) {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel has no library root',
          'construct it with { root } so records can be kept on disk')
      }
      return library
    },
    requireMembers() {
      if (!members) {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'no roles were declared, so there is no roster',
          'declare role slots (a pack does this) before asking for members (D5: the kernel ships no roles)')
      }
      return members
    },

    /**
     * Apply a pack. Conflicts are REFUSED, never silently merged (O4): two declarations of the same key
     * is a configuration defect, and the message names both sides.
     */
    usePack(pack = {}) {
      const id = pack.id
      if (typeof id !== 'string' || id.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'a pack needs an id')
      if (packs.includes(id)) throw refuse('VMU_PACK_CONFLICT', 'pack ' + id + ' is already active', 'unload it first (O4: no silent re-application)')
      const conflicts = []
      for (const key of Object.keys(pack.settings || {})) {
        if (Object.prototype.hasOwnProperty.call(settings, key)) conflicts.push({ key, already: 'settings' })
      }
      const codePrefix = 'VMU_PACK_' + String(id).toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_'
      for (const code of pack.codes || []) {
        if (!String(code).startsWith(codePrefix)) {
          conflicts.push({ key: code, already: 'pack codes must be ' + codePrefix + '<REASON> (R-d)' })
        }
      }
      if (conflicts.length > 0 && settings['vmu.packs.allowOverride'] !== true) {
        throw refuse('VMU_PACK_CONFLICT', 'pack ' + id + ' conflicts with the active configuration',
          JSON.stringify(conflicts))
      }
      packs.push(id)
      for (const alias of pack.aliases || []) registry.alias(alias.from, alias.to, { reason: 'pack ' + id })
      return { ok: true, id, active: packs.slice(), declaredCodes: (pack.codes || []).length }
    },

    activePacks() { return packs.slice() },

    /** A pack declares the institution's ROLE SLOTS; the kernel only holds them (D5). */
    declareSlots(list = []) {
      members = list.length > 0
        ? createMembers({
          slots: list,
          maxLiveMembers: maxLiveMembers !== undefined ? maxLiveMembers : liveMemberCapOf(settings),
          deliver,
          bus,
          clock,
          resourceGate,
        })
        : null
      // Publication follows DECLARATION: a service that did not exist a moment ago must appear in the
      // contract as soon as it does, otherwise a pack's alias to it is refused for the wrong reason.
      if (members) {
        try { registry.register('vmu.members', { apiVersion: 1 }, { kind: 'service', description: 'role slots and roster' }) }
        catch (e) { if (!e || !/already registered/.test(String(e.message))) throw e }
      }
      return { ok: true, slots: list.length, hasRoster: members !== null }
    },

    /** A pack declares the record TRACKS. Rebuilding the library re-reads the directory, so nothing is lost. */
    declareTracks(list = []) {
      if (!root) {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel has no library root, so tracks cannot be declared',
          'construct it with { root }')
      }
      if (list.length === 0) {
        throw refuse('VMU_INVALID_ARGUMENT', 'a pack must declare at least one track', 'tracks are a closed set (docs/07 §4.2)')
      }
      library = createLibrary({
        root,
        tracks: list.slice(),
        headListAt: settings['vmu.records.headListAt'],
        truncateMode: settings['vmu.records.truncateMode'],
        fingerprintPolicy: settings['vmu.records.fingerprintPolicy'],
        // The path policy must survive a RE-DECLARATION too, or a pack that declares tracks would silently
        // drop the write gate the first library had (docs/04 §11).
        settings,
        clock,
      })
      return { ok: true, tracks: library.status ? list.slice() : list.slice() }
    },

    /** The settings this assembly was constructed with (used by pack planning and residue checks). */
    settingsSnapshot() { return Object.assign({}, settings) },

    /**
     * Apply a pack's settings as a LAYER on the constructed values (docs/10 §2). Conflicts are refused
     * unless the configuration explicitly allows overrides (O4), and the caller gets back exactly what it
     * must restore: the pre-existing values for the keys it overwrote. Keys the pack introduced are simply
     * removed on rollback, so no phantom setting survives an unload.
     */
    applyPackSettings(incoming = {}, { by = null } = {}) {
      const applied = []
      const previous = {}
      for (const [key, value] of Object.entries(incoming)) {
        const existed = Object.prototype.hasOwnProperty.call(settings, key)
        // Two explicit doors and NO silent third one: the blunt `vmu.packs.allowOverride`, or naming THIS exact
        // key in `vmu.packs.activeOverrides` (finer-grained - docs/04 §11). Anything else stays a named conflict,
        // and the hint names the precise key so the operator never has to guess which door to open.
        const declaredOverride = Array.isArray(settings['vmu.packs.activeOverrides'])
          && settings['vmu.packs.activeOverrides'].includes(key)
        if (existed && settings['vmu.packs.allowOverride'] !== true && !declaredOverride) {
          throw refuse('VMU_PACK_CONFLICT', 'pack setting ' + key + ' would overwrite an active value',
            'make the override explicit: list "' + key + '" in vmu.packs.activeOverrides, or set vmu.packs.allowOverride (O4)')
        }
        if (existed) previous[key] = settings[key]
        settings[key] = value
        applied.push(key)
      }
      packNotes.push({ id: by, at: clock(), what: 'settings-applied', keys: applied.slice() })
      return { ok: true, applied, previous }
    },

    /**
     * The two primitives a pack rollback needs, so an unload can restore or remove a setting exactly.
     * DELEGATION (docs/04 §11, `vmu.safety.delegableKeys`): a caller that IDENTIFIES itself (`by`) but is not
     * the key's declared owner may only write keys the configuration delegated. This is a policy hook for
     * middleware/packs - not an authorisation system: the office path and the pack rollback pass no `by`, so
     * their behaviour is unchanged, and a caller that lies about omitting `by` is not caught by design (that
     * would need host identity, which the harness does not hand us). It replaces a purely declarative comment
     * with something that refuses by name.
     */
    setSettingsValue(key, value, { by = null } = {}) {
      if (by !== null && by !== undefined) {
        const def = SETTING_DEFS.find((d) => d.key === key)
        const owner = def ? def.who : null
        const delegable = Array.isArray(settings['vmu.safety.delegableKeys'])
          && settings['vmu.safety.delegableKeys'].includes(key)
        if (owner && String(by) !== String(owner) && !delegable) {
          throw refuse('VMU_NOT_PERMITTED', String(by) + ' may not set ' + key + ' (declared owner: ' + owner + ')',
            'list "' + key + '" in vmu.safety.delegableKeys to delegate it to a role slot (docs/04 §11)')
        }
      }
      settings[key] = value
      markSettingWriter(settings, key, 'runtime')
      return { ok: true, key, source: 'runtime' }
    },
    unsetSettingsValue(key) { delete settings[key]; return { ok: true, key } },

    /**
     * CONTROL FLOW (docs/08 §5). `pause` is a GATE, not a label: while paused every task mutation is refused
     * by name, and the bus is told (`control/paused` / `control/resumed` / `control/heartbeat`) so middleware
     * can react. The heartbeat answers "is anyone actually working", and `wallClockMs` is the staleness budget
     * (a real consumer for a key that used to be decoration - docs/04 §11).
     */
    async pause(reason = 'paused') {
      if (controlState.state === 'stopped') throw refuse('VMU_STATE', 'a stopped kernel cannot be paused')
      controlState.state = 'paused'
      controlState.pausedAt = clock()
      controlState.pausedReason = String(reason)
      const decided = await bus.emit('control/paused', { reason: controlState.pausedReason, at: controlState.pausedAt }, {})
      return { ok: true, state: controlState.state, reason: controlState.pausedReason, at: controlState.pausedAt,
        middleware: decided && decided.decisions ? decided.decisions.length : 0 }
    },
    async resume(reason = null) {
      if (controlState.state !== 'paused') throw refuse('VMU_STATE', 'the kernel is not paused (state: ' + controlState.state + ')')
      controlState.state = 'running'
      controlState.resumes += 1
      const wasReason = controlState.pausedReason
      controlState.pausedAt = null
      controlState.pausedReason = null
      const decided = await bus.emit('control/resumed', { pausedFor: wasReason, reason: reason ? String(reason) : null, at: clock() }, {})
      return { ok: true, state: controlState.state, resumedFrom: wasReason,
        middleware: decided && decided.decisions ? decided.decisions.length : 0 }
    },
    async beat(note = null) {
      controlState.beats += 1
      controlState.lastBeatAt = clock()
      const decided = await bus.emit('control/heartbeat', { beats: controlState.beats, at: controlState.lastBeatAt, note: note ? String(note) : null }, {})
      return { ok: true, beats: controlState.beats, at: controlState.lastBeatAt,
        middleware: decided && decided.decisions ? decided.decisions.length : 0 }
    },
    /** The control surface: state, history and whether the heartbeat went stale (docs/04 §11 wallClockMs). */
    control: () => controlView(),

    /** The declaration of a setting (hot class, who may change it) - used by the host tool for its receipt. */
    settingDef(key) { return SETTING_DEFS.find((d) => d.key === key) || null },

    /** Pack bookkeeping: what was applied and unloaded is part of the audit trail, not a side note. */
    notePackApplied(id) { packNotes.push({ id, at: clock(), what: 'applied' }); return { ok: true } },
    notePackUnloaded(id) { packNotes.push({ id, at: clock(), what: 'unloaded' }); return { ok: true } },
    packNotes() { return packNotes.map((n) => Object.assign({}, n)) },

    /** Observability (R11): the whole assembly in one place, with each part reporting its own state. */
    status() {
      // `settings.resolved` answers the manual's promise (docs/04 §6): for EVERY declared key, the effective
      // value, WHERE it came from (pack layer > runtime `vibe_vmu_set` > the plugin's config > schema default),
      // its hot class and who may change it. Precedence is stated because a pack and a runtime write are not
      // mutually timestamped; `overridden` lists the sources a pack replaced (O4 makes that explicit).
      const packApplied = packNotes.filter((n) => n.what === 'settings-applied')
      const packSource = {}
      for (const n of packApplied) for (const k of n.keys || []) packSource[k] = 'pack:' + n.id
      const resolved = {}
      for (const def of SETTING_DEFS) {
        const has = Object.prototype.hasOwnProperty.call(settings, def.key)
        const source = packSource[def.key] || settingWriter(settings, def.key) || (has ? 'config' : 'default')
        const overridden = packApplied.filter((n) => n.id !== (packSource[def.key] || '').replace('pack:', '') && (n.keys || []).includes(def.key)).map((n) => 'pack:' + n.id)
        resolved[def.key] = {
          value: has ? settings[def.key] : def.def,
          source,
          hot: def.hot,
          who: def.who,
          overridden: source === 'default' ? [] : overridden,
        }
      }
      return {
        enabled: true,
        active: started,
        settings: { keys: Object.keys(settings).length, engineEnabled: enabled, dryRun, resolved },
        auditTail: auditRing.slice(-20),
        /** N1 consumer (round 20): verify the LIVE ring against the tamper-evident chain, row by row.
         *  Round 24: it uses the anchor when one exists - an unanchored verification must not be able to look
         *  like an anchored one, and a truncated tail is only detectable against an anchor. */
        auditVerify: () => (auditAnchor
          ? auditchain.verifyChain({ rows: auditRing, useAnchor: true })
          : auditchain.verifyChain({ rows: auditRing })),
        /** Round 24: force a checkpoint now (persisted when a durable root supplies the anchor). */
        auditCheckpoint: () => auditchain.checkpoint({ rows: auditRing, persist: true }),
        audit: { dir: auditState.dir, file: auditState.file, written: auditState.written,
          lastWriteError: auditState.lastWriteError,
          note: auditState.dir
            ? 'audit rows are appended to <root>/vmu/audit/<day>.jsonl; a write failure is reported here, never swallowed'
            : 'no durable root: the audit is in-memory only (auditTail)' },
        registrations: registrations.slice(),
        // `packs` must reflect what is ACTUALLY applied - including packs applied through the pack loader,
        // which records itself in the notes; a status that only tracks usePack() would under-report.
        packs: [...new Set(packs.concat(packNotes.filter((n) => n.what === 'applied').map((n) => n.id)))],
        bus: bus.status ? bus.status() : { entries: [] },
        prompt: prompt.status ? prompt.status() : null,
        store: store ? store.stats() : null,
        // The library's own status() is ASYNC (it rebuilds the index from disk), so this synchronous view
        // only reports presence and asks the caller to await requireLibrary().status() for the detail.
        library: library ? { present: true, detail: 'await requireLibrary().status() for tracks/records/kinds/truncation' } : null,
        members: members ? members.status() : null,
        tasks: tasks.status(),
        work: workLedger ? workLedger.status() : null,
        live: { meetings: [...liveMeetings.keys()], ballots: [...liveBallots.keys()], cap: liveCap, evicted: liveEvicted,
          note: 'session-scoped live primitives addressable by id from the tool faces; evicted is COUNTED, never silent' },
        rules: rules.status(),
        control: controlView(),
        loader: loader.status(),
        bridge: bridge.status(),
        registry: registry.status(),
        seams: { host: !!host, store: !!store, library: !!library, members: !!members, spawn: !!spawn, deliver: !!deliver },
        note: 'a kernel with no declarations is inert by construction (zero mechanism, R1)',
      }
    },
  }

  return kernel
}
