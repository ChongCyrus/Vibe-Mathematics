// vmu pack — `v5r-core`: v5r's institution as an INSTITUTIONAL PACK (docs/10 §5, the V5 deliverable).
//
// Why a second pack when `institute-min` exists: institute-min proved the SHAPE (slots/tracks/settings/
// rules/aliases) but its rule names a v5-era tool that no host registers (`vibe_v5_poll_vote`), so it never
// fires, and its `subject` predicate is CONSTANTLY FALSE on host payloads (docs/11 §8). This pack is built to
// actually DO something on the surfaces a real session has:
//
//   · an M1 rule that fires on a REAL tool name;
//   · an M2 CODE MODULE carried inside the manifest (a pack is JS, so it can carry behaviour, not only data);
//   · v5r's mechanism defaults as a settings LAYER (applied at load, conflicts refused unless allowOverride);
//   · the legacy tool names kept alive through aliases (D6/D14), not by renaming anything.
//
// What it does NOT do (honest ✗, docs/10 §5.3): it is not a behavioural-equivalence proof against v5r. The
// behavioural A/B needs a scenario harness run on both sides (P3) - this pack is the vmu side of it.
//
// ROUND 136 — THE CONTENT AXIS: `./v5r-prompts.js` is GENERATED from the v5r prompt corpus by
// `scripts/generate-pack-prompts.mjs`, which records the corpus sha256 inside it, so this pack carries the line's
// prompt TEXT and not only its policy. `tests/vmu-pack-prompts.test.mjs` asserts the text equals the corpus
// VERBATIM (not a paraphrase, not a second copy nobody checks).
import { SOURCE_REL as PROMPT_SOURCE_REL, SOURCE_SHA256 as PROMPT_SOURCE_SHA256, COUNTS as PROMPT_COUNTS, PROMPTS as PROMPT_ENTRIES } from './v5r-prompts.js'
// ROUND 10 (task-76, Lead ruling (a)): v5r's `stallAutoMeetingMs` (vibe-math-v5r.js:1083) is the one v5r behaviour
// that needs the pack to ACT, not just to declare: the kernel reports idleness (`control/idle`), and THIS module
// decides to convene. It is a MODULE (not an inline handler) because only the loader attaches `api` - including
// the capability-gated `api.services.get(name)` seam that lets it reach the meetings face. `kernel/pack.js`
// routes module-shaped manifest entries through the loader for exactly this reason.
import { V5R_STALL_MEETING } from '../middleware/stall-meeting.js'
// ROUND 13 (task-97 close-out): v5r's motion ⇒ box policy. It hangs on `meeting/motion` (the MEETING's own motion,
// `mo1` - the id the vote mirror asks `boxFor` about), NOT on the institute-wide `motion/propose` (`mo-1`): those are
// two different objects, and subscribing to the wrong one yields boxes that can never match. Module shape for the
// same reason as above (only the loader attaches `api`, and only the kernel's own loader carries the service catalog).
import { V5R_MOTION_BOX } from '../middleware/motion-box.js'
// ROUND 20 (task-126): **the counter the threshold report was missing**. R20's real DSH session proved the boundary
// fires `event` reports unattended while every `threshold` stayed silent — because NOTHING in the shipped deployment
// ever observed a metric (`metricValues()` was `{}`). `vmu.middleware.entries` cannot fix that (the bus does not load
// files, so such an entry never gets `api`); only a pack module does. Module shape for the third time, for the third
// time the same reason: only the loader attaches the capability-gated `api.services.get(name)` seam.
// ★ It is INTRA-turn (`tools/result`, plus the two `…/job-settled` events) on purpose: the report boundary listens on
// `agent/turn-stopping` too, and an observation written at the reader's own instant may only be visible NEXT turn.
import { V5R_ARTIFACT_COUNTER } from '../middleware/artifact-counter.js'
// PHASE 7 / goal 2 (first batch): THE TOOL FACE. `packs/v5r` used to declare ZERO tools while its prompts taught
// members to call `vibe_v5_record_* / say / message` (docs/acceptance/phase7-coverage-matrix.md §2: 17 names taught,
// 0 declared). The six names live in `../tools.js` and are declared below as the manifest's `tools[]` - the SAME
// mechanism `packs/v3` uses, so the kernel holds them and the host publishes them without learning any v5r name.
import { V5R_PACK_TOOLS } from '../tools.js'
// ★ RUN 31 / task-15 — THE SEAT FACE IS DECLARED, NOT REVERSE-DERIVED FROM THIS PROSE. Before this import, the manifest's
// `toolFaces` was computed by scanning these sections' bullet lines (`· vibe_v5_…`), so the PROMPT was the ACL: any
// capability nobody had written a bullet for was silently denied to the seat. Measured on a live run: the chair could not
// tally a ruling / ask for rulings / advance a meeting round / adopt a blueprint / promote into Verified/ / close fidelity,
// and the temp seat could not run Lean although rule 10.3 gives it to all three seats. The declaration is now
// `../seat-faces.js` (one row per tool, one decision per seat, each with its v5r rule); the bullets below are RENDERED
// from it, so the human-readable list and the machine-executed face cannot disagree — and a test compares them both ways.
import { seatAllowNames, seatDenyNames, seatBulletLines, seatFaces } from '../seat-faces.js'
// PHASE 7 round 8: THE PAPER PROMPTS (write / cross-review / final), phase-scoped and NON-source-derived.
import { V5R_PAPER_PROMPT_SECTIONS } from './v5r-paper-prompts.js'
// ★ GOAL ROUND 3 — THE PAPER REPLY DISPATCHER IS NO LONGER INSTALLED. It listened for `paper_part`/`paper_review`/
// `paper_final` reply fields, but the kernel's turn parser refuses any field outside `FIELDS ∪ RECORDED_FIELDS`, and none
// of those three names is in it. A listener that can never fire is exactly the "declared but unreachable" defect, so the
// mechanism moved to the TOOL face (`vibe_v5_paper`, declared in ../tools.js) and the module is kept only as a
// DEPRECATED compatibility path for a deployment that installs it explicitly (it now has NO production reader).

/**
 * ROUND 336 — THE BRIDGE FROM TEXT TO PIPELINE. Until now the v5r prompt corpus was carried as DATA: hash-locked,
 * verbatim, and unused by the runtime. The framework already owns a prompt pipeline (`kernel/prompt/index.js`,
 * docs/06) whose sections are declared, ordered by range, bindable per role/phase/member/task, overridable and
 * assembled as a pure function. This export is the whole bridge: every corpus entry becomes a PACK-RANGE section
 * (600..899, one order per entry so the order is total and deterministic), which means the v5r text is now
 * assembled, ordered, snapshotted and overridable BY THE FRAMEWORK rather than concatenated by hand.
 *
 * Why the pack range and not a kernel one: docs/06 §4 forbids a pack from claiming `facts`/`charter`/`contract`,
 * and it is right to - those carry the framework's own read-only contract. The line's text is exactly what a pack
 * is for.
 */
/**
 * ROUND 594 - THE HEADING FIX. The corpus is verbatim from the capture, so it cannot be edited (the drift check would fail), but a
 * capture records what the ORIGINAL printed and the original's heading interpolated the member's kind KEY where the reader-facing
 * LABEL belongs: `kernel/prompt/index.js` says it exactly - `role` is the kind key that bindings select on while `roleLabel` is what
 * a reader sees, and mixing the two renders a heading as "—— researcher r-1". `roleLabel` is already whitelisted, so the bridge - the
 * one place a recording becomes a runtime artifact - rewrites the HEADING occurrence only and leaves every other `{{ role }}` alone.
 */
const headingRoleToLabel = (text) => String(text === undefined || text === null ? '' : text)
  .replace(/(——\s*)\{\{\s*role\s*\}\}/g, '$1{{ roleLabel }}')

