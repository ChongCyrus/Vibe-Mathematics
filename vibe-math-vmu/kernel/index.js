// vmu kernel 鈥?the composition root (docs/02 搂2, docs/03 搂1).
//
// This file is what the goal means by "the vmu framework": the place where the parts are ASSEMBLED, and
// the place where the framework's first promise is enforced. That promise is the zero-mechanism default
// (R1, docs/04 搂3): a kernel created with no settings, no packs and no middleware must be INERT.
// Concretely, and this is asserted by tests/vmu-kernel.test.mjs:
//   路 it registers nothing with the host;
//   路 it subscribes to no hook (the bus is empty);
//   路 it injects no prompt section (the assembled prompt equals the base it was given);
//   路 it opens no durable store unless a root was supplied.
// Everything else is activated by DECLARATION: settings choose what runs, packs choose what an
// institution means, and a capability that is switched on without its seam is refused BY NAME
// (VMU_ENGINE_UNAVAILABLE) instead of quietly behaving as if it were off.
//
// Ownership rule applied here (docs/04 搂11, P3): the kernel carries MECHANISM only. Nothing in this
// file names a role, a stage, a paper or a policy - those arrive as settings values or pack content.

/** Public-interface version of this module's surfaces (docs/03 搂7, D13-O3). */
export const apiVersion = 1

export { PACK_CONTRACT_VERSION } from './registry.js'

import { createStore } from './store.js'
import { createBus } from './bus.js'
import { createPromptPipeline } from './prompt/index.js'
// ROUND 339: the TURN LOOP itself (docs/26) - assemble, deliver, parse, dispatch - so a host that installs only the
// framework can run a member turn instead of borrowing the original preset loop. Its ownership table names REAL
// faces and operations (read off this kernel at runtime in round 338), and delivery goes through the host seam.
import { createTurnOrchestrator, facesFrom, closureVoteOf } from './turn/index.js'
// A1 step 1 · Part A: the reporting feedback receipt shape, handed DOWN to `kernel/report.js` as an injected provider
// (that file stays import-free by invariant).
import { reportFeedbackFailure, REPORT_FEEDBACK_WHAT_CONTEXT } from './reportfeedback.js'
import { createLibrary } from './library.js'
import { createMembers } from './members.js'
import { createBallot, createDurableCommitLog } from './ballot.js'
import { createMeeting } from './meeting.js'
import { createTasks } from './tasks.js'
import { createMathSurface } from './math.js'
import { createRulesEngine } from './rules.js'
import { createLoader } from './loader.js'
import { createScriptBridge } from './script-bridge.js'
import { createRegistry } from './registry.js'
import { createWorkLedger } from './work.js'
import { createLeanFace } from './lean.js'
import { createEnvFace } from './env.js'
import { createLatexFace } from './latex.js'
import { memoryCeilingExceeded } from './guard.js'
// IMPLEMENTATION PHASE (docs/11 搂9.8): the first planned primitives to become real code.
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
import { createCollab } from './collab.js'   // ROUND 218: the cross-institution collaboration face (docs/22 §协作)
import { createIdentity } from './identity.js'      // ROUND 220: who a member is, and how that ends (docs/17)
import { createHuman } from './human.js'            // ROUND 220: the human in the loop - veto, observer, approval (docs/17)
import { createDiscipline } from './discipline.js'  // ROUND 220: breaker, suspension, restore, post-mortem (docs/17)
import { createCustody } from './custody.js'  // ROUND 221: entry ledger and chain of custody (docs/22 §2.5)
import { createExplain } from './explain.js'          // ROUND 222: what an explanation carries, and why it is refused (docs/17)
import { createControl } from './control.js'          // ROUND 222: pause scope, watchdog, idle, degradation (docs/08)
import { createCitations } from './citations.js'      // ROUND 222: the bibliography face - style, fields, id priority (docs/07)
import { createFormal } from './formal.js'
import { createMathJobs } from './mathjobs.js'
import { createExternal } from './external.js'
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
import { createCourse } from './course.js'
// Round 32: three faces the docs declared but the kernel did not have. Each one follows the mathtools standard -
// a wired key must change an observable behaviour, refusals carry the enforced list and its scope, and the keys
// that are NOT wired are named individually with a reason rather than quietly ignored.
import { createConference } from './conference.js'
import { createResource } from './resource.js'
import { createIp } from './ip.js'
// Round 32 continues: three more declared faces. The storage one is a POLICY layer only - it validates backends,
// paths, lock behaviour, backup counting and the remote/version policies and never does IO itself; the archival
// semantics some readers expect here (compression, migration targets, retention, per-file byte caps) live in
// vmu.pack.*, vmu.migration.*, vmu.audit.retentionDays and records respectively, and that is stated in the module.
import { createFunding } from './funding.js'
import { createCompliance } from './compliance.js'
import { createStorePolicy } from './storepolicy.js'
// The shared instant normaliser (round 49): the guarded clock this kernel passes around returns a NUMBER, so any
// `Date.parse(clock())` would be NaN and quietly disable whatever it guarded.
import { ms as toMs } from './timevalue.js'
// Round 33: capacity (seats/pool/quota/preemption with named victims) and hr (recruitment cycle, performance
// evidence, tenure, appeals, offboarding, rotation). Both reuse registered codes only; the hr face names the
// contract/timesheet/leave semantics it does NOT implement because no keys or codes exist for them.
import { createCapacity } from './capacity.js'
import { createHr } from './tenure.js'
// Round 34: the migration face - the namespace the storage POLICY layer explicitly does not own. It orchestrates
// plan/dry-run/batches/rollback points and never moves bytes itself; the declared backend set is passed in.
import { createMigration } from './migration.js'
import { createWorkflow } from './workflow.js'
import { createTrust } from './trust.js'
import { createHandover } from './handover.js'
import { createArbitration } from './arbitration.js'
import { createRecruit } from './recruit.js'
import { createTopology } from './topology.js'
import { createFairness } from './fairness.js'
import { createCharter } from './charter.js'
import { createReproPack } from './repropack.js'
// ROUND 247: the domain compliance face (docs/20 §9.1-§9.4) - clinical (N2) and animal (N3) packs.
import { createLegalEntity } from './partnership.js'
import { createReviewers } from './reviewers.js'
import { SETTING_DEFS, screenSettings, resolveSettings, validateValue, unenforcedReport } from '../settings/schema.js'
// PHASE 6 / P0 (goal-3 audit R1/R3): ONE reader for "configured value, else the DECLARED default". Every read below
// that may see an unconfigured key goes through it, so the declared default has one home (settings/schema.js).
import { readSetting } from './settings-defaults.js'
// ROUND 2 (task-14): the four new faces' factories + the ONE id minter (D: "id 不可复用").
//   · ids.js      - reader-a's primitive; `bindIds` binds the module-level singleton the ~20 id-minting modules import;
//   · resume.js   - recovery primitives + the projection wrapper this file attaches;
//   · chat.js     - group chat policy (admin/quota/mute/freeze);
//   · mathadapters.js - numpy/scipy/pandas/sympy adapters (the job mirrors ride on mathjobs' new `fs`/`root`).
import { bindIds, idsStatus } from './ids.js'
import { createResume, createProjection, attachProjection, PROJECTION_KEYS } from './resume.js'
import { createChat } from './chat.js'
import { createMailbox } from './mailbox.js'
import { createPanel } from './panel.js'
import { createReport } from './report.js'
// ROUND 3 / task-24: the one-shot future-only activity waiter (vmu-activity's file).
import { createActivity } from './activity.js'
// ROUND 3 / task-20 (v5r-reader-b's task-19): the C-45 fidelity registry - `applyAbstention` is the ONE enforcement
// point (a registered member's boolean vote is rewritten to 0.5) and it is NOT configurable, so it has no settings key.
import { createFidelityRegistry } from './fidelity.js'
import { createMathAdapters } from './mathadapters.js'
// ROUND 2: the approval GATE wrapper (module-level export of kernel/human.js) - it wraps the named mutating methods
// of a face so a gated action QUEUES instead of running (Lead's "审批未批 ⇒ 动作只能排队" requirement).
import { attachApprovalGate } from './human.js'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.hint = hint
  err.code = code
  return err
}

/**
 * MECHANISM-level named predicates the kernel provides (docs/05 搂5.2: `subject` predicates are the
 * kernel's, so a pack can name a mechanism without inventing one). Each reads the EFFECT and expresses no
 * opinion: "there is a settled formal proof for this object" and "the ballot is frozen" are machine facts,
 * not academic judgements. A pack may add its own through `subjects`, and an unknown name is still refused.
 */
export const DEFAULT_SUBJECTS = Object.freeze({
  has_locked_formal_proof: (ev) => !!(ev && (ev.locked === true || (ev.subject && ev.subject.settled === true))),
  in_frozen_ballot: (ev) => !!(ev && ev.frozen === true),
})

/**
 * WHO wrote a setting. The manual promises `settings.resolved` ("鍊?+ 鏉ユ簮灞?), and without it "鏀逛簡娌″弽搴?
 * cannot be answered (docs/04 搂6). The record lives under a SYMBOL key so it never shows up in Object.keys,
 * never inflates the declared-key count, and never leaks into a pack's own settings layer.
 */
const WRITERS = Symbol('vmu.settings.writers')
/**
 * THE ONE `APPLIES` TABLE (task-166, the "seventh case"). Hot classes are a CONTRACT (docs/04 §5):
 * H0 lands immediately, H1 by the next turn, H2 only in a new session, and H3 is framework-owned and
 * therefore READ-ONLY. Both writers below AND the host tool face derive their receipt from THIS table (the
 * host reads it from `status().settings.applies`), so one (key, value) pair can no longer get two
 * contradictory answers depending on which path it took.
 */
/**
 * ROUND 3 / task-20 F3: the faces MEASURED to read the settings handle at CALL time (not at construction). A key whose
 * prefix matches one of these is in force in THIS session even when its declared hot class says "next start", so the
 * receipt must neither under-report (claiming a restart) nor over-report it. Published in
 * `status().settings.liveReaders` so the claim is AUDITABLE rather than trusted.
 */
export const LIVE_READERS = Object.freeze({
  'vmu.prompts.': 'kernel/prompt (assembled per turn; the D-13 live reads)',
  'vmu.report.': 'kernel/report (settings.get on every call)',
  'vmu.resume.': 'kernel/resume (per call)',
  'vmu.ids.': 'kernel/ids (per mint)',
  'vmu.turn.': 'kernel/prompt via a {{ setting:<key> }} variable (per assembly)',
})
const liveReadersOf = (key) => Object.entries(LIVE_READERS).filter(([p]) => String(key).startsWith(p)).map(([, who]) => who)
export const APPLIES = Object.freeze({
  H0: 'immediately',
  H1: 'next turn',
  H2: 'next session (restart required)',
  H3: 'read-only (framework-owned)',
})
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

/**
 * ROUND 9 / task-66 A (G7) — ONE durable commit log for the board (`kernel/ballotbox.js`) AND the mailbox
 * (`kernel/mailbox.js`). Two faces with two logs allocate two independent ticket sequences, so the rows cannot be
 * merged or replayed in one order; the log is therefore built HERE, once, and both faces are handed the SAME object.
 *
 * WHY A LATE-BOUND FAÇADE INSTEAD OF A PLAIN LOG. The allocating store is the HOST's and may mount after this
 * assembly is built (the entry's `commitStore` is a call-time resolver for exactly that reason), so the real log
 * cannot exist at construction time. This object resolves the store on EVERY call and memoises one log per
 * resolved store — the faces get identity-stable behaviour (`q.durable === true` means the same thing to both),
 * and a store that appears later is picked up by the next call. A store is only usable with `append()` +
 * `readAll()`; anything else is ABSENT BY NAME (`durable === false`), never pretended, and `reserve()` returns
 * null exactly like the ballot's own log does in that state.
 */
export function createSharedCommitQueue({ resolveStore = null, clock = () => Date.now(), name = 'shared' } = {}) {
  let log = null
  let bound = null
  let failure = null
  const current = () => {
    let store = null
    try { store = typeof resolveStore === 'function' ? resolveStore() : resolveStore } catch (e) {
      // The resolver itself threw: a NAMED degradation (the same code the ballot face records), never a silent
      // "not durable" that hides a broken host seam.
      failure = { code: 'VMU_COMMIT_STORE_FAILED', message: String((e && e.message) || e) }
      return null
    }
    if (!store || typeof store.append !== 'function' || typeof store.readAll !== 'function') return null
    failure = null
    if (log && bound === store) return log
    bound = store
    // `createDurableCommitLog` reads the log back at construction, so a NEW store resumes the ticket counter
    // from its rows instead of restarting at 1 (that is what keeps the numbering monotonic across a remount).
    log = createDurableCommitLog({ store, clock, name })
    return log
  }
  return {
    name,
    get durable() { const l = current(); return !!(l && l.durable) },
    reserve: (op) => { const l = current(); return l ? l.reserve(op) : null },
    complete: (rec, outcome) => { const l = current(); return l ? l.complete(rec, outcome) : null },
    status: () => {
      const l = current()
      if (l) return Object.assign({ shared: true, name }, l.status())
      return { shared: true, name, durable: false, tickets: 0, appended: 0, done: 0, recoveredAt: null,
        reason: 'no allocating store is bound: the shared commit log is absent, not pretended' }
    },
    // Observability only: WHY the log is absent (a throwing resolver is not the same fact as no store at all).
    resolveState: () => { const l = current(); return { durable: !!(l && l.durable), bound: !!l, failure } },
  }
}

