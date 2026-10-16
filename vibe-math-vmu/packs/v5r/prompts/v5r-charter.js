// vmu pack — the v5r CHARTER, rebuilt from the ORIGINAL SOURCE LOGIC and FRAGMENTS (docs/26 section 3.10).
//
// WHY HAND-WRITTEN AND NOT GENERATED: the user directed that this be built from the original assembly logic rather
// than by post-processing captured output, and reading `charterFor(member)` in vibe-math-v5r.js (L3131-3361) confirms
// that is the right shape - it is already fragment assembly, branching on the member kind and pushing lines while
// filling live data. So the fragments below are transcribed from that function, and every value it read becomes a
// `{{ }}` variable or a settings lookup instead of a frozen string.
//
// WHAT THE SOURCE READS, and therefore what must arrive as variables:
//   instituteName            -> {{ setting:vmu.turn.instituteName }}      (objective lives in vmu.turn.objective)
//   problem.statement        -> {{ setting:vmu.turn.objective }}      (its default IS the source's fallback)
//   member.id                -> {{ member }}
//   member.kind              -> {{ role }}                            (the role binding dimension)
//   member.term/hiredBy/direction -> {{ setting:vmu.turn.tempTerm }} / tempHiredBy / tempDirection, or turn facts
//   acadId (may be EMPTY)    -> {{ setting:vmu.turn.leaderId }}  (decides whole sentences)
//   quorumM()                -> {{ quorum }}
//   rosterLine(member)       -> {{ roster }}
//   instRel('Members/<x>/')  -> Members/{{ member }}/
//
// TWO RULES CARRIED OVER FROM THE SOURCE, both stated there in comments:
//   1. a charter must NEVER name a leader who is not on staff (every leader sentence is guarded by `acadId`);
//   2. a brief must describe THE MEMBER IT IS ADDRESSED TO, never a "last member we touched" global - the source
//      records that this exact mistake once shipped, telling every member it was the previously founded one.


/**
 * The fragment blocks, in the SOURCE ORDER. `kind` says how the block varies:
 *   'shared'          - one text for everyone
 *   'role'            - one text per member kind (academician | researcher | temp)
 *   'leader-conditional' - two texts, chosen by whether the institute has a leader (the loop decides; see docs/26)
 */
import { LATEX_ENGINE_NOTE } from './v5r-blocks-a.js'
import { CHARTER_BLOCKS_A } from './v5r-blocks-a.js'
import { CHARTER_BLOCKS_B } from './v5r-blocks-b.js'

// The two halves concatenated, in order. Every export below reads this, exactly as it did when the array was inline.
export const CHARTER_BLOCKS = Object.freeze([...CHARTER_BLOCKS_A, ...CHARTER_BLOCKS_B])

/** One binding per role for every role-varying block, so the assembly puts the right charter in front of each kind. */
export const CHARTER_ROLE_BINDINGS = Object.freeze(CHARTER_BLOCKS.filter((b) => b.kind === 'role').flatMap((b) =>
  Object.entries(b.texts).map(([role, text]) => ({ section: b.name, role, text }))))

/** One binding per PHASE for the heading and the ask (docs/26 section 3.13): the phase dimension carries them. */
export const CHARTER_PHASE_BINDINGS = Object.freeze(CHARTER_BLOCKS.filter((b) => b.kind === 'phase').flatMap((b) =>
  Object.entries(b.texts).map(([phase, text]) => ({ section: b.name, phase, text }))))

/** Both binding sets, for an assembly that wants the whole picture in one argument. */
/**
 * ★ P3 FIX (phase-3 parity audit; was `v5r-charter.js:49-55`, five LITERAL member ids): THE STARTING DIRECTIONS ARE
 * DERIVED FROM ROSTER DATA. The ORIGINAL read the member's own field - `member.direction` in `initialPrompt`
 * (`vibe-math-v5r.js:4072`) - so with the literal table a deployment whose roster uses different ids silently lost
 * every direction. `charterMemberBindings(members)` takes roster records in that same shape (each `{ id, direction }`)
 * and emits one binding per member: the id comes from the ROSTER, the text from that member's own `direction`.
 * The corpus roster below is DATA (the ids the corpus names, with the direction each was seeded with) - it is the
 * default INPUT, not the rule.
 * ★ NAMED FALLBACK, NEVER SILENCE: a member with no `direction` receives `CHARTER_DIRECTION_UNSPECIFIED` as its text,
 * so the reader sees that the direction is missing rather than seeing nothing.
 * ★ LIMITATION, BY NAME (also recorded in `docs/audit/source-prompt-coverage.md`): this module is static prompt DATA
 * and cannot read the runtime roster. An assembly that knows the roster must call `charterMemberBindings(itsRoster)`;
 * the default below serves the corpus roster only, which is why the live direction pass-through stays PARTIAL there.
 */
