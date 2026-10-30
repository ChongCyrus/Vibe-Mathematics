// vmu turn orchestration — one member turn as ASSEMBLE -> DELIVER -> PARSE -> DISPATCH (docs/26).
//
// WHY THIS MODULE EXISTS (goal, first objective): the framework had faces for every MECHANISM the v5r line uses, and
// a pack carrying that line's prompt TEXT, but the TURN LOOP itself still lived in the original preset. So a host
// that installed only the framework could not run an institute at all. This face is that loop, in the framework's
// idiom: prompts come from the injected `vmu.prompt` pipeline (never concatenated here), delivery goes through an
// injected adapter seam (never faked), replies are parsed against a declared field catalogue (never guessed at), and
// every field is dispatched to the ONE face that owns it (never two, never silently dropped).
//
// The invariants this module enforces (docs/26 §2, §5):
//   1. no host import: the pipeline and the delivery are INJECTED seams; a missing pipeline or adapter is refused by
//      name (`VMU_ENGINE_UNAVAILABLE`) rather than worked around - this module never composes prompt text itself;
//   2. assembly is delegated, so it inherits the pipeline's determinism: same inputs => same bytes, snapshottable;
//   3. parsing is strict: no fence, malformed JSON and unknown fields are three DIFFERENT named refusals, because
//      "the model did not answer" and "the model answered with something we do not understand" are not the same;
//   4. dispatch is total on the declared catalogue and recorded: a field whose face is not wired is COUNTED as not
//      executed and reported, never dropped in silence.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/**
 * The reply field catalogue, and the ONE face that owns each field (docs/26 §3). The names on the LEFT come from the
 * original prompt catalogue, so a model trained on that line keeps working; the names on the RIGHT were read off a
 * REAL kernel at runtime (round 338) rather than guessed - `meetings` really has `speak` and `motion`, `records` has
 * `put`, `library` has `record`, `ballotbox` has `cast`, `tasks` has `create` and `transition`, `formal` has `check`,
 * `mathjobs` has `submit`. Where a field genuinely has no counterpart yet it is declared with `face: null` and the
 * dispatcher reports it as not executed instead of inventing a call.
 */
/**
 * THE ONE REASON A REPLY FIELD IS NOT-APPLICABLE BY CONSTRUCTION (see `meeting_hand` / `meeting_invite` below).
 *
 * A member reply is `{ field: payload }` and carries NO meeting reference. Two of the reply fields can only be
 * carried out against a named meeting, so dispatching them means passing `undefined` as the meeting id: measured on a
 * real machine, the meeting service refuses with `VMU_NO_SUCH_OBJECT "no such meeting: undefined"` — a refusal that
 * names the wrong problem, because the id was never in the reply to begin with. `meeting_invite` was worse than that:
 * it was mapped to `attend`, so a member that "invited" someone ATTENDED ITSELF.
 *
 * The supported shape for both is the tool face, where the actor and the meeting are both explicit and the chair rail
 * applies to an invitation: `vibe_vmu_meeting { action: "hand" | "hands" | "invite", id: "<meeting id>" }`. Keeping a
 * doomed dispatch would be the declared-but-unreachable class, so the plan marks these fields not-applicable BY NAME
 * and the receipt says why. Nothing is pretended to have run.
 */
// ★ ROUND 71 / F-68: the REFUSAL excerpt is a DIFFERENT, narrower bound (500 chars) than the applied one (2,000).
// Run 70's office read a refused reply (`VMU_TURN_NO_FENCE`) whose receipt carried `replyLength: 314` and NO truncation
// declaration, so "complete, 314 chars" and "cut at 500" were literally the same reading. Both bounds live here, at
// module scope, because a bound that only one of three code paths knows is not a bound.
const REFUSAL_REPLY_EXCERPT_MAX = 500

const NO_REPLY_MEETING_SHAPE = Object.freeze({
  code: 'VMU_TURN_FIELD_NOT_APPLICABLE',
  message: 'this reply field carries no meeting reference, so the framework cannot dispatch it without inventing one',
  hint: 'use the meeting tool face: vibe_vmu_meeting { action: "hand" | "hands" | "invite", id: "<meeting id>", ... } — the actor and the meeting are explicit there, and the chair rail applies to an invitation',
})

// ★★★ RUN 144 / audit12 (the reply-shape family). The audit drove a real kernel round with the EXACT json the live
// catalogue taught and the turn DIED, because these fields name face operations that take POSITIONAL arguments
// (`tasks.transition(id, to)`, `tasks.assign(id, who)`, `meetings.warn(meeting, …)`) while a reply field carries exactly
// ONE value - the whole payload went into the first slot (`no such meeting: undefined`, `unknown task state:
// [object Object]`). A reply cannot express them, so they are declared with `noReplyShape`: the plan refuses them BY NAME
// before any face lookup, the rest of the turn still applies, and the hint names the tool face that DOES work (the tool
// handlers adapt the reply-shaped object onto the positional operation). Teaching a shape the dispatcher cannot deliver
// is exactly how the audit's 8 contradictions arose; the fix is to stop teaching it, not to let the senders keep dying.
const POSITIONAL_REPLY_SHAPE = (opText, route) => Object.freeze({
  code: 'VMU_TURN_FIELD_NOT_APPLICABLE',
  message: opText + ' takes POSITIONAL arguments, and a reply field carries ONE value: the dispatch would hand the whole payload to the first positional slot',
  hint: route,
})

const NO_REJECT_ASSIGN_SHAPE = Object.freeze({
  code: 'VMU_TURN_FIELD_NOT_APPLICABLE',
  message: 'an objection in a reply would be dispatched as MEETING SPEECH (vmu.meetings.speak), and a reply carries no meeting: on an ordinary round it is skipped as no-meeting-bound, so it can never reach the voters it promises to broadcast to',
  hint: 'file the reason where the ledger keeps it: the tool face vibe_v5_record_progress (track "obstacles", with member) records why the assignment is contested, and raise it in a meeting round through vibe_v5_say — the task is executed regardless, that is the semantics of an objection',
})

// ★★★ RUN 147 / audit16 C-1 (the convene side door). A reply field carries ONE value and no actor: `convene_meeting`
// dispatches the meetings face's `open` with no chair and no actor, which is the kernel's CHAIRLESS convene path — and that path
// deliberately does not police seats ("A CHAIRLESS CONVENE IS NOT THIS RAIL'S BUSINESS", kernel/meetings.js:2793-2803: it
// only refuses a convene that INSTALLS a chair without naming that chair as its actor). The seat policy (only the chair
// convenes) lives on the tool face (`vibe_v5_meeting { action: "convene" }`, pack requireChairSeat), so a member or temp
// writing this field really opened a meeting (`openedBy:null`) while the catalogue claimed it would be refused by name.
// The field cannot reach the policy-enforcing route, so it is refused BY NAME and the hint names the tool that can.
const NO_REPLY_CONVENE_SHAPE = Object.freeze({
  code: 'VMU_TURN_FIELD_NOT_APPLICABLE',
  message: 'a reply carries no actor and no chair, so this field lands on the kernel\'s CHAIRLESS convene path — the one path that deliberately does not police seats (it only refuses a convene that INSTALLS a chair without naming that chair as its actor); a member or temp writing it really opens a meeting, and the policy this field used to promise is not on that path',
  hint: 'convene through the tool face, which is where the seat policy is enforced: vibe_v5_meeting { action: "convene", member: "<your id>", … } (a non-chair seat is refused BY NAME there, VMU_NOT_PERMITTED)',
})

export const FIELD_OWNERS = Object.freeze({
  say: Object.freeze({ face: 'vmu.meetings', op: 'speak' }),
  progress: Object.freeze({ face: 'vmu.records', op: 'put' }),
  // ★★★ RUN 142 / audit10 C2: THE PAYLOAD OF `record` IS A RESEARCH-LOG LINE, NOT A CARD. `vmu.library.record` really is
  // `record(member, track, text)` (kernel/library.js:427): it appends ONE line to `Members/<member>/Progress/<track>.md`.
  // The reply field therefore carries `{ track, text }`, and the dispatch loop adapts it into the real call arguments
  // (`recordLogArgs` below). Record CARDS are a different route - `vmu.library.append` (kernel/library.js:334), written by
  // the pack tools `vibe_v5_record_proposition` / `_method` / `_subproblem`. They are NOT a reply field, and the field used
  // to promise them while every dispatch died in the shape guard.
  record: Object.freeze({ face: 'vmu.library', op: 'record' }),
  propose_verify: Object.freeze({ face: 'vmu.meetings', op: 'motion' }),
  verdict: Object.freeze({ face: 'vmu.ballotbox', op: 'cast' }),
  task_create: Object.freeze({ face: 'vmu.tasks', op: 'create' }),
  task_update: Object.freeze({ face: 'vmu.tasks', op: 'transition', noReplyShape: POSITIONAL_REPLY_SHAPE('vmu.tasks.transition(id, to)', 'use the tool face vibe_v5_task_update { task_id, expected_revision, action } — it maps claim/reassign/assign/transition/complete/reopen/set_dependencies onto the real transition and requires the revision token') }),
  proposal: Object.freeze({ face: 'vmu.meetings', op: 'motion' }),
  motion: Object.freeze({ face: 'vmu.meetings', op: 'motion' }),
  formal: Object.freeze({ face: 'vmu.formal', op: 'check' }),
  lean_archive: Object.freeze({ face: 'vmu.mathjobs', op: 'submit' }),
  lean_run: Object.freeze({ face: 'vmu.mathjobs', op: 'submit' }),
  // ROUND 378: the rest of the reply surface the original parses (an independent audit measured 12 of 29). Every pair
  // below was checked against what the kernel's services REALLY expose at runtime - the meeting service carries speak,
  // motion, queue, attend and open; tasks carries assign and transition; the ballot box carries cast - so nothing here
  // is invented. Sending one of these to a face that does not implement it is visible as face-not-wired, never silent.
  // EXCEPTION, MEASURED LATER (phase 12): a face that IS wired can still be the wrong route when the reply cannot
  // carry what the operation needs. `meeting_hand`/`meeting_invite` are that case and carry `noReplyShape`; the
  // capability itself stays reachable through `vibe_vmu_meeting`.
  // ★ PHASE 12: these two carry `noReplyShape` — see NO_REPLY_MEETING_SHAPE above for the measurement and the route
  // that does work. The `op` is kept so a reader can see what was intended; the plan refuses before dispatch.
  meeting_hand: Object.freeze({ face: 'vmu.meetings', op: 'queue', noReplyShape: NO_REPLY_MEETING_SHAPE }),
  meeting_invite: Object.freeze({ face: 'vmu.meetings', op: 'attend', noReplyShape: NO_REPLY_MEETING_SHAPE }),
  input: Object.freeze({ face: 'vmu.meetings', op: 'speak' }),
  propose_meeting: Object.freeze({ face: 'vmu.meetings', op: 'motion' }),
  convene_meeting: Object.freeze({ face: 'vmu.meetings', op: 'open', noReplyShape: NO_REPLY_CONVENE_SHAPE }),
  task_claim: Object.freeze({ face: 'vmu.tasks', op: 'transition', noReplyShape: POSITIONAL_REPLY_SHAPE('vmu.tasks.transition(id, to)', 'use the tool face vibe_v5_task_update { task_id, expected_revision, action: "claim" } — blocked_by dependencies are refused there by name') }),
  task_done: Object.freeze({ face: 'vmu.tasks', op: 'transition', noReplyShape: POSITIONAL_REPLY_SHAPE('vmu.tasks.transition(id, to)', 'use the tool face vibe_v5_task_update { task_id, expected_revision, action: "complete" } — from `assigned` you must go through `doing` first (the legal table is open→assigned|doing, assigned→doing|open, doing→done|assigned)') }),
  assign: Object.freeze({ face: 'vmu.tasks', op: 'assign', noReplyShape: POSITIONAL_REPLY_SHAPE('vmu.tasks.assign(id, who)', 'use the tool face vibe_v5_assign { to, subject|task_id, why, acceptance } — why and acceptance are REQUIRED and are mailed to the assignee') }),
  nudge: Object.freeze({ face: 'vmu.meetings', op: 'warn', noReplyShape: POSITIONAL_REPLY_SHAPE('vmu.meetings.warn(meeting, …)', 'use the tool face vibe_v5_nudge { to, why, next_step } — it wakes one member with a stated reason and a concrete next step') }),
  reject_assign: Object.freeze({ face: 'vmu.meetings', op: 'speak', noReplyShape: NO_REJECT_ASSIGN_SHAPE }),
})

/**
 * ★★★ ROUND 50 — THE CLOSURE PREDICATE, WHICH DID NOT EXIST. The original stops when every speaker's judgement is
 * true (`vibe-math-v4/vibe-math-v4.js:2369`). Nothing in this framework counted the equivalent field at all: `solved`
 * was recorded onto the turn state under RECORDED_FIELDS and never read back, so an institute could run forever
 * without any answer to "is the question solved".
 *
 * PURE, AND THE PERMISSION IS INJECTED. Which permission name grants a closure vote is DEPLOYMENT vocabulary - the
 * v5r pack gives `vote` to the member slot but NOT to the chair (convene/close/assign/grant/freeze) or the temp slot
 * (speak only) - so hardcoding a name here would both invent policy and, if the whole roster were counted instead of
 * the enfranchised members, make unanimity UNREACHABLE. `may(id, permission)` is therefore injected, and the
 * permission name is a parameter.
 *
 * @param votes      member id -> boolean (each member's own `solved`), collected per TURN and keyed by member.
 * @param roster     the members to consider, each `{ id }` (the live roster).
 * @param may        `(id, permission) => boolean`; defaults to "everyone may" so a kernel without a roster still
 *                   returns a well-formed reading rather than throwing.
 * @param permission the permission that grants a closure vote. Defaults to the framework's own README word only as
 *                   a last resort; a deployment should set `vmu.turn.closureVotePermission`.
 */
export function closureVoteOf({ votes = new Map(), roster = [], may = null, permission = 'vote', meetingId = null } = {}) {
  const enfranchised = roster
    .map((m) => String(m && m.id !== undefined ? m.id : m))
    .filter((id) => {
      if (typeof may !== 'function') return true
      const verdict = may(id, permission)
      // ★★★★★★★ ROUND 83 — THE VERDICT IS READ, NOT ITS TRUTHINESS. The parameter is documented as returning a boolean,
      // but the kernel's OWN service method returns an OBJECT (`{ ok, allowed, member, slot, permission }`), and an
      // object is ALWAYS truthy. So a caller that injected `members.may` as written - the most natural thing to do, and
      // what the parameter name invites - enfranchised EVERY member, chair and temp slots included, and those slots hold
      // no vote in this pack. Unanimity would then depend on members who cannot vote, which is the same class of bug the
      // docstring above warns about; it simply arrived through the parameter instead of through a hardcoded name.
      //
      // The kernel's own call site already unwraps `allowed`, so this changes nothing there. It closes the hole for every
      // OTHER caller - a pack middleware, a deployment, a test - because the predicate can no longer be misused by
      // passing the service method unchanged.
      if (typeof verdict === 'boolean') return verdict
      if (verdict && typeof verdict === 'object' && typeof verdict.allowed === 'boolean') return verdict.allowed
      // Nullish means the service has no opinion on this id, which is NOT an enfranchisement; the kernel's own unwrap
      // coalesces it to false, and this matches that deliberately rather than inventing a second answer.
      if (verdict === undefined || verdict === null) return false
      // Anything else (a number, a string, a function) is UNREADABLE, and it is refused by name rather than resolved:
      // reading it as true enfranchises members who may not vote, reading it as false drops members who may, and neither
      // is a choice this predicate is entitled to make silently.
      throw refuse('VMU_INVALID_ARGUMENT',
        'the closure-vote permission test answered with ' + typeof verdict + ' instead of a boolean or { allowed }',
        'pass may as (id, permission) => boolean, or pass the members service method UNCHANGED - its result carries `allowed`, which this predicate now reads; a deployment may rename the permission with vmu.turn.closureVotePermission')
    })
  const forIt = []
  const against = []
  const missing = []
  for (const id of enfranchised) {
    if (!votes.has(id)) missing.push(id)
    else if (votes.get(id) === true) forIt.push(id)
    else against.push(id)
  }
  const cast = enfranchised.length > 0 && missing.length === 0 && against.length === 0
  // ★★★ THE WINDOW LABEL MUST DESCRIBE WHAT THIS FUNCTION ACTUALLY DOES. Measured on a full live run: m1 voted in round 2,
  // m2 in round 6, and `cast` became true - the agent reported it as "closureVote.window is round yet votes from different rounds
  // aggregated". It was right: `votes` is a Map<id, boolean> with no round on it, so nothing here can expire a round-2 vote, and
  // the label said 'round' anyway. A receipt that promises per-round semantics it does not implement is the "misleading mechanism"
  // this pack's own rules forbid, and the previous phase's diagnosis already allows either value ('round' | 'meeting').
  // The true window is the meeting: the map lives for as long as the orchestrator does. If per-round expiry is ever wanted, the
  // vote records must carry their round first - that is a data-model change, not a label change.
  return {
    // ★★★ PHASE 12 / R18 (the institute's own run-16 report, item 2): window:'meeting' named a MEETING this reading
    // cannot name — the vote map is the orchestrator's, it is not bound to any meeting id, and that run's settlement
    // happened in a phase:"normal" step with no meeting in sight. The agent could not tell which of m85/m86/m87/m90 the
    // "meeting window" meant, which is what a misleading label does. The window now states the scope it really has (the
    // SESSION = this orchestrator), a caller that DOES know the meeting may pass meetingId, and the field says so when
    // it is null instead of implying one.
    window: meetingId === null ? 'session' : 'meeting',
    meetingId: meetingId === null ? null : String(meetingId),
    // ★ PHASE 12 / run 34 item 3: the sentence used to promise "a caller that knows the meeting passes { meetingId }" —
    // and NO face ever did. A promise with no caller is the same class of lie as a mechanism with no consumer, so the
    // text now states the limit plainly and says what would change it (a turn bound to a meeting).
    windowMeans: meetingId === null
      ? 'the votes map lives for as long as this orchestrator does, so the closure reading spans the SESSION: it is not per-round and it cannot name a meeting. No current face binds a turn to a meeting, so window:"meeting" is not reachable from the tool surface yet; a reading computed for a named meeting is labelled as such when that binding exists'
      : 'this reading was computed for the named meeting',
    cast,
    // ★ LIVE RUN 7 (agent feedback item j): `cast` READS like "the votes were cast", but this predicate is "closure was
    // CONFIRMED unanimously" — the acceptance agent reported the field's meaning as inverted from its name, and it was
    // right: two members voting `solved:false` leaves `cast:false` although both votes WERE cast. The name is kept (turn
    // receipts, prompts and gates read it) and the truth travels beside it: `confirmed` is the same predicate under a
    // name that says what it means, and `votesCast` counts the judgements that actually arrived.
    confirmed: cast,
    votesCast: forIt.length + against.length,
    // ★ LIVE RUN 11 (the institute's own report, item b): the office tried to read `cast`/`votesCast` off the
    // RULING receipt (`vibe_v5_verdict_final`) and reported the reading 'missing'. It is not missing - it is a
    // DIFFERENT mechanism: this block is the CLOSURE vote (was the question judged solved?), while the ruling is
    // a probability over one proposition. Two receipts that never name each other is the same misleading-shape
    // family as a mechanism with no consumer, so each now says where the other lives.
    rulingReading: 'NOT on this field: cast/votesCast are the CLOSURE vote (was the question judged solved, unanimously). The DEBATE ruling over a proposition is a different mechanism and lives on the pack face `vibe_v5_verdict_final` (value / perMember / floor.minVotes)',
    castMeaning: 'cast === confirmed: every enfranchised member judged the question solved. It is NOT "the votes were cast" - see votesCast for how many judgements arrived',
    for: forIt,
    against,
    missing,
    eligible: enfranchised,
    permission,
    reason: cast
      ? 'every enfranchised member judged the question solved'
      : (enfranchised.length === 0
        ? 'no member holds the closure-vote permission, so unanimity is unreachable - seat members with vibe_vmu_control { action: "hire", member_id, slot, institution } using a slot whose permissions include this one (as of phase 12 the v5r pack grants it to `chair` and `member`, not to `temp`), then drive a turn; a deployment may rename the permission with vmu.turn.closureVotePermission. This reading appeared in a real run BEFORE any member was seated, which is why it names the PERMISSION rather than saying the roster is empty.'
        : (missing.length
          ? 'silence blocks the CLOSURE VOTE (unanimity on「每个有投票权的成员都判定该问题已解决」) — it does NOT block closing the meeting: the close rails are the meeting policies (vmu.meetings.*), and this reading never decides whether a close was legal. No judgement yet from: ' + missing.join(', ')
          : 'a member judged the question NOT solved: ' + against.join(', '))),
  }
}
export const FIELDS = Object.freeze(Object.keys(FIELD_OWNERS))

/**
 * ROUND 377 - THE BOOKKEEPING FIELDS (docs/26 section 3.21). The original accounts for context usage on EVERY reply,
 * not only on a normal round: its own comment records the v4 defect where only the normal branch consumed these, so the
 * flag stuck true and the compaction directive reappeared at the head of every later prompt forever. Two consequences
 * matter here. First, these fields must be RECOGNISED: a real model that answers with `contextPct` was previously
 * refused as an unknown field, which is a blocker for running a real round at all. Second, they are not dispatched to
 * any face - they update turn state - so they get their own list rather than a fabricated owner.
 *
 * ROUND 378 adds the fields the original parses that have NO matching operation in this kernel yet: `solved` (the
 * member's own round judgement), `prioritize`, `nudge`, `reject_assign`, `hire` and `fire`. They are BOOKKEPT rather
 * than dispatched, for two reasons that are both deliberate: nothing is ever sent to an operation that does not exist,
 * and a real model's reply is never REFUSED merely because a face is still to be built. Each one is named here so the
 * gap stays visible instead of hiding behind a refusal.
 */
export const RECORDED_FIELDS = Object.freeze([
  'contextPct', 'compacted',
  'solved', 'vote_solved', 'prioritize', 'hire', 'fire',
])

/**
 * ★★★★★★★ LANE turn-reply / 08号决策 — THE TOOL REPORT IS A CHANNEL; THE FENCED JSON IS ITS COMPATIBILITY PATH.
 *
 * WHY THIS EXISTS. Until this change the ONLY structured way for a member to report was to put one fenced JSON object
 * in its reply TEXT: `parse()` refused everything else with `VMU_TURN_NO_FENCE`, and the tool face carried that text
 * back through `supplyMemberReply`. That works, but it makes the report a SHAPE THE MODEL TYPES BY HAND inside prose,
 * and when it gets the shape slightly wrong the refusal ("no usable json object") is indistinguishable from the model
 * having said nothing at all. A tool call is checkable by the provider, arrives as an object, and can be READ BACK -
 * so it becomes the PRIMARY channel, and the fence stays byte-for-byte supported for every existing caller.
 *
 * ★★ THE TWO-TRUTHS RULE (this is the whole rule; there is no third case, and the tests pin each branch down):
 *   1. a report recorded for a turn and NO text json   -> the report IS the reply (`source:'tool'`);
 *   2. no report and a fenced/whole/bracketed json     -> the text IS the reply (`source:'text'`), byte-for-byte the
 *      behaviour that existed before this change;
 *   3. BOTH carry the same field with the SAME value  -> merged (`source:'tool+text'`): one truth, two spellings;
 *   4. BOTH carry the same field with DIFFERENT values -> REFUSED BY NAME (`VMU_TURN_REPLY_CONFLICT`) naming EVERY
 *      conflicting field, BEFORE anything is dispatched. The kernel does not pick a winner: whichever it picked would
 *      silently discard something the member actually said, and "one field, two values" is exactly the class of
 *      ambiguity this repository refuses rather than resolves by convention.
 *   A report plus PROSE (no json at all) is case 1 with `textIgnored:true` - prose is not a competing truth, and
 *   refusing it would punish a member for explaining itself.
 *
 * `source` travels on the turn receipt, on the `step` receipt and in the `turn/reply-parsed` bus payload, so a reader
 * can tell WHICH channel produced a field without re-deriving it from prose.
 */
export const REPLY_FIELDS = Object.freeze(FIELDS.concat(RECORDED_FIELDS))

/** A stable serialisation: "same value" must not depend on key insertion order, because a tool object and a parsed
 *  json object are equal when they SAY the same thing, whichever key was written first. */
function canonicalReplyValue(value) {
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return v
    if (Array.isArray(v)) return v.map(walk)
    const out = {}
    for (const k of Object.keys(v).sort()) out[k] = walk(v[k])
    return out
  }
  try { return JSON.stringify(walk(value)) } catch { return String(value) }
}

/**
 * Merge the structured report (channel 1) with the parsed json (channel 2) under the rule above. Kept PURE and
 * exported so the rule itself is testable without driving a whole turn - the suite asserts it directly as well as
 * end-to-end. A conflict is a THROW (a named refusal), never a `{ok:false}` that a caller might ignore.
 */
export function mergeReplyChannels(toolReply = {}, textReply = {}) {
  const head = toolReply && typeof toolReply === 'object' && !Array.isArray(toolReply) ? toolReply : {}
  const base = textReply && typeof textReply === 'object' && !Array.isArray(textReply) ? textReply : {}
  const conflicts = []
  const textOnly = []
  const reply = {}
  for (const k of Object.keys(base)) {
    if (k === 'ignoredFields') continue
    reply[k] = base[k]
    if (!Object.prototype.hasOwnProperty.call(head, k)) textOnly.push(k)
    else if (canonicalReplyValue(head[k]) !== canonicalReplyValue(base[k])) conflicts.push(k)
  }
  for (const k of Object.keys(head)) { if (k !== 'ignoredFields') reply[k] = head[k] }
  if (conflicts.length) {
    throw refuse('VMU_TURN_REPLY_CONFLICT',
      'the tool report and the json reply disagree on: ' + conflicts.join(', ') + ' - one field cannot hold two truths in one turn',
      'send each field through exactly ONE channel: drop it from the tool report, or drop it from the json. The kernel refuses instead of choosing, because either choice would silently discard what the member actually said (docs/26 §3)')
  }
  const ignored = []
  for (const k of [].concat(Array.isArray(head.ignoredFields) ? head.ignoredFields : [], Array.isArray(base.ignoredFields) ? base.ignoredFields : [])) {
    if (!ignored.includes(k)) ignored.push(k)
  }
  if (ignored.length) reply.ignoredFields = ignored
  return { ok: true, reply, conflicts, textOnly, fields: Object.keys(reply) }
}

// THE FRAMEWORK OWNS THE IDEA OF A PHASE, NOT THE WORDS. Round 409 added `heartbeat` here because the original has it
// - a no-progress prompt that REPLACES an ordinary round - and that was the framework learning an institution word.
// Round 413 removes it again: `heartbeat` is one of the phases the v5r pack declares, and the loop validates the
// UNION of this list and whatever the pack supplies. The framework list is what a turn can be by itself; anything
// further is vocabulary, and vocabulary belongs to the institution.
const PHASES = Object.freeze(['founding', 'normal', 'checkpoint', 'verify', 'verify-debate', 'meeting', 'resume'])
/** ★ PHASE 7: the turn PHASES, exported so vocabulary gates DERIVE the set instead of hand-copying it. */
export const TURN_PHASES = PHASES

export function refuse(code, message, hint, cause = null) {
  // ★★★ ROUND 68: A WRAPPED FAILURE KEEPS THE FRAME IT CAME FROM. When this helper wraps an inner error - as the
  // delivery path does when it reports "the host refused to start this member turn twice: <inner message>" - building a
  // fresh Error threw the inner STACK away, and the stack is the only thing that says WHERE the inner failure happened.
  // Measured on a real machine: the receipt's first frame was this very wrap site, so eight frames were spent on
  // our own code and the host's frames - the ones that matter - were never reached. The cause is now carried on
  // err.cause, and its frames are APPENDED to the message's stack, so a reader sees the whole chain without a
  // debugger. It is optional and defaults to null, so every existing call site behaves exactly as before.
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  if (cause && typeof cause === 'object') {
    err.cause = cause
    if (typeof cause.stack === 'string' && cause.stack !== '' && typeof err.stack === 'string') {
      err.stack = err.stack + '\n  <- caused by:\n' + cause.stack.split('\n').slice(0, 6).map((l) => '  ' + l.trim()).join('\n')
    }
  }
  return err
}

/**
 * Extract the LAST fenced block that parses to a plain object. Returns null when there is none (that is a DIFFERENT
 * failure from bad JSON).
 *
 * ROUND 370, corrected against the source: the original's fence pattern is `/```(?:json)?[ \t]*([\s\S]*?)```/gi` - the
 * `json` tag is OPTIONAL - and its loop OVERWRITES as it goes, so the last parseable fence wins rather than the first.
 * This function used to require the tag and take the first, which is a real divergence found by reading `parseReply`.
 */
export function extractFence(text) {
  const raw = String(text === undefined || text === null ? '' : text)
  const fence = /```(?:json)?[ \t]*([\s\S]*?)```/gi
  // Extraction only: hand back the LAST fenced body, with the json tag optional, exactly as the source's pattern is
  // written. Whether that body PARSES is deliberately not this function's business - parseReply's loop does the
  // parsing and keeps the last fence that yields an object, and keeping the two jobs apart is what lets a caller ask
  // "is there a fence at all" separately from "is the fenced text usable".
  let body = null
  let m
  while ((m = fence.exec(raw)) !== null) body = m[1]
  return body
}

/**
 * ★ ROUND 30 / task-19: THE STATUS BOARD'S READ LEGS. `facesFrom` used to take ONLY the WRITE operations the reply
 * catalogue names (`records.put`, `tasks.create`, …), because the loop's job was to land state. That left the status
 * block blind: `composeStatusBlock` could say who you are and what the vote floor is, but not what the institute's
 * tasks are or what this member is doing (P3, the acceptance ledger's §「状态板四字段无来源」).
 *
 * These two READ operations are DECLARED (never invented) and they are the kernel's own vocabulary: `tasks.list()` and
 * `records.list()` are the ledgers' documented read verbs, not institution words (R1 zero policy holds). They are
 * bound here rather than in `kernel/index.js` because the bag handed to `facesFrom` ALREADY carries the two service
 * instances (`{ tasks, records, … }` at `kernel/index.js:1619`), so no wiring outside this file is needed and a
 * deployment without those services simply gets no read leg - the board then reports the source as unavailable
 * instead of rendering an empty label.
 */
export const STATUS_BOARD_READ_OPS = Object.freeze({
  'vmu.tasks': Object.freeze(['list']),
  'vmu.records': Object.freeze(['list', 'get']),
})

/** The service instance for a face id, accepting both `{'vmu.tasks': …}` and `{ tasks: … }` (same rule as `facesFrom`). */
function serviceOf(services, face) {
  if (!services || typeof services !== 'object') return null
  const bag = services[face] !== undefined ? services[face] : services[String(face).replace(/^vmu\./, '')]
  if (typeof bag === 'function') { try { return bag({}) } catch { return null } }
  return bag || null
}

/**
 * Build the face map from a kernel service bag, taking ONLY the operations the catalogue names - and taking them by
 * their real method names. A face the bag does not carry is simply absent from the map, so the dispatcher will report
 * the field as not executed rather than call something invented.
 *
 * ★ ROUND 30: plus the DECLARED read legs in `STATUS_BOARD_READ_OPS`, which the status block derives from. They are
 * additive keys on the same face objects (`map['vmu.tasks'].list`), so the dispatcher - which looks up
 * `map[field.face][owner.op]` for catalogue operations only - is unaffected; a caller can still override any operation
 * through `resolveOwners`, and `statusSources` can bypass these legs entirely.
 */
export function facesFrom(services = {}, owners = FIELD_OWNERS) {
  const map = {}
  for (const owner of Object.values(owners)) {
    if (!owner || !owner.face || !owner.op) continue
    const instance = serviceOf(services, owner.face)
    if (!instance || typeof instance[owner.op] !== 'function') continue
    if (!map[owner.face]) map[owner.face] = {}
    map[owner.face][owner.op] = instance[owner.op].bind(instance)
  }
  for (const face of Object.keys(STATUS_BOARD_READ_OPS)) {
    const instance = serviceOf(services, face)
    if (!instance) continue
    for (const op of STATUS_BOARD_READ_OPS[face]) {
      if (typeof instance[op] !== 'function') continue
      if (!map[face]) map[face] = {}
      if (!map[face][op]) map[face][op] = instance[op].bind(instance)
    }
  }
  return map
}

/**
 * ROUND 344 — THE HOST BRIDGE. A host that owns a subagent seam can hand it straight to the loop instead of writing
 * its own delivery adapter (docs/26 stage 3): `deliver: deliverViaSubagents(ctx.get('subagents'))`. The bridge sends
 * the ASSEMBLED text - it never composes anything - labels the turn so a run can be traced, and refuses by name when
 * the seam is missing or when the host hands back no reply at all. A null reply is a real failure, not an empty
 * success, so it is named rather than parsed into "the model said nothing".
 *
 * `extract` lets a host whose handle carries the reply elsewhere say where it is; the built-in order is `reply`, then
 * `text`, which covers the two shapes seen in practice.
 */
/**
 * ★ PHASE 6: the provider names a host advertises, read DEFENSIVELY.
 * `subagents.list()` is the documented discovery verb (registered names in insertion order). A host without it, or one
 * whose list() throws, yields a readable string rather than an exception - this is used inside a refusal HINT, and a
 * hint that itself fails turns a diagnosable refusal into a bare TypeError.
 */
/**
 * ★ PHASE 7 (removed a FAKE capability): DSH 0.2.1 REMOVED the per-child `toolFilter` / `persona` / `depthLimit`
 * fields from its subagent contract (the only per-child knobs left are cwd/agentPreset/outputSchema, and 0.2.1's
 * official replacement for a different tool face is the Agent Preset). The PHASE 6 helper below copied those names
 * onto the ACTIVATION spec, but the host reads `spec.request` and the delivery seam never received a `child` - so it
 * looked like a capability and was never in force. Red line 4: no consumers, no mechanism. Deleted, with this note so
 * the next person does not re-add it: a different tool face for a subagent comes from agentPreset at CREATION time;
 * inside a session, dynamic add/remove is `ctx.tools.register` / `ctx.tools.restrict` (docs/26 §3.22).
 */
function providerNamesOf(subagents) {
  try {
    const names = subagents && typeof subagents.list === 'function' ? subagents.list() : null
    const usable = Array.isArray(names) ? names.filter((n) => typeof n === 'string') : []
    return usable.length > 0 ? usable.slice(0, 12).join(',') : '(none registered)'
  } catch { return '(list() threw)' }
}

/**
 * ★ PHASE 6: the words out of a `SubagentResult.output`, or null when there are none.
 * DSH types that output as ContentBlock[]; only blocks of type 'text' carry words. Returning NULL rather than '' is
 * deliberate: "the child produced no words" and "the child said nothing meaningful" are different facts, and the caller
 * refuses by name on the former instead of delivering an empty member turn as if the member had answered.
 */
function textOfContentBlocks(output) {
  if (!Array.isArray(output)) return null
  const parts = []
  for (const block of output) {
    if (typeof block === 'string') { parts.push(block); continue }
    if (block && typeof block === 'object' && typeof block.text === 'string' && (block.type === undefined || block.type === 'text')) parts.push(block.text)
  }
  const text = parts.join('')
  return text.trim() === '' ? null : text
}

// ★★★★★★★ LIVE RUN 2026-10-25: what a delegated member session must be told about HOW to hand its work back. The
// member prompt teaches the F4 channel (`vibe_vmu_turn { op: "reply", report }`), which is CORRECT for the caller-played
// route and IMPOSSIBLE for a subagent child: the pending turn lives in the parent's turn store, and a child session has
// its own. Measured cost of not saying so: 20 refused calls and one whole round reported as a failure. Exported so a gate
// can assert the note is actually carried on the request rather than merely defined.
export const SUBAGENT_DELIVERY_NOTE = '\n\n【交付方式 · 本会话是被派发的成员会话，不是调用方会话】\n'
  + '★ 不要调用 `vibe_vmu_turn { op: "reply" }`：那个工具面属于**父会话**的回合循环；在你这个子会话里没有待回的回合，'
  + '调用它只会得到具名拒（实测：同一轮因此浪费约 20 次调用，并有一轮被误判为失败）。\n'
  + '把你要交回的 report 作为**本次回复的最终文本**交上来（整段 JSON，或一段 ```json 围栏均可）——交付层会把它当作这一轮'
  + '的答复收下，并记在父会话的轮次回执里。\n'
  + '其余照常：该调的工具照调，该给的证据与具名拒原样抄进报告。\n'

