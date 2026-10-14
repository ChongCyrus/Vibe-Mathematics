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
import { createTurnOrchestrator, facesFrom } from './turn/index.js'
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
import { SETTING_DEFS } from '../settings/schema.js'
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

export function createKernel({
  host = null,
  // The institution policy for prompt-section switches; null means the framework switches nothing.
  sectionPolicy = null,
  // Renders a member queued notices the way the institution writes them; null means the framework fallback.
  noticeBlock = null,
  extraPhases = null,
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

  let library = root
    ? createLibrary({
      root,
      tracks: tracks || settings['vmu.records.tracks'],
      headListAt: settings['vmu.records.headListAt'],
      truncateMode: settings['vmu.records.truncateMode'],
      fingerprintPolicy: settings['vmu.records.fingerprintPolicy'],
      // THE PATH POLICY REACHES THE WRITE SURFACE (docs/04 搂11): the library gates its writes through
      // kernel/guard.js, so `vmu.safety.pathPolicy` is a consumer rather than a declaration.
      // TASK-163: it gets the READ-ONLY LIVE VIEW (not the raw object) — a consumer handed the raw settings
      // could write straight into kernel settings, which is exactly the write-through this round closed.
      settings: settingsView,
      clock,
    })
    : null

  // THE LEAN FACE (docs/09, `vmu.math.lean*`): a real subsystem, created only when a spawn seam exists. The
  // face owns the semantics the docs promise ("exit 0 AND the content hash unchanged"); the kernel only wires.
  const lean = spawn
    ? createLeanFace({ settings: settingsView, spawn, root, clock, log })
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
  const retention = createRetention({ settings: settingsView, bus, clock: guardedClock, log, library })
  // `roots` = who holds authority that does NOT come from a delegation. It is an EXPLICIT setting rather than
  // a guess from role names: unset means nobody can grant anything (S-2 refuses every grant), which is the
  // honest zero-mechanism default. Guessing "office looks like a root" would be policy hiding in the kernel.
  const delegation = createDelegation({ settings: settingsView, bus, clock: guardedClock, log, members,
    roots: Array.isArray(settings['vmu.delegation.roots']) ? settings['vmu.delegation.roots'] : [] })
  const workflow = createWorkflow({ settings: settingsView, bus, clock, log, tasks })
  const trust = createTrust({ settings: settingsView, bus, clock, log })
  const handover = createHandover({ settings: settingsView, bus, clock, log, tasks, library })
  // Batch 2 slice 3: arbitration. `minutes` is the live minutes service so a ruling can be recorded there;
  // `mode` defaults to off (zero mechanism) so nothing is arbitrated unless the institution turns it on.
  const arbitration = createArbitration({ settings: settingsView, bus, clock, log, members, minutes })
  // Batch-2 slices 5-8: recruitment, collaboration topology, charters, fair allocation. All four are
  // zero-mechanism by default (no postings / flat topology / charters disabled / no claimants).
  const admission = createRecruit({ settings: settingsView, bus, clock, log, members })
  const topology = createTopology({ settings: settingsView, bus, clock, log, members })
  const fairness = createFairness({ settings: settingsView, bus, clock, log, budget, tasks })
  const charter = createCharter({ settings: settingsView, bus, clock, log, members, delegation })
  // Batch-3 slice 2: reproduction packs (docs/16 L12). Data is referenced by pointer by default; a missing
  // required member is named rather than silently omitted.
  const repropack = createReproPack({ settings: settingsView, bus, clock, log, library })
  // Batch-2 slices 10-11: institutional memory and the auction. Memory's `may`/`authorize` always refuse,
  // and the auction's price never depends on reputation unless the institution explicitly turns that on.
  const memory = createMemory({ settings: settingsView, bus, clock, log, library })
  const bidding = createBidding({ settings: settingsView, bus, clock, log, members, trust })
  // Batch-2/3/4 tails: skills, publication and the formalisation face. Skills' capacity counts only live and
  // fresh claims (a retired claim frees its slot); all three are zero-mechanism by default.
  const skills = createSkills({ settings: settingsView, bus, clock, log, members })
  const publication = createPublication({ settings: settingsView, bus, clock, log, library, repropack })
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
  const mailbox = createMailbox({ clock: guardedClock, log, settings: settingsView, bus, store, deliver,
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
  const panel = createPanel({ clock: guardedClock, log, settings: settingsView, bus, members })
  const discipline = createDiscipline({ settings: settingsView, bus, clock, log })
  const custody = createCustody({ settings: settingsView, bus, clock, log })
  const explain = createExplain({ settings: settingsView, bus, clock, log })
  const control = createControl({ settings: settingsView, bus, clock, log,
    // ROUND 2 (task-14, reader-a's contract C): the human approval GATE reaches `control.mayAct`, so a gated control
    // action queues for a human instead of running. Wired only when the gate really exists - a null seam would be a
    // silent bypass of the very gate this line is for.
    approval: typeof human.gate === 'function' ? (req) => human.gate(req) : null })
  const citations = createCitations({ settings: settingsView, bus, clock, log })
  const formal = createFormal({ settings: settingsView, bus, clock, log, spawn, library })
  // INTEGRATOR FIX: `vmu.mathjobs` was REGISTERED but never CREATED - the registry advertised a service the
  // kernel did not build. Both job faces now receive the kernel's real spawn seam (the host injects it), so a
  // missing engine surfaces as a named refusal rather than a silent no-op.
  const mathjobs = createMathJobs({ settings: settingsView, bus, clock, log, spawn,
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
  const mathadapters = createMathAdapters({ settings: settingsView, clock: guardedClock, log, bus, spawn,
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
    describeSetting: settingDescription })
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
  const attachDeclaredProjections = () => {
    const declaredProjections = Array.isArray(settings['vmu.resume.projections']) ? settings['vmu.resume.projections'] : []
    // The live instances each adapter wraps. `meeting`/`ballot` are excluded on purpose (per-session factories).
    const targets = { tasks, members, meetings, ballotbox, minutes, chat, panel, budget }
    const methodsOf = { tasks: ['create', 'assign', 'transition', 'brief', 'clearBrief', 'advance', 'rollback'], work: [] }
    for (const key of declaredProjections) {
      const face = String(key)
      // `human` is attached by its own dedicated block above (it exists unconditionally and is not in the adapter
      // table), so the declared list must not re-report it as "not attached".
      if (attachedProjections.some((a) => a.face === face && a.attached)) continue
      const make = RESUME_PROJECTION_ADAPTERS[face]
      if (typeof make !== 'function') { attachedProjections.push({ face, attached: false, reason: 'no adapter in this assembly (the service does not expose a journal/snapshot seam yet)' }); continue }
      try {
        const adapter = make()
        // The INSTANCE method registers the projection so `hydrate()`/`snapshot()` can find it; the module-level
        // `attachProjection` would wrap the methods but leave the instance unaware of the key.
        const out = resume.attachProjection({ target: targets[face], methods: methodsOf[face] || [], key: adapter.key, mode: adapter.mode,
          list: adapter.list || null, snapshot: adapter.snapshot || null, restore: adapter.restore || null, replay: adapter.replay || null })
        attachedProjections.push({ face, attached: true, mode: adapter.mode, key: adapter.key, wrapped: out.wrapped, missing: out.missing })
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
  const mathtools = createMathTools({ settings: settingsView, bus, clock: guardedClock, log, spawn, library })
  // `projmigrate` is built EARLIER now: the idempotency ledger needs it at construction so an old on-disk
  // projection is migrated instead of silently discarded.
  // ROUND 22: three more declared-knob families become behaviour, each following the mathtools standard (the
  // receipt lists the keys it actually enforced, and anything unwired is named rather than silently ignored).
  // P0 (Lead): the real instance lands in the HOLDER the late-bound seam reads, and the local name is kept so the rest
  // of this file is unchanged. No `const`→`let` double declaration, and no early access can hit the TDZ.
  meetingsRef.current = createMeetings({ settings: settingsView, bus, clock: guardedClock, log })
  const meetings = meetingsRef.current
  const ballotbox = createBallotBox({ settings: settingsView, bus, clock: guardedClock, log })
  const records = createRecords({ settings: settingsView, bus, clock: guardedClock, log })
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
  })
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
  const loader = createLoader({
    // (甲) PRODUCTION GOES THROUGH THE GUARD: this facade used to answer `null` when there was no durable root,
    // which is exactly the "silent fake" `requireStore()` exists to refuse. A module calling `kernel.read()`
    // with no root now gets the NAMED refusal (and with a root, the same state as before).
    services: { kernel: Object.freeze({ read: () => mustStore().read() }), setting: (k) => settings[k] },
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
  registry.register('vmu.chat', { apiVersion: 1 }, { kind: 'service', description: 'group chat: admin list, speech quota and mute are declared, hot-changed and audited (docs/17)' })
  registry.register('vmu.mathadapters', { apiVersion: 1 }, { kind: 'service', description: '数学库适配面：numpy/scipy/pandas/sympy 的会话级环境绑定、结果形状契约与具名拒（docs/09·15）' })
  registry.register('vmu.mailbox', { apiVersion: 1 }, { kind: 'service', description: 'durable per-recipient mailbox: ack only after a successful delivery, unacked remains redeliverable (docs/17)' })
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
    get panel() { return panel },
    get report() { return report },
    // ROUND 3 / task-24: the activity waiter, reachable like every other service.
    get activity() { return activity },
    // ROUND 3 / task-20: the fidelity registry (the C-45 enforcement point).
    get fidelity() { return fidelity },
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
    tasks,
    rules,
    loader,
    bridge,
    registry,

    /** Per-object primitives: the kernel supplies the factory, the pack supplies the policy. */
    ballot: (opts = {}) => {
      const made = createBallot(Object.assign({ quorumRule: settings['vmu.meetings.quorumRule'], bus, clock,
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
      const made = createMeeting(Object.assign({ bus, clock, deliver,
        roundTimeoutMs: settings['vmu.meetings.roundTimeoutMs'] || 0,
        quotesPerMessageMax: settings['vmu.meetings.quotesPerMessageMax'] || 0,
        quoteDepthMax: settings['vmu.meetings.quoteDepthMax'] || 0,
        isPaused: () => controlState.state === 'paused' }, opts, { id }))
      // E2: the MEETING factory receives `deliver` on construction AND hands it to every meeting it makes.
      noteSeam('deliver', 'meetings', made ? deliver : null)
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
        middleware: decided && decided.decisions ? decided.decisions.length : 0 }
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
      library = createLibrary({
        root,
        tracks: list.slice(),
        headListAt: settings['vmu.records.headListAt'],
        truncateMode: settings['vmu.records.truncateMode'],
        fingerprintPolicy: settings['vmu.records.fingerprintPolicy'],
        // The path policy must survive a RE-DECLARATION too, or a pack that declares tracks would silently
        // drop the write gate the first library had (docs/04 搂11).
        settings,
        clock,
      })
      return { ok: true, tracks: library.status ? list.slice() : list.slice() }
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
      for (const [key, value] of Object.entries(incoming)) {
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
    setSettingsValue(key, value, { by = null } = {}) {
      // THE CONTRACT LIVES HERE (task-166): declared key, H3 read-only, declared owner. It used to live ONLY
      // in host.js, so the kernel API accepted an H3 write with `applied:'immediate'` while the tool face
      // refused the very same pair with VMU_NOT_PERMITTED — two paths, two contracts.
      const g = settingsGuard(key, by, 'set')
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
      runtimeWrites.push({ key, hot, by, ownerCheck: g.ownerCheck, requiresRestart, liveApplied: liveApplied.slice(), pendingConsumers: pendingConsumers.slice(), at: receipt.at, action: 'set' })
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
        middleware: decided && decided.decisions ? decided.decisions.length : 0 }
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
        middleware: decided && decided.decisions ? decided.decisions.length : 0 }
    },
    async beat(note = null) {
      controlState.beats += 1
      controlState.lastBeatAt = clock()
      const decided = await bus.emit('control/heartbeat', { beats: controlState.beats, at: controlState.lastBeatAt, note: note ? String(note) : null }, {})
      return { ok: true, beats: controlState.beats, at: controlState.lastBeatAt,
        middleware: decided && decided.decisions ? decided.decisions.length : 0 }
    },
    /** The control surface: state, history and whether the heartbeat went stale (docs/04 搂11 wallClockMs). */
    control: () => controlView(),

    /** The declaration of a setting (hot class, who may change it) - used by the host tool for its receipt. */
    settingDef(key) { return SETTING_DEFS.find((d) => d.key === key) || null },

    /** Pack bookkeeping: what was applied and unloaded is part of the audit trail, not a side note. */
    notePackApplied(id) { packNotesLog.push({ id, at: clock(), what: 'applied' }); return { ok: true } },
    notePackUnloaded(id) { packNotesLog.push({ id, at: clock(), what: 'unloaded' }); return { ok: true } },
    packNotes() { return packNotesLog.map((n) => Object.assign({}, n)) },

    /** Observability (R11): the whole assembly in one place, with each part reporting its own state. */
    status() {
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
      return {
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
        settings: { keys: Object.keys(settings).length, engineEnabled: enabled, dryRun, resolved,
          // TASK-163: the hot-grading promise is SELF-DISCLOSED here, and the last runtime write is shown with
          // what it really applied — the receipt and this line are the same fact, not two opinions.
          hotGrading: 'H0/H1 runtime writes are applied LIVE (and the receipt names the consumers); an H2 write is stored now and takes effect on the next start, and its receipt carries requiresRestart:true; H3 keys are framework-owned and REFUSED by name on BOTH paths (kernel API and tool face)',
          applies: APPLIES,
          // ROUND 3 / task-20 F3: the AUDITABLE table behind `liveReadBy` - which faces read the settings handle at
          // call time. Without it the receipt's live claim would be unauditable prose.
          liveReaders: LIVE_READERS,
          runtimeWrites: runtimeWrites.length,
          lastRuntimeWrite: runtimeWrites.length ? Object.assign({}, runtimeWrites[runtimeWrites.length - 1]) : null },
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
          timerShape: scheduler.status().timerShape,
          timerInjected: scheduler.status().timerInjected,
          timerNote: scheduler.status().timerShape === null
            ? 'timer seam NOT usable: the scheduler accepts one of four OBJECT shapes — {arm,disarm} | {schedule,cancel} | {set,clear} | {setTimeout,clearTimeout} (kernel/scheduler.js owns this contract); a bare function or any other shape is refused by name (VMU_CONTROL_NO_TIMER)'
            : null },
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
    },
  }

  // ROUND 4 / task-25 E: THE APPROVAL GATE IS ATTACHED LAST, once every face it may wrap exists. The earlier position
  // (beside the projections) measured as `Cannot access 'ip' before initialization`, because `ip`/`resource` are
  // constructed below it. The gate is zero-mechanism until a deployment declares `vmu.human.gatedActions`.
  attachApprovalGates()

  return kernel
}
