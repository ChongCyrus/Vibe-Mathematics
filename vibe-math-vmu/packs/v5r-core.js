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
export const v5rPromptSections = Object.freeze((Array.isArray(PROMPT_ENTRIES) ? PROMPT_ENTRIES : []).map((p, i) => ({
  name: 'v5r-' + String(p && p.id ? p.id : 'entry-' + (i + 1)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  order: 600 + i,
  range: 'pack',
  source: 'v5r-corpus:' + PROMPT_SOURCE_REL,
  text: String((p && (p.text !== undefined ? p.text : p.prompt)) || ''),
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
  ],

  // Mechanisms only (docs/04 §11 ownership rule): these are v5r's own defaults, expressed as keys the
  // framework already declares, plus ONE pack-layer key that this pack owns.
  settings: {
    'vmu.meetings.quorumRule': 'm-unanimous',
    'vmu.meetings.quorumCap': 3,
    'vmu.meetings.reconsiderFloor': 0,
    'vmu.meetings.verdictMaxRounds': 3,
    'vmu.meetings.hardLimitMs': 1800000,
    'vmu.meetings.wakeRetries': 5,
    'vmu.records.pointerPropagation': true,
    // PACK-LAYER key (not in docs/04 §11 - the pack owns it, and `setting()` reads it like any other):
    'vmu.records.requireSettledRecords': true,
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

/**
 * The runtime sections: the charter transcribed from the original source (docs/26 sections 3.10-3.18), PLUS the authored
 * per-member role block. That block is not a snapshot - it is written by hand and driven by member/role/phase - and it is
 * the one section that simply NAMES the phase, which the charter headings do not.
 */
const v5rCharterSectionsGlobal = () => [...CHARTER_SECTIONS, v5rRoleSection]

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

/** The corpus sections PLUS the per-member section - what a v5r-pack host should hand the pipeline. */
export const v5rTurnSections = Object.freeze([...v5rPromptSections, v5rRoleSection])