export function deliverViaSubagents(subagents, extract = null, { provider = null, parent = null, signal = null, options = null, delay = null, agentPreset = null } = {}) {
  // ★★★★★★★ THE SEAT IS CHOSEN AT CREATION TIME, NOT REQUESTED IN THE PROMPT (goal round 3, the user's question about
  // restricting a member's tools). MEASURED: a live multi-agent run's per-session tool histogram showed one member
  // session making 20 pack calls and ZERO host calls, while another made 82 calls of which 58 were `pwsh` — including
  // reading the harness's own `app.asar`. The host's own contract agrees that the only per-child knobs are
  // `cwd`/`agentPreset`/`outputSchema` (`SubagentStartRequest.agentPreset`, `SubagentCapabilities.agentPreset`), so the
  // ONE supported place to change a member seat's tool surface is here: the request that creates the child.
  const seatPreset = typeof agentPreset === 'string' && agentPreset !== '' ? agentPreset : null
  // ★★★ ROUND 63: A MEMBER TURN IS FOREGROUND ONE-SHOT DELEGATION, AND THE HOST SAYS SO ITSELF. The stack captured on
  // a real machine came from the continuable-activation registry - startContinuable -> assertAdmitting ->
  // closingTeardownFor -> liveLineage - which refuses to admit a NEW activation while a previous one is still being
  // torn down. A retry proved the refusal is PERSISTENT, not transient, because the SLV driver holds the root agent as
  // a continuable activation and a member turn was trying to nest another inside it. The host's own comment on
  // `SubagentContinuationManager` says the answer outright: "foreground one-shot delegation keeps calling
  // `ctx.subagents.start()` and NEVER ENTERS THIS LIFECYCLE". `start(name, request)` builds a ONE-SHOT descriptor, so
  // admission is never consulted. A vmu turn is exactly that - one delivery, `({ turn, text }) => reply` - so when a
  // provider name is configured AND the seam offers `start`, the one-shot path is taken. The continuable path stays as
  // the fallback, because a host that offers only that one must still work.
  const oneShot = typeof provider === 'string' && provider !== '' && typeof subagents.start === 'function'
  // ★★★★★★★ PHASE 6 / ROUND 2: DSH 0.2.1-rc.2 REPLACED BOTH OLDER VERBS WITH `startActivation`.
  // MEASURED, NOT ASSUMED: the running host's own service catalog (`cordis_inspect` -> host Service.listService
  // "subagents") lists startActivation, waitForChildren, drainDescendants, drainChildren, sendMessage, interrupt,
  // listChildren, listDescendants, prompt, interruptByParent, registerProvider, getProvider, list, resolveMaxDepth -
  // and `start` / `startContinuable` are ABSENT. The 0.2.0 -> 0.2.1 type diff agrees: `startContinuable(spec)` and
  // `start(name, request)` were removed and `startActivation(spec)` added, with
  //   SubagentActivationSpec  = { provider, label, childId?, request, signal, delivery: 'parent' | 'caller' }
  //   SubagentActivation      = { childId, messageId?, result: Promise<SubagentResult>, dispose() }
  //   SubagentResult          = { output: ContentBlock[], structured?, diagnostic?, stopReason }
  // Without this branch a member turn is refused on EVERY delivery on 0.2.1, because the default delivery mode is
  // 'subagents'. The older verbs are KEPT as fallbacks: vmu still declares support back to 0.1.2-alpha.4, and a host
  // that offers only those must keep working (and their fake-host tests must keep passing).
  const canActivate = !!subagents && typeof subagents.startActivation === 'function'
  // ★★★ ROUND 67: WHICH PATH ACTUALLY RAN IS THE READING THAT SPLITS THE PROBLEM. Recording it costs nothing and
  // settles an ambiguity that cost a whole round: with the one-shot path chosen the host accepts the turn and the
  // reply shape is the question; with the fallback chosen the provider name was never resolved.
  // ★ ORDER: one-shot, then activation, then continuable. `delivery: 'caller'` on the activation path keeps the
  // result with this caller instead of also notifying the parent model, which is what a member turn wants.
  const path = oneShot ? 'one-shot' : (canActivate ? 'activation' : 'continuable')
  if (!subagents || (!oneShot && !canActivate && typeof subagents.startContinuable !== 'function')) {
    // ★★★★★★★ PHASE 6: A REFUSAL HINT MUST NOT ITSELF THROW. The first version of this hint read
    // `Object.getPrototypeOf(subagents)` unguarded, so when the seam was ABSENT (subagents === null) the refusal
    // construction died with a bare `TypeError` - the caller saw an unnamed TypeError instead of the named
    // VMU_ENGINE_UNAVAILABLE it is entitled to, and three existing tests caught exactly that (their detail printed
    // as `{}`, i.e. no `.code`). A hint that fails turns a diagnosable refusal into an undiagnosable crash, so the
    // verb listing is read defensively, and the message distinguishes the two genuinely different causes.
    const offeredVerbs = (() => {
      try {
        if (!subagents) return ''
        return Object.keys(Object.getPrototypeOf(subagents) || {}).concat(Object.keys(subagents))
          .filter((k) => /start|interrupt|list|send/i.test(k)).slice(0, 12).join(',') || '(none readable)'
      } catch { return '(the service could not be read)' }
    })()
    throw refuse('VMU_ENGINE_UNAVAILABLE',
      subagents
        ? 'the subagents service offers none of start(), startActivation() or startContinuable(), so it cannot start a member turn'
        : 'no subagents service is bound, so no member turn can be delivered',
      'inject { deliver } yourself to supply a seam (docs/26 stage 3)'
        + (subagents ? '; verbs this host does offer: ' + offeredVerbs : '; ctx.get(\'subagents\') returned nothing'))
  }
  /**
   * ★★★★★★★ TASK-13 / LIVE RUN 31 — THE `child` SLOT IS THE CONTINUATION SLOT, AND IT IS NOW READ.
   * This deliverer has destructured a third argument, `child`, since the day the signature was written, and never read
   * it: a caller COULD hand it a resume capability, and no caller did. Run 31 is what that emptiness cost — twelve member
   * turns delivered, and acad-01 and res-01 each ran in TWO DIFFERENT child sessions, so every turn of a member started
   * from zero: no memory of the progress it had archived, no memory of the routes it had already tried, which is exactly
   * what v5r asks a researcher to carry across its own turns. The kernel already LEARNS the member's child session
   * (`memberSessions`); what was missing is a seam that can do something with it.
   * The body below is the pre-existing fresh-child delivery, unchanged and renamed. The wrapper after it offers the
   * learned session to a caller-supplied resume, and when it cannot honour the offer it NAMES who cannot, why, and what
   * would fix it — instead of silently starting yet another child and letting the receipt imply continuity it never got.
   */
  const deliverFresh = async ({ turn, text }) => {
    // ROUND 346: the spec carries the SAME three elements the original's wake carries - who, why, and what next -
    // because a host that only receives "here is some text" cannot supervise the turn it just started. Measured
    // against the original: its wake takes { to, why, next_step }, so the framework labels its own the same way.
    const spec = {
      label: 'vmu-turn-' + String(turn && turn.id ? turn.id : 'unknown'),
      to: turn && turn.member ? turn.member : null,
      why: turn && typeof turn.why === 'string' ? turn.why : null,
      next_step: turn && typeof turn.nextStep === 'string' ? turn.nextStep : null,
      // ★★★★★★★ LIVE RUN 2026-10-25 (the first REAL multi-agent run): the child was handed the member prompt verbatim,
      // and that prompt teaches the F4 reply channel `vibe_vmu_turn { op: "reply", report }`. MEASURED in that run: the
      // children called it 20 times and every call was refused (`VMU_INVALID_ARGUMENT` naming the member, then
      // `VMU_TURN_NO_PENDING_MEMBER`), because the pending turn lives in the PARENT's turn store - a child session is a
      // different process with its own store, so the face cannot answer a turn it has never seen. One whole round was
      // reported as a failure on top of that. The prompt therefore never told the child HOW to hand work back, while the
      // seam harvests exactly that: this session's final text. The note below is the missing half, and it is appended by
      // the SUBAGENTS bridge (not by the pack) because only this bridge knows which side of the seam the reader is on.
      request: { prompt: [{ type: 'text', text: String(text) + SUBAGENT_DELIVERY_NOTE }] },
      // ★ the seat travels on the REQUEST on both creation paths (see `seatPreset` above); `null` means "inherit the
      // caller's preset", which is the pre-existing behaviour and stays the default.
      agentPreset: seatPreset,
      // ★★★ ROUND 71: THE CONTINUABLE REQUEST HAS ITS OWN REQUIRED SHAPE. The host types it as
      // ContinuableCreateRequest { sessionId; parent: Agent; signal: AbortSignal }, and this spec supplied only a
      // label and a prompt - so the same delegationDepthOf read gent.options off a parent that was never there,
      // which is the "reading 'options'" seen thirty-five times on a real machine. The three required fields are now
      // carried, from the same values the one-shot path uses.
      parent,
      signal,
      sessionId: (parent && parent.session && (parent.session.id || (parent.session.header && parent.session.header.id))) || null,
    }
    // ★★★ ROUND 62: THE HOST'S REGISTRY CAN REFUSE A TURN THAT IS OTHERWISE FINE, AND THAT MUST BE NAMED.
    // A real machine's stacks - captured only after the receipt started keeping them - show the throw coming from the
    // host's own subagent library: startContinuable -> assertAdmitting -> closingTeardownFor -> liveLineage, i.e. the
    // host refuses to admit a new continuable activation WHILE A PREVIOUS ONE IS STILL BEING TORN DOWN. That is a
    // TIMING condition, not a defect in the turn, and the same call normally succeeds a moment later. So it is retried
    // once, and if it still fails the refusal carries the HOST'S OWN WORDS rather than letting a bare TypeError be
    // reported as "the agent said nothing" - which is exactly how this looked undiagnosable for several rounds.
    // ★★★ ROUND 63: ONE-SHOT FIRST. `start(provider, request)` builds a one-shot descriptor and never enters the
    // continuable lifecycle, so the registry that refused a NESTED activation is not consulted at all. The request
    // shape is the one-shot one: a label, the prompt, and the parent/signal the provider expects - the continuable
    // `spec` is a DIFFERENT contract and is only used on the fallback path.
    // ★★★★★★★ PHASE 6: ONE `start` NAME, ISSUED TWICE. The retry below calls it a second time; naming it keeps the
    // ACTIVATION spec - whose shape differs from BOTH older verbs - in one place instead of duplicated at two sites.
    //   activation: { provider, label, request:{prompt,parent,signal,...}, signal, delivery:'caller' }
    //   one-shot  : start(provider, { label, prompt, parent, signal, options, ... })
    // `delivery:'caller'` is deliberate: the result comes back to THIS caller instead of also notifying the parent
    // model, which is exactly what a member turn is - one delivery with a reply (docs/26 stage 3).
    const startOnce = () => {
      // the seat is a REQUEST field on every path the host accepts: one-shot carries it beside label/prompt/options,
      // the activation carries it inside `request` (its own start-request), and the continuable fallback reads it off
      // `spec` (see the spec literal above). A host that does not know the field ignores it, which is why `null` —
      // "inherit" — is the default rather than a named preset.
      const seat = seatPreset === null ? {} : { agentPreset: seatPreset }
      if (oneShot) {
        return subagents.start(provider, Object.assign({ label: spec.label, prompt: spec.request.prompt, parent, signal, options: options || {} }, seat, spec.oneShotRequest || {}))
      }
      if (canActivate) {
        return subagents.startActivation(Object.assign({
          provider: String(provider),
          label: spec.label,
          request: Object.assign({ prompt: spec.request.prompt, parent, signal }, seat, spec.oneShotRequest || {}),
          signal,
          // 'caller' = keep the result with this caller; 'parent' would also notify the parent model.
          delivery: 'caller',
        }))
      }
      return subagents.startContinuable(spec)
    }
    // ★★★★★★★ PHASE 6: A MISSING PROVIDER IS A CONFIGURATION MISTAKE, NOT A HOST REFUSAL - SO IT IS CHECKED OUTSIDE
    // THE RETRY WRAPPER. Anything thrown inside startOnce() is caught by the first catch, retried once, and then
    // re-labelled VMU_ENGINE_UNAVAILABLE ("the host refused to start this member turn twice"). Reporting a fixable
    // deployment setting as a host failure is the kind of misdirection this phase removes, and it would be invisible:
    // the message would blame the host while the fix is one setting key.
    if (canActivate && !oneShot && (typeof provider !== 'string' || provider === '')) {
      throw refuse('VMU_INVALID_ARGUMENT', 'the activation delivery path needs a provider name',
        'set config.deliverProvider or vmu.turn.deliverProvider to one of the names this host lists: ' + providerNamesOf(subagents))
    }
    const reportPhase = (phase) => { try { if (options && typeof options.onPhase === 'function') options.onPhase(phase) } catch { /* evidence only */ } }
    reportPhase('start-called')
    let handle
    try {
      handle = await startOnce()
      reportPhase('start-returned')
    } catch (e) {
      const first = String((e && e.message) || e)
      // ★★★ ROUND 80: THE PAUSE IS AN INJECTED SEAM, NOT A GLOBAL TIMER. The timer scan counts every file that creates
      // a global timer and its list is exact, so adding one was not available - and rightly so: a library that reaches
      // for a global timer cannot be controlled by its host. `delay` is awaited if the deployment supplies one, and
      // otherwise the retry simply proceeds, which keeps this function free of global state entirely.
      if (typeof delay === 'function') await delay(250)
      try {
        handle = await startOnce()
      } catch (e2) {
        throw refuse('VMU_ENGINE_UNAVAILABLE',
          'the host refused to start this member turn twice on the ' + path + ' path: ' + String((e2 && e2.message) || e2),
          'the host\'s subagent registry would not admit a new activation; the first failure was "' + first + '". It refuses while a previous activation is still being torn down, so retry later or serialise deliveries so each turn waits for the last teardown (docs/26 §3.22)', e2)
      }
    }
    // ★ F-116a (run 116): REPORT THE CHILD THE HOST JUST STARTED, BEFORE ITS RESULT IS AWAITED. `SubagentActivation`
    // carries `childId` and a one-shot handle carries one too, so the kernel can learn "this member session is that
    // member" while the member is still working — which is exactly when its tool calls ask who is calling.
    try {
      const earlyChild = childIdOf(handle)
      if (earlyChild && turn && typeof turn.onChild === 'function') turn.onChild(String(earlyChild))
    } catch { /* learning the child id is a convenience, never a blocker */ }
    // ★★★★★★★ PHASE 6: AN ACTIVATION IS NOT A HANDLE - IT MUST BE AWAITED AND DISPOSED, AND ITS TEXT LIVES IN `output`.
    //   SubagentActivation = { childId, messageId?, result: Promise<SubagentResult>, dispose() }
    //   SubagentResult     = { output: ContentBlock[], structured?, diagnostic?, stopReason }
    // None of the handle-shaped readings below (`handle.reply` / `handle.text` / `handle.result`) apply - a
    // SubagentResult carries no `reply`/`text` field, only content blocks - so this path is handled here and returns.
    // dispose() runs on the FAILURE path too: an undisposed activation holds an execution handle open, which is
    // exactly the leak that later surfaces as "the host refuses to admit a new activation".
    if (path === 'activation') {
      const activation = handle
      // ★★★★★★★ ROUND 32 / F8 — THE DISPOSE BELOW IS WHY THE NEXT TURN CANNOT CONTINUE THE SAME CHILD.
      // MEASURED (run 32, `full-1026-213122.jsonl`): the second turn of `res-01` offered the learned session
      // `eafb8753-…` and the host refused the resume with `Cannot read properties of undefined (reading 'aborted')`,
      // so the turn fell back to a FRESH child (`continuation.applied:false, cause:'resume-failed'`). An activation is
      // disposed as soon as its reply is read (line below), and a disposed activation is exactly the object a later
      // `subagents.prompt` resume would have to read a signal off. So: when the HOST SAYS IT CAN RESUME (`turn.continuationCapability.capable`),
      // the activation is KEPT RESIDENT for the following turn instead of being disposed after its reply. This is a
      // MEASURED BET, not a proven fix: the run that follows it must read `residency` below. The failure path still
      // disposes (an activation whose run failed has no reply worth resuming, and an undisposed one holds an execution
      // handle open); the residency is also disclosed in the receipt so a reader never has to guess whether it was kept.
      const keepResident = !!(turn && turn.continuationCapability && turn.continuationCapability.capable === true)
      const disposeOnce = async (force) => {
        if (keepResident && force !== true) return
        try { if (activation && typeof activation.dispose === 'function') await activation.dispose() } catch { /* a failed dispose must not lose the reply */ }
      }
      let res = null
      try {
        res = activation && activation.result ? await activation.result : null
      } catch (e) {
        await disposeOnce(true)
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'the host activation for this member turn failed: ' + String((e && e.message) || e),
          'the activation was started and then disposed; the failure came from the child run itself, not from the delivery (docs/26 stage 3)', e)
      }
      await disposeOnce()
      reportPhase('result-returned')
      // ★★★★★★★ PHASE 7 / ROUND 18: "NO TEXT" IS THREE DIFFERENT EVENTS, AND THE OLD REFUSAL NAMED NONE OF THEM.
      //   Measured live (run 21): the office got `the child returned no text` with `stopReason=error diagnostic=undefined`
      //   and could not tell whether (a) the child RUN failed, (b) the child spoke only through tool calls, or (c) the
      //   contract was structured-only. A refusal that cannot say which one it is cannot be acted on.
      //   Fix: keep the structure-first contract (an `outputSchema` result IS the answer), and when there is really
      //   nothing, name the block types we DID see plus the stopReason so the operator knows which event happened.
      const activationBlocks = Array.isArray(res && res.output) ? res.output : []
      const activationBlockTypes = []
      for (const b of activationBlocks) {
        const t = b && typeof b.type === 'string' ? b.type : (b && typeof b.text === 'string' ? 'text' : null)
        if (t && !activationBlockTypes.includes(t)) activationBlockTypes.push(t)
      }
      const activationReply = textOfContentBlocks(res && res.output)
      const activationStructured = res && res.structured !== undefined && res.structured !== null ? res.structured : null
      if (activationReply === null) {
        if (activationStructured !== null) {
          return {
            reply: JSON.stringify(activationStructured),
            childId: (activation && (activation.childId || activation.id)) || null,
            stopReason: res && typeof res.stopReason === 'string' ? res.stopReason : null,
            structured: activationStructured,
            attribution: 'activation: no text block; the child answered through its outputSchema, so the structured result IS the reply',
            deliveryPath: 'activation',
            residency: keepResident ? 'kept-resident-for-continuation' : 'disposed-after-reply',
            residencyMeans: keepResident
              ? 'this activation was NOT disposed after its reply, because the host reported a resume capability: the next turn of this member may be admitted into THIS child session instead of starting a new one. A run reading `continuation.applied` next to this value is the measurement of whether that bet paid'
              : 'this activation was disposed as soon as its reply was read, so the next turn of this member necessarily starts a fresh child (the host has no resume capability in this deployment)',
          }
        }
        const stopReason = res && typeof res.stopReason === 'string' ? res.stopReason : null
        const diagnostic = res && res.diagnostic !== undefined ? res.diagnostic : null
        const whichChildEvent = stopReason === 'error'
          ? 'the child RUN itself ended with stopReason="error" - this is a failed child run (read that child session\'s own log), not an empty answer; retrying the turn is legitimate, and the framework does not retry silently because a silent retry would hide a persistent child fault'
          : (activationBlockTypes.length === 0
            ? 'the child produced NO output blocks at all'
            : (activationBlockTypes.every((t) => t === 'tool_use' || t === 'tool-call')
              ? 'the child spoke ONLY through tool calls and never emitted a text block'
              : 'the child produced blocks (' + activationBlockTypes.join(', ') + ') but none carried text'))
        // ★ The general dispose above already ran when the activation was not kept resident, so this only has to act in
        // the ONE case it was skipped: a kept-resident activation with no reply has nothing worth resuming, and holding
        // its execution handle open would be the very leak this path exists to prevent. (Measured: calling it
        // unconditionally disposed twice — `{"disposed":2}` — in tests/vmu-turn-activation.test.mjs.)
        if (keepResident) await disposeOnce(true)
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'the host accepted the activation but the child returned no text',
          whichChildEvent + '; blockTypes=[' + activationBlockTypes.join(', ') + '] stopReason=' + String(stopReason) +
          ' diagnostic=' + String(diagnostic) + '. The refusal is named on purpose: reporting an empty string as a member answer would be a silent fake success')
      }
      return {
        reply: activationReply,
        childId: (activation && (activation.childId || activation.id)) || null,
        stopReason: res && typeof res.stopReason === 'string' ? res.stopReason : null,
        structured: res && res.structured !== undefined ? res.structured : null,
        attribution: keepResident
          ? 'activation: reply read from result.output; the activation was KEPT RESIDENT so a later turn can continue this child session'
          : 'activation: reply read from result.output, then dispose() called on the activation',
        deliveryPath: 'activation',
        residency: keepResident ? 'kept-resident-for-continuation' : 'disposed-after-reply',
        residencyMeans: keepResident
          ? 'this activation was NOT disposed after its reply, because the host reported a resume capability: the next turn of this member may be admitted into THIS child session instead of starting a new one. A run reading `continuation.applied` next to this value is the measurement of whether that bet paid'
          : 'this activation was disposed as soon as its reply was read, so the next turn of this member necessarily starts a fresh child (the host has no resume capability in this deployment)',
      }
    }
    if (typeof extract === 'function') {
      const got = extract(handle)
      if (typeof got === 'string') {
        return { reply: got, childId: childIdOf(handle), stopReason: null,
          attribution: 'extractor returned a bare string: no stopReason was read (docs/26 §3.22)', deliveryPath: path }
      }
      if (got && typeof got === 'object' && typeof got.reply === 'string') {
        return { reply: got.reply, childId: got.childId || childIdOf(handle), stopReason: got.stopReason || null, attribution: 'extractor', deliveryPath: path }
      }
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'the extractor returned no reply text for this turn')
    }
    // ROUND 4 / F11 (Lead's authoritative host contract): the handle carries the LIFECYCLE fields too, and a turn that
    // cannot be attributed is reported as such rather than silently treated as an anonymous reply.
    const childId = childIdOf(handle)
    let stopReason = null
    let resolvedReply = null
    if (handle && typeof handle.stopReason === 'string') stopReason = handle.stopReason
    else if (handle && typeof handle.reason === 'string') stopReason = handle.reason
    else if (handle && handle.result && typeof handle.result.then === 'function') {
      // ★★★ ROUND 66: THE SAME AWAIT CARRIES THE REPLY, NOT ONLY THE stopReason. This block already awaited the host's
      // run result to read `stopReason` - and then looked for the reply on the HANDLE (`handle.reply` / `handle.text`),
      // which a one-shot run does not carry. That is precisely why the real machine reported "the host ACCEPTED the
      // turn but handed back no reply": the host accepted it, the result resolved, and the text sitting on that result
      // was never read. `res` is now kept, and the reply is taken from it - by the same field order the handle was read
      // with, plus the shapes a subagent result is seen to carry in practice. The failure path is unchanged: a result
      // with no text at all still refuses by name rather than parsing an empty string.
      try {
        const res = await handle.result
        if (res && typeof res.stopReason === 'string') stopReason = res.stopReason
        if (res) {
          for (const field of ['reply', 'text', 'output', 'content']) {
            const v = res[field]
            if (typeof v === 'string' && v.trim() !== '') { resolvedReply = v; break }
            if (v && typeof v === 'object' && typeof v.reply === 'string' && v.reply.trim() !== '') { resolvedReply = v.reply; break }
            // ★★★★★★★ SLV MEASURED (v3, real host): a ONE-SHOT `subagents.start` run resolves to
            // SubagentResult { output: ContentBlock[] }, and `output` is an ARRAY - the string/`reply` tests above both
            // miss it, so the host's accepted turn was reported as "handed back no reply". The activation path already
            // read `result.output` blocks; this branch is the one-shot counterpart, and it is the last place the text
            // exists before the loop would refuse.
            if (Array.isArray(v)) {
              const text = textOfContentBlocks(v)
              if (text !== null) { resolvedReply = text; break }
            }
          }
        }
      } catch { /* the run's own failure is named below */ }
    }
    const attribution = childId && stopReason
      ? 'childId+stopReason from the host handle'
      : (childId ? 'childId only: the host handle carried no stopReason (SubagentRun.result was unavailable)' : 'unavailable: the host handle carried no childId (docs/26 §3.22) - the turn is NOT attributed')
    if (handle && typeof handle.reply === 'string') return { reply: handle.reply, childId, stopReason, attribution, deliveryPath: path }
    if (handle && typeof handle.text === 'string') return { reply: handle.text, childId, stopReason, attribution, deliveryPath: path }
    // ★ ROUND 66: AND FINALLY THE REPLY THE HOST ACTUALLY HANDED BACK, from the result the block above already awaited.
    if (resolvedReply !== null) return { reply: resolvedReply, childId, stopReason,
      attribution: (childId ? 'childId' : 'no childId') + '+reply from the host run result (the handle itself carried no text)', deliveryPath: path }
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the host accepted the turn but handed back no reply',
      'give the loop an extractor, or deliver the reply through the loop as a later turn')
  }

  // ★★★★★★★ TASK-13 — THE OFFER THIS SEAM RECEIVED, AND WHAT IT CAN HONESTLY SAY ABOUT IT.
  // `turn.continuation` is written by the kernel (`deliverTurn`) from `memberSessions`, i.e. from the child session a
  // previous settled turn of this member ran in. Reading it here is not a second continuation mechanism: it is the same
  // seam, one property that the kernel put ON the turn — the channel that survives `host-deliver.js`, which forwards
  // `turn` verbatim and drops any extra argument (that is why the offer is not a third parameter).
  const continuationReading = (turn) => {
    const c = turn && turn.continuation && typeof turn.continuation === 'object' ? turn.continuation : null
    if (!c) return null
    const session = typeof c.session === 'string' && c.session !== '' ? c.session : null
    if (!session) return null
    const parentSessionId = (() => {
      const s = parent && parent.session ? parent.session : null
      if (!s) return null
      const h = s.header && typeof s.header === 'object' ? s.header : null
      const id = s.id || (h && h.id) || null
      return typeof id === 'string' && id !== '' ? id : null
    })()
    return {
      session,
      parentSessionId,
      offeredMeans: typeof c.means === 'string' ? c.means : null,
      // ★ TASK-16: the deployment's own probe of the composed resume (`subagents.prompt` + `agents.get(id).whenIdle()` +
      // `sessionQuery.observeSession(id)`), attached to the turn by `host-deliver.js`. It is a MEASUREMENT, not a wish:
      // when a piece is absent the receipt names it, so the next reader does not have to re-derive why nothing resumed.
      capability: turn && turn.continuationCapability && typeof turn.continuationCapability === 'object'
        ? turn.continuationCapability
        : null,
      // ★ NAMED, so the receipt says what the host ACTUALLY offers rather than what we wish it offered.
      hostVerbs: ['startActivation', 'startContinuable', 'start', 'sendMessage']
        .filter((k) => subagents && typeof subagents[k] === 'function'),
    }
  }

  /**
   * ★★★★★★★ TASK-13 — WHY THIS SEAM DOES NOT "JUST RESUME" BY PICKING A HOST VERB.
   * MEASURED on DSH 0.2.1, the host run 31 ran on (its own service catalog plus the shipped subagent manager):
   *   · `startActivation({ ..., childId })` takes a child id as a RESERVED IDENTITY for a NEW child. Passing the
   *     member's learned session there makes the manager refuse — `assertChildIdAvailable` throws
   *     `SubagentError('subagent "<id>" already exists', 'DUPLICATE_CHILD')` — so it is not a resume, it is a collision.
   *   · `sendMessage(sender, targetId, content)` DOES continue a session (an idle target starts a turn; an absent direct
   *     child cold-resumes from persistence), but it resolves to a MessageId, NOT to the child's answer. A member turn's
   *     entire contract is `deliver({ turn, text }) => reply`; delivering into the member's own session through
   *     `sendMessage` would therefore settle the turn with no reply, and the only honest outcomes would be "the host
   *     handed back no reply" or an invented one.
   * So a reply-capable resume is an INPUT, not something this seam can conjure: the caller passes `child` — the third
   * argument that was always in the signature — as `async ({ session, text, turn }) => ({ reply, childId?, stopReason? })`.
   * With it, the member runs in its own session and the answer comes back through the SAME deliver seam: no second
   * continuation reading, no new store, one argument. Without it the turn runs in a fresh child exactly as before, and
   * the return carries `continuation: { applied: false, cause, why, fix }` so no reader can again conclude that the
   * framework forgot to continue a member when the boundary is in the host.
   */
  const continuationReport = (turn) => {
    const c = continuationReading(turn)
    if (!c) return null
    const base = { session: c.session, offeredMeans: c.offeredMeans, parentSessionId: c.parentSessionId, hostVerbs: c.hostVerbs, capability: c.capability }
    if (c.parentSessionId !== null && c.parentSessionId === c.session) {
      return { ...base, applied: false, how: null, cause: 'learned-session-is-the-caller',
        why: 'the session learned for this member IS the session delivering the turn (' + c.session + '): continuing there would be the caller talking to itself, so the learning point is wrong, not the continuation',
        fix: 'the learning point must record the CHILD id the seam returned (`delivery.childId`), never the delivering session — check `memberSessions.set(...)` in `deliverTurn`/`step`' }
    }
    return { ...base, applied: false, how: null, cause: 'no-reply-capable-resume',
      why: 'this host offers no reply-capable continuation: `sendMessage`/cold resume accepts the member\'s existing session (' + c.session + ') but resolves to an inbox MessageId, so the child\'s answer never comes back through the `deliver({ turn, text }) => reply` contract; and `startActivation({ childId })` is a reserved identity for a NEW child — the manager refuses an existing id with DUPLICATE_CHILD. hostVerbs=[' + c.hostVerbs.join(', ') + ']' + (c.capability ? '; this deployment\'s own resume probe reports capable=' + String(c.capability.capable) + (Array.isArray(c.capability.missing) && c.capability.missing.length > 0 ? ' missing=[' + c.capability.missing.join(', ') + ']' : '') + ' — the reply-capable resume is a COMPOSITION (subagents.prompt + agents.get(id).whenIdle() + sessionQuery.observeSession(id) reading the child\'s final assistant text), so whichever piece is missing is the thing to fix' : ''),
      fix: 'two real fixes, both outside this seam\'s gift: (a) pass a resume capability as this seam\'s third argument `child` (async ({session,text,turn}) => ({reply,childId,stopReason})) from a caller that HAS a reply-capable resume verb, or (b) let the member report through the durable channel (the mailbox) and let the step settle as `awaiting` instead of a reply. Until one lands, this turn starts a FRESH child (' + c.session + ' is not reused) and the member has no cross-turn memory' }
  }

  /**
   * ★ THE WRAPPER: OFFER, APPLY, OR NAME THE BOUNDARY — AND WHEN IT CANNOT APPLY, DOWNGRADE *EXPLICITLY*.
   * A turn with no continuation offer goes straight to the old path — this changes nothing for any existing caller, which
   * is deliberate: run-31's defect was an absent reading, not a wrong delivery. A turn WITH an offer either resumes (the
   * caller supplied `child`) or delivers fresh and says why it could not resume.
   * ★★ LEAD RULING (task-16, 裁决 1): a resume that FAILS does NOT fail the member's turn. One failed turn stops the
   * institute, and what run-31 actually lost was not the downgrade but the SILENCE around it. So a throwing resume, and a
   * resume that returns no reply text, both fall back to `deliverFresh`; the return carries the downgrade as data
   * (`applied:false`, `cause`, `hostCode`, `why`, `fix`) on the same reading as a successful continuation would, so no
   * reader can mistake it for continuity — and no reader has to reconstruct it from a transcript either.
   * The ONE continuation failure that STAYS a failure is `VMU_TURN_DELIVERY_TIMEOUT`: there the member's own session may
   * still be running, so delivering a second child would double-execute the member instead of downgrading it.
   */
  return async ({ turn, text, child }) => {
    const continuation = continuationReport(turn)
    if (continuation === null) return deliverFresh({ turn, text })
    const resume = typeof child === 'function' ? child : null
    if (resume === null) {
      const fresh = await deliverFresh({ turn, text })
      return { ...fresh, continuation }
    }
    let resumed
    try {
      resumed = await resume({ session: continuation.session, text: String(text), turn })
    } catch (e) {
      const hostCode = e && typeof e.code === 'string' && e.code !== '' ? e.code : null
      // ★ THE ONE CONTINUATION FAILURE THAT STAYS A FAILURE (see the doc comment): the child may still be running.
      if (hostCode === 'VMU_TURN_DELIVERY_TIMEOUT') throw e
      const fresh = await deliverFresh({ turn, text })
      return { ...fresh, continuation: {
        ...continuation,
        applied: false,
        how: null,
        cause: 'resume-failed',
        hostCode,
        why: 'the caller-supplied resume (`child`, this seam\'s third argument) was given session="' + continuation.session
          + '" and threw' + (hostCode === null ? '' : ' [' + hostCode + ']') + ': ' + String((e && e.message) || e)
          + '. This turn therefore ran in a FRESH child. That is an EXPLICIT downgrade, not a silent one: the receipt names the session it tried, the host code and the reason — which is exactly the part run-31 lacked',
        fix: 'nothing to fix in this seam: make the resume capability succeed — (a) load @deepseek-ai/dsh-session-query (a cold resume refuses with CONTINUATION_UNAVAILABLE without it), (b) ensure the learned child was recorded mode:"continuable" (NOT_RESUMABLE otherwise), or (c) keep the parent Agent live for the turn (subagent/parent-unavailable). Until one is true, every turn of this member starts a fresh child',
      } }
    }
    const reply = typeof resumed === 'string'
      ? resumed
      : (resumed && typeof resumed.reply === 'string' ? resumed.reply : null)
    if (reply === null) {
      const fresh = await deliverFresh({ turn, text })
      return { ...fresh, continuation: {
        ...continuation,
        applied: false,
        how: null,
        cause: 'resume-no-reply',
        hostCode: null,
        why: 'the resume capability came back from session "' + continuation.session + '" (the member DID run there) but handed back no reply text, so this turn was delivered again as a FRESH child. Named, not silent: the missing piece is the reading on the way back, not a missing member answer',
        fix: 'return a string, or { reply, childId, stopReason } from `child(...)`: the member ran in its own session, so an empty return is a reading failure of the resume capability (docs/26 §3.22)',
      } }
    }
    const resumedChild = resumed && typeof resumed === 'object'
      ? (typeof resumed.childId === 'string' && resumed.childId !== '' ? resumed.childId
        : (typeof resumed.sessionId === 'string' && resumed.sessionId !== '' ? resumed.sessionId : null))
      : null
    return {
      reply,
      childId: resumedChild || continuation.session,
      stopReason: resumed && typeof resumed.stopReason === 'string' ? resumed.stopReason : null,
      structured: resumed && typeof resumed === 'object' && resumed.structured !== undefined ? resumed.structured : null,
      attribution: 'continuation: the seam handed the member\'s learned child session (' + continuation.session
        + ') to the caller-supplied resume capability and read the reply back from it — this turn CONTINUES the member instead of starting a new child',
      deliveryPath: 'continuation',
      continuation: { ...continuation, applied: true,
        how: 'caller-supplied resume (`child`, this seam\'s third argument) ran the member in session ' + continuation.session,
        cause: null,
        why: 'the caller supplied a reply-capable resume, so the member ran in its own session (' + continuation.session
          + ') and the answer came back through the same deliver seam',
        fix: null },
    }
  }
}

/** The child/session id of a host handle, in the order the authoritative contract names the fields. */
function childIdOf(handle) {
  if (!handle || typeof handle !== 'object') return null
  const direct = [handle.childId, handle.sessionId, handle.id]
  for (const v of direct) if (typeof v === 'string' && v) return v
  const nested = [handle.localAgent, handle.agent]
  for (const a of nested) {
    if (!a || typeof a !== 'object') continue
    for (const v of [a.id, a.sessionId]) if (typeof v === 'string' && v) return v
  }
  return null
}

/**
 * ROUND 4 / F9 - THE ONGOING-COMMAND BRIDGE (docs/26 §3.22). `deliverViaSubagents` can only START a member turn and
 * read its reply back; a framework that supervises a running member also needs to TALK TO it. The host's
 * `sendMessage(sender, targetId, content, { signal })` does exactly that (a running target receives at its nearest step
 * boundary, an idle one starts a turn, an absent direct child cold-resumes from persistence), and the sender must be
 * the EXACT live Agent - so the caller passes it and a missing sender is refused by name instead of guessed.
 */
/**
 * ★★★ ROUND 73 — THE DELIVERY ROUTE THAT NEEDS NO HOST `Agent`. A host may type a subagent request's `parent` as an
 * Agent and require it, while exposing only `list(): string[]` to a plugin - in which case no plugin can construct a
 * legal parent, and every subagent-based path dies in the host's `delegationDepthOf` reading `options` off null.
 * That is not a bug in either side; it is a boundary. `deliverTurn` is the FRAMEWORK's own seam, so the route that
 * remains is for the CALLING session to play the member turn.
 *
 * HOW IT WORKS. `deliverTurn({ turn, text })` returns the assembled prompt instead of a reply, marked
 * `awaiting: true`, and the tool face hands it to the caller. The caller then calls again passing the member's reply,
 * which this seam returns as the turn's answer. One tool call advances one member turn - acceptable because member
 * turns are discrete by construction.
 *
 * THE SEAM IS STATEFUL ON PURPOSE, AND SHALLOW. A single pending slot, replaced on each prompt; no queue and no
 * history, because a turn that is not answered must be re-asked rather than silently remembered. `pending()` reads
 * it (for a status receipt) and `supply(reply)` fills it.
 */
export function deliverByReturning() {
  let pendingPrompt = null
  let answeredFor = null
  let supplied = null
  const seam = async ({ turn, text }) => {
    if (supplied !== null) {
      const reply = supplied
      supplied = null
      // ★ the member whose prompt this answers: the reply belongs to THAT member, not to whoever the next step picks
      answeredFor = pendingPrompt && pendingPrompt.member ? String(pendingPrompt.member) : null
      pendingPrompt = null
      return { reply, forMember: answeredFor, childId: null, stopReason: 'supplied-by-caller', attribution: 'the CALLING session played this member turn (deliverByReturning)', deliveryPath: 'caller' }
    }
    pendingPrompt = { member: turn && turn.member ? String(turn.member) : null, turnId: turn && turn.id ? turn.id : null, text: String(text) }
    return { reply: null, awaiting: true, memberPrompt: pendingPrompt, childId: null, stopReason: null, deliveryPath: 'caller' }
  }
  seam.supply = (reply) => { supplied = typeof reply === 'string' ? reply : null; return seam }
  seam.pending = () => pendingPrompt
  seam.awaiting = () => supplied === null
  /**
   * ★ LANE turn-reply: A PROMPT CAN BE ANSWERED WITHOUT A REPLY STRING. A structured tool report answers the pending
   * prompt as surely as `supply()` does, but it is not text - so the kernel needs a way to say "this prompt has been
   * answered" without inventing a reply. Without it, a completed report would leave the pending prompt dangling and the
   * next delivery would report it as unanswered (or, worse, hand the SAME prompt back twice).
   */
  seam.consumePending = () => {
    const answered = pendingPrompt
    pendingPrompt = null
    return answered
  }
  return seam
}
export function sendViaSubagents(subagents) {
  if (!subagents || typeof subagents.sendMessage !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the subagents seam cannot send a message to a running member',
      'inject { sendMessage } yourself, or give the seam a host with sendMessage (docs/26 §3.22)')
  }
  return async ({ sender, targetId, content, signal } = {}) => {
    if (!sender) {
      throw refuse('VMU_ENGINE_UNAVAILABLE', 'sendMessage needs the EXACT live sender Agent (the host derives durable sender attribution from it)',
        'pass sender:<the live Agent>, not an id: the host refuses a reconstructed sender')
    }
    if (typeof targetId !== 'string' || !targetId) {
      throw refuse('VMU_INVALID_ARGUMENT', 'sendMessage needs the target session id', 'pass targetId:"<child session id>" (listChildren lists them)')
    }
    const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content === undefined ? '' : content) }]
    // ★★ ROUND 33 / task-23 (adjacent defect, same shape as the resume bridge): the host's `sendMessage` is
    // `sendMessage(parent, childSessionId, content, options)` and its admission path starts with
    // `options.signal.throwIfAborted()`. Passing `{}` when the caller had no signal is therefore NOT a harmless
    // default — it is a TypeError raised inside the host, and the host's own failure path then reads
    // `signal.aborted` on the same undefined, so the real refusal reason is replaced by
    // "Cannot read properties of undefined (reading 'aborted')". Hand it an AbortSignal ALWAYS; an unaborted one is
    // exactly what "no cancellation requested" means here.
    const liveSignal = signal && typeof signal === 'object' && typeof signal.aborted === 'boolean' && typeof signal.throwIfAborted === 'function'
      ? signal
      : new AbortController().signal
    return subagents.sendMessage(sender, targetId, blocks, { signal: liveSignal })
  }
}

/**
 * ROUND 4 / F10 - THE INTERRUPT BRIDGE (docs/26 §3.22). `interrupt(targetSessionId, authority)` is fire-and-return: the
 * cancel signal goes out first and the target may stop at its next observation point. It is NOT a disposal: unclaimed
 * inbox work, activations and published descendants all survive, and an absent target is an accepted no-op - so the
 * bridge reports which of those happened instead of pretending the member is gone.
 */
