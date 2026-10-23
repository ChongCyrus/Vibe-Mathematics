/**
 * THE PROMPT-SWITCH MIDDLEWARE (goal 2: the integration pack folder).
 *
 * WHAT MOVED, AND WHY IT MATTERS
 * The framework's turn loop used to contain, hard-coded, the policy of which prompt sections this
 * particular institution switches on and off: the three optional blocks, which of the two reply
 * catalogues is sent, which of the three meeting speaker states applies, and which of the four
 * formalisation status lines is shown. None of that is framework knowledge. It is the institution's
 * own preference, and the framework's job is to offer the mechanism (a section can be enabled or
 * disabled, settings can be read) while the pack states the policy.
 *
 * So the policy now lives here, as a pure function, and the framework asks it. The function takes
 * only what it needs - the settings, the turn - and returns a list of decisions. It does not touch
 * the pipeline, so it can be tested, read and replaced without a kernel, and a different pack can
 * make entirely different choices for the same framework.
 *
 * TWO DISCIPLINES CARRIED OVER FROM THE KERNEL VERSION
 * 1. OFF means ZERO INJECTION, not a "disabled" notice. A disabled section contributes nothing,
 *    heading included.
 * 2. An unrecognised state is REFUSED by name rather than guessed. Guessing would put words into
 *    the prompt that the caller never asked for.
 */
import { CHARTER_LEADER_PAIRS } from '../prompts/v5r-charter.js'

/** The three blocks the source gates. Absent settings mean ON. */
export const OFF_SWITCHES = Object.freeze([
  ['vmu.pointer.propagation', 'v5r-pointer-contract'],
  ['vmu.turn.selfCheck', 'v5r-turn-resources'],
  ['vmu.turn.feedback', 'v5r-feedback-line'],
])

/** Sections that exist ONLY to be REPLACED by the HOST in the root system prompt.
 *
 * `host.js:1595-1621` writes 【本轮你实际能调用的工具｜<slot>】 over one of these three sections on every
 * `system-prompt/assemble`, so the correction sits exactly where the static role table sits. The TURN
 * pipeline has NO replacement step — it only assembles sections — so carrying these into a turn prompt hands
 * the model a paragraph whose own text says 「你读到了原文，说明替换没有发生」. That is a self-describing
 * falsehood: measured on the live run `full-1024-021750.jsonl`, where every member prompt carried
 * `# v5r-effective-tools-chair` (and the member/temp twins) verbatim. Zero injection is better than a
 * placeholder whose producer never runs on this path.
 */
export const HOST_ONLY_SECTIONS = Object.freeze([
  'v5r-effective-tools-chair',
  'v5r-effective-tools-member',
  'v5r-effective-tools-temp',
])

/** The two reply catalogues. The original sends one or the other, never both. */
const CATALOGUES = Object.freeze({ compact: 'v5r-reply-compact', full: 'v5r-reply-spec' })

/** The meeting prompt's three mutually exclusive speaker states. */
export const MEETING_STATES = Object.freeze([
  ['invited', 'v5r-meeting-invited'],
  ['others', 'v5r-meeting-others'],
  ['first', 'v5r-meeting-first'],
])

/** The formalisation status line: four branches, exactly one shown, and it is ALWAYS shown. */
export const FORMAL_STATUSES = Object.freeze([
  ['passed', 'v5r-formal-status-passed'],
  ['blocked', 'v5r-formal-status-blocked'],
  ['attempted', 'v5r-formal-status-attempted'],
  ['none', 'v5r-formal-status-none'],
])

export const V5R_PROMPT_SWITCH_STATES = Object.freeze({
  offSwitches: OFF_SWITCHES,
  hostOnly: HOST_ONLY_SECTIONS,
  catalogues: CATALOGUES,
  meetingStates: MEETING_STATES,
  formalStatuses: FORMAL_STATUSES,
})

/**
 * Decide, for one turn, which sections the pipeline should carry.
 *
 * Returns `{ decisions, errors }`:
 *   decisions - `[{ name, enabled }]`, in a stable order, safe to apply one by one
 *   errors    - `[{ code, message, hint }]`; a non-empty list means the turn must not proceed
 *
 * Pure by construction: no pipeline, no kernel, no clock, no I/O.
 */
