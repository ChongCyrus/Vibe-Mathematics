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

/** The three blocks the source gates. Absent settings mean ON. */
export const OFF_SWITCHES = Object.freeze([
  ['vmu.pointer.propagation', 'v5r-pointer-contract'],
  ['vmu.turn.selfCheck', 'v5r-turn-resources'],
  ['vmu.turn.feedback', 'v5r-feedback-line'],
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

  // (2) Exactly one reply catalogue. The pack's preference is the compact one; anything other than
  // the exact string "full" stays on the default rather than being treated as a request for it.
  const catalogue = s['vmu.turn.replyCatalogue'] === 'full' ? 'full' : 'compact'
  for (const [which, section] of Object.entries(CATALOGUES)) {
    decisions.push({ name: section, enabled: which === catalogue })
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