export function interruptViaSubagents(subagents) {
  if (!subagents || typeof subagents.interrupt !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the subagents seam cannot interrupt a member',
      'inject { interrupt } yourself, or give the seam a host with interrupt (docs/26 §3.22)')
  }
  return ({ targetSessionId, authority, agent } = {}) => {
    if (typeof targetSessionId !== 'string' || !targetSessionId) {
      throw refuse('VMU_INVALID_ARGUMENT', 'interrupt needs the target session id', 'pass targetSessionId:"<child session id>"')
    }
    // The authority is REQUIRED by the host and must be well-formed: `{kind:'user', parentSessionId}` or
    // `{kind:'ancestor', agent}`. A missing/misshaped authority would make the host throw UNAUTHORIZED, so it is
    // refused HERE by name, before the call, with the two accepted shapes spelled out.
    const auth = authority || (agent ? { kind: 'ancestor', agent } : null)
    if (!auth || (auth.kind === 'user' ? typeof auth.parentSessionId !== 'string' : (auth.kind === 'ancestor' ? !auth.agent : true))) {
      throw refuse('VMU_INVALID_ARGUMENT', 'interrupt needs a well-formed authority',
        "pass authority:{kind:'user',parentSessionId} or authority:{kind:'ancestor',agent} (the host answers UNAUTHORIZED otherwise)")
    }
    subagents.interrupt(targetSessionId, auth)
    return { ok: true, targetSessionId, authorityKind: auth.kind, semantics: 'fire-and-return: the target may stop at its next observation point; unclaimed work and descendants survive' }
  }
}

/** Resolve the effective ownership table: the declared default, with a caller-supplied override winning per field. */
export function resolveOwners(bindings = null) {
  if (!bindings || typeof bindings !== 'object') return FIELD_OWNERS
  const merged = {}
  for (const k of FIELDS) {
    const o = bindings[k]
    merged[k] = o && typeof o === 'object' && typeof o.face === 'string' && typeof o.op === 'string'
      ? Object.freeze({ face: o.face, op: o.op })
      : FIELD_OWNERS[k]
  }
  return Object.freeze(merged)
}

// ★★★ PHASE 12 / R15 (finding f, measured on live run 12): THE LOOP NOW COMPOSES THE PER-ROUND BRIEF.
// `kernel/prompt/index.js:40-47` has always documented `statusBlock` as 「the loop composes that block from the
// kernel's own state and hands it over as ONE variable」 — but no loop ever did: `turn.open()` defaulted it to null
// and the v5r pack rendered the bare placeholder, so every member prompt on a live run read
// 「〔未提供：statusBlock〕」 exactly where its seat, the round and the vote floor belong.
// THE VOCABULARY IS THE FRAMEWORK'S OWN FALLBACK, not an institution's wording: a pack that wants different prose
// can supply `statusBlock` itself (that is what the v3 pack's middleware does), in which case this composer is not
// reached. Kept deliberately minimal - a seat, the round, the roster and the floor - because inventing more would
// mean guessing facts the loop does not have.

/**
 * ★★★ ROUND 30 / task-19 — THE STATUS BOARD'S FOUR FIELDS, AND THE ONE SOURCE EACH ONE COMES FROM.
 *
 * The defect (P3, the acceptance ledger's §「状态板四字段无来源」): the institution's rule requires a
 * member's status board to cover ① 总任务 ② 规划 ③ 各任务完成状态 ④ 当前小任务 (docs/acceptance/conformance/
 * lane-rows-c.md §C3), while the loop's own status block carried only 「席位/轮次/阶段＋在册＋法定票数 m」 and the
 * board tool taught nothing. A member therefore could not answer "what is the goal, what happens next, who is doing
 * what" from anything the framework handed it.
 *
 * THE FIX IS NOT NEW STORAGE. Every field is DERIVED from a ledger that already existed before this row:
 *   · 总任务        ← `vmu.turn.objective` (settings/schema.js:192, owner=office, default 「尚未设定」) when the office
 *                     has set it, else the task board's DEPENDENCY-FREE ROOT tasks (their titles are the mission as the
 *                     board states it). Both are existing declarations; neither is a copy of the other.
 *   · 规划          ← `tasks.list()`: the unfinished tasks, split into 可开工 (no unmet dependency) and 被前置卡住
 *                     (with the ids it waits on). That IS the plan of record - inventing a second plan ledger would put
 *                     two writers on one fact.
 *   · 各任务完成状态 ← `tasks.list()`: counts per declared state (open/assigned/doing/done/cancelled).
 *   · 当前小任务     ← `records.list({ track: 'progress' })`: the member's MOST RECENT progress row (the records head
 *                     list maps `owner` to the record's AUTHOR, so "whose row" is the ledger's own answer, not a guess).
 *                     The row's `updatedAt` is the time information the rule asks for.
 *
 * HONESTY IS THE OTHER HALF (and it is the part a green test must be able to fail on): a field whose source cannot be
 * read, or is simply empty, gets `value: null` PLUS a `why` naming the source that failed and what it returned -
 * never an empty label and never invented text. The renderer prints 「该来源未提供：<why>」 for exactly that case.
 */
export const STATUS_BOARD_FIELDS = Object.freeze([
  Object.freeze({ key: 'objective', label: '总任务', source: '设置键 vmu.turn.objective，或任务板上无依赖的根任务' }),
  Object.freeze({ key: 'plan', label: '规划', source: 'vmu.tasks.list（未完成任务：可开工／被前置卡住）' }),
  Object.freeze({ key: 'tasks', label: '各任务完成状态', source: 'vmu.tasks.list（按状态的计数）' }),
  Object.freeze({ key: 'current', label: '当前小任务', source: "vmu.records.list({ track: 'progress' })（该成员最近一条）" }),
])

/** The task states `kernel/tasks.js` declares (TASK_STATES), in the order a reader expects; unknown states still print. */
const TASK_STATE_ORDER = Object.freeze(['open', 'assigned', 'doing', 'done', 'cancelled'])
const STATUS_BOARD_DEFAULT_LIMIT = 6
/** The default value of `vmu.turn.objective` means "the office has not set one" - it is not a mission statement. */
const OBJECTIVE_UNSET = '尚未设定'

/** Accept a reader as a bound function, or as the service object itself (`kernel.tasks`), or null. */
const readerOf = (bag, method) => {
  if (typeof bag === 'function') return bag
  if (bag && typeof bag[method] === 'function') return bag[method].bind(bag)
  return null
}
/** Read one setting from either a settings VIEW (`get`) or a plain object; a setting that cannot be read is null. */
const settingOf = (settings, key) => {
  try {
    if (!settings || typeof settings !== 'object') return null
    const v = typeof settings.get === 'function' ? settings.get(key) : settings[key]
    return v === undefined ? null : v
  } catch { return null }
}
const idTitle = (row) => String(row && row.id) + '「' + String(row && row.title) + '」'
const isPromise = (v) => Boolean(v) && typeof v.then === 'function'
/** `updatedAt` is an epoch NUMBER or an ISO string depending on the deployable clock, so both the ORDER ("most recent")
 *  and the RENDER have to go through one parser - comparing `Number(updatedAt)` would make every ISO row NaN and leave
 *  the "newest" choice to whatever order the ledger happened to return. An unparseable stamp sorts as unknown (never as
 *  "the newest") and is still shown as-is rather than being dropped. */
const stampMs = (row) => {
  const raw = row && row.updatedAt
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const parsed = Date.parse(String(raw === undefined || raw === null ? '' : raw))
  return Number.isFinite(parsed) ? parsed : null
}
const stampIso = (row) => {
  const raw = row && row.updatedAt
  if (raw === undefined || raw === null || raw === '') return null
  const ms = stampMs(row)
  return ms === null ? String(raw) : new Date(ms).toISOString()
}

/**
 * ★★★ D5, STRUCTURALLY: A STATUS-BOARD ROW IS A READING, SO EVERY ROW MUST ANSWER ABOUT TIME - either with the time
 * its CONTENT carries (`at`) or with a sentence naming why that content has no time (`timeWhy`). The rule used to be
 * enforced branch by branch (only the objective row got a `timeWhy`), so rows ② 规划 and ③ 各任务完成状态 were built
 * with `at: readAt` and, because the ONE production caller passes no `at` (the prompt must stay diffable, ROUND 102),
 * they rendered with NEITHER `（读于 …）` NOR `（时间未提供：…）` - "I have no time" and "I did not print a time" read
 * identically. This helper is the ONLY writer of either field, and `statusBoardReadings` sweeps ALL its rows through
 * it before returning, so a fifth row cannot forget. It never invents a stamp: a row with no content time SAYS so.
 */
const TIME_WHY_UNSTATED = '这一行没有内容时间戳（来源没有回报时间，本次读取也没有提供读取时刻）'
const stampedTime = (row, at = null, why = null) => {
  if (!row || typeof row !== 'object') return row
  const stamp = at === null || at === undefined ? '' : String(at).trim()
  if (stamp !== '') {
    row.at = stamp
    delete row.timeWhy
    return row
  }
  row.at = null
  const named = typeof why === 'string' ? why.trim() : ''
  row.timeWhy = named === '' ? TIME_WHY_UNSTATED : named
  return row
}

/**
 * DERIVE the four status-board fields — a pure, SYNCHRONOUS read of the two ledgers the kernel already keeps (both
 * `tasks.list()` and `records.list()` are synchronous; a reader that hands back a Promise is reported as unreadable
 * rather than silently awaited, so the composer stays a pure function). Returns:
 *   { ok, at?, fields: [{ key, label, source, value|null, why|null, at|null, timeWhy? }], objective, plan, tasks,
 *     current, available, unavailable }
 * Every row carries exactly one of `at` (its content time) or `timeWhy` (why the content has no time); see
 * `stampedTime`. A caller that wants the board without any kernel (a test, a pack with its own board) can pass
 * `statusSources`.
 */
export function statusBoardReadings({ tasks = null, records = null, member = null, settings = null, limit = STATUS_BOARD_DEFAULT_LIMIT, at = null, kernel = null } = {}) {
  const cap = Number.isInteger(limit) && limit > 0 ? limit : STATUS_BOARD_DEFAULT_LIMIT
  const readTasks = readerOf(tasks, 'list')
  const readRecords = readerOf(records, 'list')
  const readRecord = readerOf(records, 'get')
  // ★★ ROUND 99 / D5: the four contents all carry TIME. Rows carried `at` but every read branch wrote `at: null`,
  // so a member saw four values with one board-level stamp. `readAt` is the moment THIS board was read: one read, one
  // clock, and the line says so (four different clocks would claim a precision this reader does not have).
  const readAt = at === null || at === undefined ? null : String(at)
  // ★★ D5: a row with NO value has no content time either, and says so by name (its `why` already explains the missing
  // reading; this adds the time half of the same honesty). Both constructors go through `stampedTime` so no branch can
  // produce a row that is silent about time.
  const gap = (why) => stampedTime({ value: null, why }, null, '这一行没有读数（原因见本行的「该来源未提供」），因此也没有内容时间戳')
  const said = (value, at2 = null) => stampedTime({ value, why: null }, at2 === null || at2 === undefined ? readAt : String(at2))

  // ── ONE read of the task board: 各任务完成状态, 规划 and the 总任务 fallback all derive from it, so a reader can
  // never see two different board readings inside one block.
  let rows = null
  let boardWhy = null
  if (!readTasks) boardWhy = '任务板不可读：没有注入任务面（tasks.list）'
  else {
    try {
      const listed = readTasks()
      if (isPromise(listed)) boardWhy = '任务板不可读：tasks.list() 返回了 Promise（状态板只读同步账本）'
      else if (Array.isArray(listed)) rows = listed
      else if (listed && Array.isArray(listed.tasks)) rows = listed.tasks
      else boardWhy = '任务板不可读：tasks.list() 的返回既不是数组也不是 { tasks: […] }'
    } catch (e) { boardWhy = '任务板不可读：' + String((e && e.message) || e) }
  }

  // ① 总任务: the office's declared objective first (that is the institution-wide mission every prompt already sees),
  //    then the board's root tasks. Both are existing sources; which one fired is named in the receipt.
  let objective = null
  const objectiveSetting = settingOf(settings, 'vmu.turn.objective')
  const objectiveText = typeof objectiveSetting === 'string' ? objectiveSetting.trim() : ''
  if (objectiveText !== '' && objectiveText !== OBJECTIVE_UNSET) {
    // ★★ ROUND 52 (live run 52, and the run-51 member's claim this row finally decided): A SETTING IS PER-KERNEL.
    // The same key resolved to the run's objective in the delivering kernel and to the pack default in the member's own
    // kernel, so a member comparing `[总任务]` with its own `vibe_vmu_status{detail:'settings'}` read saw two values and
    // reported the board's source label as false. It was not false - it was unqualified: the value came from THIS
    // kernel's settings, and `resolvedBy` says so on the field, so the renderer can name the kernel that resolved it.
objective = stampedTime({
      value: objectiveText, why: null,
      // ★★ ROUND 102 / D5: a settings key is CONFIGURATION, not a ledger row - it has no updatedAt. Saying nothing
      // about time let a member read a stale objective as a current one (run 100 did exactly that). The row now names
      // the absence, which is the same honesty the "该来源未提供" rows already carry.
      source: '设置键 vmu.turn.objective', resolvedBy: kernel,
    }, null, '设置键没有内容时间戳（vmu.turn.objective 是配置，不是账本行；它何时被写不在这条值里）')
  } else if (!rows) {
    objective = Object.assign(gap(boardWhy === null ? '任务板不可读' : boardWhy), { source: '任务板（无依赖的根任务）' })
  } else if (rows.length === 0) {
    objective = Object.assign(gap('任务板为空（0 条任务），且设置键 vmu.turn.objective 仍是「' + OBJECTIVE_UNSET + '」'),
      { source: '设置键 vmu.turn.objective ＋ 任务板' })
  } else {
    const roots = rows.filter((r) => r && (r.state !== 'done' && r.state !== 'cancelled') && !(Array.isArray(r.deps) && r.deps.length > 0))
    if (roots.length === 0) {
      objective = Object.assign(gap('任务板上没有无依赖的根任务（每条未结任务都有前置），设置键 vmu.turn.objective 也未设定'),
        { source: '任务板（无依赖的根任务）' })
    } else {
      const shown = roots.slice(0, cap).map(idTitle).join('；')
      const more = roots.length > cap ? '；另 ' + String(roots.length - cap) + ' 条已省略' : ''
objective = stampedTime({ value: shown + more, why: null, source: '任务板（无依赖的根任务 ' + String(roots.length) + ' 条）' },
        readAt, '总任务取自任务板的根任务，是按当前任务板现算的读数，不是一条账本记录；任务板没有回报内容时间戳，本次读取也没有提供读取时刻')
    }
  }

  // ★★ AUDIT HOLE D1 (rule 26: 各自推进各自的总任务): the board used to answer ② and ③ from ONE institute-wide reading
  // for every member, while the prompt taught each member "`[总任务]` 是「你」的总任务：每人各自推进各自的" — so a member
  // could not see which part of the plan was ITS part. The institute objective (①) legitimately has one value, but the
  // plan and the completion state now print THE CALLER'S OWN SLICE FIRST and the institute totals after it, so "各自"
  // is readable off the board instead of only off the prose. A board read with no `member` keeps the old single view
  // byte for byte (the office's board is the institute's board).
  const mineRows = (member !== null && typeof member === 'string' && member.trim() !== '' && Array.isArray(rows))
    ? rows.filter((r) => r && String(r.owner === undefined || r.owner === null ? '' : r.owner) === member.trim())
    : null
  // ★★ D1 (one idea, one spelling): the pack prompt teaches ONE lead-in for a member's own share -
  // `属于你（<member>，未完成 N 条）` - but ② 规划 spelled it `你的（…）` while ③ 各任务完成状态 spelled it `属于你（…）`,
  // so a member reading the two rows could not match "my share" without translating. BOTH rows now build their lead-in
  // here, from the SAME count: the caller's own UNFINISHED tasks. The office view (no `member`) never calls it, so the
  // institute board stays byte-identical.
  const ownShare = (unfinished) => '属于你（' + member.trim() + '，未完成 ' + String(unfinished) + ' 条）'
  const mineLive = mineRows === null
    ? null
    : mineRows.filter((r) => r && (r.state === 'open' || r.state === 'assigned' || r.state === 'doing'))

  // ② 规划: the unfinished work in dependency order, with the two facts a member needs (may I start? what am I waiting on?).
  let plan
  if (!rows) plan = Object.assign(gap(boardWhy), { source: '任务板' })
  else {
    const byId = new Map(rows.filter((r) => r && r.id !== undefined).map((r) => [String(r.id), r]))
    const unmet = (r) => (Array.isArray(r && r.deps) ? r.deps : []).filter((d) => {
      const dep = byId.get(String(d))
      return !dep || dep.state !== 'done'
    }).map(String)
    const live = rows.filter((r) => r && (r.state === 'open' || r.state === 'assigned' || r.state === 'doing'))
    if (rows.length === 0) plan = Object.assign(gap('任务板为空（0 条任务），规划无从派生'), { source: '任务板' })
    else if (live.length === 0) plan = Object.assign(gap('任务板上没有未完成任务（全部 done/cancelled），规划无从派生'), { source: '任务板' })
    else {
      const ready = live.filter((r) => unmet(r).length === 0)
      const blocked = live.filter((r) => unmet(r).length > 0)
      const bits = []
      // ★★ AUDIT HOLE D1: the caller's own slice goes first, so "各自推进各自的总任务" is readable from this line.
      // ★★ D1 (unified prefix): the lead-in comes from `ownShare`, the same helper row ③ uses.
      if (mineRows !== null) {
        const mineReady = mineLive.filter((r) => unmet(r).length === 0)
        const mineBlocked = mineLive.filter((r) => unmet(r).length > 0)
        const own = []
        if (mineReady.length) own.push('可开工：' + mineReady.slice(0, cap).map((r) => idTitle(r)).join('；'))
        if (mineBlocked.length) own.push('被前置卡住：' + mineBlocked.slice(0, cap).map((r) => idTitle(r) + '（等 ' + unmet(r).join('/') + '）').join('；'))
        bits.push(ownShare(mineLive.length) + '：' + (mineLive.length === 0
          ? '任务板上没有分派给你且未完成的任务'
          : own.join('；')))
      }
      // ★★ RUN 125 (D1 follow-up): with a member reading, the institute line now says so (全所可开工：…).
      // Before this, a member whose only unfinished task was t-1 saw `可开工：t-1「…」；可开工：t-1「…」（r-1）` —
      // the same task twice under the same lead-in, so the board looked like it had counted it twice. The
      // distinction the row is making is yours-vs-everyone's, and the line has to SAY which.
      const allLead = mineRows !== null ? '全所可开工：' : '可开工：'
      if (ready.length) bits.push(allLead + ready.slice(0, cap).map((r) => idTitle(r) + (r.owner ? '（' + String(r.owner) + '）' : '（未认领）')).join('；'))
      if (blocked.length) bits.push((mineRows !== null ? '全所被前置卡住：' : '被前置卡住：') + blocked.slice(0, cap).map((r) => idTitle(r) + '（等 ' + unmet(r).join('/') + '）').join('；'))
      const omitted = live.length - ready.slice(0, cap).length - blocked.slice(0, cap).length
      plan = stampedTime({
        value: bits.join('；') + (omitted > 0 ? '；另 ' + String(omitted) + ' 条已省略' : '') + (mineRows !== null ? '｜全所：未完成 ' + String(live.length) + ' 条' : ''),
        why: null, source: '任务板（未完成 ' + String(live.length) + ' 条）',
      }, readAt, '规划是按当前任务板现算的读数，不是一条账本记录；任务板没有回报内容时间戳，本次读取也没有提供读取时刻')
    }
  }

  // ③ 各任务完成状态: counts per state, with the state names the ledger itself reported (an unknown state still prints).
  let tasksField
  if (!rows) tasksField = Object.assign(gap(boardWhy), { source: '任务板' })
  else if (rows.length === 0) tasksField = Object.assign(gap('任务板上一条任务都没有（tasks.list() 返回 0 行）'), { source: '任务板' })
  else {
    const counts = new Map()
    for (const r of rows) {
      const state = String((r && r.state) || '（未声明状态）')
      counts.set(state, (counts.get(state) || 0) + 1)
    }
    const ordered = TASK_STATE_ORDER.filter((s) => counts.has(s)).concat([...counts.keys()].filter((s) => !TASK_STATE_ORDER.includes(s)))
    const openCount = rows.filter((r) => r && (r.state === 'open' || r.state === 'assigned' || r.state === 'doing')).length
    // ★★ AUDIT HOLE D1: same rule as ② — the caller's own completion state first, then the institute's totals.
    let mineText = ''
    if (mineRows !== null) {
      const mineCounts = new Map()
      for (const r of mineRows) {
        const state = String((r && r.state) || '（未声明状态）')
        mineCounts.set(state, (mineCounts.get(state) || 0) + 1)
      }
      const mineOrdered = TASK_STATE_ORDER.filter((s) => mineCounts.has(s)).concat([...mineCounts.keys()].filter((s) => !TASK_STATE_ORDER.includes(s)))
      // ★★ D1 (unified prefix): the SAME `ownShare` lead-in as ②, with the same unfinished count, so one idea has one
      // spelling on both rows; the per-state breakdown (which still includes the member's DONE rows) follows it.
      mineText = ownShare(mineLive.length) + '：'
        + (mineRows.length === 0 ? '（任务板上没有 owner 是你的任务）' : mineOrdered.map((s) => s + ' ' + String(mineCounts.get(s))).join(' · '))
        + '｜全所：'
    }
    tasksField = stampedTime({
      value: mineText + '共 ' + String(rows.length) + ' 条（未结 ' + String(openCount) + '）：' + ordered.map((s) => s + ' ' + String(counts.get(s))).join(' · '),
      why: null, source: '任务板（按状态的计数）',
    }, readAt, '各任务完成状态是按当前任务板现算的计数，不是一条账本记录；任务板没有回报内容时间戳，本次读取也没有提供读取时刻')
  }

  // ④ 当前小任务: this member's most recent `progress` record. The head list's `owner` IS the record's author
  //    (`kernel/records.js` view: `owner: rec.by`), so attribution is the ledger's, not ours; the sort is on
  //    `updatedAt` here rather than assumed from the list order, because the records head order is deployable.
  let current
  if (!readRecords) current = Object.assign(gap("progress 轨不可读：没有注入 records.list"), { source: "records 的 progress 轨" })
  else if (typeof member !== 'string' || member.trim() === '') {
    current = Object.assign(gap('未指定成员：没有成员 id，无法定位「该成员最近的 progress 记录」'), { source: "records 的 progress 轨" })
  } else {
    let items = null
    let progressEnvelope = null
    try {
      // ★ LIVE RUN 34 (the office's board, read against the ledger): `records.list` truncates the head list to
      // `vmu.records.headListAt` (7 by default) AFTER sorting by `updatedAt` ASCENDING - so the rows a status board
      // needs ("this member's MOST RECENT progress") are exactly the rows the cap drops. Measured: the board printed
      // 「该成员（res-02）在 progress 轨上还没有记录（records.list 报 6 条可见表头）」 while `r-14` (owner res-02,
      // track progress, live) was the newest of 7 rows. The board is a kernel-internal reader, not a wire surface, so
      // it asks for the whole track (`limit: 0` means "all", `kernel/records.js:606`) instead of inheriting the head
      // budget; a still-truncated answer names the truncation in `why` rather than reading as "nothing here".
      const listed = readRecords({ track: 'progress', limit: 0 })
      if (isPromise(listed)) current = Object.assign(gap('progress 轨不可读：records.list() 返回了 Promise（状态板只读同步账本）'), { source: "records 的 progress 轨" })
      else if (Array.isArray(listed)) items = listed
      else if (listed && Array.isArray(listed.items)) { items = listed.items; progressEnvelope = listed }
      else current = Object.assign(gap('progress 轨不可读：records.list({track:"progress"}) 的返回里没有 items 数组'), { source: "records 的 progress 轨" })
    } catch (e) {
      current = Object.assign(gap('progress 轨不可读：' + String((e && e.message) || e)), { source: "records 的 progress 轨" })
    }
    if (items !== null) {
      const mine = items.filter((it) => it && String(it.owner === undefined || it.owner === null ? '' : it.owner) === member.trim())
      if (mine.length === 0) {
        // A truncated list must never be reported as "this member has no records": the count we saw and the count the
        // ledger holds are two different claims (run 34's defect), so the reason names both. Run 44 showed the reader
        // still hesitating at "N 条可见表头" (whose?), so the line now says how many of them belong to THIS member.
        const seenCount = String(items.length)
        const truncatedTo = progressEnvelope && progressEnvelope.truncated === true ? '；该轨共 ' + String(progressEnvelope.available) + ' 条，可见的 ' + seenCount + ' 条是被截断后的' : ''
        current = Object.assign(gap('该成员（' + member.trim() + '）在 progress 轨上还没有记录（该轨可见 ' + seenCount + ' 条表头，其中 0 条属于该成员' + truncatedTo + '）'),
          { source: "records 的 progress 轨" })
      } else {
        const newest = mine.slice().sort((a, b) => (stampMs(a) === null ? -1 : stampMs(a)) - (stampMs(b) === null ? -1 : stampMs(b)))[mine.length - 1]
        let excerpt = null
        if (readRecord) {
          try {
            const got = readRecord({ id: String(newest.id) })
            const body = got && typeof got.body === 'string' ? got.body : (got && got.record && typeof got.record.body === 'string' ? got.record.body : null)
            if (body !== null) {
              const first = body.split('\n').map((l) => l.trim()).filter((l) => l !== '')[0]
              // ★ LIVE RUN 50 (the member's own reading): the board printed a mid-sentence piece of the progress body
              // with an ellipsis at the end but nothing saying it WAS a cut, so a reader could not tell "the text is
              // short" from "the text was truncated here". The line now says it is an excerpt and names the record that
              // holds the whole body (`vibe_v5_read_library {id:"<id>", expand:true}` reads it).
              if (first) excerpt = first.length > 80 ? first.slice(0, 80) + '…（摘录；完整正文见记录 ' + String(newest.id) + '）' : first
            }
          } catch { /* a row that expands badly keeps its head line; the excerpt is an extra, not the reading */ }
        }
        const stamp = stampIso(newest)
        current = stampedTime({
          value: idTitle(newest) + '｜更新于 ' + String(stamp === null ? '（记录未回报时间）' : stamp) + (excerpt ? '｜' + excerpt : ''),
          why: null, source: "records 的 progress 轨（该成员最近一条）",
        }, stamp, '该 progress 记录没有回报 updatedAt/createdAt，取不到它的内容时间戳')
      }
    }
  }

  // ★★ AUDIT HOLE D1: ① is the INSTITUTE's objective and there is one of it in this kernel, so a member reading it as
  // "my own task" mismatched the plan/completion lines right below (which now lead with its own slice). The row says
  // whose value this is, instead of letting the reader assume.
  if (objective && mineRows !== null && typeof objective.value === 'string' && objective.value.trim() !== '' && !objective.scopeNote) {
    objective.scopeNote = '全所总任务，内核只有一份；你自己的份额是 owner 是你的那些任务，见 规划 与 各任务完成状态 两行'
  }
  // ★★ ROUND 102 / D5, NOW STRUCTURAL: a row with no content time must say WHY it has none - a silent row reads as a
  // current one. The rule used to be a one-off fallback for the objective row only, so ② and ③ (built with
  // `at: readAt`, and the production caller passes no `at`) said nothing at all. Every row is built through
  // `stampedTime` above, and this sweep covers the WHOLE set - including a row a future edit adds - so no branch can
  // reintroduce the silence, and a row can never carry both fields or neither.
  const raw = { objective, plan, tasks: tasksField, current }
  for (const key of Object.keys(raw)) {
    const row = raw[key]
    raw[key] = stampedTime(row, row && row.at, row && row.timeWhy)
  }
  const fields = STATUS_BOARD_FIELDS.map((decl) => {
    const r = raw[decl.key] || { value: null, why: '内部错误：字段未计算', at: null }
    const field = { key: decl.key, label: decl.label, source: r.source || decl.source, value: r.value === undefined ? null : r.value, why: r.why === undefined ? null : r.why, at: r.at === undefined ? null : r.at }
    // ★★ ROUND 52: a settings-derived value carries the kernel that resolved it; the key is copied only when the read leg
    // produced it, so a fallback branch can never look like a settings resolution.
    if (Object.prototype.hasOwnProperty.call(r, 'resolvedBy')) field.resolvedBy = r.resolvedBy === undefined ? null : r.resolvedBy
    // ★★ ROUND 102 / D5: carry the reason a row has no content time; a frozen field that dropped it made the renderer
    // stay silent about time on a row the rule says carries time information.
    if (typeof r.timeWhy === 'string' && r.timeWhy.trim() !== '') field.timeWhy = r.timeWhy.trim()
    // ★★ D5 (the frozen boundary): the sweep above stamps the four rows this function BUILDS; this stamps a DECLARED
    // row it did not build (the internal-error placeholder), so "a row with neither time nor reason" cannot leave here
    // even if a future edit declares a fifth field without teaching `raw` about it.
    if (field.at === null && typeof field.timeWhy !== 'string') field.timeWhy = TIME_WHY_UNSTATED
    // ★★ AUDIT HOLE D1: a row shared by the whole institute says WHOSE value it is, so "my task" cannot be read into it.
    if (typeof r.scopeNote === 'string' && r.scopeNote.trim() !== '') field.scopeNote = r.scopeNote.trim()
    return Object.freeze(field)
  })
  const available = fields.filter((f) => typeof f.value === 'string' && f.value.trim() !== '').length
  return { ok: true, at: at === null ? null : String(at), member: typeof member === 'string' ? member : null, fields, objective, plan, tasks: tasksField, current, available, unavailable: fields.length - available }
}

/**
 * Render the four fields as the block's own labelled lines. A field with no value prints 「该来源未提供：<why>」 - the
 * reason is REQUIRED, so an empty label is impossible (a board that says nothing where it should say why is the defect
 * this whole row exists to remove).
 */
export function renderStatusBoard(readings) {
  const fields = readings && Array.isArray(readings.fields) ? readings.fields : []
  const byKey = new Map(fields.map((f) => [f.key, f]))
  return STATUS_BOARD_FIELDS.map((decl) => {
    const f = byKey.get(decl.key)
    const value = f && typeof f.value === 'string' && f.value.trim() !== '' ? f.value : null
    const why = f && typeof f.why === 'string' && f.why.trim() !== '' ? f.why : '状态板的读支路没有提供这个字段'
    // ★ ROUND 35 / F3 (live run 35): A READOUT THAT SWITCHES SOURCE MUST SAY WHICH SOURCE FIRED. `[总任务]` read the
    // setting when it was set and the task board's root task otherwise; run 35's office saw the board's root-task title
    // while its own settings read said `vmu.turn.objective` held a longer mission text, and reported "the board disagrees
    // with the setting" - a true observation about a reading that would not name its own provenance. The reading already
    // carries `source` (statusBoardReadings fills it for every branch); this prints it ONLY next to a value, so the
    // 「该来源未提供：<why>」 lines keep saying exactly that (their `why` already names the sources it tried).
    const source = f && typeof f.source === 'string' && f.source.trim() !== '' ? f.source.trim() : null
    // ★★ ROUND 52: A SETTINGS VALUE BELONGS TO THE KERNEL THAT RESOLVED IT. Run 52 showed the two facts living in two
    // kernels (the delivering kernel had the run objective, the member's own kernel had the pack default) and one line
    // claiming a single source, so a member comparing them could only conclude the label lied. The label stays the
    // declared source; the parenthetical now says WHOSE resolution it is, and names the kernel when it knows it.
    const scope = f && Object.prototype.hasOwnProperty.call(f, 'resolvedBy')
      ? (typeof f.resolvedBy === 'string' && f.resolvedBy.trim() !== ''
        ? '本内核 ' + f.resolvedBy.trim() + ' 的解析值'
        : '本内核的解析值')
      : null
    const paren = source === null ? null : (scope === null ? source : source + ' · ' + scope)
    // ★★ ROUND 99 / D5: the rule says the four contents carry time information, so a row that KNOWS when it was
    // read prints it. A row without a read time prints nothing extra — it must not borrow the board stamp as its own.
    const when = f && ((typeof f.at === 'string' ? f.at.trim() : (Number.isFinite(f.at) ? String(f.at) : '')) || null)
    // ★★ ROUND 102 / D5: "no time" is itself information. A row whose source has no content timestamp says WHY rather
    // than printing a value with no time at all - otherwise "no time" and "time not printed" look identical.
    const timeWhy = f && when === null && typeof f.timeWhy === 'string' && f.timeWhy.trim() !== '' ? f.timeWhy.trim() : null
    // ★★ AUDIT HOLE D1: a shared institute row prints whose it is, so the four lines cannot be read as one member's.
    const scopeNote = f && typeof f.scopeNote === 'string' && f.scopeNote.trim() !== '' ? f.scopeNote.trim() : null
    const shown0 = value === null ? null : (paren === null ? value : value + '（来源：' + paren + '）') + (scopeNote === null ? '' : '（' + scopeNote + '）')
    const shown = shown0 === null ? null : (when !== null
      ? shown0 + '（读于 ' + when + '）'
      : (timeWhy === null ? shown0 : shown0 + '（时间未提供：' + timeWhy + '）'))
    return '[' + decl.label + '] ' + (shown === null ? '该来源未提供：' + why : shown)
  }).join('\n')
}

const composeStatusBlock = (turn, readings = null) => {
  if (!turn || typeof turn !== "object") return ""
  const who = turn.roleLabel ? String(turn.roleLabel) + "「" + String(turn.member) + "」" : String(turn.member)
  const round = turn.round ? "；本轮是第 " + String(turn.round) + " 轮" : ""
  const phase = turn.phase ? "（阶段：" + String(turn.phase) + "）" : ""
  const lines = ["[状态] 你是 " + who + round + phase + "。"]
  if (typeof turn.roster === "string" && turn.roster.trim() !== "") lines.push("", "[在册]", turn.roster)
  if (turn.quorum !== null && turn.quorum !== undefined && Number.isFinite(Number(turn.quorum))) {
    lines.push("", "[表决] 法定票数 m = " + String(Number(turn.quorum)) + "。")
  }
  // ★ ROUND 30 / task-19: THE FOUR FIELDS THE RULE REQUIRES. `readings` is produced by `statusBoardReadings` (the
  // loop's read legs) or by a caller-supplied `statusSources`; when neither could produce a field, the line names the
  // missing SOURCE and why it is missing rather than printing an empty tag.
  lines.push("", "[状态板]", renderStatusBoard(readings))
  return lines.join("\n")
}

/**
 * Create the orchestrator. `prompt` is the pipeline (docs/06), `deliver` is the adapter seam, `faces` maps a face
 * name to its operations, e.g. `{ 'vmu.tasks': { create: async (p) => ... } }`.
 */