export function decideSections({ settings = {}, turn = {} } = {}) {
  const LEADER_PAIRS = CHARTER_LEADER_PAIRS
  const s = settings || {}
  const decisions = []
  const errors = []

  // (0) ★ PHASE 7 round 10 — THE SLV FIXTURE MODE: exactly ONE of the two variants is enabled.
  //   `vmu.v5r.fixtureMode` ∈ { 'no-tools' (default), 'tools' }. Read HERE, at call time (the pipeline consults this
  //   policy per assembly with the CALL's settings), so the value layer is enough. An unknown value is REFUSED by name
  //   rather than defaulted — guessing which fixture the operator meant would put the wrong instruction in the prompt.
  const fixtureMode = s['vmu.v5r.fixtureMode'] === undefined ? 'no-tools' : s['vmu.v5r.fixtureMode']
  if (fixtureMode !== 'no-tools' && fixtureMode !== 'tools') {
    errors.push({
      code: 'VMU_INVALID_ARGUMENT',
      message: 'unknown vmu.v5r.fixtureMode: ' + String(fixtureMode),
      hint: "one of: 'no-tools', 'tools' (default 'no-tools' keeps historical runs comparable)",
    })
  }
  decisions.push({ name: 'v5r-fixture-constraint', enabled: fixtureMode !== 'tools' })
  decisions.push({ name: 'v5r-fixture-tools', enabled: fixtureMode === 'tools' })

  // (1) The three gated blocks.
  for (const [key, section] of OFF_SWITCHES) {
    decisions.push({ name: section, enabled: s[key] !== false })
  }

  // (1b) ★ HOST-ONLY placeholders (see HOST_ONLY_SECTIONS): always off in a TURN prompt. The host replaces
  // them in the root system prompt, which is a different assembly; here there is nothing to replace them with.
  for (const name of HOST_ONLY_SECTIONS) decisions.push({ name, enabled: false })

  // (2) Exactly one reply catalogue. The pack's preference is the compact one; anything other than
  // the exact string "full" stays on the default rather than being treated as a request for it.
  const catalogue = s['vmu.turn.replyCatalogue'] === 'full' ? 'full' : 'compact'
  for (const [which, section] of Object.entries(CATALOGUES)) {
    decisions.push({ name: section, enabled: which === catalogue })
  }

  // (4) ★★★ THE LEADER PAIR: exactly one of {with-leader, -leaderless} per pair. Measured on a full live run: the agent read a
  // charter that said 「本所的领头人是**院士 」—— the with-leader sentence with an empty {{ setting:vmu.turn.leaderId }} — and reported
  // "charter fields unresolved". The leaderless texts already existed but nothing could select them, because the manifest getter is
  // no-arg and both variants shared one section name. They now have distinct names (v5r-charter.js CHARTER_LEADERLESS_SECTIONS), so
  // this is where the choice actually happens - in the pack's POLICY, which is where a policy belongs.
  //
  // WHICH SIDE IS THE SAFE DEFAULT: leaderless. The charter's own rule 1 (v5r-charter.js:21) is that a charter must NEVER name a
  // leader who is not on staff, so when this policy cannot PROVE the leader is on staff it must not emit the naming sentence. A
  // false "no leader" costs a less personal organisational paragraph; a false "leader is X" tells the whole institute to report to
  // someone who may not exist. Unknowable therefore resolves to leaderless, deliberately.
  const leaderId = typeof s['vmu.turn.leaderId'] === 'string' ? s['vmu.turn.leaderId'] : ''
  const rosterIds = Array.isArray(turn && turn.roster)
    ? turn.roster.map((m) => String(m && m.id !== undefined ? m.id : m))
    : null
  const leaderOnStaff = typeof turn.leaderOnStaff === 'boolean'
    ? turn.leaderOnStaff
    : (rosterIds !== null && leaderId !== '' && rosterIds.includes(leaderId))
  for (const [withName, leaderlessName] of LEADER_PAIRS) {
    decisions.push({ name: withName, enabled: leaderOnStaff })
    decisions.push({ name: leaderlessName, enabled: !leaderOnStaff })
  }

  // (3) The meeting speaker states: exactly one inside the meeting phase, none outside it, and an
  // unrecognised state is refused rather than defaulted.
  // ★ task-209 (P4) IS REVERTED, BY LEAD RULING, AND THE REASON IS THE PHILOSOPHY RATHER THAN TASTE. It defaulted an
  // absent `turn.meetingState` to `first`, on the grounds that the original always injected a branch. But that else case
  // was a fallback for the ORIGINAL'S OWN caller, which always supplied a state - and in vmu the caller is a DECLARER, for
  // whom "no state" is a legitimate declaration meaning "this is not a meeting-speaking turn". Inferring "you are the first
  // speaker" from silence puts words in the prompt the caller never asked for, which is precisely what T124 pins and what
  // the root philosophy forbids (no consumer, no mechanism). BEHAVIOURAL parity is preserved: a caller that means the
  // first speaker declares `first`. What changes is WHO decides - and the declarer should. Note also that the comment
  // directly above already stated the contract as "none outside it, and an unrecognised state is refused rather than
  // defaulted", so the default contradicted this file's own stated rule.
  const named = turn.meetingState
  const state = turn.phase === 'meeting' ? named : null
  if (state !== null && !MEETING_STATES.some(([key]) => key === state)) {
    errors.push({
      code: 'VMU_INVALID_ARGUMENT',
      message: 'unknown meeting speaker state: ' + String(state),
      hint: 'one of: ' + MEETING_STATES.map(([key]) => key).join(', '),
    })
  }
  for (const [key, section] of MEETING_STATES) {
    decisions.push({ name: section, enabled: state === key })
  }

  // (4) The formalisation status line: always shown, so the default branch is "none".
  const status = turn.formalStatus === undefined || turn.formalStatus === null ? 'none' : turn.formalStatus
  if (!FORMAL_STATUSES.some(([key]) => key === status)) {
    errors.push({
      code: 'VMU_INVALID_ARGUMENT',
      message: 'unknown formalisation status: ' + String(status),
      hint: 'one of: ' + FORMAL_STATUSES.map(([key]) => key).join(', '),
    })
  }
  for (const [key, section] of FORMAL_STATUSES) {
    decisions.push({ name: section, enabled: status === key })
  }

  return { decisions, errors }
}

/**
 * The middleware entry as the pack mechanism wants it: an id, a kind, and the hook it contributes.
 * `on` names the point in the turn where the framework should ask. ROUND 544: this said `turn.assemble`, a name the host
 * does not bridge - the framework publishes `prompt/assemble` - so the entry was INERT in a real preset while the tests,
 * which call `decideSections` directly, stayed green. A pack speaks the framework's vocabulary, so the name is the host's.
 */
export const v5rPromptSwitchMiddleware = Object.freeze({
  id: 'v5r.prompt-switches',
  kind: 'module',
  on: 'prompt/assemble',
  apply: decideSections,
})
