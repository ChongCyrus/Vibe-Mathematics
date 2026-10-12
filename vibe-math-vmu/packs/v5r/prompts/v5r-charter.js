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
/** Each members starting direction, keyed by the member the corpus named. */
export const CHARTER_MEMBER_BINDINGS = Object.freeze([
  { section: 'v5r-founding-direction', member: "acad", text: '给你的起点方向：统领全所：统筹全局、拆解并分派工作、设定优先级、督导进度。' },
  { section: 'v5r-founding-direction', member: "r-1", text: '给你的起点方向：从最基础的定义与已知结论出发，寻找可用的经典工具与已有定理。' },
  { section: 'v5r-founding-direction', member: "r-2", text: '给你的起点方向：尝试构造反例或极端情形，界定命题的适用范围与边界。' },
  { section: 'v5r-founding-direction', member: "r-3", text: '给你的起点方向：把它归约到一个更小、更本质的核心里程，先攻这个核心。' },
  { section: 'v5r-founding-direction', member: "t-1", text: '给你的起点方向：核对文献引理' },
])
export const CHARTER_BINDINGS = Object.freeze([...CHARTER_ROLE_BINDINGS, ...CHARTER_PHASE_BINDINGS, ...CHARTER_MEMBER_BINDINGS])

/** The leader-conditional pairs, by section, for the loop to choose between (docs/26 section 3.10). */
export const CHARTER_LEADER_VARIANTS = Object.freeze(Object.fromEntries(
  CHARTER_BLOCKS.filter((b) => b.kind === 'leader-conditional').map((b) => [b.name, b.texts])))

/** The sections as the pipeline wants them: the shared text is the default, bindings override per role or phase. */
/**
 * THE SHARED PAPER-COMPILATION NOTE, defined ONCE.
 *
 * The corpus carries these two lines in both the writing and the finalising prompts, byte for byte, and this module
 * had them duplicated in two sections - so a correction to one would silently leave the other saying something else.
 * A block that two prompts share belongs in ONE place; a section is a slice of a prompt, not the only way to reuse
 * text. Which phases receive it is still the sections decision below, so overriding either section still works.
 */

export const CHARTER_SECTIONS = Object.freeze(CHARTER_BLOCKS.map((b) => ({
  name: b.name,
  order: b.order,
  range: b.range,
  source: 'v5r-charter:source-derived',
  text: b.kind === 'shared' ? b.texts.shared
    : (b.kind === 'phase' ? (b.texts.normal || '')
      : (b.texts['with-leader'] || b.texts.researcher || '')),
})))