export function createTurnOrchestrator({
  // The institution policy for prompt-section switches. Null means the framework switches NOTHING,
  // which is this preset's stated design: "default zero mechanism, mechanisms provided as packs".
  sectionPolicy = null,
  // Renders this member's queued notices as the pack writes them (header, indented lines, blank line). Null means
  // the notices join the status block as before, which keeps the framework usable with no pack at all.
  noticeBlock = null,
  // ROUND 496: OPTIONAL, so every existing caller keeps working. It exists so `turn/reply-parsed` - frozen with a default
  // policy and previously emitted by nobody - can actually fire, at the one point where inspecting a parsed reply can still
  // change the outcome: after parsing, before dispatch.
  bus = null,
  // ★ LIVE RUN 115 (F-115a): called when this loop learns "member X ran in child session Y", so the kernel can write
  // that pair to durable state. Null keeps the in-memory-only behaviour (and every unit test that builds a loop alone).
  onMemberSession = null,
  // Phases the PACK declares, beyond the framework's own. See PHASES: which phases exist is institution
  // vocabulary, so the framework validates and the pack names.
  extraPhases = null,
  prompt = null, deliver = null, faces = {}, bindings = null, wakeupPolicy = 'round-robin', settings = null, clock = () => new Date().toISOString(),
  // ROUND 4 / F9+F10 (docs/26 §3.22): the ONGOING-COMMAND seams. Both are optional; a loop without them can still
  // START turns, and a caller that asks for the missing verb gets a NAMED refusal rather than a silent no-op.
  sendMessage = null, interrupt = null,
  // ROUND 7 / task-54 (F44 residual): an EXTERNAL NOTICE SOURCE. The loop already queues its own notices (a refused
  // dispatch) and drains them exactly once at assembly; this seam lets a face that OWNS a durable notice queue (the
  // Lean face's `takeNoticesFor(member)`) feed the SAME one-shot channel, so an announcement really reaches the
  // member's next prompt. Absent ⇒ nothing is added (the loop's own behaviour is unchanged, byte for byte).
  noticeSource = null,
  // ★ G7 ④: the HOST-side member tool-call index (kernel records name/phase/ok at the tool hooks). The step receipt
  // carries a BOUNDED SUMMARY so the root can see what the member actually called; full receipts never travel here.
  memberToolCalls = null, clearMemberToolCalls = null,
  // ★★★ PHASE 12 / R10: the LIVE facts the template contract asks for but nothing supplied (`{{ roster }}` and
  // `{{ quorum }}`). The framework does not own these (who is on staff, and what the required vote floor m equals, are
  // the deployment's facts), so it takes them from this seam and refuses BY NAME when the seam fails rather than
  // rendering an empty slot. Absent ⇒ the historical behaviour (null ⇒ the slot reports itself as missing).
  turnFacts = null,
  // ★★★ ROUND 30 / task-19: THE STATUS BOARD'S SOURCE SEAM. The four fields (`STATUS_BOARD_FIELDS`) are DERIVED, so a
  // caller that owns a different board can hand it here: a function `({ turn, faces, member }) => readings` (sync or
  // async; it must return the `statusBoardReadings` shape) or a bag `{ tasks, records }`. Absent ⇒ the loop reads its
  // own DECLARED read legs out of `faces` (`STATUS_BOARD_READ_OPS`: `tasks.list`, `records.list/get`, which
  // `facesFrom` binds from the same service bag `kernel/index.js:1619` already passes), and a field that still cannot
  // be read is rendered as 「该来源未提供：<why>」 rather than as an empty tag.
  // A source that THROWS is a NAMED refusal (the `noticeSource` precedent): a board nobody produced must not be
  // silently replaced by a plausible-looking one.
  statusSources = null,
  // ★★★★★★★ ROUND 35 / task-24 (live run 35): THE SHARED TURN LEDGER SEAM. `open()` is the ONE place that knows "this
  // member has now been given a turn", but this orchestrator's `turns` Map is MEMORY - and a member's child session
  // mounts a SECOND kernel instance over the same workspace, which cannot see this one's memory. `vmu.meetings.
  // chairActRequiresTurn` asked exactly that memory (`chairActed` -> `memberTurnCount`), so the chair's own turn was
  // invisible in the session where the chair convened, and the gate refused by name (`VMU_CHAIR_ACT_NOT_DELEGATED`,
  // "the chair r-acad has no recorded turn in this kernel") although the turn had just run. The seam is
  // `{ record(fact), count(memberId) }` over the shared durable fold (`kernel/index.js` owns both halves; `count` is
  // what `chairActed` calls). Absent ⇒ this loop behaves EXACTLY as before (memory only, byte for byte).
  turnLedger = null,
  // ★★ ROUND 52: WHICH KERNEL THIS IS. Settings resolve per kernel, so a board line that quotes a settings value must
  // be able to say which kernel's resolution it shows (run 52: the delivering kernel had the run objective, the member's
  // own kernel the pack default, and the unqualified label read as a lie). Absent ⇒ the scope sentence still says
  // 「本内核的解析值」, it just cannot name the kernel.
  // ★★★ ROUND 54: a GETTER is accepted and asked at every render, because a kernel can learn its own session id after
  // it is constructed (the host's session service mounts later; the first tool call carries the Agent). Capturing the
  // value here instead would freeze the anonymous answer the run-54 kernel gave for its whole life.
  kernelSession = null } = {}) {
  const owners = resolveOwners(bindings)
  const known = Object.keys(owners)
  // ROUND 347: the wakeup POLICY (docs/26 section 3.2). The original preset recorded only WHO should be woken and
  // left WHEN and WITH WHICH PROMPT to its host - which is why only that host could run an institute. The policy is
  // a declared setting here, so the framework drives its own rounds and a host may still override the choice.
  const POLICY = ['round-robin', 'least-recent'].includes(wakeupPolicy) ? wakeupPolicy : 'round-robin'
  const woken = new Map()   // member -> how often this loop has opened a turn for it
  let cursor = 0            // round-robin position, so cycling is positional rather than count-based
  // ★★★ ROUND 14 (live run 14): the spec used to carry NO turn id, so `deliverByReturning` stored `turnId: null` and
  // every reading that is supposed to NAME the held turn (`pending.turn`, `selectionIgnored.pending`,
  // `superseded.turn`) came back null while its `member` was filled — a half-reading that reads as "no turn" next to
  // a member who plainly has one. The id is minted here, at the ONE place a turn spec is created, per orchestrator.
  let turnSeq = 0
  const turns = new Map()
  // ★ LIVE RUN 12 (the institute's own report, item 1): the status read `assembled:2, delivered:0, parsed:0, refused:0,
  // dispatched:0, notExecuted:0`. Every counter was zero and NONE of them owned the two stalled turns: `delivered`
  // only increments AFTER the seam settles, so a delivery that THREW (a timeout is a throw) left no trace anywhere.
  // A counter that only counts successes cannot report a stall; `deliveryFailed` + `deliveryLastFail` exist so the
  // reader can see 'two turns were assembled and both deliveries threw, here is the code and the path'.
  const counts = { opened: 0, assembled: 0, delivered: 0, deliveryFailed: 0, deliveredMeans: 'settled deliveries: the seam returned an answer or an awaiting envelope. A THROW is counted in deliveryFailed, never here', deliveryLastFail: null, failed: 0, failedMeans: 'replies that ARRIVED but whose write-back threw (a malformed reply field is the usual cause). It is NOT deliveryFailed: the member did answer. Read failedLast for the reason and the text the member actually wrote', failedLast: null, parsed: 0, refused: 0, dispatched: 0, notExecuted: 0,
    // ★ ROUND 35 / task-24: the shared turn ledger's own counters (see `noteSharedTurn`). `ledgerRecorded` counts turns
    // whose fact LANDED in the durable fold; `ledgerFailed` counts writes that did not (read `ledgerLastFail`);
    // `ledgerSkipped` counts the one benign case - a store this instance never opened, where there is no durable layer
    // to write to and the loop's historical memory-only behaviour is all that exists.
    ledgerRecorded: 0, ledgerFailed: 0, ledgerSkipped: 0, ledgerLastFail: null,
    // ★ ROUND 35 / F4 (live run 35): A REPLY WE COULD NOT PARSE IS NOT A REPLY NOBODY CAN READ. The member DID answer -
    // it wrote prose where the reply channel wanted a fenced json object - and the office then had no way to read a single
    // word of it: the receipt carried `fields:[]` and `memberToolCalls:null`, and finding out whether a MUTED member had
    // spoken anyway took a grep through the child session log (the office spent most of its budget there). The refusal
    // already reaches the caller; what was missing is a LAST-FAILURE RECORD carrying the member's own text, bounded like
    // every other receipt field, plus the same excerpt on every successful round.
    replyParseFailedLast: null,
    replyParseFailedMeans: 'the reply ARRIVED but could not be parsed into the declared reply shape (no fence, or a brace span that is not json). The member\'s own text is in replyExcerpt (bounded to the same size as failedLast.replyText); `fields`/`executed` do not exist for such a round because nothing was applied',
    replyParseFailed: 0 }
  // ★★★★★★★ ROUND 35 / task-24 (live run 35): THE SHARED TURN LEDGER, WRITTEN BEFORE THE PROMPT LEAVES.
  // The defect this removes: `vmu.meetings.chairActRequiresTurn` asked `chairActed(seat)`, which read THIS instance's
  // in-memory `turns` Map. A member's child session runs its OWN kernel instance (docs/02 store row: "ONE FILE CAN HAVE
  // SEVERAL KERNELS OVER IT"), so the chair's turn was invisible in the very session where the chair convened a
  // meeting: the gate refused `VMU_CHAIR_ACT_NOT_DELEGATED` - "the chair r-acad has no recorded turn in this kernel" -
  // while that turn existed two processes away. Two halves live here, and BOTH are needed:
  //   ① `noteSharedTurn`, called by `open()` (the one place a turn is minted), hands the fact to the `turnLedger` seam.
  //      Its promise is TRACKED and can never reject (an `open()` with no delivery would otherwise arm an unhandled
  //      rejection) and its failure is COUNTED - never silently dropped.
  //   ② `settleSharedTurn`, called by `deliverTurn` BEFORE `deliver`, awaits it - so "the prompt has been handed out"
  //      implies "the fact is in the shared fold". Without this the whole thing is a race: the parent kernel opens the
  //      chair's turn and the child kernel reads the fold a millisecond later.
  // The GATE is not touched: a seat that never ran a turn is still refused (`tests/vmu-run35-chair-act.test.mjs` asserts
  // that counterfactual), because the ledger only ever records a turn that really was opened.
  const ledgerWrites = new Map()
  const ledgerFail = (turn, e) => {
    counts.ledgerFailed += 1
    counts.ledgerLastFail = { at: Date.now(), turn: turn && turn.id ? turn.id : null,
      member: turn && turn.member ? String(turn.member) : null,
      code: e && e.code ? String(e.code) : null,
      message: e && e.message ? String(e.message).slice(0, 400) : String(e),
      means: 'the shared turn ledger (durable key `turns`) did not record this turn. A sibling kernel reads that key to answer "has this seat taken a turn", so while it is missing the gate cannot see this turn from another instance. Read `ledgerSkipped` for the one case that is not a failure (a store that was never opened)' }
    return counts.ledgerLastFail
  }
  const noteSharedTurn = (turn) => {
    if (!turnLedger || typeof turnLedger.record !== 'function') return
    let pending = null
    try {
      pending = turnLedger.record({ id: turn.id, member: turn.member, phase: turn.phase, round: turn.round, at: turn.at })
    } catch (e) {
      // A seam that throws SYNCHRONOUSLY is the same event as one that rejects: counted, attributed, and never allowed
      // to break `open()` (a turn that exists in memory must stay usable; the READER side simply will not see it).
      ledgerFail(turn, e)
      return
    }
    if (!pending || typeof pending.then !== 'function') return   // a seam that returns no promise has nothing to await
    ledgerWrites.set(turn.id, Promise.resolve(pending).then(
      () => { counts.ledgerRecorded += 1; return { ok: true } },
      (e) => {
        // "the store is not open" is a DEGRADED INSTANCE, not a corrupted one: `createKernel({ root })` builds a store
        // but only the entry's `ready()` opens it, so a unit test or a host that never opens it has no durable layer at
        // all. Refusing a turn for that would break every such caller for a benefit none of them can use; the skip is
        // COUNTED (`ledgerSkipped`), and the reader side falls back to memory - which is the historical behaviour.
        if (e && e.code === 'VMU_STORE_FAILED' && /not open/.test(String(e.message))) { counts.ledgerSkipped += 1; return { ok: true, skipped: 'store-not-open' } }
        ledgerFail(turn, e)
        return { ok: false, error: e }
      }))
  }
  const settleSharedTurn = async (turn) => {
    const pending = turn && turn.id ? ledgerWrites.get(turn.id) : null
    if (!pending) return null
    ledgerWrites.delete(turn.id)
    return await pending
  }
  const lastRefusal = { code: null, message: null }
  // ROUND 4 / F11: the attribution of the MOST RECENT delivery (`childId` + `stopReason`), so a caller can ask who a
  // receipt belongs to without re-reading the host handle.
  let lastAttribution = { childId: null, stopReason: null, deliveryPath: null, attribution: 'no turn has been delivered yet' }
  // ★★ ROUND 57 (F-41b): WHICH MEMBER THE SLOT BELONGS TO. `lastAttribution` described HOW a delivery went (route,
  // child id, stop reason) and never said WHO it went to, so the one record the engine keeps could not answer "whose
  // turn was the last one?". Recorded where the turn is handed to the seam (so a FAILED delivery is attributed to the
  // member it was attempted for, not to nobody).
  let lastAttributionMember = null
  const memberSessions = new Map()
  // ★ LIVE RUN 115 (F-115a): the map above is member -> child session, and it lived ONLY in this instance's memory.
  // A member turn runs in its OWN kernel (activation delivery), so the child could not answer "which member am I?" —
  // measured: `vibe_v5_hire` called from r-1's own turn recorded `hiredBy:null` with the note "this call ran outside a
  // member turn", and `vibe_v5_fire` then reported `ownership:"unrecorded"` for the very temp worker that member had
  // hired. The reverse direction (child session -> member) is the fact a TOOL CALL can be checked against, so it is
  // kept, and the kernel writes it to the shared fold (onMemberSession) so later kernels can read it.
  const sessionOwners = new Map()
  let visibleToolsFor = null
  let seq = 0
  // ★ ROUND 79: which member the most recent caller-supplied reply answers, so the closure vote is recorded against
  // THAT member rather than against whoever the next step happened to wake.
  let lastReplyForMember = null
  /**
   * ★★★★★★★ LANE turn-reply: THE STRUCTURED REPORT SLOT — ONE slot, because a member turn can report ONCE (a second
   * report for the same open turn is `VMU_TURN_REPLY_CONFLICT`, not a silent overwrite). It is filled by the `reply` op
   * on the turn tool (`supplyStructuredReply`) and consumed exactly once, by the step/drive that answers that prompt —
   * so a report can never be applied twice and can never leak into another member's turn.
   */
  let structuredReport = null
  /**
   * The turn between `assemble()` and the end of its delivery. A member playing its OWN turn calls the reply tool while
   * `deliver()` is still awaiting it (the subagent route), and this is how the kernel knows WHICH turn that call answers
   * without being told — the same reason the caller-played seam keeps `pendingPrompt`.
   */
  let inFlightTurn = null
  /**
   * ★★★ LIVE RUN 51 (the institute own report, item 3): the assembled member prompt was UNREADABLE in activation
   * mode. `tools/turn.js` caches the text only when the receipt carries `memberPrompt.text`, and an activation receipt
   * carries no such field (the text went to the child session) - so after four settled rounds the cache was EMPTY and
   * `op:"prompt"` refused with "no retained turn" while the same tool promises paged access. The assembled text is a
   * KERNEL fact (the kernel built it), so the kernel keeps it: a bounded archive keyed by turn id, written on BOTH
   * delivery paths. The face reads it when its own cache misses; nothing about the receipt shape changes.
   */
  const PROMPT_ARCHIVE_CAP = 12
  const promptArchive = new Map()
  const archivePrompt = (turnId, member, text) => {
    const id = turnId === undefined || turnId === null || turnId === '' ? null : String(turnId)
    if (id === null || typeof text !== 'string' || text === '') return null
    promptArchive.delete(id)
    promptArchive.set(id, { turnId: id, member: member === undefined || member === null ? null : String(member), chars: text.length, text })
    while (promptArchive.size > PROMPT_ARCHIVE_CAP) promptArchive.delete(promptArchive.keys().next().value)
    return id
  }

  const fail = (code, message, hint) => { counts.refused += 1; lastRefusal.code = code; lastRefusal.message = message; throw refuse(code, message, hint) }

  /**
   * ★★★ ROUND 30 / task-19: READ THE STATUS BOARD FOR THIS TURN. The precedence is the seam's:
   *   1. `statusSources` as a FUNCTION — the caller owns the board (a pack with its own ledger, or a test);
   *   2. `statusSources` as a BAG `{ tasks, records }` — the caller injects the two ledgers;
   *   3. the DECLARED read legs on `faces` (`STATUS_BOARD_READ_OPS`) — what a real kernel gets for free, because
   *      `facesFrom` binds them from the same service bag the write faces come from.
   * A source that throws, or a function that returns something that is not the `statusBoardReadings` shape, is a
   * NAMED refusal: the alternative is rendering a board nobody produced, which is the defect this row removes.
   */
  const statusReadingsFor = async (turn) => {
    const member = turn && typeof turn.member === 'string' ? turn.member : null
    if (typeof statusSources === 'function') {
      let out = null
      try { out = statusSources({ turn, faces, member, settings }) } catch (e) {
        fail('VMU_ENGINE_UNAVAILABLE', 'the status board source failed for ' + String(member) + ': ' + String((e && e.message) || e),
          'a status board source must return the statusBoardReadings shape ({ fields: [{ key, label, value|why }] }); the assembly refuses rather than rendering a board nobody produced')
      }
      if (isPromise(out)) {
        try { out = await out } catch (e) {
          fail('VMU_ENGINE_UNAVAILABLE', 'the async status board source failed for ' + String(member) + ': ' + String((e && e.message) || e),
            'a status board source must resolve to the statusBoardReadings shape or reject; a rejected board is named, never rendered empty')
        }
      }
      if (!out || !Array.isArray(out.fields)) {
        fail('VMU_ENGINE_UNAVAILABLE', 'the status board source returned no fields for ' + String(member),
          'return statusBoardReadings(...) (or the same shape); the four fields must be named even when they are unavailable')
      }
      return out
    }
    const bag = statusSources && typeof statusSources === 'object' ? statusSources : null
    const taskFace = (bag && bag.tasks) || (faces && faces['vmu.tasks']) || null
    const recordFace = (bag && bag.records) || (faces && faces['vmu.records']) || null
    // ★★★ ROUND 54: ask the getter here, per render. `statusBoardReadings` needs a plain string (it has no business
    // knowing how a kernel learns its name), and a context that refuses to answer becomes "unnamed", never a crash.
    const kernelNow = typeof kernelSession === 'function'
      ? (() => { try { const v = kernelSession(); return typeof v === 'string' && v !== '' ? v : null } catch { return null } })()
      : kernelSession
    // ★★ ROUND 101: the four lines are a READING, so the prompt path must say WHEN it read them. D5 taught
    // statusBoardReadings to carry `at`, but this call site - the one that actually builds a member's
    // `[状态板]` - never passed it, so every line came out with `at: null` and the member correctly reported
    // (run 99) that no line carried a read time. The mechanism existed; its ONLY production caller did not use
    // it. Passed here (not inside the function) because the orchestrator owns the clock: one read, one clock.
    // ★★ ROUND 102: the prompt path must NOT print when we looked. `vmu-assistant-e2e` compares two assemblies of the
    // same round byte for byte (that is what makes a prompt diff readable), and a read clock makes every assembly
    // unique. Time therefore comes from the CONTENT (a record carries `updatedAt`) or the row says why it has none -
    // `timeWhy` - instead of borrowing the moment of reading as if it were the moment of the fact.
    return statusBoardReadings({ tasks: taskFace, records: recordFace, member, settings, limit: STATUS_BOARD_DEFAULT_LIMIT, kernel: kernelNow })
  }

  /** ① open a turn: who, which round, which phase, which task. */
  // ★★★ R13 (third pass, the part that made the earlier fix REAL): `rosterIds` and `chairId` were carried by the seam
  // and merged into the call, but THIS literal dropped them - so `turn.rosterIds` was always undefined inside the prompt
  // policy and the leader pair fell back to "leaderless" on every turn. Measured: a spy policy saw the turn's keys as
  // [id, member, role, roleLabel, phase, task, why, nextStep, roster, quorum, statusBlock, facts, meetingState,
  // formalStatus, round, at] with NO rosterIds/chairId, while the unit tests (which call `decideSections` directly)
  // stayed green. A fact the caller supplies must travel all the way, or the unit test is testing a shape nobody sends.
  const open = ({ member, role = null, roleLabel = null, phase, task = null, why = null, nextStep = null, roster = null, rosterIds = null, chairId = null, quorum = null, statusBlock = null, facts = null, meetingState = null, formalStatus = null, round = 1 } = {}) => {
    if (typeof member !== 'string' || member.trim() === '') fail('VMU_INVALID_ARGUMENT', 'a turn needs a member', 'pass { member, phase }')
    const knownPhases = extraPhases && extraPhases.length ? PHASES.concat(extraPhases) : PHASES
    if (typeof phase !== 'string' || !knownPhases.includes(phase)) {
      fail('VMU_INVALID_ARGUMENT', 'unknown phase: ' + String(phase), 'known phases: ' + (extraPhases && extraPhases.length ? PHASES.concat(extraPhases) : PHASES).join(', '))
    }
    seq += 1
    // R1 ZERO POLICY (round 466): `roleLabel` BELONGS IN THIS LIST. It was missing, so `turn.roleLabel` was always
    // undefined and the kernel had to carry a map of institution role names to fill the heading at all - the display
    // name and the framework's vocabulary were entangled by a MISSING FIELD, not by a design choice. With the field
    // carried, the caller owns the name (the pack supplies it in real use) and the kernel holds none of an
    // institution's words. A caller that supplies nothing gets the KEY it passed.
    const turn = { id: 't-' + seq, member, role, roleLabel, phase, task, why, nextStep, roster, rosterIds, chairId, quorum, statusBlock, facts, meetingState, formalStatus, round, at: clock() }
    turns.set(turn.id, turn)
    woken.set(member, (woken.get(member) || 0) + 1)
    counts.opened += 1
    // ★★★★★★★ ROUND 35 / task-24: announce the turn to the SHARED ledger (see `noteSharedTurn` above). It happens at
    // OPEN, not at delivery, deliberately: `memberTurnCount` - the in-memory reader the gate used before this round -
    // counts OPENED turns, so the durable reader and the memory reader must agree by construction. Otherwise the same
    // member could be "has a turn" in one kernel and "has none" in its sibling, which is the run-35 failure itself.
    noteSharedTurn(turn)
    return { ok: true, turn }
  }

  /** ② assemble the prompt THROUGH THE PIPELINE. This module never builds prompt text itself. */
  const assemble = async (turn) => {
    if (!prompt || typeof prompt.assemble !== 'function') {
      fail('VMU_ENGINE_UNAVAILABLE', 'no prompt pipeline is wired: the turn loop delegates assembly and never composes text itself',
        'inject { prompt: createPromptPipeline(...) } (docs/26 §2 stage 2)')
    }
    // The role travels with the member, so a template section can address THIS member (docs/26 section 3.1).
    // `roleLabel` is the human name the source's kindLabel produces for every heading (docs/26 section 3.13). It is
    // deliberately separate from `role`, which is the KEY that bindings select on: mixing display text into a binding
    // would make the assembly depend on wording.
    // R1 ZERO POLICY (round 465): these labels used to live here, and the rule forbids exactly that - the kernel must
    // not know an institutions vocabulary. They are a DISPLAY variable (kernel/prompt VARIABLE_WHITELIST), selected by
    // nothing: role selects sections, roleLabel is what a reader sees, which is what the packs headings interpolate.
    // So the caller supplies the name, as the pack does in real use, and a caller that supplies none gets the KEY.
    const roleLabel = turn.roleLabel || turn.role
    // ROUND 366: the resolved settings travel WITH the assembly context, because `{{ setting:... }}` resolves from
    // `ctx.settings` - so a real round, not just a hand-made call, can be tuned from configuration.
    // ROUND 382: per-turn FACTS are merged OVER the resolved settings, so a section can read something that is only
    // true of THIS turn - the current meeting number, whether a leader is actually on staff - without a second
    // variable channel and without freezing a value that changes. Static configuration stays the floor; the turn
    // overrides what it knows. Nothing is mutated: a fresh object is built per assembly.
    // The notices for THIS member are taken here and appended to the status block, which is where the source puts them:
    // inside the per-round brief. Taking them is what makes the announcement one-shot, and it happens on the same call
    // that delivers the prompt, so a notice cannot be skipped by a phase that builds a different status block.
    const pendingNotices = drainNotices(turn.member)
    // ROUND 7 / task-54 (F44): plus whatever an EXTERNAL source has for this member (e.g. the Lean face's durable
    // notice queue). Both channels are drained on the SAME call that delivers the prompt, so neither can be skipped by
    // a phase that builds a different status block; a source that throws is NAMED and does not break the assembly.
    if (typeof noticeSource === 'function') {
      try {
        const extra = noticeSource(turn.member)
        if (Array.isArray(extra)) for (const l of extra) if (typeof l === 'string' && l.trim() !== '') pendingNotices.push(l)
      } catch (e) {
        fail('VMU_ENGINE_UNAVAILABLE', 'the notice source failed for ' + String(turn.member) + ': ' + String((e && e.message) || e),
          'a notice source must return an array of lines; the assembly refuses rather than dropping the announcement silently')
      }
    }
    // With a noticeBlock the notices are PREPENDED as their own block and kept OUT of the status block, because that
    // is what the corpus shows: a header, indented notice lines, a blank line, then the round heading. Without one
    // they join the status block, which is the framework's own fallback rather than an institution's wording.
    const noticeText = pendingNotices.length && typeof noticeBlock === "function"
      ? String(noticeBlock(pendingNotices) || "")
      : ""
    const suppliedStatus = (noticeText ? [turn.statusBlock] : [turn.statusBlock, ...pendingNotices])
      .filter((l) => typeof l === "string" && l.trim() !== "").join("\n")
    // ★ R15: a caller that supplies nothing gets the loop's own composition instead of a hole; a caller that DOES
    // supply one keeps full control (the pack words its own brief), so this is a fallback and not a second source.
    // ★ ROUND 30 / task-19: and when the loop does compose, the board is READ ONLY THEN - a caller that supplied its
    // own statusBlock triggers no ledger read at all (byte-identical behaviour for every pack-supplied brief).
    const statusWithNotices = suppliedStatus !== "" ? suppliedStatus : composeStatusBlock(turn, await statusReadingsFor(turn))
    const turnSettings = (settings || turn.facts) ? { ...(settings || {}), ...(turn.facts || {}) } : undefined
    // ROUND 407: THE FRAMEWORK OFFERS THE MECHANISM; THE PACK STATES THE POLICY (goal 2). Which optional blocks an
    // institution switches on, which reply catalogue it sends, which meeting speaker state applies and which
    // formalisation status line is shown are INSTITUTION preferences, so the loop no longer contains them: it asks
    // the policy it was given. Declared as a factory parameter on purpose - an undeclared name would make
    // `typeof sectionPolicy` return "undefined" and the policy would silently never run.
    if (prompt && typeof prompt.disable === "function" && typeof sectionPolicy === "function") {
      const decided = sectionPolicy({ settings: turnSettings || {}, turn })
      for (const e of (decided && decided.errors) || []) fail(e.code, e.message, e.hint)
      for (const d of (decided && decided.decisions) || []) setSectionEnabled(d.name, d.enabled !== false)
    }
    const out = await prompt.assemble({ member: turn.member, role: turn.role, roleLabel, phase: turn.phase, task: turn.task, roster: turn.roster, quorum: turn.quorum, statusBlock: statusWithNotices, round: turn.round, settings: turnSettings })
    if (!out || out.ok !== true) {
      fail('VMU_TURN_ASSEMBLY_FAILED', 'the prompt pipeline refused this turn: ' + JSON.stringify((out && out.refused) || {}).slice(0, 160))
    }
    counts.assembled += 1
    // ★ v3 SLV: the status block is TURN DATA, not institution prose. The pipeline may render it through a section
    // (v5r does); when NO section rendered it, append it literally here so the member still receives it. Sections
    // that carry a '{{' placeholder are forbidden by the prompt gate, so this is the template-free route.
    let assembledText = (noticeText ? noticeText + "\n" : "") + out.text
    if (statusWithNotices && !assembledText.includes(statusWithNotices)) {
      assembledText += "\n\n【本轮状态块】\n" + statusWithNotices
    }
    let withVisible = assembledText
    // ★ PHASE 7 (goal 3): the REAL visible tool names from the host's schemas - never from a declaration. An absent or
    // empty answer adds NOTHING (zero mechanism: no empty header).
    if (typeof visibleToolsFor === 'function') {
      let visible = null
      try { visible = visibleToolsFor(turn.member) } catch { visible = null }
      if (Array.isArray(visible)) { visibleToolsByMember.set(String(turn.member), visible.slice()); toolVotedThisTurn.delete(String(turn.member)) }
      if (Array.isArray(visible) && visible.length > 0) withVisible += "\n\n【本轮可用工具】" + visible.slice(0, 80).join('、')
    }
    // ★ PHASE 9 / round 7: the per-turn instruction (`why`, the thing `step` was asked to make the member do) used to
    // live only on the turn object and in the HOST wake spec — it never entered the prompt, so an instruction-only
    // round (e.g. "only wait once") was blind. Carry it as its own block, and let the receipt say whether it was there.
    const instruction = typeof turn.why === 'string' && turn.why.trim() !== ''
      ? turn.why.trim()
      : (typeof turn.nextStep === 'string' && turn.nextStep.trim() !== '' ? turn.nextStep.trim() : '')
    if (instruction) withVisible += '\n\n【本轮指令】' + instruction.slice(0, 4000)
    return { ok: true, text: withVisible, sources: out.sources || [], truncation: out.truncation || null,
      instructionDelivered: instruction !== '' }
  }

  /**
   * ★★★★★★★ TASK-13 / LIVE RUN 31 — THE TURN IS HANDED THE CHILD SESSION THE MEMBER ALREADY HAS.
   *
   * THE DEFECT, IN THE INSTITUTE'S OWN WORDS. Run 31 delivered twelve member turns; the office then read the session list
   * and found acad-01 and res-01 each running in TWO DIFFERENT child sessions. Each "turn" of a member therefore began
   * with no memory of the turn before it — of the progress it had archived, or of the routes it had already tried — which
   * is precisely what v5r asks a researcher to carry (independent advancement, archived progress, attempted routes). The
   * kernel was not blind to the sessions: `memberSessions` already holds the child id learned from each settled turn
   * (:1135 and :2541), and `vibe_vmu_tools`/`vibe_v5_tool_help` already read it. Nothing ever put it on a TURN.
   *
   * WHY THE OFFER TRAVELS INSIDE `turn`. The host bridge creates the deliverer and calls it as
   * `deliverer({ turn, text })` — a third argument added to `deliver(...)` would be dropped before the seam ever saw it.
   * `turn` is forwarded verbatim, so the offer is a property of the turn: it is created HERE (one place computes it, from
   * the same map every reader uses), and `deliverViaSubagents` reads it off the turn it receives. That is the smallest
   * change that reaches production, and it adds no new continuation store, no new verb and no second reading.
   */
  const continuationOfferFor = (turn) => {
    const member = turn && typeof turn.member === 'string' && turn.member !== '' ? turn.member : null
    if (member === null) return null
    let session = null
    try { session = memberSessions.get(member) || null } catch { session = null }
    if (session === null || session === '') return null
    return {
      session: String(session),
      learnedFrom: 'memberSessions (the child session an earlier settled turn of this member ran in, in THIS kernel instance)',
      means: 'the child session this kernel already holds for "' + member + '". A delivery seam that CAN continue a session may run this turn there instead of starting a fresh child; a seam that cannot must say so in its returned `continuation` reading (applied/why/fix), so a receipt never implies continuity that did not happen. If the seam ignores this offer, the turn runs in a NEW child and the member has no cross-turn memory — that is the run-31 defect, and the receipt now names it',
    }
  }

  /**
   * ★ TASK-13 — ONE SHAPE FOR THE CONTINUATION READING, ON EVERY DELIVERY SHAPE (settled, caller-played, bare string).
   * `offered` is what this kernel knew BEFORE the turn (null = nothing learned yet, so continuations were impossible);
   * `applied` is the seam's OWN claim that it really ran the turn in that session; `why`/`fix` are the seam's named
   * reason when it could not. An absent seam reading is reported as UNREADABLE, never as "did not continue": those are
   * different findings and run 31 needed that distinction.
   */
  const continuationReceipt = (offer, delivered) => {
    const seam = delivered && typeof delivered === 'object' && delivered.continuation && typeof delivered.continuation === 'object'
      ? delivered.continuation : null
    const offered = offer && typeof offer.session === 'string' && offer.session !== '' ? offer.session : null
    const ranIn = delivered && typeof delivered === 'object' && typeof delivered.childId === 'string' && delivered.childId !== ''
      ? delivered.childId : null
    return {
      offered,
      offeredMeans: offered === null
        ? 'nothing had been learned for this member before this turn, so no continuation could be offered (this turn necessarily started a fresh child)'
        : (offer && offer.means ? offer.means : null),
      applied: seam !== null && seam.applied === true,
      ranIn,
      // ★ a COMPARISON, not a claim: true only when the session the turn actually ran in IS the offered one; null when
      // either side is unreadable ("unknown" is not "started fresh").
      reused: offered === null || ranIn === null ? null : String(ranIn) === String(offered),
      how: seam && typeof seam.how === 'string' ? seam.how : null,
      cause: seam && typeof seam.cause === 'string' && seam.cause !== ''
        ? seam.cause
        : (offered === null ? 'nothing-learned-yet' : (seam === null ? 'seam-reported-no-continuation' : null)),
      why: seam && typeof seam.why === 'string' && seam.why !== ''
        ? seam.why
        : (offered === null
            ? 'no child session had been learned for this member yet, so this turn necessarily started a fresh child'
            : 'the delivery seam returned no `continuation` reading at all, so whether this turn ran in the offered session is UNREADABLE from this return — not evidence that it started fresh, and not evidence that it continued'),
      fix: seam && typeof seam.fix === 'string' && seam.fix !== '' ? seam.fix : null,
      // ★ TASK-16 / 裁决 1: when a resume FAILED and the turn was therefore downgraded explicitly, the host's own error
      // code travels here. `cause` says what class of failure it was (`resume-failed` / `resume-no-reply` /
      // `no-reply-capable-resume`); `hostCode` says which host refusal produced it, so the fix is addressable.
      hostCode: seam && typeof seam.hostCode === 'string' && seam.hostCode !== '' ? seam.hostCode : null,
      // ★ TASK-16: the seam's MEASURED host facts travel on the same reading — which session was named, which
      // continuation verbs the host actually offers, and which piece of the composed reply-capable resume this
      // deployment is missing. A boundary that cannot be read is a boundary nobody can fix.
      session: seam && typeof seam.session === 'string' && seam.session !== '' ? seam.session : offered,
      hostVerbs: seam && Array.isArray(seam.hostVerbs) ? seam.hostVerbs.slice() : null,
      capability: seam && seam.capability && typeof seam.capability === 'object' ? seam.capability : null,
    }
  }

  /** ③ deliver through the adapter seam. A missing adapter is refused, never faked. */
  const deliverTurn = async (turn, text) => {
    if (typeof deliver !== 'function') {
      fail('VMU_ENGINE_UNAVAILABLE', 'no delivery adapter is wired: refusing rather than pretending the member answered',
        'inject { deliver: async ({ turn, text }) => reply } (docs/26 §2 stage 3)')
    }
    // ★★★★★★★ ROUND 35 / task-24: THE FACT MUST BE DURABLE BEFORE THE PROMPT LEAVES (see `noteSharedTurn`). A ledger
    // write that did not land is a NAMED refusal rather than a best-effort log line: handing this member a prompt while
    // the shared fold says it never had a turn re-opens the run-35 hole one instance over - the member would convene
    // from ITS session and be refused by name for a turn that plainly happened. The refusal is the seam's OWN refusal,
    // unchanged (this face never rewrites a seam's error into something friendlier), so the code registry is untouched:
    // a store failure keeps `VMU_STORE_FAILED`.
    const ledger = await settleSharedTurn(turn)
    if (ledger && ledger.ok !== true) {
      const cause = ledger.error && typeof ledger.error === 'object' ? ledger.error : null
      fail(cause && cause.code ? String(cause.code) : 'VMU_STORE_FAILED',
        'the shared turn ledger did not record the turn for ' + String(turn && turn.member) + ', so the prompt was NOT handed out: ' + String(cause && cause.message ? cause.message : cause),
        'the `turns` fold is what lets a SIBLING kernel (a member child session) see that this seat has taken a turn; `kernel/index.js` wires that seam over the durable store. Fix the store root/write path and retry this turn (docs/03 §6 `turns`)')
    }
    let delivered
    lastAttributionMember = turn && turn.member ? String(turn.member) : null
    // ★★★★★★★ TASK-13: the offer is computed ONCE, here, from the map every reader already uses, and it travels INSIDE
    // `turn` — see `continuationOfferFor` above for why a third argument to `deliver` would never reach the seam.
    const continuation = continuationOfferFor(turn)
    // ★ F-116a (run 116): THE CHILD ID IS A FACT THE MOMENT THE CHILD STARTS, SO IT IS LEARNED THEN. The learning point
    // after the reply settles (see the block further down) is too LATE for the member's own first turn: measured on a
    // real machine, r-1's first hire answered `hiredBy:null` and r-2's first fire answered `caller:null,
    // callerUnknown:true` — every tool call of that turn ran while this kernel's map was still empty, and a member that
    // cannot be named in its own first turn cannot be attributed at all. The seam reports the id through
    // `turn.onChild` (channel choice: `host-deliver.js` forwards `turn` verbatim and drops extra arguments, which is
    // the same reason the continuation offer travels inside `turn`).
    const learnChild = (child) => {
      const childId = String(child === undefined || child === null ? '' : child)
      if (childId === '' || !turn || typeof turn.member !== 'string') return
      sessionOwners.set(childId, String(turn.member))
      memberSessions.set(turn.member, childId)
      try { if (typeof onMemberSession === 'function') onMemberSession(String(turn.member), childId) } catch { /* attribution is a convenience, never a blocker */ }
    }
    const turnForDeliver = Object.assign({}, turn, { onChild: learnChild })
    if (continuation !== null) turnForDeliver.continuation = continuation
    try {
      delivered = await deliver({ turn: turnForDeliver, text })
    } catch (e) {
      // ★ RUN 12 item 1: attribute the stall. The timeout the seam raises already carries turn/member/waitedMs/
      // lastPhase; what it could NOT say was WHICH delivery path was attempted, and the status counters said
      // nothing at all. Both are recorded here, and the error is rethrown UNCHANGED (this face never rewrites the
      // seam's refusal into something friendlier).
      counts.deliveryFailed += 1
      counts.deliveryLastFail = {
        at: Date.now(),
        turn: turn && turn.id ? turn.id : null,
        member: turn && turn.member ? String(turn.member) : null,
        code: e && e.code ? String(e.code) : null,
        message: e && e.message ? String(e.message).slice(0, 400) : String(e),
        deliveryPath: (e && e.deliveryPath) || lastAttribution.deliveryPath || null,
        stillRunning: !!(e && e.stillRunning === true),
        means: 'the delivery seam threw, so this turn is neither delivered nor answered: it is NOT counted in delivered, parsed or notExecuted. Counts alone will not show it again — read deliveryLastFail' }
      throw e
    }
    counts.delivered += 1
    // ROUND 4 / F11: the adapter may hand back a BARE STRING (the pre-round-4 contract) or the attributed envelope
    // `{ reply, childId, stopReason, attribution }` that `deliverViaSubagents` now produces. A bare string is accepted
    // and NAMED as unattributed - the loop never invents a child id or a stop reason.
    if (typeof delivered === 'string') {
      lastAttribution = { childId: null, stopReason: null, deliveryPath: null,
        attribution: 'the delivery adapter returned a bare string: no childId/stopReason (docs/26 §3.22)',
        // ★ TASK-13: a bare string carries no reading of its own, so the continuation reading is built from the offer
        // (what this kernel knew) and states that the seam said nothing — never that it "started fresh".
        continuation: continuationReceipt(continuation, null) }
      return delivered
    }
    const reply0 = delivered && typeof delivered.reply === 'string' ? delivered.reply : null
    // ★★★ ROUND 73: A CALLER-PLAYED TURN IS NOT A FAILURE. When the seam is `deliverByReturning`, the reply is
    // deliberately null on the prompting call - the assembled prompt has been handed back to the calling session, which
    // will play the member turn and return the answer on the next call. Treating that as "the adapter handed back no
    // reply" would make the one route that needs no host Agent indistinguishable from a broken host. The awaiting
    // envelope therefore travels through UNCHANGED, and `run` returns it rather than parsing an empty answer.
    if (delivered && delivered.awaiting === true) {
      lastAttribution = { childId: null, stopReason: null, deliveryPath: 'caller', attribution: 'the CALLING session plays this member turn (deliverByReturning): the assembled prompt was handed back, and the reply arrives on the next call' }
      return { awaiting: true, memberPrompt: (delivered && delivered.memberPrompt) || null, reply: null, deliveryPath: 'caller',
        // ★ TASK-13: the caller-played route can neither continue nor be read as having continued, and it must not be
        // silent about it: the caller holds the member's prompt and can choose to play it in the member's learned session.
        continuation: continuationReceipt(continuation, delivered) }
    }
    const reply = reply0
    // ★★★ ROUND 79: THE REPLY IS RECORDED AGAINST THE MEMBER IT ANSWERS, NOT AGAINST THIS TURN'S MEMBER. The
    // pending prompt belonged to one member; the wakeup policy may address the NEXT step to another. Recording it
    // against `turn.member` put a truthful vote on the wrong person and left the real voter reported missing.
    const replyForMember = delivered && delivered.forMember ? String(delivered.forMember) : null
    lastReplyForMember = replyForMember
    lastAttribution = {
      // ★ ROUND 88: WHICH ROUTE DELIVERED, reported by the seam itself (host bridge or caller-played).
      deliveryPath: (delivered && delivered.deliveryPath) || null,
      childId: (delivered && delivered.childId) || null,
      stopReason: (delivered && delivered.stopReason) || null,
      attribution: (delivered && delivered.attribution) || 'the delivery adapter returned an envelope without an attribution note',
      // ★★★★★★★ LIVE RUN 2026-10-25 (the institute's own reading): a HARVESTED late delivery was only READABLE, not
      // COUNTABLE - `deliveredLate:true` and the three millisecond windows lived on the seam's return value and were
      // dropped here, so the receipt's `delivery` object carried five keys and none of them was the late fact. A reader
      // had to parse an English sentence out of `attribution` to recover 193074 / 180000 / 45000. Numbers travel as
      // numbers: they are copied through when the seam reported them, and stay absent (not zero) when it did not.
      deliveredLate: delivered && delivered.deliveredLate === true ? true : null,
      deliveryWaitedMs: delivered && Number.isFinite(delivered.deliveryWaitedMs) ? delivered.deliveryWaitedMs : null,
      deliveryDeadlineMs: delivered && Number.isFinite(delivered.deliveryDeadlineMs) ? delivered.deliveryDeadlineMs : null,
      deliveryGraceMs: delivered && Number.isFinite(delivered.deliveryGraceMs) ? delivered.deliveryGraceMs : null,
      // ★★ LIVE RUN 47: the SEAT reading (`childPreset`) lives on the seam's envelope and was dropped here, so the
      // one field that answers "did the member preset reach the child" could only be recovered from a 15-minute
      // transcript histogram. It travels now, on every route, with the meaning attached.
      childPreset: delivered && typeof delivered.childPreset === 'string' ? delivered.childPreset : null,
      childPresetMeans: delivered && typeof delivered.childPresetMeans === 'string' ? delivered.childPresetMeans : null,
      // ★★★★★★★ ROUND 32 / F8: whether the activation behind this turn was KEPT RESIDENT for a possible continuation
      // or torn down with its reply. Run 32 could not tell "the host refused the resume" from "we disposed the child
      // before the resume was attempted" — so the seam's own answer travels to the receipt (and to `deliveryFromAttribution`).
      residency: delivered && typeof delivered.residency === 'string' ? delivered.residency : null,
      residencyMeans: delivered && typeof delivered.residencyMeans === 'string' ? delivered.residencyMeans : null,
      // ★★★★★★★ TASK-13 / LIVE RUN 31: did this turn CONTINUE the member, or start it over? This is the reading the
      // institute had to reconstruct from the session list after the run, and could not: `offered` is the session this
      // kernel already held for the member, `ranIn` is where the turn actually ran (`delivery.childId`), `reused` is the
      // comparison, and `why`/`fix` name the boundary when the seam could not continue.
      continuation: continuationReceipt(continuation, delivered),
    }
    if (lastAttribution.childId && turn && typeof turn.member === 'string') {
      memberSessions.set(turn.member, lastAttribution.childId)
      sessionOwners.set(String(lastAttribution.childId), String(turn.member))
      try { if (typeof onMemberSession === 'function') onMemberSession(String(turn.member), String(lastAttribution.childId)) } catch { /* attribution is a convenience, never a blocker */ }
    }
    if (reply === null) {
      fail('VMU_ENGINE_UNAVAILABLE', 'the delivery adapter returned no reply text',
        'return a string, or { reply, childId, stopReason } (docs/26 §3.22)')
    }
    return reply
  }

  /**
   * ★★★★★★★ LANE turn-reply — WHICH MEMBER TURN IS OPEN RIGHT NOW, AND HOW DO WE KNOW?
   *
   * Two routes, checked in the order they can be true, and BOTH come from state the loop already keeps:
   *   · in-flight delivery — a real member Agent is answering its prompt RIGHT NOW (the subagent route). The turn is in
   *     `inFlightTurn`, set for the whole duration of `runFrom`'s delivery;
   *   · pending prompt    — the calling session played the turn and the seam is holding the assembled prompt
   *     (`deliverByReturning`). That is the same `pending()` the status reading uses.
   * Returns null when NO turn is open. That is the ONLY case where a report is refused (`VMU_TURN_NO_PENDING_MEMBER`),
   * and it is a refusal rather than an invention: a tool call that arrives outside a turn must not CREATE one, because a
   * turn has a member, a phase and a prompt, and none of those can be guessed from a tool call.
   */
  const openTurnForReport = () => {
    if (inFlightTurn && typeof inFlightTurn.member === 'string' && inFlightTurn.member !== '') {
      return { member: inFlightTurn.member, turnId: inFlightTurn.id || null, via: 'in-flight' }
    }
    const pending = deliver && typeof deliver.pending === 'function' ? deliver.pending() : null
    if (pending && typeof pending.member === 'string' && pending.member !== '') {
      return { member: pending.member, turnId: pending.turnId || null, via: 'pending-prompt' }
    }
    return null
  }

  /** Read back the report slot WITHOUT consuming it (the receipt and the `status`-side readback both use this). */
  const pendingStructuredReport = () => {
    if (!structuredReport) return null
    return {
      source: 'tool',
      member: structuredReport.member,
      turn: structuredReport.turnId,
      via: structuredReport.via,
      fields: Object.keys(structuredReport.reply),
      ignoredFields: structuredReport.ignoredFields.slice(),
      at: structuredReport.at,
    }
  }

  /**
   * Take the report for `member` (and for `turnId` when both sides know one), ONCE. A report for another member is left
   * alone: it belongs to a different turn and consuming it here would hand one member's words to another.
   */
  const takeStructuredReport = (member, turnId = null) => {
    if (!structuredReport) return null
    const want = member === null || member === undefined ? null : String(member)
    if (want !== null && structuredReport.member !== want) return null
    if (turnId !== null && turnId !== undefined && structuredReport.turnId !== null && structuredReport.turnId !== turnId) return null
    const taken = structuredReport
    structuredReport = null
    return taken
  }

  /**
   * ★ THE TOOL CHANNEL'S WRITE SIDE. Records ONE structured report against the OPEN member turn and answers with a
   * receipt that can be READ BACK (`readback` is the slot as it really stands, not a copy of the arguments - "the value
   * was set" and "the value took effect" are different claims, and this repository only makes the second one).
   */
  const supplyStructuredReply = (fields, { forMember = null, meeting = null } = {}) => {
    // ★ 用户裁决 B 第 2 步：所办可以为「成员的这一轮」指定它属于哪场会议。给了就让成员的那句 say 被记成
    // 成员本人的发言（onBehalf），没给就保持现状（进 notes，回执说明为什么没派发）。
    const boundMeeting = meeting === null || meeting === undefined || String(meeting).trim() === '' ? null : String(meeting).trim()
    const obj = fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : null
    if (!obj) {
      fail('VMU_INVALID_ARGUMENT', 'a structured report must be an object of reply fields, not ' + (fields === null ? 'null' : typeof fields),
        'pass the report as an object: { say: "…" } — fields: ' + known.concat(RECORDED_FIELDS).join(', '))
    }
    const open = openTurnForReport()
    if (!open) {
      // ★★★★★★★ LIVE RUN 28 (the institute's own report, item 3): the tool description calls op:"reply" 「首选」 and
      // this refusal said only "no member turn is open". MEASURED: under `activation`/`one-shot` delivery a member
      // turn SETTLES inside the step, so `pending` is null for the whole run and the "preferred" channel can never
      // open — the office retried it five times and learned nothing. The refusal now names WHICH delivery path this
      // kernel is on and what the reachable channel is, because "no pending member" is true on both paths but only one
      // of them makes it PERMANENT.
      const onCallerPath = (() => { try { const p = deliver && typeof deliver.pending === 'function' ? deliver.pending() : null; return p === null || typeof p !== 'object' ? null : (typeof p.deliveryPath === 'string' ? p.deliveryPath : null) } catch { return null } })()
      fail('VMU_TURN_NO_PENDING_MEMBER', 'no member turn is open, so there is nothing for this report to answer',
        'CHANNEL: `op:"reply"` answers an AWAITING prompt, and an awaiting prompt only exists on the CALLER delivery path (a step hands the prompt back with awaiting:true, and the reply answers it before the next step). Under `activation` or `one-shot` delivery the member\'s turn SETTLES INSIDE the step — nothing is ever left pending, so this channel is permanently unreachable and retrying it cannot work. REACHABLE INSTEAD: let the member vote inside its OWN turn (`op:"step"` whose next_step asks for the closure vote), which is what the receipts show as `effects:[{kind:"closure-vote"}]`; the fenced-json compatibility path is op:"step" with reply:"<one fenced json object>". Delivery path on this kernel right now: ' + (onCallerPath === null ? 'not reported (no pending state)' : '"' + onCallerPath + '"'))
    }
    const wanted = forMember === null || forMember === undefined ? null : String(forMember)
    if (wanted !== null && wanted !== open.member) {
      fail('VMU_INVALID_ARGUMENT', 'reply_for names ' + wanted + ' but the open member turn belongs to ' + open.member,
        'omit reply_for (the open turn names the member), or pass reply_for:"' + open.member + '"')
    }
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined)
    if (keys.length === 0) {
      fail('VMU_INVALID_ARGUMENT', 'the report carries no reply fields',
        'pass at least one of: ' + known.concat(RECORDED_FIELDS).join(', '))
    }
    const unknown = keys.filter((k) => !Object.prototype.hasOwnProperty.call(owners, k) && !RECORDED_FIELDS.includes(k))
    // The SAME field gate as `parse()`: one setting, two channels, so a deployment that refuses unknown names refuses
    // them whichever channel they arrive through.
    const unknownFieldMode = settings && settings['vmu.turn.unknownReplyFieldMode'] === 'refuse' ? 'refuse' : 'ignore-named'
    if (unknown.length && unknownFieldMode === 'refuse') {
      fail('VMU_TURN_UNKNOWN_FIELD', 'unknown reply field(s): ' + unknown.join(', ') + ' - refusing rather than guessing what was meant',
        'known fields: ' + known.concat(RECORDED_FIELDS).join(', '))
    }
    const recorded = { reply: {}, member: open.member, turnId: open.turnId, via: open.via, ignoredFields: unknown.slice(), meeting: boundMeeting, at: clock() }
    for (const k of keys) if (!unknown.includes(k)) recorded.reply[k] = obj[k]
    if (Object.keys(recorded.reply).length === 0) {
      // A report that carries ONLY unknown names would record an empty reply and then look like a turn with nothing to
      // dispatch. That is a refusal, not an empty report: the member meant to say something and none of it is readable.
      fail('VMU_TURN_UNKNOWN_FIELD', 'the report carries no field this loop accepts: ' + unknown.join(', '),
        'known fields: ' + known.concat(RECORDED_FIELDS).join(', ') + ' (vmu.turn.unknownReplyFieldMode=' + unknownFieldMode + ')')
    }
    if (structuredReport && structuredReport.member === recorded.member
      && (structuredReport.turnId === null || recorded.turnId === null || structuredReport.turnId === recorded.turnId)) {
      // ★ THE TWO-TRUTHS RULE, ENFORCED AT THE WRITE SIDE TOO: a second report for the SAME open turn is not an update.
      // Silently replacing the first would mean the member said two things and the kernel kept only the last.
      fail('VMU_TURN_REPLY_CONFLICT',
        'this member turn already carries a structured report (' + Object.keys(structuredReport.reply).join(', ') + '); a second one would be a second truth',
        'send the WHOLE report in ONE call; to correct it, finish this turn and report again in the next one - the kernel will not silently replace what the member already said')
    }
    structuredReport = recorded
    const readback = pendingStructuredReport()
    return {
      ok: true,
      accepted: true,
      source: 'tool',
      member: recorded.member,
      turn: recorded.turnId,
      fields: Object.keys(recorded.reply),
      meeting: recorded.meeting,
      meetingMeans: recorded.meeting === null
        ? 'this report was NOT bound to a meeting, so a bare say field cannot become a speech (it is kept, never silently dropped)'
        : 'this report was bound to the named meeting: the member\'s bare say field will be recorded as THAT MEMBER\'S speech when the held turn is applied (receipt carries onBehalf)',
      ignoredFields: recorded.ignoredFields.slice(),
      ignoredFieldMode: unknownFieldMode,
      // ★ READ BACK, NOT SET: this is the slot as it stands AFTER the write (member, turn, fields), so a caller can see
      // that the report really landed on the turn it thinks it did.
      readback,
      rule: 'tool report first, fenced json second: a field sent through both channels must agree, or the turn is refused by name (VMU_TURN_REPLY_CONFLICT)',
      // ★ PHASE 12 / run 34 item 4: `accepted:true` is about the WRITE, not about the effects. The institute reported
      // that a `vote_solved` in this reply left `closureVote.votesCast` unchanged, which reads like the vote was lost.
      // It is not lost - the field actions run when this half-turn is APPLIED - so the receipt now says when.
      countedLater: {
        when: 'the next `op:"step"` completes this held turn',
        why: 'this receipt RECORDS the report; the field actions it implies (including a closure vote) are carried out when the held turn is applied, so closureVote.votesCast moves on that step rather than here',
        fields: Object.keys(recorded.reply),
      },
    }
  }

  /**
   * Is there a report waiting for the prompt the caller is HOLDING (and has not answered with text)? Then the next
   * `step`/`drive` must COMPLETE that turn instead of opening a new one - otherwise every step would hand back another
   * prompt before the previous answer was ever dispatched, and a tool report could never be applied at all.
   */
  const awaitingStructuredReport = () => {
    const pending = deliver && typeof deliver.pending === 'function' ? deliver.pending() : null
    if (!pending || typeof pending.member !== 'string' || pending.member === '') return null
    // A text reply already supplied (awaiting()===false) goes through the normal path, where the two channels are merged.
    if (typeof deliver.awaiting === 'function' && deliver.awaiting() === false) return null
    if (!structuredReport || structuredReport.member !== pending.member) return null
    if (pending.turnId && structuredReport.turnId && pending.turnId !== structuredReport.turnId) return null
    return { pending, report: structuredReport }
  }

  /**
   * ROUND 4 / F9: talk to a member that is ALREADY running. The host semantics are the reason this is a seam and not a
   * loop feature: a running target receives at its nearest step boundary, an idle one starts a turn, an absent direct
   * child cold-resumes - none of which the loop can do by itself. Missing seam ⇒ named refusal.
   */
  const sendToMember = async ({ sender, targetId, content, signal } = {}) => {
    if (typeof sendMessage !== 'function') {
      fail('VMU_ENGINE_UNAVAILABLE', 'this loop has no sendMessage seam: a running member cannot be reached',
        'assemble the loop with { sendMessage: sendViaSubagents(ctx.get("subagents")) } (docs/26 §3.22)')
    }
    const id = await sendMessage({ sender, targetId, content, signal })
    counts.sent = (counts.sent || 0) + 1
    return { ok: true, messageId: id === undefined ? null : id, targetId, attribution: 'the host derived durable sender attribution from the live sender' }
  }

  /**
   * ROUND 4 / F10: interrupt a member. Fire-and-return by contract - the cancel signal is out, and the target may stop
   * at its next observation point; unclaimed inbox work, activations and published descendants all survive. The seam
   * enforces the authority SHAPE, so a caller without one is refused by name instead of collecting the host's
   * UNAUTHORIZED.
   */
  const interruptMember = ({ targetSessionId, authority, agent } = {}) => {
    if (typeof interrupt !== 'function') {
      fail('VMU_ENGINE_UNAVAILABLE', 'this loop has no interrupt seam: a running member cannot be stopped',
        'assemble the loop with { interrupt: interruptViaSubagents(ctx.get("subagents")) } (docs/26 §3.22)')
    }
    const out = interrupt({ targetSessionId, authority, agent })
    counts.interrupted = (counts.interrupted || 0) + 1
    return out
  }

  /**
   * ④ parse strictly: no usable object, bad JSON and unknown fields are three different named refusals.
   *
   * ROUND 370, aligned with the source's `parseReply`: the original has THREE tiers - every fenced block (tag optional,
   * last parseable one wins), then the whole text as JSON, then the OUTERMOST `{...}` span, because as the source puts
   * it, models sometimes wrap prose around the object. It rejects arrays and null at every tier and never throws,
   * returning `{}` when all three fail. Here the third tier is adopted but the total failure stays a NAMED refusal
   * rather than a silent empty object, since this repository refuses rather than guesses.
   */
  const parse = (text) => {
    const raw = String(text === undefined || text === null ? '' : text)
    const asObject = (s) => {
      try {
        const o = JSON.parse(s)
        return o && typeof o === 'object' && !Array.isArray(o) ? o : null
      } catch (e) { return null }
    }
    // Tier 1: every fenced block, keeping the LAST that parses to an object (the source's loop overwrites as it goes).
    const fence = /```(?:json)?[ \t]*([\s\S]*?)```/gi
    let obj = null
    let m
    while ((m = fence.exec(raw)) !== null) {
      const o = asObject(String(m[1]).trim())
      if (o) obj = o
    }
    let sawJsonish = obj !== null
    // Tier 2: the whole text as JSON.
    if (!obj) { obj = asObject(raw.trim()); if (obj) sawJsonish = true }
    // Tier 3: the outermost braces - the source notes models sometimes wrap prose around the object.
    if (!obj) {
      const i = raw.indexOf('{')
      const j = raw.lastIndexOf('}')
      if (i !== -1 && j > i) {
        obj = asObject(raw.slice(i, j + 1))
        if (obj) sawJsonish = true
        // A brace span that is present but unparseable is BAD JSON, not a missing fence: the two failures must stay
        // distinguishable, which is the whole reason both codes exist.
        else fail('VMU_TURN_BAD_JSON', 'the braces in the reply do not hold valid JSON: ' + raw.slice(i, j + 1).slice(0, 120))
      }
    }
    if (!obj) {
      // ★ LANE turn-reply: NEITHER CHANNEL ANSWERED. The old message named only the fence, which is now the FALLBACK
      // shape rather than the requirement - a reader who was told "no fenced json" would go looking for a fence in a
      // turn where the tool channel is what they should have used. Both channels are named, the same order the kernel
      // tries them in, and the hint spells out a working call for each.
      fail(sawJsonish ? 'VMU_TURN_BAD_JSON' : 'VMU_TURN_NO_FENCE',
        sawJsonish
          ? '回执里带了花括号但没有可用的工具汇报、也不是合法 JSON：本回合没有可用的回执对象（the reply carries braces that do not hold valid JSON, and no tool report backs it either）。成员在自己会话里做过什么在这里看不到——下结论说“什么都没发生”之前，去读记录轨（check the record tracks）'
          : '本回合既没有工具汇报、也没有可解析的围栏 JSON（neither a tool report nor a usable fenced json object）：本回合没有可用的回执对象。成员在自己会话里做过什么在这里看不到——下结论说“什么都没发生”之前，去读记录轨（check the record tracks）',
        'report through the tool: vibe_vmu_turn { op:"reply", report:{ say:"…", input:{…}, … } } (the fields the reply catalogue declares); the fenced json object stays supported as the COMPATIBILITY path: vibe_vmu_turn { op:"step", reply:"```json { … }```" } — a bare fence, a bare object and a prose-wrapped object are all still accepted (docs/26 §3)')
    }
    const unknown = Object.keys(obj).filter((k) => !Object.prototype.hasOwnProperty.call(owners, k) && !RECORDED_FIELDS.includes(k))
    // ★ PHASE 7 / round 15: a field gate must not destroy a turn the member already did the work in (founder's own
    // complaint). ignore-named is the DEFAULT: known fields still apply, and every unknown name is REPORTED, never
    // silently dropped (reply.ignoredFields + one notice). refuse keeps the old strict semantics byte for byte.
    const unknownFieldMode = settings && settings['vmu.turn.unknownReplyFieldMode'] === 'refuse' ? 'refuse' : 'ignore-named'
    if (unknown.length && unknownFieldMode === 'refuse') {
      fail('VMU_TURN_UNKNOWN_FIELD', 'unknown reply field(s): ' + unknown.join(', ') + ' - refusing rather than guessing what was meant',
        'known fields: ' + known.concat(RECORDED_FIELDS).join(', '))
    }
    const ignoredFields = unknown.length ? unknown.slice() : []
    if (ignoredFields.length) obj.ignoredFields = ignoredFields
    counts.parsed += 1
    return { ok: true, reply: obj, fields: Object.keys(obj), ...(ignoredFields.length ? { ignoredFields } : {}) }
  }

  /**
   * ★★★★★★★ PHASE 6 / K10 — DECODE A `turn/reply-parsed` REWRITE INTO THE REPLACEMENT REPLY OBJECT.
   *
   * The bus's contract returns a STRING (`bus.js rewriteOf`: `string` | `{ reply: string }`), while the dispatcher
   * consumes the PARSED reply object. Assigning that string straight into `parsed.reply` made `apply()`'s first line
   * (`typeof reply === 'object' ? reply : {}`) fall back to `{}`, i.e. a rewrite silently DISCARDED every field of the
   * member's reply instead of replacing it. Measured end-to-end on a real kernel: the reply was recorded as nothing.
   *
   * WHY THIS IS NOT `parse()`: `parse()` is the MODEL-REPLY gate; it refuses unknown fields, which is right for a
   * model reply and wrong for a normalisation rewrite. The v3 planner returns `{ summary, plan, normalizedBy, note }`
   * and deliberately DROPS `progress` so the kernel does not write the same record twice - re-running the field gate
   * would turn that legal rewrite into a failed turn. A rewrite that is not a JSON OBJECT is still a NAMED refusal:
   * it can never silently empty the reply, and the original reply is not dispatchable after a rewrite the caller
   * asked for but the framework cannot read.
   */
  const rewrittenReplyObject = (text) => {
    let obj = null
    try { obj = JSON.parse(String(text).trim()) } catch (e) { obj = null }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      fail('VMU_TURN_BAD_JSON', 'the rewritten reply is not a JSON object, so it cannot replace the parsed reply: ' + String(text).slice(0, 160),
        'a `turn/reply-parsed` rewrite must return JSON text for an object reply (docs/19 §19.12: the replacement `reply`)')
    }
    return obj
  }

  /** ⑤ plan: a PURE function from a parsed reply to the dispatch list (one owner per field). */
  const plan = (reply) => {
    const r = reply && typeof reply === 'object' ? reply : {}
    return Object.keys(r).filter((k) => Object.prototype.hasOwnProperty.call(owners, k)).map((k) => {
      const owner = owners[k]
      const step = { field: k, face: owner.face, op: owner.op, payload: r[k] }
      // ★ a field with no reply shape is reported as such BEFORE any face lookup, so the receipt cannot claim
      // `face-not-wired` (which would blame the host for a field the reply could never express).
      if (owner.noReplyShape) step.notApplicable = owner.noReplyShape
      return step
    })
  }

  /**
   * ⑤ apply: run the plan through the face map. A field whose face is not wired is COUNTED and reported, so a
   * half-installed host is visible instead of quietly losing the model's work.
   *
   * ROUND 377: the BOOKKEEPING fields are accounted for here, in ONE place and on EVERY reply - which is exactly the
   * fix the source records for a v4 defect where only the normal branch consumed them, so the flag stuck true and the
   * compaction directive reappeared at the head of every later prompt forever. `compacted` also stores the RESUME
   * SEED: the member's own progress (or summary) text, capped the way the source caps it, which is what a rebuilt
   * session is handed so it does not start from nothing.
   */
  // The loop's own context accounting (docs/26 section 3.21): the last reported percentage, how many rounds since a
  // real compaction, and the resume seed a rebuilt session is handed. Kept here rather than in the kernel because it is
  // bookkeeping about the TURN, and the source keeps it in the same place its own round loop does.
  const context = new Map()

  /**
   * ROUND 384 - THE ONE-SHOT NOTICE QUEUE (docs/26 section 3.25). The source composes a settled asynchronous compile
   * announcement into the NEXT prompt of the member it concerns, and states that announcement point explicitly: once.
   * Not "every round until acknowledged" and not dropped - the assembly that reaches that member drains the queue, so a
   * notice cannot be repeated and cannot be lost. The charter carries the wording; the queue carries the timing.
   */
  const notices = new Map()

  /** Queue a one-shot notice. Extracted so the turn loop itself can queue one (a refused dispatch, round 396). */
  const queueNotice = (memberId, line) => {
    if (typeof memberId !== "string" || memberId.trim() === "") fail("VMU_INVALID_ARGUMENT", "a notice needs a member", "pass (memberId, line)")
    const l = String(line === undefined || line === null ? "" : line).trim()
    if (l === "") fail("VMU_INVALID_ARGUMENT", "a notice needs a line", "an empty notice would render as a blank line")
    const q = notices.get(memberId) || []
    q.push(l)
    notices.set(memberId, q)
    return { ok: true, queued: q.length }
  }

  /** Drain a member notices. Called by the assembly, which is what makes the announcement one-shot. */
  /**
   * ROUND 391 - disable/enable a section IF the pipeline carries it. The pipeline is right to refuse an unknown name,
   * and a suite or a host may legitimately assemble with a subset of the pack sections, so the loop swallows EXACTLY
   * that one refusal and lets every other failure through: a switch must not be able to turn a configuration mistake
   * into silence.
   */
  const setSectionEnabled = (name, on) => {
    if (!prompt) return
    try { if (on) prompt.enable(name); else prompt.disable(name) }
    catch (e) { if (!e || e.code !== "VMU_NO_SUCH_OBJECT") throw e }
  }

  const drainNotices = (memberId) => {
    const q = notices.get(memberId) || []
    notices.delete(memberId)
    return q
  }

  // ★★ ROUND 50: THE CLOSURE VOTE, BY MEMBER. `solved` arrives once per turn and would otherwise overwrite a single
  // context slot, so a unanimous judgement could never be observed - which is trap 3 ("solved is per-turn state
  // while closure is a per-round judgement"). Keyed by member, the window becomes well defined.
  const closureVotes = new Map()   // ★ `vote_solved` per member: the CLOSURE vote (unanimity required)
  let closureVoteWrites = 0        // ★ one counter, incremented ONLY inside recordClosureVote (both input channels)
  // ★★★ R11 OF THE PHASE-12 LIVE RUN: `executed` counts FIELD_OWNERS actions only, so a turn whose ONLY effect was the
  // closure vote came back as `executed:0 + closureVote.cast:true` — a receipt that reads like "nothing happened" beside
  // a window that says the institute just closed. The two statements were both true about DIFFERENT things, and nothing
  // said so. `effects` is the missing list: mechanism-level consequences that are not reply-field actions (today: the
  // closure vote, from either channel). It is additive — `executed` keeps its exact old meaning and count.
  const turnEffects = []           // reset per apply(); entries {kind, member, ...}
  // ★ ROUND 18 of the live-acceptance phase: A COERCED VALUE IS A TRANSFORMATION, AND IT WAS SILENT.
  //   Measured live (run 21): a member replied `"vote_solved":"true"` (a STRING) and the framework accepted it as the
  //   boolean true. That leniency is deliberate, but nothing anywhere said a transformation had happened, so the
  //   institute concluded "the counter never moves" while the real story was "the value never failed". Each coercion
  //   is recorded here and travels on every receipt shape that already carries `effects`.
  const turnCoercions = []         // reset per apply(); entries {field, member, from, to}
  const COERCIONS_MEANS = 'values this turn TRANSLATED instead of refusing: each entry names the field, the member, what arrived and what it became. An empty list means nothing was translated - it does not mean the list was dropped'
  // ★ ROUND 119 (live run 119 / F-119b): `executed` was a COUNT on the main step receipt, so a caller could not read WHICH
  // actions the turn dispatched — the same defect family as run 37's count-only `skipped`. One receipt path already carried
  // `executedDetail`; the two main paths did not. A count tells you that something happened, never what.
  const EXECUTED_MEANS = 'the actions this turn actually dispatched, one row per field: field, face, op and what the face answered. Bounded to 5 rows; `executed` is the COUNT and this list is the detail. An empty list means nothing was dispatched - it does not mean the list was dropped'
  const visibleToolsByMember = new Map() // ★ last assembled visible set per member (this turn)
  const toolVotedThisTurn = new Set()    // ★ members who already voted THROUGH THE TOOL this turn
  const solvedThisRound = new Map() // ★ `solved` per member: the per-round convergence reading, NOT closure
  /**
   * ★ PHASE 8 / round 37: THE ONE CLOSURE-VOTE WRITER. Both inputs — a reply's `vote_solved` field and the
   * `vibe_vmu_vote` tool — call THIS function; there is no second ledger. A repeated write for the same member replaces
   * that member's single boolean (the tally counts a member once, as before).
   */
  const recordClosureVote = (memberId, solved, source = 'reply') => {
    const id = typeof memberId === 'string' ? memberId : String(memberId)
    const value = solved === true || solved === 'true'
    // ★ a STRING (or any non-boolean) is TRANSLATED, and the translation is recorded: silence here was the defect.
    if (typeof solved !== 'boolean') turnCoercions.push({ field: 'vote_solved', member: id, from: typeof solved === 'string' ? solved : String(solved), to: value })
    if (source === 'tool') toolVotedThisTurn.add(id)
    closureVotes.set(id, value)
    closureVoteWrites += 1
    // R11: the effect is recorded HERE so BOTH channels (reply field and `vibe_vmu_vote`) land in one list.
    turnEffects.push({ kind: 'closure-vote', member: id, solved: value, source })
    return { ok: true, member: id, solved: value }
  }

  const apply = async (reply, faceMap = null, memberId = null, opts = null) => {
    const map = faceMap || faces
    const r = reply && typeof reply === 'object' ? reply : {}
    const bookkeeping = []
    turnEffects.length = 0   // R11: effects are per-apply, never accumulated across turns
    turnCoercions.length = 0 // ROUND 18: coercions are per-apply too
    if (r.contextPct !== undefined && r.contextPct !== null) {
      const pct = Math.max(0, Math.min(100, Math.floor(Number(r.contextPct))))
      if (Number.isFinite(pct)) { context.set('pct', pct); bookkeeping.push({ field: 'contextPct', pct }) }
    }
    if (r.compacted) {
      context.set('pct', 15)                     // a fresh context, exactly as the source resets it
      context.set('sinceCompact', 0)             // and the counter that drives the directive
      const seed = String(r.progress !== undefined ? r.progress : (r.summary !== undefined ? r.summary : '')).slice(0, 4000)
      context.set('seed', seed)
      bookkeeping.push({ field: 'compacted', seedChars: seed.length })
    }
    // ★★★★★★★ ROUND 86 — THE RECORDED FIELDS ARE TAKEN BEFORE ANY DISPATCH RUNS, AND THAT ORDER IS THE FIX. This loop
    // used to run AFTER the dispatch loop below, so a face that REFUSED any field threw out of `apply` and everything
    // here was lost - including the member's own closure vote. Measured on a real machine (and reproduced locally
    // through the tool faces): a reply carried `vote_solved: true`, another field of that same reply was refused with
    // VMU_NO_OPEN_MEETING because the meeting had closed, and `closureVoteRecorded` stayed empty while `missing` still
    // named the member who had just answered. A member's judgement is not contingent on the rest of their reply being
    // accepted, so it is recorded FIRST; the dispatches then carry out the effects that DO need a face.
    for (const field of RECORDED_FIELDS) {
      if (r[field] === undefined || r[field] === null) continue
      // ★★★ WHICH FIELD CLOSES THE INSTITUTE IS SETTLED BY THE PROMPT, NOT BY ME. Its own words: `vote_solved` is
      // "会议/结题表决用" with a unanimity rule, while `solved` is "你这一轮的个人判断". So the CLOSURE vote is
      // `vote_solved`, and `solved` is only the per-round convergence reading. Both are recorded; only the first is
      // counted for closure. (The original agrees: it read `speakers[].voteSolved`.)
      if (field === 'solved' && memberId !== null) solvedThisRound.set(String(memberId), r[field] === true)
      // ★★★★★★★ ROUND 21 — THE VOTE WAS WRITTEN ONCE PER RECORDED FIELD, NOT ONCE PER REPLY. Measured on a real machine
      //   (run 27's own acceptance report: "每个回合的 effects 里同一条 closure-vote 重复出现两次", with
      //   `closureVoteWrites:4` for two members): this block tests `r.vote_solved` but is INSIDE `for (const field of
      //   RECORDED_FIELDS)`, so it fired at every recorded field that happened to be present. A reply carrying
      //   `solved` + `vote_solved` therefore wrote the SAME judgement twice; three fields would write it three times.
      //   The tally was never wrong (the map is keyed by member and last-wins), but `closureVoteWrites` and `effects`
      //   both double-counted, and the institute read that as "one vote counted twice". The vote is a property of the
      //   REPLY, not of the field being iterated, so it is now recorded exactly once — when the loop reaches its own field.
      if (field === 'vote_solved' && memberId !== null && r.vote_solved !== undefined && r.vote_solved !== null) {
        // ★★★★★★★ ROUND 76: THE VALUE ARRIVES AS A STRING, AND A STRICT CHECK SILENTLY DISCARDED IT. Measured on a
        // real machine: the model emitted "vote_solved": "true" - the word in quotes - twelve times, and a strict
        // === true is false for the string "true". So members genuinely recorded their judgement, the receipt kept
        // saying missing: [...], and the institute could not close. The coercion is deliberately narrow: the boolean,
        // and the two literal words, case-insensitively trimmed. Anything else stays FALSE rather than being guessed at,
        // because a closure vote is a judgement and inventing one is the worst outcome available here.
        const rawVote = typeof r.vote_solved === 'string' ? r.vote_solved.trim().toLowerCase() : r.vote_solved
        const id = String(memberId)
        const visible = visibleToolsByMember.get(id) || []
        const voteFaceVisible = visible.includes('vibe_vmu_vote')
        if (voteFaceVisible || toolVotedThisTurn.has(id)) {
          // ★ PHASE 8 / round 39: ONE TURN, ONE CHANNEL. If the vote tool is visible (or was already used), the reply
          // field is NOT recorded; the latest-wins ACROSS turns is untouched.
          bookkeeping.push({ field: 'vote_solved', kept: false, reason: 'vibe_vmu_vote is available this turn; the reply vote_solved is ignored (use the tool)' })
        } else {
          // ★ ROUND 18: pass the RAW value through. Turning it into a boolean HERE was what made the translation
          //   invisible: by the time the writer saw it there was no way to tell true from 'true'.
          recordClosureVote(memberId, rawVote)
        }
      }
      if (bookkeeping.some((b) => b.field === field)) continue
      context.set(field, r[field])
      bookkeeping.push({ field, kept: true })
    }
    if (bookkeeping.length) counts.bookkept = (counts.bookkept || 0) + bookkeeping.length

    const dispatches = plan(reply)
    // ★★★ 用户裁决 B（m21840）第 2 步 —— 「成员真跑 + 所办代记」。成员在回合里只说一句话（\`{"say":"…"}\`），
    // 而 meetings.speak 需要 { meeting, member, text }。没有绑定时这句话只能进 notes（现状：诚实的退回），
    // 一旦调用方给出会议（op:"reply" 的 meeting 参数），KERNEL 就替成员把三件事补齐并把归属写成成员本人——
    // 不是伪造：这一轮本来就是「所办替成员跑」，回执里把代记事实写在 onBehalf 上，读的人看得见。
    const boundMeeting = opts && opts.meeting !== undefined && opts.meeting !== null && String(opts.meeting).trim() !== ''
      ? String(opts.meeting).trim() : null
    const ON_BEHALF_MEANS = 'the calling session recorded this on the member\'s behalf: the sentence came from the turn\'s own reply, not from a tool call the member made itself'
    const composedFor = (d, payload) => {
      if (d.face !== 'vmu.meetings' || d.op !== 'speak') return null
      if (boundMeeting === null || memberId === null || memberId === undefined) return null
      if (typeof payload !== 'string' || payload.trim() === '') return null
      return { meeting: boundMeeting, member: String(memberId), text: payload }
    }
    // ★★★★★★★ ROUND 39 (live run 39 / F-10) — A ROW WRITTEN THROUGH THE REPLY CHANNEL KEPT NO AUTHOR.
    // The `progress` reply field dispatches the records face's `put`, and `put` takes the author from `by` (the durable row's
    // `owner` IS `rec.by`, kernel/records.js:346). A member who wrote through the fenced json — the documented
    // envelope — therefore produced a row with `by: null`; the per-member library read and the status board's
    // "该成员最近一条" both filter on the author, so the institute saw a row nobody owned while the tool face (which
    // takes `member`) wrote the same kind of row correctly. The turn ALREADY KNOWS whose turn it is: the author is
    // supplied here, and the model is not asked a second time to repeat its own id in json.
    // ★★★ ROUND 40 (live run 40 / F-12) — THE REPLY CHANNEL NAMES A RECORD BY ITS TRACK, AND THE TRACK IS OFTEN THE KIND.
    // Run 40's office asked a member to write `{"progress":{"track":"progress","title":...,"body":...}}` through the
    // envelope and got the WHOLE TURN refused: `VMU_INVALID_ARGUMENT kind "undefined" is not allowed`. The tool face
    // takes `kind`; the envelope's documented shape is `{track,title,body}`, and for the tracks that ARE kinds the two
    // words are the same word. Filling `kind` from a track that is a declared kind is a TRANSLATION, not an invention:
    // it is recorded in `coercions` (from `kind:absent` to `kind:<track>`) so the receipt says what it became, which is
    // the rule the `coercions` list exists for. A track that is NOT a declared kind is left alone and still refused by
    // name — this does not guess.
    const KIND_TRACKS = Object.freeze(['progress', 'state'])
    const composeRecordPut = (d, payload) => {
      if (d.face !== 'vmu.records' || d.op !== 'put') return null
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
      const out = Object.assign({}, payload)
      let changed = false
      let attributed = false
      if ((out.kind === undefined || out.kind === null || out.kind === '') && typeof out.track === 'string' && KIND_TRACKS.includes(out.track)) {
        out.kind = out.track
        changed = true
        turnCoercions.push({ field: d.field, member: memberId === null || memberId === undefined ? null : String(memberId), from: 'kind:absent', to: 'kind:' + out.track,
          why: 'the reply channel names a record by its TRACK and this track IS a declared kind, so the envelope is not asked to spell the same word twice (a track that is not a kind is still refused by name)' })
      }
      if (memberId !== null && memberId !== undefined) {
        const by = out.by
        if ((by === undefined || by === null) || (typeof by === 'string' && by.trim() === '')) { out.by = String(memberId); changed = true; attributed = true }
      }
      if (!changed) return null
      return { payload: out, attributed }
    }
    // ★★★★★★★ ROUND 43 (live run 43) - ONE ACT WALKED THROUGH TWO DOORS.
    // Measured: a member was told to write ONE progress row; it called `vibe_v5_record_progress` (that door takes
    // `member`) AND put the same row in the fenced reply (the other door). Both landed: `rec-1` and `rec-2`, same
    // owner, same title, one millisecond apart - and the status board cited the second while the member's own prose
    // said the first. Neither door is wrong; the PAIR is one act done twice. The turn knows which member it is and
    // when it opened, so the second door can ASK THE LEDGER whether the act is already written and skip by name
    // instead of writing a twin. It never guesses: same owner + same track + same title + written at-or-after open.
    const stampMs = (v) => {
      if (v === undefined || v === null || v === '') return null
      const asNumber = Number(v)
      if (Number.isFinite(asNumber)) return asNumber
      const parsed = Date.parse(String(v))
      return Number.isFinite(parsed) ? parsed : null
    }
    const alreadyWrittenThisTurn = (composed, turnStartedAt) => {
      if (composed === null || composed === undefined) return null
      const payload = composed.payload || null
      if (!payload || typeof payload !== 'object') return null
      if (typeof payload.title !== 'string' || payload.title.trim() === '') return null
      if (payload.by === undefined || payload.by === null || String(payload.by).trim() === '') return null
      const started = stampMs(turnStartedAt)
      if (started === null) return null
      const recordFace = map['vmu.records'] || null
      const list = recordFace && typeof recordFace.list === 'function' ? recordFace.list : null
      if (!list) return null
      let listed
      try { listed = list({ track: payload.track, limit: 0 }) } catch { return null }
      if (!listed || typeof listed.then === 'function') return null
      const items = Array.isArray(listed.items) ? listed.items : (Array.isArray(listed.cards) ? listed.cards : null)
      if (items === null) return null
      const title = payload.title.trim()
      const owner = String(payload.by).trim()
      for (const row of items) {
        if (!row || typeof row !== 'object') continue
        const rowOwner = row.owner === undefined || row.owner === null ? '' : String(row.owner).trim()
        if (rowOwner !== owner) continue
        const rowTitle = row.title === undefined || row.title === null ? '' : String(row.title).trim()
        if (rowTitle !== title) continue
        const stamp = stampMs(row.createdAt === undefined || row.createdAt === null ? row.updatedAt : row.createdAt)
        if (stamp === null || stamp < started) continue
        return String(row.id === undefined || row.id === null ? '?' : row.id)
      }
      return null
    }
    const ATTRIBUTION_MEANS = 'the author of this row is the member whose turn it is: the turn already knows whose turn it is, so the row is attributed here instead of demanding the model write its own id into the reply json'
    const executed = []
    const skipped = []
    // ★ PHASE 12 / run 35 item ② follow-up (my own note was a LIE): the skip note said "the line stays in the round state
    // only", but `say` is not in RECORDED_FIELDS, so nothing anywhere kept it - the member's sentence was dropped while the
    // receipt claimed it was kept. A note that describes a place where the data is NOT is worse than no note. The text is
    // therefore KEPT here, bounded, and travels out on `notes` under its own field name.
    const keptNotes = []
    const NOTE_CAP = 500
    // ★★★ RUN 142 / audit10 C2: the tracks the library will actually accept, used ONLY to spell the `record` refusal hint
    // concretely ("one of: …"); absent settings means the kernel's default track list, which the hint names generically.
    const declaredTracks = (() => {
      const t = settings && settings['vmu.records.tracks']
      return Array.isArray(t) ? t : null
    })()
    for (const d of dispatches) {
      if (d.notApplicable) {
        counts.notExecuted += 1
        skipped.push({ field: d.field, face: d.face, op: d.op, reason: 'no-supported-shape', code: d.notApplicable.code, hint: d.notApplicable.hint })
        continue
      }
      // ★ PHASE 12 / run 35 item 2: A REPLY FIELD CAN REQUIRE AN OBJECT THE TURN DOES NOT HAVE. `say` maps to the
      // meetings face's `speak`, and the prompt tells a member they may keep one line of explanation in the receipt after
      // speaking through `vibe_v5_say` - so a member following the prompt's own example writes `{"say":"…"}` in a turn
      // that has NO meeting bound. The dispatch used to be attempted anyway and the KERNEL threw
      // `VMU_NO_SUCH_OBJECT "no such meeting: undefined"` from deep inside the meeting service; that throw then ended
      // the held turn, and the member's next reply read `VMU_TURN_NO_PENDING_MEMBER` - i.e. copying the prompt's example
      // cost them their turn, with nothing saying why. Here the field is SKIPPED BY NAME instead (the reason is a pure
      // function so the promise is assertable without a live host): nothing is pretended to have happened, the turn
      // still completes, and the receipt says which field was dropped and why.
      // The line is recorded, not thrown away: the prompt allows `say` as the explanation for speech already made through
      // `vibe_v5_say`, so it is a READING of what the member did, and a reading that vanishes is the defect.
      const skipReason = dispatchSkipReason(d, { boundMeeting })
      if (skipReason !== null) {
        counts.notExecuted += 1
        const raw = typeof d.payload === 'string'
          ? d.payload
          : (d.payload && typeof d.payload.text === 'string'
            ? d.payload.text
            : (d.payload && typeof d.payload === 'object' ? JSON.stringify(d.payload) : null))
        const note = { field: d.field, reason: skipReason.reason, text: raw === null ? null : String(raw).slice(0, NOTE_CAP), kept: raw !== null }
        if (raw !== null && String(raw).length > NOTE_CAP) note.truncated = true
        keptNotes.push(note)
        skipped.push({ field: d.field, face: d.face, op: d.op, reason: skipReason.reason,
          note: skipReason.note + '; the line IS kept: see `notes` for this round' })
        continue
      }
      const face = map[d.face]
      const fn = face && typeof face[d.op] === 'function' ? face[d.op] : null
      if (!fn) {
        counts.notExecuted += 1
        skipped.push({ field: d.field, face: d.face, op: d.op, reason: 'face-not-wired' })
        continue
      }
      // ★★★ RUN 142 / audit10 C2: `record` is ONE RESEARCH-LOG LINE, NOT THE CARD ROUTE. The face's real operation is
      // `record(member, track, text)` (kernel/library.js:427) while the reply field documents `{track,text}`; dispatching
      // the payload object as the first argument put the whole payload in the `track` slot, so EVERY record reply died
      // with VMU_RECORD_SHAPE and the documented field was unreachable. The adapter below supplies the missing member
      // (the turn already knows whose turn it is) and the real argument order. A payload that does not have that shape is
      // NOT dispatched: the field is skipped BY NAME, the rest of the turn still applies, and the receipt says which slot
      // is wrong - a shape error that destroys the turn teaches the sender nothing (the same rule as no-meeting-bound).
      const recordLog = (d.face === FIELD_OWNERS.record.face && d.op === FIELD_OWNERS.record.op)
        ? recordLogArgs(d.payload, memberId, declaredTracks)
        : null
      // RUN 145 / audit14 C-1: `task_create` teaches {title,description,blocked_by?,write_scopes?} and the core face
      // reads {title,objective,deps,writeScopes} - the adapter maps them (and REFUSES unknown keys by name) so the
      // taught keys can no longer be dropped silently.
      const taskCreate = (d.face === FIELD_OWNERS.task_create.face && d.op === FIELD_OWNERS.task_create.op)
        ? taskCreateArgs(d.payload)
        : null
      const adapted = recordLog !== null ? recordLog : taskCreate
      if (adapted !== null && adapted.ok !== true) {
        counts.notExecuted += 1
        skipped.push({ field: d.field, face: d.face, op: d.op, reason: adapted.reason, code: adapted.code,
          missing: adapted.missing, message: adapted.message, hint: adapted.hint,
          note: 'the field was NOT dispatched: ' + adapted.message + '; nothing was written and the rest of the turn still applies',
          means: adapted === recordLog ? RECORD_LOG_MEANS : undefined })
        continue
      }
      const composed = composedFor(d, d.payload)
      const onBehalf = composed !== null
      const recordComposed = onBehalf ? null : composeRecordPut(d, d.payload)
      const twin = onBehalf ? null : alreadyWrittenThisTurn(recordComposed, opts && opts.turnStart)
      if (twin !== null) {
        counts.notExecuted += 1
        skipped.push({ field: d.field, face: d.face, op: d.op, reason: 'already-written-this-turn', existingId: twin,
          means: 'the same act already reached the ledger during this turn (same owner, same track, same title, written at-or-after the turn opened): the row is ' + twin + ', so this door did not write a twin. Do one act through ONE door - the tool face or the reply envelope.' })
        continue
      }
      const attributed = recordComposed !== null && recordComposed.attributed ? recordComposed.payload : null
      let res
      try {
        res = adapted !== null
          ? await fn(...adapted.args)
          : await fn(onBehalf ? composed : (recordComposed !== null ? recordComposed.payload : d.payload), { field: d.field, face: d.face, op: d.op, ...(attributed ? { attributedTo: String(memberId) } : {}) })
      } catch (e) {
        if (e && e.code === 'VMU_NO_OPEN_MEETING') {
          // ★ PHASE 9 / round 7: the real reason for the measured failure was NOT "meetings is broken": the member
          // answered a tool-only instruction round with a meeting field, because the instruction never reached its
          // prompt. Keep the underlying message, but name the field/tool/instruction chain so a reader does not chase
          // the meeting service. Nothing is pretended to have executed.
          const err = new Error('this turn was not given a meeting tool, and no meeting is open: the reply field "' + d.field + '" cannot be applied (' + String(e.message || e) + ')')
          err.code = 'VMU_TURN_FIELD_NOT_APPLICABLE'
          err.hint = 'the member answered with a field no tool in this turn could produce; check instructionDelivered on the turn receipt, and the per-turn tools allowlist. The underlying meeting error is kept as cause.'
          err.cause = e
          throw err
        }
        throw e
      }
      counts.dispatched += 1
      const entry = { field: d.field, face: d.face, op: d.op, result: res }
      if (recordLog !== null) { entry.recordLog = { member: recordLog.member, track: recordLog.track, means: RECORD_LOG_MEANS } }
      if (onBehalf) { entry.onBehalf = true; entry.onBehalfMeans = ON_BEHALF_MEANS; entry.composed = { meeting: composed.meeting, member: composed.member } }
      if (attributed) { entry.attributedTo = String(memberId); entry.attributionMeans = ATTRIBUTION_MEANS }
      executed.push(entry)
    }
    // ROUND 394: the remaining recorded fields used to be RECOGNISED AND THEN DISCARDED - a model that wrote prioritize,
    // hire or fire had its payload vanish with no trace, which is the silent-failure class this repository refuses.
    // Each one is now kept on the turn state under its own name and reported in the receipt, so the framework can read
    // it and a consumer can see that it arrived. No face is invented for them: the members service is not even present
    // in a default kernel, and sending a payload to an operation that does not exist would be worse than keeping it.
    return { ok: true, executed, skipped, planned: dispatches.length, bookkeeping, meeting: boundMeeting,
      meetingMeans: boundMeeting === null
        ? 'no meeting was bound to this turn, so a reply field that needs { meeting, member, text } cannot be dispatched (a bare sentence is kept in notes, never silently dropped)'
        : 'this turn was bound to the named meeting, so a member\'s bare sentence was recorded as THAT MEMBER\'S speech and the receipt carries onBehalf for it', effects: turnEffects.slice(), coercions: turnCoercions.slice(), coercionsMeans: COERCIONS_MEANS,
      notes: keptNotes,
      notesMean: 'lines that were NOT dispatched but ARE kept: a reading of what the member said, bounded to ' + NOTE_CAP + ' chars each - an empty list means no such line existed, never that a line was dropped silently' }
  }

  /**
   * A refusal about the reply's SHAPE must carry the reply itself (bounded), so the next run can answer "empty? prose?
   * a tool object?" from the record instead of re-running to guess. Shared by BOTH channels.
   */
  const attachReplyDiagnostics = (e, text) => {
    try {
      if (!e || typeof e !== 'object') return e
      const t = String(text === undefined || text === null ? '' : text)
      e.replyText = t.slice(0, 2000)
      e.replyLength = t.length
      e.hadBrace = t.indexOf('{') !== -1
      // ★★★ ROUND 38 (live run 38): the refusal used to end with "so there is nothing to apply", and an institute read
      // that as a statement about SIDE EFFECTS. It is only a statement about the REPLY SHAPE: when the member turn was
      // played by an independent child session, any tool that child ran is invisible from here. The refusal now says
      // which claim it is making, and hands the operator the check that DOES settle it (the record tracks).
      e.sideEffectsUnverified = true
      e.sideEffectsMeans = 'this refusal is about the REPLY SHAPE only: the member wrote something the declared envelope could not carry, so the reply was not applied. A member turn played by an independent child session MAY have run tools, and the kernel cannot see them from the parent side — read the record tracks (vibe_v5_read_library / vibe_v5_inbox) before treating this as "nothing happened"'
    } catch { /* diagnostics must not replace the refusal */ }
    return e
  }

  /**
   * ★★★★★★★ THE ONE TAIL BOTH CHANNELS SHARE: ignored-field notice, the `turn/reply-parsed` hook (and its rewrite), the
   * dispatch, and one notice per refused field. `parsed` is `{ reply, fields, ignoredFields?, source }`; `source` is
   * carried onto the receipt and into the bus payload, so a reader can tell WHICH channel produced a field.
   */
  const dispatchReply = async ({ turn, parsed, attributedTo, rawText, meeting = null }) => {
    // ★ PHASE 7: "ignored" must be READABLE - one notice for this member's next prompt (red line 3: never silent).
    if (Array.isArray(parsed.ignoredFields) && parsed.ignoredFields.length) {
      queueNotice(turn.member, '【研究所提示】回执里出现未登记字段：' + parsed.ignoredFields.join(', ') + '（已按 ignore-named 忽略；回执顶层请只写登记字段）')
    }
    // ROUND 496: `turn/reply-parsed` was frozen with a default policy and NOTHING emitted it, so middleware could not see
    // a parsed reply. Emitted BEFORE dispatch, which is the only point where inspecting it can still change the outcome.
    // LANE turn-reply: the payload now names the CHANNEL (`source`), so a middleware can tell a tool report from a fence.
    if (bus && typeof bus.emit === 'function') {
      const seen = await bus.emit('turn/reply-parsed', { turn: turn.id, member: turn.member, phase: turn.phase, fields: parsed.fields, reply: parsed.reply, source: parsed.source }, { member: turn.member, role: turn.role, phase: turn.phase })
      if (seen && seen.ok === false) fail((seen.refused && seen.refused.code) || 'VMU_MIDDLEWARE_FAILED', (seen.refused && seen.refused.message) || 'a middleware refused turn/reply-parsed', (seen.refused && seen.refused.hint) || null)
      // ★★★★★★★ PHASE 6 / K10: THE REWRITE POINT NOW EXISTS. `docs/19 §19.12` publishes this hook as returning
      // "reply（rewrite-result）" and `bus.js` has always carried `rewriteResult: 'rewrite-result'` - but nothing read
      // either, so a pack could declare the capability, pass the check, return a rewrite and watch the ORIGINAL reply
      // reach the dispatcher. `bus.rewriteOf()` is the missing reader: it enforces the registry's `rewritable` flag,
      // refuses a malformed value by name, and returns the last writer's text. The method is PROBED, so an injected
      // or older bus (the fake hosts in the suites) keeps the previous behaviour byte for byte.
      if (typeof bus.rewriteOf === 'function') {
        const rewritten = bus.rewriteOf('turn/reply-parsed', seen)
        if (rewritten !== null) {
          // ★ THE REWRITE IS THE SERIALISED REPLACEMENT REPLY, NOT RAW MODEL TEXT - see `rewrittenReplyObject` above
          // for the measured defect (a string assignment emptied the reply) and for why the rewrite must not go
          // through the model-reply field gate. The rewritten object is what `apply()` dispatches.
          const replacement = rewrittenReplyObject(rewritten)
          parsed.reply = replacement
          parsed.fields = Object.keys(replacement)
        }
      }
    }
    // ★ ROUND 79: a caller-supplied reply is attributed to the member it ANSWERS; everything else keeps turn.member.
    // ★ SLV: WRITE-BACK failures need the SAME diagnostics parse failures have. "unknown record track: undefined" used to
    // arrive with no reply text at all, so the only way to learn what the verifier actually wrote was another run.
    let out
    try {
      out = await apply(parsed.reply, null, attributedTo || turn.member, { meeting, turnStart: turn && turn.at, turnId: turn && turn.id })
    } catch (e) {
      try {
        const text = typeof rawText === 'string' ? rawText : JSON.stringify(parsed.reply)
        if (e && typeof e === 'object') {
          e.replyText = String(text).slice(0, 2000)
          e.replyLength = String(text).length
          e.hadBrace = String(text).indexOf('{') !== -1
          e.trackValue = parsed.reply && parsed.reply.progress && parsed.reply.progress.track !== undefined ? parsed.reply.progress.track : null
          e.turnState = lostTurnState(turn)
        }
        // ★★★ LIVE RUN 18 (the institute's own report, 「本轮无实质残余：否」 item 1): a member turn that ANSWERED but whose
        // write-back threw was readable in `deliveryLastFail` as... nothing at all. `deliveryFailed` stayed 0 (correctly —
        // the delivery did succeed) and `refused` stayed 0 (this face never rewrote the throw), so the aggregate said
        // "nothing went wrong" while a member's action had silently failed. This counter owns that case by name.
        counts.failed += 1
        counts.failedLast = {
          at: Date.now(),
          turn: turn && turn.id ? String(turn.id) : null,
          member: turn && turn.member ? String(turn.member) : null,
          code: e && e.code ? String(e.code) : null,
          message: e && e.message ? String(e.message).slice(0, 400) : String(e),
          replyText: String(text).slice(0, 400),
          means: 'the reply ARRIVED and its write-back threw: the member answered, the action did not take effect. deliveryFailed is not incremented for this; read failedLast' }
      } catch { /* diagnostics must not replace the refusal */ }
      throw e
    }
    // ROUND 396: a REFUSED dispatch becomes a notice for this member's NEXT prompt, which is the shape the original's
    // own corpus shows - "【研究所提示】task_update 未生效（V5_TASK_STALE_REVISION）：…". A refusal that lives only in the
    // receipt is invisible to the member that caused it, and the source is explicit that the announcement point is the
    // next prompt. The notice is queued AFTER this turn's assembly, so it cannot appear in the prompt that caused it.
    const refused = []
    for (const e of out.executed || []) {
      const r = e && e.result
      if (!r || r.ok !== false) continue
      const line = '【研究所提示】' + e.field + ' 未生效（' + String(r.code === undefined ? '' : r.code) + '）：'
        + String(r.message === undefined ? '' : r.message)
      queueNotice(turn.member, line)
      refused.push({ field: e.field, code: r.code === undefined ? null : r.code })
    }
    return { ok: true, fields: parsed.fields, ignoredFields: parsed.ignoredFields || [], refused,
      attribution: Object.assign({}, lastAttribution), source: parsed.source,
      // ★ LIVE RUN 2026-10-25: when a report already covered the turn and the prose still contained an unparsable brace
      // span, the turn completes and this note names what was NOT parsed. It must reach the receipt, or "the prose was
      // ignored" is invisible and the member's own words look silently dropped.
      ...(parsed.proseUnparsable ? { proseUnparsable: parsed.proseUnparsable } : {}),
      ...(parsed.textIgnored === true ? { textIgnored: true } : {}),
      ...(Array.isArray(parsed.textOnlyFields) && parsed.textOnlyFields.length ? { textOnlyFields: parsed.textOnlyFields } : {}),
      ...out }
  }

  /**
   * ★★★★★★★ THE ENTRY DECISION (08号决策): TOOL REPORT FIRST, TEXT JSON SECOND, AND A NAMED REFUSAL WHEN NEITHER EXISTS.
   *
   * This is the whole mechanism in one function, and the two-truths rule lives here (the pure merge is exported above):
   *   · a report recorded for THIS member      -> it is the reply; a text json, if any, is MERGED into it by value;
   *   · no report                              -> the text goes through `parse()`, EXACTLY as before this change;
   *   · report + prose (no json)               -> the report wins and the receipt says `textIgnored:true`;
   *   · report + json that DISAGREE on a field -> `VMU_TURN_REPLY_CONFLICT`, thrown before anything is dispatched;
   *   · neither                                -> `parse()` throws `VMU_TURN_NO_FENCE` (message names BOTH channels).
   * The report is CONSUMED here (`takeStructuredReport`), so it is applied at most once.
   */
  const replyFromChannels = (raw, member) => {
    const report = takeStructuredReport(member)
    if (!report) {
      let parsed
      try { parsed = parse(raw) } catch (e) { throw attachReplyDiagnostics(e, raw) }
      parsed.source = 'text'
      return parsed
    }
    let text = null
    let proseUnparsable = null
    try { text = parse(raw) } catch (e) {
      // A report already covers this turn: prose is case 1 (`textIgnored`), not a second truth - refusing it would punish
      // a member for explaining itself.
      //
      // ★★★★★★★ LIVE RUN 2026-10-25 (the institute's own defect note): THIS BRANCH USED TO FAIL THE WHOLE TURN.
      // MEASURED: a member answered through the TOOL channel (`vibe_vmu_turn { op: "reply", report: { … } }` returned
      // `accepted:true, source:"tool", turn:"t-3"`) and then explained itself in prose containing the illustrative
      // `{ op: "reply", … }`. The kernel rejected the turn as `VMU_TURN_BAD_JSON` (`replyLength:1122`) even though the
      // report it needed had already been accepted: the turn was reported as FAILED while its content was recorded. That is
      // a false failure of the same family as the delivery timeout, and the cost is a whole agent turn. The concern the old
      // line served ("do not silently hide a broken second channel") is still served - better - by a NAMED NOTE: the
      // prose is not parsed and not merged, and the receipt says so with the offending span.
      // ★ LIVE RUN 2026-10-25 (the institute's OWN reading of this field): the `message` below used to be whatever the
      // parser said, and the parser was only ever reached when NOTHING had been applied - so its sentence ("neither a
      // tool report nor a parseable fence, so there is nothing to apply") became a lie on the tool-first path, where the
      // same receipt said `source:"tool", fields:["progress"], executed:1`. A note must describe the channel it is about;
      // the parser's sentence is kept verbatim under `textMessage` (evidence), and `message` states the PART that failed.
      proseUnparsable = {
        code: e && e.code ? String(e.code) : 'VMU_TURN_BAD_JSON',
        message: 'the PROSE half of this turn did not parse, so it was not applied; the structured report above WAS applied'
          + (report && report.reply && Object.keys(report.reply).length ? ' (fields: ' + Object.keys(report.reply).join(', ') + ')' : ''),
        textMessage: String((e && e.message) || ''),
        text: String(raw === undefined || raw === null ? '' : raw).slice(0, 160),
        hint: 'the structured report is authoritative for this turn, so the turn is NOT failed; the prose brace span was NOT parsed and NOT merged - fix the prose if the member meant it as data',
      }
    }
    if (!text) {
      return { reply: Object.assign({}, report.reply), fields: Object.keys(report.reply), ignoredFields: report.ignoredFields.slice(), source: 'tool', textIgnored: true,
        ...(proseUnparsable ? { proseUnparsable } : {}) }
    }
    const merged = mergeReplyChannels(report.reply, text.reply)
    const ignored = []
    for (const k of [].concat(report.ignoredFields.slice(), text.ignoredFields || [])) if (!ignored.includes(k)) ignored.push(k)
    return { reply: merged.reply, fields: Object.keys(merged.reply), ...(ignored.length ? { ignoredFields: ignored } : {}),
      source: 'tool+text', textOnlyFields: merged.textOnly }
  }

  /** One full turn, in order. Returns the turn receipt rather than making the caller re-implement the sequence. */
  // ★ PHASE 6 / K2: renamed from `run` to `runOne` so the public `run` can be the guarded wrapper below. The body is
  // untouched; what changed is only that it is no longer directly callable while another turn is in flight.
  const runFrom = async (turn, spec) => {
    // ★ LANE turn-reply: the tool channel needs to know WHICH turn is open while a member answers it (see
    // `openTurnForReport`). Set here rather than at `open()` because a turn that is opened but never assembled has no
    // prompt to answer, and a report must attach to a PROMPT, not to a name.
    inFlightTurn = turn
    try {
      const asm = await assemble(turn)
      archivePrompt(turn && turn.id, turn && turn.member, asm && asm.text)
      const raw = await deliverTurn(turn, asm.text)
      // ★ LIVE RUN 2026-10-25: THE RECEIPT COULD NOT SAY WHO EXECUTED THE TURN. The delivery seam returns
      // `{ reply, childId, stopReason, attribution, deliveryPath }` (kernel/turn/index.js:556-614), and the caller-played
      // seam returns `deliveryPath:'caller'` - but none of it reached the receipt, so an operator could not tell an
      // independent subagent from a caller-played round without reading the host's session ledger. `deliveryOf` lifts the
      // seam's own words onto the receipt; it is derived from the returned envelope, never guessed.
      // ★ The envelope form is for the AWAITING case; the normal path goes through `deliverTurn`, which normalizes the
      // seam's answer and returns TEXT, so the executor lives in `lastAttribution` (set by that adapter). One reader,
      // two sources - and no guessing: an absent deliveryPath means the seam did not say who ran it.
      const DELIVERY_MEANS = 'which seam executed this member turn: caller = the CALLING session played it and returned the reply; activation = an independent child session ran it through startActivation (childId + stopReason name that child); subagents = the same, through the older one-shot verb. This value is the verb the seam actually used, not a normalised category'
      const deliveryFromAttribution = () => {
        const a = lastAttribution && typeof lastAttribution === 'object' ? lastAttribution : null
        if (!a || typeof a.deliveryPath !== 'string' || !a.deliveryPath) return null
        return {
          path: a.deliveryPath,
          childId: a.childId ? String(a.childId) : null,
          stopReason: typeof a.stopReason === 'string' ? a.stopReason : null,
          childPreset: typeof a.childPreset === 'string' ? a.childPreset : null,
          childPresetMeans: typeof a.childPresetMeans === 'string' ? a.childPresetMeans : null,
          residency: typeof a.residency === 'string' ? a.residency : null,
          residencyMeans: typeof a.residencyMeans === 'string' ? a.residencyMeans : null,
          // ★★★★★★★ TASK-13 / LIVE RUN 31: whether this turn CONTINUED the member's learned session or started a fresh
          // child, with the seam's named reason when it could not. Same family as every field above: the answer existed
          // one layer down (`lastAttribution`) and had to travel, or a reader is back to reconstructing it from the
          // host's session list after the run.
          continuation: a.continuation && typeof a.continuation === 'object' ? a.continuation : null,
          // ★ LIVE RUN 2026-10-25: the late-delivery facts are NUMBERS, and they travel as numbers (absent, not zero, when
          // the seam did not report them). `deliveredLate` is true only when the seam said so.
          deliveredLate: a.deliveredLate === true,
          deliveryWaitedMs: Number.isFinite(a.deliveryWaitedMs) ? a.deliveryWaitedMs : null,
          deliveryDeadlineMs: Number.isFinite(a.deliveryDeadlineMs) ? a.deliveryDeadlineMs : null,
          deliveryGraceMs: Number.isFinite(a.deliveryGraceMs) ? a.deliveryGraceMs : null,
          attribution: typeof a.attribution === 'string' ? a.attribution : null,
          means: DELIVERY_MEANS,
        }
      }
      const deliveryOf = (d) => {
        if (!d || typeof d !== 'object') return null
        const path = typeof d.deliveryPath === 'string' && d.deliveryPath ? d.deliveryPath : null
        if (!path) return null
        return {
          path,
          childId: d.childId ? String(d.childId) : null,
          stopReason: typeof d.stopReason === 'string' ? d.stopReason : null,
          // ★★ LIVE RUN 47: the seat reading existed on the seam's return value (`childPreset` / `childPresetMeans`)
          // and was dropped here, so the ONE field that answers "did the member preset reach the child" was
          // unreadable in the deployment that uses it. Same family as run 37's count-only `skipped`.
          childPreset: typeof d.childPreset === 'string' ? d.childPreset : null,
          childPresetMeans: typeof d.childPresetMeans === 'string' ? d.childPresetMeans : null,
          // ★★ ROUND 32 / F8: whether the activation behind this turn was KEPT RESIDENT for the next turn or
          // disposed with its reply. Without it, a run cannot tell "the host refused the resume" from "we tore the
          // child down ourselves before the resume was even attempted" — the two need different fixes.
          residency: typeof d.residency === 'string' ? d.residency : null,
          residencyMeans: typeof d.residencyMeans === 'string' ? d.residencyMeans : null,
          // ★ TASK-13: the awaiting route carries the same reading, so the caller who plays the member turn can see which
          // session the member already has and play it there (the caller-played seam cannot continue on its own).
          continuation: d.continuation && typeof d.continuation === 'object' ? d.continuation : null,
          ...(d.deliveredLate === true ? { deliveredLate: true, deliveryWaitedMs: d.deliveryWaitedMs === undefined ? null : d.deliveryWaitedMs, deliveryDeadlineMs: d.deliveryDeadlineMs === undefined ? null : d.deliveryDeadlineMs, deliveryGraceMs: d.deliveryGraceMs === undefined ? null : d.deliveryGraceMs } : {}),
          attribution: typeof d.attribution === 'string' ? d.attribution : null,
          means: 'which seam executed this member turn: caller = the CALLING session played it and returned the reply; activation = an independent child session ran it through startActivation (childId + stopReason name that child); subagents = the same, through the older one-shot verb. This value is the verb the seam actually used, not a normalised category',
        }
      }
      // ★★★ ROUND 73: A CALLER-PLAYED TURN RETURNS EARLY, AND THAT IS NOT A FAILED ROUND. The seam handed the assembled
      // prompt back to the calling session and deliberately has no reply yet; parsing `null` would turn the one route that
      // needs no host Agent into "the model said nothing". The awaiting envelope travels out with the prompt attached, so
      // the caller can play the member turn and answer on the next call.
      if (raw && typeof raw === 'object' && raw.awaiting === true) {
        return { ok: true, awaiting: true, turn, membersFrom: spec && typeof spec.membersFrom === 'string' ? spec.membersFrom : null, memberPrompt: raw.memberPrompt || null,
          assembled: { chars: asm.text.length, sources: asm.sources.length }, instructionDelivered: asm.instructionDelivered === true,
          delivery: deliveryOf(Object.assign({}, raw, { deliveryPath: (raw && raw.deliveryPath) || 'caller' })),
          fields: [], executed: [], skipped: [], refused: [],
          attribution: Object.assign({}, lastAttribution) }
      }
      // consumed once: the next turn's reply belongs to whoever it answers
      const attributedTo = lastReplyForMember
      lastReplyForMember = null
      // ★ ROUND 35 / F4: keep the member's own words reachable whether or not they parsed. Two readings, one source:
      //   · parse FAILED  -> counts.replyParseFailedLast (read through `vibe_vmu_turn {op:"status"}`), so "the member did
      //     answer, here is what it said" survives the refusal instead of dying with the thrown error;
      //   · parse WORKED  -> the receipt carries a bounded `replyExcerpt`, so the office can see the sentence the member
      //     actually wrote next to the fields it produced. A receipt is not a log file: the bound is the same 2000 the
      //     existing refusal diagnostics use.
      const REPLY_EXCERPT_MAX = 2000
      const rawText = String(raw === undefined || raw === null ? '' : raw)
      // ★ ROUND 67 / F-57 (live run 66): a bound that is not DECLARED is a silent cut. The office read a 2,679-character
      // reply, saw the excerpt end mid-object, and had to infer both that it was cut and that the rest existed — while
      // `replyLength` alone does not say which. So the bound declares itself (`replyTruncated`, `replyLimitChars`) and,
      // when it cuts, names where the remainder lives: this kernel keeps only the excerpt, the rest stays with the
      // member's own session (`delivery.childId` / `lastAttribution.memberSessions` on the status face).
      const replyTruncated = rawText.length > REPLY_EXCERPT_MAX
      const replyExcerptMeans = replyTruncated
        ? 'the reply as the member wrote it, CUT at replyLimitChars (' + REPLY_EXCERPT_MAX + ') — replyTruncated is true and replyLength is the FULL length. This kernel does not keep the remainder: it stays in that member\'s own session (receipt `delivery.childId`, also `vibe_vmu_turn {op:"status"}` → lastAttribution.memberSessions), which this kernel does not copy'
        : 'the reply as the member wrote it, complete (replyTruncated is false, so replyLength equals the excerpt length); `fields` below is what the framework could use from it, so a field missing here is visible as prose instead of silently absent'
      let parsed
      try {
        parsed = replyFromChannels(raw, attributedTo || turn.member)
      } catch (e) {
        try {
          counts.replyParseFailed += 1
          counts.replyParseFailedLast = {
            at: Date.now(),
            turn: turn && turn.id ? String(turn.id) : null,
            member: (attributedTo || turn.member) ? String(attributedTo || turn.member) : null,
            code: e && e.code ? String(e.code) : null,
            message: e && e.message ? String(e.message).slice(0, 400) : String(e),
            replyLength: rawText.length,
            replyExcerpt: rawText.slice(0, REPLY_EXCERPT_MAX),
            replyTruncated,
            replyLimitChars: REPLY_EXCERPT_MAX,
            sideEffectsUnverified: true,
            means: 'the member ANSWERED (this text is what it wrote) and the reply could not be parsed into the declared shape, so the REPLY was not applied. This is NOT a silent member and NOT a delivery failure — and it is NOT a claim that nothing happened: a tool the child session ran is not visible from this kernel (read the record tracks to settle it)' }
        } catch { /* diagnostics must not replace the refusal */ }
        throw e
      }
      // ★★★★★★★ ROUND 39 (live run 39 / F-11) — THE SIDE-EFFECT DISCLOSURE BELONGED TO EVERY APPLY-REFUSAL, NOT TO ONE CODE.
      // Run 39's own finding: a turn whose `progress` field was refused with `VMU_INVALID_ARGUMENT` carried NO
      // `sideEffectsUnverified`, while that same turn's member had already written a row through the tool face — so a
      // reader could conclude "refused, therefore nothing happened" and be wrong. The shape refusals (NO_FENCE/BAD_JSON)
      // already carry the disclosure; an APPLY refusal deserves the same sentence, because the child session is
      // equally invisible from here.
      let tail
      try {
        tail = await dispatchReply({ turn, parsed, attributedTo: attributedTo || turn.member, rawText: raw })
      } catch (e) {
        if (e && typeof e === 'object' && e.sideEffectsUnverified !== true) {
          e.sideEffectsUnverified = true
          e.sideEffectsMeans = 'this refusal is about APPLYING the reply object, not about whether the member worked: the fields that could not be applied were not applied, but a member turn played by an independent child session MAY have run tools this kernel cannot see from the parent side — read the record tracks (vibe_v5_read_library / vibe_v5_inbox) before treating this as "nothing happened"'
        }
        throw e
      }
      return { ok: true, turn, assembled: { chars: asm.text.length, sources: asm.sources.length }, instructionDelivered: asm.instructionDelivered === true, delivery: deliveryFromAttribution(),
        replyExcerpt: rawText.slice(0, REPLY_EXCERPT_MAX), replyLength: rawText.length,
        replyTruncated, replyLimitChars: REPLY_EXCERPT_MAX, replyExcerptMeans, ...tail }
    } finally {
      inFlightTurn = null
    }
  }

  /**
   * ★★★ COMPLETE THE TURN A TOOL REPORT ANSWERS (the caller-played route). This is NOT "open a turn and run it": the turn
   * already exists (it was opened by the step that handed its prompt back), so the receipt names THAT turn and no new
   * member is woken. It is the honest pairing of `supplyStructuredReply` - one side records, this side dispatches.
   */
  const completeStructuredReport = async () => {
    const pending = deliver && typeof deliver.pending === 'function' ? deliver.pending() : null
    const member = pending && typeof pending.member === 'string' && pending.member !== '' ? pending.member : null
    const turnId = pending && pending.turnId ? pending.turnId : null
    const report = takeStructuredReport(member, turnId)
    if (!report) {
      fail('VMU_TURN_NO_PENDING_MEMBER', 'no structured report is waiting for an open member turn',
        'report with vibe_vmu_turn { op:"reply", report:{…} } while the prompt is open, then call step; a pending report is completed BEFORE the next member is woken')
    }
    const turn = (turnId && turns.get(turnId)) || { id: turnId, member, round: null }
    // the prompt is ANSWERED: consume it before dispatch, so a dispatch failure cannot resurrect a question the member
    // already answered (the refusal travels on the receipt instead).
    if (typeof deliver.consumePending === 'function') deliver.consumePending()
    const parsed = { reply: Object.assign({}, report.reply), fields: Object.keys(report.reply), ignoredFields: report.ignoredFields.slice(), source: 'tool' }
    const tail = await dispatchReply({ turn, parsed, attributedTo: report.member, meeting: report.meeting === undefined ? null : report.meeting, rawText: JSON.stringify(report.reply) })
    return Object.assign({ member: report.member, meeting: report.meeting === undefined ? null : report.meeting }, tail)
  }

  /**
   * ★★★★★★★ SLV / DISPATCH: A TICK MUST NOT WAIT FOR A MODEL TURN.
   *
   * MEASURED ON A REAL HOST: multiple tick middleware (planner / methods / verify) each called run() and awaited
   * the whole model round inside a hook whose budget is 2000ms. The hook timed out but the in-flight turn was NOT
   * cancelled, so the next middleware hit the re-entrancy guard -> VMU_TURN_REENTRANT, and the three different
   * refusals (REENTRANT / NO_FENCE / BAD_JSON) looked like three unrelated bugs. They were one structure.
   *
   * dispatch(spec) OPENS the turn synchronously (a real turn id), ENQUEUES it, and returns at once. A single
   * background worker runs queued turns ONE AT A TIME (attribution / reply slot / notices are single-turn state),
   * so several dispatches in one tick are legal and cannot nest. The reply travels through turn/reply-parsed;
   * whenIdle() is a DETERMINISTIC wait for tests (never a sleep).
   */
  const dispatchQueue = []
  const dispatchStats = { queued: 0, inFlight: 0, dispatched: 0, completed: 0, failed: 0, lastError: null, oldestPending: null, recentCompleted: [] }
  let dispatchActive = false
  let idleWaiters = []
  const settleIdle = () => {
    if (dispatchActive || dispatchQueue.length > 0) return
    const waiters = idleWaiters
    idleWaiters = []
    for (const resolve of waiters) { try { resolve() } catch { /* a waiter must not break the queue */ } }
  }
  const pump = async () => {
    if (dispatchActive) return
    dispatchActive = true
    while (dispatchQueue.length > 0) {
      const item = dispatchQueue.shift()
      dispatchStats.queued = dispatchQueue.length
      dispatchStats.inFlight = 1
      dispatchStats.oldestPending = { turn: item.turn.id, member: item.turn.member, at: item.turn.at || null }
      const itemStartedAt = Date.now()
      try {
        const out = await runFrom(item.turn, item.spec)
        dispatchStats.completed += 1
        dispatchStats.recentCompleted.push({ turn: item.turn.id, member: item.turn.member, ms: Date.now() - itemStartedAt, ok: true })
        if (dispatchStats.recentCompleted.length > 10) dispatchStats.recentCompleted.shift()
        item.settle(out)
      } catch (e) {
        const code = (e && e.code) || "VMU_TURN_DISPATCH_FAILED"
        const message = String((e && e.message) || e)
        dispatchStats.failed += 1
        dispatchStats.recentCompleted.push({ turn: item.turn.id, member: item.turn.member, ms: Date.now() - itemStartedAt, ok: false, code })
        if (dispatchStats.recentCompleted.length > 10) dispatchStats.recentCompleted.shift()
        dispatchStats.lastError = { code, message, turn: item.turn.id, member: item.turn.member, at: Date.now(),
          ...(e && Number.isFinite(e.waitedMs) ? { waitedMs: e.waitedMs, deliveryTimeoutMs: e.deliveryTimeoutMs || null, requestSent: e.requestSent === true, lastPhase: e.lastPhase || null, phases: Array.isArray(e.phases) ? e.phases.slice(0, 12) : [] } : {}),
          ...(e && typeof e.replyText === 'string' ? { replyLength: Number.isInteger(e.replyLength) ? e.replyLength : e.replyText.length, hadBrace: e.hadBrace === true, replyExcerpt: e.replyText.slice(0, REFUSAL_REPLY_EXCERPT_MAX), replyTruncated: e.replyText.length > REFUSAL_REPLY_EXCERPT_MAX, replyLimitChars: REFUSAL_REPLY_EXCERPT_MAX, replyExcerptMeans: 'the reply as the member wrote it, CUT at replyLimitChars (' + REFUSAL_REPLY_EXCERPT_MAX + ') when replyTruncated is true; this is the REFUSAL excerpt (the reply could not be parsed into the declared shape), and replyLength is the FULL length', trackValue: e.trackValue === undefined ? null : e.trackValue } : {}) }
        // ★ A dispatched turn that FAILED must not vanish: its named outcome stays in status; the awaiting handle rejects.
        item.reject(e)
      } finally {
        dispatchStats.inFlight = 0
        dispatchStats.queued = dispatchQueue.length
        if (dispatchQueue.length === 0) dispatchStats.oldestPending = null
      }
    }
    dispatchActive = false
    settleIdle()
  }
  const dispatch = (spec) => {
    const { turn } = open(spec)
    dispatchStats.dispatched += 1
    const done = new Promise((resolve, reject) => {
      dispatchQueue.push({ turn, spec, settle: resolve, reject })
    })
    done.catch(() => { void 0 })
    dispatchStats.queued = dispatchQueue.length
    if (dispatchStats.oldestPending === null) dispatchStats.oldestPending = { turn: turn.id, member: turn.member, at: turn.at || null }
    void pump()
    return { ok: true, dispatched: true, turn: { id: turn.id, member: turn.member, phase: turn.phase }, queued: dispatchQueue.length, handle: done }
  }
  const whenIdle = () => new Promise((resolve) => {
    if (!dispatchActive && dispatchQueue.length === 0) { resolve(); return }
    idleWaiters.push(resolve)
  })
  const dispatchStatus = () => Object.assign({}, dispatchStats, { active: dispatchActive })

  const runOne = async (spec) => {
    // ★★★ PHASE 12 / R10: THE LIVE FACTS THE CHARTER ASKS FOR. Measured on a full live run: the member prompt carried
    // `〔未提供：roster〕` and `〔未提供：quorum〕` — the pack's charter TEMPLATE_VARS map has carried both since it was
    // written (its `quorumM()`/`rosterLine(member)` feed `{{ quorum }}`/`{{ roster }}`), but
    // NOTHING ever supplied them: `open()` defaults them to null, `step()`/`drive()` do not accept them, so a real round
    // rendered two holes where the institute's staff list and the required vote floor belong.
    // The framework does not compute these (who is on staff and what m equals are the DEPLOYMENT's facts), so it takes
    // them from the injected `turnFacts` seam. A seam that throws is a NAMED refusal, never a silent hole: an empty
    // roster would read as "no staff", which is a fact the reader cannot distinguish from a bug.
    const supplied = typeof turnFacts === 'function'
      ? (() => {
        let got
        try { got = turnFacts({ member: spec.member, phase: spec.phase }) } catch (e) {
          fail('VMU_ENGINE_UNAVAILABLE', 'the turn-facts seam failed for ' + String(spec.member) + ': ' + String((e && e.message) || e),
            'a turn-facts seam must return { roster, quorum }; the assembly refuses rather than rendering empty slots')
        }
        return got && typeof got === 'object' ? got : {}
      })()
      : {}
    // ★ R13 (second half): `rosterIds` rides beside `roster` for the same reason the seam emits both — the pack's
    // prompt policy decides the leader pair from IDS, the template renders PROSE, and neither may have to parse the
    // other. A seam that supplies only the prose form is treated as "ids unknown" (never as "ids empty").
    // ★★★ PHASE 12 / R15 (finding f): `roleLabel` rides the same seam. The prompt pipeline documents it as
    // loop-composed (kernel/prompt/index.js:40-47) and the pack rewrites `{{ role }}` into `{{ roleLabel }}` at load
    // (the pack's own core prompt module rewrites it at load), so a loop that never supplies it hands every member a hole
    // seat name belongs. Supplied as a FACT (the slot's declared label), never guessed here.
    const merged = { roster: supplied.roster === undefined ? null : supplied.roster,
      rosterIds: supplied.rosterIds === undefined ? null : supplied.rosterIds,
      chairId: supplied.chairId === undefined ? null : supplied.chairId,
      roleLabel: supplied.roleLabel === undefined ? null : supplied.roleLabel,
      quorum: supplied.quorum === undefined ? null : supplied.quorum, ...spec }
    const { turn } = open(merged)
    return runFrom(turn, spec)
  }

  /**
   * ★★★★★★★ PHASE 6 / K2 — THE RE-ENTRANCY GUARD, added in the SAME change that makes `vmu.turn` reachable from an
   * M2 middleware module. WHY IT IS NEEDED NOW AND NOT BEFORE: until this change, the turn loop was only ever driven by
   * the tool face and by the entry, which cannot re-enter it. A middleware module running on a turn hook CAN: it holds
   * `trigger-workflow` (the capability that unlocks the service catalogue) and `vmu.turn` is in it, so `run()` inside a
   * `turn/*` hook would nest one turn inside another.
   *
   * WHY REFUSE RATHER THAN FORBID SILENTLY, OR JUST ALLOW IT: this loop keeps SINGLE-TURN state that the caller cannot
   * see - `lastAttribution`, `lastReplyForMember`, the per-member notice queue - and a nested turn would overwrite them
   * under the outer turn's feet. The framework does not want to take away the legitimate use (starting a turn from a
   * declared policy is the whole point of K2); it refuses the OVERLAP by name, which leaves a caller one obvious move:
   * let the in-flight turn settle, then start the next one. SEQUENTIAL turns are completely unaffected - `drive()` and
   * `step()` call `run()` in a loop and pass through this wrapper one at a time.
   */
  let turnInFlight = false
  const run = async (spec) => {
    if (turnInFlight) {
      throw refuse('VMU_TURN_REENTRANT',
        'a turn is already in progress, so this run() would nest inside it',
        'the loop keeps ONE turn at a time (attribution, the member reply slot and the notice queue are single-turn state); call run() again after the in-flight turn settles - drive()/step() already do this for you')
    }
    turnInFlight = true
    try { return await runOne(spec) } finally { turnInFlight = false }
  }

  /**
   * ⑥ nextTurn: WHO should be woken next, by the DECLARED policy. Pure with respect to everything but the loop's own
   * counters, so the same roster and the same history choose the same member - which is what makes a multi-round run
   * reproducible. Nobody to wake is a LEGAL state (null), never an invented member and never a failure.
   */
  /**
   * FINDING (g) OF THE INSTITUTE'S OWN ACCEPTANCE REPORT (phase 12, live run 12). A selection is accepted in three
   * shapes by the people who read the docs - ["member-2"], [{ id: "member-2" }] and [{ member: "member-2" }] -
   * while EVERY consumer in this module required m.id. So the first shape was silently FILTERED OUT (the batch then
   * fell back to the default roster, which is what the agent experienced as "requested came back as the default
   * roster"), and an entry the loop genuinely could not read vanished instead of raising. One normalizer now owns the
   * shapes, and an unreadable entry is a NAMED refusal carrying the offending value - never a silent fallback.
   */
  const normalizeMembersSelection = (members) => {
    const raw = Array.isArray(members) ? members : (members === null || members === undefined ? [] : [members])
    const out = []
    const unreadable = []
    for (const m of raw) {
      const id = typeof m === 'string' ? m
        : (m && typeof m.id === 'string' ? m.id : (m && typeof m.member === 'string' ? m.member : null))
      if (typeof id === 'string' && id.trim() !== '') out.push(typeof m === 'string' ? { id: m.trim() } : { ...m, id: id.trim() })
      else unreadable.push(m)
    }
    if (raw.length > 0 && unreadable.length > 0) {
      throw refuse('VMU_INVALID_ARGUMENT', 'could not read a member id out of ' + unreadable.length + ' of the ' + raw.length + ' entries in members',
        'pass ["member-2"] or [{ id: "member-2" }] (or [{ member: "member-2" }]); unreadable: ' + JSON.stringify(unreadable).slice(0, 300))
    }
    return out
  }
  /**
   * ★★★ PHASE 12 / R16: WHICH SEAT IS THIS MEMBER IN? A caller may name a member as a bare string, so the selection
   * entry it produces carries an id and nothing else — and the pack's section policy decides the chair/temp/member
   * text from `turn.role`. Before this, "the seat was not stated" was indistinguishable from "there is no seat", and
   * the temp variant's 「你的雇主」 text landed in a 常驻研究员's prompt while its own role block said 常驻研究员.
   * The roster is the authority; a seam that cannot answer returns null (the prompt then shows an honest hole rather
   * than an invented seat).
   */
  const slotOf = (memberId) => {
    if (typeof turnFacts !== 'function' || memberId === null || memberId === undefined) return null
    let rows = null
    try { const f = turnFacts({ member: String(memberId) }); rows = f && Array.isArray(f.rosterRows) ? f.rosterRows : null } catch { return null }
    if (!rows) return null
    const row = rows.find((r) => r && String(r.id) === String(memberId))
    return row && typeof row.slot === 'string' && row.slot !== '' ? row.slot : null
  }
  const nextTurn = ({ members = [], phase = 'normal', why = null, nextStep = null, role = null, membersFrom = null } = {}) => {
    // (g): the ONE shape-owner for a selection. Plain id strings are accepted here too, because the roster default
    // must never be used as a silent substitute for a caller's explicit list.
    const list = normalizeMembersSelection(members)
    if (list.length === 0) return null
    let pick = null
    if (POLICY === 'least-recent') {
      const min = Math.min(...list.map((m) => woken.get(m.id) || 0))
      pick = list.find((m) => (woken.get(m.id) || 0) === min)
    } else {
      pick = list[cursor % list.length]
      cursor += 1
    }
    // ★ ROUND 14: the id must exist BEFORE delivery, because the delivery seam records it for the caller
    // (`pending().turnId`) and the step receipt reports the held turn by it. Minting it at the end of the call chain
    // would leave every reading null on the first delivery — which is exactly what the live run measured.
    // the explicit argument wins, then a role the caller attached to the selection entry, then the ROSTER's slot —
    // never null-by-accident while the roster knows the answer (that accident is the defect this line closes).
    const chosenRole = role || pick.role || slotOf(pick.id) || null
    return { id: 't-' + (turnSeq += 1), member: pick.id, role: chosenRole, phase, why, nextStep,
      membersFrom: membersFrom === null ? null : membersFrom }
  }

  /**
   * ⑦ drive: run SEVERAL turns, one after another, choosing each member by the policy. The bound is explicit (there
   * is no unlimited default). ★ MEASURED ON A REAL HOST (v3): one member's reply carried fields the kernel does not
   * accept, and the WHOLE drive returned `ok:false` after two successful rounds - an occasional bad reply and a broken
   * system looked identical. A failing round is now RECORDED (named code + excerpt) and the run CONTINUES; it stops
   * only when one member fails `MEMBER_FAILURE_LIMIT` rounds in a row, which is the signal that the member (not the
   * batch) is broken. The final receipt distinguishes `roundsRun` (successful) from `roundsAttempted`.
   */
  const MEMBER_FAILURE_LIMIT = 3
  const drive = async ({ members = [], rounds = 1, phase = 'normal', why = null, nextStep = null, role = null } = {}) => {
    // (g): the batch route owns the same shape rule as step(), so a batch also accepts plain id strings and refuses an
    // unreadable entry by name instead of falling back to the default roster.
    const selection = normalizeMembersSelection(members)
    const n = Number(rounds)
    if (!Number.isInteger(n) || n < 1) {
      fail('VMU_INVALID_ARGUMENT', 'rounds must be a positive integer: the bound is stated, never assumed',
        'pass { rounds: N } (docs/26 section 3.2 invariant 2)')
    }
    const receipts = []
    const failures = []
    const consecutive = new Map()
    // ★★ LANE turn-reply: A PENDING TOOL REPORT IS ALREADY ONE COMPLETED ROUND. Complete it BEFORE the loop, so a caller
    // that drives in a loop does not keep asking for prompts it has already answered (the report would otherwise never be
    // dispatched). It is reported separately as `completed` and does NOT count as a round: no member was woken for it.
    let completed = null
    const waiting = awaitingStructuredReport()
    if (waiting) {
      try {
        const done = await completeStructuredReport()
        completed = { member: done.member, meeting: done.meeting === undefined ? null : done.meeting,
          meetingMeans: (done.meeting === undefined || done.meeting === null)
            ? 'the completed report was not bound to a meeting'
            : 'the completed report was bound to the named meeting; its say became that member\'s speech (see executed[].onBehalf)',
          fields: done.fields, executed: (done.executed || []).length, executedDetail: (done.executed || []).slice(0, 5), executedDetailTruncated: (done.executed || []).length > 5, executedMeans: EXECUTED_MEANS, skipped: (done.skipped || []).length, effects: (done.effects || []).slice(), coercions: (done.coercions || []).slice(), coercionsMeans: COERCIONS_MEANS,
          turn: done.turn ? done.turn.id : null, source: 'tool' }
      } catch (e) {
        const code = (e && e.code) || null
        const message = String((e && e.message) || e)
        return { ok: false, code, message, completed: null, receipts, failures: [{ round: 0, member: null, code, message: message.slice(0, 300) }],
          roundsRun: 0, roundsAttempted: 0, hint: (e && e.hint) || null }
      }
    }
    for (let i = 1; i <= n; i += 1) {
      const spec = nextTurn({ members: selection, phase, why, nextStep, role })
      // ★★ ROUND 45: AN EMPTY ROUND MUST SAY WHERE MEMBERS COME FROM. `no-members` is true, but on its own it leaves a
      // reader unable to act - the real machine called this face sixty-one times and learned nothing from it. The
      // hint names the two things that actually help: read the roster, and pass it (the tool face now infers it from
      // the roster too, so omitting it works; this hint is for the case where the roster itself is empty).
      if (!spec) return { ok: true, receipts, failures, completed, stopped: 'no-members', roundsRun: receipts.filter((r) => !r.failed).length, roundsAttempted: receipts.length,
        next: { kind: 'roster', tool: 'vibe_vmu_control', hint: 'no member was passed AND the kernel roster holds no live member: read it with vibe_vmu_control { action: "roster" }, seat one with { action: "hire", member_id, slot } (the pack declares the slots), then retry. Passing an explicit `members` array also works.' } }
      try {
        const r = await run({ ...spec, round: i })
        // ★ ROUND 73: a caller-played turn ENDS the batch - the prompt goes back and the round resumes on the next call.
        if (r && r.awaiting) return { ok: true, awaiting: true, memberPrompt: r.memberPrompt || null, deliveryPath: r.deliveryPath || (r.attribution && r.attribution.deliveryPath) || null, receipts, failures, completed, roundsRun: receipts.filter((x) => !x.failed).length, roundsAttempted: receipts.length, round: i, member: spec.member }
        receipts.push({ round: i, member: spec.member, fields: r.fields, executed: r.executed.length, skipped: r.skipped.length, effects: (r.effects || []).slice(), coercions: (r.coercions || []).slice(), coercionsMeans: COERCIONS_MEANS, turn: r.turn.id, source: r.source || null,
          // ★ PHASE 12 / run 37: the same detail the step receipt now carries - a batch receipt is read by the same person.
          skippedDetail: r.skipped.slice(0, 5), skippedDetailTruncated: r.skipped.length > 5,
          notes: (r.notes || []).slice(0, 5), notesMean: r.notesMean || null })
        consecutive.set(spec.member, 0)
      } catch (e) {
        counts.refused += 0
        const code = (e && e.code) || null
        const message = String((e && e.message) || e)
        // ★ THE FAILED ROUND IS NOT A SUCCESS: no `fields`/`executed`/`turn`, and `failed:true` so a reader can tell it
        // apart from a round that ran. The excerpt is bounded (a receipt is not a log file).
        receipts.push({ round: i, member: spec.member, failed: true, code, message: message.slice(0, 300) })
        failures.push({ round: i, member: spec.member, code, message: message.slice(0, 300) })
        const streak = (consecutive.get(spec.member) || 0) + 1
        consecutive.set(spec.member, streak)
        if (streak >= MEMBER_FAILURE_LIMIT) {
          return { ok: false, stopped: 'member-failures', member: spec.member, round: i, code, message: message.slice(0, 300),
            receipts, failures, completed, roundsRun: receipts.filter((x) => !x.failed).length, roundsAttempted: receipts.length,
            hint: 'the SAME member failed ' + streak + ' rounds in a row; a batch is not stopped by one bad reply, but a member that cannot answer three times in a row is reported (docs/26 section 3.2)' }
        }
      }
    }
    return { ok: true, receipts, failures, completed, roundsRun: receipts.filter((x) => !x.failed).length, roundsAttempted: receipts.length }
  }

  /**
   * The failure shape a failed STEP returns (a failed round is an operational outcome, returned rather than thrown).
   * Factored out so the report-completion route and the ordinary route report failures identically.
   */
  const stepFailure = (e) => {
    // ★★★ ROUND 61: THE STACK STAYS. This catch kept only the message, and that is precisely why a real machine's
    // failure was undiagnosable: the transcript recorded `Cannot read properties of undefined (reading 'id')` thirty-
    // three times with no frame, no file and no line, and several rounds went into reading candidate sites by hand.
    // A slice of the stack costs a few hundred bytes on a FAILED round only, and it converts "a TypeError happened
    // somewhere" into "this line, in this function". The bound is deliberate: a stack from a deep async chain can be
    // long, and a receipt is not a log file.
    const stack = typeof e === 'object' && e && typeof e.stack === 'string'
      ? (function () { const all = String(e.stack).split('\n'); const head = all.slice(0, 8).map((l) => l.trim()); const ci = all.findIndex((l) => /caused by/.test(l)); const tail = ci >= 0 ? all.slice(ci, ci + 5).map((l) => l.trim()) : []; return head.concat(tail).join(' | ').slice(0, 1400) })()
      : null
    // ★★★★★★★ LIVE RUN 16 (§107) — THE FAILURE RECEIPT MUST NAME ITS DELIVERY PATH TOO. The seam already knew:
    // `host-deliver.js:283` sets `err.deliveryPath = 'one-shot'`, `err.deliveryPathMeans`, `err.waitedMs`,
    // `err.deliveryTimeoutMs`, `err.partial{…}` and `err.roundConsumed/roundCompleted`. None of it travelled, so the
    // institute's own report read: 「超时回执 `ok:false` … `deliveryPath` 与 `deliveryPathMeans` 两个字段在失败回执里都
    // 不存在（`receipt:null`，只有 `hint`＋`closureVote`）」 and had to go hunting in `status.deliveryLastFail`. Same
    // defect family as run 37's count-only `skipped` and run 46's awaiting-only delegation: the answer existed one
    // layer down and did not travel to the receipt an operator actually reads. A failure that cannot name HOW it was
    // attempted is not diagnosable.
    const failureDelivery = (e && typeof e === 'object' && e) ? {
      deliveryPath: typeof e.deliveryPath === 'string' ? e.deliveryPath : null,
      deliveryPathMeans: typeof e.deliveryPathMeans === 'string' ? e.deliveryPathMeans : null,
      waitedMs: Number.isFinite(e.waitedMs) ? e.waitedMs : null,
      deliveryTimeoutMs: Number.isFinite(e.deliveryTimeoutMs) ? e.deliveryTimeoutMs : null,
      deliveryGraceMs: Number.isFinite(e.deliveryGraceMs) ? e.deliveryGraceMs : null,
      round: Number.isFinite(e.round) ? e.round : null,
      roundConsumed: e.roundConsumed === true ? true : (e.roundConsumed === false ? false : null),
      roundCompleted: e.roundCompleted === false ? false : (e.roundCompleted === true ? true : null),
      requestSent: e.requestSent === true ? true : (e.requestSent === false ? false : null),
      lastPhase: typeof e.lastPhase === 'string' ? e.lastPhase : null,
      partial: e.partial && typeof e.partial === 'object' ? e.partial : null,
    } : null
    return { ok: false, code: e && e.code, message: String((e && e.message) || e), receipt: null, stack,
      ...(failureDelivery && (failureDelivery.deliveryPath || failureDelivery.deliveryPathMeans) ? failureDelivery : {}),
      ...(e && typeof e.hint === 'string' ? { hint: e.hint } : {}),
      ...(e && typeof e.replyText === 'string' ? { replyLength: e.replyLength, hadBrace: e.hadBrace, replyExcerpt: e.replyText.slice(0, REFUSAL_REPLY_EXCERPT_MAX), replyTruncated: typeof e.replyText === 'string' ? e.replyText.length > REFUSAL_REPLY_EXCERPT_MAX : null, replyLimitChars: REFUSAL_REPLY_EXCERPT_MAX, replyExcerptMeans: 'the reply as the member wrote it, CUT at replyLimitChars (' + REFUSAL_REPLY_EXCERPT_MAX + ') when replyTruncated is true; this is the REFUSAL excerpt (the reply could not be parsed into the declared shape), and replyLength is the FULL length', trackValue: e.trackValue } : {}),
      // ★★★ ROUND 38: the refusal object carries the side-effect disclosure (see attachReplyDiagnostics); it must also
      // reach the FAILURE RECEIPT, because that is the object an operator actually reads. A disclosure that stops one
      // layer down is the same defect family as run 23's hint and run 29's child id.
      ...(e && e.sideEffectsUnverified === true ? { sideEffectsUnverified: true, sideEffectsMeans: typeof e.sideEffectsMeans === 'string' ? e.sideEffectsMeans : null } : {}) }
  }

  /**
   * ⑧ step: EXACTLY ONE round, chosen by the policy - the shape a scheduler tick wants (docs/26 section 3.3). The
   * host owns WHEN (the clock is a seam by design: `vmu.schedule.timeSource` is tick-only), the policy owns WHO, and
   * the pipeline owns WHAT PROMPT. A round that fails is RETURNED rather than thrown, because a failed round is an
   * operational outcome; a malformed ARGUMENT still throws, because that is a programming error.
   */
  const step = async ({ members = [], member = null, membersInferred = false, membersFrom = null, selectionShape = null, phase = 'normal', why = null, nextStep = null, role = null } = {}) => {
    // ★★★ LIVE RUN 23 (the institute's own report, item 2): THE CHAIR RAIL'S HINT NAMED A PARAMETER THAT DID NOT EXIST.
    // `VMU_CHAIR_ACT_NOT_DELEGATED` tells the caller to "give the chair its own turn first:
    // `vibe_vmu_turn {op:"step", member:"academician-1"}`" — singular `member`. This signature had no `member`, so the
    // call was read as "nobody chose", the roster default awakened EVERY member, and the receipt explained that as
    // `requestedMembersSource:"roster-default"` (disclosed, but the caller's intent was silently lost). A hint that
    // cannot be executed is a broken promise, so the singular shorthand is accepted HERE — one place, honoured by both
    // faces — and it WINS over nothing: an explicit `members` list still wins (a caller who named a list meant the list).
    // ★★ RUN 30 (the institute's own report, item ②(?)): the face now sends a singular `member` as a one-seat
    // selection, and the receipt said "the caller named `members`" for it — the behaviour was right and the SENTENCE was
    // wrong, so a reader could not tell which parameter produced the selection. The two facts are captured here, before
    // the shorthand rewrites `members`, and the note at the bottom is derived from them instead of from `selectionSource`
    // alone (roster-default vs everything-else is not a complete account of HOW the caller spoke).
    const namedSingleMember = member !== null && member !== undefined && String(member).trim() !== ''
    const namedMemberList = Array.isArray(members) && members.length > 0
    // ★★ RUN 30 (the institute's own report, item ②): THE SHAPE BELONGS TO THE CALLER, NOT TO THIS ARGUMENT LIST.
    // The tool face normalises a singular `member` into a one-seat `members` list before calling here (the run-29 fix),
    // so `namedMemberList` is TRUE for both shapes and the receipt credited `members` to a caller that had passed
    // `member`. The face knows which parameter the caller read and says so in `selectionShape`; when that name is one of
    // the two real shapes it WINS. A caller that reaches this function directly (no face) passes no shape, and then the
    // two facts above are the only evidence there is — same derivation as before.
    const namedShape = (selectionShape === 'member' || selectionShape === 'members')
      ? selectionShape
      : (namedMemberList ? 'members' : (namedSingleMember ? 'member' : null))
    if (namedSingleMember && !namedMemberList) {
      members = [{ id: String(member).trim() }]
      membersInferred = false
    }
    // (g): the selection is normalized BEFORE the branch, so an unreadable entry is refused on BOTH routes (a malformed
    // list used to be filtered only on the pending route and to fall through to the default roster everywhere else).
    const selection = normalizeMembersSelection(members)
    // ★★ LIVE RUN 40 (the institute's own report): THE FACE INFERS THE ROSTER, THE KERNEL CALLS IT A REQUEST. When a
    // caller omits `members`, the tool face fills them in from the live roster (because an empty list must not read as
    // "this institute has nobody"). That inferred list then travelled as if the caller had chosen it, so the completion
    // receipt printed `selectionIgnored.requested: ["member-1","member-2"]` — the DEFAULT roster — and a reader could not
    // tell "the caller asked for these two" from "nobody asked, the default applied". The face now says which it was, and
    // an inferred list is not a request: no `selectionIgnored`, and the source is named.
    // ★★★ RUN 45 (a FRESH institute): an explicit selection naming a member who is NOT on the roster was delivered
    // anyway, and the delivery sat out the full timeout (180 s) waiting for a child session that never existed. The loop
    // is given the roster through `turnFacts`; it must REFUSE BY NAME before waking anybody. Skipped when the seam
    // cannot report a roster (an absent seam is not evidence that everyone is unknown).
    if (membersInferred !== true && selection.length > 0 && typeof turnFacts === 'function') {
      let liveRoster = null
      try {
        const facts = turnFacts({})
        liveRoster = facts && Array.isArray(facts.rosterIds) ? facts.rosterIds.map(String) : null
      } catch { liveRoster = null }
      if (liveRoster && liveRoster.length > 0) {
        const unknown = selection.map((m) => String(m.id)).filter((id) => liveRoster.indexOf(id) === -1)
        if (unknown.length > 0) {
          throw refuse('VMU_TURN_UNKNOWN_MEMBER', 'not on the roster: ' + unknown.join(', '),
            'live roster: ' + liveRoster.join(', ') + ' - select from that list (or hire first); delivering to an unknown member only burns the delivery timeout')
        }
      }
    }
    const selectionSource = membersInferred === true ? 'roster-default' : 'explicit'
    const requestedIds = membersInferred === true ? [] : selection.map((m) => m.id)
    // ★★ LANE turn-reply — A REPORT THAT ANSWERS THE OPEN PROMPT COMPLETES **THAT** TURN. Without this guard every step
    // would hand back a NEW prompt before the previous answer was dispatched, so a tool report could never be applied at
    // all (the caller-played route answers its prompt on the NEXT call). No turn is opened here: the member was already
    // woken by the step that returned its prompt, and the receipt names the turn that was ANSWERED, not a fresh one.
    const waiting = awaitingStructuredReport()
    if (waiting) {
      try {
        const r = await completeStructuredReport()
        // ★ LIVE RUN 7 (agent feedback item k): the acceptance agent passed `members:[{id:'member-2',…}]` and got
        // member-1's settlement receipt back, with nothing in the receipt saying the selection had not been applied.
        // `members` chooses who receives the NEXT prompt; completing a pending report cannot change whose report it was.
        // The reading now names both facts instead of leaving the caller to infer them.
        // ★★ FINDING (g) OF THE INSTITUTE'S OWN ACCEPTANCE REPORT (phase 12, live run 12). Two defects here:
        // ① the parser accepted ONLY `{id}` objects, so the ordinary `members: ["member-2"]` (and `[{member:"…"}]`)
        //    produced an EMPTY list — the selection silently vanished, and `selectionIgnored` then read `null` while the
        //    caller believed it had asked for someone. ② when NO id could be read out of a NON-empty `members`, the old
        //    code fell through to the ordinary path and opened a turn for the DEFAULT roster, which is exactly the
        //    "silently replaced my request" the agent reported. A selection the loop cannot honour is now a NAMED
        //    refusal (`VMU_INVALID_ARGUMENT`) that says which entries were unreadable — never a silent fallback.
        const requested = requestedIds
        // ★★ PHASE 12 / R24 (the institute's own run-17 report, item 4): `selectionIgnored` carried
        // `pending:null` beside a non-null `pendingMember` on the completion route, because `r.turn` is the turn ID
        // STRING here (it comes from apply()'s tail), not an object with `.id` - so the id was silently dropped.
        // One reader for the id, and when it is genuinely unknown the receipt says so instead of leaving null.
        const completedTurnId = (() => {
          if (r) {
            if (typeof r.turn === 'string' && r.turn !== '') return r.turn
            if (r.turn && typeof r.turn === 'object' && r.turn.id !== undefined && r.turn.id !== null) return r.turn.id
            if (r.receipt && r.receipt.turn !== undefined && r.receipt.turn !== null) return r.receipt.turn
          }
          // ★★ LIVE RUN 39, a reading-risk the institute reported: the completion receipt carried `receipt.turn: null`
          // while `selectionIgnored.pendingUnknown` said "the completed turn carried no id on any field this receipt
          // reads". The id was NOT unknowable — the reply receipt had named it, and the held prompt carries it as
          // `pending.turnId`. Reading it from the held prompt is the honest source: this receipt is the settlement OF
          // that turn, so its own id is the one being settled. The generic readers above stay first so a settlement
          // that names the turn itself still wins.
          const heldId = waiting && waiting.pending && waiting.pending.turnId
          if (typeof heldId === 'string' && heldId !== '') return heldId
          return null
        })()
        // ★ LIVE RUN 9, finding A: the ledger (§33 row k) and the acceptance task file both name a structured
        // `selectionIgnored{requested,reason,pending}`, while the receipt only carried three PARALLEL scalars. The
        // agent therefore recorded "the promised reading is absent" — a doc that names a field the code never emits is
        // the same defect class as §33's `allFor`. The scalars stay (consumers exist, and they are the same facts); the
        // structured object is ADDED so the promised name resolves, with the pending turn NAMED rather than implied.
        return { ok: true, source: 'tool', completed: true,
          requestedMembers: requested,
          requestedMembersSource: selectionSource,
          selectionApplied: requested.length === 0,
          selectionIgnored: requested.length === 0 ? null : {
            requested,
            pending: completedTurnId,
            pendingUnknown: completedTurnId === null ? 'the completed turn carried no id on any field this receipt reads' : null,
            pendingMember: r.member === undefined ? null : String(r.member),
            reason: 'the pending report belonged to ' + String(r.member) + ': `members` selects who receives the NEXT prompt, and completing an already-issued prompt cannot change whose report it was',
          },
          selectionNote: requested.length === 0 ? null
            : 'the pending report belonged to ' + String(r.member) + ', so `members` did not apply to this call - it selects who gets the NEXT prompt; call step again to apply it',
          // ★ LIVE RUN 38 (the institute's own report, ㉙.1): THIS route was the false green. The ordinary `step()`
          // receipt had been fixed to carry `skippedDetail`/`notes`, and the turn suite asserted exactly that route — but
          // the shape a member actually meets on the taught path is: `op:"reply"` records the report, and the NEXT
          // `op:"step"` completes the held turn. That completion receipt reduced the skip to a COUNT again, so the
          // institute saw `"skipped":1` with all four detail fields ABSENT (and `receiptMeta.truncated:false`, proving
          // nothing was cut). A reading that exists on one of three routes is not a mechanism; the same four fields are
          // emitted here, built from the same recorded detail.
          meeting: r.meeting === undefined ? null : r.meeting,
          meetingMeans: (r.meeting === undefined || r.meeting === null)
            ? 'the completed report was NOT bound to a meeting, so a bare say was kept (see receipt.notes), never dispatched'
            : 'the completed report was bound to the named meeting: the member\'s bare say was recorded as THAT MEMBER\'S speech (see receipt.executed[].onBehalf)',
          receipt: { round: r.turn && r.turn.round !== undefined ? r.turn.round : null, member: r.member, meeting: r.meeting === undefined ? null : r.meeting, fields: r.fields,
            executed: (r.executed || []).length, executedDetail: (r.executed || []).slice(0, 5), skipped: (r.skipped || []).length, effects: (r.effects || []).slice(), coercions: (r.coercions || []).slice(), coercionsMeans: COERCIONS_MEANS, instructionDelivered: false,
            skippedDetail: (r.skipped || []).slice(0, 5),
            skippedDetailTruncated: (r.skipped || []).length > 5,
            notes: (r.notes || []).slice(0, 5),
            notesMean: r.notesMean || null,
            turn: completedTurnId, source: 'tool', completed: true } }
      } catch (e) { return stepFailure(e) }
    }
    // ★ LIVE RUN 13 (the institute's own report, ⑦.3 and item 1): on THIS route two facts were unreadable. (a)
    // `selectionIgnored` existed only on the structured-report route, so a caller that passed `members` while holding an
    // unanswered prompt saw nothing at all. (b) the held prompt was superseded with no trace — the round simply vanished,
    // and `pending: null` (the field the ledger promises) could not say which turn it was. Both are named here: `pending`
    // always says which prompt the caller is holding, `selectionIgnored` appears exactly when that prompt is NOT in the
    // explicit selection (so it is about to be dropped), and `superseded` names the dropped turn instead of losing it.
    // ★★★ LIVE RUN 42 (the institute's own report, ㉝.1 item (c)1): every `step` receipt carried
    // `requestedMembersSource` and NONE carried `requestedMembers` — so a caller could read WHICH way the selection was
    // decided but not WHAT it resolved to, and the one branch that did emit the list (the settlement route, below) was
    // unreachable under activation delivery. The list is the resolved selection (an empty `members` becomes the
    // roster-default list), so it is derived here once and spread on every route.
    const selectionReadings = {
      ...selectionReadingsOf(deliver && typeof deliver.pending === 'function' ? deliver.pending() : null, requestedIds),
      requestedMembers: requestedIds.slice(),
      requestedMembersSource: selectionSource,
      // ★★ TWO lists, because the two questions are different and one field cannot answer both: `requestedMembers` is
      // what the CALLER asked for (empty when the face inferred the roster — §run-40 made that distinction load-bearing
      // for `selectionIgnored`), `resolvedMembers` is the list this step actually prompts. Without the second list a
      // caller reading `requestedMembersSource:'roster-default'` still could not see WHICH seats the default resolved to.
      resolvedMembers: selection.map((m) => m.id),
      // ★★ RUN 30: three ways to name a selection, three sentences. The old pair said "the caller named `members`" even
      // when the caller had used the SINGULAR `member` the framework's own hints teach (VMU_CHAIR_ACT_NOT_DELEGATED), so
      // the receipt named a parameter nobody passed. `namedMemberList`/`namedSingleMember` are read before the shorthand,
      // so the sentence describes the CALL, not the normalised result.
      requestedMembersNote: selectionSource === 'roster-default'
        ? 'no `members` was given, so requestedMembers is EMPTY by design (an inferred selection is not a request) and resolvedMembers is the roster default this step prompts'
        : (namedShape === 'members'
          ? 'the caller named `members`; requestedMembers and resolvedMembers are the same list after normalisation (strings, {id} and {member} all land as ids)'
          : (namedShape === 'member'
            ? 'the caller named `member` (SINGULAR: one seat), so requestedMembers and resolvedMembers are that one id — this is not an inferred selection and not a list, the shorthand for "wake this one member"'
            : 'the caller named a selection through some other shape; requestedMembers and resolvedMembers are the same list after normalisation')),
    }
    const spec = nextTurn({ members, phase, why, nextStep, role, membersFrom })
    // ★★ LIVE RUN 47 (the institute's own report ㉿.2): the face DOES name where the selection came from
    // (`caller-selection` | `roster-default`), but the reading was looked up on the RUN result instead of on the SPEC
    // that carries it, so every live receipt read `membersFrom: null` - present but empty, the worst of both.
    const membersFromReading = spec && typeof spec.membersFrom === 'string' ? spec.membersFrom : (typeof membersFrom === 'string' ? membersFrom : null)
    if (!spec) return { ok: true, receipt: null, stopped: 'no-members', ...selectionReadings }
    // ★ G7 ④: clear this member's tool-call index at the START of the step, so the receipt reports THIS turn only.
    if (typeof clearMemberToolCalls === 'function') { try { clearMemberToolCalls(spec.member) } catch { /* diagnostics only */ } }
    const toolCallSummary = () => {
      const rows = typeof memberToolCalls === 'function' ? (memberToolCalls(spec.member) || []) : []
      const byName = new Map()
      for (const r of rows) {
        if (!r || typeof r.name !== 'string') continue
        const cur = byName.get(r.name) || { name: r.name, called: 0, receipts: 0, ok: null }
        if (r.phase === 'result') { cur.receipts += 1; cur.ok = r.ok === true ? true : (r.ok === false ? false : null) }
        else cur.called += 1
        byName.set(r.name, cur)
      }
      // ★ THE 30-NAME CAP MUST ANNOUNCE ITSELF. A receipt showing thirty tool names with no marker reads as
      // "that is every tool the member called", which is the same silent-truncation defect records.list,
      // read_library and triedEngines already had fixed. The cap stays (a receipt must stay bounded); the
      // total and a truncated flag travel with it.
      const allCalls = [...byName.values()]
      const cappedCalls = allCalls.slice(0, 30)
      return { list: cappedCalls, total: allCalls.length, truncated: allCalls.length > cappedCalls.length }
    }
    try {
      const r = await run({ ...spec, round: turns.size + 1 })
      // ★★★ ROUND 73: a caller-played turn is a LEGAL outcome, not a receipt with empty fields. It is surfaced as such so
      // the caller knows to play the member turn and answer on the next call.
      // ★ ROUND 88: and it NAMES THE ROUTE that handed the prompt back, so "which delivery path ran" is read from the
      // receipt the agent actually sees rather than inferred from prose in a transcript.
      const tcs = toolCallSummary()
      // ★★★★★★★ LIVE RUN 15 (the institute's own report, item ⑦): THE COUNT WAS SILENTLY SCOPED AND THE INSTITUTE READ IT
      // AS A FACT ABOUT THE MEMBER. Activation delivery runs the member in its OWN kernel instance, so this kernel sees
      // ZERO of its calls and the receipt said `toolCalls: [], toolCallsTotal: 0` with no scope — the office concluded
      // 「真干活没有发生」 while the child session had made tens of thousands of calls. An empty list is a claim, and this
      // one was false in the only mode where it matters. The count stays (it is honest about THIS kernel) and the scope
      // travels with it, in the same shape `skippedDetail`/`triedEngines`/`records.list` truncation already uses.
      // ★ LIVE RUN 16 (§107): the path is read from THREE places — a seam may report it on `delivery`, on the bare
      // `deliveryPath`, or on the attribution block — and a null path must NOT be described as a child kernel (that
      // would be a new lie in place of the old silence).
      const deliveredThrough = (r && r.delivery && typeof r.delivery.path === 'string' && r.delivery.path)
        || (r && typeof r.deliveryPath === 'string' && r.deliveryPath)
        || (r && r.attribution && typeof r.attribution.deliveryPath === 'string' && r.attribution.deliveryPath)
        || null
      // ★ ANY path except the caller-played one runs the member in a different kernel: `one-shot`, `activation` and
      // `continuable` all start a child session (the receipt names it in delivery.childId). Listing two of the three by
      // hand would have re-introduced exactly the defect this comment exists to prevent — a reading correct in the mode
      // it was measured in and silently wrong in the neighbouring one.
      const { scope: toolCallsScope, note: toolCallsNote } = toolCallsScopeOf(deliveredThrough)
      // ★ LIVE RUN 16 (§107, ⑦): computed ONCE and spread on BOTH levels — the settled return puts the office-facing
      // fields inside `receipt`, while the awaiting return puts them at the top; the office was reading one level, the
      // institute's report the other, and until now NEITHER level named the member's own calls at all.
      const memberCallsReading = {
        memberToolCalls: null,
        memberToolCallsTotal: null,
        memberToolCallsMeans: deliveredThrough === 'caller'
          ? 'the caller played this member turn, so the member\'s calls ARE this kernel\'s calls — read toolCalls/toolCallsTotal (scope "member-kernel")'
          : (deliveredThrough === null
              ? 'the delivery seam did not name a path on this receipt, so this kernel cannot say whether the member ran here or in a child session — read `delegation` for what the seam did report; null here means NOT READABLE, never "zero calls"'
              : 'the member ran in a SEPARATE kernel instance (delivery.path="' + String(deliveredThrough) + '"), so its call list lives in the child session log; null here means NOT READABLE FROM THIS RECEIPT, never "zero calls"'),
        // ★★ LIVE RUN 19 (the institute's own report, ⑩.1/⑬.3): THIS FIELD WAS null WHILE THE SAME RECEIPT CARRIED
        // `delegation.childId` — the reader looked for `delivery.childSessionId`/`delivery.sessionId` and the seam
        // reports `delivery.childId`. Third instance of one family in this phase: "the answer existed one layer down
        // and did not travel". All three spellings are read, and `childSessionIdMeans` now NAMES the source so a
        // reader can tell an absent id from an unread spelling.
        childSessionId: (() => {
          const d = (r && r.delivery) || null
          if (!d) return null
          const v = d.childSessionId || d.sessionId || d.childId
          return v === undefined || v === null || v === '' ? null : String(v)
        })(),
        childSessionIdMeans: (() => {
          const d = (r && r.delivery) || null
          const v = d ? (d.childSessionId || d.sessionId || d.childId) : null
          if (v !== undefined && v !== null && v !== '') {
            const which = d.childSessionId ? 'delivery.childSessionId' : (d.sessionId ? 'delivery.sessionId' : 'delivery.childId')
            return 'the child session/agent that ran this member turn (read from ' + which + '); read its log for the call list'
          }
          return deliveredThrough === 'caller'
            ? 'not applicable: the caller played this turn in THIS kernel, so there is no child session'
            : 'the delivery seam reported no child id on this receipt (checked delivery.childSessionId, delivery.sessionId, delivery.childId) — null means NOT READABLE, not "no child"'
        })(),
      }
      // ★★★★★★★ LIVE RUN 28 (the institute's own report, items 4/8): AFTER TWO REAL TURNS THE MEMBER-TOOL FACE STILL
      // ANSWERED `no live Agent for member acad-01 (session=(none learned yet))`, WHILE THE STEP RECEIPT CARRIED
      // `childSessionId`. The learning inside `deliverAndParse` reads `lastAttribution.childId`, which the activation
      // path does not always fill, so the map stayed empty and three member-tool faces became unreadable on the real
      // machine for the whole run. The receipt ALREADY holds the answer one level down — it is learned here as well,
      // from whichever spelling the receipt reported. Same family as this field's own comment ("the answer existed one
      // layer down and did not travel"); now it travels into the map that the faces read.
      if (memberCallsReading.childSessionId && spec && typeof spec.member === 'string') {
        try { memberSessions.set(spec.member, memberCallsReading.childSessionId) } catch { /* diagnostics only */ }
      }
      // ★★★ LIVE RUN 29 (the institute's own acceptance brief, step ⑥): the office asked
      // `vibe_vmu_tools {member:"res-01"}` after two real turns and the answer still read
      // `no live Agent for member res-01 (session=(none learned yet))` - and NOTHING in the run showed whether the step
      // had taught the kernel a child id or not. The map is the only link between a member id and its child session, and
      // it had no reading of its own: the fact could only be discovered by asking a DIFFERENT tool and parsing a
      // refusal. Two fields close that hole. `memberSession` is what THIS kernel holds for the member AFTER this step
      // (so a non-null value here and a refusal over there are a contradiction a reader can see, not guess at);
      // `memberSessionMeans` states the scope (in-memory, per kernel instance) and what null means. Both are computed
      // AFTER the learning above, deliberately: a field that reports the state as it was before the step would say
      // "learned nothing" on the very step that learned it.
      memberCallsReading.memberSession = (() => {
        const id = spec && typeof spec.member === 'string' ? spec.member : null
        if (!id) return null
        try { return memberSessions.get(id) || null } catch { return null }
      })()
      memberCallsReading.memberSessionMeans = (() => {
        const id = spec && typeof spec.member === 'string' ? spec.member : null
        if (!id) return 'this step opened no turn (no member was selected), so there is no member session to report'
        if (memberCallsReading.memberSession) {
          return 'the child session this kernel holds for "' + id + '" (in memory, per kernel instance; learned from this or an earlier step receipt). `vibe_vmu_tools {member:"' + id + '"}` reads the same map - a null there while this field is non-null is a contradiction in this receipt, not a property of the member'
        }
        return 'NOT LEARNED YET for "' + id + '": the delivery seam reported no child id for this member on any turn THIS kernel ran. `vibe_vmu_tools` will refuse for it - that refusal describes the absence of a reading, never a member who sees nothing'
      })()
      // ★★★★★★★ TASK-13 / LIVE RUN 31 — THE READING THAT ANSWERS "DID THIS TURN CONTINUE THE MEMBER, OR START IT OVER?"
      // Run 31's office had to answer that question by cross-reading the host's session list AFTER the run, and what it
      // found was acad-01 and res-01 each running in two different child sessions: every turn restarted the member, so
      // v5r's "advance independently and archive what you tried" had no carrier. The step receipt carried
      // `childSessionId` (where this turn ran) and `memberSession` (what the kernel holds afterwards) and NEITHER said
      // whether those are the same session — the comparison is the finding, and it lives here.
      //   `offered` — the session the kernel handed the delivery seam BEFORE this turn (null = nothing learned yet);
      //   `ranIn`   — where the turn actually ran, from the seam's own childId (`delivery.childId`);
      //   `reused`  — the comparison: TRUE only when they are the same session; NULL when either side is unreadable.
      // `why`/`fix` are the seam's named boundary when it could not continue (host lacks a reply-capable resume), so a
      // reader is never left to conclude "the framework forgot".
      memberCallsReading.continuation = (() => {
        const fromReturn = (r && r.delivery && r.delivery.continuation && typeof r.delivery.continuation === 'object')
          ? r.delivery.continuation
          : ((r && r.continuation && typeof r.continuation === 'object') ? r.continuation : null)
        const ranIn = memberCallsReading.childSessionId
        if (!fromReturn) {
          return {
            offered: null, offeredMeans: null, ranIn, reused: null, applied: false,
            how: null, cause: 'seam-reported-no-continuation',
            why: 'the delivery returned no continuation reading, so whether this turn continued the member\'s learned session is UNREADABLE from this receipt — null is not "started fresh", and it is not "continued"',
            fix: 'the reading is built by `deliverTurn` from the seam\'s `continuation` field; a seam that omits it makes the turn\'s continuity unreadable (docs/26 §3.22)',
          }
        }
        const offered = typeof fromReturn.offered === 'string' && fromReturn.offered !== '' ? fromReturn.offered : null
        return {
          offered,
          offeredMeans: typeof fromReturn.offeredMeans === 'string' ? fromReturn.offeredMeans : null,
          ranIn,
          reused: offered === null || ranIn === null ? null : String(ranIn) === String(offered),
          applied: fromReturn.applied === true,
          how: typeof fromReturn.how === 'string' ? fromReturn.how : null,
          cause: typeof fromReturn.cause === 'string' ? fromReturn.cause : null,
          why: typeof fromReturn.why === 'string' ? fromReturn.why : null,
          fix: typeof fromReturn.fix === 'string' ? fromReturn.fix : null,
          // ★ TASK-16 / 裁决 1: the host's own refusal code when a resume failed and the turn was downgraded explicitly.
          hostCode: typeof fromReturn.hostCode === 'string' ? fromReturn.hostCode : null,
          // ★ TASK-16: "the host cannot resume" is a MEASUREMENT, so the measured facts travel with it: which verbs the
          // host actually offers, and which piece of the composed resume this deployment is missing. Without these the
          // receipt could only say that nothing continued, and the next reader would have to re-derive why.
          session: typeof fromReturn.session === 'string' ? fromReturn.session : null,
          hostVerbs: Array.isArray(fromReturn.hostVerbs) ? fromReturn.hostVerbs.slice() : null,
          capability: fromReturn.capability && typeof fromReturn.capability === 'object' ? fromReturn.capability : null,
        }
      })()
      memberCallsReading.continuationMeans = (() => {
        const c = memberCallsReading.continuation
        if (c.reused === true) {
          return 'THIS TURN CONTINUED THE MEMBER: it ran in ' + String(c.ranIn) + ', the session this kernel already held for the member, so the member kept its own memory of earlier turns (its archived progress and attempted routes). `applied:true` is the seam\'s own statement that it used the resume it was given'
        }
        if (c.offered === null) {
          return 'NO CONTINUATION WAS POSSIBLE ON THIS TURN: nothing had been learned for this member before it (see `offered:null`), so a fresh child was necessarily started. The next turn of this member CAN continue — run one more step and read `continuation.reused`'
        }
        if (c.cause === 'resume-failed' || c.cause === 'resume-no-reply') {
          return 'THE CONTINUATION FAILED, SO THIS TURN WAS DELIVERED BY A FRESH CHILD (offered=' + String(c.offered)
            + ', ranIn=' + String(c.ranIn) + '): this is an EXPLICIT downgrade, not a silent one — cause=' + JSON.stringify(c.cause)
            + (c.hostCode ? ', hostCode=' + c.hostCode : '') + ' (the host\'s own refusal, in `why`) and `fix` names what would make the '
            + 'next turn continue. The institute kept running instead of losing the turn; the member simply has no cross-turn memory on it. '
            + 'ONE continuation failure is NOT downgraded: if the resume runs out of budget the turn FAILS by name '
            + '(`VMU_TURN_DELIVERY_TIMEOUT`, deliveryPath "continuation") instead of delivering twice, because that child may still be running'
        }
        if (c.reused === false) {
          return 'THIS TURN STARTED A FRESH CHILD INSTEAD OF CONTINUING ' + c.offered + ' (ranIn=' + String(c.ranIn) + '): the member had no cross-turn memory on this turn. `continuation.why` names who could not continue and `fix` names what would change it — read them before concluding the framework ignored the session'
        }
        return 'UNREADABLE COMPARISON: the kernel offered ' + String(c.offered) + ' but the seam reported no child id for where the turn ran, so "continued" and "started fresh" cannot be told apart from this receipt (null means NOT READABLE, never either answer)'
      })()
      if (r && r.awaiting) return { ok: true, awaiting: true, memberPrompt: r.memberPrompt || null, deliveryPath: r.deliveryPath || (r.attribution && r.attribution.deliveryPath) || null,
        instructionDelivered: r.instructionDelivered === true, receipt: null, attribution: r.attribution || null,
        toolCalls: tcs.list, toolCallsTotal: tcs.total, toolCallsTruncated: tcs.truncated,
        toolCallsScope, toolCallsNote, ...memberCallsReading,
        membersFrom: membersFromReading, delegation: r.delivery || null,
        ...selectionReadings }
      return { ok: true, ...memberCallsReading,
        // ★ LIVE RUN 19 (⑨): the awaiting receipt and the failure receipt both named `deliveryPath`, while the
        // SETTLED receipt only had it nested in `receipt.delivery`/`delegation` — the institute read that as "the
        // field does not exist" and could not compare the three cases. One name, on every shape.
        deliveryPath: deliveredThrough,
        deliveryPathMeans: deliveredThrough === null
          ? 'the delivery seam did not report a path on this receipt — null means NOT READABLE, never "nothing was delivered"'
          : (deliveredThrough === 'caller'
              ? 'the CALLING session played this member turn in this kernel (deliverByReturning), so the reply came back on the next call'
              : 'a SEPARATE kernel instance ran this member turn (path "' + String(deliveredThrough) + '"); its call list is not visible here'),
        receipt: { round: r.turn.round, member: spec.member, fields: r.fields, executed: r.executed.length,
        executedDetail: r.executed.slice(0, 5),
        executedDetailTruncated: r.executed.length > 5,
        executedMeans: EXECUTED_MEANS,
        skipped: r.skipped.length, effects: (r.effects || []).slice(), coercions: (r.coercions || []).slice(), coercionsMeans: COERCIONS_MEANS,
        // ★ PHASE 12 / live run 37 (the institute's own report): this receipt reduced `skipped` to a NUMBER, so the reason
        // and the kept line were unreadable - the member saw "skipped:1" and could not learn which field, why, or what it
        // had said. A COUNT is a diagnostic that costs nothing and tells nothing; the detail travels with it, BOUNDED.
        skippedDetail: r.skipped.slice(0, 5),
        skippedDetailTruncated: r.skipped.length > 5,
        // ★★★★★★★ ROUND 39 (live run 39 / F-10) — THE AUTHOR THE KERNEL SUPPLIED MUST TRAVEL TO THE RECEIPT.
        // The dispatch entries carry `attributedTo`/`attributionMeans`, and this receipt reduced `executed` to a COUNT —
        // the same defect family as run 37's count-only `skipped`: a mechanism that decided something and a receipt that
        // cannot name it. Present ONLY for rows whose author the kernel had to supply; empty means the reply named its
        // own author or nothing needed attributing (never that attribution was attempted and failed silently).
        attributed: (r.executed || []).filter((e) => typeof e.attributedTo === 'string').map((e) => ({ field: e.field, by: e.attributedTo })),
        attributionMeans: (r.executed || []).some((e) => typeof e.attributedTo === 'string')
          ? 'the kernel filled the author of these rows from the TURN (the tool face takes `member`; the reply channel got the same meaning instead of a second demand for the model to type its own id)'
          : null,
        notes: (r.notes || []).slice(0, 5),
        notesMean: r.notesMean || null,
        // ★ LANE turn-reply: the receipt must say WHICH CHANNEL answered ('text' | 'tool' | 'tool+text'), or a reader
        // cannot tell a legacy fenced-json round from a tool-reported one - and a mechanism whose channel is invisible in
        // its own receipt is exactly the "set a value, cannot read it back" defect this lane exists to remove.
        source: r.source || null,
        // ★ LIVE RUN 2026-10-25 (subagents mode): the round receipt could not say WHO executed the turn. The delivery seam
        // always knew ({`caller`} for a caller-played round, a child session id for a real subagent) and the turn receipt now
        // carries it - but the STEP receipt, which is what an operator actually reads, dropped it again. Same defect family
        // as run 37's count-only `skipped`: the answer existed one layer down and did not travel.
        delivery: r.delivery || null,
        proseUnparsable: r.proseUnparsable || null,
        // ★ ROUND 35 / F4: the member's own words travel to the receipt an operator actually reads. Run 35's office saw
        // `fields:[]` and `memberToolCalls:null` and could not tell "the member said nothing" from "the member said
        // something we could not use" - BAD_JSON=14 in that run. Same defect family as run 37's count-only `skipped`
        // and the run-16 delivery-path omission: the answer existed one layer down and did not travel.
        replyExcerpt: typeof r.replyExcerpt === 'string' ? r.replyExcerpt : null,
        replyLength: Number.isFinite(Number(r.replyLength)) ? Number(r.replyLength) : null,
        // ★ ROUND 67 / F-57: the two fields that DECLARE the bound must travel with it. This whitelist is exactly where
        // they died the first time — the orchestrator returned them and the step receipt rebuilt itself from a fixed key
        // list, so the live reading would have looked unchanged (the "answer existed one layer down and did not travel"
        // family this same list already has two comments about).
        replyTruncated: r.replyTruncated === true,
        replyLimitChars: Number.isFinite(Number(r.replyLimitChars)) ? Number(r.replyLimitChars) : null,
        replyExcerptMeans: typeof r.replyExcerptMeans === 'string' ? r.replyExcerptMeans : null,
        instructionDelivered: r.instructionDelivered === true, turn: r.turn.id,
        toolCalls: tcs.list, toolCallsTotal: tcs.total, toolCallsTruncated: tcs.truncated,
        toolCallsScope, toolCallsNote,
        ...memberCallsReading,
        // ★★ LIVE RUN 46 (the institute's own report, item ㉟.2/㉟.4): `membersFrom` and the delegation block were
        // built one layer down and only ever placed on the AWAITING envelope - but `deliverMode:'subagents'` settles
        // turns, so this deployment's step receipt never returned an awaiting envelope and the two readings were
        // unreachable in the very mode they describe. Same defect family as run 37's count-only `skipped`.
        membersFrom: membersFromReading, delegation: r.delivery || null },
        ...selectionReadings }
    } catch (e) {
      return stepFailure(e)
    }
  }

  return {
    // ★ RULE (v5r 运行规则 · 会议只能由院士召开/关闭，院士作为主持并自组织会议进行): a chair-gated act must be able to
    // answer "did the chair itself ever take a turn?" — the kernel can only verify what it recorded, so the COUNT is
    // exposed here and `meetings.js` turns it into a named refusal when the institution requires it.
    memberTurnCount: (memberId) => { let n = 0; for (const t of turns.values()) if (String(t.member) === String(memberId)) n++; return n },
    open, assemble, deliver: deliverTurn, parse, plan, apply, run, nextTurn, drive, step,
    dispatch, whenIdle, dispatchStatus,
    // ★★★ ROUND 73: THE CALLER-PLAYED TURN. When the injected seam is `deliverByReturning`, the assembled prompt
    // travels back to the caller and the member's reply arrives through this verb. A seam without `supply` refuses by
    // name rather than dropping the reply, because silently discarding an answer is the one outcome this phase has
    // ruled out everywhere else.
    // ★★★ THE CALLER MUST BE ABLE TO SAY WHOSE REPLY THIS IS. Measured on a full live run: the caller played member m1, returned
      // m1's reply, and the very next receipt read {"round":2,"member":"m2","turn":"t-2","executed":0} - the vote was recorded against
      // the NEXT member, and the real voter was then reported missing. The attribution below (`delivered.forMember`) was the right
      // mechanism, but nothing could ever fill it because this seam accepted only the text. An optional second argument lets the
      // caller name the member the pending prompt belonged to; omitting it keeps the old behaviour byte for byte.
      supplyMemberReply: (reply, forMember = null) => {
      if (!deliver || typeof deliver.supply !== 'function') {
        fail('VMU_ENGINE_UNAVAILABLE', 'this delivery seam does not accept a caller-supplied reply',
          'supplyMemberReply applies only to the deliverByReturning seam; a real delivery seam answers with the reply itself')
      }
      deliver.supply(reply)
      return { ok: true, supplied: true }
    },
    /**
     * ★★★★★★★ LANE turn-reply — THE TOOL CHANNEL'S VERBS, right next to the text channel's `supplyMemberReply`.
     * `supplyStructuredReply(report)` records ONE report against the OPEN member turn and answers with a READBACK (the
     * slot as it really stands); `completeStructuredReply()` dispatches it for the turn it answers - `step` and `drive`
     * call that automatically, so a caller normally never needs it; `structuredReply()` reads the slot without consuming
     * it. Kept together so "who may report, and how a report gets applied" has one place to read.
     */
    supplyStructuredReply,
    completeStructuredReply: () => completeStructuredReport(),
    structuredReply: pendingStructuredReport,
    awaitingCaller: () => !!(deliver && typeof deliver.pending === 'function' && deliver.pending()),
    // ROUND 4 / F9+F10: the ongoing-command verbs, plus the observable state behind them.
    sendToMember, interruptMember,
    attribution: () => Object.assign({}, lastAttribution),
    /**
     * ★ LIVE RUN 51 item 3: READ BACK AN ASSEMBLED PROMPT BY TURN ID. The archive is written on every delivery path,
     * so an activation (child-session) turn is readable here just like a caller-played one. `null` when the turn is
     * not retained - the caller then names the retained ids with `promptTurns()` instead of guessing.
     */
    promptOf: (turnId) => {
      const id = turnId === undefined || turnId === null ? null : String(turnId)
      if (id === null) return null
      const hit = promptArchive.get(id)
      return hit ? Object.assign({}, hit) : null
    },
    promptTurns: () => Array.from(promptArchive.keys()),    memberSession: (member) => memberSessions.get(String(member)) || null,
    // ★ F-115a: which member ran in this child session? `null` is a real answer (root/office session, or a child this
    // kernel never learned). Read from the LOCAL map first; the kernel may also fill it from the shared fold.
    memberBySession: (sessionId) => sessionOwners.get(String(sessionId)) || null,
    memberSessionPairs: () => Array.from(sessionOwners.entries()).map(([session, member]) => ({ session, member })),
    restoreMemberSessions: (rows) => {
      let restored = 0
      for (const row of Array.isArray(rows) ? rows : []) {
        if (!row || typeof row.session !== 'string' || row.session === '' || typeof row.member !== 'string' || row.member === '') continue
        sessionOwners.set(row.session, row.member)
        restored += 1
      }
      return { ok: true, restored }
    },
    setVisibleToolsProvider: (fn) => { visibleToolsFor = typeof fn === 'function' ? fn : null; return { ok: true, installed: typeof visibleToolsFor === 'function' } },
    /** ★ PHASE 7: ask what a member can REALLY see. No provider / no answer is a NAMED refusal, not []. */
    visibleToolsOf: (member) => {
      if (typeof visibleToolsFor !== 'function') {
        fail('VMU_ENGINE_UNAVAILABLE', 'this loop has no visible-tools provider',
          'the host adapter installs it (kernel.turn.setVisibleToolsProvider); a kernel alone cannot read a host tool table')
      }
      const names = visibleToolsFor(String(member))
      if (!Array.isArray(names)) {
        fail('VMU_ENGINE_UNAVAILABLE', 'the visible-tools provider returned ' + (names === null ? 'null' : typeof names) + ' for member ' + String(member),
          'the provider must return an array of tool names or throw a named refusal')
      }
      return { ok: true, member: String(member), tools: names.slice() }
    },
    seams: () => ({ deliver: typeof deliver === 'function', sendMessage: typeof sendMessage === 'function', interrupt: typeof interrupt === 'function' }),
    /**
     * ROUND 384 - a ONE-SHOT notice for a member (docs/26 section 3.25). Queued here, drained by the next assembly
     * addressed to them, so it is announced exactly once: not repeated every round and never dropped. The charter
     * carries the wording of such a line; this queue carries the timing.
     */
    notify: (memberId, line) => queueNotice(memberId, line),
    /** Drain a member queued notices. The assembly calls this, which is what makes the announcement one-shot. */
    takeNotices: (memberId) => drainNotices(memberId),
    /** ★ PHASE 8: record a closure vote through the SAME writer the reply path uses. */
    recordClosureVote: (memberId, solved, source = 'reply') => recordClosureVote(memberId, solved, source),
    status: ({ roster = [], may = null, permission = 'vote' } = {}) => ({ apiVersion, dispatch: dispatchStatus(), turns: turns.size, fields: known.length, owners, policy: POLICY, woken: Object.fromEntries(woken), counts: { ...counts }, lastRefusal: { ...lastRefusal },
      // ★★ ROUND 57 (F-41b): THE TURN ENGINE KEEPS ONE ATTRIBUTION SLOT, AND NO READER COULD SEE EVEN THAT ONE. The
      // orchestrator has always computed `lastAttribution` (who the most recent delivery went to, why it was delivered
      // and how) - it is what the receipt's `delivery` block copies - but `status` never included it, so an operator
      // asking "who did the last turn go to?" got counts and a per-member wake tally and nothing about the SLOT.
      // Named `slot:'single'` and said in `attributionMeans`, because a reader who assumes per-member history will
      // misread the one record that exists as if it were the latest of many.
      lastAttribution: Object.assign({}, lastAttribution, { slot: 'single', member: lastAttributionMember }),
      attributionMeans: 'the turn engine keeps ONE attribution slot: lastAttribution describes the MOST RECENT delivery only, not every member\'s last turn. Per-member history is not retained here - `woken` and `counts` are tallies, and `memberSessions` maps a member to the child session that played its last turn',
      memberSessions: Object.fromEntries(memberSessions),
      // ★★★ ROUND 50: THE READING AN OPERATOR WAS MISSING. Sixty-one meetings ran with no way to see that the one
      // field which closes the institute had never been emitted. `missing` names WHO, because silence is what blocks
      // closure and "somebody did not vote" is not actionable.
      // ★ the raw per-member judgements, so a caller that owns the roster (the kernel) can run the predicate itself
      closureVoteVotes: closureVotes,
      closureVoteWrites,
      solvedThisRound: Object.fromEntries(solvedThisRound),
      closureVote: closureVoteOf({ votes: closureVotes, roster, may, permission }) }),
  }
}

