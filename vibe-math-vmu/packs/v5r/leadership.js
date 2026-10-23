// vibe-math-vmu/packs/v5r/leadership.js — WHO LEADS THIS INSTITUTE, READ FROM THE ROSTER, NOT FROM MEMORY
//
// WHY THIS FILE EXISTS (measured on the FULL LIVE RUN of 2026-10-24, transcript
// `_oneoff/vm-slv/full-1024-033834.jsonl`): the root session installed the academician with
// `vibe_vmu_control {action:"hire", slot:"chair", member_id:"member-1"}`, and every member prompt then began
//
//     · 本所当前没有在册院士：你只需向**雇主**负责（它给你派活）。
//
// — the LEADERLESS charter — while `member-1` was seated in the `chair` slot and its own role block said
// 「角色：chair」. Two correct components disagreed because NOTHING connected "a chair is seated" to
// `vmu.turn.leaderId` (default `''`, `settings/schema.js`), and the pack's leader-pair policy
// (`middleware/prompt-switches.js` §4) may only name a leader it can PROVE is on staff. Its safe default
// then answered "no leader" — a false statement about a seated academician, i.e. the
// "declared but not in effect / a diagnostic that contradicts itself" class this project keeps catching.
//
// WHAT THIS FILE IS: the pure reading that makes the disagreement NAMED. It does not write settings
// (a pack must not invent a second write path: `vibe_v5_configure` already routes through the kernel's
// guarded writer), it does not decide the prompt (the policy does), and it holds no roster copy — the
// caller passes the live rows. Its only consumer today is `vibe_v5_overview` (chair-only), which prints
// `leadership` and raises a named warning when the two facts disagree.
//
// THE OPEN DESIGN GAP IS NAMED, NOT HIDDEN (ledger §23): closing it for real needs ONE of
//   (a) a kernel "derived setting" seam (a reader that falls back to a roster fact), or
//   (b) a capability-gated settings service an M2 module may call,
// and both are kernel capabilities, i.e. a ruling rather than a pack edit. Until one of them exists, the
// honest shape is: the safe default stays (never name an unproven leader), and the office is TOLD, by
// name, that seating a chair without also setting `vmu.turn.leaderId` leaves the charter leaderless.

/** The slot whose holder IS this institute's academician. Read by the pack from its own manifest. */
export const LEADER_SLOT = 'chair'

/**
 * The four states, as NAMES. A state is not decoration: `code` is what the overview prints and what a
 * test can pin, so "consistent" cannot be claimed by silence.
 */
export const LEADERSHIP_STATES = Object.freeze({
  OK: 'leader-named-and-seated',
  NO_CHAIR: 'no-chair-seated',
  CHAIR_WITHOUT_ID: 'chair-seated-but-leaderId-empty',
  ID_NOT_ON_ROSTER: 'leaderId-names-a-member-not-on-the-roster',
  ID_NOT_CHAIR: 'leaderId-names-a-member-outside-the-chair-slot',
})

const idOf = (m) => String(m && m.id !== undefined ? m.id : m)
const slotOf = (m) => String(m && m.slot !== undefined ? m.slot : '')

/**
 * Read the two facts and say whether they agree.
 *
 * @param {object} input
 * @param {Array}  input.roster   live roster rows (`{id, slot, state}`); the CALLER owns the copy
 * @param {string} input.leaderId the resolved `vmu.turn.leaderId` (`''` = the declared default)
 * @param {string} [input.leaderSlot=LEADER_SLOT] which slot means "leader" in this pack
 * @returns {{code:string, consistent:boolean, leaderId:string, seatedChairs:string[],
 *            leaderOnStaff:boolean, leaderSlot:string, note:string, next:string|null}}
 */
export function leadershipReading({ roster, leaderId, leaderSlot = LEADER_SLOT } = {}) {
  const rows = Array.isArray(roster) ? roster : []
  const id = typeof leaderId === 'string' ? leaderId : ''
  // ★ A member who has ENDED is not seated: `members.ended()` keeps the row, so filtering on state is
  // what makes "on staff" mean "can be named", which is the charter's own rule 1.
  // ★★ THE PRECEDENCE BUG THIS LINE HAD FOR ONE RUN: `String(m && m.state !== 'ended')` parses as
  // `m && (m.state !== 'ended')` — a BOOLEAN — and `String(true)` is never `'ended'`, so the filter accepted
  // every row and an ended chair still counted as seated. Newly pinned by `tests/vmu-leadership-reading.test.mjs`
  // §4; the parenthesised form below is the whole fix.
  const live = rows.filter((m) => m && String(m.state) !== 'ended')
  const seatedChairs = live.filter((m) => slotOf(m) === String(leaderSlot)).map(idOf)
  const idRow = id === '' ? null : live.filter((m) => idOf(m) === id)[0] || null

  let code
  if (id !== '' && idRow === null) code = LEADERSHIP_STATES.ID_NOT_ON_ROSTER
  else if (id !== '' && slotOf(idRow) !== String(leaderSlot)) code = LEADERSHIP_STATES.ID_NOT_CHAIR
  else if (id === '' && seatedChairs.length > 0) code = LEADERSHIP_STATES.CHAIR_WITHOUT_ID
  else if (id === '') code = LEADERSHIP_STATES.NO_CHAIR
  else code = LEADERSHIP_STATES.OK

  const leaderOnStaff = code === LEADERSHIP_STATES.OK
  const notes = {
    [LEADERSHIP_STATES.OK]: 'the named leader is seated in the leader slot, so the charter names them',
    [LEADERSHIP_STATES.NO_CHAIR]: 'no member is seated in the leader slot and no leader is named: the charter is leaderless, which is TRUE here',
    [LEADERSHIP_STATES.CHAIR_WITHOUT_ID]: 'a member is seated in the leader slot but vmu.turn.leaderId is empty, so the charter is leaderless and therefore says the institute has no seated academician — FALSE while the chair is seated',
    [LEADERSHIP_STATES.ID_NOT_ON_ROSTER]: 'vmu.turn.leaderId names a member who is not on the roster: the charter must NOT name them (its rule 1), so it stays leaderless',
    [LEADERSHIP_STATES.ID_NOT_CHAIR]: 'vmu.turn.leaderId names a member who is not in the leader slot: the charter must not present a non-leader as the leader',
  }
  const next = code === LEADERSHIP_STATES.CHAIR_WITHOUT_ID
    ? 'vibe_v5_configure {"member":"<the chair>","params":{"vmu.turn.leaderId":"' + seatedChairs[0] + '"}}'
    : null
  return {
    code,
    consistent: leaderOnStaff,
    leaderId: id,
    leaderSlot: String(leaderSlot),
    seatedChairs,
    leaderOnStaff,
    note: notes[code],
    // `next` is present ONLY where the caller can act, and it names the DECLARED write path rather than
    // this module writing anything itself.
    next,
  }
}

/**
 * The one-line warning the office faces print when the two facts disagree. `null` when they agree, so a
 * consumer can `if (w)` instead of comparing strings.
 */
export function leadershipWarning(reading) {
  if (!reading || reading.consistent) return null
  if (reading.code === LEADERSHIP_STATES.NO_CHAIR) return null // true, but not a problem to report
  return { code: reading.code, message: reading.note, next: reading.next }
}