export function createKernel({
  host = null,
  // The institution policy for prompt-section switches; null means the framework switches nothing.
  sectionPolicy = null,
  // Renders a member queued notices the way the institution writes them; null means the framework fallback.
  noticeBlock = null,
  extraPhases = null,
  // A1 STEP 1 · PART B: the REPORT-FEEDBACK PROVIDER, handed down by the ENTRY. It is a LATE-BOUND accessor on purpose:
  // the kernel is constructed before the entry has performed the host `context()` call, so the provider must be able to
  // answer later with the result of that call. `null` keeps the placeholder, which names the un-wired delivery in words
  // that are TRUE for this build.
  reportFeedback = null,
  settings = {},
  root = null,
  // THE FACTORY DEFAULT CLOCK IS A NUMBER OF MILLISECONDS. It used to return an ISO string, which the clock guard
  // (correctly) rejects as non-finite - so with no injected clock every one of the ten guarded services refused by
  // name, an honest refusal caused by a default that the guard could never accept. A number is also what every
  // time calculation in the kernel wants; the audit day directory formats it explicitly below.
  clock = () => Date.now(),
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
  // ROUND 6 / target-5: the KILLABLE spawn seam `(request, onHandle)`. The entry hands the host's own handle to the
  // caller before awaiting the outcome, so `cancel({jobId})` terminates immediately; without it the job faces can only
  // refuse by name ("this seam cannot kill"). Same implementation as `spawn`, one extra argument.
  spawnHandle = null,
  // ROUND 8 / task-58 (G6): THE ALLOCATING STORE. `kernel/ballot.js` owns the commit PROTOCOL (ticket from the store,
  // intent before effect, idempotent `reconcile()`), but a protocol needs a store that can ALLOCATE a sequence number:
  // `append(record) -> { ticket }` plus `readAll()`. The host owns that (an O_APPEND file, a SQLite sequence, a locked
  // journal), so it is a SEAM here. A function is resolved AT CALL TIME (a plugin's `apply` can run before the host
  // service mounts); absent ⇒ the ballot reports `status().gate.durable === false` BY NAME, never pretended.
  commitStore = null,
  deliver = null,
  // ROUND 1 / K3: the TURN loop's own delivery seam (`async ({ turn, text }) => reply`). Kept separate from
  // `deliver` (the member/meeting wake seam, whose shape is an envelope) so one adapter can never be silently
  // handed to the other. `null` keeps the documented named refusal.
  deliverTurn = null,
  // ROUND 4 / F9+F10 (docs/26 §3.22): the two ONGOING-COMMAND seams. The entry assembles them from the host's
  // `subagents` service (`sendViaSubagents`/`interruptViaSubagents` in kernel/turn/index.js); both are optional, and a
  // caller that asks for a missing verb gets `VMU_ENGINE_UNAVAILABLE` from the loop instead of a silent no-op.
  sendMessage = null, interrupt = null,
  // ROUND 4 / task-25 (reader-a's 5②): the recovery CHILDREN port `{ parentId: () => id, list: async (parentId) => [ids] }`.
  // Optional: without it `resume` reports `children.attached:false` + `VMU_RESUME_CHILDREN_UNAVAILABLE` and recovery
  // still succeeds (a named gap, not a failure).
  children = null,
  // ROUND 1 / K5 (D-02): the ENTRY is the only layer that knows a folded pack default from a deployment value (it
  // merges them before construction), so it hands the layer map in and the resolved view reports it instead of
  // guessing `config`. The named overlap report itself is NOT a kernel seam: the kernel never acts on it (the entry
  // already refused/shadowed at merge time), and a seam that only this file reads is exactly what
  // `tests/vmu-seam-params-consumed.test.mjs` forbids - so it is surfaced by the HOST face instead
  // (`createHostAdapter({ mergeReport })`, which `vibe_vmu_status` prints).
  settingsSources = null,
  // ROUND 1 / K5: the pack loader is injected by the entry, so `usePack()` has ONE implementation to delegate to
  // (kernel/pack.js). With none injected the call REFUSES by name - there is no second, quietly-different pack path.
  packApplier = null,
  // Capability seams the HOST owns. They default to null (the modules then refuse by name), but they are real
  // options now: an absent seam is a deployment fact, not something this file decided. A review proved that
  // `deliver` was reaching members and meetings while notify was pinned to null, and that status().seams
  // reported the seam as present anyway - so the report below is now built from what each service ACTUALLY got.
  signer = null,
  fetchFn = null,
  timer = null,
  bus: injectedBus = null,
  // The HOST owns key material. Without this seam the tamper-evident chain is unkeyed and says so; with it the
  // chain becomes keyed and a re-forged chain is refused. The kernel never invents a key.
  secrets = null,
} = {}) {
  // FIXING THE FOURTH INSTANCE CREATED THE FIFTH, and an independent review measured it: copying settings into a
  // view turned those properties into a CONSTRUCTION-TIME SNAPSHOT, while the official runtime entry
  // setSettingsValue() mutates the ORIGINAL object. A runtime change therefore reached the get() channel and
  // never the property channel: external.enabled was set to true, the receipt said ok, and the service still read
  // false. A receipt that claims "applied" while a whole class of modules can never see it is worse than the
  // original defect, so the view is LIVE now - property reads fall through to the original on every access and
  // get() reads it directly. Iteration and `in` keep working through the proxy traps.
  // ★ ROUND 30 (task-149 A) — THE VALUE/DOMAIN GUARD'S EXECUTION POINT, FIRST OF TWO.
  //
  // THE DEFECT (measured, then independently reproduced): `validateValue` (settings/schema.js) was runtime DEAD
  // CODE — its only callee `resolveSettings` had no caller at all — so a declared `type`/`domain` was pure
  // documentation and an out-of-domain value arriving through `config.vmu` (preset/overlay) was simply LOADED
  // (`vmu.budget.onExceed`, `vmu.compat.unknownCombo`, `vmu.quota.onExceed` all did). The KEY guard
  // (`assertDeclared`) was wired, so half of this file's own schema really ran, which is why the missing half was
  // easy to assume: schema.js:1521 said "the path every runtime write takes" and nothing took it.
  //
  // WHY HERE: every consumer below receives `settings` (directly or through `settingsView`), so the LAST moment at
  // which a bad value can still be kept out of the whole graph is before the first consumer is built. The
  // disposition is the MERGE-FACE one (see screenSettings): NOT ACCEPTED + RECORDED BY NAME + the declared default
  // stays. A hard refusal here would turn "one key mistyped" into "the session never starts".
  const settingsRejected = []
  {
    const screened = screenSettings(settings, { source: 'config' })
    for (const r of screened.rejected) {
      settingsRejected.push(r)
      // An UNDECLARED key is recorded and LEFT ALONE (readers ignore it; deleting a key this face does not own is a
      // behaviour change nobody asked for). A DECLARED key with an out-of-domain value is replaced by its declared
      // default — the value is not accepted, the default is what the declaration promised.
      if (r.reason !== 'undeclared') settings[r.key] = r.default
    }
  }
  const settingsView = new Proxy(settings, {
    get: (target, key) => (key === 'get' ? (k) => target[k] : target[key]),
    has: (target, key) => key === 'get' || key in target,
    ownKeys: (target) => [...new Set([...Reflect.ownKeys(target), 'get'])],
    getOwnPropertyDescriptor: (target, key) => (key === 'get'
      ? { value: (k) => target[k], enumerable: false, configurable: true }
      : Reflect.getOwnPropertyDescriptor(target, key)),
    // TASK-163: the view was LIVE for reads but WRITABLE for writes, so `view['vmu.safety.pathPolicy'] =
    // 'allow-all'` silently ADDED the key to the kernel's own settings object — any consumer could change
    // kernel settings, bypassing the declared-owner check in setSettingsValue(). A view is a VIEW: writing
    // through it is refused by name, and the hint names the sanctioned path.
    set: (target, key) => {
      throw refuse('VMU_NOT_PERMITTED', 'settingsView is READ-ONLY: refusing to write "' + String(key) + '" through the view',
        'call kernel.setSettingsValue(key, value, { by }) so the declared-owner check runs — a view that writes through would let any consumer change kernel settings')
    },
    deleteProperty: (target, key) => {
      throw refuse('VMU_NOT_PERMITTED', 'settingsView is READ-ONLY: refusing to delete "' + String(key) + '" through the view',
        'call kernel.unsetSettingsValue(key) instead (it is the sanctioned path and reports a receipt)')
    },
  })
  // CONSUMER WIRING (round 19, the point an independent reviewer made): a clock guard nobody uses changes
  // nothing - a backwards clock would still extend every TTL and keep every pending idempotency entry alive
  // forever. The guard is therefore built FIRST (before any TTL-sensitive service) and its `now()` is handed to
  // exactly the modules whose semantics depend on elapsed time; the rest of the kernel keeps the raw clock.
  const clockguard = createClockGuard({ clock, log: (m) => log('clockguard: ' + m), settings: settingsView })
  const guardedClock = () => clockguard.now()
  // A3 CONSUMER (round 24): the projection migrator existed but no projection used it, so a version bump silently
  // discarded the durable ledger. It is built early enough to be handed to the ledger at construction.
  const projmigrate = createProjectionMigrator({ settings: settingsView, bus: null, clock, log })
  const enabled = settings['vmu.core.enabled'] !== false
  // TASK-163: `dryRun` must be LIVE for H0 ("immediate") writes, so it is a mutable kernel-level fact and
  // setSettingsValue() pushes the new value into the bus (bus.setDryRun) as well as into this variable.
  let dryRun = settings['vmu.middleware.dryRun'] === true
  const runtimeWrites = []
  // ROUND 2 (task-14): what the approval gate was attached to (filled in once the faces exist, reported by status()).
  let approvalGateReport = []

  /**
   * THE ONE SETTINGS GUARD (task-166, "the seventh case"): declared key · H3 read-only · declared owner.
   * Both setSettingsValue() and unsetSettingsValue() call it, so the tool face, a middleware and the kernel's
   * own API all get the SAME code and the SAME words. Missing `by` is NOT a silent skip: it is the office
   * path, and it is EXEMPTED AND SELF-DISCLOSED in the receipt (`ownerCheck`).
   */
  const settingsGuard = (key, by, action) => {
    if (typeof key !== 'string' || key.trim() === '') {
      throw refuse('VMU_INVALID_ARGUMENT', action + 'SettingsValue needs a non-empty setting key',
        'e.g. ' + action + 'SettingsValue("vmu.middleware.dryRun", … , { by: "office" })')
    }
    const def = SETTING_DEFS.find((d) => d.key === key) || null
    if (!def) {
      // WORDING ALIGNED with schema.js `assertDeclared` (task-166): the tool face pre-checks the declared-key
      // set, so if the two refusals used different words the same (key, value) pair would still read as two
      // different contracts at the two boundaries. Code AND words are now identical.
      throw refuse('VMU_INVALID_ARGUMENT', 'undeclared setting key: ' + key,
        'declare it in vibe-math-vmu/settings/schema.js first (docs/04 R4)')
    }
    if (def.hot === 'H3') {
      throw refuse('VMU_NOT_PERMITTED', 'setting ' + key + ' is read-only (H3): the framework owns it',
        'H3 keys are not user-changeable; see docs/04 §5 for its declared who/hot')
    }
    let ownerCheck = 'identified'
    if (by === null || by === undefined) {
      ownerCheck = 'exempted (no `by` given: office path, DISCLOSED)'
    } else if (def.who && String(by) !== String(def.who)) {
      const delegable = Array.isArray(settings['vmu.safety.delegableKeys'])
        && settings['vmu.safety.delegableKeys'].includes(key)
      if (!delegable) {
        throw refuse('VMU_NOT_PERMITTED', String(by) + ' may not set ' + key + ' (declared owner: ' + def.who + ')',
          'list "' + key + '" in vmu.safety.delegableKeys to delegate it to a role slot (docs/04 §11)')
      }
      ownerCheck = 'delegated (listed in vmu.safety.delegableKeys)'
    }
    return { def, hot: def.hot ? String(def.hot) : null, who: def.who || null, ownerCheck }
  }
  /**
   * ROUND 2 (task-14, vmu-assistant's §2): the READ-ONLY half of the settings guard, as a seam. `settingsGuard`
   * above answers "may this caller write this key" and REFUSES; this answers "what IS this key" and refuses nothing -
   * an undeclared key comes back as `{ key, declared:false }` instead of an exception. It exists so `vmu.report`'s
   * parameter face can describe a key's hot class and declared owner WITHOUT inventing them, and it is deliberately
   * the SAME table lookup (`SETTING_DEFS`) rather than a second source of truth.
   */
  const settingDescription = (key) => {
    const def = SETTING_DEFS.find((d) => d.key === key) || null
    if (!def) return { key: String(key), declared: false, hot: null, who: null, type: null, def: null, doc: null }
    return { key: def.key, declared: true, hot: def.hot ? String(def.hot) : null, who: def.who || null,
      type: def.type || null, def: def.def === undefined ? null : def.def, doc: def.doc || null }
  }

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

  // IN-FLIGHT LEDGER (docs/07 搂3): durable, and only meaningful with a store - without one it stays null and
  // asking for it is refused by name (an in-flight ledger that forgets on exit would be a lie).
  const workLedger = store
    ? createWorkLedger({ store, clock, isPaused: () => controlState.state === 'paused' })
    : null

  // DURABLE AUDIT (docs/07 搂5): with a root, every audit row is APPENDED to <root>/vmu/audit/<day>.jsonl, so
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
      // The clock may now be a millisecond number (the factory default) or an ISO string (a caller's choice);
      // both must name the same day file, so the value is normalised rather than stringified blindly.
      const raw = (row && row.ts) || clock()
      const day = typeof raw === 'number' && Number.isFinite(raw)
        ? new Date(raw).toISOString().slice(0, 10)
        : String(raw).slice(0, 10)
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
  // LOG LEVEL (docs/04 搂11): a REAL consumer, and a backwards-compatible one. At the default `info` the audit
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
  const auditCheckpointEveryDefault = Number.isInteger(settings['vmu.audit.chain.checkpointEvery'])
    && settings['vmu.audit.chain.checkpointEvery'] > 0 ? settings['vmu.audit.chain.checkpointEvery'] : 100
  // TASK-163 (the sixth "receipt lies" case): this knob used to be READ ONCE here and then injected as a
  // CONSTANT both as the property and through the `get` seam, so `setSettingsValue('…checkpointEvery', 7)`
  // returned `{ok:true}` while `auditchain.status().checkpointEvery` stayed 100 — the receipt lied. The
  // declared hot class is H1 ("next turn"), so the overlay is now LIVE: both channels read the CURRENT
  // setting, with the declared default kept as the fallback.
  const liveCheckpointEvery = () => (Number.isInteger(settings['vmu.audit.chain.checkpointEvery']) && settings['vmu.audit.chain.checkpointEvery'] > 0
    ? settings['vmu.audit.chain.checkpointEvery'] : auditCheckpointEveryDefault)
  const auditSettings = new Proxy(settings, {
    get: (t, k) => {
      if (k === 'get') return (kk) => (kk === 'vmu.audit.chain.checkpointEvery' ? liveCheckpointEvery() : t[kk])
      if (k === 'vmu.audit.chain.checkpointEvery') return liveCheckpointEvery()
      return t[k]
    },
    has: (t, k) => k === 'get' || k in t,
    ownKeys: (t) => [...new Set([...Reflect.ownKeys(t), 'get'])],
    getOwnPropertyDescriptor: (t, k) => (k === 'get'
      ? { value: (kk) => t[kk], enumerable: false, configurable: true }
      : Reflect.getOwnPropertyDescriptor(t, k)),
  })
  // N1 CONSUMER WIRING (round 20): the chain must exist BEFORE the audit ring, because the ring is where rows
  // are born - a chain built afterwards could only verify a history nobody had fed it.
  // The hash seam is real sha256 here; a host that wants its own can override it, and the module still refuses
  // rather than inventing a hash when no seam is given at all.
  const auditchain = createAuditChain({
    // The module reads this knob BOTH ways (a get() seam and a plain property), and a wiring that only satisfies
    // one of them is the same "seam nobody triggers" defect this round exists to fix - so both are provided,
    // and both are now LIVE (task-163).
    settings: auditSettings,
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

  // ROUND 2 (task-14): BIND THE ONE ID MINTER before any service is constructed, so a factory that mints on
  // construction already goes through it. `bindIds` is idempotent; with no durable root it still mints
  // process-uniquely and `idsStatus().durable=false` says so (never a silent pretence of durability). The counters
  // live under the `ids` key (kernel/store.js PUBLIC_KEYS) and the projection's max suffix is the fallback, so a
  // lost write can never cause a name to be reused (Lead's id-reuse requirement). The DURABLE half is read after the
  // entry opens the store: `await hydrateIds()` (kernel/ids.js) runs in the entry's startup chain.
  // MEASURED (reported to reader-a, not patched here - ids.js is theirs): `ids.js:135` calls `emit({type:'ids/minted',…})`
  // where its own helper does `bus.emit(ev)` - so the HOOK NAME is an object. `bus.emit` is async, so the helper's
  // try/catch cannot catch the refusal and every mint produced an UNHANDLED REJECTION (a process-killer, and it would
  // have reddened my gates through no fault of the wiring). Until that line is fixed the minter is bound WITHOUT the
  // bus (it still mints process-uniquely and still persists counters - only the broadcast is missing, and `status().ids`
  // does not claim one). `log` is shaped as `{ append }` because that is the seam `ids.js` reads.
  // CLOCK: the RAW clock, deliberately NOT `guardedClock`. `ids.js` calls `clock()` inside its own `status()`, and the
  // monotonic guard REFUSES a caller-supplied ISO-string clock (measured: `VMU_... non-finite` from clockguard.js:84),
  // which took `kernel.status()` - and therefore the whole status tool - down with it. Id timestamps are informational;
  // they do not need the elapsed-time guard.
  const ids = bindIds({ store, clock, log: { append: (ev) => log('ids ' + JSON.stringify(ev)) }, bus: null, settings: settingsView })

  // ROUND 1 / K4: the pipeline ACCEPTS a settings handle (kernel/prompt/index.js reads the `vmu.prompts.*` family),
  // and this call site simply never gave it one - so on the real path every prompt setting (declared sections,
  // overrides, overridesByLang, locale.*, glossary.*) was inert while docs/04 marked them wired. The LIVE VIEW is
  // passed, not the raw object: these keys are declared H1 ("next turn"), and the pipeline now reads the read-time
  // policy through this handle on every assemble, so a runtime `vibe_vmu_set` really does reach the next turn.
  const prompt = createPromptPipeline({ sections, bindings, overrides, whoMayOverride, bus, readFile, clock, settings: settingsView })

  // PHASE 6 (goal-3 audit, half-built pair): the CONSTRUCTION-TIME tracks are kept, because `retractTracks()` must be
  // able to restore exactly what the kernel started with after a pack that declared tracks is unloaded.
  const initialTracks = tracks || settings['vmu.records.tracks']
  // P1-9: the library is created BEFORE the fidelity registry, but history exports must be able to say
  // "a defect marker withdrew this proof". A holder is set once fidelity exists (never a forward reference).
  const fidelityRef = { current: null }
  let library = root
    ? createLibrary({
      root,
      tracks: initialTracks,
      headListAt: settings['vmu.records.headListAt'],
      truncateMode: settings['vmu.records.truncateMode'],
      fingerprintPolicy: settings['vmu.records.fingerprintPolicy'],
      // P1-9: history rows keep the OLD body (that is a historical fact), but the export must also carry the
      // CURRENT truth: `currentDefect` asks the fidelity marker, so a reader cannot mistake history for current proof.
      defectLookup: (target) => (fidelityRef.current && typeof fidelityRef.current.passedWithdrawnFor === 'function' ? fidelityRef.current.passedWithdrawnFor(target) : null),
      // THE PATH POLICY REACHES THE WRITE SURFACE (docs/04 搂11): the library gates its writes through
      // kernel/guard.js, so `vmu.safety.pathPolicy` is a consumer rather than a declaration.
      // TASK-163: it gets the READ-ONLY LIVE VIEW (not the raw object) — a consumer handed the raw settings
      // could write straight into kernel settings, which is exactly the write-through this round closed.
      settings: settingsView,
      clock,
    })
    : null
  // ★ the same stable handle for `library`: `declareTracks()` / `retractTracks()` REPLACE it.
  const libraryRef = new Proxy({}, { get(_, prop) { const cur = library; if (!cur) return undefined; const v = cur[prop]; return typeof v === 'function' ? v.bind(cur) : v } })

  // THE LEAN FACE (docs/09, `vmu.math.lean*`): a real subsystem, created only when a spawn seam exists. The
  // face owns the semantics the docs promise ("exit 0 AND the content hash unchanged"); the kernel only wires.
  // ROUND 6 / target-5 (v5r-reader-b's ruling): the Lean face now gets the SAME four seams its siblings get, so its
  // MIRROR / resume-from-mirror and its cancel path work on the PRODUCTION path too (they previously worked only where
  // a test injected them):
  //   · `fs`         = the host file face (host-math's readText/writeText) ⇒ the `Math/Jobs` mirror is real;
  //   · `ids`        = the kernel's ONE minter (bound above) ⇒ job ids never restart;
  //   · `timer`      = the kernel's declared timer (child budget; absent ⇒ the platform timer, named by the module);
  //   · `spawnHandle`= the killable spawn seam `(opts, onHandle)` ⇒ `cancel({jobId})` can really terminate.
  const lean = spawn
    ? createLeanFace({ settings: settingsView, spawn, spawnHandle, timer, ids, root, clock, log,
      fs: host && typeof host.readText === 'function' && typeof host.writeText === 'function' ? host : null })
    : null

  // ★ PHASE 7 — THE LaTeX EXECUTOR (paper's missing mechanism). Constructed ONLY when a spawn seam exists, exactly like
  // the Lean face; no seam ⇒ no face (a direct call would still refuse by name). The engine ORDER is pack policy data,
  // never a Chinese-first constant in the kernel.
  const latex = (spawn || spawnHandle)
    ? createLatexFace({ settings: settingsView, spawn, spawnHandle, root, clock, log })
    : null

  // The resource gate closes the `vmu.limits.memoryCeilingMb` loop. The ceiling is the HOST PROCESS RSS (the
  // framework cannot measure its own "net" memory - documented), and the roster refuses to grow past it by name.
  const resourceGate = () => memoryCeilingExceeded({ settings, rssBytes: process.memoryUsage().rss })

  // `members` and `library` are re-declarable: a PACK owns the institution (slots, tracks), so applying a
  // pack must be able to declare them. Re-declaring a library rebuilds its index from disk, so no record
  // is lost by the swap (docs/10 搂2).
  // E2 (task-154): SEAM AVAILABILITY IS A CONSTRUCTION FACT, never an inference. `status().seams` used to
  // rebuild `deliverConsumedBy` as `['members','meetings','notify'].filter(n => !!deliver)` — a HARD-CODED
  // list that kept naming "members" even when `createMembersList` had returned null (no slots ⇒ no roster
  // service existed at all), and `seams.timer` used a truthiness test while `scheduler.arm` only accepts four
  // OBJECT shapes (so a bare function timer made status claim a seam the consumer refused with
  // VMU_CONTROL_NO_TIMER). Both are now recorded/handed over at the construction site.
  const seamReceipts = { deliver: [] }
  const noteSeam = (name, consumer, received) => {
    if (received !== null && received !== undefined && !seamReceipts[name].includes(consumer)) seamReceipts[name].push(consumer)
  }
  let members = createMembersList({ slots, maxLiveMembers, deliver, bus, clock, settings, resourceGate })
  // ★ ONE STABLE HANDLE, INSTEAD OF 8 CAPTURED VALUES. `declareSlots()` REPLACES `members` (a pack declares slots
  // after the kernel is constructed). Every internal consumer receives this proxy, which resolves the CURRENT
  // member service per property access, so "names right, object stale" cannot recur (measured on a real DSH host).
  const memberRef = new Proxy({}, { get(_, prop) { const cur = members; if (!cur) return undefined; const v = cur[prop]; return typeof v === 'function' ? v.bind(cur) : v } })
  noteSeam('deliver', 'members', members ? deliver : null)
  const packNotesLog = []   // ROUND 240: renamed - this array used to SHADOW the `packNotes()` method
  const tasks = createTasks({
    stages: stages || settings['vmu.tasks.stages'] || [],
    maxOpenTasks: maxOpenTasks !== undefined ? maxOpenTasks : (settings['vmu.tasks.maxOpenTasks'] || 0),
    requireExpectedRevision: settings['vmu.tasks.requireExpectedRevision'] === true,
    stageGate,
    // `control` is declared below; the arrow is only CALLED at runtime, so this is not a use-before-init.
    isPaused: () => controlState.state === 'paused',
    bus,
    clock,
    // ROUND 10 / task-74 (A5): the LIVE settings view, so `vmu.tasks.memberMayRejectAssign` is read per call
    // (a runtime `vibe_vmu_set` must reach the next `objectAssign()`/`assign()`, not the next boot).
    settings: settingsView,
  })

  // IMPLEMENTATION PHASE, batch 1 (docs/11 搂9.8): the governance primitives (docs/08 搂2 agenda + motions),
  // the task board (docs/08 搂4 columns/WIP/swimlanes/aging) and minutes (docs/08 搂2 minutes/decrees/actions)
  // stop being DECLARATIONS and become real services. They read their own `vmu.agenda.*` / `vmu.motions.*` /
  // `vmu.board.*` / `vmu.minutes.*` keys literally, so the settings table derives their "wired" state by itself.
  const governance = createGovernance({ settings: settingsView, bus, clock, log })
  const board = createBoard({ settings: settingsView, bus, clock, log, tasks })
  // ROUND 3 / task-20 D + Lead's fix: a HOLDER object, not a direct `meetings` reference - the Proxy is created before
  // `const meetings = …` is initialized, and touching a `const` in its TDZ throws
  // (`Cannot access 'meetings' before initialization`), which made any early access a landmine. With a holder, an
  // access before the real instance exists yields `undefined` instead of throwing.
  const meetingsRef = { current: null }
  const meetingsSeam = new Proxy({}, {
    get: (t, k) => { const m = meetingsRef.current; return m && typeof m[k] === 'function' ? m[k].bind(m) : (m ? m[k] : undefined) },
    has: (t, k) => !!(meetingsRef.current && k in meetingsRef.current),
  })
  const minutes = createMinutes({ settings: settingsView, bus, clock, log,
    // reader-c's `resolve()` reads `tier`/`truthWriteRefusal` off this seam. BOTH spellings are handed over (`meeting`
    // was the original option name, `meetings` is the one reader-c asked for in task-17) so neither side has to guess.
    meeting: meetingsSeam, meetings: meetingsSeam })
  const budget = createBudget({ settings: settingsView, bus, clock, log })
  const metrics = createMetrics({ settings: settingsView, bus, clock, log })
  /**
   * ROUND 19 / task-121 — **THE BOUNDARY'S REAL METRICS**, and the ONE place they are turned into the flat map
   * `report.tick({ metrics })` has always accepted.
   *
   * WHY IT EXISTS (measured, R18): the entry bridges the host's `agent/turn-stopping` into
   * `report.tick({ at, event: 'turn-end' })` — with NO `metrics`. `kernel/report.js`'s `thresholdMet()` returns
   * false for a missing object **on purpose** ("no data" must never become a fire), so a `threshold` report could
   * never fire autonomously while `event`/`period` reports could. The fix is NOT to widen `thresholdMet()` (that
   * would turn "no data" into a FIRE = a fake alarm); it is to hand the boundary tick the indicators the kernel
   * really counted.
   *
   * WHAT THIS DOES / DOES NOT DECIDE (R1 — the seam is here, the policy is elsewhere):
   *   · it only READS the metrics face (`vmu.metrics`) and flattens its snapshot: indicator name → one number;
   *   · an indicator with **no observation is ABSENT from the map** (never a fabricated 0), so the report face
   *     keeps its own honest answer (`thresholdMet()` false) when there is nothing to read;
   *   · WHAT to count, and WHO records it, stay outside: the deployment declares `vmu.metrics.indicators` and a
   *     pack/policy calls `observe()` (the counting face is reachable by middleware modules — see the service
   *     catalog below); the report declaration names the metric, the operator and the line.
   *   · `agg` selects the aggregate of the indicator's observed VALUES (the same vocabulary `kernel/alerts.js`
   *     uses for its own thresholds). The default is `sum`, because an indicator observed once per event with
   *     `value: 1` then reads as "how many times it happened" — the reading the report templates already use.
   */
  const metricValues = ({ window = null, agg = 'sum' } = {}) => {
    if (!metrics || typeof metrics.snapshot !== 'function') return {}
    const snap = metrics.snapshot({ window })
    const rows = Array.isArray(snap && snap.indicators) ? snap.indicators : []
    const pick = (r) => (agg === 'count' ? r.count : agg === 'avg' ? r.avg : agg === 'last' ? r.last
      : agg === 'max' ? r.max : agg === 'min' ? r.min : r.sum)
    const out = {}
    for (const r of rows) {
      // NO OBSERVATION ⇒ NO KEY. `count` is the face's own "how many rows" counter; a declared-but-never-observed
      // indicator appears in the snapshot with count 0 and is deliberately dropped here.
      if (!r || typeof r.name !== 'string' || !(Number(r.count) > 0)) continue
      const v = pick(r)
      if (typeof v === 'number' && Number.isFinite(v)) out[r.name] = v
    }
    return out
  }
  // The audit SERVICE reuses the kernel's EXISTING disk seam (`auditToDisk`) instead of opening a second write
  // path: the ring above stays the in-memory view, this service is the queryable/rotatable face over it.
  // ROUND 20: every module whose semantics depend on ELAPSED TIME takes the guarded clock. An independent review
  // pointed out that only four of them did, and that `delegation` was the worst omission - a backwards clock
  // would EXTEND an authorisation's life. The rest of the kernel keeps the raw clock on purpose.
  const audit = createAudit({ settings: settingsView, bus, clock: guardedClock, log, sink: auditToDisk })
const legalEntity = createLegalEntity({ settings: settingsView, clock: guardedClock, log })
const reviewers = createReviewers({ settings: settingsView, clock: guardedClock, log })
  const alerts = createAlerts({ settings: settingsView, bus, clock: guardedClock, log, metrics })
  // `library` is the EXISTING kernel library; the module counts any unsupported adapter method as skipped and
  // never pretends a delete succeeded. Delegation gets the live members surface plus explicit roots (authority
  // that does not come from a delegation); without roots, S-2 refuses every grant - which is the honest default.
  const retention = createRetention({ settings: settingsView, bus, clock: guardedClock, log, library: libraryRef })
  // `roots` = who holds authority that does NOT come from a delegation. It is an EXPLICIT setting rather than
  // a guess from role names: unset means nobody can grant anything (S-2 refuses every grant), which is the
  // honest zero-mechanism default. Guessing "office looks like a root" would be policy hiding in the kernel.
  const delegation = createDelegation({ settings: settingsView, bus, clock: guardedClock, log, members: memberRef,
    roots: Array.isArray(settings['vmu.delegation.roots']) ? settings['vmu.delegation.roots'] : [] })
  const workflow = createWorkflow({ settings: settingsView, bus, clock, log, tasks })
  const trust = createTrust({ settings: settingsView, bus, clock, log })
  const handover = createHandover({ settings: settingsView, bus, clock, log, tasks, library: libraryRef })
  // Batch 2 slice 3: arbitration. `minutes` is the live minutes service so a ruling can be recorded there;
  // `mode` defaults to off (zero mechanism) so nothing is arbitrated unless the institution turns it on.
  const arbitration = createArbitration({ settings: settingsView, bus, clock, log, members: memberRef, minutes })
  // Batch-2 slices 5-8: recruitment, collaboration topology, charters, fair allocation. All four are
  // zero-mechanism by default (no postings / flat topology / charters disabled / no claimants).
  // SLV: pass a GETTER, not the current object. `declareSlots()` REPLACES `members` when a pack declares slots; a
  // value captured here would be the pre-pack null (measured on a real host: every confirm refused "no role slots"
  // after the v3 pack had declared three). Admission resolves the CURRENT roster per call.
  const admission = createRecruit({ settings: settingsView, bus, clock, log, members: () => members })
  const topology = createTopology({ settings: settingsView, bus, clock, log, members: memberRef })
  const fairness = createFairness({ settings: settingsView, bus, clock, log, budget, tasks })
  const charter = createCharter({ settings: settingsView, bus, clock, log, members: memberRef, delegation })
  // Batch-3 slice 2: reproduction packs (docs/16 L12). Data is referenced by pointer by default; a missing
  // required member is named rather than silently omitted.
  const repropack = createReproPack({ settings: settingsView, bus, clock, log, library: libraryRef })
  // Batch-2 slices 10-11: institutional memory and the auction. Memory's `may`/`authorize` always refuse,
  // and the auction's price never depends on reputation unless the institution explicitly turns that on.
  const memory = createMemory({ settings: settingsView, bus, clock, log, library: libraryRef })
  const bidding = createBidding({ settings: settingsView, bus, clock, log, members: memberRef, trust })
  // Batch-2/3/4 tails: skills, publication and the formalisation face. Skills' capacity counts only live and
  // fresh claims (a retired claim frees its slot); all three are zero-mechanism by default.
  const skills = createSkills({ settings: settingsView, bus, clock, log, members: memberRef })
  const publication = createPublication({ settings: settingsView, bus, clock, log, library: libraryRef, repropack })
  const collab = createCollab({ settings: settingsView, bus, clock, log })
  const identity = createIdentity({ settings: settingsView, bus, clock, log })
  const human = createHuman({ settings: settingsView, bus, clock, log })
  // ROUND 2 (task-14): the group-chat policy face. The freeze predicate is LEFT to the module's documented default
  // ("a kernel with no ballot has no freeze") rather than faked here; `isAdmin` likewise falls back to the declared
  // `vmu.chat.admins`. A real freeze source is wired only when a ballot face exposes one (named in the report).
  const chat = createChat({ clock: guardedClock, log, settings: settingsView, bus })
  // ROUND 2 (task-14): the durable per-recipient mailbox and the member state panel. `resolveAudience` is a REAL
  // seam only for `to:'all'` (the roster); `to:'voters'` has no ballot context in this assembly, so it REFUSES by
  // name instead of quietly handing back the roster (a voter set that is not the voter set is worse than a refusal).
  // ROUND 9 / task-66 A (G7): the ONE durable commit log the board and the mailbox SHARE (see
  // `createSharedCommitQueue` above for why it is a late-bound façade). Built from the host's allocating store,
  // resolved at call time; without a store both faces degrade BY NAME (`durableQueue.durable === false`) and
  // nothing pretends to be durable.
  const sharedCommitLog = createSharedCommitQueue({ resolveStore: commitStore, clock, name: 'g7-shared' })
  const mailbox = createMailbox({ clock: guardedClock, log, settings: settingsView, bus, store, deliver,
    durableQueue: sharedCommitLog,
    resolveAudience: members ? ({ to } = {}) => {
      if (to === 'voters') {
        const e = new Error('this assembly has no ballot context, so the voter set cannot be resolved')
        e.code = 'VMU_MAILBOX_NO_SUCH_RECIPIENT'
        e.hint = 'send to a named recipient, or to "all" (the roster); a voter set needs a ballot face'
        throw e
      }
      const roster = typeof members.roster === 'function' ? members.roster() : []
      return roster.map((m) => (m && (m.id || m.member)) || m).filter(Boolean).map(String)
    } : null })
  const panel = createPanel({ clock: guardedClock, log, settings: settingsView, bus, members: memberRef })
  const discipline = createDiscipline({ settings: settingsView, bus, clock, log })
  const custody = createCustody({ settings: settingsView, bus, clock, log })
  const explain = createExplain({ settings: settingsView, bus, clock, log })
  const control = createControl({ settings: settingsView, bus, clock, log,
    // ROUND 2 (task-14, reader-a's contract C): the human approval GATE reaches `control.mayAct`, so a gated control
    // action queues for a human instead of running. Wired only when the gate really exists - a null seam would be a
    // silent bypass of the very gate this line is for.
    approval: typeof human.gate === 'function' ? (req) => human.gate(req) : null })
  const citations = createCitations({ settings: settingsView, bus, clock, log })
  const formal = createFormal({ settings: settingsView, bus, clock, log, spawn, library: libraryRef })
  // INTEGRATOR FIX: `vmu.mathjobs` was REGISTERED but never CREATED - the registry advertised a service the
  // kernel did not build. Both job faces now receive the kernel's real spawn seam (the host injects it), so a
  // missing engine surfaces as a named refusal rather than a silent no-op.
  const mathjobs = createMathJobs({ settings: settingsView, bus, clock, log, spawn, spawnHandle, timer, ids,
    // ROUND 2 (task-14, reader-b's contract): the job MIRROR seam. `fs` is the host's file face (host-math.js
    // exposes readText/writeText/listDir/exists/removeText), `root` is the durable root. A missing `fs` does NOT
    // silently disable the mirror: `admission().fileMirror=false` reports it by name.
    fs: host && typeof host.readText === 'function' && typeof host.writeText === 'function' ? host : null,
    root: root || null })
  // CORRECTION from reader-b: `createMathJobs` is a SYNCHRONOUS constructor and cannot scan the disk itself, so the
  // declared `on-load` recovery is an EXPLICIT best-effort call here (it must not block construction). `manual` and
  // `off` are left alone - the tool action `jobsRecover` is the manual trigger.
  if (settings['vmu.math.jobs.recover'] === 'on-load' && mathjobs && typeof mathjobs.recover === 'function') {
    Promise.resolve().then(() => mathjobs.recover()).catch((e) => log('mathjobs on-load recover failed: ' + String((e && e.message) || e)))
  }
  // ROUND 2 (task-14): the scientific-library adapter face (numpy/scipy/pandas/sympy). `resolveExecutable` comes from
  // the host math seam; without it `probe()` refuses by name (`VMU_EXTERNAL_UNAVAILABLE`) instead of guessing whether
  // the machine has python.
  const mathadapters = createMathAdapters({ settings: settingsView, clock: guardedClock, log, bus, spawn, spawnHandle, timer, ids,
    resolveExecutable: host && typeof host.resolveExecutable === 'function' ? host.resolveExecutable : null,
    root: root || null })
  // Batch-3/5 tails: external fetching (N11) and the clinical/animal approval gates. Both are inert by default
  // (`vmu.external.enabled=false`, no domain pack declared), and both refuse by name rather than inventing data.
  const external = createExternal({ settings: settingsView, bus, clock, log, fetchFn })
  // THE THIRD INSTANCE of the phase lesson, found by an independent review: `deliver` was already in hand and
  // consumed by members and meetings, yet `vmu.notify` was handed a hard null - the same seam wired to A but not
  // to B. Notify now gets the seam that exists, and signer/fetchFn/timer are real kernel options instead of being
  // pinned to null, so a host can reach them without editing this file. Absent seams still refuse by name; the
  // difference is that absence is now a deployment fact rather than a hard-coded one.
  const scheduler = createScheduler({ settings: settingsView, bus, clock, log, timer,
    isPaused: () => controlState.state === 'paused' })
  // ★★★★★★★ PHASE 6 / K1: THE DRIVER THE SCHEDULE NEVER HAD. `arm()` was fully implemented - arm, fire, tick,
  // release the handle - and NOTHING IN THE TREE CALLED IT (measured: zero hits for `scheduler.arm(` / `.tick(`),
  // so a declared `vmu.schedule.triggers` seed could never fire on its own and a recurring item fired once and went
  // quiet. That is the "mechanism exists, no path to the user" defect this project keeps removing.
  // OPT-IN, because arming a host timer is a real side effect and the default must be zero mechanism:
  // `vmu.schedule.autoArm` defaults to FALSE. A refusal is NOT swallowed - a deployment that declared
  // `timeSource='host-timer'` without a seam gets `VMU_CONTROL_NO_TIMER` recorded at construction rather than a quiet
  // downgrade to tick-only.
  let scheduleDrive = null
  if (settingsView['vmu.schedule.autoArm'] === true) {
    try { scheduleDrive = scheduler.autoArm({ on: true }) } catch (e) {
      scheduleDrive = { ok: false, mode: 'refused', code: (e && e.code) || 'VMU_CONTROL_NO_TIMER', message: String((e && e.message) || e) }
      log({ at: clock(), what: 'schedule/auto-arm-refused', code: scheduleDrive.code, why: scheduleDrive.message })
    }
  }
  const crypto = createCrypto({ settings: settingsView, bus, clock: guardedClock, log, signer })
  const notify = createNotify({ settings: settingsView, bus, clock: guardedClock, log, deliver })
  noteSeam('deliver', 'notify', notify ? deliver : null)
  // ROUND 3 / task-24 (vmu-activity's frozen contract): the ONE-SHOT future-only activity waiter. NOTE: the kernel's
  // `timer` option is deliberately NOT forwarded - omitting it makes the face use the platform timer
  // (`status().timer.shape === 'global-setTimeout'`), whereas `timer: null` would mean "this deployment has no timer"
  // and refuse every `wait()` by name (`VMU_ACTIVITY_NO_TIMER`). `activePeers` is a real seam when a roster exists
  // (v5r's "no live peer ⇒ immediate noProgress"); without it `status().peerCheck.seam` reports false.
  // CLOCK: the RAW clock, not `guardedClock` - MEASURED: `activity.status()` reads `clock()` (activity.js:513) and the
  // monotonic guard refuses a caller-supplied ISO-string clock, which took `kernel.status()` down with it (the same
  // failure already fixed for `bindIds`/`createReport`/`createResume`). Waiter timestamps are informational.
  const activity = createActivity({ clock, log, settings: settingsView, bus,
    activePeers: members && typeof members.roster === 'function'
      ? (me) => members.roster().filter((m) => m && m.state !== 'ended').map((m) => String(m.id)).filter((id) => id !== String(me || ''))
      : null })
  // ROUND 3 / task-20 (reader-b's sheet): the fidelity registry. `ids` is omitted on purpose - the module uses the
  // module-level minter bound by `bindIds` above (so `fd-N` never restarts); `fs` is the host file face (its absence is
  // NAMED as `durable:false` by the module, not silently ignored).
  const fidelity = createFidelityRegistry({ clock, log, bus,
    fs: host && typeof host.writeText === 'function' && typeof host.readText === 'function' ? host : null })
  // ...and the library's history export can now ask the CURRENT truth (P1-9); assignment (not a forward call).
  fidelityRef.current = fidelity
  /**
   * P1-9: durable defect markers must be reloaded after a restart. createKernel is SYNC, so the async load is STARTED
   * here and its receipt is observable (`kernel.fidelityLoad()`); nothing pretends it already ran. No host fs seam ⇒
   * status is NAMED `unavailable` (loadDefects refuses by name), never "loaded 0".
   */
  const fidelityLoad = { status: 'pending', loaded: 0, code: null, message: null }
  const fsForDefects = host && typeof host.writeText === 'function' && typeof host.readText === 'function' ? host : null
  let fidelityLoadPromise = Promise.resolve(fidelityLoad)
  if (!fsForDefects) {
    fidelityLoad.status = 'unavailable'
    fidelityLoad.code = 'VMU_MATH_JOBS_MIRROR_UNWIRED'
    fidelityLoad.message = 'no host fs seam (writeText/readText): durable defect markers cannot be reloaded; in-memory markers only'
  } else {
    fidelityLoadPromise = Promise.resolve()
      .then(() => fidelity.loadDefects())
      .then((r) => {
        if (r && r.ok === true) { fidelityLoad.status = 'loaded'; fidelityLoad.loaded = Number(r.loaded) || 0 }
        else { fidelityLoad.status = 'unavailable'; fidelityLoad.code = (r && r.code) || 'VMU_MATH_JOBS_MIRROR_UNWIRED'; fidelityLoad.message = (r && r.message) || 'loadDefects refused' }
        return fidelityLoad
      })
      .catch((e) => { fidelityLoad.status = 'unavailable'; fidelityLoad.code = (e && e.code) || 'VMU_MATH_JOBS_MIRROR_UNWIRED'; fidelityLoad.message = String((e && e.message) || e); return fidelityLoad })
  }
  // ROUND 2 (task-14, vmu-assistant's contract): the REPORTING face. It has NO internal timer by design ("a report
  // never drives anything"), so the entry advances it at the turn boundary; `deliver` is the transport (a missing one
  // is a NAMED refusal, not a silent drop) and `audit` is where parameter changes are recorded.
  // CLOCK: the RAW clock, not `guardedClock` - MEASURED: `createReport` reads `clock()` during CONSTRUCTION
  // (kernel/report.js:121), and the monotonic guard refuses a caller-supplied ISO-string clock, which crashed
  // `createKernel` outright in tests/vmu-kernel.test.mjs and tests/vmu-entry.test.mjs (a process error, not a failed
  // assertion). Report timestamps are informational; the elapsed-time guard belongs to the TTL-sensitive services.
  // (Reported to vmu-assistant as well: reading the clock at construction is itself worth deferring, so that a caller
  // who does pass a guarded clock is not punished for it.)
  const report = createReport({ settings: settingsView, clock, log, deliver, audit,
    describeSetting: settingDescription,
    // ★ A1 STEP 1 · PART A (phase 2): the feedback receipt is INJECTED here, not imported by `kernel/report.js` - that
    // file is import-free under an enforced invariant (it must not be able to reach a decision service even by
    // accident, and an assertion in the assistant suite fails if it gains an import). The nine-key SHAPE lives in
    // `kernel/reportfeedback.js`; this is the single place that hands it down. `delivered:false` carries a TRUE reason:
    // the delivery call has LANDED (A1 step 1 Part B: the entry hands the provider down and a real-machine run returned
    // `delivered:true`); what the placeholder below names is the absence of a provider IN THIS POSITION, never a
    // missing host capability ("the host does not expose it" would still be FALSE - that API was read out of the
    // host's own source and verified).
    // ★ A1 STEP 1 · PART B: the provider the ENTRY handed down, if any. When it is absent the placeholder below stays,
    // and its reason says no provider was handed down IN THIS POSITION - which is true - rather than claiming the host
    // lacks the ability, which would be false (the host's own source exposes it; verified in C1/R5).
    feedback: typeof reportFeedback === 'function' ? reportFeedback : (c) => reportFeedbackFailure({
      enabled: c.feedback === true,
      // ★ NO LAYER IS CLAIMED FOR AN ARMED SWITCH. This placeholder runs only when no provider was handed down, and in
      // that position nothing knows which layer armed the switch - so naming one would be exactly the misnaming the
      // kernel's own resolved view refuses to make. Off is attributed to the default layer, which IS what is in force
      // when nobody named a layer; an assembled kernel always supplies the real layer through the provider above.
      source: c.feedback === true ? null : 'default',
      audience: c.audience || null,
      what: REPORT_FEEDBACK_WHAT_CONTEXT,
      reason: 'no delivery provider was handed down to this assembly (A1 step 1 Part B wires one at the entry): the settings keys are read and reported, the systemPrompt.context() call lands in Part B',
    }) })
  noteSeam('deliver', 'report', report ? deliver : null)
  const lifecycle = createLifecycle({ settings: settingsView, bus, clock, log, workflow,
    publication, collab, identity, human, discipline, custody, explain, control, citations })
  // K6 (round 16): the unified idempotency ledger that a replay/retry path can consult before doing work again.
  // The ledger gets BOTH the guarded clock (so a backwards clock cannot keep a pending key alive forever) and
  // the kernel store (so idempotency survives the restart that a retry usually follows).
  const idempotency = createIdempotency({ settings: settingsView, bus, clock: guardedClock, log, store,
    migrate: projmigrate })
  // K5 (round 16): read-only replay of the audit log. It never writes back into any service - rebuilding state
  // is a pure function, and gaps in the log are reported rather than papered over.
  const replay = createReplay({ settings: settingsView, bus, clock: guardedClock, log, audit, idempotency })
  // K1/K2 (round 17): compensation transactions and rate limiting. Transactions get the idempotency ledger so a
  // replay across instances is deduplicated; the limiter is inert unless a rate is declared (and says so).
  const transaction = createTransaction({ settings: settingsView, bus, clock: guardedClock, log, idempotency })
  const ratelimit = createRateLimit({ settings: settingsView, bus, clock: guardedClock, log })
  // N4 (round 18): the state-version/migration primitive that keeps an old snapshot from being read silently by
  // newer code. (The chain is built earlier now - see the N1 consumer-wiring comment above the bus.)
  const stateversion = createStateVersion({ settings: settingsView, bus, clock, log })

  // ── ROUND 2 (task-14): THE RECOVERY FACE + THE DURABLE PROJECTIONS ────────────────────────────────────
  // Lead's durable-projection item, split with reader-a: IT owns the recovery semantics and the projection
  // wrapper (`kernel/resume.js`), THIS file owns which faces are projected, when they are attached, and the
  // startup hydration order. The `vmu.resume.projections` list is the declaration: a face that is NOT declared is
  // not attached, and a face that IS declared but has no usable adapter is reported `unhydrated` BY NAME by
  // `resume.status()` - never "looks restored, is actually empty".
  //
  // Adapter shape (`attachProjection`): `{ target, methods, projection: createProjection({ key, mode, list|snapshot+restore, replay, cap }) }`.
  // `mode:'journal'` records the COMMANDS and replays them through the PUBLIC methods on hydrate (so a real counter
  // advances to max+1 and an id is never reused); `mode:'state'` needs a snapshot/restore pair on the service, which
  // the owning teammate adds. Faces whose service does not expose the pair yet are simply absent here - named.
  const RESUME_PROJECTION_ADAPTERS = {
    // `tasks` already exposes `list()`; its journal replays through the SAME public methods it records.
    // ROUND 3 / task-20 (reader-a's review): the custom `replay` was WRONG - the wrapper records `entry.args` as an
    // ARGUMENT ARRAY, so `tasks.create([{title}])` was replayed as `create({title:undefined})` and hydrate refused
    // `VMU_INVALID_ARGUMENT`. The instance's own `replaySeam` does `fn.apply(target, entry.args)` (correct), so the
    // custom seam is DELETED rather than reimplemented.
    tasks: () => ({ key: 'tasks', mode: 'journal', list: () => (typeof tasks.list === 'function' ? tasks.list() : []) }),
    // `work` NO LONGER HAS A PROJECTION ROW (Round 4 / task-25, reader-a's measured finding). `kernel/work.js` persists
    // the `work` key as a BARE ARRAY (`store.patch('work', () => list)`), not as a projection envelope
    // `{v,mode,key,seq,entries|value}` - so `hydrate()` refuses to adopt it and now NAMES it
    // (`VMU_RESUME_PROJECTION_GAP`), which made every `recover()` report `ok:false` on a CLEAN FIRST RUN. `work` is
    // already durable and `resume` reads it through the `work` SEAM (which names `interrupted`), so the projection row
    // bought nothing and cost a false failure. Declaring `work` in `vmu.resume.projections` now gets the named
    // "no adapter in this assembly" report instead - honest, and no longer a phantom failure.
    // ROUND 3 / task-20 (reader-a's completion list): the eight faces that NOW expose `snapshot()/restore()`.
    // `mode:'state'` + a snapshot/restore pair ⇒ `attachProjection` also WRITES THROUGH after each wrapped mutation
    // (reader-a's after-hook, gated by `vmu.resume.writeThrough`), so these are durable as soon as they are declared.
    members: () => ({ key: 'members', mode: 'state', snapshot: () => members.snapshot(), restore: (v) => members.restore(v), list: () => (typeof members.roster === 'function' ? members.roster() : []) }),
    meetings: () => ({ key: 'meetings', mode: 'state', snapshot: () => meetings.snapshot(), restore: (v) => meetings.restore(v), list: () => [] }),
    ballotbox: () => ({ key: 'ballotbox', mode: 'state', snapshot: () => ballotbox.snapshot(), restore: (v) => ballotbox.restore(v), list: () => [] }),
    minutes: () => ({ key: 'minutes', mode: 'state', snapshot: () => minutes.snapshot(), restore: (v) => minutes.restore(v), list: () => [] }),
    chat: () => ({ key: 'chat', mode: 'state', snapshot: () => chat.snapshot(), restore: (v) => chat.restore(v), list: () => [] }),
    panel: () => ({ key: 'panel', mode: 'state', snapshot: () => panel.snapshot(), restore: (v) => panel.restore(v), list: () => [] }),
    // ROUND 4 / task-25 (reader-a's task-28): `budget` grew a PUBLIC `snapshot()/restore()` pair this round (its
    // internal formatter was renamed `viewOf`), so it is durable now instead of "hydratable but never written".
    budget: () => ({ key: 'budget', mode: 'state', snapshot: () => budget.snapshot(), restore: (v) => budget.restore(v), list: () => budget.list().items }),
    // NAMED as NOT attachable (reader-a's review): `mailbox.js` is SELF-PERSISTING (it takes the store at construction
    // and owns its `mailbox` key) so it needs no projection row; `meeting`/`ballot` are PER-SESSION factories with no
    // single live instance owned here (wrapping "the" one would silently drop the others) - their owners decide.
    // `members` is a SINGLETON that can be null (no declared slots): it stays in the table and the attach loop reports
    // it as `notAttached` with the reason, which is the named mechanism - never a hard-wired null seam.
  }
  // ROUND 4 / task-25 (reader-a's task-28, F18): recovery must be EXCLUSIVE. The engine acquires the store lock around
  // `recover()` and releases it in `finally` on every path; a second concurrent recovery is refused by name
  // (`VMU_RESUME_BUSY`). The policy object is constructed LATER than this line, so the seam is the same late-bound
  // holder pattern used for `meetings` (an access before it exists yields `undefined`, never a TDZ throw); a deployment
  // that does not declare `vmu.store.lock` gets the engine's zero-mechanism passthrough (`locked:false`).
  const storepolicyRef = { current: null }
  const storepolicySeam = new Proxy({}, {
    get: (t, k) => { const s = storepolicyRef.current; return s && typeof s[k] === 'function' ? s[k].bind(s) : (s ? s[k] : undefined) },
    has: (t, k) => !!(storepolicyRef.current && k in storepolicyRef.current),
  })
  // ROUND 4 / task-25 (reader-a's 5②): the CHILDREN port, resolved BEFORE `createResume` (which consumes it) - naming
  // it later measured as `Cannot access 'childrenSeam' before initialization`.
  const childrenSeam = children && typeof children.parentId === 'function' && typeof children.list === 'function' ? children : null
  const resume = createResume({ store, work: workLedger, control, identity, settings: settingsView, bus,
    lock: storepolicySeam,
    // ROUND 4 / task-25 (reader-a's 5②): the CHILDREN port. It reconciles "members that hold a childId" against the
    // host's LIVE direct children and names every one that is missing (`restart.missingChildren`); the engine never
    // creates or re-dispatches a member (that is assembly policy). Absent port ⇒ `attached:false` +
    // `VMU_RESUME_CHILDREN_UNAVAILABLE`, which does NOT fail recovery.
    children: childrenSeam,
    // CLOCK: the RAW clock, not `guardedClock` - measured: the monotonic guard refuses a caller-supplied ISO-string
    // clock (`VMU_CLOCK_UNGUARDED: … NaN`), and `recover()` reads it, so the whole startup recovery was reported as
    // failed under a string clock. Recovery timestamps are informational; the elapsed-time guard belongs to the
    // TTL-sensitive services (the same reasoning already applied to `bindIds` and `createReport`).
    clock, log, faces: {} })
  const attachedProjections = []
  /**
   * ROUND 4 / task-25 D: ONE phase writer for the four control transitions. `resume.setPhase()` sits behind the
   * read-before-write gate (`VMU_RESUME_WRITE_BEFORE_READ`), and the entry's recovery chain is what normally performs
   * that first read - so a control transition that happens BEFORE recovery would silently leave the projection empty.
   * Reading here is idempotent, and a store-less kernel still fails by name (logged, projection stays `present:false`).
   */
  const writePhase = async (value, why) => {
    try {
      if (typeof resume.read === 'function') await resume.read()
      await resume.setPhase(value, { why })
    } catch (e) {
      log('resume.setPhase(' + value + ') not applied: ' + String((e && e.message) || e))
    }
  }
  // ROUND 3 / task-20: the attach loop is a FUNCTION called at the END of this factory (see `attachDeclaredProjections()`
  // below `records`), because `meetings`/`ballotbox` are constructed after the resume block - running it here measured as
  // `Cannot access 'meetings' before initialization`. The adapter lambdas above are late-bound, so the call site is the
  // only thing that had to move.
  // ROUND 9 / task-66 (Lead's 11c/11d finding, reader-a's drill) — WHY THIS TABLE EXISTS AT ALL.
  // MEASURED DEFECT: `methodsOf` listed only `tasks`, and the attach loop handed every other face `[]`. With no
  // method wrapped there is no `after` hook, and the `after` hook is the ONLY thing that writes a `mode:'state'`
  // projection through — so `members`/`meetings`/`ballotbox`/`minutes`/`chat`/`panel`/`budget` could be declared in
  // `vmu.resume.projections`, report `attached:true`, and NEVER reach the store (reader-a's probe: two meetings
  // opened, `settle()` called, and the durable `meetings` key was still the store's `[]` seed). "A projection was
  // attached" is NOT "the projection is durable" — the second fact needs the wrapped methods.
  //
  // THE RULE. `tasks` is a JOURNAL: its list is the set of COMMANDS to record (a reader must never be recorded,
  // because hydrate REPLAYS the recorded calls). Every other face here is a STATE projection, where the wrapper
  // snapshots after the call — so the safe default is INVERTED: wrap every public method EXCEPT the read-only set
  // below. A read wrapped by mistake costs one snapshot; a MUTATOR left out loses the mutation, which is the
  // failure that was measured. Both the set and the per-face wrapped lists are printed by `status()`.
  const PROJECTION_READ_ONLY = new Set([
    'status', 'snapshot', 'restore', 'list', 'view', 'get', 'board', 'audit', 'history',
    'keysUsed', 'partition', 'config', 'refusals', 'policy', 'quotaState', 'speakCount', 'maySpeak',
    'roles', 'roster', 'may', 'selfReports', 'selfReportHistory', 'fieldsOf', 'timesOf',
    'remaining', 'totals', 'perTaskShare', 'quorum', 'receiptsView', 'tier', 'isLight',
    'truthWriteRefusal', 'lapseDue', 'gaps', 'zones', 'resolutions', 'supplements', 'supplementOf',
    'minutes', 'verbatim', 'queue',
  ])
  // The JOURNAL command lists (explicit on purpose: an over-broad list would record reads as commands).
  const PROJECTION_COMMANDS = { tasks: ['create', 'assign', 'transition', 'brief', 'clearBrief', 'advance', 'rollback'], work: [] }
  // ROUND 10 / task-74: declared-name aliases for the projection table. ONE entry, named and reported - the pack
  // declares `ballots`, this assembly's adapter (and the durable key) is `ballotbox`.
  const PROJECTION_ALIASES = { ballots: 'ballotbox' }
  const projectionMethods = (face, target) => {
    const explicit = PROJECTION_COMMANDS[face]
    if (Array.isArray(explicit) && explicit.length) return explicit
    if (!target || typeof target !== 'object') return []
    return Object.keys(target).filter((k) => typeof target[k] === 'function' && !PROJECTION_READ_ONLY.has(k) && k.charAt(0) !== '_')
  }
  const attachDeclaredProjections = () => {
    const declaredProjections = Array.isArray(settings['vmu.resume.projections']) ? settings['vmu.resume.projections'] : []
    // The live instances each adapter wraps. `meeting`/`ballot` are excluded on purpose (per-session factories).
    const targets = { tasks, members, meetings, ballotbox, minutes, chat, panel, budget }
    for (const key of declaredProjections) {
      const face = String(key)
      // `human` is attached by its own dedicated block above (it exists unconditionally and is not in the adapter
      // table), so the declared list must not re-report it as "not attached".
      // ROUND 10 / task-74 (reader-a's 12f, measured on a REAL assembly): the v5r pack declares `ballots` while this
      // adapter table names the SAME face `ballotbox`. The declaration therefore produced
      // `notAttached: [{face:'ballots', reason:'no adapter in this assembly'}]` and the board was NEVER projected
      // (two real boxes opened, `shutdown()`, the durable key still the store's seed). The alias below maps the
      // declared name onto the ONE adapter - the store key stays `ballotbox`, both names are reported, and a
      // declaration that names BOTH simply attaches once (`ballotbox` wins; attaching the same key twice would
      // double-wrap the face). A NAMED mapping, not a second silent spelling.
      const canonical = PROJECTION_ALIASES[face] || face
      const viaAlias = canonical === face ? null : face
      // NAMED TOLERANCE, NEVER SILENT (Lead ruling, round 10): the OLD spelling still attaches - an existing
      // deployment must not lose its board because of a rename - but the operator is TOLD, on the kernel's log and in
      // `status().projections`, instead of the name quietly attaching nothing (which is what it did before).
      if (viaAlias) {
        try { log({ type: 'vmu/deprecated-projection-name', declared: viaAlias, attached: canonical, at: clock(),
          note: 'the adapter and the durable key are ' + canonical + '; the declared name ' + viaAlias + ' is a deprecated alias' }) } catch (e) { /* logging never breaks the attach */ }
      }
      if (attachedProjections.some((a) => (a.face === canonical || a.face === face) && a.attached)) continue
      // ROUND 10 / task-74 (vmu-pack's probe): a declared face whose service is NULL gets a DEPLOYMENT-readable
      // reason instead of the internal-sounding "attachProjection needs a target object". `members` is the live case:
      // `createMembers` returns null unless slots/maxLiveMembers are declared (zero-mechanism), so there is genuinely
      // nothing to wrap - and saying that is different from reporting an internal refusal code.
      if (!targets[canonical] || typeof targets[canonical] !== 'object') {
        attachedProjections.push({ face, attached: false, code: 'VMU_RESUME_NO_TARGET',
          reason: 'this assembly has no ' + canonical + ' face to project: the service is null because nothing declared it (zero-mechanism - e.g. members needs slots/maxLiveMembers), so there is no target object to wrap; the key stays unwired rather than pretending' })
        continue
      }
      const make = RESUME_PROJECTION_ADAPTERS[canonical]
      if (typeof make !== 'function') { attachedProjections.push({ face, attached: false, reason: 'no adapter in this assembly (the service does not expose a journal/snapshot seam yet)' }); continue }
      try {
        const adapter = make()
        // The INSTANCE method registers the projection so `hydrate()`/`snapshot()` can find it; the module-level
        // `attachProjection` would wrap the methods but leave the instance unaware of the key.
        const out = resume.attachProjection({ target: targets[canonical], methods: projectionMethods(canonical, targets[canonical]), key: adapter.key, mode: adapter.mode,
          list: adapter.list || null, snapshot: adapter.snapshot || null, restore: adapter.restore || null, replay: adapter.replay || null })
        attachedProjections.push({ face: canonical, viaAlias, attached: true, mode: adapter.mode, key: adapter.key, methods: projectionMethods(canonical, targets[canonical]), wrapped: out.wrapped, missing: out.missing })
      } catch (e) {
        attachedProjections.push({ face, attached: false, reason: String((e && e.message) || e), code: (e && e.code) || null })
      }
    }
  }
  // ROUND 3 / task-20 D (reader-a's task-18): THE APPROVAL QUEUE + VETO LEDGER ARE DURABLE. Attached
  // UNCONDITIONALLY (the human face always exists; `vmu.resume.projections` governs only the optional faces), with the
  // exact method list reader-a specified - `gate` is deliberately NOT listed because it calls `approvalDecision()`
  // internally, so listing both would record the same decision twice.
  if (human && typeof human.snapshot === 'function' && typeof human.restore === 'function') {
    try {
      const out = resume.attachProjection({ target: human,
        methods: ['veto', 'explainDecision', 'liftVeto', 'openApproval', 'decide', 'approvalDecision'],
        key: 'human', mode: 'state', snapshot: () => human.snapshot(), restore: (v) => human.restore(v),
        list: () => (typeof human.queue === 'function' ? human.queue().requests : []) })
      attachedProjections.push({ face: 'human', attached: true, mode: 'state', key: 'human', wrapped: out.wrapped, missing: out.missing })
    } catch (e) {
      attachedProjections.push({ face: 'human', attached: false, reason: String((e && e.message) || e), code: (e && e.code) || null })
    }
  } else {
    attachedProjections.push({ face: 'human', attached: false, reason: 'the human face exposes no snapshot()/restore() in this assembly' })
  }
  // `PROJECTION_KEYS` is the framework's full list; the difference between it and what this assembly attached is
  // reported (named), so "which durable keys actually have a writer" is answerable from status().
  const projectionReport = () => ({
    declared: Array.isArray(settings['vmu.resume.projections']) ? settings['vmu.resume.projections'].slice() : [],
    attached: attachedProjections.filter((a) => a.attached).map((a) => a.face),
    notAttached: attachedProjections.filter((a) => !a.attached).map((a) => ({ face: a.face, reason: a.reason, code: a.code || null })),
    // ROUND 9 / task-66: WHICH methods were wrapped, per attached face. This is the fact that makes a projection
    // durable (the wrapper's after-hook is what writes through), so it is reported rather than inferred from
    // `attached:true` - the two were confused before and the projections silently never reached the store.
    wrappedMethods: attachedProjections.filter((a) => a.attached).map((a) => ({ face: a.face, mode: a.mode, methods: (a.methods || []).slice(), wrapped: a.wrapped === undefined ? null : a.wrapped })),
    // ROUND 10 / task-74: the declared-name → adapter mappings that were in force, and which faces were attached
    // THROUGH one (`viaAlias`), so `attached:['ballotbox']` next to `declared:['ballots']` is never confusing.
    aliases: Object.assign({}, PROJECTION_ALIASES),
    viaAlias: attachedProjections.filter((a) => a.attached && a.viaAlias).map((a) => ({ declared: a.viaAlias, attached: a.face, key: a.key })),
    readOnly: [...PROJECTION_READ_ONLY].sort(),
    known: PROJECTION_KEYS.slice(),
    unwiredKnown: PROJECTION_KEYS.filter((k) => !attachedProjections.some((a) => a.face === k && a.attached)),
  })

  // CONSUMER WIRING (round 19, the point an independent reviewer made): a clock guard that nobody uses changes
  // nothing - a backwards clock would still silently extend every TTL and keep every pending idempotency entry
  // alive forever. The guard is therefore built FIRST and its `now()` is handed to every module whose semantics
  // depend on elapsed time; the rest of the kernel keeps the raw clock, so the blast radius stays small.
  // ROUND 21: the math-tool policy layer makes 45 of the declared `vmu.math.*` knobs genuinely change behaviour
  // (a receipt carries an `enforced[]` list WHERE THE MODULE HAS ONE - not every service keeps such an array, and
  // the ones that do not must not be described as if they did; see docs/11 §4.2 for the guard-surface registry),
  // and the projection migrator is what keeps an old on-disk projection from being silently dropped when the
  // kernel's own version moves.
  // ★★★ ROUND 39 (measured): THE MATH SEAM, NOT THE SCRIPT BRIDGE. `mathtools` speaks {op, args, seed, backend,
// limits}; the script-bridge seam speaks {file, args}. Injecting the bridge made every computation attempt travel
// through a seam that could not understand it - and, because that seam is async and its refusals were not awaited,
// it also armed the unhandled rejection that took the host process down. The math surface is built from `host` and
// is exactly the seam this face wants. It is resolved LAZILY (a kernel with no math host must still construct), and
// `mathtools` already refuses by name when no seam is available.
const mathtools = createMathTools({ settings: settingsView, bus, clock: guardedClock, log, library: libraryRef,
  spawn: (req) => mathSurface().run(req) })
  // `projmigrate` is built EARLIER now: the idempotency ledger needs it at construction so an old on-disk
  // projection is migrated instead of silently discarded.
  // ROUND 22: three more declared-knob families become behaviour, each following the mathtools standard (the
  // receipt lists the keys it actually enforced, and anything unwired is named rather than silently ignored).
  // P0 (Lead): the real instance lands in the HOLDER the late-bound seam reads, and the local name is kept so the rest
  // of this file is unchanged. No `const`→`let` double declaration, and no early access can hit the TDZ.
  // ── F51 (task-89) / Lead ruling: THE DURABLE MEETING-DOMAIN MARKER, ON THE EXISTING `meetings` KEY ──────────
  // `kernel/meetings.js` owns the domain vocabulary and asks for `durable: { read(), write(rows) }` with
  // `rows = [{id, state}]`, `state ∈ open|lapsed|closed`. ★ NO NEW KEY (the ruling): the rows live INSIDE the
  // existing `meetings` projection envelope.
  // ★★ MEASURED (this is the part that matters): the DURABLE CARRIER is `domainState`, which `markState()` sets on
  // the meeting object BEFORE the projection wrapper snapshots it - so the wrapper's own envelope
  // (`value.data.live`) carries the marker. The `domainRows` field this seam stamps in `write()` is a CONVENIENCE
  // only: the wrapper's next `patch` REPLACES `value` and drops it (measured: after a mutation the envelope's
  // `value` is the fresh snapshot again). `read()` therefore falls back to deriving the rows from `value.data.live`
  // and is exact either way - which is why a restart answers "which meeting is still open" without a second key.
  // NO STORE ⇒ `durable: null`, and the face then reports `status().durableMarker.bound === false` (named, never
  // faked) with `openMeetings()` claiming NOTHING about a previous process.
  const domainRowsOf = (env) => {
    const pick = (rows) => (Array.isArray(rows) ? rows : [])
      .filter((m) => m && typeof m.id === 'string')
      .map((m) => {
        const raw = m.domainState !== undefined ? m.domainState : m.state
        return { id: String(m.id), state: raw === 'closed' ? 'closed' : (raw === 'lapsed' ? 'lapsed' : 'open') }
      })
    if (!env || typeof env !== 'object') return []
    const value = env.value && typeof env.value === 'object' ? env.value : null
    if (!value) return []
    if (Array.isArray(value.domainRows)) return pick(value.domainRows)   // the field this seam stamps (below)
    const data = value.data && typeof value.data === 'object' ? value.data : {}
    const rows = []
    for (const bag of [data.live, data.archive]) {
      if (Array.isArray(bag)) { rows.push(...pick(bag)); continue }
      // `ser()` writes a Map as {__map:[[k,obj], …]} and may hand it back as a JSON STRING; an unreadable bag
      // contributes nothing (a read ERROR is what the face turns into its named refusal).
      if (typeof bag === 'string') {
        try { const p = JSON.parse(bag); if (p && Array.isArray(p.__map)) rows.push(...pick(p.__map.map((e) => e[1]))); else if (Array.isArray(p)) rows.push(...pick(p)) } catch (e) { /* unreadable: contributes nothing */ }
        continue
      }
      if (bag && typeof bag === 'object') rows.push(...pick(Object.values(bag)))
    }
    return rows
  }
  const meetingsDomainSeam = store ? {
    read: () => domainRowsOf(store.read('meetings')),
    write: (rows) => store.patch('meetings', (env) => {
      if (!env || typeof env !== 'object') return env
      const value = env.value && typeof env.value === 'object' ? env.value : {}
      const stamped = (Array.isArray(rows) ? rows : []).map((r) => ({ id: String(r && r.id), state: r && r.state }))
      return Object.assign({}, env, { value: Object.assign({}, value, { domainRows: stamped }) })
    }),
  } : null
  // ROUND 12 / task-97 (vmu-pack's ④): THE MEETING FACE'S BALLOT SEAM. Without it `mirrorVote()` returns
  // `reason:'no-seam'` BEFORE it ever asks `boxFor`, so a bound policy could never be observed working. The board
  // (`ballotbox`) is constructed a few lines BELOW, so this seam is LATE-BOUND (an arrow reading the later `const`):
  // `cast` only runs at vote time, never during construction. THE POLICY STAYS OUT: `boxFor` decides WHICH box and
  // the option vocabulary (`kernel/meetingmarker.js`), this adapter only performs the cast it was handed.
  const meetingBallot = {
    cast: (a) => {
      const args = a || {}
      if (!args.boxId) return { ok: false, code: 'VMU_MEETING_BOX_UNMAPPED', message: 'the ballot mirror needs a boxId (boxFor answered none)' }
      return ballotbox.cast({ boxId: String(args.boxId), by: String(args.by || args.member || ''), choice: args.value })
    },
  }
  meetingsRef.current = createMeetings({ settings: settingsView, bus, clock: guardedClock, log, durable: meetingsDomainSeam, ballot: meetingBallot, members: memberRef })
  const meetings = meetingsRef.current
  // ROUND 9 / task-66 A (G7): the board's cast/settle commits through the SAME durable log as the mailbox — one
  // instance, one ticket sequence, so a recovery replay has a single order to follow. Absent store ⇒ the board's
  // `cast` runs unchanged (named degradation, no pretend durability).
  const ballotbox = createBallotBox({ settings: settingsView, bus, clock: guardedClock, log, durableQueue: sharedCommitLog })
  const records = createRecords({ settings: settingsView, bus, clock: guardedClock, log })
  // ★ PHASE 9 / goal 3: the environment adapter — table + probe + report, no installs. The spawn seam may be null; probe
  // then returns a NAMED result instead of fabricating a version.
  const env = createEnvFace({ settings: settingsView, spawn, records, log })
  // ★★★★★★★ SLV (the measured data-loss defect): the records projection was created WITHOUT a durable seam, and its
  // own header says persistence is delegated ("store"/"library"). The pack's data plane writes here, so a restart lost
  // every card while the tick journal still reported them. The `records` state key is already in store.PUBLIC_KEYS
  // (reserved, no writer) - this is the writer: hydrate on boot, snapshot after every mutation. Ids/track/kind/body are
  // preserved so plan references (e.g. r-32) survive the restart.
  const recordsStore = store && typeof store.read === 'function' && typeof store.write === 'function' ? store : null
  const recordTracks = (() => {
    const t = settings && settings['vmu.records.tracks']
    return Array.isArray(t) && t.length > 0 ? t.slice() : null
  })()
  let recordsHydrated = false
  let hydratingRecords = false
  // ★ The store opens ASYNCHRONOUSLY, so hydration is LAZY: each access retries once until it succeeds. (Hydrating at
  // construction ran before `store.open()` and silently restored nothing - a data-loss bug hiding behind a green probe.)
  const hydrateRecords = () => {
    if (!recordsStore || recordsHydrated || hydratingRecords) return
    hydratingRecords = true
    try {
      const saved = recordsStore.read('records')
      recordsHydrated = true
      if (Array.isArray(saved) && saved.length > 0) {
        let restored = 0
        for (const row of saved) {
          try {
            if (!row || !row.track || !row.kind) continue
            records.put({ id: row.id, track: row.track, kind: row.kind, title: row.title, body: row.body, tags: row.tags, settled: true, by: row.by || 'restore' })
            restored += 1
          } catch (e) { log('vmu records restore: ' + String((e && e.message) || e)) }
        }
        log('vmu records restored: ' + restored + '/' + saved.length)
      }
    } catch (e) {
      // store not open yet: leave recordsHydrated false so the next access retries
      log('vmu records hydrate (will retry): ' + String((e && e.message) || e))
    } finally { hydratingRecords = false }
  }
  const snapshotRecords = () => {
    if (!recordsStore || hydratingRecords) return
    try {
      const tracks = recordTracks || (settings && settings['vmu.records.tracks'])
      if (!Array.isArray(tracks)) return
      const rows = []
      for (const track of tracks) {
        for (const head of records.list({ track, limit: 0 }).items) {
          const r = records.get({ id: head.id })
          rows.push({ id: r.id, track: r.track, kind: r.kind, title: r.title, body: r.body, tags: r.tags, by: r.by })
        }
      }
      const wrote = recordsStore.write('records', rows)
      if (wrote && typeof wrote.catch === 'function') wrote.catch((e) => log('vmu records persist: ' + String((e && e.message) || e)))
    } catch (e) { log('vmu records persistence: ' + String((e && e.message) || e)) }
  }
  if (recordsStore) {
    const wrap = (name, { snapshot = false, hydrate = false } = {}) => {
      const original = records[name]
      if (typeof original !== 'function') return
      records[name] = function wrappedRecordsAccess(arg) {
        if (hydrate) hydrateRecords()
        const out = original.call(records, arg)
        if (snapshot) { try { snapshotRecords() } catch { /* persistence must not break the mutation */ } }
        return out
      }
    }
    wrap('put', { snapshot: true })
    wrap('supersede', { snapshot: true })
    wrap('list', { hydrate: true })
    wrap('get', { hydrate: true })
  }
  // ── ROUND 2 (task-14): THE APPROVAL GATE, ATTACHED TO THE REAL FACES ──────────────────────────────────
  // Lead's requirement: an undeclared action runs; a GATED action may only QUEUE until a human decides (a real gate,
  // not a label). `attachApprovalGate` wraps the named mutating methods, so the WRAP is what enforces it - and only
  // methods that REALLY EXIST are wrapped (`gateMethods`), because a typo in this list would silently leave a method
  // ungated. `vmu.human.gatedActions` decides which actions are gated (empty ⇒ none). Placed HERE, after
  // meetings/ballotbox exist: an earlier position measured as a TDZ error (`Cannot access 'ballotbox' before
  // initialization`) because those two faces are constructed after the turn block.
  const attachApprovalGates = () => {
    const gateMethods = (target, names) => names.filter((n) => target && typeof target[n] === 'function')
    const gateReport = []
    if (typeof human.gate === 'function') {
      const attach = (label, target, names, subjectOf) => {
        const methods = gateMethods(target, names)
        if (!target || methods.length === 0) { gateReport.push({ face: label, attached: false, reason: 'no such face or no matching methods' }); return }
        const out = attachApprovalGate({ target, methods, gate: human.gate, subjectOf, face: label })
        gateReport.push({ face: label, attached: true, methods, missing: (out && out.missing) || [] })
      }
      attach('vmu.tasks', tasks, ['create', 'assign', 'transition', 'brief', 'clearBrief', 'advance', 'rollback'], (m, a) => (a && (a.title || a.id)) || null)
      attach('vmu.ballotbox', ballotbox, ['open', 'freeze', 'unfreeze', 'cast', 'close', 'reopen'], (m, a) => (a && a.target) || null)
      attach('vmu.meetings', meetings, ['convene', 'open', 'speak', 'vote', 'close', 'recess'], (m, a) => (a && (a.topic || a.id)) || null)
      // ROUND 4 / task-25 E — COVERAGE ASSESSMENT, ANSWERED BY EXTENDING WHERE IT IS SOUND.
      // The gate is ZERO-MECHANISM by default (`vmu.human.gatedActions` empty ⇒ nothing queues), so wrapping a face
      // costs nothing until a deployment names an action - which makes "cover every authority face" the right default.
      // Added below: the institutional faces whose methods ARE authority acts (a human may legitimately have to approve
      // them). Every name is filtered by `gateMethods`, so a wrong name shows up in `missing` instead of silently
      // leaving a method ungated.
      attach('vmu.records', records, ['datasetRegister', 'put', 'supersede', 'remove', 'purge', 'rebuttal'], (m, a) => (a && (a.kind || a.id || a.dataset)) || null)
      attach('vmu.library', library, ['append', 'retract', 'supersede', 'publish'], (m, a) => (a && (a.kind || a.statement)) || null)
      attach('vmu.publication', publication, ['publish', 'retract', 'register', 'release'], (m, a) => (a && (a.title || a.id)) || null)
      attach('vmu.trust', trust, ['signal', 'dispute', 'endEngagement'], (m, a) => (a && (a.subject || a.member)) || null)
      attach('vmu.custody', custody, ['hold', 'release', 'transfer', 'seal'], (m, a) => (a && (a.artifact || a.id)) || null)
      attach('vmu.ip', ip, ['disclose', 'dispute', 'transfer', 'hold', 'release'], (m, a) => (a && (a.claim || a.id)) || null)
      attach('vmu.resource', resource, ['allocate', 'release', 'reserve', 'revoke'], (m, a) => (a && (a.resource || a.id)) || null)
      // DELIBERATELY NOT GATED, named rather than left to look like an oversight:
      //  · `budget`/`metrics`/`audit`/`idempotency`/`stateversion`/`work` are ACCOUNTING, not authority: an approval
      //    gate there would let a human block the ledger from recording what ALREADY happened, which is the one thing a
      //    truthful ledger may never do.
      //  · `members` is roster ADMINISTRATION: gating it would let a pending approval lock the institution out of its
      //    own roster changes (the pack's own `requires`/roles are the right place for that policy).
      //  · `paper` has NO instance in this assembly (nothing constructs it here), so there is nothing to wrap.
      //  · `meeting`/`ballot` are PER-SESSION factories: the gate wraps the SINGLE live instance this kernel owns
      //    (`meetings`/`ballotbox` above); wrapping "the last one created" would gate an arbitrary instance.
    } else {
      gateReport.push({ face: '(all)', attached: false, reason: 'this kernel has no approval gate (kernel/human.js exposes none)' })
    }
    approvalGateReport = gateReport   // exposed through status() so "which face is gated" is answerable
  }
  // ROUND 3 / task-20: EVERY FACE NOW EXISTS, so the declared durable projections are attached HERE. The loop lives
  // here (not beside `createResume`) because `meetings`/`ballotbox` are constructed after that block - running it there
  // measured as `Cannot access 'meetings' before initialization`.
  attachDeclaredProjections()
  // ROUND 339: the TURN LOOP as a service (docs/26). Constructed here, once the faces it dispatches into exist,
  // so a host that installs only the framework can run a member turn. Delivery goes through the host seam; with no
  // seam it refuses by name rather than pretending a member answered.
  // ROUND 1 / K3: the seam is RESOLVED ONCE here, so `status().seams` reports the same fact the loop was built
  // from (the E2 lesson: a seam report rebuilt by inference can claim a seam the consumer never received).
  const turnDeliverSeam = typeof deliverTurn === 'function' ? deliverTurn
    : (host && typeof host.deliverTurn === 'function' ? host.deliverTurn : null)
  // ROUND 4: named, not inferred - the same lesson as `turnDeliverSeam` above.
  const sendMessageSeam = typeof sendMessage === 'function' ? sendMessage : null
  const interruptSeam = typeof interrupt === 'function' ? interrupt : null
  const turn = createTurnOrchestrator({
    sectionPolicy: sectionPolicy || null,
    noticeBlock: noticeBlock || null,
    extraPhases: extraPhases || null,
    // ★★★★★★★ PHASE 6 / K10 WIRING: THE LOOP'S BUS WAS NEVER HANDED OVER, SO `turn/reply-parsed` COULD NOT FIRE.
    // `kernel/turn/index.js:1009` emits that hook (the ONLY producer in the tree) inside `if (bus && ...)`, and the
    // orchestrator defaults `bus = null` - measured: a real kernel ran two turns and the hook's hit counter stayed 0,
    // so `bus.rewriteOf` (K10's whole point) rewired nothing in a real deployment while its unit test stayed green.
    // The `bus` below is the SAME instance every other service and the host hooks use (constructed above this call,
    // so there is no initialization cycle: the bus never reaches for the turn loop). An EMPTY bus emits nothing, so
    // the zero-mechanism path is unchanged; a deployment that injects its own turn keeps the loop's own `typeof`
    // probes and degrades exactly as before.
    bus,
    prompt,
    faces: facesFrom({ tasks, records, library, meetings, ballotbox, formal, mathjobs }),
    // ROUND 1 / K3: the TURN delivery seam is its own kernel option (`deliverTurn`), because the wake envelope a
    // MEMBER gets from `deliver` (kernel/members.js:193 `deliver(envelope)`) is a different shape from a turn's
    // `{ turn, text }`. Before this, the only accepted source was `host.deliverTurn`, and the real host object is
    // `host-math.js`'s adapter, which has no such method - so `vibe_vmu_turn` could never deliver. The legacy
    // `host.deliverTurn` path is kept for compatibility; with neither, the loop refuses by name (VMU_ENGINE_UNAVAILABLE).
    deliver: turnDeliverSeam,
    // ROUND 347: the wakeup policy is a DECLARED setting, so the framework — not the host — decides who is woken next.
    wakeupPolicy: settings['vmu.turn.wakeupPolicy'],
    // ROUND 366: the whole resolved settings map travels with the loop, so `{{ setting:... }}` inside a section is
    // filled from configuration during a REAL round and not only in a hand-made assembly call.
    settings,
    // ROUND 4 / F9+F10 (docs/26 §3.22): the ONGOING-COMMAND seams. `kernel/turn/index.js` is their REAL READER (it
    // turns them into `sendToMember`/`interruptMember` and counts the calls); a missing one is refused there by name.
    sendMessage: sendMessageSeam,
    interrupt: interruptSeam,
    // ROUND 7 / task-54 (F44 residual closed): the Lean face owns a DURABLE notice queue (`pushNotice` /
    // `takeNoticesFor`, bounded by `LEAN_NOTICE_MAX`, "taking removes it"), and the turn loop owns the ONE-SHOT notice
    // channel that reaches a member's next prompt. This is the missing consumption point between them, so a
    // formalisation announcement really arrives in that member's next assembly instead of only being readable through
    // the face. Absent (no Lean face) ⇒ `[]`, so an assembly without Lean is byte-identical to before.
    noticeSource: (member) => (lean && typeof lean.takeNoticesFor === 'function' ? lean.takeNoticesFor(member) : []),
    // ★ G7 ④: the turn step receipt carries a bounded summary of the member's own tool calls (the host hook is the
    // only place that sees them; it writes to memberToolCallLog above). Lazy arrows: the map is declared later in
    // this function's scope, and by the time a step runs it exists.
    memberToolCalls: (member) => (memberToolCallLog.get(String(member)) || []).slice(),
    clearMemberToolCalls: (member) => { memberToolCallLog.delete(String(member)) },
  })
  // ★ PHASE 7 / round 17: THE ONE CLOSURE-VOTE CALCULATION. The turn face and kernel.status() call THIS function with the
  // SAME inputs, so "two places compute the same reading" cannot drift into eligible:[] again.
  const closureVoteInput = () => ({
    votes: turn && typeof turn.status === 'function' ? turn.status().closureVoteVotes : new Map(),
    roster: members && typeof members.roster === 'function' ? members.roster() : [],
    may: members && typeof members.may === 'function' ? (id, perm) => {
      // may() returns an OBJECT ({ ok, allowed }), not a boolean; passing it straight through enfranchised the chair.
      const r = members.may(id, perm)
      return !!(r && typeof r === 'object' ? r.allowed : r)
    } : null,
    permission: typeof settings['vmu.turn.closureVotePermission'] === 'string' && settings['vmu.turn.closureVotePermission']
      ? settings['vmu.turn.closureVotePermission'] : 'vote',
  })
  const closureVoteView = () => closureVoteOf(closureVoteInput())
  // ROUND 24: the teaching face the N13 volume declared (19 of its 24 knobs change behaviour; the five that need
  // a library, records or ontology seam are named rather than silently accepted).
  const teaching = createCourse({ settings: settingsView, bus, clock: guardedClock, log })
  // The conference face is LAYERED on the single-session policy face: it plans and reviews, `meetings` owns the
  // session. Its tests prove the layering with a counting proxy (zero calls into meetings).
  const conference = createConference({ settings: settingsView, bus, clock: guardedClock, log, meetings })
  const resource = createResource({ settings: settingsView, bus, clock: guardedClock, log })
  const ip = createIp({ settings: settingsView, bus, clock: guardedClock, log })
  const funding = createFunding({ settings: settingsView, bus, clock: guardedClock, log })
  const compliance = createCompliance({ settings: settingsView, bus, clock: guardedClock, log })
  // ROUND 4 / task-25 (reader-a's F18): the store policy implements the recovery LOCK, and `acquire` reads the clock
  // (`kernel/storepolicy.js:163`). `guardedClock` REFUSES a caller-supplied ISO-string clock (a deployment/test idiom),
  // which turned every recovery into a refusal - measured: `vmu: recovery failed: VMU_RESUME_BUSY ... NaN`. The policy's
  // clock is informational (lock `at`, waitedMs), so it gets a NORMALIZING clock: a finite number passes through
  // unchanged, anything else is parsed as a timestamp. This is the same reasoning already applied to ids/report/resume.
  const storePolicyClock = () => {
    const v = clock ? clock() : Date.now()
    if (typeof v === 'number' && Number.isFinite(v)) return v
    const parsed = Date.parse(String(v))
    return Number.isFinite(parsed) ? parsed : Date.now()
  }
  storepolicyRef.current = createStorePolicy({ settings: settingsView, bus, clock: storePolicyClock, log })
  const storepolicy = storepolicyRef.current
  const capacity = createCapacity({ settings: settingsView, bus, clock: guardedClock, log })
  const tenure = createHr({ settings: settingsView, bus, clock: guardedClock, log })
  const migration = createMigration({ settings: settingsView, bus, clock: guardedClock, log })

  // ── THE CAPABILITY GUARDS (task-170, "the eighth case") ────────────────────────────────────────────────
  // These three refusals used to live BOTH in the public guards (`requireStore()` etc.) AND as scattered
  // inline checks (e.g. the loader's kernel facade, `declareTracks`), so the guard faces had ZERO production
  // call sites: implemented, tested, and never effective on a real path. The refusal now has ONE home, and the
  // public guards plus the production sites all call it.
  const mustStore = () => {
    if (!store) {
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel has no durable root',
        'construct it with { root } - a store is never silently faked in memory')
    }
    return store
  }
  const mustLibrary = () => {
    if (!library) {
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel has no library root',
        'construct it with { root } so records can be kept on disk')
    }
    return library
  }
  const mustMembers = () => {
    if (!members) {
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'no roles were declared, so there is no roster',
        'declare role slots (a pack does this) before asking for members (D5: the kernel ships no roles)')
    }
    return members
  }
  /**
   * THE GUARD-FACE REGISTRY (task-170). Every public guard face MUST appear here with its semantics, whether
   * PRODUCTION calls it, and — for a diagnostic-only face — WHY. `status().guards` reports this table, and
   * tests/vmu-kernel.test.mjs scans the source to verify the declared production call sites really exist and
   * that no unregistered `require*` face was added (with a deliberate mutant proving the check can go red).
   */
  const GUARD_FACES = Object.freeze({
    requireStore: {
      semantics: 'returns the durable store, or refuses by name (VMU_ENGINE_UNAVAILABLE)',
      kind: 'contract', usedByProduction: true,
      productionCallSites: ['kernel/index.js: loader kernel facade `read()` (services.kernel.read)'],
      reason: null,
    },
    requireLibrary: {
      semantics: 'returns the on-disk library, or refuses by name (VMU_ENGINE_UNAVAILABLE)',
      kind: 'contract', usedByProduction: true,
      productionCallSites: ['kernel/index.js: declareTracks() (a pack declaring tracks without a root)'],
      reason: null,
    },
    requireMembers: {
      semantics: 'returns the roster, or refuses by name (VMU_ENGINE_UNAVAILABLE)',
      kind: 'diagnostic', usedByProduction: false,
      productionCallSites: [],
      reason: 'NO production path REQUIRES a roster today: consumers read the (nullable) `kernel.members` property and each module refuses by name on its own (D5: the kernel ships no roles; `declareSlots()` CREATES the roster). This face exists as a hard-contract/diagnostic entry point for callers that must not receive null; it is registered here so nobody mistakes it for a production rail.',
    },
    settingsView: {
      semantics: 'returns the READ-ONLY live settings view (property + get(k) reads)',
      kind: 'diagnostic', usedByProduction: false,
      productionCallSites: [],
      reason: 'production consumers receive the VIEW BY INJECTION at construction (30+ services get `settings: settingsView`), which is why the module graph needs no accessor. The accessor itself is a diagnostic/introspection API (and what the read-only-write trap is tested through); it is registered here for the same reason as above.',
    },
  })
  const rules = createRulesEngine({ subjects: Object.assign({}, DEFAULT_SUBJECTS, subjects), counters, settings, clock })
  // ROUND 10 / task-74 (Lead ruling (a)): THE SERVICE CATALOG a capability-gated middleware module may reach through
  // `api.services.get(name)`. It is a FUNCTION, not a snapshot, for two reasons: the faces below are `const`s declared
  // before AND after this point (a snapshot would hit the TDZ), and a lazy read can never report a face that was
  // never built. Only faces this assembly really holds answer; the CAPABILITY gate itself lives in the loader, so
  // this port answers "is it published?", not "may you have it?".
  /**
   * ★ PHASE 7 / goal 5: A PACK-REGISTERED STATUS SECTION. This is the GENERAL capability (not a single feature hole):
   * a declared module reaches it through services.get('vmu.status'); each section is a named reader; registration returns
   * a disposer and unregister removes it. The kernel only merges names into status(); it never knows what they mean.
   */
  const statusSections = new Map()
  const statusService = Object.freeze({
    registerSection(name, fn) {
      const id = typeof name === 'string' ? name.trim() : ''
      if (!id) throw refuse('VMU_INVALID_ARGUMENT', 'registerSection needs a non-empty section name', 'e.g. registerSection("paperDispatch", fn)')
      if (typeof fn !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'registerSection needs a reader function', 'the reader returns a JSON-serialisable object')
      if (statusSections.has(id)) throw refuse('VMU_INVALID_ARGUMENT', 'status section "' + id + '" is already registered', 'unregister the previous one first; a silent overwrite would hide which reader is in force')
      statusSections.set(id, fn)
      let disposed = false
      return () => { if (disposed) return { ok: true, alreadyDisposed: true, name: id }; disposed = true; statusSections.delete(id); return { ok: true, removed: id, name: id } }
    },
    unregisterSection(name) {
      const id = typeof name === 'string' ? name.trim() : ''
      if (!id) throw refuse('VMU_INVALID_ARGUMENT', 'unregisterSection needs a section name', 'pass the name previously registered')
      const had = statusSections.delete(id)
      return { ok: true, name: id, removed: had }
    },
    names() { return [...statusSections.keys()].sort() },
  })

  const middlewareServiceCatalog = () => ({
    'vmu.tasks': tasks, 'vmu.meetings': meetings, 'vmu.chat': chat, 'vmu.mailbox': mailbox,
    'vmu.panel': panel, 'vmu.minutes': minutes, 'vmu.ballotbox': ballotbox, 'vmu.members': members,
    'vmu.commitlog': sharedCommitLog, 'vmu.library': library, 'vmu.records': records, 'vmu.human': human,
    'vmu.budget': budget, 'vmu.activity': activity,
    // ROUND 19 / task-121: THE COUNTER'S OWN SEAM. `metricValues()` above can only hand the boundary what has
    // really been COUNTED, and until now nothing outside this file could count: the face was built and published,
    // but the capability-gated catalog did not list it, so a pack/policy had no way to record an observation.
    // Listing it here is the framework half (a capability a declared module may reach); WHICH indicators exist and
    // WHEN they are observed stays the pack's (it must also declare them in `vmu.metrics.indicators`, or the face
    // skips the write BY NAME — that skip is counted, never silent).
    'vmu.metrics': metrics,
    // ★★★★★★★ PHASE 6 / K2: THE TURN LOOP BECOMES REACHABLE FROM A DECLARED MODULE.
    // WHAT WAS MISSING: `vmu.turn` was already PUBLISHED to the M4 registry (line ~1466) and completely absent from
    // this capability-gated catalogue, so a pack could DECLARE `requires: ['vmu.turn']` and be checked, while a module
    // could not actually call it. That is the "declared but no path to the user" shape again, and it is what blocks
    // v3's planning/scheduling loop: a declared policy that wants to WAKE a member has no verb to do it with.
    // WHY IT IS SAFE NOW AND WAS NOT BEFORE: this catalogue is behind the loader's `trigger-workflow` capability, and
    // a module running on a `turn/*` hook could therefore call `run()` INSIDE a turn. The turn loop now refuses that
    // overlap BY NAME (`VMU_TURN_REENTRANT`) rather than nesting and silently sharing its single-turn state, so the
    // capability can be granted without the recursion hazard. The guard was added in the same change, deliberately.
    'vmu.turn': turn,
    // ★ PHASE 7: pack-registered status sections (registerSection/unregisterSection).
    'vmu.status': statusService,
    // ★ PHASE 6 / goal-3 audit P2: `vmu.middleware` was REGISTERED (the M4 contract lists it and docs/03 documents
    // `rewriteOf`) but absent from this capability-gated catalogue, so an M2 module could declare `requires` and still
    // get `VMU_NO_SUCH_OBJECT` on get(). Added here so the documented surface is reachable.
    // ★★ AND THE SAFETY ARGUMENT IS NOW WRITTEN AGAINST WHAT IS ACTUALLY GRANTED. It used to say "It is safe:
    // `rewriteOf` only READS … it executes nothing and emits nothing, so no recursion is possible" — but the
    // value granted is the WHOLE BUS, not `rewriteOf`: it carries `on`/`add` (add entries), `disable`/`enable`,
    // `status`/`entries`/`trace`, `declareTopic`/`retractTopic`, `wrapHostWaterfall`, and **`emit`**. An argument
    // about one read-only method does not justify a grant that includes emitting.
    // ★ THE RECURSION CONCERN IS ANSWERED BY A GUARD, NOT BY THE ABSENCE OF THE CAPABILITY: `emit` now refuses a
    // re-entrant emit of the hook whose handler is already running (`VMU_MIDDLEWARE_REENTRANT`, same shape as
    // `VMU_TURN_REENTRANT`), while nesting a DIFFERENT hook stays legal — v5r's stall-meeting is hooked on
    // `control/idle` and convenes a meeting, whose service emits other hooks.
    // ★ WHAT A `trigger-workflow` MODULE CAN THEREFORE DO, said plainly: add, enable/disable and inspect middleware
    // entries, declare and retract event topics, wrap the host waterfall, and originate events (other hooks only).
    'vmu.middleware': bus,
    // PHASE 6 / P1-5: the reporting face (declare/tick/emit) is documented and published, but a pack could not reach
    // it through the capability-gated catalogue. It never drives anything (`drives:false` on every receipt); `emit`
    // only DELIVERS an already-declared report, so listing it is safe for a module with `trigger-workflow`.
    'vmu.report': report,
    // PHASE 6 / P1-9: the fidelity registry already OWNS the defect markers (`passedWithdrawn`), but a pack had no
    // way to ask it - the marker was write-only. Exposing the READ-ONLY predicate (`passedWithdrawnFor`) lets the
    // verified read points check the same truth the kernel writes. It mutates nothing through this seam.
    'vmu.fidelity': fidelity,
  })
  const loader = createLoader({
    // (甲) PRODUCTION GOES THROUGH THE GUARD: this facade used to answer `null` when there was no durable root,
    // which is exactly the "silent fake" `requireStore()` exists to refuse. A module calling `kernel.read()`
    // with no root now gets the NAMED refusal (and with a root, the same state as before).
    services: {
      kernel: Object.freeze({ read: () => mustStore().read() }),
      // ★ PHASE 6 · 轮 15：★ 未配置的键**必须**回落到【声明的默认值】。
      // 缺陷实测（轮 14）：★ 内核**不把 schema 默认物化进 settings** ⇒ `api.setting('vmu.v3.mode')` 在没人设过时
      // 返回 `undefined`，★ 而 schema 声明的是 `auto`；★ 一个消费点把 `undefined` 读成「未知模式 ⇒ manual（fail-closed）」
      // ⇒ ★ **默认部署会静默进入 manual，★ 什么都不跑**。
      // 修在【访问器】而不是每个调用点：★ 说谎的是 API，★ 不是调用者。★ 要区分「操作员到底设过没有」的调用方，
      // 仍可走 `settingDef()`／`settingSource()`（★ 它们分别报声明与来源，★ 不被这里合并）✓
      setting: (k) => {
        // PHASE 6 / P0 (goal-3 audit R3): this accessor already fell back to the declared default; it now does so
        // through the ONE reader, so the M1 `setting:` predicate (same reader) and M2 modules give the same answer.
        return readSetting(settings, k)
      },
      get: (name) => { const id = String(name === undefined || name === null ? '' : name); return middlewareServiceCatalog()[id] || null },
      names: () => { const cat = middlewareServiceCatalog(); return Object.keys(cat).filter((k) => cat[k]).sort() },
    },
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
  registry.register('vmu.turn', { apiVersion: 1 }, { kind: 'service', description: 'turn loop: assemble, deliver, parse, dispatch (docs/26)' })
  registry.register('vmu.status', { apiVersion: 1 }, { kind: 'service', description: 'pack-registered status sections: registerSection returns a disposer, unregisterSection removes by name' })
  registry.register('vmu.middleware', { apiVersion: 1 }, { kind: 'service', description: 'the hook bus and its four forms' })
  // Batch-1 services (docs/11 搂9.8). Registered unconditionally, like tasks/prompt/middleware: they are
  // zero-mechanism by construction (no config 鈬?empty agenda, empty board, refusals by name).
  registry.register('vmu.governance', { apiVersion: 1 }, { kind: 'service', description: 'agenda and motions (docs/08 搂2)' })
  registry.register('vmu.board', { apiVersion: 1 }, { kind: 'service', description: 'board columns, WIP and aging (docs/08 搂4)' })
  registry.register('vmu.minutes', { apiVersion: 1 }, { kind: 'service', description: 'minutes, decisions and action items (docs/08 搂2)' })
  registry.register('vmu.budget', { apiVersion: 1 }, { kind: 'service', description: 'four-kind quotas, reservation and fairness (docs/08 搂12.5)' })
  registry.register('vmu.metrics', { apiVersion: 1 }, { kind: 'service', description: 'metric observation, KPI judgement and counted drops (docs/21 搂4)' })
  registry.register('vmu.audit', { apiVersion: 1 }, { kind: 'service', description: 'append-only audit rows, redaction before storage, counted ring drops (docs/21 搂2)' })
    registry.register('vmu.partnership', { apiVersion: 1 }, { kind: 'service', description: 'legal entities and tax field slots: registration, account binding, invoice slot validation (volume 22 §L285)' })
    registry.register('vmu.reviewers', { apiVersion: 1 }, { kind: 'service', description: 'reviewer market: COI recusal, blind mapping with tracing, concurrent load cap (volume 16 §L297)' })
  registry.register('vmu.alerts', { apiVersion: 1 }, { kind: 'service', description: 'thresholds, alert-level dedup, silences that still count, SLO tri-state (docs/21 搂5 搂13)' })
  registry.register('vmu.retention', { apiVersion: 1 }, { kind: 'service', description: 'report-first retention, permanent markers, quota tri-state, gc (docs/07 搂4.3 搂4.8)' })
  registry.register('vmu.delegation', { apiVersion: 1 }, { kind: 'service', description: 'delegation that can only narrow (S-2), expiry, revocation cascade (docs/17 搂4)' })
  registry.register('vmu.workflow', { apiVersion: 1 }, { kind: 'service', description: 'stage whitelist, gates and escalation, no stage skipping (docs/08 搂4)' })
  registry.register('vmu.trust', { apiVersion: 1 }, { kind: 'service', description: 'auditable reputation that NEVER grants authority (S-3, docs/17 搂5)' })
  registry.register('vmu.handover', { apiVersion: 1 }, { kind: 'service', description: 'handover packets: required fields named, redacted before packing (docs/17 搂11)' })
  registry.register('vmu.arbitration', { apiVersion: 1 }, { kind: 'service', description: 'arbitration: recusal, rationale, advisory vs binding made explicit (docs/17 搂6)' })
  registry.register('vmu.admission', { apiVersion: 1 }, { kind: 'service', description: 'postings, applications, probation; job titles map to slots explicitly (S-1, docs/17 搂7)' })
  registry.register('vmu.topology', { apiVersion: 1 }, { kind: 'service', description: 'collaboration topologies and path assertions, describe and assert share one rule (docs/17 搂14)' })
  registry.register('vmu.fairness', { apiVersion: 1 }, { kind: 'service', description: 'conserving allocation with a per-person cap; reputation is never a weight (docs/17 搂17)' })
  registry.register('vmu.charter', { apiVersion: 1 }, { kind: 'service', description: 'charters: frozen articles, authority that cannot exceed the parent, dissolution reasons (docs/17 搂15)' })
  registry.register('vmu.repropack', { apiVersion: 1 }, { kind: 'service', description: 'reproduction packs: required members named, seed mandatory, diffs located (docs/16 L12)' })
  registry.register('vmu.memory', { apiVersion: 1 }, { kind: 'service', description: 'institutional memory that NEVER authorizes (S-3), contradictions visible (docs/17 搂9)' })
  registry.register('vmu.bidding', { apiVersion: 1 }, { kind: 'service', description: 'auctions: deadline, rationale, reputation never prices, collusion surfaced (docs/17 搂10)' })
  registry.register('vmu.mathjobs', { apiVersion: 1 }, { kind: 'service', description: 'math jobs: timeout with partial output, complete receipts, seed required (docs/09路15)' })
  // ---- ROUND 2 (task-14): the four new faces' registrations ----------------------------------------------
  registry.register('vmu.ids', { apiVersion: 1 }, { kind: 'service', description: 'ids: the one id minter - monotonic across restarts, counters projected durably, never reuses a name (docs/07)' })
  registry.register('vmu.resume', { apiVersion: 1 }, { kind: 'service', description: 'resume: session recovery primitives - read-before-write gate, durable projections with id never reused, named interrupted outcomes (never silently passed), unacked-mail and watchdog refresh seams (docs/07)' })
  // ROUND 9 / task-66 A (G7): the ONE durable commit log the board and the mailbox share. Registered because it is a
  // CONSTRUCTED kernel service handed to two faces (the gate `audit-vmu-services` requires every constructed service
  // to be in the registry) - and because "which log do the two faces commit into" must be answerable by name.
  registry.register('vmu.commitlog', { apiVersion: 1 }, { kind: 'service', description: 'the ONE durable commit log shared by the board (kernel/ballotbox.js cast) and the mailbox (kernel/mailbox.js send): a late-bound facade over the host allocating store, one ticket sequence, absent store degrades by name (docs/03 §2)' })
  registry.register('vmu.chat', { apiVersion: 1 }, { kind: 'service', description: 'group chat: admin list, speech quota and mute are declared, hot-changed and audited (docs/17)' })
  registry.register('vmu.mathadapters', { apiVersion: 1 }, { kind: 'service', description: '数学库适配面：numpy/scipy/pandas/sympy 的会话级环境绑定、结果形状契约与具名拒（docs/09·15）' })
  registry.register('vmu.mailbox', { apiVersion: 1 }, { kind: 'service', description: 'durable per-recipient mailbox: ack only after a successful delivery, unacked remains redeliverable (docs/17)' })
  registry.register('vmu.env', { apiVersion: 1 }, { kind: 'service', description: 'environment adapter: probe/list/report over vmu.env.needs; failed probe is a result; NEVER installs or calls the network (docs/09)' })
  // ⚠ MEASURED MISTAKE, fixed here: the three registrations below were each ADDED by REPLACING the previous line
  // (the `vmu.panel` line was overwritten by `vmu.activity`, then by `vmu.fidelity`), which silently unregistered
  // `vmu.panel` and `vmu.activity` - a service with a factory, a tool face and settings keys but NO registry entry is
  // exactly the "silently unreachable" shape D-01 forbids. All three are now present.
  registry.register('vmu.panel', { apiVersion: 1 }, { kind: 'service', description: 'member state panel: overall goal, plan and running subtasks, append-only with a view audit (docs/17)' })
  registry.register('vmu.activity', { apiVersion: 1 }, { kind: 'service', description: '一次性 future-only 活动等待器：等待开始前的通知绝不唤醒、一次通知只唤醒当前一代、超时 disposer 在所有分支清理（docs/08 原语）' })
  registry.register('vmu.fidelity', { apiVersion: 1 }, { kind: 'service',
    description: '忠实性缺陷强制弃权（C-45，v5r 的 L2 option A）：declareDefect 留痕（append-only，可落 Formal/Defects/<target>.json 并 loadDefects 重载）；abstentionFor 是纯谓词；applyAbstention 是唯一强制点——被登记者在该对象上的布尔票 1/0 一律被改写为 0.5 弃权（不可由 pack 关闭）。' })
  registry.register('vmu.report', { apiVersion: 1 }, { kind: 'service', description: 'reporting: declarable report triggers (event/period/threshold), content templates, recipients and channels, an off switch whose default declares nothing, an append-only trace, and a parameter-config face whose domain and owners come from settings rather than from the kernel (docs/22 §reporting)' })
  registry.register('vmu.skills', { apiVersion: 1 }, { kind: 'service', description: 'skills: never self-appointed, expiry degrades and says so (docs/17 搂8)' })
  registry.register('vmu.publication', { apiVersion: 1 }, { kind: 'service', description: 'publication: unbroken version chain, offline archive registration, availability that refuses on-request-only (docs/16 搂7)' })
  registry.register('vmu.collab', { apiVersion: 1 }, { kind: 'service', description: 'collab: counterparty register, agreements with expiry warning, data-sharing template, joint authorship and the settlement cycle with reconciliation tolerance (docs/22 §协作)' })
  registry.register('vmu.identity', { apiVersion: 1 }, { kind: 'service', description: 'identity: principal binding, trusted issuers, claim-to-slot mapping, institutional memberships with a cap, pseudonym scopes, end-of-membership disposition and audited reads (docs/17)' })
  registry.register('vmu.human', { apiVersion: 1 }, { kind: 'service', description: 'human: veto scope and reason, observer visibility, approval waiting whose declared timeout is hold rather than allow, and dashboard scope (docs/17)' })
  registry.register('vmu.discipline', { apiVersion: 1 }, { kind: 'service', description: 'discipline: failure breaker with window and half-open probe, suspension cap, restore that needs a human, and a required post-mortem (docs/17)' })
  registry.register('vmu.custody', { apiVersion: 1 }, { kind: 'service', description: 'custody: entry ledger and chain of custody, chain-gap policy, freeze-thaw accounting with a warning threshold, destruction that keeps the reference, subject reference style and an irreversible mapping (docs/22 §2.5)' })
  registry.register('vmu.explain', { apiVersion: 1 }, { kind: 'service', description: 'explain: report detail, delegation chains and scores, a required reason with a declared length cap, event correlation by the declared key, and markdown or JSON rendering - every omission named (docs/17)' })
  registry.register('vmu.control', { apiVersion: 1 }, { kind: 'service', description: 'control: what may be paused and by which role, the watchdog interval (zero means no timer), what counts as idle and the notice-only default, the degradation ladder, and whether stopping clears the registry (docs/08)' })
  registry.register('vmu.citations', { apiVersion: 1 }, { kind: 'service', description: 'citations: the declared style, the required fields, the identifier priority that decides the key, and free text that is off by default (docs/07)' })
  registry.register('vmu.formal', { apiVersion: 1 }, { kind: 'service', description: 'formalisation: sorry refuses by default, compile failure is never a refutation (docs/09)' })
  registry.register('vmu.external', { apiVersion: 1 }, { kind: 'service', description: 'external fetch adapter: receipts for every fetch, stale never silent, conflicts surfaced (docs/16 搂8)' })
  registry.register('vmu.scheduler', { apiVersion: 1 }, { kind: 'service', description: 'scheduled triggers: timer is a seam, triggerVia defaults to report-only (docs/08 搂5)' })
  registry.register('vmu.crypto', { apiVersion: 1 }, { kind: 'service', description: 'signatures and non-repudiation: no signer means no signature is invented (docs/20 搂6)' })
  registry.register('vmu.notify', { apiVersion: 1 }, { kind: 'service', description: 'watchers and delivery: silence blocks delivery, never the record (docs/17 搂29)' })
  registry.register('vmu.lifecycle', { apiVersion: 1 }, { kind: 'service', description: 'research lifecycle L1-L24: gates delegated to the domain and publication services (docs/16 搂1)' })
  registry.register('vmu.idempotency', { apiVersion: 1 }, { kind: 'service', description: 'idempotency ledger: same key with a different payload is refused by name (K6)' })
  registry.register('vmu.replay', { apiVersion: 1 }, { kind: 'service', description: 'audit replay: pure read-only reconstruction, gaps reported (K5)' })
  registry.register('vmu.transaction', { apiVersion: 1 }, { kind: 'service', description: 'compensation transactions: a step without undo is refused at begin (K1)' })
  registry.register('vmu.ratelimit', { apiVersion: 1 }, { kind: 'service', description: 'token-bucket rate limiting on the injected clock; unlimited by default and it says so (K2)' })
  registry.register('vmu.auditchain', { apiVersion: 1 }, { kind: 'service', description: 'tamper-evident audit chain: no hash seam, no hash (N1)' })
  registry.register('vmu.stateversion', { apiVersion: 1 }, { kind: 'service', description: 'state versions and explicit migrations: no version is refused, not assumed (N4)' })
  registry.register('vmu.clockguard', { apiVersion: 1 }, { kind: 'service', description: 'monotonic clock guard, consumed by every TTL-sensitive service (N3)' })
  registry.register('vmu.mathtools', { apiVersion: 1 }, { kind: 'service', description: 'math tool policy layer: 45 declared knobs change behaviour, the rest are named as unwired (docs/09路15)' })
  registry.register('vmu.projmigrate', { apiVersion: 1 }, { kind: 'service', description: 'projection migration: an unlabelled or unreachable old document is refused, never dropped (A3)' })
  registry.register('vmu.meetings', { apiVersion: 1 }, { kind: 'service', description: 'meeting policy layer: all 47 declared vmu.meetings knobs change behaviour (docs/08)' })
  registry.register('vmu.ballotbox', { apiVersion: 1 }, { kind: 'service', description: 'ballot box: quorum is refused by name, abstention and absence counted apart (docs/08)' })
  registry.register('vmu.records', { apiVersion: 1 }, { kind: 'service', description: 'records tracks: caps refuse by name, retention counts, permanent markers cannot be deleted' })
  registry.register('vmu.teaching', { apiVersion: 1 }, { kind: 'service', description: 'teaching: outcome-to-artifact alignment refuses with the missing outcome named (docs/22 N13)' })
  // The registry's public contract is a PER-SERVICE VERSION OBJECT (D13-O3): registering with whatever the service
  // happens to export as `apiVersion` is not it - the registry refused that with VMU_INVALID_ARGUMENT, which is
  // exactly the kind of thing a gate should catch before a human does.
  registry.register('vmu.conference', { apiVersion: 1 }, { kind: 'service', description: 'conference hosting: calls for papers, review quorum, anonymity, registration cap and agenda fit (docs/08; layered on the single-session face)' })
  registry.register('vmu.resource', { apiVersion: 1 }, { kind: 'service', description: 'instrument ledger: calibration currency, trained operators, reservation conflicts and maintenance windows (docs/22)' })
  registry.register('vmu.ip', { apiVersion: 1 }, { kind: 'service', description: 'intellectual property: disclosure hold, named inventors, priority dates and family duplicates (docs/21-22)' })
  registry.register('vmu.funding', { apiVersion: 1 }, { kind: 'service', description: 'funding: account/currency scope, budget balance, cost-share policy, receipts and settlement windows (docs/13, 22)' })
  registry.register('vmu.compliance', { apiVersion: 1 }, { kind: 'service', description: 'research compliance: IRB and consent approvals, retention windows, COI disclosure and evidence packs (docs/20, 22; export control stays with domaingate)' })
  registry.register('vmu.storepolicy', { apiVersion: 1 }, { kind: 'service', description: 'storage POLICY only: backend/path validation, lock behaviour, backup counting, remote offline policy and the version-too-high stance (no IO; bytes stay with the store seam)' })
  registry.register('vmu.capacity', { apiVersion: 1 }, { kind: 'service', description: 'capacity: seats per domain, machine-hour pool, overcommit reserve, waitlist and preemption that names the victim (docs/20, 22)' })
  registry.register('vmu.tenure', { apiVersion: 1 }, { kind: 'service', description: 'personnel rules: recruitment cycle, performance cadence and evidence, tenure decision and quorum, appeals, offboarding and rotation (docs/22; seats stay with members)' })
  registry.register('vmu.migration', { apiVersion: 1 }, { kind: 'service', description: 'migration orchestration: plan, dry-run, batches, confirm, rollback points and windows (docs/07, 13); the storage policy layer owns backends, this face owns the move' })
  if (root) registry.register('vmu.store', { apiVersion: 1 }, { kind: 'service', description: 'durable, versioned state' })
  if (workLedger) registry.register('vmu.work', { apiVersion: 1 }, { kind: 'service', description: 'durable in-flight ledger (recover after restart)' })
  if (host) registry.register('math_computation', { apiVersion: 1 }, { kind: 'tool', description: 'the inherited math tool, name unchanged (D14)' })

  const packs = []
  const registrations = []
  // PHASE 6 / P0-10: THE PACK-DECLARED TOOL FACE. A pack states which tool NAMES it publishes (manifest
  // `tools[]`); the kernel only HOLDS those declarations (like slots/tracks), and the host publishes them.
  // That is the boundary this card is about: the framework never learns an institution's tool names.
  const packToolDeclarations = new Map()
  // ★ PHASE 7 (goal 4): a MEMBER TOOL FACE is a kernel capability with a host seam. The kernel validates the request
  // (member exists, names are catalogue names) and the HOST applies it to that member's live Agent; the kernel never
  // holds a DSH ctx. Catalogue = the face names the host really publishes (set by the host adapter).
  let memberToolFaceApplier = null
  let memberToolFaceCatalogue = null
  /** ★ PHASE 8 / B-1: name -> one-line purpose, registered by the HOST (the owner of the tool table). */
  let toolFaceDescriptions = null
  // ★ PHASE 7: pack-declared role -> tool face. Strategy in the pack, capability in the kernel, Agent in the host.
  const packToolFaces = new Map()
  // ★ PHASE 8 / goal 10 (round 36): pack-declared TOOL PRESENTATION — which channel a pack's tool batch prefers.
  // DECLARATION ONLY in this round: the kernel stores it and exposes ONE reader; the host translates it into the DSH
  // mechanisms (deferLoading / presentAs('ptc')) in the next round. No declaration ⇒ nothing is stored (zero mechanism).
  const packToolPresentation = new Map()
  /** ★ PHASE 8 / round 24: per-TURN overrides consumed by the pull resolver at request time (tools:"none"). */
  const memberToolOverrides = new Map()
  /**
   * ★ G7 ④: WHAT THE MEMBER CALLED INSIDE ITS TURN, as a bounded summary (name / whether a receipt exists / ok).
   * The host hook is the only place that sees the child Agent's tool calls; it reports here, and the turn step receipt
   * includes the summary so the root can see "what this member did" without reading a transcript. Full receipts are
   * NEVER stored here (the host's own receipt already carries them; this is an index, not a copy).
   */
  const memberToolCallLog = new Map()
  /** ★ PHASE 8: the member this step is currently driving, so the pull hook can resolve a one-shot child Agent. */
  let activeTurnMember = null
  /** ★ PHASE 8: named failures from the pull hook, visible in status() instead of silently skipped. */
  const toolFaceFailures = []
  /** ★ PHASE 8: diagnostics for the pull hook (registered/seen/matched/applied) — visible in status(). */
  const toolFacePullState = { registered: false, seen: 0, matched: 0, applied: 0, lastAgent: null, lastMember: null, lastSections: null, lastContexts: null, agentsSeen: [] }
  // ★ PHASE 7: the HOST owns the tool table; the kernel only holds pack DECLARATIONS. A retraction therefore has
  // to be observable to the adapter, or a pack unload leaves the names visible to the model. One observer, set by
  // the host adapter; the kernel never calls a host API itself.
  let onPackToolRetract = null
  let started = false
  // CONTROL FLOW (docs/08 搂5; the user's explicit domain). The kernel owns the STATE; a pause is a real
  // gate (task work is refused while paused) rather than a label nobody reads.
  const controlState = { state: 'running', pausedAt: null, pausedReason: null, resumes: 0, stops: 0, beats: 0, lastBeatAt: null, stoppedReason: null }
  // LIVE OBJECTS for the tool faces (docs/03 搂3.1): a session's meetings and ballots, addressable by id.
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
      sinceMs = toMs(clock()) - toMs(controlState.lastBeatAt)
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
        'construct the kernel with { host } (docs/11 搂4.1) or leave vmu.math.computation off')
    }
    return createMathSurface({ host, settings })
  }

  // ROUND 9 / task-66 B — THE EXIT FLUSH. The two durability contracts must NOT be blurred (docs/03 §2):
  //   · a STATE projection WRITES THROUGH on every mutation, so exiting owes it nothing but "wait until the
  //     in-flight writes have landed" (`settle()`);
  //   · a JOURNAL projection is APPEND-ONLY and is NOT written through, so exiting MUST flush it explicitly
  //     (`flushAll()`), or the tail of the journal is simply lost.
  // `recovery.exit()` (kernel/resume.js) is the engine's single call that does both and reports the two halves
  // SEPARATELY; this file is the ASSEMBLY side of that contract and records the outcome in `status().shutdown`.
  // Idempotent: the host may dispose more than once, and a second dispose must not re-run a flush.
  let exitFlushRecord = null
  let exitFlushInFlight = null
  const kernel = {
    enabled: true,
    bus,
    prompt,
    // ROUND 339: built lazily, because it is assembled FROM this bag's faces - and it refuses by name when the host
    // offers no delivery seam rather than pretending a member answered (docs/26 stage 3).
    turn,
    store,
    // Getters, not captured values: a pack can re-declare the institution (slots/tracks) AFTER the kernel
    // was constructed, so the public surface must always reflect the CURRENT surfaces (docs/10 搂2).
    get library() { return library },
    get members() { return members },
    get work() { return workLedger },
    // Batch-1 implementation surfaces (docs/11 搂9.8): real services, exposed the same way as tasks/prompt.
    get governance() { return governance },
    get board() { return board },
    get minutes() { return minutes },
    get budget() { return budget },
    get metrics() { return metrics },
    // ROUND 19 / task-121: the FLAT name→number reading the turn boundary hands to `report.tick({ metrics })`.
    // A method (not a getter) because it takes the aggregate/window the caller wants; it reads, never writes.
    metricValues,
    get audit() { return audit },

    /** ROUND 247: the domain compliance packs (docs/20 §9.1-§9.4), reachable like every other service. */
    get legalentity() { return legalEntity },
    get reviewers() { return reviewers },
    get alerts() { return alerts },
    get retention() { return retention },
    get delegation() { return delegation },
    get workflow() { return workflow },
    get trust() { return trust },
    get handover() { return handover },
    get arbitration() { return arbitration },
    get admission() { return admission },
  /** Deprecated alias: the family is vmu.admission now; using the old face name is early, not wrong. */
  get recruit() { return admission },
    get topology() { return topology },
    get fairness() { return fairness },
    get charter() { return charter },
    get repropack() { return repropack },
    get memory() { return memory },
    get bidding() { return bidding },
    get skills() { return skills },
    get publication() { return publication },
    get collab() { return collab },
    get identity() { return identity },
    get human() { return human },
    get discipline() { return discipline },
    get custody() { return custody },
    get explain() { return explain },
    get control() { return control },
    get citations() { return citations },
    get formal() { return formal },
    get mathjobs() { return mathjobs },
    // ROUND 2 (task-14): the four new faces, reachable like every other service.
    get mathadapters() { return mathadapters },
    get chat() { return chat },
    get mailbox() { return mailbox },
  /** ROUND 9 / task-66 A (G7): the shared commit log, reachable by name (`vmu.commitlog`). */
  get commitlog() { return sharedCommitLog },
    get panel() { return panel },
    get report() { return report },
    // ROUND 3 / task-24: the activity waiter, reachable like every other service.
    get activity() { return activity },
    // ROUND 3 / task-20: the fidelity registry (the C-45 enforcement point).
    get fidelity() { return fidelity },
    /** P1-9: the async durable-defect-load receipt (`status: pending|loaded|unavailable`, named code when unavailable). */
    fidelityLoad: () => Object.assign({}, fidelityLoad),
    /** P1-9: AWAITABLE form of the same load — `await kernel.fidelityReady()` resolves the receipt (polling not needed). */
    fidelityReady: () => fidelityLoadPromise.then(() => Object.assign({}, fidelityLoad)),
    /** The control SERVICE (`createControl`), distinct from `kernel.control()` - the control VIEW function that has
     *  occupied that name since round 1. `tune()` (the mid-flight retune face) lives on the service. */
    get controlService() { return control },
    // ⚠ NAME COLLISION, measured: `kernel.resume` ALREADY exists as the CONTROL-FLOW method (`resume(reason)`, the
    // counterpart of `pause()`), and an object literal's later method wins over an earlier getter - so a
    // `get resume()` here would be silently shadowed (the smoke test read a FUNCTION, not the recovery face).
    // The recovery face is therefore `kernel.recovery`; `resumeService` is an explicit alias for callers that
    // prefer the service name. `vmu.resume` stays the REGISTRY name.
    get recovery() { return resume },
    get resumeService() { return resume },
    /** The ONE id minter (`kernel/ids.js`) as bound by this kernel - the same singleton the id-minting modules import. */
    get ids() { return ids },
    idsStatus() { return idsStatus() },
    get external() { return external },
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
    get teaching() { return teaching },
  /** Deprecated alias: the family is vmu.teaching now. */
  get course() { return teaching },
    get conference() { return conference },
    get resource() { return resource },
    get ip() { return ip },
    get funding() { return funding },
    get compliance() { return compliance },
    get storepolicy() { return storepolicy },
    get capacity() { return capacity },
    get tenure() { return tenure },
  /** Deprecated alias: the family was renamed to vmu.tenure; a caller using the old face name is early, not wrong. */
  get hr() { return tenure },
    get migration() { return migration },
    /** The Lean face (docs/09): null unless a spawn seam was injected, so nothing is faked without one. */
    get lean() { return lean },
    /** ★ PHASE 9 / goal 3: the environment adapter (probe/list/report; it never installs). */
    get env() { return env },
    get latex() { return latex },
    /** ★ PHASE 7: the generic pack-registered status-section service (same object modules reach as vmu.status). */
    get statusService() { return statusService },
    /** ★ PHASE 7: the ONE closure-vote reading; the turn tool calls this instead of re-deriving it without a roster. */
    closureVoteView,
    tasks,
    rules,
    loader,
    bridge,
    registry,

    /** Per-object primitives: the kernel supplies the factory, the pack supplies the policy. */
    ballot: (opts = {}) => {
      const made = createBallot(Object.assign({ quorumRule: settings['vmu.meetings.quorumRule'], bus, clock,
        // ROUND 8 / task-58 (G6): hand the host's allocating store to the face, which builds its own commit log from it
        // (`createDurableCommitLog`) - the protocol stays the face's, the numbering stays the host's. Resolved at CALL
        // time inside the face, so a store that mounts after boot is still picked up.
        commitStore,
        isPaused: () => controlState.state === 'paused',
        // ROUND 3 / task-20 (reader-c's task-17): the C-45 ENFORCEMENT seam. `ballot.cast()` is the single point where
        // a registered member's boolean vote is rewritten to 0.5; without this seam the face reports
        // `status().fidelitySeam === false` and rewrites NOTHING (self-disclosed, never a pretend enforcement).
        fidelity }, opts))
      // LIVE OBJECTS (docs/03 搂3.1): the tool face addresses a ballot by id, so the kernel keeps the session's
      // live instances. This is not new policy - it is the SAME primitive, reachable by name. Bounded by
      // `liveCap` so a long session cannot grow it without limit (the oldest is evicted, and that is counted).
      if (opts && typeof opts.id === 'string' && opts.id) rememberLive(liveBallots, opts.id, made)
      return made
    },
    meeting: (opts = {}) => {
      const id = (opts && typeof opts.id === 'string' && opts.id) ? opts.id : 'm-' + (++liveSeq)
      // A1 round 10: an explicit id that is already LIVE is refused BY NAME. Overwriting it would silently
      // replace a meeting another caller is still addressing (the same guard the meetings SERVICE now has).
      if (liveMeetings.has(id)) throw refuse('VMU_CONFLICT', 'a live meeting already uses id ' + String(id), 'choose another id; a live meeting is never silently replaced')
      const made = createMeeting(Object.assign({ bus, clock, deliver,
        // PHASE 6 / P0 (goal-3 audit R1): these used to read raw and fall back to 0, turning the declared caps OFF.
        // The declared defaults (2 / 3) now come from the ONE reader, and an unconfigured deployment enforces them.
        roundTimeoutMs: readSetting(settings, 'vmu.meetings.roundTimeoutMs'),
        quotesPerMessageMax: readSetting(settings, 'vmu.meetings.quotesPerMessageMax'),
        quoteDepthMax: readSetting(settings, 'vmu.meetings.quoteDepthMax'),
        isPaused: () => controlState.state === 'paused' }, opts, { id }))
      // E2: the MEETING factory receives `deliver` on construction AND hands it to every meeting it makes.
      noteSeam('deliver', 'meetings', made ? deliver : null)
      // ★★★ A CLOSED MEETING LEAVES THE LIVE TABLE. MEASURED (probe): after `close()` the meeting STILL answered
      // `liveMeeting(id)` and still appeared in `liveList().meetings` — a table whose name promises "live" listing a
      // meeting whose own `state` says `closed` — and the id-conflict guard above then refused REUSING that id with
      // "a live meeting already uses id …", a refusal that was simply false. The only thing that ever cleared it was
      // `liveCap` eviction, so closed meetings also leaked against the cap.
      // ★ THE SIBLING REGISTRY ALREADY DOES THIS (`kernel/meetings.js` does `live.delete(m.id)` on close), so the two
      // disagreeing about what "live" means was the defect, not the removal. Nothing is lost: the meeting's own
      // append-only audit keeps `record('closed', …)`, and `summary()` still answers on the object a caller holds.
      const rawClose = made.close
      if (typeof rawClose === 'function') {
        made.close = async (...closeArgs) => {
          const result = await rawClose.apply(made, closeArgs)
          if (result && result.ok === true && result.state === 'closed') liveMeetings.delete(String(id))
          return result
        }
      }
      rememberLive(liveMeetings, id, made)
      return made
    },
    /** Look up a live meeting/ballot by the id a tool face handed out (never a guess: unknown 鈬?null). */
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
      await writePhase('running', 'start')
      return { ok: true, enabled: true, registered: registrations.slice(), dryRun,
        note: registrations.length === 0 ? 'no middleware declared: the kernel registered nothing' : undefined }
    },

    async stop(reason = null) {
      controlState.state = 'stopped'
      controlState.stops += 1
      controlState.stoppedReason = reason ? String(reason) : null
      started = false
      registrations.length = 0
      await writePhase('stopped', controlState.stoppedReason || 'stop')
      const decided = await bus.emit('control/paused', { reason: 'stopped', at: clock() }, {})
      return { ok: true, stopped: true, state: controlState.state, reason: controlState.stoppedReason,
        middleware: decided && decided.decisions ? decided.decisions.length : 0,
        middlewareRan: decided && typeof decided.ran === 'number' ? decided.ran : 0 }
    },

    /** The capability seams, refused by name when they are missing (docs/11 搂4.1). ONE home for each refusal:
     *  the production sites above call the same `must*` helpers, so a guard can no longer be "implemented and
     *  never effective" (task-170). `status().guards` discloses how far each face actually reaches. */
    math: mathSurface,
    requireStore() { return mustStore() },
    requireLibrary() { return mustLibrary() },
    requireMembers() { return mustMembers() },

    /**
     * Apply a pack. Conflicts are REFUSED, never silently merged (O4): two declarations of the same key
     * is a configuration defect, and the message names both sides.
     */
    usePack(pack = {}) {
      if (typeof packApplier !== 'function') {
        throw refuse('VMU_PACK_LOADER_UNAVAILABLE', 'this kernel has no pack loader, so usePack() refuses rather than applying a pack through a second implementation',
          'construct the kernel with { packApplier } (the entry injects it: `packApplier: (manifest) => packLoader.apply(manifest)` from kernel/pack.js) and load packs through that one path (vibe_vmu_pack / createPackLoader) - D-02 forbids two semantics for one verb')
      }
      const result = packApplier(pack)
      // The ACTIVE list is bookkeeping this face still owns (a pack that applied must appear in activePacks()/status()).
      const id = (pack && typeof pack.id === 'string' && pack.id) || (result && typeof result.id === 'string' ? result.id : null)
      if (id && !packs.includes(id)) packs.push(id)
      return result
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
      // (甲) the inline "no library root" refusal was a SECOND copy of requireLibrary()'s contract; it now calls
      // the same helper, so the guard has a real production call site (task-170).
      mustLibrary()
      if (list.length === 0) {
        throw refuse('VMU_INVALID_ARGUMENT', 'a pack must declare at least one track', 'tracks are a closed set (docs/07 搂4.2)')
      }
      const rebuildLibrary = (tracksList) => {
        library = createLibrary({
          root,
          tracks: tracksList,
          headListAt: settings['vmu.records.headListAt'],
          truncateMode: settings['vmu.records.truncateMode'],
          fingerprintPolicy: settings['vmu.records.fingerprintPolicy'],
          // The path policy must survive a RE-DECLARATION too, or a pack that declares tracks would silently
          // drop the write gate the first library had (docs/04 搂11).
          settings,
          clock,
        })
        return library
      }
      rebuildLibrary(list.slice())
      return { ok: true, tracks: list.slice() }
    },

    /**
     * PHASE 6 (goal-3 audit, half-built pair): the reverse of `declareTracks`. A pack's unload calls this and the
     * library goes back to the CONSTRUCTION-TIME tracks, so the pack's tracks stop being declared. Slots had an undo
     * entry and tracks did not, which is exactly why the rebuilt library survived an unload.
     */
    retractTracks() {
      if (!root) return { ok: true, retracted: false, note: 'no library root: track declarations do not exist here' }
      const restore = Array.isArray(initialTracks) && initialTracks.length > 0 ? initialTracks.slice() : null
      library = createLibrary({
        root,
        ...(restore ? { tracks: restore } : {}),
        headListAt: settings['vmu.records.headListAt'],
        truncateMode: settings['vmu.records.truncateMode'],
        fingerprintPolicy: settings['vmu.records.fingerprintPolicy'],
        settings,
        clock,
      })
      return { ok: true, retracted: true, tracks: restore }
    },

    /**
     * PHASE 6 / P0-10 — a pack declares the TOOLS it publishes. The kernel HOLDS the declarations; the host
     * publishes them (`host.js#toolSpecs` calls `appendPackToolSpecs`). Same boundary as
     * declareSlots/declareTracks: an institution's vocabulary never moves into the framework.
     *
     * EVERY REFUSAL IS NAMED AND NOTHING IS SILENTLY MERGED: a malformed entry, one name declared twice (in one
     * list or by two packs), or a name this kernel already publishes as a TOOL (the inherited math tool) is
     * refused. The last rule is what stops a pack from shadowing a framework tool.
     */
    declarePackTools(list = [], { by = null } = {}) {
      const source = Array.isArray(list) ? list : []
      const kernelToolNames = new Set()
      try {
        for (const svc of (registry.contract().services || [])) if (svc.kind === 'tool') kernelToolNames.add(svc.name)
      } catch { /* an unreadable contract cannot be a collision source; the host still checks its own names */ }
      const owner = by === null || by === undefined ? null : String(by)
      // PASS 1 — validate the WHOLE list and mutate NOTHING. A refusal half-way through used to leave the entries
      // already written in place (a half declaration); a batch is all-or-nothing now.
      const staged = []
      const stagedNames = new Set()
      for (const raw of source) {
        if (!raw || typeof raw !== 'object') throw refuse('VMU_INVALID_ARGUMENT', 'a declared tool must be an object', 'pass { name, description, parameters, handler }')
        const name = typeof raw.name === 'string' ? raw.name.trim() : ''
        // PHASE 6 / goal-3 audit P2: a pack tool has NO capability consumer (the host publishes it like any other tool;
        // nothing checks a capability before running it). Accepting the field would be a declaration with no effect,
        // so it is refused by name instead of being silently dropped or listed as if it meant something.
        if (raw.capabilities !== undefined) throw refuse('VMU_INVALID_ARGUMENT', 'declared tool "' + String(raw.name) + '" carries capabilities, but pack tools have no capability consumer', 'remove capabilities from the tool declaration (capabilities are enforced for MIDDLEWARE entries by the bus, not for tools)')
        if (!/^[a-z][a-z0-9_]{2,63}$/.test(name)) throw refuse('VMU_INVALID_ARGUMENT', 'a declared tool name must be lowercase [a-z0-9_], 3..64 chars: ' + JSON.stringify(raw.name), 'e.g. vibe_math_status')
        if (kernelToolNames.has(name)) throw refuse('VMU_PACK_CONFLICT', 'declared tool "' + name + '" is already published by this kernel', 'a pack cannot shadow a framework tool; rename the pack tool')
        if (stagedNames.has(name)) throw refuse('VMU_PACK_CONFLICT', 'declared tool "' + name + '" appears twice in this declaration', 'a pack declares each tool name once')
        const existing = packToolDeclarations.get(name)
        if (existing) throw refuse('VMU_PACK_CONFLICT', 'declared tool "' + name + '" was already declared by pack "' + String(existing.packId) + '"', 'two packs cannot publish one tool name; rename one of them')
        if (typeof raw.handler !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'declared tool "' + name + '" needs a handler function', 'declare tools[i].handler in the pack manifest')
        staged.push(Object.freeze({
          name,
          description: typeof raw.description === 'string' ? raw.description : '',
          parameters: raw.parameters && typeof raw.parameters === 'object' && !Array.isArray(raw.parameters) ? raw.parameters : {},
          handler: raw.handler,
          packId: owner,
        }))
        stagedNames.add(name)
      }
      // PASS 2 — commit (nothing above could abort it).
      for (const entry of staged) packToolDeclarations.set(entry.name, entry)
      return { ok: true, declared: staged.map((e) => e.name), count: staged.length }
    },

    /** ★ PHASE 7: store a pack's role -> face declaration (validated by validatePack; owner-checked by pack.js). */
    declarePackToolFaces(faces, { by = null } = {}) {
      const owner = by === null || by === undefined ? null : String(by)
      if (!faces || typeof faces !== 'object' || Array.isArray(faces)) throw refuse('VMU_INVALID_ARGUMENT', 'toolFaces must be an object role -> { allow?, deny? }', 'fix the pack manifest')
      const roles = Object.keys(faces)
      packToolFaces.set(owner === null ? '(anonymous)' : owner, { roles: roles.slice(), faces })
      return { ok: true, pack: owner, roles }
    },
    /** ★ PHASE 8: a per-turn override (e.g. tools:"none"). The pull resolver reads it; the turn tool clears it in finally. */
    setActiveTurnMember(member) { activeTurnMember = typeof member === 'string' ? member : null; return { ok: true, member: activeTurnMember } },
    currentTurnMember() { return activeTurnMember },
    /**
     * ★ G7 ④: the HOST hook reports one member tool call here (the caller has already resolved the member from the
     * child Agent + current turn). `phase:'call'` is recorded at pre-execute, `phase:'result'` at tools/result, so the
     * summary can say whether a receipt came back and whether the call succeeded. Bounded ring (64 per member).
     */
    noteMemberToolCall({ member, name = null, phase = 'call', ok = null } = {}) {
      const id = typeof member === 'string' ? member.trim() : ''
      if (!id) return { ok: false, code: 'VMU_INVALID_ARGUMENT', message: 'noteMemberToolCall needs a member', hint: 'pass member:"<roster id>"' }
      const list = memberToolCallLog.get(id) || []
      const entry = { name: typeof name === 'string' && name !== '' ? name.slice(0, 80) : null, phase: phase === 'result' ? 'result' : 'call', ok: ok === true ? true : (ok === false ? false : null), at: clock() }
      list.push(entry)
      if (list.length > 64) list.shift()
      memberToolCallLog.set(id, list)
      return { ok: true, member: id, count: list.length, entry }
    },
    memberToolCalls(member) { return (memberToolCallLog.get(String(member)) || []).slice() },
    clearMemberToolCalls(member) { return { ok: true, member: String(member), removed: memberToolCallLog.delete(String(member)) } },
    setMemberToolOverride({ member, all = false, allow = null, deny = null } = {}) {
      const id = typeof member === 'string' ? member.trim() : ''
      if (!id) throw refuse('VMU_INVALID_ARGUMENT', 'setMemberToolOverride needs a member', 'pass member:"<roster id>"')
      memberToolOverrides.set(id, { all: all === true, deny: Array.isArray(deny) ? deny.filter((x) => typeof x === 'string') : [], allow: Array.isArray(allow) ? allow.filter((x) => typeof x === 'string') : null })
      return { ok: true, member: id }
    },
    setToolFacePullRegistered(v) { toolFacePullState.registered = v === true; return { ok: true } },
    noteToolFacePull(partial = {}) { Object.assign(toolFacePullState, partial); return { ok: true } },
    toolFacePull() { return Object.assign({}, toolFacePullState) },
    noteToolFaceFailure({ member, code = 'VMU_ENGINE_UNAVAILABLE', message = null } = {}) { toolFaceFailures.push({ member: String(member), code, message: message === null ? null : String(message), at: clock() }); if (toolFaceFailures.length > 20) toolFaceFailures.shift(); return { ok: true, count: toolFaceFailures.length } },
    clearMemberToolOverride(member) { return { ok: true, member: String(member), removed: memberToolOverrides.delete(String(member)) } },
    memberToolOverride(member) { return memberToolOverrides.get(String(member)) || null },
    /**
     * ★ PHASE 8 / round 24: THE PULL RESOLVER. Read the member's CURRENT slot and the CURRENT pack declarations at
     * request time; a member hired AFTER apply therefore gets the face. Returns {member,slot,all,deny,source}; unknown
     * member is a NAMED refusal (the hook records it instead of silently skipping).
     */
    resolveMemberToolDeny(member) {
      const id = typeof member === 'string' ? member.trim() : ''
      if (!id) throw refuse('VMU_INVALID_ARGUMENT', 'resolveMemberToolDeny needs a member', 'pass member:"<roster id>"')
      let row = null
      try { row = (members.roster() || []).find((m) => m && m.id === id) || null } catch { row = null }
      if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + id + '" on this roster', 'the resolver reads the LIVE roster so late hires are covered')
      const slot = String(row.slot || '')
      const deny = new Set()
      const sources = []
      for (const [, v] of packToolFaces.entries()) {
        const face = v && v.faces ? v.faces[slot] : null
        if (!face) continue
        if (Array.isArray(face.deny)) for (const n of face.deny) if (typeof n === 'string') deny.add(n)
        sources.push('pack')
      }
      const ov = memberToolOverrides.get(id)
      let allow = null
      if (ov) { if (ov.all) { deny.add('*'); sources.push('turn') } else { if (Array.isArray(ov.allow)) { allow = ov.allow.slice(); sources.push('turn') }; for (const n of ov.deny) { deny.add(n); sources.push('turn') } } }
      return { ok: true, member: id, slot, all: deny.has('*'), deny: [...deny].filter((n) => n !== '*'), allow, source: sources.length ? sources : null }
    },
    /** ★ PHASE 7: apply the declaration to every LIVE member of that role NOW (members seated later are skipped).
     *  The receipt is per member: applied / failed, both derived from the real applier. */
    applyPackToolFaces({ by = null } = {}) {
      const owner = by === null || by === undefined ? null : String(by)
      const declared = packToolFaces.get(owner === null ? '(anonymous)' : owner)
      if (!declared) return { ok: true, applied: [], failed: [], note: 'this pack declares no toolFaces' }
      const applied = []
      const failed = []
      let roster = []
      try { roster = members.roster().filter((m) => m && m.state === 'live') } catch { roster = [] }
      for (const role of declared.roles) {
        const face = declared.faces[role] || {}
        for (const m of roster) {
          if (String(m.slot || m.role || '') !== role) continue
          try {
            const r = this.applyMemberToolFace({ member: m.id, allow: face.allow || null, deny: face.deny || null })
            applied.push({ member: m.id, role, receipt: r })
          } catch (e) {
            failed.push({ member: m.id, role, code: (e && e.code) || 'VMU_ENGINE_UNAVAILABLE', message: String((e && e.message) || e) })
          }
        }
      }
      return { ok: failed.length === 0, pack: owner, applied, failed }
    },
    /** ★ PHASE 7: remove a pack's tool-face declaration on unload (per-member host disposers are replaced by the next apply). */
    retractPackToolFaces({ by = null } = {}) {
      const owner = by === null || by === undefined ? null : String(by)
      const key = owner === null ? '(anonymous)' : owner
      const had = packToolFaces.delete(key)
      return { ok: true, pack: owner, removed: had }
    },

    /** READ-ONLY: what packs declared (for status/audit). */
    packToolFaces() { return [...packToolFaces.entries()].map(([pack, v]) => ({ pack, roles: v.roles.slice(), faces: v.faces })) },

    /**
     * ★ PHASE 8 / goal 10 (round 36): A PACK DECLARES WHICH PRESENTATION ITS TOOL BATCH USES.
     * Modes are a CLOSED set ('native' | 'ptc' | 'defer') and an unknown one is a NAMED refusal with the legal values —
     * never a silent fallback, because a typo would otherwise read as "native" and the operator would believe the
     * declaration took effect. `faces` (optional) narrows the declaration to named tools and every name must be a tool
     * this kernel actually holds (declared pack tools or a host-published face); an unknown one is refused by name.
     * THIS METHOD ONLY RECORDS; execution (deferLoading/presentAs) belongs to the host and is a later round.
     */
    declarePackToolPresentation(presentation, { by = null } = {}) {
      const MODES = ['native', 'ptc', 'defer']
      const owner = by === null || by === undefined ? '(anonymous)' : String(by)
      if (!presentation || typeof presentation !== 'object' || Array.isArray(presentation)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'toolPresentation must be an object { mode, faces? }', 'example: { mode: "ptc" } or { mode: "defer", faces: ["vibe_v5_say"] }')
      }
      for (const k of Object.keys(presentation)) {
        if (k !== 'mode' && k !== 'faces') throw refuse('VMU_INVALID_ARGUMENT', 'toolPresentation has unknown key: ' + String(k), 'allowed keys: mode, faces')
      }
      if (typeof presentation.mode !== 'string' || !MODES.includes(presentation.mode)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'unknown tool presentation mode: ' + JSON.stringify(presentation.mode),
          'legal modes: ' + MODES.join(' | ') + ' (native = today\'s full schemas; ptc = SDK list; defer = lazy schemas)')
      }
      let faces = null
      if (presentation.faces !== undefined) {
        if (!Array.isArray(presentation.faces) || presentation.faces.length === 0) {
          throw refuse('VMU_INVALID_ARGUMENT', 'toolPresentation.faces must be a non-empty array of tool names', 'omit faces to declare the whole batch')
        }
        const known = new Set([...(typeof packToolDeclarations !== 'undefined' ? [...packToolDeclarations.keys()] : []), ...(Array.isArray(memberToolFaceCatalogue) ? memberToolFaceCatalogue : [])])
        for (const n of presentation.faces) {
          if (typeof n !== 'string' || n.trim() === '') throw refuse('VMU_INVALID_ARGUMENT', 'toolPresentation.faces contains a non-string name', 'facets are tool names')
          if (!known.has(n)) {
            throw refuse('VMU_INVALID_ARGUMENT', 'toolPresentation.faces names a tool this kernel does not hold: ' + n,
              'holdable now: ' + (known.size ? [...known].slice(0, 20).join(', ') + (known.size > 20 ? ' …' : '') : '(none declared yet)'))
          }
        }
        faces = presentation.faces.slice()
      }
      packToolPresentation.set(owner, { mode: presentation.mode, faces })
      return { ok: true, pack: owner, mode: presentation.mode, faces }
    },
    /** The unload half (pack undo calls this): drop a pack's declaration. */
    retractPackToolPresentation({ by = null } = {}) {
      const owner = by === null || by === undefined ? '(anonymous)' : String(by)
      const had = packToolPresentation.delete(owner)
      return { ok: true, pack: owner, removed: had }
    },
    /**
     * THE ONE READER. Zero mechanism: NO declaration ⇒ `null` (never a fabricated 'native' default — "nothing declared"
     * and "declared native" must stay distinguishable). One pack ⇒ that declaration; several ⇒ an array of them.
     */
    packToolPresentation() {
      if (packToolPresentation.size === 0) return null
      const rows = [...packToolPresentation.entries()].map(([pack, v]) => ({ pack, mode: v.mode, faces: v.faces === null ? null : v.faces.slice() }))
      return rows.length === 1 ? rows[0] : rows
    },

    /** ★ PHASE 7: the host adapter registers the ONLY applier (it owns the Agent/ctx). */
    setMemberToolFaceApplier(fn) { memberToolFaceApplier = typeof fn === 'function' ? fn : null; return { ok: true, applier: typeof fn === 'function' } },
    /** ★ PHASE 7: the host publishes the names that MAY be named in allow/deny (core faces + pack tools). */
    setToolFaceCatalogue(names) { memberToolFaceCatalogue = Array.isArray(names) ? names.filter((n) => typeof n === 'string') : null; return { ok: true, count: memberToolFaceCatalogue ? memberToolFaceCatalogue.length : 0 } },
    /** ★ PHASE 8 / B-1: the HOST registers each published tool's one-line purpose (the kernel only reads it back). */
    setToolFaceDescriptions(map) {
      const out = {}
      if (map && typeof map === 'object') for (const [k, v] of Object.entries(map)) if (typeof k === 'string' && typeof v === 'string') out[k] = v
      toolFaceDescriptions = Object.keys(out).length ? out : null
      return { ok: true, count: toolFaceDescriptions ? Object.keys(toolFaceDescriptions).length : 0 }
    },

    /**
     * ★ PHASE 7 (goal 4): apply one member's tool face. Input { member, allow?, deny? }. Receipt carries added/removed
     * and visibleBefore/visibleAfter, both DERIVED from the host's own schemas() before/after. Named refusals:
     *   - no live member with that id            -> VMU_NO_SUCH_OBJECT
     *   - a name the host did not publish        -> VMU_INVALID_ARGUMENT (unknown face name)
     *   - no host applier / no live Agent         -> VMU_ENGINE_UNAVAILABLE
     * Zero mechanism: only a caller that asks gets a face applied; nothing changes by default.
     */

    /** ★ PHASE 8: validate names against the HOST-published tool catalogue (unknown name is a named refusal). */
    validateToolFaceNames(names) {
      if (!Array.isArray(names)) throw refuse('VMU_INVALID_ARGUMENT', 'validateToolFaceNames needs an array', 'pass the allow list')
      if (!Array.isArray(memberToolFaceCatalogue)) throw refuse('VMU_ENGINE_UNAVAILABLE', 'the host has not published its tool catalogue yet',
        'assemble the host adapter first; an unvalidated allow list could silently name a tool that does not exist')
      for (const n of names) if (typeof n !== 'string' || !memberToolFaceCatalogue.includes(n)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'unknown tool face name in tools.allow: ' + String(n),
          'known faces: ' + memberToolFaceCatalogue.slice(0, 40).join(', '))
      }
      return { ok: true, names: names.slice() }
    },
    /**
     * ★ PHASE 8 / round 37: THE VOTE TOOL'S WRITER. It records through turn.recordClosureVote, the SAME function the
     * reply's vote_solved path uses; the roster/may check is the EXISTING qualification test (no second rule).
     */
    recordClosureVote({ member, solved, why = null } = {}) {
      const id = typeof member === 'string' ? member.trim() : ''
      if (!id) throw refuse('VMU_INVALID_ARGUMENT', 'recordClosureVote needs a member', 'pass member:"<roster id>"')
      if (typeof solved !== 'boolean') throw refuse('VMU_INVALID_ARGUMENT', 'recordClosureVote needs solved:boolean', 'pass solved:true or false')
      let row = null
      try { row = (members.roster() || []).find((m) => m && m.id === id) || null } catch { row = null }
      if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + id + '" on this roster', 'only a seated member can vote')
      const permission = typeof settings['vmu.turn.closureVotePermission'] === 'string' && settings['vmu.turn.closureVotePermission']
        ? settings['vmu.turn.closureVotePermission'] : 'vote'
      const verdict = members && typeof members.may === 'function' ? members.may(id, permission) : null
      const allowed = !!(verdict && typeof verdict === 'object' ? verdict.allowed : verdict)
      if (!allowed) throw refuse('VMU_NOT_PERMITTED', 'member "' + id + '" has no closure-vote permission (' + permission + ')',
        'seat the member in a slot whose permissions include this one; the pack grants it to its voting slot')
      if (!turn || typeof turn.recordClosureVote !== 'function') throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel has no closure-vote writer', 'assemble the turn loop')
      const out = turn.recordClosureVote(id, solved, 'tool')
      const writes = (() => { try { return turn.status().closureVoteWrites } catch { return null } })()
      return { ok: true, tool: 'vibe_vmu_vote', member: id, solved: out.solved, why: why === null ? null : String(why), writes, closureVote: closureVoteView() }
    },
    /**
     * ★ PHASE 8 / B-1: THE MEMBER'S REAL TOOL TABLE, in the kernel. Names come ONLY from the live visible-tools provider
     * (turn.visibleToolsOf), never from a pack declaration; purposes come from the host's published descriptions.
     * No live Agent ⇒ the provider's NAMED refusal is propagated - never an empty list pretending success.
     */
    toolsView({ member, agent = null } = {}) {
      if (typeof member !== 'string' || member.trim() === '') throw refuse('VMU_INVALID_ARGUMENT', 'toolsView needs a member', 'pass member:"<roster id>"')
      // ★ roster FIRST: an unknown member must be refused as such, not masked by "no live Agent" from the provider.
      let row = null
      try { row = (members.roster() || []).find((m) => m && m.id === member) || null } catch { row = null }
      if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no member "' + member + '" on this roster', 'the roster holds the live members; omit member is not allowed here')
      // ★ CALLER AGENT FIRST: inside a one-shot member turn the memberSession map may not be learned yet, but the tool
      // already runs on that Agent — its own schemas are the authoritative visible set. The provider remains the
      // out-of-turn path. A caller without tools.schemas falls through (never fabricate an empty list).
      let names = null
      let source = 'provider'
      let agentId = null
      let schemaScope = null
      const agentTools = agent && agent.ctx && agent.ctx.tools
      if (agentTools && typeof agentTools.schemas === 'function') {
        // ★ schemas() with NO argument is the GLOBAL view. The tools live in the agent's SCOPE; pass the agent id as the
        // ScopeKey (measured: omitted scope returned [] for the caller agent and thus count:0).
        agentId = agent && typeof agent.id === 'string' ? agent.id : null
        // ★ dsh-scope keys a scope by the AGENT OBJECT (createScope(loopCtx, this)), not by its id string. schemas()
        // without a scope is the GLOBAL view, which is why an id string (and no argument) both returned [].
        const candidateScopes = [agent, agent.scope, agentId]
        let lastErr = null
        for (const scope of candidateScopes) {
          try { names = (agentTools.schemas(scope) || []).map((x) => (x && typeof x === 'object' ? (x.name || x.id) : x)).filter((n) => typeof n === 'string'); schemaScope = scope === agent ? 'agent' : (scope === agent.scope ? 'agent.scope' : 'agent.id'); if (names.length > 0) break } catch (e) { lastErr = e }
        }
        if (names === null) names = []
        if (lastErr && names.length === 0) schemaScope = 'failed:' + String(lastErr.message || lastErr).slice(0, 80)
        source = 'caller'
      }
      if (names === null) {
        if (!turn || typeof turn.visibleToolsOf !== 'function') throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel has no visible-tools provider', 'assemble the host adapter so members expose their tool table')
        const visible = turn.visibleToolsOf(member)
        names = visible && Array.isArray(visible.tools) ? visible.tools : []
        source = 'provider'
      }
      const purposes = toolFaceDescriptions || {}
      return { ok: true, member: String(member), count: names.length, tools: names.map((name) => ({ name, purpose: purposes[name] || null })), source, agentId, schemaScope }
    },
    applyMemberToolFace({ member, allow = null, deny = null } = {}) {
      const id = typeof member === 'string' ? member : ''
      if (id === '') throw refuse('VMU_INVALID_ARGUMENT', 'a member tool face needs a member id', 'pass { member }')
      let live = null
      try { live = members.roster().find((m) => m && m.id === id && m.state === 'live') || null } catch { live = null }
      if (!live) throw refuse('VMU_NO_SUCH_OBJECT', 'no live member with id ' + id + ' (a tool face applies to a SEATED member)',
        'seat the member first (control hire / admission), then apply its face')
      const clean = (list, what) => {
        if (list === null || list === undefined) return null
        if (!Array.isArray(list)) throw refuse('VMU_INVALID_ARGUMENT', what + ' must be an array of face names', 'pass allow/deny arrays')
        const out = []
        for (const n of list) {
          if (typeof n !== 'string' || n === '') throw refuse('VMU_INVALID_ARGUMENT', what + ' contains a non-string face name', 'face names are strings')
          if (Array.isArray(memberToolFaceCatalogue) && !memberToolFaceCatalogue.includes(n)) {
            throw refuse('VMU_INVALID_ARGUMENT', 'unknown tool face name: ' + n,
              'known faces: ' + memberToolFaceCatalogue.slice(0, 40).join(', ') + (memberToolFaceCatalogue.length > 40 ? ' …' : ''))
          }
          if (!out.includes(n)) out.push(n)
        }
        if (allow !== null && allow !== undefined && deny !== null && deny !== undefined) {
          for (const n of out) if (deny.includes(n)) throw refuse('VMU_INVALID_ARGUMENT', 'face ' + n + ' is in BOTH allow and deny', 'allow and deny must be disjoint')
        }
        return out
      }
      const allowClean = clean(allow, 'allow')
      const denyClean = clean(deny, 'deny')
      if (typeof memberToolFaceApplier !== 'function') {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'this assembly has no host applier for member tool faces',
          'the host adapter sets kernel.setMemberToolFaceApplier(fn); a kernel alone cannot change an Agent tool table')
      }
      return memberToolFaceApplier({ member: id, allow: allowClean, deny: denyClean })
    },

    /**
     * PHASE 6 / P0-10 — reverse exactly what declarePackTools added (a pack unload calls this with its names).
     * PHASE 6 (goal-3 audit, security): `by` is the pack claiming the retraction. A name owned by ANOTHER pack is a
     * NAMED refusal, and the whole batch is checked before anything is removed, so a mixed batch cannot half-succeed.
     */
    /** ★ PHASE 7: the host adapter registers the ONLY consumer of "a pack retracted its tools". Read-only. */
    setPackToolRetractObserver(fn) { onPackToolRetract = typeof fn === 'function' ? fn : null; return { ok: true, observer: typeof fn === 'function' } },

    retractPackTools(names = null, { by = null } = {}) {
      const wanted = names === null ? [...packToolDeclarations.keys()] : (Array.isArray(names) ? names : [names])
      const owner = by === null || by === undefined ? null : String(by)
      const pending = []
      for (const n of wanted) {
        const key = String(n)
        const entry = packToolDeclarations.get(key)
        if (!entry) continue
        if (owner !== null && String(entry.packId) !== owner) {
          throw refuse('VMU_NOT_PERMITTED', 'refusing to retract tool "' + key + '": it was declared by pack "' + String(entry.packId) + '", not by "' + owner + '"',
            'pass { by } naming the pack that owns the declaration; a pack cannot retract another pack\'s tools')
        }
        pending.push(key)
      }
      const removed = []
      for (const key of pending) if (packToolDeclarations.delete(key)) removed.push(key)
      // ★ PHASE 7: notify the host adapter AFTER the declaration is gone. The callback is best-effort - a retraction
      // that already removed the kernel declaration must not be reported as failed because a host call threw - but the
      // failure is RETURNED (never swallowed), so the caller can see it.
      // ★ PHASE 7: notify the HOST asynchronously. The declaration removal itself is SYNCHRONOUS (callers and the
      // existing contracts rely on that); the returned `hostRetract` promise is what pack.js awaits on unload, so the
      // host tool table is updated before the unload is considered complete.
      let hostRetract = null
      if (removed.length > 0 && typeof onPackToolRetract === 'function') {
        try {
          hostRetract = Promise.resolve(onPackToolRetract({ by: owner, removed: removed.slice() })).then(
            (r) => r,
            (e) => ({ ok: false, code: (e && e.code) || 'VMU_ENGINE_UNAVAILABLE', message: String((e && e.message) || e) }),
          )
        } catch (e) {
          hostRetract = Promise.resolve({ ok: false, code: (e && e.code) || 'VMU_ENGINE_UNAVAILABLE', message: String((e && e.message) || e) })
        }
      }
      return { ok: true, removed, count: removed.length, hostRetract }
    },

    /** READ-ONLY: the tools packs have declared. The HOST publishes these; the kernel executes nothing. */
    packTools() {
      return [...packToolDeclarations.values()].map((t) => ({
        name: t.name, description: t.description, parameters: t.parameters, handler: t.handler,
        packId: t.packId,
      }))
    },

    /** The settings this assembly was constructed with (used by pack planning and residue checks). */
    settingsSnapshot() { return Object.assign({}, settings) },
    /**
     * TASK-163: the sanctioned READ-ONLY live view of the settings, for consumers that need to read keys at
     * call time (property reads and `get(k)` both stay live). It is NOT writable: `view[k] = v` and
     * `delete view[k]` are refused by name, because a view that writes through let any consumer change kernel
     * settings without the declared-owner check. Use setSettingsValue(key, value, { by }) to write.
     */
    settingsView() { return settingsView },
    /** THE ONE APPLIES TABLE (task-166): the host tool face reads this instead of keeping its own copy. */
    appliesTable() { return APPLIES },

    /**
     * Apply a pack's settings as a LAYER on the constructed values (docs/10 搂2). Conflicts are refused
     * unless the configuration explicitly allows overrides (O4), and the caller gets back exactly what it
     * must restore: the pre-existing values for the keys it overwrote. Keys the pack introduced are simply
     * removed on rollback, so no phantom setting survives an unload.
     */
    applyPackSettings(incoming = {}, { by = null } = {}) {
      const applied = []
      const previous = {}
      // ★ ROUND 30 (task-149 A): the PACK layer is a MERGE layer ⇒ `resolveSettings([…], { onInvalid:'reject' })`
      // screens it with the SAME checker the interactive face refuses with, but with the merge-face disposition:
      // a declared-but-out-of-domain default is NOT accepted and is RECORDED (its declared default stays). This is
      // also `resolveSettings`'s first real runtime caller — before this it was unreachable code.
      const screened = resolveSettings([incoming], { onInvalid: 'reject' })
      // `resolveSettings` records the numeric LAYER index in `r.layer`, so the source label is a SEPARATE field
      // (`source`) — writing it into `layer` was silently overwritten by the record's own `layer: 0` (measured).
      for (const r of screened.rejected) settingsRejected.push(Object.assign({}, r, { source: 'pack:' + String(by || 'pack') }))
      const layer = screened.accepted[0] || {}
      for (const [key, value] of Object.entries(layer)) {
        const existed = Object.prototype.hasOwnProperty.call(settings, key)
        // Two explicit doors and NO silent third one: the blunt `vmu.packs.allowOverride`, or naming THIS exact
        // key in `vmu.packs.activeOverrides` (finer-grained - docs/04 搂11). Anything else stays a named conflict,
        // and the hint names the precise key so the operator never has to guess which door to open.
        const declaredOverride = Array.isArray(settings['vmu.packs.activeOverrides'])
          && settings['vmu.packs.activeOverrides'].includes(key)
        // either declared name opens both doors, so a deployment that read the pack handbook is not sent to a second key
        const bluntOverride = settings['vmu.packs.allowOverride'] === true || settings['vmu.packs.allowKernelOverride'] === true
        if (existed && !bluntOverride && !declaredOverride) {
          throw refuse('VMU_PACK_CONFLICT', 'pack setting ' + key + ' would overwrite an active value',
            'make the override explicit: list "' + key + '" in vmu.packs.activeOverrides, or set vmu.packs.allowKernelOverride (the name the pack handbook documents; vmu.packs.allowOverride is the same door under another name) (O4)')
        }
        if (existed) previous[key] = settings[key]
        settings[key] = value
        // ROUND 1 / K5 (D-02, vmu-pack interface): the WRITER is recorded, so `kernel.settingSource(key)` can tell a
        // pack's layer from the session's - which is exactly what `kernel/pack.js` needs to decide "this key belongs to
        // a HIGHER layer ⇒ my default is shadowed, say so" versus "it belongs to ANOTHER pack ⇒ named VMU_PACK_CONFLICT".
        markSettingWriter(settings, key, 'pack:' + String(by || 'pack'))
        applied.push(key)
      }
      packNotesLog.push({ id: by, at: clock(), what: 'settings-applied', keys: applied.slice() })
      return { ok: true, applied, previous }
    },
    /**
     * ROUND 1 / K5: WHERE a key came from, in one call. `pack:<id>` for a pack's settings layer, `runtime` for a
     * `setSettingsValue`, the entry's own layer label (e.g. `pack:v5r` for a pack default folded in before construction,
     * `config` for a deployment value) and `null` for a key nobody wrote. It is the accessor the pack loader asks,
     * because the alternative - reading `settings[key]` - cannot distinguish the layers that D-02 orders.
     */
    settingSource(key) {
      return settingWriter(settings, key) || (settingsSources && settingsSources[key]) || (Object.prototype.hasOwnProperty.call(settings, key) ? 'unknown' : null)
    },

    /**
     * The two primitives a pack rollback needs, so an unload can restore or remove a setting exactly.
     * DELEGATION (docs/04 搂11, `vmu.safety.delegableKeys`): a caller that IDENTIFIES itself (`by`) but is not
     * the key's declared owner may only write keys the configuration delegated. This is a policy hook for
     * middleware/packs - not an authorisation system: the office path and the pack rollback pass no `by`, so
     * their behaviour is unchanged, and a caller that lies about omitting `by` is not caught by design (that
     * would need host identity, which the harness does not hand us). It replaces a purely declarative comment
     * with something that refuses by name.
     */
    setSettingsValue(key, value, { by = null, reason = null } = {}) {
      // THE CONTRACT LIVES HERE (task-166): declared key, H3 read-only, declared owner. It used to live ONLY
      // in host.js, so the kernel API accepted an H3 write with `applied:'immediate'` while the tool face
      // refused the very same pair with VMU_NOT_PERMITTED — two paths, two contracts.
      const g = settingsGuard(key, by, 'set')
      // ★ ROUND 30 (task-149 A) — THE VALUE/DOMAIN GUARD'S EXECUTION POINT, SECOND OF TWO (the INTERACTIVE face).
      // A write is an explicit declaration by an operator, so an out-of-domain value is REFUSED BY NAME — the code
      // is `VMU_INVALID_ARGUMENT`, already registered and already used for this exact offence by R17's read-side
      // `strictOrderMode`. Silence here was the defect: the value used to be stored, and every reader then fell back
      // to a default (or clamped), so the receipt said "applied" while the declaration was never honoured.
      validateValue(key, value)
      settings[key] = value
      markSettingWriter(settings, key, 'runtime')
      // TASK-163 (sixth "receipt lies" case): the receipt is graded by the DECLARED hot class, so it can never
      // claim more than the kernel actually did.
      //   · H2 ("next session") ⇒ the value is stored now and takes effect on the next start: the receipt MUST
      //     carry `requiresRestart:true` (it used to say a bare `{ok:true}` while `kernel.enabled` stayed true).
      //   · H0/H1 ("immediate"/"next turn") ⇒ the change is pushed into every consumer this kernel can reach
      //     LIVE (the bus for dryRun; the audit chain reads its own knob live), and the receipt names exactly
      //     which consumers were updated and which ones captured the option at construction (disclosed, never
      //     claimed).
      const hot = g.hot
      const liveApplied = []
      const pendingConsumers = []
      if (key === 'vmu.middleware.dryRun') {
        dryRun = value === true
        liveApplied.push('kernel')
        if (bus && typeof bus.setDryRun === 'function') { bus.setDryRun(dryRun); liveApplied.push('bus') }
        // The script bridge took `dryRun` as a construction option and is NOT rebuilt here: disclosed as
        // PENDING so the receipt stays a verifiable fact rather than a promise.
        pendingConsumers.push('script-bridge')
      }
      if (key === 'vmu.audit.chain.checkpointEvery') liveApplied.push('auditchain (live read)')
      // ROUND 3 / task-20 F3 (measured on a real host): the receipt scored the key by its DECLARED hot class alone, so
      // `vibe_vmu_set vmu.turn.instituteName` answered "next session (restart required)" while the value was visible on
      // the NEXT TURN. The MEASURED live readers are now part of the verdict: an H2 key that has one is NOT a restart.
      const liveReadBy = liveReadersOf(key)
      const requiresRestart = hot === 'H2' && liveReadBy.length === 0
      const receipt = {
        ok: true, key, source: 'runtime', hot, who: g.who, ownerCheck: g.ownerCheck,
        // F3: `appliesAt` must agree with `requiresRestart` - an H2 key with a MEASURED live reader is not "next
        // session" for that reader, so the declared class is stated alongside the measured effect.
        appliesAt: hot === 'H2' && liveReadBy.length
          ? 'this session for the measured live readers (' + liveReadBy.join(', ') + '); declared class H2, so construction-time readers see it next start'
          : (APPLIES[hot] || null),
        requiresRestart,
        applied: requiresRestart ? 'next-session' : 'immediate',
        liveApplied,
        pendingConsumers,
        // F3: WHICH live readers were measured for this key (empty ⇒ the declared class is the whole truth).
        liveReadBy,
        value: value === undefined ? null : value,
        at: clock(),
        note: requiresRestart
          ? (liveReadBy.length
            ? 'declared hot class ' + hot + ': stored now and read at construction only by the faces that captured it; MEASURED: it also has LIVE readers, so it is already in force in this session for ' + liveReadBy.join(', ') + ' (the receipt neither under- nor over-reports)'
            : 'hot class ' + hot + ': this key is read ONCE at construction, so the value is stored NOW and takes effect on the next start (requiresRestart:true — the receipt does not claim more)')
          : (pendingConsumers.length
            ? 'applied live to ' + (liveApplied.join(', ') || '(the settings object only)') + '; NOT yet visible to ' + pendingConsumers.join(', ') + ' (they captured the option at construction — disclosed, not claimed)'
            : 'applied immediately (hot class ' + String(hot) + '): every consumer reads this key live'),
      }
      // ROUND 7 / task-57: the caller's `reason` is part of the record (the ledger answers "why", not only "who").
      runtimeWrites.push({ key, hot, by, reason: reason === null || reason === undefined ? null : String(reason), ownerCheck: g.ownerCheck, requiresRestart, liveApplied: liveApplied.slice(), pendingConsumers: pendingConsumers.slice(), at: receipt.at, action: 'set' })
      return receipt
    },
    /**
     * UNSET (task-166): it used to be a bare `delete settings[key]` with NO check at all — an H3 framework key
     * or an H2 switch could be removed silently by any caller. It now runs the SAME guard as set, records
     * WHO/WHEN/the PREVIOUS value, and reports the hot class in the receipt.
     */
    unsetSettingsValue(key, { by = null } = {}) {
      const g = settingsGuard(key, by, 'unset')
      const had = Object.prototype.hasOwnProperty.call(settings, key)
      const previous = had ? settings[key] : undefined
      delete settings[key]
      markSettingWriter(settings, key, 'runtime')
      const row = {
        key, by, action: 'unset', hot: g.hot, who: g.who, ownerCheck: g.ownerCheck,
        hadValue: had, previous: previous === undefined ? null : previous,
        appliesAt: APPLIES[g.hot] || null, requiresRestart: g.hot === 'H2', at: clock(),
      }
      runtimeWrites.push(row)
      return {
        ok: true, key, source: 'runtime', action: 'unset', hot: g.hot, who: g.who, ownerCheck: g.ownerCheck,
        hadValue: had, previous: row.previous, appliesAt: row.appliesAt, requiresRestart: row.requiresRestart,
        applied: row.requiresRestart ? 'next-session' : 'immediate', at: row.at,
        note: 'the key was removed at runtime and the REMOVAL IS RECORDED (who/when/previous value); the declared default applies again on the next start',
      }
    },

    /**
     * CONTROL FLOW (docs/08 搂5). `pause` is a GATE, not a label: while paused every task mutation is refused
     * by name, and the bus is told (`control/paused` / `control/resumed` / `control/heartbeat`) so middleware
     * can react. The heartbeat answers "is anyone actually working", and `wallClockMs` is the staleness budget
     * (a real consumer for a key that used to be decoration - docs/04 搂11).
     */
    async pause(reason = 'paused') {
      if (controlState.state === 'stopped') throw refuse('VMU_STATE', 'a stopped kernel cannot be paused')
      controlState.state = 'paused'
      controlState.pausedAt = clock()
      controlState.pausedReason = String(reason)
      // ROUND 4 / task-25 D (reader-a's task-18): the PHASE projection. `resume.setPhase` writes the `phase` key through
      // the read-before-write gate, so a restart can read `resume.phase()` directly. A store-less kernel (or a refusal)
      // is NAMED on the log rather than swallowed - and the projection simply stays empty (`present:false`).
      await writePhase('paused', controlState.pausedReason)
      const decided = await bus.emit('control/paused', { reason: controlState.pausedReason, at: controlState.pausedAt }, {})
      return { ok: true, state: controlState.state, reason: controlState.pausedReason, at: controlState.pausedAt,
        middleware: decided && decided.decisions ? decided.decisions.length : 0,
        middlewareRan: decided && typeof decided.ran === 'number' ? decided.ran : 0 }
    },
    async resume(reason = null) {
      if (controlState.state !== 'paused') throw refuse('VMU_STATE', 'the kernel is not paused (state: ' + controlState.state + ')')
      controlState.state = 'running'
      controlState.resumes += 1
      const wasReason = controlState.pausedReason
      controlState.pausedAt = null
      controlState.pausedReason = null
      await writePhase('running', reason ? String(reason) : 'resumed')
      const decided = await bus.emit('control/resumed', { pausedFor: wasReason, reason: reason ? String(reason) : null, at: clock() }, {})
      return { ok: true, state: controlState.state, resumedFrom: wasReason,
        middleware: decided && decided.decisions ? decided.decisions.length : 0,
        middlewareRan: decided && typeof decided.ran === 'number' ? decided.ran : 0 }
    },
    async beat(note = null) {
      // ROUND 10 / task-74 (B): THE EXISTING TICK IS THE POLLING POINT. `beat()` is what answers "is anyone actually
      // working", so idleness is evaluated HERE — BEFORE the beat resets the activity clock, using the PREVIOUS beat's
      // timestamp. That is what makes the poll meaningful: a beat after a long silent gap is exactly the moment the
      // institute resumed, and `idleState()` then publishes the registered `control/idle` hook (once per episode) so
      // middleware can implement "a stalled institute convenes" itself. COST: one synchronous predicate per beat and
      // NO timer — a stalled system with nobody beating cannot wake itself, which is stated in docs/03 §2.
      const prevBeatAt = controlState.lastBeatAt
      const idle = control.idleState({ lastActivityAt: prevBeatAt, at: clock() })
      // ★ AND THE `control/idle` MIDDLEWARE IS REPORTED. This receipt's `middleware`/`middlewareRan` describe
      // `control/heartbeat`, but the interesting policy — a stall that convenes a meeting — is hooked on `control/idle`,
      // which `idleState()` emits internally. Its result used to be DROPPED, so a live beat said `middleware: 0` while a
      // meeting had just opened. `idleState()` stays synchronous and hands back the pending promise as `emitSettled`;
      // beat() is async, so it awaits it here and reports the two numbers under the `idle` block where they belong.
      let idleEmitted = null
      try { idleEmitted = idle.emitSettled ? await idle.emitSettled : null } catch { idleEmitted = null }
      controlState.beats += 1
      controlState.lastBeatAt = clock()
      const decided = await bus.emit('control/heartbeat', { beats: controlState.beats, at: controlState.lastBeatAt, note: note ? String(note) : null }, {})
      return { ok: true, beats: controlState.beats, at: controlState.lastBeatAt,
        // The idle verdict travels in the beat receipt, so a caller can see WHY middleware was (or was not) woken.
        idle: { idle: idle.idle, action: idle.action, elapsedMs: idle.elapsedMs === undefined ? null : idle.elapsedMs,
          afterMs: idle.afterMs === undefined ? null : idle.afterMs, emitted: idle.emitted === true, note: idle.note || null,
          // ★ null means "no episode crossed on this beat", NOT "an episode did nothing" — the distinction the old
          // receipt could not express at all.
          middleware: idleEmitted && idleEmitted.decisions ? idleEmitted.decisions.length : (idle.emitted === true ? 0 : null),
          middlewareRan: idleEmitted && typeof idleEmitted.ran === 'number' ? idleEmitted.ran : (idle.emitted === true ? 0 : null) },
        middleware: decided && decided.decisions ? decided.decisions.length : 0,
        middlewareRan: decided && typeof decided.ran === 'number' ? decided.ran : 0 }
    },

    /**
     * ROUND 10 / task-74 (B): the documented READ of the same decision, for a monitor or a host that polls on its own
     * schedule. It publishes `control/idle` on the SAME edge as `beat()` (the edge lives in the control face, so the
     * two callers cannot each fire it).
     */
    idleState: ({ lastActivityAt = null, at = null } = {}) => control.idleState({ lastActivityAt, at }),

    /**
     * ROUND 9 / task-66 B — THE EXIT PATH (`docs/03 §2`). Called by the host adapter's `uninstall()` and by the
     * entry's effect cleanup: waits for the in-flight STATE writes to land, then FLUSHES every journal projection.
     * The two halves are reported separately because they are two different promises (see the comment above
     * `const kernel`), and `ok` is their AND - never "at least one half worked".
     *
     * It does NOT throw: a shutdown path that throws can abort the rest of the host's teardown, and the host may
     * well swallow the throw - which would make a failed flush LESS visible, not more. Instead every failure is in
     * the receipt, on the kernel's own log, and in `status().shutdown` (and the assembly warns by name).
     */
    async shutdown({ reason = null } = {}) {
      // CONCURRENT calls share ONE flush; a LATER call RUNS AGAIN, because a host may uninstall/reinstall and
      // produce a NEW journal tail - a permanent "already flushed" flag would silently lose that tail. Re-flushing
      // is safe: `flushAll()` appends the same envelope for an unchanged journal, and `settle()` waits for whatever
      // is in flight right now.
      if (exitFlushInFlight) return exitFlushInFlight
      const run = (async () => {
        const at = clock()
        const recReason = reason === null ? null : String(reason)
        const finish = (out) => {
          exitFlushRecord = out
          try {
            if (log && typeof log.append === 'function') log.append({ type: 'vmu/exit-flush', at, reason: recReason, ok: out.ok, code: out.code || null, failed: out.failed || [] })
          } catch (e) { /* the log is the host's; a broken log never changes the receipt */ }
          return out
        }
        if (!resume || typeof resume.exit !== 'function') {
          return finish({ ok: false, at, reason: recReason, code: 'VMU_EXIT_FLUSH_UNAVAILABLE',
            writeThrough: null, journal: null, failed: [],
            message: 'this assembly has no recovery face exposing exit(): the exit flush cannot be performed',
            note: 'the engine half is kernel/resume.js; without it neither "wait for write-through" nor "flush the journals" is claimed (docs/03 §2)' })
        }
        let detail = null
        try { detail = await resume.exit({ reason: recReason }) } catch (e) {
          return finish({ ok: false, at, reason: recReason, code: (e && e.code) || 'VMU_EXIT_FLUSH_FAILED',
            writeThrough: null, journal: null, failed: [],
            message: String((e && e.message) || e),
            note: 'exit() threw even though its contract is to RETURN failures in the receipt - recorded rather than swallowed' })
        }
        const wt = (detail && detail.writeThrough) || null
        const jn = (detail && detail.journal) || null
        const failed = (jn && Array.isArray(jn.failed)) ? jn.failed.slice() : []
        return finish({ ok: !!(detail && detail.ok === true), at, reason: recReason,
          writeThrough: wt, journal: jn, failed,
          code: (detail && detail.ok === true) ? null : ((failed[0] && failed[0].code) || 'VMU_EXIT_FLUSH_INCOMPLETE'),
          note: (detail && detail.note) || null })
      })()
      exitFlushInFlight = run
      try { return await run } finally { exitFlushInFlight = null }
    },

    /** The last exit flush (null before any shutdown): the assembly's own record, readable after the fact. */
    exitFlush: () => (exitFlushRecord ? Object.assign({}, exitFlushRecord) : null),
    /** The control surface: state, history and whether the heartbeat went stale (docs/04 搂11 wallClockMs). */
    control: () => controlView(),

    /** The declaration of a setting (hot class, who may change it) - used by the host tool for its receipt. */
    settingDef(key) { return SETTING_DEFS.find((d) => d.key === key) || null },
    /**
     * ★ ROUND 30 (task-149 A): what the declared type/domain refused so far (config layer, pack layer — and the
     * interactive face REFUSES BY NAME instead of recording). Read-only, and empty is the honest normal state.
     */
    settingsRejected() { return settingsRejected.map((r) => Object.assign({}, r)) },
    /** Pack bookkeeping: what was applied and unloaded is part of the audit trail, not a side note. */
    notePackApplied(id) { packNotesLog.push({ id, at: clock(), what: 'applied' }); return { ok: true } },
    notePackUnloaded(id) { packNotesLog.push({ id, at: clock(), what: 'unloaded' }); return { ok: true } },
    packNotes() { return packNotesLog.map((n) => Object.assign({}, n)) },

    /** Observability (R11): the whole assembly in one place, with each part reporting its own state. */
    /**
     * ★★ ROUND 34 (measured): `status(opts)` takes a `detail`. The full per-key resolved map is the bulk of this
     * receipt - over a thousand keys with value, source, hot class and who-may-change - and on a real machine it
     * pushed the whole answer past the host's size limit, so the host truncated it and the sections a reader most
     * needed were the ones cut. The four segments an operator actually asks about (phase / quorum / formal / paper)
     * are contributed by the PACK and are not the bulk, so trimming the map here keeps them visible by construction.
     *
     * ★★ THE BOUND BELONGS AT THE BOUNDARY, NOT IN THE DATA SOURCE. The KERNEL defaults to the COMPLETE view: a
     * caller asking the kernel directly is asking for the truth, and eliding keys there would make an absent key
     * indistinguishable from an unset one - which is this phase's recurring defect family, and a suite proved it
     * within one run (it read a single default-valued key and crashed). It is the TOOL FACE that exceeded the host's
     * size limit, so the FACE defaults to the bounded summary and offers `detail:'full'`.
     *
     * `detail: 'summary'` keeps the counts, plus every key whose source is NOT the schema default - the ones a
     * deployment actually set, and therefore the ones worth reading - and records how many were elided. `detail:
     * 'full'` (the default here) or `'settings'` returns the complete map exactly as before. NOTHING IS LOST, ONLY
     * REQUESTED: the summary states what it left out and how to ask for it, so a bounded receipt and a complete one
     * can never be mistaken for each other.
     */
    status(opts = {}) {
      const detail = typeof opts.detail === 'string' ? opts.detail : 'full'
      const wantsFullSettings = detail !== 'summary'
      // `settings.resolved` answers the manual's promise (docs/04 搂6): for EVERY declared key, the effective
      // value, WHERE it came from (pack layer > runtime `vibe_vmu_set` > the plugin's config > schema default),
      // its hot class and who may change it. Precedence is stated because a pack and a runtime write are not
      // mutually timestamped; `overridden` lists the sources a pack replaced (O4 makes that explicit).
      const packApplied = packNotesLog.filter((n) => n.what === 'settings-applied')
      const packSource = {}
      for (const n of packApplied) for (const k of n.keys || []) packSource[k] = 'pack:' + n.id
      const resolved = {}
      for (const def of SETTING_DEFS) {
        const has = Object.prototype.hasOwnProperty.call(settings, def.key)
        // ROUND 1 / K5: the source ladder is `runtime pack layer > entry-side layer label > config > default`. Without
        // the entry-provided `settingsSources`, a pack DEFAULT folded in before construction is indistinguishable from a
        // deployment value and was reported as `config` - a resolved view that misnames the layer is worse than none.
        const source = packSource[def.key] || settingWriter(settings, def.key)
          || (settingsSources && settingsSources[def.key]) || (has ? 'config' : 'default')
        const overridden = packApplied.filter((n) => n.id !== (packSource[def.key] || '').replace('pack:', '') && (n.keys || []).includes(def.key)).map((n) => 'pack:' + n.id)
        resolved[def.key] = {
          value: has ? settings[def.key] : def.def,
          source,
          hot: def.hot,
          who: def.who,
          overridden: source === 'default' ? [] : overridden,
        }
      }
      // ★ THE BOUNDED VIEW. `resolved` stays the complete map for `detail:'full'`; the default summary keeps the
      // keys a deployment actually set (source !== 'default') and counts the rest, so the answer is bounded by the
      // deployment rather than by the size of the catalogue. The elided count is stated, never silent.
      const resolvedSummary = {}
      let elided = 0
      for (const k of Object.keys(resolved)) {
        if (resolved[k].source === 'default') { elided++ } else { resolvedSummary[k] = resolved[k] }
      }
      const resolvedView = wantsFullSettings ? resolved : resolvedSummary
      const resolvedNote = wantsFullSettings
        ? 'full: every declared key with its effective value, source, hot class and who may change it'
        : 'summary: only keys whose source is NOT the schema default are listed (' + elided + ' default-valued keys elided); ask for detail:"full" or detail:"settings" for the complete map'
      // ★★ ROUND 35: THE OTHER SEVEN HEAVY SECTIONS ARE ALL DIAGNOSTIC, AND NONE OF THEM CARRIES THE FOUR SEGMENTS
      // an operator asks about (phase / quorum / formal / paper - those come from the PACK, not from here). Measured:
      // registry 4256 B, guards 2056, seams 2011, reporting 1346, approvalGate 986, projections 902, activity 818 -
      // 12,003 of the 16,693-byte summary. So the summary shows that each section EXISTS, with a headline, and the
      // whole section stays one word away. A section is never omitted: `present` distinguishes "absent by design"
      // from "elided for size", which is the distinction this phase keeps insisting on.
      const headline = (v) => (v === null || v === undefined
        ? { present: false, note: 'absent by construction; ask detail:"full" for the section that says why' }
        : { present: true, fields: typeof v === 'object' ? Object.keys(v).length : 0, note: 'headline only; ask detail:"full" for the whole section' })
      const view = {
        enabled: true,
        active: started,
        // ROUND 1 / K5: the ONE pack path, stated rather than implied. `loader` means `kernel/pack.js` via the injected
        // `packApplier` (the entry's path); `none` means `usePack()` refuses by name. There is no third value, because a
        // legacy in-kernel loader no longer exists (D-02).
        packPath: typeof packApplier === 'function' ? 'loader' : 'none',
        settingsMerge: {
          // The D-02 priority ladder, printed so a reader never has to reconstruct it from the code.
          priority: 'pack 默认 < preset Config／会话 settings < 运行时 set',
          sources: settingsSources ? Object.assign({}, settingsSources) : null,
          // The named OVERLAP REPORT is surfaced by the host face (`createHostAdapter({ mergeReport })`, printed by
          // `vibe_vmu_status`), because the entry - which computed it - owns it and the kernel never acts on it.
          conflictsView: 'vibe_vmu_status → settingsMerge.conflicts (the entry\'s mergeReport)',
          note: 'a conflict is a pack default that collided with a higher layer: the higher layer WINS and the collision is named (O4); open the door with vmu.packs.activeOverrides / allowKernelOverride',
        },
        settings: { keys: Object.keys(settings).length, engineEnabled: enabled, dryRun, detail,
          // ★ ROUND 34: which of the two views this receipt carries, and how to ask for the other. A reader must
          // never have to guess whether an absent key is unset or merely elided.
          resolvedDetail: resolvedNote,
          resolved: resolvedView,
          // TASK-163: the hot-grading promise is SELF-DISCLOSED here, and the last runtime write is shown with
          // what it really applied — the receipt and this line are the same fact, not two opinions.
          hotGrading: 'H0/H1 runtime writes are applied LIVE (and the receipt names the consumers); an H2 write is stored now and takes effect on the next start, and its receipt carries requiresRestart:true; H3 keys are framework-owned and REFUSED by name on BOTH paths (kernel API and tool face)',
          applies: APPLIES,
          // ROUND 3 / task-20 F3: the AUDITABLE table behind `liveReadBy` - which faces read the settings handle at
          // call time. Without it the receipt's live claim would be unauditable prose.
          liveReaders: LIVE_READERS,
          runtimeWrites: runtimeWrites.length,
          lastRuntimeWrite: runtimeWrites.length ? Object.assign({}, runtimeWrites[runtimeWrites.length - 1]) : null,
          // ★ ROUND 30 (task-149 A): WHAT THE DECLARATION REFUSED, IN THE OPEN. Empty is the normal, honest state
          // ("every declared value that arrived was inside its declared type/domain"); a non-empty list NAMES each
          // key, the value it arrived with, the domain it missed and the default that was used instead — which is
          // also the one-time migration hint for a deployment that has been carrying an out-of-domain value.
          // ★ THREE STATES STAY DISTINGUISHABLE: key absent (declared default, zero mechanism) ⇒ nothing here;
          // undeclared key ⇒ an entry with reason:'undeclared'; declared-but-out-of-domain ⇒ reason:'outside …'.
          settingsRejected: settingsRejected.map((r) => Object.assign({}, r)),
          settingsRejectedCount: settingsRejected.length,
          // ★ ROUND 30 STOP-THE-LINE (task-149 ①): WHAT THE VALUE GUARD DOES *NOT* JUDGE — named, counted, with a
          // reason. Two categories: a TYPE with no validator yet (`planned` = declared but not wired) and a
          // DECLARATION THAT CONTRADICTS ITS OWN DEFAULT (13 keys, pre-existing). Neither is silently accepted
          // (it is visible here) and neither is wrongly refused (the guard steps aside).
          settingsUnenforced: unenforcedReport() },
        auditTail: auditRing.slice(-20),
        // ROUND 2 (task-14): the id minter's own verdict (durable counters / process-only) and WHICH durable
        // projections this assembly actually attached. Both are stated, so "which durable key has a writer" is
        // answerable without reading the source - the Lead's "no silently unwired key" requirement.
        ids: idsStatus(),
        projections: projectionReport(),
        // ROUND 2: the approval gate's reach, and the reporting face's own verdict (vmu-assistant's §8 receipt:
        // `reporting.declared`/`enabled`/`fires`/`trace`/`params` - the fields its assertions read).
        approvalGate: approvalGateReport,
        reporting: report && typeof report.status === 'function' ? report.status() : null,
        // ROUND 3 / task-24: the waiter is observable too (waiters / generations / timer shape).
        activity: activity && typeof activity.status === 'function' ? activity.status() : null,
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
        // ROUND 240: an UNLOADED pack must not stay listed. `notePackUnloaded` was recording the event and nothing read it,
        // and `packNotes()` had no caller at all - so the pack list said a pack was present long after it was gone.
        packs: (() => {
          const notes = this.packNotes()   // ROUND 240: a SIBLING METHOD needs `this` - the same lesson the export method taught
          const appliedIds = notes.filter((n) => n.what === 'applied').map((n) => n.id)
          const unloadedIds = new Set(notes.filter((n) => n.what === 'unloaded').map((n) => n.id))
          return [...new Set(packs.concat(appliedIds).filter((id) => !unloadedIds.has(id)))]
        })(),
        // PHASE 6 / P0-10: the tool NAMES packs declared. The kernel holds them; the host publishes them.
        packTools: [...packToolDeclarations.values()].map((t) => ({ name: t.name, packId: t.packId })),
        // ★ PHASE 7: only when a pack registered sections; a throwing reader is NAMED, never hidden.
        toolFacePull: Object.assign({}, toolFacePullState),
        ...(toolFaceFailures.length > 0 ? { toolFaceFailures: toolFaceFailures.slice() } : {}),
        ...(statusSections.size > 0 ? { sections: Object.fromEntries([...statusSections.entries()].map(([name, fn]) => {
          try { return [name, { ok: true, value: fn() }] } catch (e) {
            return [name, { ok: false, code: (e && e.code) || 'VMU_ENGINE_UNAVAILABLE', message: String((e && e.message) || e) }]
          }
        })) } : {}),
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
        // ROUND 9 / task-66 B: the exit flush, as it actually happened. `null` means no shutdown was performed in
        // this process - which is NOT the same as a successful one, so it is never reported as ok:true.
        shutdown: exitFlushRecord ? Object.assign({}, exitFlushRecord) : null,
        loader: loader.status(),
        bridge: bridge.status(),
        registry: registry.status(),
        seams: { host: !!host, store: !!store, library: !!library, members: !!members, spawn: !!spawn,
          // E2: both facts are CONSTRUCTION facts. `deliverConsumedBy` lists the services that were actually
          // handed a usable `deliver` seam (a null roster service is not listed); `timer` is judged by the
          // scheduler's OWN contract shape — the single source of truth — so status can never claim a timer
          // the consumer would refuse (`VMU_CONTROL_NO_TIMER`). `timerNote` names the expected shapes.
          deliver: !!deliver, deliverConsumedBy: seamReceipts.deliver.slice().sort(),
          // ROUND 1 / K3: the TURN seam is reported from the value the loop was ACTUALLY built with, so a host that
          // injects `deliverTurn` can see it took, and a host that does not can see the named refusal coming.
          turnDeliver: !!turnDeliverSeam,
          turnDeliverSource: typeof deliverTurn === 'function' ? 'kernel-deliverTurn'
            : (host && typeof host.deliverTurn === 'function' ? 'host.deliverTurn' : null),
          turnDeliverNote: turnDeliverSeam ? null
            : 'the turn loop has no delivery seam: `vibe_vmu_turn` step/drive refuse by name (VMU_ENGINE_UNAVAILABLE); pass { deliverTurn } (the entry assembles it from ctx.get(\'subagents\') via kernel/turn/index.js deliverViaSubagents)',
          // ROUND 4 / F9+F10 (docs/26 §3.22): the ONGOING-COMMAND seams, reported from the values the loop was
          // ACTUALLY built with. `consumedBy` is the real reader (`kernel/turn/index.js` turns them into
          // `sendToMember`/`interruptMember`), so status can never claim a verb nobody can call.
          sendMessage: !!sendMessageSeam,
          sendMessageConsumedBy: sendMessageSeam ? ['kernel/turn/index.js (sendToMember)'] : [],
          sendMessageNote: sendMessageSeam ? null
            : 'no sendMessage seam: a RUNNING member cannot be reached (kernel/turn sendToMember refuses by name, VMU_ENGINE_UNAVAILABLE); the entry assembles it from ctx.get(\'subagents\') via sendViaSubagents (docs/26 §3.22)',
          interrupt: !!interruptSeam,
          interruptConsumedBy: interruptSeam ? ['kernel/turn/index.js (interruptMember)'] : [],
          interruptNote: interruptSeam ? null
            : 'no interrupt seam: a running member cannot be stopped (kernel/turn interruptMember refuses by name, VMU_ENGINE_UNAVAILABLE); the entry assembles it from ctx.get(\'subagents\') via interruptViaSubagents (docs/26 §3.22)',
          signer: !!signer, fetchFn: !!fetchFn,
          // ROUND 2 (task-14): the new faces' seams, reported as CONSTRUCTION facts (E2 discipline): the id minter,
          // the recovery face, chat, the math adapters, and whether the math-job FILE MIRROR really has its `fs` seam
          // (`admission().fileMirror` is the module's own answer, so status cannot claim a mirror the job face refuses).
          ids: !!ids, resume: !!resume, chat: !!chat, mathadapters: !!mathadapters,
          mathjobsFileMirror: mathjobs && typeof mathjobs.admission === 'function' ? !!mathjobs.admission().fileMirror : null,
          timer: scheduler.status().timerShape !== null,
          // ★ PHASE 6 / K1: whether a self-drive loop is actually RUNNING and what the construction-time attempt said.
          // Reported, not promised: a reader must be able to tell "the schedule is driven" from "the schedule is a
          // passive book", and a refused drive has to be visible here rather than only in a log line.
          scheduleAutoArm: scheduler.status().autoArm,
          scheduleAutoRearms: scheduler.status().autoRearms,
          scheduleDrive,
          timerShape: scheduler.status().timerShape,
          timerInjected: scheduler.status().timerInjected,
          timerNote: scheduler.status().timerShape === null
            ? 'timer seam NOT usable: the scheduler accepts one of four OBJECT shapes — {arm,disarm} | {schedule,cancel} | {set,clear} | {setTimeout,clearTimeout} (kernel/scheduler.js owns this contract); a bare function or any other shape is refused by name (VMU_CONTROL_NO_TIMER)'
            : null,
          // ROUND 8 / task-58 (G6): the ALLOCATING STORE behind the ballot's durable commit log. Reported from the
          // value the kernel was ACTUALLY given (a construction fact): with one, two processes sharing it get
          // distinct monotonic tickets; without one the ballot's own `status().gate.durable` is false BY NAME.
          commitStore: typeof commitStore === 'function' ? 'call-time resolver' : (commitStore ? 'object' : false),
          commitStoreNote: commitStore
            ? 'the host supplies a store whose append(record) answers {ticket} and readAll() reads the log back; the ballot builds its commit log from it at call time (kernel/ballot.js createDurableCommitLog)'
            : 'no allocating store: the ballot reports status().gate.durable === false and reserve() returns null - the seam is ABSENT, never pretended (pass { commitStore } = a store with append()->{ticket} and readAll(), or config.commitStore)',
          // ROUND 9 / task-66 A (G7): the ONE commit log the BOARD and the MAILBOX share, reported from the
          // façade's own resolution state. `bound:false` + `failure` names a THROWING resolver, which is a
          // different fact from "no store was supplied" - the two must not be reported as the same thing.
          sharedCommitLog: Object.assign(
            { consumedBy: ['kernel/ballotbox.js (cast)', 'kernel/mailbox.js (send)'] },
            sharedCommitLog.resolveState(),
            { status: sharedCommitLog.status() }) },
        // TASK-170: the guard faces report HOW FAR THEY ACTUALLY REACH. A face that no production path calls
        // is marked `kind:'diagnostic'` with its reason, so `status()` can never imply a guard is a live
        // production rail while it is not (the eighth case: implemented + tested + never effective).
        guards: {
          registered: Object.keys(GUARD_FACES),
          faces: GUARD_FACES,
          contractCount: Object.values(GUARD_FACES).filter((f) => f.kind === 'contract').length,
          diagnosticCount: Object.values(GUARD_FACES).filter((f) => f.kind === 'diagnostic').length,
          verifiedBy: 'tests/vmu-kernel.test.mjs scans kernel/index.js and asserts every `require*` face is registered here and in docs/11 §守卫面清单 (with a mutant proving the check can fail)',
          note: 'a face marked diagnostic is NOT a production rail: see its `reason`. A contract face lists its productionCallSites, and the test verifies they exist in the source.',
        },
        note: 'a kernel with no declarations is inert by construction (zero mechanism, R1)',
      }
      // ★★ SUMMARY BOUNDS THE SEVEN DIAGNOSTIC SECTIONS (see the note above). The four segments an operator asks
      // about are contributed by the PACK and are deliberately NOT touched here, so they survive at any detail.
      if (!wantsFullSettings) {
        for (const k of ['registry', 'guards', 'seams', 'reporting', 'approvalGate', 'projections', 'activity']) {
          view[k] = headline(view[k])
        }
        view.diagnosticsBounded = 'summary headlined the seven diagnostic sections (registry / guards / seams / reporting / approvalGate / projections / activity); each is returned in full for detail:"full", and nothing else in this receipt is trimmed'
      }
      // ★★★ ROUND 50: THE READING AN OPERATOR WAS MISSING, AND THE REASON THIS PHASE TOOK SO LONG TO CLOSE. Sixty-one
      // meetings ran with no way to see that the single field which closes the institute had never been emitted. The
      // predicate itself lives in the turn module (pure, exported, tested without a kernel); what the KERNEL adds is the
      // two things only it owns - the LIVE ROSTER and the PERMISSION test. Both are injected rather than assumed:
      // which permission grants a closure vote is deployment vocabulary (the v5r pack gives `vote` to the member slot
      // but NOT to the chair or the temp slot), so hardcoding a name here would invent policy, and counting the whole
      // roster instead of the enfranchised members would leave the chair permanently "missing" and make unanimity
      // UNREACHABLE - which is exactly how a "fix" here could have produced another institute that never closes.
      // ★★★★★★★ ROUND 78: WHO THE VOTE WAS RECORDED AGAINST, BESIDE WHO WAS ELIGIBLE. A real run supplied replies
      // carrying a real boolean, and the predicate still reported the members missing - so the next thing to know is
      // WHERE each reply was recorded. The recorded map names the members the loop holds a judgement for; eligible
      // names the members the permission test enfranchises; and missing is the difference between them. With all
      // three side by side, a vote recorded against the wrong member - or against a member who holds no vote - is
      // visible at a glance instead of being inferred from a boolean.
      // ROUND 78: the votes the loop actually holds, so WHO was recorded is visible beside who was eligible.
      const recordedVotes = turn && typeof turn.status === 'function' ? turn.status().closureVoteVotes : null
      view.closureVoteRecorded = recordedVotes && typeof recordedVotes.forEach === 'function'
        ? Object.fromEntries([...recordedVotes.entries()])
        : {}
      view.closureVote = closureVoteView()
      view.closureVoteInput = closureVoteInput
      return view
    },
  }

  // ROUND 4 / task-25 E: THE APPROVAL GATE IS ATTACHED LAST, once every face it may wrap exists. The earlier position
  // (beside the projections) measured as `Cannot access 'ip' before initialization`, because `ip`/`resource` are
  // constructed below it. The gate is zero-mechanism until a deployment declares `vmu.human.gatedActions`.
  attachApprovalGates()

  return kernel
}