/**
 * ★★ LIVE RUN 13 (the institute's own report, ⑦.3 + item 1): WHAT A CALLER'S SELECTION DID, in one pure function so the
 * receipt's promise can be asserted without a live host. Three facts: (a) `pending` names the unanswered prompt the caller
 * is holding (the round that is about to be superseded, if any); (b) `selectionIgnored` appears ONLY when the caller gave
 * an explicit selection AND that held prompt's member is not in it - i.e. exactly when the call drops a pending turn; (c)
 * `superseded` names the dropped turn, because 'the round vanished' is the one outcome this phase rules out everywhere.
 * When NO selection was given nothing is ignored: the default-roster route is not a caller asking for somebody.
 */
// ★ PHASE 12 / live run 35 item ② (first half): DOES THIS REPLY FIELD HAVE THE OBJECT IT NEEDS? `say` is dispatched to
// the meetings face's `speak`, and the prompt offers `{"say":"…"}` as its minimal receipt - so a member following the prompt in a
// turn with NO meeting used to send the kernel into the meeting service with `meeting: undefined`, where it threw
// `VMU_NO_SUCH_OBJECT "no such meeting: undefined"` AND THAT THROW ENDED THE HELD TURN. The decision is a pure function so
// it can be asserted without a live host; `apply()` is its only caller and consults it before touching any face.
export const hasMeetingRef = (payload) =>
  !!(payload && payload.meeting !== undefined && payload.meeting !== null && payload.meeting !== '')

