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
const NO_REPLY_MEETING_SHAPE = Object.freeze({
  code: 'VMU_TURN_FIELD_NOT_APPLICABLE',
  message: 'this reply field carries no meeting reference, so the framework cannot dispatch it without inventing one',
  hint: 'use the meeting tool face: vibe_vmu_meeting { action: "hand" | "hands" | "invite", id: "<meeting id>", ... } — the actor and the meeting are explicit there, and the chair rail applies to an invitation',
})

export const FIELD_OWNERS = Object.freeze({
  say: Object.freeze({ face: 'vmu.meetings', op: 'speak' }),
  progress: Object.freeze({ face: 'vmu.records', op: 'put' }),
  record: Object.freeze({ face: 'vmu.library', op: 'record' }),
  propose_verify: Object.freeze({ face: 'vmu.meetings', op: 'motion' }),
  verdict: Object.freeze({ face: 'vmu.ballotbox', op: 'cast' }),
  task_create: Object.freeze({ face: 'vmu.tasks', op: 'create' }),
  task_update: Object.freeze({ face: 'vmu.tasks', op: 'transition' }),
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
  convene_meeting: Object.freeze({ face: 'vmu.meetings', op: 'open' }),
  task_claim: Object.freeze({ face: 'vmu.tasks', op: 'transition' }),
  task_done: Object.freeze({ face: 'vmu.tasks', op: 'transition' }),
  assign: Object.freeze({ face: 'vmu.tasks', op: 'assign' }),
  nudge: Object.freeze({ face: 'vmu.meetings', op: 'warn' }),
  reject_assign: Object.freeze({ face: 'vmu.meetings', op: 'speak' }),
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
        : (missing.length ? 'silence blocks closure; no judgement yet from: ' + missing.join(', ') : 'a member judged the question NOT solved: ' + against.join(', '))),
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
 * Build the face map from a kernel service bag, taking ONLY the operations the catalogue names - and taking them by
 * their real method names. A face the bag does not carry is simply absent from the map, so the dispatcher will report
 * the field as not executed rather than call something invented.
 */
export function facesFrom(services = {}, owners = FIELD_OWNERS) {
  const map = {}
  for (const owner of Object.values(owners)) {
    if (!owner || !owner.face || !owner.op) continue
    const bag = services[owner.face] !== undefined ? services[owner.face] : services[String(owner.face).replace(/^vmu\./, '')]
    const instance = typeof bag === 'function' ? (() => { try { return bag({}) } catch { return null } })() : bag
    if (!instance || typeof instance[owner.op] !== 'function') continue
    if (!map[owner.face]) map[owner.face] = {}
    map[owner.face][owner.op] = instance[owner.op].bind(instance)
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

export function deliverViaSubagents(subagents, extract = null, { provider = null, parent = null, signal = null, options = null, delay = null } = {}) {
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
  return async ({ turn, text, child }) => {
    // ROUND 346: the spec carries the SAME three elements the original's wake carries - who, why, and what next -
    // because a host that only receives "here is some text" cannot supervise the turn it just started. Measured
    // against the original: its wake takes { to, why, next_step }, so the framework labels its own the same way.
    const spec = {
      label: 'vmu-turn-' + String(turn && turn.id ? turn.id : 'unknown'),
      to: turn && turn.member ? turn.member : null,
      why: turn && typeof turn.why === 'string' ? turn.why : null,
      next_step: turn && typeof turn.nextStep === 'string' ? turn.nextStep : null,
      request: { prompt: [{ type: 'text', text: String(text) }] },
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
      if (oneShot) {
        return subagents.start(provider, Object.assign({ label: spec.label, prompt: spec.request.prompt, parent, signal, options: options || {} }, spec.oneShotRequest || {}))
      }
      if (canActivate) {
        return subagents.startActivation(Object.assign({
          provider: String(provider),
          label: spec.label,
          request: Object.assign({ prompt: spec.request.prompt, parent, signal }, spec.oneShotRequest || {}),
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
    // ★★★★★★★ PHASE 6: AN ACTIVATION IS NOT A HANDLE - IT MUST BE AWAITED AND DISPOSED, AND ITS TEXT LIVES IN `output`.
    //   SubagentActivation = { childId, messageId?, result: Promise<SubagentResult>, dispose() }
    //   SubagentResult     = { output: ContentBlock[], structured?, diagnostic?, stopReason }
    // None of the handle-shaped readings below (`handle.reply` / `handle.text` / `handle.result`) apply - a
    // SubagentResult carries no `reply`/`text` field, only content blocks - so this path is handled here and returns.
    // dispose() runs on the FAILURE path too: an undisposed activation holds an execution handle open, which is
    // exactly the leak that later surfaces as "the host refuses to admit a new activation".
    if (path === 'activation') {
      const activation = handle
      const disposeOnce = async () => {
        try { if (activation && typeof activation.dispose === 'function') await activation.dispose() } catch { /* a failed dispose must not lose the reply */ }
      }
      let res = null
      try {
        res = activation && activation.result ? await activation.result : null
      } catch (e) {
        await disposeOnce()
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'the host activation for this member turn failed: ' + String((e && e.message) || e),
          'the activation was started and then disposed; the failure came from the child run itself, not from the delivery (docs/26 stage 3)', e)
      }
      await disposeOnce()
      reportPhase('result-returned')
      const activationReply = textOfContentBlocks(res && res.output)
      if (activationReply === null) {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'the host accepted the activation but the child returned no text',
          'stopReason=' + String(res && res.stopReason) + ' diagnostic=' + String(res && res.diagnostic) + '; an activation that returns structure without text is a contract mismatch, not an empty answer')
      }
      return {
        reply: activationReply,
        childId: (activation && (activation.childId || activation.id)) || null,
        stopReason: res && typeof res.stopReason === 'string' ? res.stopReason : null,
        structured: res && res.structured !== undefined ? res.structured : null,
        attribution: 'activation: reply read from result.output, then dispose() called on the activation',
        deliveryPath: 'activation',
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
    return subagents.sendMessage(sender, targetId, blocks, signal ? { signal } : {})
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
const composeStatusBlock = (turn) => {
  if (!turn || typeof turn !== "object") return ""
  const who = turn.roleLabel ? String(turn.roleLabel) + "「" + String(turn.member) + "」" : String(turn.member)
  const round = turn.round ? "；本轮是第 " + String(turn.round) + " 轮" : ""
  const phase = turn.phase ? "（阶段：" + String(turn.phase) + "）" : ""
  const lines = ["[状态] 你是 " + who + round + phase + "。"]
  if (typeof turn.roster === "string" && turn.roster.trim() !== "") lines.push("", "[在册]", turn.roster)
  if (turn.quorum !== null && turn.quorum !== undefined && Number.isFinite(Number(turn.quorum))) {
    lines.push("", "[表决] 法定票数 m = " + String(Number(turn.quorum)) + "。")
  }
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
  turnFacts = null } = {}) {
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
  const counts = { opened: 0, assembled: 0, delivered: 0, parsed: 0, refused: 0, dispatched: 0, notExecuted: 0 }
  const lastRefusal = { code: null, message: null }
  // ROUND 4 / F11: the attribution of the MOST RECENT delivery (`childId` + `stopReason`), so a caller can ask who a
  // receipt belongs to without re-reading the host handle.
  let lastAttribution = { childId: null, stopReason: null, deliveryPath: null, attribution: 'no turn has been delivered yet' }
  const memberSessions = new Map()
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

  const fail = (code, message, hint) => { counts.refused += 1; lastRefusal.code = code; lastRefusal.message = message; throw refuse(code, message, hint) }

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
    const statusWithNotices = suppliedStatus !== "" ? suppliedStatus : composeStatusBlock(turn)
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

  /** ③ deliver through the adapter seam. A missing adapter is refused, never faked. */
  const deliverTurn = async (turn, text) => {
    if (typeof deliver !== 'function') {
      fail('VMU_ENGINE_UNAVAILABLE', 'no delivery adapter is wired: refusing rather than pretending the member answered',
        'inject { deliver: async ({ turn, text }) => reply } (docs/26 §2 stage 3)')
    }
    const delivered = await deliver({ turn, text })
    counts.delivered += 1
    // ROUND 4 / F11: the adapter may hand back a BARE STRING (the pre-round-4 contract) or the attributed envelope
    // `{ reply, childId, stopReason, attribution }` that `deliverViaSubagents` now produces. A bare string is accepted
    // and NAMED as unattributed - the loop never invents a child id or a stop reason.
    if (typeof delivered === 'string') {
      lastAttribution = { childId: null, stopReason: null, deliveryPath: null, attribution: 'the delivery adapter returned a bare string: no childId/stopReason (docs/26 §3.22)' }
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
      return { awaiting: true, memberPrompt: (delivered && delivered.memberPrompt) || null, reply: null, deliveryPath: 'caller' }
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
    }
    if (lastAttribution.childId && turn && typeof turn.member === 'string') memberSessions.set(turn.member, lastAttribution.childId)
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
  const supplyStructuredReply = (fields, { forMember = null } = {}) => {
    const obj = fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : null
    if (!obj) {
      fail('VMU_INVALID_ARGUMENT', 'a structured report must be an object of reply fields, not ' + (fields === null ? 'null' : typeof fields),
        'pass the report as an object: { say: "…" } — fields: ' + known.concat(RECORDED_FIELDS).join(', '))
    }
    const open = openTurnForReport()
    if (!open) {
      fail('VMU_TURN_NO_PENDING_MEMBER', 'no member turn is open, so there is nothing for this report to answer',
        'report while the turn is open: a step returns `awaiting:true` + memberPrompt, and this report answers THAT prompt before the next step; the fenced-json compatibility path is vibe_vmu_turn { op:"step", reply:"<one fenced json object>" }')
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
    const recorded = { reply: {}, member: open.member, turnId: open.turnId, via: open.via, ignoredFields: unknown.slice(), at: clock() }
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
          ? 'the reply carries braces but they do not hold valid json (也没有可用的工具汇报), so there is nothing to apply'
          : '本回合既没有工具汇报、也没有可解析的围栏 JSON（neither a tool report nor a usable json object), so there is nothing to apply',
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
    if (source === 'tool') toolVotedThisTurn.add(id)
    closureVotes.set(id, value)
    closureVoteWrites += 1
    // R11: the effect is recorded HERE so BOTH channels (reply field and `vibe_vmu_vote`) land in one list.
    turnEffects.push({ kind: 'closure-vote', member: id, solved: value, source })
    return { ok: true, member: id, solved: value }
  }

  const apply = async (reply, faceMap = null, memberId = null) => {
    const map = faceMap || faces
    const r = reply && typeof reply === 'object' ? reply : {}
    const bookkeeping = []
    turnEffects.length = 0   // R11: effects are per-apply, never accumulated across turns
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
      if (memberId !== null && r.vote_solved !== undefined && r.vote_solved !== null) {
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
          recordClosureVote(memberId, rawVote === true || rawVote === 'true')
        }
      }
      if (bookkeeping.some((b) => b.field === field)) continue
      context.set(field, r[field])
      bookkeeping.push({ field, kept: true })
    }
    if (bookkeeping.length) counts.bookkept = (counts.bookkept || 0) + bookkeeping.length

    const dispatches = plan(reply)
    const executed = []
    const skipped = []
    for (const d of dispatches) {
      if (d.notApplicable) {
        counts.notExecuted += 1
        skipped.push({ field: d.field, face: d.face, op: d.op, reason: 'no-supported-shape', code: d.notApplicable.code, hint: d.notApplicable.hint })
        continue
      }
      // ★ PHASE 12 / run 35 item 2: A REPLY FIELD CAN REQUIRE AN OBJECT THE TURN DOES NOT HAVE. `say` maps to
      // `vmu.meetings.speak`, and the prompt tells a member they may keep one line of explanation in the receipt after
      // speaking through `vibe_v5_say` - so a member following the prompt's own example writes `{"say":"…"}` in a turn
      // that has NO meeting bound. The dispatch used to be attempted anyway and the KERNEL threw
      // `VMU_NO_SUCH_OBJECT "no such meeting: undefined"` from deep inside the meeting service; that throw then ended
      // the held turn, and the member's next reply read `VMU_TURN_NO_PENDING_MEMBER` - i.e. copying the prompt's example
      // cost them their turn, with nothing saying why. Here the field is SKIPPED BY NAME instead (the reason is a pure
      // function so the promise is assertable without a live host): nothing is pretended to have happened, the turn
      // still completes, and the receipt says which field was dropped and why.
      const skipReason = dispatchSkipReason(d)
      if (skipReason !== null) {
        counts.notExecuted += 1
        skipped.push({ field: d.field, face: d.face, op: d.op, reason: skipReason.reason, note: skipReason.note })
        continue
      }
      const face = map[d.face]
      const fn = face && typeof face[d.op] === 'function' ? face[d.op] : null
      if (!fn) {
        counts.notExecuted += 1
        skipped.push({ field: d.field, face: d.face, op: d.op, reason: 'face-not-wired' })
        continue
      }
      let res
      try {
        res = await fn(d.payload, { field: d.field, face: d.face, op: d.op })
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
      executed.push({ field: d.field, face: d.face, op: d.op, result: res })    }
    // ROUND 394: the remaining recorded fields used to be RECOGNISED AND THEN DISCARDED - a model that wrote prioritize,
    // hire or fire had its payload vanish with no trace, which is the silent-failure class this repository refuses.
    // Each one is now kept on the turn state under its own name and reported in the receipt, so the framework can read
    // it and a consumer can see that it arrived. No face is invented for them: the members service is not even present
    // in a default kernel, and sending a payload to an operation that does not exist would be worse than keeping it.
    return { ok: true, executed, skipped, planned: dispatches.length, bookkeeping, effects: turnEffects.slice() }
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
    } catch { /* diagnostics must not replace the refusal */ }
    return e
  }

  /**
   * ★★★★★★★ THE ONE TAIL BOTH CHANNELS SHARE: ignored-field notice, the `turn/reply-parsed` hook (and its rewrite), the
   * dispatch, and one notice per refused field. `parsed` is `{ reply, fields, ignoredFields?, source }`; `source` is
   * carried onto the receipt and into the bus payload, so a reader can tell WHICH channel produced a field.
   */
  const dispatchReply = async ({ turn, parsed, attributedTo, rawText }) => {
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
      out = await apply(parsed.reply, null, attributedTo || turn.member)
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
    try { text = parse(raw) } catch (e) {
      // A report already covers this turn: prose is case 1 (`textIgnored`), not a second truth - refusing it would punish
      // a member for explaining itself. A brace span that DOES NOT PARSE is different: the member tried to send a json
      // report the kernel cannot read, and silently keeping the tool half would hide a broken second channel.
      if (e && e.code === 'VMU_TURN_BAD_JSON') throw attachReplyDiagnostics(e, raw)
      text = null
    }
    if (!text) {
      return { reply: Object.assign({}, report.reply), fields: Object.keys(report.reply), ignoredFields: report.ignoredFields.slice(), source: 'tool', textIgnored: true }
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
      const raw = await deliverTurn(turn, asm.text)
      // ★★★ ROUND 73: A CALLER-PLAYED TURN RETURNS EARLY, AND THAT IS NOT A FAILED ROUND. The seam handed the assembled
      // prompt back to the calling session and deliberately has no reply yet; parsing `null` would turn the one route that
      // needs no host Agent into "the model said nothing". The awaiting envelope travels out with the prompt attached, so
      // the caller can play the member turn and answer on the next call.
      if (raw && typeof raw === 'object' && raw.awaiting === true) {
        return { ok: true, awaiting: true, turn, memberPrompt: raw.memberPrompt || null,
          assembled: { chars: asm.text.length, sources: asm.sources.length }, instructionDelivered: asm.instructionDelivered === true,
          fields: [], executed: [], skipped: [], refused: [],
          attribution: Object.assign({}, lastAttribution) }
      }
      // consumed once: the next turn's reply belongs to whoever it answers
      const attributedTo = lastReplyForMember
      lastReplyForMember = null
      const parsed = replyFromChannels(raw, attributedTo || turn.member)
      const tail = await dispatchReply({ turn, parsed, attributedTo: attributedTo || turn.member, rawText: raw })
      return { ok: true, turn, assembled: { chars: asm.text.length, sources: asm.sources.length }, instructionDelivered: asm.instructionDelivered === true, ...tail }
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
    const tail = await dispatchReply({ turn, parsed, attributedTo: report.member, rawText: JSON.stringify(report.reply) })
    return Object.assign({ member: report.member }, tail)
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
          ...(e && typeof e.replyText === 'string' ? { replyLength: Number.isInteger(e.replyLength) ? e.replyLength : e.replyText.length, hadBrace: e.hadBrace === true, replyExcerpt: e.replyText.slice(0, 500), trackValue: e.trackValue === undefined ? null : e.trackValue } : {}) }
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
  const nextTurn = ({ members = [], phase = 'normal', why = null, nextStep = null, role = null } = {}) => {
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
    return { id: 't-' + (turnSeq += 1), member: pick.id, role: chosenRole, phase, why, nextStep }
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
        completed = { member: done.member, fields: done.fields, executed: (done.executed || []).length, skipped: (done.skipped || []).length, effects: (done.effects || []).slice(),
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
        receipts.push({ round: i, member: spec.member, fields: r.fields, executed: r.executed.length, skipped: r.skipped.length, effects: (r.effects || []).slice(), turn: r.turn.id, source: r.source || null })
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
    return { ok: false, code: e && e.code, message: String((e && e.message) || e), receipt: null, stack,
      ...(e && typeof e.hint === 'string' ? { hint: e.hint } : {}),
      ...(e && typeof e.replyText === 'string' ? { replyLength: e.replyLength, hadBrace: e.hadBrace, replyExcerpt: e.replyText.slice(0, 500), trackValue: e.trackValue } : {}) }
  }

  /**
   * ⑧ step: EXACTLY ONE round, chosen by the policy - the shape a scheduler tick wants (docs/26 section 3.3). The
   * host owns WHEN (the clock is a seam by design: `vmu.schedule.timeSource` is tick-only), the policy owns WHO, and
   * the pipeline owns WHAT PROMPT. A round that fails is RETURNED rather than thrown, because a failed round is an
   * operational outcome; a malformed ARGUMENT still throws, because that is a programming error.
   */
  const step = async ({ members = [], phase = 'normal', why = null, nextStep = null, role = null } = {}) => {
    // (g): the selection is normalized BEFORE the branch, so an unreadable entry is refused on BOTH routes (a malformed
    // list used to be filtered only on the pending route and to fall through to the default roster everywhere else).
    const selection = normalizeMembersSelection(members)
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
        const requested = selection.map((m) => m.id)
        // ★★ PHASE 12 / R24 (the institute's own run-17 report, item 4): `selectionIgnored` carried
        // `pending:null` beside a non-null `pendingMember` on the completion route, because `r.turn` is the turn ID
        // STRING here (it comes from apply()'s tail), not an object with `.id` - so the id was silently dropped.
        // One reader for the id, and when it is genuinely unknown the receipt says so instead of leaving null.
        const completedTurnId = (() => {
          if (!r) return null
          if (typeof r.turn === 'string' && r.turn !== '') return r.turn
          if (r.turn && typeof r.turn === 'object' && r.turn.id !== undefined && r.turn.id !== null) return r.turn.id
          if (r.receipt && r.receipt.turn !== undefined && r.receipt.turn !== null) return r.receipt.turn
          return null
        })()
        // ★ LIVE RUN 9, finding A: the ledger (§33 row k) and the acceptance task file both name a structured
        // `selectionIgnored{requested,reason,pending}`, while the receipt only carried three PARALLEL scalars. The
        // agent therefore recorded "the promised reading is absent" — a doc that names a field the code never emits is
        // the same defect class as §33's `allFor`. The scalars stay (consumers exist, and they are the same facts); the
        // structured object is ADDED so the promised name resolves, with the pending turn NAMED rather than implied.
        return { ok: true, source: 'tool', completed: true,
          requestedMembers: requested,
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
          receipt: { round: r.turn && r.turn.round !== undefined ? r.turn.round : null, member: r.member, fields: r.fields,
            executed: (r.executed || []).length, skipped: (r.skipped || []).length, effects: (r.effects || []).slice(), instructionDelivered: false,
            turn: completedTurnId, source: 'tool', completed: true } }
      } catch (e) { return stepFailure(e) }
    }
    // ★ LIVE RUN 13 (the institute's own report, ⑦.3 and item 1): on THIS route two facts were unreadable. (a)
    // `selectionIgnored` existed only on the structured-report route, so a caller that passed `members` while holding an
    // unanswered prompt saw nothing at all. (b) the held prompt was superseded with no trace — the round simply vanished,
    // and `pending: null` (the field the ledger promises) could not say which turn it was. Both are named here: `pending`
    // always says which prompt the caller is holding, `selectionIgnored` appears exactly when that prompt is NOT in the
    // explicit selection (so it is about to be dropped), and `superseded` names the dropped turn instead of losing it.
    const selectionReadings = selectionReadingsOf(deliver && typeof deliver.pending === 'function' ? deliver.pending() : null, selection.map((mm) => mm.id))
    const spec = nextTurn({ members, phase, why, nextStep, role })
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
      if (r && r.awaiting) return { ok: true, awaiting: true, memberPrompt: r.memberPrompt || null, deliveryPath: r.deliveryPath || (r.attribution && r.attribution.deliveryPath) || null,
        instructionDelivered: r.instructionDelivered === true, receipt: null, attribution: r.attribution || null,
        toolCalls: tcs.list, toolCallsTotal: tcs.total, toolCallsTruncated: tcs.truncated, ...selectionReadings }
      return { ok: true, receipt: { round: r.turn.round, member: spec.member, fields: r.fields, executed: r.executed.length, skipped: r.skipped.length, effects: (r.effects || []).slice(),
        // ★ LANE turn-reply: the receipt must say WHICH CHANNEL answered ('text' | 'tool' | 'tool+text'), or a reader
        // cannot tell a legacy fenced-json round from a tool-reported one - and a mechanism whose channel is invisible in
        // its own receipt is exactly the "set a value, cannot read it back" defect this lane exists to remove.
        source: r.source || null,
        instructionDelivered: r.instructionDelivered === true, turn: r.turn.id,
        toolCalls: tcs.list, toolCallsTotal: tcs.total, toolCallsTruncated: tcs.truncated },
        ...selectionReadings }
    } catch (e) {
      return stepFailure(e)
    }
  }

  return {
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
    memberSession: (member) => memberSessions.get(String(member)) || null,
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
// `vmu.meetings.speak`, and the prompt offers `{"say":"…"}` as its minimal receipt - so a member following the prompt in a
// turn with NO meeting used to send the kernel into the meeting service with `meeting: undefined`, where it threw
// `VMU_NO_SUCH_OBJECT "no such meeting: undefined"` AND THAT THROW ENDED THE HELD TURN. The decision is a pure function so
// it can be asserted without a live host; `apply()` is its only caller and consults it before touching any face.
export const hasMeetingRef = (payload) =>
  !!(payload && payload.meeting !== undefined && payload.meeting !== null && payload.meeting !== '')

export const dispatchSkipReason = (d) => {
  if (!d || typeof d !== 'object') return null
  if (d.face === 'vmu.meetings' && d.op === 'speak' && !hasMeetingRef(d.payload)) {
    return {
      reason: 'no-meeting-bound',
      note: 'this turn has no meeting, so a speech has nothing to attach to; the line stays in the round state only (the prompt allows `say` as the explanation for speech already made through vibe_v5_say)',
    }
  }
  return null
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