export const CHARTER_DIRECTION_UNSPECIFIED = '（未声明起步方向：编制数据里该成员没有 direction 字段——本条由 v5r-charter 具名给出，而不是静默省略）'
export const charterMemberBindings = (members = []) => (Array.isArray(members) ? members : [])
  .filter((m) => m && m.id !== undefined && m.id !== null && String(m.id) !== '')
  .map((m) => ({
    section: 'v5r-founding-direction',
    member: String(m.id),
    text: '给你的起点方向：' + (typeof m.direction === 'string' && m.direction.trim() !== '' ? m.direction : CHARTER_DIRECTION_UNSPECIFIED),
  }))
/** The CORPUS roster's own directions (ids + the `direction` each was seeded with), in corpus order. */
export const CHARTER_CORPUS_ROSTER = Object.freeze([
  { id: 'acad', direction: '统领全所：统筹全局、拆解并分派工作、设定优先级、督导进度。' },
  { id: 'r-1', direction: '从最基础的定义与已知结论出发，寻找可用的经典工具与已有定理。' },
  { id: 'r-2', direction: '尝试构造反例或极端情形，界定命题的适用范围与边界。' },
  { id: 'r-3', direction: '把它归约到一个更小、更本质的核心里程，先攻这个核心。' },
  { id: 't-1', direction: '核对文献引理' },
])
export const CHARTER_MEMBER_BINDINGS = Object.freeze(charterMemberBindings(CHARTER_CORPUS_ROSTER))
export const CHARTER_BINDINGS = Object.freeze([...CHARTER_ROLE_BINDINGS, ...CHARTER_PHASE_BINDINGS, ...CHARTER_MEMBER_BINDINGS])

/** The leader-conditional pairs, by section, for the loop to choose between (docs/26 section 3.10). */
export const CHARTER_LEADER_VARIANTS = Object.freeze(Object.fromEntries(
  CHARTER_BLOCKS.filter((b) => b.kind === 'leader-conditional').map((b) => [b.name, b.texts])))

/**
 * ★ P2 FIX (phase-3 parity audit): THE `leaderless` VARIANT IS NOW SELECTABLE. `CHARTER_SECTIONS` below used to
 * hard-pick `texts['with-leader']` for EVERY leader-conditional block, so the `leaderless` text - transcribed from
 * the source's `acadId === ''` branch (`vibe-math-v5r.js:3202-3207`, the "本所没有院士…优先级由集体协商" sentence)
 * - could not be selected by anything, while this audit's coverage table claimed it was covered. This selector is
 * what selects it, and it reads the variants through `CHARTER_LEADER_VARIANTS`, so the two cannot drift apart.
 * ★ THE DEFAULT IS `hasLeader: true`, AND THAT ASSUMPTION IS SAID OUT LOUD: this module is static prompt data and
 * knows no roster at load time. An assembly that knows the institute is leaderless asks for `{ hasLeader: false }`
 * (which sections go out is the caller's decision - the turn/section policy - and is outside this file).
 * ★ NO SILENT SUBSTITUTION: a leader-conditional block that carries no `leaderless` variant is named in
 * `CHARTER_LEADERLESS_OMISSIONS` and receives `CHARTER_LEADERLESS_MISSING_TEXT`, never the leader-naming text -
 * a charter that names a leader who is not on staff breaks the source's rule 1 (see the header).
 */
export const CHARTER_LEADERLESS_MISSING_TEXT = '（缺少 leaderless 变体：本块在「无院士编制」下没有可用的替换文本，已具名占位——见 CHARTER_LEADERLESS_OMISSIONS）'
export const CHARTER_LEADERLESS_OMISSIONS = Object.freeze(CHARTER_BLOCKS
  .filter((b) => b.kind === 'leader-conditional' && typeof (CHARTER_LEADER_VARIANTS[b.name] || {}).leaderless !== 'string')
  .map((b) => b.name))

/**
 * The sections as the pipeline wants them: the shared text is the default, bindings override per role or phase.
 * `hasLeader: true` reproduces the historical (leader-assuming) reading byte for byte; `hasLeader: false` swaps every
 * leader-conditional block to its `leaderless` variant.
 */
export const charterSections = ({ hasLeader = true } = {}) => CHARTER_BLOCKS.map((b) => ({
  name: b.name,
  order: b.order,
  range: b.range,
  source: 'v5r-charter:source-derived',
  text: b.kind === 'leader-conditional'
    ? (hasLeader === false
      ? ((CHARTER_LEADER_VARIANTS[b.name] || {}).leaderless || CHARTER_LEADERLESS_MISSING_TEXT)
      : ((CHARTER_LEADER_VARIANTS[b.name] || {})['with-leader'] || ''))
    : (b.kind === 'shared' ? b.texts.shared
      : (b.kind === 'phase' ? (b.texts.normal || '')
        : (b.texts['with-leader'] || b.texts.researcher || ''))),
}))

/**
 * THE SHARED PAPER-COMPILATION NOTE, defined ONCE.
 *
 * The corpus carries these two lines in both the writing and the finalising prompts, byte for byte, and this module
 * had them duplicated in two sections - so a correction to one would silently leave the other saying something else.
 * A block that two prompts share belongs in ONE place; a section is a slice of a prompt, not the only way to reuse
 * text. Which phases receive it is still the sections decision below, so overriding either section still works.
 */

export const CHARTER_SECTIONS = Object.freeze(charterSections({ hasLeader: true }))