export const dispatchSkipReason = (d, opts = null) => {
  if (!d || typeof d !== 'object') return null
  // RUN 145 / audit14 C-2 (+ audit12 G14): A MOTION NEEDS A MEETING, AND IT USED TO DESTROY THE TURN INSTEAD.
  // `propose_meeting`, `motion`, `proposal` and `propose_verify` all map to `vmu.meetings.motion`, and the catalogue
  // tells a member they are meeting-round fields - but an ordinary round dispatched them anyway, the meeting face threw
  // `VMU_NO_OPEN_MEETING`, and `apply()` re-mapped that throw and re-raised it: the reply was lost and receipt=null.
  // The same object-requirement rule as `say` below applies: no meeting bound => skip BY NAME, keep the line in `notes`.
  // ★ 用户裁决 B 第 2 步：会议**绑定**在时，「这句话没有会议可依附」不再成立 —— KERNEL 会把 meeting/member/text 补齐，
  // 所以这条跳过必须让路；没有绑定才跳过（旧行为一字不改）。
  const bound = opts && opts.boundMeeting !== undefined && opts.boundMeeting !== null && String(opts.boundMeeting).trim() !== ''
  if (!bound && d.face === 'vmu.meetings' && d.op === 'motion' && !hasMeetingRef(d.payload)) {
    return {
      reason: 'no-meeting-bound',
      note: 'this reply carries no meeting, so a motion/proposal has nothing to attach to: the field is skipped by name (nothing was proposed), the turn completes, and the line is KEPT - see `notes` for this round. A meeting ROUND is not enough: the reply channel carries no meeting id and a seat cannot bind one from the reply, so move it with the tool `vibe_v5_motion { meeting, kind, text }`, or put `{meeting, member, text}` in the payload',
    }
  }
  if (!bound && d.face === 'vmu.meetings' && d.op === 'speak' && !hasMeetingRef(d.payload)) {
    return {
      reason: 'no-meeting-bound',
      note: 'this reply carries no meeting, so a speech has nothing to attach to (the prompt allows `say` as the explanation for speech already made through vibe_v5_say); the line is KEPT, see `notes`',
    }
  }
  return null
}

