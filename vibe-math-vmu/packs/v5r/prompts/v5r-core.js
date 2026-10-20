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
// PHASE 7 round 8: THE PAPER PROMPTS (write / cross-review / final), phase-scoped and NON-source-derived.
import { V5R_PAPER_PROMPT_SECTIONS } from './v5r-paper-prompts.js'

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
  slots: [
    { id: 'chair', label: '主持人', capacity: 1, permissions: ['convene', 'close', 'assign', 'grant', 'freeze'] },
    { id: 'member', label: '成员', capacity: 0, permissions: ['speak', 'vote', 'propose'] },
    { id: 'temp', label: '临时', capacity: 12, permissions: ['speak'] },
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
import { CHARTER_SECTIONS, CHARTER_BINDINGS } from './v5r-charter.js'
// GOAL 6 (ruling D-09): the assistant's PER-ROUND surface. The root/system-prompt half of the same assistant surface is
// `./assistant.json`, which the plugin reads by folder name before the kernel exists; this half is registered through
// the manifest because it is rendered by the prompt pipeline on every member round. Two readers, two files, no copy.
import { V5R_ASSISTANT_TURN_SECTIONS } from './v5r-assistant.js'

/**
 * The runtime sections: the charter transcribed from the original source (docs/26 sections 3.10-3.18), PLUS the authored
 * per-member role block. That block is not a snapshot - it is written by hand and driven by member/role/phase - and it is
 * the one section that simply NAMES the phase, which the charter headings do not. PLUS the assistant's reporting duty,
 * which is what turns "主动向院士汇报" from persona prose into a duty a member is told every round.
 */
const v5rCharterSectionsGlobal = () => [...CHARTER_SECTIONS, v5rRoleSection, v5rFixtureConstraint,
  // PHASE 7 / goal 2: the per-role TOOL DISCOVERY sections (non-source-derived, role-scoped, unique markers).
  v5rToolSectionAcademician, v5rToolSectionResearcher, v5rToolSectionTemp,
  // PHASE 7 round 8: the PAPER PROMPTS — phase-scoped (`paper-write` / `paper-review` / `paper-final`), so at most ONE
  // of them is in any given turn's prompt (the pipeline matches scope.phase; no kernel change needed).
  ...V5R_PAPER_PROMPT_SECTIONS,
  ...V5R_ASSISTANT_TURN_SECTIONS]

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
export const v5rFixtureConstraint = Object.freeze({
  name: 'v5r-fixture-constraint',
  order: 602,
  range: 'pack',
  source: 'v5r-fixture:slv',
  text: [
    '【SLV 夹具约束｜本轮不调用工具】',
    '本轮不要调用任何工具（不要 read/grep/搜索/写文件）；只读本轮状态块推理，最后只输出一个 json 围栏回执。',
    'closure poll 的正确回执样例（照抄形状）：{"vote_solved": true} 或 {"vote_solved": false}；只写这一句，不写 progress。',
    '其它回合 progress 必须是数组/对象（不能是字符串），正确样例：{"progress":[{"track":"progress","kind":"note","title":"本轮进展","body":"……"}]}；顶层不要写 record/artifacts 等自造字段。',
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
 * WHY THE SUBSETS DIFFER: the pack's slots say what each kind is for (`chair`: convene/close/assign/grant/freeze -
 * it relays office messages too; `member`: propose/speak - it records and speaks; `temp`: speak only - a temporary
 * seat logs its progress and speaks, and does not open library cards of its own). That is PACK POLICY: it is stated
 * here as text and nowhere in the kernel, so another institution can pick different subsets by editing this section.
 */
export const v5rToolSectionAcademician = Object.freeze({
  name: 'v5r-tools-academician',
  order: 603,
  range: 'pack',
  source: 'v5r-fixture:tools',
  scope: Object.freeze({ role: 'academician' }),
  text: [
    '【本轮可用的工具｜院士】',
    '· vibe_v5_record_progress —— 写你自己的研究日志（track 可选 progress/routes/obstacles/rejected/state；证伪的路走 rejected，阻塞走 obstacles）。',
    '· vibe_v5_record_proposition —— 写命题卡（statement、value、motive、p 四项必填；p 是你对它为真的概率，未定稿可以先写，草稿不会被当成已验证）。',
    '· vibe_v5_record_method —— 写方法卡（content、value、motive、p 四项必填）。',
    '· vibe_v5_record_subproblem —— 写子问题卡（statement、value、motive、p 四项必填）。',
    '· vibe_v5_say —— 在群里说一句（省略 to）；to 填成员 id 即私信；填 meeting 则记进那场会议的发言。发言者必须是你自己的真名册 id。',
    '· vibe_v5_message —— 以「所办/人类」的口吻给所内转达消息（to 可为成员 id、all 或 voters）。',
    '· vibe_v5_task_create / vibe_v5_task_list / vibe_v5_task_update —— 建任务、看任务板、按修订号更新任务（认领/改派/完成/重开/改依赖）。',
    '· vibe_v5_hire —— 招一名临时成员（需要 purpose 与 initial_task；会把人放进 temp 席并按需建一张任务）。',
    '· vibe_v5_report —— 生成一份人类可读的所内报告（编制、任务板、会议、成果计数）。',
    '· vibe_v5_overview —— 所内全局视图（名册、任务板、会议、成果与在办状态）；只有院士席位可以调用。',
    '· vibe_v5_assign —— 分派：把一张任务（task_id）或新建的一张（subject）交给某成员，必须写明 why 与 acceptance。',
    '· vibe_v5_fire —— 辞退一名成员（成员面 end ＋ 其未完成任务转 cancelled；邮件不会被清理，回执会说明）。',
    '· vibe_v5_nudge —— 督办：唤醒某成员并给出理由与一个具体建议的下一步。',
    '· vibe_v5_prioritize —— 设定全所优先级（有序的 {task_id, priority} 列表 ＋ why）；任务账本没有 priority 列，所以顺序作为耐久记录归档，回执会说明它没有改到任务板上。',
    '· vibe_v5_feedback —— 工作经验／流程反馈库（不是研究结论）：op=add/update/list。',
    '· vibe_v5_read_library —— 读任何人的成果库（只读）。',
    '· vibe_v5_tool_help —— 回答"我现在能用什么"：清单取自内核自己的声明（packTools），并报告宿主可见计数。',
    '· vibe_v5_meeting —— 召集会议（agenda 必填；kind=sync/division/verify-request/solve-vote）。原版还能由非院士席"提议开会"，本面没有 propose 路径，回执会具名说明。',
    '· vibe_v5_motion / vibe_v5_second —— 在会中提动议（kind=topic/procedural/resolution）／附议；本内核没有动议的 secondedBy，故附议与撤回都具名拒（不假装）。',
    '· vibe_v5_poll_open —— 开选项投票（院士席）：question ＋ ≥2 个 options；§7.1 的逐票规则本内核只能在构造期设，所以回执会把"要了但没生效"的规则列在 unapplied。',
    '· vibe_v5_poll_vote —— 在已开的选项投票上投票（只有常设席有票权；列席、受邀、临时工无票权 → 具名拒）。',
    '· vibe_v5_poll_close —— 关票计票（院士席）；min_votes 未达时本次投票【不成立】，且具名说明它不是法定人数。',
    '· vibe_v5_verdict —— 对验证对象投 [0,1] 的裁决（1=真、0=假、中间=不确定估计），target 是进行中票箱的 id。',
    '· vibe_v5_start / vibe_v5_stop / vibe_v5_pause / vibe_v5_resume —— 建所并启动／停机／暂停／继续（全部走内核自己的控制状态；resume 走控制面，不是耐久投影）。',
    '· vibe_v5_configure / vibe_v5_set —— 改【已声明】的设置键；回执会带该键的热级：H1 立即生效，H2 重启后生效；未声明的键与 H3 只读键都会被具名拒。',
    '· vibe_v5_lean_run / vibe_v5_lean_job / vibe_v5_lean_lib / vibe_v5_lean_read / vibe_v5_lean_archive —— 真的用内核 Lean 面编译既有 .lean 文件／查作业／看库／读归档／归档（kind: def/lemma/proof/blocked）；本包不自己起子进程。',
    '若本轮提示词含有「本轮不调用工具」的夹具约束，则以那条为准；没有该约束时，上表就是你现在真的能调用的工具。',
  ].join('\n'),
})

export const v5rToolSectionResearcher = Object.freeze({
  name: 'v5r-tools-researcher',
  order: 604,
  range: 'pack',
  source: 'v5r-fixture:tools',
  scope: Object.freeze({ role: 'researcher' }),
  text: [
    '【本轮可用的工具｜研究员】',
    '· vibe_v5_record_progress —— 写你自己的研究日志（track 可选 progress/routes/obstacles/rejected/state）。',
    '· vibe_v5_record_proposition —— 写命题卡（statement、value、motive、p 必填；草稿可先写，不会被当成已验证）。',
    '· vibe_v5_record_method —— 写方法卡（content、value、motive、p 必填）。',
    '· vibe_v5_record_subproblem —— 写子问题卡（statement、value、motive、p 必填）。',
    '· vibe_v5_say —— 群里发言（省略 to）或私信（to 填成员 id）；发言者必须是你自己的真名册 id。',
    '· vibe_v5_task_create / vibe_v5_task_list / vibe_v5_task_update —— 建任务、看任务板、按修订号更新任务。',
    '· vibe_v5_hire —— 你作为常驻研究员可以给自己招一名临时成员（需要 purpose 与 initial_task）。',
    '· vibe_v5_feedback —— 工作经验／流程反馈库：op=add/update/list（不是研究结论）。',
    '· vibe_v5_read_library —— 读任何人的成果库（只读）。',
    '· vibe_v5_tool_help —— 回答"我现在能用什么"：清单取自内核自己的声明（packTools）。',
    '· vibe_v5_motion —— 在会中提动议（kind=topic/procedural/resolution）；附议/撤回在本内核没有对应面，会具名拒。',
    '· vibe_v5_poll_vote —— 在已开的选项投票上投票（只有常设席有票权）。',
    '· vibe_v5_verdict —— 对验证对象投 [0,1] 的裁决。',
    '· vibe_v5_lean_run / vibe_v5_lean_job / vibe_v5_lean_lib / vibe_v5_lean_read / vibe_v5_lean_archive —— 用内核 Lean 面编译既有 .lean 文件／查作业／看库／读归档／归档（本包不自己起子进程；无宿主 spawn 接缝时具名拒）。',
    '转达所办口吻的消息不是你的职责（那是院士的 vibe_v5_message）；所内全局视图也不是（vibe_v5_overview 仅院士）。',
    '若本轮提示词含有「本轮不调用工具」的夹具约束，则以那条为准。',
  ].join('\n'),
})

export const v5rToolSectionTemp = Object.freeze({
  name: 'v5r-tools-temp',
  order: 605,
  range: 'pack',
  source: 'v5r-fixture:tools',
  scope: Object.freeze({ role: 'temp' }),
  text: [
    '【本轮可用的工具｜临时成员】',
    '· vibe_v5_record_progress —— 把你这一轮的进展写进研究日志（临时席位只记进展，不建自己的方法/命题库）。',
    '· vibe_v5_say —— 在群里发言（省略 to）或私信（to 填成员 id）；发言者必须是你自己的真名册 id。',
    '· vibe_v5_task_list / vibe_v5_task_update —— 看任务板、就地更新分给你的那张任务（认领/完成/重开）。',
    '· vibe_v5_read_library —— 读任何人的成果库（只读）。',
    '· vibe_v5_tool_help —— 回答"我现在能用什么"：清单取自内核自己的声明（packTools）。',
    '招人、汇报与全局视图不是临时席位的职责（那是院士与常驻研究员的工具）。',
    '若本轮提示词含有「本轮不调用工具」的夹具约束，则以那条为准。',
  ].join('\n'),
})

/** The corpus sections PLUS the per-member section.
 *
 * ★★ task-215 ① — THIS EXPORT IS **NOT** RUNTIME-SAFE, AND THAT IS THE REASON ON THE LINE: it contains the captured
 * corpus, whose literal `轮次 N` / `有表决权者 N 人` are a RECORD of what one original run printed (the original
 * derived both live: `rounds.get()`, `voterCount()`). Handing THIS set to the pipeline would freeze 66 round numbers
 * and 66 voter counts into live prompts. The runtime declaration is the hand-written charter — `PACK.sections`
 * (docs/26 §3.7, round 374: "captured snapshots must not be used as a runtime source"). A caller that really means to
 * wire a section set must pass it through `assertRuntimeSafeSections`, which refuses this one BY NAME. */
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

