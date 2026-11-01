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
  // ★★ RUN 178 (run 23 / FEEDBACK23 F5, MEASURED): THE CHARTER AND THIS READING READ ONE FACT DIFFERENTLY.
  // The prompt policy (`middleware/prompt-switches.js` §4, R13) already names the seated chair when `vmu.turn.leaderId`
  // is empty, so the institute's own prompts say who leads — while this reading still reported a leaderless charter and
  // told the office to write a setting it could only write from ONE session. Two readers of one fact, one of them false.
  // The reading now answers the way the policy does and NAMES the source: 'setting' (declared), 'seat' (the one seated
  // chair — the policy's documented fallback) or 'none'. `consistent` keeps its old meaning ("the DECLARED setting
  // names a seated leader"); `charterNamesLeader` is the question the warning is actually about.
  const seatFallback = id === '' && seatedChairs.length > 0 ? String(seatedChairs[0]) : ''
  const effectiveLeaderId = id !== '' ? id : seatFallback
  const leaderIdSource = id !== '' ? 'setting' : (seatFallback !== '' ? 'seat' : 'none')

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
    [LEADERSHIP_STATES.CHAIR_WITHOUT_ID]: 'a member is seated in the leader slot but vmu.turn.leaderId is empty: the charter still names that seat (the prompt policy falls back to the seated chair, so no prompt prints 「本所当前没有在册院士」), and only a face that reads the SETTING alone would call the institute leaderless — `next` records the id so every face agrees by declaration rather than by fallback',
    [LEADERSHIP_STATES.ID_NOT_ON_ROSTER]: 'vmu.turn.leaderId names a member who is not on the roster: the charter must NOT name them (its rule 1), so it stays leaderless',
    [LEADERSHIP_STATES.ID_NOT_CHAIR]: 'vmu.turn.leaderId names a member who is not in the leader slot: the charter must not present a non-leader as the leader',
  }
  // ★★ RUN 152 (real machine, run 2): this suggestion was `vibe_v5_configure {"member":"<the chair>", "params":{…}}`,
  // and `vibe_v5_configure` declares project/institute/problem/params — a `member` key is refused by name
  // (`does not accept parameter(s) "member"`), so the framework's own repair advice was a call that cannot work. The
  // suggestion is now the declared shape (`vibe_v5_set`, key/value/why), which is also the one corrections.js teaches.
  const next = code === LEADERSHIP_STATES.CHAIR_WITHOUT_ID
    ? 'vibe_v5_set {"key":"vmu.turn.leaderId","value":"' + seatedChairs[0] + '","why":"安置院士"}'
    : null
  return {
    code,
    consistent: leaderOnStaff,
    leaderId: id,
    // ★★ RUN 178: the same two facts the prompt policy acts on, so a reader of this face and a reader of the
    // charter cannot disagree about who leads. `leaderIdSource` says WHERE the name came from; `charterNamesLeader`
    // is the falsifiable claim ("this institute's prompts name a leader") that the warning below is about.
    effectiveLeaderId,
    leaderIdSource,
    charterNamesLeader: code === LEADERSHIP_STATES.OK || code === LEADERSHIP_STATES.CHAIR_WITHOUT_ID,
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
  // ★★ RUN 178: a reading whose charter DOES name a seated leader is not a leaderless-charter defect. It is still
  // worth telling the office (the setting is empty and `next` fixes it for real), so the warning survives — but its
  // message is the reading's note, which now says exactly that instead of claiming the institute has no academician.
  if (reading.code === LEADERSHIP_STATES.NO_CHAIR) return null // true, but not a problem to report
  return { code: reading.code, message: reading.note, next: reading.next }
}