// ★★★ RUN 142 / audit10 C2: WHAT THE `record` REPLY FIELD MEANS, SAID ONCE. `vmu.library.record` is
// `record(member, track, text)` (kernel/library.js:427) and appends ONE line to `Members/<member>/Progress/<track>.md`.
// Record CARDS are NOT a reply field: they are `vmu.library.append` (kernel/library.js:334), written through the pack
// tools `vibe_v5_record_proposition` / `_method` / `_subproblem`. The reply field used to promise the card array while the
// dispatch loop handed the payload object to `record` as its `track`, so the promise was unreachable.
export const RECORD_LOG_MEANS = 'the `record` reply field is ONE research-log line: {track,text} is dispatched as vmu.library.record(member, track, text) and appended to Members/<member>/Progress/<track>.md. It is NOT the record-card route - cards are vmu.library.append, written by the tool vibe_v5_record_proposition (or _method / _subproblem)'

const describeReplyShape = (v) => {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array(' + v.length + ')'
  if (typeof v === 'string') return 'string(' + v.length + ' chars)'
  if (typeof v === 'object') {
    let keys
    try { keys = Object.keys(v) } catch { keys = [] }
    return 'object{' + keys.slice(0, 8).join(', ') + (keys.length > 8 ? ', …' : '') + '}'
  }
  return typeof v
}