export const v5rPromptSections = Object.freeze((Array.isArray(PROMPT_ENTRIES) ? PROMPT_ENTRIES : []).map((p, i) => ({
  name: 'v5r-' + String(p && p.id ? p.id : 'entry-' + (i + 1)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  order: 600 + i,
  range: 'pack',
  source: 'v5r-corpus:' + PROMPT_SOURCE_REL,
  text: headingRoleToLabel(p && (p.text !== undefined ? p.text : p.prompt)),
})))

/** The stance codes live in the pack's own namespace (R-d), so "the framework refused" stays distinguishable. */
export const PACK = Object.freeze({
  id: 'v5r-core',
  version: '1.0.0',
  packContractVersion: 1,
  description: 'v5r 的机构语义包：学术院席位、m-unanimous 法定数、定稿才可入档、旧工具名别名（可装载、可卸载、原子）',

  // What this pack relies on. NOTE (learned the hard way): `vmu.members` is published ONLY once somebody
  // declares slots, so a pack that BRINGS the roster must NOT list it as a requirement - that is a
  // chicken-and-egg the loader reports as "unmet requirements: vmu.members not published". A pack lists
  // what it CONSUMES from others, never the capability it is itself the first to introduce.
  requires: [
    { service: 'vmu.tasks', minVersion: 1 },
    { service: 'vmu.middleware', minVersion: 1 },
  ],

  codes: [
    'VMU_PACK_V5R_CORE_NOT_SETTLED',
    'VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS',
    // PHASE 7 round 7 — the paper subsystem's own named outcomes (packs/v5r/paper.js).
    'VMU_PACK_V5R_CORE_PAPER_STATE',
    'VMU_PACK_V5R_CORE_PAPER_FINGERPRINT_MISMATCH',
    'VMU_PACK_V5R_CORE_PAPER_PDF_NEEDS_KERNEL',
    'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING',
    // PHASE 7 round 9 — the kernel's LaTeX face refused (no engine / timeout / compile error).
    'VMU_PACK_V5R_CORE_PAPER_PDF_FAILED',
  ],

  // Mechanisms only (docs/04 §11 ownership rule): these are v5r's own defaults, expressed as keys the
  // framework already declares, plus ONE pack-layer key that this pack owns.
  settings: {
    'vmu.meetings.quorumRule': 'm-unanimous',
    'vmu.meetings.quorumCap': 3,
    'vmu.meetings.verdictMaxRounds': 3,
    'vmu.meetings.hardLimitMs': 1800000,
    'vmu.meetings.wakeRetries': 5,
    'vmu.records.pointerPropagation': true,
    // ★ ROUND 92 — CORRECTED: this key IS declared in `settings/schema.js:81` (type boolean, default true, owner
    // `office`, hot H1) and therefore DOES appear in the generated table `docs/04-settings.md`. The comment here used to
    // say "not in docs/04 §11 - the pack owns it", which was true when it was written and has been false since the key
    // was declared: what the PACK owns is the opening VALUE it favours, not the declaration. A stale comment of this
    // shape is the "comment disagrees with code" class, and it misleads in a specific way - a reader would conclude the
    // key bypasses the schema, when in fact it is settable, documented and owned like every other knob.
    // ★ PHASE 7 ROUND 3 (Lead ruling): `vmu.records.requireSettledRecords` is FALSE for this institution, because the
    // original let a member WRITE a draft proposition and have it PROMOTED later by the verified track, so refusing
    // drafts makes the original workflow impossible. The risk "an unsettled card looks proved" is carried by the
    // VERIFIED TRACK plus the card's own status (the P0-6 Verified split), NOT by refusing the write.
    //
    // ★ WHERE IT IS SET, AND WHY NOT HERE (measured this round, not assumed): `kernel/records.js` SNAPSHOTS this key
    // at CONSTRUCTION (records.js:189-221 reads the whole records key block once), while a manifest's `settings` block
    // is applied by the pack loader AFTER the kernel exists. Declaring it here therefore changed nothing — the draft
    // was still refused (measured) — and adding it to the value layer WHILE this line existed is the
    // `VMU_PACK_CONFLICT` the Lead hit (one owner per key). The single effective owner for a construct-time key is the
    // VALUE layer, which is exactly how the v3 pack sets it: `settings/defaults.json` carries the false. So the line
    // is gone from this manifest on purpose and the value lives there.


    // ── THE ASSISTANT'S REPORTING POLICY (goal 6, ruling D-09) ─────────────────────────────────────────
    // v5r had NO automatic reporting mechanism: only persona prose ("主动向院士汇报"), the Progress/ files, an
    // academician-initiated overview and the office's manual report(). The framework provides the PRIMITIVE
    // (kernel/report.js: triggers, templates, recipients, channels, trace); THIS is the pack's POLICY - what gets
    // reported, how often, at which threshold, and to whom. The kernel holds none of it.
    //
    // WHY HERE AND NOT IN ../settings/defaults.json: that file is the pack's VALUE layer, and it says the reporting
    // policy deliberately lives on the loaded manifest instead - a key declared in BOTH places is a named
    // VMU_PACK_CONFLICT by design (D-02/O4), so there is exactly one owner, and this is it.
    //
    // The three triggers are the three kinds the primitive declares, one each, so the whole surface is exercised by
    // the pack rather than only by a test: a PERIOD (the office should not have to be asked), an EVENT (a closed
    // meeting is exactly what an outside reader wants to hear about), and a THRESHOLD (enough new artefacts is
    // progress worth reporting). Recipients use v5r's own id for the office - the pseudo-id its mailbox is addressed
    // by - and every template placeholder is one the report renderer knows.
    'vmu.report.enabled': true,
    'vmu.report.reports': [
      {
        name: 'v5r-outward-progress',
        trigger: { kind: 'period', everyMs: 900000 },
        template: '【自动汇报 {{ count }}】{{ name }}（{{ at }}）：本所仍在推进，详情见所内 Progress/。',
        to: ['office'],
        channel: 'digest',
      },
      {
        name: 'v5r-meeting-closed',
        trigger: { kind: 'event', event: 'meeting-closed' },
        template: '【会议结束】{{ name }}（{{ at }}）：有一场会议收束，请复核纪要是否已确认。',
        to: ['office'],
        channel: 'inbox',
      },
      {
        name: 'v5r-artifact-threshold',
        trigger: { kind: 'threshold', metric: 'artifacts', op: 'gte', value: 5 },
        template: '【成果阈值】{{ name }}（{{ at }}）：已累计 {{ metric:artifacts }} 件成果，达到汇报线。',
        to: ['office'],
        channel: 'inbox',
      },
    ],
    // THE PARAMETER DOMAIN the assistant may see and change, and WHO may change it. v5r's boundary was "only the
    // office may change parameters" (withOffice refused everything else with V5_NOT_OFFICE); in vmu that boundary is
    // a DECLARATION, not a rule inside the kernel - the kernel only knows "the domain is these keys and the owners
    // are these names". The domain is deliberately narrow: the reporting knobs themselves plus the three settings
    // that decide what the institute IS (its name, its objective, and whether members get pointer propagation).
    'vmu.report.params': [
      'vmu.report.enabled',
      'vmu.report.reports',
      'vmu.report.minIntervalMs',
      'vmu.report.traceCap',
      'vmu.report.templateMaxChars',
      'vmu.turn.instituteName',
      'vmu.turn.objective',
      'vmu.records.pointerPropagation',
    ],
    'vmu.report.whoMayChange': ['office'],
    'vmu.report.requireReason': false,
  },

  // v5r's institute roster, as OPAQUE SLOTS (D5: the kernel never learns what "academician" means).
  // ★ GOAL A (PHASE 8): THE ROLE-SCOPED TOOL FACE. The allow lists are DERIVED from the three role prompt
  // sections below (the text a member actually reads); the manifest only points at that derivation, so the prompt
  // and the tool table cannot drift. A getter is required because those sections are defined after PACK.
  get toolFaces() { return V5R_TOOL_FACES },
  // ★ PHASE 9 / round 1: WE DO **NOT** DECLARE A TOOL PRESENTATION HERE — and the reason is a real-machine measurement.
  // Round 38 declared `defer`; a real run disproved its premise (`deferLoading` is an ACTIVATION flag: header stayed
  // +769 bytes, parameters still present, +20 B per tool = the flag itself). Round 39 switched to `ptc`; that one DID
  // change the wire, but the founder's ruling is that it changes it too much: with ptc the wire carries a single
  // `run_code` and the member writes CODE to call tools, while these prompt sections still teach tool-by-tool and never
  // mention ptc/run_code ⇒ the wire and the prompt disagree, which is exactly the property this pack is built to keep
  // ("the tools the prompt lists == the tools it can call").
  // The CAPABILITY stays: the manifest field, validatePack's shape check, packToolPresentation() and the host
  // translation layer are all still there for a pack that is willing to adapt its prompts. A non-native declaration now
  // REQUIRES `promptAck` (a marker that must appear in one of this pack's prompt sections) — see kernel/pack.js.
  // ⇒ v5r deliberately declares nothing: zero mechanism, every tool stays native, and the prompt keeps matching the wire.
  // ★★★ PHASE 12 / R15 (finding f): the LABELS were 主持人/成员/临时 while every charter sentence in this pack
  // says 院士/常驻研究员/临时工. That mismatch is why the turn-facts seam can now map a seat to `{{ roleLabel }}` and
  // still hand the member a name the rest of the prompt does not use. These labels are the institution vocabulary,
  // so they live here (policy in pack); the MAPPING from a member slot to its label is the kernel turn-facts job.
  slots: [
    // ★ PHASE 12 / R6 (measured on a full live run): the chair did NOT hold `vote`, so `closureVote.eligible`
    // listed only the residents — while the rule's vote floor is 「min(用户设置数, 院士+常驻研究员数)」, i.e. the
    // academician IS part of the electorate the floor is counted over. A floor computed over a universe the chair is
    // not in can never agree with its own rule. `temp` stays without a vote: temps are 旁听/协作者, and the rule's
    // 常驻研究员 excludes them.
    { id: 'chair', label: '院士', capacity: 1, permissions: ['convene', 'close', 'assign', 'grant', 'freeze', 'vote'] },
    { id: 'member', label: '常驻研究员', capacity: 0, permissions: ['speak', 'vote', 'propose'] },
    { id: 'temp', label: '临时工', capacity: 12, permissions: ['speak'] },
  ],

  // v5r's Progress tracks (docs/07 §4.2): negative knowledge gets its own file, not a footnote.
  tracks: ['progress', 'routes', 'obstacles', 'rejected', 'state'],

  // ── M1 (declarative) ────────────────────────────────────────────────────────────────────────────────
  // Fires on a tool the host REALLY registers (unlike institute-min's v5-era name). The stance: with this
  // pack loaded, ad-hoc script runs are refused unless the operator explicitly disables the rule.
  rules: [
    {
      id: 'v5r-core-no-adhoc-scripts',
      kind: 'rules',
      on: ['tools/pre-execute'],
      when: { all: [{ tool: ['vibe_vmu_script'] }] },
      then: [{
        deny: {
          code: 'VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS',
          message: 'v5r-core：本机构不允许临时脚本直接运行（请走归档/复算流程）',
          hint: '禁用该条目（vibe_vmu_middleware {action:"disable", id:"v5r-core-no-adhoc-scripts"}）或换用别的整合包',
        },
      }],
    },
  ],

  // ── M2 (code module, carried by the pack itself) ────────────────────────────────────────────────────
  // The bus hands a non-rules entry `{ hook, payload, ctx, dryRun, traceId, setting }` (kernel/bus.js), so a
  // pack CAN carry real behaviour. This is v5r's "no record without settlement" stance: appending a record
  // is refused while the pack-layer switch is on.
  middleware: [
    {
      id: 'v5r-core-settled-records-only',
      kind: 'module',
      order: 200,
      on: ['tools/pre-execute'],
      failure: 'closed',
      capabilities: ['read-args', 'deny'],
      handler: async ({ payload, setting }) => {
        const tool = payload && payload.tool
        if (tool !== 'vibe_vmu_records') return undefined
        const args = (payload && payload.args) || {}
        if (args.action !== 'append') return undefined
        const required = !setting || setting('vmu.records.requireSettledRecords') !== false
        if (!required) return undefined
        return {
          deny: {
            code: 'VMU_PACK_V5R_CORE_NOT_SETTLED',
            message: 'v5r-core：只有已定稿（settled）的成果才允许入档',
            hint: '该条目由整合包声明；改 vmu.records.requireSettledRecords=false 或禁用该条目可放行',
          },
        }
      },
    },
    // ROUND 10: v5r's STALL ⇒ CONVENE policy. Module-shaped on purpose (`module:` instead of `handler:`) so
    // `kernel/pack.js` routes it through `kernel/loader.js`, which validates it AND attaches `api` - the only way
    // a middleware can reach a service (`api.services.get`, capability-gated by `trigger-workflow`). The decision
    // itself is pure and lives in `../middleware/stall-meeting.js`: `3 × vmu.control.idleAfterMs` = v5r's 360000
    // (vibe-math-v5r.js:1082/:1083), never hard-coded.
    {
      id: 'v5r.stall-meeting',
      kind: 'module',
      order: 300,
      on: ['control/idle'],
      failure: 'open',
      capabilities: ['trigger-workflow', 'record'],
      module: V5R_STALL_MEETING,
    },
    // ROUND 13: v5r's motion ⇒ box policy (a motion moved in a meeting gets a box, and the meeting's votes are
    // mirrored into it). Module-shaped for the same reason; the policy (which box, which vocabulary) lives entirely
    // in `../middleware/motion-box.js` - the kernel only offers the `bindBox` seam.
    {
      id: 'v5r.motion-box',
      kind: 'module',
      order: 310,
      on: ['meeting/motion'],
      failure: 'open',
      capabilities: ['trigger-workflow', 'record'],
      module: V5R_MOTION_BOX,
    },
    // ★ GOAL ROUND 3: THE PAPER REPLY DISPATCHER ENTRY WAS REMOVED, WITH THE REASON KEPT HERE.
    // It used to sit at order 320 and listen on `turn/reply-parsed` for `paper_part`/`paper_review`/`paper_final`.
    // Those fields are NOT in the kernel's accepted reply fields (`FIELDS ∪ RECORDED_FIELDS`), so the parser refused
    // every such reply as `VMU_TURN_UNKNOWN_FIELD` before this listener could ever run — a listener that can never fire.
    // The institution's paper flow now has a REAL entry: the `vibe_v5_paper` tool (packs/v5r/tools.js) with
    // start/part/review/advance/final/render/status/compile/sections. The module remains on disk as a DEPRECATED
    // compatibility path (no production reader); a deployment may install it explicitly if it wants the old reply-field
    // contract. Leaving the entry here would re-create the "declared but unreachable" defect this round removes.
    // ROUND 20 (task-126): the METRIC COUNTER. Same shape, same capabilities; it observes on the INTRA-turn hooks
    // (`tools/result` = "a tool result exists, observation" per the host's own guidance; the two job-settled events)
    // and writes through `api.services.get('vmu.metrics')`. Which indicators exist and when they are observed stays
    // the deployment's + this pack's business (`vmu.metrics.indicators`): an undeclared name is a NAMED skip the
    // module COUNTS, never a silent no-op and never a throw that breaks the work (the entry is failure:'open').
    {
      id: 'v5r.artifact-counter',
      kind: 'module',
      order: 320,
      on: ['tools/result', 'math/job-settled', 'lean/job-settled'],
      failure: 'open',
      capabilities: ['trigger-workflow', 'record'],
      module: V5R_ARTIFACT_COUNTER,
    },
  ],

  // Legacy names keep working through the alias layer (never by renaming a tool: D6/D14).
  // CONSTRAINT (learned by building this pack): an alias target must be a PUBLISHED SERVICE, not a tool name
  // - the registry validates it, and `vibe_vmu_records` is a tool, so `vibe_v5_poll_vote` maps to `vmu.tasks`.
  // ROUND 342: a pack DECLARES the prompt sections it brings, so assembling a host from this pack needs no
  // hand-passing. They are collected BEFORE the kernel is constructed (a pack must leave no residue, and the
  // pipeline has no unregister), which is why this is a declaration rather than an apply-time side effect.
  // A GETTER, not a plain value: the section list is defined below the manifest, and a manifest that read it
  // eagerly would hit the temporal dead zone. Evaluated on access, so the declaration stays where the manifest is.
  //
  // ROUND 355: the sections were the prompt corpus AND the persona blocks (docs/26 section 3.7).
  //
  // ROUND 374 - CORRECTED AFTER AN INDEPENDENT AUDIT READ THE PACK FILE BY FILE. The corpus and the persona are
  // SNAPSHOTS of one captured run, and declaring them as runtime sections let frozen values into a live assembly:
  // concrete round numbers, concrete rosters, absolute paths, a fixed engine count, and headings built from the
  // binding KEY rather than the human role name. Worse, the persona's per-role blocks carried one binding per captured
  // member while the pipeline appended EVERY matching binding, so a researcher received three identities and three
  // different quorums in one charter. The runtime declaration is now the HAND-WRITTEN, fully variable-ised charter,
  // transcribed from the original source and branching the way the source branches (docs/26 sections 3.10-3.18). The
  // corpus and persona modules stay in the repository as the CONTENT EVIDENCE they are, and are deliberately NOT
  // declared here.
  get sections() { return v5rCharterSectionsGlobal() },
  /** The charter's role and phase bindings, declared the same way. */
  get bindings() { return v5rCharterBindingsGlobal() },
  // PHASE 7 / goal 2: THE DECLARED TOOL FACE (first batch, six tools). The names come from `../tools.js`; the kernel
  // validates the declarations (`kernel/pack.js`) and `host-pack-tools.js` publishes them. The framework never learns
  // a `vibe_v5_*` name - the same rule the v3 pack follows for its ten tools.
  tools: V5R_PACK_TOOLS,
  aliases: [
    { from: 'vibe_v5_poll_vote', to: 'vmu.tasks' },
    { from: 'vibe_v5_poll_open', to: 'vmu.tasks' },
    { from: 'vibe_v5_members', to: 'vmu.members' },
    { from: 'vibe_v5_meeting', to: 'vmu.middleware' },
  ],

  /**
   * ROUND 136 — THE CONTENT AXIS. Up to this round this pack was policy only: settings, codes, rules, middleware
   * and aliases, while the v5r line's INSTRUCTIONS are text. The containment table reached every tool and left this
   * as the one axis that could not be closed inside the framework (vmu holds policy by design), so the text lives
   * here, in the pack, where the line's own semantics already live.
   *
   * The numbers below are NOT typed in by hand and not a second copy: `./v5r-prompts.js` is GENERATED from the
   * corpus by `scripts/generate-pack-prompts.mjs`, which records the corpus sha256 inside it, and
   * `tests/vmu-pack-prompts.test.mjs` asserts that every entry's text equals the corpus VERBATIM. The pack
   * therefore declares the same generated facts the module carries, and the loader reports them in its plan
   * (`kernel/pack.js`: an action of kind `prompts`).
   */
  prompts: {
    module: './v5r-prompts.js',
    source: PROMPT_SOURCE_REL,
    count: PROMPT_COUNTS.total,
    chars: PROMPT_COUNTS.chars,
    sourceSha256: PROMPT_SOURCE_SHA256,
  },
})

// ── THE PERSONA (round 355, docs/26 section 3.7) ──────────────────────────────────────────────────────────────
// Import declarations are hoisted, so importing here keeps the definitions where the data is while the manifest
// getters above still resolve: the getters run at ACCESS time, long after every const below has been initialised.
import { PERSONA_SECTIONS, PERSONA_BINDINGS } from './v5r-persona.js'

/** The sections this pack brings: the prompt corpus, the authored role block, and the captured persona blocks. */
const v5rPersonaSectionsGlobal = () => [...v5rTurnSections, ...PERSONA_SECTIONS]

/** The role bindings for the persona blocks that vary by role (the roster block names the MEMBER, so it needs the
 *  assembly to fill it - recorded as the remaining slot in docs/26 section 3.7 rather than frozen here). */
const v5rPersonaBindingsGlobal = () => PERSONA_BINDINGS

// ROUND 374: the RUNTIME declaration is the hand-written charter, not the captured persona. See the comment on the
// manifest's `sections` getter. Both persona helpers stay exported because a consumer may still want the raw capture;
// only the charter is declared. The import is hoisted like the persona one above, so the getters resolve at access time.
import { CHARTER_SECTIONS, CHARTER_BINDINGS, CHARTER_LEADERLESS_SECTIONS } from './v5r-charter.js'
// GOAL 6 (ruling D-09): the assistant's PER-ROUND surface. The root/system-prompt half of the same assistant surface is
// `./assistant.json`, which the plugin reads by folder name before the kernel exists; this half is registered through
// the manifest because it is rendered by the prompt pipeline on every member round. Two readers, two files, no copy.
import { V5R_ASSISTANT_TURN_SECTIONS } from './v5r-assistant.js'
// ★ F5 (Lead ruling this round): the CORRECTION SECTIONS. The passages that teach a mechanism which does not exist are
// NOT edited where they live — the charter lines are baselined against the original capture (T71) and the fixture
// passages are GENERATED from a capture that the full sweep rewrites. Instead the pack appends a named correction that
// says which of the two to believe, ordered AFTER everything it corrects (order ≥ 800 vs. 600..666). See
// `./v5r-corrections.js` for the whole ruling, including why a `KNOWN_CORRECTIONS` exemption list was rejected.
import { V5R_CORRECTION_SECTIONS } from './v5r-corrections.js'

/**
 * The runtime sections: the charter transcribed from the original source (docs/26 sections 3.10-3.18), PLUS the authored
 * per-member role block. That block is not a snapshot - it is written by hand and driven by member/role/phase - and it is
 * the one section that simply NAMES the phase, which the charter headings do not. PLUS the assistant's reporting duty,
 * which is what turns "主动向院士汇报" from persona prose into a duty a member is told every round.
 */
const v5rCharterSectionsGlobal = () => [...CHARTER_SECTIONS, ...CHARTER_LEADERLESS_SECTIONS, v5rRoleSection,
  // ★ PHASE 7 round 10: BOTH fixture variants are DECLARED here; `decideSections` (the pack's prompt policy) enables
  // exactly one per assembly, according to `vmu.v5r.fixtureMode`. Declaring both is what makes the switch possible at
  // CALL time; the mutual exclusion lives in the policy, not in which sections exist.
  v5rFixtureConstraint, v5rFixtureTools,
  // PHASE 7 / goal 2: the per-role TOOL DISCOVERY sections (non-source-derived, role-scoped, unique markers).
  v5rToolSectionAcademician, v5rToolSectionResearcher, v5rToolSectionTemp,
  // ★ PHASE 9 / round 5: the host renders 【本轮你实际能调用的工具】 INTO these placeholders, one per role (three unique
  // names — duplicate section names are a named pack conflict), so the correction sits right after the static list.
  v5rEffectiveToolsChair, v5rEffectiveToolsMember, v5rEffectiveToolsTemp,
  // PHASE 7 round 8: the PAPER PROMPTS — phase-scoped (`paper-write` / `paper-review` / `paper-final`), so at most ONE
  // of them is in any given turn's prompt (the pipeline matches scope.phase; no kernel change needed).
  ...V5R_PAPER_PROMPT_SECTIONS,
  ...V5R_ASSISTANT_TURN_SECTIONS,
  // ★ F5: LAST IN ORDER, ON PURPOSE. The pipeline sorts by `order`, so 890..893 land after the generated fixtures
  // (600 + i), after the reply catalogues (797/798), after the paper/assistant sections and after the highest declared
  // charter block (820): a reader who meets the obsolete wording first meets the correction afterwards, in the same
  // prompt. ★ 890..893 is inside `ORDER_RANGES.pack` ([600,899]); 900 would silently become `override` — the exact
  // "declared but never assembled" class this round hunts. The four are declared unconditionally (there is no switch
  // that can turn a correction off — a switchable correction is one that can lie by omission).
  ...V5R_CORRECTION_SECTIONS]

/** Its role and phase bindings - one winner per section per assembly is the pipeline's job (docs/26 section 3.20). */
const v5rCharterBindingsGlobal = () => CHARTER_BINDINGS

export default PACK

/**
 * ROUND 341 - THE PER-MEMBER SECTION. The measurement in round 340 showed the original writing a different charter
 * for every member while the framework assembled the SAME text for two different members, because the corpus is
 * member-agnostic. The pipeline already solves that with template variables, so this adds ONE section instead of a
 * text per member: the values come from the assembly context (member, role, phase), which the turn loop supplies,
 * and the whole thing stays editable through settings, config or middleware like any other section.
 */
export const v5rRoleSection = Object.freeze({
  name: 'v5r-role-block',
  order: 601,
  range: 'pack',
  source: 'v5r-corpus:role-template',
  // ROUND 393: the display line names the member with the HUMAN role name, not the binding key. An independent pack
  // audit measured the difference on the generated corpus (fifty headings rendered as "researcher r-1" and none as
  // "常驻研究员 r-1"), and this authored section had the same defect: `role` is the key bindings select on, while
  // `roleLabel` is what a reader sees (docs/26 sections 3.13 and 3.22).
  vars: Object.freeze(['member', 'role', 'roleLabel', 'phase']),
  text: [
    '【本轮面向的成员】代号：{{ member }} ｜角色：{{ roleLabel }} ｜阶段：{{ phase }}',
    '★★ 分派决定做什么，判断属于你自己；异议与未表态都要留痕，沉默不得被折算成任何一侧。',
  ].join('\n'),
})

/**
 * ★ SLV FIXTURE CONSTRAINT (NOT source-derived): the simulation's member turns must not call tools, and the reply
 * surface must be shown as a complete example (a model copies an example far more reliably than it derives a rule).
 * It is deliberately a SEPARATE section with its OWN first-line marker and NO template placeholders, so:
 *   - the source-parity gate (vmu-turn T71) still sees the charter verbatim;
 *   - section markers stay unique;
 *   - no cross-role prose is copied into the source-derived charter.
 */
/**
 * ★ PHASE 7 round 10 — THE `no-tools` VARIANT (the default; UNCHANGED text, byte for byte, so previous rounds' results
 * stay comparable). It and `v5rFixtureTools` below are MUTUALLY EXCLUSIVE: `decideSections` enables exactly one,
 * according to `vmu.v5r.fixtureMode`.
 */
export const v5rFixtureConstraint = Object.freeze({
  name: 'v5r-fixture-constraint',
  order: 602,
  range: 'pack',
  source: 'v5r-fixture:slv',
  text: [
    '【SLV 夹具约束｜本轮不调用工具】',
    '本轮不要调用任何工具（不要 read/grep/搜索/写文件）；只读本轮状态块推理，最后只输出一个 json 围栏回执。',
    'closure poll 的正确回执样例（照抄形状）：{"vote_solved": true} 或 {"vote_solved": false}；只写这一句，不写 progress。',
    // ★ PHASE 8 round 32 (real-machine defect, 19850): with tools switched OFF the model had no tool channel and wrote a
    // DSML tool call INTO THE BODY, which parses as no JSON at all ⇒ VMU_TURN_NO_FENCE and the vote never landed. The
    // cause is a missing fact in the prompt, not a mechanism bug, so the prompt states the fact plainly.
    '★★ 本回合你**没有任何工具可用**——这是刻意的，不是故障（本轮只做判断、不产生新工作，所以不需要工具）。',
    '★★ 因此**不要写任何工具调用语法**（不要 DSML、不要 bash、不要 XML、不要示例调用），也不要尝试调用；把调用语法写进正文会被判为无法解析。',
    '★★ 若是结题表决回合：整个回复必须**只是一行 JSON**（围栏或裸 JSON 均可，但必须能被解析）：{"vote_solved": true} 或 {"vote_solved": false}。',
    // ★ PHASE 7 round 14 (real-machine defect): the old wording said "数组/对象" and showed an ARRAY. The kernel
    // dispatches the reply's `progress` payload STRAIGHT to the records face (`FIELD_OWNERS.progress = {face:vmu.records,
    // op:'put'}`), so it must be ONE OBJECT of put-args; an array (or a string) arrives with `track: undefined` and the
    // whole turn's writes fail ("unknown record track: undefined" ×19 on the real machine). The kind must also be a
    // DECLARED kind ('progress' is declared; 'note' was NOT).
    '其它回合 progress 必须是**一个对象**（不是字符串、不是数组），可直接照抄：{"progress":{"track":"progress","kind":"progress","title":"本轮进展","body":"……"}}；顶层不要写 record/artifacts 等自造字段。',
  ].join('\n'),
})

/**
 * ★ PHASE 7 round 10 — THE `tools` VARIANT OF THE SLV FIXTURE CONSTRAINT.
 *
 * THE MEASUREMENT THAT MOTIVATED IT: `v5r-fixture-constraint` (above) says "本轮不调用任何工具" and it is ALWAYS in the
 * prompt, so the run mode where a member really USES its tools could never be reached — a whole half of the tool face
 * was unreachable in the fixture. The fix is TWO variants plus a switch, NOT one edited section: changing the existing
 * text would make the previous rounds' `cast:true` results and historical runs incomparable (the same reason the
 * original corpus is hash-locked).
 *
 * THE SWITCH: `vmu.v5r.fixtureMode` ∈ `no-tools | tools` (default `no-tools`), read at **CALL time** by
 * `decideSections` (the pack's prompt policy, which the pipeline consults per assembly with the CALL's settings — see
 * `kernel/prompt/index.js` "the policy is read from the CALL's settings"), so the value layer is enough and no kernel
 * change is needed. The two sections are MUTUALLY EXCLUSIVE: `decideSections` enables exactly one of them.
 *
 * NOT source-derived (`v5r-fixture:slv`, same family as the constraint) ⇒ the charter verbatim gate is untouched.
 */
export const v5rFixtureTools = Object.freeze({
  name: 'v5r-fixture-tools',
  order: 603,
  range: 'pack',
  source: 'v5r-fixture:slv',
  // every seat may call its own tools; the per-role list is the `v5r-tools-*` section of the same assembly.
  // ★ PHASE 7 round 12: `scope.role` matches `turn.role`, and that value is the ROSTER SLOT ID (chair/member/temp),
  // while `roleLabel` is the display name (kernel/turn/index.js:691 says mixing display text into a binding is
  // forbidden). The v5r words academician/researcher therefore NEVER match; the slots are the real vocabulary.
  scope: Object.freeze({ role: Object.freeze(['chair', 'member', 'temp']) }),
  text: [
    '【SLV 夹具约束｜本轮调用工具】',
    '本轮**可以且应该**调用你自己的工具：边做边记录，不要把动作攒到回合末尾。',
    '',
    '★ 记录本契约（机制边界，不是建议）：你自己的记录本是**草稿**——在真子代理模式下它是你私有的内核实例，研究所的正式记录本读不到它。',
    '所以“我在库里写了卡”**不等于**“研究所登记了这张卡”。要把某个结论正式立项，就把卡片素材写进你的**回执**（回执字段），由**所办**代记进研究所记录本。',
    '本提示词的「本角色可用的工具｜<你的角色>」段按你的席位列出该角色的工具与一句用途 —— 它是**角色职责清单**，',
    '不承诺「本回合已挂载」。本回合真正挂载了哪些，以宿主装配时给出的「本轮你实际能调用的工具」段为准（该段由宿主写入）；',
    '若提示词里没有那一段，说明本轮提示词不是宿主装配的，工具面就是你所在角色的默认面。不确定时可调用',
    '调用工具后结果立即可见；**回执可以很薄**——动作已经由工具完成了，回执只需说明"这一轮做了什么、下一步是什么"，不要为了凑长篇而重复工具已经记录的内容。',
    // ★ PHASE 12 (F5): this used to say "仍然只输出一个合法 JSON 对象" — an end-of-turn JSON TEXT. The reply is a
    // TOOL ARGUMENT now (`vibe_vmu_turn {op:"reply", report:{…}}`), so teaching the old transport contradicted the
    // very mechanism the harness enforces (a live run's members wrote prose + JSON and the turn was rejected).
    '回执用一次 `vibe_vmu_turn { op: "reply", report: { … } }` 交回（不要输出 JSON 围栏，围栏外也不要说明文字）。',
    // ★ G7 (real machine): members quoted tool receipts containing `{}` in their reply prose, the first brace opened
    // the reply object and the whole turn was rejected as VMU_TURN_BAD_JSON. This is a prompt obligation, not a parser bug.
    '回执正文里【不要】粘贴 JSON 对象或工具回执原文；需要引用时用一句话概括（正文里的大括号会被当成回执边界）。',
    // ★ PHASE 7 round 15 (real-machine defect): this used to say "把 code 与 hint 写进回执的 note" — but `note` is NOT
    // a top-level field the kernel accepts (`FIELDS` ∪ `RECORDED_FIELDS`), so that advice itself produced
    // VMU_TURN_UNKNOWN_FIELD. The refusal text has to go somewhere that IS accepted.
    '若某个工具被具名拒绝：把它的 code 与 hint 写进 **progress 的 body 里**（或下一次工具调用的参数里），**不要**新增 `note` 之类的顶层字段。',
    // ★ PHASE 7 round 15: THE RECEIPT CONTRACT. The real machine's members finished their tool work and then wrote a
    // RICH receipt (`note` + `solved` + `vote_solved` + `meeting_hand` + `record` + a string `progress`) ⇒
    // "unknown reply field(s)" ×9 and the whole turn was voided. The allowed top-level fields come from the kernel's own
    // catalogue (`kernel/turn/index.js` FIELDS ∪ RECORDED_FIELDS, 29 names), but for a thin receipt only these four are
    // ever needed.
    '★★ 回执契约：**顶层只允许这四个字段** —— progress / say / solved / vote_solved（这是本夹具的收敛口径）。★ `note`、`plan` 之类**不在内核字段清单**里，写了会被判 `VMU_TURN_UNKNOWN_FIELD`；`record`/`meeting_hand` 虽在内核清单里，但本夹具要求用工具做、**不要写进回执**。',
    '★★ 已经用工具做完的动作，**不要再写进回执**；回执只放"没有工具对应的纯决定"（例如是否结题）。',
    // ★★★ PHASE 12 / R15 (live run 12, the agent's finding c): THIS LINE USED TO OFFER `{"solved": false}` AS AN
    // EQUIVALENT "minimal receipt" beside `vote_solved`, and the line below paired `{"solved":false}` with
    // 「结题表决只走回执」. The kernel is explicit about the split (`kernel/turn/index.js` `RECORDED_FIELDS` loop:
    // `vote_solved` is the CLOSURE vote, `solved` is only the per-round judgement and is never counted), so a member
    // that copied the `solved` sample VOTED NOTHING while the receipt said `accepted:true` - the institute could not
    // close. A prompt may not teach a field that does not vote as if it voted.
    '★★ 最小合法回执（可直接照抄）：**结题表决用 `{"vote_solved": true|false}`（只有它计结题票）**；个人本轮判断用 `{"solved": false}`（**不计票**）；要写进展就 `{"progress":{"track":"progress","kind":"progress","title":"本轮进展","body":"…"}}`，**不要**把 progress 写成字符串。',
    // ★ PHASE 7 round 14: COPY-PASTE samples, taken from the kernel's real shapes (records.put args / the declared
    // kinds). The real machine proved why this is needed: a member guessed `"progress": "长叙述"` and every write of the
    // turn failed with "unknown record track: undefined".
    '★★ 一次工具调用只做一件事；不要把多个动作攒进一个字段。',
    '★★ 回执的形状样例（可直接照抄；progress 必须是**一个对象**，不是字符串/数组）：',
    '   · {"progress":{"track":"progress","kind":"progress","title":"本轮进展","body":"这一轮做了什么与下一步"}}',
    '   · {"say":"已经在群里说过的一句话"}（已经用 vibe_v5_say 说过时，回执里可只留一句说明）',
    '   · {"vote_solved":false}（结题表决只走回执；它不是工具）',
    '   · 写卡片请直接用工具（vibe_v5_record_*），**不要**把卡片塞进回执的 record 字段。',
    '★ 上表是职责说明；**本回合你实际能调用哪些，以【本轮你实际能调用的工具】为准**。',
  ].join('\n'),
})

/**
 * ★ PHASE 7 / goal 2 — THE TOOL DISCOVERY SECTIONS (NOT source-derived, exactly like `v5rFixtureConstraint` above).
 *
 * The tool face is declared in `../tools.js`; a tool a member cannot SEE is a paper capability, so each ROLE gets its
 * own list. Three separate sections instead of one shared one, on purpose:
 *   · the PHASE 6 defect was cross-role prelude copying (one role's prose leaking into seven others), so no text is
 *     shared between these sections and each names its own role in the FIRST line (unique marker);
 *   · the fixture constraint (order 602, ALWAYS on) tells a member not to call tools in an SLV run. The caveat line
 *     inside each section makes the precedence explicit instead of leaving two contradictory instructions side by side.
 *
 * ★★★ TWO VOCABULARIES, ONE SECTION EACH - DO NOT READ A MISMATCH INTO IT. The section NAME uses the KIND vocabulary
 * ('academician'/'researcher'/'temp') while `scope.role` SELECTS on the ROSTER SLOT ID ('chair'/'member'/'temp'), because
 * tools/turn.js sets `role: m.slot`. So 'v5r-tools-researcher' carrying `scope: { role: 'member' }` is CORRECT, and reading a
 * 'role vs tool-section mismatch' out of the rendered prompt is reading the two vocabularies as one. Measured: I did exactly that
 * while reviewing a real run's prompt (a `角色：member` line above a `# v5r-tools-researcher` heading), then verified the mapping here.
 *
 * WHY THE SUBSETS DIFFER — AND WHERE THEY ARE DECIDED: `../seat-faces.js` decides, one row per tool, one decision per seat,
 * each with the v5r rule it rests on (denials included). Rule 1's layering is the shape: `chair` convenes/closes/assigns/
 * adjudicates and relays office messages; `member` proposes, records, speaks, debates and votes; `temp` is hired to do the
 * work — it speaks, logs its own progress and proposition, runs Lean (rule 10.3) and writes papers, but has no vote, does not
 * convene, does not hire and does not plan. That is PACK POLICY, and it is now declared in ONE place instead of being a side
 * effect of how many bullet lines somebody happened to write here.
 */
/**
 * ★ RUN 31 / task-15 — THIS SEAT'S BULLET LIST IS **RENDERED**, NOT HAND-WRITTEN. The one-line-per-tool decisions (and the v5r
 * rule each rests on, denials included) live in `../seat-faces.js`; `seatBulletLines('chair')` renders the `· a / b —— 说明` lines
 * from them, and the manifest's `toolFaces` is computed from the SAME table. So "what the seat is told it may call" and "what the
 * face lets it call" are one decision, not two documents that can drift — and `tests/vmu-run31-seat-faces.test.mjs` compares them
 * bidirectionally (a granted-but-untaught name and a taught-but-denied name are both failures).
 *
 * The PROSE below is the part written for a human: receipt samples, mailbox semantics, the environment-probe discipline and the
 * sentinel. It is copied byte-for-byte from the pre-refactor section, so this change does not rewrite the institution's voice.
 * ★ Adding a capability is ONE ROW in `seat-faces.js` (plus its wording there) — never an edit to this array.
 */
const V5R_PROSE_CHAIR = Object.freeze([
    '★★ 回执样例（可直接照抄）：{"progress":{"track":"progress","kind":"progress","title":"本轮进展","body":"做了什么与下一步"},"solved":false}；★ progress 必须是**一个对象**（不是字符串/数组），kind 只能是已声明的（如 progress）。',
    '★ 论文流程：start → part（逐章／逐人）→ advance → review → render；advance 可能多次（互审全票通过后还要再 advance 才到 awaiting-editor，之后由 chair 席 final），被具名拒时照拒因处理、不要跳过阶段。',
    '★ 留言（信箱）不需要立即阅读 —— 你可以在有空时再看。',
    '★ 查看顺序：先看列表（发件人 / 时间 / 标题 / 已读 / 待办），再挑一封打开读；读过的会自动标已读，需要跟进的标待办（todo）。',
    '★★【紧急】只表示：发送方希望你【及时 / 在线】回复。它【不代表】内容更重要、【也不代表】你必须立刻中断手上的推导。除这种情况外，一律走非紧急留言（默认），这样才不会因为频繁高强度交互而偏离原任务、拖慢进度。',
    '★ 你若需要等别人回你，用 vibe_v5_wait（等到就返回）；不要用反复轮询。',
    '★ 动手前先探环境：要跑 python／Lean／LaTeX 之前，先用 vibe_vmu_env {action:\'probe\', need:\'…\'} 探一次；探通了再跑。',
    '★★ 探不通不要硬试：探测失败是【正常结果】（ok:false），不要换着花样反复重试，更不要自己改系统或安装任何东西 —— 框架不会替你安装，也不会静默假装成功。',
    '★★ 探不通就上报：用 vibe_vmu_env {action:\'report\', need:\'…\', why:\'为什么这轮需要它\'} 记一条 environment-missing 的 finding ⇒ 主代理会读到它。',
    '★★★ 你是主代理（院士席）：读到 environment-missing 的 finding 时，向用户报告缺什么、给出 installCommand（可先用 vibe_vmu_env {action:\'probe\', need:\'…\'} 回执里的 installCommand），并请求授权（引导用户自己装，或经用户明确授权后再部署）。',
    '★★★★ 未获授权前不要尝试安装、不要改用户的系统 —— 这条优先于"把任务做完"。',
    '★ 清单之外的工具不要尝试调用：本段列出的就是你此刻能用的全部；没列出的名字属于别的席位。。\n    若本轮提示词含有「本轮不调用工具」的夹具约束，则以那条为准；没有该约束时，上表就是你现在真的能调用的工具。',
    '★ 上表是职责说明；**本回合你实际能调用哪些，以【本轮你实际能调用的工具】为准**。',
])

export const v5rToolSectionAcademician = Object.freeze({
  name: 'v5r-tools-academician',
  order: 603,
  range: 'pack',
  source: 'v5r-fixture:tools',
  scope: Object.freeze({ role: 'chair' }),
  text: [
    '【本角色可用的工具｜院士】',
    ...seatBulletLines('chair'),
    ...V5R_PROSE_CHAIR,
  ].join('\n'),
})

/**
 * ★ RUN 31 / task-15 — THIS SEAT'S BULLET LIST IS **RENDERED**, NOT HAND-WRITTEN. The one-line-per-tool decisions (and the v5r
 * rule each rests on, denials included) live in `../seat-faces.js`; `seatBulletLines('member')` renders the `· a / b —— 说明` lines
 * from them, and the manifest's `toolFaces` is computed from the SAME table. So "what the seat is told it may call" and "what the
 * face lets it call" are one decision, not two documents that can drift — and `tests/vmu-run31-seat-faces.test.mjs` compares them
 * bidirectionally (a granted-but-untaught name and a taught-but-denied name are both failures).
 *
 * The PROSE below is the part written for a human: receipt samples, mailbox semantics, the environment-probe discipline and the
 * sentinel. It is copied byte-for-byte from the pre-refactor section, so this change does not rewrite the institution's voice.
 * ★ Adding a capability is ONE ROW in `seat-faces.js` (plus its wording there) — never an edit to this array.
 */
const V5R_PROSE_MEMBER = Object.freeze([
    '转达所办口吻的消息不是你的职责（那是院士的）；所内全局视图也不是（仅院士）。',
    '★ 论文流程：start → part（逐章／逐人）→ advance → review → render；advance 可能多次（互审全票通过后还要再 advance 才到 awaiting-editor，之后由 chair 席 final），被具名拒时照拒因处理、不要跳过阶段。',
    '★ 留言（信箱）不需要立即阅读 —— 你可以在有空时再看。',
    '★ 查看顺序：先看列表（发件人 / 时间 / 标题 / 已读 / 待办），再挑一封打开读；读过的会自动标已读，需要跟进的标待办（todo）。',
    '★★【紧急】只表示：发送方希望你【及时 / 在线】回复。它【不代表】内容更重要、【也不代表】你必须立刻中断手上的推导。除这种情况外，一律走非紧急留言（默认），这样才不会因为频繁高强度交互而偏离原任务、拖慢进度。',
    '★ 你若需要等别人回你，用 vibe_v5_wait（等到就返回）；不要用反复轮询。',
    '★ 动手前先探环境：要跑 python／Lean／LaTeX 之前，先用 vibe_vmu_env {action:\'probe\', need:\'…\'} 探一次；探通了再跑。',
    '★★ 探不通不要硬试：探测失败是【正常结果】（ok:false），不要换着花样反复重试，更不要自己改系统或安装任何东西 —— 框架不会替你安装，也不会静默假装成功。',
    '★★ 探不通就上报：用 vibe_vmu_env {action:\'report\', need:\'…\', why:\'为什么这轮需要它\'} 记一条 environment-missing 的 finding ⇒ 主代理会读到它，并由主代理向用户请求授权。',
    '★ 未获授权前不要尝试安装、不要改用户的系统：等主代理告诉你用户已授权再动。',
    '★ 清单之外的工具不要尝试调用：本段列出的就是你此刻能用的全部；没列出的名字属于别的席位，调用只会被具名拒。',
    '★★ 回执样例（可直接照抄）：{"progress":{"track":"progress","kind":"progress","title":"本轮进展","body":"做了什么与下一步"},"solved":false}；★ progress 必须是**一个对象**（不是字符串/数组）。',
    '若本轮提示词含有「本轮不调用工具」的夹具约束，则以那条为准。',
    '★ 上表是职责说明；**本回合你实际能调用哪些，以【本轮你实际能调用的工具】为准**。',
])

export const v5rToolSectionResearcher = Object.freeze({
  name: 'v5r-tools-researcher',
  order: 604,
  range: 'pack',
  source: 'v5r-fixture:tools',
  scope: Object.freeze({ role: 'member' }),
  text: [
    '【本角色可用的工具｜研究员】',
    ...seatBulletLines('member'),
    ...V5R_PROSE_MEMBER,
  ].join('\n'),
})

/**
 * ★ RUN 31 / task-15 — THIS SEAT'S BULLET LIST IS **RENDERED**, NOT HAND-WRITTEN. The one-line-per-tool decisions (and the v5r
 * rule each rests on, denials included) live in `../seat-faces.js`; `seatBulletLines('temp')` renders the `· a / b —— 说明` lines
 * from them, and the manifest's `toolFaces` is computed from the SAME table. So "what the seat is told it may call" and "what the
 * face lets it call" are one decision, not two documents that can drift — and `tests/vmu-run31-seat-faces.test.mjs` compares them
 * bidirectionally (a granted-but-untaught name and a taught-but-denied name are both failures).
 *
 * The PROSE below is the part written for a human: receipt samples, mailbox semantics, the environment-probe discipline and the
 * sentinel. It is copied byte-for-byte from the pre-refactor section, so this change does not rewrite the institution's voice.
 * ★ Adding a capability is ONE ROW in `seat-faces.js` (plus its wording there) — never an edit to this array.
 */
const V5R_PROSE_TEMP = Object.freeze([
    '招人、汇报与全局视图不是临时席位的职责（那是院士与常驻研究员的工具）。',
    '★ 论文流程：start → part（逐章／逐人）→ advance → review → render；advance 可能多次（互审全票通过后还要再 advance 才到 awaiting-editor，之后由 chair 席 final），被具名拒时照拒因处理、不要跳过阶段。',
    '★ 留言（信箱）不需要立即阅读 —— 你可以在有空时再看。',
    '★ 查看顺序：先看列表（发件人 / 时间 / 标题 / 已读 / 待办），再挑一封打开读；读过的会自动标已读，需要跟进的标待办（todo）。',
    '★★【紧急】只表示：发送方希望你【及时 / 在线】回复。它【不代表】内容更重要、【也不代表】你必须立刻中断手上的推导。除这种情况外，一律走非紧急留言（默认），这样才不会因为频繁高强度交互而偏离原任务、拖慢进度。',
    '★ 你若需要等别人回你，用 vibe_v5_wait（等到就返回）；不要用反复轮询。',
    '★ 动手前先探环境：若你的工作要用到外部环境（python／Lean／LaTeX），先用 vibe_vmu_env {action:\'probe\', need:\'…\'} 探一次；探通了再跑。',
    '★★ 探不通不要硬试：探测失败是【正常结果】（ok:false），不要换着花样反复重试，更不要自己改系统或安装任何东西 —— 框架不会替你安装，也不会静默假装成功。',
    '★★ 探不通就上报：用 vibe_vmu_env {action:\'report\', need:\'…\', why:\'为什么这轮需要它\'} 记一条 environment-missing 的 finding ⇒ 主代理会读到它，并由主代理向用户请求授权。',
    '★ 未获授权前不要尝试安装、不要改用户的系统：等主代理告诉你用户已授权再动。',
    '★ 清单之外的工具不要尝试调用：本段列出的就是你此刻能用的全部；没列出的名字属于别的席位，调用只会被具名拒。',
    '★★ 回执样例（可直接照抄）：{"progress":{"track":"progress","kind":"progress","title":"本轮进展","body":"做了什么与下一步"}}；★ progress 必须是**一个对象**（不是字符串/数组）。',
    '若本轮提示词含有「本轮不调用工具」的夹具约束，则以那条为准。',
    '★ 上表是职责说明；**本回合你实际能调用哪些，以【本轮你实际能调用的工具】为准**。',
])

export const v5rToolSectionTemp = Object.freeze({
  name: 'v5r-tools-temp',
  order: 605,
  range: 'pack',
  source: 'v5r-fixture:tools',
  scope: Object.freeze({ role: 'temp' }),
  text: [
    '【本角色可用的工具｜临时成员】',
    ...seatBulletLines('temp'),
    ...V5R_PROSE_TEMP,
  ].join('\n'),
})

/**
 * ★★★ PHASE 9 / round 5 — THE EFFECTIVE-TOOLS PLACEHOLDER (one per role, deliberately THREE names).
 *
 * WHY A PLACEHOLDER AT ALL: the host now computes the effective member tool set ONCE and uses it for BOTH the wire and
 * a prompt block titled 【本轮你实际能调用的工具｜…】. Without a declared placeholder the host APPENDS that block wherever
 * the assembled section list ends — which can be far from the static role list it corrects, so a member could read two
 * mutually contradictory tables. With a placeholder the correction sits exactly where the table it corrects sits.
 *
 * ★ WHY THE NAMES ARE NOT IDENTICAL: `collectPackSections` (kernel/pack.js) refuses DUPLICATE section names by name
 * (`VMU_PACK_CONFLICT`) — three sections literally called `v5r-effective-tools` would refuse the whole pack load. The
 * host's lookup accepts EITHER the exact name OR any section whose text carries the block title, so these three keep
 * unique names and carry the title; the rendered block still replaces them IN PLACE.
 *
 * ★ The text below is never meant to be read by a model: the host overwrites `text` on each assembly. It still says
 * what to do if the replacement did NOT happen, so a silent wiring drift cannot leave a dangling placeholder looking
 * like a tool table.
 */
const v5rEffectiveToolsText = [
  '【本轮你实际能调用的工具｜占位段】',
  '★ 这一段本该在每次模型请求前被宿主替换成【本轮你实际能调用的工具】的真实清单（与 wire 完全一致）。你读到了原文，说明替换没有发生。',
  '★ 为什么会发生：宿主只给"有席"的 agent 写这段清单（chair / member / temp）。根代理不属于任何席，它的面对应的是全量目录，所以这段对它保持原文——这是设计，不是故障。',
  '★★ 所以：不要据本段推断任何可用工具。以你这回合真实可用的工具为准；如果你需要知道"我能调什么"，看真正被替换成清单的那一段（若你没有任何一段被替换，你就是根代理，可调用面即 wire）。',
].join('\n')

export const v5rEffectiveToolsChair = Object.freeze({
  name: 'v5r-effective-tools-chair',
  order: 610,
  range: 'pack',
  source: 'v5r-fixture:effective-tools',
  scope: Object.freeze({ role: 'chair' }),
  text: v5rEffectiveToolsText,
})

export const v5rEffectiveToolsMember = Object.freeze({
  name: 'v5r-effective-tools-member',
  order: 611,
  range: 'pack',
  source: 'v5r-fixture:effective-tools',
  scope: Object.freeze({ role: 'member' }),
  text: v5rEffectiveToolsText,
})

export const v5rEffectiveToolsTemp = Object.freeze({
  name: 'v5r-effective-tools-temp',
  order: 612,
  range: 'pack',
  source: 'v5r-fixture:effective-tools',
  scope: Object.freeze({ role: 'temp' }),
  text: v5rEffectiveToolsText,
})

/** The corpus sections PLUS the per-member section.
 *
 * ★★ task-215 ① — THIS EXPORT IS **NOT** RUNTIME-SAFE, AND THAT IS THE REASON ON THE LINE: it contains the captured
 * corpus, whose literal `轮次 N` / `有表决权者 N 人` are a RECORD of what one original run printed (the original
 * derived both live: `rounds.get()`, `voterCount()`). Handing THIS set to the pipeline would freeze 66 round numbers
 * and 66 voter counts into live prompts. The runtime declaration is the hand-written charter — `PACK.sections`
 * (docs/26 §3.7, round 374: "captured snapshots must not be used as a runtime source"). A caller that really means to
 * wire a section set must pass it through `assertRuntimeSafeSections`, which refuses this one BY NAME. */
/**
 * ★ RUN 31 / task-15 — THE FACE IS DECLARED IN `../seat-faces.js`; THIS FILE ONLY HANDS IN THE CATALOGUE.
 *
 * WHAT THIS REPLACED, AND WHY IT WAS WRONG: until run 31 these three exports were DERIVED FROM THE PROSE above — scan each
 * role section's lines, keep the ones starting with `·`, and treat the names found there as the seat's capability. The
 * direction was backwards: the prompt became the ACL, and a capability nobody had written a bullet for was silently
 * forbidden. Measured on a live run: the chair seat could not tally a ruling (verdict_final), ask for rulings (verdict_ask),
 * advance a meeting round (meeting_round), adopt a blueprint (blueprint), promote into Verified/ (verified_promote) or close
 * fidelity (fidelity_conclude); the temp seat could not run Lean although rule 10.3 gives Lean to all three seats; the
 * permanent researcher was denied second and task_get. In each case the INSTITUTION'S RULES allowed it and the PROMPT's
 * word count refused it (rule 11.2: 越权/规则不靠提示词).
 *
 * NOW: `v5rDeclaredToolNames` (the catalogue this pack declares) is handed to the declaration, which answers per seat; the
 * sections above are rendered FROM the same table. So the two can no longer disagree, and the drift that remains possible
 * (a row with no bullet, a bullet with no row — remember round 31's 20-vs-22 measurement) is caught by
 * `tests/vmu-run31-seat-faces.test.mjs` in both directions instead of being discovered in a live session.
 *
 * ★ ROUND 24 RULING, STILL HONOURED — DENY, NOT ALLOW. `allow` would drop the framework faces (they are activated by THIS
 * pack's settings declaration, so hiding them would be one pack decision overriding another) and would silently hide any
 * framework face added later. So the seat's face is still expressed as `deny = declared(v5r) − allow(seat)`, computed by
 * `seatDenyNames`, and every other tool is left alone.
 */
const v5rDeclaredToolNames = Object.freeze((V5R_PACK_TOOLS || []).map((t) => t && t.name).filter((n) => typeof n === 'string'))
export const V5R_ROLE_TOOL_NAMES = Object.freeze({
  chair: Object.freeze(seatAllowNames('chair', v5rDeclaredToolNames)),
  member: Object.freeze(seatAllowNames('member', v5rDeclaredToolNames)),
  temp: Object.freeze(seatAllowNames('temp', v5rDeclaredToolNames)),
})
export const V5R_ROLE_TOOL_DENY = Object.freeze({
  chair: Object.freeze(seatDenyNames('chair', v5rDeclaredToolNames)),
  member: Object.freeze(seatDenyNames('member', v5rDeclaredToolNames)),
  temp: Object.freeze(seatDenyNames('temp', v5rDeclaredToolNames)),
})
export const V5R_TOOL_FACES = seatFaces(v5rDeclaredToolNames)

export const v5rTurnSections = Object.freeze([...v5rPromptSections, v5rRoleSection])

/** The captured-snapshot fingerprint: a literal round number, a literal voter count, or the captured absolute path. */
export const SNAPSHOT_VALUE_RE = /轮次\s*\d+|有表决权者\s*\d+\s*人|VibeMath\/Projects\//

const refuseCorpus = (code, message, hint) => {
  const e = new Error(message)
  e.code = code
  e.hint = hint
  return e
}

/**
 * THE NAMED DOOR between a RECORD and a RUNTIME SOURCE (task-215 ①). Refuses BY NAME when a section set carries
 * captured snapshot values, with the reason and the offending sections in the message, and returns `{ok:true}` for a
 * set that carries none (so "refuses everything" is impossible — `PACK.sections` passes). Pure and dependency-free:
 * it can be called from the wiring path, from a test, or from a future loader.
 */
export function assertRuntimeSafeSections(sections, what = 'the runtime section set', bindings = null) {
  const list = Array.isArray(sections) ? sections : []
  const offenders = []
  // ★ ROUND 94 — THE RUNTIME SOURCE IS SECTIONS **AND BINDINGS**, SO THE DOOR CHECKS BOTH. It used to inspect only the
  // sections, and that blindness was measured: one charter binding (phase `verify`) carried a captured absolute path,
  // the guard still answered {ok:true}, and an assembled verify-phase prompt really did contain it. A guard that covers
  // half of what the pipeline consumes is worse than none, because it reports safety. The third argument is OPTIONAL so
  // every existing two-argument caller - and the tests that pin its behaviour - keep working unchanged.
  for (const s of list) {
    const m = SNAPSHOT_VALUE_RE.exec(String((s && s.text) || ''))
    if (m) offenders.push(((s && s.name) || '(unnamed)') + ' [' + m[0] + ']')
  }
  // the bindings are part of the same runtime source: same regex, same refusal, one list of offenders
  for (const b of (Array.isArray(bindings) ? bindings : [])) {
    const m = SNAPSHOT_VALUE_RE.exec(String((b && b.text) || ''))
    if (m) offenders.push('binding ' + ((b && b.section) || '(unnamed)') + ' [' + m[0] + ']')
  }
  if (offenders.length) {
    throw refuseCorpus('VMU_PACK_V5R_CORPUS_NOT_RUNTIME',
      what + ': ' + offenders.length + ' site(s) carry CAPTURED SNAPSHOT values — a recorded run\u2019s literals (round numbers, voter counts, absolute paths) must not become live prompt text',
      'declare the hand-written charter instead (`PACK.sections`; docs/26 §3.7 / round 374). Offenders: ' + offenders.slice(0, 4).join(', ') + (offenders.length > 4 ? ' +' + (offenders.length - 4) + ' more' : ''))
  }
  return { ok: true, sections: list.length, bindings: Array.isArray(bindings) ? bindings.length : 0, checked: list.length + (Array.isArray(bindings) ? bindings.length : 0) }
}