/**
 * ★★★ RUN 142 / audit10 C2 - THE ADAPTER THAT MAKES THE DOCUMENTED `record` FIELD REACHABLE.
 * Input: the reply payload (`{track,text}` per the prompt), the member whose turn it is, and the declared tracks (for the
 * hint only). Output: either `{ok:true,args:[member,track,text]}` for the dispatch loop, or a named refusal shape
 * `{ok:false,reason:'record-shape',code:'VMU_RECORD_SHAPE',missing,message,hint}` that the loop records as a SKIPPED row
 * (`reason:'record-shape'`, `code:'VMU_RECORD_SHAPE'`) instead of throwing the whole turn away. Pure, so the promise is
 * assertable without a live host - the same discipline as `dispatchSkipReason`, and `apply()` is its only caller.
 */
export const recordLogArgs = (payload, memberId = null, declaredTracks = null) => {
  const member = memberId === null || memberId === undefined || String(memberId).trim() === '' ? null : String(memberId)
  const trackHint = Array.isArray(declaredTracks) && declaredTracks.length
    ? 'one of: ' + declaredTracks.join(' | ')
    : 'a track NAME declared in vmu.records.tracks'
  const hint = 'send { record: { track: "<' + trackHint + '>", text: "<one line>" } } — the track is the NAME of the list, never the payload object; this appends to Members/<you>/Progress/<track>.md (vmu.library.record). Record CARDS are not a reply field: use the tool vibe_v5_record_proposition / vibe_v5_record_method / vibe_v5_record_subproblem (vmu.library.append)'
  const missing = []
  const problems = []
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    missing.push('track', 'text')
    problems.push('the field holds ' + describeReplyShape(payload) + ' instead of an object')
  } else {
    if (typeof payload.track !== 'string' || payload.track.trim() === '') {
      missing.push('track')
      problems.push('track is ' + (typeof payload.track === 'string' ? 'empty' : describeReplyShape(payload.track)))
    }
    if (typeof payload.text !== 'string') {
      missing.push('text')
      problems.push('text is ' + describeReplyShape(payload.text))
    }
  }
  if (member === null) {
    missing.push('member')
    problems.push('this turn has no member, so the log line would have no owner')
  }
  if (missing.length) {
    return {
      ok: false,
      reason: 'record-shape',
      code: 'VMU_RECORD_SHAPE',
      missing,
      message: 'the record reply field needs {track,text}: ' + problems.join('; '),
      hint,
    }
  }
  return { ok: true, args: [member, payload.track, payload.text], member, track: payload.track }
}

/**
 * RUN 145 / audit14 C-1 - THE `task_create` REPLY FIELD MUST DELIVER WHAT ITS LINE TAUGHT.
 *
 * MEASURED DEFECT: the live catalogue line said `{title,description,blocked_by?,write_scopes?}` (compact AND full, every
 * seat, every round), while the dispatch handed the payload object straight to `vmu.tasks.create` - whose real signature
 * is `create({title,objective,owner,deps,priority,writeScopes})`. The three extra keys were therefore DROPPED SILENTLY: a
 * real turn created the task with `deps:[]` and `writeScopes:[]`, `ready:true` for a task whose declared prerequisite
 * existed, and no refusal, no note. The tool route (`kit/extras.js` `toolTaskCreate`) mapped all three correctly, which
 * is what made this a reply-path-only break.
 *
 * The adapter supplies the real names, and - unlike the old dispatch - an UNKNOWN key is not dropped: it is a NAMED
 * skip (`reason:'task-create-shape'`, `code:'VMU_INVALID_ARGUMENT'`) with the accepted-key list in the hint, so the
 * turn survives and the sender learns which key the field cannot carry.
 */
export const taskCreateArgs = (payload) => {
  const ACCEPTED = ['title', 'description', 'blocked_by', 'write_scopes']
  const hint = 'send { task_create: { title: "<what the task is>", description?: "<objective>", blocked_by?: ["<task id>"], write_scopes?: ["<path prefix>"] } } - the core field carries these four keys only (kernel.tasks.create reads title/objective/deps/writeScopes); to pass owner/priority use the tool face vibe_v5_task_create { subject, description?, owner?, blocked_by?, write_scopes?, priority? }'
  const missing = []
  const problems = []
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    missing.push('title')
    problems.push('the field holds ' + describeReplyShape(payload) + ' instead of an object')
  } else {
    const unknown = Object.keys(payload).filter((k) => ACCEPTED.indexOf(k) < 0)
    if (unknown.length) {
      problems.push('unknown key(s) ' + unknown.join(', ') + ' (accepted: ' + ACCEPTED.join(', ') + ')')
      for (const k of unknown) missing.push(k)
    }
    if (typeof payload.title !== 'string' || payload.title.trim() === '') {
      missing.push('title')
      problems.push('title is ' + describeReplyShape(payload.title))
    }
    if (payload.description !== undefined && typeof payload.description !== 'string') {
      missing.push('description')
      problems.push('description is ' + describeReplyShape(payload.description))
    }
    const isStrArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim() !== '')
    if (payload.blocked_by !== undefined && !isStrArray(payload.blocked_by)) {
      missing.push('blocked_by')
      problems.push('blocked_by is ' + describeReplyShape(payload.blocked_by) + ' instead of an array of task ids')
    }
    if (payload.write_scopes !== undefined && !isStrArray(payload.write_scopes)) {
      missing.push('write_scopes')
      problems.push('write_scopes is ' + describeReplyShape(payload.write_scopes) + ' instead of an array of path prefixes')
    }
  }
  if (missing.length) {
    return { ok: false, reason: 'task-create-shape', code: 'VMU_INVALID_ARGUMENT', missing,
      message: 'the task_create reply field cannot be dispatched: ' + problems.join('; '), hint }
  }
  const created = { title: payload.title }
  if (payload.description !== undefined) created.objective = payload.description
  if (payload.blocked_by !== undefined) created.deps = payload.blocked_by
  if (payload.write_scopes !== undefined) created.writeScopes = payload.write_scopes
  return { ok: true, args: [created] }
}

// ★ PHASE 12 / live run 35 item ② (second half): WHAT A THROWING APPLY DOES TO THE HELD TURN. It consumes it and does NOT
// re-open it (the reply was partially applied, so re-opening would silently re-run those effects) - and until this
// existed, NOTHING said so: the member's next reply read `VMU_TURN_NO_PENDING_MEMBER`, i.e. "there is nothing to answer"
// while the real cause was "your last answer destroyed the turn". Pure so the promise can be asserted.
export const lostTurnState = (turn) => {
  const id = turn && turn.id !== undefined && turn.id !== null ? turn.id : (turn && turn.turnId !== undefined && turn.turnId !== null ? turn.turnId : null)
  return {
    member: String((turn && turn.member) || ''),
    turnId: id === null ? null : String(id),
    consumed: true,
    reopened: false,
    note: 'the held turn was consumed by this failed apply and is NOT re-opened; the next step starts a new turn. Fields recorded before the failing dispatch (closure vote, bookkeeping) survived.',
  }
}

/**
 * ★★★ LIVE RUN 15 (the institute's own report, item ⑦): WHOSE tool calls does a turn receipt count?
 *
 * MEASURED DEFECT: activation delivery runs the member in its own kernel instance, so the parent counted ZERO calls and
 * the receipt said `toolCalls: [], toolCallsTotal: 0` with no scope. The institute read that as 「成员没有干活」 and
 * reported the whole turn as not-real, while the child session had in fact made thousands of calls. An empty list is a
 * CLAIM; this one was false in the only mode where anyone reads it.
 *
 * The fix keeps the count (it is honest about THIS kernel) and names its SCOPE, so the number can never again be read as
 * a statement about the child. Exported and pure for one reason: every branch is reachable from a unit test — the
 * "a branch no test can reach is a branch nobody has checked" rule this repository applies everywhere else.
 *
 * @param {string|null} deliveryPath `r.delivery.path` — 'caller' | 'one-shot' | 'activation' | 'continuable' | null
 */
export const toolCallsScopeOf = (deliveryPath) => {
  const path = typeof deliveryPath === 'string' && deliveryPath !== '' ? deliveryPath : null
  if (path === null) {
    return { scope: 'member-kernel', note: 'deliveryPath is absent on this receipt, so the count cannot be attributed to a kernel; treat it as "this kernel saw N calls" rather than as the member\'s own total' }
  }
  if (path === 'caller') {
    return { scope: 'member-kernel', note: null }
  }
  return {
    scope: 'parent-kernel',
    note: 'THESE COUNTS ARE THIS KERNEL\'S OWN AND ARE NOT EVIDENCE ABOUT THE MEMBER\'S WORK: delivery.path="' + path + '" ran the member in a separate kernel instance (delivery.childId), so calls it made there are invisible here. Read the child session log for its call list; an empty list here does not mean the member did nothing',
  }
}

export const selectionReadingsOf = (heldPrompt, explicitIds) => {
  const ids = Array.isArray(explicitIds) ? explicitIds.map(String) : []
  const heldMember = heldPrompt && typeof heldPrompt.member === 'string' && heldPrompt.member !== '' ? heldPrompt.member : null
  const heldTurn = heldPrompt && heldPrompt.turnId !== undefined && heldPrompt.turnId !== null ? heldPrompt.turnId : null
  const dropped = heldMember !== null && ids.length > 0 && !ids.includes(heldMember)
  return {
    pending: heldMember === null ? null : { turn: heldTurn, member: heldMember },
    // ★★ LIVE RUN 28 observation 2 (the institute's own report): `awaiting:true` sat beside `"pending":null` and the reader
    // had to work out that the two describe different turns. `pending` is the prompt the CALLER is still holding (the one a
    // later call would supersede); the round this call actually returns is named by `memberPrompt.turnId`. The field stays
    // null when nothing is held - that is what makes the pair look contradictory - so the definition travels with it.
    pendingMeans: 'the unanswered prompt YOU are holding (a turn a later call would supersede); it is NOT the round this call returns - that round is named by memberPrompt.turnId (null means you hold no unanswered prompt)',
    selectionApplied: dropped ? false : true,
    selectionIgnored: dropped
      ? { requested: ids, pending: heldTurn, pendingMember: heldMember,
          reason: 'an unanswered prompt for ' + heldMember + ' is still held by the caller: `members` selects who receives the NEXT prompt, so this call drops that pending turn' }
      : null,
    superseded: dropped ? { turn: heldTurn, member: heldMember } : null,
  }
}

export default createTurnOrchestrator








